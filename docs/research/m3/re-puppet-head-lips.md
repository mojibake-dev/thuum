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

# RE: the fragment leak and the lip read (2026-10-28, 22:40 PDT)

The re-analyst's second read for playtest 37 (pyghidra on SkyrimSE 1.6.1170, the unpacked program; REA failed to connect
again). Every Address Library ID below is a reverse lookup of the RVA in addrlib/versionlib-1-6-1170-0.bin through
lab/addr.py's loader, written as ID (RVA); every CommonLib name is cited to its header; every engine name beyond those is
HYPOTHESIS until a Frida trace confirms it. Actor runtime offsets are the AE ones (Actor.h:712 moves the block from 0xE0 to
0xE8), so boolBits is +0xE8, currentProcess +0xF8, voiceTimer +0x110, soundCallBackSet +0x278.

## A. Where a spoken info's fragments run

SayTopic 39162 (0x6d71e0), `bool (AIProcess*, Actor*, TESTopic*, TESTopicInfo*, b5, b6, b7, b8)`, is a dispatcher. With a
high process it tail-calls 39642 (0x6f7bb0), the body every loaded actor takes; without one it builds the DialogueItem
itself (25541 (0x3e8160) through the ctor 35220, DialogueItem.h:66) and, unless b8 keeps the ExtraSayToTopicInfo, sends
the item's BEGIN and END back to back through 35225, so an unloaded actor still runs both fragments. Its callers are the
bark path 44673 (0x8022b0), the player-dialogue path 37541 (0x67a140, two sites), the AI continuation 39632 (0x6f16d0),
the queued-greeting player 39338 (0x6e1e40), the Papyrus Say native 56220 (0xa2fb40) and a dozen scene and package
callers.

39642 writes high+0x45C (HighProcessData.h:345 unk45C) from b6 and, when b8, sets +0x465 and +0x450 (the Papyrus-Say
marks); it returns true early while the lip entry at high+0x3B8 is still loading (39369 (0x6e33e0), load state 1 or 2) or
the voice handle plays with no duration yet; with a null topic and no loaded lip data it continues the item in progress
(greetTopic +0x360 with a response left, HighProcessData.h:298) or plays a queued greeting and returns; otherwise it sets
the kDialogue head-track target on the listener (39782 (0x70ce80)), takes greetTopic or builds the item for the topic and
info, and hands it to 39643 (0x6f8020), the play. 39643 makes the item greetTopic, copies the current response's text into
voiceSubtitle (+0x218, HighProcessData.h:252), marks the listener's greetActor (+0x2F4), and speaks the response: with no
custom sound descriptor (DialogueResponse.h:32 voiceSound null) and kSoundFileDone set, through 39772 (0x70c2b0), which
calls SpeakSoundFunction 37542 (0x67a9d0) with the response's voice path (+0x18), &high->soundHandles[0] (+0x2FC), the
response's emotion and percent (+0x10, +0x14), the two idles (+0x20, +0x28), the listener, the sound output model and b7
as the lip load's asynchrony, stores the delay in high+0x2F8 and sets greetingPlayer (+0x454); with a descriptor, through
39771 (0x70bfc0). Then, if greetTopic stands and the lip is not pending (39369 false), 39643 calls
**35225 (0x5ddbf0) with type 0, the BEGIN**, and advances currentResponse (35223 (0x5ddbb0)). Our synchronous lip load
(b7 false, 16256 (0x23d420) inside 37542) leaves the entry loaded or absent, never pending, so the BEGIN goes out inside
our own sayTopicInfo call.

