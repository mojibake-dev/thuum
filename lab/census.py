#!/usr/bin/env python3
"""The static censuses' shared reader: the deployed load order's records and scripts as derived facts (thuum ADR-068
rung 5, docs/research/rung5-quests-2026-11-09.md sections 7 and 8(a)), for lab/tools/quest-census.py and
lab/tools/ctda-vars.py. It runs where the licensed files are (sky-srv: the masters and the mod layer's plugins under
/srv/persist/esm/1.6.1170, the game's archives under /srv/persist/game, the layer under /srv/persist/mods), and what
it keeps is ids, editor ids, script, property and variable names, provenance tags and counts, never a file's bytes.

The deployed load order is the one the lab plays (docs/MODS.md):
- **Plugins.** The deploy settings' `loadOrder` (the server's), then the client-only tail of the layer's plugins.txt,
  in the engine's order: master-type plugins first, a light plugin in the FE space (lab/labapi/labapi/slots.py, the
  lab's one slot math). A form is named as skymp's FormDesc names it, its owning plugin and its local id: the top
  byte of an id inside a plugin indexes that plugin's MAST list, the file itself after its masters (UESP "Skyrim
  Mod:Mod File Format/TES4"). A later plugin's record replaces an earlier one's (the winning override); a Deleted
  record (flag 0x20) removes it.
- **Scripts.** A script's winning .pex: a loose file of the layer (mods/SHA256SUMS, each Data path once, the row a
  clone lays), else the archive loaded last that carries it (a plugin's own "<plugin>.bsa", in the plugins' order,
  after the vanilla "Skyrim - Misc.bsa", which carries the four DLCs' scripts too). This is
  the engine's documented precedence (loose over archives, a later plugin's archive over an earlier one's); no lab
  trace has read it.

The formats, each from UESP's pages ("Skyrim Mod:Mod File Format" and its QUST, VMAD Field and CTDA Field pages,
"Skyrim Mod:Compiled Script File Format"), read through lab/esm.py, lab/pex.py and lab/tools/bsa-extract.py:
- VMAD: version, object format, scripts (a status byte from version 4: 2 removed, 3 inherited and removed), each
  property by type (1 object, 2 string, 3 int, 4 float, 5 bool, 11 to 15 their arrays; an object is a form id and an
  alias id, in format 1's or format 2's order), then the record type's fragment section (QUST: its fragments and the
  alias scripts; INFO, SCEN, PACK and PERK their own).
- CTDA: operator and flags, the comparison value, the function index (uint16 at +8), param1 (+12), param2 (+16),
  run-on (+20), the reference (+24); a string parameter is the CIS1 or CIS2 zstring after it (functions 629
  GetVMQuestVariable and 630 GetVMScriptVariable: CommonLibSSE-NG include/RE/T/TESCondition.h:762-763, the variable
  name in CIS2).
- QUST aliases (libespm's QUST::Alias, the fork's libespm/include/libespm/QUST.h, which the server's quest scope
  reads): ALST a reference alias and ALLS a location alias, each to ALED; ALID its name, FNAM its flags; the fills
  ALFR (a forced reference), ALUA (a unique actor), ALCO and ALCA (a created object and where: an int16 alias id and
  a uint16 0 "at" or 0x8000 "in", xEdit's layout; `census.py alca` read the deployed order on 2026-11-09: 988 ALCAs,
  each naming one of its own quest's alias ids, 692 at and 296 in),
  ALEQ and ALEA (an external quest's alias), ALFE (an event's), and the rest kept as numbers.
- Pex: per function a linear pass that tags each value with its provenance (getplayer, prop:<name>, var:<name>,
  param:<name>, local:<name>, a literal, or the call built from those; later writes replace earlier ones and jumps
  are not followed), recording every call with its receiver's static type and its arguments' tags, every property
  set, every object variable written with what was written, and Game.GetPlayer's calls and compares.

    census.py order [--settings ...]       the deployed load order, its archives and loose scripts, by name
    census.py index [--settings ...]       builds (or reuses) the cache the tools read: counts only
    census.py alca [--settings ...]        every ALCA beside its quest's alias ids (the layout check)

Each command takes --settings (default lab/deploy/sky-srv/server-settings.json), --esm (/srv/persist/esm/1.6.1170),
--mods (/srv/persist/mods), --game (/srv/persist/game/1.6.1170), --version (1.6.1170) and --cache (a directory; the
index is rebuilt when any input's size or time changes).
"""

from __future__ import annotations

import argparse
import collections
import glob
import hashlib
import importlib.util
import json
import mmap
import os
import re
import struct
import sys
import time
import zlib
from dataclasses import dataclass, field
from pathlib import Path

LAB = Path(__file__).resolve().parent
sys.path.insert(0, str(LAB))
import esm  # noqa: E402
import pex  # noqa: E402

sys.path.insert(0, str(LAB / "labapi" / "labapi"))
import slots as plugin_slots  # noqa: E402

_spec = importlib.util.spec_from_file_location("bsa_extract", LAB / "tools" / "bsa-extract.py")
bsa = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(bsa)

