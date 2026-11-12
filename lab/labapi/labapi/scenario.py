"""Scenario files (lab/scenarios/*.yaml). The step notation is one key per
step: `<client>: <verb> {flow mapping}`, `wait: <seconds>`, `assert: [...]`,
`until: {within: <seconds>, expect: [...], every: <seconds>}` (the
expressions polled until they hold or `within` passes; `every` defaults to a
second), `server: restart`. A bare `verb {a: 1}` value is not valid YAML (the colon
inside the braces ends the plain scalar), so the loader quotes such values
before parsing; a quoted form in the file is accepted as well."""

from __future__ import annotations

import math
import re
from typing import Any, Literal

import yaml
from pydantic import BaseModel, Field, field_validator

# Verbs the client executes (lab-driver) and verbs lab-api sends to the
# server's command endpoint (CONTRACT.md). Screenshot is special: guest exec on
# a managed guest, a client verb on an unmanaged one.
# craft: lab-driver reproduces the crafting menu's inventory effect at a station
# (UNCONFIRMED until a lab run); lab-api resolves the recipe name to its form id.
CLIENT_ACTIONS = {"connect", "reconnect", "move", "equip", "cast", "activate", "node-rotation", "script-state", "face-keyframes", "quest-stage", "quest-objectives", "set-stage", "alias", "script-vars", "draw-weapon", "anim-event", "figure-action", "repeat", "dump-state", "request-screenshot", "craft", "tap-key", "hold-key", "close-menu", "set-gmst", "allow-save", "set-av", "watch-start", "watch-stop", "markers", "known", "add-perks", "favorite", "favorites", "held", "inventory", "transfer", "globals", "race-pick", "settings", "racemenu", "racemenu-save", "racemenu-load", "racemenu-scale", "racemenu-drop", "body-morph", "node-scale", "head-parts", "global", "factions", "weather", "av-table", "av-names", "av-call", "av-read", "advance-skill", "skills", "plugins", "console", "projectiles", "graph-vars", "graph-float", "voice", "poisons", "arrows", "refs-near", "look", "solo-start", "place-npc", "place-ref", "npc-ai", "npc-hold", "npc-kill", "npc-state", "look-at", "npc-damage", "figure-spells", "npc-puppet", "npc-pose", "cell-events-start", "cell-events-stop", "play-idle", "combat-spell", "start-combat", "stop-combat", "papyrus-events", "papyrus-log", "quit"}
# Server-side verbs (rung R0) go to the labCommand RPC; CONTRACT.md lists them.
SERVER_ACTIONS = {"teleport", "give", "set-appearance", "open-race-menu", "set-percentages", "kill", "respawn", "papyrus-av", "staff-rank", "learn-spell",
                  "kill-ref", "respawn-ref", "server-console"}
SPECIAL_ACTIONS = {"screenshot", "relaunch", "frida", "mouse", "approach", "log-count"}
# fakeclient: the fork's headless legacy client logs in as a scenario client's
# profile from inside the server image (T2 without a Windows client).
# snapshot {name, of}: a server fact read now and kept under its name for a
# later assert's snapshot("name") (docs/verbs/cell-host.md: the freeze, a
# hosted NPC's record that must not move once its cell is unhosted).
SERVER_STEP_ACTIONS = {"restart", "fakeclient", "snapshot", "netem", "log-count"}
_NETEM_KEYS = {"delay_ms", "jitter_ms", "loss_pct"}
_SNAPSHOT_NAME = re.compile(r"[A-Za-z][A-Za-z0-9_-]*")
KNOWN_ARTIFACTS = {"server.log", "screenshots", "world-diff", "pcap", "trace"}

_FLOW_STEP = re.compile(r"^(?P<lead>\s*-\s+[\w-]+:\s+)(?P<value>[\w-]+\s+\{.*\})\s*(?P<comment>#.*)?$")


def quote_flow_steps(text: str) -> str:
    """`- c1: teleport {cell: x, y: 0}` becomes `- c1: "teleport {cell: x, y: 0}"`."""
    out = []
    for line in text.splitlines():
        m = _FLOW_STEP.match(line)
        if m:
            value = m.group("value").replace('"', '\\"')
            comment = m.group("comment") or ""
            line = f'{m.group("lead")}"{value}"' + (f"  {comment}" if comment else "")
        out.append(line)
    return "\n".join(out) + "\n"


class Netem(BaseModel):
    delay_ms: float = 0
    jitter_ms: float = 0
    loss_pct: float = 0


class ServerSpec(BaseModel):
    snapshot: str = "clean"
    netem: Netem | None = None
    # a committed fixture world (lab/fixtures/worlds/<name>/) laid in place of the
    # snapshot's: ADR-043's rule-6 scenario, a world saved under another load order
    world: str | None = None
    # the run's own npcEnabled (ADR-035 point 9): an overlay on the version's
    # settings file for this run alone, so a creature cell loads; None keeps the file's
    npcEnabled: bool | None = None
    # the run's own game hour (docs/verbs/npc-puppet.md's b-npc-puppet): the
    # overlay's time block starts the server's clock at it when the run's
    # server starts (wire-rules clock.rs: epoch and start.hour); None keeps the file's
    gameHour: float | None = None
    # the run's own respawn hours (train-42's npcRespawnHours server setting, ScampServer.cpp: the lab's knob over the
    # master's GMST iHoursToRespawnCell, 240 in Skyrim.esm 1.6.1170), so a death's respawn falls inside a run after
    # a restart to a later hour; None keeps the file's
    npcRespawnHours: float | None = None
    # the run's own hand-off settle window in ms (m3-handoff-settle's handoffPassSettleMs server setting, 0 off):
    # a run at 0 tests the reliable placement alone, the fix's first half (the settle review, 2026-11-02); None
    # keeps the file's, and the server's own default, 1000 ms
    handoffPassSettleMs: int | None = None
    # the run's own NPC roll level (the npcRollLevel server setting, ScampServer.cpp, PartOne::FateRollLevel): a number
    # from 1 to 255 rolls every leveled list at that level for everyone, or the rule's word (loader, party-mean,
    # party-min); a level-1 seat sees one pick in each of the Temple's bandit and draugr lists, so a respawn never swaps
    # its pick (x-fate-dress-bleak v5, 2026-11-03); None keeps the file's, and the server's own default, party-mean
    npcRollLevel: int | str | None = None
    # the run's own world globals switch (the worldGlobals server setting, ScampServer.cpp, PartOne::SetWorldGlobalsEnabled:
    # ADR-068 rung 4's WorldGlobal 80): true elects a world streamer, whose game's global changes the server records and
    # serves (x-world-globals-rate, b-world-global); None keeps the file's, and the server's own default, false (nobody
    # elected, every game's globals its own), so the lab's settings stay off
    worldGlobals: bool | None = None
    # the run's own game clock rate (the time block's timeScale, wire-rules clock.rs: game seconds per real second, 20 in
    # Skyrim.esm): a raised rate brings a game-time timer inside a run (H-VT1: Sanguinare Vampiris turns its host three game
    # days on, 180 s at 1440). The clock is a pure function of its time block, so a new rate runs from the run's own epoch,
    # laid at the run's start from the file's start date, as gameHour's is, never over the time before it; a restart in
    # the run keeps that epoch (docs/research/rung5-quests-2026-11-09.md 8(b)). None keeps the file's
    timeScale: float | None = None
    # the run's own cure list (the cureSpells server setting, memo D56 A: the listed spells removed from every player's game
    # at login and every minute): "<hex id>:<plugin>" strings, [] lifting every cure, so a probe's seat can turn (D-T3 B,
    # Sanguinare Vampiris b8780:Skyrim.esm lifted per run until playtest 51 verifies a turn); each plugin as the run's load
    # order writes it, case for case, or the runner refuses the run (the server skips an unresolved cure silently). None
    # keeps the file's
    cureSpells: list[str] | None = None


