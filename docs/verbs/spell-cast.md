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

- A stream's aim on a figure (the re-analyst on sky-re, 2026-10-16, 1.6.1170,
  ids by lab/addr.py; HYPOTHESIS until a recorded playtest's launches or a
  Frida trace on 37930): the figure's own caster launches its stream
  (MagicCaster::UpdateImpl 34400 calls 34450 whenever its projectile timer
  runs out), taking angleZ from Actor::GetAimHeading 37929 and angleX from
  Actor::GetAimAngle 37930; the stream then re-aims every frame from the same
  two (FlameProjectile UpdateImpl 43894, BeamProjectile UpdateImpl 43749,
  angleX clamped to plus or minus 1.553343 by 44174). 37930 returns
  -AimPitchCurrent when the actor's graph has bAimActive and the reference's
  angle.x otherwise (CommonLibSSE-NG src/RE/A/Actor.cpp:275-296,
  include/RE/F/FixedStrings.h:187-200); the observer's castSpellImmediate
  passes no angle a stream uses (MagicApi.cpp's CastSpellImmediate: no
  angles, FindTargets 34410 launches only target-location effects), and
  nothing set the figure's pitch while it stood (movementApply passes only a
  heading offset). So playtest nineteen's Flames aimed straight up flew
  level on the other screen, the damage, the caster's own, going up. A bolt
  differs: Skyrim Platform's spell LaunchData sets the angles with useOrigin
  and no auto-aim, and a missile never reads its shooter's aim again
  (src/RE/P/Projectile.cpp:213-222), which is why Firebolt aimed right. The
  fix (fork m2-arrow-path 13a58aed): setActorAimPitch writes a figure's
  reference pitch and its AimPitchCurrent each update from its player's
  movement (formView, forms another game drives), so either branch of 37930
  reads the caster's pitch. HYPOTHESIS: the behavior graph does not overwrite
  AimPitchCurrent between updates (the behavior files say, not the exe).
  MEASURED (x-class-streams 20261018-102216 on train m2-train-24 against
  013048 on parity): the figure's stream in c2's game left at heading
  3.1427 rad against c1's own 3.1416 (0.06 degrees), where parity gave
  3.0865 (3.16 degrees off) for all four streams; bolts left at 3.1416 on
  both screens in both runs. Which change on the train closed the heading
  is unread (the aim-heading fix is pinned to train-25, x-stream-aim2 its
  probe), so the cause stays HYPOTHESIS; the pitch's measurement is
  train-25's.

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
casts the relayed spell); 0fe3e6dc, 3aef8c78 and 98c7a478 the difftest
session and its declarations; 45839102 kTouchReach's comment. The lab
tooling beside it, in thuum: the watch's self record and each watched
actor's magicka (95559aa, d6a4181, 35b4ef6), c.watched's drainMs and
drainEndMs (42aa735), labCommand learn-spell (47dace4). DONE 2026-10-10:
merged to parity 45839102.

Playtest thirteen (2026-10-11, Eli, parity f828279f): Flames from the
right hand played and stopped on the other screen as built; from the left
hand, the other screen's figure streamed from its right hand and never
stopped. Cause (read in the code): Skyrim Platform's spellCast event names
no hand of the engine's (TESSpellCastEvent carries the caster and the
spell only) and inferred it from the slots holding the spell, the right
one winning a tie (skyrim-platform EventHandler.cpp, the TESSpellCastEvent
handler), so with Flames in both hands a left-hand cast was reported as the
right hand's, the figure cast it there, and the left hand's end
(MLh_Equipped_Event) found no left-hand cast to stop. Fix on fork m2-pt13
40d15f6d: the event reads each hand's caster when it fires (MagicCaster's
currentSpell and state, CommonLibSSE-NG include/RE/M/MagicCaster.h:29-41,
:89-90) and the hand charging or casting the spell breaks the tie.
The clones' control map binds the left attack to End since thuum 8615b9b.
x-left-flames 20261012-021751 (the client before the fix) reproduced it: c1
streamed Flames from the left hand for 4 s and the server counted the hits,
while c2's figure of c1 drained magicka from 0.9 s to the end of the watch
at 9.7 s (it never stopped). CONFIRMED fixed: the same probe on fork
m2-shouts c4641e26 (which merges m2-pt13), x-left-flames 20261012-031332:
the figure drained from 0.7 s to 4.9 s, the 4 s stream and its relay's
delay, then stopped.

Watch item (ADR-027, the stagger merge sweep 2026-10-11): b-spell red once
(20261012-004816): after the four-second Flames stream, c2's own game read
0.6477 and the server 0.692, outside the scenario's 0.02; green on both
reruns (20261012-010948, -011230). HYPOTHESIS: c2's own game took a little
of the figure's stream itself that once (a figure's spell lands nothing on
the player it aims at, x-spell-observe, so this would be a rare race of the
figure's hit), or the sample caught c2's game before the server's last
health message. A second red within two sweeps makes it a bug.

- [x] doc complete, rung declared
- [x] engine surface cited or delegated (cited; every tag the lab could
      settle settled: the cast event's timing for a stream and a
      fire-and-forget spell, the hit cadence and the casting state by
      x-spell-time and x-spell-observe; the double damage MEASURED absent;
      the suppression not needed for players)
- [x] server logic + T0 (fork c36d27fd, pipeline 1140)
- [x] message + validator (no new message; the validator's bounds and the
      cast budget, ba22a406)
- [x] native hook + T1: no new native (Skyrim Platform's castSpellImmediate
      and interruptCast, MagicApi.cpp, as they are); T1 none
