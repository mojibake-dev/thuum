# RE: the claimed dialogue's state, or why Actor.IsInDialogueWithPlayer reads false after a promote (2026-10-28, 16:38 PDT)

The re-analyst's read for playtest 37's finding 19 (docs/private/playtest-m3-37.md; docs/LOG.md 16:06 PDT): with the
Dialogue Menu open, the engine's own `Actor.IsInDialogueWithPlayer()` answered true for rotfern's partner on the host's
seat (c1, 23:04:59Z) and FALSE for Prisoner's claimed, just-promoted partner on the claimant's seat (c2, 23:04:39Z and
23:05:13Z), with the wiggle (finding 15), the missing head turn and the exit line's timing riding on it. pyghidra on
SkyrimSE 1.6.1170 (the program `/SkyrimSE-1.6.1170.0.exe.unpacked.exe`; REA was disconnected), every Address Library ID a
reverse lookup of the RVA in addrlib/versionlib-1-6-1170-0.bin through lab/addr.py, every CommonLibSSE-NG name cited to
its header in this tree. Engine names beyond CommonLib's are HYPOTHESIS, as is every inferred side effect, until a Frida
trace confirms them. The fork's code read: lab/.cache/wt/cast (PuppetApi.cpp, PuppetHooks.cpp) and the parent session's
train-wt copy of skymp5-client's talkService.ts (the one-and-two-second re-asks of f5ec2f7a).

## The short answer

The native reads one byte: `HighProcessData::talkingToPC` (include/RE/H/HighProcessData.h:341, +0x458), through
`Actor::currentProcess` and `AIProcess::high`. Nothing else: not the MenuTopicManager's speaker (that handle is read only
for a TalkingActivator), not a bool bit on the actor, not the package. The byte has one writer in the whole exe, the
setter 39348 (RVA 0x6e25f0), and the normal E path sets it inside `Actor::SetDialogueWithPlayer(true, false, nullptr)`
(37200, 0x660410), which TESNPC::Activate (24715, 0x3b9500) calls at the end of a player's activation. The AI update
(37347) skips the whole package step while the byte is set: that is the engine's "stand still and talk".

