"""The parity diff (thuum ADR-031): what the engine plays for an action in a
solo game, the reference, against what each multiplayer game shows of it.

A record is the lab-driver recorder's (lab/driver/src/index.ts, the watch):
formId, name, first, last, maxDisplacement, maxStep, maxStepMs, health,
magicka and stamina series [ms, value], events [ms, name, taken], vars
{name: [[ms, value]]}, bools, casts [ms, spell], hits [ms, target, source,
projectile, flags], taken [ms, aggressor, source, flags] and effects [ms,
caster, effect], every ms counted from the watch's start.

An action between two players is seen four ways, each a view:
- actor-own: the actor's own player in its game;
- target-figure: the target as the actor's game shows it;
- target-own: the target's own player in its game;
- actor-figure: the actor as the target's game shows it.
The references fill the same four keys from two solo runs, and nothing else
is compared (reference_views builds the mapping):
- reference A, the player acting on a placed NPC: actor-own from its player
  (self), and actor-figure from that same player record;
- reference B, the NPC acting on the player: target-own from its player
  (self), and target-figure from that same player record.
A figure stands for a player, so the oracle for a figure is what the engine
does to that player in its own game, not what it does to an NPC: the first
references (r-melee-power-a 20261014-065429) showed a placed NPC answering a
power attack with its AI (a line, a drawn weapon, a counterattack) where a
player has no AI at all. The NPC records stay in the trace (npc=True maps
them instead, for what the engine shows of another actor).
With a third client, a bystander's two figures would be two more views.

Each record is cut at its action's moment (`at`, ms from the watch's start):
what it showed before is its baseline, and a consequence is what it shows
after that it did not show before, so walking, idling and the figure's
relay noise, present on both sides of the cut, drop out without a list.
A consequence is a key, channel/name:
- events/<name>: an animation event its graph took;
  refused/<name>: one sent to it and never taken;
- vars/<name>=<value>: a bool or int variable reaching a value it did not
  hold before; vars/<name>~: a float moving past the float tolerance beyond
  its baseline range (the locomotion floats in NOISY_FLOATS left out);
- bools/<name>=<value>: the same for the bools watch-start named;
- effects/<mgef>, casts/<spell>, hits/<source>/<kind>, taken/<source>/<kind>
  (form ids in hex, kind the hit's flags: power, sneak, bash, blocked);
- values/<av>-fell, values/<av>-rose: health, magicka or stamina past the
  value tolerance (actor value points) from its value at the cut;
- physics/moved: displaced more than the move tolerance over the watch (a
  throw; a stagger's stumble stays under it); physics/jumped: a single
  frame's step over the step tolerance (a teleport, a snap).
Event timing is not compared: which events, and how many (ADR-033). After
the cut each events, casts, hits, taken and effects key carries its count
(counts), and for a key both sides show, a run's count below the reference's
is a finding too, "missing n of m": three cast starts taken of five is not
five. A count above the reference's is not a finding. The tolerances are
TOLERANCES, each overridable from the p-scenario (`tolerances:`).
The other actor's form id is never part of a key: a figure and a placed NPC
have different ids for the same role.

A finding is (view, kind, key) with what each side showed: missing, the
reference shows it and the run does not; extra, the run shows it and the
reference does not. Findings sort by view (VIEWS' order), then key. A finding
whose "<view>/<channel>/<name>" a line of the scenario's `later` list matches
(a glob: "*/events/staggerStart" in every view, "target-own/physics/*") is
dropped; a count finding is dropped by a line matching its path, as a key's
is, or by one matching "<path>#count", which excuses the count alone and never
the key's absence. That list is the verb's Inventory rows marked later
(docs/VERB.md), reviewed with the scenario.
"""
from __future__ import annotations

import fnmatch
from dataclasses import dataclass, field
from typing import Any, Iterable

VIEWS = ("actor-own", "target-figure", "target-own", "actor-figure")

