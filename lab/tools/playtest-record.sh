#!/usr/bin/env bash
# playtest-record.sh <n>: a playtest recorded like a run (thuum ADR-033, decision 3). The recorder (the
# lab-driver's watch, ADR-031) runs on both seats for the whole playtest through lab-api's playtest assist,
# cycled every PLAYTEST_CYCLE_S (300): each seat's watch-stop, its trace saved on the results site as
# /srv/lab/results/playtest-<n>/trace-<client>-<k>.json, watch-start again. It ends when the playtest's hold
# is gone (the world saved and the hold released) or on Ctrl-C, with a last cycle; then it fetches the
# server's log since its start and each game's Skyrim Platform log and lab-driver log into the same
# directory, and writes summary.txt: every cycle's traces, and any game whose Skyrim Platform log stopped
# while the playtest went on (a finding, ADR-033; playtest nineteen's c1 log stopped at the restore).
# Refuses without docs/private/playtest-m2-<n>.md (the number and the checklist are one thing) and without a
# playtest's hold (start it after `just playtest-restore`). Run it in the background; the only steps it
# sends a game are the recorder's own.
set -uo pipefail
n=${1:?playtest number, as in docs/private/playtest-m2-<n>.md}
here=$(cd "$(dirname "$0")/../.." && pwd)
main_root=$(dirname "$(git -C "$here" rev-parse --path-format=absolute --git-common-dir)")
[ -f "$main_root/docs/private/playtest-m2-$n.md" ] || { echo "no docs/private/playtest-m2-$n.md: the number names a checklist" >&2; exit 2; }
api=${LAB_API:-https://thuum.gaussing.tv/lab}
jump=${JUMP_HOST:-root@core.gaussing.tv}
srv=${SRV_HOST:-eli@10.10.70.10}
cycle=${PLAYTEST_CYCLE_S:-300}
# the bools the recorder samples on each actor (watch-start's `bools`): casting, staggering, attacking, blocking
bools=${PLAYTEST_BOOLS:-'["IsCastingRight","IsCastingLeft","bWantCastRight","bWantCastLeft","IsStaggering","IsAttacking","IsBlocking"]'}
out=/srv/lab/results/playtest-$n
spl='C:\Users\lab\Documents\My Games\Skyrim Special Edition\SKSE\skyrim-platform.log'
started=$(date -u +%Y-%m-%dT%H:%M:%SZ)
tmp=$(mktemp -d)
ssh_srv() { ssh -o BatchMode=yes -o ServerAliveInterval=15 -J "$jump" "$srv" "$@"; }
hold() {  # a playtest's hold on the lab: yes, no, or unknown (lab-api not answering)
  curl -fsS -m 15 "$api/status" 2>/dev/null \
    | python3 -c 'import json,sys; h=json.load(sys.stdin).get("hold") or {}; print("yes" if str(h.get("reason","")).startswith("playtest") else "no")' 2>/dev/null \
    || echo unknown
}
assist() {  # assist <client> <action> <args json>: the step's answer as lab-api gives it
  curl -sS -m 120 -X POST "$api/clients/$1/assist" -H 'content-type: application/json' -d "{\"action\":\"$2\",\"args\":$3}"
}
note() { echo "$(date +%H:%M:%S) $*" | tee -a "$tmp/summary.txt"; }

[ "$(hold)" = yes ] || { echo "no playtest hold on the lab: start this after just playtest-restore (or playtest-start)" >&2; exit 2; }
ssh_srv "sudo mkdir -p $out && sudo chown eli:eli $out"
note "playtest $n recorded from $started UTC, a cycle every $cycle s, into https://thuum.gaussing.tv/results/playtest-$n/"

start_watch() {
  for c in c1 c2; do
    r=$(assist "$c" watch-start "{\"bools\":$bools}")
    case "$r" in *'"ok":true'*) ;; *) note "$c: watch-start not taken: $(printf '%s' "$r" | cut -c1-160)";; esac
  done
}
stop_watch() {  # stop_watch <k>: each seat's trace to the results site
  for c in c1 c2; do
    assist "$c" watch-stop '{}' > "$tmp/stop-$c.json"
    # the trace out of lab-api's answer, and one line about it (python from a heredoc: no quotes to escape)
    if line=$(python3 - "$tmp/stop-$c.json" "$tmp/trace-$c-$1.json" <<'PY'
import json, sys
d = json.load(open(sys.argv[1]))
t = d.get("result") if d.get("ok") else None
if not isinstance(t, dict):
    sys.exit(1)
json.dump(t, open(sys.argv[2], "w"), indent=1, sort_keys=True)
me = t.get("self") or {}
print(f"{t.get('seconds', 0):.0f} s, {len(t.get('actors') or [])} actors, {len(me.get('events') or [])} own events, {len(me.get('casts') or [])} casts")
PY
    ); then
      ssh_srv "cat > $out/trace-$c-$1.json" < "$tmp/trace-$c-$1.json"
      note "$c: trace-$c-$1.json, $line"
    else
      note "$c: watch-stop gave no trace: $(cut -c1-160 "$tmp/stop-$c.json")"
    fi
  done
}

