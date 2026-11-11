// prop-sleep.js v2 DRAFT (thuum, 2026-11-11; ADR-071 rung 0, x-prop-engine v1): E10 is a timing read, and v1 polled on a 100 ms timer
// on Frida's own thread, the shape that stalled a seat (x-trap-rock-hang 20261105-231108: the memory note frida-lab-script-pitfalls,
// "a trace samples once per frame from a game hook, never from a timer callback"). v2 runs the same poll body once a game frame
// inside the player's own update, VTABLE_PlayerCharacter[0] slot 0xAD, Actor::Update(float) (CommonLibSSE-NG
// include/RE/Offsets_VTABLE.h:2231, `just addr 208040` 0x18ab9c0, 2026-11-11; include/RE/A/Actor.h:371), rock-motion-trace.js v1.2's
// idiom; each row carries the frame, so the inactive frames read against frames; POLL_MS is gone, and the change key holds the
// thresholds (the inactive frames capped at 6, no integrate counter) with an awake body printed every AWAKE_EVERY (15) frames. The ready row adds the pid (against
// the run's c<N>-skyrim-platform-pid<N>.log: the memory note lab-frida-wrong-process), base, Main's thread (403449, Main** with threadID
// +0x28, Offsets.h:383, Main.h:87) and each hook's first bytes read before the attach; every attach is caught into attachErrors; a
// liveness row every 10 s carries each hook's count before its filter, the frames and the slowest sample. The watch's reads, its
// rows and its rules are v1's. E10's verdict counts only on a run after ADR-071 decision 7's cap lands (60 fps, a static 1/60 step;
// docs/research/physics-leg-2026-11-11.md step 5): before it, its rows are the pre-cap baseline. v2's params: RAW (false),
// AWAKE_EVERY (15). Review before its first run (ADR-064 rule A). v1's header follows.
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
function emit(obj) { obj.t = Date.now(); send(obj); console.log(JSON.stringify(obj)); }

const OFFSETS = {
  '1.6.1170.0': {
    contactAdded: 0xed1540, // 79131 bhkCharProxyController::ContactPointAddedCallback
    impulseBody: 0xea1600, // 78304 the surface interaction's impulse body
    findCollidableRef: 0x3fd3d0, // 26003 TESHavokUtilities::FindCollidableRef
    proxyControllerVtable: 0x19edff0, // 240560 the proxy controller's bhkCharacterController vtable (at +0x10)
    playerVtable: 0x18ab9c0, // 208040 VTABLE_PlayerCharacter[0] (v2: slot 0xAD, the per-frame poll)
    mainSingleton: 0x31872c0, // 403449 Main** (v2)
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
const firstBytes = function (p) {
  try { return Array.from(new Uint8Array(p.readByteArray(8))).map(function (b) { return ('0' + b.toString(16)).slice(-2); }).join(' '); } catch (e) { return 'unreadable'; }
};
const UPDATE_SLOT = 0xad; // Actor::Update(float a_delta), include/RE/A/Actor.h:371
const AWAKE_EVERY = PARAMS.AWAKE_EVERY === undefined ? 15 : Number(PARAMS.AWAKE_EVERY); // v2: frames between an awake body's rows

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
  const mainTid = function () { const m = ptrAt(at('mainSingleton'), 0); return m.isNull() ? -1 : u32(m, 0x28); };
  const counts = { contactAdded: 0, impulseBody: 0, frames: 0 };
  const attachErrors = [];
  const updateAt = ptrAt(at('playerVtable'), UPDATE_SLOT * Process.pointerSize);
  const hooks = {
    contactAdded: { id: 79131, at: String(at('contactAdded')), bytes: firstBytes(at('contactAdded')) },
    impulseBody: { id: 78304, at: String(at('impulseBody')), bytes: firstBytes(at('impulseBody')) },
    playerUpdate: { id: 208040, at: String(updateAt), bytes: updateAt.isNull() ? 'no slot' : firstBytes(updateAt) },
  };

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
  try {
  Interceptor.attach(at('contactAdded'), {
    onEnter(args) {
      counts.contactAdded += 1;
      if (!ptrAt(args[0], 0x10).equals(proxyVtable)) return; // the player's proxy alone
      const b = collidableFacts(ptrAt(args[2], 0x30));
      if (b.layer === 4 && b.ownerType === 1) addWatch(b.owner, b.ref);
    },
  });
  } catch (e) { attachErrors.push('contactAdded: ' + e); }
  try {
  Interceptor.attach(at('impulseBody'), {
    onEnter(args) { counts.impulseBody += 1; this.body = ptrAt(args[1], 0x30); },
    onLeave(retval) {
      if (this.body.isNull()) return;
      let ref = 0;
      try { ref = formId(findRef(this.body.add(COLLIDABLE_IN_WORLD_OBJECT))); } catch (e) { ref = -1; }
      addWatch(this.body, hex(ref));
    },
  });
  } catch (e) { attachErrors.push('impulseBody: ' + e); }

  // v2: the poll once a game frame inside the player's own update (v1's body, unchanged but for the frame on each row)
  let sampleMaxMs = 0;
  const poll = function () {
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
      // v2: polled every frame, so the key holds the thresholds, not the counters' every value (the integrate counter moves each
      // step): the inactive frames capped at 6, so the climb to 5 prints each frame and then stops; an awake body prints every
      // AWAKE_EVERY frames besides
      const key = [f.type, Math.min(f.inactiveFrames[0], 6), Math.min(f.inactiveFrames[1], 6), f.inActiveArray, f.activeMark].join('/');
      const awake = f.inActiveArray === 1 || f.speed > 0.1;
      if (key === w.lastKey && !(awake && counts.frames - (w.lastFrame || 0) >= AWAKE_EVERY)) continue;
      w.lastFrame = counts.frames;
      w.lastKey = key;
      w.lastEmit = now;
      emit(Object.assign({ event: 'sleep', ref: w.ref, frame: counts.frames, asleepByFrames: f.inactiveFrames[0] >= FRAMES_TO_DEACTIVATE && f.inactiveFrames[1] >= FRAMES_TO_DEACTIVATE }, f));
    }
  };
  if (!updateAt.isNull()) {
    try {
      Interceptor.attach(updateAt, {
        onEnter() {
          counts.frames += 1;
          const t0 = Date.now();
          try { poll(); } catch (e) { emit({ event: 'error', where: 'poll', error: String(e) }); }
          const dt = Date.now() - t0;
          if (dt > sampleMaxMs) sampleMaxMs = dt;
        },
      });
    } catch (e) { attachErrors.push('playerUpdate: ' + e); }
  } else attachErrors.push('playerUpdate: no slot');
  emit({ event: 'ready', version: version, v: 2, raw: RAW, pid: Process.id, base: String(exe.base), mainThread: mainTid(), hooks: hooks, attachErrors: attachErrors });
  let lastFrames = 0;
  setInterval(function () {
    emit({ event: 'liveness', pid: Process.id, counts: JSON.parse(JSON.stringify(counts)), frames10s: counts.frames - lastFrames, sampleMaxMs: sampleMaxMs, watched: Object.keys(watched).length, mainThread: mainTid() });
    lastFrames = counts.frames;
    sampleMaxMs = 0;
  }, 10000);
}
