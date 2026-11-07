// lever-furn-trace.js v1 (2026-11-06, the r50 reads; thuum docs/verbs/traps.md H-P1, the NoPlayer furniture): what the engine
// does when a seat's player pulls Bleak Falls Temple's puzzle lever 0xaa8c3 (FURN 0xb7db4 LeverPushAnimatingNoPlayer, its one
// script defaultPillarPuzzleLever), on the puller's seat and on the seat that watches: every graph event sent to the lever and to
// the actors that matter (the player 0x14 and the figures, 0xff000000 and up), the furniture activation's entry and exit, the
// idle the engine picks for it, the graph's own events back, and the natives the lever's script calls, each with time, thread
// and a short caller. The static read it tests: lab/.cache/drafts/fifty/lever-furn-static.md (thuum checkout); the probe:
// lab/.cache/drafts/fifty/x-lever-furn.yaml. Attach only: no Interceptor.replace, no engine call from a listener (Frida's
// listener guard), no timer that reads game state (the liveness row prints counters alone).
//
// Address Library 1.6.1170 ids, every offset by `just addr <id>` from the thuum checkout on 2026-11-06 (lab/addr.py over addrlib/,
// runtime 1.6.1170.0, 428461 entries); (h) hooked, (r) read only; the bytes are Ghidra's read of
// /SkyrimSE-1.6.1170.0.exe.unpacked.exe (pyghidra-mcp, image base 0x140000000), printed again from the live process by the ready
// row before any attach (e9 there: another hook patched the site first). Roles from CommonLibSSE-NG b93280e8 where it names them,
// else the static read's decompile, HYPOTHESIS:
//   19796  0x2eac20  (h) TESObjectREFR::ActivateRef(this, a_activator, a_arg2, a_object, a_count, a_defaultProcessingOnly),
//                        CommonLib src/RE/T/TESObjectREFR.cpp:52-56 RELOCATION_ID(19369, 19796), TESObjectREFR.h:367; bytes
//                        48 8b c4 4c 89 48 20 44. Its block test reads ExtraFlags kBlockActivate (ExtraFlags.h:17) unless
//                        a_defaultProcessingOnly, which skips the TESActivateEvent and calls the base's Activate (decompile)
//   17420  0x269c00  (h) TESFurniture::Activate(this, a_targetRef, a_activatorRef, a_arg3, a_object, a_targetCount), slot 0x37
//                        (TESFurniture.h:125) of VTABLE_TESFurniture[0] 189309 (0x17983c0, Offsets_VTABLE.h:499), the slot
//                        checked live; bytes 48 8b c4 57 48 81 ec b0. Its first test refuses any activator but *(401069)
//                        (disassembly 0x140269c28-0x140269c38, XOR AL,AL at 0x140269eab); with the base's keyword default
//                        object 182 (kKeywordActivatorFurnitureNoPlayer, BGSDefaultObjectManager.h:195; Skyrim.esm DOBJ 'AFNP'
//                        0xb7db3 FurntiureNoPlayerAnim) it builds an ActionInput (14993) with the lever as source and default
//                        object 55 (kActionActivate, :68; AACT 0x13009) and sends the idle's event to the LEVER's holder slot 1
//                        (0x140269e36 to 0x140269e55); no camera, no occupant, no sit (HYPOTHESIS)
//   40486  0x736b90  (h) the player's furniture use on the branch without that keyword (0x140269dd6: (activator, furniture)): a
//                        created package (29496 with 6) on the player through Actor slot 0xDF, PutCreatedPackage (Actor.h:421);
//                        bytes 48 8b c4 57 48 81 ec 80. Expected never for the lever (HYPOTHESIS)
//   24602  0x3b1f80  (h) the idle tree's pick for an action (the earlier re-analyst's name in the Ghidra project,
//                        IdleTree_FindIdleForAction_FillsActionOutput_24602): RCX the idle roots *(400451), RDX a BGSActionData;
//                        writes ActionOutput.animEvent and animObjIdle; callers 37147 and TESFurniture::Activate alone (Ghidra
//                        xrefs); bytes 48 8b c4 48 89 70 20 57
//   32901  0x54c450  (h) IAnimationGraphManagerHolder::NotifyAnimationGraph, the function in slot 1 (IAnimationGraphManagerHolder.h:
//                        25) of VTABLE_TESObjectREFR[3] 190265 (0x17ae6c8, Offsets_VTABLE.h:649), checked live; RCX the holder
//                        (a reference's at +0x38, TESObjectREFR.h:112), RDX a const BSFixedString&; bytes 40 57 48 83 ec 30 48 c7
//   38048  0x6a35f0  (r) the actor holders' slot 1 (VTABLE_Actor[3] 207517, VTABLE_Character[3] 207892, VTABLE_PlayerCharacter[3]
//                        208046, checked live): a thunk, JMP 0x14054c450 (bytes e9 5b 8e ea ff cc cc cc), the fork's
//                        Offsets::Hooks::SendAnimation (game/Offsets.h:43-44). HYPOTHESIS H-LF6: the platform's Gum attach there
//                        follows the jump (frida-gum gum_interceptor_resolve and gum_x86_reader_try_get_relative_jump_target), so
//                        the platform's animation hook sits on 32901 and sees every holder's events, a world object's included
//   20102  0x2f6580  (h) TESObjectREFR's BSTEventSink<BSAnimationGraphEvent>::ProcessEvent, slot 1 (BSTEvent.h:146) of
//                        VTABLE_TESObjectREFR[2] 190263 (0x17ae6b0), checked live: RCX the sink at the reference's +0x30
//                        (TESObjectREFR.h:111), RDX the event (tag +0x00, holder +0x08, payload +0x10, BSAnimationGraphEvent.h:
//                        13-15): the lever graph's own events back, the push's timing; bytes 48 8b c4 55 57 41 56 48
//   104651 0x143dc00 (h) BSScript::NF_util::NativeFunctionBase::Call (NativeFunctionBase.h:47, slot 0x0F; the fork's
//                        NativeFunctionCall, game/Offsets.h:37-38), replaced by the platform's seam (an e9 there): RCX the native,
//                        RDX a BSTSmartPointer<Stack>& whose one member is the Stack*; bytes 4c 89 44 24 18 55 56 57
//   401069 0x3137698 (r) TESFurniture::Activate's activator compare target; checked against *(403521)
//   403521 0x31874f8 (r) PlayerCharacter's singleton, CommonLib Offsets.h:451
//   403449 0x31872c0 (r) Main's singleton, CommonLib Offsets.h:383; threadID at +0x28 (Main.h:87)
//   186869 0x1771470 (r) VTABLE_ExtraFlags (Offsets_VTABLE.h:174), to find a reference's ExtraFlags in its extra list
// Layouts (CommonLibSSE-NG b93280e8, AE): TESForm formID +0x14, formType +0x1A (TESForm.h:354, :356); FormType FURN 0x28, ACHR
// 0x3E (FormTypes.h:180, :202); a reference's base at +0x40 (TESObjectREFR.h:495, OBJ_REFR's objectReference first, :77); its
// extraList at +0x70 (:498), whose BaseExtraList head sits at +0x08 on AE (ExtraDataList.h:41-44), each BSExtraData's next at
// +0x08 (BSExtraData.h:32), ExtraFlags' flags at +0x10 (ExtraFlags.h:32); an actor's actorState1 at +0xC8 (ActorState at +0xC0,
// Actor.h:737; actorState1 +0x08, ActorState.h:203), sitSleepState its bits 14 to 17 (ActorState.h:112); currentProcess at +0xF8
// (Actor.h:651 in the runtime data at 0xE8, :712), AIProcess.middleHigh +0x08 (AIProcess.h:196), MiddleHighProcessData's
// occupiedFurniture +0x208 and furnitureIdle +0x228 (MiddleHighProcessData.h:172, :178); BGSActionData: ActionInput source +0x08,
// action +0x18 (ActionInput.h:23, :25), ActionOutput at +0x28 (BGSActionData.h:10): animEvent +0x28, targetAnimEvent +0x30,
// sequence +0x40, animObjIdle +0x48 (ActionOutput.h:15-19); a BSFixedString's one member is its characters (BSFixedString.h:232);
// Stack.top +0x60 (Stack.h:76); StackFrame previousFrame +0x08, owningFunction +0x10, owningObjectType +0x18, self +0x28 (a
// Variable), size +0x38, the arguments from +0x40 in 0x10 steps (StackFrame.h:22-33, the fork's port patch uncommenting args);
// Variable varType +0x00 (raw: 0 none, 2 string, 3 int, 4 float, 5 bool, 10 to 15 arrays, 16 and up an ObjectTypeInfo* with bit 0
// set for an object array), value +0x08 (Variable.h:93-94); ObjectTypeInfo name +0x08 (ObjectTypeInfo.h:177); a ScriptFunction's
// and a native's name +0x10, class +0x18 (ScriptFunction.h:45-46, NativeFunctionBase.h:62-63); Object.handle +0x20 (Object.h:46),
// a plain form's id its low 32 bits (HYPOTHESIS, docs/research/adr065-papyrus-state-2026-11-03.md Q1).
//
// Rows, each to console.log and send() (lab-api's preamble keeps console.log), every one with t (ms), seq, tid and main (true on
// Main's thread):
//   {ready}: pid, module base, each hook's address, live first bytes and Ghidra's, the vtable slot checks, *(401069) against the
//     player, Main's thread id, the watched references; read the pid against the run's c<N>-skyrim-platform-pid<N>.log first
//   {fn: 'activateRef'} / {fn: 'activateRef:leave'}: a watched reference activated: the activator (id, type), arg2, the object,
//     count, defaultOnly (a_defaultProcessingOnly), blocked (its kBlockActivate, null when unread), caller; the leave's ret
//   {fn: 'furnitureActivate'} / {fn: 'furnitureActivate:leave'}: TESFurniture::Activate on a watched reference: the activator,
//     the base, the activator's sitSleepState, occupiedFurniture handle and furnitureIdle before and after, ret, a backtrace
//     (bt) and a FUZZY walk of 16 frames (fuzzy)
//   {fn: 'playerFurnitureUse'}: 40486 for a watched furniture (expected none)
//   {fn: 'idle'}: the idle lookup for a watched source: the action, then at the leave animEvent, targetAnimEvent, the idle's form
//     id and the return
//   {fn: 'notify'}: NotifyAnimationGraph to a watched reference or to an actor (rules below): the event, ret, the windows open on
//     the thread (`in`), caller, and a backtrace (bt) and a FUZZY walk of 16 frames (fuzzy) for a watched reference's row;
//     H-LF4 is read from notify's `in` naming a native whose caller is SkyrimPlatformImpl.dll
//   {fn: 'graphEvent'}: the watched reference's graph event back to it (tag, payload, holder)
//   {fn: 'native'}: a native whose self is a watched reference, or whose calling script is one of SCRIPTS: Class.Name, self, the
//     first arguments, the calling script and function (`from`), caller (a SkyrimPlatformImpl.dll caller is the platform's own call,
//     under CallNativeApi.cpp:151's Override for a non-latent one)
//   {fn: 'liveness'} every 10 s: each hook's calls before its filter, kernel32!Sleep's count (the Interceptor's pulse), rows so far,
//     and the actor events seen outside the windows since the last liveness row, counted by "<actor> <event>"
// Actor rows: an event to the player or a figure is printed inside a window (a watched reference's activateRef,
// furnitureActivate or native extent open on that thread) or within WINDOW_MS of the last watched row on any thread, and always
// when its name matches INTERESTING (furniture and lever words); otherwise counted for the liveness row (ACTOR_ROWS 'all' prints
// every one, 'none' none).
// LAB_PARAMS: refs (default [0xaa8c3]), scripts (['defaultPillarPuzzleLever']), actorRows ('window'), windowMs (6000), cap (5000
// rows), bt (true), natives (true). Run as a probe's `frida {script: lever-furn-trace.js}` on each seat, 8 s apart, 15 s before the
// first pull (a script goes ready late). Expected on the puller (the static read): activateRef (activator 0x14, defaultOnly 0,
// blocked 1) ret 0; then, after the server's reply, a native ObjectReference.Activate on the lever with a SkyrimPlatformImpl.dll
// caller and activateRef (0x14, defaultOnly 1) inside it, furnitureActivate (0x14) inside that, idle (action 0x13009) answering
// 'Lever_PlayerPush' with idle 0x4dfea, notify on the lever 'Lever_PlayerPush' inside furnitureActivate with ret 1, its leave ret 1,
// the player's sitSleepState 0 throughout, no playerFurnitureUse, then graphEvent rows over the push. On the watcher: activateRef
// (activator the puller's figure, defaultOnly 0, blocked 1) ret 0 under a native Activate from SkyrimPlatformImpl.dll, no
// furnitureActivate, no notify on the lever, no furniture event on the figure. 1.6.1170 only.
'use strict';
function emit(obj) { obj.t = Date.now(); send(obj); console.log(JSON.stringify(obj)); }

