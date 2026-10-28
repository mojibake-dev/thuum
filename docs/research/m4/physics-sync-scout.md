# Physics sync scout: how an arc that syncs most or all physics objects would go (2026-10-27)

Status: D43 "the physics-sync arc", PROPOSED, for Eli to read later; binds nothing (D42, docs/research/m3/
decisions-after-npc-stream.md:455-466). A research agent's read, no code, no fork change. Sources:
CommonLibSSE-NG at b93280e8, the fork at origin/parity 1b866786 through `git show` (the checkout stays at
11c126b9), the docs on main, the web as cited (TES3MP 0.8.1 at 49be5b64, CoreScripts 3e397a11; Skyrim Together
dev 25a0049a, a map only, ADR-005 and rule 7). Inferred engine behaviour is HYPOTHESIS; unconfirmed web
claims are UNVERIFIED.

## Context

The law: the server owns STATE, the cell's host owns SIMULATION, the wire carries DELTAS, everything else is
a HOOK; undeclared state and R3 by omission are bugs (CLAUDE.md). Physics is the one engine system M3 left
each game to itself: a corpse rests where each engine's ragdoll puts it (npc-fate.md:114, the fall R2
declared; D42 for the reload), a dropped item is SkyMP's placeholder (F1), props and kicked objects are
nobody's (R3 by omission; docs/research/m3/skymp-hosting.md:493 "physics host switching for movables:
missing"). M4 names the rows (docs/PLAN.md:1220 "dropped items and kicked objects under the physics host";
:1052; :41 world objects persist "movables, dropped items"); so does upstream (skymp ROADMAP.md:33 dropping
"without physics: spawn a discarded object in the legs"; :34 physics needs "a host switching mechanism"; :50
"corpse physics"). Four object classes, a cost each, one decision.

## Findings

### F1. What the fork does today (origin/parity 1b866786)

- Movement is accepted for actors alone: ActorUpdatableBy returns the form's AsActor, null for anything else
  (skymp5-server/cpp/server_guest_lib/ActionListener.cpp:59-83); OnUpdateMovement goes through it (:155). A
  non-actor's transform is the record's, written at creation and by server scripts, never by a game.
- A client spawns a server reference at the record's position (skymp5-client/src/view/formView.ts:336-337),
  angles it (:343-348); SpawnProcess sets the position, enables it and makes every non-actor Keyframed
  (view/spawnProcess.ts:18, :31, :49); any item reference the client "deals with" is Keyframed as well
  (extensions/objectReferenceEx.ts:62-64; ingredient flora :66-69). A server-made object is frozen where the
  record puts it on every seat; nothing simulates it.
- A drop: on a containerChanged from the player to no container with a reference, menu open, the client finds
  the engine's own dropped references of the base within 2000 units, deletes them and sends DropItem {baseId,
  count} (services/services/dropItemService.ts:9-88; the delete :65, the send :78-86). The server removes the
  items and PlaceAtMe's a record at the actor (skymp5-server/cpp/server_guest_lib/MpActor.cpp:2811-2879),
  keeps a queue of ten and deletes the oldest (:2814, :2884-2918), deletes the reference after 120 s (:2813,
  :2924-2930). The dropper's engine simulated a fall and the client threw it away: a dropped item lands "in
  the legs", frozen on every seat, gone in two minutes.
- A corpse: the death is the server's word (services/services/deathService.ts:87-103; killActor :188-209).
  The puppet is placed at the host's last sample BEFORE the kill when over 64 units off (:148-169,
  restPuppetAtHost) because a dead ragdoll takes no setPosition (:203-208). After the death a dead puppet's
  samples go to restBody (sync/movementApply.ts:74-79), which rests the body once, two seconds after the first
  dead sample, if over 64 units off (:111-132); translateTo skips a dead actor (:436). The host's own dead
  actor keeps reporting and the record follows it under R2 (npc-fate.md:1886-1892). The promote leaves a dead
  actor's AI off since H-54e (skyrim-platform/src/platform_se/skyrim_platform/PuppetApi.cpp:103-131).
  forceRemoveRagdollFromWorld's onResult can fail to come; the client wraps it in a deadline
  (services/services/ragdollService.ts:15, :56-62).
