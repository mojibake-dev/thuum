#!/usr/bin/env bash
# client-frida.sh <vmid>: stage Frida's standalone injector (lab/.cache/frida/
# frida-inject.exe, from the frida release matching lab/frida/README.md) into
# C:\sky-lab\frida on a Windows lab client through the in-VLAN hop, so lab-api's
# POST /lab/frida and `just frida <script> <client>` can attach to the game.
set -euo pipefail
vmid=${1:?vmid}
jump=${JUMP_HOST:-root@core.gaussing.tv}; srv=${SRV_HOST:-eli@10.10.70.10}; srv_ip=${SRV_IP:-10.10.70.10}; port=${DIST_PORT:-8765}
here=$(cd "$(dirname "$0")/../.." && pwd)
f="$here/lab/.cache/frida/frida-inject.exe"
test -f "$f" || { echo "no $f: download frida-inject-<ver>-windows-x86_64.exe.xz from the frida release and unxz it there" >&2; exit 2; }
enc() { printf '%s' "$1" | iconv -f UTF-8 -t UTF-16LE | base64 | tr -d '\n'; }
run() { ssh -o BatchMode=yes "$jump" "qm guest exec $vmid --timeout 300 -- powershell -NoProfile -NonInteractive -EncodedCommand $(enc "$1")" | python3 -c 'import sys,json; d=json.load(sys.stdin); print((d.get("out-data") or "").strip()); sys.exit(0 if d.get("exitcode")==0 else 1)'; }
want=$(shasum -a 256 "$f" | awk '{print $1}')
ssh -o BatchMode=yes -J "$jump" "$srv" 'mkdir -p /srv/lab/handover'
scp -q -o BatchMode=yes -J "$jump" "$f" "$srv:/srv/lab/handover/frida-inject.exe"
ssh -o BatchMode=yes -J "$jump" "$srv" "cd /srv/lab/handover && (nohup python3 -m http.server $port --bind $srv_ip >/dev/null 2>&1 & echo \$! > .http.pid)"
got=$(run "New-Item -ItemType Directory -Force -Path 'C:\\sky-lab\\frida' | Out-Null; \$ProgressPreference='SilentlyContinue'; Invoke-WebRequest -UseBasicParsing -Uri 'http://$srv_ip:$port/frida-inject.exe' -OutFile 'C:\\sky-lab\\frida\\frida-inject.exe'; (Get-FileHash -Algorithm SHA256 'C:\\sky-lab\\frida\\frida-inject.exe').Hash.ToLower()" | tail -1 | tr -d '\r') || true
ssh -o BatchMode=yes -J "$jump" "$srv" "kill \$(cat /srv/lab/handover/.http.pid) 2>/dev/null; rm -f /srv/lab/handover/frida-inject.exe /srv/lab/handover/.http.pid"
[ "$want" = "$got" ] || { echo "hash mismatch: $want vs $got" >&2; exit 3; }
echo "staged C:\\sky-lab\\frida\\frida-inject.exe $got"
