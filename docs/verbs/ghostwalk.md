# Verb: ghostwalk

## Intent

A player casts Apocalypse's Ghostwalk: 10 s invisible, then back where the
cast was made. The mod's own script runs in the caster's game, and the server
takes the return jump instead of sending the player back.

Roadmap reference: none (Eli's stretch mods, docs/MODS.md "Apocalypse -
Magic of Skyrim"; docs/PLAN.md M2 item 10, ADR-029's first verb).
Milestone: M2   Class: B

## Inventory (ADR-031: the action's consequences, before its rung)

From the records and the script as apocrypha read them from the 10.2.3
archive (docs/MODS.md, "Four spells"; docs/apocalypse-options.md 5.4).
The reference trace (the recorder in a solo client run with the layer,
lab/references/ghostwalk.json) is step 1 of the Dynamic plan and may add
rows.

| consequence | seen in | disposition |
| --- | --- | --- |
| the Self cast's hand animation and its magicka cost | record (SPEL 0300AAE8: Illusion, fire-and-forget, Self) | native in the caster's game; the cast is spell-cast's (R1), relayed so the figure plays it |
| the caster invisible for 10 s (MGEF of the Invisibility archetype) | record | imposed: the server runs it as a state (self-cast's archetype 11, R0); native in the caster's game; on the figure by the relayed Self cast, its name hidden (fork m2-flight f3569b95) |
| OnEffectStart: the caster's X, Y, Z and location recorded in the script | record (WB_Ghostwalk_Script) | native in the caster's game: the filter passes an effect the player bears (ADR-029 A1, test 1) |
| OnEffectFinish: a wait (WB_Wait, 0.4 s), then SetPosition back to the cast point | record | native in the caster's game; the server takes the move as a permitted return (R1, Server) |
| a sound, a visual (FXEmptyActivator 000B79FF placed for it) and QueueNiNodeUpdate at the return | record | native in the caster's game; later on other screens: the figure's script is blanked there (Suppress) |
| an image space on the caster's screen | record | native (R3: the caster's screen only) |
| a detection event at the return (CreateDetectionEvent) | record | native in the caster's game; later: other games' NPCs hear nothing (NPC hosting, M3) |
| the Eye Fix ability added to the caster (AddSpell) | record | native in the caster's game; HYPOTHESIS that the server never learns it (a script's AddSpell is not reported); later: the learned-spells record if the reference shows the ability lasting |
| the effect ended early by the caster's own attack or cast | engine (self-cast's HYPOTHESIS) | native, and the server's self-cast ends its state; the script returns the caster then, the permit's window opening at the cast |

## Authority

Rung: R1 for where the caster ends up; R0 for the invisibility (self-cast).
- The caster's game computes the return: the mod's script records the cast
  point and moves the caster back. The server validates the move against
  the cast it recorded (spell-cast): the spell is one the server names as a
  return, the caster had it equipped, the landing is within a slack of the
  caster's position at the cast, in the same cell or worldspace, and it
  comes within the effect's duration plus the script's wait plus a slack,
  once per cast.
