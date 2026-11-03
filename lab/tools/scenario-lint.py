#!/usr/bin/env python3
"""scenario-lint.py: the parts of ADR-064 decision 3's two-seat contract a parser can check (the root-cause plan after
playtest 41, W4; docs/research/root-cause-plan-2026-11-02.md).

Every gate scenario is read with lab-api's own parser (lab/labapi/labapi/scenario.py), so the lint sees the steps and
claims a run would. It refuses:
  1. a claim that cannot fail: a count (log_count, count, len) compared >= 0 or > a negative number, alone, chained,
     or as an operand that makes an `or` always true (the gate audit's 14 literal `>= 0` reads, 2026-11-02);
  2. a relaunch that lays a premise the deploy lacks: in skymp5-client-settings.txt a switch the client reads as on
     unless false may take either value (false is the mutation run's lever) and the lab's plumbing keys pass; any
     other key, and any ini or rename change, is a world play never has (activationUnblockedBases laid the spike
     wall's key in three scenarios and never in play). BASELINE holds the three until ADR-062's slice 3 retires the key;
  3. a verb doc whose T3 box is ticked while its "Two seats:" scenario is missing, has one seat, or leaves a seat
     with no claim read from its own game or no action of its own; "Two seats: none" passes with its reason (state
     no other seat sees, the fresh reviewer's to doubt), and DOCS_BASELINE holds the ten docs ticked before VERB.md
     gained the line (2026-11-02), each checked once it names a scenario.
Not checked here: NPC damage on a player outside god mode needs the verb doc to declare that effect; the fresh
reviewer holds it until then (ADR-064 decision 4).
Usage: scenario-lint.py [scenario.yaml ...]; with no paths, lab/scenarios/*.yaml and docs/verbs. Exit 1 and one
line per refusal, exit 0 and a count otherwise."""
import ast
import importlib.util
import re
import sys
import warnings
from pathlib import Path

# a claim's regex inside a Python string ('census Quest\.Start') is a SyntaxWarning to ast.parse, as in lab-api's own evaluator
warnings.simplefilter("ignore", SyntaxWarning)

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "lab" / "labapi"))
from labapi.scenario import load_scenario  # noqa: E402

_spec = importlib.util.spec_from_file_location("verb_lint", ROOT / "lab" / "tools" / "verb-lint.py")
verb_lint = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(verb_lint)

COUNTS = {"log_count", "count", "len"}
CLIENT_SETTINGS = "Data/Platform/Plugins/skymp5-client-settings.txt"
# the client's switches, each read as on unless false (fork parity: hostService.ts:36, puppetService.ts:39,
# propService.ts:1085)
SWITCHES = {"cellHost", "npcPuppet", "propPhysics"}
# which server a seat talks to and as whom (b-npc-loot's offline seat; npc-puppet's landing hang, 2026-10-21)
PLUMBING = {"server-port", "gameData.profileId"}
# (scenario id, key): premises already committed, each with the change that retires it
BASELINE = {
    ("b-bleak-traps", "activationUnblockedBases"): "ADR-062 slice 3",
    ("b-object-anim", "activationUnblockedBases"): "ADR-062 slice 3",
    ("b-puzzle-relay", "activationUnblockedBases"): "ADR-062 slice 3",
}
# verb docs whose T3 box was ticked before VERB.md's "Two seats:" line (2026-11-02)
DOCS_BASELINE = {"character-creation", "console-commands", "favorites", "hostility-sync", "learned-effects",
                 "light-plugins", "map-markers", "movement-speed", "sleep", "sneak-damage"}
# a seat's steps that set the stage or read it rather than play the verb
NOT_ACTING = {"connect", "disconnect", "relaunch", "teleport", "screenshot", "log-count", "papyrus-log", "frida"}
SCENARIO_ID = re.compile(r"\b([abcdx]-[a-z0-9-]+[a-z0-9])\b")


def _is_count(node: ast.AST) -> bool:
    if not isinstance(node, ast.Call):
        return False
    f = node.func
    return (isinstance(f, ast.Attribute) and f.attr in COUNTS) or (isinstance(f, ast.Name) and f.id in COUNTS)


def _number(node: ast.AST) -> float | None:
    if isinstance(node, ast.Constant) and isinstance(node.value, (int, float)) and not isinstance(node.value, bool):
        return float(node.value)
    if isinstance(node, ast.UnaryOp) and isinstance(node.op, ast.USub):
        n = _number(node.operand)
        return -n if n is not None else None
    return None


def _pair_always_true(left: ast.AST, op: ast.cmpop, right: ast.AST) -> bool:
    """A count against a constant that every count satisfies (a count is never negative)."""
    if _is_count(left) and (c := _number(right)) is not None:
        return (isinstance(op, ast.GtE) and c <= 0) or (isinstance(op, ast.Gt) and c < 0) or (isinstance(op, ast.NotEq) and c < 0)
    if _is_count(right) and (c := _number(left)) is not None:
        return (isinstance(op, ast.LtE) and c <= 0) or (isinstance(op, ast.Lt) and c < 0) or (isinstance(op, ast.NotEq) and c < 0)
    return False


