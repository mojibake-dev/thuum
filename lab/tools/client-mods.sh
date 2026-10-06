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
enc() { printf '%s' "$1" | iconv -f UTF-8 -t UTF-16LE | base64 | tr -d '\n'; }
run() { ssh -o BatchMode=yes "$jump" "qm guest exec $vmid --timeout 600 -- powershell -NoProfile -NonInteractive -EncodedCommand $(enc "$1")" | python3 -c 'import sys,json; d=json.load(sys.stdin); print((d.get("out-data") or "").strip()); print((d.get("err-data") or "").strip()[-600:], file=sys.stderr) if d.get("exitcode") else None; sys.exit(0 if d.get("exitcode")==0 else 1)'; }
ssh -o BatchMode=yes -J "$jump" "$srv" "test -f /srv/persist/mods/SHA256SUMS && mkdir -p /srv/lab/handover" \
  || { echo "no /srv/persist/mods/SHA256SUMS on sky-srv (just persist-mods)" >&2; exit 2; }
ssh -o BatchMode=yes -J "$jump" "$srv" "cd /srv/persist/mods && (nohup python3 -m http.server $port --bind $srv_ip >/dev/null 2>&1 & echo \$! > /srv/lab/handover/.mods-http.pid)"
trap 'ssh -o BatchMode=yes -J "$jump" "$srv" "kill \$(cat /srv/lab/handover/.mods-http.pid) 2>/dev/null; rm -f /srv/lab/handover/.mods-http.pid"' EXIT
sleep 1
# a one-shot SYSTEM task, as add-game: the guest agent's exec can end before a
# long script does (client-game.sh)
start="Get-Process SkyrimSE, skse64_loader -ErrorAction SilentlyContinue | Stop-Process -Force
if (-not (Test-Path 'C:\\sky-lab\\add-mods.ps1')) { throw 'no C:\\sky-lab\\add-mods.ps1 (just client-dist)' }
Remove-Item 'C:\\sky-lab\\add-mods.out' -ErrorAction SilentlyContinue
\$a = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument \"-NoProfile -ExecutionPolicy Bypass -Command & 'C:\\sky-lab\\add-mods.ps1' -From 'http://$srv_ip:$port' *> 'C:\\sky-lab\\add-mods.out'\"
\$p = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest
\$s = New-ScheduledTaskSettingsSet -ExecutionTimeLimit (New-TimeSpan -Hours 1) -MultipleInstances IgnoreNew
Register-ScheduledTask -TaskName 'sky-lab-add-mods' -Action \$a -Principal \$p -Settings \$s -Force | Out-Null
Start-ScheduledTask -TaskName 'sky-lab-add-mods'; 'started'"
run "$start" >/dev/null
poll="\$t = Get-ScheduledTask -TaskName 'sky-lab-add-mods'; \$i = Get-ScheduledTaskInfo -TaskName 'sky-lab-add-mods'; \$t.State.ToString() + ' ' + \$i.LastTaskResult + ' | ' + ((Get-Content 'C:\\sky-lab\\add-mods.out' -Tail 1 -ErrorAction SilentlyContinue) -join '')"
for i in $(seq 1 120); do
  sleep 10
  line=$(run "$poll" 2>/dev/null | tr -d '\r' | tail -1) || continue
  case "$line" in
    Running*) printf '  %s\n' "${line:0:160}" ;;
    Ready\ 0\ *) echo "${line#*| }"; exit 0 ;;
    Ready*) echo "add-mods failed: $line" >&2; run "Get-Content 'C:\\sky-lab\\add-mods.out' -Tail 15" >&2 || true; exit 4 ;;
  esac
done
echo "add-mods still running after twenty minutes" >&2; exit 5
