// trigger-entry-trace.js v1 (r50 reads, 2026-11-07; ADR-068's D-W1 A and D-C2 A, the engine read ADR-064 amendment B asks
// before the build). ONE QUESTION, on one seat: does the engine deliver OnTriggerEnter and OnTriggerLeave to a trigger's
// scripts, and with which actionRef, for each kind of presser (the seat's own player, another seat's figure, an NPC this seat
// renders as a puppet, an NPC this seat simulates, a body), and does Skyrim Platform's script gate blank the event before a
// script hears it? Nothing in the game changes: the hooks read memory and call no engine function; the timer only reports.
// The static read is lab/.cache/drafts/fifty/trigger-entry-static.md; every Ghidra-derived fact below is HYPOTHESIS until a
// row of this trace reads it. Ids by `just addr` (Address Library 1.6.1170, 2026-11-07); layouts CommonLibSSE-NG b93280e8.
// The path:
//   SkyrimVM's BSTEventSink<TESTriggerEnterEvent> (include/RE/S/SkyrimVM.h:130, the subobject at +0x160; its vtable is
//   VTABLE_SkyrimVM[44], 217143 0x19129f0, Offsets_VTABLE.h:4307; slot 01 ProcessEvent, BSTEvent.h:146) gets the event (+0x00
//   the trigger's reference, +0x08 the actionRef: Ghidra FUN_1409c8850 at 0x1409c88c0 and 0x1409c88e8), builds
//   `anonymous namespace'::SingleObjectRefrHandleArgument on its stack (vtable 217161 0x1912b00, Offsets_VTABLE.h:4309; RTTI
//   397003 0x20aeca0, Offsets_RTTI.h:4775; +0x08 the actionRef with its refcount raised, +0x10 the VM) and calls the VM's
//   SendEvent (IVirtualMachine.h:89, slot 0x24; 104800 0x14477f0) with the trigger's handle, then SkyrimVM::RelayEvent
//   (Offsets.h:487; 54033 0x9cb910) with the same name and arguments for the trigger's aliases. The Leave sink is :131, +0x168,
//   VTABLE_SkyrimVM[45], 217145 0x1912a08 (FUN_1409c89f0), the same shape. SendEvent, which Skyrim Platform's gate hooks
//   (skyrim-platform FridaHooks.cpp OnSendEventEnter), copies the handle's attached objects under attachedScriptsLock
//   (VirtualMachine.h:219-220) and calls DispatchMethodCall1 (IVirtualMachine.h:92, slot 0x27; 104804 0x14480d0) for each with
//   the name it was given; that finds the handler in the object's state and only then calls the arguments' packer
//   (IFunctionArguments.h:20, slot 01) into a BSScrapArray<Variable> (Ghidra 0x1414477f0 and 0x1414480d0).
// The hooks (each address and its first eight bytes in the ready row):
//   SendEvent: the event name (R8, a BSFixedString whose first member is its chars, BSFixedString.h:232), filtered in the hook
//     to OnTriggerEnter and OnTriggerLeave (any case, Papyrus's rule), or any name inside an open trigger sink whose arguments
//     carry that sink's actionRef; the handle (RDX) and the arguments (R9). Attached beside the platform's own Gum hook it runs
//     first (sendevent-rate.js's reading), so the name it sees is the engine's, before the gate. The actionRef is read from the
//     arguments' own member at +0x08, and only when their vtable is SingleObjectRefrHandleArgument's; the packer is never
//     called from here: for a reference with no bound object it creates and binds one (FUN_1409d21e0's BindObject), which
//     would change the VM, and its array lives on a scrap heap the caller must free.
//   DispatchMethodCall1, inside an open SendEvent window on the same thread with the same arguments: the script object (RDX, a
//     BSTSmartPointer<Object>&, BSTSmartPointer.h:229), its class (Object.h:43, ObjectTypeInfo.h:177), its state (Object.h:44)
//     and the NAME IT IS GIVEN (R8): the gate blanks by gum_invocation_context_replace_nth_argument(ic, 2, <an empty string>)
//     (FridaHooks.cpp), so '' here is the gate's blank and the event's own name here is the event passed.
//   The packer, SingleObjectRefrHandleArgument's slot 01 read from its vtable, inside the same window: the VM's own pack, read
//     at its leave (the array's data +0x08 and size +0x18, BSTArray.h:368 and :47 after the 0x18-byte allocator, :371 and
//     :375-376; Variable[0]'s type +0x00 and value +0x08, Variable.h:93-94; a class pointer as an object's type, TypeInfo.h:30-31;
//     the Object's handle +0x20, Object.h:46): what the script receives as akActionRef.
//   The two sinks: the event as the engine raised it, so each SendEvent row names the sink it came from.
// Read once at the ready row, no hook: the VM's vtable (252631 0x1aa0b48, Offsets_VTABLE.h:7067) slots 0x24 and 0x27 against
// SendEvent and DispatchMethodCall1; the arguments' vtable's locator (vtable[-1], RTTI.h:118-122) against RTTI 397003 and its
// type name (RTTI.h:19); each sink vtable's locator offset against 0x160 and 0x168; Main's thread (403449, Offsets.h:383; threadID
// +0x28, Main.h:87); and bhkCollisionFilter's triggerField (400562 0x20fc180, bhkCollisionFilter.h:16 and :37), the 64-bit mask
// of the collision layers (CollisionLayers.h) a collidable must be on before TESTrapListener's overlap callback makes it a
// TriggerEntry (FUN_140400c50 tests the collidable's layer, hkpCollidable.h:54 and :72, against it).
// The actionRef as read (refInfo): form id (TESForm.h:354), form type (:356; 0x3e an actor, 0x3d an object, FormTypes.h:201-202),
// base (TESObjectREFR.h:495, :77), cell (:496), position (data.location, :495 and :79) and, for an actor, its life state
// (ActorState at +0xC0 on 1.6.629 and later, Actor.h:737; actorState1 at +0x08, ActorState.h:203; four bits at bit 21, :114;
// 0 alive, 1 dying, 2 dead and the rest, :7-18; 9 is SetDontMove's hold, no CommonLib name, docs/verbs/npc-talk.md's read).
// Rows, each to console.log and send() (lab-api's preamble keeps console.log), each with t (this seat's clock, ms) and tid:
//   {ready}: pid, base, every hook's address and first eight bytes (SendEvent's are the platform's own jump), the checks,
//     Main's thread, triggerField and its layer names. Read the pid against the run's c<N>-skyrim-platform-pid<N>.log first.
//   {fn: 'sink'}: seq, event, main (Main's thread), trigger and actionRef (refInfo).
//   {fn: 'sendEvent'}: seq, event, name (as this hook saw it), handle, kind, mid, recv (the handle's low 32 bits: a plain form's
//     id, HYPOTHESIS, checked against the sink's trigger and the dispatch's object), sink (the sink row's seq on this thread,
//     null outside one), relay (true for a send whose receiver is not the sink's trigger: RelayEvent's), args (the class),
//     actionRef (refInfo) or why it was not read.
//   {fn: 'dispatch'}: seq, type, state, recv, name (as given, after the gate), blanked, packed, result.
//   {fn: 'pack'}: seq, cls, size, arg0 (its type, the object's class, handle and formId), agree (formId against the direct read).
//   {fn: 'sendEvent:leave'}: seq, verdict: 'passed' (a script's handler packed it), 'passed, no handler' (the name reached the
//     objects, none had the event in its state), 'blanked' (the gate's empty name), 'no script' (no object on the handle).
//   {fn: 'liveness'} every 10 s: every hook's count before its filter, a kernel32!Sleep pulse, emptyNames (empty names this
//     hook saw at SendEvent: above 0 with the block on says it runs AFTER the gate, and a blanked event is then found by its
//     sink window alone), rows and dropped, and a summary per receiver (enters, leaves, by actionRef, by verdict).
// LAB_PARAMS: {max: rows before the cap (6000), others: hook another argument class's packer the first time a trigger event
// carries one (true; up to 8, the platform's own SendScriptEvent class among them; that first event's pack is missed)}.
// Run on both seats as a probe's `frida {script: trigger-entry-trace.js}` step, 15 s or more before the first trigger it must
// see (a script goes ready late); the reading is the probe's (lab/.cache/drafts/fifty/x-trigger-entry.yaml). 1.6.1170 only.
'use strict';
function emit(obj) { obj.t = Date.now(); send(obj); console.log(JSON.stringify(obj)); }

