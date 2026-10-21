"""lab/tools/gate-cite.py (ADR-042): when a finished run set may stand for a merge's gate. The five checks over a set
record and its runs' result.json `build`, with the live lab's answers passed in."""
import copy
import datetime
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
        # a client on two clones is two builds too
        other = {"c1": DESC["c1"], "c2": DESC["c2"].replace("58a62461", "0badc0de")}
        self.assertFalse(run(results={**RESULTS, "r4": result(desc=other)})[1][0])

    def test_a_solo_run_beside_two_seat_runs_is_one_build(self):
        # the m2-close sweep (2026-10-21): eight solo scenarios played c1 alone on the same stage
        rs = copy.deepcopy(SET); rs["scenarios"].append("a-solo")
        rs["runs"]["a-solo"] = [{"run": "r5", "verdict": "green"}]
        rows = run(rs=rs, results={**RESULTS, "r5": result(desc={"c1": DESC["c1"]})})
        self.assertTrue(all(ok for ok, _ in rows), rows)
        self.assertEqual(len(gc.builds(rs, {**RESULTS, "r5": result(desc={"c1": DESC["c1"]})})), 1)

    def test_the_stage_is_another_branchs_or_the_tag_moved(self):
        other = {c: d.replace("m2-train-28 client", "m2-other client") for c, d in DESC.items()}
        self.assertFalse(run(results={r: result(desc=other) for r in RESULTS}, live_descs=other)[2][0])
        self.assertFalse(run(registry="sha256:repushed")[2][0])

    def test_the_branchs_bare_tag_that_verb_stage_pins(self):
        bare = "10.10.70.12:5000/skymp-server:m2-train-28"
        results = {r: result(image=bare) for r in RESULTS}
        rows = run(results=results)
        self.assertTrue(all(ok for ok, _ in rows), rows)    # the clones name e3a5b367, the registry's tag has the id
        self.assertFalse(run(results=results, registry="sha256:repushed")[2][0])
        two = {"c1": DESC["c1"], "c2": DESC["c2"].replace("e3a5b367", "0badc0de")}
        self.assertFalse(run(results={r: result(image=bare, desc=two) for r in RESULTS}, live_descs=two)[2][0])
        self.assertFalse(run(results={r: result(image=bare.replace("m2-train-28", "parity")) for r in RESULTS})[2][0])

    def test_a_head_past_the_stage(self):
        self.assertFalse(run(head8="1234abcd", changed=["skymp5-client/src/x.ts", "docs/a.md"])[3][0])
        self.assertTrue(run(head8="1234abcd", changed=["docs/verbs/shadowbond.md"])[3][0])

    def test_a_red_only_on_what_is_pending_at_the_merge_stands(self):
        # ADR-042b: b-push went red under the layer in the m2-close sweep and its carry was written while the set ran
        rs = copy.deepcopy(SET); rs["verdict"] = "red"
        rs["scenarios"].append("b-push")
        rs["runs"]["b-push"] = [{"run": "r5", "verdict": "red"}, {"run": "r6", "verdict": "red"}]
        results = {**RESULTS, "r5": result(), "r6": result()}
        rows = gc.checks(rs, results, GATE, "m2-train-28", "e3a5b367", [], SID, SID, dict(DESC), [], ["b-push"])
        self.assertTrue(all(ok for ok, _ in rows), rows)
        self.assertIn("red only on b-push, pending at the merge", rows[0][1])
        # not pending: the red stands
        self.assertFalse(gc.checks(rs, results, GATE, "m2-train-28", "e3a5b367", [], SID, SID, dict(DESC), [], [])[0][0])
        # a second red that is not pending
        two = copy.deepcopy(rs); two["runs"]["b-shadowbond"].append({"run": "r7", "verdict": "red"})
        self.assertFalse(gc.checks(two, {**results, "r7": result()}, ["smoke-two-players"], "m2-train-28", "e3a5b367", [], SID, SID,
                                   dict(DESC), [], ["b-push"])[0][0])
        # a lab fault that stayed beside it
        err = copy.deepcopy(rs); err["runs"]["b-shadowbond"].append({"run": "r7", "verdict": "error"})
        self.assertFalse(gc.checks(err, {**results, "r7": result()}, ["smoke-two-players"], "m2-train-28", "e3a5b367", [], SID, SID,
                                   dict(DESC), [], ["b-push"])[0][0])
        # a pending scenario the merge names itself must still be green
        self.assertFalse(gc.checks(rs, results, GATE + ["b-push"], "m2-train-28", "e3a5b367", [], SID, SID, dict(DESC), [], ["b-push"])[0][0])

    def test_the_gate_lists_read_as_verb_merge_reads_them(self):
        lists = gc.gate_lists()
        self.assertIn("smoke-two-players", lists["always"])
        self.assertTrue(lists["watch"] and lists["pending"], lists)
        self.assertTrue(all(re_ok(s) for v in lists.values() for s in v), lists)

    def test_a_turbo_push_or_a_new_stage_after_the_set_began(self):
        self.assertFalse(run(turbo=["2026-10-20T00:30:00Z client 20261020T003000Z 711 e3a5b367"])[4][0])
        self.assertFalse(run(live="sha256:other")[4][0])
        self.assertFalse(run(live_descs={"c1": "x", "c2": "y"})[4][0])


