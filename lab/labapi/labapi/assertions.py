"""The assertion language: a restricted subset of Python expressions,
evaluated over the ast, never through eval. Only the names, attributes, and
calls listed here exist; everything else is a syntax rejection with a reason
the lab can grep (E_ASSERT_*).

  server.actor(<client>).x | .y | .z | .cell        from the state endpoint
  server.inventory(<client>).count("<file>:<id>")   from the state endpoint
  server.time().hour | .day | .month | .year | .daysPassed | .timeScale
                                                     the server's game clock, read when the assert runs
  <client>.npc_state(<id>).aiEnabled | .inCombat | .package | .combatTarget | .staggering | .x | .y | .z
    | .isDead | .healthPercentage | .isEssential | .isProtected | .activationBlocked | .cell
                                                     that seat's engine state of an NPC, from its last npc-state {formId}
  <client>.refs_near().runtime_of(<base id>)         references of that base with a runtime id (a copy), from refs-near
  <client>.watched_id(<id>).turns | .headingAtStop   the watched actor's net rotation in turns and its last heading
  server.host(<cell>).hosted | .client | .epoch      the server's host table row for a cell id
                                                     (docs/verbs/cell-host.md): .client is the run's client
                                                     whose player holds it, "" when none
  server.ref(<id>).x | .y | .z | .cell | .healthPercentage | .isDead
                                                     an actor's record by form id (a hosted NPC)
  snapshot("<name>").<field>                         a server fact a `server: snapshot {name, of}` step
                                                     kept earlier in the run (the freeze's evidence)
  <client>.state.gameHour | .gameDay | .gameMonth | .gameYear | .gameDaysPassed | .timeScale
                                                     that client's time globals, from its dump-state
  <client>.state.down                                its player knocked down: skymp5-client's death,
                                                     which never sets the engine's own isDead
  <client>.state.movementControls | .menuControls | .lookingControls | .activateControls
                                                     the engine's player controls, true when enabled
  <client>.state.rested                              the player has the Rested bonus (a sleep's)
  <client>.state.menuOpen("<menu>")                that client's game has that menu open (dump-state's menus),
                                                     "Dialogue Menu" when a talk opened
  <client>.state.crosshairRef                        the form id under that client's crosshair, what E acts on (0 for none)
  <client>.log_count("<regex>")                      lines of that client's Skyrim Platform log matching the regex,
                                                     at its last log-count {pattern} step of that same pattern
  server.follow(<id>).following | .client | .cell | .actorId
                                                     whether a game follows that actor out of its hosted cells, which
                                                     of the run's clients, into which cell (npc-handoff's D6)
  <client>.figure_spells().count | .extra | .base    that client's figure of the other player at its last figure-spells
                                                     step: its added spells, those it holds in no hand or power slot,
                                                     and its base's form id (ADR-046)
  <client>.node_scale()                              the engine's scale of the node its last node-scale
                                                     step read on its own player
  <client>.morph() | .morph_of(<client>)             a body morph its node-scale {morph} step read, the
                                                     same way (its own player, or its figure of the other)
  <client>.node_scale_of(<client>)                   the same on its figure of the other client
                                                     (node-scale {other: true}): the enabled actor with
                                                     3D nearest where the server has that client
  <client>.av().health | .healthCurrent | .healthMax  the actor values its last av-read {names} step read
    | .healthPercentage (magicka, stamina likewise)    on its own player (base, current, maximum, share)
  <client>.av_of(<client>).health ...                 the same on its figure of the other client (av-read
                                                     {other: true}), the figure chosen as node_scale_of's
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
  <client>.refs_near().count(<form type>)           how many references of that base type (FormTypes.h:
                                                     24 ACTI, 50 PROJ, 51 HAZD; SKSE's Cell.GetNumRefs
                                                     filters by the base form's type) its last refs-near
                                                     {radius, from, formTypes, ids} step listed within
                                                     the radius of its player, or with from: other of
                                                     its figure of the other player; 50 PROJ counts the
                                                     whole cell, since Papyrus reads nothing of a
                                                     projectile reference; a reference class such as 65
                                                     PGRE is a data error, not a 0
  <client>.refs_near().has(<form id>)               whether a reference of that base stood within the
                                                     radius: listed under its type, or found by the
                                                     step's ids search; false when neither
  <client>.refs_near().distance(<form id>)          how far the nearest one lies (the listing's exact
                                                     figure before the search's bisected one); none is
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
import math
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
    def spell(self, form_id: int) -> dict[str, Any] | None: ...
    def cell_host(self, cell: int) -> dict[str, Any] | None: ...
    def ref(self, actor_id: int) -> dict[str, Any] | None: ...
    def follow(self, actor_id: int) -> dict[str, Any] | None: ...


class ViewsFacade(Protocol):
    def view(self, observer: str) -> dict[str, Any] | None: ...
    def watch(self, observer: str) -> dict[str, Any] | None: ...
    def markers(self, observer: str) -> dict[str, Any] | None: ...
    def known(self, observer: str) -> dict[str, Any] | None: ...
    def favorites(self, observer: str) -> dict[str, Any] | None: ...
    def held(self, observer: str) -> dict[str, Any] | None: ...
    def globals(self, observer: str) -> dict[str, Any] | None: ...
    def projectiles(self, observer: str) -> dict[str, Any] | None: ...
    def refs_near(self, observer: str) -> dict[str, Any] | None: ...
    def npc_state(self, observer: str, form_id: int) -> dict[str, Any] | None: ...
    def poisons(self, observer: str) -> dict[str, Any] | None: ...
    def figure_spells(self, observer: str) -> dict[str, Any] | None: ...
    def log_count(self, observer: str, pattern: str) -> int | None: ...
    def skills(self, observer: str) -> dict[str, Any] | None: ...
    def node_scales(self, observer: str) -> dict[str, Any] | None: ...
    def av_reads(self, observer: str) -> dict[str, Any] | None: ...
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
    # the other two bars as the server holds them (b-snapback reads stamina's hold)
    magickaPercentage: float | None = None
    staminaPercentage: float | None = None
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
    (docs/verbs/spell-cast.md). maxStep is the largest move between two of
    its samples and maxStepMs when it came (-1 when it never moved): a
    figure thrown in the watcher's game flies, its largest step coming
    with the throw, where one that only follows its player's position
    moves once its player is up (docs/verbs/push.md)."""

    x: float
    y: float
    z: float
    maxDisplacement: float
    samples: int
    drainMs: float = 0.0
    drainEndMs: float = -1.0
    maxStep: float = 0.0
    maxStepMs: float = -1.0
    # its position every 250 ms, ((ms, x, y, z), ...) (lab-driver's track;
    # empty from a driver before it)
    track: tuple = ()
    # the net rotation of its heading over the watch in whole turns (lab-driver's
    # `turned`, every frame's change wrapped into a half turn, over 360) and the
    # heading at the stop, degrees; None from a driver before them (an assert
    # reading one is then a data error, never a pass)
    turns: float | None = None
    headingAtStop: float | None = None
    # its stagger and recoil events in the watcher's game, (ms, name, 1 if
    # its graph took the event after every hook), and the graph bools the
    # watch sampled, (name, ((ms, value), ...)) (lab-driver bc5d76a; thuum
    # docs/verbs/stagger.md)
    events: tuple = ()
    bools: tuple = ()
    # the projectiles the watcher's game launched for the actor and their
    # flights as they start (thuum branch lab-launches' recorder, the fork's
    # projectileLaunched and projectileFlight events): launches rows
    # (ms, projectile, ammo, spell, x, y, z, angleX, angleZ, power), flights
    # rows (ms, ammo, x, y, z, angleX, angleZ, power), angles in radians as
    # the engine keeps them; empty from a driver before it or on parity
    launches: tuple = ()
    flights: tuple = ()
    # its health (every change in the watcher's game), magicka and stamina (every 50 ms
    # of change), ((name, ((ms, value), ...)), ...), each series starting at watch-start
    avs: tuple = ()

    def launched(self, spec) -> int:
        """How many of the actor's launches in the watcher's game name the
        form `spec` as their spell, projectile or ammo (0x3f9eb or "0x3f9eb"):
        c2.watched(c1).launched("0x3f9eb") >= 5, five breaths drawn on c2."""
        return _launched(self.launches, spec)

    def flights_match(self, own: "SelfWatchView", what: str) -> float:
        """How far the figure's arrows flew from the shooter's own: each of the
        shooter's flights (own, its c.watched_self()) is paired with the
        figure's flight of the same ammo nearest in time, within
        FLIGHT_PAIR_MS, and the largest gap of all pairs is returned:
        "position", the distance between the two starts in units; "angle",
        the larger of the pitch and heading differences in degrees, the
        heading taken around the circle. A shooter's flight with no pair, or
        a shooter with no flight, fails the assertion
        (docs/verbs/marksman.md, the arrow's path on both screens)."""
        return _flights_match(own.flights, self.flights, what)

    def movedBy(self, ms: float) -> float:
        """The farthest the actor got from where the watch began by `ms` after
        watch-start, from its track: a figure the watcher's game throws has
        flown by then, one that follows its player's position moves only once
        its player is up (docs/verbs/push.md)."""
        if not self.track:
            raise AssertionData("the watch has no track (a lab-driver before it)")
        x0, y0, z0 = self.track[0][1], self.track[0][2], self.track[0][3]
        best = 0.0
        for t, x, y, z in self.track:
            if t > float(ms):
                break
            best = max(best, ((x - x0) ** 2 + (y - y0) ** 2 + (z - z0) ** 2) ** 0.5)
        return best

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

    def drops(self, name: str) -> int:
        """How many times the sampled bool `name` went from true to false: a
        figure's "av:Invisibility" (the actor value above zero, lab-launches'
        recorder) that drops once where its player stayed invisible is the
        recast bug (docs/verbs/self-cast.md)."""
        return _drops(self.bools, name)

    def rises(self, av: str, at_least: float = 0.0) -> int:
        """How many times the actor's `av` (health, magicka or stamina) rose
        between two samples in the watcher's game, by at least `at_least` points
        when given: a figure hit three times shows a dent (its bar below the
        server's step, then climbing back about a hit's size) as a rise, where a
        clean bar only falls but for its own regeneration between the server's
        reports (30 rises of 0.009 to 0.048 points in b-figure-values
        20261021-003901, train-30's figure dent)."""
        return _rises(self.avs, av, at_least)


