#!/usr/bin/env python3
"""ledger.py: regenerate docs/NATIVES.md, the honest list of what server-side
Papyrus can do, from the fork's sources.

Universe: every native Skyrim Platform's codegen dump knows
(skyrim-platform/src/platform_se/codegen/convert-files/FunctionsDump.txt),
which is the set of natives a script mod may call. Status per native:

  implemented   registered on the server VM with a real body
                (script_classes/*.cpp, AddStatic or AddMethod)
  delegated     registered, and the body forwards the call to a client as an
                SpSnippet (rung R2 by construction; the client executes it)
  stub          registered, and the body only returns None
  gamemode      registered from JavaScript by skymp5-functions-lib
                (mp.registerPapyrusFunction); overrides a C++ registration of
                the same name at runtime, and only exists when the gamemode
                is built
  missing       in the dump, not registered anywhere: a script calling it
                fails on the server

Natives registered on the server but absent from the dump (Skymp.*, and any
gamemode extras) are listed too, marked "(not in SP dump)".

The Rung, Reason / notes, and Verb columns are hand-maintained: they are read
from the existing docs/NATIVES.md by native name and written back unchanged.
Regeneration never loses a hand-written cell.

Usage: ledger.py <skymp-dir> <NATIVES.md> [--dry-run]
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from dataclasses import dataclass, field
from pathlib import Path

DUMP = Path("skyrim-platform/src/platform_se/codegen/convert-files/FunctionsDump.txt")
CLASSES = Path("skymp5-server/cpp/server_guest_lib/script_classes")
FUNCTIONS_LIB = Path("skymp5-functions-lib/index.ts")

STATUSES = ("implemented", "delegated", "stub", "gamemode", "missing")


@dataclass
class Native:
    cls: str
    name: str
    kind: str  # "global" or "method"
    status: str
    in_dump: bool = True
    latent: bool = False
    source: str = ""  # file:line of the registration, or the JS line
    note: str = ""  # generated note (never overwrites the hand column)

    @property
    def key(self) -> str:
        return f"{self.cls}.{self.name}"


@dataclass
class Hand:
    rung: str = ""
    reason: str = ""
    verb: str = ""


# --- universe ------------------------------------------------------------------

def load_dump(skymp: Path) -> dict[str, Native]:
    data = json.loads((skymp / DUMP).read_text(encoding="utf-8"))
    out: dict[str, Native] = {}
    for cls, body in data["types"].items():
        for f in body.get("globalFunctions", []):
            n = Native(cls, f["name"], "global", "missing", latent=bool(f.get("isLatent")))
            out[n.key] = n
        for f in body.get("memberFunctions", []):
            n = Native(cls, f["name"], "method", "missing", latent=bool(f.get("isLatent")))
            out[n.key] = n
    return out


# --- server registrations ------------------------------------------------------

_GETNAME = re.compile(r'GetName\s*\(\s*\)[^}]*?return\s+"(\w+)"', re.S)
_REG = re.compile(r'Add(Static|Method)\s*\(\s*vm\s*,\s*"(\w+)"\s*,\s*&(\w+)::(\w+)\s*\)', re.S)
_LINE_COMMENT = re.compile(r"//[^\n]*")
_BLOCK_COMMENT = re.compile(r"/\*.*?\*/", re.S)


_DERIVED = re.compile(r"class\s+(\w+)\s+final\s*:\s*public\s+(Papyrus\w+Base)\b")
_CTOR_NAME = re.compile(r"(\w+)::\1\s*\(\s*\)\s*:\s*(Papyrus\w+Base)\s*\(\s*\"(\w+)\"\s*\)")


def class_names(classes_dir: Path) -> dict[str, list[str]]:
    """C++ class name -> Papyrus class names it registers for.

    Plain classes answer GetName() with a literal in their header. Shared
    bases (PapyrusEffectBase, PapyrusLeveledBase) are instantiated once per
    Papyrus class with the name passed to their constructor by a derived
    class, so the base's registrations apply to every derived name."""
    names: dict[str, list[str]] = {}
    derived_of: dict[str, list[str]] = {}
    texts = {f: f.read_text(encoding="utf-8", errors="replace") for f in sorted(classes_dir.glob("*.h")) + sorted(classes_dir.glob("*.cpp"))}
    for f, text in texts.items():
        if f.suffix != ".h":
            continue
        m = _GETNAME.search(text)
        cm = re.search(r"class\s+(\w+)\s*(?:final\s*)?:\s*public\s+IPapyrusClass", text)
        if m and cm:
            names[cm.group(1)] = [m.group(1)]
        for d in _DERIVED.finditer(text):
            derived_of.setdefault(d.group(2), []).append(d.group(1))
    for text in texts.values():
        for c in _CTOR_NAME.finditer(text):
            derived, base, papyrus = c.group(1), c.group(2), c.group(3)
            names.setdefault(base, [])
            if papyrus not in names[base]:
                names[base].append(papyrus)
    for base, kids in derived_of.items():
        if base in names and names[base] == [base.removeprefix("Papyrus")] or base not in names:
            # a base whose GetName is a member variable: names come from constructors only
            names.setdefault(base, [])
    for base in list(names):
        if base in derived_of and names[base] and names[base][0] == base.removeprefix("Papyrus") and len(names[base]) > 1:
            names[base] = names[base][1:]
    return names


