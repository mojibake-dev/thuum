#!/usr/bin/env bash
# guest-task.sh <vmid> <name> <powershell> [minutes]: run PowerShell on a lab
# clone as a one-shot SYSTEM scheduled task (sky-lab-<name>) and wait for it,
# printing the last line it wrote to C:\sky-lab\<name>.out. Long guest work
# runs this way, not inside `qm guest exec`: the agent's exec ends after a few
# minutes and takes the script with it (add-game.ps1 on sky-c1, 2026-10-04;
# install-lab.ps1 on a fresh client dist, 2026-10-06). Exits 0 when the task
# ended with result 0, 4 when it ended otherwise (the output's tail goes to
# stderr), 5 when it is still running after <minutes> (default 30).
set -euo pipefail
vmid=${1:?vmid}; name=${2:?task name}; ps=${3:?powershell}; minutes=${4:-30}
jump=${JUMP_HOST:-root@core.gaussing.tv}
enc() { printf '%s' "$1" | iconv -f UTF-8 -t UTF-16LE | base64 | tr -d '\n'; }
run() { ssh -o BatchMode=yes "$jump" "qm guest exec $vmid --timeout 120 -- powershell -NoProfile -NonInteractive -EncodedCommand $(enc "$1")" | python3 -c 'import sys,json; d=json.load(sys.stdin); print((d.get("out-data") or "").strip()); sys.exit(0 if d.get("exitcode")==0 else 1)'; }
script="C:\\sky-lab\\task-$name.ps1"; out="C:\\sky-lab\\$name.out"
# the command goes to the clone as a script file, so it needs no quoting
# inside the task's argument line
b64=$(printf '%s' "$ps" | base64 | tr -d '\n')
start="[IO.File]::WriteAllText('$script', [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('$b64')))
Remove-Item '$out' -ErrorAction SilentlyContinue
\$a = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument \"-NoProfile -ExecutionPolicy Bypass -Command & '$script' *> '$out'\"
\$p = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest
\$s = New-ScheduledTaskSettingsSet -ExecutionTimeLimit (New-TimeSpan -Minutes $minutes) -MultipleInstances IgnoreNew
Register-ScheduledTask -TaskName 'sky-lab-$name' -Action \$a -Principal \$p -Settings \$s -Force | Out-Null
Start-ScheduledTask -TaskName 'sky-lab-$name'; 'started'"
run "$start" >/dev/null
poll="\$i = Get-ScheduledTaskInfo -TaskName 'sky-lab-$name'; (Get-ScheduledTask -TaskName 'sky-lab-$name').State.ToString() + ' ' + \$i.LastTaskResult + ' | ' + ((Get-Content '$out' -Tail 1 -ErrorAction SilentlyContinue) -join '')"
deadline=$(( $(date +%s) + minutes * 60 ))
while [ "$(date +%s)" -lt "$deadline" ]; do
  sleep 5
  line=$(run "$poll" 2>/dev/null | tr -d '\r' | tail -1) || continue
  case "$line" in
    Running*) ;;
    "Ready 0 "*) echo "${line#*| }"; exit 0 ;;
    "Ready 267011 "*) ;;  # registered, not started yet
    Ready*) echo "task sky-lab-$name failed: $line" >&2; run "Get-Content '$out' -Tail 15" >&2 || true; exit 4 ;;
  esac
done
echo "task sky-lab-$name still running after $minutes minutes" >&2; exit 5
