// acting-frame.js v1 DRAFT (ADR-068 rung 5's premise reads, 2026-11-09): x-acting-frame v1's trace, for fork canon ce0d2664 on the
// seat that applies a relayed stage (c2). New, so a fresh review comes before its first run (ADR-064 rule A); it lives by path at
// lab/.cache/drafts/rung5/acting-frame.js until that review and rung 5's L1 commit put it in lab/frida, which lab-api serves its
// frida steps from (FRIDA_SCRIPTS_DIR: runner.py _frida_start answers E_RUN_FRIDA "no script" for a name not there). The plan:
// docs/research/rung5-quests-2026-11-09.md, section 1(e)'s lab/frida/acting-frame.js and section 2's H-AP1 and H-QF1.
// ONE QUESTION: on a seat that applies a relayed stage with its fragment let run, whom does the fragment's Game.GetPlayer() name,
// and what does its stack's root frame hold? H-AP1 (the ActingScope's Join key): the relayed fragment's stack has a root frame whose
// self is the quest's script object (its handle's low 32 bits the quest's form id) and whose function is the QF script's Fragment_N.
// Attach only: no Interceptor.replace, and no listener calls an engine function (a hooked function called from inside a listener is
// bypassed on that thread: frida-gum's listener guard), so every read is memory.
//
// The hook, by `just addr` (lab/addr.py over addrlib/, runtime 1.6.1170.0, 428461 entries, run 2026-11-09), (h) hooked, (r) read:
//   104651  0x143dc00  (h) BSScript::NF_util::NativeFunctionBase::Call, CommonLib Offsets.h:130 RELOCATION_ID(97923, 104651);
//                          IFunction slot 0x0F (NativeFunctionBase.h:47): the VM's one native dispatch, native-frame.js's hook.
//                          The ready row's live bytes there read e9 (a jump): the platform's own seam replacement patched the site
//                          first (ScriptNatives.cpp's NativeCallReplacement); native-frame.js's attach runs over it the same way
//                          (x-native-frame 20261105-023520). native-frame.js's static read of the site: 4c 89 44 24 18 55 56 57
//   403449  0x31872c0  (r) Main's singleton, Offsets.h:383 RELOCATION_ID(516943, 403449); threadID at +0x28 (Main.h:87)
//   252888  0x1aa5ad0  (r) VTABLE_BSScript__Internal__ScriptFunction, Offsets_VTABLE.h:7082: a frame's function is a script's when its
//                          vtable is this one, else a native's
// The filter is the IFunction's own names, read once per IFunction: _objName "Game" and _name "GetPlayer" (NativeFunctionBase.h:62-63;
// compared lower case, as native-frame.js compares: the VM's string pool keeps the first spelling it saw). No IFunction pointer and no
// native id is assumed; the summary row lists every IFunction that matched.
// Layouts, CommonLibSSE-NG b93280e8 headers (file:line), as native-frame.js reads them:
//   Call(this, const BSTSmartPointer<Stack>&, ErrorLogger*, VirtualMachine*, bool) (NativeFunctionBase.h:47): args[0] the IFunction,
//     args[1] a pointer to the smart pointer whose one member is the Stack* (BSTSmartPointer.h:229)
//   NativeFunctionBase (NativeFunctionBase.h:62-64) and ScriptFunction (ScriptFunction.h:45-47) alike: name +0x10, objName +0x18,
//     stateName +0x20
//   Stack (Stack.h:74-83): frames +0x58, top +0x60, state +0x68 (the enum :29-37), returnValue +0x70 (a Variable), stackID +0x80,
//     stackType +0x84, callback +0x90
//   StackFrame (StackFrame.h:21-29): previousFrame +0x08, owningFunction +0x10, owningObjectType +0x18, instructionPointer +0x20,
//     self +0x28 (a Variable), size +0x38
//   Variable (Variable.h:93-94): varType +0x00 (a TypeInfo: raw 0 none to 15, an ObjectTypeInfo* past 16 with bit 0 an array,
//     TypeInfo.h:14-31), value +0x08
//   ObjectTypeInfo (ObjectTypeInfo.h:177): name +0x08; Object (Object.h:43-46): type +0x08, currentState +0x10, handle +0x20
//   BSFixedString (BSFixedString.h:232): one pointer, the characters; CallResult (IFunction.h:36-40)
//   VMHandle: bits 48 to 63 a kind, 32 to 47 a middle word, 0 to 31 a form id (HYPOTHESIS, docs/research/adr065-papyrus-state Q1,
//     ScriptNatives.cpp:383-397's IsPlainFormHandle and FormIdOfHandle): the row prints all three, read raw, never judged
//
// Per GetPlayer call, at the entry: the Stack; its top; the walk from the top along previousFrame (StackFrame.h:22) to the frame
// whose previousFrame is null, at most min(frames, 64) steps: that frame is the ROOT; the top's own (owningFunction == the native,
// H-S1); the caller frame (the top's previousFrame); the root's owningObjectType name, its owningFunction's name, objName and
// stateName, whether it is a script function, its self (type, and for an object its handle's kind, mid and low 32 bits); the
// return address (vm for SkyrimSE.exe, else the module: the platform's own callNative path returns into SkyrimPlatformImpl.dll).
// At the leave: the CallResult and the Stack's returnValue decoded the same way (GetPlayer's answer is an Actor object; its handle's
// low 32 bits are the actor's form id: 0x14 is the seat's own player, the figure of another seat a runtime id from 0xff000000).
//
// Rows, one JSON line each through console.log (lab-api's preamble flushes them to the trace's .log every 250 ms) and send():
//   {event: 'ready'} once: version, pid (read it against the run's c2-skyrim-platform-pid<N>.log before any row: the wrong-process
//     rule), base, the hook's id, rva, address and live first bytes (read before the attach), the read ids, params, Main's thread,
//     attach errors.
//   {event: 'getPlayer'} per printed call: seq, quest (the root's self low 32 is QUEST), a `line`: "getPlayer root <Type.Function>
//     self <low> kind <k> mid <m> from <Type.Function> ret <low> <CallResult> stack <id> depth <n> caller <vm|module> thread <tid>
//     <main|worker>", then the IFunction, the Stack (id, type, frames, state at the entry and the leave, callback), depth,
//     rootIsBottom, own, the root and caller frames whole, the top's self, the leave (result, returnValue).
//   {event: 'summary'} every 10 s: every native call counted before the filter (the hook's liveness: total, interval, per second),
//     GetPlayer's calls, the IFunctions that matched, the tally by root (key, calls, vm, platform, quest), questStacks (per root key,
//     each stack id with its rows: H-QF1's count), rows printed and capped, the kernel32!Sleep pulse, failures.
//   {event: 'final'} at TTL with every QUEST row's line, then 'detached'.
// Volume: every GetPlayer call is tallied; rows print for every call whose root self's low 32 is QUEST, up to QROWS, for the first
// ROWS other VM calls and the first PROWS platform calls (a return outside SkyrimSE.exe); the rest are the tally's.
// Expected on c2 in x-acting-frame v1 (QUEST 0x74a83, the relayed stage 310): Fragment_22 calls Game.GetPlayer twice, at its ops 0
// and 4 (lab/pex.py's disassembly of QF_FreeformRiverwood01_00074A83 out of Skyrim - Misc.bsa on sky-srv: GetPlayer, AddItem(Gold,
// 25, False), Alias_Faendal.GetActorRef(), GetPlayer, SetRelationshipRank(player, 2), CompleteAllObjectives, Stop), so one run of the
// fragment is two QUEST rows on one stack: "getPlayer root QF_FreeformRiverwood01_00074A83.Fragment_22 self 74a83 kind <k> mid <m>
// from QF_FreeformRiverwood01_00074A83.Fragment_22 ret 14 kCompleted stack <id> depth 1 caller vm ...", ret 14 being today's answer
// (c2's own player: finding 5's doubled reward). Falsifiers of H-AP1: QUEST-free rows only while c2's census counts the fragment's
// "Quest.Stop on 74a83" (the fragment ran, its stack's root is something else: its root key names what); a root of Fragment_22 whose
// self's low 32 is not 74a83. Unread, not false: no row and no tally at all for GetPlayer while c2's census counts "Game.GetPlayer
// (local)" (the wrong process first, then the name filter: the summary's natives count and matched list).
// LAB_PARAMS (lab-api's frida step prepends globalThis.LAB_PARAMS): QUEST the form id whose rows always print (a number, "0x74a83"
// or "74a83"; default 0x74a83); TTL seconds to the final row and the detach (default 900); ROWS (300), QROWS (64), PROWS (8). Run
// from a probe on the applying seat at least 15 s before the stage it reads (a script goes ready late): `- c2: frida {script:
// acting-frame.js, params: {QUEST: 0x74a83}}`, then `wait: 15`. 1.6.1170 only.
'use strict';
const AF_PARAMS = (typeof LAB_PARAMS === 'object' && LAB_PARAMS) ? LAB_PARAMS : {};
function afParseForm(v, dflt) {
  if (typeof v === 'number' && Number.isFinite(v) && v > 0) return v >>> 0;
  if (typeof v === 'string') {
    const s = v.trim();
    if (/^0x[0-9a-f]+$/i.test(s)) return parseInt(s.slice(2), 16) >>> 0;
    if (/^[0-9a-f]+$/i.test(s)) return parseInt(s, 16) >>> 0;
  }
  return dflt;
}
function afPositive(v, dflt) { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : dflt; }
const AF_QUEST = afParseForm(AF_PARAMS.QUEST, 0x74a83);
const AF_QF_SUFFIX = '_' + ('00000000' + AF_QUEST.toString(16)).slice(-8); // QF_<editor id>_00074a83
const AF_TTL_S = afPositive(AF_PARAMS.TTL, 900);
const AF_ROWS = Math.floor(afPositive(AF_PARAMS.ROWS, 300));
const AF_QROWS = Math.floor(afPositive(AF_PARAMS.QROWS, 64));
const AF_PROWS = Math.floor(afPositive(AF_PARAMS.PROWS, 8));
const AF_SUMMARY_MS = 10000;
const AF_WALK_MAX = 64;
const AF_LINES_MAX = 256;
function afEmit(obj) {
  obj.t = Date.now();
  try { send(obj); } catch (e) { /* lab-api's preamble makes send a no-op */ }
  console.log(JSON.stringify(obj));
}

