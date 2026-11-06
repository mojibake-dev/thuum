# CBBE SFW's BodySlide build

CBBE SFW Edition (Nexus 74257) ships its body and outfit meshes without the morph files RaceMenu's body sliders
need, and its page says so ("RaceMenu Morphs plugin not included. Morph files can still be built in BodySlide").
Eli wants the SFW body with working sliders, in its shipped shape (2026-11-06). This folder is that build: SFW's
own BodySlide projects run through BodySlide and Outfit Studio 6.1.0 (Nexus 201) with the shipped preset
"CBBE (SFW)" and morph output, headless on sky-build.

- `inputs.tsv`: the two archives, by Nexus id, file name and md5. They are licensed mod files and live only in the
  Mac's lab/.cache/mods and sky-build's D:\thuum-inputs, never in this repo or an artifact that leaves the estate.
- `build.ps1`: everything else. It checks both md5s and lays BodySlide's tree and SFW's two BodySlide trees into one
  Data\CalienteTools, as a mod manager would. It presets BodySlide's config for Skyrim SE with its first-run and
  missing-game-path dialogs off, since a headless run has no one to answer them. Then it runs two batch builds with
  --trimorphs --quiet: the NeverNude body, feet, hands and beast hands, then the outfit groups. It fails when a
  build hangs or a mesh lacks its BODYTRI link.
- `../tools/bodyslide-inputs.sh`: places the two archives on sky-build (sky-srv serves them inside VLAN 70 for the
  copy; the box checks each md5).
- CI: `cbbe-sfw-bodyslide-build` in .gitlab-ci.yml runs build.ps1 on the windows runner when this folder changes,
  manually on a branch, and keeps `lab/bodyslide/dist` (Data-layout meshes and .tri) as its artifact. The essentials
  row `cbbe-sfw-bodyslide-1.1.4@1.6.1170` takes that artifact as a `ci` row; until the first job runs it is the hand
  proof's output, a `local` row.

Two facts the proof (2026-11-06) found the hard way:

- The groups are named inside SFW's SliderGroups files, not by the file names. The Vanilla, Dawnguard, Dragonborn and
  Vanilla 1st Person files all define "CBBE Vanilla Outfits (SFW)", while the Creation Club files define "CBBE Creation
  Club (SFW)" and "CBBE Creation Club 1st Person (SFW)". A group name that matches nothing builds nothing and reports
  success.
- The body group "CBBE (SFW)" holds both the NeverNude and the Underwear body, and both write the same files, so the
  body sets are named one by one. NeverNude is the vanilla-styled underwear and the closest to vanilla; the modern
  style is "CBBE Underwear (SFW)" plus SFW's 30 Underwear textures. The body project's three first-person sets
  ("CBBE Body/Hands/Hands Beast 1st Person (SFW)") are not built yet, so first person keeps SFW's prebuilt meshes,
  which have no morphs.

The proof's numbers: 1,369 meshes, every one with a BODYTRI link to one of 686 .tri; the body pass took 2 s, the
Creation Club groups 2 s, the vanilla outfits 8 s. BodySlide logs that it found no usable OpenGL in the runner's
session and builds anyway.