const OFFSETS = {
  '1.6.1170.0': {
    sendEvent: 0x14477f0, // 104800
    dispatchMethodCall1: 0x14480d0, // 104804
    vmVtable: 0x1aa0b48, // 252631, VTABLE_BSScript__Internal__VirtualMachine[0]
    argVtable: 0x1912b00, // 217161, VTABLE___SingleObjectRefrHandleArgument
    argRtti: 0x20aeca0, // 397003, RTTI___SingleObjectRefrHandleArgument
    enterSinkVtable: 0x19129f0, // 217143, VTABLE_SkyrimVM[44]
    leaveSinkVtable: 0x1912a08, // 217145, VTABLE_SkyrimVM[45]
    filterSingleton: 0x20fc180, // 400562, bhkCollisionFilter* (data, not hooked)
    mainSingleton: 0x31872c0, // 403449, Main* (data, not hooked)
  },
};
const VM_SLOT_SENDEVENT = 0x24; // IVirtualMachine.h:89
const VM_SLOT_DISPATCH = 0x27; // IVirtualMachine.h:92
const ARGS_SLOT_PACK = 0x01; // IFunctionArguments.h:20
const SINK_SLOT_PROCESS = 0x01; // BSTEvent.h:146
const ENTER_SINK_OFFSET = 0x160; // SkyrimVM.h:130
const LEAVE_SINK_OFFSET = 0x168; // SkyrimVM.h:131
const COL_SIGNATURE = 0x00; // RTTI.h:118
const COL_OFFSET = 0x04; // RTTI.h:119
const COL_TYPE_DESCRIPTOR = 0x0c; // RTTI.h:121
const TD_NAME = 0x10; // RTTI.h:19
const FORM_ID = 0x14; // TESForm.h:354
const FORM_TYPE = 0x1a; // TESForm.h:356
const FORM_TYPE_REFR = 0x3d; // FormTypes.h:201
const FORM_TYPE_ACHR = 0x3e; // FormTypes.h:202
const REFR_BASE = 0x40; // TESObjectREFR.h:495 (data) and :77 (objectReference)
const REFR_LOCATION = 0x54; // TESObjectREFR.h:495 (data at 0x40) and :79 (location at 0x14)
const REFR_CELL = 0x60; // TESObjectREFR.h:496
const ACTOR_STATE1 = 0xc8; // Actor.h:737 (ActorState at 0xC0) and ActorState.h:203 (actorState1 at 0x08)
const LIFE_SHIFT = 21; // ActorState.h:114
const EVENT_TRIGGER = 0x00; // the sink's MOV R8,[R14] at 0x1409c88c0 (HYPOTHESIS)
const EVENT_ACTION_REF = 0x08; // the sink's MOV RCX,[R14+0x8] at 0x1409c88e8 (HYPOTHESIS)
const ARG_ACTION_REF = 0x08; // stored at [RSP+0x40] beside the vtable at [RSP+0x38], 0x1409c88e3 to 0x1409c88fa (HYPOTHESIS)
const ARRAY_DATA = 0x08; // BSTArray.h:368
const ARRAY_SIZE = 0x18; // BSTArray.h:47, after the 0x18-byte BSScrapArrayAllocator (:371, :375-376)
const VAR_TYPE = 0x00; // Variable.h:93
const VAR_VALUE = 0x08; // Variable.h:94
const OBJECT_TYPE = 0x08; // Object.h:43
const OBJECT_STATE = 0x10; // Object.h:44
const OBJECT_HANDLE = 0x20; // Object.h:46
const TYPE_NAME = 0x08; // ObjectTypeInfo.h:177
const FILTER_TRIGGER_FIELD = 0x3d0; // bhkCollisionFilter.h:37
const MAIN_THREAD_ID = 0x28; // Main.h:87
const RAW_TYPES = { 0: 'None', 1: 'Object', 2: 'String', 3: 'Int', 4: 'Float', 5: 'Bool', 10: 'NoneArray', 11: 'ObjectArray',
  12: 'StringArray', 13: 'IntArray', 14: 'FloatArray', 15: 'BoolArray' }; // TypeInfo.h:14-26
