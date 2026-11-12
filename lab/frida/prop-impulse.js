// prop-impulse.js v1.2 DRAFT (thuum, 2026-11-12; ADR-071 rung 3's premise reads, lab/.cache/drafts/physics/rung3-plan.md 905bec1d
// section B2 and its four v1.2 changes; Eli's rung 3 decisions at origin/main de8604a1, docs/DECISIONS.md: D-PH5 "Every physics
// body", D-PH6 "Read again, then by cones", D-PH7 "Read it, else a 51 limit"). For x-prop-cone v1 and x-prop-arrow v1
// (lab/.cache/drafts/physics/rung3-reads/, by path). A DRAFT outside lab/frida: lab-api serves scripts from lab/frida on main
// alone, so this file goes to main on its own thuum branch (lab/frida/prop-impulse.js and lab/frida/README.md, nothing else), with
// a fresh review (ADR-064 amendment A), the merge and deploy-srv, before either probe runs. New code, so the review comes before
// its first run. What changed from v1.1 (commit 82cbbb9c, file sha1 9aac2070 at main 00bdc118):
//   1. BACKTRACE (param, default false; x-prop-cone). With REPLACE false (26004 and 26005 attached, so an onEnter's context
//      exists), a 26004 or 26005 call whose innermost bracket on its thread is none, or one of the cone's own, takes
//      Thread.backtrace(this.context, Backtracer.ACCURATE) (frida.re/docs/javascript-api/#thread; Backtracer.FUZZY when ACCURATE
//      throws or gives under 3 frames), each frame printed as module and module-relative offset, with the nearest known function
//      start below it (a vtable slot or an id named here: a label, HYPOTHESIS until Ghidra's function bounds agree), for the
//      first BT_ROWS such calls. DebugSymbol.fromAddress for the same frames runs later on Frida's own thread and prints a
//      'symbols' row keyed by the call's seq, never on the engine's worker thread inside the physics. With BACKTRACE the cone's
//      own UpdateImpl (slot 0xAB, include/RE/C/ConeProjectile.h:38; P/Projectile.h:207) and HandleHits (0xBE, ConeProjectile.h:43;
//      Projectile.h:226) are brackets too, and the cone's own ProcessImpacts (0xAC, ConeProjectile.h:39) is a cone bracket, not a
//      projectile one. Every cone those three slots see enters a native table: its id, base, shooter handle (the projectile's
//      shooter, Projectile.h:254 through the 1.6.629 shift, :291-299) and spell, its first and last tick on GetTickCount64's clock
//      and its enters per slot and on Main, printed as a 'cone' row at its first sight and a 'coneEnd' row once it is a second
//      quiet, so D-PH6's fallback (a push while this seat's own player's cone flies counts as local) is read in the same run.
//   2. ARROW (param, default false; x-prop-arrow). The push candidates CommonLibSSE-NG names, attached in native code (the
//      CModule below): bhkRigidBody::SetLinearVelocity 78089, SetAngularVelocity 78090 and SetAngularImpulse 78092
//      (include/RE/B/bhkRigidBody.h:52-55; src/RE/B/bhkRigidBody.cpp:5-31), and hkpMotion's velocity, impulse and force slots
//      0x10, 0x11 and 0x13 to 0x18 (include/RE/H/hkpMotion.h:56-64) read from the dynamic and keyframed motions' vtables, one
//      attach per distinct address; an address read under two different slots (folded code) or one that begins with ret is
//      skipped and listed. A call crosses into JavaScript only when a bracket is open on its own thread, or when its body is one
//      a projectile-bracketed 26004 named in the last WATCH_MS; its row carries the vector (and point), the body's linear and
//      angular velocity before and after the call (read in C at the enter and the leave, after the body's vtables check), the
//      caller, a stack scan (corpse-lay-heap.js's clStack: the exe's and plugins' return addresses that follow a call
//      instruction) and the innermost bracket with its projectile, that projectile's shooter and its velocity. A 26004 inside a
//      projectile bracket also takes a backtrace when its call has a context (an attach always; a replacement only if Frida
//      gives its NativeCallback one, read as it comes).
//   3. ATTACH_ONLY (param, default false; rung 3's own probes, x-prop-impact and x-prop-blast v4): 26004 and 26005 are not hooked
//      at all (the rung 3 build replaces 26004 in Skyrim Platform's own Gum, and a second Gum on one entry is not safe); 78091
//      alone reads the push, and BACKTRACE then has no call to take.
//   4. The brackets are native (rule 9 for the new hot hooks: HandleHits may run once per collidable per frame). Explosion::Update
//      and every distinct ProcessImpacts (and the cone's slots under BACKTRACE) keep a per-thread stack in a CModule
//      (frida.re/docs/javascript-api/#cmodule; native-frame.js's shape: C listeners that reach JavaScript only through shared
//      memory) and never cross into JavaScript; the readers (26004, 26005, 78091, the candidates) read their thread's innermost
//      frame from it. Explosion::FindTargets stays a JavaScript row (once an explosion). The CModule compiles in two variants,
//      glib's atomic add first, then a plain one; if neither compiles, v1.1's JavaScript brackets run instead and neither the
//      cone's brackets nor the candidates attach (the ready row's native.errors say why).
//   5. The fixes read-x-prop-blast-223256.md section 6 asks for: the watch is keyed by body (the Riverwood Trader sign's seven
//      bodies are seven rows), a sample no longer re-walks the reference's 3D (it read the sign's FIXED anchor), and an island
//      that is its world's fixed island (hkpWorldObject::world +0x10, include/RE/H/hkpWorldObject.h:65; hkpWorld::fixedIsland
//      +0x30, H/hkpWorld.h:97) prints without its members (the cart's 1,710 statics flooded v1.1's watch).
//   6. A kernel32!Sleep pulse (the CModule's counter, native-frame.js's) and the native counters in the liveness row; TTL_S also
//      detaches the native listeners and stops the cone poll.
//   7. 'btSelfTest': with BACKTRACE or ARROW, one accurate backtrace at the first PlayerCharacter::Update on Main, so the
//      backtracer's reach into SkyrimSE.exe is read before any impact; and the ready row's scriptVersion '1.2', so a run against
//      v1.1 (which ignores the new params) is told apart at once.
//
// New ids, by `just addr <id>` (lab/addr.py over addrlib/, runtime 1.6.1170.0, 428461 entries, run 2026-11-12 from the thuum
// checkout; never from memory, CLAUDE.md rule 1):
//   78089  0xe931e0   bhkRigidBody::SetLinearVelocity(this, const hkVector4&), B/bhkRigidBody.h:55, src :26-31 RELOCATION_ID(76259, 78089)
//   78090  0xe932b0   bhkRigidBody::SetAngularVelocity, :53, src :12-17 RELOCATION_ID(76260, 78090)
//   78092  0xe93420   bhkRigidBody::SetAngularImpulse, :52, src :5-10 RELOCATION_ID(76262, 78092)
//   227971 0x196bc98  VTABLE_hkpSphereMotion, include/RE/Offsets_VTABLE.h:5002 (the cabbages and the bucket read motion type 2)
//   227973 0x196bd70  VTABLE_hkpBoxMotion, :5003 (the sign's board read 3)
//   227975 0x196be48  VTABLE_hkpThinBoxMotion, :5004
//   227963 0x196b998  VTABLE_hkpKeyframedRigidMotion, :4998 (its slots 0x13 to 0x15 are `{ return; }`, H/hkpKeyframedRigidMotion.h:27-29)
//   227984 0x196c058  VTABLE_hkpRigidBody, :5006: an entity's own vtable, the C side's check that a wrapper's body is a rigid body
//   190275 0x17aeb58  VTABLE_bhkRigidBody, :654, and 239275 0x19e7a68 VTABLE_bhkRigidBodyT, :5885: the wrapper's vtable check
//   ConeProjectile's vtable 209925 (0x18bf900, v1.1's) gives slots 0xAB and 0xBE; its first qword is the cone check in C.
//   kernel32!GetTickCount64 (an export) is the native clock.
// New layouts (CommonLibSSE-NG b93280e8): hkpMotion linearVelocity +0xE0 and angularVelocity +0xF0 (H/hkpMotion.h:84-85), in Havok
// units; hkpEntity motion +0x150 (H/hkpEntity.h:99); bhkRefObject referencedObject +0x10 (B/bhkRefObject.h:26); Projectile velocity
// (0F0) and linearVelocity (0FC) at +0xF8 and +0x104 under the 1.6.629 shift (P/Projectile.h:249-250, :291-299; HYPOTHESIS, as the
// shooter's +0x128 was until 223256 read sane owners).
// HYPOTHESIS until a run reads as expected (rule 2): that a CModule listener's per-site wrapper and GUM_IC_GET_INVOCATION_DATA hold
// as native-frame.js's did (its CModule compiled on a seat, 20261105-023520); that hkpRigidBody's inline helpers reach the motion
// slots through the vtable (Havok's hkpRigidBody.inl calls them through getRigidMotion(); unread in this exe); that the cone's
// pushes run inside one of its own slots (223256's rows only say they ran outside ProcessImpacts and Explosion::Update, and that
// each cone's 26004, 78091 and its next AddImpact ran back to back on one worker thread, c2:L253-255).
//
// v1.1's header follows, as it stands.
//
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
//
// v1.2 rows and params, beside v1.1's (where v1.2 changes a v1.1 row, its change list above says so):
//   bracket (v1.2): every reader's innermost frame on its own thread, {kind: explosion | impacts | cone, slot, depth, ref, base,
//     owner (the explosion's actorOwner or the projectile's shooter, resolved), enterTick, and for a projectile its velocity and
//     linearVelocity raw and their lengths}; null when no bracket is open; {kind: 'overflow'} past eight; {kind: 'unknown'} when
//     the thread table is full. In native mode no {fn:'bracket'} leave row prints (the readers carry it); {fn:'findTargets'}
//     prints at each Explosion::FindTargets' enter (the explosion, its base, owner and radius).
//   bt on a 26004 or 26005 row: {how, frames: [{m, off, near, plus} | {at}]}; {fn:'symbols', of: <seq>, what, frames: [{at, name,
//     module, file, line}]} later, from DebugSymbol.fromAddress.
//   {fn:'cone'} at a cone's first sight and {fn:'coneEnd'} a second after its last (BACKTRACE): its table entry or entries (two
//     threads seeing a new cone at once may make two, merged by pointer and id), id, base, shooter resolved, spell, first and last
//     tick, lifeMs, enters [UpdateImpl, HandleHits, ProcessImpacts], onMain.
//   {fn:'candidate'} per filtered call (ARROW, the first CAND_ROWS): site (class::slot@rva or the bhk id), slot, seq, tid, main,
//     tick, the body's ref, base, motion type and inverse mass, vector (Havok units, raw) and |vector| raw and times the world scale,
//     point raw and in game units (shapes with a point), lin0 and lin1, ang0 and ang1 (Havok units a second), dLin in Havok and game
//     units, dAng, ret (module, offset, near), scan (frames from the caller's stack), depth, watched, bracket.
//   {fn:'btSelfTest'} once (BACKTRACE or ARROW), then its symbols row.
//   ready (v1.2): scriptVersion '1.2', native {ok, variant, errors, sites [{i, label, kind, rva, bytes}], skipped}, ticks (the
//     native clock at the ready, beside the row's t), the new params.
//   liveness (v1.2): native {threads, lost, open, cones, coneFull, ring, pulse, pulse10s, sites [[label, calls, passed]]} (for a
//     bracket, passed is its enters on Main; for a candidate, the calls that crossed into JavaScript).
// New params: BACKTRACE (false), ARROW (false), ATTACH_ONLY (false), BT_ROWS (64 backtraces), BT_DEPTH (24 frames), SCAN_QWORDS (512),
// CAND_ROWS (200), WATCH_MS (500).
const PARAMS = (typeof LAB_PARAMS === 'object' && LAB_PARAMS) ? LAB_PARAMS : {};
const num = function (v, d) { return (v === undefined || v === null) ? d : Number(v); };
const idList = function (v) {
  return (Array.isArray(v) ? v : []).map(function (x) { return typeof x === 'string' ? parseInt(x, 16) : Number(x); }).filter(function (x) { return x > 0; });
};
const SCRIPT_VERSION = '1.2';
const POLL_MS = num(PARAMS.POLL_MS, 2000);
const EVERY = num(PARAMS.ROW_EVERY_FRAMES, 6);
const ROWS = num(PARAMS.ROWS, 400);
const REPLACE = PARAMS.REPLACE === undefined ? true : !!PARAMS.REPLACE;
const WATCH = idList(PARAMS.WATCH);
const WATCH_MAX = num(PARAMS.WATCH_MAX, 32);
const ISLAND_MAX = num(PARAMS.ISLAND_MAX, 16);
const TTL_S = num(PARAMS.TTL_S, 1800);
const BACKTRACE = !!PARAMS.BACKTRACE;
const ARROW = !!PARAMS.ARROW;
const ATTACH_ONLY = !!PARAMS.ATTACH_ONLY;
const BT_ROWS = num(PARAMS.BT_ROWS, 64);
const BT_DEPTH = num(PARAMS.BT_DEPTH, 24);
const SCAN_QWORDS = num(PARAMS.SCAN_QWORDS, 512);
const CAND_ROWS = num(PARAMS.CAND_ROWS, 200);
const WATCH_MS = num(PARAMS.WATCH_MS, 500);
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
    coneVtable: 0x18bf900, // 209925 VTABLE_ConeProjectile[0] (v1.2: its slots 0xAB and 0xBE, and the cone check)
    setLinearVelocity: 0xe931e0, // 78089 bhkRigidBody::SetLinearVelocity (v1.2)
    setAngularVelocity: 0xe932b0, // 78090 bhkRigidBody::SetAngularVelocity (v1.2)
    setAngularImpulse: 0xe93420, // 78092 bhkRigidBody::SetAngularImpulse (v1.2)
    hkpRigidBodyVtable: 0x196c058, // 227984 VTABLE_hkpRigidBody (v1.2)
    bhkRigidBodyVtable: 0x17aeb58, // 190275 VTABLE_bhkRigidBody (v1.2)
    bhkRigidBodyTVtable: 0x19e7a68, // 239275 VTABLE_bhkRigidBodyT (v1.2)
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
// v1.2: the motions whose slots the candidates read (sphere, box and thin box are the dynamic ones; the keyframed one's impulses are
// no-ops, read only to see whether the engine calls them on a Keyframed copy)
const MOTION_VTABLES = {
  '1.6.1170.0': [
    ['hkpSphereMotion', 0x196bc98], // 227971
    ['hkpBoxMotion', 0x196bd70], // 227973
    ['hkpThinBoxMotion', 0x196be48], // 227975
    ['hkpKeyframedRigidMotion', 0x196b998], // 227963
  ],
};
// hkpMotion's slots (H/hkpMotion.h:56-64) and each one's argument shape for the C side: 0 (this, v), 1 (this, v, point),
// 2 (this, dt, v), 3 (this, dt, v, point); dt is a float in xmm1, so its integer register is never read
const MOTION_SLOTS = [
  [0x10, 'SetLinearVelocity', 0], [0x11, 'SetAngularVelocity', 0], [0x13, 'ApplyLinearImpulse', 0], [0x14, 'ApplyPointImpulse', 1],
  [0x15, 'ApplyAngularImpulse', 0], [0x16, 'ApplyForce', 2], [0x17, 'ApplyForceAtPoint', 3], [0x18, 'ApplyTorque', 2],
];
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
const WORLD_OF = 0x10; // hkpWorldObject::world (v1.2)
const FIXED_ISLAND = 0x30; // hkpWorld::fixedIsland (v1.2)
const HIT = { aggressor: 0x18, target: 0x1c, sourceRef: 0x20, totalDamage: 0x50, pushBack: 0x74, flags: 0x80 };
const EXPLOSION = { owner: 0xf8, radius: 0xb4 };
const PROJECTILE = { shooter: 0x128, explosion: 0x158, spell: 0x160, velocity: 0xf8, linearVelocity: 0x104 };
const SLOT = { update: 0xad, explosionUpdate: 0xa3, findTargets: 0xa4, processImpacts: 0xac, addImpact: 0xbd, updateImpl: 0xab, handleHits: 0xbe };

