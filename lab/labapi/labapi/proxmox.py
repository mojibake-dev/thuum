"""Proxmox VE through proxmoxer, behind an interface tests replace. The token
is pool-scoped (VM.Audit, VM.PowerMgmt, VM.Snapshot, VM.Snapshot.Rollback,
VM.GuestAgent.Unrestricted, VM.GuestAgent.FileRead) and the API is called by
IP at https://10.0.0.10:8006 (docs/LAB.md). GuestControl wraps any backend
with the one rule that matters: an unmanaged guest is never touched."""

from __future__ import annotations

import logging

import time
from dataclasses import dataclass
from typing import Any, Protocol

from .guests import Guest

FILE_READ_MAX = 16 * 1024 * 1024  # the guest-agent file-read cap


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


class GuestControl:
    """The only thing the runner calls. Refuses every action on an unmanaged
    guest except status, and refuses files past the 16 MiB cap."""

    def __init__(self, backend: ProxmoxGuests):
        self._b = backend

    def _managed(self, guest: Guest, what: str) -> None:
        if not guest.managed:
            raise ProxmoxError(f"E_PVE_UNMANAGED: refusing to {what} {guest.name}; lab-api only waits for its heartbeat")

    def stop(self, guest: Guest) -> None:
        self._managed(guest, "stop")
        self._b.stop(guest)

    def rollback(self, guest: Guest, snapshot: str) -> None:
        self._managed(guest, "roll back")
        if not snapshot:
            raise ProxmoxError(f"E_PVE_SNAPSHOT: {guest.name} has no snapshot name")
        self._b.rollback(guest, snapshot)

    def start(self, guest: Guest) -> None:
        self._managed(guest, "start")
        self._b.start(guest)

    def status(self, guest: Guest) -> str:
        try:
            return self._b.status(guest)
        except ProxmoxError:
            return "unknown"

    def exec(self, guest: Guest, command: list[str], timeout: float) -> ExecResult:
        self._managed(guest, "exec into")
        if guest.kind != "qemu":
            raise ProxmoxError(f"E_PVE_EXEC: {guest.name} is not a qemu guest; the guest agent is qemu only")
        return self._b.exec(guest, command, timeout)

    def file_read(self, guest: Guest, path: str) -> str:
        self._managed(guest, "read a file from")
        content = self._b.file_read(guest, path)
        if len(content.encode("utf-8", errors="replace")) > FILE_READ_MAX:
            raise ProxmoxError(f"E_PVE_FILE_TOO_BIG: {path} on {guest.name} exceeds the 16 MiB guest-agent cap")
        return content

    def rollback_sequence(self, guest: Guest, snapshot: str) -> None:
        """Disk-only rollback (docs/LAB.md): stop, rollback, start."""
        self.stop(guest)
        self.rollback(guest, snapshot)
        self.start(guest)


class ProxmoxerGuests:
    """The real backend. Imported lazily so tests run without proxmoxer."""

    def __init__(self, url: str, token_id: str, token_secret: str, node: str, verify_ssl: bool | str, task_timeout: float = 120.0):
        from urllib.parse import urlparse

        from proxmoxer import ProxmoxAPI

        u = urlparse(url)
        if "!" not in token_id:
            raise ProxmoxError("E_PVE_TOKEN: PVE_TOKEN_ID must look like user@realm!tokenname")
        user, token_name = token_id.split("!", 1)
        self._api = ProxmoxAPI(u.hostname, port=u.port or 8006, user=user, token_name=token_name, token_value=token_secret, verify_ssl=verify_ssl)
        self._node = node
        self._task_timeout = task_timeout
        self._status_warned: set[str] = set()

    def _res(self, guest: Guest):
        node = self._api.nodes(self._node)
        return node.qemu(guest.vmid) if guest.kind == "qemu" else node.lxc(guest.vmid)

    def _wait_task(self, upid: str) -> None:
        deadline = time.monotonic() + self._task_timeout
        while time.monotonic() < deadline:
            st = self._api.nodes(self._node).tasks(upid).status.get()
            if st.get("status") == "stopped":
                if st.get("exitstatus") != "OK":
                    raise ProxmoxError(f"E_PVE_TASK: {upid} ended with {st.get('exitstatus')}")
                return
            time.sleep(0.5)
        raise ProxmoxError(f"E_PVE_TASK: {upid} did not finish in {self._task_timeout}s")

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
        while time.monotonic() < deadline:
            st = agent("exec-status").get(pid=pid)
            if st.get("exited"):
                return ExecResult(int(st.get("exitcode", -1)), str(st.get("out-data", "")), str(st.get("err-data", "")))
            time.sleep(0.5)
        raise ProxmoxError(f"E_PVE_EXEC: pid {pid} on {guest.name} did not exit in {timeout}s")

    def file_read(self, guest: Guest, path: str) -> str:
        r = self._res(guest).agent("file-read").get(file=path)
        if r.get("truncated"):
            raise ProxmoxError(f"E_PVE_FILE_TOO_BIG: {path} on {guest.name} was truncated at the 16 MiB guest-agent cap")
        return str(r.get("content", ""))
