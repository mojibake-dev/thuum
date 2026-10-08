"""The step board: what lab-driver polls. One queue per scenario client; a
poll is the heartbeat; a step completes when its result is posted or times
out. dump-state results are kept as the client's latest view for assertions,
and watch-stop results as its latest watch (what it saw of other actors
between watch-start and watch-stop)."""

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
        self._watches: dict[str, dict[str, Any]] = {}
        # a markers step's answer: marker id (decimal) -> visible, canTravel
        self._markers: dict[str, dict[str, Any]] = {}
        # a known step's answer: ingredient id (decimal) -> known effects mask
        self._known: dict[str, dict[str, Any]] = {}
        # a favorites step's answer: form id (decimal) -> hotkey, -1 none, -2 no favorite
        self._favorites: dict[str, dict[str, Any]] = {}
        # a held step's answer: form id (decimal) -> the game's count
        self._held: dict[str, dict[str, Any]] = {}
        # a skills step's answer: {skills: name -> {base, xp, legendary}, level}
        self._skills: dict[str, dict[str, Any]] = {}
        # node-scale answers: "self" (the player's) and "other" ({other: true},
        # every actor nearby under "all")
        self._node_scales: dict[str, dict[str, Any]] = {}
        # racemenu-save answers by the name saved: {bytes, sha256, saved}
        self._presets: dict[str, dict[str, Any]] = {}
        # a console step's answer: {typed, lines, keys}
        self._consoles: dict[str, dict[str, Any]] = {}
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
        if step.action == "watch-stop" and isinstance(body.get("data"), dict):
            self._watches[step.client] = body["data"]
        if step.action == "markers" and isinstance(body.get("data"), dict):
            self._markers[step.client] = body["data"]
        if step.action == "known" and isinstance(body.get("data"), dict):
            self._known[step.client] = body["data"]
        if step.action == "favorites" and isinstance(body.get("data"), dict):
            self._favorites[step.client] = body["data"]
        if step.action == "held" and isinstance(body.get("data"), dict):
            self._held[step.client] = body["data"]
        if step.action == "skills" and isinstance(body.get("data"), dict):
            self._skills[step.client] = body["data"]
        if step.action == "node-scale" and isinstance(body.get("data"), dict):
            kind = "other" if (step.args or {}).get("other") else "self"
            self._node_scales.setdefault(step.client, {})[kind] = body["data"]
        if step.action == "console" and isinstance(body.get("data"), dict):
            self._consoles[step.client] = body["data"]
        if step.action == "racemenu-save" and isinstance(body.get("data"), dict):
            self._presets.setdefault(step.client, {})[str((step.args or {}).get("name", ""))] = body["data"]
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

    def watch(self, observer: str) -> dict[str, Any] | None:
        return self._watches.get(observer)

    def markers(self, observer: str) -> dict[str, Any] | None:
        return self._markers.get(observer)

    def known(self, observer: str) -> dict[str, Any] | None:
        return self._known.get(observer)

    def favorites(self, observer: str) -> dict[str, Any] | None:
        return self._favorites.get(observer)

    def held(self, observer: str) -> dict[str, Any] | None:
        return self._held.get(observer)

    def skills(self, observer: str) -> dict[str, Any] | None:
        return self._skills.get(observer)

    def node_scales(self, observer: str) -> dict[str, Any] | None:
        return self._node_scales.get(observer)

    def presets(self, observer: str) -> dict[str, Any] | None:
        return self._presets.get(observer)

    def consoles(self, observer: str) -> dict[str, Any] | None:
        return self._consoles.get(observer)

    def clear_views(self) -> None:
        self._views.clear()
        self._watches.clear()
        self._markers.clear()
        self._known.clear()
        self._favorites.clear()
        self._held.clear()
        self._skills.clear()
        self._node_scales.clear()
        self._presets.clear()
        self._consoles.clear()

    def clear(self, client: str | None = None) -> None:
        if client is None:
            self._pending.clear()
            self._inflight.clear()
        else:
            self._pending.pop(client, None)
            for sid in [s for s, st in self._inflight.items() if st.client == client]:
                self._inflight.pop(sid, None)
