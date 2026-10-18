#!/usr/bin/env bash
# verb-stage.sh <fork branch> [probe...]: a verb branch staged on the lab, one
# shape for every verb (the stage-branch.sh chains of M1 and M2, generalized).
# In order:
#   1. the Windows client build of the branch's head waited for (parity-windows.yml
#      starts it at the push; a dispatch only when none exists; a failed run is
#      rerun twice, since its coverage job is flaky);
#   1b. that head's GitHub "Formatting check" (upstream's linter) waited for, and a red
#      one stops the stage: parity would carry it to every branch after it (50 of 66 runs
#      red from 10-15 to 10-17 on two faults that sat on parity; `just fork-lint <tree>`
#      runs its two checks locally before a push);
#   2. the fork pipeline of that head waited for (skymp-server:<branch>-<sha8>);
#   3. with LABAPI=<thuum pipeline id>, that pipeline too (a lab-api image);
#   4. an idle lab (no run, no run set);
#   5. the lab tree deployed (`just deploy-srv`);
#   6. the server switched to the branch's image, lab-api and the server pulled
#      and up;
#   7. the branch's client dist laid into both clones (c2 then c1, each checked
#      by client-dist's last line, retried once), the driver with it;
#   8. both clones snapshotted as clean-m1-next;
#   9. the probes named (scenario ids or paths), each through `just lab-run`.
# Stops at the first failure; nothing is snapshotted over a clone whose dist did
# not land. Never opens a Moonlight stream (Eli's seats are his).
# Runs from the main checkout, or from a worktree of a thuum branch whose lab
# tree the verb needs (ghostwalk's settings), with FORK_DIR naming the fork
# checkout; either way the tree must contain origin/main, since step 5's
# deploy-srv would otherwise roll back main's lab tree on sky-srv.
set -euo pipefail
cd "$(dirname "$0")/../.."
lab/tools/worktree-links.sh
branch=${1:?fork branch}; shift
probes=("$@")
api=${LAB_API:-https://thuum.gaussing.tv/lab}
fork=${FORK_DIR:-skymp}   # the fork checkout to fetch, read and push from; a worktree without the submodule names the shared one
srv_ssh="ssh -o BatchMode=yes -o ServerAliveInterval=15 -o ServerAliveCountMax=4 -J root@core.gaussing.tv eli@10.10.70.10"
git -C "$fork" fetch -q origin "$branch"
sha=$(git -C "$fork" rev-parse "origin/$branch"); sha8=${sha:0:8}
echo "== verb-stage $branch ($sha8) $(date +%H:%M:%S)"
git fetch -q origin main
if ! git merge-base --is-ancestor origin/main HEAD; then
  echo "== this tree ($(git rev-parse --short=8 HEAD)) lacks origin/main: its deploy-srv would roll back main's lab tree on sky-srv; merge main into it first (never rebase)" >&2; exit 2
fi

echo "== 1. the Windows build of $sha8"
reruns=0
for i in $(seq 1 120); do
  line=$(gh run list -R mojibake-dev/skymp --workflow parity-windows.yml --branch "$branch" --limit 10 \
           --json databaseId,headSha,status,conclusion --jq ".[] | select(.headSha==\"$sha\") | \"\(.databaseId) \(.status) \(.conclusion)\"" | head -1)
  if [ -z "$line" ]; then
    if [ "$i" = 1 ]; then
      echo "   no Windows run for $sha8 yet: dispatching one (a branch that predates the push trigger)"
      gh workflow run parity-windows.yml -R mojibake-dev/skymp --ref "$branch" >/dev/null
    fi
    sleep 30; continue
  fi
  win_id=${line%% *}; rest=${line#* }; st=${rest%% *}; con=${rest#* }
  case "$st:$con" in
    completed:success) echo "   run $win_id ok $(date +%H:%M:%S)"; break;;
    completed:failure)
      reruns=$((reruns+1))
      [ "$reruns" -le 2 ] || { echo "== Windows run $win_id failed after $reruns attempts" >&2; exit 1; }
      echo "   run $win_id failed, rerun $reruns $(date +%H:%M:%S)"
      gh run rerun "$win_id" -R mojibake-dev/skymp --failed >/dev/null 2>&1 || true
      sleep 60;;
    completed:*) echo "== Windows run $win_id ended $con" >&2; exit 1;;
    *) sleep 60;;
  esac
