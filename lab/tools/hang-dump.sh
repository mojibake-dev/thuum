#!/usr/bin/env bash
# hang-dump.sh <c1|c2>: a frozen seat's evidence taken by hand while no run is active (a freeze in a playtest, or after
# a run ended), into the last finished run's results: a full dump of SkyrimSE.exe and the seat's skse64.log and
# skyrim-platform.log. It is the runner's own hang evidence (runner._HANG_DUMP_PS: dbghelp's MiniDumpWriteDump as
# SYSTEM through the guest agent), uploaded by the seat to PUT /lab/clients/<client>/hang-dump/<run>, which takes the
# last finished run's id only while nothing runs. Run it before anything rolls the clone back.
set -euo pipefail
client=${1:?client: c1 or c2}
case "$client" in c1) vmid=711;; c2) vmid=712;; *) echo "unknown client $client" >&2; exit 2;; esac
api=${LAB_API:-https://thuum.gaussing.tv/lab}
seat_api=${CLIENT_LAB_API_URL:-http://10.10.70.10/lab}   # lab-api as the clones reach it
jump=${JUMP_HOST:-root@core.gaussing.tv}
here=$(cd "$(dirname "$0")/../.." && pwd)
run=$(curl -fsS -m 15 "$api/status" | python3 -c 'import json,sys; d=json.load(sys.stdin); print("" if d.get("run") else (d.get("last_run") or ""))')
active=$(curl -fsS -m 15 "$api/status" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("run") or "")')
[ -z "$active" ] || { echo "a run is active ($active): the runner takes a hung seat's evidence itself" >&2; exit 2; }
if [ -z "$run" ]; then
  # no run has finished since lab-api started (2026-10-28, playtest 37's freeze: nowhere to upload): the evidence stays on
  # the seat, a ProcDump (Sysinternals, staged in C:\sky-lab\procdump, its signature checked at the staging) mini-plus
  # dump of SkyrimSE.exe (threads, stacks, modules, private memory) and both logs beside it in C:\sky-lab\dumps; pull
  # it before anything rolls the clone back, since a rollback erases it
  stamp=$(date -u +%Y%m%dT%H%M%SZ)
  enc() { printf '%s' "$1" | iconv -f UTF-8 -t UTF-16LE | base64 | tr -d '\n'; }
  ps="\$pd = 'C:\\sky-lab\\procdump\\procdump64.exe'; if (-not (Test-Path \$pd)) { 'no ProcDump on the seat'; exit 1 }
New-Item -ItemType Directory -Force -Path 'C:\\sky-lab\\dumps' | Out-Null
\$g = Get-Process SkyrimSE -ErrorAction SilentlyContinue | Select-Object -First 1; if (-not \$g) { 'no SkyrimSE running'; exit 1 }
& \$pd -accepteula -mp \$g.Id 'C:\\sky-lab\\dumps\\$client-hang-$stamp.dmp' | Out-Null
\$d = 'C:\\Users\\lab\\Documents\\My Games\\Skyrim Special Edition\\SKSE'
foreach (\$n in 'skse64.log', 'skyrim-platform.log') { Copy-Item -LiteralPath (Join-Path \$d \$n) -Destination ('C:\\sky-lab\\dumps\\$client-hang-$stamp-' + \$n) -Force }
Get-ChildItem 'C:\\sky-lab\\dumps' -Filter '$client-hang-$stamp*' | ForEach-Object { \$_.Name + ' ' + \$_.Length }"
  echo "== $client: no finished run to upload into; ProcDump dump kept on the seat $(date +%H:%M:%S)"
  ssh -o BatchMode=yes "$jump" "qm guest exec $vmid --timeout 600 -- powershell -NoProfile -NonInteractive -EncodedCommand $(enc "$ps")" \
    | python3 -c 'import json,sys; d=json.load(sys.stdin); print((d.get("out-data") or "").strip())'
  echo "== $client evidence in C:\\sky-lab\\dumps on VM $vmid (pull before a rollback)"
  exit 0
fi
url="$seat_api/clients/$client/hang-dump/$run"
enc() { printf '%s' "$1" | iconv -f UTF-8 -t UTF-16LE | base64 | tr -d '\n'; }
guest() { ssh -o BatchMode=yes "$jump" "qm guest exec $vmid --timeout ${2:-120} -- powershell -NoProfile -NonInteractive -EncodedCommand $1" \
  | python3 -c 'import json,sys; d=json.load(sys.stdin); print((d.get("out-data") or "").strip()); sys.exit(0 if d.get("exitcode") == 0 else 1)'; }
dump=$(cd "$here" && uv run --project lab/labapi python -c '
import base64, sys
sys.path.insert(0, "lab/labapi")
from labapi import runner
s = runner._HANG_DUMP_PS.replace("@LAB_DIR@", sys.argv[1]).replace("@URL@", sys.argv[2]).replace("@UPLOAD_S@", "540")
print(base64.b64encode(s.encode("utf-16-le")).decode())' 'C:\sky-lab' "$url" 2>/dev/null | tail -1)
echo "== $client: the dump into $run $(date +%H:%M:%S)"
guest "$dump" 900 | tail -1 || echo "   the dump script did not end cleanly"
dir='C:\Users\lab\Documents\My Games\Skyrim Special Edition\SKSE'
for name in skse64.log skyrim-platform.log; do
  ps="Copy-Item -LiteralPath '$dir\\$name' -Destination 'C:\\sky-lab\\$client-hang-$name' -Force; & \"\$env:SystemRoot\\System32\\curl.exe\" --fail --silent --show-error --upload-file 'C:\\sky-lab\\$client-hang-$name' '$url?name=$name'; 'curl ' + \$LASTEXITCODE"
  echo "   $name: $(guest "$(enc "$ps")" | tail -1)"
done
echo "== $client evidence at https://thuum.gaussing.tv/results/$run/ ($client-SkyrimSE.dmp, $client-skse64.log, $client-skyrim-platform.log)"
