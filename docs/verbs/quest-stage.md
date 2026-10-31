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
- The server: libespm reads QUST records (Records.h: the record type is listed); INDX stages are not parsed
  (read at the implementation 2026-10-29: wire-validate's check_quest_stage bounds the mode and the shared list,
  and the stage is the wire type's u16), so a stage number the quest does not define is the engine's to refuse on
  each seat, a known limit.
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

- Message name / numeric type: QuestStage, MsgType 57, wire id 65 (wire-schema skymp.rs, SCHEMA_VERSION 19 at first; 21 with
  the mode byte, fork m3-quest-mode 11cbf4cb, 2026-10-29).
- Direction: both. C2S: the seat's report. S2C: the relay to the other seats and the login replay.
- Fields: quest (u32, the QUST form id in the shared load order; a long form id where the server's convention needs
  one, as PlayerGlobals carries its ids), stage (u16, the engine's stage index).
- mode (u8, D58 B, m3-quest-mode): 0 list, 1 all; set by the server on the login message, whose `shared` carries the
  shared quests in mode 0 and the DENIED quests in mode 1; a client's message with mode != 0 is refused (Range).
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
- Settings since D58 B (14:49 PDT 2026-10-29, fork m3-quest-mode fc17612d): `sharedQuests` stays the curated array above (mode
  list); the mode lives under its OWN key `sharedQuestsMode`: `{"mode": "all", "denied": [...]}` (every quest a seat starts is the
  world's unless denied; the Rust parser is strict: unknown fields, a duplicate, a non-list `denied` are named errors; the mode key
  wins when both are present). The key is its own so an older image, which reads only `sharedQuests`, ignores it and starts from the
  same deploy file (numidium's shape: a fallback restage, turbo-back, the nightly's clean image and the layer's stage all deploy
  from main). The lab's block is in both deploy files on thuum main since 47c8103: mode all, denied the main quest's intro chain and
  the DLC starts, read from the masters with lab/esm.py on 2026-10-29: MQ101 3372b, MQ101DragonAttack d0593, MQ102 4e50d, MQ102A
  2bf9c, MQ102B 2610a, MQ103 d0800, MQ104 2610c (Skyrim.esm), DLC1VQ01 352a (Dawnguard.esm), DLC2MQ01 17f8e (Dragonborn.esm); the
  alternate-start plugin's quest is apocrypha's to name. MQ104 is in as the chain's next link; drop it if Dragon Rising's stages are
  wanted shared.
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


## Slice two: the relayed stage without its fragment (static read 14:07 PDT 2026-10-29, the re-analyst; HYPOTHESIS until the trace)

ADR-056's known limit: a relayed stage's QF fragment runs on the applying seat too, so rewards duplicate. The engine's chain, read
on the unpacked 1.6.1170 program through Ghidra and reverse-mapped to Address Library ids with lab/addr.py, forward-checked by
`just addr` (CommonLibSSE-NG declares the sink and the event but no body: SkyrimVM.h:116 the sink sub-object, :228 the
FragmentSystem member; ScriptEventSourceHolder.h:95 the source; TESQuestStageEvent.h:9-12 the event; BSTEvent.h:89-108 SendEvent
synchronous): the Papyrus native Quest.SetCurrentStageID (id 56684; refuses an event-scoped quest outside the Story Manager,
TESQuest.h:263-264) calls EnsureQuestStarted (25003, Offsets.h:551), registers a latent wait (53703; 53716 counts the stage's log
entries through the stage finder 25028), then the setter 25004 (walks the stage list, raises currentStage upward, calls 25252,
AddChange kQuestStages). 25252 sets the stage's done bit, registers startup and shutdown stages with BGSStoryTeller's
questStageWaitMap (32495), and runs 25260 per log entry: conditions, the complete and fail bits, the journal entry and the "quest
updated" message, then sends a TESQuestStageEvent (25271) carrying a StageItemFinishedCallback. The sink SkyrimVM::ProcessEvent
(53987, VTABLE_SkyrimVM[30] = 217115) asks the FragmentSystem (53429) for the quest's script and fragment names by (formID, stage,
entry): found, it dispatches the VM method call (DispatchMethodCall2, IVirtualMachine.h:93) with a functor (54240) that fires
the callback's slot 1 (25234, the TESQuestStageItemDoneEvent) when the stack ends; not found, it fires slot 1 inline. Slot 1's
sinks clear the StoryTeller's wait and return the latent SetStage (53763). The console SetStage is 22151 over the same 25004;
a stage set on an unstarted quest is queued by the VM itself (53711) and set at the quest's start (53706, 53713).

The narrowest suppression: a Gum replacement of 53987 (the shape of the dialogue fragment gate at 35225): when the event's
(formID, stage) is in the client's set of stages being applied from the server's relay, fire the callback's slot 1 if non-null
and return kContinue, the engine's own no-fragment branch; else the original. Kept: the done bit, currentStage, the journal entry
and message, the complete and fail bits, the StoryTeller bookkeeping, the latent return. Skipped with the fragment: the stage's
world effects and its SetObjectiveDisplayed (objectives stay the later ADR's). Keyed by pairs, never a flag window: the VM may
queue a stage on an unstarted quest and set it later. The alternative, writing currentStage and the stage bit without SetStage,
reimplements 25004 and 25252 and loses the journal; not taken. Falsifiers: a 54240 for a suppressed pair (another dispatcher), or
a 56684 with no 53763 (the Skyrim Platform promise would hang). Every id above is UNKNOWN to CommonLib and tagged HYPOTHESIS
until the trace. Notes: the re-analyst's scratch (rev.py and notes.md), to be copied under docs/research/m3/re-quest-fragment.md.

Dynamic plan (lab/frida/quest-stage-chain.js, both seats): hook 56684 (vm, stackId, the quest's formID, the stage), 22151, 25004
(quest, stage, the return), 25260 (entry, hasLogEntry), 53987 (the callback, formID, stage, entry), 53429 (the return and the
two names), 54240 and 25234 (formID, stage), 53763 (the counter). (a) c1's console setstage MS13Intro 0xb6031 10: 22151, 25004,
25260 per entry, 53987 with 53429 true and two names, later 54240 then 25234, no 53763; the journal entry and the stage's world
effect. (b) c2's relayed apply under the detour: 56684, 53716, 25004, 25260, 53987 returning with 25234 inside its frame and no
53429 or 54240, 53763 to zero in the same call; lab-api stageDone(10) true on c2, no world effect, the promise resolved.

**Suppress (slice two, 14:29 PDT 2026-10-29, fork m3-quest-fragment d02103fd):** the relayed stage's Papyrus fragment, by a Gum replacement of the VM's quest stage sink (53987) keyed by the pairs the client marks (TESModPlatform.SuppressQuestStageFragment / ReleaseQuestStageFragment); the callback's slot 1 fires so the journal, the done bit and the latent return keep; setting questFragmentSuppress; HYPOTHESIS until the trace.

### Finding 76 is D62 (2026-10-30; x-quest-mode v4 144813)

The Aventus rumor quest of playtest 38's finding 76 ("prisoner picked up the aventus rumor misc quest and it didn't propagate")
is DB01Misc 0x1ea4f, start-game-enabled in this load order; the probe's console setstage of its stage 10 reached the server as a
report and the server refused it on purpose: "E_QUEST_OWN_START: ... a start-game-enabled quest is each seat's own (D62)". So the
mode-all relay, the report path and the login message all work, and the rumor did not propagate because D62 keeps every
start-game-enabled quest per seat unless the allowed list names it. Eli expected the rumor to propagate. D69 (recorded in the LOG
and the weekend summary, recommended B under the pass's rule, Eli may veto): A) keep D62 and grow the allowed list with the misc
and rumor quests players meet (a curated list, finding 76 its first entry); B) a start-game-enabled quest's stages beyond its
start are the world's (stage 0, the engine's own start on every seat, stays per seat; the denylist stays the brake; the fragment
suppression keeps a relayed stage's script off the applying seat), a server rule change with its T0 in a follow-up train after
the union; C) leave as today. The union merges the quest work as it stands (D68: whole if x-quest-mode goes green on a quest that
is neither start-game-enabled nor denied, else the deploy's mode back to the list).

D69 B built (2026-10-30, fork m3-quest-sge-stages dc3ec679, off the union 0e23c820, T0 green on pipeline 4017; a train after the union's merge): in mode all,
OWN_START refuses only the engine's own start of a start-game-enabled quest, stage 0 and the record's start-up stages (QUST INDX,
libespm's JournalIndex::StartUpStage; MQ101's 0 carries it), and its later stages are recorded, relayed and replayed like any
other quest's; the login replay follows the same stage-aware test. The D62 unit test became D69's (FreeformHeartwoodMill's flagged start-up stage 10 refused, its 20 and MS13's 10 and 20
relayed, replayed at a login, kept when the allowed list no longer names the quest; MQ101 is Run Once, not start-game-enabled). T3 for it: the rumor
quest's own stage set (DB01Misc 10, x-quest-mode v4's frame) crossing to the other seat, a scenario of its own after the
train's stage. Eli may still veto for A or C.

Ahead, the stage-0 report churn (12:11 PDT 2026-10-30, scoped from x-quest-mode v5's server log, run 20261030-151127, and the
code at dc3ec679): DLC1VCController 0x0201a428 (Dawnguard.esm; QUST DNAM flags 0x0119, Start Game Enabled and Run Once, the
vampire-conversion controller) restarts itself in bursts on each seat, and each restart fires the engine's stage-0 event, so the
seat reports stage 0 and the server refuses it OWN_START: 32 reports per seat in a burst about a minute apart in that run
(15:12:39 one, 15:13:41 thirty-two held, on user 1; the same on user 2). The server already holds its line to one per seat per
10 s with the count (ActionListener.cpp's ownStart map), so the cost is the wire alone: one reliable QuestStage message per
restart, and at a new game the 330 start-game-enabled quests' first stages at the client's rate. The client cannot filter at the
source (Skyrim Platform's Quest has no Start Game Enabled getter, the comment at the refusal). The fix in kind, a train of its own
after D69's (client only; m3-quest-report-dedupe off the merged base): in QuestStageService.onQuestStage, a per-quest memory of the
last stage reported and when; a report equal to the last one within REPORT_REPEAT_MS (30 s, UNMEASURED beyond the burst's shape)
is dropped and counted, with one logTrace per quest per window ("stage N of quest X repeated K times in 30 s; dropped"); the
server loses nothing, since a repeated (quest, stage) is its no-op already (QuestStageTest). The T3 claims for the probe
(x-quest-report-dedupe, both seats in Riverwood for 90 s, the controller's bursts as the premise): c1.log_count("repeated
[0-9]+ times in [0-9]+ s; dropped") >= 1 on each seat; server.log_count("E_QUEST_OWN_START: .* of 1a428:Dawnguard.esm: .*
([3-9][0-9]|[1-9][0-9][0-9]) such report") == 0 (no window of thirty or more held); the mode-all relay unchanged (x-quest-mode v5's
set and relay claims repeated in the same run). The premise's read first: whether the controller's bursts recur in the lab's
frame without a vampire on either seat (they did in 151127's, both seats mortal).
Built (12:58 PDT 2026-10-30): fork m3-quest-report-dedupe 7eb968bb off the union 0e23c820 (questStageService.ts: REPORT_REPEAT_MS 30000,
REPORT_MEMORY_MAX 256, REPEAT_FLUSH_MS 5000; `repeated`, `closeRepeatWindow`, `flushRepeats`; tsc clean), kept local until the union and the
physics train have merged (its client build would load the seats' host mid-sweep); the probe x-quest-report-dedupe v1 by path (0a281115:
both seats mortal at the spawn for 150 s, the drop line on each seat, the server's held count under thirty, x-quest-mode v6's relay unchanged).

## Status

- [x] doc complete, inventory listed with a disposition per row, rung declared
- [x] engine surface cited or delegated (the platform's event and natives; no engine hook)
- [x] server logic + T0 (QuestStageTest: record, relay, no-op, refusals, replay, restart; CI's T0 pending)
- [x] message + validator (same commit)
- [x] native hook + T1 (none needed)
- [x] TS handler
- [x] T2 green (ticked 17:02 PDT 2026-10-29 by the pass: T2 GREEN on m3-turbo-train-3n e14dc298, pipeline 3793, zero undeclared differences, the quest-stage session's declared relay matched once its ids were hex, LOG 2026-10-29 04:15 PDT; the sharing-mode slice's T2 is P2's, running)
- [ ] T3 scenario green, no HYPOTHESIS tags (DEBT, 2026-10-30, D68: no scenario of this verb is committed; the mode-all relay, the denylist, the INDX check, the fragment suppression and the login's arrival ride the union with x-quest-mode v3 and b-story-arrival as their reads; b-quest-stage is owed from x-quest-mode's green and lands in its own commit)
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
location does in single player, was the open question (H-56a, ANSWERED in the RESULT below). Consequences: a world stage of a quest the engine has
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
returns. Fix shape (the RE read 14:16 PDT, docs/research/m3/re-story-location.md; HYPOTHESIS until the Frida plan): the engine's own
sender, PlayerCharacter::SetParentCell (40466), raises the Change Location event only when the player's currentLocation differs from the
cell's, which a login inside the location never does; a Skyrim Platform native builds the same 0x18-byte event {{actor handle, old, new}}
and queues it through BGSStoryEventManager::AddEvent (CommonLibSSE-NG BGSStoryEventManager.h:24-42, the CLOC index static 380069), old
none, new the player's current location, once per login; every Change Location branch node evaluates as at a fast travel's arrival (the
list in the research note). The earlier wording: at login, when the player's location has no change to report, the client raises
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

**The denylist's shape (14:59 PDT 2026-10-29, apocrypha's census, docs/research/layer-quests.md on apocrypha/alternate-start):** under
D62's rule a Start Game Enabled quest is each seat's own, which covers 38 of the layer's 42 controller, MCM, version-tracker and
player-alias quests and 330 of Skyrim.esm's 1,811; the denylist carries what the rule misses: the main quest's chain and the 40 vanilla
and DLC quests the alternate start's fragments stage, plus four served-layer controllers that are not start-game-enabled
(MAG_GeneralControllerQuest f4f8c0:MysticismMagic.esp, MAG_ThaumaturgyControllerQuest 809:Thaumaturgy.esp, GRIM_QST_TeleportManager
2725d0:LostGrimoire.esp, US_ApplyCorpseMonitorQuest 1e2c7:UndeadFX.esp). The alternate start's own twelve script- or SM-started quests
(ChargenQuest 000daf, RumorsOfWarQuest 07a334, FarmhouseProfits 01189b, CheskoPolygonQuest 03fda5, HelgenNPCKillerQuest 068ec0, the
controllers 1219b6, 126ab9, 12bbbc, 284074, FactionAssaultEvent 284076, FactionKillEvent 284079, WhiterunGuardConfrontationQuest
29847f) join the list the day that plugin is served; today it is client-only, so its quests are E_QUEST_UNKNOWN on the server. The
`allowed` list is where a start-game-enabled world system that should cross gets named.

**D62 built (15:10 PDT 2026-10-29, fork m3-quest-mode 4a759c5b):** in mode all a quest whose DNAM carries Start Game Enabled (libespm
QUST.h, mainFlags 0x1) is each seat's own: its reports are refused E_QUEST_OWN_START and a recorded stage of it is not replayed at a
login, unless the quest is on `sharedQuestsMode.allowed` (a quest both denied and allowed is a parse error); the client has no filter
(Skyrim Platform's Quest exposes no start-enabled getter), so a seat still reports such stages and the server refuses them. The
premise corrected on the masters: MQ101 0x3372b is NOT start-game-enabled (0x00), MS13 The Golden Claw 0x39645 IS (0x11), as are
MS01, MS05, MS12, MQ103, MQKillDragon, C00, CW00A/B and 87 Dialogue* hubs (330 of Skyrim.esm's 1,811). So the rule also holds back
real side quests that start at the game's start and wait for their trigger; `allowed` is the lever, and the deploy's list today is
the former curated four (A Lovely Letter, MS13, MS13Intro, MS13FIN), so the Golden Claw crosses as playtest 38 saw it. A call for
Eli, D63: which start-game-enabled world quests join `allowed` (the MS side quests, the faction openers C00 and CW00, the dialogue
hubs stay a seat's own by the recommended reading, since their stages track one player's conversations).

## The review's fixes (18:05 PDT 2026-10-29, fork m3-pass-train-2 58208e9f; P2-win dca7fe09)

An agent's rules review of the train (ee44f7d1..0b49a28e) found eight things; six are fixed on the train, two are declared.

1. Slice two was INERT: d02103fd changed TESModPlatform.psc but not the compiled TESModPlatform.pex, and Skyrim Platform's
   callNative resolves a function through the loaded .pex (VmProvider.cpp), so Suppress and ReleaseQuestStageFragment threw
   "Native function not found", the client logged it and every relayed stage ran its fragment. Both natives are declared in the
   .pex now (lab/pex.py add-native, the arrival native's precedent, e0e3af03); no playtest had reached the path.
2. Rule 12 and 5 in mode all: any u16 stage of any shareable quest was accepted with no check against the quest's own stages and
   no bound on the world's record, and the login replay was quadratic. Now a stage the quest's INDX list does not define is
   refused (E_QUEST_STAGE, libespm's QUST stages), the record is bounded (QUEST_RECORD_CAP 4096 pairs in wire-rules
   quest_stages, E_QUEST_FULL once per 10 s past it, UNMEASURED as a bound), and at_login runs in one pass (c5749f0c; tests in
   the crate and QuestStageTest, MS13's INDX list read from the browser: 10 in, 9999 out).
3. The arrival event was armed by the login's quest mode message, which a server with an empty shared list never sends, so such
   a server never raised the Change Location event at login. The arrival now waits on this connection's own CreateActor and
   the game's load, the flags reset at every connectionAccepted, the 3 s window kept (6653465c).
4. The fragment mark was released at the SetStage promise's answer, which can come before a queued stage's event (a quest not
   yet running). The sink's replacement consumes one mark at the pair's first event, and the client's release is a 10 s safety
   that logs a warn if it takes a mark back (58208e9f). HYPOTHESIS (the agent's caveat): the static read has the setter send one
   TESQuestStageEvent per log entry (25260), so a stage with several passing entries would run its later entries' fragments
   under a one-shot consume; lab/frida/quest-stage-chain.js counts the 53987 events per stage at P2's stage and decides whether
   the consume moves to the last entry (53716's count).
5. Start-game-enabled reports: in mode all a seat reports every stage event of every quest it does not know to be denied, so
   Skyrim.esm's 330 such quests arrive at the client's rate and each cost a token of the validator's budget and an info line.
   Skyrim Platform's Quest exposes no Start Game Enabled getter, so the client filter stands; the server logs E_QUEST_OWN_START
   once per seat per 10 s with the held count, and tests E_QUEST_DENIED first (a quest both denied and start-game-enabled logs
   the setting's word; 5ced4995). The token cost is a declared limit until the mode message carries the flag.
6. Declared, not fixed: PlayerScale reads the sex from the appearance alone, so a female NPC's reach uses the male height column
   (melee-reach.md's known limit; within the 256-unit slack for every playable race); libespm's NPC_ data reads no sex, and
   UESP's ACBS bit 0x1 Female is the lead to confirm against the record before a one-line read.

T0 green locally on the crate (246 cases) and the bridge; clippy, fork-lint and tsc green; the C++ compiles on CI (the push
pipeline, whose difftest builds on the crate change); the Windows half on P2-win's pipeline.

D69's T3, first reads (21:46 PDT 2026-10-30; x-quest-rumor v1 on the m3-quest-sge-stages dc3ec679 stage, 043546 cold and 044055
relaunched, RED on two claims alike): the rumor half holds (DB01Misc's stage relayed in mode all, the denied MQ102 kept per seat) and
FreeformHeartwoodMill's stage 20, unflagged, was recorded and relayed once with c2 done: D69 B's point. The red: no E_QUEST_OWN_START
for stage 10 of e3ea5 and c2's stage 10 done. The chain trace (quest-stage-chain.js on both seats) says why: on c1 EnsureQuestStarted
returned 1 and SetStage(e3ea5, 10) returned 0 with no stage event, so nothing reached the server; on c2 stage 10 reads done with no
set in the trace's window. A start-up stage is done by the quest's own start at login on every seat, and the engine refuses a console
set of a done stage, so the probe's forced report could never exist: the premise, not the server (QuestStageTest's refusal of the
flagged stage stands at T0). v2 by path (the sha1 in the LOG): the start-up stage read as done on both seats before any set, stage 20's
relay kept, and the server's OWN_START refusal reached through the reports the engine makes by itself, the vampire controller's
stage-0 reports at its restarts (DLC1VCController 1a428, within 150 s; the churn item's own evidence), never recorded.

D69's T3 (22:20 PDT 2026-10-30): x-quest-rumor v2 GREEN, 20261031-051455 on m3-quest-sge-stages dc3ec679's restage (the union's dist by
REUSE_DIST_FROM): the rumor quest's stage relayed in mode all and applied on c2, the denied MQ102 kept per seat, FreeformHeartwoodMill's
start-up stage 10 done on both seats by the quest's own start and its unflagged stage 20 recorded and relayed once with c2 done, the
server's OWN_START refusal of the vampire controller's own stage-0 reports within the window. Promoted unchanged as b-quest-rumor
(main 1b4dde1c, its own commit) and held pending in lab/gate.yaml (ebfbe115) until the train merges, since parity under D62 refuses
the HeartwoodMill relay; the merge's commit un-pends it. The merge: a union of m3-guest-loot and m3-quest-sge-stages under one gate
(always, c-dungeon-enemies, b-npc-body-release, b-quest-rumor, the quest-stage scenarios, watch; T2 beside it) if the guest-loot rerun
is green, D69 alone otherwise. The Status box "T3 scenario green" ticks at the merge, when b-quest-rumor plays green in the gate.
