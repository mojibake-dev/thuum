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


# A seat's kept perks go again to the first poll after this long without one: a
# game started since (a relaunch, a rollback) keeps none of them
PERK_GAP_S = 20.0


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
        # a playtest seat's perks (POST /clients/<c>/perks), sent again as add-perks
        # {ids, keep} after a heartbeat gap; the driver adds them back after a load
        self._seat_perks: dict[str, list[int]] = {}
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
        # an inventory step's answers by the reference it named: {ref, items: form id (decimal) -> the count that
        # seat's game holds in it}, a chest's or a body's (c.inventory(ref), the root-cause plan's W4)
        self._inventories: dict[str, dict[int, dict[str, Any]]] = {}
        self._globals: dict[str, dict[str, Any]] = {}
        # a projectiles step's answer: {worldOrCell, refs: projectile base id
        # (decimal) -> the nearest reference's formId, pos, distance, or null}
        self._projectiles: dict[str, dict[str, Any]] = {}
        # a refs-near step's answer: {from, pos, radius, cell, types: base type
        # (decimal) -> {inCell, near, refs: [...]}, ids: base id (decimal) ->
        # the nearest reference's formId and distance, or null} (docs/LAB.md)
        self._refs_near: dict[str, dict[str, Any]] = {}
        # an npc-state step's answers by the form id it named (or answered): the
        # seat's own engine state of that NPC (c.npc_state(id), docs/verbs/npc-puppet.md)
        self._npc_states: dict[str, dict[int, dict[str, Any]]] = {}
        # a script-state step's answers by the form id it named (or answered): a reference's attached scripts as that
        # seat's own VM holds them, the stack that held it busy, or the error a failed read answered, which replaces the
        # earlier answer so a claim never reads past it (c.script_state(id), ADR-068 rung 3's read)
        self._script_states: dict[str, dict[int, dict[str, Any]]] = {}
        # a quest-stage step's answers by quest form id, merged across steps: {stage, running, done: stage (decimal)
        # -> done}, or None for a form that is no quest in that game (c.quest(id), docs/verbs/quest-stage.md)
        self._quests: dict[str, dict[int, dict[str, Any] | None]] = {}
        # an alias step's answers by the (quest, alias) pair it named: the reference the seat's game holds in that alias and
        # the alias's name, or the error a failed read answered, which replaces the pair's earlier answer as a script-state
        # error does (c.alias(quest, alias), ADR-068 rung 4's AliasFill)
        self._aliases: dict[str, dict[tuple[int, int], dict[str, Any]]] = {}
        # a factions step's answers by the actor it named: {formId, ranks, members, crime} or the error, which replaces the
        # actor's earlier answer (c.factions(id), ADR-068 rung 4's standing)
        self._factions: dict[str, dict[int, dict[str, Any]]] = {}
        # a script-vars step's answers by the form it named: {form, vars: [{form, script, var, k, i | f | b} or {..., error}]}
        # or the error a failed read answered, which replaces the form's earlier answer (c.script_vars(form), ADR-068 rung 5)
        self._script_vars: dict[str, dict[int, dict[str, Any]]] = {}
        # a quest-objectives step's answers by the quest it named: {quest, running, objectives: index (decimal) -> {displayed,
        # completed}} or the error, which replaces the quest's earlier answer (c.quest(id).objectiveDisplayed(i), rung 5)
        self._objectives: dict[str, dict[int, dict[str, Any]]] = {}
        # a figure-spells step's answer: {formId, name, base, added, equipped, extra} (ADR-046)
        self._figure_spells: dict[str, dict[str, Any]] = {}
        # a log-count step's answers: the regex -> how many lines of the seat's Skyrim Platform log matched
        self._log_counts: dict[str, dict[str, int]] = {}
        # a poisons step's answer: {poisons: [{baseId, poisonId, count, worn,
        # wornLeft}]}
        self._poisons: dict[str, dict[str, Any]] = {}
        # a skills step's answer: {skills: name -> {base, xp, legendary}, level}
        self._skills: dict[str, dict[str, Any]] = {}
        self._weather: dict[str, dict[str, Any]] = {}
        # node-scale answers: "self" (the player's) and "other" ({other: true},
        # every actor nearby under "all")
        self._node_scales: dict[str, dict[str, Any]] = {}
        self._node_rotations: dict[str, dict[tuple[int, str], dict[str, Any]]] = {}
        # av-read answers, "self" and "other", the same way
        self._av_reads: dict[str, dict[str, Any]] = {}
        # racemenu-save answers by the name saved: {bytes, sha256, saved}
        self._presets: dict[str, dict[str, Any]] = {}
        # a console step's answer: {typed, lines, keys}
        self._consoles: dict[str, dict[str, Any]] = {}
        # a head-parts step's answer on the client's own player: {parts, ...}
        self._head_parts: dict[str, dict[str, Any]] = {}
        self._seq = itertools.count(1)

    # lab-driver side ---------------------------------------------------------

    def poll(self, client: str) -> dict[str, Any]:
        """Heartbeat plus the next step for `client`, or {} when idle."""
        now = self._clock()
        last = self._last_poll.get(client)
        self._last_poll[client] = now
        perks = self._seat_perks.get(client)
        if perks and (last is None or now - last > PERK_GAP_S):
            self.enqueue(client, "add-perks", {"ids": list(perks), "keep": True})
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
        if step.action == "inventory" and isinstance(body.get("data"), dict) and "error" not in body["data"]:
            try:
                key = int((step.args or {}).get("ref") or body["data"].get("ref"))
            except (TypeError, ValueError):
                key = 0
            if key:
                self._inventories.setdefault(step.client, {})[key] = body["data"]
        if step.action == "globals" and isinstance(body.get("data"), dict):
            self._globals[step.client] = body["data"]
        if step.action == "projectiles" and isinstance(body.get("data"), dict):
            self._projectiles[step.client] = body["data"]
        if step.action == "refs-near" and isinstance(body.get("data"), dict):
            self._refs_near[step.client] = body["data"]
        if step.action == "npc-state" and isinstance(body.get("data"), dict) and "error" not in body["data"]:
            try:
                key = int((step.args or {}).get("formId") or body["data"].get("formId"))
            except (TypeError, ValueError):
                key = 0
            if key:
                self._npc_states.setdefault(step.client, {})[key] = body["data"]
        if step.action == "script-state":
            # every answer takes its reference's place, a busy one (no scripts) and an error one alike: the driver's
            # error data (the native's refusal, a dist without it) or a step that failed outright (ok false), so the
            # accessor raises on a failed read instead of reading the seat's last good answer (the fresh review of
            # b-script-state-restart, note 1: a relaunched seat's failed read would have read its earlier game's)
            data = body.get("data") if isinstance(body.get("data"), dict) else {"error": str(body.get("error") or "the step failed")}
            try:
                key = int((step.args or {}).get("formId") or data.get("formId"))
            except (TypeError, ValueError):
                key = 0
            if key:
                self._script_states.setdefault(step.client, {})[key] = data
        if step.action == "quest-stage" and isinstance(body.get("data"), dict):
            for k, v in body["data"].items():
                try:
                    key = int(k)
                except (TypeError, ValueError):
                    continue
                self._quests.setdefault(step.client, {})[key] = v if isinstance(v, dict) else None
        if step.action in ("alias", "factions", "script-vars", "quest-objectives"):
            # every answer takes its key's place, an error one and a step that failed outright alike, so the accessor
            # raises on a failed read instead of reading the seat's last good answer (script-state's rule)
            data = body.get("data") if isinstance(body.get("data"), dict) else {"error": str(body.get("error") or "the step failed")}
            args = step.args or {}
            try:
                if step.action == "alias":
                    pair = (int(args.get("quest") or data.get("quest")), int(args.get("alias", data.get("alias"))))
                    if pair[0]:
                        self._aliases.setdefault(step.client, {})[pair] = data
                elif step.action == "factions":
                    key = int(args.get("formId") or data.get("formId"))
                    if key:
                        self._factions.setdefault(step.client, {})[key] = data
                else:
                    field, table = ("form", self._script_vars) if step.action == "script-vars" else ("quest", self._objectives)
                    key = int(args.get(field) or data.get(field))
                    if key:
                        table.setdefault(step.client, {})[key] = data
            except (TypeError, ValueError):
                pass
        if step.action == "poisons" and isinstance(body.get("data"), dict):
            self._poisons[step.client] = body["data"]
        if step.action == "figure-spells" and isinstance(body.get("data"), dict) and "error" not in body["data"]:
            self._figure_spells[step.client] = body["data"]
        if step.action == "skills" and isinstance(body.get("data"), dict):
            self._skills[step.client] = body["data"]
        if step.action == "weather" and isinstance(body.get("data"), dict):
            # the sky as that seat's engine holds it after a weather step (a
            # read, a force or a release): current, outgoing, transition
            # (thuum docs/verbs/weather.md, c1.weather())
            self._weather[step.client] = body["data"]
        if step.action == "node-scale" and isinstance(body.get("data"), dict):
            kind = "other" if (step.args or {}).get("other") else "self"
            self._node_scales.setdefault(step.client, {})[kind] = body["data"]
        if step.action == "node-rotation" and isinstance(body.get("data"), dict) and "error" not in body["data"]:
            # a reference's named nodes as that seat's engine holds them (c.node_rotation(id, node[, label]); thuum
            # docs/verbs/traps.md "The pillar's side"), kept by the form id read and the step's {label}, so a probe
            # reads one pillar before and after a turn on both seats
            try:
                key = (int(body["data"].get("formId") or 0), str((step.args or {}).get("label") or ""))
            except (TypeError, ValueError):
                key = (0, "")
            if key[0]:
                self._node_rotations.setdefault(step.client, {})[key] = body["data"]
        if step.action == "av-read" and isinstance(body.get("data"), dict):
            # actor values read on the player ("self") or the nearest other
            # actor ("other", with every actor nearby): thuum docs/verbs/
            # figure-values.md, c1.av() and c2.av_of(c1)
            kind = "other" if (step.args or {}).get("other") else "self"
            self._av_reads.setdefault(step.client, {})[kind] = body["data"]
        if step.action == "console" and isinstance(body.get("data"), dict):
            self._consoles[step.client] = body["data"]
        if step.action == "head-parts" and not (step.args or {}).get("other") and isinstance(body.get("data"), dict):
            self._head_parts[step.client] = body["data"]
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

    def keep_perks(self, client: str, ids: list[int]) -> None:
        """A playtest seat's perks from now on; an empty list forgets them."""
        if ids:
            self._seat_perks[client] = list(ids)
        else:
            self._seat_perks.pop(client, None)

    def seat_perks(self) -> dict[str, list[int]]:
        return {c: list(v) for c, v in self._seat_perks.items()}

    def forget_perks(self) -> None:
        self._seat_perks.clear()

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

    def inventory(self, observer: str, ref_id: int) -> dict[str, Any] | None:
        return (self._inventories.get(observer) or {}).get(int(ref_id))

    def globals(self, observer: str) -> dict[str, Any] | None:
        return self._globals.get(observer)

    def projectiles(self, observer: str) -> dict[str, Any] | None:
        return self._projectiles.get(observer)

    def refs_near(self, observer: str) -> dict[str, Any] | None:
        return self._refs_near.get(observer)

    def npc_state(self, observer: str, form_id: int) -> dict[str, Any] | None:
        return (self._npc_states.get(observer) or {}).get(int(form_id))

    def script_state(self, observer: str, form_id: int) -> dict[str, Any] | None:
        return (self._script_states.get(observer) or {}).get(int(form_id))

    def quests(self, observer: str) -> dict[int, dict[str, Any] | None] | None:
        return self._quests.get(observer)

    def alias(self, observer: str, quest: int, alias: int) -> dict[str, Any] | None:
        return (self._aliases.get(observer) or {}).get((int(quest), int(alias)))

    def factions(self, observer: str, form_id: int) -> dict[str, Any] | None:
        return (self._factions.get(observer) or {}).get(int(form_id))

    def script_vars(self, observer: str, form_id: int) -> dict[str, Any] | None:
        return (self._script_vars.get(observer) or {}).get(int(form_id))

    def objectives(self, observer: str, quest: int) -> dict[str, Any] | None:
        return (self._objectives.get(observer) or {}).get(int(quest))

    def poisons(self, observer: str) -> dict[str, Any] | None:
        return self._poisons.get(observer)

    def figure_spells(self, observer: str) -> dict[str, Any] | None:
        return self._figure_spells.get(observer)

    def set_log_count(self, observer: str, pattern: str, count: int) -> None:
        self._log_counts.setdefault(observer, {})[pattern] = int(count)

    def log_count(self, observer: str, pattern: str) -> int | None:
        return (self._log_counts.get(observer) or {}).get(pattern)

    def skills(self, observer: str) -> dict[str, Any] | None:
        return self._skills.get(observer)

    def weather(self, observer: str) -> dict[str, Any] | None:
        return self._weather.get(observer)

    def node_scales(self, observer: str) -> dict[str, Any] | None:
        return self._node_scales.get(observer)

    def node_rotations(self, observer: str) -> dict[tuple[int, str], dict[str, Any]] | None:
        return self._node_rotations.get(observer)

    def av_reads(self, observer: str) -> dict[str, Any] | None:
        return self._av_reads.get(observer)

    def presets(self, observer: str) -> dict[str, Any] | None:
        return self._presets.get(observer)

    def consoles(self, observer: str) -> dict[str, Any] | None:
        return self._consoles.get(observer)

    def head_parts(self, observer: str) -> dict[str, Any] | None:
        return self._head_parts.get(observer)

    def clear_views(self) -> None:
        self._views.clear()
        self._watches.clear()
        self._markers.clear()
        self._known.clear()
        self._favorites.clear()
        self._held.clear()
        self._inventories.clear()
        self._globals.clear()
        self._projectiles.clear()
        self._refs_near.clear()
        self._npc_states.clear()
        self._script_states.clear()
        self._quests.clear()
        self._aliases.clear()
        self._factions.clear()
        self._script_vars.clear()
        self._objectives.clear()
        self._figure_spells.clear()
        self._log_counts.clear()
        self._poisons.clear()
        self._skills.clear()
        self._weather.clear()
        self._node_scales.clear()
        self._node_rotations.clear()
        self._av_reads.clear()
        self._presets.clear()
        self._consoles.clear()
        self._head_parts.clear()

    def clear(self, client: str | None = None) -> None:
        if client is None:
            self._pending.clear()
            self._inflight.clear()
        else:
            self._pending.pop(client, None)
            for sid in [s for s, st in self._inflight.items() if st.client == client]:
                self._inflight.pop(sid, None)
