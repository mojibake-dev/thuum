#!/usr/bin/env bash
# layer-stage.sh <thuum branch> [probe...]: a mod-layer branch staged on the lab,
# verb-stage's sibling for a change to persist-mods and the load orders (Lost
# Grimoire's layer was done by hand on 2026-10-10; Apocalypse's is the first
# through this). Run from a worktree of the branch: persist-mods and deploy-srv
# read the working tree, so the tree staged is the tree that merges. In order:
#   0. the tree is origin/<branch>, clean, and contains origin/main (merge main
#      into the branch first, never rebase); the lab's T0 is green;
#   1. an idle lab, then a hold (no run, no run set, no nightly while the
#      clones are written; it stands if a step fails, `just lab-release` ends it);
#   2. `just persist-mods`: the host's persist/mods rebuilt from the branch's
#      script, the plugins placed in both game versions' esm directories;
#      2b. the load order the clients will enable against the server's
#      (load-order-check.py on persist's mods/): every enabled plugin loads,
#      and every plugin the server loads sits on the clients' slot;
#   3. `just deploy-srv`: the lab tree and both server-settings files (their
#      load-order check passes once step 2 has placed the plugins);
#   4. the server restarted on the new load order and answering, before any
#      clone is touched (a server that refuses the order stops the staging here,
#      not as the sweep's first run);
#   5. `just client-mods` on c2 then c1 (add-mods.ps1: every game folder, the
#      plugins enabled), each checked by the task's JSON for the branch's plugins,
#      retried once;
#   6. both clones snapshotted as clean-m1-next, the snapshot every run rolls
#      back to (lab/labapi/labapi/guests.yaml);
#   7. the hold released; smoke-two-players with the layer, whose red stops the
#      staging (both clones boot with it, the client's load-order check included:
#      the apocalypse layer of 2026-10-14 staged clean, then went red on the
#      sweep's first runs, Skyrim Platform refusing its spaced plugin name);
#   8. the probes named (scenario ids or paths) run.
# Then `just layer-merge <branch>`: the full sweep as the gate (a load order
# touches every verb, ADR-030), main given the branch, both clones promoted.
# Until layer-merge reports, the lab's deployed tree is the branch's: nothing
# runs deploy-srv from a tree without the branch (main included), or the
# server's load order reverts under clones that keep the plugin. thuum main
# takes docs all evening, so merge main into the branch just before staging
# (step 0 refuses a branch without it: its deploy-srv would revert main's lab
# tree on sky-srv). Never opens a Moonlight stream (Eli's seats are his).
set -euo pipefail
cd "$(dirname "$0")/../.."
branch=${1:?thuum branch}; shift
probes=("$@")
api=${LAB_API:-https://thuum.gaussing.tv/lab}
srv_ssh="ssh -o BatchMode=yes -o ServerAliveInterval=15 -o ServerAliveCountMax=4 -J root@core.gaussing.tv eli@10.10.70.10"

echo "== 0. the tree"
git fetch -q origin "$branch" main
sha=$(git rev-parse "origin/$branch"); sha8=${sha:0:8}
echo "== layer-stage $branch ($sha8) $(date +%H:%M:%S)"
[ "$(git rev-parse HEAD)" = "$sha" ] || { echo "== this tree is $(git rev-parse --short=8 HEAD), not origin/$branch $sha8: run from a worktree of the branch" >&2; exit 2; }
[ -z "$(git status --porcelain --untracked-files=no)" ] || { echo "== the tree has uncommitted changes" >&2; exit 2; }
if ! git merge-base --is-ancestor origin/main "origin/$branch"; then
  echo "== origin/$branch does not contain origin/main: merge main into the branch first (never rebase)" >&2; exit 2
fi
# the layer's plugins, in load order, as persist-mods.sh declares them (shell words: a name may hold spaces)
mapfile -t plugins < <(python3 -c 'import re,shlex,sys; s=open(sys.argv[1]).read(); print("\n".join(shlex.split(re.search(r"^plugins=\(([^)]*)\)", s, re.M).group(1))))' lab/tools/persist-mods.sh)
echo "   plugins: ${plugins[*]}"
python3 -m unittest discover -s lab/tests 2>&1 | grep -E "^OK" >/dev/null || { python3 -m unittest discover -s lab/tests 2>&1 | tail -5; echo "== T0 not green" >&2; exit 1; }
echo "   T0 green"
# the main checkout's ignored inputs (lab/.cache's archives, addrlib/), linked into a worktree
lab/tools/worktree-links.sh

echo "== 1. an idle lab"
for _ in $(seq 1 120); do
  idle=$(curl -fsS -m 15 "$api/status" | python3 -c 'import json,sys; d=json.load(sys.stdin); print(d.get("run") is None and d.get("runset") is None and d.get("hold") is None)' || echo False)
  [ "$idle" = True ] && break
  sleep 20
done
[ "$idle" = True ] || { echo "== the lab stayed busy or held" >&2; exit 1; }
curl -fsS -m 15 -X POST "$api/hold" -H 'content-type: application/json' -d "{\"minutes\": 90, \"reason\": \"layer-stage $branch $sha8\"}" >/dev/null
echo "   held 90 min"

echo "== 2. persist-mods $(date +%H:%M:%S)"
last=$(just persist-mods 2>&1 | tee /dev/stderr | tail -1)
case "$last" in "mods: SHA256SUMS checked on the host"*) ;; *) echo "== persist-mods did not end with the host's check" >&2; exit 1;; esac