const OFFSETS = {
  '1.6.1170.0': {
    activateRef: 0x2eac20, // 19796
    furnitureActivate: 0x269c00, // 17420
    playerFurnitureUse: 0x736b90, // 40486
    idleForAction: 0x3b1f80, // 24602
    notifyGraph: 0x54c450, // 32901
    refrGraphSink: 0x2f6580, // 20102
    nativeCall: 0x143dc00, // 104651
    actorNotifyThunk: 0x6a35f0, // 38048, read only
    activatorCompare: 0x3137698, // 401069, read only
    playerSingleton: 0x31874f8, // 403521, read only
    mainSingleton: 0x31872c0, // 403449, read only
    vtFurniture0: 0x17983c0, // 189309, read only
    vtRefrSink: 0x17ae6b0, // 190263, read only
    vtRefrHolder: 0x17ae6c8, // 190265, read only
    vtActorHolder: 0x189e1e8, // 207517, read only
    vtCharacterHolder: 0x18a5ee0, // 207892, read only
    vtPlayerHolder: 0x18ac370, // 208046, read only
    vtExtraFlags: 0x1771470, // 186869, read only
  },
};
const GHIDRA_BYTES = {
  activateRef: '48 8b c4 4c 89 48 20 44',
  furnitureActivate: '48 8b c4 57 48 81 ec b0',
  playerFurnitureUse: '48 8b c4 57 48 81 ec 80',
  idleForAction: '48 8b c4 48 89 70 20 57',
  notifyGraph: '40 57 48 83 ec 30 48 c7',
  refrGraphSink: '48 8b c4 55 57 41 56 48',
  nativeCall: '4c 89 44 24 18 55 56 57',
  actorNotifyThunk: 'e9 5b 8e ea ff cc cc cc',
};
const FORM_ID = 0x14; // TESForm.h:354
const FORM_TYPE = 0x1a; // TESForm.h:356
const REFR_BASE = 0x40; // TESObjectREFR.h:495, :77
const REFR_SINK = 0x30; // TESObjectREFR.h:111
const REFR_HOLDER = 0x38; // TESObjectREFR.h:112
const REFR_EXTRA_HEAD = 0x78; // TESObjectREFR.h:498 (0x70) plus ExtraDataList.h:44 (0x08 on AE)
const EXTRA_NEXT = 0x08; // BSExtraData.h:32
const EXTRA_FLAGS_WORD = 0x10; // ExtraFlags.h:32
const ACTOR_STATE1 = 0xc8; // Actor.h:737, ActorState.h:203
const SIT_SHIFT = 14; // ActorState.h:112
const ACTOR_PROCESS = 0xf8; // Actor.h:651, :712
const PROCESS_MIDHIGH = 0x08; // AIProcess.h:196
const MH_OCCUPIED = 0x208; // MiddleHighProcessData.h:172
const MH_FURN_IDLE = 0x228; // MiddleHighProcessData.h:178
const ACTION_SOURCE = 0x08; // ActionInput.h:23
const ACTION_ACTION = 0x18; // ActionInput.h:25
const OUT_EVENT = 0x28; // BGSActionData.h:10, ActionOutput.h:15
const OUT_TARGET_EVENT = 0x30; // ActionOutput.h:16
const OUT_SEQUENCE = 0x40; // ActionOutput.h:18
const OUT_IDLE = 0x48; // ActionOutput.h:19
const EVENT_TAG = 0x00; // BSAnimationGraphEvent.h:13
const EVENT_HOLDER = 0x08; // BSAnimationGraphEvent.h:14
const EVENT_PAYLOAD = 0x10; // BSAnimationGraphEvent.h:15
const NF_NAME = 0x10; // NativeFunctionBase.h:62
const NF_CLASS = 0x18; // NativeFunctionBase.h:63
const STACK_TOP = 0x60; // Stack.h:76
const FRAME_PREVIOUS = 0x08; // StackFrame.h:22
const FRAME_FUNCTION = 0x10; // StackFrame.h:23
const FRAME_TYPE = 0x18; // StackFrame.h:24
const FRAME_SELF = 0x28; // StackFrame.h:27
const FRAME_SIZE = 0x38; // StackFrame.h:28
const FRAME_ARGS = 0x40; // StackFrame.h:33 (the port patch)
const VARIABLE_SIZE = 0x10; // Variable.h:93-94
const TYPE_NAME = 0x08; // ObjectTypeInfo.h:177
const FUNCTION_NAME = 0x10; // ScriptFunction.h:45
const OBJECT_HANDLE = 0x20; // Object.h:46
const MAIN_THREAD_ID = 0x28; // Main.h:87
const ACHR = 0x3e; // FormTypes.h:202
const PLAYER_ID = 0x14;
const FIGURE_MIN = 0xff000000;
const SLOT_FURN_ACTIVATE = 0x37; // TESFurniture.h:125
const SLOT_NOTIFY = 0x01; // IAnimationGraphManagerHolder.h:25
const SLOT_PROCESS_EVENT = 0x01; // BSTEvent.h:146
const INTERESTING = /lever|furniture|chair|idlesit|sitting|idlebed|sleep|objectactivated/i;
const ARGS_SHOWN = 3;
const TALLY_KEYS_MAX = 500;

