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
- `target` (read 2026-10-18, fork m2-cast-target 9359e2c7 on train-26):
  Skyrim Platform fills the spellCast event's target from the caster's own
  MagicTarget (EventHandler.cpp; Actor::GetTargetStatsObject is the actor
  itself, CommonLibSSE-NG include/RE/A/Actor.h:354), so until that fix
  every cast named its caster, the server relayed it verbatim
  (ActionListener.cpp's RelayCast rewrites only a legacy 0x14), and a
  relayed touch or target-actor spell was cast at the figure that cast it
  (x-class-target2 20261018-105815: Azure Reconstruction healed c1's
  figure 15 times in c2's game, nothing on c2). Now the player's own cast
  of a spell delivered to its target names the actor under the crosshair
  at the cast, by server id (a figure's through the view, an NPC's as is),
  or 0 when none; every other cast keeps the event's word. Rung R2:
  client-reported, recorded and relayed, unvalidated (rule 5; the wire
  validator takes any u32, wire-validate's check_spell_cast); the numbers
  still come only through the hit path's claims. Follow-up: the server
  checks the named target is within the spell's reach of the caster at
  the cast (R1), and SP reads the hand's MagicCaster::desiredTarget
  synchronously in ProcessEvent (CommonLibSSE-NG include/RE/M/MagicCaster.h:87)
  instead of the crosshair a tick later (HYPOTHESIS that it holds the
  picked actor at the event).
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
- Two rules added by shadowbond (train28-bond3, remoteServer.ts
  onSpellCastMessage): a relayed cast whose caster is this game's own
  player is the server's imposition on it (a bond's concealment proc, cast
  through the player's instant caster, castingSource 3) and is cast on
  0x14, the sibling of the rule that maps a named target to 0x14; and a
  relay carrying no animation variables (the server holds none) takes the
  actor's own current set, since castSpellImmediate casts nothing when the
  set does not apply. No game ever relays a player's cast back to it, so a
  caster id equal to the player's can only be the server's.

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

Watch item (ADR-027, the stagger merge sweep 2026-10-11; CLOSED 2026-10-27:
no second red in any sweep or gate since, 54's gate 20261027-201844 the
last, gate.yaml's entry out): b-spell red once
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

- x-area-hit 20261018-135726 on train-25 b352b82d, c2 at 150 units: vanilla
  Flames counted 14 hits at 5.4 a second (median factor 0.2), Scorching
  Hands 12 hits at about 6 a second (factors 0.15 to 0.2), both with the
  caster's hit events present in pairs per tick and the apply reported
  beside them, nothing doubled (same-source server lines at least 149 ms
  apart). So Scorching Hands counts now; whether the apply path or the hit
  events carried it cannot be told from the trace, and the parity run's
  silence had c2 at 400 units, so distance is not excluded as its cause
  (HYPOTHESIS either way). Shock Nova: its own hit counted once; the
  explosion's Unarmed 3.712 OnWeaponHit still reached the server, landing
  115 ms (about seven updates) after the apply, past the one-update drop
  window: widened to ten updates on train-26 (fork m2-unarmed-window).

- A stream's number under dropped hit reports (b-duel's Flames phase read
  across 27 runs since 10-14, 2026-10-18): the server's number is exactly
  8 a second times the factor sum, each report's factor the time since the
  last counted report capped at MAX_TICK_MS 250 ms (wire-rules casts.rs),
  and a full 4 s hold yields 20 or 21 reports at the engine's 0.183 s
  cadence on every build. Today's two reds (20261018-082158 on parity's
  client, 142100 on train-25's) had 13 reports: gaps of exactly two or
  three cadences where no hit event reached the client at all, each gap
  capped, 7.6 to 8 of 100 Health lost against the 0.78 bound. Not today's
  code (one red predates every hit-path change; the number per tick is
  identical on every build). One or two such gaps sit in six greens since
  10-14; four or five only today, both on c1 after the GPU slot swap put
  the 1050 on one lane. c1's frame pacing was the suspect and is untested,
  not disproved: in every window the recorder kept (phases 1 and 2 of all
  three runs) c1 ran 60.0 updates a second with no interval above 37 ms,
  but no c1 series covers the Flames hold in either red (they stopped at
  the failed assert) and the recorder keeps no per-frame timestamps; a
  per-update series or the client's hit events with their frame index
  across one hold would settle it (the cards' link speeds are mundus's
  read). The
  design gap underneath, for a later verb: the engine applies a
  concentration spell's damage every frame it touches the target whatever
  the hit events do, so a client that drops hit events under slow frames
  undercounts on the server where the engine would not (ADR-031). The
  stream's start and end are reliable messages already; counting the
  held time between them while reports confirm the target, or a cap of a
  cadence and a half (about 400 ms) so one missed report costs nothing,
  are the two shapes; neither tonight (the T2 declarations name today's
  factors).

- A stream's start against the fixed hold, ADR-027's watch item (15:10 PDT,
  b-duel 20261022-215524 on train-33's gate, numidium's read): step 65's
  server.actor(c2).healthPercentage read 0.8316 against the asserted < 0.78.
  The three sword hits were identical to the green 192438 of the same
  morning (6.496; 12.992 with the 0.24 stagger; 3.151 at blocked share
  0.502). The Flames stream differed only in when it began: 11 ticks over
  2.218 s starting 18.6 s after the last sword hit, against 19 ticks over
  3.53 s starting 17.4 s after; the tick cadence itself was intact (about
  0.2 s), so this is not the dropped-report class above. The same assert
  went red once before with the same shape, 20261020-232356 at 0.822, on a
  build before train-32; green in the twelve runs between. The first
  hypothesis, the driver's hold-key landing late, is FALSIFIED: the three
  runs' step durations match to a tenth of a second through the assert
  (numidium, {now} PDT), and by the anchor of the third sword hit the first
  OnSpellHit came 17.37 s after it on 192438, 17.88 s on 215524 and 18.34 s
  on the rerun 222125, with the stream's refused tail hit at the same 20.8 s
  on all three: the end is the key's release, the start moved. The rerun
  went red too (12 ticks, 0.8153), so under ADR-027 the gate is red and
  parity did not move. x-duel-stream 20261022-223232 on the same stage (the
  duel's opening, the Flames phase watched on both seats, no assert): the
  caster's own MRh_SpellAimedConcentrationStart and Release 0.10 s after the
  hold began, launches from +0.42 s every 183 to 185 ms, IsCastingRight true
  for 4.2 s; the figure's cast 0.13 s behind it on c2, c2's first hit taken
  at +0.71 s; 20 ticks and 3.6 s of stream registered (192438 had 19 and
  3.53 s). So train-33 delivers the stream whole and on time, and the two
  reds are variance under the same schedule: the stream finding c2's figure
  late, or early hits lost on the caster's side; the reds kept no watch of
  the phase (the run stops at the failed assert before the watch-stop).
  Measured ({now} PDT): b-duel three more times on the stage went green,
  red (12 ticks), red (13 ticks): 4 red of 5 on train-33 against 1 of 13
  before, the build. x-duel-stream three times: 21, 20 and 10 ticks; the
  short one (225540) with its watches: both games saw the whole stream (c1's
  21 launches from +0.35 s every 183 ms; c2 took 20 hits from +0.66 s every
  180 to 190 ms, its health down at +0.81), the server registered 10, in
  clusters (holes of 0.365 and 0.726 s, every tick after a hole at the
  0.25 cap), no refusal on either wire, no rejection or splash line on the
  server. The reports were lost before any send, in the caster's own hit
  path: hitService dropped a spell hit on the same target and spell within
  dedupFrames = 2 of the last one sent, and every second same-key hit inside
  one frame, both measured in JS frames (this.frame, one per update); a
  stalled tick puts two real stream ticks, 183 ms apart, inside that window,
  where they read as the engine's double. Fix on fork m3-train-33 ab1740bf:
  both rules in time (the engine's double within 8 ms; a hit and its apply
  within 34 ms), which a slow tick cannot fold: a latent bug fixed, not
  this cause. The stall hypothesis is FALSIFIED ({now} PDT, numidium): c1's
  tick ran at 60 updates a second through 225540 with no gap over 267 ms,
  and c1's own "hits dealt" on c2's figure count 20 pairs in the full run
  against 10 pairs in the short one at exactly the server's ten ticks and
  holes: the caster's game registered fewer hits, the client dropped
  nothing. THE CAUSE: where c2's figure stood on c1's screen. From b-duel's
  phase-2 watches (steps 038 and 039, after the power attack's 0.24
  stagger, before the stream), the figure's error against c2's own position
  at the end of the phase: 0.4 and 0.3 on the two greens (192438, 223749),
  7.6, 6.1, 6.7 and 6.9 on the four reds, the figure at nearly the same
  wrong spot each time, about 6.5 units farther from c1 at a bearing of
  minus 2.2 degrees against c1's aim; on the greens the push peaked past
  eight (11.7, 7.1) and came back, on the reds it stayed under. The stream's
  projectiles then missed it half the time. The defect: translateTo keeps a
  standing figure's 8-unit deadband against a fresh sample's jitter, and the
  2 s re-apply of an unchanged record ran the same gate, so with c2 standing
  still nothing ever brought the figure back. Fix on fork m3-train-33
  8a581ede: the periodic re-apply of an unchanged record settles a standing
  figure or puppet from one unit (movementApply.ts, formView.ts); a fresh
  sample keeps its deadband. 8a581ede did NOT settle ({now} PDT): b-duel
  three times on it went red (11 ticks, the figure 6.8 off at the end of
  phase 2, peak 8.9), red (10, 5.8 off, peak 10.6) and green (16 ticks, 0.3
  off), and x-duel-stream 233951 read the figure a constant 6.9 units off
  through the whole stream window, 20 to 30 s after the stagger. The hole:
  the settle rode the view's 2 s re-apply, taken only when no new sample
  arrived, and a player's game reports movement at every tick while it
  stands, so every apply was a fresh sample with the 8-unit deadband. Two of
  those reds peaked past eight and still ended off, so "under the deadband"
  is not the whole story either: the translation that fires on a fresh
  sample past eight units did not leave the figure on the record (the
  stagger's push outlasting a 0.2 s translation, HYPOTHESIS). Fix on fork
  m3-train-33 3bd8d8ae: the record's own stillness decides, the deadband is
  one unit whenever the target equals the last target this code sent
  (within half a unit), whatever the sample count, and a settle prints
  `settle <id>: <units> units from (x, y) to (x, y)` to the console (c1.log)
  for the lab's read. 3bd8d8ae on the stage ({now} PDT): b-duel green three
  times on its assert (19, 17 and 15 ticks) but the figure still 4.4 and 4.9
  off after phase 2 in two of three, and no settle anywhere: the stillness
  test compared the target with the last translation this code had sent,
  and a figure placed by a teleport that never walked has none behind it,
  so the test never armed; and the console line never reaches c1.log at all
  (printConsole is the in-game console; the [verb:npc-puppet] lines are the
  native logger's), so the watch's phase-2 end error is the read. Fix on
  fork m3-train-33 fb6f3f09: the stillness is read from consecutive records
  (the target within half a unit of the previous apply's), which a standing
  player's reports satisfy every tick. Read: b-duel three times on the
  stage, 19 or 20 ticks each, the phase-2 error back under one unit by the
  end of the watch; if a run still ends off with the record still, the
  settle moves from translateTo to setPosition for the standing case
  (HYPOTHESIS that a 0.2 s translation under the self keep-offset does not
  finish). SETTLED ({now} PDT): fb6f3f09 on the stage, b-duel three times
  green with the figure back on the record (19 ticks, the phase-2 error 0.0
  at the end from a peak of 4.7; 19 ticks, 0.4 from 5.6; 18 ticks and
  3.22 s of stream, 0.2 from 1.7), against the short streams' 2.0 to 2.6 s;
  x-duel-stream 001417 on the head before it still read 5.3 for ten seconds.
  The watch item closes with the gate on fb6f3f09; the figure's height
  (dz minus 7.4 to minus 7.7 throughout) stays the figures' row. Whether
  train-33 shifted the push's size is not asked
  (HYPOTHESIS either way; the deadband is the defect). Row for the figures, from the
  same watches: on every run, green and red, 16b8854a's included, c2's
  figure on c1's screen stands about 8 units below c2's own z on the lab
  spawn's flat ground (14665 to 14666 against 14673.7), playtest 31's
  "clipping through the floor" by the look of it; the figure's spawn height
  and ground snap, its own train. A row from the same read: c1's figure of
  c2 took a refused combat idle every 15 ms
  (IdleCombatSpecialStart, IdleCombatLookingAroundStart,
  IdleCombatStretchingStart) through the phase, the relay's idle blank
  answered by the engine's per-frame retry; a figure's graph thrashed every
  frame is a suspect for playtest 31's odd-walking figures (the figures'
  idle rule, its own train).

- x-class-target2 20261018-191615 on train-26 d5b05e89 (fork m2-cast-target:
  the sender names the actor under the crosshair for a touch or
  target-actor cast): the old symptom is gone (no cast applied to the
  figure itself in c2's game), and Azure Reconstruction at 180 units is
  counted by the server for the first time (13 OnSpellHit at 0.25 s, 30.2
  Health computed; c2's own health rose beyond regen by about 15 of it,
  its game agreeing with the server within 0.4 %). Whether c2's game also
  cast the heal at its own player cannot be told from the artifacts: its
  number is a figure's Health effect, which the AddTarget refusal blocks by
  design, so "cast at 0x14 and refused" and "cast at nobody" look alike;
  consistent with landing, not demonstrated. Finger of Death and Shadowbond
  at 300 units named target 0: Game.getCurrentCrosshairRef was null at that
  distance while the engine's own target-actor pick hit the figure in c1's
  game (HYPOTHESIS: the crosshair pick's activation reach is shorter than
  the spells' 1500 and 750); the server still counts their hits, c2's game
  still shows nothing. Follow-up: name the engine's own picked target (the
  hand's MagicCaster::desiredTarget read in ProcessEvent, or a ray to the
  spell's range) instead of the activate pick, and log the resolved target
  in OnSpellCast and the refusal in the AddTarget hook so a landing is
  observable. Two findings beside the verb: a heal from another player
  began a fight (OnSpellHit's hostility notice takes every spell hit, its
  own comment saying "a heal from another included, for now"), which then
  cut c2's regeneration from 7.0 to 4.9 a second for the rest of the run,
  more than the heal gave; and each imposed tick re-based c2 onto the
  server's last-reported value, forfeiting about a quarter second of
  regeneration per tick (HYPOTHESIS). Finger of Death's self-damage branch
  again took c1 from 10000 to 1 (decisions-m2-apocalypse.md, question 6).

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
MEASURED (x-stream-aim2 20261018-135515 on train-25 b352b82d): the figure's
Scattershock launches in c2's game left at heading 180.00 degrees on 13 of
16 and 179.42 on 3 against c1's own 180.00 (the parity runs: 177.25 and
177.41 on every launch, 2.75 and 2.59 degrees off); Flames 180.00 on 15 of
15. The offset is gone; the fix stands. Pitch was not exercised: the probe
has no look step, and the look step as built does not pitch the view (see
docs/research/apocalypse/target-location.md, the lab's aim), so the pitch
half (setActorAimPitch) stays HYPOTHESIS until the driver can aim down.

## Playtest twenty-three (2026-10-18, Eli, parity d5b05e89; results/playtest-23)

- Target actor at close range, in a human's hands: every Shadowbond
  (0xC031C4D, three casts) and Azure Reconstruction (0xC088694, two casts)
  went out with target 0 ("OnSpellCast - MpObjectReference not found for
  spellCastData.target 0" before each), while their hits named player two
  (OnSpellHit, Target ff000001) and were counted. So the crosshair naming
  (train-26) is not enough: the figure's cast in player two's game landed
  on nobody; nobody went invisible on player two's screen and Shadowbond's
  swap ran only in the caster's game. Fix for train-27: the server relays a
  cast whose effects land on their target (touch, target actor) only once
  its first hit names the target, one hop later, with that target; the
  sender's crosshair field stays as a hint and is never trusted alone.
- Azure healed a non-summon: the server applied its Restore Health to
  player two (23 ticks at 0.25 magnitude, two bursts) while the caster's
  engine refused the effect on its conditions ("Prisoner resisted azure
  reconstruction", Eli: "it shouldn't have because prisoner is not a
  summon"). ADR-039: the server evaluates conditions, unknown functions
  refuse and log. Its first hit also opened a fight ("a fight begins; the
  victim's game is told"), the heal-begins-a-fight follow-up.
- Runes (Frost Rune 0x6796F, Acceleration Rune 0xC124EC9) and Lightning
  Strike: see docs/research/apocalypse/target-location.md: the caster's
  own client threw at the cast and at the trip, so no cast record reached
  the server and the hits were refused (E_SPELL_NO_CAST at 01:48:49,
  01:49:55, 01:50:07 UTC).
- Shock Nova beside player two ticked "xw" (asked what the w means).

## The target by first hit (train-27, fork m2-train-27; built 2026-10-18 evening)

- Rule: a cast whose every effect is delivered to its target (MGEF delivery
  1 touch or 3 target actor; libespm MGEF::DATA::delivery at DATA 0x54, the
  casting type at 0x50, UESP "Skyrim Mod:Mod File Format/MGEF", checked on
  Flames (2) and Healing (0) against Skyrim.esm on sky-srv) is relayed to
  the other games only at its first hit, with the target that hit names;
  a cast that hits nobody within the cast window (17 s) is never relayed,
  and a stream delivered to its target that ends before any hit relays
  neither its start nor its end. Every other cast relays at once, as
  before. Rung: R1 for the target (the caster's game reports the hit, the
  server validates it against the recorded cast and the target's recorded
  position before it names it); the sender's crosshair field stays a hint.
- Why: the figure's cast in the target's own game lands on the player only
  when the relay names it (remoteServer casts at its own player when named;
  the class pass); the crosshair guess was 0 at every one of Eli's casts
  (playtest twenty-three), so Shadowbond's script and Azure's look never
  ran in player two's game. The hit path already names the target the
  server trusts, one hop later; the figure's animation is cast-action's and
  plays at once regardless.
- Where: wire-rules casts.rs (CastFacts::lands_on_target; Casts::start
  returns whether the relay waits; CastCheck::Claimed carries relay for the
  first claim only, fire-and-forget and streams alike; five tests),
  wire-bridge rules.rs (the fields through the FFI), PartOne::CastFactsFor
  (the deliveries from the records), ActionListener::OnSpellCast
  (pendingCastRelays per caster and hand; the stream's end drops an unsent
  one) and OnHit (RelayCast at the claim with relay set, the target set to
  the hit's). No wire field changes; the schema's SpellCastData.target doc
  states the semantics (rule 4: the contract text moved in the commit).
- Tests: T0 Rust (the five casts.rs tests), T0 server (unit/SpellCastTest
  "A cast delivered to its target reaches the neighbour at its first hit":
  dunHonningbrewSkeeverPoison 0x10FC22, no relay at the cast, one at the
  hit with the target, none at a second hit), T2 difftest target-by-hit
  (the legacy stack relays at once with target 0, the wire stack at the hit
  with c2's id, declared), T3 b-cast-target-hit (to write: c1 casts a
  target-actor spell at c2 from close with the server log's "relayed at its
  first hit" line, and c2's own game shows the spell's effect on itself:
  watched_self effects; Shadowbond's invisibility is the playtest claim).
  HYPOTHESIS, and for a fire-and-forget spell FALSE as the relay stands
  (playtest twenty-four, x-shadowbond 20261019-093744: c2's own watch held
  no effect and no cast): castSpellImmediate's non-Self fire-and-forget
  branch launches the spell's projectile with the named target as the
  desired one (skyrim-platform MagicApi.cpp:254-302, Projectile::Launch at
  :302) and never calls CastSpellImmediate with the target, as the Self
  (:224) and concentration (:248-250) branches do; a spell with no
  projectile (Shadowbond, Leech Seed, Finger of Death) applies nothing in
  the target's game. The row to build: apply a projectile-less spell
  delivered to its target directly on the named target (the figure's
  caster's CastSpellImmediate), with x-target-by-hit's self.effects
  assertion and a 1500 ms hold; run b-shadowbond on it before merging,
  since the mod's script would then run a second instance in the
  target's game (the server's pin covers the second move: HYPOTHESIS).
  Shadowbond's own concealment no longer waits for it (shadowbond.md,
  train-28: the server records and imposes the proc).
- Consequences: a touch or target-actor spell's look reaches the other
  screens one hop after the hit (about the hit report's latency plus the
  relay's); a miss shows nothing but the animation. Azure Reconstruction's
  heal on a player is still the server's and still unconditional until
  ADR-039's evaluator lands (its own row).
- Status: built and pushed (fork m2-train-27, first commit); Rust T0 green
  (176 + 17 tests); server T0 and T2 at the stage; T3 unwritten.

## Target location after playtest twenty-four (2026-10-19; fork m2-train28-castfix abe87806; the research memo of the day, re-read with the records on sky-srv and the re-analyst's REA read)

Eli, test 2's seat: "the effect works, but there is no visible placed rune
on player 2's screen. i can see the cast and the initial rune, but not
after it's set"; Lightning Strike: "played effect on player 1, not on 2,
the bolt looks the same and hangs." His theory: placed world objects not
propagating. The records say otherwise, and split the finding in four.

- The records (lab/esm.py on sky-srv). Frost Rune 0x6796F: SPEL to MGEF
  0x6796D to PROJ RuneFrostProjectile 0x5FBBF (a Grenade, flags Explosion
  and Alt Trigger, proximity 150, timer 0, lifetime 0, no hit art) to EXPL
  0x44089 (placedObject 0, damage 0, force 128, enchantment SlowFrostRune
  0xB72A2). The glyph on the ground IS the parked projectile; no ACTI,
  HAZD or script exists anywhere in the chain, so nothing is "placed" that
  could fail to propagate. Fire Rune 0x5DB90 is the same shape. Lightning
  Strike 0x0C002878 is the same object one step longer: a Grenade on a
  2.5 s timer (proximity 0, a no-collision layer) whose explosion places
  ACTI 0x0C0FADFF carrying WB_DestroyAfterDelay_Script (OnLoad, wait 0.3 s,
  Disable, Delete). Skyrim.esm's GMST iMaxPlayerRunes is 1, and CommonLib
  puts `runesCast` on PlayerCharacter alone (include/RE/P/PlayerCharacter.h
  :649).
- The relay works. x-rune-trip2 (20261019-094024) re-read: the observer's
  game launched the figure's rune at the relayed point (c2's watch: the
  figure's launch at the recorded origin and the 60 degree pitch) and the
  rune was ARMED there: it tripped on c2's own player 368 ms later in c2's
  own game (FrostSlowFFContact applied, the explosion's hits taken, Health
  and Stamina refused by the gates, the server's number landing). The run
  tripped at once because c2 stood 154 units from the point (150 proximity
  plus the PROJ's 50 collision radius); nothing has yet watched a rune
  left standing. So "the effect works" is the relay, and the server's one
  claim per trip (playtest twenty-four: four trips, four claims).
- Fixed, 1: the observer's exception. Every relayed rune and Lightning
  Strike cast ended remoteServer's once('update') callback with "Cannot
  read properties of undefined (reading 'prototype')" (c2.log 151, 157,
  162, 167, 173; the five of the session's thirty figure releases):
  RemoteServer.placesAnExplosion called effect.getProjectile(), which
  Skyrim Platform wraps by the VM class name PROJECTILE its class list may
  lack (assets/sp3.js wrapObject, Object.create(sp[type].prototype)), the
  same throw magicSyncService's sender-side guard already catches. The
  throw came after the figure's launch and placed nothing wrong; it was a
  false lead in every log read. Now guarded the same way (a throw counts
  as a projectile, logged once per spell).
- Fixed, 2: the caster's hanging bolt. ACTI 0x0C0FADFF's
  WB_DestroyAfterDelay_Script never received OnLoad under Skyrim
  Platform's SendEvent block (FridaHooks.cpp OnSendEventEnter; the
  whitelist named SKI_, RaceMenu, GRIM_ALT_TeleportationMarker and
  defaultDisableHavokOnLoad), so the bolt's activator stayed in the sky of
  whichever game placed it (playtests twenty-one to twenty-four). The
  whitelist admits the script: it touches no state but its own
  reference's life, R3, visual, in every game. The vain shape the census
  argues for (docs/research/apocalypse/train-27-spells.md: all thirteen
  Apocalypse placed activators carry an OnLoad script and nothing else) is
  "OnLoad passes for a script on a reference whose base is an explosion's
  placed object"; it needs an ADR line and waits.
- Not fixed, HYPOTHESIS: the observer's undressed rune. The re-analyst's
  read (REA on sky-re, 2026-10-19, ids by lab/addr.py) kills "removed
  later": the rune registration 40674 registers a rune only when the
  shooter is the player, the limit sweep never takes grenades, fMineAgeMax
  is 0, and no caller of the projectile kill 44110 is shooter-conditioned
  beyond the player's cap. What stands is "kept but undressed": the
  figure's rune sits armed, and the one player test in its set look is the
  impact-effects pass 44213's quality tier (the player gets tier 0 or 4,
  anyone else 0xC), where the ground decal and the particles come from.
  That fits every word of the report, the frost at the walk-in included.
  The fix shape, if the read holds: a Skyrim Platform hook on that pass
  that lets a figure shooter (a dynamic form id, the mark every figure
  carries) take the player's tier, filtered in native (rule 9), plus a
  per-figure rune cap, since the engine will never register a figure's
  runes (four casts leave four armed glyphs in the observer's game, one in
  the caster's). A verb-sized change to this section.
- Not fixed, HYPOTHESIS: the observer's silent Lightning Strike. The relay
  launches the lobber from the relayed origin with the relayed angles,
  exactly as the rune; statically the figure's lobber should count its
  2.5 s down and explode in the observer's game (the trigger tick 44216
  returns early only on a null parentCell or a null explosion pointer),
  and the caster-side timing agrees with the records (the hit reached the
  server 3.07 s after the release: the timer plus the flight). Three
  one-read candidates: a null parentCell on the figure's launch, a model
  that never "arrives" so the timer never starts, or a no-collision lobber
  launched from the picked point with the caster's angles that dives
  below the ground and explodes out of sight and out of its 300 unit
  radius.

### Dynamic plan for the undressed rune and the silent strike

- Probe x-rune-visible (lab/.cache/probes, the hunters' camp shape of
  x-rune-trip2 with c2 at 350 units, about 405 from the point, outside the
  trigger): both games sample the rune projectile near the point every
  second for 30 s (the driver's projectiles step: the form id and the
  bisected distance; the fuller variant wants a refs-near step: Cell
  getNumRefs and getNthRef with the disabled and deleted flags, specified
  in the memo), screenshots at three marks, then c1 steps aside and c2
  walks through with an until on the server's health. Read: the rune
  listed in c2's game for the whole 30 s with no glyph on its screenshots
  says undressed; absent after a sample says removed, and the sample's
  moment names the killer; c1's series is the control. Runs at train-28's
  stage.
- Frida, c2's seat, after the probe: a read of the impact-effects pass
  44213 at a figure's rune landing (the tier chosen, against the player's
  own rune), the rune trigger tick 44216 and 44217, the arrival 44163, the
  kill 44110 with a backtrace if the rune ever leaves, and 43919; for the
  strike, the lobber's parentCell and explosion pointer at 44216's entry
  and its position at the timer's end.
- Owner: agent (the probe), then the re-analyst (the pass's tier test and
  the hook point, static) and Eli's seat (the Frida read).


## Train-29 (2026-10-20 night; fork m2-train-29 18c0e603 on parity 602a2dd2; the rows of docs/research/train-29-rows.md; MERGED to parity 4720d0d3 at 13:40, gate 10 of 10)

Built overnight on Eli's word ("go ahead and run tonight to do the biggest
lump"), each row from the reads of 2026-10-19, for the morning's stage
under the essentials layer (ADR-040: playtest twenty-seven on the stage, the
gate and the merges after).

- Lightning Strike on the observer (row 4): CommonLib's spell LaunchData
  takes the AV effect's projectile (src/RE/P/Projectile.cpp:213-222) and
  Lightning Strike's AV effect has none, so the observer's launch recorded
  projectile 0 and nothing flew (x-lightning-strike 20261019-220431, the
  launch row `[13929, 0, 0, ...]`). MagicApi.cpp (07b33046) takes the first
  effect whose base effect carries a projectile (include/RE/E/Effect.h:39,
  include/RE/E/EffectSetting.h:90) when the constructor left it null; area
  stays as set, the explosion comes from the PROJ. CONFIRMED on the launch
  (x-lightning-strike 20261020-085414 on the train's stage: both
  c1.watched_self().launched("0xc0cfe00") and c2.watched(c1).launched(
  "0xc0cfe00") held, the figure's launch carrying
  WB_DestructionShock_Projectile_LightningStrike instead of 0, so the pick
  took the strike's effect, not the rider's). CONFIRMED at T4 (Eli, playtest
  twenty-seven, 2026-10-20: "on test 2's screen the strike is visible now,
  the bolt and its lightning, and the bolt is gone within a second on both
  screens", ticked): the lobber explodes in the observer's game and places
  the bolt, which the WB_DestroyAfterDelay_Script admission then deletes. The probe is
  x-lightning-strike re-grounded at the camp asserting the
  lobber's launch on both seats, c1.watched_self().launched("0xc0cfe00")
  and c2.watched(c1).launched("0xc0cfe00") (PROJ 030cfe00
  WB_DestructionShock_Projectile_LightningStrike by lab/esm.py, 0x0C0CFE00
  in the layer-free order; numidium's correction of a transposed id), with
  both seats' screenshots at the strike. The records as esm.py reads them
  tonight: the spell's effects are 030fadfd (the AV effect) and 03100ba6
  (the perk rider, whose own projectile is 03100ba9, the _2C variant), so if
  the fix's first-with-a-projectile pick takes the rider's, the observer
  launches 0x0c100ba9 and the second line goes red naming it: the probe
  tells which effect carries the lobber. If the lobber flies and never explodes, the REA read's three
  candidates stand (a null parentCell on the figure's launch, a model that
  never arrives, a dive below ground).
- Finger of Death, the condition half (row 2b): IsEssential (354) is a
  server condition function now (eea3a5d5; a player is never essential, an
  NPC by its base record's flag, libespm NPC_.h isEssential; HYPOTHESIS: a
  runtime essential flag is not seen), so the spell's one effect is no
  longer refused as unknown and its hit holds (a fight begins). The kill
  stays the script's in the caster's game, ADR-029's default; the
  allowlist's server-side kill (MpActor::Kill, the headshot's primitive) is
  the next verb on that ground, not this train's. T0:
  unit/EffectConditionsTest.cpp. T4 (Eli, playtest twenty-seven): "only
  affected test 1": with test 2 at full health the script took its fail
  branch, which hurts the caster instead of killing the target (the mod's
  own rule, and twenty-three's reading of the same branch at a million
  Health); no ash pile this time, test 2 untouched, as the row expected
  for a target above the threshold.
- EffectWasDualCast (724; row 7b): thirteen Apocalypse spells and the
  Impact rider gate on it. The flag travels SpellCastMessage.isDualCasting,
  PartOne::StartCast, wire-rules casts::CastFacts::dual, the claim's dual,
  OnSpellHit, MpActor::ApplyEffects, EffectConditionsHold, the evaluator
  context; every other caller leaves it false, so a 724 rider holds only on
  a claimed dual cast. No wire change (the message carried the flag; the
  record is rule state). T0: the same test file; Rust 186 + 17 green.
  Read the same night against the records (a scan of every CTDA in the
  Apocalypse esp with esm.py's parser, 1643 rows): all thirteen "724
  spells" carry the same one effect, vanilla's Impact rider 0x153D3, gated
  EffectWasDualCast == 1 AND HasPerk(Impact) == 1, and the only other 724s
  are two orphan copies of that rider used by no spell. The server refuses
  on the first unknown function and HasPerk is unknown by design, so no
  724 effect is observable at T3 or T4 before M5; the gain is correctness
  and the T0 proof, not a visible change. What a dual cast does show on
  this build, playtest twenty-seven's row: Electrosphere (0x1A001879 under
  the layer) dual cast with Destruction Dual Casting (Skyrim.esm 0x153CF) is
  one ball and one hit, 55 Health and 55 Magicka applied once (the flag
  rides the claim; nothing in wire-rules scales by the engine's 2.2), two
  balls and 110 without the perk. Found on the way, a train-30 candidate:
  Hailstone's own two effects are gated on GetActorValue (14) and
  HasMagicEffect (214), which the server lacks, so it applies nothing on
  the server today. BUILT 2026-10-20 on fork m2-train30-conditions
  f2c0ba33 (server only, T0 in unit/EffectConditionsTest.cpp): the base
  effect WB_Des_Frost1_Effect_Hailstone (030B2C7F, 15 Health and Stamina,
  duration 0) gates on Subject.GetActorValue(ResistFrost) > 0 and its
  Shatter (030B374E, 15 with area 10, duration 0) on
  Subject.HasMagicEffect(030B2C7F) == 0 (the census,
  docs/private/apocalypse-census-spells.tsv:77). GetActorValue answers the
  current Health, Magicka or Stamina as the maximum (the base with the
  running buffs) times the kept percentage, and any other actor value as
  the player's recorded base (the client's ActorValues report, 0 to 163)
  plus the modifier of the effects the server applied, 0 with no record;
  HasMagicEffect answers from the running effects by the MGEF's runtime
  id, and an instant effect has no running entry (wire-rules magic.rs), so
  the Shatter's check reads false on the same hit as the engine's does.
  The parameters CONFIRMED by the record bytes (numidium's esm.py walk on
  sky-srv, 2026-10-20, decoded per libespm CTDA.h:57-68): MGEF 030B2C7F's
  one CTDA is function 14, operator 0x40 (">"), value 0, param1 0x2B = 43,
  run on Subject, so GetActorValue's parameter is the plain actor value
  index (upstream's GetActorValuePercent reads 0x3E8-style ids; not this
  function's encoding); the Shatter's CTDA is function 214, "==", value 0,
  param1 0x030B2C7F, the MGEF's id in the FILE's own index space (the third
  master byte Apocalypse's own), so HasMagicEffect's parameter is mapped to
  the global id through the record that owns the condition before the
  compare (ConditionFunction::IsFormParameter, MpActor::EffectConditionsHold;
  fork 39affd73); the older functions compare their parameters raw, which
  holds for Skyrim.esm's forms only. HYPOTHESIS, the gap: a Nord's 50 ResistFrost is
  a racial ability's constant effect, not a base, so the client's report
  carries 0 and the server never applied it; the engine answers 50 and
  applies the base effect, the server refuses it. The row's second half
  BUILT 2026-10-20 on fork m2-train30-conditions 52ea63f8: the race's
  constant abilities (RACE SPLO, each an Ability spell of constant cast
  type; libespm already parsed the list) are read once per race from the
  records into the rule's facts (MpActor.cpp RaceAbilityFactsOf) and summed
  by wire-rules magic.rs constant_modifier (no buff filter, no give-back)
  under the running effects in MpActor::GetEffectModifier, the one modifier
  the maxima, the regeneration rates, the damage formula and GetActorValue
  read; so a Nord answers 50 on ResistFrost with no record and no running
  effect, and an Altmer's maximum Magicka carries Highborn's 50, which the
  server had run short by (every figure's bar and every magicka check of an
  Altmer, a quieter gap the same source closes). T0: the record chain for
  a Nord and an Altmer appearance (unit/EffectConditionsTest.cpp), green
  in ctest on the train's head (fork m2-train-30 1d88a6b7, pipeline 2309):
  the Nord reads 50 on ResistFrost from Skyrim.esm's own records and the
  Altmer's maximum Magicka carries Highborn's 50 (UESP's Skyrim:High Elf
  confirmed by the record). The gap it exposed next, the server applying Hailstone's
  effects at their magnitudes with no resistance multiplier where the
  engine halves frost damage on a Nord (the engine's resistance never runs
  on a player's imposed damage), is the resistance rule, BUILT the same
  day on fork m2-train30-resist 8219604e, stacked on this branch
  (docs/verbs/magic-effects.md, Resistance). The record read on sky-srv
  (2026-10-20, esm.py, Apocalypse's esp, DATA 152 B each): the base effect
  030B2C7F has flags 0x200805 (Hostile, Detrimental) and NO resist value
  (0x10 = -1); the Shatter 030B374E has flags 0x208005 (Hostile,
  Detrimental, HideInUI) and resist 43, ResistFrost. So on a Nord the engine
  halves the Shatter and lets the base effect through whole, 15 + 7.5. The
  scenario b-hailstone, first run on the train stage (20261021-004204 on
  fork m2-train-30 44372078 over the fixed layer): the Orc row 0.85 (the
  Shatter alone, whole), the Nord row 0.7892 with the wait's regeneration,
  the record's number; its band had said 0.85 and was corrected to the
  record (main 053dd276). CONFIRMED there: the conditions (the base effect
  refused on the Orc, applied on the Nord by the race's ResistFrost) and
  the resistance rule on the Shatter.
- Scattershock (row 6), measured, no code: x-scattershock-6s
  20261020-080751 (train-28's stage, camp flat, 6 s hold): thirteen missiles
  launched on both seats (the PROJ 083a24 of Apocalypse) and the server
  recorded the hits (c2 at 0.78 Health); twenty-five's "hits not reported"
  was a 2.5 s hold equal to the charge. The missile angle on the observer
  stays unmeasured: the lab's flights record covered arrows only. Train-30
  BUILT 2026-10-20: the projectileFlight hook admits a spell's projectiles
  (fork m2-train30-flights 951b5bbc: the spell source in place of the ammo,
  the spell's id in the event; the bow service already ignores a flight
  without ammo) and the driver's flights rows carry projectile and spell as
  columns nine and ten (thuum main; lab-api pairs on the first eight, so an
  arrow's flights_match reads as before, and a spell's pairing by projectile
  is lab-api's follow-up). The measurement is a stage with both seats
  watching a Scattershock cast.
- The rune glyph (row 5) and the local dent (row 3): their Frida reads ran
  on this train's stage (x-rune-visible-frida 20261020-085906 on c2,
  x-figure-values-hit-frida 20261020-085705 on c1; lab/frida/
  rune-tier-trace.js and figure-dent-trace.js), the traces under read; no
  hook before the read (rule 8). The refs-near step (the driver's, train-29)
  settled the rune's other half: x-rune-visible 20261020-090323, the
  observer's game holds the figure's rune as a reference whose base is the
  PROJ (c2.refs_near().count(50) == 1 at 440 units, the same 30 s later)
  and its trip deals the server's number, so the missing glyph is a
  drawing matter, not a removal. The tier trace then read on the observer
  (x-rune-visible-frida 20261020-085906, docs/research/frida-reads-train29.md
  section B): the landing's look never runs for the relayed rune at all,
  the tier compare 44213 and the settle 43919 were never entered in two
  minutes, bit 20 of the flags stayed clear, and the rune was "arrived"
  (44163) 35 ms after the launch from inside the first trigger tick's test,
  not from a collision, then stood 3185 ticks with cell and explosion
  non-null until the trip (one kill from the tick, a second 4 ms later).
  The REA read's tier mechanism (H3b) is NOT the cause: nothing was dressed
  and then undressed; the look is skipped upstream of 44213, and the
  caster's own engine launched its rune from the identical point, so the
  origin does not discriminate. The caster-seat read followed the same
  night (x-rune-visible-frida2 20261020-092130, both seats; the memo's
  section D): the caster's OWN rune never ran 43919 or 44213 either, so
  the tier compare is dead for runes on both seats and the glyph does not
  come from it; both runes are born at rest at the point (velocity and
  origin excluded); the first divergence is the runtime flags at Init3D's
  entry, 0x210000 (kAutoAim, Projectile.h:157) for the engine's cast path
  against 0x20010000 (kUseOrigin, :165) for the relay, the pair CommonLib's
  spell LaunchData constructor sets (useOrigin true, autoAim false,
  Projectile.cpp:220-221), and the arrival then takes a different branch of
  44217 for each (+0x247 against +0x1c3). Built the same night on
  m2-train-29 as a relayed launch with delivery kTargetLocation taking the
  engine's pair (99c39e3e), measured on its stage and REVERTED (d34053e0):
  no glyph, and the static read says why the flags could not matter. The
  static read then came in (the re-analyst on
  REA the same night, docs/research/re-37335-and-rune-landing.md, question
  2; HYPOTHESIS from pseudocode): 44163 is not an arrival but the trigger
  test's per-candidate validity check (44217 calls it for each nearby actor
  at +0x1be and then for the local player at +0x242), so +0x247 against
  +0x1c3 is WHICH actor stood within 150 units (the caster's own player on
  c1, the caster's figure on c2), not a shooter branch; both returned 0
  because the candidate was the shooter (iProjectileMineShooterCanTrigger
  0). The flag flip was a no-op, as predicted: Launch sets kAutoAim only for
  a player shooter, and kUseOrigin's one reader is the position snap for
  non-grenades; on 99c39e3e's own stage x-rune-visible-frida2
  20261020-101636 showed no glyph in the observer's view at any of four
  marks, and the commit is reverted (m2-train-29 d34053e0; the projectile
  pick stays). 43919 is the grenade's Havok
  deactivation callback and 44213 is fed by the collision landing; a
  target-location rune is born at rest (speed 0) in both games, so neither
  runs anywhere, as measured. The glyph is a DECAL: the caster's own
  target-location launch 34452 calls the decal placement 44186 after
  Projectile::Launch, with the pick's position, its normal scaled, the
  material id from 44190 and the grenade's own decal group (slot 0x9F),
  gated on the projectile's slot 0xAE; 44186's only callers are 34452 and
  44213, and the relay's bare Launch (MagicApi.cpp) never passes through
  34452. CONFIRMED by rule 8's read the same night (x-rune-decal-frida
  20261020-102818, rune-decal-trace.js on both seats, on 99c39e3e's stage):
  the caster's game entered 34452 from the player's cast, launched inside
  it (autoAim 1, useOrigin 0), looked the material up (44190: materialID
  0xe4d39ca3, form 0x12f37) and placed ONE decal (44186: the rune PGRE, the
  pick's position, the normal (5.83, -69.75, 0) of length 69.99, return
  0x10000); the observer's game had one launch row from the relay (the
  figure as shooter, 99c39e3e's flags in effect, contact normal (0, 0, 1))
  and no 34452, material or decal row. Two side facts for the row: the
  caster's normal was nearly horizontal, so that probe's aim put the rune
  on the tent's south face, not the ground (the screenshots' weak control),
  and the relay today sends (0, 0, 1) for every launch. Train-30's row:
  relay the caster's contactNormal (34452
  copies the pick's normal into LaunchData, which the Launch-entry reader
  already sees) and the material id with the cast (a wire change: the
  SpellCast message and its validator in one commit, rule 4), and after the
  relayed Launch call 44186 as 34452 does when the new projectile's slot
  0xAE is true; a relayed material failing, the landscape's at the point
  (what 44190 does for the land shape). Native only, filtered on a
  dynamic-form shooter (rule 9). Still wanted: a per-figure rune cap in the
  observer's game, since the registration gate (43934) admits the player's
  runes alone and a figure's four casts would leave four armed runes.
- The event filter (row 1) is its own verb, docs/verbs/papyrus-events.md
  (b2db6354 on this branch), with its rate read: a dozen Papyrus events a
  second at idle on the old filter (numidium, lab/frida/sendevent-rate.js:
  OnTrigger about 30 and OnUpdate 13 to 22 per 5 s), so the parent walk is
  noise.

## A spell projectile flies the arrow's way (train-31, 2026-10-20)

Playtest twenty-eight: "a marksman like bug where the spells land in
different places on different screens", while the arrows landed alike (Eli:
"marksman check was great. just copy that for the spells"). The read
(docs/research/train-31-reads.md section 6): the cast message already
carried hasLaunch and the five launch fields, the validator checked them and
the server relayed them (LaunchRay plus 512 units), but the caster's game
filled them for a target-location cast only (magicSyncService's gate), and
the figure's cast in the other game read them only for a target-location
delivery (MagicApi.cpp): an aimed bolt left the figure's own third-person
magic node along the relayed aim. b-hailstone 20261021-005051's launches on
both seats put that node about 65 units from the caster's own (behind the
aim, to the right, lower) at identical angles, so the two bolts flew
parallel 65 units apart at any range. Fork m2-train-31 c3dae632, no wire
change: the caster's own cast of a fire-and-forget projectile aimed or at a
target actor (Firebolt, Electrosphere, Hailstone) waits for its launch and
the projectile's flight as a target-location cast waits for its launch, and
goes with the launch's origin and the flight's angles (the bow service's
rule; m2-train30-flights 951b5bbc merged for the spell flights); the figure's
cast takes the launch for any projectile. HYPOTHESIS: whether a player's
spell bolt re-aims on its first update as an arrow does (the flight's angles
cover it either way). T3: b-spell-aim (for review; b-arrow-path's claim,
within 2 units and half a degree). T4: playtest twenty-nine item 7.

## p-spell-bolt's extra effects (the nightly 20261023-104716 on train-37's stage, 2026-10-23)

The nightly's one red, twice (20261023-140019 and 140742, step 21, parity.ok):
"actor-own/effects/fe014811 extra (reference: absent; run: at 3249 ms)" and
"target-figure/effects/fe014811 extra", the second run adding
"actor-figure/effects/fe01481d extra (at 448 ms)". By the server's load
order fe014811 and fe01481d are StealthKillDetectionFix.esp's 0x811
madDetectionDummyEffect and 0x81d madDetectionDummyEffectLOS (lab/esm.py),
the probes its detection cloaks (SPEL 0x817 madDetectionCloak, 0x818
madDetectionCloakConc) pulse onto actors in range; the plugin has no NPC_ or
RACE record, so no base carries them: its quests (madStealthKillQuest,
_Attack, _Sleep) and perks (StealthKillDetectionFixAttackPerk and its Bow and
LOS variants) cast them from script or an entry point. The probe's target is
c2's player at full health 150 units off; 3249 ms is the bolt's landing. The
lab is ruled out: the recorder's effects are Skyrim Platform's
magicEffectApply events, unfiltered (lab/driver/src/index.ts:913-919), and no
effects line changed between the 10-21 driver (ceded7d6) and the night's
(8d3b3139). The reference (lab/references/spell-bolt-a.json, retaken 10-15)
predates the essentials layer that brought the mod (10-19), but the probe was
green on 10-21 on trains 30 and 31 with the mod in the load order, so the
mod's presence alone is not it: the cloak runs at the hit now where it did
not. Mechanism (numidium's agent decoded the plugin fully on sky-srv,
2026-10-23 07:3x: no script casts the cloak, no perk names it): SPID 7.3.0's
StealthKillDetectionFix_Attack_DISTR.ini hands ability 0x817 madDetectionCloak
to every non-player actor at load, never the player; the cloak's three
constant effects fire while the holder detects the player and is not
sneaking, has the player as combat target, or sees the player and is hostile;
its item 0x818 carries 0x811, whose own condition is GetIsID(0x7 Player), so
the dummy lands on Player-based actors alone. The holders, by the recorder of the
parity run 142552 (trace-c1.json): the lab spawn's fox 0x107cf9 and rabbit
0x107d07 (a wolf 0x86112 beside them), every 0xfe014811 application cast by
one of them, onto c1's own actor and the figure from 3416 ms every 500 ms;
the 10-21 green's watch listed the figure alone, the cleaner having removed
the wildlife then, and since npc-puppet (the cleaner's floor at 0xff000000,
19e7ca9b) the engine's own references stand in every game. So the bolt's
landing made the animals detect or target c1 and their cloaks pulsed. Not a
spell-path regression; the declaration is on the probe's later list (main
626108f6, its own commit, docs/private/reviews-pending.md), the reference
stays. The figure is therefore an NPC to every
distributor in the layer and a Player to every GetIsID(0x7) condition: a
design row for the figure model, decided 2026-10-23 (ADR-046, decision 2,
Eli: "go with your recommendation"): a figure carries only what the server
gives it, the client stripping every distributor-added spell and ability at
the figure's load (getSpellCount, getNthSpell, removeSpell), the Player base
kept; a client train of its own.
What changed since 10-21 is the wildlife standing in the lab's games, npc-puppet's
doing by design; the figure's double nature stands as the row (the dummy landed
on the figure, so GetIsID(0x7) passed for it). Reads: p-spell-bolt on parity
7b3a17c6 (20261023-142552, the stage m3-train-36) was RED with the same diff
(both dummies at 3416 ms), clearing train-37; the recorder then named the
casters (above), which ends the bisect. The reference stays
until the cause is named (no retake under ADR-042b without it); the row
blocks nothing, the probes are invisible to a player.