TOLERANCES = {
    "float": 0.05,  # a float variable's move beyond its baseline range
    "value": 0.5,  # health, magicka, stamina: actor value points
    "move": 64.0,  # units over the watch: more is a throw, a stagger's stumble is less
    "step": 150.0,  # units in one frame: a teleport or a snap
}
NOISY_FLOATS = frozenset({
    "TurnDelta", "Direction", "SpeedSampled", "Speed", "SpeedDamped", "Pitch", "PitchOffset",
    "VelocityZ", "1stPRot", "1stPRotDamped", "AimPitchCurrent", "AimHeadingCurrent", "weapAdj",
})
HIT_KINDS = ((1, "power"), (2, "sneak"), (4, "bash"), (8, "blocked"))
CHANNELS = ("events", "refused", "vars", "bools", "effects", "casts", "hits", "taken", "values", "physics")
COUNTED = ("events", "effects", "casts", "hits", "taken")  # the channels whose keys carry a count (ADR-033)


@dataclass(frozen=True)
class Finding:
    view: str
    kind: str  # "missing" or "extra"
    key: str
    reference: str = ""  # what the reference showed for the key
    run: str = ""  # what the run showed for it
    count: tuple[int, int] | None = None  # a count finding: (the run's count, the reference's)

    @property
    def path(self) -> str:
        return f"{self.view}/{self.key}"

    def __str__(self) -> str:
        if self.count:
            n, m = self.count
            return f"{self.path} missing {m - n} of {m}"
        return f"{self.path} {self.kind}"

    def detail(self) -> str:
        return f"{self} (reference: {self.reference or 'nothing'}; run: {self.run or 'nothing'})"


def _hex(form_id: Any) -> str:
    try:
        return f"{int(form_id) & 0xFFFFFFFF:x}"
    except (TypeError, ValueError):
        return "?"


def _kind(flags: Any) -> str:
    try:
        f = int(flags)
    except (TypeError, ValueError):
        return "plain"
    names = [n for bit, n in HIT_KINDS if f & bit]
    return "+".join(names) if names else "plain"


def _split(rows: Iterable[Any], at: float) -> tuple[list, list]:
    before, after = [], []
    for row in rows or []:
        try:
            (after if float(row[0]) >= at else before).append(row)
        except (TypeError, ValueError, IndexError):
            continue
    return before, after


def _norm(v: Any) -> Any:
    if isinstance(v, bool):
        return int(v)
    if isinstance(v, float) and v.is_integer():
        return int(v)
    return v


def _series(channel: str, series: dict, at: float, floats: bool, tol: dict, out: dict) -> None:
    for name, rows in (series or {}).items():
        before, after = _split(rows, at)
        if not before and after:
            # the first sample is the state at the watch's start, not a change:
            # a cut at or before it (a reference cut at its action less a lead
            # longer than its watch had run) made every variable's first value
            # a consequence (p-spell-bolt 20261015-073742, 377 of them)
            before, after = after[:1], after[1:]
        if not after:
            continue
        is_float = floats and any(isinstance(r[1], float) and not float(r[1]).is_integer() for r in rows)
        if is_float:
            if name in NOISY_FLOATS:
                continue
            values = [float(r[1]) for r in before]
            lo, hi = (min(values), max(values)) if values else (None, None)
            for r in after:
                v = float(r[1])
                if lo is None or v < lo - tol["float"] or v > hi + tol["float"]:
                    out[f"{channel}/{name}~"] = f"{lo if lo is not None else '?'}..{hi if hi is not None else '?'} then {v} at {r[0]} ms"
                    break
            continue
        held = {_norm(r[1]) for r in before}
        for r in after:
            v = _norm(r[1])
            if v not in held:
                out.setdefault(f"{channel}/{name}={v}", f"at {r[0]} ms")


