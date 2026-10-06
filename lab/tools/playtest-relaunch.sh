#!/usr/bin/env bash
# playtest-relaunch.sh <client>: in a T4 playtest (docs/private/playtest-*.md),
# quit a player's game and start it again, as closing Skyrim and launching it
# later would ("quit test 1"). The clone's game stops through the guest agent
# and its logon task sky-lab-launch starts the game again in the lab user's
# session; the game loads a fresh generated save, so whatever the player sees
# after the login is what the server gave back. Waits until the player is on
# the server's online list again.
set -euo pipefail
client=${1:?client: c1 or c2}
case "$client" in c1) vmid=711; profile=1;; c2) vmid=712; profile=2;; *) echo "unknown client $client" >&2; exit 2;; esac
jump=${JUMP_HOST:-root@core.gaussing.tv}
api=${LAB_API:-https://thuum.gaussing.tv/lab}
enc() { printf '%s' "$1" | iconv -f UTF-8 -t UTF-16LE | base64 | tr -d '\n'; }
online() { curl -fsS -m 15 -X POST "$api/state/rpc/labState" -H 'content-type: application/json' -d '{"payload": {"kind":"online"}}' 2>/dev/null; }
active=$(curl -fsS -m 15 "$api/status" | python3 -c 'import sys,json; print(json.load(sys.stdin).get("run") or "")')
[ -z "$active" ] || { echo "a lab run is active: $active" >&2; exit 3; }
ps='Get-Process SkyrimSE, skse64_loader -ErrorAction SilentlyContinue | Stop-Process -Force; Start-Sleep -Seconds 3; Start-ScheduledTask -TaskName sky-lab-launch; "relaunch started " + (Get-Date -Format HH:mm:ss)'
ssh -o BatchMode=yes "$jump" "qm guest exec $vmid --timeout 60 -- powershell -NoProfile -NonInteractive -EncodedCommand $(enc "$ps")" \
  | python3 -c 'import sys,json; print((json.load(sys.stdin).get("out-data") or "").strip().splitlines()[-1])'
# off the list once the game is gone, then back on it after the login
for i in $(seq 1 20); do case "$(online)" in *"\"profileId\":$profile}"*) sleep 3;; *) break;; esac; done
for i in $(seq 1 60); do case "$(online)" in *"\"profileId\":$profile}"*) echo "$client (profile $profile) is back online"; exit 0;; esac; sleep 5; done
echo "$client did not come back online within five minutes" >&2; exit 4
