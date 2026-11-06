# Eli's three appearance asks: hairs, faces, the CBBE sliders and the SFW edition (2026-11-06)

Relayed by numidium for after playtest 47 closes, to work through with Eli; nothing built. Eli's
words: hairs "not as replacers, but as additional hairs" ("that's DEFINITELY an apocrypha task");
"i hate how baby smooth the faces for female characters are, they dont look as normal to the game";
"the CBBE sliders dont work and i want to use the sfw version. the body sliders are essential for
rotfern (just short and non binary) to have a flat chest in armor/robes, but less essential for other
characters, just a nice to have. but that said, all that needs to be installed for those sliders, but i
want the least impactful version of that." Context: test 2's character is now Ariadne, a Khajiit
female (profile 2, race 0x13745), so faces and bodies cover her too.

Every fact below is read from files: the Nexus API (mods 74257, 6817, 2014 on 2026-11-06), the
CBBE 2.0.3 archive and the seats' install plan in lab/.cache/mods, Fenestrate's own Vortex
deployment record (chim/.scratch/fenestrate-20261018), RaceMenu 0.4.20's scripts and ini, ADR-044
and docs/verbs/racemenu-sync.md.

## 0. The link is not a hair mod

The link relayed for ask 1, nexusmods.com/skyrimspecialedition/mods/74257, is "Caliente's
Beautiful Bodies Enhancer -CBBE SFW Edition-" 1.1.4 by Ousnius and Caliente (main file 790860,
457.1 MB, 2026-08-16; optional "CBBE SFW Outfits - No Rim Lighting" 489066, 50.8 MB). That is
ask 3's SFW version. Ask 1's hair mod still needs its link from Eli.

## 1. Hairs (waiting on the link)

- The shape, whatever the pack: "additional hairs, not replacers" means a standalone plugin whose
  HDPT records add hairs beside vanilla's, with its meshes and textures; the plugin is served (the
  server validates a look's head parts against its load order, ActionListener.cpp HeadPartFacts),
  so it is a load-order slot and a MANIFEST change, not a client-only drop.
- Already in the layer: Apachii Sky Hair SSE 1.6.Full (ApachiiHair.esm, Nexus 2014 file 27721,
  182 MB, 507 files), the usual standalone pack for humans, elves and orcs.
- The other usual one, if that is the link: KS Hairdos SSE 1.10 (Nexus 6817), 1,058 styles (951
  female, 107 male), standalone, not adult-flagged; files: full 628148 (1,196.7 MB, 2025-05-17),
  female-only 628151 (1,095.1 MB), male 267847 (124.9 MB, v1.91M). The cost is size: persist, the
  clones, every friend's sync.

## 2. Female faces: the "baby smooth" has a different source on each machine

