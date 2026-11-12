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
        self.days: dict[str, float] = {}  # a client's game days passed in its dump-state, advanced by day_step per dump
        self.day_step: dict[str, float] = {}
        self.closable: set[str] = set()  # the clients whose close-menu removes the named menu from self.menus
        self.npcs: dict[str, dict[int, dict]] = {}  # the NPCs a client's npc-state reports, by form id
        self.chests: dict[str, dict[int, dict[int, int]]] = {}  # the containers a client's inventory reads: ref -> base id -> count
        self.carried: dict[str, dict[int, int]] = {}  # the items a client's player carries for transfer: base id -> count
        self.stuck: set[str] = set()  # the clients whose engine moves nothing on a transfer (the driver's after-count throw)
        self.aliases: dict[str, dict[tuple[int, int], int]] = {}  # the references a client's alias reads: (quest, alias) -> refr
        self.standing: dict[str, dict[int, dict[int, int]]] = {}  # the ranks a client's factions read: actor -> faction -> rank
        self.script_vars: dict[str, dict[int, dict[str, int]]] = {}  # the ints a client's script-vars reads: form -> "<script>::<var>" -> value
        self.objectives: dict[str, dict[int, set[int]]] = {}  # the objectives a client's game shows: quest -> displayed indices

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
                if name in self.days:
                    data["gameDaysPassed"] = self.days[name]
                    self.days[name] += self.day_step.get(name, 0.0)
            elif step["action"] == "close-menu":
                if name in self.closable and name in self.menus:
                    self.menus[name] = [m for m in self.menus[name] if m != step["args"].get("name")]
                data = "closing"
            elif step["action"] == "request-screenshot":
                data = {"png_b64": base64.b64encode(b"\x89PNG fake").decode()}
            elif step["action"] == "npc-state":
                data = (self.npcs.get(name) or {}).get(int(step["args"].get("formId", 0))) or {}
            elif step["action"] == "inventory":
                # the driver's contract: a form id, never a name (lab-api resolves a FormDesc or a table name first)
                ref = step["args"].get("ref")
                assert isinstance(ref, int) and not isinstance(ref, bool), step["args"]
                chest = (self.chests.get(name) or {}).get(ref)
                data = {"ref": ref, "items": {str(b): n for b, n in chest.items()}} if chest is not None else {"error": "no such ref"}
            elif step["action"] == "transfer":
                # the driver's contract: form ids, never names, and one of to and from (lab-api resolves and checks them
                # first); the count moves between the player and the chest as removeItem moves it, and a missing ref, a
                # source holding fewer than count or an engine that moved nothing (self.stuck) throws in the driver,
                # whose catch posts ok: false with the error's text
                a = step["args"]
                assert ("to" in a) != ("from" in a), a
                item, ref, count = a.get("item"), a.get("to", a.get("from")), a.get("count", 1)
                assert all(isinstance(v, int) and not isinstance(v, bool) for v in (item, ref)), a
                chest = (self.chests.get(name) or {}).get(ref)
                pack = self.carried.setdefault(name, {})
                source, target = (pack, chest) if "to" in a else (chest, pack)
                why = ""
                if chest is None:
                    why = f"no such ref {ref:x}"
                elif source.get(item, 0) < count:
                    who = "the player" if "to" in a else f"{ref:x}"
                    why = f"{who} holds {source.get(item, 0)} of {item:x}, fewer than {count}"
                elif name in self.stuck:
                    p, n = pack.get(item, 0), chest.get(item, 0)
                    why = (f"{'a store' if 'to' in a else 'a take'} of {count} of {item:x} left the player at {p} (from {p}) "
                           f"and {ref:x} at {n} (from {n})")
                if why:
                    r = self.client.post(f"{self.prefix}/step/{step['id']}/result", json={"ok": False, "error": f"Error: {why}"})
                    assert r.status_code == 200, r.text
                    continue
                before = {"player": pack.get(item, 0), "container": chest.get(item, 0)}
                source[item] -= count
                target[item] = target.get(item, 0) + count
                data = {"item": item, ("to" if "to" in a else "from"): ref, "count": count,
                        "player": {"before": before["player"], "after": pack[item]},
                        "container": {"before": before["container"], "after": chest[item]}}
            elif step["action"] == "alias":
                # the driver's contract: the quest as a form id (lab-api resolves a FormDesc or a table name first)
                q, al = step["args"].get("quest"), step["args"].get("alias")
                assert isinstance(q, int) and not isinstance(q, bool), step["args"]
                held = (self.aliases.get(name) or {}).get((q, al))
                data = {"quest": q, "alias": al, "refr": held, "name": "Fixture"} if held is not None else {"error": f"no quest {q:x} in this game"}
            elif step["action"] == "factions":
                fs, actor = step["args"].get("factions"), step["args"].get("formId")
                assert all(isinstance(f, int) and not isinstance(f, bool) for f in fs), step["args"]
                ranks = (self.standing.get(name) or {}).get(actor)
                data = ({"formId": actor, "ranks": {str(f): ranks.get(f, -2) for f in fs}, "members": {str(f): f in ranks for f in fs}, "crime": 0}
                        if ranks is not None else {"error": f"no actor {actor:x} in this game"})
            elif step["action"] == "script-vars":
                # the driver's contract: the form as a form id (lab-api resolves a FormDesc first), the keys as written
                form, keys = step["args"].get("form"), step["args"].get("keys")
                assert isinstance(form, int) and not isinstance(form, bool), step["args"]
                held = (self.script_vars.get(name) or {}).get(form)
                rows = []
                for k in keys:
                    script, _, var = k.partition("::")
                    rows.append({"form": form, "script": script, "var": var, "k": 3, "i": held[k]} if held and k in held
                                else {"form": form, "script": script, "var": var, "reason": "no such variable"})
                data = {"form": form, "vars": rows} if held is not None else {"error": f"no form {form:x} in this game"}
            elif step["action"] == "quest-objectives":
                q, wanted = step["args"].get("quest"), step["args"].get("objectives")
                assert isinstance(q, int) and not isinstance(q, bool), step["args"]
                shown = (self.objectives.get(name) or {}).get(q)
                data = ({"quest": q, "running": True, "objectives": {str(i): {"displayed": i in shown, "completed": False} for i in wanted}}
                        if shown is not None else {"error": f"no quest {q:x} in this game"})
            elif step["action"] == "av-table":
                data = {"ids": list(range(1000, 1164))}
            elif step["action"] == "add-perks":
                ids = list(step["args"].get("ids") or [])
                data = {"added": ids, "had": [], "missing": [], "refused": [], "kept": ids if step["args"].get("keep") else []}
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
            fixture_worlds_dir=str(self.tmp / "fixtures"),
            step_timeout_s=5, heartbeat_timeout_s=5, server_ready_timeout_s=1, connect_timeout_s=1, time_scale=0.0,
            before_logs_quiet_s=0.0,  # the clients' before-run logs are fetched only where a test turns it on
            hang_evidence=False,  # a hung seat's dump is taken only where a test turns it on
            clear_start_box=False,  # a seat's start-up box is cleared only where a test turns it on
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

    def test_a_fixture_world_is_laid_in_place_of_the_snapshot(self):
        fx = self.tmp / "fixtures" / "preslice" / "changeForms"
        fx.mkdir(parents=True)
        (fx / "0.json").write_text('{"profileId": 1}')
        (fx.parent / "load-order.json").write_text('{"files": [{"name": "Skyrim.esm", "light": false}]}')
        run_id, body = self._run("id: t2-world\nclients: [c1]\nserver: {world: preslice}\nsteps: []\n")
        self.assertEqual(body["verdict"], "green", body.get("failures"))
        world = self.tmp / "world"
        self.assertEqual((world / "changeForms" / "0.json").read_text(), '{"profileId": 1}')
        self.assertTrue((world / "load-order.json").is_file())
        self.assertFalse((world / "actors.json").exists(), "the clean snapshot's file is not laid")
        self.assertIn("fixture world preslice", body["phases"][0]["note"])

    def test_a_missing_fixture_world_is_error_and_world_with_snapshot_is_refused(self):
        run_id, body = self._run("id: t2-noworld\nclients: [c1]\nserver: {world: nope}\nsteps: []\n")
        self.assertEqual(body["verdict"], "error")
        self.assertIn("E_RUN_WORLD", body["failures"][0]["error"])
        for server in ("{world: preslice, snapshot: clean}", "{world: ../up}"):
            r = self.client.post("/lab/run", files={"scenario": ("s.yaml", f"id: t\nclients: [c1]\nserver: {server}\nsteps: []\n".encode(), "text/yaml")})
            self.assertEqual(r.status_code, 400, server)
            self.assertIn("E_SCENARIO", r.text)

    def test_bad_scenario_is_400(self):
        r = self.client.post("/lab/run", files={"scenario": ("s.yaml", b"id: t\nclients: [c1]\nsteps:\n  - c9: connect\n", "text/yaml")})
        self.assertEqual(r.status_code, 400)
        self.assertIn("E_SCENARIO", r.text)

    def test_scenario_that_is_no_yaml_is_400(self):
        """x-fate-login-bleak-trace v4 (2026-11-04): a \\d inside a double-quoted claim is no YAML; the run endpoint answered
        500 and lab-run read nothing; it says E_SCENARIO with the scanner's words instead."""
        body = b"id: t\nclients: [c1]\nsteps:\n  - c1: connect\n  - assert:\n      - \"c1.log_count('on thread (\\d+)') >= 1\"\n"
        r = self.client.post("/lab/run", files={"scenario": ("s.yaml", body, "text/yaml")})
        self.assertEqual(r.status_code, 400)
        self.assertIn("E_SCENARIO", r.text)
        self.assertIn("double-quoted", r.text)

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
        # the log is copied on the seat and read back in ranges (_fetch_client_file), so the agent's reads fail there,
        # whole and ranged
        pve.files[self.settings.client_driver_log] = "platform log\n"

        def boom(guest, path, *args):
            raise RuntimeError("500 Internal Server Error: QEMU guest agent is not running")

        pve.file_read = boom
        pve.file_read_range = boom
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
        pve.files[r"C:\sky-lab\c1-console.log"] = "2026-10-01T00:00:01Z [Script] Trace in HostService: roster\n"
        pve.files[r"C:\sky-lab\c1-skse64.log"] = "imagebase = 00007FF7AB420000\n"
        pve.files[r"C:\sky-lab\c1-TMS_AIPathingFreezeFix.log"] = "patched 1 call\n"
        run_id, body = self._run(SOLO_WITH_LOG)
        self.assertEqual(body["verdict"], "green", body)
        self.assertIn("c1.log", body["artifacts"])
        self.assertIn("c1-driver.log", body["artifacts"])
        self.assertIn("c1-console.log", body["artifacts"], "every console line, lab-driver's tee (printConsole reaches no other file)")
        self.assertIn("c1-skse64.log", body["artifacts"])
        self.assertIn("c1-TMS_AIPathingFreezeFix.log", body["artifacts"])
        run_dir = self.tmp / "results" / run_id
        self.assertEqual((run_dir / "c1-driver.log").read_text(), "2026-10-01T00:00:00Z loaded\n")
        self.assertEqual((run_dir / "c1-skse64.log").read_text(), "imagebase = 00007FF7AB420000\n")
        self.assertEqual((run_dir / "c1-TMS_AIPathingFreezeFix.log").read_text(), "patched 1 call\n")
        # the three logs are each copied by a read that shares write access, since the game holds its logs open for
        # writing (Copy-Item's read refused the console log, 20261111-193821), the SKSE folder's by one Copy-Item over
        # its listing
        copies = [" ".join(c[2]) for c in pve.calls if c[0] == "exec" and "[IO.File]::Open($src, 'Open', 'Read', 'ReadWrite')" in " ".join(c[2])]
        self.assertEqual(len(copies), 3, pve.calls)
        self.assertIn(f"$src = '{self.settings.client_driver_log}'", copies[0])
        self.assertIn("game-dir.txt", copies[1])
        self.assertIn("lab-driver-logs.txt", copies[1])
        self.assertIn("game-dir.txt", copies[2])
        self.assertIn("lab-console-logs.txt", copies[2])
        self.assertFalse([c for c in copies if "Copy-Item" in c])
        listings = [c for c in pve.calls if c[0] == "exec" and "Copy-Item" in " ".join(c[2])]
        self.assertEqual(len(listings), 1, pve.calls)
        # one listing: the folder skyrim-platform.log is in, itself left out (it is c1.log), then every other
        # My Games\<folder>\SKSE (the freeze fix logs under Skyrim.INI\SKSE), a name kept from its first folder
        listing = " ".join(listings[0][2])
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

    def _managed_c1(self):
        from labapi.guests import Guest

        self.services.tables.guests["fake-c1"] = Guest("fake-c1", 901, "127.0.0.1", "qemu", "client", True, "clean-sp", "c1")
        return self.services.control._b

    def test_a_log_is_copied_by_a_read_that_shares_write_access(self):
        """The game holds its logs open for writing, and Copy-Item's read refused them (the c1.log entry's console
        copy in 20261111-193821, 194559 and 195437): a log is copied as the frida traces and log-count copy theirs,
        [IO.File]::Open sharing read and write, the copy exec printing the source's length at its open and the copy's."""
        pve = self._managed_c1()
        pve.files[self.settings.client_driver_log] = "platform log\n"
        run_id, body = self._run(SOLO_WITH_LOG)
        self.assertEqual(body["verdict"], "green", body)
        self.assertEqual((self.tmp / "results" / run_id / "c1.log").read_text(encoding="utf-8"), "platform log\n")
        # the seat's copy named by its run (the fresh review of 5771141b, nit 4), kept as the artifact c1.log
        copy = f"C:\\sky-lab\\{run_id}-c1.log"
        made = next(" ".join(c[2]) for c in pve.calls if c[0] == "exec" and f"[IO.File]::Create('{copy}')" in " ".join(c[2]))
        for part in (f"$src = '{self.settings.client_driver_log}'", "[IO.File]::Open($src, 'Open', 'Read', 'ReadWrite')",
                     "$n = $s.Length", "$m = $d.Length", "Write-Output ([string]$n + ' ' + [string]$m)"):
            self.assertIn(part, made)
        self.assertNotIn("Copy-Item", made)
        self.assertNotIn(copy, pve.files, "the copy leaves the seat once read")

    def test_a_log_larger_than_a_range_comes_back_byte_exact(self):
        """Playtest 45's c1 log reached 25k lines, and read whole the console logs timed out the agent on both seats
        (20261111-191642): a log comes back through Proxmox's ranged file-reads of READ_RANGE_BYTES, joined as bytes
        and decoded once, so a range boundary inside a multibyte character splits nothing."""
        from labapi.runner import READ_RANGE_BYTES as R

        log = "a" * (R - 1) + "é" + "b" * (R - 3) + "€" + "c" * 10 + "\n"
        pve = self._managed_c1()
        pve.files[self.settings.client_driver_log] = log
        run_id, body = self._run(SOLO_WITH_LOG)
        self.assertEqual(body["verdict"], "green", body)
        self.assertEqual((self.tmp / "results" / run_id / "c1.log").read_bytes(), log.encode("utf-8"))
        copy = f"C:\\sky-lab\\{run_id}-c1.log"
        self.assertEqual([c[3:] for c in pve.calls if c[:3] == ("file_read_range", 901, copy)], [(0, R), (R, R), (2 * R, 12)])
        self.assertFalse([c for c in pve.calls if c[:3] == ("file_read", 901, copy)], "no whole read")
        self.assertFalse([n for n in body["notes"] if n.startswith("c1.log:")], body["notes"])

    def test_a_log_range_still_unread_after_its_retries_is_a_note(self):
        """A log is evidence for a reader, not for the verdict: a range whose read still times out after
        file_read_range's own retries leaves the log out with a note naming its code and "(log fetch)", the run's
        verdict as it was."""
        from unittest import mock

        from labapi import proxmox
        from labapi.proxmox import ProxmoxError
        from labapi.runner import READ_RANGE_BYTES as R

        pve = self._managed_c1()
        pve.files[self.settings.client_driver_log] = "x" * (R + 10) + "\n"
        plain_range = pve.file_read_range

        def file_read_range(guest, path, offset, count):
            if path.endswith("-c1.log") and offset == R:
                pve.calls.append(("file_read_range", guest.vmid, path, offset, count))
                raise ProxmoxError(f"E_PVE_FILE: {guest.name}: ResourceException: 500 Internal Server Error: VM {guest.vmid} "
                                   "qga command 'guest-file-read' failed - got timeout")
            return plain_range(guest, path, offset, count)

        pve.file_read_range = file_read_range
        with mock.patch.object(proxmox, "FILE_READ_PAUSES", (0.0, 0.0)):
            run_id, body = self._run(SOLO_WITH_LOG)
        self.assertEqual(body["verdict"], "green", body)
        self.assertEqual(body["failures"], [])
        self.assertIn("c1.log: range 2 of 2: E_PVE_FILE: fake-c1: ResourceException: 500 Internal Server Error: VM 901 qga "
                      "command 'guest-file-read' failed - got timeout (log fetch)", body["notes"])
        self.assertNotIn("c1.log", body["artifacts"])
        copy = f"C:\\sky-lab\\{run_id}-c1.log"
        self.assertEqual([c[3:] for c in pve.calls if c[:3] == ("file_read_range", 901, copy)], [(0, R)] + [(R, 11)] * 3)
        self.assertNotIn(copy, pve.files, "the copy leaves the seat whatever the read did")

    def _c1_log_removals(self, answers):
        """The c1.log copy's removals (C:\\sky-lab\\<run>-c1.log, or a path named c1.log) answered in turn from
        `answers` (an ExecResult each; None passes the try to the fake, which removes the copy), every try counted in
        self.removals."""
        pve = self._managed_c1()
        plain_exec = pve.exec
        self.removals = []

        def exec_(guest, command, timeout):
            if re.search(r"Remove-Item -LiteralPath 'C:\\sky-lab\\(?:[^']+-)?c1\.log' -Force", " ".join(command)):
                self.removals.append(len(self.removals) + 1)
                answer = answers[len(self.removals) - 1] if len(self.removals) <= len(answers) else None
                if answer is not None:
                    pve.calls.append(("exec", guest.vmid, tuple(command)))
                    return answer
            return plain_exec(guest, command, timeout)

        pve.exec = exec_
        return pve

    def test_a_log_copy_held_past_its_removals_window_is_a_note_and_no_fault(self):
        """A busy agent keeps the handle of a read or close that timed out until it works through its queue, and Windows
        keeps the file locked (core's host journal, 2026-11-12: c1's shot 076 at 20261112-081535 and c2's 056 at 101523
        faulted their seats, and a mixed reset from one turned x-two-hands red at 082053): a log copy still there at its
        four quick tries and at a try after each of the window's four pings the agent answers (the fresh review of
        5771141b, finding 1) is a note naming the file and its seat, never the seat's fault; the seat's next reset
        removes it, and the log, read whole, is kept."""
        from labapi.proxmox import ExecResult

        pve = self._c1_log_removals([ExecResult(0, "True\r\n", "")] * 8)  # still there: the agent holds it
        pve.files[self.settings.client_driver_log] = "platform log\n"
        run_id, body = self._run(SOLO_WITH_LOG)
        self.assertEqual(body["verdict"], "green", body)
        self.assertIn("c1.log", body["artifacts"])
        copy = f"C:\\sky-lab\\{run_id}-c1.log"
        self.assertEqual(self.removals, [1, 2, 3, 4, 5, 6, 7, 8])
        notes = [n for n in body["notes"] if copy in n]
        self.assertEqual(notes[:-1], [f"c1.log: {copy} still there at its removal's try {k} of 4, tried again in 1 s"
                                      for k in (1, 2, 3)])
        self.assertRegex(notes[-1], "^" + _held_note("c1.log", copy) + "$")
        self.assertEqual(self.services.runner.seats["c1"].force, "")
        self.assertEqual(self.services.runner.runs[run_id].faulted, {})

    def test_a_log_copy_the_agent_lets_go_of_within_the_window_is_removed_late_and_no_fault(self):
        """The window after the quick tries (REMOVE_BACKOFF_S): the agent pinged after each pause, busy at the first two,
        and the try after the ping it answers removes the copy, a note saying when; no held note and no fault."""
        from labapi.proxmox import ExecResult

        pve = self._c1_log_removals([ExecResult(0, "True\r\n", "")] * 4)  # the fifth try goes to the fake, which removes it
        pve.files[self.settings.client_driver_log] = "platform log\n"
        pings = [False, False, True]

        def agent_ping(guest):
            pve.calls.append(("agent_ping", guest.vmid))
            return pings.pop(0)

        pve.agent_ping = agent_ping
        run_id, body = self._run(SOLO_WITH_LOG)
        self.assertEqual(body["verdict"], "green", body)
        self.assertIn("c1.log", body["artifacts"])
        self.assertEqual(self.removals, [1, 2, 3, 4, 5])
        self.assertEqual(pings, [])
        copy = f"C:\\sky-lab\\{run_id}-c1.log"
        self.assertEqual([n for n in body["notes"] if copy in n],
                         [f"c1.log: {copy} still there at its removal's try {k} of 4, tried again in 1 s" for k in (1, 2, 3)]
                         + [f"c1.log: {copy} gone at its removal's try 5, 17 s after its first, once the agent answered a ping"])
        self.assertFalse([n for n in body["notes"] if "held open" in n], body["notes"])
        self.assertEqual(self.services.runner.seats["c1"].force, "")
        self.assertNotIn(copy, pve.files)

    def test_a_log_copy_still_there_at_its_first_removal_and_gone_at_the_next_is_no_fault(self):
        """On qemu-server 9.2.15, which closes its handles, a running game's console log copy stayed a moment after a
        small read (train 52's stage: x-console-arm's logcount-052-console.log.copy, a 73.1 s rollback at c1's next
        run, and x-acting-player's at step 133), numidium's HYPOTHESIS a scan of a file just written: a copy still there
        at its removal's first try and gone at the second is no fault, one note naming the try."""
        from labapi.proxmox import ExecResult

        pve = self._c1_log_removals([ExecResult(0, "True\r\n", "")])  # a moment's hold; the next try removes it
        pve.files[self.settings.client_driver_log] = "platform log\n"
        run_id, body = self._run(SOLO_WITH_LOG)
        self.assertEqual(body["verdict"], "green", body)
        self.assertIn("c1.log", body["artifacts"])
        self.assertEqual(self.removals, [1, 2])
        copy = f"C:\\sky-lab\\{run_id}-c1.log"
        self.assertEqual([n for n in body["notes"] if copy in n],
                         [f"c1.log: {copy} still there at its removal's try 1 of 4, tried again in 1 s"])
        self.assertFalse([n for n in body["notes"] if "held open" in n], body["notes"])
        self.assertEqual(self.services.runner.seats["c1"].force, "")
        self.assertNotIn(copy, pve.files)

    def test_a_removals_tries_and_window_are_paced_through_the_time_scale(self):
        """The removal's four quick tries are REMOVE_PAUSE_S apart and its window's pings REMOVE_BACKOFF_S, every pause
        times time_scale as _tried's is, so the tests run them at once. At a time_scale of 1: three pauses of 1 s, then
        2, 4, 8 and 16 s, 30 s in all, a try after each ping the agent answers (the fresh review of 5771141b, finding 1),
        none after one it does not. The note counts every try and their whole span on the runner's clock (nit 4), here
        the pauses alone; either way the copy is a note, and nothing rolls the seat back."""
        import asyncio
        import dataclasses
        import types
        from unittest import mock

        from labapi import runner as runner_mod
        from labapi.proxmox import ExecResult
        from labapi.runner import REMOVE_BACKOFF_S, REMOVE_PAUSE_S, REMOVE_TRIES, RunRecord
        from labapi.scenario import Scenario

        pve = self._c1_log_removals([ExecResult(0, "True\r\n", "")] * 12)
        runner = self.services.runner
        runner.s = dataclasses.replace(self.settings, time_scale=1.0)
        now = [0.0]
        runner._clock = lambda: now[0]
        g = self.services.tables.guests["fake-c1"]
        path = "C:\\sky-lab\\c1.log"
        self.assertEqual((REMOVE_TRIES, REMOVE_PAUSE_S, REMOVE_BACKOFF_S), (4, 1.0, (2.0, 4.0, 8.0, 16.0)))
        for agent_up, removals, how in (
                (True, list(range(1, 9)), "8 tries over 33.0 s, the last once the agent answered a ping"),
                (False, [1, 2, 3, 4], "4 tries over 33.0 s, and no ping answered in the 30 s after")):
            with self.subTest(agent_up=agent_up):
                pve.agent_up, slept = agent_up, []
                self.removals.clear()
                del pve.calls[:]

                async def sleep(seconds):
                    slept.append(seconds)
                    now[0] += seconds

                rec = RunRecord("x", Scenario(id="x", clients=["c1"]), self.tmp, "now")
                with mock.patch.object(runner_mod, "asyncio", types.SimpleNamespace(to_thread=asyncio.to_thread, sleep=sleep)):
                    asyncio.run(runner._removed(rec, g, lambda: runner._remove_try(g, path), {path: "c1.log"}, set(), "c1.log"))
                self.assertEqual((self.removals, slept), (removals, [1.0, 1.0, 1.0, 2.0, 4.0, 8.0, 16.0]))
                self.assertEqual(len([c for c in pve.calls if c[0] == "agent_ping"]), 4)
                self.assertEqual(rec.notes[-1], f"c1.log: {path} on c1 (fake-c1) held open in the agent after its read "
                                                f"({how}); left to the seat's next reset")
                self.assertEqual((rec.rollback, rec.faulted), ({}, {}))

    def _paced_removal(self, answers, died, agent_ping=None):
        """Runner._removed of C:\\sky-lab\\c1.log on c1 at a time_scale of 1, each try answered in turn from `answers`
        (stayed, why), the agent pinged by `agent_ping` (the fake's own by default), the pauses recorded and the runner's
        clock moved by them: the record, the pauses and the pings."""
        import asyncio
        import dataclasses
        import types
        from unittest import mock

        from labapi import runner as runner_mod
        from labapi.runner import RunRecord
        from labapi.scenario import Scenario

        pve = self._managed_c1()
        pings = []

        def ping(guest):
            pings.append(guest.vmid)
            return agent_ping(guest) if agent_ping else True

        pve.agent_ping = ping
        runner = self.services.runner
        runner.s = dataclasses.replace(self.settings, time_scale=1.0)
        now, slept = [0.0], []
        runner._clock = lambda: now[0]

        async def sleep(seconds):
            slept.append(seconds)
            now[0] += seconds

        async def attempt():
            return answers.pop(0)

        rec = RunRecord("x", Scenario(id="x", clients=["c1"]), self.tmp, "now")
        g = self.services.tables.guests["fake-c1"]
        path = "C:\\sky-lab\\c1.log"
        with mock.patch.object(runner_mod, "asyncio", types.SimpleNamespace(to_thread=asyncio.to_thread, sleep=sleep)):
            asyncio.run(runner._removed(rec, g, attempt, {path: "c1.log"}, died, "c1.log"))
        return rec, slept, pings

    def test_a_try_refused_by_an_agent_busy_past_its_patience_goes_to_the_window_at_once(self):
        """A quick try whose exec GuestControl gave up on, the agent still busy after its 30 s, is not tried again a
        second on: the removal goes to the window at once, whose pings wait on the agent without an exec each, and the
        try after the ping it answers decides (an untested path at 5771141b, runner.py:2530). Gone there, it is a note;
        held through every ping unanswered, it is taken as held after one try ("1 try", nit 4)."""
        busy = ("C:\\sky-lab\\c1.log on fake-c1 not removed: E_PVE_EXEC: fake-c1: ResourceException: 500 Internal Server "
                "Error: QEMU guest agent is not running (still busy after 6 tries over 30 s)")
        path = "C:\\sky-lab\\c1.log"
        rec, slept, pings = self._paced_removal([(None, busy), (set(), "")], {path})
        self.assertEqual((slept, len(pings)), ([2.0], 1), "no quick try's 1 s pause after a spent window")
        self.assertEqual(rec.notes, [f"c1.log: {path} gone at its removal's try 2, 2 s after its first, once the agent "
                                     "answered a ping"])
        rec, slept, pings = self._paced_removal([(None, busy)], {path}, agent_ping=lambda guest: False)
        self.assertEqual((slept, len(pings)), ([2.0, 4.0, 8.0, 16.0], 4))
        self.assertEqual(rec.notes, [f"c1.log: {path} on c1 (fake-c1) taken as held open in the agent, its read having failed "
                                     f"(1 try over 30.0 s, and no ping answered in the 30 s after; {busy}); left to the "
                                     "seat's next reset"])
        self.assertEqual((rec.rollback, rec.faulted), ({}, {}))

    def test_a_ping_that_raises_reads_as_one_unanswered(self):
        """GuestControl.agent_ping raises a ProxmoxError for a backend's failure (an untested path at 5771141b,
        runner.py:2544): the window reads it as a ping unanswered, tries nothing after it, and ends past its 30 s with
        the held note, nothing escaping the removal."""
        still = ({"C:\\sky-lab\\c1.log"}, "")

        def ping(guest):
            raise RuntimeError("500 Internal Server Error: VM 901 not reachable")

        rec, slept, pings = self._paced_removal([still] * 4, set(), agent_ping=ping)
        self.assertEqual((slept, len(pings)), ([1.0, 1.0, 1.0, 2.0, 4.0, 8.0, 16.0], 4))
        self.assertRegex(rec.notes[-1], "^" + _held_note("c1.log", "C:\\sky-lab\\c1.log", tries=4,
                                                         last="and no ping answered in the 30 s after") + "$")
        self.assertIn("4 tries over 33.0 s", rec.notes[-1])
        self.assertEqual((rec.rollback, rec.faulted), ({}, {}))

    def test_a_seats_named_log_comes_with_its_seats_one_fetch(self):
        """c1-console.log read as a client called c1-console ("c1-console is unmanaged or unmapped; log not fetched"),
        and eight committed scenarios list it beside c1.log: a seat's named log resolves to its seat's fetch, which keeps
        c1.log, c1-driver.log and c1-console.log, made once however many of them the scenario names."""
        pve = self._managed_c1()
        logs = {"c1.log": "platform log\n", "c1-driver.log": "driver\n", "c1-console.log": "console\n"}
        for name, text in logs.items():
            pve.files[f"C:\\sky-lab\\{name}"] = text
        run_id, body = self._run(SOLO_WITH_LOG.replace("artifacts: [server.log, c1.log]",
                                                       "artifacts: [server.log, c1.log, c1-console.log, c1-driver.log]"))
        self.assertEqual(body["verdict"], "green", body)
        for name in logs:
            self.assertEqual(body["artifacts"].count(name), 1, body["artifacts"])
        self.assertFalse([n for n in body["notes"] if "unmanaged or unmapped" in n], body["notes"])
        copies = [c for c in pve.calls if c[0] == "exec" and "[IO.File]::Open($src, 'Open', 'Read', 'ReadWrite')" in " ".join(c[2])]
        self.assertEqual(len(copies), 3, "each log copied once")
        # the console log named alone brings the seat's same fetch
        for name, text in logs.items():
            pve.files[f"C:\\sky-lab\\{name}"] = text
        run_id, body = self._run(SOLO_WITH_LOG.replace("artifacts: [server.log, c1.log]", "artifacts: [c1-console.log]"))
        self.assertEqual(body["verdict"], "green", body)
        self.assertEqual(sorted(n for n in body["artifacts"] if n in logs), sorted(logs))

    def test_a_seats_named_log_on_an_unmanaged_seat_is_one_note(self):
        run_id, body = self._run(SOLO_WITH_LOG.replace("artifacts: [server.log, c1.log]", "artifacts: [c1.log, c1-console.log]"))
        self.assertEqual(body["verdict"], "green", body)
        self.assertEqual([n for n in body["notes"] if "unmanaged or unmapped" in n], ["c1.log: c1 is unmanaged or unmapped; log not fetched"])

    def test_a_log_whose_source_is_not_there_is_a_note_untried_again(self):
        """A source that is not there is said by the copy itself, `missing <path>`, and no try finds it, where three
        tries 10 s apart spent about 25 s on it (the fresh review of e8d8de9b, nit 5): one copy exec, then a note naming
        the path, E_RUN_LOG_FETCH and "(log fetch)"."""
        pve = self._managed_c1()
        run_id, body = self._run(SOLO_WITH_LOG)
        self.assertEqual(body["verdict"], "green", body)
        self.assertIn(f"c1.log: E_RUN_LOG_FETCH: its source {self.settings.client_driver_log} is not there (log fetch)", body["notes"])
        self.assertNotIn("c1.log", body["artifacts"])
        copies = [c for c in pve.calls if c[0] == "exec" and f"[IO.File]::Create('C:\\sky-lab\\{run_id}-c1.log')" in " ".join(c[2])]
        self.assertEqual(len(copies), 1, "no try repeated")
        self.assertIn("if (-not (Test-Path -LiteralPath $src)) { Write-Output ('missing ' + $src); exit 0 }", " ".join(copies[0][2]))

    def test_a_seat_whose_guest_agent_is_not_running_skips_its_other_log_fetches(self):
        """Each log's copy would spend its three tries on an agent only a restart brings back, about 75 s a seat (the
        fresh review of e8d8de9b): once a fetch finds the seat's guest agent not running, its other log fetches this run
        are skipped with one note, the SKSE folder's too."""
        from labapi.proxmox import ProxmoxError

        pve = self._managed_c1()
        plain_exec = pve.exec

        def exec_(guest, command, timeout):
            if "[IO.File]::Open($src, 'Open', 'Read', 'ReadWrite')" in " ".join(command):
                pve.calls.append(("exec", guest.vmid, tuple(command)))
                raise ProxmoxError(f"E_PVE_EXEC: {guest.name}: ResourceException: 500 Internal Server Error: QEMU guest agent is not running")
            return plain_exec(guest, command, timeout)

        pve.exec = exec_
        run_id, body = self._run(SOLO_WITH_LOG)
        self.assertEqual(body["verdict"], "green", body)
        fetch_notes = [n for n in body["notes"] if n.endswith("(log fetch)")]
        self.assertEqual(len(fetch_notes), 2, body["notes"])
        self.assertTrue(fetch_notes[0].startswith("c1.log: E_RUN_LOG_FETCH: its copy failed three tries 10 s apart, the last "
                                                  "E_PVE_EXEC: fake-c1: ResourceException: 500 Internal Server Error: QEMU guest "
                                                  "agent is not running"), fetch_notes)
        self.assertTrue(fetch_notes[1].startswith("c1-driver.log and c1's other logs after it not fetched: its guest agent was "
                                                  "found not running ("), fetch_notes)
        copies = [c for c in pve.calls if c[0] == "exec" and "[IO.File]::Open($src, 'Open', 'Read', 'ReadWrite')" in " ".join(c[2])]
        self.assertEqual(len(copies), 3, "c1.log's three tries, and no copy for the logs after it")
        self.assertFalse([c for c in pve.calls if c[0] == "exec" and "-Filter '*.log'" in " ".join(c[2])], "nor the SKSE folder's listing")
        self.assertNotIn("c1.log", body["artifacts"])

    def _busy_copies(self, refusals):
        """c1 managed, its guest control as patient with a busy agent as the lab's (Settings.agent_busy_s) on a clock
        the test moves, and its log copies refused `refusals` times by Proxmox's busy answer, every copy counted."""
        from labapi.proxmox import ProxmoxError

        pve = self._managed_c1()
        pve.files[self.settings.client_driver_log] = "platform log\n"
        plain_exec = pve.exec
        left = {"n": refusals}

        def exec_(guest, command, timeout):
            if "[IO.File]::Open($src, 'Open', 'Read', 'ReadWrite')" in " ".join(command):
                pve.calls.append(("copy", guest.vmid))
                if left["n"]:
                    left["n"] -= 1
                    raise ProxmoxError(f"E_PVE_EXEC: {guest.name}: ResourceException: 500 Internal Server Error: QEMU guest "
                                       "agent is not running")
            return plain_exec(guest, command, timeout)

        pve.exec = exec_
        self.services.control._busy_s = 30.0
        return pve, _moved_clock()

    def test_a_busy_agent_that_answers_within_its_window_silences_nothing(self):
        """core's host journal, 2026-11-12: "QEMU guest agent is not running" is a busy agent's answer, daily on both
        seats, and the rule of 58502b08 skipped a seat's later log fetches on its first. Every agent call is now asked
        again while the agent is busy (GuestControl._agent): a copy refused twice runs at its third ask, every log comes
        back, and no seat is marked."""
        from unittest import mock

        from labapi import proxmox

        pve, clock = self._busy_copies(2)
        with mock.patch.object(proxmox, "time", clock):
            run_id, body = self._run(SOLO_WITH_LOG)
        self.assertEqual(body["verdict"], "green", body)
        self.assertEqual((self.tmp / "results" / run_id / "c1.log").read_text(encoding="utf-8"), "platform log\n")
        self.assertFalse([n for n in body["notes"] if "not running" in n], body["notes"])
        self.assertEqual(clock.slept, [1.0, 2.0])
        self.assertEqual(len([c for c in pve.calls if c[0] == "copy"]), 5, "c1.log's three asks, then its two other logs'")
        self.assertEqual(self.services.runner.runs[run_id].agents_down, {})

    def test_a_busy_agent_past_its_window_still_skips_the_seats_other_log_fetches(self):
        """The rule of 58502b08 stands for an agent still busy past its window: c1.log's copy is asked again for
        agent_busy_s (six asks, 30 s), and its try is not tried again, where each of three tries got a window of its own
        (18 asks, the fresh review of 5771141b, finding 2); then the seat's other log fetches are skipped, with one
        note."""
        from unittest import mock

        from labapi import proxmox

        pve, clock = self._busy_copies(100)
        with mock.patch.object(proxmox, "time", clock):
            run_id, body = self._run(SOLO_WITH_LOG)
        self.assertEqual(body["verdict"], "green", body)
        fetch_notes = [n for n in body["notes"] if n.endswith("(log fetch)")]
        self.assertEqual(len(fetch_notes), 2, body["notes"])
        self.assertTrue(fetch_notes[0].startswith("c1.log: E_RUN_LOG_FETCH: its copy: its agent stayed busy, not tried again: "
                                                  "E_PVE_EXEC: fake-c1: ResourceException: 500 Internal Server Error: QEMU "
                                                  "guest agent is not running (still busy after 6 tries over 30 s)"), fetch_notes)
        self.assertTrue(fetch_notes[1].startswith("c1-driver.log and c1's other logs after it not fetched: its guest agent was "
                                                  "found not running ("), fetch_notes)
        self.assertEqual(len([c for c in pve.calls if c[0] == "copy"]), 6, "c1.log's one try, six asks")
        self.assertEqual(clock.slept, [1.0, 2.0, 4.0, 8.0, 15.0])

    def test_a_log_copy_past_the_cap_is_refused_before_its_first_read(self):
        """A runaway log cannot hold up the run's end: a copy past FETCH_MAX_BYTES is refused before any range is read,
        a note naming its size, E_RUN_LOG_FETCH the runner's own code, and the copy leaves the seat."""
        from labapi.proxmox import ExecResult
        from labapi.runner import FETCH_MAX_BYTES

        pve = self._managed_c1()
        pve.files[self.settings.client_driver_log] = "platform log\n"
        big = FETCH_MAX_BYTES + 1
        _log_copy_answers(pve, lambda guest, res: ExecResult(0, f"{big} {big}\r\n", ""), copy=r"C:\\sky-lab\\[^']+-c1\.log")
        run_id, body = self._run(SOLO_WITH_LOG)
        self.assertEqual(body["verdict"], "green", body)
        self.assertIn(f"c1.log: E_RUN_LOG_FETCH: its copy is {big} bytes, past the {FETCH_MAX_BYTES} "
                      f"({FETCH_MAX_BYTES // (1024 * 1024)} MiB) a fetch reads (log fetch)", body["notes"])
        self.assertNotIn("c1.log", body["artifacts"])
        copy = f"C:\\sky-lab\\{run_id}-c1.log"
        self.assertFalse([c for c in pve.calls if c[:3] == ("file_read_range", 901, copy)])
        self.assertNotIn(copy, pve.files)

    def test_a_log_copy_whose_exec_answer_was_lost_is_a_note(self):
        """log-count's rule for a log too: only the copy exec's own "N M" proves a copy whole, so a copy whose answer the
        agent lost is not kept as the log, a note naming E_RUN_LOG_FETCH and "(log fetch)", the verdict as it was (the
        final check of 7ebf12a7)."""
        from labapi.proxmox import ProxmoxError

        pve = self._managed_c1()
        pve.files[self.settings.client_driver_log] = "platform log\n"

        def lost(guest, res):
            raise ProxmoxError(f"E_PVE_EXEC_LOST: pid 42 on {guest.name}: the guest agent no longer knows it; the command "
                               "ended and its answer is lost")

        _log_copy_answers(pve, lost, copy=r"C:\\sky-lab\\[^']+-c1\.log")
        run_id, body = self._run(SOLO_WITH_LOG)
        self.assertEqual(body["verdict"], "green", body)
        self.assertEqual(body["failures"], [])
        self.assertIn("c1.log: E_RUN_LOG_FETCH: its copy's exec answer was lost, so the copy is unchecked (log fetch)", body["notes"])
        self.assertNotIn("c1.log", body["artifacts"])
        self.assertFalse([c for c in pve.calls if c[:3] == ("file_read_range", 901, f"C:\\sky-lab\\{run_id}-c1.log")])



