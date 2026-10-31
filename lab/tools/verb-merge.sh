#!/usr/bin/env bash
# verb-merge.sh <fork branch> [scenario...]: a verb branch's merge to parity the
# ADR-030 way, one shape for every verb (it replaces the per-merge chain scripts
# that encoded this nine times with a new bug each). In order:
#   1. the lab tree deployed (the gate's scenarios and lab/gate.yaml on sky-srv);
#   2. the full T2 on the branch's server image (`just test-proto <branch>`;
#      T2=skip when a T2 of this head is already recorded, or with
#      T2_LOG=<log> when one runs beside the gate: step 3b waits for that log
#      to end green before parity moves);
#   3. (R0=1: ADR-053's fast path instead, for an R0 change no seat runs: refused
#      when the fork diff touches seat code, else T0 is the head's server-build
#      with its ctest green, and no lab gate runs; the nightly is its T3)
#      the gate: lab/gate.yaml's `always`, the scenarios named here (the verb's
#      own and the touched verbs'), and `watch` (the open ADR-027 items), as one
#      run set; a red stops everything before parity moves. GATE_SET=<run set id>
#      cites a finished set instead (ADR-042: a nightly or a layer's sweep of this
#      exact stage), or a chain <first>+<rest> (a gate a lab fault cut short and
#      RUNSET_AFTER finished), when lab/tools/gate-cite.py's five checks hold; else
#      the gate runs;
#   4. fork parity fast-forwarded to the commit the gate played: the branch's
#      head as read at the start, held to the gate's own builds by gate-cite.py
#      (--head, and --fresh for a gate this merge ran); a commit pushed to the
#      branch meanwhile waits for its next stage (a plain push; a branch that is
#      not ahead of parity stops here);
#   5. both clones' clean-m1-next promoted to clean-m1 when the branch changed
#      the client (PROMOTE=1 forces it, PROMOTE=0 skips it);
#   6. a dated entry appended to docs/LOG.md with the run ids, to finish by hand
#      with the merge commit (the submodule bump, PLAN's state lines).
# Never force-pushes, never rebases, never switches the shared checkouts.
set -euo pipefail
cd "$(dirname "$0")/../.."
branch=${1:?fork branch}; shift
fork=${FORK_DIR:-skymp}   # the fork checkout to fetch, read and push from; a worktree without the submodule names the shared one
git -C "$fork" fetch -q origin "$branch" parity
sha=$(git -C "$fork" rev-parse "origin/$branch"); head=${sha:0:8}   # what parity takes, whatever the branch does meanwhile
echo "== verb-merge $branch ($head) $(date +%H:%M:%S)"
if ! git -C "$fork" merge-base --is-ancestor origin/parity "$sha"; then
  echo "== origin/$branch does not contain origin/parity: merge parity into the branch first (never rebase)" >&2; exit 2
fi
if [ "$(git -C "$fork" rev-parse origin/parity)" = "$sha" ]; then
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

setfile=""; cited=""; runs=""; watch=""; r0=""
if [ "${R0:-}" = 1 ]; then
  # ADR-053's rung fast path: a change whose state is R0 (the server computes) and that changes no engine behavior on any
  # seat merges on T0 and T2 alone, the nightly its T3. Refused mechanically when the fork's diff against parity touches
  # seat code (the client, Skyrim Platform, the front end, the gamemode's libraries and scripts, the wire's client FFI);
  # T0 is the head's server-build, whose image build runs ctest, read from its trace (the job skips ctest without the esm)
  echo "== 3. R0 (ADR-053): T0 and T2, no lab gate $(date +%H:%M:%S)"
  seat=$(git -C "$fork" diff --name-only origin/parity "$sha" | grep -E '^(skymp5-client|skyrim-platform|skymp5-front|skymp5-functions-lib|skymp5-scripts|skymp-wire/crates/wire-client-ffi)/' || true)
  if [ -n "$seat" ]; then
    echo "== R0 refused: $head changes seat code against parity (merge it with its gate):" >&2
    printf '   %s\n' $seat >&2; exit 2
  fi
  t0=$(python3 - "$sha" <<'PY'
import sys, urllib.request
sys.path.insert(0, "lab/tools")
import glab
tok = glab.token("skymp"); sha = sys.argv[1]
for p in glab.get(tok, f"/projects/7/pipelines?sha={sha}&per_page=20"):
    for j in glab.get(tok, f"/projects/7/pipelines/{p['id']}/jobs?per_page=100"):
        if j["name"] != "server-build" or j["status"] != "success":
            continue
        req = urllib.request.Request(f"{glab.G}/projects/7/jobs/{j['id']}/trace", headers={"PRIVATE-TOKEN": tok})
        with urllib.request.urlopen(req, timeout=60) as r:
            trace = r.read().decode("utf-8", "replace")
        line = next((l.strip() for l in trace.splitlines() if "100% tests passed" in l), "")
        if line:
            print(f"pipeline {p['id']} server-build {j['id']}: {line[line.index('100%'):]}"); sys.exit(0)
sys.exit(1)
PY
  ) || { echo "== R0 refused: no successful server-build at $head whose ctest ran green (T0)" >&2; exit 2; }
  echo "   T0: $t0"
  r0=" R0 (ADR-053): T0 $t0, no lab gate (the nightly is its T3)"
