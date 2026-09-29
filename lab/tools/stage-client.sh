#!/usr/bin/env bash
# Stage lab/deploy/sky-client plus the built lab-driver bundle into C:\sky-lab on
# a Windows lab VM through the QEMU guest agent (root@core: qm guest exec with
# stdin forwarding), then verify every file's SHA256 inside the guest.
set -euo pipefail
vmid=${1:?usage: stage-client.sh <vmid>}
jump=${JUMP_HOST:-root@core.gaussing.tv}
here=$(cd "$(dirname "$0")/../.." && pwd)
test -f "$here/lab/driver/build/lab-driver.js" || { echo "build the driver first: just build-driver" >&2; exit 2; }
enc() { printf '%s' "$1" | iconv -f UTF-8 -t UTF-16LE | base64 | tr -d '\n'; }
run() { ssh -o BatchMode=yes "$jump" "qm guest exec $vmid --timeout 120 -- powershell -NoProfile -NonInteractive -EncodedCommand $(enc "$1")" | python3 -c 'import sys,json; d=json.load(sys.stdin); print((d.get("out-data") or "").strip()); sys.exit(0 if d.get("exitcode")==0 else 1)'; }
put() {  # put <local file> <name in C:\sky-lab>
  local script="New-Item -ItemType Directory -Force -Path 'C:\\sky-lab' | Out-Null
\$in=[Console]::OpenStandardInput(); \$f=[IO.File]::Create('C:\\sky-lab\\$2'); \$in.CopyTo(\$f); \$f.Close()"
  ssh -o BatchMode=yes "$jump" "qm guest exec $vmid --pass-stdin 1 --timeout 120 -- powershell -NoProfile -NonInteractive -EncodedCommand $(enc "$script")" < "$1" \
    | python3 -c 'import sys,json; d=json.load(sys.stdin); sys.exit(0 if d.get("exitcode")==0 else 1)' || { echo "failed: $2" >&2; exit 1; }
}
files=("$here/lab/driver/build/lab-driver.js")
for f in "$here"/lab/deploy/sky-client/*; do case "$f" in *.md) ;; *) files+=("$f");; esac; done
for f in "${files[@]}"; do
  name=$(basename "$f")
  put "$f" "$name"
  want=$(shasum -a 256 "$f" | awk '{print $1}')
  got=$(run "(Get-FileHash -Algorithm SHA256 'C:\\sky-lab\\$name').Hash.ToLower()")
  [ "$want" = "$got" ] || { echo "hash mismatch for $name: $want vs $got" >&2; exit 3; }
  printf '  %-28s %s\n' "$name" "$got"
done
# The client dist from the mirror's Windows workflow (`just build-client`), when
# present: one zip in, expanded to C:\sky-lab\dist inside the guest. It carries
# Skyrim Platform and skymp5-client; laying it into the game stays Eli's step.
dist="$here/skymp/build/dist-client"
if [ -d "$dist" ] && [ -n "$(ls -A "$dist")" ]; then
  zip=$(mktemp -t client-dist).zip
  (cd "$dist" && zip -qr "$zip" .)
  put "$zip" "client-dist.zip"
  want=$(shasum -a 256 "$zip" | awk '{print $1}')
  got=$(run "(Get-FileHash -Algorithm SHA256 'C:\\sky-lab\\client-dist.zip').Hash.ToLower()")
  [ "$want" = "$got" ] || { echo "hash mismatch for client-dist.zip" >&2; exit 3; }
  run "Expand-Archive -Force -Path 'C:\\sky-lab\\client-dist.zip' -DestinationPath 'C:\\sky-lab\\dist'; (Get-ChildItem -Recurse -File 'C:\\sky-lab\\dist' | Measure-Object).Count"
  printf '  %-28s %s (expanded to dist\\)\n' "client-dist.zip" "$got"
  rm -f "$zip"
fi
run "Get-ChildItem 'C:\\sky-lab' | ForEach-Object { '{0,10} {1}' -f \$_.Length, \$_.Name }"
echo "staged into VM $vmid under C:\\sky-lab; apply with install-lab.ps1 once SKSE and SP exist"