class Step(BaseModel):
    kind: Literal["client", "wait", "assert", "until", "server"]
    client: str | None = None
    action: str | None = None
    args: dict[str, Any] = Field(default_factory=dict)
    # wait's seconds; until's cap (within)
    seconds: float | None = None
    # until's poll interval
    every: float | None = None
    assertions: list[str] = Field(default_factory=list)

    def describe(self) -> str:
        if self.kind == "client":
            return f"{self.client}: {self.action}" + (f" {self.args}" if self.args else "")
        if self.kind == "wait":
            return f"wait {self.seconds}"
        if self.kind == "assert":
            return f"assert x{len(self.assertions)}"
        if self.kind == "until":
            return f"until x{len(self.assertions)} within {self.seconds:g}s"
        return f"server: {self.action}"


class ParityCut(BaseModel):
    """Where each record's consequences start to count (ADR-031): the first
    mark of `kind` in that record's own watch (hit: the actor's first hit dealt,
    the target's first hit taken; cast: the first cast; event:<name>: the first
    event so named; value:<health|magicka|stamina>: the first reading of that
    value below its first by more than half a point), less lead_ms so the
    windup before it counts too. A list of kinds is tried in order per record,
    for an action whose views mark it differently: a spell's hit never reaches
    the target's own game (ADR-028: the server deals it, and that view's mark
    is its health falling), where the other three views show a hit
    (p-spell-bolt 20261015-070225). A marker, never a fixed time: the AI's and
    the relay's timing vary run to run."""
    kind: str | list[str] = "hit"
    lead_ms: float = 700.0


class ParitySpec(BaseModel):
    """A parity scenario's block (ADR-031): the action's reference traces
    (lab/references/<action>-a.json, the player acting on a placed NPC, and
    -b.json, the NPC acting on the player), which client acts and which is the
    target, the cut, the consequences a later slice takes (fnmatch globs over
    "<view>/<channel>/<name>", the Inventory's later rows and nothing else),
    and tolerances over parity.TOLERANCES."""
    action: str
    actor: str
    target: str
    cut: ParityCut = Field(default_factory=ParityCut)
    later: list[str] = Field(default_factory=list)
    tolerances: dict[str, float] = Field(default_factory=dict)


class Scenario(BaseModel):
    id: str
    milestone: str | None = None
    # The game version the run plays (ADR-022), when the scenario needs one:
    # a mod that loads on one build only. A run request's own version wins;
    # neither means lab-api's default.
    game: str | None = None
    # A solo run (ADR-031's reference traces): the clients' games start without
    # skymp5-client (their logon launcher asks GET /lab/game and moves the plugin
    # aside), so the engine alone plays the action on a committed save; nobody
    # logs in to the server, and a `connect` step is refused as meaningless.
    solo: bool = False
    # `client: rollback` (ADR-036): every seat of the run rolled back to its snapshot first, whatever the reset mode,
    # for a scenario that writes where a relaunch's cleaning never reaches or needs a fresh boot's image base
    client: Literal["rollback"] | None = None
    clients: list[str] = Field(default_factory=list)
    server: ServerSpec = Field(default_factory=ServerSpec)
    timeout_s: float = 600
    steps: list[Step] = Field(default_factory=list)
    artifacts: list[str] = Field(default_factory=list)
    parity: ParitySpec | None = None

    @field_validator("id")
    @classmethod
    def _id_shape(cls, v: str) -> str:
        if not re.fullmatch(r"[a-z0-9][a-z0-9-]*", v):
            raise ValueError("scenario id must be lowercase letters, digits, and dashes")
        return v


def _parse_action(value: Any) -> tuple[str, dict[str, Any]]:
    if isinstance(value, dict) and len(value) == 1:
        (verb, args), = value.items()
        return str(verb), dict(args or {})
    if not isinstance(value, str):
        raise ValueError(f"step value must be a string or a one-key mapping, got {type(value).__name__}")
    value = value.strip()
    if "{" in value:
        verb, _, flow = value.partition("{")
        args = yaml.safe_load("{" + flow)
        if not isinstance(args, dict):
            raise ValueError(f"step arguments must be a mapping: {value!r}")
        return verb.strip(), args
    return value, {}


# the client steps the driver performs at once, which repeat may perform again and again (lab/driver's REPEATABLE)
REPEATABLE = {"hold-key", "tap-key", "anim-event", "cast", "equip", "draw-weapon", "activate", "figure-action"}


def _repeat_args(args: dict[str, Any]) -> dict[str, Any]:
    """repeat {times, gapMs, step, seed?}: one client step performed `times` times (1 to 100) at a
    person's rhythm (ADR-033, a verb's sequence rows), the gap before each next one drawn from gapMs ([min,
    max] ms, or one number of ms; a hold-key's hold comes before its gap). `step` is one step as a scenario
    writes it ({hold-key: {code: 199, ms: 800}}, or the same as a string), of the actions the driver
    performs at once (REPEATABLE); `seed` gives the same gaps run to run. Normalized for the driver to
    {times, gapMs: [min, max], step: {action, args}, seed?}."""
    times = args.get("times")
    if isinstance(times, bool) or not isinstance(times, int) or not 1 <= times <= 100:
        raise ValueError("repeat's times is a whole number from 1 to 100")
    gap = args.get("gapMs", 0)
    gaps = gap if isinstance(gap, list) else [gap, gap]
    if (len(gaps) != 2 or any(isinstance(g, bool) or not isinstance(g, (int, float)) or not 0 <= g <= 60000 for g in gaps)
            or gaps[0] > gaps[1]):
        raise ValueError("repeat's gapMs is a number of ms or [min, max], each 0 to 60000, min first")
    if args.get("step") is None:
        raise ValueError("repeat needs its step: {hold-key: {code, ms}} and the like")
    action, inner = _parse_action(args["step"])
    if action not in REPEATABLE:
        raise ValueError(f"repeat's step is one of {sorted(REPEATABLE)}, got {action!r}")
    out: dict[str, Any] = {"times": times, "gapMs": [float(gaps[0]), float(gaps[1])], "step": {"action": action, "args": inner}}
    if "seed" in args:
        out["seed"] = int(args["seed"])
    return out


