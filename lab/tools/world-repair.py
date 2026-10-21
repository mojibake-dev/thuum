#!/usr/bin/env python3
"""world-repair.py <world dir> [--order <load-order.json|server-settings.json>] [--candidate <order>]...
[--esm-dir DIR] [--out DIR] [--drop-unfixable] [--no-rebase] [--json] | --self-test: every form a saved world
names, checked against the load order it was written under, and a repaired copy of the world (thuum docs/PLAN.md
Train-31, "ADR-043 slice two's first row"; docs/DECISIONS.md ADR-043). It runs where the plugins are, on sky-srv
(`--esm-dir /srv/persist/esm/1.6.1170`, the files the server loads), the way lab/tools/load-order-check.py runs
from /srv/lab/handover; without the plugins it still runs, by slot arithmetic alone (the header says so).

The server saves its world as JSON change forms, `<world>/changeForms/<desc>.json` beside `<world>/load-order.json`
(skymp5-server database_drivers/FileDatabase.cpp:107-118, the order file :148-156 written with nlohmann's dump(2);
its format is LoadOrderFile.cpp:6-29, {"files": [{"light": bool, "name": str}, ...]}, read in
lab/fixtures/worlds/adr043-preslice-25/README.md:132-174). A record with formVersion 2 (MpChangeForms.h:186,
`kFormVersion`) names every form as a FormDesc string, "<hex local id>:<plugin>" (FormDesc.cpp:6-24 `ToString`,
"%0x", so lowercase hex and no 0x; a bare hex string such as "1" is a server-made form; `FromString` :26-47 splits
at the first colon). A raw record (formVersion absent or 1, MpChangeForms.cpp:655-663) holds the runtime ids of the
order it was written under as integers in inv, equipmentDump and learnedSpells and inside appearanceDump. The
server numbers a load order's plugins in LIST order, full and light apart (FormDesc.cpp:146-172 `ToFormId`: the
n-th full plugin is slot n, the n-th light plugin FE n with a 12-bit local id; :102-144 `FilePosition` and
`FromFormId` decode the same way), not master-first as the clients' engine does, so this tool numbers as the
server wrote and uses lab/labapi/labapi/slots.py only for the TES4 header (:21-35), the light flag (:42-43) and the
id composition (:70-79).

Why a repair: the lab's older worlds were saved under two orders over time, main's 17 plugins (LostGrimoire.esp on
slot 0B, Apocalypse - Magic of Skyrim.esp on 0C) and the essentials layer's 91 (Cloaks.esp on 0B, Cloaks -
Dawnguard.esp on 0C, Apocalypse on 1A), with no order saved beside them. Slice one re-bases a raw world "from the
running order (none saved)" (RecordReader.cpp:36-41; the conversion is ToJson under that order, MpChangeForms.cpp:
1122-1133), so an id written under the other order came out naming the wrong plugin: in snapshot playtest-m2-28
the record 1.json (profile 2) learned "a86df:Cloaks.esp", which is LostGrimoire.esp's Teleportation (0xA86DF),
and eight "...:Cloaks - Dawnguard.esp" spells (186d, aae8, 1f1fb, 24e49, 2e634, 5ecee, 83a22, 88694) that are
Apocalypse's; the Teleportation entry was taken out by hand for twenty-nine (docs/LOG.md:2180, lab/playtests/
29.yaml:3-5). The server never repairs: at the next write a runtime id no plugin of its order holds is DROPPED
(MpChangeForms.cpp:292-314 for learned spells, the error at :299-304; inventory entries :77-116, head parts
:198-251), and a FormDesc naming a plugin outside its order is parked unresolved and kept as written
(:118-153, :182-196). So the repair is a copy made before a server loads the world.

What the tool reads in a record (MpChangeForms.cpp:367-583 `ToJson`, the described fields :316-342 `DescribeForms`,
the keys :68-71): inv.entries[].{baseId,enchantmentId,poisonId}; equipmentDump.inv.entries[].{the same};
equipmentDump.{leftSpell,rightSpell,voiceSpell,instantSpell} (a present but empty slot is written "0:Skyrim.esm",
:155-180 `DescribeScalar`, so local id 0 there is empty, never dangling); learnedSpells[]; appearanceForms.{raceId,
headTextureSetId,headpartIds[]} (the sibling of appearanceDump, whose numbers stay those of the saved order);
playerGlobals.entries[].formDesc; runningEffects.entries[].{effect,source,caster}; shoutRecord.{shouts,wordsKnown,
wordsUnlocked}[]; favorites, mapMarkers, ingredientEffects and factions .entries[].formDesc; templateChain[];
setNodeTextureSet's values; baseDesc, worldOrCellDesc, spawnPoint_cellOrWorldDesc and the record's own formDesc
(checked, never rewritten: it names the file). A raw record holds integers in inv, equipmentDump, learnedSpells and
appearanceDump.{raceId,headTextureSetId,headpartIds[]} instead.

Verdicts, one per form: OK; DANGLING-PLUGIN (the plugin is in no given order); DANGLING-FORM (the plugin is in an
order but, with --esm-dir, holds no record with that local id: own records are the ones whose top byte is the
plugin's MAST count, as load-order-check.py:49-57 reads them with lab/esm.py:121-137 `headers`, the local id masked
0xFFF for a light plugin, else 0xFFFFFF); MISBASED (the id recomposed under the written order with the server's
numbering and decoded under each --candidate order fits exactly one candidate: that candidate's plugin holds it,
or, by slot alone, the written order has no plugin on the id's slot and exactly one candidate has); AMBIGUOUS
(more than one reading fits; without --esm-dir, any form that reads under a candidate too, since the records are
what decide). A proposal carries the record's EDID (esm.py:92-97 `record_at`) or its type. Exit 0 clean, 1
findings, 2 error; --json prints the findings as a JSON list.

The written order is --order, else the world's own load-order.json; a world of version 2 records with neither is
refused, a raw world needs --order or a --candidate (one candidate alone is taken as the order). A
server-settings.json order is its "loadOrder" list (absolute paths; the server keeps the file name only,
libespm's Loader) with the light flags read from the plugin headers when --esm-dir is given, else from a .esl
suffix (an ESL-flagged .esp such as Headshot Kills.esp then numbers as full: the header says when that rule was
used). --out DIR writes the repaired copy: every record copied, MISBASED forms re-based where one reading fits
(learnedSpells, the one declared set, MpChangeForms.h:34, deduped after), DANGLING and decided AMBIGUOUS entries
dropped only with --drop-unfixable (list entries and spell slots; a scalar such as a race or a base is reported
and left), --no-rebase leaving every MISBASED form as written; raw records come out as formVersion 2 in the shape
DescribeForms writes (a raw record with an entry nothing resolves stays raw, byte for byte, unless
--drop-unfixable drops the entry as the server would), an unchanged record is copied byte for byte, a changed one
is json.dumps(indent=2, sort_keys=True) like the server's dump(2), equal in content (nlohmann's Grisu2 and Python's
shortest repr pick a different last digit for about one float in a few hundred, 688.7134399414063 against ...062 in
the fixture's 0.json, the same double), and the written order goes beside them as load-order.json. Never written: the input directory, a directory that already has files, /srv/lab/server/world or
anything under /srv/lab/snapshots; never a record the tool could not parse; never an order or a form the inputs
did not name; no key added or renamed beyond what DescribeForms itself adds (formVersion, appearanceForms).
--self-test builds a tiny world of both shapes under synthetic orders with the slots above and checks the
verdicts and the repaired output, slot-only and with an injected record table, without any plugin file.
"""
from __future__ import annotations