Why it stays unset on the claimant's seat (medium-high confidence, static): TESNPC::Activate runs `SetTalkingToPC(1);
look up the Hello; SetTalkingToPC(0);` on EVERY activation of a talkable NPC, before it decides whether to start a
dialogue. A SECOND activation of an actor whose dialogue is already running finds the MenuTopicManager's speaker equal to
the actor and starts nothing, so its only lasting effect is talkingToPC = 0 while the menu, the speaker and the topic
list stay whole. The claimant's seat produces that second activation; the host's seat never does: there one E release is
one TESNPC::Activate. The sources, in likely order: (a) the engine's own E, which activates on the key's RELEASE
(ActivateHandler::ProcessButton 42420), lands after the promote lifted the activation block whenever the press outlasts
the grant's round trip (157 ms in 55's read), and then our activatePickRef, 100 ms after the promote, is the second;
(b) the client's re-asks of activatePickRef at one and two seconds while the Dialogue Menu is not yet seen open; (c) a
pending start the engine fires itself after a greeting, plus any of the above. A promote is not the cause: EnableAI only
flips kProcessMe, HighProcessData survives it, and no function on the path reads the AI bit or the process level.

The fix: one activation per claim. Make the fork's activatePickRef idempotent (skip when the MenuTopicManager's speaker
is already the pick, or the Dialogue Menu is open, or the byte is already set) and swallow the engine's own release for
the claim's press (`ActivateHandler::SetHeldButtonActionSuccess(true)` at the press, ActivateHandler.h:19). The one-byte
band-aid (set talkingToPC after the menu opens) is the fallback and the lab's assertion, not the fix.

## Q1: what the native reads

Papyrus `Actor.IsInDialogueWithPlayer()` is registered by 56246 (0xa31ac0) with the string at 0x1417d4430 and the
callback 56194 (0xa2d7a0). The callback: for a form of type 0x3E (FormTypes.h:202 ActorCharacter) it returns 37199
(0x6603e0); for a form whose base is type 0x19 (FormTypes.h:165 TalkingActivator) it returns whether
`MenuTopicManager::speaker` (MenuTopicManager.h:68, +0x68; singleton 401099, MenuTopicManager.h:63) equals the form's
handle; anything else is false. 37199 (HYPOTHESIS name Actor::IsInDialogueWithPlayer) is
`currentProcess && AIProcess::IsTalkingToPC(currentProcess)`, where currentProcess sits at Actor+0xF8 in 1.6.1170 (the
runtime data moved from 0xE0 to 0xE8 at 1.6.629, Actor.h:710-713; the header's 0xF0 is the SE column). 39347 (0x6e25d0,
named AIProcess_IsTalkingToPC by an earlier read) is `high && high->talkingToPC`: AIProcess::high at +0x10
(AIProcess.h:197), the byte at HighProcessData+0x458 (HighProcessData.h:341).

The condition function of the same name (TESCondition.h:314, kIsInDialogueWithPlayer = 249; the SCRIPT_FUNCTION entry
at 0x141fe07e0 carries output 0x10F9 = 0x1000 + 249) is 21692 (0x335960): the same 37199 for an actor, the speaker
handle for a talking activator, with the console strings "Actor %s is in dialogue state with player." and "Reference %s
is in dialogue state with player.". So the Papyrus word, the condition word and the engine's own checks all read one
byte.

Writers. A literal search of the decompiled exe for stores at +0x458 finds one function that writes it through a
process: 39348 (0x6e25f0, HYPOTHESIS name AIProcess::SetTalkingToPC: `if (high) high->talkingToPC = v`). Its callers:
37200 Actor::SetDialogueWithPlayer (1 at the start, 0 at the end), 24715 TESNPC::Activate (1 then 0, transient, around
the Hello lookup), 35294 the MenuTopicManager's end for a speaker (1 then 0 around the goodbye line), 28352 (0x45ac00;
1 then 0 around a scene phase's dialogue; HYPOTHESIS: BGSSceneAction's dialogue phase). The constructor's zeroing is the
only other path.

Readers that matter (callers of 39347): Actor_UpdateAI 37347 (the package gate, below), the body-rotation decision 38011
(0x6a1e80), Actor::ProcessTracking 38009 (0x6a1370, the look-at applier of re-puppet-head-lips.md), SpeakSoundFunction
37542, UpdateVoiceTimer 37752, UpdateSoundCallBack 37544, EndInterruptPackage 37474, SetCurrentScene 37248 (slot 0x4B),
PauseCurrentDialogue 37741 (slot 0x4F, labelled Actor_StopSpeech by an earlier read), FinishLoadGame 37652, and 37747,
40492, 24011, 37919, 37622, 37623, 37624, 40076 (not decompiled; listed for the trace).

## Q2: the normal E path, and what the dialogue's start sets and its end clears

The path, every step on both seats:

1. `ActivateHandler::ProcessButton` 42420 (0x79ee60; VTABLE_ActivateHandler slot 4, Offsets_VTABLE.h:2357, AE 208723 at
   0x18b6e60 + 0x20). The press (ButtonEvent value != 0, heldDownSecs == 0; ButtonEvent.h:27-28) only sets the handler's
   byte +0x18 (ActivateHandler.h:21). The RELEASE (value == 0) calls PlayerCharacter::ActivatePickRef when
   `heldButtonActionSuccess` (+0x1A, ActivateHandler.h:23) is false and +0x18 was set; a hold past a GameSetting runs
   the grab logic and writes heldButtonActionSuccess; the tail zeroes +0x18, +0x19, +0x1A. Activation is on the
   release, not the press. With `disabled` (+0x1B) set it says "Your hands are bound".
2. `PlayerCharacter::ActivatePickRef` 40548 (0x73e980; Offsets.h:445 RELOCATION_ID(39471, 40548); PlayerCharacter.h:544):
   the pick is `CrosshairPickData::target` (CrosshairPickData.h:23, +0x04; singleton 401585, CrosshairPickData.h:17), or
   a forced or alternate pick when that handle is invalid; then `TESObjectREFR::ActivateRef(pick, player, 0, nullptr,
   count, false)`; when nothing was activated it plays the fail sound (41003 is a pre-check on the handle). The fork's
   export runs this very function (PuppetApi.cpp ActivatePickRef), so from here the claimant's path and the host's are
   one function.
3. `TESObjectREFR::ActivateRef` 19796 (0x2eac20, named by an earlier read): a kBlockPlayerActivate redirect
   (ExtraFlags.h:18), the TESActivateEvent, then the kBlockActivate test (ExtraFlags.h:17,
   TESObjectREFR::IsActivationBlocked TESObjectREFR.h:436): a blocked reference returns false BEFORE the base object's
   Activate; otherwise `baseObject->Activate(ref, activator, ...)`, TESBoundObject slot 0x37 (TESBoundObject.h:42).
4. For an NPC that slot is `TESNPC::Activate` 24715 (0x3b9500): VTABLE_TESNPC[0] (Offsets_VTABLE.h:931, AE 195816 at
   0x17e4d50) holds 0x1403b9500 at +0x1B8; its neighbour is TESNPC_GetActivateText_24716. Its guards, in order: refresh
   kIsAMount (37918); the activator must be an actor with a process; 37559 (0x67e0a0) refuses a kDying actor, a
   MenuTopicManager whose byte +0xB5 is set, and a scene that says "This person is in a conversation" (24124); a
   non-zero fadeState (HighProcessData+0x130, HighProcessData.h:214) refuses; a commandingActor
   (MiddleHighProcessData+0x218, MiddleHighProcessData.h:175) refuses unless dead or a mount; alive: kUnconcious
   (lifeState 3) and kParalyzed (boolBits bit 31, Actor.h:189) refuse, a hostile actor refuses unless its combat is with
   the player; `IsInCombat` (slot 0xE3, Actor.h:425) refuses unless kEssentialDown (7) or knocked (37484: knockState,
   ActorState.h:116); a sitSleepState other than 0, sitting (3) or sleeping (7) is ignored; kReanimate (4) refuses; a
   dead actor opens the loot; a sneaking player goes to pickpocket. Then the dialogue branch: not knocked, the activator
   is the player, `Actor::CanTalkToPlayer` 37469 (0x673cb0, Actor.h:510). It writes `SetTalkingToPC(1)`, looks up the
   Hello when awarePlayerTimer (HighProcessData+0x340, HighProcessData.h:292) has run out (19519, 0x2d9c60: the exclusive
   branch, the MenuTopicManager's branch 35286, else the type 7 subtype 79 lookup, DialogueTypes.h:19 kMiscellaneous and
   TESTopic.h:100 kHello, through 32493 on the singleton 400476 that Offsets.h:73 names BGSStoryTeller), builds a
   DialogueItem for it (25541), and writes `SetTalkingToPC(0)`. A Hello info with bit 0 of its byte +0x3C set is only
   said (37367), no menu. Then: a submerge test against 0.875 (37447; HYPOTHESIS GetSubmergeLevel) refuses underwater;
   38543 on both actors ends a pending attack ("attackStop"); a Find-then-Dialogue package steps its procedure (39158)
   when `AIProcess::target` (AIProcess.h:218) is the player; `Actor::InterruptCast` 38757 on the actor; a VATS call
   (44289 on the singleton 400883, VATS.h:50; HYPOTHESIS: the dialogue camera's mode). The decision: if
   `MenuTopicManager::lastSpeaker` (+0x6C, MenuTopicManager.h:69) is this actor, a PENDING start: 39606 (0x6efa30)
   writes the topic to HighProcessData+0x270, the force-greet flag to +0x463 and 1 to +0x464 (HighProcessData.h:259,
   352-353), dismounts (37818), sets MenuTopicManager+0xB1 and shows the name and subtitle; else if the speaker
   (35288, 0x5e1a40, resolves +0x68) is not this actor, `Actor::SetDialogueWithPlayer(true, false, nullptr)`, vtable
   slot 0x41 (Actor.h:288; VTABLE_Actor[0] Offsets_VTABLE.h:2142, AE 207511 at 0x189d870, +0x208 holds 0x140660410).
5. `Actor::SetDialogueWithPlayer` 37200 (0x660410). Before the start: a force-greet is refused while the player is in
   40596 or 37901's states; an occupied furniture that needs getting up (39916 then 17398) with the actor sitting or
   sleeping calls InitiateGetUpPackage (slot 0xDE, Actor.h:420) and queues a pending start, returns false; no 3D
   (Get3D2, slot 0x70, TESObjectREFR.h:308) queues a pending start, returns false. With a_flag true it then writes
   `SetTalkingToPC(1)` and runs the MenuTopicManager's start 35282 (0x5e0840; HYPOTHESIS MenuTopicManager::StartDialogue:
   the speaker handle at +0x68 set to the actor after ending a different previous speaker through 35294, the topic
   list built by 35287 and 35285, byte +0xB1 set, the display name and the voice subtitle shown, the dialogue camera's
   angles 40496). If the list is empty the start is refused and the end list below runs.

What the start sets on the partner (37200's success path, after 35282 returns true):
- `HighProcessData::talkingToPC` = 1 (39348), the one byte the native reads.
- `HighProcessData::queueofGreetings` (+0x240, HighProcessData.h:255) cleared (39339) and the chosen greeting stored in
  `lastGreeting` (+0x330, HighProcessData.h:290; 39415).
- `awarePlayerTimer` (+0x340) = the GameSetting 370987 (39302); it counts down under the pending-start logic.
- The head track: `HighProcessData::SetHeadtrackTarget(kDialogue, player)` (39465 to 39783; kDialogue = 4 per
  HighProcessData.h:80-92, the setter HighProcessData.h:178-183). This is the "face the player" of a dialogue, read by
  ProcessTracking 38009.
- A mounted actor dismounts (37818); a force-greet interrupts the player's cast (38757) and 40590.
- The current scene, if any, is told (24131 with 2; HYPOTHESIS BGSScene's dialogue notice).
- `movementController` (runtime +0x148, Actor.h:671) virtual slot 0x0A with false (MovementControllerNPC.h:28, unnamed
  in CommonLib; HYPOTHESIS: the movement is stopped for the dialogue).
- TESForm `kHasSpokenFlag` (bit 6, TESForm.h:66) set with AddChange(kFormFlags) (14629; TESForm.h:133).
- On the player's side the MenuTopicManager holds the speaker and the list; the Dialogue Menu itself is opened by the UI
  from that state (the string's two users are 0x140fb7e10 and 0x1400b59c0, not read here).

What the end clears (37200 with a_flag false, or a refused start; the MenuTopicManager's end 35294 calls it first):
- `awarePlayerTimer` zeroed (39302 with get minus get), `talkingToPC` = 0 (39348).
- The kDialogue head track cleared (39471 to 39756) and `headTrackTargetTimer` (+0x160, HighProcessData.h:220) reset to
  the GameSetting 370304.
- The emotion reset (runtime +0x16C and +0x170, Actor.h:674-675, written as one zero qword at Actor+0x174 in 1.6.1170).
- Either CheckForNewPackage (39114, the 37401 comment's name) or, when both voice-done bits are set (kSoundFileDone and
  kVoiceFileDone, Actor.h:163-164) and `voiceTimer` (runtime +0x108, Actor.h:657) has run out, a Hello bark (32493 then
  37367) after 52856 (HYPOTHESIS: the UI message that hides the Dialogue Menu).
- `kForceGreetingPlayer` (bit 12, Actor.h:168) cleared; the scene told (24131 with 2, 1); kHasSpokenFlag again.
- 35294 itself then says the Goodbye (type 7 subtype 78, TESTopic.h:99 kGoodbye, through 39337), keeps `lastSpeaker`
  and `lastTopicInfo` (+0x6C, +0x78) while the actor is still speaking, clears the list (35274) and invalidates the
  speaker, and with a_closeMenu closes the menu (52856). It is reached from EndInterruptPackage 37474 (0x6745c0) when
  talkingToPC is set, from UpdateInDialogue 37541 (slot 0x4C), from the start itself when a different speaker was set,
  and from 40076 (0x71ab20), 19521 (0x2d9d80), 19660 (0x2e0580) and 35273 (0x5dfc60).

What talkingToPC gates, the part that explains the symptoms (CONFIRMED-STATIC for the gate, HYPOTHESIS for the effect):
- Actor_UpdateAI 37347 (0x6672b0) at 0x140667993: the package step (39108 or 39109, the per-level package processing of
  re-ai-puppet.md) runs only when knockState is 0, the schedules flag of ProcessLists (400315, +0xC) is set or the
  current package is an interrupt type (29581: types 0x14 to 0x26), AND `!IsTalkingToPC`. While the byte is 1 the actor's
  package does not step: no travel, no sandbox, no TurnToWalk. With the byte 0 under an open menu the package steers as
  if nobody were talking: finding 15's NPC_TurnToWalkLeft180 a second after the promote and the 80 units of drift.
- ProcessTracking 38009 at 0x1406a1626: a look at the player whose detection value (37758 at 0x68f7d0, level 3) is
  low is dropped unless `IsTalkingToPC`; and the rotation decision 38011 reads it at its top. With the byte 0 the kDialogue
  target set at the start can be dropped and the kProcedure target of the still-stepping package outranks it
  (re-puppet-head-lips.md's priority order): the missing head turn.
- SpeakSoundFunction 37542, UpdateVoiceTimer 37752 and UpdateSoundCallBack 37544 read it: the post-dialogue line's
  timing (finding 19) rides on the same byte (HYPOTHESIS on the exact branch).
- The pending start's consumer is 39637 (0x6f20a0), the high-process package update under that same 37347 gate: when
  +0x464 is set, the MenuTopicManager's lastSpeaker is no longer this actor, and the player is within the GameSetting
  370718 (or +0xB1 is set), it calls `SetDialogueWithPlayer(true, +0x463, +0x270)`, retrying as awarePlayerTimer runs
  out; otherwise it hides the menu (52856) and clears +0xB1. So an activation during a greeting (x-npc-talk-cross
  131626, "Hilde had begun a greeting 33 ms before") queues a start the engine fires by itself later, with the AI on.

## Q3: why the byte stays unset for a promoted partner

Ruled out first.
- The AI switch. `Actor::EnableAI` 37504 (0x6764e0; Actor.cpp:230-240) writes kProcessMe (Actor.h:160) and zeroes the
  character controller's velocity, nothing more; HighProcessData is neither freed nor rebuilt by it (re-ai-puppet.md:22-23;
  the process is freed only by the reference's unload, 19801 at 0x2ec7e0, which also reads +0x464 to hide the menu).
  None of 42420, 40548, 19796, 24715, 37200, 35282 reads kProcessMe or `processLevel` (AIProcess.h:225). A promoted actor
  walks the same path as the host's resident, and every guard above is satisfied by a resident that was talkable a
  moment before.
- The wait. Promote (PuppetApi.cpp) calls `EvaluatePackage(false, false)` right after EnableAI(true); 37401 (0x66ccf0;
  Actor.cpp:249-253 RELOCATION_ID(36407, 37401)) with a_immediate false only sets kEvpBuffered (bit 16) and pulls the
  process's next-update time back; the first 37347 frame after the promote consumes it, and our activation comes 100 ms
  (six frames) later. Had the buffered evaluation run after the start, its immediate path reaches EndInterruptPackage
  37474, which ends the MenuTopicManager's dialogue (35294 with a_closeMenu) when talkingToPC is set: the menu would
  close. The observed shape (menu open, lines playing, byte 0) is not that.
- A rebuilt HighProcessData (a process-level change across the promote). It would also clear the kDialogue head track,
  lastGreeting and the lip entry at +0x3B8 that SpeakSoundFunction needs; finding 20's lines played with lips. Unlikely;
  the trace reads the `high` pointer anyway.
- A refused start. 35282 returning false runs the end list and opens no menu.

The cause: the transient clear of a second activation. TESNPC::Activate writes `SetTalkingToPC(1)` and then
`SetTalkingToPC(0)` around its Hello lookup on every activation that reaches the dialogue branch, unconditionally (the
lookup itself is skipped while awarePlayerTimer is positive, the clear is not), and only THEN asks the MenuTopicManager
whether to start. A first activation ends with `SetDialogueWithPlayer(true)` and the byte at 1. A second activation of
the same actor while its dialogue runs passes the guards (not in combat, talkable, fadeState 0, no scene, +0xB5 clear),
performs the transient clear, finds `speaker == actor`, and returns 1 having started nothing: the menu, the speaker and
the topic list are untouched, the actor's byte is 0. Everything in Q2's gate list follows. The byte +0xB5 of the
MenuTopicManager, when set, makes 37559 refuse the second activation before the transient, so the clear is
timing-dependent: finding 19's two FALSE reads and finding 15's "struggling to reproduce" fit a race, not a rule.

Where the second activation comes from on the claimant's seat, and not on the host's:
(a) The engine's own E. The ActivateHandler activates on the key's release. The press on a puppet sends the claim
    (TalkService.onButton: isPressed and heldDuration 0) and the engine's handler sets its press byte; the release
    reaches 40548 whenever the player is still in control. If the release comes before the grant, 19796 meets the
    puppet's block (SetActivationBlocked(true) from the demote) and returns false: the fail sound, harmless. If the
    release comes after the grant, Promote has lifted the block, and the engine's release activation starts the dialogue
    itself; our activatePickRef, 100 ms after the promote, is then the second activation and clears the byte. The grant
    took 157 ms after the send in 55's read, so any press held past about 160 ms does this; a human press expecting a
    menu to appear easily does, the driver's short press does not, which is why the probes read the host-like shape
    and the playtests did not. In the other order (ours first, the release after the menu opened) the engine's release
    is the second, if the handler still runs the Activate event in the menu's input context (unread; the trace tells).
(b) The client's re-asks. TalkService.watchClaim (fork f5ec2f7a and later) calls activatePickRef again one and two
    seconds after the grant while `Ui.isMenuOpen("Dialogue Menu")` is false on that update. A start the engine performs
    a frame later (the pending start from 39637 after a greeting, or a menu that opens late) turns the re-ask into the
    clearing second activation. The in-dialogue word is logged on the first update that sees the menu open, so a FALSE
    there points at (a) or at a pending start plus a re-ask inside the same second.
(c) The pending start plus any activation: a first activation during a greeting (lastSpeaker == actor) queues +0x464;
    39637 starts the dialogue when the greeting ends; the engine's release or a re-ask after that is the second.
On the host's seat one press is one release is one TESNPC::Activate, and no client code activates: TRUE.

## Q4: the fix, the trace, the falsifiers

(a) The smallest fix is one activation per claim, in two halves, both in the fork's Skyrim Platform (PuppetApi.cpp) and
TalkService; no engine state is faked.
1. An idempotent activatePickRef. In the export's game-thread task, before `player->ActivatePickRef()`: resolve the
   pick (`CrosshairPickData::GetSingleton()->target`, CrosshairPickData.h:17,23) and skip, logging it, when
   `MenuTopicManager::GetSingleton()->speaker` (MenuTopicManager.h:63,68) resolves to that actor, or
   `UI::GetSingleton()->IsMenuOpen(DialogueMenu::MENU_NAME)` (UI.h:91, DialogueMenu.h:25), or the actor's
   `GetHighProcess()->talkingToPC` (Actor.h:549, HighProcessData.h:341) is already true. This removes (b) and the
   engine-first order of (a). The re-asks can stay; they become harmless.
2. Swallow the engine's release for the claim's press: `PlayerControls::GetSingleton()->GetActivateHandler()->
   SetHeldButtonActionSuccess(true)` (PlayerControls.h:43,45; ActivateHandler.h:19) when TalkService sends a claim (a
   small export run on the game thread). 42420 then skips ActivatePickRef at the release and zeroes the bool itself in
   its tail. Its hold branch (a hold past the GameSetting hold length) rewrites the bool with the grab result, so a
   very long hold can still slip through: re-set it every update while `pending` stands, or accept the edge. The same
   effect with no new export: keep the puppet's block through the promote and lift it inside the activation task, right
   before ActivatePickRef (a zero-length window); the engine's release then meets the block (the fail sound) or the
   open menu.
3. The band-aid, kept as the lab's assertion and as the fallback: at the menu's first open on a claimed partner, when
   the MenuTopicManager's speaker is the actor and the byte is 0, set `high->talkingToPC = true`. One byte; after a
   second activation nothing else needs restoring (the kDialogue head track, lastGreeting and awarePlayerTimer are left
   as the first start set them). Rung: the byte is engine-local state on the claimant's seat (R3); the claim stays R0.
Ordering: no wait after EnableAI(true) is needed for the start itself; the 100 ms stays, so the first AI frame consumes
the buffered EvaluatePackage before the start. The wait is not the cause and lengthening it changes nothing.

(b) The Frida plan, one claimed dialogue on c2 with a resident c1 hosts, the hooks by Address Library ID:
- 24715 TESNPC::Activate onEnter: rdx (the target reference) and r8 (the activator) form ids, the MenuTopicManager's
  +0x68 and +0x6C before the call, `Thread.backtrace` to tell 42420 (the E release) from skyrim_platform's task (our
  export) from 39637 (a pending start).
- 37200 Actor::SetDialogueWithPlayer onEnter and onLeave: rcx form id, dl a_flag, r8b a_forceGreet, r9 topic id, the
  return value, and `[[rcx+0xF8]+0x10]+0x458` after the call.
- 39348 onEnter: rcx (the process) and dl (the value) with a backtrace; the caller is the writer.
- 35282 onLeave (the start accepted or refused); 35294 onEnter with r8b (an end that closes the menu).
- 40548 onEnter with a backtrace; 42420 onEnter: the ButtonEvent's value (+0x28) and heldDownSecs (+0x2C), the handler's
  +0x18 and +0x1A.
Two runs: (i) the driver's E held 400 ms (the release after the grant), (ii) held 50 ms. Read the native at the menu's
open and at +1 s, +2 s, +3 s (across the re-asks), and the partner's position for 20 s. Expected if the hypothesis
holds: in (i) two 24715 entries within about 100 ms, one from 42420 and one from our task, one 37200(1) between them
returning 1, then a 39348(1) and 39348(0) pair from the second 24715 with no 37200 after it, the native FALSE and the
drift; in (ii) one 24715, the native TRUE, no drift. After fix 1 or 2: one 24715 in both runs, TRUE in both.

(c) What falsifies each:
- The second-activation cause: a single 24715 entry for a claim whose native reads FALSE. Then read the `high` pointer
  across the promote (the rebuilt-data alternative) and 37401's frame against 37200's.
- The one-writer claim: a 39348(0) whose backtrace is none of 37200, 24715, 35294, 28352, or the byte changing with no
  39348 call (an inline store the literal search missed).
- The menu's opener: 37200 returning 0 while the Dialogue Menu opens (then the menu has another opener and Q2's start
  list is incomplete).
- The MTM-end exclusion: a 35294 call during the claim with the menu staying open.
- Fix 1: the native still FALSE with the skip logged (then the engine's release is the second in the ours-first order
  and fix 2 is needed). Fix 2: 40548 entered from 42420 after the bool was set (the hold branch rewrote it).

## Names and IDs used (1.6.1170, RVA in parentheses)

56246 (0xa31ac0) the Actor natives' registration; 56194 (0xa2d7a0) the IsInDialogueWithPlayer callback; 37199
(0x6603e0) its body; 39347 (0x6e25d0) AIProcess::IsTalkingToPC; 39348 (0x6e25f0) its setter; 21692 (0x335960) the
condition function; 42420 (0x79ee60) ActivateHandler::ProcessButton; 40548 (0x73e980) PlayerCharacter::ActivatePickRef;
19796 (0x2eac20) TESObjectREFR::ActivateRef; 24715 (0x3b9500) TESNPC::Activate; 37200 (0x660410)
Actor::SetDialogueWithPlayer; 35282 (0x5e0840) the MenuTopicManager's start; 35288 (0x5e1a40) its speaker; 35294
(0x5e1e50) its end for a speaker; 35274 (0x5dfc90) its list clear; 35285, 35287 (0x5e1210, 0x5e1830) its list builders;
35286 (0x5e15d0) its branch lookup; 39606, 39607 (0x6efa30, 0x6efa60) the pending start's write and read; 39637
(0x6f20a0) the high-process package update that consumes it; 37347 (0x6672b0) Actor_UpdateAI; 37401 (0x66ccf0)
Actor::EvaluatePackage; 37474 (0x6745c0) EndInterruptPackage; 39114 (0x6d5690) CheckForNewPackage; 39108, 39109
(0x6d3c10, 0x6d49b0) the package step; 29581 (0x494fb0) the interrupt-type test; 38011 (0x6a1e80) the rotation
decision; 38009 (0x6a1370) Actor::ProcessTracking; 39465, 39471 (0x6ebb50, 0x6ebc90) the kDialogue head track set and
clear through 39783 and 39756; 39339 (0x6e1f90) the greetings queue clear; 39414, 39415 (0x6e4430, 0x6e4450)
lastGreeting; 39301, 39302 (0x6e0a00, 0x6e0a20) awarePlayerTimer; 39451 (0x6eb440) fadeState; 39951 (0x714370)
commandingActor; 39136 (0x6d6b50) AIProcess::target; 39158 (0x6d6fc0) the procedure step; 37559 (0x67e0a0) the
scene and dying guard; 37469 (0x673cb0) Actor::CanTalkToPlayer; 37484 (0x674f50) the knock-state test; 37447
(0x673140) the submerge test; 38543 (0x6b5db0) the attack stop; 37918 (0x69a1a0) the kIsAMount refresh; 19519
(0x2d9c60) the Hello lookup; 32493 (0x5340a0) the topic-by-type lookup; 25541 (0x3e8160) the DialogueItem build;
37367 (0x66b410) the say; 37818 (0x693680) dismount; 38757 Actor::InterruptCast; 44289 (0x7f1e70) the VATS call;
40496 (0x737310) the dialogue camera's angles; 14629 (0x1e0850) the kHasSpokenFlag setter; 24131, 24124 (0x3a0d20,
0x3a0570) the scene notices; 52856 (0x977030) the menu hide; 37552 (0x67cc70) Actor::EndDialogue (slot 0xDA, the
NPC-to-NPC end); 37548 (0x67c240) InitiateDialogue (slot 0xD8); 37541 (0x67a140) UpdateInDialogue (slot 0x4C); 37741
(0x68eb00) PauseCurrentDialogue (slot 0x4F); 37248, 37247 (0x662170, 0x662150) SetCurrentScene, GetCurrentScene; 37504
(0x6764e0) Actor::EnableAI and 54919 (0x9f5280) its Papyrus thunk; 19801 (0x2ec7e0) the reference unload that frees
the process. Singletons: 401099 MenuTopicManager, 403521 PlayerCharacter (Offsets.h:451), 401069 the player as a
reference (unnamed in CommonLib), 401585 CrosshairPickData, 400315 ProcessLists (HYPOTHESIS by use), 400476
BGSStoryTeller (Offsets.h:73), 400883 VATS (VATS.h:50), 402638 UserEvents (Offsets.h:577), 400312 the invalid handle.
GameSettings by value address: 370987 (awarePlayerTimer at the start), 370718 (the pending start's distance), 370304
(headTrackTargetTimer at the end). Vtables: 207511 Actor, 195816 TESNPC, 208723 ActivateHandler.
