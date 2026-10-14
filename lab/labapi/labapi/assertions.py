"""The assertion language: a restricted subset of Python expressions,
evaluated over the ast, never through eval. Only the names, attributes, and
calls listed here exist; everything else is a syntax rejection with a reason
the lab can grep (E_ASSERT_*).

  server.actor(<client>).x | .y | .z | .cell        from the state endpoint
  server.inventory(<client>).count("<file>:<id>")   from the state endpoint
  server.time().hour | .day | .month | .year | .daysPassed | .timeScale
                                                     the server's game clock, read when the assert runs
  <client>.state.gameHour | .gameDay | .gameMonth | .gameYear | .gameDaysPassed | .timeScale
                                                     that client's time globals, from its dump-state
  <client>.state.down                                its player knocked down: skymp5-client's death,
                                                     which never sets the engine's own isDead
  <client>.state.movementControls | .menuControls | .lookingControls | .activateControls
                                                     the engine's player controls, true when enabled
  <client>.state.rested                              the player has the Rested bonus (a sleep's)
  <client>.node_scale()                              the engine's scale of the node its last node-scale
                                                     step read on its own player
  <client>.morph() | .morph_of(<client>)             a body morph its node-scale {morph} step read, the
                                                     same way (its own player, or its figure of the other)
  <client>.node_scale_of(<client>)                   the same on its figure of the other client
                                                     (node-scale {other: true}): the enabled actor with
                                                     3D nearest where the server has that client
  <client>.preset("<name>").bytes | .sha256 | .look  the RaceMenu preset its racemenu-save {name} wrote
  server.actor(<client>).headParts                   the appearance's head parts, "0x..,0x.." sorted
  <client>.head_parts()                              the parts on its player's base from its last head-parts
                                                     step, the same form (thuum ADR-026: the two agree)
  <client>.printed("<text>")                         true when a line the console printed during its last
                                                     console step contains the text (the server's
                                                     ConsoleOutput as skymp5-client prints it)
  <client>.projectile(<form id>).distance           how far the reference of that projectile base (a
                                                     PROJ) nearest that client's player, or with the
                                                     step's {other: true} its figure of the other
                                                     player, lies in its own game, from its last
                                                     projectiles step (docs/verbs/marksman.md); none is
                                                     a data error
  <client>.poison(<form id>).count | .poisonId      the poison on that item's stack in that client's
                                                     inventory and its charges, from its last poisons
                                                     step (docs/verbs/magic-effects.md); 0 and 0 when
                                                     no stack of the item carries one
  <client>.sees(<client>)                            from that client's last dump-state
  <client>.view(<client>).x | .y | .z                from that client's last dump-state
  abs(), + - * /, comparisons, and, or, not, numbers, strings, true, false
"""

from __future__ import annotations

import ast
import json
import operator
from dataclasses import dataclass
from typing import Any, Protocol
from pathlib import Path

from . import parity as _parity


class AssertionSyntax(Exception):
    """E_ASSERT_SYNTAX: the expression uses something outside the language."""


class AssertionData(Exception):
    """E_ASSERT_DATA: the expression is legal but the data is missing."""


class ServerFacade(Protocol):
    """What the runner gives the evaluator: labState answers (CONTRACT.md) keyed
    by scenario client name, and the item name table."""

    def actor(self, client: str) -> dict[str, Any] | None: ...
    def inventory(self, client: str) -> list[dict[str, Any]] | None: ...
    def base_id(self, spec: str) -> int: ...
    def time(self) -> dict[str, Any] | None: ...


class ViewsFacade(Protocol):
    def view(self, observer: str) -> dict[str, Any] | None: ...
    def watch(self, observer: str) -> dict[str, Any] | None: ...
    def markers(self, observer: str) -> dict[str, Any] | None: ...
    def known(self, observer: str) -> dict[str, Any] | None: ...
    def favorites(self, observer: str) -> dict[str, Any] | None: ...
    def held(self, observer: str) -> dict[str, Any] | None: ...
    def projectiles(self, observer: str) -> dict[str, Any] | None: ...
    def poisons(self, observer: str) -> dict[str, Any] | None: ...
    def skills(self, observer: str) -> dict[str, Any] | None: ...
    def node_scales(self, observer: str) -> dict[str, Any] | None: ...
    def presets(self, observer: str) -> dict[str, Any] | None: ...
    def consoles(self, observer: str) -> dict[str, Any] | None: ...
    def head_parts(self, observer: str) -> dict[str, Any] | None: ...


def _opt_float(v: Any) -> float | None:
    return None if v is None else float(v)


def _opt_int(v: Any) -> int | None:
    return None if v is None else int(v)


def _opt_bool(v: Any) -> bool | None:
    return None if v is None else bool(v)


def _parts(v: Any) -> str | None:
    """Head part form ids as one comparable string: sorted, hex, comma-joined."""
    if v is None:
        return None
    if not isinstance(v, list) or not all(isinstance(x, int) and not isinstance(x, bool) for x in v):
        raise ValueError("head parts must be a list of form ids")
    return ",".join(f"{x:#x}" for x in sorted(v))


def _field(record: Any, name: str) -> Any:
    """One field of a nested record the gamemode may not send (None then)."""
    return record.get(name) if isinstance(record, dict) else None


def _opt_str(v: Any) -> str | None:
    return None if v is None else str(v)


@dataclass(frozen=True)
class ActorView:
    """server.actor(c): the labState actor record. Optional fields are None
    when the gamemode did not report them, and reading one is a data error."""

    x: float
    y: float
    z: float
    cell: str
    isDead: bool | None = None
    healthPercentage: float | None = None
    hasAppearance: bool | None = None
    raceId: int | None = None
    sex: int | None = None
    # the server's verdicts on the client's race menu results since it started
    # (the gamemode's onUpdateAppearanceAttempt record): how many, and the
    # last one's race and outcome
    appearanceAttempts: int | None = None
    lastAppearanceRaceId: int | None = None
    lastAppearanceAllowed: bool | None = None
    # the appearance's head parts as _parts writes them (thuum ADR-026)
    headParts: str | None = None
    # the server's shouts record, each list as _parts writes it, and how
    # long its voice recovery runs in seconds (docs/verbs/shouts.md)
    shouts: str | None = None
    wordsKnown: str | None = None
    wordsUnlocked: str | None = None
    shoutRecovery: float | None = None


