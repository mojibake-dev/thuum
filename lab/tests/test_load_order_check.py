"""lab/tools/load-order-check.py (layer-stage step 2b): the clients' load order against the server's, on plugins
written here with the TES4 header fields the check reads (flags, MAST) and the top-level groups the player check
walks."""
import importlib.util
import json
import shutil
import struct
import tempfile
import unittest
import zlib
from pathlib import Path

_spec = importlib.util.spec_from_file_location(
    "load_order_check", Path(__file__).resolve().parents[1] / "tools" / "load-order-check.py")
loc = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(loc)

BASE = ["Skyrim.esm", "Update.esm", "ccQDRSSE001-SurvivalMode.esl"]


def plugin(path: Path, flags: int = 0, masters=()):
    fields = b"HEDR" + struct.pack("<HfiI", 12, 1.71, 0, 0x800)
    for m in masters:
        z = m.encode("cp1252") + b"\0"
        fields += b"MAST" + struct.pack("<H", len(z)) + z + b"DATA" + struct.pack("<HQ", 8, 0)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(b"TES4" + struct.pack("<IIIIHH", len(fields), flags, 0, 0, 44, 0) + fields)


def record(rtype: str, fid: int, rflags: int = 0, body: bytes = b"") -> bytes:
    return rtype.encode() + struct.pack("<IIIHHHH", len(body), rflags, fid, 0, 44, 0, 0) + body


def grup(label: bytes, gtype: int, body: bytes) -> bytes:
    return b"GRUP" + struct.pack("<I4siHHI", 24 + len(body), label, gtype, 0, 0, 0) + body


def append(path: Path, *groups: bytes):
    with path.open("ab") as f:
        f.write(b"".join(groups))


