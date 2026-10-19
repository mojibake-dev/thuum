#!/usr/bin/env python3
"""skse-check.py <run> [client ...]: which SKSE plugins a lab run's seats loaded, from the run's
<client>-skse64.log artifacts (lab-api collects them, docs/LAB.md). SKSE logs "checking plugin X.dll" for
every DLL in Data\\SKSE\\Plugins and then, per DLL, "plugin X.dll (...) loaded correctly" or why it did not
load; a DLL checked and never loaded is listed with SKSE's own line. MpClientPlugin.dll is skymp's, loaded
by Skyrim Platform rather than SKSE, so its "no version data" is expected. Exits 1 when a seat left any
other DLL unloaded, so a layer stage can gate on it (the essentials layer: every @1.6.1170 folder's DLL
loads on the 1.6.1170 seat, docs/MODS.md)."""
import re
import sys
import urllib.request

RESULTS = "https://thuum.gaussing.tv/results"
NOT_SKSE = {"MpClientPlugin.dll"}


def read(run: str, client: str) -> str | None:
    try:
        with urllib.request.urlopen(f"{RESULTS}/{run}/{client}-skse64.log", timeout=30) as r:
            return r.read().decode("utf-8", "replace")
    except Exception:
        return None


def check(text: str) -> tuple[list[str], dict[str, str], str]:
    checked = re.findall(r"^checking plugin (\S+\.dll)", text, re.M | re.I)
    verdict: dict[str, str] = {}
    for line in text.splitlines():
        m = re.match(r"\s*plugin (\S+\.dll) \(.*?\)\s*(.*)$", line, re.I)
        if m and m.group(1) not in verdict:
            verdict[m.group(1)] = m.group(2).strip()
        m = re.match(r"\s*couldn't load plugin (\S+\.dll)(.*)$", line, re.I)
        if m:
            verdict[m.group(1)] = "couldn't load" + m.group(2)
    runtime = ""
    m = re.search(r"^SKSE64? runtime: initialize \(version = (\S+) ([0-9A-Fa-f]{8})", text, re.M)
    if m:  # the runtime packed as SKSE packs it: major, minor, build (12 bits), sub (4 bits)
        v = int(m.group(2), 16)
        runtime = f"SKSE {m.group(1)}, game {v >> 24}.{(v >> 16) & 0xFF}.{(v >> 4) & 0xFFF}"
    return checked, verdict, runtime


def main() -> int:
    if len(sys.argv) < 2:
        print(__doc__.strip().splitlines()[0], file=sys.stderr)
        return 2
    run, clients = sys.argv[1], sys.argv[2:] or ["c1", "c2"]
    bad = 0
    for c in clients:
        text = read(run, c)
        if text is None:
            print(f"{c}: no {c}-skse64.log in {run}")
            bad = 1
            continue
        checked, verdict, runtime = check(text)
        loaded = [d for d in checked if verdict.get(d, "").startswith("loaded correctly")]
        missed = [d for d in checked if d not in loaded and d not in NOT_SKSE]
        print(f"{c}: {len(checked)} DLLs checked, {len(loaded)} loaded{(' (' + runtime + ')') if runtime else ''}")
        for d in loaded:
            print(f"   loaded  {d}")
        for d in missed:
            print(f"   NOT     {d}: {verdict.get(d, 'no load line after its check')}")
        bad |= bool(missed)
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
