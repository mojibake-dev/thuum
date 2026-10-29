# prop-physics

Status: DRAFT (the weekend pass, thuum-magnus; ADR-058). Slice one's server half BUILT 14:54 PDT 2026-10-29 on fork m3-prop-physics
(b752b262 the wire rows with validators, fixtures, C++ structs and client interfaces, SCHEMA_VERSION 21; 8575e59b the owner rule
props.rs with its bridge, the handlers, PartOne's plumbing, unit/PropTest.cpp, the difftest session; cargo tests and clippy green,
fork-lint green, the C++ compiles on CI only); the client service in build; nothing at T3 yet.

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
| the touch | B/bhkCharProxyController.h:22-25; H/hkpCharacterProxyListener.h:49 (slot 2); H/hkpRootCdPoint.h:16; H/hkpCollidable.h:54-69; T/TESHavokUtilities.h:15 | READ 15:37 PDT (docs/research/m3/re-havok-contact.md): the player's proxy controller's ContactPointAddedCallback, Address Library 79131 (just addr), fires for Keyframed bodies too; the reference by FindCollidableRef 26003; HYPOTHESIS until lab/frida/prop-contact.js |
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

lab/frida/prop-contact.js (`just frida prop-contact <client>`): hooks the proxy controller's ContactPointAddedCallback (79131) and the
interaction's impulse body (78304) on both seats while the player walks into a basket twice; logs this, the collidable's layer, the
owner body's motion type, the reference's id (FindCollidableRef 26003) and the thread. Expected: on the simulating seat 79131 once per
touch and 78304 every step with bumpedBody the basket; on the other seat 79131 fires with motion type 4 and 78304 stays silent; then the
stream's first sample within 100 ms of the first contact on the owner's seat. The thread the callback runs on decides whether the
hook's event send hops to the JS thread.

## Status