- The push verb is the one physics object we relay: the throw is R2 on the target's own game, the figure drops
  where it stood and moves to the landing after the get-up, and two games simulating one throw land 503 to
  1405 units apart (docs/verbs/push.md:48-56, :189-193, :224-232). Re-simulation does not converge.
- Marksman is R1: the shooter's game computes the flight, an observer launches its own arrow, the landed
  arrow is each game's own reference (docs/verbs/marksman.md:22-44, :139-143).

### F2. What the lab measured (npc-fate.md)

- Bodies 326 units apart at a kill before the pre-kill placement; within 200 units after it (:1855-1858,
  H-52a :1865-1868). "A dead ragdoll takes no setPosition" is MEASURED (x-npc-death-host v3 20261027-091759).
- A seat that reloads the cell finds the corpse re-settled by its own engine, 360 units down a slope, and a
  host change after such a reload moves the record to the new host's body; "a fix in kind has no hook, the
  engine re-settles the body without killing it again" (:1883-1903). D42 leaves it as a known limit.
- H-54e: a corpse walked at a walker's pace because the promote turned a dead actor's AI on; with the AI left
  off it stayed within 22 units across the kill, a restart and the host's reconnect (:2002-2030). The rule
  drafted there and not built: "a dead record takes its host's samples for a settle window (ten seconds) and
  then holds, so the body's place is the server's word" (:2013-2017).

### F3. The engine's surface (CommonLibSSE-NG, file:line; the rest is "RE this")

- Motion types: hkpMotion::MotionType {kInvalid, kDynamic, kSphereInertia, kBoxInertia, kKeyframed, kFixed,
  kThinBoxInertia, kCharacter} (include/RE/H/hkpMotion.h:26-37); the reference-level mirror with the engine's
  values 1 to 7, kKeyframed = 4 (include/RE/T/TESObjectREFR.h:126-135). TESObjectREFR::SetMotionType(type,
  allowActivate) (:468) is Get3D, NiAVObject::SetMotionType (include/RE/N/NiAVObject.h:133) and
  AddChange(kHavokMoved) (src/RE/T/TESObjectREFR.cpp:879-890).
- Keyframed is infinite mass, deaf to forces: hkpKeyframedRigidMotion makes SetMass, SetMassInv and every
  ApplyImpulse, ApplyForce, ApplyTorque a no-op (include/RE/H/hkpKeyframedRigidMotion.h:18-33), adds
  SetStepPosition (:35). Transform and velocity entries: hkpMotion's SetPosition, SetRotation,
  SetPositionAndRotation, SetTransform, SetLinearVelocity, SetAngularVelocity (hkpMotion.h:52-57); the
  wrapper bhkRigidBody's GetPosition, GetRotation, SetPosition, SetRotation, SetPositionAndRotation,
  GetTransform (include/RE/B/bhkRigidBody.h:41-48), the velocities and impulses (:52-55).
  hkpRigidBody::GetMotionState is &motion.motionState (include/RE/H/hkpRigidBody.h:18); the state holds
  transform, sweptTransform, damping, max velocities, deactivation class (include/RE/H/hkMotionState.h:14-23).
  Deactivation: kNumInactiveFramesToDeactivate = 5 and its counters (hkpMotion.h:21-24, :78-79, :86-87);
  hkpWorld::wantDeactivation, shouldActivateOnRigidBodyTransformChange, deactivationReferenceDistance
  (include/RE/H/hkpWorld.h:150-153; HYPOTHESIS that a transform write wakes a body). Havok units:
  bhkWorld::GetWorldScale (include/RE/B/bhkWorld.h:42-52); the world lock (:71).