const P = (typeof LAB_PARAMS !== 'undefined' && LAB_PARAMS) || {};
const WATCHED = new Set((Array.isArray(P.refs) ? P.refs : [0xaa8c3]).map(function (x) { return x >>> 0; }));
const SCRIPTS = (Array.isArray(P.scripts) ? P.scripts : ['defaultPillarPuzzleLever']).map(function (x) { return String(x).toLowerCase(); });
const ACTOR_ROWS = typeof P.actorRows === 'string' ? P.actorRows : 'window';
const WINDOW_MS = typeof P.windowMs === 'number' ? P.windowMs : 6000;
const ROW_CAP = typeof P.cap === 'number' ? P.cap : 5000;
const WANT_BT = P.bt !== false;
const WANT_NATIVES = P.natives !== false;

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

function hex(n) { return '0x' + (n >>> 0).toString(16); }

function bytesAt(p) {
  try {
    return Array.from(new Uint8Array(p.readByteArray(8))).map(function (b) { return ('0' + b.toString(16)).slice(-2); }).join(' ');
  } catch (e) {
    return 'unreadable';
  }
}

const failed = {};
function fail(fn, e) {
  if (failed[fn]) return;
  failed[fn] = true;
  emit({ fn: fn, err: String(e) });
}

const exe = Process.getModuleByName('SkyrimSE.exe');
function where(p) {
  try {
    if (p.compare(exe.base) >= 0 && p.compare(exe.base.add(exe.size)) < 0) return 'SkyrimSE.exe+0x' + p.sub(exe.base).toString(16);
    const m = Process.findModuleByAddress(p);
    return m ? m.name + '+0x' + p.sub(m.base).toString(16) : p.toString();
  } catch (e) {
    return p.toString();
  }
}

