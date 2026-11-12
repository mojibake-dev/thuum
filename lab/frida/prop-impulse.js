// prop-impulse.js v1.1 DRAFT (thuum, 2026-11-11; the fresh review's FIX FIRST applied as written, ADR-064 amendment A): (1) the scale
// is GetWorldScaleInverse's float, 187407, game units per Havok unit, where v1 read GetWorldScale's, 188105, its inverse (0.0142875
// in the exe's .rdata at 0x17849dc, 69.99125 at 0x177adfc: read from lab/.cache/game/exe-1.6.1170 on 2026-11-11, the numbers the
// adr065 read gives at :781 and :821), so v1's sanity test failed and every position and speed printed in Havok units under game
// units' names; v1.1 uses the scale only when the two floats multiply to 1, prints both in the ready row, labels each body row's
// units, and never falls back to 1: with no scale the game-unit fields print null and the speed band reads -1 (unknown), the raw
// Havok vectors still printed; (2) the two replacements call the original through NativeFunctions with exceptions 'propagate'
// (apply-on-demand.js:831), so an engine fault inside the original is the engine's as without Frida, and the nest is popped in a
// finally; each NativeCallback is held in a binding the liveness row reads, so it outlives a revert; (3) TTL_S (1800, longer than
// x-prop-blast's 1200 s) reverts both replacements from Frida's own thread, so a second instance on the same game can replace them
// again (one replacement a function a process; before the revert, relaunch the seat first). v1's header follows, corrected in place
// where it named the scale.
// prop-impulse.js v1 DRAFT (thuum, 2026-11-11; ADR-071 rung 0, docs/research/physics-leg-2026-11-11.md H2, H3, H4): which engine
// call pushes a prop at a spell's or a shout's impact, what names its cause, whether a remote figure's projectile copy pushes the
// watcher's own copies, and whether a hit body's island merges with its neighbours before it moves. New, so a fresh review comes
// before its first run (ADR-064 rule A). Run it on BOTH seats (the caster's for H2, the watcher's for H3) through x-prop-blast v3.
//
// THE QUESTIONS, one row family each:
// - H2: which of the three calls fires for a prop at an impact, with what force, on which thread, and what the call carries as its
//   cause. Expected (the engine reader's candidate, low confidence, docs/research/physics-leg-2026-11-11.md and its source plan):
//   an explosion calls AddExplosionImpulse (26005) once per body in its radius, the force scaled by ScaleGameplayImpulseForce
//   (26004), and the body takes it through bhkRigidBody::SetLinearImpulse (78091); a bolt pushes only its target. Falsified by
//   cabbages that fly with none of the three called (the body rows show the speed with no impulse row before it).
// - H3: on the watcher, a rising impulse count whose cause is the caster's figure (an 0xff000000-range actor) says the replayed
//   projectile pushes the watcher's copies; none says it does not, and then the rung 3 detour is not built.
// - H4: the island rows: a hit body's island (pointer and member count) at the impulse and every frame after, so the frame where
//   the members merge reads against the frame where the speed rises.
//
// Ids, by `just addr <id>` (lab/addr.py over addrlib/, runtime 1.6.1170.0, 428461 entries, run 2026-11-11 from the thuum checkout;
// never from memory, CLAUDE.md rule 1). CommonLibSSE-NG b93280e8 names every one; RELOCATION_ID is (SE, AE), the AE id resolved:
//   26005  0x3fd570   TESHavokUtilities::AddExplosionImpulse(NiAVObject* a_obj3D, hkVector4& a_pos, float a_force, const HitData*)
//                     include/RE/T/TESHavokUtilities.h:14, src/RE/T/TESHavokUtilities.cpp:10 RELOCATION_ID(25468, 26005). REPLACED by
//                     a pass-through of that signature (the force rides xmm2, and an attach's context has no XMM registers:
//                     skill-use.js v3, figure-dent-trace.js); the original runs exactly once per call, through a NativeFunction at
//                     the same address (Frida routes that call to the original)
//   26004  0x3fd450   TESHavokUtilities::ScaleGameplayImpulseForce(float a_inputForce, bhkRigidBody* a_body, bool a_factorMass) ->
//                     float, TESHavokUtilities.h:18, TESHavokUtilities.cpp:38 RELOCATION_ID(25467, 26004). REPLACED the same way
//                     (the force in xmm0, the result in xmm0; the bool as uint8, the memory note frida-bool-args)
//   78091  0xe93380   bhkRigidBody::SetLinearImpulse(this, const hkVector4&), include/RE/B/bhkRigidBody.h:54, src/RE/B/bhkRigidBody.cpp:22
//                     RELOCATION_ID(76261, 78091). ATTACHED (the vector is memory)
//   26003  0x3fd3d0   TESHavokUtilities::FindCollidableRef(const hkpCollidable&), TESHavokUtilities.h:15, include/RE/Offsets.h:524
//                     (called, never hooked: a body's reference)
//   12332  0x179710   LookupReferenceByHandle(const RefHandle&, NiPointer<TESObjectREFR>&), Offsets.h:582 (called, never hooked: a
//                     cause handle's reference; each resolved handle keeps one reference count, as prop-grab.js's and face-dump.js's
//                     lookups do, and a handle is looked up once and cached)
//   403449 0x31872c0  Main's singleton, a Main** (Offsets.h:383, src/RE/M/Main.cpp:8-12); threadID at +0x28 (include/RE/M/Main.h:87)
//   187407 0x177adfc  bhkWorld::GetWorldScaleInverse's float, include/RE/B/bhkWorld.h:48-52 RELOCATION_ID(230692, 187407): game units
//                     per Havok unit (69.99125), read once at load; positions and speeds print in game units by it (v1.1)
//   188105 0x17849dc  bhkWorld::GetWorldScale's float, bhkWorld.h:42-46 RELOCATION_ID(231896, 188105): Havok units per game unit
//                     (0.0142875), printed beside it in the ready row and used only as the cross-check (their product is 1)
//   208040 0x18ab9c0  VTABLE_PlayerCharacter[0], include/RE/Offsets_VTABLE.h:2231; slot 0xAD Actor::Update(float), include/RE/A/Actor.h:371:
//                     the per-frame sampler (rock-motion-trace.js v1.2's idiom: a trace samples once a game frame from a game hook,
//                     never from a timer, the memory note frida-lab-script-pitfalls), ATTACHED; the ready row prints the slot's
//                     address beside `just addr 40447` (0x732660, the address apply-on-demand.js names PlayerCharacter::Update)
//   209940 0x18c06a8  VTABLE_Explosion[0], Offsets_VTABLE.h:2779; slots 0xA3 Update(float) and 0xA4 FindTargets(), include/RE/E/Explosion.h:53-54:
//                     ATTACHED as brackets (an impulse call nested inside one on its thread is attributed to that explosion)
//   210006 0x18c4470  VTABLE_Projectile[0] (Offsets_VTABLE.h:2788), 209980 0x18c28b8 MissileProjectile (:2784), 209925 0x18bf900
//                     ConeProjectile (:2777), 209914 0x18bf090 BeamProjectile (:2776), 209891 0x18bdca8 ArrowProjectile (:2771), 209953
//                     0x18c0dc0 FlameProjectile (:2781), 209962 0x18c15f0 GrenadeProjectile (:2782), 209901 0x18be5f0 BarrierProjectile
//                     (:2773); slots 0xAC ProcessImpacts() and 0xBD AddImpact(TESObjectREFR*, const NiPoint3&, const NiPoint3&,
//                     hkpCollidable*, int32, uint32), include/RE/P/Projectile.h:208, :225: ATTACHED, one attach per distinct address
//                     (a class that does not override a slot shares its parent's), ProcessImpacts as a bracket, AddImpact as a row
//
// Layouts (CommonLibSSE-NG b93280e8, file:line under include/RE/):
//   TESForm: formID +0x14, formType +0x1A (T/TESForm.h:353-355). TESObjectREFR: data.objectReference +0x40 (the base, T/TESObjectREFR.h:77,
//     :495), loadedData +0x68 (:497), LOADED_REF_DATA::data3D +0x68 (:101).
//   NiAVObject: parent +0x30 (N/NiAVObject.h:153), collisionObject +0x40 (:156), userData +0xF8, the owning reference (:163); NiNode
//     children +0x110 (N/NiNode.h:76), a NiTArray: _data +0x08, _capacity +0x10 (N/NiTArray.h:116-117).
//   bhkNiCollisionObject: body +0x20 (B/bhkNiCollisionObject.h:56); bhkRefObject: referencedObject +0x10, the hkpRigidBody
//     (B/bhkRefObject.h:26; a bhkRigidBody is one, B/bhkRigidBody.h:13).
//   hkpWorldObject: the embedded hkpLinkedCollidable +0x20 (H/hkpWorldObject.h:67), whose broadPhaseHandle is +0x24 (H/hkpCollidable.h:72)
//     and its collisionFilterInfo +8 (H/hkpTypedBroadPhaseHandle.h:19), the layer its low seven bits (hkpCollidable.h:54).
//   hkpEntity: simulationIsland +0x130 (H/hkpEntity.h:92), motion +0x150 (:99). hkpMotion: type +0x10 (H/hkpMotion.h:77; 1 dynamic,
//     2 sphere, 3 box, 4 keyframed, 5 fixed, :26-35), deactivationIntegrateCounter +0x11 (:78), deactivationNumInactiveFrames +0x12, two
//     u16 (:79; five frames deactivate, :23), motionState +0x20 (:82) whose transform's translation is +0x30 (H/hkMotionState.h:14,
//     H/hkTransform.h:12), so the body's position is entity +0x1A0, inertiaAndMassInv +0xD0 (w the inverse mass, :83), linearVelocity
//     +0xE0 (:84) and angularVelocity +0xF0 (:85): the linear velocity is entity +0x230, the plan's offset, in Havok units.
//   hkpSimulationIsland: the flag byte +0x32 (isInActiveIslandsArray bits 0-1, activeMark bits 2-3, H/hkpSimulationIsland.h:41-42),
//     entities +0x60 (:53), an hkArray: _data +0x00, _size +0x08 (H/hkArray.h:182-183).
//   HitData: aggressor +0x18, target +0x1C, sourceRef +0x20 (handles, H/HitData.h:54-56), totalDamage +0x50 (:63), pushBack +0x74 (:72),
//     flags +0x80 (:75).
//   HYPOTHESIS, the runtime-data shift prop-grab.js reads for PlayerCharacter (the field comments are the older layout's offsets and
//     1.6.629 moved each block 8 bytes, REL::RelocateMemberIfNewer(1.6.629, this, 0x98, 0xA0)): Explosion's actorOwner, commented
//     0F0, at +0xF8, its radius (0AC) at +0xB4 (E/Explosion.h:56-96); Projectile's shooter, commented 120, at +0x128, its explosion
//     (150) at +0x158 and spell (158) at +0x160 (P/Projectile.h:241-262, :293). A sane owner handle (it resolves to the caster's
//     actor) confirms each read.
//
// What else is HYPOTHESIS until a run reads as expected (rule 2): the three impulse functions' callers and the order among them
// (the reader's plan, "their callers HYPOTHESIS"); whether 26005's obj3D is the body's own node; whether 26005's hkVector4 is in
// game or Havok units (printed raw and scaled); that the player's update runs once a frame on the main thread (the liveness row's
// frame count says); the bracket slots' attribution (an impulse outside every bracket prints bracket null, itself a reading).
//
// Rows, one JSON line each through console.log (lab-api's preamble writes them to the trace's .log every 250 ms) and send():
//   {event:'ready'} once: version, pid (read it against the run's c<N>-skyrim-platform-pid<N>.log before any row: the memory note
//     lab-frida-wrong-process), base, mainThread, worldScale (both floats and whether they agree), each hook's id, rva, address, mode and live first bytes read BEFORE any
//     attach (e9 there means another hook patched the site first), the update slot against 40447, params, attachErrors.
//   {fn:'AddExplosionImpulse'|'ScaleGameplayImpulseForce'|'SetLinearImpulse'} per call (the first ROWS of each; every call counted):
//     seq, tid, main (the tid equals Main's), frame, the body's reference and base, its facts before (and after, for 26005 and
//     78091), the force (26005), the input, the factorMass flag and the result (26004), the impulse vector (78091), the HitData's
//     handles resolved (26005), the enclosing 26005's seq on this thread (nest), the innermost bracket on this thread.
//   {fn:'bracket'} at a bracket's leave when an impulse call ran inside it, and at every FindTargets: the explosion or projectile,
//     its base, its owner or shooter resolved, the impulse calls it held.
//   {fn:'AddImpact'} per projectile impact: the projectile, its base, its shooter, the reference it hit, the collidable's reference
//     and layer, the impact point and velocity.
//   {fn:'body'} for POLL_MS after each impulse call, sampled once a game frame from the player's update: every body an impulse call
//     named and every member of their islands (at most WATCH_MAX), a row on change (motion type, the speed's band in game units a
//     second: under 1, under 50, faster, or -1 with no scale; the island's pointer, size or active bit; the inactive frames reaching
//     five) and every ROW_EVERY_FRAMES frames while moving; each sample re-walks a reference's 3D first, so a rebuilt body is never
//     read through a stale pointer. Each body's facts carry units ('game', or 'havok' when the scale did not read), the raw Havok
//     velocity vHavok beside the game-unit v, pos and speed.
//   {fn:'island'} when a watched body's island pointer or size changes: the members (at most ISLAND_MAX) by reference, each
//     joining the watch.
//   {fn:'window'} when a poll window closes, then one final body row per watched body.
//   {event:'liveness'} every 10 s: every hook's call count before its filter, rows capped, frames in the window (the seat's frame
//     rate under the trace: compare it with an untraced run before trusting any timing, the memory note frida-lab-script-pitfalls),
//     the slowest sample, watched bodies, Main's thread.
//
// Params (LAB_PARAMS): POLL_MS (2000, the plan's 2 s), ROW_EVERY_FRAMES (6), ROWS (400 per row family), REPLACE (true; false
// attaches 26005 and 26004 instead and prints no force), WATCH (reference ids, numbers or hex strings: rows tag them; a body joins
// the sampler by an impulse call or by sharing a hit body's island, never by id alone, since CommonLib's TESForm::LookupByID is an
// inline template with no Address Library id), WATCH_MAX (32), ISLAND_MAX (16), TTL_S (1800: the replacements' life, v1.1).
// 1.6.1170 only. Attach, replace and memory reads; the only engine calls are 26003 and 12332, both lookups.
const PARAMS = (typeof LAB_PARAMS === 'object' && LAB_PARAMS) ? LAB_PARAMS : {};
const num = function (v, d) { return (v === undefined || v === null) ? d : Number(v); };
const idList = function (v) {
  return (Array.isArray(v) ? v : []).map(function (x) { return typeof x === 'string' ? parseInt(x, 16) : Number(x); }).filter(function (x) { return x > 0; });
};
const POLL_MS = num(PARAMS.POLL_MS, 2000);
const EVERY = num(PARAMS.ROW_EVERY_FRAMES, 6);
const ROWS = num(PARAMS.ROWS, 400);
const REPLACE = PARAMS.REPLACE === undefined ? true : !!PARAMS.REPLACE;
const WATCH = idList(PARAMS.WATCH);
const WATCH_MAX = num(PARAMS.WATCH_MAX, 32);
const ISLAND_MAX = num(PARAMS.ISLAND_MAX, 16);
const TTL_S = num(PARAMS.TTL_S, 1800);
function emit(obj) { obj.t = Date.now(); send(obj); console.log(JSON.stringify(obj)); }