- The reference's placement: SetPosition is MoveTo_Impl with the current cell and the record's angle
  (TESObjectREFR.h:469-470; src:892-900); MoveTo (:456; src:754-760); Disable 89 (:337; src:960-963), Enable
  (resetInventory) (:374; src:95-100); Update3DPosition(warp) 3F (:259); DetachHavok 65, InitHavok 66
  (:297-298); MoveHavok(forceRec) 85, GetLinearVelocity 86 (:333-334); SetCollision only toggles the
  kCollisionsDisabled record flag (:465; src:848-855; :169). The save's change flags kMoved and kHavokMoved
  (:141-142), the record flag kDontHavokSettle (:201), ExtraSavedHavokData's havokBuffer (include/RE/E/
  ExtraSavedHavokData.h) and ExtraHavok's world (include/RE/E/ExtraHavok.h): the engine already persists
  "this prop moved" per reference (HYPOTHESIS as to the buffer's content; RE-P7).
- The ragdoll chain: TESObjectREFR is an IAnimationGraphManagerHolder (TESObjectREFR.h:112; the accessor
  include/RE/I/IAnimationGraphManagerHolder.h:44); BSAnimationGraphManager::graphs (include/RE/B/
  BSAnimationGraphManager.h:121); BShkbAnimationGraph is the BSIRagdollDriver (include/RE/B/
  BShkbAnimationGraph.h:28-29) with characterInstance (:122) and physicsWorld (:139); the driver's
  AddRagdollToWorld 02, RemoveRagdollFromWorld 03, ResetRagdoll 05, SetMotionType(hkpMotion::MotionType) 08,
  ToggleSyncOnUpdate 0A, ToggleConstraints 0C (include/RE/B/BSIRagdollDriver.h:16-27); hkbCharacter::
  ragdollDriver (include/RE/H/hkbCharacter.h:33); hkbRagdollDriver::ragdoll (include/RE/H/hkbRagdollDriver.h:
  30); hkaRagdollInstance::rigidBodies, constraints, boneToRigidBodyMap, skeleton (include/RE/H/
  hkaRagdollInstance.h:19-22). The saved pose: ExtraRagDollData's RagDollData {boneCount, bones, bip01Rot}
  (include/RE/E/ExtraRagDollData.h:18-28, :30-45; HYPOTHESIS that a save writes it for a corpse).
- The actor side: KillImpl(attacker, damage, sendEvent, ragdollInstant) 10E (include/RE/A/Actor.h:468);
  Actor::SetPosition(pos, updateCharController) 0A9 (:367); Resurrect 0AB (:369); DropObject(object,
  extraList, count, dropLoc, rotate) 0CB (:401), PickUpObject 0CC (:402); IsInRagdollState (:597);
  SetLifeState (:621); the knock state (include/RE/A/ActorState.h:52-62). Actor is a sink of
  BSTransformDeltaEvent and bhkCharacterMoveFinishEvent (Actor.h:128-129): the only engine events near
  "something moved"; payload and emitter unread (RE-P6).
- The drop's event: TESContainerChangedEvent {oldContainer, newContainer, baseObj, itemCount, reference,
  uniqueID} carries the dropped reference's handle (include/RE/T/TESContainerChangedEvent.h:11-16): SKSE's
  event first (ADR-034) names the engine's own dropped reference, which the client deletes today.

### F4. Havok's own idiom (the SDK's docs; applicability to 1.6.1170 is HYPOTHESIS until a lab read)

