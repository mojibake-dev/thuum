# Verb: quest-stage

## Intent

A quest stage set in one player's game (a dialogue fragment, a script, the console in the lab) becomes the world's,
so every seat's topics, conditions and journal read the same quest state (ADR-056, memo D55 B; TES3MP's shared
journal).

Roadmap reference: skymp/ROADMAP.md "Quests" ("Learn how to serialize / deserialize the quest state of the game, or
just draw the right words in the interface"); docs/PLAN.md M6's dialogue consequences, pulled forward by Eli
(2026-10-28: "makes sense to start now as part of the dialogue work").
Milestone: M3 (under npc-talk)   Class: A

## Inventory (ADR-031: the action's consequences, before its rung)

The action is the engine's SetStage on one seat. What the engine plays for it, from the records (QUST: the stages
INDX, each stage's log entries and their CTDA, the QF script's fragments bound by VMAD; the journal's objectives
QOBJ) and the Papyrus reference (Quest.SetStage starts a stopped quest, marks the stage done, runs its fragments and
shows its log entry):

| consequence | seen in | disposition |
| --- | --- | --- |
| the stage marked done (GetStage, GetStageDone) and the quest running | record (QUST INDX) | imposed: the server's record applied by the engine's own SetStage on every seat (R0 record, R1 feed) |
| the stage's log entry in the journal and its "Quest updated" message | record (QUST, the stage's CNAM) | native on every applying seat: the engine writes its own journal from the applied stage (one world journal, the stub) |
| the QF fragment of the stage (items given, gold, references enabled, actors moved, scenes started, globals set) | record (VMAD QF script) | native on the talker; duplicated on every applying seat until the server performs world effects from a fragment-kind table; items and gold self-correct at the next SetInventory (R0 inventory). KNOWN LIMIT of the first slice |
| objectives displayed or completed (SetObjectiveDisplayed in fragments) | record (QOBJ, the fragments) | later: objectives are per seat, follow the fragments' run on that seat (R2 recorded, a later slice) |
| topics and lines whose conditions read GetStage or GetStageDone (Sven's Faendal line) | record (INFO CTDA) | native: the engine offers them from the applied stage; this is the verb's purpose |
| quest aliases filled at the start (a stage starting a stopped quest fills its aliases on that seat) | record (QUST aliases) | native per seat; a reference alias may point at a different actor per seat (a known limit, read by the probe) |
| quest globals written by fragments | record (GLOB) | later: player-globals' world-shared R1 (ADR-029's note) |

The parity scenario (lab/scenarios/p-quest-stage.yaml) waits for the recorder's quest read; the Sequences table below
is the first slice's evidence.

### Sequences and combinations (ADR-033)

| sequence or combination | probe or scenario | result |
| --- | --- | --- |
| two stages of one quest set within a second on the talker (the fragment's chain) | x-quest-stage | pending |
| the same stage set on both seats at once (both talk to the same NPC) | x-quest-stage | pending (one record, two no-op reports) |
| a stage set while the other seat is in another cell, then both meet | x-quest-stage | pending |
| a stage set, the server restarted, a login | b-quest-stage-restart | pending |
| an unlisted quest's stage | x-quest-stage | pending (refused in the log, the seat keeps its own) |
| a stage lower than the quest's current one (SetStage out of order) | x-quest-stage | pending (recorded as done, GetStage unchanged on the applying seat) |

## Authority

Rung: R1 for the feed (a player's own game reports its stage change; the server validates the quest, the list, the
stage and the rate), R0 for the record and its relay (the server's word is the world's quest state; the seats apply
it through the engine).
Why this rung and not the one above it: R0 alone would mean the server runs the quest scripts itself (the papyrus-vm
with the QF fragments and their conditions), which it cannot for the dialogue-driven stages a seat's engine decides
inside its own conversation; the seat is the only place the fragment runs, so the seat reports and the server
validates what it can (the quest, the stage index, the list, the rate), the same shape as player-globals.
What the server validates (R1): the quest is a QUST in the server's load order; the quest is on `sharedQuests`
(ADR-056 decision 5); the stage is within the engine's u16 stage index; one report per quest per 50 ms per player;
the reporter is a logged-in player. What it records (R0): per quest the set of stages done, world-wide.
Rate limit / bounds: 50 ms per quest per player; a report of a stage already done is a no-op (no error, no relay).

## Engine surface

- Quest.SetStage, GetStage, GetStageDone, IsRunning: Papyrus natives on the client, through Skyrim Platform's Quest
  class (skyrim-platform codegen convert-files/skyrimPlatform.ts, `Quest.setStage(stage)`, `getStage()`,
  `getStageDone(stage)`); the engine starts a stopped quest at SetStage (Papyrus reference).
- The stage change event: Skyrim Platform's `questStage` event (SKSE's TESQuestStageEvent; fields `quest` and `stage`)
  fires on every seat for every quest's stage change, our own applies included: the loop guard consumes those.
