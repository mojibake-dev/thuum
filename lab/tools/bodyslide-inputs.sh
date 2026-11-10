#!/usr/bin/env bash
# bodyslide-inputs.sh: place the SFW BodySlide build's two input archives (lab/bodyslide/inputs.tsv) on sky-build (VM 720) in
# D:\thuum-inputs, where the CI job cbbe-sfw-bodyslide-build reads them. They are licensed mod files from the Mac's
# lab/.cache/mods: sky-srv serves them inside VLAN 70 for the copy (a throwaway HTTP server, as client-mods.sh serves persist's
# mods/), sky-build fetches them as a one-shot SYSTEM task (guest-task.sh) and checks each md5. Nothing leaves the lab.
set -euo pipefail
here=$(cd "$(dirname "$0")/../.." && pwd)
jump=${JUMP_HOST:-root@core.gaussing.tv}; srv=${SRV_HOST:-eli@10.10.70.10}; srv_ip=${SRV_IP:-10.10.70.10}; port=${BODYSLIDE_HTTP_PORT:-8769}
cache="$here/lab/.cache/mods"; stage=/srv/lab/handover/bodyslide-inputs
files=(); md5s=()
while IFS=$'\t' read -r name nexus file md5; do
  [ -n "$name" ] && [ "$name" != name ] || continue
  [ "$(md5 -q "$cache/$file")" = "$md5" ] || { echo "$cache/$file md5 is not $md5" >&2; exit 2; }
  files+=("$file"); md5s+=("$md5")
done < <(grep -v '^#' "$here/lab/bodyslide/inputs.tsv")
ssh -o BatchMode=yes -J "$jump" "$srv" "mkdir -p '$stage'"
for f in "${files[@]}"; do scp -q -o BatchMode=yes -J "$jump" "$cache/$f" "$srv:$stage/"; done
ssh -o BatchMode=yes -J "$jump" "$srv" "cd '$stage' && (nohup python3 -m http.server $port --bind $srv_ip >/dev/null 2>&1 & echo \$! > .http.pid)"
trap 'ssh -o BatchMode=yes -J "$jump" "$srv" "kill \$(cat $stage/.http.pid) 2>/dev/null; rm -rf $stage"' EXIT
sleep 1
ps='$ErrorActionPreference = "Stop"; New-Item -ItemType Directory -Force "D:\thuum-inputs" | Out-Null'
for i in "${!files[@]}"; do
  f=${files[$i]}; m=${md5s[$i]}; url="http://$srv_ip:$port/$(python3 -c 'import sys,urllib.parse; print(urllib.parse.quote(sys.argv[1]))' "$f")"
  ps+="
\$d = Join-Path 'D:\thuum-inputs' '$f'
if (-not (Test-Path -LiteralPath \$d) -or (Get-FileHash -Algorithm MD5 -LiteralPath \$d).Hash.ToLower() -ne '$m') { & curl.exe -sS -f -o \$d '$url'; if (\$LASTEXITCODE) { throw 'fetch $f' } }
if ((Get-FileHash -Algorithm MD5 -LiteralPath \$d).Hash.ToLower() -ne '$m') { throw 'md5 $f' }
'placed $f'"
done
"$here/lab/tools/guest-task.sh" 720 bodyslide-inputs "$ps" 30