import argparse
import json
import os
import shutil
import sys
import tempfile
from dataclasses import dataclass, field
from pathlib import Path
from typing import Callable, Iterator

# the slot math is lab-api's (lab/labapi/labapi/slots.py); layer-stage ships both files to sky-srv in this
# tree's layout, as load-order-check.py relies on
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "labapi" / "labapi"))
from slots import compose, header, is_light  # noqa: E402
# the record walk is lab/esm.py's, shipped beside the tools/ directory as in this tree
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import esm  # noqa: E402

FORM_VERSION = 2
ENTRY_FORMS = ("baseId", "enchantmentId", "poisonId")
SPELL_SLOTS = ("leftSpell", "rightSpell", "voiceSpell", "instantSpell")
ENTRY_LISTS = ("playerGlobals", "favorites", "mapMarkers", "ingredientEffects", "factions")
VERDICTS = ("OK", "MISBASED", "AMBIGUOUS", "DANGLING-FORM", "DANGLING-PLUGIN")
FORBIDDEN_OUT = (Path("/srv/lab/server/world"), Path("/srv/lab/snapshots"))
DROP = object()  # a list element marked for removal


# ---------------------------------------------------------------- orders

@dataclass(frozen=True)
class Order:
    """A load order as the server numbers it: `files` in list order, each (name, light)."""
    source: str
    files: tuple[tuple[str, bool], ...]
    flags_from: str  # "file" (load-order.json), "headers" (--esm-dir) or "suffix" (.esl only)

    def slot(self, plugin: str) -> tuple[bool, int] | None:
        """(light, index) of `plugin` under the server's numbering (FormDesc.cpp:146-172), exact name match."""
        full = light = 0
        for name, is_l in self.files:
            if name == plugin:
                return (is_l, light if is_l else full)
            if is_l:
                light += 1
            else:
                full += 1
        return None

    def plugin_at(self, light: bool, index: int) -> str | None:
        kind = [name for name, is_l in self.files if is_l == light]
        return kind[index] if 0 <= index < len(kind) else None

    def has_light(self) -> bool:
        return any(is_l for _, is_l in self.files)

    def compose(self, plugin: str, local: int) -> int | None:
        """The runtime id of `plugin`'s `local` under this order; None when the plugin is absent or the id too wide."""
        slot = self.slot(plugin)
        if slot is None:
            return None
        try:
            return compose(slot, local)
        except ValueError:
            return None

    def decode(self, form_id: int) -> tuple[str, int] | None:
        """(plugin, local) of a runtime id, as FormDesc::FromFormId reads it (FormDesc.cpp:102-144); a server-made id
        (0xFF......) decodes to ("", local); None when no plugin sits on the slot."""
        if form_id >= 0xFF000000:
            return ("", form_id - 0xFF000000)
        top = form_id >> 24
        light = top == 0xFE and self.has_light()
        index = (form_id >> 12) & 0xFFF if light else top
        local = form_id & (0xFFF if light else 0xFFFFFF)
        plugin = self.plugin_at(light, index)
        return (plugin, local) if plugin is not None else None

    def describe(self) -> str:
        full = sum(1 for _, is_l in self.files if not is_l)
        note = {"file": "", "headers": ", light by header", "suffix": ", light by .esl suffix only"}[self.flags_from]
        return f"{self.source} ({len(self.files)} plugins, {full} full, {len(self.files) - full} light{note})"

    def to_json(self) -> dict:
        return {"files": [{"light": is_l, "name": name} for name, is_l in self.files]}


def read_order(path: Path, esm_dir: Path | None) -> Order:
    """An order from a load-order.json ({"files": [...]}), a server-settings.json ("loadOrder", absolute paths) or a
    bare JSON list of paths (the fixture's served-load-order.json shape)."""
    data = json.loads(path.read_text(encoding="utf-8"))
    if isinstance(data, dict) and isinstance(data.get("files"), list):
        files = []
        for entry in data["files"]:
            if not isinstance(entry, dict) or not isinstance(entry.get("name"), str):
                raise ValueError(f"{path}: every file needs a 'name'")
            files.append((entry["name"], bool(entry.get("light", False))))
        return Order(str(path), tuple(files), "file")
    if isinstance(data, dict) and isinstance(data.get("loadOrder"), list):
        names = [Path(p).name for p in data["loadOrder"]]
    elif isinstance(data, list) and all(isinstance(p, str) for p in data):
        names = [Path(p).name for p in data]
    else:
        raise ValueError(f"{path}: neither a load-order.json ('files') nor a server-settings.json ('loadOrder')")
    if esm_dir is not None:
        plugins = plugin_files(esm_dir)
        flags = {}
        for n in names:
            if n.lower() not in plugins:
                raise ValueError(f"{path}: {n} is not under {esm_dir}")
            flags[n] = header(plugins[n.lower()])[0]
        return Order(str(path), tuple((n, is_light(n, flags[n])) for n in names), "headers")
    return Order(str(path), tuple((n, is_light(n, 0)) for n in names), "suffix")


def plugin_files(esm_dir: Path) -> dict[str, Path]:
    """The plugin files under esm_dir by lowercased name (the names in a FormDesc are the server's, the files' case
    may differ)."""
    return {p.name.lower(): p for p in esm_dir.iterdir()
            if p.is_file() and p.suffix.lower() in (".esm", ".esp", ".esl")}


# ---------------------------------------------------------------- the plugins' records

