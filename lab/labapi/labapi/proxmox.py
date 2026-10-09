"""Proxmox VE through proxmoxer, behind an interface tests replace. The token
is pool-scoped (VM.Audit, VM.PowerMgmt, VM.Snapshot, VM.Snapshot.Rollback,
VM.GuestAgent.Unrestricted, VM.GuestAgent.FileRead) and the API is called by
IP at https://10.0.0.10:8006 (docs/LAB.md). GuestControl wraps any backend
with the one rule that matters: an unmanaged guest is never touched."""

from __future__ import annotations

import logging
import re
import time
from dataclasses import dataclass
from typing import Any, Protocol

from .guests import Guest

FILE_READ_MAX = 16 * 1024 * 1024  # the guest-agent file-read cap

# Self-service snapshots and promotes of the lab clients (thuum-mundus's
# recipe and guardrails, 2026-10-05, mirroring `sky-lab client baseline` and
# `promote`): only these clones, only clean-m1 names, never clean-sp. The
# PVE snapshot list proves "newest" only because sanoid exempts these clone
# volumes; a new clone VMID goes to thuum-mundus first for that exemption.
SNAPSHOT_CLIENTS = frozenset({711, 712})
_STACKED = re.compile(r"^clean-m1-[a-z0-9][a-z0-9-]*$")
SHUTDOWN_TIMEOUT_S = 180
# A shutdown task's log line that means it was not a clean ACPI shutdown: a
# timeout, or a forced or signalled stop ("got timeout", "timed out",
# "forcing stop", "terminating now with SIGTERM").
_UNCLEAN = re.compile(r"timeout|timed out|forc|terminat|sigterm|sigkill", re.IGNORECASE)


log = logging.getLogger("labapi.proxmox")

class ProxmoxError(Exception):
    """E_PVE: the API refused, a task failed, or a rule was violated."""


@dataclass(frozen=True)
class ExecResult:
    exitcode: int
    out: str
    err: str


class ProxmoxGuests(Protocol):
    def stop(self, guest: Guest) -> None: ...
    def rollback(self, guest: Guest, snapshot: str) -> None: ...
    def start(self, guest: Guest) -> None: ...
    def status(self, guest: Guest) -> str: ...
    def exec(self, guest: Guest, command: list[str], timeout: float) -> ExecResult: ...
    def file_read(self, guest: Guest, path: str) -> str: ...
    # an ACPI shutdown: the task's exit status and its log lines
    def shutdown(self, guest: Guest, timeout_s: int) -> tuple[str, list[str]]: ...
    def snapshots(self, guest: Guest) -> list[dict[str, Any]]: ...
    def snapshot_create(self, guest: Guest, name: str, description: str) -> None: ...
    def snapshot_delete(self, guest: Guest, name: str) -> None: ...
    def agent_ping(self, guest: Guest) -> bool: ...