INDEX_VERSION = 1  # the cache's shape; a change rebuilds every cache
COMPRESSED = esm.COMPRESSED
DELETED = 0x20
VM_FUNCS = {629: "GetVMQuestVariable", 630: "GetVMScriptVariable"}
VANILLA_ARCHIVES = ("Skyrim - Misc.bsa",)
CAP = 120  # a provenance tag's length kept

DEFAULTS = {
    "settings": str(LAB / "deploy" / "sky-srv" / "server-settings.json"),
    "esm": "/srv/persist/esm/1.6.1170",
    "mods": "/srv/persist/mods",
    "game": "/srv/persist/game/1.6.1170",
    "version": "1.6.1170",
    "cache": "/tmp/thuum-census",
}


def key(plugin: str, local: int) -> str:
    """A form's identity, its owning plugin (lowercased) and local id: "<local hex, six digits>:<plugin>"."""
    return f"{local & 0xFFFFFF:06x}:{plugin.lower()}"


def split(k: str) -> tuple[int, str]:
    local, plugin = k.split(":", 1)
    return int(local, 16), plugin


PLAYER_REF = key("skyrim.esm", 0x14)  # PlayerRef, the player's reference
PLAYER_BASE = key("skyrim.esm", 0x7)  # Player, the NPC_ the player's reference is made from


@dataclass
class LoadOrder:
    """The deployed load order: every plugin in the engine's order, which of them the server loads, and the script
    sources by precedence (lowest first; loose last)."""

    plugins: list[tuple[str, Path]]  # (name as written, file), engine order
    server: set[str]  # lowercased names the server's loadOrder carries
    names: dict[str, str]  # lowercased name -> as written
    slots: dict[str, tuple[bool, int]]  # lowercased name -> (light, index)
    archives: list[Path]  # archives that may carry scripts, lowest precedence first
    loose: dict[str, Path]  # lowercased script name -> the layer's loose .pex
    missing: list[str] = field(default_factory=list)  # plugins named but not found

    def desc(self, k: str) -> str:
        """A form's FormDesc text, "<hex id>:<plugin>", the plugin as the load order writes it."""
        local, plugin = split(k)
        return f"{local:x}:{self.names.get(plugin, plugin)}"

    def runtime(self, k: str) -> int | None:
        """A form's runtime id in this load order, None for a plugin it lacks or an id its slot cannot hold."""
        local, plugin = split(k)
        slot = self.slots.get(plugin)
        if slot is None:
            return None
        try:
            return plugin_slots.compose(slot, local)
        except ValueError:
            return None

    def ident(self, runtime: int) -> str | None:
        """The identity a runtime id names in this load order (its slot's plugin and local id), None for no plugin's."""
        light = runtime >> 24 == 0xFE
        want = (True, runtime >> 12 & 0xFFF) if light else (False, runtime >> 24)
        for plugin, slot in self.slots.items():
            if slot == want:
                return key(plugin, runtime & (0xFFF if light else 0xFFFFFF))
        return None

    def show(self, k: str) -> str:
        rid = self.runtime(k)
        return f"{rid:#010x}" if rid is not None else self.desc(k)

    def signature(self) -> str:
        """What the index was built from: every input's path, size and time."""
        h = hashlib.sha1(str(INDEX_VERSION).encode())
        for p in [p for _, p in self.plugins] + self.archives + sorted(self.loose.values()):
            st = p.stat()
            h.update(f"{p}|{st.st_size}|{int(st.st_mtime)}\n".encode())
        return h.hexdigest()


def _mod_dirs(mods: Path, version: str) -> list[Path]:
    """The layer's mod folders this game version installs: a <mod>@<version> folder only for that version."""
    out = []
    for d in sorted(mods.iterdir()) if mods.is_dir() else []:
        if d.is_dir() and ("@" not in d.name or d.name.rsplit("@", 1)[1] == version):
            out.append(d)
    return out


def _layer_files(mods: Path, version: str) -> list[tuple[str, Path]]:
    """(path inside Data, file) for every file the layer lays on a clone of this version: mods/SHA256SUMS's rows
    (each Data path once, the row install order kept), else a walk of the folders in name order."""
    sums = mods / "SHA256SUMS"
    out: list[tuple[str, Path]] = []
    if sums.is_file():
        for line in sums.read_text(encoding="utf-8", errors="replace").splitlines():
            parts = line.split("  ", 1)
            if len(parts) != 2 or "/" not in parts[1]:
                continue
            mod, inner = parts[1].split("/", 1)
            if "@" in mod and mod.rsplit("@", 1)[1] != version:
                continue
            out.append((inner, mods / mod / inner))
        return out
    for d in _mod_dirs(mods, version):
        for p in sorted(d.rglob("*")):
            if p.is_file():
                out.append((str(p.relative_to(d)), p))
    return out


