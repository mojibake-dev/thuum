// additem-functor.js v1 DRAFT (ADR-068 rung 5, Eli's D-R1 C and its named gap, 2026-11-10 12:5xZ): x-additem-functor v2's trace,
// for fork 44ffafc2 (rung 5's stage head) on the seat whose own script adds an item to its own player (c1). New, so a fresh review
// comes before its first run (ADR-064 rule A); it lives by path at lab/.cache/drafts/rung5/additem-functor.js (lab/.cache is
// gitignored, so its version is the file's sha1) until that review puts it in lab/frida, which lab-api serves its frida steps from
// (FRIDA_SCRIPTS_DIR: labapi/runner.py _frida_start :1738-1741 answers E_RUN_FRIDA "no script" for a name not there).
//
// ONE QUESTION (rule 8, before fork m4-scripts-5-rewards 1bc4059b's E_SCRIPTCALL_LEVELED gap is built over): when a script's
// ObjectReference.AddItem on the seat's own player names a leveled list, does the rolled item reach the player through a
// TESContainerChangedEvent fired synchronously inside SkyrimScript::AddItemFunctor's operator(), and does that functor carry the
// stack id the platform's seam recorded at the call (ScriptNatives.cpp:983, QueueFromFrame's `call.stackId = stack->stackID`)?
// The builder's plan, verbatim: "hook AddItemFunctor's operator() (vtable named in CommonLibSSE-NG Offsets_VTABLE.h:4616, slot
// and stackID from DelayFunctor.h), then collect the container events with newContainer 0x14 that fire inside it. The trace has to
// show those events fire synchronously inside operator(), carry the rolled item, and carry the same stackID the platform recorded
// at the call. operator() returns BSScript::Variable by value, so its calling convention must be read before anyone builds a
// detour." This trace reads all four. Attach only: Interceptor.attach alone, no replace, no write to engine memory, and no listener
// calls an engine function (a hooked function called from inside a listener is bypassed on that thread: frida-gum's listener guard,
// the memory note frida-lab-script-pitfalls), so every read is memory; the platform's sink is attached from Frida's own JS thread
// (setTimeout, 500 ms after the scan), never from inside a listener. Beside memory reads, the listeners call only kernel32's
// QueryPerformanceCounter (a clock, not the engine), Frida's own Process.findModuleByAddress (a pointer's module name) and
// Memory.alloc (a thread's first clock buffer), and Thread.backtrace for the first BT windows of a call on the player.
//
// The ids, by `just addr <id>` (lab/addr.py over addrlib/, runtime 1.6.1170.0, 428461 entries, run 2026-11-10 from the thuum
// checkout; never from memory, CLAUDE.md rule 1); (h) hooked, (r) read only, (s) the static read's number, compared with what the
// live process holds and never used as an address:
//   104651  0x143dc00  (h) BSScript::NF_util::NativeFunctionBase::Call, CommonLib Offsets.h:130 RELOCATION_ID(97923, 104651) (the
//                          macro is (SE, AE): SKSE/Impl/PCH.h:724); IFunction slot 0x0F (IFunction.h:61, NativeFunctionBase.h:47);
//                          acting-frame.js's and native-frame.js's hook, attached over the platform's seam replacement (the site's
//                          live first byte e9: x-native-frame 20261105-023520, x-acting-frame 20261110-072506); Ghidra's static
//                          bytes 4c 89 44 24 18 55 56 57 (native-frame.js's read)
//   218372  0x1928b38  (r) VTABLE_SkyrimScript____AddItemFunctor, Offsets_VTABLE.h:4616, the AE id of its VariantID (REL/ID.h:547-560:
//                          (SE id, AE id, VR offset)); (h) its slot 01, DelayFunctor's operator() (DelayFunctor.h:35), read from
//                          the live vtable at load and hooked at the address that slot holds
//   397281  0x20b49e8  (r) RTTI_SkyrimScript____AddItemFunctor, Offsets_RTTI.h:5085: the type descriptor the vtable's complete object
//                          locator must name (vtable[-1], RTTI.h:108-124), the vtable's identity read at load; the static read's
//                          "RTTI 0x1420b49f8" is this descriptor's name, 0x10 further (RTTI.h:18-19, _name at +0x10)
//   400475  0x20fba70  (r) SkyrimVM's singleton, Offsets.h:488 RELOCATION_ID(514315, 400475), a SkyrimVM** (SkyrimVM.cpp:8-9, one
//                          read gives the VM); its BSTEventSink<TESContainerChangedEvent> subobject at +0x48 (SkyrimVM.h:95); (h)
//                          that subobject's vtable slot 01, ProcessEvent (BSTEvent.h:146): the VM's own container sink, read live
//   396984  0x20ae610  (r) RTTI_SkyrimVM, Offsets_RTTI.h:4767: the sink vtable's locator must name it, with offset 0x48 (RTTI.h:119)
//   403449  0x31872c0  (r) Main's singleton, Offsets.h:383 RELOCATION_ID(516943, 403449), threadID at +0x28 (Main.h:87)
//   252888  0x1aa5ad0  (r) VTABLE_BSScript__Internal__ScriptFunction, Offsets_VTABLE.h:7082: a frame's function is a script's when
//                          its vtable is this one, else a native's
//    56095  0xa28b40   (s) AddItemFunctor's operator() in the static read (docs/research/adr062/papyrus-native-entries.md:58,
//                          pyghidra-mcp on sky-re, 2026-11-02; HYPOTHESIS by rule 2): the ready row says whether slot 01 agrees
//    56145  0xa2c110   (s) ObjectReference.AddItem's callback in the same read (:58): the AddItem IFunction's +0x50 is compared
//    53955  0x9c34c0   (s) SkyrimVM::QueuePostRenderCall, Offsets.h:486 RELOCATION_ID(53144, 53955) (SkyrimVM.h:214), where the
//                          read says the native queues its functor (:58, :92-95); named here, not hooked
// (h) the platform's sink, the builder's collection point: Skyrim Platform's EventHandler::ProcessEvent(const
//   TESContainerChangedEvent*, BSTEventSource<TESContainerChangedEvent>*) (fork 44ffafc2 skyrim-platform EventHandler.cpp:375-431:
//   it copies the event's fields and hands JS an update task), registered on ScriptEventSourceHolder's source (EventHandler.h:483-484
//   and :708-725; EventUtils.h:4-7) and active because skymp5-client listens to containerChanged (containersService.ts:16 among
//   others). Found at the VM sink's first event in that call's source (ProcessEvent's third argument, BSTEvent.h:146), whose sink
//   array (BSTEvent.h:130-131: sinks +0x00, pendingRegisters +0x18; a BSTArray's data +0x00 and size +0x10, BSTArray.h:139-141,
//   :44-46, :374-376) holds it as the entry whose vtable lies in SkyrimPlatformImpl.dll; attached from setTimeout 500 ms after the
//   scan (AI_PLATFORM_ATTACH_MS: at 0 ms the attach could patch the platform's entry as the same SendEvent loop reaches it; the
//   probe's first call comes seconds later). Until then the VM's sink alone reads (the probe's harvest comes first to prime it).
// Not in CommonLib, named plainly, not guessed:
//   - AddItemFunctor's class: only its RTTI and VTABLE ids exist (Offsets_RTTI.h:5085, Offsets_VTABLE.h:4616), so no field past
//     DelayFunctor's 0x10 has a name. The static read says 0x28 bytes (papyrus-native-entries.md:58, HYPOTHESIS). The trace dumps
//     RAW bytes and names a field only by its value against the call's own (a form pointer whose form id is the call's item or self,
//     a dword equal to the call's count), each such name HYPOTHESIS.
//   - The engine's TESContainerChangedEvent dispatcher: CommonLib's BSTEventSource::SendEvent is an inline template (BSTEvent.h:89-122)
//     with no id for the engine's instance, and Offsets.h:339-341 gives InventoryChanges::SendContainerChangedEvent, SetUniqueID and
//     TransferItemUID the one AE id 16149, so 16149 names none of the three reliably. The two sinks stand in for the dispatch:
//     SendEvent calls every registered sink in one loop on its own thread (BSTEvent.h:104-110).
//
// Layouts, CommonLibSSE-NG b93280e8 (file:line):
//   DelayFunctor (DelayFunctor.h:16-45): vtable +0x00; BSIntrusiveRefCounted's _refCount +0x08 (BSIntrusiveRefCounted.h:29, sizeof 4
//     :31); stackID +0x0C (DelayFunctor.h:43, VMStackID u32, BSCoreTypes.h:8); sizeof 0x10 (:45). Slots (:32-40): ~DelayFunctor 00,
//     operator() 01, IsLatent 02, WantsRequeue 03, SaveImpl 04, GetType 05, LoadImpl 06. FunctorType's listed values (:21-30) match
//     the factories' template arguments (Offsets_VTABLE.h:4343 to :4619: AttachAshPile 14, SendPlayerToJail 19, MoveTo 0,
//     SetPosition 6, SetMotionType 8, DropObject 12, RemoveItem 24), so AddItem's type reads 20 from
//     ConcreteDelayFunctorFactory<AddItemFunctor,20> (:4617), HYPOTHESIS: the ready row prints each slot's first bytes, where a
//     one-instruction GetType or IsLatent reads by itself (the guess is printed beside the bytes, never trusted alone)
//   operator() (DelayFunctor.h:35) is `virtual RE::BSScript::Variable operator()() = 0`: a member function returning a class by
//     value. MSVC passes `this` first (RCX) and the caller's return buffer second (RDX), and the callee returns that pointer in RAX
//     (Microsoft Learn, "x64 calling convention", Return values: a user-defined type returns in RAX only from "global functions and
//     static member functions", otherwise "the caller must allocate memory for the return value and pass a pointer to it", "the
//     same pointer must be returned by the callee in RAX"; Agner Fog, "Calling conventions for different C++ compilers and operating
//     systems" (2023), chapter 7: "In Microsoft compilers and 64 bit Windows, the this pointer is the first parameter, the return
//     pointer is the second parameter"; clang's MicrosoftCXXABI::classifyReturnType: "MSVC always returns structs indirectly from
//     C++ instance methods", "MSVC always passes `this` before the `sret` parameter"). HYPOTHESIS for this function until its leave
//     rows read rax equal to the entry's rdx, rdx a few hundred bytes above the entry's rsp (the caller's frame), and a Variable
//     (Variable.h:93-94) written there. That is the reading a detour needs.
//   Call(this, const BSTSmartPointer<Stack>&, ErrorLogger*, VirtualMachine*, bool) (NativeFunctionBase.h:47): args[0] the IFunction,
//     args[1] a pointer to the smart pointer whose one member is the Stack* (BSTSmartPointer.h:229)
//   NativeFunctionBase (NativeFunctionBase.h:62-72): _name +0x10, _objName +0x18 (the class), _stateName +0x20, _isLatent +0x42 (:69);
//     a vanilla native's callback at +0x50 (papyrus-native-entries.md:28-33, HYPOTHESIS; native-frame.js reads it the same way)
//   Stack (Stack.h:74-83): frames +0x58, top +0x60, state +0x68 (the enum :27-38), returnValue +0x70, stackID +0x80, stackType +0x84,
//     callback +0x90 (a platform VmCallback's vtable lies in SkyrimPlatformImpl.dll: the seam's own test of a platform-dispatched
//     stack, fork PlatformCall.h:16-26)
//   StackFrame (StackFrame.h:21-33): previousFrame +0x08, owningFunction +0x10, owningObjectType +0x18, self +0x28 (a Variable), size
//     +0x38, the arguments from +0x40 in 0x10 steps (:33's comment; the fork's port patch uncomments it; native-frame.js v2 read them
//     equal to Stack::GetStackFrameVariable's answers for a script's own two-argument call, x-native-frame 20261105-033116, "args
//     agree yes"); AddItem's three (akItemToAdd, aiCount, abSilent: FunctionsDump.txt's ObjectReference.AddItem, isLatent true)
//   Variable (Variable.h:93-94): varType +0x00 (raw 0 to 15, TypeInfo.h:14-26; 16 or more an ObjectTypeInfo* with bit 0 an array,
//     :28-31), value +0x08; Object (Object.h:43-46): type +0x08, currentState +0x10, handle +0x20; ObjectTypeInfo (ObjectTypeInfo.h:177):
//     name +0x08; BSFixedString (BSFixedString.h:232): one pointer, the characters; CallResult (IFunction.h:36-40)
//   VMHandle: bits 48 to 63 a kind, 32 to 47 a middle word, 0 to 31 a form id (HYPOTHESIS, docs/research/adr065-papyrus-state Q1,
//     printed raw, as acting-frame.js prints it; its GetPlayer rows read 0x14 for the player)
//   TESContainerChangedEvent (TESContainerChangedEvent.h:11-19): oldContainer +0x00, newContainer +0x04, baseObj +0x08, itemCount
//     +0x0C (s32), reference +0x10 (an ObjectRefHandle), uniqueID +0x14 (u16), sizeof 0x18
//   TESForm (TESForm.h:351-360): its vtable +0x00 (inside SkyrimSE.exe for an engine form), formID +0x14, formType +0x1A; FormType
//     (FormTypes.h): Ingredient 0x1E :170, Misc 0x20 :172, Flora 0x27 :179, AlchemyItem 0x2E :186, LeveledItem 0x35 :193,
//     ActorCharacter 0x3E :202, FormList 0x5B :231, Max 0x8A :279
//   TESLevItem (TESLevItem.h:9-11): TESLeveledList at +0x30 (TESBoundObject is 0x30, TESBoundObject.h:63); TESLeveledList
//     (TESLeveledList.h:68-78): entries +0x08 (a SimpleArray: its one member the element pointer, the size_t count just before it,
//     MemoryManager.h:299, :357-368), chanceNone +0x10, llFlags +0x11, numEntries +0x12; LEVELED_OBJECT (:15-25): form +0x00, count
//     +0x08 (u16), level +0x0A (u16), sizeof 0x18. The list's members are read live, so a later plugin's override reads as it plays
//   Complete object locator (RTTI.h:108-124): signature +0x00 (1 for x64), offset +0x04 (the vtable's subobject offset), typeDescriptor
//     +0x0C (an RVA from the image the locator lives in, RTTI.h:40); a type descriptor's name at +0x10 (RTTI.h:9-20)
//
// What the static read expects (papyrus-native-entries.md:58 and :134-139, HYPOTHESIS): the native (56145) builds the functor and
// queues it through 53955; "at native return nothing has been added: the add runs when the VM drains its post-render functor
// queue"; operator() resolves a leveled list through TESLeveledList::CalculateCurrentFormList (14751) and adds through 16127 and the
// actor's AddObjectToContainer (TESObjectREFR.h:286 slot 0x5A), on the main thread within a frame. Falsifiers it names: an
// operator() on a VM thread. This trace adds the event's place: inside operator() on its thread, or after it, or elsewhere.
//
// Hooks, each counted before its filter:
//   Call 104651: filtered to ObjectReference.AddItem and ObjectReference.Activate by the bound IFunction's own class and name
//     (compared lower case: the VM's string pool keeps the first spelling it saw); an AddItem opens a call window and a pending entry
//     by its stack id; an Activate opens a call window only (a flora harvest's attribution: the driver's activate is the platform's
//     direct Call of the Activate native).
//   AddItemFunctor's operator(): a call whose `this` vtable is not 218372's counts as foreign and opens nothing; otherwise a functor
//     window opens on its thread (seq, stackID, the matched call: the pending call of its stack id, else, for a requeued functor's
//     next run (WantsRequeue, slot 03), the call it matched before, rerun) and closes at the leave.
//   The VM's sink and the platform's sink: every call counted; one whose `this` is not the registered sink counts as foreign and
//     reads nothing (SendEvent passes the registered sink, BSTEvent.h:106, so another `this` is another sink sharing the body, its
//     event of unknown type); a row for an event naming the player (old or new container PLAYER) or fired inside any open window,
//     with the window it fired in on its own thread, the functor windows open on other threads, and whether its base is one of the
//     functor's expected bases (the list's live members, or the plain item itself).
//   kernel32!Sleep: the Interceptor's own pulse.
//
// Rows, one JSON line each through console.log (lab-api's preamble flushes them to the trace's .log every 250 ms) and send():
//   {event: 'ready'} once: version, pid (read it against the run's c1-skyrim-platform-pid<N>.log before any row: the memory note
//     lab-frida-wrong-process), base, each hook's id, rva, address and live first bytes (read before the attach), the functor
//     vtable's locator check and slots 00 to 06 (rva, bytes, the guess), slot 01 against the static read's 56095, the VM sink's
//     locator check, params, Main's thread, attach errors.
//   {event: 'addItemCall'} per AddItem Call, at its leave: seq, the Stack (id, type, state at the entry and the leave, frames, the
//     callback's module), own (top's function is this native), self, the three arguments, the caller frame, the return address
//     (vm for SkyrimSE.exe, else the module), the IFunction's latent byte and +0x50 against 56145, the CallResult, a `line`.
//   {event: 'functorEnter'} and {event: 'functorLeave'}: seq, thread (main or not), this, refCount, stackID, the matched call (its
//     seq and stack id, or none), rerun, RAW bytes and their qword decodes (a form's id and type where a qword is one), the fields
//     named by value, the item's form and, for a leveled list, its live members (the walk capped at 256 entries and 64 leaves;
//     truncated when a cap, the depth or a list already walked stopped it); at the leave the same reads again, elapsed microseconds,
//     the gap after the call's leave, rax against the entry's rdx (sret), rdx less rsp, the return buffer's 16 bytes before and after
//     and its Variable, every event inside, a `line`. The first BT enters of a functor matched to a call on PLAYER carry a backtrace.
//   {event: 'event'}: sink (vm or platform), the six fields, thread, the innermost window on that thread (functor, or an AddItem or
//     Activate call) and the functor windows on other threads, member, listItself (the base is a leveled list), paired (the other
//     sink's row for the same event in the same loop), a `line`. The first BT events inside a functor matched to a call on PLAYER
//     carry a backtrace (operator()'s frame in it is the synchronous reading made twice).
//   {event: 'sinks'} once, at the VM sink's first event: every sink in the source (its vtable's module and locator name, ProcessEvent)
//     and which one is the platform's; {event: 'platformSink'} its attach (address, first bytes, error).
//   {event: 'summary'} every 10 s: every hook's count before its filter (the liveness: Call's calls per second, the functor's, each
//     sink's), the pending calls no functor matched yet, open windows, rows printed and capped, the pulse, failures, the lines new
//     since the last summary (so a run that ends before TTL keeps them).
//   {event: 'final'} at TTL with every line, then 'detached'.
//
// Expected on c1 in x-additem-functor v2 (the census read of 2026-11-10 13:0xZ chose the stages; the probe's header has it): MS01
// 0x18b4b's stages 39 and 49 each run a three-instruction fragment, QF_MS01_00018B4B.Fragment_56 and Fragment_62, whose one call
// is Game.GetPlayer().AddItem(LvlQuestReward02Medium 0xc0405, 1, False); that list (esm-format read on sky-srv: LVLD 0, so every
// set rolls, LVLF 0x00, LLCT 5) holds Gold001 0xf alone, x400 at level 1, x600 at 10, x800 at 20, x1000 at 30, x1200 at 40. Per
// set: "call ObjectReference.AddItem on 14 item c0405 count 1 silent false stack <S> ... ret 2 kInProgress ... from
// QF_MS01_00018B4B.Fragment_56" (Fragment_62 for 49), then within a frame a functor pair whose stackID is <S>, its list.leaves [f],
// and inside it "event platform old 0 new 14 base f x<band> ... in functor <seq> stack <S> member yes ..." (the vm row beside it,
// paired); x400 for a seat below level 10 by LVLF's unset "from all levels" bit (TESLeveledList.h:46), HYPOTHESIS: the count reads
// it. The control, FreeformStonehillsA 0x64958 stage 20 (QF_FreeformStonehillsA_00064958.Fragment_2): "call
// ObjectReference.AddItem on 14 item f count 25 ..." (the count is the global FavorGoldRewardSmall 0x57f01, 25 in Skyrim.esm) and
// an in-window "base f x25". The harvest (the probe's leg 0): "event ... new 14 base ec870 ... in Activate call <seq> on ec85c" or
// "in none", never inside a functor. The client's 5 s apply then takes the unrecorded grants back (x-acting-frame 072506): rows
// "old 14 new 0 base f" in no window.
// Falsifiers: an event with new 14 and a member base outside every functor window (after the leave, before the enter, or on another
// thread while the window is open) and no event inside the window: not synchronous, the builder's join fails as planned; a
// functor whose stackID differs from its matched call's (the match is by stack id, so a functor that matches no call while a call's
// pending entry waits is the reading: both stack ids print); an in-window event whose base is c0405 itself (listItself: the list
// landed, not a roll). Unread, not false: no call row while the probe's stage set answered and its stage reads done (the wrong
// process first: the ready row's pid; then the caller column of the summary's counts); call rows and no functor row (the ready
// row's slot 01 and locator checks; foreign counts); functor rows and no event at all from either sink (the VM sink's attach line;
// LVLD 0 means no empty roll, so a functor with no event inside is a reading, not chance).
// LAB_PARAMS (lab-api's frida step prepends globalThis.LAB_PARAMS): TTL seconds to the final row and the detach (default 600); ROWS
// the call and functor rows printed (64); EVENT_ROWS the event rows (200); BT backtraces for the first BT enters of a functor
// matched to a call on PLAYER and the first BT events inside one (3; 0 for none); RAW the functor bytes dumped (0x28, the static
// read's size; 0x10 to 0x80); PLAYER the container id whose events always print and whose calls get the backtraces (0x14). Run
// from a probe at least 15 s before the first call (a script goes ready late), with a TTL that ends before the run fetches the
// trace, so `final` and `detached` reach the artifact (x-additem-functor fetches after 104 s of waits and its steps, about two
// minutes after the load): `- c1: frida {script: additem-functor.js, params: {TTL: 100}}`, then `wait: 15`. 1.6.1170 only.
'use strict';
const AI_PARAMS = (typeof LAB_PARAMS === 'object' && LAB_PARAMS) ? LAB_PARAMS : {};
function aiParseForm(v, dflt) {
  if (typeof v === 'number' && Number.isFinite(v) && v > 0) return v >>> 0;
  if (typeof v === 'string') {
    const s = v.trim();
    if (/^0x[0-9a-f]+$/i.test(s)) return parseInt(s.slice(2), 16) >>> 0;
    if (/^[0-9a-f]+$/i.test(s)) return parseInt(s, 16) >>> 0;
  }
  return dflt;
}
function aiPositive(v, dflt) { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : dflt; }
function aiCount(v, dflt) { const n = Number(v); return Number.isFinite(n) && n >= 0 ? Math.floor(n) : dflt; }
const AI_TTL_S = aiPositive(AI_PARAMS.TTL, 600);
const AI_ROWS = Math.floor(aiPositive(AI_PARAMS.ROWS, 64));
const AI_EVENT_ROWS = Math.floor(aiPositive(AI_PARAMS.EVENT_ROWS, 200));
const AI_BT = aiCount(AI_PARAMS.BT, 3);
const AI_RAW = Math.min(Math.max(aiParseForm(AI_PARAMS.RAW, 0x28), 0x10), 0x80) & ~7;
const AI_PLAYER = aiParseForm(AI_PARAMS.PLAYER, 0x14);
const AI_SUMMARY_MS = 10000;
const AI_LINES_MAX = 256;
const AI_WINDOW_EVENTS_MAX = 32;
const AI_PENDING_MAX = 256;
const AI_SINKS_MAX = 32;
const AI_LIST_DEPTH = 3;
const AI_LIST_ENTRIES_MAX = 64; // per list
const AI_LIST_TOTAL_MAX = 256; // entries over one walk, so a deep loot list keeps its row small
const AI_LIST_LEAVES_MAX = 64;
const AI_PLATFORM_ATTACH_MS = 500; // the platform sink's attach after the scan, once the SendEvent loop that ran it is past its entry
function aiEmit(obj) {
  obj.t = Date.now();
  try { send(obj); } catch (e) { /* lab-api's preamble makes send a no-op */ }
  console.log(JSON.stringify(obj));
}