echo "== 2b. the load order the clients enable $(date +%H:%M:%S)"
# persist's plugins.txt and plugin headers against this tree's 1.6.1170 settings: the essentials layer's first
# stage (2026-10-19) booted neither clone, a Creation Club patch enabled over a master the engine disabled, and its
# client-only TrueHUD.esl moved 38 light plugins to other slots than the server's
$srv_ssh "mkdir -p /srv/lab/handover && cat > /srv/lab/handover/load-order-check.json" < lab/deploy/sky-srv/server-settings.json
$srv_ssh "python3 - /srv/persist/mods /srv/lab/handover/load-order-check.json" < lab/tools/load-order-check.py | sed 's/^/   /' \
  || { echo "== the clients' load order does not hold (above): stop before deploy-srv (the hold stands)" >&2; exit 1; }

echo "== 3. deploy-srv $(date +%H:%M:%S)"
just deploy-srv 2>&1 | tail -1

echo "== 4. the server on the new load order $(date +%H:%M:%S)"
# the game server's own "listening on :7777", not port 3000: the resources server answers on 3000 before the
# plugins load, and the essentials layer's first try (2026-10-19 14:00) passed there while every start died on
# "unresolved dependency" and "Stopping the server"; it must also still be up 10 s later (no restart loop)
$srv_ssh "cd /srv/lab && since=\$(date -u +%Y-%m-%dT%H:%M:%SZ) && docker compose restart skymp-server >/dev/null 2>&1 && for _ in \$(seq 1 60); do l=\$(docker logs --since \$since lab-skymp-server-1 2>&1); if echo \"\$l\" | grep -q 'Stopping the server'; then echo \"\$l\" | grep -E '\\[error\\]' | tail -4 | cut -c1-200 | sed 's/^/   /'; echo '   the server refused the load order' >&2; exit 1; fi; if echo \"\$l\" | grep -q 'listening on :7777'; then echo \"\$l\" | grep -m1 'listening on :7777' | cut -c1-120 | sed 's/^/   /'; sleep 10; if docker logs --since \$since lab-skymp-server-1 2>&1 | grep -q 'Stopping the server'; then echo '   the server stopped after it listened' >&2; exit 1; fi; echo '   listening on 7777 and still up 10 s later'; exit 0; fi; sleep 2; done; docker compose logs --tail 30 skymp-server | tail -15; echo '   server not listening on 7777 within 120 s' >&2; exit 1"

echo "== 5. the layer on both clones $(date +%H:%M:%S)"
for v in 712 711; do
  ok=""
  for attempt in 1 2; do
    last=$(just client-mods "$v" 2>&1 | tail -1)
    echo "   $v: $(echo "$last" | cut -c1-200)"
    if printf '%s' "$last" | python3 -c '
import json, sys
want = sys.argv[1:]
try:
    got = json.loads(sys.stdin.read()).get("plugins") or []
except Exception:
    sys.exit(1)
sys.exit(0 if all(p in got for p in want) else 1)' "${plugins[@]}"; then ok=1; break; fi
    echo "   client-mods $v did not report every plugin (attempt $attempt)"
  done
  [ -n "$ok" ] || { echo "== client-mods $v failed twice: stop before any snapshot (the hold stands)" >&2; exit 1; }
done

echo "== 6. snapshots clean-m1-next $(date +%H:%M:%S)"
for c in c2 c1; do
  just client-snapshot "$c" clean-m1-next "$branch layer $sha8, $(date +%F)" 2>&1 | tail -1 | cut -c1-120
done

curl -fsS -m 15 -X POST "$api/release" >/dev/null 2>&1 || true
echo "== 7. smoke-two-players with the layer $(date +%H:%M:%S)"
if ! smoke=$(just lab-run smoke-two-players 2>&1 | tail -1); then
  echo "   $smoke"; echo "== the smoke is not green with the layer: no probes, no merge (its run's c1.log and c2.log say why)" >&2; exit 1
fi
echo "   $smoke"
if [ "${#probes[@]}" -gt 0 ]; then
  echo "== 8. probes"
  for probe in "${probes[@]}"; do   # a probe's red is an answer, not a staging failure (verb-stage.sh)
    echo "   $probe $(date +%H:%M:%S)"
    out=$(just lab-run "$probe" 2>&1) || true
    printf '%s\n' "$out" | grep -E ' (green|red|error) -> ' || { echo "   (no verdict line from lab-run:)"; printf '%s\n' "$out" | tail -3; }
  done
fi
echo "== layer-stage $branch ($sha8) done $(date +%H:%M:%S); next: just layer-merge $branch"
