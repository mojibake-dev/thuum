"""Run sets through the app on the fakes (runset.py): scenarios played one after
another with ADR-027's and the lab-fault reruns, stop and resume, and the
nightly's start conditions. The scenarios come from a directory the test
writes, as `just deploy-srv` puts them on sky-srv."""

import dataclasses
import json
import time
import unittest
from datetime import datetime, timezone

from _labapi import needs_deps
from test_labapi_run import RED, RunTests

# a green scenario that stays green run after run on the fakes (the fake server
# state is not rolled back between runs, so GREEN's give-and-count would read
# two swords the second time; the lab's world restore has no such carry-over)
GREEN = """
id: t2-green
clients: [c1, c2]
server: {snapshot: clean}
timeout_s: 30
steps:
  - c1: connect
  - c2: connect
  - c1: teleport {cell: lab-spawn, x: 0, y: 0, z: 0}
  - c2: teleport {cell: lab-spawn, x: 200, y: 0, z: 0}
  - wait: 1
  - assert:
      - server.actor(c2).cell == "lab-spawn"
      - c1.sees(c2) == true
artifacts: [server.log]
"""

# c9 has no guest in the test tables: E_RUN_NO_GUEST, a run without a verdict
LAB_FAULT = """
id: t2-fault
clients: [c9]
server: {snapshot: clean}
timeout_s: 30
steps:
  - c9: connect
"""


