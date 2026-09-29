#!/usr/bin/env bash
# T2 on sky-srv (docs/LAB.md, CLAUDE.md `just test-proto`): the headless
# fakeclient against the live legacy server, checked through the lab gamemode's
# labState RPC, then difftest's smoke session with the legacy driver, both run
# inside the server image where the fakeclient lives. The difftest binary is
# the fork's difftest-build artifact, fetched from GitLab with the project token
# in the Keychain and placed under /srv/lab/difftest on sky-srv.
set -euo pipefail
host=${SRV_HOST:-eli@10.10.70.10}
jump=${JUMP_HOST:-root@core.gaussing.tv}
project=${GITLAB_PROJECT:-7}
ssh_srv() { ssh -o BatchMode=yes -J "$jump" "$host" "$@"; }

echo "== difftest artifact"
tok=$(security find-generic-password -s gitlab-thuum-api -a skymp -w)
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
# The newest successful difftest-build job on parity (GitLab's ref-level
# artifact download wants the whole pipeline green, which server-build may
# still be working on).
job=$(curl -fsS -m 60 -H "PRIVATE-TOKEN: $tok" \
  "https://gitlab.gaussing.tv/api/v4/projects/$project/jobs?scope[]=success&per_page=100" \
  | python3 -c 'import sys,json; j=[x for x in json.load(sys.stdin) if x["name"]=="difftest-build" and x["ref"]=="parity"]; print(j[0]["id"] if j else "")')
if [ -n "$job" ] && curl -fsS -m 120 -H "PRIVATE-TOKEN: $tok" -o "$tmp/a.zip" \
     "https://gitlab.gaussing.tv/api/v4/projects/$project/jobs/$job/artifacts"; then
  (cd "$tmp" && unzip -q a.zip) && rsync -az --delete -e "ssh -J $jump" "$tmp/difftest-dist/" "$host:/srv/lab/difftest/" && echo "   job $job installed on sky-srv"
  have_difftest=1
else
  echo "   no successful difftest-build job on parity yet; skipping the legacy diff"
  have_difftest=0
fi

echo "== fakeclient smoke (profile 9, 5 moves, AddItem IronSword)"
ssh_srv 'cd /srv/lab && docker compose run --rm --no-deps -T skymp-server /srv/skymp/fakeclient --host skymp-server --port 7777 --profile-id 9 --moves 5 --add-item 77495 --add-item-count 1 --timeout-ms 20000 --settle-ms 2000 2>/dev/null' > "$tmp/events.jsonl"
python3 - "$tmp/events.jsonl" <<'PY'
import json, sys
events = [json.loads(l) for l in open(sys.argv[1]) if l.strip()]
done = [e for e in events if e.get("event") == "done"]
actor = [e for e in events if e.get("event") == "actor"]
assert done and done[0].get("rc") == 0, f"fakeclient did not finish cleanly: {done}"
assert actor, "no CreateActor with isMe"
sent = [e for e in events if e.get("event") == "sent" and e["msg"].get("t") == 2]
assert len(sent) >= 5, f"only {len(sent)} movement updates sent"
print(f"   fakeclient ok: actor idx {actor[0]['idx']} at {actor[0]['pos']}, {len(sent)} moves, {done[0].get('received')} messages received")
PY
ssh_srv 'curl -sS -m 10 -X POST localhost:3000/rpc/labState -H "Content-Type: application/json" -d "{\"payload\":{\"kind\":\"actor\",\"profileId\":9}}"; echo; curl -sS -m 10 -X POST localhost:3000/rpc/labState -H "Content-Type: application/json" -d "{\"payload\":{\"kind\":\"inventory\",\"profileId\":9}}"' > "$tmp/state.txt"
python3 - "$tmp/state.txt" "$tmp/events.jsonl" <<'PY'
import json, sys
actor, inv = [json.loads(l) for l in open(sys.argv[1]) if l.strip()]
spawn = [json.loads(l) for l in open(sys.argv[2]) if l.strip() and '"event": "actor"' in l or '"event":"actor"' in l][0]["pos"]
assert actor.get("found"), f"server has no actor for profile 9: {actor}"
dx = abs(actor["x"] - spawn[0])
assert dx > 100, f"server did not apply the movement (dx={dx})"
swords = [e["count"] for e in inv.get("entries", []) if e["baseId"] == 0x12EB7]
assert swords and swords[0] >= 1, f"AddItem did not land: {inv}"
print(f"   server state ok: moved {dx:.0f} units, iron swords {swords[0]}")
PY

if [ "$have_difftest" = 1 ]; then
  echo "== difftest smoke, legacy driver against the live server"
  ssh_srv 'cd /srv/lab && docker compose run --rm --no-deps -T -v /srv/lab/difftest:/opt/difftest:ro -e DIFFTEST_FAKECLIENT=/srv/skymp/fakeclient -e DIFFTEST_LEGACY_ADDR=skymp-server:7777 skymp-server /opt/difftest/difftest /opt/difftest/sessions/smoke.yaml'
fi
echo "T2 green"
