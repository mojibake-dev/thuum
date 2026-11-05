// native-frame.js v1 (thuum-cf, 2026-11-05): the Dynamic read that opens rung 2 of the scripting ladder (docs/research/
// scripts-one-system-2026-11-05.md 6.2, 6.9 and 6.11 items 3, 9, 11 and 17; ADR-068 decision 2, the one seam). What the VM's one
// native dispatch, BSScript::NF_util::NativeFunctionBase::Call, holds at its entry for a script's OWN native call, read on the HOST
// of Bleak Falls Temple (cell 0x371de) while it turns the first puzzle pillar (ACTI 0xaa8cb, defaultPuzzlePillarScript) three times
// (lab/.cache/probes/x-native-frame.yaml v1). Attach only: no Interceptor.replace, and no listener calls an engine function (Frida's
// listener guard, say-verdict.js's header: a hooked function called from inside a listener is bypassed on that thread), so the
// engine's own accessor Stack::GetStackFrameVariable is HOOKED, never called, and its answers are compared with the frame read.
// What it settles, one observation each:
// - H-S1: at Call's entry the Stack's top frame is the native's own (owningFunction == this) with self and the typed argument
//   Variables in place, for a script's own call (the caller inside SkyrimSE.exe, the previous frame a ScriptFunction), not only for
//   the platform's hand-built frames (fork canon 7c79fc3e CallNative.cpp:331-334 and :466-473 write top's function, type, self, size
//   and args before SkyrimPlatform.cpp:388's fPtr->Call, so those rows return into SkyrimPlatformImpl.dll).
// - H-S3 and item 9: owningFunction and owningObjectType are the native's own (`frame own`, `typeOwn`), the CALLING script is the
//   previous frame's owningObjectType and owningFunction (`from`), and the arguments read at +0x40 plus 16 times i agree with what
//   104484 answered for the same frame and index while MarshallAndDispatch unpacked them inside the same Call (`args agree`; `same
//   slot` when the answer's address is the one read).
// - H-W1 (item 17, the whale): whether a Call row exists for PlayAnimationAndWait("Trigger02", "Turned02") on 0xaa8cb on the host,
//   where no engine-level animation hook (38048, 14297) reported Trigger02 in playtests 45 and 46 (docs/verbs/traps.md "The dropped
//   Trigger02"); `refNatives` in each summary names every native whose subject was REF, so a whale turn that calls something else
//   says what.
// - H-F1 (item 3): the result's shape per row: the Stack's returnValue (TypeInfo and value) before and after the Call, the Call's
//   CallResult and the native's declared return type.
// - Item 11: the whole-game rate at 104651: every native counted by Class.Name and per thread, calls per second and the top 20 in a
//   summary every 10 s; and 104484's own rate.
//
// Address Library 1.6.1170 ids, every offset by `just addr <id>` (lab/addr.py over addrlib/, runtime 1.6.1170.0, 428461 entries)
// run from the thuum checkout on 2026-11-05; (h) hooked, (r) read only. The first bytes are Ghidra's read of
// /SkyrimSE-1.6.1170.0.exe.unpacked.exe (image base 0x140000000), printed again from the live process by the ready row BEFORE any
// attach (e9 there means another hook patched the site first, the flip's own Gum hook on 104651 for one):
//   104651  0x143dc00  (h) NativeFunctionBase::Call, CommonLib Offsets.h:130 RELOCATION_ID(97923, 104651); IFunction slot 0x0F
//                          (NativeFunctionBase.h:47, IFunction.h:61); bytes 4c 89 44 24 18 55 56 57
//   104484  0x1432850  (h) Stack::GetStackFrameVariable, CommonLib Stack.cpp:31 RELOCATION_ID(97746, 104484) (Stack.h:67); SKSE's
//                          VMArgList::Get at the same RVA (lab/.cache/skse64_2_02_06 PapyrusArgs.h:23); bytes 40 53 48 83 ec 30 44 89
//   403449  0x31872c0  (r) Main's singleton, a Main* static, CommonLib Offsets.h:383 (Main.cpp:8-12); threadID at +0x28 (Main.h:87)
//   252888  0x1aa5ad0  (r) VTABLE_BSScript__Internal__ScriptFunction, CommonLib Offsets_VTABLE.h:7082 (the AE id of its VariantID)
//    56205  0xa2e8c0   (r) ObjectReference.PlayAnimation's callback (docs/research/adr062/papyrus-native-entries.md:69; HYPOTHESIS)
//    56206  0xa2e940   (r) ObjectReference.PlayAnimationAndWait's callback (the same table :70; HYPOTHESIS)
// Named in the static read below, not hooked: 104851 0x144ded0, 105216 0x14694b0, 105217 0x14698e0 (`just addr`, the same day).
//
// Layouts: CommonLibSSE-NG b93280e8 headers (file:line), the fork's port patches under skymp/overlay_ports/commonlibsse-ng-flatrim:
//   Call(this, const BSTSmartPointer<Stack>&, ErrorLogger*, VirtualMachine*, bool) (NativeFunctionBase.h:47): args[0] the IFunction,
//     args[1] a pointer to the smart pointer whose one member is the Stack* (BSTSmartPointer.h:229), args[4] the bool; the Win64
//     convention's argument positions, as the flip's own hook reads them (fork m4-scripts-flip ScriptNatives.cpp:420-429)
//   NativeFunctionBase (NativeFunctionBase.h:62-72, sizeof 0x50 :74; SKSE PapyrusNativeFunctions.h:132-139 agrees): _name +0x10,
//     _objName (the class) +0x18, _stateName +0x20, _retType +0x28 (a TypeInfo), _descTable +0x30, _isStatic +0x40 (SKSE's unk40),
//     _isCallableFromTasklet +0x41, _isLatent +0x42, _userFlags +0x44; the VDescTable (VDescTable.h:24-26): entries +0x00 (a
//     SimpleArray, its one member the element pointer, MemoryManager.h:368), paramCount u16 +0x08, totalEntries u16 +0x0A (equal
//     for a native, NativeFunctionBase.cpp:12; GetParam reads paramCount :48-58, GetParamCount answers totalEntries :43-46); an entry
//     is a BSTTuple<BSFixedString, TypeInfo> of 0x10 (BSTTuple.h:172-173; SKSE PapyrusNativeFunctions.h:78-82: name +0, type +8);
//     at most 11 parameters (NativeFunctionBase.cpp:15); a vanilla native's callback pointer at +0x50 (the registrar's obj[10],
//     papyrus-native-entries.md:28-33, and the fork's Hooks.cpp:481 on canon; HYPOTHESIS: CommonLib's own template keeps a
//     std::function there, NativeFunction.h:116, so a plugin native's +0x50 is no function)
//   Stack (Stack.h:70-84, sizeof 0xA0 :89): frames +0x58, top +0x60, state +0x68 (the enum :27-38), freezeState +0x6C,
//     returnValue +0x70 (a Variable), stackID +0x80 (VMStackID u32, BSCoreTypes.h:8), stackType +0x84, owningTasklet +0x88,
//     callback +0x90
//   StackFrame (StackFrame.h:21-31): parent +0x00, previousFrame +0x08, owningFunction +0x10, owningObjectType +0x18,
//     instructionPointer +0x20, self +0x28 (a Variable), size +0x38, instructionsValid +0x3C; the arguments from +0x40 in 0x10 steps
//     (patch 03-stackframe-uncomment_top_args.patch turns StackFrame.h:33's comment into `Variable args[0]; // 40`); size is the
//     argument count where the platform builds the frame (CallNative.cpp:334; SKSE's VMState numArgs +0x38,
//     PapyrusNativeFunctions.h:27), HYPOTHESIS for the VM's own frames
//   Variable (Variable.h:93-94, sizeof 0x10 :96): varType +0x00 (a TypeInfo, one size_t: TypeInfo.h:68), value +0x08 (the union of
//     :17-31: i32, u32, float, bool, an Array* or Object* smart pointer, a BSFixedString); raw types (TypeInfo.h:14-26) none 0,
//     object 1, string 2, int 3, float 4, bool 5, the arrays 10 to 15; a raw value of 16 or more is an ObjectTypeInfo* with bit 0 set
//     for an object array (TypeInfo.cpp:91-99, :149-152; the class read as raw & ~1, never GetTypeInfo's ~0xB mask, the memory note
//     commonlib-typeinfo-array-mask); two Variables compare by the folded type, then 32 bits for an int or float, a byte for a bool,
//     the pointer for a string's pool entry, an object or an array (Variable.cpp:71-103)
//   BSFixedString (BSFixedString.h:232): one pointer, _data, which IS the characters (data() :116-121 takes the pool entry's
//     this + 1, BSStringPool.h:72-76, and _data points just past the 0x18-byte entry, :96); null reads as the empty string
//   ObjectTypeInfo (ObjectTypeInfo.h:177): name +0x08
//   Object (Object.h:39-46): the flag word +0x00 (constructed bit 0, initialized bit 1, valid bit 2, remainingPropsToInit above),
//     type +0x08, currentState +0x10 (a BSFixedString), lockStructure +0x18 ("first bit used as flag"; HYPOTHESIS: the Stack holding
//     the object's lock, its stackID at +0x80, docs/research/adr065-papyrus-state-2026-11-03.md Q1), handle +0x20 (VMHandle u64,
//     BSCoreTypes.h:7), read without its lock (+0x28)
//   VMHandle (adr065-papyrus-state Q1, HYPOTHESIS from four decompiles): bits 48 to 63 a kind, 32 to 47 a middle word, 0 to 31 a form
//     id; a plain form is kind 0 with mid 0xFFFF, so a reference's form id is the low 32 bits
//   ScriptFunction (ScriptFunction.h:45-47): name +0x10, objName +0x18, stateName +0x20, the offsets a native's members have, so the
//     previous frame's function reads one way for both kinds; the vtable compare with 252888 says which
//   Array (Array.h:73-77): _elementType +0x08, _size +0x10, _data +0x20
//
// The static read this trace tests (pyghidra-mcp on sky-re, 2026-11-05; HYPOTHESIS by rule 2). Call at 0x143dc00 reads top (+0x60),
// copies top->self (+0x28) into a local Variable, asks HasStub (slot 0x15, NativeFunctionBase.h:55), reads stackID (+0x80); a
// non-latent native (+0x42 zero) calls MarshallAndDispatch (slot 0x16, :56) with (self, vm, stackID, a local result, top), copies
// the result into the Stack's returnValue (+0x70) on success and returns 0 (kCompleted, IFunction.h:36), else 4; a latent one calls
// 104851 (vm, stackID) first (HYPOTHESIS: the latent wait's registration), then MarshallAndDispatch, and returns 2 (kInProgress)
// either way: unless the result is a bool true (raw 5, nonzero) it logs "Latent function %s did not successfully start - aborting
// call" and hands the VM (its vtable +0x158) a none for the stack first; a null stack or binding returns 4 (kFailedAbort). So
// for a latent row the returnValue at the leave is NOT the native's result: H-F1's latent half is the result bool that judges the
// start, and the value comes later through the VM's latent return. 104484 is called by every native's templated
// MarshallAndDispatch (one per signature, the call sites 0x9b54fb to
// 0xa4db7c; CommonLib's NativeFunction.h:39-43 and :91-92 and SKSE's PapyrusNativeFunctionDef_Base.inl:248-262 read argument i as
// index i after one page lookup) AND by the interpreter's operand fetch for a local variable (operand kind 6 in 105216 and 105217)
// and the function the project names InsertLocals (the call at 0x14794c7; ScriptFunction.h:36, a native's is empty,
// NativeFunctionBase.cpp:101-104): it runs for every local operand of every Papyrus instruction. Its listener is therefore a
// CModule (frida.re/docs/javascript-api, CModule: C callbacks that reach JavaScript only through shared memory): a load and a
// compare for a thread with no open window, an entry written for one that has. The JavaScript fallback (GETVAR auto when the
// CModule does not compile, or js) detaches itself past GETVAR_CAP calls in one 10 s interval, so it never sits on the VM for long.
//
// Rows, one JSON line each through console.log (lab-api's preamble flushes them to the trace's .log every 250 ms):
//   {event: 'ready'} once: version, pid (read it against the run's c1-skyrim-platform-pid<N>.log before any row, the memory note
//     lab-frida-wrong-process), base, each hooked address with its id, rva and first bytes, the read ids, getVar's mode and the
//     CModule's error if any, params, Main's thread, attach errors.
//   {event: 'call'} per full row, at Call's leave: the native's members, the caller (`vm` for a return into SkyrimSE.exe, else the
//     module), the Stack at the entry and the leave, the top frame, self, the subject, the args, `from`, the leave (CallResult, the
//     Stack's state, top unchanged, returnValue and whether it changed), the 104484 answers with per-argument sameSlot and
//     sameValue, and a `line`: "call <Class.Name> on <form> args <a0> <a1> from <Type.Function> state <self's currentState> frame own
//     <yes|no> args agree <yes|no|partial|unread|none> same slot <...> ret <n> <CallResult> caller <vm|module> thread <tid>
//     <main|worker>". Full rows: class ObjectReference or Debug and name PlayAnimation, PlayAnimationAndWait or SendAnimationEvent
//     (compared lower case: the VM's string pool keeps the first spelling it saw), subject REF (the self's form, else arg0's for a
//     static native), or any subject under ALL; the first ROWS print, the rest are tallied.
//   {event: 'summary'} every 10 s, cumulative and per interval: calls and per second, threads (calls per second each, Main's
//     marked), the top 20 natives in the interval ([key, interval, perS, total, calls returning outside the exe]) and in total
//     (topTotal: [key, total, outside]),
//     refNatives (every native whose subject was REF), animSubjects (the three natives per subject), the callers outside
//     SkyrimSE.exe by module (a CommonLib native's own thunk, NativeFunctionBase.cpp:106-112, calls 104651 from its plugin, so a
//     TESModPlatform native counts there too; a vanilla native counted there is a plugin's direct call), getVar's calls and per
//     second, the pulse (kernel32!Sleep, the Interceptor's own liveness), the rows' tally by agreement and the lines new since the
//     last summary, open windows with their age.
//   {event: 'getVarDetached'} if the JavaScript fallback passed its cap; {event: 'error'} for a listener's exception (the first
//     five per site, the summary's `failures` counts all; a Call window whose leave threw is closed and its slot disarmed);
//     {event: 'final'} at TTL with every line, then 'detached'.
// Expected on the host's three turns (x-native-frame v1's order, aa8cb from its initial face 1): three rows "call
// ObjectReference.PlayAnimationAndWait on aa8cb args Trigger0N Turned0N from defaultPuzzlePillarScript.<function> ... frame own yes
// args agree yes ... ret 2 kInProgress caller vm" for N 1, 2, 3 in that order; the platform's own Papyrus activate of each turn in
// refNatives as ObjectReference.Activate on aa8cb (a direct call, outside the exe); the pillars' load-time natives on rows or in
// refNatives from the cell's load (the trace is armed before c1 enters the Temple). Falsifiers: frame own no (Call's top is not the
// native's frame: 6.2's premise fails); args agree no, or same slot no (the +0x40 arithmetic is wrong where a frame spans pages:
// item 9's reason to read through 104484); Trigger01 and Trigger03 rows with no Trigger02 row while the server logs three
// activations (H-W1's other branch: the script's own whale branch; refNatives names what it called); no row at all beside the
// server's three activation lines (the wrong process first: the ready row's pid; then a dispatch other than 104651 for this native).
// LAB_PARAMS (lab-api's frida step prepends globalThis.LAB_PARAMS; `just frida native-frame.js c1` carries none, so the defaults
// run): REF the subject's form id (a number, "0xaa8cb" or "aa8cb"; default 0xaa8cb); TTL seconds until the final row and the detach
// (default 600); ALL full rows for every subject's animation natives (default false); GETVAR auto, cmodule, js or off (default
// auto); GETVAR_CAP the JavaScript fallback's calls per 10 s before it detaches (default 20000); ROWS full rows printed (default
// 200). Run from a scenario on the host before it enters the cell, `- c1: frida {script: native-frame.js, params: {REF: 0xaa8cb}}`
// with a `wait: 15` after it (the pitfalls note: lab-api's 5 s sleep, the attach, the CModule's compile). 1.6.1170 only.
'use strict';
const PARAMS = (typeof LAB_PARAMS === 'object' && LAB_PARAMS) ? LAB_PARAMS : {};
function nfParseForm(v, dflt) {
  if (typeof v === 'number' && Number.isFinite(v) && v > 0) return v >>> 0;
  if (typeof v === 'string') {
    const s = v.trim();
    if (/^0x[0-9a-f]+$/i.test(s)) return parseInt(s.slice(2), 16) >>> 0;
    if (/^[0-9a-f]+$/i.test(s)) return parseInt(s, 16) >>> 0;
  }
  return dflt;
}
function nfFlag(v) { return v === true || v === 'true' || v === 1 || v === '1'; }
function nfPositive(v, dflt) { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : dflt; } // Number("10m") is NaN: the default
const NF_REF = nfParseForm(PARAMS.REF, 0xaa8cb);
const NF_TTL_S = nfPositive(PARAMS.TTL, 600);
const NF_ALL = nfFlag(PARAMS.ALL);
const NF_GETVAR = ['auto', 'cmodule', 'js', 'off'].indexOf(String(PARAMS.GETVAR)) >= 0 ? String(PARAMS.GETVAR) : 'auto';
const NF_GETVAR_CAP = Math.floor(nfPositive(PARAMS.GETVAR_CAP, 20000));
const NF_ROWS = Math.floor(nfPositive(PARAMS.ROWS, 200));
const NF_SUMMARY_MS = 10000;
function nfEmit(obj) {
  obj.t = Date.now();
  try { send(obj); } catch (e) { /* lab-api's preamble makes send a no-op */ }
  console.log(JSON.stringify(obj));
}