- hkpMotion.h (Havok 2009 SDK): a KEYFRAMED body is not simulated; each step its velocity is integrated into
  its position and the velocity is not updated; impulses and forces leave it; infinite mass to the rest of the
  system; FIXED is keyframed at velocity zero with no cost.
  https://github.com/nitaigao/engine-showcase/blob/master/etc/vendor/havok/Source/Physics/Dynamics/Motion/hkpMotion.h#L36-L92
  The idiom is velocities, not teleports: hkpKeyFrameUtility::applyHardKeyFrame(nextPos, nextRot, 1/dt, body)
  sets the velocities that reach the target next step (pushes dynamic bodies, is never pushed); applySoftKeyFrame
  adds gains, acceleration clamps and a warp distance.
  https://github.com/nitaigao/engine-game-factions/blob/master/etc/vendor/havok/Source/Physics/Utilities/Constraint/Keyframe/hkpKeyFrameUtility.h#L16-L112
  setPosition/setTransform teleport and may fire contact-removed callbacks; setMotionType to keyframed zeroes
  the velocities and keeps the transform; back to dynamic continues from the same transform and velocity.
  https://github.com/nitaigao/engine-showcase/blob/master/etc/vendor/havok/Source/Physics/Dynamics/Entity/hkpRigidBody.h#L112-L139
  CommonLib has no hkpKeyFrameUtility symbol (grep of include/RE): reaching it is RE-P4.
- Skyrim-native precedent, as a map: HIGGS (GPL) drives keyframed hand bodies with applyHardKeyFrame each
  frame, grabs objects keyframed and releases them dynamic; its author notes ragdolls go "crazy when keyframed"
  (https://github.com/adamhynek/higgs, src/hand.cpp, src/physics.cpp). PLANCK hooks Actor::SetPosition and
  suspends the actor's physical animation around it (https://github.com/adamhynek/activeragdoll, src/main.cpp).
- The Creation Kit wiki (Wayback snapshots; ck.uesp.net blocks fetchers): Motion_Keyframed "will NOT be
  simulated by Havok (will only move if forced to, through SetPosition() or TranslateTo())", the override is
  baked into the save under the HAVOK_MOVE change flag (SetMotionType_-_ObjectReference); havok items
  translate when set motion_keyframed and are "forced back into Havok simulation by changing their motion type
  back to motion_dynamic and applying a small havok impulse", a type change mid-translation can crash,
  StopTranslation first (TranslateTo_-_ObjectReference); ApplyHavokImpulse "correctly moves the graphics and
  collision geometry, but the object is still considered to be on its old position" (ApplyHavokImpulse_-_
  ObjectReference): the reference's transform and the body's are two stores, and whoever owns the body must
  write the reference back. "SetPosition on a ragdolled actor does nothing until it gets up" is on no CK page:
  UNVERIFIED as a documented rule; our measurement stands (F2), the mechanism is RE-P1.

### F5. Prior art: TES3MP (its authority is our host; paths under https://github.com/TES3MP/TES3MP/blob/49be5b6405d6/ and https://github.com/TES3MP/CoreScripts/blob/3e397a11eaf7/)

