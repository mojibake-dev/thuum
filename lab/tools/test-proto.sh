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
# whether the checks pass or not. ONLY="poison spell-cast" runs just those
# difftest sessions, to draw one session's divergences; such a run ends "T2
# partial", never "T2 green", since a verb's T2 is every session. SESSIONS=tree
# (or SESSIONS=<dir>, a worktree's difftest/sessions) runs the working tree's
# sessions on the artifact's binary, so a declaration edit is tried by this run
# alone with no pipeline between the edit and the run. Such a run ends "T2 trial"
# while its sessions are not the head's as committed, and "T2 green" once they
# are byte for byte (the session commit then needs no pipeline of its own).
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
# T2's settings are its own (server-settings-t2.json and the legacy copy, written below at its start): a
# deploy during a run (the essentials layer's layer-stage, 2026-10-19 15:15) swapped the live file under the
# server under test and broke the teleports session with 144 differences
dc="cd /srv/lab && TEST_TAG=$tag LEGACY_TAG=$legacy SERVER_SETTINGS=/srv/lab/server/server-settings-t2.json LEGACY_SETTINGS=/srv/lab/server/server-settings-legacy.json docker compose --profile difftest"
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
# alone has none and its branch's last one is the same binary and sessions. That
# holds only if no commit since that artifact changed skymp-wire: a pipeline
# cancelled by the next push leaves the branch's newest artifact older than its
# sessions, and T2 then passes without them (m2-cast-action's cast-action session,
# 2026-10-15: job 6608 at 3f8d8f77 served a head two session commits later). So
# the pick is checked against the head (the tag's commit, else the branch's) with
# GitLab's compare, and a stale one stops T2 with the way out named. Under
# SESSIONS the sessions come from the tree, so only the rest of skymp-wire (the
# binary's sources, divergences.yaml) can make the artifact stale: an artifact
# whose only lag is in difftest/sessions/ runs (train-26's head waited on an API
# pipeline for a session commit alone, 2026-10-18).
job=$(TOK="$tok" python3 - "$project" "$ref" "$sha" <<'PY'
import json, os, sys, urllib.parse, urllib.request
project, ref, sha = sys.argv[1], sys.argv[2], sys.argv[3]
G = f"https://gitlab.gaussing.tv/api/v4/projects/{project}"
def get(path):
    req = urllib.request.Request(G + path, headers={"PRIVATE-TOKEN": os.environ["TOK"]})
    return json.load(urllib.request.urlopen(req, timeout=60))
head = sha or get("/repository/branches/" + urllib.parse.quote(ref, safe=""))["commit"]["id"]
# Every successful difftest-build in the newest thousand jobs, any branch's: one project-wide page of a hundred ran out
# on a busy day (m3-npc-talk c1be67d1, 2026-10-27: a parity merge left skymp-wire alone, so it built none of its own,
# and the branch's last build was older than the newest hundred jobs of five branches, so T2 read no artifact at all).
jobs = []
for page in range(1, 11):
    batch = get(f"/jobs?scope[]=success&per_page=100&page={page}")
    jobs += [x for x in batch if x["name"] == "difftest-build"]
    if len(batch) < 100 or any(x["commit"]["id"].startswith(head) for x in jobs):
        break
def ancestor(commit):
    # the build's commit is in the head's history: GitLab's merge base of the two is that commit
    try:
        mb = get("/repository/merge_base?" + urllib.parse.urlencode([("refs[]", commit), ("refs[]", head)]))
    except Exception:
        return False
    return mb.get("id") == commit
own = [x for x in jobs if x["commit"]["id"].startswith(head)]
# else the newest build of an ancestor, whichever branch built it (a merged branch's build is the head's history
# too); the compare below still stops T2 when skymp-wire changed between that build and the head
def stale_paths(at):
    # the skymp-wire paths the head changed since the build, less the session declarations a SESSIONS dir supplies
    cmp = get("/repository/compare?" + urllib.parse.urlencode({"from": at, "to": head}))
    wire = {d["new_path"] for d in cmp.get("diffs", []) if d["new_path"].startswith("skymp-wire/")}
    tree = os.environ.get("SESSIONS", "") != ""
    return [p for p in wire if not (tree and p.startswith("skymp-wire/difftest/sessions/"))]
# of the ancestors' builds, newest first, the first whose skymp-wire is the head's: across a merge the newest by time
# can sit on the other side (m3-npc-cast bf133744, 2026-10-28: parity's 1b866786 build, after the branch merged
# m3-npc-talk in, lacks the branch's own wire changes, and the branch's ecec018e build holds the head's skymp-wire);
# the newest ancestor at all when none of the first six does, which the compare below refuses as stale
pick = own
if not pick:
    first, seen = None, 0
    for x in jobs:
        if not ancestor(x["commit"]["id"]):
            continue
        first, seen = first or x, seen + 1
        if not stale_paths(x["commit"]["id"]):
            pick = [x]
            break
        if seen >= 6:
            break
    pick = pick or ([first] if first else [])
if not pick:
    print("")
    sys.exit(0)
at = pick[0]["commit"]["id"]
if not own:
    cmp = get("/repository/compare?" + urllib.parse.urlencode({"from": at, "to": head}))
    wire = sorted({d["new_path"] for d in cmp.get("diffs", []) if d["new_path"].startswith("skymp-wire/")})
    tree = os.environ.get("SESSIONS", "") != ""
    binary = [p for p in wire if not (tree and p.startswith("skymp-wire/difftest/sessions/"))]
    if binary:
        print(f"   the branch's newest difftest-build (job {pick[0]['id']} at {at[:8]}) predates skymp-wire changes up to {head[:8]}: "
              + ", ".join(binary[:4]) + ("..." if len(binary) > 4 else ""), file=sys.stderr)
        print(f"   run the fork pipeline at the head first (POST /projects/{project}/pipeline?ref={ref}: an API pipeline builds difftest), then T2", file=sys.stderr)
        print("STALE")
        sys.exit(0)
    if wire:
        print(f"   difftest-build job {pick[0]['id']} at {at[:8]} has the binary of {head[:8]}; only {len(wire)} session file(s) changed since, and SESSIONS supplies the sessions", file=sys.stderr)
    else:
        print(f"   no difftest-build at {head[:8]} (it left skymp-wire alone): job {pick[0]['id']} from {at[:8]}, the same binary and sessions", file=sys.stderr)
print(pick[0]["id"], head)
PY
)
[ "$job" = STALE ] && { echo "== T2 not run: the difftest artifact is older than the branch's skymp-wire" >&2; exit 3; }
read -r job head_commit <<<"$job"
if [ -n "$job" ] && curl -fsS -m 120 -H "PRIVATE-TOKEN: $tok" -o "$tmp/a.zip" \
     "https://gitlab.gaussing.tv/api/v4/projects/$project/jobs/$job/artifacts"; then
  (cd "$tmp" && unzip -q a.zip) && rsync -az --delete -e "ssh -J $jump" "$tmp/difftest-dist/" "$host:/srv/lab/difftest/" && echo "   job $job installed on sky-srv"
  have_difftest=1
