#!/usr/bin/env python3
"""Read records from a TES4-format plugin (Skyrim.esm) by editor id.

The server's validators take game numbers (activation reach, movement speeds)
from the master files, never from memory (CLAUDE.md rule 1 in spirit). This
finds the record that holds one and prints its form id and fields. It runs
where the master files are (sky-srv: /srv/persist/esm), because licensed
files never leave rpool/sky.

Format (UESP, "Skyrim Mod:Mod File Format"): a record is a 24-byte header
(type, data size, flags, form id, timestamp, version control, internal
version, unknown) and its fields; flag 0x00040000 means the data is a uint32
decompressed size followed by zlib data. A GRUP header is 24 bytes (type,
size including the header, label, group type, timestamp, version control,
unknown). A field is type, uint16 size, data; after an XXXX field the next
field's size is the uint32 that XXXX carried.

    esm.py find <plugin> <TYPE> <editor id substring>
    esm.py near <plugin> <world form id> <x> <y> <radius> <TYPE,TYPE,...>
    esm.py ref <plugin> <form id>
    esm.py id <plugin> <form id>
    esm.py races <plugin>
    esm.py attacks <plugin> <race editor id substring>

`near` lists the references placed in a worldspace within a radius (in the
x-y plane) whose base record is one of the types, e.g. FLOR,CONT,ACTI,DOOR:
the objects a scenario can activate around a spot. `races` lists the plugin's
RACE records with their Playable and Child flags: the races the race menu
offers are the playable ones (docs/verbs/character-creation.md). `attacks`
lists a race's attack data, one ATKD and its ATKE event name per attack
(UESP, "Skyrim Mod:Mod File Format/RACE": damage mult, chance, spell, flags,
attack angle, strike angle, stagger, attack type, knockdown, recovery,
stamina mult; the same order as CommonLibSSE-NG's BGSAttackData::AttackData).
The strike angle is the half angle of the engine's hit cone for that attack
(docs/verbs/melee-reach.md).
"""

from __future__ import annotations

import struct
import sys
import zlib
from dataclasses import dataclass, field
from typing import Iterator

RECORD = struct.Struct("<4sIIIHHHH")
# RACE DATA: seven skill boosts (14 bytes), 2 bytes, four floats (heights and
# weights), then the uint32 flags at byte 32 (UESP, "Skyrim Mod:Mod File
# Format/RACE"; libespm's RACE.cpp reads the same offset)
RACE_FLAGS_AT = 32
RACE_PLAYABLE = 1 << 0
RACE_CHILD = 1 << 2
GROUP = struct.Struct("<4sI4siHHI")
FIELD = struct.Struct("<4sH")
COMPRESSED = 0x00040000


@dataclass
class Record:
    type: str
    form_id: int
    flags: int
    fields: list[tuple[str, bytes]] = field(default_factory=list)

    def get(self, name: str) -> bytes | None:
        return next((d for t, d in self.fields if t == name), None)

    @property
    def editor_id(self) -> str:
        raw = self.get("EDID") or b""
        return raw.split(b"\0", 1)[0].decode("latin-1")


def parse_fields(data: bytes) -> list[tuple[str, bytes]]:
    out: list[tuple[str, bytes]] = []
    pos, big = 0, None
    while pos + FIELD.size <= len(data):
        ftype, size = FIELD.unpack_from(data, pos)
        pos += FIELD.size
        if big is not None:
            size, big = big, None
        name = ftype.decode("latin-1")
        chunk = data[pos:pos + size]
        pos += size
        if name == "XXXX":
            big = struct.unpack("<I", chunk)[0]
            continue
        out.append((name, chunk))
    return out


def record_at(buf: bytes, pos: int) -> tuple[Record, int]:
    rtype, size, flags, form_id, *_ = RECORD.unpack_from(buf, pos)
    body = buf[pos + RECORD.size:pos + RECORD.size + size]
    if flags & COMPRESSED:
        body = zlib.decompress(body[4:])
    return Record(rtype.decode("latin-1"), form_id, flags, parse_fields(body)), pos + RECORD.size + size


def walk(buf: bytes, start: int, end: int, want: str) -> Iterator[Record]:
    """Every record of type `want` between start and end, descending into
    groups (records of other types are skipped without parsing)."""
    pos = start
    while pos + RECORD.size <= end:
        tag = buf[pos:pos + 4]
        if tag == b"GRUP":
            _, gsize, label, gtype, *_ = GROUP.unpack_from(buf, pos)
            # a top-level group (type 0) is labelled with its record type;
            # skip whole top-level groups of other types
            if gtype != 0 or label.decode("latin-1") == want:
                yield from walk(buf, pos + GROUP.size, pos + gsize, want)
            pos += gsize
            continue
        rtype, size = struct.unpack_from("<4sI", buf, pos)
        if rtype.decode("latin-1") == want:
            rec, _ = record_at(buf, pos)
            yield rec
        pos += RECORD.size + size


