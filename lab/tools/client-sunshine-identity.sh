#!/usr/bin/env bash
# client-sunshine-identity.sh <vmid> <name>: a clone's own Sunshine identity
# (sunshine-identity.ps1 as SYSTEM through the host's guest-run helper).
set -euo pipefail
vmid=${1:?vmid}; name=${2:?name, e.g. "sky client 2"}
jump=${JUMP_HOST:-root@core.gaussing.tv}
here=$(cd "$(dirname "$0")/../.." && pwd)
tmp=$(mktemp -t sunshine-identity).ps1
sed "s/^param(\[string\]\$Name = 'sky client')/param([string]\$Name = '$name')/" "$here/lab/deploy/sky-client/sunshine-identity.ps1" > "$tmp"
grep -q "Name = '$name'" "$tmp" || { echo "name not set in the script" >&2; exit 2; }
scp -q -o BatchMode=yes "$tmp" "$jump:/root/sky-client/sunshine-identity-$vmid.ps1"
rm -f "$tmp"
ssh -o BatchMode=yes "$jump" "GUEST_RUN_TIMEOUT=120 /root/sky-client/guest-run.sh $vmid /root/sky-client/sunshine-identity-$vmid.ps1; rc=\$?; rm -f /root/sky-client/sunshine-identity-$vmid.ps1; exit \$rc" 2>&1 | grep -v -E 'CLIXML|<Objs'