// v1.2: the CModule's shared memory, PiShared below, laid out by hand on both sides (x64 natural alignment; the sizes are checked
// by the C side's comments and by the ready row's layout field)
const PI_THREADS = 64, PI_DEPTH = 8, PI_CONES = 16, PI_WATCH = 8, PI_SITES = 48, PI_RING = 64;
const PI_KIND = { explosion: 1, impacts: 2, cone: 3, candidate: 0x10 };
const PI_KIND_NAMES = { 1: 'explosion', 2: 'impacts', 3: 'cone' };
const PS = { threads: 0x00, cones: 0x04, open: 0x08, ring: 0x0c, mainTid: 0x10, lost: 0x14, nWatch: 0x18, coneFull: 0x1c, pulse: 0x20,
  motionVt: 0x28, hkpVt: 0x48, bhkVt: 0x50, coneVt: 0x60, w: 0xa0, s: 0x160, t: 0x760, c: 0x4b60, h: 0x4f60, size: 0x7f60 };
const PW = { bhk: 0x00, motion: 0x08, until: 0x10, size: 0x18 };
const PSI = { at: 0x00, kind: 0x08, shape: 0x0c, bhk: 0x10, coneSlot: 0x14, calls: 0x18, passed: 0x1c, size: 0x20 };
const PT = { tid: 0x00, depth: 0x04, overflow: 0x08, f: 0x10, size: 0x110 };
const PF = { self: 0x00, tick: 0x08, site: 0x10, kind: 0x14, handle: 0x18, size: 0x20 };
const PC = { self: 0x00, first: 0x08, last: 0x10, id: 0x18, base: 0x1c, shooter: 0x20, spell: 0x24, enters: 0x28, onMain: 0x38, tid: 0x3c, size: 0x40 };
const PH = { site: 0x00, tid: 0x04, self: 0x08, motion: 0x10, ret: 0x18, rsp: 0x20, tick: 0x28, v: 0x30, p: 0x40, lin0: 0x50, ang0: 0x60,
  lin1: 0x70, ang1: 0x80, top: 0x90, depth: 0xb0, watched: 0xb4, size: 0xc0 };
