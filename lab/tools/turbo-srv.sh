#!/usr/bin/env bash
# turbo-srv.sh <tag> (ADR-041 item 2(b)): a live session's server push. The lab server goes to skymp-server:<tag>, a
# fixed <ref-slug>-<sha8> the fork's server-build pushed (so the LOG names the build played), restarted alone: never
# lab-api, whose hold lives in its memory (a restart drops it). In order:
# - no lab run may be active;
# - the image is pulled before anything else (a tag the registry lacks stops here);
# - the live world is saved (playtest-world.sh save turbo-<tag>, item 5's restore point);
# - the previous tag goes to /srv/lab/turbo.log for turbo-back;
# - then the wait for the server's "listening on" line and for every seat that was online to be back
#   (skymp5-client reconnects and logs in by itself, ADR-041's context).
# TURBO_BACK=1 is turbo-back's reverse switch: no world save, logged as "back".
# The new container keeps the live one's settings file and master files (its mounts, read back), so a playtest
# whose profile gave its server its own setting (playtest thirty's npcEnabled overlay) keeps it across the push;
# a bare up -d mounted the default settings, NPCs off (2026-10-21, caught before the first such push).
set -euo pipefail
tag=${1:?tag: a fixed skymp-server tag, <ref-slug>-<sha8> (just turbo-srv m2-train-27-snap-13acbb35)}
case "$tag" in *[!a-z0-9._-]*|"") echo "no such tag: $tag" >&2; exit 2;; esac
host=${SRV_HOST:-eli@10.10.70.10}
jump=${JUMP_HOST:-root@core.gaussing.tv}
api=${LAB_API:-https://thuum.gaussing.tv/lab}
here=$(cd "$(dirname "$0")/../.." && pwd)
ssh_srv() { ssh -o BatchMode=yes -o ServerAliveInterval=15 -J "$jump" "$host" "$@"; }
online() {
  curl -fsS -m 15 -X POST "$api/state/rpc/labState" -H 'content-type: application/json' -d '{"payload":{"kind":"online"}}' \
    | python3 -c 'import json,sys; print(" ".join(str(p) for p in sorted(x.get("profileId") for x in json.load(sys.stdin).get("players", []))))'
}
t0=$(date +%s)
active=$(curl -fsS -m 15 "$api/status" | python3 -c 'import sys,json; print(json.load(sys.stdin).get("run") or "")')
[ -z "$active" ] || { echo "== a lab run is active ($active): a turbo push waits for it" >&2; exit 3; }
prev=$(ssh_srv 'grep -E "^SERVER_TAG=" /srv/lab/.env | cut -d= -f2')
[ "$prev" != "$tag" ] || { echo "== the server already runs skymp-server:$tag"; exit 0; }
seats=$(online)
echo "== turbo-srv skymp-server:$prev -> $tag $(date +%H:%M:%S) (online: ${seats:-none})"
ssh_srv "cd /srv/lab && SERVER_TAG='$tag' docker compose pull -q skymp-server" \
  || { echo "== no image skymp-server:$tag in the registry: nothing changed" >&2; exit 4; }
if [ "${TURBO_BACK:-}" != 1 ]; then
  "$here/lab/tools/playtest-world.sh" save "turbo-${tag//[._]/-}" | sed 's/^/   /'
fi
ssh_srv "set -e; cd /srv/lab
  sed -i 's/^SERVER_TAG=.*/SERVER_TAG=$tag/' .env
  echo \"\$(date -u +%Y-%m-%dT%H:%M:%SZ) srv $prev $tag ${TURBO_BACK:+back}\" >> /srv/lab/turbo.log
  since=\$(date -u +%Y-%m-%dT%H:%M:%SZ)
  settings=\$(docker inspect --format '{{range .Mounts}}{{if eq .Destination \"/srv/skymp/server-settings.json\"}}{{.Source}}{{end}}{{end}}' lab-skymp-server-1 2>/dev/null || true)
  esm=\$(docker inspect --format '{{range .Mounts}}{{if eq .Destination \"/srv/skymp/esm\"}}{{.Source}}{{end}}{{end}}' lab-skymp-server-1 2>/dev/null || true)
  echo \"   settings \${settings:-the default} and masters \${esm:-the default} kept\"
  SERVER_SETTINGS=\${settings:-/srv/lab/server/server-settings.json} ESM_DIR=\${esm:-/srv/persist/esm/1.6.1170} docker compose up -d --no-deps skymp-server >/dev/null 2>&1
  for i in \$(seq 1 60); do docker logs --since \$since lab-skymp-server-1 2>&1 | grep -q 'listening on' && break; sleep 2; done
  docker logs --since \$since lab-skymp-server-1 2>&1 | grep -m1 'listening on' | cut -c1-120 | sed 's/^/   /'" \
  || { echo "== the server did not come up on $tag: just turbo-back" >&2; exit 5; }
echo "   server up $(( $(date +%s) - t0 )) s after the push"
now=""
for _ in $(seq 1 90); do
  now=$(online || true)
  [ "$now" = "$seats" ] && break
  sleep 2
done
if [ "$now" = "$seats" ]; then
  echo "== seats back online (${now:-none}) $(( $(date +%s) - t0 )) s after the push $(date +%H:%M:%S)"
else
  echo "== seats online now: ${now:-none}, before: ${seats:-none} (180 s): relaunch a missing one (just playtest-relaunch c1|c2) or just turbo-back" >&2
  exit 6
fi
