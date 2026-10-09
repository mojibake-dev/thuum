# Verb: spell-cast

## Intent

A player's spell is cast on every screen as the caster cast it, and its
end reaches every screen too; a spell that hurts another player hurts it
once, by the server's number, and begins a fight.

Roadmap reference: skymp ROADMAP.md "Spells" ("TODO: Add a few words on
spells sync") and "Damage"; thuum docs/PLAN.md, the M2 chart's second verb.
Milestone: M2   Class: B

## Authority

Rung: R1 for the cast (the caster's game casts, the server validates and
records it); R0 for what a spell does to another actor's health (ADR-028:
the server computes the damage one actor deals another).
Why not R0 for the cast: the cast is the engine's (the charge, the hand's
animation, the aim, the projectile's flight and what it strikes); the
server has neither a projectile model nor collision, and we reimplement
only what needs validation (CLAUDE.md).
What the server validates:
- the cast: the sender's own player (or an actor it hosts, as today); a
  spell its recorded equipment holds in that hand (as today: OnSpellCast's
  IsSpellEquipped); a known casting source; the aim within a quarter turn
  of level; no more casts than the cast budget allows;
- a concentration cast's span: open from its start to its end (the
  caster's stop, a new cast in that hand, the caster's death or departure),
  as server state;
- each spell hit on an actor: a recorded cast of that spell by that
  aggressor, unused for a fire-and-forget spell (one hit, and the area's
  other targets within the splash window), or open for a concentration
  spell; the target no farther than the spell's projectile can have flown
  (its PROJ speed, as marksman's arrows);
- the damage: the server's, from the spell's record (ADR-028), a
  concentration spell's per-second magnitude times the time it held its
  target, not per reported hit.
What it records unvalidated (R2), declared per rule 5:
- the aim, relayed for drawing only (as marksman);
- the magicka a cast costs: the caster's game spends it and reports its
  magicka as now (docs/verbs/attributes.md, R1 regeneration crop); a cast's
  cost depends on perks, skills and enchantments the server does not model
  until M5's leveling, and may lawfully be zero, so the server sets no
  lower bound.
Rate limit / bounds: SpellCast gets a budget (none today); spell hits are
bounded by casts as arrows are by shots; OnHit keeps marksman's budget.

## Engine surface

- The cast event: TESSpellCastEvent (CommonLibSSE-NG
  include/RE/T/TESSpellCastEvent.h:9-15: the caster as a reference, the
  spell's form id). Skyrim Platform sends it as `spellCast` for any caster
  (skyrim-platform EventHandler.cpp:1337-1423), with the caster's magic
  target, `isDualCasting` from the hand's MagicCaster, a `castingSource`
  read from which of the caster's selectedSpells holds the spell
  (include/RE/A/Actor.h:143-150, :680), and the aim (Actor::GetAimAngle,
  GetAimHeading, Actor.h:527-528). HYPOTHESIS until the lab: whether the
  event fires at a fire-and-forget spell's release or at its charge's
  start, which decides how long a recorded cast waits for its hit.
- The caster's state: MagicCaster (include/RE/M/MagicCaster.h:24-98):
  CastSpellImmediate(spell, noHitEffectArt, target, effectiveness,
  hostileEffectivenessOnly, magnitudeOverride, blameActor) (:46),
  FinishCast (:77), InterruptCast (:79), GetIsDualCasting (:67), the
  current spell and state (:89-90); Actor::GetMagicCaster by casting
  source (Actor.h:306) and Actor::InterruptCast (Actor.h:577). Casting
  sources, types and deliveries: include/RE/M/MagicSystem.h:23-45.
- The spell: SpellItem's casting type, delivery, charge time and a
  concentration spell's minimum duration (include/RE/S/SpellItem.h:51-55,
  :67-72). The server reads the same from the record: libespm SPEL's SPIT
  (libespm SPEL.h:62-80: cost, flags, type, charge time, cast type,
  delivery, cast duration, range).
- The observer's cast today (skyrim-platform MagicApi.cpp:49-155,
  `castSpellImmediate`): it applies the caster's behavior graph variables
  to the figure, then a concentration spell goes through
  MagicCaster::CastSpellImmediate at full effectiveness (:107-113) and
  every other spell launches its projectile, the spell aboard, from the
  figure's magic node (:115-151; Projectile::LaunchData's spell form takes
  the projectile from the spell's effect and carries the spell and its
  area, CommonLibSSE-NG src/RE/P/Projectile.cpp:213-222). `interruptCast`
  finishes the hand's cast or interrupts the actor (MagicApi.cpp:157-189).
  The observer casts the figure's own equipped spell for that hand, not the
  message's (skymp5-client remoteServer.ts:948-974), and a figure holds a
  million magicka (formView.ts:302-303), so a stream whose end is lost
  never runs dry: playtest six's Flames.
