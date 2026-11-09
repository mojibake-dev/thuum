# ADR-068 rung 5, quests under D-F1 C: the build plan (2026-11-09)

Written 2026-11-09 by a read-only planning agent (thuum-fa's) against fork origin/m4-train-50 ce0d2664, which becomes canon after
today's merge gate (SCHEMA_VERSION 40, rung 4 and the 50 train inside it), making concrete ADR-068's decision 9 rung 5, decision
6's D-Q1 and the consequences paragraph, ADR-063's D-F1 C, and the research file's findings 5 and 12, with three post-50 platform
fixes riding its 5b head. Nothing was run on the lab and nothing was edited; the only game-file reads were `lab/esm.py`
(quests, scripts, ref, id, find) on sky-srv, read-only. Every claim the tree does not show is UNVERIFIED; every engine claim
awaiting a trace is HYPOTHESIS. thuum-fa spot-checked reads 2, 3, 4 and 11 against the tree before the commit: they hold.

Paths: W is the fork at ce0d2664; SP is W/skyrim-platform/src/platform_se/skyrim_platform; client is
W/skymp5-client/src/services/services; server is W/skymp5-server/cpp/server_guest_lib; wire is W/skymp-wire/crates; CL is
CommonLibSSE-NG b93280e8 include/RE unless named; thuum is this repo.

## Reads that change the approved design

1. The login replay is a load, so its stages keep the fragment skip. The ladder deletes "conditionally the 53987 replacement and
   Suppress/ReleaseQuestStageFragment" once x-acting-player is green, but the same apply path serves the login replay
   (questStageService.ts:136-151 queues every message with a quest; apply :184-229 and setStage :231-257 mark every apply for the
   sink). A replay that ran its fragments would play the world's history again on a late joiner: rewards, scene starts, MoveTo's
   of NPCs moved long ago, Enables the RefState record already carries. A save load restores done stages without fragments; the
   replay should too. So the deletion narrows: the live relay stops marking (a setting until x-acting-player is green), the sink
   replacement (FridaHooks.cpp:2433-2466) and its two natives stay for the replay, which needs a flag on the wire (read 8). This
   narrows an accepted ladder deletion: D-Q3.
2. Per-player quests already cross today, and running fragments on receivers worsens it. In mode all, IsSeatsOwnQuest
   (ActionListener.cpp:3254-3268) holds back only a start-game-enabled quest's stage 0 and its start-up stages
   (QuestStageIsEngineStart, :3297-3318; D69 B). PlayerVampireQuest 0xeafd5 is start-game-enabled (esm.py `quests`: flags
   0x0011), so its later stages are shared today; PlayerWerewolfQuest 0x2ba16 (flags 0x0008, not start-game-enabled) is in
   neither of the deploy's lists (44 denied, 4 allowed; thuum lab/deploy/sky-srv/server-settings.json), so every one of its
   stages crosses. Today a relayed stage's fragment is skipped, but the receiving seat's own quest script then runs at that stage
   with its own player (HYPOTHESIS, UNVERIFIED by any run; the cure spells of D56 A keep lab seats from ever turning). D-Q1's
   alias half (every alias is the player or lives in the player's inventory) marks the werewolf quest if its Alias_Player is
   forced to the player (esm.py shows only the alias name: UNVERIFIED until QuestScopeTest reads libespm's ALFR) and never marks
   the vampire quest, which has no alias (ADR-068's measured note). That gap is D-Q2.
3. b-quest-rumor is red today on its first claim. Its claim `server.log_count("QuestStage: actor ff[0-9a-f]+ sent .* mode all")
   >= 1` was made a claim on 11-02 (thuum 01d48082) and cannot match the server's line, ActionListener.cpp:6741-6745: "sent mode
   1 with <n> denied quests", the mode printed as a number. The same dead pattern Eli's approved b-quest-stage rewrite fixed
   (20261109-091605). UNVERIFIED by a run (no b-quest-rumor run since 01d48082 found), but the pattern settles it. W1 carries the
   fix.
4. `allowed` cannot leave the strict parser in the same push. quest_stages.rs `from_json` refuses an unknown field of the mode
   block, a refused setting falls back to the default (mode list, empty: its test
   `in_mode_all_every_quest_passes_but_a_denied_one`), and every image and T2's copy of the deployed settings read the one deploy
   file, which carries `allowed`. So 5a keeps `allowed` as a recognized, retired key (parsed, warned once, ignored) and the deploy
   files drop it in a later thuum commit.
5. Retiring OWN_START opens the new start and stop words to per-seat churn. DLC1VCController 0x0201a428 is the vampire castle's
   controller (VMAD aliases its doors, its factions and Serana; flags 0x0119, start-game-enabled and Run Once) and restarts
   itself in bursts of 32 about a minute apart on every seat (quest-stage.md, "the stage-0 report churn"); a layer quest at
   0x30002859 starts and stops about 1.3 times a second on every seat (papyrus-events.md:314-318). The rules: a stage-0 report
   is the start word's, never a stage; the server folds a word equal to its record; a client hold stops reporting a quest whose
   run state flips past a bound (the stage dedupe's idiom, questStageService.ts REPORT_REPEAT_MS); E_QUEST_CHURN is the server's
   backstop, and a held quest never enters the record, so no replay starts or stops it. x-quest-runs v1 sizes the bounds first.
6. The acting player is often absent on the receiving seat. A seat holds another player's figure only while the server streams
   that actor to it (UNVERIFIED as a rule; the CreateActor stream's behavior), so when the players are apart (common for quest
   progress) the scope resolves None: Game.GetPlayer() answers None, and the fragment's player-targeted calls are calls on None
   (HYPOTHESIS H-AP6: the VM logs, returns the empty result, the script goes on).
7. A relayed request's scope must follow the stages it sets. D-C2's relayed trigger entry runs the host's script with the guest's
   figure (SendTriggerEvent, ScriptState.cpp:1514-1580); a SetStage there must carry the guest as the acting player. And a
   relayed fragment's chained SetStage (stage 10's fragment sets 20) on the receiver must scope 20's fragment too. So the seam
   opens a quest scope when a Quest row is called inside a scoped stack, and the seat's report of that stage names the scope's
   player: the C2S QuestStage needs `acting`.
8. The client cannot tell a replay from a relay: onMessage (questStageService.ts:136-151) treats every quest message alike.
   QuestStage gains `served`, rung 4's AliasFill and WorldGlobal idiom.
9. The condition-read variables may be written where the one streamer is not. A dialogue's TIF fragment runs only on the talking
   seat (the 35225 gate drops a puppet speaker's info fragment on the others: npc-stream.md, FridaHooks.cpp's two Gum
   replacements), and the variables INFO conditions read (GetVMQuestVariable 629, GetVMScriptVariable 630; CL/T/TESCondition.h:762-763)
   are by Skyrim's design often set by earlier dialogue. One streaming seat (D-F1 C's text) would miss those writes and overwrite
   them with its own stale value. HYPOTHESIS H-CV1, settled by a static census before ScriptVariables' rule is written: D-V1.
10. Risk (c) is half read already. The 50 stage's two reds logged the host-to-be's gate ignoring NPCs that stood inside triggers
    at its own Temple load, 0.9 s before its grant, in both runs' probe drafts' headers: lab/.cache/drafts/fifty/x-trigger-owner.yaml
    v2.3 (20261107-225201: "to 38098 by 380b9", "to 4940d by 39655", "to 383f9 by 383ec", at 22:53:48Z, the grant at
    22:53:49.139Z) and x-cobweb-relay.yaml v1.4 (20261107-232023: "to 3809c by 380b7", "to 383f9 by 383f7", "to 38098 by
    380b9"). The triggers, read with esm.py: 0x3809c and 0x383f9 are defaultActivateSelfTRIG (ACTI 0x48ac0, script
    defaultActivateSelf, properties PlayerFaction and CurrentFollowerFaction); 0x38098 is the ambush box with
    MS13TriggerArvelRunSceneScript; 0x4940d is MS13ArvelShout03TriggerREF (base 0x3bc80, MS13ArvelTriggerScript) with Arvel
    0x39655 inside it. All four react to the player by their names, so the ignored NPC entries there are likely harmless
    (UNVERIFIED until the pex reads); the risk is real for NPC-reacting triggers. Unread: H-TP2, whether a second enter ever
    follows the grant.
11. Citations the ladder carries, corrected by the tree: Stack::returnValue is CL/S/Stack.h:79 (+0x70), not :77.
    GetSingleObjectPtr's loop (CallNative.cpp:134, `i < FormType::Max`, 0x8A per CL/F/FormTypes.h:279) also misses
    ActiveEffect's VM type 142 (CL/A/ActiveEffect.h:31), besides the three alias types 139 to 141. The JS wrapper stamps the
    native's declared return class (Sp3Api.cpp:331; Quest.GetAlias declares Alias in FunctionsDump.txt), and `from()` casts
    through DynamicCast's exact-name compare or its Form branch alone (CallNative.cpp:575-632), so the fix names the concrete
    class on the pooled Object (Sp3NativeValueCasts keeps the ObjectPtr with its type string), not on the JS stamp.
12. SetActingPlayer is a platform export, not a TESModPlatform native: the scope is a native table written with no game call
    (Hosted.h's idiom; setHosted, PuppetApi.cpp:357). An export needs no pex declaration and is callable from the message handler,
    where the relay arrives. The ladder's name is kept.
13. A relayed start works only for script-started quests: Quest.Start refuses an event quest (quest-stage.md, "The Story
    Manager's quests": A Lovely Letter is a CLOC event quest). The relay parks for an event quest (questStageService.ts:206-218)
    and the engine's own Story Manager start applies the parked stages (:313-334). No change; the scenario frames follow it.
14. The ladder's "the condition variable equal on both seats via script_state" needs a new step: the script-state step calls
    SerializeScriptState(ObjectReference) (TESModPlatform.psc:137) and ScriptState.cpp's Premises takes a TESObjectREFR
    (:741-762); a quest is no reference. The variables get their own pair of natives (section 1(c)).

## 0. The one question, and what done means

When one seat's game moves a quest (sets a stage, starts it, stops it), does every other seat's game move that quest the same way
within a breath, with the fragment's world effects landing on their owners, its player-targeted effects landing once on the
acting player, and the variables other seats' dialogue conditions read equal on every seat?

Done means seen (ADR-064): every claim is the other seat's screen or log. Concretely, c2 or the server, while c1 acts (and the
mirror):
1. c2's journal reads the stage done within 5 s.
2. c2's own gold and inventory are unchanged by a fragment that rewards "the player".
3. c2's platform logs "acting player ff000000 returned yes".
4. c2 reads the quest running after c1's start and stopped after c1's stop.
5. A relaunched c2 reads the world's run state and stages at its login with no fragment rerun.
6. c2's read of the condition-read variable equals c1's.
7. All of it survives a server restart (rule 6).
8. The server's record holds c1's reward once.

The three folded platform fixes, each claimed on the other seat: (a) a seat's own MS13 aliases read as references, and a relayed
AliasFill applies on the receiver; (b) the gate's "ignored" line prints per trigger; (c) an entry held at a load is read first, a
fix only after (rule 8).

## 1. Per layer

### The rule, per piece of state

| Piece | Owner | Observed at | Crosses as | Rung | A non-acting seat |
| --- | --- | --- | --- | --- | --- |
| A quest's stages done | Nobody (D-F1 C); the server's record | the platform's questStage event (EventHandler.cpp:1215-1241) on the seat whose engine set it | QuestStage 57, no word | R0 record, R1 feed (QUST, INDX, mode, class, rate) | SetStage; live, its fragment runs under the acting scope; served (replay), the fragment skipped (D-Q3 A) |
| A quest's run state | Nobody; the server's record (`questRuns`, new) | questStart and questStop (EventHandler.cpp:1243-1269) | QuestStage 57, word 1 or 2 | R0 record, R1 feed (as above plus the fold and the churn bound) | Quest.Start or Stop under the echo guard; an event quest parks |
| A request's acting player | The server names players (finding 13) | the report's `acting` (a scope's player) or its sender | QuestStage 57 `acting`, S2C | R0 word; the reported `acting` is R2 (the server checks it names a connected player) | resolves the figure (None if absent) and scopes the request's stacks |
| A fragment's player-targeted effect (an item, a spell, a move of "the player") | The acting player's own seat, by its own fragment run | that run | its own channels (inventory R0, actor values R1) | as each row | lands on the figure (not owned: cosmetic) or None, never its own player |
| A fragment's world effect (Enable, MoveTo, AddItem to a world container) | The subject's owner | the seam (rungs 2 to 4) | ScriptCall 75 and the records | R2 | behind the native gates, unchanged |
| Objectives shown or completed | Each seat's engine, from the fragment every seat runs | none | nothing | R3 per seat, equal by construction; D-F1 C's objective record is not built: a declared gap | its own fragment run |
| A condition-read variable (CTDA 629/630) | Nobody; streamed per D-V1 | the streamer's 1 s read (ReadScriptVariables) | ScriptVariables 81 | R2 (the streamer's engine's word, recorded, never judged) | WriteScriptVariables |
| A per-player quest (D-Q1) | Its player's seat | its own events | nothing (E_QUEST_PLAYER; in the login's never-report list) | R3 for every other seat | never applies it |
| An entry held at a load (risk c, D-W3) | The presser's owner, once decided | the gate | nothing new: SendTriggerEvent's body on the owner | R2 | n/a |

### (a) Wire: wire-schema, wire-validate, wire-json, the C++ structs (rule 4, one commit)

QuestStage (MsgType 57, wire id 65; wire/wire-schema/src/skymp.rs:970-1004) gains three optional fields:
- `word: Option<u8>`: QUEST_START 1 or QUEST_STOP 2; absent means a stage (ADR-068's "word u8").
- `acting: Option<u32>`: the acting player's actor id. S2C the server's stamp; C2S the scope's player when the seat's stage was
  set inside a scope, absent meaning the sender.
- `served: Option<bool>`: S2C, true for the login replay.
An absent field renders no key (Activate's `entry`, skymp.rs:414-438), so fixtures 57-QuestStage-0 and -1 stay valid byte for
byte. Row cap stays 2 KiB (lib.rs:714).

check_quest_stage (wire-validate lib.rs:688-702) refuses, E_VAL_RANGE: a word other than 1 or 2; a word with a stage other than
0, or with the login's list (quest 0); an `acting` below 0xff000000 (players' actors are server ids). C2S (:1525-1532) also
refuses `served` true, E_VAL_RANGE. Words share `quest_stage_budget` (32 then 8 a second, :281; UNMEASURED, x-quest-runs v1
reads it).

ScriptVariables (MsgType 81, wire id 89, both directions, reliable): `{ t: MsgT<81>, epoch: u32, watch: Vec<ScriptVarKey,
SCRIPT_VARIABLES>, entries: Vec<ScriptVarEntry, SCRIPT_VARIABLES>, served: bool }`; `ScriptVarKey { form: u32 (a QUST or a REFR
of the load order), script: String<PAPYRUS_NAME>, var: String<PAPYRUS_NAME> }`; `ScriptVarEntry` the key plus `k: u8, i:
Option<i32>, f: Option<f32>, b: Option<bool>`, rung 3's folded kinds 3 (int), 4 (float), 5 (bool) only (a CTDA compares a
number). `cap::SCRIPT_VARIABLES` 256 (UNMEASURED; ctda-vars.py sizes it). Row 32 KiB. check_script_variables refuses, E_VAL_RANGE:
a form 0 or at 0xff000000 and up, an empty name or one with a NUL, a key named twice, a k outside 3 to 5 or a payload not its k's;
E_VAL_NONFINITE a non-finite f; from a client, a non-empty `watch`, `served` true, or epoch 0 (E_VAL_RANGE). Budget
`script_variables_budget` 4 then 1 a second (WorldGlobal's shape, UNMEASURED).

SCHEMA_VERSION 40 to 41 (lib.rs:111, its doc line); the variant after WorldGlobal (lib.rs:614-620); its TABLE row
`row("ScriptVariables", 81, 32 * KIB, Both)` after :759; wire id 89 beside :874-875; WIRE_IDS 89 to 90 (:761); wire-json's family
list (wire-json/src/lib.rs:76-80) gains 81 and its count test 80 to 81 (:360). Fixtures: 57-QuestStage-2 (a relayed start of
0x10d3bb with acting 0xff000000), 57-QuestStage-3 (a stop word with stage 10, refused), 57-QuestStage-4 (a served stage),
57-QuestStage-5 (a client's served true, refused), 81-ScriptVariables-0 (a streamer's report), 81-ScriptVariables-1 (the login's
watch and served values), 81-ScriptVariables-2 (k 2, refused). C++: QuestStageMessage.h gains `std::optional<uint32_t> word,
acting; std::optional<bool> served` (a u8 as u32, rung 3's precedent); ScriptVariablesMessage.h, MsgType.h 81, REGISTER_MESSAGE,
PacketParser's case beside :255; WireJsonContractTest reads them (the fixture and its struct in one commit: memory
fork-wire-fixture-pairing). Clippy's `-D missing-docs` grepped before the push. docs/WIRE.md: QuestStage's paragraph (:342-372)
gains the three fields; a new ScriptVariables section after WorldGlobal's. Netcode's protocol id carries the schema, so 5a never
stages under canon's client: the server and the seats build from one tree.

### (b) Server: wire-rules and the core

wire-rules quest_stages.rs (replaces part of the module): delete `is_allowed` and D62's `allowed` semantics; the parser still
accepts `allowed` as a retired key (read 4). In mode all `listed()` becomes denied ∪ the player class (composed by the bridge), so
a client never reports a per-player quest. QUEST_RECORD_CAP, `merge`, `at_login` unchanged.

wire-rules quest_runs.rs (new): `QuestRun { quest, running, seq }`; `judge(record, quest, word, seat, now_ms) -> Verdict {
Record { seq }, Fold, Churn }`, a stage-0 report judged as a start (read 5); churn RUN_FLIPS 6 per RUN_WINDOW_MS 60000 per (quest,
seat), a churned quest held out of the record for the session (UNMEASURED; x-quest-runs v1 sets both); RUN_RECORD_CAP 2048
refused by name (E_QUEST_FULL's sibling, E_QUEST_RUNS_FULL); `at_login(record) -> (starts, stops)` in record order.

wire-rules quest_scope.rs (new, D-Q1's alias half; ADR-020's shape: Rust over facts the world gathers): facts per alias from
libespm's QUST::Alias (W/libespm/include/libespm/QUST.h:110-170: `aliasForcedReference`, `aliasUniqueActor`, `aliasCreatedObject`
with `createAt`, `forcedIntoAlias`, `externalAlias`, `locationAlias`); `class(aliases) -> Player | World`, Player only when the
list is non-empty and every alias is forced to the player's reference 0x14, or the player's unique actor (NPC_ 0x7 Player, esm.py
`find`), or created in or filled from an alias that is the player; a location alias or no alias makes the quest World, by the
rule's words. Gated by the setting `questScope` ("off" default measures only, "aliases" acts: D-Q2).

wire-rules script_variables.rs (new): the watch list from the setting `conditionVariables` (FormDesc keys, ctda-vars.py's output);
`judge` is world_streamer's judgment (epoch first: world_streamer.rs, whose header already says "rung 5's ScriptVariables reuses
the same election") under D-V1 A, any seat with a per-key sequence under B; the record keeps the latest value per key, folds an
equal one, VARIABLE_RECORD_CAP 1024; refusals by name E_SCRIPTVAR_EPOCH, _OWNER, _UNLISTED, _KIND. The election's gate in PartOne
widens from `worldGlobals` to `worldGlobals || !conditionVariables.empty()`; the stream word stays WorldGlobal 80's, unchanged.

No change to natives_table.rs or NativeRows.inc: the Quest rows (natives_table.rs, "the flip's everyone rows ... (rung 5)") and
Game.GetPlayer's Local row stay; only their comments change to "built". Bridge types beside SharedQuests (wire-bridge
rules.rs:2355-2380, :3463-3500).

The core:
- OnQuestStage (ActionListener.cpp:3331-3464): delete the OWN_START block (:3386-3411), IsSeatsOwnQuest (:3254-3268) and
  QuestStageIsEngineStart (:3297-3318), the ladder's retirements (the stage-0 refusal with them); keep QuestHasStage
  (:3275-3291) for stages; CheckSharedQuest's denied refusal first, then E_QUEST_PLAYER (questScope "aliases"); the word branch:
  quest_runs' judge, the journal's record, the relay to every other connected seat with the word and `acting`, its line
  "[verb:quest-stage] <actor> starts|stops <quest>: recorded, relayed to <n>", a fold at debug, E_QUEST_CHURN once a minute per
  seat. `acting` stamped: the report's own when it names a connected player's actor, else the reporter (E_QUEST_ACTING once a
  minute per seat). The stage line "[verb:quest-stage] {:x} set {} stage {}: recorded, relayed to {}" (:3461) byte for byte:
  b-quest-stage, b-quest-rumor and b-quest-stage-restart grep it. R0 record, R1 feed as before; the reported `acting` is R2.
- SendQuestStages (:6695-6746): the order becomes the list message (unchanged; mode all names denied ∪ player), served start
  words for recorded-running quests, served stages (no acting), served stop words for recorded-stopped quests; the
  start-game-enabled skip (:6729-6737) deleted. The login line (:6741-6745) byte for byte, with one beside it: "QuestStage: actor
  <id> sent <n> running and <m> stopped quest(s) around the stages after a login".
- The record (rule 6): MpChangeFormREFR (the journal, PartOne::WorldJournal, PartOne.cpp:3654) gains `std::optional<std::vector<
  QuestRun>> questRuns` and `std::optional<std::vector<ScriptVariableRecord>> scriptVariables` beside questStages
  (MpChangeForms.h:265) and aliasFills (:394-420), inside ToTuple (:455-462); keys "questRuns" and "scriptVariables" beside
  MpChangeForms.cpp:536-543, :827, :1220-1239; an absent key reads none, formVersion kept (fb0c3396's shape). PartOne's getter
  and setter for each beside GetQuestStages (:3676-3684).
- OnScriptVariables and SendScriptVariables: the login serve after SendWorldGlobals (PartOne.cpp:641), the watch list then the
  served values. Relays immediate (SendToUser), never the deferred queue.
- labState bindings (PropertyBindingFactory.cpp:55-62): `questRuns` and `scriptVariables` on the journal.
- The measurement, in the log at every start: "[verb:quest-stage] quest scope (aliases): <n> quest(s) per player: <ids>; <k> on
  the denied list, <m> on the allowed list" (D-Q1's "measured against today's lists").

### (c) Platform: the scope, the natives, the three fixes

The acting scope (new SP/ActingScope.h and .cpp, Hosted.h's idiom: mutex-guarded, written with no game call, gated by one atomic
`Any()`):
- `Request(quest, stage | START | STOP, figure, serverId, ttl)`: written by the export and by the seam's propagation.
- `Arm(subject, figure, serverId, ARM_MS)`: by the sink at a request's event, by the export for a relayed start or stop, by
  SendTriggerEvent for a relayed entry.
- `Join(stack)`: at a stack's first native call inside an armed window, keyed by its root frame's self (previousFrame,
  CL/S/StackFrame.h:22, walked at most Stack::frames, Stack.h:75, times; FormIdOfHandle, ScriptNatives.cpp:393). A quest's
  fragments and its alias scripts carry the quest's id there (HYPOTHESIS H-AP1; the alias half is H-AF3's encoding). A joined
  stack keeps the scope for its life (JOINED_MS 120000).
- `Of(stack)` answers `{figure, serverId}` or nothing. Bounds: 256 requests, 64 arms, 256 joined stacks, oldest dropped; ARM_MS
  2000 (UNMEASURED).

OnCall (ScriptNatives.cpp:1156) gains step (0), one relaxed load when no scope exists, for every native (not only tabled ones,
since a PlayerRef property is a 0x14 self on any native: finding 5). Under `Any()`: the platform's own (step (b)'s direct and live
tests, evaluated first here) is never scoped; the frame must be the native's own (top->owningFunction == fn); `Of(stack)`; every
self or Object argument that is 0x14 (IsPlainFormHandle and FormIdOfHandle, :388-397) is rewritten in the frame to the figure,
through the engine's accessor for arguments (104484, Stack::GetStackFrameVariable) and `top->self` (StackFrame.h:27), the figure
packed by CommonLib's PackHandle (CL src/RE/P/PackUnpack.cpp:48-80) with ActorCharacter's VM type, or SetNone when absent
(HYPOTHESIS H-AP4); Game.GetPlayer's row (the Local branch, :1214-1218) sets `marks.swapReturn`; a Quest row (the Everyone branch,
:1221-1228) inside a scoped stack calls `Request(quest, stage | word)`, SetCurrentStageID's args[0] read through 104484 (read 7's
propagation). Each swap counted " (acting)" (kCountSuffix :325).

NativeCallReplacement (:1669-1692): after the original returns kCompleted with `swapReturn`, write `stack->returnValue`
(Stack.h:79) with the figure or None (HYPOTHESIS H-AP2, the same contract SetEmptyResult relies on, :1624). Line: "[verb:quests]
acting player <serverId> returned yes|no (absent here, None): Game.GetPlayer in <script>.<handler>, stack <id>", the first three
per scope and every hundredth. Game.GetPlayer's entry is the table's bound IFunction (the bound-natives recorder), never an id.

The sink (FridaHooks.cpp QuestStageSinkReplacement :2433-2466): beside the suppress mark it consumes the pair's acting request,
arms the quest for ARM_MS, runs the original, so the fragment runs. A pair holding both a suppress mark (a replay) and an acting
request: suppress wins. Lines: "[verb:quest-stage] fragment of <q> stage <s> runs for acting player <serverId> (relayed|chained)".

SendTriggerEvent (ScriptState.cpp SendTriggerImpl :1514-1580): a figure presser (an actor at 0xff000000 and up) arms the
trigger's own scope before the send, so `akActionRef == Game.GetPlayer()` holds on the host for the guest's figure (D-C2's own
note, DECISIONS.md's D-W1 and D-C2 paragraph).

Exports (PuppetApi.cpp beside setHosted :357): `setActingPlayer(questId, stage, figureLocalId, serverId, ttlMs) -> boolean`
(stage -1 a start, -2 a stop) and `getActingPlayer(questId, stage) -> number` (the scope's server id that set it here, 0 for
none). Declared in Definitions.txt (beside :1824), the regenerated skyrimPlatform.ts, and clientListener.ts's augmentation
(beside :240) (memory skyrim-platform-new-event-types: functions need the augmentation too, as setHosted's does).

Two new natives (rule 10), ScriptState.cpp, beside rung 3's:
- `TESModPlatform.ReadScriptVariables(String keysJson) -> String`: the handle of a QUST or a REFR from the policy
  (CL/I/IObjectHandlePolicy.h:33), AttachedObjects under attachedScriptsLock (ScriptState.cpp:432-452), the variable found by name
  through the chain's GetVariableIter (CL/O/ObjectTypeInfo.h:151) at its positional index (Object.h:49), folded as EncodeScalar
  does (:538); answers `[{form, script, var, k, i|f|b}]` or a refusal per key.
- `TESModPlatform.WriteScriptVariables(String entriesJson) -> String`: Variable's setters (CL/V/Variable.h:71-79), refusing a
  kind other than the declared.
Both on the update thread inside TESModPlatform.Add's Call (rung 3's thread note), no C++ exception leaving them. .psc lines
beside TESModPlatform.psc:155; the pex by `lab/pex.py add-native`, checked by `lab/pex.py dump | grep` (memory
skyrim-platform-native-needs-pex-declaration); registration beside PapyrusTESModPlatform.cpp:2101-2104.

NATIVES.md lines (rule 10): `TESModPlatform.ReadScriptVariables` R2 quest-stage, "Client only: the listed (form, script,
variable) values of a quest's or a reference's attached scripts, read by name under attachedScriptsLock; the world streamer's
read for ScriptVariables 81 and the lab's script-vars step"; `TESModPlatform.WriteScriptVariables` R2 quest-stage, "Client only:
a served or relayed ScriptVariables entry written by name through Variable's setters; refuses a kind other than the declared".
Reason updates: `Game.GetPlayer` ("inside an acting scope the seam swaps its result for the acting player's figure, None when
absent"); `Quest.SetCurrentStageID`, `Start`, `Stop` ("reported as QuestStage 57's stage and words from the platform's events;
inside an acting scope the seam carries the scope to the stage it sets").

Fix (a), the alias return path (CallNative.cpp GetSingleObjectPtr :115-161): when the form loop at :134 finds nothing, try
CommonLib's named non-form types, never a literal: BGSRefAlias::VMTYPEID (CL/B/BGSRefAlias.h:18), BGSLocAlias::VMTYPEID
(BGSLocAlias.h:13), BGSBaseAlias::VMTYPEID (BGSBaseAlias.h:15), ActiveEffect::VMTYPEID (CL/A/ActiveEffect.h:31). An alias's
concrete class comes from BGSBaseAlias::GetVMTypeID (CL src/RE/B/BGSBaseAlias.cpp:13-23, its QType virtual), named through the
VM's type table, so the pooled Object is ("ReferenceAlias" or "LocationAlias", ptr) and DynamicCast's exact compare (:591) answers
`ReferenceAlias.from(quest.getAlias(n))`. DynamicCast gains an alias branch beside its Form branch (:612-629) for the up-cast,
through the same GetVMTypeID. AnySafeToVariable's non-form path (:50-70) already packs by the class's VM type (HYPOTHESIS H-AR2:
FindBoundObject finds a scripted alias's object by its parent class, so PackHandle, PackUnpack.cpp:56-78, binds no second
object). A line once per class: "[verb:scripts] a native returned a <declared> (VM type <n>): handed to JS as <concrete>".
Replaces nothing; unblocks AliasFillService's apply (aliasFillService.ts:263-266) and the driver's alias step
(lab/driver/src/index.ts:2153-2168).

Fix (b), the gate's cap per trigger (FridaHooks.cpp :668-674 exempted, :677-683 ignored, :706-718 told): each line due per
(kind, trigger) through a TriggerLineDue twin of FurnitureLineDue (:1093-1104: a mutex map cleared past 1024 keys); the text byte
for byte, "(<n> so far)" still the process-wide count; the mutex taken on those three branches alone (rule 9). And Frida::SetCellHosted
(:241-249) gains "[verb:cell-host] SetCellHosted(<cell>, <bool>): <n> cell(s) hosted here", so the grant and the gate's lines
order in one platform log, which risk (c)'s read needs.

Risk (c): no code before x-trigger-preload v1 reads it (rule 8); the sketch is in section 5 and D-W3.

### (d) Client

questStageService.ts: reports run words from questStart and questStop (subscribe "questStop" beside :128), through reports()
(:488), never for a denied or player-class quest, with acting = getActingPlayer(quest, -1 or -2), under the churn hold (RUN_FLIPS
in RUN_WINDOW_MS per quest on this seat, logged "quest <q>'s run flipped <n> times in <s> s here: held, not reported (churn)").
Reports stages as today (:336-357) plus `acting` = getActingPlayer(quest, stage). Applies a relayed word: a start through
quest.start() (latent), parked if refused (an event quest, read 13); a stop through quest.stop(); both under an echo mark on
(quest, word) consumed at the engine's event like `applying` (:353). Before a live apply, setActingPlayer with the acting player's
figure (remoteIdToLocalId, W/skymp5-client/src/view/worldViewMisc.ts:37, 0 when absent), skipped when acting is this seat's own
actor. The live path stops calling SuppressQuestStageFragment (:260-275) when the setting `questFragmentLive` is true (default
false until x-acting-player v1 is green: the H-A1 fallback is the default); a served apply always marks the replay. Words applied
in the server's order: starts, stages, stops.

ScriptVariablesService (new, worldGlobalService.ts's shape): the stream word read from WorldGlobalService through
`controller.lookupListener` (hostService.ts:674's idiom); the streamer reads its watch list once a second through
ReadScriptVariables and sends changed keys under its epoch; non-streamers diff too and log "listed variables changed here, not
reported: <n>" every 30 s (D-V1's lab evidence under option A); receivers apply relays and the login serve through
WriteScriptVariables, 32 per update. questStageMessage.ts gains `word?`, `acting?`, `served?`; scriptVariablesMessage.ts new;
anyMessage, events, networkingService dispatch, messages.ts (MsgType 81). Settings: `questRuns` (default true),
`questFragmentLive` (default false), `scriptVariables` (default true). AliasFillService needs no change (fix (a) is what it waited
for).

### (e) Lab: lab-api, lab-driver, the gamemode, the tools

- lab-driver (lab/driver/src/index.ts): `script-vars {form, keys: ["<script>::<var>"]}` through ReadScriptVariables;
  `quest-objectives {quest, objectives: [i]}` through Quest.IsObjectiveDisplayed and IsObjectiveCompleted (the seat's Papyrus
  natives); `quest-stage` unchanged (its `running` exists, :2078-2096).
- lab-api (lab/labapi/labapi/assertions.py): `c.script_vars(form).value(key)`, `c.quest(q).objectiveDisplayed(i)` beside QuestView
  (:1280-1310); `server.quest_runs(q).running` and `.seq` (labState kind questRuns); `server.quest_record(q).stageDone(n)` (kind
  questStages, so a claim reads the record instead of a line); `server.script_variables().value(form, key)` (kind
  scriptVariables); grammar lines at :60-100.
- The gamemode (lab/gamemode/gamemode.js, beside worldGlobals :391 and aliasFills :414): the kinds questRuns, questStages,
  scriptVariables; CONTRACT.md beside :200-230.
- Tools (sky-srv, where the archives are; papyrus-census.py's pex reader and bsa-extract.py): lab/tools/ctda-vars.py (INFO and
  SCEN CTDA 629/630 to (form, script, variable), with each variable's writers by kind: QF fragment, quest script, TIF fragment,
  other; the CTDA string parameter is CIS2 by UESP's format page, UNVERIFIED until the tool's first dump); lab/tools/quest-census.py
  (finding 5's census: per quest and per world trigger D-C2 reaches, the scripts calling Game.GetPlayer, the scripts with an Actor
  property valued 0x14, and those comparing one of them by opcode; D-Q1's refinement: per quest, the subjects of its scripts'
  state natives). Output to lab/.cache/census/.
- lab/frida/acting-frame.js (new): native-frame.js's attach on 104651 (`just addr` 0x143dc00, already pinned there) filtered to
  Game.GetPlayer by the IFunction's own names as native-frame.js reads them; per GetPlayer row, the stack's root frame: its
  owningObjectType's name, its owningFunction's name, its self's handle kind, mid and low 32, and its returnValue after the call.
  Attach only, no engine call from a listener.
- Deploy (thuum main): server-settings.json and -1.7.104.json gain `conditionVariables` (generated by ctda-vars.py) and
  `questScope: "off"`, plus D-Q2 A's two denied rows if Eli takes A; the probes set `questFragmentLive` through relaunch files.

### (f) Probes and scenarios (claims in section 3)

Premises on canon, before any build: x-quest-runs v1, x-acting-frame v1, x-trigger-preload v1. On 5b's head: x-alias-return v1,
x-trigger-owner v2.5 and x-cobweb-relay v1.6, x-acting-player v1, x-quest-words v1. Reruns: x-alias-premise v1, x-golden-claw-alias
v1, x-skip-latent v1. Committed, each its own commit: b-quest-stage-two-seats v1 (new; ADR-063's named first scenario, rule 6's
restart leg), b-quest-rumor v2 and b-quest-stage-restart v2 (W1).

### Commits, inside-out

| # | What | Proof |
| --- | --- | --- |
| A1 | quest_runs, quest_scope, script_variables, the quest_stages change, the bridge | crate tests and proptests |
| A2 | questRuns and scriptVariables on the journal, their migration | T0 ChangeFormTest, QuestRunTest |
| A3 | rule 4 in one commit: SCHEMA 41, QuestStage's three fields, ScriptVariables 81, validators, fixtures, C++, MsgType, PacketParser, WIRE.md | `cargo test --workspace`, clippy, WireJsonContractTest |
| A4 | handlers: OnQuestStage's words, acting, the fold and E_QUEST_PLAYER; SendQuestStages' order; OnScriptVariables and SendScriptVariables; the bindings; the scope's startup line; the retirements | T0 QuestStageTest v2, QuestScopeTest, ScriptVariablesTest |
| A5 | T2 sessions quest-stage.yaml v2 and script-variables.yaml | `just test-proto` |
| B1 | platform fixes (a) and (b), the SetCellHosted line | T1 (the Windows build) |
| B2 | ActingScope, the OnCall step, the return swap, the propagation, the sink's arm, SendTriggerEvent's arm, the exports, the census suffix | T1 |
| B3 | ReadScriptVariables and WriteScriptVariables: psc, pex, NATIVES.md | T1; `lab/pex.py dump` greps both |
| B4 | client, as (d) | tsc and webpack; one Windows head for B1 to B4, then a fresh review |
| L1 | lab grammar, gamemode kinds, the tools, acting-frame.js (thuum, LABAPI=<id>) | thuum pipeline |
| L2 | b-quest-stage-two-seats v1 (own commit); W1's two rewrites (own commits, Eli first) | T3 |
| D1 | quest-stage.md's rung 5 sections; papyrus-events.md's pointer; trigger-entry.md (b, c); vampirism.md (D-Q2); STATE.md:98-105's channel column; docs/engine/scripts.md rows S13 and up as reads land (ADR-064 amendment C); NATIVES.md by `just ledger` | review |

## 2. The hypotheses register

| id | claim | the one observation that settles it | read by |
| --- | --- | --- | --- |
| H-AP1 | A relayed stage's fragment stack has a root frame whose self is the quest's script object (low 32 the quest id, mid 0xFFFF), and its handler is the QF script's Fragment function | acting-frame.js's GetPlayer row on c2: root self low 32 == 0x74a83, root function Fragment_N | x-acting-frame v1 |
| H-AP2 (rung 5's H-A1) | A returnValue written after the original's kCompleted is what the calling script reads | c2's "acting player ff000000 returned yes" line followed by the fragment's AddItem counted " (acting)" on the figure, c2's own gold unchanged | x-acting-player v1 |
| H-AP3 | The arm window joins only the relayed fragment's stacks | per arm, joined stacks equal the fragment's (acting-frame.js counts distinct stack ids per arm); no join outside a request | x-acting-player v1 (recorded) |
| H-AP4 | A 0x14 self or argument rewritten to the figure dispatches on the figure | the census " (acting)" row naming the figure, no "Cannot call ... on a None object" for a present figure | x-acting-player v1 |
| H-AP5 | Step (0) costs nothing measurable outside a scope | census totals per window with no scope against the 50 stage's; frame time (client-frametime.sh) recorded | x-acting-player v1 (recorded) |
| H-AP6 | A call on None from an absent figure logs and returns the empty result; the script goes on | leg B: the fragment's later stage and objective set on c2 after its None calls | x-acting-player v1 |
| H-AP7 | Scoping a relayed entry lets a player-comparing world trigger pass for a guest's figure | leg C: the host's run of the trigger's handler takes its player branch for c2's figure (needs the pex read of defaultActivateSelf or MS13TriggerArvelRunSceneScript first) | x-acting-player v1 leg C (recorded) |
| H-QR1 | Outside a few self-restarting controllers, a quest's run state flips fewer than 6 times a minute per seat | the driver's console-tee questStart and questStop lines and the census's "Quest.Start on <id>" rows, per quest per seat | x-quest-runs v1 |
| H-QR2 | A relayed start of a script-started quest starts it on the receiver; an event quest's parks; the echo is consumed | c2's running() within 5 s; no report line from c2 | x-quest-words v1 |
| H-QR3 | A relayed stop stops the quest on the receiver | c2's running() false within 5 s | x-quest-words v1 |
| H-QR4 | The replay's stages skip their fragments | the relaunched c2's "fragment of <q> stage <s> ... skipped" line and its own gold unchanged | b-quest-stage-restart v2 |
| H-CV1 | Each listed condition-read variable has a writer every seat runs (a QF fragment or the quest's script), not only a TIF fragment | ctda-vars.py's writer census (static) | before A1's script_variables rule |
| H-CV2 | ReadScriptVariables and WriteScriptVariables reach a quest script's variable by name, and a written value is what GetVMQuestVariable reads | c2's script-vars read equal to c1's after the relay | b-quest-stage-two-seats v1 |
| H-QS1 | D-Q1's alias half marks PlayerWerewolfQuest 0x2ba16, and nothing on the denied or allowed lists | QuestScopeTest on Skyrim.esm | T0 |
| H-QS2 | The refinement (the quest scripts' state natives' targets) marks PlayerVampireQuest 0xeafd5 | quest-census.py | static |
| H-QF1 (open since 10-29) | One stage event per stage, not one per log entry | quest-stage-chain.js's 53987 count per stage | x-acting-frame v1 (recorded) |
| H-AR1 | HandleIsType(140 or 141, an alias handle) holds, Resolve gives the alias, GetVMTypeID names the concrete class | c2.alias(0x39645, 1).refr == 0x39655 | x-alias-return v1 |
| H-AR2 | A ReferenceAlias packed by its concrete type takes ForceRefTo, no second bound object made | c2's "alias <q>/<a> filled with <refr> (relayed)" line and the alias step reading the new reference | x-alias-return v1 |
| H-TP1 (half read, read 10) | An NPC inside a trigger at its host's load enters before the grant and is ignored | trigger-entry-trace.js's sink and blanked dispatch rows before the new "SetCellHosted(371de, true)" line | x-trigger-preload v1 |
| H-TP2 | No second enter follows the grant while the NPC stays inside | the trace's absence of a later sink row for the pair until its leave | x-trigger-preload v1 |
| H-Q1 (standing) | A relayed SetStage runs the fragment pipeline on the receiver | x-script-natives v7 062800's skip line | kept |
| H-F2 (open) | A skipped latent record row leaves no stack waiting | c2's quiescent read within 1 s of its skipped line | x-skip-latent v1 rerun (unblocked by fix a) |

## 3. The tests

T0:
- wire-rules crate: quest_runs (a start of a running quest folds; a stop of a stopped one folds; stage 0 is a start; the flip
  bound gives Churn and holds the quest out of the record; at_login orders starts, then stages, then stops; the cap); quest_scope
  (alias facts to class as in (b); a proptest over arbitrary facts never panics); quest_stages (`allowed` parsed and ignored with
  a warning; `listed()` in mode all is denied ∪ player); script_variables (the streamer at its epoch, StaleEpoch, FutureEpoch,
  NotOwner; kinds; the fold; the cap).
- wire-validate: check_quest_stage's word, acting and served cases; check_script_variables; proptests (.claude/rules/rust.md: no
  panic from a packet).
- unit/QuestStageTest.cpp v2: replaces the D62 and D69 case (:340) (a start-game-enabled quest's stage 0 is the start word's: the
  run recorded, no stage, no E_QUEST_ line; its start-up stage recorded like any other); a start recorded and relayed with the
  reporter as acting; a repeated start folded (no relay); a stop relayed; a denied quest's word refused E_QUEST_DENIED;
  E_QUEST_PLAYER under `questScope` "aliases", none under "off"; a report's acting relayed as reported; an acting naming no
  connected player stamped as the reporter, E_QUEST_ACTING; the login: the list, starts (served), stages (served), stops (served),
  the old line byte for byte plus the runs line; the restart keeps questRuns (:417's shape).
- QuestRunTest: questRuns round-trip; an older journal reads none; a churned quest never in the record.
- QuestScopeTest (Skyrim.esm through GetPartOne(), AliasCreatedTest's idiom): PlayerWerewolfQuest 0x2ba16 Player (H-QS1);
  PlayerVampireQuest 0xeafd5, MS13 0x39645, FreeformRiverwood01 0x74a83, DB01Misc 0x1ea4f World; none of the 44 denied and 4
  allowed ids (pinned as constants from the deploy file) Player.
- ScriptVariablesTest: the streamer's report recorded and relayed; a non-streamer refused; served at login after SendWorldGlobals;
  kept across a restart; an unlisted key refused.
- WireJsonContractTest: the seven new fixtures.

T2 (difftest, move and send steps only, no restart step: W/skymp-wire/difftest/src/main.rs:203-212):
- quest-stage.yaml v2: c1's stage 10 of 0x74a83 relayed to c2, now with acting (re-recorded in the divergences); c1's start of
  0x10d3bb relayed to c2; the same start again folded; c1's stop relayed; MQ102's stage and its start refused E_QUEST_DENIED,
  nothing relayed; a word 3 and a client's served true refused at the edge.
- script-variables.yaml (new, world-global.yaml's frame, no movement so nobody elected): the edge refusals (k 2, a duplicate key, a
  client's watch, served true, epoch 0) and a report nobody streams, E_SCRIPTVAR_OWNER, nothing sent. The live stream is T0's.
- The other 49 sessions unchanged.

T3, premises on canon (ADR-064 amendment B: each a short run before the build that rests on it):
- x-quest-runs v1. ONE QUESTION: how often does each quest's run state change by itself on an idle seat, in Riverwood and in
  Bleak Falls Temple? Frame: both seats idle 150 s at Riverwood's landing, then 150 s in the Temple's hall. Claims (premises
  only): both seats in the cells; at least one census line per seat. Recorded: each quest's questStart and questStop counts per
  60 s per seat (the driver's console tee), the census's Quest.Start and Stop rows by self, the vampire castle controller's
  bursts. Its read sets RUN_FLIPS, RUN_WINDOW and W1's controller lines.
- x-acting-frame v1. ONE QUESTION: on a seat that applies a relayed stage with its fragment let run, whom does the fragment's
  Game.GetPlayer() name, and what does its stack's root frame hold? Frame: both seats placed into Riverwood (so each seat's Story
  Manager starts A Lovely Letter), c2 relaunched with questFragmentSuppress false and acting-frame.js armed, then c1's console
  `setstage 74a83 <N>` for the stage whose fragment gives Gold001 0xf (N from `lab/pex.py disasm` of QF_FreeformRiverwood01_00074A83
  before the draft: UNVERIFIED). Claims on c2: the stage done; a GetPlayer row whose root self's low 32 is 0x74a83 and whose root
  function is Fragment_* (H-AP1). Recorded: c2's own gold before and after (finding 5's doubled reward, today's defect), H-QF1's
  event count.
- x-trigger-preload v1 (risk c's Dynamic read). ONE QUESTION: after the host-to-be's grant, does the engine raise a second
  OnTriggerEnter for an NPC that stood inside a trigger at the load? Frame: c1 alone enters the Temple (its first load, so it
  becomes the host) with trigger-entry-trace.js; c2 waits at lab-spawn; the ambush draugr stand still until woken, so they stay
  inside. Claims (premises): the trace's ready row valid (argOk, enterSinkOk); c1's "hosting cell 371de" line. Recorded: per
  (trigger, NPC) the sink rows before and after the grant, the dispatch rows' blanks, leave rows; the order against c1's client
  log time (UNVERIFIED that the trace's `t` and the log share a clock: both read the seat's wall clock). The static half first:
  `lab/pex.py disasm` of defaultActivateSelf, MS13TriggerArvelRunSceneScript and MS13ArvelTriggerScript for whether each reacts
  to an NPC's entry.

T3 on 5b's head (after its fresh review):
- x-alias-return v1. ONE QUESTION: does a native that returns an Alias now hand JS the alias, as its concrete class, on both
  seats? Claims: c1.alias(0x39645, 1).refr == 0x39655 and c2's the same; both seats' alias 11 != 0; a location alias of MS13
  answers "is no reference alias" with its name (which alias is a location alias is UNVERIFIED; the step's answer says); c2's
  "alias <q>/<a> filled with <refr> (relayed)" at least once from the fills a guest's arrival makes (57 measured on 11-03), and
  no "no reference alias" line on either seat.
- x-trigger-owner v2.5 and x-cobweb-relay v1.6 (the next versions of the v2.4 and v1.5 drafts in lab/.cache/drafts/fifty): one
  change each, restoring the claims v2.2 and v1.3 made on c1's gate line "OnTriggerEnter to <web or plate> by ff...: not this
  seat's presser, ignored (D-W1)", now due per trigger. A strengthening, reviewed fresh.
- x-acting-player v1 (the ladder's). ONE QUESTION: when one seat sets a stage whose fragment rewards "the player", does the
  other seat's run of that fragment name the acting player and leave its own player unrewarded? Frame: x-acting-frame's, with
  questFragmentLive true on both seats. Leg A (c1's figure beside c2): c2's "acting player ff000000 returned yes" for 74a83;
  c2.inventory(0x14).count(0xf) unchanged (UNVERIFIED that the inventory step reads the player as `form(0x14)`; else
  server.inventory("c2")); server.inventory("c1").count(0xf) up by the reward once; c2.quest(0x74a83).stageDone(N);
  c2.quest(0x74a83).objectiveDisplayed(i) when the fragment shows one (D-F1 C's fragment seen running on the other seat). Leg B
  (c1 teleported out of Riverwood before the set): c2's "acting player ff000000 returned no (absent here, None)", c2's gold
  unchanged, the stage done. Leg C (recorded, only if the pex read shows a player compare): c2, the guest, walks into
  defaultActivateSelfTRIG 0x3809c while c1 hosts; c1's run takes the player branch for c2's figure and the draugr wake on both
  screens. No E_QUEST_ line on the server throughout.
- x-quest-words v1. ONE QUESTION: does a quest started or stopped on one seat start or stop on the other within a breath, with
  no echo, and does a relaunched seat's login start a running quest ahead of its stages? c1's console `startquest 10d3bb`, then
  `stopquest 10d3bb`, then start again, then c2's relaunch. Claims on c2: c2.quest(0x10d3bb).running() true within 5 s, false
  within 5 s of the stop, true at its relaunched login; the server's "starts 10d3bb:Skyrim.esm: recorded, relayed to 1" line;
  no report from c2 for its echo.

Reruns after fix (a): x-alias-premise v1 (its claims as written), x-golden-claw-alias v1 (claims unchanged; its recorded alias
reads now read), x-skip-latent v1 (H-F2; a green moves the lab lever to `recorded`, so a relayed fragment's latent Enable and
Disable on a non-owner stop flashing).

Committed (each its own commit, each green twice before ADR-068 closes):
- b-quest-stage-two-seats v1 (new). ONE QUESTION: does a stage set on one seat reach the other's journal within a breath, its
  reward land once, and the variable it moves read equal on both seats, across a restart? Frame: x-acting-player's leg A, then a
  restart. Claims: c2's stage done within 5 s; c2's gold unchanged; the server's c1 reward once; c2.script_vars(0x74a83).value(<key>)
  == c1's (the key ctda-vars.py's for A Lovely Letter's INFOs; UNVERIFIED that its INFOs read a VM variable, and if none does the
  census names another quest); after the restart and both reconnects, the runs-replay line for both seats, c2 relaunched reading
  the quest running and the stage done within 30 s of its login (through the arrival's Story Manager start for an event quest,
  read 13), the variable still equal on c2 (rule 6 for questRuns and scriptVariables).
- b-quest-rumor v2 and b-quest-stage-restart v2: W1, below.

The gate set (the touched verbs' own plus the always set): b-quest-stage (unchanged), b-quest-report-dedupe, b-world-global (the
shared election), b-papyrus-events, b-trap-look, b-cobweb-view, b-login-in-cell, b-pillar-reentry, b-script-state-restart,
b-puzzle-relay, b-object-anim, b-bleak-traps, each unweakened.

## 4. The push order, the runner, the slots, the fresh reviews

- The branch: m4-scripts-5-quests, cut from canon after today's merge gate moves canon to ce0d2664. Layer worktrees under
  scratchpad (r5-server-wt, r5-platform-wt, r5-client-wt) and thuum branch r5-lab. T0 and T2 on sky-srv's toolchain before every
  push; fork-lint clean; the Formatting check green.
- 5a (A1 to A5), server-only, pushed with `-o ci.variable="CLIENT_BUILD_WINDOWS=0"` (the branch name matches the m<digit>- rule,
  so the image builds); merges into the rung branch on T0 and T2 (ADR-053's R0). Because of SCHEMA 41 it never stages alone;
  canon takes the rung only after 5b's head.
- 5b (B1 to B4), one Windows head (about 40 minutes on the one runner), B1 (fixes a and b) first so a revert of rung 5's own
  commits keeps them. The head builds while slot 0 reads the premises on canon. A review's FIX FIRST becomes the next head; a
  TypeScript-only fix takes turbo-client-build and turbo-client (REUSE_DIST=1); never two client heads inside one 40-minute
  window. Lab grammar rides thuum's pipeline (LABAPI=<id> at the stage).
- Fresh reviews (ADR-064 rule A and amendment A): (1) the integrated rung's diff before slot 1, its engine-facing parts (OnCall's
  step (0), the return swap, the sink's arm, CallNative's return path, the gate's cap) by a reader who checks every fact against
  CommonLib and the tree; (2) each new probe before its first run (x-quest-runs, x-acting-frame, x-trigger-preload,
  x-alias-return, x-acting-player, x-quest-words); (3) b-quest-stage-two-seats v1 before its first run; (4) W1's two rewrites:
  Eli, one at a time, each its own commit (rule 13, ADR-064 decision 4); (5) D-W3's fix, if built, before x-trigger-preload v2.
- Slots (two a day, ADR-053): slot 0, the premises on canon (the static censuses, ctda-vars.py, quest-census.py and the pex
  reads, first and slotless); slot 1, x-alias-return, x-trigger-owner v2.5, x-cobweb-relay v1.6, x-acting-player, x-quest-words;
  slot 2, b-quest-stage-two-seats and the reruns; slot 3, the gate set, with W1's rewrites if approved; slot 4, FIX FIRST reserve
  or x-trigger-preload v2.
- Estimate: about 8 agent half-days (wire 1, server 2, platform 2, client 1.5, lab and tools 1.5); 1 Windows head plus 1 for a
  FIX FIRST; 5 stage slots plus 1 reserve. The ladder said "1.5 + 3"; the premise slot is amendment B's cost.
- The next playtest (at most eight items, each with its green two-seat run id): (1) a stage set on one seat reaches the other's
  journal and the reward lands once; (2) the Aventus rumor's objective shows on both journals; (3) Arvel's claw alias holds on both
  seats and the keyhole opens for its holder; (4) a guest walking into the Temple's ambush wakes the draugr on both screens; (5)
  Arvel's run for a guest's entry, if leg C reads; (6) a started quest runs on both seats and after a restart; (7) dialogue
  options conditioned on a quest variable match on both seats; (8) regressions, named.

## 5. Risks and fallbacks

- H-A1 (the ladder's rung 5 fallback). If H-AP1 or H-AP2 fails: the fragment skip stays (`questFragmentLive` stays false, the
  shipped default), the requests still cross (stages, starts, stops), rewards stay the acting seat's as today, and the
  acting-player scope goes to the re-analyst as a Dynamic section in quest-stage.md (rule 8). The two ids already pinned are
  104651 and 53987; what needs RE is the stack 53987's dispatch creates, and whether a narrower key exists (VirtualMachine's
  nextStackID +0x9380, CL/V/VirtualMachine.h, read before and after the sink's original: HYPOTHESIS, not built). The smaller
  verified rung ships whole without the scope: the words, the record, the replay, ScriptVariables, D-Q1 measuring, fixes (a) and
  (b), proven by x-quest-words v1, x-alias-return v1, b-quest-stage-two-seats v1 without its claims on c2's fragment, and
  b-quest-stage-restart v2. Cost: 3 slots.
- Churn: if x-quest-runs v1 reads broad churn (many quests flipping), the run words ship recording only (the server records and
  relays nothing) until a cause-based rule is designed (the seam sees Quest.Start or Stop whose calling script's self is the same
  quest: a self-restart, per seat; not built).
- The scope's window: a stage this seat's own player sets on the same quest inside ARM_MS would be scoped to the other player
  (H-AP3); counted, and the stack-id variant above is the narrowing.
- The PlayerRef shapes (finding 5's declared miss): opcode compares against a PlayerRef property or a stored GetPlayer result
  never pass a native. quest-census.py sizes them before x-acting-player is drafted; the verb doc names the count.
- Relayed fragments' latent state rows (Enable, Disable, MoveTo, AddItem: FunctionsDump.txt isLatent) still run on non-owners
  under the lab's `nonLatent`: a flash the records correct, declared since rung 4. A green x-skip-latent moves the lever to
  `recorded`.
- A doubled run with nobody acting: two seats whose own timers set one stage within one relay window each run the fragment
  natively (finding 5's second miss). The server counts two first-time reports of one (quest, stage) from two seats inside 2 s:
  "[verb:quest-stage] <q> stage <s> set on two seats inside one relay window: both ran its fragment" (a lab signal, UNMEASURED).
- Players apart: a player-targeted effect on a seat whose figure is absent lands nowhere on that seat, which is correct; the
  acting seat's own native run carries it.
- D-C2's host runs for a guest: a player-targeted effect (an item to "the player") lands on the figure and is lost for the
  guest. Declared: the guest's own seat does not run that world script.
- Risk (c)'s fix sketch, conditional on H-TP2 holding: the gate keeps, per (trigger, presser), the enters it blanked while the
  presser's owner was undecided (an actor neither hosted nor a puppet, in a cell this seat does not host); a leave drops the
  entry; entries expire at 60 s. At SetCellHosted(cell, true) or setHosted(actor, true), the entries that ownership now makes
  owned are marked due, and the client's next update replays each once through SendTriggerEvent's body (a new
  TESModPlatform.ReplayHeldEntries, its NATIVES.md line) under the platform's mark. Line: "[verb:traps] OnTriggerEnter to <t> by
  <p>: held at the load (no owner then), replayed at its owner's grant". A puppet flag drops the entry. D-W3 decides whether trap
  family triggers are included.
- Fix (a)'s reach: it changes CallNative's return path for every object-returning native; a form's path is unchanged (the new
  branch runs only when the form loop finds nothing); the gate set reads the regression.

## 6. The words owed from Eli

W1: the claim rewrites of b-quest-rumor v2 and b-quest-stage-restart v2 (ADR-068's W1; ADR-064 decision 4).
- Context: b-quest-rumor encodes D62 and D69, whose refusal (E_QUEST_OWN_START) rung 5 retires, so its last block cannot hold;
  and its first claim's pattern is dead today (read 3). b-quest-stage-restart excludes OWN_START by a lookahead that becomes moot,
  and has no claim on the run record rule 6 now needs.
- The drafts (lab/.cache/drafts/rung5, by path, fresh review first): b-quest-rumor v2: (1) the mode-all claim becomes "sent mode
  1 with [0-9]+ denied quests" >= 2 (b-quest-stage's approved form); (2) the DB01Misc, MQ102 and HeartwoodMill claims kept, their
  comments saying why each holds under the new rule; (3) the OWN_START block becomes the new rule's: `server.log_count("set
  1a428:Dawnguard.esm stage") == 0` kept, "starts 1a428:Dawnguard.esm" at most once, and each seat's churn-hold line at least
  once when x-quest-runs v1 reads the bursts inside the window; (4) added: c2's own gold unchanged across DB01Misc 10, and c2's
  acting line where the fragment names the player. b-quest-stage-restart v2: adds the runs-replay line for both seats and c2
  relaunched reading 0x10d3bb running at its login; tightens the refusal claim to "E_QUEST_" == 0 (a strengthening); every
  other claim unchanged.
- A) Approve both as drafted, after x-quest-runs v1 and their reviews. B) Approve b-quest-stage-restart v2 now (additions only)
  and b-quest-rumor v2 once x-quest-runs v1 names the controller's lines. C) Retire b-quest-rumor (its subject retires with D62
  and D69; b-quest-stage-two-seats and b-quest-stage carry the relay) and approve b-quest-stage-restart v2.
- Recommendation: B.

D-Q2: the per-player gap until D-Q1's derivation matches the lists.
- Context: read 2. Per-player quests cross today; the alias half catches the werewolf quest (if H-QS1 holds) and never the
  vampire quest; rung 5's fragment runs on receivers would add their scripted consequences to the leak.
- A) Deny PlayerVampireQuest 0xeafd5 and PlayerWerewolfQuest 0x2ba16 now (two settings rows in both deploy files on thuum main,
  no code); the alias half ships measuring only (`questScope` "off"); the two rows come out when the refinement's census and a lab
  read match the lists. B) Ship the alias half acting (`questScope` "aliases") in rung 5 and deny PlayerVampireQuest alone. C)
  Keep the start-game-enabled rule (IsSeatsOwnQuest) beside the new words through rung 5 and retire it in rung 7's chaff, once
  the derivation matches.
- Recommendation: A.

D-Q3: the login replay's fragment.
- Context: read 1. The ladder deletes the skip; a replay that runs fragments replays history.
- A) Skipped: a replay is a load, and the record (ref states, alias fills, script records, world globals, condition variables)
  carries the world effects; the live relay runs fragments under the scope. B) Run under the recorded acting player's scope (the
  record keeps each stage's acting player; a late joiner's run rewards nobody of its own). C) Run unscoped, D-F1 C's letter
  (every seat's VM applies every stage).
- Recommendation: A.

D-V1: who streams a condition-read variable.
- Context: read 9. D-F1 C named one streaming seat; a dialogue's TIF fragment runs only on the talker's seat.
- A) The one world streamer (D-F1 C as accepted; rung 4's election). B) Every seat reports a listed variable it changes, the
  latest write winning per variable with the server's sequence (AliasFill 79's accepted shape), relayed to the others. C) The
  conversation claimant's seat streams the variables its dialogue touches while it holds the claim (ActorClaim 56), and the world
  streamer the rest.
- Recommendation: decided by H-CV1's census. If no listed variable has a TIF writer, A as accepted; if any does, B. The wire shape
  serves both, so 5a does not wait.

D-W3: an entry held at a cell's load (risk c), asked only after x-trigger-preload v1 reads H-TP2.
- A) Replay a held entry at its presser's ownership flip, for trap family and world triggers alike (single player counts an actor
  inside a trigger at the load). B) Replay it for world triggers alone (a quest or scene trigger waiting on an NPC); a trap with an
  NPC on its plate stays unfired until the next press, so no trap fires at a host's arrival. C) No replay: a declared limit in
  trigger-entry.md.
- Recommendation: B.

## Critical files for implementation

- W/skyrim-platform/src/platform_se/skyrim_platform/ScriptNatives.cpp
- W/skymp5-server/cpp/server_guest_lib/ActionListener.cpp
- W/skymp5-client/src/services/services/questStageService.ts
- W/skyrim-platform/src/platform_se/skyrim_platform/CallNative.cpp
- W/skyrim-platform/src/platform_se/skyrim_platform/FridaHooks.cpp
- W/skymp-wire/crates/wire-schema/src/skymp.rs
