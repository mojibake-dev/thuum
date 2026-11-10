#!/usr/bin/env python3
"""probe-check <scenario.yaml>...: the checks lab-api makes only at a run's assert step, made before the run.

For each file:
  - it loads through labapi.scenario.load_scenario, the runner's own parse;
  - every <client>.log_count("<p>") in an assert expression must name a pattern that an earlier log-count step
    counted for that client, byte for byte: lab-api reads a seat's log_count claim in an assert only from such a step
    (x-npc-bow and x-npc-spell 20261026-221512 and 221906, x-npc-copy-fate 20261027-041406: a claim's "server.s"
    against the step's "server's"); server.log_count is live, counted anew before each evaluation (runner.py's
    _evaluate), and so is a seat's inside an until, counted anew before each poll, so neither needs a step;
  - every log_count in a `server: snapshot {of}` must name a pattern already stored for its holder, the server's
    included: a snapshot counts nothing (runner.py's _snapshot), it reads the last count a log-count step or an
    earlier assert's or until's live count stored (x-quest-cause v2 7ca974e0's loginRuns would have been
    E_RUN_SNAPSHOT at its step 12; its fresh review caught it, this check did not);
  - every expression is dry-run through labapi.assertions.Evaluator against facades that answer nothing, so a missing
    fact (AssertionData) is the expected outcome and E_ASSERT_SYNTAX is a finding (x-body-loot v3 20261027-000612:
    `c1.refs_near.count(26)` for `c1.refs_near().count(26)`).
Prints each finding with its step and exits 1 when there is one, else prints "ok" per file and exits 0.
"""
from __future__ import annotations

import ast
import difflib
import sys
import warnings
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "labapi"))

from labapi.assertions import AssertionData, AssertionSyntax, Evaluator  # noqa: E402
from labapi.scenario import load_scenario  # noqa: E402


class _Nothing:
    """A facade that holds no fact: every read answers None, which the Evaluator turns into AssertionData."""

    def __getattr__(self, name):
        return lambda *args, **kwargs: None


def _log_count_calls(expr: str) -> list[tuple[str, str]]:
    """The (holder, pattern) pairs of an expression's log_count calls: holder is a client name or "server"."""
    try:
        tree = ast.parse(expr, mode="eval")
    except SyntaxError:
        return []
    out = []
    for node in ast.walk(tree):
        if (isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute) and node.func.attr == "log_count"
                and isinstance(node.func.value, ast.Name) and node.args and isinstance(node.args[0], ast.Constant)
                and isinstance(node.args[0].value, str)):
            out.append((node.func.value.id, node.args[0].value))
    return out


def check(text: str) -> list[str]:
    """The findings for one scenario's text, in step order."""
    sc = load_scenario(text)
    # a fakeclient scenario (t2-*) names no clients but reads c1 and c2 as the runner's T2 seats
    clients = list(sc.clients) or ["c1", "c2"]
    # as the runner builds it: parity's names exist only in a scenario with a parity block (ADR-031)
    ev = Evaluator(_Nothing(), _Nothing(), clients, parity=sc.parity, references_dir=Path(__file__).resolve().parents[1] / "references")
    counted: dict[str, set[str]] = {}
    findings = []
    for i, st in enumerate(sc.steps):
        if st.action == "log-count" and st.kind in ("client", "server"):
            holder = st.client if st.kind == "client" else "server"
            counted.setdefault(str(holder), set()).add(str(st.args.get("pattern")))
            continue
        if st.kind == "server" and st.action == "snapshot":
            expr = str(st.args.get("of", ""))
            try:
                ev.value(expr)
            except AssertionSyntax as e:
                findings.append(f"step {i}: {e}: {expr}")
            except (AssertionData, TypeError, ValueError, KeyError, AttributeError, OSError):
                pass  # a fact the empty facades cannot give: data, not syntax
            for holder, pattern in _log_count_calls(expr):
                seen = counted.get(holder, set())
                if pattern not in seen:
                    findings.append(f"step {i}: snapshot {st.args.get('name')!r} reads {holder}.log_count({pattern!r}) with no "
                                    f"count stored for it: a snapshot counts nothing, so even the server's needs a log-count "
                                    f"step (or an earlier assert's or until's live count) first{_hint(pattern, seen)}")
            continue
        for expr in st.assertions or []:
            try:
                ev.evaluate(expr)
            except AssertionSyntax as e:
                findings.append(f"step {i}: {e}: {expr}")
            except (AssertionData, TypeError, ValueError, KeyError, AttributeError, OSError):
                pass  # a fact the empty facades cannot give (a form() resolution, a reference trace): data, not syntax
            for holder, pattern in _log_count_calls(expr):
                if holder == "server":
                    continue  # live: runner.py counts the server log before each evaluation
                if st.kind == "until" and holder in sc.clients:
                    continue  # live in an until: runner.py counts a seat's logs before each poll
                seen = counted.get(holder, set())
                if pattern not in seen:
                    findings.append(f"step {i}: {holder}.log_count({pattern!r}) has no earlier log-count step of that pattern{_hint(pattern, seen)}")
            # a live count is stored as a log-count step's is (runner.py's _evaluate), so a later snapshot can read it
            for holder, pattern in _log_count_calls(expr):
                if holder == "server" or (st.kind == "until" and holder in sc.clients):
                    counted.setdefault(holder, set()).add(pattern)
    return findings


def _hint(pattern: str, seen: set[str]) -> str:
    """The nearest pattern counted for the holder, or that it has none counted before this step."""
    near = difflib.get_close_matches(pattern, sorted(seen), n=1, cutoff=0.6)
    return f" (the nearest counted: {near[0]!r})" if near else (" (no log-count step for it before this one)" if not seen else "")


def main(argv: list[str]) -> int:
    # a pattern's regex escapes ("\.") inside an expression's string literal are a SyntaxWarning to Python 3.14's
    # parser, printed once per expression; the expression is the runner's text, so the warning is noise here
    warnings.filterwarnings("ignore", category=SyntaxWarning)
    if not argv:
        print("usage: probe-check <scenario.yaml>...", file=sys.stderr)
        return 2
    bad = 0
    for name in argv:
        try:
            findings = check(Path(name).read_text())
        except (OSError, ValueError) as e:
            print(f"{name}: does not load: {e}")
            bad += 1
            continue
        if findings:
            bad += 1
            print(f"{name}: {len(findings)} finding(s)")
            for f in findings:
                print(f"  {f}")
        else:
            print(f"{name}: ok")
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
