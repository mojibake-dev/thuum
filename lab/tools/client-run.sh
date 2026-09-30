#!/usr/bin/env bash
# client-run.sh <vmid> <script.ps1>: run a PowerShell script in the lab user's
# interactive session on a Windows lab client. The guest agent runs as SYSTEM in
# session 0, so the script is staged as C:\sky-lab\run.ps1 and the on-demand
# task sky-lab-run (register-runner.ps1) executes it as `lab` on the desktop;
# whatever it writes to C:\sky-lab\run.out is printed. steam:// links, the
# game's launcher and the game itself need this path.
set -euo pipefail
vmid=${1:?vmid}; script=${2:?path of a .ps1}
jump=${JUMP_HOST:-root@core.gaussing.tv}
wait_s=${RUN_WAIT_S:-20}
enc() { printf '%s' "$1" | iconv -f UTF-8 -t UTF-16LE | base64 | tr -d '\n'; }
body=$(cat "$script")
launcher="Set-Content -Path 'C:\\sky-lab\\run.ps1' -Value @'
$body
'@
Remove-Item 'C:\\sky-lab\\run.out' -ErrorAction SilentlyContinue
Start-ScheduledTask -TaskName 'sky-lab-run'
Start-Sleep -Seconds $wait_s
@{ state = (Get-ScheduledTask -TaskName 'sky-lab-run').State.ToString(); result = (Get-ScheduledTaskInfo -TaskName 'sky-lab-run').LastTaskResult; out = ((Get-Content 'C:\\sky-lab\\run.out' -ErrorAction SilentlyContinue) -join ' | ') } | ConvertTo-Json -Compress"
ssh -o BatchMode=yes "$jump" "qm guest exec $vmid --timeout $((wait_s + 60)) -- powershell -NoProfile -NonInteractive -EncodedCommand $(enc "$launcher")" \
  | python3 -c 'import sys,json; d=json.load(sys.stdin); print((d.get("out-data") or "").strip()); sys.exit(0 if d.get("exitcode")==0 else 1)'
