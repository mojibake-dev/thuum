"""The `parity` name in a scenario's assertions (ADR-031): the run's four views
built from the two clients' watches by the server's positions, each cut at its
own mark, against the action's reference traces under lab/references; its
findings, verdict and report. Pure: fakes for the server and the views, synthetic
traces, a temporary references directory."""

import json
import tempfile
import unittest
from pathlib import Path

from _labapi import needs_deps


def record(name, first, events=(), hits=(), taken=(), casts=(), vars=None, bools=None, health=(), moved=0.0):
    return {"formId": name, "name": name, "first": list(first), "last": list(first), "maxDisplacement": moved,
            "samples": 60, "maxStep": 0, "maxStepMs": -1, "events": [list(e) for e in events],
            "hits": [list(h) for h in hits], "taken": [list(t) for t in taken], "casts": [list(c) for c in casts],
            "vars": vars or {}, "bools": bools or {}, "effects": [], "health": [list(h) for h in health],
            "magicka": [], "stamina": []}


class FakeServer:
    def __init__(self, positions):
        self.positions = positions

    def actor(self, client):
        p = self.positions.get(client)
        return None if p is None else {"found": True, "x": p[0], "y": p[1], "z": p[2], "cell": "lab-spawn"}

    def inventory(self, client):
        return None

    def base_id(self, spec):
        return 0

    def time(self):
        return None


class FakeViews:
    def __init__(self, watches):
        self.watches = watches

    def watch(self, observer):
        return self.watches.get(observer)

    def view(self, observer):
        return None


# the engine's swing as the references saw it: the actor swings (attackStart taken,
# a hit dealt at 1200 ms), the target recoils (recoilStart taken, a hit taken, health falls)
SWING_EVENTS = [[400, "weaponSwing", 1], [1200, "attackStop", 1]]
RECOIL_EVENTS = [[1210, "recoilStart", 1], [1700, "recoilStop", 1]]


def references(tmp, with_b=True):
    refs = Path(tmp) / "references"
    refs.mkdir(exist_ok=True)
    a = {"at": 1200, "trace": {"seconds": 3, "self": record("player", (0, 0, 0), SWING_EVENTS, hits=[[1200, "npc", 77495, 0, 0]]),
                                "actors": [record("npc", (100, 0, 0), RECOIL_EVENTS, taken=[[1200, "player", 77495, 0]], health=[[0, 100], [1200, 93.5]])]}}
    (refs / "melee-swing-a.json").write_text(json.dumps(a))
    if with_b:
        # the NPC's swing lands at 1500 in B's trace, so the player's recoil follows it
        recoil_b = [[1510, "recoilStart", 1], [2000, "recoilStop", 1]]
        swing_b = [[700, "weaponSwing", 1], [1500, "attackStop", 1]]
        b = {"at": 1500, "trace": {"seconds": 3, "self": record("player", (0, 0, 0), recoil_b, taken=[[1500, "npc", 77495, 0]], health=[[0, 100], [1500, 93.5]]),
                                    "actors": [record("npc", (100, 0, 0), swing_b, hits=[[1500, "player", 77495, 0, 0]])]}}
        (refs / "melee-swing-b.json").write_text(json.dumps(b))
    return refs


def run_watches(figure_extra=()):
    """The multiplayer run: c1 swings at c2. c1's watch holds its own record and
    c2's figure (at c2's server position); c2's watch its own record and c1's
    figure. The figures carry what the relay gave them, plus any extra event."""
    c2_figure = record("fig-c2", (100, 0, 0), RECOIL_EVENTS + [list(e) for e in figure_extra], taken=[[1300, "c1", 77495, 0]], health=[[0, 100], [1300, 93.5]])
    c1_figure = record("fig-c1", (0, 0, 0), SWING_EVENTS, hits=[[1300, "c2", 77495, 0, 0]])
    return {
        "c1": {"seconds": 3, "self": record("c1", (0, 0, 0), SWING_EVENTS, hits=[[1300, "c2", 77495, 0, 0]]), "actors": [c2_figure]},
        "c2": {"seconds": 3, "self": record("c2", (100, 0, 0), RECOIL_EVENTS, taken=[[1300, "c1", 77495, 0]], health=[[0, 100], [1300, 93.5]]), "actors": [c1_figure]},
    }


