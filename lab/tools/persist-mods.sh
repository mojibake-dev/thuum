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
#   clients: no server state names their forms, and each is the last of its
#   kind, so every other plugin keeps its index on both ends. CBBE.esp is
#   light (the clones number it fourth among light plugins, x-light-probe
#   20261008-101512; the server reads light plugins since the light-plugins
#   verb) and RaceMenuMorphsCBBE.esp (full, Skyrim.esm its only master) only
#   drives RaceMenu's sliders. Scoped to 1.6.1170 with RaceMenu, the
#   players' version (ADR-025).
# - Lost Grimoire 1.6 (Eli, 2026-10-10: "i guess we're rolling in
#   lostgrimoire as well"), for its Teleportation (docs/MODS.md): Nexus mod
#   4455 file 746543, Fenestrate's version so Eli's own install matches the
#   server, checked against the md5 apocrypha read from Fenestrate's
#   archive; its plugin, its two BSAs and its _ANIO.ini (bound axe and
#   pickaxe props by keyword, a file for an SKSE plugin the layer does not
#   carry, so nothing reads it), in both game versions. LostGrimoire.esp is
#   full (masters Skyrim, Update, Dawnguard, HearthFires, Dragonborn) and the
#   server loads it, before CBBE's client-only pair.
# - Apocalypse - Magic of Skyrim 10.2.3, ADR-029's mod (Eli's stretch list,
#   docs/MODS.md; its first verb docs/verbs/ghostwalk.md): Nexus mod 1090
#   file 758998, the version apocrypha read, checked against its md5 in
#   docs/MODS.md; its plugin and its two BSAs (the archive holds nothing
#   else), in both game versions. The plugin is full (masters Skyrim, Update,
#   Dragonborn) and the server loads it after Lost Grimoire's, before CBBE's
#   client-only pair, so every plugin before it keeps its index.
# - Headshot Kills - CIF 1.2 and Core Impact Framework 2.0.7, the headshot
#   verb's mods (docs/verbs/headshot.md, step 0; Eli's stretch list): Nexus
#   148579 file 622326 and 146873 file 801478, each checked against its md5
#   in docs/MODS.md. CIF is an SKSE plugin (its DLL, its ini and its biped
#   mappings) that the clients alone load; CIF 2.0.7 reads Address Library
#   formats 1, 2 and 5, so both game versions take it. Headshot Kills is its
#   rule (a CIF json), its effect's script and "Headshot Kills.esp", which is
#   light by its header (TES4 flags 0x200; master Skyrim.esm), not by its
#   extension. The server loads it after Apocalypse's, and the clients
#   before CBBE.esp, so both number it the fourth light plugin (FE003) and
#   CBBE.esp stays the last of its kind on the clients.
# - AI Pathing Freeze Fix 1.1 (cashboxs; Eli, 2026-10-17), for the lab's load
#   freeze (docs/research/load-freeze.md): Nexus mod 190049 file 801783,
#   checked against the md5 Nexus's md5 search gives for that file (the
#   file's VirusTotal link names the same archive's SHA-256). An SKSE plugin
#   and nothing else: its DLL, the archive's only file, into SKSE\Plugins
#   for 1.6.1170 only (its file notes: not 1.7.99 or later; ADR-025). No
#   plugin file, so no load order and no esm directory; the clients alone
#   load it.
#
# - The essentials layer (Eli's ticked set, docs/MODS.md "The essentials
#   layer", docs/research/mod-layer-plan.md): every other mod comes from
#   lab/layer/essentials.tsv, one row per mod folder. A fenestrate row copies
#   the mod's Vortex staging folder, pulled read-only off Fenestrate's disk
#   into lab/.cache/mods/fenestrate (apocrypha, 2026-10-19: the files Eli's
#   game ran, FOMOD choices already made), and checks it against the tree
#   hash the row records; a nexus row fetches the archive the row names,
#   checks its md5, and lays out the installer folders the row lists. The
#   load order lives in lab/layer/load-order.tsv; lab/tools/layer-render.py
#   writes it into the plugins array below and both server-settings files
#   (lab/tests checks the three agree).
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
# Lost Grimoire 1.6, Nexus mod 4455 file 746543 (Fenestrate's; apocrypha's md5)
lg_zip="$cache/LostGrimoire-1.6.zip"
lg_md5=9ff6e8c0ba4be4689406305ac509ee89
lg_api=https://api.nexusmods.com/v1/games/skyrimspecialedition/mods/4455/files/746543
# Apocalypse 10.2.3, Nexus mod 1090 file 758998 (apocrypha's md5, docs/MODS.md)
ap_zip="$cache/Apocalypse-10.2.3.zip"
ap_md5=26fa3eb013175c09d12b5b52d5df09ac
ap_api=https://api.nexusmods.com/v1/games/skyrimspecialedition/mods/1090/files/758998
ap_esp="Apocalypse - Magic of Skyrim.esp"
# Headshot Kills - CIF 1.2, Nexus mod 148579 file 622326; Core Impact Framework
# 2.0.7, Nexus mod 146873 file 801478 (docs/MODS.md's md5s)
hk_7z="$cache/HeadshotKills-CIF-1.2.7z"
hk_md5=bd394ef49f6830d0d48e88c2cb0cb19c
hk_api=https://api.nexusmods.com/v1/games/skyrimspecialedition/mods/148579/files/622326
hk_esp="Headshot Kills.esp"
cif_zip="$cache/CIF-2.0.7.zip"
cif_md5=280692a00e60890fc8a16826cceb56f1
cif_api=https://api.nexusmods.com/v1/games/skyrimspecialedition/mods/146873/files/801478
# AI Pathing Freeze Fix 1.1, Nexus mod 190049 file 801783 (Nexus's md5_search, docs/MODS.md)
ff_zip="$cache/AIPathingFreezeFix-1.1.zip"
ff_md5=54804a9e4e9117450921ea78332dbc5c
ff_api=https://api.nexusmods.com/v1/games/skyrimspecialedition/mods/190049/files/801783
# the load order after the masters and the Creation Club plugins: the server's
# loadOrder (server-settings.json for 1.6.1170, server-settings-1.7.104.json
# without RaceMenu's) lists the same plugins in the same order. CBBE's two
# come last and on the clients only (above: each the last of its kind, no
# server state names their forms), so the server's list stays the clients'
# first plugins.
plugins=("unofficial skyrim special edition patch.esp" GeneralDisplays.esm ApachiiHair.esm "Conjuration Summoner Perk Applies to All Creatures.esl" RaceCompatibility.esm Cloaks.esp "Cloaks - Dawnguard.esp" "Cloaks - USSEP Patch.esp" 1nivWICCloaksNoGuards.esp 1nivWICCloaks_SMP_Patch.esp Cloaks_SMP_Patch.esp Thaumaturgy.esp MysticismMagic.esp ExtraDwemerHighFurniture.esp "Odin - Skyrim Magic Overhaul.esp" MoreCraftableEquipment.esp "Playable Headparts All Races.esp" DigitigradeKhajiit+ArgonianRaptor.esp SpellAbsorptionAndTwinSoulsFix_SE.esp SimplyBiggerTreesSE.esp LetMeDropIt.esp "Vanilla Civil War Dialogue Fix.esp" BlackBookNoQuest.esp ElderScrollNoQuest.esp _001_SelfFillingBookshelves.esp mihailcrowsandravens.esp rmp_telvannihearthfires.esp SummonsOfApocrypha.esp "EVE - House Telvanni Banners Restored.esp" TrueDirectionalMovement.esp Prometheus_BeastSkeletons.esp "Apocalypse - Magic of Skyrim.esp" mihailringneckedpheasant.esp IntuitiveDragonRideControl.esp "Better Stealth AI for Followers.esp" "Jewelry limiter.esp" "Vampiric Grip.esp" mihailatmoranremains.esp mihailmagicladder.esp LRD.esp StealthKillDetectionFix.esp Portal.esp "All Eyes for All Races.esp" SimpleFireWyrmFix.esp "Ring of Namira - Improved.esp" "Better Vampire Lord plus Serana Fix EN.esp" ChitinGoggles.esp "Dynamic Activation Key.esp" "Dwemer Goggles & Scouter.esp" RaceMenu.esp RaceMenuPlugin.esp DualCastingCostPowerTweak.esp ArchmageRobeLearn.esp LoweredFurHoods.esp "NARC SE for Vanilla.esp" "Next-Gen Decapitations.esp" "Cloaks&Capes.esp" NB-FurHoods.esp LostGrimoire.esp dremora_merchant_upgrade.esp "Headshot Kills.esp" "Silent Reanimated Corpses.esp" SunAffectsNPCVampires.esp SunAffectsNPCVampires-Hooded.esp "Survival Mode Vampire Patch.esp" "Supernatural Survival Tweaks - Cold Resist Werebeast and Vampire.esp" UndeadFX.esp SummonsReleveled.esp mihailhelhest.esp "Stab the heart.esp" VampireFeedingTweaks.esp MoreCraftableEquipment_BYOHLooms.esp MoreCraftableEquipment_CloaksandCapes.esp MoreCraftableEquipment_Fish.esp MoreCraftableEquipment_USSEP.esp VampireLordsCanActivate.esp LoweredHoods.esp LoweredHoods_MoreCraftableEquipment.esp vampireinverterdg.esp rotfern.esp SkyUI_SE.esp RLAiO.esp UnreadBooksGlow.esp NMNEB.esp MCMHelper.esp DisableSpellLight_Prebuilt.esp TrueHUD.esl MoreCraftableEquipment_AdvCyrus.esp LoweredHoods_CCNecromanticGrimoire.esp LoweredHoods_MoreCraftableEquipment_CCNecromanticGrimoire.esp "Necromantic Grimoire - Mysticism Rebalance.esp" RaceMenuMiscSlider.esp RaceMenuMorphsCBBE.esp CBBE.esp)

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
if [ ! -f "$lg_zip" ]; then
  echo "fetching Lost Grimoire 1.6 from Nexus"
  url=$(security find-generic-password -s nexus-api-key -a nexus -w | sed 's/^/apikey: /' \
    | curl -fsS -m 30 -H @- "$lg_api/download_link.json" \
    | python3 -c 'import sys,json; print(json.load(sys.stdin)[0]["URI"])')
  curl -fsS -m 900 -o "$lg_zip.part" "${url// /%20}"
  mv "$lg_zip.part" "$lg_zip"