@dataclass(frozen=True)
class Pos:
    """c.view(other): what a client's dump-state reported about another
    client's actor, matched to the server's position for that client."""

    x: float
    y: float
    z: float
    name: str | None = None
    isDead: bool | None = None
    healthPercentage: float | None = None
    equippedRight: int | None = None
    equippedLeft: int | None = None
    raceId: int | None = None
    sex: int | None = None


@dataclass(frozen=True)
class WatchView:
    """c.watched(other): what a client saw of another client's actor between
    its watch-start and watch-stop steps: where the actor was when the watch
    began (relative to its cell's origin), the farthest it ever got from
    there, and how many frames sampled it. drainMs is how long the actor's
    magicka fell in that game, from its first fall to its last (0 when it
    never fell), and drainEndMs when it last fell, in ms since watch-start
    (-1 when never): a figure holds a million magicka and a stream drains
    it, so the two time a figure's stream in the watcher's game
    (docs/verbs/spell-cast.md)."""

    x: float
    y: float
    z: float
    maxDisplacement: float
    samples: int
    drainMs: float = 0.0
    drainEndMs: float = -1.0
    # its stagger and recoil events in the watcher's game, (ms, name, 1 if
    # its graph took the event after every hook), and the graph bools the
    # watch sampled, (name, ((ms, value), ...)) (lab-driver bc5d76a; thuum
    # docs/verbs/stagger.md)
    events: tuple = ()
    bools: tuple = ()

    def took(self, name: str) -> int:
        """How many of the actor's events named `name` its graph took in the
        watcher's game (deathService blanks a figure's staggerStart it did not
        relay, and a blanked event is not taken)."""
        return sum(1 for e in self.events if str(e[1]).lower() == name.lower() and e[2])

    def sent(self, name: str) -> int:
        """How many events named `name` reached the actor's graph in the
        watcher's game, taken or not."""
        return sum(1 for e in self.events if str(e[1]).lower() == name.lower())

    def ever(self, name: str) -> bool:
        """Whether the graph bool `name` was true at any sample."""
        return _ever(self.bools, name)


def _ever(bools: tuple, name: str) -> bool:
    for n, series in bools:
        if str(n).lower() == name.lower():
            return any(bool(v) for _, v in series)
    raise AssertionData(f"the watch sampled no graph bool {name}")


@dataclass(frozen=True)
class SelfWatchView:
    """c.watched_self(): the player's own side of its last watch, the
    animation events its graph was sent (ms, name) and the graph bools
    watch-start named."""

    events: tuple = ()
    bools: tuple = ()

    def saw(self, name: str) -> int:
        """How many of the player's own animation events were named `name`."""
        return sum(1 for e in self.events if str(e[1]).lower() == name.lower())

    def ever(self, name: str) -> bool:
        """Whether the player's graph bool `name` was true at any sample."""
        return _ever(self.bools, name)


@dataclass(frozen=True)
class MarkerView:
    """c.marker(id): a map marker on that client's own map, from its last
    `markers` step (thuum docs/verbs/map-markers.md): shown (Papyrus
    IsMapMarkerVisible) and open to fast travel (CanFastTravelToMarker)."""

    visible: bool
    canTravel: bool


@dataclass(frozen=True)
class ProjectileView:
    """c.projectile(id): how far the reference of a projectile base nearest
    that client's player (or, with the step's {other: true}, its figure of
    the other player) lies in its own game, from its last `projectiles`
    step (Game.FindClosestReferenceOfType, the radius narrowed; Papyrus
    reads no position of a projectile; docs/verbs/marksman.md)."""

    distance: float


@dataclass(frozen=True)
class PoisonView:
    """c.poison(id): the poison on a stack of that item in that client's
    inventory, as its game keeps it (ExtraPoison: the poison and its
    charges), from its last `poisons` step; poisonId and count 0 when no
    stack of the item carries one (docs/verbs/magic-effects.md)."""

    poisonId: int
    count: int


@dataclass(frozen=True)
class PresetView:
    """c.preset(name): the RaceMenu preset that client's racemenu-save step
    wrote under that name: its size, its SHA-256, and `look`, the hash of
    its JSON with the head parts as a set and the version left out, so two
    saves of one look compare equal (docs/verbs/racemenu-sync.md)."""

    bytes: int
    sha256: str
    look: str


@dataclass(frozen=True)
class SkillView:
    """c.skill(name): a skill as that client's game holds it, from its last
    `skills` step, read through SKSE's ActorValueInfo, never through the
    actor-values verb's own natives (docs/verbs/actor-values.md)."""

    base: float
    xp: float
    legendary: int


@dataclass(frozen=True)
class TimeView:
    """server.time(): the server's game clock (labState kind time), read when
    the expression is evaluated (docs/verbs/time.md)."""

    year: int
    month: int
    day: int
    hour: float
    daysPassed: float
    timeScale: float


@dataclass(frozen=True)
class StateView:
    """c.state: the client's own dump-state, as lab-driver reports it."""

    x: float
    y: float
    z: float
    worldOrCell: int | None = None
    cellName: str | None = None
    isDead: bool | None = None
    healthPercentage: float | None = None
    magickaPercentage: float | None = None
    staminaPercentage: float | None = None
    equippedRight: int | None = None
    equippedLeft: int | None = None
    raceId: int | None = None
    sex: int | None = None
    # the engine's time globals as the client renders the server's clock
    gameYear: float | None = None
    gameMonth: float | None = None
    gameDay: float | None = None
    gameHour: float | None = None
    gameDaysPassed: float | None = None
    timeScale: float | None = None
    # lab-driver's "down": a Ragdoll the engine accepted on the player and no
    # GetUpBegin since (skymp5-client's local death, m0-death)
    down: bool | None = None
    # the engine's player controls (lab-driver's controls), true when enabled
    movementControls: bool | None = None
    menuControls: bool | None = None
    lookingControls: bool | None = None
    activateControls: bool | None = None
    # the player has the Rested bonus (lab-driver's rested, docs/verbs/sleep.md)
    rested: bool | None = None


