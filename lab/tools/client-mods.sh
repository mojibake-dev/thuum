#!/usr/bin/env bash
# client-mods.sh <vmid>: the lab's mod layer (persist's mods/, `just
# persist-mods`) onto a clone, into every game folder it keeps, with its
# plugins enabled (add-mods.ps1). sky-srv serves /srv/persist/mods inside VLAN
# 70 through a throwaway HTTP server, as client-game.sh serves the depots.
# Run after `just client-dist <vmid>`, which stages add-mods.ps1. Ends in a
# snapshot of the clone (a stacked clean-m1-<x>); lab-api's rollback erases it
# otherwise.
set -euo pipefail
vmid=${1:?vmid}
jump=${JUMP_HOST:-root@core.gaussing.tv}
srv=${SRV_HOST:-eli@10.10.70.10}; srv_ip=${SRV_IP:-10.10.70.10}; port=${MODS_HTTP_PORT:-8767}
ssh -o BatchMode=yes -J "$jump" "$srv" "test -f /srv/persist/mods/SHA256SUMS && mkdir -p /srv/lab/handover" \
  || { echo "no /srv/persist/mods/SHA256SUMS on sky-srv (just persist-mods)" >&2; exit 2; }
ssh -o BatchMode=yes -J "$jump" "$srv" "cd /srv/persist/mods && (nohup python3 -m http.server $port --bind $srv_ip >/dev/null 2>&1 & echo \$! > /srv/lab/handover/.mods-http.pid)"
trap 'ssh -o BatchMode=yes -J "$jump" "$srv" "kill \$(cat /srv/lab/handover/.mods-http.pid) 2>/dev/null; rm -f /srv/lab/handover/.mods-http.pid"' EXIT
sleep 1
# a one-shot SYSTEM task (guest-task.sh): the guest agent's exec can end
# before a long script does
here=$(cd "$(dirname "$0")/../.." && pwd)
"$here/lab/tools/guest-task.sh" "$vmid" add-mods "Get-Process SkyrimSE, skse64_loader -ErrorAction SilentlyContinue | Stop-Process -Force
if (-not (Test-Path 'C:\\sky-lab\\add-mods.ps1')) { throw 'no C:\\sky-lab\\add-mods.ps1 (just client-dist)' }
& 'C:\\sky-lab\\add-mods.ps1' -From 'http://$srv_ip:$port'" 20
