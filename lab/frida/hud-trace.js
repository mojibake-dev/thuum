// hud-trace.js: what the game shows on its HUD and who asked, for thuum
// docs/verbs/shouts.md (the re-teach at login: a relaunched player saw the
// big shout and word notifications again, playtest fourteen). Hooks
// UIMessageQueue::AddMessage (CommonLibSSE-NG include/RE/Offsets.h:569,
// Address Library 13631) and DebugNotification (Offsets.h:581, 52933). A
// message to "HUD Menu" carries a HUDData (H/HUDData.h:53-55: type at
// 0x10, its text a BSString at 0x18 whose data pointer is its first field,
// B/BSString.h:271); the types kept are the notification (1), the center
// text (4), and quest, skill and word-of-power messages (14 to 22:
// kWordOfPower1 21, kWordOfPower2 22). The menu name is a BSFixedString
// whose first field is its C string (B/BSFixedString.h:232). Each line
// carries the caller's frames as module+offset, so a run tells which Papyrus
// call (Actor.AddShout, Game.TeachWord, Game.UnlockWord) raised which
// message. Offsets resolved with lab/addr.py for 1.6.1170 on 2026-10-12.
// Run: a scenario's `frida {script: hud-trace.js}` step, or
// `just frida hud-trace.js c1`.
'use strict';
function emit(obj) { obj.t = Date.now(); send(obj); console.log(JSON.stringify(obj)); }

const OFFSETS = {
  '1.6.1170.0': {
    addMessage: 0x1af260,        // 13631
    debugNotification: 0x97a5e0, // 52933
  },
};
// LAB_PARAMS.TYPES, when a run's frida step gives it, replaces the kept types: the crosshair's
// prompt is kActivate 2 and kActivateNoLabel 3, and kCrosshairHide 23 (CommonLibSSE-NG
// include/RE/H/HUDData.h:16-37), for an invisible figure's "Talk" prompt (playtest twenty-one).
const KEPT = new Set((globalThis.LAB_PARAMS || {}).TYPES || [1, 4, 14, 15, 16, 17, 18, 19, 20, 21, 22]);

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
  // VS_FIXEDFILEINFO: dwSignature, dwStrucVersion, dwFileVersionMS, dwFileVersionLS
  const ffi = out.readPointer();
  const ms = ffi.add(8).readU32();
  const ls = ffi.add(12).readU32();
  return [ms >>> 16, ms & 0xffff, ls >>> 16, ls & 0xffff].join('.');
}

function cstr(p) {
  try {
    return p.isNull() ? '' : p.readCString();
  } catch (e) {
    return '?';
  }
}

function frames(context) {
  return Thread.backtrace(context, Backtracer.ACCURATE).slice(0, 12).map((a) => {
    const m = Process.findModuleByAddress(a);
    return m ? m.name + '+0x' + a.sub(m.base).toString(16) : a.toString();
  });
}

const exe = Process.getModuleByName('SkyrimSE.exe');
const version = fileVersion(exe.path);
const at = OFFSETS[version];
if (at === undefined) {
  emit({ error: 'no offsets for this runtime', version: version });
} else {
  Interceptor.attach(exe.base.add(at.addMessage), {
    onEnter(args) {
      try {
        const menu = cstr(args[1].readPointer());
        if (menu !== 'HUD Menu' || args[3].isNull()) return;
        const type = args[3].add(0x10).readU32();
        if (!KEPT.has(type)) return;
        emit({ hud: type, text: cstr(args[3].add(0x18).readPointer()), message: args[2].toInt32(), frames: frames(this.context) });
      } catch (e) {
        emit({ error: 'addMessage: ' + e });
      }
    },
  });
  Interceptor.attach(exe.base.add(at.debugNotification), {
    onEnter(args) {
      emit({ notification: cstr(args[0]), frames: frames(this.context) });
    },
  });
  emit({ attached: true, version: version });
}
