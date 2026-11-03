# Havok props: the engine model (W1 system 3)

Written 19:32 PST 2026-11-02 (thuum-cf) under the root-cause plan's W1 (docs/research/root-cause-plan-2026-11-02.md,
"Engine model first") and ADR-064 decisions 1, 2 and 7 (docs/DECISIONS.md:4075, :4078, :4097): the engine's own path for a
Havok prop, from the input (a touch, a grab, a drop, a blast) to every consequence, per viewpoint, each claim CONFIRMED with
the run or trace id that saw it or HYPOTHESIS. The system is frozen (ADR-064 decision 7): no prop code reaches a seat until
section 5's condition holds. This doc re-derives nothing; it collects what the lab has already seen and names what it has not.
Verb docs cite its rows (E-numbers) in their Engine surface instead of re-deriving a slice (ADR-064 decision 2). The verb doc
is docs/verbs/prop-physics.md (ADR-058; the arbitration rule at :31-96 is written and BUILT on fork m4-prop-arbitration
aafb26ba, no seat has it); the code's failure families C1 to C6 live there at :43-49 and are not engine claims.

The reading rule for every row below: a decompiler read is a hypothesis with a source (ADR-064 decision 1; the labels
CONFIRMED-STATIC and CONFIRMED-BY-DECOMPILE in prop-physics.md:662-677 and docs/research/m3/re-havok-contact.md read as
HYPOTHESIS here); a playtest's server log without a run id is a hypothesis with a witness; a T0 test proves the server's
rule, never the engine. Run ids are written as prop-physics.md writes them: the physics stage's six-digit stamps with the read's
PDT date, the lab's full form where the doc gives it (the stamps are UTC, so the stage's 02xxxx and 03xxxx runs read on the
evening of 2026-10-30 PDT carry 20261031 in the full form, as D73's 20261031-024409 shows, DECISIONS.md:3514-3521).

## 1. Scope and sources

Three viewpoints, the plan's words: (a) the OWNER's engine, the seat whose player touched, grabbed, dropped or blasted the prop
and whose Havok simulates it (the cell's host for resting clutter by default, ADR-063 decision 1, DECISIONS.md:3963); (b) a
NON-OWNER's engine, a seat that renders the owner's stream on its own copy of the reference; (c) a seat that LOADS THE PROP LATE,
at a login, a cell entry, a reconnect or a server restart, and hears the create word first.

The engine systems in scope, each with its CommonLibSSE-NG surface (the pin b93280e8, the paths under
CommonLibSSE-NG/include/RE/):

- The body and its motion. A reference's 3D carries a bhkCollisionObject whose rigid body is a bhkRigidBody over hkpRigidBody
  (N/NiAVObject.h:122, B/bhkCollisionObject.h:30-35, B/bhkRefObject.h:26, prop-physics.md:113). The entity embeds its motion
  (H/hkpEntity.h:99) whose type is hkpMotion::MotionType (H/hkpMotion.h:26-38: kInvalid 0, kDynamic 1, kSphereInertia 2,
  kBoxInertia 3, kKeyframed 4, kFixed 5, kThinBoxInertia 6, kCharacter 7), with linearVelocity and angularVelocity (:84-85),
  inertiaAndMassInv (:83) and the deactivation counters (:78-79; kNumInactiveFramesToDeactivate 5 at :23). Awake or asleep is
  the simulation island's business: the entity's island (H/hkpEntity.h:92), the island's isInActiveIslandsArray and activeMark
  (H/hkpSimulationIsland.h:41-42), the world's active and inactive island arrays (H/hkpWorld.h:99-100); no header exposes an
  isActive, and Skyrim Platform exposes no velocity, sleep state or contact event (prop-physics.md:116, :122). The setters the
  client calls: NiAVObject::SetMotionType with its allowActivate argument (N/NiAVObject.h:133), TESObjectREFR::SetMotionType
  (T/TESObjectREFR.h:468), SetPosition (:469-470) and the platform's translateTo, bhkRigidBody's position, rotation, velocity and
  impulse setters (B/bhkRigidBody.h:41-55). What is a prop: the model's BSXFlags kHavok (B/BSXFlags.h:17) and the body's layer
  (C/CollisionLayers.h:11 kClutter 4, :12 kWeapon 5, :17 kProps 10; prop-physics.md:121).
- The touch. The player's character controller is a bhkCharProxyController (B/bhkCharProxyController.h:11-38), an
  hkpCharacterProxyListener whose slot 2 is ContactPointAddedCallback and slot 5 ObjectInteractionCallback
  (H/hkpCharacterProxyListener.h:49, :52); slot 5's event is hkpCharacterObjectInteractionEvent (:15-28: objectImpulse, timestep,
  projectedVelocity, objectMassInv, body) and its result the impulse vector the pass applies (:30-37). The contact point names
  the body's collidable (H/hkpRootCdPoint.h:16 rootCollidableB), whose layer is collisionFilterInfo & 0x7F (H/hkpCollidable.h:52-55)
  and whose reference TESHavokUtilities::FindCollidableRef returns (T/TESHavokUtilities.h:15). The fork hooks slot 2 with a Gum
  on-enter detour filtered to the player's controller and the clutter and props layers, one propContact event per prop per 250 ms
  (prop-physics.md:186, :239-250); the ids that row and the re-analyst's static read name (docs/research/m3/re-havok-contact.md:
  the callback, the interaction body, FindCollidableRef, the surface pass and the listener vtable) are cited from there, none
  resolved anew here. The engine's own push on a touched body is the surface-interaction pass's (prop-physics.md:660-681, a Ghidra
  read of 2026-10-31; its controller fields match B/bhkCharacterController.h:111 orientationCtrl, :115 flags with kNoFriction :31,
  :146 bumpedForce, :148 bumpedBody; the impulse lands by hkpMotion::ApplyPointImpulse, H/hkpMotion.h:60).
