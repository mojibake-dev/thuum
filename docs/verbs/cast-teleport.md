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
  fire-and-forget, delivered at a target location, SPIT range 160 (the
  server does not read it: below), no projectile, no conditions; its effect MGEF 0A86DE, archetype
  43 (Spawn Scripted Ref), with explosion EXPL 0A86DD, whose placed object is
  ACTI 0A86DC (GRIM_ACT_ALT_TeleportationMarker). The records cannot say
  "teleport": other Spawn Scripted Ref spells place runes and anchors.
- The move, in the caster's game: the marker's script, on load, ghosts the
  player, waits 0.12 s, calls PlayerRef.MoveTo(self), restores the angles,
  unghosts, and disables and deletes the marker (docs/MODS.md). Nothing for
  thuum to reimplement.
- The spell's range in memory: SpellItem::Data::range (CommonLibSSE-NG
  include/RE/S/SpellItem.h:56), SpellItem::GetRange (:73, "{ return
  data.range; }"). The server does not turn it into a reach: the caster's
  game enforces the spell's own range (a cast whose line meets no ground
  within it is refused and spends nothing, x-teleport-probe
  20261012-071036), and the server's bound is the setting's reach (Server).
  The farthest landing is not measured: the lab cannot tilt the
  first-person view (Aiming, below); playtest fourteen asks how far it
  goes.
- The server's movement rule (fork parity): MovementValidation::Validate
  (skymp5-server MovementValidation.cpp:15-109) sends a player back for a
  move into another cell or worldspace, or of 4096 units or more, unless a
  permitted jump takes it, and for a move beyond the ground budget
  (wire-rules movement.rs: MAX_SPEED 660 units a second, BURST 2048) the
  same way. Permits exist for COC (wire-rules movement Budgets::permit_jump,
  Landing::Interior or Exterior, JUMP_WAIT_MS 60 s; ConsoleCommands.cpp:441-
  443). A teleport under 2048 units with a full budget passes on the budget
  alone; a longer one needs the cast's permit (Server). Measured:
  b-teleport's jump of about 550 units passes on the budget; T2's
  teleports session has a 3000-unit move taken after the cast and sent
  back without one.