def consequences(record: dict | None, at: float, tolerances: dict | None = None) -> dict[str, str]:
    """The consequence keys a record shows from `at` on that it did not
    show before (see the module's docstring), each with what it saw."""
    tol = {**TOLERANCES, **(tolerances or {})}
    out: dict[str, str] = {}
    if not record:
        return out
    before, after = _split(record.get("events") or [], at)
    taken_before = {str(e[1]) for e in before if len(e) < 3 or int(e[2])}
    sent_before = {str(e[1]) for e in before}
    for e in after:
        name = str(e[1])
        if len(e) < 3 or int(e[2]):
            if name not in taken_before:
                out.setdefault(f"events/{name}", f"taken at {e[0]} ms")
    taken_after = {str(e[1]) for e in after if len(e) < 3 or int(e[2])}
    for e in after:
        name = str(e[1])
        if name not in taken_after and name not in sent_before:
            out.setdefault(f"refused/{name}", f"sent at {e[0]} ms, not taken")
    _series("vars", record.get("vars") or {}, at, True, tol, out)
    _series("bools", record.get("bools") or {}, at, False, tol, out)
    _, effects = _split(record.get("effects") or [], at)
    for e in effects:
        if len(e) > 2:
            out.setdefault(f"effects/{_hex(e[2])}", f"at {e[0]} ms")
    _, casts = _split(record.get("casts") or [], at)
    for c in casts:
        if len(c) > 1:
            out.setdefault(f"casts/{_hex(c[1])}", f"at {c[0]} ms")
    _, hits = _split(record.get("hits") or [], at)
    for h in hits:
        if len(h) > 2:
            out.setdefault(f"hits/{_hex(h[2])}/{_kind(h[4] if len(h) > 4 else 0)}", f"at {h[0]} ms")
    _, taken = _split(record.get("taken") or [], at)
    for t in taken:
        if len(t) > 2:
            out.setdefault(f"taken/{_hex(t[2])}/{_kind(t[3] if len(t) > 3 else 0)}", f"at {t[0]} ms")
    for av in ("health", "magicka", "stamina"):
        before_v, after_v = _split(record.get(av) or [], at)
        base = float(before_v[-1][1]) if before_v else (float(after_v[0][1]) if after_v else None)
        if base is None or not after_v:
            continue
        low = min(float(r[1]) for r in after_v)
        high = max(float(r[1]) for r in after_v)
        if low < base - tol["value"]:
            out[f"values/{av}-fell"] = f"{base:g} to {low:g}"
        if high > base + tol["value"]:
            out[f"values/{av}-rose"] = f"{base:g} to {high:g}"
    moved = float(record.get("maxDisplacement") or 0)
    if moved > tol["move"]:
        out["physics/moved"] = f"{moved:g} units"
    step = float(record.get("maxStep") or 0)
    if step > tol["step"] and float(record.get("maxStepMs") or -1) >= at:
        out["physics/jumped"] = f"{step:g} units in a frame at {record.get('maxStepMs')} ms"
    return out


def counts(record: dict | None, at: float) -> dict[str, int]:
    """How many times each countable key occurs from `at` on (ADR-033): a
    taken event by name, an effect by magic effect, a cast by spell, a hit or
    a taken hit by source and kind, keyed as consequences keys them. diff
    compares the counts of the keys both sides show as consequences."""
    out: dict[str, int] = {}
    if not record:
        return out

    def bump(key: str) -> None:
        out[key] = out.get(key, 0) + 1

    for e in _split(record.get("events") or [], at)[1]:
        if len(e) < 3 or int(e[2]):
            bump(f"events/{e[1]}")
    for e in _split(record.get("effects") or [], at)[1]:
        if len(e) > 2:
            bump(f"effects/{_hex(e[2])}")
    for c in _split(record.get("casts") or [], at)[1]:
        if len(c) > 1:
            bump(f"casts/{_hex(c[1])}")
    for h in _split(record.get("hits") or [], at)[1]:
        if len(h) > 2:
            bump(f"hits/{_hex(h[2])}/{_kind(h[4] if len(h) > 4 else 0)}")
    for t in _split(record.get("taken") or [], at)[1]:
        if len(t) > 2:
            bump(f"taken/{_hex(t[2])}/{_kind(t[3] if len(t) > 3 else 0)}")
    return out


def _observed(record: dict | None, at: float, key: str) -> str:
    """What a record showed for a key it lacks, so a finding reads without
    the trace: the event sent but refused, a value's range, the distance."""
    if not record:
        return "no record"
    channel, _, name = key.partition("/")
    if channel in ("events", "refused"):
        _, after = _split(record.get("events") or [], at)
        hits = [e for e in after if str(e[1]) == name]
        if not hits:
            return "never sent"
        return "sent, taken" if any(len(e) < 3 or int(e[2]) for e in hits) else "sent, not taken"
    if channel == "values":
        av = name.rsplit("-", 1)[0]
        rows = record.get(av) or []
        return f"{av} " + " ".join(f"{float(r[1]):g}" for r in rows[:8]) if rows else f"no {av} series"
    if channel == "physics":
        return f"moved {float(record.get('maxDisplacement') or 0):g} units, largest step {float(record.get('maxStep') or 0):g}"
    if channel in ("vars", "bools"):
        var = name.split("=", 1)[0].rstrip("~")
        rows = (record.get(channel) or {}).get(var) or []
        return f"{var} " + " ".join(f"{r[1]}@{r[0]}" for r in rows[:8]) if rows else f"{var} never sampled"
    return "absent"