def _mouse_args(args: dict[str, Any]) -> dict[str, Any]:
    """mouse {dx, dy, steps?, ms?, wake?}: a relative mouse move in the seat's own desktop session, the way a
    player's hand turns the view (dy > 0 looks down): what the driver's look cannot do to a first-person
    pitch (x-rune-cast 20261019-032920 aimed level and its rune fizzled). dx and dy are pixels, from -10000
    to 10000; the move goes as `steps` equal parts (1 to 200, default 8) `ms` apart (0 to 1000, default 16).
    `wake` (0 to 2000 px, default 0) first moves the view that far down and back: an idle seat's camera is
    in vanity mode, and the first input only leaves it (c1, 2026-10-18 22:08)."""
    out: dict[str, Any] = {}
    for k, lo, hi, default in (("dx", -10000, 10000, 0), ("dy", -10000, 10000, 0), ("steps", 1, 200, 8), ("ms", 0, 1000, 16), ("wake", 0, 2000, 0)):
        v = args.get(k, default)
        if isinstance(v, bool) or not isinstance(v, int) or not lo <= v <= hi:
            raise ValueError(f"mouse's {k} is a whole number from {lo} to {hi}")
        out[k] = v
    unknown = sorted(set(args) - set(out))
    if unknown:
        raise ValueError(f"mouse takes dx, dy, steps, ms and wake, not {unknown}")
    if out["dx"] == 0 and out["dy"] == 0:
        raise ValueError("mouse needs a dx or a dy")
    if (out["steps"] - 1) * out["ms"] > 5000:
        raise ValueError("mouse's steps and ms spread one move over at most 5 s")
    return out



def _screenshot_args(args: dict[str, Any]) -> dict[str, Any]:
    """screenshot {count?, intervalMs?}: without arguments one shot of the seat's screen, as always; with `count`
    (2 to 120) a burst of that many frames `intervalMs` apart (100 to 5000, default 500), filmed in the seat's
    desktop session by one exec and read back after it as NNN-<client>-<k>.png beside NNN-<client>-burst.json,
    each frame's offset (burst.py): an animation's frames at its own rate, where one plain shot takes 2 to 3 s
    (x-npc-legs 20261022-190831's walks lasted 1 to 3 s). A burst spans at most 60 s."""
    if not args:
        return {}
    if "count" not in args:
        raise ValueError("a screenshot burst names its count (2 to 120)")
    out: dict[str, Any] = {}
    for k, lo, hi, default in (("count", 2, 120, None), ("intervalMs", 100, 5000, 500)):
        v = args.get(k, default)
        if isinstance(v, bool) or not isinstance(v, int) or not lo <= v <= hi:
            raise ValueError(f"screenshot's {k} is a whole number from {lo} to {hi}")
        out[k] = v
    unknown = sorted(set(args) - set(out))
    if unknown:
        raise ValueError(f"screenshot takes count and intervalMs, not {unknown}")
    if (out["count"] - 1) * out["intervalMs"] > 60000:
        raise ValueError("a screenshot burst spans at most 60 s: (count - 1) x intervalMs")
    return out


def _log_count_args(args: dict[str, Any]) -> dict[str, Any]:
    """log-count {pattern}: how many lines of the seat's Skyrim Platform log and its console log (lab-driver's tee:
    every printConsole, logTrace and logError line) match the regex, read mid-run (the logs copied through the guest
    agent as the run's artifacts copy them), for c.log_count("<pattern>")."""
    if set(args) != {"pattern"} or not isinstance(args.get("pattern"), str) or not args["pattern"]:
        raise ValueError("log-count takes one pattern, a regular expression")
    try:
        re.compile(args["pattern"])
    except re.error as e:
        raise ValueError(f"log-count's pattern is not a regular expression: {e}") from e
    return dict(args)


def _ref_command_args(action: str, args: dict[str, Any], clients: list[str]) -> dict[str, Any]:
    """kill-ref {formId, killer?} and respawn-ref {formId, inPlace?}: a game-file actor killed by the server (the
    console verb's Kill, as the seat's console; `killer` a client of the scenario, whose actor is the killer) or put up
    again at once, by form id (npc-fate's death reads). Without inPlace the respawn is the fate's own (the server's
    respawnFated property: RespawnFated, the teleporting respawn at its placement, rolled anew, the death-state container
    with tTeleport, the sweep's wire); with inPlace it stands where it fell (isDead false, no teleport). On a server
    without the property the gamemode falls back to the old shape (locationalData then isDead false, a bare teleport and
    a container WITHOUT tTeleport) and says so in its reply (2026-11-03)."""
    allowed = {"formId", "killer"} if action == "kill-ref" else {"formId", "inPlace"}
    unknown = sorted(set(args) - allowed)
    if unknown:
        raise ValueError(f"{action} takes {', '.join(sorted(allowed))}, not {unknown}")
    fid = args.get("formId")
    if isinstance(fid, bool) or not isinstance(fid, int) or fid <= 0:
        raise ValueError(f"{action}'s formId is a form id, got {fid!r}")
    if "killer" in args and args["killer"] not in clients:
        raise ValueError(f"kill-ref's killer is a client of the scenario {clients}, got {args['killer']!r}")
    if "inPlace" in args and not isinstance(args["inPlace"], bool):
        raise ValueError(f"respawn-ref's inPlace is true or false, got {args['inPlace']!r}")
    return dict(args)


