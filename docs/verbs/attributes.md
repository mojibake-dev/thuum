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
- T3 scenario id: lab/scenarios/m0-attributes.yaml, unchanged; its
  restart-and-relog assertions are the ones that were red.
- Assertions that would fail if the verb silently regressed: the record's
  and the client's health after the restart and relog (m0-attributes),
  the T2 record check, the T0 test.

## Status

- [x] doc complete, rung declared
- [x] engine surface cited (none new)
- [x] server logic + T0
- [x] T2 green (m1-attributes, 2026-10-02)
- [ ] T3 scenario green, no HYPOTHESIS tags
