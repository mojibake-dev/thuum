"""Tests for lab/addr.py: the real 1.6.353 fixture shipped with CommonLibSSE-NG's
own tests, plus synthetic files that exercise every packing code the fixture
does not contain. Run: python3 -m unittest discover -s lab/tests -v"""

import bisect
import io
import struct
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "lab"))

import addr  # noqa: E402

FIXTURE = ROOT / "CommonLibSSE-NG" / "tests" / "REL" / "version-1-5-97-0.bin"
FIXTURE_AE = ROOT / "CommonLibSSE-NG" / "tests" / "REL" / "versionlib-1-6-353-0.bin"


def encode(entries, pointer_size=8, version=(1, 6, 353, 0), name=b"SkyrimSE.exe", codes=None):
    """A minimal encoder for tests: `codes` is an optional list of (id_code, off_code, scaled)
    per entry; default picks absolute u64 for everything."""
    out = io.BytesIO()
    out.write(struct.pack("<i", 2))
    for v in version:
        out.write(struct.pack("<i", v))
    out.write(struct.pack("<i", len(name)))
    out.write(name)
    out.write(struct.pack("<i", pointer_size))
    out.write(struct.pack("<i", len(entries)))
    prev_id = prev_off = 0
    for n, (id_, off) in enumerate(entries):
        id_code, off_code, scaled = (codes[n] if codes else (0, 0, False))
        out.write(bytes([(off_code | (8 if scaled else 0)) << 4 | id_code]))
        out.write(_pack(id_code, id_, prev_id))
        base = prev_off // pointer_size if scaled else prev_off
        value = off // pointer_size if scaled else off
        out.write(_pack(off_code, value, base))
        prev_id, prev_off = id_, off
    return out.getvalue()


def _pack(code, value, prev):
    if code == 0:
        return struct.pack("<Q", value)
    if code == 1:
        assert value == prev + 1
        return b""
    if code == 2:
        return struct.pack("<B", value - prev)
    if code == 3:
        return struct.pack("<B", prev - value)
    if code == 4:
        return struct.pack("<H", value - prev)
    if code == 5:
        return struct.pack("<H", prev - value)
    if code == 6:
        return struct.pack("<H", value)
    if code == 7:
        return struct.pack("<I", value)
    raise AssertionError(code)


class Fixture(unittest.TestCase):
    @unittest.skipUnless(FIXTURE.is_file(), "CommonLibSSE-NG submodule not checked out")
    def test_matches_commonlib_expectations(self):
        db = addr.load(FIXTURE)
        self.assertEqual(db.header.format, 1)
        self.assertEqual(db.header.version, (1, 5, 97, 0))
        self.assertEqual(db.header.module_name, "SkyrimSE.exe")
        self.assertEqual(db.header.pointer_size, 8)
        # CommonLibSSE-NG/tests/REL/Relocation.test.cpp at the pinned commit expects
        # id 11483 at 0x10f5c0 and, with a mocked base of 0x1000, address 0x1105c0.
        self.assertEqual(db.offset(11483), 0x10F5C0)
        self.assertEqual(db.address(11483, 0x1000), 0x1105C0)
        self.assertEqual(len(db), db.header.count)
        self.assertEqual(db.ids[:3], [2, 3, 4])
        self.assertEqual(db.offsets[:3], [0x10D0, 0x1160, 0x11CC])
        self.assertTrue(all(a < b for a, b in zip(db.ids, db.ids[1:])), "ids strictly increasing")

    @unittest.skipUnless(FIXTURE_AE.is_file(), "1.6.353 fixture not present at this CommonLibSSE-NG commit")
    def test_matches_commonlib_ae_expectations(self):
        # Older CommonLibSSE-NG tests expect id 11483 at 0x10f7a0 for 1.6.353.
        db = addr.load(FIXTURE_AE)
        self.assertEqual(db.header.format, 2)
        self.assertEqual(db.offset(11483), 0x10F7A0)

    @unittest.skipUnless(FIXTURE.is_file(), "CommonLibSSE-NG submodule not checked out")
    def test_whole_file_consumed(self):
        with FIXTURE.open("rb") as f:
            header = addr.read_header(f)
            addr.read_entries(f, header)
            self.assertEqual(f.read(), b"", "trailing bytes after the last entry")

    @unittest.skipUnless(FIXTURE.is_file(), "CommonLibSSE-NG submodule not checked out")
    def test_missing_id_is_strict_unless_quirk(self):
        db = addr.load(FIXTURE)
        past_end = db.ids[-1] + 1
        with self.assertRaises(addr.AddrLibError):
            db.offset(past_end)
        with self.assertRaises(addr.AddrLibError):
            db.offset(past_end, commonlib_quirk=True)
        # A hole inside the table resolves only under the quirk, and then to the
        # next higher id's offset, which is what CommonLib's lower_bound does.
        present = set(db.ids)
        hole = next((i for i in range(1, db.ids[-1]) if i not in present), None)
        if hole is not None:
            with self.assertRaises(addr.AddrLibError):
                db.offset(hole)
            nxt = db.ids[bisect.bisect_left(db.ids, hole)]
            self.assertEqual(db.offset(hole, commonlib_quirk=True), db.offset(nxt))