- The grab (the held Activate, the E key or Z). PlayerCharacter::StartGrabObject (P/PlayerCharacter.h:570), EndGrabObject (:553),
  GetGrabbedRef (:558), IsGrabbing (:565), the runtime fields grabSpring (:696, the mouse springs), grabbedObject (:697),
  grabObjectWeight (:698) and grabType (:712, kNormal, kTelekinesis). Skyrim Platform's grabRelease event is the fork's signal
  (prop-physics.md:423-424). A short press is a pickup: Actor::PickUpObject (A/Actor.h:402), the server's item branch
  (prop-physics.md:515-516).
- The drop. Actor::DropObject (A/Actor.h:401) makes the engine's own reference; the fork deletes it and places the server's copy
  (prop-physics.md:377-379, :693-700).
- The impulse of a shout or spell. The header names TESHavokUtilities::AddExplosionImpulse (T/TESHavokUtilities.h:14) and
  ScaleGameplayImpulseForce (:18); which of them Unrelenting Force's push on a cabbage goes through is unread (section 2, E20).
- The game's own sleep against the fork's stand-in: the client calls a simulated body asleep after 500 ms under 0.25 units of stir
  (STIR_UNITS, SLEEP_AFTER_MS, prop-physics.md:348) and sends one reliable asleep sample; the engine's deactivation above is never
  read by it.

Sources, in rule 1's order: the headers above; the run reads in prop-physics.md (the physics stage of 2026-10-30, :447-618; the
launch traces, :639-707; the fixed build's probes, :709-757; the first stage's candidate-set read, :353-373; the drop at T3, :375-414;
playtest 41's cabbages, :759-774); the Frida traces lab/frida/prop-launch.js ran on the host seat alone (20261031-181848 with the
broken interaction read, 20261031-190643 with the fixed one; lab/frida/prop-contact.js, whose hooks the launch tracer carries, never
ran on its own, LOG.md:3026, docs/research/engine-unknowns-2026-11-03.md:24); the static reads (re-havok-contact.md,
prop-physics.md:660-681); DECISIONS.md's ADR-058 (:3441), D73 (:3514), D75 (:3592), ADR-063 (:3963) and ADR-064 (:4051); the LOG's
prop entries (LOG.md:3009-3026, :3459-3466, :3495-3503, :3830-3832, :4343-4375, :4461-4470, :4492). The reference trace the verb
doc names (lab/references/prop-push.json "when x-prop-push runs under the recorder", prop-physics.md:182) was never recorded:
lab/references/ holds no prop file. The probes by path: lab/.cache/probes/x-prop-arbitration.yaml (v1, the four legs),
x-prop-blast.yaml, x-prop-static.yaml.

## 2. The claims table

One row per engine claim. Status is CONFIRMED <run or trace id, date> or HYPOTHESIS; a row whose evidence is a decompile, a T0
test, a playtest log or a code read is HYPOTHESIS and says why. "Source" is the line that records the claim or its read.
"Settles it" names the trace or probe leg that would move a HYPOTHESIS row (section 4 collects them).

### (a) The owner's engine

