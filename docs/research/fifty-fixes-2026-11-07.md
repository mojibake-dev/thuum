# Playtest 50's three fixes: the trigger entry channel, the lever's motion, the record's graph variables (2026-11-07)

A read-only planning agent's build plan, 2026-11-07 (PST morning), against fork m4-scripts-4-rows 42f40f84 (ADR-068 rung 4, the
pillar view fix bb24886d, mp racemenu 0498a2f0; SCHEMA_VERSION 39). It makes concrete three things decided or pending for playtest
50 (docs/DECISIONS.md:4797-4822, "D-W1 and D-C2"; D-S3 above it at :4736-4760; D-L1 B at :4824-4836):

1. The trigger entry channel, D-W1 A and D-C2 A as one rule: a trigger volume's entry counts once, on its presser's owner, and
   travels to the trigger script's owner.
2. The puzzle lever's motion (0xaa8c3, a NoPlayer FURN): the toucher's engine's event on the furniture's own graph crosses to the
   furniture's other listeners, as a rule over furniture.
3. D-C3, PENDING ELI, planned as option A: the script record's view carries a world object's graph variables beside its last
   animation event. (This D-C3 is the cobweb view question; docs/private/container-hold-scope.md's D-C3 is another memo's.)

Inputs: the static reads lab/.cache/drafts/fifty/trigger-entry-static.md and lever-furn-static.md (re-read at 00:43 PST, after
their last edits), their probes x-trigger-entry v1 (sha1 68b5fc15) and x-lever-furn v1 (sha1 3e693ed6), both drafts awaiting
their fresh reviews (ADR-064 amendment A). Nothing here ran on the lab; no code was edited.

Path roots: W is the fork at 42f40f84; SP is W/skyrim-platform/src/platform_se/skyrim_platform; client is
W/skymp5-client/src/services/services; server is W/skymp5-server/cpp/server_guest_lib; wire is W/skymp-wire/crates; CL is
CommonLibSSE-NG b93280e8 (include/RE unless named); thuum is this repo; F is thuum/lab/.cache/drafts/fifty. The static reads cite
the fork at 10b3edcb; between 10b3edcb and 42f40f84 only objectAnimationService.ts, scriptStateService.ts, spSnippetService.ts,
console.rs, ConsoleCommands.cpp and two unit tests changed (`git diff --stat 10b3edcb 42f40f84`), so their FridaHooks.cpp and
ActionListener.cpp lines hold. Tags as in the static reads: CONFIRMED-STATIC for a header, `just addr` or the fork's source;
HYPOTHESIS for a decompile or an inference until a trace or a lab run reads it (rule 2).

The sibling branch m4-scripts-4-login d236164e (D-L1 B) touches skymp5-client index.ts, hostService.ts (+5 lines) and a new
loginCellService.ts (`git diff --stat 30f8a947 d236164e`); this plan adds no service and touches neither hostService.ts nor
SendScriptEvent's signature, so the two merge without a shared hunk.

## Reads that change the design

