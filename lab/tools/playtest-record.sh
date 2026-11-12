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
enc() { printf '%s' "$1" | iconv -f UTF-8 -t UTF-16LE | base64 | tr -d '\n'; }
# copy_ps <src expression> <copy>: a log the game holds open for writing, copied with read-write sharing as lab-api's
# log-count and Frida copies are (runner.py): a plain Copy-Item shares no writes and is refused then ("being used by
# another process", 193821, 194559, 195437). The old copy goes first and a failed open stops the script (exit 1) before
# a new copy is made, so a caller that reads only after a zero exit never takes an older or empty copy for the log
copy_ps() { printf '%s' "\$ErrorActionPreference = 'Stop'; Remove-Item -LiteralPath '$2' -Force -ErrorAction SilentlyContinue; \$s = [IO.File]::Open($1, 'Open', 'Read', 'ReadWrite'); \$d = [IO.File]::Create('$2'); \$s.CopyTo(\$d); \$d.Close(); \$s.Close()"; }
# read_ranged <vmid> <guest path> <local file>: a seat's file read back in 512 KiB ranges through Proxmox's own agent
# file-read (offset, count, decode=0; qemu-server 9.2.15 on core), as lab-api's Runner._read_back reads: one whole-file read
# of a console past about 1 MiB timed out on a busy seat (c1, 2026-11-12, 1,464,655 bytes: "guest-file-read failed - got
# timeout"). Each range is asked up to three times and the file ends at the first short range; 1 when a range never came
# back, the bytes before it kept
read_ranged() {
  local at=0 n try part
  part=$(mktemp); : > "$3"
  while :; do
    for try in 1 2 3; do
      ssh -o BatchMode=yes "$jump" "pvesh get /nodes/core/qemu/$1/agent/file-read --file '$2' --offset $at --count 524288 --decode 0 --output-format json" 2>/dev/null \
        | python3 -c 'import base64,json,sys; sys.stdout.buffer.write(base64.b64decode(json.load(sys.stdin)["content"] or ""))' > "$part" 2>/dev/null && break
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
# tail_ps <src expression> <copy>: a console's last 60,000 lines, so one file-read stays well under the guest agent's limits
# (a whole console's read timed out on both seats in 191642); Get-Content reads with read-write sharing, and the old copy
# goes first and a failed read stops the script (exit 1), as copy_ps
tail_ps() { printf '%s' "\$ErrorActionPreference = 'Stop'; Remove-Item -LiteralPath '$2' -Force -ErrorAction SilentlyContinue; Get-Content -LiteralPath $1 -Tail 60000 | Set-Content -LiteralPath '$2' -Encoding utf8"; }
# fetch_copy <vmid> <powershell> <copy> <local file>: the copy made, then read in ranges (read_ranged) only after its exec
# exits 0 (copy_ps, tail_ps), so a failed copy writes an empty file and a reason in $why, never an older copy as the log
fetch_copy() {
  local code
  why=""; : > "$4"
  code=$(ssh -o BatchMode=yes "$jump" "flock -w 90 /run/lock/qga-$1 qm guest exec $1 --timeout 60 -- powershell -NoProfile -NonInteractive -EncodedCommand $(enc "$2")" 2>/dev/null \
    | python3 -c 'import json,sys; print(json.load(sys.stdin).get("exitcode"))' 2>/dev/null)
  if [ "$code" = 0 ]; then
    read_ranged "$1" "$3" "$4" || why=" (read back short: a range never came back)"
  else
    why=" (no copy: its exec exited ${code:-without an answer})"
  fi
}
gexec() {  # gexec <vmid> <powershell>: its output; read-only work on a clone through the guest agent
  local enc
  enc=$(enc "$2")
  ssh -o BatchMode=yes "$jump" "flock -w 90 /run/lock/qga-$1 qm guest exec $1 --timeout 60 -- powershell -NoProfile -NonInteractive -EncodedCommand $enc" 2>/dev/null \
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
  for c in c1 c2; do stop_one "$c" "$1"; done
  # each seat's log against the other seat's trace of the same cycle, so both traces first
  for c in c1 c2; do live_check "$c" "$1"; done
}
stop_one() {  # stop_one <client> <label>: one seat's trace to the results site as trace-<client>-<label>.json
  local c=$1
  if [ "${watching[$c]:-0}" != 1 ]; then note "$c: no trace in cycle $2 (the seat never took watch-start)"; return; fi
  watching[$c]=0
  assist "$c" watch-stop '{}' > "$tmp/stop-$c.json"
  # the trace out of lab-api's answer, and one line about it (python from a heredoc: no quotes to escape)
  if line=$(python3 - "$tmp/stop-$c.json" "$tmp/trace-$c-$2.json" <<'PY'
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
    ssh_srv "cat > $out/trace-$c-$2.json" < "$tmp/trace-$c-$2.json"
    note "$c: trace-$c-$2.json, $line"
    # the watch's start on the clock and its trace: the stopped-log finding reads these
    printf '%s\t%s\t%s\n' "$2" "${since[$c]}" "$tmp/trace-$c-$2.json" >> "$tmp/cycles-$c.tsv"
  else
    note "$c: no trace in cycle $2: ${line:-$(cut -c1-160 "$tmp/stop-$c.json")}"
  fi
}
# A relaunched game's driver starts with no watch (playtest 47: cycles 7, 9, 10 and 11 lost a seat's trace, "the driver
# answered: no watch-start before watch-stop", each after a relaunch, and the seat took watch-start only at the next
# cycle's start). A seat whose heartbeat stopped GAP_S or longer is cycled on its own as soon as it polls again: its
# watch stopped (the partial trace saved as cycle <k>r when the driver kept it, as across a long menu) and started.
gap_s=${PLAYTEST_GAP_S:-20}
declare -A gapped=()
beats() {  # each client's seconds since its last poll, "c1 0.4" a line, from lab-api's status
  curl -fsS -m 15 "$api/status" 2>/dev/null \
    | python3 -c 'import json,sys; [print(c, a) for c, a in (json.load(sys.stdin).get("heartbeats_s_ago") or {}).items()]' 2>/dev/null
}
regap() {  # regap <k>: a seat back from a heartbeat gap cycled on its own
  local c age
  while read -r c age; do
    case "$c" in c1|c2) ;; *) continue;; esac
    if awk -v a="$age" -v g="$gap_s" 'BEGIN { exit !(a >= g) }'; then
      [ "${gapped[$c]:-0}" = 1 ] || note "$c: no poll for ${age%.*} s (a relaunch, or a long menu): its watch is cycled when it polls again"
      gapped[$c]=1
    elif [ "${gapped[$c]:-0}" = 1 ]; then
      gapped[$c]=0
      stop_one "$c" "${1}r"
      failed[$c]=0
      start_one "$c"
    fi
  done < <(beats)
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
    regap "$((k + 1))"
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
  # each copied first (copy_ps): the game holds its logs open for writing
  for spec in "$c.log|'$spl'" "$c-driver.log|(Join-Path (Get-Content -LiteralPath 'C:\\sky-lab\\game-dir.txt' -Raw).Trim() 'Data\\Platform\\Logs\\lab-driver-logs.txt')" "$c-sunshine.log|'C:\\Program Files\\Sunshine\\config\\sunshine.log'"; do
    name=${spec%%|*}; src=${spec#*|}
    copy="C:\\sky-lab\\playtest-$n-$name"
    fetch_copy "$vmid" "$(copy_ps "$src" "$copy")" "$copy" "$tmp/$name"
    ssh_srv "cat > $out/$name" < "$tmp/$name" && note "$name: $(wc -l < "$tmp/$name" | tr -d ' ') lines$why"
  done
  # the client's console, where skymp5-client's own lines are (an inventory apply, the hands' re-equip, a say's verdict,
  # a trap's "fired here"): the game's lab-console-logs.txt for this launch, its last 60,000 lines, so one file-read stays
  # well under the guest agent's 16 MiB cap (playtest 44, 2026-11-03: the arrows' re-equip could not be read, the recorder
  # kept no console). C:\sky-lab\<c>-console.log is not fetched: no tee of the playtest but lab-api's copy of the last lab
  # run's console (runner.py's client-log fetch; labapi-client-log-fetch removes it once read, thuum-fa's review 2026-11-12).
  # Earlier launches' consoles are kept at each relaunch (playtest-relaunch.sh, relaunch-logs/), listed below.
  for spec in "$c-console.log|(Join-Path (Get-Content -LiteralPath 'C:\\sky-lab\\game-dir.txt' -Raw).Trim() 'Data\\Platform\\Logs\\lab-console-logs.txt')"; do
    name=${spec%%|*}; src=${spec#*|}; copy="C:\\sky-lab\\playtest-$n-$name"
    fetch_copy "$vmid" "$(tail_ps "$src" "$copy")" "$copy" "$tmp/$name"
    ssh_srv "cat > $out/$name" < "$tmp/$name" && note "$name: $(wc -l < "$tmp/$name" | tr -d ' ') lines (its last 60,000)$why"
  done
done
# every launch the session relaunched away from: its platform, driver and console logs as playtest-relaunch.sh kept them
kept=$(ssh_srv "ls /srv/lab/results/relaunch-logs/ 2>/dev/null" | awk -v s="$(date -u -d "$started" +%Y%m%dT%H%M%SZ 2>/dev/null || date -u -j -f %Y-%m-%dT%H:%M:%SZ "$started" +%Y%m%dT%H%M%SZ)" '$0 >= s' | tr '\n' ' ')
note "earlier launches' logs (results/relaunch-logs/): ${kept:-none}"
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