fi
[ "$(md5 -q "$lg_zip")" = "$lg_md5" ] || { echo "Lost Grimoire archive md5 is not $lg_md5" >&2; exit 2; }
if [ ! -f "$ap_zip" ]; then
  echo "fetching Apocalypse 10.2.3 from Nexus"
  url=$(security find-generic-password -s nexus-api-key -a nexus -w | sed 's/^/apikey: /' \
    | curl -fsS -m 30 -H @- "$ap_api/download_link.json" \
    | python3 -c 'import sys,json; print(json.load(sys.stdin)[0]["URI"])')
  curl -fsS -m 900 -o "$ap_zip.part" "${url// /%20}"
  mv "$ap_zip.part" "$ap_zip"
fi
[ "$(md5 -q "$ap_zip")" = "$ap_md5" ] || { echo "Apocalypse archive md5 is not $ap_md5" >&2; exit 2; }
for pair in "$hk_7z|$hk_api|Headshot Kills - CIF 1.2" "$cif_zip|$cif_api|Core Impact Framework 2.0.7"; do
  IFS='|' read -r file api what <<< "$pair"
  if [ ! -f "$file" ]; then
    echo "fetching $what from Nexus"
    url=$(security find-generic-password -s nexus-api-key -a nexus -w | sed 's/^/apikey: /' \
      | curl -fsS -m 30 -H @- "$api/download_link.json" \
      | python3 -c 'import sys,json; print(json.load(sys.stdin)[0]["URI"])')
    curl -fsS -m 900 -o "$file.part" "${url// /%20}"
    mv "$file.part" "$file"
  fi
