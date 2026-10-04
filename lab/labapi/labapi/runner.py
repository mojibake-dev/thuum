"""The scenario runner: docs/LAB.md's numbered list as code. Phases are
rollback-server, netem, rollback-clients, steps, artifacts; the verdict is
green only when every assertion held and no step timed out, red when an
assertion failed or a step timed out, error when the lab itself failed."""

from __future__ import annotations

import asyncio
import base64
import difflib
import hashlib
import json
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from .assertions import AssertionData, AssertionSyntax, Evaluator, clients_needing_views
from .board import StepBoard
from .config import Settings
from .guests import Tables
from .proxmox import GuestControl, ProxmoxError
from .scenario import CLIENT_ACTIONS, SERVER_ACTIONS, Scenario, Step
from .state import ServerState, StateError
from .system import Capture, System

def _brief(value: Any, limit: int = 800) -> str:
    """A step's answer (the driver's data, a record) as one short JSON string
    for result.json; empty for nothing."""
    if value in (None, "", {}, []):
        return ""
    try:
        text = json.dumps(value, sort_keys=True, default=str)
    except (TypeError, ValueError):
        text = str(value)
    return text if len(text) <= limit else text[: limit - 3] + "..."



class RunnerError(Exception):
    """E_RUN: the lab itself failed; the verdict is error, not red."""


@dataclass
class RunRecord:
    run_id: str
    scenario: Scenario
    dir: Path
    started_at: str
    phase: str = "queued"
    step: str = ""
    verdict: str = "running"
    phases: list[dict[str, Any]] = field(default_factory=list)
    steps: list[dict[str, Any]] = field(default_factory=list)
    failures: list[dict[str, Any]] = field(default_factory=list)
    artifacts: list[str] = field(default_factory=list)
    notes: list[str] = field(default_factory=list)
    finished_at: str | None = None
    # the game version this run plays (ADR-022); "" on the lab-up and
    # lab-down records, which run on the default
    game: str = ""

    def progress(self) -> dict[str, Any]:
        if self.verdict != "running":
            return self.to_result()
        return {"run": self.run_id, "scenario": self.scenario.id, "verdict": "running", "phase": self.phase, "step": self.step}

    def to_result(self) -> dict[str, Any]:
        return {
            "run": self.run_id,
            "scenario": self.scenario.id,
            "milestone": self.scenario.milestone,
            "game": self.game,
            "verdict": self.verdict,
            "started": self.started_at,
            "finished": self.finished_at,
            "phases": self.phases,
            "steps": self.steps,
            "failures": self.failures,
            "artifacts": self.artifacts,
            "notes": self.notes,
        }


