#!/usr/bin/env bash
# pull-layer.sh: copy the script-extender layer from a Windows Skyrim install
# (fenestrate by default) to this machine: every Data\SKSE\Plugins\versionlib-*.bin
# into addrlib/ (gitignored) and the SKSE loader, its runtime DLLs and Data\Scripts
# into lab/.cache/skse/ (gitignored), so `just stage-client` can ship the very
# same files to the lab clients. Same transport as persist-game.sh: PowerShell
# streams each file to its raw stdout, hashes checked here.
set -euo pipefail
src=${SRC_HOST:-fenestrate}
here=$(cd "$(dirname "$0")/../.." && pwd)
enc() { printf '%s' "$1" | iconv -f UTF-8 -t UTF-16LE | base64 | tr -d '\n'; }
ps() { ssh -n -o BatchMode=yes "$src" "powershell -NoProfile -NonInteractive -EncodedCommand $(enc "$1")"; }

probe='$ErrorActionPreference="Stop"; $ProgressPreference="SilentlyContinue"
$steam=(Get-ItemProperty "HKLM:\SOFTWARE\WOW6432Node\Valve\Steam" -ErrorAction SilentlyContinue).InstallPath
$libs=@($steam); $vdf=Join-Path $steam "steamapps\libraryfolders.vdf"
if (Test-Path $vdf) { $libs += (Select-String -Path $vdf -Pattern "`"path`"\s+`"([^`"]+)`"" -AllMatches).Matches | ForEach-Object { $_.Groups[1].Value -replace "\\\\","\" } }
$game=$libs | Select-Object -Unique | ForEach-Object { Join-Path $_ "steamapps\common\Skyrim Special Edition" } | Where-Object { Test-Path (Join-Path $_ "SkyrimSE.exe") } | Select-Object -First 1
$files=@()
foreach ($p in (Get-ChildItem (Join-Path $game "Data\SKSE\Plugins") -Filter "versionlib-*.bin" -ErrorAction SilentlyContinue)) { $files += [ordered]@{ kind="addrlib"; name=$p.Name; path=$p.FullName; size=$p.Length; sha256=(Get-FileHash -Algorithm SHA256 $p.FullName).Hash.ToLower() } }
foreach ($n in "skse64_loader.exe","skse64_steam_loader.dll") { $p=Join-Path $game $n; if (Test-Path $p) { $files += [ordered]@{ kind="skse"; name=$n; path=$p; size=(Get-Item $p).Length; sha256=(Get-FileHash -Algorithm SHA256 $p).Hash.ToLower() } } }
foreach ($p in (Get-ChildItem $game -Filter "skse64_1_*.dll")) { $files += [ordered]@{ kind="skse"; name=$p.Name; path=$p.FullName; size=$p.Length; sha256=(Get-FileHash -Algorithm SHA256 $p.FullName).Hash.ToLower() } }
[ordered]@{ game=$game; version=(Get-Item (Join-Path $game "SkyrimSE.exe")).VersionInfo.FileVersion; files=$files } | ConvertTo-Json -Compress -Depth 5'
echo "probing $src"
manifest=$(ps "$probe")
printf '%s' "$manifest" | python3 -c 'import sys,json; d=json.load(sys.stdin); print("  game", d["game"], "exe", d["version"]); [print("  ", f["kind"], f["name"], f["size"]) for f in d["files"]]'
mkdir -p "$here/addrlib" "$here/lab/.cache/skse"
printf '%s' "$manifest" | python3 -c 'import sys,json
for f in json.load(sys.stdin)["files"]: print("\t".join([f["kind"], f["name"], f["sha256"], f["path"]]))' | while IFS=$'\t' read -r kind name sha path; do
  case "$kind" in addrlib) dest="$here/addrlib/$name";; *) dest="$here/lab/.cache/skse/$name";; esac
  stream="\$ErrorActionPreference='Stop'; \$in=[IO.File]::OpenRead('$path'); \$out=[Console]::OpenStandardOutput(); \$in.CopyTo(\$out); \$out.Flush(); \$in.Close()"
  ps "$stream" > "$dest"
  got=$(shasum -a 256 "$dest" | awk '{print $1}')
  [ "$got" = "$sha" ] || { echo "hash mismatch for $name" >&2; exit 3; }
  printf '  pulled %-32s -> %s\n' "$name" "${dest#$here/}"
done
echo "done: addrlib/ and lab/.cache/skse/ hold the layer from $src"
