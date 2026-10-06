#!/usr/bin/env bash
# client-dist.sh <vmid>: put the current client dist (skymp/build/dist-client, from
# `just build-client`) and the lab files onto a clone and lay them into the game
# (install-lab.ps1), then check the Skyrim Platform DLL in the game matches.
set -euo pipefail
vmid=${1:?vmid}
jump=${JUMP_HOST:-root@core.gaussing.tv}
here=$(cd "$(dirname "$0")/../.." && pwd)
dll="$here/skymp/build/dist-client/client/Data/Platform/Distribution/RuntimeDependencies/SkyrimPlatformImpl.dll"
test -f "$dll" || { echo "no client dist: just build-client" >&2; exit 2; }
enc() { printf '%s' "$1" | iconv -f UTF-8 -t UTF-16LE | base64 | tr -d '\n'; }
run() { ssh -o BatchMode=yes "$jump" "qm guest exec $vmid --timeout 300 -- powershell -NoProfile -NonInteractive -EncodedCommand $(enc "$1")" | python3 -c 'import sys,json; d=json.load(sys.stdin); print((d.get("out-data") or "").strip()); sys.exit(0 if d.get("exitcode")==0 else 1)'; }
run "Get-Process SkyrimSE, skse64_loader -ErrorAction SilentlyContinue | Stop-Process -Force; 'game stopped'"
"$here/lab/tools/stage-client.sh" "$vmid" | tail -3
# install-lab.ps1 lays a fresh dist into every game folder, longer than the
# guest agent's exec lives (the first client-dist of a new dist failed here
# on both clones, 2026-10-06): a one-shot SYSTEM task instead
"$here/lab/tools/guest-task.sh" "$vmid" install-lab "& 'C:\\sky-lab\\install-lab.ps1'" 20 | cut -c1-120
want=$(shasum -a 256 "$dll" | cut -c1-16)
# every game folder the clone keeps (C:\sky-lab\games\<version>.txt, ADR-022) must carry this dist
got=$(run "Get-ChildItem 'C:\\sky-lab\\games' -Filter '*.txt' | ForEach-Object { \$g = (Get-Content \$_.FullName -Raw).Trim(); \$_.BaseName + '=' + (Get-FileHash -Algorithm SHA256 (Join-Path \$g 'Data\\Platform\\Distribution\\RuntimeDependencies\\SkyrimPlatformImpl.dll')).Hash.ToLower().Substring(0,16) }" | tr -d '\r')
echo "$got" | grep -q . || { echo "no game folder recorded on VM $vmid" >&2; exit 3; }
bad=$(echo "$got" | grep -v "=$want\$" || true)
[ -z "$bad" ] || { echo "SkyrimPlatformImpl.dll is not the dist's ($want) in: $bad" >&2; exit 3; }
echo "dist laid into every game folder on VM $vmid: $(echo $got | tr '\n' ' ')(SkyrimPlatformImpl.dll $want)"
