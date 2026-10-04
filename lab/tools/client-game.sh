#!/usr/bin/env bash
# client-game.sh <vmid> <version>: give a clone the game folder for a second
# Skyrim version (ADR-022) out of Steam's depots in persist (game/<version>/,
# read-only on sky-srv at /srv/persist), which a throwaway HTTP server on
# sky-srv serves inside VLAN 70; add-game.ps1 on the clone fetches and checks
# every file and lays SKSE, the client dist and the lab files on the folder.
# Run after `just client-dist <vmid>`, which stages add-game.ps1 and SKSE for
# the version and records the Steam folder (so the new folder inherits the
# clone's identity). Ends in a cold retake of the clone's snapshot by
# thuum-mundus; lab-api's rollback erases it otherwise.
set -euo pipefail
vmid=${1:?vmid}; version=${2:?game version, e.g. 1.6.1170}
jump=${JUMP_HOST:-root@core.gaussing.tv}
srv=${SRV_HOST:-eli@10.10.70.10}; srv_ip=${SRV_IP:-10.10.70.10}; port=${GAME_HTTP_PORT:-8766}
enc() { printf '%s' "$1" | iconv -f UTF-8 -t UTF-16LE | base64 | tr -d '\n'; }
run() { ssh -o BatchMode=yes "$jump" "qm guest exec $vmid --timeout 3600 -- powershell -NoProfile -NonInteractive -EncodedCommand $(enc "$1")" | python3 -c 'import sys,json; d=json.load(sys.stdin); print((d.get("out-data") or "").strip()); print((d.get("err-data") or "").strip()[-600:], file=sys.stderr) if d.get("exitcode") else None; sys.exit(0 if d.get("exitcode")==0 else 1)'; }
ssh -o BatchMode=yes -J "$jump" "$srv" "test -f /srv/persist/game/$version/SHA256SUMS && mkdir -p /srv/lab/handover" \
  || { echo "no /srv/persist/game/$version/SHA256SUMS on sky-srv" >&2; exit 2; }
ssh -o BatchMode=yes -J "$jump" "$srv" "cd /srv/persist/game/$version && (nohup python3 -m http.server $port --bind $srv_ip >/dev/null 2>&1 & echo \$! > /srv/lab/handover/.game-http.pid)"
trap 'ssh -o BatchMode=yes -J "$jump" "$srv" "kill \$(cat /srv/lab/handover/.game-http.pid) 2>/dev/null; rm -f /srv/lab/handover/.game-http.pid"' EXIT
sleep 1
run "Get-Process SkyrimSE, skse64_loader -ErrorAction SilentlyContinue | Stop-Process -Force; & powershell -NoProfile -ExecutionPolicy Bypass -File C:\\sky-lab\\add-game.ps1 -Version $version -From http://$srv_ip:$port" | tail -1
