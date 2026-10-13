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
Scope note (2026-10-10): the poison on a weapon left this verb for one of
its own (docs/PLAN.md M2, "poison"), blocked on playtest thirteen's poison
section (CLAUDE.md rule 8, the Dynamic plan below); until it ships a poison
is taken by the server and applies nothing. This verb is drinks, spells'
effects and the visuals.

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
  (the player or a figure): the effect's hit shader through Papyrus
  (MagicEffect.GetHitShader, EffectShader.Play) for the remaining seconds;
  no new native for it, and the hit art (an ARTO, which no Papyrus call
  plays) and the hit sound wait for a playtest to want them. The
  drinker's own drinks show the same way, since its engine applies none
  (Suppress).
- Visual without simulation achieved by: shaders and art only; no
  ActiveEffect is made in any game for a server effect, so nothing there
  changes a value.
- The drinker's figure stops being told to EquipItem the drink
  (MpActor.cpp:566-583): MagicEffects shows it instead, one path for every
  effect, and a poison is no longer "drunk" on observers' figures.
- The actor's own game holds the server's buffs: MagicEffects carries the
  sums the running buffs put on each actor value (modifiers, wire-rules
  magic::modifier), and the player's game moves each value by the
  difference from what it holds already, through
  TESModPlatform.ModPlayerActorValue (ActorValueOwner::ModActorValue,
  CommonLibSSE-NG include/RE/A/ActorValueOwner.h:19, the change Papyrus
  ModActorValue makes): a fortify raises its maximum and its value with
  it, its end takes both back, and a relaunched game, holding nothing,
  takes the sums whole at the login. The server sends a change's
  MagicEffects before its ChangeValues, both reliable on the one ordered
  channel (wire-transport channels.rs), and the client applies each in
  arrival order on an update, so a game moves its maximum before it takes
  the percentage, as the server does (MpActor::ApplyAttributeDeltas keeps
  the damage across a change of the maximum). CONFIRMED (x-potion-probe
  20261011-020609, fork m2-effects 9e038edd): after a fortify of 20, c1's
  maximum 120 and its value with it (79.47 to 99.67), 100 again after the
  end.
- Side effects: HYPOTHESIS (whether ApplyEffectShader on a figure looks
  like the engine's own hit shader; the lab compares the two screenshots).

## Suppress (engine's own behavior blocked on non-hosts)

- What is suppressed: the drinker's own engine applies no effect of an
  alchemy item (a potion, a food, a poison) to the player. Measured why
  (2026-10-10): the two agree while a drink runs (x-potion-probe
  20261011-002439: 0.77 on the server and 0.7903 in the game after a heal,
  0.8083 and 0.8285 after a fortify of 20, the game's own regeneration the
  difference), but not at a buff's end: both gave the fortify back and the
  percentages crossed (b-potion 20261011-004053, FortifyHealth05's 100:
  0.0204 on the server and 0.0335 in the game where about 0.34 was due),
  the game's report of its own end taken as a fall and the server's end
  applied on top. A restart made it worse, the game counting its fortify
  through the server's downtime.
- A remote spell's effects land nothing on the player it targets (spell-
  cast, MEASURED), so the server's effects are the target's only ones.
- How: Skyrim Platform hooks the player's MagicTarget::AddTarget (vfunc
  01, include/RE/M/MagicTarget.h:78) and refuses an effect whose magic
  item's spell type is kAlchemy (AlchemyItem::GetSpellType,
  include/RE/A/AlchemyItem.h:68) while skymp5-client blocks them
  (TESModPlatform.SetPotionEffectsBlocked, set at its first update behind
  the magicEffects setting). The player's MagicTarget vtable is the fifth
  of PlayerCharacter's: TESObjectREFR has four (VTABLE_TESObjectREFR) and
  Actor's MagicTarget base follows them (include/RE/A/Actor.h:126), as
  VTABLE_Actor's ten count. The index CONFIRMED (x-potion-probe
  20261011-020609: the maximum 120 after a fortify of 20, not 140, so the
  engine applied none of the drink). HYPOTHESIS for T4 (the next
  playtest): what Actor::DrinkPotion does with a refused effect beyond
  that (the item leaves the game's inventory, as the server's inventory
  says it does; its sound; any message).
- Release condition: none while connected; with magicEffects off nothing
  is blocked (and the double give-back returns: the setting is a kill
  switch, not a mode).
- Side effects: a poison hitting the player from an NPC's weapon applies
  nothing either, until the poison verb (the server takes no poison yet).

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
- Since 2026-10-10 (schema 13): modifiers (at most 64, two per effect):
  av (u32, an actor value the engine has, below 164) and amount (f32,
  finite): the sums the running buffs put on the actor's values, none at
  0. The validator refuses an actor value past the engine's.
