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
#   (ROTFERN_DIR), the whole folder (plugin, meshes, textures, its RaceMenu
#   preset and config) without its backups. Personal use only (its README):
#   persist and the lab, never a repo.
# - RaceMenu 0.4.20.0, for 1.6.1170 only (ADR-025: its skee64.dll lists only
#   that runtime, docs/verbs/racemenu-sync.md): Nexus mod 19080 file 743640,
#   fetched the same way and checked against the SHA-256 Nexus's own
#   VirusTotal link names; its two plugins, its BSA and skee64.dll with its
#   ini, without the ModderResource header.
# - CBBE 2.0.3, for every player (Eli, 2026-10-07: body morphs are how armor
#   is fitted, and a look carries them): Nexus mod 198 file 489053, checked
#   against the md5 Nexus names for the file, laid out as its installer does
#   for the choices fenestrate had (apocrypha: "Vanilla Shape", "Vanilla
#   Outfits", "RaceMenu Morphs (BodyMorph)", "Morph Files (Outfits)"),
#   plus "Face Pack", its female face textures that match its body ones),
#   resolved from its FOMOD config each run. Its two plugins stay on the
#   clients: CBBE.esp is light, which the server cannot read yet
#   (docs/PLAN.md), and RaceMenuMorphsCBBE.esp (full, Skyrim.esm its only
#   master) only drives RaceMenu's sliders; it is the last full plugin, so
#   every earlier plugin keeps its index on both ends. Scoped to 1.6.1170
#   with RaceMenu, the players' version (ADR-025).
#
# A mod directory named <mod>@<version> installs only into that game
# version's folder on a clone (add-mods.ps1), and its plugins go only into
# that version's esm directory; a plugin the other version's folder lacks is
# skipped by that game, so plugins.txt lists every plugin once.
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
rm_7z="$cache/RaceMenu-AE-0.4.20.0.7z"
rm_sha=e0f5e923f1eaaefefcb0a98822df091c5b96b010d2df2b52dc377aae539097da
rm_api=https://api.nexusmods.com/v1/games/skyrimspecialedition/mods/19080/files/743640
# CBBE 2.0.3 (Eli, 2026-10-07: for every player), Nexus mod 198 file 489053,
# checked against the md5 Nexus gives for that file (md5_search, apocrypha)
cb_7z="$cache/CBBE-2.0.3.7z"
cb_md5=f6d438974d0cedbd0f174e79d7390ee9
cb_api=https://api.nexusmods.com/v1/games/skyrimspecialedition/mods/198/files/489053
# CBBE's installer choices, as fenestrate had them (apocrypha, 2026-10-07)
# plus the Face Pack: CBBE's required files bring its own female body and
# hand textures, which meet the vanilla female head textures at the neck
# (the seam on every adult female in the lab, Eli's playtest nine); the
# FOMOD defaults it on, fenestrate most likely had it (apocrypha)
cb_options="Vanilla Shape|Vanilla Outfits|RaceMenu Morphs (BodyMorph)|Morph Files (Outfits)|Face Pack"
# the load order after the masters and the Creation Club plugins: the server's
# loadOrder (server-settings.json for 1.6.1170, server-settings-1.7.104.json
# without RaceMenu's) lists the same plugins in the same order. CBBE's two
# come last and on the clients only: CBBE.esp is light (the server reads no
# light plugin yet, docs/PLAN.md) and RaceMenuMorphsCBBE.esp only drives
# RaceMenu's sliders, so the server's list stays the clients' first plugins.
plugins=(RaceCompatibility.esm rotfern.esp RaceMenu.esp RaceMenuPlugin.esp RaceMenuMorphsCBBE.esp CBBE.esp)

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
if [ ! -f "$rm_7z" ] || [ "$(shasum -a 256 "$rm_7z" | cut -c1-64)" != "$rm_sha" ]; then
  echo "fetching RaceMenu 0.4.20.0 from Nexus"
  url=$(security find-generic-password -s nexus-api-key -a nexus -w | sed 's/^/apikey: /' \
    | curl -fsS -m 30 -H @- "$rm_api/download_link.json" \
    | python3 -c 'import sys,json; print(json.load(sys.stdin)[0]["URI"])')
  curl -fsS -m 600 -o "$rm_7z.part" "${url// /%20}"
  mv "$rm_7z.part" "$rm_7z"