// `just addr <id>` on Address Library 1.6.1170, 2026-11-10 (never from memory, CLAUDE.md rule 1)
const AI_OFFSETS = {
  '1.6.1170.0': {
    call: 0x143dc00, // 104651 NativeFunctionBase::Call (h)
    functorVtable: 0x1928b38, // 218372 VTABLE_SkyrimScript____AddItemFunctor (r; its slot 01 hooked)
    functorRtti: 0x20b49e8, // 397281 RTTI_SkyrimScript____AddItemFunctor (r)
    vmSingleton: 0x20fba70, // 400475 SkyrimVM's singleton, a SkyrimVM** (r; the container sink's slot 01 hooked)
    vmRtti: 0x20ae610, // 396984 RTTI_SkyrimVM (r)
    mainSingleton: 0x31872c0, // 403449 Main's singleton, a Main* (r)
    scriptFunctionVtable: 0x1aa5ad0, // 252888 VTABLE_BSScript__Internal__ScriptFunction (r)
    staticOperator: 0xa28b40, // 56095 the static read's AddItemFunctor::operator() (s)
    staticAddItemStub: 0xa2c110, // 56145 the static read's ObjectReference.AddItem callback (s)
    staticQueuePostRender: 0x9c34c0, // 53955 SkyrimVM::QueuePostRenderCall (s; named, not hooked)
  },
};
const AI_IDS = {
  call: 104651, functorVtable: 218372, functorRtti: 397281, vmSingleton: 400475, vmRtti: 396984, mainSingleton: 403449,
  scriptFunctionVtable: 252888, staticOperator: 56095, staticAddItemStub: 56145, staticQueuePostRender: 53955,
};
const AI_GHIDRA_BYTES = { call: '4c89442418555657' }; // native-frame.js's static read of 104651's entry

