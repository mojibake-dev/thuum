# prop-physics

Status: DRAFT 14:06 PDT 2026-10-29 (the weekend pass, thuum-magnus; ADR-058). Slice one in build; nothing at T3 yet.

## Intent

A prop (a kicked basket, a dropped sword, a boulder, a body) moves the same on every screen: the seat whose player touched it
simulates it, the server records where it is, every other seat shows the stream. Garry's Mod's shape without its server (ADR-058;
Eli: "the canon perfection of multiplayer phys objects is gmod"). Today every such reference is Keyframed on arrival and moves on
one screen alone (skymp5-client/src/extensions/objectReferenceEx.ts, view/spawnProcess.ts).

## Rung

- The transform: R2. The simulating seat's Havok computes, the server records the last transform and the asleep flag. Not R1:
  the server has nothing to validate a position against but a speed bound (a budget row, UNMEASURED), which it applies as the
  movement budgets do; not R0: ADR-002 forbids server physics.
- The claim: R0. The server decides who simulates, on a toucher's report, newest touch by epoch; the cell's host by default.
- Why not one rung higher for the transform: validation needs a physics the server has not got.

## Engine surface (CommonLibSSE-NG headers; cite before use, rule 1)

| what | where | note |
|---|---|---|
| a reference's position, angle, 3D | T/TESObjectREFR.h:73-80, :378-381, :414-417, :375, :421 | GetPosition, GetAngle, Get3D, GetTransform |
| the 3D node's collision object, rigid body | N/NiAVObject.h:122, B/bhkCollisionObject.h:30-35, B/bhkRefObject.h:26 | GetCollisionObject, GetRigidBody (REL::ID in the header), referencedObject to hkpRigidBody |
| the body's transform getters and setters | B/bhkRigidBody.h:41-55 | GetPosition, GetRotation, SetPosition, SetRotation, SetLinearVelocity, SetLinearImpulse |
| the motion: type, velocities, deactivation counters | H/hkpMotion.h:26-38, :77-88; H/hkpEntity.h:92, :99 | linearVelocity, angularVelocity, deactivationNumInactiveFrames; the entity's motion at its offset |
| awake or asleep | H/hkpSimulationIsland.h:41-42; H/hkpWorld.h:99-100 | the island's active mark; no isActive in the headers (HYPOTHESIS: in the active list means awake) |
| the motion type set | N/NiAVObject.h:126-135; T/TESObjectREFR.h:468 | SetMotionType Keyframed, Dynamic |
| write a position | T/TESObjectREFR.h:469-470, :456, :259 | SetPosition and MoveTo through MoveTo_Impl; Update3DPosition |
| the touch | B/bhkCharProxyController.h:22-25; H/hkpCharacterProxyListener.h:15-28; H/hkpContactListener.h:18-20 | callbacks exist, nobody registers: UNKNOWN entry point, the re-analyst's task |
| a drop | A/Actor.h:401 | DropObject returns the handle; a dropped item is a prop from its first frame |
| what is a prop | B/BSXFlags.h:17; C/CollisionLayers.h:8-36 | the model's Havok flag and the body's layer (kClutter 4, kProps 10) |
| Skyrim Platform today | skyrimPlatform.ts: getPositionX/Y/Z, setPosition, setAngle, translateTo, applyHavokImpulse, setMotionType, getMass, dropObject, Cell.getNthRef | no velocity, no sleep state, no contact event |

## Observe, impose, suppress

- Observe (the simulator): each frame, the awake props within reach (the cell's references with a Havok body on the clutter or
  props layer; the player's grabbed reference; a dropped item's handle): position, rotation, awake. A sample goes out when the
  body moved more than 2 units or turned more than 2 degrees since the last, at most every 100 ms, and once more when it sleeps.
- Impose (every other seat): the stream's transform on a Keyframed body, interpolated over the sample interval; at sleep, the
  final transform once.
- Suppress (every other seat): the body's dynamics (Keyframed); the engine's own settle (kDontHavokSettle where it applies).
- The claim: the seat whose player touched a prop it does not simulate sends PropClaim; the server grants the newest touch (epoch)
  and tells every listener (PropOwner); the old simulator's body goes Keyframed, the new one's Dynamic with the last velocity.

## Message contract (wire-schema, validators in the same commit)

- PropTransform {refr: u32, pos: Vec3, rot: Vec3, asleep: bool}: C2S from the simulator (bounded: one per prop per 100 ms, pos
  within the cell's bounds, finite), S2C to the cell's other listeners.
- PropClaim {refr: u32, touch: u8} (contact 0, grab 1, drop 2, impulse 3): C2S; refused when the claimant is not in the prop's
  cell or holds no listener of it.
- PropOwner {refr: u32, player: u32, epoch: u32}: S2C to every listener at each change.

## Server (Rust first, ADR-010)

wire-rules props.rs: the owner table row kind "prop" (refr, owner, epoch, lease until), the claim rule (newest touch wins; the
cell's host when the lease lapses or the owner leaves), the transform's acceptance (owner only, the budget), the record write (the
reference's locationalData and asleep). C++: the handlers call the rules; the loader keeps items as today, admits MSTT in slice two.

## Client (TypeScript)

PropSimService: the awake-prop scan and the stream on the simulator; the Keyframed apply with interpolation on the others; the
claim on a grab (grabRelease event), a drop (the drop's handle), a contact (the native when it lands; proximity until then).

## Tests

- T0: the owner rule (claim, lease, host default, epoch), the validator's bounds and budget (wire-test fixtures per row).
- T2: a difftest session with a transform stream and a claim; the legacy core has no rows, so the session's divergences are declared.
- T3: x-prop-push (c1 walks into a basket at lab-spawn; within 2 s c2's basket is within 32 units of c1's and rests where c1's
  rests), x-prop-pass (c2 kicks it back; the owner flips; c1's copy follows), x-prop-drop (c1 drops a sword; c2 sees it land where
  c1's does), x-prop-restart (the basket where it rested after a server restart). Scenario b-prop-push after the probes hold.

## Dynamic plan

Frida on a lab seat: trace the character controller's contact callback (the re-analyst names the id) with the colliding body's
reference and the body's motion type each hit; expected: a contact per step into the basket, the basket's body Dynamic on the
walker's seat and Keyframed on the other, and the stream's first sample within 100 ms of the first contact.

## Status

- [ ] doc complete, inventory listed with a disposition per row, rung declared
- [ ] engine surface cited or delegated (the touch: delegated to the re-analyst)
- [ ] message contract in wire-schema with validators and fixtures (same commit)
- [ ] server rule in Rust with T0
- [ ] native hook + T1 (the transform read, the Keyframed set, the contact)
- [ ] SP binding and TS service
- [ ] T2 green
- [ ] T3 scenario green, no HYPOTHESIS tags
- [ ] parity scenario green, or its later list reviewed with it (ADR-031)
- [ ] sequences and combinations green (ADR-033)
- [ ] ledger and suppression registry updated
