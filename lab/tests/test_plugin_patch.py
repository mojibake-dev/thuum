"""The layer's build-time plugin patches (lab/layer/plugin-patches.tsv, lab/tools/plugin-patch.py): every row names a
plugin of the load order and a known patch; the esl patch sets only the header's light flag and refuses a plugin with
records of its own above 0xFFF; the HDPT patch gives every override its master record's gender bits, keeps every other
bit and the file's size, refuses a compressed record or a missing master; the form-list patch replaces a list's
entries in order, keeps its other subrecords and resizes the groups around it; the perk patch drops only the ability
entry and the spell patch only the magnitudes; a record patch must hit the last plugin overriding the record; and all are
idempotent."""
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


class FlstSet(unittest.TestCase):
    RACES = "00013740,00013741,0200AA00"

    def flst(self, fid, edid, items):
        return record(b"FLST", fid, sub(b"EDID", edid) + b"".join(sub(b"LNAM", struct.pack("<I", x)) for x in items))

    def test_replaces_the_entries_in_order_and_resizes_the_group(self):
        other = record(b"FLST", 0x01000D63, sub(b"EDID", b"PlayableVampireList\0") + sub(b"LNAM", struct.pack("<I", 0x0008883A)))
        p = plugin([self.flst(0x01000D62, b"PlayableRaceList\0", [0x00013740, 0x00013741, 0x0002C65C, 0x0002C659, 0x0200AA00]), other],
                   masters=("Skyrim.esm", "RaceCompatibility.esm"))
        new, what = plugin_patch.patch_flst_set(p, {}, "01000D62", self.RACES)
        self.assertEqual(len(new), len(p) - 2 * 10)  # two LNAM subrecords of 6 + 4 bytes gone
        recs = [(t, f, s) for _, t, _, f, s in plugin_patch.walk(new) if t != b"TES4"]
        self.assertEqual([(t, f) for t, f, _ in recs], [(b"FLST", 0x01000D62), (b"FLST", 0x01000D63)])
        o = next(o for o, t, _, f, _ in plugin_patch.walk(new) if f == 0x01000D62)
        body = new[o + 24:o + 24 + recs[0][2]]
        self.assertTrue(body.startswith(sub(b"EDID", b"PlayableRaceList\0")))
        lnams = [struct.unpack_from("<I", body, i + 6)[0] for i in range(len(body)) if body[i:i + 4] == b"LNAM"]
        self.assertEqual(lnams, [0x00013740, 0x00013741, 0x0200AA00])
        grp = new.index(b"GRUP")
        self.assertEqual(struct.unpack_from("<I", new, grp + 4)[0], len(new) - grp)
        self.assertIn("5 -> 3 entries", what)
        self.assertEqual(new[new.index(b"PlayableVampireList"):], p[p.index(b"PlayableVampireList"):])
        again, what2 = plugin_patch.patch_flst_set(new, {}, "01000D62", self.RACES)
        self.assertEqual(again, new)
        self.assertIn("already", what2)

    def test_keeps_the_header_count_and_can_grow_a_list(self):
        p = plugin([self.flst(0x01000D62, b"PlayableRaceList\0", [0x00013740])], masters=("Skyrim.esm", "RaceCompatibility.esm"))
        new, what = plugin_patch.patch_flst_set(p, {}, "01000D62", self.RACES)
        self.assertEqual(len(new), len(p) + 2 * 10)
        hedr = new.index(b"HEDR")
        self.assertEqual(struct.unpack_from("<I", new, hedr + 6 + 4)[0], 1)

    def test_refuses_a_missing_list_a_compressed_one_and_no_entries(self):
        p = plugin([self.flst(0x01000D62, b"PlayableRaceList\0", [0x00013740])], masters=("Skyrim.esm", "RaceCompatibility.esm"))
        with self.assertRaises(SystemExit):
            plugin_patch.patch_flst_set(p, {}, "01000D63", self.RACES)
        with self.assertRaises(SystemExit):
            plugin_patch.patch_flst_set(p, {}, "01000D62", "")
        zipped = plugin([record(b"FLST", 0x01000D62, b"\0" * 12, flags=plugin_patch.COMPRESSED)], masters=("Skyrim.esm", "RaceCompatibility.esm"))
        with self.assertRaises(SystemExit):
            plugin_patch.patch_flst_set(zipped, {}, "01000D62", self.RACES)

    def test_the_rotfern_rows_pair_the_two_lists_index_for_index(self):
        patches = [r for r in rows(ROOT / "lab" / "layer" / "plugin-patches.tsv") if r["plugin"] == "rotfern.esp"]
        lists = {r["patch"].split()[1]: r["patch"].split()[2].split(",") for r in patches if r["patch"].startswith("flst-set")}
        self.assertEqual(set(lists), {"01000D62", "01000D63"})
        self.assertEqual(len(lists["01000D62"]), len(lists["01000D63"]))
        self.assertEqual(lists["01000D62"][10], "0200AA00")
        self.assertEqual(lists["01000D63"][10], "02019D08")


