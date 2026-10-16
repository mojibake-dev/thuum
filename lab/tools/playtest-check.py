#!/usr/bin/env python3
"""playtest-check.py <n> [--scenarios]: every item of a playtest's checklist names its scenario (thuum
ADR-033, decision 2: for every item of a checklist there is a scenario that performs it the way the item
says, the gate runs them before the playtest, and the playtest then measures what the lab cannot).

The checklist is docs/private/playtest-m2-<n>.md in the main checkout (private, so read there even from a
worktree). An item is a line "- [ ]" or "- [x]" and the indented lines under it. It names its scenarios as
backticked ids, `b-cast-rhythm`, each one committed under lab/scenarios in this tree; an item the lab cannot
measure says so instead, "(feel)" or "(no scenario: why)", and is left to the person.

Prints each item that names nothing and says nothing, and each named id with no scenario file, then exits 1
if there was any; with --scenarios it prints the named ids instead, once each in the checklist's order, for
the gate before the playtest (`just playtest-gate <n>` runs them as one run set).
"""
from __future__ import annotations

import re
import subprocess
import sys
from pathlib import Path

ITEM = re.compile(r"^\s*- \[[ xX]\]\s*(.*)$")
SCENARIO_ID = re.compile(r"`([a-z][a-z0-9]*(?:-[a-z0-9]+)+)`")
EXEMPT = re.compile(r"\((?:feel|no scenario\b[^)]*)\)", re.I)


def items(text: str) -> list[tuple[int, str]]:
    """(line number, text) of each checklist item, the indented lines under it joined to it; a blank
    line, a heading, an unindented line or an indented bullet (a note under the item) ends it."""
    out: list[list] = []
    open_ = False
    for no, line in enumerate(text.splitlines(), 1):
        m = ITEM.match(line)
        if m:
            out.append([no, m.group(1)])
            open_ = True
        elif open_ and line.strip() and line[:1] in (" ", "\t") and not line.lstrip().startswith("- "):
            out[-1][1] += " " + line.strip()
        else:
            open_ = False
    return [(no, t) for no, t in out]


def check(text: str, scenarios_dir: Path) -> tuple[list[str], list[str]]:
    """The problems (empty when every item is covered) and the named ids in order, once each."""
    problems: list[str] = []
    named: list[str] = []
    for no, item in items(text):
        ids = SCENARIO_ID.findall(item)
        if not ids and not EXEMPT.search(item):
            problems.append(f"line {no}: no scenario named and no (feel) or (no scenario: why): {item[:90]}")
        for sid in ids:
            if not (scenarios_dir / f"{sid}.yaml").is_file():
                problems.append(f"line {no}: `{sid}` is not a committed scenario (lab/scenarios/{sid}.yaml)")
            elif sid not in named:
                named.append(sid)
    return problems, named


def main(argv: list[str]) -> int:
    if not argv or not argv[0].isdigit():
        print("usage: playtest-check.py <n> [--scenarios]", file=sys.stderr)
        return 2
    n = argv[0]
    here = Path(__file__).resolve().parents[2]
    common = subprocess.run(["git", "-C", str(here), "rev-parse", "--path-format=absolute", "--git-common-dir"],
                            capture_output=True, text=True, check=True).stdout.strip()
    checklist = Path(common).parent / "docs" / "private" / f"playtest-m2-{n}.md"
    if not checklist.is_file():
        print(f"no {checklist}", file=sys.stderr)
        return 2
    problems, named = check(checklist.read_text(), here / "lab" / "scenarios")
    if "--scenarios" in argv[1:]:
        if problems:
            print(f"playtest {n}'s checklist is not covered yet (just playtest-check {n})", file=sys.stderr)
            return 1
        print(" ".join(named))
        return 0
    for p in problems:
        print(p)
    total = len(items(checklist.read_text()))
    print(f"playtest {n}: {total} items, {len(named)} scenarios named, {len(problems)} problems")
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
