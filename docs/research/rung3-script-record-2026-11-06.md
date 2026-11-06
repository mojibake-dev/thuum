# ADR-068 rung 3, the script record: the build plan (2026-11-06)

thuum-cf, 03:3x PST 2026-11-06 (11:3xZ 11-06): a read-only planning agent's plan against fork 5186df39, the substance of
docs/research/scripts-one-system-2026-11-05.md sections 6.5, 6.8 and 6.11 (findings 2, 4, 6) made concrete. Its first read changes
ADR-068 decision 5's last sentence (amendment A in docs/DECISIONS.md): the pillar's own OnCellLoad cannot render from the record,
so the record carries its view. The build runs as four layer agents in parallel (ASAP mode), integrated on fork branch
m4-scripts-3-record.


Path roots used below: W is the fork at 5186df39 (skymp, branch canon from today); SP is
W/skyrim-platform/src/platform_se/skyrim_platform; CL is CommonLibSSE-NG/include/RE; client is
W/skymp5-client/src/services/services; server is W/skymp5-server/cpp/server_guest_lib; lab is thuum's lab/. "scratchpad
trapread/disasm" is the read-only agent's disassembly of the Temple's pex files (lab/pex.py over the vanilla archives), kept
outside the repo.

## Four reads that change the approved design

1. **Decision 5's premise is false for the pillar.** ADR-068 decision 5 says "the seat's own handler renders FROM the record". The disassembly of defaultPuzzlePillarScript.OnCellLoad (scratchpad trapread/disasm, ops 3-4, 13-25 and 27) shows it jumps the graph only when `doOnce` is unset, from ::initialState_var, and then sets doOnce. So an OnCellLoad sent again after an apply does nothing. The record must therefore carry its own view: the reference's lastAnimation at the moment the record was taken, under the object's sequence. That is decision 4's own rule ("a late joiner gets the record and the last action as one message").
2. **The puzzle lever changes without any native on itself.** The pillars do `propset numPillarsSolved myLinkedRef`, and the lever's doorOrDarts assigns doorOpened. A read triggered only by calls on the self misses the lever. The read set therefore adds the calling script's own self and one hop through object variables.
3. **Three pieces the design assumes do not exist at 5186df39** (git grep finds nothing for each):
   - OwnerAck (ADR-066 decision 5, DECISIONS.md:4413-4421).
   - A digest cadence (ADR-065 decision 7, :4340).
   - A restart step in difftest: a Step has only move and send (W/skymp-wire/difftest/src/main.rs:202-212).
4. **lastAnimation is never saved.** server MpChangeForms.cpp:464-467 carries "TODO: uncomment when add script vars save feature". The record's saved view takes its place across a restart.

## 1. Interfaces, fixed up front

### (a) Natives

Each native is declared in SP/../psc/TESModPlatform.psc (beside :119-122) and in the committed pex through lab/pex.py add-native (the ed7aa29a idiom). Each is bound in SP/PapyrusTESModPlatform.cpp Register (beside :1872-1891) and gets a NATIVES.md line (R2, verb papyrus-events).

**Thread.** A callNative from the JS update posts the native to the OnUpdate thread that sits inside TESModPlatform.Add's Call:
- PapyrusTESModPlatform.cpp:120-146, main.cpp:121-136, CallNative.cpp:524.
- It runs in RunInIOContext under PlatformCall::Scope (SkyrimPlatform.cpp:381-396).
- That is a Papyrus native's thread, with the main thread parked in the VM's update (ChangeForm.cpp:83-87).