// DelayFunctor.h:16-45, BSIntrusiveRefCounted.h:29
const AI_DF_REFCOUNT = 0x08, AI_DF_STACK_ID = 0x0c, AI_DF_SIZE = 0x10;
const AI_DF_SLOTS = ['~DelayFunctor', 'operator()', 'IsLatent', 'WantsRequeue', 'SaveImpl', 'GetType', 'LoadImpl']; // :32-40
// SkyrimVM.h:95; BSTEvent.h:130-131, :146; BSTArray.h:139-141, :44-46, :374-376
const AI_VM_CONTAINER_SINK = 0x48;
const AI_SRC_SINKS = 0x00, AI_SRC_PENDING = 0x18, AI_ARRAY_SIZE = 0x10;
// TESContainerChangedEvent.h:11-17
const AI_EV_OLD = 0x00, AI_EV_NEW = 0x04, AI_EV_BASE = 0x08, AI_EV_COUNT = 0x0c, AI_EV_REF = 0x10, AI_EV_UID = 0x14;
// NativeFunctionBase.h:62-69 and ScriptFunction.h:45-47; the callback at +0x50 (papyrus-native-entries.md:28-33, HYPOTHESIS)
const AI_FN_NAME = 0x10, AI_FN_CLASS = 0x18, AI_FN_STATE = 0x20, AI_FN_IS_LATENT = 0x42, AI_FN_STUB = 0x50;
// Stack.h:74-83
const AI_STACK_FRAMES = 0x58, AI_STACK_TOP = 0x60, AI_STACK_STATE = 0x68, AI_STACK_ID = 0x80, AI_STACK_TYPE = 0x84;
const AI_STACK_CALLBACK = 0x90;
// StackFrame.h:21-33
const AI_FRAME_PREVIOUS = 0x08, AI_FRAME_FUNCTION = 0x10, AI_FRAME_TYPE = 0x18, AI_FRAME_SELF = 0x28, AI_FRAME_SIZE = 0x38;
const AI_FRAME_ARGS = 0x40, AI_VAR_SIZE = 0x10;
// Variable.h:93-94; ObjectTypeInfo.h:177; Object.h:43-46; Main.h:87
const AI_VAR_TYPE = 0x00, AI_VAR_VALUE = 0x08;
const AI_TYPE_NAME = 0x08;
const AI_OBJ_TYPE = 0x08, AI_OBJ_HANDLE = 0x20;
const AI_MAIN_THREAD_ID = 0x28;
// TESForm.h:354-356; FormTypes.h
const AI_FORM_ID = 0x14, AI_FORM_TYPE = 0x1a;
const AI_FT_MISC = 0x20, AI_FT_LEVELED_ITEM = 0x35, AI_FT_FORM_LIST = 0x5b, AI_FT_MAX = 0x8a;
// TESLevItem.h:11; TESLeveledList.h:15-25, :68-78; MemoryManager.h:299, :357-368
const AI_LEVITEM_LIST = 0x30, AI_LL_ENTRIES = 0x08, AI_LL_CHANCE_NONE = 0x10, AI_LL_FLAGS = 0x11, AI_LL_NUM = 0x12;
const AI_LO_FORM = 0x00, AI_LO_COUNT = 0x08, AI_LO_LEVEL = 0x0a, AI_LO_SIZE = 0x18;
// RTTI.h:108-124 and :9-20
const AI_COL_SIGNATURE = 0x00, AI_COL_OFFSET = 0x04, AI_COL_TYPE_DESCRIPTOR = 0x0c, AI_TD_NAME = 0x10;
const AI_RAW_NAMES = { 0: 'none', 1: 'object', 2: 'string', 3: 'int', 4: 'float', 5: 'bool', 10: 'none[]', 11: 'object[]', 12: 'string[]', 13: 'int[]', 14: 'float[]', 15: 'bool[]' }; // TypeInfo.h:14-26
const AI_CALL_RESULTS = ['kCompleted', 'kSetupForVM', 'kInProgress', 'kFailedRetry', 'kFailedAbort']; // IFunction.h:36-40
const AI_STACK_STATES = ['kRunning', 'kFinished', 'kWaitingOnMemory', 'kWaitingOnLatentFunction', 'kWaitingOnOtherStackForCall', 'kWaitingOnOtherStackForReturn', 'kWaitingOnOtherStackForReturnNoPop', 'kRetryReturnNoPop', 'kRetryCall']; // Stack.h:29-37
const AI_P16 = ptr(16); // kArraysEnd and past it a class pointer (TypeInfo.h:28-31)
const AI_NOT_BIT0 = ptr('0xfffffffffffffffe');