class GuestControl:
    """The only thing the runner calls. Refuses every action on an unmanaged
    guest except status, and refuses files past the 16 MiB cap."""

    def __init__(self, backend: ProxmoxGuests):
        self._b = backend

    def _managed(self, guest: Guest, what: str) -> None:
        if not guest.managed:
            raise ProxmoxError(f"E_PVE_UNMANAGED: refusing to {what} {guest.name}; lab-api only waits for its heartbeat")

    @staticmethod
    def _call(code: str, guest: Guest, fn, *args):
        """The backend raises proxmoxer's ResourceException and requests errors
        (a guest agent that is not running, a task that failed); the runner only
        knows ProxmoxError, and anything else escaping from artifact collection
        once left a finished run marked active (2026-10-01)."""
        try:
            return fn(*args)
        except ProxmoxError:
            raise
        except Exception as e:
            raise ProxmoxError(f"{code}: {guest.name}: {type(e).__name__}: {str(e)[:200]}") from e

    def stop(self, guest: Guest) -> None:
        self._managed(guest, "stop")
        self._call("E_PVE_STOP", guest, self._b.stop, guest)

    def rollback(self, guest: Guest, snapshot: str) -> None:
        self._managed(guest, "roll back")
        if not snapshot:
            raise ProxmoxError(f"E_PVE_SNAPSHOT: {guest.name} has no snapshot name")
        self._call("E_PVE_ROLLBACK", guest, self._b.rollback, guest, snapshot)

    def start(self, guest: Guest) -> None:
        self._managed(guest, "start")
        self._call("E_PVE_START", guest, self._b.start, guest)

    def status(self, guest: Guest) -> str:
        try:
            if not guest.managed:
                # Never asked about: fenestrate is outside pool sky by design and
                # a query would only 403. Its liveness is its heartbeat.
                return "unmanaged"
            return self._b.status(guest)
        except ProxmoxError:
            return "unknown"

    def exec(self, guest: Guest, command: list[str], timeout: float) -> ExecResult:
        self._managed(guest, "exec into")
        if guest.kind != "qemu":
            raise ProxmoxError(f"E_PVE_EXEC: {guest.name} is not a qemu guest; the guest agent is qemu only")
        return self._call("E_PVE_EXEC", guest, self._b.exec, guest, command, timeout)

    def file_read(self, guest: Guest, path: str) -> str:
        self._managed(guest, "read a file from")
        content = self._call("E_PVE_FILE", guest, self._b.file_read, guest, path)
        if len(content.encode("utf-8", errors="replace")) > FILE_READ_MAX:
            raise ProxmoxError(f"E_PVE_FILE_TOO_BIG: {path} on {guest.name} exceeds the 16 MiB guest-agent cap")
        return content

    def rollback_sequence(self, guest: Guest, snapshot: str) -> None:
        """Disk-only rollback (docs/LAB.md): stop, rollback, start."""
        self.stop(guest)
        self.rollback(guest, snapshot)
        self.start(guest)

    # ----- self-service snapshots (thuum-mundus's recipe) --------------------

    def _snapshot_guard(self, guest: Guest, *names: str) -> None:
        self._managed(guest, "snapshot")
        if guest.vmid not in SNAPSHOT_CLIENTS:
            raise ProxmoxError(f"E_PVE_GUARD: {guest.name} ({guest.vmid}) is not a lab client clone lab-api may snapshot")
        for n in names:
            if n == "clean-sp" or not (n == "clean-m1" or _STACKED.match(n)):
                raise ProxmoxError(f"E_PVE_GUARD: {n!r} is not clean-m1 or clean-m1-<name>")

    @staticmethod
    def _children(snaps: list[dict[str, Any]], name: str) -> list[str]:
        return sorted(str(s.get("name")) for s in snaps if s.get("parent") == name)

    @staticmethod
    def _parent(snaps: list[dict[str, Any]], name: str) -> str | None:
        return next((s.get("parent") for s in snaps if s.get("name") == name), None)

    def _stack_guard(self, guest: Guest, snaps: list[dict[str, Any]], name: str) -> None:
        """A stacked snapshot sits directly on clean-m1: `current` stands on
        clean-m1 (a new `name`) or on `name` stacked on clean-m1 (a
        replacement). Anything deeper, say clean-m1-effects on top of a
        clean-m1-markers nobody promoted, is a shape neither promote nor
        `sky-lab` unwinds (thuum-mundus, 2026-10-05)."""
        top = self._parent(snaps, "current")
        if top == name and self._parent(snaps, name) == "clean-m1":
            return
        exists = any(s.get("name") == name for s in snaps)
        if top == "clean-m1" and not exists:
            return
        if exists and top != name:
            raise ProxmoxError(f"E_PVE_GUARD: {name} on {guest.name} has later snapshots; not replaced")
        raise ProxmoxError(f"E_PVE_GUARD: a stacked snapshot goes directly on clean-m1, and {guest.name} stands on {top} (stacked on {self._parent(snaps, top)}); promote or delete that first")

    def _await_agent(self, guest: Guest, boot_timeout: float) -> None:
        deadline = time.monotonic() + boot_timeout
        while time.monotonic() < deadline:
            if self._call("E_PVE_AGENT", guest, self._b.agent_ping, guest):
                return
            time.sleep(2.0)
        raise ProxmoxError(f"E_PVE_AGENT: {guest.name}'s guest agent did not answer within {boot_timeout:g}s of the start")

    def snapshot_clone(self, guest: Guest, name: str, description: str, quiesce_cmd: str, exec_timeout: float, boot_timeout: float) -> dict[str, Any]:
        """A cold stacked snapshot `name` (clean-m1-<x>) of a lab client,
        directly on clean-m1 or replacing itself there (_stack_guard, checked
        before anything touches the clone): quiesce (stop the game and the lab
        tasks), a clean ACPI shutdown (its task log must hold no timeout or
        force line), snapshot without RAM, start, wait for the guest agent,
        and prove `name` is the newest (its only child is `current`)."""
        self._snapshot_guard(guest, name)
        if not _STACKED.match(name):
            raise ProxmoxError(f"E_PVE_GUARD: snapshot takes a stacked name, clean-m1-<x>; {name!r} comes only from a promote")
        self._stack_guard(guest, self._call("E_PVE_SNAPSHOT", guest, self._b.snapshots, guest), name)
        self.exec(guest, ["powershell", "-NoProfile", "-Command", quiesce_cmd], exec_timeout)
        try:
            status, lines = self._call("E_PVE_SHUTDOWN", guest, self._b.shutdown, guest, SHUTDOWN_TIMEOUT_S)
        except ProxmoxError as e:
            status, lines = str(e), []
        unclean = [ln for ln in lines if _UNCLEAN.search(ln)]
        power = self.status(guest)
        if status != "OK" or unclean or power != "stopped":
            # Back as it was, with no snapshot taken. A shutdown that timed
            # out leaves the clone running, where a start would only fail with
            # "already running" and hide this error (thuum-mundus, 2026-10-05).
            if power == "stopped":
                self.start(guest)
            raise ProxmoxError(f"E_PVE_SHUTDOWN: {guest.name}: not a clean ACPI shutdown ({status}; {'; '.join(unclean[:2]) or 'no log line'}; the clone is {power}); no snapshot taken")
        snaps = self._call("E_PVE_SNAPSHOT", guest, self._b.snapshots, guest)
        try:
            self._stack_guard(guest, snaps, name)  # still true after the shutdown
        except ProxmoxError:
            self.start(guest)
            raise
        if self._parent(snaps, "current") == name:
            self._call("E_PVE_SNAPSHOT", guest, self._b.snapshot_delete, guest, name)
        self._call("E_PVE_SNAPSHOT", guest, self._b.snapshot_create, guest, name, description)
        self.start(guest)
        self._await_agent(guest, boot_timeout)
        snaps = self._call("E_PVE_SNAPSHOT", guest, self._b.snapshots, guest)
        kids = self._children(snaps, name)
        if kids != ["current"]:
            raise ProxmoxError(f"E_PVE_SNAPSHOT: {name} on {guest.name} is not the newest after the snapshot (children {kids})")
        return {"ok": True, "guest": guest.name, "snapshot": name, "parent": self._parent(snaps, name)}

    def promote_clone(self, guest: Guest, frm: str, to: str, boot_timeout: float) -> dict[str, Any]:
        """Make `to` (clean-m1) bit-identical to the stacked `frm` on top of
        it: `frm` must be the newest and `to` its parent; stop, roll back to
        `frm`, delete `frm`, delete `to`, snapshot `to` while stopped with
        `frm`'s description (which build, which driver), then `frm` again on
        top of it, the same disk, start, wait for the guest agent. The lab's
        table rolls the clients back to `frm` (guests.yaml), so it must
        still stand after a promote: without it every run failed on the
        missing name until the next staging (2026-10-08). The next staging
        replaces it in place. A failure between the two deletes and the
        snapshots leaves the clone on `frm`'s content with no `to`; the
        repair is a cold snapshot named `to`, then one named `frm`
        (docs/LAB.md)."""
        self._snapshot_guard(guest, frm, to)
        if not _STACKED.match(frm) or frm == to:
            raise ProxmoxError(f"E_PVE_GUARD: promote takes a stacked clean-m1-<x> onto its parent; got {frm!r} onto {to!r}")
        snaps = self._call("E_PVE_SNAPSHOT", guest, self._b.snapshots, guest)
        if self._children(snaps, frm) != ["current"]:
            raise ProxmoxError(f"E_PVE_GUARD: {frm} is not the newest snapshot on {guest.name}")
        if self._parent(snaps, frm) != to:
            raise ProxmoxError(f"E_PVE_GUARD: {frm} on {guest.name} is not stacked on {to} (its parent is {self._parent(snaps, frm)})")
        # PVE's snapshot list carries each description (GET .../snapshot)
        was = next((str(s.get("description") or "").strip() for s in snaps if s.get("name") == frm), "")
        description = f"promoted from {frm} by lab-api: {was}" if was else f"promoted from {frm} by lab-api"
        self.stop(guest)
        self.rollback(guest, frm)
        self._call("E_PVE_SNAPSHOT", guest, self._b.snapshot_delete, guest, frm)
        self._call("E_PVE_SNAPSHOT", guest, self._b.snapshot_delete, guest, to)
        self._call("E_PVE_SNAPSHOT", guest, self._b.snapshot_create, guest, to, description)
        again = f"{to} as promoted, stacked again for the lab's table by lab-api: {was}" if was else f"{to} as promoted, stacked again for the lab's table by lab-api"
        self._call("E_PVE_SNAPSHOT", guest, self._b.snapshot_create, guest, frm, again)
        self.start(guest)
        self._await_agent(guest, boot_timeout)
        snaps = self._call("E_PVE_SNAPSHOT", guest, self._b.snapshots, guest)
        if self._children(snaps, to) != [frm] or self._children(snaps, frm) != ["current"]:
            raise ProxmoxError(f"E_PVE_SNAPSHOT: {frm} on {guest.name} is not the newest, directly on {to}, after the promote")
        return {"ok": True, "guest": guest.name, "promoted": frm, "to": to, "parent": self._parent(snaps, to), "restacked": frm}


