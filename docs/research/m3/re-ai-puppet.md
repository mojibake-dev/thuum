# M3 puppet NPCs: the engine's AI switches on 1.6.1170 (static RE)

Status: static analysis by the re-analyst, 2026-10-16. Every finding is a
HYPOTHESIS under rule 2 until a lab run or a Frida trace confirms it; the tag
CONFIRMED-STATIC below means "the branch is in the code as read", not "the
game behaves so". No repo file was edited.

Program: `/SkyrimSE-1.6.1170.0.exe.unpacked.exe` in the sky-re Ghidra project
(image base 0x140000000), read through pyghidra-mcp. Every Address Library id
below was resolved with `just addr <id>` (147 ids, all present; the raw lines
are in `re-ai-puppet-addr.txt` beside this file). Reverse lookups (address to
id) used lab/addr.py's own loader through a scratchpad helper
(`scratchpad/rev.py`), exact matches only. RVAs are given only as supporting
data and are HYPOTHESIS; the id is the answer. CommonLibSSE-NG citations are
the submodule at b93280e8. 1.6.1170 layout: Actor runtime data starts at
+0xE8 (`REL::RelocateMemberIfNewer(..., 0xE0, 0xE8)`, Actor.h), so boolBits
is actor+0xE8, currentProcess +0xF8, movementController +0x150,
combatController +0x160, boolFlags +0x204; ActorState1 at +0xC8.

## Short answers

1. EnableAI(false) (Papyrus Actor.EnableAI, native thunk 54919, engine body
   37504) clears one bit, boolBits kProcessMe (Actor.h:160; IsAIEnabled reads
   it, Actor.cpp:741). Every per-actor AI loop tests that bit, and so does the
   animation pass: an AI-off high actor gets no AI update, no Actor::Update,
   no combat behavior, no stealth-meter detection, and no animation graph
   update. It keeps the movement job, hit processing and PerformAction, which
   do not test the bit. (CONFIRMED-STATIC)
2. No single switch gives "puppet, not brain". EnableAI(false) is the
   closest: one bit turns the brain off everywhere, but it also freezes the
   graph. Smallest set: EnableAI(false) + re-admit flagged puppets to the
   "Actor animation" stage (41370/41466) + skip the movement step 37356 for
   puppets + StopCombatAndAlarmOnActor 41340 at demotion and whenever a
   puppet enters combat. (branches CONFIRMED-STATIC; the set is HYPOTHESIS)
3. Neither SetPosition (37309) nor TranslateTo (56237) touches the graph or
   the AI: SetPosition teleports (data position, char controller, root node),
   TranslateTo slides along an ExtraRefrPath. Walking comes only from the
   graph, and the engine's speed feedback is computed from the movement
   step's own Move, not from external position writes. With AI off the
   movement controller's planner stops but its per-frame output and message
   pump keep running. (CONFIRMED-STATIC for the bodies; visible result
   HYPOTHESIS)
4. Promotion to live: SetPosition(last relayed, true), clear the puppet flag,
   EnableAI(true), EvaluatePackage, then StartCombat if the server says so.
   Papyrus EvaluatePackage is buffered (37401 with false, false) and runs on
   the first AI update after EnableAI(true). Demotion: StopCombatAndAlarmOnActor
   41340, StopMoving 37817, EnableAI(false). (calls CONFIRMED-STATIC; order
   HYPOTHESIS)
5. Probes at the end.

## The update pipeline (where kProcessMe is and is not tested)

The main loop runs a table of job stages; each entry is a function pointer
and a name string (read with read_bytes at the table referenced by the stage
functions). Stage functions by id, with their names from that table:

| stage id | name string | calls |
| --- | --- | --- |
| 39050 | "Actor update" | 41367 on ProcessLists (singleton data id 400315, CommonLib ProcessLists.cpp:13) |
| 39053 | "Actor movement" | 41306 |
| 39054 | "Actor animation" | 41370 |
| 39055 | "Player animation" | player's vtable 0x7D UpdateAnimation |
| 39056 | (name pointer outside the table block) | detection queue 42742 on data id 404596 |
| 39065 | "Combat and magic" | CombatManager 46872 (singleton data id 405246, CommonLib CombatManager.h) |
| 39068 | "Ragdoll post physics" | 41374 |

