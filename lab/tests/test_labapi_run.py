"""End-to-end runs through the FastAPI app on the fakes: the clients are test
doubles that poll /lab/step and answer, the server state is FakeState behind
the real RpcStateClient, Proxmox and the system are recording fakes."""

import base64
import calendar
import json
import re
import tempfile
import time
import unittest
from pathlib import Path

from _labapi import needs_deps

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
  - c1: screenshot
  - assert:
      - server.actor(c2).cell == "lab-spawn"
      - c1.sees(c2) == true
  - c1: move {dx: 300, dy: 0, duration_s: 3}
  - assert:
      - abs(server.actor(c1).x - 300) < 50
      - abs(c2.view(c1).x - server.actor(c1).x) < 50
  - c1: give {item: "Skyrim.esm:IronSword", count: 1}
  - assert:
      - server.inventory(c1).count("Skyrim.esm:IronSword") == 1
  - server: restart
  - c1: reconnect
  - assert:
      - abs(server.actor(c1).x - 300) < 50
artifacts: [server.log, c1.log, screenshots, world-diff, pcap]
"""

RED = """
id: t2-red
clients: [c1]
steps:
  - c1: connect
  - assert:
      - server.actor(c1).x == 12345
  - c1: move {dx: 1, dy: 0}
"""

GUESTS = """
guests:
  - {name: fake-c1, vmid: 901, ip: 127.0.0.1, kind: qemu, role: client, managed: false, client: c1}
  - {name: fake-c2, vmid: 902, ip: 127.0.0.1, kind: qemu, role: client, managed: false, client: c2}
clients:
  c1: {profile_id: 1}
  c2: {profile_id: 2}
items:
  "Skyrim.esm:IronSword": 0x00012EB7
  "Skyrim.esm:RecipeWeaponIronDagger": 0x000DA76A
  "rotfern.esp:rotfern": 0x0800AA00
"""


class Doubles:
    """Fake lab-drivers: poll each client's queue once per turn and answer."""

    def __init__(self, client, state, names, prefix="/lab"):
        self.client, self.state, self.names, self.prefix = client, state, names, prefix
        self.profile = {"c1": 1, "c2": 2}
        self.seen: list[tuple[str, str, dict]] = []
        self.stale_dumps = 0  # dump-states that report the client far from where the server's record says
        self.menus: dict[str, list[str]] = {}  # the menus a client's dump-state reports open

    def turn(self):
        for name in self.names:
            step = self.client.get(f"{self.prefix}/step", params={"client": name}).json()
            if not step:
                continue
            me = self.state.actors[self.profile[name]]
            self.seen.append((name, step["action"], dict(step.get("args") or {})))
            data = {}
            if step["action"] == "move":
                # the driver's contract: an absolute target, never an offset
                assert "dx" not in step["args"] and "x" in step["args"], step["args"]
                distance = ((float(step["args"]["x"]) - me.x) ** 2 + (float(step["args"]["y"]) - me.y) ** 2) ** 0.5
                me.x = float(step["args"]["x"])
                me.y = float(step["args"]["y"])
                me.z = float(step["args"]["z"])
                data = {"dispatched": True, "distance": distance, "speed": step["args"].get("speed")}
            elif step["action"] == "dump-state":
                if self.stale_dumps > 0:
                    self.stale_dumps -= 1
                    data = {"pos": [9999.0, 9999.0, 0.0], "worldOrCell": 60, "sees": {}}
                    r = self.client.post(f"{self.prefix}/step/{step['id']}/result", json={"ok": True, "data": data})
                    assert r.status_code == 200, r.text
                    continue
                data = {"pos": [me.x, me.y, me.z], "worldOrCell": 60,
                        "self": {"x": me.x, "y": me.y, "z": me.z, "cell": me.cell},
                        "sees": {o: {"x": a.x, "y": a.y, "z": a.z} for pid, a in self.state.actors.items() for o, p in self.profile.items() if p == pid and o != name}}
                if name in self.menus:
                    data["menus"] = list(self.menus[name])
            elif step["action"] == "request-screenshot":
                data = {"png_b64": base64.b64encode(b"\x89PNG fake").decode()}
            elif step["action"] == "av-table":
                data = {"ids": list(range(1000, 1164))}
            r = self.client.post(f"{self.prefix}/step/{step['id']}/result", json={"ok": True, "data": data})
            assert r.status_code == 200, r.text


