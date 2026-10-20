# The essentials layer's reds of 2026-10-20

The layer's first full gate (`just layer-merge stage-layer-train29`, run set
20261020-220005-layer-stage-layer-train29 on render cf363c44: FSMP out, the
head-parts gender flags patched) ended red at 25 of 62 with two reds, after
the morning's three (docs/verbs/racemenu-sync.md's LAYER FINDING; b-spell's
served band; b-push's refused Ragdoll, probe x-push-knock-frida) had been
read. Both are the same family: a layer plugin reaching a player's base or
record. Read 2026-10-20 16:00 to 16:20 PDT; apocrypha's facts as quoted.

## 1. a-rotfern 20261020-224918: a CTD at the mid-game appearance step

- c1's game died around step 7 (lab-api E_RUN_GAME_REPLACED: pid 10580 at
  the version check, 420 at the run's end). The crash log
  c1-crash-2026-10-20-15-50-56.log: EXCEPTION_ACCESS_VIOLATION at
  SkyrimSE.exe+095A263 (`mov ebx, [rdx+0x08]`); RSP+78 holds the TESNPC
  "test 1" [0x00000007], the Player base, "last overridden by Supernatural
  Survival Tweaks - Cold Resist Werebeast and Vampire.esp" (GetFullName
  "Rotfern"); RBX the TESRace rotfernRaceVampire (0x2F019D08); the function
  is Address Library id 52412, the fault at +0x123 (numidium's and
  apocrypha's reads of the crash log; HYPOTHESIS for the path until a-rotfern
  reruns on the patched layer).
- The layer fact (apocrypha): of 93 layer plugins exactly one overrides
  NPC_ 0x00000007, that esp (light, 7,729 B, 14 records): a whole copy of
  the vanilla Player record (Prisoner, NordRace, male, one head part
  0x00051507, the vanilla spells, perks, inventory, tint layers) plus a VMAD
  attaching SST_PlayerScriptAddRemoveAbilities, the mod's headline feature
  (cold resist when the player turns vampire or werebeast). Connected, that
  script was outside the admitted list, so it never ran; the plugin's other
  records (the Creation's Survival_NeedColdQuest and freezing-water effect
  overrides, the Argonian racial spell, two effects, five messages) keep
  working to the extent the Creation's scripts do.
- The rule, the class not the instance: in SkyMP every player shares the
  Player base 0x7 and the server builds a player's values and appearance
  from it, so no served plugin may override NPC_ 0x7 (nor PlayerRef 0x14).
  Fix: a third build-time patch kind in persist-mods, drop-record, removes
  the override (the group sizes and the header's count follow; idempotent;
  no slot moves); and lab-api's load-order check refuses a served plugin
  that overrides 0x7 before deploy-srv (numidium, lab/tools/
  load-order-check.py). Eli's alternative: drop the plugin (one row to
  `out`); the patch is the default since the override's feature never
  worked connected. Eli, 16:20 PDT: "patch it".