function aiFileVersion(path) {
  const ver = Module.load('version.dll');
  const size = new NativeFunction(ver.getExportByName('GetFileVersionInfoSizeW'), 'uint32', ['pointer', 'pointer']);
  const info = new NativeFunction(ver.getExportByName('GetFileVersionInfoW'), 'int', ['pointer', 'uint32', 'uint32', 'pointer']);
  const query = new NativeFunction(ver.getExportByName('VerQueryValueW'), 'int', ['pointer', 'pointer', 'pointer', 'pointer']);
  const p = Memory.allocUtf16String(path);
  const n = size(p, NULL);
  if (n === 0) return null;
  const buf = Memory.alloc(n);
  if (!info(p, 0, n, buf)) return null;
  const out = Memory.alloc(Process.pointerSize);
  const len = Memory.alloc(4);
  if (!query(buf, Memory.allocUtf16String('\\'), out, len)) return null;
  const ffi = out.readPointer();
  const ms = ffi.add(8).readU32();
  const ls = ffi.add(12).readU32();
  return [ms >>> 16, ms & 0xffff, ls >>> 16, ls & 0xffff].join('.');
}

function aiHex(n) { return '0x' + (n >>> 0).toString(16); }
function aiId(n) { return (n >>> 0).toString(16); } // the platform's log shape, no 0x
function aiP(p, o) { try { return p.isNull() ? NULL : p.add(o).readPointer(); } catch (e) { return NULL; } }
function aiU8(p, o) { try { return p.add(o).readU8(); } catch (e) { return -1; } }
function aiS8(p, o) { try { return p.add(o).readS8(); } catch (e) { return null; } }
function aiU16(p, o) { try { return p.add(o).readU16(); } catch (e) { return -1; } }
function aiU32(p, o) { try { return p.add(o).readU32(); } catch (e) { return -1; } }
function aiS32(p, o) { try { return p.add(o).readS32(); } catch (e) { return null; } }
function aiF32(p, o) { try { return +p.add(o).readFloat().toPrecision(7); } catch (e) { return null; } }
function aiU64n(p, o) { try { return p.add(o).readU64().toNumber(); } catch (e) { return -1; } }
function aiFixed(field) { // a BSFixedString field: its one pointer is the characters (BSFixedString.h:232); null the empty string
  // read to the NUL and then cut (native-frame.js v2's lesson: a sized readCString reads past the NUL into the pool)
  try {
    const s = field.readPointer();
    if (s.isNull()) return '';
    const text = s.readCString();
    return text === null ? null : text.slice(0, 160);
  } catch (e) {
    return null;
  }
}
function aiBytes(p, n) {
  try {
    const a = new Uint8Array(p.readByteArray(n));
    let s = '';
    for (let i = 0; i < a.length; i++) s += ('0' + a[i].toString(16)).slice(-2);
    return s;
  } catch (e) {
    return 'unreadable';
  }
}
function aiWhere(p) {
  if (p.isNull()) return '0x0';
  try {
    const m = Process.findModuleByAddress(p);
    return m === null ? p.toString() : m.name + '+0x' + p.sub(m.base).toString(16);
  } catch (e) {
    return p.toString();
  }
}
function aiGuessBody(bytes) { // HYPOTHESIS, a reading aid: three one-instruction bodies (mov al, imm8; xor al, al; mov eax, imm32; then ret)
  if (typeof bytes !== 'string') return null;
  if (bytes.startsWith('b0') && bytes.slice(4, 6) === 'c3') return 'returns ' + parseInt(bytes.slice(2, 4), 16);
  if ((bytes.startsWith('32c0') || bytes.startsWith('30c0') || bytes.startsWith('33c0') || bytes.startsWith('31c0')) && bytes.slice(4, 6) === 'c3') return 'returns 0';
  if (bytes.startsWith('b8') && bytes.slice(10, 12) === 'c3') {
    const v = parseInt(bytes.slice(8, 10) + bytes.slice(6, 8) + bytes.slice(4, 6) + bytes.slice(2, 4), 16);
    return 'returns ' + v;
  }
  return null;
}

