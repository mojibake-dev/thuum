# Train-31's reads: heals by the record, the server's kill (2026-10-20 evening)

Eli's calls at playtest twenty-eight's report
(docs/research/layer-reds-2026-10-20.md): a heal applies to whoever the
record names (Healing Hands on another player heals them; Azure
Reconstruction does not heal a player who is not the caster's summon), and a
scripted kill is the server's in both games. The code read below (a read
agent over fork m2-train-30 44372078 in lab/.cache/wt/t30train, and
m2-snapback eef10842 for the hold; cites are file:line there) says what
exists. The record read of the three spells lands in section 5. Nothing here
is built; the rows are PLAN's Train-31.

## 1. Another player's heal: applied end to end already, with two defects

The path for a non-Hostile effect on another player is the hostile path
with no refusal on the flag:

- the client reports an own effect applied on a figure as an OnHit of the
  spell in hand (skymp5-client/src/services/services/hitService.ts:44-78,
  targetId >= 0xff000000; own spell hit events :241-250), with no
  archetype or Hostile check;
- the server: OnHit with a spell in hand -> ClaimCast (refusals
  E_SPELL_RANGE and E_SPELL_NO_CAST only, ActionListener.cpp:2888-2898) ->
  OnSpellHit (:3358-3403): Papyrus OnHit, EffectsOf, one explicit refusal
  for an ethereal target ("a heal from another included, for now",
  :3390-3400), then target->ApplyEffects (:3401-3402);
- MpActor::ApplyEffects (MpActor.cpp:3058-3136): a dead target returns; for
  caster != target every effect must pass EffectConditionsHold (:3084-3088;
  ADR-039: the spell's EFIT conditions plus the MGEF's own, :3003-3016; an
  unknown function refuses with E_CONDITION_UNKNOWN, :3019-3041);
  EffectFactsOf (:2436-2488) keeps ValueModifier, PeakValueModifier,
  DualValueModifier and the three State archetypes with recover,
  detrimental and no_duration (no Hostile); ResistanceFactorOf returns 1
  for a non-Hostile effect (:3376-3378); wire-rules magic.rs:168-197 signs
  the magnitude by detrimental, a Recover effect buffs, an instant or
  Stream arrival changes the value once, a timed one ticks per second;
  ApplyAttributeDeltas -> NetSetPercentages (:3423-3463) writes the record
  and sends ChangeValues to the target's game;
