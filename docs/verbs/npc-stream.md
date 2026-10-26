# Verb: npc-stream

Drafted 2026-10-22 (M3's third verb, docs/PLAN.md, the M3 section) from
ADR-035 point 5 (docs/DECISIONS.md:1293-1301) and ADR-045 as revised
2026-10-22 (:2297-2355), the rows cell-host carried here by name (its H6 and
H7, the HostedActorState epoch; docs/verbs/cell-host.md:165-170, :185-188,
:206-215), npc-puppet's roster and its "later: npc-stream" rows
(docs/verbs/npc-puppet.md:102, :108, :556), the prior-art read
(docs/research/m3/tes3mp.md Q2, te-npcs.md section 2, skymp-hosting.md 1.4
and 2.4) and a code read of fork m3-npc-puppet at 757066f3, re-read 2026-10-22 at
19e7ca9b (the worktree lab/.cache/wt/puppet's head at review; every fork
path below is at that head unless another is named), before any code. The cut (rule 3): what the game hosting a cell
reports about each of the cell's NPCs beyond its position, how often, on
which channel, what the server checks and keeps, and what the other games'
puppets do with it. Not here: the saved state replayed before a grant
(npc-handoff, point 7); hits by and on NPCs, deaths that persist,
inventories and spawns (npc-fate, point 6).

## Intent

The game that hosts a cell reports each of its NPCs the way it reports its
own player, through the one stream per actor (a movement sample, the graph
events, the engine's actions, what the actor wears), plus the things a
player never says about itself (the host's reading of the actor's values,
its combat target and its running package, fenced by the cell's epoch); the
server validates where a check is cheap, records the rest as the host's
word, and every other game's puppet shows it within the relay's lag and
reports nothing.

Roadmap reference: skymp/ROADMAP.md "NPC" (combat, activation and equipment
for NPCs; render NPC templates from the server), skymp-hosting.md:440-444.
Milestone: M3   Class: B

## Inventory (ADR-031: the action's consequences, before its rung)

The action is "a hosted NPC lives for a minute in front of two games: it
walks and works, it draws and fights, its values move, it changes what it
holds, it picks a target". The engine alone, from the references
(r-npc-packages 20261019-021451, r-npc-fight 20261019-021823,
readings-2026-10-18.md; x-npc-puppet-2 20261022-042521, npc-puppet.md's
Dynamic plan), the records (riverwood-ids.md) and the code read:

| consequence | seen in | disposition |
| --- | --- | --- |
| the walk: the transform sampled every 130 ms (sendInputsService.ts:139-161; the sample movementGet.ts:34-95: world or cell, position, heading, run mode, direction from the graph's Direction, speed from SpeedSampled, jump, sneak, block, drawn, dead, health percentage, the look point) | code, trace | native on the host; R1 under the bounds cell-host left (same cell or under 4096 units a report, the cell-change rule; no speed budget for NPCs, docs/verbs/movement-speed.md:29-30), the actor's cell itself R2 as cell-host records it; the message, cadence and channel unchanged here (UpdateMovement 2, Unreliable); a standing actor's unchanged sample still goes 7.7 times a second (no change test at sendInputsService.ts:149), which the cost row carries |
| the state flags in the sample (ActorState.h:97-134 behind Papyrus and the graph: sneaking, sprinting, blocking, the weapon state, dead) | code | native on the host; imposed on a puppet as today (movementApply.ts:67-73); the server records four of them unvalidated, R2 (ActionListener.cpp:322-330: bInJumpState, _skymp_isWeapDrawn, IsBlocking, IsSneaking) |
| the graph events (IdleHoe, IdleBlacksmithForgeEnter, attackStart, staggerStart; 32 to 134 events per walking resident over 90 s, readings-18:21-28) | trace, code | native on the host, imposed on a puppet (R2): reported by the host's AnimationSource per hosted actor (animation.ts:242-347) as UpdateAnimation 3, Unreliable, its hook filtered in native to the actor's own id and removed at the release (Observe; today unfiltered and never removed, :245-261, skymp-hosting.md:316-320); the server relays and now keeps the last event per hosted actor too (today the player's own alone, ActionListener.cpp:364-370), so a late joiner's CreateActor carries it (PartOne.cpp:976); a puppet replays each once (H7, HYPOTHESIS) |
| the engine's BGSActions (the attack, the power attack, the draw and sheathe: r-npc-fight's three IsAttacking windows and 22 moveStarts on one bandit, readings-18:67-71) | trace | native on the host, imposed on a puppet (R2): UpdateAction 44 extended from the player to the actors this game hosts (ADR-035 point 5: "actions ride cast-action's action replay (ADR-032), extended from players' figures to NPCs"; cast-action.md:229 left them "a later slice"): the native PerformAction hook's filter widened from the player to a hosted set (FridaHooks.cpp:455-470 reads `data->source.get() == player` at :460); a puppet performs them through performAction with the variables first, as a figure does (formView.ts:613, the method :824; H2, HYPOTHESIS: an AI-off puppet's graph takes the action entry); the event an action carries is not re-sent as an animation event (H1, HYPOTHESIS) |
| health, magicka and stamina as the host's engine moves them (regeneration; a bandit's hit on a bandit; a fall; a script) | trace (r-npc-fight's bandit took none; the engine alone's NPC values are not in a trace yet), code | native on the host, imposed on a puppet from the server's record: R2 for the numbers, recorded from HostedActorState (new, MsgType 51) under R1 bounds (finite, 0 to 1 inclusive, and the attributes hold, wire-rules attributes.rs, the players' rule: a host's report cannot undo a value the server lowered itself); at most twice a second per actor; the server tells the other games as ChangeValues 16, the path a figure's values take (remoteServer.ts:882-904); a report of 0 does not kill: a death is the server's (R0, npc-fate), the record floors at one point and the floor logs (Server) |
| the combat target and the combat state (a hit drafts the actor, combatTarget the player, inCombat true: readings-18:100-102; TESCombatEvent) | trace | native on the host; recorded in memory (R2) from HostedActorState (the target's identity; the look point stays in the movement sample, movementGet.ts:46-56, where the puppet's head tracking reads it, movementApply.ts:37-56); never imposed on a puppet (npc-puppet's H6, HYPOTHESIS there: a puppet is never in combat); restored at a promote: later, npc-handoff |
| the running package and its changes (the schedule switch at 8:00, Hod back to the mill, readings-17:39-43; packageStart, packageChange, packageEnd) | trace (the Papyrus getter read 0x3EAB9 at every read, AI on or off and mid-recoil, readings-17:67, readings-18:77-82 and :116-118), code | native on the host; recorded in memory (R2) from HostedActorState, an observation only: nothing imposes a package on a puppet (Skyrim Together's package sync, written, crashed and compiled out, te-npcs.md section 3); the proposed source is Skyrim Platform's package events, not the getter (ADR-034; H3, HYPOTHESIS); what the getter's one id means is the open question stated under Engine surface, the package |
| what the actor wears and holds (the server's EquipBestWeapon on a hosted caster, MpActor.cpp:193, skymp-hosting.md:130; the engine's own equips under its packages; ActorEquipManager) | code | native on the host, imposed on a puppet (R1): UpdateEquipment 5 under the actor's own idx on the host's equip and unequip events for a hosted actor (today the player's alone, sendInputsService.ts:55-103, :287-290; H4, HYPOTHESIS: that TESEquipEvent fires for an NPC's AI-driven equip as it does for the player's menu equip), validated against that actor's own inventory and base spells, recorded on that actor (today the handler writes the sender's record whatever the idx, ActionListener.cpp:873-876 and :1024-1025: the latent corruption skymp-hosting.md:131 names), relayed reliably; a puppet applies it as every view does (formView.ts:655-675); the client's -1 inventory count that the wire's u32 refuses (docs/LOG.md:2245, 2026-10-22 03:19, c2's 1,835 refused UpdateEquipment sends) is this row's prerequisite |
| the actor's inventory changing on the host (a pickup, loot taken, an arrow spent) | ADR-035 point 6; PLAN.md:1045-1047 | later: npc-fate, on ADR-035 point 6 (docs/DECISIONS.md:1302-1305: inventories are R0, the server's); open question for Eli: docs/PLAN.md:1045-1047 has inventory changes streaming from the host as R2 with cheap bounds, the ADR has them R0, and the two have not been reconciled; this doc follows the ADR and carries no inventory_delta either way (the M0 row's field, Message contract) until he says which |
| the actor's death on the host (NPC against NPC, a fall, a trap) | ADR-035 point 6 | later: npc-fate (deaths that persist, R0); until then a puppet shows the relayed isDead as today (movementApply.ts:73, deathService), a corpse the server's record calls alive: carried by name, with H9's count |
| hits by the hosted actor on anyone and the players' hits on it (hitService.ts:17-41; melee-reach.md:27-28) | code | later: npc-fate; the hit gates stand (ActionListener.cpp:2898) |
| casts and shouts by the hosted actor (magicSyncService.ts:62-64; the hosted caster gate, ActionListener.cpp:3246-3247) | code | native on the host; relayed as today (SpellCast 23 under the hosted caster gate; the effects the server's, docs/verbs/spell-cast.md); the hands' graph work rides the actions row |
| the voice line (package dialogue, idle chatter, barks), carried here by name from npc-puppet.md:102 (TES3MP relays it as ActorSpeech, tes3mp.md:81) | code (npc-puppet.md:102) | later: not in this cut (ADR-035 point 5 names no voice row); which slice takes it is an open question for Eli (Status) |
| the host's own reports echoed back to it | code | suppressed since cell-host (RelayToListeners skips the host, ActionListener.cpp:105-129); HostedActorState has no relay at all (client to server only) |
| a report that outlives its grant (the old host's last samples after a handoff; the same game granted the cell again at a later epoch, its earlier tenure's samples reordered on the unreliable channel) | tes3mp.md:194-196 (the late-grant desync), te-npcs.md:70-71 | suppressed: the host table drops a non-host's report (ActorUpdatableBy, ActionListener.cpp:87-99) and the epoch on HostedActorState drops a stale state (wire-rules cells::accepts); movement, animation and actions carry no epoch (Authority says why) |
| the stream's cost: 7.7 samples a second per hosted actor, every graph event, every action, and one game-thread round trip into JavaScript per sendAnimationEvent anywhere in the game (Hook.cpp:73-87 pushes and waits for every event whatever the handlers' filters; only sendPapyrusEvent pre-matches, :52-71) | code | imposed with measured numbers (P3, ADR-033 point 5): the per-actor native filter, a native pre-match for the animation hook (H8, HYPOTHESIS that it removes the game thread's wait), the budgets per host sized to the hosted count; the receiving side has its own cost, found 2026-10-22: the puppet apply makes three Papyrus-backed calls per sample per puppet (blockActivation, setHeadTracking, and setLookAt or the tracking off; movementApply.ts:45-61), about 180 a second for Riverwood's 23 residents, each a game-thread call through Skyrim Platform's queue beside the transform and the native locomotion feed, so a once-per-change shape (the block once, head tracking on change) is this verb's row |

The parity scenario is p-npc-stream (Tests): the host's view and the
puppet's view of Riverwood's residents against a reference of the engine
alone recorded for it (npc-packages-a.json, r-npc-packages' shape); its
`later:` list is the three npc-fate rows and the voice row above and
nothing else.

### Sequences and combinations (ADR-033)

| sequence or combination | probe or scenario | result |
| --- | --- | --- |
| a value moving at a person's rhythm (the shout's two hits inside a second; a fight's blows 300 to 900 ms apart): the 500 ms floor coalesces them, the last report wins, the observer ends within one report of the host | b-npc-stream (Sven's hits) | |
| each way a value moves: a player's hit (the server's R0 number, told to the host, reported back), an NPC's hit on an NPC (the host's number), regeneration (the host's), a script's SetActorValue on the host (the host's) | x-npc-stream-values | |
| interrupted: the host leaves mid-fight (the handoff: the old host's late states dropped at the old epoch, the new host's first state at the new one) | b-npc-stream's handoff | |
| both seats: c1 hosts 0x9732 and c2 hosts (6,-11) 0x9711, each streaming its own residents and puppeting the other's | b-npc-stream | |
| after a login (a late joiner's CreateActor carries the last event and the equipment; its first sample the values) and after a cell change (Embry through the inn door: the idx stays, the cell-change rule admits the sample) | b-npc-stream (c1's reconnect); x-npc-stream-door | |
| a server restart (values and equipment persisted with the record; the combat target and the package forgotten by design) | b-npc-stream | |
| the local player hits a puppet (its game reports nothing; the server's number lands on the host's game as ChangeValues, the host's engine applies it, the host reports the same value back: idempotent, no loop under the hold; H5, HYPOTHESIS) | x-npc-stream-values | |

## Authority

Rung: R1 for the transform (cell-host's bounds, unchanged), the equipment
(validated against the actor's own record) and the values' bounds; R2 for
the sample's state flags, the graph events, the actions, the recorded
values, the combat target and the running package, and the actor's cell as
cell-host records it; R0 for the epoch (the server's number), and for the
death and the inventory, which npc-fate takes (the inventory's rung is the
Inventory row's open question); R3, declared: the puppet's
resolution of the look point to the nearest actor within 128 units
(movementApply.ts:37-56), its translateTo smoothing, the host's own HUD and
combat music.
- Why not R1 for events and actions: judging whether a graph event or a
  BGSAction is legitimate needs the behavior graph; that is a
  reimplementation of what the host's engine runs (the law). TES3MP and
  Skyrim Together both relay them on the authority's word alone
  (tes3mp.md:81; te-npcs.md:86-89, :107-109).
- Why not R0 for the values: the server would have to run the actor's
  regeneration and its fights with other NPCs, which the host's engine runs
  for us; ADR-035 point 5 asks R2 bounded where cheap, and every number
  that touches a player is R0 in npc-fate. The bound chosen is the players'
  own attributes rule (docs/verbs/attributes.md; wire-rules attributes.rs
  percentages_hold, used at MpActor.cpp:898-915): a report below a value
  the server raised is dropped until one reaches it, and a report above a
  value the server lowered is held the same way, so the host's word cannot
  undo the server's number.
- Why no epoch on movement, animation and actions: the stateless validator
  cannot check an epoch against a table (cell-host.md:209-212: "epoch above
  0" is all it could do), the core already drops every report whose sender
  is not host_of(cell_of(actor)) (ActorUpdatableBy), Skyrim Together carries
  none on movement (te-npcs.md:69) and TES3MP none anywhere
  (tes3mp.md:299-308). The epoch rides the state message, where
  npc-handoff's keyframe needs it (ADR-035 point 7: the new host's full
  state after the grant) and where the same-host-regranted case bites.
- What the server validates (R1) or records (R2): as the Inventory says,
  row by row; the records in memory (target, package, the last event) and
  in the change form (values, equipment: MpChangeForms.h:102, :106).
- Rate limit / bounds: a host's budgets are per connection and must fit its
  hosted count (Riverwood's fourteen residents plus the wildlife): the
  action budget (12 then 6 a second, wire-validate lib.rs:158) and the equip
  budget (16 then 8, :157) are sized for one player; the state message gets
  hosted_state_budget; the animation stream has no rate rule today
  (lib.rs:915, "bounded by the transport's byte budget") and gets none
  until P3 measures a host's event rate. Every number is MEASURED on P3 and
  carried with it (ADR-033 point 5; cell-host's CellLoaded budget is the
  precedent); the first stage runs UNMEASURED placeholders at four times
  the rate the references suggest, named so in the code.

## Engine surface

Nothing new is hooked in the engine: every moment comes from an SKSE event
Skyrim Platform already sinks or from a hook cast-action already owns
(ADR-034). The headers are cited so each row's source is explicit.

- The combat target: RE::Actor's runtime data holds currentCombatTarget
  (CommonLibSSE-NG include/RE/A/Actor.h:653, an ActorHandle) and
  combatController (:669); IsInCombat (:425, the header's vtable comment
  0E3), GetCombatGroup
  (:410), IsHostileToActor (:593). RE::CombatController's targetHandle and
  attackerHandle (include/RE/C/CombatController.h:36-37), startedCombat
  (:40), inactive (:47), cachedTarget (:64); RE::CombatGroup's targets and
  members (include/RE/C/CombatGroup.h:75-76), a CombatTarget's targetHandle
  and detectLevel (:26-27). The moment: RE::TESCombatEvent { actor,
  targetActor, newState kNone, kCombat, kSearching }
  (include/RE/T/TESCombatEvent.h:9-24), sunk by Skyrim Platform
  (skyrim_platform/EventHandler.h:34) as combatState with target, actor,
  isCombat, isSearching (skyrimPlatform.ts:651, :197-202). The reading:
  Actor.getCombatTarget (:2058) and getCombatState (:2057), Papyrus
  natives; HYPOTHESIS that getCombatTarget answers currentCombatTarget and
  not the controller's targetHandle (the two can differ while a target is
  being chosen).
- The values: RE::ActorValueOwner (include/RE/A/ActorValueOwner.h:12-22:
  GetActorValue :15, GetPermanentActorValue :16, GetBaseActorValue :17,
  SetBaseActorValue :18, ModActorValue :19, RestoreActorValue :20,
  SetActorValue :21), one of Actor's bases (Actor.h:123-131, the SE column;
  the pin's AE layout reaches Actor's runtime fields through
  GetActorRuntimeData, :644-715); RE::ActorValue kHealth 24, kMagicka 25,
  kStamina 26 (include/RE/A/ActorValues.h:32-34). The reading:
  Actor.getActorValuePercentage (skyrimPlatform.ts:2054), as the player's
  sample reads it (sync/actorvalues.ts:9-23); the puppet's write:
  restoreActorValue and damageActorValue by the percentage delta
  (setActorValuePercentage, :32-46; skyrimPlatform.ts:2160, :2028).
- The graph events: RE::BSAnimationGraphEvent { tag, holder, payload }
  (include/RE/B/BSAnimationGraphEvent.h:9-16); the graph is their source
  (RE::BShkbAnimationGraph : BSTEventSource<BSAnimationGraphEvent>,
  include/RE/B/BShkbAnimationGraph.h:28-32) and the manager sinks them
  (include/RE/B/BSAnimationGraphManager.h:67-68, ProcessEvent :93-94,
  graphs :121, activeGraph :101); the holder's entry is
  IAnimationGraphManagerHolder::NotifyAnimationGraph
  (include/RE/I/IAnimationGraphManagerHolder.h:25), the variables its
  getters and setters (:45-53), the holder at TESObjectREFR +0x38
  (include/RE/T/TESObjectREFR.h:112). Skyrim Platform's hook sits on the
  engine's send (FridaHooks.cpp:336-383: Offsets::Hooks::SendAnimation,
  the holder in rcx, the reference at rcx minus 0x38, the event name the
  second argument, replaceable on entry); its handler filter
  (Handler.cpp:20-40: minSelfId, maxSelfId, a pattern exact, starts-with or
  ends-with) runs on the JavaScript thread after Hook::Enter has pushed
  and waited (Hook.cpp:73-87), which the cost row names.
- The actions: RE::TESActionData (include/RE/T/TESActionData.h:7-45) over
  RE::BGSActionData, an ActionInput plus an ActionOutput
  (include/RE/B/BGSActionData.h:8-26); the master behavior variables the
  figure path carries by name (include/RE/F/FixedStrings.h: Speed :179,
  Direction :181, SpeedSampled :182, TurnDelta :180, bIsSynced :193,
  bSpeedSynced :194, bAnimationDriven :191, bAllowRotation :192, isBlocking
  :105). The hook is cast-action's PerformAction hook (ActorMediator::
  PerformAction 38949, resolved there and in docs/TE-MAP.md:38 and
  docs/LOG.md:1312-1314; FridaHooks.cpp:385-470), raised as
  actionPerformed with the player's actor (:499-500); SKSE's ActionEvent
  (EventHandler.h:73) stays too narrow for it (docs/TE-MAP.md:38).
- The equipment: RE::ActorEquipManager (include/RE/A/ActorEquipManager.h:
  GetSingleton :17, EquipObject :19, EquipShout :20, EquipSpell :21,
  UnequipObject :22); the moment RE::TESEquipEvent { actor, baseObject,
  originalRefr, uniqueID, equipped } (include/RE/T/TESEquipEvent.h:9-20),
  sunk (EventHandler.h:39) as equip and unequip with actor, baseObj,
  uniqueId, originalRefr (skyrimPlatform.ts:669-673, :229-234); the
  reading Actor::GetEquippedObject and GetEquippedEntryData (Actor.h:540-542)
  behind getEquippedObject (:2065), getEquippedWeapon (:2069),
  getEquippedSpell (:2068), getEquippedShout (:2067), getWornForm (:2093),
  which the client's getEquipment already walks (sync/equipment.ts:97-106).
  HYPOTHESIS (H4) that TESEquipEvent fires for an NPC's AI-driven equip on
  the host (EquipBestWeapon at a fight's start) as it does for the player's
  menu equip.
- The package: Actor::GetCurrentPackage (Actor.h:536-537);
  RE::AIProcess::GetRunningPackage (include/RE/A/AIProcess.h:172),
  currentPackage (:198, an RE::ActorPackage: package :22, target :24,
  currentProcedureIndex :25, packageStartTime :26, include/RE/A/
  ActorPackage.h), processLevel (:225; PROCESS_TYPE :23-29); RE::TESPackage's
  PACKAGE_DATA packType (include/RE/T/TESPackage.h:102-150, :149) and
  procedureType (:314; PACKAGE_PROCEDURE_TYPE :34-75). The pin only
  forward-declares TESPackageEvent (include/RE/S/SkyrimVM.h:61,
  ScriptEventSourceHolder.h:37), so its fields are cited from Skyrim
  Platform's sink: actor, package and a type kStart, kChange, kEnd
  (EventHandler.cpp:1052-1095), published as packageStart, packageChange,
  packageEnd with actor and package (skyrimPlatform.ts:785-792, :406-409).
  HYPOTHESIS (H3) that they fire for a hosted NPC's schedule switch; the
  readings show only that the getter does not move. Open question for Eli,
  the getter's one id: Actor.getCurrentPackage read 0x3EAB9 at every read,
  AI on or off, puppet or live, mid-recoil in combat (readings-17:67,
  readings-18:77-82, :116-118), while the traces show Hod's schedule switch
  at 8:00 (readings-17:39-43). Either the getter answers something other
  than the procedure the actor runs or the running package never changed in
  those windows; this doc does not decide it, it proposes the events as the
  source (H3) and keeps the field only if P3 sees them move (Status, open
  question 4; a field no event fills is dropped before merge, rule 4).
- The sample's state: RE::ActorState's two words (include/RE/A/
  ActorState.h:203-204): ActorState1's movingBack to swimming (:101-110),
  sitSleepState (:112), flyState (:113), lifeState (:114), knockState
  (:115), meleeAttackState (:116); ActorState2's weaponState (:129),
  wantBlocking (:130), staggered (:134); the getters IsSneaking,
  IsSprinting, IsSwimming, IsWalking, IsWeaponDrawn (:184-192). Read today
  through Papyrus and the graph (movementGet.ts:86-98, :100-134), unchanged.
- The process data an NPC-only stream could read later and does not: the
  high process's currentShout and voiceRecoveryTime
  (include/RE/H/HighProcessData.h:188-191), pathingCurrentMovementSpeed
  (:200), the head-track targets and offset (:217-223); the middle-high's
  rotationSpeed (include/RE/M/MiddleHighProcessData.h:139),
  animationVariableCache (:162), currentPackageSpell (:181), charController
  (:183), currentMovementSpeed (:197), bleedoutRate (:200);
  AIProcess::GetHeadtrackTarget and SetHeadtrackTarget (AIProcess.h:167,
  :187), which the puppet's setLookAt uses through Papyrus today.
- For the rows npc-fate takes: RE::TESDeathEvent { actorDying, actorKiller,
  dead } (include/RE/T/TESDeathEvent.h:9-15) and RE::TESHitEvent { target,
  cause, source, projectile, flags } (include/RE/T/TESHitEvent.h:9-30),
  sunk as deathStart, deathEnd and hit (EventHandler.h:36, :43;
  skyrimPlatform.ts:657-667).
- Address Library IDs: none new. The PerformAction hook's id is
  cast-action's; the puppet detours npc-puppet's (re-ai-puppet.md). No
  function of the engine is called that Skyrim Platform does not already
  wrap. Nothing here is written from memory.

## Observe (host or acting client sees the intent before the engine acts)

- Hook point, on the host, per actor the server's word names as this game's
  (HostService.isMine, hostService.ts:67-75): the movement sample as today
  (sendInputsService.ts:139-161); the AnimationSource's sendAnimationEvent
  hook added with minSelfId and maxSelfId both the actor's local id (the
  driver's shape, lab/driver/src/index.ts:945) and removed through
  hooks.sendAnimationEvent.remove (skyrimPlatform.ts:1596-1597) when the
  word flips away (H10, HYPOTHESIS: a handler removed mid-game stops its
  callbacks at once; no source has ever been removed in this client,
  skymp-hosting.md:316-320); the PerformAction hook's native filter widened to a
  hosted set (Hosted.h beside Puppets.h, the same mutex-guarded set, written
  by a setHosted(actorId, bool) export from HostService at the word's flip,
  read at FridaHooks.cpp:455-470 beside the player test); Skyrim Platform's
  equip and unequip events for an actor in the hosted set (today returned
  for any actor but the player, sendInputsService.ts:60-62); combatState and
  the package events for actors in the set; a 500 ms tick per hosted actor
  reading getActorValuePercentage of the three values, getCombatTarget and
  the last package event's package, sent as HostedActorState when any
  changed.
- SP filter (minSelfId / maxSelfId / eventPattern): per-actor ids on the
  animation hook (rule 9, met by the id pair since a game-file actor's id
  is one value); the hosted set in native on the action hook; nothing
  crosses into JavaScript for an actor this game does not host. H8: the
  pre-match Hook::Enter runs for sendPapyrusEvent (Hook.cpp:52-71) extended
  to sendAnimationEvent, so an event no handler matches never pushes to the
  JavaScript thread; measured by P3's Frida trace.
- Data captured: the sample (as today); the event name and its success;
  the action's form id, idle, event name, type and the actor's variables
  (cast-action's set, with the actor's id instead of the player's); the
  equipment (getEquipment, sync/equipment.ts:97-106); the three percentages,
  the target's local id (mapped to the remote id, worldViewMisc) and the
  package's form id.
- Side effects of hooking here: none expected beyond the cost row; the
  per-event push into JavaScript exists today for every actor in the game,
  so the per-actor filters only remove callbacks, and the pre-match (H8)
  removes the stall. HYPOTHESIS until P3.

## Impose (observers render the server's decision)

- Mechanism: nothing new for movement and events (npc-puppet's puppet
  branch: translateTo and setAngle, the graph variables Speed and
  Direction, Debug.sendAnimationEvent per relayed event, formView.ts:
  533-587). Actions: formView's replayActions (formView.ts:613, the method
  :824), which a figure takes today, runs for a puppet view too:
  applyAnimationVariablesToActor
  one update before performAction (cast-action's handshake, ADR-032), on
  the puppet's engine reference. Equipment: applyEquipment as every
  non-hosted view (formView.ts:655-675). Values: the server's ChangeValues
  for the actor's idx, which the client already applies to the actor's
  reference (remoteServer.ts:882-903); beside it the movement sample's
  healthPercentage keeps its 25% step per report (movementApply.ts:197-211),
  the two paths a player's figure has already (docs/verbs/figure-values.md,
  docs/WIRE.md:201-212). The combat target and the package are not imposed:
  the server records them for npc-handoff and the lab.
- Visual without simulation achieved by: the puppet's AI stays off
  (npc-puppet); the relayed actions and events are performed on its ticking
  graph; its bars follow the server's numbers.
- Side effects: HYPOTHESIS, three: H1 (the event an action carries is dropped by the
  AnimationSource and nothing else is lost: cast-action's hand rule,
  animation.ts:302-312, generalised to the action's event_name recorded at
  the hook's leave; a gap would leave a puppet mid-attack with no start, a
  double would play the attack twice, the finding npc-puppet's inventory
  calls "the relayed attack events play"); H2 (the replay entry
  PerformComplexAction 38953, docs/TE-MAP.md:38 and docs/LOG.md:1314, is
  taken by an AI-off puppet: Skyrim Together
  replays onto remotes whose AI runs, x-npc-puppet-2 showed the AI-off graph
  takes events and the stagger, the action entry is untested; falsified by
  performActionResult false on the puppet, P4); H5 (the values' echo
  converges: the server's ChangeValues to the host, the host's engine
  applying it, the host's next state report equal to it, taken as
  idempotent by the hold rule; an oscillation would show as a bar
  flickering on the puppet, x-npc-stream-values).

## Suppress (engine's own behavior blocked on non-hosts)

- What is suppressed: nothing new on a puppet (npc-puppet's AI bit, the
  movement step and the combat stop stand). On the host: the AnimationSource
  for an actor the word takes away is removed, so its events stop at the
  release; the hosted set drops the actor, so its actions stop; the player's
  ChangeValues are no longer sent under a hosted actor's id (today
  sendInputsService.ts:163-222 reads Game.getPlayer()'s values for every
  target and the server writes them to the sender's own actor anyway,
  ActionListener.cpp:2292-2309, ActorByUser and outMsg.idx the sender's
  own: a message that moved nothing, retired). On
  the server: a HostedActorState whose epoch is not the cell's current one
  is dropped and logged once a minute per actor (the roster's idiom,
  PartOne.cpp:1485-1505); a report of health 0 does not reach Kill
  (MpActor::SetPercentage's branch, MpActor.cpp:857-866, is not the path
  taken); a UpdateEquipment under an idx the sender may not update is
  dropped by ActorUpdatableBy instead of written to the sender's record.
- How: the word's flip in HostService (isMine) feeding setHosted, the hook
  removals and the set; the server's gate and the Rust rule.
- Release condition: HostRelease, or the connection's end: the source
  removed, the set cleared for the cell's actors; a HostGrant adds them
  again (the keyframe HostedActorState at the new epoch is this verb's
  first send after a grant; what precedes it is npc-handoff's).
- Side effects: HYPOTHESIS, two: H6 (cell-host's: the host's set of reported actors equals
  the server's set of actors whose cell the host holds; both derive from
  the word, so a gap is a model the view lacks, measured by b-npc-stream's
  set assertion), H7 (cell-host's: each relayed animation played once,
  measured by the event counts on both seats). Reversibility on handoff is
  the Release condition and b-npc-stream's handoff step.

## Message contract

- HostedActorState, new: MsgType 53, wire id 61 (the family's rule id =
  MsgType + 8, wire-schema lib.rs:509-510; the table's next row after
  ActorDeath 52, :510; 51 and 52 went to ActorFate and ActorDeath while this
  doc waited), client to server, Unreliable (ADR-035 point 5:
  per-tick state unreliable with the epoch; the sender marks it so and
  channels::for_send maps it, wire-transport channels.rs:46-52), cap 64
  bytes, SCHEMA_VERSION 17 to 18 (lib.rs:35). Fields, in the family's JSON form
  (`"t": 51`): idx u32 (the actor as the server indexes it), epoch u32 (the
  cell's grant the sender holds), health f32, magicka f32, stamina f32 (the
  host's percentages, 0 to 1), combatTarget u32 (the target's form id as
  the client knows it remotely, 0 for none), package u32 (the running
  package's form id, 0 for none). Sent at most once per 500 ms per hosted
  actor and only when a field changed since the last send; absolute
  values, so a lost one is replaced by the next and a duplicate is
  harmless (later sample wins, WIRE.md:192-194). Direction client to
  server only: the server's outputs are its own messages (ChangeValues 16
  for the values; nothing for the target and the package).
  Validator (wire-validate, the same commit, rule 4): check_hosted_state:
  every float finite (E_VAL_NONFINITE); epoch above 0 (E_VAL_RANGE, as
  check_host does, lib.rs:437-443); each percentage within 0 and 1
  inclusive (E_VAL_RANGE); idx below u32::MAX (ActorJump's idiom,
  :621-626); the budget hosted_state_budget per client (E_VAL_RATE),
  UNMEASURED at first then P3's numbers (the shape of
  cell_loaded_budget, :135, :159); a proptest hosted_state_never_panics
  (the hosted_never_panics shape, :1612). The core's rule, through
  wire-rules: the sender hosts cell_of(actor) at this epoch
  (cells::accepts(cell, player, epoch), cell-host.md:266), else dropped.
- Open question for Eli, the M0 row: wire id 5 is HostedActor, struct
  HostedActorState { actor, transform, health, inventory_delta } on
  ReliableUnordered with no JSON form and no sender (lib.rs:230-245,
  :288-289; channels.rs:38-40; WIRE.md:121, :135). ADR-035 point 5
  (docs/DECISIONS.md:1293-1301) and cell-host.md:206-215 (decided 2026-10-21
  07:15) said npc-stream gives that row its sender, the epoch and the
  Unreliable channel, with health, equipment and inventory riding it and
  full updates reliable; WIRE.md:55-57's family rule (thuum's messages
  continue SkyMP's numbering in the same JSON form, id = MsgType + 8) and
  cell-host's own precedent for rows 7 and 8 (ReservedHostGrant,
  ReservedHostRelease, cell-host.md:197-198) point the other way. The two
  are not reconciled. This doc is written for the family message above
  (MsgType 53, wire id 61), with row 5 renamed ReservedHostedActor and
  kept dead (ADR-012: ids append-only), the equipment on UpdateEquipment 5
  and the inventory npc-fate's; it also departs from the ADR's "full
  updates go reliable" by sending the keyframe after a grant on the same
  Unreliable channel (the sender could mark that one send reliable,
  WIRE.md:131-133, for_send). Eli's word decides the row, the fields and
  the keyframe's channel before the wire commit; whichever way, the M0
  struct's name HostedActorState (lib.rs:236) is taken and one of the two
  is renamed. Row 5's transform is the movement sample's, its
  inventory_delta npc-fate's.
- UpdateMovement 2 and UpdateAnimation 3: bytes, caps (256 each, lib.rs:
  451-452) and channel unchanged. The server's handling of 3 changes (the
  last event recorded for a hosted actor too): a server change, no wire
  change.
- UpdateAction 44: bytes unchanged (skymp.rs:993-1022; cap 32 KiB,
  lib.rs:493); its sender may now be a hosted actor's idx, which the gate
  already admits (ActionListener.cpp:384 through ActorUpdatableBy) and the
  validator already bounds (check_update_action, lib.rs:330-336); the
  action_budget's numbers are re-derived for a host (Authority).
- UpdateEquipment 5: bytes unchanged (skymp.rs:373-385; cap 256 KiB,
  lib.rs:454); the client sends it for hosted actors; the server resolves
  the actor by idx. Prerequisite in the same branch: the client drops a
  non-positive count before the send (sync/inventory.ts, the ExtraCount
  delta; sync/equipment.ts:87 keeps it for ammo; docs/LOG.md 2026-10-22),
  with a wire fixture of a refused and an accepted equipment and a T0 case
  on the server's inventory side, as the LOG entry asks.
- ChangeValues 16, server to client, reliable as the server sends it
  (ActionListener.cpp:2357, SendToUser(msg, true); skymp.rs:628-641 calls
  the client's own unreliable; cap 32, lib.rs:465): the server's output for
  a hosted actor's recorded values to the actor's listeners with a user,
  the host excepted (Rule A; the relay's skip, ActionListener.cpp:119-123).
  No field is new.
- CreateActor 33: for a hosted NPC its `animation` (skymp.rs:1167) now
  carries the last recorded event, as a player's does (PartOne.cpp:976
  reads GetLastAnimEvent); `equipment` as today. No shape change, no
  validator change.
- Idempotency / ordering: HostedActorState absolute and unreliable (newest
  wins; the epoch orders across grants); UpdateEquipment by numChanges as
  today; UpdateAction one performance each, reliable, as cast-action has it.
- Contract doc updated: yes, in the same commit: docs/WIRE.md's Record
  family line (:187) names HostedActorState 51 with this section's rule,
  the measured table (:99-104) gains its row once P3 has the bytes, `just
  wire-header-check` passes, the
  two wire-json fixtures and unit/WireJsonContractTest read it, the C++
  message HostedActorStateMessage (skymp5-server/cpp/messages), its
  PacketParser case and ActionListener::OnHostedActorState.

## Server

- Where the logic lives: the core (C++, legacy) for the handlers, the
  verdicts in Rust (ADR-010; cell-host's shape: wire-rules cells decides,
  the core gathers facts and sends).
  - wire-rules hosted_state (new): facts { reported: the three percentages,
    recorded: the three, held: the hold table (attributes.rs's shape,
    MpActor's heldPercentages), server_lowered: per value the time the
    server last lowered it by its own number, now_ms }; verdicts { record:
    the three values to write, floored: whether a reported 0 was floored,
    dropped: a reason when the report predates a server write }. Rules: a
    value equal to the record changes nothing; a report above a value the
    server lowered within attributes_applied_within is dropped (the mirror
    of TakeReportedPercentage, MpActor.cpp:130-134); a health below one
    point of the actor's maximum while the record is alive is floored at
    one point (god-mode's TIM number, MpActor.cpp:859-861) and counted
    (H9); a report after a death the server decided is dropped (npc-fate
    owns the transition). T0 beside it.
  - ActionListener::OnHostedActorState: ActorUpdatableBy(msg.idx) (a
    player's own actor refused: a player has no epoch; a non-host dropped
    with the existing log line); cells::accepts(CellOf(actor), sender,
    epoch) through PartOne's host table (WorldState::CellOf and HostOf,
    cell-host.md:270-283), else dropped and logged once a minute per actor
    (PartOne.cpp:1489-1505's idiom); the Rust verdict; the values written
    by a new MpActor::SetReportedPercentages (EditChangeForm on
    actorValues, SetLastAttributesPercentagesUpdate; no Kill, no respawn
    check: SetPercentage's :853-887 stays the server's own path); the
    target and the package into MpActor's pImpl beside animationData
    (MpActor.cpp:261-270), with getters; then ChangeValues { idx, the three
    } to every listener with a user but the host (UpdateHoster's loop,
    MpObjectReference.cpp:754-770), reliable.
  - OnUpdateAnimation: SetLastAnimEvent for the target actor when the
    sender is its host too (ActionListener.cpp:364-370 returns before it
    for any actor but the player's own); animationSystem.Process stays the
    player's (it spends the player's stamina for attacks; whether a hosted
    NPC's attack should spend its own on the server is npc-fate's,
    HYPOTHESIS that the engine's own cost on the host suffices meanwhile).
  - OnUpdateEquipment: the actor is ActorUpdatableBy(msg.idx) (the
    sender's own when idx is its own, else the hosted actor), not
    ActorByUser (:873-876); the spell checks ask IsSpellLearned for a player
    and IsSpellLearnedFromBase (MpActor.cpp:1428) for an NPC; HasItem
    against that actor's inventory (EnsureBaseContainerAdded first, the
    base container and template, skymp-hosting.md:396-397); the armor slot
    rule as it stands (:954-1014); SetEquipment on that actor (:1025);
    SendInventoryUpdate and the unequip snippets on refusal go to the
    actor's GetActorToSendTo (the host) as every NPC message does
    (MpActor.cpp:518).
  - OnChangeValues: unchanged (the sender's own actor; :2292-2309).
  - OnUpdateAction: unchanged gate (:373-400); the budget's numbers.
  - Counters: PartOne keeps, per connection, accepted and dropped counts by
    MsgType for the hosted paths (2, 3, 5, 44, 53) and a count of reports
    about actors the sender does not own; the lab gamemode reads them as
    labState kind `stream` (Tests: the grammar).
- DB fields / migration: none. The values and the equipment live in
  MpChangeForm already (actorValues :106, equipment :102); the combat target
  and the package are memory by design (HYPOTHESIS that the host's engine
  takes a target again by sight after a restart; b-npc-stream's restart
  step reads the record alone; TES3MP keeps neither, tes3mp.md:186-191, and
  the handoff's restore is npc-handoff's, in memory too). Rule 6 needs no
  migration; the restart step in b-npc-stream proves what persists.
- Restart behavior: every cell unhosted at start (cell-host); the first
  grant after the reconnects restarts the stream, the host's first
  HostedActorState at epoch 1 is the keyframe. The record stands as saved
  (EditChangeForm requests a save; the movement path's 30 s cadence does
  not apply to the values).
- Lab setting: npcEnabled on the run's own setting, as b-npc-puppet has it.
- Papyrus natives touched: none (ledger unchanged). Actor.GetCombatTarget,
  GetCurrentPackage and IsInCombat stay `missing` on the server VM
  (docs/NATIVES.md:119-122, :185): the recorded target is a record for
  npc-handoff and the lab, not a native's answer; a gamemode getter, if
  one is added for a script, gets its ledger line then.

## Client

- SP binding: setHosted(actorId, hosted) and isHosted(actorId) exports
  beside setPuppet (PuppetApi.cpp:1-80's idiom: a mutex-guarded set,
  Hosted.h beside Puppets.h), read by the PerformAction hook's entry
  (FridaHooks.cpp:455-470: the source actor admitted when it is the player
  or in the set; the actionPerformed event carries that actor, :499-500,
  and its master behavior variables through
  AnimationGraphMasterBehaviourDescriptor for that actor, :466); the
  sendAnimationEvent hook's native pre-match (H8, Hook.cpp:52-71's shape,
  a change in the fork's Skyrim Platform, logged `[verb:npc-stream]` as the
  puppet detours log). The natives filter in native (rule 9).
- TS handler: SendInputsService, per hosted actor from
  HostService.hostedActorRemoteIds (hostService.ts:91-108): sendMovement as
  today; sendAnimation with the source's hook added for the actor's id
  pair and a sources map that removes the hook when the id leaves the
  hosted list (:224-260 keeps a source per id forever); sendEquipment for a
  hosted actor on the equip and unequip events naming it (:55-103's player
  test widened to HostService.isMineLocal(event.actor)), reliable, under
  the actor's idx; a new sendHostedState every 500 ms per hosted actor on
  change (getActorValuePercentage of the three, getCombatTarget mapped
  through localIdToRemoteId, the last package event's package from a
  PackageService that sinks packageStart, packageChange and packageEnd for
  hosted actors); sendActorValuePercentage only for the player (:163-222).
  ActionSyncService: UpdateAction with idx = the actor's for an
  actionPerformed naming a hosted actor (the hand-cast filter stands,
  actionSyncService.ts:21-30). HostService: setHosted at every flip of the
  word (isMine true or false per actor, the same places PuppetService
  promotes and demotes). On the puppet side: formView.replayActions for a
  puppet view (formView.ts:613 runs for every view this game does not host
  already, the method :824; HYPOTHESIS H2 that the puppet's graph takes it),
  applyEquipment (:655-675) and the ChangeValues path (remoteServer.ts:
  882-904) as they are; Rule A's gates stand (:498-500, :525, :574, :655:
  nothing applied to an actor this game hosts).
- Kill switch config key: `npcStream` under skymp5-client's settings
  (hostService.ts:32's idiom): off, the host sends movement and animation
  alone (today's stream), no HostedActorState, no NPC equipment, no NPC
  actions, and the hosted set stays empty; the server's handlers stay. A
  bisect switch, not a play mode.

## Tests

- T0: Rust: wire-schema's HostedActorState (MsgType 53, wire id 61, C2S,
  cap 64) with its sample, the two wire-json fixtures (and the equipment
  pair for the -1 count: a refused and an accepted one); wire-validate's
  check_hosted_state (an epoch of 0, a percentage of 1.01 or -0.01, a NaN,
  idx u32::MAX refused; a full state accepted; the budget's burst and
  refill) and the proptest; wire-rules hosted_state (an equal report
  changes nothing; a report above a server-lowered value inside the window
  dropped and outside taken; a 0 floored and counted while alive; a report
  after a server death dropped). C++: CellHostTest's stream cases: the
  host's state at the current epoch records the three values, the target
  and the package and sends ChangeValues to the other game and not the
  host; the same at an older epoch dropped; from a non-host dropped; a
  player's own idx refused; a health 0 floored, isDead false, the respawn
  timer untouched; an UpdateEquipment under a hosted NPC's idx writes the
  NPC's record and leaves the host player's as it was (the latent
  corruption's test), an item the NPC's inventory lacks refused, a base
  spell admitted; OnUpdateAnimation keeps the last event for a hosted actor
  and a later subscriber's CreateActor carries it; the counters count.
- T1: none new: no new Address Library id. The hosted set's read at the
  PerformAction hook is proven on the seat ("[verb:npc-stream] hosted set
  n" in c1.log at the grant) and by P4.
- T2: difftest session npc-stream.yaml: c1 sends a HostedActorState for an
  actor nobody hosts (both servers drop it: the wire one by the host table,
  the legacy one knows no 53, as it knows no 47 to 52) and an
  UpdateEquipment under the other player's idx (both drop it: "already
  owned by user"); declared divergences none beyond the session's usual.
  The hosted case needs an NPC, which T2's servers do not load
  (npc-puppet.md:706-711): T0's and T3's.
- T3 scenario id: lab/scenarios/b-npc-stream.yaml. Two seats, Riverwood as
  b-npc-puppet lays it (Tamriel 0x3C, (4,-12) 0x9732, the clock to 7.9,
  npcEnabled on the run's setting, god mode on both seats as b-cell-host
  has it); c1 lands first and hosts, c2 beside it 15 s later. Grammar
  first (docs/verbs/npc-puppet.md's lesson, b-cell-host's 2026-10-21 red):
  npc-state gains health, magicka and stamina percentages, rightHand and
  leftHand (getEquippedObject 1 and 0) and isDead; labState's ref kind
  gains combatTarget, package, epoch (the cell's current one) and
  lastAnimation; a labState kind `stream {profileId}` answers the
  counters; a kind `hostedActors {profileId}` lists the actors whose cell
  that player hosts; the driver's dump-state gains the hosted list
  (hostedActorRemoteIds) as c.stream_actors(); lab-api reads
  c.watched_id(id).first_event(name) in ms from the watch's start and
  .count_event(name), c.watched_id(id).first_true(bool), server.stream(c)
  .accepted[t], .dropped[t] and .about_others, server.hosted_actors(c).
  Steps and asserts:
  - after the roster (wait 20): server.host(0x9732).client == "c1";
    sorted(server.hosted_actors("c1")) == sorted(c1.stream_actors()) (H6);
    c2.stream_actors() == [].
  - watch-start on both seats with the fourteen ids and bools
    [IsAttacking, IsStaggering], trackMax 480; wait 60; watch-stop.
    Asserts: c2.watched_id(0x13483).first_event("IdleHoe") within 2000 ms
    of c1's (the relay's lag; the two watches start within a second of each
    other); for Sigrid, Alvor and Hod, c2's count of the resident's work
    idle within one of c1's and never above it (H7: each relayed event
    once; the unreliable channel may lose one); the tracks within 256 units
    as b-npc-puppet asserts; abs(server.ref(0x13483).healthPercentage -
    c1.npc_state(0x13483).health) < 0.02 and abs(c2.npc_state(0x13483)
    .health - c1's) < 0.05 (the values reach the record and the puppet);
    server.ref(0x13483).package != 0 (H3's event fired at least once in the
    minute; a 0 here reads H3 false) and == c1.npc_state(0x13483).package
    when the getter agrees (recorded, not asserted, until H3 is read);
    server.stream("c2").accepted[53] == 0 and server.stream("c2")
    .about_others == 0 (the observer's puppets never report);
    server.stream("c1").accepted[53] > 0.
  - the fight: c1 looks at Sven 0x13491 and casts the shout's first word
    0x13E09 at him (x-npc-puppet-2's step, the shout given to c1 through
    the server first, docs/verbs/shouts.md's record, numidium's grammar);
    wait 3; npc-state on both seats. Asserts: c1.npc_state(0x13491).health
    < 1 (the engine's two points, readings-18:90); abs(server.ref(0x13491)
    .healthPercentage - c1's) < 0.02; abs(c2's - c1's) < 0.05;
    c1.npc_state(0x13491).inCombat == true; server.ref(0x13491).combatTarget
    == server.actor("c1").actorId; c2.npc_state(0x13491).inCombat == false
    and .aiEnabled == false (the puppet records a fight it does not run);
    c2.watched_id(0x13491).first_true("IsAttacking") within 2000 ms of c1's
    (the action replayed on the puppet, H2; the watch runs again around the
    fight); c1.npc_state(0x13491).rightHand == c2.npc_state(0x13491)
    .rightHand == server.ref(0x13491).rightHand (the equipment agrees on
    both seats and the record; both 0 is agreement, the non-vacuous proof
    is x-npc-stream-equip's); a second word within a second: the record
    moves once more and c2 ends within one report of c1.
  - the handoff: c1 to the lab spawn past the grace; wait 8: server.host
    (0x9732).client == "c2"; server.ref(0x13483).epoch == 2 (the last state
    taken was the new host's); server.stream("c2").accepted[53] > 0 and
    c1's count unchanged over the next 5 s (the old host streams nothing;
    its late states, if any, in dropped[53]).
  - the late joiner: c1 back beside c2; wait 10: abs(c1.npc_state(0x13483)
    .health - server.ref(0x13483).healthPercentage) < 0.05; c1's Sven
    rightHand == server's.
  - the restart: server snapshot of server.ref(0x13491); restart; both
    reconnect; wait 12: abs(server.ref(0x13491).healthPercentage -
    snapshot) < 0.02; server.ref(0x13491).combatTarget == 0 and .package ==
    0 (forgotten by design); server.host(0x9732).hosted == true.
  - dump-state on both; artifacts server.log, c1.log, c2.log, screenshots.
- Parity scenario (ADR-031): lab/scenarios/p-npc-stream.yaml against a new
  reference lab/references/npc-packages-a.json (r-npc-packages' recording,
  solo, the fourteen ids, the clock step as its cut), comparing the host's
  view (c1's watch) and the puppet's view (c2's watch) per named id: the
  events each resident fired and the track; `later:` the three npc-fate
  rows and the voice row. The parity block today keys on an actor and a
  target with a cut
  (p-spell-bolt.yaml:25-30); a per-id, no-target form is a grammar row
  (numidium's) that lands first, and this doc records that the comparison
  is the row, not the yaml's shape.
- Assertions that would fail if the verb silently regressed: a resident's
  recorded health standing while the host's moved (the state path dead); a
  puppet's event count above the host's (a double play, H7) or more than
  one below (events lost or the source removed); a non-host's state
  accepted (accepted[51] on the observer above 0); the record's
  combatTarget 0 during the fight; the host's own record changed by an
  NPC's equipment (the latent corruption back); the old host's states
  accepted after the handoff (epoch not advancing).

## Dynamic plan (fill when any tag above is still HYPOTHESIS)

- Frida script: lab/frida/npc-stream.js (lab/frida/npc-puppet.js's shape;
  LAB_PARAMS, no top-level name a Frida global owns, the stdout flushed:
  the 2026-10-21 pitfalls). Hooks, by `just addr`: the engine's send that
  Skyrim Platform hooks (Offsets::Hooks::SendAnimation's id, read from the
  fork's game/Offsets.h, never from memory; the holder in rcx, the
  reference at rcx minus 0x38 (TESObjectREFR.h:112), its formID at +0x14
  (TESForm.h:354), the event name's pointer the second argument, as
  FridaHooks.cpp:341-348 reads them) counted per actor per second against the client's
  UpdateAnimation sends in c1's wire log; PerformAction 38949 (cast-action's
  id) entries whose source is a hosted actor against UpdateAction sends;
  the time spent inside Hook::Enter per call (the game thread's wait for
  the JavaScript round trip), before and after H8's pre-match. Scenario
  steps that trigger them: b-npc-stream's minute and fight.
- P3 (x-npc-stream-cost, two seats, Riverwood, 90 s then the fight): per
  hosted actor the host's upstream messages and bytes by type from the
  wire log (the plugin's send lines), the server's counters, the action and
  event rates (the budgets' numbers: hosted_state_budget, the host's action
  and equip budgets, whether the animation stream needs one), the relay's
  lag per field (the first IdleHoe on c1 against c2; the first health
  change on c1 against the record and c2), the package events at the 8:00
  switch (H3), the frame time on the host with fourteen residents under
  the per-actor filters with and without the pre-match (H8); the released
  host's AnimationSource callbacks after the release, counted in c1.log
  (H10: zero). Falsified by:
  E_VAL_RATE lines for legitimate bursts (then the budget is wrong, not the
  host); a lag over 2 s on any field; no package event across the switch
  (H3 false: the package row records nothing and is dropped from the
  message before merge, rule 4's dead-field test).
- P4 (x-npc-stream-action, two seats): c1 hosts a bandit cell (x-npc-puppet's
  0x1BCD8 at the camp, or r-npc-fight's two) and starts combat through the
  driver's start-combat; c2 watches the puppet with bools [IsAttacking]:
  IsAttacking rises on c2 within 300 ms of c1's for each window
  (performActionResult true on the puppet: H2 holds) and exactly one
  attackStart per window on c2 (H1 holds). Falsified by performActionResult
  false (then the puppet's actions wait for the re-analyst's read of the
  replay entry's gates, not a guess), or two starts per window (the
  source's drop rule missed the event).
- P5 (x-npc-stream-equip, two seats): a hosted NPC's equipment changes on
  the host (the fight's EquipBestWeapon; failing that the console's prid
  and equipitem on the resident from c1's seat, under the console rule's
  staff rank) and c2's puppet shows it within 2 s (npc-state's hands equal);
  the host player's own record unchanged before and after (server.actor's
  inventory). Decides H4 (the equip event for an NPC's AI equip) and the
  handler's actor resolution.
- x-npc-stream-values (two seats, a bandit cell): c2 (the puppet's game)
  hits the puppet once (the server's R0 number lands on the host's game as
  ChangeValues, the host's engine applies it, the host's next state reports
  it): the record moves once and stays (H5: no oscillation over 10 s of
  states), the puppet's bar on c2 follows within one report; then a
  console `damageav health` on the host's actor (the host's own number):
  the record follows the host. x-npc-stream-door (two seats): Embry through
  the inn door while hosted (readings-18:36-43): the stream continues under
  the same idx across the cell-change rule, the puppet on c2 stands where
  it was until npc-handoff's MoveTo (npc-puppet.md:109), no refused state.
- H9 (a hosted actor's death the server did not decide): counted by the
  floor's log line over b-npc-stream and the probes; a count above 0 in
  Riverwood is a finding for npc-fate's doc, not this verb's red.
- Breakpoint plan for a human session: none unless P4 falsifies H2 (then
  the replay entry's gate on an AI-off actor, x64dbg on the puppet seat,
  the condition "source is the puppet", watching the return of 38953).
- Owner: agent (Frida); Eli (x64dbg) only on a falsified H2.

## The build's calls under the design law (2026-10-26 02:24 PDT; say the letter to change one)

ADR-050 (Eli, 2026-10-26: "proceed with the pivot. open ADR-050 and start
npc-stream") builds this verb first and "as the draft states"; the eight
open questions below are answered here so the build can start, each as a
call under the law, Eli's letter changing any:
- Q1, the epoch: on HostedActorState alone (the Authority's reasons). Call A.
- Q2, a death the host alone witnessed: this verb floors it and leaves it to
  npc-fate as drafted, UNTIL ADR-050's decision 2 (deaths by the engine) lands
  on the train after this one; the stream's health channel is what that
  train stands on. Call: as drafted, the next train changes it.
- Q3, the actions row: here, as ADR-035 point 5 places it; P4 decides H2 (a
  puppet performs an action); if H2 falsifies, the replay entry's gates are
  the re-analyst's read, not a guess. Call A.
- Q4, the package field: kept as an observation (R2 record) for npc-handoff
  and the lab; dropped before merge if P3 reads no event across the 8:00
  switch (rule 4's dead-field test). Call: keep, conditional.
- Q5, the budgets: UNMEASURED placeholders at four times the references'
  rates, named so in the code, replaced by P3's numbers. Call A.
- Q6, the M0 row 5: the family message, MsgType 53 and wire id 61 (51 and 52
  went to ActorFate and ActorDeath since the draft); row 5's Rust variant and
  struct renamed ReservedHostedActor and ReservedHostedActorState, dead,
  the id kept (ADR-012); the keyframe after a grant on the same unreliable
  channel, that one send marked reliable. Call: the family message.
- Q7, the inventory's rung: npc-fate's R0 stands; this verb carries
  equipment (R1 against the record), never inventory. Call: R0 elsewhere.
- Q8, the voice line: the fourth slice of this verb, after the actions, the
  state and the equipment. Call: later slice.

Slices, inside-out, one fork branch m3-npc-stream off parity aaafffe5:
1. ACTIONS (the root the review named): the hosted set in Skyrim Platform
   (setHosted and isHosted beside setPuppet) read at the PerformAction
   entry, the actionPerformed event for a hosted actor, UpdateAction under
   the actor's idx from ActionSyncService, the server's gate re-read for a
   hosted idx and its budget sized for a host, the puppet's replayActions
   admitted for an engine reference; the graph-event relay's source drops,
   for a hosted actor, the events the action replay covers (the attack
   family first), so a puppet plays each once (P4's H1). Probes P4 and a
   solo P1 beside it.
2. STATE: HostedActorState 53/61 with its validator and fixtures in one
   commit, the hold rule in wire-rules, OnHostedActorState with ChangeValues
   to the other listeners, the counters, the client's sendHostedState and
   PackageService. Probes x-npc-stream-values, P3's cost read.
3. EQUIPMENT: UpdateEquipment under a hosted actor's idx on the server's
   resolution, the -1 count prerequisite, the client's sendEquipment for a
   hosted actor. Probe P5.
4. The voice line, the budgets from P3, b-npc-stream whole, the parity
   scenario and the reference trace (ADR-050 decision 5).

## Status

Doc drafted 2026-10-22, before any code; reviewed the same day (rules 1,
2 and 11 checked, the fork lines re-read at 19e7ca9b). BUILDING since
2026-10-26 02:24 PDT on fork m3-npc-stream (ADR-050), the eight questions answered
above as the build's calls. Open questions for Eli before the build as
they stood, each stated once in its section: (1) the epoch on
HostedActorState alone, not on the players' hot messages (Authority); (2)
a death the host alone witnessed is floored and left to npc-fate, with a
visible corpse the record calls alive (the Inventory's death row), against
taking the host's death as R2 now; (3) the actions row here as ADR-035
point 5 places it, or its own verb if P4 falsifies H2; (4) the package
field kept as an observation or dropped, and what the getter's one id
means (Engine surface, the package); (5) the budgets' first numbers as
UNMEASURED placeholders at four times the references' rates until P3; (6)
the M0 row 5 against a family message 51, the ADR's field list and the
keyframe's channel (Message contract, the M0 row); (7) the inventory's
rung, PLAN's R2 against ADR-035 point 6's R0 (the Inventory's inventory
row); (8) which slice takes the voice line npc-puppet carried here (the
Inventory's voice row).

- [ ] doc complete, inventory listed with a disposition per row, rung declared
- [ ] engine surface cited or delegated
- [ ] server logic + T0
- [ ] message + validator (same commit)
- [ ] native hook + T1
- [ ] TS handler
- [ ] T2 green
- [ ] T3 scenario green, no HYPOTHESIS tags
- [ ] parity scenario green, or its later list reviewed with it (ADR-031)
- [ ] sequences and combinations green, every checklist item with its scenario (ADR-033)
- [ ] ledger and suppression registry updated

## Reviewer checklist

1. Is the rung right, and is the reason for not going one rung higher real?
   (Authority: events and actions R2 because judging them is the graph;
   values R2 under the players' hold; the epoch only where a table can
   check it.)
2. Does every address come from CommonLib, addrlib, or a Ghidra reference?
   (Engine surface: headers by file:line; the one hook id is cast-action's;
   the Frida script reads the fork's Offsets.h.)
3. Is there any state this verb creates that is not on a rung? (The
   recorded target and package are R2 in memory; the counters are the
   server's own, R0; the puppet's smoothing and look resolution R3.)
4. Does the validator reject the obvious forgery (wrong owner, out of range,
   too frequent)? (check_hosted_state; ActorUpdatableBy and cells::accepts
   for the owner and the epoch; the budgets once measured.)
5. Does the restart scenario exist and pass? (b-npc-stream's restart step;
   no migration, since no field is new to the record.)
6. Are the HYPOTHESIS tags gone, and were they cleared by evidence? (H1 to
   H10 against P3, P4, P5, x-npc-stream-values and b-npc-stream.)
7. Is the suppression reversible on host handoff? (The source removal and
   the hosted set follow the word; the handoff step.)
8. Did the ledger change if a native did? (No native; NATIVES.md unchanged.)
9. Does the Inventory list every consequence of the reference trace and the
   records, each with one disposition, and does the parity scenario's later
   list match its later rows and nothing more?
10. Is every sequence and combination row green (the action again at a
    person's rhythm, each input that performs it, interrupted, both seats),
    and does every item of the playtest checklist have a scenario that does
    it the way a person does (ADR-033)?
11. Was `just fork-lint <fork tree>` clean before each fork push, and is the
    head's GitHub Formatting check green? Parity was red there from 10-15 to
    10-17 on two faults every branch inherited: Hooks.cpp formatted by a newer
    clang-format, and skyrimPlatform.ts edited without Definitions.txt.
