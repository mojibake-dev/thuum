"""FormDesc form names, "<local hex>:<plugin>" (labapi/slots.py, guests.Tables.base_id): the slot
comes from the run's own load order, so the essentials layer's moves (Apocalypse 0C to 1A, LostGrimoire 0B
to 28, rotfern 08 to 2F, 2026-10-19) change no scenario. Plugins are written here with the TES4 header
fields the slot math reads."""
import json
import shutil
import struct
import tempfile
import unittest
from pathlib import Path

from _labapi import needs_deps

ROOT = Path(__file__).resolve().parents[2]


def plugin(path: Path, flags: int = 0):
    fields = b"HEDR" + struct.pack("<HfiI", 12, 1.71, 0, 0x800)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(b"TES4" + struct.pack("<IIIIHH", len(fields), flags, 0, 0, 44, 0) + fields)


class Backend:
    def __init__(self):
        self.calls = []

    def rpc(self, name, payload):
        self.calls.append((name, payload))
        return {"ok": True}


@needs_deps
class Slots(unittest.TestCase):
    def setUp(self):
        from labapi import slots

        self.slots = slots
        self.dir = Path(tempfile.mkdtemp(prefix="slots-"))
        self.addCleanup(shutil.rmtree, self.dir)
        esm = self.dir / "esm"
        plugin(esm / "Skyrim.esm", slots.ESM)
        plugin(esm / "ccQDRSSE001-SurvivalMode.esl", slots.ESM | slots.ESL)
        plugin(esm / "TrueHUD.esl", slots.ESL)
        plugin(esm / "Cloaks.esp")
        plugin(esm / "Headshot Kills.esp", slots.ESL)
        plugin(esm / "USSEP.esp", slots.ESM)  # an ESM-flagged .esp listed late: the engine hoists it
        plugin(esm / "Apocalypse - Magic of Skyrim.esp")
        self.esm = esm
        self.settings = self.dir / "server-settings.json"
        order = ["Skyrim.esm", "ccQDRSSE001-SurvivalMode.esl", "Cloaks.esp", "TrueHUD.esl", "Headshot Kills.esp",
                 "USSEP.esp", "Apocalypse - Magic of Skyrim.esp"]
        self.settings.write_text(json.dumps({"loadOrder": [f"/srv/skymp/esm/{n}" for n in order]}))

    def test_the_engine_order_gives_each_plugin_its_slot(self):
        got = self.slots.for_settings(self.settings, self.esm)
        self.assertEqual({k: self.slots.label(v) for k, v in got.items()}, {
            "skyrim.esm": "00", "ussep.esp": "01", "cloaks.esp": "02",
            "apocalypse - magic of skyrim.esp": "03",
            "ccqdrsse001-survivalmode.esl": "FE000", "truehud.esl": "FE001", "headshot kills.esp": "FE002"})

    def test_compose_full_and_light(self):
        self.assertEqual(self.slots.compose((False, 0x1A), 0x00AAE8), 0x1A00AAE8)
        self.assertEqual(self.slots.compose((True, 0x01E), 0x801), 0xFE01E801)
        with self.assertRaises(ValueError):
            self.slots.compose((True, 1), 0x1000)
        with self.assertRaises(ValueError):
            self.slots.compose((False, 1), 0x1000000)

    def test_tables_resolve_through_the_running_load_order(self):
        from labapi.guests import Tables

        t = Tables({}, {}, {"rotfern.esp:rotfern": "00aa00:Apocalypse - Magic of Skyrim.esp",
                            "skyrim.esm:ironsword": 0x12EB7})
        with self.assertRaisesRegex(KeyError, "no load order read"):
            t.base_id("0147c6:Cloaks.esp")
        t.slots.update(self.slots.for_settings(self.settings, self.esm))
        self.assertEqual(t.base_id("0147c6:Cloaks.esp"), 0x020147C6)
        self.assertEqual(t.base_id("AAE8:apocalypse - magic of skyrim.esp"), 0x0300AAE8)
        self.assertEqual(t.base_id("801:Headshot Kills.esp"), 0xFE002801)
        self.assertEqual(t.base_id("3c:Skyrim.esm"), 0x3C)  # the cells table's own FormDesc
        self.assertEqual(t.base_id("rotfern.esp:rotfern"), 0x0300AA00)  # a table value that is a FormDesc
        self.assertEqual(t.base_id("Skyrim.esm:IronSword"), 0x12EB7)
        self.assertEqual(t.base_id("0x12eb7"), 0x12EB7)
        with self.assertRaisesRegex(KeyError, "not in the running load order"):
            t.base_id("0a86df:LostGrimoire.esp")
        with self.assertRaisesRegex(KeyError, "12 bits"):
            t.base_id("1000:Headshot Kills.esp")

    def test_learn_spell_sends_the_composed_id(self):
        from labapi.guests import Tables
        from labapi.state import ServerState

        t = Tables({}, {}, {})
        t.slots.update(self.slots.for_settings(self.settings, self.esm))
        backend = Backend()
        state = ServerState(backend, {"c1": 1}, t.base_id, t)
        state.command("c1", "learn-spell", {"spellId": "044d44:Apocalypse - Magic of Skyrim.esp"})
        self.assertEqual(backend.calls[-1][1]["spellId"], 0x03044D44)
        state.command("c1", "learn-spell", {"spellId": 201608516})
        self.assertEqual(backend.calls[-1][1]["spellId"], 201608516)

    def test_the_runner_reads_each_versions_load_order(self):
        from labapi.app import build_fake
        from labapi.config import Settings

        s = Settings(guests_file=str(ROOT / "lab" / "labapi" / "labapi" / "guests.yaml"),
                     results_dir=str(self.dir / "results"),
                     game_esm_dirs=f"1.6.1170={self.esm}", game_server_settings=f"1.6.1170={self.settings}")
        services = build_fake(s)
        self.assertEqual(services.tables.base_id("0147c6:Cloaks.esp"), 0x020147C6)
        self.assertEqual(services.runner._refresh_slots("1.6.1170"), 7)
        self.assertIsNone(services.runner._refresh_slots("1.7.104"))
        self.assertEqual(services.tables.slots, {})


@needs_deps
class GuestsTable(unittest.TestCase):
    def test_rotfern_names_no_slot(self):
        from labapi.guests import PLUGIN_RELATIVE, load_tables

        t = load_tables(ROOT / "lab" / "labapi" / "labapi" / "guests.yaml")
        self.assertTrue(PLUGIN_RELATIVE.fullmatch(t.items["rotfern.esp:rotfern"]))


if __name__ == "__main__":
    unittest.main()