@needs_deps
class RunTests(unittest.TestCase):
    def setUp(self):
        from fastapi.testclient import TestClient
        from labapi.app import build_fake, create_app
        from labapi.config import Settings
        from labapi.fakes import FakeState

        self.tmp = Path(tempfile.mkdtemp(prefix="labapi-test-"))
        (self.tmp / "snapshots" / "clean").mkdir(parents=True)
        (self.tmp / "snapshots" / "clean" / "actors.json").write_text('{"a": 1}')
        (self.tmp / "guests.yaml").write_text(GUESTS)
        self.settings = Settings(
            results_dir=str(self.tmp / "results"), guests_file=str(self.tmp / "guests.yaml"),
            server_world_dir=str(self.tmp / "world"), server_snapshots_dir=str(self.tmp / "snapshots"),
            step_timeout_s=5, heartbeat_timeout_s=5, server_ready_timeout_s=1, connect_timeout_s=1, time_scale=0.0,
            before_logs_quiet_s=0.0,  # the clients' before-run logs are fetched only where a test turns it on
            hang_evidence=False,  # a hung seat's dump is taken only where a test turns it on
        )
        self.state = FakeState()
        self.state.spawn(1, 0, 0, 0)
        self.state.spawn(2, 0, 0, 0)
        self.services = build_fake(self.settings, fake_state=self.state)
        self.app = create_app(self.services)
        self.client = TestClient(self.app).__enter__()
        self.doubles = Doubles(self.client, self.state, ["c1", "c2"])

    def tearDown(self):
        self.client.__exit__(None, None, None)

    def _run(self, text, timeout=20.0):
        r = self.client.post("/lab/run", files={"scenario": ("s.yaml", text.encode(), "text/yaml")})
        self.assertEqual(r.status_code, 200, r.text)
        run_id = r.json()["run"]
        deadline = time.time() + timeout
        while time.time() < deadline:
            self.doubles.turn()
            body = self.client.get(f"/lab/run/{run_id}").json()
            # the verdict turns terminal inside a step; the record is complete once finished is set
            if body["verdict"] != "running" and body.get("finished"):
                return run_id, body
            time.sleep(0.02)
        self.fail(f"run {run_id} did not finish: {body}")

    def test_a_long_answer_is_kept_whole_beside_the_run(self):
        run_id, body = self._run("""
id: t2-long-answer
clients: [c1]
server: {snapshot: clean}
timeout_s: 30
steps:
  - c1: connect
  - c1: av-table
""")
        self.assertEqual(body["verdict"], "green", json.dumps(body, indent=1))
        step = body["steps"][1]
        self.assertIn("... (whole: steps/001-c1-av-table.json)", step["note"], step)
        kept = json.loads((self.tmp / "results" / run_id / "steps" / "001-c1-av-table.json").read_text())
        self.assertEqual(kept["ids"], list(range(1000, 1164)))
        # a short answer stays whole in result.json, with nothing beside it
        self.assertFalse((self.tmp / "results" / run_id / "steps" / "000-c1-connect.json").exists())

    def test_the_outgoing_server_log_is_kept_before_the_world_is_replaced(self):
        """A playtest's server log lived only in the container until the next
        run recreated it (playtest fifteen, 2026-10-13). The first run after
        lab-api starts keeps the last 24 h; a run after another keeps the lines
        since that one ended; both before `compose stop`."""
        run_id, body = self._run(GREEN)
        self.assertEqual(body["verdict"], "green", json.dumps(body, indent=1))
        cmds = self.services.system.commands
        first_logs = next(i for i, c in enumerate(cmds) if "logs" in c)
        first_stop = next(i for i, c in enumerate(cmds) if c[-2:] == ["stop", "skymp-server"])
        self.assertLess(first_logs, first_stop, "the outgoing log is read before the server stops")
        self.assertEqual(cmds[first_logs][-3:], ["--since", "24h", "skymp-server"])
        run_dir = self.tmp / "results" / run_id
        self.assertEqual((run_dir / "server-before.log").read_text(), "fake server log\n")
        self.assertIn("server-before.log", body["artifacts"])
        # the next run keeps the lines since this one ended
        self.services.system.commands.clear()
        run2, body2 = self._run(GREEN)
        logs2 = next(c for c in self.services.system.commands if "logs" in c)
        self.assertEqual(logs2[-3:], ["--since", body["finished"], "skymp-server"])
        self.assertTrue((self.tmp / "results" / run2 / "server-before.log").is_file())

    def test_an_empty_outgoing_log_leaves_no_artifact(self):
        self.services.system.log_text = ""
        run_id, body = self._run(GREEN)
        self.assertEqual(body["verdict"], "green", json.dumps(body, indent=1))
        self.assertFalse((self.tmp / "results" / run_id / "server-before.log").exists())
        self.assertNotIn("server-before.log", body["artifacts"])

    def test_a_solo_run_tells_the_launcher_and_refuses_connect(self):
        """ADR-031's reference traces: the clone's launcher asks GET /lab/game and
        starts the game without skymp5-client when the active run is solo and
        names it; a connect step has no meaning there."""
        r = self.client.get("/lab/game", params={"client": "c1"}).json()
        self.assertEqual(r["solo"], False, "no run: the multiplayer game")
        solo = """
id: p-solo-ref
solo: true
clients: [c1]
server: {snapshot: clean}
timeout_s: 30
steps:
  - c1: dump-state
  - c1: connect
artifacts: []
"""
        run_id, body = self._run(solo)
        self.assertEqual(body["verdict"], "error", body)
        self.assertIn("E_RUN_SOLO", json.dumps(body["failures"]))
        self.assertTrue(any(s["action"] == "dump-state" and s["ok"] for s in body["steps"]), "the driver's own steps run")
        self.assertEqual(self.client.get("/lab/game", params={"client": "c1"}).json()["solo"], False, "after the run, the multiplayer game again")

    def test_the_trace_artifact_keeps_each_clients_last_watch(self):
        """ADR-031: `trace` among a scenario's artifacts writes trace-<client>.json,
        the client's last watch-stop whole, what a reference is made from and what
        the parity assertion read."""
        run_id, body = self._run("""
id: t2-trace
clients: [c1, c2]
server: {snapshot: clean}
timeout_s: 30
steps:
  - c1: connect
  - c2: connect
  - c1: watch-start
  - wait: 1
  - c1: watch-stop
artifacts: [trace]
""")
        self.assertEqual(body["verdict"], "green", json.dumps(body, indent=1))
        run_dir = self.tmp / "results" / run_id
        self.assertTrue((run_dir / "trace-c1.json").is_file(), "c1 reported a watch-stop")
        self.assertFalse((run_dir / "trace-c2.json").exists(), "c2 never watched")
        self.assertIn("trace-c1.json", body["artifacts"])
        self.assertFalse(any("unknown artifact" in n for n in body["notes"]), body["notes"])

    def test_a_build_read_that_fails_is_noted_in_the_build_never_the_runs_failure(self):
        self.services.system.server_image = ""   # docker inspect answers nothing
        run_id, body = self._run(GREEN)
        self.assertEqual(body["verdict"], "green", json.dumps(body, indent=1))
        result = json.loads((self.tmp / "results" / run_id / "result.json").read_text())
        self.assertIn("error", result["build"]["server"])
        self.assertNotIn("image", result["build"]["server"])

    def test_green_run_end_to_end(self):
        run_id, body = self._run(GREEN)
        self.assertEqual(body["verdict"], "green", json.dumps(body, indent=1))
        self.assertEqual([p["name"] for p in body["phases"]], ["rollback-server", "rollback-clients", "game-version"])
        self.assertTrue(all(p["ok"] for p in body["phases"]))
        self.assertEqual(len(body["steps"]), 14)
        self.assertTrue(all(s["ok"] for s in body["steps"]))
        run_dir = self.tmp / "results" / run_id
        result = json.loads((run_dir / "result.json").read_text())
        self.assertEqual(result["verdict"], "green")
        for key in ("run", "scenario", "verdict", "started", "finished", "phases", "steps", "failures", "artifacts"):
            self.assertIn(key, result)
        # the run names what it played: the server container's image reference and id
        self.assertEqual(result["build"]["server"], {"image": "10.10.70.12:5000/skymp-server:parity", "id": "sha256:5e7ve7"})
        self.assertIn("server.log", result["artifacts"])
        self.assertIn("world-diff", result["artifacts"])
        self.assertIn("lab.pcap", result["artifacts"])
        self.assertIn("screenshots", result["artifacts"])
        self.assertTrue((run_dir / "screenshots" / "005-c1.png").is_file())
        self.assertTrue((run_dir / "world-before" / "actors.json").is_file())
        self.assertTrue((run_dir / "world-diff").is_file())
        self.assertTrue(any("c1.log" in n for n in result["notes"]), "unmanaged client log is noted, not fetched")
        # every client step records where the server put the client afterwards, and a driver step its answer
        move = next(s for s in result["steps"] if s["action"] == "move")
        self.assertEqual(move["pos"]["cell"], "lab-spawn", move)
        self.assertAlmostEqual(move["pos"]["x"], 300.0, delta=1)
        self.assertIn('"dispatched": true', move["note"], move)
        self.assertIn('"distance": 300.0', move["note"], move)
        teleport = next(s for s in result["steps"] if s["action"] == "teleport")
        self.assertIn("landed after 1 attempt", teleport["note"], teleport)
        # a server command's answer is its step's note (a no-op set shows in the run's own result)
        given = next(s for s in result["steps"] if s["action"] == "give")
        self.assertIn('"count": 1', given["note"], given)
        self.assertNotIn("pos", next(s for s in result["steps"] if s["kind"] == "wait"))
        # the fake state saw the two server verbs and the RPC contract's shapes
        kinds = [(n, p["kind"]) for n, p in self.state.rpc_log]
        self.assertIn(("labCommand", "teleport"), kinds)
        self.assertIn(("labCommand", "give"), kinds)
        self.assertIn(("labState", "inventory"), kinds)
        give = next(p for n, p in self.state.rpc_log if n == "labCommand" and p["kind"] == "give")
        self.assertEqual(give["baseId"], 0x12EB7)
        # the system saw the rollback, restart, logs, and a capture that was stopped
        cmds = self.services.system.commands
        self.assertTrue(any(c[-2:] == ["stop", "skymp-server"] for c in cmds))
        self.assertTrue(any(c[-3:] == ["up", "-d", "skymp-server"] for c in cmds))
        self.assertTrue(any(c[-2:] == ["restart", "skymp-server"] for c in cmds))
        # the server's log is this run's alone, from the run's start (the first
        # `logs` is the outgoing log kept before the world was replaced)
        logs = [c for c in cmds if "logs" in c][-1]
        self.assertEqual(logs[-3:], ["--since", result["started"], "skymp-server"])
        self.assertEqual(len(self.services.system.stopped_captures), 1)
        self.assertIsNone(self.services.runner.active)

    def test_red_run_on_failed_assertion(self):
        run_id, body = self._run(RED)
        self.assertEqual(body["verdict"], "red")
        self.assertEqual(len(body["failures"]), 1)
        self.assertEqual(body["failures"][0]["kind"], "assertion")
        self.assertEqual(body["failures"][0]["expr"], "server.actor(c1).x == 12345")
        self.assertEqual(len(body["steps"]), 2, "the run stops at the failed assert block")
        # the number behind the verdict is in the failure and the step's note
        x = body["failures"][0]["values"]["server.actor(c1).x"]
        self.assertIsInstance(x, float)
        self.assertIn(f"server.actor(c1).x = {x}", body["steps"][-1]["note"])

    def test_step_timeout_is_red_and_busy_is_409(self):
        # a driver step (connect is judged by the server and never reaches the queue)
        text = "id: t2-timeout\nclients: [c1]\nsteps:\n  - c1: dump-state\n"
        r = self.client.post("/lab/run", files={"scenario": ("s.yaml", text.encode(), "text/yaml")})
        run_id = r.json()["run"]
        self.assertEqual(self.client.post("/lab/run", files={"scenario": ("s.yaml", text.encode(), "text/yaml")}).status_code, 409)
        # only heartbeat, never answer: poll but drop the step
        deadline = time.time() + 15
        while time.time() < deadline:
            self.client.get("/lab/step", params={"client": "c1"})
            body = self.client.get(f"/lab/run/{run_id}").json()
            if body["verdict"] != "running":
                break
            time.sleep(0.05)
        self.assertEqual(body["verdict"], "red")
        self.assertEqual(body["failures"][0]["kind"], "timeout")

    def test_missing_snapshot_is_error(self):
        text = "id: t2-nosnap\nclients: [c1]\nserver: {snapshot: nope}\nsteps: []\n"
        run_id, body = self._run(text)
        self.assertEqual(body["verdict"], "error")
        self.assertIn("E_RUN_SNAPSHOT", body["failures"][0]["error"])

    def test_bad_scenario_is_400(self):
        r = self.client.post("/lab/run", files={"scenario": ("s.yaml", b"id: t\nclients: [c1]\nsteps:\n  - c9: connect\n", "text/yaml")})
        self.assertEqual(r.status_code, 400)
        self.assertIn("E_SCENARIO", r.text)

    def test_status_and_step_endpoints(self):
        body = self.client.get("/lab/status").json()
        for key in ("run", "guests", "heartbeats_s_ago", "netem", "memory"):
            self.assertIn(key, body)
        self.assertEqual(self.client.get("/lab/step", params={"client": "c1"}).json(), {})
        self.assertEqual(self.client.post("/lab/step/s999/result", json={"ok": True}).status_code, 404)
        self.assertIn("c1", self.client.get("/lab/status").json()["heartbeats_s_ago"])

    def test_managed_clients_are_rolled_back_and_fenestrate_is_not(self):
        import asyncio

        from labapi.guests import Guest
        from labapi.runner import RunRecord
        from labapi.scenario import Scenario

        tables = self.services.tables
        tables.guests["sky-c1"] = Guest("sky-c1", 711, "10.10.70.21", "qemu", "client", True, "clean-sp", "c1")
        tables.guests["fenestrate"] = Guest("fenestrate", 220, "10.10.60.20", "qemu", "client", False, "", "c2")
        del tables.guests["fake-c1"], tables.guests["fake-c2"]
        runner = self.services.runner
        rec = RunRecord("x", Scenario(id="x", clients=["c1", "c2"]), self.tmp, "now")

        async def go():
            task = asyncio.create_task(runner._rollback_clients(rec, ["c1", "c2"]))
            for _ in range(200):
                await asyncio.sleep(0.01)
                self.services.board.poll("c1")
                self.services.board.poll("c2")
                if task.done():
                    break
            await task

        asyncio.run(go())
        pve = self.services.control._b
        # the snapshot list read last is the run's provenance: which snapshot, and its description
        self.assertEqual(pve.calls, [("stop", 711), ("rollback", 711, "clean-sp"), ("start", 711), ("snapshots", 711)])
        self.assertTrue(rec.phases[0]["ok"], rec.phases)
        self.assertIn("unmanaged", rec.phases[0]["note"])
        self.assertEqual(rec.build["clients"], {"c1": {"snapshot": "clean-sp", "description": ""}})


@needs_deps
class UntilSteps(RunTests):
    """until: a condition polled until it holds or its cap passes (the
    process plan's B7)."""

    def test_an_until_holds_once_the_server_does(self):
        import threading

        threading.Timer(0.3, lambda: setattr(self.state.actors[1], "healthPercentage", 0.3)).start()
        run_id, body = self._run("""
id: t2-until
clients: [c1]
steps:
  - c1: connect
  - until:
      within: 10
      every: 0.1
      expect:
        - server.actor(c1).healthPercentage < 0.5
  - assert:
      - server.actor(c1).healthPercentage < 0.5
""")
        self.assertEqual(body["verdict"], "green", json.dumps(body, indent=1))
        self.assertIn("1 held after", body["steps"][1]["note"])
        self.assertIn("server.actor(c1).healthPercentage = 0.3", body["steps"][1]["note"])

    def test_an_until_that_never_holds_is_red_past_its_cap(self):
        run_id, body = self._run("""
id: t2-until-red
clients: [c1]
steps:
  - c1: connect
  - until: {within: 0.4, every: 0.1, expect: ["server.actor(c1).x == 12345"]}
  - c1: move {dx: 1, dy: 0}
""")
        self.assertEqual(body["verdict"], "red", json.dumps(body, indent=1))
        self.assertEqual(len(body["steps"]), 2, "the run stops at the until")
        failure = body["failures"][0]
        self.assertEqual((failure["kind"], failure["expr"]), ("until", "server.actor(c1).x == 12345"))
        self.assertIn("after 0.4s", failure["error"])
        self.assertIsInstance(failure["values"]["server.actor(c1).x"], float)

    def test_an_until_that_cannot_parse_errs_at_once(self):
        run_id, body = self._run("""
id: t2-until-syntax
clients: [c1]
steps:
  - c1: connect
  - until: {within: 30, expect: ["server.actor(c1).x ==="]}
""")
        self.assertEqual(body["verdict"], "error", json.dumps(body, indent=1))
        self.assertEqual(body["failures"][0]["kind"], "assertion-syntax")
        self.assertLess(body["steps"][1]["seconds"], 5.0)