def strip_comments(text: str) -> str:
    return _LINE_COMMENT.sub("", _BLOCK_COMMENT.sub("", text))


def function_body(text: str, cpp_class: str, fn: str) -> str | None:
    """The `{...}` body of `VarValue Class::Fn(...)`, or None when not defined here."""
    m = re.search(r"VarValue\s+" + re.escape(cpp_class) + r"::" + re.escape(fn) + r"\s*\(", text)
    if not m:
        return None
    i = m.end()
    depth = 1
    while i < len(text) and depth:
        depth += {"(": 1, ")": -1}.get(text[i], 0)
        i += 1
    j = text.find("{", i)
    if j < 0:
        return None
    depth = 0
    k = j
    while k < len(text):
        c = text[k]
        if c == "{":
            depth += 1
        elif c == "}":
            depth -= 1
            if depth == 0:
                return text[j : k + 1]
        k += 1
    return None


def classify_body(body: str | None) -> tuple[str, str]:
    """(status, note) from a registered function's body."""
    if body is None:
        return "implemented", "body not located; registered"
    clean = strip_comments(body)
    if "ExecuteSpSnippetAndGetPromise" in clean or "SpSnippet(" in clean:
        return "delegated", ""
    flat = re.sub(r"\s+", " ", clean).strip()
    if flat in ("{ return VarValue::None(); }", "{ return VarValue(); }"):
        return "stub", "returns None"
    if re.search(r"not (yet )?implemented|not supported", clean, re.I):
        return "stub", "body says not implemented"
    return "implemented", ""


def server_registrations(skymp: Path) -> list[Native]:
    classes_dir = skymp / CLASSES
    names = class_names(classes_dir)
    found: list[Native] = []
    for cpp in sorted(classes_dir.glob("*.cpp")):
        text = cpp.read_text(encoding="utf-8", errors="replace")
        for m in _REG.finditer(text):
            kind = "global" if m.group(1) == "Static" else "method"
            pap, cpp_class, fn = m.group(2), m.group(3), m.group(4)
            line = text.count("\n", 0, m.start()) + 1
            status, note = classify_body(function_body(text, cpp_class, fn))
            for cls in names.get(cpp_class) or [cpp_class.removeprefix("Papyrus")]:
                found.append(Native(cls, pap, kind, status, source=f"{cpp.relative_to(skymp)}:{line}", note=note))
    return found


_JS = re.compile(r"""registerPapyrusFunction\(\s*['"](global|method)['"]\s*,\s*['"](\w+)['"]\s*,\s*['"](\w+)['"]""")


def gamemode_registrations(skymp: Path) -> list[Native]:
    p = skymp / FUNCTIONS_LIB
    if not p.is_file():
        return []
    text = p.read_text(encoding="utf-8", errors="replace")
    out = []
    for m in _JS.finditer(text):
        line = text.count("\n", 0, m.start()) + 1
        out.append(Native(m.group(2), m.group(3), m.group(1), "gamemode", source=f"{FUNCTIONS_LIB}:{line}"))
    return out


# --- merge ---------------------------------------------------------------------

def build(skymp: Path) -> list[Native]:
    universe = load_dump(skymp)
    for n in server_registrations(skymp):
        u = universe.get(n.key)
        if u is None:
            n.in_dump = False
            universe[n.key] = n
        else:
            u.status, u.source, u.note = n.status, n.source, n.note
    for n in gamemode_registrations(skymp):
        u = universe.get(n.key)
        if u is None:
            n.in_dump = False
            universe[n.key] = n
        else:
            overridden = f"overrides the C++ {u.status} at {u.source}" if u.status != "missing" else ""
            u.status, u.source, u.note = "gamemode", n.source, overridden
    return sorted(universe.values(), key=lambda n: (n.cls.lower(), n.name.lower()))


