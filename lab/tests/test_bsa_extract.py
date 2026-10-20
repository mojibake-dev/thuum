"""lab/tools/bsa-extract.py: its LZ4 frame decoder reproduces a frame the reference library wrote (content size and
content checksum flags on, one compressed block), its block decoder handles literal runs, short and overlapping
matches, and a version-105 archive built here yields its uncompressed and its compressed entry byte for byte."""
import importlib.util
import struct
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location("bsa_extract", ROOT / "lab" / "tools" / "bsa-extract.py")
bsa_extract = importlib.util.module_from_spec(spec)
spec.loader.exec_module(bsa_extract)

# lz4.frame.compress(b'racesex_menu ' * 40 + bytes(range(256)) + b'end', block_checksum=False, content_checksum=True)
VECTOR = bytes.fromhex(
    "04224d186c400b030000000000009c17010000df726163657365785f6d656e75200d00ffe9f0f4000102030405060708090a0b0c0d0e0f"
    "101112131415161718191a1b1c1d1e1f202122232425262728292a2b2c2d2e2f303132333435363738393a3b3c3d3e3f4041424344454647"
    "48494a4b4c4d4e4f505152535455565758595a5b5c5d5e5f606162636465666768696a6b6c6d6e6f707172737475767778797a7b7c7d7e7f"
    "808182838485868788898a8b8c8d8e8f909192939495969798999a9b9c9d9e9fa0a1a2a3a4a5a6a7a8a9aaabacadaeafb0b1b2b3b4b5b6b7"
    "b8b9babbbcbdbebfc0c1c2c3c4c5c6c7c8c9cacbcccdcecfd0d1d2d3d4d5d6d7d8d9dadbdcdddedfe0e1e2e3e4e5e6e7e8e9eaebecedeeef"
    "f0f1f2f3f4f5f6f7f8f9fafbfcfdfeff656e64000000006eb657bc")
PLAIN = b"racesex_menu " * 40 + bytes(range(256)) + b"end"


def bsa105(files, compressed_default=False):
    """A version-105 archive with one folder 'interface' holding `files` {name: data}, the folder-name flag set."""
    folder = b"interface"
    names = list(files)
    name_block = b"".join(n.encode() + b"\0" for n in names)
    folder_block_size = 1 + len(folder) + 1 + 16 * len(names)
    header = 36
    folder_records = 24
    file_records_start = header + folder_records
    data_start = file_records_start + folder_block_size + len(name_block)
    datas, offsets, o = [], [], data_start
    for n in names:
        d = files[n]
        datas.append(d)
        offsets.append(o)
        o += len(d)
    hdr = b"BSA\0" + struct.pack("<8I", 105, 36, 0x3 | (0x4 if compressed_default else 0), 1, len(names), len(folder) + 1, len(name_block), 0)
    # folder record: hash, count, pad, offset (offset = file records offset + total file name length)
    frec = struct.pack("<QIIQ", 0, len(names), 0, file_records_start + len(name_block))
    fblock = bytes([len(folder) + 1]) + folder + b"\0"
    for n, d, off in zip(names, datas, offsets):
        fblock += struct.pack("<QII", 0, len(d), off)
    return hdr + frec + fblock + name_block + b"".join(datas)


class Lz4(unittest.TestCase):
    def test_the_reference_frame_decodes(self):
        self.assertEqual(bsa_extract.lz4_frame(VECTOR), PLAIN)

    def test_overlapping_match(self):
        # literal 'ab', then a match of length 8 at offset 2: 'abababababab' repeated from the two literals
        block = bytes([0x24]) + b"ab" + struct.pack("<H", 2)  # token: 2 literals, match length 4+4
        out = bytearray()
        bsa_extract.lz4_block(block, out)
        self.assertEqual(bytes(out), b"ab" * 5)


class Bsa(unittest.TestCase):
    def test_an_uncompressed_entry(self):
        archive = bsa105({"racesex_menu.swf": b"CWS\x0a" + b"x" * 50, "other.swf": b"FWS"})
        self.assertEqual(bsa_extract.extract(archive, "Interface\\racesex_menu.swf"), b"CWS\x0a" + b"x" * 50)
        self.assertEqual(bsa_extract.extract(archive, "interface/other.swf"), b"FWS")

    def test_a_compressed_entry_checks_its_size(self):
        archive = bsa105({"racesex_menu.swf": struct.pack("<I", len(PLAIN)) + VECTOR}, compressed_default=True)
        self.assertEqual(bsa_extract.extract(archive, "interface/racesex_menu.swf"), PLAIN)
        wrong = bsa105({"racesex_menu.swf": struct.pack("<I", len(PLAIN) + 1) + VECTOR}, compressed_default=True)
        with self.assertRaises(ValueError):
            bsa_extract.extract(wrong, "interface/racesex_menu.swf")

    def test_a_missing_entry_is_an_error(self):
        archive = bsa105({"a.swf": b"FWS"})
        with self.assertRaises(KeyError):
            bsa_extract.extract(archive, "interface/b.swf")


if __name__ == "__main__":
    unittest.main()