1. **The animation hook cannot cross into JavaScript under Override; the lever's event has to cross on its own, later.**
   - A non-latent callNative runs inside `Override o;` (CallNativeApi.cpp:150-153), which posts the native to the update thread
     and waits for it (SkyrimPlatform.cpp:466-477, PushToWorkerAndWait). The animation hook's dispatch to its handlers is
     PushAndWait to the JavaScript pool (Hook.cpp:73-86; SkyrimPlatform.cpp:450-456). Inside the client's own
     `activate(player, true)` the pool is the waiting thread, so a synchronous crossing there would never return: the reason the
     hook returns at FridaHooks.cpp:688.
   - The static read's first option for F1(a), the Override test narrowed to the calling thread, does not reach the lever: the
     event is raised on the calling thread, inside the platform's own call, where PlatformCall's thread-local depth is up as well
     (PlatformCall.h's Scope, the direct path).
   - So the furniture branch is filtered in native and crosses as its own custom event through a tick task, propContact's shape
     (FridaHooks.cpp:2236-2243: AddTickTask, then EventsApi::SendEvent), never through the hook's handlers.
2. **The relayed entry needs no argument class of the platform's own, and the gate never has to recognize one.**
   - SendScriptEvent takes the three lifecycle events alone and builds a ZeroFunctionArguments (ScriptState.cpp:1398-1401, :1437).
   - CommonLibSSE-NG already has the one-object argument: `RE::FunctionArguments<Args...>` (CL/F/FunctionArguments.h:27-73, the
     alias at :77, MakeFunctionArguments :79-88) packs each argument through Variable::Pack; a form pointer goes to PackHandle, which finds the
     reference's bound script object or creates and binds one (CL src/RE/P/PackUnpack.cpp:48-80). That is the engine's own
     packer's behavior for SingleObjectRefrHandleArgument (trigger-entry-static.md 2.10 and 3.1, HYPOTHESIS there).
   - The relay is played through callNative, under Override, and the gate's Override return (FridaHooks.cpp:314-324) comes before
     any read of arg 3. The static read's open item ("what D-W1's gate does with an OnTriggerEnter whose arguments are not the
     engine's class", section 8) closes: it never meets one.
   - D-L1 B calls SendScriptEvent with three arguments through callNative (scriptStateService.ts:1063, and its LoginCellService).
     Widening that native's arity would break both callers, so the argument path is a twin native over the same body
     (SendTriggerEvent below), one mechanism with two entry points by argument shape.
3. **No new message carries any of this.** The next free MsgType, 81, stays free.
   - An entry has the shape of an activation: an actor, a reference, and the event the reference's script hears with the actor as
     its argument (OnActivate(akActionRef), OnTriggerEnter(akActionRef)).
   - RelayedActivation 70 already means "the receiver's engine plays this interaction with this caster" (wire-schema skymp.rs:2064-2080).
   - Activate 6 is already the seat's interaction report, and the server already branches on its shape before the activation flow:
     a reference activating itself (ActionListener.cpp:2174) and a non-actor caster (:2203-2213).
   - So one optional field on each carries the entry. ScriptCall 75 does not fit: it carries a native a script called, and an entry
     is an event a script receives, seen by the gate and never by the seam. ObjectAnimation 71 does not fit either: it carries a
     graph event.
4. **The server has no trap family test.**
   - The family is the platform's walk of the VM's class chain (TrapFamily.cpp, "THE ONE PLACE THE FAMILY IS NAMED").
   - The server reads no script archive in the lab: a BSA is added only from a settings `archives` key
     (ScriptStorageFactory.cpp:48-63, the key at :54-56), and thuum lab/deploy/sky-srv/server-settings.json has none.
   - So the server cannot tell a family trigger's pair from a mechanism's. A family pair taken from a seat that does not host the
     cell is R2, the reporter's word that its engine fired the trigger, bounded by the game files' link, the loader test, the
     budget and a reach (rule 5).
   - D-S3 phase 2's VMAD read of playerOnlyTrigger (RecordSetsPlayerOnlyTrigger, ActionListener.cpp:3655-3700; its cache, :4965-4985)
     dissolves into that rule: a player-only trigger is a family trigger fired on its player's own seat.
5. **Only the first link of a firing crosses.**
   - Embershard's tripwire 0xb6d3f activates its linker 0xb6d3e after 0.5 s (XAPR), and the linker's default processing activates
     nine children (docs/research/trap-census-2026-11-05.md row 16).
   - If every seat reported every family pair it saw, a receiver would report the chain's later links back to the presser's seat:
     an echo, and nine pairs against the eight-a-second budgets (activationService.ts:216; the server's withinBudget in
     OnLinkedActivation).
   - So the firing seat reports the pairs whose trigger fired there (the root), and each seat's engine propagates the rest from the
     relayed root. This is lockstep's discipline applied to one chain: the cause crosses, each engine computes the consequences
     (outside sources 1).
6. **Gate scenarios encode D-S3's decision 1.**
   - b-object-anim.yaml:108-109 and :156-157 claim both seats' "trap 54b15 fired here by 567f2: every seat fires the trap family
     itself" rising for one press. b-bleak-traps.yaml:229-233 and :367-371 claim the same lines through snapshots.
   - Under D-W1 the receiving seat fires from the relay, so that line's tail changes on both seats.
   - Both scenarios are in the gate set, so their rewrite goes to Eli first, one scenario at a time (ADR-064 decision 4), each in
     its own commit (rule 13). It is a pattern change: both seats must still fire.
   - b-trap-record-restart.yaml:161-170 only records its chain lines, so no claim of it changes.
7. **D-C3's variables are served as kept at the serve, each with its own sequence, not stamped at the record's take.**
   - The view is `refr->GetLastAnimation()` copied at the record's accept (ActionListener.cpp:4657-4659) and served as it was
     (MpObjectReference.cpp:845-858).
   - An owner reports a record only at a stack's end that moved the scripts' hash (OnScriptState's note, ActionListener.cpp:4666-4667).
     So a stack whose only act is SetAnimationVariableFloat takes no new record, and a view stamped at the take would miss it.
   - Today the three SetAnimationVariable rows keep nothing (natives_table.rs:28-30, Keep::Nothing). The platform's NativeRows.inc
     has no keep column (NativeRows.inc:18-20). So the table change is the server's alone.
   - The view past a 3D unload (bb24886d's kept last animation, objectAnimationService.ts:655-694) has to carry the variables too: a
     graph variable lives on the 3D's graph.
8. **A furniture use's event is never kept.**
   - The server writes every accepted ObjectAnimation as lastAnimation (ActionListener.cpp:3875), which a late joiner replays from
     its create word.
   - The client keeps a relay and re-plays it at each 3D load (objectAnimationService.ts:659-680).
   - A lever that returns to rest would then push again at every late join and every reload. So a FURN's use event is relayed and
     kept nowhere, unless x-lever-furn's A3/B3 read the arm off rest after the push (H-LF7; the static read's "the record").
9. **The lab's activationUnblockedBases key is dead.**
   - It names the lever's base b7db4 (thuum lab/deploy/sky-client/skymp5-client-settings.txt:16), but no code in the fork reads it
     (`git grep activationUnblockedBases 42f40f84` is empty).
   - So the FURN block on every seat (objectReferenceEx.ts:128-141) stands as lever-furn-static.md step 1 says.
10. **The presser rule leaves OnTrigger alone.**
    - The continuous event comes twice every half second per occupant (wordWallService.ts:6-11).
    - The word wall's read of it is the JavaScript sendPapyrusEvent hook, raised before the gate's blank (FridaHooks.cpp:409), so
      nothing here touches it.

These refine D-W1 and D-C2's mechanism inside their text; no decision changes. Reads 3 and 5 are the two a reviewer should hold
against the decision's words ("relays the firing ... as the trap's linked activation"; "a guest's entry is relayed to the cell's
host").

## 1. Interfaces, fixed up front

### The rule, per piece of state

| Piece | Owner | Observed at | Crosses as | Rung | A non-owner |
| --- | --- | --- | --- | --- | --- |
| A trigger volume's entry (OnTriggerEnter, OnTriggerLeave) by an actor | The presser's owner: the seat whose player it is; an NPC's simulator; a body's cell host (bodies are not props until M4); a trap body's streamer | The gate, arg 3's actionRef | Nothing for a family trigger (its firing crosses); for a world trigger on a seat that does not host the cell, Activate {entry} to the server, then RelayedActivation {entry} to the cell's host | R2: the presser's owner's engine computes, the server relays, records nothing | Blanks it |
| A trap family trigger's firing: its own activation and its first links | The seat it fired on (the presser's owner) | ActivationService's activate events | Activate, unchanged shape, from that seat; RelayedActivation 70 to every other listener | R2 | Its target fires from the relay |
| A firing's later links (a linker's nine children) | Each seat's engine, from the relayed first link | none | nothing | R3, declared: each engine propagates; single-use results stay DestructionStage's, trap bodies the prop stream's (D-S3 decisions 3 and 4) | Its own engine |
| The trigger's own Down, Up and sound | The firing seat | none | nothing | R3, declared: a figure stands on an Up plate on the other screens while the wall swings | none |
| A world trigger's script run | The cell's host | The gate passes it there | Its consequences, ScriptCall 75 as today | unchanged | Blanked (unchanged) |
| A furniture's own graph event during a use | The use's owner: the recorded occupant's owner (a player's seat, an NPC's simulator), else the cell's host | The platform's animation hook, a FURN holder, async | ObjectAnimation 71, shape unchanged | R2: the user's engine computes; the server checks the user and relays; kept nowhere | Plays it |
| A world object's graph variables (D-C3 A, pending) | The cell's host, the action rows' owner | The seam, ScriptCall 75 (unchanged) | SpSnippet 30 live (unchanged); kept on the reference and served in ScriptStateApply 77 | R2 | Applies the relay and the served view |