The gate. 41369, 41302, 41304, 41305, 41377, 41466 and 41408 all use the same
four-part test (disassembly of 41466 at function+0x68..+0x94):
`!(boolBits & 1<<9) && !(formFlags & 1<<21) && (boolBits & kProcessMe) && currentProcess`.
CommonLib names: boolBits bit 9 kInTempChangeList (Actor.h:168), formFlags
bit 21 kStillLoading (TESForm.h:89), bit 1 kProcessMe (Actor.h:160).

### "Actor update" (high process, every frame)

- 41367 (HYPOTHESIS name ProcessLists_QueueHighActorAI): if
  ProcessLists.runSchedules (+0x1E4, ProcessLists.h:94) is false, calls
  vtable 0xAE UpdateNoAI(0) on every high actor (this is the console's global
  "All AI Processing" toggle, 41327, from 22855); else queues job 41448, which
  calls 41369 per high actor (highActorHandles +0x30, ProcessLists.h:69).
- 41369 (HYPOTHESIS name ProcessLists_HighActorAIJob): gate fails (AI off)
  -> vtable 0xAE UpdateNoAI(0) only. Gate passes -> high process: 37347 (AI
  update) or, when 37277 holds, CheckForNewPackage 39114 + 39605; then 41450;
  then vtable 0xAD Update(0) (37348).
- 37349, vtable 0xAE UpdateNoAI (Actor.h:372, CommonLib comment
  "{ return UpdateActor3DPosition(); }"): disassembly is
  `mov rax,[rcx]; jmp [rax+0x8f8]`, slot 0x11F UpdateActor3DPosition (37995,
  Actor.h:485), which copies data position and heading into the root node
  and queues the node update. CONFIRMED-STATIC.
- 37347 (HYPOTHESIS name Actor_UpdateAI): returns at once if formFlags
  kDisabled or kProcessMe is clear (its own second guard). Body: voice timer
  37752 (dialogue line timers), AIProcess timers 39942/39943, movement
  planner (movementController slot 8, id 91878, with the delta), the buffered
  EvaluatePackage (boolBits kEvpBuffered bit 16 -> 37401 immediate, kResetAI
  bit 17), package processing 39108 (dispatch by process level: high 39637,
  middle-high, middle-low, low procedure switch with CheckForNewPackage 39114)
  or 39109, and 39174.
- 37348, vtable 0xAD Update (Actor.h:371): for NPCs only called after the
  gate passes. Body read as bleedout follow-up, water and swimming state,
  drowning damage through 37335 (HYPOTHESIS reading).

### Lower process levels

41305 (middle-high, +0x60, level 1, every 0.05 scaled game time), 41304
(middle-low, +0x78, level 2, 0.15), 41302 (low, +0x48, level 3) apply the
same gate and then call 37347 when due; an AI-off actor is skipped with no
call at all. These levels get no movement job and no animation job: 41306
and 41370 iterate highActorHandles only. So process level is a cadence and
feature tier, not a brain switch: below high a puppet would also stop moving
and animating. CONFIRMED-STATIC.

### "Actor movement" (not gated)

- 41306 (HYPOTHESIS name ProcessLists_QueueActorMovement): if runMovement
  (+0x1E5) is set, queues job 41444 for up to 128 high actors (asserts
  processlists.cpp line 0x887) and 41445 for the player. No kProcessMe test.
- 41444 -> 37350 (HYPOTHESIS name Actor_UpdateMovement): AIProcess 39447;
  movement controller message pump 41717; if delta > 0: 37355 (reads graph
  bools bAnimationDriven and bAllowRotation, FixedStrings +0x568/+0x570,
  FixedStrings.h:191-192, to pick the controller mode), 37356, vtable 0x11B,
  0x11C, 0xAF UpdateCharacterControllerSimulationSettings, 0xB0
  PotentiallyFixRagdollState, AIProcess 39548; always 39448/39599.