@needs_deps
def _uncaptured_curl(script, run):
    """What a seat printed before its script's JSON when the script left the upload's curl.exe uncaptured: lab-api's
    answer, which ends in no newline, so the two shared one line (20261112-125536's c1: "crash check c1: no answer
    ({"ok":true,...}{"games": ...")). Nothing once every curl.exe call in the script is captured."""
    if not re.search(r'^\s*&\s*"\$env:SystemRoot\\System32\\curl\.exe"', script, re.M):
        return ""
    return json.dumps({"ok": True, "client": "c1", "run": run, "bytes": 14}, separators=(",", ":"))


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
            return ExecResult(0, _uncaptured_curl(script, run) + '{"dumped": true, "pid": 4242, "bytes": 14, "dump_ms": 1, "upload_ms": 1, "curl": 0}\r\n', "")

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
                return ExecResult(0, _uncaptured_curl(script, run) + json.dumps(answer) + "\r\n", "")
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
        self.assertEqual(errors[1], f"E_RUN_GAME_LOST: c1's game ({self.WAS}) was not running at the run's end; "
                                    "CrashLogger wrote no log for pid 4242")
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
                         [f"E_RUN_GAME_REPLACED: c1's game was {self.WAS} at the version check and {now} at the run's end; "
                          "CrashLogger wrote no log for pid 4242"])
        self.assertIn("c1-launch.log", body["artifacts"])

    # CrashLogger's log as c1 wrote it on 2026-11-05 (20261105-152648's c1-crash-2026-11-05-07-27-25.log, cut down and
    # moved onto WAS: the seat's clock seven hours behind UTC, the game up 14 s), a system frame put before the plugin's
    CRASH_LOG = (
        "CRASH TIME: 2026-10-17 15:00:14\nSkyrim SSE v1.6.1170\nCrashLoggerSSE v1-24-0-0 Jun 28 2026 00:14:22\n\n"
        'Unhandled exception "EXCEPTION_ACCESS_VIOLATION" at 0x7FF76E39D242 SkyrimSE.exe+02AD242\tmov rax, [rcx]\n'
        "Exception Flags: 0x00000000 (Continuable)\n\nPROCESS INFO:\n\tProcess ID: 4242\n\tCrash Thread ID: 5056\n"
        "\tProcess Uptime: 00:00:14 (14000ms)\n\nCALL STACK ([P]robable / [S]tack scan):\n"
        "\t[ 0][P] 0x7FF76E39D242      SkyrimSE.exe+02AD242 -> 18789+0x162\tmov rax, [rcx]\n"
        "\t[ 1][P] 0x7FFF5A15E8D7      KERNEL32.DLL+002E8D7\n"
        "\t[ 2][P] 0x7FFEDD87B2D8 SkyrimSoulsRE.dll+003B2D8\tmov rcx, [rsp+0x38] |  C:\\repos\\SkyrimSoulsRE\\src\\Menus\\MapMenuEx.cpp:391\n"
        "\t[ 3][S] 0x7FF76E5ED9D3      SkyrimSE.exe+04FD9D3 -> 31577+0x63\tnop\n")

    def _crash_logs(self, logs):
        pve = self.services.control._b
        for name, text in logs.items():
            pve.skse_logs.append(name)
            pve.files[f"C:\\sky-lab\\c1-{name}"] = text

    def test_the_lost_games_crash_logger_log_names_its_crash(self):
        # c1's terrain-upgrade race at the initial load, nine times since 11-01, each a bare E_RUN_GAME_REPLACED before
        now = "5151@2026-10-17T22:00:40.0000000Z"
        self._seat({"games": [now], "dumps": [], "curl": -1})
        self._crash_logs({"crash-2026-10-17-15-00-14.log": self.CRASH_LOG})
        run_id, body = self._run(self.RUN)
        self.assertEqual(body["verdict"], "error", body)
        self.assertEqual([f["error"] for f in body["failures"]],
                         [f"E_RUN_GAME_REPLACED: c1's game was {self.WAS} at the version check and {now} at the run's end; "
                          "its crash in c1-crash-2026-10-17-15-00-14.log: EXCEPTION_ACCESS_VIOLATION at SkyrimSE.exe+02AD242 "
                          "(18789+0x162), 14000 ms after its start, through SkyrimSoulsRE.dll+003B2D8"])
        self.assertIn("c1-crash-2026-10-17-15-00-14.log", body["artifacts"])

    def test_a_reused_pids_older_log_is_not_the_lost_games(self):
        # a rolled-back seat can start its game under a pid an older crash log already names: its start, the log's
        # time less its uptime, must sit a whole number of quarter hours from the game's
        self._seat({"games": [], "dumps": [], "curl": -1})
        self._crash_logs({"crash-2026-10-17-14-57-00.log": self.CRASH_LOG.replace("15:00:14", "14:57:00"),
                          "crash-2026-10-12-09-13-51.log": self.CRASH_LOG.replace("2026-10-17 15:00:14", "2026-10-12 09:13:51")})
        run_id, body = self._run(self.RUN)
        self.assertEqual([f["error"] for f in body["failures"]],
                         [f"E_RUN_GAME_LOST: c1's game ({self.WAS}) was not running at the run's end; CrashLogger wrote no log for pid 4242"])
        from labapi.runner import crash_logger_signature
        self.assertEqual(crash_logger_signature(self.tmp, "c1", "unreadable"), "no CrashLogger log read ('unreadable' is no pid and start)")

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

    def test_a_box_over_a_running_world_is_no_pause(self):
        # Skyrim Souls RE unpauses the box: the seat's game days move between two reads, so the assert measures
        self.doubles.menus["c1"] = ["HUD Menu", "MessageBoxMenu"]
        self.doubles.days["c1"], self.doubles.day_step["c1"] = 1.5, 0.0002
        run_id, body = self._run(self.TWO + "  - assert:\n      - c1.sees(c2) == true\n")
        self.assertFalse([f for f in body["failures"] if f["kind"] == "paused"], body["failures"])

    def test_a_box_over_a_standing_world_is_a_pause(self):
        self.doubles.menus["c1"] = ["HUD Menu", "MessageBoxMenu"]
        self.doubles.days["c1"], self.doubles.day_step["c1"] = 1.5, 0.0
        run_id, body = self._run(self.TWO + "  - assert:\n      - c1.sees(c2) == true\n")
        self.assertEqual(body["verdict"], "red", body)
        self.assertEqual(body["failures"][0]["kind"], "paused", body["failures"])

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

    def test_a_box_over_a_seat_at_its_connect_is_closed_and_noted(self):
        # a mod's start-up box (x-body-release 20261025-235731's "SKSE is not loaded"): closed after the connect, so
        # the run measures; one that will not close stays, said in the notes, and the assert's guard still fails it
        import dataclasses

        self.services.runner.s = dataclasses.replace(self.settings, clear_start_box=True, start_box_wait_s=0.0)
        self.doubles.menus["c1"] = ["Cursor Menu", "HUD Menu", "MessageBoxMenu"]
        self.doubles.closable.add("c1")
        run_id, body = self._run(self.TWO + "  - assert:\n      - c1.sees(c2) == true\n")
        self.assertEqual(body["verdict"], "green", body)
        self.assertIn(("c1", "close-menu", {"name": "MessageBoxMenu"}), self.doubles.seen)
        self.assertTrue(any("c1 had a message box over its game after its connect" in n and "closed it" in n for n in body["notes"]), body["notes"])
        self.doubles.menus["c1"] = ["HUD Menu", "MessageBoxMenu"]
        self.doubles.closable.clear()
        run_id, body = self._run(self.TWO + "  - assert:\n      - c1.sees(c2) == true\n")
        self.assertEqual(body["verdict"], "red", body)
        self.assertEqual([(f["kind"], f["client"]) for f in body["failures"]], [("paused", "c1")])
        self.assertTrue(any("it stayed after a close" in n for n in body["notes"]), body["notes"])

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
        # while the game runs (run 20261006-183431); the copy comes back in
        # ranges (Runner._read_back), this short one in one
        copies = [i for i, c in enumerate(pve.calls) if c[:2] == ("exec", 901) and any(out in a and "ReadWrite" in a for a in c[2])]
        reads = [i for i, c in enumerate(pve.calls) if c[:3] == ("file_read_range", 901, out + ".copy")]
        rollback = next(i for i, c in enumerate(pve.calls) if c[:2] == ("rollback", 901))
        self.assertEqual(len(copies), 1, pve.calls)
        self.assertEqual(len(reads), 1, pve.calls)  # once, though started twice
        self.assertLess(copies[0], reads[0])
        self.assertLess(reads[0], rollback)
        self.assertEqual(runner.frida_started, [])
        self.assertFalse([n for n in body.get("notes", []) if "frida" in n], body.get("notes"))

    def _hand_trace(self, script, log):
        """c1 managed, and a trace `script` started on it by hand (POST /lab/frida's record) whose .log holds `log`."""
        from labapi.guests import Guest

        self.services.tables.guests["fake-c1"] = Guest("fake-c1", 901, "127.0.0.1", "qemu", "client", True, "clean-sp", "c1")
        pve = self.services.control._b
        pve.files[f"C:\\sky-lab\\frida\\{script}.log"] = log
        self.services.runner.frida_started.append(("c1", script))
        return pve

    def test_a_trace_larger_than_a_range_comes_back_byte_exact(self):
        """20261111-191642-x-prop-blast: prop-impulse.js's large .log, read whole, timed out on both seats. The copy
        comes back through Proxmox's own ranged file-reads of READ_RANGE_BYTES, the last range short and asked for
        exactly, joined as bytes and decoded once, so a range boundary inside a multibyte character splits nothing."""
        from labapi.runner import READ_RANGE_BYTES as R

        # an é across the first boundary (its bytes at R - 1 and R), a € across the second (2R - 2 to 2R)
        log = "a" * (R - 1) + "é" + "b" * (R - 3) + "€" + "c" * 10 + "\n"
        self.assertEqual(len(log.encode("utf-8")), 2 * R + 12)
        pve = self._hand_trace("big-trace.js", log)
        run_id, body = self._run(SOLO_WITH_LOG)
        self.assertEqual(body["verdict"], "green", body)
        got = (self.tmp / "results" / run_id / "frida" / "c1-big-trace.js.before-run.jsonl").read_bytes()
        self.assertEqual(got, log.encode("utf-8"))
        copy = "C:\\sky-lab\\frida\\big-trace.js.log.copy"
        ranges = [c[3:] for c in pve.calls if c[:3] == ("file_read_range", 901, copy)]
        self.assertEqual(ranges, [(0, R), (R, R), (2 * R, 12)])
        # no slice exec and no .b64 file: the agent reads the copy itself
        self.assertFalse([c for c in pve.calls if c[0] == "file_read" and c[2].startswith(copy)], pve.calls)
        self.assertFalse([n for n in body.get("notes", []) if "frida" in n], body.get("notes"))

    def test_the_copy_leaves_the_seat_once_read(self):
        """A copy the agent read is a file it can hold open (x-quest-mode 20261030-131512's .js.log.copy cost a
        rollback; after x-prop-blast's timed-out reads the relaunches' held count grew 11, 17, 25): once read, the copy
        goes by one guest exec, after its last range's read."""
        from labapi.runner import READ_RANGE_BYTES as R

        pve = self._hand_trace("big-trace.js", "x" * (R + 1) + "\n")
        run_id, body = self._run(SOLO_WITH_LOG)
        self.assertEqual(body["verdict"], "green", body)
        copy = "C:\\sky-lab\\frida\\big-trace.js.log.copy"
        # the script's own .log is the relaunch cleaning's; the .out's empty copy went the same way
        self.assertEqual([p for p in pve.files if p.startswith("C:\\sky-lab\\frida\\big-trace.js.")], ["C:\\sky-lab\\frida\\big-trace.js.log"])
        removals = [i for i, c in enumerate(pve.calls) if c[:2] == ("exec", 901) and "Remove-Item" in " ".join(c[2]) and copy in " ".join(c[2])]
        self.assertEqual(len(removals), 1, pve.calls)
        self.assertIn(f"Remove-Item -LiteralPath '{copy}' -Force", " ".join(pve.calls[removals[0]][2]))
        last_read = max(i for i, c in enumerate(pve.calls) if c[:3] == ("file_read_range", 901, copy))
        self.assertLess(last_read, removals[0])
        self.assertFalse([n for n in body.get("notes", []) if "frida" in n], body.get("notes"))

    def test_a_trace_started_by_hand_not_fetched_whole_is_a_note(self):
        """A trace started by hand (POST /lab/frida) is no run's evidence: no step of the run started it, and a rerun
        would not start it again, so a run that fetches it keeps its verdict and says in a note what was not read,
        before its rollback (c1, in the run: a copy shorter than its length) or at its end (c2, a seat it does not
        play: a copy past the cap, refused before its first read)."""
        from labapi.guests import Guest
        from labapi.proxmox import ExecResult
        from labapi.runner import FETCH_MAX_BYTES

        pve = self._hand_trace("hand-trace.js", '{"leak": 1}\n')
        self.services.tables.guests["fake-c2"] = Guest("fake-c2", 902, "127.0.0.1", "qemu", "client", True, "clean-sp", "c2")
        pve.files["C:\\sky-lab\\frida\\hand-two.js.log"] = '{"leak": 2}\n'
        self.services.runner.frida_started.append(("c2", "hand-two.js"))
        _log_copy_answers(pve, lambda guest, res: ExecResult(0, "12 14\r\n", "") if guest.vmid == 901
                          else ExecResult(0, f"{FETCH_MAX_BYTES + 1} {FETCH_MAX_BYTES + 1}\r\n", ""))
        run_id, body = self._run(SOLO_WITH_LOG)
        self.assertEqual(body["verdict"], "green", body)
        self.assertEqual(body["failures"], [])
        for note in ("frida hand-trace.js.log on c1 (fake-c1) not fetched whole: 12 bytes read of its 14: range 1 of 1, "
                     "at 0, came back 12 of its 14",
                     f"frida hand-two.js.log on c2 (fake-c2) not fetched whole: its copy is {FETCH_MAX_BYTES + 1} bytes, "
                     f"past the {FETCH_MAX_BYTES} ({FETCH_MAX_BYTES // (1024 * 1024)} MiB) a fetch reads"):
            self.assertIn(note, body["notes"])
        self.assertFalse([c for c in pve.calls if c[:3] == ("file_read_range", 902, "C:\\sky-lab\\frida\\hand-two.js.log.copy")])
        for name in ("frida/c1-hand-trace.js.before-run.jsonl", "frida/c2-hand-two.js.jsonl"):
            self.assertIn(name, body["artifacts"])
        self.assertEqual(self.services.runner.frida_started, [])

    def test_a_copy_held_on_a_seat_outside_the_run_is_a_note_and_leaves_that_seat_be(self):
        """A hand trace the run's end fetches on a seat the run does not play: a copy its agent then holds open past the
        window was that seat's to clear through its remembered state (the re-review of 5b982dc6, nit 5); now it is the
        run's note, naming the seat, and the seat's next reset removes it, so its state is left as it was and the run's
        verdict stands."""
        from labapi.guests import Guest
        from labapi.proxmox import ExecResult
        from labapi.runner import SeatState

        pve = self.services.control._b
        self.services.tables.guests["fake-c2"] = Guest("fake-c2", 902, "127.0.0.1", "qemu", "client", True, "clean-sp", "c2")
        self.services.runner.seats["c2"] = SeatState(since_rollback=1)
        pve.files["C:\\sky-lab\\frida\\hand-two.js.log"] = '{"leak": 2}\n'
        self.services.runner.frida_started.append(("c2", "hand-two.js"))
        plain_exec = pve.exec

        def exec_(guest, command, timeout):
            if re.search(r"Remove-Item -LiteralPath '[^']+hand-two\.js\.log\.copy' -Force", " ".join(command)):
                pve.calls.append(("exec", guest.vmid, tuple(command)))
                return ExecResult(0, "True\r\n", "")  # still there: the agent holds it
            return plain_exec(guest, command, timeout)

        pve.exec = exec_
        run_id, body = self._run(SOLO_WITH_LOG)
        self.assertEqual(body["verdict"], "green", body)
        held = _held_note("frida hand-two.js.log", "C:\\sky-lab\\frida\\hand-two.js.log.copy", seat="c2 (fake-c2)")
        self.assertTrue([n for n in body["notes"] if re.fullmatch(held, n)], body["notes"])
        self.assertEqual(self.services.runner.seats["c2"].force, "")
        self.assertIn("frida/c2-hand-two.js.jsonl", body["artifacts"])