def _script_state_args(args: dict[str, Any]) -> dict[str, Any]:
    """script-state {formId}: a reference's attached scripts as the seat's own VM holds them (lab-driver's call of
    TESModPlatform.SerializeScriptState, the script record's read: ADR-068 rung 3, docs/research/rung3-script-record-2026-11-06.md
    1(a) and 1(e)), each script's state and positional variables, the record's FNV-1a 32 and whether no stack runs on the
    object, kept per seat and per reference for c.script_state(<id>[, "<type>"]). The form id is a hex literal (0xaa8cb);
    without one the driver answers an error the run would take as a pass, as a bare inventory did."""
    unknown = sorted(set(args) - {"formId"})
    if unknown:
        raise ValueError(f"script-state takes formId, not {unknown}")
    fid = args.get("formId")
    if isinstance(fid, bool) or not isinstance(fid, int) or not 0 < fid <= 0xFFFFFFFF:
        raise ValueError(f"script-state's formId is a reference's form id (0xaa8cb), got {fid!r}")
    return dict(args)


def _form_or_desc(v: Any) -> bool:
    """A form id (a whole number above 0, a hex literal in the file) or a FormDesc or table name the runner resolves."""
    return (isinstance(v, int) and not isinstance(v, bool) and 0 < v <= 0xFFFFFFFF) or (isinstance(v, str) and bool(v.strip()))


def _alias_args(args: dict[str, Any]) -> dict[str, Any]:
    """alias {quest, alias}: a quest's reference alias as the seat's own game holds it (lab-driver's Quest.GetAlias by the
    alias's id, then ReferenceAlias.GetReference and Alias.GetName: ADR-068 rung 4's AliasFill, docs/research/
    rung4-state-rows-2026-11-07.md 1(e)), kept per seat and per pair for c.alias(<quest>, <alias>).refr. The quest is a form id
    (0x39645) or a FormDesc the runner resolves; the alias is the quest's own alias id, 0 to 0xFFFF (the wire's bound for
    AliasFill 79). Without both the driver answers an error the run would take as a pass, as a bare inventory did."""
    unknown = sorted(set(args) - {"quest", "alias"})
    if unknown:
        raise ValueError(f"alias takes quest and alias, not {unknown}")
    if not _form_or_desc(args.get("quest")):
        raise ValueError(f"alias's quest is a quest's form id (0x39645) or a FormDesc, got {args.get('quest')!r}")
    aid = args.get("alias")
    if isinstance(aid, bool) or not isinstance(aid, int) or not 0 <= aid <= 0xFFFF:
        raise ValueError(f"alias's alias is the quest's alias id, a whole number from 0 to 0xFFFF, got {aid!r}")
    return dict(args)


def _factions_args(args: dict[str, Any]) -> dict[str, Any]:
    """factions {formId, factions}: an actor's standing as the seat's own game holds it (lab-driver's Actor.GetFactionRank and
    IsInFaction for each named faction, and GetCrimeFaction: ADR-068 rung 4's standing rows, docs/research/
    rung4-state-rows-2026-11-07.md 1(e)), kept per seat and per actor for c.factions(<id>).rank(<faction>). The actor is a form
    id (a hex literal); the factions are one to 32 form ids or FormDescs, which the runner resolves."""
    unknown = sorted(set(args) - {"formId", "factions"})
    if unknown:
        raise ValueError(f"factions takes formId and factions, not {unknown}")
    fid = args.get("formId")
    if isinstance(fid, bool) or not isinstance(fid, int) or not 0 < fid <= 0xFFFFFFFF:
        raise ValueError(f"factions' formId is an actor's form id (0x39655), got {fid!r}")
    factions = args.get("factions")
    if not isinstance(factions, list) or not 1 <= len(factions) <= 32 or not all(_form_or_desc(f) for f in factions):
        raise ValueError(f"factions' factions is a list of one to 32 faction form ids or FormDescs, got {factions!r}")
    return dict(args)


def _script_vars_args(args: dict[str, Any]) -> dict[str, Any]:
    """script-vars {form, keys}: named variables of a quest's or a reference's attached scripts as the seat's own VM holds
    them (lab-driver's call of TESModPlatform.ReadScriptVariables, the world streamer's read for ScriptVariables 81: ADR-068
    rung 5, docs/research/rung5-quests-2026-11-09.md 1(c) and 1(e)), kept per seat and per form for
    c.script_vars(<form>).value("<script>::<var>"). The form is a form id (0xeafd5) or a FormDesc the runner resolves; each
    key names the attached script and the variable as a condition does, "<script>::<var>" split at its first "::"
    (PlayerVampireQuestScript::::VampireStatus_var: an auto property's backing variable keeps its own "::"), one to 32 of
    them (the native's answer stays one step's note)."""
    unknown = sorted(set(args) - {"form", "keys"})
    if unknown:
        raise ValueError(f"script-vars takes form and keys, not {unknown}")
    if not _form_or_desc(args.get("form")):
        raise ValueError(f"script-vars' form is a quest's or a reference's form id (0xeafd5) or a FormDesc, got {args.get('form')!r}")
    keys = args.get("keys")
    if not isinstance(keys, list) or not 1 <= len(keys) <= 32 or not all(
            isinstance(k, str) and "::" in k and all(part.strip() for part in k.split("::", 1)) for k in keys):
        raise ValueError(f'script-vars\' keys is a list of one to 32 "<script>::<var>" names, got {keys!r}')
    return dict(args)


def _quest_objectives_args(args: dict[str, Any]) -> dict[str, Any]:
    """quest-objectives {quest, objectives}: a quest's objectives as the seat's own game shows them (lab-driver's Papyrus
    Quest.IsObjectiveDisplayed and IsObjectiveCompleted: ADR-068 rung 5, docs/research/rung5-quests-2026-11-09.md 1(e); each
    seat's engine runs the fragment that shows them, R3 per seat), kept per seat and per quest for
    c.quest(<quest>).objectiveDisplayed(<i>). The quest is a form id (0x74a83) or a FormDesc the runner resolves; the
    objectives are one to 64 of the quest's objective indices, 0 to 0xFFFF."""
    unknown = sorted(set(args) - {"quest", "objectives"})
    if unknown:
        raise ValueError(f"quest-objectives takes quest and objectives, not {unknown}")
    if not _form_or_desc(args.get("quest")):
        raise ValueError(f"quest-objectives' quest is a quest's form id (0x74a83) or a FormDesc, got {args.get('quest')!r}")
    objectives = args.get("objectives")
    if not isinstance(objectives, list) or not 1 <= len(objectives) <= 64 or not all(
            isinstance(i, int) and not isinstance(i, bool) and 0 <= i <= 0xFFFF for i in objectives):
        raise ValueError(f"quest-objectives' objectives is a list of one to 64 objective indices from 0 to 0xFFFF, got {objectives!r}")
    return dict(args)