The END is the voice timer's. UpdateVoiceTimer 37752 (0x68f4e0) counts voiceTimer down and at zero sets soundCallBackSet
to 1 (2 when talkingToPC, +0x458, HighProcessData.h:341) and kSoundCallbackSuccess (Actor.h:187). UpdateSoundCallBack
37544 (0x67b690) is Actor's vtable slot 0x40 (Actor.h:287; VTABLE_Actor 207511 at 0x189d870 plus 0x200 is the xref
0x189da70): state 3 is the start's bookkeeping (voiceTimer from the sound's duration, the line's emotion onto the face,
the subtitle through 52626 (0x96cb00)); state 1 is the end: with greetTopic and no response left it calls
**35225 with type 1, the END**, then the generic end (head-track clears, ClearGreetTopic 39334 (0x6e1b70)); state 2 is the
same for a speaker talking to the player, with the dialogue menu advanced ("advancing the script on call back from voice
updatesoundcallback"); state 0 is the Papyrus-Say extra's END. Both state 1 and 2 also send an END straight through 25616
(force true) for MenuTopicManager's +0x78 info when its +0x6C speaker handle is this actor, that is, when the local player
is in dialogue with it. The stop 37741 (0x68eb00) sends END the same three ways and resets the face's modifiers and
phonemes over 0.75 s (26586). On a watcher seat our DriveVoice pair (PuppetHooks.cpp) is exactly 37752 then 37544, so the
puppet's END leaves from inside our call too.

35225 is DialogueItem-level: with item->info (+0x20, DialogueItem.h:56) it calls 25616 (0x3ebac0) with the info, the
type, the speaker's handle (item->speaker, +0x38) and the force flag. 25616 is TESTopicInfo-level: it resolves the speaker
(no speaker, no event); when not forced and the speaker is not MenuTopicManager's +0x6C partner it sends through 25667
(0x3ee870), the event {callback null, speaker, info formID, type != 0}; otherwise the same event with a 0x10 callback
object (vtable 0x1417e9cd0) that advances the menu when the fragment returns; both go to the holder's
BSTEventSource<TESTopicInfoEvent> at +0xEC8 (ScriptEventSourceHolder.h:108) through 25658 (0x3ed710). It then marks
saidOnce (+0x3A) unless kInfoRefusal and registers the reset hours. The VM side is SkyrimVM's sink, VTABLE_SkyrimVM[40]
217135 (0x1912990, the BSTEventSink<TESTopicInfoEvent> base at +0x140, SkyrimVM.h:126), slot 1 = 53997 (0x9c7e80): it
picks the begin or end fragment name for the info's formID from the VM's fragment table (vm+0x338: 0x99bb50 for type 0,
0x99bc60 for type 1), the attached script object (0x99ba30), looks the form up, wraps the event's callback in a 0x28
functor (vtable 0x1912ce0) and calls the fragment on the info's handle with the speaker as its argument (IVirtualMachine
vtable slot 0x29 with the handle policy from slot 0x2D); with no fragment it runs the callback directly. Nothing in 53997,
25616, 35225, 39643 or 37544 reads the speaker's AI state, kProcessMe, the hosted set or anything per seat: the gates are
an item with an info, a resolvable speaker, the lip not pending at the BEGIN, and a fragment in the info's VMAD. Skyrim
Platform's own sink (EventHandler.cpp:1360) sits on the same source and raises `topicInfo` for the hosted set, the begin
alone; a puppet is never in that set on its watcher's seat, so a drop upstream for puppet speakers costs it nothing.

The Papyrus comparison: Actor.Say is 56220 (0xa2fb40; "cannot speak a None topic info"). Voiced, it calls 39162 with
(process, actor, topic, null, 0, 0, 1, 1): the asynchronous lip load and the kept extra, then the same BEGIN and END; when
refused (the player in a menu 40413 (0x72e7d0), the actor busy 37965 or 37228, or the flag word at +0xC8) it builds the
item and sends BEGIN and END at once, silently, so the fragments still run; abSpeakInPlayersHead takes 37543 (0x67b300), a
direct 25616 caller. "SayCustom" does not occur in this exe's strings: it is not a native of this build.

## B. Where the lip sync writes, and what exprOverride gates