const PI_C_HEAD = `
#include <gum/guminterceptor.h>

#define PI_THREADS 64
#define PI_DEPTH 8
#define PI_CONES 16
#define PI_WATCH 8
#define PI_SITES 48
#define PI_RING 64

#define PI_KIND_EXPLOSION 1
#define PI_KIND_IMPACTS 2
#define PI_KIND_CONE 3

#define PI_FORM_ID 0x14
#define PI_REFR_BASE 0x40
#define PI_EXPLOSION_OWNER 0xf8
#define PI_PROJECTILE_SHOOTER 0x128
#define PI_PROJECTILE_SPELL 0x160
#define PI_REFERENCED 0x10
#define PI_ENTITY_MOTION 0x150
#define PI_MOTION_LIN 0xe0
#define PI_MOTION_ANG 0xf0

#ifdef PI_ATOMIC
#include <glib.h>
# define PI_ADD(p, v) g_atomic_int_add ((p), (v))
#else
static gint
pi_add_plain (volatile gint * p, gint v)
{
  gint old = *p;
  *p = old + v;
  return old;
}
# define PI_ADD(p, v) pi_add_plain ((p), (v))
#endif

typedef struct _PiFrame PiFrame;
typedef struct _PiThread PiThread;
typedef struct _PiCone PiCone;
typedef struct _PiWatch PiWatch;
typedef struct _PiSite PiSite;
typedef struct _PiHit PiHit;
typedef struct _PiShared PiShared;
typedef struct _PiCall PiCall;

struct _PiFrame
{
  guint64 self;     /* 0x00 the bracket's object, its first argument */
  guint64 tick;     /* 0x08 GetTickCount64 at the enter */
  guint32 site;     /* 0x10 the index into s */
  guint32 kind;     /* 0x14 1 explosion, 2 a projectile's ProcessImpacts, 3 the cone's own slots */
  guint32 handle;   /* 0x18 the explosion's owner or the projectile's shooter, read at the enter */
  guint32 pad;      /* 0x1c */
};                  /* 0x20 */

struct _PiThread
{
  guint32 tid;      /* 0x00 */
  guint32 depth;    /* 0x04 open brackets, counted past PI_DEPTH so the pops stay paired */
  guint32 overflow; /* 0x08 enters past PI_DEPTH */
  guint32 pad;      /* 0x0c */
  PiFrame f[PI_DEPTH]; /* 0x10 */
};                  /* 0x110 */

struct _PiCone
{
  guint64 self;     /* 0x00 written last: a reader keys on it */
  guint64 first;    /* 0x08 */
  guint64 last;     /* 0x10 */
  guint32 id;       /* 0x18 */
  guint32 base;     /* 0x1c */
  guint32 shooter;  /* 0x20 the handle */
  guint32 spell;    /* 0x24 */
  guint32 enters[4]; /* 0x28 UpdateImpl, HandleHits, ProcessImpacts, spare */
  guint32 on_main;  /* 0x38 */
  guint32 tid;      /* 0x3c the last thread */
};                  /* 0x40 */

struct _PiWatch
{
  guint64 bhk;      /* 0x00 the wrapper a 26004 named */
  guint64 motion;   /* 0x08 its body's motion */
  guint64 until;    /* 0x10 GetTickCount64 */
};                  /* 0x18 */

struct _PiSite
{
  guint64 at;       /* 0x00 the hooked function */
  guint32 kind;     /* 0x08 a bracket kind, or 0x10 a candidate */
  guint32 shape;    /* 0x0c a candidate's argument shape */
  guint32 bhk;      /* 0x10 1 when a candidate's this is a bhkRigidBody, 0 an hkpMotion */
  guint32 cone_slot; /* 0x14 */
  guint32 calls;    /* 0x18 every call (a rate: not atomic) */
  guint32 passed;   /* 0x1c a bracket's enters on Main; a candidate's calls that crossed */
};                  /* 0x20 */

struct _PiHit
{
  guint32 site;     /* 0x00 */
  guint32 tid;      /* 0x04 */
  guint64 self;     /* 0x08 */
  guint64 motion;   /* 0x10 */
  guint64 ret;      /* 0x18 the caller's return address */
  guint64 rsp;      /* 0x20 the stack pointer at the enter */
  guint64 tick;     /* 0x28 */
  guint32 v[4];     /* 0x30 the vector argument, raw float bits */
  guint32 p[4];     /* 0x40 the point argument */
  guint32 lin0[4];  /* 0x50 the motion's linear velocity at the enter */
  guint32 ang0[4];  /* 0x60 its angular velocity */
  guint32 lin1[4];  /* 0x70 at the leave */
  guint32 ang1[4];  /* 0x80 */
  PiFrame top;      /* 0x90 this thread's innermost bracket, kind 0 for none */
  guint32 depth;    /* 0xb0 */
  guint32 watched;  /* 0xb4 */
  guint32 pad[2];   /* 0xb8 */
};                  /* 0xc0 */

struct _PiShared
{
  gint threads;          /* 0x00 thread records claimed */
  gint cones;            /* 0x04 cone records claimed */
  gint open;             /* 0x08 threads with a bracket open */
  gint ring;             /* 0x0c the hit ring's next index */
  guint32 main_tid;      /* 0x10 written by JavaScript */
  guint32 lost;          /* 0x14 threads past PI_THREADS */
  guint32 n_watch;       /* 0x18 watch entries written (JavaScript) */
  guint32 cone_full;     /* 0x1c cones past PI_CONES */
  guint64 pulse;         /* 0x20 kernel32!Sleep */
  guint64 motion_vt[4];  /* 0x28 */
  guint64 hkp_vt;        /* 0x48 */
  guint64 bhk_vt[2];     /* 0x50 */
  guint64 cone_vt;       /* 0x60 */
  guint64 pad[7];        /* 0x68 */
  PiWatch w[PI_WATCH];   /* 0xa0 */
  PiSite s[PI_SITES];    /* 0x160 */
  PiThread t[PI_THREADS]; /* 0x760 */
  PiCone c[PI_CONES];    /* 0x4b60 */
  PiHit h[PI_RING];      /* 0x4f60 */
};                       /* 0x7f60 */

struct _PiCall
{
  guint32 pushed;   /* a bracket's enter pushed (or counted) a frame */
  guint32 slot;     /* a candidate's ring slot plus one, 0 for none */
};

extern volatile PiShared pi_shared;
extern guint64 pi_ticks (void);
extern void pi_on_hit (volatile PiHit * hit);

static volatile PiThread *
pi_thread (guint32 tid, gboolean create)
{
  gint n, i;

  n = pi_shared.threads;
  if (n > PI_THREADS)
    n = PI_THREADS;
  for (i = 0; i < n; i++)
  {
    if (pi_shared.t[i].tid == tid)
      return &pi_shared.t[i];
  }
  if (!create)
    return NULL;
  i = PI_ADD (&pi_shared.threads, 1);
  if (i >= PI_THREADS)
  {
    pi_shared.lost++;
    return NULL;
  }
  pi_shared.t[i].depth = 0;
  pi_shared.t[i].overflow = 0;
  pi_shared.t[i].tid = tid;
  return &pi_shared.t[i];
}

/* a cone the cone's own slots see: one record per pointer and id (a freed cone's address taken by the next one reads a new id) */
static void
pi_cone_seen (guint8 * self, guint32 tid, guint32 slot, guint64 now)
{
  gint n, i;
  volatile PiCone * c = NULL;
  guint8 * p;
  guint32 id;

  if (self == NULL || *(volatile guint64 *) self != pi_shared.cone_vt)
    return;
  id = *(volatile guint32 *) (self + PI_FORM_ID);
  n = pi_shared.cones;
  if (n > PI_CONES)
    n = PI_CONES;
  for (i = 0; i < n; i++)
  {
    if (pi_shared.c[i].self == (guint64) (gsize) self && pi_shared.c[i].id == id)
    {
      c = &pi_shared.c[i];
      break;
    }
  }
  if (c == NULL)
  {
    i = PI_ADD (&pi_shared.cones, 1);
    if (i >= PI_CONES)
    {
      pi_shared.cone_full++;
      return;
    }
    c = &pi_shared.c[i];
    c->first = now;
    c->id = id;
    p = *(guint8 * volatile *) (self + PI_REFR_BASE);
    c->base = (p != NULL) ? *(volatile guint32 *) (p + PI_FORM_ID) : 0;
    c->shooter = *(volatile guint32 *) (self + PI_PROJECTILE_SHOOTER);
    p = *(guint8 * volatile *) (self + PI_PROJECTILE_SPELL);
    c->spell = (p != NULL) ? *(volatile guint32 *) (p + PI_FORM_ID) : 0;
    c->self = (guint64) (gsize) self;
  }
  c->last = now;
  c->tid = tid;
  if (slot < 4)
    c->enters[slot]++;
  if (tid == pi_shared.main_tid)
    c->on_main++;
}

/* a bracket's enter: push this thread's frame (its object, the site, the owner's or shooter's handle) */
static void
pi_enter (GumInvocationContext * ic, guint32 site)
{
  PiCall * call;
  guint8 * self;
  guint32 tid, d, kind;
  guint64 now;
  volatile PiThread * t;
  volatile PiFrame * f;

  call = GUM_IC_GET_INVOCATION_DATA (ic, PiCall);
  call->pushed = 0;
  call->slot = 0;
  kind = pi_shared.s[site].kind;
  pi_shared.s[site].calls++;
  tid = (guint32) gum_invocation_context_get_thread_id (ic);
  if (tid == pi_shared.main_tid)
    pi_shared.s[site].passed++;
  self = (guint8 *) gum_invocation_context_get_nth_argument (ic, 0);
  now = pi_ticks ();
  if (kind == PI_KIND_CONE)
    pi_cone_seen (self, tid, pi_shared.s[site].cone_slot, now);
  t = pi_thread (tid, TRUE);
  if (t == NULL)
    return;
  d = t->depth;
  if (d < PI_DEPTH)
  {
    f = &t->f[d];
    f->self = (guint64) (gsize) self;
    f->tick = now;
    f->site = site;
    f->kind = kind;
    if (self == NULL)
      f->handle = 0;
    else if (kind == PI_KIND_EXPLOSION)
      f->handle = *(volatile guint32 *) (self + PI_EXPLOSION_OWNER);
    else
      f->handle = *(volatile guint32 *) (self + PI_PROJECTILE_SHOOTER);
  }
  else
  {
    t->overflow++;
  }
  if (d == 0)
    PI_ADD (&pi_shared.open, 1);
  t->depth = d + 1;
  call->pushed = 1;
}

void
pi_leave (GumInvocationContext * ic)
{
  PiCall * call;
  volatile PiThread * t;
  guint32 d;

  call = GUM_IC_GET_INVOCATION_DATA (ic, PiCall);
  if (call->pushed == 0)
    return;
  t = pi_thread ((guint32) gum_invocation_context_get_thread_id (ic), FALSE);
  if (t == NULL)
    return;
  d = t->depth;
  if (d == 0)
    return;
  t->depth = d - 1;
  if (d == 1)
    PI_ADD (&pi_shared.open, -1);
}

static gboolean
pi_motion_vt (guint64 vt)
{
  guint32 i;

  if (vt == 0)
    return FALSE;
  for (i = 0; i < 4; i++)
  {
    if (pi_shared.motion_vt[i] == vt)
      return TRUE;
  }
  return FALSE;
}

static void
pi_copy4 (volatile guint32 * dst, const guint8 * src)
{
  const volatile guint32 * s = (const volatile guint32 *) src;

  dst[0] = s[0];
  dst[1] = s[1];
  dst[2] = s[2];
  dst[3] = s[3];
}

/* a candidate's enter: a load and a compare while no bracket is open anywhere and no body is watched; otherwise the body's
   vtables are checked before any read through an argument, then the call crosses only inside an open bracket on its own thread
   or on a watched body */
static void
pi_cand_enter (GumInvocationContext * ic, guint32 site)
{
  PiCall * call;
  guint8 * self;
  guint8 * motion = NULL;
  guint8 * hkp;
  guint8 * vec;
  guint8 * pt = NULL;
  guint64 vt, now = 0;
  guint32 tid, depth = 0, k, shape, watched = 0, slot;
  volatile PiThread * t = NULL;
  volatile PiHit * h;

  call = GUM_IC_GET_INVOCATION_DATA (ic, PiCall);
  call->pushed = 0;
  call->slot = 0;
  pi_shared.s[site].calls++;
  if (pi_shared.open == 0 && pi_shared.n_watch == 0)
    return;
  self = (guint8 *) gum_invocation_context_get_nth_argument (ic, 0);
  if (self == NULL)
    return;
  vt = *(volatile guint64 *) self;
  if (pi_shared.s[site].bhk != 0)
  {
    if (vt != pi_shared.bhk_vt[0] && vt != pi_shared.bhk_vt[1])
      return;
    hkp = *(guint8 * volatile *) (self + PI_REFERENCED);
    if (hkp == NULL || *(volatile guint64 *) hkp != pi_shared.hkp_vt)
      return;
    if (!pi_motion_vt (*(volatile guint64 *) (hkp + PI_ENTITY_MOTION)))
      return;
    motion = hkp + PI_ENTITY_MOTION;
  }
  else
  {
    if (!pi_motion_vt (vt))
      return;
    motion = self;
  }
  tid = (guint32) gum_invocation_context_get_thread_id (ic);
  if (pi_shared.open != 0)
  {
    t = pi_thread (tid, FALSE);
    if (t != NULL)
      depth = t->depth;
  }
  if (pi_shared.n_watch != 0)
  {
    for (k = 0; k < PI_WATCH; k++)
    {
      if (pi_shared.w[k].motion == (guint64) (gsize) motion
          || (pi_shared.s[site].bhk != 0 && pi_shared.w[k].bhk == (guint64) (gsize) self))
      {
        if (now == 0)
          now = pi_ticks ();
        if (now <= pi_shared.w[k].until)
        {
          watched = 1;
          break;
        }
      }
    }
  }
  if (depth == 0 && watched == 0)
    return;
  pi_shared.s[site].passed++;
  if (now == 0)
    now = pi_ticks ();
  slot = ((guint32) PI_ADD (&pi_shared.ring, 1)) & (PI_RING - 1);
  h = &pi_shared.h[slot];
  h->site = site;
  h->tid = tid;
  h->self = (guint64) (gsize) self;
  h->motion = (guint64) (gsize) motion;
  h->ret = (guint64) (gsize) gum_invocation_context_get_return_address (ic);
  h->rsp = (guint64) ic->cpu_context->rsp;
  h->tick = now;
  shape = pi_shared.s[site].shape;
  if (shape == 0 || shape == 1)
    vec = (guint8 *) gum_invocation_context_get_nth_argument (ic, 1);
  else
    vec = (guint8 *) gum_invocation_context_get_nth_argument (ic, 2);
  if (shape == 1)
    pt = (guint8 *) gum_invocation_context_get_nth_argument (ic, 2);
  else if (shape == 3)
    pt = (guint8 *) gum_invocation_context_get_nth_argument (ic, 3);
  for (k = 0; k < 4; k++)
  {
    h->v[k] = 0;
    h->p[k] = 0;
    h->lin1[k] = 0;
    h->ang1[k] = 0;
  }
  if (vec != NULL)
    pi_copy4 (h->v, vec);
  if (pt != NULL)
    pi_copy4 (h->p, pt);
  pi_copy4 (h->lin0, motion + PI_MOTION_LIN);
  pi_copy4 (h->ang0, motion + PI_MOTION_ANG);
  if (t != NULL && depth > 0 && depth <= PI_DEPTH)
  {
    h->top.self = t->f[depth - 1].self;
    h->top.tick = t->f[depth - 1].tick;
    h->top.site = t->f[depth - 1].site;
    h->top.kind = t->f[depth - 1].kind;
    h->top.handle = t->f[depth - 1].handle;
  }
  else
  {
    h->top.self = 0;
    h->top.tick = 0;
    h->top.site = 0;
    h->top.kind = 0;
    h->top.handle = 0;
  }
  h->depth = depth;
  h->watched = watched;
  call->slot = slot + 1;
}

void
pi_cand_leave (GumInvocationContext * ic)
{
  PiCall * call;
  volatile PiHit * h;
  guint8 * motion;

  call = GUM_IC_GET_INVOCATION_DATA (ic, PiCall);
  if (call->slot == 0)
    return;
  h = &pi_shared.h[call->slot - 1];
  motion = (guint8 *) (gsize) h->motion;
  if (motion != NULL)
  {
    pi_copy4 (h->lin1, motion + PI_MOTION_LIN);
    pi_copy4 (h->ang1, motion + PI_MOTION_ANG);
  }
  pi_on_hit (h);
}

void
pi_pulse (GumInvocationContext * ic)
{
  pi_shared.pulse++;
}
`;
// the CModule variants, tried in order (corpse-lay-heap.js's idiom): glib's atomic add, then a plain one (a thread or cone record
// two threads claim at once may then be lost; the ready row names the variant that compiled)
const PI_VARIANTS = [
  { name: 'atomic', defs: '#define PI_ATOMIC 1\n' },
  { name: 'plain', defs: '' },
];

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
const r4 = function (x) { return Math.round(x * 10000) / 10000; };
const firstBytes = function (p) {
  try { return Array.from(new Uint8Array(p.readByteArray(8))).map(function (b) { return ('0' + b.toString(16)).slice(-2); }).join(' '); } catch (e) { return 'unreadable'; }
};

