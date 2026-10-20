"""The layer's build-time plugin patches (lab/layer/plugin-patches.tsv, lab/tools/plugin-patch.py): every row names a
plugin of the load order and a known patch; the esl patch sets only the header's light flag and refuses a plugin with
records of its own above 0xFFF; the HDPT patch gives every override its master record's gender bits, keeps every other
bit and the file's size, refuses a compressed record or a missing master, and all are idempotent."""
import csv
import importlib.util
import struct
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location("plugin_patch", ROOT / "lab" / "tools" / "plugin-patch.py")
plugin_patch = importlib.util.module_from_spec(spec)
spec.loader.exec_module(plugin_patch)


def rows(path):
    with open(path, newline="") as f:
        return [r for r in csv.DictReader((l for l in f if not l.startswith("#")), delimiter="\t")]


def sub(sig, data):
    return sig + struct.pack("<H", len(data)) + data


def record(typ, fid, data, flags=0):
    return typ + struct.pack("<IIIIHH", len(data), flags, fid, 0, 0, 0) + data


def group(records):
    body = b"".join(records)
    return b"GRUP" + struct.pack("<I", 24 + len(body)) + b"HDPT" + struct.pack("<IIHH", 0, 0, 0, 0) + body


def plugin(records, masters=("Skyrim.esm",), flags=0):
    tes4 = b"".join(sub(b"MAST", m.encode() + b"\0") + sub(b"DATA", b"\0" * 8) for m in masters)
    return record(b"TES4", 0, sub(b"HEDR", struct.pack("<fIi", 1.7, len(records), 0x800)) + tes4, flags) + group(records)


class Rows(unittest.TestCase):
    def test_every_row_names_a_load_order_plugin_and_a_known_patch(self):
        order = {r["plugin"].lower() for r in rows(ROOT / "lab" / "layer" / "load-order.tsv")}
        patches = rows(ROOT / "lab" / "layer" / "plugin-patches.tsv")
        self.assertTrue(patches)
        for r in patches:
            self.assertIn(r["plugin"].lower(), order, r["plugin"])
            self.assertIn(r["patch"].split()[0], plugin_patch.PATCHES, r["patch"])
            self.assertTrue(r["why"].strip())


class Esl(unittest.TestCase):
    def test_sets_only_the_light_flag_on_an_override_only_plugin(self):
        p = plugin([record(b"ARMO", 0x00000D62, sub(b"EDID", b"CloakA\0"))])
        new, what = plugin_patch.patch_esl(p, {})
        self.assertEqual(len(new), len(p))
        self.assertEqual(struct.unpack_from("<I", new, 8)[0], 0x200)
        self.assertEqual(new[:8] + new[12:], p[:8] + p[12:])
        again, what2 = plugin_patch.patch_esl(new, {})
        self.assertEqual(again, new)
        self.assertEqual(what2, "already light")

    def test_refuses_a_plugin_with_its_own_records_above_0xfff(self):
        p = plugin([record(b"ARMO", 0x01001000, sub(b"EDID", b"New\0"))])  # index 01 = the plugin's own (one master)
        with self.assertRaises(SystemExit):
            plugin_patch.patch_esl(p, {})


