#!/usr/bin/env python3
"""verb-lint.py: a verb doc may not tick its T3 box over open engine claims (the root-cause plan after playtest 41,
W5; docs/research/root-cause-plan-2026-11-02.md).

A doc's Status box that starts "T3 scenario green" is the verdict that the verb's engine claims are settled. This
refuses that tick while the doc still holds open ones: the lines lab/status.py counts (HYPOTHESIS without a
CONFIRMED, its grep, the project's one definition) plus the lines that call a decompiler read CONFIRMED-STATIC or
CONFIRMED-BY-DECOMPILE, which the plan returns to HYPOTHESIS (a decompiler read is a guess with a source). The
box's wording does not matter: 13 of the 27 boxes ticked on 2026-11-03 had dropped "no HYPOTHESIS tags" from it.
Usage: verb-lint.py [docs/verbs]; exit 1 and one line per refused doc, exit 0 and a count otherwise."""
import importlib.util
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
_spec = importlib.util.spec_from_file_location("status", HERE.parent / "status.py")
status = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(status)

STATIC = re.compile(r"CONFIRMED-(STATIC|BY-DECOMPILE)")


def t3_box(lines: list[str]) -> tuple[int, bool] | None:
    """The Status section's T3 box: (1-based line, ticked), or None when the doc has none."""
    in_status = False
    for n, line in enumerate(lines, 1):
        if line.startswith("## "):
            in_status = line.strip() == "## Status"
            continue
        b = status.BOX.match(line.strip()) if in_status else None
        if b and b.group(2).strip().startswith("T3 scenario green"):
            return n, bool(b.group(1).strip())
    return None


def open_claims(path: Path) -> int:
    lines = path.read_text(encoding="utf-8").splitlines()
    static = sum(1 for line in lines if STATIC.search(line) and not status.RUN_ID.search(line))
    return status.read_verb(path)["hypotheses"] + static


def lint(root: Path) -> list[str]:
    bad = []
    for path in sorted(root.glob("*.md")):
        box = t3_box(path.read_text(encoding="utf-8").splitlines())
        if not box or not box[1]:
            continue
        n = open_claims(path)
        if n:
            bad.append(f"{path}:{box[0]}: the T3 box is ticked over {n} open engine claim line(s); untick it with the "
                       f"date and the reason, or settle each claim with a run or trace id")
    return bad


def main(argv: list[str]) -> int:
    root = Path(argv[0]) if argv else Path("docs/verbs")
    bad = lint(root)
    if bad:
        print("\n".join(bad))
        return 1
    print(f"verb-lint: no T3 box ticked over an open claim ({len(list(root.glob('*.md')))} docs)")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