def _held_note(what, path, seat="c1 (fake-c1)", tries=8, last="the last once the agent answered a ping", taken=""):
    """Runner._held's note for a file still there past its removal's window, as a regex: its tries and their whole span,
    which the runner's clock measures, then how the window ended; `taken` the reason a file only taken as held carries."""
    how = rf"{tries} {'try' if tries == 1 else 'tries'} over \d+\.\d s, {re.escape(last)}"
    if taken:
        return (re.escape(f"{what}: {path} on {seat} taken as held open in the agent, its read having failed (") + how
                + re.escape(f"; {taken}); left to the seat's next reset"))
    return (re.escape(f"{what}: {path} on {seat} held open in the agent after its read (") + how
            + re.escape("); left to the seat's next reset"))


def _moved_clock():
    """proxmox.py's time as a clock a test moves: sleep() records its pause and moves monotonic() by it, so
    GuestControl's patience with a busy agent (_agent) spends no real time."""
    import types

    clock = types.SimpleNamespace(t=0.0, slept=[])

    def sleep(s):
        clock.slept.append(s)
        clock.t += s

    clock.monotonic, clock.sleep = (lambda: clock.t), sleep
    return clock


def _log_copy_answers(pve, answer, copy=r"[^']+\.js\.log\.copy"):
    """A copy exec on the fake seat answering `answer(guest, the fake's own answer)`, a trace's .log copy unless `copy`
    (a regex) names another, every other exec as the fake answers it: a seat whose copy reports another length than the
    bytes it holds."""
    plain_exec = pve.exec

    def exec_(guest, command, timeout):
        res = plain_exec(guest, command, timeout)
        if re.search(r"\[IO\.File\]::Create\('" + copy + r"'\)", " ".join(command)):
            return answer(guest, res)
        return res

    pve.exec = exec_


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
    def _managed_c1(self, raise_with, png=b"\x89PNG shot"):
        """c1 managed; its screenshot helper writes the shot's .b64 (of `png`), then the exec raises `raise_with`."""
        from labapi.guests import Guest

        self.services.tables.guests["fake-c1"] = Guest("fake-c1", 901, "127.0.0.1", "qemu", "client", True, "clean-sp", "c1")
        pve = self.services.control._b
        real = pve.exec
        self.png = png

        def exec_(guest, command, timeout):
            # the helper's own exec (it starts sky-lab-screenshot), not the sidecar's length or removal, which name it too
            m = re.search(r"'([^']+\.png)\.b64'", " ".join(command))
            if not m or "sky-lab-screenshot" not in " ".join(command):
                return real(guest, command, timeout)
            pve.files[m.group(1) + ".b64"] = base64.b64encode(self.png).decode()
            if raise_with is None:
                from labapi.proxmox import ExecResult

                return ExecResult(0, "", "")
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

    def test_a_shot_past_one_range_comes_back_whole_and_its_sidecar_leaves_the_seat(self):
        """A whole agent file-read past about 1 MiB is unreliable on a busy seat (numidium's measure: a 1.46 MB console
        copy timed out three times in a row on c1, and 512 KiB ranges took it whole in 4 s; 195437 lost three shots at
        23 s each): the shot's .b64 sidecar comes back in ranges, joined and decoded once, and leaves the seat once
        read."""
        from labapi.runner import READ_RANGE_BYTES as R

        png = bytes(range(256)) * 2500  # 640,000 bytes, a sidecar of 853,336, two ranges
        self._managed_c1(None, png=png)
        pve = self.services.control._b
        run_id, body = self._run(SHOT)
        self.assertEqual(body["verdict"], "green", body)
        shot, pngs = self._shot(run_id, body)
        self.assertEqual([p.read_bytes() for p in pngs], [png])
        self.assertEqual(shot["note"], pngs[0].name)
        sidecar = next(c[2] for c in pve.calls if c[0] == "file_read_range")
        self.assertTrue(sidecar.endswith(".png.b64"), sidecar)
        n = len(base64.b64encode(png))
        self.assertEqual([c[3:] for c in pve.calls if c[:3] == ("file_read_range", 901, sidecar)], [(0, R), (R, n - R)])
        self.assertFalse([c for c in pve.calls if c[0] == "file_read" and c[2].endswith(".png.b64")], "no whole read")
        self.assertNotIn(sidecar, pve.files, "the sidecar leaves the seat once read")

    def test_a_sidecar_range_still_unread_is_the_steps_note(self):
        """A shot not read is the step's note, never the run's fault: a range of its sidecar still unread after
        file_read_range's own retries skips the shot, and the sidecar still leaves the seat."""
        from unittest import mock

        from labapi import proxmox
        from labapi.proxmox import ProxmoxError
        from labapi.runner import READ_RANGE_BYTES as R

        self._managed_c1(None, png=bytes(range(256)) * 2500)
        pve = self.services.control._b
        plain_range = pve.file_read_range

        def file_read_range(guest, path, offset, count):
            if path.endswith(".png.b64") and offset == R:
                pve.calls.append(("file_read_range", guest.vmid, path, offset, count))
                raise ProxmoxError(f"E_PVE_FILE: {guest.name}: ResourceException: 500 Internal Server Error: VM {guest.vmid} "
                                   "qga command 'guest-file-read' failed - got timeout")
            return plain_range(guest, path, offset, count)

        pve.file_read_range = file_read_range
        with mock.patch.object(proxmox, "FILE_READ_PAUSES", (0.0, 0.0)):
            run_id, body = self._run(SHOT)
        self.assertEqual(body["verdict"], "green", body)
        self.assertEqual(body["failures"], [])
        shot, pngs = self._shot(run_id, body)
        self.assertEqual(pngs, [])
        self.assertTrue(shot["note"].startswith("screenshot skipped: range 2 of 2: E_PVE_FILE: fake-c1: ResourceException:"), shot)
        self.assertFalse([p for p in pve.files if p.endswith(".png.b64")], "the sidecar leaves the seat whatever the read did")

    def _held_sidecars(self):
        """Every shot sidecar's removal answered still there, as an agent holding it answers; the file stays."""
        from labapi.proxmox import ExecResult

        pve = self.services.control._b
        inner = pve.exec

        def exec_(guest, command, timeout):
            joined = " ".join(command)
            if "Remove-Item -LiteralPath '" in joined and ".png.b64' -Force" in joined:
                pve.calls.append(("exec", guest.vmid, tuple(command)))
                return ExecResult(0, "True\r\n", "")  # still there: the agent holds it
            return inner(guest, command, timeout)

        pve.exec = exec_
        return pve

    def test_a_sidecar_held_past_its_removals_window_is_a_note_and_no_fault(self):
        """c1's shot 076 at 20261112-081535 and c2's 056 at 101523: a sidecar a busy agent held through four removals a
        second apart faulted its seat, a rollback at its next run. A sidecar still there past the window is the run's
        note, naming the file and its seat, and no fault; the shot is kept and the verdict is as it was (_held, which a
        burst's one removal shares). The sidecar carries its run's name, so the next reset takes it unread."""
        self._managed_c1(None)
        self._held_sidecars()
        run_id, body = self._run(SHOT)
        self.assertEqual(body["verdict"], "green", body)
        shot, pngs = self._shot(run_id, body)
        self.assertEqual([p.read_bytes() for p in pngs], [b"\x89PNG shot"])
        i = shot["index"]
        held = _held_note(f"screenshot {i:03d}-c1", f"C:\\sky-lab\\shots\\{run_id}-{i:03d}.png.b64")
        self.assertTrue([n for n in body["notes"] if re.fullmatch(held, n)], body["notes"])
        self.assertEqual(self.services.runner.seats["c1"].force, "")

    def test_a_sidecar_left_held_is_never_read_as_the_next_runs_shot(self):
        """A held sidecar stays on the seat until its next reset, and a shot whose helper's answer was lost is read from
        its file: under one name an index, the next run's shot at that index read the last run's sidecar as its own.
        Each run's shots carry its run, so the next run reads its own name, which its helper never wrote: no shot, the
        step's note, and the leftover unread."""
        from labapi.proxmox import ProxmoxError

        self._managed_c1(None)
        pve = self._held_sidecars()
        run1, body1 = self._run(SHOT)
        self.assertEqual(body1["verdict"], "green", body1)
        left = [p for p in pve.files if p.endswith(".png.b64")]
        self.assertEqual(len(left), 1, pve.files)
        self.assertIn(run1, left[0])
        held_exec = pve.exec

        def exec_(guest, command, timeout):
            if "sky-lab-screenshot" in " ".join(command):
                raise ProxmoxError("E_PVE_EXEC_LOST: pid 7 on fake-c1: the guest agent no longer knows it")  # nothing written
            return held_exec(guest, command, timeout)

        pve.exec = exec_
        del pve.calls[:]
        run2, body2 = self._run(SHOT)
        self.assertEqual(body2["verdict"], "green", body2)
        shot, pngs = self._shot(run2, body2)
        self.assertEqual(pngs, [], "the last run's sidecar is never this run's shot")
        self.assertTrue(shot["note"].startswith("screenshot skipped: "), shot)
        self.assertIn(f"{run2}-{shot['index']:03d}.png.b64 is not there", shot["note"])
        self.assertFalse([c for c in pve.calls if c[0] == "file_read_range" and c[2] == left[0]], "the leftover unread")



BURST = """
id: burst
clients: [c1]
server: {snapshot: clean}
timeout_s: 30
steps:
  - c1: connect
  - c1: screenshot {count: 3, intervalMs: 200}
"""


@needs_deps
class BurstSteps(RunTests):
    def _managed_c1(self, answer, sidecars=3, raise_with=None):
        """c1 managed; the burst's exec writes `sidecars` frames' .b64 under the request's out, then answers
        `answer` (an ExecResult) or raises `raise_with`; the other execs pass through."""
        from labapi import burst
        from labapi.guests import Guest

        self.services.tables.guests["fake-c1"] = Guest("fake-c1", 901, "127.0.0.1", "qemu", "client", True, "clean-sp", "c1")
        pve = self.services.control._b
        real = pve.exec
        self.scripts, self.timeouts = [], []

        def exec_(guest, command, timeout):
            if "-EncodedCommand" not in command or burst.TASK not in burst.decode(command):
                return real(guest, command, timeout)
            script = burst.decode(command)
            self.scripts.append(script)
            self.timeouts.append(timeout)
            out = re.search(r"\$out = '([^']+)'", script).group(1)
            for k in range(sidecars):
                pve.files[f"{out}\\{k:03d}.png.b64"] = base64.b64encode(f"PNG frame {k}".encode()).decode()
            if raise_with is not None:
                pve.files[r"C:\sky-lab\burst\done.json"] = answer.out
                raise raise_with
            return answer

        pve.exec = exec_

    @staticmethod
    def _done(n=3):
        frames = [{"k": k, "ms": 200 * k + 3, "file": f"{k:03d}.png"} for k in range(n)]
        return json.dumps({"count": n, "intervalMs": 200, "frames": frames, "width": 1920, "height": 1080, "at": "2026-10-22T19:40:00Z"})

    def _burst(self, run_id, body):
        step = next(s for s in body["steps"] if s["action"] == "screenshot")
        shots = self.tmp / "results" / run_id / "screenshots"
        return step, sorted(shots.glob(f"{step['index']:03d}-c1-*.png")), shots

    def _removal_answers(self, answer):
        """The burst folder's removal of its sidecars (Runner._remove_folder_try, one exec a try) answered by
        answer(guest), an ExecResult, or raising, or passed to the fake for None (which removes them all); the other
        execs pass through."""
        pve = self.services.control._b
        inner = pve.exec

        def exec_(guest, command, timeout):
            if "$stayed = @(Get-ChildItem" in " ".join(command):
                try:
                    said = answer(guest)
                except Exception:
                    pve.calls.append(("exec", guest.vmid, tuple(command)))
                    raise
                if said is not None:
                    pve.calls.append(("exec", guest.vmid, tuple(command)))
                    return said
            return inner(guest, command, timeout)

        pve.exec = exec_

    def _folder_removals(self, folder):
        """The execs the run spent removing a burst folder's sidecars: its folder-wide tries and any one-file removal."""
        pve = self.services.control._b
        execs = [" ".join(c[2]) for c in pve.calls if c[:2] == ("exec", 901)]
        return ([e for e in execs if f"$stayed = @(Get-ChildItem -LiteralPath '{folder}'" in e],
                [e for e in execs if re.search(r"Remove-Item -LiteralPath '" + re.escape(folder) + r"\\[^']+' -Force", e)])

    def test_a_burst_films_in_the_seat_s_session_and_reads_every_frame_back(self):
        from labapi import burst
        from labapi.proxmox import ExecResult

        self._managed_c1(ExecResult(0, self._done() + "\r\n", ""))
        run_id, body = self._run(BURST)
        self.assertEqual(body["verdict"], "green", body)
        step, pngs, shots = self._burst(run_id, body)
        self.assertEqual([p.read_bytes() for p in pngs], [b"PNG frame 0", b"PNG frame 1", b"PNG frame 2"])
        i = step["index"]
        self.assertEqual([p.name for p in pngs], [f"{i:03d}-c1-{k}.png" for k in range(3)])
        self.assertEqual([f["ms"] for f in json.loads((shots / f"{i:03d}-c1-burst.json").read_text())["frames"]], [3, 203, 403])
        self.assertIn("3 of 3 frames over 403 ms", step["note"], step)
        script = self.scripts[0]
        # the task is the lab user's, headless, registered with -Force at this use; the request carries the args
        self.assertIn("Register-ScheduledTask -TaskName 'sky-lab-burst'", script)
        self.assertIn("-Force", script)
        self.assertIn("conhost.exe", script)
        self.assertIn("-UserId 'lab' -LogonType Interactive", script)
        self.assertIn('"count": 3, "intervalMs": 200', script)
        self.assertIn(f"$out = 'C:\\sky-lab\\shots\\{run_id}-{i:03d}-burst'", script)
        self.assertGreaterEqual(self.timeouts[0], burst.wait_s({"count": 3, "intervalMs": 200}))

    def test_each_frames_sidecar_comes_back_in_ranges_and_leaves_the_seat(self):
        """A burst's frames come back as a plain shot's sidecar does: each frame's .b64 in ranges, its length from one
        listing of the burst's folder, decoded once joined; the folder's sidecars then leave the seat by one exec, not
        one a frame (x-npc-legs-burst's 40 frames cost 40: the check of 508697c3, nit 1)."""
        from labapi.proxmox import ExecResult

        self._managed_c1(ExecResult(0, self._done() + "\r\n", ""))
        pve = self.services.control._b
        run_id, body = self._run(BURST)
        self.assertEqual(body["verdict"], "green", body)
        step, pngs, _ = self._burst(run_id, body)
        self.assertEqual([p.read_bytes() for p in pngs], [b"PNG frame 0", b"PNG frame 1", b"PNG frame 2"])
        folder = f"C:\\sky-lab\\shots\\{run_id}-{step['index']:03d}-burst"
        self.assertEqual(sorted(c[2] for c in pve.calls if c[0] == "file_read_range"), [f"{folder}\\{k:03d}.png.b64" for k in range(3)])
        self.assertFalse([c for c in pve.calls if c[0] == "file_read" and c[2].startswith(folder)], "no whole read")
        self.assertFalse([p for p in pve.files if p.startswith(folder)], "each sidecar leaves the seat once read")
        removals = [" ".join(c[2]) for c in pve.calls if c[:2] == ("exec", 901) and "Remove-Item" in " ".join(c[2]) and folder in " ".join(c[2])]
        self.assertEqual(len(removals), 1, removals)
        self.assertIn(f"Get-ChildItem -LiteralPath '{folder}' -Filter '*.png.b64'", removals[0])
        self.assertFalse([n for n in body["notes"] if folder in n], body["notes"])

    def test_a_sidecar_that_stays_through_every_removal_try_is_a_note_and_no_fault(self):
        """Each try at the folder's sidecars is one exec for the folder (Runner._removed, _remove_folder_try): a sidecar
        still there at the four quick tries and at a try after each of the window's four pings is held open in the
        agent, a note a try before the fourth and then the held note, naming it and its seat, and no fault; the verdict
        is as it was and the frames kept."""
        from labapi.proxmox import ExecResult

        self._managed_c1(ExecResult(0, self._done() + "\r\n", ""))
        self._removal_answers(lambda guest: ExecResult(0, "001.png.b64\r\nstayed 1\r\n", ""))  # the agent holds it
        run_id, body = self._run(BURST)
        self.assertEqual(body["verdict"], "green", body)
        step, pngs, _ = self._burst(run_id, body)
        self.assertEqual(len(pngs), 3)
        i = step["index"]
        folder = f"C:\\sky-lab\\shots\\{run_id}-{i:03d}-burst"
        sidecar = f"{folder}\\001.png.b64"
        notes = [n for n in body["notes"] if sidecar in n]
        self.assertEqual(notes[:-1], [f"screenshot burst {i:03d}-c1 frame 1: {sidecar} still there at its removal's try {k} of "
                                      "4, tried again in 1 s" for k in (1, 2, 3)])
        self.assertRegex(notes[-1], "^" + _held_note(f"screenshot burst {i:03d}-c1 frame 1", sidecar) + "$")
        self.assertEqual(self.services.runner.seats["c1"].force, "")
        folder_tries, one_file = self._folder_removals(folder)
        self.assertEqual((len(folder_tries), one_file), (8, []))

    def test_several_held_sidecars_cost_eight_folder_execs_whatever_their_count(self):
        """A try at a burst's sidecars is one exec for the whole folder, so three sidecars held through every try cost
        the burst eight execs in all, the four quick tries and one after each of the window's four pings, where a try a
        sidecar cost one folder exec and nine one-file removals, and at 40 frames 120 execs and 120 s inside a mid-run
        step (the review of b1f2ffd4, nit 1); each held sidecar still has its own notes."""
        from labapi.proxmox import ExecResult

        self._managed_c1(ExecResult(0, self._done() + "\r\n", ""))
        self._removal_answers(lambda guest: ExecResult(0, "000.png.b64\r\n001.png.b64\r\n002.png.b64\r\nstayed 3\r\n", ""))
        run_id, body = self._run(BURST)
        self.assertEqual(body["verdict"], "green", body)
        step, pngs, _ = self._burst(run_id, body)
        self.assertEqual(len(pngs), 3)
        i = step["index"]
        folder = f"C:\\sky-lab\\shots\\{run_id}-{i:03d}-burst"
        folder_tries, one_file = self._folder_removals(folder)
        self.assertEqual((len(folder_tries), one_file), (8, []))
        held = [n for n in body["notes"] if "held open in the agent" in n]
        self.assertEqual(len(held), 3, body["notes"])
        for k, note in enumerate(held):
            self.assertRegex(note, "^" + _held_note(f"screenshot burst {i:03d}-c1 frame {k}", f"{folder}\\{k:03d}.png.b64") + "$")
        self.assertEqual(len([n for n in body["notes"] if "still there at its removal's try" in n]), 9)
        self.assertEqual(self.services.runner.seats["c1"].force, "")

    def test_a_sidecar_the_folder_removal_names_and_the_next_try_removes_is_no_fault(self):
        """A sidecar the folder's removal names as stayed goes on through the one removal helper every read file's does
        (Runner._removed, a try being one exec for the folder): gone at the next try, it is no fault, one note naming
        the try (train 52's stage: a file scanned just after its write, numidium's HYPOTHESIS)."""
        from labapi.proxmox import ExecResult

        self._managed_c1(ExecResult(0, self._done() + "\r\n", ""))
        first = ["001.png.b64\r\nstayed 1\r\n"]  # a moment's hold; the next try is the fake's, which removes it
        self._removal_answers(lambda guest: ExecResult(0, first.pop(), "") if first else None)
        removed = []
        real = self.services.runner._removed

        async def spy(rec, g, attempt, whats, died, what):
            removed.append(sorted(whats))
            return await real(rec, g, attempt, whats, died, what)

        self.services.runner._removed = spy
        run_id, body = self._run(BURST)
        self.assertEqual(body["verdict"], "green", body)
        step, pngs, _ = self._burst(run_id, body)
        self.assertEqual(len(pngs), 3)
        i = step["index"]
        folder = f"C:\\sky-lab\\shots\\{run_id}-{i:03d}-burst"
        sidecar = f"{folder}\\001.png.b64"
        self.assertIn([f"{folder}\\{k:03d}.png.b64" for k in range(3)], removed)
        self.assertEqual([n for n in body["notes"] if sidecar in n],
                         [f"screenshot burst {i:03d}-c1 frame 1: {sidecar} still there at its removal's try 1 of 4, tried again in 1 s"])
        self.assertEqual(self.services.runner.seats["c1"].force, "")
        self.assertNotIn(sidecar, self.services.control._b.files)
        self.assertEqual(len(self._folder_removals(folder)[0]), 2)

    def test_a_frame_whose_read_died_is_taken_as_held_when_the_removal_confirms_nothing(self):
        """With the folder's removal unconfirmed (its exec failed), a frame whose read died goes on through the further
        tries, one exec for the folder each, as _read_back's does, and none confirming it gone, a try after each of the
        window's pings the agent answered among them, it is taken as held: the read that died is what leaves a handle
        open; the frames read whole are not. A note, and no fault."""
        from unittest import mock

        from labapi import proxmox
        from labapi.proxmox import ExecResult, ProxmoxError

        self._managed_c1(ExecResult(0, self._done() + "\r\n", ""))
        pve = self.services.control._b
        plain_range = pve.file_read_range

        def file_read_range(guest, path, offset, count):
            if path.endswith("\\002.png.b64"):
                pve.calls.append(("file_read_range", guest.vmid, path, offset, count))
                raise ProxmoxError(f"E_PVE_FILE: {guest.name}: ResourceException: 500 Internal Server Error: VM {guest.vmid} "
                                   "qga command 'guest-file-read' failed - got timeout")
            return plain_range(guest, path, offset, count)

        def lost(guest):
            raise ProxmoxError(f"E_PVE_EXEC: {guest.name}: qga command 'guest-exec' failed - got timeout")

        pve.file_read_range = file_read_range
        self._removal_answers(lost)
        with mock.patch.object(proxmox, "FILE_READ_PAUSES", (0.0, 0.0)):
            run_id, body = self._run(BURST)
        self.assertEqual(body["verdict"], "green", body)
        step, pngs, _ = self._burst(run_id, body)
        self.assertEqual(len(pngs), 2)
        self.assertIn("not read: frame 2", step["note"], step)
        i = step["index"]
        folder = f"C:\\sky-lab\\shots\\{run_id}-{i:03d}-burst"
        sidecar = f"{folder}\\002.png.b64"
        why = f"{folder}'s sidecars on fake-c1 not removed: E_PVE_EXEC: fake-c1: qga command 'guest-exec' failed - got timeout"
        held = [n for n in body["notes"] if "held open" in n]
        self.assertEqual(len(held), 1, body["notes"])
        self.assertRegex(held[0], "^" + _held_note(f"screenshot burst {i:03d}-c1 frame 2", sidecar, taken=why) + "$")
        self.assertEqual([n for n in body["notes"] if "not confirmed gone at its removal's try" in n],
                         [f"screenshot burst {i:03d}-c1 frame 2: {sidecar} not confirmed gone at its removal's try {k} of 4 "
                          f"({why}), tried again in 1 s" for k in (1, 2, 3)])
        self.assertEqual((len(self._folder_removals(folder)[0]), self._folder_removals(folder)[1]), (8, []))
        self.assertEqual(self.services.runner.seats["c1"].force, "")

    def test_a_frame_not_read_is_the_note_and_the_rest_are_kept(self):
        from labapi.proxmox import ExecResult

        self._managed_c1(ExecResult(0, self._done(), ""), sidecars=2)
        run_id, body = self._run(BURST)
        self.assertEqual(body["verdict"], "green", body)
        step, pngs, _ = self._burst(run_id, body)
        self.assertEqual(len(pngs), 2)
        self.assertIn("2 of 3 frames", step["note"], step)
        self.assertIn("not read: frame 2", step["note"], step)

    def test_a_burst_whose_exec_answer_was_lost_is_read_from_its_files(self):
        from labapi.proxmox import ExecResult, ProxmoxError

        self._managed_c1(ExecResult(0, self._done(), ""), raise_with=ProxmoxError("E_PVE_EXEC_LOST: pid 7 on fake-c1: the guest agent no longer knows it"))
        run_id, body = self._run(BURST)
        self.assertEqual(body["verdict"], "green", body)
        step, pngs, _ = self._burst(run_id, body)
        self.assertEqual(len(pngs), 3)
        self.assertIn("read from its files", step["note"], step)

    def test_a_burst_that_never_finished_is_a_note_not_a_failure(self):
        from labapi.proxmox import ExecResult

        self._managed_c1(ExecResult(3, "", "no done.json in 31 s; the task's last result 267011"), sidecars=0)
        run_id, body = self._run(BURST)
        self.assertEqual(body["verdict"], "green", body)
        step, pngs, _ = self._burst(run_id, body)
        self.assertEqual(pngs, [])
        self.assertIn("screenshot burst helper exited 3", step["note"], step)

    def test_an_unmanaged_seat_s_burst_is_skipped(self):
        run_id, body = self._run(BURST)
        self.assertEqual(body["verdict"], "green", body)
        step, pngs, _ = self._burst(run_id, body)
        self.assertEqual(pngs, [])
        self.assertIn("screenshot burst skipped: c1 is unmanaged", step["note"], step)

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

    def test_a_relaunch_sets_a_json_key_in_the_stopped_game(self):
        """npc-puppet's landing hang: skymp5-client's cellHost switch off in its settings file, read once at the
        client's start, so it is written while the game is stopped; the note carries the file as read back."""
        import base64

        from labapi.guests import Guest

        tables = self.services.tables
        tables.guests["fake-c1"] = Guest("fake-c1", 901, "127.0.0.1", "qemu", "client", True, "clean-sp", "c1")
        pve = self.services.control._b
        files = RELAUNCH.replace("  - c1: relaunch\n", "  - c1: relaunch {files: [{json: Data/Platform/Plugins/skymp5-client-settings.txt, "
                                 "key: cellHost, value: false}, {json: a.txt, key: n, value: 2.5}, {json: a.txt, key: s, value: lab}, "
                                 "{json: a.txt, key: gameData.profileId, value: 2}]}\n")
        run_id, body = self._run(files)
        self.assertEqual(body["verdict"], "green", body)
        execs = [c[2] for c in pve.calls if c[0] == "exec" and c[1] == 901]
        at = next(i for i, c in enumerate(execs) if "-EncodedCommand" in c and "ConvertFrom-Json" in base64.b64decode(c[-1]).decode("utf-16-le"))
        script = base64.b64decode(execs[at][-1]).decode("utf-16-le")
        self.assertIn("Stop-Process", script)
        self.assertIn("Data\\Platform\\Plugins\\skymp5-client-settings.txt", script)
        self.assertIn("-NotePropertyName 'cellHost' -NotePropertyValue $false -Force", script)
        self.assertIn("-NotePropertyName 'n' -NotePropertyValue 2.5 -Force", script)
        self.assertIn("-NotePropertyName 's' -NotePropertyValue 'lab' -Force", script)
        self.assertIn("ConvertTo-Json -Depth 20", script)
        # a dotted key walks down nested objects, making any that is absent, and sets the last name there
        self.assertIn("if ($null -eq $o.'gameData') { $o | Add-Member -NotePropertyName 'gameData' -NotePropertyValue ([pscustomobject]@{}) -Force }", script)
        self.assertIn("$o = $o.'gameData'", script)
        self.assertIn("$o | Add-Member -NotePropertyName 'profileId' -NotePropertyValue 2 -Force", script)
        relaunch = next(i for i, c in enumerate(execs) if "sky-lab-launch" in " ".join(c))
        self.assertLess(at, relaunch, "the file changes before the game starts again")

    def test_a_solo_relaunch_ends_in_game_without_a_login(self):
        """A solo run's game has no skymp5-client (ADR-031): the relaunch holds for the new process's poll and an
        in-game dump-state, never for the server's online list, which a solo seat never joins."""
        from labapi.guests import Guest

        tables = self.services.tables
        tables.guests["fake-c1"] = Guest("fake-c1", 901, "127.0.0.1", "qemu", "client", True, "clean-sp", "c1")
        solo = RELAUNCH.replace("server: {snapshot: clean}\n", "server: {snapshot: clean}\nsolo: true\n").replace("  - c1: connect\n", "")
        self.services.state.online = lambda client: False   # the solo seat never logs in
        run_id, body = self._run(solo)
        self.assertEqual(body["verdict"], "green", body)
        step = next(s for s in body["steps"] if s.get("action") == "relaunch")
        self.assertIn("relaunched solo", str(step.get("note")), step)

    def test_a_relaunch_until_gone_returns_while_the_game_is_down(self):
        """b-cell-host 20261021-194846: the step returns once the player is off the server's online list, so the
        scenario reads the server in the gap; the connect after it waits for the new game's login and takes its
        identity for the run's end."""
        from labapi.guests import Guest

        tables = self.services.tables
        tables.guests["fake-c1"] = Guest("fake-c1", 901, "127.0.0.1", "qemu", "client", True, "clean-sp", "c1")
        pve = self.services.control._b
        real = self.services.state.online
        reads = {"off": 0}

        def online(client):
            stopped = any(c[0] == "exec" and c[1] == 901 and "sky-lab-launch" in " ".join(c[2]) for c in pve.calls)
            if stopped and reads["off"] < 3:  # the server sees the stopped game drop, then its new game log in
                reads["off"] += 1
                return False
            return real(client)

        self.services.state.online = online
        text = RELAUNCH.replace("  - c1: relaunch\n", "  - c1: relaunch {until: gone}\n  - c1: connect\n")
        run_id, body = self._run(text)
        self.assertEqual(body["verdict"], "green", body)
        step = next(s for s in body["steps"] if s.get("action") == "relaunch")
        self.assertIn("off the server's online list", str(step.get("note")), step)
        self.assertEqual(reads["off"], 3, "the connect after it waited through the gap")
        self.assertTrue(any("c1 online after" in n for n in body.get("notes", [])), body.get("notes"))

    def test_a_relaunch_keeps_the_outgoing_games_logs(self):
        """x-host-quit: the quit game's Skyrim Platform log held D12-B's production line, and the relaunch's new game
        truncates it; every relaunch copies the outgoing game's two logs into the run first."""
        from labapi.guests import Guest

        self.services.tables.guests["fake-c1"] = Guest("fake-c1", 901, "127.0.0.1", "qemu", "client", True, "clean-sp", "c1")
        pve = self.services.control._b
        pve.files[r"C:\sky-lab\c1-relaunch-001.log"] = "[verb:cell-host] quit: the client disconnected in 12 ms\n"
        pve.files[r"C:\sky-lab\c1-relaunch-001-console.log"] = "2026-10-24T00:00:00Z [Script] tgm done\n"
        run_id, body = self._run(RELAUNCH.replace("  - c1: relaunch\n", "  - c1: relaunch {until: stopped}\n  - c1: connect\n"))
        self.assertEqual(body["verdict"], "green", body)
        self.assertIn("c1-relaunch-001.log", body["artifacts"])
        self.assertIn("c1-relaunch-001-console.log", body["artifacts"])
        run_dir = self.tmp / "results" / run_id
        self.assertIn("quit: the client disconnected", (run_dir / "c1-relaunch-001.log").read_text())
        copies = [" ".join(c[2]) for c in pve.calls if c[0] == "exec" and "[IO.File]::Open($src, 'Open', 'Read', 'ReadWrite')" in " ".join(c[2])]
        kill = next(i for i, c in enumerate(pve.calls) if c[0] == "exec" and "sky-lab-launch" in " ".join(c[2]))
        first_copy = next(i for i, c in enumerate(pve.calls) if c[0] == "exec" and "c1-relaunch-001.log" in " ".join(c[2]))
        self.assertLess(first_copy, kill, "the copy comes before the relaunch's stop and start")
        self.assertTrue(any("lab-console-logs.txt" in c and "c1-relaunch-001-console.log" in c for c in copies), copies)

    def test_a_relaunch_until_stopped_returns_at_the_kill(self):
        """b-host-kill: the step returns once the guest agent has stopped the game, with the player still on the
        server's online list, so a scenario times what follows from the kill; the connect after it takes the new
        game's identity."""
        from labapi.guests import Guest

        tables = self.services.tables
        tables.guests["fake-c1"] = Guest("fake-c1", 901, "127.0.0.1", "qemu", "client", True, "clean-sp", "c1")
        text = RELAUNCH.replace("  - c1: relaunch\n", "  - c1: relaunch {until: stopped}\n  - c1: connect\n")
        run_id, body = self._run(text)
        self.assertEqual(body["verdict"], "green", body)
        step = next(s for s in body["steps"] if s.get("action") == "relaunch")
        self.assertIn("game stopped, the server not told", str(step.get("note")), step)
        self.assertTrue(any("c1 online after" in n for n in body.get("notes", [])), body.get("notes"))

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