def deployed(settings: Path, esm_dir: Path, mods: Path, game: Path, version: str) -> LoadOrder:
    """The deployed load order of a server settings file: its loadOrder's plugins from esm_dir, the client-only plugins
    the layer's plugins.txt lists after them (found in the layer), and the script sources."""
    order = [Path(p).name for p in json.loads(Path(settings).read_text())["loadOrder"]]
    server = {n.lower() for n in order}
    layer = _layer_files(mods, version) if mods.is_dir() else []
    top_level = {inner.lower(): path for inner, path in layer if "/" not in inner}
    plugins_txt = mods / "plugins.txt"
    if plugins_txt.is_file():
        for line in plugins_txt.read_text(encoding="utf-8", errors="replace").splitlines():
            name = line.strip().lstrip("*")
            if name and not name.startswith("#") and name.lower() not in server and name.lower() not in {o.lower() for o in order}:
                order.append(name)
    files: dict[str, Path] = {}
    missing = []
    for n in order:
        p = esm_dir / n
        if not p.is_file():
            p = top_level.get(n.lower())
        if p is None or not p.is_file():
            missing.append(n)
            continue
        files[n.lower()] = p
    present = [n for n in order if n.lower() in files]
    flags = {n.lower(): plugin_slots.header(files[n.lower()])[0] for n in present}
    engine = plugin_slots.engine_order(present, flags)
    slots = plugin_slots.slots(present, flags)
    names = {n.lower(): n for n in present}
    # archives: the vanilla ones, then each plugin's own in the engine's order
    data_archives: dict[str, Path] = {}
    for p in sorted(glob.glob(str(game / "depot_*" / "Data" / "*.bsa"))):
        data_archives.setdefault(Path(p).name.lower(), Path(p))
    for inner, path in layer:
        if "/" not in inner and inner.lower().endswith(".bsa"):
            data_archives[inner.lower()] = path
    archives = [data_archives[a.lower()] for a in VANILLA_ARCHIVES if a.lower() in data_archives]
    for n in engine:
        # a plugin's own archive is "<plugin>.bsa" (its "<plugin> - Textures.bsa" carries no script)
        own = data_archives.get(n.rsplit(".", 1)[0].lower() + ".bsa")
        if own is not None and own not in archives:
            archives.append(own)
    loose = {}
    for inner, path in layer:
        m = re.fullmatch(r"(?i)scripts/([^/]+)\.pex", inner)
        if m:
            loose[m.group(1).lower()] = path
    return LoadOrder([(n, files[n.lower()]) for n in engine], server, names, slots, archives, loose, missing)


# ----- records ----------------------------------------------------------------------------------------------------


class Plugin:
    """One plugin, mmapped, its ids mapped to identities through its MAST list."""

    def __init__(self, name: str, path: Path):
        self.name = name
        self._f = open(path, "rb")
        self.buf = mmap.mmap(self._f.fileno(), 0, access=mmap.ACCESS_READ)
        tes4, self.first = esm.record_at(self.buf, 0)
        self.masters = [d.split(b"\0", 1)[0].decode("cp1252") for t, d in tes4.fields if t == "MAST"]
        self.owners = [m.lower() for m in self.masters] + [name.lower()]

    def ident(self, fid: int) -> str:
        top = fid >> 24
        return key(self.owners[top] if top < len(self.owners) else self.owners[-1], fid & 0xFFFFFF)

    def body(self, pos: int, size: int, flags: int) -> bytes:
        data = self.buf[pos + 24:pos + 24 + size]
        return zlib.decompress(data[4:]) if flags & COMPRESSED else data

    def walk(self, start: int | None = None, end: int | None = None, top: str = "", dial: int | None = None):
        """(type, file form id, offset, size, flags, top group label, topic id) for every record; a Topic Children group
        (type 7) is labelled with its topic's id (UESP "Skyrim Mod:Mod File Format", group types)."""
        buf = self.buf
        pos = self.first if start is None else start
        end = len(buf) if end is None else end
        while pos + 24 <= end:
            if buf[pos:pos + 4] == b"GRUP":
                _, gsize, label, gtype, *_ = esm.GROUP.unpack_from(buf, pos)
                if gtype == 0:
                    yield from self.walk(pos + 24, pos + gsize, label.decode("latin-1"), None)
                elif gtype == 7:
                    yield from self.walk(pos + 24, pos + gsize, top, struct.unpack("<I", label)[0])
                else:
                    yield from self.walk(pos + 24, pos + gsize, top, dial)
                pos += gsize
                continue
            rtype, size, flags, fid = struct.unpack_from("<4sIII", buf, pos)
            yield rtype.decode("latin-1"), fid, pos, size, flags, top, dial
            pos += 24 + size

    def close(self):
        self.buf.close()
        self._f.close()


def zstr(d: bytes) -> str:
    return d.split(b"\0", 1)[0].decode("cp1252", "replace")


class _R:
    def __init__(self, d: bytes):
        self.d, self.p = d, 0

    def take(self, fmt: str):
        v = struct.unpack_from(fmt, self.d, self.p)[0]
        self.p += struct.calcsize(fmt)
        return v

    def ws(self) -> str:
        n = self.take("<H")
        v = self.d[self.p:self.p + n].decode("cp1252", "replace")
        self.p += n
        return v

    def left(self) -> int:
        return len(self.d) - self.p


def _obj(r: _R, fmt: int, ident) -> list:
    if fmt == 1:
        fid, alias = r.take("<I"), r.take("<h")
        r.take("<H")
    else:
        r.take("<H")
        alias, fid = r.take("<h"), r.take("<I")
    return [ident(fid) if fid else 0, alias]