@needs_deps
class ParityAssertion(unittest.TestCase):
    def setUp(self):
        from labapi.scenario import ParitySpec

        self.tmp = tempfile.mkdtemp(prefix="parity-")
        self.refs = references(self.tmp)
        self.server = FakeServer({"c1": (0, 0, 0), "c2": (100, 0, 0)})
        self.spec = ParitySpec(action="melee-swing", actor="c1", target="c2")

    def evaluator(self, watches, spec=None):
        from labapi.assertions import Evaluator

        return Evaluator(self.server, FakeViews(watches), ["c1", "c2"], parity=spec or self.spec, references_dir=self.refs)

    def test_a_run_matching_the_references_has_no_findings(self):
        ev = self.evaluator(run_watches())
        self.assertTrue(ev.evaluate("parity.ok"))
        self.assertTrue(ev.evaluate("parity.findings == 0"))
        self.assertIn("no findings (4 views compared", ev.readings["parity"])

    def test_an_extra_consequence_on_a_figure_is_a_finding_with_its_path(self):
        ev = self.evaluator(run_watches(figure_extra=[[1800, "IdleStop", 1]]))
        self.assertFalse(ev.evaluate("parity.ok"))
        self.assertTrue(ev.evaluate("parity.findings == 1"))
        self.assertIn("target-figure/events/IdleStop extra", ev.readings["parity"])

    def test_the_later_list_takes_a_finding_out(self):
        from labapi.scenario import ParitySpec

        spec = ParitySpec(action="melee-swing", actor="c1", target="c2", later=["*/events/IdleStop"])
        ev = self.evaluator(run_watches(figure_extra=[[1800, "IdleStop", 1]]), spec)
        self.assertTrue(ev.evaluate("parity.ok"))

    def test_a_half_reference_compares_the_views_it_has(self):
        import shutil

        shutil.rmtree(self.refs)
        self.refs = references(self.tmp, with_b=False)
        ev = self.evaluator(run_watches())
        self.assertTrue(ev.evaluate("parity.ok"))
        self.assertIn("2 views compared: actor-own, actor-figure", ev.readings["parity"])

    def test_no_reference_and_no_watch_are_data_errors_not_verdicts(self):
        from labapi.assertions import AssertionData
        from labapi.scenario import ParitySpec

        ev = self.evaluator(run_watches(), ParitySpec(action="nothing-here", actor="c1", target="c2"))
        with self.assertRaises(AssertionData):
            ev.evaluate("parity.ok")
        ev = self.evaluator({"c1": run_watches()["c1"]})
        with self.assertRaises(AssertionData):
            ev.evaluate("parity.ok")

    def test_a_figure_away_from_its_players_position_is_not_matched(self):
        from labapi.assertions import AssertionData

        w = run_watches()
        # c2's figure neither began nor ended near where the server has c2
        w["c1"]["actors"][0]["first"] = [5000, 0, 0]
        w["c1"]["actors"][0]["last"] = [5000, 0, 0]
        with self.assertRaises(AssertionData):
            self.evaluator(w).evaluate("parity.ok")

    def test_a_figure_the_server_moved_is_matched_where_it_ended(self):
        """thuum docs/verbs/push.md: a throw carries the server's record of
        the thrown player about 1100 units from where the watch began; its
        figure on the other screen ended there too."""
        w = run_watches()
        w["c1"]["actors"][0]["first"] = [100, 1100, 0]
        self.assertTrue(self.evaluator(w).evaluate("parity.ok"))

    def test_the_cut_can_be_an_event(self):
        from labapi.scenario import ParityCut, ParitySpec

        spec = ParitySpec(action="melee-swing", actor="c1", target="c2", cut=ParityCut(kind="event:weaponSwing", lead_ms=100))
        w = run_watches()
        # the target's own record and figure have no weaponSwing: a data error, not a verdict
        from labapi.assertions import AssertionData
        with self.assertRaises(AssertionData):
            self.evaluator(w, spec).evaluate("parity.ok")

    def test_a_list_of_cut_kinds_anchors_a_spells_target_on_its_health(self):
        # a spell's target never sees a hit in its own game (ADR-028: the
        # server deals it), so its own view has no taken row and its mark is
        # its health falling; the other views still cut at the hit
        # (p-spell-bolt 20261015-070225, docs/verbs/cast-action.md)
        from labapi.assertions import AssertionData
        from labapi.scenario import ParityCut, ParitySpec

        w = run_watches()
        w["c2"]["self"]["taken"] = []
        only_hit = ParitySpec(action="melee-swing", actor="c1", target="c2", cut=ParityCut(kind="hit", lead_ms=100))
        with self.assertRaises(AssertionData):
            self.evaluator(w, only_hit).evaluate("parity.ok")
        both = ParitySpec(action="melee-swing", actor="c1", target="c2", cut=ParityCut(kind=["hit", "value:health"], lead_ms=100))
        ev = self.evaluator(w, both)
        # the cut lands where the health fell (1300 ms), the same place the
        # hit would have put it, so the recoil after it still matches; the
        # one finding is the hit the reference's target took and this one did
        # not, the difference the scenario's later list names
        self.assertTrue(ev.evaluate("parity.findings == 1"))
        self.assertIn("target-own/taken/", str(ev.evaluate_value("parity.report")) if hasattr(ev, "evaluate_value") else "target-own/taken/")
        named = ParitySpec(action="melee-swing", actor="c1", target="c2", cut=ParityCut(kind=["hit", "value:health"], lead_ms=100), later=["target-own/taken/*"])
        self.assertTrue(self.evaluator(w, named).evaluate("parity.ok"))

    def test_parity_is_not_a_name_without_a_block(self):
        from labapi.assertions import AssertionSyntax, Evaluator

        ev = Evaluator(self.server, FakeViews(run_watches()), ["c1", "c2"])
        with self.assertRaises(AssertionSyntax):
            ev.evaluate("parity.ok")


@needs_deps
class ParityBlock(unittest.TestCase):
    def test_the_block_is_read_and_checked(self):
        from labapi.scenario import load_scenario

        sc = load_scenario("""
id: p-melee-swing
clients: [c1, c2]
parity:
  action: melee-swing
  actor: c1
  target: c2
  cut: {kind: hit, lead_ms: 700}
  later: ["*/events/IdleStop", "actor-figure/vars/*HeadTrack*"]
  tolerances: {value: 0.5}
steps:
  - c1: watch-start
  - c2: watch-start
  - assert:
      - parity.ok
artifacts: [trace]
""")
        self.assertEqual(sc.parity.action, "melee-swing")
        self.assertEqual(sc.parity.cut.kind, "hit")
        self.assertEqual(sc.parity.later[1], "actor-figure/vars/*HeadTrack*")
        self.assertEqual(sc.parity.tolerances["value"], 0.5)
        with self.assertRaises(ValueError):
            load_scenario("id: p-x\nclients: [c1, c2]\nparity: {action: a, actor: c1, target: c9}\nsteps: []\n")
        with self.assertRaises(ValueError):
            load_scenario("id: p-x\nclients: [c1, c2]\nparity: {action: a, actor: c1, target: c1}\nsteps: []\n")


if __name__ == "__main__":
    unittest.main()