FRIDA_RELAUNCH = """
id: frida-relaunch
clients: [c1]
server: {snapshot: clean}
timeout_s: 30
steps:
  - c1: connect
  - c1: relaunch {frida: {script: x-trace.js}}
  - c1: dump-state
"""

FRIDA_ONE = """
id: frida-one
clients: [c1]
server: {snapshot: clean}
timeout_s: 30
steps:
  - c1: connect
  - c1: frida {script: x-trace.js}
  - c1: dump-state
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
        # every step serves its own copy with the preamble (runner.frida_script_text); params ride the first line
        variants = sorted((self.tmp / "frida" / "uploads").glob("x-trace-*.js"), key=lambda v: int(v.stem.rsplit("-", 1)[1]))
        self.assertEqual(len(variants), 2, variants)
        self.assertTrue(variants[0].read_text().startswith('globalThis.LAB_PARAMS = {"ANSWER_YES": true};'))
        self.assertFalse(variants[1].read_text().startswith("globalThis.LAB_PARAMS"))
        for v, start in zip(variants, started):
            self.assertIn(f"/frida/scripts/{v.name}", start)
            self.assertIn("new File(", v.read_text(), "the script's lines go to its own flushed .log")
            self.assertIn("heartbeat: true", v.read_text(), "a 10 s heartbeat tells a quiet trace from a lost one")
            self.assertIn(f"{v.name}.log", v.read_text())
        self.assertTrue(all("'-e'" in e for e in started), "frida-inject eternalizes the script and exits")
        # a step waits for the previous watcher, since the task drops a start while one runs (x-frida-flush)
        self.assertTrue(all(e.index("Get-ScheduledTask -TaskName sky-lab-frida") < e.index("Start-ScheduledTask") for e in started))
        # the watcher's task is registered at each use and headless, and frida-inject shares its console: no
        # window comes over the game, which keeps the foreground and its keys (x-start-box 20261026-022654)
        for e in started:
            self.assertLess(e.index("Register-ScheduledTask -TaskName sky-lab-frida"), e.index("Start-ScheduledTask"))
            self.assertIn("-Force", e)
            self.assertIn("'conhost.exe' -Argument ('--headless '", e)
            self.assertIn(f"-UserId '{self.settings.client_lab_user}'", e)
            self.assertIn("-NoNewWindow", e)
            self.assertNotIn("-WindowStyle Hidden", e)
            self.assertNotIn("sky-lab-run", e)

    def test_a_relaunch_arms_its_frida_watcher_while_the_game_is_stopped(self):
        """x-npc-napi-trace 20261022-071646: a frida step after a relaunch attached 1 s after the hang, past
        Skyrim Platform's engine; relaunch {frida} arms the watcher once the game is stopped, then starts the
        launch task with no second stop, so the watcher takes the new game at its start."""
        import base64

        from labapi.guests import Guest

        self.services.tables.guests["fake-c1"] = Guest("fake-c1", 901, "127.0.0.1", "qemu", "client", True, "clean-sp", "c1")
        pve = self.services.control._b
        run_id, body = self._run(FRIDA_RELAUNCH)
        self.assertEqual(body["verdict"], "green", body)
        execs = [c[2] for c in pve.calls if c[0] == "exec" and c[1] == 901]
        flat = [" ".join(c) for c in execs]
        stop = next(i for i, c in enumerate(execs) if "-EncodedCommand" in c and "Stop-Process" in base64.b64decode(c[-1]).decode("utf-16-le"))
        arm = next(i for i, e in enumerate(flat) if "/frida/scripts/" in e)
        start = next(i for i, e in enumerate(flat) if "Start-ScheduledTask -TaskName sky-lab-launch" in e)
        self.assertLess(stop, arm, "the game is stopped before the watcher is armed")
        self.assertLess(arm, start, "the watcher is armed before the game starts")
        self.assertNotIn("Stop-Process", flat[start], "the launch after an armed watcher stops nothing")
        self.assertTrue(any("armed before the game starts" in n for n in body["notes"]), body["notes"])

    def test_a_frida_step_needs_its_script(self):
        run_id, body = self._run(FRIDA_MISSING)
        self.assertEqual(body["verdict"], "error", body)
        self.assertIn("E_RUN_FRIDA", str(body.get("failures")))

    def test_a_hand_start_refuses_a_script_name_that_could_leave_its_quotes(self):
        """POST /lab/frida names the script it serves after the upload's file name (or a lab/frida file's), and every
        PowerShell command about it on the seat holds that name inside single quotes: a ' in it would end the quote in
        an exec that runs as SYSTEM. Only letters, digits, '.', '_' and '-' pass, not first a '.' (GET
        /lab/frida/scripts refuses that); anything else is a 400 before a file is written or the seat touched."""
        from labapi.guests import Guest

        self.services.tables.guests["fake-c1"] = Guest("fake-c1", 901, "127.0.0.1", "qemu", "client", True, "clean-sp", "c1")
        pve = self.services.control._b
        for bad in ("o'brien.js", "x'; Remove-Item C -Recurse; '.js", "two words.js", "$(whoami).js", ".hidden.js"):
            r = self.client.post("/lab/frida", data={"client": "c1"}, files={"file": (bad, b"send(1);\n", "text/javascript")})
            self.assertEqual(r.status_code, 400, (bad, r.text))
            self.assertIn("single quotes", r.json()["detail"])
        (self.tmp / "frida" / "o'brien.js").write_text("send(1);\n")
        r = self.client.post("/lab/frida", data={"client": "c1", "script": "o'brien.js"})
        self.assertEqual(r.status_code, 400, r.text)
        self.assertEqual(list((self.tmp / "frida" / "uploads").iterdir()), [])
        self.assertFalse([c for c in pve.calls if c[0] == "exec"], pve.calls)
        self.assertEqual(self.services.runner.frida_started, [])
        r = self.client.post("/lab/frida", data={"client": "c1"}, files={"file": ("prop-impulse_v1.1.js", b"send(1);\n", "text/javascript")})
        self.assertEqual(r.status_code, 200, r.text)
        (started,) = self.services.runner.frida_started
        self.assertEqual(started[0], "c1")
        self.assertTrue(re.fullmatch(r"prop-impulse_v1\.1-hand-\d{8}T\d{6}Z\.js", started[1]), started)

    def _traced_seat(self, log):
        """c1 managed, and once a frida step starts its script the script's .log on the seat holds `log` (the fake runs
        no injector), under the name the run gives the step's copy (x-trace-<run>-<step>.js)."""
        from labapi.guests import Guest

        self.services.tables.guests["fake-c1"] = Guest("fake-c1", 901, "127.0.0.1", "qemu", "client", True, "clean-sp", "c1")
        pve = self.services.control._b
        plain_exec = pve.exec

        def exec_(guest, command, timeout):
            started = re.search(r"/frida/scripts/([^'/]+\.js)'", " ".join(command))
            if started:
                pve.files[f"C:\\sky-lab\\frida\\{started.group(1)}.log"] = log
            return plain_exec(guest, command, timeout)

        pve.exec = exec_
        return pve

    def test_a_range_still_unread_after_its_retries_makes_the_run_a_lab_fault(self):
        """20261111-191642-x-prop-blast stayed green with both seats' traces unread, each failure a note. A run's own
        trace is its evidence: a range whose read still times out after file_read_range's own retries is
        E_RUN_FRIDA_FETCH, naming the script, the seat and the reason, and the run is error, which its run set reruns."""
        from unittest import mock

        from labapi import proxmox
        from labapi.proxmox import ProxmoxError
        from labapi.runner import READ_RANGE_BYTES as R

        pve = self._traced_seat("x" * (R + 10) + "\n")
        plain_range = pve.file_read_range

        def file_read_range(guest, path, offset, count):
            if path.endswith(".js.log.copy") and offset == R:
                pve.calls.append(("file_read_range", guest.vmid, path, offset, count))
                raise ProxmoxError(f"E_PVE_FILE: {guest.name}: ResourceException: 500 Internal Server Error: VM {guest.vmid} "
                                   "qga command 'guest-file-read' failed - got timeout")
            return plain_range(guest, path, offset, count)

        pve.file_read_range = file_read_range
        with mock.patch.object(proxmox, "FILE_READ_PAUSES", (0.0, 0.0)):
            run_id, body = self._run(FRIDA_ONE)
        self.assertEqual(body["verdict"], "error", body)
        script = f"x-trace-{run_id}-1.js"
        self.assertEqual(body["failures"], [{
            "step": "end", "kind": "lab", "client": "c1",
            "error": f"E_RUN_FRIDA_FETCH: {script}.log on c1 (fake-c1) not fetched whole: range 2 of 2: E_PVE_FILE: fake-c1: "
                     "ResourceException: 500 Internal Server Error: VM 901 qga command 'guest-file-read' failed - got timeout"}])
        # file_read_range's own retry, three tries in all, and none of the runner's beside it
        copy = f"C:\\sky-lab\\frida\\{script}.log.copy"
        self.assertEqual([c[3:] for c in pve.calls if c[:3] == ("file_read_range", 901, copy)], [(0, R)] + [(R, 11)] * 3)
        # the copy leaves the seat whatever the read did
        self.assertNotIn(copy, pve.files)

    def test_a_copy_that_fails_its_three_tries_makes_the_run_a_lab_fault(self):
        """The copy is tried three times 10 s apart, as the game check and log-count's copy are (an agent not answering,
        a busy agent's "got timeout", a file refused for a moment); after the third the trace is not fetched."""
        from labapi.proxmox import ExecResult, ProxmoxError

        pve = self._traced_seat('{"impulse": 1}\n')
        busy = "The process cannot access the file because it is being used by another process."
        answers = [ProxmoxError("E_PVE_EXEC: fake-c1: ResourceException: 500 Internal Server Error: QEMU guest agent is not running"),
                   ProxmoxError("E_PVE_EXEC: fake-c1: ResourceException: 500 Internal Server Error: VM 901 qga command "
                                "'guest-exec' failed - got timeout"),
                   ExecResult(1, "", busy)]

        def answer(guest, res):
            a = answers.pop(0)
            if isinstance(a, Exception):
                raise a
            return a

        _log_copy_answers(pve, answer)
        run_id, body = self._run(FRIDA_ONE)
        self.assertEqual(body["verdict"], "error", body)
        script = f"x-trace-{run_id}-1.js"
        self.assertEqual([f["error"] for f in body["failures"]],
                         [f"E_RUN_FRIDA_FETCH: {script}.log on c1 (fake-c1) not fetched whole: its copy failed three tries "
                          f"10 s apart, the last exit 1: {busy}"])
        self.assertEqual(answers, [])
        self.assertFalse([c for c in pve.calls if c[:3] == ("file_read_range", 901, f"C:\\sky-lab\\frida\\{script}.log.copy")])

    def test_a_copy_that_ran_out_its_time_is_not_tried_again(self):
        """An exec that ran to its deadline (guest_task_timeout_s, 120 s) held the agent all that time: three such
        tries and their pauses held a trace's end for up to about 760 s, so a copy that "did not exit in" its time is
        tried once (the re-review of 5b982dc6, nit 4)."""
        from labapi.proxmox import ProxmoxError

        pve = self._traced_seat('{"impulse": 1}\n')
        tries = []

        def answer(guest, res):
            tries.append(guest.vmid)
            raise ProxmoxError(f"E_PVE_EXEC: pid 42 on {guest.name} did not exit in 120.0s")

        _log_copy_answers(pve, answer)
        run_id, body = self._run(FRIDA_ONE)
        self.assertEqual(body["verdict"], "error", body)
        self.assertEqual([f["error"] for f in body["failures"]],
                         [f"E_RUN_FRIDA_FETCH: x-trace-{run_id}-1.js.log on c1 (fake-c1) not fetched whole: its copy ran out "
                          "its time, not tried again: E_PVE_EXEC: pid 42 on fake-c1 did not exit in 120.0s"])
        self.assertEqual(tries, [901])

    def test_a_copy_shorter_than_its_source_at_its_open_is_tried_again(self):
        """The sources only grow (the script's .log is opened 'a', frida-inject's stdout appends), so a copy whose
        length is under its source's at the open was cut short: it is tried again as a failed copy is, and the trace
        comes back whole from the next (the re-review of 5b982dc6, nit 2)."""
        from labapi.proxmox import ExecResult

        log = '{"impulse": 1}\n' * 3
        pve = self._traced_seat(log)
        short = [ExecResult(0, "45 30\r\n", "")]
        _log_copy_answers(pve, lambda guest, res: short.pop(0) if short else res)
        run_id, body = self._run(FRIDA_ONE)
        self.assertEqual(body["verdict"], "green", body)
        script = f"x-trace-{run_id}-1.js"
        copy = f"C:\\sky-lab\\frida\\{script}.log.copy"
        copies = [c for c in pve.calls if c[:2] == ("exec", 901) and f"[IO.File]::Create('{copy}')" in " ".join(c[2])]
        self.assertEqual(len(copies), 2, "the short copy is made again")
        self.assertEqual([c[3:] for c in pve.calls if c[:3] == ("file_read_range", 901, copy)], [(0, 45)])
        self.assertEqual((self.tmp / "results" / run_id / "frida" / f"c1-{script}.jsonl").read_text(encoding="utf-8"), log)

    def _its_copy_answer_lost(self, empty: bool):
        """FRIDA_ONE with its trace's .log copy exec ending E_PVE_EXEC_LOST (run 20261018-204244) after the fake made the
        copy whole, or left it `empty` (the copy runs without Stop, so a source open that failed still creates one); the
        run's id and body, and the seat."""
        from labapi.proxmox import ProxmoxError

        pve = self._traced_seat('{"impulse": 1}\n' * 3)

        def answer(guest, res):
            if empty:
                for p in [p for p in pve.files if p.endswith(".js.log.copy")]:
                    pve.files[p] = ""
            raise ProxmoxError(f"E_PVE_EXEC_LOST: pid 42 on {guest.name}: the guest agent no longer knows it (RuntimeError: "
                               "PID 42 does not exist); the command ended and its answer is lost")

        _log_copy_answers(pve, answer)
        run_id, body = self._run(FRIDA_ONE)
        return run_id, body, pve

    def test_a_copy_whose_exec_answer_was_lost_makes_the_run_a_lab_fault(self):
        """An exec whose answer the agent lost has ended on the seat, but only the copy exec's own "N M" proves its copy
        whole, as log-count's rule has it: the run's own trace is its evidence, so a lost answer is a trace not fetched
        whole, E_RUN_FRIDA_FETCH, and the would-be green is error, which a run set reruns (the final check of
        7ebf12a7); the copy is not made again over a .log the script still writes, nor read."""
        run_id, body, pve = self._its_copy_answer_lost(empty=False)
        self.assertEqual(body["verdict"], "error", body)
        script = f"x-trace-{run_id}-1.js"
        copy = f"C:\\sky-lab\\frida\\{script}.log.copy"
        self.assertEqual([(f["kind"], f["client"], f["error"]) for f in body["failures"]],
                         [("lab", "c1", f"E_RUN_FRIDA_FETCH: {script}.log on c1 (fake-c1) not fetched whole: its copy's exec "
                                        "answer was lost, so the copy is unchecked")])
        execs = [" ".join(c[2]) for c in pve.calls if c[:2] == ("exec", 901)]
        self.assertEqual(len([e for e in execs if f"[IO.File]::Create('{copy}')" in e]), 1)
        self.assertFalse([c for c in pve.calls if c[:3] == ("file_read_range", 901, copy)])

    def test_a_lost_copy_answer_that_left_an_empty_copy_is_a_lab_fault(self):
        """The final check of 7ebf12a7's demo: the copy exec's answer lost and an empty copy left, as a source open that
        failed leaves one, was read by its own length as 0 bytes, an empty trace for a source that holds lines and no
        fault."""
        run_id, body, _ = self._its_copy_answer_lost(empty=True)
        self.assertEqual(body["verdict"], "error", body)
        self.assertEqual([f["error"] for f in body["failures"]],
                         [f"E_RUN_FRIDA_FETCH: x-trace-{run_id}-1.js.log on c1 (fake-c1) not fetched whole: its copy's exec "
                          "answer was lost, so the copy is unchecked"])

    def test_a_size_mismatch_makes_the_run_a_lab_fault(self):
        """The ranges must come to the copy's length: a copy holding fewer bytes than its exec said meets its end
        inside its last range, which comes back short, a trace not fetched whole."""
        from labapi.proxmox import ExecResult

        pve = self._traced_seat('{"impulse": 1}\n' * 3)
        _log_copy_answers(pve, lambda guest, res: ExecResult(0, "45 52\r\n", ""))
        run_id, body = self._run(FRIDA_ONE)
        self.assertEqual(body["verdict"], "error", body)
        self.assertEqual([(f["kind"], f["client"], f["error"]) for f in body["failures"]],
                         [("lab", "c1", f"E_RUN_FRIDA_FETCH: x-trace-{run_id}-1.js.log on c1 (fake-c1) not fetched whole: "
                                        "45 bytes read of its 52: range 1 of 1, at 0, came back 45 of its 52")])

    def test_a_range_from_the_copys_end_answers_no_bytes_and_the_fetch_stops_there(self):
        """Agent.pm reads from an offset at or past a file's end as no bytes (the Windows agent's 0-byte read is its
        eof): a copy that said a whole range more than it holds is read whole up to its end, then the range from its end
        comes back empty, a trace not fetched whole, and nothing is asked past it."""
        from labapi.proxmox import ExecResult
        from labapi.runner import READ_RANGE_BYTES as R

        pve = self._traced_seat("y" * (R - 1) + "\n")
        _log_copy_answers(pve, lambda guest, res: ExecResult(0, f"{R} {2 * R + 100}\r\n", ""))
        run_id, body = self._run(FRIDA_ONE)
        self.assertEqual(body["verdict"], "error", body)
        script = f"x-trace-{run_id}-1.js"
        self.assertEqual([f["error"] for f in body["failures"]],
                         [f"E_RUN_FRIDA_FETCH: {script}.log on c1 (fake-c1) not fetched whole: {R} bytes read of its "
                          f"{2 * R + 100}: range 2 of 3, at {R}, came back 0 of its {R}"])
        copy = f"C:\\sky-lab\\frida\\{script}.log.copy"
        self.assertEqual([c[3:] for c in pve.calls if c[:3] == ("file_read_range", 901, copy)], [(0, R), (R, R)])

    def test_a_copy_past_the_cap_is_refused_before_its_first_read(self):
        """A runaway trace cannot hold up the run's end, whose artifacts phase has no deadline: a copy past
        FETCH_MAX_BYTES (64 MiB) is refused before any range is read, the run's own trace a fault naming its size,
        and the copy leaves the seat."""
        from labapi.proxmox import ExecResult
        from labapi.runner import FETCH_MAX_BYTES

        pve = self._traced_seat('{"impulse": 1}\n')
        big = FETCH_MAX_BYTES + 1
        _log_copy_answers(pve, lambda guest, res: ExecResult(0, f"{big} {big}\r\n", ""))
        run_id, body = self._run(FRIDA_ONE)
        self.assertEqual(body["verdict"], "error", body)
        script = f"x-trace-{run_id}-1.js"
        self.assertEqual([f["error"] for f in body["failures"]],
                         [f"E_RUN_FRIDA_FETCH: {script}.log on c1 (fake-c1) not fetched whole: its copy is {big} bytes, past "
                          f"the {FETCH_MAX_BYTES} ({FETCH_MAX_BYTES // (1024 * 1024)} MiB) a fetch reads"])
        copy = f"C:\\sky-lab\\frida\\{script}.log.copy"
        self.assertFalse([c for c in pve.calls if c[:3] == ("file_read_range", 901, copy)])
        self.assertNotIn(copy, pve.files)

    def test_a_relaunch_arms_trace_is_the_runs_own(self):
        """relaunch {frida} starts its trace by the frida step's own start (_frida_start), so the trace is the run's
        evidence as a frida step's is: not fetched whole, the run is a lab fault."""
        from labapi.proxmox import ExecResult

        pve = self._traced_seat('{"impulse": 1}\n')
        _log_copy_answers(pve, lambda guest, res: ExecResult(0, "15 16\r\n", ""))
        run_id, body = self._run(FRIDA_RELAUNCH)
        self.assertEqual(body["verdict"], "error", body)
        self.assertEqual([(f["kind"], f["client"], f["error"]) for f in body["failures"]],
                         [("lab", "c1", f"E_RUN_FRIDA_FETCH: x-trace-{run_id}-1.js.log on c1 (fake-c1) not fetched whole: "
                                        "15 bytes read of its 16: range 1 of 1, at 0, came back 15 of its 16")])

    def test_a_red_run_stays_red_and_gains_the_fetch_fault(self):
        """The crash check's path at a run's end: a lab fault turns only a would-be green into error."""
        from labapi.proxmox import ExecResult

        pve = self._traced_seat('{"impulse": 1}\n')
        _log_copy_answers(pve, lambda guest, res: ExecResult(0, "15 16\r\n", ""))
        run_id, body = self._run(FRIDA_ONE + "  - assert:\n      - server.actor(c1).x == 12345\n")
        self.assertEqual(body["verdict"], "red", body)
        self.assertEqual([f["kind"] for f in body["failures"]], ["assertion", "lab"], body["failures"])
        self.assertTrue(body["failures"][1]["error"].startswith("E_RUN_FRIDA_FETCH: "), body["failures"])

    def test_a_copy_held_past_its_removals_window_is_a_note_and_no_fault(self):
        """A trace copy the removal leaves past its window was the seat's fault (RunRecord.faulted), a rollback at its next
        run, after the held copies of x-prop-blast's later relaunches on qemu-server 9.2.10. On 9.2.15 a busy agent lets
        go once it works through its queue (core's host journal, 2026-11-12): the copy is a note, the seat's next reset
        removes it, and the next run's copies carry their own script's name; the trace came back whole, so this run's
        verdict stands and the seat may relaunch."""
        from labapi.proxmox import ExecResult

        pve = self._traced_seat('{"impulse": 1}\n')
        plain_exec = pve.exec

        def exec_(guest, command, timeout):
            if re.search(r"Remove-Item -LiteralPath '[^']+\.js\.log\.copy' -Force", " ".join(command)):
                pve.calls.append(("exec", guest.vmid, tuple(command)))
                return ExecResult(0, "True\r\n", "")  # still there: the agent holds it
            return plain_exec(guest, command, timeout)

        pve.exec = exec_
        run_id, body = self._run(FRIDA_ONE)
        self.assertEqual(body["verdict"], "green", body)
        self.assertEqual(body["failures"], [])
        copy = f"C:\\sky-lab\\frida\\x-trace-{run_id}-1.js.log.copy"
        held = _held_note(f"frida x-trace-{run_id}-1.js.log", copy)
        self.assertTrue([n for n in body["notes"] if re.fullmatch(held, n)], body["notes"])
        self.assertEqual(self.services.runner.seats["c1"].force, "")

    def test_a_removal_that_answers_neither_true_nor_false_is_a_note(self):
        """A removal whose answer says nothing of the copy (neither True nor False on its last line, or an exit that is
        not 0) leaves the copy unknown: a note naming the answer, never the seat's fault nor the run's (the re-review of
        5b982dc6, nit 5)."""
        from labapi.proxmox import ExecResult

        pve = self._traced_seat('{"impulse": 1}\n')
        plain_exec = pve.exec

        def exec_(guest, command, timeout):
            if re.search(r"Remove-Item -LiteralPath '[^']+\.js\.log\.copy' -Force", " ".join(command)):
                pve.calls.append(("exec", guest.vmid, tuple(command)))
                return ExecResult(0, "WARNING: the path is in use\r\n", "")
            return plain_exec(guest, command, timeout)

        pve.exec = exec_
        run_id, body = self._run(FRIDA_ONE)
        self.assertEqual(body["verdict"], "green", body)
        self.assertEqual(body["failures"], [])
        copy = f"C:\\sky-lab\\frida\\x-trace-{run_id}-1.js.log.copy"
        self.assertIn(f"frida x-trace-{run_id}-1.js.log: the removal of {copy} on fake-c1 answered exit 0: WARNING: the path is "
                      "in use", body["notes"])
        self.assertFalse([n for n in body["notes"] if "held open in its agent" in n], body["notes"])
        self.assertEqual(self.services.runner.seats["c1"].force, "")

    def test_a_read_that_failed_still_faults_the_seat_and_its_unconfirmed_copy_is_a_note(self):
        """A read that died is what leaves a handle open (qemu-server 9.2.10 closes none whose read died), so after one a
        removal that does not confirm the copy gone counts as one that found it held (the fresh review of e8d8de9b, nit
        3), and one that ran out its time is not tried again. Only the removal's failure softens, to a note: the read's
        own failure is the run's E_RUN_FRIDA_FETCH as before, the run is error, and that fault, which names the seat,
        still rolls it back at its next run."""
        from unittest import mock

        from labapi import proxmox
        from labapi.proxmox import ProxmoxError

        pve = self._traced_seat('{"impulse": 1}\n')
        plain_range, plain_exec = pve.file_read_range, pve.exec

        def file_read_range(guest, path, offset, count):
            if path.endswith(".js.log.copy"):
                pve.calls.append(("file_read_range", guest.vmid, path, offset, count))
                raise ProxmoxError(f"E_PVE_FILE: {guest.name}: ResourceException: 500 Internal Server Error: VM {guest.vmid} "
                                   "qga command 'guest-file-read' failed - got timeout")
            return plain_range(guest, path, offset, count)

        def exec_(guest, command, timeout):
            if re.search(r"Remove-Item -LiteralPath '[^']+\.js\.log\.copy' -Force", " ".join(command)):
                pve.calls.append(("exec", guest.vmid, tuple(command)))
                raise ProxmoxError(f"E_PVE_EXEC: pid 7 on {guest.name} did not exit in 120.0s")
            return plain_exec(guest, command, timeout)

        pve.file_read_range, pve.exec = file_read_range, exec_
        with mock.patch.object(proxmox, "FILE_READ_PAUSES", (0.0, 0.0)):
            run_id, body = self._run(FRIDA_ONE)
        self.assertEqual(body["verdict"], "error", body)  # the trace not fetched whole, the run's own fault
        copy = f"C:\\sky-lab\\frida\\x-trace-{run_id}-1.js.log.copy"
        # its one try's whole span on the runner's clock, the exec's own time with it, where the pauses alone said 0 s
        # (the fresh review of 5771141b, nit 4)
        held = (re.escape(f"frida x-trace-{run_id}-1.js.log: {copy} on c1 (fake-c1) taken as held open in the agent, its read "
                          "having failed (1 try over ") + r"\d+\.\d s; "
                + re.escape(f"{copy} on fake-c1 not removed: E_PVE_EXEC: pid 7 on fake-c1 did not exit in 120.0s); left to "
                            "the seat's next reset"))
        self.assertTrue([n for n in body["notes"] if re.fullmatch(held, n)], body["notes"])
        removals = [c for c in pve.calls if c[0] == "exec" and "Remove-Item" in " ".join(c[2]) and copy in " ".join(c[2])]
        self.assertEqual(len(removals), 1, "a try that ran out its time is not tried again")
        fetch = [f["error"] for f in body["failures"] if f.get("client") == "c1"]
        self.assertTrue(fetch and fetch[0].startswith(f"E_RUN_FRIDA_FETCH: x-trace-{run_id}-1.js.log on c1 (fake-c1) not "
                                                      "fetched whole: range 1 of 1: E_PVE_FILE"), body["failures"])
        fault = f"step end, lab: {fetch[0]}"
        self.assertEqual(self.services.runner.seats["c1"].force, f"its last run ({run_id}) ended in a fault: {fault[:200]}")

    def test_an_exception_out_of_the_artifacts_is_an_internal_failure(self):
        """An exception that escapes the artifacts phase is a bug in lab-api, and what it skipped may be the run's own
        traces (here the trace artifact raised, ahead of their fetch): the internal failure's shape, and a run that
        would have been green is error, never green with its trace unread. A red run stays red and gains the failure
        (the re-review of 5b982dc6, nit 3), which still rolls its seat back at the next run (_remember_seats' whole)."""
        self._traced_seat('{"impulse": 1}\n')
        runner = self.services.runner
        internal = {"step": "end", "kind": "internal", "error": "artifacts: RuntimeError: the board lost its watch"}

        def watch(observer):
            raise RuntimeError("the board lost its watch")

        runner.board.watch = watch
        run_id, body = self._run(FRIDA_ONE + "artifacts: [trace]\n")
        self.assertEqual(body["verdict"], "error", body)
        self.assertEqual(body["failures"], [internal])
        self.assertIn(("c1", f"x-trace-{run_id}-1.js"), runner.frida_started)

        run_id, body = self._run(FRIDA_ONE + "  - assert:\n      - server.actor(c1).x == 12345\nartifacts: [trace]\n")
        self.assertEqual(body["verdict"], "red", body)
        self.assertEqual([f["kind"] for f in body["failures"]], ["assertion", "internal"], body["failures"])
        self.assertEqual(body["failures"][1], internal)
        self.assertEqual(runner.seats["c1"].force, f"its last run ({run_id}) ended in a fault: {internal['error']}")


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