// `just addr <id>` on Address Library 1.6.1170, 2026-11-09 (never from memory, CLAUDE.md rule 1)
const AF_OFFSETS = {
  '1.6.1170.0': {
    call: 0x143dc00, // 104651 NativeFunctionBase::Call (h)
    mainSingleton: 0x31872c0, // 403449 Main's singleton, a Main* static (r)
    scriptFunctionVtable: 0x1aa5ad0, // 252888 VTABLE_BSScript__Internal__ScriptFunction (r)
  },
};
const AF_IDS = { call: 104651, mainSingleton: 403449, scriptFunctionVtable: 252888 };
const AF_GHIDRA_BYTES = { call: '4c89442418555657' }; // native-frame.js's static read of 104651's entry

// NativeFunctionBase.h:62-64 and ScriptFunction.h:45-47 (the same offsets for both kinds of function)
const AF_FN_NAME = 0x10, AF_FN_CLASS = 0x18, AF_FN_STATE = 0x20;
// Stack.h:74-83
const AF_STACK_FRAMES = 0x58, AF_STACK_TOP = 0x60, AF_STACK_STATE = 0x68, AF_STACK_RETURN = 0x70, AF_STACK_ID = 0x80;
const AF_STACK_TYPE = 0x84, AF_STACK_CALLBACK = 0x90;
// StackFrame.h:21-29
const AF_FRAME_PREVIOUS = 0x08, AF_FRAME_FUNCTION = 0x10, AF_FRAME_TYPE = 0x18, AF_FRAME_IP = 0x20, AF_FRAME_SELF = 0x28;
const AF_FRAME_SIZE = 0x38;
// Variable.h:93-94
const AF_VAR_TYPE = 0x00, AF_VAR_VALUE = 0x08;
// ObjectTypeInfo.h:177; Object.h:43-46; Main.h:87
const AF_TYPE_NAME = 0x08;
const AF_OBJ_TYPE = 0x08, AF_OBJ_STATE = 0x10, AF_OBJ_HANDLE = 0x20;
const AF_MAIN_THREAD_ID = 0x28;
const AF_RAW_NAMES = { 0: 'none', 1: 'object', 2: 'string', 3: 'int', 4: 'float', 5: 'bool', 10: 'none[]', 11: 'object[]', 12: 'string[]', 13: 'int[]', 14: 'float[]', 15: 'bool[]' }; // TypeInfo.h:14-26
const AF_CALL_RESULTS = ['kCompleted', 'kSetupForVM', 'kInProgress', 'kFailedRetry', 'kFailedAbort']; // IFunction.h:36-40
const AF_STACK_STATES = ['kRunning', 'kFinished', 'kWaitingOnMemory', 'kWaitingOnLatentFunction', 'kWaitingOnOtherStackForCall', 'kWaitingOnOtherStackForReturn', 'kWaitingOnOtherStackForReturnNoPop', 'kRetryReturnNoPop', 'kRetryCall']; // Stack.h:29-37
const AF_P16 = ptr(16); // kArraysEnd and past it a class pointer (TypeInfo.h:28-31)
const AF_NOT_BIT0 = ptr('0xfffffffffffffffe'); // raw & ~1: an object array's class

