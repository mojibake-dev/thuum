#!/usr/bin/env bash
# client-sunshine-port.sh <vmid> <base>: set a Windows lab client's Sunshine base
# port through the guest agent (the host's guest-run helper runs the script as
# SYSTEM) and print what it listens on afterwards.
set -euo pipefail
vmid=${1:?vmid}; base=${2:?base port, e.g. 48989}
jump=${JUMP_HOST:-root@core.gaussing.tv}
here=$(cd "$(dirname "$0")/../.." && pwd)
tmp=$(mktemp -t sunshine-port).ps1
sed "s/^param(\[int\]\$Base = 48989)/param([int]\$Base = $base)/" "$here/lab/deploy/sky-client/sunshine-port.ps1" > "$tmp"
scp -q -o BatchMode=yes "$tmp" "$jump:/root/sky-client/sunshine-port-$vmid.ps1"
ssh -o BatchMode=yes "$jump" "GUEST_RUN_TIMEOUT=150 /root/sky-client/guest-run.sh $vmid /root/sky-client/sunshine-port-$vmid.ps1; rc=\$?; rm -f /root/sky-client/sunshine-port-$vmid.ps1; exit \$rc" 2>&1 | grep -v -E 'CLIXML|<Objs'
rm -f "$tmp"
