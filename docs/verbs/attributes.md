# Verb: attributes

A player's health, magicka and stamina are server state: the server sets
them, every client renders them, and they survive a server restart and the
player's next login. SkyMP lists attributes as done; m0-attributes showed the
restart half was not (run 20261001-235144). This doc tracks that fix.

## Intent

A player hurt to half health is still at half health after the server
restarts and they log back in.

Roadmap reference: SkyMP "done" column (attributes); docs/PLAN.md M1
"persistence gaps"
Milestone: M1   Class: A

## Authority

Rung: R0 for the record (the three percentages in the actor's change form);
R1 for the client's regeneration reports.
Why this rung and not the one above it: R0 is the top rung. The client's own
reports cannot be R0 because the client simulates regeneration between
server events; the server validates them instead.
What the server validates (R1) or records (R2): ChangeValues from the
client is cropped to what regeneration allows since the last update
(skymp5-server ActionListener::OnChangeValues, CropRegeneration.cpp: the
race's rate times its multiplier over the time since the last percentage
update, a window capped at 2 s and read as 1 s beyond that).
Rate limit / bounds: percentages in [0, 1]; health and magicka cropped as
above. Stamina reports are recorded unvalidated (R2, declared here per rule
5): upstream disabled CropStaminaRegeneration (commented out in
OnChangeValues, then dropped in upstream #2625), so the server takes the
client's stamina as sent. Validating it belongs to M1's validation item;
this verb only persists what the server holds.

## Engine surface

- CommonLibSSE-NG symbol(s): none new. The client reads and sets the
  player's values through Skyrim Platform's Actor.getActorValuePercentage
  and setActorValue (skymp5-client src/sync/actorvalues.ts,
  src/services/services/remoteServer.ts).
- Address Library ID(s): none.

## Observe (host or acting client sees the intent before the engine acts)

- Hook point: unchanged; skymp5-client sends ChangeValues from its own
  player's values (src/sync/actorvalues.ts).
- SP filter: n/a (own player only).
- Data captured: health, magicka and stamina percentages.
- Side effects of hooking here: none new.

## Impose (observers render the server's decision)

- Mechanism: unchanged. At login the server sends the record's percentages
  in CreateActor's props, and skymp5-client applies them to the player
  (remoteServer.ts, setActorValuePercentage); later changes travel as
  ChangeValues.
- Side effects: none new.

## Suppress (engine's own behavior blocked on non-hosts)

- Nothing; the engine regenerates and the server crops what it reports.

## The hold on a server's raise (the snap-back fix, 2026-10-20)

The finding (x-class-target2 20261018-103809 and 105815, read 2026-10-18;
docs/LAB.md): a server-set rise in a player's Health reverted within about
2 s in 7 of 11 upward sets. The client reports its percentages every 2 s
(sendInputsService.ts), a report that predates the server's raise reads as
a fall, which OnChangeValues took whole; its later report of the raised
value was then cropped to the regeneration model and sent back; a
server-applied heal snapped back the same way. Nothing recorded when the
server last set a value and the report carries no stamp.

The fix, fork m2-snapback eef10842 (the train after playtest twenty-eight;
Eli 2026-10-20: the snap-back fix STAYS in M2): the bases' rule applied to
the percentages. A value the server RAISED holds against the client's
reports until one reaches it, the same shape as actor_values.rs's hold on a
server-set base ("a report for that value is taken only once it matches
what was imposed"):

- wire-rules attributes.rs: `hold(holds, av, value, now_ms)` arms a hold
  (one per actor value, a new one replaces the old); `report(holds, av,
  reported, now_ms)` answers whether a report is taken: lapsed holds go
  first (HOLD_MS 10 s, the arrival's wait in movement.rs), no hold means
  taken, a report at or above the held value (APPLIED_WITHIN 2e-3) ends the
  hold and is taken, since the client applied it and may have regenerated
  since, a report below it is stale and dropped. Tested.
- MpActor::SetPercentages arms the hold for each value that rose (an
  owner's or the lab's set, a heal or a drink through ApplyAttributeDeltas,
  every server set passes through it); a lowered value arms nothing, since
  the regeneration crop already takes a stale higher report.
  ActionListener::OnChangeValues asks the hold per reported value before
  the crop and drops a stale report with a debug line.
- The drink's 5 s blanket drop of every report (UpdateNextRestorationTime,
  ShouldSkipRestoration, upstream's "hot fix attempt to make permanent
  restoration potions work") goes: its case is this rule's, per value.
- T0: unit/ChangeValuesTest.cpp, a raise holds against two stale reports,
  the report that carries it ends the hold, a later fall is taken, a lowered
  value is cropped and not held. T3: b-snapback (approved by Eli 2026-10-20,
  main b10fc5bf; pending until the fix stages): a seat at
  half Health set to full by the server reads full on the server and in its
  own game 4 s later, two client reports past the set.
- HYPOTHESIS until b-snapback: the client's report after applying a raise
  is at or above the value within 2e-3 (the engine's float round trip and
  its regeneration both push upward).

## Message contract

- Message name / numeric type: ChangeValues (MsgType 16, wire-schema
  ChangeValues) and CreateActor (MsgType 33, props.healthPercentage,
  magickaPercentage, staminaPercentage).
- Direction: both, unchanged.
- Contract doc updated: no change; the wire carries both since ADR-019.

## Server

- Where the logic lives: MpActor::ApplyChangeForm
  (skymp5-server/cpp/server_guest_lib/MpActor.cpp), which the server runs
  for every saved character at start (WorldState::LoadChangeForm).
- The defect: with the master files loaded, ApplyChangeForm replaced the
  record's actor values with GetBaseActorValues, whose percentages are the
  struct defaults of 1.0 (ActorValues.h). Upstream marks the block as a
  temporary workaround. Every server start therefore healed every actor.
- The fix: the game files still give the base values (health, magicka,
  stamina and the rates); the three percentages come from the record.
- DB fields / migration: none. The file driver already writes and reads
  healthPercentage, magickaPercentage and staminaPercentage
  (MpChangeForms.cpp); records saved before the fix load as saved.
- Restart behavior: the record's percentages, as saved.
- Papyrus natives touched: none.

Evidence (T2 on sky-srv, 2026-10-02, the lab's parity image): profile 9
logged in once and left; labCommand set-percentages 0.5, 0.25, 0.75 and the
record read them back; 15 s later the change form on disk held them; after
`docker compose restart` the record read 1.0, 1.0, 1.0 before any client
logged in, while the disk still held 0.5, 0.25, 0.75. This replaces the
explanation in PLAN.md's m0 status (the regeneration crop after a restart),
which the same run disproved: the record was already 1.0 before the relog,
and the crop's window is at most 2 s.

## Client

- SP binding: none new.
- TS handler: none new.
- Kill switch config key: none.

## Tests

- T0: "Attribute percentages survive a reload with the game files loaded"
  (unit/ActorTest.cpp). One world with the master files saves an actor at
  0.5, 0.25, 0.75; a fresh world loads the record the way server start does.
  Fails without the fix (reads 1.0).
- T1: n/a (no native code).
- T2: `just test-proto` sets profile 9's percentages, restarts the server
  and reads the record before any login. 2026-10-02: red on m1-wire (reads
  1, 1, 1; no fix there), green on m1-attributes (reads 0.5, 0.25, 0.75),
  with the fakeclient smoke and difftest green on both.
- T3 scenario id: lab/scenarios/m0-attributes.yaml; its restart-and-relog
  assertions are the ones that were red. Green on 2026-10-02, run
  20261002-222409, 17 of 17, on the wire with the fix: after the restart and
  relog the client read health 0.59 and magicka 0.59 (the record's 0.5 and
  0.25 plus about 13 s of regeneration), where it read 1.0 before. That run
  uses the scenario's regeneration-aware bounds (thuum 43042f9, approved
  by Eli, 2026-10-05): the old band of 0.05 around the set value failed on stamina
  at the assert's own dump in both earlier wire runs, before the restart.
- Assertions that would fail if the verb silently regressed: the record's
  and the client's health after the restart and relog (m0-attributes),
  the T2 record check, the T0 test.

## Status

- [x] doc complete, rung declared
- [x] engine surface cited (none new)
- [x] server logic + T0
- [x] T2 green (m1-attributes, 2026-10-02)
- [x] T3 scenario green, no HYPOTHESIS tags (run 20261002-222409; the
  scenario revision it ran approved by Eli, 2026-10-05)
- [x] on fork parity (875c4778, 2026-10-02)