def _ever(bools: tuple, name: str) -> bool:
    for n, series in bools:
        if str(n).lower() == name.lower():
            return any(bool(v) for _, v in series)
    raise AssertionData(f"the watch sampled no graph bool {name}")


def _drops(bools: tuple, name: str) -> int:
    for n, series in bools:
        if str(n).lower() == name.lower():
            values = [bool(v) for _, v in series]
            return sum(1 for was, now in zip(values, values[1:]) if was and not now)
    raise AssertionData(f"the watch sampled no graph bool {name}")


WATCH_AVS = ("health", "magicka", "stamina")


def _rises(avs: tuple, av: str, at_least: float = 0.0) -> int:
    if av.lower() not in WATCH_AVS:
        raise AssertionData(f"rises reads one of {', '.join(WATCH_AVS)}, got {av!r}")
    for n, series in avs:
        if n == av.lower():
            values = [float(v) for _, v in series]
            return sum(1 for was, now in zip(values, values[1:]) if now > was and now - was >= at_least)
    raise AssertionData(f"the watch carried no {av.lower()} series (a driver before the watch's actor values)")


def _av_series(entry: dict[str, Any]) -> tuple:
    """A watch entry's actor-value series, the driver's health/magicka/stamina rows
    ([[ms, value], ...], the first at watch-start), as ((name, ((ms, value), ...)), ...)."""
    return tuple((av, tuple((float(r[0]), float(r[1])) for r in entry[av] if len(r) >= 2))
                 for av in WATCH_AVS if isinstance(entry.get(av), list))


# a figure's arrow flies some network time after its shooter's: pairs within this
FLIGHT_PAIR_MS = 500.0


def _rows(rows, width: int) -> tuple:
    """A trace's launches or flights as tuples of numbers, rows shorter than `width` left out."""
    return tuple(tuple(float(v) for v in row[:width]) for row in rows or [] if isinstance(row, (list, tuple)) and len(row) >= width)