const LIFE_STATES = ['alive', 'dying', 'dead', 'unconscious', 'reanimate', 'recycle', 'restrained', 'essentialDown',
  'bleedout']; // ActorState.h:9-17
const LAYERS = ['Unidentified', 'Static', 'AnimStatic', 'Transparent', 'Clutter', 'Weapon', 'Projectile', 'Spell', 'Biped',
  'Trees', 'Props', 'Water', 'Trigger', 'Terrain', 'Trap', 'NonCollidable', 'CloudTrap', 'Ground', 'Portal', 'DebrisSmall',
  'DebrisLarge', 'AcousticSpace', 'ActorZone', 'ProjectileZone', 'GasTrap', 'ShellCasting', 'TransparentWall', 'InvisibleWall',
  'TransparentSmallAnim', 'ClutterLarge', 'CharController', 'StairHelper', 'DeadBip', 'BipedNoCC', 'AvoidBox', 'CollisionBox',
  'CameraSphere', 'DoorDetection', 'ConeProjectile', 'Camera', 'ItemPicker', 'LOS', 'PathingPick', 'Unused0', 'Unused1',
  'SpellExplosion', 'DroppingPick']; // CollisionLayers.h:7-53, kUnidentified 0 to kDroppingPick 46
const TRIGGER_EVENTS = { ontriggerenter: 'OnTriggerEnter', ontriggerleave: 'OnTriggerLeave' };
const P = (typeof LAB_PARAMS !== 'undefined' && LAB_PARAMS) || {};
const MAX_ROWS = (typeof P.max === 'number' && P.max > 0) ? P.max : 6000;
const HOOK_OTHERS = P.others !== false;
const OTHERS_MAX = 8;
const MASK32 = uint64('0xffffffff');
const MASK16 = uint64('0xffff');

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

