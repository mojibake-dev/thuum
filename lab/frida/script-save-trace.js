// script-save-trace.js v2 (2026-11-05, its fresh review's fixes applied as written): SaveHandle tallied at every call (handles
// are written in the object table, 105016 under 104883, before any object's data, never inside Object::Save), by kind (bits 48
// to 63), by mid (bits 32 to 47: 0xFFFF a plain form) and by caller; no address-space walk per object (Frida 17's
// findRangeByAddress queries every region below its target: the handle is read inside a try, readable() kept for watched
// objects); each variable's index from its address (Object.h:49: variables[] at +0x30, 0x10 a Variable), so "positional" is
// measured; SaveGame (104828) numbers the passes (a size pass may run before the write) and emits the summary at its end; 54017's
// calls counted (a VM block reaching the save); not-constructed objects counted apart; the summary keyed by kind and plain or
// not; '' for an empty BSFixedString; watched rows read lockStructure (+0x18) and each class's own variableCount
// (ObjectTypeInfo.h:181, bits 8 to 17 of the u32 at +0x20); onLeave cuts the stack at its own frame. v1 follows.
// script-save-trace.js v1: the engine's own per-object script save, read under a whole save on the seat (ADR-068 rung 3's
// premise H-R1, the script record's encoder; docs/research/adr065-papyrus-state-2026-11-03.md Q1 and Q3's suggested trace).
// Every fact HYPOTHESIS until this trace reads it. Ids by `just addr` (Address Library 1.6.1170), the doc's static read for
// each function's role:
//   104249 (0x1422350) BSScript::Object::Save, the object's own serializer: RCX the Object
//   104293 (0x1424c50) Variable::Save, its callee per variable: RCX the Variable
//   104317 (0x1426b80) ObjectTypeInfo::GetTotalNumVariables, the count Object::Save writes: RCX the type, the count in EAX
//   104682 (0x143f670) the string-index writer (interns one BSFixedString into the save's table)
//   53522 (0x9a2fb0) SkyrimScript::SaveFileHandleReaderWriter::SaveHandle: R8 the handle
//   104828 (0x144a840) IVMSaveLoadInterface::SaveGame (the doc's table); 54017 (0x9c9ef0) the save's VM block (the review)
// Layouts from CommonLibSSE-NG b93280e8: Object (include/RE/O/Object.h:39-49): the flag bits at +0x00 (constructed bit 0,
// initialized 1, valid 2, remainingPropsToInit 3 to 31), type +0x08, currentState +0x10, lockStructure +0x18, handle +0x20,
// variables[] +0x30; ObjectTypeInfo (ObjectTypeInfo.h:177-182): name +0x08, parentTypeInfo +0x10, variableCount bits 8 to 17 of
// the u32 at +0x20; Variable (Variable.h:93-94): varType +0x00 (raw below 0x10 a basic type, else a class pointer with the
// array bit low), value +0x08; a BSFixedString's first member points at its chars.
// Rows: {ready} once; {fn: 'pass', n, phase} at each SaveGame's enter and leave; {fn: 'object'} per Object::Save of a watched
// form (LAB_PARAMS {forms: [ids]}, default the pillars 0xaa8cb and 0xaa8cc, the plate 0x567f2 and its wall 0x54b15); {fn:
// 'handle'} per SaveHandle of a watched form; {fn: 'summary'} at each SaveGame's leave and every 10 s while objects save;
// {fn: 'liveness'} every 10 s with a kernel32 Sleep count. Every row to console.log and send(). Run as a probe's `frida {script:
// script-save-trace.js}` step on the seat that saves, 15 s ahead of the save. 1.6.1170 only.
'use strict';
function emit(obj) { obj.t = Date.now(); send(obj); console.log(JSON.stringify(obj)); }

