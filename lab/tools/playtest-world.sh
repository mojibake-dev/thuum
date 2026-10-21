#!/usr/bin/env bash
# playtest-world.sh save <label> | restore <name> | list: a T4 playtest's
# world (docs/private/playtest-*.md) kept between sessions. Lab runs roll the
# server back to the clean world, so after a playtest Eli's world (rotfern,
# her skills, what she carries) is saved beside the lab's snapshots, and put
# back before the next playtest.
#   save <label>    copy the live world to /srv/lab/snapshots/playtest-<label>-<UTC stamp>
#   restore <name>  stop the lab server, replace its world with that snapshot, start it,
#                   then relaunch both seats' games and wait for both to be online again: a
#                   game that logs in again as another character keeps the previous skeleton's
#                   node bases (playtest twenty: rotfern at 1.0 where her race scales 0.6, about
#                   three times her size in her own game), and a fresh launch is always right.
#                   PLAYTEST_NO_RELAUNCH=1 keeps the running games (they log in again);
#                   PLAYTEST_SERVER_SETTINGS=<file under /srv/lab/server> recreates the server on that
#                   settings file instead of starting it as it was (a profile's server: {npcEnabled},
#                   laid by playtest_setup.py as the runs' overlay is, ADR-035 point 9)
#   list            the saved playtest worlds, newest last
# restore refuses while a lab run is active; save copies the running server's
# files, as each save so far did (playtests ten to twelve).
set -euo pipefail
host=${SRV_HOST:-eli@10.10.70.10}
jump=${JUMP_HOST:-root@core.gaussing.tv}
api=${LAB_API:-https://thuum.gaussing.tv/lab}
# the lab is Eli's for the playtest: runs, run sets and the nightly wait (lab-api's hold, docs/LAB.md); `just lab-release` ends it
hold() { curl -fsS -m 15 -X POST "$api/hold" -H 'content-type: application/json' -d "{\"minutes\": 180, \"reason\": \"$1\"}" >/dev/null 2>&1 || true; }
ssh_srv() { ssh -o BatchMode=yes -o ServerAliveInterval=15 -J "$jump" "$host" "$@"; }
case "${1:-}" in
  save)
    label=${2:?label, say 13-rotfern}
    case "$label" in *[!A-Za-z0-9-]*) echo "a label is letters, digits and dashes" >&2; exit 2;; esac
    name="playtest-$label-$(date -u +%Y%m%dT%H%M%SZ)"
    ssh_srv "sudo cp -a /srv/lab/server/world /srv/lab/snapshots/$name && sudo chown -R eli:eli /srv/lab/snapshots/$name && echo \"saved $name (\$(ls /srv/lab/snapshots/$name/changeForms | wc -l | tr -d ' ') records)\""
    ;;
  restore)
    hold "playtest (world restored)"
    name=${2:?name, from: just playtest-worlds}
    case "$name" in playtest-*) ;; *) echo "restore takes a saved playtest world (playtest-*), never the lab's own snapshots" >&2; exit 2;; esac
    case "$name" in *[!A-Za-z0-9-]*) echo "no such world name: $name" >&2; exit 2;; esac
    active=$(curl -fsS -m 15 "$api/status" | python3 -c 'import sys,json; print(json.load(sys.stdin).get("run") or "")')
    [ -z "$active" ] || { echo "a lab run is active: $active" >&2; exit 3; }
    start="docker compose start skymp-server"
    if [ -n "${PLAYTEST_SERVER_SETTINGS:-}" ]; then
      case "$PLAYTEST_SERVER_SETTINGS" in /srv/lab/server/*.json) ;; *) echo "PLAYTEST_SERVER_SETTINGS is a .json under /srv/lab/server" >&2; exit 2;; esac
      case "$PLAYTEST_SERVER_SETTINGS" in *[!A-Za-z0-9/._-]*) echo "no such settings path: $PLAYTEST_SERVER_SETTINGS" >&2; exit 2;; esac
      # a new mount needs a new container: start keeps the one created on the run's settings
      start="SERVER_SETTINGS=$PLAYTEST_SERVER_SETTINGS docker compose up -d skymp-server"
    fi
    ssh_srv "set -e; test -d /srv/lab/snapshots/$name || { echo 'no world /srv/lab/snapshots/$name' >&2; exit 4; }
      cd /srv/lab && docker compose stop skymp-server 2>&1 | tail -1
      sudo rm -rf /srv/lab/server/world && sudo cp -a /srv/lab/snapshots/$name /srv/lab/server/world && sudo chown -R 1001:1001 /srv/lab/server/world
      since=\$(date -u +%Y-%m-%dT%H:%M:%SZ)
      $start 2>&1 | tail -1
      for i in \$(seq 1 45); do docker logs --since \$since lab-skymp-server-1 2>&1 | grep -q 'listening on' && break; sleep 2; done
      docker logs --since \$since lab-skymp-server-1 2>&1 | grep -E 'AttachSaveStorage took|listening on' | cut -c1-160
      echo 'restored $name'"
    if [ "${PLAYTEST_NO_RELAUNCH:-}" != 1 ]; then
      here=$(cd "$(dirname "$0")/../.." && pwd)
      # both seats at once, each its own clone; each relaunch waits for its player online again
      "$here/lab/tools/playtest-relaunch.sh" c1 & r1=$!
      "$here/lab/tools/playtest-relaunch.sh" c2 & r2=$!
      ok=0; wait "$r1" || ok=1; wait "$r2" || ok=1
      [ "$ok" = 0 ] || { echo "a seat did not come back after its relaunch (just playtest-relaunch c1 or c2 again)" >&2; exit 5; }
      echo "both seats relaunched on the restored world"
    fi
    ;;
  list)
    # by the stamp at the end of each name
    ssh_srv "ls -1d /srv/lab/snapshots/playtest-* 2>/dev/null | xargs -n1 basename | awk -F- '{print \$NF, \$0}' | sort | cut -d' ' -f2"
    ;;
  *) echo "usage: playtest-world.sh save <label> | restore <name> | list" >&2; exit 2;;
esac
