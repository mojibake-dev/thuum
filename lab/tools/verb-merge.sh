#!/usr/bin/env bash
# verb-merge.sh <fork branch> [scenario...]: a verb branch's merge to parity the
# ADR-030 way, one shape for every verb (it replaces the per-merge chain scripts
# that encoded this nine times with a new bug each). In order:
#   1. the lab tree deployed (the gate's scenarios and lab/gate.yaml on sky-srv);
#   2. the full T2 on the branch's server image (`just test-proto <branch>`;
#      T2=skip when a T2 of this head is already recorded);
#   3. the gate: lab/gate.yaml's `always`, the scenarios named here (the verb's
#      own and the touched verbs'), and `watch` (the open ADR-027 items), as one
#      run set; a red stops everything before parity moves;
#   4. fork parity fast-forwarded to the branch (a plain push; a branch that is
#      not ahead of parity stops here);
#   5. both clones' clean-m1-next promoted to clean-m1 when the branch changed
#      the client (PROMOTE=1 forces it, PROMOTE=0 skips it);
#   6. a dated entry appended to docs/LOG.md with the run ids, to finish by hand
#      with the merge commit (the submodule bump, PLAN's state lines).
# Never force-pushes, never rebases, never switches the shared checkouts.
set -euo pipefail
cd "$(dirname "$0")/../.."
branch=${1:?fork branch}; shift
fork=skymp
git -C "$fork" fetch -q origin "$branch" parity
head=$(git -C "$fork" rev-parse --short=8 "origin/$branch")
echo "== verb-merge $branch ($head) $(date +%H:%M:%S)"
if ! git -C "$fork" merge-base --is-ancestor origin/parity "origin/$branch"; then
  echo "== origin/$branch does not contain origin/parity: merge parity into the branch first (never rebase)" >&2; exit 2
fi
if [ "$(git -C "$fork" rev-parse origin/parity)" = "$(git -C "$fork" rev-parse "origin/$branch")" ]; then
  echo "== origin/$branch is parity already; nothing to merge" >&2; exit 2
fi

echo "== 1. deploy-srv $(date +%H:%M:%S)"
just deploy-srv 2>&1 | tail -1

if [ "${T2:-}" = skip ]; then
  echo "== 2. T2 skipped (T2=skip): cite the T2 of $head in the merge commit"
else
  echo "== 2. T2 on skymp-server:$branch $(date +%H:%M:%S)"
  t2log=lab/results/runsets/t2-$branch-$head.log; mkdir -p lab/results/runsets
  if ! just test-proto "$branch" > "$t2log" 2>&1; then
    tail -8 "$t2log"; echo "== T2 not green ($t2log): parity not moved" >&2; exit 1
  fi
  grep -q '^T2 green' "$t2log" || { tail -4 "$t2log"; echo "== T2 did not end green: parity not moved" >&2; exit 1; }
  echo "   $(grep '^T2 green' "$t2log")"
fi

echo "== 3. the gate $(date +%H:%M:%S)"
gate=$(python3 - lab/gate.yaml "$@" <<'PY'
import sys, yaml
g = yaml.safe_load(open(sys.argv[1]))
order = list(g.get("always", [])) + list(sys.argv[2:]) + list(g.get("watch", []))
print(" ".join(dict.fromkeys(order)))
PY
)
echo "   $gate"
if ! lab/tools/runset.sh "merge-$branch" $gate; then
  echo "== the gate is not green: parity not moved" >&2; exit 1
fi
setfile=$(ls -t lab/results/runsets/*-merge-"$branch"*.json | head -1)
runs=$(python3 -c 'import json,sys; rs=json.load(open(sys.argv[1])); r=[e["run"] for s in rs["scenarios"] for e in rs["runs"].get(s,[]) if e.get("run")]; print(f"{r[0]} to {r[-1]} ({len(r)} runs)" if r else "")' "$setfile")
watch=$(python3 -c 'import json,sys; print(", ".join(json.load(open(sys.argv[1]))["watch"]))' "$setfile")

echo "== 4. parity -> $branch $head $(date +%H:%M:%S)"
git -C "$fork" push -q origin "origin/$branch:parity"
git -C "$fork" fetch -q origin parity
[ "$(git -C "$fork" rev-parse --short=8 origin/parity)" = "$head" ] || { echo "== parity did not land on $head" >&2; exit 1; }
echo "   fork parity = $head"

client_changed=$(git -C "$fork" diff --name-only "origin/parity~1" "origin/$branch" -- skymp5-client skyrim-platform skymp-wire/crates/wire-client-ffi 2>/dev/null | head -1 || true)
promote=${PROMOTE:-}
[ -n "$promote" ] || { [ -n "$client_changed" ] && promote=1 || promote=0; }
if [ "$promote" = 1 ]; then
  for c in c1 c2; do
    echo "== 5. promote $c clean-m1-next -> clean-m1 $(date +%H:%M:%S)"
    just client-promote "$c" clean-m1-next 2>&1 | tail -1 | cut -c1-160
  done
else
  echo "== 5. no client change on the branch: clones not promoted (PROMOTE=1 to force)"
fi

entry="- $branch merged to fork parity $head ($(date -u +%Y-%m-%dT%H:%MZ)): the gate $(basename "${setfile%.json}"), $runs${watch:+; watch items: $watch}; T2 ${T2:-green} on skymp-server:$branch; clones $([ "$promote" = 1 ] && echo promoted || echo 'not promoted'). Verbs: (fill in)."
today="### $(date -u +%Y-%m-%d)"
grep -q "^$today\$" docs/LOG.md || printf '\n%s\n\n' "$today" >> docs/LOG.md
printf '%s\n' "$entry" >> docs/LOG.md
echo "== 6. LOG.md entry appended (finish it with the merge commit):"
echo "$entry"
echo "== verb-merge $branch done $(date +%H:%M:%S)"