function hex(n) { return (n === null || n === undefined) ? null : '0x' + (n >>> 0).toString(16); }

function readable(p) {
  if (p.isNull()) return false;
  const r = Process.findRangeByAddress(p);
  return r !== null && r.protection.indexOf('r') === 0;
}

function bytesAt(p) {
  try {
    return readable(p) ? Array.from(new Uint8Array(p.readByteArray(8))).map(function (b) { return ('0' + b.toString(16)).slice(-2); }).join(' ') : 'unreadable';
  } catch (e) {
    return 'unreadable';
  }
}

// a BSFixedString's chars through its first member: '' for an empty one, null when unreadable
function chars(p) {
  try {
    const c = p.readPointer();
    return c.isNull() ? '' : c.readCString();
  } catch (e) {
    return null;
  }
}

// an Object's class name through its type (null when unreadable)
function typeName(obj) {
  try {
    const type = obj.add(OBJECT_TYPE).readPointer();
    return type.isNull() ? null : chars(type.add(TYPE_NAME));
  } catch (e) {
    return null;
  }
}

// a VMHandle's parts as script-save-trace.js reads them (HYPOTHESIS, the read of HandlePolicy 53508): kind bits 48 to 63, mid
// bits 32 to 47 (0xFFFF a plain form), the low 32 bits a plain form's id
function handleParts(h) {
  return { handle: '0x' + h.toString(16), kind: h.shr(48).toNumber(), mid: h.shr(32).and(MASK16).toNumber(), low: h.and(MASK32).toNumber() >>> 0 };
}

function whoOf(id, ft) {
  if (id === 0x14) return 'own player';
  if (ft !== FORM_TYPE_ACHR) return 'object';
  if ((id >>> 24) === 0xff) return 'runtime actor (a figure or a server-made copy)';
  return 'game-file actor';
}

// a reference as the engine holds it: never a call, every read guarded
function refInfo(p) {
  if (p === null || p.isNull()) return { id: null, why: 'None (a null reference)' };
  const out = { id: null };
  try {
    const id = p.add(FORM_ID).readU32();
    const ft = p.add(FORM_TYPE).readU8();
    out.id = hex(id);
    out.type = ft === FORM_TYPE_ACHR ? 'ACHR' : (ft === FORM_TYPE_REFR ? 'REFR' : hex(ft));
    out.who = whoOf(id, ft);
    const base = p.add(REFR_BASE).readPointer();
    out.base = base.isNull() ? null : hex(base.add(FORM_ID).readU32());
    const cell = p.add(REFR_CELL).readPointer();
    out.cell = cell.isNull() ? null : hex(cell.add(FORM_ID).readU32());
    const loc = p.add(REFR_LOCATION);
    out.pos = [loc.readFloat(), loc.add(4).readFloat(), loc.add(8).readFloat()].map(function (v) { return Math.round(v * 10) / 10; });
    if (ft === FORM_TYPE_ACHR) {
      const life = (p.add(ACTOR_STATE1).readU32() >>> LIFE_SHIFT) & 0xf;
      out.life = life;
      out.lifeName = life < LIFE_STATES.length ? LIFE_STATES[life] : (life === 9 ? 'held (SetDontMove)' : 'unnamed');
    }
  } catch (e) {
    out.why = 'unreadable: ' + e;
  }
  return out;
}