// `just addr <id>` on Address Library 1.6.1170, 2026-11-05 (never from memory, CLAUDE.md rule 1)
const OFFSETS = {
  '1.6.1170.0': {
    call: 0x143dc00, // 104651 NativeFunctionBase::Call (h)
    getVar: 0x1432850, // 104484 Stack::GetStackFrameVariable (h)
    mainSingleton: 0x31872c0, // 403449 Main's singleton, a Main* static (r)
    scriptFunctionVtable: 0x1aa5ad0, // 252888 VTABLE_BSScript__Internal__ScriptFunction (r)
    playAnimationStub: 0xa2e8c0, // 56205 ObjectReference.PlayAnimation's callback (r)
    playAnimationAndWaitStub: 0xa2e940, // 56206 ObjectReference.PlayAnimationAndWait's callback (r)
  },
};
const NF_IDS = { call: 104651, getVar: 104484, mainSingleton: 403449, scriptFunctionVtable: 252888, playAnimationStub: 56205, playAnimationAndWaitStub: 56206 };
const NF_GHIDRA_BYTES = { call: '4c89442418555657', getVar: '40534883ec304489' };

// NativeFunctionBase.h:62-72 (the members), VDescTable.h:24-26 (at +0x30), BSTTuple.h:172-173 (an entry)
const NF_FN_NAME = 0x10, NF_FN_CLASS = 0x18, NF_FN_STATE = 0x20, NF_FN_RET_TYPE = 0x28, NF_FN_DESC = 0x30;
const NF_FN_IS_STATIC = 0x40, NF_FN_TASKLET = 0x41, NF_FN_IS_LATENT = 0x42, NF_FN_USER_FLAGS = 0x44, NF_FN_STUB = 0x50;
const NF_DESC_ENTRIES = 0x00, NF_DESC_PARAM_COUNT = 0x08, NF_DESC_TOTAL = 0x0a, NF_DESC_ENTRY_SIZE = 0x10, NF_DESC_ENTRY_TYPE = 0x08;
const NF_MAX_ARGS = 11; // NativeFunctionBase.cpp:15
// ScriptFunction.h:45-47 (the previous frame's function when it is a script's)
const NF_SF_NAME = 0x10, NF_SF_CLASS = 0x18, NF_SF_STATE = 0x20;
// Stack.h:74-83
const NF_STACK_FRAMES = 0x58, NF_STACK_TOP = 0x60, NF_STACK_STATE = 0x68, NF_STACK_FREEZE = 0x6c, NF_STACK_RETURN = 0x70;
const NF_STACK_ID = 0x80, NF_STACK_TYPE = 0x84, NF_STACK_TASKLET = 0x88, NF_STACK_CALLBACK = 0x90;
// StackFrame.h:21-29, the arguments by the fork's patch 03
const NF_FRAME_PARENT = 0x00, NF_FRAME_PREVIOUS = 0x08, NF_FRAME_FUNCTION = 0x10, NF_FRAME_TYPE = 0x18, NF_FRAME_IP = 0x20;
const NF_FRAME_SELF = 0x28, NF_FRAME_SIZE = 0x38, NF_FRAME_VALID = 0x3c, NF_FRAME_ARGS = 0x40;
// Variable.h:93-96
const NF_VAR_TYPE = 0x00, NF_VAR_VALUE = 0x08, NF_VAR_SIZE = 0x10;
// ObjectTypeInfo.h:177; Object.h:39-46; Array.h:73-77; Main.h:87
const NF_TYPE_NAME = 0x08;
const NF_OBJ_FLAGS = 0x00, NF_OBJ_TYPE = 0x08, NF_OBJ_STATE = 0x10, NF_OBJ_LOCK = 0x18, NF_OBJ_HANDLE = 0x20;
const NF_ARRAY_ELEMENT = 0x08, NF_ARRAY_SIZE = 0x10, NF_ARRAY_DATA = 0x20;
const NF_MAIN_THREAD_ID = 0x28;
const NF_RAW_NAMES = { 0: 'none', 1: 'object', 2: 'string', 3: 'int', 4: 'float', 5: 'bool', 10: 'none[]', 11: 'object[]', 12: 'string[]', 13: 'int[]', 14: 'float[]', 15: 'bool[]' }; // TypeInfo.h:14-26
const NF_CALL_RESULTS = ['kCompleted', 'kSetupForVM', 'kInProgress', 'kFailedRetry', 'kFailedAbort']; // IFunction.h:36-40
const NF_STACK_STATES = ['kRunning', 'kFinished', 'kWaitingOnMemory', 'kWaitingOnLatentFunction', 'kWaitingOnOtherStackForCall', 'kWaitingOnOtherStackForReturn', 'kWaitingOnOtherStackForReturnNoPop', 'kRetryReturnNoPop', 'kRetryCall']; // Stack.h:29-37
const NF_ANIM_CLASSES = ['objectreference', 'debug'];
const NF_ANIM_NAMES = ['playanimation', 'playanimationandwait', 'sendanimationevent'];
const NF_P16 = ptr(16); // kArraysEnd and past it a class pointer (TypeInfo.h:28-31)
const NF_NOT_BIT0 = ptr('0xfffffffffffffffe'); // raw & ~1: an object array's class (the TypeInfo mask note)
const NF_LOW32 = ptr('0xffffffff');

