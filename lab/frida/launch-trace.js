// launch-trace.js: every projectile the game launches, with the time and a
// backtrace (module+offset), so a run can tell whose launch each arrow was:
// Skyrim Platform's TESModPlatform.LaunchArrow (a frame in
// SkyrimPlatformImpl.dll) or the engine's own (SkyrimSE.exe alone). For
// playtest thirteen's two arrows on the target's screen (thuum
// docs/verbs/marksman.md): HYPOTHESIS that the figure's own bow fires one
// beside the relayed one. Run: `just frida launch-trace.js c2` while the
// target's game runs (a run collects it).
//
// Launch is CommonLibSSE-NG's Projectile::Launch, RELOCATION_ID(42928, 44108)
// (src/RE/P/Projectile.cpp:255-258), static, called as (a_result,
// LaunchData&). The AE id 44108 resolved with lab/addr.py from addrlib/ on
// 2026-10-11, per runtime; the runtime is the exe's own file version
// (GetFileVersionInfoW, VS_FIXEDFILEINFO), as SKSE reads it.
'use strict';
function emit(obj) { obj.t = Date.now(); send(obj); console.log(JSON.stringify(obj)); }

const LAUNCH = {
  '1.6.1170.0': 0x7e46c0, // lab/addr.py addrlib 1.6.1170 44108
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
  // VS_FIXEDFILEINFO: dwSignature, dwStrucVersion, dwFileVersionMS, dwFileVersionLS
  const ffi = out.readPointer();
  const ms = ffi.add(8).readU32();
  const ls = ffi.add(12).readU32();
  return [ms >>> 16, ms & 0xffff, ls >>> 16, ls & 0xffff].join('.');
}

function where(context) {
  return Thread.backtrace(context, Backtracer.ACCURATE).slice(0, 16).map(function (a) {
    const m = Process.findModuleByAddress(a);
    return m ? m.name + '+0x' + a.sub(m.base).toString(16) : a.toString();
  });
}

const exe = Process.getModuleByName('SkyrimSE.exe');
const version = fileVersion(exe.path);
const offset = LAUNCH[version];
if (offset === undefined) {
  emit({ error: 'no Launch offset for this runtime', version: version });
} else {
  Interceptor.attach(exe.base.add(offset), {
    onEnter() {
      const bt = where(this.context);
      emit({
        launch: true,
        tid: this.threadId,
        ours: bt.some(function (f) { return f.indexOf('SkyrimPlatformImpl') === 0; }),
        bt: bt,
      });
    },
  });
  emit({ ready: true, version: version, at: '0x' + offset.toString(16) });
}
