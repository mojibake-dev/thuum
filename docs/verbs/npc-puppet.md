# Verb: npc-puppet

Drafted 2026-10-21 (M3's second verb, docs/PLAN.md, the M3 section) from
ADR-035 point 4 and the client half of point 1 (docs/DECISIONS.md:1256-1260,
:1274-1292), docs/research/m3/re-ai-puppet.md (the engine's switches, static,
1.6.1170), skymp-hosting.md, the readings of 2026-10-17 and -18 and
docs/verbs/cell-host.md, before any code. The cut (rule 3): the games that do
not host a cell show its NPCs as puppets; the engine's own placed references
are kept on every game, the world cleaner stops deleting them and the
PlaceAtMe copies retire for them; the loader's three bans lift behind
npcEnabled; the engine-side promote and demote switches exist (re-ai-puppet.md
Q4). Not here: the host's new stream (npc-stream, point 5), the recorded
state replayed before a grant (npc-handoff, point 7), hits, deaths, spawns
and the leveled roll (npc-fate, point 6).

## Intent

Every game that does not host a cell shows that cell's own NPCs as puppets:
the engine's placed references, AI off, graphs still ticking, bodies at the
host's relayed positions and events, no copy and no deletion; the host's
game runs them under the engine as today, and a grant or release flips a
game's puppets live or back.

Roadmap reference: skymp/ROADMAP.md "NPC" (packages; NPCs travelling out of
sight), skymp-hosting.md:440-444.
Milestone: M3   Class: B

## Why now: playtest thirty's wolves (measured 2026-10-21)

The first live run with the server's NPCs on (fork parity 535544db,
cell-host merged) showed the forest cell's wolves spinning in place on both
screens within a minute; the relay echo's fix (m3-relay-echo 41f554ad) and a
swap of the host changed nothing. Two defects of the copies model, measured
(numidium's reads on the host seat, results playtest-30-wolves/01 to 08; the
code trace, the prior-art read and the REA read of the same afternoon,
docs/LOG.md):

1. The host never learns it hosts an actor from the game files. CreateActor
   sent such an actor under id + 0x100000000 (PartOne.cpp:979-983 on
   535544db); the grant's flip went out as UpdateProperty isHostedByOther
   under the raw u32 id (UpdateHoster, MpObjectReference.cpp:737-747;
   skymp.rs:426); the client routed any id under 0xff000000 to its
   engine-reference branch, which applies inventory, isOpen, isHarvested and
   disabled alone (remoteServer.ts:785-804, :975-980). So the form's flag
   stayed true (created before the grant) or undefined (after it), isMine
   (hostService.ts:56) and the report list (:76) never admitted the actor,
   and the server's record of 0x85547 stood at one position and heading
   across five reads 2 s apart (results 07). cell-host.md had recorded the
   defect as kept "until npc-puppet" without seeing that it left every
   game-file actor unhosted in effect; CellHostTest covered a 0xff actor
   alone.
2. Every copy, on every screen, was re-applied every 2 s against that frozen
   record (formView.ts:478-490), and the apply's hold,
   keepOffsetFromActor(self, 0,0,0, 0,0, offsetAngle, 1, 1) with the angle
   unwrapped (movementApply.ts:72-79), is a turn that renews itself every
   frame: the planner agent MovementPlannerAgentKeepOffset (42182) sets the
   facing goal to the actor's OWN data.angle plus the offset each frame, in
   the per-frame pass that runs with or without kProcessMe, and
   ClearKeepOffsetFromActor (37895, then 41734) only flips a mode byte,
   taking effect in a motion-driven controller state alone (REA on sky-re,
   2026-10-21, CONFIRMED-STATIC for the mechanism, the Engine surface
   below). The measured cadence (a moveBackward/moveForward pair every 2 s
   on a wolf near nobody, results 03) is the re-apply's; a re-apply landing
   within 5 degrees froze a wolf for good (Eli: "on test 1 one wolf has
   stopped spinning"). Beside it the copies' own AI fought the host player
   (Aggression 2 on wolf copies, formView.ts:267-268, their attacks blanked;
   inCombat true, target 0x14, results 02). Whether the heading kept turning
   through the 15 s AI-off window is unmeasured (the watch recorded no
   heading, and with AI off the animation stage is gated, so a still model
   proves nothing): probe P0 in the Dynamic plan.

Three rules the working projects make structural (docs/research/m3/
tes3mp.md and te-npcs.md, the prior-art read of 2026-10-21) are this
verb's. A: nothing multiplayer writes to an actor this game hosts (no first
apply, no replayed animation, no clear, no 0xff blank, no echo; TES3MP's
server skips the sender, apps/openmw-mp/Cell.cpp:202, Skyrim Together's
too). B: a puppet's heading and position are written absolutely from the
host's sample, never as a goal relative to the actor itself (TES3MP
DedicatedActor.cpp:106; TE InterpolationSystem.cpp:95-121). C: one brain
switched at one gate, the animation system live and fed the host's inputs
(TES3MP's shape; TE's AI-on-outputs-blocked shape pays at every handoff,
TE#810 and #898, and its #901, a zero controller timestep when the movement
step is skipped, is hook 3's R1 below). ADR-045 records the decisions.

## Inventory (ADR-031: the action's consequences, before its rung)

The action is "a second game shows a cell another game hosts, while the
host's NPCs act". The engine alone, from the references (r-npc-packages
20261019-021451, x-npc-puppet 20261017-082859 and 20261019-022024;
readings-2026-10-17.md and -18.md), the records (riverwood-ids.md) and the
code read (skymp-hosting.md, on parity ef44a1d8 unless a tree is named):

