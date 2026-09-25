import unittest

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
        self.assertEqual(give.args, {"item": "Skyrim.esm:IronSword", "count": 1})

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

    def test_netem_spec(self):
        from labapi.scenario import load_scenario

        sc = load_scenario("id: t\nclients: []\nserver: {snapshot: s, netem: {delay_ms: 60, jitter_ms: 15, loss_pct: 0.5}}\n")
        self.assertEqual((sc.server.netem.delay_ms, sc.server.netem.jitter_ms, sc.server.netem.loss_pct), (60, 15, 0.5))