- Objects sync as events, never as motion: ObjectPlace, Spawn, Delete, Move, Rotate, Scale, State, Lock, Trap,
  DoorState, Activate, Hit (components/openmw-mp/NetworkMessages.hpp#L70-L105). ObjectMove carries three floats,
  ObjectRotate three, no velocity, no time (Packets/Object/PacketObjectMove.cpp#L12-L16, PacketObjectRotate.cpp#
  L12-L18). The client never sends them; the senders are server Lua's SendObjectMove and SendObjectRotate
  (apps/openmw-mp/Script/Functions/Objects.cpp#L543-L556, #L847-L868; https://docs.tes3mp.com/en/latest/api/
  ObjectFunctions.html); CoreScripts calls SendObjectRotate once, to fix a placement's rotation (scripts/cell/
  base.lua#L1266-L1273).
- A drop: OpenMW places the item locally, TES3MP sends ObjectPlace with droppedByPlayer and the settled
  position, deletes the local copy and waits for the server's echo with an mpNum (apps/openmw/mwgui/hud.cpp#
  L55-L90; mwmp/ObjectList.cpp#L1246-L1276); receivers place it, adjustPos false, at the server's exact
  position (ObjectList.cpp#L406-L466; mwworld/worldimp.cpp#L1634-L1637). OpenMW has no rigid-body dynamics: a
  btCollisionWorld, objects as collision shapes, a drop is one ray down (mwphysics/physicssystem.cpp#L96;
  worldimp.cpp#L2594-L2620); placed-object collision is a server knob (scripts/config.lua#L271-L285). TES3MP's
  answer to object physics is to have none, and its drop is still the one-brain shape: one engine settles it,
  the server records the rest, every seat places the record.
- A corpse: the authority streams a dead actor's position only until its death animation ends (mwmp/
  LocalActor.cpp#L57-L72, #L178-L211), the other seats lerp every frame to the last packet (mwmp/
  DedicatedActor.cpp#L78-L107), CoreScripts saves location, deathState and killer (base.lua#L856-L883,
  #L1012-L1040), a late loader gets an instant death with collision off (base.lua#L1789-L1825). Morrowind has
  no ragdoll (deaths are clips), so the corpse's point and pose never disagree. Known limit: idle animations
  slowly move NPCs (issue #537, closed as vanilla, https://github.com/TES3MP/openmw-tes3mp/issues/537).

### F6. Prior art: Skyrim Together (a map only, ADR-005; dev 25a0049a)

- No ragdoll sync and no object transform sync exist. Death is a boolean (RequestDeathStateChange {Id, epoch,
  IsDead}); remotes call Kill (ragdollInstant) or Respawn (Code/encoding/Messages/RequestDeathStateChange.h,
  Code/client/Services/Generic/ActorValueService.cpp). The movement stream never stops for the dead and remotes
  ForcePosition every remote actor each frame, so the corpse's ragdoll is each client's own and only the
  reference is forced (Code/client/Systems/InterpolationSystem.cpp): issue #721, corpses in different places
  with the activation box where the drawn body is not (https://github.com/tiltedphoques/TiltedEvolution/
  issues/721). A sibling project's cure, Update3DPosition(true) after the forced position ("ForcePosition moves
  the reference and its 3D root but not the ragdoll's physics bodies", https://github.com/fallenhak/
  skyrim-online-str/pull/71, lineage UNVERIFIED), is F4's two stores again and RE-P1's first candidate.
- Writing positions each frame on bodies the engine also moves corrupted Havok: PR #901 (issues #63, #564,
  loose objects sliding; https://github.com/tiltedphoques/TiltedEvolution/pull/901; docs/research/m3/
  te-npcs.md:266, :283). A hazard for any per-frame keyframe we write.
- Drops: a hook on Actor::DropObject (TE-MAP's 40454) sends an inventory change with Drop; remotes re-run the
  engine's own drop on their copy, a fresh reference per client and each client's own fall, off by default
  ("Dropping items has caused crashes ... picking them up is often not synced anyway",
  https://wiki.tiltedphoques.com/tilted-online/guides/server-guide/server-configuration). The maintainer's
  draft PR #913 "Overhaul item drops sync" (2026-10-05, not on dev) is the shape we would build: the dropper
  samples the item's transform every 0.1 s; rest is linear velocity under 2 units/s for 0.5 s, or 10 s at
  most; followers spawn a copy, set it keyframed (NiNode::SetMotionType, TE's id 77866, a lead under rule 1),
  drive it with TranslateTo, and on IsAtRest StopTranslation then dynamic; pickup is first-request-wins under
  a cap uMaxDroppedItems (https://github.com/tiltedphoques/TiltedEvolution/pull/913). The rejected PR #926 sent
  one final transform and found drops near the world origin when the engine gives no location
  (https://github.com/tiltedphoques/TiltedEvolution/pull/926).
- Props: TE's 222 messages hold for world objects only activation, locks, inventories and a script animation,
  no transform (Code/encoding/Structs/ObjectData.h). Nobody has shipped prop sync in Skyrim.

## The design: one shape, four classes (R2: host computes, server records, other seats impose)

The cell's host (ADR-035) simulates a physics object as its engine does today; the server records its
transform as state: a REST transform always, a MOTION stream only where motion is drawn; an observer's copy is
Keyframed and follows, the simulator's copy alone is Dynamic (npc-puppet's Rule C for objects: one brain); a
settle is Havok's own deactivation if the engine exposes it (RE-P3), else TE #913's threshold (UNMEASURED
here); after rest the record holds (R0) until the host reports motion again. Wire (ADR-012 Rust types in
skymp-wire, ADR-015; validator in the same commit, rule 4; the next MsgType after ActorClaim's 56, skymp5-
server/cpp/messages/MsgType.h:74): ObjectRest {refr u32, pos [f32; 3], rot [f32; 3], cause Settle | Drop |
Death | Land, seq u32}, reliable, from the simulator; ObjectMotion {refr, pos, rot, vel [f32; 3], t u32},
unreliable at 10 Hz, C3 and thrown items only. Validation (R1 where cheap): the sender hosts the cell, the
object stands in it, a seq fence, the rest within a bound of the record (a drop within 512 units of the
dropper, a corpse within the fate's 2048, both UNMEASURED), refusals logged (ADR-048). Persistence: the
record's SetPos and SetAngle as today plus a "moved" mark (the engine's kHavokMoved); an added field is a
migration with its restart scenario (rule 6); the word to the seats is the record's position at subscribe
(formView.ts:336-337) plus a position update for non-actors (UpdateMovement is actors-only). Handoff: the new
host's copies turn Dynamic at the record's transform with allowActivate false (asleep until touched;
HYPOTHESIS), the old host's turn Keyframed, inside ADR-047's grace. Observers never write a body the engine
also moves (TE #901).

### C1. Dead actors' ragdoll rest

Today: the standing point R0, the fall R2 declared, the rest each engine's (D42). The rule in kind is H-54e's
drafted one (F2): the dead record takes its host's samples for a ten-second settle window, then holds; the rest
point is the server's word. An observer imposes a POINT, not a pose, since a dead ragdoll takes no setPosition
(MEASURED): (a) at a cell reload or a login the body is placed at the record's rest and killed at once with
ragdollInstant, the fate's reload path (npc-fate.md:362-366; RE-4 still open), landing near the point by each
engine's short fall (b-npc-death's 32-unit bound plus that fall); (b) a seat already viewing a body past the
bound re-places it with Disable, SetPosition, Enable (the CK's DisableNoWait/MoveTo/EnableNoWait, the fate's
respawn shape) or Update3DPosition(true) after the SetPosition (PR #71's cure; UNVERIFIED on 1.6.1170; RE-P1).
The pose stays each engine's and is declared R3 (limbs differ, the point agrees). The host's reload re-settle
(360 units) is covered: the record stopped following at the window's end and the reloading host's body takes
(b). Cost: 2 to 3 days (the server rule with its T0 case; the client impose on the existing reload path; a probe
x-corpse-rest for (b); b-npc-death's restart leg claims the record's rest within the bound on both seats, its
own commit, rule 13). Risk: RE-4 and whether Disable/Enable on a dead actor touches its inventory (the body's
list is the server's already, H4). Pose sync is option D (F3's chain, RE-P9): 6 to 10 days plus the RE,
uncertain, cosmetic once the point agrees.

### C2. Dropped and thrown items

Today: the dropper's engine reference is deleted, the record placed at the actor, frozen on every seat, gone in
120 s (F1). The rule: the dropper's engine keeps its own reference and simulates the drop (DropObject returns
the handle, Actor.h:401; TESContainerChangedEvent names it, F3); the client sends DropItem as today and
ObjectRest {cause Drop} when the reference settles; the server's PlaceAtMe record takes the rest transform (R2
bounded); at rest the dropper's client swaps its reference for the server's (today's delete, moved from the drop
to the rest; the server's copy appears Keyframed at the same transform: HYPOTHESIS that the swap is invisible);
every other seat spawns the record frozen at the rest, as today. The 120 s deletion and the queue of ten become
server policy: persist as a world object (PLAN.md:41) under a cap per cell (TE's uMaxDroppedItems; today's
ten). Pickup by another seat exists through a server reference's activation. Thrown items (Unrelenting Force
on a prop, Telekinesis) are C3's motion when drawn; under B their rest alone (declared). Cost: 4 to 6 days
(the client's drop rework, the rest report, the Rust message and validator, the server's rest apply and policy
with a migration, T0, T2's fakeclient drop, b-item-rest at T3: drop on the host, the record within 16 units of
the host's engine rest, the other seat sees it there, picks it up once, a restart keeps it), plus 1 to 2 days
of lab grammar: a `drop` step (lab-api has kill-ref, console and teleport, lab/labapi/CONTRACT.md:172-184; the
console step can `player.drop` meanwhile; the grammar lands first).

### C3. Physics props the engine already keeps (barrels, plates, kicked objects)

Today: each engine's own Havok, nothing on the wire, nothing persisted server-side: R3 by omission, which the
law calls a bug, so B below DECLARES it. The rule under C: the host streams ObjectMotion for props moving in
its cell (the moving set alone, 10 Hz) and ObjectRest at settle; observers keyframe their copies
(SetMotionType kKeyframed, TESObjectREFR.h:468) and follow, by TranslateTo as the CK and TE #913 do or by
bhkRigidBody::SetPositionAndRotation per frame (RE-P4 decides), and release them Dynamic at the host's rest
with allowActivate false; the server records pos and rot and persists them as the engine does (kHavokMoved,
ExtraSavedHavokData, F3); at a handoff the moving set turns Dynamic on the new host from the record. The hook:
SKSE publishes no "prop moved" event (ADR-034's first question answers none); candidates are a per-frame scan
of the host's cell for active bodies (RE-P8), BSTransformDeltaEvent (RE-P6) and a post-simulation listener
(hkpWorld.h:43). The filter: moved since load only, under a cap (ten moving bodies; Havok Ragdoll Throttler's
number for sleeping corpses, UNVERIFIED). Cost: 8 to 12 days after the RE (RE-P3, P4, P6, P8 first, about 3
days of the re-analyst) and an ADR-031 reference trace of a kicked bucket on one seat before any code. Risk:
the host's per-frame cost over hundreds of movable references, TE's Havok corruption (#901), the CK's crash
on a type change mid-translation.

### C4. Projectiles (marksman's)

The shot stays R1 and the flight each game's (marksman.md:22-44); the only physics object left is the landed
arrow, today each game's own lootable reference (:139-143). Under B the shooter's arrow at rest is ObjectRest
{cause Land}, the server makes the record as for a drop, the shooter's engine arrow is swapped for it, every
observer's own arrow is deleted at its landing (it never becomes an item). Spell projectiles leave nothing.
Cost: 1 to 2 days on C2's path. The push verb's thrown ACTOR stays as built (R2, the landing by the movement
relay); a thrown PROP is C3.

## Cost, in days (one agent, a working lab; anchors: npc-stream's three slices at 4 to 5 days per ADR-050, and D37's "a verb of its own, a week" for a synced shield drop)

| class | B: rest only | C: motion too |
| --- | --- | --- |
| C1 corpse rest point | 2 to 3 | 2 to 3 |
| C1 pose (D) | 0 | 6 to 10 plus RE-P9 |
| C2 dropped items at rest | 4 to 6, plus 1 to 2 grammar | plus 2 to 3 for thrown motion |
| C3 props | 0 (declared R3) | 8 to 12, plus about 3 of RE first |
| C4 arrows at rest | 1 to 2 | 1 to 2 |
| total | 7 to 11 (plus grammar) | 20 to 30 plus RE |

## D43. The physics-sync arc (PROPOSED; Eli decides later, nothing before playtest 35 depends on it)

- A. Leave as today (D42): corpses each engine's after a reload, dropped items SkyMP's placeholder (at the
  dropper, frozen everywhere, gone in 120 s), props and arrows each engine's; the checklist names the limits.
  Cost 0. Two rows of the definition of done stay open (PLAN.md:41) and C3 stays R3 by omission.
- B. Rest, not motion: TES3MP's shape. C1's settle rule and point impose, C2's drop at the dropper's engine
  rest with persistence and a cap, C4's arrows the same way; no motion stream, no pose; C3 declared R3 with the
  one trigger that would promote it named (a dungeon mechanic that needs a moved prop, a kicked object on a
  pressure plate). 7 to 11 days as two verbs, corpse-rest and item-rest, each whole (rule 3).
- C. The whole arc: B plus C3, the host streaming moving props and thrown items to keyframed followers, the
  handoff of the moving set and a budget cap; the RE and a reference trace first. 20 to 30 days plus RE;
  nobody has shipped it in Skyrim; TE's one try at writing bodies each frame corrupted Havok.
- D. Pose sync of ragdolls, on top of B or C: 6 to 10 days plus RE-P9; cosmetic once the point agrees.
- Recommended: B, inside M4 after its doors and containers rows (C2 shares their code), item-rest first (it
  closes PLAN.md:41's "dropped items", and C4 for two more days), corpse-rest second (D42's limit and
  b-npc-death's restart leg closed for good). C only on B's named trigger or a playtest finding that props
  matter, and then the RE and the reference trace before any code. D not unless a dungeon needs it. B is the
  lazy choice (every piece exists: the fate's reload path, the drop path, the Keyframed spawn, H-54e's drafted
  rule) and the vain one (one shape: the host settles, the server holds the rest, every seat places the
  record; TES3MP's and TE #913's conclusion alike).

- Decision: pending.

## RE this (the surface the memo could not read; each a hypothesis until the re-analyst or a Frida trace answers)

- RE-P1. Why a dead ragdoll takes no SetPosition (the two stores, or something else); whether Actor::
  SetPosition with updateCharController, Update3DPosition(true) (PR #71), MoveHavok(true) or Disable/Enable
  moves a corpse, and what each does to its inventory and death state; the Frida plan traces them on a killed
  resident while the client calls setPosition and reads the bhkRigidBody positions before and after.
- RE-P2. The reload re-settle (npc-fate.md's RE-4 widened): what the save restores for a corpse
  (ExtraRagDollData's bones and bip01Rot, kMoved), why the ragdoll re-enters the world dynamic and falls 360
  units on a slope, and the placement that lands a saved-dead actor without a fall.
- RE-P3. Rest detection: whether the engine exposes a rigid body's deactivation (hkpEntityActivationListener,
  hkpEntity.h:65; the counters, hkpMotion.h:78-79) to a hook, or the host must poll velocities (TE #913's
  threshold); the per-frame cost of either on a host.
- RE-P4. The follower's write: on a Keyframed copy, does TESObjectREFR::SetPosition move body and reference
  together (the CK: Keyframed moves "through SetPosition() or TranslateTo()"), does bhkRigidBody::
  SetPositionAndRotation move the reference back (MoveHavok's direction), is an hkpKeyFrameUtility-style
  velocity write (F4) reachable in 1.6.1170; which of the three a 10 Hz stream should use.
- RE-P5. The drop: whether DropObject's returned reference is the one TESContainerChangedEvent names, what
  happens when the engine gives no location (TE #926's near-origin landings), and the moment a dropped item is
  at rest by the engine's own account.
- RE-P6. BSTransformDeltaEvent and bhkCharacterMoveFinishEvent (Actor.h:128-129): emitter, payload,
  frequency; whether a non-actor's move is published anywhere.
- RE-P7. kHavokMoved and ExtraSavedHavokData (F3): what the engine saves for a moved prop, so the server stores
  the same minimum (pos, rot, motion type) and a reload imposes it the engine's own way.
- RE-P8. The active set: how to enumerate the rigid bodies moving in a cell (bhkWorld, the active simulation
  islands) and filter "moved since load", for C3's host scan and its cap.
- RE-P9. Ragdoll keyframing (D only): BSIRagdollDriver::SetMotionType(kKeyframed) over a puppet's bones, the
  per-bone transform write, ToggleSyncOnUpdate's meaning, whether the skeleton follows without the behaviour
  HIGGS's author describes.
