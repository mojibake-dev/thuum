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
"""


class Doubles:
    """Fake lab-drivers: poll each client's queue once per turn and answer."""

    def __init__(self, client, state, names, prefix="/lab"):
        self.client, self.state, self.names, self.prefix = client, state, names, prefix
        self.profile = {"c1": 1, "c2": 2}

    def turn(self):
        for name in self.names:
            step = self.client.get(f"{self.prefix}/step", params={"client": name}).json()
            if not step:
                continue
            me = self.state.actors[self.profile[name]]
            data = {}
            if step["action"] == "move":
                me.x += float(step["args"].get("dx", 0))
                me.y += float(step["args"].get("dy", 0))
            elif step["action"] == "dump-state":
                data = {"self": {"x": me.x, "y": me.y, "z": me.z, "cell": me.cell},
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
            step_timeout_s=5, heartbeat_timeout_s=5, server_ready_timeout_s=1, time_scale=0.0,
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
            if body["verdict"] != "running":
                return run_id, body
            time.sleep(0.02)
        self.fail(f"run {run_id} did not finish: {body}")

    def test_green_run_end_to_end(self):
        run_id, body = self._run(GREEN)
        self.assertEqual(body["verdict"], "green", json.dumps(body, indent=1))
        self.assertEqual([p["name"] for p in body["phases"]], ["rollback-server", "rollback-clients"])
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
        text = "id: t2-timeout\nclients: [c1]\nsteps:\n  - c1: connect\n"
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
