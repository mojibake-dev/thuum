"""The scenario runner: docs/LAB.md's numbered list as code. Phases are
rollback-server, netem, rollback-clients, steps, artifacts; the verdict is
green only when every assertion held and no step timed out, red when an
assertion failed or a step timed out, error when the lab itself failed."""

from __future__ import annotations

import asyncio
import base64
import calendar
import difflib
import hashlib
import json
import re
import time
from dataclasses import dataclass, field
from pathlib import Path, PureWindowsPath
from typing import Any

from .assertions import AssertionData, AssertionSyntax, Evaluator, clients_needing_views
from .board import StepBoard
from .config import Settings
from .guests import Tables
from .proxmox import GuestControl, ProxmoxError
from .scenario import CLIENT_ACTIONS, SERVER_ACTIONS, Scenario, Step
from .state import ServerState, StateError
from .system import Capture, System

def _text(value: Any) -> str:
    """A step's answer (the driver's data, a record) as JSON text; empty for
    nothing."""
    if value in (None, "", {}, []):
        return ""
    try:
        return json.dumps(value, sort_keys=True, default=str)
    except (TypeError, ValueError):
        return str(value)


def _brief(value: Any, limit: int = 800) -> str:
    """A step's answer as one short JSON string for result.json."""
    text = _text(value)
    return text if len(text) <= limit else text[: limit - 3] + "..."


# A hung seat's dump (Settings.hang_evidence), run on the seat as SYSTEM through the guest
# agent as -EncodedCommand, so no quoting reaches PowerShell. MiniDumpWriteDump's signature and
# the MINIDUMP_TYPE bits are Microsoft's (learn.microsoft.com, minidumpapiset.h): WithFullMemory
# 0x2, WithHandleData 0x4, WithUnloadedModules 0x20, WithFullMemoryInfo 0x800, WithThreadInfo
# 0x1000 and IgnoreInaccessibleMemory 0x20000, called from a separate process as the page asks.
# The inbox curl.exe streams it up as a PUT, then it leaves the seat's disk. The last stdout
# line is one JSON object for the run's notes. Placeholders: @LAB_DIR@ @URL@ @UPLOAD_S@.
_HANG_DUMP_PS = r"""
$ErrorActionPreference = 'Stop'
$p = [Diagnostics.Process]::GetProcessesByName('SkyrimSE') | Select-Object -First 1
if (-not $p) { Write-Output '{"dumped": false, "why": "no SkyrimSE process"}'; exit 2 }
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
using Microsoft.Win32.SafeHandles;
public static class LabHangDump {
    [DllImport("dbghelp.dll", SetLastError = true)]
    public static extern bool MiniDumpWriteDump(IntPtr hProcess, uint processId, SafeFileHandle hFile, uint dumpType,
        IntPtr exceptionParam, IntPtr userStreamParam, IntPtr callbackParam);
}
'@
$dir = '@LAB_DIR@\hang'
New-Item -ItemType Directory -Force -Path $dir | Out-Null
$path = Join-Path $dir 'SkyrimSE.dmp'
$sw = [Diagnostics.Stopwatch]::StartNew()
$fs = [IO.File]::Create($path)
$ok = [LabHangDump]::MiniDumpWriteDump($p.Handle, [uint32]$p.Id, $fs.SafeFileHandle, 0x21826, [IntPtr]::Zero, [IntPtr]::Zero, [IntPtr]::Zero)
$err = [Runtime.InteropServices.Marshal]::GetLastWin32Error()
$fs.Close()
$dumpMs = $sw.ElapsedMilliseconds
if (-not $ok) {
    Remove-Item -LiteralPath $path -Force -ErrorAction SilentlyContinue
    Write-Output ('{"dumped": false, "why": "MiniDumpWriteDump failed, last error 0x' + $err.ToString('x8') + '"}')
    exit 3
}
$bytes = (Get-Item -LiteralPath $path).Length
# a native program's stderr under a redirected PowerShell 5.1 becomes an error record, and Stop
# would end the script there with the dump left on the disk
$ErrorActionPreference = 'Continue'
$sw.Restart()
& "$env:SystemRoot\System32\curl.exe" --fail --silent --show-error --max-time @UPLOAD_S@ --upload-file $path '@URL@'
$curl = $LASTEXITCODE
$upMs = $sw.ElapsedMilliseconds
Remove-Item -LiteralPath $path -Force -ErrorAction SilentlyContinue
Write-Output ('{"dumped": true, "pid": ' + $p.Id + ', "bytes": ' + $bytes + ', "dump_ms": ' + $dumpMs + ', "upload_ms": ' + $upMs + ', "curl": ' + $curl + '}')
if ($curl -ne 0) { exit 4 }
"""