- [x] TS handler (5ea5468a; x-spell-observe 20261010-114556: the stop
      reaches the observer, whose figure's stream ends about 250 ms after
      the caster's)
- [x] T2 green (2026-10-10 on fork 98c7a478: all 18 sessions identical up
      to their declarations, spell-cast's ten)
- [x] T3 scenario green, no HYPOTHESIS tags: b-spell (thuum 9ed66b8,
      awaiting Eli's review) green twice (runs 20261010-121505 and
      -121750)
- [x] ledger and suppression registry updated: no native added; no
      suppression for players (a figure's spell lands nothing on the player
      it targets, MEASURED), three untested candidates kept for the NPC
      milestone. Changed 2026-10-14 (fork m2-push 4e8aa04c, docs/verbs/
      push.md): that held only by skymp5-client's hit-time dispel (ae8446a9,
      2026-10-13). Now a figure's spell runs on the player except its
      Health, Magicka and Stamina value effects, which the player's
      AddTarget refuses (the server's numbers; b-duel's Flames and Fire
      Breath unchanged)
- [x] merged: the sweep on fork m2-spell 45839102 went 32 of 32 green with
      no rerun (runs 20261010-122057 to -134720); fork parity fast-forwarded
      to 45839102, both clones' clean-m1 promoted

## Playtest fourteen (2026-10-12, Eli, parity ef3fb03c)

- Held: Flames from test 2's left hand shows from the left hand on test 1's
  screen and stops with it (the MagicCaster tie-break, m2-pt13).
- Found: a concentration spell shows on the observer's screen without the
  casting animation (the flames leave the figure's hands, the hands do not
  rise), where a fire-and-forget spell plays it on both screens. A visual
  slice (R3): which animation events a concentration cast fires and which
  the relay carries is to read.
- Read (2026-10-12): a concentration cast sends the caster's graph its
  start and its release in one frame (x-dual-cast:
  MRh_SpellAimedConcentrationStart at 282 ms, MRh_SpellRelease_Event at
  283), and the animation relay sent
  the last event of each frame (skymp5-client sync/animation.ts,
  AnimationSource, read once a frame by sendInputsService.ts), so a figure
  got the release alone; a fire-and-forget cast's BeginCast and its fire
  come seconds apart, and both went. Fork m2-visuals 4cb2082e sends the
  events the graph took in order, one a frame (a burst keeps its newest
  eight). CONFIRMED (x-dual-cast2 20261013-072430, m2-visuals 140ed04d's
  client): c2's watch saw the figure get MRh_SpellAimedConcentrationStart
  and its release one frame apart (237 and 252 ms), then the left hand's
  (486 and 504 ms); its graph took the left hand's and refused the
  right's, and c2's screenshot mid-cast shows the figure with both hands
  raised and burning, where x-dual-cast's showed one stream from a hand at
  its side. Why the graph refused the right hand's start is open.
- Dual casting (Eli, 2026-10-12: "we'll also have to account for dual
  casting as well"): unread today on both ends. The client reports
  isDualCasting (magicSyncService.ts:113), but the server never reads it, so
  a dual cast counts as the reporting hand's cast. The observer's game plays
  a relayed cast from one hand (remoteServer.ts, castSpellImmediate with
  the message's castingSource). To measure in the lab before the slice:
  - which spellCast events a dual cast fires, with what isDualCasting;
  - what the hits report and what the server counts;
  - the other screen.
  The game's dual-cast power, cost and perk gate come from Skyrim.esm's
  settings and perks, read with lab/esm.py, never from memory; perks are
  M5's.
- x-dual-cast (run 20261013-054049, 2026-10-12, fork parity c918a7a1): c1
  held Flames in both hands at c2 150 units ahead, Home (right) and End
  (left) for 4 s each, pressed 234 ms apart: two casts, not a dual cast (c1
  has no Dual Casting perk, and the presses were not together).
  - c1's game: MRh_SpellAimedConcentrationStart at 282 ms and
    MLh_SpellAimedConcentrationStart at 516 ms, a spellCast event per hand
    (603 and 851 ms, both 0x12FCD), each hand's Equipped event as it stopped
    (4303 and 4521 ms). It charged both: 12.4 magicka a second with the
    right hand alone (617 to 833 ms), 24.2 with both (1.0 to 4.0 s), 12.7
    with the left alone (4315 to 4466 ms).
  - Its hit events came as two series, one per hand, each every 200 ms, the
    left's 32 to 65 ms behind the right's, and every hit event twice, 0 to
    2 ms apart.
  - The client sent one series: hitService.ts:53-64 drops a caster's magic
    hit within 100 ms of its last ("prevent double hit that happens for
    some reason with magic projectiles"). Meant for the doubled event, it
    drops the other hand's hits too.
  - The server counted one stream: 19 hits from 05:42:53.007 to 56.635, each
    about 0.2 of a stream-second, 3.63 in all; one more (56.889) came after
    the left hand's stop and was refused E_SPELL_NO_CAST. Were both series
    to arrive, the rule would still count one: casts.rs claim() gives a hit
    to the first open stream of its spell (hands 0 to 3 in order) and counts
    the time since that stream's last counted hit, so two hands' reports of
    one spell add up to the wall clock once.
  - c2 lost 8.1 Health a second (98.4 at 1.0 s to 74.2 at 4.0 s), one
    stream at Flames' magnitude (EFIT 8 a second), and ended at 0.734, inside
    b-spell's single-stream band (0.64 to 0.78).
  - The observer: c2's screenshot mid-cast shows the figure's right hand
    streaming and nothing in its left, and the figure's magicka on c2's
    screen drained 6.2 a second, as in b-spell's one-hand run (20261013-044857),
    though the server relayed both casts (OnSpellCast relays every cast of an
    equipped spell; castingSource 1, then 0). c2's game runs one stream.
- The game's rule (Skyrim.esm through lab/esm.py, and CommonLibSSE-NG):
  - With the school's perk (AlterationDualCasting 0x153CD,
    ConjurationDualCasting 0x153CE, DestructionDualCasting 0x153CF,
    IllusionDualCasting 0x153D0, RestorationDualCasting 0x153D1: each an
    entry point 75, kCanDualCastSpell, include/RE/B/BGSEntryPoint.h:88), a
    cast from both hands at once is one overcharged cast:
    fMagicDualCastingEffectivenessBase 2.2 (GMST 0x361F6),
    fMagicDualCastingCostMult 2.8 (0x361F4), fMagicDualCastingTimeMult 1.0
    (0x361F5). UESP agrees: "2.2x spell effectiveness for 2.8x spell cost"
    (https://en.uesp.net/wiki/Skyrim:Magic_Overview, Dual-Casting).
  - Without it, UESP: "casting a spell with both hands has the same
    effectiveness as though cast normally, but twice". CONFIRMED (Frida,
    x-dual-stack 20261013-061434): two streams of one spell from one caster
    both damage one target, each its own effect (a forum answer had said a
    fire spell's effect overwrites itself). The static read had leaned
    that way: Flames' damage (MGEF 0x13CA9) is a Value Modifier on
    Health (DATA EffectType 0, PrimaryAV 24; lab/esm.py with UESP's MGEF
    layout), and CommonLibSSE-NG annotates
    ValueModifierEffect::GetAllowMultipleCastingSourceStacking (vfunc 0x11,
    include/RE/V/ValueModifierEffect.h:18) as { return 1; } where
    ActiveEffect's (A/ActiveEffect.h:79) is { return 0; }.
  - Dynamic plan (rule 8): lab/frida/effect-stack-trace.js in c1's game
    (probe x-dual-stack) counts the engine's value-modifier effects of
    Flames on c2's figure by hand, and their Update and ModifyActorValue
    calls. The engine damages a figure like any actor; the client only keeps
    it immortal (1,000,000 Health, formView.ts:302) and steers its percentage
    from its player's reports (movementApply.ts:147). One hand for 3 s, then
    both for 4 s: one effect object (hand 1), then two (hands 1 and 0) both
    modifying if both count, or one if the second refreshes the first.
  - The run: the right hand alone ran one effect of Flames on the figure
    (castingSource 1, magnitude -8), Update and ModifyActorValue each about
    26 times per 500 ms; both hands ran two effect objects at once, hands 1
    and 0, each modifying about 25 times per 500 ms through the same 4.5 s.
    The first effect's ModifyActorValue named the figure (ff00081d), and all
    three effects read the same target field. The script's offset check
    failed: a MagicTarget at Actor+0x98 read no form id on 1.6.1170, so the
    target is known by that shared field and that call's own Actor, not by
    the derived id (the offset is to pin in a later run).
- The slice: both count, so the server owes a two-handed stream twice a
  one-handed one's damage, and counts it once today. Its two halves:
  - the client keeps a magic hit unless it is the engine's double of the
    one before; which of a hit event's fields tell the double from the
    other hand's hit is what the lab watch now records (each hit's
    projectile and flags, lab-driver ef3f95a, probe x-dual-cast2): a time
    window alone would also drop the second hand of a two-button press,
    whose hits fall in the same frame as the first's. Read
    (x-dual-cast2): a double carries the same target, spell, projectile
    (0x12FCF) and flags as its original, 0 to 1 ms apart, so nothing but
    the frame tells them apart; the client keeps every other copy of a
    caster, target and spell within a frame (m2-visuals 7da7210f), and a
    double that slips across a frame's edge adds nothing to a stream the
    server counts by its time;
  - the server counts each hand's stream on its own clock (a hit claims the
    open stream of its spell with the oldest counted hit; one hand that
    misses can then overcount, bounded by MAX_TICK_MS); T0 for two hands,
    one hand, and a hand that misses;
  - the overcharge: a cast reported with isDualCasting while
    both hands hold its spell counts 2.2 times its magnitude; the perk gate
    is M5's, so until then the perk is recorded unvalidated (R2, as Eli's
    headshot call);
  - the observer's second hand joins the concentration-cast animation
    slice above.
- Found in the server log: every Lost Grimoire Teleportation cast logged
  "CastFactsFor - b0a86df: Record 0x50a86de doesn't exist; cast as
  fire-and-forget within 512 units". CastFactsFor (PartOne.cpp:1376-1420)
  looks up each effect by the SPEL record's own EFID and the effect's
  projectile by the MGEF's own field: inside a plugin those ids count the
  plugin's masters (LostGrimoire.esp's own records are 05xxxxxx there, 0B
  in the load order), so a plugin spell's facts fall back to a touch
  spell's. Skyrim.esm's ids are global, which hid it. Harmless for
  Teleportation (no hits); a plugin's damage spells (Apocalypse's) would
  lose their reach and area. The fix maps both through their records'
  lookups (LookupResult::ToGlobalId, as MpActor.cpp:2718 does for
  effects). Merged on fork parity c918a7a1 (2026-10-12): T0 SpellCastTest
  reaches a target 2000 units off with Dragonborn.esm's Miraak lightning
  storm (its projectile's 6144).
- Found (2026-10-13, reading the shout relay): ActionListener::OnSpellCast
  takes a cast whose caster is 0x14 as the sender's own actor and relays
  the client's bytes unchanged (SendToNeighbours), so a neighbour's game
  reads that caster as its own player: castSpellImmediate would make the
  neighbour's player cast the sender's spell. skymp5-client's spell casts
  name the server id (magicSyncService.ts, localIdToRemoteId), so honest
  clients never hit it, but any client can (the difftest sessions' casts
  say 20, and the wire stack relays them as they came). The shout relay
  sends what the server resolved since m2-visuals 2b6dd88f; the spell relay
  is to do the same (a server-built SpellCastMessage, every listener but
  the caster, as OnPlayerBowShot's arrow relay), with the spell-cast and
  marksman sessions' declarations redrawn. Rule 5: client-reported
  anything is untrusted.
- Built on fork m2-relay (184bcc6f, parity 11c126b9 merged in dd3f729c):
  ActionListener::RelayCast sends the cast as the server resolved it, its
  caster a form id, to every listener but the sender, for the spell's
  start, its end and the shout alike; SpellCastTest pins the caster and
  that the caster's own game is sent neither. Its first full T2
  (2026-10-13, dd3f729c) differed in spell-cast alone, as built: the
  legacy server echoes c1's start and end to c1 and passes c1's bytes
  (caster 0x14) to c2, the fixed server sends c1 neither and names c1 by
  its form id to c2; marksman stayed identical (the arrow relay was
  already the server's). 1aa96a8f declares the three, and spell-cast is
  identical with them (T2 partial, pipeline 1344). Merged with m2-fifteen
  (parity 8eb4e78e, 2026-10-13) after its full T2 (25 sessions identical)
  and ADR-030's gate (run set 20261014-002126-merge-m2-fifteen, 13 of 13
  green, no rerun).
- Dual casting counted per hand, CONFIRMED on the lab (x-dual-cast3
  20261013-092233, fork m2-visuals be69bf68): two hands of Flames for 4 s
  reached the server as 38 hits, 7.15 stream-seconds in all (x-dual-cast:
  3.63), and c2 ended at 0.445 on the server and 0.447 in its own game
  (one stream: 0.73; no local damage on top since be69bf68), no hit
  refused. It took three fixes: the client's per-frame double filter
  (7da7210f), wire-rules' clock per hand (1abfda55), and Skyrim
  Platform's spellCast event naming the second hand (0f4e3b75: with the
  same spell in both hands both read as casting once the second began, so
  it went out as the right hand's and replaced that stream on the server;
  x-dual-cast3's first run, 20261013-082306 on 31b56fc9, counted 3.63).
  The figure's graph took none of the relayed cast events this run, where
  x-dual-cast2's took the left hand's: the hands' pose on the other screen
  is a playtest item.
- Dual casting per hand and the relayed hand animation in order: merged on
  fork parity 11c126b9 (2026-10-13 05:31: the sweep of every scenario on
  m2-visuals be69bf68, 40 of 40 green, and T2 green on 11c126b9, which adds
  a difftest session change alone).

## Playtest fifteen (2026-10-13, Eli, parity 11c126b9)

- Passed: Flames at test 1 from one hand, then from both: about 7 health a
  second from one, about twice that from two (dual casting per hand, at T4).
- Found: the figure raises its hands for a concentration spell but never
  makes the cast's own motion, the grab and push that drives the stream
  (Eli: "the hands ARE readied, they're raised, but they dont do the like,,,
  grab push hand animation"), while a fire-and-forget Firebolt's wind-up
  shows. The relay sends the cast's events in order since 4cb2082e, and the
  figure's graph does not play the push from them (x-dual-cast2's figure
  took the left hand's events, x-dual-cast3's none). To read: which events
  or graph variables start a caster's concentration push, and why the
  figure's graph refuses them.
- Read (2026-10-13, static; the fork at m2-fifteen 744fddb0): the caster's
  graph variables already travel. magicSyncService.ts sends
  UpdateAnimVariables (MsgType 24) every 500 ms while magic is equipped
  (:31, :196) and the same snapshot inside each SpellCast; the server
  relays the first to the neighbours as it came
  (ActionListener::OnUpdateAnimVariables); the observer writes it into the
  figure's active graph (remoteServer.ts onUpdateAnimVariablesMessage,
  Skyrim Platform applyAnimationVariablesToActor). The snapshot is the
  master behavior's casting set: bWantCastLeft, bWantCastRight,
  bWantCastVoice, IsCastingLeft, IsCastingRight, IsCastingDual,
  bCastReady, bMagicDraw, bMLh_Ready, bMRh_Ready, NotCasting, CastBlend,
  CastBlendDamped and the hand types, among 60 bools, 19 floats and 14
  ints (skyrim-platform Magic/AnimVariableMasterGraphIndexes.cpp:3-100,
  by index into the graph's variable set, AnimationVariablesForMasterBehavior.h,
  bWantCastRight 72). TiltedEvolution syncs the same set for its remote
  actors, several marked "added extra for spell cast sync"
  (Code/encoding/Structs/Skyrim/AnimationGraphDescriptor_Master_Behavior.cpp;
  a map only, ADR-005). Two things stand out:
  - The write is by index alone: ApplyVariablesToActor
    (Magic/AnimationGraphMasterBehaviourDescriptor.h) checks no identity
    of the behavior, where TiltedEvolution keys each descriptor to its
    graph. A behavior mod would shift every index; the lab's set has none
    (docs/MODS.md).
  - HYPOTHESIS, false (the parity read below): the engine rewrites an
    actor's casting variables from its own state every frame, so a figure
    keeps the caster's bWantCastRight for a frame every 500 ms, and its
    graph refuses the relayed MRh_SpellAimedConcentrationStart, whose
    transition wants the cast held.
- The read (ADR-031, superseding the single probe x-cast-pose drafted the
  same day): the references r-spell-stream A and B (Flames from the player
  at a placed NPC, and from the NPC at the player) and the parity run over
  b-spell's action. The recorder samples Skyrim Platform's 93 variables
  and every graph event on both games, so the actor-figure view's diff
  names what the figure lacks: the refused
  MRh_SpellAimedConcentrationStart, the variables the engine's caster
  holds and the figure does not (bWantCastRight, IsCastingRight,
  CastBlend, if the hypothesis holds). If the figure holds the caster's
  values and still refuses the start, the variables are not the gate and
  the next read is the state the figure's magic behavior is in.
- Read (2026-10-14, ADR-031's first parity of a cast): x-recorder-flames
  20261014-081353, c1's Flames for 4 s at c2, against r-spell-stream-a
  20261014-081151, the same cast by the player in a solo game. On c2's
  screen c1's figure held every casting variable the engine alone's caster
  holds (IsCastingRight 1, bWantCastRight 1, CastBlend 1, NotCasting 0,
  bMRh_Ready 0, iState 10), so the variables are not the gate. What it
  lacked: the engine's caster takes MRh_SpellAimedConcentrationStart and
  MRh_SpellRelease_Event in one frame (both at 1264 ms); the figure was
  never sent the start and refused the release (1172 ms). The cause is the
  receiver: remoteServer kept one animation per form (form.animation =
  msg.data), and the view applied it once a frame, so a start and a release
  reaching the observer within one of its frames left the release alone
  (fifteen's x-dual-cast2 had them a frame apart, and both played). Fix on
  fork m2-push 4f13fa50: the relayed events queue on the form, and the view
  plays them all in order. To read again with the parity run on its
  staging.
- Read (2026-10-14, the staging of m2-push 4f13fa50): the queue is not
  enough. x-recorder-flames 20261014-140607: the figure was sent both
  events, in order, at 1286 ms, and its graph refused both. Its casting
  variables arrived 162 ms later with the relayed cast (castSpellImmediate
  applies the sender's snapshot), where the engine's caster sets them in
  the frame it takes the start. HYPOTHESIS that the want variable gates the
  start: false. x-figure-cast 20261014-142425 sent c1's figure in c2's game
  the start alone, with bWantCastRight set in the same tick, and with
  IsCastingRight too, and the graph refused all three. The control,
  x-cast-solo 20261014-142917, did the same to the player's own graph in a
  solo game with no SkyMP client, and that graph refused all three too.
  (The control's real cast did not fire, so that half says nothing; the
  engine's own cast is r-spell-stream-a's.) So no graph takes
  MRh_SpellAimedConcentrationStart from Debug.SendAnimationEvent: the
  engine's caster gives the graph something a scripted event does not. The
  pose is not the animation relay's to give. A figure makes the cast's
  motion only if this game's engine casts for it through the caster's own
  states, which castSpellImmediate skips (it fires the spell at once).
  Next: read how ActorMagicCaster starts a concentration cast (its states
  and what it hands the graph), so the relayed cast can start the figure's
  caster the engine's way. Off playtest seventeen. The queue stays: no
  relayed event is lost any more.
- Read (2026-10-14, the re-analyst on sky-re, static; HYPOTHESIS until the
  probe): the engine's caster never sends the start by name. MagicCaster
  CastSpell (34401, the entry the player's input and the combat AI share)
  sets the spell and calls RequestCastImpl (34136), which sets
  bWantCastRight (37950) and returns. The graph answers the variable with a
  response event that the actor's Responses map (Meshes/Responses/
  ActorResponse.txt) routes to RightHandSpellCastHandler (42820). That
  handler moves the caster to StartChargeImpl (34137), which performs the
  default action kActionRightAttack (SourceActionMap::DoAction, 34202,
  CommonLibSSE-NG src/RE/S/SourceActionMap.cpp:27-31). The action's idle
  tree picks the IDLE whose ENAM is MRh_SpellAimedConcentrationStart and
  notifies the graph through the same vfunc Papyrus uses. So the scripted
  start failed for its timing, not its path: sent in the tick that set the
  variable, it reached the graph before the graph had answered.
  castSpellImmediate (34404) fires the spell and starts none of this.
  The figure's way to the motion is the engine's own entry: CastSpell on
  the figure's right caster, after InterruptCast and SetSkipCheckCast
  (ActorMagicCaster.h:33's kSkipCheckCast; it also stops the magicka
  drain). The relay sends that or castSpellImmediate, never both. A full
  local cast applies its effects in the observer's game; on the player
  the AddTarget refusal (fork m2-push 4e8aa04c) keeps the numbers the
  server's. The probe is x-figure-cast with that call through a Skyrim
  Platform native, with a Frida trace on 34401, 37950, the response
  dispatch (38447), 34202 and the notify (38048).
- Correction (2026-10-14, Eli: "the cast for firebolt seems to do ok on
  that at least some of the time"): the reading above, that no graph takes
  a scripted start and the relay cannot give the pose, overreached. What
  the runs show is narrower: a start sent with no casting variables, or in
  the same tick as bWantCastRight, is refused (x-recorder-flames twice,
  x-figure-cast, x-cast-solo). This doc already held the counter-evidence:
  x-dual-cast2 (20261013-072430) had the figure take the left hand's
  concentration events, and playtest fifteen saw Firebolt's wind-up on the
  figure. HYPOTHESIS, consistent with the static read above: the start
  lands only after the figure's graph has taken the caster's want-cast
  variable on an earlier frame. Firebolt's charge spreads its events over
  about 1.5 s (x-spell-observe: start at 250 ms, ready at 766, release at
  1739), so the variables the caster sends every 500 ms often reach the
  figure between them. Flames sends its start and release in one frame,
  with its variables 162 ms behind, so its start lands early almost every
  time. The probes, after playtest seventeen (which counts both for Eli):
  the start sent one to ten frames after the variable is set on the figure
  (the driver's anim-event with a delay), and Firebolt on the recorder
  (which of its events the figure takes, and where the variables fell).
  If a delayed start lands, the fix is the relay's: the observer applies
  the caster's variables and plays the start a frame later, with no new
  native. If not, the engine's CastSpell above.
- Measured (2026-10-14, after playtest seventeen; the driver's anim-event
  with a delay, main a69c74e):
  - x-recorder-firebolt (20261014-182630): c1's own graph took every
    Firebolt event (start, ready, release), and c1's figure on c2's screen
    refused every one, on both casts. Its ready and release came with the
    relayed casting variables already on the figure; its start had come
    350 ms ahead of them. So Firebolt's look on the other screen is the
    variables' pose and the bolt, not the relayed events.
  - x-figure-cast2 (20261014-183340): bWantCastRight set alone on the
    figure held its graph at iState 10 for one frame; starts sent 16 to
    266 ms after it were all refused.
  - x-figure-cast3 (20261014-182649): c1 really cast Flames. The relayed
    start reached the figure at 1189 ms and was refused; the relayed
    variables came at 1482 (IsCastingRight 1, NotCasting 0, iState 10,
    held for the cast); a start c2's driver sent at 2073 was TAKEN.
    MEASURED: the figure's graph takes a hand's spell start while it holds
    the caster's casting state; the relay delivered the start first.
- Fix on fork m2-hands (21f8e49d, 4f74c3e1): the observer's view holds a
  hand's spell start (MRh_/MLh_/DualMagic_ ...Spell...Start), and the events
  behind it, until the figure has been casting with that hand
  (IsCastingRight or IsCastingLeft) since an earlier frame, at most a
  second; the queue keeps 32 events. The probes on its staging:
  x-recorder-flames, x-recorder-firebolt, b-spell.
- m2-hands staged (2026-10-14 12:13 to 12:30, 4f74c3e1's client):
  - x-recorder-flames (20261014-192314): c1's figure on c2's screen took
    MRh_SpellAimedConcentrationStart and MRh_SpellRelease_Event in one
    frame (1468 ms, 22 ms after the relayed casting state landed), as the
    engine alone's caster takes them (r-spell-stream-a: both at 1264). The
    parity diff no longer lists them; the figure's diff keeps
    MRh_Equipped_Event (never relayed at the cast's end) and the refused
    IdleStop.
  - x-recorder-firebolt (20261014-192536): the figure still refused
    Firebolt's start, ready and release, the start now held until the
    casting state was on the figure. A fire-and-forget start wants another
    moment than a concentration start. In c1's own game the start is taken
    in the frame the want variable switches, before the casting state is
    held. Firebolt's look on the figure is unchanged (the variables' pose
    and the bolt). A finding of its own, LATER: the start sent in the one
    frame after bWantCastRight alone is set (the driver needs a frame-exact
    delay; x-figure-cast2's 16 ms came a frame late).
  - b-spell green, and green twice by path with the new check that the
    figure takes the start (b04f625: 20261014-193121, -193403).
- Merged: fork parity fast-forwarded to 4f74c3e1 (2026-10-14; the gate run set merge-m2-hands went 18 of 18 green). The
  concentration pose is DONE at T3 (b-spell b04f625); the next playtest's
  Flames item is its T4. Firebolt's own wind-up stays LATER (above).
- Firebolt's wind-up, prepared (2026-10-14, during playtest eighteen's
  wait): the lab driver's anim-event {delayFrames} (thuum main 1903b67)
  sends a start an exact number of updates after its variables, and probe
  x-figure-cast4 sends c1's figure MRh_SpellAimedStart 0 to 3 updates after
  bWantCastRight, twice each. The candidate fix, fork m2-firebolt 25e38e2f:
  the view holds only a concentration start for the casting state; for a
  fire-and-forget start it sets the hand's want variable (bWantCastRight,
  bWantCastLeft or both: Skyrim Platform's master behavior variables 72 and
  71) and plays the start fireAndForgetStartFrames updates later, 1 until
  the probe says which. It merges only on the probe's word.
- Playtest eighteen (2026-10-14, Eli, parity 05192845): the hands items not
  ticked. Three notes: the figure's grab-and-push "initiates, but does not
  stop"; "charging and casting with the left hand still emits the bolt from
  the right hand"; "spells like invisibility also aren't accompanied by a
  spell animation" on the figure. HYPOTHESES, one per note, probed the same
  night: the figure's casting variables are set from the cast's snapshot
  and never set back, so a figure whose graph now takes the start stays
  casting (x-flames-stop: the figure's IsCastingRight and events through
  the cast and 10 s after); the relay's casting source reaches the
  observer's launch as the right hand's, or the left caster's magic node is
  not the one used (x-left-firebolt: launch-source-trace.js reads the
  LaunchData's castingSource, 0 left and 1 right, and origin in c2's game);
  a Self cast's start is a fire-and-forget start (MRh_SpellSelfStart) and
  meets the same refusal as Firebolt's (x-self-anim: the events c1's own
  graph sends and the figure takes). Eli's ask: "something about how we're
  doing animations overall is a little iffy ... see how our past things
  that work are doing it"; a research pass over the client's cast relay,
  the engine's own casting path and what works (swings, blocks, staggers,
  shouts) is in hand. numidium's point stands: b-spell asserts only the
  start's taking, so the hands fix ships with references (the engine alone
  casting Flames and Firebolt from each hand, and a Self cast) and a parity
  scenario that would have seen all three.
- x-figure-cast4 (20261015-030717, the driver's delayFrames): the figure
  refused MRh_SpellAimedStart at every offset, 0, 1, 2 and 3 updates after
  bWantCastRight was set on it (twice each; the graph at iState 9 before
  each, the want variable 1 from offset 1 on). So no script sends a
  fire-and-forget start at a moment the graph takes it, and fork m2-firebolt
  (the want variable, then the start a frame later) is dead; it stays
  unmerged.
- The hands, read whole (2026-10-14 night, after playtest eighteen; a
  research pass over skymp5-client, Skyrim Platform, the engine's headers,
  TiltedEvolution's map and the x-recorder-flames recordings, with the
  three findings of the playtest as its questions). The pipeline: the
  caster's game sends three things on two channels, the SpellCast with a
  snapshot of the caster's graph variables (magicSyncService.ts, reliable),
  the graph events the player's own graph took (sync/animation.ts'
  AnimationSource, one per update, unreliable) and the snapshot again every
  500 ms while magic is equipped; the observer applies the variables by
  index onto the figure's graph, plays the events through
  Debug.sendAnimationEvent, and casts the spell through castSpellImmediate
  from GetMagicCaster(castingSource). One cause under the three findings:
  the engine enters a hand's cast only through the actor's own
  MagicCaster (CastSpell sets the want variable, the graph answers within
  the frame, the caster performs the hand's default action, whose idle
  sends the start; the re-analyst's read above), and it leaves the loop on
  a graph event, M[LR]h_Equipped_Event (the engine alone's caster: taken at
  5269 ms, the want variable false 12 ms later, IsCastingRight false 195 ms
  after; x-recorder-flames' reference, parity3/ref-a.json). Each finding:
  1. The cast that never stops: the relay rewrites every event whose name
     contains "equip" to SkympFakeEquip (sync/animation.ts, the equip
     rewrite), which the observer turns into applyWeapDrawn and never gives
     the graph, so the figure never gets the exit; before m2-hands the
     figure never entered the loop, so it did not matter. The figure's
     variables do return, late and in two steps (bWantCastRight 0 with the
     interrupt's snapshot, IsCastingRight 0 with the next 500 ms one, 586 ms
     apart in the recording); whether the graph would leave on them alone is
     HYPOTHESIS (tonight it did not). The observer also ends a figure's cast
     with FinishCast (MagicApi.cpp), where the engine's end, and
     TiltedEvolution's, is InterruptCast.
  2. The left-hand bolt from the right hand: Skyrim Platform derives
     castingSource at the spellCast event from the two hand casters' states
     (EventHandler.cpp), with a fallback that gives the right slot the cast
     when neither caster reads as charging or casting, which a
     fire-and-forget's event can meet; the server clamps it to 0..3 and
     relays it verbatim, the Rust side only range-checks it, and the
     observer launches from GetMagicCaster(castingSource)'s magic node, so a
     message saying right is launched right. HYPOTHESIS: the fallback,
     which the same spell in both hands (eighteen's seats had Flames and
     Firebolt) makes likely; x-left-firebolt (Firebolt in the left hand
     only) tests the left caster's node, a second probe with the spell in
     both hands tests the fallback.
  3. The Self cast without an animation: a Self spell on a figure is
     castSpellImmediate on the figure itself (MagicApi.cpp), which plays no
     action, and its start event is held like any hand's and refused like
     Firebolt's.
  What works (attackStart, the block by the movement report's isBlocking,
  the relayed staggerStart, shoutStart) are states the graph enters on an
  input event; a hand's cast is the one state it enters only through the
  caster. The one shape, then ("the figure's cast is its own caster's"): on
  a relayed cast the observer starts the figure's own caster for the
  relayed hand through a new Skyrim Platform native (GetMagicCaster(source),
  SetSkipCheckCast, dual casting from the message, then the engine's
  CastSpell, 34401 by the re-analyst's read, resolved through addrlib before
  use), and ends it on the relayed interrupt with InterruptCast(false); the
  engine then plays the want variable, the response, the action, the start,
  the loop and the Equipped exit itself, for a concentration, a
  fire-and-forget or a Self cast alike. It drops the held start, the
  relayed M[LR]h_/DualMagic_ events for figures and the casting variables
  written by index onto figures; the wire does not change. To probe, in
  order, on a fork branch with the native: H1 CastSpell with
  kSkipCheckCast on a figure's hand caster plays the start and holds a
  concentration loop; H2 InterruptCast sends the Equipped exit; H3 a
  fire-and-forget CastSpell on an actor without input fires at the charge's
  end (which decides whether the figure's bolt stays Projectile::Launch);
  H4 the Self variant. The interim, if a playtest needs Flames to stop
  first: let M[LR]h_Equipped_Event through the equip rewrite by name, as the
  torch's events are, the engine's own exit by hand. The hands fix ships
  with references (the engine alone casting Flames and Firebolt from each
  hand, and a Self cast) and a parity scenario, since b-spell asserts only
  the start's taking.
- Measured the same night, after the read above: x-left-firebolt
  (20261015-031632, Firebolt in the left hand only) launched from the left
  in the observer's game both times (casting source 0 in LaunchData), the
  figure taking MLh_SpellAimedStart, Ready and Release; x-left-firebolt2
  (-035333, Firebolt in both hands, cast with the left) launched from the
  right both times (source 1): finding 2 is the sender's fallback,
  CONFIRMED. x-self-anim (-031853): the figure took MRh_SpellSelfStart,
  Ready and Release when the caster's variables landed 23 ms before the
  start, so a Self cast's and a fire-and-forget's start are taken when the
  whole casting snapshot is on the figure first; eighteen's missing Self
  animation and Firebolt's wind-up are the order of arrival (the start on
  the unreliable UpdateAnimation hop ahead of the variables, the 1 s hold
  timing out), not a refusal in principle. x-flames-stop (-031410): the
  figure's IsCastingRight stays 1 and NotCasting 0 for the whole 11 s
  watch after the caster's release; finding 1 is the missing exit.
- The shape (Eli, 2026-10-14 21:00, the plan approved): the figure plays
  the caster's actions, captured at the engine's action entry on the player
  and replayed on the figure with the caster's variables, the effect
  decided apart by the server's relay; the verb is docs/verbs/cast-action.md,
  which holds the engine's chain (the re-analyst's read of the night: every
  graph-facing step of a cast is an action through DoAction 34202, the
  concentration exit the Interrupt action, kReady held until a driver
  releases), the measurements and the probes. Melee keeps its event relay;
  withheld spells show their animations too. m2-hands' hold is the stopgap
  it replaces; forks m2-firebolt and m2-hands-exit are deleted with it.


## The class pass (2026-10-18 01:30 UTC, parity ef02c565)

- x-class-streams 20261018-013048: Creeping Cold, Howling Blast and
  Scattershock counted by the stream's time (0.10, 0.17 and 0.25 s a tick;
  two Scattershock hits after its stop refused E_SPELL_NO_CAST, as built);
  the figure's launches matched c1's within one for every stream (Sleet
  Storm 0, Creeping Cold 26 and 27, Howling Blast 7 and 8, Scorching Hands
  16 and 18, Scattershock 18 and 18).
- Scorching Hands (Apocalypse 0x0C02388C, a flame stream whose effect has
  an area of 3) launched 16 flame projectiles in c1's game and c1 reported
  no hit at all, where vanilla Flames (area 0) reports one per tick.
  Explained statically and fixed (fork m2-area-report 244893ba, on
  train-25): the explosion read (docs/research/apocalypse/
  target-location.md) shows an explosion's own hit event names its weapon
  as the source, Unarmed (0x1F4) when it has none, which is the "unarmed
  hit" x-class-self counted at every Self burst (3.71 of unarmed damage),
  while the spell's effects land on the actors in the area through
  AddTarget (34461), which raises no hit event for the caster's game to
  send. hitService now reports the player's magicEffectApply on another
  player's figure as a hit of the equipped spell that carries the effect
  (once per target and spell within two frames beside any hit event, the
  shout and cast-order rules kept) and drops an Unarmed hit that lands
  beside such an apply on the same target. The server then claims it as a
  spell hit against the recorded cast, an area cast covering its targets
  within the splash window as built. HYPOTHESIS until x-area-hit: the
  apply fires in the caster's game for each actor the area took, and the
  Unarmed stand-in is the explosion's every time.
  Not a range matter: vanilla Flames' projectile reaches 768 units
  (Skyrim.esm PROJ 0x12FCF DATA, lab/esm.py on sky-srv) and c2 stood 400
  away; the mod has one Scorching Hands spell record (its editor id ends in
  _NPC), and its effect's own projectile is unread (esm.py prints a DATA's
  first 32 bytes). HYPOTHESIS: an area effect's targets are gathered by the
  projectile's explosion (FindTargets' area pass, 34461), which raises no
  TESHitEvent on the caster's side, so hitService sees nothing to send and
  the server counts nothing for an area stream; the "Self burst" rows share
  the cause. Next: the recorder's hits dealt against magicEffectApply on the
  target for one area spell, with c2 at 150 units.
- x-class-bolts 20261018-012605: Bolide and Rift Bolt counted once; Rift
  Bolt's scripted proc refused (second-hand covers it); Nature's Balance's
  bolt counted and swapped nothing (B1 unbuilt); Thundercrack launched with
  no hit; Hailstone, Static Dome and Crackle never released at a 300 ms
  hold (charge 0 spells need the hold to cover the cast, 900 ms now).

- x-class-target2 20261018-105815 on train m2-train-24 (its first cut,
  x-class-target 012152 and 101320, cast one spell of five: the first hold
  from empty hands drew instead of casting and Shadowbond's script moved
  the caster onto the target, so the later blocks aimed at nobody): every
  block cast; the server counted Finger of Death, Decompose, Leech Seed
  and Shadowbond on c2 (OnSpellHit, a fight begun; parity refused them
  E_SPELL_NO_CAST), Leech Seed's second hit message of the same cast
  refused as consumed (harmless). In c2's own game nothing landed on c2's
  player in any block: Azure Reconstruction's relayed stream applied its
  heal to c1's figure itself (15 applies of 0x0c126da1, caster the figure,
  none on 0x14), Finger of Death and Shadowbond applied nothing, exactly
  the shape m2-target-actor set out to fix. HYPOTHESIS: the relayed
  SpellCast carried target 0 for these spells (magicSyncService fills it
  from Skyrim Platform's spellCast event, which names no target when the
  engine picks it later; the server relays the field untranslated and the
  receiver routes to 0x14 only when it names c2); the run has no pcap and
  the server does not log the field. The fix after the big playtest: the
  sender names the aimed-at actor (the crosshair reference or the
  projectile's target) when the event has none. Azure's heal stream raised
  no hit event in c1's game, so the server never saw a heal to apply: its
  number is train-25's apply path (m2-area-report). Shadowbond did not
  move c1 this time (0.5 units over 158 s; the script polls before its
  MoveTo, so ambiguous against the earlier runs' 46 units). Two findings
  beyond the verb: Finger of Death's script read c2's figure at a million
  Health, failed its threshold and ran its self-damage branch, taking c1
  from 10000 to 1 (an ADR-029 class of its own: a script that reads a
  figure's values judges the lab's million, not the player's number); and
  a server-side set-percentages upward is reverted by the client's stale
  report within about 2 s (7 of 11 cases), so a probe must set downward or
  read at once (lab-api, numidium).

## The stream's heading, read and fixed (2026-10-17 evening)

The re-analyst on sky-re (1.6.1170, CONFIRMED-STATIC unless tagged):
Actor::GetAimHeading (37929) returns GetHeading(false) minus the graph
float AimHeadingCurrent (CommonLibSSE-NG include/RE/F/FixedStrings.h:187;
src/RE/A/Actor.cpp:288-296), with no bAimActive branch and no camera term;
GetHeading(false) on a Character is the reference's angle.z (37206; the
player's override adds a seat's heading delta, zero on foot). MagicCaster's
launch (34450, then 34452) reads it at every relaunch into LaunchData's
angleZ, unless the caster is in combat (the combat aim point, 418638) or
has a desiredTarget (47286); FlameProjectile and BeamProjectile read it
every frame. So a figure's missiles left along its body's heading, and the
2.75 degrees of x-stream-aim is the caster's own AimHeadingCurrent, which
its graph's direct-at modifier sets with a per-node offset (HYPOTHESIS).
Fix, fork m2-area-effect 9437980f (train-25): the native setActorAimHeading
writes the figure's AimHeadingCurrent to angle.z minus the caster's relayed
aimHeading, wrapped to [-pi, pi], so GetAimHeading returns the caster's
heading and the body stays the movement's; the relayed cast's aimHeading
is held per figure (sync/figureAim.ts) and written each update until the
cast's end. HYPOTHESIS until x-stream-aim's rerun: the graph does not write
the float back between the write and the caster's read (the fallback is a
trampoline on 37929 for figure form ids).
