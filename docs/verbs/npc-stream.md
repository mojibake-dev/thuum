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
| the graph events (IdleHoe, IdleBlacksmithForgeEnter, attackStart, staggerStart; 32 to 134 events per walking resident over 90 s, readings-18:21-28) | trace, code | native on the host, imposed on a puppet (R2): reported by the host's AnimationSource per hosted actor (animation.ts:242-347) as UpdateAnimation 3, Unreliable, its hook filtered in native to the actor's own id and removed at the release (Observe; today unfiltered and never removed, :245-261, skymp-hosting.md:316-320); the server relays and now keeps the last event per hosted actor too (today the player's own alone, ActionListener.cpp:364-370), so a late joiner's CreateActor carries it (PartOne.cpp:976); a puppet replays each once; H7 CONFIRMED: P4 v2 20261026-172720 (six host attack actions, six puppet 'taken 1', no 'block anim attack'); P1 101422 (1234 of 1236 events inside a PerformAction) |
| the engine's BGSActions (the attack, the power attack, the draw and sheathe: r-npc-fight's three IsAttacking windows and 22 moveStarts on one bandit, readings-18:67-71) | trace | native on the host, imposed on a puppet (R2): UpdateAction 44 extended from the player to the actors this game hosts (ADR-035 point 5: "actions ride cast-action's action replay (ADR-032), extended from players' figures to NPCs"; cast-action.md:229 left them "a later slice"): the native PerformAction hook's filter widened from the player to a hosted set (FridaHooks.cpp:455-470 reads `data->source.get() == player` at :460); a puppet performs them through performAction with the variables first, as a figure does (formView.ts:613, the method :824); H2 CONFIRMED (172720: every streamed attack performed through the entry on the AI-off puppet); the event an action carries is not re-sent as an animation event; H1 CONFIRMED (101422: an action's events ride the mark) |
| health, magicka and stamina as the host's engine moves them (regeneration; a bandit's hit on a bandit; a fall; a script) | trace (r-npc-fight's bandit took none; the engine alone's NPC values are not in a trace yet), code | native on the host, imposed on a puppet from the server's record: R2 for the numbers, recorded from HostedActorState (new, MsgType 51) under R1 bounds (finite, 0 to 1 inclusive, and the attributes hold, wire-rules attributes.rs, the players' rule: a host's report cannot undo a value the server lowered itself); at most twice a second per actor; the server tells the other games as ChangeValues 16, the path a figure's values take (remoteServer.ts:882-904); a report of 0 does not kill: a death is the server's (R0, npc-fate), the record floors at one point and the floor logs (Server) |
| the combat target and the combat state (a hit drafts the actor, combatTarget the player, inCombat true: readings-18:100-102; TESCombatEvent) | trace | native on the host; recorded in memory (R2) from HostedActorState (the target's identity; the look point stays in the movement sample, movementGet.ts:46-56, where the puppet's head tracking reads it, movementApply.ts:37-56); never imposed on a puppet (npc-puppet's H6: a puppet is never in combat); restored at a promote: later, npc-handoff |
| the running package and its changes (the schedule switch at 8:00, Hod back to the mill, readings-17:39-43; packageStart, packageChange, packageEnd) | trace (the Papyrus getter read 0x3EAB9 at every read, AI on or off and mid-recoil, readings-17:67, readings-18:77-82 and :116-118), code | native on the host; recorded in memory (R2) from HostedActorState, an observation only: nothing imposes a package on a puppet (Skyrim Together's package sync, written, crashed and compiled out, te-npcs.md section 3); the proposed source is Skyrim Platform's package events, not the getter (ADR-034; H3, HYPOTHESIS until b-npc-stream-state's claim, drafted and not committed: a c1 log-count of the sender's package-event line for 0x13483 across 8:00, gameHour 7.9 for 60 s, `>= 1`, with c1.npc_state(0x13483).package recorded before and after, the line's text the fork's, 42af75b7; b-npc-stream-state.yaml, promoted from P5 163259, carries no package line, so the read waits on the claim's own commit, rule 13, and a gate, P3 222300 and P5 163259 having asserted nothing on the package); what the getter's one id means is the open question stated under Engine surface, the package |
| what the actor wears and holds (the server's EquipBestWeapon on a hosted caster, MpActor.cpp:193, skymp-hosting.md:130; the engine's own equips under its packages; ActorEquipManager) | code | native on the host, imposed on a puppet (R1): UpdateEquipment 5 under the actor's own idx from the host's half-second poll (slice 3: a poll, not the equip events, which were the player's alone, sendInputsService.ts:55-103, :287-290), validated against that actor's own inventory and base spells, recorded on that actor (today the handler writes the sender's record whatever the idx, ActionListener.cpp:873-876 and :1024-1025: the latent corruption skymp-hosting.md:131 names), relayed reliably; a puppet applies it as every view does (formView.ts:655-675); the client's -1 inventory count that the wire's u32 refuses (docs/LOG.md:2245, 2026-10-22 03:19, c2's 1,835 refused UpdateEquipment sends) is this row's prerequisite |
| the actor's inventory changing on the host (a pickup, loot taken, an arrow spent) | ADR-035 point 6; PLAN.md:1045-1047 | later: npc-fate, on ADR-035 point 6 (docs/DECISIONS.md:1302-1305: inventories are R0, the server's); open question for Eli: docs/PLAN.md:1045-1047 has inventory changes streaming from the host as R2 with cheap bounds, the ADR has them R0, and the two have not been reconciled; this doc follows the ADR and carries no inventory_delta either way (the M0 row's field, Message contract) until he says which |
| the actor's death on the host (NPC against NPC, a fall, a trap) | ADR-035 point 6 | later: npc-fate (deaths that persist, R0); until then a puppet shows the relayed isDead as today (movementApply.ts:73, deathService), a corpse the server's record calls alive: carried by name, with H9's count |
| hits by the hosted actor on anyone and the players' hits on it (hitService.ts:17-41; melee-reach.md:27-28) | code | later: npc-fate; the hit gates stand (ActionListener.cpp:2898) |
| casts and shouts by the hosted actor (magicSyncService.ts:62-64; the hosted caster gate, ActionListener.cpp:3246-3247) | code | native on the host; relayed as today (SpellCast 23 under the hosted caster gate; the effects the server's, docs/verbs/spell-cast.md); the hands' graph work rides the actions row |
| the voice line (package dialogue, idle chatter, barks), carried here by name from npc-puppet.md:102 (TES3MP relays it as ActorSpeech, tes3mp.md:81) | code (npc-puppet.md:102) | later: not in this cut (ADR-035 point 5 names no voice row); which slice takes it is an open question for Eli (Status) |
| the host's own reports echoed back to it | code | suppressed since cell-host (RelayToListeners skips the host, ActionListener.cpp:105-129); HostedActorState has no relay at all (client to server only) |
| a report that outlives its grant (the old host's last samples after a handoff; the same game granted the cell again at a later epoch, its earlier tenure's samples reordered on the unreliable channel) | tes3mp.md:194-196 (the late-grant desync), te-npcs.md:70-71 | suppressed: the host table drops a non-host's report (ActorUpdatableBy, ActionListener.cpp:87-99) and the epoch on HostedActorState drops a stale state (wire-rules cells::accepts); movement, animation and actions carry no epoch (Authority says why) |
| the stream's cost: 7.7 samples a second per hosted actor, every graph event, every action, and one game-thread round trip into JavaScript per sendAnimationEvent anywhere in the game (Hook.cpp:73-87 pushes and waits for every event whatever the handlers' filters; only sendPapyrusEvent pre-matches, :52-71) | code | imposed with measured numbers (P3, ADR-033 point 5): the per-actor native filter, a native pre-match for the animation hook (H8, a known limit: whether it removes the game thread's wait is unmeasured, P3 222300 having read the wire alone with a probe that claims the premise and lab/frida/npc-stream.js never written; the host's frame time with fourteen residents is a playtest's eye, the Frida read of Hook::Enter's wait named if a playtest reports it), the budgets per host sized to the hosted count; the receiving side has its own cost, found 2026-10-22: the puppet apply makes three Papyrus-backed calls per sample per puppet (blockActivation, setHeadTracking, and setLookAt or the tracking off; movementApply.ts:45-61), about 180 a second for Riverwood's 23 residents, each a game-thread call through Skyrim Platform's queue beside the transform and the native locomotion feed, so a once-per-change shape (the block once, head tracking on change) is this verb's row |

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
| the local player hits a puppet (its game reports nothing; the server's number lands on the host's game as ChangeValues, the host's engine applies it, the host reports the same value back: idempotent, no loop under the hold; H5 CONFIRMED on its successor path: ADR-050 decision 2 replaced the ChangeValues echo with the cause (the number through damageActor, the host's engine the writer, HostedActorState the report back), and the read there is one number, the host's engine within 0.03 of the record after the first swing (x-npc-death-host v5 20261027-095847, nine of nine; b-npc-death-engine.yaml:95; the guest's hits on the puppet the same way, x-npc-death-guest v6 103226)) | x-npc-death-host v5 095847 and x-npc-death-guest v6 103226 (x-npc-stream-values was never written) | CONFIRMED on the cause path |

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
- MEASURED (P3, x-npc-stream-p3 20261026-222300 on parity 66f04f2a, the
  pcap's read by an agent, 16:05 PDT): with c1 hosting 18 to 19 actors and
  c2 puppeting them, the relay to the puppet seat is about 9.6 KB/s of
  message-bearing payload in the quiet square (55 packets a second) and
  11.6 KB/s in the fight (+22%), about 500 to 580 B/s per hosted actor;
  the host's own stream up is symmetric (9.1 KB/s, 480 B/s per actor). The
  effective sample period is 140 ms (the 130 ms timer quantized to frames;
  autocorrelation at lag 140, r 0.46), 7.1 samples a second per actor,
  not one burst per period (36.8 message packets a second, inter-arrival
  median 17 ms). The dominant wire cost is NOT the stream: the transport
  sends 720 to 790 packets a second of 26 to 31 B payload to each client
  in every window (23 KB/s on the wire to a client hosting nothing) and
  each client returns 180 to 190 such packets a second, independent of the
  hosted count; read as renet's ack and keep-alive traffic at the update
  rates (MEASURED by x-wire-idle-rate on sky-srv, numidium 17:13 PDT
  2026-10-29: 814.8 packets a second of 26 to 31 B to one idle fakeclient
  against 816.4 server ticks a second, equal within 0.2 percent, nothing
  after the close; the fakeclient's own 184.5 a second upstream is its 5 ms
  loop): an idle client costs about 815 packets a second, near 45 KB/s with
  headers, because the server loop ticks and sleeps 1 ms (skymp5-server
  index.ts:222-227) and the wire sends at every update, a budget row of its
  own before the per-actor budgets are tightened. Two server-wide stalls (164 ms at the
  Riverwood keyframe, 60 ms at c2's teleport), no gap over 0.3 s while
  hosting, no retransmission-looking repeats. The per-message counts and
  the per-type budgets come from slice 4's counters on train 54's stage
  (server.stream rows). Message types are invisible in the pcap (netcode
  encrypts payloads), so the budget rows below stay in bytes per actor.

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
  natives. The streamed combat target is the Papyrus getter's answer, R2 and
  never imposed; while the controller chooses, its targetHandle may differ
  for a tick, unsynced.
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
  Whether they fire for a hosted NPC's schedule switch is H3, whose read is
  the Inventory's package row; the readings show only that the getter does
  not move. Open question for Eli, the getter's one id:
  Actor.getCurrentPackage read 0x3EAB9 at every read, AI on or off, puppet
  or live, mid-recoil in combat (readings-17:67, readings-18:77-82,
  :116-118), while the traces show Hod's schedule switch at 8:00
  (readings-17:39-43). Either the getter answers something other than the
  procedure the actor runs or the running package never changed in those
  windows; this doc does not decide it, it proposes the events as the source
  (H3) and keeps the field pending the package row's claim (P3 222300 never
  read the switch; Status, open question 4; a field no event fills is
  dropped before merge, rule 4).
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
  skymp-hosting.md:316-320; the read is a count of "No permission to update
  actor 1348[23]" in x-handoff-cross 211054 and 230629, whose passes flip
  the word, a count not yet taken of logs in hand,
  b-npc-handoff-cross.yaml:68-79 claiming "may not move 13483" == 0 and not
  this line: zero confirms H10, nonzero becomes b-npc-handoff-cross's
  claim); the PerformAction hook's native filter widened to a
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
  so the per-actor filters only remove callbacks, and the pre-match (H8) is
  built to remove the stall; whether it does is unmeasured, a known limit:
  P3 (222300) read the wire alone, its probe claims the premise, and
  lab/frida/npc-stream.js was never written; the host's frame time with
  fourteen residents is a playtest's eye, the Frida read of Hook::Enter's
  wait named if a playtest reports it.

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
- Side effects: three: H1 (the event an action carries is dropped by the
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
  idempotent by the hold rule; an oscillation would show as a bar flickering
  on the puppet, x-npc-stream-values, a probe never written). H1 CONFIRMED
  (P1 101422: 1234 of 1236 events inside a PerformAction); H2 CONFIRMED (P4
  v2 172720: six attacks performed through the entry on the AI-off puppet,
  taken 1); H5 CONFIRMED on the cause path (as the Sequences row:
  x-npc-death-host v5 095847, b-npc-death-engine).

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
- Side effects: two: H6 (cell-host's: the host's set of reported actors
  equals the server's set of actors whose cell the host holds; both derive
  from the word, so a gap is a model the view lacks, measured by
  b-npc-stream's set assertion), H7 (cell-host's: each relayed animation
  played once, measured by the event counts on both seats). H7 CONFIRMED
  (172720: six host attack actions, six puppet 'taken 1'). H6, a known
  limit: no scenario compares the host's hosted set with the server's host
  table (b-npc-stream was never built; hosted_actors and stream_actors exist
  in no scenario or lab-api fact); both derive from the one word, the
  over-report half reads zero 'No permission' lines across the stages
  (172720, 163259, 173133), and the under-report half waits on
  server.hosted_actors if b-npc-stream is built. Reversibility on handoff is
  the Release condition and b-npc-stream's handoff step.

Known limits: The streamed combat target is the Papyrus getter's answer, R2
and never imposed; while the controller chooses, its targetHandle may differ
for a tick, unsynced. A hosted NPC's attack costs the stamina its host's
engine charges; the server charges none and records the host's percentage R2
through HostedActorState. The combat target and the package are memory: a
restart or a handoff drops both, the record carries neither (as TES3MP), and
the host's engine re-acquires a target by its own senses. The per-id native
pre-match on the animation hook is built (slice 1 as built); whether it
removes the game thread's wait is unmeasured: P3 (222300) read the wire
alone, its probe claims the premise, and lab/frida/npc-stream.js was never
written; the host's frame time with fourteen residents is a playtest's eye,
the Frida read of Hook::Enter's wait named if a playtest reports it. No
scenario compares the host's hosted set with the server's host table (H6;
b-npc-stream was never built, and hosted_actors and stream_actors exist in
no scenario or lab-api fact): both derive from the one word, the over-report
half reads zero 'No permission' lines across the stages (172720, 163259,
173133), and the under-report half waits on server.hosted_actors if
b-npc-stream is built. A hosted shooter's arrow claims no headshot (H-53d):
the headshot rule is the player's bow path (ADR-038, ClaimHeadshot) and a
hosted shot's hit lands as the arrow's number; unread in the lab and
accepted. A relayed arrow's flight on the watcher against the host's launch
(H-53e) is a screenshot read no probe takes: one relayed arrow flew on c2
per shot and none of the puppet's own (x-npc-archer 032303), Eli read 'bows
work' in playtest 35's Bleak Falls note, and the hit is the server's number
whatever the arrow's path.

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
    NPC's attack should spend its own on the server is npc-fate's;
    a hosted NPC's attack costs the stamina its host's engine charges; the
    server charges none and records the host's percentage R2 through
    HostedActorState).
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
  and the package are memory: a restart or a handoff drops both, the record
  carries neither (as TES3MP), and the host's engine re-acquires a target by
  its own senses (b-npc-stream's restart step reads the record alone; TES3MP
  keeps neither, tes3mp.md:186-191, and the handoff's restore is
  npc-handoff's, in memory too). Rule 6 needs no
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
  already, the method :824; H2 CONFIRMED, 172720),
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

### Slice 6's creature half (playtest 37, finding 47; fork m3-npc-caster 05a285f6, 2026-10-28)

A flame atronach hosted by Prisoner cast Firebolts he alone saw: the host's client reports a cast from Skyrim
Platform's spellCast event, which the platform raises only when the spell sits in one of the actor's four selected
slots (EventHandler.cpp isCastValid), and a creature's AI cast fills none (which engine path it takes is unread, rule
8; the Dynamic plan is in the branch's report: the hosted caster's spellCast events are now logged with their slots on
the host, and a Frida plan on MagicCaster's CastSpellImmediate, ActorMagicCaster::SpellCast and FinishCast by
CommonLib name). Built: the host reports a hosted actor's spell LAUNCH (the launch hook admits hosted shooters) as
its SpellCast under the caster's id with the launch's hand, origin and angles when no cast event claimed it within
400 ms, the two deduping each other (H-53f, HYPOTHESIS until x-npc-creature-caster v3 records the launch counts: v2
20261029-205125 held 14 of 15 with c1's "hosted launch" and "hosted cast from its launch" lines at 0 and 0 while the
server accepted four casts, so the launch-report path never fired, the dedupe was unexercised and the path that reported
the casts is unnamed; v3, 14:00 PDT, records those counts, unrun); the watcher's creature puppet
casts and ends without graph variables (MagicApi's HasMasterGraph: a non-master graph skips the apply instead of
returning, H-53g); the server stands a known constant-effect ability as the cast behind a cloak's hit
(PartOne::AbilityReaching over KnownBaseSpells' reached spells), so the atronach's cloak damage lands at the reach
rule's cadence, and a spell no ability reaches stays refused (rule 5; T0 NpcCastTest). Known: a server-made
creature's death still ends by the server's word (the client never reports a 0xff id and the wire refuses the range,
a contract change for its own commit, fork m3-death-range 2069d4d2). READ (2026-10-28; the train's first T0, pipeline
3650, showed it): the cloak's hit is claimed, and its damage effect, MGEF crFireDamageConcAimed 0x10fdd1 (SPEL
crAtronachCloakFlameDmg 0x6445b: concentration, aimed, magnitude 10, duration 1), carries one CTDA, function 719,
EqualTo 1.0, params 0, run on Subject (lab/esm.py). H-53h CONFIRMED-by-read for the identity: 719 is IsHostileToActor
(CommonLibSSE-NG include/RE/T/TESCondition.h:865; the engine method include/RE/A/Actor.h:593), which the fork already
implements: condition_functions/IsHostileToActor.cpp ignores the null parameter, takes the effect's other end as the
other actor and answers worldState->fightBetween(self, other), installed in PartOne::Init over wire-rules hostility.rs
Fights::between, ADR-023's table. It failed because that table never held a hosted NPC:
ActionListener::NotifyHostility built its facts from serverState.UserByActor alone and the rule wanted a user on both
sides, so a hit by or on a hosted creature never entered it, and PartOne::TickFights forgot any pair whose member had
no user; every NPC-to-player effect gated on 719 was refused forever, mid-fight included (the Firebolt, with no
condition, was unaffected). Fixed on fork m3-npc-fights (R0; no wire change, no new condition function): HitFacts
carry aggressor_is_hosted and target_is_hosted (worldState.HostOf non-null for an actor no user plays), the rule
(hostility.rs `counted`, formerly `between_players`) counts a hit with a player on one side and a player or a hosted
NPC on the other, the StartCombat notice stays between two players (a hosted NPC's victim is its host engine's to fight, a player's
copy of a hosted creature is AI-off), TickFights keeps a pair whose member has a host, and the rest rule's in_fight refuses a player a rest
mid-fight with a hosted NPC as with a player (hostility-sync.md's T0 line amends ADR-023's "between players"). The T0
claim restored (NpcCastTest's cloak case, relaxed at df445168): the cloak's first hit on a never-fought pair, the
atronach's own host standing in the cloak (playtest 37's seat), is refused "its conditions fail; not applied" with its
health unchanged, the engine's rule between strangers; a claimed Firebolt of the atronach's begins the fight with the
other player (health 0.9, GetFights().between, no StartCombat notice, the pair kept through a TickFights); then
the cloak's first report on that player lands one cadence, 0.5 s (wire-rules casts REACHED_TICK_MS) of magnitude 10, 5
of the recorded 250: 0.9 to 0.88, with no E_CONDITION_UNKNOWN. HYPOTHESIS (H-53h, what remains; the read is
lab/frida/cloak-hostile.js under x-cloak-hostile's frame, both by path since 16:39 and 16:40 PDT 2026-10-29 and unrun;
x-npc-creature-caster 205125 carried no trace): the engine's own 719 with a null parameter on an aggressive creature,
whether a creature whose AI means to attack the player counts as hostile to it before any blow (then the single-player
cloak burns a player it has not yet hit, where the server's table waits for a counted hit); the script hooks
IsHostileToActor (Actor.h:593, its id by `just addr`) on the host's seat and logs self, other and the result at the
first cloak proc before any counted hit: 1 means vanilla burns strangers, a limit to declare, 0 means the rule matches;
no new notice reaches a seat, the StartCombat stays between players.

## Dynamic plan (fill when any tag above is still HYPOTHESIS)

2026-10-28, the fragment gate (playtest 37, Eli: "if i ask 'what do you have
for sale' the trading menue is opened for both people"; the re-analyst's
read A in docs/research/m3/re-puppet-head-lips.md): a relayed line a puppet
says on a watcher seat runs its info's script fragments there too, since the
engine's one sender of the TESTopicInfoEvent, DialogueItem::SendTopicInfoEvent
(Address Library 35225), tests nothing per seat: the BEGIN leaves 39643
inside our sayTopicInfo, the END leaves UpdateSoundCallBack inside our voice
pair, both to 25616 and SkyrimVM's sink 53997, which calls the info's begin
or end fragment. Built on fork m3-face-twelve 4e643c1c as a Gum replacement
of 35225: a puppet speaker (Puppets::Is) whose high process is not
talkingToPC (HighProcessData.h:341) sends no event, logged once a minute per
speaker ("fragment gate: info X type Y on puppet Z not sent to the VM"); the
host's own NPCs are not puppets there and keep every fragment; a claimant's
partner is promoted first, so it is not a puppet either. Rung: the
fragment's effect is the host's seat's (R2 recorded through its own
consequences: a barter, a stage); the watcher suppresses. H-57a (the gate
stops the menu on the watcher) and H-57b (the host's own menu and fragments
are untouched) CONFIRMED at T4, 2026-10-28 18:02 PDT, Eli's shop test on
ed606faf's predecessor dist (2ce8b523): the inn's host opened Orgnar's shop,
the watcher's screen got no barter menu (playtest 37, finding 40; the formal
read stays the Frida plan). The same test found the claimant's promoted
vendor offering no vendor topic at all (finding 40 b; the read in
docs/research/m3/re-claimed-vendor-topic.md, npc-talk's item). Frida plan (lab/frida, the npc-puppet.js shape):
hook 35225 (rcx the item: [[rcx+0x20]+0x14] the info's formID, [[rcx+0x38]+0x14]
the speaker's; edx the type; a backtrace), 25616 (rcx info, edx type, r8 the
handle pointer, r9b force) and 53997 (rdx the event: [+8] speaker, [+0x10]
formID, [+0x14] type) on the watcher; c1 hosts a merchant and asks its wares,
c2 watches. Expected on c2 with the gate: 35225 entered twice per line (type
0 from 39643 inside the say task, type 1 from 37544 inside DriveVoice), no
25616 and no 53997 after either, the BarterMenu shut. Falsified by a 53997 on
c2 with no 35225 before it (another sender; gate at 25616) or by the menu
opening with no 53997 at all. Probe x-npc-vendor by path: the same two
seats, claims c2.state.menuOpen("BarterMenu") false after the host's ask,
c1's true, c2's log-count of the gate line >= 1.

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
  REVISED at slice 2's build (2026-10-26 03:49 PDT): no epoch on the wire.
  The client cannot name a persistent reference's cell (getParentCell is the
  worldspace's persistent cell, b-npc-puppet 20261022-081631's lesson, the
  reason isMine stopped asking the cell), so the epoch it would send for a
  resident is a guess, and a guessed field is a dead field (rule 4's test).
  The server's host table already refuses a sender that is not the actor's
  host (ActorUpdatableBy), and a stale state from a released grant cannot
  outlive the grace between a release and a regrant to the same host;
  npc-handoff's keyframe is the first state after a grant, which the server
  can mark by its own table. ADR-035 point 5's "with the epoch" is met by
  the server's number, not the client's word. Eli's letter restores the
  field (it would need a per-actor epoch sent with the word).
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

### Slice 1 as built (2026-10-26 03:08 PDT, fork m3-npc-stream c2129b4a off parity aaafffe5)

The hook on the engine's one action entry (FridaHooks.cpp,
ActorMediator::PerformAction 38949) admits, beside the player, every actor
in a hosted set (Hosted.h beside Puppets.h: a mutex-guarded set written on
the JS thread by the export setHosted, read on the game thread; isHosted
beside it) and reports the action under the source's own id: actionPerformed
gains actorId, its actor null for an NPC (no form lookup on the event's
thread, PuppetApi.cpp's reason), its variables from the source's own master
behaviour graph. The replay's entry is the mediator's second one (38953,
MagicApi.cpp PerformActionOnActor), which the hook does not watch, so a
puppet's replay reports nothing back.

The "each event once" rule is not a name list. The hook marks the actor in
flight from the entry to the leave (Hosted::BeginPerforming, a depth per id
for the mediator's paired re-entry; the export isPerformingAction), and the
relay's source (sync/animation.ts AnimationSource) reads the mark inside the
sendAnimationEvent hook, where the game thread waits (Hook.cpp's
PushAndWait), and drops the event: inside a hosted actor's own PerformAction,
every event the engine sends its graph is the action's and travels as the
action. The player keeps the hand-cast name rule of cast-action (its melee
and voice events feed the server's AnimationSystem; not this verb's). Rule
9: the source's hook is pre-matched in native to its one id, and a source
whose actor left the hosted list goes with its hook (sendInputsService).

ActionSyncService sends a hosted actor's every action as UpdateAction under
its remote id (the message built in the event's context, the id mapped on
the update), the movement controller's actions aside (moveStart, the turns:
a puppet's legs are the fed Speed and Direction channels, npc-puppet.md, and
a replayed moveStop would idle its graph against the fed speed).
HostService.markHosted mirrors the word per actor into the set at every flip
(PuppetService: ensureLive true; ensurePuppet, demoteOnLoss and a cell
detach false), off under the `npcStream` setting (the hosted set stays
empty, the hook reports the player alone: today's stream). The server's gate
is ActorUpdatableBy's as it stood (the host of the actor's cell); the relay
the bytes as they came, reliable, to every listener but the sender.
CellHostTest's new case: the host's UpdateAction for its actor reaches the
other game once and never the host, the other game's is dropped, the
player's own as before. No wire change (no widening): UpdateAction 44 as
cast-action defined it, check_update_action unchanged.

On the puppet side formView.replayActions already ran for every view this
game does not host; the cast handshake inside it (the want variable's edge,
the graph's BeginCast answer, the sheathed caster's drop of the later cast
actions, the Equipped exit's want reset) is now gated to the hands' events
(isHandCastEvent), so an idle or an attack goes variables then action with
no wait (castHandsOf answered "right hand" for any name, so attackStart
would have waited four updates on an answer the graph never gives). The
attack event an action sends on a puppet whose default animations are
blanked (sync/animation.ts's attack blank, the figures' guard) is admitted
once ahead of the performAction (allowAnimationOnce), as a relayed attack
event is.

Budgets: the validator's action_budget was 12 then 6 a second, sized for one
player (wire-validate lib.rs); slice 2 re-derives it for a host (48 then
16, UNMEASURED from P1's rate). A host's action stream carries the graph's
variable arrays with every action (hundreds of bytes, reliable); P3's
numbers size both in slice 4, and x-npc-stream-p4 reads the volume (the
host's action lines over its window).

Tagged for the lab, since CONFIRMED: H1 by P1 101422 (the mark covers 1234
of 1236 events); H2, H2a and H3 by P4 v2 172720 (six attacks through the
entry, taken 1, none refused, no 'block anim attack'); H4 held by its named
read (the tracks' ends within 256 units, 172720), the one-frame depth
unmeasured and accepted:
- H1 (each event once): the mark covers every graph event an action sends;
  an event of the same name sent outside a PerformAction (the engine's own
  stagger, a furniture exit) stays on the relay by design. P1 reads the
  coverage (the notify rows tagged inPerform for NPC sources).
- H2 (the puppet performs): a puppet's graph (AI off, the detours feeding
  it) takes an action through the second entry: "performAction on <id>:
  ... taken 1" on the puppet seat. P4.
- H2a: the attack family (attackStart, the power attacks, bowAttackStart,
  attackRelease) comes through the entry for an NPC at all; P1's start-combat
  rows decide. If the AI's attacks bypass the mediator, the attack family is
  the re-analyst's read (Q3's clause), not a guess.
- H3 (the allow's key): the engine sends on the puppet the event the host's
  hook reported (performAction passes the event as given); a mismatch shows
  as "block anim attack..." on the puppet seat. P4.
- H4 (the variables): a hosted NPC's master behaviour variables applied to
  the puppet one update before each action (cast-action's shape) do not
  fight the fed locomotion channels past one frame. P4's tracks.

Probes by path (lab/.cache/probes): x-npc-stream-p1 (solo, today's client:
action-trace.js with SOURCES all and EVENTS all over Riverwood at 8:00 and
Sven's start-combat; the inventory of what NPCs perform through the entry,
no claim) and x-npc-stream-p4 (two seats on this slice's build:
b-npc-puppet's layout; the hosted set fed at the grant, a resident's action
streamed, the puppet's replay taken, Sven's attack on both seats' graphs
through the watch's IsAttacking, no blocked attack event on the puppet, no
refused report, the tracks' ends within 256 units). Probes are numidium's
to run; the two-seat one needs verb-stage of m3-npc-stream.

P1's read (x-npc-stream-p1 20261026-101422, solo c1 on today's client,
Riverwood at 8:00, 122 s of trace; numidium's run): the entry is called
for seventeen NPCs, 3547 times; 1533 of those are the engine's dry runs
(flags bit 0 set, the hook skips them), 3057 return false, 490 are taken.
Every taken action for an NPC is one of: the movement controller's (index
14 turnStop, 15 TurnLeft, 16 TurnRight, 17 moveStop, 18 moveStart: 290 of
the 490, which the stream drops by name), the idle action (index 68) with
CyclicFreeze or CyclicCrossBlend (81, dropped by name too), or the idle
action with a package idle or a canned turn (IdlePickup_Ground 26, the
NPC_TurnToWalk and cannedTurn family about 60, IdleStop 7,
IdleWoodPickUpEnter 4, IdleChairExitStart 4, IdleWoodChopStart,
IdleMillLoadStart, IdleActivateDoor, WeapEquip, Unequip, and so on: about
120, the stream's whole volume, under one action a second for the village).
Of 1236 graph events sent to the seventeen NPCs' graphs, 1234 came inside a
PerformAction and 2 outside (StartIdleAnimationDriven once, MillLogChuteCut
once); no event name appeared both inside and outside. H1 reads CONFIRMED
in the lab's sense: the mark covers every event an action sends, and for an
NPC the relay's remaining share is two events in two minutes. Nothing
called the second entry in two minutes of vanilla (the replay's entry is the
replay's alone). H2a stayed unread: start-combat on Sven 0x13491 (the bard)
drew his weapon and sheathed it within the window and he never swung, so no
attack-family row exists; P4's fight is a placed bandit (0x1bcd8 at Sven
through the server), the host's own server-made actor, whose attacks go
through its host's entry.

### Slice 2 as built (2026-10-26 03:49 PDT, fork m3-npc-stream 42af75b7 on c2129b4a)

HostedActorState, MsgType 53, wire id 61, C2S, 64 bytes, in the same commit
as its validator and its two fixtures (wire-schema skymp.rs; wire-validate
check_hosted_state: each percentage a number within 0 and 1, idx below
u32::MAX; the budget hosted_state_budget 128 then 32 a second, UNMEASURED;
the proptest hosted_state_never_panics; wire-json's family list and
53-HostedActorState-0/1.json; the C++ HostedActorStateMessage, its
PacketParser case and REGISTER_MESSAGE). Fields: idx, health, magicka,
stamina, combatTarget, package; no epoch (Q1 revised above). The M0 row 5
renamed ReservedHostedActor and ReservedHostedActorState, dead, the id kept
(Q6; the transport's channel default and the validator's old arm follow the
rename). SCHEMA_VERSION stays 17: the family's messages 46 to 52 bumped
nothing, an appended message needs no lockout (ADR-012).

The rule is Rust's (ADR-010, cell-host's shape): wire-rules hosted_state,
facts per value {reported, recorded, held (the attributes hold table's
answer), lowered_ago_ms (the server's last lowering of the value by its own
number)}, alive, one_point; verdict per value {record, changed, dropped},
floored, dead. A report that would undo a value the server lowered within
10 s (LOWERED_HOLD_MS, attributes.rs's own window) or raised and not yet
reported is dropped; an equal one (within 1/1024, the core's IsNearlyEqual)
changes nothing; a health under one point on a living record is floored
(god-mode's TIM number) until ADR-050's deaths-by-the-engine train; a dead or
respawning record drops the report whole. Six T0 cases in the module, one
in the bridge. The core (ActionListener::OnHostedActorState) gathers:
GetActorValues, TakeReportedPercentage per value (the hold's answer; the
call that reaches a held value ends the hold, the players' path),
GetLastHitTakenTime as the health's last lowering (magicka and stamina have
no server lowering path for an NPC today), IsDead and IsRespawning,
GetMaximumValues for the point; refuses the sender's own idx (E_STATE_OWN,
one warn a minute per player; a player's values go as ChangeValues with the
regeneration crop) and the gate's refusals as ActorUpdatableBy logs them;
writes the changed values as judged (MpActor::SetJudgedPercentages: the
change form and the attributes stamp, no Kill, no respawn check); records
the target and the package (SetHostedState, memory); sends ChangeValues
{idx, the changed values} reliable to every listener with a user but the
host (UpdateHoster's loop); logs one info line a minute per actor with the
counts, the first state at once. OnUpdateAnimation keeps a hosted actor's
last event (a later subscriber's CreateActor carries it). CellHostTest's new
case walks the whole: the host's state to the record and the other game
alone, the non-host's dropped, the own idx refused, an equal report sends
nothing, a 0 floored, the JSON path once, the hit hold, the last animation
kept for the host's report and not the other game's.

The client (skymp5-client): HostedStateService (the doc's sendHostedState
and PackageService in one), DeathReportService's poll shape: every 500 ms
per hosted actor (hostedActorRemoteIds), the three percentages clamped to 0
to 1 (0 for a dead actor), the combat target through localIdToRemoteId, the
package from the last packageStart or packageChange event for the actor (no
native reads it; the events have no native filter, rule 9's cost accepted at
their rate; H3's read is the Inventory's package row's),
sent on a change (half a point, or the target or the package) as
HostedActorState under the actor's remote id, the first for an actor
reliable; under the npcStream switch. sendActorValuePercentage is the
player's alone now (it read the player's values for every hosted target and
sent them under the target's id; the server wrote them to the sender's own
actor, so nothing showed). The receiving side stands: onChangeValuesMessage
applies the record's values to a puppet (the host never hears them).

Counters by MsgType (the doc's labState kind `stream`) are owed to slice 4
with the property binding they need; the probe reads the server's info line
and server.ref(id).healthPercentage meanwhile. The action budget is
re-derived for a host: 48 then 16 a second, UNMEASURED from P1's rate (490
taken actions in 122 s for seventeen NPCs before the movement filter; a
fight's burst on top); P3 replaces it. (The "no rate budget exists on
UpdateAction" sentence under slice 1 was wrong: the validator's action_budget
was 12 then 6, sized for one player.)

Probe by path x-npc-stream-p5 (two seats, b-npc-puppet's layout, after P4):
the record follows the host's engine (abs(server.ref(id).healthPercentage -
c1.npc_state(id).healthPercentage) < 0.02 after a numbered hit and after the
host's regeneration), the puppet's health follows the record within 0.05,
the first state line in the server log at the grant, no E_STATE_OWN, the
non-host's puppets report nothing (no "state ... by c2's id" line).

### Slice 3 as built (2026-10-26 04:13 PDT, fork m3-npc-stream 2673d1ab on 42af75b7)

The record's hands are what the hit path judges a hosted actor's swing
against (E_HIT_WEAPON: playtest 34's two bandits, every swing dropped, the
host's player unhurt), so the host streams what its actor wears. No wire
change: UpdateEquipment 5 under the actor's idx, as cast-action's actions
and the state go. The core (ActionListener::OnUpdateEquipment) resolves an
idx that is not the sender's own through ActorUpdatableBy (the host gate)
and writes the actor's record, where before it resolved every idx to the
sender's own actor (cell-host's latent corruption, now closed); for a hosted
actor it checks the WORN entries alone against the actor's own inventory
(its engine's whole inventory is npc-fate's record, not this message's), the
spells by IsSpellLearned (the base's included; templates a known gap), the
armor slot rule as it stands; a refusal drops the report with one warn a
minute per actor (E_EQUIP_REFUSED) and sends the host nothing (Rule A;
SetInventory has no idx and would replace the host player's own inventory,
a snippet on an NPC runs nowhere); an accepted report logs an info line
(the hands, the spells, numChanges). The player's path is byte for byte as
it was. CellHostTest's case: the host's worn sword into the actor's record
and to the other game alone with the host player's record untouched, the
non-host's dropped, an item the record lacks refused with no SetInventory
and no snippet to the host. wire-json pins the shape: an entry's count is
u32, the -1 of 2026-10-22's log is refused at recognize.

The client reads the hands in HostedStateService's poll (getEquippedObject
1 and 0, two calls per hosted actor per half second) and, on a change or at
the first poll for the actor, sends what the actor wears: the 32 biped
slots through getWornForm and the hands, worn flags set (wornLeft the left
hand), the hands' spells, numChanges counting up from the record's own. A
poll, not the equip events: whether the engine raises them for an AI's
equip is unread (H4) and a cell's attach would raise one per resident's
outfit at once. On the puppet seat an engine-dressed puppet (a game-file
actor under the fate switch) keeps its outfit and follows the record's
HANDS alone (sync/equipment.ts applyHands: the worn WEAP into the right
hand, the wornLeft entry into the left, each changed only when it differs
from what the puppet holds, the item added when the engine's roll lacks it,
the hands' spells as a figure's); the copies' apply stands.

H6, the puppet's hands follow a hosted actor's draw: CONFIRMED (P6 v3
20261026-222815: c1's and c2's worn lists equal server.ref(0x13491).worn);
H7, a game-file actor's worn items are present in the server's record under
the fate pin: CONFIRMED (173133: 29 equipment lines, no refusal naming a
resident); the template spells gap (an NPC mage whose spell list is a
template's was refused and logged) closed by 53's known set through the
template chain (x-npc-caster 032625: zero E_CAST_UNKNOWN, two
E_EQUIP_UNKNOWN_SPELL recorded alone).

Probe by path x-npc-stream-p6 (two seats, P4's layout and bandit): the
equipment line for the residents and the bandit on the server, no
E_EQUIP_REFUSED, no E_HIT_WEAPON, and the bandit's swings landing on the
server (OnWeaponHit lines naming the god-mode host player). A lab-api row
for the record's worn list (server.ref(id).worn from mp.get(id,
"equipment")) is asked of numidium for the next probe.

### Slice 4: the voice line is BLOCKED on an engine read (rule 8); the rest waits on the stage

Read on 2026-10-26 04:2x PDT (a read-only agent over the fork, CommonLibSSE-NG
at the pin and the docs; FACT unless tagged): Skyrim Platform raises no event
for a spoken line (Definitions.txt has menuOpen, sceneAction and the package
events; none names a speaker and a topic info), and no native plays a given
TopicInfo (ObjectReference.say takes a Topic, whose info the engine picks
again by conditions, random and say-once among them; Topic has add alone,
TopicInfo getOwningQuest alone). CommonLibSSE-NG at this pin forward-declares
TESTopicInfoEvent (ScriptEventSourceHolder.h:54, the source at +0x0EC8,
:108; SkyrimVM's sink at +0x0140, SkyrimVM.h:126) and has no header for its
fields, so the layout other forks carry (speaker, topic info, a stage) is
CONFIRMED: the sink built on the layout (static_assert 0x18) delivered 51
lines with speaker, info and topic, P7 v5 20261027-083204. The engine's
pieces are named: TESTopicInfo's
ResponseData (sound, text, speakerIdle, TESTopicInfo.h:73-115) and
GetDialogueData(Actor*) building a DialogueItem {quest, topic, info,
speaker} (src/RE/T/TESTopicInfo.cpp:24-27), the DialogueResponse's voice
path and soundLip (DialogueItem.h:25-34; the constructor's AE id 35220,
Offsets.h:62-70's trap: CommonLib's SE 34413 is PlaceAreaEffect on AE),
ExtraSayToTopicInfo (type 0x71: the topic, the sound handle, the item),
SubtitleManager (speaker, subtitle), the actor's kSpeakingDone and
kVoiceFileDone bits and QSpeakingDone/SetSpeakingDone (Actor.h:164, :167,
:461-462). The puppet's side: re-ai-puppet.md:226-240 reads the dialogue
voice timer (37752) as running inside the AI update alone, so a line started
on an AI-off puppet may never end ("expect the line it was
speaking to hang", :376), and the say path's gating by the AI bit is the
reason a puppet is silent at all (npc-puppet.md:102, the voice row carried
here). TES3MP streams speech as part of the actor's state and the receiver
plays the voice (tes3mp.md:53, :81; with AI off the remote actor speaks from
the packet alone, :104-107); Skyrim Together's owner sends "speech"
(te-npcs.md:101-102) and hooks Actor::SpeakSoundFunction 37542 (TE-MAP.md:33,
a lead, rule 1). The lab reads nothing of speech today: dump-state lists the
Dialogue Menu among the open menus, npc-state has no speech field, no Frida
script traces 37752, 39333, 37542 or 52626; a probe could claim a puppet
spoke only through a log line the replay prints and a subtitle in a
screenshot.

The Dynamic plan (rule 8; the re-analyst's static read first, launched
04:27 PDT on sky-re through REA):
- R1: TESTopicInfoEvent's layout on 1.6.1170 and the paths that dispatch it
  (the xrefs of the source at the holder's +0x0EC8): a package bark, idle
  chatter and a combat grunt dispatch it, or scripted infos alone. Decides
  whether a sink in the fork's Skyrim Platform (the AppendSinkScriptEvent
  idiom, Events.h's own struct as TESSceneActionEvent has) observes every
  line a hosted NPC speaks. Lab confirmation: a Frida hook on the dispatch
  helper (or the new sink's log line) on a solo seat in Riverwood at 8:00
  for 120 s beside action-trace.js's rows: the lines spoken by the residents
  (subtitles on in the seat's settings, screenshots at 10 s), each matched
  to an event row with its speaker and info, none missing.
- R2: Actor::SpeakSoundFunction 37542: its prototype (a TopicInfo, a
  DialogueItem, a response index, a sound path), what it writes (the sound
  handle, the subtitle, ExtraSayToTopicInfo) and whether it needs the AI
  update (kProcessMe, 37347) to run or to end. Decides whether the puppet
  says the host's line through it (the info id, not the topic: Say re-picks)
  or through the cheapest playback (R4). Lab confirmation: a Frida hook on
  37542 on the host seat logging its arguments at every call during the
  same 120 s; then the puppet seat's call of the same function with the
  same arguments through a lab-only export, the subtitle and the voice on
  the puppet seat, and kSpeakingDone read 10 s later (hung or done).
- R3: Papyrus Say's path: where the info is picked from the topic, so the
  message carries what the engine needs (the info's form id, its quest).
- R4: the fallback playback without the dialogue system: BSAudioManager::
  BuildSoundDataFromFile (BSAudioManager.h:27) with the response's voice
  path, BSSoundHandle::SetObjectToFollow and Play (BSSoundHandle.h:43, :47),
  SubtitleManager::ShowSubtitle (52626, TE-MAP.md:34) for the text: their
  prototypes; no lip sync and no speaker idle this way (the puppet's mouth
  stays shut: a player-visible gap, said in the checklist if this is the
  shape).
The re-analyst's static read (REA on sky-re, 2026-10-26 04:27 to 05:02
PDT; every id and offset below is a tool read of 1.6.1170, none from memory;
the names beyond CommonLib's are the re-analyst's labels on `just addr` ids,
the prototypes CONFIRMED-STATIC and the roles CONFIRMED by P7 v5 083204:
SayTopic 39162 started 45 of 47 asks, the pair 37752 and slot 0x40 ended all
45, ClearGreetTopic 39334 cleared the 2 inaudible):
- R1 CONFIRMED-STATIC: TESTopicInfoEvent is 0x18 bytes: +0x00 a refcounted
  callback pointer (null for barks), +0x08 NiPointer<TESObjectREFR> the
  speaker, +0x10 the topic info's form id, +0x14 a u32 type (0 begin, 1
  end); dispatched by 25616 (the only writer of the holder's +0xEC8 source
  that also takes the holder's singleton 14298), consumed by SkyrimVM's
  ProcessEvent 53997 (slot 1 of AE 217135) which reads exactly those four
  fields. Nine callers: 19518 (a reference's say-topic), 35225 (the
  DialogueItem-level sender), 35282, 35283, 35284, 35294 (the player's menu
  begin and end), 37543 (an actor's say-topic), 37544 (the sound-done
  callback, the END), 37741 (PauseCurrentDialogue). Barks reach it: 39333
  (say by subtype) to 32493 (the item chooser) to 39642 to 39643, which
  starts the sound and sends BEGIN through 35225; scene lines too (44673).
  Combat grunts, pain and shout audio are not topic infos and never pass
  here. So a sink in the fork's Skyrim Platform sees every spoken LINE
  (hellos, idle chatter, scenes, scripted infos) with its speaker and
  info; the grunts stay the graph's.
- R2 CONFIRMED-STATIC on the prototype, CONFIRMED on the puppet (45 of 47
  asks started on c2's puppets, residents included, 083204): Actor::
  SpeakSoundFunction 37542 is `float (Actor*, const char* voicePath,
  BSSoundHandle* out, EmotionType, u32 percent, int textLength,
  TESIdleForm* speakerIdle, TESIdleForm* listenIdle, TESObjectREFR* target,
  bool, BGSSoundOutput*, bool lipFromSound, bool, bool)`, returning the
  speech's seconds (-1 when the menu's +0xB1 is set); it reads no
  kProcessMe: it loads the lip data, plays the talking and listening idles
  through the special-idle setup, builds the sound from "sound\" plus the
  path (67664, flags 0x10 | 0x80 for an NPC), follows the head node
  (67636), starts it (67617) and stores the handle. What ENDS a line is
  outside it: the AI update 37347 returns at its top when kProcessMe is
  clear, before the voice timer (37752) and UpdateSoundCallBack (vtable
  slot 0x40, 37544), and 37544 is what shows the subtitle (state 3 through
  52626), sets the timer from the sound's duration, and at expiry sends
  END and SetSpeakingDone. CONFIRMED in its cure: the pair ended all 45
  started lines (V3, 083204); the untreated hang is the static read's and
  never ships: on a puppet (AI off, high process
  kept) a line started through the engine plays its audio, lip sync and
  idle, shows no subtitle, never ends, never sets kSpeakingDone and leaves
  the process's +0x278 at 3 until the AI returns; the cure is the engine's
  own callback run for the puppet (37752 then slot 0x40 once a frame while
  +0x278 is 3), the shape of npc-puppet's detours (the engine's job, run
  for the actor the AI update skips). Falsified by 37544 entries on a
  puppet with kProcessMe clear.
- R3 CONFIRMED-STATIC: Papyrus Say is 56220 ("cannot speak a None topic
  info"), registered at 56246 with three parameters; a living actor's
  normal case goes 39162 to 39642 to 39643 to 39772 to 37542, the bark
  chain itself; the info is picked by 25541 to 25544 (the condition walk,
  random and say-once) only when the caller gives none: 39642 forwards its
  own info argument into 25541, and 39333 passes the info 32493 chose. So
  "say the host's line" on the puppet is 39162 or 39642 with the host's
  topic and info ids (a new native, the engine's own bookkeeping and the
  BEGIN event), or a DialogueItem (35220) handed to 20206 or 20207 then
  19518; Say itself re-picks and may differ.
- R4 CONFIRMED-STATIC: BuildSoundDataFromFile is `(BSSoundHandle&, const
  BSResource::ID&, u32 flags, u32 priority)` as BSAudioManager.h:27 has it;
  SubtitleManager::ShowSubtitle 52626 is `(SubtitleManager*, TESObjectREFR*
  speaker, const char* text, bool force)`, dropped unless the speaker is
  not the player and bGeneralSubtitles or bDialogueSubtitles (383199,
  383202) is on; 52627 removes a speaker's line. A pure playback without
  the dialogue system (67664, 67624, 67636, 67616, 52626, later 52627) has
  no lip sync and no talking idle: the puppet's mouth stays shut (R2's path
  is the one to build).
- Unanswered statically (the lab's): whether anything but the AI update
  drives slot 0x40 (a backtrace on 37544 over a minute of play answers
  it); what HighProcessData+0x3B8 holds (39369 gates a bark's BEGIN on
  it); what the TopicResultCallBack does at completion.

The second static read (REA, 05:0x to 05:4x PDT; asm read for 39162,
37752 and 37544, CONFIRMED-STATIC): SayTopic 39162 is `bool (AIProcess*,
Actor* speaker, TESTopic*, TESTopicInfo* info, bool unused, bool flag6,
bool flag7, bool keepExtra)`, Papyrus Say's call being (process, actor,
topic, 0, 0, 0, 1, 1); the info argument reaches the item picker 25541,
which skips the condition walk when it is given, and the topic must be the
info's parent (a null topic replays the greet topic); 39642 refuses (returns
1, says nothing) while the previous line has not ended (37266: the done
bits 0x180 and the voice timer) or the process's dialogue state (+0x3B8)
forbids, and touches no package, no AI evaluation, only the head track
toward a target. The voice timer 37752 is `void (Actor*, bool force)`,
needing nothing from the AI frame (it reads the main loop's seconds since
the last frame); UpdateSoundCallBack (slot 0x40, CommonLib Actor.h:287)
takes a dead bool and runs a state machine on the actor's soundCallBackSet
(+0x278 on this build; CommonLib's runtime data relocated +8): 3 arms the
timer from the sound's duration and shows the subtitle, 1 or 2 at the
timer's expiry send the END, drop the subtitle and set the done bits
(kSpeakingDone is set only for a line to the player: not a puppet
discriminator; the state byte and the timer are). The pair `37752(actor,
false); actor->UpdateSoundCallBack(false)` once a frame reproduces the AI
update's exactly. 25616 marks the info said-once on both BEGIN and END
(V4 CONFIRMED: nothing refused twice, 083204). Unread: the
done bits' initial value on a fresh actor (if clear, the first say refuses
and the native must set 0x180 first), the dialogue state's type field.

### The voice slice as built (2026-10-26 05:33 PDT, fork branch m3-npc-voice 82ffd53a off 2673d1ab, its own worktree; CI next)

On the host, a Skyrim Platform sink on TESTopicInfoEvent (the struct in
game/Events.h with the read's layout and a static_assert on its 0x18
bytes; AppendSinkScriptEvent's idiom), filtered in native to the begin
(type 0) and a speaker in the hosted set (rule 9), reads the info's parent
topic on the dispatching thread and raises `topicInfo {speakerId,
topicInfo, topic}` as a tick task (no game call in its handler). The client
(VoiceService) sends ActorSpeech, MsgType 54, wire id 62, `{idx, topic,
info}`, unreliable, under the actor's remote id, in the same commit as its
validator (idx below u32::MAX, a topic and an info that are forms; the
budget speech_budget 32 then 8 a second, UNMEASURED; the proptest), its two
fixtures and the C++ message, parser case and registration. The server
(OnActorSpeech) refuses the sender's own idx (E_SPEECH_OWN), takes
ActorUpdatableBy's gate and relays the bytes unreliable to every listener
with a user but the host; records nothing; one info line a minute per actor
with the counts (CellHostTest's case: the host's line to the other game
once and never back, the non-host's and the own idx dropped). On the puppet
seat VoiceService maps the idx to the form, refuses an actor this game
hosts (Rule A), a figure or a dead actor, and asks the native
sayTopicInfo(actorId, infoId): on the game thread it calls SayTopic
(Offsets::Voice::SayTopic) with the info and its parent topic in Say's
shape, logs the done bits, the timer and the state byte before and the
state after, and answers 1 when the state read 3 (the line started) or 2
(refused); the puppet detour (PuppetHooks.cpp DriveVoice, in the animation
queue's per-frame loop on the game thread) runs the engine's own pair for a
puppet whose state byte is 3, 1 or 2 or whose timer counts, and logs "line
on <id> ended" at the 1-or-2 transition. The lines' audio, lip sync,
talking idle and subtitle are the engine's; nothing else of the dialogue
system is touched.

P7's four, V1 to V4 CONFIRMED by P7 v5 20261027-083204 (51 lines sunk with
speaker, info and topic; 45 of 47 asks started on c2's puppets, residents
included; 45 'line ended', none open; nothing refused twice): V1 the sink
sees every line a hosted resident begins (barks and greetings; the read says
the bark chain dispatches); V2 the puppet's say starts (the native answers
1; if 2 on every try, the done bits' initial value is the first suspect and
v2 sets 0x180 when the timer is at or under 0 and no handle is live); V3 the
pair ends the line (the "line ended" line and the subtitle's removal); V4
the said-once mark on the puppet seat changes nothing visible. P7 by path,
two seats, b-npc-puppet's layout: over 90 s at 8:00 with c1 among the
residents, c1's console log has "speech 1348x" lines (V1), c2's "say 1348x
info ... -> started" (V2) and c2's Skyrim Platform log "line on 1348x ended"
(V3), the server's "speech ... by ff000000" lines and no E_SPEECH_OWN;
screenshots on c2 for a subtitle (the seats' subtitle switches are the
INI's, unread). Then the engine-side solo read (a Frida hook on 25616, 53997
and 35225 beside the sink's log) if V1 misses lines.

The rest of slice 4 waits on the stage's reads: P3's numbers (the stream's
cost, the hosted_state_budget and action_budget replacing their UNMEASURED
placeholders), b-npc-stream promoted from the green probes in its own
commit (rule 13), the parity scenario p-npc-stream and the reference trace
(ADR-050 decision 5), the labState `stream` counters with their lab-api
row, the sequence table's result column (ADR-033).

### The first stage's read and slice 1 v2 (2026-10-26 09:09 PDT, fork a0ff0e72)

The stage of 2673d1ab (verb-stage 08:09 to 08:31 PDT, T2 GREEN at 15:58Z)
ran P4, P5 and P6 and all three ended E_RUN_GAME_LOST for c2, the puppet
seat, within seconds of the host's stream reaching its puppets
(20261026-151921, -152304, -152837): access violations in the graph update
under the animation job the puppet detour queues (41453 in P5's stack), a
ChickenProject graph on P5's stack, a HighlandCowProject on P6's, a
grindstone's BlacksmithSharpeningWheelAnimatingProject on P4's,
OpenAnimationReplacer in the frames. The bisect x-npc-stream-p4-off
(160318: P4's layout with the host's npcStream false) ran clean, and in
it c2 itself hosted the lab spawn's NPCs and streamed their state and
equipment without harm: the host side of slices 2 and 3 holds, the fault
was the puppet-side apply.

The cause in our code (read, not inferred): AnimationGraphMasterBehaviour-
Descriptor reads and writes a graph's variables at the humanoid master
behaviour's FIXED indexes (AnimationVariablesForMasterBehavior.h,
AnimVariableMasterGraphIndexes::CreateDefault) with no check of the graph's
project or of the variable set's size; every figure's graph was the
master's, and cast-action never met another. A hosted chicken's or cow's
graph is another project, so the host captured garbage for it and the
puppet seat wrote the master's indexes into the creature's variable set,
which the next graph update died on. (The paragraph as first written
blamed the third crash on a furniture idle performed through the entry;
the re-analyst's read below corrects it: one cause, three victims.)

The re-analyst's read of the three frames (REA on sky-re, 09:0x to 09:2x
PDT; CONFIRMED-STATIC unless marked): P4 and P5 fault in
hkbClipGenerator's animation-duration read (59263, OpenAnimationReplacer's
own name for it) on a clip control whose binding pointer is not null but
garbage (P4 0x1C5_3FA4E600, P5 0x257_BFA11955), P6 in hkbStateMachine's
transition collector (59380) on a transition whose toStateId no longer
maps (states[-1], rcx 0x1_00000000). Split into dwords, every corrupted
pointer is two adjacent 4-byte words holding a small int and a plausible
float (453 and 1.288; 599 and -1.259; 1 and 0): the footprint of a
4-byte-strided out-of-bounds write of variable values (CONFIRMED by its
fix: v2 a0ff0e72 bounded the write; the v2 and v3 stages ran with no crash
log, 172720, 163259, 173133). The descriptor wrote 301 fixed
master indices (14 ints, 19 floats, 268 booleans, the highest 300) into
`variableValueSet->varSet[index]` with no check of the set's size, where
the engine's own by-name getter and setter (63614, 63608, through 63851)
refuse an index at or past the size. Into a creature's much smaller set
the write lands up to 1200 bytes past the array, into whatever Havok
allocated next: the cow's own transition data (P6, the cow's canned turn
cannedTurnLeft180, ActionIdle 0x13002, on Cow 0x60B22), a neighbour's clip
controls (P5 the chicken's; P4 the grindstone's: the grindstone is a
furniture graph updated on a job thread, a VICTIM of a puppet's write, not
an idle's subject). The chains by id: P5 the puppet detour's animation job
41453 to the actor's animation update 20123 to the graph manager's update
63358 to the graph's update 63587 to its far-LOD trigger walk 63864 to the
duration read; P4 the same manager update into hkbBehaviorGraph::Update
58329 with OpenAnimationReplacer's looping-clip pre-update one call ahead
of the engine's; P6 the replay's second entry 38953 to ActionIdle's handler
43567 to NotifyAnimationGraph 32901 to the manager's send 63362 to the
graph's send 63591 to the behaviour graph's handleEvent 58330 and 58377 to
the state machine's 59336, 59385, 59386, 59381 and the fault. Nothing in
the chains dereferences a furniture or a target; EquipItemEx owns no Havok
memory; ChangeValues touches none. One cause, then: the variable write
into a graph that is not the master behaviour's. Unread statically: the
creature projects' word counts (below 301 by the signature), the humanoid
project names (data, not strings in the image: v2's log line reads them).

v2 (a0ff0e72): the descriptor admits a graph only when its project is
DefaultMale or DefaultFemale (the two names CONFIRMED by the gate's log line
and the residents' stream on the v2 and v3 stages: 163259 and 162926
'ChickenProject (variable set of 47) is not the master behaviour', 172720
Chicken, Dog, Hare and HighlandCow refused and the residents' 142 action
lines streamed; a wrong pair would have streamed nothing and said so) and
every index lies inside the variable set; the hook
reports and marks a hosted actor only when its variables were captured, so
a creature is not in the stream and its events ride the relay as before;
on the puppet side the engine's entry performs the hands' casts and the
attack family alone (the figures' proven path on humanoid graphs; the
attacks H2a's test), and every other action (a package idle, a canned
turn, a draw, an activate) is sent to the puppet's graph as its event, the
relay's proven path, with no variables and no retries: a scoping by the
proven paths, not the crash's fix (the fix is the descriptor's gate; the
read above found no entry-side cause). Two bisect switches
for the next stage, read from c2's settings file, on by default:
npcStreamActions (false drops an NPC puppet's queue unplayed) and
npcStreamHands (false skips the hands' apply). The voice branch takes v2 by
merge (fba05393). The re-analyst's read of the three crashes' frames
(59263+0x10, 59380+0xFB, the graph update chain) is running and lands in
the Dynamic plan when it comes; the lab's next read is P4 to P6 on v2's
stage (started 09:1x PDT).

### The second stage's read (v2 a0ff0e72, 09:10 to 09:39 PDT; the verdicts and the next claims, 10:09 PDT)

NO CRASHES: c2 survived P4, P5 and P6 with no crash log, and T2 is GREEN
at 17:05Z. The descriptor's gate did its work and said so: c2's log has
"graph project 'ChickenProject' (variable set of 47) is not the master
behaviour: no variables read or written for 1066df or any actor on it",
one line for the whole run (a chicken's set is 47 words against the
master's 301 indices: the out-of-bounds write the first stage died of), and
the residents' actions streamed (c1's 40 action lines for 1348x, 29
setHosted lines at the grant), so the humanoid projects passed the name
check: the two names read CONFIRMED by the residents' stream.
- P5 (20261026-163259) GREEN: the state stream end to end. The record
  follows the host's engine within 0.02 for Sigrid, takes an engine-side
  fall of 40 points on Sven within a poll, the puppet follows the record
  within 0.05, the host's regeneration moves the record up again, no
  E_STATE_OWN, no state from the observer's seat.
- P4 (162926) RED on one claim of v1's shape: "performAction on 1348x
  taken 1" read 0, because since v2 a resident's idles, turns and draws
  play as their events on the puppet and the entry performs the hands' casts
  and the attacks alone (no resident fought); the host's side held (40
  action lines), the earlier claims held. The puppet's event path now says
  its first action per actor once ("npc-stream: first action <event> on
  <id> played as its event", 66f04f2a), and P4 v2 claims that line; the
  entry's proof stays the bandit's attack (its claims stand, unreached in
  v1 since the run stopped at the stale claim).
- P6 (163621) RED on the bandit, not on slice 3: the residents' equipment
  lines held and no refusal named one; the server-made bandit's
  engine-rolled weapon 13911 was refused against a record that never held
  it (E_EQUIP_REFUSED, then E_HIT_WEAPON on its swings), which is playtest
  34's D19 gap (the hosted server-made copy's dress: train-47's once-dress,
  held by Eli's letter; ADR-050 decision 3's one NPC path retires it), and
  the bandit fought the village (target 13489), not the god-mode player, so
  no OnWeaponHit on ff000000 came. P6 v2 claims the residents alone and
  records the bandit's lines for the memo; the hit path's proof moves to
  the probe after D19 or decision 3 lands. The "0 worn, right 0 left 0"
  equipment lines numidium read were the lab spawn's creatures (107cf8 to
  107d07, 1066df the chicken, 1b747), not clothed residents.
The next stage (66f04f2a, the first-event line alone over v2) reruns P4
and P6 with the v2 claims; then the voice branch's stage, the voice branch
having taken the stream's commits by merge.

### The third stage's read: the three slices GREEN at T3 on probes (11:03 PDT)

The v3 stage of 66f04f2a (10:09 to 10:34 PDT, lab-api d0fef6d3): P4 v2
20261026-172720 GREEN (42 steps), P6 v2 20261026-173133 GREEN (27 steps),
T2 GREEN at 18:01Z, no crash log on either seat; with P5 20261026-163259
GREEN on the stage before, every slice has its green run. The numbers from
the runs' logs:
- The hosted actors' actions: 142 action lines from the host in P4's
  window, 6 of them the placed bandit's attacks (five attackStart, one
  attackPowerStartRight); on the puppet seat the same six performed
  through the engine's entry, every one "taken 1", none refused, no
  "block anim attack": H2 (a puppet's graph, AI off, takes an action
  through the entry) and H2a (the attack family comes through the entry
  for an NPC) read CONFIRMED, and H3 (the engine sends on the puppet the
  event the host reported, so the allow's key matches) with them. Ten
  puppets played their first streamed action as its event (the event
  path, the residents' idles and turns). The tracks' ends within 256 units
  held, so the variables' write before an attack did not fight the fed
  locomotion in the window (H4 consistent, not measured in depth).
- The gate's log lines name five refused projects in one run: Chicken (47
  words, two actors), Dog (93), Hare (46), HighlandCow (93); the residents
  streamed, so DefaultMale and DefaultFemale are the master's names
  (CONFIRMED). Every creature rides the relay, as designed.
- The state: 38 state lines by the host in P4's window, none refused, no
  E_STATE_OWN, no "No permission" anywhere (the gates held for every
  message type); P5's claims as recorded above.
- The equipment: 29 equipment lines by the host for the residents and the
  spawn's creatures, no refusal naming a resident (H7, the fate pin and the
  engine's worn items agree, CONFIRMED for the residents); the placed
  bandit's one refusal and one dropped swing (E_EQUIP_REFUSED, E_HIT_WEAPON)
  are D19's gap, recorded. H6 (the puppet's hands follow the record on the
  other seat) was not claimed by these runs (P6 reads the server's side);
  the lab-api row server.ref(id).worn (numidium's, live) let P6 v3 compare
  the record with both seats' npc-state worn lists: CONFIRMED on Step R
  (x-npc-stream-p6 20261026-222815, GREEN, all 34 steps, on the merged
  parity 66f04f2a: c1's and c2's worn lists equal server.ref(0x13491).worn).
- The budgets' first numbers (UNMEASURED placeholders) were never hit:
  no E_VAL_RATE in the server logs across the stage.

Open after the stage: H6 (a worn-list comparison across the seats; CONFIRMED
on Step R, 222815), the
voice slice's V1 to V4 (P7 on the voice stage, running), the counters
(slice 4), the budgets from a measured rate (P3's read of these logs is a
start: 142 actions and 38 states in about 110 s for seventeen actors), the
committed scenarios (promoted from these green runs: b-npc-stream-actions,
b-npc-stream-state, b-npc-stream-equipment, each its own commit, rule 13),
the parity scenario and the reference trace (ADR-050 decision 5).

### The voice stage's read (a7cba312, 11:01 to 11:15 PDT; P7 v1 20261026-181119, 11:26 PDT)

No crash on either seat; T2 on the voice branch running at the read. The
pipeline works end to end for the message: the host's sink raised 26 lines
in the window (the lab spawn's creatures' bark, info 10aa5d on topic
10aa5a, many times from the chicken 1066de, 1066df and the hare 10962a
while c1 still hosted the spawn's cells; one resident's line, 13484 info
6aea9 topic 6aea3, near the end), the server relayed each to the listener
in range (seven "speech ... by ff000000" lines, "to 1 listener" once c2
stood in reach, no E_SPEECH_OWN), and the puppet seat asked its native for
each. V1 (the sink sees a hosted actor's lines) reads CONFIRMED for the
creatures and for one resident; few resident lines fired because c1
teleported between four points instead of walking (greetings need an
approach). V2 split: the engine's say STARTED on every creature puppet
(twenty-five asks, state byte 3 after each, identical pre-state: bits
382021a1, timer -1, state idle) and was REFUSED on the humanoid resident
puppet 13484 with the same pre-state (state idle after): the engine's reason
is unread (the candidates from the static read: the process's dialogue
state at +0x3B8, or the response taking the sound-descriptor path 39771
that never sets the state byte, so the line may have PLAYED unseen by the
native's test). V3 (the pair ends the line) was unread by a logging fault
of mine: the state byte passes 1 and back to idle inside one pair call
(37752 sets 1, UpdateSoundCallBack handles it), so the "line ended" line
printed never; the creatures' twenty-five lines may well have ended. V4
unread.

Voice build v2 (the commit after a7cba312 on m3-npc-voice): the native
logs the say's return value, the process's presence, the sound handle's
validity and the timer after the call, and answers "played" when the
handle is live without the state byte (the sound-descriptor path); the
pair logs "line ended" on the timer's run-out as well as the state's.
P7 v2 claims V1, the relay, a started say and an ended line on ANY puppet
(the creatures are puppets too), and records the resident's say with its
diagnostics for v3's claim. The playtest's D27-B stands: the voice stays
off the playtest's build until P7 is green.

Voice v4 and P7 v5, READ (2026-10-27 01:53 PDT, an agent over run
20261027-083204-x-npc-stream-p7, GREEN on 52's stage, build m3-npc-death
f9859083, voice code 8da16ef6): v3's "deferred" was the audibility gate
(SpeakSoundFunction, before the lip load: a speaker outside the dialogue
output model's range of the seat's listener on an axis), named "inaudible"
since v4 and cleared (result 5, the item cleared, ClearGreetTopic); v5
placed both seats at one resident at a time (c1 at 150 units so the host's
engine greets, c2 at 300, three visits of 45 s). The numbers: c1's sink
captured 51 lines (1066df 11, 10962a 10, 1066de 10, 13484 9, 1e62b 7,
13483 2, 3550c 1, 1348b 1; every line with a topic; 453e9 a scene of
13483 and 13484 in sequence, 6aea3 the greeting); the server's 20
per-speaker summaries covered 41 received and 38 relayed (the first three
"to 0 listener(s)" before c2 stood in Riverwood), no E_SPEECH_* at all;
c2's native took 47 asks, 45 STARTED and 2 inaudible (1348b at 5722 units
and 3550c, both far speakers), 0 deferred, 0 refused, and 45 "line ended",
one per started line, none still open at the log's end; the resident
starts: 13483's 453f3 (delay 2.67, lip 3) and 6aea8, 13484's 6aea9 twice
and 45473 to 45478, so V1 (the sink sees every line), V2 (the engine's say
takes an info on an AI-off humanoid puppet: a resident's, not only a
creature's), V3 (the pair ends the line) and V4 (the said-once mark is
harmless: nothing refused twice) are CONFIRMED. Timing: the sink-to-say
delay is a few tens of milliseconds once the clocks are paired (c2 reads
0.59 s less than c1), with a 45 ms band over 47 lines; the one outlier was
the first relay as c2 landed (about 1.8 s, the arrival's burst). Two "no
actor or info" answers (1e62b 5b1b1, 13484 5b1b5) fell within a second of
c2's teleport settling; the native's "delay" is the engine's estimate, not
the observed length (6aea9 13.40 against 6.8 ended). Odd, not the voice's:
c1's Skyrim Platform log stopped two minutes before its console log (an
unflushed buffer at collection); the master-API manifest fetch fails every
43 s on both seats. The voice rides 52's merge with npcVoice on; the
checklist's voice items are live.

### Slice 5, planned: the gaze and the face (Eli's question of 11:43 PDT: "the puppets end up fairly stiff on a cell guest's screen")

What a guest's screen still lacks, after slices 1 to 3 and the voice, in
the order a player sees it: (1) the movement cadence (130 ms samples and a
smoothing move: a beat late, a slide between reports; TES3MP's is 25 ms;
the "smooth motion" row, a measured number first, P3); (2) the gaze: the
host sends a look POINT per sample and the puppet aims at the nearest
actor within 128 units of it (movementApply.ts:37-56), while the engine
tracks a TARGET in six typed slots (HighProcessData.h:217
headTrackTarget[kTotal], the setter SetHeadtrackTarget(type, target)
:178 and ClearHeadtrackTarget :171, the types at :80-94); (3) the face
outside speech: the emotion type and value the engine exposes as Actor
vfuncs (GetEmotionType 0x10A, SetEmotionType 0x10B, GetEmotionValue 0x10C,
SetEmotionValue 0x10D, Actor.h:464-467), which the dialogue system and
the AI set and a puppet never does, so a puppet in a fight wears a
neutral face until it speaks; (4) furniture exits and paired kill moves,
the known puppet-graph gaps. The voice slice brings the lip sync, the
line's emotion and the talking and listening idles with it (37542 sets
all three). Blinks, breathing and eye saccades are the puppet engine's
own FaceGen and graph work and should run with the AI off; a probe should
read a puppet's blink rather than assume it.

The slice, in the stream's one shape: HostedActorState gains gazeTarget
(u32, the head-track target's form id as the server knows it, 0 for
none), gazeSlot (u8, the engine's HEAD_TRACK_TYPE of the highest set
slot), emotionType (u8) and emotionValue (u8, 0 to 100), read on the host
by one native getHostedGaze(actorId) from the high process's slots and
the two vfuncs (CONFIRMED surfaces by header, no new id); the validator
bounds them in the same commit (gazeSlot below kTotal, emotionType within
the engine's enum, emotionValue at most 100); the message's direction
becomes Both: the server validates and records as today, then relays the
bytes unreliable to the actor's other listeners (UpdateAction's loop), so
a puppet seat applies the gaze (setLookAt on the target when it resolves,
the point heuristic only when it does not) and the face
(setExpressionOverride(type, value), the SKSE override the engine's
FaceGen blends; skyrimPlatform.ts:2203) itself; the percentages stay
ChangeValues (the server's judged numbers). Rule 9: the getter is a few
field reads per hosted actor per poll. Probe: two seats, a resident in a
scene (Sven and Hilde talk at 7.9): the puppet's head turns to the same
speaker as the host's within a sample, and its expression override reads
the host's emotion during and outside the line (npc-state gains the two
reads). This slice waits for D25's letter (the memo's D30): built on the
merged train, not on the branch up for merge.

### The refusal's static read and voice v3 (11:57 PDT)

The re-analyst's follow-up (REA on sky-re, 11:3x to 12:0x PDT) names the
humanoid puppet's refusal with high confidence (FALSIFIED by P7 v3,
x-npc-stream-p7-shot 20261026-200538: the synchronous lip load changed
nothing for 13482, 'lip -1 before and after'; the cause was
SpeakSoundFunction's audibility gate, re-voice-defer.md, CONFIRMED by v4 on
083204: 0 deferred, 2 inaudible far speakers, 45 started): our native passes
the say's seventh flag as true (Say's own shape), and that flag selects the
ASYNCHRONOUS lip-file load inside SpeakSoundFunction (37542: the lip entry
queued to the background loader, its state word at +0xC in bits 28 to 30
reading 1 or 2 while pending; the engine's callers pass the INI
bBackgroundLoadLipFiles here, default 1). With the lip
pending, 37542 returns before BuildSoundDataFromFile, before the head
follow and before the state byte's 3, and 39772 marks the say "in flight"
(+0x454) for the engine to REPLAY on its next AI frame (39632, reached only
through UpdateAI 37347): a puppet, AI off, never replays it, so the first
humanoid line plays nothing. A creature's bark has no LIP file: the lookup
fails synchronously, 37542 clears the entry and plays at once, state byte
3, which is exactly P7 v1's split (twenty-five creature starts, one
resident refusal, identical pre-state). Corrected on the way: 37266's test
is `(bits & 0x180) != 0x180 || timer > 0` means busy, and the logged bits
0x382021a1 have both done bits set, so 37266 refused nobody. The detour's
pair holds no replay (37752 returns on the done bit; 37544 only ends
lines), so the engine's deferral path is closed to a puppet by design.
Second candidates, lower: 37542's distance gate against the audio
listener outside a scene (Sven's distance on c2 unread), an empty
DialogueItem when the topic has no owner quest or the response list fails
to load. HighProcessData's +0x3B8 is the current line's lip-sync resource
entry (set by 37542 and the sound-descriptor path, cleared at the line's
end, at a pause and at Say), not a dialogue state: the first-read name was
wrong and the doc above is corrected by this paragraph.

Voice v3 (the commit after ad1d103d on m3-npc-voice): the native passes
the seventh flag false, the SYNCHRONOUS lip load (16256), so the line
plays in the same call with its lip sync and no replay is needed; the
diagnostics add the lip entry's state bits before and after the call.
Falsifiers in P7 v3: a resident's say still refused with the entry null
(the distance gate or an empty item), or entered with the entry already
loaded and still refused. The lab's one asset fact left: whether Sven's
line 6aea9 carries a LIP and the chickens' bark 10aa5d does not.

### P7 v2's read and voice v3's stage (12:00 PDT)

P7 v2 (20261026-185231, the v2 stage of ad1d103d) GREEN, all 33 steps:
V1 (the sink and the relay) held again, a started say and an ENDED line on
the puppets held ("line on 1066df ended (timer 0.00 -> -1.00)", the hare's
the same: the detour's pair ends a puppet's line, V3 CONFIRMED on the
creatures), no E_SPEECH_OWN. The recorded resident says confirm the
deferral read before v3 ran: Sven's neighbour 13489 (info 6aea8) and 1348b
(info 6aea9) answered "refused (returned true, state idle, handle none,
dialogue state set after)": the say ACCEPTED the line, played nothing, and
left the lip entry set, the replay queued for an AI frame a puppet never
gets. Voice v3 (6efe3271, pushed 12:00 PDT on numidium's word; its stage
chained after the v2 T2) passes the flag that selects the synchronous lip
load, and P7 v3 reads whether the residents' lines play with their lip
sync (V2 for humanoids) and end (V3 for humanoids).

### P7 v3's read and voice v4 (13:49 PDT)

P7 v3 (6efe3271): the first run 193428 measured nothing (c1 paused under a
MessageBoxMenu, E_RUN_PAUSED); numidium's rerun x-npc-stream-p7-shot 200538
GREEN on its letter, no box, no crash, T2 green: the creatures start and end
their lines, and the resident 13482 (info 6aeaa) read "deferred (bits
382021a1, timer -1.00, state -1, lip -1 before; returned true, state -1,
timer -1.00, handle none, in flight true, lip -1 after)": the synchronous
lip load changed nothing for the humanoid, and the lip entry was null before
AND after. The re-analyst's read (REA on sky-re, scratchpad
npc-stream/re-voice-defer.md; CONFIRMED: v4 built on the audibility gate;
083204 read 2 inaudible far speakers, 0 deferred, 45 started; the dossier's
names stay rule 2's):
"lip -1 after" means the lip load 16256 never ran, because SpeakSoundFunction
37542 leaves at its audibility gate BEFORE the lip branch: `if (Get3D() == 0
|| noSound) return 0`, noSound when the voice path is null, a limb is gone,
or (no current scene) the actor is not talking to the player and lies
farther than kDialogueOutputModel3D's max distance from the audio listener
(67710) on ANY axis (a cube). 39772 sets the in-progress mark (+0x454,
CommonLib greetingPlayer) unconditionally at every start, so "in flight"
proves only that the start ran. Corrections to the read above: flag7 is the
background-lip-load flag as read (the engine passes bBackgroundLoadLipFiles,
Papyrus Say a literal 1, the AI replay IsLipPending), the async request is
16254 (not 16255), and 39642 returns 1 for a refused and a started say
alike. The mark's readers: nothing in the say chain or 37266 reads it (a
stuck mark blocks no later puppet say), but once AI resumes 39637 holds the
greeting timer and 39632 replays while it is set: a promoted NPC greets
nobody until a line ends through 37544 or 37741. So D27-B's letter: the voice
stays off the build until a resident speaks on a puppet; the STREAM merges
alone under D25-C.

Voice v4 (m3-npc-voice 8da16ef6): the say logs the 3D and the per-axis
distance to the player before the call, passes keepExtra false (44673's and
37541's shape; only Papyrus Say passes true), and a start that left the item
in progress with nothing playing and no lip entry is reported as INAUDIBLE
(result 5) and cleared through the engine's own ClearGreetTopic (39334,
`void(RE::AIProcess*)`, the body reading ->high; CONFIRMED-STATIC by the
dossier 0x1406e1b70; called by 37544's three END paths and 37741's stop).
Owed to v5 if the lab asks: the multi-response continuation after an END
(39632's SayTopic with a null topic and IsLipPending) and the handoff's stop
(Actor::PauseCurrentDialogue, slot 0x4F). P7 v4 (x-npc-stream-p7.yaml, 41
steps): c2 follows c1's tour at a 100-unit offset so its listener is within
the output model's range of the residents c1 greets; claims v2's plus a
RESIDENT's line started on the puppet and no "deferred" verdict; the
inaudible count recorded. V5, the resident's line plays with its lip on a
puppet whose seat stands within range, CONFIRMED in two parts: the line
started on a puppet within range (083204: 13483's 453f3 and 6aea8, 13484's
6aea9 and 45473 to 45478, among 45 starts); its lip drawn on the watcher
only since the face node's force bit (m3-face-twelve 0ab36af3; Eli 'LIPS
WORK', playtest 37 finding 25, 16:58 PDT 2026-10-28), the mouth's data read
x-puppet-head-face v2's sets 8 and 9.

### Slice 5 as built (14:36 PDT, fork m3-npc-face ac435de8 off m3-npc-death 55a95002)

The plan above, in code: the four fields on HostedActorState (validator bounds
and fixtures in the commit, the row Both); the server records them
(MpActor::SetHostedGaze) and relays the message unreliable to the actor's
other listeners, never the host (OnHostedActorState; CellHostTest's state
case extended); Skyrim Platform pollHostedGaze reads, on the game thread per
poll, each hosted actor's highest set head-track slot (HighProcessData
headTrackTarget and headTracked, HighProcessData.h:217-218; the types at
:80-94) and its emotion (Actor::GetEmotionType and GetEmotionValue,
Actor.h:464-466), hostedGaze answers the last read; HostedStateService sends
them on a change (a target or slot change, an emotion type change, a value
moved ten points); PuppetFaceService on the other seats aims the puppet
(setLookAt on the resolved target; movementApply's point heuristic stands
aside while a target is named, sync/puppetGaze.ts) and wears the emotion
(setExpressionOverride with the Mood index of the engine's EmotionType: 7
neutral, 8 anger, 14 disgust, 9 fear, 11 sad, 10 happy, 12 surprise, 13
puzzled, the CK wiki's SetExpressionOverride table; clearExpressionOverride
at neutral 0). H-54a (the head turns within a sample) read at T3 (181024: 25
gaze targets taken on c2's puppets within the relay's sample) and ticked at
T4 for heads toward players (playtest 37 finding 9), the NPC-to-NPC partner
D53's design item; H-54b (the Mood mapping reads right on the puppet's face)
WITHDRAWN (read B, 2026-10-28: the override leaves the puppet path); H-54c
(no per-sample jitter against the heuristic) HYPOTHESIS until
x-puppet-head-face (54's stage, second read). Probe x-npc-stream-face by
path (30 steps). The cadence row (P3) and slice 4's counters, budgets and
parity scenario follow on this train.

2026-10-28 (playtest 37, the re-analyst's read B in
docs/research/m3/re-puppet-head-lips.md): the expression override leaves
the puppet path. The engine's exprOverride (BSFaceGenAnimationData +0x21E)
is written only by the Papyrus native SetExpressionOverride (54748) and the
console's FaceGen command, never by the engine's own dialogue; while set it
gates the expression setters, among them the line's own emotion that
UpdateSoundCallBack (37544, state 3) applies inside our voice pair on the
puppet, and it is not cleared by a promote, so the talker's live Orgnar read
exprOverride true (numidium's 522 samples). So H-54b is withdrawn: the
puppet wears what its say gives it, PuppetFaceService records the host's
emotion and clears any override once per puppet, PuppetService clears it at
every promote (fork m3-face-twelve 4e643c1c). The lip sync itself is not
gated by the override: it writes the unnamed set at +0x120 from the lip
file (16266, sixteen phonemes at 30 fps) and copies it to +0x140, which the
face node's morph pass (26988) applies under two camera-distance INI
floats; phenomeKeyFrame (+0x80) is the script layer and stays zero under
engine lip sync, which is why the first face read saw nothing. faceKeyframes
answers all twelve sets since ceb54180 (sets 8 and 9 are the mouth).

23:25Z, the lip draw (the re-analyst's read C): numidium's twelve-set
samples showed sets 8 and 9 moving on the watcher's PUPPET as on the live
NPC, so the lip file is evaluated and copied and the phonemes are not drawn.
The face morph pass (26988, from the face node's UpdateDownwardPass 26998)
runs only for actors the face morph budget (41318) finds in a near-actor
list that the per-frame AI job (41369) fills on its kProcessMe branch
(41450), rebuilt every 3 s from highActorHandles (41317); an AI-off puppet
is on it one frame in three seconds, so its whole face, phonemes,
expressions and eyes, stays static on the watcher; the host's live NPC
passes because its AI runs there; a puppet in dialogue with the local
player passes through IsTalkingToPC. Settings read from the image:
fTalkingDistance:LOD 2000 and fLodDistance:LOD 500 (plus ten, from the
world root camera), uiNumActorsAllowedToMorph:FaceGen 10, none the gate at
one to three meters. Fix (fork m3-face-twelve 0ab36af3): while a puppet
speaks, DriveVoice sets the face node's runtime flag bit 8 each frame
(BSFaceGenNiNode.h:27; the engine's own one-shot force, set by
AIProcess::Update3DModel), so the pass queues the node past the budget and
the distances, applies every layer and clears the bit. H-54h (the mouth
moves on the watcher during a relayed line; the number H-54d is the gaze
read's below, x-npc-stream-face carrying no mouth claim) CONFIRMED at T4:
Eli 'LIPS WORK' on f231f2ea's dist (playtest 37 finding 25, 16:58 PDT
2026-10-28, LOG 2711); the data read is x-puppet-head-face v2's setsMax[8]
and [9] during a line, unrun; the idle face between lines stays static (the
engine-shaped insert 41450 is one new id, later).

54's stage, first read (10:43 PDT, x-npc-stream-face 20261027-173514 on
m3-npc-face 240a31de): the gaze path is alive end to end for actors near the
player. The host's state lines carried head-track targets for the creatures
at the landing ("state 107cf9 ... gaze 107d07 slot 1", another at slot 5),
the server accepted and relayed them (15 resident state lines, E_STATE_OWN
0, no permission line), and c2's puppets took them ("face: 86111 gaze ->
107cf9 (slot 3)", 86112 the same), with 22 expression lines for residents
on c2. The residents themselves never set a slot: eight state lines each
with gaze 0 over the 90 s window, their chatter included (topic 6aea3 by
1348a, 13482, 13484 and 3550c), and Sven stood 3600 units from the host at
the landing. H-54d, the engine tracks heads for actors near the player only,
so a hosted actor far from its host streams no gaze and the puppet seat
falls to the point heuristic: CONFIRMED (x-npc-stream-face v2
20261027-181024: both seats beside Sven, 52 resident state lines with a gaze
target where v1 173514 had eight with gaze 0 at 3600 units). v2 of the probe
brings the host to 300 units of Sven and the puppet seat to 400 before the
window (claims unchanged); its rerun decides H-54d and reads H-54a to H-54c
on the residents. The run's second red was the lab's (a c2 log-count step
met "QEMU guest agent is not running" and left its claim without a count).

54's stage, second read (11:16 PDT, x-npc-stream-face v2 20261027-181024,
GREEN, six of six): H-54d CONFIRMED (both seats beside Sven: 52 resident
state lines with a gaze target where v1 had none, one at the dialogue slot
4; the targets residents, the players and creatures, slots 0 to 2 besides).
H-54a read at T3: c2's puppets took 25 gaze targets within the relay's
sample ("face: 3550c gaze -> 13483 (slot 1)", "35534 gaze -> 13491 (slot
2)", clears when the host's slot emptied); the head's turn itself is T4's
eye (playtest 35). H-54b read: 18 non-neutral expressions on c2 ("face:
1348c expression 1 50 (mood 8)", anger at 50 as Mood 8; neutral 0 at mood
7), the mapping as the table says. H-54c (no jitter against the heuristic)
stays HYPOTHESIS until x-puppet-head-face (v2, by path 2026-10-28 16:31,
unrun): it records six paired face-keyframes samples and claims only the
speech, say and gaze log lines, so the equality claim, c2's expression equal
to c1's at every pair and changing no more often, still waits on the lab-api
fact; a playtest 39 checklist line for it is owed (playtest-m3-39.md has
none). Promoted as b-npc-stream-face
(main, its own commit) for 54's gate set.

Step R (2026-10-26, on the merged parity 66f04f2a; numidium's chain, 22:15
to 22:32Z): P3 (x-npc-stream-p3 20261026-222300) GREEN, all 32 steps, its
pcap the rates' read (the MEASURED bullet under Rate limit above); P6 v3
(222815) GREEN, H6 CONFIRMED; x-npc-bow (221512) and x-npc-spell (221906)
red on a probe slip alone (a log_count claim reads an earlier log-count step
with the identical pattern), their records in hand: the archer's three draw
and two release actions streamed on c1 and played on c2 (taken 1; the
ring's other 24 taken 0; no block anim), the mage's nine hand-cast actions
streamed and played nine of nine. The projectile reads came 25 to 30 s after
the volley, and the spell run asked for arrows (form type 64; bolts are 63,
flames 67), so whether the puppet's engine launches an arrow or a bolt of
its own on the replayed release is UNREAD; v2 of both probes by path polls
the references ten times through the fight's first dozen seconds. The logs'
read (thuum-magnus's agent, 15:40 PDT) found the cause of "bows were
missing" (playtest 34): the HOST's own engine launched the hosted archer's
two arrows and the native launch rule dropped them as a figure's ("a
figure's own arrow dropped: shooter ff000bb4", 3 ms after each
attackRelease on c1), because a server-made NPC's copy carries a 0xff id on
the host too and the rule keys on the id; no arrow existed on any seat, the
server saw no bow shot, and the archer's only landed hits were a dagger's
after its weapon swap. The mage's three casts DID reach the server
(OnSpellCast, refused "spell c96a1 not found in equipment": SparksRightHand,
the NPC-only hand variant, outside the known set, and its equipment report
refused twice over, "not learned" and "inventory does not contain item
c96a1", the host's hands poll having listed the hand's spell as a worn
entry); its one spell hit was dropped E_HIT_WEAPON; the puppet replayed
nine of nine hand actions and cast nothing (no relay reached it). Both are
train 53's: the launch rule by what the actor is (the player's or a
simulated actor's arrow flies and is reported, a figure's or a puppet's is
dropped), the hands poll keeping a hand's spell out of the worn list
(m3-npc-cast cd3f6121), the server half above. Train
53's call: the bow relay is built whatever v2 reads, one shape for arrows
(every arrow on the wire is a relayed shot, a puppet's like a figure's; the
puppet's own launch, if its engine makes one, dropped by the launch rule
extended to puppet shooters); v2's read decides only whether that drop has
work to do (H-53c). The voice's P7 v4 (20261026-224627, on 8da16ef6's
stage) read RED on its own premise: every resident's say on c2 was
"inaudible" with the diagnostics putting the speaker 3.7k to 6.6k units
from c2's listener (the residents who spoke during the tour were not the
ones beside it; the creatures near the spawn started as before; the server
relayed 14 lines, no E_SPEECH_OWN), so the engine's rule held and the voice
stays off the build (D27-B); v5 by path places both seats at one named
resident through the judged approach (c1 at 150 units, c2 at 300) for
three visits of 45 s (numidium runs it in a gap).

Slice 6 (SPELLS AND BOWS on hosted NPCs, train 53; ADR-050's "attacking the
same"), the server half built 2026-10-26 on fork m3-npc-cast 30e72b86 (off
the talk head 87557458): a hosted actor's hands, casts and hits under its
own id, with these dispositions (rule 5). The NPC's spell LIST is the host's
engine's (templates and leveled spell lists the server does not walk):
recorded, R2. A spell or a shout in a hosted equipment report outside the
known set is recorded with one line (E_EQUIP_UNKNOWN_SPELL) when the form is
a SPEL or a SHOU, and a form that is neither refuses the report as before; a
hosted cast of a spell the record's hands lack is recorded and relayed
(E_CAST_UNKNOWN; a form that is no spell E_CAST_FORM, refused). The known
set itself widens through the template the chain names for spells (NPC_'s
UseSpelllist, EvaluateTemplateNoThrow over the evaluated chain). The HITS
are validated, R1, as a player's: the claim against the recorded cast, the
bond, the first-hit release of a touch or target-actor cast and the
second-hand reach claim run for every recorded cast, a hosted one included,
and a hosted spell hit with no cast behind it is refused (E_SPELL_NO_CAST,
the hole the plan's review named). The player's own gates stand (the shout
rule and its recovery are a player's; an NPC's shout falls to the generic
path as a recorded cast; headshot spells stay a player's, H-53d). Why
recorded and not refused slot by slot, the plan's words: OnSpellCast's
equipment gate keys on the record's hands, so a refused slot would drop the
NPC's cast; recording keeps the host's engine the authority on what its NPC
knows and the server the authority on what its hits do. T0:
unit/NpcCastTest.cpp, five cases on the forest's predator hosted by one
player (the hands recorded and relayed, a sword refused; the cast recorded
and relayed, its hit claimed once; a hit with no cast refused; an unlisted
spell's cast recorded and its hit landing by reach; a touch cast relayed at
its first hit). H-53a (the template chain gives a leveled mage's list)
HYPOTHESIS until a leveled mage is placed in x-npc-caster's frame (an
LVLN-templated mage NPC_ by esm.py; the claim E_CAST_UNKNOWN == 0 for it):
both mages read so far are plain NPC_s (0x39d37 in x-npc-caster 032625, zero
E_CAST_UNKNOWN; 0xc3c9f in x-npc-spell v2 000211, on 50b before train 53's
line existed); H-53b (the puppet's cast through castSpellImmediate ends when
the host's does: the end is player-only on the client, magicSyncService)
CONFIRMED (032625: five casts and three ends on the puppet); H-53c (the
puppet's own arrow or bolt on the replayed release, the drop's work) read
(032303: no arrow of the puppet's own); H-53d (NPC headshots are not
counted) a known limit: a hosted shooter's arrow claims no headshot, the
headshot rule being the player's bow path (ADR-038, ClaimHeadshot) and a
hosted shot's hit landing as the arrow's number, unread in the lab and
accepted. Built the same afternoon on the branch (78cec009): the
hands poll keeps a hand's spell out of the worn list (cd3f6121); a hosted
caster's cast END goes out from its action stream's hand-equipped event
(463a029a; H-53b's mechanism: the player's end hook was its own graph's);
and the BOW RELAY, one shape for arrows (every arrow on the wire is a
relayed shot, a puppet's like a figure's): PlayerBowShot names its shooter
(idx; SCHEMA_VERSION 18; the validator refuses u32::MAX; fixtures, the size
test and the difftest session carry it), OnPlayerBowShot's hosted branch
under the host rule (the bow against the record's hands; the quiver the
engine's, R2: an arrow spent when the record holds one, E_SHOT_QUIVER
recorded otherwise; the shot recorded under the actor's id; ArrowShot under
its idx to every listener with a user but the sender), OnHit's shot claim
for every shooter (a hosted arrow at its draw power, a hit with no shot
refused), the native launch rule by what the actor is (the player's and a
simulated actor's arrow flies and reaches JS; a figure's or a puppet's own
arrow is dropped outside a RelayedArrowScope), and the host's client
sending a hosted actor's launch as its shot with the engine's launch. A
bug found on the way and fixed in the same hunk: the old relay loop sent
through GetActorToSendTo, which hands an offline listener's message to its
host, so a host near a player's shot received one ArrowShot per NPC it
hosted among the shooter's listeners (one arrow drawn per hosted
neighbour; never seen in a lab run, which shot with no hosted cell near).
T0: NpcCastTest's hosted shot case; MarksmanTest, GodModeTest, SelfCastTest
and HeadshotTest name their shooters. H-53e (the puppet's relayed arrow
leaves from its bow node along the host's launch, as a figure's does), a
known limit: a relayed arrow's flight on the watcher against the host's
launch is a screenshot read no probe takes (x-npc-bow v3 never existed,
x-npc-bow.yaml being v2 of 2026-10-26; x-npc-archer took the read): one
relayed arrow flew on c2 per shot and none of the puppet's own (x-npc-archer
032303), Eli read 'bows work' in playtest 35's Bleak Falls note, and the hit
is the server's number whatever the arrow's path.

### 53's stage read (20:31 PDT 2026-10-27; fork m3-npc-cast ecec018e, then bf133744)

The first stage (ecec018e, probes 20261028-023756 and 024159) read the
caster GREEN and the archer RED, a code red: the archer EncBandit01Missile-
KhajiitM 0x9a549 fired seven arrows on its host (PROJ 50 in flight on c1's
polls; the puppet's attackRelease taken 1 on c2) and every launch threw in
the client's projectileLaunched handler, c1.log "on('projectileLaunched'):
'Game.getFormEx' can't be called in this context" (seven lines, 19:40:36 to
19:40:55 PDT), so no hosted shot formed and no OnPlayerBowShot reached the
server. The cause: playerBowShotService's onHostedLaunch read the engine
(Game.getFormEx for the shooter, its equipped weapon, its aim) inside the
handler, and Skyrim Platform refuses a native there (CallNativeApi.cpp:
requirements.vm is unset in the launch event's context); the player's own
shot keeps its launch and does its natives on the update tick, the crossbow
hook defers with controller.once("update"). The fix (bf133744, one hunk):
the hosted branch keeps the launch's fields and reports on the next update,
the file's own idiom; tsc clean; no wire change. Memo D44.

The restage (bf133744, 20:12 PDT) read both GREEN:

- x-npc-archer 20261028-032303: the host's client reported four hosted
  shots (ff000002 the placed archer, 1397d from 3b562 at power 1.00, and
  1348c, a Riverwood archer its game also hosts; c1-console.log "hosted shot
  by"), the server took the placed archer's shot under its id
  ("OnPlayerBowShot - ff000002 shot 1397d from 3b562, power 1.00, aim -0.021
  heading 2.522, by its host ff000000"), zero E_SHOT_EQUIPMENT, E_SHOT_ORIGIN
  and E_SHOT_QUIVER, and its eight bow hits landed through the record
  (OnWeaponHit by ff000002). On c2 zero "no figure, bow or arrow here", zero
  "puppet's own arrow dropped", zero PROJ in flight through the volley and
  ONE in flight on the last two polls, after the relay. So: H-53c read, the
  puppet with its AI off launched no arrow of its own on the replayed
  release (the drop rule stood unexercised, nothing to drop); H-53e PARTIAL,
  one relayed arrow flew on the other seat and its path against the host's
  launch is a screenshot read, not a number (T4 row in playtest 35's
  checklist: one arrow per shot leaving the puppet's bow).
- x-npc-caster 20261028-032625: the mage EncBandit01MagicNordM 0x39d37
  cast on both screens, c2-console.log five "cast ... on puppet" and three
  "cast end ... on puppet" lines, so H-53b CONFIRMED (a hosted caster's end
  reaches the puppet from the action stream's hand-equipped event). The
  server recorded zero E_CAST_UNKNOWN (every cast's spell was in the
  record's hands through the template chain: H-53a read for this mage, the
  leveled list's case stays open until a leveled mage is placed) and two
  E_EQUIP_UNKNOWN_SPELL lines (two entries of the hands report outside the
  known set recorded alone, the report kept, as designed); zero
  E_SPELL_NO_CAST and zero E_EQUIP_REFUSED naming the mage; 68 OnSpellHit
  lines by caster ff000002 on c1's player through the record.

T2 on ecec018e GREEN (numidium, 20:12 PDT); the fix is client-only, so it
predicts bf133744's, which runs now. Playtest 35 runs on this stage under
ADR-040 (memo D41 and D44); 53's gate after Eli's report, the merge after
the gate; the Status boxes tick at that merge. b-npc-archer and b-npc-caster
are promoted from the two probes then (rule 13, their own commits).

### Train 56: a hosted NPC's last action for a late joiner; the voice's later lines to 57 (22:11 PDT 2026-10-27)

Playtest 35 (pt35-read-1 E): Hilde's IdleTanningEnter was captured on the
host two minutes before the second seat reached Riverwood, and her
CreateActor carried the last animation EVENT, not the action, so the puppet
stood idle until the host's engine restarted the chore. Built (6bc6657c):
MpActor keeps a hosted actor's last UpdateAction (memory, R2; set in
OnUpdateAction for an actor the sender hosts) and VisitProperties writes it to
the CreateActor as the custom property "lastAction" (UpdateAction's fields as
JSON, the record's own property channel, as isHostedByOther travels); the
client seeds the puppet's action queue with it and the view's first replay
performs it; a player's actions are never carried. No wire row: a typed field
added to CreateActorProps broke wire-legacy's positional decode of the lab's
capture (every_captured_packet_reads_into_the_schema), so the capture's
messages take no new fields. T0: CellHostTest, a late joiner's CreateActor
carries the hosted actor's last action, a player's never. Probe:
x-npc-late-join. Furniture itself (the rack's marker) is not carried; the
action's idle plays in place, a later row if the lab shows the offset.

The voice (pt35-read-1 C): the relay is lossless and the puppet played every
relayed line, but the host captured one speech event per topic INFO
(TESTopicInfoEvent fires at an info's begin alone), so the later response
lines of a multi-line info never left the host; Eli heard the first line of
each topic on the puppet and the rest on the host. Train 57, after the
re-analyst's read: how the engine advances an info's responses on the host
(the AI's dialogue update an AI-off puppet never runs) and whether
SpeakSoundFunction is called per line; then either the puppet's voice drive
(PuppetHooks DriveVoice) advancing the response at a line's end, or a
per-line capture on the host with the puppet saying by response index.
HYPOTHESIS until x-npc-voice-lines (by path 00:16 PDT 2026-10-28, unrun):
the trace x-voice-lines 20261028-131134 met single-line infos only and
decided nothing; under play the continuation's say returned 'started' for
the second response (playtest 37 findings 4 and 14) while Eli heard half,
and whether it sounded is x-voice-inflight v2's recorded read. The different
greeting was two greeting infos 147 ms apart, the puppet starting the first.

### Train 57, Dynamic: the later response lines (the re-analyst's read, 22:36 PDT 2026-10-27)

The read (docs/private/re-voice-responses.md, REA on sky-re against the
unpacked 1.6.1170; ids by `just addr`, structures by CommonLibSSE-NG
DialogueItem.h:55, HighProcessData.h:298, :337, :338, :345,
MenuTopicManager.h:40-44, :71-78, TESObjectREFR.h:272): a topic info's
responses are a list on the actor's DialogueItem; each line's START runs
39643 (play the item's current response, raise the BEGIN event 25616, advance
the current response, 35223); the FIRST line starts from SayTopic 39162 with
the topic, every LATER line starts from the AI update's 39632 calling
SayTopic with a NULL topic while HighProcessData's greetingPlayer (+0x454)
marks an item in progress; the voice timer path (37752, UpdateSoundCallBack
37544) only ENDS lines. An AI-off puppet never runs 39632, so it plays the
first line and stops: the lab's voice slice as measured. Inside the player's
Dialogue Menu the partner's lines run through Actor::UpdateInDialogue (37541,
the vtable slot CommonLib names), which calls SpeakSoundFunction (37542) per
line and raises no event, so the host captures one BEGIN per info there:
playtest 35's "one voice file" is the menu case, Sven being the host player's
partner. SpeakSoundFunction is per line on every path; its arguments carry
the voice path alone, no response index, so a per-line capture would read
the response one frame up (39772 for barks, 37541 for the menu).

Fix shape A (recommended; no wire change): the puppet's own continuation.
From PuppetHooks DriveVoice, after the pair has ended a line, while
greetingPlayer is set and the busy test 37266 says free, call
Offsets::Voice::SayTopic(process, actor, nullptr, nullptr, false,
high->unk45C, lipPending(39369), false), the AI update's own call: 39642
refuses while a lip load is pending, otherwise plays the item's current
response, raises a BEGIN this seat ignores, and advances; the last line's END
clears the mark and the loop stops. The host's relay stays one message per
info; the relayed repeat of greetTopic's info while the mark is set is
dropped (barks raise a BEGIN per line). Shape B (per-line capture on the
host with a per-index say) needs two more hooks and a response index no
engine entry takes (SayTopic resets to the first response). A is the lazy
one: the responses are the same plugin data on both seats.

The trace (lab/frida/voice-lines.js; a host seat, 120 s: the player talks to
Sven through a multi-line topic, then stands in Riverwood for barks and
scenes): hooks on 37542 (the actor's id, the voice path), 39772 (the item's
info and the response's index and path), 37541 (the menu's response path and
info, non-null rdx only), 25616 (the info id and the event type), 39632 and
39643 (entries per actor). Expected: the menu, one type 0, N 37541 and 37542
entries, one type 1; a bark, N 39772 and 37542, N type 0, one type 1. With A
built, a puppet seat shows N 39643 entries per info and zero 39632 entries
for the puppet's handle. Falsifiers: a multi-line bark with one type 0; 39632
entered for an AI-off puppet; 37541 with a response for a non-partner
speaker; the continuation returning 1 with nothing started while the mark is
set and 37266 says free (39372 on a stale lip entry is the unread gate).

### Train 53 merged (00:08 PDT 2026-10-28): fork parity bf133744

The chain 20261028-044241 (the gate, 30 scenarios, four not-greens, every one
a premise or a tooling read: the mage's timing, Sven's walk, a lab-api
log-count fault, the lab's aim) plus the rest 20261028-064325 (death-engine,
stream-voice and talk green; b-npc-caster red on the mage's death before a
cast end, green on its rerun 065950), verdict watch; both clones promoted to
clean-m1 at 07:07Z. Slice 6 (bows and spells on hosted NPCs) is on parity
with the whole NPC ladder: trains 51, 52, 54, 55 and 53. b-npc-archer and
b-npc-caster are the slice's scenarios; the Status boxes below stay as they
are until the hypotheses close (H-53a's leveled list, H-53c's drop rule,
H-53e's path, H-54c's jitter) and the parity scenario p-npc-stream is built.

## Watch item (00:08 PDT 2026-10-28, 53's chain, ADR-027): b-npc-caster

Red once at 20261028-051558 (the observer's read before the mage's first
cast; the until on the server's live cast line fixed it, bf15433) and once at
064325 (Sven's arrows killed the mage within fifteen seconds of its first
cast, so no cast could end; the mage's record is hardened after its first
cast, main 34cbc19), green on the rerun 065950 with neither lever yet
deployed. Closes when the scenario plays green with both levers in a gate.

### Train 57's candidate (00:16 PDT 2026-10-28; fork m3-voice-lines 3eef89d3 off 56's head)

Built ahead of the trace so its build is ready, staged only after
lab/frida/voice-lines.js has read the chain on a host seat (rule 8, ADR-054
item 3): PuppetHooks DriveVoice, once the pair has ended a line and the high
process still marks the item in progress with a response left
(greetingPlayer, DialogueItem's currentResponse), makes the AI update's own
call, SayTopic with a null topic (the lip load synchronous, voice v3's flag;
the engine's busy test inlined from the two voice bits and the timer), which
plays the item's current response, raises a BEGIN this seat ignores and
advances; the last line's END clears the mark and the loop stops. PuppetApi
SayTopicInfo leaves a relayed repeat of the item in progress alone (a bark
raises a BEGIN per line on the host; result 3, "left to its continuation").
Probe: x-npc-voice-lines (c1 talks to a held Sven through the first topic,
c2's puppet: the first line started, at least one continuation, at least two
ends). Falsified by the trace (a multi-line bark with one BEGIN, or the
AI update entered for an AI-off puppet) the candidate is dropped unmerged.

### Playtest 36, the turbo day (11:36 PDT 2026-10-28; 56's stage defaa7e2 with the hot bundle, then 40e3ab41 relaunched)
Eli's item 3 ticked ("when prisoner showed up hilde WAS tanning": the late joiner's lastAction, 56). Item 4 unticked: "didn't
work. only first plays. LOTS of voice lines are synced. their barks (things said as you pass them) are synced. however, the
'DRAGON! I SAW A DRAGON' exchange that hilde and sven have is weird. sometimes anims play for one (pointing) sometimes
neither. voicelines only play for one at a time. i think something about it being a scripted event makes it weird." Three
threads in that: the continuation (train 57, built and green on m3-voice-lines 5de4ced5, was NOT in the build; merged into
the turbo train at 26e3d0cf for tonight's gate; its read is the voice paragraph's under train 56 above, x-npc-voice-lines
unrun); one speaker of a two-NPC scene refused on the observer (c2's VoiceService: five "-> refused", PuppetApi result 2, all
b6fdb's while b6fe4's lines started; the sayTopicInfo pre-state in c2's skyrim-platform.log is numidium's read); and the
dialogue idles (IdleDialogueStart, MotionDrivenDialogueGeneric, NextClip) stream to the observer (c2's ActionSync traces
carry them) but Eli sees them play for one or neither: the replay's result per idle on a puppet is the platform log's too
(both reads before any code). Item 6 unticked: "so ferns head looks right, NPC heads dont track. im wondering if that's ok
for tracking players so each player is addressed on their screen, but it needs to work for NPCS talking to eachother on both.
additionally no talking animations propagate still." The local gaze (8acf15f9) looks at the local player alone; a
conversation's partner is the missing target (memo D53). Item 7 unticked: "still a little glide back about a foot" (the
movement knobs, a measured tune in tomorrow's slot, not a blind one). Item 5 ticked: arrow deaths by the engine (npc-fate).

## Status

Doc drafted 2026-10-22, before any code; reviewed the same day (rules 1,
2 and 11 checked, the fork lines re-read at 19e7ca9b). BUILDING since
2026-10-26 02:24 PDT on fork m3-npc-stream (ADR-050), the eight questions answered
above as the build's calls. Slice 1 (ACTIONS) built 2026-10-26 03:08 PDT,
fork c2129b4a (tsc, codegen and fork-lint clean; CI building), its probes
by path; P1 read the same morning (H1 confirmed in the lab's sense). Slice
2 (STATE) built 2026-10-26 03:49 PDT, fork 42af75b7 (the wire message,
its validator and fixtures, the Rust rule and its bridge, the core's
handler, the client's sender; wire tests and clippy clean, tsc, codegen and
fork-lint clean; CI green, pipeline 3133). Slice 3 (EQUIPMENT) built the
same morning (the hosted idx resolved in OnUpdateEquipment, the hands
streamed from the host's poll, the puppet's hands following; tsc, lint and
the JSON crate's tests clean; fork 2673d1ab, CI green, pipeline 3136; the
first stage RED on the puppet seat's crash, slice 1 v2 a0ff0e72 pushed
09:09 PDT; the v2 and v3 stages GREEN, no crashes, T2 green twice; the three
slices at T3 on probes 11:03 PDT: the build's slice-1 numbering H1, H2, H2a,
H3 and H7 confirmed, slice 3's H6, the hands, confirmed on Step R, P6 v3
222815; the Inventory's H3, the package events, and the Suppress section's
H6, the hosted set, still open). Slice
4's voice line read twice by the re-analyst and BUILT 2026-10-26 05:33 PDT
on fork branch m3-npc-voice 82ffd53a (the sink, the native, the detour's pair, the
message with its validator and fixtures, the server relay, the client
service; HYPOTHESIS V1 to V4 for P7); the rest of slice 4 waits on the
stage's reads (P4 to P6 queued behind the nightly, numidium's chain). Open questions for Eli before the build as
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

- [x] doc complete, inventory listed with a disposition per row, rung declared (ticked 17:02 PDT 2026-10-29 by the pass: the Inventory's 27 rows each carry a disposition and a rung; the Rung paragraph at the top declares R1 for the transform and R2 for the hosted state)
- [x] engine surface cited or delegated (ticked 17:02 PDT 2026-10-29 by the pass: the combat and speech surfaces cited to CommonLibSSE-NG by file:line in the Engine surface section, the voice slice's ids by `just addr` from the re-analyst's reads)
- [x] server logic + T0 (slices 1 to 3; CellHostTest's four cases)
- [x] message + validator (same commit: HostedActorState 53/61 42af75b7; ActorSpeech 54/62 82ffd53a on the voice branch)
- [x] native hook + T1 (no new Address Library id in slices 1 to 3; the voice slice's ids are the re-analyst's reads, their T1 the stage's log lines)
- [x] TS handler
- [x] T2 green (the v2 and v3 stages, 17:05Z and 18:01Z)
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

Trains 52 and 54 merged (13:43 PDT): fork parity 240a31de (m3-npc-face, with
m3-npc-death 7cd47e24 inside), cited by the chain 20261027-181833-gate-m3-
npc-face plus its rest 202429, verdict watch: 28 green and 3 red in the gate
(b-npc-death's corpse drift, H-54e; b-npc-headshot-host, the lab's aim,
pending; b-npc-stream-voice's listener placed off an obstacle), the rest
three of three green. On this build: the voice slice (V1 to V4 read), the
gaze and the face (H-54a and H-54b read at T3, H-54d confirmed, H-54c for
T4), slice 4's counters (867c4210); slice 4's parity scenario
(p-npc-stream against lab/references/npc-packages-a.json) is not built,
since its per-id grammar row in lab-api is numidium's and later, so the
parity Status box stays open. The killer credit (H-52b) and the life
check's stand-up are in the same build (npc-fate.md).

## Watch item (2026-10-27, 54's gate, ADR-027): b-npc-stream-voice

b-npc-stream-voice red once at 20261027-200545 (54's gate on 240a31de): the
listener's third approach (300 units from 0x13484) was judged unsettled for
60 s because the computed landing point fell in a Riverwood obstacle and the
engine placed c2 74 units off it, the same spot to the decimal nineteen
times, past the judge's 64-unit tolerance; with c2 judged away, the 25
relayed lines went to no listener. The two earlier approaches of the run had
settled in 3.3 s. Fixed on main c70e828 in the scenario's own commit:
tolerance 150 on the listener's three approaches (earshot, not a mark), the
claims unchanged; GREEN in the gate's rest at 203422. numidium makes
lab-api's approach accept a repeated engine placement after the ladder. The
old premise's red stays the watch item until the scenario is green once more
in a gate or the nightly; then this section and gate.yaml's entry come out
together.
