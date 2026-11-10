#!/usr/bin/env python3
"""build_esp.py [out.esp]: RotfernEyes.esp, the companion plugin of thuum D-E1 (Eli, 2026-11-09), written byte by byte.

One light (ESL-flagged) plugin with one record: a start-game-enabled quest whose only alias is the player (unique actor 0x7),
carrying the script RotfernEyesAlias (src/RotfernEyesAlias.psc) with its seven properties: rotfern's two races, her four eye head
parts and Dragonborn's DLC2MQ06. rotfern.esp is read, never written. The same bytes come out of every run (no timestamps), so the
plugin is reproducible from this file alone.

Layout per UESP "Skyrim Mod:Mod File Format" (TES4, QUST, VMAD), matched against a quest the game loads every session:
RaceMenuMorphsCBBE.esp's QUST 0x800 (CBBE 2.0.3 folder 26), whose player alias carries a script the same way. Its VMAD with no
fragments still writes the fragment block's empty file name, and its alias entry names the quest itself and alias 0.
Form ids were read from the files, not typed from memory: DLC2MQ06 is QUST 0x020179d7 in Dragonborn.esm (lab/esm.py find), the
player's base is NPC_ 0x00000007 in Skyrim.esm, and the rotfern ids come from rotfern.esp sha256 7cadb2df... as persist lays it."""
import hashlib
import struct
import sys
from pathlib import Path

MASTERS = ["Skyrim.esm", "Dragonborn.esm", "rotfern.esp"]  # load index 0, 1, 2 inside this plugin; its own records are 3
SKYRIM, DRAGONBORN, ROTFERN, SELF = 0x00000000, 0x01000000, 0x02000000, 0x03000000
QUEST = SELF | 0x800                 # a light plugin's own ids sit in 0x800..0xFFF
PLAYER_BASE = SKYRIM | 0x000007      # NPC_ "Player"
SCRIPT = "RotfernEyesAlias"
PROPERTIES = [                       # (name as the script declares it, form id in this plugin's numbering)
    ("RotfernRace", ROTFERN | 0x00AA00),
    ("RotfernRaceVampire", ROTFERN | 0x019D08),
    ("RotfernEyes", ROTFERN | 0x014C06),
    ("RotfernEyesVampire", ROTFERN | 0x019D09),
    ("RotfernEyesMora", ROTFERN | 0x023F0E),
    ("RotfernEyesMoraVampire", ROTFERN | 0x023F0F),
    ("DLC2MQ06", DRAGONBORN | 0x0179D7),
]
INTERNAL_VERSION = 44                # Skyrim Special Edition's record version


def zstring(s: str) -> bytes:
    return s.encode("ascii") + b"\0"


def wstring(s: str) -> bytes:
    raw = s.encode("ascii")
    return struct.pack("<H", len(raw)) + raw


def field(kind: str, data: bytes) -> bytes:
    assert len(kind) == 4 and len(data) < 0x10000
    return kind.encode("ascii") + struct.pack("<H", len(data)) + data


def record(kind: str, form_id: int, flags: int, data: bytes) -> bytes:
    # type, data size, flags, form id, timestamp, version control, internal version, unknown
    return kind.encode("ascii") + struct.pack("<IIIHHHH", len(data), flags, form_id, 0, 0, INTERNAL_VERSION, 0) + data


def group(label: str, contents: bytes) -> bytes:
    # a top group: GRUP, total size with this 24-byte header, label, group type 0, timestamp, version control, unknown
    return b"GRUP" + struct.pack("<I", 24 + len(contents)) + label.encode("ascii") + struct.pack("<IHHI", 0, 0, 0, 0) + contents


def vm_object(form_id: int, alias: int = -1) -> bytes:
    # object format 2: unused, alias id, form id
    return struct.pack("<HhI", 0, alias, form_id)


def vmad() -> bytes:
    out = struct.pack("<hhH", 5, 2, 0)                 # version 5, object format 2, no script on the quest itself
    out += bytes([2]) + struct.pack("<H", 0) + wstring("")  # quest fragments: the block's 2, none, an empty file name
    out += struct.pack("<H", 1)                        # one alias with scripts
    out += vm_object(QUEST, 0)                         # alias 0 of this quest
    out += struct.pack("<hhH", 5, 2, 1)                # its version, object format, one script
    out += wstring(SCRIPT) + bytes([0]) + struct.pack("<H", len(PROPERTIES))
    for name, form_id in PROPERTIES:
        out += wstring(name) + bytes([1, 1]) + vm_object(form_id)  # type 1 object, status 1 edited
    return out


def quest() -> bytes:
    data = field("EDID", zstring("RotfernEyesQuest"))
    data += field("VMAD", vmad())
    # flags 0x0111 (start game enabled among them) as the reference quest carries them, priority 0, then its 0xff
    data += field("DNAM", struct.pack("<HBBII", 0x0111, 0, 0xFF, 0, 0))
    data += field("NEXT", b"")
    data += field("ANAM", struct.pack("<I", 1))        # the next alias id
    data += field("ALST", struct.pack("<I", 0))
    data += field("ALID", zstring("Player"))
    data += field("FNAM", struct.pack("<I", 0))
    data += field("ALUA", struct.pack("<I", PLAYER_BASE))  # unique actor: the player, rung 5's per-player alias
    data += field("VTCK", struct.pack("<I", 0))
    data += field("ALED", b"")
    return record("QUST", QUEST, 0, data)


def header(records_and_groups: int) -> bytes:
    data = field("HEDR", struct.pack("<fII", 1.7, records_and_groups, QUEST + 1 - SELF))
    data += field("CNAM", zstring("apocrypha"))
    data += field("SNAM", zstring("rotfern's eyes follow her race and DLC2MQ06 (thuum D-E1)"))
    for master in MASTERS:
        data += field("MAST", zstring(master)) + field("DATA", struct.pack("<Q", 0))
    data += field("INTV", struct.pack("<I", 1))
    return record("TES4", 0, 0x200, data)  # 0x200: the light (ESL) flag


def build() -> bytes:
    body = group("QUST", quest())
    return header(2) + body  # HEDR counts the records and the groups: one QUST and its group


def main() -> None:
    out = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(__file__).parent / "dist" / "RotfernEyes.esp"
    out.parent.mkdir(parents=True, exist_ok=True)
    data = build()
    out.write_bytes(data)
    print(f"{out}: {len(data)} bytes, sha256 {hashlib.sha256(data).hexdigest()}")


if __name__ == "__main__":
    main()
