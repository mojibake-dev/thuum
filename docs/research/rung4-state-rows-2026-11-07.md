# ADR-068 rung 4, the state rows: the build plan (2026-11-06)

thuum-fa, 17:25 PST 2026-11-06 (01:25Z 11-07): a read-only planning agent's plan against fork 458a6930 (rung 3's head, canon once
its merge gate is green), composed with the 48 train (its merge with rung 3, e68f0c4a, which adds ProcessTrapHit's Keep::Evidence);
ADR-068's rung 4 (decision 9 and the consequences paragraph, docs/DECISIONS.md) made concrete. Its reads change three things the
ladder assumed (reads 1, 2 and 8 below), recorded as ADR-068 amendment B in docs/DECISIONS.md. The build runs as five layer agents in
parallel (ASAP mode) on fork branch m4-scripts-4-rows, cut from canon after the 48 train lands. Checked by hand before this was
written: read 1's client fault (remoteServer.ts:555 reads `props['disabled']` where the server serializes `isDisabled`,
CreateActorMessage.h:95 and wire-schema skymp.rs:223; modelApplyUtils.ts:84-95 and :131-146 enable a disabled reference), the
record's fields (MpChangeForms.h:127, :129, :186, :286), SetEnabled (PapyrusObjectReference.cpp:59) and the probe collision
(lab/.cache/probes/x-bleak-scripts.yaml is v3.1).

Path roots used below: W is the fork at 458a6930; T48 is the 48 train's merge e68f0c4a; SP is
W/skyrim-platform/src/platform_se/skyrim_platform; client is W/skymp5-client/src/services/services; server is
W/skymp5-server/cpp/server_guest_lib; wire is W/skymp-wire/crates; CL is CommonLibSSE-NG/include/RE; thuum is this repo.

## Reads that change the approved design

1. **The ref state's record already exists. The client never applies it, and actively undoes it.**
   - MpChangeFormREFR already has `isDisabled` (MpChangeForms.h:127), `isDeleted` (:129), `destruction` (:286) and `factions`
     (:186), persisted (MpChangeForms.cpp:412, :414, :714-716, :822-827; factions :483-494, :1045-1071). So the migrations ADR-068
     names for "the ref state (isDisabled, isDeleted, destructionStage)" (DECISIONS.md:4633-4634) need no new value keys, only the
     new marks below.
   - The server sends `isDisabled` (CreateActorMessage.h:95; wire-schema skymp.rs:223; fixtures 33-CreateActor-0..2). The client
     reads `props['disabled']` instead (remoteServer.ts:555; createActorMessage.ts:48), an upstream bug since 63ca3d82.
   - Worse, two client paths enable a reference the engine holds disabled: `applyModelIsDisabled(refr, false)`
     (modelApplyUtils.ts:84-95), and the harvested apply's non-flora branch, which reads `isDisabled` as "harvested" and calls
     `enable(true)` (:131-146). It runs at every game-file CreateActor (remoteServer.ts:546-549) and every 666 ms for form views
     (formView.ts:700-703).
   - Result today: a host's scripted Disable of a server-held reference is undone on every seat, the host's own included, at the
     next subscribe.
   - The UpdateProperty `'disabled'` branch (remoteServer.ts:1162) is dead code: MpObjectReference::Disable never sends anything
     for a game-file non-actor (MpObjectReference.cpp:571-583).
2. **Most RefState subjects are not server forms.**
   - AttachEspmRecord loads only NPC_, FURN, ACTI, items, DOOR, CONT, and FLOR or TREE with a result (WorldState.cpp:458-476). It
     skips initially disabled references (:495-511) and references whose enable parent disables them (:521-548), unless `sighted`.
   - Skipped examples: XMarkers and collision markers (Embershard's 0x105c99; the encounter markers 0x17037 and 0x108a5c,
     trap-census :162) and Mora's initially disabled activator and TACT (research :715-716).
   - Rung 2 judges such a subject by its record and keeps nothing (ActionListener.cpp:3956-3970; PlacementOfRecord :3599-3624).
   - The cheap path exists: saved change forms wait in `changeFormsForDeferredLoad` (WorldState.cpp:61, :286), LoadForm applies
     them at attach (:755-760), and `sighted` already lets the disabled filters yield (:502-511).
   - **Decision:** a reference with a recorded ref state is attached by its record. Held and unheld subjects share one path, with
     no per-cell table.
3. **The server relays a disable only from its own VM.** SetEnabled records the state and sends the same native as a snippet to
   listeners (PapyrusObjectReference.cpp:59-81) through the deferred queue with no seq (SpSnippet.cpp:41-45). A host's report has
   no path. Delete refuses every game-file form (MpObjectReference.cpp:1168-1180). The console's Enable and Disable act on server
   forms and actors only (ConsoleCommands.cpp:142-155, :245-253).