function afFileVersion(path) {
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

function afHex(n) { return '0x' + (n >>> 0).toString(16); }
function afId(n) { return (n >>> 0).toString(16); } // the platform's log shape ("fragment of 74a83 ..."), no 0x
function afP(p, o) { try { return p.isNull() ? NULL : p.add(o).readPointer(); } catch (e) { return NULL; } }
function afU8(p, o) { try { return p.add(o).readU8(); } catch (e) { return -1; } }
function afU32(p, o) { try { return p.add(o).readU32(); } catch (e) { return -1; } }
function afS32(p, o) { try { return p.add(o).readS32(); } catch (e) { return null; } }
function afF32(p, o) { try { return +p.add(o).readFloat().toPrecision(7); } catch (e) { return null; } }
function afFixed(field) { // a BSFixedString field: its one pointer is the characters (BSFixedString.h:232); null the empty string
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
function afBytes(p) {
  try {
    const a = new Uint8Array(p.readByteArray(8));
    let s = '';
    for (let i = 0; i < a.length; i++) s += ('0' + a[i].toString(16)).slice(-2);
    return s;
  } catch (e) {
    return 'unreadable';
  }
}
function afWhere(p) {
  if (p.isNull()) return '0x0';
  try {
    const m = Process.findModuleByAddress(p);
    return m === null ? p.toString() : m.name + '+0x' + p.sub(m.base).toString(16);
  } catch (e) {
    return p.toString();
  }
}

const afExe = Process.getModuleByName('SkyrimSE.exe');
const afVersion = afFileVersion(afExe.path);
const afOff = AF_OFFSETS[afVersion];
if (afOff === undefined) {
  afEmit({ event: 'ready', script: 'acting-frame.js', error: 'no offsets for this runtime', version: afVersion, pid: Process.id, params: AF_PARAMS });
} else {
  const afAt = function (name) { return afExe.base.add(afOff[name]); };
  const afExeEnd = afExe.base.add(afExe.size);
  const afInExe = function (p) { return p.compare(afExe.base) >= 0 && p.compare(afExeEnd) < 0; };
  const afSfVtable = afAt('scriptFunctionVtable');
  const afMainThread = function () { // Main's singleton (Offsets.h:383), threadID at +0x28 (Main.h:87)
    const main = afP(afAt('mainSingleton'), 0);
    return main.isNull() ? 0 : afU32(main, AF_MAIN_THREAD_ID);
  };
  let afMain = afMainThread();

  // TypeInfo, Variable and Object reads (memory only)
  const afTypeNames = new Map(); // ObjectTypeInfo* -> name (the VM keeps its types for the session)
  const afTypeInfoName = function (oti) {
    if (oti.isNull()) return null;
    const k = oti.toString();
    let n = afTypeNames.get(k);
    if (n === undefined) {
      n = afFixed(oti.add(AF_TYPE_NAME));
      afTypeNames.set(k, n);
    }
    return n;
  };
  const afRawKind = function (raw) { // TypeInfo.cpp's GetUnmangledRawType: below 16 the raw kind, else 1 or 11 by bit 0
    if (raw.compare(AF_P16) < 0) return raw.toUInt32();
    return raw.and(1).isNull() ? 1 : 11;
  };
  const afTypeName = function (raw) {
    if (raw.compare(AF_P16) < 0) {
      const k = raw.toUInt32();
      return AF_RAW_NAMES[k] !== undefined ? AF_RAW_NAMES[k] : 'raw ' + k;
    }
    const name = afTypeInfoName(raw.and(AF_NOT_BIT0));
    return raw.and(1).isNull() ? name : name + '[]';
  };
  const afObject = function (obj) { // Object.h:43-46 and the handle's three parts (HYPOTHESIS encoding, printed raw)
    if (obj.isNull()) return { none: true };
    const lo = afU32(obj, AF_OBJ_HANDLE), hi = afU32(obj, AF_OBJ_HANDLE + 4);
    return {
      at: obj.toString(), type: afTypeInfoName(afP(obj, AF_OBJ_TYPE)), state: afFixed(obj.add(AF_OBJ_STATE)),
      kind: hi < 0 ? null : hi >>> 16, mid: hi < 0 ? null : afHex(hi & 0xffff), low: lo < 0 ? null : afHex(lo),
    };
  };
  const afVariable = function (v) { // Variable.h:93-94
    const raw = afP(v, AF_VAR_TYPE);
    const kind = afRawKind(raw);
    const val = v.add(AF_VAR_VALUE);
    const r = { type: afTypeName(raw) };
    if (kind === 1) {
      r.object = afObject(afP(val, 0));
    } else if (kind === 2) {
      r.value = afFixed(val);
    } else if (kind === 3) {
      r.value = afS32(val, 0);
    } else if (kind === 4) {
      r.value = afF32(val, 0);
    } else if (kind === 5) {
      const b = afU8(val, 0);
      r.value = b < 0 ? null : b !== 0;
    } else if (kind === 0) {
      r.value = null;
    } else {
      r.value = 'kind ' + kind; // an array: its class, not read
    }
    return r;
  };
  const afFrame = function (frame) { // StackFrame.h:21-29: whose function, which script's type, on which self
    const fn = afP(frame, AF_FRAME_FUNCTION);
    const vt = afP(fn, 0);
    return {
      at: frame.toString(), type: afTypeInfoName(afP(frame, AF_FRAME_TYPE)),
      fn: fn.isNull() ? null : afFixed(fn.add(AF_FN_NAME)), cls: fn.isNull() ? null : afFixed(fn.add(AF_FN_CLASS)),
      fnState: fn.isNull() ? null : afFixed(fn.add(AF_FN_STATE)), isScript: !vt.isNull() && vt.equals(afSfVtable), vtable: afWhereOnce(vt),
      ip: afU32(frame, AF_FRAME_IP), size: afU32(frame, AF_FRAME_SIZE), self: afVariable(frame.add(AF_FRAME_SELF)),
    };
  };
  const afKey = function (f) { return f === null ? 'none' : (f.type || f.cls || '?') + '.' + (f.fn || '?'); };
  const afSelfWord = function (self) {
    const o = self.object;
    if (o === undefined) return self.type === null ? '?' : self.type;
    if (o.none) return 'None';
    return (o.low === null ? '?' : o.low.slice(2)) + ' kind ' + o.kind + ' mid ' + o.mid;
  };

  // the natives by IFunction pointer: names read once each, the filter's one test
  const afFns = new Map();
  const afFnInfo = function (fn) {
    const name = afFixed(fn.add(AF_FN_NAME)), cls = afFixed(fn.add(AF_FN_CLASS));
    const match = name !== null && cls !== null && name.toLowerCase() === 'getplayer' && cls.toLowerCase() === 'game';
    return { at: fn.toString(), name: name, cls: cls, state: match ? afFixed(fn.add(AF_FN_STATE)) : null, match: match, n: 0 };
  };
  const afWheres = new Map(); // an address (a vtable, a return address) -> module+offset, read once each
  const afWhereOnce = function (p) {
    const k = p.toString();
    let w = afWheres.get(k);
    if (w === undefined) {
      w = afWhere(p);
      afWheres.set(k, w);
    }
    return w;
  };
  const afModules = new Map();
  const afModule = function (ra) {
    const k = ra.toString();
    let n = afModules.get(k);
    if (n === undefined) {
      const m = Process.findModuleByAddress(ra);
      n = m === null ? 'unknown' : m.name;
      afModules.set(k, n);
    }
    return n;
  };

  let afCalls = 0, afCallsWin = 0, afHits = 0, afHitsWin = 0, afNoStack = 0, afSeq = 0, afPulse = 0, afSummaries = 0, afPlatformQuiet = 0;
  let afLastSummary = Date.now();
  const afT0 = Date.now();
  const afRoots = {}; // root key -> {n, vm, platform, quest}
  const afQuestStacks = {}; // root key -> {stack id: rows}, QUEST-rooted calls only (H-QF1: distinct stacks are fragment runs)
  const afRows = { quest: 0, vm: 0, platform: 0, capped: 0 };
  const afLines = [];
  const afFailures = {};
  const afFail = function (where, e) { // a listener's exception: the first five per site printed, all counted
    afFailures[where] = (afFailures[where] || 0) + 1;
    if (afFailures[where] <= 5) afEmit({ event: 'error', where: where, error: String(e), stack: e && e.stack ? String(e.stack).slice(0, 400) : null });
  };

  const afOpen = function (ctx, fn, f, args) { // Call's entry for a GetPlayer: every read the row needs before the native runs
    afHits++;
    afHitsWin++;
    f.n++;
    const ra = ctx.returnAddress;
    const vm = afInExe(ra);
    if (!vm && afRows.platform >= AF_PROWS) { afPlatformQuiet++; return undefined; }
    const stack = afP(args[1], 0); // the smart pointer's one member (BSTSmartPointer.h:229)
    if (stack.isNull()) {
      afNoStack++;
      return undefined;
    }
    const top = afP(stack, AF_STACK_TOP);
    if (top.isNull()) {
      afNoStack++;
      return undefined;
    }
    const frames = afU32(stack, AF_STACK_FRAMES);
    const limit = Math.min(frames > 0 ? frames : AF_WALK_MAX, AF_WALK_MAX);
    let root = top, depth = 0;
    while (depth < limit) {
      const prev = afP(root, AF_FRAME_PREVIOUS);
      if (prev.isNull()) break;
      root = prev;
      depth++;
    }
    const callerFrame = afP(top, AF_FRAME_PREVIOUS);
    const rootInfo = afFrame(root);
    return {
      seq: ++afSeq, tid: ctx.threadId, fn: fn, f: f, stack: stack, vm: vm, caller: vm ? 'vm' : afModule(ra), ret: afWhereOnce(ra),
      stackId: afU32(stack, AF_STACK_ID), stackType: afU32(stack, AF_STACK_TYPE), stateEnter: afU32(stack, AF_STACK_STATE),
      callback: !afP(stack, AF_STACK_CALLBACK).isNull(), frames: frames, depth: depth,
      rootIsBottom: afP(root, AF_FRAME_PREVIOUS).isNull(), own: afP(top, AF_FRAME_FUNCTION).equals(fn),
      root: rootInfo, from: callerFrame.isNull() ? null : (callerFrame.equals(root) ? rootInfo : afFrame(callerFrame)),
      topSelf: afVariable(top.add(AF_FRAME_SELF)),
    };
  };
  const afClose = function (w, retval) { // Call's leave: the answer the script reads, the tally, the row
    const ret = retval.toInt32();
    const rv = afVariable(w.stack.add(AF_STACK_RETURN));
    const stateLeave = afU32(w.stack, AF_STACK_STATE);
    const rootKey = afKey(w.root);
    const so = w.root.self.object;
    const rootLow = so !== undefined && !so.none && so.low !== null ? parseInt(so.low.slice(2), 16) >>> 0 : null;
    const quest = rootLow !== null && rootLow === AF_QUEST;
    const ownScript = typeof w.root.type === 'string' && w.root.type.toLowerCase().endsWith(AF_QF_SUFFIX);
    let t = afRoots[rootKey];
    if (t === undefined) {
      t = { n: 0, vm: 0, platform: 0, quest: 0 };
      afRoots[rootKey] = t;
    }
    t.n++;
    if (w.vm) t.vm++;
    else t.platform++;
    if (quest) {
      t.quest++;
      const s = afQuestStacks[rootKey] || {};
      afQuestStacks[rootKey] = s;
      s[w.stackId] = (s[w.stackId] || 0) + 1;
    }
    let print = false;
    if (quest || ownScript) {
      if (afRows.quest < AF_QROWS) {
        afRows.quest++;
        print = true;
      }
    } else if (w.vm) {
      if (afRows.vm < AF_ROWS) {
        afRows.vm++;
        print = true;
      }
    } else if (afRows.platform < AF_PROWS) {
      afRows.platform++;
      print = true;
    }
    const ro = rv.object;
    const retWord = ro !== undefined ? (ro.none ? 'None' : (ro.low === null ? '?' : ro.low.slice(2))) : String(rv.type);
    const resultName = AF_CALL_RESULTS[ret] || String(ret);
    const line = 'getPlayer root ' + rootKey + ' self ' + afSelfWord(w.root.self) + ' from ' + afKey(w.from) + ' ret ' + retWord + ' ' +
      resultName + ' stack ' + w.stackId + ' depth ' + w.depth + ' caller ' + w.caller + ' thread ' + w.tid + (w.tid === afMain ? ' main' : ' worker');
    if ((quest || ownScript) && afLines.length < AF_LINES_MAX) afLines.push(line);
    if (!print) {
      afRows.capped++;
      return;
    }
    afEmit({
      event: 'getPlayer', seq: w.seq, quest: quest, ownScript: ownScript, line: line, tid: w.tid, main: w.tid === afMain,
      fn: { at: w.fn.toString(), cls: w.f.cls, name: w.f.name, state: w.f.state },
      stack: {
        id: w.stackId, type: w.stackType, frames: w.frames, callback: w.callback,
        stateEnter: AF_STACK_STATES[w.stateEnter] || String(w.stateEnter), stateLeave: AF_STACK_STATES[stateLeave] || String(stateLeave),
      },
      depth: w.depth, rootIsBottom: w.rootIsBottom, own: w.own, caller: w.caller, ret: w.ret, root: w.root, from: w.from, topSelf: w.topSelf,
      leave: { result: ret, resultName: resultName, returnValue: rv },
    });
  };

  // the attaches: kernel32!Sleep first (the Interceptor's own pulse), then 104651 (its liveness is the summary's call count)
  const afAttachErrors = [];
  const afBytesBefore = afBytes(afAt('call')); // before the attach: e9 is the platform's seam hook, already there
  try {
    const sleep = Process.getModuleByName('kernel32.dll').getExportByName('Sleep');
    Interceptor.attach(sleep, { onEnter() { afPulse++; } });
  } catch (e) {
    afAttachErrors.push('Sleep: ' + e);
  }
  try {
    Interceptor.attach(afAt('call'), {
      onEnter(args) {
        this.w = undefined;
        afCalls++;
        afCallsWin++;
        try {
          const fn = args[0];
          const key = fn.toString();
          let f = afFns.get(key);
          if (f === undefined) {
            f = afFnInfo(fn);
            afFns.set(key, f);
          }
          if (!f.match) return;
          this.w = afOpen(this, fn, f, args);
        } catch (e) {
          afFail('call enter', e);
        }
      },
      onLeave(retval) {
        const w = this.w;
        if (w === undefined) return;
        try {
          afClose(w, retval);
        } catch (e) {
          afFail('call leave', e);
        }
      },
    });
  } catch (e) {
    afAttachErrors.push('call: ' + e);
  }

  afEmit({
    event: 'ready', script: 'acting-frame.js', v: 1, version: afVersion, pid: Process.id, base: afExe.base.toString(), size: afExe.size,
    hooks: { call: { id: AF_IDS.call, rva: afHex(afOff.call), addr: afAt('call').toString(), bytes: afBytesBefore, ghidra: AF_GHIDRA_BYTES.call } },
    reads: {
      mainSingleton: { id: AF_IDS.mainSingleton, rva: afHex(afOff.mainSingleton) },
      scriptFunctionVtable: { id: AF_IDS.scriptFunctionVtable, rva: afHex(afOff.scriptFunctionVtable) },
    },
    params: { QUEST: afId(AF_QUEST), TTL: AF_TTL_S, ROWS: AF_ROWS, QROWS: AF_QROWS, PROWS: AF_PROWS }, mainThread: afMain, attachErrors: afAttachErrors,
    note: 'read pid against the run c2-skyrim-platform-pid<N>.log first; bytes are the live site before the attach (e9 the platform seam hook, ghidra the static read)',
  });

  const afSummary = function (event) {
    const now = Date.now(), dt = Math.max((now - afLastSummary) / 1000, 0.001);
    afLastSummary = now;
    afMain = afMainThread();
    const matched = [];
    afFns.forEach(function (f) { if (f.match) matched.push({ at: f.at, cls: f.cls, name: f.name, state: f.state, n: f.n }); });
    const roots = Object.keys(afRoots).map(function (k) { const r = afRoots[k]; return [k, r.n, r.vm, r.platform, r.quest]; })
      .sort(function (a, b) { return b[1] - a[1]; }).slice(0, 24);
    const row = {
      event: event, n: ++afSummaries, uptimeS: Math.round((now - afT0) / 1000), intervalS: +dt.toFixed(1), mainThread: afMain,
      calls: { total: afCalls, interval: afCallsWin, perS: +(afCallsWin / dt).toFixed(1) },
      getPlayer: { total: afHits, interval: afHitsWin, perS: +(afHitsWin / dt).toFixed(1), noStack: afNoStack, platformQuiet: afPlatformQuiet },
      natives: afFns.size, matched: matched, roots: roots, rootsSeen: Object.keys(afRoots).length, questStacks: afQuestStacks,
      rows: afRows, pulse: afPulse, failures: afFailures,
    };
    if (event === 'final') row.questLines = afLines;
    afEmit(row);
    afCallsWin = 0;
    afHitsWin = 0;
  };
  const afTimer = setInterval(function () { afSummary('summary'); }, AF_SUMMARY_MS);
  setTimeout(function () {
    clearInterval(afTimer);
    afSummary('final');
    try {
      Interceptor.detachAll();
      afEmit({ event: 'detached', ttl: AF_TTL_S });
    } catch (e) {
      afEmit({ event: 'error', where: 'detachAll', error: String(e) });
    }
  }, AF_TTL_S * 1000);
}
