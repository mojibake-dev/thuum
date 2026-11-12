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
# Platform, lab-driver and client console logs go to the results site's
# relaunch-logs/ as <stamp>-<client>-platform.log, -driver.log and -console.log
# (the console is lab-console-logs.txt, where skymp5-client's own lines go:
# playtest 48 kept none and lost three resets' trap lines); a log that cannot
# be kept is said and the relaunch goes on.
# playtest-relaunch.sh <client> stop | start: the two halves apart, so a pair of seats can be stopped together and started
# one after the other (playtest_setup.py's relaunch_seats, playtest-world.sh's restore; Eli's word of 2026-11-11, "Restore
# and ready()"): stop keeps the logs, stops the game, sets the playtest's client settings and waits until the player is off
# the server; start runs the launch task and every wait after it. A seat relaunched alone hands its cells to the other
# (playtest 46), and two logging in at once let one's Story Manager start race the other's relayed start (b-ghostwalk-look).
set -euo pipefail
client=${1:?client: c1 or c2}
phase=${2:-both}
case "$client" in c1) vmid=711; profile=1;; c2) vmid=712; profile=2;; *) echo "unknown client $client" >&2; exit 2;; esac
case "$phase" in both|stop|start) ;; *) echo "the phase is stop or start (or none for both), got $phase" >&2; exit 2;; esac
jump=${JUMP_HOST:-root@core.gaussing.tv}
api=${LAB_API:-https://thuum.gaussing.tv/lab}
srv=${SRV_HOST:-eli@10.10.70.10}
spl='C:\Users\lab\Documents\My Games\Skyrim Special Edition\SKSE\skyrim-platform.log'
# the lab is Eli's for the playtest: runs, run sets and the nightly wait (lab-api's hold, docs/LAB.md); `just lab-release` ends it.
# A standing hold is never cut short or renamed: one with three hours or more left stands as it is, and a shorter one keeps its
# reason for the three hours (playtest-go's proof, 2026-11-05: ready's relaunch turned the profile's hold into this one's
# 180 minutes, an hour short of 45's 240, which the recorder and the nightly both read)
hold() {
  local st left reason
  st=$(curl -fsS -m 15 "$api/status" 2>/dev/null | python3 -c 'import json, sys
h = (json.load(sys.stdin) or {}).get("hold") or {}
print(int(h.get("seconds_left") or 0), h.get("reason") or "")' 2>/dev/null) || st="0 "
  left=${st%% *}
  reason=${st#* }
  [ "${left:-0}" -ge 10800 ] 2>/dev/null && return 0
  [ -n "$reason" ] || reason=$1
  curl -fsS -m 15 -X POST "$api/hold" -H 'content-type: application/json' \
    -d "$(python3 -c 'import json, sys; print(json.dumps({"minutes": 180, "reason": sys.argv[1]}))' "$reason")" >/dev/null 2>&1 || true
}
enc() { printf '%s' "$1" | iconv -f UTF-8 -t UTF-16LE | base64 | tr -d '\n'; }
# copy_ps <src expression> <copy>: a log the game holds open for writing, copied with read-write sharing as lab-api's
# log-count and Frida copies are (runner.py): a plain Copy-Item shares no writes and is refused then ("being used by
# another process", 193821, 194559, 195437). The old copy goes first and a failed open stops the script (exit 1) before
# a new copy is made, so a caller that reads only after a zero exit never takes an older or empty copy for the log
copy_ps() { printf '%s' "\$ErrorActionPreference = 'Stop'; Remove-Item -LiteralPath '$2' -Force -ErrorAction SilentlyContinue; \$s = [IO.File]::Open($1, 'Open', 'Read', 'ReadWrite'); \$d = [IO.File]::Create('$2'); \$s.CopyTo(\$d); \$d.Close(); \$s.Close()"; }
# read_ranged <vmid> <guest path> <local file>: a seat's file read back in 512 KiB ranges through Proxmox's own agent
# file-read (offset, count, decode=0; qemu-server 9.2.15 on core), as lab-api's Runner._read_back reads: one whole-file read
# of a console past about 1 MiB timed out on a busy seat (c1, 2026-11-12, 1,464,655 bytes: "guest-file-read failed - got
# timeout"). Each range's base64 is decoded strictly and checked against its bytes-read, as lab-api's file_read_range
# checks it, and asked up to three times; the file ends at the first short range; 1 when a range never came back, the
# bytes before it kept
read_ranged() {
  local at=0 n try part
  part=$(mktemp); : > "$3"
  while :; do
    for try in 1 2 3; do
      ssh -o BatchMode=yes "$jump" "pvesh get /nodes/core/qemu/$1/agent/file-read --file '$2' --offset $at --count 524288 --decode 0 --output-format json" 2>/dev/null \
        | python3 -c 'import base64,json,sys; d=json.load(sys.stdin); b=base64.b64decode(d["content"] or "", validate=True); n=d.get("bytes-read"); sys.exit(1) if n is not None and int(n) != len(b) else sys.stdout.buffer.write(b)' > "$part" 2>/dev/null && break
      [ "$try" = 3 ] && { rm -f "$part"; return 1; }
      sleep 3
    done
    n=$(wc -c < "$part" | tr -d ' ')
    cat "$part" >> "$3"
    [ "$n" -eq 524288 ] || break
    at=$((at + n))
  done
  rm -f "$part"
}
# fetch_copy <vmid> <powershell> <copy> <local file>: the copy made on the seat (copy_ps), then read back in ranges
# (read_ranged) once its exec exits 0, three tries 3 s apart, since the guest agent's answer is now and then lost or not
# JSON (client-frametime's captures, 2026-10-19; sky-c2's "PID does not exist", 20261018-204244). A copy never made, or a
# read cut short, leaves what came back and its reason in $why, so no caller takes an older copy or a short one for the log
fetch_copy() {
  local code try
  why=""
  for try in 1 2 3; do
    : > "$4"
    code=$(ssh -o BatchMode=yes "$jump" "flock -w 90 /run/lock/qga-$1 qm guest exec $1 --timeout 60 -- powershell -NoProfile -NonInteractive -EncodedCommand $(enc "$2")" 2>/dev/null \
      | python3 -c 'import json,sys; print(json.load(sys.stdin).get("exitcode"))' 2>/dev/null || true)
    if [ "$code" = 0 ]; then
      read_ranged "$1" "$3" "$4" && { why=""; return 0; }
      why=" (read back short after $try tries: a range never came back)"
    else
      why=" (no copy after $try tries: its exec exited ${code:-without an answer})"
    fi
    [ "$try" = 3 ] || sleep 3
  done
  return 1
}
keep() {  # the logs of the session the stop ends, off the clone, each copied first (copy_ps: the game holds them open)
  local stamp kind src copy name tmp
  stamp=$(date -u +%Y%m%dT%H%M%SZ); tmp=$(mktemp)
  ssh -o BatchMode=yes -J "$jump" "$srv" 'sudo mkdir -p /srv/lab/results/relaunch-logs && sudo chown eli:eli /srv/lab/results/relaunch-logs' 2>/dev/null \
    || { echo "could not reach the results site: $client's logs not kept" >&2; rm -f "$tmp"; return 0; }
  for spec in "platform|'$spl'" "driver|(Join-Path (Get-Content -LiteralPath 'C:\\sky-lab\\game-dir.txt' -Raw).Trim() 'Data\\Platform\\Logs\\lab-driver-logs.txt')" \
              "console|(Join-Path (Get-Content -LiteralPath 'C:\\sky-lab\\game-dir.txt' -Raw).Trim() 'Data\\Platform\\Logs\\lab-console-logs.txt')"; do
    kind=${spec%%|*}; src=${spec#*|}; name=$stamp-$client-$kind.log; copy="C:\\sky-lab\\relaunch-$name"
    # whole, read back in ranges (fetch_copy); it was cut to its first 2,000 and last 8,000 lines while one whole-file read
    # carried it (playtest 45's c1 log ran to 25k error lines)
    fetch_copy "$vmid" "$(copy_ps "$src" "$copy")" "$copy" "$tmp" || true
    if [ -s "$tmp" ] && ssh -o BatchMode=yes -J "$jump" "$srv" "cat > /srv/lab/results/relaunch-logs/$name" < "$tmp"; then
      echo "kept $client's $kind log, $(wc -l < "$tmp" | tr -d ' ') lines$why: https://thuum.gaussing.tv/results/relaunch-logs/$name"
    else
      echo "could not keep $client's $kind log before the relaunch$why" >&2
    fi
  done
  rm -f "$tmp"
}
online() { curl -fsS -m 15 -X POST "$api/state/rpc/labState" -H 'content-type: application/json' -d '{"payload": {"kind":"online"}}' 2>/dev/null; }
active=$(curl -fsS -m 15 "$api/status" | python3 -c 'import sys,json; print(json.load(sys.stdin).get("run") or "")')
hold "playtest (playtest-relaunch)"
[ -z "$active" ] || { echo "a lab run is active: $active" >&2; exit 3; }
# a playtest's client settings (PLAYTEST=<n>: profile n's clientSettings, playtest_setup.py settings-ps, the runner's own
# relaunch file change; ready sets it for its two relaunches) set in the stopped game before its launch task, each printing a
# "set ..." line echoed below. A dist push or a clone rollback lays the dist's copy of the file again, so the relaunch after
# one names the playtest: `PLAYTEST=51 just playtest-relaunch c1`. Read before anything stops, so a profile that does not
# load leaves the game running.
settings=""
if [ "$phase" != start ] && [ -n "${PLAYTEST:-}" ]; then
  root=$(cd "$(dirname "$0")/../.." && pwd)
  b64=$(uv run --project "$root/lab/labapi" python "$root/lab/tools/playtest_setup.py" settings-ps "$PLAYTEST") \
    || { echo "playtest $PLAYTEST's client settings do not load: nothing relaunched" >&2; exit 2; }
  [ -z "$b64" ] || settings=$(printf '%s' "$b64" | base64 -d)
fi
if [ "$phase" = start ]; then
  # the game was stopped by this script's stop half; only the launch task now
  ps='Start-ScheduledTask -TaskName sky-lab-launch; "relaunch started " + (Get-Date -Format HH:mm:ss)'
  want="relaunch started "
else
  keep
  ps='Get-Process SkyrimSE, skse64_loader -ErrorAction SilentlyContinue | Stop-Process -Force; Start-Sleep -Seconds 3'
  [ -z "$settings" ] || ps="$ps
$settings"
  if [ "$phase" = stop ]; then
    ps="$ps"'
"stopped " + (Get-Date -Format HH:mm:ss)'
    want="stopped "
  else
    ps="$ps"'
Start-ScheduledTask -TaskName sky-lab-launch; "relaunch started " + (Get-Date -Format HH:mm:ss)'
    want="relaunch started "
  fi
fi
# the guest agent once answered nothing right after a stream started
# (2026-10-09 11:55, sky-c2: the game stopped, the task never started); the
# same command again is safe, stopping nothing new and starting the task
for attempt in 1 2; do
  out=$(ssh -o BatchMode=yes "$jump" "flock -w 90 /run/lock/qga-$vmid qm guest exec $vmid --timeout 60 -- powershell -NoProfile -NonInteractive -EncodedCommand $(enc "$ps")" 2>&1 || true)
  line=$(printf '%s' "$out" | python3 -c 'import sys,json; print((json.load(sys.stdin).get("out-data") or "").strip().splitlines()[-1])' 2>/dev/null || true)
  # the script's own last line, not just any last line: a settings block's error stops the script after its "set ..." lines
  case "$line" in
    "$want"*)
      [ -z "$settings" ] || { printf '%s' "$out" | python3 -c 'import sys,json; [print(l) for l in (json.load(sys.stdin).get("out-data") or "").splitlines() if l.startswith("set ")]' || true; }
      echo "$line"; break ;;
  esac
  echo "the guest agent answered no '$want' line (attempt $attempt): ${out:0:200}" >&2
  [ "$attempt" = 2 ] && exit 5
  sleep 5
done
if [ "$phase" = stop ]; then
  # off the server's online list before the caller starts any seat (about 18 s, netcode's timeout), judged on reads that
  # answered: a failed read is no proof the player is gone
  gone=0
  for i in $(seq 1 30); do
    o=$(online) || o=""
    if [ -n "$o" ] && ! printf '%s' "$o" | grep -q "\"profileId\":$profile}"; then gone=1; break; fi
    sleep 3
  done
  [ "$gone" = 1 ] || { echo "$client (profile $profile) still on the server's online list 90 s after its stop" >&2; exit 4; }
  echo "$client (profile $profile) is stopped and off the server"
  exit 0
fi
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
