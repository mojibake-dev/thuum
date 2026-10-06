// console-trace.js: every line the game's console prints, with the time, so a
// run keeps what skymp5-client and Skyrim Platform report there: Skyrim
// Platform's printConsole and its JavaScript exceptions both end in
// RE::ConsoleLog::VPrint (skyrim-platform InGameConsolePrinter.cpp: Print
// passes "%s%s" with the prefix and the text, cut to 128 characters; PrintRaw
// passes the text as the format). skymp5-client's logTrace and logError are
// printConsole calls (skymp5-client src/logging.ts), so are its
// "TESModPlatform.addItemEx(...)" lines for every item an inventory apply adds
// (src/sync/inventory.ts). Run: `just frida console-trace.js c1`.
//
// VPrint is CommonLibSSE-NG's Offset::ConsoleLog::VPrint, RELOCATION_ID(50180,
// 51110) (include/RE/Offsets.h:179); called as (this, format, va_list)
// (src/RE/C/ConsoleLog.cpp). The AE id 51110 resolved with lab/addr.py from
// addrlib/ on 2026-10-06, per runtime; the runtime is the exe's own file
// version (GetFileVersionInfoW, VS_FIXEDFILEINFO), as SKSE reads it.
'use strict';
function emit(obj) { obj.t = Date.now(); send(obj); console.log(JSON.stringify(obj)); }

const VPRINT = {
  '1.6.1170.0': 0x8f9220, // lab/addr.py addrlib 1.6.1170 51110
  '1.7.104.0': 0x90f1e0,  // lab/addr.py addrlib 1.7.104 51110
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

function text(p) {
  try {
    return p.isNull() ? '' : p.readUtf8String();
  } catch (e) {
    return '<unreadable>';
  }
}

const exe = Process.getModuleByName('SkyrimSE.exe');
const version = fileVersion(exe.path);
const offset = VPRINT[version];
if (offset === undefined) {
  emit({ error: 'no VPrint offset for this runtime', version: version });
} else {
  Interceptor.attach(exe.base.add(offset), {
    onEnter(args) {
      const format = text(args[1]);
      // a va_list on Windows x64 points at the arguments, eight bytes each
      const msg = format === '%s%s'
        ? text(args[2].readPointer()) + text(args[2].add(8).readPointer())
        : format;
      emit({ msg: msg });
    },
  });
  emit({ attached: true, version: version, vprint: '+0x' + offset.toString(16) });
}
