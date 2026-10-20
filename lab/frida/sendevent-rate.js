// sendevent-rate.js: how many Papyrus events the VM is asked to send per second, by event name, for thuum
// docs/decisions ADR-044 (the client's Papyrus event filter admits scripts by class chain and by the served plugin
// list, so its per-event cost is the parent walk times this rate). Hooks the same point as Skyrim Platform's own
// filter, BSScript::Internal::VirtualMachine::SendEvent (game/Offsets.h SendEvent, RELOCATION_ID(98077, 104800);
// called as (this, VMHandle, const BSFixedString&, IFunctionArguments*), push-trace.js's reading), resolved with
// lab/addr.py from addrlib/ for 1.6.1170 on 2026-10-20 (0x14477f0, as push-trace.js had it on 2026-10-14). Attached
// beside Skyrim Platform's hook it runs first, so it counts every event the engine sends, before the filter decides.
// BSFixedString's first member is its char pointer (CommonLibSSE-NG include/RE/B/BSFixedString.h:232). Every 5 s it
// emits the window's count, the rate, and the ten commonest event names; nothing in the game changes.
// Run: a scenario's `frida {script: sendevent-rate.js}` step, or `just frida sendevent-rate.js c1` while the game runs.
'use strict';
function emit(obj) { obj.t = Date.now(); send(obj); console.log(JSON.stringify(obj)); }

const OFFSETS = {
  '1.6.1170.0': { sendEvent: 0x14477f0 }, // 104800
};

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

const exe = Process.getModuleByName('SkyrimSE.exe');
const version = fileVersion(exe.path);
const at = OFFSETS[version];
if (at === undefined) {
  emit({ error: 'no offsets for this runtime', version: version });
} else {
  let count = 0;
  let names = {};
  let started = Date.now();
  Interceptor.attach(exe.base.add(at.sendEvent), {
    onEnter(args) {
      count++;
      let name = '?';
      try {
        const chars = args[2].readPointer();
        name = chars.isNull() ? '' : chars.readCString();
      } catch (e) {
        name = 'unreadable';
      }
      names[name] = (names[name] || 0) + 1;
    },
  });
  emit({ attached: 'SendEvent', rva: '0x' + at.sendEvent.toString(16), version: version });
  setInterval(function () {
    const now = Date.now();
    const top = Object.keys(names).sort(function (a, b) { return names[b] - names[a]; }).slice(0, 10)
      .map(function (k) { return [k, names[k]]; });
    emit({ window_ms: now - started, events: count, per_s: Math.round(count * 1000 / (now - started)), top: top });
    count = 0; names = {}; started = now;
  }, 5000);
}
