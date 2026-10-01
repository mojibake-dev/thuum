#!/usr/bin/env bash
# client-game-firewall.sh <vmid>: block SkyrimSE.exe's traffic outside the lab
# VLAN on a Windows lab client (game-firewall.ps1 as SYSTEM through the host's
# guest-run helper), so bethesda.net connects fail fast while the lab is dark.
set -euo pipefail
vmid=${1:?vmid}
jump=${JUMP_HOST:-root@core.gaussing.tv}
here=$(cd "$(dirname "$0")/../.." && pwd)
scp -q -o BatchMode=yes "$here/lab/deploy/sky-client/game-firewall.ps1" "$jump:/root/sky-client/game-firewall-$vmid.ps1"
ssh -o BatchMode=yes "$jump" "GUEST_RUN_TIMEOUT=120 /root/sky-client/guest-run.sh $vmid /root/sky-client/game-firewall-$vmid.ps1; rc=\$?; rm -f /root/sky-client/game-firewall-$vmid.ps1; exit \$rc" 2>&1 | grep -v -E 'CLIXML|<Objs'