- 37356 (HYPOTHESIS name Actor_MovementStep; Skyrim Together calls it
  Actor::ActorProcess and skips it on remotes, docs/TE-MAP.md, lead only):
  graph bIsSynced, bSpeedSynced, Speed (FixedStrings +0x578, +0x580, +0x508);
  movement controller slot 7 (id 91877: for each registered movement agent,
  compute; then finalize) gives this frame's translation and rotation; vtable
  0x11A ModifyMovementData; then vtable 0xC8 Move (37507) or 0xA9
  SetPosition; then 0x11D ComputeMotionFeedbackSpeedAndDirection and 0x11E
  (37994) which writes speed and direction into the AIProcess (39873, 39878)
  from the displacement of this step only (positions sampled right before
  Move). No kProcessMe test anywhere in 37350, 37355, 37356 or 41717.
  CONFIRMED-STATIC.

### "Actor animation" (gated)

- 41370 (HYPOTHESIS name ProcessLists_QueueActorAnimation): if runAnimations
  (+0x1E6) is set, partitions highActorHandles with 41466 and queues job 41453
  per list A actor, 41454 per list B actor.
- 41466 (HYPOTHESIS name ProcessLists_PartitionAnimatedActors): list A
  requires the gate including kProcessMe (function+0x85:
  `shr ecx,1; test cl,1; jz skip`, ecx = [actor+0xE8]), plus process, 3D with
  a parent node, not deleted or disabled, parent cell state 7; list B is the
  subset whose cell has form flag bit 13. CONFIRMED-STATIC by disassembly.
- 41453 (HYPOTHESIS name ProcessLists_ActorAnimationJob): delta =
  GetSecondsSinceLastFrame (data id 410199, CommonLib Misc.cpp:82) times 44302
  on singleton 400883; 37364, 20121, 20122, 20123 (builds the
  BSAnimationUpdateData, calls vtable 0x79 ModifyAnimationUpdateData,
  Actor.h:322, then the graph holder update at actor+0x38), 39896, 37363
  (vtable 0x122/0x123 tracking). It is vtable 0x7D UpdateAnimation (37361,
  Actor.h:326) unrolled. The serial variant 41377 has the same gate.
- The cell animation path (18900 and its job 19204, which call vtable 0x7D
  through the wrapper 20120) explicitly skips Character references, and the
  player has its own stage 39055. So no other per-frame graph update exists
  for an AI-off NPC: EnableAI(false) freezes its graph. CONFIRMED-STATIC for
  the paths read; the visible freeze is HYPOTHESIS.

### "Ragdoll post physics" (not gated)

41374 queues 41447 for every high actor: 43690 (standing, not ragdolled),
37480, then vtable 0xAE UpdateNoAI(0) regardless of kProcessMe. An AI-off
high actor therefore gets UpdateNoAI twice a frame (41369 and 41447); a hook
on slot 0xAE that ticks the graph would double-tick without a guard.

### "Combat and magic" (outer loop not gated)

- 46872 (HYPOTHESIS name CombatManager_QueueMemberCombatUpdates) iterates
  CombatManager.combatGroups and each member, queueing 46902, which calls
  vtable 0xE4 UpdateCombat (38565, Actor.h:426). No kProcessMe test.
- 38565: returns for formFlags bit 21; if not dead, has a process and a
  combatController (+0x160): 33266, then 33236 (Skyrim Together's
  CombatController::UpdateTarget, lead) target selection unconditionally,
  then if 33234 is false and lifeState is not 6 (restrained): weapon handling
  and the behavior update 33217 (process level 0) or 33218 (others). Both
  begin with 33216.
- 33216 (HYPOTHESIS name CombatController_CanUpdate) returns false when the
  attacker's kProcessMe is clear (also: a global flag off, controller +0x41
  or +0x43 inactive, unloaded at level 0, sit states, knocked 37484,
  paralyzed boolBits bit 31, 39452, 37199). So with AI off the combat
  behavior controller (+0x20), inventory (+0x10), group (+0x8) and aim
  controllers do not update; target selection still does. CONFIRMED-STATIC.
