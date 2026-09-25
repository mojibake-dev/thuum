"""Named cells: scenario coordinates are offsets from a cell's origin; lab-api
converts to absolute on the way to the server and back on the way out, for
the server's record and for what clients report."""

import unittest
from pathlib import Path

from _labapi import needs_deps

ROOT = Path(__file__).resolve().parents[2]


@needs_deps
class CellTables(unittest.TestCase):
    def test_default_table_has_lab_spawn(self):
        from labapi.guests import load_tables

        t = load_tables(ROOT / "lab" / "labapi" / "labapi" / "guests.yaml")
        c = t.cell("lab-spawn")
        self.assertIsNotNone(c)
        self.assertEqual(c.desc, "3c:Skyrim.esm")
        self.assertEqual(c.world_or_cell, 0x3C)
        self.assertEqual(t.cell_by_desc("3C:skyrim.esm"), c)
        self.assertEqual(t.cell_by_form(0x3C), c)
        self.assertIsNone(t.cell("elsewhere"))


class Backend:
    def __init__(self):
        self.calls = []
        self.actor = {"found": True, "x": 133857.0 + 300.0, "y": -61130.0, "z": 14662.0, "cell": "3c:Skyrim.esm", "isDead": False}

    def rpc(self, name, payload):
        self.calls.append((name, payload))
        if name == "labState":
            return self.actor if payload.get("kind") == "actor" else {"found": True, "entries": []}
        return {"ok": True}


@needs_deps
class ServerStateNormalizes(unittest.TestCase):
    def setUp(self):
        from labapi.guests import load_tables
        from labapi.state import ServerState

        self.tables = load_tables(ROOT / "lab" / "labapi" / "labapi" / "guests.yaml")
        self.backend = Backend()
        self.state = ServerState(self.backend, {"c1": 1}, self.tables.base_id, self.tables)

    def test_actor_is_relative_and_named(self):
        a = self.state.actor("c1")
        self.assertEqual(a["cell"], "lab-spawn")
        self.assertAlmostEqual(a["x"], 300.0)
        self.assertAlmostEqual(a["y"], 0.0)
        self.assertEqual(a["absolute"]["cell"], "3c:Skyrim.esm")

    def test_unknown_descriptor_passes_through(self):
        self.backend.actor = {"found": True, "x": 5.0, "y": 6.0, "z": 7.0, "cell": "1a2b:lab.esp"}
        a = self.state.actor("c1")
        self.assertEqual(a["cell"], "1a2b:lab.esp")
        self.assertEqual(a["x"], 5.0)
        self.assertNotIn("absolute", a)

    def test_teleport_sends_absolute_and_descriptor(self):
        self.state.command("c1", "teleport", {"cell": "lab-spawn", "x": 200, "y": 0, "z": 0})
        name, payload = self.backend.calls[-1]
        self.assertEqual(name, "labCommand")
        self.assertEqual(payload["cell"], "3c:Skyrim.esm")
        self.assertAlmostEqual(payload["x"], 134057.0)
        self.assertAlmostEqual(payload["y"], -61130.0)
        self.assertAlmostEqual(payload["z"], 14662.0)

    def test_evaluator_sees_relative_client_views(self):
        from labapi.assertions import Evaluator

        class Views:
            def view(self, observer):
                return {
                    "c2": {"pos": [133857.0 + 200.0, -61130.0, 14662.0], "worldOrCell": 0x3C, "isDead": False,
                           "health": {"value": 1, "percentage": 1.0}, "raceId": 1, "sex": 0, "equippedRight": 0, "equippedLeft": 0,
                           "near": [{"formId": 7, "name": "c1", "pos": [133857.0 + 302.0, -61129.0, 14662.0], "distance": 102.0, "raceId": 1, "sex": 0, "isDead": False, "healthPercentage": 1.0, "equippedRight": 0, "equippedLeft": 0}]},
                }.get(observer)

        ev = Evaluator(self.state, Views(), ["c1", "c2"])
        self.assertTrue(ev.evaluate("abs(server.actor(c1).x - 300) < 50"))
        self.assertTrue(ev.evaluate('server.actor(c1).cell == "lab-spawn"'))
        self.assertTrue(ev.evaluate("c2.sees(c1) == true"))
        self.assertTrue(ev.evaluate("abs(c2.view(c1).x - server.actor(c1).x) < 50"))
        self.assertTrue(ev.evaluate("abs(c2.state.x - 200) < 1"))


if __name__ == "__main__":
    unittest.main()
