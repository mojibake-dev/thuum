# RE: a puppet's head tracking and lip sync under a disabled AI (2026-10-28, 14:18 PDT)

The re-analyst's read for playtest 37 (pyghidra on SkyrimSE 1.6.1170, every Address Library ID a reverse lookup in
addrlib/versionlib-1-6-1170-0.bin; REA was disconnected). Every engine name beyond CommonLib's is HYPOTHESIS until a
Frida trace or the probe confirms it. Eli's order: "do the probe first before any more head builds."

## What the engine does

Head tracking is applied by CommonLib's `Actor::ProcessTracking` (vtable slot 0x122, include/RE/A/Actor.h:488, ID 38009).
It reads the head-track targets that `HighProcessData::SetHeadtrackTarget` (39783, HighProcessData.h:178-183, the fields at
:217-218) and the Papyrus `SetLookAt` (54754) wrote, picks the highest set type through `AIProcess::GetHeadtrackTarget`
(39484, src/RE/A/AIProcess.cpp:60; kProcedure beats kDialogue, kCombat, kScript, kAction, kDefault, HighProcessData.h:80-92),
and ends in `AIProcess::SetHeadtrackTarget` (39887, AIProcess.cpp:233), which sets MiddleHighProcessData+0x326 and writes the
position into every behavior graph as the vector variable `TargetLocation` (FixedStrings.h:164) through 32934 and 63610. The
graph bool `bHeadTracking` is a data channel (vtable 207569, Offsets_VTABLE.h:2157; functor 42782 to 37964) that publishes
exactly that +0x326 byte, so the BSLookAtModifier only turns bones while ProcessTracking keeps succeeding. ProcessTracking
never reads kProcessMe.

The gate is indirect. For NPCs the only path to slot 0x122 is the animation job 41453 (which the fork's hook 2a already
queues for puppets) to 37363, whose admission requires MiddleHighProcessData+0x29C (MiddleHighProcessData.h:194, unk29C)
between 0 and fAIMaxHeadTrackDistanceFromPC (2000; 12000 for large creatures). That field is the camera-to-bounds distance
written by 78274, whose single caller is `Actor::Update` (37348), the AI update that 41369 replaces with UpdateNoAI when
kProcessMe is clear (docs/research/m3/re-ai-puppet.md:67-84). The constructor (40098) and revert (39433) zero it, so a puppet
keeps whatever distance its last AI frame measured: near, it would track forever; far (loaded two cells out, then demoted),
never. The body-rotation decision (38011) runs under Actor_UpdateAI 37347 and is frozen the same way.

Lip sync is not in that path. BSFaceGenAnimationData's update (26598) advances the lip entry at +0x228
(BSFaceGenAnimationData.h:84) by the frame delta (410199, src/RE/M/Misc.cpp:84) into the keyframes +0xE0 and +0x120, and is
reached only from the face node's UpdateDownwardPass (vtable 200333 slot 0x2C, BSFaceGenNiNode.h:35; 26985 to 26998), the
scene-graph update, gated by model-load flags set at head creation (24727, cleared by 25366) and by the entry having been
attached in SpeakSoundFunction 37542 while HighProcessData+0x3B8's load state read 3 or 4. The voice timer 37752 touches no
face data.

## Hypotheses

