"""End-to-end runs through the FastAPI app on the fakes: the clients are test
doubles that poll /lab/step and answer, the server state is FakeState behind
the real RpcStateClient, Proxmox and the system are recording fakes."""

import base64
import json
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
"""


class Doubles:
    """Fake lab-drivers: poll each client's queue once per turn and answer."""

    def __init__(self, client, state, names, prefix="/lab"):
        self.client, self.state, self.names, self.prefix = client, state, names, prefix
        self.profile = {"c1": 1, "c2": 2}
        self.seen: list[tuple[str, str, dict]] = []
        self.stale_dumps = 0  # dump-states that report the client far from where the server's record says

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
            elif step["action"] == "request-screenshot":
                data = {"png_b64": base64.b64encode(b"\x89PNG fake").decode()}
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
        self.assertEqual(len(self.services.system.stopped_captures), 1)
        self.assertIsNone(self.services.runner.active)

    def test_red_run_on_failed_assertion(self):
        run_id, body = self._run(RED)
        self.assertEqual(body["verdict"], "red")
        self.assertEqual(len(body["failures"]), 1)
        self.assertEqual(body["failures"][0]["kind"], "assertion")
        self.assertEqual(body["failures"][0]["expr"], "server.actor(c1).x == 12345")
        self.assertEqual(len(body["steps"]), 2, "the run stops at the failed assert block")

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
        self.assertEqual(pve.calls, [("stop", 711), ("rollback", 711, "clean-sp"), ("start", 711)])
        self.assertTrue(rec.phases[0]["ok"], rec.phases)
        self.assertIn("unmanaged", rec.phases[0]["note"])


@needs_deps
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
        (writeLogs under the game directory named in game-dir.txt). Both are
        copied into the lab directory first and read from there."""
        from labapi.guests import Guest

        tables = self.services.tables
        tables.guests["fake-c1"] = Guest("fake-c1", 901, "127.0.0.1", "qemu", "client", True, "clean-sp", "c1")
        pve = self.services.control._b
        pve.files[r"C:\sky-lab\c1.log"] = "platform log\n"
        pve.files[r"C:\sky-lab\c1-driver.log"] = "2026-10-01T00:00:00Z loaded\n"
        run_id, body = self._run(SOLO_WITH_LOG)
        self.assertEqual(body["verdict"], "green", body)
        self.assertIn("c1.log", body["artifacts"])
        self.assertIn("c1-driver.log", body["artifacts"])
        run_dir = self.tmp / "results" / run_id
        self.assertEqual((run_dir / "c1-driver.log").read_text(), "2026-10-01T00:00:00Z loaded\n")
        copies = [c for c in pve.calls if c[0] == "exec" and "Copy-Item" in " ".join(c[2])]
        self.assertEqual(len(copies), 2, pve.calls)
        self.assertIn("game-dir.txt", " ".join(copies[1][2]))
        self.assertIn("lab-driver-logs.txt", " ".join(copies[1][2]))


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
"""


@needs_deps
class ClientStepNames(RunTests):
    def test_item_and_recipe_names_reach_the_driver_as_form_ids(self):
        run_id, body = self._run(NAMED_ARGS)
        self.assertEqual(body["verdict"], "green", body)
        seen = {a: args for _, a, args in self.doubles.seen if a in ("equip", "craft")}
        self.assertEqual(seen["equip"], {"formId": 0x12EB7})
        self.assertEqual(seen["craft"], {"station": 0x1234, "recipe": 0xDA76A})

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

    def test_default_run_plays_the_steam_build_on_the_default_masters(self):
        r = self._post(GAME_ONE)
        self.assertEqual(r.status_code, 200, r.text)
        body = self._finish(r.json()["run"])
        self.assertEqual(body["game"], "1.7.104")
        self.assertEqual(self._up_env(), {"ESM_DIR": "/srv/persist/esm"})
        self.assertIn("game 1.7.104", body["phases"][0]["note"])

    def test_request_version_wins_over_the_scenario_and_reaches_the_server_mount(self):
        r = self._post(GAME_ONE + "game: 1.7.104\n", game="1.6.1170")
        self.assertEqual(r.status_code, 200, r.text)
        body = self._finish(r.json()["run"])
        self.assertEqual(body["game"], "1.6.1170")
        self.assertEqual(self._up_env(), {"ESM_DIR": "/srv/persist/esm/1.6.1170"})

    def test_scenario_version_is_used_without_a_request_version(self):
        r = self._post(GAME_ONE + "game: 1.6.1170\n")
        self.assertEqual(r.status_code, 200, r.text)
        self.assertEqual(self._finish(r.json()["run"])["game"], "1.6.1170")

    def test_unknown_version_is_400_and_starts_nothing(self):
        r = self._post(GAME_ONE, game="1.5.97")
        self.assertEqual(r.status_code, 400)
        self.assertIn("E_GAME", r.text)
        r = self._post(GAME_ONE + "game: 1.5.97\n")
        self.assertEqual(r.status_code, 400)
        self.assertEqual(self.services.system.commands, [])

    def test_launcher_endpoint_answers_the_active_runs_version(self):
        self.assertEqual(self.client.get("/lab/game", params={"client": "c1"}).json()["version"], "1.7.104")
        r = self._post(GAME_ONE, game="1.6.1170")
        self.assertEqual(r.status_code, 200, r.text)
        # the run waits in rollback-clients for c1's first poll, which is when
        # a booting clone's launcher asks
        self.assertEqual(self.client.get("/lab/game", params={"client": "c1"}).json()["version"], "1.6.1170")
        self._finish(r.json()["run"])
        self.assertEqual(self.client.get("/lab/game", params={"client": "c1"}).json()["version"], "1.7.104")

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
