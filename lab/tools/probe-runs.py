#!/usr/bin/env python3
"""probe-runs.py [--branch <fork branch>] <scenario...>: a merge refuses a verb doc that names a probe by path no lab run
ever played (ADR-064's consequences; the root-cause plan after playtest 41, W5: the runtime check written "by path" and
not run before the merge was the pattern behind playtest 41's breakages).

The docs read are the verb docs (docs/verbs/*.md) naming any of the merge's scenarios or lab/gate.yaml's `always` and
`watch` (the gate runs those too); a probe is an x- id with "by path" right after it (a version between them, v2 or
v1.3, allowed); a run is a directory of the lab's results, <YYYYMMDD-HHMMSS>-<scenario id>, at RESULTS. A probe named by
path that never ran is refused: run it, or reword the line that still promises it. A promise for another branch's code
names that branch after it ("x-host-restart-follow by path for m3-follow-vouch"): with --branch, only the merging
branch's promises and the ones naming no branch are held to a run (the canon merge of 0f2f3c55, 2026-11-05, was
refused on two docs' probes for code on other branches).
Usage: probe-runs.py [--branch <fork branch>] <scenario id or path> ...; exit 1 and one line per unrun probe, exit 0
and a count otherwise."""
import re
import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
RESULTS = "https://thuum.gaussing.tv/results/"
# a probe id with "by path" right after it ("x-prop-static by path", "x-weather v1 by path", "x-handoff-hide (by path)");
# a line that says a probe was never written ("none has been written by path ...: x-handoff-sit") promises no run
PROBE = re.compile(r"\b(x-[a-z0-9]+(?:-[a-z0-9]+)*)(?:\s+v\d+(?:\.\d+)*)?\s*\(?\s*by path"
                   r"(?:,?\s+for\s+(m\d+-[a-z0-9]+(?:-[a-z0-9]+)*))?")
RUN_DIR = re.compile(r'href="\./(\d{8}-\d{6})-([a-z0-9][a-z0-9-]*)/"')


def docs_naming(scenarios: list[str], verbs: Path) -> list[Path]:
    ids = [re.escape(s) for s in scenarios]
    pat = re.compile(r"(?<![a-z0-9-])(" + "|".join(ids) + r")(?![a-z0-9-])") if ids else None
    return [d for d in sorted(verbs.glob("*.md")) if pat and pat.search(d.read_text(encoding="utf-8"))]


def unrun(doc: Path, played: set[str], branch: str | None = None) -> list[str]:
    out = []
    for line in doc.read_text(encoding="utf-8").splitlines():
        if "by path" in line:
            for m in PROBE.finditer(line):
                if branch and m.group(2) and m.group(2) != branch:
                    continue  # a promise for another branch's code: that branch's merge holds it to a run
                if m.group(1) not in played and m.group(1) not in out:
                    out.append(m.group(1))
    return out


def gate_lists(path: Path) -> dict[str, list[str]]:
    """lab/gate.yaml's lists as verb-merge.sh reads them (the standard library alone: the Mac's python3 has no PyYAML),
    `always: [a, b]` inline or `- name` a line, comments allowed."""
    lists: dict[str, list[str]] = {}
    cur = None
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.split("#", 1)[0].rstrip()
        if not line.strip():
            continue
        m = re.match(r"^(\w+):\s*(.*)$", line)
        if m:
            cur = m.group(1)
            inline = m.group(2).strip()
            lists[cur] = [x.strip().strip("'\"") for x in inline.strip("[]").split(",") if x.strip()] if inline.startswith("[") else []
            continue
        m = re.match(r"^\s*-\s*(\S+)", line)
        if m and cur:
            lists[cur].append(m.group(1).strip("'\""))
    return lists


def played_ids(listing: str) -> set[str]:
    return {m.group(2) for m in RUN_DIR.finditer(listing)}


def main(argv: list[str]) -> int:
    branch = None
    if argv[:1] == ["--branch"]:
        branch, argv = argv[1], argv[2:]
    scenarios = [Path(a).stem if a.endswith((".yaml", ".yml")) else a for a in argv]
    gate = gate_lists(ROOT / "lab" / "gate.yaml")
    scenarios = list(dict.fromkeys(gate.get("always", []) + scenarios + gate.get("watch", [])))
    docs = docs_naming(scenarios, ROOT / "docs" / "verbs")
    with urllib.request.urlopen(RESULTS, timeout=60) as r:
        played = played_ids(r.read().decode("utf-8", "replace"))
    if not played:
        print(f"no runs read from {RESULTS}; refusing rather than passing unread", file=sys.stderr)
        return 1
    bad = [(d, p) for d in docs for p in unrun(d, played, branch)]
    for d, p in bad:
        print(f"{d.relative_to(ROOT)}: names {p} by path and no lab run played it")
    if bad:
        return 1
    print(f"{len(docs)} verb doc(s) naming {' '.join(scenarios)}: every probe named by path"
          + (f" for {branch} or no branch" if branch else "") + " has a run")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