1. Q1, does the engine turn a puppet's head with AI off? Candidate: ProcessTracking (38009) admitted by 37363 from job 41453;
   AIProcess::SetHeadtrackTarget 39887 (high confidence on the chain, medium on the frozen-distance cause). Evidence: the
   SetHeadTracking native 54752 is `and [actor+0xCC],~8; or (bool<<3)`, the ActorState2.headTracking bit (ActorState.h:127);
   39887 sets +0x326 and calls 32934(holder+0x38, "TargetLocation", &pos); 37964 returns middleHigh+0x326 for the
   bHeadTracking channel built by CreateAnimationChannels (IAnimationGraphManagerHolder.h:34); 37363's gate reads +0x29C,
   written only by 78274 from 37348 with the PlayerCamera (400802, Offsets.h:434) position (50785); zeroed in 40098 and
   39433; no kProcessMe read in 37363, 38009, 39887, 32934. Side effects if the gate passes (HYPOTHESIS): ProcessTracking
   also rotates the body (37811) when LookAtOutOfRange (FixedStrings.h:184) is true and kShouldRotateToTrack (Actor.h:181)
   is stale-set; picks idle default targets (38012) at timer expiry; drops a look at the local player while the puppet's
   detection of it (37758) stays below 1. Frida: hook 37363's entry per puppet (rcx actor): log IsAIEnabled, [actor+0xCC]&8,
   race+0x108 bit 15, middleHigh+0x29C, +0x326; hook 38009's entry, 39887 and 39889; scenario: c2 enters Riverwood from the
   camp, a resident hosted by c1 speaks to c1; expect 37363 entries every frame, 38009 never, +0x29C constant above 2000.
   Falsified by 38009 entering per frame on the puppet with 39887 following (then the stale TargetLocation or the modifier's
   weight is the fault), or +0x29C changing on an AI-off actor.
2. Q2, is lip sync in the same gated path? Candidate: 26598 from 26998 from 26985 (BSFaceGenNiNode::UpdateDownwardPass)
   (high that it is the applier, medium that it runs for puppets). Evidence: 26598 evaluates the entry at faceAnim+0x228 with
   16267/16266 at delta plus the keyframe time (+0xEC, +0x12C) and releases it (16318) past frames/30 + offset + 0.2 s; its
   only caller is 26998, whose only caller is 26985 at vtable 200333+0x160; 37542 stores the entry into +0x228 only when
   HighProcessData+0x3B8 (accessors 39373, 39374) reads loaded (3 or 4) and GetFaceGenAnimationData (slot 0x63, 37655, to
   MiddleHighProcessData.h:180) is non-null; 37752 only moves voiceTimer, the handle and soundCallBackSet. Side effects
   (HYPOTHESIS): independent of kProcessMe; a "started" line (state 3) with no attached entry means 37542 ran before the lip
   load completed, or the face node's animate flag (+0x160 bit 2, set by 24727) is clear for that head. Frida: hook 37542
   (rcx actor) logging high+0x3B8 and its +0xC word before and after, then faceAnim+0x228; hook 26598 (rcx faceAnim) logging
   +0x228, +0xEC, +0x12C per frame for the puppet's face data; scenario: playtest 37's relayed line; expect either +0x228 null
   after 37542 (the attach missed) or 26598 never entered for that face data. Falsified by 26598 entering per frame with
   +0x228 non-null and +0xEC advancing while the mouth stays shut (then the apply into the morphs is the fault).
3. Q3, the smallest head change: refresh middleHigh+0x29C per puppet per frame with the engine's own pair, 50785(PlayerCamera,
   &pos) then 78274(middleHigh, &pos, actor->Get3D()), in the hook-2a replacement before the original; the queued 41453 then
   reaches ProcessTracking by itself (medium). Evidence: those are the two calls 37348 makes at its +0x1E4/+0x1F3; every other
   precondition (the headTracking bit, a kScript target, a high process, 3D) is already met by the fork's calls. Side effects
   (HYPOTHESIS): the body turns against the relayed heading unless kShouldRotateToTrack is cleared at demote; stale kCombat,
   kDialogue and kProcedure targets outrank kScript unless cleared with ClearHeadtrackTarget (39756); shares the ten-per-frame
   retarget budget (iUpdateActorsPerFrame:HeadTracking); a look at the local player is dropped while detection is frozen.
   Frida: Q1's hooks after the change; expect 38009 and 39887 per frame and +0x29C tracking the camera distance. Falsified by
   39887 entering per frame with no head motion (the graph side is then the gap).

## What follows (Eli's order)

The probe first: x-puppet-head-face (by path, after lab-driver's node-rotation step and the dist with pollFaceKeyframes /
faceKeyframes, fork m3-voice-inflight): the head and neck nodes' world and local Euler angles on the puppet before and after
a relayed gaze lands, the same read on the live NPC on the host as the control; the phoneme keyframe sampled while a line
plays on both seats. Then, if Q1 holds, the +0x29C refresh is the one head build; if Q2's attach misses, the lip fix is in
SpeakSoundFunction's timing on our say, not in the AI.
