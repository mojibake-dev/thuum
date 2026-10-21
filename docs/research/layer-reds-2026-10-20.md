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
- apocrypha's audit of the laid tree (16:39): the mechanism. skee64.dll and
  skee64.ini are RaceMenu's own (every [Features] flag on), nothing loose
  shadows RaceMenu.bsa, and the archives share exactly one path:
  SkyUI_SE.bsa carries interface/racesex_menu.swf too (35,416 B against
  RaceMenu's 105,756). In the layer SkyUI_SE.esp is client-only at the
  tail (slot 82) and RaceMenu.esp is served at 23, so among archives
  SkyUI's copy wins and every layer seat ran SkyUI's vanilla-style race
  menu: no RaceMap::CreateDefaultMap, the race pick walking the vanilla
  list, the hair rebuild at open, the tint crash. Fenestrate has SkyUI at
  93 and RaceMenu at 170 (RaceMenu's install notes: after SkyUI), and the
  no-layer lab has no SkyUI, which is why only layer runs show it. The fix
  keeps every slot: persist-mods extracts RaceMenu's racesex_menu.swf from
  RaceMenu.bsa and lays it loose in RaceMenu's folder (lab/tools/
  bsa-extract.py, a stdlib BSA reader with its own LZ4 frame decoder,
  byte-identical to the lz4 library's), since a loose file beats every
  archive whatever the order. The rule: when two archives share a path and
  the plugins' order cannot be the installer's, lay the winner's copy
  loose. Same render as the master-bits head-parts patch and the 0x7 drop.
  CONFIRMED on the fixed layer's stage (stage-layer-train30 b53d922, laid
  17:05 PDT; smoke 20261021-000157 green): both seats' skee64.log carry 29
  RaceMap::CreateDefaultMap and 51 RacePartDefaultGen lines, none under
  68a56247, so RaceMenu's chargen initialises and the race menu is
  RaceMenu's again; a-rotfern, a-racemenu and b-duel decide the rest.
  a-rotfern GREEN on it, 20261021-000439 (no CTD; the race pick lands
  through RaceMenu's menu): the crash's cause and fix CONFIRMED. a-racemenu
  GREEN on it, 20261021-000831 (the preset's eight parts through the menu
  open and close, the relaunch and the reconnect): the head-part flags on
  their masters' bits and RaceMenu's menu back, both CONFIRMED.
- The render: apocrypha/layer-essentials c38a3b04 (16:45 PDT; contains main
  fd20b1e6), no slot moves: the NPC_ 0x7 drop-record; the head parts on
  their masters' gender bits (766 Skyrim.esm, 39 Dawnguard.esm: the 805
  DATA bytes 01x533 05x2 09x202 11x55 18x1 19x12 become 01x5 03x307 05x223
  09x7 0bx118 0dx77 13x25 15x30 1ax1 1bx9 1dx3); RaceMenu's
  racesex_menu.swf laid loose. docs/MODS.md and plugin-patches.tsv carry
  all three with HYPOTHESIS tags pending the deciders: a-rotfern,
  a-racemenu and b-duel on the fixed layer alone (layer-stage's probes),
  then the train stage.

## 3. b-duel 20261020-232356 and b-god 20261020-233136 (under read)

- b-duel, the Flames row (step 65): 0.822 against the green 0.7293 (layer
  1496763f) and 0.7198 to 0.7358 (no layer); server and seat agree, so
  less damage applied, not a desync. Read 16:43 PDT: the server took 12
  hits summing 2.339 s (red) against 19 summing 3.418 s (green), the same
  183 ms cadence, the same one capped 365 ms gap, no refusal (the ADR-039
  warning on 0xF392F's HasPerk rider is in both and damage followed it),
  the same regen and base on c2, the same 8df entry on both servers, and
  the hold itself 4.001 s in both (c2's replay of c1's figure's
  MRh_SpellAimedConcentrationStart to MRh_Equipped_Event). The shortfall is
  seven hits, all at the start: the first hit came 2.09 s after the hold
  (green 1.07 s) with a first count of 0.25 (the cast had been open 250 ms
  or more), where every other stationary Flames stream today, seven of them
  on this stage minutes earlier, opened within 60 to 77 ms. So c1's flames
  did not register on c2's figure for about a second after the cast: a c1
  stall or a miss, likeliest a one-off. The 0.78 bound stays. Decider: the
  rerun on the re-staged layer with c1 watched; a first hit about a second
  after the hold with 19 hits says one-off, about two seconds with 12 says
  the stage changes c1's first contact.
- b-god (step 46): after god mode off, c2's arrow left c1 at 1.0 on the
  server and the seat; the no-layer run 125817 was green. Read 16:54 PDT:
  the toggle worked (server.log "god mode off" 22 s before the shot in both
  runs) and the shot was recorded (OnPlayerBowShot ff000001, power 1.00,
  aim 0.000 heading 0.000), but no hit claim ever came from c2's game in
  either god-mode block of the red run (no OnWeaponHit, no refusal; a
  refusal logs at warn, the client's hitService drops silently), while c1's
  arrows at c2 kept hitting under the same layer (b-arrow-path 6 of 10,
  b-headshot 3 of 3, b-marksman 2 of 2). The measured difference: c1's own
  first-person launches sit 3.8 units higher over its feet under the layer
  (b-arrow-path 225948 against 122620: 133.4 against 129.6 at the same
  pitch -0.0349), both seats stand about a unit higher, and c2's crosshair
  on c1 already sat at the very top of c1's head without the layer (the
  screenshots); under the layer it clears the head by about 8 units. c2 at
  c1 (a Nord on the lower mark) misses; c1 at c2 (an Orc on the higher
  mark) hits. Improved Camera SE is the only layer DLL hooking the camera
  (HYPOTHESIS for the lift). So b-god's shot is a brittle aim, not a server
  fault: the scenario's fix is to aim c2 at c1's body (a pitch down), as
  b-headshot aims at the head on purpose. Since the look step cannot pitch
  a seat's aim, the fix is the range: c2 shoots from 150 units (main 7f65c0c9,
  scenario ad41f03b; a routine strengthening, bounds unchanged). Decider: b-god
  in the train stage's probes.

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

## The deciders (2026-10-20, 17:04 to 17:15 PDT)

All three green on the fixed layer's stage (stage-layer-train30 b53d922,
render c38a3b04): a-rotfern 20261021-000439 (no CTD), a-racemenu
20261021-000831 (the preset's eight parts through the menu, the relaunch
and the reconnect), b-duel 20261021-001214 (18 Flames hits, 0.7351); both
seats' skee64.log carry RaceMenu's chargen init again. apocrypha lifted
docs/MODS.md's and plugin-patches.tsv's HYPOTHESIS tags on them (layer head
64b2f067). b-god's range fix runs as the train stage's last probe.

## The train stage's probes (2026-10-20, 17:25 to 17:50 PDT)

On fork m2-train-30 44372078 over the fixed layer: smoke-two-players 002801,
a-restart-persistence 003024, b-duel 003256, b-spells-reconnect 003639 green;
b-formdesc-world 002549, b-figure-values 003901 and b-hailstone 004204 red,
each read:

- b-formdesc-world (slice one's first run anywhere): the migration is
  CORRECT on disk and on the wire. server.log: "ADR-043: 8 records read
  under the running order of 91 files; 8 in the raw shape re-based and
  written back as version 2; 0 stored forms name a plugin the order lacks
  and are kept"; world-after: both actor records at formVersion 2, every
  mod form a FormDesc, the appearance re-based (0x0800AA00 to 0x2F00AA00,
  the sibling appearanceForms), c2's record fully migrated too; c1's own
  game read rotfern (0x2F00AA00) and c2's first game process built a figure
  named "rotfern" with Ghostwalk at 0x1A in its left hand. The red: c2's
  game CRASHED at 00:27:06Z, 27 s after start, in skee64.dll+00D47E2
  (EXCEPTION_ACCESS_VIOLATION, rcx null; R14 the Character "rotfern"
  ff00081a, RDI a BSTriShape "CBBE", RSI the OverlayInterface, the armor
  "Shrouded Robes", SKSETaskRevertOverlays on the stack), as c1's look
  applied to its figure; lab-api relaunched it (E_RUN_GAME_REPLACED) and
  the step-8 reads came from the relaunched client still fading in (no
  figure of c1 in reach; the view matched the NPC "stalleo" at 572 units,
  so the deployed lab-api's matcher differs from assertions.py's 512).
  The one assert of its own: server.actor(c1).headParts has eight, c1's
  base seven: the preset carries the Skyrim.esm hair 0xEC1B2 beside
  rotfern's hair and the engine keeps one part per type (TESNPC::
  ChangeHeadPart), an ADR-026 derivation gap (the server's derived list
  should keep one per type as the engine does); carried, HYPOTHESIS (read
  HDPT 0xEC1B2's PNAM). Decision: the train stays m2-train-30; the crash
  reruns once as the risk for twenty-eight (Eli's rotfern look on test 2's
  figure under this layer); the scenario stays pending on the head-parts
  assert. The rerun, 20261021-004815: NO crash (no crash file, no relaunch,
  every known and view assert held; the one failure the head-parts
  derivation gap), so the skee64 crash was a one-off; the seats proceed.
- b-figure-values 003901: no dent. The figure's health in c1's game fell 38
  times (the three hits as declines of 1.7 down to 0.6 over about 1.4 s
  each) and rose 30 times, every rise between 0.009 and 0.048 (the figure's
  own regeneration between the server's reports); the end values agreed.
  The assert counted the jitter: it becomes rises("health", 1) == 0 with
  lab-api's threshold argument (lab-api main a69d91d; scenario on main
  cb9e4e00); the probe reruns when the lab-api image swaps after
  twenty-eight.
- b-god 20261021-004426 GREEN with the shooter at 150 units.
- b-hailstone 004204: row 1 (the Nord at the Orc) green at 0.85; row 2 (the
  Orc at the Nord) 0.7892 = 15 x 0.5 + 15 less the wait's regeneration: both
  effects applied, the base effect's gate fired on the Nord's 50 ResistFrost
  (the race's abilities read) and was halved, the Shatter went through
  whole. The record (numidium's esm.py): the base effect has NO
  resist value and the Shatter is resisted by ResistFrost, so the engine
  halves the Shatter and lets the base effect through, the server's own
  total; the band follows the record (main 053dd276) and the rerun
  20261021-005051 is GREEN.

## Playtest twenty-eight's findings as they land (2026-10-20 evening)

- 18:12, Eli: "rotfern is missing teleport" after the server restart and
  the reconnect. numidium's read: twenty-seven's raw snapshot
  (playtest-m2-27-20261020T183558Z) already held 15 learned spells for
  profile 1 and no Teleportation, so test 1's loss predates tonight (the
  slot-shift days, the very case ADR-043 ends); re-taught server-side at
  18:13 (0x280A86DF). Profile 2's record holds 'a86df:Cloaks.esp', a
  mis-based FormDesc: its raw 0x0B0A86DF was written under the no-layer
  order (LostGrimoire at 0x0B there, Cloaks.esp at 0x0B under the layer),
  and setup's migration of a world with NO saved order re-based from the
  running order (RecordReader.h:12-16, the only choice without a saved
  order), so it landed on Cloaks.esp and nothing was parked, since
  Cloaks.esp exists. Slice one's weak case: a raw world whose records were
  written across two orders cannot be re-based by one assumed order. ADR-043
  slice two's first row: a repair for the lab's legacy worlds (the ids the
  no-layer era wrote outside the slots the two orders share), while worlds
  saved by the slice carry their order from now on, so the case cannot
  recur. Re-taught to profile 2 too; the dangling entry to clean after.
  The 28.yaml spell lists did not carry Teleportation (as 27's did not),
  so it alone depended on the record; the setup's learn-spell adds and
  never replaces, and the reconnect sync is cleared of this one.
- Setup's gives stack on a restored world across playtests (4 iron swords,
  3 capes on test 1; 3 cloaks on test 2): the setup's give becomes
  idempotent, topping up to a count (numidium, main 485c4ee).
- 18:18, Eli's report: "test 2's heals are getting rejected by the server.
  nor is his health ticking up naturally". numidium's read of the server
  log (00:58 to 01:30Z, kept as /srv/lab/handover/pt28-server.log): no Self
  cast by ff000001 reached the server, no Azure Reconstruction (0x1A088694)
  line anywhere, no refusal but the three ADR-039 E_CONDITION_UNKNOWN 448s,
  no ChangeValues or crop line at info; test 2's only restore was a bed
  ("Rest: ... slept 1 h, percentages now 1 1 1"). So Apocalypse's heal ran
  in test 2's own game under ADR-029's default (the caster's game runs its
  own spells' scripts) and the server, never told, cropped the reported rise
  back to its regeneration model; and Survival Mode is ON for both seats
  (playerGlobals 828 = 1 in both records, sent at the logins), which
  disables passive health regeneration. Not a regression against
  twenty-seven; visible now because test 2 tried to heal. The row: the
  allowlisted self-heal (the server applies Azure Reconstruction as a Self
  effect) with the snap-back fix beneath it (docs/PLAN.md, Train-31).
- 18:18, the headshot row unticked without a note: the log read is pending
  the right shooter (test 1 holds the bow in 28), and Eli's word on what he
  saw.
- Cosmetic, from the log: after the 18:02 restart the user numbers swapped
  with connect order (user 1 is whoever connects first); after test 2's
  relaunch "report before the login's record was applied, not taken" is the
  login hold working.

## Consequence for M2's close

docs/M2-CLOSE.md: the train stages on the staged layer (the probes do not
depend on these fixes); playtest twenty-eight's world restore waits for the
patched layer staged on top; the layer merges by its own gate after its
fixes, before M2 is called done.
