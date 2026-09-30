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
# Too big for the agent's stdin, so it travels inside VLAN 70: the zip goes to
# sky-srv over the jump, a throwaway python http.server on sky-srv serves it,
# the guest fetches it with Invoke-WebRequest, and the server is stopped again.
dist="$here/skymp/build/dist-client"
srv=${SRV_HOST:-eli@10.10.70.10}; srv_ip=${SRV_IP:-10.10.70.10}; port=${DIST_PORT:-8765}
if [ -d "$dist" ] && [ -n "$(ls -A "$dist")" ]; then
  zip=$(mktemp -t client-dist).zip
  # the artifact also carries server/ and papyrus-vm/; a client needs client/ (Data\...)
  [ -d "$dist/client" ] && root="$dist/client" || root="$dist"
  (cd "$root" && zip -qr "$zip" .)
  want=$(shasum -a 256 "$zip" | awk '{print $1}')
  ssh -o BatchMode=yes -J "$jump" "$srv" 'mkdir -p /srv/lab/handover'
  scp -q -o BatchMode=yes -J "$jump" "$zip" "$srv:/srv/lab/handover/client-dist.zip"
  ssh -o BatchMode=yes -J "$jump" "$srv" "cd /srv/lab/handover && (nohup python3 -m http.server $port --bind $srv_ip >/dev/null 2>&1 & echo \$! > .http.pid)"
  run "New-Item -ItemType Directory -Force -Path 'C:\\sky-lab' | Out-Null; \$ProgressPreference='SilentlyContinue'; Invoke-WebRequest -UseBasicParsing -Uri 'http://$srv_ip:$port/client-dist.zip' -OutFile 'C:\\sky-lab\\client-dist.zip'; (Get-FileHash -Algorithm SHA256 'C:\\sky-lab\\client-dist.zip').Hash.ToLower()" > /tmp/claude-501/dist-hash.txt || { ssh -o BatchMode=yes -J "$jump" "$srv" 'kill $(cat /srv/lab/handover/.http.pid) 2>/dev/null; rm -f /srv/lab/handover/client-dist.zip'; echo "guest download failed" >&2; exit 4; }
  got=$(tail -1 /tmp/claude-501/dist-hash.txt | tr -d '\r')
  ssh -o BatchMode=yes -J "$jump" "$srv" 'kill $(cat /srv/lab/handover/.http.pid) 2>/dev/null; rm -f /srv/lab/handover/client-dist.zip /srv/lab/handover/.http.pid'
  [ "$want" = "$got" ] || { echo "hash mismatch for client-dist.zip: $want vs $got" >&2; exit 3; }
  run "Expand-Archive -Force -Path 'C:\\sky-lab\\client-dist.zip' -DestinationPath 'C:\\sky-lab\\dist'; (Get-ChildItem -Recurse -File 'C:\\sky-lab\\dist' | Measure-Object).Count"
  printf '  %-28s %s (expanded to dist\\)\n' "client-dist.zip" "$got"
  rm -f "$zip"
fi
# The script-extender layer, when present on the Mac: versionlib-*.bin from
# addrlib/ (Eli's Address Library download) and an unpacked SKSE archive under
# lab/.cache/skse/, both small, through the agent's stdin as zips.
layer_zip() {  # layer_zip <local dir> <name>: zip a directory and expand it to C:\sky-lab\<name>
  local z; z=$(mktemp -t "$2").zip
  (cd "$1" && zip -qr "$z" .)
  put "$z" "$2.zip"
  run "Expand-Archive -Force -Path 'C:\\sky-lab\\$2.zip' -DestinationPath 'C:\\sky-lab\\$2'; Remove-Item 'C:\\sky-lab\\$2.zip'; (Get-ChildItem -Recurse -File 'C:\\sky-lab\\$2' | Measure-Object).Count" | tail -1 | xargs printf '  %-28s %s files\n' "$2\\"
  rm -f "$z"
}
if ls "$here"/addrlib/versionlib-*.bin >/dev/null 2>&1; then
  tmpd=$(mktemp -d); cp "$here"/addrlib/versionlib-*.bin "$tmpd/"; layer_zip "$tmpd" addrlib; rm -rf "$tmpd"
fi
[ -d "$here/lab/.cache/skse" ] && layer_zip "$here/lab/.cache/skse" skse
run "Get-ChildItem 'C:\\sky-lab' | ForEach-Object { '{0,10} {1}' -f \$_.Length, \$_.Name }"
echo "staged into VM $vmid under C:\\sky-lab; apply with install-layer.ps1 (SKSE, Address Library) then install-lab.ps1 (plugins, tasks)"