else
  echo "   no successful difftest-build job on $ref yet; skipping the diff"
  have_difftest=0
fi
sessions_from=""
case "${SESSIONS:-}" in
  "") ;;
  tree) sessions_from="skymp/skymp-wire/difftest/sessions" ;;
  *) sessions_from="$SESSIONS" ;;
esac
if [ -n "$sessions_from" ]; then
  if [ "$have_difftest" != 1 ]; then
    echo "   SESSIONS=$SESSIONS ignored: no difftest binary to run them with"
    sessions_from=""
  elif [ ! -d "$sessions_from" ]; then
    echo "   SESSIONS=$SESSIONS: no directory $sessions_from" >&2
    exit 2
  else
    rsync -az --delete -e "ssh -J $jump" "$sessions_from/" "$host:/srv/lab/difftest/sessions/"
    echo "   sessions from $sessions_from (the working tree, uncommitted edits included)"
  fi
fi
# A tree's sessions that are byte for byte the head's committed ones make this the
# head's own T2 (its binary checked above); anything else is a trial of the edit.
own_sessions=0
if [ -n "$sessions_from" ] && [ -n "${head_commit:-}" ]; then
  mkdir -p "$tmp/head-sessions"
  # from the checkout's top: run inside a subdirectory, git archive keeps only that prefix of the tree it is given
  top=$(git -C "$sessions_from" rev-parse --show-toplevel 2>/dev/null || true)
  if [ -n "$top" ] && git -C "$top" archive "$head_commit:skymp-wire/difftest/sessions" 2>/dev/null | tar -x -C "$tmp/head-sessions" 2>/dev/null \
     && [ -n "$(ls -A "$tmp/head-sessions")" ] && diff -rq "$tmp/head-sessions" "$sessions_from" >/dev/null 2>&1; then
    own_sessions=1
    echo "   the sessions are ${head_commit:0:8}'s own as committed: this run is its T2"
  else
    echo "   the sessions differ from ${head_commit:0:8}'s commit (or it is not fetched here): this run is a trial, not the verb's T2"
  fi
