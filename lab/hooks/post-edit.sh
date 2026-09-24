#!/usr/bin/env bash
# PostToolUse hook for Edit|Write. Reads the tool payload on stdin, checks the
# edited file for two things the rules forbid, and formats it if a formatter
# is available. Exit 0 always; the point is the warning in the transcript.

set -u
payload="$(cat)"
file="$(printf '%s' "$payload" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("tool_input",{}).get("file_path",""))' 2>/dev/null)"
[ -n "$file" ] || exit 0
[ -f "$file" ] || exit 0

case "$file" in
  *.cpp|*.h|*.hpp)
    # Hex literals of six or more digits without a REL::ID / addrlib marker on
    # the same line are almost always an offset typed from memory (rule 1).
    if grep -nE '0x[0-9A-Fa-f]{6,}' "$file" | grep -vE 'REL::ID|REL::Offset|addrlib:' >/dev/null; then
      echo "WARN [rule 1] $file: hex literal without REL::ID / addrlib: marker"
      grep -nE '0x[0-9A-Fa-f]{6,}' "$file" | grep -vE 'REL::ID|REL::Offset|addrlib:' | head -5
    fi
    command -v clang-format >/dev/null && clang-format -i "$file"
    ;;
  *.ts|*.tsx|*.js|*.json)
    command -v npx >/dev/null && npx --no-install prettier --write "$file" >/dev/null 2>&1
    ;;
esac

case "$file" in
  *.md|*.yaml|*.yml)
    if grep -n $'\xe2\x80\x94' "$file" >/dev/null; then
      echo "WARN [rule 11] $file: em dash found"
      grep -n $'\xe2\x80\x94' "$file" | head -3
    fi
    ;;
esac
exit 0
