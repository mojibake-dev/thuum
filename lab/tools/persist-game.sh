#!/usr/bin/env bash
# Copy Skyrim SE's five master files and the pinned SkyrimSE.exe from a Windows Steam
# client (fenestrate, Eli's desktop) into rpool/sky/persist on the hypervisor, streamed
# through this machine with `scp -3`: nothing licensed is staged on local disk or
# enters the repo (docs/LAB.md: licensed files never leave rpool/sky). Hashes are
# taken on the source with Get-FileHash and checked on the host with sha256sum.
#
#   SRC_HOST   ssh alias of the Windows client        (default fenestrate)
#   DST_HOST   the hypervisor that owns the dataset   (default root@core.gaussing.tv)
#   PERSIST    dataset mountpoint on DST_HOST         (default /rpool/sky/persist)
#   SKYRIM_VERSION  required FileVersion prefix       (default 1.6.1170)
set -euo pipefail
here=$(cd "$(dirname "$0")" && pwd)
src=${SRC_HOST:-fenestrate}
dst=${DST_HOST:-root@core.gaussing.tv}
persist=${PERSIST:-/rpool/sky/persist}
want=${SKYRIM_VERSION:-1.6.1170}

# powershell -EncodedCommand takes the script as base64 of UTF-16LE; it works from
# cmd.exe or PowerShell as the login shell and needs no quoting across three shells.
encoded=$(iconv -f UTF-8 -t UTF-16LE "$here/fenestrate-skyrim.ps1" | base64 | tr -d '\n')
echo "probing $src for Skyrim Special Edition"
probe=$(ssh -o BatchMode=yes "$src" "powershell -NoProfile -NonInteractive -EncodedCommand $encoded")

version=$(printf '%s' "$probe" | python3 -c 'import sys,json; print(json.load(sys.stdin)["version"])')
case "$version" in
  "$want"*) echo "SkyrimSE.exe FileVersion $version (pinned: $want)";;
  *) echo "refusing: SkyrimSE.exe FileVersion is $version, the lab pins $want" >&2; exit 2;;
esac

# name<TAB>subdir<TAB>sha256<TAB>size<TAB>source path (forward slashes for sftp-server)
rows=$(printf '%s' "$probe" | python3 -c '
import json, sys
for f in json.load(sys.stdin)["files"]:
    sub = "game" if f["name"].lower().endswith(".exe") else "esm"
    print("\t".join([f["name"], sub, f["sha256"], str(f["size"]), f["path"].replace("\\", "/")]))')

while IFS=$'\t' read -r name sub sha size path; do
  printf '%-16s %10s bytes -> %s/%s/\n' "$name" "$size" "$persist" "$sub"
  scp -3 -q "$src:$path" "$dst:$persist/$sub/$name" \
    || scp -3 -q -O "$src:\"$path\"" "$dst:$persist/$sub/$name"   # legacy scp if sftp refuses the path
  got=$(ssh -o BatchMode=yes "$dst" "sha256sum '$persist/$sub/$name'" | awk '{print $1}')
  if [ "$got" != "$sha" ]; then
    echo "hash mismatch for $name: source $sha, host $got" >&2; exit 3
  fi
done <<< "$rows"

# Readable to the sky group, ownership left to the setgid directories; a SHA256SUMS per
# directory so `sha256sum -c SHA256SUMS` re-checks the dataset later, and the exe's
# version beside it for the Ghidra import to compare against.
ssh -o BatchMode=yes "$dst" "set -e; cd '$persist'
  chmod 0644 esm/*.esm game/SkyrimSE.exe
  (cd esm && sha256sum *.esm > SHA256SUMS) && (cd game && sha256sum SkyrimSE.exe > SHA256SUMS)
  printf '%s\n' '$version' > game/SkyrimSE.exe.version
  chmod 0644 esm/SHA256SUMS game/SHA256SUMS game/SkyrimSE.exe.version
  ls -la esm game"
echo "persisted: hashes match on both ends"
