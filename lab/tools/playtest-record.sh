#!/usr/bin/env bash
# playtest-record.sh <n>: a playtest recorded like a run (thuum ADR-033, decision 3). The recorder (the
# lab-driver's watch, ADR-031) runs on both seats for the whole playtest through lab-api's playtest assist,
# cycled every PLAYTEST_CYCLE_S (300): each seat's watch-stop, its trace saved on the results site as
# /srv/lab/results/playtest-<n>/trace-<client>-<k>.json, watch-start again. It ends when the playtest's hold
# is gone (the world saved and the hold released) or on Ctrl-C, with a last cycle; then it fetches the
# server's log since its start and each game's Skyrim Platform log and lab-driver log into the same
# directory, and writes summary.txt: every cycle's traces, and any game whose Skyrim Platform log stopped
# while the playtest went on (a finding, ADR-033). What writes a seat's log during play is its game replaying
# the OTHER seat's spell actions on that seat's figure (cast-action's performAction lines with their onResult
# and latent-callback lines); a seat's own casts, turns and sneaks write nothing to its own log, so a log is
# stopped only when the other seat made spell actions after its last line while its figure was in this
# seat's game (until 2026-10-15 the rule counted the seat's own events, and every "stop" it found in
# playtest nineteen's three sessions was a quiet log: no spell action of the other seat after the last line).
# Refuses without docs/private/playtest-m2-<n>.md (the number and the checklist are one thing) and without a
# playtest's hold (start it after `just playtest-restore`). Run it in the background; the only steps it
# sends a game are the recorder's own. End a playtest with `just playtest-record-stop` before the world's
# save and the hold's release, so the logs are fetched while the hold still keeps every run (and its
# rollback, which erases a clone's files: Sunshine's log of playtest nineteen's second session was lost so)
# off the clones; if the hold goes first, the recorder takes one of its own for its last cycle and fetch.
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
# the results directory: playtest-<n>, or PLAYTEST_LABEL for a second recording or a test (never over a playtest's own)
label=${PLAYTEST_LABEL:-playtest-$n}
case "$label" in *[!A-Za-z0-9-]*) echo "PLAYTEST_LABEL is letters, digits and dashes" >&2; exit 2;; esac
out=/srv/lab/results/$label
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
gexec() {  # gexec <vmid> <powershell>: its output; read-only work on a clone through the guest agent
  local enc
  enc=$(printf '%s' "$2" | iconv -f UTF-8 -t UTF-16LE | base64 | tr -d '\n')
  ssh -o BatchMode=yes "$jump" "qm guest exec $1 --timeout 60 -- powershell -NoProfile -NonInteractive -EncodedCommand $enc" 2>/dev/null \
    | python3 -c 'import json,sys; print(json.load(sys.stdin).get("out-data",""))' 2>/dev/null
}
vmid_of() { case "$1" in c1) echo 711;; c2) echo 712;; esac; }
other_of() { case "$1" in c1) echo c2;; c2) echo c1;; esac; }
# the live capture of a stopped Skyrim Platform log: each cycle reads the log's length through a handle that
# denies nobody and takes no oplock; the first cycle a seat's log has not grown while the other seat made
# spell actions that seat's game replays (the other seat's own trace, 3 s or more before its watch ended; this
# seat's trace showing a figure), its open handles on the file (handle64, beside the injector: client-frida
# stages it) and Defender's and the Application log's recent events are saved as capture-<client>-<k>.txt
declare -A logsize=() captured=()
live_check() {  # live_check <client> <k>: after both seats' traces of cycle k are in
  local c=$1 k=$2 o vmid size acts
  o=$(other_of "$c")
  vmid=$(vmid_of "$c")
  size=$(gexec "$vmid" "\$f = [IO.File]::Open('$spl', 'Open', 'Read', 'ReadWrite, Delete'); \$f.Length; \$f.Close()" | tr -d '\r\n ')
  acts=$(python3 - "$tmp/trace-$c-$k.json" "$tmp/trace-$o-$k.json" <<'PY'
import json, os, re, sys
mine, theirs = sys.argv[1], sys.argv[2]
if not (os.path.exists(mine) and os.path.exists(theirs)) or not json.load(open(mine)).get("actors"):
    print(0)  # no figure in this seat's game, or no trace of the other seat: nothing this log should hold
    sys.exit()
t = json.load(open(theirs))
end_ms = float(t.get("seconds") or 0) * 1000 - 3000
print(sum(1 for a in (t.get("self") or {}).get("actions") or []
          if float(a[0]) < end_ms and re.search(r"spell|equipped|dualmagic", str(a[3]), re.I)))
PY
)
  case "$size" in ''|*[!0-9]*) logsize[$c]=; return;; esac
  if [ -n "${logsize[$c]:-}" ] && [ "$size" = "${logsize[$c]}" ] && [ "${acts:-0}" -gt 0 ] && [ "${captured[$c]:-0}" = 0 ]; then
    captured[$c]=1
    if [ "$(gexec "$vmid" "Test-Path 'C:\\sky-lab\\frida\\handle64.exe'" | tr -d '\r\n')" != True ]; then
      "$here/lab/tools/client-frida.sh" "$vmid" > /dev/null 2>&1 || note "$c: could not stage handle64.exe for the capture"
    fi
    gexec "$vmid" "\$l = '$spl'
