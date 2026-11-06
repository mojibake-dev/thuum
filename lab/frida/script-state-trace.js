// script-state-trace.js v1 (thuum-cf, rung 3's lab layer, 2026-11-06): ADR-068 rung 3's script record on the seat that applies it
// (docs/research/rung3-script-record-2026-11-06.md section 5), for two of its hypotheses and one timing, every fact HYPOTHESIS until
// this trace reads it:
//   H-R3: writing an Object's currentState directly, as ApplyScriptState does (Object.h:44), runs no state event: no
//         DispatchMethodCall1 row named onBeginState, onEndState or GotoState for a watched form between the apply's log lines;
//   H-R6: a kind-0 handle in a record resolves on the applying seat through FindBoundObject (the pillars' myLinkedRef, the lever
//         0xaa8c3, class defaultPillarPuzzleLever), and a handle of kind 1 or 2 never reaches it from the apply (the native writes
//         None for those);
//   H-R7: the engine's load events (OnCellAttach, OnLoad, OnCellLoad) to a watched form, timed against the record's arrival line
//         on a late joiner (SendEvent's rows; the platform's "blanked: its script record pending" lines are the other half).
// Ids by `just addr` (Address Library 1.6.1170, 2026-11-06), each slot's role and signature from CommonLibSSE-NG b93280e8's
// include/RE/I/IVirtualMachine.h, the slot addresses matched to these ids by docs/research/adr065-papyrus-state-2026-11-03.md's id
// table (the VM's vtable read slot by slot):
//   104804 (0x14480d0) Internal::VirtualMachine::DispatchMethodCall1 (IVirtualMachine.h:92, slot 0x27): RCX the VM, RDX a
//          BSTSmartPointer<Object>& (its first member the Object*, BSTSmartPointer.h:229), R8 a const BSFixedString& (the
//          function's name), R9 the arguments; returns bool. SendEvent dispatches each attached object's handler through it (the
//          adr065 read, HYPOTHESIS), so an OnActivate or OnCellLoad row on a watched form is the hook's own positive control; a
//          script's own GotoState inside a stack is a callmethod, which does not pass this slot (HYPOTHESIS), so a turn's GotoState
//          shows no row either: the trace sees a state event only when native code dispatches one, the case H-R3 asks about.
//   104792 (0x1446700) ::FindBoundObject (IVirtualMachine.h:81, slot 0x1C): RCX the VM, RDX the VMHandle, R8 a const char* class
//          name, R9 a BSTSmartPointer<Object>& the result; returns bool.
//   104800 (0x14477f0) ::SendEvent (IVirtualMachine.h:89, slot 0x24; sendevent-rate.js's and lamp-shot-trace.js's reading): RCX the
//          VM, RDX the VMHandle, R8 a const BSFixedString& (the event's name), R9 the arguments.
// A VMHandle's parts as script-save-trace.js reads them: kind bits 48 to 63, mid bits 32 to 47 (0xFFFF a plain form), the low 32
// bits a plain form's id (HYPOTHESIS, the read of HandlePolicy 53508). Layouts from CommonLibSSE-NG b93280e8: Object
// (include/RE/O/Object.h:39-49): type +0x08 (a BSTSmartPointer<ObjectTypeInfo>), currentState +0x10, handle +0x20;
// ObjectTypeInfo's name +0x08 (ObjectTypeInfo.h:177); a BSFixedString's first member is its char pointer (BSFixedString.h:232).
// Rows, each to console.log and send() (lab-api's preamble keeps console.log): {ready} once, with the process id, the module base
// and each hook's resolved address and first eight bytes (read the pid against the run's c<N>-skyrim-platform-pid<N>.log before any
// row); {fn: 'dispatch'} and {fn: 'dispatch:leave'} per DispatchMethodCall1 on a watched form (its type, the function's name, the
// object's state, stateEvent true for onBeginState, onEndState or GotoState, then the result); {fn: 'findBound'} and
// {fn: 'findBound:leave'} per FindBoundObject on a watched form or a watched class, and per lookup of a kind-1 or kind-2 handle
// (the first 100), with the result and the found object's type; {fn: 'sendEvent'} per SendEvent to a watched form; {fn:
// 'liveness'} every 10 s with every hook's call count before its filter, a kernel32!Sleep count as the Interceptor's pulse, and the
// summary (per watched form the dispatched names and the sent events with their counts, the lookups by handle kind). Nothing in the
// game changes and nothing polls: the rows come from the hooks, the timer only reports.
// LAB_PARAMS {forms: [ids], types: [names]} replace the watched forms (default the Temple's pillars 0xaa8cb, 0xaa8cc and 0xaa8cd and
// the lever 0xaa8c3) and classes (default defaultPillarPuzzleLever and defaultPuzzlePillarScript). Run as a probe's `frida {script:
// script-state-trace.js}` step on the seat that applies the record, 15 s before the apply (a script goes ready late). Reading it:
// H-R3 holds when no stateEvent row for a watched form falls between the apply's two log lines on that seat's clock (the rows' t
// against the console's ISO stamps, one clock) while dispatch rows for the same forms appear elsewhere in the run; H-R6 holds when
// the apply's window carries a findBound row for 0xaa8c3, class defaultPillarPuzzleLever, with result 1, and no kind-1 or kind-2
// lookup. 1.6.1170 only.
'use strict';
function emit(obj) { obj.t = Date.now(); send(obj); console.log(JSON.stringify(obj)); }

