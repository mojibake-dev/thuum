// texture-trace.js: every texture path the game asks Windows about, and
// whether Windows found it, so a look that renders wrong can be traced to
// the files it actually read (docs/verbs/racemenu-sync.md: rotfern's skin
// reads far too shiny in the lab, 2026-10-07, though its textures and
// texture sets match what fenestrate drew). Loose files open through
// KernelBase's CreateFile, in A and W forms. A path Windows did not find was
// not there loose; the engine may still find it in an archive, which this
// does not see. Each distinct path and result is logged once. Only the opens
// are hooked: hooking the directory scans too (GetFileAttributesEx,
// FindFirstFile) froze the game on sky-c1 while RaceMenu browsed its
// presets (2026-10-07). Attach it before the look loads, at a launch.
// Run: `just frida lab/frida/texture-trace.js c1`.
'use strict';
function emit(obj) { obj.t = Date.now(); send(obj); console.log(JSON.stringify(obj)); }

const seen = new Set();
const kernelbase = Process.getModuleByName('kernelbase.dll');

// how a CreateFile call reports a failure
const failed = {
  handle: (r) => r.toInt32() === -1, // INVALID_HANDLE_VALUE
};

function hook(name, wide, fails) {
  const fn = kernelbase.findExportByName(name);
  if (fn === null) {
    emit({ error: 'no export ' + name });
    return;
  }
  Interceptor.attach(fn, {
    onEnter(args) {
      try {
        this.path = wide ? args[0].readUtf16String() : args[0].readAnsiString();
      } catch (e) {
        this.path = null;
      }
      this.want = this.path !== null && /\.dds$/i.test(this.path);
    },
    onLeave(retval) {
      if (!this.want) return;
      const found = !fails(retval);
      const key = this.path.toLowerCase() + (found ? '' : ' missing');
      if (seen.has(key)) return;
      seen.add(key);
      emit({ call: name, path: this.path, found: found });
    },
  });
}

hook('CreateFileW', true, failed.handle);
hook('CreateFileA', false, failed.handle);
emit({ hooked: true });