- **Fenestrate (Eli's machine)** deploys CBBE 2.0.3 WITH its Face Pack: 17 face files from CBBE
  (textures\actors\character\female\femalehead.dds, _msn, _s, femaleheadvampire and _msn, the race
  _msn maps for breton, dark elf, high elf, imperial, redguard, orc, plus 16 tintmasks and
  blankdetailmap). CBBE's credits name the pack's sources: tktk1's Pretty Face, Fair Skin
  Complexion's specular and _sk, Eyebrows Match Hair. That is the smooth look. Goam Elven Ears
  Redone lays femalehead_sk.dds and femaleheadvampire_sk.dds (subsurface) over them.
- **The seats** laid CBBE from lab/.cache/mods/cbbe-2.0.3-plan.json: folders 00 Required (Slim),
  02 Vanilla, 26 RaceMenu Morphs, 28 Morph Files (Outfits), 08 Outfits Vanilla, 09 Outfits
  BodySlide. No Face Pack (numidium's note that it was installed is not what the plan laid). So a
  seat's female faces are vanilla's, with Goam's two _sk files on top.
- Khajiit faces (Ariadne) are vanilla on both: the Face Pack covers human, elf and orc faces only.
- Least impactful fix, by machine: on Fenestrate, reinstall CBBE in Vortex with Face Pack unticked
  (CBBE's FAQ Q5: a face texture other than the pack is fine "as long as it's compatible with the
  CBBE seams"; vanilla is the reference the body textures were cut against, so test the neck on one
  character). On a seat, if the complaint is there too, the only non-vanilla face bytes are Goam's
  two _sk files; drop them from that row and compare. Which machine Eli meant is question 2 below.

## 3. The CBBE sliders

What a body slider needs, end to end (RaceMenu 0.4.20, CBBE 2.0.3):

- skee64.ini bEnableBodyMorph=1 (RaceMenu's default, unchanged in the layer).
- The slider plugin: folder 26 RaceMenu Morphs = RaceMenuMorphsCBBE.esp and five scripts
  (RaceMenuMorphsCBBE, ...UIExtensions, ...UIListMenu, ...UIMenuBase, ...UITextEntryMenu). The
  plugin's quest script extends RaceMenuBase, whose chain is OnInit -> RegisterEvents ->
  RegisterForModEvent("RSM_Initialized", ...) -> OnSliderRequest -> UI RSM_AddSliders ->
  OnSliderChanged -> NiOverride's body morph on the actor. Under the client's Papyrus block this
  runs: ADR-044's hook passes every event but OnUpdate to scripts named RaceMenu* (fork d9c940f1,
  the fix for "moving the skintone sliders does absolutely nothing" in playtest nine), and the leaf
  names here all start with RaceMenu. D62 keeps quest stages per seat; it stops no quest.
- The morph data: folder 27 Morph Files (Body), seven .tri files (femalebody, femalehands,
  femalefeet, femalehandsargonian, the 1st-person three) next to the body meshes; folder 28 Morph
  Files (Outfits), 418 .tri next to the outfit meshes; and outfit meshes built to the same shape
  (08 Outfits Vanilla). A mesh without its .tri ignores every slider.

Where each machine stands:

| | Fenestrate | the seats |
| --- | --- | --- |
| plugin + scripts (26) | deployed | laid |
| body .tri (27) | deployed (femalebody.tri etc.) | **not laid** (the plan has no folder 27) |
| outfit .tri (28) | deployed, 418 | laid, 418 |
| outfit meshes | CBBE 2.0.3 | 08 Outfits Vanilla |

So on a seat the body sliders cannot move the body itself (no femalebody.tri), while outfits with
a .tri do morph; Fenestrate has every file. "Don't work" therefore means one of three things, and
each has a different fix: (a) the CBBE category never appears in the menu: the plugin's script did
not run, a block or quest matter, probe it; (b) it appears and the naked body does not change on a
seat: folder 27, seven files, trivially laid; (c) it appears, the body changes and snaps back: the
sync re-applies the recorded look every two seconds (racemenu-sync.md), and body morphs ride the
preset it carries, so a look saved without morphs would overwrite them (HYPOTHESIS, not seen).
Question 3 below asks which.

Rotfern: her meshes stay her own; a flat chest in her robes is a BodyMorph on her robes' .tri (the
2026-10-07 read: her robes are CBBE 2.0.3 Vanilla Shape prebuilt meshes with morphs) plus the body
.tri under them, set once in her preset; the sync then shows it to every seat. Ariadne: the same
body files; CBBE ships femalekhajiit body and hand textures, so her body is covered.

## 4. The SFW edition, least impactful form

CBBE SFW Edition 1.1.4 (Nexus 74257) is the body with no nudity: NeverNude (vanilla-styled
underwear) or modern underwear meshes and textures, all vanilla, DLC and AE/CC outfits converted,
BodySlide addons, a Face Pack folder (20) as an option. Its own Q15 states the differences from
CBBE: no nudity; default meshes NeverNude or the alternate underwear; "RaceMenu Morphs plugin not
included. Morph files can still be built in BodySlide."

So the smallest set that keeps the sliders is three pieces:

1. The SFW main file, options NeverNude, the body shape Eli picks (question 4), Vanilla Outfits,
   Face Pack off (ask 2). One nexus row, `./->.` style, 457 MB.
2. The slider plugin from CBBE 2.0.3's folder 26 (Nexus 198 file 489053, the archive we hold):
   RaceMenuMorphsCBBE.esp and its five scripts, nothing else of that archive. One row with a
   folder pick, or a sub-row of the SFW row.
3. Morph files for the SFW meshes. If the SFW archive ships .tri files, those (to be read: the
   archive is in lab/.cache/mods as of this page, its contents and the body mesh's vertex count
   against CBBE 2.0.3's are the next read). If not, BodySlide's Batch Build with "Build Morphs"
   over the SFW addons, run once by Eli on Fenestrate with the chosen preset, gives meshes and .tri
   that match each other; that output is a `local` row (hashes in the manifest, files in persist).
   Reusing CBBE 2.0.3's folders 27 and 28 over SFW meshes is the fallback only if the vertex order
   is identical (HYPOTHESIS until the two meshes are compared).

Two consequences for the lab. CBBE becomes a layer row (today it is one of the base image's
"existing eight", laid by the plan above, outside the layer's lay record), so the base's 2,287
CBBE files must leave the clones: the plan gives the exact list, so either numidium re-bases
clean-m1 without them or add-mods takes a one-off prune list. And Fenestrate follows the same
choice in Vortex (SFW in, CBBE 2.0.3 out, the slider plugin kept), or the two machines' looks
differ.

## Questions for Eli

1. The hair mod's link (74257 was the SFW body).
2. The smooth faces: seen on Fenestrate, on a seat, or both?
3. The sliders: on which machine, and which of (a) no CBBE category in the menu, (b) sliders move
   but the body does not, (c) the body changes and snaps back?
4. SFW body shape: Slim, Curvy or Vanilla (the current seats are Vanilla shape, Slim required
   files).
5. Is BodySlide installed on Fenestrate (for one Batch Build with morphs, if the SFW archive ships
   none)?

## Sources

- Nexus API, game skyrimspecialedition: /mods/74257 and /files, /mods/6817 and /files,
  /mods/2014 and /files (2026-11-06; names, versions, file ids, sizes, dates as given above).
- CBBE SFW Edition page text (the API's description field), Q15 and the Options and Installation
  sections; CBBE 2.0.3's FAQ Q3a, Q5, Q8 and its credits (same source).
- lab/.cache/mods/CBBE-2.0.3.7z (the archive's folder layout) and cbbe-2.0.3-plan.json (the
  seats' install).
- Fenestrate: chim/.scratch/fenestrate-20261018/.../Data/vortex.deployment.json (20,816 entries;
  2,330 from CBBE 2.0.3, 429 of them .tri; 17 female head textures from CBBE, 2 from Goam).
- RaceMenu 0.4.20: RaceMenu.bsa scripts/source/racemenubase.psc; SKSE/Plugins/skee64.ini.
- docs/DECISIONS.md ADR-044 (the hook's RaceMenu* exemption); docs/verbs/racemenu-sync.md (the
  dead sliders of playtest nine, fork d9c940f1; the two-second re-apply and the preset's parts).
- UESP, Skyrim Mod:Mod File Format/HDPT (head parts as records):
  https://en.uesp.net/wiki/Skyrim_Mod:Mod_File_Format/HDPT