def _form_spec(spec) -> int:
    if isinstance(spec, bool):
        raise AssertionSyntax("E_ASSERT_SYNTAX: launched takes a form id, 0x3f9eb or \"0x3f9eb\"")
    if isinstance(spec, int):
        return spec
    if isinstance(spec, str):
        try:
            return int(spec.strip(), 0)
        except ValueError:
            pass
    raise AssertionSyntax(f"E_ASSERT_SYNTAX: launched takes a form id, 0x3f9eb or \"0x3f9eb\", not {spec!r}")


def _launched(launches: tuple, spec) -> int:
    fid = _form_spec(spec)
    return sum(1 for row in launches if fid in (int(row[1]), int(row[2]), int(row[3])))


def _flights_match(own: tuple, figure: tuple, what: str) -> float:
    if what not in ("position", "angle"):
        raise AssertionSyntax(f"E_ASSERT_SYNTAX: flights_match measures \"position\" or \"angle\", not {what!r}")
    if not own:
        raise AssertionData("the shooter's own watch has no flights (a driver before lab-launches, or no arrow)")
    worst = 0.0
    for o in own:
        near = [f for f in figure if int(f[1]) == int(o[1]) and abs(float(f[0]) - float(o[0])) <= FLIGHT_PAIR_MS]
        if not near:
            raise AssertionData(f"the shooter's flight at {float(o[0]):.0f} ms (ammo {int(o[1]):#x}) has no figure flight "
                                f"of that ammo within {FLIGHT_PAIR_MS:.0f} ms")
        f = min(near, key=lambda f: abs(float(f[0]) - float(o[0])))
        if what == "position":
            gap = math.dist((float(o[2]), float(o[3]), float(o[4])), (float(f[2]), float(f[3]), float(f[4])))
        else:
            if any(abs(float(a)) > 2 * math.pi + 0.1 for a in (o[5], o[6], f[5], f[6])):
                raise AssertionData("a flight's angle is beyond 2 pi: the trace's angles are not radians")
            pitch = abs(float(f[5]) - float(o[5]))
            heading = abs((float(f[6]) - float(o[6]) + math.pi) % (2 * math.pi) - math.pi)
            gap = math.degrees(max(pitch, heading))
        worst = max(worst, gap)
    return worst


@dataclass(frozen=True)
class SelfWatchView:
    """c.watched_self(): the player's own side of its last watch, the
    animation events its graph was sent (ms, name), the graph bools
    watch-start named, and its own launches and flights (rows as WatchView's)."""

    events: tuple = ()
    bools: tuple = ()
    launches: tuple = ()
    flights: tuple = ()
    # its own health, magicka and stamina as the watch sampled them ((name, ((ms, value), ...)), ...)
    avs: tuple = ()

    def saw(self, name: str) -> int:
        """How many of the player's own animation events were named `name`."""
        return sum(1 for e in self.events if str(e[1]).lower() == name.lower())

    def ever(self, name: str) -> bool:
        """Whether the player's graph bool `name` was true at any sample."""
        return _ever(self.bools, name)

    def launched(self, spec) -> int:
        """How many of the player's own launches name the form `spec` as their
        spell, projectile or ammo."""
        return _launched(self.launches, spec)

    def drops(self, name: str) -> int:
        """How many times the player's sampled bool `name` went from true to false."""
        return _drops(self.bools, name)

    def rises(self, av: str, at_least: float = 0.0) -> int:
        """How many times the player's own `av` (health, magicka or stamina) rose
        between two of the watch's samples, by at least `at_least` points when
        given: hit three times and never healed, its health only falls."""
        return _rises(self.avs, av, at_least)


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


_UNSEARCHED = object()


@dataclass(frozen=True)
class FollowView:
    """server.follow(id): the server's follow table row for an actor (labState kind follow, npc-handoff's D6):
    whether a game follows it out of its hosted cells, which of the run's clients that game is ("" when none),
    the cell it followed the actor into, and the follower's actor id (0 when none)."""
    following: bool
    client: str
    cell: int
    actorId: int


@dataclass(frozen=True)
class FigureSpellsView:
    """c.figure_spells(): that client's figure of another player at its last `figure-spells` step (ADR-046: a
    figure carries only what the server gives it): count, its added spells; extra, the added spells it holds in no
    hand and no power slot (a distributor's, SPID's 0x817 and the like); base, its base's form id."""
    count: int
    extra: int
    base: int