| consequence | seen in | disposition |
| --- | --- | --- |
| the package walk (nine of fourteen residents moved, Gerdur 2414 u south, readings-18:21-34) | trace r-npc-packages | native on the host; imposed on a puppet: the relayed transform by translateTo and the walk cycle by the relayed Speed, Direction and run mode on a ticking graph (Impose; H2, H3) |
| work and dialogue idles (IdleHoe, IdleBlacksmithForgeEnter, IdleLeverPushStart, DialogueHappy, readings-18:21-28) | trace | native on the host: an engine id passes the 0xff idle blank (animation.ts:403 on m3host: selfId below 0xff000000 returns), so the host's own NPCs idle again; imposed on a puppet: the relayed event replayed on the re-admitted graph (H1) |
| the copy's AI pulling against KeepOffsetFromActor on a non-host (movementApply.ts:61-98; skymp-hosting.md:31-34) | code | suppressed: AI off (kProcessMe) and the movement step skipped (Suppress) |
| the graph frozen by AI off (head bit-identical over 0.4 s, readings-18:83-85) | trace x-npc-puppet | suppressed: the engine's own animation job queued for puppets (Impose, hook 2a) |
| the movement step's slide under a stagger with AI off (40 to 42 u/s, 120 u, readings-18:92-96) | trace | suppressed: 37356 skipped for puppets (hook 3) |
| a hit drafting the AI-off NPC into combat (combatTarget the player, inCombat true, readings-18:100-102) | trace | suppressed: StopCombatAndAlarmOnActor at demotion and from the combatState event for a puppet (H6) |
| the stagger taken with AI off and played when AI returned (readings-18:89-92, :103-106) | trace | native: a puppet's graph ticks, so a taken reaction plays; its number is the server's (later: npc-fate); the host's relayed staggerStart on top of a local one: H9 |
| detection (the stealth meter), package dialogue and idle chatter (41408 skips an AI-off actor; 37752 and 39333's gated callers; re-ai-puppet.md:191-193, :228-240) | code | suppressed on a puppet by the AI bit; native on the host; the voice line itself: later, npc-stream (TES3MP's ActorSpeech, tes3mp.md:81); event barks from ungated callers: H7 |
| every engine actor within 8192 units deleted by every client (worldCleanerService.ts:37-108, the same on m3host) | code | suppressed: the cleaner keeps every engine-placed reference (form id below 0xff000000); unprotected 0xff actors the engine spawns are deleted as today until npc-fate |
| the PlaceAtMe copy of an ESM actor's base (formView.ts:131-136, :185 on m3host; the server's id + 0x100000000, PartOne.cpp:979-983 on m3host) | code | suppressed: the view binds the engine's own reference; copies stay for server-made actors and players' figures (ADR-035 point 1) |
| a copy lacking the reference's linked refs, aliases, editor location and scripts (ADR-035 :1226-1227, untested) | ADR | native: the kept reference has them; that the host's schedules then run as the solo references did is H8 |
| a leveled base rolled per game (formView.ts:155-156; a placed LVLN such as 0x85547 resolved by each engine); a death's respawn after 25 s (MpActor.cpp:1941) | code, record | later: npc-fate (one roll per cell by the server; deaths that persist); until then a kept leveled reference may differ in species between games: H10 |
| essential, protected, unique, crime-faction and playable-race NPCs never loaded (WorldState.cpp:519-585; on m3host :506 npcEnabled, :541 CrimeFactionsList 0x26953, :585-587 the race list) | code | imposed: the three bans lifted behind npcEnabled on the probe-only setting (ADR-035 point 9); dead-at-start and initially disabled references stay skipped (:477-501 on m3host) |
| the puppet's health, equipment and inventory (the copy's deferred kill and 1,000,000 health, formView.ts:313-319; the 25% step toward the relayed percentage, movementApply.ts:63-67) | code | imposed as today on the kept reference (startDeferredKill, skyrimPlatform.ts:2202; the step); the live values: later, npc-stream (HostedActorState) |
| a persistent NPC through a door (Embry into the inn, readings-18:36-43) | trace | native on the host; on a puppet: later, npc-handoff (a relayed report in another cell moves the reference with MoveTo, TESObjectREFR.h:456, where today's copy respawns, movementApply RespawnNeededError, skymp-hosting.md:278-279) |
| the observer's shape kept: head tracking on the look-at point, blockActivation, the local attack events blanked unless relayed (movementApply.ts:37-59; animation.ts:383-394 for a view with default animations disabled) | code | imposed as today on the puppet (setDefaultAnimsDisabled(refrId, true), formView.ts:454 on m3host) |

### Sequences and combinations (ADR-033)

| sequence or combination | probe or scenario | result |
| --- | --- | --- |
| the same NPC puppet, live, puppet again at a person's rhythm (the host out past the grace, back, out again, three flips in a minute) | b-npc-puppet | |
| a puppet hit by the local player: the shout's first word (x-npc-puppet's 0x13E09), a melee swing, a bolt | b-npc-puppet (the shout); x-npc-puppet-2 | |
| the host's NPC fighting (r-npc-fight's bandits) while a puppet elsewhere: the relayed attack events play, nothing is decided | x-npc-puppet-2 reads them; c-dungeon-enemies after npc-fate | |
| both seats hosting neighbouring exterior cells, each game with live and puppet NPCs at once (c1 at (4,-12), c2 at (6,-11): the cells outside c1's 3x3 are c2's) | b-npc-puppet | |
| a login into a hosted cell (the newcomer's NPCs start as puppets); a server restart with both seats in the cell (every NPC a puppet until the first grant) | b-npc-puppet | |
| the host relaunches (its NPCs puppet on the release, live again at the new grant: b-cell-host's epoch 3) | b-npc-puppet | |
| a puppet whose cell the engine detaches (the player walks away; the reference reloads later, puppet by default) | x-npc-puppet-2 | |

## Authority

Rung: R2 for what a puppet shows (the host computes the NPC's transform and
graph events, the server records them under cell-host's bounds, the puppet
plays the relay); R0 for which NPCs exist (the loader) and whose they are
(cell-host's grant); R3, declared, for the switch itself: whether an actor in
this game is a puppet is derived from the grants held and never reported.
Why not R1 for the puppet's state: a puppet reports nothing, and the host's
reports are bounded as cell-host says (same cell, under 4096 units a report,
MovementValidation.cpp:96-101; no speed budget for NPCs, docs/verbs/
movement-speed.md:29-30); beyond those bounds the host's word is recorded
unvalidated (rule 5, R2); the numbers (damage, death) are R0 in npc-fate.
What the server validates or records: unchanged from cell-host.
Rate limit / bounds: none new; the stream keeps its own (movement every
130 ms, sendInputsService.ts:138 on m3host).

## Engine surface

- The bit: RE::Actor::BOOL_BITS::kProcessMe (CommonLibSSE-NG
  include/RE/A/Actor.h:160), set and cleared by Actor::EnableAI (:521;
  src/RE/A/Actor.cpp:230-240: the bit, and on false the char controller's
  linear velocity zeroed), read by IsAIEnabled (:579; Actor.cpp:741-744).
  The gate's other terms: kInTempChangeList (Actor.h:168), TESForm's
  kStillLoading (include/RE/T/TESForm.h:89), currentProcess (Actor.h:651).
- The stages (re-ai-puppet.md:51-71): the job table's "Actor movement"
  39053 and "Actor animation" 39054 (:59-61); the four-part gate on
  kProcessMe shared by 41369, 41466 and kin (:67-71, CONFIRMED-STATIC by
  disassembly). ProcessLists::GetSingleton, highActorHandles, runSchedules,
  runMovement, runAnimations (include/RE/P/ProcessLists.h:36, :69, :94-96).
- Hook 2a's targets, from the research with its tags: 41370 (HYPOTHESIS name
  ProcessLists_QueueActorAnimation, :136-138) partitions highActorHandles
  with 41466 (:139-143) and queues the job 41453 per actor (:144-150, the
  unrolled vtable 0x7D UpdateAnimation, Actor.h:326); the engine's own push
  is 69349, `FUN(jobList, job, handle, 0)` (:270-273). Rejected by the
  research: a vtable 0xAE UpdateNoAI hook (Actor.h:372; it runs twice a
  frame for an AI-off high actor, 41369 and 41447, :159-162) and a byte patch
  of 41466 (:276-278).
- Hook 3's target: 37356 (HYPOTHESIS name Actor_MovementStep, :122-132,
  CONFIRMED-STATIC that no kProcessMe test exists in it or in 37350, 37355,
  41717); Skyrim Together skips it on remotes (te-npcs.md:139-140;
  docs/TE-MAP.md:57, a lead only, ADR-005).
- The demote and promote calls: ProcessLists::StopCombatAndAlarmOnActor
  (ProcessLists.h:47; src/RE/P/ProcessLists.cpp:108; 41340, :286-288),
  Actor::StopMoving (Actor.h:628; 37817, :256), EnableAI, Actor::SetPosition
  (Actor.h:367, vtable 0xA9; 37309, :313-317), Actor::EvaluatePackage
  (Actor.h:523; Actor.cpp:249-254; 37401, :341-348: (true, false) runs
  CheckForNewPackage 39114 at once, in sit states 0, 3 and 7 only; (true,
  true) also stops combat), IsInCombat (:425), GetCurrentPackage (:536).
  SetDontMove and SetRestrained are left alone: they set lifeState 9 or
  kRestrained (include/RE/A/ActorState.h:15) and fight death for the field
  (:254-260).
- The events (ADR-034): RE::TESCombatEvent { actor, targetActor, newState }
  with kNone, kCombat, kSearching (include/RE/T/TESCombatEvent.h:9-24), sunk
  by Skyrim Platform (skyrim_platform/EventHandler.h:34) as combatState
  (skyrimPlatform.ts:651); TESCellAttachDetachEvent (include/RE/T/
  TESCellAttachDetachEvent.h:10-14) as cellAttach and cellDetach (:756-760);
  packageStart, packageChange, packageEnd (:785-792; the sink
  EventHandler.h:53; CommonLib's pin has no TESPackageEvent.h to cite).
- Skyrim Platform's natives on the puppet: enableAI (skyrimPlatform.ts:2031),
  isAIEnabled (:2100), evaluatePackage (:2038), stopCombat (:2205),
  getCombatTarget (:2055), getCurrentPackage (:2057), isInCombat (:2120),
  setAnimationVariableFloat (:1983), translateTo (:2003), setPosition
  (:1997), clearKeepOffsetFromActor (:2023), moveTo (:1955), startDeferredKill
  (:2202); behind them NotifyAnimationGraph and SetGraphVariableFloat
  (include/RE/I/IAnimationGraphManagerHolder.h:25, :52).
- Address Library IDs: every id above is the research's, resolved there by
  `just addr` (re-ai-puppet.md:9-14: RVAs are supporting data and
  HYPOTHESIS; the id is the answer). None is written here from memory.
- R1, the character controller's step time (the re-analyst, REA on sky-re,
  2026-10-21 18:0x; Skyrim Together's #901 is the hazard: skipping the
  movement step left a new controller's hkStepInfo at zero and the
  rigid-body controller's SetLinearVelocity and SetPosition divided by it).
  CONFIRMED-STATIC: 37356 (RVA 0x6698d0) reads the controller through 39856,
  which IS AIProcess::GetCharController (AIProcess.cpp:32), and touches
  three controller fields only (flags kFollowRagdoll +0x218, the kAnimAngleMod
  test with pitch and roll +0x24C/+0x250); no instruction in it, in 37350,
  41444 or 41306 addresses stepInfo (+0x80..+0x8C, bhkCharacterController.h:
  97; hkStepInfo.h: deltaTime +8, invDeltaTime +0xC). The stamp is two
  stores inside 78275 (HYPOTHESIS name bhkCharacterController_Simulate, RVA
  0xe9f170; `movss [rsi+0x88], xmm1` at 0xe9f905 and the reciprocal at
  0xe9f915), reached from 37356 only through vtable 0xC8 Actor::Move (37507,
  RVA 0x6768a0), which builds the 0x24-byte block {delta, angles,
  translation rotated into world, speed, nearCamera} and calls 78275 for an
  actor that may move; seated and don't-move actors take 78276 and
  SetPositionImpl with no stamp (the engine itself leaves them unstamped).
  The value: the Havok time simulated this frame, global 389089 (RVA
  0x202c688; 77850 computes it per frame from fMaxTime:HAVOK times the time
  multiplier, capped at uMaxNumPhysicsStepsPerUpdate steps, zero on a
  sub-millisecond frame), else the block's delta split by the substep
  count. The hazard is the rigid-body controller's alone: 79198 (slot 7
  SetLinearVelocityImpl) and 79193 (slot 3 SetPositionImpl) pass +0x88 to
  62456, `accel = dv / timestep`; the proxy controller's slots read no step.
  37356's early paths: a cell not attached writes the position through 19790
  and returns (no Move); ragdoll, reanimating and get-up reduce the step to
  a zero input plus the flag and still Move; a sitting rider Moves into the
  unstamped seated branch. No smaller "stamp the time" function exists.
  Shape chosen (hook 3 as built): a flagged actor gets Move(delta, zero)
  when it has a controller and an attached cell, kFollowRagdoll set first in
  ragdoll; the controller ticks and stamps at rest where the relay last
  warped it, gravity settles it, the divisions stay finite, the step's own
  output, rotation and feedback are skipped. HYPOTHESIS until P1's trace;
  fallback (shape 4): a plain early return plus one Move(delta, zero) while
  stepInfo.deltaTime reads 0. Falsifiers: a +0x88 store outside 78275; a
  puppet's controller vtable being the proxy's (240560, then the plain
  return is safe here); a fresh controller reading a non-zero +0x88 before
  any 78275 call; Move's tail moving the data position by more than
  physics settling between relay ticks (then shape 4).
- The prototypes of 41370, 41453 and 37356 for the two detours, and the push
  69349's arguments (the research gave rcx as the Actor* for Frida, :358-359,
  which holds for 37356 and not for 41370 or 41453, and the push's four
  arguments, :272, of which the fourth is dead).
  Resolved 2026-10-21 (the re-analyst, REA 6.7.0 over Ghidra 12.1.4 on
  sky-re, program SkyrimSE-1.6.1170.0.exe.unpacked.exe, seeded with
  CommonLib's names: 614 functions, 15,843 labels; every REA answer
  "observed", "shipped-artifact"; every id resolved with `just addr`, the
  RVA supporting data and HYPOTHESIS, the id the answer; CONFIRMED-STATIC
  means the instruction or decompiled line is in the binary as read, not
  that the game behaves so; none of the four target functions has a
  CommonLib or seed name):
  - 41370 (SkyrimSE.exe+0x7709c0, 729 bytes; HYPOTHESIS name
    ProcessLists_QueueActorAnimation): `void (RE::ProcessLists* self /* rcx
    */, JobList* jobs /* rdx */)`. self is the ProcessLists singleton (the
    caller loads 400315, ProcessLists::GetSingleton::singleton,
    src/RE/P/ProcessLists.cpp:13); 41370 reads self+0x1E6 (runAnimations,
    include/RE/P/ProcessLists.h:96) and self+0x40 (highActorHandles' size:
    the array at +0x30, :69; a BSTArray's size at +0x10,
    include/RE/B/BSTArray.h:374-376, :140-141). jobs is the stage's job
    list, passed verbatim as the first argument of both pushes; the stage
    takes it from the table 403091 at index 5 through 35404 and runs it
    through 69352 into 69376 after 41370 returns; CommonLib only
    forward-declares BSJobs::JobList (include/RE/I/IVirtualMachine.h:13-15,
    :65), so the name is HYPOTHESIS and the layout CONFIRMED-STATIC. Gates in
    41370 itself: runAnimations != 0 and the size != 0, nothing else; no
    read of +0xE8 (kProcessMe) in its 213 instructions. CONFIRMED-STATIC.
    Body: two BSScrapArray<Actor*> (68160, 68162), 41466(&highActorHandles,
    &{&listA, &listB}); for every Actor* in list A an ActorHandle minted
    inline (the +0x28 refcount test under 0x3ff, else 12325, the sentinel
    400312 for a zero count) and 69349(jobs, 41453, handle, 0); for list B
    the same with 41454; then the arrays' references released.
    CONFIRMED-STATIC. Callers: exactly one, the stage function 39054
    (+0x6d2670), the main loop's table entry 380490 named "Actor animation"
    (206263); the other incoming reference is .pdata, so 41370 is not
    virtual. CONFIRMED-STATIC.
  - 41466 (+0x777480; HYPOTHESIS name ProcessLists_PartitionAnimatedActors):
    `bool (RE::BSTArray<RE::ActorHandle>* highActors /* rcx */,
    RE::BSScrapArray<RE::Actor*>* out[2] /* rdx */)`, returns true always.
    Per handle it resolves the actor (17201) and admits it to list A when
    all hold: boolBits bit 9 clear (+0xE8, kInTempChangeList, Actor.h:168),
    formFlags bit 21 clear (+0x10, kStillLoading, TESForm.h:89), boolBits
    bit 1 set (kProcessMe, Actor.h:160; the instructions at +0x7774e8 and
    +0x777505), currentProcess non-null (+0xF8, Actor.h:651 with the
    1.6.1170 shift :712), Get3D2() and its parent non-null (slot 0x70,
    TESObjectREFR.h:308; NiAVObject::parent +0x30, NiAVObject.h:153),
    formFlags bits 5 and 11 clear (kDeleted TESForm.h:62, kDisabled :75),
    parentCell non-null (+0x60, TESObjectREFR.h:496) with cellState 7
    (kAttached, TESObjectCELL.h:139, :259); and to list B as well when the
    cell's formFlags bit 13 is set (the pin's generic names for bit 13,
    TESForm.h:80-81; the CELL meaning not named there). CONFIRMED-STATIC.
    This is the only kProcessMe test on the animation path.
  - 41453 (+0x776a90, 199 bytes; HYPOTHESIS name
    ProcessLists_ActorAnimationJob): `void (RE::RefHandle handle /* ecx: the
    32-bit ActorHandle value */)`. Only ECX is read before the lookup; rcx is
    NOT an Actor* (the research's :358-359 is wrong for it). The handle is
    resolved by 12922, which checks the handle's age against
    BSPointerHandleManager's entries and fills a NiPointer<Actor>; null
    returns. CONFIRMED-STATIC. Body, with the actor: delta =
    GetSecondsSinceLastFrame (410199, src/RE/M/Misc.cpp:82-86) times
    44302(VATS singleton 400883) (HYPOTHESIS: 1.0 outside VATS; 37361 and
    37363 apply it only in VATS mode 4 for the VATS target); then
    37364(actor) (HYPOTHESIS: the transform into the graph manager),
    20121(actor) and 20122(actor) (HYPOTHESIS: attached-node bookkeeping and
    loadedData's timed entries, +0x68, TESObjectREFR.h:497), 20123(actor,
    delta): a BSAnimationUpdateData on the stack (deltaTime,
    include/RE/B/BSAnimationUpdateData.h:9-27), slot 0x79
    ModifyAnimationUpdateData (Actor.h:322) and
    IAnimationGraphManagerHolder::UpdateAnimationGraphManager on actor+0x38
    (32899, src/RE/I/IAnimationGraphManagerHolder.cpp:65-70; the holder at
    +0x38, TESObjectREFR.h:112): the graph tick; then
    39896(currentProcess, actor) (HYPOTHESIS: the knock-state machine,
    returning at once for a null middleHigh, AIProcess.h:196, or kNormal),
    then 37363(actor, delta) (its only caller; when not sitting, knocked or
    bleeding out, and the char controller's lodDistance, +0x29C,
    bhkCharacterController.h:142, within settings 370871 or 370879, slots
    0x122 and 0x123 with delta, then 37976); finally the handle's reference
    released. CONFIRMED-STATIC for the sequence. Against vtable 0x7D
    UpdateAnimation (37361, Actor.h:326): a sibling with the same core, not
    the vtable body unrolled (37361 gates on Get3D2, its parent and
    currentProcess itself, uses 20119, inlines 37363's body, adds 37976 and
    a cell-flag-13 branch, 37287). CONFIRMED-STATIC. Hidden gates for hook
    2a: no instruction in 41453, 37364, 20121, 20122, 20123 or 37363 reads
    +0xE8; 39896 reads it once and tests only bit 31 (kParalyzed,
    Actor.h:190) inside the knockState path; so a 41453 queued for an AI-off
    actor runs the graph tick. CONFIRMED-STATIC for those six bodies, their
    callees not walked (HYPOTHESIS that none re-tests the bit; IsAIEnabled is
    inline in CommonLib, src/RE/A/Actor.cpp:741-744, so only a +0xE8 read
    could hide it). Callers: none by call; 41370 takes its address; the
    consumer calling fn(arg) is 69376's thread code, not read (HYPOTHESIS:
    the job argument arrives in rcx as stored).
  - 41454 (+0x776b60), the list-B job: `void (RE::RefHandle handle /* ecx
    */)`: the same lookup, one call 37286(actor), the release; not an
    animation update (HYPOTHESIS: the per-frame step for actors whose cell
    has form flag 13). CONFIRMED-STATIC for the body.
  - 69349 (+0xcf66b0; HYPOTHESIS name JobList_AddJob): `void (JobList* jobs
    /* rcx */, void (*job)(std::uint64_t) /* rdx */, std::uint64_t arg /* r8
    */)`. The list's first qword points at a BSTArray<Job> {data +0,
    capacity +8, size +0x10}, grown by one 16-byte element through 68163
    with the heap allocator functor (186376, include/RE/Offsets_VTABLE.h:30),
    then [elem+0] = job and [elem+8] = arg; the TLS slot +0x768 is set to
    0x59 around the growth and restored (HYPOTHESIS: a memory-manager context
    tag). The fourth argument is dead: every caller zeroes r9d and 69349
    never reads r9 (HYPOTHESIS: a source parameter this build ignores); a
    detour may pass 0. The handle rides in the low 32 bits of arg. Thirty
    callers, among them 41306 (the movement queue), 41367, 41374, 41380,
    41301. CONFIRMED-STATIC.
  - 37356 (+0x6698d0, 3986 bytes, 27 virtual calls; HYPOTHESIS name
    Actor_MovementStep; Skyrim Together's lead docs/TE-MAP.md:57): `void
    (RE::Actor* self /* rcx */, float delta /* xmm1 */)`. It reads +0xF8
    currentProcess, +0x38 the graph holder, +0x150 movementController
    (Actor.h:667 with the shift), +0xC8 and +0xCC actorState1 and 2
    (ActorState at +0xC0, Actor.h:737-741; ActorState.h:203-204), +0x60
    parentCell, +0x48 to +0x5C angle and location (OBJ_REFR at +0x40,
    TESObjectREFR.h:73-80, :495), +0x10 formFlags; delta is the per-actor
    delta from the movement table. CONFIRMED-STATIC. Gates, none on
    kProcessMe (no read of +0xE8): the movement runs when currentProcess is
    null, or when the actor is not Actor::IsInRagdollState (37491), not
    actorState2.reanimating (bit 4 of +0xCC, ActorState.h:128) and knockState
    != kGetUp (:115, :60), else it only flags the char controller (+0x218 |=
    0x1000); skipped for a sitting rider (sitSleepState kIsSitting, :112,
    :71, with 17965: not boolFlags kIsAMount, Actor.h:197, and
    ExtraDataList's kInteraction 0xA9, ExtraDataTypes.h:343); with the graph
    variable bIsSynced (FixedStrings +0x578, FixedStrings.h:193; holder slot
    0x12, IAnimationGraphManagerHolder.h:42) set and processLevel kHigh
    (process+0x137 == 0, AIProcess.h:225, :26) the translation and rotation
    come from 39589 and 39597, else from the movement controller (slot 7 on
    +0x150, with delta and an output block) after bSpeedSynced (+0x580, :194)
    and Speed (+0x508, :179; holder slot 0x10, :40) scaled by
    TESObjectREFR::GetScale into 39873, with 39878 and the setters 39880,
    39882, 39884, 39886. CONFIRMED-STATIC. Then slot 0x11A
    ModifyMovementData(delta, &translation, &rotation) (Actor.h:480); the
    rider variables HasTweenSpeed, TweenSpeed, bTweenUpdate (FixedStrings.h:
    161-163); if parentCell is null or not kAttached, or 40413(player)
    holds, the position is written through 19790 (the data-position writer
    the research saw inside SetPosition) and it returns; else
    Actor::SetRotationZ (37230) with the rotation, a pitch clamp (settings
    371032, 380228, 371029, 371026, 382579), then the position: formFlags bit
    4 clear means slot 0xC8 Move(delta, &translation) (Actor.h:398), set
    means a rotation matrix (70233) and slot 0xA9 SetPosition(&pos, true)
    (Actor.h:367); then, with flyState (bits 18 to 20, ActorState.h:113) 0
    or 5 and the global byte 389168 clear, slot 0x11D
    ComputeMotionFeedbackSpeedAndDirection (Actor.h:483) and on true slot
    0x11E UpdateFeedbackGraphSpeedAndDirection (:484). CONFIRMED-STATIC for
    the calls, HYPOTHESIS for the data block's field meanings. Callers:
    exactly one, 37350 (+0x669010); the other reference is .pdata, so 37356
    is not virtual. The chain: stage 39053 calls 41306(ProcessLists* /* rcx
    */, float delta /* xmm1 */, JobList* /* r8 */), which, when runMovement
    (+0x1E5, ProcessLists.h:95) is set, fills the static table 404437 of
    16-byte entries {Actor* +0, float delta +8, bool +0xC} for the first
    min(size, 128) high actors and pushes 69349(jobs, 41444, index, 0) per
    actor and 41445 for the player; 41444 is `void (std::uint32_t index /*
    ecx */)`: the entry's actor, its currentProcess and the flag required,
    then 39447(process, -1) and 37350(actor, entry.delta); 37350 is `void
    (RE::Actor* /* rcx */, float delta /* xmm1 */)`: 39447 again, a VATS
    delta substitution (delta 0, processLevel kHigh, VATS mode 4, the VATS
    target), 41717(movementController) (the message pump, controller fields
    only), and for delta > 0: 37355(actor) (the controller mode from
    bAnimationDriven +0x568 and bAllowRotation +0x570, FixedStrings.h:
    191-192, through 32716, 32717, 32718 and 37997), 37356(actor, delta),
    slot 0x11B (Actor.h:481), the kMountPointClear logic on +0x204 bit 2
    (:198), slot 0x11C on the char controller (:482; the getter 39856,
    HYPOTHESIS AIProcess::GetCharController, MiddleHighProcessData.h:183),
    slots 0xAF and 0xB0 (:373, :374), 39548(process, actor); always
    39448(process) == -1 then 39599(process). kProcessMe: no read of +0xE8 in
    41306, 41444, 37350, 37355, 37356 or 41717 (every instruction of the six
    bodies read): the research's :131 stands, and the two job wrappers above
    it are ungated too. CONFIRMED-STATIC.
  - Handles for the detour: CommonLib's actor->GetHandle() (Actor.h:546;
    src/RE/A/Actor.cpp:458-461; BSPointerHandle.h:106-108 to :180) is
    BSPointerHandleManagerInterface::GetHandle, 16212 (BSPointerHandle.h:
    210-215): the sentinel 400312 for a zero refcount under 0x3ff, else
    CreateRefHandle (seed-named), the same test 41370 inlines; 41453's
    lookup 12922 checks the same manager entries and age bits. HYPOTHESIS
    that the two paths yield the same handle value.
    LookupReferenceByHandle (Misc.cpp:88-91, include/RE/Offsets.h:582) is
    12332, a third entry point.
  - Side effects (HYPOTHESIS): a detour on 41370 that calls the original and
    then pushes 69349(jobs, 41453, GetHandle(puppet), 0) per flagged puppet
    gives the puppet the engine's graph tick (20123) in the engine's own
    stage and thread model, plus 37364, 39896 (a knocked-down puppet goes
    through get-up) and 37363; harmless on an actor without a graph manager,
    but the detour should still require 41466's other terms (3D with a
    parent, an attached cell, not deleted or disabled, currentProcess
    non-null) before queuing. A detour on 37356 that returns early for
    puppets removes the controller output, Move and SetPosition,
    SetRotationZ, the pitch clamp, the tween variables and the feedback into
    39873, 39878 and slot 0x11E, while 37350 still runs slots 0x11C, 0xAF and
    0xB0 on the char controller; it also removes the 19790 fallback write
    for a puppet whose cell is not attached. The relayed SetPosition stands
    either way.
  - The Frida trace that confirms it (module base plus `just addr`): 41370
    entry (rcx ProcessLists*, rdx jobs; one call a frame expected); 41466
    exit (the two lists' sizes at +0x10 of each BSScrapArray); 20123 entry
    (its only caller is 41453; rcx Actor*, formID at +0x14, TESForm.h:354;
    xmm1 delta): the "did the graph tick for actor X" counter, 37363 entry
    the same way; 41453 entry (ecx handle, against CommonLib's GetHandle of
    the test actor); 32899 entry (rcx holder = actor+0x38, rdx the update
    data, deltaTime at +0); 37356 entry (rcx Actor*, xmm1 delta) and 41444
    entry (ecx index into 404437). P1 as written: expect 20123 and 37363 at
    0 for the AI-off actor while 37356 stays per frame; with hook 2a on,
    20123 per frame for the puppet. Falsified by: 32899 at 0 for the AI-off
    actor while 20123 is called for it (a gate in a callee not walked);
    12922 refusing handles minted by CommonLib's GetHandle; a crash or null
    actor in a queued 41453; 41370 entered twice a frame or from another
    caller; a +0xE8 read in the six movement bodies on another build (the
    gate claim is for 1.6.1170 only); 37356's xmm1 unequal to 41444's entry
    delta.

## Observe (host or acting client sees the intent before the engine acts)

- Hook point: none new on the host (cell-host's stream is the host's report).
  On a puppet game: Skyrim Platform's combatState for a puppet whose newState
  is kCombat or kSearching (a hit or a script drafted it, re-ai-puppet.md:
  181-187); HostService's grant and release (the promote and demote
  trigger); cellAttach for an engine actor (puppet by default: TES3MP's AI
  off everywhere, on only in the cells this game hosts, tes3mp.md:100-107);
  the package events on a puppet as a check that should stay silent.
- SP filter (minSelfId / maxSelfId / eventPattern): no sendAnimationEvent
  hook is added (the host's AnimationSource is cell-host's); the two native
  detours test the puppet set in native, one lookup per high actor per
  frame (at most 128, :114), nothing crossing into JS (rule 9).
- Data captured: the actor's form id and combat state, kept in this game; a
  puppet reports nothing to the server.
- Side effects of hooking here: the stop arrives one event after the draft,
  so a flicker of combat music or HUD on the puppet game is possible;
  HYPOTHESIS until x-npc-puppet-2 (H6).

## Impose (observers render the server's decision)

- Mechanism: PuppetService calls the Skyrim Platform export
  setPuppet(actorId, true) (as built, fork d9a003fd: PuppetApi.cpp, the flag
  set at once in the mutex-guarded set Puppets, the engine calls queued to
  the game thread, performAction's shape), which runs Q4's demote natively
  (re-ai-puppet.md:351-354): StopCombatAndAlarmOnActor(actor, false), the
  keep-offset cleared through the engine's own function (37895, not in
  CommonLib), EnableAI(false), the actor left in high process (StopMoving
  dropped: EnableAI(false) zeroes the controller's velocity itself). Hook
  2a (PuppetHooks.cpp, a Frida Gum replacement of 41370, the DamageActor
  hook's idiom): the original, then for each flagged actor in
  highActorHandles that passes 41466's admission without its kProcessMe
  term (AI off, a process, not in a temp change list, not deleted or
  disabled, an attached cell, 3D with a parent) the engine's own job 41453
  queued on the same job list through the engine's push 69349, so the graph
  updates in the engine's stage and thread model (:268-273); an AI-on actor
  is never queued twice. applyMovement's puppet branch
  on the engine reference: translateTo toward the relayed point with the
  speed lead and setPosition for a jump of 1024 or more (movementApply.ts:
  196, :239-301 on m3host); the relayed run mode, Speed and Direction written
  as graph variables before the step (setAnimationVariableFloat;
  cast-action's shape, variables first, ADR-032); no keepOffsetFromActor on
  a puppet (H4). applyAnimation's Debug.sendAnimationEvent on the engine
  reference for every relayed event (animation.ts:210), oldest first as the
  view already replays them (formView.ts:511-518 on m3host); head tracking,
  blockActivation and the health step as today.
- Visual without simulation achieved by: AI off plus the re-admitted
  animation job: the graph animates what the relay tells it and decides
  nothing.
- Side effects: H1 (the re-admitted job plays relayed events and idles on an
  AI-off puppet; the branch CONFIRMED-STATIC, the visible result HYPOTHESIS,
  :154-155); H2 (the walk cycle comes from relayed graph variables: whether
  the graph reads Speed and Direction set from a script, or only the
  AIProcess fields the movement step writes, is open, :325-327, :421-422;
  probe P4); H3 (translateTo's mover moves an actor whose movement step is
  skipped; the mover was not traced, :318-322); H4 (KeepOffsetFromActor does
  nothing useful on a puppet: answered 2026-10-21 by REA, the "Why now"
  section: its planner agent 42182 runs in the per-frame pass whatever the
  AI bit, with a goal relative to the actor itself, so it never goes on a
  puppet, Rule B); H11 (setAngle imposes the heading on a puppet whose
  animation job is re-admitted: Actor::SetRotationZ 37230 writes
  data.angle.z and marks the loaded data's 3D update flag, REA 2026-10-21,
  CONFIRMED-STATIC for the writes, the visible turn HYPOTHESIS; probe P4;
  the fallback is SetPosition with the heading each sample).

## Suppress (engine's own behavior blocked on non-hosts)

- What is suppressed: on a game that does not host the cell, for each of its
  engine actors: the AI (packages, combat decisions, detection requests,
  chatter: the kProcessMe bit); the movement step (hook 3: for a flagged
  actor 37356's body is not run; instead Actor::Move(delta, zero) (vtable
  0xC8, Actor.h:398, body 37507) ticks the character controller at rest,
  which is what 37356 itself does for ragdolled actors and sitting riders:
  R1 below; the rest of 37350 runs, :279-285); combat membership (the stop at
  demotion and at every combatState on a puppet: hits 38586 and Papyrus
  StartCombat 54768 are not gated and 38565 keeps selecting targets,
  :286-290); the keep-offset; local attack events unless relayed (as today).
  On every game: the cleaner's deletion of engine references and the copy
  for an ESM actor.
- How: EnableAI through the export; two function-entry detours in the
  fork's Skyrim Platform (as built: Frida Gum replacements through
  FridaHookHandler::Replace, the DamageActor hook's idiom, FridaHooks.cpp,
  since the trampoline helper patches call sites and not function entries;
  PuppetHooks.cpp, AE only, logged [verb:npc-puppet], the ids in
  game/Offsets.h): the research's "one bit plus two hooks" (:295-299)
  against Skyrim Together's AI-on shape with a block per output, which leaks
  wherever a block is missing (te-npcs.md:133-150); the puppet set in native
  (Puppets.h, a recursive mutex, the weapDrawnMode share's idiom);
  setDefaultAnimsDisabled(refrId, true); the cleaner's floor at 0xff000000;
  formView's engine-reference path (:131-136) taken for actors too.
- Release condition: HostGrant for the cell: setPuppet(actorId, false) runs
  Q4's promote natively (:337-349): SetPosition to the last relayed point and
  heading, the flag cleared, EnableAI(true), EvaluatePackage(true, false);
  the recorded combat target is npc-handoff's to restore. HostRelease or the
  connection's end: demote. A reference the engine detaches drops its flag;
  its reload is puppet by default (cellAttach).
- Side effects: H5 (the promote and demote order, Q4's, HYPOTHESIS, :47-48;
  a buffered EvaluatePackage issued while puppet still fires on the first AI
  tick, :347-348; an immediate evaluation outside sit states 0, 3 and 7 does
  nothing, :345, so a seated puppet going live may wait for its next AI
  tick); H6 (the stop undoes the draft before any visible target selection:
  measured once that the draft happens, readings-18:100-102, the undo
  unmeasured). Reversibility on handoff is the Release condition itself and
  b-npc-puppet's three flips.

## Message contract

- No new message and no widened field (rule 4 met by no change). A puppet
  shows UpdateMovement, MsgType 2, and UpdateAnimation, MsgType 3, as relayed
  today (wire-schema skymp.rs:326-355 on m3host; MovementData :296-323 with
  pos, rot, direction, speed, run_mode, health_percentage, look_at;
  AnimationData :159-164), both Unreliable (wire-transport channels.rs:37;
  docs/WIRE.md:122), validated at wire-validate lib.rs:583-588 (finite, in
  the world) and by the codec's caps; UpdateAnimation has no arm of its own
  (the match's default, lib.rs:681-683). The relay's gate is cell-host's
  (ActorUpdatableBy through HostOf, ActionListener.cpp:56-122 on m3host).
  UpdateAction stays the player's (cast-action.md:229): npc-stream's row.
- CreateActor, MsgType 33: refr_id (Option<u64>, skymp.rs:1159) for an ESM
  actor carries its own form id instead of id + 0x100000000, and
  base_record_type (Option<String>, :1149; DOOR alone until now) carries
  NPC_ for it (Stage 1, fork a29bfb08, PartOne.cpp's CreateActor): values
  within the types, no shape change, no validator rule on them. The
  client's tests of those values (remoteServer.ts skipFormViewCreation and
  :372, formView.ts:131-136) are the switch to the engine reference.
- UpdateProperty, MsgType 7: isHostedByOther (refr_id u32, skymp.rs:426)
  goes unused for engine actors, whose puppet or live state is the grant's
  (Client); the field stays (ADR-012: append-only) and the ESM defect
  (skymp-hosting.md:149-159; cell-host.md:274-276) closes by disuse. The
  property still reaches server-made 0xff actors, where it works.
- Idempotency / ordering: as today (a later sample wins; numChanges orders
  the events). Contract doc updated: no (nothing to update; `just
  wire-header-check` unchanged).

## Server

- Where the logic lives: the core (C++, legacy), three edits. PartOne's
  CreateActor sends an ESM actor's own id (:979-983). The loader's three
  bans, essential or protected or unique, the crime factions 0x26953, the
  race list (WorldState.cpp:519-585 on ef44a1d8; :541 and :585-587 on
  m3host), apply only while npcEnabled is false, so the probe-only setting
  (ADR-035 point 9; cell-host's lab setting) admits Riverwood's residents,
  the guards and the humanoid bandits the exits need; dead-at-start and
  initially disabled references stay skipped (:477-501). UpdateHoster
  (MpObjectReference.cpp:737-740) sends nothing for an ESM actor. No Rust
  rule changes: wire-rules cells is cell-host's and nothing new is decided.
- DB fields / migration: none.
- Restart behavior: as cell-host: every cell unhosted at start, so every
  game's NPCs are puppets until the first grant; the records stand.
- Papyrus natives touched: none. Actor.EnableAI stays `missing` on the
  server VM (docs/NATIVES.md:96): a server never switches a game's AI
  directly, the grant does.

## Client

- SP binding: two exports beside performAction (MagicApi.cpp's idiom,
  cast-action.md:237-246): setPuppet(actorId, puppet) and isPuppet(actorId);
  the two detours and the puppet set in Hooks.cpp, logged `[verb:npc-puppet]`
  as cast-action's sink logs (Hooks.cpp:295-296). The natives filter in
  native (rule 9).
- TS handler: PuppetService (skymp5-client services): the puppet set per
  local form id; an engine actor puppeted at cellAttach and at its
  CreateActor unless HostService.isHostedHere(refr); the grant and release
  handlers flipping the cell's actors (promote with the view's last relayed
  point); the combatState sink. formView: the engine-reference path for
  actors (refrId below 0xff000000), no placeAtMe, no modWcProtection for
  them (:273, :339). HostService.isMine for an engine reference reads the
  grant alone (hostService.ts:55-57 keeps the flag for 0xff actors).
  worldCleanerService: return for actorId below 0xff000000 (the dead-body
  and chicken branches, :72-76, :81-99, fold in). movementApply: the puppet
  branch above. remoteServer's "it is an npc" test (:372) asks the base
  record type, not the id. Every NPC this game does not host is a puppet,
  an engine reference or a server-made 0xff copy alike (ADR-045's third
  decision: AI off, the relay's transform and events, no keep-offset); the
  self keep-offset stays on players' figures alone, whose own 130 ms
  reports hold it. The view of an actor this game hosts applies nothing
  (Rule A: no first apply, no replayed animation, no clear),
  setDefaultAnimsDisabled(false), and setWeaponDrawnMode(-1) once at the
  promotion.
- Kill switch config key: `npcPuppet` under skymp5-client's settings
  (hostService.ts:31's idiom): off, the set is never fed, so the detours are
  inert and AI stays on: a bisect switch, not a play mode. The binding and
  the cleaner follow `cellHost`.

## Tests

- T0: C++ (fork a29bfb08): CellHostTest's game-file case, Whiterun's cow
  0x10ebaf (unit/NpcExists.cpp's actor) travels under its own id with
  baseRecordType NPC_ and no flag, the grant sends it no property, the
  host's report moves it and reaches the other game once and not the host,
  the other game's report is dropped; the 0xff wolf's flip still carries
  (UpdateProperty isHostedByOther false to its host); NpcExists reads the
  flag under props (the old top-level read was vacuous) and loads
  Riverwood's Alvor 0x13482, unique and a Nord in an interior, under
  npcEnabled (the three bans lifted; a crime-faction guard and a leveled
  bandit have no placed id in the tests' hands, so b-npc-puppet's Riverwood
  run is their proof). Rust: none (no wire change); wire-validate's tests
  stand.
- T1: the detour targets and the push resolve by id against SkyrimSE.exe
  1.6.1170 outside the game (41370, 41453, 37356, 69349: all 147 of the
  research's ids present, re-ai-puppet.md:10) and the stage table's name
  strings "Actor animation" and "Actor movement" read beside them (:59-61):
  the ids proven before any hook runs.
- T2: no ESM actor in a difftest session: T2's servers run
  server-settings-t2.json without npcEnabled (lab/tools/test-proto.sh), and
  the legacy image is frozen on upstream's id scheme, so every NPC's
  CreateActor would diverge by design. The 33 sessions stand as the
  regression (identical at the merge); the game-file case is CellHostTest's
  (T0) and b-npc-puppet's (T3).
- T3 scenario id: lab/scenarios/b-npc-puppet.yaml. Two seats, Riverwood
  (Tamriel 0x3C, (4,-12) 0x9732 and its neighbours, riverwood-ids.md:37-41),
  npcEnabled on the run's own setting, the clock to 7.9 (r-npc-packages'
  step), watch-start on both seats with the fourteen ids (trackMax 480). c1
  in first, hosting (b-cell-host's facts); c2 beside it 15 s later. Asserts:
  on c2 every named id resolves (the watch's missing empty) and no 0xff
  actor carries a resident's base (a copy would); npc-state {formId:
  0x13483} reads aiEnabled false on c2, true on c1 (Sigrid); over 60 s c2's
  tracks follow c1's per id within the relay's lag, no jump over 1024 units
  but Embry's door (readings-18:110-112); Sigrid's IdleHoe fires on c2
  within 2 s of c1's and her head node moves between two reads on c2 during
  it (the graph ticks); c2 casts the shout's first word (0x13E09) at Sven
  0x13491: IsStaggering rises on c2, his position moves under 50 units over
  4 s (no slide), inCombat false on c2 3 s after, aiEnabled still false; c1
  leaves past the grace: within 5 s c2 hosts 0x9732, Sigrid's aiEnabled
  flips on both seats and her track on c2 moves over 100 units in the next
  30 s while c1's follows; c1 back and out twice more at a person's rhythm;
  a server restart: every resident aiEnabled false on both seats until the
  grant, then one seat's true; dump-state on both. Two lab-api facts to
  add: a seat's npc-state by form id and its 0xff actors by base.
- Assertions that would fail if the verb silently regressed: aiEnabled true
  on a non-host for a named id; a 0xff actor with a resident's base on any
  seat; a resident missing on either seat (the cleaner); a puppet moving
  after the shout with no relayed report (the slide); inCombat true on a
  puppet 3 s after a hit.

## Dynamic plan (fill when any tag above is still HYPOTHESIS)

- Frida script: lab/frida/npc-puppet.js (thuum 6ce514e), two modes. P0 as
  above. P1 (params {MODE: 'p1', ACTOR}), per-second counts for one actor:
  37356 (rcx the actor; zero once puppet), Actor::Move 37507 (rcx the actor,
  r8 the translation; one per frame with a zero translation under hook 3's
  shape), the controller's simulate 78275 (rcx the controller; +0x88 and
  +0x8C read on leave, never zero while the body has a world; the Havok step
  global 389089 beside them; the controller's class by its vtable, 240580
  rigid or 240560 proxy), the rigid-body readers 79198 and 79193 (+0x88 on
  entry: a zero is the #901 hazard, logged at once), the relay's
  Actor::SetPosition 37309 with its updateCharController flag, and the
  animation job 41453's distinct handles per second (one more than before
  the puppeting). xmm arguments are not readable in Frida's context, so
  angles and steps are read back from memory on leave. 37347 and 37348 are
  not hooked (their rcx convention was never re-read, re-ai-puppet.md's
  Corrections). Falsified by a 37356 call for the flagged actor, 41453's
  distinct handles not rising by one, a zero step on a rigid controller, or
  Move's translation non-zero for the puppet.
- P0, the spin's autopsy on today's build (solo c1 at 0x9810 under
  npcEnabled: the flag never flips there either, so every copy is
  re-applied every 2 s and the spin reproduces without a second seat):
  lab/frida/npc-puppet.js hooks 42182 (the keep-offset planner; rcx minus
  0x18 the agent, the target handle at +0x38, angleOffset.z at +0x50, at
  return out[8] through r8 minus the actor's data.angle.z), 41734 (the
  mode flip: dl, and ctrl+0x1C0 before and after) and 37230 (SetRotationZ
  with its return address). Decides: 42182 every frame with the state 13
  and out[8] minus angle.z about angleOffset.z confirms the keep-offset as
  the spinner, and the 41734 log says why Clear never lands; a SetRotationZ
  return address outside 37356 names another writer; 42182 silent during
  the spin falsifies the cause. Beside it: labState ref 0x85547 read twice
  (the frozen record) and c1's console "block anim" lines.
- x-npc-puppet-2 (solo, c1, the fork's SP dist with the hooks, a driver step
  npc-puppet {formId, puppet} to add beside npc-ai; the Survival prompt step
  as every solo run): x-npc-puppet's bandit (0x1BCD8 at 150 units). P2 with
  the graph re-admitted: an idle sent while puppet plays (the head moves
  between npc-state reads; H1). P4: translateTo 500 units, the body arrives
  (H3); Speed set to 200 and read back next frame, the legs in screenshots
  (H2); keepOffsetFromActor on the player, moves or not (H4). P3: sneak past
  it (the stealth meter in a HUD screenshot); the shout's first word:
  IsStaggering rises, no slide, the draft into combat undone within 500 ms
  (H6); a bark while puppet, if any (H7). P5: setPuppet false, the package
  per 100 ms (a change within one AI tick), startCombat on the player, the
  attack within seconds; the reverse (H5). Then b-npc-puppet for the
  two-seat shape, H8 (the residents' schedules on kept references against
  r-npc-packages' tracks), H9 (a local and a relayed stagger on one puppet)
  and H10 (0x85547's species on both seats).
- If P4 falsifies H2: the graph's Speed source (ModifyAnimationUpdateData,
  Actor.h:322, or the AIProcess fields 39873 and 39878, :421-422) is the
  re-analyst's next question, not a guess; the fallback is today's copy
  shape on the kept reference (AI on under KeepOffsetFromActor), which leaks
  (:295-299), on a branch until the read is in.
- Breakpoint plan for a human session: none unless P4 falsifies.
- Owner: agent (Frida); Eli (x64dbg) only on a falsified P4.

## Status

Doc drafted 2026-10-21, before any code. Build begun 2026-10-21 17:41 PDT
on the plan Eli approved (one shot, six stages, docs/LOG.md's entry).
Fork m3-npc-puppet (off parity 535544db with m3-relay-echo 41f554ad):
Stage 1 server a29bfb08; Stage 3 client eaa3b6d0; Stage 2 Skyrim Platform
d9a003fd (the exports, the set, the two detours with R1's Move shape); the
test's subscription fix 22240db7. CI: 2555 and 2557 red on the 0xff flip
assertion alone (the new actor had no listeners at the grant in the test's
sequence; fixed by the players' reports), 2558's Windows build and 2560's
server build pending at 18:2x.

- [x] doc complete, inventory listed with a disposition per row, rung declared (2026-10-21; the dispositions stand on the 2026-10-18 references and x-npc-puppet's two runs, to be re-read on the merged base)
- [x] engine surface cited or delegated (CommonLib file:line for every field and switch; the detours' prototypes read by the re-analyst through REA on sky-re, 2026-10-21 08:43: 41370, 41466, 41453, 41454, 69349, 37356 and its chain, every claim CONFIRMED-STATIC or HYPOTHESIS with its instruction; the Frida trace that confirms them named)
- [ ] server logic + T0
- [ ] message + validator (same commit)
- [ ] native hook + T1
- [ ] TS handler
- [ ] T2 green
- [ ] T3 scenario green, no HYPOTHESIS tags
- [ ] parity scenario green, or its later list reviewed with it (ADR-031)
- [ ] sequences and combinations green, every checklist item with its scenario (ADR-033)
- [ ] ledger and suppression registry updated