def _value(r: _R, t: int, fmt: int, ident):
    if t == 1:
        return _obj(r, fmt, ident)
    if t == 2:
        return r.ws()
    if t == 3:
        return r.take("<i")
    if t == 4:
        return r.take("<f")
    if t == 5:
        return r.take("<B")
    if 11 <= t <= 15:
        return [_value(r, t - 10, fmt, ident) for _ in range(r.take("<I"))]
    raise ValueError(f"VMAD property type {t}")


def _scripts(r: _R, ver: int, fmt: int, ident, n: int) -> list:
    out = []
    for _ in range(n):
        name = r.ws()
        status = r.take("<B") if ver >= 4 else 0
        props = []
        for _ in range(r.take("<H")):
            pn, pt = r.ws(), r.take("<B")
            if ver >= 4:
                r.take("<B")
            props.append([pn, pt, _value(r, pt, fmt, ident)])
        out.append({"name": name, "status": status, "props": props})
    return out


def parse_vmad(data: bytes, rtype: str, ident) -> dict:
    r = _R(data)
    ver, fmt = r.take("<h"), r.take("<h")
    v = {"ver": ver, "fmt": fmt, "scripts": _scripts(r, ver, fmt, ident, r.take("<H"))}
    if r.left() <= 0:
        return v
    if rtype == "QUST":
        r.take("<b")
        fc = r.take("<H")
        v["file"] = r.ws()
        v["frags"] = []
        for _ in range(fc):
            stage = r.take("<H")
            r.take("<h")
            log = r.take("<i")
            r.take("<b")
            v["frags"].append([stage, log, r.ws(), r.ws()])
        v["aliases"] = []
        for _ in range(r.take("<H")):
            quest, alias = _obj(r, fmt, ident)
            aver, afmt = r.take("<h"), r.take("<h")
            v["aliases"].append({"alias": alias, "quest": quest, "scripts": _scripts(r, aver, afmt, ident, r.take("<H"))})
    elif rtype in ("INFO", "PACK"):
        r.take("<b")
        flags = r.take("<B")
        v["file"] = r.ws()
        v["frags"] = []
        for _ in range(bin(flags & (3 if rtype == "INFO" else 7)).count("1")):
            r.take("<b")
            v["frags"].append([r.ws(), r.ws()])
    elif rtype == "SCEN":
        r.take("<b")
        flags = r.take("<B")
        v["file"] = r.ws()
        v["frags"] = []
        for _ in range(bin(flags & 3).count("1")):
            r.take("<b")
            v["frags"].append(["be", r.ws(), r.ws()])
        for _ in range(r.take("<H")):
            r.take("<b")
            ph = r.take("<I")
            r.take("<b")
            v["frags"].append([ph, r.ws(), r.ws()])
    elif rtype == "PERK":
        r.take("<b")
        v["file"] = r.ws()
        v["frags"] = []
        for _ in range(r.take("<H")):
            idx = r.take("<H")
            r.take("<h")
            r.take("<b")
            v["frags"].append([idx, r.ws(), r.ws()])
    v["left"] = r.left()
    return v


def live_scripts(vm: dict | None) -> list[dict]:
    """A VMAD's attached scripts, its removed ones (status 2 and 3) left out."""
    return [s for s in (vm or {}).get("scripts", []) if s.get("status", 0) not in (2, 3)]


def ctdas(fields: list, ident, funcs=None) -> list:
    """The record's CTDAs (only those whose function is in `funcs`, when given), each with its CIS1 and CIS2."""
    out = []
    for i, (t, d) in enumerate(fields):
        if t != "CTDA" or len(d) < 28:
            continue
        func = struct.unpack_from("<H", d, 8)[0]
        if funcs is not None and func not in funcs:
            continue
        p1, p2, runon, ref = struct.unpack_from("<IIII", d, 12)
        cis = {}
        j = i + 1
        while j < len(fields) and fields[j][0] in ("CIS1", "CIS2"):
            cis[fields[j][0]] = zstr(fields[j][1])
            j += 1
        out.append({"op": d[0] >> 5, "func": func, "p1": ident(p1) if p1 else 0, "runon": runon,
                    "ref": ident(ref) if ref else 0, "cis1": cis.get("CIS1"), "cis2": cis.get("CIS2")})
    return out


ALIAS_FORMS = ("ALFR", "ALUA", "ALCO", "ALEQ", "ALFL")  # fills naming a form, kept as identities
ALIAS_NUMBERS = ("ALEA", "ALFA", "ALFI", "ALNA", "ALCA", "ALNT", "ALRT")


def aliases_of(fields: list, ident) -> list[dict]:
    """The quest's aliases in order, each ALST (reference) or ALLS (location) to its ALED (libespm QUST.cpp's fields)."""
    out, cur = [], None
    for t, d in fields:
        if t in ("ALST", "ALLS"):
            cur = {"kind": t, "id": struct.unpack_from("<I", d)[0], "name": None, "flags": 0, "fill": {}}
            out.append(cur)
        elif cur is None:
            continue
        elif t == "ALID":
            cur["name"] = zstr(d)
        elif t == "FNAM" and len(d) >= 4:
            cur["flags"] = struct.unpack_from("<I", d)[0]
        elif t in ALIAS_FORMS and len(d) >= 4:
            fid = struct.unpack_from("<I", d)[0]
            cur["fill"][t] = ident(fid) if fid else 0
        elif t in ALIAS_NUMBERS and len(d) >= 4:
            cur["fill"][t] = struct.unpack_from("<I", d)[0]
        elif t == "ALFE":
            cur["fill"][t] = d[:4].decode("latin-1")
        elif t == "ALED":
            cur = None
    return out


