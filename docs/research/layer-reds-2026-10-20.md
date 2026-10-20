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
- Decider: a-rotfern green on the patched layer's stage.

## 2. a-racemenu 20261020-224305 step 18: layer head parts in the record

- `server.actor(c1).headParts == c1.head_parts()` false after c1's menu
  open and close (a scale and a morph), BEFORE any relaunch: the server
  holds 0x24244, 0x510b4, 0x51508, 0x5162f, 0x51631, 0x8555f, 0x09002314,
  0x09002317, the last two parts of the layer's full slot 0x09; c1's game
  shows another set. A new shape past the gender-flag fix (x-layer-headparts
  20261020-210719 read eight parts equal before and after a relaunch).
- Read 16:25 PDT: both c1's base (steps/015, nine parts) and the record
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
