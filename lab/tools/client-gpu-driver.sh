#!/usr/bin/env bash
# client-gpu-driver.sh <vmid> [installer.exe]: install the NVIDIA GeForce driver on
# a Windows lab client whose GPU came through vfio. The template has no NVIDIA
# driver (it was built without a GPU), so every clone gets this once. The
# installer (lab/.cache/nvidia-driver.exe by default; fetch the current WHQL
# build with `just gpu-driver-fetch`) rides the in-VLAN HTTP hop to C:\sky-lab\redist
# and runs silently without a reboot; the adapters are listed before and after.
set -euo pipefail
vmid=${1:?vmid}; exe=${2:-}
jump=${JUMP_HOST:-root@core.gaussing.tv}
here=$(cd "$(dirname "$0")/../.." && pwd)
[ -n "$exe" ] || exe="$here/lab/.cache/nvidia-driver.exe"
test -f "$exe" || { echo "no installer at $exe (just gpu-driver-fetch)" >&2; exit 2; }
srv=${SRV_HOST:-eli@10.10.70.10}; srv_ip=${SRV_IP:-10.10.70.10}; port=${DIST_PORT:-8765}
enc() { printf '%s' "$1" | iconv -f UTF-8 -t UTF-16LE | base64 | tr -d '\n'; }
run() { ssh -o BatchMode=yes "$jump" "qm guest exec $vmid --timeout ${2:-120} -- powershell -NoProfile -NonInteractive -EncodedCommand $(enc "$1")" | python3 -c 'import sys,json; d=json.load(sys.stdin); print((d.get("out-data") or "").strip()); sys.exit(0 if d.get("exitcode")==0 else 1)'; }
echo "== adapters before"; run "Get-CimInstance Win32_VideoController | ForEach-Object { '  ' + \$_.Name + ' [' + \$_.DriverVersion + '] ' + \$_.Status }"
want=$(shasum -a 256 "$exe" | awk '{print $1}')
ssh -o BatchMode=yes -J "$jump" "$srv" 'mkdir -p /srv/lab/handover'
scp -q -o BatchMode=yes -J "$jump" "$exe" "$srv:/srv/lab/handover/nvidia-driver.exe"
ssh -o BatchMode=yes -J "$jump" "$srv" "cd /srv/lab/handover && (nohup python3 -m http.server $port --bind $srv_ip >/dev/null 2>&1 & echo \$! > .http.pid)"
got=$(run "Get-Process SkyrimSE, skse64_loader -ErrorAction SilentlyContinue | Stop-Process -Force; New-Item -ItemType Directory -Force -Path 'C:\\sky-lab\\redist' | Out-Null; \$ProgressPreference='SilentlyContinue'; Invoke-WebRequest -UseBasicParsing -Uri 'http://$srv_ip:$port/nvidia-driver.exe' -OutFile 'C:\\sky-lab\\redist\\nvidia-driver.exe'; (Get-FileHash -Algorithm SHA256 'C:\\sky-lab\\redist\\nvidia-driver.exe').Hash.ToLower()" 600 | tail -1 | tr -d '\r') || true
ssh -o BatchMode=yes -J "$jump" "$srv" "kill \$(cat /srv/lab/handover/.http.pid) 2>/dev/null; rm -f /srv/lab/handover/nvidia-driver.exe /srv/lab/handover/.http.pid"
[ "$want" = "$got" ] || { echo "hash mismatch for the installer: $want vs $got" >&2; exit 3; }
echo "== installing (silent, no reboot)"
run "\$p = Start-Process -FilePath 'C:\\sky-lab\\redist\\nvidia-driver.exe' -ArgumentList '-s','-noreboot','-noeula' -Wait -PassThru; 'installer exit ' + \$p.ExitCode; Remove-Item 'C:\\sky-lab\\redist\\nvidia-driver.exe' -Force" 1500
echo "== adapters after"; run "Get-CimInstance Win32_VideoController | ForEach-Object { '  ' + \$_.Name + ' [' + \$_.DriverVersion + '] ' + \$_.Status + ' ' + \$_.CurrentHorizontalResolution + 'x' + \$_.CurrentVerticalResolution }"
