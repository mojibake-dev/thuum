# Verb: self-cast

## Intent

A spell a player casts on itself (and a shout of Self delivery, Become
Ethereal) runs on the server as the player's own effects: the server holds
them and their time, every game sees them on the caster, and the server's
rules read them (an ethereal player takes no damage, Oakflesh's armor counts
in the damage formula).

Roadmap reference: skymp/ROADMAP.md "Magic effects" ("The server must be
able to cast a magical effect on a person ... The appearance of the magic
effect is accompanied by the playback of the shader effect. Even if the
moment of applying the magic effect on another player was not visible, when
you enter the visibility zone, you should see the effect of the shader").
Milestone: M2 (docs/PLAN.md M2, playtest fifteen's findings)   Class: B

## Authority

Rung: R0 for the effects and their time, R1 for the cast that starts them.
- The caster's game casts the spell and reports the cast; the server takes
  it as spell-cast already does (the spell equipped, R1) and then runs the
  spell's effects on the caster through magic-effects' rule
  (MpActor::ApplyEffects), as for a drink: Value, Peak Value and Dual Value
  Modifiers change the caster's values, and the state archetypes
  (Invisibility 11, Light 12, Etherealize 41; CommonLibSSE-NG
  include/RE/E/EffectArchetypes.h:21-22,51) run for their duration and
  change no value.
- The server's rules read the running state: no damage to an actor with a
  running Etherealize (weapons and spells, ADR-028's ground); the armor a
  hit meets counts the target's running DamageResist (Oakflesh, Peak Value
  Modifier on actor value 39; TES5DamageFormula's opponent armor rating).
- An ethereal or invisible player's own attack or cast ends that effect on
  the server, as the engine ends it in the player's game (HYPOTHESIS, from
  the game's descriptions of the two, unread in the engine: the lab reads
  the player's own game after its attack, the Dynamic plan).
- A wait or a sleep advances the resting player's effects by the time the
  rest rule gives a rested hour (wire-rules rest::REGEN_SECONDS_PER_HOUR,
  360 s, measured for regeneration). HYPOTHESIS: the engine advances an
  effect's time in a wait at that rate; at least the real-time equivalent
  (180 s a game hour at time scale 20) is certain, so effects of a minute
  end in any wait, as playtest fifteen's Invisibility did.
Why not R0 for the cast itself: the cast is a key press in the player's
game; the server judges it against what the player has equipped
(spell-cast).
Rate limit / bounds: spell-cast's (one cast per hand per report); the
effect rule's MAX_EFFECTS (32) and MAX_DURATION_S.

## Engine surface

- Delivery Self: RE::MagicSystem::Delivery::kSelf
  (CommonLibSSE-NG include/RE/M/MagicSystem.h:41); the server reads a
  spell's delivery from its SPIT and its effects from its EFIDs (libespm),
  as magic-effects reads a potion's.
- Archetypes: include/RE/E/EffectArchetypes.h (kInvisibility 11, kLight 12,
  kParalysis 21, kAccumulateMagnitude 32, kStagger 33, kPeakValueModifier
  34, kEtherealize 41).
- The look on a figure: the effect's hit shader (MagicEffect.GetHitShader,
  EffectShader.Play/Stop), magicEffectsService.ts, as magic-effects shows a
  potion's. The relayed cast still casts a Self spell on the figure
  (Skyrim Platform MagicApi.cpp, fork 31b56fc9), so lights and the engine's
  own look show there; the figure's copy runs on that game's clock, so it
  is dispelled (Actor.DispelSpell) when the server's set no longer holds
  the spell (playtest fifteen: Invisibility's look outlived the caster's
  wait on the figure).

## Observe (host or acting client sees the intent before the engine acts)

- Hook point: spell-cast's (the SpellCast message) and shouts' (the shout's
  report).
- SP filter: as spell-cast's.
- Data captured: the spell; the server reads the rest.
- Side effects of hooking here: none new.

## Impose (observers render the server's decision)

- Mechanism: MagicEffects (MsgType 43) to every game that sees the caster,
  the caster's own included, as magic-effects sends it on any change of the
  set; a game whose figure loses an effect's spell dispels that spell from
  the figure.
- Visual without simulation achieved by: the hit shader for the server's
  seconds left (Invisibility's shimmer 0x2DF92, Etherealize's 0x64D67,
  Oakflesh's skin 0x56AC9: Skyrim.esm, magic-effects.md's table).
- Side effects: HYPOTHESIS (the caster's own game plays the server's shader
  beside its engine's own look; magic-effects' rule for the player's own
  effects).

## Suppress (engine's own behavior blocked on non-hosts)

- What is suppressed: the figure's own copy of a Self spell, once the
  server's set no longer holds it (dispelled).
- How: magicEffectsService's apply, on a set without the spell.
- Release condition: none.
- Side effects: HYPOTHESIS (a dispel on a figure ends its engine's look at
  once, the light included).

## Message contract

- No new message: SpellCast in (spell-cast's), MagicEffects out
  (magic-effects').
- Validator rules: unchanged.
- Idempotency / ordering: the effects run once per accepted cast; a
  concentration Self spell (a ward) counts by its stream (spell-cast's) and
  is a later slice.
- Contract doc updated: no change.

## Server

- Where the logic lives: ActionListener::OnSpellCast (an accepted cast of a
  spell of Self delivery, fire-and-forget, and an accepted shout of Self
  delivery: the spell's effects through MpActor::ApplyEffects with the
  caster as both caster and target); wire-rules magic (EffectKind::State,
  its entries kept for their duration, no value changed);
  EffectFactsOf (the state archetypes); OnWeaponHit and the spell hit path
  (no damage to an ethereal target, logged); the end of an ethereal or
  invisible player's effects on its own attack or cast; OnRestIntent
  (AdvanceEffects by the rested seconds); TES5DamageFormula's opponent
  armor rating (the target's running DamageResist modifier).
- DB fields / migration: none (running effects are in the change form
  already, magic-effects' migration).
- Restart behavior: as magic-effects' (a running effect outlasts a restart
  with its time left on the world's clock).
- Papyrus natives touched: none.

## Client

- SP binding: none new (Actor.dispelSpell, bound).
- TS handler: magicEffectsService.ts (a figure's spell dispelled when the
  server's set drops it).
- Kill switch config key: magic-effects' (magicEffects).

## Tests

- T0: wire-rules magic (a state effect runs for its duration and changes
  no value; it ends; advance by a rest's seconds); SelfCastTest (a Self
  spell's accepted cast runs its effects on the caster and tells the
  neighbour; Oakflesh's modifier lowers the server's weapon damage; an
  ethereal target takes no damage and its own attack ends it; a rest
  advances the effects).
- T1: none.
- T2: the difftest sessions identical but for what this verb declares (a
  session casting a Self spell, if one exists, gains MagicEffects).
- T3 scenario id: lab/scenarios/b-self-cast.yaml: c1 casts Oakflesh: the
  server's effects hold its DamageResist and c2's sword takes less from c1
  than before; c1 shouts Become Ethereal: c2's hits take nothing from c1 on
  the server; c1 casts Invisibility and waits an hour: the server's set
  holds it, then not after the wait.
- Assertions that would fail if the verb silently regressed: the server's
  running effects after each cast (server.effects); the damage with and
  without Oakflesh and while ethereal; Invisibility gone after the wait.

## Dynamic plan (fill when any tag above is still HYPOTHESIS)

- The engine's end of Invisibility and Etherealize on the caster's own
  action, and an effect's time in a wait: a probe (x-self-cast-engine)
  reads c1's own game after each (Papyrus HasMagicEffect on the player,
  dump-state) against the server's set: Invisibility then an attack;
  Become Ethereal then an attack; a fortify of 60 s and a wait of one
  hour, and one of a longer duration read with lab/esm.py, to tell 180
  from 360 s a game hour.
- Owner: agent.

## Status

- [x] doc complete, rung declared
- [x] engine surface cited or delegated (CommonLibSSE-NG and libespm;
      the engine's own end of the states and its rate in a wait are
      HYPOTHESIS, the Dynamic plan)
- [x] server logic + T0 (fork m2-fifteen: wire-rules d5d26b7f, the server
      c1aa933c; SelfCastTest, magic's and rest's tests)
- [x] message + validator (same commit): no new message
- [x] native hook + T1: none new
- [x] TS handler (magicEffectsService.ts, fork c2a71793)
- [ ] T2 green
- [ ] T3 scenario green, no HYPOTHESIS tags
- [ ] ledger and suppression registry updated
