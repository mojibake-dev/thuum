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
  GetAimHeading, Actor.h:527-528). CONFIRMED for a stream (x-spell-time
  20261010-105451): it fires once, about 300 ms after the hand's
  MRh_SpellAimedConcentrationStart, when the stream begins and magicka
  starts to fall (2068 ms after 1765, and 599 after 281). CONFIRMED for a
  fire-and-forget spell (x-spell-observe 20261010-114556, Firebolt): it
  fires at the release, about 200 ms after the hand's
  MRh_SpellRelease_Event (1939 ms after 1739; the charge's
  MRh_SpellAimedStart at 250 and MRh_SpellReady_Event at 766, Firebolt's
  half second), and the bolt's hit followed 64 ms later; the magicka goes
  during the charge. So a recorded cast waits for its hit no longer than
  its projectile's flight.
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
  the same for its spells. MEASURED (x-spell-observe 20261010-114556):
  on the player it targets, nothing lands. c2's watch recorded no hit
  taken and no magic effect applied while c1's figure streamed Flames at
  it for 5.7 s and cast Firebolt at it once, and c2's health moved only by
  the server's steps (1.6 each 200 ms, then 25.8 once). In the code, the
  cast message names its target by server id, and remoteServer.ts:952's
  lookup answers 0 for a player's own id, as for the caster's echo below;
  what the engine then does with a cast at form 0 was not measured and
  the verb does not rest on it.
  A bystander sees the stream (x-spell-side 20261010-115131: c2 off the
  line saw c1's figure's Flames across its view). An NPC the observer
  hosts is the NPC milestone's: a figure's spell can land on it in the
  host's game, whose report of its health would count beside the server's
  (ADR-028). For that milestone, three untested suppression candidates:
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
  CONFIRMED for Flames (x-spell-time 20261010-105451): while the stream
  holds its target, the caster's game reports hits in pairs, both within
  2 ms, a pair every 200 ms or so (26 events over 2.63 s), and the
  client's limit lets one of each pair through: 14 OnHit reached the
  server over those 2.63 s.
- The cast's end on the caster's side: magicSyncService.ts:71-92 sends the
  stop when an equip animation event (mlh_ or mrh_equipped_event,
  :134-137) follows a cast. CONFIRMED (x-spell-time): the hand's
  MRh_Equipped_Event is sent to the caster's graph at the stream's end,
  at the key's release (3286 ms for a release at about 3281), and
  IsCastingRight reads true from the stream's start to about 200 ms after
  that event (1767 to 3466 ms, 282 to 3497). The event is the end to use;
  the stop failed only on its lookup, which took the caster by its server
  id and found no figure in its own game, so it read the variables of
  form 0 and died (c1.log in x-spell-state 20261010-103607 and in
  x-spell-time, once per stream).
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

- Hook point: Skyrim Platform's `spellCast` for the start; the hand's
  equipped event on the player's own graph (MLh_ or MRh_Equipped_Event,
  the sendAnimationEvent hook filtered to the player) for the end.
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
- Visual without simulation: the figure's cast, which lands nothing on
  the player it targets (MEASURED above) and shows to bystanders; its
  stream runs from the relayed start to the relayed end, about 250 ms
  behind the caster's (x-spell-observe: the figure's magicka fell from
  852 to 6582 ms in c2's game against c1's stream from 584 to 6267;
  x-spell-side: 819 to 8495 against c1's end at 8259).
- Side effects: the target sees no flame and no burning on itself, since
  nothing lands there (a T4 question: whether being flamed should show).

## Suppress (engine's own behavior blocked on non-hosts)

- What is suppressed: nothing new for players: a figure's spell lands
  nothing on the player it targets (MEASURED, above); the caster's own
  game's effects on a figure are that figure's, which the server's
  ChangeValues overwrite (a figure holds a million health, formView.ts).
- How: the target lookup as it stands; the candidates above wait for the
  NPC milestone, where a host's NPCs can be a figure's targets.
