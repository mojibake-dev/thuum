# Verb: magic-effects

## Intent

The server runs magic effects: a potion's, a poison's or a spell's effects
act on their target by the magnitude and the duration their records give,
last through a restart with their remaining time, and show on every screen,
including to a player who arrives while they run.

Roadmap reference: skymp/ROADMAP.md "Magic effects" ("The use of the potion
should impose a magical effect, and not instantly change health parameters
... Even if the moment of applying the magic effect on another player was
not visible, when you enter the visibility zone, you should see the effect
of the shader. The most popular effect archetypes should be implemented
(with which we attack and heal)").
Milestone: M2 (docs/PLAN.md, the M2 chart's third verb)   Class: B

## Authority

Rung: R0. The server applies every effect from the records and owns its
result: the current values it sends (ChangeValues), the maximum a peak
modifier raises, the effect set and its remaining time, and the poison on a
weapon with its charges.
Why this rung and not the one above it: R0 is the top. ADR-028 (accepted,
Eli 2026-10-09) puts here all damage one actor deals another and potions'
effects; the world's damage (falls, traps) stays each game's own (R2).
What the server takes from clients: nothing new. Every effect starts from a
message the server already judges: a drink or a poison (OnEquip, the item
in the server's inventory; sendInputsService.ts:54-76), a spell's hit
(spell-cast's claim, docs/verbs/spell-cast.md), a weapon's hit (melee's and
marksman's rules). Magnitudes, durations and archetypes come only from the
records.
Rate limit / bounds: at most 32 effects running on an actor (an engine's
potion chugging stays inside it; a new one past the bound replaces the
oldest of its kind); OnEquip gets a budget (it had none, wire-validate),
sixteen at once and eight a second after, since every equip goes through
it (an outfit, a hotkey chug) and a refusal leaves a drink unconsumed
(HYPOTHESIS until the lab drinks a row of potions quickly).

## Engine surface

- The effect record in memory: EffectSetting's EffectSettingData
  (CommonLibSSE-NG include/RE/E/EffectSetting.h:42-116): flags (:45-66:
  kHostile, kRecover, kDetrimental, kNoDuration, kFXPersist, kPainless),
  resistVariable (:73), taperWeight (:78), effectShader (:80),
  taperCurve and taperDuration (:85-86), secondAVWeight (:87), archetype
  (:88), primaryAV (:89), secondaryAV (:94), hitEffectArt (:96),
  hitVisuals and enchantVisuals (:104-105).
- The effect record on disk, which the server reads: MGEF DATA, 152 bytes
  (UESP, "Skyrim Mod:Mod File Format/MGEF"): flags 0x00, taper weight 0x1C,
  hit shader 0x20, taper curve 0x34, taper duration 0x38, second AV weight
  0x3C, archetype 0x40, primary AV 0x44, projectile 0x48, second AV 0x58,
  casting art 0x5C, hit effect art 0x60, impact data 0x64; SNDD, up to six
  (type, sound) pairs, type 5 the hit sound. Checked against the masters
  (2026-10-10, lab/esm.py's walker on sky-srv): FireDamageFFAimed 0x12F03
  hit shader FireFXShader (EFSH 0x1B212), taper 0.30, curve 2, 1 s;
  AlchRestoreHealth 0x3EB15 archetype 0 (value modifier), Health, flags
  0x200a00 (NoDuration), shader HealFXS 0x12FD9, art HealTargetFX 0x3F1B4,
  hit sound MAGRestorationFirePotion 0xCD671; AlchFortifyHealth 0x3EAF3
  archetype 34 (peak value modifier), flags 0x200802 (Recover);
  AlchDamageHealth 0x3EB42 and AlchDamageHealthDuration 0x10AA4A archetype
  0, flags 0x200805 (hostile, detrimental, a duration), shader
  ChaurusPoisonFXShader 0x10CC64; ShockDamageConcAimed 0x13CAB and
  FrostDamageConcAimed 0x13CAA archetype 5 (dual value modifier), Health
  and Magicka, Health and Stamina, each second value's weight (0x3C) 1.0,
  as UESP's Sparks page has it ("8 points of shock damage to Health and
  Magicka per second", en.uesp.net/wiki/Skyrim:Sparks); AlchParalysis
  0x73F30 archetype 21. The
  words at 0x78 and 0x7C (UESP's NullData; CommonLib's hit and enchant
  visuals sit there in memory) are 0 in every one of these. libespm reads
  the flags, the archetype, the primary actor value and, since spell-cast,
  the projectile (libespm MGEF.h, MGEF.cpp:8-33).
- What the archetypes do, per the Creation Kit wiki's "Magic Effect" page
  (ck.uesp.net/wiki/Magic_Effect; the site answers our fetches with 403,
  so the words are its own as a search quoted them, 2026-10-10): with
  Recover set, value and peak value modifiers "modify their actor value
  once at the start, then modify it back once the Effect expires"; without
  it "the actor value will get modified every second and will not be reset
  at the end"; for Health and Magicka a Recover effect changes the maximum
  and the current value (a buff), otherwise only the current one (a heal or
  damage); taper does not apply to Recover effects. HYPOTHESIS until the
  lab measures the engine's own application (Dynamic plan): the per-second
  steps of a duration effect, and the taper, whose formula the page's
  quoted lines do not give.
- A running effect: ActiveEffect (include/RE/A/ActiveEffect.h:26): caster
  (:100), spell (:102), effect (:103), target (:104), elapsedSeconds
  (:108), duration (:109), magnitude (:110). An actor's effects:
  MagicTarget (include/RE/M/MagicTarget.h): AddTarget (:78),
  GetActiveEffectList (:84), DispelEffect (:90), HasMagicEffect (:94).
- A drink: Actor::DrinkPotion (include/RE/A/Actor.h:469). A poison on a
  weapon: ExtraPoison (include/RE/E/ExtraPoison.h:18, the poison and its
  count), which skymp5-client already copies into inventory entries and
  back (sync/inventory.ts:173-174, :443-444; the server's Inventory entry
  has poisonId and poisonCount, Inventory.h:44-58, and wire-schema's Entry
  the same, skymp.rs:117-120), though the server never reads them.
- Visuals without simulation: TESObjectREFR::ApplyEffectShader and
  ApplyArtObject, each with a duration (include/RE/T/TESObjectREFR.h:368-
  369); Papyrus EffectShader.Play and VisualEffect.Play, bound by Skyrim
  Platform (skyrimPlatform typings 2.9.0: EffectShader.play(ref, seconds),
  VisualEffect.play(ref, seconds, facing)). The hit art is an ARTO, which
  no Papyrus call plays; ApplyArtObject does.
- The server today (fork m2-spell 45839102): ActiveMagicEffectsMap, one
  effect per actor value (ActiveMagicEffectsMap.h:9-37), persisted in the
  change form (MpChangeForms.h:90). A drink goes OnEquip (MpActor.cpp:520-
  590) to EatItem and EatItemEvent::OnFireSuccess, which applies an ALCH's
  effects through ApplyMagicEffect (MpActor.cpp:2163-2278): Health,
  Magicka and Stamina restored at once whatever the duration (times 100
  with SweetPie.esp), regeneration rates and multipliers set for the
  duration (multipliers "4x higher", a patch), everything else dropped;
  an ingredient's effects are commented out; a poison is drunk like a
  potion, its damage restored to the drinker as a heal (the magnitude's
  sign is not read). After a server restore the actor's ChangeValues are
  ignored for a while (MpActor::ShouldSkipRestoration, MpActor.cpp:121).
  Every other listener is told to EquipItem the drink on the drinker's
  figure (MpActor.cpp:566-583), so observers' engines show it.
  ActionListener::OnSpellHit counts a spell's Health effects only (the TES5
  formula, formulas/TES5DamageFormula.cpp), so shock's Magicka and frost's
  Stamina damage are lost. No ActiveMagicEffect (49) or MagicEffect (44)
  native is registered (docs/NATIVES.md).
- The client today: a drink reaches the server as OnEquip, unreliable
  (sendInputsService.ts:72-75): a lost one leaves a potion drunk in the
  player's game that the server never consumed.

## Observe (host or acting client sees the intent before the engine acts)

- Hook point: none new. A drink or a poison is Skyrim Platform's `equip`
  on the player (sendInputsService.ts:54-76), sent reliably from now on;
  spell and weapon hits as their verbs send them.
- SP filter: as now (the player's own equips).
- Data captured: the item's form id.
- Side effects of hooking here: none (the event is read, nothing blocked).

## Impose (observers render the server's decision)

- Mechanism: the current values as now (ChangeValues, remoteServer.ts:
  828-850), and a new message, MagicEffects, the actor's running effects
  with their remaining seconds, sent to the actor's owner and its
  listeners whenever the set changes, and in full when a listener first
  sees the actor. Each client shows each effect on that actor in its game
  (the player or a figure): the effect's hit shader through
  ApplyEffectShader and its hit art through ApplyArtObject (one new client
  native, TESModPlatform.ApplyEffectVisuals, R3) for the remaining
  seconds, and the hit sound once at the start. A game skips the effects
  its own engine already shows: the drinker's own potion.
- Visual without simulation achieved by: shaders and art only; no
  ActiveEffect is made in any game for a server effect, so nothing there
  changes a value.
- The drinker's figure stops being told to EquipItem the drink
  (MpActor.cpp:566-583): MagicEffects shows it instead, one path for every
  effect, and a poison is no longer "drunk" on observers' figures.
- Side effects: HYPOTHESIS (whether ApplyEffectShader on a figure looks
  like the engine's own hit shader; the lab compares the two screenshots).

## Suppress (engine's own behavior blocked on non-hosts)

- What is suppressed: nothing new by default. The drinker's own engine
  still applies its drink (Actor::DrinkPotion), which keeps the game's own
  menu entry, sounds and shader; the server applies the same effect and its
  ChangeValues are the number. HYPOTHESIS: for vanilla potions the two
  agree (no perk changes a drink's magnitude once made); the lab compares
  the drinker's own health timeline with the server's (Dynamic plan). If
  they diverge, the drink is kept out by a hook on Actor::DrinkPotion for
  the player (the item consumed, its effects not applied), which this doc
  then gains as its suppression.
- A remote spell's effects land nothing on the player it targets (spell-
  cast, MEASURED), so the server's effects are the target's only ones.
- How: none.
- Release condition: none.
- Side effects: HYPOTHESIS (above).

## Message contract

- MagicEffects, MsgType 43 (the next after ArrowShot's 42), server to
  client only, reliable. Fields: idx (the actor's form index), effects (at
  most 32): effect (u32, the MGEF form id), source (u32, the potion,
  poison, spell or enchantment), magnitude (f32, finite), remaining (f32,
  seconds, 0 to 86400, finite; 0 for an effect without duration, shown
  once).
- Validator rules: a client never sends it (wire-validate refuses it from
  a client, as other server-only messages); every float finite; at most 32
  entries. OnEquip gains the budget above.
- Idempotency / ordering: idempotent (each message replaces the actor's
  set); ordered on the reliable channel.
- Contract doc updated: in the same commit as the validator.

## Server

- Where the logic lives: a Rust rule (wire-rules magic.rs, ADR-010 and
  ADR-020): an actor's running effects as pure state over time. Applying a
  source's effects with a scale (1 for a drink, a claim's factor for a
  spell hit) yields the instant deltas (a NoDuration value modifier: its
  magnitude once) and the running entries; a tick yields each entry's
  deltas since the last (a value modifier without Recover: its magnitude
  each second of its duration; with Recover: once at the start and back at
  the end; a peak value modifier: the maximum and the current value
  together; a dual value modifier: the second value at the second AV
  weight) and the expired entries; the 32 bound. Bridged as the casts rule
  is. The C++ core reads the facts from the records (libespm MGEF gains the
  second AV 0x58, its weight 0x3C, the taper 0x1C, 0x34 and 0x38, the hit
  shader 0x20 and art 0x60; ALCH's poison flag, ENIT 0x20000, which
  libespm already reads as isPoison, ALCH.cpp:22, and every Damage Health
  poison in the masters carries), runs the rule on
  the world's timer, applies its deltas to the actor's values and sends
  ChangeValues and MagicEffects.
- The sources: OnEquip of a potion applies its effects (no more EatItem's
  instant restore); of a poison, puts it on the weapon in the right hand
  (poisonId and a poisonCount of 1, HYPOTHESIS: the hand and the count
  without perks, measured) and sends the owner its inventory so its game's
  ExtraPoison agrees; a weapon hit with a poisoned weapon applies the
  poison's effects to the target and spends a charge; a spell hit applies
  the spell's effects through the rule at the claim's scale (spell-cast's
  Health damage moves into it, and the dual and duration effects join).
- Taper: not counted until the lab measures the engine's (HYPOTHESIS
  above); Firebolt's records give it 0.30 for 1 s at curve 2.
- DB fields / migration: the change form's activeMagicEffects becomes a
  list of running effects (effect, source, magnitude, remaining seconds,
  the caster); a migration reads the legacy per-AV form on load (its
  regeneration entries with their end times) into the list (rule 6), and
  b-magic-restart is the restart scenario.
- Restart behavior: each effect resumes with its remaining time, counted
  in server time (the legacy map re-armed its timers on load,
  MpActor::ReapplyMagicEffects, MpActor.cpp:2318-2331).
- Papyrus natives touched: none in this verb's first slice; the
  ActiveMagicEffect and MagicEffect natives stay missing until a script
  the server runs needs one, each then with its ledger line.
- Scope of the first slice: value modifiers, peak value modifiers and dual
  value modifiers on any actor value the server records (actor-values),
  which covers healing, damage, fortify and the destruction schools'
  second values. Paralysis, invisibility, calm and fear, cloaks, summons
  and scripted effects are later slices, each a verb of its own when a
  playtest or a mod needs it.

## Client

- SP binding: TESModPlatform.ApplyEffectVisuals(actor, effect, seconds)
  (new, client only, R3: the effect's hit shader and hit art through
  TESObjectREFR::ApplyEffectShader and ApplyArtObject; a ledger line).
- TS handler: magicEffectsService.ts (MagicEffects to visuals, skipping the
  player's own drinks); sendInputsService.ts OnEquip reliable.
- Kill switch config key: `magicEffects` under skymp5-client's settings.

## Tests

- T0: wire-rules magic (an instant restore; damage each second over a
  duration; a Recover peak modifier raising the maximum and giving it back;
  a dual modifier at its weight; expiry; the 32 bound; a persisted list and
  the legacy form migrated); wire-validate (MagicEffects refused from a
  client; OnEquip's budget); the server (a potion applies by its records,
  not at once; a poison goes on the weapon, not into the drinker; a
  poisoned hit applies the poison and spends its charge; a spell's dual
  effect; effects resume after a reload of the change form).
- T1: none.
- T2: a difftest session, a drink, a poison applied and a poisoned hit:
  the legacy server restores at once, drinks the poison and ignores the
  weapon's; declared.
- T3 scenario id: lab/scenarios/b-potion.yaml: c1, hurt, drinks a Potion
  of Minor Healing (RestoreHealth01 0x3EADD: 25 at once) and a Fortify
  Health (FortifyHealth01 0x3EAF2: 20 for 60 s): its health and maximum on
  the server and in its game agree, and c2 sees the shader on c1's figure;
  c1 puts a lingering poison on its weapon (DB03Poison 0x58CFB: 6 a second
  for 10 s) and hits c2: c2 loses the hit and then 60 over ten seconds,
  both sides agreeing, the poison's shader on c2 on both screens, the
  charge spent. lab/scenarios/b-magic-restart.yaml (M2's exit): a running
  Fortify Health and a lingering poison survive a server restart with
  their remaining time, on the server and in both games.
- Assertions that would fail if the verb silently regressed: the health
  steps of the poison over time on both sides; the fortified maximum and
  its return at the end; the charge's spending; the remaining time after
  the restart.

## Dynamic plan (fill when any tag above is still HYPOTHESIS)

- x-potion-probe: c1 drinks a Potion of Minor Healing at half health, a
  Fortify Health, then a lingering poison on itself by console
  (player.cast is not the path; the drink is), each under the driver's
  watch: c1's own health and magicka timelines (the engine's application:
  per-second steps, the Recover maximum and its revert), the server's
  numbers read after each, c2's screenshot of c1's figure.
- x-poison-probe: c1 applies DB03Poison to its weapon; its inventory dump
  (which hand, what count); c1 hits c2; c1's watch of c2's figure (the
  engine's poison on the figure in c1's game, per frame). First run,
  20261010-135426 (parity 45839102): Papyrus EquipItem of a poison on the
  player opens the game's own box, "Do you want to poison the Steel
  Sword?" (screenshot 027), which no lab input answers (as the race menu's
  finish box, docs/verbs/character-creation.md), and the open box took the
  swing: no poison applied, no hit, nothing measured. Blocked on in-game
  behavior (CLAUDE.md rule 8): handed to Eli as playtest thirteen's poison
  section (docs/private/playtest-m2-13.md): he applies it by hand on test
  2, `just probe-poisons c2` reads the sword's ExtraPoison (the hand, the
  count) before and after one hit on test 1, he reports test 1's health,
  and the server log shows whether the client sent OnEquip for the poison.
  The poison slice waits for that answer.
- x-taper-probe: c1 casts Firebolt at c2; c1's watch of c2's figure per
  frame between the server's sets: the engine's taper steps after the hit.
- Owner: agent.

## Status

Doc written 2026-10-10, before any code. Building on fork branch
m2-effects, stacked on m2-spell 45839102 (2026-10-10): 1d93a001 the effect
rule (wire-rules magic: apply at a scale, advance, admit within 32, the
Creation Kit wiki's archetype timing) and 868fa31d its bridge; 67de50ca
libespm's MGEF second value, weight, hit shader and art; e2a43dbf the change
form's running effects (FormDesc ids, seconds run); 6d51796c the actor runs
them (ApplyEffects, AdvanceEffects on WorldState's quarter-second tick, the
running buffs' sum on the maximum and the regeneration rates; tests); 6eb40440
a drink through the rule, a poison no longer drunk, effects gated by
conditions left out (libespm marks a CTDA after an EFIT); 70817737 the wire
(MagicEffects, MsgType 43, schema 12, the validator, fixtures, the C++ and
TypeScript messages); d6a0a1c4 the server sends it (on a change of the set,
to a newcomer after the actor's creation); e67b2a83 the client shows each
effect's hit shader for its seconds (MagicEffect.GetHitShader through Skyrim
Platform, no new native), the figure's re-drink snippet gone; a3a4a5ec a
spell's hit through the rule (SpellCastTest by the records' damage);
fdda93fb the migration of the legacy per-AV effects (rule 6). Left: the
poison on the weapon and its delivery by a hit (after x-poison-probe), the
OnEquip budget and its reliability, the hit art (an ARTO: a client native if
the lab wants it), T2, the probes, b-potion and b-magic-restart.

- [x] doc complete, rung declared (R0, ADR-028)
- [x] engine surface cited or delegated (cited: CommonLibSSE-NG, UESP's
      MGEF layout checked against the masters, the Creation Kit wiki's
      archetype rules; HYPOTHESIS for the lab: the per-second steps, the
      taper, the drinker's own engine agreeing with the server, the
      poison's hand and count, the shader on a figure, OnEquip's budget)
- [ ] server logic + T0
- [ ] message + validator (same commit)
- [ ] native hook + T1
- [ ] TS handler
- [ ] T2 green
- [ ] T3 scenario green, no HYPOTHESIS tags
- [ ] ledger and suppression registry updated