- What a figure's spell does in the observer's game: a figure deals no
  weapon damage there (formView.ts:288, attackDamageMult 0); nothing does
  the same for its spells, so a remote spell's effects land on the
  observer's own player by its own engine, while the caster's hit report
  reaches the server's OnSpellHit as well (ADR-028's context: possibly
  twice, unmeasured). The suppression has three candidates, each a
  HYPOTHESIS for the lab:
  1. launch a fire-and-forget spell's projectile without its spell
     (Projectile::LaunchData from the projectile alone,
     include/RE/P/Projectile.h:76, src/RE/P/Projectile.cpp:179-211): its
     flight, light and impact art with nothing to apply;
  2. cast a concentration spell through CastSpellImmediate at
     effectiveness 0 for hostile effects only (MagicCaster.h:46): the
     stream's art at no strength;
  3. the figure's five schools' magnitude modifiers at their floor
     (ActorValues.h:155-159, kAlterationPowerModifier to
     kRestorationPowerModifier), the way attackDamageMult covers weapons
     (ActorValues.h:162): one setting for every path, if the engine scales
     a spell's magnitude by them as their names say.
- The hit report: skymp5-client hitService.ts:44-68 sends a spell's or a
  scroll's hit as OnHit (reliable), at most one per aggressor per 100 ms.
  HYPOTHESIS until the lab: how often the caster's game reports a hit
  while a concentration spell holds its target.
- The cast's end on the caster's side: magicSyncService.ts:71-92 sends the
  stop only when an equip animation event (mlh_ or mrh_equipped_event,
  :134-137) follows a cast, which a stream's release does not always
  produce. HYPOTHESIS until the lab: the behavior graph variables that
  mark a hand casting (IsCastingLeft, IsCastingRight, IsCastingDual are
  the names to look for in the variables the client already captures,
  MagicApi.cpp:191-223), so the end is read from the caster's state
  rather than guessed from an animation event.