class Holdings:
    """Which local ids each plugin's own records carry, read lazily from --esm-dir (load-order-check.py:49-57's
    rule: the top byte of an own record's id is the plugin's MAST count; esm.py:121-137 walks every record). A
    table {plugin: {local: name}} stands in for the files (the self-test); neither means slot-only."""

    def __init__(self, esm_dir: Path | None = None, table: dict[str, dict[int, str]] | None = None):
        self.esm_dir = esm_dir
        self.table = table
        self.files = plugin_files(esm_dir) if esm_dir else {}
        self._own: dict[tuple[str, bool], dict[int, int]] = {}
        self._buf: dict[str, bytes] = {}

    @property
    def known(self) -> bool:
        return self.esm_dir is not None or self.table is not None

    def holds(self, plugin: str, local: int, light: bool) -> bool | None:
        """Whether `plugin` has an own record `local`; None when nothing can be read (slot-only, or no such file)."""
        if self.table is not None:
            return local in self.table.get(plugin, {})
        own = self._own_records(plugin, light)
        return None if own is None else local in own

    def name(self, plugin: str, local: int, light: bool) -> str | None:
        """The record's EDID, else its type, for a proposal line."""
        if self.table is not None:
            return self.table.get(plugin, {}).get(local)
        own = self._own_records(plugin, light)
        if not own or local not in own:
            return None
        rec, _ = esm.record_at(self._buf[plugin.lower()], own[local])
        return rec.editor_id or rec.type

    def _own_records(self, plugin: str, light: bool) -> dict[int, int] | None:
        key = (plugin.lower(), light)
        if key in self._own:
            return self._own[key]
        path = self.files.get(plugin.lower())
        if path is None:
            self._own[key] = None  # type: ignore[assignment]
            return None
        _, masters = header(path)
        buf = self._buf.setdefault(plugin.lower(), path.read_bytes())
        mask, top = (0xFFF if light else 0xFFFFFF), len(masters)
        own = {fid & mask: off for t, fid, off, _ in esm.headers(buf, 0, len(buf), None)
               if t != "TES4" and fid >> 24 == top}
        self._own[key] = own
        return own


# ---------------------------------------------------------------- FormDesc strings

def parse_desc(text: str) -> tuple[int, str]:
    """(local, plugin) of "<hex>:<plugin>", or (id, "") of a bare hex id (FormDesc.cpp:26-47)."""
    head, sep, plugin = text.partition(":")
    local = int(head, 16)  # ValueError on anything the server's %x would not read
    return local, plugin if sep else ""


def format_desc(local: int, plugin: str) -> str:
    return f"{local:x}:{plugin}" if plugin else f"{local:x}"


# ---------------------------------------------------------------- the forms a record holds

@dataclass
class Site:
    """One form in a record: where it is, how the server would drop it, how a raw id's string is written."""
    path: str
    container: dict | list
    key: str | int
    kind: str  # "desc" (a FormDesc string) or "raw" (a runtime id)
    owner: tuple[list, int] | None = None  # the list element dropped with it (an entry, or the item itself)
    erase: bool = False  # dropped by deleting container[key] (a spell slot, a node's texture set)
    empty_zero: bool = False  # a spell slot: local id 0 is an empty slot
    rewrite: bool = True  # formDesc names the file: reported, never rewritten
    write: tuple[dict | list, str | int] | None = None  # where a raw id's string goes (appearanceForms)

    @property
    def value(self):
        return self.container[self.key]

    @property
    def droppable(self) -> bool:
        return self.rewrite and (self.owner is not None or self.erase)


def entries_of(value) -> list:
    """The server writes {"entries": [...]}; a bare list is accepted for older shapes."""
    if isinstance(value, dict):
        value = value.get("entries")
    return value if isinstance(value, list) else []


def expect(value, kind: str, path: str):
    want = str if kind == "desc" else int
    if not isinstance(value, want) or isinstance(value, bool):
        raise ValueError(f"{path}: expected {'a FormDesc string' if kind == 'desc' else 'a runtime id'}, found {value!r}")


def sites(rec: dict, raw: bool, forms: dict, parts: list) -> Iterator[Site]:
    """Every form-bearing field of a record (the docstring's list); `forms` and `parts` are the appearanceForms a raw
    record's conversion builds, which its appearanceDump sites write into."""
    ids = "raw" if raw else "desc"
    for key in ("formDesc", "baseDesc", "worldOrCellDesc", "spawnPoint_cellOrWorldDesc"):
        if key in rec:
            expect(rec[key], "desc", key)
            yield Site(key, rec, key, "desc", rewrite=key != "formDesc")
    for base, inv in (("inv", rec.get("inv")), ("equipmentDump.inv", (rec.get("equipmentDump") or {}).get("inv"))):
        entries = entries_of(inv)
        for i, entry in enumerate(entries):
            for k in ENTRY_FORMS:
                if isinstance(entry, dict) and k in entry:
                    expect(entry[k], ids, f"{base}.entries[{i}].{k}")
                    yield Site(f"{base}.entries[{i}].{k}", entry, k, ids, owner=(entries, i))
    equipment = rec.get("equipmentDump")
    if isinstance(equipment, dict):
        for slot in SPELL_SLOTS:
            if slot in equipment:
                expect(equipment[slot], ids, f"equipmentDump.{slot}")
                yield Site(f"equipmentDump.{slot}", equipment, slot, ids, erase=True, empty_zero=True)
    spells = rec.get("learnedSpells")
    if isinstance(spells, list):
        for i, v in enumerate(spells):
            expect(v, ids, f"learnedSpells[{i}]")
            yield Site(f"learnedSpells[{i}]", spells, i, ids, owner=(spells, i))
    if raw:
        dump = rec.get("appearanceDump")
        if isinstance(dump, dict):
            for key in ("raceId", "headTextureSetId"):
                if isinstance(dump.get(key), int) and not isinstance(dump.get(key), bool):
                    yield Site(f"appearanceDump.{key}", dump, key, "raw", write=(forms, key))
            heads = dump.get("headpartIds")
            if isinstance(heads, list):
                parts.extend([None] * len(heads))
                for i, v in enumerate(heads):
                    expect(v, "raw", f"appearanceDump.headpartIds[{i}]")
                    yield Site(f"appearanceDump.headpartIds[{i}]", heads, i, "raw", owner=(parts, i), write=(parts, i))
    else:
        appearance = rec.get("appearanceForms")
        if isinstance(appearance, dict):
            for key in ("raceId", "headTextureSetId"):
                if key in appearance:
                    expect(appearance[key], "desc", f"appearanceForms.{key}")
                    yield Site(f"appearanceForms.{key}", appearance, key, "desc")
            heads = appearance.get("headpartIds")
            if isinstance(heads, list):
                for i, v in enumerate(heads):
                    expect(v, "desc", f"appearanceForms.headpartIds[{i}]")
                    yield Site(f"appearanceForms.headpartIds[{i}]", heads, i, "desc", owner=(heads, i))
    for name in ENTRY_LISTS:
        entries = entries_of(rec.get(name))
        for i, entry in enumerate(entries):
            if isinstance(entry, dict) and "formDesc" in entry:
                expect(entry["formDesc"], "desc", f"{name}.entries[{i}].formDesc")
                yield Site(f"{name}.entries[{i}].formDesc", entry, "formDesc", "desc", owner=(entries, i))
    entries = entries_of(rec.get("runningEffects"))
    for i, entry in enumerate(entries):
        for k in ("effect", "source", "caster"):
            if isinstance(entry, dict) and k in entry:
                expect(entry[k], "desc", f"runningEffects.entries[{i}].{k}")
                yield Site(f"runningEffects.entries[{i}].{k}", entry, k, "desc", owner=(entries, i))
    shouts = rec.get("shoutRecord")
    if isinstance(shouts, dict):
        for key in ("shouts", "wordsKnown", "wordsUnlocked"):
            items = shouts.get(key)
            if isinstance(items, list):
                for i, v in enumerate(items):
                    expect(v, "desc", f"shoutRecord.{key}[{i}]")
                    yield Site(f"shoutRecord.{key}[{i}]", items, i, "desc", owner=(items, i))
    chain = rec.get("templateChain")
    if isinstance(chain, list):
        for i, v in enumerate(chain):
            expect(v, "desc", f"templateChain[{i}]")
            yield Site(f"templateChain[{i}]", chain, i, "desc")
    nodes = rec.get("setNodeTextureSet")
    if isinstance(nodes, dict):
        for node in list(nodes):
            expect(nodes[node], "desc", f"setNodeTextureSet.{node}")
            yield Site(f"setNodeTextureSet.{node}", nodes, node, "desc", erase=True)


