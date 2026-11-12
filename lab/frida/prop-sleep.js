// prop-sleep.js v3.0 DRAFT (thuum, 2026-11-12; ADR-071 rung 1, E10's read on both seats, docs/engine/havok-props.md:109): v2 puts a
// body under watch only when its own seat's capsule touches it (79131's layer 4 contact, or 78304's impulse body), so it never sees a
// body its seat grabbed and then dropped or threw (x-prop-rest-e10 v1's fresh review, finding 1, as v1.1's header states it). v3.0 adds
// a third entry, at the leave of PlayerCharacter::StartGrabObject (40552: CommonLibSSE-NG include/RE/Offsets.h:452,
// RELOCATION_ID(39475, 40552); include/RE/P/PlayerCharacter.h:570; `just addr 40552` 0x73ec70, 2026-11-12; prop-grab.js v2.2's
// site, whose leave row already names the grabbed body, c1 grab :34 in 20261112-003027): the player's grabbedObject (0x8D0,
// prop-grab.js v2.2's FIELDS: PlayerCharacter.h:697 "8C8" plus the 8 bytes of the newer runtime data's start, :793-796) becomes the
// grabbed reference by LookupReferenceByHandle (12332: Offsets.h:582, RELOCATION_ID(12204, 12332); `just addr 12332` 0x179710; one
// reference count kept per lookup, as prop-grab.js's is), and its 3D's bodies are found by prop-grab.js v2.2's walk, its code
// unchanged (locator, isNiNode, nodeName, walkBodies; the layouts cited at the constants below). Each body found, up to
// GRAB_WATCH_MAX (8), joins the one watch list and from then on reads as a touched body does: the same per-frame poll, change key,
// sleep rows and field names, so one hand read covers both. One watch a body: a contact or an impulse on a known address adds
// nothing, as in v2; a grab of a known address starts a fresh watch row, its earlier entry under `previous`, since a Disable frees
// a body and a later copy can take its address (x-prop-rest-e10 v1.1's HOW TO READ; the seats reuse local ids as well,
// read-x-prop-engine-v2-003027.md's Ids), and its sleep rows carry the grab's ref from then on. New in the rows: a 'grab' row at
// every StartGrabObject leave (the handle, the ref, the walk's nodes and bodies, the bodies that joined); `via` on every 'watch' row
// ('contact', 'impulse' or 'grab'), and on a grab's its frame, handle, bone, layer, kAnimTargeted bit and the body's own reference by
// FindCollidableRef (26003, the impulse entry's resolution) beside the grabbed one; `body` on every 'sleep' row (a grabbed corpse's
// bodies share one ref); an 'unwatch' row with reason 'room for a grab' when the grab entries are full (the oldest grab's go).
// v2's WATCH_MAX (8) now counts the touched entries alone, so no grab crowds v2's watch. Params: v2's, plus GRAB_WATCH_MAX (8).
// Every new id and offset is a HYPOTHESIS until a grab's watch row and its sleep rows read sane (rule 2). Review before its first
// run (ADR-064 amendment A). v2's header follows.
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
    startGrab: 0x73ec70, // 40552 PlayerCharacter::StartGrabObject (v3.0; prop-grab.js v2.2's, `just addr 40552` 2026-11-12)
    lookupRef: 0x179710, // 12332 LookupReferenceByHandle(const RefHandle&, NiPointer<TESObjectREFR>&) (v3.0; prop-grab.js v2.2's, `just addr 12332` 2026-11-12)
  },
};
// hkpEntity.h: simulationIsland 0x130, motion 0x150; hkpMotion.h: type +0x10, deactivationIntegrateCounter +0x11,
// deactivationNumInactiveFrames +0x12 and +0x14, linearVelocity +0xE0; hkpSimulationIsland.h: the flag byte +0x32
const ENTITY = { island: 0x130, motion: 0x150 };
const MOTION = { type: 0x10, integrateCounter: 0x11, inactiveFrames0: 0x12, inactiveFrames1: 0x14, linearVelocity: 0xe0 };
const ISLAND_FLAGS = 0x32;
const FRAMES_TO_DEACTIVATE = 5; // hkpMotion.h:23
const WATCH_MAX = 8;
// v3.0, the grab's entry: prop-grab.js v2.2's layouts (CommonLibSSE-NG b93280e8, include/RE/, as cited there): grabbedObject 0x8D0
// (P/PlayerCharacter.h:697 "8C8" plus 8 on 1.6.1170, :793-796); TESObjectREFR loadedData +0x68 (T/TESObjectREFR.h:497) and its
// data3D +0x68 (:101); NiAVObject name +0x10 (N/NiObjectNET.h:53) and collisionObject +0x40 (N/NiAVObject.h:156); NiNode children
// +0x110 (N/NiNode.h:76), a NiTArray, _data +0x08 and _capacity +0x10 (N/NiTArray.h:116-117); bhkNiCollisionObject flags +0x18
// (kAnimTargeted 1 << 10) and body +0x20 (B/bhkNiCollisionObject.h:26, :54, :56); the body's referencedObject +0x10, the
// hkpRigidBody (B/bhkRefObject.h:26), the hkpEntity pointer v2's two entries watch (ENTITY above)
const FIELDS = { grabbedObject: 0x8d0 };
const REFR = { loaded: 0x68 };
const LOADED_3D = 0x68;
const NODE = { name: 0x10, collision: 0x40, children: 0x110 };
const NITARRAY = { data: 0x08, capacity: 0x10 };
const COLL = { flags: 0x18, body: 0x20 };
const ANIM_TARGETED = 1 << 10;
const REFERENCED = 0x10;
const NODES_MAX = 8192; // prop-grab.js v2.1's walk bound, in nodes visited
const GRAB_WATCH_MAX = PARAMS.GRAB_WATCH_MAX === undefined ? 8 : Number(PARAMS.GRAB_WATCH_MAX); // v3.0: grab entries at once

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
const isNil = function (p) { return p === null || p === undefined || p.isNull(); }; // v3.0, prop-grab.js v2.2's
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
  // v3.0: prop-grab.js v2.2's lookup and its module bounds (the walk's RTTI reads)
  const lookup = new NativeFunction(at('lookupRef'), 'bool', ['pointer', 'pointer'], 'win64');
  const exeEnd = exe.base.add(exe.size);
  const inExe = function (p) { return !isNil(p) && p.compare(exe.base) >= 0 && p.compare(exeEnd) < 0; };
  const proxyVtable = at('proxyControllerVtable');
  const mainTid = function () { const m = ptrAt(at('mainSingleton'), 0); return m.isNull() ? -1 : u32(m, 0x28); };
  const counts = { contactAdded: 0, impulseBody: 0, frames: 0, startGrab: 0 };
  const attachErrors = [];
  const updateAt = ptrAt(at('playerVtable'), UPDATE_SLOT * Process.pointerSize);
  const hooks = {
    contactAdded: { id: 79131, at: String(at('contactAdded')), bytes: firstBytes(at('contactAdded')) },
    impulseBody: { id: 78304, at: String(at('impulseBody')), bytes: firstBytes(at('impulseBody')) },
    playerUpdate: { id: 208040, at: String(updateAt), bytes: updateAt.isNull() ? 'no slot' : firstBytes(updateAt) },
    startGrab: { id: 40552, at: String(at('startGrab')), bytes: firstBytes(at('startGrab')) },
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

  // the watch list: every clutter body the player's capsule touched, by its pointer, with the reference it belongs to (v3.0: and
  // every body of a reference the player grabbed; `via` names the entry, `seq` orders them)
  const watched = {};
  let watchSeq = 0;
  const countVia = function (grab) { let n = 0; for (const k in watched) if ((watched[k].via === 'grab') === grab) n += 1; return n; };
  const addWatch = function (body, ref, via) {
    if (body.isNull() || ref === '0x0' || ref === '-1') return;
    const k = String(body);
    if (watched[k] !== undefined || countVia(false) >= WATCH_MAX) return; // v3.0: WATCH_MAX counts the touched entries alone
    watched[k] = { body: body, ref: ref, lastKey: null, lastEmit: 0, errors: 0, via: via, seq: ++watchSeq };
    emit({ event: 'watch', via: via, ref: ref, body: k, facts: sleepFacts(body) });
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
      if (b.layer === 4 && b.ownerType === 1) addWatch(b.owner, b.ref, 'contact');
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
      addWatch(this.body, hex(ref), 'impulse');
    },
  });
  } catch (e) { attachErrors.push('impulseBody: ' + e); }

  // v3.0: the grab's entry. MSVC x64 RTTI, read only (prop-grab.js v2.2's locator, after face-dump.js's): vtable[-1] is the complete
  // object locator, its class hierarchy lists the bases
  const locator = function (obj) {
    try {
      const vt = obj.readPointer();
      if (!inExe(vt)) return null;
      const col = vt.sub(8).readPointer();
      if (!inExe(col) || col.readU32() !== 1) return null;
      if (!exe.base.add(col.add(20).readS32()).equals(col)) return null;
      return col;
    } catch (e) { return null; }
  };
  const typeName = function (rvaOf) { return exe.base.add(rvaOf).add(0x10).readCString().replace(/^\.\?AV/, '').replace(/@@$/, ''); };
  const isNiNode = function (obj) {
    const col = locator(obj);
    if (!col) return false;
    try {
      const chd = exe.base.add(col.add(16).readS32());
      const n = chd.add(8).readU32();
      const arr = exe.base.add(chd.add(12).readS32());
      for (let i = 0; i < n && i < 64; i++) if (typeName(exe.base.add(arr.add(4 * i).readS32()).readS32()) === 'NiNode') return true;
    } catch (e) { return false; }
    return false;
  };
  const nodeName = function (node) { const p = ptrAt(node, NODE.name); try { return isNil(p) ? null : p.readCString(); } catch (e) { return null; } };
  // the grabbed reference's bodies: every node of its 3D with a collision object, its hkpRigidBody, bone name, motion type, layer
  // (prop-grab.js v2.2's walk; the motion type and the layer read by v2's own resolutions, the entity's motion +0x150 plus the
  // type's +0x10 and the collidable +0x20 plus its filter info's +0x2C, the same words as prop-grab.js's 0x160 and 0x4C)
  const walkBodies = function (root) {
    const out = [];
    const seen = {};
    let nodes = 0;
    const visit = function (node, depth) {
      if (isNil(node) || depth > 40 || nodes >= NODES_MAX) return;
      const k = String(node);
      if (seen[k]) return;
      seen[k] = true;
      nodes += 1;
      const co = ptrAt(node, NODE.collision);
      if (!isNil(co)) {
        const bhk = ptrAt(co, COLL.body);
        const hkp = isNil(bhk) ? NULL : ptrAt(bhk, REFERENCED);
        if (!isNil(hkp)) {
          const fi = u32(hkp.add(COLLIDABLE_IN_WORLD_OBJECT), 0x2c);
          out.push({ name: nodeName(node), hkp: hkp, type: u8(hkp.add(ENTITY.motion), MOTION.type), layer: fi < 0 ? -1 : fi & 0x7f, animTargeted: (u32(co, COLL.flags) & ANIM_TARGETED) !== 0 });
        }
      }
      if (!isNiNode(node)) return;
      const data = ptrAt(node, NODE.children + NITARRAY.data);
      const cap = u16(node, NODE.children + NITARRAY.capacity);
      for (let i = 0; i < cap && i < 256 && !isNil(data); i++) visit(ptrAt(data, i * 8), depth + 1);
    };
    visit(root, 0);
    out.nodes = nodes;
    out.nodesCapped = nodes >= NODES_MAX;
    return out;
  };
  // a handle to its reference (prop-grab.js v2.2's refOfHandle; the lookup keeps one reference count)
  const refOfHandle = function (handle) {
    if (!(handle > 0)) return NULL;
    const h = Memory.alloc(4);
    h.writeU32(handle);
    const out = Memory.alloc(Process.pointerSize);
    out.writePointer(NULL);
    try { lookup(h, out); return out.readPointer(); } catch (e) { return NULL; }
  };
  // one grabbed body into the watch: a known address starts a fresh entry and watch row (its earlier entry under `previous`); a new
  // grab entry past GRAB_WATCH_MAX drops the oldest grab entry first
  const grabWatch = function (x, ref, handle) {
    const k = String(x.hkp);
    const known = watched[k];
    if (known === undefined || known.via !== 'grab') {
      while (countVia(true) >= GRAB_WATCH_MAX) {
        let oldest = null;
        for (const j in watched) if (watched[j].via === 'grab' && (oldest === null || watched[j].seq < watched[oldest].seq)) oldest = j;
        if (oldest === null) break;
        emit({ event: 'unwatch', ref: watched[oldest].ref, body: oldest, reason: 'room for a grab' });
        delete watched[oldest];
      }
    }
    let bodyRef = 0;
    try { bodyRef = formId(findRef(x.hkp.add(COLLIDABLE_IN_WORLD_OBJECT))); } catch (e) { bodyRef = -1; }
    watched[k] = { body: x.hkp, ref: ref, lastKey: null, lastEmit: 0, errors: 0, via: 'grab', seq: ++watchSeq };
    const row = { event: 'watch', via: 'grab', ref: ref, body: k, facts: sleepFacts(x.hkp), frame: counts.frames, handle: hex(handle), bone: x.name, layer: x.layer, animTargeted: x.animTargeted ? 1 : 0, bodyRef: hex(bodyRef) };
    if (known !== undefined) row.previous = { ref: known.ref, via: known.via, seq: known.seq };
    emit(row);
  };
  try {
    Interceptor.attach(at('startGrab'), {
      onEnter(args) { counts.startGrab += 1; this.player = args[0]; },
      onLeave(retval) {
        try {
          const handle = isNil(this.player) ? -1 : u32(this.player, FIELDS.grabbedObject);
          const refr = refOfHandle(handle);
          const loaded = isNil(refr) ? NULL : ptrAt(refr, REFR.loaded);
          const root = isNil(loaded) ? NULL : ptrAt(loaded, LOADED_3D);
          const bodies = isNil(root) ? [] : walkBodies(root);
          const ref = isNil(refr) ? '0x0' : hex(formId(refr));
          const joined = (ref === '0x0' || ref === '-1') ? [] : bodies.slice(0, GRAB_WATCH_MAX);
          emit({ event: 'grab', frame: counts.frames, tid: this.threadId, handle: hex(handle), ref: ref, has3D: !isNil(root), nodes: bodies.nodes === undefined ? 0 : bodies.nodes, nodesCapped: !!bodies.nodesCapped, bodies: bodies.length, joined: joined.length, bodyList: joined.map(function (x) { return [x.name, x.type, x.layer, x.animTargeted ? 1 : 0]; }) });
          joined.forEach(function (x) { grabWatch(x, ref, handle); });
        } catch (e) { emit({ event: 'error', where: 'StartGrabObject leave', error: String(e) }); }
      },
    });
  } catch (e) { attachErrors.push('startGrab: ' + e); }

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
      emit(Object.assign({ event: 'sleep', ref: w.ref, body: k, frame: counts.frames, asleepByFrames: f.inactiveFrames[0] >= FRAMES_TO_DEACTIVATE && f.inactiveFrames[1] >= FRAMES_TO_DEACTIVATE }, f));
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
  emit({ event: 'ready', script: 'prop-sleep.js', version: version, v: '3.0', raw: RAW, awakeEvery: AWAKE_EVERY, watchMax: WATCH_MAX, grabWatchMax: GRAB_WATCH_MAX, pid: Process.id, base: String(exe.base), mainThread: mainTid(), hooks: hooks, attachErrors: attachErrors });
  let lastFrames = 0;
  setInterval(function () {
    emit({ event: 'liveness', pid: Process.id, counts: JSON.parse(JSON.stringify(counts)), frames10s: counts.frames - lastFrames, sampleMaxMs: sampleMaxMs, watched: Object.keys(watched).length, mainThread: mainTid() });
    lastFrames = counts.frames;
    sampleMaxMs = 0;
  }, 10000);
}
