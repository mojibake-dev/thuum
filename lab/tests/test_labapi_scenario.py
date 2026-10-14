import unittest

from _labapi import needs_deps
from pathlib import Path

from _labapi import SMOKE, needs_deps


@needs_deps
class ScenarioTests(unittest.TestCase):
    def test_smoke_file_parses(self):
        from labapi.scenario import load_scenario

        sc = load_scenario(SMOKE.read_text())
        self.assertEqual(sc.id, "smoke-two-players")
        self.assertEqual(sc.clients, ["c1", "c2"])
        self.assertEqual(sc.server.snapshot, "clean")
        self.assertIsNone(sc.server.netem)
        self.assertEqual(sc.timeout_s, 600)
        self.assertEqual(sc.artifacts, ["server.log", "c1.log", "c2.log", "screenshots", "world-diff", "pcap"])
        kinds = [s.kind for s in sc.steps]
        self.assertEqual(kinds.count("assert"), 4)
        self.assertEqual(kinds.count("server"), 1)
        tele = sc.steps[2]
        self.assertEqual((tele.kind, tele.client, tele.action), ("client", "c1", "teleport"))
        self.assertEqual(tele.args, {"cell": "lab-spawn", "x": 0, "y": 0, "z": 0})
        give = next(s for s in sc.steps if s.action == "give")
        self.assertEqual(give.args, {"item": "Skyrim.esm:IngotIron", "count": 1})  # not in the spawn kit (an iron sword is)

    def test_quoted_and_bare_flow_forms_agree(self):
        from labapi.scenario import load_scenario

        bare = "id: t\nclients: [c1]\nsteps:\n  - c1: move {dx: 1, dy: 2}\n"
        quoted = 'id: t\nclients: [c1]\nsteps:\n  - c1: "move {dx: 1, dy: 2}"\n'
        self.assertEqual(load_scenario(bare).steps, load_scenario(quoted).steps)

    def test_rejects_unknown_client_and_verb(self):
        from labapi.scenario import load_scenario

        with self.assertRaises(ValueError):
            load_scenario("id: t\nclients: [c1]\nsteps:\n  - c9: connect\n")
        with self.assertRaises(ValueError):
            load_scenario("id: t\nclients: [c1]\nsteps:\n  - c1: fly\n")
        with self.assertRaises(ValueError):
            load_scenario("id: t\nclients: [c1]\nsteps:\n  - server: explode\n")

    def test_until_waits_for_a_condition_with_a_cap(self):
        from labapi.scenario import load_scenario

        block = load_scenario(
            "id: t\nclients: [c1]\nsteps:\n  - until:\n      within: 12\n      expect:\n"
            "        - server.actor(c1).healthPercentage < 0.6\n"
        )
        step = block.steps[0]
        self.assertEqual((step.kind, step.seconds, step.every), ("until", 12.0, 1.0))
        self.assertEqual(step.assertions, ["server.actor(c1).healthPercentage < 0.6"])
        self.assertEqual(step.describe(), "until x1 within 12s")
        flow = load_scenario('id: t\nclients: [c1]\nsteps:\n  - until: {within: 3, every: 0.25, expect: ["server.actor(c1).x > 0"]}\n')
        self.assertEqual((flow.steps[0].seconds, flow.steps[0].every), (3.0, 0.25))
        for bad in (
            "until: [server.actor(c1).x > 0]",
            "until: {expect: [server.actor(c1).x > 0]}",
            "until: {within: 0, expect: [server.actor(c1).x > 0]}",
            "until: {within: 5, expect: []}",
            "until: {within: 5, every: -1, expect: [server.actor(c1).x > 0]}",
            "until: {within: 5, expect: [server.actor(c1).x > 0], until: 3}",
            "until: {within: true, expect: [server.actor(c1).x > 0]}",
        ):
            with self.assertRaises(ValueError, msg=bad):
                load_scenario(f"id: t\nclients: [c1]\nsteps:\n  - {bad}\n")

    def test_netem_spec(self):
        from labapi.scenario import load_scenario

        sc = load_scenario("id: t\nclients: []\nserver: {snapshot: s, netem: {delay_ms: 60, jitter_ms: 15, loss_pct: 0.5}}\n")
        self.assertEqual((sc.server.netem.delay_ms, sc.server.netem.jitter_ms, sc.server.netem.loss_pct), (60, 15, 0.5))


@needs_deps
class AllScenariosParse(unittest.TestCase):
    def test_every_scenario_file_parses(self):
        from labapi.scenario import load_scenario

        root = Path(__file__).resolve().parents[2] / "lab" / "scenarios"
        files = sorted(root.glob("*.yaml"))
        self.assertGreaterEqual(len(files), 6)
        for f in files:
            with self.subTest(scenario=f.name):
                sc = load_scenario(f.read_text())
                self.assertEqual(sc.id, f.stem)
                self.assertTrue(sc.steps)


@needs_deps
class SoloFlag(unittest.TestCase):
    def test_solo_is_read_and_defaults_off(self):
        from labapi.scenario import load_scenario

        self.assertFalse(load_scenario("id: plain\nclients: [c1]\nsteps: []\n").solo)
        self.assertTrue(load_scenario("id: solo-ref\nsolo: true\nclients: [c1]\nsteps: []\n").solo)

    def test_solo_start_is_a_client_step(self):
        """lab-driver's solo-start (ADR-031): the driver loads the template save
        at the main menu and places the player; a solo scenario opens with it
        where a multiplayer one opens with connect."""
        from labapi.scenario import load_scenario

        sc = load_scenario("id: p-ref\nsolo: true\nclients: [c1]\nsteps:\n  - c1: solo-start {x: 0, y: -300, z: 0, rz: 180}\n")
        self.assertEqual(sc.steps[0].action, "solo-start")
        self.assertEqual(sc.steps[0].args["rz"], 180)

