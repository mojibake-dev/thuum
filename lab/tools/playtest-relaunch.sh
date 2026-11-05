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
  local stamp kind src copy name tmp ps
  stamp=$(date -u +%Y%m%dT%H%M%SZ); tmp=$(mktemp)
  ssh -o BatchMode=yes -J "$jump" "$srv" 'sudo mkdir -p /srv/lab/results/relaunch-logs && sudo chown eli:eli /srv/lab/results/relaunch-logs' 2>/dev/null \
    || { echo "could not reach the results site: $client's logs not kept" >&2; rm -f "$tmp"; return 0; }
  for spec in "platform|'$spl'" "driver|(Join-Path (Get-Content -LiteralPath 'C:\\sky-lab\\game-dir.txt' -Raw).Trim() 'Data\\Platform\\Logs\\lab-driver-logs.txt')"; do
    kind=${spec%%|*}; src=${spec#*|}; name=$stamp-$client-$kind.log; copy="C:\\sky-lab\\relaunch-$name"
    # copied, then cut to its first 2,000 and last 8,000 lines when longer, so one file-read through the guest agent
    # stays far under the answer size that killed sky-c1's agent once (~5.6 MB; playtest 45's c1 log ran to 25k error lines)
    ps="Copy-Item -LiteralPath $src -Destination '$copy' -Force; \$t = Get-Content -LiteralPath '$copy'; if (\$t.Count -gt 10000) { \$n = \$t.Count; Set-Content -LiteralPath '$copy' -Value (\$t[0..1999] + ('... ' + (\$n - 10000) + ' lines left out by the relaunch keep ...') + \$t[-8000..-1]) }"
    ssh -o BatchMode=yes "$jump" "flock -w 90 /run/lock/qga-$vmid qm guest exec $vmid --timeout 60 -- powershell -NoProfile -NonInteractive -EncodedCommand $(enc "$ps")" >/dev/null 2>&1 || true
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
# the game's process within a minute of the task, else the task again, at most twice (playtest 46, 14:34: both seats'
# tasks ran right after their streams opened, neither game started, nothing crashed or logged an error, and the wait
# below ran its five minutes out)
gexec() { ssh -o BatchMode=yes "$jump" "flock -w 90 /run/lock/qga-$vmid qm guest exec $vmid --timeout 60 -- powershell -NoProfile -NonInteractive -EncodedCommand $(enc "$1")" 2>/dev/null | python3 -c 'import sys,json; print((json.load(sys.stdin).get("out-data") or "").strip())' 2>/dev/null || true; }
for retry in 1 2 3; do
  up=0
  for i in $(seq 1 12); do
    sleep 5
    [ "$(gexec 'if (Get-Process SkyrimSE -ErrorAction SilentlyContinue) { "up" } else { "down" }')" = up ] && { up=1; break; }
  done
  [ "$up" = 1 ] && break
  [ "$retry" = 3 ] && { echo "$client: no game process after the launch task three times" >&2; exit 4; }
  echo "$client: no game process a minute after the launch task; the task again ($retry)" >&2
  gexec 'Start-ScheduledTask -TaskName sky-lab-launch; "started"' >/dev/null
done
# off the list once the game is gone, then back on it after the login
for i in $(seq 1 20); do case "$(online)" in *"\"profileId\":$profile}"*) sleep 3;; *) break;; esac; done
back=0
for i in $(seq 1 48); do case "$(online)" in *"\"profileId\":$profile}"*) back=1; break;; esac; sleep 5; done
[ "$back" = 1 ] || { echo "$client did not come back online within four minutes" >&2; exit 4; }
echo "$client (profile $profile) is back online"
# Survival off and its prompt answered again for this seat: a relaunch lets the game's own save switch Survival back on
# (playtest 46: Prisoner's after a restore with no ready step), sent only after a steady minute of this seat's heartbeats
# (playtest 43: a re-send 5 s after a relaunch froze c2); the last line stays the online one for the callers that read it
steady=0
for i in $(seq 1 18); do
  hb=$(curl -fsS -m 10 "$api/status" 2>/dev/null | python3 -c "import sys,json; print(json.load(sys.stdin).get('heartbeats_s_ago',{}).get('$client', 99))" 2>/dev/null || echo 99)
  if python3 -c "import sys; sys.exit(0 if float('$hb') < 8 else 1)"; then steady=$((steady + 1)); else steady=0; fi
  [ "$steady" -ge 6 ] && break
  sleep 10
done
if [ "$steady" -ge 6 ]; then
  for g in '"8df:ccQDRSSE001-SurvivalMode.esl",1' '"828:ccQDRSSE001-SurvivalMode.esl",0'; do
    curl -fsS -m 20 -X POST "$api/state/rpc/labCommand" -H 'content-type: application/json' \
      -d "{\"payload\": {\"kind\":\"console\",\"profileId\":$profile,\"name\":\"SetGlobal\",\"args\":[20,$g]}}" >/dev/null 2>&1 \
      || echo "$client: survival's global $g not sent" >&2
  done
  echo "$client: survival off and its prompt answered, sent after a steady minute" >&2
else
  echo "$client: survival off NOT re-sent, its heartbeats never held steady for a minute" >&2
fi
echo "$client (profile $profile) is back online"
exit 0