# ---------------------------------------------------------------- verdicts

@dataclass
class Context:
    written: Order | None
    candidates: list[Order]
    holdings: Holdings
    rebase: bool = True
    drop_unfixable: bool = False

    def tag(self, order: Order) -> str:
        return "written" if order is self.written else f"candidate {self.candidates.index(order) + 1}"


@dataclass
class Finding:
    file: str
    path: str
    desc: str
    verdict: str
    raw: int | None = None
    proposal: str | None = None
    name: str | None = None
    options: list[str] = field(default_factory=list)
    note: str | None = None
    fix: tuple[str, int] | None = None  # the one reading that fits, as (plugin, local)
    reading: tuple[str, int] | None = None  # a raw id under the written order

    def line(self) -> str:
        out = f"{self.file} {self.path} {self.desc} {self.verdict}"
        if self.proposal:
            out += f" -> {self.proposal} ({self.name or 'slot-only'})"
        elif self.options:
            out += " -> " + " | ".join(self.options)
        return out + (f" [{self.note}]" if self.note else "")

    def to_json(self) -> dict:
        return {k: v for k, v in (("file", self.file), ("path", self.path), ("desc", self.desc), ("raw", self.raw),
                                  ("verdict", self.verdict), ("proposal", self.proposal), ("name", self.name),
                                  ("options", self.options or None), ("note", self.note)) if v is not None}


def readings(fid: int | None, ctx: Context, skip: tuple[str, int] | None) -> list[tuple[Order, str, int, bool | None]]:
    """What `fid` reads as under each candidate: (order, plugin, local, held), skipping the written reading."""
    out = []
    for c in ctx.candidates:
        r = c.decode(fid) if fid is not None else None
        if r is None or r == skip or r[0] == "":
            continue
        light, _ = c.slot(r[0])  # type: ignore[misc]
        out.append((c, r[0], r[1], ctx.holdings.holds(r[0], r[1], light) if ctx.holdings.known else None))
    return out


def judge_desc(local: int, plugin: str, ctx: Context, empty_zero: bool = False) -> Finding:
    """The verdict on a form named by plugin and local id (the docstring's rules)."""
    f = Finding("", "", format_desc(local, plugin), "OK")
    if not plugin:
        return f  # a server-made form
    if empty_zero and local == 0:
        f.note = "empty slot"
        return f
    slot = ctx.written.slot(plugin) if ctx.written else None
    if slot is None:
        homes = [c for c in ctx.candidates if c.slot(plugin) is not None]
        if not homes:
            f.verdict = "DANGLING-PLUGIN"
            return f
        held = ctx.holdings.holds(plugin, local, homes[0].slot(plugin)[0])  # type: ignore[index]
        f.verdict = "OK" if held is not False else "DANGLING-FORM"
        f.note = "not in the written order: a server on it parks the entry"
        return f
    light, _ = slot
    if light and local > 0xFFF:
        f.verdict, f.note = "DANGLING-FORM", "local id over a light plugin's 12 bits"
        return f
    held = ctx.holdings.holds(plugin, local, light)
    if held:
        return f
    fid = ctx.written.compose(plugin, local)  # type: ignore[union-attr]
    alts = readings(fid, ctx, (plugin, local))
    if ctx.holdings.known and held is None:
        f.note = f"no file for {plugin} under the esm dir: decided by slot"
    if ctx.holdings.known and held is False:
        fits = [a for a in alts if a[3] is not False]
        if len(fits) == 1:
            c, p, l, _ = fits[0]
            f.verdict, f.fix, f.proposal = "MISBASED", (p, l), format_desc(l, p)
            f.name = ctx.holdings.name(p, l, c.slot(p)[0])  # type: ignore[index]
            f.note = ctx.tag(c)
        elif fits:
            f.verdict = "AMBIGUOUS"
            f.options = [f"{format_desc(l, p)} ({ctx.tag(c)})" for c, p, l, _ in fits]
        else:
            f.verdict = "DANGLING-FORM"
        return f
    if alts:  # slot-only: the records would decide
        f.verdict = "AMBIGUOUS"
        f.options = [f"{format_desc(local, plugin)} (written)"] + [f"{format_desc(l, p)} ({ctx.tag(c)})" for c, p, l, _ in alts]
    return f


def judge_raw(fid: int, ctx: Context, empty_zero: bool = False) -> Finding:
    """The verdict on a raw record's runtime id: its reading under the written order judged as a FormDesc, else the
    candidates' readings alone."""
    reading = ctx.written.decode(fid) if ctx.written else None
    if empty_zero and fid == 0:
        reading = reading or ("", 0)
    if reading is not None:
        f = judge_desc(reading[1], reading[0], ctx, empty_zero)
        f.desc, f.raw, f.reading = f"0x{fid:08x}={f.desc}", fid, reading
        return f
    f = Finding("", "", f"0x{fid:08x}=?", "DANGLING-PLUGIN", raw=fid)
    fits = [a for a in readings(fid, ctx, None) if a[3] is not False]
    if len(fits) == 1:
        c, p, l, _ = fits[0]
        f.verdict, f.fix, f.proposal, f.note = "MISBASED", (p, l), format_desc(l, p), ctx.tag(c)
        f.name = ctx.holdings.name(p, l, c.slot(p)[0]) if ctx.holdings.known else None  # type: ignore[index]
    elif fits:
        f.verdict = "AMBIGUOUS"
        f.options = [f"{format_desc(l, p)} ({ctx.tag(c)})" for c, p, l, _ in fits]
    else:
        f.note = "no given order has a plugin on this slot"
    return f


# ---------------------------------------------------------------- the repair

@dataclass
class Plan:
    name: str
    blob: bytes
    changed: bool = False
    converted: bool = False  # raw to formVersion 2
    stays_raw: bool = False  # a raw record with an entry nothing resolves, copied as it is
    dropped: int = 0


def sweep(obj) -> None:
    if isinstance(obj, list):
        obj[:] = [x for x in obj if x is not DROP]
        for x in obj:
            sweep(x)
    elif isinstance(obj, dict):
        for x in obj.values():
            sweep(x)


