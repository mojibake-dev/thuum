#!/usr/bin/env bash
# turbo-client-build.sh <fork-ref>: skymp5-client.js built from <fork-ref> on this Mac, for turbo-client (ADR-041 item
# 2(a)), in seconds instead of the Windows workflow's half hour. The fork worktree is sparse (skymp5-client/ alone) and
# kept at lab/.cache/turbo-fork, outside /tmp's pruning. Its Skyrim Platform typings are the npm package in
# node_modules (skymp5-client/tsconfig.json), so no C++ configure is needed. yarn 1 runs through npx (the lockfile is
# yarn v1; nothing is installed globally); `yarn install --frozen-lockfile` reruns only when yarn.lock changed. The
# bundle is webpack's output, build/dist/client/Data/Platform/Plugins/skymp5-client.js (webpack.config.js), and its
# path is the script's last line.
set -euo pipefail
ref=${1:?fork ref: a branch or sha (just turbo-client-build m2-train-27-snap)}
here=$(cd "$(dirname "$0")/../.." && pwd)
fork=${FORK_DIR:-$here/skymp}
wt=$here/lab/.cache/turbo-fork
yarn=(npx --yes yarn@1.22.22)
git -C "$fork" fetch -q origin "$ref" 2>/dev/null || true
sha=$(git -C "$fork" rev-parse --verify -q "origin/$ref^{commit}" || git -C "$fork" rev-parse --verify "$ref^{commit}")
if [ ! -e "$wt/.git" ]; then
  mkdir -p "$(dirname "$wt")"
  git -C "$fork" worktree add -q --no-checkout --detach "$wt" "$sha"
  git -C "$wt" sparse-checkout set skymp5-client
fi
git -C "$wt" checkout -q --detach "$sha"
cd "$wt/skymp5-client"
lock=$(shasum -a 256 yarn.lock | cut -c1-16)
if [ "$(cat node_modules/.turbo-lock 2>/dev/null || true)" != "$lock" ]; then
  t=$(date +%s)
  "${yarn[@]}" install --frozen-lockfile --silent --non-interactive >&2
  echo "$lock" > node_modules/.turbo-lock
  echo "   yarn install $(( $(date +%s) - t )) s (yarn.lock $lock)" >&2
fi
t=$(date +%s)
"${yarn[@]}" --silent build >&2
out=$wt/build/dist/client/Data/Platform/Plugins/skymp5-client.js
[ -s "$out" ] || { echo "== no bundle at $out" >&2; exit 3; }
echo "   webpack $(( $(date +%s) - t )) s: skymp5-client.js $(( $(wc -c < "$out") / 1024 )) KiB at ${sha:0:8}" >&2
echo "$out"