const OFFSETS = {
  '1.6.1170.0': {
    objectSave: 0x1422350, // 104249
    variableSave: 0x1424c50, // 104293
    totalVariables: 0x1426b80, // 104317
    stringIndex: 0x143f670, // 104682
    saveHandle: 0x9a2fb0, // 53522
    vmSaveGame: 0x144a840, // 104828
    vmSaveBlock: 0x9c9ef0, // 54017
  },
};
const P = (typeof LAB_PARAMS !== 'undefined' && LAB_PARAMS) || {};
const WATCHED = (Array.isArray(P.forms) ? P.forms : [0xaa8cb, 0xaa8cc, 0x567f2, 0x54b15]).map(function (x) { return x >>> 0; });
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

function fixedString(p) {
  try {
    if (!readable(p)) return null;
    const chars = p.readPointer();
    if (chars.isNull()) return '';
    return readable(chars) ? chars.readCString() : null;
  } catch (e) {
    return null;
  }
}

// a handle's parts: kind (bits 48 to 63), mid (bits 32 to 47), low (the form id for a plain form)
function parts(h) {
  return { kind: h.shr(48).toNumber(), mid: h.shr(32).and(MASK16).toNumber(), low: h.and(MASK32).toNumber() >>> 0 };
}

// a type's chain: each class's name and its own variable count
function chainOf(type) {
  const out = [];
  let t = type;
  for (let i = 0; i < 12 && readable(t); i++) {
    out.push({ name: fixedString(t.add(0x08)), variableCount: (t.add(0x20).readU32() >>> 8) & 0x3ff });
    t = t.add(0x10).readPointer();
  }
  return out;
}

const frames = {};
function top() {
  const s = frames[Process.getCurrentThreadId()];
  return s && s.length > 0 ? s[s.length - 1] : null;
}

let pass = 0;
function freshSummary() {
  return { objects: 0, matched: 0, positional: 0, notConstructed: 0, mismatched: [], byKind: {}, handles: { calls: 0, byKind: {}, plain: 0, other: 0, callers: {} } };
}
let summary = freshSummary();
let summaryDirty = false;
function emitSummary(why) {
  emit({ fn: 'summary', pass: pass, why: why, objects: summary.objects, matched: summary.matched, positional: summary.positional,
    notConstructed: summary.notConstructed, mismatched: summary.mismatched, byKind: summary.byKind, handles: summary.handles });
  summaryDirty = false;
}