@dataclass(frozen=True)
class InventoryView:
    entries: tuple[dict[str, Any], ...]  # labState inventory entries: {"baseId": int, "count": int}
    resolver: Any  # Callable[[str], int]: "File.esm:EditorID", int, or 0x-hex to a base id

    def count(self, spec: str) -> int:
        try:
            want = int(self.resolver(spec))
        except KeyError as e:
            raise AssertionData(str(e)) from e
        return sum(int(e.get("count", 0)) for e in self.entries if int(e.get("baseId", -1)) == want)


@dataclass(frozen=True)
class EffectsView:
    """server.effects(c): the effects the server runs on that client's actor
    (labState's `effects`, the server's mp.get(actor, "runningEffects"),
    thuum docs/verbs/magic-effects.md), each by its MGEF id: left(id) the
    seconds the one of that effect with the most time has left, and
    magnitude(id) its magnitude, both 0 when none runs."""

    entries: tuple[dict[str, Any], ...]  # {"effect", "source", "magnitude", "secondsLeft"}
    resolver: Any  # as InventoryView's

    def _longest(self, spec: str) -> dict[str, Any] | None:
        try:
            want = int(self.resolver(spec))
        except KeyError as e:
            raise AssertionData(str(e)) from e
        found = [e for e in self.entries if int(e.get("effect", -1)) == want]
        return max(found, key=lambda e: float(e.get("secondsLeft", 0))) if found else None

    def left(self, spec: str) -> float:
        e = self._longest(spec)
        return float(e.get("secondsLeft", 0)) if e else 0.0

    def magnitude(self, spec: str) -> float:
        e = self._longest(spec)
        return float(e.get("magnitude", 0)) if e else 0.0


def _bool_series(raw: Any) -> tuple:
    """A watch's {name: [[ms, value], ...]} as (name, ((ms, value), ...))."""
    if not isinstance(raw, dict):
        return ()
    return tuple((str(n), tuple((float(p[0]), bool(p[1])) for p in series)) for n, series in raw.items())


class _ServerRef:
    def __init__(self, facade: ServerFacade):
        self._f = facade

    def actor(self, client: str) -> ActorView:
        d = self._f.actor(client)
        if not d or not d.get("found", True):
            raise AssertionData(f"server has no actor for {client}")
        try:
            return ActorView(
                float(d["x"]), float(d["y"]), float(d["z"]), str(d["cell"]),
                isDead=_opt_bool(d.get("isDead")),
                healthPercentage=_opt_float(d.get("healthPercentage")),
                hasAppearance=_opt_bool(d.get("hasAppearance")),
                raceId=_opt_int(d.get("raceId")),
                sex=_opt_int(d.get("sex")),
                appearanceAttempts=_opt_int(d.get("appearanceAttempts")),
                lastAppearanceRaceId=_opt_int(d.get("lastAppearanceRaceId")),
                lastAppearanceAllowed=_opt_bool(d.get("lastAppearanceAllowed")),
                headParts=_parts(d.get("headParts")),
                shouts=_parts(_field(d.get("shouts"), "shouts")),
                wordsKnown=_parts(_field(d.get("shouts"), "wordsKnown")),
                wordsUnlocked=_parts(_field(d.get("shouts"), "wordsUnlocked")),
                shoutRecovery=_opt_float(_field(d.get("shouts"), "recoverySecondsLeft")),
            )
        except (KeyError, TypeError, ValueError) as e:
            raise AssertionData(f"actor record for {client} lacks {e}") from e

    def time(self) -> TimeView:
        fn = getattr(self._f, "time", None)
        d = fn() if fn else None
        if not d:
            raise AssertionData("server reports no game clock")
        try:
            return TimeView(int(d["year"]), int(d["month"]), int(d["day"]), float(d["hour"]),
                            float(d["daysPassed"]), float(d["timeScale"]))
        except (KeyError, TypeError, ValueError) as e:
            raise AssertionData(f"game clock lacks {e}") from e

    def inventory(self, client: str) -> InventoryView:
        entries = self._f.inventory(client)
        if entries is None:
            raise AssertionData(f"server has no inventory for {client}")
        return InventoryView(tuple(entries), self._f.base_id)

    def effects(self, client: str) -> EffectsView:
        d = self._f.actor(client)
        if not d or not d.get("found", True):
            raise AssertionData(f"server has no actor for {client}")
        entries = d.get("effects")
        if not isinstance(entries, list):
            raise AssertionData(f"server reports no running effects for {client} (a server without magic-effects)")
        return EffectsView(tuple(e for e in entries if isinstance(e, dict)), self._f.base_id)


def load_references(directory: str | Path, action: str) -> dict[str, tuple[dict | None, float]]:
    """The action's reference views from lab/references/<action>-a.json (the
    player acting on a placed NPC) and -b.json (the NPC acting on the player),
    each `{"at": <ms of the action in that trace>, "npc": <form id, optional>,
    "trace": <a watch-stop result>}`; a file not there leaves its views out
    (parity.reference_views), so a half-taken reference still compares."""
    directory = Path(directory)
    parts: dict[str, tuple] = {}
    for role in ("a", "b"):
        path = directory / f"{action}-{role}.json"
        if not path.is_file():
            parts[role] = (None, None, 0.0)
            continue
        try:
            d = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, ValueError) as e:
            raise AssertionData(f"reference {path.name} is unreadable: {e}") from e
        trace = d.get("trace") if isinstance(d.get("trace"), dict) else d
        actors = trace.get("actors") or []
        npc = None
        if d.get("npc") is not None:
            npc = next((x for x in actors if str(x.get("formId")) == str(d["npc"])), None)
        if npc is None and actors:
            npc = actors[0]
        parts[role] = (trace.get("self"), npc, float(d.get("at", 0.0)))
    a_self, a_npc, a_at = parts["a"]
    b_self, b_npc, b_at = parts["b"]
    return _parity.reference_views(a_self, a_npc, a_at, b_self, b_npc, b_at)


