#!/usr/bin/env bash
# client-dumps.sh <vmid>: list the dumps ProcDump wrote on a clone
# (C:\sky-lab\dumps, `just client-dump-arm`) and fetch each one under the
# guest agent's 16 MiB file-read cap into lab/results/dumps-<vmid>/. Read one
# with `uvx --from minidump minidump --exception --modules <file>`.
set -euo pipefail
vmid=${1:?vmid}
jump=${JUMP_HOST:-root@core.gaussing.tv}
here=$(cd "$(dirname "$0")/../.." && pwd)
enc() { printf '%s' "$1" | iconv -f UTF-8 -t UTF-16LE | base64 | tr -d '\n'; }
list="Get-ChildItem 'C:\\sky-lab\\dumps' -Filter *.dmp -ErrorAction SilentlyContinue | Sort-Object LastWriteTime | ForEach-Object { \$_.Name + '|' + \$_.Length }"
files=$(ssh -o BatchMode=yes "$jump" "qm guest exec $vmid --timeout 60 -- powershell -NoProfile -NonInteractive -EncodedCommand $(enc "$list")" \
  | python3 -c 'import sys,json; print((json.load(sys.stdin).get("out-data") or "").strip())' | tr -d '\r')
[ -n "$files" ] || { echo "no dumps on VM $vmid"; exit 0; }
out="$here/lab/results/dumps-$vmid"; mkdir -p "$out"
echo "$files" | while IFS='|' read -r name size; do
  if [ "$size" -gt 16777216 ]; then echo "  $name: $size bytes, over the 16 MiB file-read cap; left on the clone"; continue; fi
  ssh -o BatchMode=yes "$jump" "pvesh get /nodes/\$(hostname)/qemu/$vmid/agent/file-read --file 'C:\\\\sky-lab\\\\dumps\\\\$name' --output-format json" 2>/dev/null \
    | python3 -c "import sys,json; d=json.load(sys.stdin); open('$out/$name','wb').write(d['content'].encode('latin-1'))" \
    && echo "  $name: $size bytes -> ${out#$here/}/$name"
done
