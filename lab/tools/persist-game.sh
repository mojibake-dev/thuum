#!/usr/bin/env bash
# Copy Skyrim SE's five master files and the pinned SkyrimSE.exe from a Windows Steam
# client (fenestrate, Eli's desktop) into rpool/sky/persist on the hypervisor, streamed
# through this machine as a byte stream: nothing licensed is staged on local disk or
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
# The master files are whatever the client runs and always copy. The exe is the
# lab's pinned runtime only when its version matches; any other version is kept
# beside it under its own name (a drift record, and the binary the client really
# runs), never as SkyrimSE.exe.
exe_name=SkyrimSE.exe
case "$version" in
  "$want"*) echo "SkyrimSE.exe FileVersion $version (pinned: $want)";;
  *) exe_name="SkyrimSE-$version.exe"
     echo "WARNING: SkyrimSE.exe on $src is $version, the lab pins $want: storing it as game/$exe_name, not as the pinned exe" >&2;;
esac

# Windows OpenSSH on the client ships neither an sftp subsystem nor scp.exe on the
# session PATH, so the bytes leave through PowerShell writing the file to the raw
# console stdout stream, which Win32-OpenSSH passes through unchanged.
stream_file() {
  local script
  script="\$ErrorActionPreference='Stop'; \$ProgressPreference='SilentlyContinue'
\$in=[IO.File]::OpenRead('$1'); \$out=[Console]::OpenStandardOutput()
\$buf=New-Object byte[] 1048576
while((\$n=\$in.Read(\$buf,0,\$buf.Length)) -gt 0){ \$out.Write(\$buf,0,\$n) }
\$out.Flush(); \$in.Close()"
  local enc
  enc=$(printf '%s' "$script" | iconv -f UTF-8 -t UTF-16LE | base64 | tr -d '\n')
  ssh -n -o BatchMode=yes "$src" "powershell -NoProfile -NonInteractive -EncodedCommand $enc"
}

# name<TAB>subdir<TAB>sha256<TAB>size<TAB>source path
rows=$(printf '%s' "$probe" | python3 -c '
import json, sys
for f in json.load(sys.stdin)["files"]:
    sub = "game" if f["name"].lower().endswith(".exe") else "esm"
    name = sys.argv[1] if sub == "game" else f["name"]
    print("\t".join([name, sub, f["sha256"], str(f["size"]), f["path"]]))' "$exe_name")

# ssh -n inside the loop: without it the first ssh drains the rows from stdin.
while IFS=$'\t' read -r name sub sha size path; do
  printf '%-16s %10s bytes -> %s/%s/\n' "$name" "$size" "$persist" "$sub"
  stream_file "$path" | ssh -o BatchMode=yes "$dst" "cat > '$persist/$sub/$name'"
  got=$(ssh -n -o BatchMode=yes "$dst" "sha256sum '$persist/$sub/$name'" | awk '{print $1}')
  printf '   ok %s\n' "$got"
  if [ "$got" != "$sha" ]; then
    echo "hash mismatch for $name: source $sha, host $got" >&2; exit 3
  fi
done <<< "$rows"

# Readable to the sky group, ownership left to the setgid directories; a SHA256SUMS per
# directory so `sha256sum -c SHA256SUMS` re-checks the dataset later, and the exe's
# version beside it for the Ghidra import to compare against.
ssh -n -o BatchMode=yes "$dst" "set -e; cd '$persist'
  chmod 0644 esm/*.esm game/*.exe
  (cd esm && sha256sum *.esm > SHA256SUMS) && (cd game && sha256sum *.exe > SHA256SUMS)
  printf '%s\n' '$version' > 'game/$exe_name.version'
  chmod 0644 esm/SHA256SUMS game/SHA256SUMS 'game/$exe_name.version'
  ls -la esm game"
echo "persisted: hashes match on both ends (exe stored as game/$exe_name)"
