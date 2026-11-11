// prop-grab.js v2.1 DRAFT (thuum, 2026-11-11; the fresh review's FIX FIRST applied as written, ADR-064 amendment A): (1) the hold
// rows' scale is bhkWorld::GetWorldScaleInverse's float (187407, include/RE/B/bhkWorld.h:48-52, `just addr 187407` 0x177adfc), game
// units per Havok unit, where v2 read GetWorldScale's (188105, :42-46, 0x17849dc), its inverse: the exe's .rdata holds 69.99125 and
// 0.0142875 there (lab/.cache/game/exe-1.6.1170, read 2026-11-11; the adr065 read's :781 and :821), so v2's (1, 1000) test failed and
// fell back to 1, printing Havok units under game units' names; v2.1 trusts the scale only when the two floats multiply to 1, prints
// both in the ready row, and labels each hold row's units ('game', or 'havok' with the raw values when the scale did not read);
// (2) the body walk counts every body of the grabbed 3D (a NODES_MAX of 8192 nodes bounds it) where v2 stopped at BODIES_MAX, so the
// facts' body count and motion types are the whole body's; BODIES_MAX (64) now bounds only the printed bodyList, and the springs are
// matched against every body walked; (3) a citation corrected (ExtraDataList.h:44). v2's header follows, corrected in place.
// prop-grab.js v2 DRAFT (thuum, 2026-11-11; ADR-071 rung 0, docs/research/physics-leg-2026-11-11.md H5): v1 extended for a grab on a
// corpse, for x-corpse-grab v1 (a host's corpse and a watcher's corpse, each grabbed) beside x-prop-engine v1's ingot legs. New in v2,
// so a fresh review comes before its first run (ADR-064 rule A):
// - H5's reads, at StartGrabObject's leave, at DestroyMouseSprings and whenever the grabbed handle changes: the grabbed reference's
//   form type, an actor's life state, its 3D's bodies counted by motion type (H5: "a laid corpse is Dynamic"; 1 dynamic, 4
//   keyframed, include/RE/H/hkpMotion.h:26-35) with each body's bone name, layer and kAnimTargeted bit, and the activation block:
//   the kBlockActivate bit of the reference's ExtraFlags, the bit canon sets on every dead NPC body (skymp5-client
//   puppetService.ts:515-530 at fork canon 24f1cc6a, blockDeadBody: ac.blockActivation(true) at :526, its line "[verb:containers]
//   body <id>: activation blocked, the loot is the server's container" at :529); whether StartGrabObject runs at all for a blocked
//   body is the other half of the answer, read against the hold-key step's stamp.
// - The grab's springs (H5: "the engine grabs a ragdoll"): grabSpring, PlayerCharacter.h:696, a BSTSmallArray<hkRefPtr<
//   bhkMouseSpringAction>, 4> whose comment reads 898 in the older layout, so 0x8A0 on 1.6.1170 (the v1 shift below; 0x898 plus its
//   0x30 bytes is the 8C8 that grabbedObject's comment reads, so the size checks); its allocator word +0x00 (capacity bits 0-30,
//   the local bit 31, include/RE/B/BSTArray.h:280-281), the data +0x08 (inline when local, else a heap pointer, :282), the size
//   +0x28 (BSTArrayBase's _size, :47, after the 0x28-byte allocator). Each entry: its vtable against VTABLE_bhkMouseSpringAction
//   (Offsets_VTABLE.h:2233, `just addr 208070` 0x18ac640), its referenced Havok action +0x10 (bhkRefObject.h:26, HYPOTHESIS that the
//   spring is a bhkRefObject), that hkpAction's world +0x10 and island +0x18 (include/RE/H/hkpAction.h:23-24), and which body of
//   the grabbed reference a word of the action names: hkpUnaryAction's entity is not in CommonLib, so the six words at +0x30 to +0x58
//   are compared by value with the walk's bodies and a match is named, never assumed (additem-functor.js's rule).
// - While a grab holds, every HOLD_EVERY (30) frames: the named bodies' positions and speeds in game units (the drag's timeline).
// - The poll moves from v1's 250 ms timer on Frida's JS thread into the player's own update, once a game frame, emitting on change
//   (a timer poll stalled a seat: x-trap-rock-hang 20261105-231108, the memory note frida-lab-script-pitfalls; rock-motion-trace.js
//   v1.2's idiom): VTABLE_PlayerCharacter[0] slot 0xAD, Actor::Update(float) (Offsets_VTABLE.h:2231, `just addr 208040` 0x18ab9c0;
//   include/RE/A/Actor.h:371). POLL_MS is gone. The lookups now run on the update's thread.
// - The ready row proves the hooks (pid against the run's c<N>-skyrim-platform-pid<N>.log, the memory note lab-frida-wrong-process;
//   base; Main's thread, 403449 0x31872c0 Main** with threadID +0x28, Offsets.h:383 and Main.h:87; each site's first bytes read
//   before the attach); a liveness row every 10 s carries every hook's count before its filter and the frames.
// The v2 layouts (CommonLibSSE-NG b93280e8, include/RE/): TESForm formID +0x14, formType +0x1A (T/TESForm.h:353-355; ACHR 0x3E,
// F/FormTypes.h:202); TESObjectREFR data.objectReference +0x40 (T/TESObjectREFR.h:77, :495), loadedData +0x68 (:497), data3D +0x68
// (:101), extraList +0x70 (:498) whose head is +0x08 on AE (E/ExtraDataList.h:44, the second column), each BSExtraData's next +0x08
// (B/BSExtraData.h:32), ExtraFlags' flags +0x10 and kBlockActivate bit 0 (E/ExtraFlags.h:17, :32), its vtable VTABLE_ExtraFlags
// (Offsets_VTABLE.h:174, `just addr 186869` 0x1771470: the chain is matched by vtable without the list's lock, HYPOTHESIS as
// apply-on-demand.js's extraNoLock is); an Actor's ActorState at +0xC0 on AE (A/Actor.h:128), actorState1 +0x08 (A/ActorState.h:203),
// lifeState bits 21-24 (:114; kAlive 0, kDying 1, kDead 2, :9-11); NiAVObject name +0x10 (N/NiObjectNET.h:53), collisionObject +0x40
// (N/NiAVObject.h:156); NiNode children +0x110 (N/NiNode.h:76), a NiTArray, _data +0x08, _capacity +0x10 (N/NiTArray.h:116-117), the
// walk descending a node only when its RTTI names NiNode among its bases (face-dump.js's locator; Skochinsky, "Reversing Microsoft
// Visual C++ Part II", OpenRCE 2006); bhkNiCollisionObject flags +0x18 (kAnimTargeted 1 << 10) and body +0x20
// (B/bhkNiCollisionObject.h:26, :54, :56); the body's referencedObject +0x10, the hkpRigidBody (B/bhkRefObject.h:26); its motion
// +0x150 (H/hkpEntity.h:99), the motion's type +0x10, position +0x50 (motionState +0x20, its translation +0x30: H/hkpMotion.h:77,
// :82, H/hkMotionState.h:14, H/hkTransform.h:12), linear velocity +0xE0 (hkpMotion.h:84); the layer the low seven bits of the
// collidable's filter info at +0x4C (H/hkpWorldObject.h:67, H/hkpCollidable.h:54, :72, H/hkpTypedBroadPhaseHandle.h:19); game units
// by GetWorldScaleInverse's float (B/bhkWorld.h:48-52, `just addr 187407` 0x177adfc), checked against GetWorldScale's (:42-46, 188105,
// 0x17849dc), its inverse (v2.1). v1's header follows.
//
// prop-grab.js: the player's grab of a prop, on the grabber's seat and on the other seat (thuum docs/engine/havok-props.md
// rows E13, E14, E15, E31; docs/verbs/prop-physics.md A2 and A6). The engine's grab is PlayerCharacter::StartGrabObject
// (CommonLibSSE-NG include/RE/Offsets.h:452, RELOCATION_ID(39475, 40552); include/RE/P/PlayerCharacter.h:570); its end is
// DestroyMouseSprings (src/RE/P/PlayerCharacter.cpp:66-70, RELOCATION_ID(39480, 40557); EndGrabObject at :74-79 is inline
// and calls it when grabType is kNormal). The player's grab state lives in its runtime data: grabbedObject (an
// ObjectRefHandle, PlayerCharacter.h:697 "8C8"), grabObjectWeight (:698 "8CC") and grabType (:712 "AF4"; GrabbingType
// kNone 0, kNormal 1, kTelekinesis 2 at :255-260). The runtime data begins at 0x3E0 on runtimes newer than 1.6.629
// (GetPlayerRuntimeData, PlayerCharacter.h:793-796: RelocateMemberIfNewer 0x3D8, 0x3E0) and the field comments are the
// older layout's absolute offsets (the first field reads "3D8, 3E0"), so on 1.6.1170 each field sits 8 bytes on:
// grabbedObject 0x8D0, grabObjectWeight 0x8D4, grabType 0xAFC (HYPOTHESIS until a grab reads a sane handle and weight
// here; RAW shows the raw words). The player is the singleton at 403521 (Offsets.h:451; PlayerCharacter.cpp:16-20, a
// NiPointer<PlayerCharacter>*); a handle becomes a reference through LookupReferenceByHandle (Offsets.h:582,
// RELOCATION_ID(12204, 12332)); each lookup keeps one reference count, as face-dump.js's does. Hooks: StartGrabObject (enter and
// leave: the grab fields before and after, the grabbed reference's form id), DestroyMouseSprings (the release: the fields at
// entry); the per-frame poll emits the grab fields whenever they change, so each seat's hold is a timeline. Expected on the
// grabber's seat: StartGrabObject once per E held past the engine's threshold (the gap from the lab's key press to the enter
// stamp IS the threshold, E13), the handle non-zero and the weight set on leave, the poll holding them until DestroyMouseSprings;
// on the other seat during the hold: no StartGrabObject and the poll's handle 0 throughout (E14, E15); and if the other seat's E
// is held on the same body (a Keyframed copy under the holder's stream): StartGrabObject with the handle still 0 on leave,
// or no call at all (E31, E28's refusal). Every id is a HYPOTHESIS until this trace reads as expected (rule 2).
// Params: RAW (false), HOLD_EVERY (30 frames), BODIES_MAX (64 bodies printed in bodyList; v2.1: the walk counts every body).
// Offsets by `just addr` (lab/addr.py, Address Library 1.6.1170 only), 2026-11-03; v2's 2026-11-11.
const PARAMS = (typeof LAB_PARAMS === 'object' && LAB_PARAMS) ? LAB_PARAMS : {};
const RAW = PARAMS.RAW === undefined ? false : !!PARAMS.RAW;
const HOLD_EVERY = PARAMS.HOLD_EVERY === undefined ? 30 : Number(PARAMS.HOLD_EVERY);
const BODIES_MAX = PARAMS.BODIES_MAX === undefined ? 64 : Number(PARAMS.BODIES_MAX);
const NODES_MAX = 8192; // v2.1: the walk's bound, in nodes visited (a humanoid's 3D is a few hundred)
function emit(obj) { obj.t = Date.now(); send(obj); console.log(JSON.stringify(obj)); }

