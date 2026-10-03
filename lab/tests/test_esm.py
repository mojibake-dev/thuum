"""lab/esm.py against a synthetic plugin: the layout UESP documents, built by
hand, so the reader is checked without a licensed file."""

import struct
import sys
import unittest
import zlib
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import esm  # noqa: E402


def field(name: str, data: bytes) -> bytes:
    return struct.pack("<4sH", name.encode(), len(data)) + data


def record(rtype: str, form_id: int, fields: bytes, compressed: bool = False) -> bytes:
    flags = 0
    if compressed:
        fields = struct.pack("<I", len(fields)) + zlib.compress(fields)
        flags = esm.COMPRESSED
    return struct.pack("<4sIIIHHHH", rtype.encode(), len(fields), flags, form_id, 0, 0, 44, 0) + fields


def group(label: str, body: bytes, gtype: int = 0) -> bytes:
    return struct.pack("<4sI4siHHI", b"GRUP", 24 + len(body), label.encode(), gtype, 0, 0, 0) + body


def plugin() -> bytes:
    tes4 = record("TES4", 0, field("HEDR", struct.pack("<fII", 1.7, 3, 0x800)))
    gmsts = group("GMST", b"".join([
        record("GMST", 0x0001_0001, field("EDID", b"fActivatePickLength\0") + field("DATA", struct.pack("<f", 180.0))),
        record("GMST", 0x0001_0002, field("EDID", b"iSomething\0") + field("DATA", struct.pack("<i", -7)), compressed=True),
    ]))
    big = b"\x01" * 70000
    movts = group("MOVT", record("MOVT", 0x0002_0001,
                                 field("EDID", b"NPC_Default_MT\0") + field("SPED", struct.pack("<4f", 1, 2, 3, 4))
                                 + field("XXXX", struct.pack("<I", len(big))) + struct.pack("<4sH", b"INAM", 0) + big))
    other = group("WEAP", record("WEAP", 0x0003_0001, field("EDID", b"fActivateNot\0")))
    return tes4 + gmsts + other + movts


class EsmTests(unittest.TestCase):
    def test_finds_game_settings_by_editor_id(self):
        hits = esm.find(plugin(), "GMST", "activatepick")
        self.assertEqual([(r.form_id, r.editor_id) for r in hits], [(0x0001_0001, "fActivatePickLength")])
        self.assertAlmostEqual(esm.gmst_value(hits[0]), 180.0)

    def test_reads_compressed_records(self):
        hits = esm.find(plugin(), "GMST", "iSomething")
        self.assertEqual(esm.gmst_value(hits[0]), -7)

    def test_other_top_level_groups_are_skipped_and_xxxx_sizes_apply(self):
        self.assertEqual(esm.find(plugin(), "GMST", "Not"), [])
        movt = esm.find(plugin(), "MOVT", "Default")[0]
        self.assertEqual(struct.unpack("<4f", movt.get("SPED")), (1.0, 2.0, 3.0, 4.0))
        self.assertEqual(len(movt.get("INAM")), 70000)
        self.assertIn("SPED[16] floats ['1', '2', '3', '4']", esm.describe(movt))



class RaceTests(unittest.TestCase):
    def test_race_flags_sit_after_the_skill_boosts_and_body_sizes(self):
        def race(fid, edid, flags):
            data = bytes(14) + bytes(2) + struct.pack("<4f", 1, 1, 0.5, 0.5) + struct.pack("<I", flags) + bytes(128 - 36)
            return record("RACE", fid, field("EDID", edid.encode() + b"\0") + field("DATA", data))
        buf = record("TES4", 0, b"") + group("RACE", race(0x13746, "NordRace", esm.RACE_PLAYABLE) + race(0x2C65B, "NordRaceChild", esm.RACE_CHILD) + race(0x131F0, "DremoraRace", 0))
        flags = {r.editor_id: esm.race_flags(r) for r in esm.walk(buf, 0, len(buf), "RACE")}
        self.assertEqual(flags, {"NordRace": esm.RACE_PLAYABLE, "NordRaceChild": esm.RACE_CHILD, "DremoraRace": 0})
        self.assertIsNone(esm.race_flags(esm.Record("RACE", 1, 0, [("DATA", bytes(20))])))


class NearTests(unittest.TestCase):
    def test_lists_placed_objects_of_the_types_near_a_point_in_one_world(self):
        flor = group("FLOR", record("FLOR", 0x0004_0001, field("EDID", b"Mountainflower\0")))
        stat = group("STAT", record("STAT", 0x0004_0002, field("EDID", b"Rock\0")))

        def refr(fid, base, x, y):
            return record("REFR", fid, field("NAME", struct.pack("<I", base)) + field("DATA", struct.pack("<6f", x, y, 10, 0, 0, 0)))

        tamriel = group("WRLD", record("WRLD", 0x3C, field("EDID", b"Tamriel\0"))
                        + group(struct.pack("<I", 0x3C).decode("latin-1"), refr(0x5001, 0x0004_0001, 100, 0) + refr(0x5002, 0x0004_0002, 50, 0) + refr(0x5003, 0x0004_0001, 5000, 0), gtype=1))
        elsewhere = group(struct.pack("<I", 0x99).decode("latin-1"), refr(0x5004, 0x0004_0001, 10, 0), gtype=1)
        buf = record("TES4", 0, b"") + flor + stat + tamriel + group("WRLD", elsewhere)
        got = esm.near(buf, 0x3C, 0, 0, 1000, {"FLOR"})
        self.assertEqual([(p.form_id, p.base_editor_id, round(p.distance)) for p in got], [(0x5001, "Mountainflower", 100)])


if __name__ == "__main__":
    unittest.main()