- The server today: OnSpellCast (skymp5-server ActionListener.cpp:
  2321-2405) refuses a dead caster and a spell not equipped (:2366),
  relays the client's message to the caster's neighbours unreliable
  (:2373; SendToNeighbours' default, ActionListener.h:160-161), and sends
  Papyrus OnSpellCast (:2385); effects are a TODO (:2398). A hit whose
  source is an equipped spell goes to OnSpellHit (:2407-2444): Papyrus
  OnHit, the TES5 spell formula (formulas/TES5DamageFormula.cpp:257-284:
  the sum of the spell's hostile or detrimental Health effects'
  magnitudes, with no skill, perk, dual cast or per-second scaling), the
  victim's health percentage, and nothing else: no cooldown, no claim, no
  fight (NotifyHostility runs from OnWeaponHit only, :2606).
- The wire: SpellCast is MsgType 23 in both directions (skymp-wire
  wire-schema skymp.rs:784-816), with no validator check and no budget
  (wire-validate lib.rs).

## Observe (host or acting client sees the intent before the engine acts)

- Hook point: Skyrim Platform's `spellCast` for the start; the caster's
  casting state, read each update, for the end (the HYPOTHESIS above).
- SP filter: the client sends only its own player's and its hosted actors'
  casts (today it sends every caster's, which the server refuses).
- Data captured: caster, target, spell, hand, dual cast, aim, the
  behavior graph variables (as now).
- Side effects of hooking here: none expected (events read, nothing
  blocked).

## Impose (observers render the server's decision)

- Mechanism: the server relays each cast it took, reliable; the
  observer's figure casts the message's spell from the message's hand
  (not its own equipped one), with the aim; a concentration cast runs
  until the server relays its end, which the server also sends when it
  closes the cast itself (the caster's death or departure, a new cast in
  that hand).
- Visual without simulation: the suppression candidate the lab confirms.
- Side effects: HYPOTHESIS (the hit art and sound on the observer's
  player when the figure's spell reaches it).

## Suppress (engine's own behavior blocked on non-hosts)

- What is suppressed: the effects of a figure's spell in the observer's
  game, on anything it reaches (the observer's player first).
- How: the candidate the lab confirms (above); nothing new on the
  caster's own game, whose spell's effects on others are replaced by the
  server's damage.
- Release condition: none (a figure is never this game's to simulate).
- Side effects: HYPOTHESIS.

## Message contract

- SpellCast (MsgType 23), both directions, unchanged fields (caster,
  target, spell, isDualCasting, interruptCast, castingSource, aimAngle,
  aimHeading, actorAnimationVariables).
- Validator rules (new): castingSource within 0 to 3; aimAngle finite and
  within plus or minus a quarter turn; aimHeading finite; spell not 0; a
  cast budget per client (bursts of dual casting and quick fire-and-forget
  casts; the numbers measured in the lab, then fixed in wire-validate).
- The server's relay: reliable (it is the start and the end of what every
  screen shows), and its own end of a cast is the same message with
  interruptCast set.
- Idempotency / ordering: not idempotent (each start is one cast);
  reliable and ordered, so an end never overtakes its start.
- Contract doc updated: in the same commit as the validator.

## Server

- Where the logic lives: a Rust rule (wire-rules, ADR-020), each actor's
  casts beside marksman's shots: a fire-and-forget cast recorded and
  claimed by its hit (one target, and an area spell's others within the
  splash window), a concentration cast opened and closed, a concentration
  hit's damage scaled by the time since that cast's last counted hit;
  ActionListener::OnSpellCast validates, records and relays reliable;
  OnSpellHit claims or refuses (logged E_SPELL_NO_CAST, E_SPELL_RANGE),
  computes the damage from the record and begins a fight (ADR-023,
  NotifyHostility).
- DB fields / migration: none (casts are runtime state).
- Restart behavior: none (an open cast ends with the caster's session).
- Papyrus natives touched: none new on the server (OnSpellCast and OnHit
  events as now); a client-only Skyrim Platform native for the
  suppression, if the lab picks a candidate that needs one, gets its
  NATIVES.md line.

## Client

- SP binding: Skyrim Platform's `castSpellImmediate` and `interruptCast`
  (MagicApi.cpp), changed for the suppression the lab picks.
- TS handler: magicSyncService.ts (its own and hosted casters only; the
  end from the casting state); remoteServer.ts (the message's spell and
  hand).
- Kill switch config key: `spellSync` under skymp5-client's settings.

## Tests

- T0: wire-rules (a hit with no cast refused; one fire-and-forget cast,
  one hit and its area's; a concentration hit only while open, its damage
  by time; a cast past its window refused); wire-validate (the bounds and
  the budget); the server (a cast of an unequipped spell refused, not
  relayed; a cast relayed reliable; a spell hit claimed, damage by the
  record, a fight begun; a second hit on one cast refused; an open
  concentration cast closed by the caster's death).
- T1: none.
- T2: a difftest session, a cast then its hit, then a hit with no cast:
  the legacy server relays unreliable and takes both hits; declared.
- T3 scenario id: lab/scenarios/b-spell.yaml: c1 casts a fire-and-forget
  spell at c2 and then holds Flames on it for a few seconds; c2 takes the
  server's damage once per cast and the stream's by its duration, its own
  game's health agreeing with the server's (no second path); c2's screen
  shows c1's figure casting the same spell and stopping when c1 stops; a
  fight begins in c2's game.
- Assertions that would fail if the verb silently regressed: c2's health
  on both sides against the server's number, the figure's cast ending on
  c2's screen, c2's game in combat.

## Dynamic plan (fill when any tag above is still HYPOTHESIS)

- Probe x-spell-probe, on the current build first: c1 casts Flames
  (Skyrim.esm SPEL 0x00012FCD, a starting spell of the Player NPC_, read
  with lab/esm.py for docs/verbs/favorites.md) at c2 for 3 s, then stops.
  Observed: the server log's OnSpellCast and OnSpellHit lines (how many
  hits a second the stream reports, and when the stop arrives), c2's
  health on both sides (the double damage), c1's behavior graph
  variables while casting and after (the casting-state names), c2's
  screenshots during and after (the figure's stream stopping).
- Then each suppression candidate on a build that carries it, the same
  steps, c2's own health the measure.
- A fire-and-forget spell the lab characters do not know is learned
  through the server first (its id read with lab/esm.py, never from
  memory).
- Owner: agent.

First run, x-spell-probe 20261009-225645 (fork m2-marksman 9a376816,
casts as parity has them): `player.equipspell 12fcd right` by console
put Flames in c1's right hand (its dump: equippedRight 0x12FCD). With
Right Attack held 3 s, c1's game reported six hits on c2, one every
200 ms or so for one second, and the server counted 8 damage for each,
48 in all: Flames' magnitude, which the record gives per second, taken
per report, five times over (the hit cadence, measured once). The stream
ended after about a second on c1's own screen though the key stayed down
(its screenshot at 1.5 s shows only the ready glow; HYPOTHESIS: why), and
c2's screen showed the figure with the same glow and no stream at 1.5 s
and after. c2's game read 0.5706 health 4.5 s after the release and
0.5986 five seconds later; the server's own number then was not
recorded, so the double damage is still open (the next run asserts it
right after the stream, and screenshots both seats half a second in). The
server logs nothing for a cast it takes.

## Status

- [x] doc complete, rung declared
- [x] engine surface cited or delegated (cited; five HYPOTHESIS tags for
      the lab: the event's timing, a stream's hit cadence, the casting
      state's names, the double damage, the suppression)
- [ ] server logic + T0
- [ ] message + validator (same commit)
- [ ] native hook + T1
- [ ] TS handler
- [ ] T2 green
- [ ] T3 scenario green, no HYPOTHESIS tags
- [ ] ledger and suppression registry updated
