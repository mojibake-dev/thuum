"""lab/tools/gate-cite.py (ADR-042): when a finished run set may stand for a merge's gate. The five checks over a set
record and its runs' result.json `build`, with the live lab's answers passed in."""
import copy
import importlib.util
import unittest
from pathlib import Path

_spec = importlib.util.spec_from_file_location("gate_cite", Path(__file__).resolve().parents[1] / "tools" / "gate-cite.py")
gc = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(gc)

IMAGE = "10.10.70.12:5000/skymp-server:m2-train-28-e3a5b367"
SID = "sha256:acf0"
DESC = {"c1": "stage-layer-train28 layer 58a62461, m2-train-28 client e3a5b367, 2026-10-19",
        "c2": "stage-layer-train28 layer 58a62461, m2-train-28 client e3a5b367, 2026-10-19"}
SET = {"id": "20261020-001500-layer-stage-layer-train28", "state": "done", "verdict": "watch",
       "scenarios": ["smoke-two-players", "b-shadowbond", "a-melee-reach"],
       "runs": {"smoke-two-players": [{"run": "r1", "verdict": "green"}],
                "b-shadowbond": [{"run": "r2", "verdict": "green"}],
                "a-melee-reach": [{"run": "r3", "verdict": "red"}, {"run": "r4", "verdict": "green"}]},
       "started": "2026-10-20T00:15:00Z"}


def result(image=IMAGE, sid=SID, desc=DESC):
    return {"build": {"server": {"image": image, "id": sid},
                      "clients": {c: {"snapshot": "clean-m1-next", "description": d} for c, d in desc.items()}}}


RESULTS = {r: result() for r in ("r1", "r2", "r3", "r4")}
GATE = ["smoke-two-players", "b-shadowbond"]


def run(rs=SET, results=RESULTS, gate=GATE, head8="e3a5b367", changed=(), registry=SID, live=SID, live_descs=DESC, turbo=()):
    return gc.checks(rs, results, list(gate), "m2-train-28", head8, list(changed), registry, live, dict(live_descs), list(turbo))


class GateCite(unittest.TestCase):
    def test_a_sweep_of_the_exact_stage_stands_for_the_gate(self):
        rows = run()
        self.assertTrue(all(ok for ok, _ in rows), rows)
        self.assertEqual(len(rows), 5)

    def test_a_gate_scenario_the_set_lacks_or_ended_red(self):
        self.assertFalse(run(gate=GATE + ["b-figure-values"])[0][0])
        rs = copy.deepcopy(SET); rs["runs"]["b-shadowbond"].append({"run": "r5", "verdict": "red"})
        self.assertFalse(run(rs=rs, results={**RESULTS, "r5": result()})[0][0])

    def test_two_builds_in_one_set(self):
        rows = run(results={**RESULTS, "r4": result(sid="sha256:other")})
        self.assertFalse(rows[1][0])
        self.assertIn("not checked", rows[2][1])

    def test_the_stage_is_another_branchs_or_the_tag_moved(self):
        other = {c: d.replace("m2-train-28 client", "m2-other client") for c, d in DESC.items()}
        self.assertFalse(run(results={r: result(desc=other) for r in RESULTS}, live_descs=other)[2][0])
        self.assertFalse(run(registry="sha256:repushed")[2][0])

    def test_a_head_past_the_stage(self):
        self.assertFalse(run(head8="1234abcd", changed=["skymp5-client/src/x.ts", "docs/a.md"])[3][0])
        self.assertTrue(run(head8="1234abcd", changed=["docs/verbs/shadowbond.md"])[3][0])

    def test_a_turbo_push_or_a_new_stage_after_the_set_began(self):
        self.assertFalse(run(turbo=["2026-10-20T00:30:00Z client 20261020T003000Z 711 e3a5b367"])[4][0])
        self.assertFalse(run(live="sha256:other")[4][0])
        self.assertFalse(run(live_descs={"c1": "x", "c2": "y"})[4][0])


if __name__ == "__main__":
    unittest.main()
