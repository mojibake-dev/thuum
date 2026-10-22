// exception-trace.js: every exception raised in the game, with its thread and
// its stack, for thuum docs/verbs/npc-puppet.md (the landing hang of
// 2026-10-21: the dump of b-npc-puppet 20261022-045602 showed Skyrim
// Platform's JS worker spinning in V8's stack-handler unwind, a StackHandler
// linked to itself, which an earlier JS entry on that thread leaves behind
// when it exits without unwinding: a C++ or SEH exception thrown through V8
// frames). Two hooks:
// - KERNELBASE RaiseException: every software exception. A C++ throw passes
//   here with code 0xE06D7363 (the MSVC "msc" code) and, in its arguments,
//   the ThrowInfo whose catchable types name the thrown class; an SEH
//   RaiseException with any other code is logged as such.
// - Process.setExceptionHandler: first-chance hardware faults (access
//   violations and kin), logged and passed on (the handler returns false so
//   the game's own handlers run).
// Each line: the thread id, the exception's code and type names, and the
// top frames by module+offset (SkyrimSE.exe offsets are Address Library
// RVAs for `just addr`'s reverse read; SkyrimPlatformImpl.dll and libnode.dll
// offsets are the dump's currency). Repeats of one (thread, code, type, top
// frame) within a second are counted, not repeated. Run before the game's
// load: a `frida {script: exception-trace.js}` step placed before `connect`
// waits for the process and attaches during the load screen.
'use strict';
function emit(obj) { obj.t = Date.now(); send(obj); console.log(JSON.stringify(obj)); }

function hex(n) { return '0x' + (n >>> 0).toString(16); }

function where(context, depth) {
  return Thread.backtrace(context, Backtracer.FUZZY).slice(0, depth || 14).map(function (a) {
    const m = Process.findModuleByAddress(a);
    return m ? m.name + '+0x' + a.sub(m.base).toString(16) : a.toString();
  });
}

// the names of a C++ exception's catchable types from its ThrowInfo (MSVC x64:
// ThrowInfo { attributes, pmfnUnwind, pForwardCompat, pCatchableTypeArray }
// as 32-bit image-relative offsets; CatchableTypeArray { n, offsets[] };
// CatchableType { props, pType (TypeDescriptor), ... }; TypeDescriptor
// { vtable, spare, name[] } with the decorated name at +0x10)
function throwTypes(params, paramCount) {
  try {
    if (paramCount < 4) return [];
    const throwInfo = params.add(16).readPointer();
    const imageBase = params.add(24).readPointer();
    if (throwInfo.isNull() || imageBase.isNull()) return [];
    const ctaOff = throwInfo.add(12).readU32();
    const cta = imageBase.add(ctaOff);
    const n = Math.min(cta.readU32(), 8);
    const names = [];
    for (let i = 0; i < n; i++) {
      const ct = imageBase.add(cta.add(4 + 4 * i).readU32());
      const td = imageBase.add(ct.add(4).readU32());
      names.push(td.add(16).readUtf8String(96));
    }
    return names;
  } catch (e) {
    return ['unreadable: ' + e];
  }
}

const seen = {};
function record(key, line) {
  const c = seen[key];
  if (c) { c.n += 1; return; }
  seen[key] = { n: 1, line: line };
  emit(line);
}
setInterval(function () {
  const keys = Object.keys(seen);
  for (const k of keys) {
    if (seen[k].n > 1) emit({ repeats: true, of: seen[k].line.code, type: seen[k].line.types, tid: seen[k].line.tid, n: seen[k].n });
    delete seen[k];
  }
}, 1000);

const kb = Process.getModuleByName('KERNELBASE.dll');
const raise = kb.findExportByName('RaiseException');
if (raise === null) {
  emit({ error: 'no RaiseException export' });
} else {
  Interceptor.attach(raise, {
    onEnter(args) {
      const code = args[0].toInt32() >>> 0;
      const paramCount = args[2].toInt32();
      const types = code === 0xE06D7363 ? throwTypes(args[3], paramCount) : [];
      const frames = where(this.context, 14);
      record(this.threadId + ':' + code + ':' + types.join('|') + ':' + (frames[2] || ''),
             { raised: true, tid: this.threadId, code: hex(code), types: types, frames: frames });
    },
  });
  emit({ ready: true, hooks: ['RaiseException', 'first-chance faults'] });
}

Process.setExceptionHandler(function (details) {
  const frames = where(details.context, 14);
  const a = details.address;
  const m = a ? Process.findModuleByAddress(a) : null;
  record('fault:' + details.type + ':' + (frames[0] || ''),
         { fault: true, type: details.type, at: m ? m.name + '+0x' + a.sub(m.base).toString(16) : String(a),
           memory: details.memory ? { op: details.memory.operation, address: String(details.memory.address) } : null,
           frames: frames });
  return false;
});
