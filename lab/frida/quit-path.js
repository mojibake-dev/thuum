// quit-path.js: the game's quit path, for thuum docs/verbs/cell-host.md (the
// quitting host, ADR-047's D12 B; fork m3-train-44's OnQuitShutdown thunk).
// The re-analyst's read (REA on sky-re, 2026-10-24, CONFIRMED-STATIC for the
// instructions, HYPOTHESIS for the game's behavior until this trace): every
// quit stores 1 at Main::quitGame (Main::Singleton 403449, the byte at +0x10,
// CommonLibSSE-NG include/RE/M/Main.h:77); WinMain (36544) tests it after
// each Main::Update (36564) and makes one call to the shutdown routine
// (36551) at WinMain+0x1ae on the main thread; the engine never calls
// ExitProcess itself, the CRT does after WinMain returns. Hooks:
// - Main::Update (36564) on leave: the byte; the first frame it reads 1 is
//   stamped (the quit's frame, its thread).
// - the shutdown routine (36551) on enter and leave: thread, ms after the
//   flag, the caller (WinMain+0x1ae expected: SkyrimSE.exe+0x63eb1e).
// - MpClientPlugin.dll's DestroyClient on enter and leave: the thunk's
//   teardown and its cost (the bounded join, 200 ms at most).
// - kernel32 ExitProcess on enter: the end, ms after the flag.
// Expected: shutdown on Main::Update's thread, after at least one frame with
// the byte at 1; DestroyClient inside the shutdown's entry (before it, in
// the thunk), under 200 ms; ExitProcess after the shutdown returns. What
// falsifies the hook's premise: ExitProcess with no shutdown entry, the
// callbacks on another thread, DestroyClient past 200 ms.
// Every offset is Address Library 1.6.1170's by `just addr` (lab/addr.py) on
// 2026-10-24. The process ends right after the last lines, so a short trace
// through a block-buffered stdout may lose them (lab lesson 2026-10-21):
// every line is sent and printed at once; read the run's frida output and
// the server log's ClientDisconnected together.
// Mode 'heaps' (params {MODE: heaps}; the quit crash of x-host-quit 004815,
// the re-analyst's read of 2026-10-24): the Scaleform heap teardown at quit
// lists what it destroys. Hooks GMemoryHeapPT::DestroyItself (84554, rcx the
// heap: HeapInfo.name at heap+0x80, the embedded _info at +0x38 and its name
// at +0x48, GMemoryHeap.h:97-99; the refcount at +0x20; the allocation engine
// at +0xC8; the heap's limit handler at engine+0x748, which 87837 reads and
// faults on when it points into unmapped memory), SetLimitHandler (84545,
// rcx the heap, rdx the handler, with the caller) and the movie memory
// context's deleting destructor (85286, rcx the context, which begins with
// SetLimitHandler(nullptr)). A heap at 84554 whose handler is non-null and
// unmapped is the leaked movie; the list of 84554 entries at quit is the leak
// list. Diagnosis only: Frida in the process is itself a confound for the
// crash (004815 had it; the production read is x-host-quit-plain).
// Mode 'names' (params {MODE: names}; the re-analyst's read of 2026-10-25,
// REA on sky-re): names the leaked movie. Joins on the heap address: the
// root's CreateHeap (84512: rdx the name, a char* the heap copies to
// heap+0x828 and points to from heap+0x80, rax the new heap),
// GFxMovieDefImpl::CreateMemoryContext (85302: rdx the heap name
// `MovieView "<file>"`, rax the context whose +0x10 is its heap and whose
// +0x30 is the limit handler the crash reads), CreateInstance (85301: rdx
// the context, rax the GFxMovieRoot with the heap at +0x38 and the refcount
// at +0x08), the context's deleting destructor (85286, the normal end, from
// GFxMovieRoot::Release 83930 under the UI destructor 82073), the UI
// destructor's walk of UI::menuMap (each registered menu's name, IMenu, its
// uiMovie, that movie's refcount and heap; the layout a HYPOTHESIS from the
// read: entries at UI+0x150, capacity at UI+0x134, stride 0x20, entry+0x18
// nonzero when occupied, entry+8 the IMenu, IMenu+0x10 the movie), and
// DestroyItself (84554) at quit with the heap's name read as pointer then
// C string (the heaps mode read a sized UTF-8 string and got nothing), its
// handler, and for a handler-carrying heap the context (handler-0x30, its
// +0x10 must equal the heap), the root(s) created on it and the root's
// refcount: a nonzero refcount is the holder that kept the movie alive, a
// heap missing from the menu walk is a movie never registered as a menu.
// Run: a scenario's `frida {script: quit-path.js}` step before the quit, or
// `just frida quit-path.js c1` by hand, then quit the game (console qqq).
'use strict';
function emit(obj) { obj.t = Date.now(); send(obj); console.log(JSON.stringify(obj)); }