done
[ "$(md5 -q "$hk_7z")" = "$hk_md5" ] || { echo "Headshot Kills archive md5 is not $hk_md5" >&2; exit 2; }
[ "$(md5 -q "$cif_zip")" = "$cif_md5" ] || { echo "CIF archive md5 is not $cif_md5" >&2; exit 2; }
if [ ! -f "$ff_zip" ]; then
  echo "fetching AI Pathing Freeze Fix 1.1 from Nexus"
  url=$(security find-generic-password -s nexus-api-key -a nexus -w | sed 's/^/apikey: /' \
    | curl -fsS -m 30 -H @- "$ff_api/download_link.json" \
    | python3 -c 'import sys,json; print(json.load(sys.stdin)[0]["URI"])')
  curl -fsS -m 300 -o "$ff_zip.part" "${url// /%20}"
  mv "$ff_zip.part" "$ff_zip"
fi
[ "$(md5 -q "$ff_zip")" = "$ff_md5" ] || { echo "AI Pathing Freeze Fix archive md5 is not $ff_md5" >&2; exit 2; }
command -v 7zz >/dev/null || { echo "7zz is needed to unpack RaceMenu and CBBE (brew install sevenzip)" >&2; exit 2; }
command -v unar >/dev/null || { echo "unar is needed to unpack Cloaks of Skyrim's RAR, a method 7zz refuses (brew install unar)" >&2; exit 2; }
layer_tsv="$root/lab/layer/essentials.tsv"
order_tsv="$root/lab/layer/load-order.tsv"
fen_cache="$cache/fenestrate"
[ -f "$layer_tsv" ] && [ -f "$order_tsv" ] || { echo "no lab/layer/essentials.tsv or load-order.tsv" >&2; exit 2; }
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
lg="$stage/tree/lostgrimoire-1.6"; mkdir -p "$lg"
unzip -q "$lg_zip" "LostGrimoire.esp" "LostGrimoire.bsa" "LostGrimoire - Textures.bsa" "LostGrimoire_ANIO.ini" -d "$lg"
ap="$stage/tree/apocalypse-10.2.3"; mkdir -p "$ap"
unzip -q "$ap_zip" "$ap_esp" "Apocalypse - Magic of Skyrim.bsa" "Apocalypse - Magic of Skyrim - Textures.bsa" -d "$ap"
hk="$stage/tree/headshotkills-1.2"; mkdir -p "$hk"
7zz x -y -o"$hk" "$hk_7z" "$hk_esp" scripts/instantdeathmagiceffectscript.pex SKSE/CoreImpactFramework/headshot.json >/dev/null
# CIF's archive holds a Data/ folder: unpacked beside the tree, its contents laid in
cif="$stage/tree/cif-2.0.7"; mkdir -p "$stage/cif-x" "$cif"
unzip -q "$cif_zip" "Data/*" -d "$stage/cif-x"
rsync -a "$stage/cif-x/Data/" "$cif/"
# the fix's DLL in its archive's own Data layout, SKSE/Plugins, for the 1.6.1170 folder alone
ff="$stage/tree/aipathingfreezefix-1.1@1.6.1170"; mkdir -p "$ff"
unzip -q "$ff_zip" "SKSE/Plugins/TMS_AIPathingFreezeFix.dll" -d "$ff"
# --- the essentials layer: lab/layer/essentials.tsv, row by row ---------------
# Files a mod manager never puts under Data: a mod's top-level readmes,
# pictures and manager metadata (the staging folders carry them).
junk=(--exclude '__folder_managed_by_vortex' --exclude '/*.jpg' --exclude '/*.jpeg' --exclude '/*.png' --exclude '/*.docx'
      --exclude '/*.modgroups' --exclude '/*.txt' --exclude '/*.md' --exclude '/*.pdf' --exclude '/meta.ini')
