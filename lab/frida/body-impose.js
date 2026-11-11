// body-impose.js v1.1 DRAFT (thuum, 2026-11-11; the fresh review's FIX FIRST applied as written, ADR-064 amendment A): (1) the scale
// is bhkWorld::GetWorldScaleInverse's float (187407, game units per Havok unit), where v1 read GetWorldScale's (188105), its inverse
// (69.99125 and 0.0142875 in the exe's .rdata, lab/.cache/game/exe-1.6.1170, read 2026-11-11; the adr065 read's :781 and :821), so
// v1's (1, 1000) test failed and its first step would have ended the run; v1.1 trusts the scale only when the two floats multiply to
// 1 and prints both in the ready row; (2) the replacement's original is a NativeFunction with exceptions 'propagate'
// (apply-on-demand.js:831) and its NativeCallback is held in a binding the liveness row reads, so it outlives the revert; (3) the
// step runs only when the update's thread is Main's (one 'thread' row when it is not); (4) the driver's graphs are re-resolved at
// every SetMotionType (a rebuilt 3D may have freed the old ones), every finish while the ragdoll is keyframed sets it back to
// kDynamic first, and path B's direct writes of the reference's angle and location, never restored, are named in the list of
// writes below; (5) the walk counts every body (a NODES_MAX of 8192 nodes bounds it), so the capture's H6 check on 64 bodies can
// fail; and from the review's notes: slots 0x35 and 0x36 are counted on bhkRigidBodyT's vtable too (239275, which overrides them),
// and two citations corrected (BSIRagdollDriver.h:23, TESObjectREFR.h:78-79). One more fix the bhkRigidBodyT read called for:
// bhkRigidBodyT overrides GetPosition and SetPosition as well (slots 0x33 to 0x37), so a body's accessor position may carry an
// offset the motion state does not; v1 lerped from the memory position toward the accessor's, so v1.1 keeps the two families
// apart: the pose errors compare the motion state's translation with the capture's (memory against memory), and the writes go from
// GetPosition at the phase's start to GetPosition at the capture through SetPosition (accessor to accessor); the capture row's
// getPosAgainstMemory is the largest gap between them. v1's header follows, corrected in place.
// body-impose.js v1 DRAFT (thuum, 2026-11-11; ADR-071 rung 0, docs/research/physics-leg-2026-11-11.md H6): on ONE seat, can the
// engine be made to hold a dead body in a pose it is handed, and how close does it come? The follower's two candidate paths
// (ADR-071 decision 5): path A keyframes the ragdoll through its BSIRagdollDriver and writes each body; path B replays a Havok block
// the engine's own writer captured through the engine's own reader. H6 holds when a path keeps every bone within 32 units of the
// source pose; its second clause, a humanoid's bodies fitting 64 in one packet, reads off the capture row's body count. New, so a
// fresh review comes before its first run (ADR-064 rule A). This script WRITES engine state during its phases, on one seat, as a lab
// experiment, never a resident, and it changes no build. Its writes, all of them: path A, every body's rotation and position
// (bhkRigidBody slots 0x36, 0x35) and the ragdoll driver's motion type (kKeyframed, then kDynamic at its release, and kDynamic again
// by any finish while it is keyframed); path B, the captured block copied onto the engine heap and handed to 36014 (which applies it
// to the bodies through 19535), and the reference's data.angle and data.location (OBJ_REFR +0x48 and +0x54, TESObjectREFR.h:78-79)
// written DIRECTLY in memory to the capture's values before the replay, with no setter and NO RESTORE: the reference keeps the
// capture's place after the run, so the host's later samples of the body report from there and the server records them as the
// body's (R2, a dead hosted actor's samples).
//
// The run (x-body-impose v1): the seat kills FORM (an NPC it hosts), the body settles, the script CAPTURES the source pose P0; the
// probe shouts the body away; once it rests again, PATH A; the probe shouts it away again; once it rests, PATH B. The phases run in
// that order by events the script sees, never by the probe's clock:
//   find: FORM's actor, by a scan of the process lists' four handle arrays every 30 frames (each handle looked up once and cached;
//     each resolved actor keeps one reference count, as face-dump.js's lookups do), until its 3D and bodies exist and it is dead.
//   capture: once every body has moved under REST_SPEED for REST_MS: each body's position and rotation by its own GetPosition and
//     GetRotation (bhkRigidBody slots 0x33, 0x34), cross-checked against the motion state's translation in memory; the reference's
//     location and angle; and the Havok block through the engine's own serializer, 36016 (the live pose into a sub-buffer), whose
//     bytes are copied out and the sub-buffer freed, as apply-on-demand.js does (run there on a dead bandit: version 78, 993 bytes,
//     19 bodies).
//   A: after the body has moved more than MOVE_UNITS from P0 and rested again: every animation graph's BSIRagdollDriver::
//     SetMotionType(kKeyframed) (slot 0x08), then STEPS writes STEP_MS apart, each body's position lerped and rotation slerped from
//     where it lay toward P0, through SetRotation then SetPosition (slots 0x36, 0x35, the order the engine's own per-body reader
//     19538 uses); HOLD_MS with no writes; then SetMotionType(kDynamic) and RELEASE_MS more. Pose rows throughout.
//   B: after another move and rest: the captured sub-buffer copied onto the engine heap (MemoryManager::Allocate), the reference's
//     location and angle written back to the capture's, directly in memory and never restored (RESET_REFR; the static read: 19535
//     places the root body at the reference's position and skips a saved body more than 4096 from it), then 36014(holder, form), the
//     re-apply route that runs 19535 on a live 3D (docs/research/adr065-serialize-on-demand-2026-11-03.md Q3); OBSERVE_MS of pose rows.
// Every engine call runs inside a REPLACEMENT of the player's own update (the original first), never inside a listener: Frida's
// listener guard makes every hooked function called from a listener invisible on that thread (the memory note
// frida-lab-script-pitfalls; apply-on-demand.js v2.2's idiom), and the 19535, 19538 and slot 0x35 and 0x36 counts are the read.
// The replacement is reverted from Frida's own thread when the run is done or TTL_S passes (v1.1: a finish while the ragdoll is
// keyframed first sets it back to kDynamic, on the main thread; a ragdoll left keyframed with no main-thread step for 10 s is
// reported by a 'stalled' row from Frida's thread, which calls nothing).
//
// Ids, by `just addr <id>` (lab/addr.py over addrlib/, runtime 1.6.1170.0, 428461 entries, run 2026-11-11; never from memory):
//   CommonLibSSE-NG b93280e8 names these (RELOCATION_ID is (SE, AE), the AE id resolved):
//   208040 0x18ab9c0  VTABLE_PlayerCharacter[0] (include/RE/Offsets_VTABLE.h:2231); slot 0xAD Actor::Update(float) (A/Actor.h:371),
//                     REPLACED with a NativeCallback of that signature that calls the original first; printed beside `just addr 40447`
//                     0x732660
//   400315 0x20f69b0  ProcessLists** (src/RE/P/ProcessLists.cpp:13); highActorHandles +0x30, lowActorHandles +0x48,
//                     middleHighActorHandles +0x60, middleLowActorHandles +0x78 (P/ProcessLists.h:69-72), each a BSTArray: _data +0x00,
//                     _size +0x10 (B/BSTArray.h:47, after the 0x10-byte heap allocator)
//   12332  0x179710   LookupReferenceByHandle (Offsets.h:582)
//   403449 0x31872c0  Main** (Offsets.h:383); threadID +0x28 (M/Main.h:87)
//   187407 0x177adfc  bhkWorld::GetWorldScaleInverse's float (B/bhkWorld.h:48-52): game units per Havok unit (69.99125), the factor
//                     the errors and speeds are read by (v1.1)
//   188105 0x17849dc  bhkWorld::GetWorldScale's float (:42-46): Havok units per game unit (0.0142875), the cross-check, printed
//   11141  0x11bba0   MemoryManager::GetSingleton (M/MemoryManager.h:29-33)
//   68115  0xcc40c0   MemoryManager::Allocate(this, size, alignment, alignmentRequired) (M/MemoryManager.h:36-40); the bool as uint8
//                     (the memory note frida-bool-args)
//   68117  0xcc4510   MemoryManager::Deallocate(this, mem, alignmentRequired) (M/MemoryManager.h:43-46)
//   190275 0x17aeb58  VTABLE_bhkRigidBody[0] (Offsets_VTABLE.h:654) and 239275 0x19e7a68 VTABLE_bhkRigidBodyT[0] (:5885; CommonLib
//                     names the class by its vtable alone): slots 0x35 SetPosition and 0x36 SetRotation (B/bhkRigidBody.h:43-44) of
//                     both ATTACHED, each distinct address once, to count the engine's own writes inside 19535 (v1.1: bhkRigidBodyT
//                     overrides slots 0x33 to 0x37, its 0x35 and 0x36 at 0xebb820 and 0xebb8f0 against bhkRigidBody's 0xe92d90 and
//                     0xe92e20, the exe's vtables read 2026-11-11); every call this script makes goes through the body's own vtable
//                     (slots 0x33 to 0x36, :41-44)
//   Named by the static read alone (pyghidra-mcp on sky-re, 2026-11-03; HYPOTHESIS by rule 2; ids, signatures and roles from
//   docs/research/adr065-serialize-on-demand-2026-11-03.md: :718 the id table, :810-822 19535, :955 36016, :1023-1031 Q3):
//   36016  0x6259a0   the live pose into a sub-buffer, void (BGSLoadGameSubBuffer** holder, TESForm* form): ran in apply-on-demand.js
//                     on a dead actor (the research's run rows, :1071, :1088)
//   36014  0x625800   the re-apply route, void (holder, form): a stack BGSLoadFormBuffer, 36019 from the sub-buffer (consumed and
//                     freed, the holder nulled), 19535 on the reference; NEVER RUN before this script (Q3 names it the clean call)
//   19535  0x2db450   the Havok block reader (ref, buf): the live body count against the saved, the node Dynamic for a dead actor,
//                     19538 per body; ATTACHED (a count per call, its caller)
//   19538  0x2dbfc0   its per-body reader: SetRotation and SetPosition on each non-anim-targeted body within 4096 of the reference;
//                     ATTACHED (a count per call)
//   The sub-buffer's shape, [u8 version][varint length][the block], the varint value << 2 | width (36052's encoding), is the
//   research's (:1012) and apply-on-demand.js's vi() and subHeader(), copied here.
//
// Layouts (CommonLibSSE-NG b93280e8, include/RE/):
//   TESForm formID +0x14, formType +0x1A (T/TESForm.h:353-355); TESObjectREFR data.angle +0x48 and data.location +0x54 (OBJ_REFR at
//     +0x40, T/TESObjectREFR.h:78-79, :495), loadedData +0x68 (:497), data3D +0x68 (:101); the IAnimationGraphManagerHolder at +0x38
//     (T/TESObjectREFR.h:112), its slot 0x02 GetAnimationGraphManagerImpl(BSTSmartPointer<BSAnimationGraphManager>&)
//     (I/IAnimationGraphManagerHolder.h:26), the fallback when the actor has no middle-high process (the smart pointer it fills keeps
//     its one count).
//   Actor: ActorState at +0xC0 on AE (A/Actor.h:128), actorState1 +0x08 (A/ActorState.h:203), lifeState bits 21-24 (:114, kDead 2
//     :11); currentProcess, commented 0F0 in the older layout, at +0xF8 on 1.6.1170 (A/Actor.h:651, RelocateMemberIfNewer(1.6.629,
//     this, 0xE0, 0xE8) at :712; apply-on-demand.js read it at +0xF8 in its runs); AIProcess middleHigh +0x08 (A/AIProcess.h:196);
//     MiddleHighProcessData animationGraphManager +0x1A8 (M/MiddleHighProcessData.h:161), a BSTSmartPointer whose one member is the
//     pointer (B/BSTSmartPointer.h:229); BSAnimationGraphManager graphs +0x40 (B/BSAnimationGraphManager.h:121), a
//     BSTSmallArray<BSTSmartPointer<BShkbAnimationGraph>> of one inline slot (BSTArray.h:648-649): its word +0x40 (the local bit 31,
//     BSTArray.h:280-281), data +0x48 (:282), size +0x50 (:47); a BShkbAnimationGraph's BSIRagdollDriver is its first base, at +0
//     (B/BShkbAnimationGraph.h:28-29), slot 0x08 SetMotionType(hkpMotion::MotionType) (B/BSIRagdollDriver.h:23; MotionType an int
//     enum, kDynamic 1, kKeyframed 4, H/hkpMotion.h:26-35).
//   The bodies: the 3D walked node by node, a node descended only when its RTTI names NiNode among its bases (face-dump.js's
//     locator); a node's collisionObject +0x40 (N/NiAVObject.h:156), name +0x10 (N/NiObjectNET.h:53); NiNode children +0x110, a
//     NiTArray: _data +0x08, _capacity +0x10 (N/NiNode.h:76, N/NiTArray.h:116-117); bhkNiCollisionObject flags +0x18 (kAnimTargeted
//     1 << 10) and body +0x20 (B/bhkNiCollisionObject.h:26, :54, :56), the bhkRigidBody; its referencedObject +0x10, the hkpRigidBody
//     (B/bhkRefObject.h:26); the hkpRigidBody's motion +0x150 (H/hkpEntity.h:99) with type +0x10 (H/hkpMotion.h:77), the motion
//     state's translation +0x20 +0x30 (:82, H/hkMotionState.h:14, H/hkTransform.h:12) and linear velocity +0xE0 (:84), all Havok units.
//   An hkVector4 and an hkQuaternion are four floats each, 16-byte aligned (the scratch is a page Frida maps, so aligned).
//
// HYPOTHESIS until a run reads as expected (rule 2): every 36014, 36016, 19535 and 19538 role and signature above; that slot 0x08
// on the graph keyframes the ragdoll's bodies (the rows print each body's motion type after it); that the keyframed bodies keep a
// written transform (H6, path A's question); that 19535 applies a block captured on the same seat onto the moved live 3D when the
// counts match (path B's question); that writing the reference's location and angle is what 19535 reads as the reference's
// position; that the player's update runs once a frame on the main thread.
//
// Rows (console.log and send(), the lab's preamble flushing them to the trace's .log every 250 ms):
//   {event:'ready'}: version, pid (against the run's c<N>-skyrim-platform-pid<N>.log: the memory note lab-frida-wrong-process),
//     base, Main's thread, every site's id, rva, address and first bytes read before any patch, params, attachErrors.
//   {event:'found'}: the actor, its life state, bodies (name, motion type, layer, kAnimTargeted), the graphs and how they were reached.
//   {event:'capture'}: P0's body count (H6's 64; v1.1: every body the walk met, so fitsIn64 can read false), the root body's
//     position, the reference's location and angle, the largest gap between GetPosition and the memory read (the +0x1A0 offset's
//     check, and bhkRigidBodyT's offset if it has one), the block's header (version, length, count, flags, FNV-1a).
//   {event:'phase'}: each phase's start, each step, the keyframe's and the release's resulting motion types, B's holder after 36014
//     (null: consumed), and per phase the 19535, 19538, slot 0x35 and slot 0x36 counts on the replacement's thread.
//   {event:'pose'}: every ROW_EVERY_FRAMES frames of an active window and at each window's end: the per-bone error against P0 in
//     game units (max, mean, the root's, the worst three by name), the motion types, the rotation error in degrees at the end.
//   {event:'havokRead'}: each 19535 call on any thread with its caller and its 19538 count, so a read the engine makes on its own
//     (the 3D init, a cell's flush) shows beside the script's.
//   {event:'thread'} once, if the update ran on a thread that is not Main's (no step runs there).
//   {event:'restore'} at a finish while the ragdoll is keyframed: kDynamic set back, or why it was not (no 3D, no id).
//   {event:'stalled'} from Frida's thread, once a stall, when the ragdoll is keyframed and no main-thread step ran for 10 s.
//   {event:'liveness'} every 10 s: the phase, counts (offMain: the update's calls off Main's thread), frames.
// Params (LAB_PARAMS): FORM (required: the body's reference id, a number or a hex string), PHASES ('A,B'), STEPS (10), STEP_MS
// (100), HOLD_MS (3000), RELEASE_MS (3000), OBSERVE_MS (5000), REST_SPEED (5 units a second), REST_MS (1500), MOVE_UNITS (48),
// RESET_REFR (true), ROW_EVERY_FRAMES (6), TTL_S (900); v1.1 drops BODIES_MAX (the walk counts every body, NODES_MAX 8192 nodes
// bounding it). 1.6.1170 only.
const PARAMS = (typeof LAB_PARAMS === 'object' && LAB_PARAMS) ? LAB_PARAMS : {};
const num = function (v, d) { return (v === undefined || v === null) ? d : Number(v); };
const FORM_ID = typeof PARAMS.FORM === 'string' ? parseInt(PARAMS.FORM, 16) : num(PARAMS.FORM, 0);
const PHASES = String(PARAMS.PHASES === undefined ? 'A,B' : PARAMS.PHASES).split(',').map(function (s) { return s.trim(); }).filter(function (s) { return s === 'A' || s === 'B'; });
const STEPS = Math.max(1, num(PARAMS.STEPS, 10));
const STEP_MS = num(PARAMS.STEP_MS, 100);
const HOLD_MS = num(PARAMS.HOLD_MS, 3000);
const RELEASE_MS = num(PARAMS.RELEASE_MS, 3000);
const OBSERVE_MS = num(PARAMS.OBSERVE_MS, 5000);
const REST_SPEED = num(PARAMS.REST_SPEED, 5);
const REST_MS = num(PARAMS.REST_MS, 1500);
const MOVE_UNITS = num(PARAMS.MOVE_UNITS, 48);
const RESET_REFR = PARAMS.RESET_REFR === undefined ? true : !!PARAMS.RESET_REFR;
const EVERY = num(PARAMS.ROW_EVERY_FRAMES, 6);
const NODES_MAX = 8192; // v1.1: the walk's bound, in nodes visited; every body met is counted and kept
const TTL_S = num(PARAMS.TTL_S, 900);
function emit(obj) { obj.t = Date.now(); send(obj); console.log(JSON.stringify(obj)); }

