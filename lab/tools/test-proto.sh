#!/usr/bin/env bash
# T2 on sky-srv (docs/LAB.md, CLAUDE.md `just test-proto`), M1 shape (ADR-019):
#   1. the server build under test (SERVER_TAG, default the .env's or parity)
#      from the clean world, the fakeclient smoke against it, its effects
#      checked through the lab gamemode's labState RPC;
#   2. attributes across a restart (docs/verbs/attributes.md): profile 9's
#      percentages set through labCommand, the server restarted, the record
#      read back before anyone logs in;
#   3. difftest's sessions across two stacks, each session from the clean
#      world on both: the legacy RakNet server (LEGACY_TAG, default
#      parity-legacy) with its C++ fakeclient, and the server under test with
#      its own fakeclient.
# T2 never uses the lab's own server: the build under test runs as
# skymp-server-test and the legacy one as skymp-server-legacy (compose profile
# difftest), both reachable only inside the compose network, the test one's
# RPC also on the VM's loopback (127.0.0.1:3100). The clients playing T3 stay
# on skymp-server, which T2 neither restarts nor shares: their traffic in a
# difftest session (2026-10-02) shifted every form index and flooded the
# fakeclients with their movement.
# The fakeclient and difftest run inside the server images; the difftest binary
# and its sessions are the fork's difftest-build artifact for the branch that
# built SERVER_TAG (DIFFTEST_REF, default the tag), fetched from GitLab with the
# project token in the Keychain. Both T2 services are stopped at the end,
# whether the checks pass or not.
set -euo pipefail
host=${SRV_HOST:-eli@10.10.70.10}
jump=${JUMP_HOST:-root@core.gaussing.tv}
project=${GITLAB_PROJECT:-7}
rpc_port=3100
# Keepalives: a connection through the jump that dies silently otherwise
# leaves ssh waiting forever (two T2 runs hung for hours on 2026-10-04, their
# remote commands long finished); with them ssh gives up within a minute and
# the run fails, named.
ssh_srv() { ssh -o BatchMode=yes -o ServerAliveInterval=15 -o ServerAliveCountMax=4 -J "$jump" "$host" "$@"; }
# Ready means the lab RPC answers: docker's port proxy accepts TCP before the
# server listens, so a bare connect proves nothing.
wait_ready() {
  ssh_srv "for i in \$(seq 1 90); do curl -fsS -m 5 -X POST localhost:$rpc_port/rpc/labState -H 'Content-Type: application/json' -d '{\"payload\":{\"kind\":\"online\"}}' >/dev/null 2>&1 && exit 0; sleep 2; done; exit 1"
}
rpc() { # rpc <name> <payload json>
  ssh_srv "curl -sS -m 10 -X POST localhost:$rpc_port/rpc/$1 -H 'Content-Type: application/json' -d '{\"payload\":$2}'"
}

env_tag=$(ssh_srv 'grep -E "^SERVER_TAG=" /srv/lab/.env 2>/dev/null | cut -d= -f2' || true)
tag=${SERVER_TAG:-${env_tag:-parity}}
legacy=${LEGACY_TAG:-parity-legacy}
# The difftest artifact comes from the branch that built the tag: a tag with a
# commit suffix (m1-hostility-9e68db37) names that branch and that commit; a
# bare one (parity) the branch's latest. Looking the whole tag up as a branch
# found nothing, and T2 skipped the diff (2026-10-04).
ref=${DIFFTEST_REF:-$(printf '%s' "$tag" | sed -E 's/-[0-9a-f]{8}$//')}
sha=$(printf '%s' "$tag" | sed -nE 's/.*-([0-9a-f]{8})$/\1/p')
dc="cd /srv/lab && TEST_TAG=$tag LEGACY_TAG=$legacy docker compose --profile difftest"
echo "== server under test: skymp-server:$tag; legacy stack: skymp-server:$legacy; difftest from $ref"

# world/ belongs to the image's user (uid 1001): restore it from a root shell in
# the image under test, as lab-api's own rollback does from its container
restore() { # restore <dir under /srv/lab>...
  ssh_srv "$dc run --rm --no-deps -T --user 0 -v /srv/lab:/lab --entrypoint sh skymp-server-test -c 'set -e; for d in $*; do rm -rf /lab/\$d; mkdir -p /lab/\$d; cp -a /lab/snapshots/clean/. /lab/\$d/; chown -R 1001:1001 /lab/\$d; done' >/dev/null"
}

