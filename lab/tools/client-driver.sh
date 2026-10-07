#!/usr/bin/env bash
# client-driver.sh <vmid> [profile]: push the built lab-driver bundle into a clone's
# Data\Platform\Plugins, relaunch the game through the launch test, confirm
# the login and the lab-driver heartbeat, then stop the game so the clone's
# clean-sp snapshot can be retaken cold (lab-api's rollback erases anything
# staged after the snapshot, so a driver change always ends in a retake).
set -euo pipefail
vmid=${1:?vmid}
# the clone's profile id (1 sky-c1, 2 sky-c2): the login to wait for; without
# it any online player counts, which another running client satisfies
profile=${2:-}
jump=${JUMP_HOST:-root@core.gaussing.tv}
here=$(cd "$(dirname "$0")/../.." && pwd)
f="$here/lab/driver/build/lab-driver.js"
test -f "$f" || { echo "build the driver first: just build-driver" >&2; exit 2; }
enc() { printf '%s' "$1" | iconv -f UTF-8 -t UTF-16LE | base64 | tr -d '\n'; }
# the guest agent now and then answers nothing at all (2026-10-07, twice in
# one staging round): an answer that is no JSON is asked again, three times
run() {
  local out try
  for try in 1 2 3; do
    out=$(ssh -o BatchMode=yes "$jump" "qm guest exec $vmid --timeout 120 -- powershell -NoProfile -NonInteractive -EncodedCommand $(enc "$1")" || true)
    if printf '%s' "$out" | python3 -c 'import sys,json; json.load(sys.stdin, strict=False)' 2>/dev/null; then break; fi
    echo "guest agent answered no JSON (try $try of 3)" >&2
    sleep 10
  done
  printf '%s' "$out" | python3 -c 'import sys,json; d=json.load(sys.stdin, strict=False); print((d.get("out-data") or "").strip()); sys.exit(0 if d.get("exitcode")==0 else 1)'
}
script="New-Item -ItemType Directory -Force -Path 'C:\\sky-lab' | Out-Null
\$in=[Console]::OpenStandardInput(); \$f=[IO.File]::Create('C:\\sky-lab\\lab-driver.js'); \$in.CopyTo(\$f); \$f.Close()"
ssh -o BatchMode=yes "$jump" "qm guest exec $vmid --pass-stdin 1 --timeout 120 -- powershell -NoProfile -NonInteractive -EncodedCommand $(enc "$script")" < "$f" | python3 -c 'import sys,json; d=json.load(sys.stdin); sys.exit(0 if d.get("exitcode")==0 else 1)'
want=$(shasum -a 256 "$f" | awk '{print $1}')
got=$(run "(Get-FileHash -Algorithm SHA256 'C:\\sky-lab\\lab-driver.js').Hash.ToLower()")
[ "$want" = "$got" ] || { echo "hash mismatch: $want vs $got" >&2; exit 3; }
# into every game folder the clone keeps (C:\sky-lab\games, ADR-022), or game-dir.txt's on a clone with none recorded
run "\$gs = @(if (Test-Path 'C:\\sky-lab\\games') { Get-ChildItem 'C:\\sky-lab\\games' -Filter '*.txt' | ForEach-Object { (Get-Content \$_.FullName -Raw).Trim() } }); if (-not \$gs) { \$gs = @((Get-Content 'C:\\sky-lab\\game-dir.txt' -Raw).Trim()) }; Get-Process SkyrimSE, skse64_loader -ErrorAction SilentlyContinue | Stop-Process -Force; Start-Sleep -Seconds 2; foreach (\$g in \$gs) { Copy-Item 'C:\\sky-lab\\lab-driver.js' (Join-Path \$g 'Data\\Platform\\Plugins\\lab-driver.js') -Force; 'installed ' + (Get-FileHash -Algorithm SHA256 (Join-Path \$g 'Data\\Platform\\Plugins\\lab-driver.js')).Hash.ToLower().Substring(0, 16) + ' in ' + \$g }"
lab_api=${LAB_API:-https://thuum.gaussing.tv/lab}
for attempt in 1 2; do
  RUN_WAIT_S=70 "$here/lab/tools/client-launch-test.sh" "$vmid" 2>&1 | grep -v "^  skse_log" || true
  n=0; on=""
  seen="\"profileId\":${profile}}"; [ -n "$profile" ] || seen='profileId'
  until [ $n -ge 9 ]; do n=$((n+1)); on=$(curl -sS -m 15 -X POST "$lab_api/state/rpc/labState" -H 'content-type: application/json' -d '{"payload":{"kind":"online"}}'); case "$on" in *"$seen"*) break;; esac; sleep 10; done
  case "$on" in *"$seen"*) echo "online: $on"; break;; esac
  # the game exits silently now and then right after its save loads (twice on 2026-10-01, only on a relaunch inside a running session); one retry
  echo "not online after launch $attempt: $on"
  [ "$attempt" = 2 ] && exit 4
done
echo "heartbeats (s ago): $(curl -sS -m 15 "$lab_api/status" | python3 -c 'import sys,json; print(json.load(sys.stdin)["heartbeats_s_ago"])')"
run "Get-Process SkyrimSE, skse64_loader -ErrorAction SilentlyContinue | Stop-Process -Force; Start-Sleep -Seconds 3; 'stopped; tasks: ' + ((Get-ScheduledTask -TaskName 'sky-lab-*' | ForEach-Object { \$_.TaskName + '=' + \$_.State }) -join ' ')"
echo "ready for a cold retake of the clone's lab snapshot (thuum-mundus; clean-m1 since 2026-10-02)"