| # | Claim | Status | Source | Settles it |
| --- | --- | --- | --- | --- |
| E1 | The player's proxy controller receives ContactPointAdded for a Dynamic clutter body its capsule touches (layer 4 kClutter, motion 2 kSphereInertia for Basket01, massInv 0.2), once per new contact; the fork's detour delivers one propContact event for it. | CONFIRMED 20261031-181848 and 20261031-190643 (the tracer's row with playerProxy true, layer 4, motion 2, massInv 0.2; 2026-10-31), the production hook's "contact ... layer 4 motion 2" lines in 025647 (read 20:01 PDT 2026-10-30), 032724 and 034316 (20:33 and 20:51 PDT 2026-10-30) | prop-physics.md:643-645, :685-688, :530-531, :552, :603 | done for this viewpoint |
| E2 | The thread the callback runs on (whether the hook's event send must hop to the JS thread). | HYPOTHESIS: never logged; the tracer carries no thread field (:177-178, :248-249 "the callback's thread") | prop-physics.md:177-178, :248-249 | prop-contact.js with Process.getCurrentThreadId() in its row, armed on c1 beside x-prop-arbitration leg 2 |
| E3 | A run-through is ONE push: the event's objectImpulse 17.7 at 4.29 m/s approach, the clutter layer's factor 2 (result 17.7 before, 35.5 after), the body's velocity from 0 to the result times its inverse mass (a 5 kg basket to 6.8 m/s, 476 units a second); the next contact's impulse is 0 because the body already leaves faster than the capsule. | CONFIRMED 20261031-190643 (2026-10-31) | prop-physics.md:685-692; LOG.md:4365-4369 | done; a walk's push size is E9 |
| E4 | The interaction body writes nothing on the body; the push lands after it returns, in the surface pass, by the motion's ApplyPointImpulse (or a deferred buffer), after an activate call. | HYPOTHESIS: a decompile (:674-676); the trace saw the velocity change in the NEXT row, consistent, but the impulse call site was not hooked | prop-physics.md:674-676, :678-681; re-havok-contact.md:53 | a hook on the surface pass's impulse call in prop-launch.js beside a walk leg, the body's velocity logged on return |
| E5 | The push's scale table beyond the clutter factor: zero unless 0 < mass < 95; the props layer 10 takes 3.0 under 47.5 mass else 0.1; layers 6 and 14 take 0.1; the impulse is shrunk so impulse/mass <= 1000; under kNoFriction the orientation controller may rewrite the vector. | HYPOTHESIS: a decompile (:670-673); only the clutter factor 2 has a trace (E3) | prop-physics.md:670-673; re-havok-contact.md:16, :56 | x-prop-static's cart wheel (an MSTT on another layer and mass) with the tracer on the host; a prop over 95 mass if the lab's cells hold one |
| E6 | A body standing INSIDE the player's capsule at a Havok step is shoved harder than a run-through (objectImpulse 23.4 at 0.09 m/s approach, the body to 8.5 m/s, 595 units a second) and leaves for hundreds of units. | CONFIRMED 20261031-190643 (the drop's copy at the menu's close, 2026-10-31); the same shape read in 021439 (19:30 PDT 2026-10-30, the console spawn at the host's feet) and 033116 (20:37 PDT 2026-10-30, pass v10c's premise) | prop-physics.md:696-698, :449-453, :561-564 | done; the lab rule stands: never spawn a prop in a capsule (:565-567) |
| E7 | The shove's extra impulse is a penetration term computed upstream of the interaction body (the proxy's recovery). | HYPOTHESIS (:697-698 "a penetration term, HYPOTHESIS") | prop-physics.md:697-698 | a trace of the proxy's integrate with a body placed in the capsule, the event's fields per manifold point; low value, the lab rule avoids the case |
| E8 | A Dynamic body set with allowActivate FALSE still takes a running player's contact (H-P1's "inert without the wake" refuted); push v9's silence was the body inside the standing host's capsule. | CONFIRMED 025647 (read 20:01 PDT 2026-10-30) | prop-physics.md:528-536, :454-456 | done; what allowActivate changes for a WALK's contact is unread (the wake is kept as the default, :535-536) |
| E9 | A walk-through (Caps Lock, DIK 58) nudges an IronIngot tens of units and it stops on lab-spawn's strip (the nudge bounds > 16 and < 200 held); a run-through kicks a basket hundreds of units and a round body rolls off the strip's west flank at 243 to 267 units a second. | CONFIRMED 20261101-014442 and 20261101-032302 (the nudge, 2026-11-01); 201426, 201809 (the roll, read 13:56 PDT 2026-10-31); 20261031-190643 (the roll's speed) | prop-physics.md:191, :704-707, :718-727, :689-692 | done for the ingot and the basket; the wheel is E22 |
| E10 | The client's "asleep" (500 ms under 0.25 units of stir) coincides with the engine's own deactivation (kNumInactiveFramesToDeactivate 5, the island leaving the active list) within one sample interval; "in the active list means awake". | HYPOTHESIS (:116; :348 "too short and a slowing body sleeps early, too long and the lease starts late") | prop-physics.md:116, :348; H/hkpMotion.h:23, :78-79; H/hkpSimulationIsland.h:41-42 | lab/frida/prop-sleep.js (written 2026-11-03, unrun) on the simulating seat: leg 1's is c2, leg 2's is c1; its sleep timeline read against the seat's "stream ... asleep" stamp |
| E11 | A paused world (an open menu) stirs nothing: the Havok step does not run under the InventoryMenu, so the stand-in reads asleep 500 ms into the menu and the first step after the close moves the body. | CONFIRMED 20261031-190643 (2026-10-31) | prop-physics.md:701-703 | done (the client holds the stir clock in menu mode, 967ba8c8) |
| E12 | The engine's grab on a resting DYNAMIC body holds it, the release drops it, Skyrim Platform's grabRelease fires at both, the dropped body falls, streams and settles. | CONFIRMED 221404 (read 16:43 PDT 2026-10-31) and 015841 (grab v9's cold rerun, 2026-11-01) | prop-physics.md:739, :191-192; LOG.md:4467-4470 | done at rest; the held body's motion under the hand (the spring) is unread |
| E13 | The grab's own conditions: the hold threshold, the weight limit (grabObjectWeight), the crosshair reference it takes, why a Dynamic body under D73 was once read as released at once (033439, later found Keyframed, E27). | HYPOTHESIS (:169 "the engine's hold threshold HYPOTHESIS"; :578-579 the grab's engine read owed) | prop-physics.md:169, :576-579 | lab/frida/prop-grab.js (written 2026-11-03, unrun; the ids by `just addr` in its header) on c2 beside x-prop-arbitration leg 3; the key press's stamp against StartGrabObject's is the threshold |
| E14 | The engine's grab is exclusive on its seat (one grabbedObject at a time; a second player's hand on the same body is only the server's Held answer). | HYPOTHESIS (:203-204) | prop-physics.md:203-204; P/PlayerCharacter.h:697 | the grab trace on BOTH seats with both players' E on one resting ingot in one leg |
| E15 | grabRelease fires on the holder's seat alone and never for a puppet's engine grab. | HYPOTHESIS (:428; the census's third row) | prop-physics.md:427-429; engine-unknowns-2026-11-03.md:24 | the grab trace on both seats (the non-holder's grabRelease silent during leg 3) |
| E16 | A held E whose grab takes no body fires an ordinary activation at its release: the pickup, the item into the inventory, the server deleting the 0xff copy on every seat within 20 ms. | CONFIRMED 20261031-024409 (the grep: "Sent activation" at 02:47:37.346, "Deleting 0xff item" at 38.003; 2026-10-30 PDT) and 202618 (read 13:56 PDT 2026-10-31) | prop-physics.md:505-508, :728-733; DECISIONS.md:3514-3521 | done (the engine's grammar: a long press is a grab, its failure a pickup) |
| E17 | A drop: the engine's own reference (DropObject) is deleted by the client and the server's copy stands in; created at the drop point (64 ahead, 48 up) the copy falls onto the ground, settles, and the dropper's stream follows the fall. | CONFIRMED 143937 (read 07:45 PDT 2026-10-30), 20261031-190643 (the creation path), 202154 (2026-10-31), 034316 (a MISC by the path falls 48 and settles, 20:51 PDT 2026-10-30) | prop-physics.md:377-379, :693-700, :711-712, :600-602 | done |
| E18 | A WEAP copy created at the dropper's feet z falls through the ground to about 150 units below on both seats alike (the strip and landscape); created at the drop point 48 up it rests on the strip. | CONFIRMED 022528, 030029, 033901 (19:33, 20:07 and 20:45 PDT 2026-10-30, the fall-through) and 202154 (2026-10-31, the rest) | prop-physics.md:471-475, :538-546, :585-598, :711-712 | done as a fact; the mechanism is E19 |
| E19 | A WEAP reference the view creates (placeAtMe disabled, setPosition, enable, Keyframed, then Dynamic) carries no working collision against the ground where a MISC's clutter shape works. | HYPOTHESIS (:591-593), superseded by E18's rest at 202154 (the fall-through followed the spawn point, not the weapon's shape) and never traced | prop-physics.md:591-598 | retire the row at the next doc pass, or the layer-and-motion read of the placed sword (:594-595) if a weapon ever falls through again |
| E20 | A shout's (or spell's) impulse moves a prop in the caster's game with no event the platform exposes; the cabbages moved 735 to 1400 units from the caster; which engine path carries the push (TESHavokUtilities::AddExplosionImpulse, ScaleGameplayImpulseForce, the projectile's hit) is unknown. | HYPOTHESIS: playtest 41's server log (E_PROP_REACH lines, no run id) is the only witness; ADR-064 decision 1 | prop-physics.md:761-763; T/TESHavokUtilities.h:14, :18 | x-prop-blast v1 and x-prop-arbitration leg 4 (the touch-3 grant, the positions); the path by a hook on AddExplosionImpulse (an RE task for the re-analyst, the id by `just addr`) |
| E21 | H-P4: setPosition on a Keyframed body leaves its Havok collision where it was, and a later Dynamic set resolves the mismatch violently (the flights of pass v9, v10b and push v11 on the old build); the engine's keyframed translate moves the collision with the node. | HYPOTHESIS (:521-522 "HYPOTHESIS H-P4", :533-535 "reinforced"); the fix's translate removed the placement flight (032724 "placed at its record (translated)", no flight) but E6's shove explains some flights and the mechanism was never traced | prop-physics.md:518-526, :528-536, :550-552 | a read of bhkRigidBody::GetPosition against TESObjectREFR::GetPosition after a setPosition on a Keyframed copy (B/bhkRigidBody.h:41, T/TESObjectREFR.h); low priority while nothing calls setPosition on a loaded body |
| E22 | A movable static (HandCart01Wheel, Skyrim.esm MSTT 0x1c0c3): the proxy controller's contact fires for its collision layer, and a walk shoves a cart wheel at all (the record's move over 4 units). | HYPOTHESIS (:269-271; x-prop-static by path 9ef40b22, unrun) | prop-physics.md:268-271; engine-unknowns-2026-11-03.md:24 | x-prop-static (lab/.cache/probes/x-prop-static.yaml) with prop-launch.js on the host |
| E23 | A prop never changes worldspace or interior by physics (the transform's cell is the sample's position in the record's world). | HYPOTHESIS (:206) | prop-physics.md:206 | a kick through a load door is not in any probe; a declared limit until one is |

### (b) A non-owner's engine

| # | Claim | Status | Source | Settles it |
| --- | --- | --- | --- | --- |
| E24 | A Keyframed copy takes the stream (translateTo over the clamped interval, setPosition beyond the snap threshold and at sleep) without falling or fighting it, and rests within 32 units of the owner's copy in x and y. | CONFIRMED 143937 (the watcher applying, the copies within 32; read 07:45 PDT 2026-10-30), 20261101-014442, 20261101-032302 (2026-11-01) | prop-physics.md:377-379, :191, :217-219 | done; a follower's copy while the owner's body ROLLS (201426, 201809: the follower "followed faithfully" out of the cell) is seen, not measured |
| E25 | A contact on a Keyframed copy IS delivered to the player's proxy controller (the production hook's claim went out) and the body does not move; the bump is swallowed until the grant lands (0.6 s later in the run), then the flip. | CONFIRMED 023534 (pass v9's rerun, read 19:42 PDT 2026-10-30; the follower Keyframed on dde874b5, pre-D73) | prop-physics.md:479-481, :508; DECISIONS.md:3514-3521 ("the walker's contact on a Keyframed body moved nothing, the grant came 0.6 s later") | done for the observable; the motion-type field on that seat is E26 |
| E26 | The motion type the hook reads on a non-owner's seat is 4 (kKeyframed), the value a filter would key on; FindCollidableRef is safe inside the callback. | HYPOTHESIS (:248-249: "slot 2 fires for a Keyframed body under the player's proxy controller, and FindCollidableRef is safe there"; the run's line was not quoted with its motion field, and prop-contact.js never ran on a non-owner) | prop-physics.md:248-249; re-havok-contact.md:13-14 | `just frida lab/frida/prop-contact.js c2` beside x-prop-arbitration leg 2 (c2's copy Keyframed under c1's live stream) |
| E27 | The surface pass skips motion types 4 and 5, so a Keyframed body takes no push and ObjectInteractionCallback never fires for it; the stand-in seat swallows the bump by construction. | HYPOTHESIS: a decompile (re-havok-contact.md:15-18; prop-physics.md:676-677); the observable half is E25 | re-havok-contact.md:15-18; prop-physics.md:676-677 | the same trace as E26: the interaction rows silent for the Keyframed copy while the contact rows fire |
| E28 | A Keyframed body cannot be grabbed: the engine's grab closes and releases in the same instant (grabRelease true and false together), and the E's release is a pickup (E16). | CONFIRMED 20261031-024409 (2026-10-30 PDT) and 202618 (read 13:56 PDT 2026-10-31; 033439's "Dynamic at the grab" was wrong, the body was still Keyframed, :731-733) | prop-physics.md:505-508, :728-733, :572-577; DECISIONS.md:3514-3521 | done |
| E29 | D73: a resting copy with no live stream, set Dynamic with leave to wake, takes a local kick and a grab at once, and the claim and the stream follow from the moved pose (the first touch has local physics). | CONFIRMED 220942 (pass v13) and 221404 (grab v9), read 16:43 PDT 2026-10-31; 015841 (2026-11-01) | prop-physics.md:739, :510-512; DECISIONS.md:3514-3521 | done at rest on the flat strip |
| E30 | The resting Dynamic copies settle alike on both seats (D73's accepted small divergence) for a box that slides. | CONFIRMED within the 32-unit claim at rest: 20261101-014442, 20261101-032302 (the ingot) | prop-physics.md:191, :514-515; DECISIONS.md:3514-3521 | the divergence's size is a read, not a claim; a round body at rest was never measured (it rolled, E9) |
| E31 | A grab on a MOVING Keyframed copy under a live stream is refused by the engine as it is at rest (E28), so A2's grab-over-touch is a race at rest and no velocity ever travels. | HYPOTHESIS: E28 was read on resting Keyframed bodies; no run put a hand on a copy mid-glide | prop-physics.md:56-58, :68-69 | x-prop-arbitration leg 2 extended: c2's E held on the ingot while c1's stream is live, the server's claims and c2's grabRelease read |
| E32 | A stalled stream (no asleep sample: the owner's client died mid-flight) leaves the non-owner's copy standing where the last sample put it, Keyframed until D73's second passes, then Dynamic; whether it then stands or settles is unknown. | HYPOTHESIS (:70-71 A7's known limit) | prop-physics.md:70-71, :510-512 | a leg with the owner's seat relaunched mid-flight, the copy's position on the other seat read at 1, 2 and 4 s |

### (c) A seat that loads the prop late

| # | Claim | Status | Source | Settles it |
| --- | --- | --- | --- | --- |
| E33 | The create word (CreateActor) carries the transform the copy appears at: a game-file item's record pose, a 0xff copy's creation point; a server move of the copy before any sample does not reach the seat (the 64-ahead SetPos after PlaceAtMe never arrived). | CONFIRMED 20261031-190643 (the dropped copy at the dropper's own position on both seats, 2026-10-31); the game-file item's pose from the message is the fix read at 143032 (07:40 PDT 2026-10-30: "placed at its record" on both seats) | prop-physics.md:693-700, :360-363; LOG.md:3459-3461 | done (the server creates at the final spot since 967ba8c8) |
| E34 | A game-file item arrives on a seat with no FormView (skipFormViewCreation) and is set Keyframed by the client (dealWithRef); the prop service turns it Dynamic with leave to wake after a 1 s grace when no stream is live (D73); the engine's settle under that set moves the item less than the 2-unit dead band, so a resting cell makes no records. | HYPOTHESIS: the settle-under-dead-band line (:365-366) cites no run; consistent with 143032 and 145427 ("tracked both tankards Dynamic throughout", no flight reported), unmeasured | prop-physics.md:356-358, :364-366, :225-226, :17-18; LOG.md:3459-3461, :3495-3497 | the owner's "stream ... started" count over a minute of standing in a resting cell (zero expected), in any two-seat leg's premise |
| E35 | A seat subscribing while another seat's row is live hears the PropOwner word right after the create word, and its copy goes Keyframed under the live stream before its engine has simulated anything. | HYPOTHESIS for the engine: proved at T0 only (PropTest "the late listener's word"), no run with a seat arriving mid-stream | prop-physics.md:311-313, :322-323 | x-prop-arbitration v2's role swap (a restart with c2 connecting first, the probe's header) or a leg with c2 reconnecting during c1's stream |
| E36 | After a server restart the record's rest returns on both screens at the load: the reconnecting seat hears the create word, tracks the copy ("51 units off", its distance to the player) and simulates it Dynamic at rest; every prop is asleep by construction and the host's default. | CONFIRMED 20261101-014442 (2026-11-01, the restart leg; the red before D75 at 220439 and 221908 was the save loader's skip, not the engine) | prop-physics.md:751-754, :316-317, :737-747 | done for the host's reconnect; a non-host's reconnect into a resting prop is the same path by code, not run |
| E37 | A copy whose record sits inside a player's capsule at its first placement (a login into clutter where a player stands) re-creates an overlap and the Dynamic set shoves it (E6). | HYPOTHESIS (:568-570, a follow-up; E6 read on a console spawn and a drop, never on a login) | prop-physics.md:568-570 | a relaunch of one seat standing on the ingot's rest, the ingot's position on both seats after its login |
| E38 | The engine reuses the deleted drop's form id for the copy's placeAtMe. | HYPOTHESIS (:386-387 "harmless") | prop-physics.md:386-387 | the deleted id against the create word's in any drop run's logs; no probe needed, a read of an existing run |

Counts: 17 CONFIRMED (E1, E3, E6, E8, E9, E11, E12, E16, E17, E18, E24, E25, E28, E29, E30, E33, E36), 21 HYPOTHESIS (E2, E4, E5,
E7, E10, E13, E14, E15, E19, E20, E21, E22, E23, E26, E27, E31, E32, E34, E35, E37, E38). Player-visible rows (what a seat sees
on its screen): E3, E6, E9, E11, E12, E16, E17, E18, E24, E25, E28, E29, E30, E33, E36 are CONFIRMED on the viewpoint the run
read; E20, E22, E31, E32, E34, E35, E37 are not. No CONFIRMED row above was read on BOTH viewpoints by a trace: every trace ran on
the host, and the non-owner's rows rest on the production hook's lines and the listings.

## 3. What the arbitration rule relies on

The rule is prop-physics.md:53-71 (A1 to A7; R0 for the word, R2 for the transform). For each row, the engine claims it rests on
and their status; a rule row standing on a HYPOTHESIS is a rule the lab has not yet earned.

| Rule | What it says | Rests on | Status of what it rests on |
| --- | --- | --- | --- |
| A1 (:53-55) | One owner, by the word alone; a seat simulates while the word names it or names nobody and it hosts the cell; the lease mirror, the silence test and the presence test go. | E24 (a non-owner's copy glides under the stream), E29 (a resting copy is Dynamic locally), E32 (a stalled copy's fate when no word comes) | E24 CONFIRMED, E29 CONFIRMED, E32 HYPOTHESIS |
| A2 (:56-58) | A grab beats a touch; nothing beats a grab; a grab claim on another seat's live, ungrabbed row is granted because "a Keyframed copy cannot be grabbed, so the case is a race at rest". | E28 (Keyframed cannot be grabbed), E12 (a resting Dynamic body is held), E31 (the moving Keyframed case is the same refusal), E14 (the grab is exclusive on its seat), E15 (grabRelease on the holder alone), E13 (the grab's conditions) | E28 CONFIRMED, E12 CONFIRMED; E31, E14, E15, E13 HYPOTHESIS |
| A3 (:59-61) | A non-owner's contact never takes a moving prop: a claim on a row another seat streams awake (last accepted sample younger than PROP_MOVING_MS 1000, UNMEASURED) is refused E_PROP_MOVING; a resting or stalled row is anyone's. | E25 (the contact is delivered on the Keyframed copy and moves nothing), E26 and E27 (the hook's motion value and the skipped push on that seat), E10 (the stir-test asleep against the engine's sleep: the "moving" window is sized against the stream's cadence, and a creeping body under 2 units per 100 ms sends every 2 units), E9 (how far and fast a kick travels) | E25 CONFIRMED, E9 CONFIRMED; E26, E27, E10 HYPOTHESIS; PROP_MOVING_MS UNMEASURED |
| A4 (:62-65) | Ownership returns to the host only at rest on the owner's screen, by the owner's own final (asleep) sample, and the return is a word; the timers retire; the 120 s grab cap stays. | E10 (the asleep sample marks the engine's rest), E11 (a paused menu stirs nothing, so the asleep send waits), E30 (the copies rest alike), E36 (a restart's rest), E12 (the release's fall sleeps) | E11, E30, E36, E12 CONFIRMED; E10 HYPOTHESIS |
| A5 (:66-67) | A refused sample is answered with the current word, once per prop per second. | No engine claim: the server's own behaviour and the client's mirror | none |
| A6 (:68-69) | The hand-over of a MOVING prop happens by a grab alone, so no velocity travels; a resting prop's hand-over starts at rest; the first bump on a Keyframed copy is swallowed until the grant lands. | E31 (a hand on a moving Keyframed copy), E25 (the swallowed bump), E29 (the resting hand-over acts locally at once) | E25 CONFIRMED, E29 CONFIRMED; E31 HYPOTHESIS |
| A7 (:70-71) | A stream that stops without an asleep sample re-syncs at the next touch (A3's stalled case); a tick sweep if the lab shows stalls. | E32 (what the stalled copy does), E29 (the next touch acts on a Dynamic resting copy) | E29 CONFIRMED; E32 HYPOTHESIS |

The three the rule most depends on and still HYPOTHESIS: E10 (A3's moving window and A4's return both key on the client's
500 ms stir test standing in for the engine's deactivation, never read against it); E31 (A2 and A6 assume a hand on a moving
Keyframed copy fails as it does at rest, never run); E14 with E15 (A2's "nothing beats a grab" assumes the engine holds one
object per seat and reports the release on the holder's seat alone, never traced). E26 and E27 are the fourth: the non-owner's
hook filter and the swallowed push rest on a decompile and one run's claim line.

## 4. Open reads

The Frida plan rows and the probe legs that settle them. Every trace below runs by `just frida <script> <client>` (lab-api's
/frida; the lab's clock and process pitfalls in memory: align on the ready stamp, read the ready row's pid). No read here
invents an id: scripts that need a new function (the grab, the explosion impulse) get their ids by `just addr` when written.

| Read | State | Settles | How |
| --- | --- | --- | --- |
| lab/frida/prop-contact.js (slot 2 and the interaction body on both seats while a player walks into a prop twice; the Dynamic plan at prop-physics.md:173-178) | Written 15:38 PDT 2026-10-29 (LOG.md:3026), NEVER RUN on its own (engine-unknowns-2026-11-03.md:24); its hooks ride in prop-launch.js, which ran on the HOST alone | E2 (with a thread field added), E26, E27 | armed on c2 beside x-prop-arbitration leg 2 (c1 kicks the resting ingot north into c2; c2's engine sees the moving copy's contact under c1's live stream): expected on c2 a slot-2 row with motion 4 and no interaction row |
| lab/frida/prop-launch.js (the contact rows plus the body's type, position, velocity, inverse mass at each contact and push) | RAN on the host: 20261031-181848 (the interaction read wrong, args read as the body, prop-physics.md:653-654) and 20261031-190643 (fixed, :683-707) | settled E1, E3, E6, E11; left E4, E5, E7 | E4 and E5 with x-prop-static's wheel (another layer and mass) on the host; E7 is low value while the lab never spawns in a capsule |
| The grab read: StartGrabObject and EndGrabObject (P/PlayerCharacter.h:570, :553) with grabbedObject and grabObjectWeight (:697-698) on the grabber, and on both seats for the exclusivity | WRITTEN 2026-11-03 as lab/frida/prop-grab.js (StartGrabObject 40552 enter and leave, DestroyMouseSprings 40557 as the release since EndGrabObject is inline, the runtime-data grab fields at the newer layout's offsets, a 250 ms poll of the hold as a timeline on each seat), NEVER RAN (prop-physics.md:578-579, :427-429; the census's "the grab read never ran") | E13, E14, E15, E31 | beside x-prop-arbitration leg 3 (c2's pitch sweep, E held 1.5 s at each; "c1's walk-in Held" is the server's answer, the trace reads the hands); E31 in leg 2 extended with c2's E on the moving ingot |
| The sleep read: deactivationNumInactiveFrames (H/hkpMotion.h:79) and the island's activeMark (H/hkpSimulationIsland.h:42) at each sample send | WRITTEN 2026-11-03 as lab/frida/prop-sleep.js (the bodies the player's capsule touches watched from prop-contact.js's two hooks, a 100 ms poll of each body's motion type, speed, deactivationIntegrateCounter, deactivationNumInactiveFrames and the island's isInActiveIslandsArray and activeMark bits, emitted on change; the timeline is set beside the seat's "stream ... asleep" stamp), NEVER RAN | E10 (and with it PROP_MOVING_MS's sizing, A3 and A4) | one more field block in prop-launch.js at the body's row, read against the owner's "stream ... asleep" stamp in leg 1 (c2's push and rest) |
| The impulse read: a shout's push on a prop | NOT DESIGNED; x-prop-blast v1 by path (lab/.cache/probes/x-prop-blast.yaml), unrun | E20 | x-prop-blast v1 and x-prop-arbitration leg 4 (c2's Unrelenting Force at the resting ingot: the touch-3 grant, no E_PROP_STEP, the positions within 32) read the player-visible half; the engine path needs the re-analyst's read of AddExplosionImpulse's callers (T/TESHavokUtilities.h:14) before any hook |
| x-prop-static (lab/.cache/probes/x-prop-static.yaml, 9ef40b22) | By path, unrun | E22 (and E5 with the tracer) | the host walks through Riverwood's cart wheel; the record's move over 4 units; the tracer's rows name the wheel's layer and mass |
| x-prop-arbitration v4 (lab/.cache/probes/x-prop-arbitration.yaml; a READ by rule 8, the premises are what the next version adjusts) | By path, unrun; the build it reads is fork m4-prop-arbitration 14ad24e3 (round three, pipeline 4811), not on any seat | the player-visible rows on two seats: E24, E25's observable, E29, E30 (legs 1 to 3), E20's observable (leg 4); the rule's own lines (A1 to A4, A6) | its artifacts are server.log, c1.log, c2.log, screenshots and, since v4, the grab tracer's frida/ output on both seats (prop-grab.js armed at the relaunch steps), so it settles positions, owner lines, refusal counts and the hold's timeline, never a motion type; the contact tracer rides beside it in its own run |
| The stalled stream (A7) | NOT IN ANY PROBE | E32 | a v2 leg: the owner's seat relaunched mid-flight, the copy's position on the other seat at 1, 2 and 4 s, the next touch's claim |
| The late listener's word | T0 only (PropTest's fourth case, prop-physics.md:322-323) | E35 | x-prop-arbitration v2's role swap, or a reconnect of c2 during c1's stream |
| The reference trace (ADR-031's recorder; the plan's W1 says the system doc's rows come from it) | lab/references/prop-push.json named at prop-physics.md:182, NEVER RECORDED (lab/references/ holds none) | the solo baseline every two-seat trace is read against | b-prop-push under the recorder at the next physics stage; its rows are added here as the owner's reference |
| H-P4 (E21) | HYPOTHESIS since 20:00 PDT 2026-10-30 | E21 | low priority: nothing calls setPosition on a loaded body since fa225f01; a read of the body's position against the node's if that changes |

Reads this doc retires rather than runs: E19 (superseded by 202154's rest), E7 (the lab rule avoids the case), E38 (a read of
existing logs). Reads the lab cannot take are none here; nothing goes to Eli's T4 by rule 8 for this system.

## 5. Thaw condition

The system thaws when every player-visible claim in this doc is CONFIRMED on both viewpoints (the plan's words, W1: "A frozen
system thaws when every player-visible claim in its doc is CONFIRMED on both viewpoints"; ADR-064 decision 7 adds "and a
two-player test covers the change"). Today no row is confirmed on both viewpoints by a trace, seven player-visible rows are
HYPOTHESIS (E20, E22, E31, E32, E34, E35, E37), and the arbitration rule stands on E10, E31, E14 and E15 unread. The order that
earns the thaw cheapest: prop-contact.js on c2 and the sleep fields on c1 beside x-prop-arbitration legs 1 and 2 (E2, E10, E26,
E27), the grab trace beside leg 3 (E13, E14, E15, E31), x-prop-blast and leg 4 (E20), then the v2 legs (E32, E35, E37) and
x-prop-static (E22). The verb doc's Engine surface cites these E-numbers from the next pass on; its HYPOTHESIS tags at :116,
:169, :206, :248-249, :269-271, :386-387, :428, :521-522, :591-593, :697-698 and :719-720 map to E10, E13, E23, E2 and E26,
E22, E38, E15, E21, E19, E7 and E9 (E9 settled by 014442 and 032302; the tag at :719-720 can clear).