4. **Rung 3's touch and record do not carry these states.** An owned state row queues a touch (ScriptNatives.cpp:969-977;
   QueueTouch :689-734) that marks the self and its caller due for SerializeScriptState (scriptCallService.ts:75). The record holds
   VM variables plus the last animation, never the engine's disabled flag, so a late joiner gets a cobweb script's "done" flag but
   an enabled cobweb. Rows moved into the batch keep the trigger, because `onCalls` calls `noteCall` for every batched call (:75).
5. **On a non-owner today:**
   - The skip lever is off by default (ScriptNatives.cpp:624-635, :1040-1077) and set to `nonLatent` on the lab
     (thuum lab/deploy/sky-client/skymp5-client-settings.txt:17).
   - Only non-latent state rows are skipped (:958-965). By FunctionsDump.txt, EnableNoWait, DisableNoWait, PlaceAtMe and
     PlaceActorAtMe are non-latent; Enable, Disable, Delete and DamageObject are latent and still run on a guest, which matches
     the measured lifecycle Disables (DECISIONS.md:4021-4025).
   - The standing natives have no rows (natives_table.rs:17-60), so they run everywhere. ForceRefTo and SetValue are Everyone rows,
     run and counted by self (ScriptNatives.cpp:896-901).
   - A skipped latent row must still return something. CommonLib's latent contract is kFailed or kStarted
     (CL/N/NativeLatentFunction.h:59-62); the dispatch's CallResult is kCompleted 0 or kInProgress 2 (CL/I/IFunction.h:36-38).
     This is H-F2.
6. **ADR-057's path cannot take a script's placement as built.** Its sets open only at an accepted cast of a listed spell
   (placements.rs:513 `cast_started`; the table keyed by spell :24-36), anchored at the caster, with the cast's lifetime, and are
   swept at restart (placedBySpell, MpChangeForms.h:235-239; PartOne.cpp:3940-3960). placedBy pairs only with MSTT or ACTI
   (wire-validate lib.rs:602-609). Reusable: the handshake (skymp.rs:1884-1932), `report_placed` (:613) and placedBy's skip.
   npc-fate's first roll is already built: PapyrusObjectReference::PlaceAt fates an NPC before its create word
   (PapyrusObjectReference.cpp:429-471).
7. **ADR-068 lists no RefState message** (DestructionStage 78, AliasFill 79, WorldGlobal 80, ScriptVariables 81:
   DECISIONS.md:4623-4626), yet the ladder says "DestructionStage t 78 S2C" for RefState. **Decision:** DestructionStage 78 is
   widened to be RefState's S2C. No renumbering is needed.
8. **The claw can be derived instead of reported.** libespm parses QUST aliases: ALCO, ALCA, ALFR, ALUA (QUST.h:150-170;
   QUST.cpp:16-65); the server never uses them. MS13 0x39645 is start-game-enabled (flags 0x11, quest-stage.md:341), and its claw
   is ALCO 0x39647 (:278). The created item is therefore R0 from the game files. No seat ever reports it, because a
   template-running quest fills without calling ForceRefTo.
9. **ADR-066 decision 6 is only half built.** cells.rs keeps stale and dead per player (cells.rs:225-234; `eligible` :381-385);
   the pause and load flags and OwnerAck are absent. The world streamer is elected from what exists.
10. **The ladder's retirements are already done or narrower than written.** The npc-handoff "hide snippet" (D6's Disable) was
    replaced by a move-to-record (a86a7977, 1ff454bd; PartOne.cpp:2295), and the client hide a020511c is not an ancestor of
    458a6930 (`git merge-base --is-ancestor`). player-globals.md:30's "later" examples are written by a caster's spell script that
    runs on one seat (ADR-029), which one streamer never sees; :27 is a SkyUI issue, not this rung's.
11. **Probe names collide.** x-bleak-scripts v3 and v3.1 exist (lab/.cache/probes/archive/x-bleak-scripts-v3-d4779e40.yaml;
    v3.1 is lab/.cache/probes/x-bleak-scripts.yaml), so this rung's is v4. The web 0x1fc43 is destroyed by the engine and reported
    as DestructionStage from a hosted cell (trapResultService.ts:80-108); its script row has no Disable (trap-census :150), so "the
    web burned" may never exercise a Disable native (H-RS3). v4 adds a true Disable-native subject: a cobweb's FXtriggerAmbFX #19
    (:156).
12. **papyrus-events.md:375 and :378 call the essential Kill and the EquipItem row "rung 4's".** The approved row does not list
    them, so this plan leaves them out.

## 1. Interfaces, fixed up front

### The rows