# A seat's game at a run's end (Runner._crash_check), run as the hang dump is: each SkyrimSE
# process's identity now, pid@start in UTC as Settings.game_check_cmd prints it, and the dumps
# Windows Error Reporting wrote for SkyrimSE.exe since the run began. LocalDumps names them
# <exe>.<pid>.dmp under its DumpFolder (Microsoft, "Collecting User-Mode Dumps",
# learn.microsoft.com/windows/win32/wer/collecting-user-mode-dumps; crash-dumps.ps1 sets it). The
# newest goes up through the inbox curl.exe as the hang dump does. The last stdout line is one
# JSON object. Placeholders: @DUMP_DIR@ @SINCE@ (Unix seconds) @URL@ @UPLOAD_S@.
_CRASH_PS = r"""
$ErrorActionPreference = 'Stop'
$since = [DateTimeOffset]::FromUnixTimeSeconds(@SINCE@).UtcDateTime
$games = @()
try {
    $games = @([Diagnostics.Process]::GetProcessesByName('SkyrimSE') | ForEach-Object { '"' + $_.Id + '@' + $_.StartTime.ToUniversalTime().ToString('o') + '"' })
} catch { $games = @('"unreadable"') }
$dumps = @(Get-ChildItem -LiteralPath '@DUMP_DIR@' -Filter 'SkyrimSE.exe.*.dmp' -File -ErrorAction SilentlyContinue |
    Where-Object { $_.LastWriteTimeUtc -ge $since } | Sort-Object LastWriteTimeUtc)
$list = @($dumps | ForEach-Object { '{"name": "' + $_.Name + '", "bytes": ' + $_.Length + ', "utc": "' + $_.LastWriteTimeUtc.ToString('o') + '"}' }) -join ', '
$curl = -1
if ($dumps.Count -gt 0) {
    $ErrorActionPreference = 'Continue'
    & "$env:SystemRoot\System32\curl.exe" --fail --silent --show-error --max-time @UPLOAD_S@ --upload-file $dumps[-1].FullName '@URL@'
    $curl = $LASTEXITCODE
}
Write-Output ('{"games": [' + ($games -join ', ') + '], "dumps": [' + $list + '], "curl": ' + $curl + '}')
"""



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
    # each managed seat's game process as the version check found it (pid@start,
    # UTC; a relaunch step reads the new one), which the run's end compares
    games: dict[str, str] = field(default_factory=dict)
    # the seats whose SKSE folder logs this run already fetched
    skse_fetched: set[str] = field(default_factory=set)

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
            "games": self.games,
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
        # a snapshot or promote in progress (app.py); no run starts meanwhile
        self.maintenance: str | None = None
        # when the last run (or lab-up, lab-down) ended, as the next run's
        # `--since` for the server log it keeps before replacing the world, and
        # on the wall clock, to tell a sweep's next run from one after a quiet
        # spell (a playtest, hand probes), whose clients' logs are worth keeping
        self.last_run_ended: str | None = None
        self.last_run: RunRecord | None = None  # a by-hand hang dump goes into it while nothing runs
        self._last_run_ended_wall: float | None = None
        # the last operator call lab-api saw (a run, a state RPC, an assist, a
        # frida start, a probe): what "nobody is working" is measured from
        self.last_activity_wall: float = self._wall()
        # a hold: the lab is somebody's (a playtest, a staging that writes the
        # clones) until this wall time or a release; runs and run sets wait
        self.hold_until: float | None = None
        self.hold_reason: str = ""

    # ----- public -------------------------------------------------------------

    def hold_active(self) -> bool:
        return self.hold_until is not None and self._wall() < self.hold_until

    def hold(self, minutes: float, reason: str) -> dict[str, Any]:
        self.hold_until = self._wall() + minutes * 60
        self.hold_reason = reason
        self.touch()
        return self.hold_status()

    def release(self) -> dict[str, Any]:
        self.hold_until = None
        self.hold_reason = ""
        self.touch()
        return self.hold_status()

    def hold_status(self) -> dict[str, Any] | None:
        if not self.hold_active():
            return None
        return {"until": _iso(self.hold_until), "reason": self.hold_reason, "seconds_left": round(self.hold_until - self._wall())}

    def touch(self) -> None:
        """An operator did something: the quiet spell starts over."""
        self.last_activity_wall = self._wall()

    def prepare(self, scenario: Scenario, game: str | None = None) -> RunRecord:
        if self.active is not None:
            raise RunnerError(f"E_RUN_BUSY: run {self.active.run_id} is active")
        if self.maintenance is not None:
            raise RunnerError(f"E_RUN_BUSY: {self.maintenance} in progress")
        if self.hold_active():
            raise RunnerError(f"E_RUN_HOLD: the lab is held ({self.hold_reason}) until {_iso(self.hold_until)}; `just lab-release` ends it")
        self.touch()
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
            self.last_run = rec
            self.active = None
            self._note_run_end()
        return rec

    def _note_run_end(self) -> None:
        self.last_run_ended = _iso(self._wall())
        self._last_run_ended_wall = self._wall()
        self.last_activity_wall = self._wall()

    def _after_quiet_spell(self) -> bool:
        """True when nothing ran for a while (or lab-api just started): what
        the clients hold then is not the previous run's, it is a playtest's or a
        hand probe's, and the rollback is about to erase it."""
        if self.s.before_logs_quiet_s <= 0:
            return False  # the feature off (the test harness; a lab that wants no guest reads)
        if self._last_run_ended_wall is None:
            return True
        return self._wall() - self._last_run_ended_wall > self.s.before_logs_quiet_s

    async def up(self) -> dict[str, Any]:
        if self.active is not None:
            raise RunnerError(f"E_RUN_BUSY: run {self.active.run_id} is active")
        rec = RunRecord(run_id="up", scenario=Scenario(id="lab-up"), dir=Path(self.s.results_dir), started_at=_iso(self._wall()))
        await self._rollback_server(rec, self.s.server_snapshot_default)
        clients = [g.client for g in self.tables.guests.values() if g.role == "client" and g.client]
        await self._rollback_clients(rec, clients)
        self._note_run_end()
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
        self._note_run_end()
        return {"ok": not notes, "notes": notes, "phases": rec.phases}

    def game_for(self, client: str) -> str:
        """The game version a client's logon launcher starts: the active run's,
        else the default. One version per run: a server and its clients must
        run the same master files (ADR-022)."""
        return self.active.game if self.active is not None and self.active.game else self.s.game_default

    def solo_for(self, client: str) -> bool:
        """Whether a client's logon launcher starts the game without skymp5-client:
        the active run is solo and names that client (ADR-031's reference
        traces); a clone booting for anything else gets the multiplayer game."""
        return self.active is not None and self.active.scenario.solo and client in self.active.scenario.clients

    def _compose_env(self, rec: RunRecord) -> dict[str, str]:
        """The run's master files and settings file for the server container
        (the compose file's ESM_DIR and SERVER_SETTINGS): docker compose takes
        them from the environment ahead of .env. The settings differ by
        version in their load order (ADR-025)."""
        version = rec.game or self.s.game_default
        env = {"ESM_DIR": self.s.game_versions()[version]}
        settings = self.s.game_settings_files().get(version)
        if settings:
            env["SERVER_SETTINGS"] = settings
        return env

    def status(self) -> dict[str, Any]:
        guests = {name: self.control.status(g) for name, g in self.tables.guests.items()}
        return {
            "run": self.active.progress() if self.active else None,
            "guests": guests,
            "heartbeats_s_ago": self.board.heartbeats(),
            "netem": self.netem_active,
            "memory": self.system.meminfo(),
            "hold": self.hold_status(),
            "version": self.s.version,
            "last_run": self.last_run.run_id if self.last_run else None,
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

    def _answer(self, rec: RunRecord, index: int, step: Step, data: Any) -> str:
        """A client step's note: its brief, and when the brief cuts the
        answer, the whole answer kept beside the run as
        steps/<index>-<client>-<action>.json (a probe's table outgrows
        result.json's 800 characters)."""
        text, brief = _text(data), _brief(data)
        if text == brief:
            return brief
        name = f"{index:03d}-{step.client}-{step.action}.json"
        try:
            (rec.dir / "steps").mkdir(exist_ok=True)
            (rec.dir / "steps" / name).write_text(text)
        except OSError as e:
            return f"{brief} (the whole answer was not kept: {e})"
        return f"{brief} (whole: steps/{name})"

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
                await self._keep_outgoing_server_log(rec)
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

    async def _keep_outgoing_server_log(self, rec: RunRecord) -> None:
        """What the server logged since the last run ended (since 24 h when
        nothing ran), kept before this run replaces its world: server-before.log
        beside the run, or results/server-before/<stamp>-<up|down>.log for
        lab-up and lab-down. A playtest's log lived only in the container until
        here, and the run that followed recreated the container (playtest
        fifteen, 2026-10-13: two findings unreadable afterwards). A failure is
        a note, never a failed run."""
        since = self.last_run_ended or "24h"
        try:
            r = await asyncio.to_thread(self.system.run, self._compose("logs", "--no-color", "--since", since, self.s.compose_service))
        except Exception as e:  # the log is a courtesy; the rollback goes on
            rec.notes.append(f"server-before.log: {type(e).__name__}: {e}")
            return
        if not r.stdout.strip():
            return
        try:
            if rec.run_id in ("up", "down"):
                d = Path(self.s.results_dir) / "server-before"
                d.mkdir(parents=True, exist_ok=True)
                stamp = time.strftime("%Y%m%d-%H%M%S", time.gmtime(self._wall()))
                (d / f"{stamp}-{rec.run_id}.log").write_text(r.stdout)
            else:
                (rec.dir / "server-before.log").write_text(r.stdout)
                rec.artifacts.append("server-before.log")
        except OSError as e:
            rec.notes.append(f"server-before.log: {e}")

    async def _client_logs_before_rollback(self, rec: RunRecord, clients: list[str]) -> None:
        """After a quiet spell the clients hold a playtest's or a hand probe's
        Skyrim Platform log, which their rollback erases: keep each as
        <client>-before.log. Inside a sweep (runs seconds apart) the clients
        hold only the previous run's log, already kept with it, so nothing is
        fetched and the sweep pays nothing."""
        if rec.run_id in ("up", "down") or not self._after_quiet_spell():
            return
        for client in clients:
            g = self.tables.guest_for_client(client)
            if g is None or not g.managed:
                continue
            await self._fetch_client_file(rec, g, f"{client}-before.log", f"'{self.s.client_driver_log}'")

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
            await self._traces_before_rollback(rec, clients)
            await self._client_logs_before_rollback(rec, clients)
            notes = await asyncio.gather(*(one(c) for c in clients))
            return ", ".join(notes)

        await self._phase(rec, "rollback-clients", go())

    async def _traces_before_rollback(self, rec: RunRecord, clients: list[str]) -> None:
        """A trace started outside a run (POST /lab/frida) is still being
        written on its clone, and this run's rollback is about to erase it
        (2026-10-05: the idle-client leak traces went that way). Fetch each one
        into this run first, once however often it was started."""
        keep: list[tuple[str, str]] = []
        for client, script in dict.fromkeys(self.frida_started):
            if client in clients:
                await self._frida_trace(rec, client, script, ".before-run")
            else:
                keep.append((client, script))
        self.frida_started = keep

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
            # Both clones boot and launch their games at once after a rollback,
            # and a guest agent that busy can miss its answer (run
            # 20261005-095237; thuum-mundus saw no host-side cause). Two more
            # tries, 10 s apart, before the run errs.
            for attempt in range(3):
                try:
                    res = await asyncio.to_thread(self.control.exec, g, cmd, self.s.guest_task_timeout_s)
                    break
                except ProxmoxError as e:
                    if attempt == 2:
                        raise RunnerError(f"E_RUN_GAME: {client} ({g.name}): {e}") from e
                    await asyncio.sleep(10 * self.s.time_scale)
            lines = [ln.strip() for ln in res.out.splitlines() if ln.strip()]
            if res.exitcode != 0 or len(lines) < 2:
                raise RunnerError(f"E_RUN_GAME: {client} ({g.name}): no running SkyrimSE.exe to read ({res.err.strip()[:200] or res.exitcode})")
            path, version = lines[-2], lines[-1]
            if version != rec.game and not version.startswith(rec.game + "."):
                raise RunnerError(f"E_RUN_GAME: {client} ({g.name}) runs SkyrimSE.exe {version} from {path}; the run plays {rec.game}")
            if len(lines) >= 3 and "@" in lines[-3]:
                rec.games[client] = lines[-3]
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
        if step.kind == "until":
            return await self._until(rec, index, step)
        assert step.client and step.action
        if step.action == "teleport":
            return await self._teleport(rec, index, step)
        if step.action in SERVER_ACTIONS:
            try:
                body = await asyncio.to_thread(self.state.command, step.client, step.action, step.args)
                # the server's answer is the step's note (papyrus-av's base and current, learn-spell's learned,
                # give's count): a set the server took as a no-op shows in the run's own result
                # (x-headshot-probe's "Archery" step answered ok and changed nothing, 20261018-164202)
                return True, self._answer(rec, index, step, body)
            except StateError as e:
                rec.failures.append({"step": index, "kind": "server-command", "error": str(e)})
                rec.verdict = "red"
                return False, str(e)
        if step.action == "screenshot":
            return await self._screenshot(rec, index, step.client)
        if step.action == "relaunch":
            return await self._relaunch(rec, index, step.client)
        if step.action == "frida":
            return await self._frida_start(rec, index, step.client, step.args)
        if step.action in ("connect", "reconnect") and rec.scenario.solo:
            raise RunnerError(f"E_RUN_SOLO: {step.action} has no meaning in a solo run (the game runs without skymp5-client); the clients' heartbeats are the gate")
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
            return True, self._answer(rec, index, step, qs.result.get("data"))
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
        again, until teleport_timeout_s is spent. A step may widen that bound
        with its own `tolerance` (a drop onto a slope slides; the map-markers
        range probe, 20261005-221343, landed 116 units off); it never reaches
        the gamemode."""
        assert step.client
        args = dict(step.args)
        tolerance = float(args.pop("tolerance", self.s.teleport_tolerance))
        started = self._clock()
        deadline = started + self.s.teleport_timeout_s
        attempts = 0
        last = "no report"
        while True:
            attempts += 1
            try:
                await asyncio.to_thread(self.state.command, step.client, "teleport", args)
                await asyncio.sleep(self.s.teleport_settle_s * self.s.time_scale)
                qs = await self.board.run_step(step.client, "dump-state", {}, self.s.step_timeout_s)
                actor = await asyncio.to_thread(self.state.actor, step.client)
            except StateError as e:
                rec.failures.append({"step": index, "kind": "server-command", "error": str(e)})
                rec.verdict = "red"
                return False, str(e)
            dump = qs.result.get("data") if qs.ok and isinstance(qs.result.get("data"), dict) else None
            client_there = dump is not None and self._dump_at_target(dump, args, tolerance)
            server_there = actor is not None and self._at_target(actor, args, tolerance)
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

    def _dump_at_target(self, dump: dict[str, Any], args: dict[str, Any], tolerance: float | None = None) -> bool:
        """The client's own position (dump-state pos, absolute world units)
        against the scenario's target: offsets from a named cell's origin when
        the table knows the cell, absolute otherwise."""
        pos = dump.get("pos")
        if not isinstance(pos, (list, tuple)) or len(pos) < 2:
            return False
        cell = self.tables.cell(str(args.get("cell", ""))) if args.get("cell") is not None else None
        origin = cell.origin if cell is not None else (0.0, 0.0, 0.0)
        try:
            bound = self.s.teleport_tolerance if tolerance is None else tolerance
            return all(abs(float(pos[i]) - float(origin[i]) - float(args.get(k, 0) or 0)) <= bound for i, k in ((0, "x"), (1, "y")))
        except (TypeError, ValueError):
            return False

    def _at_target(self, actor: dict[str, Any], args: dict[str, Any], tolerance: float | None = None) -> bool:
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
            bound = self.s.teleport_tolerance if tolerance is None else tolerance
            return all(abs(float(frame[k]) - float(args.get(k, 0) or 0)) <= bound for k in ("x", "y"))
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

    async def _evaluate(self, rec: RunRecord, index: int, exprs: list[str]) -> tuple[list[dict[str, Any]], str, str | None]:
        """`exprs` evaluated once against fresh views (a dump-state from each
        client an expression reads): the failures, as an assert records them,
        the readings as text, and the client whose dump-state timed out, if
        one did (nothing is evaluated then)."""
        needed: set[str] = set()
        for expr in exprs:
            needed |= clients_needing_views(expr, rec.scenario.clients)  # fakeclients have no view
        if needed:
            results = await asyncio.gather(*(self.board.run_step(c, "dump-state", {}, self.s.step_timeout_s) for c in sorted(needed)))
            for qs in results:
                if not qs.ok:
                    return [], "", qs.client
            paused = self._paused(sorted(needed), index)
            if paused:
                return paused, "", None
        evaluator = Evaluator(self.state, self.board, self._client_names(rec.scenario), parity=rec.scenario.parity, references_dir=self.s.references_dir)
        failed: list[dict[str, Any]] = []
        for expr in exprs:
            try:
                held = await asyncio.to_thread(evaluator.evaluate, expr)
                if not held:
                    failed.append({"step": index, "kind": "assertion", "expr": expr, "error": "false", "values": dict(evaluator.readings)})
            except AssertionSyntax as e:
                failed.append({"step": index, "kind": "assertion-syntax", "expr": expr, "error": str(e)})
            except (AssertionData, StateError) as e:
                failed.append({"step": index, "kind": "assertion-data", "expr": expr, "error": str(e)})
        return failed, "; ".join(f"{k} = {v}" for k, v in evaluator.readings.items()), None

    def _paused(self, clients: list[str], index: int | str) -> list[dict[str, Any]]:
        """The seats among `clients` whose last dump-state shows a message box: the game sits
        paused under MessageBoxMenu, nothing it would measure moves, and an assert about it can
        hold while measuring nothing (2026-10-14: r-melee-power-a went green twice under Survival
        Mode's first-load prompt; solo runs now answer it, thuum-solo-survival-prompt). Of the 454
        dump-states the lab kept from 10-14 to 10-17, only those two showed the box."""
        out: list[dict[str, Any]] = []
        for c in clients:
            menus = (self.board.view(c) or {}).get("menus")
            if isinstance(menus, list) and "MessageBoxMenu" in menus:
                out.append({"step": index, "kind": "paused", "client": c,
                            "error": f"E_RUN_PAUSED: {c}'s game is paused under a message box (menus: {', '.join(map(str, menus))}), so it measured nothing"})
        return out

    async def _assert(self, rec: RunRecord, index: int, step: Step) -> tuple[bool, str]:
        failed, read, slow = await self._evaluate(rec, index, step.assertions)
        if slow:
            rec.failures.append({"step": index, "kind": "timeout", "client": slow, "error": "dump-state before assert timed out"})
            rec.verdict = "red"
            return False, f"dump-state from {slow} timed out"
        if any(f["kind"] == "assertion-syntax" for f in failed):
            rec.verdict = "error"
        if failed:
            rec.failures.extend(failed)
            if rec.verdict == "running":
                rec.verdict = "red"
            if failed[0]["kind"] == "paused":
                return False, str(failed[0]["error"])
            return False, f"{len(failed)} of {len(step.assertions)} failed" + (f" ({read})" if read else "")
        return True, f"{len(step.assertions)} held" + (f" ({read})" if read else "")

    async def _until(self, rec: RunRecord, index: int, step: Step) -> tuple[bool, str]:
        """until: the expressions polled every `every` seconds until all hold,
        so a scenario waits for a condition, not for a sleep sized for the
        slowest case (the process plan's B7). Past `within` (seconds, never
        scaled, as the judged teleport's cap) the step fails as an assert
        does, each failure of kind "until" with its last readings; a syntax
        error fails at once."""
        started = self._clock()
        deadline = started + (step.seconds or 0.0)
        polls = 0
        while True:
            polls += 1
            failed, read, slow = await self._evaluate(rec, index, step.assertions)
            if not failed and not slow:
                note = f"{len(step.assertions)} held after {self._clock() - started:.1f}s, {polls} poll(s)" + (f" ({read})" if read else "")
                return True, note
            syntax = [f for f in failed if f["kind"] == "assertion-syntax"]
            if syntax:
                rec.failures.extend(syntax)
                rec.verdict = "error"
                return False, str(syntax[0]["error"])
            # a message box waits for a key that no step presses: no poll would ever see it close
            paused = [f for f in failed if f["kind"] == "paused"]
            if paused:
                rec.failures.extend(paused)
                if rec.verdict == "running":
                    rec.verdict = "red"
                return False, str(paused[0]["error"])
            if self._clock() >= deadline:
                if slow:
                    failed = [{"step": index, "kind": "timeout", "client": slow, "error": "dump-state during until timed out"}]
                for f in failed:
                    if f["kind"] == "assertion":
                        f["kind"] = "until"
                    f["error"] = f"{f['error']} after {step.seconds:g}s, {polls} poll(s)"
                rec.failures.extend(failed)
                if rec.verdict == "running":
                    rec.verdict = "red"
                return False, f"{len(failed)} of {len(step.assertions)} did not hold within {step.seconds:g}s" + (f" ({read})" if read else "")
            await asyncio.sleep((step.every or 1.0) * self.s.time_scale if self.s.time_scale else 0.01)

    async def _relaunch(self, rec: RunRecord, index: int, client: str) -> tuple[bool, str]:
        """relaunch: the player quits the game and starts it again, so its
        client loads a fresh generated save at the next login, as a player
        coming back another day does. A reconnect is not that: an in-game
        client keeps its world and only moves its player (skymp5-client
        remoteServer.ts, CreateActor isMe). The guest agent stops the game
        and starts the launch task; then the step holds for a poll from the
        new process (any poll after the stop is one), for a dump-state, which
        lab-driver answers only in-game (it runs steps on update), so the new
        save is loaded, and for the server's online list."""
        def fail(error: str) -> tuple[bool, str]:
            rec.failures.append({"step": index, "kind": "lab", "client": client, "error": error})
            rec.verdict = "red"
            return False, error

        g = self.tables.guest_for_client(client)
        if g is None or not g.managed:
            return fail(f"E_RUN_RELAUNCH: {client} is not a managed client")
        cmd = ["powershell", "-NoProfile", "-Command", self.s.relaunch_cmd]
        try:
            res = await asyncio.to_thread(self.control.exec, g, cmd, self.s.guest_task_timeout_s)
        except ProxmoxError as e:
            return fail(f"E_RUN_RELAUNCH: {g.name}: {e}")
        if res.exitcode != 0:
            return fail(f"E_RUN_RELAUNCH: {g.name}: exit {res.exitcode}: {res.err.strip()[:200]}")
        started = self._clock()
        if not await self.board.wait_heartbeat(client, started, self.s.relaunch_timeout_s):
            return fail(f"E_RUN_RELAUNCH: {client} ({g.name}) did not poll within {self.s.relaunch_timeout_s}s")
        left = max(1.0, self.s.relaunch_timeout_s - (self._clock() - started))
        qs = await self.board.run_step(client, "dump-state", {}, left)
        if not qs.ok:
            return fail(f"E_RUN_RELAUNCH: {client} not in game: {qs.result.get('error', 'no dump-state')}")
        rec.notes.append(f"step {index}: {client} relaunched, in game after {self._clock() - started:.1f}s")
        # the new game is the one the run's end compares (Runner._crash_check)
        rec.games.pop(client, None)
        identity = await self._game_identity(g)
        if identity:
            rec.games[client] = identity
        return await self._wait_online(rec, index, client, "relaunch")

    async def _game_identity(self, g: Guest) -> str:
        """The seat's game process as Settings.game_check_cmd's first line prints it (pid@start,
        UTC), or "" when none runs or the read fails."""
        cmd = ["powershell", "-NoProfile", "-Command", self.s.game_check_cmd]
        try:
            res = await asyncio.to_thread(self.control.exec, g, cmd, self.s.guest_task_timeout_s)
        except ProxmoxError:
            return ""
        lines = [ln.strip() for ln in res.out.splitlines() if ln.strip()]
        return lines[-3] if res.exitcode == 0 and len(lines) >= 3 and "@" in lines[-3] else ""

    async def _frida_start(self, rec: RunRecord, index: int, client: str, args: dict[str, Any]) -> tuple[bool, str]:
        """frida {script, params?}: a lab/frida script started on the client's
        game at this step, as POST /lab/frida starts one beside a run, its
        trace collected with the run's artifacts. `params` are prepended as
        globalThis.LAB_PARAMS, so one script serves a person (none) and the lab
        (poison-trace.js's ANSWER_YES answers the game's poison box: thuum
        docs/verbs/poison.md)."""
        def fail(msg: str) -> tuple[bool, str]:
            rec.failures.append({"step": index, "kind": "lab", "error": msg})
            rec.verdict = "error"
            return False, msg

        script = Path(str(args.get("script", ""))).name
        src = Path(self.s.frida_scripts_dir) / script
        if not script.endswith(".js") or not src.is_file():
            return fail(f"E_RUN_FRIDA: no script {script!r} under {self.s.frida_scripts_dir}")
        params = args.get("params") or {}
        if not isinstance(params, dict):
            return fail("E_RUN_FRIDA: params is a map")
        name = script
        if params:
            name = f"{src.stem}-{rec.run_id}-{index}.js"
            up = Path(self.s.frida_scripts_dir) / "uploads"
            up.mkdir(parents=True, exist_ok=True)
            (up / name).write_text(f"globalThis.LAB_PARAMS = {json.dumps(params)};\n" + src.read_text())
        g = self.tables.guest_for_client(client)
        if g is None or not g.managed:
            return fail(f"E_RUN_FRIDA: {client} is not a managed guest")
        url = f"{self.s.lab_api_internal_url.rstrip('/')}/frida/scripts/{name}"
        cmd = ["powershell", "-NoProfile", "-Command",
               self.s.frida_exec_template.format(url=url, name=name, lab_dir=self.s.client_lab_dir, out="")]
        try:
            res = await asyncio.to_thread(self.control.exec, g, cmd, self.s.guest_task_timeout_s)
        except ProxmoxError as e:
            return fail(f"E_RUN_FRIDA: {e}")
        if res.exitcode != 0:
            return fail(f"E_RUN_FRIDA: {name} on {client} exited {res.exitcode}: {res.err.strip()[:200]}")
        self.frida_started.append((client, name))
        return True, f"frida {name} started"

    async def _screenshot(self, rec: RunRecord, index: int, client: str) -> tuple[bool, str]:
        shots = rec.dir / "screenshots"
        shots.mkdir(exist_ok=True)
        target = shots / f"{index:03d}-{client}.png"
        g = self.tables.guest_for_client(client)
        lost = ""
        try:
            if g is not None and g.managed:
                remote = f"{self.s.client_lab_dir}\\shots\\{index:03d}.png"
                cmd = ["powershell", "-NoProfile", "-Command", self.s.screenshot_cmd_template.format(lab_dir=self.s.client_lab_dir, out=remote)]
                try:
                    res = await asyncio.to_thread(self.control.exec, g, cmd, self.s.guest_task_timeout_s)
                    if res.exitcode != 0:
                        return True, f"screenshot helper exited {res.exitcode}: {res.err.strip()[:200]}"
                except ProxmoxError as e:
                    # a helper whose pid the agent lost has ended: its file says whether it wrote the shot
                    if "E_PVE_EXEC_LOST" not in str(e):
                        raise
                    lost = " (the helper's exec answer was lost; read from its file)"
                b64 = await asyncio.to_thread(self.control.file_read, g, remote + ".b64")
                target.write_bytes(base64.b64decode(b64))
            else:
                qs = await self.board.run_step(client, "request-screenshot", {}, self.s.step_timeout_s)
                b64 = (qs.result.get("data") or {}).get("png_b64") if qs.ok else None
                if not b64:
                    return True, f"no screenshot from {client}: {qs.result.get('error', 'no png_b64 in result')}"
                target.write_bytes(base64.b64decode(b64))
            return True, target.name + lost
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
            # this run's lines alone: the container outlives a run (a run on
            # the same master files only starts it again), and a bare `logs`
            # gave each run every earlier run's lines too (2026-10-09: a
            # glide's refusals read as a later smoke run's)
            r = await asyncio.to_thread(self.system.run, self._compose("logs", "--no-color", "--since", rec.started_at, self.s.compose_service))
            (rec.dir / "server.log").write_text(r.stdout)
            rec.artifacts.append("server.log")
        for name in wanted:
            if name.endswith(".log") and name != "server.log":
                client = name[:-4]
                await self._client_log(rec, client, name)
        if "screenshots" in wanted and (rec.dir / "screenshots").is_dir():
            rec.artifacts.append("screenshots")
        if "trace" in wanted:
            # each client's last watch-stop, whole (ADR-031's recorder): what the
            # parity assertion read, and what a reference is made from
            # (lab/references/<action>-<role>.json, committed by hand, reviewed)
            for client in rec.scenario.clients:
                data = self.board.watch(client)
                if isinstance(data, dict):
                    name = f"trace-{client}.json"
                    (rec.dir / name).write_text(json.dumps(data, indent=1, sort_keys=True))
                    rec.artifacts.append(name)
        for client, script in dict.fromkeys(self.frida_started):
            await self._frida_trace(rec, client, script)
        self.frida_started.clear()
        if self.s.hang_evidence:
            for client in self._hung_clients(rec):
                await self._hang_evidence(rec, client)
        # each seat's game at the end: a crash, or a game replaced or gone, is a lab fault, so a run
        # that would have been green is error and its run set reruns it (ADR-030); a red stays red
        green = rec.verdict == "running" and not rec.failures
        faulted = await asyncio.gather(*(self._crash_check(rec, c) for c in rec.scenario.clients))
        if any(faulted) and green:
            rec.verdict = "error"
        # a seat whose last dump-state shows a message box sat paused: the run measured nothing there
        flagged = {f.get("client") for f in rec.failures if f.get("kind") == "paused"}
        rec.failures.extend(self._paused([c for c in rec.scenario.clients if c not in flagged], "end"))
        unknown = [n for n in wanted if n not in ("server.log", "screenshots", "world-diff", "pcap", "trace") and not n.endswith(".log")]
        for n in unknown:
            rec.notes.append(f"unknown artifact {n!r} ignored")

    def _hung_clients(self, rec: RunRecord) -> list[str]:
        """The clients whose seat stopped answering: the board's own timeout, a dump-state before
        an assert that timed out, a teleport whose last dump-state got no answer from the seat
        (E_RUN_TELEPORT with the client's "timeout"), or a relaunch whose game never came back in
        game (E_RUN_RELAUNCH "not in game"). The nightly of 2026-10-17 lost b-push's and
        a-rotfern's freezes to a narrower rule. A teleport the seat answered but never settled,
        or a connect that never came online, is not a hang."""
        hung: list[str] = []
        for f in rec.failures:
            client, error, kind = f.get("client"), str(f.get("error") or ""), f.get("kind")
            silent = (kind == "timeout" and (error == "timeout" or "timed out" in error
                                              or (error.startswith("E_RUN_TELEPORT") and '"client": "timeout"' in error))) \
                or (kind == "lab" and error.startswith("E_RUN_RELAUNCH") and "not in game" in error)
            if silent and client and client not in hung:
                hung.append(client)
        return hung

    async def _hang_evidence(self, rec: RunRecord, client: str) -> None:
        """A hung seat's skse64.log and a full dump of its game, taken before the next run's
        rollback erases them (Settings.hang_evidence; the load freeze of 2026-10-16). The seat
        uploads the dump to PUT /clients/<client>/hang-dump/<run> itself, a few GB over the
        LAN, which the guest agent's file read could never carry. Every failure is a note."""
        g = self.tables.guest_for_client(client)
        if g is None or not g.managed:
            rec.notes.append(f"hang evidence: {client} is unmanaged or unmapped; nothing taken")
            return
        await self._skse_logs(rec, g, client)  # a run that lists <client>.log has them already
        url = f"{self.s.client_lab_api_url}/clients/{client}/hang-dump/{rec.run_id}"
        script = (_HANG_DUMP_PS.replace("@LAB_DIR@", self.s.client_lab_dir).replace("@URL@", url)
                  .replace("@UPLOAD_S@", str(max(60, int(self.s.hang_dump_timeout_s * 0.6)))))
        cmd = ["powershell", "-NoProfile", "-NonInteractive", "-EncodedCommand",
               base64.b64encode(script.encode("utf-16-le")).decode()]
        try:
            res = await asyncio.to_thread(self.control.exec, g, cmd, self.s.hang_dump_timeout_s)
        except ProxmoxError as e:
            rec.notes.append(f"hang dump {client}: {e}")
            return
        lines = [ln.strip() for ln in res.out.splitlines() if ln.strip()]
        rec.notes.append(f"hang dump {client}: {(lines[-1] if lines else 'no output')[:300]}"
                         + ("" if res.exitcode == 0 else f" (exit {res.exitcode}: {res.err.strip()[:200]})"))
        name = f"{client}-SkyrimSE.dmp"
        if (rec.dir / name).is_file():
            rec.artifacts.append(name)

    async def _crash_check(self, rec: RunRecord, client: str) -> bool:
        """A managed seat's game at the run's end, True when it failed the run: a dump Windows
        Error Reporting wrote for SkyrimSE.exe since the run began (crash-dumps.ps1's LocalDumps),
        which the seat uploads as <client>-SkyrimSE-crash.dmp, and its game process against the
        one the version check found or a relaunch step started. A seat whose game was replaced
        (launch.ps1 starts the game again when it dies within a minute of its window, and the run
        went on against the new one) or gone at the end failed the same way. Its launch.log and
        SKSE logs come with the failure. Every read failure is a note."""
        g = self.tables.guest_for_client(client)
        if g is None or not g.managed:
            return False
        url = f"{self.s.client_lab_api_url}/clients/{client}/hang-dump/{rec.run_id}?name=SkyrimSE-crash.dmp"
        script = (_CRASH_PS.replace("@DUMP_DIR@", self.s.client_dump_dir).replace("@SINCE@", str(self._since(rec)))
                  .replace("@URL@", url).replace("@UPLOAD_S@", str(max(30, int(self.s.crash_check_timeout_s * 0.8)))))
        cmd = ["powershell", "-NoProfile", "-NonInteractive", "-EncodedCommand",
               base64.b64encode(script.encode("utf-16-le")).decode()]
        try:
            res = await asyncio.to_thread(self.control.exec, g, cmd, self.s.crash_check_timeout_s)
        except ProxmoxError as e:
            rec.notes.append(f"crash check {client}: {e}")
            return False
        lines = [ln.strip() for ln in res.out.splitlines() if ln.strip()]
        try:
            seen = json.loads(lines[-1]) if lines else None
        except ValueError:
            seen = None
        if not isinstance(seen, dict):
            rec.notes.append(f"crash check {client}: no answer ({(lines[-1] if lines else res.err.strip())[:200]})")
            return False
        errors: list[str] = []
        dumps = [d for d in seen.get("dumps") or [] if isinstance(d, dict)]
        if dumps:
            name = f"{client}-SkyrimSE-crash.dmp"
            kept = (rec.dir / name).is_file()
            if kept:
                rec.artifacts.append(name)
            last = dumps[-1]
            errors.append(f"E_RUN_CRASH: {client}'s game crashed: Windows Error Reporting wrote {len(dumps)} dump(s) "
                          f"since the run began, the newest {last.get('name')} ({last.get('bytes')} bytes, {last.get('utc')}), "
                          + (f"kept as {name}" if kept else f"not kept (curl {seen.get('curl')})"))
        was = rec.games.get(client)
        games = [x for x in seen.get("games") or [] if isinstance(x, str)]
        if was and "unreadable" not in games:
            if not games:
                errors.append(f"E_RUN_GAME_LOST: {client}'s game ({was}) was not running at the run's end")
            elif was not in games:
                errors.append(f"E_RUN_GAME_REPLACED: {client}'s game was {was} at the version check and {', '.join(games)} at the run's end")
        if not errors:
            return False
        for error in errors:
            rec.failures.append({"step": "end", "kind": "lab", "client": client, "error": error})
        await self._fetch_client_file(rec, g, f"{client}-launch.log", f"'{self.s.client_lab_dir}\\launch.log'")
        await self._skse_logs(rec, g, client)
        return True

    def _since(self, rec: RunRecord) -> int:
        """Unix seconds a few minutes before the run began: the dumps a run's end collects (a
        clone's clock after its cold boot can sit behind lab-api's by a little)."""
        try:
            return calendar.timegm(time.strptime(rec.started_at, "%Y-%m-%dT%H:%M:%SZ")) - 300
        except ValueError:
            return int(self._wall()) - 3600

    async def _skse_logs(self, rec: RunRecord, g: Guest, client: str) -> None:
        """Every *.log in the seat's SKSE folder, the one skyrim-platform.log is in, as
        <client>-<file>: skse64.log prints the game's image base, which the load freeze's
        hypothesis ties to the hang (thuum-magnus, 2026-10-17), and each SKSE plugin writes its
        own log there (TMS_AIPathingFreezeFix.log is the freeze fix layer's evidence), so a new
        layer's log needs no edit here. skyrim-platform.log itself is <client>.log. Copied into
        the lab directory first, as _fetch_client_file does, then read one by one; a failure is
        a note, never a failed run."""
        if client in rec.skse_fetched:
            return
        rec.skse_fetched.add(client)
        # skyrim-platform.log's folder first, then every other My Games\<folder>\SKSE: a CommonLibSSE-NG
        # plugin can log under My Games\Skyrim.INI\SKSE (the freeze fix's TMS_AIPathingFreezeFix.log does,
        # 2026-10-17); a name already taken by an earlier folder keeps the first. Extension, since -Filter
        # '*.log' also matches the rotated skse64.log0 and .log1
        folder = PureWindowsPath(self.s.client_driver_log).parent
        own = PureWindowsPath(self.s.client_driver_log).name
        cmd = ["powershell", "-NoProfile", "-Command",
               f"$main = '{folder}'; $seen = @{{}}; "
               f"@($main) + @(Get-ChildItem -LiteralPath (Split-Path -Parent (Split-Path -Parent $main)) -Directory -ErrorAction SilentlyContinue | "
               f"ForEach-Object {{ Join-Path $_.FullName 'SKSE' }} | Where-Object {{ $_ -ne $main -and (Test-Path -LiteralPath $_) }}) | "
               f"ForEach-Object {{ Get-ChildItem -LiteralPath $_ -Filter '*.log' -File -ErrorAction SilentlyContinue }} | "
               f"Where-Object {{ $_.Extension -eq '.log' -and $_.Name -ne '{own}' -and -not $seen.ContainsKey($_.Name) }} | ForEach-Object {{ $seen[$_.Name] = 1; "
               f"Copy-Item -LiteralPath $_.FullName -Destination (Join-Path '{self.s.client_lab_dir}' ('{client}-' + $_.Name)) -Force; $_.Name }}"]
        try:
            res = await asyncio.to_thread(self.control.exec, g, cmd, self.s.guest_task_timeout_s)
        except ProxmoxError as e:
            rec.notes.append(f"{client} SKSE logs: {e}")
            return
        if res.exitcode != 0:
            rec.notes.append(f"{client} SKSE logs: exit {res.exitcode}: {res.err.strip()[:200]}")
            return
        for line in res.out.splitlines():
            log = line.strip()
            if not re.fullmatch(r"[A-Za-z0-9_.-][A-Za-z0-9 _.-]*\.log", log):
                continue
            name = f"{client}-{log.replace(' ', '_')}"
            if name in rec.artifacts or name in (f"{client}-driver.log", f"{client}-launch.log", f"{client}-before.log"):
                continue
            try:
                text = await asyncio.to_thread(self.control.file_read, g, f"{self.s.client_lab_dir}\\{client}-{log}")
            except ProxmoxError as e:
                rec.notes.append(f"{name}: {e}")
                continue
            (rec.dir / name).write_text(text)
            rec.artifacts.append(name)

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
        # the SKSE folder's logs beside it in every run (skse64.log's image base, each plugin's own)
        await self._skse_logs(rec, g, client)

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

    async def _frida_trace(self, rec: RunRecord, client: str, script: str, suffix: str = "") -> None:
        g = self.tables.guest_for_client(client)
        if g is None or not g.managed:
            rec.notes.append(f"frida {script}: {client} unmanaged; trace not fetched")
            return
        (rec.dir / "frida").mkdir(exist_ok=True)
        name = f"{client}-{script}{suffix}.jsonl"
        # frida-inject's stdout, still open for writing while the game runs:
        # the agent's file-read cannot open it then (run 20261006-183431,
        # E_PVE_FILE "being used by another process"), a read that shares
        # write access can, so it is copied that way first
        out = f"{self.s.client_lab_dir}\\frida\\{script}.out"
        copy = f"{out}.copy"
        try:
            cmd = ["powershell", "-NoProfile", "-Command",
                   f"$s = [IO.File]::Open('{out}', 'Open', 'Read', 'ReadWrite'); $d = [IO.File]::Create('{copy}'); $s.CopyTo($d); $d.Close(); $s.Close()"]
            res = await asyncio.to_thread(self.control.exec, g, cmd, self.s.guest_task_timeout_s)
            if res.exitcode != 0:
                rec.notes.append(f"frida {script}: copy exited {res.exitcode}: {res.err.strip()[:200]}")
                return
            text = await asyncio.to_thread(self.control.file_read, g, copy)
            (rec.dir / "frida" / name).write_text(text)
            rec.artifacts.append(f"frida/{name}")
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
        reference id, or a name a later refs table resolves), race-pick's
        race its form id."""
        out = dict(args or {})
        try:
            if action == "equip" and "item" in out:
                out["formId"] = self.tables.base_id(str(out.pop("item")))
            if action == "craft" and isinstance(out.get("recipe"), str):
                out["recipe"] = self.tables.base_id(out["recipe"])
            if action == "race-pick" and isinstance(out.get("race"), str):
                out["race"] = self.tables.base_id(out["race"])
            if action in ("global", "weather") and isinstance(out.get("form"), str):
                out["form"] = self.tables.base_id(out["form"])
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