const OFFSETS = {
  '1.6.1170.0': {
    addExplosionImpulse: 0x3fd570, // 26005 TESHavokUtilities::AddExplosionImpulse
    scaleImpulseForce: 0x3fd450, // 26004 TESHavokUtilities::ScaleGameplayImpulseForce
    setLinearImpulse: 0xe93380, // 78091 bhkRigidBody::SetLinearImpulse
    findCollidableRef: 0x3fd3d0, // 26003 TESHavokUtilities::FindCollidableRef
    lookupRef: 0x179710, // 12332 LookupReferenceByHandle
    mainSingleton: 0x31872c0, // 403449 Main**
    worldScaleInverse: 0x177adfc, // 187407 bhkWorld::GetWorldScaleInverse's float: game units per Havok unit (v1.1)
    worldScale: 0x17849dc, // 188105 bhkWorld::GetWorldScale's float: Havok units per game unit, the cross-check
    playerVtable: 0x18ab9c0, // 208040 VTABLE_PlayerCharacter[0]
    playerUpdateById: 0x732660, // 40447, the cross-check for slot 0xAD
    explosionVtable: 0x18c06a8, // 209940 VTABLE_Explosion[0]
  },
};
const PROJECTILE_VTABLES = {
  '1.6.1170.0': [
    ['Projectile', 0x18c4470], // 210006
    ['MissileProjectile', 0x18c28b8], // 209980
    ['ConeProjectile', 0x18bf900], // 209925
    ['BeamProjectile', 0x18bf090], // 209914
    ['ArrowProjectile', 0x18bdca8], // 209891
    ['FlameProjectile', 0x18c0dc0], // 209953
    ['GrenadeProjectile', 0x18c15f0], // 209962
    ['BarrierProjectile', 0x18be5f0], // 209901
  ],
};
const FORM = { id: 0x14, type: 0x1a };
const REFR = { base: 0x40, loaded: 0x68 };
const LOADED_3D = 0x68;
const NODE = { parent: 0x30, collision: 0x40, owner: 0xf8, children: 0x110 };
const NITARRAY = { data: 0x08, capacity: 0x10 };
const COLLISION_BODY = 0x20;
const REFERENCED = 0x10;
const COLLIDABLE = 0x20;
const FILTER_INFO = 0x20 + 0x24 + 0x08;
const ENTITY = { island: 0x130, motion: 0x150 };
const MOTION = { type: 0x10, counter: 0x11, frames: 0x12, pos: 0x50, massInv: 0xdc, linV: 0xe0, angV: 0xf0 };
const ISLAND = { flags: 0x32, data: 0x60, size: 0x68 };
const HIT = { aggressor: 0x18, target: 0x1c, sourceRef: 0x20, totalDamage: 0x50, pushBack: 0x74, flags: 0x80 };
const EXPLOSION = { owner: 0xf8, radius: 0xb4 };
const PROJECTILE = { shooter: 0x128, explosion: 0x158, spell: 0x160 };
const SLOT = { update: 0xad, explosionUpdate: 0xa3, findTargets: 0xa4, processImpacts: 0xac, addImpact: 0xbd };

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

