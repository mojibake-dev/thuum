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

- How an act ends concealment (the re-analyst on sky-re, 2026-10-16,
  1.6.1170, ids by lab/addr.py; HYPOTHESIS until x-invis-recast): the engine
  ends an actor's Invisibility (archetype 11) and Etherealize (41) through
  Actor::DispelAlteredStates 38819 (CommonLibSSE-NG src/RE/A/Actor.cpp:
  209-214), which dispels every live effect of the archetype (34510, through
  ActiveEffect::Dispel 34061), for any actor, player or not. Its callers:
  the caster's SpellCast (ActorMagicCaster vslot 9, 34144), run by Fire
  34407 after the effects landed, never at the request, the charge, the
  Attack, Ready or Release actions; a successful activation (ActivateRef
  19796, pick-up included); a weapon's hit frame that finds an actor
  (38603); a bow's release (ArrowReleaseHandler 42859); a force-greet
  (37200). SpellCast passes one exception, the archetype the cast spell
  itself carries (Invisibility before Etherealize); the others pass none.
  So the engine's own recast of Invisibility, in order: the new cast's
  effect pass (34547) dispels the running copy of the same spell from the
  same caster (its Finish restores the refraction), inserts the new one,
  then SpellCast's DispelAlteredStates spares archetype 11, and the new
  copy starts. A replayed action on a figure (38953) and an animation event
  run no caster code; CastSpellImmediate (34404) on a figure skips
  SpellCast and so DispelAlteredStates, and replaces a running copy of the
  same spell the same way. Actor.DispelSpell (Papyrus 54648) is queued as a
  task and runs later in the frame, dispelling every live effect of the
  spell from any caster.
- The recast bug this explains (playtest nineteen's third session: "if i
  REcast it i lose invisibility on the other players screen but not my
  own"): the server ended the caster's concealment with no exception and
  told every game at once; the observer dispelled the figure's copy
  (magicEffectsService's dispelEnded), and that dispel, queued, ran after the
  figure's fresh cast had replaced the old copy, so it ended the new one.
  Fix (fork m2-arrow-path a3672b82): EndConcealment(actor, castSpell) spares
  the archetype the cast spell carries, as the engine does; the hit path
  passes none. And (2d983dd0) the server now also ends a player's
  concealment on a bow's release and on its own activation, two of the
  engine's callers it had missed: a player who shot or activated while
  invisible stayed invisible on the server and in every other game while
  visible in its own.

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
  effects). Known: the caster's own game also holds the server's sum of a
  Self spell's buff beside its engine's own (MagicEffects' modifiers, which
  the player's game adds to its values for the potions its engine is kept
  from drinking), so Oakflesh's armor shows twice in the caster's own armor
  rating while it runs; the server's damage reads the server's record alone
  and an actor's damage counts nothing in the player's game (ADR-028), so
  it is a number on the caster's screen, to split out (the modifiers of the
  caster's own spells left out of its own game's sums) in a later pass.

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
  invisible player's effects on its own attack or cast, sparing the
  concealment its own cast spell carries (ConcealmentExceptionOf, the
  engine's exception); OnRestIntent
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
- T3 scenario id: lab/scenarios/b-self-cast.yaml (thuum c260ff3): c1
  casts Oakflesh and Invisibility: the server runs each; c1 waits an hour:
  both end on the server; c1 shouts Become Ethereal with Invisibility
  readied: c2's sword swing, which c2's own game plays (IsAttacking) while
  the server still runs the state, takes nothing from c1, and the same
  swing from the same spot lands once the state has run out. Oakflesh's
  armor in the damage is SelfCastTest's (T0, the server's own
  TES5DamageFormula), not a lab reading.
- Assertions that would fail if the verb silently regressed: the server's
  running effects after each cast and after the wait (server.effects); c1's
  health after the swing in the ethereal window and after it; c2's own
  attack in both (watched_self).

## Dynamic plan (fill when any tag above is still HYPOTHESIS)

- The engine's end of Invisibility and Etherealize on the caster's own
  action, and an effect's time in a wait: a probe (x-self-cast-engine)
  reads c1's own game after each (Papyrus HasMagicEffect on the player,
  dump-state) against the server's set: Invisibility then an attack;
  Become Ethereal then an attack; a fortify of 60 s and a wait of one
  hour, and one of a longer duration read with lab/esm.py, to tell 180
  from 360 s a game hour.
- Owner: agent.

## Lab (2026-10-13, fork m2-fifteen 744fddb0)