- The server: libespm reads QUST records (Records.h: the record type is listed; whether INDX stages are parsed is
  read at the implementation, else the stage check is the u16 bound alone, HYPOTHESIS tagged there).
- CommonLibSSE-NG symbols: none needed (no native hook; the event and the natives are the platform's).
- Address Library ID(s): none.

## Observe (host or acting client sees the intent before the engine acts)

- Hook point: the platform's `questStage` event on the seat whose engine set the stage (after the engine acted; the
  report is of a fact, not an intent).
- SP filter: none needed (one event per stage change; the service filters by the shared list it receives at login).
- Data captured: the quest's form id, the stage index.
- Side effects of hooking here: none (an event subscription). CONFIRMED by the platform's events list; the event's
  firing for a console setstage in the lab: HYPOTHESIS until x-quest-stage.

## Impose (observers render the server's decision)

- Mechanism: `Quest.setStage(stage)` on each seat the server relays to, for each stage not done there.
- Visual without simulation achieved by: the engine's own journal and conditions follow the applied stage; the
  fragment runs on the applying seat (the known limit above).
- Side effects: HYPOTHESIS: a SetStage replayed at login on a quest whose start fragment moves the player or starts
  a scene behaves as on the talker (why the list holds Riverwood's quests only in the first slice).

## Suppress (engine's own behavior blocked on non-hosts)

- What is suppressed: nothing of the engine's; the report of our own applies (the loop guard) is the service's.
- How: a set of (quest, stage) pairs the service is applying, consumed by the `questStage` handler.
- Release condition: per pair, at its event or after 2 s.
- Side effects: none.

## Message contract

- Message name / numeric type: QuestStage, the next free MsgType (filled at the implementation commit).
- Direction: both. C2S: the seat's report. S2C: the relay to the other seats and the login replay.
- Fields: quest (u32, the QUST form id in the shared load order; a long form id where the server's convention needs
  one, as PlayerGlobals carries its ids), stage (u16, the engine's stage index).
- Validator rules (wire-rules): quest nonzero; stage within u16; on the server's side the quest is a QUST and on the
  list, the rate per quest per player 50 ms; refusals E_QUEST_UNKNOWN (not a QUST), E_QUEST_UNLISTED, E_QUEST_RATE.
- Idempotency / ordering: a stage already recorded is a no-op; the replay is ascending per quest; the relay is
  reliable and ordered.
- Contract doc updated: in the implementation commit (docs/WIRE.md's row and the fixture pair).

## Server

- Where the logic lives: the handler beside OnPlayerGlobals (ActionListener), the record on the world (the shape the
  code map names: the world's change form or the server's own record), the relay to every other user, the replay in
  the login path after PlayerGlobals.
- DB fields / migration: a new field on the world record (the migration note in the commit; rule 6).
- Restart behavior: the record is loaded with the world; a login after a restart replays it (b-quest-stage-restart).
- Papyrus natives touched (ledger lines added): none in the first slice (the server VM's Quest class, if any, is
  untouched).

## Client

- SP binding: none new (the platform's `questStage` event and `Quest` natives).
- TS handler: questStageService (the report on `questStage` for listed quests, the apply on the message with the
  guard, the list from the server at login).
- Kill switch config key: `questStage` (default on) in the client settings; the server's `sharedQuests` list empty
  means nothing is shared.

## Tests

- T0: QuestStageTest (the record per world; the relay to the other user and not the reporter; the no-op on a repeated
  stage; the refusals: unknown, unlisted, rate; the replay at login after PlayerGlobals; the restart: a second
  PartOne over the same save sees the stages).
- T1: none (no native hook).
- T2: a difftest session with one accepted report, one refused, and the replay at a second login.
- T3 scenario id: lab/scenarios/b-quest-stage.yaml (after lab-api's quest-stage read: `c.quest(id).stage()` and
  `.stageDone(n)`), b-quest-stage-restart.yaml.
- Assertions that would fail if the verb silently regressed: c2's GetStage of the listed quest equals c1's within the
  relay's lag after c1's setstage; the server log holds the record line and no refusal; after the restart and a login,
  GetStage on a fresh seat equals the record.

## Dynamic plan (fill when any tag above is still HYPOTHESIS)

- Frida script: none; the HYPOTHESIS tags here are behavioural (the console setstage's event, the replay's fragment
  effects) and the probe reads them.
- Breakpoint plan: none.
- Owner: agent (the probe).

## Status

- [x] doc complete, inventory listed with a disposition per row, rung declared
- [x] engine surface cited or delegated (the platform's event and natives; no engine hook)
- [ ] server logic + T0
- [ ] message + validator (same commit)
- [x] native hook + T1 (none needed)
- [ ] TS handler
- [ ] T2 green
- [ ] T3 scenario green, no HYPOTHESIS tags
- [ ] parity scenario green, or its later list reviewed with it (ADR-031)
- [ ] sequences and combinations green, every checklist item with its scenario (ADR-033)
- [ ] ledger and suppression registry updated

## Reviewer checklist

See docs/VERB.md.
