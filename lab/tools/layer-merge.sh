#!/usr/bin/env bash
# layer-merge.sh <thuum branch>: a staged mod-layer branch's merge, verb-merge's
# sibling (ADR-030: a non-verb promotion takes the full sweep, since a load order
# touches every verb). It reads only origin's refs, so it runs from any worktree
# of thuum; its LOG entry lands in that worktree's docs/LOG.md, as verb-merge's
# does. In order:
#   1. the staged tree is the branch's (layer-stage's "<branch> layer <sha8>"
#      in both clones' clean-m1-next description);
#   2. the gate: every committed scenario as one run set, `layer-<branch>`
#      (lab-api's lab-fault and ADR-027 reruns apply; a red stops here);
#   3. the branch into thuum main, before any promotion: a fast-forward when main
#      has not moved since the staging, else a merge commit (main takes docs all
#      evening, and a two-hour sweep outlives a fast-forward); a conflict stops
#      here with nothing promoted; a push refused because main moved meanwhile
#      is redone on the new main, three times at most;
#   4. both clones' clean-m1-next promoted to clean-m1, only once main has the
#      layer (main is what the next deploy-srv reads: a clean-m1 carrying a
#      plugin main's load order lacks is the worse half-state, a promote that
#      failed after main is a rerun of `just client-promote`);
#   5. a dated entry appended to docs/LOG.md with the run ids, to finish by
#      hand.
# GATE_AFTER=<set id>: the gate is that stopped set plus a set of its rest (runset.sh's
# RUNSET_AFTER), on the same staging, when a lab fault stopped the first one.
# Never force-pushes, never rebases, never switches the shared checkout.
set -euo pipefail
cd "$(dirname "$0")/../.."
branch=${1:?thuum branch}
git fetch -q origin "$branch" main
sha=$(git rev-parse "origin/$branch"); sha8=${sha:0:8}
echo "== layer-merge $branch ($sha8) $(date +%H:%M:%S)"
if git merge-base --is-ancestor "$sha" origin/main; then
  echo "== origin/$branch is in main already; nothing to merge" >&2; exit 2
fi

echo "== 1. the staged tree"
jump=${JUMP_HOST:-root@core.gaussing.tv}
for pair in c1:711 c2:712; do
  c=${pair%%:*}; vmid=${pair#*:}
  desc=$(ssh -o BatchMode=yes "$jump" "qm listsnapshot $vmid" | grep -E '`-> clean-m1-next ' | sed -E 's/^.*clean-m1-next +[0-9-]+ [0-9:]+ +//' || true)
  case "$desc" in
    *"$branch layer $sha8"*) echo "   $c clean-m1-next: $desc";;
    *) echo "== $c's clean-m1-next is not this branch's staging (${desc:-no clean-m1-next}): just layer-stage $branch first" >&2; exit 2;;
  esac
done

echo "== 2. the gate: the full sweep $(date +%H:%M:%S)"
if ! RUNSET_AFTER="${GATE_AFTER:-}" lab/tools/runset.sh "layer-$branch"; then
  echo "== the sweep is not green: nothing promoted, main not moved" >&2; exit 1
fi
setfile=$(ls -t lab/results/runsets/*-layer-"$branch"*.json | head -1)
runs=$(python3 -c 'import json,sys; rs=json.load(open(sys.argv[1])); r=[e["run"] for s in rs["scenarios"] for e in rs["runs"].get(s,[]) if e.get("run")]; print(f"{r[0]} to {r[-1]} ({len(r)} runs)" if r else "")' "$setfile")
watch=$(python3 -c 'import json,sys; print(", ".join(json.load(open(sys.argv[1]))["watch"]))' "$setfile")

echo "== 3. $branch into main $(date +%H:%M:%S)"
landed=""; how=""; was=""
for attempt in 1 2 3; do
  git fetch -q origin main "$branch"
  [ "$(git rev-parse "origin/$branch")" = "$sha" ] || { echo "== origin/$branch moved during the gate (now $(git rev-parse --short=8 "origin/$branch"), staged $sha8): nothing promoted" >&2; exit 1; }
  main=$(git rev-parse origin/main); was=${was:-$main}
  if git merge-base --is-ancestor "$sha" "$main"; then landed=$main; how="in main already"; break; fi
  if git merge-base --is-ancestor "$main" "$sha"; then
    target=$sha; how="fast-forward"
  else
    tree=$(git merge-tree --write-tree "$main" "$sha" | head -1) \
      || { echo "== $branch does not merge cleanly into main ${main:0:8}: nothing promoted; merge main into the branch, layer-stage it again" >&2; exit 1; }
    target=$(git commit-tree "$tree" -p "$main" -p "$sha" -m "Merge branch '$branch' into main: a mod layer, its full sweep $(basename "${setfile%.json}") green")
    how="merge commit"
  fi
  if out=$(git push -q origin "${target}:refs/heads/main" 2>&1); then landed=$target; break; fi
  echo "   push refused (attempt $attempt): $(printf '%s' "$out" | grep -v '^remote:' | head -2 | tr '\n' ' ')"
done
[ -n "$landed" ] || { echo "== main did not take the layer in three attempts: nothing promoted" >&2; exit 1; }
git fetch -q origin main
echo "   thuum main = ${landed:0:8} ($how; was ${was:0:8})"

for c in c1 c2; do
  echo "== 4. promote $c clean-m1-next -> clean-m1 $(date +%H:%M:%S)"
  just client-promote "$c" clean-m1-next 2>&1 | tail -1 | cut -c1-160
done

entry="- $branch (a mod layer) merged to main ${landed:0:8} by $how ($(date -u +%Y-%m-%dT%H:%MZ)): the full sweep ${GATE_AFTER:+$GATE_AFTER (stopped by a lab fault) and its rest }$(basename "${setfile%.json}"), $runs${watch:+; watch items: $watch}; both clones promoted. Plugins: (fill in)."
today="### $(date -u +%Y-%m-%d)"
grep -q "^$today\$" docs/LOG.md || printf '\n%s\n\n' "$today" >> docs/LOG.md
printf '%s\n' "$entry" >> docs/LOG.md
echo "== 5. LOG.md entry appended (finish it by hand):"
echo "$entry"
echo "== layer-merge $branch done $(date +%H:%M:%S)"