def _inventory_args(args: dict[str, Any]) -> dict[str, Any]:
    """inventory {ref}: a container's items as the seat's own game holds them, a chest's or a body's, by its reference's
    form id (or a FormDesc or a table name, which lab-api resolves before the driver sees it), for
    c.inventory(<ref>).count("<item>") beside the server's record, server.inventory(<ref>) (the root-cause plan's W4).
    Without a ref the driver answers an error the run would take as a pass, as a bare close-menu did."""
    unknown = sorted(set(args) - {"ref"})
    if unknown:
        raise ValueError(f"inventory takes ref, not {unknown}")
    ref = args.get("ref")
    if isinstance(ref, bool) or not ((isinstance(ref, int) and ref > 0) or (isinstance(ref, str) and ref.strip())):
        raise ValueError(f"inventory's ref is a reference's form id (0x371e9), a FormDesc or a table name, got {ref!r}")
    return dict(args)


def _transfer_args(args: dict[str, Any]) -> dict[str, Any]:
    """transfer {item, to | from, count?}: a store into a container or a take from it in the seat's own game without the
    menu's keys (the driver's Papyrus ObjectReference.RemoveItem with the other container: x-shared-chest-phantom,
    docs/engine/containers.md section 4), `count` (1 to 100, 1 when absent) of the form `item` from the player into the
    reference `to`, or from the reference `from` into the player. The item is a form id, a FormDesc or a table name; a
    reference is a form id or a FormDesc (a table name resolves to a base form, guests.py's base_id, which the driver
    refuses as no such ref); lab-api resolves each before the driver sees it. The driver fails the step (ok: false) on a
    missing item or reference, a source holding fewer than count, and counts that did not move by exactly count."""
    unknown = sorted(set(args) - {"item", "to", "from", "count"})
    if unknown:
        raise ValueError(f"transfer takes item, to or from, and count, not {unknown}")
    if "item" not in args:
        raise ValueError(f"transfer names its item (transfer {{item: 0x13790, to: 0x371e9}}), got {args!r}")
    if ("to" in args) == ("from" in args):
        raise ValueError("transfer takes one of to (a store from the player) and from (a take into the player), "
                         f"got {sorted(args)}")
    for key, what in (("item", "an item's form id (0x13790), a FormDesc or a table name"),
                      ("to", "a container reference's form id (0x371e9) or a FormDesc"),
                      ("from", "a container reference's form id (0x371e9) or a FormDesc")):
        v = args.get(key)
        if key in args and (isinstance(v, bool) or not ((isinstance(v, int) and v > 0) or (isinstance(v, str) and v.strip()))):
            raise ValueError(f"transfer's {key} is {what}, got {v!r}")
    count = args.get("count", 1)
    if isinstance(count, bool) or not isinstance(count, int) or not 1 <= count <= 100:
        raise ValueError(f"transfer's count is a whole number from 1 to 100, got {count!r}")
    return dict(args)


_CONSOLE_NAME = re.compile(r"[A-Za-z][A-Za-z0-9]*")


def _server_console_args(args: dict[str, Any]) -> dict[str, Any]:
    """server-console {name, args?}: a console command run on the server as the seat's player would type it (the
    gamemode's labCommand console, through mp.executeConsoleCommand; the playtest-console recipe's payload), never
    typed into the game. `PlaceAtMe` with [<the reference to place at, 0x14 the player itself>, <base>] puts a
    server-made actor down (a hostile at a protected resident, playtest 34's lab probe), `Disable` with [<a
    server-made reference>] takes one away; skymp5-server's ConsoleCommands.cpp table is what the server knows."""
    unknown = sorted(set(args) - {"name", "args"})
    if unknown:
        raise ValueError(f"server-console takes name and args, not {unknown}")
    name = args.get("name")
    if not isinstance(name, str) or not _CONSOLE_NAME.fullmatch(name):
        raise ValueError(f"server-console's name is a console command's name, got {name!r}")
    values = args.get("args", [])
    if not isinstance(values, list) or any(isinstance(v, bool) or not isinstance(v, (int, float, str)) for v in values):
        raise ValueError(f"server-console's args are a list of numbers and strings, got {values!r}")
    return {"name": name, "args": list(values)}


def _approach_args(args: dict[str, Any]) -> dict[str, Any]:
    """approach {formId, distance, cell, tolerance?}: the seat placed `distance` units (20 to 1000) from a named NPC
    and facing her, through the judged teleport (runner.py's _approach), so a key press acts on her by the player's
    own path; `cell` names the frame the target is written in ("3c:Skyrim.esm" for Tamriel's absolute units), or is
    `record`: the cell the server's record of her stands in (server.ref(formId).cell), read at the step, for a resident
    whose evening may take her through either of two doors (x-handoff-door: Alvor home once, to the inn twice)."""
    unknown = sorted(set(args) - {"formId", "distance", "cell", "tolerance"})
    if unknown:
        raise ValueError(f"approach takes formId, distance, cell and tolerance, not {unknown}")
    fid = args.get("formId")
    if isinstance(fid, bool) or not isinstance(fid, int) or fid <= 0:
        raise ValueError(f"approach's formId is a form id, got {fid!r}")
    d = args.get("distance")
    if isinstance(d, bool) or not isinstance(d, (int, float)) or not 20 <= d <= 1000:
        raise ValueError(f"approach's distance is a number of units from 20 to 1000, got {d!r}")
    if not isinstance(args.get("cell"), str) or not args["cell"]:
        raise ValueError('approach names the cell its target is written in ("3c:Skyrim.esm" for Tamriel)')
    return dict(args)

_GAME_PATH = re.compile(r"^[A-Za-z0-9 _.\-]+(?:[/\\][A-Za-z0-9 _.\-]+)*$")
_BARE = re.compile(r"^[A-Za-z0-9 _.\-]+$")
_JSON_KEY = re.compile(r"^[A-Za-z0-9_\-]+(?:\.[A-Za-z0-9_\-]+){0,3}$")


