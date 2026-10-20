"""ADR-044's served list of admitted Papyrus scripts (lab/layer/papyrus-admitted.tsv, lab/tools/papyrus-map.py):
every admitted plugin is one the clients load (a served plugin of the layer, or a base entry of the server's load
order), each row says where it comes from and why, and the VMAD reader finds a record's scripts, a quest's alias
scripts and its fragment classes in a VMAD built here to the format's layout."""
import csv
import importlib.util
import json
import struct
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
TSV = ROOT / "lab" / "layer" / "papyrus-admitted.tsv"
spec = importlib.util.spec_from_file_location("papyrus_map", ROOT / "lab" / "tools" / "papyrus-map.py")
papyrus_map = importlib.util.module_from_spec(spec)
spec.loader.exec_module(papyrus_map)


def rows(path):
    with open(path, newline="") as f:
        return [r for r in csv.DictReader((l for l in f if not l.startswith("#")), delimiter="\t")]


def wstr(s):
    b = s.encode("cp1252")
    return struct.pack("<H", len(b)) + b


def script(name, props=()):
    out = wstr(name) + bytes([1]) + struct.pack("<H", len(props))
    for pname, ptype, raw in props:
        out += wstr(pname) + bytes([ptype, 1]) + raw
    return out


class AdmittedList(unittest.TestCase):
    def test_every_admitted_plugin_is_one_the_clients_load(self):
        served = {Path(p).name.lower() for p in json.loads((ROOT / "lab" / "deploy" / "sky-srv" / "server-settings.json").read_text())["loadOrder"]}
        layer = {r["plugin"].lower(): r for r in rows(ROOT / "lab" / "layer" / "load-order.tsv")}
        admitted = rows(TSV)
        self.assertTrue(admitted)
        for r in admitted:
            self.assertIn(r["source"], ("layer", "game"), r)
            self.assertTrue(r["why"].strip(), r)
            if r["source"] == "layer":
                self.assertIn(r["plugin"].lower(), layer, f"{r['plugin']} is not in load-order.tsv")
            else:
                self.assertIn(r["plugin"].lower(), served, f"{r['plugin']} is not in the server's loadOrder")
                self.assertNotIn(r["plugin"].lower(), layer, f"{r['plugin']} is a layer plugin; its source is layer")


class VmadReader(unittest.TestCase):
    def test_a_record_s_scripts_and_their_properties(self):
        d = struct.pack("<hhH", 5, 2, 2)
        d += script("MyQuestScript", [("Target", 1, b"\0" * 8), ("Label", 2, wstr("hello")), ("Count", 3, struct.pack("<i", 3)),
                                      ("Rate", 4, struct.pack("<f", 1.5)), ("On", 5, b"\1"),
                                      ("Many", 13, struct.pack("<I", 2) + struct.pack("<i", 1) + struct.pack("<i", 2))])
        d += script("OtherScript")
        self.assertEqual(papyrus_map.vmad_names("ACTI", d), ["MyQuestScript", "OtherScript"])

    def test_a_quest_s_fragments_and_alias_scripts(self):
        d = struct.pack("<hhH", 5, 2, 1) + script("MQ101Script")
        d += bytes([2]) + struct.pack("<H", 1) + wstr("QF_MQ101_0003372B")
        d += struct.pack("<HhIB", 10, 0, 0, 1) + wstr("QF_MQ101_0003372B") + wstr("Fragment_0")
        d += struct.pack("<H", 1) + b"\0" * 8 + struct.pack("<hhH", 5, 2, 1) + script("MQ101PlayerAliasScript")
        self.assertEqual(papyrus_map.vmad_names("QUST", d), ["MQ101Script", "QF_MQ101_0003372B", "QF_MQ101_0003372B", "MQ101PlayerAliasScript"])

    def test_a_perk_s_fragments(self):
        d = struct.pack("<hhH", 5, 2, 0) + bytes([2]) + wstr("PRKF_Lock_053C7539") + struct.pack("<H", 1)
        d += struct.pack("<HhB", 0, 0, 1) + wstr("PRKF_Lock_053C7539") + wstr("Fragment_0")
        self.assertEqual(papyrus_map.unique(papyrus_map.vmad_names("PERK", d)), ["PRKF_Lock_053C7539"])

    def test_an_info_s_fragments(self):
        d = struct.pack("<hhH", 5, 2, 0) + bytes([2, 3]) + wstr("TIF__0100E7A1")
        d += bytes([1]) + wstr("TIF__0100E7A1") + wstr("Fragment_0") + bytes([1]) + wstr("TIF__0100E7A1") + wstr("Fragment_1")
        self.assertEqual(papyrus_map.unique(papyrus_map.vmad_names("INFO", d)), ["TIF__0100E7A1"])

    def test_a_scene_s_fragments_and_phases(self):
        d = struct.pack("<hhH", 5, 2, 0) + bytes([2, 1]) + wstr("SF_Scene_0001")
        d += bytes([1]) + wstr("SF_Scene_0001") + wstr("Fragment_0")
        d += struct.pack("<H", 1) + bytes([1]) + struct.pack("<I", 2) + bytes([1]) + wstr("SF_Scene_0001") + wstr("Fragment_2")
        self.assertEqual(papyrus_map.unique(papyrus_map.vmad_names("SCEN", d)), ["SF_Scene_0001"])

    def test_a_truncated_fragment_section_still_yields_the_identifiers(self):
        d = struct.pack("<hhH", 5, 2, 1) + script("Known") + bytes([2]) + struct.pack("<H", 1) + wstr("QF_Broken") + b"\x01"
        self.assertEqual(papyrus_map.unique(papyrus_map.vmad_names("QUST", d)), ["Known", "QF_Broken"])


if __name__ == "__main__":
    unittest.main()
