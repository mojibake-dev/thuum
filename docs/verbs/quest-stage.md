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

- Message name / numeric type: QuestStage, MsgType 57, wire id 65 (wire-schema skymp.rs, SCHEMA_VERSION 19).
- Direction: both. C2S: the seat's report. S2C: the relay to the other seats and the login replay.
- Fields: quest (u32, the QUST form id in the shared load order; a long form id where the server's convention needs
  one, as PlayerGlobals carries its ids), stage (u16, the engine's stage index).
- Validator rules: structural (wire-validate check_quest_stage): a quest of 0 only with a list, the list naming each
  quest once and never 0; from a client no list and a quest named, under a budget of 16 then 4 a second
  (quest_stage_budget, UNMEASURED). Semantic (wire-rules quest_stages, through the bridge): the quest on the server's
  `sharedQuests` list (E_QUEST_UNLISTED); the handler's own: a QUST in the load order (E_QUEST_UNKNOWN). A stage
  already recorded is a no-op at debug, never a relay.
- Idempotency / ordering: a stage already recorded is a no-op; the replay is ascending per quest; the relay is
  reliable and ordered.
- Contract doc updated: docs/WIRE.md's QuestStage paragraph; fixtures 57-QuestStage-0 and -1 (wire-json); the C++
  struct QuestStageMessage.h round-trips them (WireJsonContractTest).

## Server

- Where the logic lives: ActionListener::OnQuestStage (the refusals, the record, the relay to every connected user
  with an actor but the sender) and ActionListener::SendQuestStages (the list message, then one message per recorded
  stage, ascending per quest), called from PartOne::SetUserActor right after SendPlayerGlobals. The rule: wire-rules
  quest_stages.rs (the list from `sharedQuests`, check, at_login, done, merge) through wire-bridge's SharedQuests.
- DB fields / migration: the world's journal reference, a server-made XMarker (STAT 0x3b) at a far corner of Tamriel
  (WRLD 0x3c) with the fixed form id 0xffffff00 (PartOne::WorldJournal, above GenerateFormId's walk), whose change form
  carries the new optional field `questStages` ({"entries": [{"quest": "<hex>:<plugin>", "stage": N}]}, absent in
  older records, read as none; MpChangeForms.h, QuestStageDone.h). No script: the optional field is the migration
  (rule 6's shape, ADR-043's form version unchanged).
- Restart behavior: WorldState::LoadChangeForm recreates any 0xff... reference from its change form, the journal
  included; a login after a restart replays the record (QuestStageTest's restart case; b-quest-stage-restart at T3).
- Settings: `sharedQuests` in server-settings.json (lab/deploy/sky-srv, both load orders): FreeformRiverwood01
  (A Lovely Letter, 0x74a83), MS13, MS13Intro, MS13FIN (The Golden Claw, 0x39645, 0xb6031, 0x3dd29), read from
  Skyrim.esm with lab/esm.py on 2026-10-28.
- Papyrus natives touched (ledger lines added): none in the first slice (the server VM's Quest class, if any, is
  untouched).

## Client

- SP binding: none new (the platform's `questStage` event and `Quest` natives).
- TS handler: services/services/questStageService.ts (the report on the platform's `questStage` event for listed
  quests, one applied stage per update through Quest.setCurrentStageID with the engine's echo consumed, the list from
  the server's login message kept in the platform's storage across a reload); the message plumbing in messages.ts,
  questStageMessage.ts, anyMessage.ts, events.ts, networkingService.ts.
- Kill switch config key: `questStage` (default on) in the client settings; the server's `sharedQuests` list empty
  means nothing is shared.

## Tests

- T0: QuestStageTest (the record per world; the relay to the other user and not the reporter; the no-op on a repeated
  stage; the refusals: unknown, unlisted, rate; the replay at login after PlayerGlobals; the restart: a second
  PartOne over the same save sees the stages).
- T1: none (no native hook).
- T2: difftest/sessions/quest-stage.yaml (c1's stage 10 of FreeformRiverwood01 recorded and relayed to c2, the same
  again a no-op, MQ102's refused as unlisted) and the login list in divergences.yaml.
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
- [x] server logic + T0 (QuestStageTest: record, relay, no-op, refusals, replay, restart; CI's T0 pending)
- [x] message + validator (same commit)
- [x] native hook + T1 (none needed)
- [x] TS handler
- [ ] T2 green
- [ ] T3 scenario green, no HYPOTHESIS tags
- [ ] parity scenario green, or its later list reviewed with it (ADR-031)
- [ ] sequences and combinations green, every checklist item with its scenario (ADR-033)
- [ ] ledger and suppression registry updated

## Reviewer checklist

See docs/VERB.md.

## The Story Manager's quests (read 23:22 PDT 2026-10-28, playtest 37's 3i lay)

The live set-stage with start: true on A Lovely Letter 0x74a83 answered started false and left both seats at stage 0
(finding 57). The record says why (lab/esm.py; CTDA layout per CommonLibSSE-NG TESCondition.h:897-947): the quest's
Story Manager condition set reads function 576 GetEventData (TESCondition.h:708) against LCTN RiverwoodLocation
0x13163 on the Change Location event, its Location alias fills from that event (ALFE CLOC) under function 359
GetInCurrentLoc, and the quest's event is CLOC (ENAM), so the Creation Kit's rule applies: a quest that specifies an
event can only be started by the Story Manager, never by Start or SetStage (the chain in the game files: SMEN 0x1320e
CLOC, SMBN 0x9002a FreeformQuestsNode conditioned on the new location having LocTypeHabitation, SMQN 0xb555d
FreeformRiverwoodNode, the quest first in its branch; no lab plugin overrides them). Nothing in the client blocks the
Story Manager (the Papyrus event block is the VM's alone; the platform emits locationChanged and questStart and nobody
subscribes); whether a login or a teleport INTO Riverwood ever raises the Change Location event, as a walk into the
location does in single player, is the open HYPOTHESIS (H-56a). Consequences: a world stage of a quest the engine has
not started is parked by the client and applied when the engine's questStart for that quest fires (fork m3-quest-stage,
no wire change); the probe x-quest-stage keys on MS13Intro 0xb6031 (no event, unique-actor aliases Lucan and Camilla,
stage 10), already in lab/deploy's sharedQuests; Sven's Faendal line on both seats waits for the Story Manager to start
A Lovely Letter on each. RESULT (14:03 PDT 2026-10-29, x-story-manager-walk 20261029-205447 at 3o's stage; the probe's own claim was framed wrong, the
read is the console's): H-56a ANSWERED. c1's placement from lab-spawn into Riverwood's landing logged "locationChanged actor 14
old none new 13163" at 20:56:22.186Z and, in the same millisecond, "questStart quest 74a83": a placement INTO the location raises
the Change Location event and the Story Manager starts A Lovely Letter at once, on a lab seat, with no help. The second placement,
to x 16000 in RiverwoodEdge01 0x9733, logged no change (that square is inside RiverwoodLocation too), so the walk half read
nothing new. Why the playtests never saw it: every playtest seat LOGS IN inside the location (the camp is the landing), and a
login sets the player's location without a change, so the Story Manager hears nothing until the player leaves the location and
returns. Fix shape (HYPOTHESIS, the owed RE): at login, when the player's location has no change to report, the client raises
the engine's own Change Location event once (BGSStoryEventManager::AddEvent, the Dynamic plan's lead, Address Library 32359 to
resolve by `just addr`, the CLOC event's struct to read) from none to the current location, so each seat's Story Manager starts
what an arrival starts; the stage relay then keeps the seats together. Until then the lab's probes place a seat outside and
back in. The original Dynamic plan (runnable since 2026-10-29: the lab-driver logs the player's locationChanged with the old and new
location ids and every questStart and questStop through the console tee, so log-count reads them, no step added;
the probe x-story-manager-walk by path places c1 at Riverwood's landing, then at x 16000 in RiverwoodEdge01 0x9733 and
runs it east across the cell line into 0x9732 under hold-key W, reading the lines and 0x74a83's running state after
each half; it plays at the first stage after the driver's lay): a seat walks from outside the location into
Riverwood (the Guardian Stones leg and the Riverwood Trader exit are a later version); expected newLoc 0x13163 then questStart 0x74a83; a location
event without the start points at the SM nodes (a Frida read of BGSStoryEventManager::AddEvent, Address Library
32359, and BGSStoryTeller 32485 by just addr), no location event at the player's location tracking after a placement.