done
[ "${st:-}:${con:-}" = completed:success ] || { echo "== the Windows build did not finish in time" >&2; exit 1; }

echo "== 1b. the Formatting check of $sha8"
fline=""
for _ in $(seq 1 40); do
  fline=$(gh run list -R mojibake-dev/skymp --workflow "Formatting check" --branch "$branch" --limit 10 \
            --json headSha,status,conclusion --jq ".[] | select(.headSha==\"$sha\") | \"\(.status) \(.conclusion)\"" | head -1)
  case "$fline" in
    "completed success") echo "   Formatting check ok $(date +%H:%M:%S)"; break;;
    "completed "*) echo "== the Formatting check of $sha8 ended ${fline#completed }: \`just fork-lint\` on the branch's tree names the files" >&2; exit 1;;
  esac
  sleep 30
done
[ "$fline" = "completed success" ] || { echo "== no Formatting check of $sha8 finished (${fline:-none found})" >&2; exit 1; }

pipeline_status() { # <project id> <sha or pipeline id>: the newest pipeline's status for a sha, or a pipeline's
  python3 - "$1" "$2" <<'PY'
import json, subprocess, sys, urllib.request
proj, key = sys.argv[1], sys.argv[2]
acct = {"6": "thuum", "7": "skymp"}[proj]
tok = subprocess.run(["security", "find-generic-password", "-s", "gitlab-thuum-readapi", "-a", acct, "-w"], capture_output=True, text=True).stdout.strip()
url = f"https://gitlab.gaussing.tv/api/v4/projects/{proj}/pipelines" + (f"/{key}" if key.isdigit() else f"?sha={key}&per_page=1")
try:
    d = json.load(urllib.request.urlopen(urllib.request.Request(url, headers={"PRIVATE-TOKEN": tok}), timeout=20))
except Exception as e:
    print("unknown", e); sys.exit(0)
if isinstance(d, list):
    print(d[0]["status"] if d else "none")
else:
    print(d["status"])
PY
}
wait_pipeline() { # <project id> <sha or id> <what>
  for _ in $(seq 1 180); do
    st=$(pipeline_status "$1" "$2")
    case "$st" in
      success) echo "   $3 ok $(date +%H:%M:%S)"; return 0;;
      failed|canceled) echo "== $3: $st" >&2; return 1;;
    esac
    sleep 30
  done
  echo "== $3 did not finish: $st" >&2; return 1
}
echo "== 2. the fork pipeline of $sha8"
wait_pipeline 7 "$sha" "fork pipeline"
if [ -n "${LABAPI:-}" ]; then
  echo "== 3. thuum pipeline $LABAPI (lab-api image)"
  wait_pipeline 6 "$LABAPI" "thuum pipeline $LABAPI"
fi

echo "== 4. an idle lab"
for _ in $(seq 1 120); do
  idle=$(curl -fsS -m 15 "$api/status" | python3 -c 'import json,sys; d=json.load(sys.stdin); print(d.get("run") is None and d.get("runset") is None)' || echo False)
  [ "$idle" = True ] && break
  sleep 20
done
[ "$idle" = True ] || { echo "== the lab stayed busy" >&2; exit 1; }