def headers(buf: bytes, start: int, end: int, top: set[str] | None, world: int | None = None) -> Iterator[tuple[str, int, int, int | None]]:
    """(type, form id, offset, worldspace) for every record in the top-level
    groups labelled in `top` (all of them when None), descending into nested
    groups; a World Children group (type 1) names the worldspace below it."""
    pos = start
    while pos + RECORD.size <= end:
        if buf[pos:pos + 4] == b"GRUP":
            _, gsize, label, gtype, *_ = GROUP.unpack_from(buf, pos)
            if gtype != 0 or top is None or label.decode("latin-1") in top:
                inner = struct.unpack("<I", label)[0] if gtype == 1 else world
                yield from headers(buf, pos + GROUP.size, pos + gsize, None, inner)
            pos += gsize
            continue
        rtype, size, _, form_id = struct.unpack_from("<4sIII", buf, pos)
        yield rtype.decode("latin-1"), form_id, pos, world
        pos += RECORD.size + size


@dataclass
class Placed:
    form_id: int
    base_id: int
    base_type: str
    base_editor_id: str
    pos: tuple[float, float, float]
    distance: float


def near(buf: bytes, world: int, x: float, y: float, radius: float, types: set[str]) -> list[Placed]:
    bases = {fid: (t, off) for t, fid, off, _ in headers(buf, 0, len(buf), types) if t in types}
    out: list[Placed] = []
    for t, fid, off, w in headers(buf, 0, len(buf), {"WRLD"}):
        if t != "REFR" or w != world:
            continue
        rec, _ = record_at(buf, off)
        name, data = rec.get("NAME"), rec.get("DATA")
        if not name or not data or len(data) < 12:
            continue
        base = struct.unpack("<I", name[:4])[0]
        if base not in bases:
            continue
        px, py, pz = struct.unpack_from("<3f", data)
        d = ((px - x) ** 2 + (py - y) ** 2) ** 0.5
        if d <= radius:
            btype, boff = bases[base]
            out.append(Placed(fid, base, btype, record_at(buf, boff)[0].editor_id, (px, py, pz), d))
    return sorted(out, key=lambda p: p.distance)


def ref(buf: bytes, form_id: int) -> tuple[Record, int | None] | None:
    """A placed reference (REFR or ACHR) by form id, exterior or interior,
    with the worldspace it is placed in (None inside a cell)."""
    for t, fid, off, world in headers(buf, 0, len(buf), {"WRLD", "CELL"}):
        if fid == form_id and t in ("REFR", "ACHR"):
            return record_at(buf, off)[0], world
    return None


def race_flags(rec: Record) -> int | None:
    data = rec.get("DATA") or b""
    if len(data) < RACE_FLAGS_AT + 4:
        return None
    return struct.unpack_from("<I", data, RACE_FLAGS_AT)[0]


@dataclass
class Attack:
    event: str
    flags: int
    attack_angle: float
    strike_angle: float


def race_attacks(rec: Record) -> list[Attack]:
    """A race's ATKD records, each named by the ATKE that follows it."""
    out: list[Attack] = []
    pending: tuple[int, float, float] | None = None
    for name, data in rec.fields:
        if name == "ATKD" and len(data) >= 24:
            flags = struct.unpack_from("<I", data, 12)[0]
            angle, strike = struct.unpack_from("<2f", data, 16)
            pending = (flags, angle, strike)
        elif name == "ATKE" and pending is not None:
            out.append(Attack(data.split(b"\0", 1)[0].decode("latin-1"), *pending))
            pending = None
    return out


def find(buf: bytes, rtype: str, needle: str) -> list[Record]:
    return [r for r in walk(buf, 0, len(buf), rtype) if needle.lower() in r.editor_id.lower()]


def gmst_value(rec: Record) -> object:
    """A game setting's value by its editor id's type letter (f float, i int,
    u unsigned, b bool); strings are localized ids in Skyrim.esm."""
    data = rec.get("DATA") or b""
    kind = rec.editor_id[:1]
    if len(data) < 4:
        return None
    if kind == "f":
        return struct.unpack_from("<f", data)[0]
    if kind == "i":
        return struct.unpack_from("<i", data)[0]
    if kind in ("u", "b"):
        return struct.unpack_from("<I", data)[0]
    return data.hex()