- Idempotency / ordering: idempotent (each message replaces the actor's
  set); ordered on the reliable channel, before the ChangeValues of the
  same change.
- Contract doc updated: in the same commit as the validator (wire-schema's
  types are the contract, ADR-012).

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
  instant restore); a poison is taken and applies nothing (its weapon side
  is the poison verb's: the hand, the count, a poisoned hit); a spell hit
  applies the spell's effects through the rule at the claim's scale
  (spell-cast's Health damage moves into it, and the dual and duration
  effects join).
- Taper: not counted until the lab measures the engine's (HYPOTHESIS
  above); Firebolt's records give it 0.30 for 1 s at curve 2.
- DB fields / migration: the change form's activeMagicEffects becomes a
  list of running effects (effect, source, magnitude, remaining seconds,
  the caster); a migration reads the legacy per-AV form on load (its
  regeneration entries with their end times) into the list (rule 6), and
  b-magic-restart is the restart scenario.
- Restart behavior: each effect resumes with its remaining time, counted
  on the server's wall clock, as the world's game time is (ADR-021: the
  clock runs while the server is down): each running effect keeps when its
  seconds run were counted (asOf), and a loaded record's effects run on by
  the time since, an effect that ended meanwhile giving back what it gave
  (the legacy map kept wall-clock end times too, MpActor::
  ReapplyMagicEffects). mp.get(actor, "runningEffects") reads them, each
  with its seconds left (the lab's server.effects(c)).
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

- SP binding: the shaders through Papyrus (MagicEffect.GetHitShader,
  EffectShader.Play), no new native for them; two TESModPlatform natives,
  client only: SetPotionEffectsBlocked(blocked) and
  ModPlayerActorValue(av, delta) (above), declared in the .psc and, by
  lab/pex.py add-native, in the committed TESModPlatform.pex; the
  AddTarget hook (Hooks.cpp). The hit art (an ARTO) waits for the lab.
- TS handler: magicEffectsService.ts (MagicEffects to shaders on every
  actor, the player's drinks included, and the player's held sums);
  sendInputsService.ts OnEquip reliable.
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
- T2: a difftest session, a fortify drunk: the legacy server restores at
  once; declared (difftest sessions/magic-effects.yaml). Its poison
  equipped, which the legacy server drinks as a heal, moved to the poison
  session on fork 11c126b9: the poison verb puts it on the right-hand weapon,
  an inventory no declaration can tell from the legacy drink's
  (docs/verbs/poison.md).
- T3 scenario id: lab/scenarios/b-potion.yaml: c1, hurt, drinks a Potion
  of Minor Healing (RestoreHealth01 0x3EADD: 25 at once) and a Fortify
  Health (FortifyHealth05 0xFF9FC: 100 for 60 s): its health on the server
  and in its game agree after each, both drinks leave the server's
  inventory, and at the fortify's end the 100 comes back once, bounded
  from both sides. lab/scenarios/b-magic-restart.yaml (M2's exit): a
  running Fortify Health survives a server restart with the time it has
  left on the world's clock (server.effects), c1's game agreeing, and its
  end gives back once. The poison's scenario went with the poison verb.
- Assertions that would fail if the verb silently regressed: the health
  after each drink on both sides; the return at the fortify's end, once;
  the time left after the restart.

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
- Results so far: x-potion-probe 20261011-002439 (green; the two sides
  agree while drinks run, numbers under Suppress; the watch keeps 256
  samples, so the fortify's end fell outside it; c2's photographs show no
  clear shader on c1's figure 3 s after the drink); b-potion
  20261011-004053 (green, wrongly: the double give-back, under Suppress).
- On fork m2-effects 9e038edd (2026-10-10): b-potion 20261011-015942 green
  (0.7636 and 0.7869 after the heal, 0.8818 and 0.9026 after the fortify,
  0.3248 and 0.3253 after its end: the 100 back once); x-potion-probe
  20261011-020609 (the maximum 120 after a fortify of 20: the hook and
  ModActorValue confirmed); b-magic-restart 20261011-020256 red on the
  client's side only: the effect resumed with its time on the wall clock
  (57 s left, 21 s after the restart, 0 at its end, the server's 0.6005 to
  0.2805), but c1's game stayed at 1.0 after the restart and its
  reconnect. x-reconnect-values 20261011-021436 (green): with no effect
  running, a reconnected game takes the server's health (0.3095).
  x-restart-effects-probe 20261011-021833 found the cause: the login, a
  reconnect's included, sets the player's base values from its CreateActor
  (remoteServer.ts, the isMe props), which dropped the held +100 (the
  maximum 200 before the restart, 100 after), while MagicEffectsService
  still counted it held; the fortify's end then took 100 the game no
  longer had. Fixed on 58cbf09d: the service forgets what it holds when the
  connection is accepted, and the login's MagicEffects puts the sums back
  whole. Staged with god-mode on fork m2-god 35acc275.
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
fdda93fb the migration of the legacy per-AV effects (rule 6); 75fc9f3a
OnEquip reliable with its budget; 7db86598 and 58f8169b the difftest
session (T2 green on a9da1873); 57e6c2c5 the migration's end times read from
memory. After the lab (2026-10-10): 72e48503 effects on the wall clock and
mp.get's runningEffects; 5cbac803 the wire's modifiers (schema 13) and the
order before ChangeValues; a16232c0 the client: the engine's drinks blocked
at the player's AddTarget, the server's buffs held through
ModPlayerActorValue; 89689154 clang-format 21.1.8 for the fork's Formatting
check, which the branch had failed since 75fc9f3a. Left: b-potion and
b-magic-restart green (staged), T2 again on the new wire, the hit art (an
ARTO: a client native if a playtest wants it), the sweep.

- [x] doc complete, rung declared (R0, ADR-028)
- [x] engine surface cited or delegated (cited: CommonLibSSE-NG, UESP's
      MGEF layout checked against the masters, the Creation Kit wiki's
      archetype rules; HYPOTHESIS for the lab: the per-second steps, the
      taper, the drinker's own engine agreeing with the server, the
      poison's hand and count, the shader on a figure, OnEquip's budget)
- [x] server logic + T0 (MagicEffectsTest, SpellCastTest by the records'
      damage, the migration's; the wall clock and the modifiers 72e48503,
      5cbac803)
- [x] message + validator (same commit): MagicEffects (MsgType 43) with its
      validator; the modifiers (schema 13) with the validator's actor-value
      bound (5cbac803)
- [x] native hook + T1: the player's MagicTarget::AddTarget refusal of an
      alchemy item's own effects (Hooks.cpp) and two TESModPlatform natives,
      SetPotionEffectsBlocked and ModPlayerActorValue (a16232c0); T1 none
- [x] TS handler: magicEffectsService.ts (the server's sums held, the
      engine's drinks blocked; a reconnect forgets what the game held,
      58cbf09d)
- [x] T2 green (2026-10-10 on fork m2-god 6252f251, every session identical
      up to its declarations)
- [x] T3 scenario green: b-potion (thuum bc796d5) green in 20261011-015942
      and -030531, b-magic-restart (ec9dac2) in -030835 and -031834, both
      awaiting Eli's review; HYPOTHESIS left: the hit shader on a figure
      (playtest thirteen's potions), and the poison's hand and count (the
      poison verb, docs/verbs/poison.md)
- [x] ledger and suppression registry updated: the two natives' rows
      (docs/NATIVES.md at 35acc275); the suppression is the player's
      AddTarget refusal above (Suppress), released never
- [x] merged with god-mode: the sweep on fork m2-god 35acc275 went 33 of 35
      green (runs 20261011-033757 to -051523): a-time had no verdict
      (20261011-044541, sky-c1's guest agent down) and was green on its
      rerun (-051631); a-melee-reach red once (-042255) and green twice
      (-051934, -052147), a watch item by ADR-027 (docs/verbs/
      melee-reach.md); fork parity fast-forwarded to 35acc275, both clones'
      clean-m1 promoted

## Spell visuals to confirm (Eli, 2026-10-13)

Eli: "there's a number of spell visuals we'll need to confirm. first that
comes to mind is like, ghost walk and invisibility ... and ofc ... does
unrelenting force ragdoll". The records, read with lab/esm.py from
Skyrim.esm (MGEF DATA by UESP's layout: type at 0x40, actor value 0x44,
hit shader 0x20, light 0x18, cast type 0x50, delivery 0x54):

| Spell | SPEL | Its effect (MGEF) | Archetype | What to confirm |
| --- | --- | --- | --- | --- |
| Invisibility | 0x27EB6 | 0x1EA6A InvisibillityFFSelf | 11 Invisibility (AV 54), hit shader 0x2DF92 | the figure vanishes on the other screen |
| Oakflesh | 0x5AD5C | 0x51B15 ArmorFFSelf0 | 34 Peak Value Mod (AV 39 DamageResist), hit shader 0x56AC9 | the skin on the figure; the armor in the server's damage |
| Candlelight | 0x43324 | 0x1EA6C LightFFSelf | 12 Light, light 0x41F09 | the other player sees the light |
| Paralyze | 0x5AD5F | 0x1EA6E ParalysisFFAimed, 0xA44C0 StaggerPushFFAimed | 21 Paralysis (AV 53), 33 Stagger | the target drops and stays down in its own game |
| Lesser Ward | 0x13018 | 0x14C WardConcSelf0, 0xFCC62 ShieldConcSelf | 32 Accumulate Magnitude (AV 63 WardPower), 34 | a ward absorbs a spell's damage on the server |
| Healing Hands | 0x4D3F2 | 0x1CEA5 RestoreHealthConcActor | 0 Value Mod (Health), delivery 3 target actor | the target's health rises on the server |
| Become Ethereal (1 word) | 0x5F6EB (SHOU 0x32920) | 0x64D68 VoiceMakeEthereal | 41 Etherealize, hit shader 0x64D67 | the ghost look on the figure; no damage taken |
| Unrelenting Force (3 words) | 0x13F3A (SHOU 0x13E07; Dragonborn.esm's override wins) | 0x7F82F, 0x7F82E VoiceUnrelentingForceEffect03/02; 0xEA075 (10 at once); Dragonborn's 0x0201FF2B (40 over 1 s) | 33 Stagger; 0 Value Mod (Health) | the push lands in the target's own game |
| Frostbite | 0x2B96B | 0x13CAA FrostDamageConcAimed, 0xB729D FrostSlowConcAimed | 5 Dual Value Mod (Health), 34 (AV 30 SpeedMult) | the slow in the target's game, within the movement budget |

What the server does today (code read, MpActor::ApplyEffects and
EffectFactsOf): it runs effects of three archetypes only (Value Mod, Peak
Value Mod, Dual Value Mod) and only from a hit or a drink; a spell a player
casts on itself is recorded as a cast and relayed, and its effects run in
the caster's game alone (OnSpellCast's "apply magic effects if this is not
a fireball-like spell" TODO). So a self spell's look reaches the other
screen only as far as the relayed cast draws it on the figure, and an
Etherealize, Invisibility or Paralysis is no server state: the server
would still damage an ethereal player. Probes x-self-visuals,
x-target-spells and x-uf-ethereal read each row; the rows the probes find
missing become the self-cast slice (the server runs a self spell's effects
on its caster, and every game sees them as MagicEffects), after playtest
fifteen.
- x-self-visuals (20261013-073054, m2-visuals 140ed04d): c1 cast
  Candlelight, Oakflesh and Invisibility, each relayed (the server relays
  every cast of an equipped spell). On c2's screen the figure held only the
  readied spell's hand glow: no light over it, no skin, and fully visible
  after Invisibility, while c1's own first-person hands shimmered invisible.
  The relayed cast had nothing to land on: a self spell's cast names no
  target, and castSpellImmediate launches a non-concentration spell as a
  projectile (Skyrim Platform MagicApi.cpp). Since m2-visuals 31b56fc9 a
  spell of Self delivery is cast on the figure itself (MagicCaster's
  CastSpellImmediate with the actor as its target), so the observer's own
  engine draws it there as the caster's did; the second staging's
  x-self-visuals reads it. The engine's state on the figure (invisible,
  ethereal) is a look in that game alone: the server still neither hides
  an invisible player nor spares an ethereal one (the self-cast slice).
- On m2-visuals 31b56fc9 (the second staging, 2026-10-13):
  - Become Ethereal: drew on the figure (x-uf-ethereal, shouts.md).
  - Invisibility: still drew nothing on the figure (x-self-visuals
    20261013-083623: fully visible on c2's screen, c1's own hands
    shimmering). HYPOTHESIS: the figure's relayed cast animation, arriving
    after the relayed cast, counts as the figure casting, which ends
    Invisibility at once; the self-cast slice (the server's MagicEffects
    carrying the effect) is the place to fix it.
  - Candlelight, Oakflesh: the daylight screenshots cannot tell; a
    playtest item.
  - Paralyze (x-target-spells 20261013-083935, with c1's magicka at 3000):
    the server counted the hit once, and c2 was not paralyzed in its own
    game (controls on, not down, on its spot): paralysis needs the server
    to decide it, as staggers do.
  - Lesser Ward against Flames: the server counted the stream whole (c2 at
    0.73, the unwarded band); a ward's absorption is the server's to add.
  - Healing Hands on the other player: the server healed it (0.51 to 0.77).
- A Self spell cast on the caster's figure and a figure's spell dispelled
  from the player at its hit: merged on fork parity 11c126b9 (2026-10-13
  05:31: the sweep of every scenario on m2-visuals be69bf68, 40 of 40 green,
  and T2 green on 11c126b9, which adds a difftest session change alone).