// a short backtrace: ACCURATE first; FUZZY when it answers fewer than two frames (a hook entered through another Gum
// instance's trampoline starts from a page with no unwind data, H-LF6's case on 32901), the walk named in the row
function frames(context) {
  if (!WANT_BT) return undefined;
  let bt = [];
  let how = 'accurate';
  try { bt = Thread.backtrace(context, Backtracer.ACCURATE); } catch (e) { bt = []; }
  if (bt.length < 2) {
    how = 'fuzzy';
    try { bt = Thread.backtrace(context, Backtracer.FUZZY); } catch (e) { return ['backtrace: ' + e]; }
  }
  return [how].concat(bt.slice(0, 8).map(where));
}

// a BSFixedString's characters through its one member ('' when empty, null when unreadable)
function fixedString(p) {
  try {
    const chars = p.readPointer();
    return chars.isNull() ? '' : chars.readCString();
  } catch (e) {
    return null;
  }
}

// a form's id and type, or null
function formOf(p) {
  try {
    if (p.isNull()) return null;
    return { id: p.add(FORM_ID).readU32() >>> 0, type: p.add(FORM_TYPE).readU8() };
  } catch (e) {
    return null;
  }
}

function idOf(p) {
  const f = formOf(p);
  return f === null ? null : hex(f.id);
}