const OFFSETS = {
  '1.6.1170.0': {
    dispatchMethodCall1: 0x14480d0, // 104804
    findBoundObject: 0x1446700, // 104792
    sendEvent: 0x14477f0, // 104800
  },
};
const OBJECT_TYPE = 0x08; // Object.h:43
const OBJECT_STATE = 0x10; // Object.h:44
const OBJECT_HANDLE = 0x20; // Object.h:46
const TYPE_NAME = 0x08; // ObjectTypeInfo.h:177
const KIND_ROWS_MAX = 100;
const P = (typeof LAB_PARAMS !== 'undefined' && LAB_PARAMS) || {};
const WATCHED = (Array.isArray(P.forms) ? P.forms : [0xaa8cb, 0xaa8cc, 0xaa8cd, 0xaa8c3]).map(function (x) { return x >>> 0; });
const TYPES = (Array.isArray(P.types) ? P.types : ['defaultPillarPuzzleLever', 'defaultPuzzlePillarScript']).map(function (x) { return String(x).toLowerCase(); });
const STATE_EVENTS = ['onbeginstate', 'onendstate', 'gotostate'];
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

function hex(n) { return '0x' + (n >>> 0).toString(16); }

function readable(p) {
  if (p.isNull()) return false;
  const r = Process.findRangeByAddress(p);
  return r !== null && r.protection.indexOf('r') === 0;
}

const failed = {};
function fail(fn, e) {
  if (failed[fn]) return;
  failed[fn] = true;
  emit({ fn: fn, err: String(e) });
}

// a BSFixedString's chars through its first member, '' for an empty one, null when unreadable (read inside a try: no
// address-space walk on the hot paths, script-save-trace.js v2's lesson)
function fixedString(p) {
  try {
    const chars = p.readPointer();
    return chars.isNull() ? '' : chars.readCString();
  } catch (e) {
    return null;
  }
}

// a handle's parts: kind (bits 48 to 63), mid (bits 32 to 47), low (a plain form's id)
function parts(h) {
  return { kind: h.shr(48).toNumber(), mid: h.shr(32).and(MASK16).toNumber(), low: h.and(MASK32).toNumber() >>> 0 };
}

// an Object's class name through its type (null when unreadable)
function typeName(obj) {
  try {
    const type = obj.add(OBJECT_TYPE).readPointer();
    return type.isNull() ? null : fixedString(type.add(TYPE_NAME));
  } catch (e) {
    return null;
  }
}

function isWatched(low) { return WATCHED.indexOf(low) >= 0; }

const summary = { dispatch: {}, stateEvents: 0, findBound: { byKind: {}, watched: 0, kindRows: 0 }, sendEvent: {} };
function tally(table, ref, name) {
  const row = (table[ref] = table[ref] || {});
  row[name] = (row[name] || 0) + 1;
}