def alca(v: int) -> tuple[int, bool]:
    """ALCA: the alias a created object is made at or in (int16), and whether "in" (0x8000 in the high half)."""
    alias = v & 0xFFFF
    return (alias - 0x10000 if alias & 0x8000 else alias), bool(v >> 16 & 0x8000)


def index_records(lo: LoadOrder, log=print) -> dict:
    """The winning records the censuses read: quests (editor id, DNAM flags, VMAD, aliases, stage indices, VM CTDAs), topics
    (editor id, owning quest), infos and scenes (editor id, topic or quest, VM CTDAs, VMAD), any other record with a VM
    CTDA, every other record with a VMAD (bases and placements: type, editor id, base), the ACTI and GLOB ids, and the
    bases of the placements a 630 condition names without a VMAD of their own."""
    R: dict = {"quests": {}, "dials": {}, "infos": {}, "scenes": {}, "others": {}, "vmads": {}, "actis": {}, "globs": {},
               "bases": {}, "stats": {}, "errors": []}
    tables = ("quests", "dials", "infos", "scenes", "others", "vmads", "actis", "globs")
    t0 = time.time()
    for name, path in lo.plugins:
        p = Plugin(name, path)
        n = collections.Counter()
        for rtype, fid, pos, size, flags, top, dial in p.walk():
            n["records"] += 1
            k = p.ident(fid)
            world = top in ("CELL", "WRLD")
            if world and rtype not in ("REFR", "ACHR"):
                continue
            if flags & DELETED:
                for t in tables:
                    R[t].pop(k, None)
                continue
            try:
                body = p.body(pos, size, flags)
            except zlib.error as e:
                R["errors"].append(f"{name} {fid:08x}: {e}")
                continue
            has_vmad = b"VMAD" in body
            if world and not has_vmad:
                continue
            if not (rtype in ("QUST", "DIAL", "INFO", "SCEN", "ACTI", "GLOB") or has_vmad or b"CTDA" in body):
                continue
            fields = esm.parse_fields(body)
            n["parsed"] += 1
            get = lambda t: next((d for ft, d in fields if ft == t), None)  # noqa: E731
            edid = zstr(get("EDID") or b"")
            raw = get("VMAD")
            vm = None
            if raw:
                try:
                    vm = parse_vmad(raw, rtype, p.ident)
                except (ValueError, struct.error) as e:  # a parse error is reported, never silent
                    R["errors"].append(f"{name} {rtype} {fid:08x} VMAD: {e}")
                    vm = {"error": str(e), "scripts": []}
            conds = ctdas(fields, p.ident, set(VM_FUNCS))
            if rtype == "ACTI":
                R["actis"][k] = edid
            if rtype == "GLOB":
                R["globs"][k] = edid
            if rtype == "QUST":
                dnam = get("DNAM") or b"\0\0"
                stages = sorted({struct.unpack_from("<h", d)[0] for t, d in fields if t == "INDX" and len(d) >= 2})
                R["quests"][k] = {"edid": edid, "flags": struct.unpack_from("<H", dnam)[0], "file": name, "vmad": vm,
                                  "aliases": aliases_of(fields, p.ident), "stages": stages, "ctda": conds}
            elif rtype == "DIAL":
                q = get("QNAM")
                qid = struct.unpack_from("<I", q)[0] if q and len(q) >= 4 else 0
                R["dials"][k] = {"edid": edid, "quest": p.ident(qid) if qid else None}
            elif rtype == "INFO":
                R["infos"][k] = {"dial": p.ident(dial) if dial else None, "edid": edid, "ctda": conds, "vmad": vm}
            elif rtype == "SCEN":
                q = get("PNAM")
                qid = struct.unpack_from("<I", q)[0] if q and len(q) >= 4 else 0
                R["scenes"][k] = {"edid": edid, "quest": p.ident(qid) if qid else None, "ctda": conds, "vmad": vm}
            else:
                if conds:
                    R["others"][k] = {"type": rtype, "edid": edid, "ctda": conds}
                if vm is not None:
                    nm = get("NAME")
                    base = p.ident(struct.unpack_from("<I", nm)[0]) if rtype in ("REFR", "ACHR") and nm and len(nm) >= 4 else None
                    R["vmads"][k] = {"type": rtype, "edid": edid, "vmad": vm, "base": base}
        R["stats"][name] = dict(n)
        p.close()
        log(f"# records: {name}: {dict(n)} at {time.time() - t0:.0f} s")
    # a 630 condition's reference with no VMAD of its own: its base's scripts are the ones it reads
    want = {c["p1"] for src in ("infos", "scenes", "quests", "others") for r in R[src].values() for c in r["ctda"]
            if c["func"] == 630 and c["p1"] and c["p1"] not in R["vmads"]}
    if want:
        for name, path in lo.plugins:
            p = Plugin(name, path)
            for rtype, fid, pos, size, flags, top, dial in p.walk():
                if rtype in ("REFR", "ACHR") and p.ident(fid) in want:
                    nm = next((d for t, d in esm.parse_fields(p.body(pos, size, flags)) if t == "NAME"), None)
                    if nm and len(nm) >= 4:
                        R["bases"][p.ident(fid)] = p.ident(struct.unpack_from("<I", nm)[0])
            p.close()
    log(f"# records: quests {len(R['quests'])}, infos {len(R['infos'])}, scenes {len(R['scenes'])}, vmads {len(R['vmads'])}, "
        f"630 bases {len(R['bases'])} of {len(want)}, errors {len(R['errors'])}, {time.time() - t0:.0f} s")
    return R


