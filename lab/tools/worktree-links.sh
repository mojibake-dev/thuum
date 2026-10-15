#!/usr/bin/env bash
# worktree-links.sh: in a git worktree of thuum, link the main checkout's ignored
# inputs the lab tools read (lab/.cache: the mods' archives, SKSE, GPU drivers;
# addrlib/: the Address Library bins stage-client lays), so a staging run from a
# branch's worktree reads what the main checkout's would. A no-op in the main
# checkout. layer-stage and verb-stage call it first.
set -euo pipefail
cd "$(dirname "$0")/../.."
main_root=$(dirname "$(git rev-parse --path-format=absolute --git-common-dir)")
[ "$main_root" = "$(pwd -P)" ] && exit 0
for p in lab/.cache addrlib; do
  if [ ! -e "$p" ] && [ -e "$main_root/$p" ]; then ln -s "$main_root/$p" "$p" && echo "   $p -> $main_root/$p"; fi
done