const exe = Process.getModuleByName('SkyrimSE.exe');
const version = fileVersion(exe.path);
const at = OFFSETS[version];
if (at === undefined) {
  emit({ error: 'no offsets for this runtime', version: version });
} else {
  let hooks = 0;
  let seq = 0;
  const counts = {};
  const resolved = {};
  const attach = function (name, offset, handlers) {
    counts[name] = 0;
    try {
      const target = exe.base.add(offset);
      resolved[name] = {
        at: target.toString(),
        bytes: readable(target) ? Array.from(new Uint8Array(target.readByteArray(8))).map(function (b) { return ('0' + b.toString(16)).slice(-2); }).join(' ') : 'unreadable',
      };
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
    } catch (e) { fail('attach:' + name, e); }
  };
  try {
    const sleep = Process.getModuleByName('kernel32.dll').getExportByName('Sleep');
    counts.sleep = 0;
    Interceptor.attach(sleep, { onEnter: function () { counts.sleep++; } });
    resolved.sleep = { at: sleep.toString() };
  } catch (e) { fail('attach:sleep', e); }

  // H-R3: every dispatch on a watched form, by name; a state event among them is the falsifier
  attach('dispatchMethodCall1', at.dispatchMethodCall1, {
    enter: function (args) {
      this.row = 0;
      const obj = args[1].readPointer();
      if (obj.isNull()) return;
      const h = parts(obj.add(OBJECT_HANDLE).readU64());
      if (!isWatched(h.low)) return;
      const ref = hex(h.low);
      const name = fixedString(args[2]);
      const stateEvent = name !== null && STATE_EVENTS.indexOf(name.toLowerCase()) >= 0;
      if (stateEvent) summary.stateEvents++;
      tally(summary.dispatch, ref, name === null ? '?' : name);
      this.row = ++seq;
      this.ref = ref;
      emit({ fn: 'dispatch', seq: this.row, tid: Process.getCurrentThreadId(), ref: ref, kind: h.kind, mid: h.mid, type: typeName(obj),
        name: name, state: fixedString(obj.add(OBJECT_STATE)), stateEvent: stateEvent });
    },
    leave: function (retval) {
      if (!this.row) return;
      emit({ fn: 'dispatch:leave', seq: this.row, tid: Process.getCurrentThreadId(), ref: this.ref, result: retval.toUInt32() & 0xff });
    },
  });

  // H-R6: a lookup of a watched form or class, and of any kind-1 or kind-2 handle, with what it found
  attach('findBoundObject', at.findBoundObject, {
    enter: function (args) {
      this.row = 0;
      const h = parts(uint64(args[1].toString()));
      summary.findBound.byKind[String(h.kind)] = (summary.findBound.byKind[String(h.kind)] || 0) + 1;
      let cls = null;
      try { cls = args[2].isNull() ? null : args[2].readCString(); } catch (e) { cls = null; }
      const watched = isWatched(h.low) || (cls !== null && TYPES.indexOf(cls.toLowerCase()) >= 0);
      const otherKind = h.kind === 1 || h.kind === 2;
      if (!watched && !(otherKind && summary.findBound.kindRows < KIND_ROWS_MAX)) return;
      if (watched) summary.findBound.watched++;
      else summary.findBound.kindRows++;
      this.row = ++seq;
      this.out = args[3];
      emit({ fn: 'findBound', seq: this.row, tid: Process.getCurrentThreadId(), ref: hex(h.low), kind: h.kind, mid: h.mid, cls: cls });
    },
    leave: function (retval) {
      if (!this.row) return;
      let found = null;
      try {
        const obj = this.out.readPointer();
        found = obj.isNull() ? null : typeName(obj);
      } catch (e) { found = null; }
      emit({ fn: 'findBound:leave', seq: this.row, tid: Process.getCurrentThreadId(), result: retval.toUInt32() & 0xff, found: found });
    },
  });

  // H-R7: every event the engine sends a watched form, timed
  attach('sendEvent', at.sendEvent, {
    enter: function (args) {
      const h = parts(uint64(args[1].toString()));
      if (!isWatched(h.low)) return;
      const ref = hex(h.low);
      const name = fixedString(args[2]);
      tally(summary.sendEvent, ref, name === null ? '?' : name);
      emit({ fn: 'sendEvent', seq: ++seq, tid: Process.getCurrentThreadId(), ref: ref, kind: h.kind, mid: h.mid, event: name });
    },
  });

  emit({ ready: true, version: version, hooks: hooks, pid: Process.id, base: exe.base.toString(), watched: WATCHED.map(hex), types: TYPES, resolved: resolved });
  setInterval(function () {
    emit({ fn: 'liveness', pid: Process.id, counts: JSON.parse(JSON.stringify(counts)), summary: JSON.parse(JSON.stringify(summary)) });
  }, 10000);
}