tree_hash() { # <dir>: sha256 over the sorted "sha256  path" lines of its files, as the manifest's tree: value
  (cd "$1" && find . -type f | sed 's|^\./||' | LC_ALL=C sort | while IFS= read -r f; do shasum -a 256 "$f"; done | shasum -a 256 | cut -c1-64)
}
nexus_fetch() { # <archive path> <mod id/file id>
  local file=$1 api="https://api.nexusmods.com/v1/games/skyrimspecialedition/mods/${2%/*}/files/${2#*/}"
  echo "fetching $(basename "$file") from Nexus ($2)"
  local url
  url=$(security find-generic-password -s nexus-api-key -a nexus -w | sed 's/^/apikey: /' \
    | curl -fsS -m 30 -H @- "$api/download_link.json" \
    | python3 -c 'import sys,json,urllib.parse; print(urllib.parse.quote(json.load(sys.stdin)[0]["URI"], safe=":/?&=%"))')
  curl -fsS -m 1800 -o "$file.part" "$url"
  mv "$file.part" "$file"
}
n_fen=0; n_nx=0
# the rows as unit-separated fields: bash's read would collapse an empty tab-separated field
# (tab is IFS whitespace), shifting the columns after it
rows=$(python3 -c '
import csv, sys
for r in csv.reader((l for l in open(sys.argv[1]) if not l.startswith("#")), delimiter="\t"):
    if r and r[0] != "folder": print("\x1f".join(r))' "$layer_tsv")
while IFS=$'\x1f' read -r folder source ref check take exclude plugins_ note; do
  dest="$stage/tree/$folder"
  excl=("${junk[@]}")
  if [ -n "$exclude" ]; then IFS=';' read -ra more <<< "$exclude"; for e in "${more[@]}"; do excl+=(--exclude "$e"); done; fi
  case "$source" in
    out) echo "not placed: $folder ($note)";;
    fenestrate)
      src="$fen_cache/$ref"
      [ -d "$src" ] || { echo "no $src: the Fenestrate staging folders are not in lab/.cache/mods/fenestrate (docs/MODS.md, the essentials layer)" >&2; exit 2; }
      mkdir -p "$dest"
      rsync -a "${excl[@]}" "$src/" "$dest/"
      got=$(tree_hash "$dest")
      [ "tree:$got" = "$check" ] || { echo "$folder: tree hash $got is not ${check#tree:} (the staging copy differs from the one the manifest was built from)" >&2; exit 2; }
      n_fen=$((n_fen + 1));;
    nexus)
      ids=${ref%%|*}; archive="$cache/${ref#*|}"
      [ -f "$archive" ] || nexus_fetch "$archive" "$ids"
      [ "$(md5 -q "$archive")" = "${check#md5:}" ] || { echo "$(basename "$archive") md5 is not ${check#md5:}" >&2; exit 2; }
      xdir="$stage/x/$folder"; mkdir -p "$xdir" "$dest"
      case "$archive" in
        *.rar) unar -q -D -o "$xdir" "$archive";;
        *) 7zz x -y -o"$xdir" "$archive" >/dev/null;;
      esac
      IFS=';' read -ra takes <<< "$take"
      for t in "${takes[@]}"; do
        from=${t%%->*}; into=${t#*->}
        [ -d "$xdir/$from" ] || { echo "$folder: no folder '$from' in $(basename "$archive")" >&2; exit 2; }
        mkdir -p "$dest/$into"
        rsync -a "${excl[@]}" --exclude 'fomod/' --exclude 'FOMOD/' "$xdir/$from/" "$dest/$into/"
      done
      n_nx=$((n_nx + 1));;
    *) echo "$folder: unknown source '$source'" >&2; exit 2;;
  esac
  # every plugin the row names is in place
  if [ -n "$plugins_" ]; then IFS=';' read -ra ps <<< "$plugins_"; for pl in "${ps[@]}"; do [ -f "$dest/$pl" ] || { echo "$folder: plugin $pl not in its folder" >&2; exit 2; }; done; fi