def finish_raw(rec: dict, forms: dict, parts: list) -> None:
    """The shape DescribeForms leaves a converted record in (MpChangeForms.cpp:316-342): the version mark, inventories
    with an entries list, appearanceForms beside a non-empty appearanceDump."""
    rec["formVersion"] = FORM_VERSION
    if not isinstance(rec.get("inv"), dict):
        rec["inv"] = {}
    rec["inv"].setdefault("entries", [])
    if not isinstance(rec.get("equipmentDump"), dict):
        rec["equipmentDump"] = {}
    if not isinstance(rec["equipmentDump"].get("inv"), dict):
        rec["equipmentDump"]["inv"] = {}
    rec["equipmentDump"]["inv"].setdefault("entries", [])
    if isinstance(rec.get("appearanceDump"), dict):
        forms["headpartIds"] = parts
        rec["appearanceForms"] = forms


def process(name: str, blob: bytes, ctx: Context) -> tuple[list[Finding], Plan]:
    """Every finding of one record and its repaired copy (or the record as it is)."""
    rec = json.loads(blob.decode("utf-8"))
    if not isinstance(rec, dict) or "formDesc" not in rec:
        raise ValueError(f"{name}: not a change form (no formDesc)")
    version = rec.get("formVersion", 1)
    if not isinstance(version, int) or isinstance(version, bool):
        raise ValueError(f"{name}: formVersion {version!r}")
    raw = version < FORM_VERSION
    forms: dict = {}
    parts: list = []
    findings: list[Finding] = []
    plan = Plan(name, blob)
    unconvertible = False
    for s in list(sites(rec, raw, forms, parts)):
        if s.kind == "raw":
            f = judge_raw(s.value, ctx, s.empty_zero)
        else:
            local, plugin = parse_desc(s.value)
            f = judge_desc(local, plugin, ctx, s.empty_zero)
        f.file, f.path = name, s.path
        findings.append(f)
        drop = (ctx.drop_unfixable and s.droppable and
                (f.verdict.startswith("DANGLING") or (f.verdict == "AMBIGUOUS" and ctx.holdings.known)))
        text = None
        if f.verdict == "MISBASED" and ctx.rebase and s.rewrite:
            text = format_desc(f.fix[1], f.fix[0])  # type: ignore[index]
        elif s.kind == "raw" and f.reading is not None:
            text = format_desc(f.reading[1], f.reading[0])
        if drop:
            if s.erase:
                del s.container[s.key]
            else:
                lst, i = s.owner  # type: ignore[misc]
                lst[i] = DROP
            plan.changed, plan.dropped = True, plan.dropped + 1
        elif s.kind == "raw":
            if text is None:
                unconvertible = True
            else:
                target, key = s.write or (s.container, s.key)
                target[key] = text  # type: ignore[index]
        elif text is not None and text != s.value:
            s.container[s.key] = text  # type: ignore[index]
            plan.changed = True
    if raw:
        if unconvertible:
            return findings, Plan(name, blob, stays_raw=True)
        finish_raw(rec, forms, parts)
        plan.changed = plan.converted = True
    sweep(rec)
    spells = rec.get("learnedSpells")
    if isinstance(spells, list) and len(set(spells)) != len(spells):
        spells[:] = list(dict.fromkeys(spells))
        plan.changed = True
    if plan.changed:
        plan.blob = json.dumps(rec, indent=2, sort_keys=True, ensure_ascii=False).encode("utf-8")
    return findings, plan


def load_records(world: Path) -> list[tuple[str, bytes]]:
    folder = world / "changeForms"
    if not folder.is_dir():
        raise ValueError(f"{world}: no changeForms/ directory")
    out = [(p.name, p.read_bytes()) for p in sorted(folder.iterdir()) if p.suffix == ".json" and p.is_file()]
    if not out:
        raise ValueError(f"{folder}: no records")
    return out


def is_raw(blob: bytes) -> bool:
    version = json.loads(blob.decode("utf-8")).get("formVersion", 1)
    return isinstance(version, int) and version < FORM_VERSION


def check_out(out: Path, world: Path) -> None:
    """Where a repaired copy may go: a new or empty directory, not the world, not the live server's or a snapshot's."""
    o, w = out.resolve(), world.resolve()
    if o == w or w in o.parents:
        raise ValueError(f"--out {out} is the input world (or inside it)")
    for forbidden in FORBIDDEN_OUT:
        if o == forbidden or forbidden in o.parents:
            raise ValueError(f"--out {out} is under {forbidden}: repaired worlds are copies, laid elsewhere")
    if o.exists() and (not o.is_dir() or any(o.iterdir())):
        raise ValueError(f"--out {out} exists and is not an empty directory")


def write_world(out: Path, plans: list[Plan], order: Order | None) -> None:
    (out / "changeForms").mkdir(parents=True, exist_ok=True)
    for plan in plans:
        (out / "changeForms" / plan.name).write_bytes(plan.blob)
    if order is not None:
        (out / "load-order.json").write_text(json.dumps(order.to_json(), indent=2, sort_keys=True), encoding="utf-8")


# ---------------------------------------------------------------- the command

def header_lines(world: Path, records: list[tuple[str, bytes]], ctx: Context, taken: bool) -> list[str]:
    raw = sum(1 for _, blob in records if is_raw(blob))
    lines = [f"world: {world}: {len(records)} records, {raw} raw, {len(records) - raw} plugin-relative"]
    if ctx.written is None:
        lines.append("written order: none (the candidates alone decide; --out needs --order)")
    else:
        lines.append(f"written order: {ctx.written.describe()}" + (" (the one --candidate, taken as the order)" if taken else ""))
    for i, c in enumerate(ctx.candidates, 1):
        lines.append(f"candidate {i}: {c.describe()}")
    if ctx.holdings.esm_dir is not None:
        lines.append(f"records: {ctx.holdings.esm_dir} ({len(ctx.holdings.files)} plugin files)")
    else:
        lines.append("records: none (slot-only: DANGLING-PLUGIN and the candidate decode by slot; whether a plugin holds a "
                     "form is not read, so a form that reads under a candidate too is AMBIGUOUS and a MISBASED needs a "
                     "slot the written order lacks; give --esm-dir to decide them)")
    return lines


