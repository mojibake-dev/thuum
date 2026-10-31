#!/usr/bin/env bash
# client-rollback.sh <c1|c2> [snapshot] (thuum ADR-041 item 5): a live session's client-only rollback. lab-api returns
# the clone to its newest snapshot (clean-m1-next by default, what the stage laid): a stop, a disk rollback, a start
# and the guest agent, allowed under the playtest's hold (POST /lab/clients/<c>/rollback). Then the wait for the seat
# back on the online list, since the logon launcher starts the game by itself. The server and the other seat are
# untouched. For a bad client file alone, turbo-back is the faster reverse.
set -euo pipefail
client=${1:?client: c1 or c2}; to=${2:-clean-m1-next}
case "$client" in c1) profile=1;; c2) profile=2;; *) echo "unknown client $client" >&2; exit 2;; esac
api=${LAB_API:-https://thuum.gaussing.tv/lab}
t0=$(date +%s)
echo "== client-rollback $client to $to $(date +%H:%M:%S)"
out=$(curl -sS -m 900 -X POST "$api/clients/$client/rollback" -H 'content-type: application/json' -d "{\"to\": \"$to\"}")
printf '%s' "$out" | python3 -c 'import json,sys; sys.exit(0 if json.load(sys.stdin).get("ok") else 1)' 2>/dev/null \
  || { echo "== refused: $out" >&2; exit 3; }
echo "   $(printf '%s' "$out" | python3 -c 'import json,sys; d=json.load(sys.stdin); print(d["guest"], "rolled back to", d["rolledBack"], "and its guest agent up in", d["seconds"], "s")')"
online() { curl -fsS -m 15 -X POST "$api/state/rpc/labState" -H 'content-type: application/json' -d '{"payload":{"kind":"online"}}' 2>/dev/null || true; }
# the old session first, as the runner's relaunch waits for "gone": the server lists a rolled-back seat until its
# connection times out, and a read before that called c1 "back online 15 s after the rollback began" while its new
# game was still booting (twice on 2026-10-31; that game's log-in was a crash 25 s into its boot)
gone=
for _ in $(seq 1 24); do
  case "$(online)" in *"\"profileId\":$profile}"*) sleep 5;; *) gone=1; break;; esac
done
[ -n "$gone" ] || echo "   (profile $profile still listed 120 s after the rollback: the wait below may read its old session)"
for _ in $(seq 1 60); do
  case "$(online)" in
    *"\"profileId\":$profile}"*) echo "== $client (profile $profile) back online $(( $(date +%s) - t0 )) s after the rollback began $(date +%H:%M:%S)"; exit 0;;
  esac
  sleep 5
done
echo "== $client not online five minutes after its boot: just playtest-relaunch $client" >&2; exit 4
