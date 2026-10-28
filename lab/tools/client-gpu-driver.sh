#!/usr/bin/env bash
# client-gpu-driver.sh <vmid> [installer.exe | srv:<path>]: install the NVIDIA GeForce driver on
# a Windows lab client whose GPU came through vfio. The template has no NVIDIA
# driver (it was built without a GPU), so every clone gets this once. The
# installer (chosen by the card's PCI device id from lab/.cache/nvidia-driver-<family>.exe,
# fetched by `just gpu-driver-fetch`, or given explicitly) rides the in-VLAN HTTP hop to C:\sky-lab\redist
# and runs silently without a reboot; the adapters are listed before and after. `srv:<path>` names an
# installer already on sky-srv (core stages one under /srv/persist/tools), so nothing crosses from this Mac.
set -euo pipefail
vmid=${1:?vmid}; exe=${2:-}
jump=${JUMP_HOST:-root@core.gaussing.tv}
here=$(cd "$(dirname "$0")/../.." && pwd)
srv=${SRV_HOST:-eli@10.10.70.10}; srv_ip=${SRV_IP:-10.10.70.10}; port=${DIST_PORT:-8765}
enc() { printf '%s' "$1" | iconv -f UTF-8 -t UTF-16LE | base64 | tr -d '\n'; }
run() { ssh -o BatchMode=yes "$jump" "qm guest exec $vmid --timeout ${2:-120} -- powershell -NoProfile -NonInteractive -EncodedCommand $(enc "$1")" | python3 -c 'import sys,json; d=json.load(sys.stdin); print((d.get("out-data") or "").strip()); sys.exit(0 if d.get("exitcode")==0 else 1)'; }
echo "== adapters before"; run "Get-CimInstance Win32_VideoController | ForEach-Object { '  ' + \$_.Name + ' [' + \$_.DriverVersion + '] ' + \$_.Status }"
if [ -z "$exe" ]; then
  # the package by the card: NVIDIA's branches split by family, and a Pascal package refuses a Blackwell
  # card with no log (sky-c2, 2026-10-01). The PCI device id decides: GP107 1C83 is Pascal, GB206 2D04 Blackwell.
  # (a heredoc, not a $(...) substitution: macOS bash 3.2 misparses parentheses inside one)
  read -r -d '' detect <<'PS' || true
(Get-CimInstance Win32_PnPEntity | Where-Object { $_.DeviceID -like 'PCI\VEN_10DE&DEV_*' -and $_.PNPClass -ne 'MEDIA' } | Select-Object -First 1).DeviceID -replace '^PCI\\VEN_10DE&DEV_([0-9A-F]{4}).*', '$1'
PS
  dev=$(run "$detect" 2>/dev/null | tail -1 | tr -d '\r')
  case "$dev" in
    1C8[0-9A-F]|1C[0-9A-F][0-9A-F]|1B[0-9A-F][0-9A-F]) family=pascal;;
    2[B-F][0-9A-F][0-9A-F]) family=blackwell;;
    *) echo "no package mapping for NVIDIA device id '$dev' on VM $vmid (pass the installer explicitly)" >&2; exit 2;;
  esac
  exe="$here/lab/.cache/nvidia-driver-$family.exe"; echo "== card DEV_$dev: $family package"
fi
ssh -o BatchMode=yes -J "$jump" "$srv" 'mkdir -p /srv/lab/handover'
case "$exe" in
  srv:*)
    src=${exe#srv:}
    want=$(ssh -o BatchMode=yes -J "$jump" "$srv" "cp '$src' /srv/lab/handover/nvidia-driver.exe && sha256sum /srv/lab/handover/nvidia-driver.exe" | awk '{print $1}')
    [ -n "$want" ] || { echo "no installer at $src on sky-srv" >&2; exit 2; }
    echo "== $src on sky-srv, sha256 $want";;
  *)
    test -f "$exe" || { echo "no installer at $exe (just gpu-driver-fetch)" >&2; exit 2; }
    want=$(shasum -a 256 "$exe" | awk '{print $1}')
    scp -q -o BatchMode=yes -J "$jump" "$exe" "$srv:/srv/lab/handover/nvidia-driver.exe";;
esac
ssh -o BatchMode=yes -J "$jump" "$srv" "cd /srv/lab/handover && (nohup python3 -m http.server $port --bind $srv_ip >/dev/null 2>&1 & echo \$! > .http.pid)"
got=$(run "Get-Process SkyrimSE, skse64_loader -ErrorAction SilentlyContinue | Stop-Process -Force; New-Item -ItemType Directory -Force -Path 'C:\\sky-lab\\redist' | Out-Null; \$ProgressPreference='SilentlyContinue'; Invoke-WebRequest -UseBasicParsing -Uri 'http://$srv_ip:$port/nvidia-driver.exe' -OutFile 'C:\\sky-lab\\redist\\nvidia-driver.exe'; (Get-FileHash -Algorithm SHA256 'C:\\sky-lab\\redist\\nvidia-driver.exe').Hash.ToLower()" 1500 | tail -1 | tr -d '\r') || true
ssh -o BatchMode=yes -J "$jump" "$srv" "kill \$(cat /srv/lab/handover/.http.pid) 2>/dev/null; rm -f /srv/lab/handover/nvidia-driver.exe /srv/lab/handover/.http.pid"
[ "$want" = "$got" ] || { echo "hash mismatch for the installer: $want vs $got" >&2; exit 3; }
echo "== installing (silent, no reboot)"
if ! run "\$p = Start-Process -FilePath 'C:\\sky-lab\\redist\\nvidia-driver.exe' -ArgumentList '-s','-noreboot','-noeula' -Wait -PassThru; 'installer exit ' + \$p.ExitCode; Remove-Item 'C:\\sky-lab\\redist\\nvidia-driver.exe' -Force" 1500; then
  # a display driver swap takes the guest agent's transport down under it, so the status poll can time out while
  # the installer runs on (sky-c2, 2026-10-28 19:1x; core sees it on every display driver swap through the agent).
  # The command removes the installer once Start-Process returns, so the file's absence is the installer's end.
  echo "== the agent lost the install's status mid-swap; waiting for the installer to end"
  left=unknown
  for _ in $(seq 1 90); do
    left=$(run "Test-Path 'C:\\sky-lab\\redist\\nvidia-driver.exe'" 60 2>/dev/null | tail -1 | tr -d '\r') || left=unknown
    [ "$left" = False ] && break
    sleep 10
  done
  [ "$left" = False ] || { echo "the installer is still on the clone after 15 min" >&2; exit 4; }
  echo "   the installer ended (its file is gone); its exit code went with the lost status, so read the adapters"
fi
echo "== adapters after"; run "Get-CimInstance Win32_VideoController | ForEach-Object { '  ' + \$_.Name + ' [' + \$_.DriverVersion + '] ' + \$_.Status + ' ' + \$_.CurrentHorizontalResolution + 'x' + \$_.CurrentVerticalResolution }"