fi
[ "$(shasum -a 256 "$rm_7z" | cut -c1-64)" = "$rm_sha" ] || { echo "RaceMenu archive SHA-256 is not $rm_sha" >&2; exit 2; }
if [ ! -f "$cb_7z" ] || [ "$(md5 -q "$cb_7z")" != "$cb_md5" ]; then
  echo "fetching CBBE 2.0.3 from Nexus (475 MB)"
  # the file's name on the CDN has spaces and an apostrophe: the path is
  # quoted, its query and the percent escapes already in it kept
  url=$(security find-generic-password -s nexus-api-key -a nexus -w | sed 's/^/apikey: /' \
    | curl -fsS -m 30 -H @- "$cb_api/download_link.json" \
    | python3 -c 'import sys,json,urllib.parse; print(urllib.parse.quote(json.load(sys.stdin)[0]["URI"], safe=":/?&=%"))')
  curl -fsS -m 1800 -o "$cb_7z.part" "$url"
  mv "$cb_7z.part" "$cb_7z"
fi
[ "$(md5 -q "$cb_7z")" = "$cb_md5" ] || { echo "CBBE archive md5 is not $cb_md5" >&2; exit 2; }
command -v 7zz >/dev/null || { echo "7zz is needed to unpack RaceMenu and CBBE (brew install sevenzip)" >&2; exit 2; }
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
# The whole mod folder but its backups and README: the plugin, meshes,
# textures, its RaceMenu preset (SKSE\Plugins\CharGen\Presets\rotfern.jslot)
# and RaceMenu config (meshes\...\facegenmorphs\rotfern.esp, interface\
# translations, HeadpartWhitelist), apocrypha 2026-10-07
rsync -a --exclude backups/ --exclude README.md --exclude __folder_managed_by_vortex \
  "$rotfern/" "$stage/tree/rotfern/"
# Stopgap, lab only (2026-10-06): rotfern.esp's RACE still names RS Children's
# skeletons (ANAM, male and female: actors\character\ranaline\character
# assets\skeletonkids.nif, skeleton_female_kids.nif) and one tint texture
# (actors\character\ranaline\child\maleliner.dds), which the standalone fork
# no longer ships; its own copies are under actors\character\rotfern\. The
# game died in the race menu on rotfern with the paths unresolved (probe
# 20261006-052250: an access violation in SkyrimSE.exe 1.7.104 at RVA
# 0x96b1b7, a read at 0x8C through a null). The fork's own files go where the
# plugin looks until the plugin is repointed (Eli's mod: never edited here).
ranaline="$stage/tree/rotfern/meshes/actors/character/ranaline/character assets"
mkdir -p "$ranaline" "$stage/tree/rotfern/textures/actors/character/ranaline/child"
cp "$rotfern/meshes/actors/character/rotfern/skeletonkids.nif" "$rotfern/meshes/actors/character/rotfern/skeleton_female_kids.nif" "$ranaline/"
cp "$rotfern/textures/actors/character/rotfern/maleliner.dds" "$stage/tree/rotfern/textures/actors/character/ranaline/child/"
rmx="$stage/racemenu"; mkdir -p "$rmx"
7zz x -y -o"$rmx" "$rm_7z" >/dev/null
rm="$stage/tree/racemenu-0.4.20.0@1.6.1170"
mkdir -p "$rm/SKSE/Plugins"
cp "$rmx/RaceMenu.esp" "$rmx/RaceMenuPlugin.esp" "$rmx/RaceMenu.bsa" "$rm/"
cp "$rmx/SKSE/Plugins/skee64.dll" "$rmx/SKSE/Plugins/skee64.ini" "$rm/SKSE/Plugins/"
# CBBE as its installer lays it out for the choices above: the FOMOD's
# required files, the chosen options' folders and the conditional folders
# whose flags those choices set, in the installer's order (a later folder
# overwrites an earlier one, as a mod manager installs them). Only the
# folders the plan names leave the archive.
cbx="$stage/cbbe"; mkdir -p "$cbx/fomod" "$cbx/x"
7zz x -y -o"$cbx/fomod" "$cb_7z" "FOMod/ModuleConfig.xml" >/dev/null
python3 - "$cbx/fomod/FOMod/ModuleConfig.xml" "$cb_options" > "$cbx/plan.tsv" <<'EOF'
import sys, xml.etree.ElementTree as ET
root = ET.parse(sys.argv[1]).getroot()
chosen = set(sys.argv[2].split("|"))
plan, flags, seen = [], {}, set()
def take(files):
    if files is None:
        return
    for el in files:
        if el.tag != "folder":
            sys.exit("FOMOD %s entries are not handled: %r" % (el.tag, el.attrib))
        plan.append((int(el.get("priority", "0")), len(plan), el.get("source"), el.get("destination", "")))