def _relaunch_args(args: dict[str, Any]) -> dict[str, Any]:
    """relaunch {files?}: the seat's game quit and started again, with `files` changed in the run's game folder
    while it is stopped, since a DLL and an ini load at a launch (the essentials layer's FSMP off and vsync off
    readings, 2026-10-19). Each entry is {rename: <path in the game folder>, to: <new file name beside it>},
    {ini: <path of an .ini>, section, key, value}, which sets a key the file already has, or {json: <path of a
    JSON file>, key, value}, which sets or adds a key, a dotted path naming one inside nested objects
    (skymp5-client-settings.txt's cellHost and npcPuppet switches, read once at the client's start, and
    gameData.profileId: npc-puppet's landing hang, 2026-10-21). Paths are relative, without '..'; the next
    run's rollback restores the clone."""
    unknown = sorted(set(args) - {"files", "until", "frida"})
    if unknown:
        raise ValueError(f"relaunch takes files, until and frida, not {unknown}")
    # until: gone returns once the player is off the server's online list, so a scenario can read the server
    # while that game is down (b-cell-host's unhosted window); a later connect waits for the new game's login.
    # until: stopped returns as soon as the guest agent has stopped the game, the server not yet told, so what
    # follows is timed from the kill itself (b-host-kill: the stale rule's pass inside the grace plus the
    # threshold, which gone's netcode timeout of about 18 s would hide). With neither files nor frida the kill is
    # the step's first act and the outgoing logs and the new game's start follow behind it (Runner._relaunch), so
    # a game stops mid-flight (x-prop-stall, E32); with either, the kill comes after the copies and the lever
    until = args.get("until")
    if until is not None and until not in ("gone", "stopped"):
        raise ValueError(f"relaunch's until is gone or stopped, not {until!r}")
    head: dict[str, Any] = {"until": until} if until else {}
    # frida: {script, params?}, the frida step's arguments: its watcher armed while the game is stopped, so it
    # takes the new game at its start and injects ahead of Skyrim Platform's engine (kDataLoaded, about 10 s in),
    # which a frida step after the relaunch misses (x-npc-napi-trace 20261022-071646 attached 1 s after the hang)
    frida = args.get("frida")
    if frida is not None:
        if not isinstance(frida, dict) or not set(frida) <= {"script", "params"} or "script" not in frida:
            raise ValueError("relaunch's frida is {script, params?}, as the frida step takes them")
        if not isinstance(frida["script"], str) or not _BARE.match(frida["script"]) or not frida["script"].endswith(".js"):
            raise ValueError(f"relaunch's frida script is a lab/frida file name ending .js, not {frida['script']!r}")
        if not isinstance(frida.get("params", {}), dict):
            raise ValueError("relaunch's frida params is a map")
        head["frida"] = dict(frida)
    files = args.get("files")
    if files is None:
        return head
    if not isinstance(files, list) or not 1 <= len(files) <= 8:
        raise ValueError("relaunch's files is a list of one to eight changes")
    out = []
    for f in files:
        if not isinstance(f, dict):
            raise ValueError("a relaunch file change is a mapping")
        path = f.get("rename", f.get("ini", f.get("json")))
        if not isinstance(path, str) or not _GAME_PATH.match(path) or ".." in path.replace("\\", "/").split("/"):
            raise ValueError(f"a relaunch file change names a relative path in the game folder, not {path!r}")
        if set(f) == {"rename", "to"}:
            if not isinstance(f["to"], str) or not _BARE.match(f["to"]) or f["to"] in (".", ".."):
                raise ValueError(f"rename's to is a bare file name, not {f['to']!r}")
            out.append({"rename": path, "to": f["to"]})
        elif set(f) == {"ini", "section", "key", "value"}:
            if not path.lower().endswith(".ini"):
                raise ValueError(f"ini names an .ini file, not {path!r}")
            for k in ("section", "key"):
                if not isinstance(f[k], str) or not _BARE.match(f[k]):
                    raise ValueError(f"ini's {k} is letters, digits, space, dot, dash or underscore, not {f[k]!r}")
            v = f["value"]
            v = str(v).lower() if isinstance(v, bool) else str(v)
            if any(c in v for c in "'\"`$\r\n"):
                raise ValueError(f"ini's value carries no quotes, backticks, dollar signs or line breaks: {v!r}")
            out.append({"ini": path, "section": f["section"], "key": f["key"], "value": v})
        elif set(f) == {"json", "key", "value"}:
            if not isinstance(f["key"], str) or not _JSON_KEY.match(f["key"]):
                raise ValueError("json's key is a name of letters, digits, dash or underscore, or up to four such names "
                                 f"joined by dots for a nested one, not {f['key']!r}")
            v = f["value"]
            if not isinstance(v, (bool, int, float, str)) or (isinstance(v, float) and not math.isfinite(v)):
                raise ValueError(f"json's value is a boolean, a number or a string, not {v!r}")
            if isinstance(v, str) and any(c in v for c in "'\"`$\r\n"):
                raise ValueError(f"json's value carries no quotes, backticks, dollar signs or line breaks: {v!r}")
            out.append({"json": path, "key": f["key"], "value": v})
        else:
            raise ValueError("a relaunch file change is {rename, to}, {ini, section, key, value} or {json, key, value}, "
                             f"not {sorted(f)}")
    return {**head, "files": out}


# the driver steps a playtest may send one seat outside a run (lab-api's playtest-step): input and its
# rhythm, and reads that change nothing (a node's scale, the state, the voice, the projectiles nearby, a global's
# value), never a console line (a seat's setup is the server's, Eli 2026-10-13) nor a connect
PLAYTEST_READS = {"node-scale", "node-rotation", "script-state", "face-keyframes", "dump-state", "head-parts", "voice", "held", "known", "projectiles", "graph-vars", "skills",
                  "refs-near", "npc-state", "globals", "quest-stage", "alias", "factions", "script-vars", "quest-objectives"}
# One lever on a world actor, for a live read Eli watches (playtest thirty's spinning wolves, 2026-10-21 16:5x, his
# yes to the experiment): npc-ai switches one actor's engine AI off and back on through lab-driver (Actor.EnableAI);
# start-combat and stop-combat open and end one named NPC's combat against that seat's player (Actor.StartCombat and
# StopCombat), playtest 35's "draw <name>" and "calm" on the host's seat, with its AI left running; set-stage sets one
# quest's stage in that seat's game as the quest's own script would (Quest.SetCurrentStageID), for a watched read of a
# shared quest's stage on the other seat (ADR-056, memo D55 B)
PLAYTEST_LEVERS = {"npc-ai", "start-combat", "stop-combat", "set-stage"}
PLAYTEST_STEPS = REPEATABLE | {"repeat", "look"} | PLAYTEST_READS | PLAYTEST_LEVERS


def playtest_step(value: Any) -> tuple[str, dict[str, Any]]:
    """One client step written as a scenario writes it ('equip {formId: 0x12fd0}', or {hold-key: {...}}),
    for a seat during a playtest (Eli, 2026-10-16: the lab casts on one seat while he staggers it from the
    other): (action, args) normalized as a scenario's would be, of PLAYTEST_STEPS only."""
    action, args = _parse_action(value)
    if action not in PLAYTEST_STEPS:
        raise ValueError(f"a playtest step is one of {sorted(PLAYTEST_STEPS)}, got {action!r}")
    if action == "repeat":
        args = _repeat_args(args)
    return action, args