class DropRecord(unittest.TestCase):
    def test_drops_the_record_and_shrinks_its_group(self):
        keep = record(b"ARMO", 0x00000D62, sub(b"EDID", b"CloakA\0"))
        gone = record(b"NPC_", 0x00000007, sub(b"EDID", b"Player\0"))
        p = plugin([gone, keep])
        new, what = plugin_patch.patch_drop_record(p, {}, "00000007")
        self.assertEqual(len(new), len(p) - len(gone))
        self.assertEqual([(t, f) for _, t, _, f, _ in plugin_patch.walk(new) if t != b"TES4"], [(b"ARMO", 0x00000D62)])
        grp = new.index(b"GRUP")
        self.assertEqual(struct.unpack_from("<I", new, grp + 4)[0], 24 + len(keep))
        self.assertIn("1 record(s) 00000007", what)
        self.assertEqual(plugin_patch.patch_drop_record(new, {}, "00000007")[0], new)

    def test_an_emptied_group_goes_and_the_header_count_follows(self):
        gone = record(b"NPC_", 0x00000007, sub(b"EDID", b"Player\0"))
        p = plugin([gone])
        new, what = plugin_patch.patch_drop_record(p, {}, "00000007")
        self.assertNotIn(b"GRUP", new)
        hedr = new.index(b"HEDR")
        self.assertEqual(struct.unpack_from("<I", new, hedr + 6 + 4)[0], 0)  # 1 record and 1 group gone from a count of 1, floored at 0
        self.assertIn("emptied group", what)

    def test_leaves_a_plugin_without_the_record_alone(self):
        p = plugin([record(b"ARMO", 0x00000D62, sub(b"EDID", b"CloakA\0"))])
        new, what = plugin_patch.patch_drop_record(p, {}, "00000007")
        self.assertEqual(new, p)
        self.assertEqual(what, "00000007 already absent")


class HdptGenderFromMaster(unittest.TestCase):
    def setUp(self):
        import tempfile
        self.dir = Path(tempfile.mkdtemp())
        master = plugin([record(b"HDPT", 0x00010000, sub(b"EDID", b"HairMaleNord1\0") + sub(b"DATA", bytes([0x03]))),
                         record(b"HDPT", 0x00010001, sub(b"EDID", b"HairFemaleNord1\0") + sub(b"DATA", bytes([0x05]))),
                         record(b"HDPT", 0x00010002, sub(b"EDID", b"MaleBrows\0") + sub(b"DATA", bytes([0x13])))], masters=())
        (self.dir / "Skyrim.esm").write_bytes(master)
        self.ctx = {"game_dir": str(self.dir)}

    def test_copies_the_master_s_gender_bits_and_keeps_the_rest(self):
        p = plugin([record(b"HDPT", 0x00010000, sub(b"DATA", bytes([0x01]))),
                    record(b"HDPT", 0x00010001, sub(b"DATA", bytes([0x01]))),
                    record(b"HDPT", 0x00010002, sub(b"DATA", bytes([0x19])))], masters=("Skyrim.esm",))
        new, what = plugin_patch.patch_hdpt_gender_from_master(p, self.ctx)
        self.assertEqual(len(new), len(p))
        values = [new[o + 24 + 6] for o, typ, _, _, _ in plugin_patch.walk(new) if typ == b"HDPT"]
        self.assertEqual(values, [0x03, 0x05, 0x1B])
        self.assertIn("3 from Skyrim.esm", what)
        self.assertEqual(plugin_patch.patch_hdpt_gender_from_master(new, self.ctx)[0], new)

    def test_refuses_an_override_without_a_master_record(self):
        p = plugin([record(b"HDPT", 0x00010009, sub(b"DATA", bytes([0x01])))], masters=("Skyrim.esm",))
        with self.assertRaises(SystemExit):
            plugin_patch.patch_hdpt_gender_from_master(p, self.ctx)

    def test_refuses_a_missing_master_file(self):
        p = plugin([record(b"HDPT", 0x00010000, sub(b"DATA", bytes([0x01])))], masters=("Dawnguard.esm",))
        with self.assertRaises(SystemExit):
            plugin_patch.patch_hdpt_gender_from_master(p, self.ctx)

    def test_names_the_masters_a_plugin_needs(self):
        p = plugin([record(b"HDPT", 0x00010000, sub(b"DATA", b"\x01")), record(b"HDPT", 0x01000005, sub(b"DATA", b"\x01")),
                    record(b"HDPT", 0x02000001, sub(b"DATA", b"\x01"))], masters=("Skyrim.esm", "Dawnguard.esm"))
        self.assertEqual(plugin_patch.hdpt_masters_needed(p), ["Dawnguard.esm", "Skyrim.esm"])  # 02 = the plugin's own, not a master


if __name__ == "__main__":
    unittest.main()
