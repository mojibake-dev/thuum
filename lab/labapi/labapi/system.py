"""What lab-api does on sky-srv itself: docker compose, tc netem, tcpdump,
the world/ directory, a readiness probe, free memory. Behind an interface
so the runner is testable without any of it."""

from __future__ import annotations

import shutil
import socket
import subprocess
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Protocol


@dataclass(frozen=True)
class Completed:
    returncode: int
    stdout: str
    stderr: str


class Capture(Protocol):
    def stop(self) -> None: ...


class System(Protocol):
    def run(self, cmd: list[str], timeout: float = 120.0) -> Completed: ...
    def start_capture(self, cmd: list[str]) -> Capture: ...
    def tcp_ready(self, host: str, port: int, timeout: float) -> bool: ...
    def copytree(self, src: Path, dst: Path) -> None: ...
    def rmtree(self, path: Path) -> None: ...
    def meminfo(self) -> dict[str, int]: ...


class _Proc:
    def __init__(self, p: subprocess.Popen):
        self._p = p

    def stop(self) -> None:
        if self._p.poll() is None:
            self._p.terminate()
            try:
                self._p.wait(10)
            except subprocess.TimeoutExpired:
                self._p.kill()


class RealSystem:
    def run(self, cmd: list[str], timeout: float = 120.0) -> Completed:
        p = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout, check=False)
        return Completed(p.returncode, p.stdout, p.stderr)

    def start_capture(self, cmd: list[str]) -> Capture:
        return _Proc(subprocess.Popen(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL))

    def tcp_ready(self, host: str, port: int, timeout: float) -> bool:
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            try:
                with socket.create_connection((host, port), timeout=2):
                    return True
            except OSError:
                time.sleep(1)
        return False

    def copytree(self, src: Path, dst: Path) -> None:
        shutil.copytree(src, dst, dirs_exist_ok=True)

    def rmtree(self, path: Path) -> None:
        shutil.rmtree(path, ignore_errors=True)

    def meminfo(self) -> dict[str, int]:
        out: dict[str, int] = {}
        try:
            for line in Path("/proc/meminfo").read_text().splitlines():
                k, _, v = line.partition(":")
                if k in ("MemTotal", "MemFree", "MemAvailable"):
                    out[k] = int(v.strip().split()[0]) * 1024
        except OSError:
            pass
        return out