'== the file'; Get-Item -LiteralPath \$l | Format-List FullName, Length, LastWriteTime, Attributes | Out-String
'== the game''s handles on it (handle64 -p SkyrimSE.exe)'; & 'C:\\sky-lab\\frida\\handle64.exe' -accepteula -nobanner -p SkyrimSE.exe skyrim-platform 2>&1 | Out-String
'== every process holding it'; & 'C:\\sky-lab\\frida\\handle64.exe' -accepteula -nobanner skyrim-platform.log 2>&1 | Out-String
'== Defender, the last 10 minutes'; Get-WinEvent -FilterHashtable @{LogName='Microsoft-Windows-Windows Defender/Operational'; StartTime=(Get-Date).AddMinutes(-10)} -ErrorAction SilentlyContinue | Select-Object -First 40 | ForEach-Object { \$_.TimeCreated.ToString('HH:mm:ss') + ' ' + \$_.Id + ' ' + (\$_.Message -split [char]10)[0] }
'== Application errors, the last 10 minutes'; Get-WinEvent -FilterHashtable @{LogName='Application'; Level=2; StartTime=(Get-Date).AddMinutes(-10)} -ErrorAction SilentlyContinue | Select-Object -First 20 | ForEach-Object { \$_.TimeCreated.ToString('HH:mm:ss') + ' ' + \$_.ProviderName + ' ' + (\$_.Message -split [char]10)[0] }" > "$tmp/capture-$c-$k.txt"
    ssh_srv "cat > $out/capture-$c-$k.txt" < "$tmp/capture-$c-$k.txt"
    note "FINDING (live) $c: its Skyrim Platform log has not grown since the last cycle ($size bytes) while $o made $acts spell actions its game replays; capture-$c-$k.txt has the game's handles on it and the recent Defender and Application events"
  fi
  logsize[$c]=$size
}

[ "$(hold)" = yes ] || { echo "no playtest hold on the lab: start this after just playtest-restore (or playtest-start)" >&2; exit 2; }
ssh_srv "sudo mkdir -p $out && sudo chown eli:eli $out"
note "playtest $n recorded from $started UTC, a cycle every $cycle s, into https://thuum.gaussing.tv/results/$label/"

# each seat's watch: whether it runs and since when (the stopped-log finding maps a trace's ms to the clock)
declare -A watching=() since=() failed=()
start_one() {  # start_one <client>: the recorder on one seat; a refusal is noted once a cycle and retried
  local r
  r=$(assist "$1" watch-start "{\"bools\":$bools}")
  case "$r" in
    *'"ok":true'*) watching[$1]=1; since[$1]=$(date +%s);;
    *) watching[$1]=0
       [ "${failed[$1]:-0}" = 1 ] || note "$1: watch-start not taken, retried every 30 s: $(printf '%s' "$r" | cut -c1-120)"
       failed[$1]=1;;
  esac
}
start_watch() { for c in c1 c2; do failed[$c]=0; start_one "$c"; done; }
stop_watch() {  # stop_watch <k>: each watching seat's trace to the results site
  for c in c1 c2; do
    if [ "${watching[$c]:-0}" != 1 ]; then note "$c: no trace in cycle $1 (the seat never took watch-start)"; continue; fi
    watching[$c]=0
    assist "$c" watch-stop '{}' > "$tmp/stop-$c.json"
    # the trace out of lab-api's answer, and one line about it (python from a heredoc: no quotes to escape)
    if line=$(python3 - "$tmp/stop-$c.json" "$tmp/trace-$c-$1.json" <<'PY'
import json, sys
d = json.load(open(sys.argv[1]))
t = d.get("result") if d.get("ok") else None
if not isinstance(t, dict):
    sys.exit(1)
if t.get("error"):
    print(f"the driver answered: {t['error']}")
    sys.exit(2)
json.dump(t, open(sys.argv[2], "w"), indent=1, sort_keys=True)
me = t.get("self") or {}
print(f"{t.get('seconds', 0):.0f} s, {len(t.get('actors') or [])} actors, {len(me.get('events') or [])} own events, {len(me.get('casts') or [])} casts")
PY
    ); then
      ssh_srv "cat > $out/trace-$c-$1.json" < "$tmp/trace-$c-$1.json"
      note "$c: trace-$c-$1.json, $line"
      # the watch's start on the clock and its trace: the stopped-log finding reads these
      printf '%s\t%s\t%s\n' "$1" "${since[$c]}" "$tmp/trace-$c-$1.json" >> "$tmp/cycles-$c.tsv"
    else
      note "$c: no trace in cycle $1: ${line:-$(cut -c1-160 "$tmp/stop-$c.json")}"
    fi
  done
  # each seat's log against the other seat's trace of the same cycle, so both traces first
  for c in c1 c2; do live_check "$c" "$1"; done
}

