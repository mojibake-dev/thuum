# M3 puppet locomotion: where the graph's Speed and Direction come from (static RE)

Status: static analysis by the re-analyst, 2026-10-22, for docs/verbs/npc-puppet.md
after x-npc-legs 20261022-190831 (fork m3-train-32). Program:
SkyrimSE-1.6.1170.0.exe.unpacked.exe, read through REA 6.7.0 over Ghidra 12.1.4
on sky-re (every answer "observed", authority "shipped-artifact"), raw listings
through pyghidra-mcp's named project where REA lists no procedure. Every Address
Library id below was resolved with `just addr <id>` or reverse-mapped from an RVA
through lab/addr.py's loader (exact matches only); the id is the answer, RVAs are
supporting data. CommonLibSSE-NG citations are the submodule at b93280e8. Rule 2:
CONFIRMED-STATIC means "the instruction or decompiled line is in the binary as
read"; every claim about game behavior is HYPOTHESIS until the Frida plan runs.
Actor layout on 1.6.1170 as in re-ai-puppet.md:15-18 (currentProcess +0xF8,
ActorState +0xC0, graph holder +0x38, IPostAnimationChannelUpdateFunctor +0xE0).

## Summary

1. The graph's Speed, Direction and TurnDelta are not variables the engine sets
   by name each frame. They are animation graph data channels the Actor registers
   once (Actor::CreateAnimationChannels, 37984) and BSAnimationGraphManager polls at
   every graph tick, inside 41453's tick, before the graph steps: Speed reads
   MiddleHighProcessData::currentMovementSpeed (+0x2A8), Direction reads
   MiddleHighProcessData +0xB8 (CommonLib's `rotation.z`), TurnDelta reads
   MiddleHighProcessData::rotationSpeed.z (+0xC4). CONFIRMED-STATIC.
2. Those three fields are written by the movement step 37356 (the controller's
   output and the feedback tail 0x11D/0x11E, 37993/37994). With 37356 skipped the
   fields stay 0, the channel push overwrites any Papyrus write of "Speed" or
   "Direction" at the next tick, and the graph settles to idle: the measured bug.
3. The Speed and Direction channels raise the engine's own moveStart, moveStop and
   moveForward/Backward/Left/Right actions on threshold crossings, performed in the
   same tick. Feed the two fields and the events come with them (HYPOTHESIS).
4. Fix (two floats per frame in the Move detour): currentMovementSpeed = s and
   rotation.z = d in radians, clockwise from the facing. No flag beyond them.

## Q1: the per-frame writers and readers (function and field table)

| what | id (AE 1.6.1170) | CommonLib | reads or writes | tag |
| --- | --- | --- | --- | --- |
| Actor::CreateAnimationChannels, IAnimationGraphManagerHolder slot 0x0A | 37984 | IAnimationGraphManagerHolder.h:34; Actor holder sub-vtable 207517 slot 0x0A read | registers 12 channels, in order: Speed (FixedStrings +0x508, FixedStrings.h:179), "TargetSpeed", "Pitch", "Roll", Direction (+0x518, :181), TurnDelta (+0x510, :180), "PitchDelta", weaponSpeedMult (+0x368, :127, initial 1.0), leftWeaponSpeedMult (+0x370, :128), "iWantBlock", "bHeadTracking", "TimeDelta"; vtables 207549 to 207571 (Offsets_VTABLE.h:2147-2158, RTTI Offsets_RTTI.h:2425-2447) | CONFIRMED-STATIC |
| channel layout | | BSTAnimationGraphDataChannel.h:7-12; BSAnimationGraphChannel.h:13-22 | vtable +0, refcount +8, channelName +0x10, value +0x18, Channel<T,Val> state +0x20 (Speed, Direction, TurnDelta: two floats {last, divisor} and the Actor* at +0x28; the others: Actor* at +0x20) | CONFIRMED-STATIC |
| Speed poll (vtable 207549 slot 1) and its update | 38330, 42767 | BSAnimationGraphChannel.h:16 PollChannelUpdateImpl(bool) | value = 37957(actor) / state.divisor; 37957 = currentProcess->middleHigh->+0x2A8 (AIProcess.h:196; MiddleHighProcessData.h:197 currentMovementSpeed); divisor set to 1.0 by 42766 at construction (HYPOTHESIS: never changed). When the poll flag holds: last < 5.0 and new >= 5.0 queues DEFAULT_OBJECT 0x61 kActionMoveStart; >= 5.0 to < 5.0 queues 0x62 kActionMoveStop unless gate 39561 (HighProcessData +0x46E byte) holds (BGSDefaultObjectManager.h:110-111). Gate 39559 (+0x46D byte) makes the poll return the last value unchanged. | CONFIRMED-STATIC |
| Direction poll and update | 38325, 42777 | Actor.h:555, Actor.cpp:527-532 (37960) | value = Actor::GetMoveDirectionRelativeToFacing() = middleHigh->+0xB8 (inside CommonLib's `rotation` NiPoint3 at 0xB0, MiddleHighProcessData.h:138; the name does not fit a scalar direction), wrapped into [0, 2 pi) and divided by 2 pi: turns. Quadrant changes queue 0x66 kActionMoveForward ([0,0.25) or [0.75,1)) else 0x67 Backward, and 0x69 kActionMoveRight ((0,0.5]) else 0x68 Left (:112-118). | CONFIRMED-STATIC |
| TurnDelta poll and update | 38333, 42773 | ActorState.h:147 slot 06 DoGetRotationSpeed; IMovementState.h:22 | value = -DoGetRotationSpeed() * 57.2958 degrees per second; Actor's override (38021, vtable 207523 slot 6) tail-jumps 39883 = middleHigh->+0xC4 (rotationSpeed.z, MiddleHighProcessData.h:139). Crossing 1 degree queues 0x63/0x64 TurnRight/TurnLeft or 0x65 TurnStop. | CONFIRMED-STATIC |
| TargetSpeed, TimeDelta polls | 38331 (42769), 38332 (42783) | | TargetSpeed = 37959 = middleHigh->+0x2AC (unk2AC, :198); TimeDelta = GetSecondsSinceLastFrame times the VATS multiplier (44302 outside the player, compared with global 401069). Writer of +0x2AC not found among 37356's setters (HYPOTHESIS: the movement controller). | CONFIRMED-STATIC for the reads |
| the feedback writer: Actor slot 0x11E UpdateFeedbackGraphSpeedAndDirection | 37994 | Actor.h:484; Actor.cpp:1928-1931 | out->speed (+0) through 39873 into middleHigh->+0x2A8, out->direction (+4) through 39878 into +0xB8. Callers: 37356's tail only. 37356 itself also calls 39873, 39878 and the setters 39880 (+0xB0), 39882 (+0xB4), 39886 (+0xBC), 39884 (+0xC4). | CONFIRMED-STATIC |
| the feedback computation: slot 0x11D | 37993 (0x14069eaf0, no Ghidra function) | Actor.h:483 | tail-jumps 39551 when currentProcess and global byte 381303 hold: speed = |translation| / delta (units per second); direction = heading(translation) minus the actor's heading, in radians, rate-limited through a settle timer at HighProcessData +0xD0 (HighProcessData.h:206) against thresholds 381390, 381393, 381396, 381399 (HYPOTHESIS: game settings). | CONFIRMED-STATIC for the formula shape, HYPOTHESIS for the data block's fields |
| other writers of +0x2A8 / +0xB8 | 42375, 42374 | | call 39873 / 39878; no incoming references but .pdata: unreferenced (HYPOTHESIS: dead). No other caller of the setters. | CONFIRMED-STATIC |
| the tick: UpdateAnimationGraphManager and BSAnimationGraphManager's update | 32899, 63358 | IAnimationGraphManagerHolder.cpp:65-70; BSAnimationGraphManager.h:119-123, :99 (updateLock 0xA0) | under updateLock: for each boundChannel (+0x10) PollChannelUpdateImpl(not in bumpedChannels +0x28); then per graph 63590 writes every channel's value into the graph's variable array by name hash (graph +0x200 table +0x98, mask +0x7C; values at (graph+0x208)->+0xD8->+0x10); then updateData->updateFunctor->slot 1; then per graph 63587 (the step, delta from BSAnimationUpdateData +0, BSAnimationUpdateData.h:13); then event propagation and pose generation. | CONFIRMED-STATIC |
| Actor::ModifyAnimationUpdateData, slot 0x79 | 38054 | Actor.h:322; BSAnimationUpdateData.h:13-27 | fills refr (+0x10), a callback (+8), optionalEyePosition from the world root camera (+0x18), updateFunctor = actor+0xE0 (+0x20; Actor.h:760-766), the flags; writes no movement value. | CONFIRMED-STATIC |
| the post-channel functor, IPostAnimationChannelUpdateFunctor slot 1 | 38053 | IPostAnimationChannelUpdateFunctor.h:13; vtable 207529 slot 1 read | (process, actor) into 39299: drains HighProcessData +0x400 (unk400, HighProcessData.h:325; filled by 39298 from the three channel updates), building a TESActionData(2, actor, defaultObject) per index and running TESActionData::Process (41557), then zeroes the count at +0x410. | CONFIRMED-STATIC for the body; the action's effect (graph event moveStart etc.) HYPOTHESIS from cast-action's read of 41557 |
| 37364 before the tick | 37364 | | pushes the actor's scale and rotation (the 3D node's or the data angles) into each graph (FUN_140bc3240 on graph+0xC0): the root transform, not a locomotion input. | CONFIRMED-STATIC |
| Papyrus ObjectReference.SetAnimationVariableFloat | 56227 (registered by 56246, string 218713) | IAnimationGraphManagerHolder.h:52; .cpp:51-56 (32887) | direct call, no TaskQueue: 32887 -> 32933 -> per graph 63608 writes the same variable array (63851 returns (graph+0x208)->+0xD8). "cannot find variable named %s" otherwise. | CONFIRMED-STATIC |
| Papyrus GetAnimationVariableFloat path | 38052 | IAnimationGraphManagerHolder.h:40 | reads through the AIProcess animation variable cache (MiddleHighProcessData.h:162; BSAnimationGraphManager.h:34-56, pointers into the live values): the watch's zeros were real. | CONFIRMED-STATIC |

Not channels and not FixedStrings: bInMoveState, SpeedDamped, bMotionDriven, iState
(REA search_strings, literal, zero defined strings; FixedStrings.h has no entry).
HYPOTHESIS: graph-internal, computed by the behavior graph from Speed, Direction and
the move and turn events. SpeedSampled is a FixedStrings name (:182) with one user
that also takes FixedStrings::GetSingleton (44030, callers 44028 and 44040), not
read here; HYPOTHESIS: a sampler on the host side of the graph, not an input.

## Q2: the write set for an actor whose movement step does not run

Required, two floats on MiddleHighProcessData through CommonLib names
(AIProcess.h:196 `middleHigh`; Actor.h:651 `currentProcess`):

1. `currentMovementSpeed` (+0x2A8, MiddleHighProcessData.h:197) = s in game units
   per second (the engine's own value is |translation| / delta, 39551; the Speed
   channel divides by 1.0). The 5.0 threshold is the engine's moveStart/moveStop.
2. `rotation.z` (+0xB8, :138) = d in radians, clockwise positive, 0 = forward:
   the Direction channel wraps into [0, 2 pi) and divides by 2 pi, so 0.25 turn
   (pi/2) is "right" (kActionMoveRight) and 0.75 is "left". The client's
   `m.direction / 360` (movementApply.ts:92 on m3-train-32) is the same convention
   in turns (HYPOTHESIS that skymp's direction is clockwise degrees from facing).

Optional, same struct: `rotationSpeed.z` (+0xC4, :139) = minus the relayed
heading rate in radians per second (the TurnDelta channel negates and converts to
degrees); 0 means no turn animations from the channel. `unk2AC` (+0x2AC, :198) =
s for TargetSpeed (HYPOTHESIS that the graph uses it; harmless).

Gait: no engine field. HYPOTHESIS: the graph blends walk and run from Speed alone
against the race's movement type speeds (HighProcessData::currentMovementType,
HighProcessData.h:213, Movement::TypeData, Movement.h:41-50); the ActorState1
walking/running bits (ActorState.h:106-107) feed engine readers (Actor::IsRunning,
37234), not the graph. Falsifier: a live NPC whose Speed reads a run value while
its graph plays a walk (probe F6).

Frame ordering argument: the movement stage 39053 (41306 -> 41444 -> 37350 ->
37356) runs before the animation stage 39054 (41370 -> 41453 -> 37364, 20121,
20122, 20123 -> 38054 -> 32899 -> 63358: poll, push, functor, step) in the stage
table (re-ai-puppet.md:57-65; HYPOTHESIS that table order is run order, probe
F5). Between a write at 37356's slot and the poll, the only call-graph writers of
+0x2A8 and +0xB8 are 37356 itself (skipped for the puppet), 37994 (called from
37356's tail only) and the unreferenced 42375/42374; the AI update 37347 and the
planner are gated off for puppets. So a per-frame write in the Move detour reaches
the same frame's graph tick. HYPOTHESIS: no inline store elsewhere (a struct-field
write cannot be enumerated statically here; probe F1 reads the fields at 20123).

## Q3: input flags

None beyond the two fields. bIsSynced, bSpeedSynced (FixedStrings.h:193-194) and
bAnimationDriven, bAllowRotation (:191-192) are read by 37356 and 37355, graph to
engine, never written per frame by the engine (CONFIRMED-STATIC for the reads;
HYPOTHESIS for "never written"). IsNPC (:108), iSyncIdleLocomotion (:116) and
iSyncForwardState (:189) exist as names; their writers were not traced (HYPOTHESIS:
graph load and synced-animation code, untouched by locomotion). The AIProcess move
state is the Speed channel's threshold logic itself: with s fed, the puppet's own
moveStart/moveStop/turn/direction actions are queued (39298) and performed (39299,
41557) in the same tick. Consequence (HYPOTHESIS): the relayed moveStart and
moveStop (animation.ts:366-379) become duplicates; a relayed moveStop landing while
the fed speed stays at or above 5.0 leaves the graph idle until the next crossing.
Drop them for puppets, or zero s on moveStop. Gate 39559 (HighProcessData +0x46D)
holds every channel at its last value and 39561 (+0x46E) suppresses moveStop:
HYPOTHESIS "animation paused" style bytes; probe F2 reads them.

## Q4: why the Papyrus writes never showed

SetAnimationVariableFloat (56227) writes the hkb variable array directly from the
VM thread (32887 -> 32933 -> 63608). The next graph tick polls the Speed channel
(38330, recomputed from +0x2A8 even when the channel is "bumped": the poll flag
only gates the events and the state store) and 63590 writes the channel value into
the same array slot before the step 63587. The Papyrus value therefore lives for
less than one frame; a 130 ms write cadence is overwritten within one tick and a
250 ms sample never sees it. SetGraphVariable does not touch bumpedChannels
(+0x28), so no "external write wins" path exists. CONFIRMED-STATIC for both writers
hitting one array; the timing is HYPOTHESIS (probe F4).

## Frida plan (module base plus `just addr`; filter rcx->formID at +0x14, TESForm.h:354)

Scenario: x-npc-legs as run (c1 hosts, c2 watches puppet 0x13483 for a minute, 250 ms
samples), one baseline run and one run with the detour's write.

- F1 (the write survives): hook 20123 entry (rcx Actor*): read floats at
  [[rcx+0xF8]+8]+0x2A8 and +0xB8. Expect the detour's s and d every frame on the
  fixed build, 0 on the baseline. Falsifier: stale or zero values with the write
  on (another writer, or the order in F5).
- F2 (the channel): hook 38330 entry and return (rcx channel; Actor* at [rcx+0x28];
  dl the poll flag; [rcx+0x18] the value on return) and 39298 (rdx -> the
  DEFAULT_OBJECT index). Expect value = s and one 0x61 at the first crossing above
  5.0, one 0x62 when the relay stops; read [high+0x46D] and [high+0x46E].
  Falsifier: a poll flag of 0 for the puppet (then the events never fire).
- F3 (the actions): hook 39299 (rcx process, rdx actor) and 41557; expect one drain
  per tick and the queued indices performed; the watch's bAnimationDriven, iState,
  bInMoveState, SpeedSampled turn nonzero within one sample after s >= 5.
- F4 (the overwrite): on the baseline, hook 56227 (value in xmm3 or the fifth
  argument) and 63590; expect each Papyrus write followed by a 63590 before the
  next sample. Falsifier: 63590 absent for the puppet while 20123 runs.
- F5 (the order): timestamps of 37356 (or its replacement) and 41453 for the puppet
  in one frame; expect movement before animation every frame.
- F6 (gait calibration, host seat): on an AI-on NPC, read +0x2A8 and +0x2AC while
  it walks and runs, beside Actor::GetWalkSpeed/GetRunSpeed (Actor.h:433-436);
  expect Speed near those values and TargetSpeed equal or leading.
- Falsifiers for the whole model: 38330 reading another field on this build; a
  Speed value that differs from +0x2A8 by a factor (the divisor changed); the
  graph still idle with F1 and F2 green (then the graph wants an input not found
  here, start with the Direction wrap and IsNPC).

## Implementation sketch (Skyrim Platform, PuppetHooks.cpp MovementStepReplacement)

Order inside the detour for a flagged puppet, after the existing controller and
cell checks and the `actor->Move(delta, zero)` that stamps the character
controller (R1 in the verb doc): take the puppet's latest relayed sample (a new
field of the Puppets registry, written by a `setPuppetLocomotion(formId, speed,
directionDeg, turnRateDeg)` export beside setPuppet; the TS side stops its two
setAnimationVariableFloat calls at movementApply.ts:91-92 and passes the sample
instead), then with `auto* mh = actor->GetActorRuntimeData().currentProcess->middleHigh`
(AIProcess.h:196) when non-null:

```
mh->currentMovementSpeed = sample.speed;                       // +0x2A8, MiddleHighProcessData.h:197
mh->rotation.z = WrapTwoPi(sample.directionDeg * kDegToRad);   // +0xB8, :138 (the engine's move direction feedback)
mh->rotationSpeed.z = -sample.turnRateDeg * kDegToRad;         // +0xC4, :139 (TurnDelta's source; 0 when unknown)
mh->unk2AC = sample.speed;                                     // +0x2AC, :198 (TargetSpeed; HYPOTHESIS)
```

Alternative with one engine call instead of the first two stores:
`actor->UpdateFeedbackGraphSpeedAndDirection(out)` (Actor.h:484, slot 0x11E,
37994) with `struct { float speed; float direction; }` reinterpreted as the
incomplete ActorMotionFeedbackOutput (Actor.h:49): it performs exactly the two
stores through 39873 and 39878. Write every frame (the detour runs per frame per
high actor); interpolate between 130 ms samples if the walk stutters. Expected
visible effect (HYPOTHESIS): the puppet walks with the engine's own moveStart and
direction events, and the relayed moveStart/moveStop can be dropped for puppets.

## Ghidra changes (named project, saved)

Renamed on vtable proof: Actor_CreateAnimationChannels_v0A (37984),
Actor_ModifyAnimationUpdateData_v79 (38054), Actor_GetGraphVariableImpl1_v10
(38052), Actor_GetMoveDirectionRelativeToFacing_37960, and the three polls
ActorSpeedChannel_, ActorDirectionChannel_, ActorTurnDeltaChannel_PollChannelUpdateImpl
(38330, 38325, 38333). Plate comments tagged HYPOTHESIS on 39298 and 39299. Not
functions in Ghidra: 37993, 38021, 38028, 38053 (listings read raw, left alone).

## Open

- The writer of +0x2AC (TargetSpeed) and whether the graph reads TargetSpeed.
- The meaning of HighProcessData +0x46D and +0x46E (the channel gates).
- Who writes iSyncIdleLocomotion, iSyncForwardState and IsNPC, and when.
- Whether the client's Movement.speed and direction are in the engine's units and
  sign (probe F6 against the host's +0x2A8 and +0xB8).