// an actor's furniture facts: sitSleepState (actorState1 bits 14 to 17), the process's occupiedFurniture handle and furnitureIdle
function furnitureFacts(actor) {
  const out = { sit: null, occupied: null, furnitureIdle: null };
  try {
    const f = formOf(actor);
    if (f === null || f.type !== ACHR) return out;
    out.sit = (actor.add(ACTOR_STATE1).readU32() >>> SIT_SHIFT) & 0xf;
    const proc = actor.add(ACTOR_PROCESS).readPointer();
    if (proc.isNull()) return out;
    const mh = proc.add(PROCESS_MIDHIGH).readPointer();
    if (mh.isNull()) return out;
    out.occupied = hex(mh.add(MH_OCCUPIED).readU32());
    out.furnitureIdle = idOf(mh.add(MH_FURN_IDLE).readPointer());
  } catch (e) { /* the read stays partial */ }
  return out;
}

let vtExtraFlags = NULL;
// a reference's kBlockActivate (1 or 0), null when the walk fails; read without the list's lock, bounded
function blocked(refr) {
  try {
    let x = refr.add(REFR_EXTRA_HEAD).readPointer();
    for (let i = 0; i < 64 && !x.isNull(); i++) {
      if (x.readPointer().equals(vtExtraFlags)) return x.add(EXTRA_FLAGS_WORD).readU32() & 1;
      x = x.add(EXTRA_NEXT).readPointer();
    }
    return 0;
  } catch (e) {
    return null;
  }
}

// a Variable's value as a short string or number ('?' when unreadable)
const MASK32 = uint64('0xffffffff');
function variableValue(v) {
  try {
    const raw = v.readU64();
    if (raw.compare(uint64(16)) >= 0) {
      if (raw.and(uint64(1)).toNumber() !== 0) return 'object-array';
      const obj = v.add(8).readPointer();
      if (obj.isNull()) return 'None';
      return hex(obj.add(OBJECT_HANDLE).readU64().and(MASK32).toNumber());
    }
    const n = raw.toNumber();
    if (n === 0 || n === 1) return 'None';
    if (n === 2) return fixedString(v.add(8));
    if (n === 3) return v.add(8).readS32();
    if (n === 4) return v.add(8).readFloat();
    if (n === 5) return v.add(8).readU8() !== 0;
    if (n >= 10 && n <= 15) return 'array';
    return 'type' + n;
  } catch (e) {
    return '?';
  }
}

// an object Variable's form id (the handle's low 32 bits), null for none or another type
function variableFormId(v) {
  try {
    const raw = v.readU64();
    if (raw.compare(uint64(16)) < 0 || raw.and(uint64(1)).toNumber() !== 0) return null;
    const obj = v.add(8).readPointer();
    if (obj.isNull()) return null;
    return obj.add(OBJECT_HANDLE).readU64().and(MASK32).toNumber() >>> 0;
  } catch (e) {
    return null;
  }
}

// a script class (ObjectTypeInfo*) is one of SCRIPTS, cached by pointer
const scriptOfType = new Map();
function typeName(t) {
  return t.isNull() ? null : fixedString(t.add(TYPE_NAME));
}
function isWatchedScript(t) {
  if (t.isNull()) return false;
  const k = t.toString();
  let v = scriptOfType.get(k);
  if (v === undefined) {
    const n = typeName(t);
    v = n !== null && SCRIPTS.indexOf(n.toLowerCase()) >= 0;
    if (scriptOfType.size < 4096) scriptOfType.set(k, v);
  }
  return v;
}