const OFFSETS = {
  '1.6.1170.0': {
    playerVtable: 0x18ab9c0, // 208040 VTABLE_PlayerCharacter[0]
    playerUpdateById: 0x732660, // 40447, the cross-check for slot 0xAD
    processLists: 0x20f69b0, // 400315 ProcessLists**
    lookupRef: 0x179710, // 12332 LookupReferenceByHandle
    mainSingleton: 0x31872c0, // 403449 Main**
    worldScaleInverse: 0x177adfc, // 187407 bhkWorld::GetWorldScaleInverse's float: game units per Havok unit (v1.1)
    worldScale: 0x17849dc, // 188105 bhkWorld::GetWorldScale's float: Havok units per game unit, the cross-check
    heap: 0x11bba0, // 11141 MemoryManager::GetSingleton
    allocate: 0xcc40c0, // 68115 MemoryManager::Allocate
    deallocate: 0xcc4510, // 68117 MemoryManager::Deallocate
    rigidBodyVtable: 0x17aeb58, // 190275 VTABLE_bhkRigidBody[0]
    rigidBodyTVtable: 0x19e7a68, // 239275 VTABLE_bhkRigidBodyT[0] (v1.1)
    livePose: 0x6259a0, // 36016 (static read) the live pose into a sub-buffer
    reapply: 0x625800, // 36014 (static read) the re-apply route
    havokRead: 0x2db450, // 19535 (static read) the Havok block reader
    havokBody: 0x2dbfc0, // 19538 (static read) its per-body reader
  },
};
const FORM = { id: 0x14, type: 0x1a };
const REFR = { angle: 0x48, location: 0x54, loaded: 0x68, holder: 0x38 };
const LOADED_3D = 0x68;
const ACTOR = { state1: 0xc8, process: 0xf8 };
const PROCESS_MIDDLE_HIGH = 0x08;
const GRAPH_MANAGER = 0x1a8;
const GRAPHS = { word: 0x40, data: 0x48, size: 0x50 };
const LISTS = [0x30, 0x48, 0x60, 0x78];
const NODE = { name: 0x10, collision: 0x40, children: 0x110 };
const NITARRAY = { data: 0x08, capacity: 0x10 };
const COLL = { flags: 0x18, body: 0x20 };
const ANIM_TARGETED = 1 << 10;
const REFERENCED = 0x10;
const FILTER_INFO = 0x4c;
const BODY = { type: 0x160, pos: 0x1a0, linV: 0x230 };
const SLOT = { update: 0xad, getPos: 0x33, getRot: 0x34, setPos: 0x35, setRot: 0x36, driverMotion: 0x08, holderManager: 0x02 };
const MOTION_DYNAMIC = 1;
const MOTION_KEYFRAMED = 4;

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
const f32 = function (p, o) { try { return p.add(o).readFloat(); } catch (e) { return NaN; } };
const ptrAt = function (p, o) { try { return p.add(o).readPointer(); } catch (e) { return NULL; } };
const r1 = function (x) { return Math.round(x * 10) / 10; };
const firstBytes = function (p) {
  try { return Array.from(new Uint8Array(p.readByteArray(8))).map(function (b) { return ('0' + b.toString(16)).slice(-2); }).join(' '); } catch (e) { return 'unreadable'; }
};
const fnv1a = function (bytes) { let h = 0x811c9dc5; for (let i = 0; i < bytes.length; i++) { h ^= bytes[i]; h = Math.imul(h, 0x01000193) >>> 0; } return h >>> 0; };
const vi = function (b, o) { const w = b[o] & 3; return w === 0 ? [b[o] >> 2, 1] : (w === 1 ? [((b[o + 1] << 8) | b[o]) >> 2, 2] : [((b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 2), 4]); };
const dist3 = function (a, b) { const dx = a[0] - b[0]; const dy = a[1] - b[1]; const dz = a[2] - b[2]; return Math.sqrt(dx * dx + dy * dy + dz * dz); };
const qnorm = function (q) { const n = Math.sqrt(q[0] * q[0] + q[1] * q[1] + q[2] * q[2] + q[3] * q[3]) || 1; return [q[0] / n, q[1] / n, q[2] / n, q[3] / n]; };
const qdot = function (a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3]; };
const slerp = function (a, b, t) {
  let d = qdot(a, b);
  let bb = b;
  if (d < 0) { d = -d; bb = [-b[0], -b[1], -b[2], -b[3]]; }
  if (d > 0.9995) return qnorm([a[0] + t * (bb[0] - a[0]), a[1] + t * (bb[1] - a[1]), a[2] + t * (bb[2] - a[2]), a[3] + t * (bb[3] - a[3])]);
  const th = Math.acos(Math.min(1, d));
  const s = Math.sin(th);
  const ka = Math.sin((1 - t) * th) / s;
  const kb = Math.sin(t * th) / s;
  return [ka * a[0] + kb * bb[0], ka * a[1] + kb * bb[1], ka * a[2] + kb * bb[2], ka * a[3] + kb * bb[3]];
};
const qangle = function (a, b) { return Math.acos(Math.min(1, Math.abs(qdot(qnorm(a), qnorm(b))))) * 2 * 180 / Math.PI; };

