#!/usr/bin/env python3
"""status.py (`just status`): the live state of every verb, read from the verb
docs' own Status checklists, as one table. PLAN.md keeps one line of state per
item and the order; this is the check against it, generated, never edited.

Columns: verb, milestone, class, rung, boxes ticked of nine, lines that say
HYPOTHESIS without a CONFIRMED (a grep, not a verdict), the T3 scenario, and the
first unticked box (what the verb waits on).
Usage: status.py [docs/verbs] [--md]  (--md writes nothing; the table is
Markdown either way, so it pastes into a report)."""
import re
import sys
from pathlib import Path

BOX = re.compile(r"^- \[([ xX])\] (.+)$")


def read_verb(path: Path) -> dict:
    text = path.read_text(encoding="utf-8")
    lines = text.splitlines()
    name = path.stem
    # the header lines wrap and wander ("Milestone: M2 (Eli, ...)" with
    # "Class: B" two lines down): take the tokens, not the lines
    m = re.search(r"^Milestone:\s*(after M\d|M\d+(?:\.\d+)?|Stretch)", text, re.M)
    milestone = m.group(1) if m else "?"
    k = re.search(r"Class:\s*([ABC])\b", text)
    klass = k.group(1) if k else "?"
    r = re.search(r"^Rung:\s*(.+)$", text, re.M)
    rung = "/".join(dict.fromkeys(re.findall(r"\bR[0-3]\b", r.group(1)))) if r else "?"
    rung = rung or "?"
    sc = re.search(r"T3 scenario id:\s*(\S+)", text)
    scenario = sc.group(1).strip("`") if sc else ""
    scenario = re.sub(r"^lab/scenarios/", "", scenario).replace(".yaml", "").rstrip(":;.,")
    # the Status section's boxes alone (a verb doc may carry other lists)
    ticked = total = 0
    first_open = ""
    in_status = False
    for line in lines:
        if line.startswith("## "):
            in_status = line.strip() == "## Status"
            continue
        if not in_status:
            continue
        b = BOX.match(line.strip())
        if not b:
            continue
        total += 1
        if b.group(1).strip():
            ticked += 1
        elif not first_open:
            first_open = b.group(2).strip()
    # lines that say HYPOTHESIS and not CONFIRMED, outside the template's own
    # "HYPOTHESIS | CONFIRMED" choice and the Dynamic plan's heading: a grep,
    # not a verdict; the doc's Status box "no HYPOTHESIS tags" is the verdict
    hyp = 0
    for line in lines:
        if "HYPOTHESIS" not in line or "CONFIRMED" in line or "still HYPOTHESIS" in line:
            continue
        hyp += 1
    return {"verb": name, "milestone": milestone, "class": klass, "rung": rung, "ticked": ticked,
            "total": total, "hypotheses": hyp, "scenario": scenario, "waits_on": first_open}


def table(rows: list[dict]) -> str:
    order = {"M0": 0, "M1": 1, "M1.1": 2, "M2": 3, "M3": 4, "M4": 5, "M5": 6, "M6": 7, "M7": 8}
    rows = sorted(rows, key=lambda r: (order.get(r["milestone"], 99), r["verb"]))
    out = ["| verb | M | class | rung | status | hyp. lines | scenario | waits on |",
           "| --- | --- | --- | --- | --- | --- | --- | --- |"]
    for r in rows:
        state = "DONE" if r["total"] and r["ticked"] == r["total"] else f"{r['ticked']}/{r['total']}"
        out.append(f"| {r['verb']} | {r['milestone']} | {r['class']} | {r['rung']} | {state} | {r['hypotheses']} | {r['scenario']} | {r['waits_on'][:48]} |")
    done = sum(1 for r in rows if r["total"] and r["ticked"] == r["total"])
    out.append("")
    out.append(f"{len(rows)} verbs, {done} with every Status box ticked; {sum(r['hypotheses'] for r in rows)} lines still say HYPOTHESIS without a CONFIRMED (a grep: the docs decide).")
    return "\n".join(out)


def main(argv: list[str]) -> int:
    args = [a for a in argv if not a.startswith("--")]
    root = Path(args[0]) if args else Path("docs/verbs")
    rows = [read_verb(p) for p in sorted(root.glob("*.md"))]
    print(table(rows))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