done <<< "$rows"
echo "essentials layer: $n_fen mods from Fenestrate's staging, $n_nx from Nexus archives"
printf '%s\n' "${plugins[@]}" > "$stage/tree/plugins.txt"
(cd "$stage/tree" && find . -type f ! -name SHA256SUMS ! -name plugins.txt | sed 's|^\./||' | LC_ALL=C sort \
  | while IFS= read -r f; do shasum -a 256 "$f"; done > SHA256SUMS)
echo "mod layer: $(wc -l < "$stage/tree/SHA256SUMS" | tr -d ' ') files, $(du -sh "$stage/tree" | cut -f1)"
if [ -n "${PERSIST_LOCAL:-}" ]; then
  # the tree built and checked, nothing sent: for a branch's dry run (docs/MODS.md)
  trap - EXIT
  echo "PERSIST_LOCAL: tree kept at $stage/tree, host untouched"
  exit 0
fi

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
  local pattern; pattern=$(printf '%s\n' "${names[@]}" | sed 's/[][\.*^$+?(){}|\\]/\\&/g' | paste -sd '|' -)
  ssh -o BatchMode=yes "$dst" "set -e; cd '$persist/$dir'
    $(for n in "$@"; do printf "cp '%s/mods/%s' .; " "$persist" "$n"; done)
    grep -v -E '  ($pattern)\$' SHA256SUMS > SHA256SUMS.new || true
    sha256sum $(printf "'%s' " "${names[@]}") >> SHA256SUMS.new
    mv SHA256SUMS.new SHA256SUMS
    sha256sum -c --quiet SHA256SUMS"
  echo "$dir: ${names[*]} in place, SHA256SUMS checked"
}
# the served plugins, from lab/layer/load-order.tsv: every version's for esm/, those plus the 1.6.1170-only for esm/1.6.1170
served() { python3 -c '
import csv, sys
for r in csv.DictReader((l for l in open(sys.argv[1]) if not l.startswith("#")), delimiter="\t"):
    if r["server"] == "yes" and r["versions"] in ("all", sys.argv[2]): print(r["mod"] + "/" + r["plugin"])' "$order_tsv" "$1"; }
mapfile -t place_all < <(served 1.7.104)
mapfile -t place_1170 < <(served 1.6.1170)
place esm "${place_all[@]}"
place esm/1.6.1170 "${place_1170[@]}"
ssh -o BatchMode=yes "$dst" "cd '$persist/mods' && sha256sum -c --quiet SHA256SUMS && echo 'mods: SHA256SUMS checked on the host'"