class RefsNearView:
    """c.refs_near(): what stood within the radius of that client's player
    (or, with the step's {from: other}, of its figure of the other player)
    at its last `refs-near` step, by base type (SKSE's Cell.GetNumRefs and
    GetNthRef filter on the base form's type): count(formType) the
    references listed within the radius, or the cell's count for a type the
    step cannot read (50 PROJ: Papyrus aborts on a projectile reference);
    has(baseId) whether one of that base stood there, listed under its type
    or found by the step's ids search; distance(baseId) how far the nearest
    one lies, the listing's exact figure before the search's bisected one
    (docs/research/train-29-rows.md row 7c)."""

    def __init__(self, client: str, data: dict[str, Any]):
        self._client = client
        types = data.get("types")
        self._types: dict[str, Any] = types if isinstance(types, dict) else {}
        ids = data.get("ids")
        self._ids: dict[str, Any] = ids if isinstance(ids, dict) else {}

    def _listed(self, base_id: int) -> list[float]:
        """The distances of every listed reference of that base, nearest first."""
        out: list[float] = []
        for rows in self._types.values():
            refs = rows.get("refs") if isinstance(rows, dict) else None
            for ref in refs if isinstance(refs, list) else []:
                if isinstance(ref, dict) and "distance" in ref and ref.get("baseId") == int(base_id):
                    out.append(float(ref["distance"]))
        return sorted(out)

    def _searched(self, base_id: int) -> Any:
        """The ids search's entry for that base: a found dict, None for none
        within the radius, an {error} dict, or _UNSEARCHED when the step did
        not search it."""
        return self._ids.get(str(int(base_id)), _UNSEARCHED)

    def count(self, form_type: int) -> int:
        rows = self._types.get(str(int(form_type)))
        if not isinstance(rows, dict):
            raise AssertionData(f"{self._client}'s refs-near step did not list form type {int(form_type)}")
        if "note" in rows:
            raise AssertionData(f"{self._client}'s refs-near step counts nothing of form type {int(form_type)}: {rows['note']}")
        n = rows.get("near", rows.get("inCell"))
        if isinstance(n, bool) or not isinstance(n, int):
            raise AssertionData(f"{self._client}'s refs-near step has no count for form type {int(form_type)}")
        return n

    def runtime_of(self, base_id: int) -> int:
        """How many listed references of that base carry a runtime id (0xff000000
        and above): a copy one game made, where the engine's own placed
        reference of the same base never counts (docs/verbs/npc-puppet.md)."""
        n, seen = 0, False
        for rows in self._types.values():
            refs = rows.get("refs") if isinstance(rows, dict) else None
            for ref in refs if isinstance(refs, list) else []:
                if isinstance(ref, dict) and ref.get("baseId") == int(base_id):
                    seen = True
                    if int(ref.get("formId") or 0) >= 0xFF000000:
                        n += 1
        # a zero means something only from a step that listed actors (43 NPC_) or the base itself
        if not seen and not isinstance(self._types.get("43"), dict):
            raise AssertionData(f"{self._client}'s refs-near step listed no reference of {int(base_id):#x} and no actors "
                                f"(formTypes [43]): a zero would measure nothing")
        return n

    def has(self, base_id: int) -> bool:
        if self._listed(base_id):
            return True
        found = self._searched(base_id)
        if found is _UNSEARCHED:
            if not self._types:
                raise AssertionData(f"{self._client}'s refs-near step did not look for {int(base_id):#x}")
            return False
        if isinstance(found, dict) and "error" in found:
            raise AssertionData(f"{self._client}'s refs-near step could not search for {int(base_id):#x}: {found['error']}")
        return isinstance(found, dict)

    def distance(self, base_id: int) -> float:
        listed = self._listed(base_id)
        if listed:
            return listed[0]
        found = self._searched(base_id)
        if isinstance(found, dict) and "error" in found:
            raise AssertionData(f"{self._client}'s refs-near step could not search for {int(base_id):#x}: {found['error']}")
        if isinstance(found, dict):
            try:
                return float(found["distance"])
            except (KeyError, TypeError, ValueError) as e:
                raise AssertionData(f"{self._client}'s refs-near search for {int(base_id):#x} lacks {e}") from e
        if found is _UNSEARCHED and not self._types:
            raise AssertionData(f"{self._client}'s refs-near step did not look for {int(base_id):#x}")
        raise AssertionData(f"{self._client}'s game holds no {int(base_id):#x} within its refs-near step's radius")


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
class HostView:
    """server.host(cell): the server's host table row for a cell (labState kind
    cellHost, docs/verbs/cell-host.md): whether a game hosts it, which of the
    run's clients that game is ("" when none, or a player outside the run), the
    grant's epoch, and the holder's actor id (0 when none)."""

    hosted: bool
    client: str
    epoch: int
    actorId: int


@dataclass(frozen=True)
class RefView:
    """server.ref(id): an actor's record by form id (labState kind ref): a hosted
    NPC's position and health; a snapshot keeps one to compare against."""

    x: float
    y: float
    z: float
    cell: str
    isDead: bool | None = None
    healthPercentage: float | None = None
    magickaPercentage: float | None = None
    staminaPercentage: float | None = None


@dataclass(frozen=True)
class NpcStateView:
    """c.npc_state(id): that seat's own engine state of an NPC at its last
    `npc-state {formId}` step (docs/verbs/npc-puppet.md): whether its AI runs,
    in combat and against whom (form ids, 0 for none), staggering, its
    current package (0 for none), its position in that game."""

    aiEnabled: bool
    inCombat: bool
    package: int
    combatTarget: int
    staggering: bool
    x: float
    y: float
    z: float
    # dead in that game, and its health share (a driver from lab-npc-facts on; older reads lack them)
    isDead: bool | None = None
    healthPercentage: float | None = None
    # what the engine refuses a death for: the actor's essential and its leveled base's protected (x-npc-death)
    isEssential: bool | None = None
    isProtected: bool | None = None
    # E does nothing on it in that game: a puppet's relayed samples set it, the promote clears it
    activationBlocked: bool | None = None
    # the cell the reference stands in in that game (a door's interior after a crossing, npc-handoff)
    cell: int | None = None


@dataclass(frozen=True)
class SpellView:
    """server.spell(id): the Health damage a spell's served record deals on a hit,
    by the server's own rule (labState kind spell; skymp5-server MpActor.cpp
    ApplyEffects and wire-rules magic.rs). magnitude is what lands at once,
    overTime what its lasting effects deal over their durations, conditional how
    many Health effects carry a condition (theirs not counted: the server
    evaluates them, and refuses one whose function it lacks, a perk rider's
    HasPerk), effects how many effects the record has. A scenario under a layer
    asserts against magnitude instead of a vanilla constant."""

    magnitude: float
    overTime: float
    conditional: int
    effects: int


# The server counts only these archetypes as changing a value (MpActor.cpp:2448-2471):
# ValueMod 0, Dual 5, PeakValueMod 34 (libespm MGEF.h EffectType); Health is actor value
# 24 (libespm ActorValue.h:33); the sign is Detrimental's alone (MGEF.h Flags 0x4,
# magic.rs sign()); an effect lands at once when it has no duration (duration <= 0 or
# the MGEF's NoDuration 0x200), else it deals magnitude per second over its duration
# (magic.rs:176, 193, 207-219); the amount is max(0, magnitude) (magic.rs:173).
SPELL_VALUE_ARCHETYPES = (0, 5, 34)
SPELL_DUAL = 5
AV_HEALTH = 24
MGEF_DETRIMENTAL = 0x4
MGEF_NO_DURATION = 0x200


def _spell_view(d: dict[str, Any]) -> SpellView:
    mgefs = d.get("mgefs") or {}
    now = later = 0.0
    conditional = 0
    effects = d.get("effects") or []
    for e in effects:
        m = mgefs.get(str(int(e["mgef"])))
        if not m or int(m["archetype"]) not in SPELL_VALUE_ARCHETYPES or not int(m["flags"]) & MGEF_DETRIMENTAL:
            continue
        weight = 1.0 if int(m["primaryAV"]) == AV_HEALTH else 0.0
        if int(m["archetype"]) == SPELL_DUAL and int(m.get("secondaryAV", -1)) == AV_HEALTH:
            weight += float(m.get("secondAVWeight") or 0.0)
        if weight == 0.0:
            continue
        if int(e.get("conditions") or 0) or int(m.get("conditions") or 0):
            conditional += 1
            continue
        amount = max(0.0, float(e["magnitude"])) * weight
        if int(e.get("duration") or 0) <= 0 or int(m["flags"]) & MGEF_NO_DURATION:
            now += amount
        else:
            later += amount * int(e["duration"])
    return SpellView(magnitude=now, overTime=later, conditional=conditional, effects=len(effects))