class RollbackHeartbeat(RunTests):
    def test_a_heartbeat_from_before_the_restart_does_not_pass_the_phase(self):
        """The old session polls until the stop lands; that poll must not count
        as the fresh boot's heartbeat (run 20261001-233852)."""
        import asyncio

        from labapi.guests import Guest
        from labapi.runner import RunRecord
        from labapi.scenario import Scenario

        tables = self.services.tables
        tables.guests["fake-c1"] = Guest("fake-c1", 901, "127.0.0.1", "qemu", "client", True, "clean-sp", "c1")
        pve = self.services.control._b
        board = self.services.board
        real_stop = pve.stop

        def stop_with_a_late_poll(guest):
            board.poll("c1")  # the previous session's last heartbeat, landing as the stop is issued
            real_stop(guest)

        pve.stop = stop_with_a_late_poll
        runner = self.services.runner
        runner.s = __import__("dataclasses").replace(runner.s, heartbeat_timeout_s=0.3)
        from labapi.runner import RunnerError

        rec = RunRecord("x", Scenario(id="x", clients=["c1"]), self.tmp, "now")
        with self.assertRaises(RunnerError):
            asyncio.run(runner._rollback_clients(rec, ["c1"]))
        self.assertFalse(rec.phases[0]["ok"], rec.phases)
        self.assertIn("E_RUN_NO_HEARTBEAT", rec.phases[0]["note"])
        self.assertEqual([c for c in pve.calls if c[0] in ("stop", "rollback", "start")], [("stop", 901), ("rollback", 901, "clean-sp"), ("start", 901)])


SOLO_WITH_LOG = """
id: solo-log
clients: [c1]
server: {snapshot: clean}
timeout_s: 30
steps:
  - c1: connect
  - c1: dump-state
  - assert:
      - server.actor(c1).x == 0
artifacts: [server.log, c1.log]
"""


@needs_deps
class ArtifactFailures(RunTests):
    def test_backend_error_in_artifact_collection_still_finalizes_the_run(self):
        """The guest agent of a managed client gone after its rollback (sky-c1,
        2026-10-01): the client log fetch fails, the run still ends with a
        result, the board is cleared and the next run is accepted."""
        from labapi.guests import Guest

        tables = self.services.tables
        tables.guests["fake-c1"] = Guest("fake-c1", 901, "127.0.0.1", "qemu", "client", True, "clean-sp", "c1")
        pve = self.services.control._b

        def boom(guest, path):
            raise RuntimeError("500 Internal Server Error: QEMU guest agent is not running")

        pve.file_read = boom
        run_id, body = self._run(SOLO_WITH_LOG)
        self.assertEqual(body["verdict"], "green", body)
        self.assertTrue(any("c1.log" in n and "QEMU guest agent" in n for n in body["notes"]), body["notes"])
        self.assertIsNotNone(body["finished"], body)
        self.assertTrue(list((self.tmp / "results").glob("**/result.json")), "result.json not written")
        self.assertIsNone(self.client.get("/lab/status").json()["run"])
        run_id2, body2 = self._run(SOLO_WITH_LOG)
        self.assertNotEqual(run_id, run_id2)
        self.assertEqual(body2["verdict"], "green", body2)


@needs_deps
class ClientLogs(RunTests):
    def test_managed_client_yields_the_platform_log_and_the_driver_log(self):
        """c1.log is Skyrim Platform's log; c1-driver.log is lab-driver's own
        (writeLogs under the game directory named in game-dir.txt); every other log
        in the SKSE folder comes as c1-<name>: skse64.log, which prints the game's
        image base (the load freeze's hypothesis, 2026-10-17), and each SKSE plugin's
        own (TMS_AIPathingFreezeFix.log, the freeze fix layer's evidence). All are
        copied into the lab directory first and read from there."""
        from labapi.guests import Guest

        tables = self.services.tables
        tables.guests["fake-c1"] = Guest("fake-c1", 901, "127.0.0.1", "qemu", "client", True, "clean-sp", "c1")
        pve = self.services.control._b
        pve.skse_logs = ["skse64.log", "TMS_AIPathingFreezeFix.log"]
        pve.files[r"C:\sky-lab\c1.log"] = "platform log\n"
        pve.files[r"C:\sky-lab\c1-driver.log"] = "2026-10-01T00:00:00Z loaded\n"
        pve.files[r"C:\sky-lab\c1-skse64.log"] = "imagebase = 00007FF7AB420000\n"
        pve.files[r"C:\sky-lab\c1-TMS_AIPathingFreezeFix.log"] = "patched 1 call\n"
        run_id, body = self._run(SOLO_WITH_LOG)
        self.assertEqual(body["verdict"], "green", body)
        self.assertIn("c1.log", body["artifacts"])
        self.assertIn("c1-driver.log", body["artifacts"])
        self.assertIn("c1-skse64.log", body["artifacts"])
        self.assertIn("c1-TMS_AIPathingFreezeFix.log", body["artifacts"])
        run_dir = self.tmp / "results" / run_id
        self.assertEqual((run_dir / "c1-driver.log").read_text(), "2026-10-01T00:00:00Z loaded\n")
        self.assertEqual((run_dir / "c1-skse64.log").read_text(), "imagebase = 00007FF7AB420000\n")
        self.assertEqual((run_dir / "c1-TMS_AIPathingFreezeFix.log").read_text(), "patched 1 call\n")
        copies = [c for c in pve.calls if c[0] == "exec" and "Copy-Item" in " ".join(c[2])]
        self.assertEqual(len(copies), 3, pve.calls)
        self.assertIn("game-dir.txt", " ".join(copies[1][2]))
        self.assertIn("lab-driver-logs.txt", " ".join(copies[1][2]))
        # one listing: the folder skyrim-platform.log is in, itself left out (it is c1.log), then every other
        # My Games\<folder>\SKSE (the freeze fix logs under Skyrim.INI\SKSE), a name kept from its first folder
        listing = " ".join(copies[2][2])
        self.assertIn(r"$main = 'C:\Users\lab\Documents\My Games\Skyrim Special Edition\SKSE'", listing)
        self.assertIn("Join-Path $_.FullName 'SKSE'", listing)
        self.assertIn("-Filter '*.log'", listing)
        self.assertIn("$_.Extension -eq '.log' -and $_.Name -ne 'skyrim-platform.log' -and -not $seen.ContainsKey($_.Name)", listing)

    def test_after_a_quiet_spell_the_clients_logs_are_kept_before_the_rollback(self):
        """A playtest's Skyrim Platform log is on the clone until the next run
        rolls it back. The first run after a quiet spell (or after lab-api
        starts) keeps it as <client>-before.log, before the clone stops; a run
        seconds after another fetches nothing (a sweep pays nothing)."""
        import dataclasses
        from labapi.guests import Guest

        self.services.runner.s = dataclasses.replace(self.settings, before_logs_quiet_s=600.0)
        tables = self.services.tables
        tables.guests["fake-c1"] = Guest("fake-c1", 901, "127.0.0.1", "qemu", "client", True, "clean-sp", "c1")
        pve = self.services.control._b
        pve.files[r"C:\sky-lab\c1.log"] = "platform log\n"
        pve.files[r"C:\sky-lab\c1-driver.log"] = "driver\n"
        pve.files[r"C:\sky-lab\c1-before.log"] = "the playtest's platform log\n"
        run_id, body = self._run(SOLO_WITH_LOG)
        self.assertEqual(body["verdict"], "green", body)
        self.assertIn("c1-before.log", body["artifacts"])
        self.assertEqual((self.tmp / "results" / run_id / "c1-before.log").read_text(), "the playtest's platform log\n")
        before = next(i for i, c in enumerate(pve.calls) if c[0] == "exec" and "c1-before.log" in " ".join(c[2]))
        stop = next(i for i, c in enumerate(pve.calls) if c[:2] == ("stop", 901))
        self.assertLess(before, stop, "the clone's log is copied before the clone stops")
        # the next run follows within the quiet window: nothing to keep
        pve.calls.clear()
        run_id2, body2 = self._run(SOLO_WITH_LOG)
        self.assertEqual(body2["verdict"], "green", body2)
        self.assertNotIn("c1-before.log", body2["artifacts"])
        self.assertFalse(any(c[0] == "exec" and "c1-before.log" in " ".join(c[2]) for c in pve.calls))