def run(args: argparse.Namespace) -> int:
    world = Path(args.world)
    esm_dir = Path(args.esm_dir) if args.esm_dir else None
    if esm_dir is not None and not esm_dir.is_dir():
        raise ValueError(f"--esm-dir {esm_dir} is not a directory")
    records = load_records(world)
    candidates = [read_order(Path(p), esm_dir) for p in args.candidate]
    if args.order:
        written: Order | None = read_order(Path(args.order), esm_dir)
    elif (world / "load-order.json").is_file():
        written = read_order(world / "load-order.json", esm_dir)
    else:
        written = None
    taken = False
    if written is None:
        if not any(is_raw(blob) for _, blob in records):
            raise ValueError(f"{world}: plugin-relative records and no load-order.json: give --order")
        if not candidates:
            raise ValueError(f"{world}: a raw world with no load-order.json needs --order or --candidate")
        if len(candidates) == 1:
            written, candidates, taken = candidates[0], [], True
    out = Path(args.out) if args.out else None
    if out is not None:
        check_out(out, world)
        if written is None:
            raise ValueError("--out needs a written order (--order) when several candidates and no load-order.json are given")
    ctx = Context(written, candidates, Holdings(esm_dir), rebase=not args.no_rebase, drop_unfixable=args.drop_unfixable)
    findings: list[Finding] = []
    plans: list[Plan] = []
    for name, blob in records:
        found, plan = process(name, blob, ctx)
        findings.extend(found)
        plans.append(plan)
    report = findings_report(findings)
    header = header_lines(world, records, ctx, taken)
    if args.json:
        print("\n".join(header), file=sys.stderr)
        print(json.dumps([f.to_json() for f in findings if f.verdict != "OK"], indent=2))
    else:
        print("\n".join(header))
        for f in findings:
            if f.verdict != "OK":
                print(f.line())
        print(report)
    if out is not None:
        write_world(out, plans, written)
        summary = (f"wrote {out}: {len(plans)} records, {sum(p.changed for p in plans)} changed, "
                   f"{sum(p.converted for p in plans)} converted from raw, {sum(p.stays_raw for p in plans)} left raw, "
                   f"{sum(p.dropped for p in plans)} entries dropped" + (", load-order.json" if written else ""))
        print(summary, file=sys.stderr if args.json else sys.stdout)
    return 1 if any(f.verdict != "OK" for f in findings) else 0


def findings_report(findings: list[Finding]) -> str:
    counts = {v: sum(1 for f in findings if f.verdict == v) for v in VERDICTS}
    return "verdicts: " + ", ".join(f"{v} {n}" for v, n in counts.items() if n or v == "OK")


def parser() -> argparse.ArgumentParser:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0], formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("world", nargs="?", help="the world directory (changeForms/ and load-order.json)")
    ap.add_argument("--order", help="the order the world was written under: a load-order.json or a server-settings.json")
    ap.add_argument("--candidate", action="append", default=[], metavar="ORDER",
                    help="another order the ids may have been written under (repeatable)")
    ap.add_argument("--esm-dir", help="the plugins the orders name (sky-srv: /srv/persist/esm/1.6.1170)")
    ap.add_argument("--out", help="write the repaired copy here (a new or empty directory)")
    ap.add_argument("--drop-unfixable", action="store_true", help="drop DANGLING (and decided AMBIGUOUS) entries")
    ap.add_argument("--no-rebase", action="store_true", help="leave MISBASED forms as written")
    ap.add_argument("--json", action="store_true", help="the findings as a JSON list on stdout")
    ap.add_argument("--self-test", action="store_true", help="check the tool on a built world and exit")
    return ap


def main(argv: list[str]) -> int:
    args = parser().parse_args(argv)
    if args.self_test:
        return self_test()
    if not args.world:
        parser().print_usage(sys.stderr)
        return 2
    try:
        return run(args)
    except (ValueError, OSError, json.JSONDecodeError) as e:
        print(f"world-repair: {e}", file=sys.stderr)
        return 2


# ---------------------------------------------------------------- self-test

MAIN_ORDER = [("Skyrim.esm", False), ("Update.esm", False), ("Dawnguard.esm", False), ("HearthFires.esm", False),
              ("Dragonborn.esm", False), ("ccBGSSSE001-Fish.esm", False), ("ccQDRSSE001-SurvivalMode.esl", True),
              ("ccBGSSSE037-Curios.esl", True), ("ccBGSSSE025-AdvDSGS.esm", False), ("_ResourcePack.esl", True),
              ("RaceCompatibility.esm", False), ("rotfern.esp", False), ("RaceMenu.esp", False),
              ("RaceMenuPlugin.esp", False), ("LostGrimoire.esp", False), ("Apocalypse - Magic of Skyrim.esp", False),
              ("Headshot Kills.esp", True)]
APOCALYPSE, LOSTGRIMOIRE = "Apocalypse - Magic of Skyrim.esp", "LostGrimoire.esp"


def layer_order() -> list[tuple[str, bool]]:
    """A synthetic essentials-layer order with the slots the lab measured (Cloaks.esp 0B, Cloaks - Dawnguard.esp 0C,
    Apocalypse 1A, LostGrimoire 28, rotfern 2F; the first eight served rows are lab/layer/load-order.tsv's), the
    rest filler names."""
    order = MAIN_ORDER[:10] + [("unofficial skyrim special edition patch.esp", False), ("GeneralDisplays.esm", False),
                               ("TrueHUD.esl", True), ("ApachiiHair.esm", False),
                               ("Conjuration Summoner Perk Applies to All Creatures.esl", True),
                               ("RaceCompatibility.esm", False), ("Cloaks.esp", False), ("Cloaks - Dawnguard.esp", False)]
    order += [(f"Layer-{i:02X}.esp", False) for i in range(0x0D, 0x1A)] + [(APOCALYPSE, False)]
    order += [(f"Layer-{i:02X}.esp", False) for i in range(0x1B, 0x28)] + [(LOSTGRIMOIRE, False)]
    order += [(f"Layer-{i:02X}.esp", False) for i in range(0x29, 0x2F)] + [("rotfern.esp", False), ("Headshot Kills.esp", True)]
    return order