echo "== difftest artifact"
tok=$(security find-generic-password -s gitlab-thuum-api -a skymp -w)
tmp=$(mktemp -d)
stop_t2() {
  ssh_srv "$dc stop -t 10 skymp-server-test skymp-server-legacy >/dev/null 2>&1" || true
}
cleanup() {
  echo "== T2 services stopped; the lab's server was not touched"
  stop_t2
  rm -rf "$tmp"
}
trap cleanup EXIT
# The commit's own artifact, else the branch's newest: difftest-build runs only
# when skymp-wire changes (the fork's .gitlab-ci.yml), so a commit that left it
# alone has none and its branch's last one is the same binary and sessions.
job=$(curl -fsS -m 60 -H "PRIVATE-TOKEN: $tok" \
  "https://gitlab.gaussing.tv/api/v4/projects/$project/jobs?scope[]=success&per_page=100" \
  | python3 -c "
import sys, json
jobs = [x for x in json.load(sys.stdin) if x['name'] == 'difftest-build' and x['ref'] == '$ref']
own = [x for x in jobs if x['commit']['id'].startswith('$sha')]
pick = own or jobs
if pick and not own:
    print('   no difftest-build at $sha (it left skymp-wire alone): job %d from %s, the branch\'s newest' % (pick[0]['id'], pick[0]['commit']['id'][:8]), file=sys.stderr)
print(pick[0]['id'] if pick else '')")
if [ -n "$job" ] && curl -fsS -m 120 -H "PRIVATE-TOKEN: $tok" -o "$tmp/a.zip" \
     "https://gitlab.gaussing.tv/api/v4/projects/$project/jobs/$job/artifacts"; then
  (cd "$tmp" && unzip -q a.zip) && rsync -az --delete -e "ssh -J $jump" "$tmp/difftest-dist/" "$host:/srv/lab/difftest/" && echo "   job $job installed on sky-srv"
  have_difftest=1
else
  echo "   no successful difftest-build job on $ref yet; skipping the diff"
  have_difftest=0
fi

echo "== clean world, server under test"
ssh_srv "$dc pull -q skymp-server-test skymp-server-legacy"
# The legacy server refuses a light plugin by name ("'ccQDRSSE001-SurvivalMode.esl'
# is not a valid esp or esm name", 2026-10-08): it runs on the lab's settings
# without the .esl files, which keeps every full plugin's index, since the
# server under test numbers light plugins apart (docs/verbs/light-plugins.md).
# No session names a light plugin's form.
ssh_srv "python3 - ${SERVER_SETTINGS:-/srv/lab/server/server-settings.json} /srv/lab/server/server-settings-legacy.json" <<'PY'
import json, sys
d = json.load(open(sys.argv[1]))
d["loadOrder"] = [p for p in d["loadOrder"] if not p.lower().endswith(".esl")]
json.dump(d, open(sys.argv[2], "w"), indent=2)
PY
stop_t2
restore server-test/world
ssh_srv "$dc up -d skymp-server-test >/dev/null 2>&1"
wait_ready && echo "   skymp-server-test ($tag) up" || { echo "   skymp-server-test ($tag) never answered labState"; exit 1; }

echo "== fakeclient smoke (profile 9, 5 moves, AddItem IronSword)"
ssh_srv "$dc run --rm --no-deps -T skymp-server-test /srv/skymp/fakeclient --host skymp-server-test --port 7777 --profile-id 9 --moves 5 --add-item 77495 --add-item-count 1 --timeout-ms 20000 --settle-ms 2000 2>/dev/null" > "$tmp/events.jsonl" || true
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
# the game clock (docs/verbs/time.md): one SetGameTime at login, ahead of the
# player's own CreateActor, at the game's rate
clocks = [i for i, e in enumerate(events) if e.get("event") == "message" and e["msg"].get("t") == 34]
assert len(clocks) == 1, f"{len(clocks)} SetGameTime messages, want one at login"
assert clocks[0] < events.index(actor[0]), "SetGameTime came after the player's CreateActor"
c = events[clocks[0]]["msg"]
assert c["timeScale"] == 20 and 0 <= c["hour"] < 24 and 0 <= c["month"] <= 11 and c["day"] >= 1, f"SetGameTime out of shape: {c}"
print(f"   clock ok: year {c['year']} month {c['month']} day {c['day']} hour {c['hour']:.3f} days passed {c['daysPassed']:.4f} at scale {c['timeScale']}")
PY
{ rpc labState '{"kind":"actor","profileId":9}'; echo; rpc labState '{"kind":"inventory","profileId":9}'; echo; rpc labState '{"kind":"time"}'; } > "$tmp/state.txt"
python3 - "$tmp/state.txt" "$tmp/events.jsonl" <<'PY'
import json, sys
actor, inv, clock = [json.loads(l) for l in open(sys.argv[1]) if l.strip()]
told = [json.loads(l)["msg"] for l in open(sys.argv[2]) if l.strip() and '"t":34' in l.replace(" ", "")][0]
assert clock.get("found"), f"labState has no game clock: {clock}"
ahead = clock["daysPassed"] - told["daysPassed"]
assert 0 <= ahead < 0.02, f"labState's clock is {ahead:.4f} days from what the client was told"
print(f"   labState clock agrees: {ahead * 24 * 60:.1f} game minutes on since login")
spawn = [json.loads(l) for l in open(sys.argv[2]) if l.strip() and ('"event": "actor"' in l or '"event":"actor"' in l)][0]["pos"]
assert actor.get("found"), f"server has no actor for profile 9: {actor}"
dx = abs(actor["x"] - spawn[0])
assert dx > 100, f"server did not apply the movement (dx={dx})"
swords = [e["count"] for e in inv.get("entries", []) if e["baseId"] == 0x12EB7]
assert swords and swords[0] >= 1, f"AddItem did not land: {inv}"
print(f"   server state ok: moved {dx:.0f} units, iron swords {swords[0]}")
PY

echo "== attributes across a restart (profile 9 at 0.5, 0.25, 0.75)"
rpc labCommand '{"kind":"set-percentages","profileId":9,"health":0.5,"magicka":0.25,"stamina":0.75}' > /dev/null
# Each check below records its verdict and the script goes on, so one run
# reports every red; the verdict is printed at the end.
attr_rc=0
# the file driver writes the record asynchronously; restart once it is on disk
if ! ssh_srv 'for i in $(seq 1 30); do grep -Eqs "\"healthPercentage\": ?0\.5" /srv/lab/server-test/world/changeForms/*.json && exit 0; sleep 1; done; exit 1'; then
  echo "   the record never reached the disk"; attr_rc=1
fi
ssh_srv "$dc restart skymp-server-test >/dev/null 2>&1"
wait_ready || echo "   the server never answered labState after the restart"
rpc labState '{"kind":"actor","profileId":9}' > "$tmp/attr.txt" || true
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
  ssh_srv "cd /srv/lab && id=\$(docker create ${REGISTRY_PREFIX:-10.10.70.12:5000/}skymp-server:$legacy) && docker cp \"\$id:/srv/skymp/fakeclient\" difftest/legacy-fakeclient && docker rm \"\$id\" >/dev/null"
  for s in $(ssh_srv 'ls /srv/lab/difftest/sessions/*.yaml'); do
    name=$(basename "$s")
    # every session from the clean world on both stacks, so none inherits
    # another's forms or actors
    stop_t2
    restore server-test/world server-legacy/world
    ssh_srv "$dc up -d skymp-server-test skymp-server-legacy >/dev/null 2>&1"
    wait_ready || echo "   skymp-server-test never answered labState"
    ssh_srv "sleep 10"   # the legacy server has no published RPC; it starts alongside
    ssh_srv "$dc run --rm --no-deps -T -v /srv/lab/difftest:/opt/difftest:ro -e DIFFTEST_LEGACY_FAKECLIENT=/opt/difftest/legacy-fakeclient -e DIFFTEST_LEGACY_ADDR=skymp-server-legacy:7777 -e DIFFTEST_WIRE_FAKECLIENT=/srv/skymp/fakeclient -e DIFFTEST_WIRE_ADDR=skymp-server-test:7777 skymp-server-test /opt/difftest/difftest /opt/difftest/sessions/$name" || rc=1
  done
fi

red=""
# no artifact means no diff, and a T2 without its diff is not green
[ "$have_difftest" = 1 ] || red="$red no-difftest-artifact"
[ "$attr_rc" = 0 ] || red="$red attributes-across-restart"
[ "$rc" = 0 ] || red="$red difftest"
[ -z "$red" ] && echo "T2 green" || { echo "T2 red:$red"; exit 1; }
