#!/usr/bin/env python3
"""Generate docs/STATE.md, ADR-065 decision 1's state list: one row per change flag of every form class CommonLibSSE-NG
declares (the `struct ChangeFlags` blocks under include/RE) and one row per global data table the save writes (the hand list in
lab/state-tables.yaml, sourced from the engine's save path). The Rung, Channel, Notes and Verb columns are hand-maintained: read back
from the existing docs/STATE.md by key (Class.kFlag, or table:<name>) and written again unchanged, as lab/ledger.py does for
docs/NATIVES.md. A flag CommonLib declares and the file lacks is undeclared state; `--check` regenerates to memory and exits 1 when the
committed file differs (a stale file, a new flag after a CommonLib repin) or when a row's Rung is empty (the design law's "undeclared
state is a bug", mechanized: write `undeclared` to say so on purpose; the summary counts those).

Usage: python3 lab/state.py [--commonlib CommonLibSSE-NG] [--out docs/STATE.md] [--tables lab/state-tables.yaml] [--check | --lint-only]
"""
from __future__ import annotations

import argparse
import re
import subprocess
import sys
from dataclasses import dataclass, field
from pathlib import Path

RUNGS = {"R0", "R1", "R2", "R3", "undeclared"}
_BLOCK_START = re.compile(r"^\s*struct ChangeFlags\b")
_FLAG = re.compile(r"^\s*(k\w+)\s*=\s*(?:\(std::uint32_t\))?\s*1u?\s*<<\s*(\d+)\s*,?\s*(?://\s*(.*))?$")
_ROW = re.compile(r"^\|\s*`([^`]+)`\s*\|\s*([^|]*)\|\s*([^|]*)\|\s*([^|]*)\|\s*([^|]*)\|\s*([^|]*)\|\s*([^|]*)\|\s*$")


@dataclass
class Flag:
    cls: str
    name: str
    bit: int
    source: str  # file:line under CommonLibSSE-NG/include/RE
    comment: str = ""

    @property
    def key(self) -> str:
        return f"{self.cls}.{self.name}"


@dataclass
class Table:
    name: str
    type_id: str
    holds: str
    scope: str  # world | player | bookkeeping
    source: str

    @property
    def key(self) -> str:
        return f"table:{self.name}"


@dataclass
class Hand:
    rung: str = ""
    channel: str = ""
    notes: str = ""
    verb: str = ""


def flags(commonlib: Path) -> list[Flag]:
    out: list[Flag] = []
    for path in sorted((commonlib / "include" / "RE").rglob("*.h")):
        lines = path.read_text(encoding="utf-8", errors="replace").splitlines()
        i = 0
        while i < len(lines):
            if _BLOCK_START.match(lines[i]):
                cls = path.stem
                depth = 0
                j = i
                while j < len(lines):
                    depth += lines[j].count("{") - lines[j].count("}")
                    m = _FLAG.match(lines[j])
                    if m and depth > 0:
                        out.append(Flag(cls, m.group(1), int(m.group(2)), f"{path.relative_to(commonlib)}:{j + 1}", (m.group(3) or "").strip()))
                    if depth <= 0 and j > i and "}" in lines[j]:
                        break
                    j += 1
                i = j
            i += 1
    out.sort(key=lambda f: (f.cls, f.bit))
    return out


def tables(path: Path) -> list[Table]:
    """A small hand YAML: `- name: ...` blocks with type_id, holds, scope, source. Parsed by hand so the lab's python needs no yaml."""
    out: list[Table] = []
    cur: dict[str, str] = {}
    if not path.is_file():
        return out
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.rstrip()
        if not line or line.lstrip().startswith("#"):
            continue
        if line.startswith("- "):
            if cur:
                out.append(Table(cur.get("name", "?"), cur.get("type_id", "?"), cur.get("holds", ""), cur.get("scope", "?"), cur.get("source", "")))
            cur = {}
            line = "  " + line[2:]
        k, _, v = line.strip().partition(":")
        cur[k.strip()] = v.strip().strip('"')
    if cur:
        out.append(Table(cur.get("name", "?"), cur.get("type_id", "?"), cur.get("holds", ""), cur.get("scope", "?"), cur.get("source", "")))
    return out


def read_hand_columns(existing: Path) -> dict[str, Hand]:
    hand: dict[str, Hand] = {}
    if not existing.is_file():
        return hand
    for line in existing.read_text(encoding="utf-8").splitlines():
        m = _ROW.match(line)
        if not m:
            continue
        key, _kind, _src, rung, channel, notes, verb = (g.strip() for g in m.groups())
        if rung or channel or notes or verb:
            hand[key] = Hand(rung, channel, notes, verb)
    return hand


def git_head(repo: Path) -> str:
    try:
        return subprocess.run(["git", "-C", str(repo), "rev-parse", "--short=8", "HEAD"], capture_output=True, text=True, check=True).stdout.strip()
    except Exception:
        return "unknown"


