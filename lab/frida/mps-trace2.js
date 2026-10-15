// mps-trace2.js: mps-trace.js reading the system's maxEmitterObj and
// maxParticlesPerFrame too (BSMasterParticleSystem.h 0x162, 0x164), for breaths
// seconds apart (x-tgm-breath4): what draws Fire Breath's flames in a game, breath by breath
// (thuum docs/verbs/shouts.md, playtest seventeen: in god mode the target
// sees the first breath's fire and not the second's, though x-tgm-breath2
// traced a launch and a hit there for every breath). The re-analyst's static
// read (Ghidra on sky-re, 2026-10-14; every function's role and every field
// below not cited to a CommonLibSSE-NG header is its HYPOTHESIS): the
// breath's cone (PROJ 0x647BF) registers a value node of its model as an
// emitter of one shared master particle system per addon index (ADDN
// MPSFireWaveFlames 0x647BC, index 64), and that system is "destroy when not
// in use". Two candidates for the missing fire: (a) the second cone's node
// never becomes an emitter of system 64; (b) system 64 is removed after the
// first breath and rebuilt for the second, which then emits nothing.
// Logged:
// - every launch of the cone (Projectile::Launch), ours (a
//   SkyrimPlatformImpl.dll frame) or the engine's, with LaunchData.useOrigin;
// - the cone's Init3D, and inside it RegisterMPSEmitters' return; EnsureMPS
//   and AddEmitter for addon index 64 wherever they run, with slot 64's
//   system before and after;
// - slot 64 itself, polled every 50 ms (the manager node's child 64, checked
//   to be a BSMasterParticleSystem by its vtable): its pointer, emitter and
//   particle-object counts, unk160 and destroyWhenNotInUse, a line on each
//   change;
// - the emit call on slot 64's system, counted per 250 ms, and a rebuild
//   that changes slot 64;
// - the cone's Kill.
// With LAB_PARAMS {ALWAYS_LOADED: true} it first sets ADDN 0x647BC's flags to
// kAlwaysLoaded (CommonLibSSE-NG include/RE/B/BGSAddonNode.h:12-16): the test
// of fix (1), which should keep slot 64 alive between breaths. Run: a
// scenario's frida step, or `just frida mps-trace.js c2` while the game runs.
//
// Ids resolved with lab/addr.py from addrlib/ on 2026-10-14, per runtime; the
// runtime is the exe's own file version, as in launch-trace.js.
'use strict';
function emit(obj) { obj.t = Date.now(); send(obj); console.log(JSON.stringify(obj)); }

const PARAMS = globalThis.LAB_PARAMS || {};
const ALWAYS_LOADED = !!PARAMS.ALWAYS_LOADED;
const CONE = 0x647bf;   // PROJ VoiceFireWaveProjectile01 (Skyrim.esm, lab/esm.py)
const ADDON = 0x647bc;  // ADDN MPSFireWaveFlames, index 64
const INDEX = 64;

const OFFSETS = {
  '1.6.1170.0': {
    launch: 0x7e46c0,            // 44108 Projectile::Launch (src/RE/P/Projectile.cpp:255-258)
    init3D: 0x7ee3e0,            // 44222 the projectile's 3D set-up
    registerEmitters: 0x2df8a0,  // 19633
    ensureMPS: 0x256390,         // 16817 (addon, value node)
    addEmitter: 0xe2a2f0,        // 76597 (_, index, node)
    emitParticles: 0xe36310,     // 76893
    rebuild: 0xe2a6c0,           // 76603 (a queued system's rebuild)
    kill: 0x7e5130,              // 44110
    manager: 0x3284b88,          // 411270 (data: the systems' parent node)
    dataHandler: 0x20f6320,      // 400269 TESDataHandler singleton (include/RE/Offsets.h:504)
    mpsVtable: 0x19d6488,        // 238521 VTABLE_BSMasterParticleSystem (include/RE/Offsets_VTABLE.h:5834)
  },
};

// Layouts, CommonLibSSE-NG for 1.6.1170 (a two-number RelocateMember is SE
// and AE, then VR).
const FORM_ID = 0x14;          // TESForm::formID (include/RE/T/TESForm.h:354)
const REFR_BASE = 0x40;        // TESObjectREFR::data.objectReference (include/RE/T/TESObjectREFR.h:495, :77)
const LD_BASE = 0x20;          // Projectile::LaunchData::projectileBase (include/RE/P/Projectile.h:83)
const LD_USE_ORIGIN = 0xa0;    // LaunchData::useOrigin (Projectile.h:107)
const ADDON_INDEX = 0x68;      // BGSAddonNode::index (include/RE/B/BGSAddonNode.h:48)
const ADDON_FLAGS = 0x7a;      // BGSAddonNode::data (0x78) + ADDON_DATA::flags (2) (BGSAddonNode.h:20, :51)
const DH_ADDONS = 0xd20;       // TESDataHandler::addonNodes, a NiTArray (include/RE/T/TESDataHandler.h:173)
const NI_DATA = 0x8;           // NiTArray::_data (include/RE/N/NiTArray.h:116)
const NI_CAPACITY = 0x10;      // NiTArray::_capacity (NiTArray.h:117)
const CHILDREN = 0x110;        // NiNode::children, a NiTArray (include/RE/N/NiNode.h:76)
const MPS_EMITTERS = 0x128;    // BSMasterParticleSystem::emitterObjs, a BSTArray (include/RE/B/BSMasterParticleSystem.h)
const MPS_PARTICLES = 0x140;   // ::particles, a BSTArray
const BST_SIZE = 0x10;         // BSTArray's _size after its allocator's data and capacity (include/RE/B/BSTArray.h)
const MPS_UNK160 = 0x160;
const MPS_DESTROY = 0x166;     // ::destroyWhenNotInUse

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