const aiExe = Process.getModuleByName('SkyrimSE.exe');
const aiVersion = aiFileVersion(aiExe.path);
const aiOff = AI_OFFSETS[aiVersion];
if (aiOff === undefined) {
  aiEmit({ event: 'ready', script: 'additem-functor.js', error: 'no offsets for this runtime', version: aiVersion, pid: Process.id, params: AI_PARAMS });
} else {
  const aiAt = function (name) { return aiExe.base.add(aiOff[name]); };
  const aiExeEnd = aiExe.base.add(aiExe.size);
  const aiInExe = function (p) { return !p.isNull() && p.compare(aiExe.base) >= 0 && p.compare(aiExeEnd) < 0; };
  const aiRva = function (p) { return aiInExe(p) ? aiHex(p.sub(aiExe.base).toUInt32()) : null; };
  const aiSfVtable = aiAt('scriptFunctionVtable');
  const aiMainThread = function () { // Main's singleton (Offsets.h:383), threadID at +0x28 (Main.h:87)
    const main = aiP(aiAt('mainSingleton'), 0);
    return main.isNull() ? 0 : aiU32(main, AI_MAIN_THREAD_ID);
  };
  let aiMain = aiMainThread();

  // the clock: kernel32's QueryPerformanceCounter into a per-thread buffer, microseconds; Date.now() if it cannot be had
  let aiQpcFn = null, aiQpcFreq = 0;
  const aiQpcBufs = new Map();
  try {
    const k32 = Process.getModuleByName('kernel32.dll');
    aiQpcFn = new NativeFunction(k32.getExportByName('QueryPerformanceCounter'), 'int', ['pointer']);
    const freqFn = new NativeFunction(k32.getExportByName('QueryPerformanceFrequency'), 'int', ['pointer']);
    const fb = Memory.alloc(8);
    if (freqFn(fb)) aiQpcFreq = fb.readU64().toNumber();
  } catch (e) {
    aiQpcFn = null;
  }
  const aiNowUs = function (tid) {
    if (aiQpcFn === null || aiQpcFreq <= 0) return Date.now() * 1000;
    let b = aiQpcBufs.get(tid);
    if (b === undefined) {
      b = Memory.alloc(8);
      aiQpcBufs.set(tid, b);
    }
    aiQpcFn(b);
    return b.readU64().toNumber() / aiQpcFreq * 1e6;
  };

  // reads of the VM's values (memory only), acting-frame.js's
  const aiTypeNames = new Map();
  const aiTypeInfoName = function (oti) {
    if (oti.isNull()) return null;
    const k = oti.toString();
    let n = aiTypeNames.get(k);
    if (n === undefined) {
      n = aiFixed(oti.add(AI_TYPE_NAME));
      aiTypeNames.set(k, n);
    }
    return n;
  };
  const aiRawKind = function (raw) { // TypeInfo.cpp's GetUnmangledRawType: below 16 the raw kind, else 1 or 11 by bit 0
    if (raw.compare(AI_P16) < 0) return raw.toUInt32();
    return raw.and(1).isNull() ? 1 : 11;
  };
  const aiTypeName = function (raw) {
    if (raw.compare(AI_P16) < 0) {
      const k = raw.toUInt32();
      return AI_RAW_NAMES[k] !== undefined ? AI_RAW_NAMES[k] : 'raw ' + k;
    }
    const name = aiTypeInfoName(raw.and(AI_NOT_BIT0));
    return raw.and(1).isNull() ? name : name + '[]';
  };
  const aiObject = function (obj) { // Object.h:43-46 and the handle's three parts (HYPOTHESIS encoding, printed raw)
    if (obj.isNull()) return { none: true };
    const lo = aiU32(obj, AI_OBJ_HANDLE), hi = aiU32(obj, AI_OBJ_HANDLE + 4);
    return {
      at: obj.toString(), type: aiTypeInfoName(aiP(obj, AI_OBJ_TYPE)),
      kind: hi < 0 ? null : hi >>> 16, mid: hi < 0 ? null : aiHex(hi & 0xffff), low: lo < 0 ? null : aiHex(lo),
    };
  };
  const aiVariable = function (v) { // Variable.h:93-94
    const raw = aiP(v, AI_VAR_TYPE);
    const kind = aiRawKind(raw);
    const val = v.add(AI_VAR_VALUE);
    const r = { type: aiTypeName(raw) };
    if (kind === 1) {
      r.object = aiObject(aiP(val, 0));
    } else if (kind === 2) {
      r.value = aiFixed(val);
    } else if (kind === 3) {
      r.value = aiS32(val, 0);
    } else if (kind === 4) {
      r.value = aiF32(val, 0);
    } else if (kind === 5) {
      const b = aiU8(val, 0);
      r.value = b < 0 ? null : b !== 0;
    } else if (kind === 0) {
      r.value = null;
    } else {
      r.value = 'kind ' + kind;
    }
    return r;
  };
  const aiLow = function (variable) { // a Variable's object handle's low 32 bits as a number, else null
    const o = variable.object;
    return o !== undefined && !o.none && o.low !== null ? parseInt(o.low.slice(2), 16) >>> 0 : null;
  };
  const aiWheres = new Map();
  const aiWhereOnce = function (p) {
    const k = p.toString();
    let w = aiWheres.get(k);
    if (w === undefined) {
      w = aiWhere(p);
      aiWheres.set(k, w);
    }
    return w;
  };
  const aiModules = new Map();
  const aiModule = function (p) {
    if (p.isNull()) return 'none';
    const k = p.toString();
    let n = aiModules.get(k);
    if (n === undefined) {
      const m = Process.findModuleByAddress(p);
      n = m === null ? 'unknown' : m.name;
      aiModules.set(k, n);
    }
    return n;
  };
  const aiFrame = function (frame) { // StackFrame.h:21-28: whose function, which script's type, on which self
    if (frame.isNull()) return null;
    const fn = aiP(frame, AI_FRAME_FUNCTION);
    const vt = aiP(fn, 0);
    return {
      at: frame.toString(), type: aiTypeInfoName(aiP(frame, AI_FRAME_TYPE)),
      fn: fn.isNull() ? null : aiFixed(fn.add(AI_FN_NAME)), cls: fn.isNull() ? null : aiFixed(fn.add(AI_FN_CLASS)),
      isScript: !vt.isNull() && vt.equals(aiSfVtable), size: aiU32(frame, AI_FRAME_SIZE), self: aiVariable(frame.add(AI_FRAME_SELF)),
    };
  };
  const aiKey = function (f) { return f === null ? 'none' : (f.type || f.cls || '?') + '.' + (f.fn || '?'); };

  // forms, lists and RTTI (memory only)
  const aiForm = function (p) { // a TESForm* when its vtable lies in SkyrimSE.exe and its formType is below Max (TESForm.h, FormTypes.h:279)
    if (p.isNull()) return null;
    const vt = aiP(p, 0);
    if (!aiInExe(vt)) return null;
    const ft = aiU8(p, AI_FORM_TYPE);
    if (ft < 0 || ft >= AI_FT_MAX) return null;
    const id = aiU32(p, AI_FORM_ID);
    return id < 0 ? null : { at: p.toString(), id: aiId(id), type: aiHex(ft) };
  };
  const aiLists = new Map(); // a TESLevItem* -> its live read
  const aiListRead = function (form) { // TESLevItem.h:11, TESLeveledList.h:68-78, LEVELED_OBJECT :15-25, SimpleArray MemoryManager.h:299, :357-368
    const k = form.toString();
    let r = aiLists.get(k);
    if (r !== undefined) return r;
    r = { at: k, entries: [], leaves: [], nested: 0, truncated: false };
    const seen = new Set();
    const walk = function (lv, depth) {
      if (depth > AI_LIST_DEPTH || seen.has(lv.toString())) {
        r.truncated = true;
        return;
      }
      seen.add(lv.toString());
      const ll = lv.add(AI_LEVITEM_LIST);
      const data = aiP(ll, AI_LL_ENTRIES);
      const num = aiU8(ll, AI_LL_NUM);
      if (depth === 0) {
        r.chanceNone = aiS8(ll, AI_LL_CHANCE_NONE);
        r.flags = aiHex(aiU8(ll, AI_LL_FLAGS));
        r.numEntries = num;
        r.arraySize = data.isNull() ? 0 : aiU64n(data.sub(8), 0);
      }
      if (num > AI_LIST_ENTRIES_MAX) r.truncated = true;
      for (let i = 0; i < Math.min(num < 0 ? 0 : num, AI_LIST_ENTRIES_MAX); i++) {
        if (r.entries.length >= AI_LIST_TOTAL_MAX) {
          r.truncated = true;
          return;
        }
        const e = data.add(i * AI_LO_SIZE);
        const f = aiP(e, AI_LO_FORM);
        const fr = aiForm(f);
        r.entries.push({ depth: depth, id: fr === null ? null : fr.id, type: fr === null ? null : fr.type, count: aiU16(e, AI_LO_COUNT), level: aiU16(e, AI_LO_LEVEL) });
        if (fr === null) continue;
        if (parseInt(fr.type.slice(2), 16) === AI_FT_LEVELED_ITEM) {
          r.nested++;
          walk(f, depth + 1);
        } else if (r.leaves.indexOf(fr.id) < 0) {
          if (r.leaves.length < AI_LIST_LEAVES_MAX) r.leaves.push(fr.id);
          else r.truncated = true;
        }
      }
    };
    try {
      walk(form, 0);
    } catch (e) {
      r.error = String(e);
    }
    aiLists.set(k, r);
    return r;
  };
  const aiRtti = function (vt) { // vtable[-1] is the complete object locator (RTTI.h:108-124); RVAs from the locator's own image
    try {
      const col = vt.sub(8).readPointer();
      const m = Process.findModuleByAddress(col);
      const td = aiU32(col, AI_COL_TYPE_DESCRIPTOR);
      let name = null;
      if (m !== null && td > 0) {
        try { name = m.base.add(td).add(AI_TD_NAME).readCString(); } catch (e) { name = null; }
      }
      return {
        col: aiWhere(col), signature: aiU32(col, AI_COL_SIGNATURE), offset: aiHex(aiU32(col, AI_COL_OFFSET)),
        typeDescriptor: td < 0 ? null : aiHex(td), module: m === null ? null : m.name, name: name === null ? null : name.slice(0, 160),
      };
    } catch (e) {
      return { error: String(e) };
    }
  };
  const aiBacktrace = function (ctx) {
    try {
      return Thread.backtrace(ctx, Backtracer.ACCURATE).slice(0, 16).map(aiWhereOnce);
    } catch (e) {
      return ['backtrace: ' + e];
    }
  };

  // counts, windows and the pending calls
  const aiC = {
    calls: 0, callsWin: 0, addItemCalls: 0, activateCalls: 0, addItemRows: 0, noStack: 0,
    functorAll: 0, functorAllWin: 0, functorOwn: 0, functorForeign: 0, functorMatched: 0, functorRerun: 0, functorUnmatched: 0, functorEmpty: 0, functorWithEvents: 0,
    sretYes: 0, sretNo: 0, vmEvents: 0, vmEventsWin: 0, vmForeignThis: 0, platformEvents: 0, platformEventsWin: 0, platformForeignThis: 0,
    playerEvents: 0, inFunctor: 0, inCall: 0, outside: 0, paired: 0, eventRows: 0, eventRowsCapped: 0, functorRows: 0, functorRowsCapped: 0,
    pulse: 0, summaries: 0, bt: 0, btEvents: 0, listItself: 0,
  };
  let aiSeq = 0;
  let aiLastSummary = Date.now();
  const aiT0 = Date.now();
  const aiFns = new Map(); // IFunction* -> names and kind, read once each
  const aiWindows = new Map(); // thread id -> the open windows, innermost last
  const aiPending = new Map(); // stack id -> the AddItem call's read, until a functor names it
  const aiDone = new Map(); // stack id -> the call a functor matched, for a requeued functor's next run (WantsRequeue, slot 03)
  const aiForeignVtables = new Map(); // a foreign `this` vtable -> calls
  const aiLastEvent = new Map(); // thread id -> {sink, key, seq}, for the pair of one SendEvent loop
  const aiLines = [];
  let aiLinesNew = [];
  const aiFailures = {};
  const aiFail = function (where, e) {
    aiFailures[where] = (aiFailures[where] || 0) + 1;
    if (aiFailures[where] <= 5) aiEmit({ event: 'error', where: where, error: String(e), stack: e && e.stack ? String(e.stack).slice(0, 400) : null });
  };
  const aiLine = function (line) {
    if (aiLines.length < AI_LINES_MAX) aiLines.push(line);
    if (aiLinesNew.length < AI_LINES_MAX) aiLinesNew.push(line);
  };
  const aiOpen = function (tid, w) {
    let a = aiWindows.get(tid);
    if (a === undefined) {
      a = [];
      aiWindows.set(tid, a);
    }
    a.push(w);
  };
  const aiClose = function (tid, w) {
    const a = aiWindows.get(tid);
    if (a === undefined) return;
    const i = a.lastIndexOf(w);
    if (i >= 0) a.splice(i, 1);
    if (a.length === 0) aiWindows.delete(tid);
  };
  const aiInnermost = function (tid, kind) {
    const a = aiWindows.get(tid);
    if (a === undefined) return null;
    for (let i = a.length - 1; i >= 0; i--) if (kind === undefined || a[i].kind === kind) return a[i];
    return null;
  };
  const aiOtherFunctors = function (tid) {
    const out = [];
    aiWindows.forEach(function (a, t) {
      if (t === tid) return;
      for (const w of a) if (w.kind === 'functor') out.push({ tid: t, seq: w.seq, stack: w.stackId });
    });
    return out;
  };
  const aiThreadWord = function (tid) { return tid === aiMain ? 'main' : 'worker'; };
  const aiPlayerFunctor = function (w) { return w !== null && w.call !== null && w.call.selfLow === AI_PLAYER; }; // BT's budget

  // Call 104651: ObjectReference.AddItem and ObjectReference.Activate
  const aiFnInfo = function (fn) {
    const name = aiFixed(fn.add(AI_FN_NAME)), cls = aiFixed(fn.add(AI_FN_CLASS));
    const n = name === null ? '' : name.toLowerCase(), c = cls === null ? '' : cls.toLowerCase();
    let kind = null;
    if (c === 'objectreference' && n === 'additem') kind = 'AddItem';
    else if (c === 'objectreference' && n === 'activate') kind = 'Activate';
    const f = { at: fn.toString(), name: name, cls: cls, kind: kind, n: 0 };
    if (kind !== null) {
      const stub = aiP(fn, AI_FN_STUB);
      f.state = aiFixed(fn.add(AI_FN_STATE));
      f.latent = aiU8(fn, AI_FN_IS_LATENT);
      f.stub = aiWhere(stub);
      f.stubRva = aiRva(stub);
      if (kind === 'AddItem') f.stubAgreesWithStaticRead = f.stubRva === aiHex(aiOff.staticAddItemStub);
    }
    return f;
  };
  const aiOpenCall = function (ctx, fn, f, args) {
    const tid = ctx.threadId;
    const stack = aiP(args[1], 0); // the smart pointer's one member (BSTSmartPointer.h:229)
    const top = aiP(stack, AI_STACK_TOP);
    const stackId = stack.isNull() ? -1 : aiU32(stack, AI_STACK_ID);
    const w = { kind: f.kind, seq: ++aiSeq, tid: tid, stackId: stackId, events: [], f: f };
    if (stack.isNull() || top.isNull()) aiC.noStack++;
    if (f.kind === 'Activate') {
      aiC.activateCalls++;
      w.selfLow = top.isNull() ? null : aiLow(aiVariable(top.add(AI_FRAME_SELF)));
      w.us0 = aiNowUs(tid);
      aiOpen(tid, w);
      return w;
    }
    aiC.addItemCalls++;
    const ra = ctx.returnAddress;
    const cb = aiP(stack, AI_STACK_CALLBACK);
    const args3 = [];
    if (!top.isNull()) for (let i = 0; i < 3; i++) args3.push(aiVariable(top.add(AI_FRAME_ARGS + i * AI_VAR_SIZE)));
    const self = top.isNull() ? null : aiVariable(top.add(AI_FRAME_SELF));
    const caller = top.isNull() ? null : aiFrame(aiP(top, AI_FRAME_PREVIOUS));
    w.us0 = aiNowUs(tid);
    w.read = {
      stack: {
        at: stack.toString(), id: stackId, type: aiU32(stack, AI_STACK_TYPE), frames: aiU32(stack, AI_STACK_FRAMES),
        stateEnter: AI_STACK_STATES[aiU32(stack, AI_STACK_STATE)] || String(aiU32(stack, AI_STACK_STATE)),
        callback: cb.isNull() ? null : { at: cb.toString(), vtable: aiWhereOnce(aiP(cb, 0)), module: aiModule(aiP(cb, 0)) },
      },
      own: !top.isNull() && aiP(top, AI_FRAME_FUNCTION).equals(fn), frameSize: top.isNull() ? null : aiU32(top, AI_FRAME_SIZE),
      self: self, args: args3, caller: caller, vm: aiInExe(ra), callerModule: aiInExe(ra) ? 'vm' : aiModule(ra), ret: aiWhereOnce(ra),
      fn: { at: f.at, cls: f.cls, name: f.name, state: f.state, latent: f.latent, stub: f.stub, stubRva: f.stubRva, stubAgreesWithStaticRead: f.stubAgreesWithStaticRead },
    };
    w.selfLow = self === null ? null : aiLow(self);
    w.itemLow = args3.length > 0 ? aiLow(args3[0]) : null;
    w.count = args3.length > 1 && typeof args3[1].value === 'number' ? args3[1].value : null;
    w.silent = args3.length > 2 && typeof args3[2].value === 'boolean' ? args3[2].value : null;
    if (stackId >= 0) {
      if (aiPending.size >= AI_PENDING_MAX) aiPending.delete(aiPending.keys().next().value);
      aiPending.set(stackId, w);
    }
    aiOpen(tid, w);
    return w;
  };
  const aiCloseCall = function (w, retval) {
    aiClose(w.tid, w);
    const ret = retval.toInt32();
    const resultName = AI_CALL_RESULTS[ret] || String(ret);
    if (w.kind === 'Activate') {
      if (w.events.length > 0 && aiC.addItemRows < AI_ROWS) {
        aiC.addItemRows++;
        aiEmit({ event: 'activateCall', seq: w.seq, tid: w.tid, main: w.tid === aiMain, self: w.selfLow === null ? null : aiId(w.selfLow), stack: w.stackId, result: ret, resultName: resultName, events: w.events });
      }
      return;
    }
    w.usLeave = aiNowUs(w.tid);
    w.result = ret;
    const stack = ptr(w.read.stack.at);
    const stateLeave = aiU32(stack, AI_STACK_STATE);
    const cbm = w.read.stack.callback === null ? 'none' : w.read.stack.callback.module;
    const line = 'call ObjectReference.AddItem on ' + (w.selfLow === null ? '?' : aiId(w.selfLow)) + ' item ' + (w.itemLow === null ? '?' : aiId(w.itemLow)) +
      ' count ' + w.count + ' silent ' + w.silent + ' stack ' + w.stackId + ' type ' + w.read.stack.type + ' ret ' + ret + ' ' + resultName +
      ' state ' + w.read.stack.stateEnter + '->' + (AI_STACK_STATES[stateLeave] || String(stateLeave)) + ' latent ' + w.read.fn.latent +
      ' own ' + (w.read.own ? 'yes' : 'no') + ' caller ' + w.read.callerModule + ' cb ' + cbm + ' from ' + aiKey(w.read.caller) +
      ' events-in-call ' + w.events.length + ' thread ' + w.tid + ' ' + aiThreadWord(w.tid);
    aiLine(line);
    if (aiC.addItemRows >= AI_ROWS) return;
    aiC.addItemRows++;
    aiEmit({
      event: 'addItemCall', seq: w.seq, line: line, tid: w.tid, main: w.tid === aiMain, stack: w.read.stack, stateLeave: AI_STACK_STATES[stateLeave] || String(stateLeave),
      own: w.read.own, frameSize: w.read.frameSize, self: w.read.self, args: w.read.args, caller: w.read.caller, callerModule: w.read.callerModule,
      ret: w.read.ret, fn: w.read.fn, result: ret, resultName: resultName, us: +(w.usLeave - w.us0).toFixed(1), eventsInCall: w.events,
    });
  };

  // AddItemFunctor's operator()
  const aiFunctorVt = aiAt('functorVtable');
  const aiDecodeQwords = function (self) {
    const out = [];
    for (let off = AI_DF_SIZE; off < AI_RAW; off += 8) {
      const q = aiP(self, off);
      const f = aiForm(q);
      out.push({ off: aiHex(off), q: q.toString(), lo: aiU32(self, off), hi: aiU32(self, off + 4), form: f });
    }
    return out;
  };
  const aiNameFields = function (qw, call) { // HYPOTHESIS, by value against the call's own: never a layout
    const named = {};
    for (const d of qw) {
      if (d.form !== null) {
        const id = parseInt(d.form.id, 16) >>> 0;
        if (call !== null && call.itemLow !== null && id === call.itemLow && named.item === undefined) named.item = d.off;
        else if (call !== null && call.selfLow !== null && id === call.selfLow && named.target === undefined) named.target = d.off;
      }
      if (call !== null && call.count !== null) {
        if (d.lo === call.count && named.count === undefined) named.count = d.off;
        else if (d.hi === call.count && named.count === undefined) named.count = aiHex(parseInt(d.off.slice(2), 16) + 4);
      }
    }
    return named;
  };
  const aiItemOf = function (qw, call) { // the item form: the qword whose form id is the call's item, else the first leveled or form list
    let pick = null;
    for (const d of qw) {
      if (d.form === null) continue;
      const id = parseInt(d.form.id, 16) >>> 0;
      if (call !== null && call.itemLow !== null && id === call.itemLow) return d;
      const ft = parseInt(d.form.type.slice(2), 16);
      if (pick === null && (ft === AI_FT_LEVELED_ITEM || ft === AI_FT_FORM_LIST)) pick = d;
    }
    return pick;
  };
  const aiOpenFunctor = function (ctx, self, retBuf) {
    const tid = ctx.threadId;
    aiC.functorOwn++;
    const stackId = aiU32(self, AI_DF_STACK_ID);
    const first = aiPending.has(stackId) ? aiPending.get(stackId) : null;
    const rerun = first === null && aiDone.has(stackId); // a requeued functor runs again on the call it matched
    const call = first !== null ? first : (rerun ? aiDone.get(stackId) : null);
    if (first !== null) aiC.functorMatched++;
    else if (rerun) aiC.functorRerun++;
    else aiC.functorUnmatched++;
    const qw = aiDecodeQwords(self);
    const item = aiItemOf(qw, call);
    let list = null, expect = null;
    if (item !== null) {
      const ft = parseInt(item.form.type.slice(2), 16);
      if (ft === AI_FT_LEVELED_ITEM) {
        list = aiListRead(ptr(item.q));
        expect = list.leaves.slice();
      } else if (ft !== AI_FT_FORM_LIST) {
        expect = [item.form.id];
      }
    }
    const rsp = ctx.context.rsp;
    let retFromRsp = null;
    try {
      const d = retBuf.sub(rsp);
      retFromRsp = retBuf.compare(rsp) >= 0 && d.compare(ptr(0x100000)) < 0 ? d.toInt32() : null;
    } catch (e) {
      retFromRsp = null;
    }
    const w = {
      kind: 'functor', seq: ++aiSeq, tid: tid, stackId: stackId, self: self, retBuf: retBuf, retFromRsp: retFromRsp, call: call, rerun: rerun,
      us0: aiNowUs(tid), events: [], expect: expect, itemId: item === null ? null : item.form.id, itemType: item === null ? null : item.form.type,
      refCount: aiU32(self, AI_DF_REFCOUNT), raw: aiBytes(self, AI_RAW), retBefore: aiBytes(retBuf, 16), ret: aiWhereOnce(ctx.returnAddress),
    };
    aiOpen(tid, w);
    if (first !== null) {
      aiPending.delete(stackId);
      aiDone.delete(stackId);
      if (aiDone.size >= AI_PENDING_MAX) aiDone.delete(aiDone.keys().next().value);
      aiDone.set(stackId, first);
    }
    const row = {
      event: 'functorEnter', seq: w.seq, tid: tid, main: tid === aiMain, this: self.toString(), refCount: w.refCount, stackId: stackId,
      call: call === null ? null : { seq: call.seq, stack: call.stackId, item: call.itemLow === null ? null : aiId(call.itemLow), count: call.count, self: call.selfLow === null ? null : aiId(call.selfLow), tid: call.tid },
      rerun: rerun, afterCallUs: call !== null && call.usLeave !== undefined ? +(w.us0 - call.usLeave).toFixed(1) : null,
      raw: w.raw, qwords: qw, named: aiNameFields(qw, call), item: item === null ? null : item.form, list: list,
      retBuf: retBuf.toString(), retFromRsp: retFromRsp, retBefore: w.retBefore, ret: w.ret,
    };
    if (aiC.bt < AI_BT && aiPlayerFunctor(w)) {
      aiC.bt++;
      row.bt = aiBacktrace(ctx.context);
    }
    if (aiC.functorRows < AI_ROWS) {
      aiC.functorRows++;
      aiEmit(row);
    } else {
      aiC.functorRowsCapped++;
    }
    return w;
  };
  const aiCloseFunctor = function (w, retval) {
    aiClose(w.tid, w);
    const us = aiNowUs(w.tid);
    const sret = retval.equals(w.retBuf);
    if (sret) aiC.sretYes++;
    else aiC.sretNo++;
    if (w.events.length === 0) aiC.functorEmpty++;
    else aiC.functorWithEvents++;
    const retAfter = aiBytes(w.retBuf, 16);
    const retVar = sret ? aiVariable(w.retBuf) : null;
    const stackAfter = aiU32(w.self, AI_DF_STACK_ID);
    const member = w.expect === null ? 'n/a' : (w.events.some(function (e) { return e.member === true; }) ? 'yes' : 'no');
    const list = w.events.map(function (e) { return e.base + 'x' + e.count + ' new ' + e.newC + ' by ' + e.by.join('+'); }).join('; ');
    const line = 'functor ' + w.seq + ' stack ' + w.stackId + ' call ' + (w.call === null ? 'none' : w.call.seq + (w.rerun ? ' rerun' : '')) + ' item ' + (w.itemId === null ? '?' : w.itemId) +
      ' type ' + (w.itemType === null ? '?' : w.itemType) + ' count ' + (w.call === null ? '?' : w.call.count) + ' events ' + w.events.length +
      ' [' + list + '] member ' + member + ' sret ' + (sret ? 'yes' : 'no') + ' ret ' + (retVar === null ? '?' : retVar.type) +
      ' thread ' + w.tid + ' ' + aiThreadWord(w.tid) + ' us ' + (us - w.us0).toFixed(1) +
      ' after-call-ms ' + (w.call !== null && w.call.usLeave !== undefined ? ((w.us0 - w.call.usLeave) / 1000).toFixed(1) : '?');
    aiLine(line);
    if (aiC.functorRows >= AI_ROWS) {
      aiC.functorRowsCapped++;
      return;
    }
    aiC.functorRows++;
    aiEmit({
      event: 'functorLeave', seq: w.seq, line: line, tid: w.tid, main: w.tid === aiMain, this: w.self.toString(), stackId: w.stackId, stackIdAfter: stackAfter, rerun: w.rerun,
      refCountAfter: aiU32(w.self, AI_DF_REFCOUNT), rawAfter: aiBytes(w.self, AI_RAW), us: +(us - w.us0).toFixed(1),
      rax: retval.toString(), rdxAtEntry: w.retBuf.toString(), sret: sret, retFromRsp: w.retFromRsp, retBefore: w.retBefore, retAfter: retAfter, returned: retVar,
      expect: w.expect, events: w.events, member: member,
    });
  };

  // the container sinks: one handler for both
  const aiOnEvent = function (sink, ctx, args, own) {
    const tid = ctx.threadId;
    const evp = args[1];
    const oldC = aiU32(evp, AI_EV_OLD) >>> 0, newC = aiU32(evp, AI_EV_NEW) >>> 0, base = aiU32(evp, AI_EV_BASE) >>> 0;
    const count = aiS32(evp, AI_EV_COUNT), ref = aiU32(evp, AI_EV_REF) >>> 0, uid = aiU16(evp, AI_EV_UID);
    const fw = aiInnermost(tid, 'functor');
    const cw = aiInnermost(tid);
    const player = oldC === AI_PLAYER || newC === AI_PLAYER;
    if (player) aiC.playerEvents++;
    const key = evp.toString() + ' ' + oldC + ' ' + newC + ' ' + base + ' ' + count + ' ' + ref + ' ' + uid;
    const last = aiLastEvent.get(tid);
    const paired = last !== undefined && last.key === key && last.sink !== sink ? last.seq : null;
    const seq = ++aiSeq;
    aiLastEvent.set(tid, { sink: sink, key: key, seq: seq });
    if (paired !== null) aiC.paired++;
    const where = cw === null ? 'none' : (cw.kind === 'functor' ? 'functor ' + cw.seq + ' stack ' + cw.stackId : cw.kind + ' call ' + cw.seq + (cw.selfLow !== null && cw.selfLow !== undefined ? ' on ' + aiId(cw.selfLow) : ''));
    if (fw !== null) aiC.inFunctor++;
    else if (cw !== null) aiC.inCall++;
    else aiC.outside++;
    let member = 'n/a';
    if (fw !== null && fw.expect !== null) member = fw.expect.indexOf(aiId(base)) >= 0 ? 'yes' : 'no';
    let listItself = false;
    if (fw !== null && fw.itemId !== null && fw.itemType !== null && parseInt(fw.itemType.slice(2), 16) === AI_FT_LEVELED_ITEM && aiId(base) === fw.itemId) {
      listItself = true;
      aiC.listItself++;
    }
    const target = fw !== null ? fw : cw;
    if (target !== null) {
      const us = aiNowUs(tid);
      let entry = null;
      for (const e of target.events) if (e.key === key && e.by.indexOf(sink) < 0) { entry = e; break; }
      if (entry !== null) {
        entry.by.push(sink);
      } else if (target.events.length < AI_WINDOW_EVENTS_MAX) {
        target.events.push({ key: key, seq: seq, by: [sink], old: aiId(oldC), newC: aiId(newC), base: aiId(base), count: count, ref: aiHex(ref), uid: uid, member: member === 'yes', atUs: +(us - (target.us0 || us)).toFixed(1) });
      }
    }
    if (!player && cw === null) return;
    const others = aiOtherFunctors(tid);
    const line = 'event ' + sink + ' old ' + aiId(oldC) + ' new ' + aiId(newC) + ' base ' + aiId(base) + ' x' + count + ' ref ' + aiHex(ref) + ' uid ' + uid +
      ' in ' + where + ' member ' + member + (listItself ? ' list-itself' : '') + ' other-threads ' + others.length + (paired !== null ? ' paired ' + paired : '') +
      ' thread ' + tid + ' ' + aiThreadWord(tid);
    aiLine(line);
    if (aiC.eventRows >= AI_EVENT_ROWS) {
      aiC.eventRowsCapped++;
      return;
    }
    aiC.eventRows++;
    const row = {
      event: 'event', seq: seq, sink: sink, line: line, tid: tid, main: tid === aiMain, ownThis: own, at: evp.toString(),
      oldContainer: aiId(oldC), newContainer: aiId(newC), baseObj: aiId(base), itemCount: count, reference: aiHex(ref), uniqueID: uid,
      window: cw === null ? null : { kind: cw.kind, seq: cw.seq, stack: cw.stackId }, functor: fw === null ? null : { seq: fw.seq, stack: fw.stackId, item: fw.itemId },
      otherThreads: others, member: member, listItself: listItself, paired: paired,
    };
    if (aiC.btEvents < AI_BT && aiPlayerFunctor(fw)) {
      aiC.btEvents++;
      row.bt = aiBacktrace(ctx.context);
    }
    aiEmit(row);
  };

  // the platform's sink, found at the VM sink's first event and attached from Frida's JS thread
  const aiPlatform = { scanned: false, target: null, sink: null, attached: false, error: null, bytes: null, n: 0 };
  const aiAttachPlatform = function () {
    try {
      aiPlatform.bytes = aiBytes(aiPlatform.target, 8);
      Interceptor.attach(aiPlatform.target, {
        onEnter(args) {
          aiC.platformEvents++;
          aiC.platformEventsWin++;
          try {
            const own = args[0].equals(aiPlatform.sink);
            if (!own) { aiC.platformForeignThis++; return; } // SendEvent passes the registered sink (BSTEvent.h:106): no container event
            aiOnEvent('platform', this, args, own);
          } catch (e) {
            aiFail('platform sink', e);
          }
        },
      });
      aiPlatform.attached = true;
    } catch (e) {
      aiPlatform.error = String(e);
    }
    aiEmit({ event: 'platformSink', target: aiWhere(aiPlatform.target), sink: aiPlatform.sink.toString(), bytes: aiPlatform.bytes, attached: aiPlatform.attached, error: aiPlatform.error });
  };
  const aiScanSinks = function (source) {
    aiPlatform.scanned = true;
    const sinks = [];
    const walk = function (off, name) {
      const data = aiP(source, off);
      const size = aiU32(source, off + AI_ARRAY_SIZE);
      for (let i = 0; i < Math.min(size < 0 ? 0 : size, AI_SINKS_MAX); i++) {
        const s = aiP(data, i * 8);
        const vt = aiP(s, 0);
        const pe = aiP(vt, 8);
        const mod = aiModule(vt);
        sinks.push({ list: name, i: i, at: s.toString(), vtable: aiWhere(vt), processEvent: aiWhere(pe), module: mod, rtti: vt.isNull() ? null : aiRtti(vt) });
        if (aiPlatform.target === null && mod.toLowerCase() === 'skyrimplatformimpl.dll' && !pe.isNull()) {
          aiPlatform.target = pe;
          aiPlatform.sink = s;
        }
      }
      return size;
    };
    const n = walk(AI_SRC_SINKS, 'sinks');
    const p = walk(AI_SRC_PENDING, 'pendingRegisters');
    aiEmit({ event: 'sinks', source: source.toString(), size: n, pendingRegisters: p, sinks: sinks, platform: aiPlatform.target === null ? null : aiWhere(aiPlatform.target) });
    if (aiPlatform.target !== null) setTimeout(aiAttachPlatform, AI_PLATFORM_ATTACH_MS);
  };

  // the attaches: kernel32!Sleep (the pulse), Call 104651, the functor's slot 01, the VM's container sink
  const aiAttachErrors = [];
  const aiHooks = {};
  try {
    const sleep = Process.getModuleByName('kernel32.dll').getExportByName('Sleep');
    Interceptor.attach(sleep, { onEnter() { aiC.pulse++; } });
  } catch (e) {
    aiAttachErrors.push('Sleep: ' + e);
  }

  aiHooks.call = { id: AI_IDS.call, rva: aiHex(aiOff.call), addr: aiAt('call').toString(), bytes: aiBytes(aiAt('call'), 8), ghidra: AI_GHIDRA_BYTES.call };
  try {
    Interceptor.attach(aiAt('call'), {
      onEnter(args) {
        this.w = undefined;
        aiC.calls++;
        aiC.callsWin++;
        try {
          const fn = args[0];
          const key = fn.toString();
          let f = aiFns.get(key);
          if (f === undefined) {
            f = aiFnInfo(fn);
            aiFns.set(key, f);
          }
          if (f.kind === null) return;
          f.n++;
          this.w = aiOpenCall(this, fn, f, args);
        } catch (e) {
          aiFail('call enter', e);
        }
      },
      onLeave(retval) {
        const w = this.w;
        if (w === undefined) return;
        try {
          aiCloseCall(w, retval);
        } catch (e) {
          aiFail('call leave', e);
        }
      },
    });
  } catch (e) {
    aiAttachErrors.push('call: ' + e);
  }

  // the functor: its vtable's identity by RTTI, its seven slots read, slot 01 hooked at the address it holds
  const aiFunctor = { id: AI_IDS.functorVtable, rva: aiHex(aiOff.functorVtable), addr: aiFunctorVt.toString(), rtti: aiRtti(aiFunctorVt), slots: [] };
  aiFunctor.rttiAgrees = aiFunctor.rtti.typeDescriptor === aiHex(aiOff.functorRtti) && aiFunctor.rtti.signature === 1 && aiFunctor.rtti.offset === '0x0';
  for (let i = 0; i < AI_DF_SLOTS.length; i++) {
    const fp = aiP(aiFunctorVt, i * 8);
    const b = aiBytes(fp, 8);
    aiFunctor.slots.push({ slot: i, name: AI_DF_SLOTS[i], rva: aiRva(fp), where: aiWhere(fp), bytes: b, guess: aiGuessBody(b) });
  }
  const aiOperator = aiP(aiFunctorVt, 8);
  aiFunctor.operatorRva = aiRva(aiOperator);
  aiFunctor.operatorAgreesWithStaticRead = aiFunctor.operatorRva === aiHex(aiOff.staticOperator);
  aiFunctor.operatorBytes = aiBytes(aiOperator, 8);
  if (!aiInExe(aiOperator)) {
    aiAttachErrors.push('functor: slot 01 holds ' + aiWhere(aiOperator) + ', outside SkyrimSE.exe; not hooked');
  } else {
    try {
      Interceptor.attach(aiOperator, {
        onEnter(args) {
          this.w = undefined;
          aiC.functorAll++;
          aiC.functorAllWin++;
          try {
            const self = args[0];
            const vt = aiP(self, 0);
            if (!vt.equals(aiFunctorVt)) {
              aiC.functorForeign++;
              const k = aiWhereOnce(vt);
              aiForeignVtables.set(k, (aiForeignVtables.get(k) || 0) + 1);
              return;
            }
            this.w = aiOpenFunctor(this, self, args[1]); // args[1] is RDX: the return buffer by MSVC's member convention (HYPOTHESIS)
          } catch (e) {
            aiFail('functor enter', e);
          }
        },
        onLeave(retval) {
          const w = this.w;
          if (w === undefined) return;
          try {
            aiCloseFunctor(w, retval);
          } catch (e) {
            aiFail('functor leave', e);
          }
        },
      });
    } catch (e) {
      aiAttachErrors.push('functor: ' + e);
    }
  }

  // the VM's container sink: SkyrimVM** (SkyrimVM.cpp:8-9), the subobject at +0x48 (SkyrimVM.h:95), slot 01 (BSTEvent.h:146)
  const aiVmSink = { singletonId: AI_IDS.vmSingleton, singletonRva: aiHex(aiOff.vmSingleton), attached: false, tries: 0 };
  const aiAttachVmSink = function () {
    aiVmSink.tries++;
    const vm = aiP(aiAt('vmSingleton'), 0);
    if (vm.isNull()) {
      if (aiVmSink.tries < 15) setTimeout(aiAttachVmSink, 2000);
      else aiEmit({ event: 'vmSink', attached: false, error: 'SkyrimVM singleton null after ' + aiVmSink.tries + ' reads' });
      return;
    }
    const sinkObj = vm.add(AI_VM_CONTAINER_SINK);
    const vt = aiP(sinkObj, 0);
    const pe = aiP(vt, 8);
    aiVmSink.vm = vm.toString();
    aiVmSink.sink = sinkObj.toString();
    aiVmSink.vtable = aiWhere(vt);
    aiVmSink.rtti = vt.isNull() ? null : aiRtti(vt);
    aiVmSink.rttiAgrees = aiVmSink.rtti !== null && aiVmSink.rtti.typeDescriptor === aiHex(aiOff.vmRtti) && aiVmSink.rtti.offset === aiHex(AI_VM_CONTAINER_SINK);
    aiVmSink.processEvent = aiWhere(pe);
    aiVmSink.bytes = aiBytes(pe, 8);
    if (!aiInExe(pe)) {
      aiVmSink.error = 'slot 01 outside SkyrimSE.exe; not hooked';
    } else {
      try {
        Interceptor.attach(pe, {
          onEnter(args) {
            aiC.vmEvents++;
            aiC.vmEventsWin++;
            try {
              const own = args[0].equals(sinkObj);
              if (!aiPlatform.scanned && own) aiScanSinks(args[2]); // memory reads; the attach itself waits for setTimeout
              if (!own) { aiC.vmForeignThis++; return; } // SendEvent passes the registered sink (BSTEvent.h:106): no container event
              aiOnEvent('vm', this, args, own);
            } catch (e) {
              aiFail('vm sink', e);
            }
          },
        });
        aiVmSink.attached = true;
      } catch (e) {
        aiVmSink.error = String(e);
      }
    }
    if (aiVmSink.tries > 1) aiEmit({ event: 'vmSink', sink: aiVmSink });
  };
  aiAttachVmSink();
  if (aiVmSink.error) aiAttachErrors.push('vm sink: ' + aiVmSink.error);

  aiEmit({
    event: 'ready', script: 'additem-functor.js', v: 1, version: aiVersion, pid: Process.id, base: aiExe.base.toString(), size: aiExe.size,
    hooks: { call: aiHooks.call, functor: aiFunctor, vmSink: aiVmSink },
    reads: {
      mainSingleton: { id: AI_IDS.mainSingleton, rva: aiHex(aiOff.mainSingleton) }, scriptFunctionVtable: { id: AI_IDS.scriptFunctionVtable, rva: aiHex(aiOff.scriptFunctionVtable) },
      functorRtti: { id: AI_IDS.functorRtti, rva: aiHex(aiOff.functorRtti) }, vmRtti: { id: AI_IDS.vmRtti, rva: aiHex(aiOff.vmRtti) },
      staticRead: { operator: { id: AI_IDS.staticOperator, rva: aiHex(aiOff.staticOperator) }, addItemStub: { id: AI_IDS.staticAddItemStub, rva: aiHex(aiOff.staticAddItemStub) }, queuePostRender: { id: AI_IDS.staticQueuePostRender, rva: aiHex(aiOff.staticQueuePostRender) } },
    },
    params: { TTL: AI_TTL_S, ROWS: AI_ROWS, EVENT_ROWS: AI_EVENT_ROWS, BT: AI_BT, RAW: aiHex(AI_RAW), PLAYER: aiId(AI_PLAYER) },
    clock: aiQpcFn === null || aiQpcFreq <= 0 ? 'Date.now' : 'QueryPerformanceCounter ' + aiQpcFreq + ' Hz', mainThread: aiMain, attachErrors: aiAttachErrors,
    note: 'read pid against the run c1-skyrim-platform-pid<N>.log first; bytes are each site before the attach (e9 at call is the platform seam hook); the platform sink attaches ' + AI_PLATFORM_ATTACH_MS + ' ms after the VM sink first event',
  });

  const aiSummary = function (event) {
    const now = Date.now(), dt = Math.max((now - aiLastSummary) / 1000, 0.001);
    aiLastSummary = now;
    aiMain = aiMainThread();
    const matched = [];
    aiFns.forEach(function (f) { if (f.kind !== null) matched.push({ at: f.at, cls: f.cls, name: f.name, kind: f.kind, n: f.n, latent: f.latent, stubRva: f.stubRva }); });
    const pending = [];
    const nowUs = aiNowUs(Process.getCurrentThreadId());
    aiPending.forEach(function (w, id) { pending.push({ stack: id, seq: w.seq, item: w.itemLow === null ? null : aiId(w.itemLow), ageMs: w.usLeave !== undefined ? Math.round((nowUs - w.usLeave) / 1000) : null }); });
    const open = [];
    aiWindows.forEach(function (a, t) { for (const w of a) open.push({ tid: t, kind: w.kind, seq: w.seq, stack: w.stackId }); });
    const foreign = [];
    aiForeignVtables.forEach(function (n, k) { foreign.push([k, n]); });
    const row = {
      event: event, n: ++aiC.summaries, uptimeS: Math.round((now - aiT0) / 1000), intervalS: +dt.toFixed(1), mainThread: aiMain,
      call: { total: aiC.calls, interval: aiC.callsWin, perS: +(aiC.callsWin / dt).toFixed(1), addItem: aiC.addItemCalls, activate: aiC.activateCalls, noStack: aiC.noStack },
      functor: {
        all: aiC.functorAll, interval: aiC.functorAllWin, own: aiC.functorOwn, foreign: aiC.functorForeign, foreignVtables: foreign.slice(0, 8),
        matched: aiC.functorMatched, rerun: aiC.functorRerun, unmatched: aiC.functorUnmatched, empty: aiC.functorEmpty, withEvents: aiC.functorWithEvents, sretYes: aiC.sretYes, sretNo: aiC.sretNo,
      },
      events: {
        vm: aiC.vmEvents, vmInterval: aiC.vmEventsWin, vmForeignThis: aiC.vmForeignThis, platform: aiC.platformEvents, platformInterval: aiC.platformEventsWin,
        platformForeignThis: aiC.platformForeignThis, player: aiC.playerEvents, inFunctor: aiC.inFunctor, inCall: aiC.inCall, outside: aiC.outside, paired: aiC.paired,
        listItself: aiC.listItself,
      },
      platformSink: { scanned: aiPlatform.scanned, target: aiPlatform.target === null ? null : aiWhere(aiPlatform.target), attached: aiPlatform.attached, error: aiPlatform.error },
      natives: aiFns.size, matched: matched, pending: pending.slice(0, 32), open: open,
      rows: { addItem: aiC.addItemRows, functor: aiC.functorRows, functorCapped: aiC.functorRowsCapped, event: aiC.eventRows, eventCapped: aiC.eventRowsCapped },
      pulse: aiC.pulse, failures: aiFailures, lines: aiLinesNew,
    };
    if (event === 'final') row.allLines = aiLines;
    aiEmit(row);
    aiLinesNew = [];
    aiC.callsWin = 0;
    aiC.functorAllWin = 0;
    aiC.vmEventsWin = 0;
    aiC.platformEventsWin = 0;
  };
  const aiTimer = setInterval(function () { aiSummary('summary'); }, AI_SUMMARY_MS);
  setTimeout(function () {
    clearInterval(aiTimer);
    aiSummary('final');
    try {
      Interceptor.detachAll();
      aiEmit({ event: 'detached', ttl: AI_TTL_S });
    } catch (e) {
      aiEmit({ event: 'error', where: 'detachAll', error: String(e) });
    }
  }, AI_TTL_S * 1000);
}
