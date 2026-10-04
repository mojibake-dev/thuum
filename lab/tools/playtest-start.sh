#!/usr/bin/env bash
# playtest-start.sh: set the lab up for a T4 playtest (docs/private/playtest-*.md)
# once both clients are online and no lab run is active. Both lab characters
# go to an empty bandit camp south of the spawn, a ruined farmhouse with an
# unowned bedroll (Skyrim.esm REFR 0x000CE5F9 Bedroll01L at (135532, -75725,
# 11330) in Tamriel: no owner, no enable parent; lab/esm.py, 2026-10-04).
# Profile 1 stands west of it facing east, the bedroll on the floor about
# 1.3 m ahead; profile 2 stands inside the farmhouse facing west, across a
# low partition (screenshots of runs 20261004-214508 and by hand). The
# camp's bandits never appear: the lab server runs without NPCs (SkyMP's
# npcEnabled defaults to false, WorldState.h) and skymp5-client's world
# cleaner removes the engine's own. The nearer Stormcloak camp's bedrolls are
# not there before the Civil War quests: their enable parent, marker
# 0x0005295D, starts disabled. Both start at half health, magicka and stamina,
# so a rest's recovery shows on screen.
set -euo pipefail
api=${LAB_API:-https://thuum.gaussing.tv/lab}
cmd() { curl -fsS -m 15 -X POST "$api/state/rpc/labCommand" -H 'content-type: application/json' -d "{\"payload\": $1}"; echo; }
state() { curl -fsS -m 15 -X POST "$api/state/rpc/labState" -H 'content-type: application/json' -d "{\"payload\": $1}"; echo; }
online=$(state '{"kind":"online"}')
case "$online" in *'"profileId":1'*'"profileId":2'*|*'"profileId":2'*'"profileId":1'*) ;; *) echo "both clients must be online first: $online" >&2; exit 2;; esac
active=$(curl -fsS -m 15 "$api/status" | python3 -c 'import sys,json; print(json.load(sys.stdin).get("run") or "")')
[ -z "$active" ] || { echo "a lab run is active: $active" >&2; exit 3; }
cmd '{"kind":"teleport","profileId":1,"cell":"3c:Skyrim.esm","pos":[135440,-75725,11400],"rot":[0,0,90]}'
cmd '{"kind":"teleport","profileId":2,"cell":"3c:Skyrim.esm","pos":[135702,-75675,11400],"rot":[0,0,270]}'
sleep 5
for p in 1 2; do cmd "{\"kind\":\"set-percentages\",\"profileId\":$p,\"health\":0.5,\"magicka\":0.5,\"stamina\":0.5}"; done
for p in 1 2; do state "{\"kind\":\"actor\",\"profileId\":$p}" | python3 -c 'import sys,json; d=json.load(sys.stdin); print("profile", d.get("profileId"), "at", [round(d[k]) for k in ("x", "y", "z") if k in d], "in", d.get("cell"), "health", round(d.get("healthPercentage") or 0, 2))' 2>/dev/null || true; done
