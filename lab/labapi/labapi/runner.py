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

    def progress(self) -> dict[str, Any]:
        if self.verdict != "running":
            return self.to_result()
        return {"run": self.run_id, "scenario": self.scenario.id, "verdict": "running", "phase": self.phase, "step": self.step}

    def to_result(self) -> dict[str, Any]:
        return {
            "run": self.run_id,
            "scenario": self.scenario.id,
            "milestone": self.scenario.milestone,
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

    def prepare(self, scenario: Scenario) -> RunRecord:
        if self.active is not None:
            raise RunnerError(f"E_RUN_BUSY: run {self.active.run_id} is active")
        stamp = time.strftime("%Y%m%d-%H%M%S", time.gmtime(self._wall()))
        run_id = f"{stamp}-{scenario.id}"
        run_dir = Path(self.s.results_dir) / run_id
        run_dir.mkdir(parents=True, exist_ok=True)
        rec = RunRecord(run_id=run_id, scenario=scenario, dir=run_dir, started_at=_iso(self._wall()))
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
            await self._artifacts(rec, capture)
            if self.netem_active:
                await self._clear_netem(rec)
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
        rec.phase = "steps"
        self.board.clear_views()
        for i, step in enumerate(sc.steps):
            rec.step = f"{i}: {step.describe()}"
            t0 = self._clock()
            ok, note = await self._run_step(rec, i, step)
            rec.steps.append({"index": i, "kind": step.kind, "client": step.client, "action": step.action, "ok": ok, "seconds": round(self._clock() - t0, 3), "note": note})
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
                await asyncio.to_thread(self.system.run, self._compose("stop", self.s.compose_service))
                snap = Path(self.s.server_snapshots_dir) / snapshot
                if not snap.is_dir():
                    raise RunnerError(f"E_RUN_SNAPSHOT: no world snapshot {snapshot!r} under {self.s.server_snapshots_dir}")
                world = Path(self.s.server_world_dir)
                self.system.rmtree(world)
                self.system.copytree(snap, world)
                await asyncio.to_thread(self.system.run, self._compose("up", "-d", self.s.compose_service))
                host = "127.0.0.1"
            ready = await asyncio.to_thread(self.system.tcp_ready, host, self.s.server_ui_port, self.s.server_ready_timeout_s)
            if not ready:
                raise RunnerError(f"E_RUN_SERVER_NOT_READY: {host}:{self.s.server_ui_port} in {self.s.server_ready_timeout_s}s")
            return f"snapshot {snapshot}, mode {self.s.server_rollback_mode}"

        await self._phase(rec, "rollback-server", go())

    async def _restart_server(self, rec: RunRecord) -> None:
        await asyncio.to_thread(self.system.run, self._compose("restart", self.s.compose_service))
        ready = await asyncio.to_thread(self.system.tcp_ready, "127.0.0.1", self.s.server_ui_port, self.s.server_ready_timeout_s)
        if not ready:
            raise RunnerError("E_RUN_SERVER_NOT_READY: after restart")

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
                await asyncio.to_thread(self.control.rollback_sequence, g, g.snapshot)
            if not await self.board.wait_heartbeat(client, since, self.s.heartbeat_timeout_s):
                raise RunnerError(f"E_RUN_NO_HEARTBEAT: {client} ({g.name}) did not poll within {self.s.heartbeat_timeout_s}s")
            return f"{client}={g.name}{'' if g.managed else ' (unmanaged, heartbeat only)'}"

        async def go():
            notes = await asyncio.gather(*(one(c) for c in clients))
            return ", ".join(notes)

        await self._phase(rec, "rollback-clients", go())

    # ----- steps ----------------------------------------------------------------

    async def _run_step(self, rec: RunRecord, index: int, step: Step) -> tuple[bool, str]:
        if step.kind == "wait":
            await asyncio.sleep((step.seconds or 0) * self.s.time_scale)
            return True, ""
        if step.kind == "server":
            try:
                await self._restart_server(rec)
                return True, ""
            except RunnerError as e:
                rec.failures.append({"step": index, "kind": "lab", "error": str(e)})
                rec.verdict = "error"
                return False, str(e)
        if step.kind == "assert":
            return await self._assert(rec, index, step)
        assert step.client and step.action
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
        qs = await self.board.run_step(step.client, step.action, step.args, self.s.step_timeout_s)
        if qs.ok:
            return True, ""
        error = str(qs.result.get("error", "step failed"))
        rec.failures.append({"step": index, "kind": "timeout" if error == "timeout" else "step-error", "client": step.client, "error": error})
        rec.verdict = "red"
        return False, error

    async def _assert(self, rec: RunRecord, index: int, step: Step) -> tuple[bool, str]:
        needed: set[str] = set()
        for expr in step.assertions:
            needed |= clients_needing_views(expr, rec.scenario.clients)
        if needed:
            results = await asyncio.gather(*(self.board.run_step(c, "dump-state", {}, self.s.step_timeout_s) for c in sorted(needed)))
            for qs in results:
                if not qs.ok:
                    rec.failures.append({"step": index, "kind": "timeout", "client": qs.client, "error": "dump-state before assert timed out"})
                    rec.verdict = "red"
                    return False, f"dump-state from {qs.client} timed out"
        evaluator = Evaluator(self.state, self.board, rec.scenario.clients)
        failed = []
        for expr in step.assertions:
            try:
                held = await asyncio.to_thread(evaluator.evaluate, expr)
                if not held:
                    failed.append({"step": index, "kind": "assertion", "expr": expr, "error": "false"})
            except AssertionSyntax as e:
                failed.append({"step": index, "kind": "assertion-syntax", "expr": expr, "error": str(e)})
                rec.verdict = "error"
            except (AssertionData, StateError) as e:
                failed.append({"step": index, "kind": "assertion-data", "expr": expr, "error": str(e)})
        if failed:
            rec.failures.extend(failed)
            if rec.verdict == "running":
                rec.verdict = "red"
            return False, f"{len(failed)} of {len(step.assertions)} failed"
        return True, f"{len(step.assertions)} held"

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
        g = self.tables.guest_for_client(client)
        if g is None or not g.managed:
            rec.notes.append(f"{name}: {client} is unmanaged or unmapped; log not fetched")
            return
        try:
            text = await asyncio.to_thread(self.control.file_read, g, f"{self.s.client_lab_dir}\\lab-driver.log")
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
            text = await asyncio.to_thread(self.control.file_read, g, f"{self.s.client_lab_dir}\\frida\\{script}.jsonl")
            (rec.dir / "frida" / f"{client}-{script}.jsonl").write_text(text)
            rec.artifacts.append(f"frida/{client}-{script}.jsonl")
        except ProxmoxError as e:
            rec.notes.append(f"frida {script}: {e}")

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
