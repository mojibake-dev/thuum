#!/usr/bin/env bash
# client-dump-arm.sh <vmid> [count]: arm ProcDump on a clone for the next
# SkyrimSE.exe launch. It waits for the process (-w), attaches as a debugger,
# and writes a mini dump (thread stacks, module list, the exception record)
# for each of the first <count> access violations it sees, first chance
# included (-e 1 -f C0000005): the game's silent exits of 0xC0000005 leave no
# WER dump, because something in the process handles the fault before it is
# unhandled (docs/verbs/appearance.md). Dumps land in C:\sky-lab\dumps;
# `just client-dumps <vmid>` lists and fetches them.
#
# ProcDump runs as a one-shot SYSTEM task and ends by itself once it has its
# dumps or the game exits. Never kill it while the game runs: a debugger that
# exits without detaching takes its debuggee down (Windows'
# DebugSetProcessKillOnExit default), as frida-inject did on 2026-10-05.
set -euo pipefail
vmid=${1:?vmid}; count=${2:-10}
jump=${JUMP_HOST:-root@core.gaussing.tv}
enc() { printf '%s' "$1" | iconv -f UTF-8 -t UTF-16LE | base64 | tr -d '\n'; }
ps="if (-not (Test-Path 'C:\\sky-lab\\frida\\procdump64.exe')) { throw 'no C:\\sky-lab\\frida\\procdump64.exe' }
New-Item -ItemType Directory -Force 'C:\\sky-lab\\dumps' | Out-Null
\$a = New-ScheduledTaskAction -Execute 'C:\\sky-lab\\frida\\procdump64.exe' -Argument '-accepteula -e 1 -f C0000005 -n $count -mm -w SkyrimSE.exe C:\\sky-lab\\dumps'
\$p = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest
\$s = New-ScheduledTaskSettingsSet -ExecutionTimeLimit (New-TimeSpan -Hours 4) -MultipleInstances IgnoreNew
Register-ScheduledTask -TaskName 'sky-lab-procdump' -Action \$a -Principal \$p -Settings \$s -Force | Out-Null
Start-ScheduledTask -TaskName 'sky-lab-procdump'
Start-Sleep 2
(Get-ScheduledTask -TaskName 'sky-lab-procdump').State.ToString() + ', waiting for SkyrimSE.exe; dumps so far: ' + @(Get-ChildItem 'C:\\sky-lab\\dumps' -Filter *.dmp -ErrorAction SilentlyContinue).Count"
ssh -o BatchMode=yes "$jump" "qm guest exec $vmid --timeout 60 -- powershell -NoProfile -NonInteractive -EncodedCommand $(enc "$ps")" \
  | python3 -c 'import sys,json; d=json.load(sys.stdin); print((d.get("out-data") or "").strip()); print((d.get("err-data") or "").strip()[-400:], file=sys.stderr) if d.get("exitcode") else None; sys.exit(0 if d.get("exitcode")==0 else 1)'