A non-actor presser (a prop, a thrown item) passes on every seat as today: D-W1 names actors. The one exception is a trap body
another seat streams (TrapFamily::Followed), which is its streamer's.

### (a) Wire (one SCHEMA bump, 39 to 40, wire-schema lib.rs:103)

- **ActivateData** (MsgType 6, skymp.rs:413-425) gains `entry: Option<u8>`.
  - 1 means OnTriggerEnter, 2 OnTriggerLeave: the presser's owner's report of an entry into a trigger whose world script runs on
    the cell's host (D-C2). Absent on every activation.
  - `caster` is the presser: 0x14 for the sender's own player, or an actor it simulates. `target` is the trigger.
  - New check_activate (wire-validate; today Activate falls to the shared arm, lib.rs:1690-1720): with `entry` set, it must be 1
    or 2, isSecondActivation false, caster not 0, target not 0 and below 0xff000000, else E_VAL_RANGE.
  - An `entry_budget` in ClientGuard (lib.rs:75): 8 at once, then 4 a second per sender (UNMEASURED), taken only by an Activate
    with `entry`; E_VAL_RATE.
  - MAX_ENCODED_LEN 64 (lib.rs:650) kept unless the codec's size test says otherwise.
- **RelayedActivation** (MsgType 70, wire id 78, skymp.rs:2064-2080) gains `entry: Option<u8>` with the same values.
  - The receiver sends that event to the target's scripts with the caster as akActionRef, instead of activating.
  - It goes to the cell's host alone.
  - check_relayed_activation (lib.rs:857-862): entry absent, 1 or 2, else E_VAL_RANGE.
  - MAX_ENCODED_LEN 16 to 24 (lib.rs:714), by the size test.
- **ScriptStateApply** (MsgType 77, wire id 85, skymp.rs:2413-2440) gains `graph_vars: Option<Vec<GraphVar, { cap::GRAPH_VARS }>>`.
  This item is PENDING ELI (D-C3 A).
  - `GraphVar { name: String<ANIM_EVENT>, k: u8, i: Option<i32>, f: Option<f32>, b: Option<bool>, seq: u32 }`. k takes
    ScriptVar's folded kinds, 3 int, 4 float, 5 bool (skymp.rs:2328-2346), so a typed value has one encoding in the schema.
  - `cap::GRAPH_VARS` = 16 (UNMEASURED).
  - check_script_state_apply (lib.rs:1407-1412) grows a check:
    - E_VAL_RANGE: a name empty, carrying a NUL, or named twice; a k outside 3 to 5, or a payload that is not exactly its k's;
      a seq of 0.
    - E_VAL_NONFINITE: an f that is not finite.
  - 256 KiB kept (lib.rs:729).