def step_seconds(action: str, args: dict[str, Any], base: float) -> float:
    """How long the driver may take to answer a step: a repeat's repetitions with their holds and longest
    gaps (it answers once the last is done) and half a minute more, else `base`."""
    if action != "repeat":
        return base
    inner = args["step"]
    hold_ms = float(inner["args"].get("ms", 0)) if inner["action"] == "hold-key" else 0.0
    return max(base, args["times"] * (hold_ms + float(args["gapMs"][1])) / 1000.0 + 30.0)


def _seconds(value: Any) -> float | None:
    """A positive, finite number of seconds, or None."""
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return None
    return float(value) if 0 < value < float("inf") else None


def _until_step(value: Any) -> Step:
    """until: a condition a step waits for instead of a sleep sized for the
    slowest case (the process plan's B7, the judged teleport's shape): the
    expressions, as assert's, polled every `every` seconds until all hold,
    a failure past `within`."""
    usage = "until takes {within: <seconds>, expect: [expressions], every: <seconds>}"
    if not isinstance(value, dict):
        raise ValueError(usage)
    unknown = sorted(set(value) - {"within", "expect", "every"})
    if unknown:
        raise ValueError(f"{usage}, not {unknown}")
    exprs = value.get("expect")
    if not isinstance(exprs, list) or not exprs or not all(isinstance(x, str) for x in exprs):
        raise ValueError("until's expect is a list of expressions")
    within = _seconds(value.get("within"))
    if within is None:
        raise ValueError("until's within is a positive number of seconds")
    every = _seconds(value.get("every", 1.0))
    if every is None:
        raise ValueError("until's every is a positive number of seconds")
    return Step(kind="until", seconds=within, every=every, assertions=list(exprs))


def parse_step(raw: Any, clients: list[str]) -> Step:
    if not isinstance(raw, dict) or len(raw) != 1:
        raise ValueError(f"each step is a one-key mapping, got {raw!r}")
    (key, value), = raw.items()
    key = str(key)
    if key == "wait":
        return Step(kind="wait", seconds=float(value))
    if key == "assert":
        if not isinstance(value, list) or not all(isinstance(x, str) for x in value):
            raise ValueError("assert takes a list of expressions")
        return Step(kind="assert", assertions=list(value))
    if key == "until":
        return _until_step(value)
    if key == "server":
        action, args = _parse_action(value)
        if action not in SERVER_STEP_ACTIONS:
            raise ValueError(f"unknown server step {action!r}")
        if action == "snapshot":
            name, of = args.get("name"), args.get("of")
            if not isinstance(name, str) or not _SNAPSHOT_NAME.fullmatch(name):
                raise ValueError(f"snapshot takes a name (letters, digits, _ and -), got {name!r}")
            # a server fact, or a scenario seat's as the board holds it (the step before reads it: a seat's
            # log-count or npc-state), so a leg can claim a seat's count against its own baseline (the props
            # probe's owner lines, 2026-11-03)
            seats = tuple(f"{c}." for c in clients)
            if not isinstance(of, str) or not (of.strip().startswith("server.") or of.strip().startswith(seats)):
                raise ValueError(f"snapshot reads a server fact or a seat's (of: \"server....\" or \"c1....\"), got {of!r}")
        if action == "log-count":
            # the run's server log, its lines matching the regex, for server.log_count("<pattern>")
            args = _log_count_args(args)
        if action == "restart" and args:
            # the clock set anew at the restart (x-handoff-night: 23.0 before, 7.9 after), and a deliberate downtime in
            # seconds: the container stopped, held, started, so a claim about the world's clock running through a
            # restart has a downtime to see (b-magic-restart: the restart itself fell from 10.6 s to 0.85 s when the
            # server's process became node, 2026-11-01)
            if not set(args) <= {"gameHour", "downtime"}:
                raise ValueError(f"restart takes an optional gameHour from 0 to 24 and an optional downtime from 1 to 120 s, got {args}")
            hour = args.get("gameHour")
            if hour is not None and (isinstance(hour, bool) or not isinstance(hour, (int, float)) or not 0 <= hour < 24):
                raise ValueError(f"restart takes an optional gameHour from 0 to 24, got {args}")
            downtime = args.get("downtime")
            if downtime is not None and (isinstance(downtime, bool) or not isinstance(downtime, (int, float)) or not 1 <= downtime <= 120):
                raise ValueError(f"restart's downtime is 1 to 120 seconds, got {downtime!r}")
        if action == "netem":
            # a typo must not read as zero, which clears the impairment
            if not args or set(args) - _NETEM_KEYS:
                raise ValueError(f"netem takes {sorted(_NETEM_KEYS)} (all zero clears it), got {sorted(args)}")
            for k, v in args.items():
                if isinstance(v, bool) or not isinstance(v, (int, float)) or v < 0 or (k == "loss_pct" and v > 100):
                    raise ValueError(f"netem's {k} is a number from 0{' to 100' if k == 'loss_pct' else ''}, got {v!r}")
        return Step(kind="server", action=action, args=args)
    if key not in clients:
        raise ValueError(f"step names client {key!r}, which is not in clients {clients}")
    action, args = _parse_action(value)
    if action not in CLIENT_ACTIONS | SERVER_ACTIONS | SPECIAL_ACTIONS:
        raise ValueError(f"unknown client step {action!r} for {key}")
    if action == "repeat":
        args = _repeat_args(args)
    if action == "mouse":
        args = _mouse_args(args)
    if action == "screenshot":
        args = _screenshot_args(args)
    if action == "approach":
        args = _approach_args(args)
    if action in ("kill-ref", "respawn-ref"):
        args = _ref_command_args(action, args, clients)
    if action == "inventory":
        args = _inventory_args(args)
    if action == "script-state":
        args = _script_state_args(args)
    if action == "alias":
        args = _alias_args(args)
    if action == "script-vars":
        args = _script_vars_args(args)
    if action == "quest-objectives":
        args = _quest_objectives_args(args)
    if action == "factions":
        args = _factions_args(args)
    if action == "transfer":
        args = _transfer_args(args)
    if action == "server-console":
        args = _server_console_args(args)
    if action == "close-menu" and not (isinstance(args.get("name"), str) and args["name"].strip()):
        # the driver closes a menu by its engine name ({name: ContainerMenu}); without one it answers an error the
        # run would take as a pass and the menu stays open (x-body-release 20261025-234352: no closing activation)
        raise ValueError(f"close-menu takes the engine's menu name, {{name: ContainerMenu}}, got {args!r}")
    if action == "log-count":
        args = _log_count_args(args)
    if action == "relaunch":
        args = _relaunch_args(args)
    return Step(kind="client", client=key, action=action, args=args)


