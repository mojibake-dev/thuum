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

## 4. The headshot row of twenty-eight

Eli, after the report: "for the question i wasn't shooting at the player. i
was checking the marksman bug." The four OnPlayerBowShot lines with no hit
claim are that check, not a lost claim; the row was not tested by hand in
twenty-eight and stands on b-headshot (green on the stage). The next
checklist carries it again.

## 5. The records (pending the read)

Azure Reconstruction (Apocalypse local 088694), Healing Hands and Finger of
Death: SPIT, effects, conditions, scripts.