**`SerializeScriptState(ObjectReference) -> String`**
- The handle is `GetHandleForObject(refr->GetFormType(), refr)` (CL/I/IObjectHandlePolicy.h:33).
- Locks: BSSpinLockGuard on attachedScriptsLock, then runningStacksLock (CL/V/VirtualMachine.h:219 and :210). That is the engine's own SaveGame order (adr065 Q3); both locks are re-entrant (CommonLib src/RE/B/BSAtomic.cpp:25-50).
- Under the locks it calls `attachedScripts.find(handle)` (:220), the same walk as SP/FridaHooks.cpp:404-418.
- It answers "" and logs a refusal for: no attached script, a trap-family reference (the seam's rule, SP/ScriptNatives.cpp:860-865), an actor, a non-finite float, a string or array past its cap, or an answer over 160 KiB.
- **Quiescence (finding 2).** The object is busy if any of these holds:
  - lockStructure is set (CL/O/Object.h:45).
  - It is not IsInitialized() (Object.h:23).
  - A stack in allRunningStacks or waitingLatentReturns (VirtualMachine.h:211-212) has the object as `self` (StackFrame.h:28) in any frame, walking from top (Stack.h:76) down previousFrame (:22). The platform's borrowed stack (g_nativeCallRequirements.stackId, CallNative.cpp:323) is skipped.
- Answer shape:

```
{"formId":698571,"quiescent":true,"fnv1a":N,"scripts":[{"type":"defaultPuzzlePillarScript","state":"position02","flags":11,
 "names":["::initialState_var",...],"vars":[{"k":3,"i":1},{"k":5,"b":true},
 {"k":1,"o":{"kind":0,"mid":65535,"form":698563,"type":"defaultPillarPuzzleLever"}},...]}]}
```

  When busy, it answers `{"quiescent":false,"busy":"stack 4711 state 3 in defaultPuzzlePillarScript.RotatePillarToState"}`.
- **Fields:**
  - `flags` uses Object::Save's byte: 0x01 constructed, 0x02 valid, 0x04 lock held, 0x08 initialized.
  - `vars` are positional, parent-first, and their count is GetTotalNumVariables() (Object.h:49, ObjectTypeInfo.h:150). This is H-R1, CONFIRMED (papyrus-events.md:404-429).
  - `k` is the value's folded type (CL/T/TypeInfo.h:14-28, :52): 0 None, 1 object (no `o` means a typed None), 2 `s`, 3 `i`, 4 `f`, 5 `b`, 10 to 15 an array as `a` plus `elem` for 11. Arrays hold at most 128 elements (A/Array.h:69).
  - A handle naming 0x14 or a form at or above 0xff000000 is encoded as None and counted as "seatLocal".
  - `names` come from GetVariableIter and are for the lab only.
  - `fnv1a` is FNV-1a 32 over the dump of the scripts with `names` removed.

**`ApplyScriptState(ObjectReference, String scriptsJson) -> String`**
- It holds the same locks across the check and every write. If the object is busy or not initialized it answers `{applied:false, reason}`, and the client retries.
- For each script in the record:
  - It takes the attached object whose type matches exactly (the loader's exact match, adr065 Q2).
  - If the variable count differs from GetTotalNumVariables, that script is refused.
  - Each `k` is checked against the declared type from the chain's VariableInfo.
  - Each value is written through `Variable::operator=` (Variable.h:40; Variable.cpp:49-56), built with the setters (:71-79; SetString re-interns).
  - An object value is resolved with FindBoundObject (IVirtualMachine.h:81) and set with `SetObject(obj, declaredRaw)` (:78).
  - None or unresolved becomes `Variable(declaredType)` (:35), never SetNone, which folds the type to kNone (Variable.cpp:260-263).
  - Handles of kind 1 and 2 become None (H-R6).
  - Arrays use CreateArray (IVirtualMachine.h:108).
  - Positional writes cover auto properties, so SetPropertyValue is not needed.
- currentState is written directly (Object.h:44; H-R3).
- It clears the pending mark and answers `{applied, scripts[], resolved, none, seatLocal, stacksOnObject, holdUs, blanked[], fnvAfter}`.

**`SendScriptEvent(ObjectReference, String name, Bool unseenOnly) -> String`**
- It calls SkyrimVM::SendAndRelayEvent (SkyrimVM.h:216; src SkyrimVM.cpp:26-33) with a stack ZeroFunctionArguments (src/RE/Z/ZeroFunctionArguments.cpp:7-11), the shape the engine's own sinks use.
- It runs under callNative's Override (CallNativeApi.cpp:150-153), so the gate passes it (FridaHooks.cpp:312).
- `unseenOnly` skips any handle the seen set says the engine already served.

**Gate (OnSendEventEnter)**
- The new blank sits after the Override return at :312. It applies `!PlatformCall::Active() && Pending::Is(self)` to OnLoad and OnCellLoad, records which names it blanked, and logs "[verb:scripts] OnCellLoad to aa8cb blanked: its script record pending".
- Seen set: OnCellAttach, OnLoad and OnCellLoad per handle, cleared at TESLoadGameEvent (the sink at PapyrusTESModPlatform.cpp:95-117).
- A Napi export `setScriptRecordPending(formId, pending)` follows the setRecordApplying idiom (PuppetApi.cpp:413-422, PuppetApi.h:54-60 and :163-165; codegen Definitions.txt:1811).

**Seam changes**
- An owned state row (ScriptNatives.cpp:885-888) is batched as kind "touch" with no arguments, deduplicated per frame by self.
- Every batched call gains `callerSelf`: previousFrame->self read through RefOfObject (:317-344), built in NameCaller (:445-458) and emitted in CallToJs (:519-537).

### (b) Wire

**Ids.** SCHEMA_VERSION goes from 37 to 38 (W/skymp-wire/crates/wire-schema/src/lib.rs:88). The reserved unit variants become real messages in place (lib.rs:560-570; rows :691-694; ids :814-815):
- ReservedScriptState becomes ScriptState: MsgType 76, wire id 84, client to server.
- ReservedScriptStateApply becomes ScriptStateApply: MsgType 77, wire id 85, server to client.
- WIRE_IDS stays 87 and DestructionStage keeps id 86.
- The tests at :860-861 and :926-934 move to Some("ScriptState") and Some("ScriptStateApply").
- The next free MsgType is 79.

**Types** (skymp.rs after :2268, using wire_struct!; nothing recursive):

```rust
cap: SCRIPT_OBJECTS 16, SCRIPT_VARS 512, SCRIPT_STRING 1024 (UNMEASURED), SCRIPT_ARRAY 128
ScriptHandle { kind: u8, mid: u16, form: u32, #[serde(rename="type")] cls: String<PAPYRUS_NAME> }
ScriptValue { k: u8, i: Option<i32>, f: Option<f32>, b: Option<bool>, s: Option<String<SCRIPT_STRING>>, o: Option<ScriptHandle> }
ScriptVar   { ..ScriptValue's six.., elem: Option<String<PAPYRUS_NAME>>, a: Option<Vec<ScriptValue, SCRIPT_ARRAY>> }
ScriptObjectState { #[serde(rename="type")] cls, state: String<PAPYRUS_NAME>, flags: u8, vars: Vec<ScriptVar, SCRIPT_VARS> }
ScriptState      { t: MsgT<76>, epoch: u32, form_id: u32, fnv1a: u32, scripts: Vec<ScriptObjectState, SCRIPT_OBJECTS> }
ScriptStateApply { t: MsgT<77>, form_id: u32, fnv1a: u32, seq: u32, event: Option<String<ANIM_EVENT>>, scripts: .. }
```

Byte caps: 192 KiB for ScriptState, which stays under the 256 KiB the transport takes from a client (wire-transport limits.rs:21-23), and 256 KiB for ScriptStateApply.

**Validator** (wire-validate, dispatched beside :1477-1481; the reason codes follow ScriptCall's precedent at :1197-1212):
- E_VAL_RANGE when:
  - form_id is 0 or at or above 0xff000000;
  - there are not 1 to 16 scripts, or a type is empty;
  - flags lack 0x01 or 0x08, or have 0x04;
  - a `k` is outside 0-5 and 10-15;
  - the payload does not match `k` (array elements must be of kind k-10; `elem` only on 11);
  - a handle's kind is outside {0,1,2}, or its form is 0x14 or at or above 0xff000000.
- E_VAL_NONFINITE for a non-finite float.
- Rate budget `script_state_budget` beside change_form_budget (:230, :278, :1286): 64 at once, then 8 a second (UNMEASURED). Proptest covers it.

**wire-json and fixtures**
- The family list adds 76 and 77 (lib.rs:62-80).
- Fixtures:
  - 76-ScriptState-0: aa8cb's record.
  - 76-ScriptState-1: a kind-3 handle, which must be refused.
  - 77-ScriptStateApply-0: served with "Trigger01", seq 2.
  - 77-ScriptStateApply-1: the lever's record, no event.
- They are checked by a `script_state_fixtures_validate_as_named` test (the :432-443 idiom) and by W/unit/WireJsonContractTest.cpp.

**C++ structs:**
- W/skymp5-server/cpp/messages/ScriptStateTypes.h, following ChangeFormRemapRow's Serialize (ChangeFormMessage.h:15-38), with u8 and u16 held as uint32_t.
- ScriptStateMessage.h and ScriptStateApplyMessage.h.
- MsgType.h 76 and 77, the REGISTER_MESSAGE lines, and PacketParser cases (:315-321).

### (c) Server record

**Where it lives.** MpChangeFormREFR gets `std::optional<ScriptStateRecord> scriptState` beside destruction and changeFormRecord (MpChangeForms.h:285-292), and it joins ToTuple (:310-325).

**ScriptStateRecord.h** follows ChangeFormRecord.h's shape:
- epoch, fnv1a, sender, atMs;
- seq: the object's sequence when the record was taken;
- event: `ChangeForm().lastAnimation` at that moment (MpObjectReference.cpp:459);
- scripts.

**Persistence.** ToJson and JsonToChangeForm handle a "scriptState" key through JsonOutputArchive and SimdJsonInputArchive, the round trip Appearance.cpp:9-33 uses, placed beside MpChangeForms.cpp:556-580 and :1164-1211. An older record without the key reads as none and formVersion is kept: this fork's migration for an optional field (fb0c3396; rule 6). MpObjectReference gets Get/SetScriptState.

**wire-rules script_state.rs plus its bridge** (following ScriptCalls, bridge rules.rs:2174-2191):
- `judge(facts)` returns Accepted, ReleaseRead, or a refusal: E_SCRIPTSTATE_NO_REF, _KIND (an actor; its simulator's state is a later rung), _OWNER or _EPOCH.
- A map `released: cell -> (player, epoch)` is set at Release and cleared at Grant. A record from the host just released, at its own epoch, is a ReleaseRead while the cell is unhosted. Once another seat is granted it is StaleEpoch, as in ADR-066.
- ScriptCalls gains `seq_of` and `seed(subject, seq)` (a max), so an object's sequence survives a restart (natives.rs:482-486).

**ActionListener::OnScriptState** follows OnChangeForm's shape (ActionListener.cpp:4769-4890):
- The form is looked up with LookupFormById and must not be an actor.
- The owner is checked with GetCellHost (PartOne.cpp:2628) and the judge.
- The record is stored, with the line "[verb:scripts] script state <id> recorded from <sender>: <n> script(s), fnv <x>, epoch <e>, seq <s>, view '<event>'" once a minute per form.
- A record is never relayed live. All sends below are immediate (`GetSendTarget().Send(user, m, true)`), never the deferred queue.

**When it is served:**
- **Ahead of HostGrant**, inside the Grant case (PartOne.cpp:1834-1846): the new host's non-actor emitters in the cell that have a record (the FlipHostedFlags emitter walk), seeded and then stamped. Line: "... served to <host> ahead of its grant".
- **Behind the create word** in onSubscribe, after the DestructionStage block (:1429-1448), to any listener that does not host the cell.
- **Release** (:1855-1868) notes the release read.

**Optional:** a ScriptStateBinding (the ChangeFormRecordBinding.cpp idiom, PropertyBindingFactory.cpp:55) so lab-api's RefView can read scriptStateFnv and scriptStateAt.

### (d) Client

New files: scriptStateService.ts and the two message files, plus entries in anyMessage, events, the networkingService dispatch (:317-319 idiom) and messages.ts.

**On the owner, what makes a reference due for a read:**
- every scriptCalls entry (scriptCallService.ts:66-103), for both its self and its callerSelf;
- one hop: the plain object handles a read finds that name non-actors in the same hosted cell;
- HostRelease (hostService.ts:641-658): the cell's known set is read with the released epoch;
- a 30-second sweep of the known set (there is no digest cadence).

**How a due reference is read and sent:**
- At most one read a second per reference.
- While busy it retries every 250 ms for up to 10 s, then logs "the last record stands".
- If the FNV equals lastSent, nothing is sent.
- The epoch comes from epochForActor (:247-263).
- There is no third ack message: a refusal means this seat is not the owner. After an apply, `fnvAfter` becomes the new owner's baseline.

**On the receiver:**
- **Arrival** (message context): hold the record by form id. Call `setScriptRecordPending` only if the record carries `event`; a record without a view must let the load handler run (H-R8).
- **Grant:** onHostGrant (:619-639) stops calling tellPlatform (:628) and the activation lift (:629) directly. It calls `ScriptStateService.beforeHosting(cell, open)`. On the next update that applies every held record in the cell, then opens the gate. If a record is still not initialized after 3 s, the gate opens anyway with a log line.
- **Apply sequence:**
  1. Call ApplyScriptState.
  2. Re-send each event the gate blanked, once, through SendScriptEvent(ref, name, false).
  3. Replay the view with playRelayed(refr, event, "the script record") if SpSnippetService's lastSeq for the form differs from `seq`.
  4. Raise lastSeq to `seq` (add a public raise beside spSnippetService.ts:105-121).
- **Who applies what:**
  - A new owner always applies.
  - A guest applies when it has no lastSeq for the form or its lastSeq is not above `seq`.
  - A record for a cell this seat already hosts, outside a pending grant, is dropped.
- remoteServer.ts:555-602 skips its lastAnimation replay for a reference whose record carries a view.
- Kill switch: the setting `scriptRecord` set to false turns all of this off.

### (e) Lab grammar (thuum, staged with LABAPI=<id>)

- A driver step `script-state {formId}` that calls SerializeScriptState and returns the parsed answer (lab/driver/src/index.ts, beside :2137 and :2700).
- scenario.py adds the step to CLIENT_ACTIONS (:23) and to :468.
- board.py keeps `_script_states[client][formId]` (the :147-153 idiom).
- assertions.py adds ScriptStateView, built like NpcStateView (:953), with `.state`, `.script("<type>").state`, `.variable("<name>")` (an object comes back as its form id), `.count`, `.fnv1a` and `.quiescent`. The accessor is `c.script_state(id[, type])`, following npc_state (:1845-1870), and it raises AssertionData when no step was taken. It gets a grammar line at :60-100.
- RefView gains scriptStateFnv and scriptStateAt.

## 2. Commits, inside-out

F1 to F3 are R0 by tier: they merge into the rung branch on T0 and T2. Because the schema bump changes netcode's protocol id, neither canon nor a seat can take them before F5's Windows head is built.

| # | What | Proof |
| --- | --- | --- |
| F1 | wire-rules script_state.rs, the bridge, ScriptCalls seed and seq_of | T0 crate tests: the six judgments (host accepted; guest OWNER; stale EPOCH; actor KIND; release read accepted while unhosted; refused after a re-grant); seed is a max |
| F2 | The record and its persistence (fb0c3396's shape) | T0 W/unit/ChangeFormTest.cpp: the record survives a save and load; an older record reads as none |
| F3 | ScriptState end to end on the server, in one commit as rule 4 requires (0c989cc1's shape); WIRE.md rows | T0 W/unit/ScriptStateTest.cpp on Temple 0x371de and aa8cb: record kept; OWNER, EPOCH, KIND (the draugr) and NO_REF refused; a late subscriber gets record, seq and event after its create word; at a grant the records precede HostGrant in the send log; a release read is accepted, then refused after a re-grant; the stored event is the one at record time. Plus `cargo test --workspace`, clippy, WireJsonContractTest. T2: difftest sessions/script-state.yaml (script-call.yaml's frame on ore vein 0x10e6c5). The restart half cannot be done in difftest (no restart step); restart persistence is covered by T0 ChangeFormTest and T3 b-script-state-restart |
| F4 | Platform: ScriptState.cpp/.h, the bindings, psc and pex, the gate's blank, the seen set, setScriptRecordPending, touch and callerSelf in the batch; NATIVES.md lines | T1: the Windows build |
| F5 | Client, as in (d) | One Windows head for F4 and F5, then a fresh read-only review |
| Lab | Grammar; lab/frida/script-state-trace.js; probes x-script-state-read v1, x-puzzle-handoff v3, x-puzzle-late-join v1; scenario b-script-state-restart (own commit, rule 13, numidium approves) | T3, below |
| F6 | Retirements (TypeScript only, turbo-client-build) | Re-runs the slot 3 set |

**T3 slots:**
- **Slot 1: x-script-state-read v1.**
- **Slot 2: x-puzzle-handoff v3 and x-puzzle-late-join v1.**
  - x-puzzle-handoff v3 waits until the server's "recorded" line appears before relaunching c2.
  - It then claims "applied at the grant of 371de" once and zero "re-synced" lines.
  - It also claims that c1's first E yields 'Trigger02' and that c1's lever numPillarsSolved equals c2's read before the relaunch.
- **Slot 3: b-script-state-restart,** with b-puzzle-relay v4, b-bleak-traps and b-object-anim unweakened.
  - It does two turns, then a server restart.
  - Both seats then reconnect and teleport back in, so the cell is a real load and S12 does not apply.
  - Claims:
    - the served lines rose over the snapshot taken before the restart;
    - the states on both seats equal the pre-restart read;
    - Pillar01 matches within 5.7 degrees (0.1 rad) before any turn;
    - the next press yields 'Trigger03'.
  - A late-join leg follows.
- **Slot 4: F6.**

## 3. Retirements

- **d1f23444's re-sync** (it is in canon). Code: objectAnimationService.ts:113-116, :341-436, PILLAR_* at :56-61, sideOfRecord at :64-73, and its feed at scriptCallService.ts:96-100.
  - F5 skips it for any pillar whose record was applied at the grant.
  - F6 deletes it once x-puzzle-handoff v3 shows zero "re-synced" lines and b-script-state-restart is green.
  - playRelayed's jump stays, because the relays and the record's view both use it.
- **lastAnimation's replay on guests.**
  - F5 skips it per reference wherever a record carries a view, conditioned on x-puzzle-late-join being green.
  - The replay itself stays until rung 7: ObjectAnimation 71's engine-driven family has no other carrier.
- **Self-played marks** (:76-86, :148-161, :238-246, and markSelfPlayed in playRelayed).
  - S3 is CONFIRMED (zero hits in 45 plays).
  - They are deleted in F6 once the rung's runs show zero "dropped as self-played" on both seats.
  - EVENT_PATTERNS and the ObjectAnimation report stay (H-D1, rung 7).

## 4. D-L1 B, an optional slice

Built ahead of Eli's answer and never merged before it, on branch m4-scripts-3-login with its own review and probe.

- **Which cell:** the cell hostService reports "without its load event" (hostService.ts:578-585).
- **When:** once per login, using questStageService.ts:380-425's arrival idiom.
- **After what:** the cell's grant, if there is one, and ScriptStateService's apply pass.
- **What:** walk the cell's references (liftCellActivation's getNumRefs and getNthRef, :199-225). For each one with scripts, call SendScriptEvent(ref, "OnCellAttach", true), then the same with "OnCellLoad".
- **Line:** "[verb:scripts] login cell <c>: OnCellAttach and OnCellLoad sent once to <n>, <m> already seen".
- **Proof:** x-login-in-cell v1 plus the H-L1 read. Option A needs no code from this rung.

## 5. Hypotheses (rule 8)

| id | claim | the one observation | plan |
| --- | --- | --- | --- |
| H-R2 | A mid-latent object is detected | aa8cb, 0.5 s into a turn, answers quiescent false naming a state-3 stack (Stack.h:32); 3 s later the state has advanced | script-state steps in x-script-state-read |
| H-R3 | Writing currentState directly runs no state events | Zero DispatchMethodCall1 (104804) calls named onBeginState or onEndState between the apply's log lines | script-state-trace.js on 104804 (`just addr 104804`) |
| H-R4 | Check-then-write under both locks is race-free | stacksOnObject is 0 at every apply; holdUs under 1000 | The answer's fields, on every run |
| H-R5 | Lifecycle handlers plus the record restart world scripts | The approved observation (the plate) is stale, since D-S3 made traps every seat's own (S7). Settled by x-puzzle-handoff v3's 'Trigger02'. A self re-arming non-family script in the Temple is UNKNOWN | lab/pex.py over 0x371de's VMADs for RegisterForSingleUpdate or Utility.Wait |
| H-R6 (new) | Kind-0 handles are portable between seats; kinds 1 and 2 are not | myLinkedRef resolves; the seatLocal count | FindBoundObject (104792) in the trace |
| H-R7 (new) | A late joiner's record arrives before the engine's load events | Count of c2's "blanked: its script record pending" lines (recorded, not claimed) | SendEvent (104800) timestamps |
| H-R8 (new) | The record's view, not the handler, turns the pillar | c2's Pillar01 local_angle_to c1's is under 5.7 degrees after the apply, for Trigger02 and Trigger03 records | x-puzzle-late-join v1 |
| H-R9 (new) | previousFrame->self is the caller's object | A touch on the portcullis's Activate has callerSelf equal to the lever | x-script-state-read's pull |
| H-L1 | A save load raises neither OnCellAttach nor OnCellLoad | sendevent-rate.js shows zero Temple rows at login | x-login-in-cell v1 |

## 6. Risks, fallback, estimate

**Risks:**
- **A hand-off mid-turn.** The record is one turn behind and the new host's graph one ahead. The plan's "the next press re-syncs" is false: a refused Trigger leaves PlayAnimationAndWait waiting, so the script is busy for good. The view replay pulls the graph back to the record's side.
- **Trigger01's missing jump.** There is no StartState01, so a graph off Side01 has a gap. Rung 2's relays share it; H-V1 at rung 4 closes it.
- **Untested caps.** The caps and budgets have not been measured; script-save-trace.js v2.1's histogram would set them.
- **Out of scope here:** actors, trap families, and handles of kind 1 and 2.
- **No OwnerAck timeout.** A crash between the grant and the apply relies on the 3 s gate timeout.

**Fallback (smaller, verified).** Apply only at a grant, and only when the seat's lastSeq equals the record's seq (graph and record agree by construction). Otherwise skip with a log line.
- Keep the guests' lastAnimation replay and d1f23444's re-sync.
- No pending blank and no view.
- Prove it with x-puzzle-handoff v3. b-script-state-restart then claims only that the record survives (server.ref) until H-V1.
- Cost: 3 slots.

**Estimate.**
- 4 stage slots plus 1 for a FIX FIRST.
- 2 Windows heads.
- About 4.5 agent half-days.
- F1 to F3 use no lab slot.

### Critical Files for Implementation
- W/skyrim-platform/src/platform_se/skyrim_platform/FridaHooks.cpp
- W/skymp-wire/crates/wire-schema/src/lib.rs
- W/skymp5-server/cpp/server_guest_lib/PartOne.cpp
- W/skymp5-client/src/services/services/hostService.ts
- W/skymp5-server/cpp/server_guest_lib/MpChangeForms.h