function where(context) {
  return Thread.backtrace(context, Backtracer.ACCURATE).slice(0, 12).map(function (a) {
    const m = Process.findModuleByAddress(a);
    return m ? m.name + '+0x' + a.sub(m.base).toString(16) : a.toString();
  });
}

function formIdOf(form) {
  try { return form.isNull() ? 0 : form.add(FORM_ID).readU32(); } catch (e) { return -1; }
}

function baseIdOf(refr) {
  try { return refr.isNull() ? 0 : formIdOf(refr.add(REFR_BASE).readPointer()); } catch (e) { return -1; }
}

const exe = Process.getModuleByName('SkyrimSE.exe');
const version = fileVersion(exe.path);
const off = OFFSETS[version];
if (off === undefined) {
  emit({ error: 'no offsets for this runtime', version: version });
} else {
  const mpsVtable = exe.base.add(off.mpsVtable);

  // The systems' parent node: the qword at 411270 read as a pointer to it,
  // or 411270 as the node itself; whichever first shows a child with the
  // master particle system's vtable is kept.
  let managerMode = null;
  function managerCandidates() {
    const at = exe.base.add(off.manager);
    const out = [];
    try { const p = at.readPointer(); if (!p.isNull()) out.push(['pointer', p]); } catch (e) { /* unreadable */ }
    out.push(['object', at]);
    return out;
  }
  function childrenOf(node) {
    const data = node.add(CHILDREN + NI_DATA).readPointer();
    const cap = node.add(CHILDREN + NI_CAPACITY).readU16();
    return [data, cap];
  }
  function isMps(p) {
    try { return !p.isNull() && p.readPointer().equals(mpsVtable); } catch (e) { return false; }
  }
  function slot() {
    const cands = managerCandidates();
    for (let i = 0; i < cands.length; i++) {
      const mode = cands[i][0];
      if (managerMode !== null && mode !== managerMode) continue;
      try {
        const dc = childrenOf(cands[i][1]);
        if (dc[0].isNull() || dc[1] <= INDEX || dc[1] > 4096) continue;
        if (managerMode === null) {
          let any = false;
          for (let j = 0; j < dc[1] && !any; j++) any = isMps(dc[0].add(j * 8).readPointer());
          if (!any) continue;
          managerMode = mode;
          emit({ manager: mode, children: dc[1] });
        }
        return dc[0].add(INDEX * 8).readPointer();
      } catch (e) { /* not this reading */ }
    }
    return null;
  }
  function describe(sys) {
    if (sys === null) return { slot: 'unresolved' };
    if (sys.isNull()) return { slot: null };
    try {
      return {
        slot: sys.toString(),
        mps: isMps(sys),
        emitters: sys.add(MPS_EMITTERS + BST_SIZE).readU32(),
        particles: sys.add(MPS_PARTICLES + BST_SIZE).readU32(),
        unk160: sys.add(MPS_UNK160).readU16(),
        maxEmitterObj: sys.add(MPS_UNK160 + 2).readU16(),       // ::maxEmitterObj 0x162
        maxParticlesPerFrame: sys.add(MPS_UNK160 + 4).readU16(), // ::maxParticlesPerFrame 0x164
        destroyWhenNotInUse: sys.add(MPS_DESTROY).readU8(),
      };
    } catch (e) { return { slot: sys.toString(), error: String(e) }; }
  }

  if (ALWAYS_LOADED) {
    try {
      const dh = exe.base.add(off.dataHandler).readPointer();
      const data = dh.add(DH_ADDONS + NI_DATA).readPointer();
      const cap = dh.add(DH_ADDONS + NI_CAPACITY).readU16();
      let node = NULL;
      for (let i = 0; i < cap && node.isNull(); i++) {
        const p = data.add(i * 8).readPointer();
        if (!p.isNull() && formIdOf(p) === ADDON) node = p;
      }
      if (node.isNull()) {
        emit({ alwaysLoaded: 'addon not found', capacity: cap });
      } else {
        const before = node.add(ADDON_FLAGS).readU8();
        node.add(ADDON_FLAGS).writeU8(3);  // ADDON_DATA::Flag::kAlwaysLoaded
        emit({ alwaysLoaded: 'set', index: node.add(ADDON_INDEX).readU32(), before: before, after: node.add(ADDON_FLAGS).readU8() });
      }
    } catch (e) { emit({ alwaysLoaded: 'failed', error: String(e) }); }
  }

  const inCone = {};       // thread id -> the cone whose Init3D runs there
  let lastConeLaunch = 0;

  Interceptor.attach(exe.base.add(off.launch), {
    onEnter(args) {
      const ld = args[1];
      if (formIdOf(ld.add(LD_BASE).readPointer()) !== CONE) return;
      lastConeLaunch = Date.now();
      const bt = where(this.context);
      emit({
        launch: true, tid: this.threadId,
        ours: bt.some(function (f) { return f.indexOf('SkyrimPlatformImpl') === 0; }),
        useOrigin: ld.add(LD_USE_ORIGIN).readU8(), system: describe(slot()),
      });
    },
  });

  Interceptor.attach(exe.base.add(off.init3D), {
    onEnter(args) {
      this.cone = baseIdOf(args[0]) === CONE;
      if (!this.cone) return;
      inCone[this.threadId] = args[0].toString();
      emit({ init3D: 'enter', tid: this.threadId, projectile: args[0].toString(), system: describe(slot()) });
    },
    onLeave(ret) {
      if (!this.cone) return;
      delete inCone[this.threadId];
      emit({ init3D: 'leave', tid: this.threadId, ret: ret.toString(), system: describe(slot()) });
    },
  });

  Interceptor.attach(exe.base.add(off.registerEmitters), {
    onEnter() { this.watch = inCone[this.threadId] !== undefined || Date.now() - lastConeLaunch < 2000; },
    onLeave(ret) {
      if (this.watch) emit({ registerEmitters: ret.toInt32(), inConeInit: inCone[this.threadId] !== undefined, tid: this.threadId });
    },
  });

  Interceptor.attach(exe.base.add(off.ensureMPS), {
    onEnter(args) {
      let index = -1;
      try { index = args[0].isNull() ? -1 : args[0].add(ADDON_INDEX).readU32(); } catch (e) { /* not an addon */ }
      this.watch = index === INDEX;
      if (!this.watch) return;
      emit({
        ensureMPS: 'enter', tid: this.threadId, inConeInit: inCone[this.threadId] !== undefined,
        addon: formIdOf(args[0]), flags: args[0].add(ADDON_FLAGS).readU8(), node: args[1].toString(),
        system: describe(slot()),
      });
    },
    onLeave(ret) { if (this.watch) emit({ ensureMPS: 'leave', ret: ret.toString(), system: describe(slot()) }); },
  });

  Interceptor.attach(exe.base.add(off.addEmitter), {
    onEnter(args) {
      this.watch = args[1].toInt32() === INDEX;
      if (!this.watch) return;
      emit({ addEmitter: 'enter', tid: this.threadId, inConeInit: inCone[this.threadId] !== undefined, node: args[2].toString(), system: describe(slot()) });
    },
    onLeave() { if (this.watch) emit({ addEmitter: 'leave', system: describe(slot()) }); },
  });

  let current = NULL;      // slot 64's system as last polled
  let emitsOn64 = 0;
  let emitsAll = 0;
  Interceptor.attach(exe.base.add(off.emitParticles), {
    onEnter(args) {
      emitsAll++;
      if (!current.isNull() && (args[0].equals(current) || args[1].equals(current))) emitsOn64++;
    },
  });

  Interceptor.attach(exe.base.add(off.rebuild), {
    onEnter() { this.before = describe(slot()); },
    onLeave() {
      const after = describe(slot());
      if (after.slot !== this.before.slot) emit({ rebuild: true, tid: this.threadId, before: this.before, after: after });
    },
  });

  Interceptor.attach(exe.base.add(off.kill), {
    onEnter(args) {
      if (baseIdOf(args[0]) === CONE) emit({ kill: true, projectile: args[0].toString(), system: describe(slot()) });
    },
  });

  let last = '';
  setInterval(function () {
    const sys = slot();
    current = sys === null ? NULL : sys;
    const d = describe(sys);
    const key = JSON.stringify(d);
    if (key !== last) { last = key; emit({ poll: d }); }
  }, 50);
  // Emits on slot 64's system every 250 ms when any; every 5 s, all the
  // emit calls seen, so a quiet slot 64 can be told from a dead hook.
  let ticks = 0;
  let allSince = 0;
  setInterval(function () {
    if (emitsOn64 > 0) emit({ emits: emitsOn64, of: emitsAll });
    allSince += emitsAll;
    emitsOn64 = 0;
    emitsAll = 0;
    if (++ticks % 20 === 0) { emit({ emitCalls5s: allSince }); allSince = 0; }
  }, 250);

  emit({ ready: true, version: version, alwaysLoaded: ALWAYS_LOADED, system: describe(slot()) });
}