def render(fl: list[Flag], tb: list[Table], hand: dict[str, Hand], commonlib_head: str) -> str:
    rows: list[tuple[str, str, str]] = []  # key, kind, source
    for f in fl:
        rows.append((f.key, f"flag bit {f.bit}" + (f" ({f.comment})" if f.comment else ""), f.source))
    for t in tb:
        rows.append((t.key, f"table {t.type_id}, {t.scope}: {t.holds}", t.source))
    by_rung = {r: 0 for r in ("R0", "R1", "R2", "R3", "undeclared", "")}
    for key, _k, _s in rows:
        r = hand.get(key, Hand()).rung
        by_rung[r if r in by_rung else ""] += 1
    classes = sorted({f.cls for f in fl})
    lines = [
        "# STATE ledger (ADR-065 decision 1)",
        "",
        f"Generated by `just state` (lab/state.py) from CommonLibSSE-NG at {commonlib_head} ({len(fl)} change flags in {len(classes)} form",
        f"classes' `struct ChangeFlags` blocks) and lab/state-tables.yaml ({len(tb)} global data tables the save writes). The Rung, Channel,",
        "Notes and Verb columns are hand-maintained and preserved across regeneration by key. Every piece of saved state has one row; a",
        "row's Rung is R0 (server computes), R1 (host computes, server validates), R2 (host computes, server records), R3 (client-local,",
        "never synced) or `undeclared` (the honest state until a verb doc declares it). `just state --check` fails on a stale file, a new",
        "flag CommonLib declares without a row, or an empty Rung. Channel names the message or verb that carries the state today (ADR-065's",
        "ChangeForm once slice 3 lands); a channel-less R0 to R2 row is a missing channel.",
        "",
        "| Rung | Rows |",
        "| --- | --- |",
    ]
    lines += [f"| {r or '(empty)'} | {n} |" for r, n in by_rung.items() if n]
    lines += [f"| total | {len(rows)} |", "", "| Key | Kind | Source | Rung | Channel | Notes | Verb |", "| --- | --- | --- | --- | --- | --- | --- |"]
    for key, kind, src in rows:
        h = hand.get(key, Hand())
        lines.append(f"| `{key}` | {kind} | {src} | {h.rung} | {h.channel} | {h.notes} | {h.verb} |")
    return "\n".join(lines) + "\n"


def lint_only(out: Path) -> int:
    """CI's mode (no CommonLib checkout): every row has a valid Rung; the summary's empty count is zero."""
    if not out.is_file():
        print(f"state.py --lint-only: {out} is missing; run `just state`", file=sys.stderr)
        return 1
    bad: list[str] = []
    rows = 0
    for line in out.read_text(encoding="utf-8").splitlines():
        m = _ROW.match(line)
        if not m:
            continue
        rows += 1
        key, _kind, _src, rung, _channel, _notes, _verb = (g.strip() for g in m.groups())
        if rung not in RUNGS:
            bad.append(f"{key} ({rung or 'empty'})")
    if not rows:
        print(f"state.py --lint-only: no rows parsed from {out}", file=sys.stderr)
        return 1
    if bad:
        print(f"state.py --lint-only: {len(bad)} rows without a valid Rung {sorted(RUNGS)}: {', '.join(bad[:8])}{' ...' if len(bad) > 8 else ''}", file=sys.stderr)
        return 1
    print(f"{out}: {rows} rows, every Rung declared")
    return 0


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--commonlib", type=Path, default=Path("CommonLibSSE-NG"))
    ap.add_argument("--out", type=Path, default=Path("docs/STATE.md"))
    ap.add_argument("--tables", type=Path, default=Path("lab/state-tables.yaml"))
    ap.add_argument("--check", action="store_true", help="regenerate to memory; exit 1 if the file differs or a Rung is empty")
    ap.add_argument("--lint-only", action="store_true", help="no CommonLib: only check that every row of the file has a valid Rung (CI's docs-lint)")
    a = ap.parse_args(argv)
    if a.lint_only:
        return lint_only(a.out)
    fl = flags(a.commonlib)
    if not fl:
        print("state.py: no struct ChangeFlags blocks found under", a.commonlib / "include" / "RE", file=sys.stderr)
        return 2
    tb = tables(a.tables)
    hand = read_hand_columns(a.out)
    text = render(fl, tb, hand, git_head(a.commonlib))
    if a.check:
        bad = 0
        if not a.out.is_file() or a.out.read_text(encoding="utf-8") != text:
            print("state.py --check: docs/STATE.md is stale against CommonLib's flags or the tables file; run `just state`", file=sys.stderr)
            bad += 1
        empty = [f.key for f in fl if not hand.get(f.key, Hand()).rung] + [t.key for t in tb if not hand.get(t.key, Hand()).rung]
        if empty:
            print(f"state.py --check: {len(empty)} rows have no Rung (write `undeclared` to say so on purpose): {', '.join(empty[:8])}{' ...' if len(empty) > 8 else ''}", file=sys.stderr)
            bad += 1
        wrong = [k for k, h in hand.items() if h.rung and h.rung not in RUNGS]
        if wrong:
            print(f"state.py --check: rungs outside {sorted(RUNGS)}: {', '.join(wrong[:8])}", file=sys.stderr)
            bad += 1
        return 1 if bad else 0
    a.out.write_text(text, encoding="utf-8")
    print(f"{a.out}: {len(fl)} flags, {len(tb)} tables, {len(hand)} hand rows preserved")
    return 0


if __name__ == "__main__":
    sys.exit(main())