// The shared memory of the 104484 CModule: NfShared below, laid out by hand on both sides (x64 natural alignment)
const NF_SLOTS = 8, NF_ENTRIES = 32;
const NF_SH_OPEN = 0x00, NF_SH_CALLS = 0x40, NF_SH_IN_WINDOW = 0x48, NF_SH_PULSE = 0x50, NF_SH_SLOTS = 0x80;
const NF_SLOT_TID = 0x00, NF_SLOT_ARMED = 0x04, NF_SLOT_N = 0x08, NF_SLOT_DROPPED = 0x0c, NF_SLOT_ENTRIES = 0x10;
const NF_E_FRAME = 0x00, NF_E_RET = 0x08, NF_E_TYPE = 0x10, NF_E_VALUE = 0x18, NF_E_INDEX = 0x20, NF_E_PAGE = 0x24, NF_E_SIZE = 0x28;
const NF_SLOT_SIZE = NF_SLOT_ENTRIES + NF_ENTRIES * NF_E_SIZE; // 0x510
const NF_SHARED_SIZE = NF_SH_SLOTS + NF_SLOTS * NF_SLOT_SIZE; // 0x2900
const NF_C_SOURCE = `
#include <gum/guminterceptor.h>

#define NF_SLOTS 8
#define NF_ENTRIES 32

typedef struct _NfEntry NfEntry;
typedef struct _NfSlot NfSlot;
typedef struct _NfShared NfShared;
typedef struct _NfCall NfCall;

struct _NfEntry
{
  guint64 frame;   /* 0x00 the StackFrame asked for (rdx) */
  guint64 ret;     /* 0x08 the Variable answered (rax) */
  guint64 type;    /* 0x10 its varType at the answer */
  guint64 value;   /* 0x18 its value word at the answer */
  guint32 index;   /* 0x20 r8d */
  guint32 page;    /* 0x24 r9d */
};

struct _NfSlot
{
  guint32 tid;     /* 0x00 the thread whose Call window is open */
  guint32 armed;   /* 0x04 */
  guint32 n;       /* 0x08 entries written */
  guint32 dropped; /* 0x0c calls past NF_ENTRIES */
  NfEntry e[NF_ENTRIES]; /* 0x10 */
};

struct _NfShared
{
  guint32 open;          /* 0x00 armed slots */
  guint32 pad0[15];
  guint64 calls;         /* 0x40 every call, unsynchronized (a rate, not a count) */
  guint64 in_window;     /* 0x48 */
  guint64 pulse;         /* 0x50 kernel32!Sleep */
  guint64 pad1[5];
  NfSlot s[NF_SLOTS];    /* 0x80 */
};

struct _NfCall
{
  volatile NfEntry * entry;
};

extern volatile NfShared nf_shared;

void
onEnter (GumInvocationContext * ic)
{
  NfCall * call = GUM_IC_GET_INVOCATION_DATA (ic, NfCall);
  guint32 tid, i;

  call->entry = NULL;
  nf_shared.calls++;
  if (nf_shared.open == 0)
    return;
  tid = (guint32) gum_invocation_context_get_thread_id (ic);
  for (i = 0; i != NF_SLOTS; i++)
  {
    volatile NfSlot * slot = &nf_shared.s[i];
    volatile NfEntry * e;
    guint32 n;

    if (slot->armed == 0 || slot->tid != tid)
      continue;
    n = slot->n;
    if (n >= NF_ENTRIES)
    {
      slot->dropped++;
      return;
    }
    e = &slot->e[n];
    e->frame = (guint64) (gsize) gum_invocation_context_get_nth_argument (ic, 1);
    e->index = (guint32) (gsize) gum_invocation_context_get_nth_argument (ic, 2);
    e->page = (guint32) (gsize) gum_invocation_context_get_nth_argument (ic, 3);
    e->ret = 0;
    e->type = 0;
    e->value = 0;
    slot->n = n + 1;
    nf_shared.in_window++;
    call->entry = e;
    return;
  }
}

void
onLeave (GumInvocationContext * ic)
{
  NfCall * call = GUM_IC_GET_INVOCATION_DATA (ic, NfCall);
  volatile NfEntry * e = call->entry;
  const guint64 * v;

  if (e == NULL)
    return;
  v = (const guint64 *) gum_invocation_context_get_return_value (ic);
  e->ret = (guint64) (gsize) v;
  if (v != NULL)
  {
    e->type = v[0];
    e->value = v[1];
  }
}

void
nf_pulse (GumInvocationContext * ic)
{
  nf_shared.pulse++;
}
`;

