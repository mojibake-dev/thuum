#!/usr/bin/env bash
# client-launch-test.sh <vmid>: launch the game through SKSE on a lab client in
# the lab user's session, print what happened (processes, SKSE log, dialogs),
# and pull the screenshot to lab/results/client-<vmid>-<stamp>.png.
set -euo pipefail
vmid=${1:?vmid}
jump=${JUMP_HOST:-root@core.gaussing.tv}
here=$(cd "$(dirname "$0")/../.." && pwd)
mkdir -p "$here/lab/results"
RUN_WAIT_S=${RUN_WAIT_S:-65} "$here/lab/tools/client-run.sh" "$vmid" "$here/lab/deploy/sky-client/launch-test.ps1" | python3 -c '
import sys, json
raw = sys.stdin.read()
try:
    d = json.loads(raw); inner = json.loads(d.get("out") or "{}")
    for k, v in inner.items(): print(f"  {k}: {str(v)[:1200]}")
except Exception: print(raw[:2000])'
out="$here/lab/results/client-$vmid-$(date -u +%Y%m%dT%H%M%SZ).png"
ssh -o BatchMode=yes "$jump" "pvesh get /nodes/\$(hostname)/qemu/$vmid/agent/file-read --file 'C:\\\\sky-lab\\\\screenshots\\\\latest.png' --output-format json" 2>/dev/null \
  | python3 -c "import sys,json; d=json.load(sys.stdin); open('$out','wb').write(d['content'].encode('latin-1'))" && echo "  screenshot: ${out#$here/}"