const exe = Process.getModuleByName('SkyrimSE.exe');
const version = fileVersion(exe.path);
const off = OFFSETS[version];
if (off === undefined || !(FORM_ID > 0)) {
  emit({ event: 'ready', error: off === undefined ? 'no offsets for this runtime' : 'FORM is required', version: version, pid: Process.id });
} else {
  const at = function (name) { return exe.base.add(off[name]); };
  const rva = function (p) { try { return hex(p.sub(exe.base).toUInt32()); } catch (e) { return String(p); } };
  const exeEnd = exe.base.add(exe.size);
  const inExe = function (p) { return !isNil(p) && p.compare(exe.base) >= 0 && p.compare(exeEnd) < 0; };
  // game units per Havok unit: GetWorldScaleInverse's float, trusted only when GetWorldScale's is its inverse (v1.1); without it the
  // first step ends the run (an error in game units needs the scale)
  const scaleInverse = f32(at('worldScaleInverse'), 0);
  const scaleForward = f32(at('worldScale'), 0);
  const scaleOk = scaleInverse > 1 && scaleInverse < 1000 && Math.abs(scaleInverse * scaleForward - 1) < 0.001;
  const SCALE = scaleOk ? scaleInverse : NaN;
  const mainTid = function () { return u32(ptrAt(at('mainSingleton'), 0), 0x28); };
  const nf = {
    lookup: new NativeFunction(at('lookupRef'), 'bool', ['pointer', 'pointer'], 'win64'),
    heap: new NativeFunction(at('heap'), 'pointer', [], 'win64'),
    allocate: new NativeFunction(at('allocate'), 'pointer', ['pointer', 'uint64', 'int32', 'uint8'], 'win64'),
    deallocate: new NativeFunction(at('deallocate'), 'void', ['pointer', 'pointer', 'uint8'], 'win64'),
    livePose: new NativeFunction(at('livePose'), 'void', ['pointer', 'pointer'], 'win64'),
    reapply: new NativeFunction(at('reapply'), 'void', ['pointer', 'pointer'], 'win64'),
  };
  const fnCache = {};
  const virtualFn = function (obj, slot, ret, argTypes) {
    const fp = ptrAt(ptrAt(obj, 0), slot * Process.pointerSize);
    if (isNil(fp)) throw new Error('no vtable slot ' + hex(slot));
    const k = String(fp) + '/' + ret + '/' + argTypes.join(',');
    if (fnCache[k] === undefined) fnCache[k] = new NativeFunction(fp, ret, argTypes, 'win64');
    return fnCache[k];
  };
  const scratch = Memory.alloc(Process.pageSize); // page aligned: hkVector4 and hkQuaternion slots 16 bytes apart
  const VEC = scratch;
  const QUAT = scratch.add(0x10);
  const counts = { frames: 0, offMain: 0, havokRead: 0, havokBody: 0, setPos: 0, setRot: 0, scans: 0, lookups: 0 };
  const attachErrors = [];
  const failed = {};
  const fail = function (where, e) { if (failed[where]) return; failed[where] = true; emit({ event: 'error', where: where, error: String(e) }); };

  // RTTI (face-dump.js's locator), for the walk's NiNode test
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
  const typeName = function (r) { return exe.base.add(r).add(0x10).readCString().replace(/^\.\?AV/, '').replace(/@@$/, ''); };
  const hasBase = function (obj, name) {
    const col = locator(obj);
    if (!col) return false;
    try {
      const chd = exe.base.add(col.add(16).readS32());
      const n = chd.add(8).readU32();
      const arr = exe.base.add(chd.add(12).readS32());
      for (let i = 0; i < n && i < 64; i++) if (typeName(exe.base.add(arr.add(4 * i).readS32()).readS32()) === name) return true;
    } catch (e) { return false; }
    return false;
  };
  const isNiNode = function (obj) { return hasBase(obj, 'NiNode'); };
  const nodeName = function (node) { const p = ptrAt(node, NODE.name); try { return isNil(p) ? null : p.readCString(); } catch (e) { return null; } };
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
        if (!isNil(hkp) && hasBase(bhk, 'bhkRigidBody')) {
          const fi = u32(hkp, FILTER_INFO);
          out.push({ name: nodeName(node), bhk: bhk, hkp: hkp, layer: fi < 0 ? -1 : fi & 0x7f, animTargeted: (u32(co, COLL.flags) & ANIM_TARGETED) !== 0 });
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
  const rootOf = function (actor) { const ld = ptrAt(actor, REFR.loaded); return isNil(ld) ? NULL : ptrAt(ld, LOADED_3D); };
  const lifeOf = function (actor) { const st = u32(actor, ACTOR.state1); return st < 0 ? -1 : (st >>> 21) & 0xf; };
  const posOf = function (b) { return [f32(b.hkp, BODY.pos) * SCALE, f32(b.hkp, BODY.pos + 4) * SCALE, f32(b.hkp, BODY.pos + 8) * SCALE]; };
  const speedOf = function (b) { const x = f32(b.hkp, BODY.linV) * SCALE; const y = f32(b.hkp, BODY.linV + 4) * SCALE; const z = f32(b.hkp, BODY.linV + 8) * SCALE; return Math.sqrt(x * x + y * y + z * z); };
  const typesOf = function (bodies) { const t = {}; bodies.forEach(function (b) { const m = u8(b.hkp, BODY.type); t[m] = (t[m] || 0) + 1; }); return t; };
  const getPos = function (b) { virtualFn(b.bhk, SLOT.getPos, 'void', ['pointer', 'pointer'])(b.bhk, VEC); return [VEC.readFloat(), VEC.add(4).readFloat(), VEC.add(8).readFloat(), VEC.add(12).readFloat()]; };
  const getRot = function (b) { virtualFn(b.bhk, SLOT.getRot, 'void', ['pointer', 'pointer'])(b.bhk, QUAT); return [QUAT.readFloat(), QUAT.add(4).readFloat(), QUAT.add(8).readFloat(), QUAT.add(12).readFloat()]; };
  const setRot = function (b, q) { QUAT.writeFloat(q[0]); QUAT.add(4).writeFloat(q[1]); QUAT.add(8).writeFloat(q[2]); QUAT.add(12).writeFloat(q[3]); virtualFn(b.bhk, SLOT.setRot, 'void', ['pointer', 'pointer'])(b.bhk, QUAT); };
  const setPos = function (b, p) { VEC.writeFloat(p[0]); VEC.add(4).writeFloat(p[1]); VEC.add(8).writeFloat(p[2]); VEC.add(12).writeFloat(p[3] || 0); virtualFn(b.bhk, SLOT.setPos, 'void', ['pointer', 'pointer'])(b.bhk, VEC); };

  // the animation graphs, by the middle-high process, else the holder's own GetAnimationGraphManagerImpl
  const graphsOf = function (actor) {
    let how = 'middle-high process';
    let manager = NULL;
    const proc = ptrAt(actor, ACTOR.process);
    const mh = isNil(proc) ? NULL : ptrAt(proc, PROCESS_MIDDLE_HIGH);
    if (!isNil(mh)) manager = ptrAt(mh, GRAPH_MANAGER);
    if (isNil(manager)) {
      how = 'the holder slot 0x02';
      try {
        const holder = actor.add(REFR.holder);
        const out = Memory.alloc(Process.pointerSize);
        out.writePointer(NULL);
        virtualFn(holder, SLOT.holderManager, 'uint8', ['pointer', 'pointer'])(holder, out);
        manager = out.readPointer();
      } catch (e) { how = 'none: ' + e; }
    }
    const graphs = [];
    if (!isNil(manager)) {
      const word = u32(manager, GRAPHS.word);
      const local = word < 0 ? -1 : (word >>> 31) & 1;
      const size = u32(manager, GRAPHS.size);
      const data = local === 1 ? manager.add(GRAPHS.data) : ptrAt(manager, GRAPHS.data);
      for (let i = 0; i < size && i < 8 && !isNil(data); i++) { const g = ptrAt(data, i * 8); if (!isNil(g)) graphs.push(g); }
    }
    return { how: how, manager: String(manager), graphs: graphs };
  };

  // FORM's actor by the process lists, each handle looked up once
  const seenHandles = {};
  const findActor = function () {
    counts.scans += 1;
    const lists = ptrAt(at('processLists'), 0);
    if (isNil(lists)) return NULL;
    for (let l = 0; l < LISTS.length; l++) {
      const data = ptrAt(lists, LISTS[l]);
      const size = u32(lists, LISTS[l] + 0x10);
      for (let i = 0; i < size && i < 4096 && !isNil(data); i++) {
        const h = u32(data, i * 4);
        if (!(h > 0) || seenHandles[h] !== undefined) {
          if (seenHandles[h] !== undefined && seenHandles[h].id === FORM_ID) return seenHandles[h].refr;
          continue;
        }
        const hs = Memory.alloc(4);
        hs.writeU32(h);
        const out = Memory.alloc(Process.pointerSize);
        out.writePointer(NULL);
        counts.lookups += 1;
        let r = NULL;
        try { nf.lookup(hs, out); r = out.readPointer(); } catch (e) { r = NULL; }
        seenHandles[h] = { refr: r, id: isNil(r) ? 0 : u32(r, FORM.id) };
        if (seenHandles[h].id === FORM_ID) return r;
      }
    }
    return NULL;
  };

  // the per-bone error against P0, in game units
  const poseError = function (bodies, p0) {
    let max = 0;
    let sum = 0;
    const errs = [];
    bodies.forEach(function (b, i) { const e = dist3(posOf(b), p0[i].pos); errs.push([b.name, r1(e)]); sum += e; if (e > max) max = e; });
    errs.sort(function (a, b) { return b[1] - a[1]; });
    return { max: r1(max), mean: r1(sum / Math.max(1, bodies.length)), root: errs.length ? r1(dist3(posOf(bodies[0]), p0[0].pos)) : null, worst: errs.slice(0, 3) };
  };
  const rotError = function (bodies, p0) {
    let max = 0;
    let sum = 0;
    bodies.forEach(function (b, i) { let a = 0; try { a = qangle(getRot(b), p0[i].rot); } catch (e) { a = NaN; } sum += a; if (a > max) max = a; });
    return { maxDeg: r1(max), meanDeg: r1(sum / Math.max(1, bodies.length)) };
  };

  // the run's state
  const run = { stage: 'find', actor: NULL, bodies: [], graphs: null, p0: null, block: null, refr0: null, restSince: 0, movedFrom: null, phase: null, phaseAt: 0, step: 0, lastRow: 0, done: false, startedAt: Date.now() };
  const reads = {}; // tid -> the 19535 call in flight: its 19538 count
  const phaseCounts = function () { return { havokRead: counts.havokRead, havokBody: counts.havokBody, setPos: counts.setPos, setRot: counts.setRot }; };
  const diffCounts = function (a, b) { return { havokRead: b.havokRead - a.havokRead, havokBody: b.havokBody - a.havokBody, setPos: b.setPos - a.setPos, setRot: b.setRot - a.setRot }; };
  const atRest = function (now) {
    const still = run.bodies.every(function (b) { return speedOf(b) < REST_SPEED; });
    if (!still) { run.restSince = 0; return false; }
    if (run.restSince === 0) run.restSince = now;
    return now - run.restSince >= REST_MS;
  };
  const movedFromP0 = function () { return poseError(run.bodies, run.p0).max > MOVE_UNITS; };
  const poseRow = function (phase, final) {
    const row = { event: 'pose', phase: phase, frame: counts.frames, ms: Date.now() - run.phaseAt, types: typesOf(run.bodies), error: poseError(run.bodies, run.p0) };
    if (final) { row.final = true; row.rotation = rotError(run.bodies, run.p0); }
    emit(row);
  };
  const capture = function () {
    const p0 = [];
    let gap = 0;
    run.bodies.forEach(function (b) {
      const hp = getPos(b);
      const mem = [f32(b.hkp, BODY.pos), f32(b.hkp, BODY.pos + 4), f32(b.hkp, BODY.pos + 8)];
      gap = Math.max(gap, dist3(hp, mem));
      p0.push({ pos: [mem[0] * SCALE, mem[1] * SCALE, mem[2] * SCALE], mem: mem, havok: hp, rot: getRot(b) }); // v1.1: errors by memory, writes by accessor
    });
    run.p0 = p0;
    run.refr0 = { angle: [f32(run.actor, REFR.angle), f32(run.actor, REFR.angle + 4), f32(run.actor, REFR.angle + 8)], location: [f32(run.actor, REFR.location), f32(run.actor, REFR.location + 4), f32(run.actor, REFR.location + 8)] };
    // the engine's own serializer: 36016 into a holder, the bytes copied out, the sub-buffer freed
    const holder = Memory.alloc(Process.pointerSize);
    holder.writePointer(NULL);
    let block = null;
    try {
      nf.livePose(holder, run.actor);
      const sub = holder.readPointer();
      if (isNil(sub)) block = { error: '36016 produced no sub-buffer' };
      else {
        const head = new Uint8Array(sub.readByteArray(5));
        const len = vi(head, 1);
        const total = 1 + len[1] + len[0];
        const bytes = new Uint8Array(sub.readByteArray(total));
        const body = bytes.subarray(1 + len[1]);
        block = { bytes: bytes, version: head[0], blockLen: len[0], total: total, blockFlags: hex(body[0]), count: vi(body, 1)[0], fnv1a: hex(fnv1a(body)) };
        try { nf.deallocate(nf.heap(), sub, 0); } catch (e) { block.freeError = String(e); }
      }
    } catch (e) { block = { error: '36016: ' + e }; }
    run.block = block;
    emit({ event: 'capture', frame: counts.frames, bodies: run.bodies.length, fitsIn64: run.bodies.length <= 64, nodes: run.bodies.nodes, nodesCapped: !!run.bodies.nodesCapped, root: { name: run.bodies[0].name, pos: p0[0].pos.map(r1) }, refr: { angle: run.refr0.angle.map(function (x) { return +x.toFixed(4); }), location: run.refr0.location.map(r1) }, getPosAgainstMemory: +gap.toFixed(5), types: typesOf(run.bodies), block: block === null ? null : { version: block.version, blockLen: block.blockLen, total: block.total, blockFlags: block.blockFlags, count: block.count, fnv1a: block.fnv1a, error: block.error, freeError: block.freeError } });
  };
  const setDriver = function (type) {
    const results = [];
    run.graphs = graphsOf(run.actor); // v1.1: re-resolved at every call; a rebuilt 3D may have freed the graphs read before
    if (run.graphs.graphs.length === 0) results.push({ error: 'no graph: ' + run.graphs.how });
    run.graphs.graphs.forEach(function (g) {
      try { virtualFn(g, SLOT.driverMotion, 'void', ['pointer', 'uint32'])(g, type); results.push({ graph: String(g), ok: true }); } catch (e) { results.push({ graph: String(g), error: String(e) }); }
    });
    run.keyframed = type === MOTION_KEYFRAMED;
    return results;
  };
  const startPhase = function (name) {
    run.phase = name;
    run.phaseAt = Date.now();
    run.step = 0;
    run.lastRow = counts.frames;
    run.base = phaseCounts();
    // v1.1: the writes' start is each body's own GetPosition (the capture's target is too), so an accessor offset cancels
    let fromFallback = 0;
    run.from = run.bodies.map(function (b) {
      let r = null;
      let h = null;
      try { r = getRot(b); } catch (e) { r = [0, 0, 0, 1]; }
      try { h = getPos(b); } catch (e) { h = [f32(b.hkp, BODY.pos), f32(b.hkp, BODY.pos + 4), f32(b.hkp, BODY.pos + 8), 0]; fromFallback += 1; }
      return { havok: h, rot: r };
    });
    emit({ event: 'phase', phase: name, step: 'start', frame: counts.frames, error: poseError(run.bodies, run.p0), types: typesOf(run.bodies), fromFallback: fromFallback });
  };
  const writeStep = function (k) {
    const t = k / STEPS;
    run.bodies.forEach(function (b, i) {
      const a = run.from[i];
      const z = run.p0[i];
      const p = [a.havok[0] + t * (z.havok[0] - a.havok[0]), a.havok[1] + t * (z.havok[1] - a.havok[1]), a.havok[2] + t * (z.havok[2] - a.havok[2]), 0];
      setRot(b, slerp(qnorm(a.rot), qnorm(z.rot), t));
      setPos(b, p);
    });
  };
  const replay = function () {
    const src = run.block;
    if (src === null || src.bytes === undefined) return { error: 'no captured block' };
    const before = RESET_REFR ? { angle: [f32(run.actor, REFR.angle), f32(run.actor, REFR.angle + 4), f32(run.actor, REFR.angle + 8)], location: [f32(run.actor, REFR.location), f32(run.actor, REFR.location + 4), f32(run.actor, REFR.location + 8)] } : null;
    if (RESET_REFR) {
      for (let i = 0; i < 3; i++) { run.actor.add(REFR.angle + 4 * i).writeFloat(run.refr0.angle[i]); run.actor.add(REFR.location + 4 * i).writeFloat(run.refr0.location[i]); }
    }
    const heap = nf.heap();
    const sub = nf.allocate(heap, src.total, 0, 0);
    if (isNil(sub)) return { error: 'Allocate returned null' };
    sub.writeByteArray(Array.from(src.bytes));
    const holder = Memory.alloc(Process.pointerSize);
    holder.writePointer(sub);
    nf.reapply(holder, run.actor);
    const after = holder.readPointer();
    return { resetRefr: RESET_REFR, refrBefore: before, holderAfter: String(after), consumed: isNil(after) };
  };

  // the step, once a frame inside the update's replacement, after the original
  const step = function () {
    const now = Date.now();
    if (run.done) return;
    if (!(SCALE > 0)) { finish('no world scale (GetWorldScaleInverse read ' + scaleInverse + ', GetWorldScale ' + scaleForward + ')'); return; }
    if (now - run.startedAt > TTL_S * 1000) { finish('ttl ' + TTL_S + ' s at stage ' + run.stage); return; }
    if (run.stage === 'find') {
      if (counts.frames % 30 !== 0) return;
      const a = findActor();
      if (isNil(a)) return;
      const root = rootOf(a);
      if (isNil(root)) return;
      const life = lifeOf(a);
      if (life !== 2) return;
      const bodies = walkBodies(root);
      if (bodies.length === 0) return;
      run.actor = a;
      run.root = root;
      run.bodies = bodies;
      run.graphs = graphsOf(a);
      run.stage = 'settle0';
      emit({ event: 'found', frame: counts.frames, ref: hex(FORM_ID), actor: String(a), life: life, bodies: bodies.length, bodyList: bodies.map(function (b) { return [b.name, u8(b.hkp, BODY.type), b.layer, b.animTargeted ? 1 : 0]; }), graphs: { how: run.graphs.how, manager: run.graphs.manager, count: run.graphs.graphs.length, at: run.graphs.graphs.map(String) } });
      return;
    }
    const root = rootOf(run.actor);
    if (root.isNull() || u32(run.actor, FORM.id) !== FORM_ID) { finish('the body lost its 3D or its id at stage ' + run.stage); return; }
    if (!root.equals(run.root)) {
      // the 3D was rebuilt: the bodies are walked again, and a different count ends the run (P0 names bodies by index)
      const again = walkBodies(root);
      emit({ event: 'rebuilt', frame: counts.frames, stage: run.stage, bodies: again.length, before: run.bodies.length });
      if (again.length !== run.bodies.length) { finish('the 3D was rebuilt with ' + again.length + ' bodies against ' + run.bodies.length); return; }
      run.root = root;
      run.bodies = again;
    }
    if (run.stage === 'settle0') {
      if (!atRest(now)) return;
      capture();
      run.stage = PHASES.length ? 'move-' + PHASES[0] : 'done';
      if (run.stage === 'done') finish('captured; no phases');
      return;
    }
    if (run.stage.indexOf('move-') === 0) {
      const next = run.stage.slice(5);
      if (movedFromP0()) { run.stage = 'rest-' + next; run.restSince = 0; emit({ event: 'phase', phase: next, step: 'moved', frame: counts.frames, error: poseError(run.bodies, run.p0) }); }
      return;
    }
    if (run.stage.indexOf('rest-') === 0) {
      const next = run.stage.slice(5);
      if (!atRest(now)) return;
      startPhase(next);
      if (next === 'A') {
        const r = setDriver(MOTION_KEYFRAMED);
        emit({ event: 'phase', phase: 'A', step: 'keyframed', frame: counts.frames, driver: r, types: typesOf(run.bodies) });
        run.stage = 'A-steps';
      } else {
        let r = null;
        try { r = replay(); } catch (e) { r = { error: String(e) }; }
        emit({ event: 'phase', phase: 'B', step: 'replayed', frame: counts.frames, result: r, counts: diffCounts(run.base, phaseCounts()), types: typesOf(run.bodies) });
        run.stage = 'B-observe';
        run.windowAt = now;
      }
      return;
    }
    if (run.stage === 'A-steps') {
      if (now - run.phaseAt < run.step * STEP_MS) return;
      run.step += 1;
      try { writeStep(run.step); } catch (e) { fail('A write', e); }
      if (run.step >= STEPS) { emit({ event: 'phase', phase: 'A', step: 'written', frame: counts.frames, steps: STEPS, error: poseError(run.bodies, run.p0), types: typesOf(run.bodies) }); run.stage = 'A-hold'; run.windowAt = now; }
      if (counts.frames - run.lastRow >= EVERY) { run.lastRow = counts.frames; poseRow('A-steps', false); }
      return;
    }
    if (run.stage === 'A-hold') {
      if (counts.frames - run.lastRow >= EVERY) { run.lastRow = counts.frames; poseRow('A-hold', false); }
      if (now - run.windowAt < HOLD_MS) return;
      poseRow('A-hold', true);
      const r = setDriver(MOTION_DYNAMIC);
      emit({ event: 'phase', phase: 'A', step: 'released', frame: counts.frames, driver: r, types: typesOf(run.bodies) });
      run.stage = 'A-release';
      run.windowAt = now;
      return;
    }
    if (run.stage === 'A-release') {
      if (counts.frames - run.lastRow >= EVERY) { run.lastRow = counts.frames; poseRow('A-release', false); }
      if (now - run.windowAt < RELEASE_MS) return;
      poseRow('A-release', true);
      emit({ event: 'phase', phase: 'A', step: 'done', frame: counts.frames, counts: diffCounts(run.base, phaseCounts()) });
      const i = PHASES.indexOf('A');
      run.stage = i >= 0 && i + 1 < PHASES.length ? 'move-' + PHASES[i + 1] : 'done';
      if (run.stage === 'done') finish('phases done');
      return;
    }
    if (run.stage === 'B-observe') {
      if (counts.frames - run.lastRow >= EVERY) { run.lastRow = counts.frames; poseRow('B-observe', false); }
      if (now - run.windowAt < OBSERVE_MS) return;
      poseRow('B-observe', true);
      emit({ event: 'phase', phase: 'B', step: 'done', frame: counts.frames, counts: diffCounts(run.base, phaseCounts()) });
      const i = PHASES.indexOf('B');
      run.stage = i >= 0 && i + 1 < PHASES.length ? 'move-' + PHASES[i + 1] : 'done';
      if (run.stage === 'done') finish('phases done');
    }
  };

  // the sites, their first bytes read before any patch
  const resolved = {};
  const note = function (name, id, p, mode) { resolved[name] = { id: id, rva: rva(p), at: String(p), mode: mode, bytes: firstBytes(p) }; };
  const updateAt = ptrAt(at('playerVtable'), SLOT.update * Process.pointerSize);
  // v1.1: slots 0x35 and 0x36 of bhkRigidBody's and bhkRigidBodyT's vtables, each distinct address once
  const rbSites = {};
  [['bhkRigidBody', 190275, at('rigidBodyVtable')], ['bhkRigidBodyT', 239275, at('rigidBodyTVtable')]].forEach(function (v) {
    [['setPos', SLOT.setPos, 'SetPosition'], ['setRot', SLOT.setRot, 'SetRotation']].forEach(function (sl) {
      const p = ptrAt(v[2], sl[1] * Process.pointerSize);
      if (isNil(p)) { attachErrors.push(v[0] + ' slot ' + hex(sl[1]) + ': none'); return; }
      const k = String(p);
      if (rbSites[k] === undefined) rbSites[k] = { kind: sl[0], fn: sl[2], at: p, classes: [], ids: [] };
      rbSites[k].classes.push(v[0]);
      rbSites[k].ids.push(v[1]);
    });
  });
  note('PlayerCharacter::Update', 208040, updateAt, 'replace');
  note('havokRead 19535', 19535, at('havokRead'), 'attach');
  note('havokBody 19538', 19538, at('havokBody'), 'attach');
  Object.keys(rbSites).forEach(function (k) { const site = rbSites[k]; note(site.classes.join('+') + '::' + site.fn, site.ids.join('+'), site.at, 'attach'); });
  note('livePose 36016', 36016, at('livePose'), 'call');
  note('reapply 36014', 36014, at('reapply'), 'call');

  const attach = function (name, p, cb) { try { Interceptor.attach(p, cb); } catch (e) { attachErrors.push(name + ': ' + e); } };
  attach('19535', at('havokRead'), {
    onEnter(args) {
      counts.havokRead += 1;
      reads[this.threadId] = { bodies: 0, form: u32(args[0], FORM.id), caller: rva(this.returnAddress) };
    },
    onLeave() {
      const r = reads[this.threadId];
      delete reads[this.threadId];
      if (r !== undefined && r.form === FORM_ID) emit({ event: 'havokRead', form: hex(r.form), tid: this.threadId, caller: r.caller, havokBody: r.bodies, stage: run.stage, frame: counts.frames });
    },
  });
  attach('19538', at('havokBody'), { onEnter() { counts.havokBody += 1; const r = reads[this.threadId]; if (r !== undefined) r.bodies += 1; } });
  Object.keys(rbSites).forEach(function (k) {
    const site = rbSites[k];
    const label = site.kind + '@' + site.classes.join('+');
    counts[label] = 0;
    attach(label, site.at, { onEnter() { if (reads[this.threadId] !== undefined) { counts[site.kind] += 1; counts[label] += 1; } } });
  });

  let reverted = false;
  // every finish runs inside the replacement on Main's thread (step's callers alone); while the ragdoll is keyframed it is set back
  // to kDynamic first, when the body still reads its id and has 3D (no graph is called on a torn-down body)
  const finish = function (why) {
    if (run.done) return;
    run.done = true;
    if (run.keyframed) {
      const hasId = !isNil(run.actor) && u32(run.actor, FORM.id) === FORM_ID;
      const has3D = hasId && !rootOf(run.actor).isNull();
      if (has3D) {
        let r = null;
        try { r = setDriver(MOTION_DYNAMIC); } catch (e) { r = [{ error: String(e) }]; }
        emit({ event: 'restore', why: why, frame: counts.frames, driver: r, types: typesOf(run.bodies) });
      } else {
        emit({ event: 'restore', why: why, frame: counts.frames, skipped: hasId ? 'the body has no 3D' : 'the reference no longer reads its id' });
        run.keyframed = false;
      }
    }
    emit({ event: 'done', why: why, stage: run.stage, frame: counts.frames, counts: JSON.parse(JSON.stringify(counts)) });
    setTimeout(function () { try { Interceptor.revert(updateAt); Interceptor.flush(); reverted = true; emit({ event: 'reverted', frame: counts.frames }); } catch (e) { fail('revert', e); } }, 0);
  };
  let updateReplaced = false;
  let updateCallback = null; // v1.1: held here and read by the liveness row, so it outlives the revert
  let offMainSaid = false;
  let lastStepAt = Date.now();
  if (!isNil(updateAt)) {
    try {
      // the chain to the original with exceptions 'propagate' (apply-on-demand.js:831): no exceptor scope around the engine's code
      const original = new NativeFunction(updateAt, 'void', ['pointer', 'float'], { abi: 'win64', exceptions: 'propagate' });
      updateCallback = new NativeCallback(function (self, delta) {
        original(self, delta);
        try {
          const tid = Process.getCurrentThreadId();
          const main = mainTid();
          if (tid !== main) {
            counts.offMain += 1;
            if (!offMainSaid) { offMainSaid = true; emit({ event: 'thread', tid: tid, mainThread: main, note: 'the update ran off Main\'s thread: no step runs on it' }); }
            return;
          }
          counts.frames += 1;
          lastStepAt = Date.now();
          step();
        } catch (e) { fail('step at ' + run.stage, e); }
      }, 'void', ['pointer', 'float'], 'win64');
      Interceptor.replace(updateAt, updateCallback);
      Interceptor.flush();
      updateReplaced = true;
    } catch (e) { attachErrors.push('PlayerCharacter::Update replace: ' + e); }
  } else attachErrors.push('PlayerCharacter::Update: no slot');

  emit({
    event: 'ready', script: 'body-impose.js', v: '1.1', version: version, pid: Process.id, base: String(exe.base), mainThread: mainTid(),
    worldScale: { inverse187407: scaleInverse, forward188105: scaleForward, ok: scaleOk },
    update: { slot: rva(updateAt), byId40447: rva(at('playerUpdateById')), agree: !isNil(updateAt) && updateAt.equals(at('playerUpdateById')), replaced: updateReplaced },
    hooks: resolved, attachErrors: attachErrors,
    params: { FORM: hex(FORM_ID), PHASES: PHASES, STEPS: STEPS, STEP_MS: STEP_MS, HOLD_MS: HOLD_MS, RELEASE_MS: RELEASE_MS, OBSERVE_MS: OBSERVE_MS, REST_SPEED: REST_SPEED, REST_MS: REST_MS, MOVE_UNITS: MOVE_UNITS, RESET_REFR: RESET_REFR, ROW_EVERY_FRAMES: EVERY, NODES_MAX: NODES_MAX, TTL_S: TTL_S },
  });
  if (!(SCALE > 0)) emit({ event: 'error', where: 'world scale', error: 'GetWorldScaleInverse read ' + scaleInverse + ', GetWorldScale ' + scaleForward + ': not inverses; the first step ends the run' });
  let lastFrames = 0;
  let stallSaid = false;
  setInterval(function () {
    // Frida's own thread: a report, never an engine call
    const quiet = Date.now() - lastStepAt;
    if (run.keyframed && !reverted && quiet > 10000) { if (!stallSaid) { stallSaid = true; emit({ event: 'stalled', stage: run.stage, quietMs: quiet, note: 'the ragdoll is keyframed and no main-thread step ran for 10 s; the restore waits for one' }); } } else stallSaid = false;
    emit({ event: 'liveness', pid: Process.id, stage: run.stage, reverted: reverted, keyframed: !!run.keyframed, counts: JSON.parse(JSON.stringify(counts)), frames10s: counts.frames - lastFrames, mainThread: mainTid(), replacement: String(updateCallback) });
    lastFrames = counts.frames;
  }, 10000);
}