APPROACH = """
id: approach
clients: [c1]
steps:
  - c1: connect
  - c1: approach {formId: 0x13483, distance: 80, cell: "3c:Skyrim.esm"}
"""

KILL_REF = """
id: kill-ref
clients: [c1, c2]
steps:
  - c1: connect
  - c2: connect
  - c1: kill-ref {formId: 0x85547, killer: c2}
  - assert:
      - server.ref(0x85547).isDead == true
  - c1: respawn-ref {formId: 0x85547}
  - assert:
      - server.ref(0x85547).isDead == false
"""

SERVER_CONSOLE = """
id: server-console
clients: [c1, c2]
steps:
  - c1: connect
  - c1: server-console {name: PlaceAtMe, args: [0x14, 0x23abf]}
"""

APPROACH_RECORD = """
id: approach-record
clients: [c1]
steps:
  - c1: connect
  - c1: approach {formId: 0x13482, distance: 150, cell: record}
"""

CHEST_VIEWS = """
id: chest-views
clients: [c1, c2]
steps:
  - c1: connect
  - c2: connect
  - c1: inventory {ref: 0x371e9}
  - c2: inventory {ref: "0x371e9"}
  - c1: inventory {ref: 0x3975b}
  - assert:
      - c1.inventory(0x371e9).count("Skyrim.esm:IronSword") == server.inventory(0x371e9).count("Skyrim.esm:IronSword")
      - c2.inventory(0x371e9).count("Skyrim.esm:IronSword") == 0
      - c1.inventory(0x3975b).count("0xf") == 25 and c1.inventory(0x371e9).count("0xf") == 0
"""

CHEST_UNREAD = """
id: chest-unread
clients: [c1, c2]
steps:
  - c1: connect
  - c1: inventory {ref: 0x371e9}
  - assert:
      - c2.inventory(0x371e9).count("Skyrim.esm:IronSword") == 1
"""


@needs_deps
class InventorySteps(RunTests):
    def test_each_seats_view_of_two_chests_beside_the_record(self):
        """The root-cause plan's W4: each seat reads a chest in its own game, kept by the reference it named, and a
        claim sets the two views beside the server's record (c2's game shows the chest empty)."""
        from labapi.fakes import FakeActor

        self.state.refs[0x371E9] = FakeActor(0.0, 0.0, 0.0, "371de:Skyrim.esm", inventory={0x12EB7: 1})
        self.doubles.chests["c1"] = {0x371E9: {0x12EB7: 1}, 0x3975B: {0xF: 25}}
        self.doubles.chests["c2"] = {0x371E9: {}}
        run_id, body = self._run(CHEST_VIEWS)
        self.assertEqual(body["verdict"], "green", json.dumps(body, indent=1))
        sent = [(c, a["ref"]) for c, act, a in self.doubles.seen if act == "inventory"]
        self.assertEqual(sent, [("c1", 0x371E9), ("c2", 0x371E9), ("c1", 0x3975B)], "a written \"0x371e9\" reaches the driver as its id")
        self.assertIn('"77495": 1', body["steps"][2]["note"], body["steps"][2])

    def test_a_chest_the_seat_never_read_is_red(self):
        self.doubles.chests["c1"] = {0x371E9: {0x12EB7: 1}}
        run_id, body = self._run(CHEST_UNREAD)
        self.assertEqual(body["verdict"], "red", body)
        self.assertEqual([f["kind"] for f in body["failures"]], ["assertion-data"], body["failures"])
        self.assertIn("c2 has not reported an inventory step for 0x371e9", body["failures"][0]["error"])

    def test_a_ref_no_table_holds_is_red_before_the_driver(self):
        run_id, body = self._run(CHEST_UNREAD.replace("{ref: 0x371e9}", '{ref: "Skyrim.esm:NoSuchChest"}'))
        self.assertEqual(body["verdict"], "red", body)
        self.assertIn("E_RUN_ITEM", body["failures"][0]["error"], body["failures"])
        self.assertFalse([a for _, a, _ in self.doubles.seen if a == "inventory"], "the driver never saw the step")


RUNG_FOUR = """
id: t-rung4
clients: [c1, c2]
steps:
  - c1: connect
  - c2: connect
  - c1: alias {quest: 0x39645, alias: 0}
  - c2: alias {quest: 0x39645, alias: 0}
  - c1: factions {formId: 0x39655, factions: [0xdb1, "rotfern.esp:rotfern"]}
  - assert:
      - c1.alias(0x39645, 0).refr == 0x39655
      - c2.alias(0x39645, 0).refr == c1.alias(0x39645, 0).refr
      - server.alias_fill(0x39645, 0).refr == c1.alias(0x39645, 0).refr
      - server.alias_fill(0x39645, 1).created == 0x39647 and server.alias_fill(0x39645, 1).added == true
      - c1.factions(0x39655).rank(0xdb1) == 0 and c1.factions(0x39655).member(0x800aa00) == false
      - server.ref(0x3ac73).isDisabled == true and server.ref(0x3ac73).refStateSeq == 3
      - server.world_globals().streamer == "c1" and server.world_globals().value(0x1a0a6ec2) == 7
"""


@needs_deps
class RungFourSteps(RunTests):
    def test_the_seats_reads_and_the_servers_records_meet_in_one_claim_block(self):
        """ADR-068 rung 4's grammar end to end: the alias and factions steps reach the driver with form ids (a table name
        resolved; the table here holds a race, which the fake driver takes as any id), the board keeps each answer, and
        the claims read them beside labState's ref state, alias fills and world globals."""
        from labapi.fakes import FakeActor

        self.doubles.aliases = {"c1": {(0x39645, 0): 0x39655}, "c2": {(0x39645, 0): 0x39655}}
        self.doubles.standing = {"c1": {0x39655: {0xDB1: 0}}}
        self.state.refs[0x3AC73] = FakeActor(1211.0, 1084.0, -212.0, "371de:Skyrim.esm", isDisabled=True, isDeleted=False, refStateSeq=3)
        self.state.alias_fills = [{"quest": 0x39645, "alias": 0, "refr": 0x39655, "created": 0, "container": 0, "added": False},
                                  {"quest": 0x39645, "alias": 1, "refr": 0, "created": 0x39647, "container": 0x39655, "added": True}]
        self.state.world_globals = {"streamer": 0xFF000001, "epoch": 1, "entries": [{"global": 0x1A0A6EC2, "value": 7.0}]}
        run_id, body = self._run(RUNG_FOUR)
        self.assertEqual(body["verdict"], "green", json.dumps(body, indent=1))
        sent = [(c, a) for c, act, a in self.doubles.seen if act in ("alias", "factions")]
        self.assertEqual(sent, [("c1", {"quest": 0x39645, "alias": 0}), ("c2", {"quest": 0x39645, "alias": 0}),
                                ("c1", {"formId": 0x39655, "factions": [0xDB1, 0x0800AA00]})])

    def test_a_server_without_the_kinds_is_red_on_data_never_green(self):
        self.doubles.aliases = {"c1": {(0x39645, 0): 0x39655}, "c2": {(0x39645, 0): 0x39655}}
        self.doubles.standing = {"c1": {0x39655: {0xDB1: 0}}}
        run_id, body = self._run(RUNG_FOUR)
        self.assertEqual(body["verdict"], "red", body)
        # the seats' claims hold; each claim on a record the server lacks is a data failure of its own
        self.assertEqual({f["kind"] for f in body["failures"]}, {"assertion-data"}, body["failures"])
        errors = sorted(set(f["error"] for f in body["failures"]))
        self.assertEqual(errors, ["server has no alias fills to read (no AliasFill: a server before ADR-068 rung 4)",
                                  "server has no world globals to read (no WorldGlobal: a server before ADR-068 rung 4)",
                                  "server holds no record for 0x3ac73"])


RUNG_FIVE = """
id: t-rung5
clients: [c1, c2]
steps:
  - c1: connect
  - c2: connect
  - c2: script-vars {form: 0xeafd5, keys: ["PlayerVampireQuestScript::::VampireStatus_var"]}
  - c2: quest-objectives {quest: 0x74a83, objectives: [10, 20]}
  - assert:
      - c2.script_vars(0xeafd5).value("::VampireStatus_var") == 0
      - server.script_variables().value(0xeafd5, "::VampireStatus_var") == c2.script_vars(0xeafd5).value("::VampireStatus_var")
      - c2.quest(0x74a83).objectiveDisplayed(10) and not c2.quest(0x74a83).objectiveDisplayed(20)
      - server.quest_runs(0x74a83).running and server.quest_runs(0x74a83).seq == 2
      - server.quest_record(0x74a83).stageDone(10) and server.quest_record(0x2ba16).count == 0
"""


@needs_deps
class RungFiveSteps(RunTests):
    def test_the_seats_reads_and_the_servers_records_meet_in_one_claim_block(self):
        """ADR-068 rung 5's grammar end to end: the script-vars and quest-objectives steps reach the driver with their form
        ids, the board keeps each answer, and the claims read them beside labState's quest runs, stage record and script
        variables."""
        self.doubles.script_vars = {"c2": {0xEAFD5: {"PlayerVampireQuestScript::::VampireStatus_var": 0}}}
        self.doubles.objectives = {"c2": {0x74A83: {10}}}
        self.state.quest_runs = [{"quest": 0x74A83, "running": True, "seq": 2}]
        self.state.quest_stages = [{"quest": 0x74A83, "stage": 10}]
        self.state.script_variables = [{"form": 0xEAFD5, "script": "PlayerVampireQuestScript", "var": "::VampireStatus_var",
                                        "k": 3, "value": 0, "seq": 1}]
        run_id, body = self._run(RUNG_FIVE)
        self.assertEqual(body["verdict"], "green", json.dumps(body, indent=1))
        sent = [(c, a) for c, act, a in self.doubles.seen if act in ("script-vars", "quest-objectives")]
        self.assertEqual(sent, [("c2", {"form": 0xEAFD5, "keys": ["PlayerVampireQuestScript::::VampireStatus_var"]}),
                                ("c2", {"quest": 0x74A83, "objectives": [10, 20]})])

    def test_a_server_without_the_kinds_is_red_on_data_never_green(self):
        self.doubles.script_vars = {"c2": {0xEAFD5: {"PlayerVampireQuestScript::::VampireStatus_var": 0}}}
        self.doubles.objectives = {"c2": {0x74A83: {10}}}
        run_id, body = self._run(RUNG_FIVE)
        self.assertEqual(body["verdict"], "red", body)
        self.assertEqual({f["kind"] for f in body["failures"]}, {"assertion-data"}, body["failures"])
        errors = sorted(set(f["error"] for f in body["failures"]))
        tail = "found nothing: a server before ADR-068 rung 5, or an answer the gamemode refused)"
        self.assertEqual(errors, [f"server has no quest runs to read (labState questRuns {tail}",
                                  f"server has no quest stages to read (labState questStages {tail}",
                                  f"server has no script variables to read (labState scriptVariables {tail}"])

    def test_a_formdesc_form_or_quest_reaches_the_driver_as_its_id(self):
        # the runner resolves script-vars' form and quest-objectives' quest through the run's load order, alias's way
        self.services.runner.tables.slots.update({"skyrim.esm": (False, 0), "dawnguard.esm": (False, 2)})
        runner = self.services.runner
        self.assertEqual(runner._client_args("script-vars", {"form": "0eafd5:Skyrim.esm", "keys": ["A::b"]}),
                         {"form": 0xEAFD5, "keys": ["A::b"]})
        self.assertEqual(runner._client_args("quest-objectives", {"quest": "71d0:Dawnguard.esm", "objectives": [1]}),
                         {"quest": 0x020071D0, "objectives": [1]})
        self.assertEqual(runner._client_args("script-vars", {"form": 0x74A83, "keys": ["A::b"]})["form"], 0x74A83)


CHEST_MOVES = """
id: chest-moves
clients: [c1, c2]
steps:
  - c1: connect
  - c2: connect
  - c2: transfer {item: "Skyrim.esm:IronSword", to: "0x371e9"}
  - c1: transfer {item: 0x12eb7, from: 0x371e9, count: 2}
  - c1: dump-state
"""

CHEST_SHORT = """
id: chest-short
clients: [c1]
steps:
  - c1: connect
  - c1: transfer {item: 0x12eb7, from: 0x371e9}
  - c1: dump-state
"""


