# Verb: movement speed bounds

The sixth item of M1's validation work (docs/verbs/validation.md, Movement):
the server holds a player to the speeds the game's movement allows. SkyMP
bounded a move only per message (a change of cell or worldspace, or 4096
units at once), so a client could cover up to 4095 units every 130 ms
update, about 31000 units a second, and be relayed to everyone.

## Intent

A player crosses the world no faster than a horse can, and a lag spike, a
dash or a knockback does not send anyone back.

Roadmap reference: docs/PLAN.md M1 "Validation: ... movement speed bounds"
Milestone: M1   Class: A

## Authority

Rung: R1 (the host moves its own player; the server validates each move
before recording and relaying it).
Why this rung and not the one above it: movement is simulated by the
player's own engine (input, animation, physics); the server cannot simulate
it, only bound it.
What the server validates: each UpdateMovement of the sender's own actor
spends its horizontal distance from the server's record out of a budget
that refills at 660 units a second and holds 2048. A move the budget cannot
cover is refused and the sender snapped back to the record (Teleport2),
exactly as the existing per-message check does. Height is free (falls are
the engine's). Hosted NPCs are not charged (their movement types are their
own records'; NPC hosting is M3). A teleport the server makes is not a
move: the rule waits for the player's arrival where the server put it
(Server, arrivals).
Rate limit / bounds: the budget above; the per-message bounds stand.

## Engine surface

- Movement types (MOVT SPED, forward run, read with lab/esm.py from the
  lab's masters, 2026-10-03): NPC_Default_MT 370, NPC_Sprinting_MT 500,
  WerewolfBeastSprint_MT 531, Horse_Sprint_MT 600 (Skyrim.esm),
  VampireLordSprint_MT 600 (Dawnguard.esm). 600 is the fastest a player
  moves; the refill is 600 plus a tenth. Creatures run faster (deer 833,
  Dawnguard's ChaurusFlyer 725, Dragonborn's scribs 802), and the dragon a
  Dragonborn player rides flies at 7400 (Dragon_Flying_MT): not a player's
  movement in SkyMP today, which syncs no dragons. Revisit with mounts.
- SpeedMult (100 by default) scales the type's speed; no vanilla item or
  perk raises it. The console's setav does, which is the cheat the T3
  scenario's negative control stands for (here as a glide).
- skymp5-client sends UpdateMovement every 130 ms
  (src/services/services/sendInputsService.ts, sendMovementRateMs).
- Not measured: Whirlwind Sprint's dash and Unrelenting Force's knockback.
  The 2048 burst is meant to cover them; if either goes farther, that is a
  snap-back at the end of the dash. HYPOTHESIS until a lab run shouts:
  with M2's shouts (docs/PLAN.md, spells and shouts).

Measured (run 20261003-093145, the speed probe on the level strip south of
lab-spawn): a 1 s hold of W moved c1 251 units on the server's record, a
0.9 s hold of Left Alt and W 262 (whether Alt sprinted is not settled).

## Observe, impose, suppress

- Observe: unchanged; the player's own UpdateMovement.
- Impose: a refused move is not recorded or relayed, and the sender gets
  Teleport2 back to the server's record (the existing snap-back). After a
  teleport the server made, a report from anywhere but the arrival is
  dropped without the snap-back (the teleport itself is on its way).
- Suppress: the relay of a refused move to the neighbours.

## Message contract

- UpdateMovement (MsgType 2), Teleport2 (31): unchanged.

## Server

- Where the logic lives: MovementBudget (server_guest_lib/MovementBudget.h)
  and MovementValidation::Validate (fork 8b991392, on parity 8266a21c). The rule itself moved to Rust on 2026-10-03 (skymp-wire wire-rules, ADR-020; fork f0045206): the C++ handler gathers the facts and asks. The budgets are Rust state; MovementBudget.h is gone. The budget is
  runtime state on MpActor (not persisted; a fresh one after a restart or
  login starts full). A refusal logs E_MOVE_SPEED with the actor and the
  distance.
- Cost to a cheater: at 1500 units a second the budget runs out in about
  2.4 s and every move after it snaps back; a single teleport of up to
  2048 units every three seconds passes.
- Arrivals (fork d99a01fb, Eli's playtest twelve: MoveTo moved a player
  "a little" or not at all): a teleport the server makes (MpActor::Teleport:
  the console's MoveTo, SetPos and `mp tp`, the gamemode's, the lab's) sets
  the actor's teleport flag. The player's next report has the rule expect
  the arrival where the server put it (wire-rules movement
  `expect_arrival`, `check_arrival`: in that cell or worldspace, within
  ARRIVAL_RADIUS, 256 units, of its x and y, for ARRIVAL_WAIT_MS, ten
  seconds; the last teleport counts). MovementValidation asks before its
  bounds: the arrival passes, once; a report from anywhere else while the
  rule waits was sent before the move and is dropped, neither recorded,
  relayed nor sent back. Upstream judged the first report after a teleport
  at infinity (refused, the player sent to the record) and the second as
  a move: within the budget it took the record back to where the player
  had stood, and the arrival then spent the budget a second time, refused
  and sent back there. So a teleport the budget covers once but not twice
  failed: by the budget's numbers about 1100 to 2048 units within one cell
  or worldspace, measured at 1237 (Tests). A farther one, or one into
  another cell, had its stale report refused by the bounds, which sent the
  player to the record and so completed the move. A hosted actor (an NPC) keeps upstream's
  handling. A teleport the moved game drops (Skyrim Platform's settle
  after a login, docs/LAB.md) is not sent again by the rule: after ten
  seconds the wait lapses and the bounds judge the next report, a far one
  sent back to the record (which completes the move), a near one taken.
- DB fields / migration: none.

## Tests

- T0: "The movement budget holds a burst and refills at the top speed" and
  "A horse's sprint fits the movement budget, a speed hack does not"
  (unit/MovementBudgetTest.cpp, an explicit clock); "A player beyond its
  ground speed budget is sent back" (unit/MovementValidationTest.cpp: two
  1000 unit moves at once fit, the third gets Teleport2, another user's
  actor is not charged).
- T0 green in pipeline 608 (254 test cases).
- T2: difftest session movement-speed: five 800 unit moves 50 ms apart; the
  legacy server relays all five, the fixed one two and snaps three back. On
  the legacy server c1 also reaches 4000 units north, so nineteen forms near
  the spawn leave its view and three enter it; all declared. Green on
  m1-speed, 2026-10-03, with the five other sessions.
- T3: lab/scenarios/a-movement-speed.yaml (approved by Eli, 2026-10-05): a real
  1.5 s run is taken; a glide of 6000 units at 3000 units a second is held
  where the budget runs out. Red on parity at the glide (run
  20261003-094307: the 6000 units stood), green on m1-speed (run
  20261003-100454: held at y 1955, about 2500 units into the glide, four
  E_MOVE_SPEED refusals of 731 to 2804 units).
- Arrivals. T0: "A teleport the server makes is not undone by the reports
  sent before it" (unit/ConsoleCommandTest.cpp: an 800 unit teleport, two
  reports from before it dropped without a snap-back, the arrival and the
  moves after it taken) and wire-rules movement (a report elsewhere, in
  another cell or not a number waits; the arrival within its radius lands
  once; another actor is not held; the wait lapses after ten seconds; the
  last teleport counts); green in fork pipeline 1088 (89db8732). T3, x-arrival-probe (scratchpad, run by path): c2 1237
  units from c1 down the spawn's mountain, c1 types `player.moveto` on
  c2's figure four times, the lab taking it back between. On the server
  just before the rule (fork 274c2acd, run 20261009-064748) the first held
  and the other three were sent back to where c1 stood, on the server and
  in its game, each with one E_MOVE_SPEED of 1264 units, and the lab's
  first teleport back took three attempts (two E_MOVE_SPEED of 1211). With
  the rule (89db8732, run 20261009-065137) all four held, 25 to 55 units
  from c2 ten seconds later on both sides, every lab teleport landed at
  its first attempt, and the server refused nothing. a-console carries two
  of these MoveTo rounds (docs/verbs/console-commands.md).

## Status

- [x] movement types read from the masters; client cadence sourced
- [x] server logic + T0
- [x] T2 green
- [x] T3 scenario green on the fix, red without it (the scenario
  approved by Eli, 2026-10-05); still HYPOTHESIS: that Whirlwind Sprint and knockbacks fit
  the 2048 burst (no shout in the lab yet; measured with M2's shouts)
- [x] on fork parity (8266a21c, 2026-10-03)
- [x] arrivals after a server teleport (fork m1-console d99a01fb, Eli's
  playtest twelve): T0 green; x-arrival-probe's MoveTo sent back three
  times of four before the rule, held four of four with it; a-console's
  MoveTo rounds green twice (20261009-065601, 20261009-070154; scenario
  commit 55e2f42, approved by Eli 2026-10-09)
- [x] arrivals on fork parity 89db8732 (2026-10-09), after the m1-console
  merge sweep (docs/verbs/console-commands.md, Status); a-movement-speed's
  held run in it covered 411 units (20261009-072747)
