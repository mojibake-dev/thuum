#!/usr/bin/env bash
# Import one SkyrimSE binary into the shared Ghidra project on sky-re and run the
# default auto-analysis (docs/LAB.md, Track R3). Runs INSIDE sky-re (LXC 701) as
# root; `just ghidra-import <exe>` ships it there through the host and starts it
# as a transient systemd unit. pyghidra-mcp holds the project lock, so the unit
# is stopped for the import and started again on any exit. The program is named
# after the file (SkyrimSE-<version>.exe), so several versions live side by side.
set -euo pipefail
exe=${1:?path of the exe under /srv/persist/game}
project_dir=/srv/persist/ghidra
project=skyrim
name=$(basename "$exe")
log="$project_dir/import-${name%.exe}.log"
export GHIDRA_INSTALL_DIR=/opt/ghidra
export JAVA_HOME=/usr/lib/jvm/temurin-21-jdk-amd64
export MAXMEM=${MAXMEM:-6G}
test -r "$exe"
systemctl stop pyghidra-mcp
trap 'systemctl start pyghidra-mcp' EXIT
echo "import of $name started $(date -Is), log $log"
/opt/ghidra/support/analyzeHeadless "$project_dir" "$project" \
  -import "$exe" -overwrite \
  -loader PeLoader -processor x86:LE:64:default \
  -analysisTimeoutPerFile 43200 -max-cpu "$(nproc)" \
  > "$log" 2>&1
echo "import of $name finished $(date -Is): $(grep -c -E 'ERROR|Exception' "$log" || true) error lines in the log"