Why this rung and not the one above it: R0 would mean the server's VM runs
WB_Ghostwalk_Script, which is ADR-029's allowlist and the effect runtime it
pays for at its first entry (5 to 8 sessions, docs/apocalypse-options.md
5.2, B1), while the script touches nothing but its caster. The server knows
the cast point already, so R1 bounds the one state that matters to others.
What the server validates (R1): the above; a move that fails it is judged
as any other move (movement-speed's budget), and sent back if the budget
refuses it.
Rate limit / bounds: one return per recorded cast; spell-cast's bounds on
casts; the slack is wire-rules casts::RANGE_SLACK (256 units) for the
positions' age.

## Engine surface

- The spell (docs/MODS.md:147-150, apocrypha's read; HYPOTHESIS until
  lab/esm.py reads the records on the layer): SPEL 0300AAE8 (the 03 is the
  load slot in that read; the server names it as a FormDesc, local id plus
  plugin name), 10 s, its effect of the Invisibility archetype carrying
  WB_Ghostwalk_Script with WB_Wait 0.4 and WB_CheckLocation False in its
  VMAD.
- The script's calls, all in the caster's game (none on the server's VM):
  SetPosition, GetCurrentLocation, Location.HasCommonParent,
  ImageSpaceModifier.Apply, CreateDetectionEvent, RegisterForSingleUpdate,
  PlaceAtMe, AddSpell and Actor.QueueNiNodeUpdate (SKSE, a visual refresh).
- The filter that lets the script run: skyrim-platform FridaHooks.cpp
  OnSendEventEnter, the effect test (fork m2-flight 05192845, :44-70): an
  event on an ActiveEffect (VM type id, caster and target: CommonLibSSE-NG
  include/RE/A/ActiveEffect.h:31, :100, :104) whose target is the player's
  MagicTarget or whose caster is the player passes. Ghostwalk's caster and
  target are both the caster. OnUpdate passes for every script.
- The cast the server records: ActionListener::OnSpellCast records it with
  the caster's position (PartOne::StartCast) and relays it.
- The move: MovementValidation::Validate (skymp5-server
  MovementValidation.cpp) sends a player back for a move into another cell
  or worldspace, of 4096 units or more, or beyond the ground budget
  (wire-rules movement.rs: MAX_SPEED 660 units a second, BURST 2048),
  unless a permitted jump takes it: COC's (Budgets::permit_jump) and
  cast-teleport's cast jump (docs/verbs/cast-teleport.md, Server). A
  return under the budget passes as is; one past it (a sprint for 10 s
  covers more than 2048) needs the permit.
- What a neighbour sees: the figure invisible by the relayed Self cast
  (self-cast), then the return by the movement relay, a TranslateTo over
  0.2 s in the same cell (skymp5-client sync/movementApply.ts): a dash, not
  the caster's blink.

## Observe (host or acting client sees the intent before the engine acts)

- Hook point: none new. The cast reaches the server as spell-cast's
  SpellCast; the return as the caster's next movement report.
- SP filter: spell-cast's.
- Data captured: the spell, the hand, the caster's position at the cast
  (the server's own record).
- Side effects of hooking here: none new.

## Impose (observers render the server's decision)

- Mechanism: the relayed Self cast (the figure's invisibility) and the
  movement relay of the return the server took.
- Visual without simulation achieved by: the figure's TranslateTo; the
  return's sound and visual are not shown to others (Inventory, later).
- Side effects: HYPOTHESIS that the relayed cast's effect on the figure in
  an observer's game is blanked by the filter (the figure is its caster and
  target, the observer's player neither), so no observer's game runs the
  return on the figure or on its own player. x-ghostwalk-relay reads it.

## Suppress (engine's own behavior blocked on non-hosts)

- What is suppressed: the script on the figure in every other game.
- How: the filter's blank, as today for an effect between two figures; no
  new code.
- Release condition: none.
- Side effects: as Impose's HYPOTHESIS.

## Message contract

- No new message: SpellCast in, movement in and relayed, as now.
- Validator rules: unchanged.
- Idempotency / ordering: one permit per cast, consumed by its landing; a
  later cast replaces it.
- Contract doc updated: no change.

## Server

- Where the logic lives:
  - which spells return their caster: a server setting, castReturns, each
    a spell as a FormDesc with its wait (the effect's duration plus the
    script's: 10.4 s for Ghostwalk), beside castTeleports; the records
    cannot say "returns".
  - the permit: wire-rules movement's cast jump (cast-teleport's) gains a
    landing at the cast point: within RANGE_SLACK of the caster's position
    at the cast, in the cast's cell or worldspace, opening at the cast and
    closing at the wait plus CAST_JUMP_WAIT_MS, consumed by its landing.
    The window opens at the cast because the caster's own attack ends the
    effect, and the script returns the caster then.
  - the cast: ActionListener::OnSpellCast, for a named return the caster
    has equipped, records the cast as now, permits the return, and relays
    the cast (the figure's invisibility is self-cast's).
  - the check: MovementValidation's permitted-jump path, as COC's and
    cast-teleport's.
- DB fields / migration: none (a permit is runtime; a login or a restart
  starts without one).
- Restart behavior: none. HYPOTHESIS: a caster who logs out while
  invisible logs in where it stood (the script's state ends with the
  game).
- Papyrus natives touched (ledger lines added): none on the server; the
  mod's script runs in the caster's game.

## Client

- SP binding: none new; the filter's effect test (fork m2-flight).
- TS handler: none new; Apocalypse 10.2.3 in every client's mod layer and
  the server's load order (lab/tools/persist-mods.sh, Dynamic plan step 0).
- Kill switch config key: the setting itself (no castReturns, no permit).

## Tests

- T0: wire-rules movement (a return lands once within the slack of the
  cast point in its cell or worldspace; refused away from the cast point,
  in another cell, after the window, a second time; a later cast replaces
  the permit); the server (OnSpellCast of a named return permits it and
  relays the cast; an unnamed spell permits nothing).
- T1: none.
- T2: a difftest session, ghostwalk: c1 adds itself the spell (the
  console's AddSpell), equips it, casts, walks 3000 units away within the
  budget over the window, and reports the cast point: the wire stack takes
  it; the same return without a cast is sent back. Needs Apocalypse in the
  T2 server's load order.
- T3 scenario id: lab/scenarios/b-ghostwalk.yaml: c1 learns Ghostwalk,
  equips it, casts it, walks away for about 8 s; after the effect ends, c1
  is back at the cast point on the server and in its own game, and stays
  there five seconds later; during the effect c2's figure of c1 is
  invisible (the figure's Invisibility above 0) and c2 has not moved itself.
- Assertions that would fail if the verb silently regressed: c1's server
  position after the effect (at the cast point, held: fails with the
  script blanked, or with the server sending c1 back); c2's own position
  unchanged (fails if a relayed cast ran the return in c2's game).
- Parity: p-ghostwalk against the reference, its later list the
  Inventory's later rows (the return's sound, visual and detection event on
  other screens; the Eye Fix ability's record).

## Dynamic plan (fill when any tag above is still HYPOTHESIS)

- Step 0: the Apocalypse layer on the lab (a thuum branch, as Lost
  Grimoire's: persist-mods fetches 10.2.3, Nexus 1090 file 758998, md5
  26fa3eb013175c09d12b5b52d5df09ac, its ESP appended to the server's load
  order and each clone's, its two BSAs beside it; `just deploy-srv`,
  `just client-mods 711` and `712`, stacked snapshots), after a playtest
  that needs the world as it is. The records then read by lab/esm.py
  (the spell's ids, duration, the VMAD).
- Step 1, the reference: c1 alone casts Ghostwalk under the recorder,
  walks away, and is returned; the trace is lab/references/ghostwalk.json.
- Step 2, x-ghostwalk-relay on parity with the layer: c1 casts at c2's
  side and walks away; read whether the script ran in c1's game (c1
  returned), whether the server took the return or sent c1 back, whether
  c2's figure of c1 went invisible, and whether c2 moved.
- Expected: c1 returned in its own game; a short walk passes on the budget,
  a long one is sent back until the permit lands; c2 unmoved.
- Owner: agent.

## Status

- [ ] doc complete, inventory listed with a disposition per row, rung declared
- [ ] engine surface cited or delegated
- [ ] server logic + T0
- [ ] message + validator (same commit)
- [ ] native hook + T1
- [ ] TS handler
- [ ] T2 green
- [ ] T3 scenario green, no HYPOTHESIS tags
- [ ] parity scenario green, or its later list reviewed with it (ADR-031)
- [ ] ledger and suppression registry updated