fi

echo "== clean world, server under test"
ssh_srv "$dc pull -q skymp-server-test skymp-server-legacy"
# T2's inputs are the two stacks' alone, never a mod layer's (thuum-magnus, 2026-10-19): both run on
# lab/deploy/sky-srv/server-settings-t2-load-order.json, the pre-layer load order pinned in the tree, with
# every other key taken from the deployed stage's settings at T2's start (the bond's proc for a branch that
# knows it), into server-settings-t2.json. The frozen legacy image could not load the essentials layer anyway
# (its libespm matches master names by exact case, and USSEP spells them in lower case).
# The legacy server refuses a light plugin by name ("'ccQDRSSE001-SurvivalMode.esl'
# is not a valid esp or esm name", 2026-10-08): it runs on those settings
# without the .esl files, which keeps every full plugin's index, since the
# server under test numbers light plugins apart (docs/verbs/light-plugins.md).
# No session names a light plugin's form.
ssh_srv "cat > /srv/lab/server/t2-load-order.json" < lab/deploy/sky-srv/server-settings-t2-load-order.json
ssh_srv "python3 - /srv/lab/server/server-settings.json /srv/lab/server/t2-load-order.json /srv/lab/server/server-settings-t2.json /srv/lab/server/server-settings-legacy.json" <<'PY'
import json, sys
deployed, pinned, t2, legacy = sys.argv[1:5]
d = json.load(open(deployed))
d["loadOrder"] = json.load(open(pinned))
# the weather (thuum docs/verbs/weather.md): the deployed lab pool alternates two weathers every ten game
# minutes, which a session could straddle (one SetWeather declared per client in difftest's divergences);
# T2 pins one weather over Tamriel and a slot of a game day, so every session hears exactly the login's word
if d.get("weatherSync"):
    d["weather"] = {"changeGameMinutes": 1440, "seed": 1,
                    "pools": {"3c:Skyrim.esm": [{"weather": "12f89:Skyrim.esm", "chance": 100}]}}
json.dump(d, open(t2, "w"), indent=2)
d["loadOrder"] = [p for p in d["loadOrder"] if not p.lower().endswith(".esl")]
json.dump(d, open(legacy, "w"), indent=2)
print(f"   T2 settings: {len(json.load(open(t2))['loadOrder'])} plugins pinned (legacy {len(d['loadOrder'])}), the other keys the deployed stage's")
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

# the mod lock (thuum docs/verbs/mod-lock.md): the running server's manifest.json
# is the list each Hello is judged against; the fakeclient builds its Hello from
# a copy of it (the fakeclient runs in a fresh container, which has no manifest
# of its own). A good Hello is welcomed and the login proceeds; a Hello with one
# hash broken (--break-mod 0, the first full plugin) is refused with 502
# E_MOD_LOCK_MISMATCH and the fakeclient exits 3 without logging in.
# An image whose fakeclient has no --manifest predates the lock (fork m3-mod-lock 1992edc2 brought it): the cases
# are skipped there, by name, since test-proto plays every branch's image (2026-10-28: train 56's merge T2 on
# 26e3d0cf would have gone red on cases its image cannot run). The test is the image's own binary, not the branch.
echo "== mod-lock: a good Hello welcomed, a broken one refused (502)"
modlock_rc=0
if ! ssh_srv "$dc exec -T skymp-server-test grep -q -a -e --manifest /srv/skymp/fakeclient"; then
  echo "   skipped: this image's fakeclient has no --manifest (the branch predates the mod lock)"
