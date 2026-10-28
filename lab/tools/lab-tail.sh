#!/usr/bin/env bash
# lab-tail.sh <server|c1|c2> [pattern]: a live read of the lab's logs to leave open in a terminal (a turbo day's, memo
# D49). `server` follows the lab server's docker log over the jump; `c1`/`c2` poll that seat's console tee (lab-driver's
# Data\Platform\Logs\lab-console-logs.txt under the game folder) every two seconds through the guest agent, with a read
# that shares write access (the game holds the tee open; log-count's copy, main c06c232), from the file's end at the
# start onward, keeping its byte offset between polls. A pattern filters the lines (grep -E). Read-only everywhere.
set -euo pipefail
what=${1:?server, c1 or c2}; pattern=${2:-.}
jump=${JUMP_HOST:-root@core.gaussing.tv}; srv=${SRV_HOST:-eli@10.10.70.10}
case "$what" in
  server)
    ssh -o BatchMode=yes -o ServerAliveInterval=15 -J "$jump" "$srv" "docker logs -f --since 30s lab-skymp-server-1 2>&1" \
      | grep --line-buffered -E "$pattern"
    exit 0;;
  c1) vmid=711;; c2) vmid=712;;
  *) echo "server, c1 or c2" >&2; exit 2;;
esac
enc() { printf '%s' "$1" | iconv -f UTF-8 -t UTF-16LE | base64 | tr -d '\n'; }
off=-1
while true; do
  read_ps="\$p = Join-Path (Get-Content -LiteralPath 'C:\\sky-lab\\game-dir.txt' -Raw).Trim() 'Data\\Platform\\Logs\\lab-console-logs.txt'
if (-not (Test-Path -LiteralPath \$p)) { 'OFF -1'; exit }
\$s = [IO.File]::Open(\$p, 'Open', 'Read', 'ReadWrite'); \$o = $off
if (\$o -lt 0 -or \$o -gt \$s.Length) { \$o = \$s.Length }
\$s.Seek(\$o, 'Begin') | Out-Null; \$r = New-Object IO.StreamReader(\$s); \$t = \$r.ReadToEnd(); \$e = \$s.Position; \$s.Close()
'OFF ' + \$e; \$t"
  out=$(ssh -o BatchMode=yes "$jump" "qm guest exec $vmid --timeout 30 -- powershell -NoProfile -NonInteractive -EncodedCommand $(enc "$read_ps")" 2>/dev/null \
    | python3 -c 'import sys,json; d=json.load(sys.stdin, strict=False); sys.stdout.write(d.get("out-data") or "")' 2>/dev/null) || { sleep 2; continue; }
  # the first line by expansion, not `head -1`: under pipefail a printf cut short by head is a SIGPIPE, and set -e
  # then ends the loop at its first poll that carries text
  first=${out%%$'\n'*}; first=${first%$'\r'}
  case "$first" in "OFF "*) n=${first#OFF }; [[ "$n" =~ ^-?[0-9]+$ ]] && off=$n;; esac
  case "$out" in *$'\n'*) rest=${out#*$'\n'};; *) rest="";; esac
  [ -n "$rest" ] && { printf '%s\n' "$rest" | tr -d '\r' | grep -E "$pattern" || true; }
  sleep 2
done