_WORLD_NAME = re.compile(r"[A-Za-z0-9][A-Za-z0-9._-]*")
# a FormDesc's text as the server's settings take it, "<hex id>:<plugin>" (FormDesc::FromString)
_FORM_DESC = re.compile(r"[0-9A-Fa-f]{1,8}:[^:]+\.(?:esm|esp|esl)", re.IGNORECASE)


def _server_spec(server: dict[str, Any]) -> ServerSpec:
    """`server: {snapshot | world, netem}`: a world is a committed fixture laid in
    place of a snapshot's, so a scenario names one source, never both."""
    netem = Netem(**server["netem"]) if server.get("netem") else None
    npc = server.get("npcEnabled")
    if npc is not None and not isinstance(npc, bool):
        raise ValueError(f"server.npcEnabled is true or false, got {npc!r}")
    hour = server.get("gameHour")
    if hour is not None and (isinstance(hour, bool) or not isinstance(hour, (int, float)) or not 0 <= hour < 24):
        raise ValueError(f"server.gameHour is an hour from 0 to under 24, got {hour!r}")
    hour = float(hour) if hour is not None else None
    respawn = server.get("npcRespawnHours")
    if respawn is not None and (isinstance(respawn, bool) or not isinstance(respawn, (int, float)) or not 0 < respawn <= 720):
        raise ValueError(f"server.npcRespawnHours is a number of game hours above 0 and up to 720, got {respawn!r}")
    respawn = float(respawn) if respawn is not None else None
    settle = server.get("handoffPassSettleMs")
    if settle is not None and (isinstance(settle, bool) or not isinstance(settle, int) or not 0 <= settle <= 60000):
        raise ValueError(f"server.handoffPassSettleMs is a whole number of ms from 0 (off) to 60000, got {settle!r}")
    roll = server.get("npcRollLevel")
    if roll is not None and not ((isinstance(roll, int) and not isinstance(roll, bool) and 1 <= roll <= 255)
                                 or roll in ("loader", "party-mean", "party-min")):
        raise ValueError(f"server.npcRollLevel is a level from 1 to 255 or one of loader, party-mean, party-min, got {roll!r}")
    world_globals = server.get("worldGlobals")
    if world_globals is not None and not isinstance(world_globals, bool):
        raise ValueError(f"server.worldGlobals is true or false, got {world_globals!r}")
    scale = server.get("timeScale")
    if scale is not None and (isinstance(scale, bool) or not isinstance(scale, (int, float)) or not 0 < scale <= 100000):
        raise ValueError(f"server.timeScale is the game seconds per real second, above 0 and up to 100000 (20 is Skyrim's), got {scale!r}")
    scale = float(scale) if scale is not None else None
    cures = server.get("cureSpells")
    if cures is not None and (not isinstance(cures, list) or len(cures) > 64
                              or not all(isinstance(c, str) and _FORM_DESC.fullmatch(c) for c in cures)):
        raise ValueError(f'server.cureSpells is a list of "<hex id>:<plugin>" strings ([] lifts every cure), got {cures!r}')
    knobs = dict(npcEnabled=npc, gameHour=hour, npcRespawnHours=respawn, handoffPassSettleMs=settle, npcRollLevel=roll,
                 worldGlobals=world_globals, timeScale=scale, cureSpells=list(cures) if cures is not None else None)
    world = server.get("world")
    if world is None:
        return ServerSpec(snapshot=str(server.get("snapshot", "clean")), netem=netem, **knobs)
    if "snapshot" in server:
        raise ValueError("server takes a snapshot or a world, not both")
    if not isinstance(world, str) or not _WORLD_NAME.fullmatch(world):
        raise ValueError(f"server.world names a directory under lab/fixtures/worlds, got {world!r}")
    return ServerSpec(world=world, netem=netem, **knobs)


# every top-level key load_scenario reads. Any other key was dropped without a word before 2026-11-03: a top-level `asserts:`
# block in x-change-census v2 (20261103-111808) and x-transplant-capture v1 (20261103-114726) was never evaluated, and both runs
# went green with their claims unread
SCENARIO_KEYS = frozenset({"id", "milestone", "game", "solo", "client", "clients", "server", "timeout_s", "steps", "artifacts", "parity"})


def load_scenario(text: str) -> Scenario:
    data = yaml.safe_load(quote_flow_steps(text))
    if not isinstance(data, dict):
        raise ValueError("scenario must be a mapping")
    unknown = sorted(str(k) for k in data if str(k) not in SCENARIO_KEYS)
    if unknown:
        raise ValueError(f"unknown top-level key(s) {', '.join(unknown)}: a claim is an `- assert:` step, and a scenario's keys are "
                         f"{', '.join(sorted(SCENARIO_KEYS))}")
    clients = [str(c) for c in data.get("clients", [])]
    steps = [parse_step(s, clients) for s in data.get("steps", [])]
    artifacts = [str(a) for a in data.get("artifacts", [])]
    server = data.get("server") or {}
    parity = None
    if data.get("parity") is not None:
        block = data["parity"]
        if not isinstance(block, dict):
            raise ValueError("parity must be a mapping: {action, actor, target, cut?, later?, tolerances?}")
        cut = block.get("cut") or {}
        parity = ParitySpec(action=str(block["action"]), actor=str(block["actor"]), target=str(block["target"]),
                            cut=ParityCut(**cut) if isinstance(cut, dict) else ParityCut(),
                            later=[str(x) for x in block.get("later") or []],
                            tolerances={str(k): float(v) for k, v in (block.get("tolerances") or {}).items()})
        for who in (parity.actor, parity.target):
            if who not in clients:
                raise ValueError(f"parity names {who!r}, which is not one of the scenario's clients")
        if parity.actor == parity.target:
            raise ValueError("parity's actor and target must be two clients")
    reset = data.get("client")
    if reset is not None and reset != "rollback":
        raise ValueError(f"client is rollback (its seats rolled back to their snapshots before the run, ADR-036), not {reset!r}")
    return Scenario(
        id=str(data["id"]),
        milestone=(str(data["milestone"]) if data.get("milestone") is not None else None),
        game=(str(data["game"]) if data.get("game") is not None else None),
        solo=bool(data.get("solo", False)),
        client=reset,
        clients=clients,
        server=_server_spec(server),
        timeout_s=float(data.get("timeout_s", 600)),
        steps=steps,
        artifacts=artifacts,
        parity=parity,
    )
