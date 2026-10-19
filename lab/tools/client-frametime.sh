#!/usr/bin/env bash
# client-frametime.sh <c1|c2> [seconds] [label] [captures]: the game's frame times on a lab client, read by PresentMon
# (GameTechDev's ETW capture, the standard tool; client-frida.sh stages it as C:\sky-lab\frida\PresentMon.exe, again
# whenever a rollback took it). Each capture prints one line: the frames, mean fps, the frame time's mean, p50 and p99
# (p99 is the decision number: the hitch a player feels), the 1% low (the fps of the slowest 1% of frames), and the
# p50 and p99 of CPU busy, all in ms, with the game's sync interval (1 is vsync at the display's 60 Hz, which caps fps
# and hides a cost inside the 16.7 ms budget until frames miss it). Two captures by default, so one hitch does not
# decide. The CSVs stay on the clone under C:\sky-lab\frametime\.
# The clones need display, GPU and input tracking off: their IddCx virtual display (what Sunshine streams) never
# reports a frame displayed, so PresentMon holds every frame and writes no row, dwm.exe's included (2026-10-19, c1,
# Windows 11 26200; ETW itself delivered 2,506 DXGI events in 3 s). That costs the GPU columns.
# For a mod's cost (FSMP on the GTX 1050 seat, the essentials layer): the same spot and view, the cost toggled (FSMP's
# DLL renamed for an off launch), never the view turned away, since that changes what is drawn too. Nothing here moves
# the seat or touches the game.
set -euo pipefail
client=${1:?client: c1 or c2}; secs=${2:-30}; label=${3:-capture}; captures=${4:-2}
case "$client" in c1) vmid=711;; c2) vmid=712;; *) echo "unknown client $client" >&2; exit 2;; esac
case "$label" in *[!A-Za-z0-9._-]*) echo "a label is letters, digits, dot, dash or underscore: $label" >&2; exit 2;; esac
here=$(cd "$(dirname "$0")/../.." && pwd)
jump=${JUMP_HOST:-root@core.gaussing.tv}
enc() { printf '%s' "$1" | iconv -f UTF-8 -t UTF-16LE | base64 | tr -d '\n'; }
run() {  # run <timeout> <powershell>: the guest's output, its exit code passed on; an answer that is no JSON (the
  # guest agent's status read timed out, as on the first live captures, 2026-10-19 12:01) is asked again, since a
  # capture is safe to repeat (turbo-client.sh's rule)
  local out try
  for try in 1 2 3; do
    out=$(ssh -o BatchMode=yes "$jump" "qm guest exec $vmid --timeout $1 -- powershell -NoProfile -NonInteractive -EncodedCommand $(enc "$2")" 2>&1 || true)
    printf '%s' "$out" | python3 -c 'import sys,json; json.load(sys.stdin, strict=False)' 2>/dev/null && break
    sleep 5
  done
  printf '%s' "$out" | python3 -c 'import sys,json
try: d = json.load(sys.stdin, strict=False)
except Exception: print("no answer from the guest agent"); sys.exit(1)
print((d.get("out-data") or d.get("err-data") or "").strip()); sys.exit(0 if d.get("exitcode")==0 else 1)'
}
pm=$(ls "$here"/lab/.cache/presentmon/PresentMon-*-x64.exe 2>/dev/null | sort -V | tail -1 || true)
[ -n "$pm" ] || { echo "no PresentMon in lab/.cache/presentmon: gh release download -R GameTechDev/PresentMon -p 'PresentMon-*-x64.exe' -D lab/.cache/presentmon" >&2; exit 2; }
want=$(shasum -a 256 "$pm" | awk '{print $1}')
have=$(run 60 "if (Test-Path 'C:\\sky-lab\\frida\\PresentMon.exe') { (Get-FileHash -Algorithm SHA256 'C:\\sky-lab\\frida\\PresentMon.exe').Hash.ToLower() } else { 'none' }" || true)
if [ "$have" != "$want" ]; then
  TOOLS=presentmon "$here/lab/tools/client-frida.sh" "$vmid" | sed 's/^/   /'
fi
for n in $(seq 1 "$captures"); do
  stamp=$(date -u +%Y%m%dT%H%M%SZ)
  ps="New-Item -ItemType Directory -Force -Path 'C:\\sky-lab\\frametime' | Out-Null
if (-not (Get-Process SkyrimSE -ErrorAction SilentlyContinue)) { throw 'SkyrimSE.exe is not running' }
\$csv = 'C:\\sky-lab\\frametime\\$stamp-$label.csv'
& 'C:\\sky-lab\\frida\\PresentMon.exe' --process_name SkyrimSE.exe --timed $secs --terminate_after_timed --output_file \$csv --no_console_stats --no_track_display --no_track_gpu --no_track_input --session_name sky-frametime --stop_existing_session 2>&1 | Out-Null
if (-not (Test-Path \$csv)) { throw 'PresentMon wrote no CSV' }
\$rows = @(Import-Csv \$csv)
if (\$rows.Count -lt 10) { throw ('only ' + \$rows.Count + ' frames in ' + \$csv) }
\$cols = \$rows[0].PSObject.Properties.Name
\$ftc = @('MsBetweenPresents', 'FrameTime', 'MsBetweenAppStart') | Where-Object { \$cols -contains \$_ } | Select-Object -First 1
if (-not \$ftc) { throw ('no frame time column in ' + (\$cols -join ',')) }
function V(\$c) { @(\$rows | ForEach-Object { \$_.\$c } | Where-Object { \$_ -and \$_ -ne 'NA' } | ForEach-Object { [double]\$_ } | Sort-Object) }
function Q(\$v, \$q) { if (\$v.Count -eq 0) { 'NA' } else { [math]::Round(\$v[[int][math]::Min(\$v.Count - 1, [math]::Floor(\$q * \$v.Count))], 2) } }
\$ft = V \$ftc
\$mean = (\$ft | Measure-Object -Average).Average
\$k = [math]::Max(1, [int][math]::Floor(\$ft.Count / 100))
\$low = 1000 / ((\$ft | Select-Object -Last \$k | Measure-Object -Average).Average)
\$cpu = if (\$cols -contains 'MsCPUBusy') { V 'MsCPUBusy' } else { @() }
\$sync = (\$rows | Group-Object SyncInterval | Sort-Object Count -Descending | Select-Object -First 1).Name
'{0} frames in $secs s: {1} fps; frame ms mean {2} p50 {3} p99 {4} ({5}); 1% low {6} fps; CPU busy ms p50 {7} p99 {8}; sync interval {9}' -f \$ft.Count, [math]::Round(1000 / \$mean, 1), [math]::Round(\$mean, 2), (Q \$ft 0.5), (Q \$ft 0.99), \$ftc, [math]::Round(\$low, 1), (Q \$cpu 0.5), (Q \$cpu 0.99), \$sync"
  line=$(run $(( secs + 90 )) "$ps") || { echo "== $client $label capture $n: $line" >&2; exit 3; }
  echo "$client $label $n/$captures ($stamp): $line"
done