# ----- scripts ----------------------------------------------------------------------------------------------------

# destination operand per opcode (UESP "Compiled Script File Format"'s opcode table, the order lab/pex.py's OPCODES follows)
DEST = {**{op: 0 for op in range(1, 20)}, 27: 0, 23: 2, 24: 1, 25: 2, 28: 2, 30: 0, 31: 0, 32: 0, 34: 1, 35: 1}
SYM = {1: "+", 2: "+", 3: "-", 4: "-", 5: "*", 6: "*", 7: "/", 8: "/", 9: "%", 16: "<", 17: "<=", 18: ">", 19: ">="}


def analyze(p, objname: str, varmap: dict, autoprop: dict, fn) -> dict:
    """One function's facts by the linear provenance pass (the module's docstring)."""
    S = p.string
    params = [S(n).lower() for n, t in fn.params]
    ptypes = {S(n).lower(): S(t).lower() for n, t in fn.params}
    ltypes = {S(n).lower(): S(t).lower() for n, t in fn.locals}

    def ident(v):
        return S(struct.unpack(">H", v.payload)[0]).lower() if v.kind == 1 else None

    def stype(name):
        if name == "self":
            return objname
        return ltypes.get(name) or ptypes.get(name) or varmap.get(name) or "?"

    tags: dict[str, str] = {}

    def tag(v) -> str:
        if v.kind == 0:
            return "None"
        if v.kind == 2:
            return '"' + S(struct.unpack(">H", v.payload)[0])[:24] + '"'
        if v.kind == 3:
            return str(struct.unpack(">i", v.payload)[0])
        if v.kind == 4:
            return f"{struct.unpack('>f', v.payload)[0]:g}"
        if v.kind == 5:
            return str(bool(v.payload[0]))
        n = ident(v)
        if n in tags:
            return tags[n]
        if n == "self":
            return "self"
        if n in autoprop:
            return "prop:" + autoprop[n]
        if n in varmap:
            return "var:" + n
        if n in ptypes:
            return "param:" + n
        return "local:" + n

    out = {"ni": len(fn.instructions), "params": params, "w": set(), "vw": collections.defaultdict(set), "ps": [],
           "calls": [], "cs": [], "gp": False, "cmp": []}
    for ins in fn.instructions:
        op, a = ins.opcode, ins.args
        va = ins.varargs[1:] if ins.varargs else []
        t = None
        if op == 25:
            cls, meth = ident(a[0]) or "?", ident(a[1]) or "?"
            args = [tag(x)[:CAP] for x in va]
            out["cs"].append([cls, meth, args])
            if (cls, meth) == ("game", "getplayer"):
                out["gp"] = True
                t = "getplayer"
            else:
                t = f"{cls}.{meth}(" + ",".join(args) + ")"
        elif op == 23:
            meth, recv = ident(a[0]) or "?", a[1]
            rt = stype(ident(recv)) if recv.kind == 1 else "?"
            rtag, args = tag(recv), [tag(x) for x in va]
            out["calls"].append([meth, rt, rtag[:CAP], [x[:CAP] for x in args]])
            t = f"{rtag}.{meth}(" + ",".join(args) + ")"
        elif op == 24:
            meth = ident(a[0]) or "?"
            args = [tag(x) for x in va]
            out["calls"].append([meth, "parent", "self", [x[:CAP] for x in args]])
            t = f"parent.{meth}(" + ",".join(args) + ")"
        elif op == 28:
            prop, recv = ident(a[0]) or "?", a[1]
            t = ("prop:" + prop) if ident(recv) == "self" else f"{tag(recv)}.{prop}"
        elif op == 29:
            prop, recv = ident(a[0]) or "?", a[1]
            rt = stype(ident(recv)) if recv.kind == 1 else "?"
            out["ps"].append([prop, rt, tag(recv)[:CAP], tag(a[2])[:CAP]])
        elif op in (13, 14):
            t = tag(a[1])
        elif op == 15:
            x, y = tag(a[1]), tag(a[2])
            t = f"({x} == {y})"
            if x == "getplayer" or y == "getplayer" or x.startswith("prop:") or y.startswith("prop:"):
                out["cmp"].append([x[:CAP], y[:CAP]])
        elif op in SYM:
            t = f"({tag(a[1])} {SYM[op]} {tag(a[2])})"
        elif op == 10:
            t = f"!{tag(a[1])}"
        if op in DEST:
            d = a[DEST[op]]
            dn = ident(d) if d.kind == 1 else None
            if dn:
                if dn in varmap and dn not in ltypes and dn not in ptypes:
                    out["w"].add(dn)
                    out["vw"][dn].add((t or "expr")[:CAP])
                tags[dn] = (t or "expr")[:CAP]
    out["w"] = sorted(out["w"])
    out["vw"] = {k: sorted(v) for k, v in out["vw"].items()}
    return out