@needs_deps
class HangEvidence(RunTests):
    """A seat that stops answering mid-run (the load freeze of 2026-10-16: the game silent after
    PostLoadGame, the first console step timing out) is rolled back by the next run with all its
    evidence. Its run's artifacts take the seat's skse64.log and a full dump of its game, which
    the seat uploads itself to PUT /clients/<client>/hang-dump/<run>."""

    HUNG = "id: t2-hang\nclients: [c1]\nsteps:\n  - c1: dump-state\n"

    def _hung_run(self, text):
        r = self.client.post("/lab/run", files={"scenario": ("s.yaml", text.encode(), "text/yaml")})
        self.assertEqual(r.status_code, 200, r.text)
        run_id = r.json()["run"]
        deadline = time.time() + 30
        while time.time() < deadline:
            self.client.get("/lab/step", params={"client": "c1"})  # a heartbeat that never answers
            body = self.client.get(f"/lab/run/{run_id}").json()
            if body["verdict"] != "running" and body.get("finished"):
                return run_id, body
            time.sleep(0.05)
        self.fail(f"run {run_id} did not finish: {body}")

    def test_a_hung_seat_leaves_its_skse_log_and_a_dump_of_its_game(self):
        import dataclasses
        import re
        from labapi.guests import Guest
        from labapi.proxmox import ExecResult

        self.services.runner.s = dataclasses.replace(self.settings, hang_evidence=True)
        self.services.tables.guests["fake-c1"] = Guest("fake-c1", 901, "127.0.0.1", "qemu", "client", True, "clean-sp", "c1")
        pve = self.services.control._b
        pve.files[r"C:\sky-lab\c1-skse64.log"] = "SKSE64 runtime: initialize\n"
        scripts = []
        checks = []
        plain_exec = pve.exec

        def exec_(guest, command, timeout):
            if "-EncodedCommand" not in command:
                return plain_exec(guest, command, timeout)
            pve.calls.append(("exec", guest.vmid, tuple(command)))
            script = base64.b64decode(command[command.index("-EncodedCommand") + 1]).decode("utf-16-le")
            if "MiniDumpWriteDump" not in script:
                checks.append(script)  # the run's end reads the seat's game and crash dumps too
                return ExecResult(0, '{"games": [], "dumps": [], "curl": -1}\r\n', "")
            scripts.append(script)
            # the seat's own upload, as curl.exe makes it: into the run named in the URL
            run = re.search(r"/clients/c1/hang-dump/([^']+)'", script).group(1)
            (self.tmp / "results" / run / "c1-SkyrimSE.dmp").write_bytes(b"MDMP fake dump")
            return ExecResult(0, '{"dumped": true, "pid": 4242, "bytes": 14, "dump_ms": 1, "upload_ms": 1, "curl": 0}\r\n', "")

        pve.exec = exec_
        run_id, body = self._hung_run(self.HUNG)
        self.assertEqual(body["verdict"], "red", body)
        self.assertEqual(body["failures"][0]["kind"], "timeout", body["failures"])
        self.assertIn("c1-skse64.log", body["artifacts"])
        self.assertEqual((self.tmp / "results" / run_id / "c1-skse64.log").read_text(), "SKSE64 runtime: initialize\n")
        self.assertIn("c1-SkyrimSE.dmp", body["artifacts"])
        self.assertTrue(any(n.startswith('hang dump c1: {"dumped": true') for n in body["notes"]), body["notes"])
        # the seat finds its own lab-api at the clones' address, for this run
        self.assertEqual(len(scripts), 1)
        self.assertIn(f"'http://10.10.70.10/lab/clients/c1/hang-dump/{run_id}'", scripts[0])
        self.assertIn("0x21826", scripts[0])  # full memory, handles, unloaded modules, memory and thread info
        self.assertIn("C:\\sky-lab\\hang", scripts[0])
        self.assertEqual(len(checks), 1)
        # the SKSE folder's logs, the one skyrim-platform.log is in, copied before they are read
        listing = next(c for c in pve.calls if c[0] == "exec" and "-Filter '*.log'" in " ".join(c[2]))
        self.assertIn("SKSE", " ".join(listing[2]))
        self.assertIn("skyrim-platform.log", " ".join(listing[2]))

    def test_the_dump_goes_only_into_the_active_run(self):
        r = self.client.post("/lab/run", files={"scenario": ("s.yaml", self.HUNG.encode(), "text/yaml")})
        run_id = r.json()["run"]
        self.client.get("/lab/step", params={"client": "c1"})  # the step is out: the run is active
        put = self.client.put(f"/lab/clients/c1/hang-dump/{run_id}", content=b"MDMP" + b"x" * 70000)
        self.assertEqual(put.status_code, 200, put.text)
        self.assertEqual(put.json()["bytes"], 70004)
        self.assertEqual((self.tmp / "results" / run_id / "c1-SkyrimSE.dmp").read_bytes()[:4], b"MDMP")
        self.assertFalse((self.tmp / "results" / run_id / "c1-SkyrimSE.dmp.part").exists())
        self.assertEqual(self.client.put("/lab/clients/c1/hang-dump/20200101-000000-other", content=b"MDMP").status_code, 409)
        self.assertEqual(self.client.put(f"/lab/clients/c9/hang-dump/{run_id}", content=b"MDMP").status_code, 404)
        deadline = time.time() + 30
        while time.time() < deadline:
            self.client.get("/lab/step", params={"client": "c1"})
            body = self.client.get(f"/lab/run/{run_id}").json()
            if body.get("finished"):
                break
            time.sleep(0.05)
        # after the run, with nothing active, the last run takes a by-hand dump and the seat's two logs
        # (lab/tools/hang-dump.sh: a freeze outside a run's steps), and nothing else under any other name
        self.assertEqual(self.client.get("/lab/status").json()["last_run"], run_id)
        late = self.client.put(f"/lab/clients/c1/hang-dump/{run_id}", content=b"MDMP late")
        self.assertEqual(late.status_code, 200, late.text)
        self.assertEqual((self.tmp / "results" / run_id / "c1-SkyrimSE.dmp").read_bytes(), b"MDMP late")
        log = self.client.put(f"/lab/clients/c1/hang-dump/{run_id}", params={"name": "skse64.log"}, content=b"SKSE64\n")
        self.assertEqual(log.status_code, 200, log.text)
        self.assertEqual((self.tmp / "results" / run_id / "c1-skse64.log").read_bytes(), b"SKSE64\n")
        self.assertEqual(self.client.put(f"/lab/clients/c1/hang-dump/{run_id}", params={"name": "../result.json"}, content=b"x").status_code, 400)
        self.assertEqual(self.client.put("/lab/clients/c1/hang-dump/20200101-000000-older", content=b"MDMP").status_code, 409)

    def test_only_a_seat_that_never_answered_counts_as_hung(self):
        from types import SimpleNamespace

        failures = [
            {"step": 3, "kind": "timeout", "client": "c2", "error": "timeout"},
            {"step": 4, "kind": "timeout", "client": "c1", "error": "dump-state before assert timed out"},
            {"step": 5, "kind": "timeout", "client": "c1", "error": "timeout"},
            {"step": 6, "kind": "timeout", "client": "c3", "error": 'E_RUN_TELEPORT: c3 never settled at the target within 60s (4 attempts, last {"client": {"x": 1.0}, "server": {"x": 0.0}})'},
            {"step": 7, "kind": "timeout", "client": "c4", "error": "E_RUN_CONNECT: not online after 60s"},
            {"step": "", "kind": "lab", "error": "E_RUN_NO_HEARTBEAT: c2 (sky-c2) did not poll within 300s"},
            # the nightly of 2026-10-17: b-push's c2 and a-rotfern's c1, silent after their game loaded
            {"step": 12, "kind": "timeout", "client": "c5", "error": 'E_RUN_TELEPORT: c5 never settled at the target within 60s (1 attempts, last {"client": "timeout", "server": {"cell": "lab-spawn"}})'},
            {"step": 17, "kind": "lab", "client": "c6", "error": "E_RUN_RELAUNCH: c6 not in game: timeout"},
            {"step": 18, "kind": "lab", "client": "c7", "error": "E_RUN_RELAUNCH: c7 (sky-c7): the guest agent did not answer"},
        ]
        self.assertEqual(self.services.runner._hung_clients(SimpleNamespace(failures=failures)), ["c2", "c1", "c5", "c6"])


@needs_deps
class CrashEvidence(RunTests):
    """A seat's game at a run's end: a dump Windows Error Reporting wrote for SkyrimSE.exe since
    the run began (crash-dumps.ps1's LocalDumps) comes up as <client>-SkyrimSE-crash.dmp, and the
    game process is compared with the one the version check found, since launch.ps1 starts the
    game again when it dies within a minute and a run then goes on against the new one. Either
    fault turns a would-be green into error, which its run set reruns; a red stays red."""

    WAS = "4242@2026-10-17T22:00:00.0000000Z"
    RUN = "id: t2-crash\nclients: [c1]\nserver: {snapshot: clean}\ntimeout_s: 30\nsteps:\n  - c1: connect\n  - c1: dump-state\n"

    def _seat(self, answer, upload=False):
        import re
        from labapi.guests import Guest
        from labapi.proxmox import ExecResult

        self.services.tables.guests["fake-c1"] = Guest("fake-c1", 901, "127.0.0.1", "qemu", "client", True, "clean-sp", "c1")
        pve = self.services.control._b
        pve.game = ExecResult(0, f"{self.WAS}\r\nC:\\Games\\Skyrim Special Edition 1.6.1170\\SkyrimSE.exe\r\n1.6.1170.0\r\n", "")
        pve.files[r"C:\sky-lab\c1-launch.log"] = "12:00:00.000 running pid 4242\n"
        pve.files[r"C:\sky-lab\c1-skse64.log"] = "imagebase = 00007FF7AB420000\n"
        scripts = []
        plain_exec = pve.exec

        def exec_(guest, command, timeout):
            if "-EncodedCommand" not in command:
                return plain_exec(guest, command, timeout)
            pve.calls.append(("exec", guest.vmid, tuple(command)))
            script = base64.b64decode(command[command.index("-EncodedCommand") + 1]).decode("utf-16-le")
            scripts.append(script)
            if upload:  # the seat's own upload into the run named in the URL, as curl.exe makes it
                run = re.search(r"/clients/c1/hang-dump/([^?']+)\?name=SkyrimSE-crash\.dmp'", script).group(1)
                (self.tmp / "results" / run / "c1-SkyrimSE-crash.dmp").write_bytes(b"MDMP crash")
            return ExecResult(0, json.dumps(answer) + "\r\n", "")

        pve.exec = exec_
        return scripts

    def test_a_crash_since_the_run_began_is_kept_and_a_green_run_is_error(self):
        dump = {"name": "SkyrimSE.exe.4242.dmp", "bytes": 80537918, "utc": "2026-10-17T22:01:00.0000000Z"}
        scripts = self._seat({"games": [], "dumps": [dump], "curl": 0}, upload=True)
        run_id, body = self._run(self.RUN)
        self.assertEqual(body["verdict"], "error", body)
        errors = [f["error"] for f in body["failures"]]
        self.assertTrue(errors[0].startswith("E_RUN_CRASH: c1's game crashed"), errors)
        self.assertIn("SkyrimSE.exe.4242.dmp (80537918 bytes", errors[0])
        self.assertIn("kept as c1-SkyrimSE-crash.dmp", errors[0])
        self.assertEqual(errors[1], f"E_RUN_GAME_LOST: c1's game ({self.WAS}) was not running at the run's end")
        self.assertTrue(all(f["kind"] == "lab" and f["client"] == "c1" for f in body["failures"]), body["failures"])
        for name in ("c1-SkyrimSE-crash.dmp", "c1-launch.log", "c1-skse64.log"):
            self.assertIn(name, body["artifacts"])
        self.assertEqual(body["games"], {"c1": self.WAS})
        # the seat reads LocalDumps' folder for dumps written since a few minutes before the run began
        self.assertEqual(len(scripts), 1)
        self.assertIn("-LiteralPath 'C:\\sky-lab\\dumps' -Filter 'SkyrimSE.exe.*.dmp'", scripts[0])
        self.assertIn(f"'http://10.10.70.10/lab/clients/c1/hang-dump/{run_id}?name=SkyrimSE-crash.dmp'", scripts[0])
        since = int(re.search(r"FromUnixTimeSeconds\((\d+)\)", scripts[0]).group(1))
        started = calendar.timegm(time.strptime(body["started"], "%Y-%m-%dT%H:%M:%SZ"))
        self.assertEqual(since, started - 300)

    def test_a_game_replaced_mid_run_is_a_lab_fault(self):
        now = "5151@2026-10-17T22:00:40.0000000Z"
        self._seat({"games": [now], "dumps": [], "curl": -1})
        run_id, body = self._run(self.RUN)
        self.assertEqual(body["verdict"], "error", body)
        self.assertEqual([f["error"] for f in body["failures"]],
                         [f"E_RUN_GAME_REPLACED: c1's game was {self.WAS} at the version check and {now} at the run's end"])
        self.assertIn("c1-launch.log", body["artifacts"])

    def test_the_same_game_and_no_dump_leave_the_run_green(self):
        self._seat({"games": [self.WAS], "dumps": [], "curl": -1})
        run_id, body = self._run(self.RUN)
        self.assertEqual(body["verdict"], "green", body)
        self.assertEqual(body["failures"], [])
        self.assertNotIn("c1-launch.log", body["artifacts"])

    def test_a_red_run_stays_red_and_gains_the_crash(self):
        dump = {"name": "SkyrimSE.exe.4242.dmp", "bytes": 10, "utc": "2026-10-17T22:01:00.0000000Z"}
        self._seat({"games": [self.WAS], "dumps": [dump], "curl": 7})
        run_id, body = self._run(RED.replace("id: t2-red", "id: t2-red-crash"))
        self.assertEqual(body["verdict"], "red", body)
        kinds = [f["kind"] for f in body["failures"]]
        self.assertEqual(kinds, ["assertion", "lab"], body["failures"])
        self.assertIn("not kept (curl 7)", body["failures"][1]["error"])


