# RE: the player's Havok contact with a prop on 1.6.1170 (the re-analyst, 15:37 PDT 2026-10-29; for docs/verbs/prop-physics.md, the touch)

Static read: CommonLibSSE-NG headers (bhkCharProxyController.h:11-38, hkpCharacterProxyListener.h:15-28 and :49-52, hkpCharacterProxy.h:41,
:62-65, hkpRootCdPoint.h:16, hkpCollidable.h:54-69, hkpEntity.h:99, hkpMotion.h:60 and :77, TESHavokUtilities.h:15, Offsets.h:524,
bhkCharacterController.h:82 and :145-149, Actor.h:311 and :531, MiddleHighProcessData.h:183, TESRace.h:75, CollisionLayers.h:12 and :18),
Address Library ids by `just addr` (79131 0xed1540 bhkCharProxyController::ContactPointAddedCallback, 78304 0xea1600 the interaction's
impulse body, 26003 0x3fd3d0 TESHavokUtilities::FindCollidableRef, 240560 0x19edff0 the proxy controller's bhkCharacterController vtable,
240580 0x19ee668 the rigid-body controller's, 62646 0xb81ac0 the proxy's integrate, 62648 0xb83580 the surface-interaction pass, 79130
0xed0b40 ProcessConstraintsCallback, 389158 0x202c8b8 the 95.0 mass cap), bodies through Ghidra on the unpacked program.

Findings (HYPOTHESIS until the Frida plan): the player has a bhkCharProxyController (Actor::InitHavok picks the proxy ctor for the
PlayerCharacter instance, for the .data bool 389168 false, or for a race with kAlwaysUseProxyController; NPCs get the rigid-body
controller). hkpCharacterProxy::UpdateManifold walks the proxy's listeners and calls ContactPointAddedCallback (slot 2) for every added
point with NO motion-type filter, so a Keyframed clutter body's contact IS delivered (the engine's own body reacts only to layer 30, other
controllers); ObjectInteractionCallback (slot 5) comes only from the surface-interaction pass (62648), which skips bodies of motion type 4
or 5 and applies the player's impulse itself (scaled: clutter 2.0, props 3.0 under 47.5 mass else 0.1; zero at mass 0 or above 95; it
writes bumpedForce and bumpedBody), so a Keyframed body never fires slot 5 and never takes the push: the stand-in seat swallows the bump by
construction, and the claim must come from the manifold contact. Polling bumpedBody cannot replace the detour (written only for a dynamic
body under 95 mass, sticky, never on the Keyframed seat). From the contact point: rootCollidableB (hkpRootCdPoint), the layer is
collisionFilterInfo & 0x7F, the body is the collidable's owner when its type is 1, the reference by FindCollidableRef. The callback runs
inside the proxy's integrate (62646, from the controller's vtable-1 slot 0x0B); the thread is unknown until traced.

