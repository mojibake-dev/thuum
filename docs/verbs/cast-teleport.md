# Verb: cast-teleport

## Intent

A player casts a teleport spell (Lost Grimoire's Teleportation, the spell on
Eli's rotfern hotkey 7) and lands where the cast landed, and the server takes
the jump instead of sending the player back.

Roadmap reference: none (Eli's stretch mods, docs/MODS.md "Lost Grimoire -
Teleportation"; docs/PLAN.md M2, the Lost Grimoire bullet under spells).
Milestone: M2 (Eli, 2026-10-10: "i guess we're rolling in lostgrimoire as
well")   Class: B

## Authority

Rung: R1. The caster's game computes the landing: the engine aims the
target-location cast and places the spell's marker where it lands, and the
mod's own script moves the player onto it (docs/MODS.md). The server
validates the jump against the cast it recorded (spell-cast,
docs/verbs/spell-cast.md): the spell is one the server names as a teleport,
the caster has it equipped, the landing lies within the spell's reach of
where the caster stood at the cast, in the same cell or worldspace, it comes
within a short wait after the cast, once per cast.
Why this rung and not the one above it: the server has no collision and no
navmesh to find where a cast meets the ground (R0 would need both); it can
bound the landing, not compute it.
What the server validates (R1): the above; a move that fails it is judged as
any other move (movement-speed's budget, docs/verbs/movement-speed.md), and
sent back if the budget refuses it.
Rate limit / bounds: one jump per recorded cast; spell-cast's own bounds on
casts; the reach plus spell-cast's slack (wire-rules casts::RANGE_SLACK, 256
units, for the two positions' age).

## Engine surface

- The spell and its effect (docs/MODS.md, apocrypha's read of
  LostGrimoire.esp 1.6): SPEL 0A86DF, Alteration, master tier, cost 135,
  fire-and-forget, delivered at a target location, SPIT range 160 (its unit
  UNKNOWN), no projectile, no conditions; its effect MGEF 0A86DE, archetype
  43 (Spawn Scripted Ref), with explosion EXPL 0A86DD, whose placed object is
  ACTI 0A86DC (GRIM_ACT_ALT_TeleportationMarker). The records cannot say
  "teleport": other Spawn Scripted Ref spells place runes and anchors.
- The move, in the caster's game: the marker's script, on load, ghosts the
  player, waits 0.12 s, calls PlayerRef.MoveTo(self), restores the angles,
  unghosts, and disables and deletes the marker (docs/MODS.md). Nothing for
  thuum to reimplement.
- The spell's range in memory: SpellItem::Data::range (CommonLibSSE-NG
  include/RE/S/SpellItem.h:56), SpellItem::GetRange (:73, "{ return
  data.range; }"). How the engine turns it into the farthest landing (its
  unit, a raycast's length) is UNKNOWN; the Dynamic plan measures the jump
  instead of reading the engine for it.
- The server's movement rule (fork parity): MovementValidation::Validate
  (skymp5-server MovementValidation.cpp:15-109) sends a player back for a
  move into another cell or worldspace, or of 4096 units or more, unless a
  permitted jump takes it, and for a move beyond the ground budget
  (wire-rules movement.rs: MAX_SPEED 660 units a second, BURST 2048) the
  same way. Permits exist for COC (wire-rules movement Budgets::permit_jump,
  Landing::Interior or Exterior, JUMP_WAIT_MS 60 s; ConsoleCommands.cpp:441-
  443). A teleport under 2048 units with a full budget passes today; a
  longer one, or one after running, is sent back. HYPOTHESIS until the probe
  measures the jump: which of the two Lost Grimoire's is.
- The cast the server records: ActionListener::OnSpellCast
  (ActionListener.cpp:2346-2441) checks the spell is equipped, records it
  (PartOne::StartCast with the caster's position) and relays it to every
  neighbour (SendToNeighbours).
- What a neighbour's game does with the relay: skymp5-client remoteServer.ts
  onSpellCastMessage calls Skyrim Platform's castSpellImmediate, which for a
  fire-and-forget spell launches it from the figure (MagicApi.cpp:118-151;
  a target-location spell from 200 units in front of the figure at its feet).
  If that places the marker in the neighbour's game, the marker's script
  moves that game's player (PlayerRef), the observer. HYPOTHESIS until the
  probe's observer is watched.
- The client's Papyrus event filter: while skymp5-client blocks Papyrus
  events, Skyrim Platform's SendEvent hook blanks every event but OnUpdate
  for a script outside its list (skyrim-platform FridaHooks.cpp
  OnSendEventEnter: SkyUI's SKI_ scripts, RaceMenu's, and
  defaultDisableHavokOnLoad). The marker's script was outside it:
  x-teleport-probe2 20261012-071906 cast Teleportation three times, the
  game spending its magicka and the server logging "cast teleport ... not
  relayed" each time, and nobody moved. The list names
  GRIM_ALT_TeleportationMarker since fork m2-teleport d1fb786c (in the
  caster's game only: no other game places the marker).
- Aiming: a target-location cast needs ground under the crosshair within
  the spell's reach, or the game refuses it and spends nothing
  (x-teleport-probe 20261012-071036: from the lab spawn, a hilltop whose
  ground falls away, the level view met the ground far beyond reach). The
  console's SetAngle X does not pitch the first-person view (it goes
  through the server's teleport; probe2's screenshots at 0 and 30 degrees
  match): the first-person camera keeps its own pitch
  (CommonLibSSE-NG include/RE/F/FirstPersonState.h:45-50). The lab aims
  with its look step (ObjectReference.SetAngle in the player's own game,
  as the marker's script restores the player's angles; UNCONFIRMED).
- What a neighbour sees of the jump: the figure moves by the relayed
  movement, a TranslateTo over 0.2 s within the same cell (skymp5-client
  sync/movementApply.ts:155-205; a respawn only for another world or cell,
  or a figure not loaded, :208-216): a dash, not a blink.

## Observe (host or acting client sees the intent before the engine acts)

- Hook point: none new. The cast reaches the server as spell-cast's
  SpellCast (skymp5-client magicSyncService.ts, Skyrim Platform's
  spellCast event); the landing as the caster's next movement report.
- SP filter: spell-cast's.
- Data captured: the spell, the hand, the caster's position at the cast
  (the server's own record of it).
- Side effects of hooking here: none new.

## Impose (observers render the server's decision)

- Mechanism: the movement relay of the move the server took (as any move).
- Visual without simulation achieved by: the figure's TranslateTo above; no
  cast animation for a teleport (Suppress).
- Side effects: HYPOTHESIS (the dash looks right; T4).

## Suppress (engine's own behavior blocked on non-hosts)

- What is suppressed: a teleport spell's cast in every game but the
  caster's: the server does not relay it (no SpellCast to neighbours for a
  spell it names as a teleport), so no neighbour's game launches it from the
  figure and runs the mod's script on its own player.
- How: ActionListener::OnSpellCast skips SendToNeighbours for a named
  teleport.
- Release condition: none.
- Side effects: observers see no cast animation before the dash (R3
  visuals, a later slice if a playtest wants it). HYPOTHESIS that the relay
  would have moved the observer (Dynamic plan, the probe's first run keeps
  the relay to see it).

## Message contract

- No new message: SpellCast in, movement in and relayed, as now.
- Validator rules: unchanged.
- Idempotency / ordering: one permit per cast, consumed by its landing; a
  later cast replaces it.
- Contract doc updated: no change.

## Server

- Where the logic lives:
  - which spells teleport: a server setting, castTeleports, each a spell as
    a FormDesc ("0a86df:LostGrimoire.esp", load-order independent), read
    where the server reads its other settings; the records cannot say it.
  - its reach: the spell's record (SPIT range) in game units once the probe
    confirms the unit, else the setting's reach for that spell (HYPOTHESIS:
    the unit).
  - the permit: wire-rules movement gains a cast jump (Rust, ADR-010): a
    landing within reach plus slack (3D, from the cast's position, as
    wire-rules casts' within) in the cast's cell or worldspace, waiting a few
    seconds (HYPOTHESIS: the wait, from the cast to the landing's report,
    measured), consumed by its landing. While it waits, a move that is not
    the landing is judged as any other (no loading screen to wait for, so
    no COC-style drop).
  - the cast: ActionListener::OnSpellCast, for a named teleport the caster
    has equipped, records the cast as now, permits the jump, and relays
    nothing.
  - the check: MovementValidation's permitted-jump path, as COC's. The
    permit is used only when the bounds or the budget refuse a move, so a
    landing the budget takes leaves the permit until its wait ends; a
    second move in that wait is still held to the spell's reach of the
    cast, which bounds both (R1).
- DB fields / migration: none (a permit is runtime; a login or a restart
  starts without one).
- Restart behavior: none.
- Papyrus natives touched (ledger lines added): none on the server; the
  mod's script runs in the caster's game only.

## Client

- SP binding: none new.
- TS handler: none new; Lost Grimoire 1.6 in every client's mod layer and
  the server's load order (lab/tools/persist-mods.sh, thuum branch
  lostgrimoire 6a797a9, deployed with client-mods and a snapshot).
- Kill switch config key: the setting itself (no castTeleports, no permit).

## Tests

- T0: wire-rules movement (a cast jump lands once within reach of the cast
  in its cell or worldspace; refused beyond reach and slack, in another
  cell, after the wait, a second time; a later cast replaces the permit);
  the server (OnSpellCast of a named teleport permits the jump and relays
  nothing; an unnamed spell neither permits nor stops the relay;
  MovementValidation takes the landing and sends back a jump without a
  cast).
- T1: none.
- T2: a difftest session: c1 casts the teleport (SpellCast, the spell
  equipped by the console's player.equipspell or the server's learn-spell)
  and moves 3000 units along its aim: the legacy server takes the move as
  any under 4096 and relays the cast to c2; the fixed server takes it as
  the permitted jump and relays nothing; without a cast, the fixed server
  sends the same move back. Declared. Needs Lost Grimoire in the T2
  server's load order (the layer deployed).
- T3 scenario id: lab/scenarios/b-teleport.yaml: c1 learns Teleportation
  (learn-spell), equips it and casts it along the lab's strip; c1 lands
  where it aimed, on the server and in its own game, and stays there five
  seconds later (no snap-back); c2 sees c1's figure there and has not moved
  itself.
- Assertions that would fail if the verb silently regressed: c1's server
  position after the cast (moved by more than half the measured reach, held
  after five seconds); c2's own position unchanged.

## Dynamic plan (fill when any tag above is still HYPOTHESIS)

- Step 0: the Lost Grimoire layer on the lab (thuum branch lostgrimoire:
  `just persist-mods`, `just deploy-srv`, `just client-mods 711` and `712`,
  stacked snapshots), after playtest thirteen, which needs the world as it
  is.
- x-teleport-probe, on parity with the layer: c1 learns Teleportation
  (learn-spell, LostGrimoire.esp at full slot 0B on 1.6.1170, so 0x0B0A86DF)
  and equips it; c1 faces down the slope from the spawn and casts, under the
  watch (its own position per frame, its casts); c2 watches c1's figure and
  its own position; then c1 runs for two seconds and casts again (a spent
  budget). Read: the jump's length (the reach and the SPIT range's unit),
  the time from the server's cast to the landing's report (the permit's
  wait), whether the server sends c1 back (E_MOVE_SPEED in the server log),
  and whether c2's game, given the relayed cast, moved c2.
- Expected: a jump of some hundreds to a few thousand units, landing within
  a second of the cast; c1 sent back when the budget refuses it; c2 moved by
  the relay (the hazard Suppress names) or not (then the suppression is
  belt and braces, kept for any Spawn Scripted Ref teleport).
- Owner: agent.
- Measured 2026-10-12 (fork m2-teleport 0ef4df4d, the layer on the lab):
  x-teleport-probe 20261012-071036 cast nothing (above, Aiming);
  x-teleport-probe2 20261012-071906, on level ground at the hunters' camp
  facing a tent: three casts spent magicka (936 of 1000 read a few
  seconds after each, regeneration included, so the cost the engine
  computes at Alteration 15 stays unmeasured), the server recorded each
  and relayed none, and c1 never
  moved: the marker's script was blanked (above, the event filter).
  x-teleport-relay (a server naming no teleport, the cast relayed) waits
  for the fixed client, since a blanked marker moves nobody in any game.

## Status

Doc written 2026-10-10, before any code. The Lost Grimoire layer is on thuum
branch lostgrimoire (6a797a9), held until after playtest thirteen. Fork
branch m2-teleport (from parity 45839102): 2658f38e the rule (wire-rules
teleports reads castTeleports; movement's cast jump, 5 s, reach plus 256;
bridged; tests), 67c008e8 the server (ScampServer passes the setting,
PartOne resolves a spell's FormDesc, OnSpellCast permits the jump and relays
nothing, MovementValidation takes the landing; CastTeleportTest). CI green
(fork pipeline 1203); T2 green on the existing sessions (2026-10-10 19:53;
the setting is empty there, so nothing changes). Left: the layer on the lab,
x-teleport-probe (the reach and the wait), the setting's reach, the T2
session, b-teleport.

- [ ] doc complete, rung declared
- [ ] engine surface cited or delegated
- [ ] server logic + T0
- [ ] message + validator (same commit)
- [ ] native hook + T1
- [ ] TS handler
- [ ] T2 green
- [ ] T3 scenario green, no HYPOTHESIS tags
- [ ] ledger and suppression registry updated