def script_facts(p) -> dict[str, dict]:
    """Every object of a parsed pex: name, parent, declared variables (lowercased name -> [declared name, type]),
    properties (name -> [type, auto variable, the variables a full property's set handler writes]), and per function
    (state.name) its facts."""
    out = {}
    for o in p.objects:
        objname = p.string(o.name).lower()
        varmap = {p.string(v.name).lower(): p.string(v.type).lower() for v in o.variables}
        declared = {p.string(v.name).lower(): [p.string(v.name), p.string(v.type).lower()] for v in o.variables}
        autoprop = {p.string(pr.auto_var).lower(): p.string(pr.name).lower() for pr in o.properties if pr.auto_var is not None}
        props = {}
        for pr in o.properties:
            wv = analyze(p, objname, varmap, autoprop, pr.write_handler)["w"] if pr.write_handler is not None else []
            props[p.string(pr.name).lower()] = [p.string(pr.type).lower(),
                                                p.string(pr.auto_var).lower() if pr.auto_var is not None else None, wv]
        fns = {}
        native = False
        for st in o.states:
            for fn_name, fn in st.functions:
                native = native or bool(fn.flags & pex.FLAG_NATIVE)
                fns[f"{p.string(st.name).lower()}.{p.string(fn_name).lower()}"] = analyze(p, objname, varmap, autoprop, fn)
        out[objname] = {"n": p.string(o.name), "par": p.string(o.parent).lower(), "vars": declared, "props": props,
                        "native": native, "fn": fns}
    return out


class _Window:
    """An archive entry's bytes at their offsets in the archive, so bsa-extract's read takes them without the archive
    mapped (thirty mapped archives exhaust a capped address space)."""

    def __init__(self, base: int, data: bytes):
        self.base, self.data = base, data

    def __getitem__(self, i):
        if isinstance(i, slice):
            return self.data[i.start - self.base:i.stop - self.base]
        return self.data[i - self.base]


def _archive_scripts(path: Path):
    """(lowercased script name, a reader of its bytes) for every .pex in an archive's Scripts folder: the table read once
    through a map closed before the first entry is read, each entry read by its offset."""
    with open(path, "rb") as f:
        buf = mmap.mmap(f.fileno(), 0, access=mmap.ACCESS_READ)
        try:
            table, aflags, ver = bsa.entries(buf)
        finally:
            buf.close()
    for entry, (size, offset) in table.items():
        if entry.endswith(".pex") and entry.startswith("scripts/") and entry.count("/") == 1:
            def read(s=size, o=offset, e=entry):
                with open(path, "rb") as f:
                    f.seek(o)
                    raw = f.read(s & 0x3FFFFFFF)
                return bsa.read(_Window(o, raw), s, o, aflags, ver, e)
            yield entry[len("scripts/"):-4], read


def index_scripts(lo: LoadOrder, log=print) -> dict:
    """Every script's winning .pex, parsed once: {name: facts with "src"}, and the parse errors."""
    t0 = time.time()
    winner: dict[str, tuple[str, object]] = {}
    sources = collections.Counter()
    for arc in lo.archives:
        n = 0
        for name, read in _archive_scripts(arc):
            winner[name] = (arc.name, read)
            n += 1
        sources[arc.name] = n
    for name, path in lo.loose.items():
        winner[name] = ("loose:" + path.parent.parent.name, path.read_bytes)
        sources["loose"] += 1
    scripts, errors = {}, []
    for name, (src, read) in sorted(winner.items()):
        try:
            facts = script_facts(pex.parse(read()))
        except (pex.PexError, ValueError, struct.error, IndexError) as e:
            errors.append(f"{name} ({src}): {e}")
            continue
        for objname, f in facts.items():
            f["src"] = src
            scripts[objname] = f
    log(f"# scripts: {len(scripts)} from {dict(sources)}, parse errors {len(errors)}, {time.time() - t0:.0f} s")
    return {"scripts": scripts, "errors": errors, "sources": dict(sources)}


def index(lo: LoadOrder, cache: Path | None, log=print) -> tuple[dict, dict]:
    """(records, scripts) from the cache when it was built from these inputs, else built and kept there."""
    sig = lo.signature()
    if cache is not None:
        rp, xp = cache / "records.json", cache / "pex.json"
        if rp.is_file() and xp.is_file():
            R, X = json.loads(rp.read_text()), json.loads(xp.read_text())
            if R.get("signature") == sig and X.get("signature") == sig:
                log(f"# index: reused {cache}")
                return R, X
    R, X = index_records(lo, log), index_scripts(lo, log)
    R["signature"] = X["signature"] = sig
    if cache is not None:
        cache.mkdir(parents=True, exist_ok=True)
        (cache / "records.json").write_text(json.dumps(R))
        (cache / "pex.json").write_text(json.dumps(X))
    return R, X


# ----- what the censuses share -------------------------------------------------------------------------------------


def chain(X: dict, s: str | None) -> list[str]:
    """A script and its parents, the script first (names lowercased)."""
    out = []
    while s and s not in out:
        out.append(s)
        s = X[s]["par"] if s in X else None
    return out