class PerkDropAbility(unittest.TestCase):
    PERK = (sub(b"EDID", b"SteadyHand40\0") + sub(b"FULL", b"\1\0\0\0") + sub(b"CTDA", b"\0" * 32) + sub(b"DATA", b"\0\0\1\1\0")
            + sub(b"NNAM", b"\xdb\x3a\x10\x00") + sub(b"PRKE", b"\1\0\0") + sub(b"DATA", b"\xd8\x3a\x10\x00") + sub(b"PRKF", b""))

    def test_drops_the_ability_entry_and_keeps_the_rest(self):
        other = record(b"PERK", 0x00058F61, sub(b"EDID", b"EagleEye30\0") + sub(b"PRKE", b"\2\0\x0f") + sub(b"DATA", b"\x1b\1\2") + sub(b"EPFT", b"\1") + sub(b"EPFD", struct.pack("<f", 10.0)) + sub(b"PRKF", b""))
        p = plugin([record(b"PERK", 0x00103ADA, self.PERK), other])
        new, what = plugin_patch.patch_perk_drop_ability(p, {}, "00103ADA")
        self.assertEqual(len(new), len(p) - (6 + 3) - (6 + 4) - 6)
        o, _, _, _, size = next(r for r in plugin_patch.walk(new) if r[3] == 0x00103ADA)
        self.assertEqual([s for s, _ in plugin_patch.subrecords(new[o + 24:o + 24 + size])], [b"EDID", b"FULL", b"CTDA", b"DATA", b"NNAM"])
        grp = new.index(b"GRUP")
        self.assertEqual(struct.unpack_from("<I", new, grp + 4)[0], len(new) - grp)
        self.assertEqual(new[new.index(b"EagleEye30"):], p[p.index(b"EagleEye30"):])  # an entry-point perk is untouched
        self.assertIn("1 ability entry removed", what)
        again, what2 = plugin_patch.patch_perk_drop_ability(new, {}, "00103ADA")
        self.assertEqual(again, new)
        self.assertIn("already", what2)

    def test_refuses_a_missing_perk_and_a_compressed_one(self):
        p = plugin([record(b"PERK", 0x00103ADA, self.PERK)])
        with self.assertRaises(SystemExit):
            plugin_patch.patch_perk_drop_ability(p, {}, "00103ADB")
        zipped = plugin([record(b"PERK", 0x00103ADA, b"\0" * 12, flags=plugin_patch.COMPRESSED)])
        with self.assertRaises(SystemExit):
            plugin_patch.patch_perk_drop_ability(zipped, {}, "00103ADA")


