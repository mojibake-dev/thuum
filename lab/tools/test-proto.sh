#!/usr/bin/env bash
# T2 on sky-srv (docs/LAB.md, CLAUDE.md `just test-proto`), M1 shape (ADR-019):
#   1. the server build under test (SERVER_TAG, default the .env's or parity)
#      from the clean world, the fakeclient smoke against it, its effects
#      checked through the lab gamemode's labState RPC;
#   2. attributes across a restart (docs/verbs/attributes.md): profile 9's
#      percentages set through labCommand, the server restarted, the record
#      read back before anyone logs in;
#   3. difftest's sessions across two stacks from the same clean world: the
#      legacy RakNet server (LEGACY_TAG, default parity-legacy) with its C++
#      fakeclient, and the server under test with its own fakeclient.
# The fakeclient and difftest run inside the server images; the difftest binary
# and its sessions are the fork's difftest-build artifact for the branch that
# built SERVER_TAG (DIFFTEST_REF, default the tag), fetched from GitLab with the
# project token in the Keychain. The lab's compose service ends as it started,
# whether the checks pass or not.
set -euo pipefail
host=${SRV_HOST:-eli@10.10.70.10}
jump=${JUMP_HOST:-root@core.gaussing.tv}
project=${GITLAB_PROJECT:-7}
ssh_srv() { ssh -o BatchMode=yes -J "$jump" "$host" "$@"; }
# Ready means the lab RPC answers: docker's port proxy accepts TCP on :3000
# before the server listens, so a bare connect proves nothing.
wait_ready() {
  ssh_srv 'for i in $(seq 1 90); do curl -fsS -m 5 -X POST localhost:3000/rpc/labState -H "Content-Type: application/json" -d "{\"payload\":{\"kind\":\"online\"}}" >/dev/null 2>&1 && exit 0; sleep 2; done; exit 1'
}
# world/ belongs to the image's user (uid 1001): restore it from a root shell in
# the server image, as lab-api's own rollback does from its container
restore() { # restore <tag> <dir under /srv/lab>...
  local t=$1; shift
  ssh_srv "cd /srv/lab && SERVER_TAG=$t docker compose run --rm --no-deps -T --user 0 -v /srv/lab:/lab --entrypoint sh skymp-server -c 'set -e; for d in $*; do rm -rf /lab/\$d; mkdir -p /lab/\$d; cp -a /lab/snapshots/clean/. /lab/\$d/; chown -R 1001:1001 /lab/\$d; done'"
}

env_tag=$(ssh_srv 'grep -E "^SERVER_TAG=" /srv/lab/.env 2>/dev/null | cut -d= -f2' || true)
tag=${SERVER_TAG:-${env_tag:-parity}}
legacy=${LEGACY_TAG:-parity-legacy}
ref=${DIFFTEST_REF:-$tag}
echo "== server under test: skymp-server:$tag; legacy stack: skymp-server:$legacy; difftest from $ref"

echo "== difftest artifact"
tok=$(security find-generic-password -s gitlab-thuum-api -a skymp -w)
tmp=$(mktemp -d)
lab_back() {
  echo "== the lab's server back to its own setting (${env_tag:-parity})"
  ssh_srv "cd /srv/lab && LEGACY_TAG=$legacy docker compose --profile difftest stop -t 10 skymp-server-legacy >/dev/null 2>&1; docker compose up -d skymp-server >/dev/null 2>&1 && echo '   skymp-server:${env_tag:-parity} up'" || true
  rm -rf "$tmp"
}
trap lab_back EXIT
job=$(curl -fsS -m 60 -H "PRIVATE-TOKEN: $tok" \
  "https://gitlab.gaussing.tv/api/v4/projects/$project/jobs?scope[]=success&per_page=100" \
  | python3 -c "import sys,json; j=[x for x in json.load(sys.stdin) if x['name']=='difftest-build' and x['ref']=='$ref']; print(j[0]['id'] if j else '')")
if [ -n "$job" ] && curl -fsS -m 120 -H "PRIVATE-TOKEN: $tok" -o "$tmp/a.zip" \
     "https://gitlab.gaussing.tv/api/v4/projects/$project/jobs/$job/artifacts"; then
  (cd "$tmp" && unzip -q a.zip) && rsync -az --delete -e "ssh -J $jump" "$tmp/difftest-dist/" "$host:/srv/lab/difftest/" && echo "   job $job installed on sky-srv"
  have_difftest=1
else
  echo "   no successful difftest-build job on $ref yet; skipping the diff"
  have_difftest=0
fi

echo "== clean worlds, server images"
ssh_srv "set -e; cd /srv/lab
  docker compose pull -q skymp-server 2>/dev/null || true
  SERVER_TAG=$tag docker compose pull -q skymp-server
  docker compose stop -t 20 skymp-server >/dev/null 2>&1 || true"
restore "$tag" server/world server-legacy/world
ssh_srv "cd /srv/lab && SERVER_TAG=$tag docker compose up -d skymp-server >/dev/null"
wait_ready && echo "   skymp-server:$tag up" || { echo "   skymp-server:$tag never answered labState"; exit 1; }