const hex = function (n) { return n < 0 ? String(n) : '0x' + (n >>> 0).toString(16); };
const isNil = function (p) { return p === null || p === undefined || p.isNull(); };
const u8 = function (p, o) { try { return p.add(o).readU8(); } catch (e) { return -1; } };
const u16 = function (p, o) { try { return p.add(o).readU16(); } catch (e) { return -1; } };
const u32 = function (p, o) { try { return p.add(o).readU32(); } catch (e) { return -1; } };
const s32 = function (p, o) { try { return p.add(o).readS32(); } catch (e) { return -1; } };
const f32 = function (p, o) { try { return p.add(o).readFloat(); } catch (e) { return NaN; } };
const ptrAt = function (p, o) { try { return p.add(o).readPointer(); } catch (e) { return NULL; } };
const r2 = function (x) { return Math.round(x * 100) / 100; };
const firstBytes = function (p) {
  try { return Array.from(new Uint8Array(p.readByteArray(8))).map(function (b) { return ('0' + b.toString(16)).slice(-2); }).join(' '); } catch (e) { return 'unreadable'; }
};

const exe = Process.getModuleByName('SkyrimSE.exe');
const version = fileVersion(exe.path);
const off = OFFSETS[version];
if (off === undefined) {
  emit({ event: 'ready', error: 'no offsets for this runtime', version: version, pid: Process.id });
} else {
  const at = function (name) { return exe.base.add(off[name]); };
  const rva = function (p) { try { return hex(p.sub(exe.base).toUInt32()); } catch (e) { return String(p); } };
  const findRef = new NativeFunction(at('findCollidableRef'), 'pointer', ['pointer'], 'win64');
  const lookup = new NativeFunction(at('lookupRef'), 'bool', ['pointer', 'pointer'], 'win64');
  // game units per Havok unit: GetWorldScaleInverse's float, trusted only when GetWorldScale's float is its inverse; no fallback
  const scaleInverse = f32(at('worldScaleInverse'), 0);
  const scaleForward = f32(at('worldScale'), 0);
  const scaleOk = scaleInverse > 1 && scaleInverse < 1000 && Math.abs(scaleInverse * scaleForward - 1) < 0.001;
  const SCALE = scaleOk ? scaleInverse : NaN;
  const UNITS = scaleOk ? 'game' : 'havok';
  const mainTid = function () { return u32(ptrAt(at('mainSingleton'), 0), 0x28); };
  let mainThread = mainTid();
  const counts = { frames: 0 };
  const capped = {};
  const attachErrors = [];
  const failed = {};
  const fail = function (where, e) { if (failed[where]) return; failed[where] = true; emit({ event: 'error', where: where, error: String(e) }); };
  const rowsOf = {};
  const emitCapped = function (row) {
    rowsOf[row.fn] = (rowsOf[row.fn] || 0) + 1;
    if (rowsOf[row.fn] > ROWS) { capped[row.fn] = (capped[row.fn] || 0) + 1; return; }
    emit(row);
  };
  let seq = 0;

  // references and bodies
  const idOf = function (r) { return isNil(r) ? 0 : u32(r, FORM.id); };
  const baseOf = function (r) { const b = ptrAt(r, REFR.base); return isNil(b) ? 0 : u32(b, FORM.id); };
  const ownerOfNode = function (node) {
    let n = node;
    for (let i = 0; i < 6 && !isNil(n); i++) {
      const r = ptrAt(n, NODE.owner);
      if (!isNil(r)) return r;
      n = ptrAt(n, NODE.parent);
    }
    return NULL;
  };
  // the hkpRigidBody under a node: its collision object's body's referencedObject, else a child's (one level), rock-motion-trace.js's walk
  const bodyOfNode = function (node) {
    const direct = function (n) {
      const co = ptrAt(n, NODE.collision);
      if (isNil(co)) return NULL;
      const bhk = ptrAt(co, COLLISION_BODY);
      if (isNil(bhk)) return NULL;
      return ptrAt(bhk, REFERENCED);
    };
    const b = direct(node);
    if (!isNil(b)) return b;
    const data = ptrAt(node, NODE.children + NITARRAY.data);
    const cap = u16(node, NODE.children + NITARRAY.capacity);
    for (let i = 0; i < cap && i < 16 && !isNil(data); i++) {
      const child = ptrAt(data, i * 8);
      if (isNil(child)) continue;
      const c = direct(child);
      if (!isNil(c)) return c;
    }
    return NULL;
  };
  const bodyOfRefr = function (refr) {
    const loaded = ptrAt(refr, REFR.loaded);
    if (isNil(loaded)) return NULL;
    const root = ptrAt(loaded, LOADED_3D);
    return isNil(root) ? NULL : bodyOfNode(root);
  };
  const refByEntity = {};
  const refOfEntity = function (e) {
    if (isNil(e)) return NULL;
    const k = String(e);
    if (refByEntity[k] !== undefined) return refByEntity[k];
    let r = NULL;
    try { r = findRef(e.add(COLLIDABLE)); } catch (err) { r = NULL; }
    refByEntity[k] = r;
    return r;
  };
  // a handle's reference id, looked up once per handle; the two slots are the call's own (a NativeFunction call can let another
  // thread into this script's JavaScript, so no buffer is shared between lookups)
  const idByHandle = {};
  const resolveHandle = function (h) {
    if (!(h > 0)) return '0x0';
    if (idByHandle[h] !== undefined) return idByHandle[h];
    let out = 'unresolved';
    try {
      const handleSlot = Memory.alloc(4);
      const refSlot = Memory.alloc(Process.pointerSize);
      handleSlot.writeU32(h);
      refSlot.writePointer(NULL);
      lookup(handleSlot, refSlot);
      const r = refSlot.readPointer();
      out = isNil(r) ? 'none' : hex(idOf(r));
    } catch (e) { out = 'error'; }
    idByHandle[h] = out;
    return out;
  };
  const v3 = function (p, o, k) { return [r2(f32(p, o) * k), r2(f32(p, o + 4) * k), r2(f32(p, o + 8) * k)]; };
  const len3 = function (v) { return r2(Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2])); };
  const islandFacts = function (island) {
    if (isNil(island)) return null;
    const flags = u8(island, ISLAND.flags);
    return { at: String(island), n: s32(island, ISLAND.size), inActive: flags < 0 ? -1 : flags & 3, activeMark: flags < 0 ? -1 : (flags >> 2) & 3 };
  };
  const bodyFacts = function (hkp) {
    if (isNil(hkp)) return null;
    const m = hkp.add(ENTITY.motion);
    const fi = u32(hkp, FILTER_INFO);
    const v = v3(m, MOTION.linV, SCALE);
    const vHavok = v3(m, MOTION.linV, 1);
    return {
      type: u8(m, MOTION.type), layer: fi < 0 ? -1 : fi & 0x7f, massInv: r2(f32(m, MOTION.massInv)),
      counter: u8(m, MOTION.counter), frames: [u16(m, MOTION.frames), u16(m, MOTION.frames + 2)],
      units: UNITS, pos: v3(m, MOTION.pos, SCALE), v: v, speed: len3(v), vHavok: vHavok, speedHavok: len3(vHavok), w: v3(m, MOTION.angV, 1),
      island: islandFacts(ptrAt(hkp, ENTITY.island)),
    };
  };

  // the watch: every body an impulse call named, and every member of their islands
  const watched = {};
  let pollUntil = 0;
  let windowOpen = false;
  const keyOf = function (id, hkp) { return id > 0 ? hex(id) : 'body@' + String(hkp); };
  const watch = function (hkp, refr, tag) {
    if (isNil(hkp)) return null;
    const id = idOf(refr);
    const k = keyOf(id, hkp);
    if (watched[k] !== undefined) return watched[k];
    if (Object.keys(watched).length >= WATCH_MAX) return null;
    const w = { key: k, id: id, refr: refr, hkp: hkp, tag: tag, listed: WATCH.indexOf(id) >= 0, lastKey: null, lastFrame: 0, islandKey: null, errors: 0 };
    watched[k] = w;
    emit({ fn: 'watch', ref: hex(id), base: hex(baseOf(refr)), tag: tag, listed: w.listed, body: String(hkp), frame: counts.frames, facts: bodyFacts(hkp) });
    return w;
  };
  const openWindow = function () { pollUntil = Date.now() + POLL_MS; };
  const membersOf = function (island) {
    const n = s32(island, ISLAND.size);
    const data = ptrAt(island, ISLAND.data);
    const out = [];
    for (let i = 0; i < n && i < ISLAND_MAX && !isNil(data); i++) {
      const e = ptrAt(data, i * 8);
      if (isNil(e)) continue;
      const r = refOfEntity(e);
      out.push({ ref: hex(idOf(r)), type: u8(e, ENTITY.motion + MOTION.type) });
      watch(e, r, 'island');
    }
    return { n: n, members: out };
  };

  // the per-thread nest (an enclosing 26005) and brackets (an enclosing explosion or projectile pass)
  const nests = {};
  const brackets = {};
  const top = function (table, tid) { const s = table[tid]; return s && s.length > 0 ? s[s.length - 1] : null; };
  const push = function (table, tid, item) { if (!table[tid]) table[tid] = []; table[tid].push(item); };
  const pop = function (table, tid) { const s = table[tid]; if (s && s.length > 0) s.pop(); };
  const bracketSummary = function (tid) {
    const b = top(brackets, tid);
    if (b === null) return null;
    b.impulses += 1;
    return { kind: b.kind, slot: b.slot, seq: b.seq, ref: b.ref, base: b.base, owner: b.owner };
  };
  const hitFacts = function (hit) {
    if (isNil(hit)) return null;
    return {
      aggressor: resolveHandle(u32(hit, HIT.aggressor)), target: resolveHandle(u32(hit, HIT.target)),
      sourceRef: resolveHandle(u32(hit, HIT.sourceRef)), totalDamage: r2(f32(hit, HIT.totalDamage)),
      pushBack: r2(f32(hit, HIT.pushBack)), flags: hex(u32(hit, HIT.flags)),
    };
  };
  const common = function (fn, id, tid) {
    seq += 1;
    return { fn: fn, id: id, seq: seq, tid: tid, main: tid === mainThread, frame: counts.frames };
  };

  // the live first bytes of every site, read before any attach or replacement
  const resolved = {};
  const note = function (name, id, p, mode) { resolved[name] = { id: id, rva: rva(p), at: String(p), mode: mode, bytes: firstBytes(p) }; };
  note('AddExplosionImpulse', 26005, at('addExplosionImpulse'), REPLACE ? 'replace' : 'attach');
  note('ScaleGameplayImpulseForce', 26004, at('scaleImpulseForce'), REPLACE ? 'replace' : 'attach');
  note('SetLinearImpulse', 78091, at('setLinearImpulse'), 'attach');
  const updateAt = ptrAt(at('playerVtable'), SLOT.update * Process.pointerSize);
  note('PlayerCharacter::Update', 208040, updateAt, 'attach');
  const explosionSlots = [['Explosion::Update', SLOT.explosionUpdate], ['Explosion::FindTargets', SLOT.findTargets]].map(function (s) {
    const p = ptrAt(at('explosionVtable'), s[1] * Process.pointerSize);
    note(s[0], 209940, p, 'attach');
    return { name: s[0], slot: s[1], at: p };
  });
  const projectileSites = {}; // address -> { slot, classes }
  (PROJECTILE_VTABLES[version] || []).forEach(function (pair) {
    [['ProcessImpacts', SLOT.processImpacts], ['AddImpact', SLOT.addImpact]].forEach(function (s) {
      const p = ptrAt(exe.base.add(pair[1]), s[1] * Process.pointerSize);
      if (isNil(p)) return;
      const k = String(p);
      if (projectileSites[k] === undefined) { projectileSites[k] = { slot: s[0], at: p, classes: [] }; note(s[0] + '@' + rva(p), 'vtable slot ' + hex(s[1]), p, 'attach'); }
      projectileSites[k].classes.push(pair[0]);
    });
  });

  // H2's three calls
  const explosionRow = function (obj3D, pos, force, hit, tid) {
    const row = common('AddExplosionImpulse', 26005, tid);
    const refr = ownerOfNode(obj3D);
    const hkp = bodyOfNode(obj3D);
    row.ref = hex(idOf(refr));
    row.base = hex(baseOf(refr));
    row.node = String(obj3D);
    row.posRaw = [r2(f32(pos, 0)), r2(f32(pos, 4)), r2(f32(pos, 8)), r2(f32(pos, 12))];
    row.posScaled = [r2(f32(pos, 0) * SCALE), r2(f32(pos, 4) * SCALE), r2(f32(pos, 8) * SCALE)];
    row.force = force === null ? null : r2(force);
    row.hit = hitFacts(hit);
    row.bracket = bracketSummary(tid);
    row.before = bodyFacts(hkp);
    row._hkp = hkp;
    watch(hkp, refr, 'impulse');
    openWindow();
    return row;
  };
  const finishExplosion = function (row) {
    if (row === null) return;
    row.after = bodyFacts(row._hkp);
    delete row._hkp;
    emitCapped(row);
  };
  const scaleRow = function (input, bhk, factorMass, tid) {
    const row = common('ScaleGameplayImpulseForce', 26004, tid);
    const hkp = ptrAt(bhk, REFERENCED);
    const refr = refOfEntity(hkp);
    row.ref = hex(idOf(refr));
    row.base = hex(baseOf(refr));
    row.input = input === null ? null : r2(input);
    row.factorMass = factorMass === null ? null : factorMass & 0xff;
    const n = top(nests, tid);
    row.nest = n === null ? null : n.seq;
    row.bracket = bracketSummary(tid);
    row.body = bodyFacts(hkp);
    watch(hkp, refr, 'impulse');
    openWindow();
    return row;
  };
  const hooks = { replaced: [], attached: [] };
  // v1.1: the originals are called with exceptions 'propagate' (apply-on-demand.js:831): no exceptor scope around the engine's own
  // code, so a fault there is the engine's as without Frida; the JS around it is caught. Each NativeCallback is held here, read by the
  // liveness row, so it outlives its revert (Interceptor keeps a replacement until the revert; a call still in flight then returns
  // through it)
  const replacements = { 26005: null, 26004: null };
  let reverted = false;
  if (REPLACE) {
    try {
      const sig = ['pointer', 'pointer', 'float', 'pointer'];
      const original = new NativeFunction(at('addExplosionImpulse'), 'void', sig, { abi: 'win64', exceptions: 'propagate' });
      replacements[26005] = new NativeCallback(function (obj3D, pos, force, hit) {
        const tid = Process.getCurrentThreadId();
        let row = null;
        try { counts.AddExplosionImpulse = (counts.AddExplosionImpulse || 0) + 1; row = explosionRow(obj3D, pos, force, hit, tid); push(nests, tid, row); } catch (e) { fail('26005 enter', e); }
        try { original(obj3D, pos, force, hit); } finally { if (row !== null) pop(nests, tid); }
        try { finishExplosion(row); } catch (e) { fail('26005 leave', e); }
      }, 'void', sig, 'win64');
      Interceptor.replace(at('addExplosionImpulse'), replacements[26005]);
      hooks.replaced.push(26005);
    } catch (e) { attachErrors.push('26005 replace: ' + e); }
    try {
      const sig = ['float', 'pointer', 'uint8'];
      const original = new NativeFunction(at('scaleImpulseForce'), 'float', sig, { abi: 'win64', exceptions: 'propagate' });
      replacements[26004] = new NativeCallback(function (input, bhk, factorMass) {
        const tid = Process.getCurrentThreadId();
        let row = null;
        try { counts.ScaleGameplayImpulseForce = (counts.ScaleGameplayImpulseForce || 0) + 1; row = scaleRow(input, bhk, factorMass, tid); } catch (e) { fail('26004 enter', e); }
        const result = original(input, bhk, factorMass);
        try { if (row !== null) { row.result = r2(result); emitCapped(row); } } catch (e) { fail('26004 leave', e); }
        return result;
      }, 'float', sig, 'win64');
      Interceptor.replace(at('scaleImpulseForce'), replacements[26004]);
      hooks.replaced.push(26004);
    } catch (e) { attachErrors.push('26004 replace: ' + e); }
    // the replacements' life: reverted from Frida's own thread after TTL_S (outside every engine frame of ours)
    if (hooks.replaced.length > 0) {
      setTimeout(function () {
        const out = [];
        [[26005, 'addExplosionImpulse'], [26004, 'scaleImpulseForce']].forEach(function (r) {
          if (hooks.replaced.indexOf(r[0]) < 0) return;
          try { Interceptor.revert(at(r[1])); out.push(r[0]); } catch (e) { fail('revert ' + r[0], e); }
        });
        try { Interceptor.flush(); } catch (e) { fail('flush', e); }
        reverted = true;
        emit({ event: 'reverted', ids: out, ttl_s: TTL_S, frame: counts.frames });
      }, TTL_S * 1000);
    }
  }
  // the attach fallback: no float can be read (the force and the result print null)
  if (hooks.replaced.indexOf(26005) < 0) {
    try {
      Interceptor.attach(at('addExplosionImpulse'), {
        onEnter(args) {
          counts.AddExplosionImpulse = (counts.AddExplosionImpulse || 0) + 1;
          try { this.row = explosionRow(args[0], args[1], null, args[3], this.threadId); push(nests, this.threadId, this.row); } catch (e) { fail('26005 attach enter', e); }
        },
        onLeave() { try { if (this.row) { pop(nests, this.threadId); finishExplosion(this.row); } } catch (e) { fail('26005 attach leave', e); } },
      });
      hooks.attached.push(26005);
    } catch (e) { attachErrors.push('26005 attach: ' + e); }
  }
  if (hooks.replaced.indexOf(26004) < 0) {
    try {
      Interceptor.attach(at('scaleImpulseForce'), {
        onEnter(args) {
          counts.ScaleGameplayImpulseForce = (counts.ScaleGameplayImpulseForce || 0) + 1;
          try { const row = scaleRow(null, args[1], args[2].toUInt32() & 0xff, this.threadId); row.result = null; emitCapped(row); } catch (e) { fail('26004 attach', e); }
        },
      });
      hooks.attached.push(26004);
    } catch (e) { attachErrors.push('26004 attach: ' + e); }
  }
  try {
    Interceptor.attach(at('setLinearImpulse'), {
      onEnter(args) {
        counts.SetLinearImpulse = (counts.SetLinearImpulse || 0) + 1;
        try {
          const row = common('SetLinearImpulse', 78091, this.threadId);
          const hkp = ptrAt(args[0], REFERENCED);
          const refr = refOfEntity(hkp);
          row.ref = hex(idOf(refr));
          row.base = hex(baseOf(refr));
          row.impulse = [r2(f32(args[1], 0)), r2(f32(args[1], 4)), r2(f32(args[1], 8)), r2(f32(args[1], 12))];
          const n = top(nests, this.threadId);
          row.nest = n === null ? null : n.seq;
          row.bracket = bracketSummary(this.threadId);
          row.before = bodyFacts(hkp);
          this.row = row;
          this.hkp = hkp;
          watch(hkp, refr, 'impulse');
          openWindow();
        } catch (e) { fail('78091 enter', e); }
      },
      onLeave() { try { if (this.row) { this.row.after = bodyFacts(this.hkp); emitCapped(this.row); } } catch (e) { fail('78091 leave', e); } },
    });
    hooks.attached.push(78091);
  } catch (e) { attachErrors.push('78091 attach: ' + e); }

  // the brackets: an explosion's pass and a projectile's impact pass, one stack per thread
  explosionSlots.forEach(function (s) {
    if (isNil(s.at)) { attachErrors.push(s.name + ': no slot'); return; }
    try {
      Interceptor.attach(s.at, {
        onEnter(args) {
          counts[s.name] = (counts[s.name] || 0) + 1;
          try {
            seq += 1;
            const e = args[0];
            push(brackets, this.threadId, { kind: 'explosion', slot: s.name, seq: seq, ref: hex(idOf(e)), base: hex(baseOf(e)), owner: resolveHandle(u32(e, EXPLOSION.owner)), radius: r2(f32(e, EXPLOSION.radius)), impulses: 0, frame: counts.frames });
          } catch (err) { fail(s.name + ' enter', err); }
        },
        onLeave() {
          try {
            const b = top(brackets, this.threadId);
            pop(brackets, this.threadId);
            if (b !== null && (b.impulses > 0 || s.slot === SLOT.findTargets)) emitCapped({ fn: 'bracket', kind: b.kind, slot: b.slot, seq: b.seq, ref: b.ref, base: b.base, owner: b.owner, radius: b.radius, impulses: b.impulses, frame: b.frame, tid: this.threadId });
          } catch (err) { fail(s.name + ' leave', err); }
        },
      });
      hooks.attached.push(s.name);
    } catch (e) { attachErrors.push(s.name + ': ' + e); }
  });
  Object.keys(projectileSites).forEach(function (k) {
    const site = projectileSites[k];
    const label = site.slot + '@' + rva(site.at);
    try {
      if (site.slot === 'ProcessImpacts') {
        Interceptor.attach(site.at, {
          onEnter(args) {
            counts[label] = (counts[label] || 0) + 1;
            try {
              seq += 1;
              const p = args[0];
              push(brackets, this.threadId, { kind: 'projectile', slot: label, seq: seq, ref: hex(idOf(p)), base: hex(baseOf(p)), owner: resolveHandle(u32(p, PROJECTILE.shooter)), impulses: 0, frame: counts.frames });
            } catch (err) { fail(label + ' enter', err); }
          },
          onLeave() {
            try {
              const b = top(brackets, this.threadId);
              pop(brackets, this.threadId);
              if (b !== null && b.impulses > 0) emitCapped({ fn: 'bracket', kind: b.kind, slot: b.slot, classes: site.classes, seq: b.seq, ref: b.ref, base: b.base, owner: b.owner, impulses: b.impulses, frame: b.frame, tid: this.threadId });
            } catch (err) { fail(label + ' leave', err); }
          },
        });
      } else {
        Interceptor.attach(site.at, {
          onEnter(args) {
            counts[label] = (counts[label] || 0) + 1;
            try {
              seq += 1;
              const p = args[0];
              const target = args[1];
              const coll = args[4];
              let collRef = NULL;
              try { collRef = isNil(coll) ? NULL : findRef(coll); } catch (err) { collRef = NULL; }
              const fi = isNil(coll) ? -1 : u32(coll, 0x24 + 0x08);
              emitCapped({
                fn: 'AddImpact', seq: seq, tid: this.threadId, main: this.threadId === mainThread, frame: counts.frames, classes: site.classes,
                projectile: hex(idOf(p)), base: hex(baseOf(p)), shooter: resolveHandle(u32(p, PROJECTILE.shooter)),
                spell: hex(idOf(ptrAt(p, PROJECTILE.spell))), explosion: hex(idOf(ptrAt(p, PROJECTILE.explosion))),
                target: hex(idOf(target)), targetBase: hex(baseOf(target)), collidableRef: hex(idOf(collRef)), layer: fi < 0 ? -1 : fi & 0x7f,
                point: [r2(f32(args[2], 0)), r2(f32(args[2], 4)), r2(f32(args[2], 8))], velocity: [r2(f32(args[3], 0)), r2(f32(args[3], 4)), r2(f32(args[3], 8))],
              });
              if (!isNil(target)) { const b = bodyOfRefr(target); if (!isNil(b)) { watch(b, target, 'impact'); openWindow(); } }
            } catch (err) { fail(label, err); }
          },
        });
      }
      hooks.attached.push(label);
    } catch (e) { attachErrors.push(label + ': ' + e); }
  });

  // the sampler, once a game frame, inside the player's own update (an attach: the reads are memory, FindCollidableRef the one call)
  let sampleMaxMs = 0;
  let updateThread = null;
  const closeWindow = function () {
    windowOpen = false;
    emit({ fn: 'window', frame: counts.frames, watched: Object.keys(watched).length });
    Object.keys(watched).forEach(function (k) {
      const w = watched[k];
      emit({ fn: 'body', ref: w.key, tag: w.tag, listed: w.listed, frame: counts.frames, final: true, facts: bodyFacts(w.hkp) });
    });
  };
  const sample = function () {
    const now = Date.now();
    if (now > pollUntil) { if (windowOpen) closeWindow(); return; }
    windowOpen = true;
    Object.keys(watched).forEach(function (k) {
      const w = watched[k];
      if (w.gone) return;
      if (!isNil(w.refr)) {
        if (idOf(w.refr) !== w.id) { w.gone = true; emit({ fn: 'body', ref: w.key, frame: counts.frames, gone: 'the reference no longer reads its id' }); return; }
        const b = bodyOfRefr(w.refr);
        if (!isNil(b)) w.hkp = b;
      }
      const f = bodyFacts(w.hkp);
      if (f === null || f.type < 0 || f.type > 7) { w.errors += 1; if (w.errors === 5) emit({ fn: 'body', ref: w.key, frame: counts.frames, gone: 'five unreadable samples' }); if (w.errors >= 5) w.gone = true; return; }
      w.errors = 0;
      const band = !scaleOk ? -1 : (f.speed < 1 ? 0 : (f.speed < 50 ? 1 : 2)); // game units a second; -1 with no scale
      const isl = f.island === null ? 'none' : f.island.at + '/' + f.island.n;
      const key = [f.type, band, isl, f.island === null ? -1 : f.island.inActive, f.frames[0] >= 5 ? 1 : 0].join('|');
      if (key !== w.lastKey || (band !== 0 && counts.frames - w.lastFrame >= EVERY)) {
        w.lastKey = key;
        w.lastFrame = counts.frames;
        emit({ fn: 'body', ref: w.key, tag: w.tag, listed: w.listed, frame: counts.frames, facts: f });
      }
      if (isl !== w.islandKey) {
        w.islandKey = isl;
        const island = ptrAt(w.hkp, ENTITY.island);
        emit({ fn: 'island', ref: w.key, frame: counts.frames, island: f.island, members: isNil(island) ? null : membersOf(island) });
      }
    });
  };
  if (!isNil(updateAt)) {
    try {
      Interceptor.attach(updateAt, {
        onEnter() {
          counts.frames += 1;
          if (updateThread === null) { updateThread = this.threadId; emit({ fn: 'updateThread', tid: updateThread, main: updateThread === mainThread }); }
          const t0 = Date.now();
          try { sample(); } catch (e) { fail('sample', e); }
          const dt = Date.now() - t0;
          if (dt > sampleMaxMs) sampleMaxMs = dt;
        },
      });
      hooks.attached.push('PlayerCharacter::Update');
    } catch (e) { attachErrors.push('PlayerCharacter::Update: ' + e); }
  } else attachErrors.push('PlayerCharacter::Update: no slot');

  emit({
    event: 'ready', script: 'prop-impulse.js', version: version, pid: Process.id, base: String(exe.base), mainThread: mainThread,
    worldScale: { inverse187407: scaleInverse, forward188105: scaleForward, ok: scaleOk, units: UNITS }, update: { slot: rva(updateAt), byId40447: rva(at('playerUpdateById')), agree: !isNil(updateAt) && updateAt.equals(at('playerUpdateById')) },
    hooks: resolved, replaced: hooks.replaced, attached: hooks.attached,
    params: { POLL_MS: POLL_MS, ROW_EVERY_FRAMES: EVERY, ROWS: ROWS, REPLACE: REPLACE, WATCH: WATCH.map(hex), WATCH_MAX: WATCH_MAX, ISLAND_MAX: ISLAND_MAX, TTL_S: TTL_S },
    attachErrors: attachErrors,
  });
  let lastFrames = 0;
  setInterval(function () {
    mainThread = mainTid();
    emit({ event: 'liveness', pid: Process.id, counts: JSON.parse(JSON.stringify(counts)), capped: JSON.parse(JSON.stringify(capped)), frames10s: counts.frames - lastFrames, sampleMaxMs: sampleMaxMs, watched: Object.keys(watched).length, mainThread: mainThread, replacements: { 26005: String(replacements[26005]), 26004: String(replacements[26004]), reverted: reverted } });
    lastFrames = counts.frames;
    sampleMaxMs = 0;
  }, 10000);
}