def declares(X: dict, s: str, var: str) -> str | None:
    """The script of s's chain that declares the variable, None when none does."""
    for d in chain(X, s):
        if d in X and var in X[d]["vars"]:
            return d
    return None


def scripts_of(rec: dict | None) -> list[str]:
    """A record's attached scripts, lowercased, its removed ones left out."""
    return [s["name"].lower() for s in live_scripts((rec or {}).get("vmad"))]


def condition_keys(R: dict, X: dict) -> tuple[dict, collections.Counter]:
    """Every key a 629 or 630 condition reads, (func, form, attached script, declaring script, variable) to its readers by
    record kind and the records, and the conditions whose variable no attached script declares. A 629 condition names
    the quest (param1); a 630 one the reference, whose own scripts and its base's are read; the variable is CIS2 (UESP
    "CTDA Field"), and the script is the attached one whose chain declares it."""
    Q, V = R["quests"], R["vmads"]
    keys: dict = collections.defaultdict(lambda: {"n": collections.Counter(), "recs": set()})
    unresolved: collections.Counter = collections.Counter()
    for src, kind in (("infos", "INFO"), ("scenes", "SCEN"), ("quests", "QUST"), ("others", None)):
        for g, r in R[src].items():
            for c in r["ctda"]:
                if c["func"] not in VM_FUNCS:
                    continue
                var = (c["cis2"] or "").lower()
                form = c["p1"] or ""
                if c["func"] == 629:
                    own = scripts_of(Q.get(form))
                else:
                    own = scripts_of(V.get(form))
                    base = (V.get(form) or {}).get("base") or R["bases"].get(form)
                    if base:
                        own += scripts_of(V.get(base))
                hit = next(((s, d) for s in own for d in [declares(X, s, var)] if d), None)
                if not hit or not form:
                    unresolved[(c["func"], form, var, src)] += 1
                    continue
                kk = (c["func"], form, hit[0], hit[1], var)
                keys[kk]["n"][kind or r.get("type", "?")] += 1
                keys[kk]["recs"].add(g)
    return keys, unresolved


def condition_key_json(lo: LoadOrder, X: dict, kk: tuple) -> dict:
    """A key as the deploy settings' conditionVariables carry it: the form's FormDesc, the attached script and the
    variable as their pex declares them (Papyrus compares names case-blind; the declared spelling is kept)."""
    func, form, s, d, var = kk
    return {"form": lo.desc(form), "script": X[s]["n"] if s in X else s, "var": X[d]["vars"][var][0] if d in X else var}


def load(args) -> tuple[LoadOrder, dict, dict]:
    lo = deployed(Path(args.settings), Path(args.esm), Path(args.mods), Path(args.game), args.version)
    log = (lambda m: print(m, file=sys.stderr))
    if lo.missing:
        log(f"# load order: {len(lo.missing)} plugin(s) not found: {', '.join(lo.missing)}")
    R, X = index(lo, Path(args.cache) if args.cache else None, log)
    return lo, R, X


def add_arguments(ap: argparse.ArgumentParser) -> None:
    for name in ("settings", "esm", "mods", "game", "version", "cache"):
        ap.add_argument(f"--{name}", default=DEFAULTS[name])


def main(argv: list[str]) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0], formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("command", choices=["order", "index", "alca"])
    add_arguments(ap)
    args = ap.parse_args(argv)
    if args.command == "order":
        lo = deployed(Path(args.settings), Path(args.esm), Path(args.mods), Path(args.game), args.version)
        for name, path in lo.plugins:
            tail = "" if name.lower() in lo.server else "  (client only)"
            print(f"{plugin_slots.label(lo.slots[name.lower()])}  {name}{tail}")
        print(f"# archives, lowest first: {', '.join(a.name for a in lo.archives)}")
        print(f"# loose scripts: {len(lo.loose)}: {', '.join(sorted(lo.loose))}")
        if lo.missing:
            print(f"# not found: {', '.join(lo.missing)}")
        return 0
    lo, R, X = load(args)
    if args.command == "index":
        print(f"quests {len(R['quests'])}, infos {len(R['infos'])}, scenes {len(R['scenes'])}, vmads {len(R['vmads'])}, "
              f"scripts {len(X['scripts'])} ({X['sources']}), record errors {len(R['errors'])}, pex errors {len(X['errors'])}")
        for e in R["errors"][:10] + X["errors"][:10]:
            print(f"  {e}")
        return 0
    # alca: the layout check, each created alias's ALCA beside the quest's own alias ids
    seen = collections.Counter()
    for g, q in sorted(R["quests"].items()):
        ids = {a["id"] for a in q["aliases"]}
        for a in q["aliases"]:
            v = a["fill"].get("ALCA")
            if v is None:
                continue
            at, inside = alca(v)
            seen[("in" if inside else "at", at in ids)] += 1
            print(f"{lo.show(g)} {q['edid']} alias {a['id']}: ALCA {v:#010x} -> alias {at} ({'in' if inside else 'at'}); "
                  f"{'one of' if at in ids else 'NOT one of'} the quest's ids")
    print(f"# ALCA by (mode, alias is the quest's own): {dict(seen)}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