def re_ok(name):
    import re
    return re.fullmatch(r"[a-z0-9-]+", name) is not None


UTC = datetime.timezone.utc
LAYER_DESC = "stage-layer-train28 layer 58a62461, 2026-10-19"
LAYER_RUN = {"verdict": "green", "started": "2026-10-19T23:00:00Z",
             "build": {"server": {"image": "10.10.70.12:5000/skymp-server:m2-train-27", "id": "sha256:0ld"},
                       "clients": {c: {"snapshot": "clean-m1-next", "description": LAYER_DESC} for c in ("c1", "c2")}}}
LAID = datetime.datetime(2026, 10, 19, 22, 54, tzinfo=UTC)  # persist-mods wrote SHA256SUMS before the layer's smoke


def layer(run=LAYER_RUN, rs=SET, foreign=(), sums=LAID):
    return gc.layer_checks("stage-layer-train28", "r0", run, rs, None if foreign is None else list(foreign), sums)


class LayerCite(unittest.TestCase):
    """ADR-042a: a layer staged under the train, cited by the same sweep."""

    def test_the_layer_as_laid_under_the_trains_sweep(self):
        rows = layer()
        self.assertTrue(all(ok for ok, _ in rows), rows)
        self.assertEqual([m[:2] for _, m in rows], ["6.", "7.", "8."])

    def test_the_layer_stage_run_must_be_green_before_the_set_and_name_one_layer(self):
        self.assertFalse(layer(run={**LAYER_RUN, "verdict": "red"})[0][0])
        self.assertFalse(layer(run={**LAYER_RUN, "started": "2026-10-20T01:00:00Z"})[0][0])
        two = copy.deepcopy(LAYER_RUN); two["build"]["clients"]["c2"]["description"] = "stage-layer-train28 layer 0badc0de"
        self.assertFalse(layer(run=two)[0][0])
        train = copy.deepcopy(LAYER_RUN)
        for c in train["build"]["clients"].values():
            c["description"] = "m2-train-28 client e3a5b367, 2026-10-19"
        self.assertFalse(layer(run=train)[0][0])

    def test_a_layer_change_since_the_stage_or_new_mods_on_persist(self):
        self.assertFalse(layer(foreign=["lab/layer/essentials.tsv"])[1][0])
        self.assertFalse(layer(foreign=None)[1][0])
        self.assertFalse(layer(sums=datetime.datetime(2026, 10, 19, 23, 30, tzinfo=UTC))[2][0])
        self.assertFalse(layer(sums=None)[2][0])


if __name__ == "__main__":
    unittest.main()
