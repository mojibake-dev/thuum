#!/usr/bin/env bash
# client-display.sh <vmid> [w] [h] [hz]: set a headless clone's desktop mode
# (Virtual Display Driver, 800x600 on a fresh clone) and the game's window to
# match, in the lab user's session (display.ps1 through sky-lab-run).
set -euo pipefail
vmid=${1:?vmid}; w=${2:-1920}; h=${3:-1080}; hz=${4:-60}
here=$(cd "$(dirname "$0")/../.." && pwd)
tmp=$(mktemp -t client-display).ps1
sed "s/^param(\[int\]\$W = 1920, \[int\]\$H = 1080, \[int\]\$Hz = 60)/param([int]\$W = $w, [int]\$H = $h, [int]\$Hz = $hz)/" "$here/lab/deploy/sky-client/display.ps1" > "$tmp"
RUN_WAIT_S=${RUN_WAIT_S:-15} "$here/lab/tools/client-run.sh" "$vmid" "$tmp" | python3 -c '
import sys, json
raw = sys.stdin.read()
try:
    d = json.loads(raw); inner = json.loads(d.get("out") or "{}")
    for k, v in inner.items(): print(f"  {k}: {v}")
except Exception: print(raw[:2000])'
rm -f "$tmp"
