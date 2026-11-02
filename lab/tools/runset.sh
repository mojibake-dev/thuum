#!/usr/bin/env bash
# runset.sh <name> [scenario...]: a run set through lab-api (POST /lab/runset,
# docs/LAB.md; ADR-030): every committed scenario when none is named, else the
# ones named, played one after another with the lab-fault and ADR-027 reruns
# applied by lab-api. Prints each run's verdict as it lands, then the set's
# summary and run ids (for a merge commit or a LOG.md entry), saves the set's
# record to lab/results/runsets/<id>.json, and exits 0 for green or watch,
# 1 otherwise. RUNSET_WAIT_S (default 600) bounds the wait for an idle lab.
# RUNSET_AFTER=<set id> runs the rest of a set that stopped or ended without a
# verdict of its own (a lab fault took a clone away mid-set, 2026-10-16): every
# scenario whose last verdict there is not green, less what lab/gate.yaml holds
# pending (gate-cite.py's rest_of), on the same staged lab; the two sets together
# are the sweep.
set -euo pipefail
cd "$(dirname "$0")/../.."
api=${LAB_API:-https://thuum.gaussing.tv/lab}
name=${1:?run set name}; shift
mkdir -p lab/results/runsets

# one run set at a time, after any run posted by hand
for _ in $(seq 1 $(( ${RUNSET_WAIT_S:-600} / 10 ))); do
  idle=$(curl -fsS -m 15 "$api/status" | python3 -c 'import json,sys; d=json.load(sys.stdin); print(d.get("run") is None and d.get("runset") is None)' || echo False)
  [ "$idle" = True ] && break
  sleep 10
done

if [ -n "${RUNSET_AFTER:-}" ]; then
  # read failures stop here: an empty rest must mean every scenario there is green, never an unread set
  prev=$(curl -fsS -m 30 "$api/runset/$RUNSET_AFTER") || { echo "run set $RUNSET_AFTER is not readable" >&2; exit 1; }
  # the rest is gate-cite.py's rest_of(), the one its chain() holds a later set to: a scenario lab/gate.yaml holds
  # pending is left out, as an "all" sweep leaves it out (a rest with the union's pending reds in it was refused as
  # a chain, 2026-10-30; check 1 reads a pending red in the first set as pending)
  rest_list=$(printf '%s' "$prev" | python3 -c '
import importlib.util, json, sys
spec = importlib.util.spec_from_file_location("gate_cite", "lab/tools/gate-cite.py")
gc = importlib.util.module_from_spec(spec); spec.loader.exec_module(gc)
rs = json.load(sys.stdin)
rid, state, verdict = rs["id"], rs["state"], rs.get("verdict")
# stopped by hand or by two lab faults in a row, or ended early (a lab error such as E_RUN_HOLD refusing a rerun):
# never one still running
if not (state == "stopped" or (state == "done" and verdict not in ("green", "watch"))):
    sys.exit(f"run set {rid} is {state} ({verdict}): its rest is not a set of its own")
pending = gc.gate_lists().get("pending", [])
left = [s for s in gc._not_green_last(rs) if s in set(pending)]
if left:
    print("left out as pending in lab/gate.yaml: " + ", ".join(left), file=sys.stderr)
for s in gc.rest_of(rs, pending):
    print(s)
') || { echo "run set $RUNSET_AFTER: no rest taken" >&2; exit 1; }
  [ -n "$rest_list" ] || { echo "run set $RUNSET_AFTER has nothing left that is not green, or only what lab/gate.yaml holds pending"; exit 0; }
  mapfile -t rest <<< "$rest_list"
  echo "the rest of run set $RUNSET_AFTER: ${#rest[@]} scenarios"
  set -- "${rest[@]}"
fi

body=$(python3 - "$name" "$@" <<'PY'
import json, sys
name, scenarios = sys.argv[1], sys.argv[2:]
print(json.dumps({"name": name, "scenarios": scenarios or "all"}))
PY
)
set_json=$(curl -fsS -m 30 -X POST "$api/runset" -H 'content-type: application/json' --data-binary "$body")
id=$(printf '%s' "$set_json" | python3 -c 'import json,sys; print(json.load(sys.stdin)["id"])')
total=$(printf '%s' "$set_json" | python3 -c 'import json,sys; print(len(json.load(sys.stdin)["scenarios"]))')
echo "run set $id started: $total scenarios"

python3 - "$id" "$api" <<'PY'
import json, sys, time, urllib.request
rid, api = sys.argv[1], sys.argv[2]
seen = 0
misses = 0
while True:
    try:
        with urllib.request.urlopen(f"{api}/runset/{rid}", timeout=30) as r:
            rs = json.load(r)
        misses = 0
    except (OSError, ValueError) as e:
        misses += 1
        if misses > 30:
            raise
        print("   poll failed, retrying:", e, flush=True)
        time.sleep(10)
        continue
    # every run that landed since the last poll, in order
    entries = [(s, e) for s in rs["scenarios"] for e in rs["runs"].get(s, [])]
    for s, e in entries[seen:]:
        tag = f" (rerun: {e['rerun']})" if e.get("rerun") else ""
        print(f"  {s}: {e['verdict']} {e['run'] or ''}{tag}", flush=True)
    seen = len(entries)
    if rs["state"] in ("done", "stopped"):
        break
    time.sleep(15)
summary = rs["summary"]
json.dump(rs, open(f"lab/results/runsets/{rid}.json", "w"), indent=2)
print(f"run set {rid} {rs['state']}: verdict {rs['verdict']}, {summary['counts']}" + (f", watch items: {', '.join(rs['watch'])}" if rs["watch"] else ""))
for n in rs.get("notes", []):
    print("  note:", n)
runs = [e["run"] for s in rs["scenarios"] for e in rs["runs"].get(s, []) if e.get("run")]
if runs:
    print(f"runs {runs[0]} to {runs[-1]} ({len(runs)}), https://thuum.gaussing.tv/results/")
sys.exit(0 if rs["verdict"] in ("green", "watch") else 1)
PY
