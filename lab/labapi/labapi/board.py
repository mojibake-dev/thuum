"""The step board: what lab-driver polls. One queue per scenario client; a
poll is the heartbeat; a step completes when its result is posted or times
out. dump-state results are kept as the client's latest view for assertions."""

from __future__ import annotations

import asyncio
import itertools
import time
from collections import deque
from dataclasses import dataclass, field
from typing import Any


@dataclass
class QueuedStep:
    id: str
    client: str
    action: str
    args: dict[str, Any]
    created: float
    started: float | None = None
    finished: float | None = None
    ok: bool | None = None
    result: dict[str, Any] = field(default_factory=dict)
    done: asyncio.Event = field(default_factory=asyncio.Event)


class StepBoard:
    def __init__(self, clock=time.monotonic):
        self._clock = clock
        self._pending: dict[str, deque[QueuedStep]] = {}
        self._inflight: dict[str, QueuedStep] = {}
        self._all: dict[str, QueuedStep] = {}
        self._last_poll: dict[str, float] = {}
        self._views: dict[str, dict[str, Any]] = {}
        self._seq = itertools.count(1)

    # lab-driver side ---------------------------------------------------------

    def poll(self, client: str) -> dict[str, Any]:
        """Heartbeat plus the next step for `client`, or {} when idle."""
        self._last_poll[client] = self._clock()
        queue = self._pending.get(client)
        if not queue:
            return {}
        step = queue.popleft()
        step.started = self._clock()
        self._inflight[step.id] = step
        return {"id": step.id, "action": step.action, "args": step.args}

    def complete(self, step_id: str, body: dict[str, Any]) -> bool:
        step = self._inflight.pop(step_id, None)
        if step is None:
            return False
        step.finished = self._clock()
        step.ok = bool(body.get("ok", False))
        step.result = body
        if step.action == "dump-state" and isinstance(body.get("data"), dict):
            self._views[step.client] = body["data"]
        step.done.set()
        return True

    # runner side --------------------------------------------------------------

    def enqueue(self, client: str, action: str, args: dict[str, Any] | None = None) -> QueuedStep:
        step = QueuedStep(id=f"s{next(self._seq)}", client=client, action=action, args=dict(args or {}), created=self._clock())
        self._pending.setdefault(client, deque()).append(step)
        self._all[step.id] = step
        return step

    async def wait(self, step: QueuedStep, timeout: float) -> bool:
        """True when the client completed the step in time; a timeout leaves it
        cancelled so a late result is ignored."""
        try:
            await asyncio.wait_for(step.done.wait(), timeout)
            return True
        except asyncio.TimeoutError:
            self._cancel(step)
            return False

    async def run_step(self, client: str, action: str, args: dict[str, Any] | None, timeout: float) -> QueuedStep:
        step = self.enqueue(client, action, args)
        await self.wait(step, timeout)
        return step

    def _cancel(self, step: QueuedStep) -> None:
        self._inflight.pop(step.id, None)
        queue = self._pending.get(step.client)
        if queue and step in queue:
            queue.remove(step)
        step.ok = False
        step.result = {"ok": False, "error": "timeout"}

    async def wait_heartbeat(self, client: str, since: float, timeout: float) -> bool:
        """True once `client` polled after `since`."""
        deadline = self._clock() + timeout
        while self._clock() < deadline:
            if self._last_poll.get(client, -1.0) > since:
                return True
            await asyncio.sleep(0.05)
        return self._last_poll.get(client, -1.0) > since

    def heartbeats(self) -> dict[str, float]:
        now = self._clock()
        return {c: round(now - t, 3) for c, t in self._last_poll.items()}

    def view(self, observer: str) -> dict[str, Any] | None:
        return self._views.get(observer)

    def clear_views(self) -> None:
        self._views.clear()

    def clear(self, client: str | None = None) -> None:
        if client is None:
            self._pending.clear()
            self._inflight.clear()
        else:
            self._pending.pop(client, None)
            for sid in [s for s, st in self._inflight.items() if st.client == client]:
                self._inflight.pop(sid, None)