let seq = 0;
let rows = 0;
let capSaid = false;
let lastWatchedMs = 0;
let mainTid = 0;
function emitRow(row) {
  if (rows >= ROW_CAP) {
    if (!capSaid) {
      capSaid = true;
      emit({ fn: 'cap', rows: rows, note: 'the row cap; counts go on in the liveness rows' });
    }
    return;
  }
  rows++;
  row.main = mainTid !== 0 && row.tid === mainTid;
  emit(row);
}

// the windows open on a thread: a watched reference's activateRef, furnitureActivate or native extent
const openWindows = new Map();
function pushWindow(tid, name) {
  let list = openWindows.get(tid);
  if (list === undefined) { list = []; openWindows.set(tid, list); }
  list.push(name);
}
function popWindow(tid, name) {
  const list = openWindows.get(tid);
  if (list === undefined) return;
  const i = list.lastIndexOf(name);
  if (i >= 0) list.splice(i, 1);
  if (list.length === 0) openWindows.delete(tid);
}
function windowsOn(tid) {
  const list = openWindows.get(tid);
  return list === undefined ? [] : list.slice();
}

const actorTally = {};
let tallyKeys = 0;
function tally(key) {
  if (actorTally[key] === undefined) {
    if (tallyKeys >= TALLY_KEYS_MAX) { actorTally['(other)'] = (actorTally['(other)'] || 0) + 1; return; }
    tallyKeys++;
    actorTally[key] = 0;
  }
  actorTally[key]++;
}

