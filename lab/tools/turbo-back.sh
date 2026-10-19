#!/usr/bin/env bash
# turbo-back.sh [--world] (ADR-041 item 5): the reverse of the last turbo push, from /srv/lab/turbo.log.
# - A server push ("srv <prev> <new>") goes back to <prev>: turbo-srv.sh with TURBO_BACK=1, the image still local.
# - A client push ("client <stamp> <vmids>") stops each pushed seat's game (Skyrim Platform's folder watcher would
#   otherwise reload the old file into the running game), puts back the skymp5-client.js turbo-client.sh kept under
#   C:\sky-lab\turbo\<stamp>\ into every game folder of the clone, and relaunches those seats only.
# --world also restores the newest saved turbo world (playtest-turbo-*), for a world a server push damaged
# (playtest-world.sh restore relaunches both seats).
set -euo pipefail
host=${SRV_HOST:-eli@10.10.70.10}
jump=${JUMP_HOST:-root@core.gaussing.tv}
here=$(cd "$(dirname "$0")/../.." && pwd)
ssh_srv() { ssh -o BatchMode=yes -o ServerAliveInterval=15 -J "$jump" "$host" "$@"; }
enc() { printf '%s' "$1" | iconv -f UTF-8 -t UTF-16LE | base64 | tr -d '\n'; }
run() {  # run <vmid> <powershell>: turbo-client.sh's helper; the stop and the copy are safe to ask again
  local out try
  for try in 1 2 3; do
    out=$(ssh -o BatchMode=yes "$jump" "qm guest exec $1 --timeout 60 -- powershell -NoProfile -NonInteractive -EncodedCommand $(enc "$2")" || true)
    printf '%s' "$out" | python3 -c 'import sys,json; json.load(sys.stdin, strict=False)' 2>/dev/null && break
    sleep 5
  done
  printf '%s' "$out" | python3 -c 'import sys,json; d=json.load(sys.stdin, strict=False); print((d.get("out-data") or d.get("err-data") or "").strip()); sys.exit(0 if d.get("exitcode")==0 else 1)'
}
last=$(ssh_srv "grep -v ' back\$' /srv/lab/turbo.log 2>/dev/null | tail -1" || true)
[ -n "$last" ] || { echo "== no turbo push in /srv/lab/turbo.log: nothing to take back" >&2; exit 2; }
read -r when kind a b _ <<<"$last"
echo "== turbo-back: the last push was $kind at $when ($a $b)"
case "$kind" in
  srv)
    TURBO_BACK=1 "$here/lab/tools/turbo-srv.sh" "$a"
    ;;
  client)
    stamp=$a
    for vmid in ${b//,/ }; do
      ps="\$k = 'C:\\sky-lab\\turbo\\$stamp'; if (-not (Test-Path \$k)) { throw 'no kept files at ' + \$k }
Get-Process SkyrimSE, skse64_loader -ErrorAction SilentlyContinue | Stop-Process -Force; Start-Sleep -Seconds 3
\$n = 0; Get-ChildItem \$k -Filter '*.js' | ForEach-Object { \$dst = (Get-Content (\$_.FullName + '.path') -Raw).Trim(); Copy-Item \$_.FullName \$dst -Force; \$n++ }
'restored ' + \$n + ' file(s)'"
      out=$(run "$vmid" "$ps") || { echo "== VM $vmid: $out" >&2; exit 3; }
      echo "   VM $vmid: $out"
    done
    ssh_srv "echo \"\$(date -u +%Y-%m-%dT%H:%M:%SZ) client $stamp $b back\" >> /srv/lab/turbo.log"
    pids=()
    for vmid in ${b//,/ }; do
      case $vmid in 711) c=c1;; 712) c=c2;; *) echo "== VM $vmid is no seat" >&2; exit 2;; esac
      "$here/lab/tools/playtest-relaunch.sh" "$c" & pids+=($!)
    done
    ok=0; for p in "${pids[@]}"; do wait "$p" || ok=1; done
    [ "$ok" = 0 ] || { echo "== a seat did not come back after its relaunch" >&2; exit 4; }
    ;;
  *) echo "== unknown turbo push kind $kind" >&2; exit 2;;
esac
if [ "${1:-}" = --world ]; then
  w=$("$here/lab/tools/playtest-world.sh" list | grep '^playtest-turbo-' | tail -1)
  [ -n "$w" ] || { echo "== no saved turbo world" >&2; exit 5; }
  echo "== the world back to $w"
  "$here/lab/tools/playtest-world.sh" restore "$w"
fi
