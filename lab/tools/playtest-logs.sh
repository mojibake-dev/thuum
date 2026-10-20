#!/usr/bin/env bash
# playtest-logs.sh <n> <since UTC, 2026-10-19T23:28:25Z>: a playtest's logs kept on the results site when no recorder
# ran (playtest-record.sh fetches the same set at its end): the server's log since the session's start and each seat's
# Skyrim Platform, skse64, lab-driver and Sunshine logs, into /srv/lab/results/playtest-<n>/
# (https://thuum.gaussing.tv/results/playtest-<n>/). Run it before anything replaces the server container or rolls a
# clone back: a turbo-srv push recreates the container and its log goes with it, and a rollback erases a clone's
# files (Sunshine's log of playtest nineteen's second session was lost so). Read-only on the games: each log is
# copied first, as lab-api's runner does, since a game holds its logs open without read sharing.
set -euo pipefail
n=${1:?playtest number}; since=${2:?since, UTC: the world restore or the session start}
case "$n" in *[!0-9]*) echo "a playtest number is digits" >&2; exit 2;; esac
date -u -j -f '%Y-%m-%dT%H:%M:%SZ' "$since" +%s >/dev/null 2>&1 || { echo "since is UTC like 2026-10-19T23:28:25Z, not $since" >&2; exit 2; }
jump=${JUMP_HOST:-root@core.gaussing.tv}; host=${SRV_HOST:-eli@10.10.70.10}
out=/srv/lab/results/playtest-$n
ssh_srv() { ssh -o BatchMode=yes -o ServerAliveInterval=15 -J "$jump" "$host" "$@"; }
local_dir=${PLAYTEST_LOGS_DIR:-$(mktemp -d "${TMPDIR:-/tmp}/playtest-$n-logs.XXXX")}
ssh_srv "mkdir -p $out"
ssh_srv "cd /srv/lab && docker compose logs --no-color --since $since skymp-server" > "$local_dir/server.log"
ssh_srv "cat > $out/server.log" < "$local_dir/server.log"
echo "server.log: $(wc -l < "$local_dir/server.log" | tr -d ' ') lines since $since"
skse='C:\Users\lab\Documents\My Games\Skyrim Special Edition\SKSE'
for pair in c1:711 c2:712; do
  c=${pair%%:*}; vmid=${pair#*:}
  for spec in "$c.log|'$skse\\skyrim-platform.log'" "$c-skse64.log|'$skse\\skse64.log'" \
              "$c-driver.log|(Join-Path (Get-Content -LiteralPath 'C:\\sky-lab\\game-dir.txt' -Raw).Trim() 'Data\\Platform\\Logs\\lab-driver-logs.txt')" \
              "$c-sunshine.log|'C:\\Program Files\\Sunshine\\config\\sunshine.log'"; do
    name=${spec%%|*}; src=${spec#*|}
    copy="C:\\sky-lab\\playtest-$n-$name"
    # the guest agent's answer is now and then not JSON (client-frametime's captures, 2026-10-19): three tries
    for attempt in 1 2 3; do
      ssh -o BatchMode=yes "$jump" "qm guest exec $vmid --timeout 60 -- powershell -NoProfile -Command \"Copy-Item -LiteralPath $src -Destination '$copy' -Force\"" > /dev/null 2>&1 || true
      if ssh -o BatchMode=yes "$jump" "pvesh get /nodes/core/qemu/$vmid/agent/file-read --file '$copy' --output-format json" 2>/dev/null \
        | python3 -c 'import json,sys; d=json.load(sys.stdin); sys.stdout.write(d.get("content","")); sys.stderr.write(" (truncated by the agent)" if d.get("truncated") else "")' > "$local_dir/$name" 2>"$local_dir/$name.note"; then
        break
      fi
      echo " (no readable answer, try $attempt)" > "$local_dir/$name.note"; sleep 3
    done
    ssh_srv "cat > $out/$name" < "$local_dir/$name"
    echo "$name: $(wc -l < "$local_dir/$name" | tr -d ' ') lines$(cat "$local_dir/$name.note" 2>/dev/null)"
  done
done
echo "playtest $n's logs: https://thuum.gaussing.tv/results/playtest-$n/ (and $local_dir)"