const exe = Process.getModuleByName('SkyrimSE.exe');
const version = fileVersion(exe.path);
const at = OFFSETS[version];
if (at === undefined) {
  emit({ error: 'no offsets for this runtime', version: version });
} else {
  let hooks = 0;
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
          if (handlers.enter) {
            try { handlers.enter.call(this, args); } catch (e) { fail(name, e); }
          }
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

  attach('vmSaveGame', at.vmSaveGame, {
    enter: function () {
      pass++;
      summary = freshSummary();
      emit({ fn: 'pass', n: pass, phase: 'enter', tid: Process.getCurrentThreadId() });
    },
    leave: function () {
      emit({ fn: 'pass', n: pass, phase: 'leave' });
      emitSummary('the pass ended');
    },
  });
  attach('vmSaveBlock', at.vmSaveBlock, {});

  attach('objectSave', at.objectSave, {
    enter: function (args) {
      const obj = args[0];
      const tid = Process.getCurrentThreadId();
      let h = null;
      try { h = obj.add(0x20).readU64(); } catch (e) { h = null; }
      const p = h === null ? null : parts(h);
      let flags = 0;
      try { flags = obj.readU32(); } catch (e) { flags = 0; }
      const frame = {
        h: p, watched: p !== null && WATCHED.indexOf(p.low) >= 0, constructed: flags & 1, varsSaved: 0, total: null, indices: [],
        rawTypes: [], strings: 0, vars: obj.add(0x30),
      };
      if (frame.watched && readable(obj)) {
        const type = obj.add(0x08).readPointer();
        frame.type = fixedString(type.add(0x08));
        frame.chain = chainOf(type);
        frame.state = fixedString(obj.add(0x10));
        frame.flags = { constructed: flags & 1, initialized: (flags >>> 1) & 1, valid: (flags >>> 2) & 1, remainingPropsToInit: flags >>> 3 };
        frame.lockStructure = obj.add(0x18).readPointer().toString();
      }
      const stack = (frames[tid] = frames[tid] || []);
      stack.push(frame);
      this.tid = tid;
      this.depth = stack.length - 1;
    },
    leave: function () {
      const stack = frames[this.tid];
      if (!stack || stack.length <= this.depth) return;
      const frame = stack[this.depth];
      stack.length = this.depth;
      summary.objects++;
      summaryDirty = true;
      const kindKey = frame.h === null ? 'none' : String(frame.h.kind) + (frame.h.mid === 0xffff ? ':plain' : ':other');
      summary.byKind[kindKey] = (summary.byKind[kindKey] || 0) + 1;
      if (!frame.constructed && frame.total === null) {
        summary.notConstructed++;
      } else if (frame.total !== null && frame.varsSaved === frame.total) {
        summary.matched++;
      } else if (summary.mismatched.length < 10) {
        summary.mismatched.push({ h: frame.h, varsSaved: frame.varsSaved, total: frame.total });
      }
      let positional = frame.indices.length === frame.varsSaved;
      for (let i = 0; positional && i < frame.indices.length; i++) positional = frame.indices[i] === i;
      if (positional && frame.varsSaved > 0) summary.positional++;
      if (frame.watched) {
        emit({
          fn: 'object', pass: pass, tid: this.tid, h: frame.h, type: frame.type, chain: frame.chain, state: frame.state, flags: frame.flags,
          lockStructure: frame.lockStructure, varsSaved: frame.varsSaved, total: frame.total, positional: positional,
          indices: frame.indices.slice(0, 32), rawTypes: frame.rawTypes, strings: frame.strings,
        });
      }
    },
  });
  attach('variableSave', at.variableSave, {
    enter: function (args) {
      const frame = top();
      if (!frame) return;
      frame.varsSaved++;
      frame.indices.push(args[0].sub(frame.vars).toInt32() >> 4);
      if (frame.watched && frame.rawTypes.length < 16) {
        try {
          const raw = args[0].readU64();
          frame.rawTypes.push(raw.compare(uint64(0x10)) < 0 ? raw.toNumber() : 'class' + (raw.and(uint64(1)).toNumber() ? '[]' : ''));
        } catch (e) { frame.rawTypes.push('unreadable'); }
      }
    },
  });
  attach('totalVariables', at.totalVariables, {
    leave: function (retval) {
      const frame = top();
      if (frame && frame.total === null) frame.total = retval.toUInt32();
    },
  });
  attach('stringIndex', at.stringIndex, {
    enter: function () {
      const frame = top();
      if (frame) frame.strings++;
    },
  });
  attach('saveHandle', at.saveHandle, {
    enter: function (args) {
      const h = uint64(args[2].toString());
      const p = parts(h);
      const hs = summary.handles;
      hs.calls++;
      hs.byKind[String(p.kind)] = (hs.byKind[String(p.kind)] || 0) + 1;
      if (p.mid === 0xffff) hs.plain++; else hs.other++;
      const caller = '+0x' + this.returnAddress.sub(exe.base).toString(16);
      hs.callers[caller] = (hs.callers[caller] || 0) + 1;
      if (WATCHED.indexOf(p.low) >= 0) emit({ fn: 'handle', pass: pass, h: p, caller: caller });
    },
  });
  emit({ ready: true, version: version, hooks: hooks, pid: Process.id, base: exe.base.toString(), watched: WATCHED.map(hex), resolved: resolved });
  setInterval(function () {
    if (summaryDirty) emitSummary('ten seconds');
    emit({ fn: 'liveness', pid: Process.id, counts: JSON.parse(JSON.stringify(counts)) });
  }, 10000);
}