- Entering combat: from the AI update (gated), from Papyrus StartCombat
  (54768: refuses player, dead, no process, in dialogue; then TaskQueueInterface
  task 36959 on data id 403759, CommonLib TaskQueueInterface.cpp:7; no
  kProcessMe test), and from hits (38586 ends with combat controller notice
  33224; where the controller is created was not traced). HYPOTHESIS: an
  AI-off puppet can be put into a combat group by a hit or a script, where
  it runs target selection but never attacks.

### Detection

- 41408 ProcessLists::RequestHighestDetectionLevelAgainstActor (CommonLib
  ProcessLists.cpp:89) skips dead actors and actors failing the gate: an
  AI-off actor never counts toward the stealth meter. CONFIRMED-STATIC.
- 42742 (HYPOTHESIS name DetectionQueue_Process, stage 39056, queue data id
  404596): pops ActorKnowledge entries (owner handle +0x10, target +0x14),
  skips deleted/disabled pairs and pairs beyond 8192 units of the player or
  of each other, runs 37774 (HYPOTHESIS name Actor_CalculateDetection: needs
  both processes; distance, cone, sight, light, sneak, perk entry points 0x0F
  and 0x2F, then sound) when ProcessLists.runDetection (+0x1) is set, and
  42704 stores the result (swaps the knowledge's result object, clears its
  queue time, and if it has listeners adds it to a notify list through
  42715). None of these test kProcessMe.
- Entries are queued only by requests (42700 from 37759 and 39517; 42712).
  HYPOTHESIS: with AI off the main requesters (37347 and 41408) stop, so a
  puppet's knowledge goes stale; already-queued pairs finish computing and
  nothing acts on them. Skyrim Together hooks 42704 because it keeps AI on.

### Hits and actions (not gated)

- 38586 (HYPOTHESIS name Actor_ProcessHitVictim; id from
  ghidra/notes/block-formula.md, here read on 1.6.1170): returns early only
  for knockState 5 or no process, defers through TaskQueueInterface when
  39033 says so; no kProcessMe read. Damage 37335, stagger 37710, recoil
  37708 (PerformAction 38949), hit events, combat notice 33224.
  CONFIRMED-STATIC.
- 37710 (stagger start; renamed earlier by another session) refuses lifeState
  6 (restrained), ragdoll, already staggered, no 3D or process; no kProcessMe
  test. 37708 performs an ActionInput through 38949. CONFIRMED-STATIC.
- 38949 ActorMediator::PerformAction (plate comment from 2026-10-14) needs a
  graph manager; validators 39002 (no kProcessMe read), 37147, 39003, 32802;
  perform: 14999, 32803, 43567 (NotifyAnimationGraph), 39004. Only 38949 and
  39002 were checked for kProcessMe here. CONFIRMED-STATIC for those two.
  HYPOTHESIS: on an AI-off actor the action is accepted but nothing plays
  until the graph is updated again.

### Dialogue and barks

- 37752 (dialogue voice timer, actor+0x110) runs only inside 37347: with AI
  off a line in progress does not time out (HYPOTHESIS: a puppet stuck
  "speaking" until AI returns).