class Synthetic(unittest.TestCase):
    def test_every_code_round_trips(self):
        # ids and offsets chosen so each code's delta fits its width, including the
        # subtracting codes 3 and 5 and the absolute u16/u32 codes 6 and 7, and the
        # scaled (pointer-size multiplied) variants of the offset codes.
        entries = [
            (100, 0x1000),          # 0: absolute u64 both
            (101, 0x1008),          # 1: prev+1 id, scaled prev+1 offset (0x1000/8 + 1) * 8
            (150, 0x1100),          # 2: id +u8, offset +u8 (0xF8) unscaled... 0x100 > 0xFF so use code 4
            (140, 0x10F0),          # 3: id -u8, offset -u8 (0x10)
            (10000, 0x20000),       # 4: id +u16, offset scaled +u16 ((0x20000-0x10F0)/8 fits? no) -> absolute u32
            (9000, 0x1F000),        # 5: id -u16, offset scaled -u16 ((0x20000-0x1F000)/8 = 0x200)
            (65535, 0xFFFF),        # 6: absolute u16 both
            (70000, 0x12345678),    # 7: absolute u32 both
        ]
        codes = [
            (0, 0, False),
            (1, 1, True),
            (2, 4, False),
            (3, 3, False),
            (4, 7, False),
            (5, 5, True),
            (6, 6, False),
            (7, 7, False),
        ]
        blob = encode(entries, codes=codes)
        with tempfile.TemporaryDirectory() as d:
            p = Path(d) / "versionlib-1-6-353-0.bin"
            p.write_bytes(blob)
            db = addr.load(p)
        for id_, off in entries:
            self.assertEqual(db.offset(id_), off, f"id {id_}")
        self.assertEqual(db.ids, sorted(i for i, _ in entries))

    def test_bad_type_code_is_an_error(self):
        blob = encode([(1, 0x10)])
        # id code 9 in the type byte's low nibble is unhandled, as in CommonLib.
        head = blob[: 0x2C]
        bad = head + bytes([0x09]) + blob[0x2D:]
        with tempfile.TemporaryDirectory() as d:
            p = Path(d) / "versionlib-1-6-353-0.bin"
            p.write_bytes(bad)
            with self.assertRaises(addr.AddrLibError):
                addr.load(p)

    def test_truncated_file_is_an_error(self):
        blob = encode([(1, 0x10), (2, 0x20)])
        with tempfile.TemporaryDirectory() as d:
            p = Path(d) / "versionlib-1-6-353-0.bin"
            p.write_bytes(blob[:-3])
            with self.assertRaises(addr.AddrLibError):
                addr.load(p)

    def test_runtime_lookup_and_version_check(self):
        blob = encode([(5, 0x50)], version=(1, 6, 1170, 0))
        with tempfile.TemporaryDirectory() as d:
            (Path(d) / "SKSE" / "Plugins").mkdir(parents=True)
            (Path(d) / "SKSE" / "Plugins" / "versionlib-1-6-1170-0.bin").write_bytes(blob)
            db = addr.load_for_runtime(Path(d), "1.6.1170")
            self.assertEqual(db.offset(5), 0x50)
            self.assertEqual(addr.database_name((1, 5, 97, 0)), "version-1-5-97-0.bin")
            self.assertEqual(addr.database_name((1, 6, 1170, 0)), "versionlib-1-6-1170-0.bin")
            with self.assertRaises(addr.AddrLibError):
                addr.load_for_runtime(Path(d), "1.6.640")
            self.assertEqual(addr.main([d, "1.6.1170", "5", "--base", "140000000"]), 0)
            self.assertEqual(addr.main([d, "1.6.1170", "6"]), 1)


if __name__ == "__main__":
    unittest.main()