# The bracketed note this generator appends to the Reason column; stripped
# when reading hand columns back so regeneration is idempotent.
_GENERATED_SUFFIX = re.compile(r"(?:\s*\[[^\]]*(?:\.cpp:\d+|\.ts:\d+|returns None|body not located|overrides the C\+\+)[^\]]*\])+\s*$")
_ROW = re.compile(r"^\|\s*`?([\w.]+)`?[^|]*\|\s*([^|]*)\|\s*([^|]*)\|\s*([^|]*)\|\s*([^|]*)\|\s*$")


def read_hand_columns(existing: Path) -> dict[str, Hand]:
    hand: dict[str, Hand] = {}
    if not existing.is_file():
        return hand
    for line in existing.read_text(encoding="utf-8").splitlines():
        m = _ROW.match(line)
        if not m:
            continue
        key, _status, rung, reason, verb = (g.strip() for g in m.groups())
        if key in ("Native", "(regenerate)") or set(key) <= {"-"}:
            continue
        reason = _GENERATED_SUFFIX.sub("", reason).strip()
        if rung or reason or verb:
            hand[key] = Hand(rung, reason, verb)
    return hand


def render(natives: list[Native], hand: dict[str, Hand], skymp_head: str) -> str:
    counts = {s: sum(1 for n in natives if n.status == s) for s in STATUSES}
    lines = [
        "# NATIVES ledger",
        "",
        f"Generated by `just ledger` (lab/ledger.py) from the fork at {skymp_head}; the",
        "Rung, Reason / notes, and Verb columns are hand-maintained and preserved",
        "across regeneration. This file is the honest answer to \"will script mod X",
        "work on the server\".",
        "",
        "Status meanings:",
        "- implemented: registered on the server VM with a real body (R0 unless the rung says otherwise).",
        "- delegated: forwarded to a client as an SpSnippet; result recorded. R2 by construction.",
        "- stub: registered, returns None. Every stub needs a reason and a verb, or a \"never\" with a reason.",
        "- gamemode: registered from JavaScript by skymp5-functions-lib; exists only when the gamemode is built.",
        "- missing: known to Skyrim Platform, not registered on the server; a script calling it fails.",
        "",
        "| Status | Count |",
        "| --- | --- |",
    ]
    lines += [f"| {s} | {counts[s]} |" for s in STATUSES]
    lines += [f"| total | {len(natives)} |", "", "| Native | Status | Rung | Reason / notes | Verb |", "| --- | --- | --- | --- | --- |"]
    for n in natives:
        h = hand.get(n.key, Hand())
        tags = [n.kind]
        if n.latent:
            tags.append("latent")
        if not n.in_dump:
            tags.append("not in SP dump")
        native_cell = f"`{n.key}` ({', '.join(tags)})"
        notes = h.reason
        gen = "; ".join(x for x in (n.note, n.source) if x)
        if gen:
            notes = f"{notes} [{gen}]" if notes else f"[{gen}]"
        lines.append(f"| {native_cell} | {n.status} | {h.rung} | {notes} | {h.verb} |")
    return "\n".join(lines) + "\n"


def git_head(skymp: Path) -> str:
    try:
        import subprocess

        return subprocess.check_output(["git", "-C", str(skymp), "rev-parse", "--short", "HEAD"], text=True, stderr=subprocess.DEVNULL).strip()
    except Exception:  # noqa: BLE001
        return "unknown"


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("skymp", type=Path)
    ap.add_argument("natives_md", type=Path)
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args(argv)
    if not (args.skymp / DUMP).is_file():
        print(f"E_LEDGER: {DUMP} not found under {args.skymp}", file=sys.stderr)
        return 1
    natives = build(args.skymp)
    hand = read_hand_columns(args.natives_md)
    text = render(natives, hand, git_head(args.skymp))
    if chr(0x2014) in text:
        print("E_LEDGER: em dash in output (rule 11)", file=sys.stderr)
        return 1
    if args.dry_run:
        sys.stdout.write(text)
    else:
        args.natives_md.write_text(text, encoding="utf-8")
    counts = {s: sum(1 for n in natives if n.status == s) for s in STATUSES}
    print("ledger:", ", ".join(f"{s} {c}" for s, c in counts.items()), f"(total {len(natives)}, hand rows kept {len(hand)})")
    return 0


if __name__ == "__main__":
    sys.exit(main())