class ProxmoxerGuests:
    """The real backend. Imported lazily so tests run without proxmoxer."""

    def __init__(self, url: str, token_id: str, token_secret: str, node: str, verify_ssl: bool | str, task_timeout: float = 120.0, http_timeout: float = 30.0):
        from urllib.parse import urlparse

        from proxmoxer import ProxmoxAPI

        u = urlparse(url)
        if "!" not in token_id:
            raise ProxmoxError("E_PVE_TOKEN: PVE_TOKEN_ID must look like user@realm!tokenname")
        user, token_name = token_id.split("!", 1)
        self._api = ProxmoxAPI(u.hostname, port=u.port or 8006, user=user, token_name=token_name, token_value=token_secret, verify_ssl=verify_ssl, timeout=http_timeout)
        self._node = node
        self._task_timeout = task_timeout
        self._status_warned: set[str] = set()

    def _res(self, guest: Guest):
        node = self._api.nodes(self._node)
        return node.qemu(guest.vmid) if guest.kind == "qemu" else node.lxc(guest.vmid)

    def _wait_task(self, upid: str) -> None:
        status = self._task_end(upid, self._task_timeout)
        if status != "OK":
            raise ProxmoxError(f"E_PVE_TASK: {upid} ended with {status}")

    def _task_end(self, upid: str, timeout: float) -> str:
        """A task's exit status once it stopped."""
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            st = self._api.nodes(self._node).tasks(upid).status.get()
            if st.get("status") == "stopped":
                return str(st.get("exitstatus"))
            time.sleep(0.5)
        raise ProxmoxError(f"E_PVE_TASK: {upid} did not finish in {timeout}s")

    def stop(self, guest: Guest) -> None:
        self._wait_task(self._res(guest).status.stop.post())

    def rollback(self, guest: Guest, snapshot: str) -> None:
        self._wait_task(self._res(guest).snapshot(snapshot).rollback.post())

    def start(self, guest: Guest) -> None:
        self._wait_task(self._res(guest).status.start.post())

    def status(self, guest: Guest) -> str:
        try:
            return str(self._res(guest).status.current.get().get("status", "unknown"))
        except Exception as e:  # proxmoxer raises ResourceException and requests errors
            # "unknown" in /lab/status must not hide the cause: log it once per guest.
            if guest.name not in self._status_warned:
                self._status_warned.add(guest.name)
                log.warning("E_PVE_STATUS: %s: %s: %s", guest.name, type(e).__name__, str(e)[:200])
            raise ProxmoxError(f"E_PVE_STATUS: {guest.name}: {e}") from e

    def exec(self, guest: Guest, command: list[str], timeout: float) -> ExecResult:
        agent = self._res(guest).agent
        pid = agent.exec.post(command=command).get("pid")
        deadline = time.monotonic() + timeout
        last: Exception | None = None
        while time.monotonic() < deadline:
            try:
                st = agent("exec-status").get(pid=pid)
            except Exception as e:  # proxmoxer raises ResourceException and requests errors
                # A busy guest agent answers exec-status with "got timeout" now
                # and then while the command runs on (sky-c1 at a game launch,
                # sky-c2 at a quiet-down, 2026-10-03): ask again until the deadline.
                last = e
                time.sleep(1.0)
                continue
            if st.get("exited"):
                return ExecResult(int(st.get("exitcode", -1)), str(st.get("out-data", "")), str(st.get("err-data", "")))
            time.sleep(0.5)
        why = f"; last exec-status error {type(last).__name__}: {str(last)[:200]}" if last else ""
        raise ProxmoxError(f"E_PVE_EXEC: pid {pid} on {guest.name} did not exit in {timeout}s{why}")

    def shutdown(self, guest: Guest, timeout_s: int) -> tuple[str, list[str]]:
        upid = self._res(guest).status.shutdown.post(timeout=timeout_s)
        status = self._task_end(upid, timeout_s + 60)
        lines = [str(e.get("t", "")) for e in self._api.nodes(self._node).tasks(upid).log.get(limit=500)]
        return status, lines

    def snapshots(self, guest: Guest) -> list[dict[str, Any]]:
        return list(self._res(guest).snapshot.get())

    def snapshot_create(self, guest: Guest, name: str, description: str) -> None:
        self._wait_task(self._res(guest).snapshot.post(snapname=name, description=description, vmstate=0))

    def snapshot_delete(self, guest: Guest, name: str) -> None:
        self._wait_task(self._res(guest).snapshot(name).delete())

    def agent_ping(self, guest: Guest) -> bool:
        try:
            self._res(guest).agent.ping.post()
            return True
        except Exception:  # not up yet: proxmoxer's ResourceException or a requests error
            return False

    def file_read(self, guest: Guest, path: str) -> str:
        r = self._res(guest).agent("file-read").get(file=path)
        if r.get("truncated"):
            raise ProxmoxError(f"E_PVE_FILE_TOO_BIG: {path} on {guest.name} was truncated at the 16 MiB guest-agent cap")
        return str(r.get("content", ""))