const exe = Process.getModuleByName('SkyrimSE.exe');
const version = fileVersion(exe.path);
const off = OFFSETS[version];
if (off === undefined) {
  emit({ event: 'ready', error: 'no offsets for this runtime', version: version, pid: Process.id, scriptVersion: SCRIPT_VERSION });
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

  // v1.2: the native clock (GetTickCount64, ms), shared by the C side's records and the JavaScript rows
  const k32 = Process.getModuleByName('kernel32.dll');
  const ticksAt = k32.getExportByName('GetTickCount64');
  const ticksFn = new NativeFunction(ticksAt, 'uint64', [], { abi: 'win64', scheduling: 'exclusive' });
  const ticks = function () { try { return ticksFn().toNumber(); } catch (e) { return -1; } };

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
  // v1.2: an island that is its world's fixed island is marked, and membersOf never walks it
  const isFixedIsland = function (island, hkp) {
    if (isNil(island) || isNil(hkp)) return false;
    const world = ptrAt(hkp, WORLD_OF);
    if (isNil(world)) return false;
    const fixed = ptrAt(world, FIXED_ISLAND);
    return !isNil(fixed) && fixed.equals(island);
  };
  const islandFacts = function (island, hkp) {
    if (isNil(island)) return null;
    const flags = u8(island, ISLAND.flags);
    return { at: String(island), n: s32(island, ISLAND.size), inActive: flags < 0 ? -1 : flags & 3, activeMark: flags < 0 ? -1 : (flags >> 2) & 3, fixed: isFixedIsland(island, hkp) };
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
      island: islandFacts(ptrAt(hkp, ENTITY.island), hkp),
    };
  };

  // the watch: every body an impulse call named, and every member of their islands; v1.2 keys it by body, never by reference
  const watched = {};
  let pollUntil = 0;
  let windowOpen = false;
  const keyOf = function (hkp) { return 'body@' + String(hkp); };
  const watch = function (hkp, refr, tag) {
    if (isNil(hkp)) return null;
    const id = idOf(refr);
    const k = keyOf(hkp);
    if (watched[k] !== undefined) return watched[k];
    if (Object.keys(watched).length >= WATCH_MAX) return null;
    const w = { key: k, id: id, refr: refr, hkp: hkp, tag: tag, listed: WATCH.indexOf(id) >= 0, lastKey: null, lastFrame: 0, islandKey: null, errors: 0 };
    watched[k] = w;
    emit({ fn: 'watch', ref: hex(id), base: hex(baseOf(refr)), tag: tag, listed: w.listed, body: String(hkp), frame: counts.frames, facts: bodyFacts(hkp) });
    return w;
  };
  const openWindow = function () { pollUntil = Date.now() + POLL_MS; };
  const membersOf = function (island, hkp) {
    const n = s32(island, ISLAND.size);
    if (isFixedIsland(island, hkp)) return { n: n, fixed: true, members: [] };
    const data = ptrAt(island, ISLAND.data);
    const out = [];
    for (let i = 0; i < n && i < ISLAND_MAX && !isNil(data); i++) {
      const e = ptrAt(data, i * 8);
      if (isNil(e)) continue;
      const r = refOfEntity(e);
      out.push({ ref: hex(idOf(r)), type: u8(e, ENTITY.motion + MOTION.type) });
      watch(e, r, 'island');
    }
    return { n: n, fixed: false, members: out };
  };

  // v1.2: where an address lies (module and offset, and in the exe the nearest known start below it), a backtrace, its symbols
  // later on Frida's own thread, and the stack scan for a native-filtered call
  const exeEnd = exe.base.add(exe.size);
  let piModules = null;
  try { piModules = new ModuleMap(); } catch (e) { piModules = null; }
  const piInExe = function (p) { try { return !p.isNull() && p.compare(exe.base) >= 0 && p.compare(exeEnd) < 0; } catch (e) { return false; } };
  const piKnown = []; // [offset in the exe, label], sorted once every site is read
  const piKnowStart = function (p, label) { if (!isNil(p) && piInExe(p)) piKnown.push([p.sub(exe.base).toUInt32(), label]); };
  const piNear = function (o) {
    let lo = 0, hi = piKnown.length - 1, best = -1;
    while (lo <= hi) { const mid = (lo + hi) >> 1; if (piKnown[mid][0] <= o) { best = mid; lo = mid + 1; } else hi = mid - 1; }
    if (best < 0 || o - piKnown[best][0] > 0x4000) return null;
    return { near: piKnown[best][1], plus: hex(o - piKnown[best][0]) };
  };
  const piWhere = function (p) {
    if (isNil(p)) return { at: '0x0' };
    if (piInExe(p)) {
      const o = p.sub(exe.base).toUInt32();
      const out = { m: 'SkyrimSE.exe', off: hex(o) };
      const n = piNear(o);
      if (n !== null) { out.near = n.near; out.plus = n.plus; }
      return out;
    }
    let m = null;
    try { m = piModules !== null ? piModules.find(p) : Process.findModuleByAddress(p); } catch (e) { m = null; }
    if (m === null) return { at: String(p) };
    return { m: m.name, off: hex(p.sub(m.base).toUInt32()) };
  };
  let piBtTaken = 0;
  const piBacktrace = function (ctx) {
    if (ctx === null || ctx === undefined) return { how: 'no context', frames: [], ptrs: [] };
    if (piBtTaken >= BT_ROWS) return { how: 'capped', frames: [], ptrs: [] };
    piBtTaken += 1;
    let ptrs = null, how = 'accurate';
    try { ptrs = Thread.backtrace(ctx, Backtracer.ACCURATE); } catch (e) { ptrs = null; how = 'accurate threw: ' + e; }
    if (ptrs === null || ptrs.length < 3) {
      const was = ptrs === null ? 0 : ptrs.length;
      try {
        ptrs = Thread.backtrace(ctx, Backtracer.FUZZY);
        how = how === 'accurate' ? 'fuzzy (accurate gave ' + was + ' frames)' : how + '; fuzzy';
      } catch (e) { how += '; fuzzy threw: ' + e; if (ptrs === null) ptrs = []; }
    }
    ptrs = ptrs.slice(0, BT_DEPTH);
    return { how: how, frames: ptrs.map(piWhere), ptrs: ptrs };
  };
  const piSymCache = {};
  const piSymQueue = [];
  let piSymScheduled = false;
  const piSymOne = function (p) {
    const k = String(p);
    if (piSymCache[k] !== undefined) return piSymCache[k];
    let out;
    try {
      const s = DebugSymbol.fromAddress(p);
      out = { at: k, name: s.name, module: s.moduleName, file: s.fileName || null, line: s.lineNumber || 0 };
    } catch (e) { out = { at: k, error: String(e) }; }
    piSymCache[k] = out;
    return out;
  };
  const piSymFlush = function () {
    piSymScheduled = false;
    while (piSymQueue.length > 0) {
      const job = piSymQueue.shift();
      try { emit({ fn: 'symbols', of: job.seq, what: job.what, frames: job.ptrs.map(piSymOne) }); } catch (e) { fail('symbols', e); }
    }
  };
  const piSymbolsLater = function (seqOf, what, ptrs) {
    if (!ptrs || ptrs.length === 0) return;
    piSymQueue.push({ seq: seqOf, what: what, ptrs: ptrs });
    if (!piSymScheduled) { piSymScheduled = true; setTimeout(piSymFlush, 0); }
  };
  // corpse-lay-heap.js's clAfterCall and clStack: a qword that lands in the exe or a plugin right after a call instruction
  const piAfterCall = function (q) {
    try {
      const b = new Uint8Array(q.sub(7).readByteArray(7));
      if (b[2] === 0xe8) return true; // call rel32
      for (let k = 0; k < 6; k++) if (b[k] === 0xff && (b[k + 1] & 0x38) === 0x10) return true; // FF /2, any length
      return false;
    } catch (e) { return false; }
  };
  const piScan = function (from) {
    const out = [];
    if (isNil(from)) return out;
    for (let i = 0; i < SCAN_QWORDS && out.length < BT_DEPTH; i++) {
      let q;
      try { q = from.add(i * 8).readPointer(); } catch (e) { break; }
      if (q.isNull()) continue;
      let keep = piInExe(q);
      if (!keep && piModules !== null) {
        const m = piModules.find(q);
        keep = m !== null && m.name.toLowerCase().indexOf('frida') < 0;
      }
      if (keep && piAfterCall(q)) { const w = piWhere(q); w.qword = i; out.push(w); }
    }
    return out;
  };

  // the per-thread nest (an enclosing 26005) and, without the CModule, v1.1's JavaScript brackets
  const nests = {};
  const brackets = {};
  const top = function (table, tid) { const s = table[tid]; return s && s.length > 0 ? s[s.length - 1] : null; };
  const push = function (table, tid, item) { if (!table[tid]) table[tid] = []; table[tid].push(item); };
  const pop = function (table, tid) { const s = table[tid]; if (s && s.length > 0) s.pop(); };
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
    return { fn: fn, id: id, seq: seq, tid: tid, main: tid === mainThread, frame: counts.frames, tick: ticks() };
  };

  // the live first bytes of every site, read before any attach or replacement
  const resolved = {};
  const note = function (name, id, p, mode) { resolved[name] = { id: id, rva: rva(p), at: String(p), mode: mode, bytes: firstBytes(p) }; };
  const hook26004 = !ATTACH_ONLY;
  if (hook26004) {
    note('AddExplosionImpulse', 26005, at('addExplosionImpulse'), REPLACE ? 'replace' : 'attach');
    note('ScaleGameplayImpulseForce', 26004, at('scaleImpulseForce'), REPLACE ? 'replace' : 'attach');
  }
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
  // v1.2: the known starts the frames are labelled by: every projectile vtable's slots 0xA2 to 0xC3, Explosion's 0xA2 to 0xA8, the
  // motions' 0x03 to 0x19, and the ids this header names
  (PROJECTILE_VTABLES[version] || []).forEach(function (pair) {
    for (let s = 0xa2; s <= 0xc3; s++) piKnowStart(ptrAt(exe.base.add(pair[1]), s * Process.pointerSize), pair[0] + ' slot ' + hex(s));
  });
  for (let s = 0xa2; s <= 0xa8; s++) piKnowStart(ptrAt(at('explosionVtable'), s * Process.pointerSize), 'Explosion slot ' + hex(s));
  (MOTION_VTABLES[version] || []).forEach(function (pair) {
    for (let s = 0x03; s <= 0x19; s++) piKnowStart(ptrAt(exe.base.add(pair[1]), s * Process.pointerSize), pair[0] + ' slot ' + hex(s));
  });
  [['addExplosionImpulse', '26005 AddExplosionImpulse'], ['scaleImpulseForce', '26004 ScaleGameplayImpulseForce'], ['setLinearImpulse', '78091 SetLinearImpulse'],
    ['findCollidableRef', '26003 FindCollidableRef'], ['lookupRef', '12332 LookupReferenceByHandle'], ['playerUpdateById', '40447 PlayerCharacter::Update'],
    ['setLinearVelocity', '78089 bhkRigidBody::SetLinearVelocity'], ['setAngularVelocity', '78090 bhkRigidBody::SetAngularVelocity'],
    ['setAngularImpulse', '78092 bhkRigidBody::SetAngularImpulse']].forEach(function (pair) { piKnowStart(at(pair[0]), pair[1]); });
  piKnown.sort(function (x, y) { return x[0] - y[0]; });

  // v1.2: the native sites, brackets first, then the candidates; each gets its own C wrapper (pi_b<i> or pi_c<i>), so no read of
  // the hooked address is needed in C
  const piSites = [];
  const piSkipped = [];
  const piAddSite = function (site) {
    if (piSites.length >= PI_SITES) { piSkipped.push({ label: site.label, why: 'past PI_SITES' }); return; }
    site.i = piSites.length;
    site.bytes = firstBytes(site.at);
    piSites.push(site);
  };
  const explosionUpdate = explosionSlots[0];
  if (!isNil(explosionUpdate.at)) piAddSite({ label: 'Explosion::Update@' + rva(explosionUpdate.at), at: explosionUpdate.at, kind: PI_KIND.explosion, shape: 0, bhk: 0, coneSlot: 0 });
  Object.keys(projectileSites).forEach(function (k) {
    const site = projectileSites[k];
    if (site.slot !== 'ProcessImpacts') return;
    const coneOnly = site.classes.length === 1 && site.classes[0] === 'ConeProjectile';
    piAddSite({ label: 'ProcessImpacts@' + rva(site.at), at: site.at, classes: site.classes, kind: (BACKTRACE && coneOnly) ? PI_KIND.cone : PI_KIND.impacts, shape: 0, bhk: 0, coneSlot: 2 });
  });
  if (BACKTRACE) {
    [['ConeProjectile::UpdateImpl', SLOT.updateImpl, 0], ['ConeProjectile::HandleHits', SLOT.handleHits, 1]].forEach(function (s) {
      const p = ptrAt(at('coneVtable'), s[1] * Process.pointerSize);
      if (isNil(p)) { attachErrors.push(s[0] + ': no slot'); return; }
      piAddSite({ label: s[0] + '@' + rva(p), at: p, kind: PI_KIND.cone, shape: 0, bhk: 0, coneSlot: s[2] });
    });
  }
  if (ARROW) {
    [['setLinearVelocity', '78089 bhkRigidBody::SetLinearVelocity'], ['setAngularVelocity', '78090 bhkRigidBody::SetAngularVelocity'],
      ['setAngularImpulse', '78092 bhkRigidBody::SetAngularImpulse']].forEach(function (pair) {
      piAddSite({ label: pair[1] + '@' + rva(at(pair[0])), at: at(pair[0]), kind: PI_KIND.candidate, shape: 0, bhk: 1, coneSlot: 0, slot: 'bhk' });
    });
    const byAddress = {};
    (MOTION_VTABLES[version] || []).forEach(function (pair) {
      MOTION_SLOTS.forEach(function (ms) {
        const p = ptrAt(exe.base.add(pair[1]), ms[0] * Process.pointerSize);
        if (isNil(p)) return;
        const k = String(p);
        if (byAddress[k] === undefined) byAddress[k] = { at: p, slots: {}, classes: [] };
        byAddress[k].slots[ms[0]] = ms;
        byAddress[k].classes.push(pair[0] + '::' + ms[1]);
      });
    });
    Object.keys(byAddress).forEach(function (k) {
      const a = byAddress[k];
      const slots = Object.keys(a.slots);
      const label = a.classes[0] + '@' + rva(a.at);
      if (slots.length > 1) { piSkipped.push({ label: label, why: 'one address under slots ' + slots.map(function (x) { return hex(Number(x)); }).join(', '), classes: a.classes }); return; }
      const bytes = firstBytes(a.at);
      if (bytes.indexOf('c3') === 0 || bytes.indexOf('c2') === 0) { piSkipped.push({ label: label, why: 'begins with ret: ' + bytes, classes: a.classes }); return; }
      const ms = a.slots[slots[0]];
      piAddSite({ label: label, at: a.at, classes: a.classes, kind: PI_KIND.candidate, shape: ms[2], bhk: 0, coneSlot: 0, slot: hex(ms[0]) });
    });
  }

  // v1.2: the CModule, its memory and its callback (the callback's body runs only once the readers below exist)
  const piShared = Memory.alloc(PS.size); // kept for the script's life: the C side writes into it
  piShared.writeByteArray(new ArrayBuffer(PS.size));
  const piHits = { rows: 0, capped: 0 };
  let piCandidateRow = null; // set below; the C side's hits before then are counted and dropped
  const piOnHit = new NativeCallback(function (h) {
    try { if (piCandidateRow === null) { piHits.capped += 1; return; } piCandidateRow(h); } catch (e) { fail('candidate row', e); }
  }, 'void', ['pointer'], 'win64');
  piShared.add(PS.mainTid).writeU32(mainThread >>> 0);
  (MOTION_VTABLES[version] || []).forEach(function (pair, i) { piShared.add(PS.motionVt + i * 8).writePointer(exe.base.add(pair[1])); });
  piShared.add(PS.hkpVt).writePointer(at('hkpRigidBodyVtable'));
  piShared.add(PS.bhkVt).writePointer(at('bhkRigidBodyVtable'));
  piShared.add(PS.bhkVt + 8).writePointer(at('bhkRigidBodyTVtable'));
  piShared.add(PS.coneVt).writePointer(at('coneVtable'));
  piSites.forEach(function (s) {
    const e = piShared.add(PS.s + s.i * PSI.size);
    e.add(PSI.at).writePointer(s.at);
    e.add(PSI.kind).writeU32(s.kind);
    e.add(PSI.shape).writeU32(s.shape);
    e.add(PSI.bhk).writeU32(s.bhk);
    e.add(PSI.coneSlot).writeU32(s.coneSlot);
  });
  const piSource = PI_C_HEAD + piSites.map(function (s) {
    return s.kind === PI_KIND.candidate
      ? 'void\npi_c' + s.i + ' (GumInvocationContext * ic)\n{\n  pi_cand_enter (ic, ' + s.i + ');\n}\n'
      : 'void\npi_b' + s.i + ' (GumInvocationContext * ic)\n{\n  pi_enter (ic, ' + s.i + ');\n}\n';
  }).join('');
  let piCm = null, piVariant = null;
  const piErrors = [];
  for (const v of PI_VARIANTS) {
    try { piCm = new CModule(v.defs + piSource, { pi_shared: piShared, pi_ticks: ticksAt, pi_on_hit: piOnHit }); piVariant = v.name; break; } catch (e) { piErrors.push(v.name + ': ' + String(e).slice(0, 400)); }
  }
  const piNative = piCm !== null;
  const piListeners = [];
  const hooks = { replaced: [], attached: [] };
  if (piNative) {
    piSites.forEach(function (s) {
      try {
        const callbacks = s.kind === PI_KIND.candidate ? { onEnter: piCm['pi_c' + s.i], onLeave: piCm.pi_cand_leave } : { onEnter: piCm['pi_b' + s.i], onLeave: piCm.pi_leave };
        piListeners.push(Interceptor.attach(s.at, callbacks));
        hooks.attached.push(s.label);
      } catch (e) { attachErrors.push(s.label + ' (native): ' + e); }
    });
    try { piListeners.push(Interceptor.attach(k32.getExportByName('Sleep'), { onEnter: piCm.pi_pulse })); } catch (e) { attachErrors.push('Sleep (native): ' + e); }
  }
  // this thread's record in the C side's table, by a scan (the readers run on the hooked thread itself)
  const piThreadRecord = function (tid) {
    const n = Math.min(piShared.add(PS.threads).readS32(), PI_THREADS);
    for (let i = 0; i < n; i++) {
      const t = piShared.add(PS.t + i * PT.size);
      if (t.add(PT.tid).readU32() === (tid >>> 0)) return t;
    }
    return null;
  };
  const piProjectileVelocity = function (p) {
    const v = v3(p, PROJECTILE.velocity, 1);
    const lv = v3(p, PROJECTILE.linearVelocity, 1);
    return { velocity: v, speed: len3(v), linearVelocity: lv, linearSpeed: len3(lv) };
  };
  // the innermost bracket on a thread, native or v1.1's JavaScript stack, one shape for every reader
  const piFrameSummary = function (kind, siteIndex, self, handle, depth, enterTick) {
    const site = piSites[siteIndex];
    const out = { kind: PI_KIND_NAMES[kind] || ('kind ' + kind), slot: site ? site.label : 'site ' + siteIndex, depth: depth, ref: hex(idOf(self)), base: hex(baseOf(self)), owner: resolveHandle(handle), enterTick: enterTick };
    if (site && site.classes) out.classes = site.classes;
    if (kind === PI_KIND.impacts || kind === PI_KIND.cone) out.projectile = piProjectileVelocity(self);
    return out;
  };
  const piInnermost = function (tid) {
    if (!piNative) {
      const b = top(brackets, tid);
      if (b === null) return null;
      b.impulses += 1;
      return { kind: b.kind === 'explosion' ? 'explosion' : 'impacts', slot: b.slot, seq: b.seq, ref: b.ref, base: b.base, owner: b.owner, js: true };
    }
    const t = piThreadRecord(tid);
    if (t === null) return piShared.add(PS.threads).readS32() > PI_THREADS ? { kind: 'unknown', note: 'the thread table is full' } : null;
    const depth = t.add(PT.depth).readU32();
    if (depth === 0) return null;
    if (depth > PI_DEPTH) return { kind: 'overflow', depth: depth };
    const f = t.add(PT.f + (depth - 1) * PF.size);
    return piFrameSummary(f.add(PF.kind).readU32(), f.add(PF.site).readU32(), f.add(PF.self).readPointer(), f.add(PF.handle).readU32(), depth, f.add(PF.tick).readU64().toNumber());
  };
  // ARROW: a projectile-bracketed 26004's body, watched in C for WATCH_MS (round robin over PI_WATCH; the until is written last)
  let piWatchNext = 0;
  const piWatchBody = function (bhk) {
    if (!piNative || isNil(bhk)) return;
    const hkp = ptrAt(bhk, REFERENCED);
    const k = piWatchNext % PI_WATCH;
    piWatchNext += 1;
    const w = piShared.add(PS.w + k * PW.size);
    w.add(PW.until).writeU64(0);
    w.add(PW.bhk).writePointer(bhk);
    w.add(PW.motion).writePointer(isNil(hkp) ? NULL : hkp.add(ENTITY.motion));
    w.add(PW.until).writeU64(ticks() + WATCH_MS);
    piShared.add(PS.nWatch).writeU32(Math.min(piWatchNext, PI_WATCH));
  };
  const piWantsBacktrace = function (row) {
    const k = row.bracket === null ? 'none' : row.bracket.kind;
    if (BACKTRACE && (k === 'none' || k === 'cone')) return true;
    return ARROW && k === 'impacts';
  };
  const piBacktraceInto = function (row, ctx) {
    if (!piWantsBacktrace(row)) return;
    const bt = piBacktrace(ctx);
    row.bt = { how: bt.how, frames: bt.frames };
    piSymbolsLater(row.seq, row.fn, bt.ptrs);
  };

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
    row.bracket = piInnermost(tid);
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
    row.bracket = piInnermost(tid);
    row.body = bodyFacts(hkp);
    if (ARROW && row.bracket !== null && row.bracket.kind === 'impacts') { piWatchBody(bhk); row.watchedMs = WATCH_MS; }
    watch(hkp, refr, 'impulse');
    openWindow();
    return row;
  };
  // v1.1: the originals are called with exceptions 'propagate' (apply-on-demand.js:831): no exceptor scope around the engine's own
  // code, so a fault there is the engine's as without Frida; the JS around it is caught. Each NativeCallback is held here, read by the
  // liveness row, so it outlives its revert (Interceptor keeps a replacement until the revert; a call still in flight then returns
  // through it)
  const replacements = { 26005: null, 26004: null };
  let reverted = false;
  // v1.2: a replacement's context, when Frida gives its NativeCallback one; read as it comes, never assumed
  const contextOf = function (self) { try { return (self !== undefined && self !== null && self.context) ? self.context : null; } catch (e) { return null; } };
  if (hook26004 && REPLACE) {
    try {
      const sig = ['pointer', 'pointer', 'float', 'pointer'];
      const original = new NativeFunction(at('addExplosionImpulse'), 'void', sig, { abi: 'win64', exceptions: 'propagate' });
      replacements[26005] = new NativeCallback(function (obj3D, pos, force, hit) {
        const tid = Process.getCurrentThreadId();
        let row = null;
        try { counts.AddExplosionImpulse = (counts.AddExplosionImpulse || 0) + 1; row = explosionRow(obj3D, pos, force, hit, tid); piBacktraceInto(row, contextOf(this)); push(nests, tid, row); } catch (e) { fail('26005 enter', e); }
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
        try { counts.ScaleGameplayImpulseForce = (counts.ScaleGameplayImpulseForce || 0) + 1; row = scaleRow(input, bhk, factorMass, tid); piBacktraceInto(row, contextOf(this)); } catch (e) { fail('26004 enter', e); }
        const result = original(input, bhk, factorMass);
        try { if (row !== null) { row.result = r2(result); emitCapped(row); } } catch (e) { fail('26004 leave', e); }
        return result;
      }, 'float', sig, 'win64');
      Interceptor.replace(at('scaleImpulseForce'), replacements[26004]);
      hooks.replaced.push(26004);
    } catch (e) { attachErrors.push('26004 replace: ' + e); }
  }
  // the attach fallback (and REPLACE false): no float can be read (the force and the result print null); BACKTRACE reads this one
  if (hook26004 && hooks.replaced.indexOf(26005) < 0) {
    try {
      Interceptor.attach(at('addExplosionImpulse'), {
        onEnter(args) {
          counts.AddExplosionImpulse = (counts.AddExplosionImpulse || 0) + 1;
          try { this.row = explosionRow(args[0], args[1], null, args[3], this.threadId); piBacktraceInto(this.row, this.context); push(nests, this.threadId, this.row); } catch (e) { fail('26005 attach enter', e); }
        },
        onLeave() { try { if (this.row) { pop(nests, this.threadId); finishExplosion(this.row); } } catch (e) { fail('26005 attach leave', e); } },
      });
      hooks.attached.push(26005);
    } catch (e) { attachErrors.push('26005 attach: ' + e); }
  }
  if (hook26004 && hooks.replaced.indexOf(26004) < 0) {
    try {
      Interceptor.attach(at('scaleImpulseForce'), {
        onEnter(args) {
          counts.ScaleGameplayImpulseForce = (counts.ScaleGameplayImpulseForce || 0) + 1;
          try { const row = scaleRow(null, args[1], args[2].toUInt32() & 0xff, this.threadId); row.result = null; piBacktraceInto(row, this.context); emitCapped(row); } catch (e) { fail('26004 attach', e); }
        },
      });
      hooks.attached.push(26004);
    } catch (e) { attachErrors.push('26004 attach: ' + e); }
  }
  if (hooks.replaced.length > 0) {
    // the replacements' life: reverted from Frida's own thread after TTL_S (outside every engine frame of ours)
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
          row.bracket = piInnermost(this.threadId);
          row.ret = piWhere(this.returnAddress);
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

  // the brackets: native above; without the CModule, v1.1's JavaScript stack per thread; FindTargets a JavaScript row either way
  explosionSlots.forEach(function (s) {
    if (isNil(s.at)) { attachErrors.push(s.name + ': no slot'); return; }
    if (piNative && s.slot === SLOT.explosionUpdate) return;
    try {
      Interceptor.attach(s.at, {
        onEnter(args) {
          counts[s.name] = (counts[s.name] || 0) + 1;
          try {
            seq += 1;
            const e = args[0];
            if (piNative) { emitCapped({ fn: 'findTargets', seq: seq, tid: this.threadId, main: this.threadId === mainThread, frame: counts.frames, tick: ticks(), ref: hex(idOf(e)), base: hex(baseOf(e)), owner: resolveHandle(u32(e, EXPLOSION.owner)), radius: r2(f32(e, EXPLOSION.radius)) }); return; }
            push(brackets, this.threadId, { kind: 'explosion', slot: s.name, seq: seq, ref: hex(idOf(e)), base: hex(baseOf(e)), owner: resolveHandle(u32(e, EXPLOSION.owner)), radius: r2(f32(e, EXPLOSION.radius)), impulses: 0, frame: counts.frames });
          } catch (err) { fail(s.name + ' enter', err); }
        },
        onLeave() {
          if (piNative) return;
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
        if (piNative) return;
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
                fn: 'AddImpact', seq: seq, tid: this.threadId, main: this.threadId === mainThread, frame: counts.frames, tick: ticks(), classes: site.classes,
                projectile: hex(idOf(p)), base: hex(baseOf(p)), shooter: resolveHandle(u32(p, PROJECTILE.shooter)),
                spell: hex(idOf(ptrAt(p, PROJECTILE.spell))), explosion: hex(idOf(ptrAt(p, PROJECTILE.explosion))),
                target: hex(idOf(target)), targetBase: hex(baseOf(target)), collidableRef: hex(idOf(collRef)), layer: fi < 0 ? -1 : fi & 0x7f,
                point: [r2(f32(args[2], 0)), r2(f32(args[2], 4)), r2(f32(args[2], 8))], velocity: [r2(f32(args[3], 0)), r2(f32(args[3], 4)), r2(f32(args[3], 8))],
                bracket: piInnermost(this.threadId),
              });
              if (!isNil(target)) { const b = bodyOfRefr(target); if (!isNil(b)) { watch(b, target, 'impact'); openWindow(); } }
            } catch (err) { fail(label, err); }
          },
        });
      }
      hooks.attached.push(label);
    } catch (e) { attachErrors.push(label + ': ' + e); }
  });

  // v1.2: a native-filtered candidate's row, from its hit record (on the hooked thread, inside the C listener's leave, so the stack
  // above the caller's frame is the live one)
  const f4 = function (p, o) { return [f32(p, o), f32(p, o + 4), f32(p, o + 8), f32(p, o + 12)]; };
  const sub3 = function (a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; };
  const raw3 = function (v) { return [r4(v[0]), r4(v[1]), r4(v[2])]; };
  const game3 = function (v) { return [r2(v[0] * SCALE), r2(v[1] * SCALE), r2(v[2] * SCALE)]; };
  const mag3 = function (v) { return Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]); };
  piCandidateRow = function (h) {
    counts.candidates = (counts.candidates || 0) + 1;
    if (piHits.rows >= CAND_ROWS) { piHits.capped += 1; return; }
    piHits.rows += 1;
    const site = piSites[h.add(PH.site).readU32()];
    const tid = h.add(PH.tid).readU32();
    const motion = h.add(PH.motion).readPointer();
    const entity = isNil(motion) ? NULL : motion.sub(ENTITY.motion);
    const refr = refOfEntity(entity);
    const v = f4(h, PH.v), p = f4(h, PH.p), lin0 = f4(h, PH.lin0), lin1 = f4(h, PH.lin1), ang0 = f4(h, PH.ang0), ang1 = f4(h, PH.ang1);
    const dLin = sub3(lin1, lin0);
    const hasPoint = site !== undefined && (site.shape === 1 || site.shape === 3);
    const topKind = h.add(PH.top + PF.kind).readU32();
    seq += 1;
    const row = {
      fn: 'candidate', site: site ? site.label : 'site ?', slot: site ? site.slot : null, seq: seq, tid: tid, main: tid === mainThread, frame: counts.frames, tick: h.add(PH.tick).readU64().toNumber(),
      ref: hex(idOf(refr)), base: hex(baseOf(refr)), motionType: u8(motion, MOTION.type), massInv: r4(f32(motion, MOTION.massInv)), units: 'havok',
      vector: raw3(v), vectorLength: r4(mag3(v)), vectorLengthTimesScale: r2(mag3(v) * SCALE),
      point: hasPoint ? raw3(p) : null, pointGame: hasPoint ? game3(p) : null,
      lin0: raw3(lin0), lin1: raw3(lin1), dLin: raw3(dLin), dLinLength: r4(mag3(dLin)), dLinGame: game3(dLin), dLinGameLength: r2(mag3(dLin) * SCALE),
      ang0: raw3(ang0), ang1: raw3(ang1), dAng: raw3(sub3(ang1, ang0)),
      ret: piWhere(h.add(PH.ret).readPointer()), scan: piScan(h.add(PH.rsp).readPointer().add(8)),
      depth: h.add(PH.depth).readU32(), watched: h.add(PH.watched).readU32() === 1,
      bracket: topKind === 0 ? null : piFrameSummary(topKind, h.add(PH.top + PF.site).readU32(), h.add(PH.top + PF.self).readPointer(), h.add(PH.top + PF.handle).readU32(), h.add(PH.depth).readU32(), h.add(PH.top + PF.tick).readU64().toNumber()),
    };
    emit(row);
  };

  // v1.2 (BACKTRACE): the cone table, read from Frida's own thread every 250 ms; duplicates by pointer and id merged
  const piCones = {};
  let piConePoll = null;
  if (piNative && BACKTRACE) {
    piConePoll = setInterval(function () {
      try {
        const n = Math.min(piShared.add(PS.cones).readS32(), PI_CONES);
        const now = ticks();
        for (let i = 0; i < n; i++) {
          const c = piShared.add(PS.c + i * PC.size);
          const self = c.add(PC.self).readPointer();
          if (self.isNull()) continue;
          const id = c.add(PC.id).readU32();
          const key = String(self) + '/' + hex(id);
          let e = piCones[key];
          if (e === undefined) {
            e = piCones[key] = { entries: [], ended: false };
            emit({ fn: 'cone', key: key, entry: i, id: hex(id), base: hex(c.add(PC.base).readU32()), shooter: resolveHandle(c.add(PC.shooter).readU32()), spell: hex(c.add(PC.spell).readU32()), first: c.add(PC.first).readU64().toNumber(), tid: c.add(PC.tid).readU32(), tickNow: now });
          }
          if (e.entries.indexOf(i) < 0) e.entries.push(i);
        }
        Object.keys(piCones).forEach(function (key) {
          const e = piCones[key];
          if (e.ended) return;
          let first = Infinity, last = 0, onMain = 0, id = 0, shooter = 0;
          const enters = [0, 0, 0];
          e.entries.forEach(function (i) {
            const c = piShared.add(PS.c + i * PC.size);
            first = Math.min(first, c.add(PC.first).readU64().toNumber());
            last = Math.max(last, c.add(PC.last).readU64().toNumber());
            for (let s = 0; s < 3; s++) enters[s] += c.add(PC.enters + s * 4).readU32();
            onMain += c.add(PC.onMain).readU32();
            id = c.add(PC.id).readU32();
            shooter = c.add(PC.shooter).readU32();
          });
          if (now - last < 1000) return;
          e.ended = true;
          emit({ fn: 'coneEnd', key: key, entries: e.entries, id: hex(id), shooter: resolveHandle(shooter), first: first, last: last, lifeMs: last - first, enters: { updateImpl: enters[0], handleHits: enters[1], processImpacts: enters[2] }, onMain: onMain });
        });
      } catch (err) { fail('cone poll', err); }
    }, 250);
  }

  // the sampler, once a game frame, inside the player's own update (an attach: the reads are memory, FindCollidableRef the one call)
  let sampleMaxMs = 0;
  let updateThread = null;
  let selfTested = !(BACKTRACE || ARROW);
  const closeWindow = function () {
    windowOpen = false;
    emit({ fn: 'window', frame: counts.frames, watched: Object.keys(watched).length });
    Object.keys(watched).forEach(function (k) {
      const w = watched[k];
      emit({ fn: 'body', ref: w.key, id: hex(w.id), tag: w.tag, listed: w.listed, frame: counts.frames, final: true, facts: bodyFacts(w.hkp) });
    });
  };
  const sample = function () {
    const now = Date.now();
    if (now > pollUntil) { if (windowOpen) closeWindow(); return; }
    windowOpen = true;
    Object.keys(watched).forEach(function (k) {
      const w = watched[k];
      if (w.gone) return;
      // v1.2: the body is the one the impulse named; the reference is only checked to still read its id (no re-walk)
      if (!isNil(w.refr) && w.id > 0 && idOf(w.refr) !== w.id) { w.gone = true; emit({ fn: 'body', ref: w.key, id: hex(w.id), frame: counts.frames, gone: 'the reference no longer reads its id' }); return; }
      const f = bodyFacts(w.hkp);
      if (f === null || f.type < 0 || f.type > 7) { w.errors += 1; if (w.errors === 5) emit({ fn: 'body', ref: w.key, id: hex(w.id), frame: counts.frames, gone: 'five unreadable samples' }); if (w.errors >= 5) w.gone = true; return; }
      w.errors = 0;
      const band = !scaleOk ? -1 : (f.speed < 1 ? 0 : (f.speed < 50 ? 1 : 2)); // game units a second; -1 with no scale
      const isl = f.island === null ? 'none' : f.island.at + '/' + f.island.n;
      const key = [f.type, band, isl, f.island === null ? -1 : f.island.inActive, f.frames[0] >= 5 ? 1 : 0].join('|');
      if (key !== w.lastKey || (band !== 0 && counts.frames - w.lastFrame >= EVERY)) {
        w.lastKey = key;
        w.lastFrame = counts.frames;
        emit({ fn: 'body', ref: w.key, id: hex(w.id), tag: w.tag, listed: w.listed, frame: counts.frames, facts: f });
      }
      if (isl !== w.islandKey) {
        w.islandKey = isl;
        const island = ptrAt(w.hkp, ENTITY.island);
        emit({ fn: 'island', ref: w.key, id: hex(w.id), frame: counts.frames, island: f.island, members: isNil(island) ? null : membersOf(island, w.hkp) });
      }
    });
  };
  if (!isNil(updateAt)) {
    try {
      Interceptor.attach(updateAt, {
        onEnter() {
          counts.frames += 1;
          if (updateThread === null) { updateThread = this.threadId; emit({ fn: 'updateThread', tid: updateThread, main: updateThread === mainThread }); }
          if (!selfTested) {
            selfTested = true;
            try { seq += 1; const bt = piBacktrace(this.context); emit({ fn: 'btSelfTest', seq: seq, tid: this.threadId, main: this.threadId === mainThread, how: bt.how, frames: bt.frames }); piSymbolsLater(seq, 'btSelfTest', bt.ptrs); } catch (e) { fail('btSelfTest', e); }
          }
          const t0 = Date.now();
          try { sample(); } catch (e) { fail('sample', e); }
          const dt = Date.now() - t0;
          if (dt > sampleMaxMs) sampleMaxMs = dt;
        },
      });
      hooks.attached.push('PlayerCharacter::Update');
    } catch (e) { attachErrors.push('PlayerCharacter::Update: ' + e); }
  } else attachErrors.push('PlayerCharacter::Update: no slot');

  // v1.2: the native counters for the ready and liveness rows
  const piNativeCounts = function () {
    if (!piNative) return null;
    return {
      threads: piShared.add(PS.threads).readS32(), lost: piShared.add(PS.lost).readU32(), open: piShared.add(PS.open).readS32(),
      cones: piShared.add(PS.cones).readS32(), coneFull: piShared.add(PS.coneFull).readU32(), ring: piShared.add(PS.ring).readS32(),
      pulse: piShared.add(PS.pulse).readU64().toNumber(),
      sites: piSites.map(function (s) { const e = piShared.add(PS.s + s.i * PSI.size); return [s.label, e.add(PSI.calls).readU32(), e.add(PSI.passed).readU32()]; }),
      hits: { rows: piHits.rows, capped: piHits.capped },
    };
  };
  emit({
    event: 'ready', script: 'prop-impulse.js', scriptVersion: SCRIPT_VERSION, version: version, pid: Process.id, base: String(exe.base), mainThread: mainThread, ticks: ticks(),
    worldScale: { inverse187407: scaleInverse, forward188105: scaleForward, ok: scaleOk, units: UNITS }, update: { slot: rva(updateAt), byId40447: rva(at('playerUpdateById')), agree: !isNil(updateAt) && updateAt.equals(at('playerUpdateById')) },
    hooks: resolved, replaced: hooks.replaced, attached: hooks.attached,
    native: { ok: piNative, variant: piVariant, errors: piErrors, layout: { shared: hex(PS.size), thread: hex(PT.size), hit: hex(PH.size) }, sites: piSites.map(function (s) { return { i: s.i, label: s.label, kind: s.kind, shape: s.shape, bhk: s.bhk, coneSlot: s.coneSlot, rva: rva(s.at), bytes: s.bytes, classes: s.classes || null }; }), skipped: piSkipped },
    params: { POLL_MS: POLL_MS, ROW_EVERY_FRAMES: EVERY, ROWS: ROWS, REPLACE: REPLACE, WATCH: WATCH.map(hex), WATCH_MAX: WATCH_MAX, ISLAND_MAX: ISLAND_MAX, TTL_S: TTL_S, BACKTRACE: BACKTRACE, ARROW: ARROW, ATTACH_ONLY: ATTACH_ONLY, BT_ROWS: BT_ROWS, BT_DEPTH: BT_DEPTH, SCAN_QWORDS: SCAN_QWORDS, CAND_ROWS: CAND_ROWS, WATCH_MS: WATCH_MS },
    attachErrors: attachErrors,
  });
  // v1.2: dbghelp warmed on Frida's own thread after the ready (its first symbol lookup loads the modules' symbol state), so no
  // engine thread pays it at a push
  if (BACKTRACE || ARROW) setTimeout(function () { try { piSymOne(exe.base.add(0x1000)); } catch (e) { fail('symbols warm', e); } }, 0);
  let lastFrames = 0;
  let lastPulse = 0;
  setInterval(function () {
    mainThread = mainTid();
    if (piNative) { try { piShared.add(PS.mainTid).writeU32(mainThread >>> 0); } catch (e) { fail('main tid', e); } }
    const nat = piNativeCounts();
    if (nat !== null) { nat.pulse10s = nat.pulse - lastPulse; lastPulse = nat.pulse; }
    emit({ event: 'liveness', pid: Process.id, counts: JSON.parse(JSON.stringify(counts)), capped: JSON.parse(JSON.stringify(capped)), frames10s: counts.frames - lastFrames, sampleMaxMs: sampleMaxMs, watched: Object.keys(watched).length, mainThread: mainThread, backtraces: piBtTaken, native: nat, replacements: { 26005: String(replacements[26005]), 26004: String(replacements[26004]), reverted: reverted } });
    lastFrames = counts.frames;
    sampleMaxMs = 0;
  }, 10000);
  // v1.2: the native listeners' life, TTL_S as the replacements'; the CModule, its memory and the callback stay referenced (a thread
  // still inside a listener finds them)
  if (piListeners.length > 0) {
    setTimeout(function () {
      let n = 0;
      piListeners.forEach(function (l) { try { l.detach(); n += 1; } catch (e) { fail('native detach', e); } });
      try { Interceptor.flush(); } catch (e) { fail('native flush', e); }
      if (piConePoll !== null) clearInterval(piConePoll);
      emit({ event: 'nativeDetached', listeners: n, ttl_s: TTL_S, frame: counts.frames, cm: String(piCm), shared: String(piShared), callback: String(piOnHit) });
    }, TTL_S * 1000);
  }
}