@needs_deps
class PausedGames(RunTests):
    """A seat whose game sits under a message box (MessageBoxMenu) is paused: an assert about it
    can hold while measuring nothing (r-melee-power-a went green twice under Survival Mode's first
    load prompt, 2026-10-14). The HUD's own menus are no pause."""

    TWO = "id: t2-paused\nclients: [c1, c2]\nserver: {snapshot: clean}\ntimeout_s: 30\nsteps:\n  - c1: connect\n  - c2: connect\n"

    def test_an_assert_over_a_paused_seat_fails(self):
        self.doubles.menus["c1"] = ["Cursor Menu", "HUD Menu", "MessageBoxMenu"]
        run_id, body = self._run(self.TWO + "  - assert:\n      - c1.sees(c2) == true\n")
        self.assertEqual(body["verdict"], "red", body)
        self.assertEqual(len(body["failures"]), 1, body["failures"])
        f = body["failures"][0]
        self.assertEqual((f["kind"], f["client"], f["step"]), ("paused", "c1", 2))
        self.assertEqual(f["error"], "E_RUN_PAUSED: c1's game is paused under a message box (menus: Cursor Menu, HUD Menu, MessageBoxMenu), so it measured nothing")
        self.assertEqual(body["steps"][2]["note"], f["error"])

    def test_an_until_over_a_paused_seat_fails_at_its_first_poll(self):
        self.doubles.menus["c2"] = ["HUD Menu", "MessageBoxMenu"]
        run_id, body = self._run(self.TWO + "  - until: {within: 30, every: 0.1, expect: [\"c2.sees(c1) == false\"]}\n")
        self.assertEqual(body["verdict"], "red", body)
        self.assertEqual([(f["kind"], f["client"]) for f in body["failures"]], [("paused", "c2")])
        self.assertLess(body["steps"][2]["seconds"], 10)

    def test_a_dump_state_that_ends_paused_turns_a_green_run_red(self):
        self.doubles.menus["c1"] = ["HUD Menu", "MessageBoxMenu"]
        run_id, body = self._run(self.TWO + "  - c1: dump-state\n  - assert:\n      - server.actor(c1).x == 0\n")
        self.assertEqual(body["verdict"], "red", body)
        self.assertEqual([(f["kind"], f["client"], f["step"]) for f in body["failures"]], [("paused", "c1", "end")])

    def test_the_hud_and_a_fade_are_no_pause(self):
        self.doubles.menus["c1"] = ["Fader Menu", "HUD Menu"]
        run_id, body = self._run(self.TWO + "  - c1: dump-state\n  - assert:\n      - c1.sees(c2) == true\n")
        self.assertEqual(body["verdict"], "green", body)


@needs_deps
class FridaTraces(RunTests):
    def test_a_trace_started_before_a_run_is_fetched_before_the_rollback(self):
        """POST /lab/frida outside a run leaves frida-inject writing on the
        clone; the next run's rollback erases that file, so the run fetches it
        first (2026-10-05: the traces of the idle-client leak were lost that
        way, five E_PVE_FILE notes)."""
        from labapi.guests import Guest

        tables = self.services.tables
        tables.guests["fake-c1"] = Guest("fake-c1", 901, "127.0.0.1", "qemu", "client", True, "clean-sp", "c1")
        pve = self.services.control._b
        out = r"C:\sky-lab\frida\handle-trace.js.out"
        pve.files[out] = '{"attached":1}\n'
        runner = self.services.runner
        runner.frida_started += [("c1", "handle-trace.js"), ("c1", "handle-trace.js")]
        run_id, body = self._run(SOLO_WITH_LOG)
        self.assertEqual(body["verdict"], "green", body)
        self.assertIn("frida/c1-handle-trace.js.before-run.jsonl", body["artifacts"])
        run_dir = self.tmp / "results" / run_id
        self.assertEqual((run_dir / "frida" / "c1-handle-trace.js.before-run.jsonl").read_text(), '{"attached":1}\n')
        # read through a shared-read copy: frida-inject still writes the file
        # while the game runs (run 20261006-183431)
        copies = [i for i, c in enumerate(pve.calls) if c[:2] == ("exec", 901) and any(out in a and "ReadWrite" in a for a in c[2])]
        reads = [i for i, c in enumerate(pve.calls) if c[:3] == ("file_read", 901, out + ".copy")]
        rollback = next(i for i, c in enumerate(pve.calls) if c[:2] == ("rollback", 901))
        self.assertEqual(len(copies), 1, pve.calls)
        self.assertEqual(len(reads), 1, pve.calls)  # once, though started twice
        self.assertLess(copies[0], reads[0])
        self.assertLess(reads[0], rollback)
        self.assertEqual(runner.frida_started, [])
        self.assertFalse([n for n in body.get("notes", []) if "frida" in n], body.get("notes"))

MOUSE = """
id: mouse
clients: [c1]
server: {snapshot: clean}
timeout_s: 30
steps:
  - c1: connect
  - c1: mouse {dy: 300, wake: 400}
"""


@needs_deps
class MouseSteps(RunTests):
    def _managed_c1(self, answer):
        """c1 managed; the mouse command's exec answers `answer` (an ExecResult); the others pass through."""
        from labapi import mouse
        from labapi.guests import Guest

        self.services.tables.guests["fake-c1"] = Guest("fake-c1", 901, "127.0.0.1", "qemu", "client", True, "clean-sp", "c1")
        pve = self.services.control._b
        real = pve.exec
        self.scripts = []

        def exec_(guest, command, timeout):
            if "-EncodedCommand" in command and mouse.TASK in mouse.decode(command):
                self.scripts.append(mouse.decode(command))
                return answer
            return real(guest, command, timeout)

        pve.exec = exec_

    def test_a_move_runs_in_the_seat_s_session_and_its_answer_is_the_note(self):
        from labapi.proxmox import ExecResult

        self._managed_c1(ExecResult(0, '{"sent":24,"dx":0,"dy":300,"steps":8,"wake":400,"at":"2026-10-19T05:30:00Z"}', ""))
        run_id, body = self._run(MOUSE)
        self.assertEqual(body["verdict"], "green", body)
        step = next(s for s in body["steps"] if s["action"] == "mouse")
        self.assertIn('"sent": 24', step["note"], step)
        script = self.scripts[0]
        # the task is the lab user's, headless, registered with -Force at this use; the request carries the args
        self.assertIn("Register-ScheduledTask -TaskName 'sky-lab-input'", script)
        self.assertIn("-Force", script)
        self.assertIn("conhost.exe", script)
        self.assertIn("-UserId 'lab' -LogonType Interactive", script)
        self.assertIn('{"dx": 0, "dy": 300, "steps": 8, "ms": 16, "wake": 400}', script)

    def test_a_move_sendinput_did_not_take_is_a_lab_error(self):
        from labapi.proxmox import ExecResult

        self._managed_c1(ExecResult(0, '{"sent":0,"dx":0,"dy":300,"steps":8,"wake":400,"at":"x"}', ""))
        run_id, body = self._run(MOUSE)
        self.assertEqual(body["verdict"], "error", body)
        self.assertIn("SendInput took 0 of 24 events", str(body["failures"]))

    def test_a_move_whose_task_never_answered_is_a_lab_error(self):
        from labapi.proxmox import ExecResult

        self._managed_c1(ExecResult(3, "", "no done.json in 30 s; the task's last result 267011"))
        run_id, body = self._run(MOUSE)
        self.assertEqual(body["verdict"], "error", body)
        self.assertIn("E_RUN_MOUSE", str(body["failures"]))
        self.assertIn("no done.json", str(body["failures"]))

    def test_an_unmanaged_seat_has_no_mouse_step(self):
        run_id, body = self._run(MOUSE)
        self.assertEqual(body["verdict"], "error", body)
        self.assertIn("E_RUN_MOUSE: c1 is unmanaged", str(body["failures"]))


SHOT = """
id: shot
clients: [c1]
server: {snapshot: clean}
timeout_s: 30
steps:
  - c1: connect
  - c1: screenshot
"""


@needs_deps
class ScreenshotSteps(RunTests):
    def _managed_c1(self, raise_with):
        """c1 managed; its screenshot helper writes the shot's .b64, then the exec raises `raise_with`."""
        from labapi.guests import Guest

        self.services.tables.guests["fake-c1"] = Guest("fake-c1", 901, "127.0.0.1", "qemu", "client", True, "clean-sp", "c1")
        pve = self.services.control._b
        real = pve.exec

        def exec_(guest, command, timeout):
            m = re.search(r"'([^']+\.png)\.b64'", " ".join(command))
            if not m:
                return real(guest, command, timeout)
            pve.files[m.group(1) + ".b64"] = base64.b64encode(b"\x89PNG shot").decode()
            raise raise_with

        pve.exec = exec_

    def _shot(self, run_id, body):
        shot = next(s for s in body["steps"] if s["action"] == "screenshot")
        pngs = sorted((self.tmp / "results" / run_id / "screenshots").glob("*.png"))
        return shot, pngs

    def test_a_helper_whose_exec_answer_was_lost_is_read_from_its_file(self):
        """The agent reaps a pid once exec-status reports its exit, so an answer lost on the way back reads
        "PID ... does not exist" (sky-c2, run 20261018-204244): the helper has ended and its file holds the shot."""
        from labapi.proxmox import ProxmoxError

        self._managed_c1(ProxmoxError("E_PVE_EXEC_LOST: pid 7 on fake-c1: the guest agent no longer knows it"))
        run_id, body = self._run(SHOT)
        self.assertEqual(body["verdict"], "green", body)
        shot, pngs = self._shot(run_id, body)
        self.assertIn("read from its file", shot["note"], shot)
        self.assertEqual([p.read_bytes() for p in pngs], [b"\x89PNG shot"])

    def test_any_other_exec_failure_still_skips_the_shot(self):
        from labapi.proxmox import ProxmoxError

        self._managed_c1(ProxmoxError("E_PVE_EXEC: pid 7 on fake-c1 did not exit in 120s"))
        run_id, body = self._run(SHOT)
        self.assertEqual(body["verdict"], "green", body)
        shot, pngs = self._shot(run_id, body)
        self.assertIn("screenshot skipped: E_PVE_EXEC", shot["note"], shot)
        self.assertEqual(pngs, [])


