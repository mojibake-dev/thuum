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
run "& powershell -NoProfile -ExecutionPolicy Bypass -File C:\\sky-lab\\install-lab.ps1" | tail -1 | cut -c1-120
want=$(shasum -a 256 "$dll" | cut -c1-16)
got=$(run "(Get-FileHash -Algorithm SHA256 'C:\\Program Files (x86)\\Steam\\steamapps\\common\\Skyrim Special Edition\\Data\\Platform\\Distribution\\RuntimeDependencies\\SkyrimPlatformImpl.dll').Hash.ToLower().Substring(0,16)" | tail -1)
[ "$want" = "$got" ] || { echo "SkyrimPlatformImpl.dll in the game ($got) is not the dist's ($want)" >&2; exit 3; }
echo "dist laid into the game on VM $vmid: SkyrimPlatformImpl.dll $got"
