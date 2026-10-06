#!/usr/bin/env bash
# persist-mods.sh: the lab's mod layer into rpool/sky/persist, the only way a
# third-party file reaches the lab (docs/MODS.md). Rebuilt from its sources each
# time, so persist holds exactly what this script says:
#
# - RaceCompatibility 2.16, rotfern's master: Nexus mod 2853 file 381971, the
#   All-In-One installer, fetched with the Keychain's Nexus key (service
#   nexus-api-key, account nexus; never printed) into lab/.cache/mods and
#   checked against apocrypha's md5 in docs/MODS.md. Laid out by the
#   installer's own manual path for a game without USSEP and without vampire
#   or werewolf overhauls: "20 Dawnguard" (the ESM, its scripts and strings),
#   "20 Dawnguard Script", "20 Dawnguard Werewolf Script". The USSEP override
#   ESP stays out.
# - rotfern, Eli's race: the standalone fork in ~/Code/mods/rotfern-skyrim
#   (ROTFERN_DIR), rotfern.esp with its meshes and textures, without its
#   backups. Personal use only (its README): persist and the lab, never a repo.
#
# On the host, under /rpool/sky/persist:
#   mods/<mod>/<path inside Data>   every file, as the game's Data folder takes it
#   mods/SHA256SUMS                 "<hash>  <mod>/<path>", what a clone fetches
#   mods/plugins.txt                the plugins to enable, in load order
#   esm/ and esm/1.6.1170/          the plugins again, where each game version's
#                                   server loads them (server-settings.json), with
#                                   their SHA256SUMS lines replaced
#
# A clone installs the layer with `just client-mods <vmid>`.
set -euo pipefail
here=$(cd "$(dirname "$0")" && pwd)
root=$(cd "$here/../.." && pwd)
dst=${DST_HOST:-root@core.gaussing.tv}
persist=${PERSIST:-/rpool/sky/persist}
rotfern=${ROTFERN_DIR:-$HOME/Code/mods/rotfern-skyrim}
cache="$root/lab/.cache/mods"
rc_zip="$cache/RaceCompatibility-AIO-2.16.zip"
rc_md5=9a8fc2437ac9339ab42647f096f61c95
rc_api=https://api.nexusmods.com/v1/games/skyrimspecialedition/mods/2853/files/381971
plugins=(RaceCompatibility.esm rotfern.esp)

mkdir -p "$cache"
if [ ! -f "$rc_zip" ] || [ "$(md5 -q "$rc_zip")" != "$rc_md5" ]; then
  echo "fetching RaceCompatibility 2.16 from Nexus"
  # the key reaches curl on stdin as a header, never on a command line
  url=$(security find-generic-password -s nexus-api-key -a nexus -w | sed 's/^/apikey: /' \
    | curl -fsS -m 30 -H @- "$rc_api/download_link.json" \
    | python3 -c 'import sys,json; print(json.load(sys.stdin)[0]["URI"])')
  curl -fsS -m 300 -o "$rc_zip.part" "${url// /%20}"
  mv "$rc_zip.part" "$rc_zip"
fi
[ "$(md5 -q "$rc_zip")" = "$rc_md5" ] || { echo "RaceCompatibility archive md5 is not $rc_md5" >&2; exit 2; }
[ -f "$rotfern/rotfern.esp" ] || { echo "no rotfern.esp in $rotfern" >&2; exit 2; }

stage=$(mktemp -d "${TMPDIR:-/tmp}/persist-mods.XXXXXX")
trap 'rm -rf "$stage"' EXIT
x="$stage/x"; mkdir -p "$x"
unzip -q "$rc_zip" "20 Dawnguard/*" "20 Dawnguard Script/*" "20 Dawnguard Werewolf Script/*" -d "$x"
rc="$stage/tree/racecompatibility-2.16"
mkdir -p "$rc/Scripts" "$rc/Strings"
cp "$x/20 Dawnguard/RaceCompatibility.esm" "$rc/"
cp "$x/20 Dawnguard/Scripts/"*.pex "$x/20 Dawnguard Script/Scripts/"*.pex "$x/20 Dawnguard Werewolf Script/Scripts/"*.pex "$rc/Scripts/"
cp "$x/20 Dawnguard/Strings/"* "$rc/Strings/"
rsync -a --exclude backups/ --exclude README.md --exclude __folder_managed_by_vortex \
  "$rotfern/rotfern.esp" "$rotfern/meshes" "$rotfern/textures" "$stage/tree/rotfern/"
printf '%s\n' "${plugins[@]}" > "$stage/tree/plugins.txt"
(cd "$stage/tree" && find . -type f ! -name SHA256SUMS ! -name plugins.txt | sed 's|^\./||' | LC_ALL=C sort \
  | while IFS= read -r f; do shasum -a 256 "$f"; done > SHA256SUMS)
echo "mod layer: $(wc -l < "$stage/tree/SHA256SUMS" | tr -d ' ') files, $(du -sh "$stage/tree" | cut -f1)"

ssh -o BatchMode=yes "$dst" "install -d -m 2775 -g sky '$persist/mods'"
# -rlt, not -a: the host's own modes, and group sky from the setgid directory
# (the Mac's rsync is openrsync, without --chmod or --no-group)
rsync -rlt --delete "$stage/tree/" "$dst:$persist/mods/"
# Each game version's server loads the plugins from its own esm directory
for dir in esm esm/1.6.1170; do
  ssh -o BatchMode=yes "$dst" "set -e; cd '$persist/$dir'
    cp '$persist/mods/racecompatibility-2.16/RaceCompatibility.esm' '$persist/mods/rotfern/rotfern.esp' .
    grep -v -E '  (RaceCompatibility\.esm|rotfern\.esp)\$' SHA256SUMS > SHA256SUMS.new || true
    sha256sum RaceCompatibility.esm rotfern.esp >> SHA256SUMS.new
    mv SHA256SUMS.new SHA256SUMS
    sha256sum -c --quiet SHA256SUMS"
  echo "$dir: plugins in place, SHA256SUMS checked"
done
ssh -o BatchMode=yes "$dst" "cd '$persist/mods' && sha256sum -c --quiet SHA256SUMS && echo 'mods: SHA256SUMS checked on the host'"