class AvView:
    """An av-read step's values (thuum docs/verbs/figure-values.md): for
    health, magicka and stamina, <name> is the base value, <name>Current the
    current one, <name>Max the maximum and <name>Percentage the share, as the
    driver read them on the player (c.av()) or on its figure of another client
    (c.av_of(o))."""

    def __init__(self, who: str, values: dict[str, Any]):
        self._who = who
        self._values = values

    def _field(self, name: str, field: str) -> float:
        v = self._values.get(name)
        if not isinstance(v, dict) or field not in v:
            raise AssertionData(f"{self._who}'s av-read did not read {name}'s {field}")
        try:
            return float(v[field])
        except (TypeError, ValueError) as e:
            raise AssertionData(f"{self._who}'s av-read {name} {field} is not a number") from e

    @property
    def health(self) -> float:
        return self._field("health", "base")

    @property
    def magicka(self) -> float:
        return self._field("magicka", "base")

    @property
    def stamina(self) -> float:
        return self._field("stamina", "base")

    @property
    def healthCurrent(self) -> float:
        return self._field("health", "current")

    @property
    def magickaCurrent(self) -> float:
        return self._field("magicka", "current")

    @property
    def staminaCurrent(self) -> float:
        return self._field("stamina", "current")

    @property
    def healthMax(self) -> float:
        return self._field("health", "maximum")

    @property
    def magickaMax(self) -> float:
        return self._field("magicka", "maximum")

    @property
    def staminaMax(self) -> float:
        return self._field("stamina", "maximum")

    @property
    def healthPercentage(self) -> float:
        return self._field("health", "percentage")

    @property
    def magickaPercentage(self) -> float:
        return self._field("magicka", "percentage")

    @property
    def staminaPercentage(self) -> float:
        return self._field("stamina", "percentage")

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
    # the menus open in that game (lab-driver's dump-state menus: "HUD Menu", "Dialogue Menu", ...)
    menus: tuple[str, ...] | None = None
    # the form id under the crosshair (lab-driver's dump-state crosshairRef, what E acts on; 0 for none)
    crosshairRef: int | None = None

    def menuOpen(self, name: str) -> bool:
        if self.menus is None:
            raise AssertionData("the dump-state carried no menus")
        return name in self.menus


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
    def __init__(self, facade: ServerFacade, clients: list[str] | None = None):
        self._f = facade
        self._clients = list(clients or [])

    def actor(self, client: str) -> ActorView:
        d = self._f.actor(client)
        if not d or not d.get("found", True):
            raise AssertionData(f"server has no actor for {client}")
        try:
            return ActorView(
                float(d["x"]), float(d["y"]), float(d["z"]), str(d["cell"]),
                isDead=_opt_bool(d.get("isDead")),
                healthPercentage=_opt_float(d.get("healthPercentage")),
                magickaPercentage=_opt_float(d.get("magickaPercentage")),
                staminaPercentage=_opt_float(d.get("staminaPercentage")),
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

    def host(self, spec) -> HostView:
        cell = self._f.base_id(spec) if isinstance(spec, str) else int(spec)
        fn = getattr(self._f, "cell_host", None)
        d = fn(cell) if fn else None
        if not d or not d.get("found"):
            raise AssertionData(f"server has no host table to read {cell:#x} from (no cell hosting)")
        holder = int(d.get("actorId") or 0)
        client = ""
        if holder:
            for c in self._clients:
                a = self._f.actor(c)
                if a and int(a.get("actorId") or 0) == holder:
                    client = c
                    break
        return HostView(bool(d.get("hosted")), client, int(d.get("epoch") or 0), holder)

    def follow(self, spec) -> FollowView:
        actor_id = self._f.base_id(spec) if isinstance(spec, str) else int(spec)
        fn = getattr(self._f, "follow", None)
        d = fn(actor_id) if fn else None
        if not d or not d.get("found"):
            raise AssertionData(f"server has no follow table to read {actor_id:#x} from (no npc-handoff follow)")
        holder = int(d.get("player") or 0)
        client = ""
        if holder:
            for c in self._clients:
                a = self._f.actor(c)
                if a and int(a.get("actorId") or 0) == holder:
                    client = c
                    break
        return FollowView(bool(d.get("following")), client, int(d.get("cell") or 0), holder)

    def ref(self, spec) -> RefView:
        actor_id = self._f.base_id(spec) if isinstance(spec, str) else int(spec)
        fn = getattr(self._f, "ref", None)
        d = fn(actor_id) if fn else None
        if not d or not d.get("found"):
            raise AssertionData(f"server holds no record for {actor_id:#x}")
        try:
            return RefView(float(d["x"]), float(d["y"]), float(d["z"]), str(d.get("cell") or ""),
                           isDead=_opt_bool(d.get("isDead")),
                           healthPercentage=_opt_float(d.get("healthPercentage")),
                           magickaPercentage=_opt_float(d.get("magickaPercentage")),
                           staminaPercentage=_opt_float(d.get("staminaPercentage")))
        except (KeyError, TypeError, ValueError) as e:
            raise AssertionData(f"{actor_id:#x}'s record lacks {e}") from e

    def spell(self, spec) -> SpellView:
        form_id = self._f.base_id(spec) if isinstance(spec, str) else int(spec)
        fn = getattr(self._f, "spell", None)
        d = fn(form_id) if fn else None
        if not d or not d.get("found"):
            raise AssertionData(f"server resolves no spell {form_id:#x}")
        try:
            return _spell_view(d)
        except (KeyError, TypeError, ValueError) as e:
            raise AssertionData(f"spell {form_id:#x}'s record lacks {e}") from e

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
        """The cut for a record: the first mark of the spec's kind (the first
        kind of a list that the record shows), less the lead."""
        cut = self._spec.cut
        kinds = [str(k) for k in cut.kind] if isinstance(cut.kind, list) else [str(cut.kind)]
        if not record:
            raise AssertionData(f"parity: {view} has no record to cut")
        for kind in kinds:
            rows: list = []
            if kind == "hit":
                rows = record.get("hits" if self.ROLE_OF[view] == "actor" else "taken") or []
            elif kind == "cast":
                rows = record.get("casts") or []
            elif kind.startswith("event:"):
                name = kind.split(":", 1)[1].lower()
                rows = [e for e in record.get("events") or [] if str(e[1]).lower() == name]
            elif kind.startswith("value:"):
                av = kind.split(":", 1)[1].lower()
                if av not in ("health", "magicka", "stamina"):
                    raise AssertionSyntax(f"E_ASSERT_SYNTAX: parity cut value {av!r} is not health, magicka or stamina")
                series = record.get(av) or []
                if series:
                    first = float(series[0][1])
                    rows = [r for r in series if float(r[1]) < first - 0.5]
            else:
                raise AssertionSyntax(f"E_ASSERT_SYNTAX: parity cut kind {kind!r} is not hit, cast, event:<name> or value:<av>")
            if rows:
                return max(0.0, float(rows[0][0]) - float(cut.lead_ms))
        raise AssertionData(f"parity: {view} shows no {' or '.join(kinds)} to cut at")

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
        target_figure, _ = actor_ref._watched_figure(spec.target, actor_watch.get("actors") or [])
        actor_figure, _ = target_ref._watched_figure(spec.actor, target_watch.get("actors") or [])
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

    def _watched_figure(self, other: str, actors: list[Any]) -> tuple[dict[str, Any] | None, tuple[float, float, float]]:
        """The watched actor that began where the server has `other`, else the
        one that ended there (a move the server took, such as a throw, carries
        its record away from where the watch began): watched() and parity's
        figure views find a figure the same way."""
        best, origin = self._nearest(other, actors, lambda a: a["first"])
        if best is None:
            best, origin = self._nearest(other, actors, lambda a: a["last"])
        return best, origin

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
        best, origin = self._watched_figure(other, data.get("actors") or [])
        if best is None:
            raise AssertionData(f"{self.name} watched no actor where the server has {other}")
        return self._watch_view(best, origin, f"{self.name}'s watch of {other}")

    def watched_id(self, form_id: int) -> WatchView:
        """The watched actor with this form id, as the watcher's own game has
        it: for a cell's own NPC in a solo reference (watch-start {formIds}),
        where no server position exists to match against. Positions are the
        client's own coordinates (no cell origin is subtracted)."""
        fn = getattr(self._views, "watch", None)
        data = fn(self.name) if fn else None
        if not isinstance(data, dict):
            raise AssertionData(f"{self.name} has not reported a watch-stop yet")
        wanted = int(form_id)
        best = None
        for e in data.get("actors") or []:
            try:
                if int(e.get("formId")) == wanted:
                    best = e
                    break
            except (AttributeError, TypeError, ValueError):
                continue
        if best is None:
            raise AssertionData(f"{self.name} watched no actor with form id {wanted:#x}")
        return self._watch_view(best, (0.0, 0.0, 0.0), f"{self.name}'s watch of {wanted:#x}")

    def _watch_view(self, best: dict[str, Any], origin: tuple[float, float, float], label: str) -> WatchView:
        try:
            first = best["first"]
            series = best.get("magicka") or []
            falls = [float(t) for (t, v), (_, prev) in zip(series[1:], series) if float(v) < float(prev)]
            return WatchView(
                float(first[0]) - origin[0], float(first[1]) - origin[1], float(first[2]) - origin[2],
                maxDisplacement=float(best["maxDisplacement"]),
                samples=int(best.get("samples", 0)),
                maxStep=float(best.get("maxStep") or 0.0),
                maxStepMs=float(best["maxStepMs"]) if best.get("maxStepMs") is not None else -1.0,
                track=tuple(tuple(float(v) for v in row[:4]) for row in best.get("track") or [] if len(row) >= 4),
                drainMs=falls[-1] - falls[0] if falls else 0.0,
                drainEndMs=falls[-1] if falls else -1.0,
                events=tuple((float(e[0]), str(e[1]), int(e[2])) for e in best.get("events") or []),
                bools=_bool_series(best.get("bools")),
                launches=_rows(best.get("launches"), 10),
                flights=_rows(best.get("flights"), 8),
                avs=_av_series(best),
                turns=abs(float(best["turned"])) / 360.0 if best.get("turned") is not None else None,
                headingAtStop=float(best["headingAtStop"]) if best.get("headingAtStop") is not None else None,
            )
        except (KeyError, IndexError, TypeError, ValueError) as e:
            raise AssertionData(f"{label} lacks {e}") from e

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
                launches=_rows(own.get("launches"), 10),
                flights=_rows(own.get("flights"), 8),
                avs=_av_series(own),
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

    def globalValue(self, desc: str) -> float:
        """c.globalValue("<hex id>:<plugin>"): the value that client's game
        holds for a global variable, from its last `globals` step
        (docs/verbs/player-globals.md)."""
        fn = getattr(self._views, "globals", None)
        data = fn(self.name) if fn else None
        if not isinstance(data, dict):
            raise AssertionData(f"{self.name} has not reported a globals step yet")
        v = data.get(desc)
        if not isinstance(v, (int, float)) or isinstance(v, bool):
            raise AssertionData(f"{self.name}'s globals step did not read {desc}")
        return float(v)

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

    def npc_state(self, form_id: int) -> NpcStateView:
        """The seat's last npc-state step for that NPC (`npc-state {formId}`)."""
        fn = getattr(self._views, "npc_state", None)
        data = fn(self.name, int(form_id)) if fn else None
        if not isinstance(data, dict):
            raise AssertionData(f"{self.name} has not reported an npc-state step for {int(form_id):#x}")
        try:
            pos = data.get("pos") or [None, None, None]
            return NpcStateView(bool(data["aiEnabled"]), bool(data["inCombat"]), int(data.get("package") or 0),
                                int(data.get("combatTarget") or 0), bool(data.get("staggering")),
                                float(pos[0]), float(pos[1]), float(pos[2]),
                                isDead=_opt_bool(data.get("isDead")), healthPercentage=_opt_float(data.get("healthPercentage")),
                                isEssential=_opt_bool(data.get("isEssential")), isProtected=_opt_bool(data.get("isProtected")),
                                activationBlocked=_opt_bool(data.get("activationBlocked")), cell=_opt_int(data.get("cell")))
        except (KeyError, IndexError, TypeError, ValueError) as e:
            raise AssertionData(f"{self.name}'s npc-state of {int(form_id):#x} lacks {e}") from e

    def log_count(self, pattern: str) -> int:
        """c.log_count("<regex>"): the lines of that client's Skyrim Platform log matching the regex at its last
        log-count step of that same pattern."""
        fn = getattr(self._views, "log_count", None)
        n = fn(self.name, pattern) if fn else None
        if n is None:
            raise AssertionData(f"{self.name} has no log-count of {pattern!r} (a log-count {{pattern}} step first)")
        return int(n)

    def figure_spells(self) -> FigureSpellsView:
        """c.figure_spells(): that client's figure of the other player at its last `figure-spells` step."""
        fn = getattr(self._views, "figure_spells", None)
        data = fn(self.name) if fn else None
        if not isinstance(data, dict) or not isinstance(data.get("added"), list):
            raise AssertionData(f"{self.name} has not reported a figure-spells step yet")
        try:
            return FigureSpellsView(len(data["added"]), len(data.get("extra") or []), int(data.get("base") or 0))
        except (TypeError, ValueError) as e:
            raise AssertionData(f"{self.name}'s figure-spells answer is malformed: {e}") from e

    def refs_near(self) -> RefsNearView:
        """c.refs_near(): what stood near that client's player (or its figure
        of the other player, with the step's {from: other}) at its last
        `refs-near` step: count(formType), has(baseId), distance(baseId)."""
        fn = getattr(self._views, "refs_near", None)
        data = fn(self.name) if fn else None
        if not isinstance(data, dict) or not isinstance(data.get("types"), dict):
            raise AssertionData(f"{self.name} has not reported a refs-near step yet")
        return RefsNearView(self.name, data)

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
        the server's ConsoleOutput; docs/verbs/console-commands.md), or one of
        the earlier lines its `match` brought back from the console's history
        (skymp5-client's own traces print only there: b-cell-host
        20261021-193557 read "released cell 9810" in the history and false
        here, before this read it)."""
        fn = getattr(self._views, "consoles", None)
        data = fn(self.name) if fn else None
        if not isinstance(data, dict):
            raise AssertionData(f"{self.name} has not reported a console step yet")
        lines = data.get("lines")
        if not isinstance(lines, list):
            raise AssertionData(f"{self.name}'s console step reported no lines")
        history = data.get("history") if isinstance(data.get("history"), list) else []
        return any(isinstance(line, str) and str(text) in line for line in list(lines) + list(history))

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

    def av(self) -> AvView:
        """c.av(): the actor values its last `av-read {names}` step read on
        its own player (base, current, maximum and percentage each)."""
        return self._av(None)

    def av_of(self, other: str) -> AvView:
        """c.av_of(o): the same on that client's figure of client o, from its
        last `av-read {names, other: true}`: of the actors it read, the
        enabled one with 3D nearest where the server has o (within
        SEE_RADIUS), as node_scale_of chooses (thuum docs/verbs/
        figure-values.md: the figure's base Health is its player's)."""
        return self._av(other)

    def _av(self, other: str | None) -> AvView:
        fn = getattr(self._views, "av_reads", None)
        data = fn(self.name) if fn else None
        kind = "self" if other is None else "other"
        read = data.get(kind) if isinstance(data, dict) else None
        if not isinstance(read, dict):
            step = "av-read" if other is None else "av-read {other: true}"
            raise AssertionData(f"{self.name} has not reported an {step} step yet")
        if other is not None:
            live = [n for n in read.get("all") or [] if isinstance(n, dict) and n.get("enabled") and n.get("loaded")]
            read, _ = self._nearest(other, live, lambda n: n["pos"])
            if read is None:
                raise AssertionData(f"{self.name} read no enabled actor with 3D where the server has {other}")
        values = read.get("values")
        if not isinstance(values, dict):
            raise AssertionData(f"{self.name}'s av-read step lacks values")
        return AvView(self.name, values)

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
                menus=tuple(str(m) for m in dump["menus"]) if isinstance(dump.get("menus"), list) else None,
                crosshairRef=_opt_int(dump.get("crosshairRef")),
            )
        except (KeyError, IndexError, TypeError, ValueError) as e:
            raise AssertionData(f"{self.name}'s state lacks {e}") from e


_ATTRS = {
    _ParityRef: {"findings", "ok", "report"},
    ActorView: {"x", "y", "z", "cell", "isDead", "healthPercentage", "magickaPercentage", "staminaPercentage",
                "hasAppearance", "raceId", "sex",
                "appearanceAttempts", "lastAppearanceRaceId", "lastAppearanceAllowed", "headParts",
                "shouts", "wordsKnown", "wordsUnlocked", "shoutRecovery"},
    Pos: {"x", "y", "z", "name", "isDead", "healthPercentage", "equippedRight", "equippedLeft", "raceId", "sex"},
    WatchView: {"x", "y", "z", "maxDisplacement", "samples", "drainMs", "drainEndMs", "maxStep", "maxStepMs", "turns", "headingAtStop"},
    NpcStateView: {"aiEnabled", "inCombat", "package", "combatTarget", "staggering", "x", "y", "z", "isDead", "healthPercentage",
                   "isEssential", "isProtected", "activationBlocked", "cell"},
    MarkerView: {"visible", "canTravel"},
    ProjectileView: {"distance"},
    PoisonView: {"poisonId", "count"},
    SkillView: {"base", "xp", "legendary"},
    PresetView: {"bytes", "sha256", "look"},
    TimeView: {"year", "month", "day", "hour", "daysPassed", "timeScale"},
    SpellView: {"magnitude", "overTime", "conditional", "effects"},
    HostView: {"hosted", "client", "epoch", "actorId"},
    RefView: {"x", "y", "z", "cell", "isDead", "healthPercentage", "magickaPercentage", "staminaPercentage"},
    FigureSpellsView: {"count", "extra", "base"},
    FollowView: {"following", "client", "cell", "actorId"},
    AvView: {"health", "magicka", "stamina", "healthCurrent", "magickaCurrent", "staminaCurrent",
             "healthMax", "magickaMax", "staminaMax", "healthPercentage", "magickaPercentage", "staminaPercentage"},
    StateView: {"x", "y", "z", "worldOrCell", "cellName", "isDead", "healthPercentage", "magickaPercentage", "staminaPercentage", "equippedRight", "equippedLeft", "raceId", "sex",
                "gameYear", "gameMonth", "gameDay", "gameHour", "gameDaysPassed", "timeScale", "down",
                "movementControls", "menuControls", "lookingControls", "activateControls", "rested", "crosshairRef"},
    _ClientRef: {"state"},
}
# Methods that take a number: c2.watched(c1).movedBy(5000)
_NUMBER_METHODS = {
    WatchView: {"movedBy"},
    RefsNearView: {"count"},
}
# Methods that take a form id: c.marker(0x00016223)
_ID_METHODS = {
    _ClientRef: {"marker", "known", "favorite", "held", "projectile", "poison", "watched_id", "npc_state"},
    RefsNearView: {"has", "distance", "runtime_of"},
}
# Methods that take a form id as a number or a string: c2.watched(c1).launched("0x3f9eb")
_FORM_SPEC_METHODS = {
    WatchView: {"launched"},
    SelfWatchView: {"launched"},
    _ServerRef: {"spell", "host", "ref", "follow"},
}
# Methods that take a client's own watch and a string: c2.watched(c1).flights_match(c1.watched_self(), "angle")
_PAIR_METHODS = {
    WatchView: {"flights_match"},
}
# Methods that take a string and, optionally, a number: c1.watched(c2).rises("health", 1)
_STRING_NUMBER_METHODS = {
    WatchView: {"rises"},
    SelfWatchView: {"rises"},
}
# Methods that take no argument: server.time()
_NULLARY = {
    _ServerRef: {"time"},
    _ClientRef: {"level", "node_scale", "morph", "head_parts", "watched_self", "av", "refs_near", "figure_spells"},
}
_METHODS = {
    _ServerRef: {"actor", "inventory", "effects", "time", "spell", "host", "ref", "follow"},
    _ClientRef: {"sees", "view", "watched", "watched_id", "watched_self", "npc_state", "figure_spells", "log_count", "marker", "known", "favorite", "held", "globalValue", "projectile", "poison", "skill", "level", "node_scale", "node_scale_of", "morph", "morph_of", "av", "av_of", "preset", "printed", "head_parts", "refs_near"},
    InventoryView: {"count"},
    RefsNearView: {"count", "has", "distance", "runtime_of"},
    EffectsView: {"left", "magnitude"},
    WatchView: {"took", "sent", "ever", "drops", "rises", "movedBy", "launched", "flights_match"},
    SelfWatchView: {"saw", "ever", "drops", "rises", "launched"},
    StateView: {"menuOpen"},
}
_CMP = {
    ast.Eq: operator.eq, ast.NotEq: operator.ne, ast.Lt: operator.lt,
    ast.LtE: operator.le, ast.Gt: operator.gt, ast.GtE: operator.ge,
}
_BIN = {ast.Add: operator.add, ast.Sub: operator.sub, ast.Mult: operator.mul, ast.Div: operator.truediv}


class Evaluator:
    def __init__(self, server: ServerFacade, views: ViewsFacade, clients: list[str], parity: Any = None, references_dir: str | Path | None = None,
                 snapshots: dict[str, Any] | None = None):
        self._names: dict[str, Any] = {"server": _ServerRef(server, clients), "true": True, "false": False, "True": True, "False": False}
        self._server_facade = server
        # the run's `server: snapshot {name, of}` values, by name (runner.RunRecord.snapshots)
        self._snapshots = snapshots if snapshots is not None else {}
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

    def value(self, expr: str) -> Any:
        """What an expression reads, not a verdict: a snapshot step's server fact."""
        try:
            tree = ast.parse(expr.strip(), mode="eval")
        except SyntaxError as e:
            raise AssertionSyntax(f"E_ASSERT_SYNTAX: {e.msg} in {expr!r}") from e
        return self._eval(tree.body)

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
                if node.func.id == "snapshot" and len(node.args) == 1:
                    name = self._eval(node.args[0])
                    if not isinstance(name, str):
                        raise AssertionSyntax("E_ASSERT_SYNTAX: snapshot() takes a name")
                    if name not in self._snapshots:
                        raise AssertionData(f"no snapshot {name!r} taken earlier in this run")
                    return self._snapshots[name]
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
                if node.func.attr in _PAIR_METHODS.get(type(obj), set()):
                    if len(args) != 2 or not isinstance(args[0], SelfWatchView) or not isinstance(args[1], str):
                        raise AssertionSyntax(f"E_ASSERT_SYNTAX: {node.func.attr} takes a client's watched_self() and a string")
                    return self._read(node, getattr(obj, node.func.attr)(args[0], args[1]))
                if node.func.attr in _FORM_SPEC_METHODS.get(type(obj), set()):
                    if len(args) != 1 or isinstance(args[0], bool) or not isinstance(args[0], (int, str)):
                        raise AssertionSyntax(f"E_ASSERT_SYNTAX: {node.func.attr} takes one form id, 0x3f9eb or \"0x3f9eb\"")
                    return self._read(node, getattr(obj, node.func.attr)(args[0]))
                if node.func.attr in _STRING_NUMBER_METHODS.get(type(obj), set()):
                    if not 1 <= len(args) <= 2 or not isinstance(args[0], str) or any(
                            isinstance(a, bool) or not isinstance(a, (int, float)) or a < 0 for a in args[1:]):
                        raise AssertionSyntax(f"E_ASSERT_SYNTAX: {node.func.attr} takes a string and, optionally, a number of points, zero or more")
                    return self._read(node, getattr(obj, node.func.attr)(*args))
                # methods that take a form id: c.marker(0x00016223)
                takes_id = node.func.attr in _ID_METHODS.get(type(obj), set())
                takes_number = node.func.attr in _NUMBER_METHODS.get(type(obj), set())
                if takes_id:
                    if len(args) != 1 or isinstance(args[0], bool) or not isinstance(args[0], int):
                        raise AssertionSyntax(f"E_ASSERT_SYNTAX: {node.func.attr} takes one form id")
                elif takes_number:
                    if len(args) != 1 or isinstance(args[0], bool) or not isinstance(args[0], (int, float)):
                        raise AssertionSyntax(f"E_ASSERT_SYNTAX: {node.func.attr} takes one number")
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