echo "== fakeclient smoke (profile 9, 5 moves, AddItem IronSword)"
ssh_srv "cd /srv/lab && SERVER_TAG=$tag docker compose run --rm --no-deps -T skymp-server /srv/skymp/fakeclient --host skymp-server --port 7777 --profile-id 9 --moves 5 --add-item 77495 --add-item-count 1 --timeout-ms 20000 --settle-ms 2000 2>/dev/null" > "$tmp/events.jsonl" || true
python3 - "$tmp/events.jsonl" <<'PY'
import json, sys
events = [json.loads(l) for l in open(sys.argv[1]) if l.strip()]
done = [e for e in events if e.get("event") == "done"]
actor = [e for e in events if e.get("event") == "actor"]
errors = [e for e in events if e.get("event") == "error"]
assert done and done[0].get("rc") == 0, f"fakeclient did not finish cleanly: {done} {errors}"
assert actor, "no CreateActor with isMe"
sent = [e for e in events if e.get("event") == "sent" and e["msg"].get("t") == 2]
assert len(sent) >= 5, f"only {len(sent)} movement updates sent"
print(f"   fakeclient ok: actor idx {actor[0]['idx']} at {actor[0]['pos']}, {len(sent)} moves, {done[0].get('received')} messages received")
PY
ssh_srv 'curl -sS -m 10 -X POST localhost:3000/rpc/labState -H "Content-Type: application/json" -d "{\"payload\":{\"kind\":\"actor\",\"profileId\":9}}"; echo; curl -sS -m 10 -X POST localhost:3000/rpc/labState -H "Content-Type: application/json" -d "{\"payload\":{\"kind\":\"inventory\",\"profileId\":9}}"' > "$tmp/state.txt"
python3 - "$tmp/state.txt" "$tmp/events.jsonl" <<'PY'
import json, sys
actor, inv = [json.loads(l) for l in open(sys.argv[1]) if l.strip()]
spawn = [json.loads(l) for l in open(sys.argv[2]) if l.strip() and ('"event": "actor"' in l or '"event":"actor"' in l)][0]["pos"]
assert actor.get("found"), f"server has no actor for profile 9: {actor}"
dx = abs(actor["x"] - spawn[0])
assert dx > 100, f"server did not apply the movement (dx={dx})"
swords = [e["count"] for e in inv.get("entries", []) if e["baseId"] == 0x12EB7]
assert swords and swords[0] >= 1, f"AddItem did not land: {inv}"
print(f"   server state ok: moved {dx:.0f} units, iron swords {swords[0]}")
PY

echo "== attributes across a restart (profile 9 at 0.5, 0.25, 0.75)"
ssh_srv 'curl -sS -m 10 -X POST localhost:3000/rpc/labCommand -H "Content-Type: application/json" -d "{\"payload\":{\"kind\":\"set-percentages\",\"profileId\":9,\"health\":0.5,\"magicka\":0.25,\"stamina\":0.75}}"' > /dev/null
# Each check below records its verdict and the script goes on, so one run
# reports every red; the verdict is printed at the end.
attr_rc=0
# the file driver writes the record asynchronously; restart once it is on disk
if ! ssh_srv 'for i in $(seq 1 30); do grep -Eqs "\"healthPercentage\": ?0\.5" /srv/lab/server/world/changeForms/*.json && exit 0; sleep 1; done; exit 1'; then
  echo "   the record never reached the disk"; attr_rc=1
fi
ssh_srv "cd /srv/lab && SERVER_TAG=$tag docker compose restart skymp-server >/dev/null 2>&1"
wait_ready || echo "   the server never answered labState after the restart"
ssh_srv 'curl -sS -m 10 -X POST localhost:3000/rpc/labState -H "Content-Type: application/json" -d "{\"payload\":{\"kind\":\"actor\",\"profileId\":9}}"' > "$tmp/attr.txt" || true
python3 - "$tmp/attr.txt" <<'PY' || attr_rc=1
import json, sys
a = json.load(open(sys.argv[1]))
assert a.get("found"), f"no actor for profile 9 after the restart: {a}"
got = (a.get("healthPercentage"), a.get("magickaPercentage"), a.get("staminaPercentage"))
want = (0.5, 0.25, 0.75)
assert all(g is not None and abs(g - w) < 0.01 for g, w in zip(got, want)), f"after the restart the record reads {got}, saved {want}"
print(f"   record after the restart, before any login: {got}")
PY

rc=0
if [ "$have_difftest" = 1 ]; then
  echo "== difftest: skymp-server:$legacy (C++ fakeclient) against skymp-server:$tag"
  ssh_srv "cd /srv/lab && docker compose stop -t 20 skymp-server >/dev/null"
  restore "$tag" server/world
  ssh_srv "set -e; cd /srv/lab
    SERVER_TAG=$tag docker compose up -d skymp-server >/dev/null
    LEGACY_TAG=$legacy docker compose --profile difftest up -d skymp-server-legacy >/dev/null
    id=\$(docker create ${REGISTRY_PREFIX:-10.10.70.12:5000/}skymp-server:$legacy) && docker cp \"\$id:/srv/skymp/fakeclient\" difftest/legacy-fakeclient && docker rm \"\$id\" >/dev/null
    sleep 20"
  for s in $(ssh_srv 'ls /srv/lab/difftest/sessions/*.yaml'); do
    name=$(basename "$s")
    ssh_srv "cd /srv/lab && SERVER_TAG=$tag docker compose run --rm --no-deps -T -v /srv/lab/difftest:/opt/difftest:ro -e DIFFTEST_LEGACY_FAKECLIENT=/opt/difftest/legacy-fakeclient -e DIFFTEST_LEGACY_ADDR=skymp-server-legacy:7777 -e DIFFTEST_WIRE_FAKECLIENT=/srv/skymp/fakeclient -e DIFFTEST_WIRE_ADDR=skymp-server:7777 skymp-server /opt/difftest/difftest /opt/difftest/sessions/$name" || rc=1
  done
fi

red=""
[ "$attr_rc" = 0 ] || red="$red attributes-across-restart"
[ "$rc" = 0 ] || red="$red difftest"
[ -z "$red" ] && echo "T2 green" || { echo "T2 red:$red"; exit 1; }