BSFaceGenAnimationData's update 26598 (0x41d750), `(this, float delta, bool)`, under the lock at +0x220, works on four
layers of three sets each, the sets being BSFaceGenKeyframeMultiple (values +0x10, count +0x18, isUpdated +0x1C,
BSFaceGenKeyframeMultiple.h:41-43; the time at +0x0C, BSFaceGenKeyframe.h:29). Expression: expressionKeyFrame +0x20 moves
toward transitionTargetKeyFrame +0x18 (26802 (0x42aa80), a rate-limited approach); the output unk0C0 +0xC0 is CopyFrom
(26798 (0x42a840)) of +0x20, then Blend (26794 (0x42a2e0), weight 1.0, zeros skipped) of unk040 +0x40 when that set holds
a value in (0, 1] (the vtable's slot 0xB at 0x42aca0). Modifier: with a loaded lip entry (+0x228, state 3 or 4), 16267
(0x23e320) evaluates the lip file's modifier frames at +0xEC plus delta into unk0E0's values (+0xF0) and 26780 (0x4294e0)
stamps the time; the output unk100 +0x100 is CopyFrom of +0xE0, then Blend of modifierKeyFrame +0x60 when it holds values.
Phoneme: with a loaded entry that has data, **16266 (0x23dfc0) evaluates the lip file's phoneme frames at +0x12C plus
delta into unk120's values (+0x130), all sixteen floats** (frame index (t minus offset) times 30, the last frame faded
over 0.2 s, then zeros); the output **unk140 +0x140 (values +0x150, count +0x158) is CopyFrom of +0x120, then Blend of
phenomeKeyFrame +0x80** when it holds values; with no entry, +0x140 is CopyFrom of +0x80 only when +0x80 holds values.
Custom: unk180 +0x180 from customKeyFrame +0xA0. The entry is released (+0x228 = 0) once +0x12C passes frames/30 plus
offset plus 0.2 s; +0x21C takes +0x21B (the force-all-layers pair); +0x217 reports any change. exprOverride (+0x21E) is
not read in 26598 at all.

The consumer confirms the sink: 26998 (0x4330c0), the face node's UpdateDownwardPass, runs 26598 when the node's +0x160
bit 2 is set and queues the node into the morph list at 0x14313fa18; 26996 (0x432f90) schedules 26999 (0x4334e0) per node,
which runs **26988 (0x432550)**: for each face geometry it applies the sixteen **unk140** values in (0, 1] as phoneme morphs
(26926 (0x430fe0), kind 0), the seventeen unk0C0 values as expressions (kind 1) and unk180's first as custom (kind 3),
gated by two camera distances (INI floats at 0x14200d308 and 0x14200d2f0 plus ten units; forced by the node's +0x160 bits
6 and 8 or the chargen flag at 0x1420f6a00+0x160); beyond the range it resets expressions and modifiers and phonemes
(26586 with 0, 1, 1). So the mouth is unk120 through unk140; phenomeKeyFrame +0x80 is the script layer (SKSE's
SetExpressionPhoneme) and stays zero under engine lip sync. The console's FaceGen command (23017 (0x371c70); subcommands
"expression", "phoneme", "modifier", "custom", "reset", "coord", "swap"; HYPOTHESIS: mfg) writes its phonemes into
+0x130 and its modifiers into +0xF0, the lip layer, which 16266 overwrites every frame while an entry is attached.

exprOverride is read by 26594 (0x41d540; CommonLib's SetExpressionOverride, BSFaceGenAnimationData.h:33: index -1..16 at
0..1, then 26593), 26595 (0x41d5c0: a mood index below 8 onto expression 7 plus it; also gated by +0x21A and +0x21D),
26593 (0x41d330, the transition target's setter), 26596 (0x41d630, its release) and 26555 (0x41c190, Reset's expression
part): all of them return without effect while it is set, and none of them sets it. It is written true by exactly two
functions: the Papyrus native Actor.SetExpressionOverride 54748 (0x9ea0d0; "Does not have face animation data, and
therefore cannot have their expression forced"; clears, calls 26594, then sets) and the console command 23017's
"expression"; written false by Actor.ClearExpressionOverride 54657 (0x9e7c00), by those two before they set, and by the
console's "reset". The three other "+0x21e" hits in the program (51423, 51242, 77431) are the EnchantConstructMenu and
unrelated structs. The engine's dialogue only obeys it: 37544's state 3 applies the line's emotion to the face (GetEmotion
slots 0x10A and 0x10C, Actor.h:464-466; 27058 (0x435f80) maps emotion 1..7 onto expressions 0, 6, 1, 3, 2, 4, 5 for 26594
at value/100; a neutral line goes through 26595 with GetActorValue(kMood = 4, ActorValues.h:12)) when greetingPlayer
(+0x454, 39353) holds and the speaker is not in the player's open dialogue menu; 37542 had set the actor's emotion from the
response first (slots 0x10B and 0x10D). All of that is skipped while +0x21E is true.

