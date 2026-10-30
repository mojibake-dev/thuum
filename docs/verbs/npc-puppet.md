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
| a leveled base rolled per game (formView.ts:155-156; a placed LVLN such as 0x85547 resolved by each engine); a death's respawn after 25 s (MpActor.cpp:1941) | code, record | later: npc-fate (one roll per cell by the server; deaths that persist); until then a kept leveled reference may differ in species between games, and between the server and the games: H10 (playtest 32, place 2: the forest predators 0x85547 and 0x85549 are LvlAnimalForestPredator 0x1e7a0 placements; the server's record of 0x85549 resolved its template chain to EncBearCave, EncBear and dealt a 130-point unarmed hit while both games showed a wolf; both players died on arrival, 02:23:11Z and 02:23:15Z) |
| essential, protected, unique, crime-faction and playable-race NPCs never loaded (WorldState.cpp:519-585; on m3host :506 npcEnabled, :541 CrimeFactionsList 0x26953, :585-587 the race list) | code | imposed: the three bans lifted behind npcEnabled on the probe-only setting (ADR-035 point 9); dead-at-start and initially disabled references stay skipped (:477-501 on m3host) |
| the puppet's health, equipment and inventory (the copy's deferred kill and 1,000,000 health, formView.ts:313-319; the 25% step toward the relayed percentage, movementApply.ts:63-67) | code | imposed as today on the kept reference (startDeferredKill, skyrimPlatform.ts:2202; the step); the live values: later, npc-stream (HostedActorState); FOUND 2026-10-22 (x-npc-death 20261023-054215): the step kills what the host floors: a host-made health below zero (a script, a fall; the engine's deferred kill holds the host's actor alive at -128.87%) reaches the puppet as the relayed percentage and the damageActorValue step takes the puppet's health through zero, where the deferred kill did not hold with the AI off: dead on the puppet screen, standing on the host's. Train-35 (fork parity ac557132, 2026-10-22 23:48 PDT; the gate 20261023-061702 ten of ten with m0-death, T2 33 identical): the host's report clamps healthPercentage to [0, 1] (movementGet), the validator refuses a report outside it (wire-validate, Range, with its test), and the step floors its target at one percent, so a puppet dies by the server's death state alone |
| a persistent NPC through a door (Embry into the inn, readings-18:36-43) | trace | native on the host; on a puppet: later, npc-handoff (a relayed report in another cell moves the reference with MoveTo, TESObjectREFR.h:456, where today's copy respawns, movementApply RespawnNeededError, skymp-hosting.md:278-279) |
| the observer's shape kept: head tracking on the look-at point, blockActivation, the local attack events blanked unless relayed (movementApply.ts:37-59; animation.ts:383-394 for a view with default animations disabled) | code | imposed as today on the puppet (setDefaultAnimsDisabled(refrId, true), formView.ts:454 on m3host); undone at the promote since train-34 (fork parity 7e59c32c, 2026-10-22 21:40 PDT; 8eafa85d: PuppetService.ensureLive runs blockActivation(false), clearLookAt and setHeadTracking(true) before setPuppet(false); the demote-time block 8eafa85d also added was dropped again by 7e59c32c, the apply's per-sample block standing, after the IDRC box read in the first gate; CONFIRMED on parity 7e59c32c by x-npc-talk-prompt 20261023-055858 through npc-state's activationBlocked: the first host's Alvor false right after its grant, c2's puppet true, c2's promoted Alvor false after the handoff; the player's E itself stayed unproven in that run, a geometry matter at the mill, and is the later talk step's): playtest 32's handoffs (2026-10-22, 19:02 to 19:09 PDT) left every resident that had been a puppet with a Talk prompt and E dead on both screens once live (Eli: "there's a prompt it does nothing"); the view's hosted branch had lifted the weapon-drawn mode and the default-anims block alone |

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
- Hook 2a's targets, from the research with its tags: 41370 (the re-analyst's
  label ProcessLists_QueueActorAnimation, :247) partitions highActorHandles
  with 41466 (:139-143) and queues the job 41453 per actor (:144-150, the
  unrolled vtable 0x7D UpdateAnimation, Actor.h:326); the engine's own push is
  69349, `FUN(jobList, job, handle, 0)` (:270-273). Rejected by the research:
  a vtable 0xAE UpdateNoAI hook (Actor.h:372; it runs twice a frame for an
  AI-off high actor, 41369 and 41447, :159-162) and a byte patch of 41466
  (:276-278).