class _ParityRef:
    """`parity` in an expression (ADR-031): the run's four views, the actor's
    own record and the target's figure from the actor's watch, the target's
    own record and the actor's figure from the target's watch (figures matched
    to the server's positions as watched() does), each cut at its own mark,
    against the action's reference views; `parity.findings` is how many
    consequences are missing or extra outside the later list, `parity.ok`
    whether that is none, and `parity.report` every finding's detail, which
    also lands in the step's readings so a red is readable without the traces."""

    ROLE_OF = {"actor-own": "actor", "actor-figure": "actor", "target-own": "target", "target-figure": "target"}

    def __init__(self, spec: Any, views: ViewsFacade, server: ServerFacade, references_dir: str | Path, readings: dict[str, Any]):
        self._spec = spec
        self._views = views
        self._server = server
        self._dir = references_dir
        self._readings = readings
        self._result: list | None = None
        self._compared: list[str] = []

    def _mark(self, view: str, record: dict | None) -> float:
        """The cut for a record: the first mark of the spec's kind, less the lead."""
        cut = self._spec.cut
        kind = str(cut.kind)
        if not record:
            raise AssertionData(f"parity: {view} has no record to cut")
        rows: list = []
        if kind == "hit":
            rows = record.get("hits" if self.ROLE_OF[view] == "actor" else "taken") or []
        elif kind == "cast":
            rows = record.get("casts") or []
        elif kind.startswith("event:"):
            name = kind.split(":", 1)[1].lower()
            rows = [e for e in record.get("events") or [] if str(e[1]).lower() == name]
        else:
            raise AssertionSyntax(f"E_ASSERT_SYNTAX: parity cut kind {kind!r} is not hit, cast or event:<name>")
        if not rows:
            raise AssertionData(f"parity: {view} shows no {kind} to cut at")
        return max(0.0, float(rows[0][0]) - float(cut.lead_ms))

    def _watch(self, client: str) -> dict[str, Any]:
        fn = getattr(self._views, "watch", None)
        data = fn(client) if fn else None
        if not isinstance(data, dict):
            raise AssertionData(f"parity: {client} has not reported a watch-stop yet")
        return data

    def _views_of_run(self) -> dict[str, tuple[dict | None, float]]:
        spec = self._spec
        actor_watch, target_watch = self._watch(spec.actor), self._watch(spec.target)
        actor_ref, target_ref = _ClientRef(spec.actor, self._views, self._server), _ClientRef(spec.target, self._views, self._server)
        target_figure, _ = actor_ref._nearest(spec.target, actor_watch.get("actors") or [], lambda x: x["first"])
        actor_figure, _ = target_ref._nearest(spec.actor, target_watch.get("actors") or [], lambda x: x["first"])
        records = {
            "actor-own": actor_watch.get("self"),
            "target-figure": target_figure,
            "target-own": target_watch.get("self"),
            "actor-figure": actor_figure,
        }
        for view, rec in records.items():
            if rec is None:
                raise AssertionData(f"parity: no record for {view} ({'the figure was not where the server has its player' if view.endswith('figure') else 'the watch has no self'})")
        return {view: (rec, self._mark(view, rec)) for view, rec in records.items()}

    def _compute(self) -> list:
        if self._result is None:
            refs = load_references(self._dir, self._spec.action)
            if not refs:
                raise AssertionData(f"parity: no reference traces for {self._spec.action!r} under {self._dir}")
            # a reference's `at` is its action's mark; the same lead as the run's
            # cut, so the windup before the mark counts on both sides alike
            lead = float(self._spec.cut.lead_ms)
            refs = {view: (rec, max(0.0, float(at) - lead)) for view, (rec, at) in refs.items()}
            views = self._views_of_run()
            self._compared = [v for v in _parity.VIEWS if v in refs and v in views]
            self._result = _parity.diff(views, refs, self._spec.later, self._spec.tolerances or None)
            self._readings["parity"] = self.report
        return self._result

    @property
    def findings(self) -> int:
        return len(self._compute())

    @property
    def ok(self) -> bool:
        return len(self._compute()) == 0

    @property
    def report(self) -> str:
        found = self._compute()
        if not found:
            return f"parity: no findings ({len(self._compared)} views compared: {', '.join(self._compared)})"
        return "; ".join(f.detail() for f in found)


