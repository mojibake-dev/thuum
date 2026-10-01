#!/usr/bin/env bash
# client-steam-offline.sh <vmid>: switch the lab user's Steam to offline mode
# (steam-offline.ps1 in the lab user's session) so a cold boot in the dark lab
# can start the game. Part of `just client-bringup`.
set -euo pipefail
vmid=${1:?vmid}
here=$(cd "$(dirname "$0")/../.." && pwd)
RUN_WAIT_S=${RUN_WAIT_S:-85} "$here/lab/tools/client-run.sh" "$vmid" "$here/lab/deploy/sky-client/steam-offline.ps1" | python3 -c '
import sys, json
raw = sys.stdin.read()
try:
    d = json.loads(raw); inner = json.loads(d.get("out") or "{}")
    for k, v in inner.items(): print(f"  {k}: {v}")
except Exception: print(raw[:2000])'