class LoadOrderCheck(unittest.TestCase):
    def setUp(self):
        self.dir = Path(tempfile.mkdtemp(prefix="load-order-"))
        self.addCleanup(shutil.rmtree, self.dir)
        self.mods = self.dir / "mods"
        plugin(self.mods / "a" / "A.esm", loc.ESM, ["Skyrim.esm"])
        plugin(self.mods / "b" / "B.esp", 0, ["Skyrim.esm", "A.esm"])
        plugin(self.mods / "c" / "C.esp", loc.ESL, ["Skyrim.esm"])
        plugin(self.mods / "g" / "G.esp", 0, ["Skyrim.esm"])
        plugin(self.mods / "h" / "H.esp", loc.ESL, ["Skyrim.esm"])

    def run_check(self, enabled, served):
        (self.mods / "plugins.txt").write_text("\n".join(enabled) + "\n", encoding="utf-8")
        settings = self.dir / "server-settings.json"
        settings.write_text(json.dumps({"loadOrder": [f"/srv/skymp/esm/{n}" for n in BASE + served]}))
        return loc.check(self.mods, settings)

    def test_client_only_plugins_last_of_their_kind_agree(self):
        problems, summary = self.run_check(["A.esm", "B.esp", "C.esp", "G.esp", "H.esp"], ["A.esm", "B.esp", "C.esp"])
        self.assertEqual(problems, [])
        self.assertIn("8 on the clients (5 full, 3 light), 6 on the server", summary)

    def test_a_master_no_mod_holds_and_a_plugin_over_it(self):
        plugin(self.mods / "d" / "D.esp", 0, ["Skyrim.esm", "ccvsvsse003-necroarts.esl"])
        plugin(self.mods / "e" / "E.esp", loc.ESL, ["Skyrim.esm", "D.esp"])
        problems, _ = self.run_check(["A.esm", "B.esp", "D.esp", "E.esp"], ["A.esm", "B.esp"])
        self.assertEqual(problems, [
            "D.esp needs ccvsvsse003-necroarts.esl, which no mod holds: the engine disables D.esp",
            "E.esp needs D.esp, which does not load before it: the clients' engine stops booting"])

    def test_a_master_enabled_after_its_plugin_still_loads_first_when_it_is_master_type(self):
        problems, _ = self.run_check(["B.esp", "A.esm"], ["A.esm", "B.esp"])
        self.assertEqual(problems, [])

    def test_a_client_only_esl_sorts_with_the_masters_and_shifts_the_served_lights(self):
        plugin(self.mods / "t" / "TrueHUD.esl", loc.ESL, ["Skyrim.esm"])
        problems, _ = self.run_check(["A.esm", "B.esp", "C.esp", "TrueHUD.esl"], ["A.esm", "B.esp", "C.esp"])
        self.assertEqual(problems, ["C.esp is on slot FE002 on the clients and FE001 on the server"])

    def test_a_served_plugin_the_clients_do_not_enable(self):
        problems, _ = self.run_check(["A.esm", "B.esp"], ["A.esm", "B.esp", "C.esp"])
        self.assertEqual(problems, ["C.esp is on the server, not enabled on the clients"])

    def test_a_server_list_the_engine_would_reorder(self):
        plugin(self.mods / "m" / "M.esp", loc.ESM, ["Skyrim.esm"])
        problems, _ = self.run_check(["A.esm", "M.esp", "B.esp"], ["A.esm", "B.esp", "M.esp"])
        self.assertIn("the server's loadOrder is not in the engine's order (master-type plugins first)", problems)

    def test_two_copies_of_a_plugin(self):
        plugin(self.mods / "b2" / "B.esp", 0, ["Skyrim.esm", "A.esm"])
        problems, _ = self.run_check(["A.esm", "B.esp"], ["A.esm", "B.esp"])
        self.assertEqual(problems, ["two copies of B.esp: b/B.esp, b2/B.esp"])

    def test_a_plugin_over_the_players_records(self):
        # S.esp as the survival tweak ships it: light, Skyrim.esm first, the NPC_ 0x7 compressed (0x40000). T.esp names
        # Skyrim.esm second, so the player is 0x010000xx in its numbering, and holds PlayerRef where a reference
        # lives, in its own cell's persistent children (block 2, sub-block 3, children 6, persistent 8)
        edid = b"EDID" + struct.pack("<H", 7) + b"Player\0"
        s, t = self.mods / "s" / "S.esp", self.mods / "t" / "T.esp"
        plugin(s, loc.ESL, ["Skyrim.esm", "Update.esm"])
        packed = struct.pack("<I", len(edid)) + zlib.compress(edid)
        append(s, grup(b"NPC_", 0, record("NPC_", 0x00000007, 0x40000, packed)))
        plugin(t, 0, ["A.esm", "Skyrim.esm"])
        cell = struct.pack("<I", 0x02000800)
        append(t, grup(b"NPC_", 0, record("NPC_", 0x01000007, 0, edid)),
               grup(b"CELL", 0, grup(b"\0\0\0\0", 2, grup(b"\0\0\0\0", 3, record("CELL", 0x02000800) + grup(
                   cell, 6, grup(cell, 8, record("ACHR", 0x01000014)))))))
        problems, _ = self.run_check(["A.esm", "B.esp", "S.esp", "T.esp"], ["A.esm", "B.esp", "S.esp", "T.esp"])
        base = "the player's base record (Skyrim.esm's NPC_ 0x7), which every seat's player is built on"
        ref = "the player's reference (Skyrim.esm's 0x14, PlayerRef), which the engine makes for every seat"
        self.assertEqual(problems, [f"S.esp overrides {base}: patch the override out or drop the plugin",
                                    f"T.esp overrides {base}: patch the override out or drop the plugin",
                                    f"T.esp overrides {ref}: patch the override out or drop the plugin"])

    def test_a_0x7_or_0x14_that_is_not_the_players(self):
        # Update.esm's 0x7 and 0x14, Skyrim.esm's 0x8, and the plugin's own new 0x7 and 0x14
        n = self.mods / "n" / "N.esp"
        plugin(n, 0, ["Skyrim.esm", "Update.esm"])
        append(n, grup(b"NPC_", 0, b"".join(record("NPC_", f) for f in (0x01000007, 0x00000008, 0x02000007))),
               grup(b"ACHR", 0, record("ACHR", 0x01000014) + record("ACHR", 0x02000014)))
        problems, _ = self.run_check(["A.esm", "B.esp", "N.esp"], ["A.esm", "B.esp", "N.esp"])
        self.assertEqual(problems, [])

    def test_starred_lines_and_comments(self):
        problems, _ = self.run_check(["# This file is used by Skyrim", "*A.esm", "*B.esp"], ["A.esm", "B.esp"])
        self.assertEqual(problems, [])


if __name__ == "__main__":
    unittest.main()