- Release condition: none (a figure is never this game's to simulate).
- Side effects: none measured.

## Message contract

- SpellCast (MsgType 23), both directions, unchanged fields (caster,
  target, spell, isDualCasting, interruptCast, castingSource, aimAngle,
  aimHeading, actorAnimationVariables).
- Validator rules (new, fork ba22a406): castingSource within 0 to 3;
  aimAngle finite and within plus or minus a quarter turn; every float
  finite; spell not 0; a cast budget per client, eight at once and four a
  second after (a cast charges first, Firebolt's SPIT charge time being
  half a second, and a stream's start and end are two messages from up to
  two hands), to be checked against the lab's casting.
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
- A hit's reach is the longest range among the spell's effects'
  projectiles (MGEF DATA 0x48, PROJ DATA 0x0C), with 256 units of slack. A
  spell that launches none reaches 512 units (PartOne.cpp kTouchReach), a
  chosen bound, unmeasured: in the five masters every hostile spell
  delivered by touch or at a target actor is, by its editor id, a
  creature's attack, a trap's, a perk's, an enchantment's or a daedra
  banishing's, none cast from a player's hand (2026-10-10 scan of SPEL
  SPIT delivery 1 and 3), so the bound is for mods'.
- DB fields / migration: none (casts are runtime state).
- Restart behavior: none (an open cast ends with the caster's session).
- Papyrus natives touched: none new on the server (OnSpellCast and OnHit
  events as now); a client-only Skyrim Platform native for the
  suppression, if the lab picks a candidate that needs one, gets its
  NATIVES.md line.

## Client

- SP binding: Skyrim Platform's `castSpellImmediate` and `interruptCast`
  (MagicApi.cpp), changed for the suppression the lab picks.
- TS handler: magicSyncService.ts (a stop for each hand of the player's
  own casts, read from its own graph; fork 5ea5468a); remoteServer.ts (the
  message's spell and hand; 5ea5468a).
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
(its screenshot at 1.5 s shows only the ready glow; explained by
x-spell-time below: the draw), and
c2's screen showed the figure with the same glow and no stream at 1.5 s
and after. c2's game read 0.5706 health 4.5 s after the release and
0.5986 five seconds later; the server's own number then was not
recorded, so the double damage is still open (the next run asserts it
right after the stream, and screenshots both seats half a second in). The
server logs nothing for a cast it takes.

Second run, x-spell-probe2 20261009-233645, the same steps: six hits of
8 again over one second (40 a second for a spell the record gives 8 a
second), and again nothing after it though the key stayed down for 3 s
(explained by x-spell-time below: the draw). Read together right after the
stream, the server had c2 at 0.555 and c2's own game at 0.5571; three
seconds later 0.562 and 0.5721: c2's game is not below the server's
number, so no second path shows, though no screenshot has yet caught the
figure's stream (c2's at 0.6 s shows the figure's hand glowing, before
the first hit), so whether the figure streams at all in the observer's
game is still open. Screenshot steps take about a second each through
the guest agent, too slow to time against a one-second stream.

Ruled out for the early end (2026-10-09, reading the code): the server's
relay reaches the caster too, since every actor listens to itself
(MpObjectReference.cpp:713-722, "Self-subscription is OK"), but the
caster's client drops its own echo: remoteServer.ts:952 looks the caster
up as a figure, and the player's own form has no figure unless the debug
setting show-me is on (formViewArray.ts:43, :82, :98-105), so the lookup
answers 0 and the handler returns.

Third run, x-spell-state 20261010-103607 (the graph-vars step): its
screenshot steps took 3.2 s and 2.3 s, so both landed after the key's
release, and the four graph variables read false at every read; the
magicSyncService stop died at 10:38:06.34 (c1.log), reading form 0's
variables.

Fourth run, x-spell-time 20261010-105451 (the watch's self record, thuum
95559aa: c1's magicka and the animation events sent to its graph, stamped
in ms): the early end is the draw. Alone, with its hands sheathed, c1's
key press first drew them (Magic_Equip at 256 ms) and the stream began
only at 1765 ms, so 1.5 s of the 3 s hold went to the draw; the hand
returned to its equipped state at 3272 ms, the release. At c2 a moment
later, hands drawn, the stream ran from 281 ms to 3286 ms, the whole
hold, magicka falling the whole time (100 to 68.29, about 12 a second).
Every earlier probe held from sheathed hands, and graph-vars read during
the draw. The current server (parity 7be31a9d) counted 8 for each of the
14 OnHit, 112 against c2's 90: c2 died in its own game (Ragdoll at 2719
ms). c2's own health fell only in the server's steps of 8 and rose by
regeneration between them, with no fall between, so no second path shows
again; whether c1's figure streams at all in c2's game is still open (the
observer casts its figure's equipped spell, remoteServer.ts:948-974, and
the watch did not yet record hits taken).

## Status

Building on fork branch m2-spell, stacked on m2-marksman 7be31a9d
(2026-10-10): d39afaa2 the casts rule (wire-rules casts: a fire-and-forget
cast covers its first hit and an area spell's further targets within the
splash window, once each; a stream is open from its start to its end, a new
cast in that hand or the caster's departure, and each hit counts the time
since the stream's last counted one, at most 250 ms; every hit within the
spell's reach; the newest cast first), bridged as SpellCasts; 46c6558a
libespm reads a magic effect's projectile and a projectile's range (UESP's
MGEF and PROJ layouts; the masters scanned with lab/esm.py: projectile
speeds reach 99999 units a second for missiles and 90000 for beams, so a
spell's hit is bounded by its projectile's range, not by time); ba22a406
the validator and the cast budget; c36d27fd the server (StartCast from the
records, a stop that needs no equipped spell, both relayed reliably; spell
hits claimed or refused, E_SPELL_NO_CAST and E_SPELL_RANGE, the damage
scaled by the claim, a fight begun; a departing caster's streams end) and
SpellCastTest (fork pipeline 1140 green); 5ea5468a the client (a stop for
each hand of the player's own casts, from its own graph; the observer
casts the relayed spell); 0fe3e6dc the difftest session. Left: the
suppression, if the observer's game shows a second path once its figure
casts the relayed spell; T2; the lab.

- [x] doc complete, rung declared
- [x] engine surface cited or delegated (cited; HYPOTHESIS tags left for
      the lab: a fire-and-forget cast's event timing, the double damage,
      the suppression; the stream's event timing, its hit cadence and the
      casting state CONFIRMED by x-spell-time)
- [x] server logic + T0 (fork c36d27fd, pipeline 1140)
- [x] message + validator (no new message; the validator's bounds and the
      cast budget, ba22a406)
- [ ] native hook + T1
- [ ] TS handler
- [ ] T2 green
- [ ] T3 scenario green, no HYPOTHESIS tags
- [ ] ledger and suppression registry updated