else
echo "== 3. the gate $(date +%H:%M:%S)"
# lab/gate.yaml is two lists, `always: [a, b]` and `watch:` with one `- name` a
# line (comments allowed); read with the standard library alone, since the Mac's
# python3 has no PyYAML (the first live run stopped here, 2026-10-13 17:19)
gate=$(python3 - lab/gate.yaml "$@" <<'PY'
import re, sys
lists, cur = {}, None
for raw in open(sys.argv[1], encoding="utf-8"):
    line = raw.split("#", 1)[0].rstrip()
    if not line.strip():
        continue
    m = re.match(r"^(\w+):\s*(.*)$", line)
    if m:
        cur = m.group(1)
        inline = m.group(2).strip()
        lists[cur] = [x.strip().strip("'\"") for x in inline.strip("[]").split(",") if x.strip()] if inline.startswith("[") else []
        continue
    m = re.match(r"^\s*-\s*(\S+)", line)
    if m and cur:
        lists[cur].append(m.group(1).strip("'\""))
order = lists.get("always", []) + list(sys.argv[2:]) + lists.get("watch", [])
print(" ".join(dict.fromkeys(order)))
PY
)
echo "   $gate"
setfile=""; cited=""
if [ -n "${GATE_SET:-}" ]; then
  echo "   citing run set $GATE_SET (ADR-042)"
  if FORK_DIR="$fork" python3 lab/tools/gate-cite.py --head "$sha" "$GATE_SET" "$branch" $gate; then
    mkdir -p lab/results/runsets
    # one set, or a chain "<first>+<rest>" that RUNSET_AFTER finished, read as one (gate-cite.py --combine)
    python3 lab/tools/gate-cite.py --combine "$GATE_SET" > "lab/results/runsets/$GATE_SET.json"
    setfile=lab/results/runsets/$GATE_SET.json; cited=" (cited, ADR-042)"
    echo "   the cited set stands for the gate: no gate run"
  else
    echo "   the cited set does not stand for the gate (above): the gate runs"
  fi
fi
if [ -z "$setfile" ]; then
  if ! lab/tools/runset.sh "merge-$branch" $gate; then
    echo "== the gate is not green: parity not moved" >&2; exit 1
  fi
  setfile=$(ls -t lab/results/runsets/*-merge-"$branch"*.json | head -1)
  # the gate played $head's stage, as one build that nothing replaced: a cited set's checks 2 to 5
  echo "   the gate's builds against $head"
  if ! FORK_DIR="$fork" python3 lab/tools/gate-cite.py --fresh --head "$sha" "$(basename "${setfile%.json}")" "$branch" $gate; then
    echo "== the gate did not play $head's stage (above): parity not moved" >&2; exit 1
  fi
fi
runs=$(python3 -c 'import json,sys; rs=json.load(open(sys.argv[1])); r=[e["run"] for s in rs["scenarios"] for e in rs["runs"].get(s,[]) if e.get("run")]; print(f"{r[0]} to {r[-1]} ({len(r)} runs)" if r else "")' "$setfile")
watch=$(python3 -c 'import json,sys; print(", ".join(json.load(open(sys.argv[1]))["watch"]))' "$setfile")
fi

if [ -n "${T2_LOG:-}" ]; then
  # a T2 run beside the gate (T2=skip with T2_LOG=<its log>): parity moves only once that log ends green
  echo "== 3b. the T2 beside the gate ($T2_LOG) $(date +%H:%M:%S)"
  until grep -q -E '^T2 (green|red|partial|trial)|^T2 exit [0-9]' "$T2_LOG" 2>/dev/null; do sleep 20; done
  grep -q '^T2 green' "$T2_LOG" || { grep -E '^T2 ' "$T2_LOG" | tail -2; echo "== the T2 beside the gate is not green: parity not moved" >&2; exit 1; }
  echo "   $(grep -m1 '^T2 green' "$T2_LOG")"
fi

echo "== 4. parity -> $branch $head $(date +%H:%M:%S)"
git -C "$fork" fetch -q origin "$branch" parity
now=$(git -C "$fork" rev-parse "origin/$branch")
[ "$now" = "$sha" ] || echo "   origin/$branch moved to ${now:0:8} during the merge: parity takes the gated $head, the rest waits for its stage"
old_parity=$(git -C "$fork" rev-parse origin/parity)
git -C "$fork" push -q origin "$sha:refs/heads/parity"
git -C "$fork" fetch -q origin parity
[ "$(git -C "$fork" rev-parse origin/parity)" = "$sha" ] || { echo "== parity did not land on $head" >&2; exit 1; }
echo "   fork parity = $head (was ${old_parity:0:8})"

# what the branch changed on the client side since the parity it grew from
client_changed=$(git -C "$fork" diff --name-only "$old_parity" "$sha" -- skymp5-client skyrim-platform skymp-wire/crates/wire-client-ffi 2>/dev/null | head -1 || true)
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

if [ -n "$r0" ]; then
  entry="- $branch merged to fork parity $head ($(date -u +%Y-%m-%dT%H:%MZ)):$r0; T2 ${T2:-green} on skymp-server:$branch; clones $([ "$promote" = 1 ] && echo promoted || echo 'not promoted'). Verbs: (fill in)."
else
  entry="- $branch merged to fork parity $head ($(date -u +%Y-%m-%dT%H:%MZ)): the gate $(basename "${setfile%.json}")$cited, $runs${watch:+; watch items: $watch}; T2 ${T2:-green} on skymp-server:$branch; clones $([ "$promote" = 1 ] && echo promoted || echo 'not promoted'). Verbs: (fill in)."
fi
today="### $(date -u +%Y-%m-%d)"
grep -q "^$today\$" docs/LOG.md || printf '\n%s\n\n' "$today" >> docs/LOG.md
printf '%s\n' "$entry" >> docs/LOG.md
echo "== 6. LOG.md entry appended (finish it with the merge commit):"
echo "$entry"
echo "== verb-merge $branch done $(date +%H:%M:%S)"