- x-self-cast (20261013-214827, 20261013-220500): Become Ethereal never
  reached the server; the shout's release with magic readied is
  CombatReady_BreathExhaleShort, which shoutService did not hook (the root
  cause, docs/verbs/shouts.md; fixed in 744fddb0). On 744fddb0
  (20261013-230751) the server ran it ("ff000000 casts 5f6eb on itself:
  its effects run on the server"); the probe was red on its own timing
  only (its console reads held the assert past the state's 8 s).
- b-self-cast by path, green twice (20261013-232251, 20261013-232603),
  identical readings: Oakflesh's DamageResist 40 with 56 of 60 s left;
  Invisibility with 29.5 s left; both ended on the server within 2 and 3 s
  of the hour's wait; Become Ethereal's state with 7.25 s left a second
  after the shout; c2's own game attacked (IsAttacking) while the state had
  5.0 and 4.7 s left and c1 kept 1.0; the same swing after the state
  landed (0.935, an Iron Sword's 6.5 of 100).
- CONFIRMED (b-self-cast, both runs; x-uf-ethereal's punch before them):
  an observer's game lets a swing through an ethereal figure, so no hit
  reaches the server while the state runs (the relayed cast runs the Self
  spell on the figure, Engine surface). The server's refusal of a hit that
  a client sends anyway is SelfCastTest's.
- CONFIRMED (b-self-cast's c2 screenshots): Invisibility's shimmer on the
  figure in the other game. Open: the ethereal look on the figure in c1's
  shout with magic readied showed a few sparkles at night (045-c2), not
  x-uf-ethereal's dark translucence; playtest sixteen's eye.
- The first two green runs (20261013-231616, 20261013-231928) swung one
  second after c2's draw and read nothing of c2's game, so their ethereal
  assertion could have held on a miss; the scenario as committed draws
  early and watches c2's attack.

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
- [x] T2 green: the full T2 at the merge (8eb4e78e, 2026-10-13 17:19: all
      25 sessions identical, shouts' three declarations of the spell
      stagger committed first)
- [x] T3 scenario green: b-self-cast (thuum c260ff3, awaiting Eli's
      review) green twice by path (20261013-232251, -232603) and in the
      merge's gate (20261014-003546); HYPOTHESIS left: the engine's own end of
      Invisibility and Etherealize at the caster's attack or cast, an
      effect's time in a wait (180 or 360 s a game hour), the ethereal look
      on the figure, the caster's shader beside its engine's own; playtest
      sixteen passed every self-cast item by eye (below), so what stays
      open is the rate of an effect's time in a wait (180 or 360 s a game
      hour) and the caster's own shader, for the references and the parity
      run (ADR-031)
- [x] ledger and suppression registry updated: no Papyrus native on the
      server (Actor.dispelSpell is a Skyrim Platform binding in the
      client); the suppression is magicEffectsService's dispel of a
      figure's Self spell (Suppress, above)
- [x] merged: fork parity fast-forwarded to m2-fifteen 8eb4e78e
      (2026-10-13 18:03, after the gate's run set
      20261014-002126-merge-m2-fifteen, 13 of 13 green); both clones'
      clean-m1 promoted with its client (18:02 and 18:03)

## Playtest sixteen (2026-10-13, Eli, parity 8eb4e78e)

Every self-cast item passed:
- Oakflesh from test 1: the bark skin on its figure on test 2's screen for
  about a minute, then gone.
- Invisibility from test 1: the figure shimmered on test 2's screen, and
  test 1's weapon hit on test 2 ended the shimmer at once (the server's
  EndConcealment at an attack, as the game ends its own).
- Invisibility and an hour's wait: the shimmer ended on test 2's screen
  when test 1's own invisibility ended (fifteen's look that stayed is gone:
  the figure's copy dispelled when the server's set drops it, c2a71793).
- Candlelight: the light over the figure, gone when test 1's went.
- Become Ethereal from test 2: the ghost look on its figure on test 1's
  screen; test 1's swings took nothing while it lasted and landed after.
  Ethereal test 2's own sword hit on test 1 ended the look at once and
  counted (an ethereal player's game does swing, and the server ends the
  state at its attack, as the game does).

## Playtest seventeen (2026-10-14, Eli, parity 4e8aa04c)

- Found: "when invisible player 1's name plaquard still shows". The
  figure's name label (skymp5-client src/view/formView.ts, the
  isDisplayingNicknames block) hides for a sneaking player, beyond 1000
  units, out of line of sight and for the sweet-hide case, and never for
  an invisible one. The figure is invisible in the observer's game (the
  relayed Self cast runs Invisibility on it there, so its look shows), so
  the label's test can read the figure's own state there: its Invisibility
  actor value, which the Invisibility archetype sets (CommonLibSSE-NG
  include/RE/A/ActorValues.h:62, kInvisibility 54; HYPOTHESIS that the archetype
  raises it on a figure as on the player, to read in the lab). A one-line
  condition beside isSneaking, with a lab check that the label goes and
  comes back with the effect.