stopping=0
own_hold=0
trap 'stopping=1' INT TERM
start_watch
k=0
while :; do
  waited=0
  while [ "$waited" -lt "$cycle" ] && [ "$stopping" = 0 ]; do
    sleep 15 || true; waited=$((waited + 15))
    if [ "$(hold)" = no ]; then
      # nothing may roll a clone back before the logs are in: a hold of the recorder's own until they are
      curl -fsS -m 15 -X POST "$api/hold" -H 'content-type: application/json' -d '{"minutes": 10, "reason": "playtest-record: last cycle and logs"}' >/dev/null 2>&1 && own_hold=1
      note "the playtest's hold is gone: last cycle"; stopping=1; break
    fi
    # a seat that refused its start (a menu, a relaunch) is asked again every 30 s, not a cycle later
    if [ $((waited % 30)) = 0 ]; then for c in c1 c2; do [ "${watching[$c]:-0}" = 1 ] || start_one "$c"; done; fi
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
  for spec in "$c.log|'$spl'" "$c-driver.log|(Join-Path (Get-Content -LiteralPath 'C:\\sky-lab\\game-dir.txt' -Raw).Trim() 'Data\\Platform\\Logs\\lab-driver-logs.txt')" "$c-sunshine.log|'C:\\Program Files\\Sunshine\\config\\sunshine.log'"; do
    name=${spec%%|*}; src=${spec#*|}
    copy="C:\\sky-lab\\playtest-$n-$name"
    ssh -o BatchMode=yes "$jump" "qm guest exec $vmid --timeout 60 -- powershell -NoProfile -Command \"Copy-Item -LiteralPath $src -Destination '$copy' -Force\"" > /dev/null 2>&1
    ssh -o BatchMode=yes "$jump" "pvesh get /nodes/core/qemu/$vmid/agent/file-read --file '$copy' --output-format json" 2>/dev/null \
      | python3 -c 'import json,sys; sys.stdout.write(json.load(sys.stdin).get("content",""))' > "$tmp/$name" 2>/dev/null
    ssh_srv "cat > $out/$name" < "$tmp/$name" && note "$name: $(wc -l < "$tmp/$name" | tr -d ' ') lines"
  done
done
for c in c1 c2; do
  # a game whose log stops while the playtest goes on is a finding (ADR-033): the log's last line, then the
  # other seat's spell actions after it (its own trace, each placed on the clock by its watch's start, 5 s
  # allowed for the replay and the guests' clocks), counted only in cycles where this seat's trace shows a
  # figure; a seat's own actions write nothing to its own log, so they say nothing here
  o=$(other_of "$c")
  note "$(python3 "$here/lab/tools/log-stop.py" "$tmp/$c.log" "$tmp/cycles-$c.tsv" "$tmp/cycles-$o.tsv" "$c" "$o")"
done
ssh_srv "cat > $out/summary.txt" < "$tmp/summary.txt"
[ "$own_hold" = 1 ] && curl -fsS -m 15 -X POST "$api/release" >/dev/null 2>&1
echo "playtest $n recorded: https://thuum.gaussing.tv/results/$label/ ($k cycles)"
rm -rf "$tmp"