const version = fileVersion(exe.path);
const at = OFFSETS[version];
if (at === undefined) {
  emit({ error: 'no offsets for this runtime', version: version });
} else {
  vtExtraFlags = exe.base.add(at.vtExtraFlags);
  const counts = {};
  const resolved = {};
  let hooks = 0;
  // every live first byte read before any attach of this script
  for (const name of Object.keys(GHIDRA_BYTES)) {
    resolved[name] = { at: exe.base.add(at[name]).toString(), bytes: bytesAt(exe.base.add(at[name])), ghidra: GHIDRA_BYTES[name] };
  }
  const slot = function (vt, index) {
    try { return exe.base.add(vt).add(index * Process.pointerSize).readPointer(); } catch (e) { return NULL; }
  };
  const vtables = {
    furnitureActivateSlot: slot(at.vtFurniture0, SLOT_FURN_ACTIVATE).equals(exe.base.add(at.furnitureActivate)),
    refrHolderNotifySlot: slot(at.vtRefrHolder, SLOT_NOTIFY).equals(exe.base.add(at.notifyGraph)),
    actorHolderNotifySlot: slot(at.vtActorHolder, SLOT_NOTIFY).equals(exe.base.add(at.actorNotifyThunk)),
    characterHolderNotifySlot: slot(at.vtCharacterHolder, SLOT_NOTIFY).equals(exe.base.add(at.actorNotifyThunk)),
    playerHolderNotifySlot: slot(at.vtPlayerHolder, SLOT_NOTIFY).equals(exe.base.add(at.actorNotifyThunk)),
    refrSinkProcessEventSlot: slot(at.vtRefrSink, SLOT_PROCESS_EVENT).equals(exe.base.add(at.refrGraphSink)),
  };
  let compare = null;
  try {
    const a = exe.base.add(at.activatorCompare).readPointer();
    const b = exe.base.add(at.playerSingleton).readPointer();
    compare = { activatorCompare: a.toString(), player: b.toString(), equal: a.equals(b), playerId: idOf(b) };
  } catch (e) { compare = { err: String(e) }; }
  try {
    const m = exe.base.add(at.mainSingleton).readPointer();
    mainTid = m.isNull() ? 0 : m.add(MAIN_THREAD_ID).readU32();
  } catch (e) { mainTid = 0; }

  const attach = function (name, handlers) {
    counts[name] = 0;
    try {
      const callbacks = {
        onEnter: function (args) {
          counts[name]++;
          try { handlers.enter.call(this, args); } catch (e) { fail(name, e); }
        },
      };
      if (handlers.leave) {
        callbacks.onLeave = function (retval) {
          try { handlers.leave.call(this, retval); } catch (e) { fail(name + ':leave', e); }
        };
      }
      Interceptor.attach(exe.base.add(at[name]), callbacks);
      hooks++;
    } catch (e) { fail('attach:' + name, e); }
  };
  try {
    const sleep = Process.getModuleByName('kernel32.dll').getExportByName('Sleep');
    counts.sleep = 0;
    Interceptor.attach(sleep, { onEnter: function () { counts.sleep++; } });
    resolved.sleep = { at: sleep.toString() };
  } catch (e) { fail('attach:sleep', e); }

  // ActivateRef on a watched reference: who, how, blocked or not
  attach('activateRef', {
    enter: function (args) {
      this.row = 0;
      const self = formOf(args[0]);
      if (self === null || !WATCHED.has(self.id)) return;
      const actor = formOf(args[1]);
      this.row = ++seq;
      this.win = 'activateRef#' + this.row;
      lastWatchedMs = Date.now();
      emitRow({
        fn: 'activateRef', seq: this.row, tid: this.threadId, ref: hex(self.id),
        activator: actor === null ? null : hex(actor.id), activatorType: actor === null ? null : actor.type,
        arg2: args[2].toInt32() & 0xff, object: idOf(args[3]), count: args[4].toInt32(), defaultOnly: args[5].toInt32() & 0xff,
        blocked: blocked(args[0]), in: windowsOn(this.threadId), caller: where(this.returnAddress),
      });
      pushWindow(this.threadId, this.win);
    },
    leave: function (retval) {
      if (!this.row) return;
      popWindow(this.threadId, this.win);
      emitRow({ fn: 'activateRef:leave', seq: this.row, tid: this.threadId, ret: retval.toInt32() & 0xff });
    },
  });

  // TESFurniture::Activate on a watched reference: the furniture path's entry and exit
  attach('furnitureActivate', {
    enter: function (args) {
      this.row = 0;
      const target = formOf(args[1]);
      if (target === null || !WATCHED.has(target.id)) return;
      const actor = formOf(args[2]);
      this.row = ++seq;
      this.win = 'furnitureActivate#' + this.row;
      this.actor = args[2];
      lastWatchedMs = Date.now();
      emitRow({
        fn: 'furnitureActivate', seq: this.row, tid: this.threadId, ref: hex(target.id), base: idOf(args[0]),
        activator: actor === null ? null : hex(actor.id), activatorType: actor === null ? null : actor.type,
        arg3: args[3].toInt32() & 0xff, object: idOf(args[4]), count: args[5].toInt32(),
        before: furnitureFacts(args[2]), in: windowsOn(this.threadId), caller: where(this.returnAddress), bt: frames(this.context),
        fuzzy: Thread.backtrace(this.context, Backtracer.FUZZY).slice(0, 16).map(where),
      });
      pushWindow(this.threadId, this.win);
    },
    leave: function (retval) {
      if (!this.row) return;
      popWindow(this.threadId, this.win);
      lastWatchedMs = Date.now();
      emitRow({ fn: 'furnitureActivate:leave', seq: this.row, tid: this.threadId, ret: retval.toInt32() & 0xff, after: furnitureFacts(this.actor) });
    },
  });

  // the player's furniture use (the branch the NoPlayer keyword skips): expected never for a watched furniture
  attach('playerFurnitureUse', {
    enter: function (args) {
      const furniture = formOf(args[1]);
      if (furniture === null || !WATCHED.has(furniture.id)) return;
      lastWatchedMs = Date.now();
      emitRow({
        fn: 'playerFurnitureUse', seq: ++seq, tid: this.threadId, ref: hex(furniture.id), actor: idOf(args[0]),
        in: windowsOn(this.threadId), caller: where(this.returnAddress), bt: frames(this.context),
        fuzzy: Thread.backtrace(this.context, Backtracer.FUZZY).slice(0, 16).map(where),
      });
    },
  });

  // the idle the engine picks for an action whose source is a watched reference
  attach('idleForAction', {
    enter: function (args) {
      this.row = 0;
      const data = args[1];
      if (data.isNull()) return;
      const source = formOf(data.add(ACTION_SOURCE).readPointer());
      if (source === null || !WATCHED.has(source.id)) return;
      this.row = ++seq;
      this.data = data;
      this.source = hex(source.id);
      this.action = idOf(data.add(ACTION_ACTION).readPointer());
      this.in = windowsOn(this.threadId);
      this.caller = where(this.returnAddress);
    },
    leave: function (retval) {
      if (!this.row) return;
      lastWatchedMs = Date.now();
      emitRow({
        fn: 'idle', seq: this.row, tid: this.threadId, source: this.source, action: this.action,
        animEvent: fixedString(this.data.add(OUT_EVENT)), targetAnimEvent: fixedString(this.data.add(OUT_TARGET_EVENT)),
        animObjIdle: idOf(this.data.add(OUT_IDLE).readPointer()), sequence: idOf(this.data.add(OUT_SEQUENCE).readPointer()),
        ret: idOf(retval), in: this.in, caller: this.caller,
      });
    },
  });

  // every graph event to a watched reference, and the actors' by the rules above
  attach('notifyGraph', {
    enter: function (args) {
      this.row = null;
      const holder = args[0];
      if (holder.isNull()) return;
      const refr = holder.sub(REFR_HOLDER);
      const f = formOf(refr);
      if (f === null) return;
      const watched = WATCHED.has(f.id);
      const actor = f.type === ACHR && (f.id === PLAYER_ID || f.id >= FIGURE_MIN);
      if (!watched && !actor) return;
      const event = fixedString(args[1]);
      const tid = this.threadId;
      const inWin = windowsOn(tid);
      const interesting = event !== null && INTERESTING.test(event);
      if (!watched) {
        const live = ACTOR_ROWS === 'all' || interesting ||
          (ACTOR_ROWS === 'window' && (inWin.length > 0 || Date.now() - lastWatchedMs <= WINDOW_MS));
        if (!live || ACTOR_ROWS === 'none' && !interesting) {
          tally(hex(f.id) + ' ' + event);
          return;
        }
      } else {
        lastWatchedMs = Date.now();
      }
      this.row = {
        fn: 'notify', seq: ++seq, tid: tid, ref: hex(f.id), type: f.type, event: event, watched: watched, interesting: interesting,
        in: inWin, caller: where(this.returnAddress),
      };
      if (watched) {
        this.row.bt = frames(this.context);
        this.row.fuzzy = Thread.backtrace(this.context, Backtracer.FUZZY).slice(0, 16).map(where);
      }
      if (actor) this.row.furniture = furnitureFacts(refr);
      this.t0 = Date.now();
    },
    leave: function (retval) {
      if (this.row === null) return;
      this.row.ret = retval.toInt32() & 0xff;
      this.row.enteredAt = this.t0;
      emitRow(this.row);
    },
  });

  // the watched reference's graph events back to it, the push's timing
  attach('refrGraphSink', {
    enter: function (args) {
      const refr = args[0].sub(REFR_SINK);
      const f = formOf(refr);
      if (f === null || !WATCHED.has(f.id)) return;
      const ev = args[1];
      lastWatchedMs = Date.now();
      emitRow({
        fn: 'graphEvent', seq: ++seq, tid: this.threadId, ref: hex(f.id), tag: fixedString(ev.add(EVENT_TAG)),
        payload: fixedString(ev.add(EVENT_PAYLOAD)), holder: idOf(ev.add(EVENT_HOLDER).readPointer()), in: windowsOn(this.threadId),
      });
    },
  });

  // the natives: a watched reference's own, and the watched scripts' calls on anything
  if (WANT_NATIVES) {
    attach('nativeCall', {
      enter: function (args) {
        this.win = null;
        const stack = args[1].readPointer();
        if (stack.isNull()) return;
        const top = stack.add(STACK_TOP).readPointer();
        if (top.isNull()) return;
        const selfId = variableFormId(top.add(FRAME_SELF));
        const watchedSelf = selfId !== null && WATCHED.has(selfId);
        let prev = NULL;
        let byScript = false;
        try {
          prev = top.add(FRAME_PREVIOUS).readPointer();
          byScript = !prev.isNull() && isWatchedScript(prev.add(FRAME_TYPE).readPointer());
        } catch (e) { prev = NULL; }
        if (!watchedSelf && !byScript) return;
        const fnObj = args[0];
        const name = fixedString(fnObj.add(NF_CLASS)) + '.' + fixedString(fnObj.add(NF_NAME));
        let size = 0;
        try { size = top.add(FRAME_SIZE).readU32(); } catch (e) { size = 0; }
        const shown = [];
        for (let i = 0; i < Math.min(size, ARGS_SHOWN); i++) shown.push(variableValue(top.add(FRAME_ARGS + i * VARIABLE_SIZE)));
        let from = null;
        if (!prev.isNull()) {
          try {
            const fn = prev.add(FRAME_FUNCTION).readPointer();
            from = typeName(prev.add(FRAME_TYPE).readPointer()) + '.' + (fn.isNull() ? '?' : fixedString(fn.add(FUNCTION_NAME)));
          } catch (e) { from = '?'; }
        }
        const row = ++seq;
        lastWatchedMs = Date.now();
        emitRow({
          fn: 'native', seq: row, tid: this.threadId, native: name, self: selfId === null ? null : hex(selfId), args: shown,
          argCount: size, from: from, in: windowsOn(this.threadId), caller: where(this.returnAddress),
        });
        if (watchedSelf) {
          this.win = 'native#' + row;
          pushWindow(this.threadId, this.win);
        }
      },
      leave: function () {
        if (this.win !== null) popWindow(this.threadId, this.win);
      },
    });
  }

  emit({
    ready: true, version: version, pid: Process.id, base: exe.base.toString(), hooks: hooks, resolved: resolved, vtables: vtables,
    activatorCompare: compare, mainTid: mainTid, watched: Array.from(WATCHED).map(hex), scripts: SCRIPTS, actorRows: ACTOR_ROWS,
    windowMs: WINDOW_MS, cap: ROW_CAP,
  });
  setInterval(function () {
    const top = Object.keys(actorTally).sort(function (a, b) { return actorTally[b] - actorTally[a]; }).slice(0, 30);
    const outside = {};
    for (const k of top) outside[k] = actorTally[k];
    emit({ fn: 'liveness', counts: Object.assign({}, counts), rows: rows, seq: seq, actorEventsOutsideWindows: outside, distinct: tallyKeys });
    for (const k of Object.keys(actorTally)) delete actorTally[k];
    tallyKeys = 0;
  }, 10000);
}