def matches_later(path: str, later: Iterable[str]) -> bool:
    """Whether a finding's "<view>/<channel>/<name>" is one the later list
    names (globs: "*/events/staggerStart", "target-own/physics/*")."""
    return any(fnmatch.fnmatchcase(path, pat) for pat in (later or ()))


def reference_views(a_self: dict | None, a_npc: dict | None, a_at: float,
                    b_self: dict | None, b_npc: dict | None, b_at: float,
                    npc: bool = False) -> dict[str, tuple[dict | None, float]]:
    """The four reference views from the two solo runs (the module's
    docstring): A, the player acting on a placed NPC; B, the NPC acting on
    the player. A figure's oracle is the player's own record of the same
    role (A's for the actor's figure, B's for the target's); with npc=True
    the NPC records stand in for the figures instead. A run not taken yet is
    passed as None and its views left out."""
    views: dict[str, tuple[dict | None, float]] = {}
    if a_self is not None or a_npc is not None:
        views["actor-own"] = (a_self, a_at)
        views["actor-figure" if not npc else "target-figure"] = (a_self if not npc else a_npc, a_at)
    if b_self is not None or b_npc is not None:
        views["target-own"] = (b_self, b_at)
        views["target-figure" if not npc else "actor-figure"] = (b_self if not npc else b_npc, b_at)
    return views


def _order(f: Finding) -> tuple:
    channel = f.key.split("/", 1)[0]
    return (VIEWS.index(f.view) if f.view in VIEWS else len(VIEWS), CHANNELS.index(channel) if channel in CHANNELS else len(CHANNELS), f.key, f.kind)


def diff(views: dict[str, tuple[dict | None, float]],
         references: dict[str, tuple[dict | None, float]],
         later: Iterable[str] = (),
         tolerances: dict | None = None) -> list[Finding]:
    """Each view of the run against the same view of the references. Both
    map a view (VIEWS) to (record, the action's ms in that record's watch); a
    view the references lack is not compared (a reference not yet taken).
    Findings come sorted: by view, then channel (CHANNELS), then key."""
    later = list(later or ())
    findings: list[Finding] = []
    for view in VIEWS:
        if view not in references or view not in views:
            continue
        ref_record, ref_at = references[view]
        run_record, run_at = views[view]
        ref = consequences(ref_record, ref_at, tolerances)
        run = consequences(run_record, run_at, tolerances)
        # the bools watch-start named: only those both watches sampled
        named = set(((ref_record or {}).get("bools") or {}).keys()) & set(((run_record or {}).get("bools") or {}).keys())
        for side in (ref, run):
            for key in [k for k in side if k.startswith("bools/") and k[6:].split("=", 1)[0] not in named]:
                del side[key]
        for key in ref.keys() - run.keys():
            f = Finding(view, "missing", key, ref[key], _observed(run_record, run_at, key))
            if not matches_later(f.path, later):
                findings.append(f)
        for key in run.keys() - ref.keys():
            f = Finding(view, "extra", key, _observed(ref_record, ref_at, key), run[key])
            if not matches_later(f.path, later):
                findings.append(f)
        # how many: a key both sides show, the run fewer times (ADR-033)
        ref_n, run_n = counts(ref_record, ref_at), counts(run_record, run_at)
        for key in ref.keys() & run.keys():
            if key.split("/", 1)[0] not in COUNTED:
                continue
            m, n = ref_n.get(key, 0), run_n.get(key, 0)
            if n < m:
                f = Finding(view, "missing", key, f"{m} times", f"{n} times", count=(n, m))
                if not (matches_later(f.path, later) or matches_later(f.path + "#count", later)):
                    findings.append(f)
    return sorted(findings, key=_order)
