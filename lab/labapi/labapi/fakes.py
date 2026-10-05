"""Test doubles that speak the same contracts as the real things: a Proxmox
that records calls, a system that records commands, and a server state that
answers the labState and labCommand RPCs over an httpx mock transport
(CONTRACT.md). `labapi-dev` runs the app on these."""

from __future__ import annotations

import json
import shutil
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import httpx

from .guests import Guest
from .proxmox import ExecResult, ProxmoxError
from .system import Completed


class FakeProxmox:
    def __init__(self):
        self.calls: list[tuple] = []
        self.statuses: dict[int, str] = {}
        self.files: dict[str, str] = {}
        self.exec_result = ExecResult(0, "", "")
        # what the game check (Settings.game_check_cmd) reads on a clone: the
        # Steam folder's exe at the default version unless a test says otherwise
        self.game = ExecResult(0, "C:\\Program Files (x86)\\Steam\\steamapps\\common\\Skyrim Special Edition\\SkyrimSE.exe\r\n1.7.104.0\r\n", "")
        self.game_misses = 0

    def stop(self, guest: Guest) -> None:
        self.calls.append(("stop", guest.vmid))
        self.statuses[guest.vmid] = "stopped"

    def rollback(self, guest: Guest, snapshot: str) -> None:
        self.calls.append(("rollback", guest.vmid, snapshot))

    def start(self, guest: Guest) -> None:
        self.calls.append(("start", guest.vmid))
        self.statuses[guest.vmid] = "running"

    def status(self, guest: Guest) -> str:
        self.calls.append(("status", guest.vmid))
        return self.statuses.get(guest.vmid, "running")

    def exec(self, guest: Guest, command: list[str], timeout: float) -> ExecResult:
        self.calls.append(("exec", guest.vmid, tuple(command)))
        if any("Get-Process SkyrimSE" in c for c in command):
            # a guest agent too busy to answer, this many times first
            if self.game_misses > 0:
                self.game_misses -= 1
                raise ProxmoxError(f"E_PVE_EXEC: {guest.name}: qga command 'guest-exec' failed - got timeout")
            return self.game
        return self.exec_result

    def file_read(self, guest: Guest, path: str) -> str:
        self.calls.append(("file_read", guest.vmid, path))
        if path not in self.files:
            raise ProxmoxError(f"E_PVE_FILE: no such file {path} on {guest.name}")
        return self.files[path]


class _FakeCapture:
    def __init__(self, owner: "FakeSystem", cmd: list[str]):
        self._owner = owner
        self.cmd = cmd
        self.stopped = False

    def stop(self) -> None:
        self.stopped = True
        self._owner.stopped_captures.append(self.cmd)


class FakeSystem:
    def __init__(self, ready: bool = True):
        self.commands: list[list[str]] = []
        self.captures: list[list[str]] = []
        self.stopped_captures: list[list[str]] = []
        self.ready = ready
        self.log_text = "fake server log\n"
        self.chowned: list[tuple[str, int, int]] = []
        self.envs: list[dict[str, str]] = []  # the env each command ran with, beside commands

    fakeclient_rc = 0

    def run(self, cmd: list[str], timeout: float = 120.0, env: dict[str, str] | None = None) -> Completed:
        self.commands.append(list(cmd))
        self.envs.append(dict(env or {}))
        if cmd[:2] == ["docker", "compose"] and "logs" in cmd:
            return Completed(0, self.log_text, "")
        if any(c.endswith("fakeclient") for c in cmd):
            events = ['{"event": "actor", "idx": 0, "pos": [0, 0, 0], "rot": [0, 0, 0], "worldOrCell": 60}']
            if self.fakeclient_rc:
                events.append('{"event": "error", "error": "connect timed out"}')
            events.append('{"event": "done", "received": 3, "rc": %d}' % self.fakeclient_rc)
            return Completed(self.fakeclient_rc, "\n".join(events) + "\n", "")
        return Completed(0, "", "")

    def start_capture(self, cmd: list[str]):
        self.captures.append(list(cmd))
        return _FakeCapture(self, list(cmd))

    def tcp_ready(self, host: str, port: int, timeout: float) -> bool:
        return self.ready

    def copytree(self, src: Path, dst: Path) -> None:
        shutil.copytree(src, dst, dirs_exist_ok=True)

    def rmtree(self, path: Path) -> None:
        shutil.rmtree(path, ignore_errors=True)

    def chown_tree(self, path: Path, uid: int, gid: int) -> None:
        self.chowned.append((str(path), uid, gid))

    def meminfo(self) -> dict[str, int]:
        return {"MemTotal": 8 << 30, "MemAvailable": 4 << 30}