def self_test() -> int:
    checks: list[str] = []

    def ok(cond: bool, what: str) -> None:
        checks.append(("ok  " if cond else "FAIL") + " " + what)

    def write_order(path: Path, files: list[tuple[str, bool]]) -> Path:
        path.write_text(json.dumps({"files": [{"light": l, "name": n} for n, l in files]}, indent=2, sort_keys=True))
        return path

    def verdicts(findings: list[Finding]) -> dict[str, Finding]:
        return {f.path: f for f in findings}

    table = {"Skyrim.esm": {0x7: "Player", 0x3C: "Tamriel", 0xF: "Gold001", 0x12FD0: "Firebolt", 0x13E09: "UnrelentingForce",
                            0xEC1B2: "FemaleEyesHumanBrown"},
             LOSTGRIMOIRE: {0xA86DF: "Teleportation"}, APOCALYPSE: {0xAAE8: "Ghostwalk", 0x186D: "ApocDiverseVisions"},
             "rotfern.esp": {0xAA00: "rotfernRace", 0x2E110: "rotfernHeadTXST", 0x2E117: "rotfernHair"},
             "ccBGSSSE037-Curios.esl": {0x81E: "ccBGSSSE037_SloadSoap"}, "Cloaks.esp": {0x800: "CloaksOfSkyrim"},
             "Cloaks - Dawnguard.esp": {0x800: "CloaksDG"}, "GeneralDisplays.esm": {0x800: "GD"}}
    raw_record = {"recType": 1, "formDesc": "1", "baseDesc": "7:Skyrim.esm", "worldOrCellDesc": "3c:Skyrim.esm",
                  "spawnPoint_cellOrWorldDesc": "3c:Skyrim.esm", "position": [0.0, 0.0, 0.0], "angle": [0.0, 0.0, 0.0],
                  "inv": {"entries": [{"baseId": 0xF, "count": 140}, {"baseId": 0x0802E110, "count": 1}]},
                  "equipmentDump": {"inv": {"entries": []}, "numChanges": 1, "leftSpell": 0x0B0A86DF, "rightSpell": 0,
                                    "voiceSpell": 0x13E09},
                  "learnedSpells": [0x12FD0, 0x0B0A86DF, 0x1A00AAE8],
                  "appearanceDump": {"raceId": 0x0800AA00, "headTextureSetId": 0x0802E110, "headpartIds": [0x0802E117, 0xEC1B2],
                                     "name": "rotfern", "isFemale": True},
                  "dynamicFields": {}, "profileId": 1, "isDeleted": False,
                  "shoutRecord": {"shouts": ["13e09:Skyrim.esm"], "wordsKnown": [], "wordsUnlocked": []}}
    v2_record = {"recType": 1, "formVersion": 2, "formDesc": "2", "baseDesc": "7:Skyrim.esm", "worldOrCellDesc": "3c:Skyrim.esm",
                 "spawnPoint_cellOrWorldDesc": "3c:Skyrim.esm", "inv": {"entries": []},
                 "equipmentDump": {"inv": {"entries": [{"baseId": "81e:ccBGSSSE037-Curios.esl", "count": 1, "worn": True}]},
                                   "numChanges": 2, "leftSpell": "aae8:Cloaks - Dawnguard.esp", "rightSpell": "0:Skyrim.esm"},
                 "learnedSpells": ["12fd0:Skyrim.esm", "a86df:Cloaks.esp", "aae8:Cloaks - Dawnguard.esp",
                                   f"aae8:{APOCALYPSE}", "1234:Nowhere.esp"],
                 "appearanceDump": None, "dynamicFields": {}, "profileId": 2}

    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        main_json = write_order(root / "main.json", MAIN_ORDER)
        layer_json = write_order(root / "layer.json", layer_order())
        main_o, layer_o = read_order(main_json, None), read_order(layer_json, None)
        ok(main_o.slot(LOSTGRIMOIRE) == (False, 0x0B) and main_o.slot(APOCALYPSE) == (False, 0x0C), "main numbers LostGrimoire 0B, Apocalypse 0C")
        ok(main_o.slot("Headshot Kills.esp") == (True, 3) and main_o.decode(0xFE00181E) == ("ccBGSSSE037-Curios.esl", 0x81E),
           "light plugins numbered apart in list order (Headshot Kills FE003, Curios FE001)")
        ok(layer_o.slot("Cloaks.esp") == (False, 0x0B) and layer_o.slot("Cloaks - Dawnguard.esp") == (False, 0x0C)
           and layer_o.slot(APOCALYPSE) == (False, 0x1A) and layer_o.slot(LOSTGRIMOIRE) == (False, 0x28)
           and layer_o.slot("rotfern.esp") == (False, 0x2F), "the layer numbers Cloaks 0B, Cloaks - Dawnguard 0C, Apocalypse 1A, LostGrimoire 28, rotfern 2F")
        ok(main_o.decode(0x1A00AAE8) is None and main_o.decode(0xFF000001) == ("", 1), "main has no slot 1A; 0xFF... is server-made")

        # a raw world written under main, with one learned spell written under each order
        raw_world = root / "raw"
        (raw_world / "changeForms").mkdir(parents=True)
        (raw_world / "changeForms" / "1.json").write_text(json.dumps(raw_record, indent=2, sort_keys=True))
        blob = (raw_world / "changeForms" / "1.json").read_bytes()
        slot_only = Context(main_o, [layer_o], Holdings())
        found, plan = process("1.json", blob, slot_only)
        v = verdicts(found)
        ok(v["learnedSpells[1]"].verdict == "AMBIGUOUS" and "a86df:Cloaks.esp (candidate 1)" in v["learnedSpells[1]"].options,
           "slot-only: 0x0B0A86DF reads under both orders, AMBIGUOUS")
        ok(v["learnedSpells[2]"].verdict == "MISBASED" and v["learnedSpells[2]"].proposal == f"aae8:{APOCALYPSE}",
           "slot-only: 0x1A00AAE8 has no slot under main, MISBASED to the layer's Apocalypse")
        ok(v["equipmentDump.rightSpell"].verdict == "OK" and v["inv.entries[0].baseId"].verdict == "OK"
           and v["appearanceDump.headpartIds[1]"].verdict == "OK", "slot-only: an empty slot and Skyrim.esm forms are OK")
        ok(v["appearanceDump.raceId"].verdict == "AMBIGUOUS", "slot-only: rotfern's race under main reads as GeneralDisplays under the layer")
        with_table = Context(main_o, [layer_o], Holdings(table=table))
        found, plan = process("1.json", blob, with_table)
        v = verdicts(found)
        ok(all(f.verdict == "OK" for f in found if f.path != "learnedSpells[2]"), "with records: every form held by main's plugin is OK")
        ok(v["learnedSpells[2]"].verdict == "MISBASED" and v["learnedSpells[2]"].name == "Ghostwalk", "with records: the layer's Ghostwalk id is MISBASED, named")
        out = json.loads(plan.blob)
        ok(plan.converted and out["formVersion"] == 2, "raw record converted to formVersion 2")
        ok(out["learnedSpells"] == ["12fd0:Skyrim.esm", f"a86df:{LOSTGRIMOIRE}", f"aae8:{APOCALYPSE}"], "learnedSpells described and the mis-based one re-based")
        ok(out["inv"]["entries"][1]["baseId"] == "2e110:rotfern.esp" and out["inv"]["entries"][0]["baseId"] == "f:Skyrim.esm", "inventory entries described")
        ok(out["equipmentDump"]["leftSpell"] == f"a86df:{LOSTGRIMOIRE}" and out["equipmentDump"]["rightSpell"] == "0:Skyrim.esm"
           and "instantSpell" not in out["equipmentDump"], "spell slots: described, the empty one 0:Skyrim.esm, the absent one absent")
        ok(out["appearanceForms"] == {"raceId": "aa00:rotfern.esp", "headTextureSetId": "2e110:rotfern.esp",
                                      "headpartIds": ["2e117:rotfern.esp", "ec1b2:Skyrim.esm"]}
           and out["appearanceDump"]["raceId"] == 0x0800AA00, "appearanceForms built beside an unchanged appearanceDump")
        ok(out["shoutRecord"]["shouts"] == ["13e09:Skyrim.esm"] and out["baseDesc"] == "7:Skyrim.esm", "FormDesc fields of a raw record untouched")
        found2, plan2 = process("1.json", blob, slot_only)
        ok(plan2.blob == plan.blob, "slot-only conversion writes the same record (the written order's readings, the one slot-only MISBASED re-based)")
        # a raw record with an id no order places stays raw unless dropped
        orphan = dict(raw_record, learnedSpells=[0x12FD0, 0x7F000001])
        oblob = json.dumps(orphan).encode()
        found, plan = process("1.json", oblob, with_table)
        ok(verdicts(found)["learnedSpells[1]"].verdict == "DANGLING-PLUGIN" and plan.stays_raw and plan.blob == oblob,
           "a raw record with an id on no order's slot stays raw, byte for byte")
        found, plan = process("1.json", oblob, Context(main_o, [layer_o], Holdings(table=table), drop_unfixable=True))
        ok(plan.converted and json.loads(plan.blob)["learnedSpells"] == ["12fd0:Skyrim.esm"] and plan.dropped == 1,
           "--drop-unfixable drops it, as the server would, and the record converts")

        # a version 2 world written under the layer, with a dangling and mis-based entries
        v2_world = root / "v2"
        (v2_world / "changeForms").mkdir(parents=True)
        write_order(v2_world / "load-order.json", layer_order())
        v2_blob = json.dumps(v2_record, indent=2, sort_keys=True).encode()
        (v2_world / "changeForms" / "2.json").write_bytes(v2_blob)
        found, plan = process("2.json", v2_blob, Context(layer_o, [main_o], Holdings()))
        v = verdicts(found)
        ok(v["learnedSpells[1]"].verdict == "AMBIGUOUS" and v["learnedSpells[2]"].verdict == "AMBIGUOUS"
           and v["learnedSpells[3]"].verdict == "OK" and v["learnedSpells[4]"].verdict == "DANGLING-PLUGIN"
           and v["equipmentDump.inv.entries[0].baseId"].verdict == "OK",
           "slot-only v2: Cloaks readings AMBIGUOUS, Apocalypse at 1A OK (main has no 1A), Nowhere.esp DANGLING-PLUGIN, Curios FE001 OK")
        ok(not plan.changed and plan.blob == v2_blob, "slot-only, no flags: the record is copied byte for byte")
        found, plan = process("2.json", v2_blob, Context(layer_o, [main_o], Holdings(), drop_unfixable=True))
        ok(json.loads(plan.blob)["learnedSpells"][:4] == v2_record["learnedSpells"][:4] and plan.dropped == 1,
           "slot-only --drop-unfixable drops the dangling plugin's entry and keeps the AMBIGUOUS ones")
        ctx = Context(layer_o, [main_o], Holdings(table=table))
        found, plan = process("2.json", v2_blob, ctx)
        v = verdicts(found)
        ok(v["learnedSpells[1]"].verdict == "MISBASED" and v["learnedSpells[1]"].proposal == f"a86df:{LOSTGRIMOIRE}"
           and v["learnedSpells[1]"].name == "Teleportation", "with records: a86df:Cloaks.esp is MISBASED to LostGrimoire's Teleportation")
        ok(v["learnedSpells[2]"].verdict == "MISBASED" and v["equipmentDump.leftSpell"].verdict == "MISBASED"
           and v["equipmentDump.leftSpell"].proposal == f"aae8:{APOCALYPSE}", "with records: the Cloaks - Dawnguard readings are Apocalypse's")
        out = json.loads(plan.blob)
        ok(out["learnedSpells"] == ["12fd0:Skyrim.esm", f"a86df:{LOSTGRIMOIRE}", f"aae8:{APOCALYPSE}", "1234:Nowhere.esp"],
           "re-based and deduped, the dangling entry kept without --drop-unfixable")
        ok(out["equipmentDump"]["leftSpell"] == f"aae8:{APOCALYPSE}" and out["equipmentDump"]["rightSpell"] == "0:Skyrim.esm", "the equipment slot re-based, the empty one kept")
        found, plan = process("2.json", v2_blob, Context(layer_o, [main_o], Holdings(table=table), rebase=False, drop_unfixable=True))
        out = json.loads(plan.blob)
        expected = dict(v2_record, learnedSpells=v2_record["learnedSpells"][:4])
        ok(out == expected and plan.dropped == 1, "--no-rebase --drop-unfixable: one entry gone, everything else equal in content")

        # the command: refusals and the written copy
        import io
        from contextlib import redirect_stderr, redirect_stdout
        def cli(*argv: str) -> tuple[int, str, str]:
            o, e = io.StringIO(), io.StringIO()
            with redirect_stdout(o), redirect_stderr(e):
                code = main(list(argv))
            return code, o.getvalue(), e.getvalue()
        bare = root / "bare"
        (bare / "changeForms").mkdir(parents=True)
        (bare / "changeForms" / "2.json").write_bytes(v2_blob)
        code, _, err = cli(str(bare))
        ok(code == 2 and "give --order" in err, "a version 2 world with no order is refused (exit 2)")
        code, _, err = cli(str(raw_world))
        ok(code == 2 and "--order or --candidate" in err, "a raw world with no order and no candidate is refused (exit 2)")
        code, _, err = cli(str(raw_world), "--order", str(main_json), "--out", str(raw_world))
        ok(code == 2 and "input world" in err, "--out into the input world is refused")
        code, text, _ = cli(str(raw_world), "--candidate", str(main_json), "--candidate", str(layer_json))
        ok(code == 1 and "written order: none" in text and "learnedSpells[2] 0x1a00aae8=? MISBASED" in text, "candidates alone judge a raw world (no --out)")
        code, text, _ = cli(str(v2_world), "--candidate", str(main_json), "--out", str(root / "fixed"), "--json")
        fixed = json.loads((root / "fixed" / "changeForms" / "2.json").read_text())
        ok(code == 1 and json.loads(text)[0]["verdict"] in VERDICTS, "--json prints the findings as a list")
        ok(fixed["learnedSpells"][:3] == v2_record["learnedSpells"][:3] and (root / "fixed" / "load-order.json").exists()
           and json.loads((root / "fixed" / "load-order.json").read_text()) == layer_o.to_json(),
           "the copy keeps slot-only AMBIGUOUS forms as written and lays the written order beside it")
        code, text, _ = cli(str(raw_world), "--order", str(main_json), "--candidate", str(layer_json), "--out", str(root / "fixed-raw"))
        fixed = json.loads((root / "fixed-raw" / "changeForms" / "1.json").read_text())
        ok(code == 1 and fixed["formVersion"] == 2 and fixed["learnedSpells"][2] == f"aae8:{APOCALYPSE}", "the command converts a raw world to version 2 in its copy")
        ok(load_records(root / "fixed-raw") == [("1.json", (root / "fixed-raw" / "changeForms" / "1.json").read_bytes())]
           and (root / "fixed-raw" / "load-order.json").read_text() == json.dumps(main_o.to_json(), indent=2, sort_keys=True),
           "load-order.json written as the server's dump(2), sorted keys")
    print("\n".join(checks))
    failed = sum(1 for c in checks if c.startswith("FAIL"))
    print(f"self-test: {len(checks) - failed} of {len(checks)} checks passed")
    return 0 if not failed else 1


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
