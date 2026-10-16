#!/usr/bin/env python3
"""log-stop.py <log> <cycles of the seat> <cycles of the other seat> <seat> <other>: did a seat's Skyrim Platform
log stop while the playtest went on (thuum ADR-033, a game whose log stops; lab/tools/playtest-record.sh).

What writes a seat's log during play is its game replaying the OTHER seat's spell actions on that seat's
figure: cast-action's performAction lines, with their onResult and latent-callback lines. A seat's own casts,
turns and sneaks write nothing to its own log. So the log stopped when the other seat made spell actions after
its last line (5 s allowed for the replay and the clocks: the guests run 1 to 2 s off the server and
each other, x-tgm-breath4 20261016-010539) in a cycle where this seat's trace shows a figure; a quiet log after
the last spell action is no finding. Until 2026-10-15 the recorder counted the seat's own events instead, and
every "stop" it reported in playtest nineteen's three sessions was a quiet log.

A cycles file has one line per recorded cycle: k, the watch's start (Unix seconds), the trace's path (the
lab-driver watch's trace: self.actions rows are [ms since the start, action, idle, name, ...]).
"""
from __future__ import annotations

import datetime
import json
import os
import re
import sys

SPELL = re.compile(r"spell|equipped|dualmagic", re.I)
REPLAY_S = 5.0


def last_line(text: str, anchor: float) -> float | None:
    """The epoch of the log's last stamped line ([HH:MM:SS:mmm], local time), on the day that puts it nearest
    the anchor (a watch's start), or None when the log has no stamped line."""
    stamps = re.findall(r"^\[(\d\d):(\d\d):(\d\d)(?::(\d\d\d))?\]", text, re.M)
    if not stamps:
        return None
    h, m, s, ms = stamps[-1]
    day = datetime.datetime.fromtimestamp(anchor)
    at = day.replace(hour=int(h), minute=int(m), second=int(s), microsecond=int(ms or 0) * 1000).timestamp()
    return min((at - 86400, at, at + 86400), key=lambda t: abs(t - anchor))


def load(path: str) -> dict:
    with open(path) as f:
        return json.load(f)


def cycles(path: str) -> list[tuple[str, float, str]]:
    if not os.path.exists(path):
        return []
    with open(path) as f:
        return [(k, float(since), trace) for k, since, trace in (line.rstrip("\n").split("\t") for line in f)]


def spell_actions_after(mine: list, theirs: list, after: float) -> int:
    """The other seat's spell actions later than `after` (epoch), in cycles where this seat's trace has a figure."""
    figure = {k for k, _, trace in mine if os.path.exists(trace) and load(trace).get("actors")}
    n = 0
    for k, since, trace in theirs:
        if k not in figure or not os.path.exists(trace):
            continue
        for a in (load(trace).get("self") or {}).get("actions") or []:
            if since + float(a[0]) / 1000 > after and SPELL.search(str(a[3])):
                n += 1
    return n


def verdict(log: str, mine_path: str, theirs_path: str, c: str, o: str) -> str:
    mine, theirs = cycles(mine_path), cycles(theirs_path)
    anchors = [since for _, since, _ in mine + theirs]
    text = ""
    if os.path.exists(log):
        with open(log, errors="replace") as f:
            text = f.read()
    last = last_line(text, max(anchors) if anchors else datetime.datetime.now().timestamp())
    if last is None:
        return f"{c}: no Skyrim Platform log lines"
    when = datetime.datetime.fromtimestamp(last).strftime("%H:%M:%S")
    n = spell_actions_after(mine, theirs, last + REPLAY_S)
    if n:
        return (f"FINDING {c}: its Skyrim Platform log stops at {when}, yet {o} made {n} spell actions after it "
                f"that {c}'s game replays and logs; ADR-033, a game whose log stops")
    return f"{c}: Skyrim Platform log's last line at {when}, no spell action of {o} after it (a quiet log, no finding)"


if __name__ == "__main__":
    if len(sys.argv) != 6:
        print(__doc__.splitlines()[0], file=sys.stderr)
        sys.exit(2)
    print(verdict(*sys.argv[1:6]))