class _ClientRef:
    """A scenario client in an expression. `sees` and `view` come from the
    client's latest dump-state: either a `sees` map the driver built itself,
    or its `near` list matched against the server's position for the other
    client (within SEE_RADIUS engine units)."""

    SEE_RADIUS = 512.0

    def __init__(self, name: str, views: ViewsFacade, server: ServerFacade):
        self.name = name
        self._views = views
        self._server = server

    def _dump(self) -> dict[str, Any]:
        v = self._views.view(self.name)
        if v is None:
            raise AssertionData(f"{self.name} has not reported a dump-state yet")
        return v

    def _origin(self, kind: str, key: Any) -> tuple[float, float, float]:
        fn = getattr(self._server, f"origin_for_{kind}", None)
        origin = fn(key) if fn and key is not None else None
        return tuple(origin) if origin else (0.0, 0.0, 0.0)

    def _seen(self, other: str) -> tuple[dict[str, Any] | None, tuple[float, float, float]]:
        """The near entry that is the other client, and the origin its
        coordinates are relative to. Matching is done in absolute
        coordinates, so a driver dump and the server's record agree."""
        dump = self._dump()
        sees = dump.get("sees")
        if isinstance(sees, dict):
            return sees.get(other), (0.0, 0.0, 0.0)
        return self._nearest(other, dump.get("near") or [], lambda n: n["pos"])

    def _nearest(self, other: str, entries: list[Any], pos_of: Any) -> tuple[dict[str, Any] | None, tuple[float, float, float]]:
        """The entry whose position (pos_of) is nearest where the server has
        `other`, within SEE_RADIUS, and the origin the server's coordinates
        are relative to. Matching is in absolute coordinates."""
        target = self._server.actor(other)
        if not target or not target.get("found", True):
            raise AssertionData(f"server has no actor for {other}")
        absolute = target.get("absolute") or target
        origin = self._origin("desc", absolute.get("cell"))
        best: dict[str, Any] | None = None
        best_d = 0.0
        for e in entries:
            try:
                pos = pos_of(e)
                dx = float(pos[0]) - float(absolute["x"])
                dy = float(pos[1]) - float(absolute["y"])
                dz = float(pos[2]) - float(absolute["z"])
            except (KeyError, IndexError, TypeError, ValueError):
                continue
            d = (dx * dx + dy * dy + dz * dz) ** 0.5
            if d <= self.SEE_RADIUS and (best is None or d < best_d):
                best, best_d = e, d
        return best, origin

    def sees(self, other: str) -> bool:
        return self._seen(other)[0] is not None

    def watched(self, other: str) -> WatchView:
        """The watched actor that started where the server says `other` is
        (within SEE_RADIUS): a rejected move leaves the server's record where
        it was, so the match holds even when the watcher saw the actor leave.
        Failing that, the one that ended there: a move the server took
        carries its record away from where the watch began (thuum
        docs/verbs/push.md: a throw, 1100 units, x-push-south
        20261014-152858, the figure ending where its player landed)."""
        fn = getattr(self._views, "watch", None)
        data = fn(self.name) if fn else None
        if not isinstance(data, dict):
            raise AssertionData(f"{self.name} has not reported a watch-stop yet")
        actors = data.get("actors") or []
        best, origin = self._nearest(other, actors, lambda a: a["first"])
        if best is None:
            best, origin = self._nearest(other, actors, lambda a: a["last"])
        if best is None:
            raise AssertionData(f"{self.name} watched no actor where the server has {other}")
        try:
            first = best["first"]
            series = best.get("magicka") or []
            falls = [float(t) for (t, v), (_, prev) in zip(series[1:], series) if float(v) < float(prev)]
            return WatchView(
                float(first[0]) - origin[0], float(first[1]) - origin[1], float(first[2]) - origin[2],
                maxDisplacement=float(best["maxDisplacement"]),
                samples=int(best.get("samples", 0)),
                drainMs=falls[-1] - falls[0] if falls else 0.0,
                drainEndMs=falls[-1] if falls else -1.0,
                events=tuple((float(e[0]), str(e[1]), int(e[2])) for e in best.get("events") or []),
                bools=_bool_series(best.get("bools")),
            )
        except (KeyError, IndexError, TypeError, ValueError) as e:
            raise AssertionData(f"{self.name}'s watch of {other} lacks {e}") from e

    def watched_self(self) -> SelfWatchView:
        """The player's own side of the client's last watch."""
        fn = getattr(self._views, "watch", None)
        data = fn(self.name) if fn else None
        if not isinstance(data, dict) or not isinstance(data.get("self"), dict):
            raise AssertionData(f"{self.name} has not reported a watch-stop with its own side yet")
        own = data["self"]
        try:
            return SelfWatchView(
                events=tuple((float(e[0]), str(e[1])) for e in own.get("events") or []),
                bools=_bool_series(own.get("bools")),
            )
        except (IndexError, TypeError, ValueError) as e:
            raise AssertionData(f"{self.name}'s own watch lacks {e}") from e

    def marker(self, ref_id: int) -> MarkerView:
        fn = getattr(self._views, "markers", None)
        data = fn(self.name) if fn else None
        if not isinstance(data, dict):
            raise AssertionData(f"{self.name} has not reported a markers step yet")
        m = data.get(str(int(ref_id)))
        if not isinstance(m, dict):
            raise AssertionData(f"{self.name}'s markers step did not read {int(ref_id):#x}")
        return MarkerView(visible=bool(m.get("visible")), canTravel=bool(m.get("canTravel")))

    def known(self, ref_id: int) -> int:
        """c.known(id): the effects that client's engine knows of an
        ingredient, bit i for effect i, from its last `known` step
        (docs/verbs/learned-effects.md)."""
        fn = getattr(self._views, "known", None)
        data = fn(self.name) if fn else None
        if not isinstance(data, dict):
            raise AssertionData(f"{self.name} has not reported a known step yet")
        mask = data.get(str(int(ref_id)))
        if not isinstance(mask, int) or isinstance(mask, bool):
            raise AssertionData(f"{self.name}'s known step did not read {int(ref_id):#x}")
        return mask

    def favorite(self, ref_id: int) -> int:
        """c.favorite(id): the key that client's game binds a favorite to,
        0 to 7, -1 for a favorite without a key, -2 for no favorite, from its
        last `favorites` step, which reads through SKSE
        (docs/verbs/favorites.md)."""
        fn = getattr(self._views, "favorites", None)
        data = fn(self.name) if fn else None
        if not isinstance(data, dict):
            raise AssertionData(f"{self.name} has not reported a favorites step yet")
        key = data.get(str(int(ref_id)))
        if not isinstance(key, int) or isinstance(key, bool):
            raise AssertionData(f"{self.name}'s favorites step did not read {int(ref_id):#x}")
        return key

    def held(self, ref_id: int) -> int:
        """c.held(id): how many of a form that client's game holds, from its
        last `held` step (getItemCount)."""
        fn = getattr(self._views, "held", None)
        data = fn(self.name) if fn else None
        if not isinstance(data, dict):
            raise AssertionData(f"{self.name} has not reported a held step yet")
        n = data.get(str(int(ref_id)))
        if not isinstance(n, int) or isinstance(n, bool):
            raise AssertionData(f"{self.name}'s held step did not read {int(ref_id):#x}")
        return n

    def projectile(self, ref_id: int) -> ProjectileView:
        """c.projectile(id): the nearest reference of that projectile base in
        that client's game, from its last `projectiles` step."""
        fn = getattr(self._views, "projectiles", None)
        data = fn(self.name) if fn else None
        if not isinstance(data, dict) or not isinstance(data.get("refs"), dict):
            raise AssertionData(f"{self.name} has not reported a projectiles step yet")
        refs = data["refs"]
        key = str(int(ref_id))
        if key not in refs:
            raise AssertionData(f"{self.name}'s projectiles step did not look for {int(ref_id):#x}")
        ref = refs[key]
        if not isinstance(ref, dict):
            raise AssertionData(f"{self.name}'s game holds no {int(ref_id):#x} within the step's radius")
        if "error" in ref:
            raise AssertionData(f"{self.name}'s projectiles step could not read {int(ref_id):#x}: {ref['error']}")
        try:
            return ProjectileView(distance=float(ref["distance"]))
        except (KeyError, IndexError, TypeError, ValueError) as e:
            raise AssertionData(f"{self.name}'s projectile {int(ref_id):#x} lacks {e}") from e

    def poison(self, item_id: int) -> PoisonView:
        """c.poison(id): the poison on that item's stack in that client's
        inventory, from its last `poisons` step."""
        fn = getattr(self._views, "poisons", None)
        data = fn(self.name) if fn else None
        if not isinstance(data, dict) or not isinstance(data.get("poisons"), list):
            raise AssertionData(f"{self.name} has not reported a poisons step yet")
        for stack in data["poisons"]:
            if isinstance(stack, dict) and stack.get("baseId") == int(item_id):
                try:
                    return PoisonView(poisonId=int(stack["poisonId"]), count=int(stack["count"]))
                except (KeyError, TypeError, ValueError) as e:
                    raise AssertionData(f"{self.name}'s poisoned {int(item_id):#x} lacks {e}") from e
        return PoisonView(poisonId=0, count=0)

    def _skills_step(self) -> dict[str, Any]:
        fn = getattr(self._views, "skills", None)
        data = fn(self.name) if fn else None
        if not isinstance(data, dict):
            raise AssertionData(f"{self.name} has not reported a skills step yet")
        return data

    def skill(self, name: str) -> SkillView:
        s = (self._skills_step().get("skills") or {}).get(name)
        if not isinstance(s, dict):
            raise AssertionData(f"{self.name}'s skills step did not read {name!r}")
        return SkillView(base=float(s.get("base") or 0), xp=float(s.get("xp") or 0), legendary=int(s.get("legendary") or 0))

    def level(self) -> int:
        """c.level(): that client's character level, from its last `skills`
        step (Papyrus GetLevel)."""
        level = self._skills_step().get("level")
        if not isinstance(level, int) or isinstance(level, bool):
            raise AssertionData(f"{self.name}'s skills step did not read the level")
        return level

    def preset(self, name: str) -> PresetView:
        """c.preset(name): what that client's last racemenu-save {name} step
        wrote, its size and SHA-256."""
        fn = getattr(self._views, "presets", None)
        data = fn(self.name) if fn else None
        p = data.get(name) if isinstance(data, dict) else None
        if not isinstance(p, dict):
            raise AssertionData(f"{self.name} has not reported a racemenu-save {{name: {name}}} step")
        try:
            return PresetView(bytes=int(p["bytes"]), sha256=str(p["sha256"]), look=str(p["look"]))
        except (KeyError, TypeError, ValueError) as e:
            raise AssertionData(f"{self.name}'s racemenu-save {name} lacks {e}") from e

    def head_parts(self) -> str:
        """c.head_parts(): the head parts on that client's player's base, as
        its last `head-parts` step read them (ActorBase.GetNthHeadPart), in
        the form server.actor(c).headParts takes."""
        fn = getattr(self._views, "head_parts", None)
        data = fn(self.name) if fn else None
        if not isinstance(data, dict) or not isinstance(data.get("parts"), list):
            raise AssertionData(f"{self.name} has not reported a head-parts step on its own player yet")
        try:
            ids = [int(p["id"]) for p in data["parts"]]
        except (KeyError, TypeError, ValueError) as e:
            raise AssertionData(f"{self.name}'s head-parts step lacks {e}") from e
        return _parts(ids) or ""

    def printed(self, text: str) -> bool:
        """c.printed(text): whether a line the game's console printed during
        that client's last `console` step contains the text (Skyrim
        Platform's consoleMessage, which carries printConsole's lines and so
        the server's ConsoleOutput; docs/verbs/console-commands.md)."""
        fn = getattr(self._views, "consoles", None)
        data = fn(self.name) if fn else None
        if not isinstance(data, dict):
            raise AssertionData(f"{self.name} has not reported a console step yet")
        lines = data.get("lines")
        if not isinstance(lines, list):
            raise AssertionData(f"{self.name}'s console step reported no lines")
        return any(isinstance(line, str) and str(text) in line for line in lines)

    def node_scale(self) -> float:
        """c.node_scale(): the engine's scale of the node that client's last
        `node-scale` step read on its own player."""
        return self._node_scale(None)

    def node_scale_of(self, other: str) -> float:
        """c.node_scale_of(o): the same on that client's figure of client o,
        from its last `node-scale {other: true}`: of the actors it read, the
        enabled one with 3D nearest where the server has o (within
        SEE_RADIUS), so a stale second reference at the same place is never
        the one judged."""
        return self._node_scale(other)

    def morph(self) -> float:
        """c.morph(): the body morph that client's last `node-scale {morph}`
        step read on its own player."""
        return self._node_scale(None, "morph")

    def morph_of(self, other: str) -> float:
        """c.morph_of(o): the same on that client's figure of client o, the
        figure chosen as node_scale_of chooses it."""
        return self._node_scale(other, "morph")

    def _node_scale(self, other: str | None, field: str = "engine") -> float:
        fn = getattr(self._views, "node_scales", None)
        data = fn(self.name) if fn else None
        kind = "self" if other is None else "other"
        read = data.get(kind) if isinstance(data, dict) else None
        if not isinstance(read, dict):
            step = "node-scale" if other is None else "node-scale {other: true}"
            raise AssertionData(f"{self.name} has not reported a {step} step yet")
        if other is not None:
            live = [n for n in read.get("all") or [] if isinstance(n, dict) and n.get("enabled") and n.get("loaded")]
            read, _ = self._nearest(other, live, lambda n: n["pos"])
            if read is None:
                raise AssertionData(f"{self.name} read no enabled actor with 3D where the server has {other}")
        try:
            return float(read[field])
        except (KeyError, TypeError, ValueError) as e:
            raise AssertionData(f"{self.name}'s node-scale step lacks {e}") from e

    def view(self, other: str) -> Pos:
        seen, origin = self._seen(other)
        if not seen:
            raise AssertionData(f"{self.name} does not see {other}")
        try:
            pos = seen.get("pos") or [seen["x"], seen["y"], seen["z"]]
            return Pos(
                float(pos[0]) - origin[0], float(pos[1]) - origin[1], float(pos[2]) - origin[2],
                name=_opt_str(seen.get("name")),
                isDead=_opt_bool(seen.get("isDead")),
                healthPercentage=_opt_float(seen.get("healthPercentage")),
                equippedRight=_opt_int(seen.get("equippedRight")),
                equippedLeft=_opt_int(seen.get("equippedLeft")),
                raceId=_opt_int(seen.get("raceId")),
                sex=_opt_int(seen.get("sex")),
            )
        except (KeyError, IndexError, TypeError, ValueError) as e:
            raise AssertionData(f"{self.name}'s view of {other} lacks {e}") from e

    @property
    def state(self) -> StateView:
        dump = self._dump()
        try:
            pos = dump.get("pos") or [dump["x"], dump["y"], dump["z"]]
            origin = self._origin("form", _opt_int(dump.get("worldOrCell")))
            health = dump.get("health") or {}
            magicka = dump.get("magicka") or {}
            stamina = dump.get("stamina") or {}
            controls = dump.get("controls") if isinstance(dump.get("controls"), dict) else {}
            return StateView(
                float(pos[0]) - origin[0], float(pos[1]) - origin[1], float(pos[2]) - origin[2],
                worldOrCell=_opt_int(dump.get("worldOrCell")),
                cellName=_opt_str(dump.get("cellName")),
                isDead=_opt_bool(dump.get("isDead")),
                healthPercentage=_opt_float(health.get("percentage") if isinstance(health, dict) else dump.get("healthPercentage")),
                magickaPercentage=_opt_float(magicka.get("percentage") if isinstance(magicka, dict) else None),
                staminaPercentage=_opt_float(stamina.get("percentage") if isinstance(stamina, dict) else None),
                equippedRight=_opt_int(dump.get("equippedRight")),
                equippedLeft=_opt_int(dump.get("equippedLeft")),
                raceId=_opt_int(dump.get("raceId")),
                sex=_opt_int(dump.get("sex")),
                gameYear=_opt_float(dump.get("gameYear")),
                gameMonth=_opt_float(dump.get("gameMonth")),
                gameDay=_opt_float(dump.get("gameDay")),
                gameHour=_opt_float(dump.get("gameHour")),
                gameDaysPassed=_opt_float(dump.get("gameDaysPassed")),
                timeScale=_opt_float(dump.get("timeScale")),
                down=_opt_bool(dump.get("down")),
                movementControls=_opt_bool(controls.get("movement")),
                menuControls=_opt_bool(controls.get("menu")),
                lookingControls=_opt_bool(controls.get("looking")),
                activateControls=_opt_bool(controls.get("activate")),
                rested=_opt_bool(dump.get("rested")),
            )
        except (KeyError, IndexError, TypeError, ValueError) as e:
            raise AssertionData(f"{self.name}'s state lacks {e}") from e