RELAUNCH = """
id: relaunch
clients: [c1]
server: {snapshot: clean}
timeout_s: 30
steps:
  - c1: connect
  - c1: relaunch
  - c1: dump-state
"""


@needs_deps
class RelaunchSteps(RunTests):
    def test_relaunch_restarts_the_game_and_holds_until_it_is_back_in_game(self):
        """docs/verbs/map-markers.md: a player quitting and coming back loads
        a fresh save, which a reconnect never does. The guest agent stops the
        game and starts the launch task; the step then holds for the new
        process's poll, an in-game dump-state and the online list."""
        from labapi.guests import Guest

        tables = self.services.tables
        tables.guests["fake-c1"] = Guest("fake-c1", 901, "127.0.0.1", "qemu", "client", True, "clean-sp", "c1")
        pve = self.services.control._b
        run_id, body = self._run(RELAUNCH)
        self.assertEqual(body["verdict"], "green", body)
        execs = [" ".join(c[2]) for c in pve.calls if c[0] == "exec" and c[1] == 901]
        relaunches = [e for e in execs if "sky-lab-launch" in e]
        self.assertEqual(len(relaunches), 1, execs)
        self.assertIn("Stop-Process", relaunches[0])
        self.assertTrue([n for n in body.get("notes", []) if "relaunched" in n], body.get("notes"))

    def test_a_relaunch_changes_its_files_in_the_stopped_game_first(self):
        """The essentials layer's FSMP off and vsync off readings: a DLL renamed and an ini key set in the run's
        game folder while the game is stopped, then the relaunch as always."""
        import base64

        from labapi.guests import Guest

        tables = self.services.tables
        tables.guests["fake-c1"] = Guest("fake-c1", 901, "127.0.0.1", "qemu", "client", True, "clean-sp", "c1")
        pve = self.services.control._b
        files = RELAUNCH.replace("  - c1: relaunch\n", "  - c1: relaunch {files: [{rename: Data/SKSE/Plugins/hdtsmp64.dll, to: hdtsmp64.dll.off}, "
                                 "{ini: Data/SKSE/Plugins/SSEDisplayTweaks.ini, section: Render, key: EnableVSync, value: false}]}\n")
        run_id, body = self._run(files)
        self.assertEqual(body["verdict"], "green", body)
        execs = [c[2] for c in pve.calls if c[0] == "exec" and c[1] == 901]
        at = next(i for i, c in enumerate(execs) if "-EncodedCommand" in c and "Rename-Item" in base64.b64decode(c[-1]).decode("utf-16-le"))
        script = base64.b64decode(execs[at][-1]).decode("utf-16-le")
        self.assertIn("Stop-Process", script)
        self.assertIn("1.6.1170.txt", script)
        self.assertIn("Data\\SKSE\\Plugins\\hdtsmp64.dll", script)
        self.assertIn("'EnableVSync=false'", script)
        relaunch = next(i for i, c in enumerate(execs) if "sky-lab-launch" in " ".join(c))
        self.assertLess(at, relaunch, "the files change before the game starts again")
        self.assertTrue([n for n in body.get("notes", []) if "files before the relaunch" in n], body.get("notes"))

    def test_relaunch_needs_a_managed_client(self):
        run_id, body = self._run(RELAUNCH)
        self.assertEqual(body["verdict"], "red", body)
        self.assertIn("E_RUN_RELAUNCH", str(body.get("failures")))

FRIDA = """
id: frida
clients: [c1]
server: {snapshot: clean}
timeout_s: 30
steps:
  - c1: connect
  - c1: frida {script: x-trace.js, params: {ANSWER_YES: true}}
  - c1: frida {script: x-trace.js}
  - c1: dump-state
"""

FRIDA_MISSING = """
id: frida-missing
clients: [c1]
server: {snapshot: clean}
timeout_s: 30
steps:
  - c1: connect
  - c1: frida {script: missing.js}
"""


@needs_deps
class FridaSteps(RunTests):
    """A scenario's frida step starts a lab/frida script on the client's game
    at that point, as POST /lab/frida does beside a run; params are prepended
    as globalThis.LAB_PARAMS (thuum docs/verbs/poison.md: poison-trace.js's
    ANSWER_YES answers the game's poison box)."""

    def setUp(self):
        super().setUp()
        import dataclasses

        from fastapi.testclient import TestClient
        from labapi.app import build_fake, create_app

        self.client.__exit__(None, None, None)
        scripts = self.tmp / "frida"
        scripts.mkdir()
        (scripts / "x-trace.js").write_text("send({ ready: true });\n")
        self.settings = dataclasses.replace(self.settings, frida_scripts_dir=str(scripts))
        self.services = build_fake(self.settings, fake_state=self.state)
        self.app = create_app(self.services)
        self.client = TestClient(self.app).__enter__()
        self.doubles = Doubles(self.client, self.state, ["c1", "c2"])

    def test_a_frida_step_starts_its_script_with_its_params(self):
        from labapi.guests import Guest

        self.services.tables.guests["fake-c1"] = Guest("fake-c1", 901, "127.0.0.1", "qemu", "client", True, "clean-sp", "c1")
        pve = self.services.control._b
        run_id, body = self._run(FRIDA)
        self.assertEqual(body["verdict"], "green", body)
        execs = [" ".join(c[2]) for c in pve.calls if c[0] == "exec" and c[1] == 901]
        started = [e for e in execs if "/frida/scripts/" in e]
        self.assertEqual(len(started), 2, execs)
        variants = list((self.tmp / "frida" / "uploads").glob("x-trace-*.js"))
        self.assertEqual(len(variants), 1, variants)
        self.assertTrue(variants[0].read_text().startswith('globalThis.LAB_PARAMS = {"ANSWER_YES": true};'))
        self.assertIn(f"/frida/scripts/{variants[0].name}", started[0])
        self.assertIn("/frida/scripts/x-trace.js", started[1])

    def test_a_frida_step_needs_its_script(self):
        run_id, body = self._run(FRIDA_MISSING)
        self.assertEqual(body["verdict"], "error", body)
        self.assertIn("E_RUN_FRIDA", str(body.get("failures")))


OFFLINE = """
id: offline
clients: [c1]
steps:
  - c1: connect
  - c1: dump-state
"""


@needs_deps
class ConnectSteps(RunTests):
    def test_connect_is_judged_by_the_server_online_list(self):
        """connect holds until labState lists the profile; the double's queue
        never sees it (the driver has no such action)."""
        run_id, body = self._run(RED)  # starts with c1: connect, then a failing assert
        self.assertEqual(body["verdict"], "red", body)
        self.assertTrue(any("c1 online after" in n for n in body["notes"]), body["notes"])
        self.assertNotIn("connect", [a for _, a, _ in self.doubles.seen])
        self.assertTrue(any(name == "labState" and p.get("kind") == "online" for name, p in self.state.rpc_log))

    def test_connect_times_out_red_when_the_server_never_lists_the_client(self):
        self.state.actors[1].online = False
        run_id, body = self._run(OFFLINE)
        self.assertEqual(body["verdict"], "red", body)
        self.assertTrue(any(f["kind"] == "timeout" and "E_RUN_CONNECT" in f["error"] for f in body["failures"]), body["failures"])
        self.assertNotIn("dump-state", [a for _, a, _ in self.doubles.seen])


TELEPORT = """
id: teleport
clients: [c1]
steps:
  - c1: connect
  - c1: teleport {cell: lab-spawn, x: 300, y: -200, z: 0}
  - assert:
      - abs(server.actor(c1).x - 300) < 1
"""


@needs_deps
class TeleportSteps(RunTests):
    def test_teleport_is_resent_until_the_server_record_sits_at_the_target(self):
        """The client drops the first two (the post-login block): the record
        stays put each time, lab-api reads that back and sends again."""
        self.state.actors[1].drops_teleports = 2
        run_id, body = self._run(TELEPORT)
        self.assertEqual(body["verdict"], "green", body)
        sent = [p for n, p in self.state.rpc_log if n == "labCommand" and p["kind"] == "teleport"]
        self.assertEqual(len(sent), 3, sent)
        reads = [p for n, p in self.state.rpc_log if n == "labState" and p["kind"] == "actor"]
        self.assertGreaterEqual(len(reads), 3, "each attempt reads the record back")
        step = next(s for s in body["steps"] if s["action"] == "teleport")
        self.assertIn("landed after 3 attempt", step["note"], step)
        self.assertTrue(any("c1 teleport landed after 3 attempt" in n for n in body["notes"]), body["notes"])

    def test_teleport_is_judged_by_the_client_before_the_record(self):
        """The written record alone proves nothing: the first dump-state puts
        the client elsewhere, so the teleport goes again although the server's
        record already read at the target."""
        self.doubles.stale_dumps = 1
        run_id, body = self._run(TELEPORT)
        self.assertEqual(body["verdict"], "green", body)
        sent = [p for n, p in self.state.rpc_log if n == "labCommand" and p["kind"] == "teleport"]
        self.assertEqual(len(sent), 2, sent)
        dumps = [a for _, a, _ in self.doubles.seen if a == "dump-state"]
        self.assertGreaterEqual(len(dumps), 2, self.doubles.seen)
        step = next(s for s in body["steps"] if s["action"] == "teleport")
        self.assertIn("landed after 2 attempt", step["note"], step)

    def test_a_step_tolerance_lets_a_sliding_landing_count(self):
        """A teleport may name its own x-y tolerance (a drop onto a slope
        slides); it is lab-api's bound and never reaches the gamemode."""
        import dataclasses

        slide = "id: slide\nclients: [c1]\nsteps:\n  - c1: connect\n  - c1: teleport {cell: lab-spawn, x: 300, y: -200, z: 0%s}\n"
        self.state.actors[1].slides = 100.0
        self.services.runner.s = dataclasses.replace(self.services.runner.s, teleport_timeout_s=0.0)
        run_id, body = self._run(slide % "")
        self.assertEqual(body["verdict"], "red", body)  # 100 off, past the default 64
        run_id, body = self._run(slide % ", tolerance: 150")
        self.assertEqual(body["verdict"], "green", body)
        sent = [p for n, p in self.state.rpc_log if n == "labCommand" and p["kind"] == "teleport"]
        self.assertTrue(sent and all("tolerance" not in p for p in sent), sent)

    def test_teleport_the_client_never_takes_is_red(self):
        import dataclasses

        self.state.actors[1].drops_teleports = 10 ** 6
        self.services.runner.s = dataclasses.replace(self.services.runner.s, teleport_timeout_s=0.0)
        run_id, body = self._run(TELEPORT)
        self.assertEqual(body["verdict"], "red", body)
        fail = body["failures"][0]
        self.assertEqual(fail["kind"], "timeout", fail)
        self.assertIn("E_RUN_TELEPORT", fail["error"])
        self.assertIn("1 attempts", fail["error"])
        self.assertIn('"server": {', fail["error"], "the last record read is named")
        self.assertIn('"client": [', fail["error"], "the client's own report is named")
        # the run stopped at the teleport: no assertion was evaluated
        self.assertEqual([s["action"] for s in body["steps"]][-1], "teleport", body["steps"])

    def test_teleport_target_is_compared_in_the_scenario_frame(self):
        """A record in another cell is never 'at the target' whatever its numbers."""
        from labapi.runner import Runner

        runner = self.services.runner
        self.assertTrue(runner._at_target({"cell": "lab-spawn", "x": 40.0, "y": -20.0, "z": 500.0}, {"cell": "lab-spawn", "x": 0, "y": 0, "z": 0}))
        self.assertFalse(runner._at_target({"cell": "lab-spawn", "x": 65.0, "y": 0.0, "z": 0.0}, {"cell": "lab-spawn", "x": 0, "y": 0, "z": 0}))
        self.assertFalse(runner._at_target({"cell": "3c:Skyrim.esm", "x": 0.0, "y": 0.0, "z": 0.0}, {"cell": "lab-spawn", "x": 0, "y": 0, "z": 0}))
        self.assertFalse(runner._at_target({"cell": "lab-spawn"}, {"cell": "lab-spawn", "x": 0, "y": 0}))
        # a target in the server's own descriptor and units matches the absolute record that rides along
        normalized = {"cell": "lab-spawn", "x": 0.0, "y": 0.0, "z": 0.0, "absolute": {"cell": "3c:Skyrim.esm", "x": 133857.0, "y": -61130.0, "z": 14662.0}}
        self.assertTrue(runner._at_target(normalized, {"cell": "3c:Skyrim.esm", "x": 133860, "y": -61100, "z": 14662}))
        self.assertFalse(runner._at_target(normalized, {"cell": "3c:Skyrim.esm", "x": 0, "y": 0, "z": 0}))
        self.assertIsInstance(runner, Runner)