The narrowest hook: a Gum on-enter detour on 79131 (FridaHooks.cpp's Offsets::Hooks shape): filter this+0x10 == the player's controller,
the layer in {{4 clutter, 10 props}}, read the body's motion type at body+0x160 (4 = Keyframed, the non-simulating seat), throttle one
event per formID per 250 ms, then one EventsApi send (a hop to the JS thread if the trace shows a Havok worker). Frida plan: hook 79131
and 78304 on both seats, walk into a basket twice; expected on the simulating seat 79131 once per touch then 78304 every step with
bumpedBody the basket; on the other seat 79131 fires and 78304 stays silent. Falsifiers: no 79131 with a layer-4 collidable while the
basket blocks or moves; 78304 firing for a Keyframed basket; 79131 on a thread where the platform's hooks cannot run.

### notes.md

```
# re-havok-contact: static read 2026-10-29 (Ghidra, SkyrimSE-1.6.1170.0.exe.unpacked.exe; REA down)
All addresses are image-base 0x140000000 + RVA; ids are Address Library 1.6.1170 (AE column), reversed with rev.py over lab/addr.py's loader.

## Controller choice (Q1)
- Actor::InitHavok (TESObjectREFR vtable slot 0x66, Actor.h:311) = FUN_1406645e0, AE 37308: critical section at Actor+0x290, then FUN_14065d590 AE 37171 (creation).
- AE 37171: proxy (bhkCharProxyController, ctor FUN_140ed0700 AE 79128, Cinfo filled by AE 38281) when actor == DAT_143137698 (AE 401069, written by PlayerCharacter ctor/dtor AE 40411/40412, which write VTABLE_PlayerCharacter[0] AE 208040) OR DAT_14202c938 (AE 389168, .data init 1) == 0 OR race->data.flags & kAlwaysUseProxyController (TESRace.h:75; race at Actor AE+0x1F8, data 0xE8, flags +0x20 -> 0x108, byte 0x10b bit0).
  else rigid body (bhkCharRigidBodyController, ctor FUN_140ed2ee0 AE 79183, sizeof 0x5B0 too).
- AIProcess::GetCharController = FUN_14070f5d0 AE 39856 (middleHigh+0x250).

## Vtables
- VTABLE_bhkCharProxyController[0] AE 240558 @0x19edfb8 (hkpCharacterProxyListener sub, this+0): slots 0 dtor 0x140ed28c0 (79161), 1 ProcessConstraints 0x140ed0b40 (79130), 2 ContactPointAdded 0x140ed1540 (79131), 3 ContactPointRemoved 0x140ed15e0 (79132), 4 CharacterInteraction 0x140ed1640 (79134), 5 ObjectInteraction thunk 0x140ed1620 (79133) -> this+0x10 -> FUN_140ea1600 (78304).
- VTABLE_bhkCharProxyController[1] AE 240560 @0x19edff0 (bhkCharacterController sub at +0x10): 20 slots; 0xD CheckSupportImpl 0x140ed2330 -> hkpCharacterProxy::checkSupport AE 62635.
- base hkpCharacterProxyListener VTABLE AE 240549 @0x19edd90: all five stubs differ (overridden).
- VTABLE_bhkCharRigidBodyController[0] AE 240580 @0x19ee668 = bhkCharacterController sub (this+0); [1] AE 240583 @0x19ee710 = hkpCharacterRigidBodyListener sub at +0x330; overrides base (AE 240569 @0x19ee5e8) slots 3 (0x140ed30c0 79185, characterCallback: Havok timer string "TtcharacterCallback" in base 0x140f19950 80567), 4 (0x140ed31a0 79186 processActualPoints-like), 6 (0x140ed3710 79187).
- hkpCharacterProxy VTABLE[0] AE 230859 @0x197b2c0: slot 3 UpdateManifold 0x140b82d00 (62647), slot 4 0x140b83ab0 (62649).

## Havok listener dispatch (hkpCharacterProxy, listeners hkArray at +0xC8/+0xD0)
- 62651 FUN_140b83eb0 fires slot 2 (added), 62652 FUN_140b83f10 slot 3 (removed): both from UpdateManifold 62647, no motion-type filter.
- 62653 FUN_140b83f70 fires slot 1 (ProcessConstraints) from checkSupport 62635, integrateWithCollectors 62646 (FUN_140b81ac0), FUN_140b813f0 62643.
- 62654 FUN_140b83fe0 fires slot 5 (ObjectInteraction); 62655 FUN_140b84050 slot 4; both only from FUN_140b83580 AE 62648 (applySurfaceInteractions), called only from 62646.
- 62648: per manifold point: property 0x1300 on owner -> character interaction; else collidable type(+0x28)==1, body=collidable+ownerOffset(+0x20), SKIP if motionType(body+0x160) in {4 keyframed,5 fixed}; event {pos, normal, objectImpulse, timestep, projectedVelocity, objectMassInv=body+0x22c, body}; clamp by characterStrength (proxy+0xBC) * dt; extra by characterMass (+0xC0); fire slot 5; then FUN_140b2e300(body) (60849, activate?) and motion slot 0x14 ApplyPointImpulse (hkpMotion.h:60), or deferred buffer.

## bhkCharacterController fields touched
- ObjectInteraction body 78304 (this = controller): mass = 1/(motion+0xDC) (FUN_140b327c0 60959); zero impulse if mass<=0 or mass >= DAT_14202c8b8 (AE 389158, .data 95.0f); scale 2.0 default, props(10) 3.0 if mass<=47.5 else 0.1, projectile(6)/trap(14) 0.1; clamp impulse/mass<=1000; flags&kNoFriction -> orientationCtrl(+0x190) slot 5; writes bumpedForce +0x2B8 and bumpedBody +0x2C0 (hkRefPtr) when larger. No reset found (literal "+ 0x2b8) = 0.0;" 0 hits).
- ProcessConstraints 79130 (this = listener sub; controller = this+0x10): manifold loop; layer 4/5/6: dynamic (FUN_140e94a00 78109: type in {1,2,3,6}) and mass < DAT_14202c8b8 -> contact dropped; layer 10 same shape; layer 0x1e -> FUN_140ea13a0 78303 (bumpedCharCollisionObject +0x2C8, pushDelta, pushCount) + bhkCharacterCollisionHandler singleton DAT_1431a5dc0 (AE 404487; vtables AE 208259/208261) slot 1; kCheckSupport|kRecordHits (0x210000) -> FUN_140ea0dc0 78298 (dynamic & mass>=DAT_14328df40 AE 411555, or layer 6) -> FUN_140ea10b0 78302 (hit record map at +0x2D8).
- ContactPointAdded 79131: only layer 0x1e (other char controllers), counter +0x314, group +0x318; ContactPointRemoved 79132 decrements.
- FUN_140ea0560 78286 = SetSupportBody (+0x2B0). FUN_140ea0320 78279 = per-step reset of supportNorm/kTryStep.
- FindCollidableRef = Offsets.h:524 RELOCATION_ID(25466, 26003) -> 0x3fd3d0.

```

### rev.py

```
#!/usr/bin/env python3
"""Reverse map: RVA -> Address Library id(s) for 1.6.1170, via lab/addr.py's loader (rule 1: the database is the source)."""
import sys
sys.path.insert(0, "/Users/eli/Code/mojibake/thuum/lab")
import addr
from pathlib import Path
db = addr.load_for_runtime(Path("/Users/eli/Code/mojibake/thuum/addrlib"), "1.6.1170")
by_off = {}
for i, o in zip(db.ids, db.offsets):
    by_off.setdefault(o, []).append(i)
for a in sys.argv[1:]:
    v = int(a, 16)
    if v >= 0x140000000:
        v -= 0x140000000
    ids = by_off.get(v)
    if ids:
        print(f"{a}\trva 0x{v:x}\tids {ids}")
    else:
        # nearest lower entry (an address inside a function)
        import bisect
        offs = sorted(by_off)
        j = bisect.bisect_right(offs, v) - 1
        lo = offs[j] if j >= 0 else None
        print(f"{a}\trva 0x{v:x}\tNO ID; nearest lower 0x{lo:x} ids {by_off[lo]} (+0x{v-lo:x})" if lo is not None else f"{a}\tNO ID")

```