@needs_deps
class TransferSteps(RunTests):
    def test_a_store_and_a_take_reach_the_driver_as_ids_and_answer_both_counts(self):
        """x-shared-chest-phantom's moves: c2 stores a sword from its player into the chest, c1 takes two from its own
        copy; a table name and a written "0x371e9" reach the driver as ids, and each step's note carries the item's
        count on the player and in the chest before and after, so a move that moved nothing shows."""
        self.doubles.carried["c2"] = {0x12EB7: 1}
        self.doubles.chests["c2"] = {0x371E9: {}}
        self.doubles.chests["c1"] = {0x371E9: {0x12EB7: 2}}
        run_id, body = self._run(CHEST_MOVES)
        self.assertEqual(body["verdict"], "green", json.dumps(body, indent=1))
        sent = [(c, a) for c, act, a in self.doubles.seen if act == "transfer"]
        self.assertEqual(sent, [("c2", {"item": 0x12EB7, "to": 0x371E9}), ("c1", {"item": 0x12EB7, "from": 0x371E9, "count": 2})])
        store, take = body["steps"][2]["note"], body["steps"][3]["note"]
        self.assertIn('"container": {"after": 1, "before": 0}', store, body["steps"][2])
        self.assertIn('"player": {"after": 0, "before": 1}', store, body["steps"][2])
        self.assertIn('"player": {"after": 2, "before": 0}', take, body["steps"][3])
        self.assertEqual((self.doubles.carried["c1"], self.doubles.chests["c1"][0x371E9]), ({0x12EB7: 2}, {0x12EB7: 0}))

    def test_a_refused_transfer_is_a_red_step(self):
        """The driver throws on a reference its game lacks, a source holding fewer than count, and counts that did not
        move by exactly count (an engine that moved nothing), and its catch posts ok: false; the run takes that as a red
        step and plays nothing after it. An {error} answer posted as ok: true in its place would pass, and this fails."""
        cases = (({0x371E9: {}}, False, "Error: 371e9 holds 0 of 12eb7, fewer than 1"),
                 ({}, False, "Error: no such ref 371e9"),
                 ({0x371E9: {0x12EB7: 1}}, True, "Error: a take of 1 of 12eb7 left the player at 0 (from 0) and 371e9 at 1 (from 1)"))
        for chests, stuck, why in cases:
            with self.subTest(why=why):
                self.doubles.chests["c1"] = chests
                self.doubles.stuck = {"c1"} if stuck else set()
                run_id, body = self._run(CHEST_SHORT)
                self.assertEqual(body["verdict"], "red", body)
                self.assertEqual([(f["kind"], f["client"], f["error"]) for f in body["failures"]], [("step-error", "c1", why)])
                self.assertEqual([(s["action"], s["ok"]) for s in body["steps"]], [("connect", True), ("transfer", False)])

    def test_an_item_no_table_holds_is_red_before_the_driver(self):
        run_id, body = self._run(CHEST_SHORT.replace("0x12eb7", '"Skyrim.esm:NoSuchItem"'))
        self.assertEqual(body["verdict"], "red", body)
        self.assertIn("E_RUN_ITEM", body["failures"][0]["error"], body["failures"])
        self.assertFalse([a for _, a, _ in self.doubles.seen if a == "transfer"], "the driver never saw the step")


@needs_deps
class ApproachSteps(RunTests):
    def test_approach_lands_the_seat_at_the_distance_facing_the_npc(self):
        """Her position is the seat's own npc-state; the seat comes in on her line to it and faces her, through the
        judged teleport (x-npc-talk-prompt v4: look's SetAngle never turned the view)."""
        me = self.state.actors[1]
        me.x, me.y, me.z = 1000.0, 0.0, 0.0  # the seat due east of her
        self.doubles.npcs["c1"] = {0x13483: {"formId": 0x13483, "pos": [0.0, 0.0, -50.0]}}
        run_id, body = self._run(APPROACH)
        self.assertEqual(body["verdict"], "green", body)
        sent = [p for n, p in self.state.rpc_log if n == "labCommand" and p["kind"] == "teleport"]
        self.assertEqual(len(sent), 1, sent)
        self.assertEqual((sent[0]["cell"], sent[0]["x"], sent[0]["y"], sent[0]["z"]), ("3c:Skyrim.esm", 80.0, 0.0, -50.0))
        self.assertEqual(sent[0]["rot"], [0, 0, 270.0])  # east of her, facing west
        step = next(s for s in body["steps"] if s["action"] == "approach")
        self.assertIn("80 units from 0x13483", step["note"], step)

    def test_approach_without_the_npc_is_red_and_sends_nothing(self):
        run_id, body = self._run(APPROACH)
        self.assertEqual(body["verdict"], "red", body)
        self.assertTrue(any("E_RUN_APPROACH" in f["error"] for f in body["failures"]), body["failures"])
        self.assertFalse([p for n, p in self.state.rpc_log if n == "labCommand" and p["kind"] == "teleport"])

    def test_approach_by_record_lands_in_the_cell_her_record_stands_in(self):
        """x-handoff-door: one evening takes Alvor home and another to the inn, so the probe names neither; the cell
        is the server's record's at the step, and the seat lands on her line in it."""
        import math

        from labapi.fakes import FakeActor

        me = self.state.actors[1]
        me.x, me.y, me.z = 1000.0, 0.0, 0.0
        me.slides = 300.0  # the engine's own arrival point, 300 off the line's target (b-npc-handoff-door 144756)
        self.state.refs[0x13482] = FakeActor(-512.8, -205.8, 240.0, "133c8:Skyrim.esm")
        self.doubles.npcs["c1"] = {0x13482: {"formId": 0x13482, "pos": [-512.8, -205.8, 240.0]}}
        run_id, body = self._run(APPROACH_RECORD)
        self.assertEqual(body["verdict"], "green", body)
        sent = [p for n, p in self.state.rpc_log if n == "labCommand" and p["kind"] == "teleport"]
        self.assertEqual(len(sent), 1, sent)
        self.assertEqual(sent[0]["cell"], "133c8:Skyrim.esm")
        self.assertAlmostEqual(math.hypot(sent[0]["x"] + 512.8, sent[0]["y"] + 205.8), 150.0, delta=0.2)
        # the seat stands outdoors (its dump's worldOrCell 0x3c) and she indoors: no line between two frames
        # (x-handoff-door 20261024-032354), so it comes in from the south and the engine's placement counts
        self.assertEqual((sent[0]["x"], sent[0]["y"]), (-512.8, -355.8))
        self.assertNotIn("tolerance", sent[0], "the landing's bound is lab-api's")
        step = next(s for s in body["steps"] if s["action"] == "approach")
        self.assertIn("in her record's cell 133c8:Skyrim.esm (from another frame", step["note"], step)

    def test_server_console_sends_the_gamemodes_console_kind_as_the_seats_player(self):
        """playtest 34's lab probe: a hostile placed by the server's console at the seat's player (PlaceAtMe), sent
        as labCommand's console kind under the client's profile, the server's answer the step's note."""
        run_id, body = self._run(SERVER_CONSOLE)
        self.assertEqual(body["verdict"], "green", body)
        sent = [p for n, p in self.state.rpc_log if n == "labCommand" and p["kind"] == "console"]
        self.assertEqual(sent, [{"kind": "console", "profileId": 1, "name": "PlaceAtMe", "args": [0x14, 0x23abf]}], sent)

    def test_kill_ref_names_its_killer_by_client_and_respawn_ref_puts_it_up(self):
        """npc-fate's death reads: a game-file actor killed by the server by form id, the killer a scenario client
        sent as its profile, then up again at once."""
        from labapi.fakes import FakeActor

        self.state.refs[0x85547] = FakeActor(123400.0, -80300.0, 10705.0, "3c:Skyrim.esm")
        run_id, body = self._run(KILL_REF)
        self.assertEqual(body["verdict"], "green", body)
        sent = [p for n, p in self.state.rpc_log if n == "labCommand" and p["kind"] in ("kill-ref", "respawn-ref")]
        self.assertEqual([p["kind"] for p in sent], ["kill-ref", "respawn-ref"], sent)
        self.assertEqual(sent[0]["killerProfileId"], 2, sent[0])
        self.assertNotIn("killer", sent[0])
        self.assertEqual(sent[0]["formId"], 0x85547)
        self.assertFalse(self.state.refs[0x85547].isDead)

    def test_approach_by_record_without_a_record_is_red_and_sends_nothing(self):
        self.doubles.npcs["c1"] = {0x13482: {"formId": 0x13482, "pos": [-512.8, -205.8, 240.0]}}
        run_id, body = self._run(APPROACH_RECORD)
        self.assertEqual(body["verdict"], "red", body)
        self.assertTrue(any("no record of 0x13482" in f["error"] for f in body["failures"]), body["failures"])
        self.assertFalse([p for n, p in self.state.rpc_log if n == "labCommand" and p["kind"] == "teleport"])


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

    def test_a_target_move_is_sent_as_written(self):
        # x-cell-attach 20261021-185728: the offset path wrote the server's record over the written target
        run_id, body = self._run("id: move-to\nclients: [c1]\nsteps:\n  - c1: connect\n  - c1: move {x: 20900, y: -44600, speed: 300}\n")
        self.assertEqual(body["verdict"], "green", body)
        moves = [a for _, action, a in self.doubles.seen if action == "move"]
        self.assertEqual((moves[0]["x"], moves[0]["y"], moves[0]["speed"]), (20900.0, -44600.0, 300.0))

    def test_a_move_with_an_offset_and_a_target_is_refused(self):
        run_id, body = self._run("id: move-both\nclients: [c1]\nsteps:\n  - c1: connect\n  - c1: move {x: 1, y: 2, dx: 3}\n")
        self.assertEqual(body["verdict"], "red", body)
        self.assertIn("E_RUN_MOVE", body["failures"][0]["error"])

    def test_a_solo_runs_offset_move_starts_from_the_clients_own_report(self):
        self.doubles.stale_dumps = 1  # the client reports (9999, 9999); the server's record is elsewhere
        solo = ("id: move-solo\nsolo: true\nclients: [c1]\nserver: {snapshot: clean}\ntimeout_s: 30\n"
                "steps:\n  - c1: dump-state\n  - c1: move {dx: 300, dy: -5}\nartifacts: []\n")
        run_id, body = self._run(solo)
        moves = [a for _, action, a in self.doubles.seen if action == "move"]
        self.assertTrue(moves, body)
        self.assertEqual((moves[0]["x"], moves[0]["y"]), (9999.0 + 300, 9999.0 - 5))


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
class NetemSteps(RunTests):
    def _tc(self):
        return [c for c in self.services.system.commands if c[:1] == ["tc"]]

    def test_a_netem_step_impairs_from_that_step_and_zero_clears_it(self):
        run_id, body = self._run("id: t-netem\nclients: [c1]\nsteps:\n  - c1: connect\n  - server: netem {loss_pct: 25}\n"
                                 "  - c1: dump-state\n  - server: netem {loss_pct: 0}\n  - c1: dump-state\n")
        self.assertEqual(body["verdict"], "green", body)
        dev = self.settings.netem_dev
        self.assertEqual(self._tc(), [["tc", "qdisc", "replace", "dev", dev, "root", "netem", "delay", "0ms", "0ms", "loss", "25%"],
                                      ["tc", "qdisc", "del", "dev", dev, "root"]])
        self.assertTrue(any("netem delay 0ms 0ms loss 25%" in n for n in body["notes"]), body["notes"])
        self.assertFalse(self.client.get("/lab/status").json()["netem"])

    def test_a_netem_step_left_on_is_cleared_at_the_run_s_end(self):
        run_id, body = self._run("id: t-netem-on\nclients: [c1]\nsteps:\n  - c1: connect\n  - server: netem {delay_ms: 100, loss_pct: 10}\n")
        self.assertEqual(body["verdict"], "green", body)
        self.assertEqual([c[2] for c in self._tc()], ["replace", "del"])
        self.assertFalse(self.client.get("/lab/status").json()["netem"])

    def test_a_netem_step_tc_refuses_is_a_lab_error(self):
        from labapi.fakes import Completed

        real = self.services.system.run
        self.services.system.run = lambda cmd, *a, **k: Completed(2, "", "RTNETLINK answers: Operation not permitted") if cmd[:3] == ["tc", "qdisc", "replace"] else real(cmd, *a, **k)
        run_id, body = self._run("id: t-netem-no\nclients: [c1]\nsteps:\n  - c1: connect\n  - server: netem {loss_pct: 25}\n")
        self.assertEqual(body["verdict"], "error", body)
        self.assertIn("E_RUN_NETEM", body["failures"][0]["error"])


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


SNAPSHOT = """
id: t-snapshot
clients: [c1]
steps:
  - c1: connect
  - server: snapshot {name: before, of: "server.actor(c1)"}
  - c1: teleport {cell: lab-spawn, x: 300, y: 0, z: 0}
  - assert:
      - snapshot("before").x == 0
      - server.actor(c1).x != snapshot("before").x
      - server.ref(0x85547).healthPercentage == 0.5
      - server.host(0x9810).client == "c1"
      - server.host(0x9810).epoch == 1
      - server.host(0x9811).hosted == false
"""


@needs_deps
class CellHostSteps(RunTests):
    """docs/verbs/cell-host.md's lab pieces: the host table and a ref through
    labState, a server fact kept by a snapshot step for a later assert, and the
    run's own npcEnabled laid over the version's settings."""

    def test_a_snapshot_keeps_the_read_it_took_for_a_later_assert(self):
        from labapi.fakes import FakeActor

        self.state.refs[0x85547] = FakeActor(10.0, 20.0, 30.0, "tamriel", healthPercentage=0.5)
        self.state.hosts[0x9810] = {"hosted": True, "actorId": 0xFF000001, "epoch": 1}
        run_id, body = self._run(SNAPSHOT)
        self.assertEqual(body["verdict"], "green", json.dumps(body, indent=1))
        self.assertTrue(any("snapshot before = server.actor(c1)" in n for n in body["notes"]), body["notes"])

    def test_a_snapshot_of_a_record_the_server_lacks_is_red_not_a_lab_fault(self):
        text = 'id: t-snap\nclients: [c1]\nsteps:\n  - c1: connect\n  - server: snapshot {name: p, of: "server.ref(0x12345)"}\n'
        run_id, body = self._run(text)
        self.assertEqual(body["verdict"], "red", body)
        fail = body["failures"][0]
        self.assertEqual(fail["kind"], "assertion-data", fail)
        self.assertIn("E_RUN_SNAPSHOT: p", fail["error"])
        self.assertEqual(len(body["steps"]), 2, "the run stops at the snapshot")

    def _settings_files(self):
        import dataclasses

        files = {}
        for version, name in (("1.6.1170", "server-settings.json"), ("1.7.104", "server-settings-1.7.104.json")):
            f = self.tmp / name
            f.write_text(json.dumps({"name": "thuum lab", "npcEnabled": False, "loadOrder": [version]}, indent=2) + "\n")
            files[version] = f
        spec = ";".join(f"{v}={f}" for v, f in files.items())
        self.services.runner.s = dataclasses.replace(self.services.runner.s, game_server_settings=spec)
        return files

    def _up_env(self):
        system = self.services.system
        ups = [env for cmd, env in zip(system.commands, system.envs) if cmd[:2] == ["docker", "compose"] and "up" in cmd]
        self.assertTrue(ups, system.commands)
        return ups[-1]

    def test_a_restart_with_a_game_hour_lays_the_clock_anew(self):
        """x-handoff-night: the evening at the run's start, the morning after a restart inside it."""
        files = self._settings_files()
        run_id, body = self._run("id: t-night\nclients: [c1]\nserver: {gameHour: 23.0}\nsteps:\n  - c1: connect\n"
                                 "  - server: restart {gameHour: 7.9}\n")
        self.assertEqual(body["verdict"], "green", body)
        laid = json.loads((self.tmp / "server-settings-run.json").read_text())
        self.assertEqual(laid["time"]["start"], {"hour": 7.9})

    def test_a_server_log_count_reads_the_runs_server_log(self):
        """x-host-quit: the leave a quit sends is the server's own line ("user N left"), counted from the run's
        server log so far (compose logs since the run began) for server.log_count("<pattern>")."""
        self.services.system.log_text = ("[info] WireServer: user 1 left (connection terminated by the transport layer)\n"
                                         "[info] disconnect 2\n[info] something else\n")
        text = ('id: t-slog\nclients: [c1]\nsteps:\n  - c1: connect\n  - server: log-count {pattern: "user [0-9]+ left"}\n'
                "  - assert:\n      - 'server.log_count(\"user [0-9]+ left\") >= 1'\n")
        run_id, body = self._run(text)
        self.assertEqual(body["verdict"], "green", body)
        step = next(s for s in body["steps"] if s.get("action") == "log-count")
        self.assertIn("1 line(s) of the server's log match", step["note"], step)
        logs = [c for c in self.services.system.commands if c[:2] == ["docker", "compose"] and "logs" in c and "--since" in c]
        self.assertTrue(logs, self.services.system.commands)

    def test_a_server_log_count_is_live_in_an_until_and_an_assert(self):
        """x-host-quit v4: the leave's line read inside an until right after the quit, no step first; each poll counts
        the run's server log anew, so a line that lands mid-until holds it."""
        system = self.services.system
        system.log_text = "[info] nothing yet\n"
        real_run = system.run
        polls = {"n": 0}

        def run(cmd, timeout=120.0, env=None):
            if cmd[:2] == ["docker", "compose"] and "logs" in cmd:
                polls["n"] += 1
                if polls["n"] >= 3:  # the leave lands on the third read
                    system.log_text = "[info] WireServer: user 1 left (connection terminated by the transport layer)\n"
            return real_run(cmd, timeout, env)

        system.run = run
        text = ("id: t-slog2\nclients: [c1]\nsteps:\n  - c1: connect\n"
                "  - until: {within: 30, expect: ['server.log_count(\"user [0-9]+ left\") >= 1']}\n"
                "  - assert:\n      - 'server.log_count(\"user [0-9]+ left\") == 1'\n")
        run_id, body = self._run(text)
        self.assertEqual(body["verdict"], "green", body)
        until = next(s for s in body["steps"] if s.get("kind") == "until")
        self.assertIn("held after", until["note"], until)
        self.assertGreaterEqual(polls["n"], 3)

    def test_a_server_log_count_with_no_match_reads_zero(self):
        run_id, body = self._run("id: t-slog3\nclients: [c1]\nsteps:\n  - c1: connect\n"
                                 "  - assert:\n      - 'server.log_count(\"user [0-9]+ left\") >= 1'\n")
        self.assertEqual(body["verdict"], "red", body)

    def test_a_log_count_on_an_unmanaged_seat_keeps_no_count(self):
        run_id, body = self._run('id: t-log\nclients: [c1]\nsteps:\n  - c1: connect\n  - c1: log-count {pattern: "moved"}\n')
        self.assertEqual(body["verdict"], "green", body)
        step = next(s for s in body["steps"] if s["action"] == "log-count")
        self.assertIn("skipped", step["note"], step)

    def _log_count_on_a_managed_seat(self, files: dict[str, str]):
        import asyncio

        from labapi.guests import Guest
        from labapi.runner import RunRecord
        from labapi.scenario import Scenario

        self.services.tables.guests["fake-c1"] = Guest("fake-c1", 901, "127.0.0.1", "qemu", "client", True, "clean-sp", "c1")
        pve = self.services.control._b
        # the sources log-count copies by a shared read: the platform log at its path, the tee under the game folder
        sources = {"platform": self.services.runner.s.client_driver_log,
                   "console": pve.game_dir + "\\" + self.services.runner.s.client_console_log}
        for name, text in files.items():
            pve.files[sources[name]] = text
        rec = RunRecord("x", Scenario(id="x", clients=["c1"]), self.tmp, "now")
        ok, note = asyncio.run(self.services.runner._log_count(rec, 3, "c1", "moved"))
        self.assertTrue(ok, note)
        return pve, note

    def test_a_log_count_reads_the_console_log_beside_the_platform_log(self):
        """x-handoff-door 20261024-013234: skymp5-client's logTrace lines reach the game's console alone, so log-count
        reads lab-driver's tee of it (Data\\Platform\\Logs\\lab-console-logs.txt) beside skyrim-platform.log."""
        pve, note = self._log_count_on_a_managed_seat({
            "platform": "a moved line\nanother\n",
            "console": "[npc-handoff] moved 13482 into 133c6\n[x] moved again\nquiet\n",
        })
        self.assertEqual(self.services.board.log_count("c1", "moved"), 3, note)
        self.assertIn("1 in its Skyrim Platform log, 2 in its console log", note)
        copies = [" ".join(c[2]) for c in pve.calls if c[0] == "exec" and c[1] == 901]
        self.assertTrue(any("lab-console-logs.txt" in c and "logcount-x-003-1-console.log" in c for c in copies), copies)

    def test_a_snapshot_keeps_a_seats_count_as_the_board_holds_it(self):
        """a seat's fact as a baseline: the log-count step sets the board's count, and the snapshot keeps that read"""
        import asyncio

        from labapi.runner import RunRecord
        from labapi.scenario import Scenario, Step

        self._log_count_on_a_managed_seat({"platform": "a moved line\n", "console": "moved twice\nmoved\n"})
        rec = RunRecord("x", Scenario(id="x", clients=["c1"]), self.tmp, "now")
        step = Step(kind="server", action="snapshot", args={"name": "seen", "of": 'c1.log_count("moved")'})
        ok, note = asyncio.run(self.services.runner._snapshot(rec, 4, step))
        self.assertTrue(ok, note)
        self.assertEqual(rec.snapshots["seen"], 3)

    def test_a_log_count_without_a_console_log_counts_the_platform_log(self):
        """a driver from before the tee writes no console log: that copy reads nothing, and the count is the first log's"""
        pve, note = self._log_count_on_a_managed_seat({"platform": "a moved line\nanother\n"})
        self.assertEqual(self.services.board.log_count("c1", "moved"), 1, note)
        self.assertIn("0 in its console log", note)

    def test_a_log_count_note_carries_each_logs_bytes(self):
        """b-puzzle-relay 20261110-135219 and 135510: after a plain relaunch a copy of the tee counted 0 for a line the
        run's own c1-console.log holds, so the note says how many bytes each log had on the seat, its copy took and
        lab-api read of it"""
        pve, note = self._log_count_on_a_managed_seat({"platform": "a moved line\n", "console": "moved twice\nmoved\n"})
        self.assertIn("1 in its Skyrim Platform log, 2 in its console log; "
                      "bytes 13 read of 13 copied of 13 on the seat, 18 read of 18 copied of 18 on the seat", note)

    def test_a_short_read_of_a_copy_shows_in_its_bytes(self):
        """the seat's tee and its copy longer than what lab-api read: a log read only in part keeps no count, so a
        claim on it raises rather than read part of it as the whole (an absence claim, == 0, would pass on the part:
        the re-review of 486e80f3), and the note says how much came back"""
        from labapi.proxmox import ExecResult

        pve = self.services.control._b
        real_exec = pve.exec

        def exec_(guest, command, timeout):
            res = real_exec(guest, command, timeout)
            if any("logcount-x-003-1-console.log.copy" in a and "Write-Output" in a for a in command):
                return ExecResult(0, "40 40\r\n", "")
            return res

        pve.exec = exec_
        pve2, note = self._log_count_on_a_managed_seat({"platform": "a moved line\n", "console": "moved twice\nmoved\n"})
        self.assertIn("18 bytes read of its 40", note)
        self.assertIn("no count kept", note)
        self.assertIsNone(self.services.board.log_count("c1", "moved"), note)

    def test_a_runs_respawn_hours_reach_the_server_through_the_overlay(self):
        """train-42's death reads: a respawn inside a run, the server's npcRespawnHours over the master's 240."""
        files = self._settings_files()
        run_id, body = self._run("id: t-respawn\nclients: [c1]\nserver: {npcRespawnHours: 1}\nsteps:\n  - c1: connect\n")
        self.assertEqual(body["verdict"], "green", body)
        laid = json.loads((self.tmp / "server-settings-run.json").read_text())
        self.assertEqual(laid["npcRespawnHours"], 1.0)
        self.assertEqual(laid["npcEnabled"], False, "the version's file kept beside the knob")

    def test_a_runs_handoff_settle_reaches_the_server_through_the_overlay(self):
        """m3-handoff-settle's window as the run's own: 0 turns the settle off, the reliable placement alone."""
        files = self._settings_files()
        run_id, body = self._run("id: t-settle\nclients: [c1]\nserver: {handoffPassSettleMs: 0}\nsteps:\n  - c1: connect\n")
        self.assertEqual(body["verdict"], "green", body)
        laid = json.loads((self.tmp / "server-settings-run.json").read_text())
        self.assertEqual(laid["handoffPassSettleMs"], 0)
        self.assertEqual(laid["npcEnabled"], False, "the version's file kept beside the knob")

    def test_a_runs_npc_roll_level_reaches_the_server_through_the_overlay(self):
        """x-fate-dress-bleak v6: the Temple's leveled lists rolled at 25 for everyone, so a respawn can swap its pick."""
        files = self._settings_files()
        run_id, body = self._run("id: t-roll\nclients: [c1]\nserver: {npcRollLevel: 25}\nsteps:\n  - c1: connect\n")
        self.assertEqual(body["verdict"], "green", body)
        laid = json.loads((self.tmp / "server-settings-run.json").read_text())
        self.assertEqual(laid["npcRollLevel"], 25)
        self.assertEqual(laid["npcEnabled"], False, "the version's file kept beside the knob")

    def test_a_runs_world_globals_reach_the_server_through_the_overlay(self):
        """ADR-068 rung 4's x-world-globals-rate and b-world-global: a world streamer elected for that run alone, the
        version's own file (and so the lab's default, off) untouched."""
        files = self._settings_files()
        run_id, body = self._run("id: t-globals\nclients: [c1]\nserver: {worldGlobals: true}\nsteps:\n  - c1: connect\n")
        self.assertEqual(body["verdict"], "green", body)
        overlay = self.tmp / "server-settings-run.json"
        self.assertEqual(self._up_env()["SERVER_SETTINGS"], str(overlay))
        laid = json.loads(overlay.read_text())
        self.assertIs(laid["worldGlobals"], True)
        self.assertEqual(laid["npcEnabled"], False, "the version's file kept beside the knob")
        self.assertNotIn("worldGlobals", json.loads(files["1.6.1170"].read_text()), "the version's own file is untouched")

    def test_a_runs_time_scale_and_cures_reach_the_server_through_the_overlay(self):
        """ADR-068 rung 5's vampire probes (8(b)): the run's own clock rate from an epoch of its own, kept through a restart
        inside the run (a rate multiplies all the time since the epoch, so the file's would jump the calendar), and the
        run's own cure list, [] lifting every cure (D-T3 B); the version's own file untouched."""
        files = self._settings_files()
        ticks = iter(range(1_800_000_000, 1_800_000_100, 7))
        self.services.runner._wall = lambda: float(next(ticks))
        run_id, body = self._run("id: t-vamp\nclients: [c1]\nserver: {timeScale: 1440, cureSpells: []}\nsteps:\n  - c1: connect\n")
        self.assertEqual(body["verdict"], "green", body)
        overlay = self.tmp / "server-settings-run.json"
        self.assertEqual(self._up_env()["SERVER_SETTINGS"], str(overlay))
        laid = json.loads(overlay.read_text())
        self.assertEqual(laid["cureSpells"], [])
        self.assertEqual(laid["time"]["timeScale"], 1440.0)
        self.assertRegex(laid["time"]["epoch"], r"^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$")
        self.assertNotIn("start", laid["time"], "the file's start date, as a gameHour run's but for the hour")
        first = laid["time"]["epoch"]
        self.assertNotIn("cureSpells", json.loads(files["1.6.1170"].read_text()), "the version's own file is untouched")
        laid_at, system = [], self.services.system
        real_run = system.run

        def run(cmd, timeout=120.0, env=None):
            if cmd[:2] == ["docker", "compose"] and ("up" in cmd or "restart" in cmd):
                laid_at.append(json.loads(overlay.read_text())["time"]["epoch"])
            return real_run(cmd, timeout, env)

        system.run = run
        run_id, body = self._run("id: t-vamp2\nclients: [c1]\nserver: {timeScale: 1440}\nsteps:\n  - c1: connect\n"
                                 "  - wait: 1\n  - server: restart\n")
        self.assertEqual(body["verdict"], "green", body)
        self.assertEqual(len(laid_at), 2, laid_at)
        self.assertEqual(laid_at[0], laid_at[1], "the restart lays the run's own epoch again")
        laid = json.loads(overlay.read_text())
        self.assertNotEqual(laid["time"]["epoch"], first, "each run's rate starts at its own start")
        ups = [env for cmd, env in zip(self.services.system.commands, self.services.system.envs)
               if cmd[:2] == ["docker", "compose"] and ("up" in cmd or "restart" in cmd)]
        self.assertGreaterEqual(len(ups), 2, self.services.system.commands)
        self.assertNotIn("cureSpells", laid, "a run that names no cures keeps the file's")
        rec = self.services.runner.last_run
        self.assertEqual(rec.clock_epoch, laid["time"]["epoch"], "the restart laid the run's own epoch again")

    def test_a_runs_cure_must_name_a_plugin_of_its_load_order(self):
        """The server matches a cure's plugin case for case and skips an unresolved one silently (fork FormDesc.cpp:62-70,
        ActionListener.cpp:6765-6770): a cure naming a plugin the run's load order lacks, or one in another case, is the
        run's settings error before the server starts, never a cure the probe believes it laid."""
        files = self._settings_files()
        files["1.6.1170"].write_text(json.dumps({"name": "thuum lab", "npcEnabled": False,
                                                 "loadOrder": ["/srv/skymp/esm/Skyrim.esm", "/srv/skymp/esm/Update.esm"]}) + "\n")
        run_id, body = self._run('id: t-cure\nclients: [c1]\nserver: {cureSpells: ["b8780:Skyrim.esm"]}\nsteps:\n  - c1: connect\n')
        self.assertEqual(body["verdict"], "green", body)
        self.assertEqual(json.loads((self.tmp / "server-settings-run.json").read_text())["cureSpells"], ["b8780:Skyrim.esm"])
        for cure in ("b8780:skyrim.esm", "b8780:Dawnguard.esm"):
            with self.subTest(cure=cure):
                run_id, body = self._run(f'id: t-cure-bad\nclients: [c1]\nserver: {{cureSpells: ["{cure}"]}}\nsteps:\n  - c1: connect\n')
                self.assertNotEqual(body["verdict"], "green", body)
                self.assertTrue(any("E_RUN_SETTINGS" in f["error"] and cure in f["error"] for f in body["failures"]), body["failures"])
        self.assertNotIn("cureSpells", json.loads(files["1.6.1170"].read_text()), "the version's own file is untouched")

    def test_a_runs_game_hour_starts_the_servers_clock_through_the_overlay(self):
        files = self._settings_files()
        run_id, body = self._run("id: t-hour\nclients: [c1]\nserver: {gameHour: 7.9}\nsteps:\n  - c1: connect\n")
        self.assertEqual(body["verdict"], "green", body)
        overlay = self.tmp / "server-settings-run.json"
        self.assertEqual(self._up_env()["SERVER_SETTINGS"], str(overlay))
        laid = json.loads(overlay.read_text())
        self.assertEqual(laid["time"]["start"], {"hour": 7.9})
        self.assertRegex(laid["time"]["epoch"], r"^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$")
        self.assertIs(laid["npcEnabled"], False, "the version's own npcEnabled, untouched by a game hour alone")

    def test_npc_enabled_is_laid_over_the_versions_settings_for_that_run(self):
        files = self._settings_files()
        run_id, body = self._run("id: t-npc\nclients: [c1]\nserver: {npcEnabled: true}\nsteps:\n  - c1: connect\n")
        self.assertEqual(body["verdict"], "green", body)
        overlay = self.tmp / "server-settings-run.json"
        self.assertEqual(self._up_env()["SERVER_SETTINGS"], str(overlay))
        laid = json.loads(overlay.read_text())
        self.assertIs(laid["npcEnabled"], True)
        self.assertEqual(laid["loadOrder"], ["1.6.1170"], "the run's version's file, the rest unchanged")
        self.assertIs(json.loads(files["1.6.1170"].read_text())["npcEnabled"], False, "the version's own file is untouched")
        # a run that names no npcEnabled mounts the version's file itself
        run_id, body = self._run("id: t-plain\nclients: [c1]\nsteps:\n  - c1: connect\n")
        self.assertEqual(self._up_env()["SERVER_SETTINGS"], str(files["1.6.1170"]))


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

    def _post_turning(self, path, body):
        import threading

        out = {}
        t = threading.Thread(target=lambda: out.update(r=self.client.post(path, json=body)))
        t.start()
        deadline = time.time() + 10
        while t.is_alive() and time.time() < deadline:
            self.doubles.turn()
            time.sleep(0.02)
        t.join(5)
        return out["r"]

    def test_a_seats_perks_go_to_its_game_and_stay_until_the_release(self):
        # Eli, 2026-10-20: "you need to be writing what perks i need to give characters in playtests or giving
        # them yourselves"
        self._hold()
        r = self._post_turning("/lab/clients/c1/perks", {"ids": [0x7934B]})
        self.assertEqual(r.status_code, 200, r.text)
        self.assertEqual(r.json()["result"]["added"], [0x7934B])
        self.assertIn(("c1", "add-perks", {"ids": [0x7934B], "keep": True}), self.doubles.seen)
        self.assertEqual(self.client.get("/lab/status").json()["perks"], {"c1": [0x7934B]})
        self.assertEqual(self.client.post("/lab/release").status_code, 200)
        self.assertEqual(self.client.get("/lab/status").json()["perks"], {}, "the playtest's seats end with its hold")

    def test_a_seats_perks_need_a_playtest_hold_and_perk_ids(self):
        body = {"ids": [0x7934B]}
        self.assertEqual(self.client.post("/lab/clients/c1/perks", json=body).status_code, 409)
        self._hold(reason="numidium: a staging")
        self.assertEqual(self.client.post("/lab/clients/c1/perks", json=body).status_code, 409)
        self._hold()
        for bad in ({}, {"ids": "7934b"}, {"ids": [True]}, {"ids": ["7934b:Skyrim.esm"]}, {"ids": [0]}, [0x7934B]):
            self.assertEqual(self.client.post("/lab/clients/c1/perks", json=bad).status_code, 400, bad)
        self.assertEqual(self.client.post("/lab/clients/c9/perks", json=body).status_code, 404)
        self.assertEqual(self.client.get("/lab/status").json()["perks"], {})

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