class SpellMagnitude(unittest.TestCase):
    SPEL = sub(b"EDID", b"VoiceSlowTime1\0") + sub(b"SPIT", b"\0" * 36) + sub(b"EFID", b"\xcd\x8a\x04\x00") + sub(b"EFIT", struct.pack("<fII", 0.3, 0, 8))

    def test_sets_every_magnitude_and_keeps_the_size(self):
        p = plugin([record(b"SPEL", 0x00048AD0, self.SPEL)])
        new, what = plugin_patch.patch_spell_magnitude(p, {}, "00048AD0", "1.0")
        self.assertEqual(len(new), len(p))
        o, _, _, _, size = next(r for r in plugin_patch.walk(new) if r[3] == 0x00048AD0)
        subs = dict(plugin_patch.subrecords(new[o + 24:o + 24 + size]))
        self.assertEqual(struct.unpack_from("<fII", subs[b"EFIT"], 0), (1.0, 0, 8))
        self.assertEqual(subs[b"SPIT"], b"\0" * 36)
        self.assertIn("0.3 -> 1", what)
        again, what2 = plugin_patch.patch_spell_magnitude(new, {}, "00048AD0", "1.0")
        self.assertEqual(again, new)
        self.assertIn("already", what2)

    def test_refuses_a_spell_without_an_effect_and_one_nobody_has(self):
        import tempfile
        d = Path(tempfile.mkdtemp())
        (d / "Skyrim.esm").write_bytes(plugin([record(b"SPEL", 0x00048AD0, sub(b"EDID", b"X\0"))], masters=()))
        p = plugin([record(b"SPEL", 0x00048AD0, sub(b"EDID", b"X\0"))])
        with self.assertRaises(SystemExit):
            plugin_patch.patch_spell_magnitude(p, {"game_dir": str(d)}, "00048AD0", "1.0")  # no EFIT
        with self.assertRaises(SystemExit):
            plugin_patch.patch_spell_magnitude(p, {"game_dir": str(d)}, "00048AD1", "1.0")  # not in the plugin nor the master
        with self.assertRaises(SystemExit):
            plugin_patch.patch_spell_magnitude(p, {"game_dir": str(d)}, "01000001", "1.0")  # the plugin's own index

    def test_injects_the_record_from_its_master_when_the_plugin_lacks_it(self):
        import tempfile, zlib
        d = Path(tempfile.mkdtemp())
        zipped = struct.pack("<I", len(self.SPEL)) + zlib.compress(self.SPEL)
        (d / "Skyrim.esm").write_bytes(plugin([record(b"SPEL", 0x000D8C31, zipped, flags=plugin_patch.COMPRESSED)], masters=()))
        armo = record(b"ARMO", 0x00000D62, sub(b"EDID", b"CloakA\0"))
        p = plugin([armo])  # one ARMO group, no SPEL group
        new, what = plugin_patch.patch_spell_magnitude(p, {"game_dir": str(d)}, "000D8C31", "1.0")
        recs = [(t, f, fl) for _, t, fl, f, _ in plugin_patch.walk(new) if t != b"TES4"]
        self.assertEqual(recs, [(b"ARMO", 0x00000D62, 0), (b"SPEL", 0x000D8C31, 0)])  # appended in a new SPEL group, uncompressed
        o, _, _, _, size = next(r for r in plugin_patch.walk(new) if r[3] == 0x000D8C31)
        subs = dict(plugin_patch.subrecords(new[o + 24:o + 24 + size]))
        self.assertEqual(struct.unpack_from("<fII", subs[b"EFIT"], 0), (1.0, 0, 8))
        hedr = new.index(b"HEDR")
        self.assertEqual(struct.unpack_from("<I", new, hedr + 6 + 4)[0], 1 + 2)  # the record and its new group
        grp2 = new.rindex(b"GRUP")
        self.assertEqual(struct.unpack_from("<I", new, grp2 + 4)[0], len(new) - grp2)
        self.assertIn("injected from Skyrim.esm", what)
        again, what2 = plugin_patch.patch_spell_magnitude(new, {"game_dir": str(d)}, "000D8C31", "1.0")
        self.assertEqual(again, new)
        self.assertIn("already", what2)
        # into an existing SPEL group: appended at its end, the group grows by the record
        q = plugin([record(b"SPEL", 0x00048AD0, self.SPEL)])
        q = q.replace(b"HDPT", b"SPEL", 1)  # the helper labels its one group HDPT; make it the SPEL group
        new2, _ = plugin_patch.patch_spell_magnitude(q, {"game_dir": str(d)}, "000D8C31", "1.0")
        self.assertEqual([f for _, t, _, f, _ in plugin_patch.walk(new2) if t == b"SPEL"], [0x00048AD0, 0x000D8C31])
        self.assertEqual(new2.count(b"GRUP"), 1)