// lab-api prepends `globalThis.LAB_PARAMS = {...}` for a step's params
const PARAMS = (typeof LAB_PARAMS === 'object' && LAB_PARAMS) ? LAB_PARAMS : {};
const MODE = PARAMS.MODE || 'quit';

const OFFSETS = {
  '1.6.1170.0': {
    winMain: 0x63e970, // 36544
    mainUpdate: 0x645ea0, // 36564
    shutdown: 0x641c60, // 36551
    mainSingleton: 0x31872c0, // 403449
    heapDestroy: 0x102f7a0, // 84554 GMemoryHeapPT::DestroyItself (the re-analyst's name)
    setLimitHandler: 0x102f4d0, // 84545
    contextDtor: 0x1057b40, // 85286 GFxMovieDef::MemoryContextImpl's deleting destructor (HYPOTHESIS name)
    engineDtor: 0x10ea500, // 87837, the crash's function (+0x50 the faulting load)
    createHeap: 0x102e1d0, // 84512 the root's CreateHeap (rdx the name, r8 the parent, rax the heap)
    createContext: 0x1058fd0, // 85302 GFxMovieDefImpl::CreateMemoryContext (rdx the heap name, rax the context; its heap at ctx+0x10)
    createRoot: 0x1058e70, // 85301 GFxMovieDefImpl::CreateInstance(MemoryContext*, bool) (rdx the context, rax the GFxMovieRoot; its heap at root+0x38)
    uiDtor: 0xfa3640, // 82073 UI's destructor, which releases every registered menu's movie
  },
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

// helper names avoid Frida's globals (ptr, hexdump, int64, uint64, NULL)
function readPtr(p) { try { return p.isNull() ? NULL : p.readPointer(); } catch (e) { return NULL; } }
function u8(p) { try { return p.isNull() ? -1 : p.readU8(); } catch (e) { return -1; } }
function caller(context) {
  const a = context.rsp.readPointer();
  const m = Process.findModuleByAddress(a);
  return m ? m.name + '+0x' + a.sub(m.base).toString(16) : a.toString();
}

const exe = Process.getModuleByName('SkyrimSE.exe');
const version = fileVersion(exe.path);
const at = OFFSETS[version];
if (at === undefined) {
  emit({ error: 'no offsets for this runtime', version: version });
} else {
  emit({ ready: true, version: version, mode: MODE, winMainShutdownCall: 'SkyrimSE.exe+0x' + (at.winMain + 0x1ae).toString(16) });
  let frames = 0;
  let lastFlag = 0;
  let flagAt = 0;
  const since = function () { return flagAt ? Date.now() - flagAt : null; };

  Interceptor.attach(exe.base.add(at.mainUpdate), {
    onLeave: function () {
      frames += 1;
      const main = readPtr(exe.base.add(at.mainSingleton));
      const flag = main.isNull() ? -1 : u8(main.add(0x10));
      if (flag === 1 && lastFlag !== 1) {
        flagAt = Date.now();
        emit({ quitFlag: true, frame: frames, threadId: this.threadId });
      }
      lastFlag = flag;
    },
  });

  Interceptor.attach(exe.base.add(at.shutdown), {
    onEnter: function () {
      emit({ shutdown: 'enter', threadId: this.threadId, msAfterFlag: since(), framesSoFar: frames, caller: caller(this.context) });
    },
    onLeave: function () {
      emit({ shutdown: 'leave', threadId: this.threadId, msAfterFlag: since() });
    },
  });

  const exitProcess = Process.getModuleByName('kernel32.dll').getExportByName('ExitProcess');
  Interceptor.attach(exitProcess, {
    onEnter: function (args) {
      emit({ exitProcess: true, code: args[0].toInt32(), threadId: this.threadId, msAfterFlag: since() });
    },
  });

  // a heap's name: heap+0x80 points at the copy the heap made at heap+0x828
  // (84512); read as a C string, never with a byte count (a sized UTF-8 read
  // over the bytes past the NUL threw every time in the heaps run 192408)
  function cstr(p) { try { return p.isNull() ? '' : p.readCString(); } catch (e) { return '?'; } }
  function heapName(h) {
    const viaPointer = cstr(readPtr(h.add(0x80)));
    const inline = cstr(h.add(0x828));
    return { name: viaPointer, name2: inline };
  }
  function mod(a) { const m = Process.findModuleByAddress(a); return m ? m.name + '+0x' + a.sub(m.base).toString(16) : a.toString(); }

  if (MODE === 'heaps' || MODE === 'names') {
    function str(p) { return cstr(p); }
    function mapped(p) { try { return !p.isNull() && Process.findRangeByAddress(p) !== null; } catch (e) { return false; } }
    let destroyed = 0;
    Interceptor.attach(exe.base.add(at.heapDestroy), {
      onEnter: function (args) {
        const heap = args[0];
        destroyed += 1;
        const engine = readPtr(heap.add(0xc8));
        const handler = engine.isNull() ? NULL : readPtr(engine.add(0x748));
        const names = heapName(heap);
        const row = {
          heapDestroy: destroyed, heap: heap.toString(), name: names.name, name2: names.name2,
          refCount: heap.add(0x20).readU32(), engine: engine.toString(), handler: handler.toString(),
          handlerMapped: mapped(handler), threadId: this.threadId, msAfterFlag: since(),
        };
        if (MODE === 'names' && !handler.isNull()) {
          // the handler is MemoryContextImpl+0x30; the context's +0x10 is its heap
          const ctx = handler.sub(0x30);
          row.ctx = ctx.toString();
          row.ctxHeapMatches = mapped(ctx) && readPtr(ctx.add(0x10)).equals(heap);
          const roots = rootsByCtx[ctx.toString()] || [];
          row.roots = roots.map(function (r) { return { root: r, refCount: mapped(ptr(r)) ? ptr(r).add(0x08).readU32() : -1 }; });
          row.created = heapsByAddr[heap.toString()] || null;
          row.menu = menusByHeap[heap.toString()] || null;
        }
        emit(row);
      },
    });
    Interceptor.attach(exe.base.add(at.setLimitHandler), {
      onEnter: function (args) {
        emit({ setLimitHandler: true, heap: args[0].toString(), name: str(readPtr(args[0].add(0x80))), handler: args[1].toString(), caller: caller(this.context), msAfterFlag: since() });
      },
    });
    if (MODE === 'heaps') {
      Interceptor.attach(exe.base.add(at.contextDtor), {
        onEnter: function (args) {
          emit({ contextDtor: true, context: args[0].toString(), heap: readPtr(args[0].add(0x10)).toString(), msAfterFlag: since() });
        },
      });
    }
    Interceptor.attach(exe.base.add(at.engineDtor), {
      onEnter: function (args) {
        const engine = args[0];
        const handler = readPtr(engine.add(0x748));
        emit({ engineDtor: true, engine: engine.toString(), handler: handler.toString(), handlerMapped: mapped(handler), msAfterFlag: since() });
      },
    });
  }

  // mode names: the creation side, joined on the heap address
  const heapsByAddr = {};
  const rootsByCtx = {};
  const menusByHeap = {};
  if (MODE === 'names') {
    Interceptor.attach(exe.base.add(at.createHeap), {
      onEnter: function (args) { this.name = cstr(args[1]); this.parent = args[2].toString(); },
      onLeave: function (retval) {
        heapsByAddr[retval.toString()] = { name: this.name, parent: this.parent, t: Date.now() };
        emit({ createHeap: true, heap: retval.toString(), parent: this.parent, name: this.name });
      },
    });
    Interceptor.attach(exe.base.add(at.createContext), {
      onEnter: function (args) { this.heapName = cstr(args[1]); },
      onLeave: function (retval) {
        const heap = mapped(retval) ? readPtr(retval.add(0x10)) : NULL;
        emit({ createContext: true, ctx: retval.toString(), heap: heap.toString(), heapName: this.heapName });
      },
    });
    Interceptor.attach(exe.base.add(at.createRoot), {
      onEnter: function (args) { this.ctx = args[1].toString(); },
      onLeave: function (retval) {
        const heap = mapped(retval) ? readPtr(retval.add(0x38)) : NULL;
        (rootsByCtx[this.ctx] = rootsByCtx[this.ctx] || []).push(retval.toString());
        emit({ createRoot: true, root: retval.toString(), ctx: this.ctx, heap: heap.toString() });
      },
    });
    Interceptor.attach(exe.base.add(at.uiDtor), {
      onEnter: function (args) {
        // UI::menuMap, the layout a HYPOTHESIS: read everything under try
        const ui = args[0];
        let walked = 0;
        try {
          const entries = readPtr(ui.add(0x150));
          const capacity = ui.add(0x134).readU32();
          for (let i = 0; i < capacity && i < 4096; i++) {
            const e = entries.add(i * 0x20);
            if (readPtr(e.add(0x18)).isNull()) continue;
            const menu = readPtr(e.add(0x08));
            const movie = menu.isNull() ? NULL : readPtr(menu.add(0x10));
            const heap = movie.isNull() ? NULL : readPtr(movie.add(0x38));
            // menuRefCount: the IMenu's own count (GRefCountBase at +0x08, HYPOTHESIS on
            // the offset); the Loading Menu's movie read refcount 1 at the quit (its IMenu
            // the one holder) yet outlived the teardown, so the IMenu's holders are the
            // next read (names run 20261025-201238)
            const row = { menu: menu.toString(), menuName: cstr(readPtr(e)), uiMovie: movie.toString(),
                          refCount: movie.isNull() ? -1 : movie.add(0x08).readU32(),
                          menuRefCount: menu.isNull() ? -1 : menu.add(0x08).readU32(), heap: heap.toString() };
            if (!heap.isNull()) menusByHeap[heap.toString()] = row;
            walked += 1;
            emit(Object.assign({ uiMenu: true }, row));
          }
        } catch (e) { emit({ error: 'menuMap walk failed: ' + e, walked: walked }); }
        emit({ uiDtor: 'enter', menusWalked: walked, msAfterFlag: since() });
      },
    });
    // the normal end of a movie's memory context, with its caller chain
    Interceptor.attach(exe.base.add(at.contextDtor), {
      onEnter: function (args) {
        const ctx = args[0];
        const heap = mapped(ctx) ? readPtr(ctx.add(0x10)) : NULL;
        const names = heap.isNull() ? { name: '', name2: '' } : heapName(heap);
        const bt = Thread.backtrace(this.context, Backtracer.ACCURATE).slice(0, 8).map(mod);
        emit({ contextDtorNamed: true, ctx: ctx.toString(), heap: heap.toString(), name: names.name, backtrace: bt, msAfterFlag: since() });
      },
    });
  }

  // the client plugin loads at the first createClient, so look until it is there
  let destroyHooked = false;
  const hookDestroy = function () {
    if (destroyHooked) return true;
    const plugin = Process.findModuleByName('MpClientPlugin.dll');
    if (!plugin) return false;
    const destroy = plugin.findExportByName('DestroyClient');
    if (!destroy) { emit({ error: 'MpClientPlugin.dll has no DestroyClient export' }); return true; }
    Interceptor.attach(destroy, {
      onEnter: function () {
        this.t0 = Date.now();
        emit({ destroyClient: 'enter', threadId: this.threadId, msAfterFlag: since(), caller: caller(this.context) });
      },
      onLeave: function () {
        emit({ destroyClient: 'leave', ms: Date.now() - this.t0, msAfterFlag: since() });
      },
    });
    destroyHooked = true;
    emit({ destroyClientHooked: true });
    return true;
  };
  if (!hookDestroy()) {
    let tries = 0;
    const timer = setInterval(function () {
      tries += 1;
      if (hookDestroy() || tries > 120) {
        clearInterval(timer);
        if (!destroyHooked) emit({ error: 'MpClientPlugin.dll not loaded within 60 s; DestroyClient unhooked' });
      }
    }, 500);
  }
}