- **Unchanged:** ObjectAnimation 71 (its owner rule moves to the server's Rust, its shape stays), ScriptCall 75, ScriptState 76.
- **Fixtures** (wire-json/fixtures):
  - 06-Activate-2: c2's own player entering the web 0x37281.
  - 06-Activate-3: an entry with isSecondActivation true, refused.
  - 70-RelayedActivation-2: the entry to the host, caster 0xff000001.
  - 70-RelayedActivation-3: entry 3, refused.
  - 77-ScriptStateApply-2: 0x3758c's fToggleBlend, k 4, f 1.0, seq 1.
  - 77-ScriptStateApply-3: a variable named twice, refused.
- **C++:** ActivateMessage.h (data.entry), RelayedActivationMessage.h (entry), ScriptStateApplyMessage.h (graphVars). The fixture
  and the struct land in one commit (WireJsonContractTest reads every fixture). wire-legacy reads the three as absent
  (LEGACY_ABSENT, CreateActor's precedent in docs/WIRE.md).
- **Difftest sessions:**
  - trigger-entry: a fake guest's entry relayed to the fake host, then its refusals E_ENTRY_HOST and E_ENTRY_PRESSER.
  - graph-vars: a fake host's SetAnimationVariableFloat call, kept and served behind a late fake client's create word. Its
    declared floats are exact.
- **docs/WIRE.md** gets three rows: Activate's entry, RelayedActivation's entry (its section at :900), and ScriptStateApply's
  graph_vars (its section at :836).

### (b) Platform

**The gate's presser rule** (FridaHooks.cpp OnSendEventEnter, :261):
- Where: after the record-death, record-apply and Override returns (:273-324) and the pending blank, for an OnTriggerEnter or an
  OnTriggerLeave (without case) to a world object (:417's worldObject), with the block on (blockEvents, :421).
- Reading the presser:
  - The argument is arg 3 (R9; SendEvent's signature in the hook's comment, :260).
  - Its first word is compared with CommonLib's `RE::VTABLE___SingleObjectRefrHandleArgument[0]` (CL/Offsets_VTABLE.h:4309,
    Address Library 217161, CONFIRMED-STATIC), resolved once in the platform's Relocation idiom.
  - On a match the presser is `*(RE::TESObjectREFR**)(args + 0x08)`. HYPOTHESIS H-TE1: the sink stores it there, the packer reads
    it there and the destructor releases it there (trigger-entry-static.md 2.6, 2.10).
- Owned presser:
  - 0x14.
  - A dead actor (TESObjectREFR::IsDead, CL/T/TESObjectREFR.h:353) whose parent cell this seat hosts (Frida::IsCellHosted).
  - A live actor with `Hosted::Is && !Puppets::Is`, the gate's own simulatedActor test (:418-419). That is false for a figure
    and for a puppet.
  - A non-actor, unless TrapFamily::Followed::Is (TrapFamily.h).
- Not owned: the event is blanked.
  - Line: "[verb:traps] <event> to <trigger> by <presser>: not this seat's presser, ignored (D-W1) (<n> so far)", the first
    three and every hundredth (the gate's idiom).
- Owned, on a family trigger, or on a world trigger in a cell this seat does not host:
  - The event "triggerEntry" `{ refrId, presserId, enter, family }` goes through AddTickTask (read 1).
  - The event itself then falls through the gate as today: a family trigger's passes and a guest's world script is blanked.
  - TrapFamily::IsFamily is asked for trigger events in a hosted cell too; its verdict is cached per class.
- An argument of another class passes as before, counted, with one line per minute.
- Cost (rule 9): trigger events alone, one compare and one load each.
- Kill switch: the export `setTriggerPresserRule(bool)` in PuppetApi.cpp beside GetTrapRole (:382). Off by default in the
  platform, so an older client keeps D-S3. The client turns it on from its setting `triggerPresser` (default true, false the A/B).

**The native `TESModPlatform.SendTriggerEvent(ObjectReference trigger, String name, ObjectReference actionRef) -> String`:**
- It sends OnTriggerEnter or OnTriggerLeave to the trigger's scripts and relays it to its aliases: SendImpl's body
  (ScriptState.cpp:1376-1452, SendEvent and then SkyrimVM::RelayEvent under PlatformCall::Scope).
- The argument object is `RE::BSScript::FunctionArguments<void, RE::TESObjectREFR*>` holding the actionRef, in place of the
  ZeroFunctionArguments. It is held on the stack, since SendEvent consumes its arguments before it returns (ScriptState.cpp's
  H-R10).
- Answers `{ formId, event, sent, scripts, reason }`. Refuses: a name that is no trigger event, a None actionRef, an actor trigger.
- It runs on the update thread inside TESModPlatform.Add's Call (callNative's direct path, as SendScriptEvent), with no C++
  exception leaving it.
- Files:
  - The binding beside SendScriptEvent (PapyrusTESModPlatform.cpp:1677-1684) and its registration (:2091-2093).
  - ScriptState.h and ScriptState.cpp.
  - TESModPlatform.psc beside :139, and the pex by `lab/pex.py add-native`, checked with `lab/pex.py dump`.
  - The NATIVES.md line, rule 10: R2, papyrus-events, "Client only: a relayed trigger entry sent to a reference's scripts with
    its presser as akActionRef ...".

**The furniture branch** (FridaHooks.cpp OnSendAnimationEventEnter :676-714 and its Leave :716-723):
- A thread-local note stack: every enter pushes one note (empty unless it is a furniture note) and every leave pops one, so
  enter and leave pair under nesting, whatever branch returns early.
- A furniture note: a holder whose base is a FURN (`refr->GetBaseObject()->GetFormType() == RE::FormType::Furniture`), outside a
  script action, under Override or not. :688's one test splits in two: InScriptAction's return stays first (a script's own call
  on a FURN is the seam's), then the furniture note, then the Override return for every other holder. A furniture event never
  reaches the hook's handlers, so there is no PushAndWait and no name pattern.
- At the leave, the return value read, "furnitureAnimation" `{ refrId, event, took }` goes through AddTickTask.
- Line: "[verb:furniture] <refr> '<event>' to its own graph (taken|refused, thread <t>)", the first three per reference and
  every hundredth.
- Kill switch: `setFurnitureAnimation(bool)`, off by default in the platform; the client's setting `furnitureAnimation`
  (default true) turns it on.
- It rests on H-LF6 (the hook sits on 32901, where a world object's graph event passes; x-object-anim v3 read a plate's Down and a
  wall's 180For there, memory skyrim-papyrus-lifecycle-under-the-gate). If H-LF6 falls, the same handler is installed a second
  time on VTABLE_TESObjectREFR[3]'s slot 1 (CL/Offsets_VTABLE.h:649, 190265), through CommonLib's vtable, never an address from
  memory.

**Declarations:** EmplaceEvent("triggerEntry") and EmplaceEvent("furnitureAnimation") in EventManager.cpp's custom list
(:14-49), Definitions.txt, and the regenerated skyrimPlatform.ts. The client's module augmentation is (d)'s (memory
skyrim-platform-new-event-types: all three or the client build fails).

### (c) Server

**`wire-rules/src/trigger_entry.rs`** (new): one module for the one rule, with two judgments through the bridge
(wire-bridge/src/rules.rs, the cxx shape of ScriptStateFacts :1547).
- `firing_source(facts) -> verdict`, for a trigger's own activation (caster equals target) or its linked pair:
  - Accepted from the cell's host, as today.
  - Accepted from a game that has the cell loaded (PartOne::GetCellLoaders), when one of its actors stands within the trigger's
    activation reach (wire-rules activation within_reach, over ActivationTargetSize) plus FIRING_SLACK 512 (UNMEASURED). Its
    actors are its player, or an actor WorldState::HostOf names it for.
  - Refusals: E_TRAP_NOT_HOST (neither the host nor a loader; the code kept, so b-puzzle-relay.yaml:89's claim keeps its
    meaning), and E_TRAP_FAR (new).
  - The link (E_TRAP_UNLINKED) and the budget (E_TRAP_RATE) stay the handler's.
- `entry(facts) -> verdict`, for an Activate with `entry`:
  - The trigger is a world object the server holds or places by its record (E_ENTRY_NO_REF), and no actor (E_ENTRY_ACTOR).
  - The presser is the reporter's own actor or one it simulates (E_ENTRY_PRESSER).
  - The reporter has the cell loaded (E_ENTRY_NOT_LOADER) and does not host it (E_ENTRY_HOST: its own engine ran the script).
  - A host exists (E_ENTRY_NO_HOST: nothing runs the script; the line says so).
  - The presser is within the trigger's activation reach (E_ENTRY_REACH, UNMEASURED: the cobweb slab is the record's bounds at
    scale 1.83, trigger-entry-static.md section 6).
  - Accepted: relayed to the host alone.

**`wire-rules/src/object_animation.rs`** (new):
- The owner of a world object's graph event:
  - for a FURN with a recorded occupant (MpObjectReference.h:389, set at MpObjectReference.cpp:2276-2298), that occupant's
    owner: a player's own user, or an NPC's simulator (WorldState::HostOf);
  - for anything else, the cell's host.
- Refusals: E_OBJANIM_NOT_HOST, kept for the host case; E_OBJANIM_NOT_USER (new), a FURN whose occupant is another's.
- `keep`: false for a FURN (read 8), true otherwise.
- The C++ shell keeps the actor, DOOR and CONT skips, the range checks and the per-reference 8 a second (ActionListener.cpp:3803-3870).

**The table** (natives_table.rs:28-30): SetAnimationVariableBool, Int and Float go from Keep::Nothing to a new Keep::Variable
(natives.rs:146-169), still relayed as actions. Keep::Variable keeps the call's (name, value) on its subject with the call's
sequence. The bridge's ScriptCallVerdict (rules.rs:1500) gains `keep_var`. PENDING ELI (D-C3 A).

**The record** (rule 6), PENDING ELI (D-C3 A):
- MpChangeFormREFR gains `graphVariables: optional<vector<{ name, k, i|f|b, seq }>>`, beside lastAnimation (MpChangeForms.h:174).
- At most 16 per reference; a new name past that replaces the oldest.
- Saved under the key "graphVariables". An absent key reads as none and formVersion is kept: this fork's migration for a new
  field, fb0c3396's shape.

**Handlers:**
- OnActivate (:2157):
  - An Activate carrying `entry` goes first to a new OnTriggerEntry, judged by trigger_entry.rs's `entry`. On accept,
    RelayedActivation `{ target, caster: the presser, entry }` goes to the host's user alone.
  - The self-activation branch's host test (:2188-2195) becomes `firing_source`, with NoteTrapFiring as today.
- OnLinkedActivation's fromHost and player-only block (:4941-4985) becomes `firing_source`. The relay to every listener but the
  reporter (:5002-5016) is unchanged, so the host plays a guest's root too.
- OnObjectAnimation's host test (:3856-3861) becomes object_animation.rs, and lastAnimation follows its keep (:3875).
- OnScriptCall (:4482): `keep_var` writes the variable with the verdict's seq. A placement by record keeps nothing, as
  lastAnimation's rule there.
- BuildScriptStateApply (MpObjectReference.cpp:845-858) copies the reference's current graphVariables into the served apply
  (read 7).

**Lines** (the shapes probes grep):
- "[verb:traps] <reporter> reports <presser> entering|leaving <trigger> in cell <c> (its host <h>): relayed to the host"
- "[verb:traps] <trigger> activates <target> in cell <c> (<reporter> reports with the cell loaded, its firing): relayed to <n>
  game(s)"
- "[verb:traps] <refr> animates <refr> '<event>' in cell <c> (its user <u> reports): relayed to <n> game(s), not kept", today's
  line with the reference twice (ActionListener.cpp:3889-3892), keeping the "<refr> animates" head that x-lever-furn's claim 5
  counts.
- "[verb:scripts] script state <id> served ... view '<e>', <n> graph variable(s)"

**T0 tests:**
- TriggerEntryTest: the relay and each refusal.
- LinkedActivationTest: a loader's family pair accepted and relayed to the host; a non-loader's refused; E_TRAP_FAR.
- ObjectAnimationOwnerTest: the occupant's report accepted and not kept; another's E_OBJANIM_NOT_USER; a guest's non-FURN still
  E_OBJANIM_NOT_HOST; an NPC occupant's simulator accepted.
- ChangeFormTest: graphVariables round trip; an old record reads none.
- ScriptCallTest: a variable kept and served.
- The wire-rules crate tests, and proptests for each new validator branch (.claude/rules/rust.md).

### (d) Client

**ActivationService** (activationService.ts), the root rule:
- The marks:
  - A "triggerEntry" with family and enter marks the trigger pressed here.
  - A family trigger's own activation (caster equals target, :104-118; trapRole's family and trigger fields, objectReferenceEx.ts:82-96)
    marks it fired here. It is reported from this seat, whichever seat it is, through the same Activate. Any other trigger's own
    activation is reported by the host, as today.
- A linked pair (caster other than target, :65-102) is judged in order:
  1. The relay's own play (RelayedActivationService.wasPlayedHere): not reported.
  2. A caster that is a family trigger pressed or fired here within FIRED_MS, and not played here by a relay in that window:
     reported. This is the root, D-W1, whatever the target.
  3. A target in the family: not reported. A later link: each seat's engine propagates it from the relayed root.
  4. Otherwise: the cell's host's, as today (:98-102).
- FIRED_MS = 5000 (UNMEASURED; the longest delay read is the tripwire's XAPR 0.5 s).
- A "triggerEntry" without family sends `Activate { caster: presser (0x14, or localIdToRemoteId), target: trigger,
  isSecondActivation: false, entry: enter ? 1 : 2 }` (D-C2), within its own second window of 4 beside linkedBudget (:216).
- Lines:
  - "trap <t> fired here by <c>: the presser's owner's firing, reported (D-W1)"
  - "... the relay's own play, not reported again (D-W1)"
  - "... a later link of a firing, each seat's own (D-W1)"
  - "trigger entry <t> by <p> (enter|leave): relayed to the cell's host (D-C2)"

**RelayedActivationService** (relayedActivationService.ts:41-56):
- An `entry` plays `this.sp.callNative("TESModPlatform", "SendTriggerEvent", undefined, target, entry === 1 ? "OnTriggerEnter" :
  "OnTriggerLeave", caster)` on the update, where natives are legal (SendScriptEvent's call shape, scriptStateService.ts:1063).
  Line: "relayed entry <t> by <c>: <answer>".
- Every play marks its target relay-played for FIRED_MS, which rule 2 above reads.

**ObjectAnimationService**, the furniture (objectAnimationService.ts):
- "furnitureAnimation" pushes into the noted queue with `furniture: true`.
- onUpdate (:286-338) keeps its took and self-played filters. Its owner test for a FURN replaces isHostedHere (:330):
  - this seat's use: an OpenContainer message's target, kept by id in the message handler (JS state alone; only a FURN's graph
    ever raises the furniture event), so the mark is up before remoteServer's reply runs its `activate(player, true)`
    (remoteServer.ts:299); it lasts until the closing activation or USE_MS 20000 (UNMEASURED), or while
    `getFurnitureReference()` names it;
  - or the reference's cell hosted here (an NPC's use).
- keepsFor (:692-694) never keeps a FURN.

**D-C3 A (pending)**, three services:
- ScriptStateService.onRecord (:606-660) holds `m.graphVars`. At the apply, before the view's replay (:980-995), it sets each
  variable whose seq is above this seat's kept seq for (reference, name), through setAnimationVariableBool, Int or Float: the
  platform's own calls, which the seam never re-reports.
- ObjectAnimationService.keep (:659-680) carries a per-reference map of variables beside the event. Its 3D-load re-apply sets
  them before it plays the event.
- SpSnippetService.apply (:86-96) routes a relayed SetAnimationVariable call with a seq on a game-file reference through
  ObjectAnimationService.setVariable (run, then kept), as it routes PlayAnimation today.

**clientListener.ts:** the two events' module augmentation. The two settings, `triggerPresser` and `furnitureAnimation`, read as
scriptRecord is read (objectAnimationService.ts's constructor); with one off, its old branches stand, so the switch is a true A/B.

### (e) Lab (thuum)

- No new driver step: graph-vars reads floats (lab/driver/src/index.ts:1889-1908), and node-rotation, npc-hold, kill-ref and
  server-console MoveTo exist.
- lab/frida/trigger-entry-trace.js and lever-furn-trace.js (branch r50-reads) reach lab-api's image through a thuum main push;
  the premise slot's stage takes LABAPI=<that pipeline id>.

## 2. Commits, inside-out

| # | Layer | What | Proof |
| --- | --- | --- | --- |
| S1 | server | trigger_entry.rs (firing_source, entry), its bridge structs | crate tests, proptests |
| S2 | server | D-W1's handlers: the self-activation and OnLinkedActivation through firing_source; RecordSetsPlayerOnlyTrigger and playerOnlyTriggers deleted | T0 LinkedActivationTest |
| S3 | server | object_animation.rs, OnObjectAnimation's occupant facts, a FURN kept nowhere | T0 ObjectAnimationOwnerTest |
| S4 | server | Keep::Variable on the three rows, keep_var, graphVariables and its key, OnScriptCall's write (PENDING ELI) | T0 ChangeFormTest, ScriptCallTest |
| W1 | wire (and server handlers) | Rule 4 in one commit: SCHEMA 40; the two entry fields and graph_vars (if D-C3 A); check_activate, entry_budget, the two grown checks; six fixtures; the three C++ structs; OnTriggerEntry and the relay; BuildScriptStateApply's variables | cargo test and clippy over the whole workspace (memory fork-wire-tests-whole-workspace), WireJsonContractTest, T0 TriggerEntryTest, T2 difftest trigger-entry and graph-vars |
| P1 | platform | The gate's presser rule, triggerEntry, setTriggerPresserRule; SendTriggerEvent, its .psc line, pex and NATIVES.md line | T1 Windows build; `lab/pex.py dump` greps the name |
| P2 | platform | The furniture branch, furnitureAnimation, setFurnitureAnimation | T1 Windows build |
| C1 | client | ActivationService's root rule and entry sender; RelayedActivationService's entry play and marks; triggerEntry's augmentation; triggerPresser | tsc and webpack |
| C2 | client | ObjectAnimationService's furniture path and owner test; furnitureAnimation's augmentation | tsc and webpack |
| C3 | client | The view's graph variables (ScriptStateService, ObjectAnimationService, SpSnippetService) (PENDING ELI) | tsc and webpack |
| L1 | lab | b-object-anim's rewrite for D-W1's lines (Eli first) | T3 |
| L2 | lab | b-bleak-traps' rewrite (Eli first, after L1) | T3 |
| L3 | lab | b-lever-relay v1 (new) | T3 |
| L4 | lab | b-cobweb-view v1 (new; rule 6's restart for graphVariables) | T3 |
| D1 | docs (thuum) | docs/verbs/trigger-entry.md and docs/verbs/furniture.md (new verb docs, docs/VERB.md's shape), papyrus-events.md's record section (D-C3), pointers from traps.md (H-P1 closed into furniture.md), WIRE.md's three rows, NATIVES.md by `just ledger` | review |

- **4c** = S1 to S3: server-only and no schema, so R0 under ADR-053, merged into m4-scripts-4-rows on T0 and T2 ahead of the rest.
  S2 and S3 only widen what the server accepts, and an old client sends nothing they refuse. S4 is server-only too, but it waits
  for Eli's D-C3 answer (memory feedback-built-ahead-does-not-merge).
- **4d** = W1, P1, P2 and C1 to C3: one Windows head, then a fresh review (ADR-064 rule A). The schema bump changes netcode's
  protocol id, so W1 never stages without the client built from the same tree (memory lab-schema-mismatch-no-connect).
- W1 waits for Eli's D-C3 answer, so the bump happens once. If the answer is not A, W1 drops graph_vars, S4, C3 and
  x-cobweb-view park, and L4 keeps its first leg alone.
- Probes live by path in lab/.cache/probes and are no commits. Each scenario is its own commit (rule 13).

## 3. Retirements

- **activationService.ts:80-92**, D-S3 phase 2's player-only branch: the root rule covers it.
- **activationService.ts:94-97**, point 5's "every seat fires the trap family itself, not reported": only a later link stays
  unreported (rule 3).
- **activationService.ts:104-118's host test** for a family trigger's own activation.
- All three retire at the switch's removal after playtest 50's T4 close; until then they are the A/B's off branch
  (.claude/rules/native.md, every hook a kill switch).
- **ActionListener.cpp:3655-3700 and :4965-4985, ActionListener.h:555**: RecordSetsPlayerOnlyTrigger and its cache, deleted in S2.
  The server half needs no switch: an old client never sends a pair the new rule refuses.
- **ActionListener.cpp:2188-2195** (the host-only self-activation) and **:3856-3861** (the C++ host test, now Rust).
- **relayedActivationService.ts's header HYPOTHESIS** "a relayed trap this game's own engine also fires (both players on one plate)
  plays twice": one press is one firing per seat now. Two presses by two owners still give two, declared.
- **lab/deploy/sky-client/skymp5-client-settings.txt:16**, activationUnblockedBases (read 9). The three scenarios' relaunch lines
  that lay it are harmless and stay until their next rewrite.
- **The static read's F2** (the watcher lends its own player: side effects on the wrong actor) and **F3** (no script native
  animates the lever): rejected. **F4**, the figure's furniture enter, is parked behind H-LF3.
- **docs/verbs/traps.md's H-P1** closes into furniture.md.

## 4. Hypotheses (rule 8)

| id | Claim | The one observation | Read by |
| --- | --- | --- | --- |
| H-TE1 | The engine's OnTriggerEnter and OnTriggerLeave argument is SingleObjectRefrHandleArgument (vtable 217161) with the actionRef at +0x08 | The ready row's argOk, enterSinkOk and leaveSinkOk true, and every pack row agree true, on both seats | x-trigger-entry v1 (PREMISE: P1's gate waits for it) |
| H-TE2 | A figure and a puppet press a non-owner's copy | Enter rows naming the figure (case 2) and the puppet (case 3) on the watcher | x-trigger-entry v1 (recorded; the defect's premise) |
| H-TE3 | The host's engine delivers a guest's figure into the host's web | c1's rows for 0x37281 in leg W1 | x-trigger-entry v1 (recorded: either answer keeps the design, since the host ignores the figure and the relay carries the entry) |
| H-W1 | The press mark, or the trigger's own activation, reaches the client before its first link | Per leg, the order of "trigger entry" or "fired here" lines before the pair's line | x-trigger-owner v1 |
| H-W2 | A plate last left by a presser the gate ignored stays in its DoNothing state until an owned press counts again (PressurePlate refreshes objectsInTrigger on enter and leave, trigger-entry-static.md section 5) | The mixed leg's second owned press fires or not | x-trigger-owner v1 (recorded), after the static read of TrapTriggerBase's and PressurePlate's OnTriggerLeave by `lab/pex.py disasm` (rule 8: static first) |
| H-W3 | FunctionArguments<TESObjectREFR*> packs as the engine's own argument | The host's pack row under the relay: agree true, its Object's handle the figure's | x-cobweb-relay v1 with trigger-entry-trace.js |
| H-C2a | The host's FXtriggerAmbFX tears a web for a relayed entry (it never reads akActionRef: CONFIRMED-STATIC by pex, trigger-entry-static.md section 6) | The server's "reports ObjectReference.SetAnimationVariableFloat on 37281 ... from FXtriggerAmbFX.OnTriggerEnter" relayed to 1 | x-cobweb-relay v1 |
| H-LF2 | The NoPlayer branch sends one 'Lever_PlayerPush' to the lever's graph, synchronously | The notify row inside furnitureActivate | x-lever-furn v1 (PREMISE: P2 waits for it) |
| H-LF3 | The puller's own graph gets no furniture event | No notify on 0x14 with a furniture word in the window | x-lever-furn v1 (a fall wakes F4) |
| H-LF6 | The platform's animation hook sits on 32901 | The ready row's resolved.notifyGraph.bytes begins e9 | x-lever-furn v1 (PREMISE) |
| H-LF7 | The push ends at rest | A3/B3 against restA/restB | x-lever-furn v1 (decides read 8's keep) |
| H-F1 | PlayAnimation('Lever_PlayerPush') on a watcher's lever moves its arm as the puller's engine did (a non-actor's PlayAnimation reaches 32901: the decompile of 0x140a2e8c0) | The watcher's Lever01 and RuinsLever off rest at A1 and A2 | x-lever-relay v1 |
| H-F2 | Furniture graph events in play are few | The [verb:furniture] tally over the stage's runs | recorded |
| H-C3a | A SetAnimationVariableFloat('fToggleBlend', 1.0) on a guest's untouched web shows it torn | c2's screenshots of 0x3758c after c1's tear (leg W2), and a graph-vars read if its fresh review adds one as a recorded step | x-trigger-entry v1 (PREMISE for D-C3), then x-cobweb-view v1 |
| H-C3b | A graph variable goes with its 3D and needs setting again at the next load | c2's fToggleBlend after a teleport out and back, with the re-apply line | x-cobweb-view v1 |

## 5. Probes and scenarios (one question each, ADR-064 amendment B)

The premises, drafted, each after its fresh review:
- **x-trigger-entry v1** (F, 68b5fc15): which pressers the engine delivers, with which actionRef.
- **x-lever-furn v1** (F, 3e693ed6): which events the pull sends, and from where.

The fixes, new, each with its own fresh review:
- **x-trigger-owner v1: does one press of a family trigger fire once on each seat, from its presser's owner?**
  - Legs: c2, the guest, presses the plate 0x567f2 with c1 clear; then c1 presses; then a draugr c1 simulates is moved onto the
    plate (MoveTo, x-trigger-entry's leg C); then c2 trips Embershard's wire 0xb6d3f.
  - Claims per leg:
    - The presser's seat: "fired here by 567f2: the presser's owner's firing" once.
    - The other seat: "the relay's own play" once.
    - The other seat's gate: "not this seat's presser, ignored (D-W1)" for the figure or puppet.
    - The server: one relayed root, with no E_TRAP_ refusal but the by-design NO_REF lines for 0x38098's draugr links
      (b-object-anim.yaml:119's form).
    - The wire: one relayed (b6d3f to b6d3e) pair, no relayed rock pair, and both seats' rocks fall once.
  - Recorded: H-W1's order, and H-W2's mixed leg (c1 on, c2 on, c1 off, c2 off, then c1 again).
- **x-cobweb-relay v1: does a guest's walk into an unfired web tear it on both screens?**
  - c2 walks into 0x37281, with c1 hosting in the hall.
  - Claims:
    - c2's "trigger entry 37281 ... relayed to the cell's host".
    - The server's entry relay line.
    - c1's "relayed entry 37281 by ff000001: ... sent to 1 script(s)".
    - The server's FXtriggerAmbFX report, relayed to 1.
    - c2's graph-vars fToggleBlend 1.0 within 5 s.
  - Recorded: H-W3's pack row, with the trace on c1.
- **x-lever-relay v1: does the watcher's lever move when the other seat pulls it?** x-lever-furn's spots and samples.
  - Claims for c1's pull:
    - The server's "aa8c3 animates aa8c3 'Lever_PlayerPush' ... (its user ff000000 reports): relayed to 1 game(s), not kept".
    - c2's arm off rest at A1 or A2 by more than 5 degrees.
  - Claims for c2's pull: the mirror.
  - Throughout: no E_OBJANIM_ line, and no "object animation aa8c3 ... reported" from the watcher.
- **x-cobweb-view v1 (D-C3 A, pending): does a seat that missed a tear see the web torn when it arrives, and after a reload?**
  - c1 tears 0x3758c while c2 is outside the Temple (relayed to 0); then c2 enters.
  - Claims: the serve line with 1 graph variable; c2's apply line; fToggleBlend 1.0 within 5 s; still 1.0 after c2's teleport
    out and back.

The scenarios, each its own commit:
- **b-lever-relay v1 (new; furniture.md's T3, rule 3)**: x-lever-relay's claims, both pullers.
- **b-cobweb-view v1 (new; trigger-entry.md's and D-C3's T3, rule 6)**: a guest tears an unfired web, then the late joiner, then a
  server restart, after which both seats read fToggleBlend 1.0. Without D-C3 A it shrinks to its first leg.
- **b-object-anim and b-bleak-traps (read 6)**: the "every seat fires" patterns become the "trap 54b15 fired here by 567f2" head,
  with both seats' rises kept; Eli first, one at a time.
- Unweakened in the gate slot: b-puzzle-relay, b-script-state-restart, b-trap-record-restart (its recorded chain lines read
  "a later link" now), x-login-in-cell's next version (D-L1 B), and the always set.

## 6. Risks, fallback, estimate, layers

**Risks:**
- **H-TE1 wrong:** the gate would load a bad pointer on a VM thread and crash the seat. The exact vtable compare guards the
  class; the load waits for the trace's pack rows.
- **H-W2:** a plate left last by an ignored presser loses its owner's next press. If the pex read shows no family trigger fires
  on a leave, the rule passes a non-owned leave and the count stays honest.
- **Family triggers fired by OnHit** (a shot tripwire) on two seats both report a root, so each fires twice. The hit's owner rule
  is the projectile's, not this plan's.
- **Player-comparing world triggers:** a world trigger whose script compares akActionRef to Game.GetPlayer() fails for a relayed
  guest until rung 5's acting-player scope (D-C2's own note). It is no regression: today the host's engine hands it the figure,
  which fails the same compare. The ambush box 0x38098's script (MS13TriggerArvelRunSceneScript) is unread; a pex read for the
  build says whether Arvel's scene starts for a guest.
- **The plate on the other screens:** its Down, Up and sound play on the firing seat alone (R3, declared in the rung table).
  Carrying a trigger's own action rows from its firing seat is a seam change (OnFamilyCall's owner) left for T4 to call (D-S2 B:
  cosmetic, judged at the playtest).
- **R2 trust:** a modified client can fire any linked pair of a cell it has loaded, within the link, the reach and the budget,
  and relay entries for its own presser. Every accepted loader pair is logged with its reporter.
- **The furniture path:** an NPC working a FURN with a graph streams its graph events (H-F2, the 8 a second per reference). If a
  self-played mark misses, the watcher's echo of a relayed play comes back as E_OBJANIM_NOT_USER, which b-object-anim's
  `E_OBJANIM_ == 0` would catch.
- **If H-LF7 falls**, a late joiner sees the lever at rest; then a FURN event is kept as today, and the probe's A3 picks which.
- **Followed props:** non-trap props another seat streams still press on both seats, since TrapFamily::Followed holds trap
  bodies alone; widening that set is a later item.
- **Schedule:** the two scenario rewrites need Eli's review before the gate slot, and D-C3 needs Eli's answer before W1.

**Fallback** (the smallest verified version that ships whole, rule 3): D-W1 for trap family triggers alone, plus the lever.
- The parts: the gate's presser rule scoped to family triggers, with the press mark but no relay for world triggers (P1 without
  SendTriggerEvent), C1's root half, S1's firing_source, S2, and the furniture rule (P2, S3, C2).
- No schema change and no new native.
- World triggers keep today's delivery (H-TE3 says what a figure does on the host).
- D-C2 and D-C3 stay at T0 and T2, MECHANISM ONLY, for the next train.
- Proven by x-trigger-owner v1, x-lever-relay v1, b-lever-relay v1 and the two rewrites. Cost: 2 stage slots.

**Estimate:**
- Agent work, in parallel: wire 1 half-day; server 2; platform 2; client 2; lab and docs 1. About 2 half-days of wall time, then
  one Windows head (about 40 minutes on the one runner) and its fresh review.
- Stage slots: 3, plus 1 for a FIX FIRST (ADR-053):
  1. The premises (x-trigger-entry v1, x-lever-furn v1) on the current train, the 11-07 morning slot, before P1 and P2 land.
  2. The fix probes on 4c plus 4d.
  3. The gate set with the rewrites and the two new scenarios.
- Playtest 50 at the earliest at slot 3, the 11-08 morning slot, with no FIX FIRST.

**Layer split** (five agents, the interfaces in section 1 the contract between them, integrated on m4-scripts-4-rows):
- wire: W1's schema half and WIRE.md's rows.
- server: S1 to S4, W1's handlers, the T2 sessions.
- platform: P1 and P2, the pex, the NATIVES.md line.
- client: C1 to C3.
- lab: the probes by path, L1 to L4, D1's verb docs.

### Critical files for implementation

- W/skyrim-platform/src/platform_se/skyrim_platform/FridaHooks.cpp
- W/skyrim-platform/src/platform_se/skyrim_platform/ScriptState.cpp
- W/skymp5-server/cpp/server_guest_lib/ActionListener.cpp
- W/skymp-wire/crates/wire-schema/src/skymp.rs
- W/skymp5-client/src/services/services/activationService.ts
- W/skymp5-client/src/services/services/objectAnimationService.ts

## Outside sources

1. Cause over consequence, the root-only relay: Glenn Fiedler, "Deterministic Lockstep" (gafferongames.com, 2014); Paul Bettner
   and Mark Terrano, "1500 Archers on a 28.8: Network Programming in Age of Empires and Beyond" (GDC 2001).
2. Why a synchronous call back into a thread that is waiting on you never returns (read 1): "Deadlock (computer science)",
   Wikipedia; E. G. Coffman, M. Elphick and A. Shoshani, "System Deadlocks", ACM Computing Surveys 3(2), 1971.
3. One owner per object at a time, taken by interaction (the presser's owner, the furniture's user): Glenn Fiedler, "Networked
   Physics in Virtual Reality" (gafferongames.com, 2018); IEEE Std 1278.1-2012, Distributed Interactive Simulation application
   protocols, whose entity management family transfers an entity's ownership between simulations.
4. The newest sequence wins per variable (D-C3's per-variable seq): Martin Kleppmann, Designing Data-Intensive Applications
   (O'Reilly, 2017), chapter 5 on last write wins; Marc Shapiro, Nuno Preguica, Carlos Baquero and Marek Zawirski, "A
   comprehensive study of Convergent and Commutative Replicated Data Types", INRIA RR-7506 (2011), its LWW-Register.
5. The engine facts and their own sources (the RTTI locator, frida-gum's redirect following, the Creation Kit's OnTriggerEnter,
   Activate and BlockActivation pages): trigger-entry-static.md section 9 and lever-furn-static.md section 10.