_ATTRS = {
    _ParityRef: {"findings", "ok", "report"},
    ActorView: {"x", "y", "z", "cell", "isDead", "healthPercentage", "hasAppearance", "raceId", "sex",
                "appearanceAttempts", "lastAppearanceRaceId", "lastAppearanceAllowed", "headParts",
                "shouts", "wordsKnown", "wordsUnlocked", "shoutRecovery"},
    Pos: {"x", "y", "z", "name", "isDead", "healthPercentage", "equippedRight", "equippedLeft", "raceId", "sex"},
    WatchView: {"x", "y", "z", "maxDisplacement", "samples", "drainMs", "drainEndMs"},
    MarkerView: {"visible", "canTravel"},
    ProjectileView: {"distance"},
    PoisonView: {"poisonId", "count"},
    SkillView: {"base", "xp", "legendary"},
    PresetView: {"bytes", "sha256", "look"},
    TimeView: {"year", "month", "day", "hour", "daysPassed", "timeScale"},
    StateView: {"x", "y", "z", "worldOrCell", "cellName", "isDead", "healthPercentage", "magickaPercentage", "staminaPercentage", "equippedRight", "equippedLeft", "raceId", "sex",
                "gameYear", "gameMonth", "gameDay", "gameHour", "gameDaysPassed", "timeScale", "down",
                "movementControls", "menuControls", "lookingControls", "activateControls", "rested"},
    _ClientRef: {"state"},
}
# Methods that take a form id: c.marker(0x00016223)
_ID_METHODS = {
    _ClientRef: {"marker", "known", "favorite", "held", "projectile", "poison"},
}
# Methods that take no argument: server.time()
_NULLARY = {
    _ServerRef: {"time"},
    _ClientRef: {"level", "node_scale", "morph", "head_parts", "watched_self"},
}
_METHODS = {
    _ServerRef: {"actor", "inventory", "effects", "time"},
    _ClientRef: {"sees", "view", "watched", "watched_self", "marker", "known", "favorite", "held", "projectile", "poison", "skill", "level", "node_scale", "node_scale_of", "morph", "morph_of", "preset", "printed", "head_parts"},
    InventoryView: {"count"},
    EffectsView: {"left", "magnitude"},
    WatchView: {"took", "sent", "ever"},
    SelfWatchView: {"saw", "ever"},
}
_CMP = {
    ast.Eq: operator.eq, ast.NotEq: operator.ne, ast.Lt: operator.lt,
    ast.LtE: operator.le, ast.Gt: operator.gt, ast.GtE: operator.ge,
}
_BIN = {ast.Add: operator.add, ast.Sub: operator.sub, ast.Mult: operator.mul, ast.Div: operator.truediv}


