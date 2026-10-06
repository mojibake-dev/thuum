#!/usr/bin/env bash
# playtest-start.sh: set the lab up for a T4 playtest (docs/private/playtest-*.md)
# once both clients are online and no lab run is active. Both lab characters
# go to a hunters' camp southwest of the spawn: a campfire with two small
# tents, each over an unowned bedroll (Skyrim.esm REFR 0x000B3184 at (117786,
# -81333, 10997) and 0x000B3185 at (118269, -81834, 11001) in Tamriel; no
# owner, no enable parent, and no DLC master touches either; lab/esm.py over
# all five masters, 2026-10-04). Each stands between the fire and a tent,
# facing it. Not the Redwater Den farmhouse: Dawnguard.esm deletes the old
# bandit camp's bedroll there (0x000CE5F9), which Eli found in the second
# playtest. Its NPCs never appear: the lab server runs without NPCs (SkyMP's
# npcEnabled defaults to false, WorldState.h) and skymp5-client's world
# cleaner removes the engine's own. Both start at half health, magicka and
# stamina, so a rest's recovery shows on screen.
set -euo pipefail
api=${LAB_API:-https://thuum.gaussing.tv/lab}
cmd() { curl -fsS -m 15 -X POST "$api/state/rpc/labCommand" -H 'content-type: application/json' -d "{\"payload\": $1}"; echo; }
state() { curl -fsS -m 15 -X POST "$api/state/rpc/labState" -H 'content-type: application/json' -d "{\"payload\": $1}"; echo; }
online=$(state '{"kind":"online"}')
case "$online" in *'"profileId":1'*'"profileId":2'*|*'"profileId":2'*'"profileId":1'*) ;; *) echo "both clients must be online first: $online" >&2; exit 2;; esac
active=$(curl -fsS -m 15 "$api/status" | python3 -c 'import sys,json; print(json.load(sys.stdin).get("run") or "")')
[ -z "$active" ] || { echo "a lab run is active: $active" >&2; exit 3; }
cmd '{"kind":"teleport","profileId":1,"cell":"3c:Skyrim.esm","pos":[117900,-81480,11080],"rot":[0,0,322]}'
cmd '{"kind":"teleport","profileId":2,"cell":"3c:Skyrim.esm","pos":[118180,-81760,11080],"rot":[0,0,130]}'
sleep 5
for p in 1 2; do cmd "{\"kind\":\"set-percentages\",\"profileId\":$p,\"health\":0.5,\"magicka\":0.5,\"stamina\":0.5}"; done
# Ingredients to eat for the learned-effects check (playtest six): three each
# of Skyrim.esm INGR Lavender 0x00045C28, MountainFlower01Blue 0x00077E1C and
# Wheat 0x0004B0BA (lab/esm.py on sky-srv, 2026-10-06), as decimal base ids.
for p in 1 2; do for id in 285736 491036 307386; do cmd "{\"kind\":\"give\",\"profileId\":$p,\"baseId\":$id,\"count\":3}" >/dev/null; done; done
echo "gave each player 3 Lavender, 3 Blue Mountain Flower, 3 Wheat"
for p in 1 2; do state "{\"kind\":\"actor\",\"profileId\":$p}" | python3 -c 'import sys,json; d=json.load(sys.stdin); print("profile", d.get("profileId"), "at", [round(d[k]) for k in ("x", "y", "z") if k in d], "in", d.get("cell"), "health", round(d.get("healthPercentage") or 0, 2))' 2>/dev/null || true; done
