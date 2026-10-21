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
- UNKNOWN: the prototypes of 41370, 41453 and 37356 for the two detours (the
  research gives rcx as the Actor* for Frida, :358-359, and the push's four
  arguments, :272; no types). Delegated to the re-analyst (REA) on
  2026-10-21; hypothesis block to be pasted here before the hooks are coded.

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
  setPuppet(actorId, true), which runs Q4's demote natively (re-ai-puppet.md:
  351-354): StopCombatAndAlarmOnActor(actor, false), StopMoving, the
  keep-offset cleared, EnableAI(false), the flag set, the actor left in high
  process. Hook 2a: a detour on 41370 that calls the original, then for each
  flagged actor in highActorHandles queues the engine's own job 41453 on the
  same job list through the engine's push 69349, so the graph updates in the
  engine's stage and thread model (:268-273). applyMovement's puppet branch
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
  nothing useful on a puppet: its agent's slot, 7 ungated or 8 gated, is
  unresolved, :304-308).

## Suppress (engine's own behavior blocked on non-hosts)

- What is suppressed: on a game that does not host the cell, for each of its
  engine actors: the AI (packages, combat decisions, detection requests,
  chatter: the kProcessMe bit); the movement step (hook 3: 37356 returns
  early for a flagged actor; the rest of 37350 runs, so the char controller
  stays at the relayed position, :279-285); combat membership (the stop at
  demotion and at every combatState on a puppet: hits 38586 and Papyrus
  StartCombat 54768 are not gated and 38565 keeps selecting targets,
  :286-290); the keep-offset; local attack events unless relayed (as today).
  On every game: the cleaner's deletion of engine references and the copy
  for an ESM actor.
- How: EnableAI through the export; two native detours in the fork's Skyrim
  Platform (Hooks.cpp's idiom, REL::Relocation with write_vfunc or a
  trampoline call, skyrim_platform/Hooks.cpp:165-169, :188-199 on m3host):
  the research's "one bit plus two hooks" (:295-299) against Skyrim
  Together's AI-on shape with a block per output, which leaks wherever a
  block is missing (te-npcs.md:133-150); the puppet set in native;
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
  actor carries its own form id instead of id + 0x100000000 (PartOne.cpp:
  979-983 on m3host): a value within the type, no shape change, no validator
  rule on it. The client's two tests of that value (remoteServer.ts:372,
  formView.ts:131-136) are the switch to the engine reference.
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
  record type, not the id.
- Kill switch config key: `npcPuppet` under skymp5-client's settings
  (hostService.ts:31's idiom): off, the set is never fed, so the detours are
  inert and AI stays on: a bisect switch, not a play mode. The binding and
  the cleaner follow `cellHost`.

## Tests

- T0: C++: PartOne's CreateActor for an ESM actor carries the form id
  (unit/NpcExists.cpp's shape, skymp-hosting.md:182-184); the loader admits
  an essential NPC, a guard and a Nord bandit under npcEnabled and still
  skips a dead or disabled one (lab/esm.py counts the Riverwood ACHRs that
  pass, skymp-hosting.md:558-559); UpdateHoster sends no property for an ESM
  actor. Rust: none (no wire change); wire-validate's tests stand.
- T1: the detour targets and the push resolve by id against SkyrimSE.exe
  1.6.1170 outside the game (41370, 41453, 37356, 69349: all 147 of the
  research's ids present, re-ai-puppet.md:10) and the stage table's name
  strings "Actor animation" and "Actor movement" read beside them (:59-61):
  the ids proven before any hook runs.
- T2: difftest's cell-host.yaml extended with an ESM NPC in reach of the
  spawn's cell 0xbbb1 under npcEnabled: its CreateActor carries its own id
  on both servers; the host's UpdateMovement for it accepted, the non-host's
  dropped (cell-host's gate).
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

- Frida script: lab/frida/npc-puppet.js, the research's P1 set (41369,
  37347, 37348, 37349, 41453, 37350, 37356, 38565, 33236, 33217, 41408 with
  its owner argument, 37774; re-ai-puppet.md:356-366): module base plus
  `just addr` offset, rcx the Actor*, filtered on its form id (:358-359),
  calls per second per step. On the fork's Skyrim Platform with the hooks,
  for a flagged actor: 41453 once per frame (hook 2a), 37356 at zero (hook
  3), 37347 and 37348 at zero, 33217 entered only before the stop. Falsified
  by a 37356 call for a flagged actor, or 41453 at zero.
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

Doc drafted 2026-10-21, before any code.

- [x] doc complete, inventory listed with a disposition per row, rung declared (2026-10-21; the dispositions stand on the 2026-10-18 references and x-npc-puppet's two runs, to be re-read on the merged base)
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