- Hook 3's target: 37356 (the re-analyst's label Actor_MovementStep, :363;
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
  stores inside 78275 (the re-analyst's label bhkCharacterController_Simulate,
  RVA 0xe9f170; `movss [rsi+0x88], xmm1` at 0xe9f905 and the reciprocal at
  0xe9f915; the role CONFIRMED by P1 20261022-044255: the hooked simulate
  stamped +0x88 every frame on 18 rigid-body controllers, about 846 calls a
  second, zero steps none), reached from 37356 only through vtable 0xC8
  Actor::Move (37507, RVA 0x6768a0), which builds the 0x24-byte block {delta,
  angles, translation rotated into world, speed, nearCamera} and calls 78275
  for an actor that may move; seated and don't-move actors take 78276 and
  SetPositionImpl with no stamp (the engine itself leaves them unstamped). The
  value: the Havok time simulated this frame, global 389089 (RVA 0x202c688;
  77850 computes it per frame from fMaxTime:HAVOK times the time multiplier,
  capped at uMaxNumPhysicsStepsPerUpdate steps, zero on a sub-millisecond
  frame), else the block's delta split by the substep count. The hazard is the
  rigid-body controller's alone: 79198 (slot 7 SetLinearVelocityImpl) and
  79193 (slot 3 SetPositionImpl) pass +0x88 to 62456, `accel = dv / timestep`;
  the proxy controller's slots read no step. 37356's early paths: a cell not
  attached writes the position through 19790 and returns (no Move); ragdoll,
  reanimating and get-up reduce the step to a zero input plus the flag and
  still Move; a sitting rider Moves into the unstamped seated branch. No
  smaller "stamp the time" function exists. Shape chosen (hook 3 as built): a
  flagged actor gets Move(delta, zero) when it has a controller and an
  attached cell, kFollowRagdoll set first in ragdoll; the controller ticks and
  stamps at rest where the relay last warped it, gravity settles it, the
  divisions stay finite, the step's own output, rotation and feedback are
  skipped. CONFIRMED by P1 20261022-044255: every Move in the puppet phase
  carried a zero translation, the stagger included, the controllers stamped
  the step every frame, and the body held (12.7 units against the 120-unit
  slide, 042521); shape 4 unneeded (the fallback: a plain early return plus
  one Move(delta, zero) while stepInfo.deltaTime reads 0). Falsifiers: a +0x88
  store outside 78275; a puppet's controller vtable being the proxy's (240560,
  then the plain return is safe here); a fresh controller reading a non-zero
  +0x88 before any 78275 call; Move's tail moving the data position by more
  than physics settling between relay ticks (then shape 4).
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
  - 41370 (SkyrimSE.exe+0x7709c0, 729 bytes; the re-analyst's label
    ProcessLists_QueueActorAnimation; the role CONFIRMED by hook 2a's effect:
    the detour on it queued the job and the AI-off puppet's graph ticked,
    x-npc-puppet-2 20261022-042521 H1 and x-npc-legs-burst 20261022-202522 H2,
    where plain AI off froze it, readings-18:83-85): `void (RE::ProcessLists*
    self /* rcx */, JobList* jobs /* rdx */)`. self is the ProcessLists
    singleton (the caller loads 400315, ProcessLists::GetSingleton::singleton,
    src/RE/P/ProcessLists.cpp:13); 41370 reads self+0x1E6 (runAnimations,
    include/RE/P/ProcessLists.h:96) and self+0x40 (highActorHandles' size: the
    array at +0x30, :69; a BSTArray's size at +0x10,
    include/RE/B/BSTArray.h:374-376, :140-141). jobs is the stage's job list,
    passed verbatim as the first argument of both pushes; the stage takes it
    from the table 403091 at index 5 through 35404 and runs it through 69352
    into 69376 after 41370 returns; CommonLib only forward-declares
    BSJobs::JobList (include/RE/I/IVirtualMachine.h:13-15, :65), so the
    stage's list is a BSJobs::JobList by CommonLib's forward declaration and
    by effect: the detour's push onto it ran the job (042521 H1, 202522 H2);
    layout CONFIRMED-STATIC. Gates in 41370 itself: runAnimations != 0 and the
    size != 0, nothing else; no read of +0xE8 (kProcessMe) in its 213
    instructions. CONFIRMED-STATIC. Body: two BSScrapArray<Actor*> (68160,
    68162), 41466(&highActorHandles, &{&listA, &listB}); for every Actor* in
    list A an ActorHandle minted inline (the +0x28 refcount test under 0x3ff,
    else 12325, the sentinel 400312 for a zero count) and 69349(jobs, 41453,
    handle, 0); for list B the same with 41454; then the arrays' references
    released. CONFIRMED-STATIC. Callers: exactly one, the stage function 39054
    (+0x6d2670), the main loop's table entry 380490 named "Actor animation"
    (206263); the other incoming reference is .pdata, so 41370 is not virtual.
    CONFIRMED-STATIC.
  - 41466 (+0x777480; the re-analyst's label
    ProcessLists_PartitionAnimatedActors; the role CONFIRMED by effect: an
    AI-off actor it drops left the graph frozen, readings-18:83-85, and the
    detour's re-test of its terms without kProcessMe ticked it, 042521 H1):
    `bool (RE::BSTArray<RE::ActorHandle>* highActors /* rcx */,
    RE::BSScrapArray<RE::Actor*>* out[2] /* rdx */)`, returns true always. Per
    handle it resolves the actor (17201) and admits it to list A when all
    hold: boolBits bit 9 clear (+0xE8, kInTempChangeList, Actor.h:168),
    formFlags bit 21 clear (+0x10, kStillLoading, TESForm.h:89), boolBits bit
    1 set (kProcessMe, Actor.h:160; the instructions at +0x7774e8 and
    +0x777505), currentProcess non-null (+0xF8, Actor.h:651 with the 1.6.1170
    shift :712), Get3D2() and its parent non-null (slot 0x70,
    TESObjectREFR.h:308; NiAVObject::parent +0x30, NiAVObject.h:153),
    formFlags bits 5 and 11 clear (kDeleted TESForm.h:62, kDisabled :75),
    parentCell non-null (+0x60, TESObjectREFR.h:496) with cellState 7
    (kAttached, TESObjectCELL.h:139, :259); and to list B as well when the
    cell's formFlags bit 13 is set (the pin's generic names for bit 13,
    TESForm.h:80-81; the CELL meaning not named there). CONFIRMED-STATIC. This
    is the only kProcessMe test on the animation path.
  - 41453 (+0x776a90, 199 bytes; the re-analyst's label
    ProcessLists_ActorAnimationJob; the role CONFIRMED: P1 044255 counted its
    handles per second, 19 to 20 distinct, and the one queued for the puppet
    ticked its graph, 042521 H1, 202522 H2): `void (RE::RefHandle handle /*
    ecx: the 32-bit ActorHandle value */)`. Only ECX is read before the
    lookup; rcx is NOT an Actor* (the research's :358-359 is wrong for it).
    The handle is resolved by 12922, which checks the handle's age against
    BSPointerHandleManager's entries and fills a NiPointer<Actor>; null
    returns. CONFIRMED-STATIC. Body, with the actor: delta =
    GetSecondsSinceLastFrame (410199, src/RE/M/Misc.cpp:82-86) times
    44302(VATS singleton 400883) (1.0 outside VATS; 37361 and 37363 apply it
    only in VATS mode 4 for the VATS target; a static label no run reads, the
    engine's own job runs whole here, Known limits K1); then 37364(actor) (the
    transform into the graph manager; a static label, Known limits K1),
    20121(actor) and 20122(actor) (attached-node bookkeeping and loadedData's
    timed entries, +0x68, TESObjectREFR.h:497; a static label, Known limits
    K1), 20123(actor, delta): a BSAnimationUpdateData on the stack (deltaTime,
    include/RE/B/BSAnimationUpdateData.h:9-27), slot 0x79
    ModifyAnimationUpdateData (Actor.h:322) and
    IAnimationGraphManagerHolder::UpdateAnimationGraphManager on actor+0x38
    (32899, src/RE/I/IAnimationGraphManagerHolder.cpp:65-70; the holder at
    +0x38, TESObjectREFR.h:112): the graph tick; then 39896(currentProcess,
    actor) (the knock-state machine, returning at once for a null middleHigh,
    AIProcess.h:196, or kNormal; a static label, Known limits K1; its one
    +0xE8 read tests kParalyzed alone, :329-330, so the puppet's bit is not
    re-tested there), then 37363(actor, delta) (its only caller; when not
    sitting, knocked or bleeding out, and the char controller's lodDistance,
    +0x29C, bhkCharacterController.h:142, within settings 370871 or 370879,
    slots 0x122 and 0x123 with delta, then 37976); finally the handle's
    reference released. CONFIRMED-STATIC for the sequence. Against vtable 0x7D
    UpdateAnimation (37361, Actor.h:326): a sibling with the same core, not
    the vtable body unrolled (37361 gates on Get3D2, its parent and
    currentProcess itself, uses 20119, inlines 37363's body, adds 37976 and a
    cell-flag-13 branch, 37287). CONFIRMED-STATIC. Hidden gates for hook 2a:
    no instruction in 41453, 37364, 20121, 20122, 20123 or 37363 reads +0xE8;
    39896 reads it once and tests only bit 31 (kParalyzed, Actor.h:190) inside
    the knockState path; so a 41453 queued for an AI-off actor runs the graph
    tick. CONFIRMED-STATIC for those six bodies, their callees not walked
    (CONFIRMED by effect that none re-tests the bit: a queued 41453 ran the
    graph tick for the AI-off puppet, 042521 H1 with the stagger played and
    the head node 28 units lower, 202522 H2 with Speed and the engine's own
    moveStart, so no unwalked callee re-tests kProcessMe; IsAIEnabled is
    inline in CommonLib, src/RE/A/Actor.cpp:741-744, so only a +0xE8 read
    could hide it). Callers: none by call; 41370 takes its address; the
    consumer calling fn(arg) is 69376's thread code, not read (the job
    argument arrives in rcx as stored, CONFIRMED by P1 044255: 41453's entry
    read its handle in ecx as stored, 19 to 20 distinct handles a second, and
    the queued job resolved the puppet, H1).
  - 41454 (+0x776b60), the list-B job: `void (RE::RefHandle handle /* ecx
    */)`: the same lookup, one call 37286(actor), the release; not an
    animation update (the per-frame step for actors whose cell has form flag
    13; a static label, Known limits K1: a puppet is never queued for 41454,
    the detour queues 41453 alone, and no gap has shown). CONFIRMED-STATIC for
    the body.
  - 69349 (+0xcf66b0; the re-analyst's label JobList_AddJob; the role
    CONFIRMED by effect: the detour's 69349(jobs, 41453, handle, 0) ran the
    job on the stage's list, 042521 H1, 202522 H2): `void (JobList* jobs /*
    rcx */, void (*job)(std::uint64_t) /* rdx */, std::uint64_t arg /* r8
    */)`. The list's first qword points at a BSTArray<Job> {data +0, capacity
    +8, size +0x10}, grown by one 16-byte element through 68163 with the heap
    allocator functor (186376, include/RE/Offsets_VTABLE.h:30), then [elem+0]
    = job and [elem+8] = arg; the TLS slot +0x768 is set to 0x59 around the
    growth and restored (a memory-manager context tag; a static label, the
    engine's own push runs whole here, Known limits K1). The fourth argument
    is dead: every caller zeroes r9d and 69349 never reads r9 (a source
    parameter this build ignores; a static label, Known limits K1); a detour
    may pass 0: the built detour passes 0 and the push took it (042521). The
    handle rides in the low 32 bits of arg. Thirty callers, among them 41306
    (the movement queue), 41367, 41374, 41380, 41301. CONFIRMED-STATIC.
  - 37356 (+0x6698d0, 3986 bytes, 27 virtual calls; the re-analyst's label
    Actor_MovementStep; the role CONFIRMED by P1 044255 (its entry at frame
    rate, about 47 a second, for the bandit; its body skipped for the puppet
    with every Move at zero translation; the controller's output back in the
    second of the promote) and the slide gone in 042521 (12.7 units against
    120); Skyrim Together's lead docs/TE-MAP.md:57): `void (RE::Actor* self /*
    rcx */, float delta /* xmm1 */)`. It reads +0xF8 currentProcess, +0x38 the
    graph holder, +0x150 movementController (Actor.h:667 with the shift),
    +0xC8 and +0xCC actorState1 and 2 (ActorState at +0xC0, Actor.h:737-741;
    ActorState.h:203-204), +0x60 parentCell, +0x48 to +0x5C angle and location
    (OBJ_REFR at +0x40, TESObjectREFR.h:73-80, :495), +0x10 formFlags; delta
    is the per-actor delta from the movement table. CONFIRMED-STATIC. Gates,
    none on kProcessMe (no read of +0xE8): the movement runs when
    currentProcess is null, or when the actor is not Actor::IsInRagdollState
    (37491), not actorState2.reanimating (bit 4 of +0xCC, ActorState.h:128)
    and knockState != kGetUp (:115, :60), else it only flags the char
    controller (+0x218 |= 0x1000); skipped for a sitting rider (sitSleepState
    kIsSitting, :112, :71, with 17965: not boolFlags kIsAMount, Actor.h:197,
    and ExtraDataList's kInteraction 0xA9, ExtraDataTypes.h:343); with the
    graph variable bIsSynced (FixedStrings +0x578, FixedStrings.h:193; holder
    slot 0x12, IAnimationGraphManagerHolder.h:42) set and processLevel kHigh
    (process+0x137 == 0, AIProcess.h:225, :26) the translation and rotation
    come from 39589 and 39597, else from the movement controller (slot 7 on
    +0x150, with delta and an output block) after bSpeedSynced (+0x580, :194)
    and Speed (+0x508, :179; holder slot 0x10, :40) scaled by
    TESObjectREFR::GetScale into 39873, with 39878 and the setters 39880,
    39882, 39884, 39886. CONFIRMED-STATIC. Then slot 0x11A
    ModifyMovementData(delta, &translation, &rotation) (Actor.h:480); the
    rider variables HasTweenSpeed, TweenSpeed, bTweenUpdate
    (FixedStrings.h:161-163); if parentCell is null or not kAttached, or
    40413(player) holds, the position is written through 19790 (the
    data-position writer the research saw inside SetPosition) and it returns;
    else Actor::SetRotationZ (37230) with the rotation, a pitch clamp
    (settings 371032, 380228, 371029, 371026, 382579), then the position:
    formFlags bit 4 clear means slot 0xC8 Move(delta, &translation)
    (Actor.h:398), set means a rotation matrix (70233) and slot 0xA9
    SetPosition(&pos, true) (Actor.h:367); then, with flyState (bits 18 to 20,
    ActorState.h:113) 0 or 5 and the global byte 389168 clear, slot 0x11D
    ComputeMotionFeedbackSpeedAndDirection (Actor.h:483) and on true slot
    0x11E UpdateFeedbackGraphSpeedAndDirection (:484). CONFIRMED-STATIC for
    the calls; the data block's field meanings are static labels (the step is
    skipped whole for a puppet, so the block's fields are moot here; Known
    limits K1). Callers: exactly one, 37350 (+0x669010); the other reference
    is .pdata, so 37356 is not virtual. The chain: stage 39053 calls
    41306(ProcessLists* /* rcx */, float delta /* xmm1 */, JobList* /* r8 */),
    which, when runMovement (+0x1E5, ProcessLists.h:95) is set, fills the
    static table 404437 of 16-byte entries {Actor* +0, float delta +8, bool
    +0xC} for the first min(size, 128) high actors and pushes 69349(jobs,
    41444, index, 0) per actor and 41445 for the player; 41444 is `void
    (std::uint32_t index /* ecx */)`: the entry's actor, its currentProcess
    and the flag required, then 39447(process, -1) and 37350(actor,
    entry.delta); 37350 is `void (RE::Actor* /* rcx */, float delta /* xmm1
    */)`: 39447 again, a VATS delta substitution (delta 0, processLevel kHigh,
    VATS mode 4, the VATS target), 41717(movementController) (the message
    pump, controller fields only), and for delta > 0: 37355(actor) (the
    controller mode from bAnimationDriven +0x568 and bAllowRotation +0x570,
    FixedStrings.h:191-192, through 32716, 32717, 32718 and 37997),
    37356(actor, delta), slot 0x11B (Actor.h:481), the kMountPointClear logic
    on +0x204 bit 2 (:198), slot 0x11C on the char controller (:482; the
    getter 39856, AIProcess::GetCharController, :197; the field
    MiddleHighProcessData.h:183), slots 0xAF and 0xB0 (:373, :374),
    39548(process, actor); always 39448(process) == -1 then 39599(process).
    kProcessMe: no read of +0xE8 in 41306, 41444, 37350, 37355, 37356 or 41717
    (every instruction of the six bodies read): the research's :131 stands,
    and the two job wrappers above it are ungated too. CONFIRMED-STATIC.
  - Handles for the detour: CommonLib's actor->GetHandle() (Actor.h:546;
    src/RE/A/Actor.cpp:458-461; BSPointerHandle.h:106-108 to :180) is
    BSPointerHandleManagerInterface::GetHandle, 16212 (BSPointerHandle.h:
    210-215): the sentinel 400312 for a zero refcount under 0x3ff, else
    CreateRefHandle (seed-named), the same test 41370 inlines; 41453's
    lookup 12922 checks the same manager entries and age bits. The two paths
    yield the same handle value, CONFIRMED by effect: the handles CommonLib's
    GetHandle minted resolved in 12922 (the queued job ticked the puppet's
    graph, 042521 H1, 202522 H2); P1 044255's per-handle match against the
    test actor went unread (hook 2a's count inconclusive).
    LookupReferenceByHandle (Misc.cpp:88-91, include/RE/Offsets.h:582) is
    12332, a third entry point.
  - Side effects (CONFIRMED: hook 2a's tick by 042521, H1, the stagger on the
    AI-off graph, and by 202522, H2, Speed and the engine's own moveStart and
    moveStop; hook 3's removals by P1 044255, every Move in the puppet phase
    at zero, the controller ticking at rest; the relayed SetPosition stood,
    H3, 042521): a detour on 41370 that calls the original and then pushes
    69349(jobs, 41453, GetHandle(puppet), 0) per flagged puppet gives the
    puppet the engine's graph tick (20123) in the engine's own stage and
    thread model, plus 37364, 39896 (a knocked-down puppet goes through
    get-up) and 37363; harmless on an actor without a graph manager, but the
    detour should still require 41466's other terms (3D with a parent, an
    attached cell, not deleted or disabled, currentProcess non-null) before
    queuing. A detour on 37356 that returns early for puppets removes the
    controller output, Move and SetPosition, SetRotationZ, the pitch clamp,
    the tween variables and the feedback into 39873, 39878 and slot 0x11E,
    while 37350 still runs slots 0x11C, 0xAF and 0xB0 on the char controller;
    it also removes the 19790 fallback write for a puppet whose cell is not
    attached. The relayed SetPosition stands either way.
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
  so a flicker of combat music or HUD on the puppet game is possible; H6 stays
  HYPOTHESIS until b-npc-puppet carries the two-seat claim (c2's shout at its
  puppet Sven, inCombat false on c2 3 s after; its own commit, rule 13):
  x-npc-puppet-2 20261022-042521 landed and could not decide it, solo, the
  sink never ran (:1073-1078), and the two-seat shout the Tests section
  describes is in no scenario yet; the music or HUD flicker is a playtest
  line.

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
  AI-off puppet; the branch CONFIRMED-STATIC, :154-155; the visible result
  CONFIRMED by x-npc-puppet-2 20261022-042521: the AI-off puppet's graph took
  and played the shout's stagger, IsStaggering 1495 to 4228 ms, the head node
  28 units lower; relayed idles on puppets in x-npc-legs 20261022-121157,
  IdleHoe and IdlePickup_Ground); H2 CONFIRMED 2026-10-22 on fork m3-train-33
  (the walk cycle under the relay: the graph's Speed and Direction are Actor
  data channels fed from MiddleHighProcessData by the movement step alone, so
  the detour writes the host's relayed sample there every frame,
  docs/research/m3/re-puppet-locomotion.md; x-npc-legs 202106 and
  x-npc-legs-burst 202522 on a9c43bf0: the puppets' Speed follows each walk,
  the engine's own moveStart and moveStop pair with it and are taken, and the
  half-second frames show the stride, results/train-33-stride; the Dynamic
  plan's entries); H3 (translateTo's mover moves an actor whose movement step
  is skipped; the mover was not traced, :318-322); H4 (KeepOffsetFromActor
  does nothing useful on a puppet: answered 2026-10-21 by REA, the "Why now"
  section: its planner agent 42182 runs in the per-frame pass whatever the AI
  bit, with a goal relative to the actor itself, so it never goes on a puppet,
  Rule B); H11 (setAngle imposes the heading on a puppet whose animation job
  is re-admitted: Actor::SetRotationZ 37230 writes data.angle.z and marks the
  loaded data's 3D update flag, REA 2026-10-21, CONFIRMED-STATIC for the
  writes, the visible turn CONFIRMED by 042521 P4: setAngle(0, 0, 90) left the
  heading at exactly 90, turned 0 through the shout, the frames at 1.2 s and 4
  s in profile facing east; the SetPosition fallback unneeded).

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
  before it the TS promote undoes what the puppet apply imposed beyond the AI
  bit (the activation block, the look-at, head tracking; 8eafa85d, after
  playtest 32's dead Talk prompts; on parity 7e59c32c since 2026-10-22
  21:40 PDT, the demote itself making no Papyrus-backed call);
  the recorded combat target is npc-handoff's to restore. HostRelease or the
  connection's end: demote. A reference the engine detaches drops its flag;
  its reload is puppet by default (cellAttach).
- Side effects: H5 CONFIRMED (the promote and demote order, Q4's, :47-48;
  042521 P5: the drafted bandit moved within 0.5 s of the promote, 180 units
  by 2.5 s, three attackStart events after the second shout, combatTarget kept
  from the puppet time; a buffered EvaluatePackage issued while puppet still
  fires on the first AI tick, :347-348; an immediate evaluation outside sit
  states 0, 3 and 7 does nothing, :345, so a seated puppet going live may wait
  for its next AI tick, the engine's own wait, unread); H6 (the stop undoes
  the draft before any visible target selection: measured once that the draft
  happens, readings-18:100-102, the undo unmeasured). Reversibility on handoff
  is the Release condition itself and b-npc-puppet's three flips.

Known limits: K1, the engine's own animation job and push run whole for a
puppet; the roles the re-analyst gave their callees (44302's VATS factor,
37364, 20121, 20122, 39896, the list-B job 41454, 69349's TLS tag and dead r9)
and the skipped step's data-block fields are static labels no run reads, and
the verb depends on none of them. K2, a refused furniture exit on a puppet is
answered with IdleForceDefaultState on the next update (786a029d); the path
has not fired since x-npc-legs 202106 and is unread, and the furniture state
itself rides the relay (npc-stream: exits stay on the relay by design).

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
  carries the server's word per actor, explicit true or false, for every
  actor: in CreateActor's props and at every grant and release through
  UpdateHoster, game-file actors under their own id included (fork
  7fef1bec, 2026-10-22; the first cut withheld it from them, since under
  upstream's long id the flip never reached the copy: the ESM defect of
  skymp-hosting.md:149-159 and cell-host.md:274-276; it reaches the view
  bound to the engine's reference). The field's shape is unchanged.
- ActorSightings, MsgType 50 (new, 2026-10-22; docs/WIRE.md's section): the
  host's roster, TES3MP's actor list. Every 2 s while any remain, a game
  hosting a cell sends the game-file actors its engine has attached that the
  server holds no form model for (refrId, worldOrCell, pos, rot; at most 64).
  The server (PartOne::OnActorSighting) takes an entry only from the host of
  the cell of the sighted position, for a game-file actor with no user that
  does not already stand there and that no other game hosts where its record
  stands; it loads the record on demand and places it there, and the normal
  path follows. Why: the server loads actors by their placement square, and
  Riverwood's named residents are placed in their houses (Sigrid 0x13483 in
  0x133c8, read by x-npc-sigrid-ref 091354 and unit NpcExists) and walked
  outside by their schedules, so no host could ever receive a word for them
  (b-npc-puppet 081631, 090227). Validator: wire-validate's bounds (1 to 64
  entries, ids under 0xff000000, finite floats). R1: the host computes, the
  server validates by its own host table and cell index.
- Idempotency / ordering: as today (a later sample wins; numChanges orders
  the events). Contract doc updated: no (nothing to update; `just
  wire-header-check` unchanged).

- UpdateProperty for an actor from the game files (a game-file id) carries
  baseRecordType "NPC_" as it carries "DOOR", so the client's form model
  takes the word; without it the id is filed as a plain engine reference and
  the property dropped (104032's handoff). A 0xff id needs no type. No wire
  shape change: the field was optional.

## Server

- Where the logic lives: the core (C++, legacy), three edits. PartOne's
  CreateActor sends an ESM actor's own id (:979-983). The loader's three
  bans, essential or protected or unique, the crime factions 0x26953, the
  race list (WorldState.cpp:519-585 on ef44a1d8; :541 and :585-587 on
  m3host), apply only while npcEnabled is false, so the probe-only setting
  (ADR-035 point 9; cell-host's lab setting) admits Riverwood's residents,
  the guards and the humanoid bandits the exits need; initially disabled
  references stay skipped (:477-501), dead-at-start ones load as corpses
  since fork m3-dead-placed 2f886731 (2026-10-29, finding 65). The hosted word
  (revised 2026-10-22, ADR-045 point 2): CreateActor's props carry
  isHostedByOther explicitly for every actor (a player's figure true; any
  other actor true unless the listener hosts its cell), and UpdateHoster
  (MpObjectReference.cpp) flips it at every grant and release for every
  actor, game-file ids included, sending the word only to listeners that
  have a user and to that user directly: GetActorToSendTo forwards an
  offline actor's messages to its cell's host, and a userless neighbour's
  word ("true", it is never the hoster) would otherwise land in the host's
  own stream after its "false" (CellHostTest's stray word, jobs 10667,
  10688, 10690; fork 1b0a7d0d). PartOne::OnActorSighting (the roster,
  ActorSightings 50): an entry is taken only from the host of the cell of
  the sighted position (WorldState::CellOf), for a game-file actor with no
  user that does not already stand there and that no other game hosts
  where its record stands; the record is loaded on demand (LookupFormById)
  and placed there (SetCellOrWorldObsolete, SetPos, SetAngle: MpActor::
  Teleport's three sets without its message), after which its first SetPos
  subscribes it and CreateActor carries the word. No Rust rule changes:
  wire-rules cells is cell-host's and nothing new is decided.
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
  CreateActor unless the server's word already names this game
  (HostService.isMineLocal); the views promote and demote on their next
  update as the word flips at a grant or release (promote with the view's
  last relayed point; the cell walk of the first cut, Cell.getNthRef over
  the cell's own references, missed every persistent resident and ran at
  the message's tick: b-npc-puppet 20261022-081631); the combatState sink.
  formView: the engine-reference path for actors (refrId below
  0xff000000), no placeAtMe, no modWcProtection for them (:273, :339).
  HostService.isMine reads the server's word alone, isHostedByOther false,
  for every actor but the player's own (ADR-045 point 2 as revised
  2026-10-22; a persistent reference's getParentCell is the worldspace's
  persistent cell, so no client cell test can stand in for the word).
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
- The roster (HostService.reportSightings, 2026-10-22): the game-file
  actors the engine attaches (cellAttach, by form id) that the world model
  holds no form for are sent as ActorSightings every 2 s while this game
  hosts any cell and any remain, with the worldspace (or interior cell),
  position and heading the engine has them at; the server decides whose
  cell that is. A resident placed in her house and standing in the street
  reaches the server this way and nowhere else.
- Kill switch config key: `npcPuppet` under skymp5-client's settings
  (hostService.ts:31's idiom): off, the set is never fed, so the detours are
  inert and AI stays on: a bisect switch, not a play mode. The binding and
  the cleaner follow `cellHost`.

- A game-file actor whose form the server takes back while it is live here
  (DestroyActor at leaving reach, a disconnect) goes puppet at the form's
  loss: formView.destroy(lost) from formViewArray's two server-driven
  destroys calls PuppetService.demoteOnLoss (the native clears the AI bit
  alone when the actor has no 3D). The server's word cannot reach a game
  that no longer listens to the actor; TES3MP's leaving host does the same.

## Tests

- T0: C++ (fork a29bfb08, revised 7fef1bec): CellHostTest's game-file
  case, Whiterun's cow 0x10ebaf (unit/NpcExists.cpp's actor) travels under
  its own id with baseRecordType NPC_ and the explicit word (hosted by
  other on both screens while nobody hosts), the grant flips it to false
  for the host and true for the other game (the LAST word each hears is
  read: pipeline 2594's job 10667 found an earlier "true" once in four
  runs, task #21), the host's report moves it and reaches the other game
  once and not the host, the other game's report is dropped; the 0xff
  wolf's flip the same way; NpcExists reads the flag under props (the old
  top-level read was vacuous; explicit true now) and loads
  Riverwood's Alvor 0x13482, unique and a Nord in an interior, under
  npcEnabled (the three bans lifted; a crime-faction guard and a leveled
  bandit have no placed id in the tests' hands, so b-npc-puppet's Riverwood
  run is their proof). The roster (fork, 2026-10-22): CellHostTest's "A
  host's sighting places an interior-placed resident where its engine has
  her": c1 at Riverwood's landing hosts the cell of Sigrid's street
  position (CellOf), c2 far away; c2's sighting is dropped (no record), c1's
  sighting of a position in a cell it does not host is dropped, c1's sighting
  of Sigrid loads her record and places it in Tamriel at the sighted point
  (CellOf, HostOf c1), c1 receives her CreateActor with the word false and
  baseRecordType NPC_, and the same sighting again moves and sends nothing;
  NpcExists's "Sigrid is placed in her house, not at Riverwood's squares":
  her record's cell is 0x133c8 and libespm files her at no square around
  Riverwood, so a landing there loads no resident. Rust: wire-schema's
  ActorSightings (MsgType 50, wire id 58, C2S, cap 64, 4 KiB) with its
  full-capacity sample, wire-json's fixtures, wire-validate's
  check_sightings (ids 1 to 0xfeffffff, a world or cell, finite, in the
  world) with a unit test and a proptest; the T2 session cell-host.yaml
  sends a non-host's sighting that both servers drop.
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
  OUTCOME (2026-10-21 21:0x, run 20261022-040233-x-npc-spin-autopsy on the
  last seat with 535544db's client): the record held (x 123592.1172, y
  -80300.7188 twice) and the console history was all "block anim
  attackStart_ForwardPowerShort" lines, but the Frida script never loaded:
  a top-level helper named ptr shadowed Frida's global ptr() ("TypeError:
  cannot define variable 'ptr'", the .out numidium read on c1), and the
  error sat in frida-inject's block-buffered stdout past lab-api's fetch
  (a 0-byte artifact). The client was retired by the next stage's retake,
  so P0 cannot rerun. The spin's dynamic record is therefore playtest
  thirty's live reads (the frozen record, the 2 s cadence, the lunges, the
  one wolf that stopped) and the mechanism stays CONFIRMED-STATIC by REA;
  the fix removes the keep-offset from every puppet, so the claim is also
  moot for the verb. Both script defects are fixed on main (LAB_PARAMS,
  readPtr); the buffering is lab-api's (numidium) before P1's trace.
- x-npc-puppet-2's FIRST RUN (2026-10-21 21:25 to 21:35 PDT, run
  20261022-042521 on the npc-puppet stage eab366b2, numidium; the Frida
  trace empty for the reasons above, every other reading real):
  - the switch: npc-puppet {puppet: true} answered done and the state read
    aiEnabled false 10 s later; npc-puppet {puppet: false} read aiEnabled
    true 0.5 s later (the export and the game-thread demote and promote
    work; the kill switch untested).
  - H3 CONFIRMED: npc-pose's translateTo took the AI-off puppet 500 units
    to within 3 units of its target (pos 133854.4, -62081.2 against
    133857, -62080), in under 1.2 s.
  - H11 CONFIRMED: setAngle(0, 0, 90) left the heading at exactly 90
    (the watch's headingAtStop 90, turned 0 through the shout) and the
    frames at 1.2 s and 4 s show him in profile, facing east.
  - H2 SUPPORTED, the sustained cycle open: the frame 0.2 s after one
    write of Speed 200 and Direction 0 shows a stride mid-crossing (one
    leg forward, the torso turned); at 1.2 s, arrived and with nothing
    re-written, he stands with his legs together. The client re-writes
    both at every 130 ms sample while the host reports motion, so
    b-npc-puppet's frames at the minute decide whether the cycle holds
    under the relay; if they show a glide, hook 3's Move site writes the
    variables per frame natively (TE's shape) before R2 is asked.
  - H2 CONFIRMED by x-npc-legs 20261022-121157 (numidium's read, {now} PDT):
    c2 400 units south of Sigrid's track facing north, c1 hosting; before
    and after the 40 s watch c1's Sigrid aiEnabled true and c2's false, her
    package 863288 then 863324. The frames five seconds apart (screenshots
    013 to 030) show her bent over the hoe, turning, back to the camera
    with the blade in the soil, one foot forward, then upright: a different
    pose each frame with the position moving. The watch (263 samples at
    250 ms) holds six walks of 1 to 3 s at 41 to 124 units/s between the
    shots; the puppet's graph events [45322 NPC_TurnToWalkRight90] and
    [65327 NPC_TurnToWalkLeft90] sit at the starts of the 46.3 s and 66.5 s
    walks, the locomotion graph's own walk starts, and IdleHoe,
    IdlePickup_Ground and IdleStop play between them. Not a glide: the
    relayed Speed and Direction drive the cycle. A stride on film wants
    shots every 0.5 s across one walk window, a later probe, not a tag.
  - H2 RE-OPENED by playtest 31 ({now} PDT): the reading above was an
    over-read. Eli, on the late-joining seat: "sliding npcs on test 2's
    screen". numidium's paired 30 s watch: Sigrid on the host c1 played
    [IdleStop, NPC_TurnToWalkRight90, moveStart, TurnRight, turnStop,
    TurnLeft, turnStop, CyclicFreeze, moveStop, IdlePickup_Ground]; her
    puppet on c2 played [NPC_TurnToWalkRight90, IdlePickup_Ground,
    NPC_TurnToWalkRight90, NPC_TurnLeft90, IdlePickup_Ground], the same
    track (maxDisp 237 against 240), never moveStart or moveStop or a plain
    turn. 0x1066df the same: c1 [TurnRight, moveStart, ... moveStop,
    IdleSleepStart], c2 [IdleSleepStart, IdleStop]. x-npc-legs's events had
    no moveStart either; the TurnToWalk events are the turn-in-place
    idles, not the walk. Cause, in the code: the host's AnimationSource
    drops ignoredAnims (moveStart, moveStop, turnStop, TurnLeft, TurnRight,
    the two Cyclic blends) at the source for every actor it reports, right
    for a figure whose keep-offset AI makes them, wrong for a puppet whose
    movement controller never runs. Fix on fork m3-train-32 b6dd852b: an
    NPC source keeps the five locomotion events (the Cyclic blends stay the
    local graph's); the receiver's applyAnimation already replays any event.
    The reading that closes it: x-npc-legs on that build, c2's watch events
    for Sigrid with moveStart and moveStop, and a frame with a stride.
  - x-npc-legs 20261022-190831 on train-32 16b8854a ({now} PDT, numidium's
    read): the relayed events reach the puppets and the turn-to-walks are
    taken (NPC_TurnToWalkRight90 at 16.3 and 41.2, Left180 at 27.4 and
    53.9, bAnimationDriven 1 for the turn), Dorthe's moveStart is taken,
    every moveStop, turnStop and IdleStop is refused (the graph was never in
    the move state), and on all four residents Speed, SpeedDamped,
    SpeedSampled, Direction, bInMoveState, iState, iSyncForwardState and
    iSyncIdleLocomotion read 0 for the whole minute, Faendal's included at
    50 units/s over 191 of 234 samples, although applyPuppetPose writes
    Speed and Direction at every sample. So the engine refreshes the graph's
    locomotion inputs every frame from movement data that the skipped step
    leaves at zero, and a walk on a puppet is a turn-to-walk followed by the
    idle blend while the relay carries the body: the glide, with the events
    now present. The enable storm is gone on the same run (2 enable results
    a seat against thousands), no figure is named by a puppet word, both
    npc-state reads hold. H2 stays OPEN; the fix is train-33's: the inputs
    written natively each frame where the engine reads them (the plan's R2,
    the re-analyst's question of {now} PDT: the data channels or the
    AIProcess fields behind Speed and Direction, docs/research/m3/
    re-puppet-locomotion.md), an SP export per puppet fed by the relay, the
    Move detour writing it. Baselines first on the merged build:
    x-npc-legs-host (the host's Speed and bInMoveState through the same
    walks) and x-npc-legs-burst (shots every half second).
  - R2 ANSWERED ({now} PDT, the re-analyst on sky-re, docs/research/m3/
    re-puppet-locomotion.md, CONFIRMED-STATIC for the chain): the graph's
    Speed, Direction and TurnDelta are not variables the engine sets by name
    but Actor animation graph data channels, registered once
    (Actor::CreateAnimationChannels, 37984) and polled at every graph tick
    before the step: Speed reads MiddleHighProcessData::currentMovementSpeed
    (MiddleHighProcessData.h:197), Direction reads rotation.z (:138, the move
    direction in radians clockwise from the facing, through
    Actor::GetMoveDirectionRelativeToFacing, Actor.h:555), TurnDelta reads
    rotationSpeed.z (:139); the three fields are written by the movement step
    37356 and its feedback tail only, so a skipped step leaves them 0, and a
    Papyrus SetAnimationVariableFloat lives less than a frame because the
    channel push (63590) rewrites the same variable slot before the step
    (63587). The Speed channel's own threshold at 5.0 raises moveStart and
    moveStop, the Direction channel the move direction actions (CONFIRMED by
    effect: the fed Speed raised the engine's own moveStart and moveStop at
    each walk's ends, x-npc-legs 20261022-202106 at 46.2 and 48.2, 60.8 and
    66.1, and x-npc-legs-burst 20261022-202522, and the fed Direction faced
    the stride along the track, 202522 f13 to f20; F2 and F3 not needed). Fix
    on fork m3-train-33 a9c43bf0: setPuppetLocomotion(actorFormId, speed,
    directionDeg, turnRateDeg), an SP export the client calls at each relayed
    sample in place of the two variable writes, stored per puppet under the
    registry's lock; the Move detour writes the sample every frame into
    currentMovementSpeed, unk2AC (TargetSpeed's source, :198), rotation.z
    (wrapped to [0, 2 pi)) and rotationSpeed.z after its Move(delta, zero)
    stamp; the relay's locomotion events return to the figures' rule.
    CONFIRMED on train-33 (202106, 202522, 204726, 214026): the client's speed
    and direction land in the engine's units and sign (Sigrid 77.8 against the
    host's 80.1, Dorthe 223.1 against 221.4), no other writer zeroes the
    fields (F1, by the read), the stage order moot while Speed reads the
    host's (F5, movement before animation); the gait from Speed alone (F6)
    stays at :1027. The reading that closes H2: c2's Speed and bInMoveState
    above zero through a walk, the engine's own moveStart and moveStop in c2's
    events, a stride in x-npc-legs-burst's frames.
  - THE HOST'S BASELINE (x-npc-legs-host 20261022-195031 on parity 16b8854a,
    {now} PDT, numidium's read): through the same minute the host's graphs
    read Speed about 80 at a walk (Sigrid max 80.1, Alvor 80.1, Faendal 81.6)
    and about 220 at a run (Dorthe 221.4), SpeedSampled 103 to 123 walking
    and 276 running, Direction changing 116 to 256 times; the puppets on c2
    read 0 for all three while their tracks moved over 50 units/s in 95 to
    212 of 250 samples. bInMoveState is no indicator: one sample, False, on
    both seats, the host's walking Sigrid included (a by-name bool read gets
    nothing from an NPC graph, or the name is not its walking state). The
    host's own graph refuses many of its moveStarts and turns too (moveStart
    2 taken, 4 refused; turnStop 3 and 11), so a refused event on a puppet is
    no fault in itself. Train-33's read is therefore Speed, SpeedSampled and
    Direction on c2 against these values: about 80 walking, about 220
    running, Direction changing with the track.
  - TRAIN-33 WORKS ON TWO OF THREE (x-npc-legs 20261022-202106 on a9c43bf0's
    stage, {now} PDT, numidium's read): the fed inputs reach the graph.
    Sigrid's puppet on c2: Speed changing 17 times to a peak of 106.2,
    SpeedSampled 168.0, Direction 15 changes, the speed following each walk
    (72 at 46.2 s, 106 at 46.6, 80 at 46.7, 79 at 48.0, 0 at 48.2) and the
    engine's OWN moveStart and moveStop paired with it and taken (46.2 and
    48.2; 60.8 and 66.1; 68.3), where 19e7ca9b refused every moveStop.
    Faendal the same, 4,700 units out: Speed to 126.2, 58 changes, moveStart
    and moveStop taken, moving in 234 of 270 samples. Alvor glided: a steady
    walk from 38.9 to 44.7 s at 51 to 84 units/s with Speed 0 and no
    moveStart; his events show IdleChairExitStart at 35.6 REFUSED, the turn
    taken, then IdleStop refused and IdleHammerTableEnter taken: his puppet's
    graph took the chair enter, refused the exit, and a furniture state that
    consumes no Speed was carried across the yard (distance is not it,
    Faendal is farther). Two things from it, on train-33 786a029d: (a) the
    host reports a game-file actor's Speed (the graph's own input, 80 at a
    walk) instead of SpeedSampled, which ran 1.3 to 1.5 times higher and
    blended the puppets toward a jog; (b) a refused furniture exit on a
    puppet ("*ExitStart" for game-file ids, filtered in native) is answered
    with IdleForceDefaultState on the next update; the path has not fired
    since this run (202106) and is unread, and the furniture state itself
    rides the relay (npc-stream: exits stay on the relay by design; Known
    limits K2). The reading that closes H2 on 786a029d: c2's Speed near the
    host's through the walks, the engine's own moveStart and moveStop, a
    stride in the burst's frames; the furniture state on a puppet is otherwise
    npc-stream's (the sit and sleep state).
  - H2 CONFIRMED ({now} PDT): x-npc-legs-burst 20261022-202522 on a9c43bf0,
    forty frames at 500 ms (40 of 40 over 19,507 ms, frame 0 at 20:27:32.97Z,
    the watch 79 s around them). Sigrid's puppet on c2: Speed 76 to 106 from
    9.3 to 16.1 s with moveStart 9.3 and moveStop 16.1 taken, 72 to 80 from
    22.1 to 29.6 s with moveStart 22.1 and moveStop 29.6, moveStart 35.5;
    Dorthe's ran at Speed up to 307 (21.5 to 25.6 s) and walked at 91 to 93
    (41.4 to 42.0), each with moveStart and moveStop taken; Faendal's 75 to
    114 through the first 25 s; Alvor sat, no events. The frames (f13 to
    f20, results/train-33-stride/zoom.png, read by numidium and by me): back
    to the camera, then in profile mid-step with a foot ahead and the arms
    off her sides, then walking into the camera with the arm swing and the
    skirt's hang changing frame to frame while she grows in frame. A walk,
    beside the decisive read (the graph's Speed and the engine's paired
    events). What stays HYPOTHESIS under its own name: the gait from Speed
    alone (F6, the host-seat gait calibration,
    re-puppet-locomotion.md:150-152, a Frida plan with no probe file and no
    run; 786a029d reports the host's Speed, 80 at a walk, so the blend sits at
    the host's gait); the turn rate (0 fed; TurnDelta from the channel is the
    heading's own; it names no probe yet); the stage order (F5, moot while the
    read holds). Not tags: the refused furniture exit's reset is Known limits
    K2; cell-host's own-cell guard (2ce4fd36, the event on time in 214026) is
    cell-host.md's.
  - THE SPEED AT THE HOST'S, AND ALVOR'S CAUSE (x-npc-legs 20261022-204726 on
    786a029d, {now} PDT): the puppets' Speed now sits at the host's (Sigrid
    77.8 against the host's 80.1, Dorthe 223.1 running against 221.4,
    Faendal 83.3 against 81.6; SpeedSampled 96.6, 268.6 and 120.7), every
    moveStart and moveStop taken, the enable count 2. Alvor glided again
    with Speed 0 through two walks at 51 to 86 units/s, and this time not by
    his chair: IdleChairExitStart was TAKEN, isInFurniture 0, every event
    taken. The cause is in movementGet.ts, not the graph: getRunMode answers
    "Standing" for any actor holding a furniture reference
    (ac.getFurnitureReference() !== null, the TODO's branch), which Alvor
    keeps as his AI's current furniture between the forge's and the tanning
    rack's markers, and applyPuppetPose fed 0 whenever the run mode was
    Standing, the gate kept from the variable-write version. Fix on
    929e3bc2 (pipeline 2647): the host's Speed is fed as reported, whatever
    the run mode; the host's channel is 0 when an actor truly stands. The
    read: Alvor walking between the markers at Speed near 80 on c2.
  - ALVOR FED ({now} PDT): x-npc-legs 20261022-214026 on the train's fourth
    head 2ce4fd36 (929e3bc2's speed feed plus cell-host's own-cell guard):
    Alvor walked and was fed, Speed changing 15 times to 77.8, SpeedSampled
    81.9, moveStart and moveStop taken, moving in 22 of 240 samples; Sigrid
    77.8 with four starts and four stops, Faendal 83.3; Dorthe sat. The
    furniture run-mode cause is confirmed. The gate runs on 2ce4fd36; its
    merge is playtest 32's build. HYPOTHESIS by name after it: the list at
    :1027 (the gait from Speed alone, F6, the host's Speed now fed; the turn
    rate, 0 fed; the refused exit's reset Known limits K2 and the own-cell
    guard cell-host.md's, not tags).
  - the slide CONFIRMED gone: the shout's first word staggered the puppet
    (staggerStart taken at 1465 ms, IsStaggering true 1495 to 4228 ms) and
    its track moved 12.7 units at most, the body back at its point (the
    2026-10-18 reading with plain AI off slid 120 units at 40 u/s): hook
    3's Move-at-rest holds the body.
  - H1 CONFIRMED by the stagger: an AI-off puppet's graph took and played
    the stagger (the bool rising and falling, the head node 28 units lower
    mid-stagger) where the 2026-10-18 reading left the graph frozen; the
    play-idle step itself returned false (Papyrus PlayIdle refuses an
    AI-off actor), so the idle check needs an animation-event step, not
    needed now.
  - H6: the draft into combat measured again (inCombat true, combatTarget
    the player, 1 s after the hit) and, solo, never undone: the sink is
    skymp5-client's, absent from a solo game; the undo stays HYPOTHESIS until
    b-npc-puppet carries the claim (c2's shout at its puppet Sven, inCombat
    false on c2 3 s after): today's b-npc-puppet has no hit on a puppet and no
    inCombat claim (its header :19), so no two-seat run has asserted it.
  - H5 CONFIRMED: at the promote the drafted bandit was moving within 0.5 s
    (89 units) and at 2.5 s 180 units on, and after the second shout the
    watch took three attackStart events with moves and turns: the AI and
    its combat resumed at once (combatTarget kept from the puppet time:
    npc-handoff's restore question answered for a hit-drafted target).
  - H7 inconclusive: the sneak frame shows no stealth eye, but whether the
    tap toggled sneaking is unread (no camera cue); a bark: none in the
    log window.
  - P1 READ (the rerun 20261022-044255 on lab-api a9aa9d6's fetch, 281
    lines, 21:50 PDT). c1.log: "[verb:npc-puppet] detours installed:
    animation queue true, movement step true" at the platform's start, the
    demote "puppet ff00081a: AI off, combat stopped, keep-offset cleared"
    at 21:44:33 and the promote "live ff00081a: AI on, package evaluated"
    at 21:45:18. On the trace's own clock (ready 21:44:29.6) the puppet
    phase is 3 s to 48 s. The bandit's movement-step ENTRY fired about 47
    times a second throughout: expected, since the Gum replacement sits at
    the entry and the trace counts calls into it, not the original's body.
    The discriminator is Move's translation: every Move in the puppet
    phase carried exactly zero, the shout's stagger at 40 to 44 s
    included, and non-zero translations (the controller's output, the
    stagger's root motion and the charge) begin in the second of the
    promote. Hook 3 CONFIRMED: the step's body is skipped for the puppet
    and the controller ticks at rest. The controllers' simulate stamped
    the step every frame (18 rigid-body controllers at about 846 calls a
    second, the player's proxy at 47; zero steps: none), so R1's shape
    holds and the slide's absence has its mechanism. The animation job's
    distinct handles sat at 19 or 20 with other actors flickering, so hook
    2a's count is inconclusive here; H1 stands on the stagger playing with
    the AI off (the first run). A zero-step hazard fired twice a second on
    ONE rigid-body controller from the first second, before any puppeting
    and not the bandit's: a controller the engine never simulates (an actor
    out of the Havok world), HYPOTHESIS until the next npc-puppet.js P1 trace
    names its actor (nothing since 044255), harmless to the verb; the script
    now names its actor for the next trace.
- THE LANDING HANG (2026-10-21 22:0x to 23:06 PDT), the gate's two reds
  b-npc-puppet 045602 and b-cell-host 045917 and the probe's third
  (x-npc-landing-trace 054932): c1's game alive and silent from the first
  seconds after its load, every time its server had NPCs on. Read from the
  dumps (two parsed on the Mac, 115 and 122 threads, every frame by module
  offset and Address Library id; dump/threads.txt and threads-2.txt): no
  exe thread runs, no lock is held, the load freeze is excluded (the image
  base's slot outside the NaN ranges, TMS's fix armed and silent, 70172
  and 90711 on no stack); the one running thread is Skyrim Platform's JS
  worker, spinning in V8's StackFrameIterator::Advance on a StackHandler
  linked to itself, which a JavaScript entry leaves behind when it exits
  without V8 unwinding it; the frame right under the spinning entry still
  holds the text of the login's benign filename error (the plugin-name
  check refusing DigitigradeKhajiit+ArgonianRaptor.esp, present in every
  run on every build), so the spin began inside that exception's unwind,
  the first after the chain was broken. The breaking, in Skyrim Platform's
  Hook.cpp: AddHandler threw a C++ std::runtime_error whenever
  addRemoveBlocker was non-zero, an atomic any game or job thread raises
  before it hands an animation event's Enter to the JavaScript thread, and
  the hooks API's add callback was not wrapped, so the C++ exception
  crossed V8's frames unwound by nothing. The npc-puppet build is the
  first to host game-file actors: at the grant sendInputs creates one
  AnimationSource per hosted actor (one add each) while those actors fire
  animation events from the job threads, so the collision was certain;
  the earlier builds met it only when a lone copy became hosted at the
  wrong instant (a candidate for the lab's rare freezes). Confirmations:
  x-npc-cow-solo 051307 GREEN (the detours' presence and the engine's
  wolves do not hang a landing); the second seat, a non-host showing
  puppets, never hung in any run; in 054932 the exception trace attached
  after the grant and saw no throw. Fixes, fork 931de577: the add and
  remove guard is the JavaScript thread's re-entrancy depth inside
  HandleEnter and HandleLeave, and both callbacks are wrapped. A SECOND
  BUG from the same run's server log: c1 streamed "107d07" at 7.5 Hz from
  the instant of login, 28 s before any grant (the server's "may not move"
  warnings), and after the grant the server moved that deer's record to
  the player: the player's own movement went out under the deer's index,
  the player's slot in the world model having been taken by a game-file
  actor's model after a free (the id manager reuses freed slots). Fix,
  the same head: a message about the player goes out only under a slot
  whose form is the player's own, and nothing for the player until that
  form is here. The three earlier fixes (9faa4be0) stand. Memory:
  frida-lab-script-pitfalls, feedback-trace-reading-axes. Rows: ship
  SkyrimPlatformImpl.pdb in the client artifact (the hooks-API frame
  stayed an offset); the Papyrus hook's Enter still scans the handler map
  from the hooked thread.
- THE LANDING HANG, SECOND READING (2026-10-21 23:38 to 2026-10-22 00:4x PDT): the
  hook fix did not hold (b-npc-puppet 063157, b-cell-host 063508 on
  931de577 hung c1 the same way), so the 23:06 entry above names a real
  defect that was not the cause. The lab closed in from the outside
  (numidium): the client's two switches off, one at a time and both
  (x-npc-switch-a 064935, -b 065308, -c 065645) all HUNG; a lone c2
  (x-npc-lone-c2 070852) GREEN and a lone c1 (x-npc-lone-seat 071125)
  HUNG; c1 logged in as profile 2 (x-npc-c1-as-p2 073443) GREEN; profile 1
  moved 200 units south into profile 2's cells (x-npc-p1-south 073851,
  snapshot clean-p1south-20261022T0740Z) GREEN. So the trigger is the actor
  set the server streams to profile 1's parking spot (14 units north of a
  cell edge, so the streaming grid gives it the cell one north of profile
  2's; fe010803, an ESL-slot form, draws the server's Negative Magicka
  warning only in those logins), not the seat and not the record. From the
  dumps: 045602 and 054932 ran job 10565's DLL (every return address on
  the spinning thread is preceded by a call in that build alone); the
  Skyrim Platform frames are the update dispatch (the "update" lambda,
  napi_call_function's caller); and the spin, read in libnode 23.2.0 (V8
  12.9.202.28-node.11) from the same dist, is Isolate::UnwindAndFindHandler
  advancing a StackFrameIterator (libnode+0xf86cc0 pops the C_WASM_ENTRY
  handler and walks the handler chain to the frame's fp; +0xf86c70 skips
  to the next JavaScript frame) over a StackHandler chain linked to itself.
  The "frame under it" of the first reading was the dispatch lambda's local
  holding the filename error's text: that exception had been caught and
  logged, and a LATER exception in the same dispatch spun. Both exception
  traces had armed after their hangs (054932's ready at 05:50:48.7 UTC, the
  hang at 05:50:47.3; 071646's a second late: the injector attaches by name
  after a relaunched game has passed kDataLoaded), so "no C++ exception"
  was never measured. The one unwrapped callback that can throw:
  CallNativeApi.cpp's latent path built its promise with an executor lambda
  (platform_lib/CreatePromise.h is new Promise(executor)) that ran
  CallNativeSafe and a null-pointer test from inside V8's Promise
  constructor; a C++ throw there (CallNative.cpp's "Expected self to be
  non-null" and kin) unwound through V8's frames to the outer callback's
  wrapper and left the nested entry's handler registered. Fix, fork
  7dd03c88: the latent native is called in the wrapped callback and
  resolved through a Napi::Promise::Deferred (no executor, no thread-local
  pointer), so a failing latent call is a JavaScript error; and baseId 0 is
  a player (CreateActorMessage.h's optional defaults to 0 and the wire
  carries it, so every player's CreateActor says baseId 0; isNpcModel and
  isFigure read it as an NPC, which made every player's figure demotable
  and the player's own view a puppet at login; the clean world's two
  records store no baseId, baseDesc 7:Skyrim.esm). Owed: the trace in the
  relaunch shape (x-npc-napi-relaunch) naming the failing latent native,
  then the client path for that actor; the lone profile-1 login on clean
  with 7dd03c88 as the proof; b-npc-puppet and b-cell-host; the gate.
  Memory: skyrim-platform-thread-shape, frida-lab-script-pitfalls.
- THE FIXED LANDING'S TWO REDS (2026-10-22 01:1x to 01:30 PDT; numidium's
  runs on 54df2a42): b-npc-puppet 081631 landed both seats in under 5 s
  and held the grant asserts, then failed c1.npc_state(0x13483).aiEnabled:
  the host demoted 23 actors at the Riverwood attach and promoted 5
  (1066df, 10962a, 1e62b, 60b22, 1066de), none of the named residents;
  Sigrid stands in (5,-12), inside the grant's 3x3. The residents are
  persistent references: Papyrus GetParentCell answers the worldspace's
  persistent cell for them, so isHostedHere never counted them as the
  host's, and the grant's cell walk (Cell.getNthRef) listed only the
  cell's own references; the walk also ran at the message's tick ("Game.
  getFormEx can't be called in this context", 27 lines). Fix 7fef1bec:
  the server's word per actor (ADR-045 point 2 revised, above). b-cell-host
  081903 failed the handoff because the cell's second predator killed c2
  1.6 s after it arrived (129.92 unarmed damage, a power attack at the
  race's number through TES5DamageFormula: a real fight, as npc-puppet
  means it) and the respawn unloaded c2's set, so c1's leave found no
  second loader; fix, thuum main b46e3ed7 (its own commit, rule 13): god
  mode on both seats at the scenario's start, the hosting assertions
  unchanged. Next on 7fef1bec (pipeline 2598): T2 on sky-srv, the stage,
  the lone profile-1 login, b-npc-puppet with every named resident's live
  line, b-cell-host, the gate; the lab held to 05:05 PDT so the nightly
  waits.
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

- THE ROSTER'S FIRST LAB RESULT AND THE SILENT WIRE LOG (2026-10-22 02:36 to
  03:19 PDT). ad1f2356 staged at 02:57: x-npc-lone-seat 095809 green, b-cell-host
  100312 green, T2 green (33 identical), b-npc-puppet 100041 RED and numidium's
  x-npc-sigrid-ref 100845 the same from one seat: zero "sights" lines on the
  server, zero live lines on c1, Sigrid's record still in Alvor's house 20 s after
  the landing, 0x13483 and 0x1066df both aiEnabled false on c1. The roster never
  reached PartOne's accept path and nothing on either end said why: the client
  wrote no line per roster, PartOne logged only successes, and c1's wire log
  (Data/Platform/Logs/MpClientPlugin-logs.txt) had been full since 2026-10-18
  02:36 (4,194,407 bytes): the plugin dropped every line past its 4 MiB cap, the
  file persists across launches and sits inside clean-m1-next, so every run since
  started with c1's refusals invisible. MpClientPlugin.dll is current on every
  game folder (2607's dist). Fixes, all readings: 23d8abfa (the client looks each
  sighted reference up afresh at report time and traces every roster sent:
  "roster: N sighting(s) sent, U unknown of A attached, H cell(s) hosted"),
  757066f3 (the server logs each roster's arrival once in ten seconds per
  reporter and each drop reason once a minute per actor; the wire log rotates
  to MpClientPlugin-logs.1.txt past 4 MiB), pipeline 2609. numidium empties the
  wire log when client-dist lays a dist. The next b-npc-puppet reads three ways:
  a "roster:" line in c1.log (the client sent), a "refused" line with t 50 in
  c1's wire log (the plugin dropped it, and why), "roster from" and "dropped:"
  lines in server.log (the server took it, and why nothing changed). Side
  finding from c2's live wire log: every one of its 1,835 send lines is a type 5
  UpdateEquipment refused for an inventory entry of count -1 (baseId 0x13790);
  that seat's equipment has never gone out on the wire. Its own branch (LOG).
- THE HANDOFF'S TWO HALVES (2026-10-22 03:37 to 04:00 PDT). On 757066f3 the
  roster works: b-npc-puppet 104032 held steps 14 (c1's Sigrid AI on, c2's
  off, no copies) and 24 (both tracks 285 to 294 units over the minute,
  0.004 units apart at the end, turns 0.52 and 0.16, no spin), the server
  accepted ten sightings and placed eight residents from their interiors
  (10:42:06 UTC), and went red at step 29, the handoff: nine cells moved to
  c2 at epoch 2 and FlipHostedFlags ran for each, yet no promote on c2 and
  c1's read AI on. (1) UpdatePropertyMessage names baseRecordType only for
  DOOR (PreparePropertyMessage_, #1186), and the client's
  skipFormViewCreation files an id under 0xff000000 without NPC_ under the
  engine-reference branch (inventory, isOpen, isHarvested, disabled only):
  the word at placement rode CreateActor, which names the type; the flip
  never arrived. Fix: NPC_ named for a game-file id as DOOR is (a 0xff id
  binds to its model without it; RespawnTest's player shape kept);
  CellHostTest asserts the type on the flip. (2) The leaving host is no
  listener of the residents when the release comes (its forms destroyed at
  leaving reach), so no word reaches it and the unloaded persistent actor
  keeps the AI bit. Fix: a game-file actor whose form the server takes back
  while live here goes puppet at the loss (formView.destroy(lost) from
  formViewArray, PuppetService.demoteOnLoss; the native clears the bit
  alone with no 3D, Is3DLoaded TESObjectREFR.h:435). eedc2f58 then
  19e7ca9b, pipeline 2614; the chain and the gate after it.

## The roster that races the grant (built 13:33 PDT 2026-10-29, fork m3-grant-roster 5b6ef482)

Playtest 38's finding 66 ("attempted to kill a bandit outside bleakfalls. all damage was ignored"): rotfern stepped out
of the barrow at 20:00:49Z, the server granted it the exterior block at 20:00:51.189Z, and its roster of the same
millisecond (the bandit 105a22, ddf87) was dropped "the cell is nobody's yet"; the next roster came ten seconds later
(the client reports every 2 s while it hosts a cell, and it hosted none yet), after the player had died to the bandit it
could not hurt (a live NPC without a server id is no hit target on the client while the engine's own damage is cut).
The fix is the server's alone, no wire change: a sighting dropped for a missing host is held per cell (PartOne::Impl
heldSightings, kHeldSightingsPerCell 64, kHeldSightingMs 30 s, one entry per reference) and ApplyHostDecisions replays the
held ones for the grant's host right after the flags flip (PartOne::ReplayHeldSightings, one info line "held before the
grant replayed"); a sighting of another game's cell is never held. T0: CellHostTest "A sighting that arrives before its
cell's grant is held and replayed". HYPOTHESIS (the replayed record's CreateActor reaches the host within a round trip of
the grant) until x-grant-roster (v2 by path, unrun) with a claim added: when its recorded replay line is present, the held
id's first "sights" line stands within 1 s of the grant line (a log-timestamp pairing the grammar lacks today; T0
CellHostTest proves the mechanism, the lab the timing). A client belt for later: hostService.onHostGrant resetting
lastSightings so the next poll reports at once.

The review of m3-pass-train-1 (18:08 PDT 2026-10-29) hardened the hold (7b8ff8ea): the dedupe key is the pair (reporter, reference),
so a second reporter's roster no longer evicts the first's entry and the grant replays the new host's own entries while keeping the
others for their own grant inside the expiry; the hold is bounded across cells (kHeldSightingsTotal 1024, the oldest dropped at
the cap with a warn once per 10 s), swept once a second from the cell-host tick (the 30 s expiry no longer waits for a new
sighting of the same cell), and a reporter's entries are forgotten at its disconnect beside the cells rule's gone. CellHostTest's
two new cases drive the pair key and the bound; HeldSightingsCount is the lab's read.

## Status

Doc drafted 2026-10-21, before any code. Build begun 2026-10-21 17:41 PDT
on the plan Eli approved (one shot, six stages, docs/LOG.md's entry).
Fork m3-npc-puppet (off parity 535544db with m3-relay-echo 41f554ad):
Stage 1 server a29bfb08; Stage 3 client eaa3b6d0; Stage 2 Skyrim Platform
d9a003fd (the exports, the set, the two detours with R1's Move shape); the
fixes 6f08c050 (the test: a created actor subscribes at its own first
SetPos) and eab366b2 (the hooks: Actor's runtime fields through
GetActorRuntimeData()). CI GREEN at 18:3x: pipeline 2562, server-build
(every T0 case, the two new CellHostTest cases and NpcExists' Alvor among
them) and client-build (the Windows dist with the detours) both success.
Before it: 2555, 2557 and 2560 red on the 0xff flip assertion alone (the
new actor had no listeners at the grant in the test's sequence), 2558 red
on the Windows compile of the hooks. Playtest thirty closed at Eli's word
21:00; P0 ran and measured nothing (the Dynamic plan's outcome); the
grammar merged (main 9b4bec3); the stage up (verb-stage m3-npc-puppet
eab366b2 from main 9b4bec3, clean-m1-next snapshotted 21:21, smoke
20261022-042248 GREEN, T2 running identical); x-npc-puppet-2's first run
20261022-042521 GREEN with H1, H3, H5 and H11 confirmed, the slide gone,
H2 supported (the Dynamic plan's reading), its P1 trace waiting on
lab-api's fetch fix; b-npc-puppet committed alone (main 3a3aef0), Eli's
review pending.
THE WALK CYCLE CLOSED 2026-10-22 18:13 PDT: train-33 merged to fork parity fb6f3f09 (gate 20261023-004438 nine of nine, T2 33 identical), the puppet's graph fed natively each frame (H2 CONFIRMED above), the figure settled onto a still record, the host's own cell reported; the tags that stay by name: the refused furniture exit's reset, the own-cell guard (both unexercised), the turn rate, the gait from Speed alone (F6).
DONE 2026-10-22 05:54 PDT: fork parity 19e7ca9b (verb-merge, gate run set 20261022-122513-merge-m3-npc-puppet nine of nine on lab-driver ebb6969 (smoke, a-restart-persistence, b-duel, b-npc-puppet 123325, b-cell-host, a-melee-reach, a-racemenu, b-spell, b-invis-recast), after the first set 113519 went eight of nine red on a-restart-persistence 113744 by the driver's random near sample; T2 33 identical beside it), thuum main fbee62d. 

- [x] doc complete, inventory listed with a disposition per row, rung declared (2026-10-21; the dispositions stand on the 2026-10-18 references and x-npc-puppet's two runs, to be re-read on the merged base)
- [x] engine surface cited or delegated (CommonLib file:line for every field and switch; the detours' prototypes read by the re-analyst through REA on sky-re, 2026-10-21 08:43: 41370, 41466, 41453, 41454, 69349, 37356 and its chain, every claim CONFIRMED-STATIC or HYPOTHESIS with its instruction; the Frida trace that confirms them named)
- [x] server logic + T0 (a29bfb08 and 6f08c050; pipeline 2562 green: CellHostTest's game-file case and the 0xff flip, NpcExists' nested flag and Alvor)
- [x] message + validator (same commit) (no wire change: CreateActor's refr_id and base_record_type carry values within their types; the contract line in docs/WIRE.md; wire-validate's tests stand, 2562)
- [x] native hook + T1 (built d9a003fd and eab366b2, the Windows dist compiled in 2562; every id resolved by `just addr`; no host-less T1 exists in the fork, so the proof is the seat's: "[verb:npc-puppet] detours installed: animation queue true, movement step true" in c1.log, the demote and promote lines, and P1's trace 20261022-044255: zero Move translations through the puppet phase, the original's output from the promote on, every controller's step stamped; 21:50 PDT)
- [x] TS handler (eaa3b6d0 and d9a003fd: PuppetService, HostService's rule, the view's engine path and Rule A gates, the puppet apply; tsc clean, client-build green in 2562)
- [x] T2 green (2026-10-21 21:39 PDT, numidium: test-proto at m3-npc-puppet eab366b2's image, all 33 difftest sessions identical between the legacy and the wire stacks; no ESM actor in a session by design, the Tests section)
- [ ] T3 scenario green, no HYPOTHESIS tags (unticked 17:19 PDT 2026-10-29 by the pass's inventory: ticked at 123325 while tags stood; the earlier tick's text kept: (2026-10-22 05:54 PDT: b-npc-puppet 123325 green on 19e7ca9b's stage, the gate run set 20261022-122513-merge-m3-npc-puppet nine of nine on lab-driver ebb6969 (smoke, a-restart-persistence, b-duel, b-npc-puppet 123325, b-cell-host, a-melee-reach, a-racemenu, b-spell, b-invis-recast), after the first set 113519 went eight of nine red on a-restart-persistence 113744 by the driver's random near sample; T2 33 identical beside it; the tags that stay carry a name: H2 re-opened by playtest 31 the same morning (the puppet slid; the relay dropped its locomotion events), fixed on fork m3-train-32 and read there; H6 and H7 npc-stream's; H8 npc-handoff's))
- [x] parity scenario green, or its later list reviewed with it (ADR-031) (b-cell-host green in the gate; the engine-alone references r-npc-packages, r-npc-fight and r-cell-leave of 2026-10-18 are the diff's base, their reruns on the merged base listed in the Dynamic plan)
- [x] sequences and combinations green, every checklist item with its scenario (ADR-033) (the handoff and the restart inside b-npc-puppet; the figure beside a puppet in b-cell-host; playtest 31's checklist carries the rest by item)
- [x] ledger and suppression registry updated (no Papyrus native added: setPuppet and isPuppet are Skyrim Platform exports, listed in the Suppress section's registry; docs/NATIVES.md unchanged)

## Playtest thirty-three (2026-10-23, fork parity ac557132; fixes on m3-train-36, parity 7b3a17c6 since 03:01 PDT, and m3-train-37, parity 69958274 since 08:07 PDT)

- A late-joining seat found eight residents frozen at its own engine's
  placement, unblocked and unsampled, until a lookup loaded their records.
  WorldState::LoadChangeForm defers a game-file id's ChangeForm until the form
  loads (changeFormsForDeferredLoad, WorldState.cpp:279); the chunk loader
  loads the game files' exterior placements alone (GetNeighborsByPosition),
  and Riverwood's residents are placed indoors, so the server held no form for
  them from the restore until OnActivate's LookupFormById loaded one at the
  host's own E (refused for reach against the stale record; the host's first
  report, a cell move, 31 to 48 ms later). No CreateActor reached any seat
  meanwhile and both engines ran them by their own schedules. The host's roster
  never named them (its rosters carried the animals, 4 to 12 entries), which
  OnActorSighting would have answered with a load; why the host's attached set
  lacked the named residents was the open question, and train-36's stage
  answered it (the server now logs each roster's ids; x-npc-late-join
  20261023-092309): the host's rosters carry the animals, the creatures and
  the placements (9b0dd 9b0dc 9b0db 6e296 8480b 6e297 105a25 105a35 8cacd)
  and never a named resident, so the cellAttach events HostService's attached
  set is built from do not fire for the persistent residents (the engine
  attaches them to the worldspace's persistent cell at the world's load, not
  at a cell's), and PuppetService's cellAttach demote never saw them either.
  A resident with no saved record is therefore loaded by nobody and runs
  live in both games (Hilde 0x35534 in that run, playtest 32's six before).
  Train-36 (fork parity 7b3a17c6, 2026-10-23 03:01 PDT; the gate
  20261023-092824 nine of nine, T2 33 identical): WorldState::LoadDeferredActors
  as the save attaches, every saved game-file actor on the grid at its saved
  position (NpcExists' case, Hod 0x1348a), which puppeted seven of the eight
  residents on the late seat (x-npc-late-join 092309).
  The roster's source is train-37's (fork parity 69958274, 2026-10-23
  08:07 PDT; the gate 20261023-143826 nine of nine, train-36's T2 cited for a
  client-only diff): the export getHighProcessActors lists the engine's high-process
  actors (RE::ProcessLists::highActorHandles, CommonLibSSE-NG
  include/RE/P/ProcessLists.h:69; the game thread snapshots them by form id
  at every Actor animation stage in PuppetHooks' queue detour, the JS thread
  reads the snapshot with no game call); HostService's roster iterates it in
  place of the attach set, and PuppetService polls it every two seconds and
  demotes any game-file actor the server's word does not name as this game's
  (a resident the server does not hold yet is a puppet on its own host for
  one roster round, until its CreateActor's word promotes it). CONFIRMED on
  train-37's stage, x-npc-late-join 20261023-101310 GREEN (18 of 18): the
  new source sighted Hilde two seconds after the grant ("ff000000 sights
  35534 at (20347, -46423, -122) in 3c, cell 9732; the record stood in
  1cb84", her house), she worked furniture live on her host and stood as a
  blocked puppet on the late seat with the other seven; the attach event's
  silence for persistent references was the whole of the gap. For the
  oracle: the server's ten-second "ids [...]" line samples one roster per
  ten seconds, so a resident sighted once between two lines never shows in
  them; the "sights" line is the read.
- E on such an unblocked puppet opened the engine's dialogue with an AI-off
  actor, which never answers, and the Dialogue Menu stayed open (test 2 stuck
  until a relaunch). The block was the apply's per relayed sample, and
  7e59c32c had dropped the demote-time call. Train-36 (parity 7b3a17c6):
  PuppetApi's Demote sets
  TESObjectREFR::SetActivationBlocked(true) (CommonLibSSE-NG TESObjectREFR.h:464)
  and the Promote clears it; the TS blockActivation calls are gone for puppets
  (the figures keep the per-sample one), so no Papyrus-backed call runs at the
  attach or per sample for the village.
- Held: the bench (1db977ed), the handoff both ways in about 4 s, talk on the
  promoted seat after a handoff (8eafa85d's claim, which x-npc-talk-prompt
  055858 had read in the state), the walk ("a Tiny bit jumpy, otherwise doing
  ok").

## Amendment, 2026-10-24 (03:14 PDT): the loss-time demote and an unloaded actor

The demote at a lost form (formView.destroy(lost), puppetService.demoteOnLoss,
PuppetApi Demote) cleared the AI bit of an actor with no 3D as well ("the bit
alone"). An unloaded actor is simulated by nobody's engine, and no word
reaches a record nobody subscribes, so an actor whose record sat in an
unhosted interior at a reconnect stayed AI-off for good: npc-handoff's D11
(b-npc-handoff-night 092208) found it. Since fork m3-train-40 a146ee0c the
no-3D branch leaves the actor alone (AI and activation untouched, a log
line); the engine's low-process schedule moves it, the roster of the host it
walks in on sights it, and the server's word rebinds and places the copy when
its cell loads again (a snap at re-entry, the engine's own behaviour for an
unloaded actor). A loaded actor is demoted as before. b-npc-puppet's far-seat
asserts (the leaving host's Sigrid "aiEnabled false" from the lab spawn, and
the restart's "exactly one seat AI on") read the old mechanism and move to
"no loaded live copy" once npc-state carries is3DLoaded (numidium's grammar).

The rule generalized (05:40 PDT, fork m3-train-40 856fed7d): the loss path was
one road to an AI-off copy in a cell this engine does not load; the server's
Teleport of a viewer's reference into an unattached house was another
(b-npc-handoff-night 114904: c2's copy, demoted loaded, moved indoors, then
c2 won the post-restart grant and its unloaded AI-off Alvor never ran his
morning). So: a puppet this engine no longer loads is released
(releasePuppet, a Skyrim Platform export: the flag off at once, the AI and
activation back on on the game thread, no package evaluation on an actor
with no process), by the puppet service's two-second poll over its tracked
set; the same poll makes it a puppet again within two seconds when it loads
on a seat that does not host it, and the host's roster sights it. The cost
accepted: an unloaded copy wanders by its schedule until it is rebound, and
a reloaded one may take a step or two before the re-demote.