function fileVersion(path) {
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

function nfHex(n) { return '0x' + (n >>> 0).toString(16); }
function nfId(n) { return (n >>> 0).toString(16); } // the platform's log shape ("object animation aa8cb ..."), no 0x
function nfP(p, o) { try { return p.isNull() ? NULL : p.add(o).readPointer(); } catch (e) { return NULL; } }
function nfU8(p, o) { try { return p.add(o).readU8(); } catch (e) { return -1; } }
function nfU16(p, o) { try { return p.add(o).readU16(); } catch (e) { return -1; } }
function nfU32(p, o) { try { return p.add(o).readU32(); } catch (e) { return -1; } }
function nfS32(p, o) { try { return p.add(o).readS32(); } catch (e) { return null; } }
function nfF32(p, o) { try { return +p.add(o).readFloat().toPrecision(7); } catch (e) { return null; } }
function nfFixed(field) { // a BSFixedString field: _data is the characters (BSFixedString.h:232, :116-121); null the empty string
  try {
    const s = field.readPointer();
    return s.isNull() ? '' : s.readCString(160);
  } catch (e) {
    return null;
  }
}
function nfBytes(p) {
  try {
    const a = new Uint8Array(p.readByteArray(8));
    let s = '';
    for (let i = 0; i < a.length; i++) s += ('0' + a[i].toString(16)).slice(-2);
    return s;
  } catch (e) {
    return 'unreadable';
  }
}
function nfWhere(p) {
  if (p.isNull()) return '0x0';
  try {
    const m = Process.findModuleByAddress(p);
    return m === null ? p.toString() : m.name + '+0x' + p.sub(m.base).toString(16);
  } catch (e) {
    return p.toString();
  }
}

const exe = Process.getModuleByName('SkyrimSE.exe');
const version = fileVersion(exe.path);
const off = OFFSETS[version];
if (off === undefined) {
  nfEmit({ event: 'ready', script: 'native-frame.js', error: 'no offsets for this runtime', version: version, pid: Process.id, params: PARAMS });
} else {
  const exeEnd = exe.base.add(exe.size);
  const at = function (name) { return exe.base.add(off[name]); };
  const nfInExe = function (p) { return p.compare(exe.base) >= 0 && p.compare(exeEnd) < 0; };
  const nfMainThread = function () { // Main's singleton (Offsets.h:383, Main.cpp:8-12), threadID at +0x28 (Main.h:87)
    const main = nfP(at('mainSingleton'), 0);
    return main.isNull() ? 0 : nfU32(main, NF_MAIN_THREAD_ID);
  };

  // TypeInfo, Variable and Object reads
  const nfTypeNames = new Map(); // ObjectTypeInfo* -> name (the VM keeps its types for the session)
  const nfTypeInfoName = function (oti) {
    if (oti.isNull()) return null;
    const k = oti.toString();
    let n = nfTypeNames.get(k);
    if (n === undefined) {
      n = nfFixed(oti.add(NF_TYPE_NAME));
      nfTypeNames.set(k, n);
    }
    return n;
  };
  const nfRawKind = function (raw) { // TypeInfo.cpp:91-99, GetUnmangledRawType
    if (raw.compare(NF_P16) < 0) return raw.toUInt32();
    return raw.and(1).isNull() ? 1 : 11;
  };
  const nfTypeName = function (raw) {
    if (raw.compare(NF_P16) < 0) {
      const k = raw.toUInt32();
      return NF_RAW_NAMES[k] !== undefined ? NF_RAW_NAMES[k] : 'raw ' + k;
    }
    const name = nfTypeInfoName(raw.and(NF_NOT_BIT0));
    return raw.and(1).isNull() ? name : name + '[]';
  };
  const nfObject = function (obj, deep) { // Object.h:39-46; the handle's words (HYPOTHESIS encoding)
    if (obj.isNull()) return { none: true };
    const lo = nfU32(obj, NF_OBJ_HANDLE), hi = nfU32(obj, NF_OBJ_HANDLE + 4);
    const r = { at: obj.toString(), type: nfTypeInfoName(nfP(obj, NF_OBJ_TYPE)), form: lo < 0 ? null : nfId(lo), kind: hi < 0 ? null : hi >>> 16, mid: hi < 0 ? null : nfHex(hi & 0xffff) };
    if (deep) {
      const flags = nfU32(obj, NF_OBJ_FLAGS);
      r.state = nfFixed(obj.add(NF_OBJ_STATE));
      r.constructed = flags < 0 ? null : (flags & 1) !== 0;
      r.initialized = flags < 0 ? null : (flags & 2) !== 0;
      r.valid = flags < 0 ? null : (flags & 4) !== 0;
      r.propsToInit = flags < 0 ? null : flags >>> 3;
      const lock = nfP(obj, NF_OBJ_LOCK);
      if (lock.isNull()) {
        r.lock = null;
      } else { // H-R2's read, recorded: the lock holder's Stack (HYPOTHESIS) with the flag bit masked
        const holder = lock.and(NF_NOT_BIT0);
        const st = nfU32(holder, NF_STACK_STATE);
        r.lock = { at: lock.toString(), flag: !lock.and(1).isNull(), stack: nfU32(holder, NF_STACK_ID), state: NF_STACK_STATES[st] || String(st) };
      }
    }
    return r;
  };
  const nfVariable = function (v, depth) { // Variable.h:93-94; depth 1 decodes an object deep and an array's first four elements
    const raw = nfP(v, NF_VAR_TYPE);
    const kind = nfRawKind(raw);
    const val = v.add(NF_VAR_VALUE);
    const r = { at: v.toString(), type: nfTypeName(raw) };
    if (kind === 0 || kind === 10) {
      r.value = null;
    } else if (kind === 2) {
      r.value = nfFixed(val);
    } else if (kind === 3) {
      r.value = nfS32(val, 0);
    } else if (kind === 4) {
      r.value = nfF32(val, 0);
    } else if (kind === 5) {
      const b = nfU8(val, 0);
      r.value = b < 0 ? null : b !== 0;
    } else if (kind === 1) {
      r.value = nfObject(nfP(val, 0), depth > 0);
    } else if (kind >= 11 && kind <= 15) {
      const arr = nfP(val, 0);
      if (arr.isNull()) {
        r.value = { none: true };
      } else {
        const size = nfU32(arr, NF_ARRAY_SIZE);
        r.value = { at: arr.toString(), size: size, element: nfTypeName(nfP(arr, NF_ARRAY_ELEMENT)) };
        if (depth > 0 && size > 0) {
          r.value.first = [];
          for (let i = 0; i < Math.min(size, 4); i++) r.value.first.push(nfVariable(arr.add(NF_ARRAY_DATA + i * NF_VAR_SIZE), 0));
        }
      }
    } else {
      r.value = 'raw ' + kind;
    }
    return r;
  };
  const nfWord = function (d) { // one argument in a row's line
    const v = d.value;
    if (v === null || v === undefined) return 'none';
    if (typeof v === 'string') return v === '' ? 'empty' : v;
    if (typeof v === 'object') {
      if (v.none) return 'none';
      if (v.size !== undefined) return 'array' + v.size;
      return v.form === null ? 'object' : v.form;
    }
    return String(v);
  };
  const nfSameValue = function (typeA, valA, typeB, valB) { // Variable.cpp:71-103's compare on the raw words
    if (!typeA.equals(typeB)) return false;
    const kind = nfRawKind(typeA);
    if (kind === 0 || kind === 10) return true;
    if (kind === 3 || kind === 4) return valA.and(NF_LOW32).equals(valB.and(NF_LOW32));
    if (kind === 5) return valA.and(0xff).equals(valB.and(0xff));
    return valA.equals(valB);
  };
  const nfFormOf = function (v) { // an object Variable's form: its handle's low 32 bits (HYPOTHESIS encoding); else null
    if (nfRawKind(nfP(v, NF_VAR_TYPE)) !== 1) return null;
    const obj = nfP(v, NF_VAR_VALUE);
    if (obj.isNull()) return null;
    const lo = nfU32(obj, NF_OBJ_HANDLE);
    return lo < 0 ? null : lo;
  };
  const nfSubjectOf = function (top) { // the self's form for a member native, arg0's for a static one (self none, an argument there)
    const s = nfFormOf(top.add(NF_FRAME_SELF));
    if (s !== null) return s;
    const size = nfU32(top, NF_FRAME_SIZE);
    return size >= 1 && size <= NF_MAX_ARGS ? nfFormOf(top.add(NF_FRAME_ARGS)) : null;
  };

  // the natives, by IFunction pointer
  const nfFns = new Map();
  const nfFnInfo = function (fn) {
    const name = nfFixed(fn.add(NF_FN_NAME)), cls = nfFixed(fn.add(NF_FN_CLASS));
    const key = (cls === null ? '?' : cls) + '.' + (name === null ? '?' : name);
    const anim = cls !== null && name !== null && NF_ANIM_CLASSES.indexOf(cls.toLowerCase()) >= 0 && NF_ANIM_NAMES.indexOf(name.toLowerCase()) >= 0;
    return { key: key, name: name, cls: cls, anim: anim, n: 0, win: 0, ext: 0, noStack: 0, detail: null };
  };
  const nfFnDetail = function (fn, f) { // a full row's native, read once
    if (f.detail !== null) return f.detail;
    const desc = fn.add(NF_FN_DESC), entries = nfP(desc, NF_DESC_ENTRIES);
    const paramCount = nfU16(desc, NF_DESC_PARAM_COUNT), total = nfU16(desc, NF_DESC_TOTAL);
    const params = [];
    for (let i = 0; i < Math.min(Math.max(paramCount, 0), NF_MAX_ARGS) && !entries.isNull(); i++) {
      const e = entries.add(i * NF_DESC_ENTRY_SIZE);
      params.push({ name: nfFixed(e), type: nfTypeName(nfP(e, NF_DESC_ENTRY_TYPE)) });
    }
    const stub = nfP(fn, NF_FN_STUB);
    let stubId = null;
    if (stub.equals(at('playAnimationStub'))) stubId = NF_IDS.playAnimationStub;
    else if (stub.equals(at('playAnimationAndWaitStub'))) stubId = NF_IDS.playAnimationAndWaitStub;
    f.detail = {
      this: fn.toString(), vtable: nfWhere(nfP(fn, 0)), state: nfFixed(fn.add(NF_FN_STATE)), returns: nfTypeName(nfP(fn, NF_FN_RET_TYPE)),
      isStatic: nfU8(fn, NF_FN_IS_STATIC) > 0, isLatent: nfU8(fn, NF_FN_IS_LATENT) > 0, callableFromTasklet: nfU8(fn, NF_FN_TASKLET) > 0,
      userFlags: nfU32(fn, NF_FN_USER_FLAGS), paramCount: paramCount, totalEntries: total, params: params, stub: nfWhere(stub), stubId: stubId,
    };
    return f.detail;
  };
  const nfStack = function (s) { // Stack.h:74-83
    const st = nfU32(s, NF_STACK_STATE), cb = nfP(s, NF_STACK_CALLBACK);
    return {
      at: s.toString(), id: nfU32(s, NF_STACK_ID), state: st, stateName: NF_STACK_STATES[st] || String(st), freeze: nfU32(s, NF_STACK_FREEZE),
      frames: nfU32(s, NF_STACK_FRAMES), type: nfU32(s, NF_STACK_TYPE), tasklet: !nfP(s, NF_STACK_TASKLET).isNull(),
      callback: cb.isNull() ? null : { at: cb.toString(), vtable: nfWhere(nfP(cb, 0)) },
    };
  };
  const nfCaller = function (prev) { // the previous frame: the calling script's type, function and state (ScriptFunction.h:45-47)
    if (prev.isNull()) return null;
    const fn = nfP(prev, NF_FRAME_FUNCTION), vt = nfP(fn, 0);
    return {
      at: prev.toString(), isScript: !vt.isNull() && vt.equals(at('scriptFunctionVtable')), vtable: nfWhere(vt),
      fn: fn.isNull() ? null : nfFixed(fn.add(NF_SF_NAME)), cls: fn.isNull() ? null : nfFixed(fn.add(NF_SF_CLASS)),
      fnState: fn.isNull() ? null : nfFixed(fn.add(NF_SF_STATE)), type: nfTypeInfoName(nfP(prev, NF_FRAME_TYPE)), ip: nfU32(prev, NF_FRAME_IP),
      self: nfVariable(prev.add(NF_FRAME_SELF), 0),
    };
  };

  // getVar's capture: the CModule (or the JavaScript fallback) and its per-thread slot
  const nfShared = Memory.alloc(NF_SHARED_SIZE); // kept for the script's life: the CModule writes into it
  nfShared.writeByteArray(new ArrayBuffer(NF_SHARED_SIZE));
  let nfCm = null, nfCmError = null, nfMode = 'off', nfGetVarListener = null;
  const attachErrors = [];
  if (NF_GETVAR === 'auto' || NF_GETVAR === 'cmodule') {
    try { nfCm = new CModule(NF_C_SOURCE, { nf_shared: nfShared }); } catch (e) { nfCmError = String(e); }
  }
  const nfSlotAt = function (i) { return nfShared.add(NF_SH_SLOTS + i * NF_SLOT_SIZE); };
  const nfArm = function (tid) { // JavaScript is serialized: a free slot (armed 0) is ours to write, its tid before its flag
    for (let i = 0; i < NF_SLOTS; i++) {
      const s = nfSlotAt(i);
      if (s.add(NF_SLOT_ARMED).readU32() !== 0) continue;
      s.add(NF_SLOT_TID).writeU32(tid);
      s.add(NF_SLOT_N).writeU32(0);
      s.add(NF_SLOT_DROPPED).writeU32(0);
      s.add(NF_SLOT_ARMED).writeU32(1);
      nfShared.add(NF_SH_OPEN).writeU32(nfShared.add(NF_SH_OPEN).readU32() + 1);
      return i;
    }
    return -1;
  };
  const nfDisarm = function (i) { // on the slot's own thread, inside its Call's leave: no C writer is live on it
    const s = nfSlotAt(i);
    s.add(NF_SLOT_ARMED).writeU32(0);
    s.add(NF_SLOT_TID).writeU32(0);
    const open = nfShared.add(NF_SH_OPEN).readU32();
    nfShared.add(NF_SH_OPEN).writeU32(open > 0 ? open - 1 : 0);
  };
  const nfSlotRead = function (i, start) {
    const s = nfSlotAt(i), n = Math.min(s.add(NF_SLOT_N).readU32(), NF_ENTRIES), entries = [];
    for (let k = start; k < n; k++) {
      const e = s.add(NF_SLOT_ENTRIES + k * NF_E_SIZE);
      entries.push({ frame: e.add(NF_E_FRAME).readPointer(), ret: e.add(NF_E_RET).readPointer(), type: e.add(NF_E_TYPE).readPointer(), value: e.add(NF_E_VALUE).readPointer(), index: e.add(NF_E_INDEX).readU32(), page: e.add(NF_E_PAGE).readU32() });
    }
    return { entries: entries, dropped: s.add(NF_SLOT_DROPPED).readU32() };
  };
  const nfThreads = new Map(); // tid -> { n, win, open: the Call windows, slot, entries and dropped for the fallback }
  const nfThread = function (tid) {
    let T = nfThreads.get(tid);
    if (T === undefined) {
      T = { tid: tid, n: 0, win: 0, open: [], slot: -1, entries: [], dropped: 0 };
      nfThreads.set(tid, T);
    }
    return T;
  };
  let nfOpenWindows = 0;
  const nfFailures = {}; // a listener's exception: the first five per site printed, the rest counted (summary `failures`)
  const nfFail = function (where, e) {
    nfFailures[where] = (nfFailures[where] || 0) + 1;
    if (nfFailures[where] <= 5) nfEmit({ event: 'error', where: where, error: String(e), stack: e && e.stack ? String(e.stack).slice(0, 400) : null });
  };
  const nfJs = { calls: 0, base: 0, detached: false };
  const nfDetachJs = function () {
    try { if (nfGetVarListener !== null) nfGetVarListener.detach(); } catch (e) { attachErrors.push('getVar detach: ' + e); }
    nfEmit({ event: 'getVarDetached', calls: nfJs.calls, cap: NF_GETVAR_CAP, note: 'the JavaScript fallback passed GETVAR_CAP calls in one 10 s interval (104484 is the interpreter operand fetch); later rows read args agree unread' });
  };
  const hookBytes = { call: nfBytes(at('call')), getVar: nfBytes(at('getVar')) }; // before any attach
  if (nfCm !== null) {
    try {
      nfGetVarListener = Interceptor.attach(at('getVar'), { onEnter: nfCm.onEnter, onLeave: nfCm.onLeave });
      nfMode = 'cmodule';
    } catch (e) {
      attachErrors.push('getVar (cmodule): ' + e);
    }
  }
  if (nfMode === 'off' && (NF_GETVAR === 'js' || (NF_GETVAR === 'auto' && nfCm === null))) {
    try {
      nfGetVarListener = Interceptor.attach(at('getVar'), {
        onEnter(args) {
          this.e = undefined;
          nfJs.calls++;
          if (nfJs.detached) return;
          if (nfJs.calls - nfJs.base > NF_GETVAR_CAP) {
            nfJs.detached = true;
            setTimeout(nfDetachJs, 0);
            return;
          }
          if (nfOpenWindows === 0) return;
          try {
            const T = nfThreads.get(this.threadId);
            if (T === undefined || T.open.length === 0) return;
            if (T.entries.length >= NF_ENTRIES) {
              T.dropped++;
              return;
            }
            const e = { frame: args[1], index: args[2].toUInt32(), page: args[3].toUInt32(), ret: NULL, type: NULL, value: NULL };
            T.entries.push(e);
            this.e = e;
          } catch (err) {
            nfFail('getVar js enter', err);
          }
        },
        onLeave(retval) {
          const e = this.e;
          if (e === undefined) return;
          e.ret = retval;
          e.type = nfP(retval, NF_VAR_TYPE);
          e.value = nfP(retval, NF_VAR_VALUE);
        },
      });
      nfMode = 'js';
    } catch (e) {
      attachErrors.push('getVar (js): ' + e);
    }
  }
  // the Interceptor's own liveness: kernel32!Sleep counted (the CModule's counter, else a JavaScript one)
  let nfPulseJs = 0;
  try {
    const sleep = Process.getModuleByName('kernel32.dll').getExportByName('Sleep');
    if (nfCm !== null) Interceptor.attach(sleep, { onEnter: nfCm.nf_pulse });
    else Interceptor.attach(sleep, { onEnter() { nfPulseJs++; } });
  } catch (e) {
    attachErrors.push('Sleep: ' + e);
  }

  // the census and the rows
  let nfSeq = 0, nfCalls = 0, nfCallsWin = 0, nfNoStack = 0, nfSummaries = 0, nfLastSummary = Date.now(), nfGvLast = 0;
  const nfT0 = Date.now();
  const nfRows = { matched: 0, printed: 0, capped: 0, agree: { yes: 0, no: 0, partial: 0, unread: 0, none: 0 }, lines: [], fresh: [] };
  const nfRefNatives = {}, nfAnimSubjects = {}, nfOutsideExe = {};
  let nfRefNativesWin = {};
  const nfCallerModules = new Map();
  let nfMain = nfMainThread();
  const nfCountOutside = function (ra) {
    const k = ra.toString();
    let name = nfCallerModules.get(k);
    if (name === undefined) {
      const m = Process.findModuleByAddress(ra);
      name = m === null ? 'unknown' : m.name;
      nfCallerModules.set(k, name);
    }
    nfOutsideExe[name] = (nfOutsideExe[name] || 0) + 1;
    return name;
  };
  const nfOpen = function (T, fn, f, stack, top, subject, ra, callerKind, arg4) { // the window: every read at Call's entry
    const d = nfFnDetail(fn, f);
    const n = Math.min(Math.max(d.paramCount, 0), NF_MAX_ARGS);
    const owning = nfP(top, NF_FRAME_FUNCTION), owningType = nfTypeInfoName(nfP(top, NF_FRAME_TYPE));
    const w = {
      seq: ++nfSeq, tid: T.tid, t0: Date.now(), fn: fn, f: f, d: d, stack: stack, top: top, subject: subject, start: 0,
      caller: { ret: nfWhere(ra), kind: callerKind }, arg4: arg4, stackEnter: nfStack(stack),
      frame: {
        at: top.toString(), parentIsStack: nfP(top, NF_FRAME_PARENT).equals(stack), own: owning.equals(fn), owningFunction: owning.toString(),
        owningType: owningType, typeOwn: owningType !== null && f.cls !== null && owningType.toLowerCase() === f.cls.toLowerCase(),
        ip: nfU32(top, NF_FRAME_IP), size: nfU32(top, NF_FRAME_SIZE), valid: nfU8(top, NF_FRAME_VALID),
      },
      self: nfVariable(top.add(NF_FRAME_SELF), 1), args: [], raw: [],
      from: nfCaller(nfP(top, NF_FRAME_PREVIOUS)),
      returnEnter: { type: nfP(stack, NF_STACK_RETURN + NF_VAR_TYPE), value: nfP(stack, NF_STACK_RETURN + NF_VAR_VALUE), decoded: nfVariable(stack.add(NF_STACK_RETURN), 0) },
    };
    for (let i = 0; i < n; i++) {
      const v = top.add(NF_FRAME_ARGS + i * NF_VAR_SIZE);
      w.raw.push({ at: v, type: nfP(v, NF_VAR_TYPE), value: nfP(v, NF_VAR_VALUE) });
      const dv = nfVariable(v, 1);
      dv.i = i;
      dv.declared = d.params[i] !== undefined ? d.params[i].type : null;
      w.args.push(dv);
    }
    if (nfMode === 'cmodule') {
      if (T.open.length === 0) T.slot = nfArm(T.tid);
      w.start = T.slot >= 0 ? nfSlotAt(T.slot).add(NF_SLOT_N).readU32() : 0;
    } else if (nfMode === 'js') {
      if (T.open.length === 0) {
        T.entries = [];
        T.dropped = 0;
      }
      w.start = T.entries.length;
    }
    T.open.push(w);
    nfOpenWindows++;
    nfRows.matched++;
    return w;
  };
  const nfAgreement = function (w, gv) { // the frame read at the entry against 104484's answers for the same frame
    const mine = [];
    let other = 0;
    for (const e of gv.entries) {
      if (e.frame.equals(w.top)) mine.push(e);
      else other++;
    }
    const perArg = [];
    let read = 0, mismatch = 0, slotSame = 0;
    for (let i = 0; i < w.raw.length; i++) {
      const a = w.raw[i], es = mine.filter(function (e) { return e.index === i; });
      if (es.length === 0) {
        perArg.push({ i: i, read: false });
        continue;
      }
      const e = es[0], sameSlot = e.ret.equals(a.at), sameValue = nfSameValue(a.type, a.value, e.type, e.value);
      read++;
      if (sameSlot) slotSame++;
      if (!sameValue) mismatch++;
      perArg.push({ i: i, read: true, asked: es.length, page: e.page, answered: e.ret.toString(), sameSlot: sameSlot, sameValue: sameValue, type: nfTypeName(e.type) });
    }
    const n = w.raw.length;
    let word = 'unread';
    if (n === 0) word = 'none';
    else if (mismatch > 0) word = 'no';
    else if (read === n) word = 'yes';
    else if (read > 0) word = 'partial';
    let slot = 'unread';
    if (n === 0) slot = 'none';
    else if (read > 0 && slotSame === read) slot = read === n ? 'yes' : 'partial';
    else if (read > 0) slot = slotSame === 0 ? 'no' : 'partial';
    return {
      word: word, slot: slot, perArg: perArg, asked: mine.map(function (e) { return { index: e.index, page: e.page, answered: e.ret.toString(), type: nfTypeName(e.type) }; }),
      otherFrame: other, dropped: gv.dropped, mode: nfMode, why: gv.why || null,
    };
  };
  const nfDrop = function (w) { // a window closed without its row (nfClose threw): popped, its slot disarmed
    const T = nfThreads.get(w.tid);
    if (T === undefined) return;
    const k = T.open.lastIndexOf(w);
    if (k < 0) return;
    T.open.splice(k, 1);
    nfOpenWindows = Math.max(0, nfOpenWindows - 1);
    if (T.open.length === 0) {
      if (T.slot >= 0) {
        nfDisarm(T.slot);
        T.slot = -1;
      }
      T.entries = [];
      T.dropped = 0;
    }
  };
  const nfClose = function (w, retval) { // Call's leave: the result, the 104484 answers, the row
    const T = nfThreads.get(w.tid), stack = w.stack, ret = retval.toInt32();
    const rvType = nfP(stack, NF_STACK_RETURN + NF_VAR_TYPE), rvValue = nfP(stack, NF_STACK_RETURN + NF_VAR_VALUE);
    const st = nfU32(stack, NF_STACK_STATE);
    const leave = {
      ret: ret, retName: NF_CALL_RESULTS[ret] || String(ret), state: st, stateName: NF_STACK_STATES[st] || String(st), frames: nfU32(stack, NF_STACK_FRAMES),
      topSame: nfP(stack, NF_STACK_TOP).equals(w.top), returnValue: nfVariable(stack.add(NF_STACK_RETURN), 1),
      returnValueChanged: !(rvType.equals(w.returnEnter.type) && rvValue.equals(w.returnEnter.value)),
    };
    let gv = { entries: [], dropped: 0, why: nfMode === 'off' ? 'getVar off' : 'no slot' };
    if (nfMode === 'cmodule' && T.slot >= 0) gv = nfSlotRead(T.slot, w.start);
    else if (nfMode === 'js') gv = { entries: T.entries.slice(w.start), dropped: T.dropped, why: nfJs.detached ? 'the fallback detached' : null };
    const k = T.open.lastIndexOf(w);
    if (k >= 0) T.open.splice(k, 1);
    nfOpenWindows = Math.max(0, nfOpenWindows - 1);
    if (T.open.length === 0) {
      if (T.slot >= 0) {
        nfDisarm(T.slot);
        T.slot = -1;
      }
      T.entries = [];
      T.dropped = 0;
    }
    const ag = nfAgreement(w, gv);
    nfRows.agree[ag.word] = (nfRows.agree[ag.word] || 0) + 1;
    const fromWord = w.from === null ? 'none' : (w.from.type || w.from.cls || '?') + '.' + (w.from.fn || '?');
    const sv = w.self.value;
    const stateWord = sv !== null && typeof sv === 'object' && typeof sv.state === 'string' ? (sv.state === '' ? 'empty' : sv.state) : 'none';
    const line = 'call ' + w.f.key + ' on ' + (w.subject === null ? 'none' : nfId(w.subject)) + ' args ' + (w.args.length > 0 ? w.args.map(nfWord).join(' ') : 'none') +
      ' from ' + fromWord + ' state ' + stateWord + ' frame own ' + (w.frame.own ? 'yes' : 'no') + ' args agree ' + ag.word + ' same slot ' + ag.slot +
      ' ret ' + ret + ' ' + leave.retName + ' caller ' + w.caller.kind + ' thread ' + w.tid + (w.tid === nfMain ? ' main' : ' worker');
    if (nfRows.lines.length < NF_ROWS) nfRows.lines.push(line);
    nfRows.fresh.push(line);
    if (nfRows.printed >= NF_ROWS) {
      nfRows.capped++;
      return;
    }
    nfRows.printed++;
    nfEmit({
      event: 'call', seq: w.seq, tid: w.tid, main: w.tid === nfMain, ms: Date.now() - w.t0, line: line, native: w.f.key, subject: w.subject === null ? null : nfId(w.subject),
      fn: w.d, caller: w.caller, arg4: w.arg4, stack: w.stackEnter, frame: w.frame, self: w.self, args: w.args, from: w.from,
      returnBefore: w.returnEnter.decoded, leave: leave, getVar: ag, agree: ag.word, sameSlot: ag.slot,
    });
  };

  const nfEnter = function (ctx, args) { // Call's entry: the census for every native, a window (returned) for a full row
    const tid = ctx.threadId;
    nfCalls++;
    nfCallsWin++;
    const T = nfThread(tid);
    T.n++;
    T.win++;
    const fn = args[0], key = fn.toString();
    let f = nfFns.get(key);
    if (f === undefined) {
      f = nfFnInfo(fn);
      nfFns.set(key, f);
    }
    f.n++;
    f.win++;
    const ra = ctx.returnAddress, inExe = nfInExe(ra);
    let callerKind = 'vm';
    if (!inExe) {
      f.ext++;
      callerKind = nfCountOutside(ra);
    }
    const stack = nfP(args[1], 0); // the smart pointer's one member (BSTSmartPointer.h:229)
    if (stack.isNull()) {
      f.noStack++;
      nfNoStack++;
      return undefined;
    }
    const top = nfP(stack, NF_STACK_TOP);
    if (top.isNull()) return undefined;
    const subject = nfSubjectOf(top);
    if (subject !== null && subject === NF_REF) {
      nfRefNatives[f.key] = (nfRefNatives[f.key] || 0) + 1;
      nfRefNativesWin[f.key] = (nfRefNativesWin[f.key] || 0) + 1;
    }
    if (!f.anim) return undefined;
    const sk = subject === null ? 'none' : nfId(subject);
    let a = nfAnimSubjects[f.key];
    if (a === undefined) {
      a = {};
      nfAnimSubjects[f.key] = a;
    }
    a[sk] = (a[sk] || 0) + 1;
    if (!NF_ALL && subject !== NF_REF) return undefined;
    let arg4 = -1;
    try { arg4 = args[4].and(0xff).toInt32(); } catch (e) { /* the stack slot unreadable */ }
    return nfOpen(T, fn, f, stack, top, subject, ra, callerKind, arg4);
  };

  // 104651 Call: the census for every native, a window for a full row (attached after getVar, so a window always has its answers)
  try {
    Interceptor.attach(at('call'), {
      onEnter(args) {
        this.w = undefined;
        try {
          this.w = nfEnter(this, args);
        } catch (e) {
          nfFail('call enter', e);
        }
      },
      onLeave(retval) {
        const w = this.w;
        if (w === undefined) return;
        try {
          nfClose(w, retval);
        } catch (e) {
          nfFail('call leave', e);
          nfDrop(w);
        }
      },
    });
  } catch (e) {
    attachErrors.push('call: ' + e);
  }

  nfEmit({
    event: 'ready', script: 'native-frame.js', v: 1, version: version, pid: Process.id, base: exe.base.toString(), size: exe.size,
    hooks: {
      call: { id: NF_IDS.call, rva: nfHex(off.call), addr: at('call').toString(), bytes: hookBytes.call, ghidra: NF_GHIDRA_BYTES.call },
      getVar: { id: NF_IDS.getVar, rva: nfHex(off.getVar), addr: at('getVar').toString(), bytes: hookBytes.getVar, ghidra: NF_GHIDRA_BYTES.getVar, mode: nfMode, cmoduleError: nfCmError },
    },
    reads: {
      mainSingleton: { id: NF_IDS.mainSingleton, rva: nfHex(off.mainSingleton) }, scriptFunctionVtable: { id: NF_IDS.scriptFunctionVtable, rva: nfHex(off.scriptFunctionVtable) },
      playAnimationStub: { id: NF_IDS.playAnimationStub, rva: nfHex(off.playAnimationStub) }, playAnimationAndWaitStub: { id: NF_IDS.playAnimationAndWaitStub, rva: nfHex(off.playAnimationAndWaitStub) },
    },
    params: { REF: nfId(NF_REF), TTL: NF_TTL_S, ALL: NF_ALL, GETVAR: NF_GETVAR, GETVAR_CAP: NF_GETVAR_CAP, ROWS: NF_ROWS },
    mainThread: nfMain, attachErrors: attachErrors,
    note: 'read pid against the run c1-skyrim-platform-pid<N>.log first; bytes are the live sites before any attach (ghidra the static read); getVar mode cmodule, js or off',
  });

  const nfSummary = function (event) {
    const now = Date.now(), dt = Math.max((now - nfLastSummary) / 1000, 0.001);
    nfLastSummary = now;
    nfMain = nfMainThread();
    const threads = [];
    nfThreads.forEach(function (T) {
      if (T.win > 0 || T.open.length > 0) threads.push({ tid: T.tid, main: T.tid === nfMain, total: T.n, interval: T.win, perS: +(T.win / dt).toFixed(1), open: T.open.length });
      T.win = 0;
    });
    threads.sort(function (x, y) { return y.interval - x.interval; });
    const fns = [];
    nfFns.forEach(function (f) { fns.push(f); });
    const top = fns.filter(function (f) { return f.win > 0; }).sort(function (x, y) { return y.win - x.win; }).slice(0, 20)
      .map(function (f) { return [f.key, f.win, +(f.win / dt).toFixed(1), f.n, f.ext]; });
    const topTotal = fns.slice().sort(function (x, y) { return y.n - x.n; }).slice(0, 20).map(function (f) { return [f.key, f.n, f.ext]; });
    fns.forEach(function (f) { f.win = 0; });
    let getVar = { mode: nfMode, error: nfCmError };
    if (nfMode === 'cmodule') {
      const calls = nfShared.add(NF_SH_CALLS).readU64().toNumber();
      getVar = { mode: nfMode, calls: calls, interval: calls - nfGvLast, perS: +((calls - nfGvLast) / dt).toFixed(1), inWindow: nfShared.add(NF_SH_IN_WINDOW).readU64().toNumber(), armed: nfShared.add(NF_SH_OPEN).readU32() };
      nfGvLast = calls;
    } else if (nfMode === 'js') {
      getVar = { mode: nfMode, calls: nfJs.calls, interval: nfJs.calls - nfJs.base, perS: +((nfJs.calls - nfJs.base) / dt).toFixed(1), detached: nfJs.detached, cap: NF_GETVAR_CAP };
      nfJs.base = nfJs.calls;
    }
    const open = [];
    nfThreads.forEach(function (T) { T.open.forEach(function (w) { open.push({ tid: T.tid, native: w.f.key, seq: w.seq, ageMs: now - w.t0 }); }); });
    const row = {
      event: event, n: ++nfSummaries, uptimeS: Math.round((now - nfT0) / 1000), intervalS: +dt.toFixed(1), mainThread: nfMain,
      calls: { total: nfCalls, interval: nfCallsWin, perS: +(nfCallsWin / dt).toFixed(1) }, threads: threads.slice(0, 16), threadsSeen: nfThreads.size, natives: nfFns.size,
      top: top, topTotal: topTotal, refNatives: nfRefNatives, refNativesInterval: nfRefNativesWin, animSubjects: nfAnimSubjects, outsideExe: nfOutsideExe, noStack: nfNoStack,
      getVar: getVar, pulse: nfCm !== null ? nfShared.add(NF_SH_PULSE).readU64().toNumber() : nfPulseJs,
      rows: { matched: nfRows.matched, printed: nfRows.printed, capped: nfRows.capped, agree: nfRows.agree }, newLines: nfRows.fresh, openWindows: open,
      failures: nfFailures,
    };
    if (event === 'final') row.lines = nfRows.lines;
    nfEmit(row);
    nfCallsWin = 0;
    nfRefNativesWin = {};
    nfRows.fresh = [];
  };
  const nfTimer = setInterval(function () { nfSummary('summary'); }, NF_SUMMARY_MS);
  setTimeout(function () {
    clearInterval(nfTimer);
    nfSummary('final');
    try {
      Interceptor.detachAll(); // the CModule and its memory stay referenced: a thread still inside a callback finds them
      nfEmit({ event: 'detached', ttl: NF_TTL_S });
    } catch (e) {
      nfEmit({ event: 'error', where: 'detachAll', error: String(e) });
    }
  }, NF_TTL_S * 1000);
}
