// texture-trace.js: every texture path the game asks Windows about, and
// whether Windows found it, so a look that renders wrong can be traced to
// the files it actually read (docs/verbs/racemenu-sync.md: rotfern's skin
// reads far too shiny in the lab, 2026-10-07, though its textures and
// texture sets match what fenestrate drew). Loose files go through
// KernelBase: an existence check (GetFileAttributesEx, FindFirstFile) or an
// open (CreateFile), each in A and W forms. A path Windows did not find was
// not there loose; the engine may still find it in an archive, which this
// does not see. Each distinct path and result is logged once.
// Run: `just frida lab/frida/texture-trace.js c1`.
'use strict';
function emit(obj) { obj.t = Date.now(); send(obj); console.log(JSON.stringify(obj)); }

const seen = new Set();
const kernelbase = Process.getModuleByName('kernelbase.dll');

// how each call reports a failure
const failed = {
  handle: (r) => r.toInt32() === -1, // INVALID_HANDLE_VALUE
  bool: (r) => r.toInt32() === 0,
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
hook('GetFileAttributesExW', true, failed.bool);
hook('GetFileAttributesExA', false, failed.bool);
hook('FindFirstFileW', true, failed.handle);
hook('FindFirstFileA', false, failed.handle);
hook('FindFirstFileExW', true, failed.handle);
hook('FindFirstFileExA', false, failed.handle);
emit({ hooked: true });
