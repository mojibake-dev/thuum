#!/usr/bin/env python3
"""probe-runs.py <scenario...>: a merge refuses a verb doc that names a probe by path no lab run ever played (ADR-064's
consequences; the root-cause plan after playtest 41, W5: the runtime check written "by path" and not run before the merge
was the pattern behind playtest 41's breakages).

The docs read are the verb docs (docs/verbs/*.md) naming any of the merge's scenarios; a probe is an x- id with
"by path" right after it; a run is a directory of the lab's results, <YYYYMMDD-HHMMSS>-<scenario id>, at RESULTS. A probe
named by path that never ran is refused: run it, or reword the line that still promises it.
Usage: probe-runs.py <scenario id or path> ...; exit 1 and one line per unrun probe, exit 0 and a count otherwise."""
import re
import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
RESULTS = "https://thuum.gaussing.tv/results/"
# a probe id with "by path" right after it ("x-prop-static by path", "x-weather v1 by path", "x-handoff-hide (by path)");
# a line that says a probe was never written ("none has been written by path ...: x-handoff-sit") promises no run
PROBE = re.compile(r"\b(x-[a-z0-9]+(?:-[a-z0-9]+)*)(?:\s+v\d+)?\s*\(?\s*by path")
RUN_DIR = re.compile(r'href="\./(\d{8}-\d{6})-([a-z0-9][a-z0-9-]*)/"')


def docs_naming(scenarios: list[str], verbs: Path) -> list[Path]:
    ids = [re.escape(s) for s in scenarios]
    pat = re.compile(r"(?<![a-z0-9-])(" + "|".join(ids) + r")(?![a-z0-9-])") if ids else None
    return [d for d in sorted(verbs.glob("*.md")) if pat and pat.search(d.read_text(encoding="utf-8"))]


def unrun(doc: Path, played: set[str]) -> list[str]:
    out = []
    for line in doc.read_text(encoding="utf-8").splitlines():
        if "by path" in line:
            for m in PROBE.finditer(line):
                if m.group(1) not in played and m.group(1) not in out:
                    out.append(m.group(1))
    return out


def played_ids(listing: str) -> set[str]:
    return {m.group(2) for m in RUN_DIR.finditer(listing)}


def main(argv: list[str]) -> int:
    scenarios = [Path(a).stem if a.endswith((".yaml", ".yml")) else a for a in argv]
    docs = docs_naming(scenarios, ROOT / "docs" / "verbs")
    with urllib.request.urlopen(RESULTS, timeout=60) as r:
        played = played_ids(r.read().decode("utf-8", "replace"))
    if not played:
        print(f"no runs read from {RESULTS}; refusing rather than passing unread", file=sys.stderr)
        return 1
    bad = [(d, p) for d in docs for p in unrun(d, played)]
    for d, p in bad:
        print(f"{d.relative_to(ROOT)}: names {p} by path and no lab run played it")
    if bad:
        return 1
    print(f"{len(docs)} verb doc(s) naming {' '.join(scenarios)}: every probe named by path has a run")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