LOGCOUNT = """
id: x-logcount
clients: [c1]
server: {snapshot: clean}
timeout_s: 30
steps:
  - c1: connect
  - c1: log-count {pattern: "claim 13491"}
  - assert:
      - c1.log_count("claim 13491") == 2
"""

# a seat's pattern inside an until with no log-count step first, named by two expressions
UNTIL_LOGCOUNT = """
id: x-until-logcount
clients: [c1]
server: {snapshot: clean}
timeout_s: 30
steps:
  - c1: connect
  - until: {within: 30, every: 0.1, expect: ['c1.log_count("scene [0-9a-f]+ started") >= 1', 'c1.log_count("scene [0-9a-f]+ started") < 3']}
"""


class LogCount(RunTests):
    """log-count copies the seat's Skyrim Platform log and lab-driver's console tee with a read that shares write
    access (the tee is open while the game prints: b-npc-stream-voice 20261028-063409 read 0 from a failed copy)."""

    def _seat(self):
        from labapi.guests import Guest

        self.services.tables.guests["fake-c1"] = Guest("fake-c1", 901, "127.0.0.1", "qemu", "client", True, "clean-sp", "c1")
        return self.services.control._b

    def _console(self, pve):
        return pve.game_dir + "\\" + self.settings.client_console_log

    def test_both_logs_are_counted_through_shared_read_copies(self):
        pve = self._seat()
        pve.files[self.settings.client_driver_log] = "claim 13491 sent on E\nother\n"
        pve.files[self._console(pve)] = "x\nclaim 13491 granted\n"
        run_id, body = self._run(LOGCOUNT)
        self.assertEqual(body["verdict"], "green", body)
        copies = [c for c in pve.calls if c[:2] == ("exec", 901) and any("logcount-" in a and "ReadWrite" in a for a in c[2])]
        self.assertEqual(len(copies), 2, pve.calls)

    def test_a_console_tee_not_there_counts_as_empty(self):
        pve = self._seat()
        pve.files[self.settings.client_driver_log] = "claim 13491 sent on E\nclaim 13491 granted\n"
        run_id, body = self._run(LOGCOUNT)
        self.assertEqual(body["verdict"], "green", body)

    def test_an_unreadable_log_keeps_no_count(self):
        # the Skyrim Platform log never copies: three tries, then no count, so the assert cannot read it as 0
        pve = self._seat()
        pve.files[self._console(pve)] = "claim 13491 sent on E\nclaim 13491 granted\n"
        run_id, body = self._run(LOGCOUNT)
        self.assertNotEqual(body["verdict"], "green", body)
        tries = [c for c in pve.calls if c[:2] == ("exec", 901) and any("logcount-" in a and ".log.copy" in a and "-console" not in a for a in c[2])]
        self.assertEqual(len(tries), 3, pve.calls)

    def _counting(self, pve, land):
        """The seat's exec with its Skyrim Platform log copies counted: land(n) runs after the nth copy."""
        real_exec = pve.exec
        copies = {"n": 0}

        def exec_(guest, command, timeout):
            res = real_exec(guest, command, timeout)
            # the copy itself, its shared-read open (each copy's removal once read names it too)
            if any("logcount-" in a and ".log.copy" in a and "-console" not in a and "ReadWrite" in a for a in command):
                copies["n"] += 1
                land(copies["n"])
            return res

        pve.exec = exec_
        return copies

    def test_an_until_counts_a_seats_logs_anew_each_poll(self):
        """x-npc-death-freeze and x-scene-guest: a seat's log_count inside an until is counted anew before each poll by
        a log-count step's own copies, so a line that lands mid-until holds it with no step first; a pattern two
        expressions name is copied once a poll."""
        pve = self._seat()
        log = self.settings.client_driver_log
        pve.files[log] = "nothing yet\n"

        def land(n):
            if n == 2:  # the line lands after the second poll's copy
                pve.files[log] += "scene 7e3b1 started on 13483\n"

        copies = self._counting(pve, land)
        run_id, body = self._run(UNTIL_LOGCOUNT)
        self.assertEqual(body["verdict"], "green", body)
        until = next(s for s in body["steps"] if s.get("kind") == "until")
        self.assertIn("held after", until["note"], until)
        self.assertIn("3 poll(s)", until["note"], until)
        self.assertEqual(copies["n"], 3, "one copy of the log a poll, though two expressions name the pattern")
        self.assertEqual(self.services.board.log_count("c1", "scene [0-9a-f]+ started"), 1)  # kept as a step's count is

    def _held_count_copies(self, pve):
        """Each log-count copy a Create names refused while held, as on the seat, and the first run's first Skyrim
        Platform log copy held for good: its removals answer still there. Returns the copies made, in order."""
        from labapi.proxmox import ExecResult

        plain_exec = pve.exec
        held, made = set(), []

        def exec_(guest, command, timeout):
            joined = " ".join(command)
            create = re.search(r"\[IO\.File\]::Create\('([^']+\\logcount-[^']+)'\)", joined)
            if create and create.group(1) in held:  # a file held open refuses a Create on the seat
                pve.calls.append(("exec", guest.vmid, tuple(command)))
                return ExecResult(1, "", "The process cannot access the file because it is being used by another process.")
            if create and "-console" not in create.group(1):
                made.append(create.group(1))
            removal = re.search(r"Remove-Item -LiteralPath '([^']+)' -Force", joined)
            if removal and made and removal.group(1) == made[0]:  # the first copy, held for good
                held.add(made[0])
                pve.calls.append(("exec", guest.vmid, tuple(command)))
                return ExecResult(0, "True\r\n", "")
            return plain_exec(guest, command, timeout)

        pve.exec = exec_
        return made

    def test_a_copy_held_for_good_spoils_one_poll_of_its_until(self):
        """Every poll of an until counts at the same step index, and its copies shared one name a step, so a copy still
        there after its removal's last try made every later poll's Create of that name fail and the until could never
        hold. Each count's copies now carry their run and their own number (logcount-<run>-<index>-<n>), so a copy held
        for good spoils its own poll alone: a note, no fault, and the until still holds on a later poll (the review of
        b1f2ffd4, nit 2). The relaunch's soft cleaning (logcount-*.log.copy) takes the new names."""
        import fnmatch

        pve = self._seat()
        log = self.settings.client_driver_log
        pve.files[log] = "nothing yet\n"
        made = self._held_count_copies(pve)

        def land(n):
            if n == 2:  # the line lands after the second poll's copy
                pve.files[log] += "scene 7e3b1 started on 13483\n"

        self._counting(pve, land)
        run_id, body = self._run(UNTIL_LOGCOUNT)
        self.assertEqual(body["verdict"], "green", body)
        until = next(s for s in body["steps"] if s.get("kind") == "until")
        self.assertIn("held after", until["note"], until)
        self.assertIn("3 poll(s)", until["note"], until)
        index = until["index"]
        self.assertEqual(made, [f"C:\\sky-lab\\logcount-{run_id}-{index:03d}-{n}.log.copy" for n in (1, 2, 3)])
        held = _held_note("log-count: c1's Skyrim Platform log", made[0])
        self.assertTrue([n for n in body["notes"] if re.fullmatch(held, n)], body["notes"])
        self.assertEqual(self.services.runner.seats["c1"].force, "")
        for name in (f"logcount-{run_id}-{index:03d}-3.log.copy", f"logcount-{run_id}-{index:03d}-3-console.log.copy",
                     f"logcount-{index:03d}-3.log.copy", "logcount-052-console.log.copy"):
            self.assertTrue(fnmatch.fnmatch(name, "logcount-*.log.copy"), name)

    def test_a_copy_held_in_one_run_leaves_the_next_runs_count_alone(self):
        """A held copy no longer rolls its seat back, so it can outlast its run: under one name a step index and count,
        the next run's count at that index met it, its Create refused, and kept no count, so its claim raised. Each
        run's copies carry the run, so the next run's count is its own."""
        pve = self._seat()
        pve.files[self.settings.client_driver_log] = "claim 13491 sent on E\nclaim 13491 granted\n"
        made = self._held_count_copies(pve)
        run1, body1 = self._run(LOGCOUNT)
        self.assertEqual(body1["verdict"], "green", body1)
        self.assertIn(made[0], pve.files, "the first run's copy, held, stays on the seat")
        run2, body2 = self._run(LOGCOUNT)
        self.assertEqual(body2["verdict"], "green", body2)
        self.assertEqual(len(made), 2, made)
        self.assertNotEqual(made[0], made[1])
        self.assertIn(run1, made[0])
        self.assertIn(run2, made[1])
        self.assertEqual(self.services.board.log_count("c1", "claim 13491"), 2)

    def test_an_assert_reads_its_log_count_step_and_counts_nothing(self):
        """an assert keeps the seat's last log-count step: a line that lands after the step is not counted, and the
        assert copies no log (LOGCOUNT claims the step's 2)."""
        pve = self._seat()
        log = self.settings.client_driver_log
        pve.files[log] = "claim 13491 sent on E\nclaim 13491 granted\n"

        def land(n):
            if n == 1:  # right after the step's copy: a count taken anew at the assert would read 3
                pve.files[log] += "claim 13491 again\n"

        copies = self._counting(pve, land)
        run_id, body = self._run(LOGCOUNT)
        self.assertEqual(body["verdict"], "green", body)
        self.assertEqual(copies["n"], 1, pve.calls)

    def test_a_log_past_a_range_is_counted_whole_and_its_copies_removed(self):
        """log-count read each log whole into copies nobody removed or checked (the fresh review of e8d8de9b, nit 4): a
        log past one range comes back in ranges and is decoded once, so a line whose é straddles the boundary still
        matches, and each copy leaves the seat once read."""
        import asyncio

        from labapi.runner import READ_RANGE_BYTES as R
        from labapi.runner import RunRecord
        from labapi.scenario import Scenario

        pve = self._seat()
        platform = "a" * (R - 1) + "é moved\nmoved again\n"
        pve.files[self.settings.client_driver_log] = platform
        pve.files[self._console(pve)] = "moved é\n"
        rec = RunRecord("x", Scenario(id="x", clients=["c1"]), self.tmp, "now")
        ok, note = asyncio.run(self.services.runner._log_count(rec, 3, "c1", "é"))
        self.assertTrue(ok, note)
        self.assertEqual(self.services.board.log_count("c1", "é"), 2, note)
        n = len(platform.encode("utf-8"))
        self.assertIn(f"1 in its Skyrim Platform log, 1 in its console log; bytes {n} read of {n} copied of {n} on the seat, "
                      "9 read of 9 copied of 9 on the seat", note)
        self.assertEqual([c[3:] for c in pve.calls if c[:3] == ("file_read_range", 901, "C:\\sky-lab\\logcount-x-003-1.log.copy")],
                         [(0, R), (R, n - R)])
        self.assertFalse([p for p in pve.files if "logcount-" in p], "the copies leave the seat once read")
        self.assertEqual(rec.notes, [])

    def test_a_log_count_copy_is_tried_again_1_s_apart(self):
        """Eight committed untils poll seat counts in 25 s windows (b-lever-relay's two, x-lever-relay, x-lever-furn,
        x-lever-after-scene), and two 10 s pauses would spend about 20 s of one poll: log-count's copy is tried again
        1 s apart as it was, where the other fetches' tries are 10 s apart (the re-review of 486e80f3)."""
        import asyncio
        import dataclasses
        import types
        from unittest import mock

        from labapi import runner as runner_mod
        from labapi.runner import RunRecord
        from labapi.scenario import Scenario

        self._seat()  # no Skyrim Platform log on the seat: its copy fails each try
        slept = []

        async def sleep(seconds):
            slept.append(seconds)

        self.services.runner.s = dataclasses.replace(self.settings, time_scale=1.0)
        rec = RunRecord("x", Scenario(id="x", clients=["c1"]), self.tmp, "now")
        with mock.patch.object(runner_mod, "asyncio", types.SimpleNamespace(to_thread=asyncio.to_thread, sleep=sleep)):
            ok, note = asyncio.run(self.services.runner._log_count(rec, 3, "c1", "moved"))
        self.assertEqual(slept, [1.0, 1.0])
        self.assertIn("its copy failed three tries 1 s apart", note)
        self.assertIn("no count kept", note)

    def test_a_log_count_on_a_seat_whose_agent_is_down_keeps_no_count_at_once(self):
        """A log fetch found the seat's guest agent not running (RunRecord.agents_down): log-count tries nothing on it
        and keeps no count, so a claim on the seat's count raises (the re-review of 486e80f3, nit 2)."""
        import asyncio

        from labapi.runner import RunRecord
        from labapi.scenario import Scenario

        pve = self._seat()
        pve.files[self.settings.client_driver_log] = "claim 13491 sent on E\n"
        rec = RunRecord("x", Scenario(id="x", clients=["c1"]), self.tmp, "now")
        rec.agents_down["c1"] = ("E_PVE_EXEC: fake-c1: ResourceException: 500 Internal Server Error: QEMU guest agent is not running", True)
        ok, note = asyncio.run(self.services.runner._log_count(rec, 3, "c1", "claim 13491"))
        self.assertTrue(ok, note)
        self.assertEqual(note, "log-count: c1's logs unread, its guest agent found not running (E_PVE_EXEC: fake-c1: "
                               "ResourceException: 500 Internal Server Error: QEMU guest agent is not running); no count kept")
        self.assertIsNone(self.services.board.log_count("c1", "claim 13491"))
        self.assertFalse([c for c in pve.calls if c[0] == "exec"], pve.calls)

    def test_a_log_count_that_meets_a_dead_agent_marks_nothing(self):
        """Proxmox says "guest agent is not running" for any guest-ping not answered in 3 s, checked before every exec
        (qemu-server's QemuServer/Agent.pm at ec268ede5b, 91-99 and 123-129), so a busy agent reads as a dead one: a
        log-count whose three tries, 1 s apart, all meet it keeps no count and marks nothing, since a mark would starve
        every later count of the run, and the next count reads the seat (the check of 508697c3, SHOULD)."""
        import asyncio

        from labapi.proxmox import ProxmoxError
        from labapi.runner import RunRecord
        from labapi.scenario import Scenario

        pve = self._seat()
        pve.files[self.settings.client_driver_log] = "claim 13491 sent on E\n"
        plain_exec = pve.exec
        busy = {"left": 3}

        def exec_(guest, command, timeout):
            if busy["left"] and any("logcount-" in a and "ReadWrite" in a for a in command):
                busy["left"] -= 1
                pve.calls.append(("exec", guest.vmid, tuple(command)))
                raise ProxmoxError(f"E_PVE_EXEC: {guest.name}: ResourceException: 500 Internal Server Error: QEMU guest agent is not running")
            return plain_exec(guest, command, timeout)

        pve.exec = exec_
        rec = RunRecord("x", Scenario(id="x", clients=["c1"]), self.tmp, "now")
        ok, note = asyncio.run(self.services.runner._log_count(rec, 3, "c1", "claim 13491"))
        self.assertIn("its copy failed three tries 1 s apart, the last E_PVE_EXEC", note)
        self.assertIn("no count kept", note)
        self.assertNotIn("c1", rec.agents_down)
        self.assertIsNone(self.services.board.log_count("c1", "claim 13491"), note)
        ok, note = asyncio.run(self.services.runner._log_count(rec, 4, "c1", "claim 13491"))
        self.assertEqual(self.services.board.log_count("c1", "claim 13491"), 1, note)

    def test_a_log_count_copy_held_open_is_a_note_and_no_fault(self):
        """A copy the agent holds past its removal's window, log-count's as a run log's: a note naming it and its seat,
        and no fault; the count stands, its read having come back whole."""
        from labapi.proxmox import ExecResult

        pve = self._seat()
        pve.files[self.settings.client_driver_log] = "claim 13491 sent on E\nclaim 13491 granted\n"
        plain_exec = pve.exec

        def exec_(guest, command, timeout):
            if re.search(r"Remove-Item -LiteralPath 'C:\\sky-lab\\logcount-[^']+-001-1\.log\.copy' -Force", " ".join(command)):
                pve.calls.append(("exec", guest.vmid, tuple(command)))
                return ExecResult(0, "True\r\n", "")  # still there: the agent holds it
            return plain_exec(guest, command, timeout)

        pve.exec = exec_
        run_id, body = self._run(LOGCOUNT)
        self.assertEqual(body["verdict"], "green", body)
        held = _held_note("log-count: c1's Skyrim Platform log", f"C:\\sky-lab\\logcount-{run_id}-001-1.log.copy")
        self.assertTrue([n for n in body["notes"] if re.fullmatch(held, n)], body["notes"])
        self.assertEqual(self.services.runner.seats["c1"].force, "")

    def test_a_log_count_copy_still_there_once_then_gone_is_no_fault(self):
        """log-count's copies go through the one removal helper every read file's does (Runner._removed):
        x-console-arm's logcount-052-console.log.copy, still there just after its small read, cost c1 a 73.1 s rollback
        in train 52's stage. A copy still there at its removal's first try and gone at the second keeps its count and
        faults nothing, one note naming the try."""
        from labapi.proxmox import ExecResult

        pve = self._seat()
        pve.files[self.settings.client_driver_log] = "claim 13491 sent on E\nclaim 13491 granted\n"
        plain_exec = pve.exec
        held_once = {"left": 1}

        def exec_(guest, command, timeout):
            if (re.search(r"Remove-Item -LiteralPath 'C:\\sky-lab\\logcount-[^']+-001-1\.log\.copy' -Force", " ".join(command))
                    and held_once["left"]):
                held_once["left"] -= 1
                pve.calls.append(("exec", guest.vmid, tuple(command)))
                return ExecResult(0, "True\r\n", "")  # a moment's hold; the next try removes it
            return plain_exec(guest, command, timeout)

        pve.exec = exec_
        removed = []
        real = self.services.runner._removed

        async def spy(rec, g, attempt, whats, died, what):
            removed.extend(whats)
            return await real(rec, g, attempt, whats, died, what)

        self.services.runner._removed = spy
        run_id, body = self._run(LOGCOUNT)
        self.assertEqual(body["verdict"], "green", body)  # LOGCOUNT's claim reads the step's count, kept
        self.assertIn(f"C:\\sky-lab\\logcount-{run_id}-001-1.log.copy", removed)
        self.assertEqual([n for n in body["notes"] if "logcount-" in n],
                         [f"log-count: c1's Skyrim Platform log: C:\\sky-lab\\logcount-{run_id}-001-1.log.copy still there at "
                          "its removal's try 1 of 4, tried again in 1 s"])
        self.assertEqual(self.services.runner.seats["c1"].force, "")
        self.assertFalse([p for p in pve.files if "logcount-" in p], "the copy gone at its second try")

    def _its_copy_answer_lost(self, leave: str | None) -> str:
        """log-count at step 7 whose Skyrim Platform log copy exec ends with its answer lost (E_PVE_EXEC_LOST), leaving
        `leave` as the copy (None: no copy), the log holding the line an absence claim says never came (the check of
        508697c3's demos, lost_copy_demo.py and lost_copy_empty_demo.py); the step's note."""
        import asyncio

        from labapi.proxmox import ProxmoxError
        from labapi.runner import RunRecord
        from labapi.scenario import Scenario

        pve = self._seat()
        pve.files[self.settings.client_driver_log] = "E_RACE_PERMIT refused\n"
        pve.files[self._console(pve)] = "console\n"
        copy = "C:\\sky-lab\\logcount-x-007-1.log.copy"
        plain_exec = pve.exec

        def exec_(guest, command, timeout):
            if f"[IO.File]::Create('{copy}')" in " ".join(command):
                pve.calls.append(("exec", guest.vmid, tuple(command)))
                if leave is not None:
                    pve.files[copy] = leave
                raise ProxmoxError(f"E_PVE_EXEC_LOST: pid 42 on {guest.name}: the guest agent no longer knows it; the "
                                   "command ended and its answer is lost")
            return plain_exec(guest, command, timeout)

        pve.exec = exec_
        rec = RunRecord("x", Scenario(id="x", clients=["c1"]), self.tmp, "now")
        ok, note = asyncio.run(self.services.runner._log_count(rec, 7, "c1", "E_RACE_PERMIT"))
        self.assertTrue(ok, note)
        self.assertIsNone(self.services.board.log_count("c1", "E_RACE_PERMIT"), note)
        self.assertIn("no count kept", note)
        return note

    def test_a_lost_copy_answer_that_left_no_copy_keeps_no_count(self):
        """The copy's length read after a lost answer finds no copy, which is a copy that failed, not a source not
        there: read as the tee's absence (SeatFileMissing), it counted the log as empty, and c1.log_count("E_RACE_PERMIT")
        == 0 passed on a log that holds the line (the check of 508697c3)."""
        note = self._its_copy_answer_lost(None)
        self.assertIn("its copy C:\\sky-lab\\logcount-x-007-1.log.copy is not there, the copy's own answer lost (E_PVE_EXEC_LOST", note)

    def test_a_lost_copy_answer_that_left_an_empty_copy_keeps_no_count(self):
        """log-count's copy runs without Stop, so a source open that failed still creates an empty copy, whose length
        the lost answer's fallback read as 0: only the copy exec's own "N M" proves a copy whole, so a lost answer
        keeps no count whatever the copy holds (the check of 508697c3)."""
        note = self._its_copy_answer_lost("")
        self.assertIn("c1's Skyrim Platform log unread (its copy's exec answer was lost, so the copy is unchecked)", note)

    def test_the_live_patterns_are_named_once_for_the_holders_given(self):
        from labapi.runner import _log_count_patterns

        exprs = ['c1.log_count("a") >= 1 and server.log_count("b") == 0', 'c1.log_count("a") < 3', 'c2.log_count("c") == 0',
                 "c1.log_count(", 'c1.view(c2).x == 0']
        self.assertEqual(_log_count_patterns(exprs, ["server"]), [("server", "b")])
        self.assertEqual(_log_count_patterns(exprs, ["server", "c1"]), [("c1", "a"), ("server", "b")])