class Runner:
    def __init__(self, settings: Settings, tables: Tables, control: GuestControl, system: System, state: ServerState, board: StepBoard, clock=time.monotonic, wall=time.time):
        self.s = settings
        self.tables = tables
        self.control = control
        self.system = system
        self.state = state
        self.board = board
        self._clock = clock
        self._wall = wall
        self.runs: dict[str, RunRecord] = {}
        self.active: RunRecord | None = None
        self.netem_active = False
        self.frida_started: list[tuple[str, str]] = []  # (client, script name)

    # ----- public -------------------------------------------------------------

    def prepare(self, scenario: Scenario, game: str | None = None) -> RunRecord:
        if self.active is not None:
            raise RunnerError(f"E_RUN_BUSY: run {self.active.run_id} is active")
        version = game or scenario.game or self.s.game_default
        if version not in self.s.game_versions():
            raise RunnerError(f"E_RUN_GAME: unknown game version {version!r}; the lab plays {', '.join(self.s.game_versions())}")
        stamp = time.strftime("%Y%m%d-%H%M%S", time.gmtime(self._wall()))
        run_id = f"{stamp}-{scenario.id}"
        run_dir = Path(self.s.results_dir) / run_id
        # Two runs of one scenario inside a second (the fakes finish that fast)
        # must not share a results directory.
        n = 1
        while run_dir.exists():
            n += 1
            run_id = f"{stamp}-{scenario.id}-{n}"
            run_dir = Path(self.s.results_dir) / run_id
        run_dir.mkdir(parents=True, exist_ok=True)
        rec = RunRecord(run_id=run_id, scenario=scenario, dir=run_dir, started_at=_iso(self._wall()), game=version)
        self.runs[run_id] = rec
        self.active = rec
        return rec

    async def execute(self, rec: RunRecord) -> RunRecord:
        capture: Capture | None = None
        try:
            try:
                await asyncio.wait_for(self._execute_inner(rec), timeout=rec.scenario.timeout_s)
            except asyncio.TimeoutError:
                rec.failures.append({"step": rec.step, "kind": "scenario-timeout", "error": f"E_RUN_TIMEOUT: {rec.scenario.timeout_s}s"})
                rec.verdict = "error"
        except RunnerError as e:
            rec.failures.append({"step": rec.step, "kind": "lab", "error": str(e)})
            rec.verdict = "error"
        except Exception as e:  # anything else is a bug in lab-api, still reported
            rec.failures.append({"step": rec.step, "kind": "internal", "error": f"{type(e).__name__}: {e}"})
            rec.verdict = "error"
        finally:
            capture = getattr(rec, "_capture", None)
            # Whatever happens here the run must finish: result.json, board
            # cleared, `active` released. A backend error while fetching a
            # client log once escaped and left the next POST /run a 409.
            try:
                await self._artifacts(rec, capture)
            except Exception as e:
                rec.notes.append(f"artifacts: {type(e).__name__}: {e}")
            if self.netem_active:
                try:
                    await self._clear_netem(rec)
                except Exception as e:
                    rec.notes.append(f"netem: {type(e).__name__}: {e}")
            if rec.verdict == "running":
                rec.verdict = "green" if not rec.failures else "red"
            rec.finished_at = _iso(self._wall())
            rec.phase = "done"
            (rec.dir / "result.json").write_text(json.dumps(rec.to_result(), indent=2))
            self.board.clear()
            self.active = None
        return rec

    async def up(self) -> dict[str, Any]:
        if self.active is not None:
            raise RunnerError(f"E_RUN_BUSY: run {self.active.run_id} is active")
        rec = RunRecord(run_id="up", scenario=Scenario(id="lab-up"), dir=Path(self.s.results_dir), started_at=_iso(self._wall()))
        await self._rollback_server(rec, self.s.server_snapshot_default)
        clients = [g.client for g in self.tables.guests.values() if g.role == "client" and g.client]
        await self._rollback_clients(rec, clients)
        return {"ok": True, "phases": rec.phases}

    async def down(self) -> dict[str, Any]:
        if self.active is not None:
            raise RunnerError(f"E_RUN_BUSY: run {self.active.run_id} is active")
        rec = RunRecord(run_id="down", scenario=Scenario(id="lab-down"), dir=Path(self.s.results_dir), started_at=_iso(self._wall()))
        notes = []
        for g in self.tables.guests.values():
            if g.role == "client" and g.managed:
                try:
                    await asyncio.to_thread(self.control.rollback_sequence, g, g.snapshot)
                except ProxmoxError as e:
                    notes.append(str(e))
        try:
            await self._rollback_server(rec, self.s.server_snapshot_default)
        except RunnerError as e:
            notes.append(str(e))
        await self._clear_netem(rec)
        return {"ok": not notes, "notes": notes, "phases": rec.phases}

    def game_for(self, client: str) -> str:
        """The game version a client's logon launcher starts: the active run's,
        else the default. One version per run: a server and its clients must
        run the same master files (ADR-022)."""
        return self.active.game if self.active is not None and self.active.game else self.s.game_default

    def _compose_env(self, rec: RunRecord) -> dict[str, str]:
        """The run's master files for the server container (the compose file's
        ESM_DIR): docker compose takes it from the environment ahead of .env."""
        version = rec.game or self.s.game_default
        return {"ESM_DIR": self.s.game_versions()[version]}

    def status(self) -> dict[str, Any]:
        guests = {name: self.control.status(g) for name, g in self.tables.guests.items()}
        return {
            "run": self.active.progress() if self.active else None,
            "guests": guests,
            "heartbeats_s_ago": self.board.heartbeats(),
            "netem": self.netem_active,
            "memory": self.system.meminfo(),
        }

    # ----- phases ---------------------------------------------------------------

    async def _execute_inner(self, rec: RunRecord) -> None:
        sc = rec.scenario
        await self._rollback_server(rec, sc.server.snapshot)
        if "world-diff" in sc.artifacts:
            self._snapshot_world(rec, "world-before")
        if "pcap" in sc.artifacts:
            rec._capture = self.system.start_capture(["tcpdump", "-i", self.s.pcap_iface, "-w", str(rec.dir / "lab.pcap"), "udp", "port", str(self.s.game_port)])  # type: ignore[attr-defined]
        if sc.server.netem:
            await self._netem(rec, sc.server.netem)
        await self._rollback_clients(rec, sc.clients)
        await self._check_game(rec, sc.clients)
        rec.phase = "steps"
        self.board.clear_views()
        for i, step in enumerate(sc.steps):
            rec.step = f"{i}: {step.describe()}"
            t0 = self._clock()
            ok, note = await self._run_step(rec, i, step)
            entry = {"index": i, "kind": step.kind, "client": step.client, "action": step.action, "ok": ok, "seconds": round(self._clock() - t0, 3), "note": note}
            if step.client:
                entry["pos"] = await asyncio.to_thread(self._pos_of, step.client)
            rec.steps.append(entry)
            if not ok and rec.verdict in ("red", "error"):
                break
        rec.phase = "artifacts"

    async def _phase(self, rec: RunRecord, name: str, coro) -> None:
        rec.phase = name
        t0 = self._clock()
        try:
            note = await coro
            rec.phases.append({"name": name, "ok": True, "seconds": round(self._clock() - t0, 3), "note": note or ""})
        except Exception as e:
            rec.phases.append({"name": name, "ok": False, "seconds": round(self._clock() - t0, 3), "note": str(e)})
            raise

    async def _rollback_server(self, rec: RunRecord, snapshot: str) -> None:
        async def go():
            if self.s.server_rollback_mode == "vm":
                g = self.tables.server_guest()
                if g is None:
                    raise RunnerError("E_RUN_NO_SERVER_GUEST: no guest with role server")
                await asyncio.to_thread(self.control.rollback_sequence, g, snapshot)
                host = g.ip
            else:
                env = self._compose_env(rec)
                await asyncio.to_thread(self.system.run, self._compose("stop", self.s.compose_service), env=env)
                snap = Path(self.s.server_snapshots_dir) / snapshot
                if not snap.is_dir():
                    raise RunnerError(f"E_RUN_SNAPSHOT: no world snapshot {snapshot!r} under {self.s.server_snapshots_dir}")
                world = Path(self.s.server_world_dir)
                self.system.rmtree(world)
                self.system.copytree(snap, world)
                self.system.chown_tree(world, self.s.server_uid, self.s.server_gid)
                # a run on another version's master files recreates the
                # container (its mount changed); the same version only starts it
                await asyncio.to_thread(self.system.run, self._compose("up", "-d", self.s.compose_service), env=env)
                host = "127.0.0.1"
            ready = await asyncio.to_thread(self.system.tcp_ready, host, self.s.server_ui_port, self.s.server_ready_timeout_s)
            if not ready:
                raise RunnerError(f"E_RUN_SERVER_NOT_READY: {host}:{self.s.server_ui_port} in {self.s.server_ready_timeout_s}s")
            return f"snapshot {snapshot}, mode {self.s.server_rollback_mode}, game {rec.game or self.s.game_default}"

        await self._phase(rec, "rollback-server", go())

    async def _restart_server(self, rec: RunRecord) -> None:
        await asyncio.to_thread(self.system.run, self._compose("restart", self.s.compose_service), env=self._compose_env(rec))
        ready = await asyncio.to_thread(self.system.tcp_ready, "127.0.0.1", self.s.server_ui_port, self.s.server_ready_timeout_s)
        if not ready:
            raise RunnerError("E_RUN_SERVER_NOT_READY: after restart")

    async def _fakeclient(self, rec: RunRecord, index: int, step) -> str:
        """`server: fakeclient {as: c1, moves: 5, item: "Skyrim.esm:IronSword",
        count: 1}`: the fork's headless legacy client logs in with the named
        client's profile id from inside the server image, walks `moves` steps
        of 30 units, adds `count` of `item` through a console command, and
        exits. Its event log is the artifact fakeclient-<client>-<step>.jsonl;
        a non-zero exit is a red step."""
        args = step.args or {}
        client = str(args.get("as") or "")
        if not client:
            raise RunnerError("E_RUN_FAKECLIENT: `as: <client>` names whose profile the fakeclient logs in with")
        try:
            profile = self.tables.profile_id(client)
        except KeyError as e:
            raise RunnerError(f"E_RUN_FAKECLIENT: {e}") from None
        cmd = self._compose(
            "run", "--rm", "--no-deps", "-T", self.s.compose_service, self.s.fakeclient_bin,
            "--host", self.s.compose_service, "--port", str(self.s.server_port),
            "--profile-id", str(profile),
            "--moves", str(int(args.get("moves", 0))),
            "--timeout-ms", str(int(self.s.step_timeout_s * 1000)),
            "--settle-ms", str(int(args.get("settle_ms", 2000))),
        )
        if "item" in args:
            cmd += ["--add-item", str(self.tables.base_id(str(args["item"]))), "--add-item-count", str(int(args.get("count", 1)))]
        else:
            cmd += ["--add-item-count", "0"]
        r = await asyncio.to_thread(self.system.run, cmd, self.s.fakeclient_timeout_s, self._compose_env(rec))
        log = rec.dir / f"fakeclient-{client}-{index}.jsonl"
        log.write_text(r.stdout)
        rec.artifacts.append(log.name)
        events = []
        for line in r.stdout.splitlines():
            try:
                events.append(json.loads(line))
            except ValueError:
                continue
        done = next((e for e in events if e.get("event") == "done"), None)
        errors = [str(e.get("error")) for e in events if e.get("event") == "error"]
        if r.returncode != 0 or done is None or done.get("rc") != 0:
            raise RunnerError(f"E_RUN_FAKECLIENT: fakeclient for {client} exited {r.returncode}: {'; '.join(errors) or (r.stderr or '').strip()[-300:] or 'no done event'}")
        actor = next((e for e in events if e.get("event") == "actor"), {})
        return f"fakeclient {client} (profile {profile}) idx {actor.get('idx')} received {done.get('received')} messages"

    async def _netem(self, rec: RunRecord, spec) -> None:
        async def go():
            cmd = ["tc", "qdisc", "add", "dev", self.s.netem_dev, "root", "netem", "delay", f"{spec.delay_ms:g}ms", f"{spec.jitter_ms:g}ms", "loss", f"{spec.loss_pct:g}%"]
            r = await asyncio.to_thread(self.system.run, cmd)
            if r.returncode != 0:
                raise RunnerError(f"E_RUN_NETEM: tc exited {r.returncode}: {r.stderr.strip()}")
            self.netem_active = True
            return " ".join(cmd[6:])

        await self._phase(rec, "netem", go())

    async def _clear_netem(self, rec: RunRecord) -> None:
        await asyncio.to_thread(self.system.run, ["tc", "qdisc", "del", "dev", self.s.netem_dev, "root"])
        self.netem_active = False

    async def _rollback_clients(self, rec: RunRecord, clients: list[str]) -> None:
        async def one(client: str) -> str:
            g = self.tables.guest_for_client(client)
            if g is None:
                raise RunnerError(f"E_RUN_NO_GUEST: no guest plays client {client!r} (guests.yaml)")
            since = self._clock()
            if g.managed:
                try:
                    await asyncio.to_thread(self.control.rollback_sequence, g, g.snapshot)
                except ProxmoxError as e:
                    # the estate refused (a newer ZFS snapshot on the clone's disk, a
                    # task timeout): a lab failure with the cause, not an internal one
                    raise RunnerError(f"E_RUN_ROLLBACK: {g.name}: {e}") from e
                # Only a heartbeat from the fresh boot proves "boots to connected":
                # the previous session kept polling until the stop landed, and a
                # clock started before it let that poll pass the phase while the
                # clone was still booting (run 20261001-233852: the phase passed
                # at 74 s and c2 was not online 60 s later).
                since = self._clock()
            if not await self.board.wait_heartbeat(client, since, self.s.heartbeat_timeout_s):
                raise RunnerError(f"E_RUN_NO_HEARTBEAT: {client} ({g.name}) did not poll within {self.s.heartbeat_timeout_s}s")
            return f"{client}={g.name}{'' if g.managed else ' (unmanaged, heartbeat only)'}"

        async def go():
            notes = await asyncio.gather(*(one(c) for c in clients))
            return ", ".join(notes)

        await self._phase(rec, "rollback-clients", go())

    async def _check_game(self, rec: RunRecord, clients: list[str]) -> None:
        """Each managed client runs the run's game version: the logon launcher
        picks the folder from GET /game, and this reads back the SkyrimSE.exe
        that is running (path and file version) through the guest agent. A
        client on another build would meet the server's master files with its
        own and play a different game, so a mismatch is a lab error. An
        unmanaged client is not checked (lab-api never execs into it)."""
        async def one(client: str) -> str:
            g = self.tables.guest_for_client(client)
            if g is None or not g.managed:
                return f"{client}=unchecked (unmanaged)"
            cmd = ["powershell", "-NoProfile", "-Command", self.s.game_check_cmd]
            try:
                res = await asyncio.to_thread(self.control.exec, g, cmd, self.s.guest_task_timeout_s)
            except ProxmoxError as e:
                raise RunnerError(f"E_RUN_GAME: {client} ({g.name}): {e}") from e
            lines = [ln.strip() for ln in res.out.splitlines() if ln.strip()]
            if res.exitcode != 0 or len(lines) < 2:
                raise RunnerError(f"E_RUN_GAME: {client} ({g.name}): no running SkyrimSE.exe to read ({res.err.strip()[:200] or res.exitcode})")
            path, version = lines[-2], lines[-1]
            if version != rec.game and not version.startswith(rec.game + "."):
                raise RunnerError(f"E_RUN_GAME: {client} ({g.name}) runs SkyrimSE.exe {version} from {path}; the run plays {rec.game}")
            return f"{client}={version}"

        async def go():
            notes = await asyncio.gather(*(one(c) for c in clients))
            return ", ".join(notes)

        await self._phase(rec, "game-version", go())

    # ----- steps ----------------------------------------------------------------

    async def _run_step(self, rec: RunRecord, index: int, step: Step) -> tuple[bool, str]:
        if step.kind == "wait":
            await asyncio.sleep((step.seconds or 0) * self.s.time_scale)
            return True, ""
        if step.kind == "server":
            try:
                if step.action == "fakeclient":
                    note = await self._fakeclient(rec, index, step)
                    rec.notes.append(f"step {index}: {note}")
                else:
                    await self._restart_server(rec)
                return True, ""
            except RunnerError as e:
                rec.failures.append({"step": index, "kind": "lab", "error": str(e)})
                rec.verdict = "error" if step.action != "fakeclient" else "red"
                return False, str(e)
        if step.kind == "assert":
            return await self._assert(rec, index, step)
        assert step.client and step.action
        if step.action == "teleport":
            return await self._teleport(rec, index, step)
        if step.action in SERVER_ACTIONS:
            try:
                await asyncio.to_thread(self.state.command, step.client, step.action, step.args)
                return True, ""
            except StateError as e:
                rec.failures.append({"step": index, "kind": "server-command", "error": str(e)})
                rec.verdict = "red"
                return False, str(e)
        if step.action == "screenshot":
            return await self._screenshot(rec, index, step.client)
        if step.action in ("connect", "reconnect"):
            return await self._wait_online(rec, index, step.client, step.action)
        try:
            args = self._client_args(step.action, step.args)
            if step.action == "move":
                args = await asyncio.to_thread(self._move_args, step.client, args)
        except (RunnerError, StateError) as e:
            rec.failures.append({"step": index, "kind": "lab", "error": str(e)})
            rec.verdict = "red"
            return False, str(e)
        qs = await self.board.run_step(step.client, step.action, args, self.s.step_timeout_s)
        if qs.ok:
            return True, _brief(qs.result.get("data"))
        error = str(qs.result.get("error", "step failed"))
        rec.failures.append({"step": index, "kind": "timeout" if error == "timeout" else "step-error", "client": step.client, "error": error})
        rec.verdict = "red"
        return False, error

    async def _teleport(self, rec: RunRecord, index: int, step: Step) -> tuple[bool, str]:
        """teleport is judged by the client it is imposed on, then by the
        server's record. The gamemode writes the record and tells the client;
        the client either moves or drops the move (Skyrim Platform blocks
        MoveRefrToPosition while its generated save settles after a login),
        and a dropped move leaves the written record standing until the
        client's next movement report overwrites it, which for an idle client
        can take longer than the settle (run 20261001-232457: the record read
        back exactly at the target while the client stood 300 units away). So
        after each send and settle the client reports its own position
        (dump-state) and that must sit within teleport_tolerance of the
        target in x and y, and the server's record must agree; otherwise send
        again, until teleport_timeout_s is spent."""
        assert step.client
        started = self._clock()
        deadline = started + self.s.teleport_timeout_s
        attempts = 0
        last = "no report"
        while True:
            attempts += 1
            try:
                await asyncio.to_thread(self.state.command, step.client, "teleport", step.args)
                await asyncio.sleep(self.s.teleport_settle_s * self.s.time_scale)
                qs = await self.board.run_step(step.client, "dump-state", {}, self.s.step_timeout_s)
                actor = await asyncio.to_thread(self.state.actor, step.client)
            except StateError as e:
                rec.failures.append({"step": index, "kind": "server-command", "error": str(e)})
                rec.verdict = "red"
                return False, str(e)
            dump = qs.result.get("data") if qs.ok and isinstance(qs.result.get("data"), dict) else None
            client_there = dump is not None and self._dump_at_target(dump, step.args)
            server_there = actor is not None and self._at_target(actor, step.args)
            if client_there and server_there:
                note = f"landed after {attempts} attempt(s), {self._clock() - started:.1f}s"
                rec.notes.append(f"step {index}: {step.client} teleport {note}")
                return True, note
            where = {"client": (dump or {}).get("pos") if dump else ("no dump-state" if qs.ok else str(qs.result.get("error", "dump-state failed"))),
                     "server": {k: actor.get(k) for k in ("cell", "x", "y", "z")} if actor else "no record"}
            last = _brief(where)
            if self._clock() >= deadline:
                error = f"E_RUN_TELEPORT: {step.client} never settled at the target within {self.s.teleport_timeout_s:g}s ({attempts} attempts, last {last})"
                rec.failures.append({"step": index, "kind": "timeout", "client": step.client, "error": error})
                rec.verdict = "red"
                return False, error

    def _dump_at_target(self, dump: dict[str, Any], args: dict[str, Any]) -> bool:
        """The client's own position (dump-state pos, absolute world units)
        against the scenario's target: offsets from a named cell's origin when
        the table knows the cell, absolute otherwise."""
        pos = dump.get("pos")
        if not isinstance(pos, (list, tuple)) or len(pos) < 2:
            return False
        cell = self.tables.cell(str(args.get("cell", ""))) if args.get("cell") is not None else None
        origin = cell.origin if cell is not None else (0.0, 0.0, 0.0)
        try:
            return all(abs(float(pos[i]) - float(origin[i]) - float(args.get(k, 0) or 0)) <= self.s.teleport_tolerance for i, k in ((0, "x"), (1, "y")))
        except (TypeError, ValueError):
            return False

    def _at_target(self, actor: dict[str, Any], args: dict[str, Any]) -> bool:
        """The record and the scenario's target share a frame when the target
        names a cell the table knows (the record then carries offsets from the
        same origin); a target written as the server's own descriptor compares
        against the absolute record that rides along. Another cell is never
        at the target, whatever its numbers."""
        frame: dict[str, Any] = actor
        if "cell" in args and str(actor.get("cell")) != str(args["cell"]):
            absolute = actor.get("absolute")
            if not isinstance(absolute, dict) or str(absolute.get("cell")) != str(args["cell"]):
                return False
            frame = absolute
        try:
            return all(abs(float(frame[k]) - float(args.get(k, 0) or 0)) <= self.s.teleport_tolerance for k in ("x", "y"))
        except (KeyError, TypeError, ValueError):
            return False

    def _pos_of(self, client: str) -> dict[str, Any] | None:
        """The server's record of a client after a step, in the scenario's
        frame, for result.json; never fails a step."""
        try:
            actor = self.state.actor(client)
        except StateError:
            return None
        if actor is None:
            return None
        out: dict[str, Any] = {"cell": actor.get("cell")}
        for k in ("x", "y", "z"):
            try:
                out[k] = round(float(actor[k]), 1)
            except (KeyError, TypeError, ValueError):
                out[k] = None
        return out

    async def _wait_online(self, rec: RunRecord, index: int, client: str, action: str) -> tuple[bool, str]:
        """connect and reconnect are judged by the server, the owner of that
        state: the step holds until labState lists the client's profile among
        the logged-in players. skymp5-client connects and logs in by itself at
        launch and again after a server restart; lab-driver stays out of
        mpClientPlugin (docs/LAB.md). A restart empties the server's list, so
        presence after one is a fresh login."""
        started = self._clock()
        deadline = started + self.s.connect_timeout_s
        while True:
            try:
                if await asyncio.to_thread(self.state.online, client):
                    rec.notes.append(f"step {index}: {client} online after {self._clock() - started:.1f}s")
                    # an optional pause after online (config.connect_settle_s); the teleport step judges itself
                    if self.s.connect_settle_s > 0:
                        await asyncio.sleep(self.s.connect_settle_s * self.s.time_scale)
                    return True, ""
            except StateError as e:
                last = str(e)
            else:
                last = f"{client} not among the server's online players"
            if self._clock() >= deadline:
                rec.failures.append({"step": index, "kind": "timeout", "client": client, "error": f"E_RUN_{action.upper()}: {last} after {self.s.connect_timeout_s}s"})
                rec.verdict = "red"
                return False, last
            await asyncio.sleep(1.0 * self.s.time_scale if self.s.time_scale else 0.01)

    async def _assert(self, rec: RunRecord, index: int, step: Step) -> tuple[bool, str]:
        needed: set[str] = set()
        for expr in step.assertions:
            needed |= clients_needing_views(expr, rec.scenario.clients)  # fakeclients have no view
        if needed:
            results = await asyncio.gather(*(self.board.run_step(c, "dump-state", {}, self.s.step_timeout_s) for c in sorted(needed)))
            for qs in results:
                if not qs.ok:
                    rec.failures.append({"step": index, "kind": "timeout", "client": qs.client, "error": "dump-state before assert timed out"})
                    rec.verdict = "red"
                    return False, f"dump-state from {qs.client} timed out"
        evaluator = Evaluator(self.state, self.board, self._client_names(rec.scenario))
        failed = []
        for expr in step.assertions:
            try:
                held = await asyncio.to_thread(evaluator.evaluate, expr)
                if not held:
                    failed.append({"step": index, "kind": "assertion", "expr": expr, "error": "false", "values": dict(evaluator.readings)})
            except AssertionSyntax as e:
                failed.append({"step": index, "kind": "assertion-syntax", "expr": expr, "error": str(e)})
                rec.verdict = "error"
            except (AssertionData, StateError) as e:
                failed.append({"step": index, "kind": "assertion-data", "expr": expr, "error": str(e)})
        read = "; ".join(f"{k} = {v}" for k, v in evaluator.readings.items())
        if failed:
            rec.failures.extend(failed)
            if rec.verdict == "running":
                rec.verdict = "red"
            return False, f"{len(failed)} of {len(step.assertions)} failed" + (f" ({read})" if read else "")
        return True, f"{len(step.assertions)} held" + (f" ({read})" if read else "")

    async def _screenshot(self, rec: RunRecord, index: int, client: str) -> tuple[bool, str]:
        shots = rec.dir / "screenshots"
        shots.mkdir(exist_ok=True)
        target = shots / f"{index:03d}-{client}.png"
        g = self.tables.guest_for_client(client)
        try:
            if g is not None and g.managed:
                remote = f"{self.s.client_lab_dir}\\shots\\{index:03d}.png"
                cmd = ["powershell", "-NoProfile", "-Command", self.s.screenshot_cmd_template.format(lab_dir=self.s.client_lab_dir, out=remote)]
                res = await asyncio.to_thread(self.control.exec, g, cmd, self.s.guest_task_timeout_s)
                if res.exitcode != 0:
                    return True, f"screenshot helper exited {res.exitcode}: {res.err.strip()[:200]}"
                b64 = await asyncio.to_thread(self.control.file_read, g, remote + ".b64")
                target.write_bytes(base64.b64decode(b64))
            else:
                qs = await self.board.run_step(client, "request-screenshot", {}, self.s.step_timeout_s)
                b64 = (qs.result.get("data") or {}).get("png_b64") if qs.ok else None
                if not b64:
                    return True, f"no screenshot from {client}: {qs.result.get('error', 'no png_b64 in result')}"
                target.write_bytes(base64.b64decode(b64))
            return True, target.name
        except (ProxmoxError, ValueError) as e:
            return True, f"screenshot skipped: {e}"

    # ----- artifacts ------------------------------------------------------------

    def _snapshot_world(self, rec: RunRecord, name: str) -> None:
        world = Path(self.s.server_world_dir)
        if world.is_dir():
            self.system.copytree(world, rec.dir / name)
            rec.artifacts.append(name)
        else:
            rec.notes.append(f"{name}: world dir {world} missing")

    async def _artifacts(self, rec: RunRecord, capture: Capture | None) -> None:
        rec.phase = "artifacts"
        wanted = list(rec.scenario.artifacts)
        if capture is not None:
            capture.stop()
            rec.artifacts.append("lab.pcap")
        if "world-diff" in wanted:
            self._snapshot_world(rec, "world-after")
            try:
                (rec.dir / "world-diff").write_text(world_diff(rec.dir / "world-before", rec.dir / "world-after"))
                rec.artifacts.append("world-diff")
            except OSError as e:
                rec.notes.append(f"world-diff: {e}")
        if "server.log" in wanted:
            r = await asyncio.to_thread(self.system.run, self._compose("logs", "--no-color", self.s.compose_service))
            (rec.dir / "server.log").write_text(r.stdout)
            rec.artifacts.append("server.log")
        for name in wanted:
            if name.endswith(".log") and name != "server.log":
                client = name[:-4]
                await self._client_log(rec, client, name)
        if "screenshots" in wanted and (rec.dir / "screenshots").is_dir():
            rec.artifacts.append("screenshots")
        for client, script in self.frida_started:
            await self._frida_trace(rec, client, script)
        self.frida_started.clear()
        unknown = [n for n in wanted if n not in ("server.log", "screenshots", "world-diff", "pcap") and not n.endswith(".log")]
        for n in unknown:
            rec.notes.append(f"unknown artifact {n!r} ignored")

    async def _client_log(self, rec: RunRecord, client: str, name: str) -> None:
        """<client>.log is Skyrim Platform's log; <client>-driver.log is
        lab-driver's own (writeLogs), found under the game directory the client
        recorded at install. Both are copied first: the game holds its logs
        open without read sharing, which the agent's file-read cannot get past,
        and PowerShell's Copy-Item can."""
        g = self.tables.guest_for_client(client)
        if g is None or not g.managed:
            rec.notes.append(f"{name}: {client} is unmanaged or unmapped; log not fetched")
            return
        await self._fetch_client_file(rec, g, name, f"'{self.s.client_driver_log}'")
        game_dir = f"(Get-Content -LiteralPath '{self.s.client_lab_dir}\\game-dir.txt' -Raw).Trim()"
        await self._fetch_client_file(rec, g, f"{client}-driver.log", f"(Join-Path {game_dir} '{self.s.client_plugin_log}')")

    async def _fetch_client_file(self, rec: RunRecord, g: Guest, name: str, source: str) -> None:
        """Copy the file at the PowerShell path expression `source` on the
        client into the lab directory as `name`, read it back and store it as
        an artifact; a failure is a note, never a failed run."""
        try:
            copy = f"{self.s.client_lab_dir}\\{name}"
            cmd = ["powershell", "-NoProfile", "-Command", f"Copy-Item -LiteralPath {source} -Destination '{copy}' -Force"]
            res = await asyncio.to_thread(self.control.exec, g, cmd, self.s.guest_task_timeout_s)
            if res.exitcode != 0:
                rec.notes.append(f"{name}: copy exited {res.exitcode}: {res.err.strip()[:200]}")
                return
            text = await asyncio.to_thread(self.control.file_read, g, copy)
            (rec.dir / name).write_text(text)
            rec.artifacts.append(name)
        except ProxmoxError as e:
            rec.notes.append(f"{name}: {e}")

    async def _frida_trace(self, rec: RunRecord, client: str, script: str) -> None:
        g = self.tables.guest_for_client(client)
        if g is None or not g.managed:
            rec.notes.append(f"frida {script}: {client} unmanaged; trace not fetched")
            return
        (rec.dir / "frida").mkdir(exist_ok=True)
        try:
            text = await asyncio.to_thread(self.control.file_read, g, f"{self.s.client_lab_dir}\\frida\\{script}.out")  # frida-inject's stdout
            (rec.dir / "frida" / f"{client}-{script}.jsonl").write_text(text)
            rec.artifacts.append(f"frida/{client}-{script}.jsonl")
        except ProxmoxError as e:
            rec.notes.append(f"frida {script}: {e}")

    @staticmethod
    def _client_names(scenario) -> list[str]:
        """Names an assertion may use: the scenario's clients plus every client a
        `server: fakeclient {as: ...}` step logged in as (T2-only scenarios
        declare `clients: []` and still assert on `server.actor(c1)`)."""
        names = list(scenario.clients)
        for st in scenario.steps:
            if st.kind == "server" and st.action == "fakeclient":
                who = str((st.args or {}).get("as") or "")
                if who and who not in names:
                    names.append(who)
        return names

    def _client_args(self, action: str, args: dict[str, Any] | None) -> dict[str, Any]:
        """Names in client steps become form ids before the driver sees them;
        the driver carries no item table. equip's item becomes formId, craft's
        recipe becomes the recipe's form id (its station passes through: a
        reference id, or a name a later refs table resolves)."""
        out = dict(args or {})
        try:
            if action == "equip" and "item" in out:
                out["formId"] = self.tables.base_id(str(out.pop("item")))
            if action == "craft" and isinstance(out.get("recipe"), str):
                out["recipe"] = self.tables.base_id(out["recipe"])
        except KeyError as e:
            raise RunnerError(f"E_RUN_ITEM: {e}") from None
        return out

    def _move_args(self, client: str, args: dict[str, Any]) -> dict[str, Any]:
        """`move {dx, dy, dz?, duration_s}` is an offset from where the server
        says the client is; the driver translates the player to an absolute
        target (x, y, z in world units) at a speed in units per second."""
        actor = self.state.actor(client)
        if actor is None:
            raise RunnerError(f"E_RUN_MOVE: the server has no actor for {client}")
        base = actor.get("absolute") or actor
        try:
            x0, y0, z0 = float(base["x"]), float(base["y"]), float(base["z"])
        except (KeyError, TypeError, ValueError) as e:
            raise RunnerError(f"E_RUN_MOVE: no position for {client}: {e}") from None
        dx, dy, dz = (float(args.get(k, 0) or 0) for k in ("dx", "dy", "dz"))
        out = {k: v for k, v in args.items() if k not in ("dx", "dy", "dz")}
        # speed in world units per second (the driver's TranslateTo): the
        # scenario's distance over three quarters of its duration_s, so the
        # motion and the server's record of it are done before a wait of
        # duration_s ends (run 20261001-205928: at exactly distance/duration
        # the assertion raced the last movement update and read 240 of 300);
        # clamped to 50..500.
        distance = (dx * dx + dy * dy + dz * dz) ** 0.5
        duration = float(args.get("duration_s", 0) or 0)
        speed = float(args.get("speed", 0) or 0) or (min(500.0, max(50.0, distance / (duration * 0.75))) if duration > 0 else 300.0)
        out.update({"x": x0 + dx, "y": y0 + dy, "z": z0 + dz, "speed": speed})
        return out

    def _compose(self, *args: str) -> list[str]:
        return ["docker", "compose", "-f", self.s.compose_file, *args]


def _iso(ts: float) -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(ts))


def _listing(root: Path) -> dict[str, tuple[int, str]]:
    out: dict[str, tuple[int, str]] = {}
    if not root.is_dir():
        return out
    for p in sorted(root.rglob("*")):
        if p.is_file():
            data = p.read_bytes()
            out[str(p.relative_to(root))] = (len(data), hashlib.sha256(data).hexdigest()[:16])
    return out


def world_diff(before: Path, after: Path) -> str:
    """A unified diff of the two listings (path, size, content hash) plus the
    list of changed paths; the world/ directory is the file driver's database."""
    a, b = _listing(before), _listing(after)
    fmt = lambda d: [f"{k}\t{v[0]}\t{v[1]}" for k, v in d.items()]
    diff = list(difflib.unified_diff(fmt(a), fmt(b), "world-before", "world-after", lineterm=""))
    changed = sorted(set(k for k in a if k in b and a[k] != b[k]))
    added = sorted(set(b) - set(a))
    removed = sorted(set(a) - set(b))
    head = [f"changed: {len(changed)}", *("  " + c for c in changed), f"added: {len(added)}", *("  " + c for c in added), f"removed: {len(removed)}", *("  " + c for c in removed), ""]
    return "\n".join(head + diff) + "\n"