- 39333 (HYPOTHESIS: AIProcess say-topic by subtype) has about 35 callers,
  among them package processing 39637 (gated), Actor::Update's drowning path
  through 39337 (gated), and ungated ones: TESObjectREFR activation 19796,
  19797, 37493, 37369, 37409, 37418, 44125 (beside the projectile code) and
  others. HYPOTHESIS:
  idle chatter and package dialogue stop with AI off; event barks raised by
  ungated callers (activation, possibly hit or combat code) can still fire.
  Not traced to the settings fIdleChatterCommentTimer and
  fIdleChatterCommentTimerMax (strings at 0x1417f1b18/0x1417f1b38, no code
  xrefs in Ghidra's analysis).

## Each switch

| switch | packages | combat decisions | combat target select | detection | dialogue/chatter | graph update | relayed SetPosition | havok/collision | hit reactions |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| EnableAI(false), 37504 | stop (37347 gated) | stop (33216) | runs (33236) if in a group | requests stop (37347, 41408); queue not gated | package/idle stop; event barks HYPOTHESIS | STOPS (41466) | works (37309, 37995 per frame) | movement job runs; char controller kept | taken (38586); reactions sent, play only if graph ticks |
| SetDontMove(true), 37489 | run | run | run | run | run | runs | works | Move (37507) refuses lifeState 9 | taken |
| SetRestrained(true), 37488 | run | stop (38565 branch, lifeState 6) | runs | run | run | runs | works | StopMoving once | stagger refused (37710) |
| process level below high | cadence only | per level | per group | per level | per level | stops (high only) | works | movement job stops (high only) | not traced |
| do-nothing package, 37402 | override (kDoNothing 27, TESPackage.h:64, via vtable 0xDF PutCreatedPackage) until re-evaluated | run | run | run | run | runs | works | runs | taken |
| runSchedules false (global, 41327) | stop for all actors | run (kProcessMe still set) | run | 41408 still counts | HYPOTHESIS | runs | works | runs | taken |
| skip 37356 (TE's remote hook) | run | run | run | run | run | runs | works, and nothing overwrites it | char controller not moved by the engine | taken |

SetDontMove and SetRestrained (Papyrus natives 54761 and 54760 in registration
54784) set the life state through Actor::SetLifeState 37612 (Actor.cpp:1031)
to 9 (no CommonLib name) or 6 (kRestrained, ActorState.h:15), call
Actor::StopMoving(1.0) 37817 (Actor.cpp:1091), and the native then calls
37818 (movement controller stop, HYPOTHESIS). Clearing restores lifeState 0
only if it still holds 9 or 6, so they fight death and bleedout for the same
field. They leave kProcessMe alone: the brain keeps running.

## Q2: the smallest set for "puppet, not brain"

1. EnableAI(false). Either the Papyrus native from the SP client or CommonLib
   Actor::EnableAI(false) (Actor.cpp:230, the same body as 37504: clear the
   bit, zero the char controller velocity). This is the one bit every AI loop
   reads.
2. Re-admit flagged puppets to the animation stage. Two candidates tie on
   evidence; the first is narrower:
   a. Detour 41370: call the original, then for each flagged puppet in
      highActorHandles queue the engine's own job 41453 on the same job list
      (the engine's push is 69349, `FUN(jobList, job, handle, 0)`), so the
      graph updates in the engine's own stage and thread model.
   b. Detour 41466: call the original, then append flagged puppets that failed
      only the kProcessMe term to list A (engine push 41496).
   Rejected: a vtable slot 0xAE hook (UpdateNoAI runs twice a frame, see
   41447) and a byte patch of 41466+0x85 (changes vanilla EnableAI(false)
   everywhere).
3. Skip 37356 for puppets (detour, early return when flagged). The rest of
   37350 still runs (0xAF, 0xB0, 41717), so the char controller stays
   simulated at the relayed SetPosition. Reason: once the graph ticks,
   37356 would move the puppet by root motion and controller agents and
   rewrite the process speed and direction from its own displacement,
   fighting the relayed transform and relayed locomotion variables.
   HYPOTHESIS that this is needed; probe P4 decides.
4. Keep puppets out of combat: ProcessLists::StopCombatAndAlarmOnActor
   (41340, ProcessLists.cpp:108) at demotion and from a TESCombatEvent sink
   (CommonLib TESCombatEvent.h; ADR-034 prefers the event) when a puppet
   enters combat, because hits (38586) and StartCombat (54768) are not gated
   and 38565 keeps selecting targets.
What stays engine-native and needs no hook: hits (38586), stagger and recoil
(37710, 37708), PerformAction (38949), SetPosition (37309), the root node sync
(37995), collision (the char controller exists; 37350's 0xAF/0xB0).

Why not the other shape (Skyrim Together's: AI on, outputs hooked): with
kProcessMe set, 33216 lets the combat behavior run, 41408 counts the puppet's
detection, 37347 runs packages and dialogue; each needs its own hook (TE: 37356,
42704, SetPosition writes, CheckForNewPackage experiments), and every missed
one is a leak. One bit plus two hooks is the lazier and more uniform cut.

Locomotion consequence for thuum's figures: skymp's client moves figures with
KeepOffsetFromActor plus translateTo (skymp/skymp5-client/src/sync/movementApply.ts,
applyMovement and keepOffsetFromActor) and sprint, block and sneak through
animation events. KeepOffsetFromActor (native 54709 -> 37894) hands the offset
to the movement controller through 41734 and the IMovementSetKeepOffsetFromActor
interface; whether its agent runs in slot 7 (ungated) or slot 8 (gated) is not
resolved. With 37356 skipped it would not move the puppet at all. So an AI-off
puppet's walk must come from relayed graph variables on a ticking graph, the
shape cast-action already uses for actions.

## Q3: moving an AI-off actor

- Actor::SetPosition, vtable 0xA9 (37309, Actor.h:367): 19790 writes the data
  position (and the cell's sorted list, AddChange 2); with
  updateCharController: char controller position (38393) and velocity zeroed;
  root node translate written. No graph, no speed feedback. A teleport.
  CONFIRMED-STATIC.
- TranslateTo (Papyrus native 56237, registered by 56246): requires parent
  cell and 3D; ExtraRefrPath (0xA1, ExtraDataTypes.h:335) filled by 12808;
  reference registered with its cell's moving references (19417). No AI,
  movement controller or graph. A slide. The per-frame mover was not traced.
  CONFIRMED-STATIC for the native; mover HYPOTHESIS.
- Engine locomotion is 37356's Move (37507) of the controller's output; its
  speed feedback (0x11D, 0x11E 37994 -> 39873/39878) covers only its own
  displacement. So no external position write produces a walk cycle, AI or
  not. Whether the graph's Speed/Direction variables read those AIProcess
  fields is HYPOTHESIS.
- MovementControllerNPC (vtable data id 208285; CommonLib MovementControllerNPC.h
  names no slots): slot 7 (91877) per-frame output from 37356, ungated; slot 8
  (91878) planner from 37347, gated; message pump 41717 from 37350, ungated.
  With AI off the planner freezes while output and messages continue; EnableAI
  zeroes the char controller velocity once, presumably to stop a stale command
  from sliding the actor (HYPOTHESIS; probe P4).

## Q4: handoff

Puppet to live (the host takes the cell):
1. Actor::SetPosition(last relayed, true) (37309) and the heading.
2. Clear the puppet flag (hooks 2 and 3 stop applying).
3. EnableAI(true) (37504).
4. Package: Papyrus EvaluatePackage is thunk 54672 = 37401(false, false):
   sets kEvpBuffered and pulls the process's next update back, so it runs on
   the first 37347 now that kProcessMe is set. CommonLib
   Actor::EvaluatePackage(true, false) (Actor.cpp:249) runs CheckForNewPackage
   39114 at once (sit states 0, 3, 7 only). (true, true) is a reset: it calls
   vtable 0xE5 StopCombat and EndInterruptPackage 37474 first, so restore
   combat after it. A buffered EvaluatePackage issued while the actor was a
   puppet is still pending and fires on the first AI tick.
5. Combat: Papyrus StartCombat (54768) with the server's target; the AI's
   detection rebuilds through its own requests.
Live to puppet: StopCombatAndAlarmOnActor(actor, false) (41340), StopMoving
(37817), ClearKeepOffsetFromActor if the figure path used it, EnableAI(false),
set the puppet flag. Keep the actor in high process (only high actors are
moved and animated).

## Q5: probes (driver steps through labCommand/SpSnippet, Frida through `just frida`)

Frida targets are module base plus `just addr` offset; rcx is the Actor*;
filter on its formID at +0x14 (TESForm.h:354). Count calls per second.

- P1 gates. Place an NPC near c1's player, 5 s AI on, `EnableAI(false)`, 5 s,
  `EnableAI(true)`, 5 s. Hook 41369, 37347, 37348, 37349, 41453, 37350, 37356,
  38565, 33236, 33217, 41408 (owner arg), 37774 (owner arg). Expect AI-off:
  37347, 37348, 41453 at 0; 37349 twice per frame; 37350 and 37356 per frame;
  33217 entered but 33216 false if in combat. Falsified by any 41453 call for
  the AI-off actor.
- P2 freeze. NPC plays an idle (Debug.SendAnimationEvent "IdleWave"),
  EnableAI(false) mid-idle, screenshots at +0.5 s and +2 s, then send
  "IdleWave" again while off, then EnableAI(true). Expect a frozen pose and no
  visible reaction until AI returns; actor.getAnimationVariableBool on a
  changing variable stays put. Falsified by the idle finishing while off.
- P3 brain and body. AI-off NPC: read GetCurrentPackage, IsInCombat,
  GetCombatTarget; c2 hits it (and once with a power attack): health drops,
  37710/37708 entered (Frida), IsInCombat may turn true, it never swings
  back (33217's 33216 false). Sneak past it on c1: the stealth meter does not
  count it (41408 skips it). Expect the line it was speaking to hang.
- P4 movement. EnableAI(false) while the NPC walks a package path: log its
  position 3 s (drift means slot 7 keeps a stale command). Then relayed
  SetPosition steps (teleports, no walk), TranslateTo (slide, no walk), and
  KeepOffsetFromActor (moves or not decides slot 7 vs 8). With a prototype
  37356 skip and hook 2a, set Speed via SetAnimationVariableFloat and read it
  back next frame.
- P5 handoff. From AI-off: SetPosition, EnableAI(true), EvaluatePackage(); log
  GetCurrentPackage per 100 ms (changes within one AI tick), then StartCombat
  on c1's player; expect the attack within seconds. Reverse with
  StopCombatAndAlarmOnActor and EnableAI(false): IsInCombat false and no
  38565 calls after.

## Ghidra changes (saved)

Renamed, each with a plate comment naming the source and HYPOTHESIS where
inferred: Actor_EnableAI_37504, Actor_EvaluatePackage_37401,
ProcessLists_RequestHighestDetectionLevelAgainstActor_41408,
Actor_Update_vAD_37348, Actor_UpdateActor3DPosition_v11F_37995,
Actor_UpdateAnimation_v7D_37361, Actor_SetPosition_vA9_37309,
Actor_Move_vC8_37507, Actor_UpdateCombat_vE4_38565, Actor_SetDontMove_37489,
Actor_SetRestrained_37488, Papyrus_ObjectReference_TranslateTo_56237,
Actor_KeepOffsetFromActor_37894, Papyrus_Actor_StartCombat_54768,
Actor_UpdateFeedbackGraphSpeedAndDirection_v11E_37994;
HYPOTHESIS names: ProcessLists_HighActorAIJob_41369,
ProcessLists_QueueHighActorAI_41367, Actor_UpdateAI_37347,
ProcessLists_PartitionAnimatedActors_41466,
ProcessLists_QueueActorAnimation_41370, ProcessLists_ActorAnimationJob_41453,
ProcessLists_QueueActorMovement_41306, Actor_UpdateMovement_37350,
Actor_MovementStep_37356, CombatController_CanUpdate_33216,
CombatManager_QueueMemberCombatUpdates_46872, DetectionQueue_Process_42742,
Actor_CalculateDetection_37774, Actor_ProcessHitVictim_38586,
Console_ToggleAI_22855, ProcessLists_UpdateLowActorAI_41302,
ProcessLists_UpdateMiddleLowActorAI_41304,
ProcessLists_UpdateMiddleHighActorAI_41305,
ProcessLists_QueueHighActorNoAI_41374.

Not functions in Ghidra (left alone): 37349 (UpdateNoAI thunk), 54919
(EnableAI native thunk), 54672 (EvaluatePackage native thunk).

## Open

- The per-frame mover for ExtraRefrPath (TranslateTo) and whether it calls
  vtable 0xA9.
- Which movement controller slot runs the keep-offset agent.
- How the graph's Speed and Direction variables are fed (AIProcess fields
  39873/39878 or ModifyAnimationUpdateData 0x79).
- Where a hit creates a combat controller on an AI-off victim (38586 tail,
  33224, 38626).
- The settings readers for idle chatter, and which of 39333's ungated
  callers fire for an NPC speaker.
- Whether stage 39068 ("Ragdoll post physics") runs every frame (the table
  says it is a regular stage; frequency not measured).
