"""Scenario files (lab/scenarios/*.yaml). The step notation is one key per
step: `<client>: <verb> {flow mapping}`, `wait: <seconds>`, `assert: [...]`,
`until: {within: <seconds>, expect: [...], every: <seconds>}` (the
expressions polled until they hold or `within` passes; `every` defaults to a
second), `server: restart`. A bare `verb {a: 1}` value is not valid YAML (the colon
inside the braces ends the plain scalar), so the loader quotes such values
before parsing; a quoted form in the file is accepted as well."""

from __future__ import annotations

import re
from typing import Any, Literal

import yaml
from pydantic import BaseModel, Field, field_validator

# Verbs the client executes (lab-driver) and verbs lab-api sends to the
# server's command endpoint (CONTRACT.md). Screenshot is special: guest exec on
# a managed guest, a client verb on an unmanaged one.
# craft: lab-driver reproduces the crafting menu's inventory effect at a station
# (UNCONFIRMED until a lab run); lab-api resolves the recipe name to its form id.
CLIENT_ACTIONS = {"connect", "reconnect", "move", "equip", "cast", "activate", "draw-weapon", "anim-event", "figure-action", "repeat", "dump-state", "request-screenshot", "craft", "tap-key", "hold-key", "close-menu", "set-gmst", "set-av", "watch-start", "watch-stop", "markers", "known", "favorite", "favorites", "held", "globals", "race-pick", "settings", "racemenu", "racemenu-save", "racemenu-load", "racemenu-scale", "racemenu-drop", "body-morph", "node-scale", "head-parts", "global", "weather", "av-table", "av-names", "av-call", "av-read", "advance-skill", "skills", "plugins", "console", "projectiles", "graph-vars", "graph-float", "voice", "poisons", "arrows", "look", "solo-start", "place-npc", "npc-ai", "npc-state", "play-idle", "combat-spell", "start-combat", "papyrus-events"}
# Server-side verbs (rung R0) go to the labCommand RPC; CONTRACT.md lists them.
SERVER_ACTIONS = {"teleport", "give", "set-appearance", "open-race-menu", "set-percentages", "kill", "respawn", "papyrus-av", "staff-rank", "learn-spell"}
SPECIAL_ACTIONS = {"screenshot", "relaunch", "frida", "mouse"}
# fakeclient: the fork's headless legacy client logs in as a scenario client's
# profile from inside the server image (T2 without a Windows client).
SERVER_STEP_ACTIONS = {"restart", "fakeclient"}
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


_GAME_PATH = re.compile(r"^[A-Za-z0-9 _.\-]+(?:[/\\][A-Za-z0-9 _.\-]+)*$")
_BARE = re.compile(r"^[A-Za-z0-9 _.\-]+$")


def _relaunch_args(args: dict[str, Any]) -> dict[str, Any]:
    """relaunch {files?}: the seat's game quit and started again, with `files` changed in the run's game folder
    while it is stopped, since a DLL and an ini load at a launch (the essentials layer's FSMP off and vsync off
    readings, 2026-10-19). Each entry is {rename: <path in the game folder>, to: <new file name beside it>} or
    {ini: <path of an .ini>, section, key, value}, which sets a key the file already has. Paths are relative,
    without '..'; the next run's rollback restores the clone."""
    unknown = sorted(set(args) - {"files"})
    if unknown:
        raise ValueError(f"relaunch takes files, not {unknown}")
    files = args.get("files")
    if files is None:
        return {}
    if not isinstance(files, list) or not 1 <= len(files) <= 8:
        raise ValueError("relaunch's files is a list of one to eight changes")
    out = []
    for f in files:
        if not isinstance(f, dict):
            raise ValueError("a relaunch file change is a mapping")
        path = f.get("rename", f.get("ini"))
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
        else:
            raise ValueError(f"a relaunch file change is {{rename, to}} or {{ini, section, key, value}}, not {sorted(f)}")
    return {"files": out}


# the driver steps a playtest may send one seat outside a run (lab-api's playtest-step): input and its
# rhythm, and reads that change nothing (a node's scale, the state, the voice, the projectiles nearby), never
# a console line (a seat's setup is the server's, Eli 2026-10-13) nor a connect
PLAYTEST_READS = {"node-scale", "dump-state", "head-parts", "voice", "held", "known", "projectiles", "graph-vars", "skills"}
PLAYTEST_STEPS = REPEATABLE | {"repeat", "look"} | PLAYTEST_READS


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
    if action == "relaunch":
        args = _relaunch_args(args)
    return Step(kind="client", client=key, action=action, args=args)


def load_scenario(text: str) -> Scenario:
    data = yaml.safe_load(quote_flow_steps(text))
    if not isinstance(data, dict):
        raise ValueError("scenario must be a mapping")
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
    return Scenario(
        id=str(data["id"]),
        milestone=(str(data["milestone"]) if data.get("milestone") is not None else None),
        game=(str(data["game"]) if data.get("game") is not None else None),
        solo=bool(data.get("solo", False)),
        clients=clients,
        server=ServerSpec(snapshot=str(server.get("snapshot", "clean")), netem=(Netem(**server["netem"]) if server.get("netem") else None)),
        timeout_s=float(data.get("timeout_s", 600)),
        steps=steps,
        artifacts=artifacts,
        parity=parity,
    )