- Fixed on fork m2-flight f3569b95 and measured (x-invisible-name
  20261014-211744): c1's figure's Invisibility in c2's game read 0 before
  the cast, 1 while the server ran the effect (29.5 s left), 0 after the
  hour's wait ended it (the driver's av-read {other}); c2's screenshots show
  the floating name above the figure, none while it was invisible, and the
  name again after. Still shown while invisible: the game's own crosshair
  prompt ("E Talk / test 1") when c2 aims at the spot, the engine's
  activation prompt, not our label. A finding of its own.
- The crosshair prompt, PARKED until after the alpha (Eli, 2026-10-16,
  after playtest twenty-one: "the crosshair fix might not be worth the
  effort. we can pass on that for now and document as a later thing after
  we get our alpha version working"). Playtest twenty asked for it hidden
  ("yes hide it"). Fork parity ef44a1d8's setActivateTextHidden sets
  ExtraFlags' kBlockActivateText, which nothing on 1.6.1170 reads (the
  re-analyst on sky-re, 2026-10-16: the crosshair pick 26127, its filter
  26130, TESNPC's GetActivateText 24716; no reader of the flag's bit), so
  it changes nothing, and twenty-one still showed the prompt. The engine
  keeps a reference out of the crosshair when its display name is empty
  (26130's own test). Fork m2-crosshair 50d7c718, unmerged, empties the
  figure's name while it is invisible and drops the dead native; its first
  probe, x-crosshair-invis 20261017-045850 with a Frida HUD trace
  attached, lost c2's game about 46 ms after c1's cast, the cause unread
  (the build or the trace), and the rerun was cancelled with the park. The
  read's runner-up: Actor::AllowPCDialogue(false) removes "Talk" but can
  leave "Pickpocket" or "Attack" with the name, and a prompt already shown
  stays until the target changes. Until then the dead native stays on
  parity, a no-op.
- Merged on fork parity 05192845 (2026-10-14): an invisible figure shows no name.
- Playtest eighteen (2026-10-14, Eli): ticked; no name over the invisible
  player's figure, back when the effect ends. Found: a Self cast shows no
  cast animation on the figure (docs/verbs/spell-cast.md, the hands).


## Self bursts (the class pass, 2026-10-17)

The census's Self burst class (13 learnable Apocalypse spells, an area at
the caster: Shock Nova, Battletide, Frost Nova, Life's Finale) has two gaps.
- MEASURED (playtest twenty-one, server.log 03:14:05.326): Battletide's
  area hit on test 2 reached the server in the same millisecond as its
  cast, ahead of it, and was refused, E_SPELL_NO_CAST. The engine raises a
  burst's hits in the frame it casts the spell, and the hit's event can
  come first; both go on one reliable channel, so the client's order is the
  server's. Fix on fork m2-self-burst 7ea47e5c: the player's own spell hit
  goes two updates after its event (skymp5-client hitService.ts), behind
  any cast this frame or the next sends. Weapon hits and a shout's held
  hits are unchanged.
- MEASURED (r-shock-nova 20261018-013824 and its repeat with the trace,
  20261018-074819, the engine alone, solo): two Shock Novas beside a placed
  bandit left the caster's health at 100 of 100 in every sample while the
  bandit took all four of the burst's effects (35 to dead, ragdolled). The
  caster's game also raised the explosion's hit events with the player
  itself among the targets (source Unarmed 0x1F4 and the rim effect's
  spell), which the engine did not turn into damage: a second reason the
  client drops the explosion's Unarmed stand-in (fork m2-area-report). So the engine spares a Self burst's own caster, and
  RunSelfSpell (ActionListener.cpp), which applies every effect of a
  fire-and-forget Self spell to its caster, the area's hostile ones
  included, hurts Shock Nova's, Frost Nova's and Life's Finale's casters on
  the server where the engine does not. The fix, fork m2-self-burst
  d0befa07 (in train m2-train-24): RunSelfSpell skips a detrimental effect
  with an area (MpActor::IsHostileArea, the burst's hostile part; the
  server's claim of the burst's targets is unchanged), with a SelfCastTest
  case on Fireball's area effect against Oakflesh's. In x-class-self 20261018-011427
  the server's Shock Nova line ("casts c00186d on itself") came with the
  caster's health at 1.0 in both games, which only says the lab's casters
  have more health than the burst takes.
