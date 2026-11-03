// prop-sleep.js: the engine's own sleep of a prop against the client's stand-in (thuum docs/engine/havok-props.md row E10;
// docs/verbs/prop-physics.md A3, A4 and :348's SLEEP_AFTER_MS and STIR_UNITS). The client calls a simulated body asleep after
// 500 ms under 0.25 units of stir and sends one reliable asleep sample ("stream <refr> asleep" in the seat's console log); Havok
// deactivates a body by its own count: hkpMotion's deactivationIntegrateCounter (CommonLibSSE-NG include/RE/H/hkpMotion.h:79,
// +0x11) and deactivationNumInactiveFrames[2] (:80, +0x12; kNumInactiveFramesToDeactivate 5 at :23), and the body's island leaves
// the active islands array (include/RE/H/hkpSimulationIsland.h:42-43: the byte at +0x32 holds isInActiveIslandsArray in bits 0-1
// and activeMark in bits 2-3, two-bit flags). The body is an hkpEntity (include/RE/H/hkpEntity.h: simulationIsland at 0x130,
// motion at 0x150; the motion's type +0x10 and linearVelocity +0xE0, hkpMotion.h:78, :86). Bodies are found the way
// prop-contact.js finds them: the player's proxy contact (79131) and the surface pass's impulse body (78304), the reference by
// FindCollidableRef (26003); every clutter body (layer 4) the player touches joins a watch list, and a poll every POLL_MS (100)
// reads each watched body's motion type, speed, deactivation counters and island flags, emitting on change and once a second
// while the body is awake, so the trace is a timeline of the engine's sleep to set beside the client's asleep stamp. Expected on
// the simulating seat (E10): the frames count climbs to 5 and the island leaves the active array within one sample interval of
// the client's asleep send (A3's PROP_MOVING_MS and A4's return are sized against it); on the non-owner's seat the copy reads
// motion type 4 (Keyframed) and its counters tell what a Keyframed body does. Every id and offset is a HYPOTHESIS until this
// trace reads as expected (rule 2); RAW shows the raw words. Params: POLL_MS (100), RAW (false).
// Offsets by `just addr` (lab/addr.py, Address Library 1.6.1170 only): the three functions and the vtable on 2026-10-29
// (prop-contact.js), this script 2026-11-03.
const PARAMS = (typeof LAB_PARAMS === 'object' && LAB_PARAMS) ? LAB_PARAMS : {};
const RAW = PARAMS.RAW === undefined ? false : !!PARAMS.RAW;
const POLL_MS = PARAMS.POLL_MS === undefined ? 100 : Number(PARAMS.POLL_MS);
function emit(obj) { obj.t = Date.now(); send(obj); console.log(JSON.stringify(obj)); }

const OFFSETS = {
  '1.6.1170.0': {
    contactAdded: 0xed1540, // 79131 bhkCharProxyController::ContactPointAddedCallback
    impulseBody: 0xea1600, // 78304 the surface interaction's impulse body
    findCollidableRef: 0x3fd3d0, // 26003 TESHavokUtilities::FindCollidableRef
    proxyControllerVtable: 0x19edff0, // 240560 the proxy controller's bhkCharacterController vtable (at +0x10)
  },
};
// hkpEntity.h: simulationIsland 0x130, motion 0x150; hkpMotion.h: type +0x10, deactivationIntegrateCounter +0x11,
// deactivationNumInactiveFrames +0x12 and +0x14, linearVelocity +0xE0; hkpSimulationIsland.h: the flag byte +0x32
const ENTITY = { island: 0x130, motion: 0x150 };
const MOTION = { type: 0x10, integrateCounter: 0x11, inactiveFrames0: 0x12, inactiveFrames1: 0x14, linearVelocity: 0xe0 };
const ISLAND_FLAGS = 0x32;
const FRAMES_TO_DEACTIVATE = 5; // hkpMotion.h:23
const WATCH_MAX = 8;

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

const formId = function (p) { try { return p.isNull() ? 0 : p.add(0x14).readU32(); } catch (e) { return -1; } };
const hex = function (n) { return n < 0 ? String(n) : '0x' + n.toString(16); };
const u32 = function (p, o) { try { return p.add(o).readU32(); } catch (e) { return -1; } };
const u16 = function (p, o) { try { return p.add(o).readU16(); } catch (e) { return -1; } };
const u8 = function (p, o) { try { return p.add(o).readU8(); } catch (e) { return -1; } };
const s8 = function (p, o) { try { return p.add(o).readS8(); } catch (e) { return -128; } };
const f32 = function (p, o) { try { return p.add(o).readFloat(); } catch (e) { return NaN; } };
const ptrAt = function (p, o) { try { return p.add(o).readPointer(); } catch (e) { return NULL; } };
const r1 = function (x) { return Math.round(x * 10) / 10; };
const raw = function (args) { return RAW ? [String(args[0]), String(args[1]), String(args[2]), String(args[3])] : undefined; };