stopping=0
trap 'stopping=1' INT TERM
start_watch
k=0
while :; do
  waited=0
  while [ "$waited" -lt "$cycle" ] && [ "$stopping" = 0 ]; do
    sleep 15 || true; waited=$((waited + 15))
    [ "$(hold)" = no ] && { note "the playtest's hold is gone: last cycle"; stopping=1; }
  done
  k=$((k + 1))
  stop_watch "$k"
  [ "$stopping" = 1 ] && break
  start_watch
done
trap - INT TERM

note "logs"
ssh_srv "cd /srv/lab && docker compose logs --no-color --since $started skymp-server" > "$tmp/server.log" 2>/dev/null
ssh_srv "cat > $out/server.log" < "$tmp/server.log" && note "server.log: $(wc -l < "$tmp/server.log" | tr -d ' ') lines since $started"
ended=$(date +%s)
for pair in c1:711 c2:712; do
  c=${pair%%:*}; vmid=${pair#*:}
  # copied first, as lab-api's runner does: the game holds its logs open without read sharing
  for spec in "$c.log|'$spl'" "$c-driver.log|(Join-Path (Get-Content -LiteralPath 'C:\\sky-lab\\game-dir.txt' -Raw).Trim() 'Data\\Platform\\Logs\\lab-driver-logs.txt')"; do
    name=${spec%%|*}; src=${spec#*|}
    copy="C:\\sky-lab\\playtest-$n-$name"
    ssh -o BatchMode=yes "$jump" "qm guest exec $vmid --timeout 60 -- powershell -NoProfile -Command \"Copy-Item -LiteralPath $src -Destination '$copy' -Force\"" > /dev/null 2>&1
    ssh -o BatchMode=yes "$jump" "pvesh get /nodes/core/qemu/$vmid/agent/file-read --file '$copy' --output-format json" 2>/dev/null \
      | python3 -c 'import json,sys; sys.stdout.write(json.load(sys.stdin).get("content",""))' > "$tmp/$name" 2>/dev/null
    ssh_srv "cat > $out/$name" < "$tmp/$name" && note "$name: $(wc -l < "$tmp/$name" | tr -d ' ') lines"
  done
  # a game whose log stops while the playtest goes on is a finding (ADR-033)
  last=$(grep -o '^\[[0-9][0-9]:[0-9][0-9]:[0-9][0-9]' "$tmp/$c.log" | tail -1 | tr -d '[')
  if [ -n "$last" ]; then
    gap=$(python3 -c 'import sys,datetime as d; now=d.datetime.now(); h,m,s=map(int,sys.argv[1].split(":")); t=now.replace(hour=h,minute=m,second=s,microsecond=0); print(int((now-t).total_seconds()//60))' "$last")
    [ "$gap" -gt $((cycle / 60)) ] && note "FINDING $c: its Skyrim Platform log's last line is at $last, $gap min before the recording's end (ADR-033: a game whose log stops)"
  fi
done
ssh_srv "cat > $out/summary.txt" < "$tmp/summary.txt"
echo "playtest $n recorded: https://thuum.gaussing.tv/results/playtest-$n/ ($k cycles)"
rm -rf "$tmp"