// the RTTI type name a vtable's locator names (RTTI.h:118-122 and :19), resolved against the module that holds the vtable
function rttiName(vt) {
  try {
    const col = vt.sub(Process.pointerSize).readPointer();
    if (col.add(COL_SIGNATURE).readU32() !== 1) return null;
    const mod = Process.findModuleByAddress(vt);
    if (mod === null) return null;
    return mod.base.add(col.add(COL_TYPE_DESCRIPTOR).readU32()).add(TD_NAME).readCString();
  } catch (e) {
    return null;
  }
}

// Variable[0] of a packed array: its raw type (a class pointer for an object, bit 0 an array, TypeInfo.h:30-31) and value
function variableInfo(v) {
  const out = {};
  try {
    const raw = v.add(VAR_TYPE).readU64();
    const value = v.add(VAR_VALUE).readPointer();
    const rawN = raw.compare(uint64(16)) < 0 ? raw.toNumber() : -1;
    if (rawN >= 0) {
      out.type = RAW_TYPES[rawN] || ('raw ' + rawN);
      if (rawN === 0 || rawN === 1) out.formId = null;
      return out;
    }
    const isArray = raw.and(uint64(1)).toNumber() === 1;
    const cls = new NativePointer('0x' + raw.and(uint64('0xfffffffffffffffe')).toString(16));
    out.type = (isArray ? 'array of ' : '') + chars(cls.add(TYPE_NAME));
    if (isArray) return out;
    if (value.isNull()) {
      out.formId = null;
      out.why = 'None (an object variable with no object)';
      return out;
    }
    out.object = typeName(value);
    const parts = handleParts(value.add(OBJECT_HANDLE).readU64());
    out.handle = parts.handle;
    out.formId = hex(parts.low);
  } catch (e) {
    out.why = 'unreadable: ' + e;
  }
  return out;
}