MOVE = """
id: move
clients: [c1]
steps:
  - c1: connect
  - c1: teleport {cell: lab-spawn, x: 10, y: 20, z: 0}
  - c1: move {dx: 300, dy: -5, duration_s: 3}
  - assert:
      - abs(server.actor(c1).x - 310) < 1
      - abs(server.actor(c1).y - 15) < 1
"""


@needs_deps
class MoveSteps(RunTests):
    def test_move_offsets_become_an_absolute_target_for_the_driver(self):
        run_id, body = self._run(MOVE)
        self.assertEqual(body["verdict"], "green", body)
        moves = [a for _, action, a in self.doubles.seen if action == "move"]
        self.assertEqual(len(moves), 1, self.doubles.seen)
        cell = self.services.tables.cell("lab-spawn")  # the test tables carry no cells: origin 0
        ox, oy = (cell.origin[0], cell.origin[1]) if cell else (0.0, 0.0)
        self.assertAlmostEqual(moves[0]["x"], ox + 310)
        self.assertAlmostEqual(moves[0]["y"], oy + 15)
        self.assertAlmostEqual(moves[0]["speed"], 300.0 / 2.25, delta=0.1)  # 300 units inside three quarters of 3 s
        self.assertEqual(moves[0]["duration_s"], 3)


T2_ONLY = """
id: t2-fakeclient
clients: []
server: {snapshot: clean}
timeout_s: 30
steps:
  - server: fakeclient {as: c1, moves: 5, item: "Skyrim.esm:IronSword", count: 1}
  - assert:
      - server.inventory(c1).count("Skyrim.esm:IronSword") >= 0
  - server: restart
  - server: fakeclient {as: c2}
artifacts: [server.log]
"""


@needs_deps
class FakeclientSteps(RunTests):
    def test_t2_only_scenario_runs_the_fakeclient_inside_the_server_image(self):
        run_id, body = self._run(T2_ONLY)
        self.assertEqual(body["verdict"], "green", body)
        runs = [c for c in self.services.system.commands if "run" in c and any(x.endswith("fakeclient") for x in c)]
        self.assertEqual(len(runs), 2)
        first = runs[0]
        self.assertEqual(first[:4], ["docker", "compose", "-f", self.settings.compose_file])
        self.assertEqual(first[4:9], ["run", "--rm", "--no-deps", "-T", "skymp-server"])
        self.assertIn("--profile-id", first)
        self.assertEqual(first[first.index("--profile-id") + 1], "1")
        self.assertEqual(first[first.index("--moves") + 1], "5")
        self.assertEqual(first[first.index("--add-item") + 1], str(0x12EB7))
        self.assertEqual(first[first.index("--add-item-count") + 1], "1")
        second = runs[1]
        self.assertEqual(second[second.index("--profile-id") + 1], "2")
        self.assertEqual(second[second.index("--add-item-count") + 1], "0")
        self.assertIn("fakeclient-c1-0.jsonl", body["artifacts"])
        self.assertIn("fakeclient-c2-3.jsonl", body["artifacts"])
        self.assertTrue(any(c[-2:] == ["restart", "skymp-server"] for c in self.services.system.commands))
        self.assertEqual(self.services.system.chowned, [(str(self.tmp / "world"), 1001, 1001)])

    def test_fakeclient_failure_is_a_red_step(self):
        self.services.system.fakeclient_rc = 1
        run_id, body = self._run(T2_ONLY)
        self.assertEqual(body["verdict"], "red")
        self.assertEqual(body["failures"][0]["kind"], "lab")
        self.assertIn("connect timed out", body["failures"][0]["error"])
        self.assertEqual(len(body["steps"]), 1, "the run stops at the failed step")

    def test_fakeclient_step_needs_a_known_client(self):
        text = "id: t2-bad\nclients: []\nsteps:\n  - server: fakeclient {as: c9}\n"
        run_id, body = self._run(text)
        self.assertEqual(body["verdict"], "red")
        self.assertIn("c9", body["failures"][0]["error"])


NAMED_ARGS = """
id: t3-names
clients: [c1]
steps:
  - c1: connect
  - c1: equip {item: "Skyrim.esm:IronSword"}
  - c1: craft {station: 0x1234, recipe: "Skyrim.esm:RecipeWeaponIronDagger"}
  - c1: race-pick {race: "rotfern.esp:rotfern", max: 12}
"""


@needs_deps
class ClientStepNames(RunTests):
    def test_item_and_recipe_names_reach_the_driver_as_form_ids(self):
        run_id, body = self._run(NAMED_ARGS)
        self.assertEqual(body["verdict"], "green", body)
        seen = {a: args for _, a, args in self.doubles.seen if a in ("equip", "craft", "race-pick")}
        self.assertEqual(seen["equip"], {"formId": 0x12EB7})
        self.assertEqual(seen["craft"], {"station": 0x1234, "recipe": 0xDA76A})
        self.assertEqual(seen["race-pick"], {"race": 0x0800AA00, "max": 12})

    def test_unknown_item_name_is_a_red_step(self):
        text = "id: t3-bad\nclients: [c1]\nsteps:\n  - c1: connect\n  - c1: equip {item: \"Skyrim.esm:Nope\"}\n"
        run_id, body = self._run(text)
        self.assertEqual(body["verdict"], "red")
        self.assertIn("Nope", body["failures"][0]["error"])

    def test_close_menu_reaches_the_driver_with_the_menu_name(self):
        text = "id: t3-close\nclients: [c1]\nsteps:\n  - c1: connect\n  - c1: close-menu {name: \"RaceSex Menu\"}\n"
        run_id, body = self._run(text)
        self.assertEqual(body["verdict"], "green", body)
        self.assertIn(("c1", "close-menu", {"name": "RaceSex Menu"}), self.doubles.seen)

    def test_open_race_menu_is_a_server_verb_and_attempts_read_back(self):
        text = ("id: t3-race\nclients: [c1]\nsteps:\n  - c1: connect\n  - c1: open-race-menu\n"
                "  - assert:\n      - server.actor(c1).appearanceAttempts == 0\n")
        run_id, body = self._run(text)
        self.assertEqual(body["verdict"], "green", body)
        sent = [p for n, p in self.state.rpc_log if n == "labCommand" and p["kind"] == "open-race-menu"]
        self.assertEqual(sent, [{"kind": "open-race-menu", "profileId": 1}])
        self.assertTrue(self.state.actors[1].race_menu_open)
        self.assertNotIn("open-race-menu", [a for _, a, _ in self.doubles.seen])


GAME_ONE = """
id: t-game
clients: [c1]
steps:
  - c1: connect
"""


