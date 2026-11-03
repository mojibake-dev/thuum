#!/usr/bin/env bash
# ghidra-names.sh [--rehearse] <program> <seed file> <slot file>: write CommonLibSSE-NG's names into
# one program of the skyrim Ghidra project on sky-re (LXC 701) with lab/tools/GhidraNames.java: the
# seeds from lab/tools/rea-seeds.py and the primary-vtable slots from lab/tools/vtable-slots.py.
# The run is ghidra-query.sh's without -readOnly, so the names are saved. This file is also its
# remote half: shipped to /srv/persist/ghidra/names, it checks the free disk under /srv/persist/ghidra
# and tars skyrim.gpr and skyrim.rep to /srv/persist/ghidra/backup-<UTC stamp>.tar before any write,
# then stops pyghidra-mcp (it holds the project lock) the way that saves its renames, tars again if
# that save changed the project, runs analyzeHeadless, and starts pyghidra-mcp again from an EXIT
# trap, printing the downtime's UTC start and end. A failed run (a headless or script error, or no
# END line) is restored from the tar before the restart. --rehearse runs on a copy extracted from
# the tar to /srv/persist/ghidra/rehearsal-<stamp>/, pyghidra-mcp left up.
# e.g. ghidra-names.sh SkyrimSE-1.6.1170.0.exe.unpacked.exe lab/.cache/rea-seeds-1.6.1170.tsv lab/.cache/vtable-slots-1.6.1170.tsv
set -euo pipefail
dir=/srv/persist/ghidra
names=$dir/names

if [ "${1:-}" = "--in-sky-re" ]; then
  # The remote half, root inside sky-re. A dropped ssh must not cut a write short: HUP and PIPE are
  # ignored, the run's output goes to its log, and the restore check reads files, not the pipe.
  trap '' HUP PIPE
  rehearse=$2 prog=$3 seeds=$4 slots=$5
  export GHIDRA_INSTALL_DIR=/opt/ghidra JAVA_HOME=/usr/lib/jvm/temurin-21-jdk-amd64 MAXMEM=${MAXMEM:-4G}
  cd "$dir"
  used=$(du -skc skyrim.gpr skyrim.rep | awk 'END {print $1}')
  want=$(( used * (rehearse ? 3 : 2) ))  # the tar, the copy when rehearsing, the run's growth
  free=$(df -Pk "$dir" | awk 'NR == 2 {print $4}')
  echo "disk: $(( free / 1048576 )) GiB free under $dir, $(( want / 1048576 + 1 )) GiB wanted"
  if [ "$free" -le "$want" ]; then echo "E_DISK: not enough free space under $dir"; exit 1; fi
  stamp=$(date -u +%Y%m%dT%H%M%SZ)
  backup=$dir/backup-$stamp.tar log=$names/run-$stamp.log mark=$names/.mark-$stamp
  touch "$mark"
  tar -cf "$backup" skyrim.gpr skyrim.rep
  echo "backup: $backup ($(du -h "$backup" | cut -f1)); log: $log"
  run() {
    /opt/ghidra/support/analyzeHeadless "$1" skyrim -process "$prog" -noanalysis \
      -scriptPath "$dir" -postScript GhidraNames.java "$seeds" "$slots" > "$log" 2>&1
  }
  ok() { grep -q '^INFO  GhidraNames.java> END' "$log" && ! grep -q -E 'REPORT SCRIPT ERROR|Error trying to save' "$log"; }
  report() {
    sed -n 's/^INFO  GhidraNames.java> //p' "$log" | sed -e 's/ (GhidraScript) *$//' | sed -n '/^BEGIN/,/^END/p'
    grep -E 'REPORT' "$log" | grep -v 'GhidraNames.java>' | cut -c1-200 || true
  }
  if [ "$rehearse" = 1 ]; then
    copy=$dir/rehearsal-$stamp
    mkdir "$copy" && tar -xf "$backup" -C "$copy"
    status=0; run "$copy" || status=$?
    report
    if [ "$status" -ne 0 ] || ! ok; then echo "E_REHEARSAL: headless exit $status, see $log"; exit 1; fi
    echo "rehearsal ok on $copy; the live project and pyghidra-mcp were not touched"
    exit 0
  fi
  # pyghidra-mcp saves its open programs only on SIGINT (its handler raises KeyboardInterrupt and
  # close() saves); after a SIGTERM uvicorn re-raises the signal and the process dies unsaved, losing
  # any rename made through MCP since its last save. So SIGINT, wait for the exit, then stop the unit,
  # or Restart=on-failure (130 reads as a failure) would bring it back onto the project lock.
  down=$(date -u +%FT%TZ)
  trap 'systemctl start pyghidra-mcp; for _ in $(seq 120); do ss -ltn | grep -q ":8080 " && break; sleep 1; done; echo "pyghidra-mcp down from $down to $(date -u +%FT%TZ)"' EXIT
  systemctl kill --signal=SIGINT --kill-whom=main pyghidra-mcp
  for _ in $(seq 600); do [ "$(systemctl show -p MainPID --value pyghidra-mcp)" = 0 ] && break; sleep 1; done
  systemctl stop pyghidra-mcp
  echo "pyghidra-mcp stopped at $(date -u +%FT%TZ) (SIGINT at $down, its own save first)"
  if [ -n "$(find skyrim.gpr skyrim.rep -newer "$mark" -print -quit)" ]; then
    echo "the project changed while it was tarred; tarring it again with pyghidra-mcp stopped"
    tar -cf "$backup" skyrim.gpr skyrim.rep
  fi
  rm -f "$mark"
  status=0; run "$dir" || status=$?
  if [ "$status" -ne 0 ] || ! ok; then
    mv skyrim.rep "skyrim.rep.failed-$stamp" && mv skyrim.gpr "skyrim.gpr.failed-$stamp" && tar -xf "$backup"
    report
    echo "E_RUN: headless exit $status; the project is restored from $backup, the failed one kept as skyrim.rep.failed-$stamp"
    exit 1
  fi
  report
  exit 0
fi

rehearse=0
if [ "${1:-}" = "--rehearse" ]; then rehearse=1; shift; fi
prog=${1:?program name in the skyrim project}
seeds=${2:?seed file from lab/tools/rea-seeds.py}
slots=${3:?slot file from lab/tools/vtable-slots.py}
host=${JUMP_HOST:-root@core.gaussing.tv}
here=$(cd "$(dirname "$0")/../.." && pwd)
ship() {  # <local file> <path inside sky-re>
  local tmp="/tmp/ghidra-names-$$-$(basename "$1")"
  scp -q -o BatchMode=yes "$1" "$host:$tmp"
  ssh -o BatchMode=yes "$host" "pct push 701 '$tmp' '$2' --perms 0644 && rm -f '$tmp'"
}
ssh -o BatchMode=yes "$host" "pct exec 701 -- mkdir -p $names"
ship "$here/lab/tools/ghidra-names.sh" "$names/ghidra-names.sh"
ship "$here/lab/tools/GhidraNames.java" "$dir/GhidraNames.java"
ship "$seeds" "$names/$(basename "$seeds")"
ship "$slots" "$names/$(basename "$slots")"
quoted=$(printf '%q ' "$rehearse" "$prog" "$names/$(basename "$seeds")" "$names/$(basename "$slots")")
ssh -o BatchMode=yes "$host" "pct exec 701 -- bash $names/ghidra-names.sh --in-sky-re $quoted"