- the target's own game refuses the relayed copy's value effects on the
  player (remoteServer.ts:1097-1112 casts the relayed target-actor spell at
  0x14; the SP hook PlayerAddTarget, skyrim_platform/Hooks.cpp:67-168,
  refuses another actor's ValueModifier archetypes on the player), so the
  server's number is the only one.

Defects, for Healing Hands:

1. Hostility. anyEffectHeld (ActionListener.cpp:3405-3433) is set for any
   held effect, a heal included, and NotifyHostility (:3456-3461,
   :3707-3738) checks only "both players, not the same actor" before
   firing the StartCombat snippet at the victim: a heal on another player
   starts a fight. Shape: count anyEffectHeld only for effects whose MGEF
   carries Hostile or Detrimental (the read IsHostileArea already does,
   MpActor.cpp:2936-2938), and drop the ethereal exception's "for now" for
   heals in the same commit.
2. Conditions. Healing Hands' effect carries the vanilla "not undead,
   atronachs or machines" conditions; whichever functions they use must be
   in ADR-039's evaluator, or every tick is refused E_CONDITION_UNKNOWN
   (twenty-eight's log shows that path live, three 448s). Section 5 names
   them.

A Concentration beam arrives as a stream (one value change per report, the
per-hand streams of m2-visuals); the delivery needs nothing more.

## 2. A Self cast: the FireAndForget-only gate, and the crop

- The client sends every own or hosted cast (magicSyncService.ts:76-100,
  reliable :140-145; only target-location casts wait for their launch).
  The gate is Skyrim Platform's: EventHandler.cpp:1495-1512 raises
  spellCast only when the spell sits in one of the caster's four
  selectedSpells slots, so a script's Spell.Cast raises nothing
  (docs/verbs/self-cast.md:119-125). No hit is ever sent for a Self effect
  (hitService.ts:48-50 returns for a target below 0xff000000; :148 drops
  hits whose aggressor is neither 0x14 nor a figure).
- The server, when a Self cast arrives (OnSpellCast, ActionListener.cpp:
  3135-3352): a dead caster is refused, the spell must be equipped
  (:3268-3273), StartCast records it, and every accepted cast logs at info
  ("cast {:x} in hand", :3322). RunSelfSpell (:682-710) applies the
  spell's effects to the caster ONLY when delivery == Self and castType ==
  FireAndForget (:686-691), hostile area effects stripped first; a Self
  Concentration spell (vanilla Healing) returns at :688-691 and the server
  applies nothing (the TODO at :3351-3352).
- Twenty-eight's log carries no OnSpellCast line for test 2's Azure
  Reconstruction at all, and the accepted-cast line is info, so no
  SpellCast message reached the server: Skyrim Platform's slot check or a
  client handler throw. The client's log decides, and the seats rolled
  back for the after-28 probes, so the probe x-self-heal reproduces it (c2
  casts the spell on itself with the client log read through a console
  step).
- The crop (OnChangeValues, :2211-2263): a report within 5 s of a drink is
  skipped (:2221-2223); otherwise newVal = CropHealthRegeneration(...)
  (CropRegeneration.cpp:21-66): valid = old + rate% * mult% * seconds, a
  higher report is clamped to valid, written (:2259) and sent back
  reliable when it differs; the client applies it with damageActorValue
  (sync/actorvalues.ts:32-46). Reports go every 2 s
  (sendInputsService.ts:178-181), so a rise the server did not cause is
  clamped within one report. The hold of m2-snapback eef10842
  (heldPercentages; SetPercentages arms a hold for a value that rose;
  OnChangeValues asks TakeReportedPercentage first; wire-rules
  attributes.rs APPLIED_WITHIN 2e-3, HOLD_MS 10 s) protects a SERVER raise
  only; a client-only rise is still cropped, by design
  (docs/verbs/attributes.md:64-110).

Shape: widen RunSelfSpell's gate to Concentration, applied per second
across the recorded cast span (StartCast to EndCast; the Stream arrival
apply_effect already takes), with the hold merged beneath. A Self effect
the client never reports (a script's cast) goes by a settings entry in the
bonds table's shape (wire-rules bonds.rs:41-50, proc applied where "no
script does"), applied by the server as a Self effect at the cast.

## 3. The server's kill: the primitive and the table it joins

- Kill paths today: a client report of 0 Health (MpActor::SetPercentage
  :859-871, Kill(nullptr)); server damage reaching 0 (SetPercentages
  :894-903 and :962-972, Kill(aggressor)); the headshot (PartOne.cpp:
  1656-1658, target.Kill(&actor) on HeadshotCheck::Killed); the console
  (ConsoleCommands.cpp:266); the gamemode's isDead property
  (IsDeadBinding.cpp:18 -> SetIsDead :2105-2143). Papyrus Actor.Kill and
  KillSilent are missing (docs/NATIVES.md:201-202).
- MpActor::Kill (:1901-1923): SendAndSetDeathState(true, teleport) sends
  DeathStateContainerMessage (isDead, the optional teleport, the 1/1/1
  values only on respawn, :1598-1627) to the dying actor's own user and
  zeroes the three percentages in the change form; the gamemode's onDeath
  [actorId, killerId] (DeathEvent.cpp:21-39) schedules RespawnWithDelay
  (:1925-1997, GetRespawnTime, the death item); Respawn fires onRespawn
  and broadcasts isDead=false to listeners (RespawnEvent.cpp:11-32).
  Nothing broadcasts isDead=true; the other game sees the death through
  the figure's values (deathService.ts:83-95 and :141-152; the predicted
  ragdoll :102-116), as the headshot's kills show today. Running effects
  end at death (AdvanceEffects :3144-3149).
- Per-spell tables: three serde lists, each a server-settings.json key
  read in ScampServer.cpp:323-335 (castTeleports, bonds, headshot) into
  rust::Box<skymp::rules::...> in PartOne.cpp:153-166, queried by FormDesc
  (IsBondSpell :1403-1407, IsHeadshotSpell :1593-1597, TeleportReach
  :1670-1675); shapes teleports.rs:36-52, bonds.rs:41-50,
  headshots.rs:30-38, every form as "<hex>:<plugin>" (form_spec,
  teleports.rs:1-10). The headshot entry is already "a spell whose claimed
  hit the server turns into a kill" (consumed at
  ActionListener.cpp:2943-2975). No table for scripted effects and no
  ADR-029 allowlist in code (grep allowlist: wire-schema's client build
  allowlist and wire-transport's token only); the gamemode is downloaded
  at build (skymp5-functions-lib/CMakeLists.txt:4,25), not in the tree.

Shape: a fourth table in the same shape, scriptedEffects: [{spell:
"<hex>:<plugin>", kill: true}], loaded beside the other three and consulted
in OnSpellHit after the claim and EffectConditionsHold, calling
target.Kill(aggressor) as PartOne.cpp:1657 does; the client's script
blanked by ADR-044's filter (docs/research/papyrus-event-filter.md).
Finger of Death's own threshold condition rides ADR-039's evaluator if its
functions are implemented, else refuses and logs as designed; section 5
names them.

## 3b. A relaunched game's reports not taken (found in the grep, HYPOTHESIS)

numidium, 18:50, from the same window: test 2's first login after the
18:02 restart was recorded ("ActorValues: user 1 actor ff000001 recorded
164 bases, level 1", 01:02:56Z); after his 18:08 game relaunch the server
logged "ActorValues: user 1 actor ff000001 report before the login's record
was applied, not taken" at 01:08:16, 01:10:05 and 01:16:01Z and no new
"recorded" line: the relaunched game's login record never counted as
applied and its value reports were dropped for the rest of the session. A
code read of the gate and the client's record sender is in flight; the row
goes to Train-31 with a probe (relaunch c2's game with the server up, then a
drink or a hit; the log's "recorded" and "not taken" lines are the
measurement). Possibly the backsliding Eli felt on test 2's seat.

## 4. The headshot row of twenty-eight

Eli, after the report: "for the question i wasn't shooting at the player. i
was checking the marksman bug." The four OnPlayerBowShot lines with no hit
claim are that check, not a lost claim; the row was not tested by hand in
twenty-eight and stands on b-headshot (green on the stage). The next
checklist carries it again.

## 5. The records (read on sky-srv, 2026-10-20 18:40 to 18:50 PDT)

A read agent's reader over lab/esm.py's parser against the lab's own files,
/srv/persist/esm/1.6.1170/ (Apocalypse 10.2.3, sha256 3534568f... as the
dataset's SHA256SUMS line; Skyrim.esm 2bbc77fd...); layouts per libespm's
SPEL.h, Effects.cpp and CTDA.h and CommonLibSSE-NG's EffectSetting.h, names
per TESCondition.h's FunctionID. Nothing edited, no lab run.

### Azure Reconstruction, SPEL 03088694 (local 088694; 0x1A088694 under the lab's order)

- SPIT: cost 3, Concentration, delivery TargetActor, range 200, charge
  0.5 s, flags IgnoreResistance + NoAbsorb/Reflect, half-cost perk
  ConjurationNovice00.
- One effect, MGEF 03126DA1 "Azure Reconstruction", DNAM "Heal a conjured
  minion <mag> points per second.": ValueModifier Health, magnitude 10,
  FXPersist + PowerAffectsMagnitude (not Hostile, not Detrimental);
  keywords MagicRestoreHealth, WB_Conjuration; VMAD the vanilla
  SayOnHitByMagicEffectScript.
- MGEF conditions: IsCommandedActor (700) == 1 AND GetActorValuePercent
  (640) Health < 1, both on the Subject.
- Reading: a minion heal. Cast at a player, the caster's own engine refuses
  the effect (IsCommandedActor is false for a player), so no
  magicEffectApply, no OnHit, nothing at the server; by the record no
  player is healed by it, as Eli said. Nothing to build. The evaluator
  learns 700 (false for a player) and 640 (current over maximum from the
  server's values) so a stray claim refuses by evaluation rather than
  E_CONDITION_UNKNOWN. The first read's "allowlisted self-heal" was my
  misreading of this record; docs/research/apocalypse/train-27-spells.md
  section 4 had the conditions right (one correction there: SPIT carries
  IgnoreResistance too).

### Healing Hands, SPEL 0004D3F2 HealingHands (Skyrim.esm; FULL is an lstring, no STRINGS file under persist)

- SPIT: cost 25, Concentration, delivery TargetActor, half-cost perk
  RestorationApprentice25.
- Effect 1, MGEF 0001CEA5 RestoreHealthConcActor: ValueModifier Health,
  magnitude 10, duration 1, FXPersist + PowerAffectsMagnitude; conditions
  HasKeyword (560) ActorTypeDwarven != 1, HasKeyword ActorTypeDaedra != 1,
  HasKeyword ActorTypeUndead != 1, IsUndead (715) == 0, all AND on the
  Subject.
- Effect 2, MGEF 0004E93E PerkRestoreStaminaConcActor: ValueModifier
  Stamina 10, HideInUI; an EFIT condition HasPerk (448) Respite (000581F9)
  == 1 run on the player reference; MGEF conditions Daedra, Undead and
  IsUndead as above.
- Reading: the server applies effect 1 to another player already
  (measured on the lab, docs/verbs/magic-effects.md:563, 0.51 to 0.77)
  once 560 and 715 evaluate; effect 2 refuses E_CONDITION_UNKNOWN today
  (448), the same outcome as the record's for a player without Respite.
  The row's three parts: hostility (a held heal must not start a fight),
  the snap-back hold beneath the server's raise (a 2 s report carrying the
  old value undoes a server raise in the current build), and 560 and 715
  confirmed in the evaluator (were 560 unknown, every tick would refuse).
  numidium's grep of twenty-eight's log (18:50): not one line for 4d3f2,
  1cea5, 4e93e, 12fcc or 12fcd, so no Healing Hands and no Healing was
  cast; the three E_CONDITION_UNKNOWN 448s are perk-gated extras of
  1a02e634 (effects 153d3, f3932, 01:07:20Z) and 1a002878 (effect
  1a100ba6, 01:16:39Z), cast by ff000000 at ff000001, refused by design;
  every OnSpellHit on ff000001 in the window is test 1's (1a02e634 four
  times, 1a031c4d, 1a002878, and Finger of Death 1a035452 at 01:17:08Z),
  none a heal. So what test 2 saw was Azure Reconstruction doing nothing,
  the record's own answer, and no regeneration under Survival. The heal
  row stands on the measured defects alone, not on twenty-eight.

### Finger of Death, SPEL 03035452 (local 035452) WB_Res_Necro3_Spell_FingerOfDeath

- SPIT: cost 160, FireAndForget, delivery TargetActor, range 1500, flags
  IgnoreResistance + NoDualCastMods, half-cost perk RestorationAdept50.
- One effect, MGEF 03035450: archetype Script, no actor value, Hostile +
  Detrimental + NoDuration + NoMagnitude + NoArea + NoRecast; keywords
  WISpellDangerous, WB_Restoration_Keyword_IsInstakillSpell,
  WB_Restoration; DNAM "Blast of death magic that damages a living target
  equal to its Health but the caster takes <Global=...Percentage>% damage.
  If this would kill the caster, damage to the target is reduced."
- MGEF conditions, seven, all AND on the Subject: IsActor (353) == 1,
  GetDead (46) == 0, HasKeyword (560) ActorTypeDwarven == 0, HasKeyword
  ActorTypeUndead == 0, IsUndead (715) == 0, HasKeyword MagicNoDisintegrate
  == 0, IsEssential (354) == 0 (354 is the evaluator's since train-29).
- The script, WB_FingerOfDeath_Script.OnEffectStart(akTarget, akCaster),
  disassembled from the mod's BSA with lab/pex.py (no source shipped);
  properties from the VMAD: Percentage GLOB 0301E196 = 125, the XP globals
  0.75 and 1.0, AshPileObject DefaultAshPile1, the immunity list FLST
  000F6534 (11 races: witchlights, wisps, magic anomalies, ice wraiths,
  dragon priests, the three atronachs, Alduin, dragons):
  1. TargetHealth = the target's Health; if WB_IsResist (a script default
     absent from the VMAD, HYPOTHESIS until read from the pex's variable
     table or measured against a resistant target): TargetHealth *= 100 /
     (100 - the target's MagicResist).
  2. SelfDamage = TargetHealth * 125 / 100.
  3. If SelfDamage < the caster's Health - 1, the kill branch: the target's
     Health damaged by TargetHealth, the caster's by SelfDamage,
     akTarget.Kill(akCaster), the message, screen blood, then the
     disintegration (SetCriticalStage, the shader, AttachAshPile after
     1.25 s, SetAlpha 0 after 1.65 s) unless the target's race is in the
     immunity list.
  4. Else, the fail branch: the caster damaged by its Health - 1 (to 1),
     the target by (caster's Health - 1) * 0.8; no kill, no pile.
  5. Both branches: Restoration advanced for a player caster.
- Reading: the kill is arithmetic on two Health values and one global,
  then Kill. The server computes it (R0) from the claimed hit once the
  seven conditions hold: a wire-rules function (target health, caster
  health, percentage) -> (target delta, caster delta, kill), T0-tested
  against both branches; the C++ side joins the headshot table's shape
  (scriptedEffects: spell, kill: true, consulted in OnSpellHit after the
  claim and EffectConditionsHold) and calls Kill(aggressor) as the headshot
  does. The caster's game keeps the script's visuals: its DamageActorValue
  on players yields to the server's numbers already (ADR-028, the dent
  gate), and its Kill on the figure is what put the ash pile on test 1's
  screen; the victim's game gets the death from the server, so both games
  agree. HYPOTHESIS tags for the row: WB_IsResist's default, and the
  figure's local kill racing the server's verdict when the server's
  branch differs (an essential or resistant target).

## 6. The spell flights read (2026-10-20 19:35 PDT)

A read agent over the fork and sky-srv's results. The arrow shape: the
shooter's client keeps the engine's launch (origin) and the arrow's first
flight update (angles after the engine's auto-aim) and sends both with the
shot (playerBowShotService.ts:102-157); the wire carries them in
PlayerBowShot and the relay ArrowShot (wire-schema skymp.rs:737-818;
validator wire-validate lib.rs:290-316); the server refuses an origin over
512 units from its shooter (ActionListener.cpp:2046-2056) and relays; the
observer's client launches the figure's arrow from them
(arrowSyncService.ts:49-62, TESModPlatform.LaunchArrowAt,
PapyrusTESModPlatform.cpp:1083-1113). The spell side carried the same five
fields in SpellCastData (skymp.rs:907-951) and checked them the same way,
but magicSyncService.ts:94 filled them for a target-location cast only, and
MagicApi.cpp:270-282 read them only under `delivery == kTargetLocation`;
for Firebolt the figure's bolt left the figure's magic node
(MagicApi.cpp:257-266) along the relayed aim. No run had spell flights rows:
m2-train30-flights 951b5bbc had never been staged (PLAN and LOG called it
BUILT on its branch). The Launch-entry rows both seats record did measure
the gap: b-hailstone 20261021-005051 (green) and -004204, four casts, the
caster's own launch origin against the figure's in the observer's game 64.4,
67.4, 66.9 and 67.7 units apart (about 50 to 59 behind the aim, 25 to 30
right, 19 to 28 below), angles 0.00 degrees apart in every pair (the lab
sets the aim; a human's pitch and any first-update re-aim are on top,
unmeasured). The control: b-arrow-path 20261020-225948, ten of ten flights
paired at 0.00 units and 0.00 degrees. Steps/artifacts under
/srv/lab/results/20261021-005051-b-hailstone/steps/021-c1-watch-stop.json
and 022-c2-watch-stop.json (cast 1), 032 and 033 (cast 2). The row's build
is in docs/verbs/spell-cast.md ("A spell projectile flies the arrow's way").

The row's first probe (b-spell-aim 20261021-042101 on the tonight stage of
3b579f41, red at "position" 34.49, "angle" 0.0; both watch-stops read): the
figure's ten Firebolts launched from the caster's recorded origin exactly
(launch gap 0.00 in every pair) with the same angles, so the fix moved the
origin as meant. What remains is the caster's own game: its bolt sits 2.46
to 3.66 units from the Launch call's origin at its first update in first
person (mostly up: the direction (-0.19, 0.17, 0.97)), 30.5 to 34.5 units
in third person after the view toggle (right and forward, (0.65, -0.76,
0.0)), 10.8 on the last cast, while the figure's bolt sits on its origin
(travel 0.00), and an arrow sits on its origin in both games (b-arrow-path's
0.00). So the cast should carry the bolt's first-update position as the
origin when the flight was seen (the bow rule took the launch's origin and
the flight's angles; for arrows the two origins never differ): one client
line on m2-train-31 (the commit after 3b579f41, magicSyncService.ts), for
the morning's stage; b-spell-aim stays pending on it. HYPOTHESIS: why the
caster's bolt moves between Launch and its first update (the hand's sweep
during the release in third person reads right for 30 units; the 2.5 units
up in first person may be the camera's bob), unmeasured.

## 7. Survival Mode's need globals (2026-10-20 19:45 PDT)

A read agent over /srv/persist/esm/1.6.1170/ccQDRSSE001-SurvivalMode.esl
(61 GLOBs) and the 38 scripts of its archive, disassembled with lab/pex.py.
The live amounts are globals, not script state: Survival_HungerNeedValue
0x81A (145), Survival_ColdNeedValue 0x81B (55),
Survival_ExhaustionNeedValue 0x816 (140), none constant, bound as each need
quest's NeedValue and written every tick by Survival_NeedBase.IncrementNeed
and DecrementNeed (NeedValue.SetValue); the maxima (0x80C, 0x84B, 0x84A:
1000, 1000, 960), rates and intervals are constants; the stage is a script
variable recomputed each tick from the value against literal thresholds
(hunger 80/160/340/520/770, cold 50/120/300/500/800, exhaustion
80/160/340/560/800) and expressed as the stage spell on the player; the
HUD's percent globals (Update.esm 0x2EDE to 0x2EE0) and the temperature
level (0x2EDD) are recomputed from it. Two message timers (0x821, 0x812) and
three help-shown flags (0x8E0 to 0x8E2) are ordinary non-constant globals
the server could keep but need not. Consequence: three playerGlobals
entries (docs/verbs/player-globals.md, "Survival's needs"); HYPOTHESIS: the
restore must land before the toggle starts the need quests.

## 8. The saved world's format, for the repair tool (2026-10-20 19:55 PDT)

A read agent over the fork (file driver: `<world>/changeForms/<desc>.json`
plus `load-order.json`, FileDatabase.cpp:16-48, 107-170; FormDesc.cpp:6-46,
141-172: the server numbers plugins in list order, full and light apart;
RecordReader.cpp:25-65: a record below formVersion 2 is re-based from the
saved order, or the running one when none is saved; MpChangeForms.cpp: on
write a form no plugin of the order holds is DROPPED with an error, a learned
spell at :301-304, an inventory entry at :94-97, a head part at :235-238),
the lab's world tooling (lab-api runner.py:456-495 restore, slots.py,
load-order-check.py's own-record idiom, the fixture
lab/fixtures/worlds/adr043-preslice-25) and sky-srv's snapshots (33; only the
two playtest-m2-28 copies carry a load-order.json; every earlier one is raw).
The 28 copies' exact difference: one learnedSpells entry, "a86df:Cloaks.esp",
gone from profile 1.json. The own-record check over all 226 FormDescs of the
28 world: nine real misses, all in 1.json's learnedSpells, and all of one
kind: forms written under main's 17-plugin order (slot 0B LostGrimoire, 0C
Apocalypse) and re-based by the migration under the layer's 91-plugin order
(0B Cloaks.esp, 0C Cloaks - Dawnguard.esp): the removed entry was test 2's
Teleportation (LostGrimoire 0xA86DF), the other eight ("Cloaks -
Dawnguard.esp" 186d, aae8, 1f1fb, 24e49, 2e634, 5ecee, 83a22, 88694) are
Apocalypse's spells, dropped by the server at the record's next write.
Twenty-seven's raw 1.json indeed mixes the orders (learnedSpells top bytes
00, 0C, 0B and 1A). The tool, lab/tools/world-repair.py: verdicts OK,
DANGLING-PLUGIN, DANGLING-FORM, MISBASED (one candidate order's plugin holds
the recomposed id), AMBIGUOUS; a repaired copy under --out, never in place;
--drop-unfixable --no-rebase reproduces the hand clean; raw records written
as formVersion 2 with the target load-order.json. It runs on sky-srv beside
the plugins, as load-order-check.py does.

Run (numidium, 2026-10-20 20:17 PDT, sky-srv): on the raw
playtest-m2-28-20261021T012414Z with its own 91-file order and main's
17-file settings as the candidate, records from the 93 plugins under
/srv/persist/esm/1.6.1170: "verdicts: OK 222, MISBASED 9", all nine in
1.json's learnedSpells and all named: a86df:Cloaks.esp is LostGrimoire's
GRIM_SPELL_ALT50_Teleportation; the eight Cloaks - Dawnguard.esp entries
are Apocalypse's ShockNova (186d), Ghostwalk (aae8), Decompose (1f1fb),
Scattershock_NPC (24e49), Hailstone_NPC (2e634), Battletide (5ecee),
StaticDome (83a22) and AzureReconstruction (88694). The tool refuses an
--out under /srv/lab/snapshots by its own rule, so the copy was written
under /srv/lab/handover/world-repair/ and placed as
/srv/lab/snapshots/playtest-m2-28-repaired-20261021T031739Z the way
playtest-world.sh saves one (8 records, 1 changed; 1.json's learnedSpells
14, the four re-taught copies merged, five spells back to test 2). It is
twenty-nine's world (lab/playtests/29.yaml, main 38bef46); the hand-cleaned
copy stays unused.

## 9. Tonight's stage probes (2026-10-20, 21:10 to 21:35 PDT)

The stage of 3b579f41 over the staged layer (stage-layer-train31-tonight
0e69f61, numidium): smoke 20261021-040923 green; b-relaunch-reports 041549
green (the early report refused with its base named, the echo taken 0.1 s
later, the One-Handed set after the first relaunch surviving the second);
b-heal-other 041155 red on its own precondition (c2's regeneration over
seven seconds, 0.5277; fixed main d16f7e7), then 042404 GREEN; b-fod-kill
041407 red on my decimal id (fixed d1f25e0), then 042635 red on one
assertion of six: the kill branch killed c2 by c1's hand and the fail branch
read right (c1 0.0162, c2 0.215, alive), but c1's Health read 0.0 after the
kill: server.log 04:28:33.303 "EvaluateDeathItem ff000000", the caster died
114 ms after its target. The server took the caster's 64.4 and the caster's
own game ran the mod's script, which took 64.4 again and reported 0; a
report of 0 kills (MpActor::SetPercentage). The fail branch hid the same
stacking at the one-point floor. Fix, fork m2-train-31 9ad635cd: the
caster's share is its own game's (the script runs there and reports the
fall, as every self-inflicted script damage is taken, ADR-029's default),
the server keeps the target's death and pays the caster only for an actor
no game plays; the scenario is unchanged (c1's 0.36 comes from its report);
the unit test's caster stays whole. b-spell-aim 042101 red, read in section
6 (the figure launched from the recorded origin exactly; the caster's own
bolt moves before its first update; fix b5075e04 for the morning).

Found at the setup (numidium, 21:31): test 1's Magicka read 120 after the
setup's SetAV 400; a second set held. The log: the set landed between the
server's login send and the client's echo of the applied record, and the
echo, carrying the record's old 120, was taken ("recorded 164 bases" at
04:30:05.171 and .565), so a server raise made in that window is lost to
the echo. HYPOTHESIS for a Train-31 row: a held server set must outrank the
echo (the hold's merge keeps a held value the report does not carry; the
read says which side dropped it: the client applying the record's 120 over
the set's 400 before echoing, or the hold not armed by the setup's path).
Setup's workaround: set the values after the echo.

Found during twenty-nine (Eli, 21:38): Become Ethereal on the other screen
shows the wisps and not the translucency ("player two has whisps but never
actually goes transparent"), so of the two visible effects of the shout only
one reaches the figure. A row for the next train (PLAN); the record read of
the word's spell 0x5F6EB and its effects decides whether a second MGEF or
shader is missing from the relay or the Etherealize archetype's translucency
is applied by a path the figure's cast misses.

## 10. Playtest twenty-nine's report (2026-10-20 22:33 PDT)

Eli's ticks: every item but three marked "[?]". Section 1: Healing Hands
heals and starts no fight; the self heal holds; Finger of Death's two
branches (the note "dies on both, only ash on player 1's screen" under the
fail branch describes the kill branch: test 2 dead in both games, the
disintegration only on the caster's screen); the relaunch row "unsure what
this is testing" (proven by b-relaunch-reports 041549 and the live 22:12
relaunch: numidium read the reports taken at once); the bolts land alike
("projectiles work great") but "the fire stream doesnt hit the same spot
for flames". Section 2 all ticked, the MCM's eleven entries listed. Section
3 all ticked. Section 4: Prepare for Adventure "[?]" ("the first cast i had
things in my inventory, then they vanished, then they wouldn't come back
2nd time i cast"), Thoughtsteal or Inferno ticked ("you said it should
refuse, but it worked just fine"), Sealed Resolve "[?]" ("hard to tell
visually as the perk only lasts 15 seconds, take a look at the logs").
Section 5 empty. Log reads asked of numidium: Sealed Resolve's lines, the
granted spell's equip and the spell-list sync, Prepare for Adventure's
inventory lines, the kill branch's deaths. Rows: PLAN, "the rows after
twenty-nine".

The four reads (numidium, 22:50, /srv/lab/handover/pt29-server.log, 854
lines from 05:02:10Z):
1. Sealed Resolve 0x1A01FCCA: one self cast ("casts 1a01fcca on itself: its
   effects run on the server", 05:31:24.717), no hit, no refusal, no
   condition line: as designed for the perk-driven class (the server
   applies the self cast's value effects, none here, and the perk is the
   caster's game's). Test 1 then died at 05:31:40 to seven Hailstone hits
   from test 2 in god mode (each "effect 1a0b2c7f ... conditions fail",
   the other effect's damage landing), which is what hid the perk's 15 s.
2. Thoughtsteal 0x1A00BB22 hit ff000001 twice (05:29:50, 05:30:28); the
   first hit "E_CONDITION_UNKNOWN: function ? (570) on effect 1a00bb1e ...
   refused (ADR-039)", the second at debug. Inferno was never cast. NO
   granted spell reached the server: every spell ff000000 cast in the log
   is on 29's list, "not found in equipment" appears nowhere, no
   learned-spell line in play. So the granted spell ran in test 1's own
   game only; "it worked just fine" is that screen. Row: the grants class
   needs the granted spell to reach the server when granted (the spell-list
   sync teaches it only at a login); the census tag "the server refuses its
   equip" is wrong on the mechanism: the cast is never sent.
3. Prepare for Adventure 0x1A007FFD: two self casts (05:25:24, 05:25:56).
   Ten seconds after the first, "OnUpdateEquipment ff000000 - rejected
   equipment update: inventory does not contain item 1a0dd9db" and
   "unequipping item 1a0dd9db (not in current equipment, unauthorized
   change)", then the same for 1a0dd9d9; no AddItem line for ff000000
   anywhere; nothing after the second cast. Eli's "vanished, then wouldn't
   come back": the script's AddItem runs in his game, the server's R0
   inventory never holds the items, so equipping them is refused and
   undone. Row: the server gives the spell's items, in scriptedEffects'
   shape (an entry naming the items the spell grants).
4. Finger of Death: the caster fix holds live. Cast 1 (05:08:26): "the
   target loses 79.2, the caster 99.0 in its own game, reported; nobody
   dies". Cast 2 (05:10:47): "the target dies by the caster's hand",
   "EvaluateDeathItem ff000001", a respawn 25 s later; no death line for
   ff000000 near either. "Dies on both" is the target's death on both
   screens; "ash only on player 1's screen" is the disintegration not
   played in the victim's own game: the visual relay row.
