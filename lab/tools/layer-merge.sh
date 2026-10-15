#!/usr/bin/env bash
# layer-merge.sh <thuum branch>: a staged mod-layer branch's merge, verb-merge's
# sibling (ADR-030: a non-verb promotion takes the full sweep, since a load order
# touches every verb). Run from the worktree layer-stage ran in. In order:
#   1. the branch contains origin/main and is the staged tree (layer-stage's
#      "<branch> layer <sha8>" in both clones' clean-m1-next description);
#   2. the gate: every committed scenario as one run set, `layer-<branch>`
#      (lab-api's lab-fault and ADR-027 reruns apply; a red stops here);
#   3. both clones' clean-m1-next promoted to clean-m1;
#   4. thuum main fast-forwarded to the branch (a plain push);
#   5. a dated entry appended to docs/LOG.md with the run ids, to finish by
#      hand with the merge commit.
# Never force-pushes, never rebases, never switches the shared checkout.
set -euo pipefail
cd "$(dirname "$0")/../.."
branch=${1:?thuum branch}
api=${LAB_API:-https://thuum.gaussing.tv/lab}
git fetch -q origin "$branch" main
sha=$(git rev-parse "origin/$branch"); sha8=${sha:0:8}
echo "== layer-merge $branch ($sha8) $(date +%H:%M:%S)"
if ! git merge-base --is-ancestor origin/main "origin/$branch"; then
  echo "== origin/$branch does not contain origin/main: merge main into the branch first (never rebase)" >&2; exit 2
fi
if [ "$(git rev-parse origin/main)" = "$sha" ]; then
  echo "== origin/$branch is main already; nothing to merge" >&2; exit 2
fi
# the staged tree is this branch's: layer-stage wrote "<branch> layer <sha8>" into both clones' clean-m1-next
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
if ! lab/tools/runset.sh "layer-$branch"; then
  echo "== the sweep is not green: nothing promoted, main not moved" >&2; exit 1
fi
setfile=$(ls -t lab/results/runsets/*-layer-"$branch"*.json | head -1)
runs=$(python3 -c 'import json,sys; rs=json.load(open(sys.argv[1])); r=[e["run"] for s in rs["scenarios"] for e in rs["runs"].get(s,[]) if e.get("run")]; print(f"{r[0]} to {r[-1]} ({len(r)} runs)" if r else "")' "$setfile")
watch=$(python3 -c 'import json,sys; print(", ".join(json.load(open(sys.argv[1]))["watch"]))' "$setfile")

for c in c1 c2; do
  echo "== 3. promote $c clean-m1-next -> clean-m1 $(date +%H:%M:%S)"
  just client-promote "$c" clean-m1-next 2>&1 | tail -1 | cut -c1-160
done

echo "== 4. main -> $branch $sha8 $(date +%H:%M:%S)"
old_main=$(git rev-parse origin/main)
git push -q origin "origin/$branch:main"
git fetch -q origin main
[ "$(git rev-parse origin/main)" = "$sha" ] || { echo "== main did not land on $sha8" >&2; exit 1; }
echo "   thuum main = $sha8 (was ${old_main:0:8})"

entry="- $branch (a mod layer) merged to main $sha8 ($(date -u +%Y-%m-%dT%H:%MZ)): the full sweep $(basename "${setfile%.json}"), $runs${watch:+; watch items: $watch}; both clones promoted. Plugins: (fill in)."
today="### $(date -u +%Y-%m-%d)"
grep -q "^$today\$" docs/LOG.md || printf '\n%s\n\n' "$today" >> docs/LOG.md
printf '%s\n' "$entry" >> docs/LOG.md
echo "== 5. LOG.md entry appended (finish it with the merge commit):"
echo "$entry"
echo "== layer-merge $branch done $(date +%H:%M:%S)"