class LaterOverrides(unittest.TestCase):
    def setUp(self):
        import tempfile
        self.tree = Path(tempfile.mkdtemp())
        self.order = self.tree / "load-order.tsv"
        self.order.write_text("order\tplugin\tmod\tlight\tversions\tserver\twhy\n"
                              "1\tfirst.esp\tfirst\tfull\tall\tyes\t\n2\tsecond.esp\tsecond\tfull\tall\tyes\t\n3\tthird.esp\tthird\tlight\tall\tyes\t\n")
        for mod in ("first", "second", "third"):
            (self.tree / mod).mkdir()

    def write(self, mod, records, masters=("Skyrim.esm",)):
        (self.tree / mod / f"{mod}.esp").write_bytes(plugin(records, masters=masters))

    def test_names_the_later_plugin_that_overrides_the_record(self):
        self.write("first", [record(b"SPEL", 0x00048AD0, sub(b"EDID", b"A\0"))])
        self.write("second", [record(b"SPEL", 0x00048AD1, sub(b"EDID", b"B\0"))])
        self.write("third", [record(b"SPEL", 0x00048AD0, sub(b"EDID", b"C\0"))], masters=("Skyrim.esm", "Update.esm"))
        self.assertEqual(plugin_patch.later_overrides(self.tree, self.order, "first.esp", 0x00048AD0), ["third.esp"])
        self.assertEqual(plugin_patch.later_overrides(self.tree, self.order, "second.esp", 0x00048AD1), [])
        self.assertEqual(plugin_patch.later_overrides(self.tree, self.order, "third.esp", 0x00048AD0), [])

    def test_compares_forms_by_master_not_by_index(self):
        # second.esp numbers Dawnguard's forms 02xxxxxx, third.esp numbers them 01xxxxxx: the same form either way
        self.write("second", [record(b"PERK", 0x02000D62, sub(b"EDID", b"A\0"))], masters=("Skyrim.esm", "Update.esm", "Dawnguard.esm"))
        self.write("third", [record(b"PERK", 0x01000D62, sub(b"EDID", b"B\0"))], masters=("Skyrim.esm", "Dawnguard.esm"))
        self.write("first", [])
        self.assertEqual(plugin_patch.later_overrides(self.tree, self.order, "second.esp", 0x02000D62), ["third.esp"])

    def test_the_rows_target_the_last_override_in_the_cached_layer_when_present(self):
        cache = ROOT / "lab" / ".cache" / "mods" / "fenestrate"
        ussep = next(cache.glob("Unofficial Skyrim Special Edition Patch*/unofficial skyrim special edition patch.esp"), None)
        twin = next(cache.glob("Spell Absorb and Twin Souls Fix*/SpellAbsorptionAndTwinSoulsFix_SE.esp"), None)
        if not (ussep and twin):
            self.skipTest("the staging copies are not in lab/.cache")
        for path, fid, typ in ((ussep, 0x00103ADA, b"PERK"), (ussep, 0x00103ADB, b"PERK"), (twin, 0x00048AD0, b"SPEL"), (twin, 0x00048AD2, b"SPEL")):
            self.assertIsNotNone(plugin_patch.record_at(path.read_bytes(), fid, typ), f"{path.name} lacks {fid:08X}")


if __name__ == "__main__":
    unittest.main()