RESET = """
id: t2-reset
clients: [c1]
server: {snapshot: clean}
timeout_s: 30
steps:
  - c1: connect
  - c1: dump-state
"""


@needs_deps
class ClientResets(RunTests):
    """ADR-036: between runs a seat relaunches its game instead of rolling its VM back, two vfio resets of its GPU,
    unless something asks for the rollback; LAB_CLIENT_RESET picks the mode, rollback until the first live day."""

    def _seat(self, mode="relaunch", **extra):
        import dataclasses

        from labapi.guests import Guest

        self.services.runner.s = dataclasses.replace(self.settings, client_reset=mode, **extra)
        self.services.tables.guests["fake-c1"] = Guest("fake-c1", 901, "127.0.0.1", "qemu", "client", True, "clean-sp", "c1")
        pve = self.services.control._b
        pve.snaps[901] = [{"name": "clean-sp", "parent": None, "description": "m3-turbo client cf29e5f6, 2026-10-29"},
                          {"name": "current", "parent": "clean-sp"}]
        return pve

    def _warm(self, **extra):
        """A seat whose first run since lab-api started rolled it back, so its next run may relaunch it."""
        pve = self._seat(**extra)
        run_id, body = self._run(RESET)
        self.assertEqual(body["client_reset"]["c1"]["kind"], "rollback", body)
        self.assertEqual(body["client_reset"]["c1"]["reason"], "no run on it since lab-api started")
        return pve

    def _reset(self, text=RESET):
        run_id, body = self._run(text)
        return body["client_reset"]["c1"], body

    @staticmethod
    def _vm_resets(pve, since=0):
        return [c for c in pve.calls[since:] if c[0] in ("stop", "rollback", "start")]

    def test_a_before_log_copy_held_after_its_read_is_a_note_and_the_reset_cleans_it(self):
        """After a quiet spell a run keeps the seat's log as <client>-before.log before the resets: a copy the agent then
        holds open took rec.rollback, this run's own reset rolling the seat back for it (the fresh review of e8d8de9b,
        nit 5). Now it is a note, the seat relaunches, and that relaunch's cleaning takes the seat's log copies as far
        as they go, as the reset that removes it."""
        from labapi.proxmox import ExecResult

        pve = self._warm(before_logs_quiet_s=600.0)
        self.services.runner._last_run_ended_wall = None  # a quiet spell, as after lab-api's start
        pve.files["C:\\sky-lab\\c1-before.log"] = "the playtest's platform log\n"
        plain_exec = pve.exec

        def exec_(guest, command, timeout):
            if re.search(r"Remove-Item -LiteralPath 'C:\\sky-lab\\[^']+-c1-before\.log' -Force", " ".join(command)):
                pve.calls.append(("exec", guest.vmid, tuple(command)))
                return ExecResult(0, "True\r\n", "")  # still there: the agent holds it
            return plain_exec(guest, command, timeout)

        pve.exec = exec_
        reset, body = self._reset()
        held = _held_note("c1-before.log", f"C:\\sky-lab\\{body['run']}-c1-before.log")
        self.assertEqual((body["verdict"], reset["kind"], reset["reason"]), ("green", "relaunch", ""), body)
        self.assertTrue([n for n in body["notes"] if re.fullmatch(held, n)], body["notes"])
        self.assertIn("c1-before.log", body["artifacts"])
        self.assertEqual(len(pve.relaunches), 1)
        self.assertIn("\nClean $lab @('c1.log', 'c1-*.log', '*-c1.log', '*-c1-*.log') @() -soft\n", pve.relaunches[0])
        self.assertEqual(self.services.runner.seats["c1"].force, "")

    def test_a_trace_copy_held_after_a_before_run_fetch_is_a_note_and_the_seat_relaunches(self):
        """A hand-started trace is fetched before the seats' resets (_traces_before_rollback): a copy the agent then
        holds open rolled the seat back in this run's own reset (the re-review of 5b982dc6, nit 1). Now it is a note,
        and the seat relaunches, whose cleaning takes the trace copies as far as they go."""
        from labapi.proxmox import ExecResult

        pve = self._warm()
        pve.files["C:\\sky-lab\\frida\\hand-trace.js.log"] = '{"leak": 1}\n'
        self.services.runner.frida_started.append(("c1", "hand-trace.js"))
        plain_exec = pve.exec

        def exec_(guest, command, timeout):
            if re.search(r"Remove-Item -LiteralPath '[^']+hand-trace\.js\.log\.copy' -Force", " ".join(command)):
                pve.calls.append(("exec", guest.vmid, tuple(command)))
                return ExecResult(0, "True\r\n", "")  # still there: the agent holds it
            return plain_exec(guest, command, timeout)

        pve.exec = exec_
        reset, body = self._reset()
        held = _held_note("frida hand-trace.js.log", "C:\\sky-lab\\frida\\hand-trace.js.log.copy")
        self.assertEqual((body["verdict"], reset["kind"], reset["reason"]), ("green", "relaunch", ""), body)
        self.assertTrue([n for n in body["notes"] if re.fullmatch(held, n)], body["notes"])
        self.assertEqual(len(pve.relaunches), 1)
        self.assertIn("Clean (Join-Path $lab 'frida') @('*.js.out.copy', '*.js.log.copy') @() -soft", pve.relaunches[0])
        self.assertEqual(self.services.runner.seats["c1"].force, "")

    def test_rollback_mode_rolls_back_every_run_and_says_so(self):
        pve = self._seat(mode="rollback")
        for _ in range(2):
            reset, body = self._reset()
            self.assertEqual(body["verdict"], "green", body)
            self.assertEqual((reset["kind"], reset["reason"]), ("rollback", "LAB_CLIENT_RESET is rollback"))
            self.assertTrue(any(n.startswith("c1 rolled back in ") and n.endswith(" s: LAB_CLIENT_RESET is rollback") for n in body["notes"]), body["notes"])
        self.assertEqual(pve.relaunches, [])
        self.assertEqual([c for c in pve.calls if c[0] == "rollback"], [("rollback", 901, "clean-sp")] * 2)
        self.assertNotIn(("status", 901), pve.calls, "rollback mode asks nothing it does not need")

    def test_a_clean_seat_relaunches_with_no_rollback_and_records_the_same_build(self):
        pve = self._seat()
        reset1, body1 = self._reset()
        mark = len(pve.calls)
        reset2, body2 = self._reset()
        self.assertEqual(body2["verdict"], "green", body2)
        self.assertEqual(self._vm_resets(pve, mark), [], "the VM was neither stopped, rolled back nor started")
        self.assertEqual(len(pve.relaunches), 1)
        self.assertEqual((reset2["kind"], reset2["since_rollback"], reset2["reason"]), ("relaunch", 1, ""))
        self.assertIsInstance(reset2["seconds"], float)
        rollback_clients = next(p for p in body2["phases"] if p["name"] == "rollback-clients")
        self.assertEqual(rollback_clients["note"], "c1=fake-c1 (relaunched)")
        self.assertTrue(any(n.startswith("c1 relaunched in ") and n.endswith(" s, 1 run since its rollback, 3 files cleaned") for n in body2["notes"]),
                        body2["notes"])
        # the snapshot the disk descends from, as a rolled-back seat records it (gate-cite.py's check 2)
        self.assertEqual(body2["build"]["clients"], body1["build"]["clients"])
        self.assertEqual(body2["build"]["clients"]["c1"]["description"], "m3-turbo client cf29e5f6, 2026-10-29")
        result = json.loads((self.tmp / "results" / body2["run"] / "result.json").read_text())
        self.assertEqual(result["client_reset"]["c1"]["kind"], "relaunch")
        # the count goes on: the next run is the second since the rollback
        self.assertEqual(self._reset()[0]["since_rollback"], 2)

    def test_the_relaunch_stops_the_tasks_and_the_game_cleans_named_paths_and_starts_a_fresh_launch(self):
        pve = self._warm()
        self._run(RESET.replace("  - c1: dump-state\n", "  - c1: racemenu-save {name: own-before}\n"))
        self._run(RESET)
        self.assertEqual(len(pve.relaunches), 2)
        first, second = pve.relaunches
        # the hot push's mark is read before anything stops; then every sky-lab task, the launch task and the game;
        # the cleaning; the launch task's start last
        steps = ["hot.txt", "Get-ScheduledTask -TaskName 'sky-lab*'", "Stop-ScheduledTask -TaskName sky-lab-launch", "Stop-Process -Force",
                 "(Get-ScheduledTask -TaskName sky-lab-launch -ErrorAction SilentlyContinue).State -eq 'Running'",
                 "Clean (Join-Path $lab 'frida')", "Start-ScheduledTask -TaskName sky-lab-launch"]
        at = [first.index(s) for s in steps]
        self.assertEqual(at, sorted(at), steps)
        for named in ("Clean (Join-Path $lab 'frida') @('*.js', '*.js.out', '*.js.err', '*.js.log') @()",
                      "Clean (Join-Path $lab 'frida') @('*.js.out.copy', '*.js.log.copy') @() -soft",
                      # log-count's copies by their pattern alone, softly: the code before 9e37956b never removed one
                      "\nClean $lab @('logcount-*.log.copy') @() -soft\n",
                      # the log fetch's copies and the SKSE logs' of this seat, softly: a held one is a note now, and
                      # this is the reset that removes it
                      "\nClean $lab @('c1.log', 'c1-*.log', '*-c1.log', '*-c1-*.log') @() -soft\n",
                      "Clean (Join-Path $lab 'shots') @('*.png', '*.png.b64') @('*-burst')",
                      "Clean (Join-Path $lab 'screenshots') @('*.png') @()",
                      "Clean (Join-Path $lab 'burst') @('request.json', 'done.json') @()",
                      "Clean (Join-Path $lab 'input') @('request.json', 'done.json') @()",
                      "Clean (Join-Path $g 'Data\\SKSE\\Plugins\\CharGen\\Presets') $presets @()",
                      "Clean 'C:\\Users\\lab\\Documents\\My Games\\Skyrim Special Edition\\Saves' @('TESMODPLATFORM-*', 'Quicksave*', 'Autosave*') @()",
                      "Clean 'C:\\Users\\lab\\Documents\\My Games\\Skyrim Special Edition\\SKSE' @('skyrim-platform-pid*.log') @()"):
            self.assertIn(named, first)
        # skymp5-client's presets always, and by name the ones the seat's last run saved through lab-driver
        self.assertIn("$presets = @('thuum-*.jslot')", first)
        self.assertIn("$presets = @('thuum-*.jslot', 'own-before.jslot')", second)
        # never a wildcard over the lab folder, and the crash dumps stay (the run's end tells them by time)
        for script in (first, second):
            self.assertNotIn("C:\\sky-lab\\*", script)
            self.assertNotIn("dumps", script)

    def test_the_scenario_can_ask_for_a_rollback(self):
        pve = self._warm()
        reset, body = self._reset("client: rollback\n" + RESET.lstrip())
        self.assertEqual((reset["kind"], reset["reason"]), ("rollback", "the scenario says client: rollback"))
        self.assertEqual(pve.relaunches, [])

    def test_a_relaunch_steps_files_roll_the_next_run_back(self):
        pve = self._warm()
        files = RELAUNCH.replace("  - c1: relaunch\n", "  - c1: relaunch {files: [{rename: Data/SKSE/Plugins/hdtsmp64.dll, to: hdtsmp64.dll.off}]}\n")
        reset, body = self._reset(files)
        self.assertEqual((body["verdict"], reset["kind"]), ("green", "relaunch"), body)
        # the step's own stop takes the launch task down before the game, as relaunch_cmd does
        lever = next(base64.b64decode(c[2][-1]).decode("utf-16-le") for c in pve.calls
                     if c[0] == "exec" and "-EncodedCommand" in c[2] and "Rename-Item" in base64.b64decode(c[2][-1]).decode("utf-16-le"))
        self.assertLess(lever.index("Stop-ScheduledTask -TaskName sky-lab-launch"), lever.index("Stop-Process"))
        reset, body = self._reset()
        self.assertEqual(reset["kind"], "rollback")
        self.assertRegex(reset["reason"], r"^its last run \(\S+-relaunch\) changed files in its game folder")

    def test_a_fault_naming_the_seat_rolls_the_next_run_back(self):
        self._warm()
        self.state.actors[1].online = False  # c1 never logs in: E_RUN_CONNECT, a timeout naming it
        reset, body = self._reset()
        self.assertEqual((body["verdict"], reset["kind"]), ("red", "relaunch"), body)
        self.state.actors[1].online = True
        reset, body = self._reset()
        self.assertEqual(reset["kind"], "rollback")
        self.assertIn("ended in a fault: step 0, timeout: E_RUN_CONNECT", reset["reason"])
        # once rolled back the seat is clean again
        self.assertEqual(self._reset()[0]["kind"], "relaunch")

    def test_a_failed_game_check_rolls_the_next_run_back(self):
        from labapi.proxmox import ExecResult

        pve = self._warm()
        good, pve.game = pve.game, ExecResult(3, "", "no SkyrimSE process")
        reset, body = self._reset()
        self.assertEqual(body["verdict"], "error", body)
        pve.game = good
        reset, body = self._reset()
        self.assertEqual(reset["kind"], "rollback")
        self.assertIn("E_RUN_GAME: c1 (fake-c1): no running SkyrimSE.exe", reset["reason"])

    def test_an_unread_run_end_rolls_the_next_run_back(self):
        # the crash check counts dumps by time: one a lost answer missed would read as the next run's crash
        from labapi.proxmox import ProxmoxError

        pve = self._warm()
        real = pve.exec

        def lost(guest, command, timeout):
            if "-EncodedCommand" in command and "SkyrimSE.exe.*.dmp" in base64.b64decode(command[-1]).decode("utf-16-le"):
                raise ProxmoxError("E_PVE_EXEC: fake-c1: qga command 'guest-exec' failed - got timeout")
            return real(guest, command, timeout)

        pve.exec = lost
        reset, body = self._reset()
        self.assertEqual((body["verdict"], reset["kind"]), ("green", "relaunch"), body)
        pve.exec = real
        reset, body = self._reset()
        self.assertEqual(reset["kind"], "rollback")
        self.assertIn("the run's end could not read its game", reset["reason"])

    def test_a_hot_mark_older_than_a_dist_is_removed_and_the_seat_relaunches(self):
        """sky-c1, 2026-10-30: a 10-29 03:35Z mark inside 3o's clean-m1-next, a dist laid over it at the stage, rolled
        the seat back at every run. The script removes a mark older than a games record (install-lab's lay) and goes on."""
        pve = self._warm()
        pve.relaunch_stale = "20261029T033547Z 4aa5b774 C:\\Games\\Skyrim Special Edition 1.6.1170\\Data\\Platform\\Plugins\\skymp5-client.js"
        reset, body = self._reset()
        self.assertEqual((body["verdict"], reset["kind"]), ("green", "relaunch"), body)
        script = pve.relaunches[-1]
        self.assertIn("$laid = @(Get-ChildItem -LiteralPath (Join-Path $lab 'games') -Filter '*.txt'", script)
        self.assertIn("$_.LastWriteTimeUtc -gt $mark.LastWriteTimeUtc", script)
        self.assertLess(script.index("$laid = "), script.index("Get-ScheduledTask -TaskName 'sky-lab*'"),
                        "the mark is judged before anything stops")
        self.assertTrue(any("a stale hot mark removed (20261029T033547Z 4aa5b774" in n for n in body["notes"]), body["notes"])

    def test_a_capture_file_still_held_at_the_relaunch_rolls_the_seat_back(self):
        """sky-c2, b-cloak-fight 20261030-053144: two .png.b64 sidecars a timed-out guest-file-close left open failed
        both relaunch tries and cost a rollback, so the capture folders are cleaned as far as they go, no try failing on
        one. A held file is now only a note at its own run (Runner._held), so one the next relaunch's cleaning still
        finds held outlived the run gap: the seat rolls back in that same reset, the held note costing a rollback only
        then (the fresh review of 5771141b, finding 1)."""
        pve = self._warm()
        pve.relaunch_held = ["C:\\sky-lab\\shots\\025.png.b64", "C:\\sky-lab\\shots\\032.png.b64"]
        mark = len(pve.calls)
        reset, body = self._reset()
        self.assertEqual((body["verdict"], reset["kind"]), ("green", "rollback"), body)
        self.assertEqual(reset["reason"], "its cleaning found 2 held open (C:\\sky-lab\\shots\\025.png.b64, "
                                          "C:\\sky-lab\\shots\\032.png.b64), kept past a run gap")
        self.assertEqual(len(pve.relaunches), 1, "the cleaning's find is the rollback's reason, not a relaunch failed")
        self.assertEqual(self._vm_resets(pve, mark), [("stop", 901), ("rollback", 901, "clean-sp"), ("start", 901)])
        script = pve.relaunches[-1]
        self.assertIn("Clean (Join-Path $lab 'shots') @('*.png', '*.png.b64') @('*-burst') -soft", script)
        self.assertIn("Clean (Join-Path $lab 'screenshots') @('*.png') @() -soft", script)
        self.assertNotIn("CharGen\\Presets') $presets @() -soft", script, "presets and saves still fail the try")

    def test_a_trace_copy_still_held_at_the_relaunch_rolls_the_seat_back(self):
        """sky-c1, x-quest-mode 20261030-131512: the runner's shared-read copy of the last run's story-location.js log,
        read back through the agent, failed both relaunch tries and cost a rollback. The copies go as far as they
        will, and the scripts and their own outputs still fail the try (one held means a Frida process outlived the
        stop); a copy the cleaning still finds held outlived the run gap, and rolls the seat back in that reset (the
        fresh review of 5771141b, finding 1)."""
        pve = self._warm()
        pve.relaunch_held = ["C:\\sky-lab\\frida\\story-location-20261030-131130-x-story-arrival-login-13.js.log.copy"]
        reset, body = self._reset()
        self.assertEqual((body["verdict"], reset["kind"]), ("green", "rollback"), body)
        self.assertEqual(reset["reason"], "its cleaning found 1 held open (C:\\sky-lab\\frida\\story-location-20261030-131130-"
                                          "x-story-arrival-login-13.js.log.copy), kept past a run gap")
        script = pve.relaunches[-1]
        self.assertIn("Clean (Join-Path $lab 'frida') @('*.js.out.copy', '*.js.log.copy') @() -soft", script)
        self.assertIn("Clean (Join-Path $lab 'frida') @('*.js', '*.js.out', '*.js.err', '*.js.log') @()\n", script)
        self.assertTrue(any(n.startswith("c1 rolled back in ") and n.endswith("kept past a run gap") for n in body["notes"]),
                        body["notes"])

    def test_a_hot_push_mark_rolls_the_seat_back_in_the_same_run(self):
        pve = self._warm()
        pve.hot_mark = "20261028T182237Z 29207fe2 C:\\Games\\Skyrim Special Edition 1.6.1170\\Data\\Platform\\Plugins\\skymp5-client.js"
        mark = len(pve.calls)
        reset, body = self._reset()
        self.assertEqual((body["verdict"], reset["kind"]), ("green", "rollback"), body)
        self.assertEqual(len(pve.relaunches), 1, "the relaunch read the mark and stopped nothing")
        self.assertEqual(self._vm_resets(pve, mark), [("stop", 901), ("rollback", 901, "clean-sp"), ("start", 901)])
        self.assertIn("C:\\sky-lab\\hot.txt marks a hot push on it (20261028T182237Z 29207fe2", reset["reason"])

    def test_a_vm_that_is_not_running_rolls_back(self):
        pve = self._warm()
        pve.statuses[901] = "stopped"
        reset, body = self._reset()
        self.assertEqual((reset["kind"], reset["reason"]), ("rollback", "its VM is stopped"))
        self.assertEqual(pve.relaunches, [])

    def test_a_seat_rolls_back_every_n_runs_as_a_floor(self):
        self._warm(relaunch_rollback_every=3)
        resets = [self._reset()[0] for _ in range(4)]
        self.assertEqual([(r["kind"], r["since_rollback"]) for r in resets], [("relaunch", 1), ("relaunch", 2), ("rollback", 3), ("relaunch", 1)])
        self.assertEqual(resets[2]["reason"], "3 runs since its last rollback (LAB_RELAUNCH_ROLLBACK_EVERY is 3)")

    def test_a_hold_and_a_clones_maintenance_roll_the_next_run_back(self):
        self._warm()
        self.assertEqual(self.client.post("/lab/hold", json={"minutes": 5, "reason": "playtest 39"}).status_code, 200)
        self.client.post("/lab/release")
        reset, body = self._reset()
        self.assertEqual((reset["kind"], reset["reason"]), ("rollback", "the lab was held since its last run (playtest 39)"))
        # a clone rolled back by hand (ADR-041 item 5) may stand on another snapshot than the table's: only a
        # rollback tells its build truly (this one is refused by the snapshot guard after it began, all the same)
        self.client.post("/lab/clients/c1/rollback", json={"to": "clean-m1"})
        reset, body = self._reset()
        self.assertEqual((reset["kind"], reset["reason"]), ("rollback", "rollback of fake-c1 to clean-m1 since its last run"))
        self.assertEqual(self._reset()[0]["kind"], "relaunch")

    def test_two_failed_relaunches_fall_back_to_a_rollback_in_the_same_run(self):
        pve = self._warm()
        pve.relaunch_failures = 1
        pve.relaunch_left = ["C:\\sky-lab\\shots\\004.png"]
        mark = len(pve.calls)
        reset, body = self._reset()
        self.assertEqual((body["verdict"], reset["kind"]), ("green", "rollback"), body)
        self.assertEqual(len(pve.relaunches), 2)
        self.assertEqual(reset["reason"], "2 relaunches failed, the last: the cleaning left C:\\sky-lab\\shots\\004.png")
        self.assertEqual(self._vm_resets(pve, mark), [("stop", 901), ("rollback", 901, "clean-sp"), ("start", 901)])

    def test_one_failed_relaunch_is_tried_again(self):
        pve = self._warm()
        pve.relaunch_failures = 1
        mark = len(pve.calls)
        reset, body = self._reset()
        self.assertEqual((body["verdict"], reset["kind"]), ("green", "relaunch"), body)
        self.assertEqual(len(pve.relaunches), 2)
        self.assertTrue(reset["reason"].startswith("relaunched on try 2, after its guest exec: E_PVE_EXEC"), reset)
        self.assertEqual(self._vm_resets(pve, mark), [])

    def test_the_game_checks_image_base_is_noted_per_seat(self):
        from labapi.proxmox import ExecResult

        pve = self._seat()
        pve.game = ExecResult(0, "base 00007FF7AB420000\r\nC:\\Games\\Skyrim Special Edition 1.6.1170\\SkyrimSE.exe\r\n1.6.1170.0\r\n", "")
        reset, body = self._reset()
        self.assertEqual(reset["image_base"], "00007FF7AB420000")
        self.assertIn("c1's SkyrimSE.exe image base 00007FF7AB420000 after its rollback", body["notes"])
        reset, body = self._reset()
        self.assertIn("c1's SkyrimSE.exe image base 00007FF7AB420000 after its relaunch", body["notes"])
        self.assertEqual(body["games"], {}, "the base line is no game identity")