- [ ] doc complete, inventory listed with a disposition per row, rung declared
- [ ] engine surface cited or delegated (the touch: delegated to the re-analyst)
- [x] message contract in wire-schema with validators and fixtures (same commit; b752b262)
- [x] server rule in Rust with T0 (8575e59b; the C++ T0 PropTest runs on CI)
- [ ] native hook + T1 (the contact hook BUILT, fork m3-prop-physics d4a75d02: a Gum on-enter detour on 79131 filtered to the player's proxy controller and the clutter and props layers, one propContact event per prop per 250 ms through the tick queue; T1 none, the trace at the stage; the transform read and the Keyframed set are the platform's own natives)
- [x] SP binding and TS service (the TS PropService, 8f887477; no new SP binding in slice one: setMotionType, translateTo, setPosition from the platform's own surface)
- [ ] T2 green
- [ ] T3 scenario green, no HYPOTHESIS tags
- [ ] parity scenario green, or its later list reviewed with it (ADR-031)
- [ ] sequences and combinations green (ADR-033)
- [ ] ledger and suppression registry updated

## The build's departures from the first draft (14:54 PDT 2026-10-29, the server half)

- The rules are pure: owner_of, transform and host_changed take now_ms, and transform takes the cell's host (an unclaimed prop is the
  host's by default). The bridge: prop_owner_of(refr, cell_host, now_ms), prop_transform(refr, player, cell, cell_host, asleep, now_ms),
  props_host_changed(cell, host, now_ms); PartOne gained ClaimProp, PropTransform, PropOwnerOf, PropEpochOf, PropsHostChanged (in
  ApplyHostDecisions' Grant case) and props_gone beside cells->gone at the disconnect.
- PropRow has `grabbed`: a grab (touch 1) holds the prop against other players' claims until the owner's drop or impulse (HYPOTHESIS: the
  engine's grab is exclusive on its seat). WrongCell: no cell at the sample's point, or an unhosted cell with no live lease (the record
  freezes). A lapsed toucher's re-touch is Granted anew (a new epoch), so the host's seat hears the word and goes Keyframed. The
  transform's cell is the sample's position in the record's worldOrCell (HYPOTHESIS: a prop never changes world or interior by physics).
- PropClaim has no client event (C2S only); PropTransform and PropOwner have both. touch is u32 in C++, range-checked in the handler too.
- Unverified: the C++ on CI (listener population after ForceSubscriptionsUpdate, the LocationalData init, the first CellLoaded's grant);
  the lease's end tested in Rust alone; the difftest session drops an iron dagger and assumes the drop lands at 0xff000004.

## The client half (15:18 PDT 2026-10-29, fork m3-prop-physics 8f887477, slice one)

PropService (skymp5-client/src/services/services/propService.ts, 880 lines; registered in index.ts; HostService gained hostsCell): every
500 ms the view's bound item references within 1024 units (the nearest 64; FormTypeEx.isItem's ten types) are tracked; the owner is
the last PropOwner's player while its lease lives (the client mirrors PROP_LEASE_MS 3000 and the asleep rule so a toucher's seat does
not keep a Dynamic body the server no longer accepts samples from), else the cell's host. The simulator's body is Dynamic and streams
a sample at more than 2 units or 2 degrees since the last sent, at least 100 ms apart, unreliable, and one reliable asleep sample after
500 ms still; the follower's body stays Keyframed and takes each sample by translateTo over the clamped interval (50 to 300 ms) under
256 units, setPosition and setAngle beyond and at sleep; echoes of owned props are ignored and logged once. Touches: a grab (touch 1), a
drop (touch 2: containerChanged out of the inventory matched to the server's copy by base within 3 s and 512 units; the release sends
touch 2 too, since props.rs holds a grabbed prop against every other claim until the holder's drop), and the proximity stand-in (touch 0:
a prop that moved more than 2 units between two reads with the player within 128 units and no sample for 300 ms, once per 2 s).
formView.ts skips the movement block for a tracked prop (the item's CreateActor movement, re-applied every 2 s, would yank a Dynamic
body back to its login place); PropService writes each sample into the model's movement so untracked props still land where the stream
left them. Wake policy: setMotionType(Dynamic, true) only when a PropOwner names this seat; host-default clutter gets false (no settle
storm of 64 bodies). A 1 s grace after tracking before any motion-type change (SpawnProcess's own Keyframed set comes last). Kill switch
propPhysics. Logs under [verb:prop-physics]: "claim <hex> touch N", "stream <hex> started|asleep", "applied <hex> from the stream"
(per 10 s), "prop <hex> owner <hex> epoch N (mine|theirs)" and "(host)" at a fallback.

**The structural hole, named:** a Keyframed body never moves from a bump, so the proximity touch fires only on bodies the arrival
forcing missed or an ex-owner's after its lease; a non-host walking into a basket gets nothing. The sure touches are the grab and the
drop, and the host's own push covers x-prop-push when the walker hosts the cell. The contact native (the Havok callback on the player's
character controller, the re-analyst's read in flight) is slice one's missing piece for x-prop-pass; until it lands, the claim on
contact is HYPOTHESIS and the probe uses the host as the walker. Everything engine-facing (motion-type flips at runtime, translateTo on
keyframed clutter, the 500 ms sleep stand-in, the drop match against DropItemService's delete) is untested until x-prop-push.

## The touch built (15:51 PDT 2026-10-29, fork m3-prop-physics d4a75d02)

Offsets::Hooks::CharProxyContactPointAdded{{ REL::ID(79131) }} (Address Library 1.6.1170, just addr; AE only, as Reanimate), the on-enter
detour OnPropContactEnter: the point's rootCollidableB on layer kClutter or kProps (GetCollisionLayer), `this` (the listener subobject at
the controller's +0) cast to bhkCharProxyController and compared with PlayerCharacter::GetSingleton()->GetCharController(), the broad-
phase handle's type kEntity, the owner as hkpEntity and its motion type, the reference by TESHavokUtilities::FindCollidableRef; one event
per reference per 250 ms under a mutex; delivered by SkyrimPlatform::AddTickTask into EventsApi::SendEvent("propContact", {{refrId, layer,
motionType}}) (the locked tick queue, safe from any thread; EventManager's EmplaceEvent registers the name, the train-25 lesson). Typings
in codegen's Definitions.txt (skyrimPlatform.ts regenerated byte for byte) and the client's module augmentation. The client: PropService
queues the event's ids and, on the update, claims a tracked prop it does not simulate and does not own (PropClaim touch 0, the 2 s per-prop
throttle), logging "[verb:prop-physics] contact <hex> layer N motion N: claimed" or "owned, no claim"; the proximity stand-in sits
behind propContactFallback (default off). HYPOTHESIS until lab/frida/prop-contact.js: the callback's thread, that slot 2 fires for a
Keyframed body under the player's proxy controller, and that FindCollidableRef is safe there. The Windows build compiles it at the -win
push; MSVC's /WX is the first reader.

## Slice two's read and the persistence path (16:54 PDT 2026-10-29)

ADR-058 decision 4 gave slice two the movable statics (MSTT) and the Blue Palace's physical container. The master file says otherwise
for the lab's cells (esm.py on sky-srv, Skyrim.esm 1.6.1170, `near 0x3c` within 3000 units): eight MSTT references around Riverwood's
spot, none around lab-spawn, every one an effect or an animated static (FXMotesForest01, FXSmokeChimney02, FXMistStreet01,
FXrapidsBig01, Campfire01LandBurning, SpitPotOpen01), and no CONT editor id containing "Palace" or "Phys". The props a player moves
are items, slice one's set; the traps' bodies are M4's. Slice two is deferred to M4 with the dungeon work (ADR-058's note of this
hour); head 3 continues on slice one's proof, its persistence and the review.

Persistence (rule 6): the asleep sample's SetPos runs in SetPosMode::Other, which saves the record at once (MpObjectReference.h:55-62),
the awake samples in CalledByUpdateMovement, which saves from time to time; no schema changes, so no migration. x-prop-push carries the
restart half (the record's x within 8 of its rest after `server: restart`, the watcher's fresh copy at the record), so a separate
x-prop-restart is not needed; b-prop-push inherits the step. PropTest's third case reads the record after a sample (the same
ChangeForm the save writes). HYPOTHESIS until the run: that the client's arrival forcing (formView's item movement, skipped for a
tracked prop) leaves the restarted record's place standing on a fresh seat.