- Read 16:32 PDT, the crash's path (a reader on the crash log, Ghidra on
  the unpacked 1.6.1170 per rule 2, HYPOTHESIS until a-rotfern reruns):
  the fault is the VANILLA RaceSexMenu's slider rebuild, 52346
  (AdvanceMovie's rebuild) to 52409 (the sliders, RBP "ChangeFaceDetails",
  RSP+E8 "Complexion") to 52412+0x123, which finds the Nth tint of a type
  in race->faceRelatedData[sex]->tintMasks and indexes
  PlayerCharacter::tintMasks by that position with no size check (RCX 31,
  type 0xE Dirt, the second dirt layer); rotfern.esp's races carry 33 male
  tint layers with dirt at 30 to 32 and the player's tint array has no
  entry 31; RBX the TESRace rotfernRaceVampire (0x2F019D08), incidental
  (the base race carries the same list). The 0x7 override is on the stack
  as data ("Modified by" the Survival Tweaks esp) with no path to the read.
  Why the vanilla menu was up: under the layer RaceMenu's chargen never
  initialises. Every layer run's c1-skee64.log holds only "NetImmerse
  Override Enabled" and "Reverting...", where the no-layer run
  20261020-121634's has the DataLoaded init ("RaceMap::CreateDefaultMap -
  Added default slider maps for rotfernRaceVampire from NordRace", the
  RacePartDefaultGen lines). So a-rotfern's race-pick (DirectInput Down
  every 1.2 s) walked the vanilla menu's name-sorted list onto the vampire
  twin at the third press (RaceMenu's menu ignored the presses in every
  green run and the setRace fallback made the pick); a-character-creation
  under the layer moved Nord to Orc with one press (220511); and
  a-racemenu's hair swap at a menu open is the vanilla menu's rebuild too.
  The layer defect to fix first: RaceMenu's install under the layer
  (skee64.dll, skee64.ini, RaceMenu.bsa, the interface files; the install
  order's winners for those paths; lab/tools/persist-mods.sh:247-248),
  asked of apocrypha and numidium. Decider: "RaceMap::CreateDefaultMap" in
  a layer seat's c1-skee64.log, then a-rotfern green. The 0x7 rule stands
  on its own ground.
- numidium's deploy read (16:37): persist is clean. SHA256SUMS holds one
  copy each of RaceMenu.bsa, RaceMenu.esp, RaceMenuPlugin.esp, skee64.dll
  and skee64.ini, all from racemenu-0.4.20.0@1.6.1170, nothing loose at
  the interface paths; the one BSA overlap (SkyUI_SE.bsa's
  interface\racesex_menu.swf, SkyUI loading last as a client-only plugin
  must) is in both heads and latent. Under the previous layer stage
  1496763f skee DID initialise (29 CreateDefaultMap lines in 192512 and
  193623, RacePartDefaultGen at +5 s); under 68a56247 its race-part pass
  never ran. The heads differ client-side in FSMP out, the two esl-flagged
  Survival patches, and plugin-patch's hdpt-gender-both on Playable
  Headparts All Races.esp, the only new input to skee's head-part pass: so
  the gender-both flags are the candidate for the inert chargen too
  (HYPOTHESIS), and apocrypha's gender-bits-from-masters patch the one fix
  for all three menu reds; the re-stage's a-racemenu and a-rotfern decide,
  with the seat's files hashed first against stale snapshots.

## 3. b-duel 20261020-232356 and b-god 20261020-233136 (under read)

- b-duel, the Flames row (step 65): 0.822 against the green 0.7293 (layer
  1496763f) and 0.7198 to 0.7358 (no layer); server and seat agree, so
  less damage applied, not a desync; the stage's differences are the 8df
  default (the box's absence), the two Survival patches and plugin-patch.
- b-god (step 46): after god mode off, c2's arrow left c1 at 1.0 on the
  server and the seat; the no-layer run 125817 was green.

## 2. a-racemenu 20261020-224305 step 18: layer head parts in the record

- `server.actor(c1).headParts == c1.head_parts()` false after c1's menu
  open and close (a scale and a morph), BEFORE any relaunch: the server
  holds 0x24244, 0x510b4, 0x51508, 0x5162f, 0x51631, 0x8555f, 0x09002314,
  0x09002317, the last two parts of the layer's full slot 0x09; c1's game
  shows another set. A new shape past the gender-flag fix (x-layer-headparts
  20261020-210719 read eight parts equal before and after a relaunch).
- Read 16:24 PDT: both c1's base (steps/015, nine parts) and the record
  carry ApachiiHairM01 (0x09002317) and ApachiiHairLineM01 (0x09002314) in
  place of HairMaleNord01, with one orphan vanilla hairline left on the
  base; the preset c1 saved 0.25 s after the close was 8849 bytes against
  the green runs' 8747, so c1's game sent the swap and the server derived
  nothing (racemenu.rs derived_head_parts emits every listed part and drops
  none). The unpatched 01 flags passed a male's menu (193623 held step 18)
  and failed rotfern (female); the patched 07 flags fail a male's menu open.
  HYPOTHESIS, the mechanism: the vanilla menu's rebuild at open reads a
  part with kFemale set as female and rejects every 07 part for a male,
  taking the first valid alternative where one exists; only hair has one
  (ApachiiHairM01, DATA 03, the first of 32 male Apachii hairs), so head,
  mouth, beard, brows and marks stay and the hair swaps. Fix (apocrypha's
  render): a size-preserving patch copying each of the 805 overrides'
  gender bits from its master record (766 Skyrim.esm, 39 Dawnguard.esm),
  keeping the all-races RNAM, right by construction for RaceMenu's preset
  load and the menu's rebuild. Deciders: a-racemenu on the re-render; a
  head-parts read with the menu still open for the mechanism.

## Consequence for M2's close

docs/M2-CLOSE.md: the train stages on the staged layer (the probes do not
depend on these fixes); playtest twenty-eight's world restore waits for the
patched layer staged on top; the layer merges by its own gate after its
fixes, before M2 is called done.
