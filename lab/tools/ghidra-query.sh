#!/usr/bin/env bash
# ghidra-query.sh <program> <command> <args...>: run lab/tools/GhidraQuery.java
# headless on sky-re (LXC 701) against one program of the skyrim project, with
# pyghidra-mcp stopped for the duration (it holds the project lock) and
# restarted after. e.g. ghidra-query.sh SkyrimSE-1.7.104.0.exe decompile +0x9e3580
set -euo pipefail
prog=${1:?program name in the skyrim project}; shift
host=${JUMP_HOST:-root@core.gaussing.tv}
here=$(cd "$(dirname "$0")/../.." && pwd)
scp -q -o BatchMode=yes "$here/lab/tools/GhidraQuery.java" "$host:/tmp/GhidraQuery.java"
ssh -o BatchMode=yes "$host" 'pct push 701 /tmp/GhidraQuery.java /srv/persist/ghidra/GhidraQuery.java --perms 0644 && rm -f /tmp/GhidraQuery.java'
quoted=$(printf '%q ' "$@")
ssh -o BatchMode=yes "$host" "pct exec 701 -- bash -c 'set -e; systemctl stop pyghidra-mcp; trap \"systemctl start pyghidra-mcp\" EXIT; export GHIDRA_INSTALL_DIR=/opt/ghidra JAVA_HOME=/usr/lib/jvm/temurin-21-jdk-amd64 MAXMEM=4G; /opt/ghidra/support/analyzeHeadless /srv/persist/ghidra skyrim -process \"$prog\" -noanalysis -readOnly -scriptPath /srv/persist/ghidra -postScript GhidraQuery.java $quoted 2>&1 | sed -n \"s/^INFO  GhidraQuery.java> //p\" | sed -e \"s/ (GhidraScript) *$//\" | sed -n \"/^BEGIN/,/^END/p\"'"