@dataclass
class FakeActor:
    x: float = 0.0
    y: float = 0.0
    z: float = 0.0
    cell: str = "lab-spawn"
    isDead: bool = False
    healthPercentage: float = 1.0
    magickaPercentage: float = 1.0
    staminaPercentage: float = 1.0
    appearance: dict[str, Any] | None = None
    race_menu_open: bool = False
    # (raceId, allowed) per UpdateAppearance the server judged
    appearance_attempts: list[tuple[int, bool]] = field(default_factory=list)
    inventory: dict[int, int] = field(default_factory=dict)
    spawn: tuple[float, float, float, str] = (0.0, 0.0, 0.0, "lab-spawn")
    online: bool = True  # listed by labState kind online
    # teleports the client drops (Skyrim Platform's post-login block): the
    # record stays where it is, as the real server's does once the client
    # reports its true position back.
    drops_teleports: int = 0
    # a teleport lands this far off in x, as a drop onto a slope slides
    slides: float = 0.0


class FakeState:
    """The lab gamemode's two RPCs, in memory. `transport()` serves them the way
    the server would, so the real RpcStateClient is what tests exercise."""

    def __init__(self):
        self.actors: dict[int, FakeActor] = {}
        self.rpc_log: list[tuple[str, dict[str, Any]]] = []
        self.cells: dict[str, str] = {}

    def spawn(self, profile_id: int, x: float = 0.0, y: float = 0.0, z: float = 0.0, cell: str = "lab-spawn") -> FakeActor:
        a = FakeActor(x, y, z, cell)
        self.actors[profile_id] = a
        return a

    def rpc(self, name: str, payload: dict[str, Any]) -> dict[str, Any]:
        self.rpc_log.append((name, payload))
        if name == "labState":
            if payload.get("kind") == "online":
                return {"players": [{"actorId": 0xFF000000 + pid, "profileId": pid} for pid in sorted(self.actors) if self.actors[pid].online]}
            actor = self.actors.get(int(payload.get("profileId", -1)))
            if actor is None:
                return {"found": False}
            if payload.get("kind") == "actor":
                app = actor.appearance
                return {
                    "found": True, "x": actor.x, "y": actor.y, "z": actor.z, "cell": actor.cell,
                    "isDead": actor.isDead, "healthPercentage": actor.healthPercentage,
                    "hasAppearance": app is not None,
                    "raceId": app.get("raceId") if app else None,
                    "sex": (1 if app.get("isFemale") else 0) if app else None,
                    "appearanceAttempts": len(actor.appearance_attempts),
                    "lastAppearanceRaceId": actor.appearance_attempts[-1][0] if actor.appearance_attempts else None,
                    "lastAppearanceAllowed": actor.appearance_attempts[-1][1] if actor.appearance_attempts else None,
                }
            if payload.get("kind") == "inventory":
                return {"found": True, "entries": [{"baseId": b, "count": c} for b, c in sorted(actor.inventory.items())]}
            return {"found": False, "error": f"unknown kind {payload.get('kind')!r}"}
        if name == "labCommand":
            actor = self.actors.get(int(payload.get("profileId", -1)))
            if actor is None:
                return {"ok": False, "error": "no actor for that profileId"}
            kind = payload.get("kind")
            if kind == "teleport":
                if actor.drops_teleports > 0:
                    actor.drops_teleports -= 1
                    return {"ok": True, "actorId": 0xFF000000 + int(payload.get("profileId", 0))}
                if "tolerance" in payload:
                    return {"ok": False, "error": "tolerance is lab-api's, not the gamemode's"}
                actor.x, actor.y, actor.z = float(payload.get("x", 0)) + actor.slides, float(payload.get("y", 0)), float(payload.get("z", 0))
                actor.cell = str(payload.get("cell", actor.cell))
                return {"ok": True}
            if kind == "give":
                base = int(payload["baseId"])
                actor.inventory[base] = actor.inventory.get(base, 0) + int(payload.get("count", 1))
                return {"ok": True}
            if kind == "set-appearance":
                # presets are files next to the real gamemode; the fake knows one
                if payload.get("preset") != "lab-nord-1":
                    return {"ok": False, "error": f"unknown preset {payload.get('preset')!r}"}
                actor.appearance = {"raceId": 1, "isFemale": False}
                return {"ok": True}
            if kind == "open-race-menu":
                actor.race_menu_open = True
                return {"ok": True}
            if kind == "set-percentages":
                for k in ("health", "magicka", "stamina"):
                    if k in payload:
                        setattr(actor, f"{k}Percentage", float(payload[k]))
                return {"ok": True}
            if kind == "kill":
                actor.isDead = True
                actor.healthPercentage = 0.0
                return {"ok": True}
            if kind == "respawn":
                actor.isDead = False
                actor.healthPercentage = 1.0
                actor.x, actor.y, actor.z, actor.cell = actor.spawn
                return {"ok": True}
            return {"ok": False, "error": f"unknown command {kind!r}"}
        return {"ok": False, "error": f"unknown rpc {name!r}"}

    def transport(self) -> httpx.MockTransport:
        def handler(request: httpx.Request) -> httpx.Response:
            if request.method != "POST" or "/rpc/" not in request.url.path:
                return httpx.Response(404, json={"error": "not an rpc"})
            name = request.url.path.rsplit("/rpc/", 1)[1]
            try:
                body = json.loads(request.content or b"{}")
            except ValueError:
                return httpx.Response(400, json={"error": "bad json"})
            return httpx.Response(200, json=self.rpc(name, body.get("payload") or {}))

        return httpx.MockTransport(handler)