def always_true(node: ast.AST) -> bool:
    if isinstance(node, ast.Expression):
        return always_true(node.body)
    if isinstance(node, ast.Compare):
        sides = [node.left, *node.comparators]
        return all(_pair_always_true(sides[i], op, sides[i + 1]) for i, op in enumerate(node.ops))
    if isinstance(node, ast.BoolOp):
        parts = [always_true(v) for v in node.values]
        return any(parts) if isinstance(node.op, ast.Or) else all(parts)
    return False


def claims(sc) -> list[str]:
    return [a for s in sc.steps if s.kind in ("assert", "until") for a in s.assertions]


def claim_seats(expr: str, seats: list[str]) -> set[str]:
    """The seats a claim reads from their own game: a name at the root of the claim's call chain (c2.view(c1), c2.ref(..))."""
    try:
        tree = ast.parse(expr.strip(), mode="eval")
    except SyntaxError:
        return set()
    out = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Attribute) and isinstance(node.value, ast.Name) and node.value.id in seats:
            out.add(node.value.id)
    return out


def lint_scenario(path: Path) -> list[str]:
    try:
        sc = load_scenario(path.read_text(encoding="utf-8"))
    except Exception as e:  # the parser's refusal is a run's refusal too
        return [f"{path}: does not parse: {e}"]
    out = []
    for expr in claims(sc):
        try:
            tree = ast.parse(expr.strip(), mode="eval")
        except SyntaxError as e:
            out.append(f"{path}: claim does not parse ({e.msg}): {expr}")
            continue
        if always_true(tree):
            out.append(f"{path}: claim cannot fail (a count is never negative): {expr}")
    for s in sc.steps:
        if s.kind != "client" or s.action != "relaunch":
            continue
        for f in s.args.get("files", []):
            if "json" in f and f["json"].replace("\\", "/") == CLIENT_SETTINGS:
                key = f["key"]
                if (key in SWITCHES and isinstance(f["value"], bool)) or key in PLUMBING or (sc.id, key) in BASELINE:
                    continue
                out.append(f"{path}: {s.client}'s relaunch sets {key!r}, a premise the deploy lacks (a switch takes "
                           "true or false; anything else plays a world play never has)")
            else:
                what = "rename" if "rename" in f else "ini" if "ini" in f else "json"
                out.append(f"{path}: {s.client}'s relaunch changes {f[what]!r} ({what}), a premise the deploy lacks")
    return out


def two_seat_scenario(doc: Path) -> str | None:
    """The first "Two seats:" line's scenario id, "none" when it says none and why, "" when it names neither."""
    for line in doc.read_text(encoding="utf-8").splitlines():
        if line.startswith("Two seats:"):
            rest = line[len("Two seats:"):].strip()
            if re.match(r"none\b\W*\w", rest, re.IGNORECASE):
                return "none"
            m = SCENARIO_ID.search(rest)
            return m.group(1) if m else ""
    return None


def lint_two_seats(doc: Path, scenarios: Path) -> list[str]:
    lines = doc.read_text(encoding="utf-8").splitlines()
    box = verb_lint.t3_box(lines)
    if not box or not box[1]:
        return []
    name = two_seat_scenario(doc)
    if name == "none" or (name is None and doc.stem in DOCS_BASELINE):
        return []
    if not name:
        return [f"{doc}: T3 ticked with no \"Two seats:\" scenario named (or none, with the reason)"]
    path = scenarios / f"{name}.yaml"
    if not path.is_file():
        return [f"{doc}: T3 ticked and its two-seat scenario {name} is not committed"]
    sc = load_scenario(path.read_text(encoding="utf-8"))
    if len(sc.clients) < 2:
        return [f"{doc}: T3 ticked and its two-seat scenario {name} has {len(sc.clients)} seat(s)"]
    read = set().union(*(claim_seats(e, sc.clients) for e in claims(sc)))
    acting = {s.client for s in sc.steps if s.kind == "client" and s.action not in NOT_ACTING}
    out = []
    for seat in sc.clients:
        if seat not in read:
            out.append(f"{doc}: two-seat scenario {name} claims nothing from {seat}'s own game")
        if seat not in acting:
            out.append(f"{doc}: two-seat scenario {name} gives {seat} no action of its own")
    return out


def main(argv: list[str]) -> int:
    paths = [Path(a) for a in argv] or sorted((ROOT / "lab" / "scenarios").glob("*.yaml"))
    bad = [line for p in paths for line in lint_scenario(p)]
    if not argv:
        bad += [line for d in sorted((ROOT / "docs" / "verbs").glob("*.md")) for line in lint_two_seats(d, ROOT / "lab" / "scenarios")]
    for line in bad:
        print(line)
    if bad:
        return 1
    print(f"{len(paths)} scenario(s) hold the two-seat contract's parsed rules")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
