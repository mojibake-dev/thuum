#!/usr/bin/env bash
# The fork's Formatting check, run before a push (Eli, 2026-10-17: 50 of the
# last 66 runs of GitHub's "Formatting check" on mojibake-dev/skymp were red,
# every one on two faults that sat on parity itself, so no branch could show
# green). Upstream's check (skyrim-multiplayer/linter, pinned by commit and
# sha256 in the fork's workflow) lints every file the fork changed from
# upstream main; the two checks that failed here are:
#   - ClangFormat: each changed C++ file whole, as clang-format 21.1.8 writes
#     it (the version the linter downloads; Homebrew's is newer and formats
#     differently, which is how Hooks.cpp drifted);
#   - SP Types (Definitions): skyrimPlatform.ts regenerated from
#     FunctionsDump.txt and Definitions.txt by the repo's own
#     tools/ts_converter, byte for byte (a branch that edits the generated
#     file alone fails it).
# Both run here with the same pins: PyPI's clang-format wheel at 21.1.8
# through uvx, and the converter from the tree under test. Left to CI: CRLF,
# Linelint, the message pairs, and SP Const Enums (its extractor needs a yarn
# install). Prettier is its own workflow.
#
#   lab/tools/fork-lint.sh [fork tree]     (default: skymp)
#
# Exit 0 when both pass; 1 with the failing files named.
set -euo pipefail

tree="${1:-skymp}"
cf_version="21.1.8"
cd "$tree"

base="$(git merge-base HEAD origin/main)"
fail=0

# ClangFormat: the changed files the fork's linter-config.json gives its
# ClangFormat check (its extensions, less its excludePaths), so this list is
# upstream's and moves with it
mapfile -t cpp < <(git diff --name-only --diff-filter=AMR "$base" HEAD |
  python3 -c '
import json, sys
check = next(c for c in json.load(open("linter-config.json"))["checks"]
             if c["export"] == "ClangFormatCheck")
exts = tuple(check["options"]["extensions"])
skip = check["options"].get("excludePaths", [])
for f in sys.stdin.read().split():
    if f.endswith(exts) and not any(x in "/" + f for x in skip):
        print(f)
')
if [ "${#cpp[@]}" -gt 0 ]; then
  if ! uvx --quiet --from "clang-format==${cf_version}" clang-format \
      --style=file --dry-run -Werror "${cpp[@]}" 2>/tmp/fork-lint-cf.$$; then
    grep -o -E '^[^:]+:[0-9]+:[0-9]+' /tmp/fork-lint-cf.$$ | cut -d: -f1 | sort -u |
      sed "s/^/FAIL clang-format ${cf_version}: /"
    echo "  fix: uvx --from clang-format==${cf_version} clang-format -i --style=file <file>"
    fail=1
  fi
  rm -f /tmp/fork-lint-cf.$$
fi
echo "clang-format ${cf_version}: ${#cpp[@]} changed C++ files checked"

# SP Types (Definitions): regenerate into a scratch copy of the three inputs
conv="skyrim-platform/tools/ts_converter/index.js"
files="skyrim-platform/src/platform_se/codegen/convert-files"
tmp="$(mktemp -d)"
mkdir -p "$tmp/skyrim-platform/tools/ts_converter" "$tmp/$files"
cp "$conv" "$tmp/$conv"
cp "$files/FunctionsDump.txt" "$files/Definitions.txt" "$tmp/$files/"
node "$tmp/$conv"
if cmp -s "$tmp/$files/skyrimPlatform.ts" "$files/skyrimPlatform.ts"; then
  echo "codegen: skyrimPlatform.ts regenerates byte for byte"
else
  echo "FAIL codegen: $files/skyrimPlatform.ts differs from what Definitions.txt and FunctionsDump.txt make:"
  diff "$tmp/$files/skyrimPlatform.ts" "$files/skyrimPlatform.ts" | head -20 || true
  echo "  fix: put the change in Definitions.txt, then node $conv"
  fail=1
fi
rm -f "$tmp/$conv" "$tmp/$files/FunctionsDump.txt" "$tmp/$files/Definitions.txt" "$tmp/$files/skyrimPlatform.ts"

exit "$fail"