// hkpWorldObject.h: the embedded hkpLinkedCollidable's offset (the header's comment column; verified at write time)
const COLLIDABLE_IN_WORLD_OBJECT = 0x20;
const exe = Process.getModuleByName('SkyrimSE.exe');
const version = fileVersion(exe.path);
const off = OFFSETS[version];
if (off === undefined) {
  emit({ error: 'no offsets for this runtime', version: version });
} else {
  const at = function (name) { return exe.base.add(off[name]); };
  const findRef = new NativeFunction(at('findCollidableRef'), 'pointer', ['pointer']);
  const proxyVtable = at('proxyControllerVtable');

  // the sleep fields of one body: its motion's type, the deactivation counters, the island's flags, its speed
  const sleepFacts = function (body) {
    const m = body.add(ENTITY.motion);
    const island = ptrAt(body, ENTITY.island);
    const flags = island.isNull() ? -1 : u8(island, ISLAND_FLAGS);
    const vel = [f32(m, MOTION.linearVelocity), f32(m, MOTION.linearVelocity + 4), f32(m, MOTION.linearVelocity + 8)];
    return {
      type: u8(m, MOTION.type),
      integrateCounter: u8(m, MOTION.integrateCounter),
      inactiveFrames: [u16(m, MOTION.inactiveFrames0), u16(m, MOTION.inactiveFrames1)],
      island: String(island),
      inActiveArray: flags < 0 ? -1 : flags & 3,
      activeMark: flags < 0 ? -1 : (flags >> 2) & 3,
      speed: r1(Math.sqrt(vel[0] * vel[0] + vel[1] * vel[1] + vel[2] * vel[2])),
    };
  };

  // the watch list: every clutter body the player's capsule touched, by its pointer, with the reference it belongs to
  const watched = {};
  const addWatch = function (body, ref) {
    if (body.isNull() || ref === '0x0' || ref === '-1') return;
    const k = String(body);
    if (watched[k] !== undefined || Object.keys(watched).length >= WATCH_MAX) return;
    watched[k] = { body: body, ref: ref, lastKey: null, lastEmit: 0, errors: 0 };
    emit({ event: 'watch', ref: ref, body: k, facts: sleepFacts(body) });
  };

  // the collidable (hkpCollidable.h): ownerOffset int8 at +0x20, the typed broad-phase handle's type at +0x28 and
  // collisionFilterInfo at +0x2c; the owner is this plus ownerOffset (type 1 = an entity, the rigid body); the layer is
  // the low seven bits of the filter info
  const collidableFacts = function (c) {
    if (c.isNull()) return { layer: -1, ref: '0x0', ownerType: -1, owner: NULL };
    const layer = u32(c, 0x2c) & 0x7f;
    const type = s8(c, 0x28);
    const ownerOffset = s8(c, 0x20);
    const owner = c.add(ownerOffset);
    let ref = 0;
    try { ref = formId(findRef(c)); } catch (e) { ref = -1; }
    return { layer: layer, ref: hex(ref), ownerType: type, owner: type === 1 ? owner : NULL };
  };
  Interceptor.attach(at('contactAdded'), {
    onEnter(args) {
      if (!ptrAt(args[0], 0x10).equals(proxyVtable)) return; // the player's proxy alone
      const b = collidableFacts(ptrAt(args[2], 0x30));
      if (b.layer === 4 && b.ownerType === 1) addWatch(b.owner, b.ref);
    },
  });
  Interceptor.attach(at('impulseBody'), {
    onEnter(args) { this.body = ptrAt(args[1], 0x30); },
    onLeave(retval) {
      if (this.body.isNull()) return;
      let ref = 0;
      try { ref = formId(findRef(this.body.add(COLLIDABLE_IN_WORLD_OBJECT))); } catch (e) { ref = -1; }
      addWatch(this.body, hex(ref));
    },
  });

  setInterval(function () {
    const now = Date.now();
    for (const k in watched) {
      const w = watched[k];
      let f;
      try { f = sleepFacts(w.body); } catch (e) { f = undefined; }
      if (f === undefined || f.type < 0 || f.type > 7) {
        w.errors += 1;
        if (w.errors > 5) { emit({ event: 'unwatch', ref: w.ref, body: k }); delete watched[k]; }
        continue;
      }
      w.errors = 0;
      const key = [f.type, f.integrateCounter, f.inactiveFrames[0], f.inactiveFrames[1], f.inActiveArray, f.activeMark].join('/');
      const awake = f.inActiveArray === 1 || f.speed > 0.1;
      if (key === w.lastKey && !(awake && now - w.lastEmit >= 1000)) continue;
      w.lastKey = key;
      w.lastEmit = now;
      emit(Object.assign({ event: 'sleep', ref: w.ref, asleepByFrames: f.inactiveFrames[0] >= FRAMES_TO_DEACTIVATE && f.inactiveFrames[1] >= FRAMES_TO_DEACTIVATE }, f));
    }
  }, POLL_MS);
  emit({ event: 'ready', version: version, poll_ms: POLL_MS, raw: RAW });
}
