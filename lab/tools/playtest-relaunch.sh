#!/usr/bin/env bash
# playtest-relaunch.sh <client>: in a T4 playtest (docs/private/playtest-*.md),
# quit a player's game and start it again, as closing Skyrim and launching it
# later would ("quit test 1"). The clone's game stops through the guest agent
# and its logon task sky-lab-launch starts the game again in the lab user's
# session; the game loads a fresh generated save, so whatever the player sees
# after the login is what the server gave back. Waits until the player is on
# the server's online list again. The session's own logs are kept first: the
# game rewrites its Skyrim Platform log at the next start and a rollback erases
# the clone's files (playtest 44's crash sessions were lost so), so its Skyrim
# Platform and lab-driver logs go to the results site's relaunch-logs/ as
# <stamp>-<client>-platform.log and -driver.log; a log that cannot be kept is
# said and the relaunch goes on.
set -euo pipefail
client=${1:?client: c1 or c2}
case "$client" in c1) vmid=711; profile=1;; c2) vmid=712; profile=2;; *) echo "unknown client $client" >&2; exit 2;; esac
jump=${JUMP_HOST:-root@core.gaussing.tv}
api=${LAB_API:-https://thuum.gaussing.tv/lab}
srv=${SRV_HOST:-eli@10.10.70.10}
spl='C:\Users\lab\Documents\My Games\Skyrim Special Edition\SKSE\skyrim-platform.log'
# the lab is Eli's for the playtest: runs, run sets and the nightly wait (lab-api's hold, docs/LAB.md); `just lab-release` ends it
hold() { curl -fsS -m 15 -X POST "$api/hold" -H 'content-type: application/json' -d "{\"minutes\": 180, \"reason\": \"$1\"}" >/dev/null 2>&1 || true; }
enc() { printf '%s' "$1" | iconv -f UTF-8 -t UTF-16LE | base64 | tr -d '\n'; }
keep() {  # the logs of the session the stop ends, off the clone, copied first as playtest-record.sh does (the game holds them open)
  local stamp kind src copy name tmp
  stamp=$(date -u +%Y%m%dT%H%M%SZ); tmp=$(mktemp)
  ssh -o BatchMode=yes -J "$jump" "$srv" 'sudo mkdir -p /srv/lab/results/relaunch-logs && sudo chown eli:eli /srv/lab/results/relaunch-logs' 2>/dev/null \
    || { echo "could not reach the results site: $client's logs not kept" >&2; rm -f "$tmp"; return 0; }
  for spec in "platform|'$spl'" "driver|(Join-Path (Get-Content -LiteralPath 'C:\\sky-lab\\game-dir.txt' -Raw).Trim() 'Data\\Platform\\Logs\\lab-driver-logs.txt')"; do
    kind=${spec%%|*}; src=${spec#*|}; name=$stamp-$client-$kind.log; copy="C:\\sky-lab\\relaunch-$name"
    ssh -o BatchMode=yes "$jump" "flock -w 90 /run/lock/qga-$vmid qm guest exec $vmid --timeout 60 -- powershell -NoProfile -Command \"Copy-Item -LiteralPath $src -Destination '$copy' -Force\"" >/dev/null 2>&1 || true
    ssh -o BatchMode=yes "$jump" "pvesh get /nodes/core/qemu/$vmid/agent/file-read --file '$copy' --output-format json" 2>/dev/null \
      | python3 -c 'import json,sys; sys.stdout.write(json.load(sys.stdin).get("content",""))' > "$tmp" 2>/dev/null || true
    if [ -s "$tmp" ] && ssh -o BatchMode=yes -J "$jump" "$srv" "cat > /srv/lab/results/relaunch-logs/$name" < "$tmp"; then
      echo "kept $client's $kind log, $(wc -l < "$tmp" | tr -d ' ') lines: https://thuum.gaussing.tv/results/relaunch-logs/$name"
    else
      echo "could not keep $client's $kind log before the relaunch" >&2
    fi
  done
  rm -f "$tmp"
}
online() { curl -fsS -m 15 -X POST "$api/state/rpc/labState" -H 'content-type: application/json' -d '{"payload": {"kind":"online"}}' 2>/dev/null; }
active=$(curl -fsS -m 15 "$api/status" | python3 -c 'import sys,json; print(json.load(sys.stdin).get("run") or "")')
hold "playtest (playtest-relaunch)"
[ -z "$active" ] || { echo "a lab run is active: $active" >&2; exit 3; }
keep
ps='Get-Process SkyrimSE, skse64_loader -ErrorAction SilentlyContinue | Stop-Process -Force; Start-Sleep -Seconds 3; Start-ScheduledTask -TaskName sky-lab-launch; "relaunch started " + (Get-Date -Format HH:mm:ss)'
# the guest agent once answered nothing right after a stream started
# (2026-10-09 11:55, sky-c2: the game stopped, the task never started); the
# same command again is safe, stopping nothing new and starting the task
for attempt in 1 2; do
  out=$(ssh -o BatchMode=yes "$jump" "flock -w 90 /run/lock/qga-$vmid qm guest exec $vmid --timeout 60 -- powershell -NoProfile -NonInteractive -EncodedCommand $(enc "$ps")" 2>&1 || true)
  line=$(printf '%s' "$out" | python3 -c 'import sys,json; print((json.load(sys.stdin).get("out-data") or "").strip().splitlines()[-1])' 2>/dev/null || true)
  [ -n "$line" ] && { echo "$line"; break; }
  echo "the guest agent answered no relaunch line (attempt $attempt): ${out:0:200}" >&2
  [ "$attempt" = 2 ] && exit 5
  sleep 5
done
# off the list once the game is gone, then back on it after the login
for i in $(seq 1 20); do case "$(online)" in *"\"profileId\":$profile}"*) sleep 3;; *) break;; esac; done
for i in $(seq 1 60); do case "$(online)" in *"\"profileId\":$profile}"*) echo "$client (profile $profile) is back online"; exit 0;; esac; sleep 5; done
echo "$client did not come back online within five minutes" >&2; exit 4