@needs_deps
class GameVersions(RunTests):
    """ADR-022: a run plays one game version, the request's, else the
    scenario's, else the default; the server mounts that build's master files
    and the clients' launcher asks which folder to start."""

    def _post(self, text, game=None):
        data = {"game": game} if game else None
        return self.client.post("/lab/run", files={"scenario": ("s.yaml", text.encode(), "text/yaml")}, data=data)

    def _finish(self, run_id, timeout=20.0):
        deadline = time.time() + timeout
        while time.time() < deadline:
            self.doubles.turn()
            body = self.client.get(f"/lab/run/{run_id}").json()
            if body["verdict"] != "running" and body.get("finished"):
                return body
            time.sleep(0.02)
        self.fail(f"run {run_id} did not finish")

    def _up_env(self):
        system = self.services.system
        ups = [env for cmd, env in zip(system.commands, system.envs) if cmd[:2] == ["docker", "compose"] and "up" in cmd]
        self.assertTrue(ups, system.commands)
        return ups[-1]

    def test_default_run_plays_the_players_version_on_its_masters(self):
        # ADR-025: players run 1.6.1170, so a run that names no version does
        r = self._post(GAME_ONE)
        self.assertEqual(r.status_code, 200, r.text)
        body = self._finish(r.json()["run"])
        self.assertEqual(body["game"], "1.6.1170")
        self.assertEqual(self._up_env(), {"ESM_DIR": "/srv/persist/esm/1.6.1170",
                                          "SERVER_SETTINGS": "/srv/lab/server/server-settings.json"})
        self.assertIn("game 1.6.1170", body["phases"][0]["note"])

    def test_request_version_wins_over_the_scenario_and_reaches_the_server_mount(self):
        r = self._post(GAME_ONE + "game: 1.6.1170\n", game="1.7.104")
        self.assertEqual(r.status_code, 200, r.text)
        body = self._finish(r.json()["run"])
        self.assertEqual(body["game"], "1.7.104")
        # its own load order: RaceMenu's plugins load on 1.6.1170 only (ADR-025)
        self.assertEqual(self._up_env(), {"ESM_DIR": "/srv/persist/esm",
                                          "SERVER_SETTINGS": "/srv/lab/server/server-settings-1.7.104.json"})

    def test_scenario_version_is_used_without_a_request_version(self):
        r = self._post(GAME_ONE + "game: 1.7.104\n")
        self.assertEqual(r.status_code, 200, r.text)
        self.assertEqual(self._finish(r.json()["run"])["game"], "1.7.104")

    def test_unknown_version_is_400_and_starts_nothing(self):
        r = self._post(GAME_ONE, game="1.5.97")
        self.assertEqual(r.status_code, 400)
        self.assertIn("E_GAME", r.text)
        r = self._post(GAME_ONE + "game: 1.5.97\n")
        self.assertEqual(r.status_code, 400)
        self.assertEqual(self.services.system.commands, [])

    def test_launcher_endpoint_answers_the_active_runs_version(self):
        self.assertEqual(self.client.get("/lab/game", params={"client": "c1"}).json()["version"], "1.6.1170")
        r = self._post(GAME_ONE, game="1.7.104")
        self.assertEqual(r.status_code, 200, r.text)
        # the run waits in rollback-clients for c1's first poll, which is when
        # a booting clone's launcher asks
        self.assertEqual(self.client.get("/lab/game", params={"client": "c1"}).json()["version"], "1.7.104")
        self._finish(r.json()["run"])
        self.assertEqual(self.client.get("/lab/game", params={"client": "c1"}).json()["version"], "1.6.1170")

    def _check(self, game, out, exitcode=0):
        import asyncio

        from labapi.guests import Guest
        from labapi.proxmox import ExecResult
        from labapi.runner import RunRecord
        from labapi.scenario import Scenario

        tables = self.services.tables
        tables.guests["sky-c1"] = Guest("sky-c1", 711, "10.10.70.21", "qemu", "client", True, "clean-m1", "c1")
        tables.guests.pop("fake-c1", None)
        pve = self.services.control._b
        pve.calls.clear()
        pve.game = ExecResult(exitcode, out, "" if exitcode == 0 else "no SkyrimSE process")
        rec = RunRecord("x", Scenario(id="x", clients=["c1", "c2"]), self.tmp, "now", game=game)
        asyncio.run(self.services.runner._check_game(rec, ["c1", "c2"]))
        return rec, pve

    def test_game_check_reads_the_running_exe_on_managed_clients_only(self):
        rec, pve = self._check("1.6.1170", "C:\\Games\\Skyrim Special Edition 1.6.1170\\SkyrimSE.exe\r\n1.6.1170.0\r\n")
        self.assertEqual(rec.phases[0]["name"], "game-version")
        self.assertTrue(rec.phases[0]["ok"])
        self.assertEqual(rec.phases[0]["note"], "c1=1.6.1170.0, c2=unchecked (unmanaged)")
        self.assertEqual([c[0] for c in pve.calls], ["exec"])

    def test_a_client_on_another_build_is_a_lab_error(self):
        from labapi.runner import RunnerError

        with self.assertRaises(RunnerError) as ctx:
            self._check("1.6.1170", "C:\\Program Files (x86)\\Steam\\steamapps\\common\\Skyrim Special Edition\\SkyrimSE.exe\r\n1.7.104.0\r\n")
        self.assertIn("E_RUN_GAME", str(ctx.exception))
        self.assertIn("1.7.104.0", str(ctx.exception))
        with self.assertRaises(RunnerError) as ctx:
            self._check("1.6.1170", "", exitcode=3)
        self.assertIn("no running SkyrimSE.exe", str(ctx.exception))
        # 1.6.11700 is not 1.6.1170
        with self.assertRaises(RunnerError):
            self._check("1.6.1170", "C:\\x\\SkyrimSE.exe\r\n1.6.11700.0\r\n")


@needs_deps
class ProbeSteps(RunTests):
    """GET /lab/probe: one client's own dump-state outside a run, so a playtest
    that hits something odd can be read without resetting anything."""

    def test_a_probe_returns_the_client_s_dump_state(self):
        import threading

        out = {}
        t = threading.Thread(target=lambda: out.update(r=self.client.get("/lab/probe", params={"client": "c2"})))
        t.start()
        deadline = time.time() + 10
        while t.is_alive() and time.time() < deadline:
            self.doubles.turn()
            time.sleep(0.02)
        t.join(5)
        r = out["r"]
        self.assertEqual(r.status_code, 200, r.text)
        self.assertTrue(r.json()["ok"])
        self.assertEqual(r.json()["client"], "c2")
        self.assertIn(("c2", "dump-state", {}), self.doubles.seen)

    def test_a_probe_of_an_unknown_client_is_404(self):
        self.assertEqual(self.client.get("/lab/probe", params={"client": "c9"}).status_code, 404)

    def test_a_probe_reads_a_poison_and_nothing_that_writes(self):
        import threading

        out = {}
        t = threading.Thread(target=lambda: out.update(r=self.client.get("/lab/probe", params={"client": "c1", "action": "poisons"})))
        t.start()
        deadline = time.time() + 10
        while t.is_alive() and time.time() < deadline:
            self.doubles.turn()
            time.sleep(0.02)
        t.join(5)
        self.assertEqual(out["r"].status_code, 200, out["r"].text)
        self.assertIn(("c1", "poisons", {}), self.doubles.seen)
        for writes in ("hold-key", "console", "equip"):
            self.assertEqual(self.client.get("/lab/probe", params={"client": "c1", "action": writes}).status_code, 400)

    def test_an_assist_holds_a_key_in_one_client_s_game(self):
        import threading

        out = {}
        body = {"action": "hold-key", "args": {"code": 207, "ms": 8000}}
        t = threading.Thread(target=lambda: out.update(r=self.client.post("/lab/clients/c2/assist", json=body)))
        t.start()
        deadline = time.time() + 10
        while t.is_alive() and time.time() < deadline:
            self.doubles.turn()
            time.sleep(0.02)
        t.join(5)
        self.assertEqual(out["r"].status_code, 200, out["r"].text)
        self.assertTrue(out["r"].json()["ok"])
        self.assertIn(("c2", "hold-key", {"code": 207, "ms": 8000}), self.doubles.seen)

    def test_an_assist_runs_the_recorder_and_the_stop_answers_with_its_trace(self):
        # ADR-033: a playtest is recorded through the assist (lab/tools/playtest-record.sh)
        import threading

        for action, args in (("watch-start", {"bools": ["IsCastingRight"]}), ("watch-stop", {})):
            out = {}
            t = threading.Thread(target=lambda: out.update(r=self.client.post("/lab/clients/c1/assist", json={"action": action, "args": args})))
            t.start()
            deadline = time.time() + 10
            while t.is_alive() and time.time() < deadline:
                self.doubles.turn()
                time.sleep(0.02)
            t.join(5)
            self.assertEqual(out["r"].status_code, 200, out["r"].text)
            self.assertTrue(out["r"].json()["ok"])
            self.assertIn(("c1", action, args), self.doubles.seen)
        # the driver's answer comes back as the result (the doubles answer {})
        self.assertEqual(out["r"].json()["result"], {})

    def test_an_assist_sends_input_and_nothing_else(self):
        for other in ("console", "equip", "dump-state", "poisons"):
            r = self.client.post("/lab/clients/c1/assist", json={"action": other})
            self.assertEqual(r.status_code, 400, other)
        self.assertEqual(self.client.post("/lab/clients/c9/assist", json={"action": "tap-key", "args": {"code": 28}}).status_code, 404)

    def _hold(self, reason="playtest (a test)"):
        self.assertEqual(self.client.post("/lab/hold", json={"minutes": 10, "reason": reason}).status_code, 200)

    def test_a_playtest_step_runs_one_seat_s_step_inside_a_playtest_hold(self):
        # Eli, 2026-10-16: the lab casts on one seat while he staggers it from the other
        import threading

        self._hold()
        cases = (
            ("equip {formId: 0x12fd0}", ("c2", "equip", {"formId": 0x12FD0})),
            ({"hold-key": {"code": 199, "ms": 3000}}, ("c2", "hold-key", {"code": 199, "ms": 3000})),
            ("repeat {times: 2, gapMs: 3000, step: {hold-key: {code: 199, ms: 3000}}}",
             ("c2", "repeat", {"times": 2, "gapMs": [3000.0, 3000.0], "step": {"action": "hold-key", "args": {"code": 199, "ms": 3000}}})),
        )
        for step, want in cases:
            out = {}
            t = threading.Thread(target=lambda: out.update(r=self.client.post("/lab/clients/c2/playtest-step", json={"step": step})))
            t.start()
            deadline = time.time() + 10
            while t.is_alive() and time.time() < deadline:
                self.doubles.turn()
                time.sleep(0.02)
            t.join(5)
            self.assertEqual(out["r"].status_code, 200, out["r"].text)
            self.assertTrue(out["r"].json()["ok"])
            self.assertIn(want, self.doubles.seen)

    def test_a_playtest_step_needs_a_playtest_hold_and_sends_input_only(self):
        step = {"step": "equip {formId: 0x12fd0}"}
        self.assertEqual(self.client.post("/lab/clients/c2/playtest-step", json=step).status_code, 409)
        self._hold(reason="numidium: a staging")
        self.assertEqual(self.client.post("/lab/clients/c2/playtest-step", json=step).status_code, 409)
        self._hold()
        for bad in ('console {text: "tgm"}', "connect", "teleport {cell: lab-spawn}",
                    "repeat {times: 2, step: {console: {text: tgm}}}", "equip {formId", 7):
            self.assertEqual(self.client.post("/lab/clients/c2/playtest-step", json={"step": bad}).status_code, 400, bad)
        self.assertEqual(self.client.post("/lab/clients/c9/playtest-step", json={"step": "tap-key {code: 28}"}).status_code, 404)


@needs_deps
class GameCheckRetries(GameVersions):
    """The game check rides out a guest agent too busy to answer right after
    both clones boot (run 20261005-095237): two misses pass, a third errs."""

    def _check_with_misses(self, misses):
        import asyncio

        from labapi.guests import Guest
        from labapi.runner import RunRecord
        from labapi.scenario import Scenario

        tables = self.services.tables
        tables.guests["sky-c1"] = Guest("sky-c1", 711, "10.10.70.21", "qemu", "client", True, "clean-m1", "c1")
        tables.guests.pop("fake-c1", None)
        pve = self.services.control._b
        pve.game_misses = misses
        rec = RunRecord("x", Scenario(id="x", clients=["c1", "c2"]), self.tmp, "now", game="1.6.1170")
        asyncio.run(self.services.runner._check_game(rec, ["c1", "c2"]))
        return rec

    def test_two_missed_answers_still_check_the_game(self):
        rec = self._check_with_misses(2)
        self.assertTrue(rec.phases[0]["ok"], rec.phases)
        self.assertEqual(rec.phases[0]["note"], "c1=1.6.1170.0, c2=unchecked (unmanaged)")

    def test_a_third_missed_answer_errs(self):
        from labapi.runner import RunnerError

        with self.assertRaises(RunnerError) as cm:
            self._check_with_misses(3)
        self.assertIn("E_RUN_GAME", str(cm.exception))
