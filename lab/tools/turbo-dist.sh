#!/usr/bin/env bash
# turbo-dist.sh <fork branch> [c1|c2|both] (ADR-054's native push; SHA=<commit> pins it, else the branch's head): a live session's client DIST, Skyrim Platform and the
# SKSE plugins with the client, laid on running seats from the fork's client-build of that commit, one seat at a time.
# client-hot reloads a skymp5-client.js; a change inside Skyrim Platform or MpClientPlugin.dll loads only at a game's
# start (2026-10-28: fork m3-voice-inflight's in-flight line, a Skyrim Platform fix, in playtest 37).
# 1. That commit's build (`just build-client <branch> <sha>`: the fork's client-build of that exact commit, GitLab's or
#    the mirror's) into skymp/build/dist-client.
# 2. Per seat: client-dist.sh (the game stopped, the dist laid into every game folder, Skyrim Platform's and the wire
#    plugin's hashes checked), then playtest-relaunch.sh (the seat back online on the playtest's world).
# 3. /srv/lab/turbo.log gets "<UTC> dist <stamp> <vmid> <sha8>" per seat. turbo-back refuses that kind by name: a dist
#    keeps no file to put back, and its undo is `just client-rollback <c>` (the clone's clean-m1-next, the stage's dist).
# Refused during a lab run (its rollback would undo the dist).
set -euo pipefail
branch=${1:?a fork branch}; which=${2:-both}
here=$(cd "$(dirname "$0")/../.." && pwd)
api=${LAB_API:-https://thuum.gaussing.tv/lab}
jump=${JUMP_HOST:-root@core.gaussing.tv}; srv=${SRV_HOST:-eli@10.10.70.10}
case "$which" in c1) seats="c1:711";; c2) seats="c2:712";; both) seats="c1:711 c2:712";; *) echo "c1, c2 or both" >&2; exit 2;; esac
active=$(curl -fsS -m 15 "$api/status" | python3 -c 'import sys,json; print(json.load(sys.stdin).get("run") or "")')
[ -z "$active" ] || { echo "== a lab run is active ($active): a dist push waits for it" >&2; exit 3; }
git -C "$here/skymp" fetch -q origin "$branch"
sha=$(git -C "$here/skymp" rev-parse "${SHA:-origin/$branch}^{commit}")
git -C "$here/skymp" merge-base --is-ancestor "$sha" "origin/$branch" || { echo "== $sha is not on origin/$branch" >&2; exit 2; }
sha8=${sha:0:8}
echo "== turbo-dist $branch ($sha8) on $which $(date +%H:%M:%S)"
(cd "$here" && just build-client "$branch" "$sha") 2>&1 | tail -2
# client-dist stages the lab-driver bundle beside the dist (stage-client.sh), so it is built from this checkout first,
# as verb-stage builds it
echo "   driver bundle: $(cd "$here" && just build-driver 2>&1 | tail -1 | awk '{print $5, $NF}')"
stamp=$(date -u +%Y%m%dT%H%M%SZ)
for pair in $seats; do
  c=${pair%%:*}; vmid=${pair#*:}
  echo "== $c ($vmid): the dist $(date +%H:%M:%S)"
  "$here/lab/tools/client-dist.sh" "$vmid" 2>&1 | tail -3
  "$here/lab/tools/playtest-relaunch.sh" "$c" 2>&1 | tail -1
  ssh -o BatchMode=yes -J "$jump" "$srv" "echo \"\$(date -u +%Y-%m-%dT%H:%M:%SZ) dist $stamp $vmid $sha8\" >> /srv/lab/turbo.log"
done
echo "== turbo-dist $sha8 laid on $which $(date +%H:%M:%S) (undo: just client-rollback <c>)"
