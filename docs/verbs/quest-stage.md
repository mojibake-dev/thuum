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
| a stage set, the server restarted, a login | b-quest-stage-restart | GREEN standalone 20261031-135330 (v2, main 8b201edd, on parity 2fda2a19's quest code); in dedupe's gate |
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

**Rung 5's trust (rule 5; ADR-068 rung 5, fork m4-scripts-5-quests 44ffafc2, as its server half m4-scripts-5-server a403ddd4
declares it: the run words and their acting player, the quest scope, a player's own rows and their overlay, ScriptVariables 81;
docs/WIRE.md's QuestStage, ScriptCall and ScriptVariables rows):** A player's own row is R1 on the seat's word that its calling
script ran: the server checks the kind, the bound over the live attachments, the twin rule, the Playable flag, restrictedRaces and
the head part's race list, and cannot tell which named form a script chose or when. Journal liveness is the world's (once any seat
runs or stages a world quest, every seat may use that quest script's properties); under questScope derived a player-class quest is
live for every player at all times. Run-time values (CurrentHowl, Game.GetFormFromFile) and cast-only spells are refused and
counted. Overlay contents never reach the change form; the figure's look is R2. A run word's acting player is the seat's word when
it names a connected player; wordStages are the server's read of the record. ScriptVariables stay R2.

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
- The served start (ADR-068 rung 5, D-Q3 A; fork m4-scripts-5-quests 44ffafc2): the client's 5b head declared a limit, its
  builder's note 5: a served START word still ran the quest's start-up stage fragments, since the suppress mark is per (quest,
  stage) and Skyrim Platform cannot name a quest's start-up stages. SCHEMA_VERSION 42 closes it (the fresh review's note 7):
  the server stamps every start and stop word it sends with `wordStages`, read from the QUST record (stage 0 and the
  StartUpStage stages for a start, the ShutDownStage stages for a stop; ActionListener.cpp WordStages :3331-3368), and the
  receiver marks each before Quest.Start or Quest.Stop, an echo mark always and the sink's suppress mark when the word is served
  or questFragmentLive is not true (questStageService.ts markWordStages :434-450, marksFragment :1670-1672).
- The login replay of a stopped quest, a gap a static read found and the code at 685f6a24 confirmed (the client keeps a start
  word's stages alone, questStageService.ts :455-476, and the implicit start a stage's apply makes on a quest not running here
  marks only those, :594-608; the server's at_login served start words to the quests recorded running alone, quest_runs.rs
  :434-439): a login served a quest the record holds stopped its stages and then its stop, no start word, so a fresh seat's first
  stage of it started the quest with its start-up fragments unsuppressed. Fixed by fork m4-scripts-5-loginstart f2689cfa, merged
  at m4-scripts-5-second f6ca339d (D-Q3 A: a served replay's fragments are the world's history and never run again on a seat):
  at_login (quest_runs.rs :438-457 at f6ca339d) puts a quest recorded stopped among the starts when the login replays any of its
  stages, so per quest the replay reads its start, served with its start-up stages in `wordStages`, its stages ascending, its
  stop; a stopped quest with no stage to replay gets its stop alone, and a Story Manager instance under "seat" no word, as before
  (ActionListener.cpp SendQuestStages :7894-7957). The runs line gains the count: "QuestStage: actor <a> sent <n> running and <m>
  stopped quest(s) around the stages after a login, <k> of the stopped started ahead of their stages (D-Q3 A)". The gap that
  remains: a quest with replayed stages but no run record still gets the client's fallback start, its start-up fragments unmarked
  unless a start word named them on this connection (UNVERIFIED by a run).

## Message contract

- Message name / numeric type: QuestStage, MsgType 57, wire id 65 (wire-schema skymp.rs, SCHEMA_VERSION 19 at first; 21 with
  the mode byte, fork m3-quest-mode e950fb46, 2026-10-29).
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
- Settings since D58 B (14:49 PDT 2026-10-29, fork m3-quest-mode 0b9a14a4): `sharedQuests` stays the curated array above (mode
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

**Suppress (slice two, 14:29 PDT 2026-10-29, fork m3-quest-fragment db0bb406):** the relayed stage's Papyrus fragment, by a Gum replacement of the VM's quest stage sink (53987) keyed by the pairs the client marks (TESModPlatform.SuppressQuestStageFragment / ReleaseQuestStageFragment); the callback's slot 1 fires so the journal, the done bit and the latent return keep; setting questFragmentSuppress; HYPOTHESIS until the trace.

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

D69 B built (2026-10-30, fork m3-quest-sge-stages 6dbabc7a, off the union b8a9d4c6, T0 green on pipeline 4017; a train after the union's merge): in mode all,
OWN_START refuses only the engine's own start of a start-game-enabled quest, stage 0 and the record's start-up stages (QUST INDX,
libespm's JournalIndex::StartUpStage; MQ101's 0 carries it), and its later stages are recorded, relayed and replayed like any
other quest's; the login replay follows the same stage-aware test. The D62 unit test became D69's (FreeformHeartwoodMill's flagged start-up stage 10 refused, its 20 and MS13's 10 and 20
relayed, replayed at a login, kept when the allowed list no longer names the quest; MQ101 is Run Once, not start-game-enabled). T3 for it: the rumor
quest's own stage set (DB01Misc 10, x-quest-mode v4's frame) crossing to the other seat, a scenario of its own after the
train's stage. Eli may still veto for A or C.

Ahead, the stage-0 report churn (12:11 PDT 2026-10-30, scoped from x-quest-mode v5's server log, run 20261030-151127, and the
code at 6dbabc7a): DLC1VCController 0x0201a428 (Dawnguard.esm; QUST DNAM flags 0x0119, Start Game Enabled and Run Once, the
vampire-conversion controller) restarts itself in bursts on each seat, and each restart fires the engine's stage-0 event, so the
seat reports stage 0 and the server refuses it OWN_START: 32 reports per seat in a burst about a minute apart in that run
(15:12:39 one, 15:13:41 thirty-two held, on user 1; the same on user 2). The server already holds its line to one per seat per
10 s with the count (ActionListener.cpp's ownStart map), so the cost is the wire alone: one reliable QuestStage message per
restart, and at a new game the 330 start-game-enabled quests' first stages at the client's rate. The client cannot filter at the
source (Skyrim Platform's Quest has no Start Game Enabled getter, the comment at the refusal). The fix in kind, a train of its own
after D69's (client only; m3-quest-report-dedupe off the merged base): in QuestStageService.onQuestStage, a per-quest memory of the
last stage reported and when; a report equal to the last one within REPORT_REPEAT_MS (30 s, UNMEASURED beyond the burst's shape)
is dropped and counted, with one logTrace per quest per window ("stage N of quest X repeated K times in 30 s; dropped"); the
server loses nothing, since a repeated (quest, stage) is its no-op already (QuestStageTest). Lab reads (22:26 PDT 2026-10-31): a set of the stage a
quest already stands at (the driver's set-stage, Quest.SetCurrentStageID) fires no stage event, so a forced repeat cannot be made that
way (x-quest-report-dedupe v2 051908 and 052159: three sets, one report); the engine's own repeat exists on every login: Dawnguard's
DLC1NPCMentalModel (QUST 0x02002b6e) fires its stage 0 at the login and again about 30 s later on every seat, and the dedupe dropped it
in every run so far ("stage 0 of quest 2002b6e repeated 1 times in 34 s; dropped" at connect + 40 s on both seats in 192813, 051908,
052159); the controller 201a428's second report 31.6 s after its first was reported, outside the 30 s window, as designed. v3 claims
the engine's own repeat (d42cd5e5); b-quest-report-dedupe follows its green. The T3 claims for the probe
(x-quest-report-dedupe, both seats in Riverwood for 90 s, the controller's bursts as the premise): c1.log_count("repeated
[0-9]+ times in [0-9]+ s; dropped") >= 1 on each seat; server.log_count("E_QUEST_OWN_START: .* of 1a428:Dawnguard.esm: .*
([3-9][0-9]|[1-9][0-9][0-9]) such report") == 0 (no window of thirty or more held); the mode-all relay unchanged (x-quest-mode v5's
set and relay claims repeated in the same run). The premise's read first: whether the controller's bursts recur in the lab's
frame without a vampire on either seat (they did in 151127's, both seats mortal).
Built (12:58 PDT 2026-10-30): fork m3-quest-report-dedupe 32c7bdca off the union b8a9d4c6 (questStageService.ts: REPORT_REPEAT_MS 30000,
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
- [x] T2 green (ticked 17:02 PDT 2026-10-29 by the pass: T2 GREEN on m3-turbo-train-3n 38cea9bf, pipeline 3793, zero undeclared differences, the quest-stage session's declared relay matched once its ids were hex, LOG 2026-10-29 04:15 PDT; the sharing-mode slice's T2 is P2's, running)
- [ ] T3 scenario green, no HYPOTHESIS tags (DEBT, 2026-10-30, D68: no scenario of this verb is committed; the mode-all relay, the denylist, the INDX check, the fragment suppression and the login's arrival ride the union with x-quest-mode v3 and b-story-arrival as their reads; b-quest-stage is owed from x-quest-mode's green and lands in its own commit)
- [ ] parity scenario green, or its later list reviewed with it (ADR-031)
- [ ] sequences and combinations green, every checklist item with its scenario (ADR-033)
- [ ] ledger and suppression registry updated

Play: BROKEN, playtest 41 (2026-11-02, LOG 16:53): Arvel carries no Golden Claw (MS13's alias-created item, ALCO 0x39647, has no
server rule), so the claw door had nothing to open it.

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

**D62 built (15:10 PDT 2026-10-29, fork m3-quest-mode 1018cc45):** in mode all a quest whose DNAM carries Start Game Enabled (libespm
QUST.h, mainFlags 0x1) is each seat's own: its reports are refused E_QUEST_OWN_START and a recorded stage of it is not replayed at a
login, unless the quest is on `sharedQuestsMode.allowed` (a quest both denied and allowed is a parse error); the client has no filter
(Skyrim Platform's Quest exposes no start-enabled getter), so a seat still reports such stages and the server refuses them. The
premise corrected on the masters: MQ101 0x3372b is NOT start-game-enabled (0x00), MS13 The Golden Claw 0x39645 IS (0x11), as are
MS01, MS05, MS12, MQ103, MQKillDragon, C00, CW00A/B and 87 Dialogue* hubs (330 of Skyrim.esm's 1,811). So the rule also holds back
real side quests that start at the game's start and wait for their trigger; `allowed` is the lever, and the deploy's list today is
the former curated four (A Lovely Letter, MS13, MS13Intro, MS13FIN), so the Golden Claw crosses as playtest 38 saw it. A call for
Eli, D63: which start-game-enabled world quests join `allowed` (the MS side quests, the faction openers C00 and CW00, the dialogue
hubs stay a seat's own by the recommended reading, since their stages track one player's conversations).

## The review's fixes (18:05 PDT 2026-10-29, fork m3-pass-train-2 e6c0c684; P2-win 278d28c3)

An agent's rules review of the train (33240fd4..f1b71d38) found eight things; six are fixed on the train, two are declared.

1. Slice two was INERT: db0bb406 changed TESModPlatform.psc but not the compiled TESModPlatform.pex, and Skyrim Platform's
   callNative resolves a function through the loaded .pex (VmProvider.cpp), so Suppress and ReleaseQuestStageFragment threw
   "Native function not found", the client logged it and every relayed stage ran its fragment. Both natives are declared in the
   .pex now (lab/pex.py add-native, the arrival native's precedent, 6e115396); no playtest had reached the path.
2. Rule 12 and 5 in mode all: any u16 stage of any shareable quest was accepted with no check against the quest's own stages and
   no bound on the world's record, and the login replay was quadratic. Now a stage the quest's INDX list does not define is
   refused (E_QUEST_STAGE, libespm's QUST stages), the record is bounded (QUEST_RECORD_CAP 4096 pairs in wire-rules
   quest_stages, E_QUEST_FULL once per 10 s past it, UNMEASURED as a bound), and at_login runs in one pass (e3ce8785; tests in
   the crate and QuestStageTest, MS13's INDX list read from the browser: 10 in, 9999 out).
3. The arrival event was armed by the login's quest mode message, which a server with an empty shared list never sends, so such
   a server never raised the Change Location event at login. The arrival now waits on this connection's own CreateActor and
   the game's load, the flags reset at every connectionAccepted, the 3 s window kept (22b4d673).
4. The fragment mark was released at the SetStage promise's answer, which can come before a queued stage's event (a quest not
   yet running). The sink's replacement consumes one mark at the pair's first event, and the client's release is a 10 s safety
   that logs a warn if it takes a mark back (e6c0c684). HYPOTHESIS (the agent's caveat): the static read has the setter send one
   TESQuestStageEvent per log entry (25260), so a stage with several passing entries would run its later entries' fragments
   under a one-shot consume; lab/frida/quest-stage-chain.js counts the 53987 events per stage at P2's stage and decides whether
   the consume moves to the last entry (53716's count).
5. Start-game-enabled reports: in mode all a seat reports every stage event of every quest it does not know to be denied, so
   Skyrim.esm's 330 such quests arrive at the client's rate and each cost a token of the validator's budget and an info line.
   Skyrim Platform's Quest exposes no Start Game Enabled getter, so the client filter stands; the server logs E_QUEST_OWN_START
   once per seat per 10 s with the held count, and tests E_QUEST_DENIED first (a quest both denied and start-game-enabled logs
   the setting's word; 165d835b). The token cost is a declared limit until the mode message carries the flag.
6. Declared, not fixed: PlayerScale reads the sex from the appearance alone, so a female NPC's reach uses the male height column
   (melee-reach.md's known limit; within the 256-unit slack for every playable race); libespm's NPC_ data reads no sex, and
   UESP's ACBS bit 0x1 Female is the lead to confirm against the record before a one-line read.

T0 green locally on the crate (246 cases) and the bridge; clippy, fork-lint and tsc green; the C++ compiles on CI (the push
pipeline, whose difftest builds on the crate change); the Windows half on P2-win's pipeline.

D69's T3, first reads (21:46 PDT 2026-10-30; x-quest-rumor v1 on the m3-quest-sge-stages 6dbabc7a stage, 043546 cold and 044055
relaunched, RED on two claims alike): the rumor half holds (DB01Misc's stage relayed in mode all, the denied MQ102 kept per seat) and
FreeformHeartwoodMill's stage 20, unflagged, was recorded and relayed once with c2 done: D69 B's point. The red: no E_QUEST_OWN_START
for stage 10 of e3ea5 and c2's stage 10 done. The chain trace (quest-stage-chain.js on both seats) says why: on c1 EnsureQuestStarted
returned 1 and SetStage(e3ea5, 10) returned 0 with no stage event, so nothing reached the server; on c2 stage 10 reads done with no
set in the trace's window. A start-up stage is done by the quest's own start at login on every seat, and the engine refuses a console
set of a done stage, so the probe's forced report could never exist: the premise, not the server (QuestStageTest's refusal of the
flagged stage stands at T0). v2 by path (the sha1 in the LOG): the start-up stage read as done on both seats before any set, stage 20's
relay kept, and the server's OWN_START refusal reached through the reports the engine makes by itself, the vampire controller's
stage-0 reports at its restarts (DLC1VCController 1a428, within 150 s; the churn item's own evidence), never recorded.

D69's T3 (22:20 PDT 2026-10-30): x-quest-rumor v2 GREEN, 20261031-051455 on m3-quest-sge-stages 6dbabc7a's restage (the union's dist by
REUSE_DIST_FROM): the rumor quest's stage relayed in mode all and applied on c2, the denied MQ102 kept per seat, FreeformHeartwoodMill's
start-up stage 10 done on both seats by the quest's own start and its unflagged stage 20 recorded and relayed once with c2 done, the
server's OWN_START refusal of the vampire controller's own stage-0 reports within the window. Promoted unchanged as b-quest-rumor
(main 001d602e, its own commit) and held pending in lab/gate.yaml (15133271) until the train merges, since parity under D62 refuses
the HeartwoodMill relay; the merge's commit un-pends it. The merge: a union of m3-guest-loot and m3-quest-sge-stages under one gate
(always, c-dungeon-enemies, b-npc-body-release, b-quest-rumor, the quest-stage scenarios, watch; T2 beside it) if the guest-loot rerun
is green, D69 alone otherwise. The Status box "T3 scenario green" ticks at the merge, when b-quest-rumor plays green in the gate.

Debt noted (22:23 PDT 2026-10-30): b-quest-stage-restart is named above as the verb's restart scenario and is not in lab/scenarios; the
quest records' persistence across a restart rides a-restart-persistence's world today and QuestStageTest's restart case at T0. It
is written after D69's merge (rule 6's shape: the recorded stages read back after a server restart on both seats).
Written 05:38 PDT 2026-10-31 (thuum main ca3e80e8): the stage set and relayed, the restart, both seats' reads after the reconnect with
the login replay lines, a relaunched c2 reading the stage at its login. Its first run is owed before any gate that lists it.

## b-quest-rumor's dead mode-all claim in apocrypha's layer sweep (20:01 PST 2026-11-09 (04:01Z 11-10), thuum-fa; run set 20261109-225901)

Red at 20261110-035739, step 11: 'server.log_count("QuestStage: actor ff[0-9a-f]+ sent .* mode all") >= 1' read 0 on canon
ce0d2664 under apocrypha's layer, with both seats' "the server shares .* mode all" at 1; its reruns read the same, and DB01Misc
0x1ea4f's stage 10 is unset on either seat only because the run stops at the red step before its set. The pattern can never match:
the server prints its login line as "QuestStage: actor <id> sent mode 1 with <n> denied quests" (ActionListener.cpp:6741-6745), the
mode a number, the same dead pattern the gate audit's 521cba05 (2026-11-02) gave b-quest-stage, whose rewrite Eli approved
(50de1f6b, green 20261109-091605). docs/research/rung5-quests-2026-11-09.md read 3 named it before this run. The fix is W1 B
(ADR-068's "Rung 5's words", Eli 14:4x PST 2026-11-09): b-quest-rumor v2's rewrite, which takes the numeric form and the rung's new
quest rules, approved once x-quest-runs v1 names the vampire castle controller's lines inside its window. Pending in lab/gate.yaml,
named here, until v2 lands green; a run before then is evidence only.

## D-Q4 C: a run word is the world's only when a world cause makes it (Eli 2026-11-10; fork m4-scripts-5-cause a1bd95e0, on m4-scripts-5-second 685f6a24; SCHEMA_VERSION 43)

Eli's word (docs/DECISIONS.md, rung 5's stage-eve words): a quest's run word counts as the world's only when a script's native
call makes it, read at the seam, not every engine start and stop (the template save's load, start-game housekeeping, the Story
Manager's per-seat starts); its rule came from a read first. The run-cause read (2026-11-10, a read-only agent's, condensed by
thuum-fa; the deployed load order on sky-srv, 2568 served quests) found what tells the two apart: the ROOT of the stack that
called Quest.Start or Quest.Stop. USSEP's USKPRetroactive213Script.Process stops its own quest under
USKP_VersionTrackingScript.ProcessRetroScripts, rooted at OnInit and at USKP_VersionTrackingPlayerAliasScript.OnPlayerLoadGame,
while a world completion roots at its stage fragment (QF_MS13_00039645.Fragment_42). The immediate caller does not tell them
apart (the seam's `handler` names the helper, "Process", for 113 of 300 seat-own stop sites), nor does the quest's self (the
self-restart test holds for all 101 USSEP-type stoppers and all 556 world stops), nor its flags (Start Game Enabled with Run Once
covers MS13's 0x0111, MS05 to MS10, MS14 and 36 world quests).

**The rule, by the root's class (the platform's QuestCause.h :10-58, QuestCause.cpp Classify :184-227):**
- The seat's own: lifecycle (OnInit, OnPlayerLoadGame, OnReset); cell and load events (OnLoad, OnUnload, OnCellLoad,
  OnCellAttach, OnCellDetach, OnAttachedToCell, OnDetachedFromCell); the Story Manager's OnStory* events; a magic effect's
  (OnEffectStart, OnEffectFinish); OnRaceSwitchComplete; the UI (SKSE's input, menu and camera events from Form.psc, SkyUI's MCM
  events: OnConfig*, OnOption*, OnPageReset, OnGameReload, OnVersionUpdate, OnVersionUpdateBase, OnMessageDialogClose and the ST
  events); an engine start's start-up fragment (a stage fragment no mark arms); any stage set inside a seat-own chain; and a root
  no list names (a plain function a plugin dispatched, a fragment of no kind read): the world's needs a positive read.
- The direct timers (OnUpdate, OnUpdateGameTime): the seat's own for a run word, the world's progress for a stage they set (TG02B,
  MGR22 and TutorialAlchemy time their completion; no controller cycles through a timer-set stage, the read).
- The world's: a topic info's, a scene's, a package's or a perk's fragment (by its self's form type, else TIF_, SF_, PF_ or PRKF_
  by name), every other On* event (an interaction: OnActivate, OnTriggerEnter, OnHit, OnDeath, OnRead, OnLocationChange), and a
  quest's own stage fragment whose stage a world cause or a timer set.

**How the verdict rides (QuestCause.h's three tables; ScriptNatives.cpp MarkQuestCause :1585, called at every Quest row past step
(b) at :1789-1791, never for the platform's own call; FridaHooks.cpp's quest stage sink :3041-3049; EventHandler.cpp :1226-1232
and :1263-1272):** marks, (quest, stage or word) to a verdict for 10 s (kMarkMs), written at a Quest row, read by the stage's
event and taken once by the word's; arms, a quest to its latest stage's verdict for 30 s (kArmMs), written by the sink at every
stage event before the original dispatches the fragment (a stage the engine set by itself arms the seat's own), so a fragment's
stack carries the verdict of whoever set its stage; joined stacks, a fragment's stack to the verdict it joined at its first Quest
row, 120 s (kJoinedMs), dropped at a game load; bounds 1024, 256 and 512, the oldest dropped. A Start on a running quest and a
Stop on a stopped one mark nothing (the review of edf64dee, note 4: an untaken mark would lend its cause to the quest's next
engine start); a SetStage on a stopped quest marks the start beside the stage with the run word's verdict, a direct timer's the
seat's own (note 5). questStart, questStop and questStage carry `cause` ('world' or 'seat') and `root` to the client, the seat's
own with an empty root when no script call made the event. Lines: a trace a mark, "[verb:quest-stage] Quest.Stop on 701e8bd
(stop): cause seat (root USKP_VersionTrackingScript.OnInit), stack <n>", and one info line a census window, "<n> quest call(s) in
30 s marked by cause: <w> world, <s> the seat's own (<c> by a fragment's carried verdict)".

**The client and the server.** QuestStageService (questStageService.ts :384-410, :1780-1820) reports a run word only with a world
cause, and so a stage-0 report (the server judges it a start, read 5); the login load's hold and the listed, client-only and
puppet-stop skips stay ahead of the rule, the churn hold behind it; every report names its cause and root (QuestStage's `cause`
and `root`, docs/WIRE.md; a root the wire would refuse left off, the cause kept); the reports the rule held are counted,
"[verb:quest-stage] causes in 60 s: <w> world sent, <h> seat-own held (<a> word(s), <b> stage-0; <r> script-rooted)". The kill
switch: the client setting questRunCause "any" turns the rule off (every report as before, naming no cause; said once), and a
platform that names no cause gets the same. The server (ActionListener.cpp OnQuestStage :3601-3662; wire-rules quest_runs
judge_caused :359-369) refuses a run word with the seat's own cause (E_QUEST_CAUSE, a line a minute per seat and quest, the
reported cause and root named) and records no stage report it reads as a start (a start-up stage, which the seat cannot tell and
the record can) with the seat's own cause, the designed path, in one plain line a minute per seat with no E_QUEST_ code; any other
stage crosses whatever its cause. R2 (rule 5): the cause and the root are the seat's word, judged against nothing, logged.

**The Story Manager's instances: D-Q5 A (Eli 17:11Z 2026-11-10, verbatim "A for D-Q5"; docs/DECISIONS.md, "Rung 5's second head,
Eli's later words", main 3e9ea244).** A quest a Story Manager quest node names runs once per seat, each seat's Story Manager
starting its own (the audit of 685f6a24: 526 live SMQN nodes naming 1,454 quests in the deployed order). Its run words, start and
stop, stay its own seat's (the setting `questStoryInstances` "seat", the default): wire-rules quest_runs refuses them
(Code::Instance), neither recorded nor relayed, and the login serves none of its runs, since a relayed stop would cut another
seat's own instance (a WI, WE or ADIA quest; 220 Story Manager quests' world-looking stops stay per seat: about 35 CLOC dungeon
quests, DA10, the CW missions, the Favors); its stages still cross. Taken over B (split by the quest's cast: a quest whose aliases
are all fixed judged by cause like any world quest, one with a condition-picked alias per seat in words and stages) and C (every
Story Manager quest judged by cause, the setting's "world", one line of server-settings.json). Since fork m4-scripts-5-review
b23085da (Fix A, merged at f6ca339d) the refusal, the designed path, prints a plain line with no E_QUEST_ code (ActionListener.cpp
OnQuestStage :3646-3672 at f6ca339d, one line a minute per seat and quest, the rest counted into it), every fact the old line had:
"[verb:quest-stage] the <start|stop> of <q> by <actor> kept to its seat: a Story Manager instance (questStoryInstances seat[;
cause <world|seat>, root <r|none>, R2])[, named by <node> <id>[ and <n> more]], its stages still crossing; user <u>'s report not
recorded, nothing relayed; <n> such report(s) of the quest since the last line" (c1's typed `setstage 74a83 310` runs A Lovely
Letter's Fragment_22, whose Stop() inherits the console's world cause). The refusal and E_QUEST_INSTANCE's judgment in quest_runs
are kept, and E_QUEST_CAUSE's line is unchanged. The server reads the nodes itself (libespm SMQN.h, its NNAMs, CommonLibSSE-NG
BGSStoryManagerQuestNode.h:48; PartOne.cpp StoryIndexOf :3988-4058 at 685f6a24, each node's last version, a deleted or ignored
node naming nothing; ComposeStoryQuests :4133-4157), with one line, "[verb:quest-stage] the Story Manager's <n> quest node(s) name
<m> quest(s) (SMQN NNAM): ... (questStoryInstances seat, D-Q4 C)". Known limits shipped with playtest 51 (the audit): (1) a
fixed-cast Story Manager quest finished on one seat stays open on another: A Lovely Letter 0x74a83's stage 310 crosses, but its
Fragment_22 Stop() is kept to its seat, so the other seat keeps the letter at 310 and a later login never gets its end; (2) a
radiant Story Manager quest's stage crosses to another seat's own, different instance: BQ01 0x95125, whose bounty target is picked
by conditions per seat.

**The console arm (fork a1bd95e0, Fix C since m4-scripts-5-review ab02d45c merged at f6ca339d; skymp5-client
consoleCommandsService.ts :151-272 and :330-350 at f6ca339d; PuppetApi.cpp markQuestCause :434-475).** A quest command the player
types is the player's own act and runs no script, so the seam reads no root for it and its words were the seat's own
(x-quest-words red at its first start; every lab lever that drives a quest by console held). Skyrim Platform runs a replaced
command's JS execute before the engine's own handler, which runs only when execute answers true (ConsoleApi.cpp
ConsoleComand_Execute), so the client marks the typed quest first, each mark the world's, root "console.<command>", for 30 s
(CONSOLE_MARK_MS: a typed start or stop is queued to the story teller's next pass, and a console left open may hold that pass
back); then execute answers true and the engine runs the command as typed. Since Fix C a command marks only the words it will
make, the seam's own rule (MarkQuestCause marks no Start of a running quest and no Stop of a stopped one): setstage marks its
typed stage always and a start only for a quest not running here (SetStage starts a stopped quest with no story event); startquest
a start only for a quest not running; stopquest a stop only for a running one; resetquest by its handler's read, a running quest's
stop or a stopped one's start. The run is the client's own map, questRuns, from this game's questStart and questStop events since
its last load (at most 4096 quests, QUEST_RUNS_MAX, the oldest let go first, cleared at gameLoad), not Quest.IsRunning: a console
command's execute runs outside the Papyrus VM's update, where no game function may be called (the fork's
docs/skyrim_platform/features.md:31; CallNativeApi.cpp:77-79 throws "can't be called in this context" while no VM is set), so a
Quest.IsRunning there would throw and mark nothing. A quest no event named since the load is unread here and its command marks
every word it may make, as before, so no command marks less than it did where nothing is known. Lines: "[verb:quest-stage] console
<cmd> <quest>: armed world for its next event (<stage s, start, stop>; <running here|stopped here|its run unread here>)", and for
a command that marks nothing, "[verb:quest-stage] console <cmd> <quest>: nothing armed (<run>, so it makes no <start|stop>)"; a
typed name no form has marks nothing. resetquest's open half: its handler stops a running quest that is not Start Game Enabled and
starts a stopped one that is, and Start Game Enabled is unreadable on this client (no Papyrus native or platform export names
TESQuest's kStartsEnabled, CommonLibSSE-NG include/RE/T/TESQuest.h:30), so the run alone picks its word: a running Start Game
Enabled quest's reset still marks a stop it does not make, and a stopped one that is not, a start. completequest is not
intercepted: it flags the quest completed and never starts or stops it, so it makes nothing to mark. Which word each command makes
is a static read of SkyrimSE.exe 1.6.1170's handlers, HYPOTHESIS until a trace; HYPOTHESIS too that the events' run is the flag
the seam reads (TESQuest::IsEnabled, kEnabled, CommonLibSSE-NG src/RE/T/TESQuest.cpp:42-45), that every start or stop after a load
raises one, and that its event reaches this game's update before the next typed command. The engine's own starts (a load, Start
Game Enabled, the Story Manager) mark nothing and stay the seat's own.

**Open items.**
- Leftover marks: a console mark the engine never takes stays its 30 s and lends its world cause to that quest's next engine start
  or stop and the stages riding it. Since Fix C that is left to a quest whose run this game read no event of since its load (every
  word marked, as before) and to resetquest's Start Game Enabled half (above); the review's note 4 closed it for the seam's own
  marks. Since train 52's Fix 3 (below) both close for a typed command: the platform reads the engine's own flags at the execute
  and marks only the word they say the command makes, so a mark is left over only where a handler differs from the static read
  (the commands' words, H-RQ1) or the flags move before it runs (H-QR1).
- A mod script's console command reads as the world's: a command a plugin's script runs through the console reaches the same
  replaced execute, so it is marked as if the player typed it (UNVERIFIED: no run has read one).
- The lab driver's set-stage {start: true} is a seat start: its Quest.Start is the platform's own call, which the seam never
  marks, so its questStart carries the seat's own cause and the client holds the word; a probe that needs a world start types the
  console's startquest or setstage instead (a typed command is the world's, above).
- D-Q9 (a player alias's OnLocationChange read as a world cause: the class rule above reads every other On* event as an
  interaction), D-Q6 and D-Q7: CLOSED, Eli's D-Q9 B, D-Q6 A and D-Q7 A (about 04:53Z 2026-11-11, docs/DECISIONS.md main 7ced7f5a,
  the four recommendations with D-Q10 A). D-Q9 B is built in train 52 as the default of the server setting questPlayerAliasCause
  (below); playtest 51 keeps the second head's world reading as a declared limit.

**Hypotheses (QuestCause.h :49-58; x-quest-cause v1 by path, lab/.cache/drafts/rung5, reads the first two).** HYPOTHESIS H-QC1:
a script-set stage's fragment runs on its own stack rooted at the fragment (x-acting-frame showed it for a platform-applied stage
only). HYPOTHESIS H-QC2: a word's event lands inside its mark's window. HYPOTHESIS H-QC3: a fragment's first Quest row comes
within kArmMs of its stage's event and before its quest's next stage event, so the lazy join takes its own stage's verdict (a
Fragment_N names no stage; a fragment behind a long wait, or racing a later stage of its quest, joins the arm then standing or
none, the seat's own). Unverified by the read besides: whether the event gate covers alias and cell-load events, and 909 run and
stage call sites with unresolved receivers (mostly stage sets on GetOwningQuest() in dialogue fragments).

## T2 against rung 5's keys (numidium's read, 16:40Z 2026-11-10; fork m4-scripts-5-second f6ca339d)

T2 ran against the rung's keys: each login served 1,013 watch keys in four ScriptVariables messages, about 91 KB of the
fakeclient's event lines, and difftest reads one fakeclient's stdout at a time (difftest main.rs:334-335, each child's
wait_with_output in turn). So each session's later seat sat blocked on a full 64 KiB pipe until the first seat quit, and every
relay toward the first seat (trigger-entry's 70, trigger-look's 30, destruction's 78, alias-fill's 79, the movement of six
sessions) found it gone; none of those handlers reads the keys except OnAliasFill's player-class gate, which MS13 passes. The
keys' own change in that run is player-own's two start words, refused E_QUEST_PLAYER under questScope "derived" as designed. T2
runs without the six keys since main 4063122d (test-proto), so the derived scope is proved by T0 and T3 until difftest drains each
client as it writes (fork m4-difftest-drain, building).

## Train 52: D-Q9 B built as questPlayerAliasCause, and the console arm's one quest-run rule (fork m4-train-52 c3f9d175, on m4-scripts-5-second f6ca339d; built 2026-11-11, T3 pending)

Train 52 (its plan, gitignored: lab/.cache/drafts/train52-plan.md, sections 3 and 4.1) is pushed with its pipelines green (5795 at
ff467dab, the one Windows build; 5797 at c3f9d175, its T0), its lab stage after playtest 51. No seat has run it: each lab claim
below is built and T3 pending with the probe that reads it, or HYPOTHESIS. Line numbers are c3f9d175's.

**D-Q9 B, built (8c53b76c, server only; Eli about 04:53Z 2026-11-11, docs/DECISIONS.md main 7ced7f5a).** Eli's word: a player
alias's OnLocationChange is its seat's own cause, since the event is about that seat's player, not the world's, so a quest that
stops itself when its player changes location stops on that seat alone; his frame, that each such answer is a quest setting's
default (ADR-070, PROPOSED, lists the key among its axes). The platform's class rule above reads every On* event outside its seat
lists as an interaction, a world cause (QuestCause.cpp Classify), so the server re-judges:
- The rule: wire-rules quest_runs' PLAYER_ALIAS_EVENTS, ["OnLocationChange"] (quest_runs.rs:235-238: Eli's word names one; the
  list grows by name only on a census read), and root_is_seat_own(function, script_on_player_aliases_only) (:240-250, names
  without case: the function one of the list, on a script the game files attach to player aliases alone).
- The index: PartOne's PlayerAliasScriptIndexOf (PartOne.cpp:3916), read once per set of game files over QuestScopeFacts' alias
  scripts (libespm ScriptData's aliases, each with its alias id), marks a script class player-only when every alias it rides, over
  every quest, is the player's by quest_scope::is_players (ALFR 0x14, ALUA 0x7, created in a player alias's inventory, or an
  external player alias; quest_scope's new player_alias_ids, quest_scope.rs:143), mixed otherwise. AttachEspm keeps it and logs
  "[verb:quest-stage] the game files attach <n> script class(es) to quest aliases, <m> of them to player aliases alone
  (questPlayerAliasCause <seat|world>, D-Q9 B)" (PartOne.cpp:854-867). The index reads QUST VMADs alone, so a script class also
  attached to a placed reference is judged by its aliases.
- The setting: questPlayerAliasCause in server-settings.json, "seat" (D-Q9 B, the default) or "world" (D-Q9 A), read beside
  questStoryInstances (ScampServer.cpp:500-503, settingOr, "seat" when absent) into PartOne::SetQuestPlayerAliasCauseSettings
  (PartOne.cpp:4215), parsed strictly (wire-rules PlayerAliasCause::from_json, quest_runs.rs:269-279: anything but the two words
  stops the server, named). No deployed settings file changes: the default is Eli's B.
- The re-judgment: OnQuestStage (ActionListener.cpp:3618-3640), under "seat", takes a report with cause 1 whose root, split at its
  last dot, passes quest_root_is_seat_own as cause 2: a run word refused E_QUEST_CAUSE, a report judged a start not recorded (the
  plain line a minute), a plain stage crossing as before (D-Q4 C judges only run words and start-up stages by cause); its lines
  add "(cause world re-judged the seat's own: <root> is a player alias's OnLocationChange, D-Q9 B)". wire-schema's QuestStage
  `cause` doc names it; no field moves.
- Rule 5: R2 as before (the root is the seat's word); the re-judgment only moves a report toward the seat's own, so a forged root
  gains a seat nothing it could not get by reporting cause 2 itself.
- T0 (pipeline 5797): quest_runs (the event on a player-only script true, on a mixed one false, OnItemAdded and OnActivate false,
  case, the setting's parse), quest_scope's player_alias_ids and the bridge's; unit/QuestStageTest.cpp on Skyrim.esm, MQ101
  0x3372b (no Story Manager node names it), which carries MQ101PlayerScript on its player alias 119 alone and MQ101CartRiderScript
  on that alias and nine NPC ones (lab/esm.py's walk of the lab's cached Skyrim.esm, Dawnguard.esm and Dragonborn.esm: 729 alias
  script classes, 90 riding player aliases alone, one riding a player alias and another): under "seat" a world-caused stop rooted
  at MQ101PlayerScript.OnLocationChange refused E_QUEST_CAUSE with the D-Q9 words, MQ101PlayerScript.OnActivate and
  MQ101CartRiderScript.OnLocationChange recorded; under "world" the location change recorded; "off" refused at the setter.
- T2: the difftest session quest-stage's new step (fork 63f987b8): at 4.7 s c1 reports FreeformRiften04 0x53308's stop with cause
  1 rooted at FFR04PlayerScript.OnLocationChange, a script the game files attach to the quest's player alias 1 alone (its alias 0
  the world's, so the quest is; no Story Manager node names it); under "seat" the wire stack refuses it E_QUEST_CAUSE and relays
  nothing, where a world reading would relay it to c2 as an undeclared divergence. Its run is pending (the first keyed T2,
  docs/WIRE.md's ScriptVariables section).
- T3: Dynamic first, a read-only lab/census.py query for quests whose player alias script handles OnLocationChange and calls
  Start, Stop or SetStage; no content is named until it reads one. Playtest 51 keeps the second head's world reading as a declared
  limit.

**Fix 3, the console arm's one quest-run rule (f54bdfc3; the plan's section 3).** Which word a quest request makes is decided in
one place that reads the engine's own flags, and the seam and the console share it:
- QuestCause::WordMade(word, running, startsEnabled) (QuestCause.h:70-89, QuestCause.cpp:184-211), game-free: a stage (0 to 65535)
  always itself; a start only of a stopped quest; a stop only of a running one; a reset's stop of a running quest that is not
  Start Game Enabled, or its start of a stopped one that is (HYPOTHESIS H-RQ1); nothing otherwise. QuestCause::kReset, -3
  (QuestCause.h:63-68), is a typed resetquest's input word alone, never a table key (ActingScope's kEntry -3 is another table's).
- The seam's MarkQuestCause (ScriptNatives.cpp:2091) applies it in place of its two hand tests (the early return for a Start of a
  running quest or a Stop of a stopped one, and the start beside a stopped quest's stage): the same behavior, one rule; a quest
  the form table holds no TESQuest for marks its word as before.
- The console's markQuestCause (PuppetApi.cpp:437-512) looks the quest up (TESForm::LookupByID<TESQuest>, the form table's own
  lock) and reads TESQuest::IsEnabled and StartsEnabled (:489-490; CommonLibSSE-NG src/RE/T/TESQuest.cpp:42-45 and :112-115,
  kEnabled and kStartsEnabled at include/RE/T/TESQuest.h:26 and :30) on the JS thread while the console's own thread waits in
  PushAndWait (ConsoleApi.cpp ConsoleComand_Execute), so the flags read are the ones the engine's handler reads next; no Papyrus
  call. It marks WordMade's word when there is one and answers { marked: number | null, running, startsEnabled }, or null for a
  refused shape or a quest id no TESQuest has, where it answered a boolean (the stage bound moved to -3 for the reset;
  Definitions.txt and skyrimPlatform.ts regenerated, clientListener.ts:285).
- The client (consoleCommandsService.ts): resetquest's word is QUEST_RESET, -3 (:16, the table :333-338); markTypedQuest
  (:213-257) sends each word the command may make (setstage's stage beside its start) and builds its line from the platform's
  answers: "[verb:quest-stage] console <cmd> <quest>: armed world for its next event (<stage s, start, stop>; <running|stopped>
  here)" (:256), or "...: nothing armed (<running|stopped> here[, Start Game Enabled], so <it|its reset> makes no <start|stop>)"
  (:253).
- Fix C's client bookkeeping retires whole: QUEST_RUNS_MAX, the questStart and questStop listeners and the gameLoad clear, the run
  filter, noteQuestRun and its HYPOTHESIS (the events' run is the seam's flag, every start or stop after a load raises one, its
  event reaches the update before the next typed command), the questRuns map, the QuestStartStopEvent import and the "its run
  unread here" branch: the platform reads the flag the seam reads, so resetquest's Start Game Enabled half closes. What stays: the
  table of which words each command may make (a static read of the handlers, HYPOTHESIS), the 30 s mark life, the lines' words.
- HYPOTHESIS H-RQ1 (QuestCause.h:81-87): the console's ResetQuest handler stops a running quest that is not Start Game Enabled and
  starts a stopped one that is, and nothing else (the static read Fix C, ab02d45c, cites); CommonLib's own
  TESQuest::ResetAndUpdate (src/RE/T/TESQuest.cpp:74-89: Reset, then a start-up when IsEnabled is set and StartsEnabled is not, a
  shut-down the other way) reads otherwise. HYPOTHESIS H-QR1: the flags read at the execute are the handler's (a VM thread's own
  Quest.Start in that window races, as the seam's own read races). HYPOTHESIS H-QR2, inherited: IsEnabled is the run the engine's
  words follow.
- T0 and T2: none possible (a platform export and the client; checked with tsc --noEmit and webpack, QuestCause.cpp under the
  local clang with a scratch test of WordMade's twelve cases, and a scratch harness over the service). T3: x-console-arm v1
  (bec6d9ee, by path, lab/.cache/drafts/train52), c1 alone at lab-spawn: MS10MiscObjPointer 0x10d3bb (neither Start Game Enabled
  nor Run Once) and MS01 0x18b4b (running from the load, Start Game Enabled, DNAM 0x0011), typed 3 s apart, legs A to G with
  claims 1 to 8, then leg H. Claim 8 (MS01's resetquest, running and Start Game Enabled) cannot tell H-RQ1 from ResetAndUpdate,
  since both make no stop there unless the engine's Reset clears kEnabled; leg H, a resetquest of 10d3bb while it runs, not Start
  Game Enabled, separates them: H-RQ1 stops it, ResetAndUpdate with kEnabled kept starts it up again and leaves it running, and
  with kEnabled cleared by Reset does neither and leaves it stopped (claims H2 to H5 read which). A red there goes to Eli with the
  reading it shows before WordMade's reset branch moves.

T2 with rung 5's six keys back (fork 63f987b8 on the drain 1bb3893b, which reads every client's stdout on its own thread from its
spawn; thuum's lab/tools/test-proto.sh keeps the keys for a head whose divergences.yaml declares the t:81 watch, branch
t2-r5-keys, unmerged at this writing): the session player-own drops its two c2 relays of the player-class starts (E_QUEST_PLAYER
by design under questScope "derived", as the section above read) and says the attachments are live by class, so the derived scope
gets its T2 with that run, pending (docs/WIRE.md's ScriptVariables section).
