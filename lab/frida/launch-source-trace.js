// launch-source-trace.js: launch-trace.js plus the LaunchData's fields that
// say which hand and whose spell each launch is (thuum docs/verbs/spell-cast.md,
// playtest eighteen's left-hand Firebolt leaving the figure's right hand):
// every projectile the game launches, with the time and a
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
  // Projectile::LaunchData (CommonLibSSE-NG include/RE/P/Projectile.h:81-107):
  // origin +0x08 (three floats), projectileBase +0x20, shooter +0x28, spell
  // +0x70, castingSource +0x78 (MagicSystem::CastingSource: 0 left hand, 1
  // right hand, 2 other, 3 instant; include/RE/M/MagicSystem.h), useOrigin
  // +0xA0; a form's id at +0x14 (include/RE/T/TESForm.h:354)
  const formId = function (p) { try { return p.isNull() ? 0 : p.add(0x14).readU32(); } catch (e) { return -1; } };
  Interceptor.attach(exe.base.add(offset), {
    onEnter(args) {
      const ld = args[1];
      const bt = where(this.context);
      let fields = {};
      try {
        fields = {
          origin: [ld.add(0x08).readFloat(), ld.add(0x0c).readFloat(), ld.add(0x10).readFloat()],
          projectile: formId(ld.add(0x20).readPointer()),
          shooter: formId(ld.add(0x28).readPointer()),
          spell: formId(ld.add(0x70).readPointer()),
          castingSource: ld.add(0x78).readU32(),
          useOrigin: ld.add(0xa0).readU8(),
        };
      } catch (e) { fields = { error: String(e) }; }
      emit(Object.assign({
        launch: true,
        tid: this.threadId,
        ours: bt.some(function (f) { return f.indexOf('SkyrimPlatformImpl') === 0; }),
        bt: bt.slice(0, 6),
      }, fields));
    },
  });
  emit({ ready: true, version: version, at: '0x' + offset.toString(16) });
}