elif ssh_srv "$dc exec -T skymp-server-test cat /srv/skymp/data/manifest.json > /srv/lab/difftest/manifest-test.json"; then
  ssh_srv "$dc run --rm --no-deps -T -v /srv/lab/difftest:/opt/difftest:ro skymp-server-test /srv/skymp/fakeclient --host skymp-server-test --port 7777 --profile-id 9 --moves 1 --manifest /opt/difftest/manifest-test.json --timeout-ms 20000 --settle-ms 1000 2>/dev/null" > "$tmp/modlock-good.jsonl" || true
  ssh_srv "$dc run --rm --no-deps -T -v /srv/lab/difftest:/opt/difftest:ro skymp-server-test /srv/skymp/fakeclient --host skymp-server-test --port 7777 --profile-id 9 --moves 1 --manifest /opt/difftest/manifest-test.json --break-mod 0 --timeout-ms 20000 --settle-ms 1000 2>/dev/null" > "$tmp/modlock-bad.jsonl" || true
  python3 - "$tmp/modlock-good.jsonl" "$tmp/modlock-bad.jsonl" <<'PYML' || modlock_rc=1
import json, sys
def load(path):
    return [json.loads(l) for l in open(path) if l.strip()]
good, bad = load(sys.argv[1]), load(sys.argv[2])
kinds = lambda evs: [e.get("event") for e in evs]
assert "hello" in kinds(good), f"the good run sent no Hello: {kinds(good)}"
assert "welcome" in kinds(good), f"the good run got no Welcome: {kinds(good)}"
done = [e for e in good if e.get("event") == "done"]
assert done and done[0].get("rc") == 0 and any(e.get("event") == "actor" for e in good), f"the welcomed client did not log in: {done}"
refused = [e for e in bad if e.get("event") == "refused"]
assert refused and refused[0].get("reason") == 502, f"the broken Hello was not refused with 502: {kinds(bad)} {refused}"
bad_done = [e for e in bad if e.get("event") == "done"]
assert bad_done and bad_done[0].get("rc") == 3 and not any(e.get("event") == "actor" for e in bad), f"the refused client logged in anyway: {bad_done}"
print(f"   mod-lock ok: the good Hello welcomed and logged in; the broken one refused with 502, no login")
PYML
  ssh_srv "$dc logs skymp-server-test 2>&1 | grep -c 'mod-lock: client' || true" | sed 's/^/   server log mod-lock lines: /'
else
  echo "   the server's manifest.json could not be read from the container"; modlock_rc=1
fi
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
    if [ -n "${ONLY:-}" ] && ! printf ' %s ' "$ONLY" | grep -q " ${name%.yaml} "; then
      continue
    fi
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
[ "$modlock_rc" = 0 ] || red="$red mod-lock"
[ "$rc" = 0 ] || red="$red difftest"
if [ -n "$red" ]; then echo "T2 red:$red"; exit 1; fi
# "T2 green" is a verb's T2 and nothing else (verb-merge greps for it): every session,
# each the head's as committed. A tree's edits not yet committed end "T2 trial".
if [ -n "${ONLY:-}" ]; then echo "T2 partial (sessions: $ONLY): not a verb's T2"
elif [ -z "$sessions_from" ]; then echo "T2 green"
elif [ "$own_sessions" = 1 ]; then echo "T2 green (sessions from $sessions_from, ${head_commit:0:8}'s own as committed, on job $job's binary)"
else echo "T2 trial (sessions from $sessions_from, not ${head_commit:0:8}'s commit: commit them and rerun for the verb's T2)"; fi
