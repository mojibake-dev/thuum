# Verb: shadowbond

Drafted 2026-10-18 evening from playtest twenty-three and apocrypha's read of
the mod's records and script (docs/research/apocalypse/train-27-spells.md,
branch apocrypha/train-27-spells). Not built; train-27's row after the
target-by-first-hit relay and the teleport snap, which it stands on.

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
| OnEffectStart: an FXEmptyActivator placed at the target, a 0.25 s wait, then the caster and the target each cast the Self proc 03055B32 on themselves (effect 03055B31, archetype Invisibility, 600 s, keyword MagicInvisibility 0x1EA6F) | script | native in each game that runs the script: with the target-by-first-hit relay the target's game casts the figure's Shadowbond at its own player, so the script runs there too and the target's own game turns its player invisible (playtest twenty-three: it never did, the relay named nobody) |
| the two invisibilities on the server's effect record (MagicEffects) and their shimmer on every other screen | magic-effects verb | imposed, already: the server records the proc from each player's own Self cast report |
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
  jumps; the invisibility through MagicEffects as today.
- Visual without simulation achieved by: the script's own sound, VFX and
  image space modifier play in the two games that run it; the other
  screens see the placements and the shimmer (the mod's effects on figures:
  later, as cast-teleport's vanish and appear).
- Side effects: HYPOTHESIS until b-shadowbond.

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

- Where the logic lives: a Rust rule beside casts (wire-rules
  shadowbond.rs or a bonds table in the teleports rule): record at the
  claim, break at EndConcealment, permit both, expire at 20 s; the C++
  glue in OnHit and EndConcealment.
- DB fields / migration: none (a bond does not survive a restart; a
  restart mid-bond leaves both visible and unmoved, as the mod's own
  effect would end).
- Restart behavior: as above.
- Papyrus natives touched (ledger lines added): none.

## Client

- SP binding: none new.
- TS handler: none new; the first-hit relay and the snap relay carry it.
- Kill switch config key: the spell's entry in server-settings' Apocalypse
  table (ADR-029).

## Tests

- T0: the bond rule (record, break by either, two permits with the right
  destinations, expiry, one bond per caster).
- T1: none.
- T2: a difftest session shadowbond: the cast with target 0, the hit on c2,
  the two proc casts, a weapon hit by c1 (the break), two movement reports
  landing at each other's positions: the wire stack accepts both, the
  legacy stack snaps both back (declared).
- T3 scenario id: lab/scenarios/b-shadowbond.yaml (both seats: c1 casts at
  c2 from close, both bools av:Invisibility true on each own game and each
  figure; c1 attacks; within 1.5 s c1 stands where c2 stood and c2 where
  c1 stood, on the server and on both watches, each as one step (maxStep
  about the distance), nobody snapped back; then the 20 s no-break case).
- Assertions that would fail if the verb silently regressed: a landing
  refused (server.actor positions unchanged after the break); a slide
  (maxStep under the distance); the target's own game never invisible.

## Dynamic plan (fill when any tag above is still HYPOTHESIS)

- Frida script: none; the lab's watches measure the order.
- Owner: agent (lab probes).

## Status

- [x] doc complete, inventory listed with a disposition per row, rung declared
- [x] engine surface cited or delegated (the records and the script, apocrypha 2026-10-18)
- [x] server logic + T0 (fork m2-train-27 4b126048: wire-rules bonds with
      three tests; PartOne::SetBondSettings, IsBondSpell, RecordBond,
      BreakBondsOf; EndConcealment breaking the acting actor's bond; OnHit
      recording it at the claim; unit/BondTest, three cases; the lab's
      server-settings name Shadowbond on thuum lab-bonds-setting)
- [x] message + validator (same commit): no new message
- [ ] native hook + T1: none
- [x] TS handler: none new (the first-hit relay and the snap carry it)
- [ ] T2 green
- [ ] T3 scenario green, no HYPOTHESIS tags
- [ ] parity scenario green, or its later list reviewed with it (ADR-031)
- [ ] sequences and combinations green, every checklist item with its scenario (ADR-033)
- [ ] ledger and suppression registry updated
