# Verb: shadowbond

Drafted 2026-10-18 evening from playtest twenty-three and apocrypha's read of
the mod's records and script (docs/research/apocalypse/train-27-spells.md,
branch apocrypha/train-27-spells). Built in two trains: train-27 (the bond
and the server's swap) and train-28 (the concealment, third shape), merged
to fork parity e3806870 (2026-10-20T02:00Z); b-shadowbond green twice on
that tree (20261020-015430, 20261020-015709) after one red on its own aim
(20261020-014021 step 44; the scenario's placement fixed on main 8a2cb11).

## Intent

Apocalypse's Shadowbond (0x0C031C4D in the lab's order): the caster and the
target both turn invisible, and when either's invisibility breaks the two
swap places, on every screen and as one event, the server owning the two
positions.

Roadmap reference: none
Milestone: M2 (ADR-029, the Apocalypse class A1 teleports)   Class: B

## Inventory (ADR-031: the action's consequences, before its rung)

From the records and the script (apocrypha, 2026-10-18; the .pex read is
HYPOTHESIS until a lab trace shows the order): the spell is Target Actor,
fire-and-forget, 20 s; its effect 03055B2F (archetype Script, conditions
IsActor == 1 and GetDead == 0 on the Subject) carries
WB_InvisProcTeleport_Script, which runs on the TARGET's effect.

| consequence | seen in | disposition |
| --- | --- | --- |
| OnEffectStart: an FXEmptyActivator placed at the target, a 0.25 s wait, then the caster and the target each cast the Self proc 03055B32 on themselves (effect 03055B31, archetype Invisibility, 600 s, keyword MagicInvisibility 0x1EA6F) | script | native in the CASTER's game only. The relay's fire-and-forget target path applies nothing to the target's own player: castSpellImmediate launches the spell's projectile with the named target as the desired one (skyrim-platform MagicApi.cpp:254-302), and Shadowbond has no projectile, so the script never starts in the target's game (playtest twenty-four: "we're still both visible on player 2's screen"; x-shadowbond 20261019-093744: c2's own watch held no effect and no cast). The spell-cast row that applies a projectile-less target spell directly (CastSpellImmediate on the figure's caster, as the Self and concentration branches do) is filed on spell-cast.md, not here: it would run a second script instance, which the pin would then have to cover |
| the two invisibilities on the server's effect record (MagicEffects) and their shimmer on every other screen | magic-effects verb | IMPOSED since train-28 (fork train28-bond): no Self cast report exists for the proc, because Skyrim Platform raises spellCast only for a spell in one of the actor's selected slots (EventHandler.cpp:1495-1512, isCastValid) and the script's Papyrus cast is of an unequipped one (playtest twenty-four: the proc 0C055B32 reached no log from either game). So the bonds entry names its `proc`, PartOne::RecordBond records the proc's effect on both actors for the bond's 20 s (ApplyEffects with the duration overridden; self-expiring, a restart included) and, 500 ms later (the mod's own script waits 0.25 s after OnEffectStart before its casts), relays the proc as each bonded actor's OWN instant cast (a SpellCast message with the actor as caster and target, castingSource 3, no launch) to every game that sees the actor but the caster's own, where the script already cast both: an observer's game casts it on the actor's figure through castSpellImmediate's Self branch (b-invis-recast's nightly primitive), and the target's own game maps a caster that is itself to 0x14 (remoteServer.ts). The first shape, a Papyrus `Spell.Cast` SpSnippet, completed in the target's game and applied nothing (b-shadowbond 20261019-215816, playtest twenty-five: av:Invisibility never true on c2's player or c1's figure there), as the driver's own Spell.Cast never applied anything (push.md); Skyrim Platform's latent dispatch of that native has no green run anywhere. The break, a recast at another target and the bond running out (PartOne::TickBonds, the bonds rule's `expired`) end the records by source (MpActor::EndRunningEffectsOfSource) and send `Actor.DispelSpell` to the target's own game; the figures' copies follow the records (magicEffectsService dispelEnded) and the caster's are the script's own |
| the poll every 0.2 s: the swap fires the first time EITHER actor no longer has MagicInvisibility; WB_CheckLocation false | script | native in each game; the break the server sees is its own EndConcealment on an act (a cast, an attack, an activation, a bow release), so the server knows the moment within one report |
| the swap: box.MoveTo(caster), caster.MoveTo(target), target.MoveTo(box), rotations matched, then sound and VFX on both, an image space modifier, Dispel on self | script | the two POSITIONS are the server's (R0 since 2026-10-19): at the break the server teleports both players to each other's places itself (MpActor::Teleport, the lab's own teleport path), because the script runs in the CASTER's game only (ADR-029) and so moves the caster and the target's FIGURE there, while the target's own game never moves: x-shadowbond 20261019-073758 on 4c7e6998 swapped c1 alone (its permitted landing taken) and c2 stayed put with no self events. The caster's own script move lands on the spot the server chose and reads as the arrival; the figure's MoveTo in the caster's game is overwritten by the relay as today. The permits of the first build are gone. Second iteration (x-shadowbond 20261019-083537 on 13acbb35): the swap fired and c2 landed, but the script's poll in c1's game then moved c1 once more, to where c2's figure now stood (c1's own old spot), undoing c1's half (c1's track: its spot, c2's spot at 13419 ms, its own again at 13672). So the server holds both at the swap's places for 1.5 s (wire-rules Budgets::pin; a report from farther than the arrival radius meanwhile is sent back with Teleport2, MovementValidation), and the script's second move is refused; HYPOTHESIS that 1.5 s covers the script's poll, the next run says |
| the look of the swap on the other screens | relay | imposed through the teleport snap (train-27's row): both accepted jumps are relayed as placements, so neither slides |
| OnEffectFinish at 20 s with no break: dispels the proc on both, deletes the box, nobody moves | script | native in each game; the server ends the bond with the effect's duration |
| a target that is an NPC | script | later: M3 (the host's game runs the script; the server permits the NPC's jump as a hosted move) |

### Sequences and combinations (ADR-033)

| sequence or combination | probe or scenario | result |
| --- | --- | --- |
| cast, both invisible, the caster attacks: swap | b-shadowbond | |
| cast, both invisible, the TARGET casts: swap (the other break) | b-shadowbond | |
| cast, nobody acts for 20 s: no swap, both visible | b-shadowbond | |
| a recast while bonded; both players cast it at each other | x-shadowbond-both | |
| a cast at range past 200 units: nothing lands, nothing relayed (the first-hit rule) | b-cast-target-hit | |

## Authority

Rung: R0 for both positions (the server moves both players at the break
and holds them there for 1.5 s; the caster's game's script move is the same
spot and reads as the arrival, its second move is sent back, the target's
game is moved by the server alone), R0 for the bond itself (the server records
it at the Shadowbond hit's claim and ends it at the break or at 20 s).
Why this rung and not the one above it: the mod's script performs the move
in each game anyway (as Lost Grimoire's Teleportation does, cast-teleport);
the server moving both itself would double the move and fight the script.
What the server validates: the caster's landing within a slack of the
target's recorded position at the break and the target's within the
caster's; a landing elsewhere is refused and snapped back as any movement
is (movement-speed).
Rate limit / bounds: one bond per caster at a time; the permit's window
about 1.5 s after the break (the script's poll is 0.2 s, the engine's
MoveTo instant, the report cadence 130 ms).

## Engine surface

- CommonLibSSE-NG symbol(s): none new; the server reads the spell's effects
  and the proc's keyword from the records (libespm); EndConcealment already
  names the acts that end invisibility (self-cast.md: DispelAlteredStates
  38819's callers).
- Address Library ID(s): none new.

## Observe (host or acting client sees the intent before the engine acts)

- Hook point: the Shadowbond hit's claim (ActionListener::OnHit, the first
  hit of a cast delivered to its target), the two Self proc cast reports,
  and EndConcealment's acts; the landings as movement reports.
- SP filter: none new.
- Data captured: nothing new on the wire.
- Side effects of hooking here: none.

## Impose (observers render the server's decision)

- Mechanism: the teleport snap's placement relay for the two accepted
  jumps; the concealment through the server's two records (MagicEffects
  to every listener), the proc relayed as each actor's own instant cast
  (SpellCast, castingSource 3) to every game but the caster's, which casts
  it on the figure or, when the caster named is the game's own player, on
  0x14 (train-28, fork train28-bond3; PartOne::ConcealBond, CastBondProc,
  remoteServer.ts onSpellCastMessage), and one SpSnippet, `Actor.DispelSpell`
  of it on the target's own player at the end (UnconcealBond).
- Visual without simulation achieved by: the script's own sound, VFX and
  image space modifier play in the one game that runs it (the caster's);
  the other screens see the placements and the proc's own shimmer, cast
  there by the snippet, which the engine renders as it renders any
  Invisibility effect.
- Side effects: HYPOTHESIS, unmeasured by b-shadowbond (its target never
  acts, and a watch of av:Invisibility cannot tell one copy from two): that
  a second Papyrus cast of a running Self spell by the same caster replaces
  the copy rather than stacking (the reason the caster's own game gets no
  relay; harmless either way), and that the target's own imposed copy
  breaks under the engine's DispelAlteredStates at the target's act as a
  cast one does. Measured next by playtest twenty-seven's "test 2 breaks
  it" row (the server ends the records at either's act regardless, so
  the engine's part is the target's own screen in the frames before the
  dispel lands), then by a scenario phase in which c2 casts while bonded.

## Suppress (engine's own behavior blocked on non-hosts)

- What is suppressed: nothing; a figure's MoveTo by the script in the
  caster's game is overwritten by the relay, as every figure move is.
- Side effects: HYPOTHESIS: the figure's one-frame hop before the relay's
  next report (the placement arrives within a report).

## Message contract

- Message name / numeric type: none new. The bond and the permits are
  server state; the jumps travel as movement reports and the snap relay.
- Contract doc updated: no change.

## Server

- Where the logic lives: the Rust rule wire-rules bonds (the entry with
  its `proc`, record, supersede, break_of, expired, forget; the bridge's
  BondBreak carries the bond's facts and its proc) and the C++ glue:
  OnHit records at the claim, EndConcealment breaks at an act,
  PartOne::RecordBond, BreakBondsOf, TickBonds, ConcealBond and
  UnconcealBond.
- DB fields / migration: none. The bond itself does not survive a restart
  (a restart mid-bond swaps nobody); the two concealment records do, as
  running effects do (magic-effects.md), and end by their own 20 s.
- Restart behavior: as above; the target's own imposed copy outlives a
  restart until its 600 s or its player's next act, a known gap of the
  cheapest shape (an `expired` after a restart finds no bond to dispel).
- Papyrus natives touched (ledger lines added): none.

## Client

- SP binding: none new.
- TS handler: none new; the first-hit relay and the snap relay carry it.
- Kill switch config key: the spell's entry in server-settings' Apocalypse
  table (ADR-029).

## Tests

- T0: the bond rule (wire-rules bonds, six tests: the entry with and
  without its proc, record, break by either, a bond that ran out returned
  once and a broken one never, a recast superseding the caster's own
  bond alone) and the server (unit/BondTest, eight cases: the swap and the
  hold as before; a claimed hit records the concealment on both and casts
  it in the target's game alone, on its player and on the caster's
  figure; the break ends both records and dispels the target's once; a
  bond left alone runs out with no swap and one dispel; a recast at the
  same target refreshes without a dispel). Skyrim.esm's
  dunHonningbrewSkeeverPoison 0x10FC22 and Invisibility 0x27EB6 stand in
  for the mod's spell and proc, which the test's load order lacks.
- T1: none.
- T2: a difftest session shadowbond on target-by-hit's shape: the cast
  with target 0, the hit on c2 (the claim: two MagicEffects records and
  the two SpellCast relays to c2), a Flames cast by c1 (the break: both
  Teleports, the DispelSpell snippet to c2, the sets without the proc);
  the legacy stack, which never learned the spell, emits none of them
  (declared).
- T3 scenario id: lab/scenarios/b-shadowbond.yaml (both seats: c1 casts at
  c2 from 150 units with the 1500 ms hold; av:Invisibility true on each
  own player and on each figure, the server's two records with more than
  10 s left; c1 casts Flames; c1 stands where c2 stood and c2 where c1
  stood, every invisibility dropped, the records gone; then a second bond
  left alone 20 s: no swap, records gone, both visible).
- Assertions that would fail if the verb silently regressed: a landing
  refused (server.actor positions unchanged after the break); the target's
  own game never invisible (c2.watched_self().ever("av:Invisibility"),
  twenty-four's finding); the caster's figure never invisible on the
  target's screen; a record outliving the break or the 20 s.

## Dynamic plan (fill when any tag above is still HYPOTHESIS)

- The own-player half of the relay: CONFIRMED on e3806870's stage.
  b-shadowbond 20261020-014021 (step 33), 20261020-015430 and
  20261020-015709 all read c2.watched_self().ever("av:Invisibility") == 1
  and c1.watched_self().ever(...) == 1 with the server casting the proc only
  into the game that is not the caster's (server.log "CastBondProc: c055b32
  relayed as ff000000's and ff000001's own instant cast to 2 game(s)"), so
  castSpellImmediate's Self branch works on a game's own player (0x14)
  through the instant caster as it does on figures (b-invis-recast). The
  solo probe that would have told the shapes apart is no longer needed; the
  first shape's failure (b-shadowbond 20261019-215816, the latent Spell.Cast
  snippet applying nothing) stays recorded as the reason for the relay.
- The target's own act: CONFIRMED at T4 (Eli, playtest twenty-seven,
  2026-10-20: test 2 broke the bond by acting, the swap fired and both
  turned visible on both screens, ticked); a scenario phase with c2 acting
  is still owed for T3. Still HYPOTHESIS, with their plans beside them: the
  .pex read's order of the script's steps (Inventory, two rows: a Frida
  trace of the Papyrus calls in the caster's game, or the lab's watch timing
  against the 0.25 s wait), the replace-not-stack in the caster's game
  (Impose, side effects: unmeasurable by eye; a Frida count of AddTarget
  on 0x14 at a recast), and the figure's one-frame hop (Suppress, side
  effects: a frame capture at the break). None blocks play; all block
  "done".
- Frida script: none; the lab's watches measure the order.
- Owner: agent (lab probes); Eli's eyes for the target's act (twenty-seven).

## Status

- [x] doc complete, inventory listed with a disposition per row, rung declared
- [x] engine surface cited or delegated (the records and the script, apocrypha 2026-10-18)
- [x] server logic + T0 (fork m2-train-27 4b126048: wire-rules bonds with
      three tests; PartOne::SetBondSettings, IsBondSpell, RecordBond,
      BreakBondsOf; EndConcealment breaking the acting actor's bond; OnHit
      recording it at the claim; unit/BondTest, three cases; the lab's
      server-settings name Shadowbond on thuum lab-bonds-setting. Train-28,
      fork train28-bond b28517ed: the server swaps both itself and holds
      them (ab14087f), and owns the concealment: the entry's `proc`,
      ConcealBond and UnconcealBond, TickBonds, EndRunningEffectsOfSource;
      six Rust and eight server tests; the lab's entry names the proc on
      thuum lab-bonds-proc 35a2b66. Then train28-bond2 62f95f5e: the casts
      500 ms after the claim on a timer with an epoch guard; and
      train28-bond3 e3a5b367: the proc as a SpellCast relay in place of the
      Papyrus snippet, BondTest reading the relays, after b-shadowbond
      20261019-215816 read the snippet applying nothing)
- [x] message + validator (same commit): no new message
- [ ] native hook + T1: none
- [x] TS handler: remoteServer.ts onSpellCastMessage (train28-bond3): a
      relayed cast whose caster is this game's own player is cast on 0x14
      (the server's imposition), and a relay carrying no animation
      variables takes the actor's own current set
- [x] T2 green (session shadowbond.yaml, 19 declarations, on train28-bond3;
      e3806870's T2 green beside the gate, 32 sessions identical, difftest
      job 9056; b81ce2a9's first T2 red on a declaration slip, two relay
      messages matching one declaration, fixed sessions-only in e3806870)
- [ ] T3 scenario green, no HYPOTHESIS tags: the scenario IS green
      (b-shadowbond 20261020-015430 and 20261020-015709 on e3806870's
      stage, after 20261020-014021 red at step 44 on its own aim; placement
      fixed by thuum 1131d57, main 8a2cb11); T4 ticked whole in playtest
      twenty-seven (both screens, the break by either seat, the 20 s run
      out); three HYPOTHESIS tags remain (Dynamic plan), so the box stays
      open until they are measured
- [ ] parity scenario green, or its later list reviewed with it (ADR-031)
- [ ] sequences and combinations green, every checklist item with its scenario (ADR-033)
- [x] ledger and suppression registry updated (NATIVES.md: SPELL.Cast and
      Actor.DispelSpell as the two snippets the server sends; nothing
      suppressed)