take(root.find("requiredInstallFiles"))
for plugin in root.iter("plugin"):
    if plugin.get("name") not in chosen:
        continue
    seen.add(plugin.get("name"))
    take(plugin.find("files"))
    for flag in plugin.findall("conditionFlags/flag"):
        flags[flag.get("name")] = flag.text or ""
if chosen - seen:
    sys.exit("installer options not found: %s" % sorted(chosen - seen))
for pattern in root.findall("conditionalFileInstalls/patterns/pattern"):
    deps = pattern.find("dependencies")
    if deps is not None and deps.get("operator", "And") != "And":
        sys.exit("Or dependencies are not handled")
    if all(flags.get(d.get("flag")) == d.get("value") for d in pattern.findall("dependencies/flagDependency")):
        take(pattern.find("files"))
for _, _, src, dst in sorted(plan):
    print("%s\t%s" % (src, dst.strip("\\/")))
EOF
cb="$stage/tree/cbbe-2.0.3@1.6.1170"; mkdir -p "$cb"
while IFS=$'\t' read -r folder into; do
  7zz x -y -o"$cbx/x" "$cb_7z" -ir!"$folder/*" >/dev/null
  [ -d "$cbx/x/$folder" ] || continue # "== Installer ==" holds no files
  mkdir -p "$cb/$into"
  rsync -a "$cbx/x/$folder/" "$cb/$into/"
done < "$cbx/plan.tsv"
echo "CBBE: $(wc -l < "$cbx/plan.tsv" | tr -d ' ') installer folders, $(find "$cb" -type f | wc -l | tr -d ' ') files"
printf '%s\n' "${plugins[@]}" > "$stage/tree/plugins.txt"
(cd "$stage/tree" && find . -type f ! -name SHA256SUMS ! -name plugins.txt | sed 's|^\./||' | LC_ALL=C sort \
  | while IFS= read -r f; do shasum -a 256 "$f"; done > SHA256SUMS)
echo "mod layer: $(wc -l < "$stage/tree/SHA256SUMS" | tr -d ' ') files, $(du -sh "$stage/tree" | cut -f1)"

ssh -o BatchMode=yes "$dst" "install -d -m 2775 -g sky '$persist/mods'"
# -rlt, not -a: the host's own modes, and group sky from the setgid directory
# (the Mac's rsync is openrsync, without --chmod or --no-group)
rsync -rlt --delete "$stage/tree/" "$dst:$persist/mods/"
# Each game version's server loads the plugins from its own esm directory:
# every version takes the unscoped mods' plugins, 1.6.1170 also RaceMenu's
place() { # <esm dir> <mods-relative plugin paths...>
  local dir=$1; shift
  local names=() n
  for n in "$@"; do names+=("$(basename "$n")"); done
  local pattern; pattern=$(printf '%s|' "${names[@]}" | sed 's/|$//; s/\./\\./g')
  ssh -o BatchMode=yes "$dst" "set -e; cd '$persist/$dir'
    $(for n in "$@"; do printf "cp '%s/mods/%s' .; " "$persist" "$n"; done)
    grep -v -E '  ($pattern)\$' SHA256SUMS > SHA256SUMS.new || true
    sha256sum ${names[*]} >> SHA256SUMS.new
    mv SHA256SUMS.new SHA256SUMS
    sha256sum -c --quiet SHA256SUMS"
  echo "$dir: ${names[*]} in place, SHA256SUMS checked"
}
place esm racecompatibility-2.16/RaceCompatibility.esm rotfern/rotfern.esp
place esm/1.6.1170 racecompatibility-2.16/RaceCompatibility.esm rotfern/rotfern.esp \
  racemenu-0.4.20.0@1.6.1170/RaceMenu.esp racemenu-0.4.20.0@1.6.1170/RaceMenuPlugin.esp
ssh -o BatchMode=yes "$dst" "cd '$persist/mods' && sha256sum -c --quiet SHA256SUMS && echo 'mods: SHA256SUMS checked on the host'"