| Row | Natives | Observe point (owner only) | Subject's owner | C2S | Non-owner's own call |
| --- | --- | --- | --- | --- | --- |
| RefState | Enable, EnableNoWait, Disable, DisableNoWait, Delete | Batched state row with its args (Kill's and ProcessTrapHit's shape) | World object: its cell's host. Actor: its simulator; with no simulator or no server word, its cell's host | ScriptCall 75 | Skipped: non-latent rows by `nonLatent`; latent rows by the new value `recorded` |
| Destruction | SetDestroyed, DamageObject | Unchanged (D-S3) | Whoever caused it | DestructionStage 78 | Unchanged |
| ScriptPlacement | PlaceAtMe, PlaceActorAtMe | None this rung (W3) | Cell host | Fake client only (T2) | Skipped (`nonLatent`) |
| AliasFill, ref half | ForceRefTo, ReferenceAlias.Clear (appended) | Everyone row batched on every seat | Nobody (D-F1 C) | AliasFill 79 | Runs, and reports |
| AliasFill, created half | none | The server's read of QUST ALCO/ALCA | Server (R0) | nothing | n/a |
| WorldGlobal | (SetValue stays counted) | The streamer's once-a-second diff of the GLOB array | Nobody; one streaming seat | WorldGlobal 80 | Runs; only the streamer reports |
| Standing (W3) | SetFactionRank, ModFactionRank, RemoveFromFaction, RemoveFromAllFactions, SetCrimeFaction, SetRelationshipRank (appended) | Batched state row | NPC: its simulator; 0x14 refused until rung 5 | ScriptCall 75 | Skipped (`nonLatent`) |

AddToFaction is Papyrus code over SetFactionRank and has no native of its own (absent from FunctionsDump.txt).

### (a) Platform

**Table rows** (natives_table.rs and NativeRows.inc, in one commit so the parity test at natives.rs:630-660 holds):
- Five RefState rows: `keep: Record(RefState)`, relay `none`.
- PlaceAtMe and PlaceActorAtMe: `Record(Placement)`.
- Seven rows appended in this order: the six standing natives as State/Self/Simulator/Nobody/Never/`Record(Standing)`, then
  ReferenceAlias.Clear as Everyone.
- The bound line reads "41 of 41 table rows bound" (ScriptNatives.cpp:1352).

