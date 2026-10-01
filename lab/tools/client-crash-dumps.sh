#!/usr/bin/env bash
# client-crash-dumps.sh <vmid>: WER minidumps for SkyrimSE.exe under C:\sky-lab\dumps
# on a Windows lab client (crash-dumps.ps1 as SYSTEM through the host's guest-run helper).
set -euo pipefail
vmid=${1:?vmid}
jump=${JUMP_HOST:-root@core.gaussing.tv}
here=$(cd "$(dirname "$0")/../.." && pwd)
scp -q -o BatchMode=yes "$here/lab/deploy/sky-client/crash-dumps.ps1" "$jump:/root/sky-client/crash-dumps-$vmid.ps1"
ssh -o BatchMode=yes "$jump" "GUEST_RUN_TIMEOUT=120 /root/sky-client/guest-run.sh $vmid /root/sky-client/crash-dumps-$vmid.ps1; rc=\$?; rm -f /root/sky-client/crash-dumps-$vmid.ps1; exit \$rc" 2>&1 | grep -v -E 'CLIXML|<Objs'