const exe = Process.getModuleByName('SkyrimSE.exe');
const version = fileVersion(exe.path);
const at = OFFSETS[version];
if (at === undefined) {
  emit({ error: 'no offsets for this runtime', version: version });
} else {
  const BASE = exe.base;
  const BASE64 = uint64(BASE.toString());
  const rva = function (p) {
    const v = uint64(p.toString());
    return v.compare(BASE64) >= 0 ? '0x' + v.sub(BASE64).toString(16) : p.toString();
  };
  let rows = 0;
  let dropped = 0;
  let seq = 0;
  const failed = {};
  const counts = { sendEvent: 0, sendEventTrigger: 0, emptyNames: 0, dispatch: 0, dispatchInWindow: 0, pack: 0, packInWindow: 0,
    enterSink: 0, leaveSink: 0, sleep: 0, otherPack: 0 };
  const summary = {};
  const sinkWin = {}; // tid -> the open sink's window
  const seStack = {}; // tid -> the open SendEvent windows, innermost last
  const resolved = {};
  const checks = {};
  const otherClasses = {}; // a packer address -> its class, for argument classes other than SingleObjectRefrHandleArgument
  let mainThread = 0;

  const row = function (obj) {
    if (rows >= MAX_ROWS) {
      dropped++;
      if (dropped === 1) emit({ fn: 'cap', rows: rows, note: 'row cap reached: only liveness rows from here (LAB_PARAMS.max)' });
      return;
    }
    rows++;
    emit(obj);
  };
  const fail = function (where, e) {
    if (failed[where]) return;
    failed[where] = true;
    emit({ fn: 'err', where: where, err: String(e) });
  };
  const readMainThread = function () {
    try {
      const main = BASE.add(at.mainSingleton).readPointer();
      return main.isNull() ? 0 : main.add(MAIN_THREAD_ID).readU32();
    } catch (e) {
      return -1;
    }
  };
  const isMain = function (tid) {
    if (mainThread <= 0) mainThread = readMainThread();
    return mainThread > 0 ? tid === mainThread : null;
  };
  const tally = function (recvId, event, actionId, verdict) {
    const s = (summary[recvId] = summary[recvId] || { OnTriggerEnter: 0, OnTriggerLeave: 0, actors: {}, verdicts: {} });
    if (s[event] !== undefined) s[event]++;
    if (actionId !== null && actionId !== undefined) s.actors[actionId] = (s.actors[actionId] || 0) + 1;
    if (verdict) s.verdicts[verdict] = (s.verdicts[verdict] || 0) + 1;
  };

  // the checks, before any hook
  const argVt = BASE.add(at.argVtable);
  const vmVt = BASE.add(at.vmVtable);
  try {
    checks.vmSendEvent = vmVt.add(VM_SLOT_SENDEVENT * Process.pointerSize).readPointer().equals(BASE.add(at.sendEvent));
    checks.vmDispatch = vmVt.add(VM_SLOT_DISPATCH * Process.pointerSize).readPointer().equals(BASE.add(at.dispatchMethodCall1));
  } catch (e) { fail('check:vm', e); }
  let argOk = false;
  try {
    const col = argVt.sub(Process.pointerSize).readPointer();
    checks.argColSignature = col.add(COL_SIGNATURE).readU32();
    checks.argRtti = col.add(COL_TYPE_DESCRIPTOR).readU32() === at.argRtti;
    checks.argClass = rttiName(argVt);
    argOk = checks.argColSignature === 1 && checks.argRtti;
  } catch (e) { fail('check:args', e); }
  const sinkOk = function (vtRva, want, key) {
    try {
      const vt = BASE.add(vtRva);
      const col = vt.sub(Process.pointerSize).readPointer();
      checks[key] = col.add(COL_OFFSET).readU32();
      return col.add(COL_SIGNATURE).readU32() === 1 && checks[key] === want;
    } catch (e) {
      fail('check:' + key, e);
      return false;
    }
  };
  const enterOk = sinkOk(at.enterSinkVtable, ENTER_SINK_OFFSET, 'enterSinkCol');
  const leaveOk = sinkOk(at.leaveSinkVtable, LEAVE_SINK_OFFSET, 'leaveSinkCol');
  let triggerField = null;
  let triggerLayers = null;
  try {
    const filter = BASE.add(at.filterSingleton).readPointer();
    if (!filter.isNull()) {
      const f = filter.add(FILTER_TRIGGER_FIELD).readU64();
      triggerField = '0x' + f.toString(16);
      triggerLayers = [];
      for (let i = 0; i < 64; i++) {
        if (f.shr(i).and(uint64(1)).toNumber() === 1) triggerLayers.push(i < LAYERS.length ? LAYERS[i] + ' ' + i : 'layer ' + i);
      }
    }
  } catch (e) { fail('check:triggerField', e); }
  mainThread = readMainThread();

  let hooks = 0;
  const attach = function (name, target, handlers) {
    counts[name] = counts[name] || 0;
    try {
      resolved[name] = { at: target.toString(), rva: rva(target), bytes: bytesAt(target) };
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
      Interceptor.attach(target, callbacks);
      hooks++;
      return true;
    } catch (e) {
      fail('attach:' + name, e);
      return false;
    }
  };
  try {
    const sleep = Process.getModuleByName('kernel32.dll').getExportByName('Sleep');
    Interceptor.attach(sleep, { onEnter: function () { counts.sleep++; } });
    resolved.sleep = { at: sleep.toString() };
  } catch (e) { fail('attach:sleep', e); }

  // the class of an arguments object: SingleObjectRefrHandleArgument's by its vtable, else its vtable and RTTI name
  const argClassOf = function (a) {
    try {
      const vt = a.readPointer();
      if (vt.equals(argVt)) return { ours: true, cls: 'SingleObjectRefrHandleArgument', vt: vt };
      return { ours: false, cls: rttiName(vt) || ('vtable ' + rva(vt)), vt: vt };
    } catch (e) {
      return { ours: false, cls: 'unreadable: ' + e, vt: null };
    }
  };

  // the packed array at a packer's leave, for the innermost window that owns the arguments
  const packEnter = function (args) {
    this.w = null;
    const st = seStack[this.threadId];
    if (st === undefined || st.length === 0) return;
    const w = st[st.length - 1];
    if (!args[0].equals(w.args)) return;
    counts.packInWindow++;
    this.w = w;
    this.dst = args[1];
  };
  const packLeave = function (cls) {
    return function (retval) {
      const w = this.w;
      if (!w) return;
      w.packs++;
      if (w.current) w.current.packed = true;
      const data = this.dst.add(ARRAY_DATA).readPointer();
      const size = this.dst.add(ARRAY_SIZE).readU32();
      const arg0 = (!data.isNull() && size > 0) ? variableInfo(data) : { why: 'an empty array' };
      const agree = (w.actionId === null || arg0.formId === undefined) ? null : arg0.formId === w.actionId;
      row({ fn: 'pack', seq: w.seq, tid: this.threadId, cls: cls, size: size, ok: retval.toUInt32() & 0xff, arg0: arg0, agree: agree });
    };
  };
  const hookOtherPacker = function (info) {
    if (!HOOK_OTHERS || info.vt === null) return;
    try {
      const fn = info.vt.add(ARGS_SLOT_PACK * Process.pointerSize).readPointer();
      const key = fn.toString();
      if (otherClasses[key] !== undefined || Object.keys(otherClasses).length >= OTHERS_MAX) return;
      otherClasses[key] = info.cls;
      // attached from Frida's own thread, never from inside the listener that found it
      setTimeout(function () {
        attach('otherPack:' + info.cls, fn, {
          enter: function (args) { counts.otherPack++; packEnter.call(this, args); },
          leave: packLeave(info.cls),
        });
        emit({ fn: 'otherPacker', cls: info.cls, at: fn.toString(), rva: rva(fn) });
      }, 0);
    } catch (e) { fail('otherPacker', e); }
  };

  // SendEvent: the engine's name, before the gate
  attach('sendEvent', BASE.add(at.sendEvent), {
    enter: function (args) {
      this.w = null;
      const tid = this.threadId;
      const name = chars(args[2]);
      if (name === '') counts.emptyNames++;
      let event = name === null ? null : (TRIGGER_EVENTS[name.toLowerCase()] || null);
      const sw = sinkWin[tid];
      const a = args[3];
      let info = null;
      let viaSink = false;
      if (event !== null || sw !== undefined) {
        info = a.isNull() ? { ours: false, cls: 'null arguments', vt: null } : argClassOf(a);
        if (sw !== undefined && info.ours && a.add(ARG_ACTION_REF).readPointer().equals(sw.action)) viaSink = true;
      }
      if (event === null && !viaSink) return;
      if (event === null) event = sw.event;
      counts.sendEventTrigger++;
      const parts = handleParts(uint64(args[1].toString()));
      let actionRef = null;
      let why = null;
      if (info.ours && argOk) {
        actionRef = refInfo(a.add(ARG_ACTION_REF).readPointer());
      } else if (info.ours) {
        why = 'the arguments vtable check failed at the ready row: not read';
      } else {
        why = 'arguments of ' + info.cls + ', not the engine trigger argument: read from its pack row, if hooked';
        hookOtherPacker(info);
      }
      const w = { seq: ++seq, args: a, event: event, recvId: hex(parts.low), actionId: actionRef ? actionRef.id : null,
        dispatches: [], packs: 0, current: null };
      const st = (seStack[tid] = seStack[tid] || []);
      st.push(w);
      this.w = w;
      const sinkSeq = sw !== undefined && viaSink ? sw.seq : null;
      row({ fn: 'sendEvent', seq: w.seq, tid: tid, main: isMain(tid), event: event, name: name, handle: parts.handle,
        kind: parts.kind, mid: parts.mid, recv: hex(parts.low), sink: sinkSeq,
        relay: sinkSeq === null ? null : hex(parts.low) !== sw.triggerId, args: info.cls, actionRef: actionRef, why: why });
    },
    leave: function () {
      const w = this.w;
      if (!w) return;
      const st = seStack[this.threadId];
      if (st && st.length && st[st.length - 1] === w) st.pop();
      const blanked = w.dispatches.filter(function (d) { return d.blanked; }).length;
      const packed = w.dispatches.filter(function (d) { return d.packed; }).length;
      let verdict;
      if (w.dispatches.length === 0) verdict = 'no script';
      else if (blanked > 0) verdict = 'blanked';
      else if (packed > 0 || w.packs > 0) verdict = 'passed';
      else verdict = 'passed, no handler';
      tally(w.recvId, w.event, w.actionId, verdict);
      row({ fn: 'sendEvent:leave', seq: w.seq, tid: this.threadId, verdict: verdict, dispatched: w.dispatches.length,
        blanked: blanked, packed: packed, packs: w.packs });
    },
  });

  // DispatchMethodCall1: the name each attached object is given, after the gate
  if (checks.vmDispatch) {
    attach('dispatch', BASE.add(at.dispatchMethodCall1), {
      enter: function (args) {
        this.d = null;
        const st = seStack[this.threadId];
        if (st === undefined || st.length === 0) return;
        const w = st[st.length - 1];
        if (!args[3].equals(w.args)) return;
        counts.dispatchInWindow++;
        const obj = args[1].readPointer();
        const name = chars(args[2]);
        const d = { type: obj.isNull() ? null : typeName(obj), state: obj.isNull() ? null : chars(obj.add(OBJECT_STATE)),
          recv: obj.isNull() ? null : hex(handleParts(obj.add(OBJECT_HANDLE).readU64()).low), name: name,
          blanked: name === '', packed: false };
        w.dispatches.push(d);
        w.current = d;
        this.w = w;
        this.d = d;
      },
      leave: function (retval) {
        const d = this.d;
        if (!d) return;
        this.w.current = null;
        row({ fn: 'dispatch', seq: this.w.seq, tid: this.threadId, type: d.type, state: d.state, recv: d.recv, name: d.name,
          blanked: d.blanked, packed: d.packed, result: retval.toUInt32() & 0xff });
      },
    });
  }

  // the engine's own packer of the trigger argument
  if (argOk) {
    try {
      const packer = argVt.add(ARGS_SLOT_PACK * Process.pointerSize).readPointer();
      attach('pack', packer, { enter: packEnter, leave: packLeave('SingleObjectRefrHandleArgument') });
    } catch (e) { fail('attach:pack', e); }
  }

  // the two sinks: the event as raised
  const sinkHook = function (name, event, vtRva) {
    try {
      const fn = BASE.add(vtRva).add(SINK_SLOT_PROCESS * Process.pointerSize).readPointer();
      attach(name, fn, {
        enter: function (args) {
          const tid = this.threadId;
          const ev = args[1];
          const trigger = ev.add(EVENT_TRIGGER).readPointer();
          const action = ev.add(EVENT_ACTION_REF).readPointer();
          const triggerInfo = refInfo(trigger);
          const w = { seq: ++seq, event: event, action: action, triggerId: triggerInfo.id };
          this.prev = sinkWin[tid];
          this.mine = true;
          sinkWin[tid] = w;
          row({ fn: 'sink', seq: w.seq, tid: tid, main: isMain(tid), event: event, trigger: triggerInfo, actionRef: refInfo(action) });
        },
        leave: function () {
          if (!this.mine) return;
          const tid = this.threadId;
          if (this.prev === undefined) delete sinkWin[tid];
          else sinkWin[tid] = this.prev;
        },
      });
    } catch (e) { fail('attach:' + name, e); }
  };
  if (enterOk) sinkHook('enterSink', 'OnTriggerEnter', at.enterSinkVtable);
  if (leaveOk) sinkHook('leaveSink', 'OnTriggerLeave', at.leaveSinkVtable);

  emit({ ready: true, version: version, pid: Process.id, base: BASE.toString(), hooks: hooks, mainThread: mainThread,
    checks: checks, argOk: argOk, enterSinkOk: enterOk, leaveSinkOk: leaveOk, triggerField: triggerField,
    triggerLayers: triggerLayers, max: MAX_ROWS, others: HOOK_OTHERS, resolved: resolved });
  setInterval(function () {
    emit({ fn: 'liveness', pid: Process.id, counts: JSON.parse(JSON.stringify(counts)), rows: rows, dropped: dropped,
      summary: JSON.parse(JSON.stringify(summary)) });
  }, 10000);
}
