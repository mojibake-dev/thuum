#!/usr/bin/env bash
# client-identity.sh <vmid> <client> <profile>: the scenario client name and the
# profile id a clone plays (identity.ps1 as SYSTEM through the host's guest-run helper).
set -euo pipefail
vmid=${1:?vmid}; client=${2:?client name, e.g. c2}; profile=${3:?profile id, e.g. 2}
jump=${JUMP_HOST:-root@core.gaussing.tv}
here=$(cd "$(dirname "$0")/../.." && pwd)
tmp=$(mktemp -t client-identity).ps1
sed "s/^param(\[string\]\$Client = 'c1', \[int\]\$Profile = 1)/param([string]\$Client = '$client', [int]\$Profile = $profile)/" "$here/lab/deploy/sky-client/identity.ps1" > "$tmp"
scp -q -o BatchMode=yes "$tmp" "$jump:/root/sky-client/identity-$vmid.ps1"
ssh -o BatchMode=yes "$jump" "GUEST_RUN_TIMEOUT=120 /root/sky-client/guest-run.sh $vmid /root/sky-client/identity-$vmid.ps1; rc=\$?; rm -f /root/sky-client/identity-$vmid.ps1; exit \$rc" 2>&1 | grep -v -E 'CLIXML|<Objs'
rm -f "$tmp"