const OFFSETS = {
  '1.6.1170.0': {
    startGrab: 0x73ec70, // 40552 PlayerCharacter::StartGrabObject
    destroyMouseSprings: 0x7414b0, // 40557 PlayerCharacter::DestroyMouseSprings
    playerSingleton: 0x31874f8, // 403521 the NiPointer<PlayerCharacter> singleton
    lookupRef: 0x179710, // 12332 LookupReferenceByHandle(const RefHandle&, NiPointer<TESObjectREFR>&)
    mainSingleton: 0x31872c0, // 403449 Main** (v2)
    playerVtable: 0x18ab9c0, // 208040 VTABLE_PlayerCharacter[0] (v2: slot 0xAD, the per-frame poll)
    springVtable: 0x18ac640, // 208070 VTABLE_bhkMouseSpringAction[0] (v2)
    extraFlagsVtable: 0x1771470, // 186869 VTABLE_ExtraFlags[0] (v2)
    worldScaleInverse: 0x177adfc, // 187407 bhkWorld::GetWorldScaleInverse's float: game units per Havok unit (v2.1)
    worldScale: 0x17849dc, // 188105 bhkWorld::GetWorldScale's float: Havok units per game unit, the cross-check (v2.1)
  },
};
// PlayerCharacter.h:696-698 and :712, the older layout's "898", "8C8", "8CC", "AF4" plus the 8 bytes of the newer runtime-data start
const FIELDS = { grabSpring: 0x8a0, grabbedObject: 0x8d0, grabObjectWeight: 0x8d4, grabType: 0xafc };
const SPRING = { word: 0x00, data: 0x08, size: 0x28, max: 8 };
const FORM = { id: 0x14, type: 0x1a };
const ACHR = 0x3e;
const REFR = { base: 0x40, loaded: 0x68, extraHead: 0x78 };
const LOADED_3D = 0x68;
const ACTOR_STATE1 = 0xc8;
const LIFE = ['kAlive', 'kDying', 'kDead', 'kUnconcious', 'kReanimate', 'kRecycle', 'kRestrained', 'kEssentialDown', 'kBleedout'];
const NODE = { name: 0x10, collision: 0x40, children: 0x110 };
const NITARRAY = { data: 0x08, capacity: 0x10 };
const COLL = { flags: 0x18, body: 0x20 };
const ANIM_TARGETED = 1 << 10;
const REFERENCED = 0x10;
const FILTER_INFO = 0x4c;
const MOTION = { type: 0x160, pos: 0x1a0, linV: 0x230 }; // from the hkpRigidBody: motion +0x150 plus type +0x10, position +0x50, linear velocity +0xE0
const ACTION = { world: 0x10, island: 0x18, words: [0x30, 0x38, 0x40, 0x48, 0x50, 0x58] };
const EXTRA = { next: 0x08, flags: 0x10 };
const BLOCK_ACTIVATE = 1 << 0;
const UPDATE_SLOT = 0xad;

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
const hex = function (n) { return n < 0 ? String(n) : '0x' + (n >>> 0).toString(16); };
const isNil = function (p) { return p === null || p === undefined || p.isNull(); };
const u8 = function (p, o) { try { return p.add(o).readU8(); } catch (e) { return -1; } };
const u16 = function (p, o) { try { return p.add(o).readU16(); } catch (e) { return -1; } };
const u32 = function (p, o) { try { return p.add(o).readU32(); } catch (e) { return -1; } };
const f32 = function (p, o) { try { return p.add(o).readFloat(); } catch (e) { return NaN; } };
const ptrAt = function (p, o) { try { return p.add(o).readPointer(); } catch (e) { return NULL; } };
const r1 = function (x) { return Math.round(x * 10) / 10; };
const raw = function (args) { return RAW ? [String(args[0]), String(args[1]), String(args[2]), String(args[3])] : undefined; };
const firstBytes = function (p) {
  try { return Array.from(new Uint8Array(p.readByteArray(8))).map(function (b) { return ('0' + b.toString(16)).slice(-2); }).join(' '); } catch (e) { return 'unreadable'; }
};