**Batching:**
- `kBatchedStateRows` (ScriptNatives.cpp:124-127, plus T48's ProcessTrapHit) gains the five RefState rows and the six standing
  rows. They cross through `QueueFromFrame` with args, caller and callerSelf, instead of as a touch.
- Trap-family calls keep D-S3's own path (OnFamilyCall :791-829).

**The lever:**
- New value `recorded` = `nonLatent` plus the latent record rows (Enable, Disable, Delete).
- A skipped latent row returns kCompleted with its None result (H-F2) and is counted " (skipped)".
- The first three skipped selves per row per window are logged: "[verb:scripts] ObjectReference.Disable on <id>: skipped, not
  hosted here (recorded)".

**Owner test:** new `OwnedForRecord(ref, isActor)` next to OwnedHere (:370-381). For an actor neither `Hosted::Is` nor
`Puppets::Is` holds, it uses the cell host's test. Without this, the host would skip its own Enable of an unloaded ambush draugr
(0x4e421 to 0x380ba, trap-census :162).

**Everyone rows:** ForceRefTo and Clear queue with `self` = EveryoneSelfId (:348-363) and a new field
`alias = (handle >> 32) & 0xFFFF` for a kind-0, non-plain handle (the encoding at :283-296; H-AF3). The ScriptCall typing gains
`alias?: number` (Definitions.txt, skyrimPlatform.ts regenerated).

**New native `TESModPlatform.DiffWorldGlobals(Bool reset, String exclude) -> String`:**
- Declared in TESModPlatform.psc, added to the pex with lab/pex.py add-native, registered in PapyrusTESModPlatform.cpp.
- Runs on the OnUpdate thread (rung 3's thread note).
- Walks `TESDataHandler::GetSingleton()->GetFormArray<TESGlobal>()` (CL/T/TESDataHandler.h:68-70, :222-224), skips `kConstant`
  (CL/T/TESGlobal.h:28) and the hex ids in `exclude`, compares `value` (:45) to a baseline and answers `[[id, value], ...]`;
  `reset` re-baselines and answers `[]`.
- NATIVES.md line (R2, verb world-globals): "Client only: the world streamer's diff of the GLOB array against its last report;
  constants and excluded ids skipped".

No ScriptPlacement platform code this rung (W3).

### (b) Wire

SCHEMA_VERSION goes from 38 to 39 (wire-schema lib.rs:94). T48 changes no schema (thuum docs/WIRE.md:790).

**DestructionStage, widened** (MsgType 78, wire id 86, Both; skymp.rs:2436-2471):
- Today `{refr, stage, destroyed, served}`; adds `disabled: Option<bool>`, `deleted: Option<bool>`, `seq: u32`.
- Row cap from 16 to 32 (lib.rs:715).
- `check_destruction_stage` (wire-validate lib.rs:869): a client-to-server message with `disabled` or `deleted` set, or a nonzero
  `seq`, is E_VAL_RANGE.
- Fixtures 78-2 (served, disabled true, seq 3) and 78-3 (the C2S refusal). C++: DestructionStageMessage.h gains the three fields.

**AliasFill** (MsgType 79, wire id 87, Both, reliable):
- `{quest: u32, alias: u32, refr: u32 (0 = cleared), served: bool}`, cap 32 B.
- Validator: quest of 0 or at or above 0xff000000, alias over 0xFFFF, or refr at or above 0xff000000 is E_VAL_RANGE; a C2S with
  `served` true is E_VAL_RANGE.
- Budget 16 then 4 a second (UNMEASURED; 57 ForceRefTo were measured at a guest's arrival, DECISIONS.md:4023-4024).
- Fixtures 79-0 (a relay), 79-1 (served, cleared), 79-2 (refr 0xff000002, refused).

**WorldGlobal** (MsgType 80, wire id 88, Both, reliable):
- `{epoch: u32, stream: Option<bool>, entries: Vec<{global: u32, value: f32}, WORLD_GLOBALS 512>, served: bool}`, cap 8 KiB.
- Validator: more than 512 entries, a global of 0 or at or above 0xff000000, or a duplicate is E_VAL_RANGE; a non-finite value is
  E_VAL_NONFINITE; a C2S with `stream` set, `served` true or epoch 0 is E_VAL_RANGE (ADR-066's epoch-0 rule, DECISIONS.md:4439).
- Budget 4 then 1 a second.
- Fixtures 80-0 (a report), 80-1 (the stream word), 80-2 (NaN, refused).

**CreateActor:** the `placedBy` pairing (lib.rs:602-609) widens from {MSTT, ACTI} to {MSTT, ACTI, STAT, NPC_, item types}. Fixture
33-CreateActor-3.

**Bookkeeping:**
- TABLE (lib.rs:618-716) gains two rows; variants at :580-589; ids 87 and 88 (:816-834); WIRE_IDS from 87 to 89 (:722-723).
- wire-json's family list adds 79 and 80 (wire-json/src/lib.rs:79); its count test goes from 78 to 80 (:356).
- C++: AliasFillMessage.h, WorldGlobalMessage.h, MsgType.h, REGISTER_MESSAGE, PacketParser cases, WireJsonContractTest.

**Unchanged:** ScriptCall 75, SpSnippet 30, PlacedRequest 61 and PlacedReport 62.

**Difftest:** it sends JSON, so new types need only wire-json. Its steps are only move and send (difftest/src/main.rs:202-212), so
it has no restart step.

### (c) Server

**wire-rules natives.rs:**
- `Keep` gains `Record(RecordKind {RefState, Standing, Placement})` next to T48's Evidence; `channel_of` gets a Record arm.
- `record_owner`: RefState and Placement on a world object (held, by record, or a door or container) are its cell's host's at the
  epoch; on an actor, `facts.owner` = PartOne::SimulatorOf (PartOne.h:837), and with none its record cell's host; Standing on 0x14
  is E_SCRIPTCALL_ROW.
- `Verdict::Record{subject, seq, kind}` takes the next seq (the increment at :566-567).
- Record rows spend their own bucket: BURST_RECORD 128, then 32 a second (UNMEASURED), so no state row is lost to an action burst.
- OnScriptCall gathers a place for doors, containers and actors on record rows; today they get none (ActionListener.cpp:3971-3976).
- Bridge: `ScriptCallVerdict.record: u8` next to T48's `keep_evidence`.

**New rule modules:**
- `ref_state.rs`: Enable and Disable set `disabled`; Delete sets `deleted` and `disabled`; `deleted` never clears; a repeat is
  folded (no seq, no relay).
- `standing.rs`: merges the six natives. Refusals: E_STANDING_FACTION (argument 0 is not a FACT), E_STANDING_RANK (outside -128 to
  127), E_STANDING_OTHER (not an actor).
- `world_streamer.rs` (rung 5's ScriptVariables reuses it): one seat at an epoch, raised at each change; eligible when past its
  first movement report, not stale and not dead; the lowest eligible player id wins (UNMEASURED choice); re-elected at the
  streamer's leave, stale or death; judged Current, StaleEpoch, FutureEpoch or NotOwner (ADR-066 decision 4).
- `world_globals.rs`: the latest value wins and an equal value is folded. Per-entry refusals: E_WORLDGLOBAL_CLOCK (0x35 to 0x3a,
  timeService.ts:9-14), _PLAYER (on the playerGlobals list), _CONSTANT (libespm GLOB flags), _NO_GLOB. Whole-message refusals:
  _OWNER, _EPOCH.
- `alias_fills.rs`: records per (quest, alias), the latest wins, an equal fill is folded. Refusals: E_ALIASFILL_NO_QUEST,
  _NO_ALIAS, _REF. The created rule over the parsed aliases plus the journal's marks: each created item is added once; a container
  alias filled by conditions logs E_ALIASFILL_UNRESOLVED once.
- `placements.rs`, the script set: `Anchor::SelfRef`, with the existing band (REPORT_MIN_UNITS 64 to MAX 320, DZ 256; :37-74);
  opened by a Placement verdict; placeable bases ACTI, MSTT, STAT, NPC_ and items, anything else (EXPL, HAZD, PROJ, others)
  E_PLACED_KIND; no lifetime, the form stays until a Delete row.

**Records** (optional fields: an absent key reads as none and formVersion is kept, fb0c3396's shape; keys next to
MpChangeForms.cpp:545-563 and :1155-1185):
- `refStateSeq: optional<u32>`, which marks the enabled and deleted state as recorded.
- `crimeFaction: optional<FormDesc>` and `relationships: optional<vector<{other, rank i8}>>`.
- `placedByScript: optional<{self, base}>`.
- On the journal (PartOne::WorldJournal, PartOne.cpp:3424-3444): `aliasFills: [{quest, alias, refr?, created?, container?,
  added}]` and `worldGlobals: [PlayerGlobal]`.

**Loader:** LoadForm (WorldState.cpp:714-764) attaches a reference whose deferred record carries `refStateSeq` with `recorded`,
which lets the type filter (:469-476), the disabled filter (:505-511) and the enable-parent filter (:530-548) yield.
`AttachForRecord(id)` does the same for a reference's first record. PlacementOfRecord also places ACHR records for record rows.

**Handlers:**
- **RefState** (OnScriptCall, ActionListener.cpp:3889-4087, the Record branch): attach by record if needed, then Enable, Disable
  or Delete. A game-file reference gets `isDeleted` and `isDisabled`; a 0xff form is removed as today. Set `refStateSeq` to the
  seq. Relay a 78 to the listeners other than the reporter, immediately (SendToUser); for an actor's disable, the relay goes before
  MpActor::Disable's unsubscribe (MpActor.cpp:690-700). Seed the sequence from max(scriptState.seq, refStateSeq) next to
  :3995-4003. MpObjectReference::Enable and Disable on game-file forms stamp `refStateSeq` whatever the cause (VM, console).
- **Standing:** MpActor's faction edits (MpActor.cpp:489-570) plus the two new fields, then applier snippets with seq through
  `SpSnippet::Relay` (SpSnippet.cpp:49-58).
- **Placement:** PlacedRequest to the reporter; OnPlacedReport (:3512) judges the report through the set; PlaceAt at the reported
  pose; `placedCasterByForm` (PartOne.cpp:1391-1396) names the reporter; `placedByScript` is recorded.

**The created half:** at a container's load (after the actor's fate roll) for start-game-enabled quests, and at a quest's first
recorded stage (MergeQuestStage :3406-3414) for the rest: `AddItem(created, 1)` once, then the journal's mark. Log line:
"[verb:quest-stage] alias <q>/<a> creates <base> in <container>: added once".

**Serves:**
- onSubscribe's 78 block (PartOne.cpp:1443-1462) serves when a reference has a destruction record or `refStateSeq`, before
  ScriptStateApply (:1464-1485).
- Standing snippets with the record's seq go behind the create word.
- SendAliasFills after SendQuestStages (:554); SendWorldGlobals after SendPlayerGlobals (:549); the stream word at each election.
- A restart serves the saved records.

**labState bindings** (PropertyBindingFactory.cpp:55-62): `isDeleted`, `refStateSeq`, and `worldGlobals` and `aliasFills` on the
journal.

**Per-object order (6.11 item 1):** RefState and the standing share ScriptCalls' per-object seq with actions and rung 3's records.
AliasFill and WorldGlobal are nobody's pieces and take no object seq.

### (d) Client

- **ScriptCallService** (scriptCallService.ts; T48's `sendTrapHits` shape): a record queue coalesced per (self, family) per frame,
  the last call winning, sent as ScriptCall with `host.epochForActor` (hostService.ts:273). The standing is never sent for 0x14.
  ForceRefTo and Clear go to AliasFillService. PlaceAtMe and PlaceActorAtMe are never sent (W3).
- **RefStateService** (new):
  - Holds the latest 78 `disabled`/`deleted` word per form, in the message context, and applies it on update once
    `ObjectReference.from(Game.getFormEx(id))` exists.
  - Does nothing for a cell this seat hosts (hostService.ts:260), except inside the grant's `beforeHosting` pass
    (scriptStateService.ts:513).
  - A live word applies only above `SpSnippetService.seqOf` (spSnippetService.ts:130), then calls `raiseSeq` (:134); a served word
    always applies.
  - Compares `isDisabled()`, then calls `disableNoWait(false)` or `enableNoWait(false)`: the platform's own calls, never
    re-captured. A deleted game-file reference is disabled.
  - Log lines: "ref state <id> applied (served|relayed seq <n>)", "... here already", "... dropped: seq <n> at or below <m>".
- **TrapResultService** keeps 78's destruction half unchanged (trapResultService.ts:164-176).
- **Deletions and fixes:** delete remoteServer.ts:555 and :1162-1163; restrict `applyModelIsHarvested`'s non-flora branch
  (modelApplyUtils.ts:131-146) to item types (FormTypeEx.isItem, objectReferenceEx.ts:99); retype createActorMessage.ts:48 from
  `disabled` to `isDisabled`.
- **AliasFillService** (new): reports (quest, alias, refr) per frame; applies relays and the login serve with
  `Quest.getAlias(alias)`, then `ReferenceAlias.forceRefTo` or `clear`; parks a fill while its quest is not running
  (questStageService's idiom) or its reference is not loaded; skips one already filled with that reference.
- **WorldGlobalService** (new; playerGlobalsService.ts's shape): the stream word starts the watch, `DiffWorldGlobals(true,
  exclude)` and then once a second with `false`, sent with the word's epoch. Excluded: the clock's six and the playerGlobals watch
  (sp.storage "playerGlobalsWatch", playerGlobalsService.ts:12). Receivers apply with `GlobalVariable.setValue`, 32 per update; the
  streamer applies the login serve before it re-baselines. A summary every 30 s: "world globals: <n> changed, <m> sent".
- **Standing:** no receiver code; SpSnippetService runs the appliers in seq order (spSnippetService.ts:106-121).

### (e) Lab grammar (thuum, staged with LABAPI=<id>)

- **Driver steps:** `alias {quest, alias}` answers `{refr, name}`; `factions {formId, factions}` answers `{ranks, crime}`. Both in
  lab/driver/src/index.ts next to "quest-stage" (:2076) and "global" (:2258), and in scenario.py's CLIENT_ACTIONS.
- **lab-api accessors:** `server.ref(id).isDisabled`, `.isDeleted`, `.refStateSeq` (RefView, assertions.py:894-925);
  `server.world_globals().streamer`, `.epoch`, `.value(desc)`; `server.alias_fill(q, a).refr`, `.created`, `.added`;
  `c.alias(q, a).refr` and `c.factions(id).rank(f)`. Reused: `refs_near().disabled_of` (:764), `globalValue`,
  `server.inventory().count` (:1348), `script_state().quiescent`.
- **gamemode:** lab/gamemode/gamemode.js's ref adds the three fields; new kinds `worldGlobals` and `aliasFills`
  (CONTRACT.md:143-161).

## 2. Commits, inside-out

| # | What | Proof |
| --- | --- | --- |
| A1 | natives.rs record channel, owner rule, bucket, the 41 rows (rs and .inc together), the bridge field | T0 crate tests: the host accepted; a guest refused OWNER; an unnamed actor judged by its cell host; standing on 0x14 refused ROW; a door's enable accepted; the bucket; table parity |
| A2 | ref_state, standing, world_streamer, world_globals, alias_fills, the placement script set | T0 |
| A3 | Records, keys, migrations; LoadForm's `recorded` attach; ACHR placement | T0 ChangeFormTest (round trip; an old record reads as none); a loader test (a STAT and an initially disabled REFR attach by deferred record) |
| A4 | The claw derivation (no wire change) | T0 AliasCreatedTest on Skyrim.esm: Arvel holds one 0x39647 across two loads and a restart, and none after a take |
| A5 | Rule 4 in one commit: SCHEMA 39, 78 widened, 79, 80, placedBy, validators, fixtures, C++, MsgType, PacketParser, OnAliasFill, OnWorldGlobal, the stream word, WIRE.md rows | T0 AliasFillTest, WorldGlobalTest, DestructionStageTest; cargo, clippy, WireJsonContractTest; T2 alias-fill.yaml and world-global.yaml |
| A6 | RefState, standing and placement through ScriptCall; the serves; the bindings | T0 RefStateTest, StandingTest, ScriptPlacementTest; T2 ref-state.yaml (the ore vein 0x10e6c5 in 0xbbb1, script-call.yaml's frame, plus a STAT near it, UNKNOWN until `esm.py near`), standing.yaml, script-placement.yaml |
| B1 | Platform, as (a); NATIVES.md | T1 Windows build |
| B2 | Client, as (d) | One Windows head with B1, then a fresh review (ADR-064 rule A) |
| B3 | Lab grammar, probes, scenarios (each scenario in its own commit, rule 13) | T3 |
| B4 | Retirements and docs | Rerun slot 3's set |

- **4a** = A1 to A6: server-only, pushed with CLIENT_BUILD_WINDOWS=0, merged into m4-scripts-4-rows on T0 and T2. A5's schema bump
  changes netcode's protocol id, so canon takes the rung only after B2's head (rung 3's precedent). A1 to A4 change no schema: a
  stage can lay them with canon's client to read x-golden-claw-alias v1 early, since the created half needs no client code.
- **4b** = B1 to B4.

**T3 slots:**
1. The premise probes: x-skip-latent v1, x-alias-premise v1, x-world-globals-rate v1.
2. x-bleak-scripts v4 and x-golden-claw-alias v1.
3. b-ref-state-restart v1 and b-world-global v1, with b-trap-record-restart, b-script-state-restart, b-player-globals,
   b-global-default, b-container-rest, b-locks, b-prop-push and b-bleak-traps unweakened.
4. x-standing v1, then B4 or a FIX FIRST.

## 3. Retirements

- **npc-handoff's hide:** no code to delete. npc-handoff.md:667-690 is marked superseded by a86a7977's move-to-record, with
  RefState's actor rows now carrying an actor's disabled state.
- **player-globals.md:30:** re-pointed to WorldGlobal's R2 row for globals every seat's scripts write. A caster-written global
  stays its caster's seat's own (a declared limit, H-WG3). :27 is unrelated (SkyUI).
- **The client's disabled applies:** remoteServer.ts:555 and :1162-1163, and the non-item branch of the harvested apply.
- **natives.rs:512's refusal text** names the record channel.
- **STATE.md:47** (TESForm.kFlags): declared R2, 78 carrying disabled, destroyed and stage. **STATE.md:110** (Global Variables):
  channel WorldGlobal 80.

## 4. Hypotheses (rule 8)

| id | Claim | The one observation | Read by |
| --- | --- | --- | --- |
| H-F2 | A latent record row skipped with kCompleted and None leaves no stack waiting | c2's `script_state(id).quiescent` true within 1 s of its "skipped" line for that id | x-skip-latent v1 |
| H-RS1 | An owned record row crosses with its args once per self per frame | c1's "native ObjectReference.Disable on <id> state latent" line, then the server's "sets <id> disabled" line within 1 s | x-bleak-scripts v4 |
| H-RS3 | The web's burn reaches the guest through its destruction, not a Disable | c1's census has no Disable row on 1fc43 at the burn while c2 reads it disabled | x-bleak-scripts v4 (recorded) |
| H-RS4 | A reference attached by its record is served behind its create word and found by the guest's engine | c2's "ref state <id> applied (served)" line plus `refs_near` | b-ref-state-restart |
| H-RS5 | DisableNoWait before the 3D leaves the reference disabled at the cell's load | the late joiner's `refs_near` reads disabled with no later apply line | b-ref-state-restart |
| H-RS6 | A re-subscribe no longer re-enables a disabled non-item | c1's own `refs_near` after leaving and re-entering the cell | x-bleak-scripts v4 |
| H-AF0 | MS13's claw alias creates 0x39647 in an alias that ALFR or ALUA resolves to 0x39655 | AliasCreatedTest on Skyrim.esm (T0) | A4 |
| H-AF1 | Every seat's engine holds the claw alias filled from the template | `c1.alias(...).refr` and c2's both nonzero | x-alias-premise v1 |
| H-AF2 | The corpse's apply leaves the seat's own claw out of the menu | `c1.inventory(0x39655).count(0x39647)` equals the server's | x-golden-claw-alias v1 (recorded) |
| H-AF3 | An alias handle carries its quest in the low 32 bits and its alias id in the middle word | the batch's (quest, alias) for a ForceRefTo met equals the alias step's read | x-alias-premise v1 (recorded; MECHANISM ONLY if none is met) |
| H-WG1 | Outside the clock and the per-player list, under 8 values change a second | the streamer's 30 s summary lines | x-world-globals-rate v1 |
| H-WG2 | `GlobalVariable.setValue` on a receiver holds for the session | c2's read 60 s later | b-world-global v1 |
| H-WG3 | The dungeons' world-global writes come from scripts every seat runs | the SetValue census by caller has no world-object or effect caller | x-world-globals-rate v1 |
| H-ST1 | The lab's content calls a standing native | the six rows' census counts | x-standing v1 |

## 5. Probes and scenarios (one question each, ADR-064 amendment B)

- **x-skip-latent v1:** does a guest's skipped latent Disable leave its script unblocked? Frame: c1 hosts 0x9732, c2 arrives as a
  guest (the ADR's measured frame), lever `recorded`. Claims: a "skipped" line within 120 s; quiescent true; no "Bad call result"
  in c2's papyrus-log. If no latent Disable occurs, the premise is unshown and the fallback lever applies.
- **x-alias-premise v1:** where does each seat hold MS13's claw alias at login? Claims: both refs nonzero; the server's derivation
  line once at Arvel's load; the two refs' equality recorded.
- **x-world-globals-rate v1:** how many world globals change a second in Riverwood and Bleak Falls? It reads the summaries and
  claims fewer than 240 per 30 s, the budget's premise.
- **x-bleak-scripts v4:** does a world object the host's engine disables read disabled on the guest? v3.1's frame, after the
  premise probes. Claims: (1) "41 of 41" bound on both seats; (2) a cobweb's #19 Disable target (self or a linked reference, read
  by lab/pex.py first) disabled by c1's walk: c2's `disabled_of` true within 5 s, `server.ref(id).isDisabled` true and
  `refStateSeq` above 0; (3) the web burned by c1's Flames: c2's state equals c1's within 5 s (its carrier recorded); (4) c1's
  re-entry keeps the cobweb disabled; (5) no E_SCRIPTCALL_ line, and every v3.1 claim kept.
- **x-golden-claw-alias v1:** is the claw one item, the server's? Claims: (1) `server.inventory(0x39655).count("0x39647") == 1`;
  (2) the derivation line once; (3) after Arvel's death and c1's take, Arvel 0, c1 1, c2 0; (4) c1, hosting the Sanctum, opens
  0x4e2b8 at keyhole 0x4e2b9: the FXDoorOpen relay plays on c2 and stage 50 is recorded. Recorded: the alias ref before and after
  the take.
- **b-ref-state-restart v1:** does a host's disable survive a restart, for a reference the server held and one it attached by its
  record? Subjects: the cobweb, and XMarker 0x17037 through trigger 0x17038. Steps: trigger both; c2 reads; restart; reconnect and
  teleport in (a real load). Claims: both seats read as before; `server.ref` values; the served lines; a late-join leg.
- **b-world-global v1:** does the streamer's write reach every seat, survive a restart, and stay unmoved by another seat's write?
  Steps: `streamer == c1`; c1 sets G to 7 and c2 reads 7; c2 sets 9, and c1 and the server still read 7; restart; both read 7. G is
  UNKNOWN until `esm.py find Skyrim.esm GLOB` and the census name one.
- **x-standing v1:** does the lab's content call a standing native on an NPC? Riverwood at 8:00 for 120 s plus the Temple's fights;
  the counts recorded. It decides W3's trigger.

## 6. Risks, fallback, estimate, layers

**Risks:**
- **Budget:** a stage enabling a chain bursts record rows. A refused state is lost state (E_SCRIPTCALL_RATE); the census sizes it.
- **Attach by record** widens what the server holds (ADR-062 H4, DECISIONS.md:3966-3968): STAT, TACT, LIGH and SOUN references
  reach CreateActor's game-file path, where dealWithRef blocks nothing (objectReferenceEx.ts:139-141).
- **The harvested fix** touches every non-item apply: regression risk for doors and form views.
- **A quest fragment's Enable in a cell nobody hosts** is skipped on every seat and lost (the Mora stage, if nobody is at the
  outpost). Rung 5's acting-player scope decides who records it; this rung declares it.
- **If H-F2 fails:** keep `nonLatent`. The guest's lifecycle Disable runs and the served word corrects it, a flash we declare.
- **A single streamer** misses seat-owned writes and would share "Player*" globals not on the list. A census of those GLOBs seeds
  the list before b-world-global runs.
- **If MS13's Arvel alias fills by conditions,** the claw stays seat-local (E_ALIASFILL_UNRESOLVED).

**Fallback** (the smallest verified rung that still ships whole, rule 3): RefState for held references only (no attach by record,
no actor subjects, lever `nonLatent`), plus the client fixes, WorldGlobal and AliasFill's created half; the standing and
ScriptPlacement stay at T0 and T2 (W3); AliasFill's ref half MECHANISM ONLY. Proven by x-bleak-scripts v4 (a held subject),
x-golden-claw-alias v1, b-world-global v1 and b-ref-state-restart's held leg. Cost: 3 slots.

**Estimate:** 4a about 3 agent half-days, no lab slot; 4b about 2 agent half-days plus 1 for the lab grammar and docs; 2 Windows
heads; 4 stage slots plus 1 for a FIX FIRST. The ladder said "2 + 2"; the extra premise slot is amendment B's (ADR-064) cost.

**Layer split** (five agents, the interfaces fixed in section 1, integrated on m4-scripts-4-rows): wire (A5's schema half); server
(A1 to A4, A6 and A5's handlers); platform (B1); client (B2); lab (B3).

### Critical files for implementation

- W/skymp-wire/crates/wire-rules/src/natives.rs
- W/skymp5-server/cpp/server_guest_lib/ActionListener.cpp
- W/skymp5-server/cpp/server_guest_lib/WorldState.cpp
- W/skyrim-platform/src/platform_se/skyrim_platform/ScriptNatives.cpp
- W/skymp5-client/src/services/services/remoteServer.ts
