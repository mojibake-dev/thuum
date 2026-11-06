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

## 1. Hairs: Vanilla hair remake, as the replacer it is (Eli, 2026-11-06)

The link (2026-11-06): Nexus 63979, "Vanilla hair remake" 1.0.3 by jg1: a remake from scratch of
146 vanilla hairstyles across all playable races, same scruffy look, more detail, optional SMP
physics. By design it REPLACES the vanilla hair meshes at their paths and uses the vanilla hair
textures (any texture replacer still applies); "Main files affect the player only" (NPCs carry
their hair baked into face data, so the optional NPC files ship regenerated face data for over
2,000 vanilla NPCs). Eli, after the read: "re the hair i changed my mind. it's fine to just use
them as replacers." So no plugin, no slot, no server change: a client-only layer row of loose
meshes. Files (2026-11-06): main "Vanilla hair remake" 501460 (v1.0.2, 8.4 MB, no physics, "Does
not require HDT-SMP"); main "Vanilla hair remake SMP" 510409 (v1.0.3, 8.2 MB, needs FSMP, which the
layer keeps out); optional NPCs 501461 (no physics, 70.5 MB) and SMP NPCs 500742; optional SMP
Wigs 510410. The row is file 501460; the NPC file is a separate choice (2,000 NPCs' face data,
conflicts with any mod that edits those NPCs' heads).

The earlier note on packs, kept for the record:

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
- **The seats** carry the Face Pack too, read from their disks on 2026-11-06 (c1 and c2, the
  1.6.1170 game folder): textures\actors\character\female\femalehead.dds and femalehead_msn.dds
  are loose and hash-identical to the archive's 10 Face Pack files (sha256 c064834e..., 79582540...),
  with femalehead_s, femaleheadvampire, _msn and Goam's two _sk beside them. They come from the
  render, not a base image: persist-mods laid CBBE from its FOMOD with the choices Vanilla Shape,
  Vanilla Outfits, RaceMenu Morphs, Morph Files (Outfits) and, since 2982ce82 of 2026-10-07, Face
  Pack, added for the neck seam of playtest nine (CBBE's body textures against vanilla's female
  heads). lab/.cache/mods/cbbe-2.0.3-plan.json predates that commit; the first two drafts of this
  page read it as the seats' state and were wrong twice. The clones' lay record lists every CBBE
  file, so the existing prune (D37's, by hash) removes whatever a new render drops. Eli: "the faces
  were on client 2". Cause confirmed: the Face Pack.
- Khajiit faces (Ariadne) are vanilla on both: the Face Pack covers human, elf and orc faces only.
- D2 B (Eli, 2026-11-06, "fire at will"): CBBE became a layer row on apocrypha/layer-appearance
  (ba22fb2e) with Face Pack out and Morph Files (Body) in; the trade-off to watch is the neck seam
  the pack was added for, which may come back on vanilla faces. The superseded plan:
- Least impactful fix: remove the Face Pack's files from the seats (the 42 paths of folder 10 that
  are present, 17 of them face textures, the rest tintmasks and race _msn maps) so vanilla's come
  back from the BSA, and on Fenestrate reinstall CBBE in Vortex with Face Pack unticked. CBBE's FAQ
  Q5: a face texture other than the pack is fine "as long as it's compatible with the CBBE seams";
  test the neck on one character. The seats' files are base-image files, outside the lay record, so
  the removal is an explicit list (numidium's lay or a one-off), or the CBBE layer row below with the
  base re-made without it.

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
| body .tri (27) | deployed (femalebody.tri etc.) | **absent** (read on both seats 2026-11-06; 635 other .tri present) |
| outfit .tri (28) | deployed, 418 | laid, 418 |
| outfit meshes | CBBE 2.0.3 | 08 Outfits Vanilla |

So on a seat the body sliders cannot move the body itself (no femalebody.tri), while outfits with
a .tri do morph; Fenestrate has every file. "Don't work" therefore means one of three things, and
each has a different fix: (a) the CBBE category never appears in the menu: the plugin's script did
not run, a block or quest matter, probe it; (b) it appears and the naked body does not change on a
seat: folder 27, seven files, trivially laid; (c) it appears, the body changes and snaps back: the
sync re-applies the recorded look every two seconds (racemenu-sync.md), and body morphs ride the
preset it carries, so a look saved without morphs would overwrite them (HYPOTHESIS, not seen).
Eli (2026-11-06): the sliders complaint is "the skylab clients one and two", and both seats have
the plugin, its script, skee64 with bEnableBodyMorph=1 and no femalebody.tri or femalehands.tri, so
the read is (b): the body cannot morph on a seat. Eli's symptom matches it exactly: "sliders of the
body while naked in race menu were the problem". The fix is folder 27's seven files on both seats
(and in the CBBE row when CBBE becomes one).

## What is staged for numidium's next slot (2026-11-06, nothing laid yet)

- sky-srv /srv/lab/handover/cbbe-2.0.3-body-morphs/: CBBE 2.0.3's folder 27, the seven .tri in
  Data layout with SHA256SUMS, verified on the server. Lay into both seats' 1.6.1170 Data; the
  body sliders then move the naked body in the race menu.
- sky-srv /srv/lab/handover/cbbe-face-pack-prune.txt: the 28 paths of CBBE 2.0.3's folder 10 (the
  Face Pack) to delete under Data where present, both seats; vanilla's female faces return from the
  BSA. The same untick on Fenestrate in Vortex is Eli's.
- The hair: lab/.cache/mods/"Vanilla hair remake 63979 1.0.2 file 501460.7z" (8,827,229 bytes,
  md5 a7102ae31a8a305a22cffdd9106dff73): 475 files in plain Data layout, 271 hair meshes and 204
  .tri under meshes\actors\character\character assets\hair, no plugin, no textures (vanilla's
  apply). It goes in as a client-only layer row (apocrypha/layer-appearance), staged with the
  layer, not through the handover.
- The SFW swap waits for Eli's BodySlide build (below).

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
3. Morph files for the SFW meshes, which the archive does not ship (read 2026-11-06, the main
   file in lab/.cache/mods: 2,940 files, zero .tri, no RaceMenu Morphs plugin, no scripts; its
   CBBE.esp is byte-identical to 2.0.3's). BodySlide's Batch Build with "Build Morphs" over the SFW
   projects (folder 11 Outfits BodySlide: 1,372 project files, groups CBBE (SFW), CBBE Vanilla
   (SFW), Dawnguard, Dragonborn, Creation Club and the two 1st-person groups, one shipped preset
   "CBBE (SFW)"), run once by Eli on Fenestrate with the chosen preset, gives meshes and .tri that
   match each other; that output is a `local` row (hashes in the manifest, files in persist).
   Reusing CBBE 2.0.3's folders 27 and 28 over SFW's prebuilt meshes is not a safe fallback: SFW's
   body meshes are a different build from every 2.0.3 variant (none of the md5s match), and a .tri
   whose vertex order differs from its mesh morphs garbage.

What the SFW main file is, read from the archive: 00 Required (55 files, 22 meshes: the one body
build, curvy per the author's note, with CBBE.esp); the installer's choices are Underwear or
NeverNude meshes (30 Underwear, 31 Underwear Revealing, four colour folders), Vanilla Outfits (10
Outfits, 1,373 prebuilt meshes), Face Pack (20, 28 files), Dirt to Beauty Marks and six brow
options; no body-shape choice at all, a shape other than the shipped one is a BodySlide build.
Beast races: 11 khajiit and argonian texture files.

Two consequences for the lab. CBBE becomes a layer row (today it is one of the base image's
"existing eight", laid by the plan above, outside the layer's lay record), so the base's 2,287
CBBE files must leave the clones: the plan gives the exact list, so either numidium re-bases
clean-m1 without them or add-mods takes a one-off prune list. And Fenestrate follows the same
choice in Vortex (SFW in, CBBE 2.0.3 out, the slider plugin kept), or the two machines' looks
differ.

## The BodySlide build for the SFW step (Eli, on Fenestrate, once)

Install CBBE SFW Edition in Vortex (NeverNude, Vanilla Outfits, no Face Pack) with BodySlide. In
BodySlide: Outfit/Body "CBBE Body (SFW)" (or whatever the SFW body project is named in the list),
Preset "CBBE (SFW)", tick "Build Morphs", then Batch Build with the groups CBBE (SFW), CBBE Vanilla
(SFW), CBBE Dawnguard (SFW), CBBE Dragonborn (SFW), CBBE Creation Club (SFW) and the two 1st Person
groups, all with Build Morphs on. The output (meshes and .tri, the body under character assets and
every outfit) is the morph set; it lands in the layer as a `local` row beside the SFW row and the
slider plugin from CBBE 2.0.3's folder 26. Hand it over as a folder (zip it) and say which preset
and groups were used; the row records the hashes, the files stay out of the repo.

## Questions for Eli

1. Answered 2026-11-06: Nexus 63979, Vanilla hair remake, as a replacer.
2. Answered: client 2 (the seats; the Face Pack, hash-confirmed on both).
3. Answered: the skylab clients one and two; the seats lack the body .tri (case b).
4. Answered: "keep the shipped sfw shape, but the sliders should work". So the BodySlide build uses
   the shipped preset "CBBE (SFW)" and exists only to produce the morph files.
5. Answered: "bodyslide is probs on fenestrate". The SFW archive ships no morphs, so that one build
   is the SFW path's prerequisite.

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