class Evaluator:
    def __init__(self, server: ServerFacade, views: ViewsFacade, clients: list[str], parity: Any = None, references_dir: str | Path | None = None):
        self._names: dict[str, Any] = {"server": _ServerRef(server), "true": True, "false": False, "True": True, "False": False}
        self._server_facade = server
        for c in clients:
            self._names[c] = _ClientRef(c, views, server)
        # Every scalar an expression read, by its source text: the numbers
        # behind a verdict, which a reviewer reads in the step's note.
        self.readings: dict[str, Any] = {}
        # `parity` (ADR-031), only in a scenario with a parity block
        if parity is not None:
            self._names["parity"] = _ParityRef(parity, views, server, references_dir or "lab/references", self.readings)

    def _read(self, node: ast.AST, value: Any) -> Any:
        if isinstance(value, float):
            self.readings[ast.unparse(node)] = round(value, 4)
        elif isinstance(value, (bool, int, str)):
            self.readings[ast.unparse(node)] = value
        return value

    def evaluate(self, expr: str) -> bool:
        try:
            tree = ast.parse(expr.strip(), mode="eval")
        except SyntaxError as e:
            raise AssertionSyntax(f"E_ASSERT_SYNTAX: {e.msg} in {expr!r}") from e
        value = self._eval(tree.body)
        if not isinstance(value, bool):
            raise AssertionSyntax(f"E_ASSERT_SYNTAX: expression is not a boolean: {expr!r}")
        return value

    def _eval(self, node: ast.AST) -> Any:
        if isinstance(node, ast.Constant):
            if isinstance(node.value, (bool, int, float, str)):
                return node.value
            raise AssertionSyntax(f"E_ASSERT_SYNTAX: constant {node.value!r} is not allowed")
        if isinstance(node, ast.Name):
            if node.id in self._names:
                return self._names[node.id]
            raise AssertionSyntax(f"E_ASSERT_SYNTAX: unknown name {node.id!r}")
        if isinstance(node, ast.UnaryOp):
            v = self._eval(node.operand)
            if isinstance(node.op, ast.USub) and isinstance(v, (int, float)) and not isinstance(v, bool):
                return -v
            if isinstance(node.op, ast.Not) and isinstance(v, bool):
                return not v
            raise AssertionSyntax("E_ASSERT_SYNTAX: unary operator not allowed here")
        if isinstance(node, ast.BinOp) and type(node.op) in _BIN:
            a, b = self._eval(node.left), self._eval(node.right)
            if not all(isinstance(x, (int, float)) and not isinstance(x, bool) for x in (a, b)):
                raise AssertionSyntax("E_ASSERT_SYNTAX: arithmetic on non-numbers")
            if isinstance(node.op, ast.Div) and b == 0:
                raise AssertionData("division by zero")
            return _BIN[type(node.op)](a, b)
        if isinstance(node, ast.BoolOp):
            vals = [self._eval(v) for v in node.values]
            if not all(isinstance(v, bool) for v in vals):
                raise AssertionSyntax("E_ASSERT_SYNTAX: and/or on non-booleans")
            return all(vals) if isinstance(node.op, ast.And) else any(vals)
        if isinstance(node, ast.Compare):
            left = self._eval(node.left)
            result = True
            for op, comp in zip(node.ops, node.comparators):
                if type(op) not in _CMP:
                    raise AssertionSyntax("E_ASSERT_SYNTAX: comparison operator not allowed")
                right = self._eval(comp)
                result = result and bool(_CMP[type(op)](left, right))
                left = right
            return result
        if isinstance(node, ast.Attribute):
            obj = self._eval(node.value)
            allowed = _ATTRS.get(type(obj))
            if allowed is None or node.attr not in allowed:
                raise AssertionSyntax(f"E_ASSERT_SYNTAX: attribute {node.attr!r} not allowed on {type(obj).__name__}")
            value = getattr(obj, node.attr)
            if value is None:
                raise AssertionData(f"{type(obj).__name__}.{node.attr} was not reported")
            return self._read(node, value)
        if isinstance(node, ast.Call):
            if node.keywords:
                raise AssertionSyntax("E_ASSERT_SYNTAX: keyword arguments not allowed")
            if isinstance(node.func, ast.Name):
                if node.func.id == "abs" and len(node.args) == 1:
                    v = self._eval(node.args[0])
                    if isinstance(v, (int, float)) and not isinstance(v, bool):
                        return abs(v)
                    raise AssertionSyntax("E_ASSERT_SYNTAX: abs() of a non-number")
                if node.func.id == "form" and len(node.args) == 1:
                    spec = self._eval(node.args[0])
                    if isinstance(spec, str):
                        return int(self._server_facade.base_id(spec))
                    raise AssertionSyntax("E_ASSERT_SYNTAX: form() takes a string")
                raise AssertionSyntax(f"E_ASSERT_SYNTAX: call to {node.func.id!r} not allowed")
            if isinstance(node.func, ast.Attribute):
                obj = self._eval(node.func.value)
                methods = _METHODS.get(type(obj))
                if methods is None or node.func.attr not in methods:
                    raise AssertionSyntax(f"E_ASSERT_SYNTAX: method {node.func.attr!r} not allowed on {type(obj).__name__}")
                if node.func.attr in _NULLARY.get(type(obj), set()):
                    if node.args:
                        raise AssertionSyntax(f"E_ASSERT_SYNTAX: {node.func.attr} takes no argument")
                    return getattr(obj, node.func.attr)()
                args = []
                for a in node.args:
                    if isinstance(a, ast.Name) and isinstance(self._names.get(a.id), _ClientRef):
                        args.append(a.id)  # a client name is passed as its name
                    else:
                        args.append(self._eval(a))
                # methods that take a form id: c.marker(0x00016223)
                takes_id = node.func.attr in _ID_METHODS.get(type(obj), set())
                if takes_id:
                    if len(args) != 1 or isinstance(args[0], bool) or not isinstance(args[0], int):
                        raise AssertionSyntax(f"E_ASSERT_SYNTAX: {node.func.attr} takes one form id")
                elif len(args) != 1 or not isinstance(args[0], str):
                    raise AssertionSyntax(f"E_ASSERT_SYNTAX: {node.func.attr} takes one client name or string")
                return self._read(node, getattr(obj, node.func.attr)(args[0]))
            raise AssertionSyntax("E_ASSERT_SYNTAX: call form not allowed")
        raise AssertionSyntax(f"E_ASSERT_SYNTAX: {type(node).__name__} not allowed")


def clients_needing_views(expr: str, clients: list[str]) -> set[str]:
    """Which clients' dump-state an expression reads, so the runner refreshes them."""
    try:
        tree = ast.parse(expr.strip(), mode="eval")
    except SyntaxError:
        return set()
    needed: set[str] = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute) and node.func.attr in ("sees", "view"):
            base = node.func.value
            if isinstance(base, ast.Name) and base.id in clients:
                needed.add(base.id)
        elif isinstance(node, ast.Attribute) and node.attr == "state":
            base = node.value
            if isinstance(base, ast.Name) and base.id in clients:
                needed.add(base.id)
    return needed