@needs_deps
class RunSetTests(RunTests):
    def setUp(self):
        super().setUp()
        self.scen = self.tmp / "scenarios"
        self.scen.mkdir()
        for n in ("one", "two", "three", "four", "five"):
            (self.scen / f"t2-green-{n}.yaml").write_text(GREEN.replace("id: t2-green", f"id: t2-green-{n}"))
        (self.scen / "t2-red.yaml").write_text(RED)
        (self.scen / "t2-red-two.yaml").write_text(RED.replace("id: t2-red", "id: t2-red-two"))
        (self.scen / "t2-fault.yaml").write_text(LAB_FAULT)
        self.runsets = self.services.runsets
        self.runsets.scenarios_dir = self.scen
        self.runsets.poll_s = 0.01

    def _start(self, scenarios, name="gate", **extra):
        r = self.client.post("/lab/runset", json={"name": name, "scenarios": scenarios, **extra})
        self.assertEqual(r.status_code, 200, r.text)
        return r.json()["id"]

    def _wait(self, rid, until=None, timeout=60.0):
        deadline = time.time() + timeout
        while time.time() < deadline:
            self.doubles.turn()
            body = self.client.get(f"/lab/runset/{rid}").json()
            if until(body) if until else body["state"] in ("done", "stopped"):
                return body
            time.sleep(0.02)
        self.fail(f"run set {rid} did not get there: {body['summary']}")

    def test_a_set_of_green_scenarios_is_green_and_kept(self):
        rid = self._start(["t2-green-one", "t2-green-two"])
        body = self._wait(rid)
        self.assertEqual(body["verdict"], "green", body["summary"])
        self.assertEqual(body["state"], "done")
        self.assertEqual(body["position"], 2)
        for s in ("t2-green-one", "t2-green-two"):
            self.assertEqual(len(body["runs"][s]), 1)
            self.assertTrue(body["runs"][s][0]["run"].endswith(s))
            self.assertEqual(body["runs"][s][0]["verdict"], "green")
        kept = json.loads((self.tmp / "results" / "runsets" / f"{rid}.json").read_text())
        self.assertEqual(kept["verdict"], "green")
        self.assertEqual(self.client.get("/lab/runsets").json()[0]["id"], rid)
        self.assertIsNone(self.client.get("/lab/status").json()["runset"])
        self.assertIsNone(self.services.runner.active)

    def test_the_sets_only_red_reruns_twice_and_a_red_rerun_keeps_it_red(self):
        rid = self._start(["t2-green-one", "t2-red"])
        body = self._wait(rid)
        self.assertEqual(body["verdict"], "red", body["summary"])
        entries = body["runs"]["t2-red"]
        # the first run, then ADR-027's reruns; RED fails every time, so one rerun ends it
        self.assertEqual([e.get("rerun") for e in entries], [None, "lone-red"])
        self.assertEqual(body["watch"], [])

    def test_a_lab_fault_is_rerun_once_and_an_error_that_stays_is_error(self):
        rid = self._start(["t2-fault", "t2-green-one"])
        body = self._wait(rid)
        self.assertEqual(body["verdict"], "error", body["summary"])
        entries = body["runs"]["t2-fault"]
        self.assertEqual([e["verdict"] for e in entries], ["error", "error"])
        self.assertEqual(entries[1]["rerun"], "lab-fault")
        self.assertEqual(body["runs"]["t2-green-one"][0]["verdict"], "green", "the set went on past the fault")

    def test_two_lab_faults_in_a_row_stop_the_set_resumable(self):
        """The first nightly lost a clone's GPU at its 31st scenario and spent an
        hour on twelve heartbeat timeouts. Two consecutive scenarios ending in a
        lab fault (after their rerun) stop the set, which resumes from the next
        scenario once the lab is back; the verdicts already won stay."""
        (self.scen / "t2-fault-two.yaml").write_text(LAB_FAULT.replace("id: t2-fault", "id: t2-fault-two"))
        rid = self._start(["t2-green-one", "t2-fault", "t2-fault-two", "t2-green-two"])
        body = self._wait(rid)
        self.assertEqual(body["state"], "stopped", body["summary"])
        self.assertIsNone(body["verdict"])
        self.assertEqual(body["position"], 3, "stopped after the second fault, before t2-green-two")
        self.assertEqual([e["verdict"] for e in body["runs"]["t2-fault"]], ["error", "error"])
        self.assertEqual([e["verdict"] for e in body["runs"]["t2-fault-two"]], ["error", "error"])
        self.assertNotIn("t2-green-two", body["runs"])
        self.assertTrue(any("lab fault" in n and "resume" in n for n in body["notes"]), body["notes"])
        # the lab is back (the faulting scenarios stay broken in this test): resume plays the rest
        r = self.client.post(f"/lab/runset/{rid}/resume")
        self.assertEqual(r.status_code, 200, r.text)
        body = self._wait(rid)
        self.assertEqual(body["state"], "done")
        self.assertEqual(body["runs"]["t2-green-two"][0]["verdict"], "green")
        self.assertEqual(body["verdict"], "error", "the two faults never got a verdict")

    def test_two_reds_are_red_with_no_rerun(self):
        rid = self._start(["t2-red", "t2-red-two"])
        body = self._wait(rid)
        self.assertEqual(body["verdict"], "red")
        self.assertEqual(len(body["runs"]["t2-red"]), 1)
        self.assertEqual(len(body["runs"]["t2-red-two"]), 1)

    def test_a_set_stops_after_its_current_run_and_resumes_where_it_stopped(self):
        names = [f"t2-green-{n}" for n in ("one", "two", "three", "four", "five")]
        rid = self._start(names)
        self._wait(rid, until=lambda b: b["position"] >= 1)
        r = self.client.post(f"/lab/runset/{rid}/stop")
        self.assertEqual(r.status_code, 200, r.text)
        body = self._wait(rid, until=lambda b: b["state"] in ("stopped", "done"))
        self.assertEqual(body["state"], "stopped", body["summary"])
        stopped_at = body["position"]
        self.assertLess(stopped_at, 5)
        self.assertTrue(any("stopped before" in n for n in body["notes"]))
        self.assertIsNone(self.services.runsets.active)
        r = self.client.post(f"/lab/runset/{rid}/resume")
        self.assertEqual(r.status_code, 200, r.text)
        body = self._wait(rid)
        self.assertEqual(body["state"], "done")
        self.assertEqual(body["verdict"], "green")
        self.assertEqual(body["position"], 5)
        self.assertTrue(all(len(body["runs"][n]) == 1 for n in names), "no scenario ran twice across the stop")

    def test_an_unknown_scenario_and_a_second_set_are_refused(self):
        r = self.client.post("/lab/runset", json={"name": "gate", "scenarios": ["nope"]})
        self.assertEqual(r.status_code, 400)
        self.assertIn("E_RUNSET_SCENARIO", r.text)
        rid = self._start(["t2-green-one", "t2-green-two"])
        r = self.client.post("/lab/runset", json={"name": "again", "scenarios": "all"})
        self.assertEqual(r.status_code, 409, r.text)
        self.assertIn("BUSY", r.text)  # the set's own refusal, or the runner's while its run is active
        self._wait(rid)

    def test_all_means_every_scenario_in_the_deployed_tree(self):
        rs = self.runsets
        self.assertEqual(rs.list_scenarios(), sorted(p.stem for p in self.scen.glob("*.yaml")))

    def test_a_hold_refuses_runs_and_run_sets_until_released(self):
        r = self.client.post("/lab/hold", json={"minutes": 30, "reason": "playtest sixteen"})
        self.assertEqual(r.status_code, 200, r.text)
        self.assertEqual(r.json()["hold"]["reason"], "playtest sixteen")
        self.assertEqual(self.client.get("/lab/status").json()["hold"]["reason"], "playtest sixteen")
        r = self.client.post("/lab/run", files={"scenario": ("s.yaml", GREEN.encode(), "text/yaml")})
        self.assertEqual(r.status_code, 409, r.text)
        self.assertIn("E_RUN_HOLD", r.text)
        self.assertIn("playtest sixteen", r.text)
        r = self.client.post("/lab/runset", json={"name": "gate", "scenarios": ["t2-green-one"]})
        self.assertEqual(r.status_code, 409, r.text)
        self.assertIn("E_RUN_HOLD", r.text)
        r = self.client.post("/lab/up")
        self.assertEqual(r.status_code, 409, r.text)
        r = self.client.post("/lab/release")
        self.assertEqual(r.status_code, 200, r.text)
        self.assertIsNone(self.client.get("/lab/status").json()["hold"])
        rid = self._start(["t2-green-one"])
        self.assertEqual(self._wait(rid)["verdict"], "green")

    def test_a_hold_does_not_block_a_snapshot_or_a_promote(self):
        """A hold is the holder's: its own snapshot of the clones it has just
        written (verb-stage) goes through; only runs, run sets, up and down wait."""
        from labapi.guests import Guest

        self.services.tables.guests["fake-c1"] = Guest("fake-c1", 901, "127.0.0.1", "qemu", "client", True, "clean-m1", "c1")
        self.assertEqual(self.client.post("/lab/hold", json={"minutes": 30, "reason": "staging"}).status_code, 200)
        r = self.client.post("/lab/clients/c1/snapshot", json={"name": "clean-m1-next", "description": "test"})
        self.assertNotEqual(r.status_code, 409, r.text)
        self.assertNotIn("E_RUN_HOLD", r.text)
        self.assertIsNotNone(self.client.get("/lab/status").json()["hold"], "the hold still stands after it")
        self.client.post("/lab/release")

    def test_a_bad_hold_is_refused(self):
        self.assertEqual(self.client.post("/lab/hold", json={"minutes": 0, "reason": "x"}).status_code, 400)
        self.assertEqual(self.client.post("/lab/hold", json={"minutes": 10}).status_code, 400)
        self.assertIsNone(self.client.get("/lab/status").json()["hold"])

    def test_the_nightly_waits_for_a_hold_a_quiet_operator_and_fresh_heartbeats(self):
        from labapi.guests import Guest

        rs = self.runsets
        runner = self.services.runner
        rs.s = dataclasses.replace(self.settings, nightly_sweep_utc="10:30", nightly_quiet_s=1800.0, nightly_window_s=5400.0, heartbeat_fresh_s=120.0)
        utc = timezone.utc
        now = datetime(2026, 10, 20, 10, 40, tzinfo=utc)
        rs._wall = lambda: now.timestamp()
        rs._started_wall = now.timestamp() - 7200
        runner._last_run_ended_wall = now.timestamp() - 7200
        runner.last_activity_wall = now.timestamp() - 7200
        # a hold stands: no nightly
        runner.hold_until = now.timestamp() + 600
        runner.hold_reason = "playtest"
        self.assertIsNone(rs.maybe_nightly(now), "held")
        runner.hold_until = None
        # an operator did something a minute ago (a state RPC, an assist): wait
        runner.last_activity_wall = now.timestamp() - 60
        self.assertIsNone(rs.maybe_nightly(now), "an operator is at work")
        runner.last_activity_wall = now.timestamp() - 7200
        # a managed client whose game is not polling (a dist copy, a snapshot): wait
        self.services.tables.guests["fake-c1"] = Guest("fake-c1", 901, "127.0.0.1", "qemu", "client", True, "clean-sp", "c1")
        self.services.board._last_poll.pop("c1", None)
        self.assertIsNone(rs.maybe_nightly(now), "c1's game is not polling")
        self.doubles.turn()  # c1 polls
        self.assertIsNotNone(rs.maybe_nightly(now), "idle, quiet, held by nobody, both games up")
        rs.active = None

    def test_an_operator_call_counts_as_activity_and_the_labs_pulse_does_not(self):
        runner = self.services.runner
        runner.last_activity_wall = 0.0
        self.client.get("/lab/status")
        self.client.get("/lab/step", params={"client": "c1"})
        self.client.get("/lab/runsets")
        self.assertEqual(runner.last_activity_wall, 0.0, "status, the driver's poll and the listing are the lab's own pulse")
        self.client.post("/lab/release")
        self.assertGreater(runner.last_activity_wall, 0.0, "an operator call")

    def test_a_scenario_named_twice_runs_once(self):
        rid = self._start(["t2-green-one", "t2-green-one", "t2-green-two"])
        body = self._wait(rid)
        self.assertEqual(body["scenarios"], ["t2-green-one", "t2-green-two"])
        self.assertEqual(body["verdict"], "green")

    def test_the_nightly_starts_once_within_its_window_when_the_lab_has_been_idle(self):
        rs = self.runsets
        rs.s = dataclasses.replace(self.settings, nightly_sweep_utc="10:30", nightly_quiet_s=1800.0, nightly_window_s=5400.0)
        utc = timezone.utc
        runner = self.services.runner

        clocks = [rs]  # every RunSets instance under test reads the same test clock

        def at(*hm, day=14):
            """The clock set to that UTC time on 2026-10-<day>; returns it."""
            now = datetime(2026, 10, day, *hm, tzinfo=utc)
            for inst in clocks:
                inst._wall = lambda now=now: now.timestamp()
            return now

        # lab-api started an hour ago, the last run ended an hour ago: a quiet lab
        rs._started_wall = at(9, 0).timestamp()
        runner.last_activity_wall = runner._last_run_ended_wall = at(9, 30).timestamp()
        self.assertIsNone(rs.maybe_nightly(at(10, 29)), "not yet")
        runner.last_activity_wall = runner._last_run_ended_wall = at(10, 25).timestamp()
        self.assertIsNone(rs.maybe_nightly(at(10, 31)), "a run ended minutes ago: somebody is working")
        runner.last_activity_wall = runner._last_run_ended_wall = at(9, 30).timestamp()
        runner.maintenance = "snapshot"
        self.assertIsNone(rs.maybe_nightly(at(10, 31)), "a snapshot is in progress")
        runner.maintenance = None
        night = rs.maybe_nightly(at(10, 31))
        self.assertIsNotNone(night, "due, idle, nothing ran today")
        self.assertEqual(night.name, "nightly")
        self.assertEqual(night.scenarios, rs.list_scenarios())
        self.assertTrue(night.id.startswith("20261014-"))
        rs.active = None  # the test does not play it
        self.assertIsNone(rs.maybe_nightly(at(10, 45)), "once a day, by the record under results/runsets")
        # a restart later the same day remembers through the record
        self.services.runsets = fresh = type(rs)(rs.s, runner)
        fresh.scenarios_dir = self.scen
        clocks.append(fresh)
        fresh._started_wall = at(11, 0).timestamp() - 7200
        self.assertIsNone(fresh.maybe_nightly(at(11, 0)), "a restart after the due minute does not run it again")
        # the next day: outside the window nothing starts, inside it does
        runner.last_activity_wall = runner._last_run_ended_wall = at(9, 0, day=15).timestamp()
        fresh._started_wall = runner._last_run_ended_wall
        self.assertIsNone(fresh.maybe_nightly(at(12, 30, day=15)), "the window (90 min) has closed")
        self.assertIsNotNone(fresh.maybe_nightly(at(10, 30, day=15)), "the next day, on the minute")
        fresh.active = None
        # a lab-api that just started counts its own start as activity
        later = type(rs)(rs.s, runner)
        later.scenarios_dir = self.scen
        clocks.append(later)
        later._started_wall = at(10, 40, day=16).timestamp()
        runner._last_run_ended_wall = None
        runner.last_activity_wall = 0.0  # nothing since this lab-api started
        self.assertIsNone(later.maybe_nightly(at(10, 45, day=16)), "started five minutes ago: wait the quiet spell")
        later._started_wall = at(10, 0, day=16).timestamp()
        self.assertIsNotNone(later.maybe_nightly(at(10, 45, day=16)), "idle since its start half an hour ago")
        later.active = None
        later.s = dataclasses.replace(self.settings, nightly_sweep_utc="")
        self.assertIsNone(later.maybe_nightly(at(10, 31, day=17)), "no nightly configured")

if __name__ == "__main__":
    unittest.main()