Who sets it on our seats is ours: skymp5-client's puppetFaceService.ts:61-68 calls actor.setExpressionOverride(mood,
value) on every hosted-state message for a puppet with a non-zero emotion (the isPuppet gate at :41) and clears only on a
(0, 0) message. Nothing clears +0x21E on a promote, and the face data lives with the loaded 3D.

## Hypotheses

4. Q4, the fragment leak: where a relayed line's fragments run and the smallest gate. Candidate: hook 35225 (0x5ddbf0),
   DialogueItem::SendTopicInfoEvent(item, type, force), returning without the send when item->speaker (+0x38) is a puppet
   (Puppets::Is) and its high process is not talkingToPC (+0x458) (high confidence on the chain, medium on the predicate).
   Evidence: the BEGIN is 39643's call with type 0 right after 39772 and 37542, inside our sayTopicInfo task, gated only by
   39369 (false after a synchronous load); the END is 37544 state 1's call with type 1 inside our DriveVoice pair, and
   37741's at a stop; 35225 to 25616 to 25658 to the holder's +0xEC8 to SkyrimVM's 53997, which runs Fragment_N on the
   info's script with the speaker and tests nothing about the speaker; the only sends that bypass 35225 are the Papyrus-Say
   extra's (37544 state 0, 37741) and MenuTopicManager's +0x78 END for the local player's own partner (37544 states 1 and
   2, 37741), neither of which a relayed line takes. Side effects (HYPOTHESIS): the host seat keeps every fragment (its NPCs
   are not puppets there); a watcher's own dialogue with a puppet keeps its fragments (talkingToPC true); a puppet's
   saidOnce mark and reset-hours registration (25616's tail) stop on the watcher, which is right, the server's record
   stands; the engine's dialogue-menu callback is null for a non-partner speaker, so nothing waits on the dropped event.
   Wider gates if a trace shows a sender off this path: 25616 (0x3ebac0) with the handle resolved as it does
   (0x1795f0), or 53997's event (speaker at +0x8). Not the bare 37542: it plays the voice and the lip with no item, but
   37544's end states want greetTopic, the subtitle is 39643's copy, and the voice path is the DialogueResponse's, built
   by 35249 (0x5de460). Frida: hook 35225 (rcx item, edx type, r8b force) logging [[rcx+0x20]+0x14] (the info),
   [[rcx+0x38]+0x14] (the speaker), the type and a backtrace (expected returns into 39643 0x6f8020, 37544 0x67b690,
   37741 0x68eb00, 39772 0x70c2b0); hook 25616 (rcx info, edx type, r8 handle ptr, r9b force) and 53997 (rdx event:
   [rdx+8] speaker, [rdx+0x10] formID, [rdx+0x14] type); scenario: c1 hosts the merchant and asks for its wares, c2
   watches; expect on c2 a 35225 type 0 from 39643 inside the say task and a type 1 from 37544 inside DriveVoice at the
   line's end, each followed by 53997 with the vendor info's formID, the menu opening at whichever the TIF hangs on.
   Falsified by a 53997 on c2 with no 35225 before it (the sender is then the menu or extra path and the gate belongs at
   25616), or by the menu opening with no 53997 at all (then it is not the fragment: the gamemode opened it).
5. Q5, the Papyrus comparison: Actor.Say (56220) runs the fragments on every branch, voiced through 39162 with b7 and b8
   true, refused through an immediate BEGIN and END (high). Evidence: 56220's body above; "SayCustom" absent from the
   exe. Side effects (HYPOTHESIS): a Say-driven relay would double the fragments; our info-given SayTopic with b8 false is
   the right entry. Frida: none needed; falsified by a 53997 with no 35225 after a Papyrus Say (then Say sends elsewhere).
6. Q6, the lip set: the lip sync writes phonemes into unk120 (+0x120, values +0x130) and the morphs read unk140 (+0x140,
   values +0x150); phenomeKeyFrame (+0x80) is the script layer and reads zero under engine lip sync (high). Evidence:
   16266's sixteen writes through +0x130 and 26780's stamp at +0x12C in 26598; the CopyFrom and Blend order into +0x140;
   26988's phoneme loop over [[faceAnim+0x150]] with count at +0x158; the console's "phoneme" writing +0x130. Side effects
   (HYPOTHESIS): a value written into +0x80 overlays the lip (Blend at weight 1.0 skips zeros), so SKSE's
   SetExpressionPhoneme is the designed way to drive a mouth from a stream, and a read of +0x140 sees the sum; a face
   farther than the second INI distance shows no lips and is reset. Frida: hook 26598 (rcx face, xmm1 delta) for the
   puppet's and the live NPC's face data (pointers from GetFaceGenAnimationData, vtable slot 0x63), logging [rcx+0x228],
   [rcx+0x12C] as f32, sixteen f32 at [[rcx+0x130]], sixteen at [[rcx+0x150]], sixteen at [[rcx+0x90]] and [rcx+0x21E];
   scenario: playtest 37's relayed line; expect +0x228 non-null, +0x12C advancing by the frame delta, +0x130 changing per
   frame, +0x150 mirroring it, +0x90 zero. Falsified by +0x130 staying zero while +0x12C advances (16266's data is empty:
   no lip file for that voice type on this seat), or +0x150 moving with the mouth still (then 26988's distance gate: log
   its test).
7. Q7, exprOverride: the engine never sets it during dialogue; the true we read is our own setExpressionOverride, and on
   the host seat's live NPC a leftover of its puppet period there (high on the writers, medium on the leftover). Evidence:
   the complete writer list (54748, 23017 true; 54657, 23017 false); 26594, 26595, 26593, 26596, 26555 return early on
   it; 37544 state 3's emotion apply runs through 26594 and 26595; puppetFaceService.ts:61-68; no clear on promote. Side
   effects (HYPOTHESIS): while set, the engine's own per-line expression is suppressed on the puppet (37544 state 3 runs
   inside DriveVoice on the watcher, with the response's emotion already on the actor from 37542) and on the host's live
   NPC, a player-visible loss; our override is both redundant and blocking; the fix shape is a clearExpressionOverride at
   promote and no override during a relayed line, letting 37544 apply the stream's emotion, with the relayed emotion kept
   for the lab's comparison. Frida: hook 54748 (r8 actor, r9d mood, [rsp+0x28] strength) and 54657 (r8 actor) on both
   seats, logging the actor's formID and whether it is a puppet; hook 26594 (rcx face, edx idx, xmm2 value) and 26595
   logging [rcx+0x21E]; expect 54748 only on puppets, 26594 from 37544 on the watcher's puppet with +0x21E set (so
   without effect). Falsified by a 54748 on a never-puppeted live NPC on the host seat (then another caller; the
   backtrace names it), or by a true read on a face with no 54748 or 23017 ever logged (then a writer the literal sweep
   missed).
8. Q8, the read: pollFaceKeyframes should sample face->unk120 and face->unk140 (BSFaceGenAnimationData.h:47-48) with the
   lip time face->unk120.unk0C (+0x12C) and the entry face->unk228, keeping phenomeKeyFrame as the script layer (high).
   Evidence: Q6. Side effects: none, reads only. Frida: Q6's hook is the oracle for the native's numbers. Falsified by
   the native's unk140 reading zero while Q6's hook logs values (a copy or timing fault in the read).

## What follows (Eli's order)

The probe stays first (x-puppet-head-face), with the face read widened to unk120 and unk140 and the fragment hooks of Q4
on both seats; then, if Q4 holds, the 35225 gate in PuppetHooks with the puppet-and-not-talkingToPC predicate is the one
fragment build, and Q7's clear-on-promote and no-override-during-a-line is the one face build. The head build of Q3 is
unchanged.