- The cast the server records: ActionListener::OnSpellCast
  (ActionListener.cpp:2346-2441) checks the spell is equipped, records it
  (PartOne::StartCast with the caster's position) and relays it to every
  neighbour (SendToNeighbours).
- What a neighbour's game does with the relay: skymp5-client remoteServer.ts
  onSpellCastMessage calls Skyrim Platform's castSpellImmediate, which for a
  fire-and-forget spell launches it from the figure (MagicApi.cpp:118-151;
  a target-location spell from 200 units in front of the figure at its feet).
  If that placed the marker in the neighbour's game, the marker's script
  would move that game's player (PlayerRef), the observer. Measured by
  x-teleport-relay 20261012-083908, on a server naming no teleport (the
  cast relayed as any spell's, the marker's script let through): c2 did not
  move, and c2's game showed no cast from c1's figure (the figure's million
  magicka never fell, no cast event). A relayed Teleportation launches
  nothing in an observer's game today; where the relay stops (the server's
  send or the client's launch of a target-location spell) was not read.
  Suppress keeps the server from sending it either way.
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
  (CommonLibSSE-NG include/RE/F/FirstPersonState.h:45-50, which holds only
  offsets). The lab's look step does not tilt it either: SetAngle on the
  player keeps angle X at 0 (x-teleport-probe3 20261012-080902, its
  GetAngleX read 0; the heading it sets holds). So the lab aims level at a
  player standing in the line: x-teleport-probe4 20261012-081546 put c2
  600 units down the level strip south of the lab spawn and c1 landed 549
  units on, 52 short of c2; farther down the strip the ground falls away,
  the line passed over c2, and the game cast nothing. A cast needs the key
  held about a second and a half (probe3's 0.6 s holds cast nothing,
  probe2's 1.5 s ones did).
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
- Side effects: none measured; c2's game drew c1's figure travelling its
  554 units (x-teleport-relay's watch). Whether the dash looks right is
  playtest fourteen's (T4).

## Suppress (engine's own behavior blocked on non-hosts)

- What is suppressed: a teleport spell's cast in every game but the
  caster's: the server does not relay it (no SpellCast to neighbours for a
  spell it names as a teleport), so no neighbour's game launches it from the
  figure and runs the mod's script on its own player.
- How: ActionListener::OnSpellCast skips SendToNeighbours for a named
  teleport.
- Release condition: none.
- Side effects: observers see no cast animation before the dash (R3
  visuals, a later slice if a playtest wants it). The suppression is belt
  and braces today: x-teleport-relay found a relayed cast moved no observer
  (Engine surface); it stays for any Spawn Scripted Ref teleport a client's
  launch path would place.

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
  - its reach: the setting's, per spell: the operator's bound on a landing
    (the lab's 8000 generous; the caster's game enforces the spell's own
    range, Engine surface). Playtest fourteen's farthest cast is the number
    to set it from.
  - the permit: wire-rules movement gains a cast jump (Rust, ADR-010): a
    landing within reach plus slack (3D, from the cast's position, as
    wire-rules casts' within) in the cast's cell or worldspace, waiting 5 s
    (CAST_JUMP_WAIT_MS: x-teleport-probe4's landing reached c2's screen
    within 3 s of the cast, its key held 1.5 s of a 4.4 s watch; the
    marker's script waits 0.12 s), consumed by its landing. While it
    waits, a move that is not the landing is judged as any other (no
    loading screen to wait for, so no COC-style drop).
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

- SP binding: Lost Grimoire's marker script (GRIM_ALT_TeleportationMarker)
  is let through the Papyrus event filter (skyrim-platform FridaHooks.cpp,
  beside SkyUI's and RaceMenu's scripts; fork m2-teleport d1fb786c): a
  named exception for this verb, not docs/DECISIONS.md ADR-029's answer for
  scripted spells.
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
- T0 also: the console's AddSpell (ConsoleCommandTest: an admin's, the
  record and the game told; a moderator refused; a form that is no SPEL
  refused).
- T2: the difftest session teleports (fork m2-teleport ef3fb03c): c1 adds
  itself the spell by the console's AddSpell (which the session needs: a
  session only sends messages), equips it, moves 3000 units with no cast
  (the wire stack sends it back), casts, and lands 3000 units on (the
  permitted jump); the legacy stack refuses the spell it never learned and
  takes both moves. Ten declarations; needs Lost Grimoire in the T2
  server's load order (the layer deployed). Green 2026-10-12 01:35 on
  ef3fb03c.
- T3 scenario id: lab/scenarios/b-teleport.yaml (thuum 52d6195, awaiting
  Eli's review): c1 learns Teleportation, equips it and casts it level at
  c2 600 units down the level strip; c1 lands about 550 units on, on the
  server and in its own game, stays there five seconds later (no
  snap-back); c2 sees c1's figure there and has not moved itself.
- Assertions that would fail if the verb silently regressed: c1's server
  position after the cast (past -700 from -300, held after five seconds:
  fails with the marker's script blanked); c2's own position unchanged
  (fails if a relayed cast moved observers). The permit beyond the budget
  is T2's and T0's: the lab's level ground holds no target past 2048.

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
  On fork m2-teleport d1fb786c (the marker's script let through) with the
  lab's look step: x-teleport-probe3 20261012-080902 cast nothing (the
  look step sets no pitch, and 0.6 s holds are too short; above, Aiming);
  x-teleport-probe4 20261012-081546 aimed level at c2 on the strip: at 600
  units c1 landed 549 on, the server recording the cast and relaying none;
  at 1200 to 4500 the line passed over c2 (the strip falls away) and
  nothing was cast. x-teleport-relay 20261012-083908, on a server naming
  no teleport: c2 not moved, no cast from the figure in its game (Engine
  surface). b-teleport green twice: 20261012-082303 and 20261012-082553.

## Status

Doc written 2026-10-10, before any code. Fork branch m2-teleport (from
parity 45839102): 2658f38e the rule (wire-rules teleports reads
castTeleports; movement's cast jump, 5 s, reach plus 256; bridged; tests),
67c008e8 the server (ScampServer passes the setting, PartOne resolves a
spell's FormDesc, OnSpellCast permits the jump and relays nothing,
MovementValidation takes the landing; CastTeleportTest); 0ef4df4d parity
3f9e4bc8 merged in; 6830a2ab the console's AddSpell and the teleports
session; d1fb786c the marker script's exception in the Papyrus event
filter; ef3fb03c the session's declarations. The Lost Grimoire layer is on
thuum branch lostgrimoire (6a797a9, d738d32 castTeleports reach 8000),
deployed on the lab from 2026-10-12 00:00 and merged into main with the
verb. Also on the branch: marksman's double-arrow fix (4198fe78, confirmed
by x-double-arrow2 20261012-071438) and poison's OnEquip log (b3682b71).

- [x] doc complete, rung declared (R1)
- [x] engine surface cited or delegated (the spell's records, the
      marker's script, the event filter, the first-person pitch, the
      movement rule)
- [x] server logic + T0 (wire-rules teleports and movement's cast jump;
      OnSpellCast and MovementValidation; CastTeleportTest; the console's
      AddSpell)
- [x] message + validator (same commit): no new message
- [x] native hook + T1: no native; the marker script's exception in
      FridaHooks.cpp (no T1: it is the client's event filter)
- [x] TS handler: none new (the console routes addspell)
- [x] T2 green (ef3fb03c, ten declared divergences)
- [x] T3 scenario green, no HYPOTHESIS tags (b-teleport, thuum 52d6195,
      awaiting Eli's review, green twice); the reach from playtest
      fourteen's farthest cast and the dash's look (T4) are playtest
      fourteen's
- [x] ledger and suppression registry updated (no new native: the
      server's Actor.AddSpell snippet already stands for Papyrus
      AddSpell)

## Playtest fourteen (2026-10-12, Eli, parity ef3fb03c)

- Held: test 1 lands where it casts and stays, again right after running;
  test 2 is not moved. The server took every landing on the movement
  budget alone (no "made its cast teleport's jump" line in the log, so no
  landing went past the burst); Eli's farthest cast gave no number, so the
  setting's 8000 stands.
- Found: test 2 sees test 1's figure slide to the landing (the movement
  relay's TranslateTo), not the mod's vanish and appear (its marker script
  plays them in the caster's game only). A visual slice: the observers'
  games told to play the vanish where the caster stood and the appear
  where it lands, the figure placed at once.
- Read (2026-10-12): the relay glides every figure to its report with
  TranslateTo at the speed that covers the distance in 0.2 s
  (skymp5-client sync/movementApply.ts, translateTo), and places one only
  when it must respawn in another cell, so any jump plays as a 0.2 s
  slide. Built on fork m2-visuals 7769ec57: a figure further from its
  report than any run covers between two reports (1024 units; reports go
  every 130 ms, and Whirlwind Sprint's longest dash spread 2140 units over
  several, docs/verbs/movement-speed.md) is placed there at once; a
  shorter teleport still glides. The lab's watch now records a figure's
  largest move between two frames (maxStep), and x-snap-probe moves c1
  2000 units under c2's watch: about 2000 for the placement, a frame's
  share of 0.2 s for a glide.
- Left for its own slice: the vanish and the appear themselves. The
  marker's script plays an image space modifier and a vanish effect, then
  an appear effect and a sound, in the caster's game (docs/MODS.md); the
  observers' games are to play the same forms on their figure, told by the
  server when it takes the jump (which forms is the mod's data, read with
  lab/esm.py and the script's properties, never from memory).