def describe(rec: Record) -> str:
    head = f"{rec.type} {rec.form_id:#010x} {rec.editor_id}"
    if rec.type == "GMST":
        return f"{head} = {gmst_value(rec)}"
    parts = []
    for name, data in rec.fields:
        if name == "EDID":
            continue
        if len(data) == 4:
            u, f = struct.unpack("<I", data)[0], struct.unpack("<f", data)[0]
            parts.append(f"{name}[4] {u:#010x} (float {f:g})")
        elif len(data) % 4 == 0 and 0 < len(data) <= 64:
            floats = struct.unpack(f"<{len(data) // 4}f", data)
            parts.append(f"{name}[{len(data)}] floats {['%g' % v for v in floats]}")
        else:
            parts.append(f"{name}[{len(data)}] {data[:32].hex()}")
    return head + ("\n  " + "\n  ".join(parts) if parts else "")


def main(argv: list[str]) -> int:
    if len(argv) == 5 and argv[1] == "find":
        with open(argv[2], "rb") as f:
            buf = f.read()
        hits = find(buf, argv[3], argv[4])
        for rec in hits:
            print(describe(rec))
        return 0 if hits else 1
    if len(argv) == 8 and argv[1] == "near":
        with open(argv[2], "rb") as f:
            buf = f.read()
        placed = near(buf, int(argv[3], 0), float(argv[4]), float(argv[5]), float(argv[6]), set(argv[7].split(",")))
        for p in placed:
            print(f"{p.form_id:#010x} {p.base_type} {p.base_id:#010x} {p.base_editor_id} at ({p.pos[0]:.0f}, {p.pos[1]:.0f}, {p.pos[2]:.0f}), {p.distance:.0f} away")
        return 0 if placed else 1
    if len(argv) == 4 and argv[1] == "id":
        with open(argv[2], "rb") as f:
            buf = f.read()
        want = int(argv[3], 0)
        for t, fid, off, _ in headers(buf, 0, len(buf), None):
            if fid == want:
                print(describe(record_at(buf, off)[0]))
                return 0
        return 1
    if len(argv) == 3 and argv[1] == "races":
        with open(argv[2], "rb") as f:
            buf = f.read()
        races = list(walk(buf, 0, len(buf), "RACE"))
        for rec in races:
            flags = race_flags(rec)
            if flags is None:
                print(f"{rec.form_id:#010x} {rec.editor_id} (no DATA flags)")
                continue
            print(f"{rec.form_id:#010x} {rec.editor_id}"
                  f"{' playable' if flags & RACE_PLAYABLE else ''}{' child' if flags & RACE_CHILD else ''}")
        return 0 if races else 1
    if len(argv) == 4 and argv[1] == "attacks":
        with open(argv[2], "rb") as f:
            buf = f.read()
        hits = [r for r in find(buf, "RACE", argv[3])]
        for rec in hits:
            attacks = race_attacks(rec)
            widest = max((a.strike_angle for a in attacks), default=0.0)
            forward = max((a.strike_angle for a in attacks if a.attack_angle == 0.0), default=0.0)
            print(f"{rec.form_id:#010x} {rec.editor_id}: {len(attacks)} attacks, widest strike angle {widest:g}, forward {forward:g}")
            for a in attacks:
                print(f"  {a.event:32} strike {a.strike_angle:g} angle {a.attack_angle:g} flags {a.flags:#x}")
        return 0 if hits else 1
    if len(argv) == 4 and argv[1] == "ref":
        with open(argv[2], "rb") as f:
            buf = f.read()
        hit = ref(buf, int(argv[3], 0))
        if not hit:
            return 1
        rec, world = hit
        data = rec.get("DATA") or b""
        base = struct.unpack("<I", (rec.get("NAME") or b"\0\0\0\0")[:4])[0]
        scale = struct.unpack("<f", rec.get("XSCL"))[0] if rec.get("XSCL") else 1.0
        pos = struct.unpack_from("<3f", data) if len(data) >= 12 else (0.0, 0.0, 0.0)
        where = f"world {world:#x}" if world is not None else "a cell"
        print(f"{rec.type} {rec.form_id:#010x} base {base:#010x} in {where} at ({pos[0]:.1f}, {pos[1]:.1f}, {pos[2]:.1f}) scale {scale:g}")
        if rec.get("XMRK") is not None:
            # a map marker (docs/verbs/map-markers.md): FNAM flags (visible,
            # can travel to, show all hidden), TNAM type (the engine's
            # MARKER_TYPE), FULL name (an lstring id in a localized master)
            fnam = rec.get("FNAM") or b"\0"
            tnam = rec.get("TNAM") or b"\0\0"
            full = rec.get("FULL") or b""
            name = f"lstring {struct.unpack('<I', full[:4])[0]:#x}" if len(full) >= 4 else "none"
            print(f"  map marker: type {struct.unpack('<H', tnam[:2])[0]} flags {fnam[0]:#x} name {name}")
        return 0
    print(__doc__, file=sys.stderr)
    return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv))