const exe = Process.getModuleByName('SkyrimSE.exe');
const version = fileVersion(exe.path);
const off = OFFSETS[version];
if (off === undefined) {
  emit({ error: 'no offsets for this runtime', version: version, pid: Process.id });
} else {
  const at = function (name) { return exe.base.add(off[name]); };
  const rva = function (p) { try { return hex(p.sub(exe.base).toUInt32()); } catch (e) { return String(p); } };
  const exeEnd = exe.base.add(exe.size);
  const inExe = function (p) { return !isNil(p) && p.compare(exe.base) >= 0 && p.compare(exeEnd) < 0; };
  const lookup = new NativeFunction(at('lookupRef'), 'bool', ['pointer', 'pointer'], 'win64');
  // game units per Havok unit: GetWorldScaleInverse's float, trusted only when GetWorldScale's is its inverse (v2.1); without it the
  // hold rows print Havok units and say so
  const scaleInverse = f32(at('worldScaleInverse'), 0);
  const scaleForward = f32(at('worldScale'), 0);
  const scaleOk = scaleInverse > 1 && scaleInverse < 1000 && Math.abs(scaleInverse * scaleForward - 1) < 0.001;
  const SCALE = scaleOk ? scaleInverse : 1;
  const UNITS = scaleOk ? 'game' : 'havok';
  const mainTid = function () { return u32(ptrAt(at('mainSingleton'), 0), 0x28); };
  const counts = { frames: 0, startGrab: 0, destroyMouseSprings: 0 };
  const attachErrors = [];
  const failed = {};
  const fail = function (where, e) { if (failed[where]) return; failed[where] = true; emit({ event: 'error', where: where, error: String(e) }); };

  // MSVC x64 RTTI, read only (face-dump.js's locator): vtable[-1] is the complete object locator, its class hierarchy lists the bases
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
          const fi = u32(hkp, FILTER_INFO);
          out.push({ name: nodeName(node), hkp: hkp, type: u8(hkp, MOTION.type), layer: fi < 0 ? -1 : fi & 0x7f, animTargeted: (u32(co, COLL.flags) & ANIM_TARGETED) !== 0 });
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
  // the activation block: the ExtraFlags in the reference's extra list, matched by vtable, read without the list's lock
  const blockedOf = function (refr) {
    let node = ptrAt(refr, REFR.extraHead);
    for (let i = 0; i < 128 && !isNil(node); i++) {
      if (ptrAt(node, 0).equals(at('extraFlagsVtable'))) {
        const fl = u32(node, EXTRA.flags);
        return fl < 0 ? 'unreadable' : (fl & BLOCK_ACTIVATE) !== 0;
      }
      node = ptrAt(node, EXTRA.next);
    }
    return 'no ExtraFlags';
  };
  const refFacts = function (refr) {
    if (isNil(refr)) return { facts: null, bodies: [] };
    const type = u8(refr, FORM.type);
    const b = ptrAt(refr, REFR.base);
    const f = { ref: hex(formId(refr)), base: hex(isNil(b) ? 0 : formId(b)), formType: hex(type) };
    if (type === ACHR) {
      const st = u32(refr, ACTOR_STATE1);
      const life = st < 0 ? -1 : (st >>> 21) & 0xf;
      f.lifeState = life;
      f.life = LIFE[life] || '?';
    }
    f.activationBlocked = blockedOf(refr);
    const loaded = ptrAt(refr, REFR.loaded);
    const root = isNil(loaded) ? NULL : ptrAt(loaded, LOADED_3D);
    f.has3D = !isNil(root);
    const bodies = isNil(root) ? [] : walkBodies(root);
    const byType = {};
    bodies.forEach(function (x) { byType[x.type] = (byType[x.type] || 0) + 1; });
    f.bodies = bodies.length;
    f.motionTypes = byType;
    f.animTargeted = bodies.filter(function (x) { return x.animTargeted; }).length;
    f.nodes = bodies.nodes === undefined ? 0 : bodies.nodes;
    f.nodesCapped = !!bodies.nodesCapped;
    f.bodyList = bodies.slice(0, BODIES_MAX).map(function (x) { return [x.name, x.type, x.layer, x.animTargeted ? 1 : 0]; });
    f.bodyListCut = bodies.length > BODIES_MAX;
    return { facts: f, bodies: bodies };
  };
  // the grab's springs, each named by the grabbed reference's body a word of its Havok action holds
  const springsOf = function (player, bodies) {
    if (isNil(player)) return null;
    const arr = player.add(FIELDS.grabSpring);
    const word = u32(arr, SPRING.word);
    const local = word < 0 ? -1 : (word >>> 31) & 1;
    const size = u32(arr, SPRING.size);
    const data = local === 1 ? arr.add(SPRING.data) : ptrAt(arr, SPRING.data);
    const entries = [];
    for (let i = 0; i < size && i < SPRING.max && !isNil(data); i++) {
      const a = ptrAt(data, i * 8);
      if (isNil(a)) { entries.push(null); continue; }
      const hka = ptrAt(a, REFERENCED);
      const e = { action: String(a), vtableIsSpring: ptrAt(a, 0).equals(at('springVtable')), hkpAction: String(hka) };
      if (!isNil(hka)) {
        e.world = String(ptrAt(hka, ACTION.world));
        e.island = String(ptrAt(hka, ACTION.island));
        e.words = ACTION.words.map(function (o) { return String(ptrAt(hka, o)); });
        e.names = [];
        ACTION.words.forEach(function (o) {
          const w = ptrAt(hka, o);
          if (isNil(w)) return;
          bodies.forEach(function (x) { if (w.equals(x.hkp)) e.names.push({ word: hex(o), body: x.name, type: x.type }); });
        });
      }
      entries.push(e);
    }
    return { word: hex(word), local: local, size: size, entries: entries };
  };

  const refOfHandle = function (handle) {
    if (!(handle > 0)) return NULL;
    const h = Memory.alloc(4);
    h.writeU32(handle);
    const out = Memory.alloc(Process.pointerSize);
    out.writePointer(NULL);
    try { lookup(h, out); return out.readPointer(); } catch (e) { return NULL; }
  };
  const grabFacts = function (player) {
    if (isNil(player)) return { handle: 0, weight: NaN, type: -1, springs: -1 };
    return { handle: u32(player, FIELDS.grabbedObject), weight: r1(f32(player, FIELDS.grabObjectWeight)), type: u32(player, FIELDS.grabType), springs: u32(player.add(FIELDS.grabSpring), SPRING.size) };
  };
  const player = function () { return ptrAt(at('playerSingleton'), 0); };
  // the current grab: its handle, its reference and bodies, refreshed when the handle changes
  let held = { handle: 0, refr: NULL, bodies: [] };
  const describe = function (f) {
    if (f.handle !== held.handle) {
      const refr = refOfHandle(f.handle);
      const r = refFacts(refr);
      held = { handle: f.handle, refr: refr, bodies: r.bodies, facts: r.facts };
    }
    return { handle: hex(f.handle), ref: isNil(held.refr) ? '0x0' : hex(formId(held.refr)), weight: f.weight, type: f.type, springs: f.springs };
  };
  const named = function (springs) {
    const out = [];
    if (springs === null) return out;
    springs.entries.forEach(function (e) { if (e && e.names) e.names.forEach(function (n) { out.push(n.body); }); });
    return out;
  };

  // every site's address and live first bytes, read before the attach
  const resolved = {};
  const note = function (name, id, p) { resolved[name] = { id: id, rva: rva(p), at: String(p), bytes: firstBytes(p) }; };
  note('StartGrabObject', 40552, at('startGrab'));
  note('DestroyMouseSprings', 40557, at('destroyMouseSprings'));
  const updateAt = ptrAt(at('playerVtable'), UPDATE_SLOT * Process.pointerSize);
  note('PlayerCharacter::Update', 208040, updateAt);

  try {
    Interceptor.attach(at('startGrab'), {
      onEnter(args) { counts.startGrab += 1; this.player = args[0]; this.before = grabFacts(args[0]); this.a = raw(args); },
      onLeave(retval) {
        try {
          const after = grabFacts(this.player);
          const d = describe(after);
          emit({ fn: 'StartGrabObject', id: 40552, tid: this.threadId, frame: counts.frames, before: { handle: hex(this.before.handle), weight: this.before.weight, type: this.before.type, springs: this.before.springs }, after: d, grabbed: held.facts, springs: springsOf(this.player, held.bodies), args: this.a });
        } catch (e) { fail('StartGrabObject leave', e); }
      },
    });
  } catch (e) { attachErrors.push('StartGrabObject: ' + e); }
  try {
    Interceptor.attach(at('destroyMouseSprings'), {
      onEnter(args) {
        counts.destroyMouseSprings += 1;
        try {
          const f = grabFacts(args[0]);
          const d = describe(f);
          emit({ fn: 'DestroyMouseSprings', id: 40557, tid: this.threadId, frame: counts.frames, held: d, grabbed: held.facts, springs: springsOf(args[0], held.bodies), args: raw(args) });
        } catch (e) { fail('DestroyMouseSprings', e); }
      },
    });
  } catch (e) { attachErrors.push('DestroyMouseSprings: ' + e); }

  // the per-frame poll inside the player's own update: the grab fields on change, and the held bodies every HOLD_EVERY frames
  let lastKey = null;
  let lastHold = 0;
  let updateThread = null;
  if (!isNil(updateAt)) {
    try {
      Interceptor.attach(updateAt, {
        onEnter(args) {
          counts.frames += 1;
          try {
            if (updateThread === null) { updateThread = this.threadId; emit({ event: 'updateThread', tid: updateThread, main: updateThread === mainTid() }); }
            const p = isNil(args[0]) ? player() : args[0];
            const f = grabFacts(p);
            const key = f.handle + '/' + f.type + '/' + f.weight + '/' + f.springs;
            if (key !== lastKey) {
              const fresh = f.handle !== held.handle;
              lastKey = key;
              const d = describe(f);
              const row = Object.assign({ event: 'grab state', frame: counts.frames }, d);
              if (fresh && f.handle > 0) { row.grabbed = held.facts; row.springList = springsOf(p, held.bodies); }
              emit(row);
            }
            if (f.handle > 0 && counts.frames - lastHold >= HOLD_EVERY) {
              lastHold = counts.frames;
              const names = named(springsOf(p, held.bodies));
              const bodies = held.bodies.filter(function (x) { return names.indexOf(x.name) >= 0; }).slice(0, 8).map(function (x) {
                const v = [f32(x.hkp, MOTION.linV) * SCALE, f32(x.hkp, MOTION.linV + 4) * SCALE, f32(x.hkp, MOTION.linV + 8) * SCALE];
                return { body: x.name, type: u8(x.hkp, MOTION.type), pos: [r1(f32(x.hkp, MOTION.pos) * SCALE), r1(f32(x.hkp, MOTION.pos + 4) * SCALE), r1(f32(x.hkp, MOTION.pos + 8) * SCALE)], speed: r1(Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2])) };
              });
              emit({ event: 'hold', frame: counts.frames, handle: hex(f.handle), ref: isNil(held.refr) ? '0x0' : hex(formId(held.refr)), springs: f.springs, units: UNITS, bodies: bodies });
            }
          } catch (e) { fail('poll', e); }
        },
      });
    } catch (e) { attachErrors.push('PlayerCharacter::Update: ' + e); }
  } else attachErrors.push('PlayerCharacter::Update: no slot');

  emit({ event: 'ready', script: 'prop-grab.js', v: '2.1', version: version, pid: Process.id, base: String(exe.base), mainThread: mainTid(), worldScale: { inverse187407: scaleInverse, forward188105: scaleForward, ok: scaleOk, units: UNITS }, hooks: resolved, raw: RAW, holdEvery: HOLD_EVERY, bodiesMax: BODIES_MAX, attachErrors: attachErrors });
  let lastFrames = 0;
  setInterval(function () {
    emit({ event: 'liveness', pid: Process.id, counts: JSON.parse(JSON.stringify(counts)), frames10s: counts.frames - lastFrames, mainThread: mainTid() });
    lastFrames = counts.frames;
  }, 10000);
}