# the lab is this staging's while the server switches and the clones are written: no run, no run set, no nightly
# (the first nightly rolled a clone back under a client-dist, 2026-10-13); released before the probes
curl -fsS -m 15 -X POST "$api/hold" -H 'content-type: application/json' -d "{\"minutes\": 90, \"reason\": \"verb-stage $branch $sha8\"}" >/dev/null 2>&1 || echo "   (this lab-api has no hold yet)"
echo "== 5. deploy-srv $(date +%H:%M:%S)"
just deploy-srv 2>&1 | tail -1
echo "== 6. server tag $branch, pulls $(date +%H:%M:%S)"
$srv_ssh "cd /srv/lab && sed -i 's/^SERVER_TAG=.*/SERVER_TAG=$branch/' .env && grep '^SERVER_TAG' .env && docker compose pull -q skymp-server lab-api && docker compose up -d skymp-server lab-api >/dev/null 2>&1 && echo '   server and lab-api up'"
# the pull restarts lab-api when its image changed, and a restart drops the hold taken above
# (m2-cast-action's staging, 2026-10-14): take it again once lab-api answers
for _ in $(seq 1 30); do curl -fsS -m 5 "$api/status" >/dev/null 2>&1 && break; sleep 2; done
curl -fsS -m 15 -X POST "$api/hold" -H 'content-type: application/json' -d "{\"minutes\": 90, \"reason\": \"verb-stage $branch $sha8\"}" >/dev/null 2>&1 && echo "   hold taken again after lab-api's restart" || echo "   (could not take the hold again)"

echo "== 7. the client on both clones $(date +%H:%M:%S)"
# client-dist stages the built driver bundle with the dist (stage-client.sh), so build it first: a fresh
# worktree has none, and the main checkout's would be whatever was built last
echo "   driver bundle: $(just build-driver 2>&1 | tail -1 | awk '{print $5, $NF}')"
just build-client "$branch" "$sha" 2>&1 | grep -E "^run [0-9]+ " | cut -c1-120   # the build of this head, not the branch's newest
# where build-client put it: the tree's own skymp/ (a worktree's is not the fork checkout FORK_DIR names)
echo "   dist js $(shasum -a 256 "skymp/build/dist-client/client/Data/Platform/Plugins/skymp5-client.js" | cut -c1-16)"
for v in 712 711; do
  ok=""
  for attempt in 1 2; do
    last=$(lab/tools/client-dist.sh "$v" 2>&1 | tail -1) || true   # a failure is read below and retried, not fatal here
    echo "   $last" | cut -c1-140
    case "$last" in "dist laid into every game folder on VM $v:"*) ok=1; break;; esac
    echo "   client-dist $v failed (attempt $attempt)"
  done
  [ -n "$ok" ] || { echo "== client-dist $v failed twice: stop before any snapshot" >&2; exit 1; }
done
echo "   driver 712"; just client-driver 712 2 2>&1 | tail -1 | cut -c1-160
echo "   driver 711"; just client-driver 711 1 2>&1 | tail -1 | cut -c1-160

echo "== 8. snapshots clean-m1-next $(date +%H:%M:%S)"
for c in c2 c1; do
  just client-snapshot "$c" clean-m1-next "$branch client $sha8, $(date +%F)" 2>&1 | tail -1 | cut -c1-120
done

curl -fsS -m 15 -X POST "$api/release" >/dev/null 2>&1 || true
if [ "${#probes[@]}" -gt 0 ]; then
  echo "== 9. probes"
  # a probe is a question: its red is an answer for the verb doc, not a staging failure, so every
  # probe runs and each prints its run id and verdict (m2-cast-action's first probe went red and,
  # under set -e, took the other three with it, 2026-10-14)
  for probe in "${probes[@]}"; do
    echo "   $probe $(date +%H:%M:%S)"
    out=$(just lab-run "$probe" 2>&1) || true
    printf '%s\n' "$out" | grep -E ' (green|red|error) -> ' || { echo "   (no verdict line from lab-run:)"; printf '%s\n' "$out" | tail -3; }
  done
fi
echo "== verb-stage $branch ($sha8) done $(date +%H:%M:%S)"
