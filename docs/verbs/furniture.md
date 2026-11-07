# Verb: furniture

Drafted 2026-11-07 (PST morning, the r50 lab layer) from docs/VERB.md and the build plan
docs/research/fifty-fixes-2026-11-07.md (against fork m4-scripts-4-rows 42f40f84; the fifty train is m4-scripts-4-rows 1acb834f
plus its 4c and 4d layers), with the static read beside the premise probe (lab/.cache/drafts/fifty/lever-furn-static.md,
gitignored; its findings are carried here with their sources). It closes docs/verbs/traps.md's H-P1, the NoPlayer furniture: the
Temple's puzzle lever moving on one screen alone (playtest 49, Eli: "lever anim only plays on one screen though, whoever flips
it"). Nothing of it is built and nothing here ran on the lab: every engine fact below is HYPOTHESIS until the read named beside it,
and every Status box is open.

## Intent

A furniture's own animation plays on every screen: when one player uses a furniture whose graph the engine animates for the use (a
lever pulled), every other seat's copy of that furniture plays the same graph event.

Roadmap reference: skymp/ROADMAP.md "Dungeon support" ("Traps, puzzles and more")
Milestone: M4   Class: B

## Inventory (ADR-031: the action's consequences, before its rung)

The action is "a player pulls the Temple's puzzle lever 0xaa8c3" (REFR at (5002.4, -902.8, -753.5) in Bleak Falls Temple 0x371de,
base FURN 0xb7db4 LeverPushAnimatingNoPlayer, whose keywords include FurntiureNoPlayerAnim 0xb7db3, the game's spelling; its one
script defaultPillarPuzzleLever, its TrapLever removed by the reference's VMAD, status 3). The reference trace is the premise
probe's (x-lever-furn v1 with lab/frida/lever-furn-trace.js, both seats); the records are lab/esm.py's (REFR, FURN, IDLE, DOBJ) and
the script's pex (lever-furn-static.md sections 2 and 3).

| consequence | seen in | disposition |
| --- | --- | --- |
| the press's OnActivate to defaultPillarPuzzleLever (the darts, or the portcullis when the pillars are solved) | record, engine | unchanged: the press is blocked on every seat (kBlockActivate on every FURN, objectReferenceEx.ts:128-141), reported as Activate and relayed to the other seats (RelayedActivation 70), each seat's lever script running under the relay's Override; the darts' and the door's linked activations are traps.md's |
| the occupancy (the server's FURN occupant within 256 units, OpenContainer to the puller alone) | code | R0 as today (MpObjectReference.cpp:2275-2300); a dead or deleted occupant released (fork ec5add8d, traps.md "The puzzle lever's two faults") |
| one graph event, 'Lever_PlayerPush' (the idle 0x4dfea PlayerLeverActivate's ENAM), sent to the LEVER's own graph by TESFurniture::Activate's NoPlayer branch at the puller's default-only activation (remoteServer.ts:299) | trace (x-lever-furn, owed) | native on the puller (H-LF2); observed in native as a furniture note and reported by the use's owner as ObjectAnimation 71; played on every watcher's copy (this verb) |
| the puller's own body animation and seat | trace | none for a NoPlayer furniture (H-LF3: the branch touches neither); a furniture without the keyword (a chair, a workbench) seats its user through a created package, F4 below, parked |
| the lever's arm, Lever01 and RuinsLever, moving over about a second or two | trace (the probes' node-rotation reads) | the graph's own animation on each seat that plays the event (H-LF7 for its span and its end) |
| the graph's own events back (ObjectActivated among them, which fires the furniture's activation children through InitChildActivates) | engine (TESObjectREFR's graph sink, 20102) | native on each seat that plays the event; whether 0xaa8c3 has activation children is unread |
| the arm's final pose, for a late joiner | trace | kept nowhere, if the push ends at rest (H-LF7, the plan's read 8); a later version keeps it if a probe reads the arm off rest after the push |
| an NPC's use of a FURN with a graph (a grindstone, a lever an NPC's package works) | engine | the NPC's simulator's (the cell's host for the Temple), through the same report; few in play (H-F2, the [verb:furniture] tally) |

### Sequences and combinations (ADR-033)

| sequence or combination | probe or scenario | result |
| --- | --- | --- |
| the host pulls, the guest watches; the guest pulls after the host's closing activation, the host watches | x-lever-relay v1, b-lever-relay v1 | |
| the same pull again at a person's rhythm (a second pull inside the first's use is the script's busy state, empty) | owed: its own probe, after x-lever-relay v1 is green | |
| a late joiner after a pull (the arm at rest, nothing replayed) | owed: its own probe, after H-LF7 is read | |
| an NPC's furniture use with a graph | owed: its own probe, after H-F2's tally | |

## Ownership (ADR-063: ownership, not permission)

Owner: the use's owner: the furniture's recorded occupant's owner (a player's own seat, an NPC's simulator), else the cell's host.
It passes as the occupancy does: taken at the server's FURN branch on an activation, released at the closing activation or a dead
occupant.
Channel: ObjectAnimation 71, its shape unchanged; its owner rule moves to the server's Rust (object_animation.rs). No new message
and no schema change for this verb.
Content-specific code: none. The furniture note is a holder whose base is a FURN (`refr->GetBaseObject()->GetFormType() ==
RE::FormType::Furniture`) outside a script action, whatever its event's name; no lever pattern, no keyword list (the static read's
F1(b): a 'Lever*' pattern would be an allow-list).
Two seats: x-lever-relay v1, then b-lever-relay v1 (each watcher's arm read off its own pose before the pull).

## Authority

Rung: R2: the user's engine computes the event; the server checks the user and relays; kept nowhere.
Why this rung (R2 is the default, ADR-063): the event is the engine's idle pick for the furniture (24602 over the idle tree), which
the server has no graph or idle data to recompute; a wrong reporter is the one forgery that breaks the world (two owners), so the
user is checked against the occupant the server itself recorded.
What the server validates (rule 5), in wire-rules/src/object_animation.rs: the owner of a world object's graph event is, for a
FURN with a recorded occupant, that occupant's owner (a player's own user, or an NPC's simulator by WorldState::HostOf), and for
anything else the cell's host; refused E_OBJANIM_NOT_USER (new: a FURN whose occupant is another's) or E_OBJANIM_NOT_HOST (kept,
the host case); `keep` false for a FURN. The C++ shell keeps the actor, DOOR and CONT skips, the range checks and the per-reference
8 a second (ActionListener.cpp:3803-3870).
Rate limit / bounds: 8 a second per reference (today's E_OBJANIM_RATE); an event name within the wire's ANIM_EVENT bound.

## Engine surface

- CommonLibSSE-NG (b93280e8): TESFurniture (include/RE/T/TESFurniture.h: the flags :20-63, benchType :72-85 and +0xE0 :132, its
  vtable's slot 0x37 Activate :125); BGSDefaultObjectManager's kKeywordActivatorFurnitureNoPlayer, index 182 (:195), and
  kActionActivate, 55 (:68); IAnimationGraphManagerHolder's slot 1 NotifyAnimationGraph (IAnimationGraphManagerHolder.h:25); the
  holder at TESObjectREFR+0x38 (TESObjectREFR.h:112); ActionOutput's animEvent (ActionOutput.h:15); TESObjectREFR::ActivateRef
  (src/RE/T/TESObjectREFR.cpp:52-56); VTABLE_TESFurniture[0] (Offsets_VTABLE.h:499), VTABLE_TESObjectREFR[2] and [3] (:649),
  VTABLE_Actor[3], VTABLE_Character[3] and VTABLE_PlayerCharacter[3] (:2142, :2215, :2231).
- Address Library (1.6.1170, `just addr`, 2026-11-06 and 11-07): 19796 ActivateRef, 17420 TESFurniture::Activate (slot 0x37 of
  189309), 24602 the idle pick, 32901 NotifyAnimationGraph (slot 1 of 190265), 38048 the actor holders' slot-1 thunk (the fork's
  SendAnimation hook), 20102 TESObjectREFR's graph event sink, 14297 PlayAnimation_Impl, 56139 ObjectReference.Activate's native,
  401069 17420's activator compare (the player, H-LF8), 403521 PlayerCharacter's singleton (lever-furn-static.md section 9).
- The path, each step HYPOTHESIS from the decompile until x-lever-furn's trace reads it (the static read's section 4): the press is
  blocked on every seat, so ActivateRef sends the TESActivateEvent and skips default processing, and never reaches 17420 (H-LF1);
  the server answers the puller alone with OpenContainer, and the puller's client calls `activate(player, true)`, default processing
  only, under the platform's Override; ActivateRef calls the base's slot 0x37, TESFurniture::Activate, which refuses any activator
  but the player (*(401069), H-LF8), finds the NoPlayer keyword, asks the idle tree for ActionActivate with the lever as source and
  sends that idle's event to the lever's own holder, slot 1, NotifyAnimationGraph, synchronously (H-LF2, raised inside the client's
  own CallNative: H-LF4); nothing reaches the puller's graph and nothing seats the puller (H-LF3); the watcher's relayed
  `activate(figure, false)` is blocked, and 17420 would refuse the figure anyway (H-LF5).
- The platform's animation hook (FridaHooks.cpp OnSendAnimationEventEnter :676-714, installed on 38048 at :725-732): HYPOTHESIS
  H-LF6, frida-gum's attach follows the thunk's leading JMP (gum_interceptor_resolve, gum_x86_reader_try_get_relative_jump_target),
  so the hook sits on 32901 and sees every holder's events, a world object's included (x-object-anim v3 read a plate's Down and a
  wall's 180For there at ed7aa29a). It returns at :688 under Override, the first of four stops a lever event meets today (no lever
  pattern in objectAnimationService's EVENT_PATTERNS; the report from the cell's host alone; the server's E_OBJANIM_NOT_HOST).

## Observe (host or acting client sees the intent before the engine acts)

- Hook point: the platform's animation hook, enter and leave (:676-714, :716-723). A thread-local note stack: every enter pushes a
  note (empty unless it is a furniture note) and every leave pops one, so enter and leave pair under nesting whatever branch returns
  early. :688's one test splits in two: InScriptAction's return stays first (a script's own call on a FURN is the seam's), then the
  furniture note, then the Override return for every other holder. A furniture event never reaches the hook's JS handlers, so there
  is no PushAndWait into the JavaScript pool the update thread is waiting on (the plan's read 1: inside the client's own
  `activate(player, true)` that would never return) and no name pattern.
- SP filter (rule 9): a holder whose base is a FURN; one form-type read per graph event.
- Data captured: at the leave, with the return value read, the event "furnitureAnimation" {refrId, event, took} through
  AddTickTask, propContact's shape (FridaHooks.cpp:2236-2243). Line: "[verb:furniture] <refr> '<event>' to its own graph
  (taken|refused, thread <t>)", the first three per reference and every hundredth.
- If H-LF6 falls, the same handler is installed a second time on VTABLE_TESObjectREFR[3]'s slot 1 (Offsets_VTABLE.h:649, 190265),
  through CommonLib's vtable, never an address from memory.
- Side effects of hooking here: HYPOTHESIS (the stack's pairing under nesting is the build's to test at T1; the furniture events
  in play are few, H-F2).

## Impose (observers render the server's decision)

- Mechanism: the watcher's ObjectAnimationService plays the relayed ObjectAnimation as today (`play`, playRelayed: PlayAnimation
  on its own copy, the line "object animation <refr> <event> played (relayed, ...)"); for a non-actor PlayAnimation reaches the same
  32901 (the decompile of 0x140a2e8c0: HYPOTHESIS H-F1).
- Visual without simulation achieved by: the graph's own animation of Lever01 and RuinsLever on the watcher's copy; no seat, no
  body animation, nothing else (H-LF3).
- Side effects: HYPOTHESIS H-F1 (a watcher's PlayAnimation of the event moves its arm as the puller's engine did).

## Suppress (engine's own behavior blocked on non-hosts)

- What is suppressed: a watcher's report of its own relayed play. The watcher's PlayAnimation, a JS call under Override, is noted
  by the furniture branch too (outside a script action, Override or not), so ObjectAnimationService's self-played filter drops it,
  and C2's owner test passes only this seat's use or a reference in a cell hosted here; on the host the cell-hosted branch passes,
  so the self-played mark alone keeps the host's play of a guest's relay from going back out (E_OBJANIM_NOT_USER would catch the
  echo on the server).
- How: ObjectAnimationService's took and self-played filters (kept) and its FURN owner test (new, in place of isHostedHere for a
  FURN: an OpenContainer message's target kept by id in the message handler, so the mark is up before remoteServer's reply runs
  its `activate(player, true)`, lasting until the closing activation or USE_MS 20000, UNMEASURED, or while
  `getFurnitureReference()` names it; or the reference's cell hosted here, an NPC's use).
- Release condition: the closing activation, USE_MS, or the furniture reference leaving.
- Kill switch: setFurnitureAnimation(bool) in the platform, off by default; the client setting furnitureAnimation (default true)
  turns it on; with it off, the old branches stand (the A/B).
- The FURN activation block on every seat stands (objectReferenceEx.ts:128-141): the lab's activationUnblockedBases key names the
  lever's base but nothing in the fork reads it (the plan's read 9; the settings line retires at its next rewrite).
- Side effects: HYPOTHESIS until x-lever-relay's leg B reads no report from the host.

## Message contract

- Message name / numeric type: ObjectAnimation, MsgType 71, unchanged: {refr, event}, C2S from the use's owner, S2C relayed to the
  furniture's other listeners. No field, no schema change for this verb (the train's SCHEMA 40 is trigger-entry's and D-C3's).
- Validator rules: the server's object_animation.rs above; the wire's checks unchanged.
- Idempotency / ordering: an event, kept nowhere (the server's lastAnimation is written only when `keep` is true; a client's
  keepsFor never keeps a FURN), so a late join and a reload replay nothing (the plan's read 8).
- Contract doc updated: no change owed (ObjectAnimation 71's shape is unchanged); its owner rule's row in docs/WIRE.md is written
  from S3's code after it lands.

## Server

- Where the logic lives: wire-rules/src/object_animation.rs (new); OnObjectAnimation's host test (ActionListener.cpp:3856-3861)
  becomes it, with the occupant's facts (MpObjectReference.h:389, set at MpObjectReference.cpp:2276-2298), and lastAnimation
  follows its keep (:3875).
- Line: "[verb:traps] <refr> animates <refr> '<event>' in cell <c> (its user <u> reports): relayed to <n> game(s), not kept",
  today's line with the reference twice, keeping its "<refr> animates" head.
- DB fields / migration: none (kept nowhere).
- Restart behavior: nothing to restore; the occupant is not saved.
- Papyrus natives touched: none.

## Client

- SP binding: the "furnitureAnimation" event (EventManager.cpp's custom list, Definitions.txt, skyrimPlatform.ts: all three);
  setFurnitureAnimation(bool).
- TS handler: ObjectAnimationService (objectAnimationService.ts): "furnitureAnimation" pushes into the noted queue with furniture
  true; onUpdate keeps its took and self-played filters and takes the FURN owner test above; keepsFor never keeps a FURN.
- Kill switch config key: furnitureAnimation (default true).

## Tests

- T0: ObjectAnimationOwnerTest (the occupant's report accepted and not kept; another's E_OBJANIM_NOT_USER; a guest's non-FURN
  report still E_OBJANIM_NOT_HOST; an NPC occupant's simulator accepted); the wire-rules crate tests.
- T1: the Windows build (P2).
- T2: none owed (no wire change); the fifty train's sessions run beside.
- T3 scenario id: lab/scenarios/b-lever-relay.yaml (a draft in lab/.cache/drafts/fifty until x-lever-relay v1 is green; then its
  fresh review and its own commit).
- Probes (lab/.cache/drafts/fifty, by path): x-lever-furn v1 (the premise read), x-lever-relay v1 (the fix).
- Assertions that would fail if the verb silently regressed: the server's user line for each pull (relayed to 1, not kept); each
  watcher's arm off its own pose before the pull by more than 5 degrees over its samples; each watcher's relayed play and no report
  from it; no E_OBJANIM_ line (b-lever-relay v1).

## The fix shapes the read weighed (lever-furn-static.md section 8, the plan's retirements)

- F1, taken: ObjectAnimation 71 from the furniture's user, observed in native at the furniture's own graph (a), as a family by form
  type, not a name (b), its reporter the occupant (c). The static read's first option for (a), narrowing the Override test to the
  calling thread, does not reach the lever: the event is raised on the calling thread inside the platform's own call, where
  PlatformCall's thread-local depth is up as well (the plan's read 1).
- F2, rejected: each watcher runs the NoPlayer branch itself by lending its own player as the activator (17420 refuses a figure);
  ActivateRef's tail then dispels that player's altered states and 17420 writes its +0x928: side effects on the wrong actor.
- F3, rejected: ScriptCall 75 does not apply; no script native animates the lever (the disassembly).
- F4, parked behind H-LF3: the figure's own furniture enter and pull, needed only if the puller's graph takes a furniture event;
  for any FURN without the keyword (chairs, workbenches) it is the open question regardless, through a created package
  (PutCreatedPackage, Actor.h:421) on a puppet, which the fork warns against outside its furniture (formView.ts:1300-1305).

## Dynamic plan (fill when any tag above is still HYPOTHESIS)

- Frida script: lab/frida/lever-furn-trace.js (thuum branch r50-reads, 45decb9e: the furniture activation path and every graph event
  on the lever and the two players during a pull, ACCURATE and FUZZY backtraces), run on both seats by x-lever-furn v1.
- The hypotheses and the one observation that settles each (lever-furn-static.md section 7; the plan's section 4):

| id | claim | the one observation | read by |
| --- | --- | --- | --- |
| H-LF1 | the press never reaches 17420; only the reply's default-only activation does, on the puller alone | the puller's activateRef rows, blocked then default-only with furnitureActivate inside | x-lever-furn v1 |
| H-LF2 | the NoPlayer branch sends one event, 'Lever_PlayerPush', to the lever's graph, synchronously | the idle and notify rows inside furnitureActivate | x-lever-furn v1 (premise: P2 waits for it) |
| H-LF3 | the puller's own graph gets no furniture event and is never seated | no notify on 0x14 with a furniture word; after.sit 0; no "to be false" line | x-lever-furn v1 (a fall wakes F4) |
| H-LF4 | the event is raised inside the client's CallNative, under Override | notify's `in` names a native whose caller is SkyrimPlatformImpl.dll | x-lever-furn v1 |
| H-LF5 | the watcher's lever and the puller's figure receive nothing today | no furnitureActivate, idle, notify or graph event on the watcher's lever; its arm within 2 degrees | x-lever-furn v1 (claim 6) |
| H-LF6 | the platform's animation hook sits on 32901 | the ready row's notifyGraph bytes begin e9 while the thunk's equal Ghidra's | x-lever-furn v1 (premise) |
| H-LF7 | the push ends at rest | each puller's third sample against its pose before the pull | x-lever-furn v1, x-lever-relay v1 (recorded; decides read 8's keep) |
| H-LF8 | 401069 holds the player | the ready row's activatorCompare.equal | x-lever-furn v1 |
| H-F1 | a watcher's PlayAnimation of the event moves its arm as the puller's engine did | each watcher's Lever01 and RuinsLever off its own rest after the relay | x-lever-relay v1 (claim 2) |
| H-F2 | furniture graph events in play are few | the [verb:furniture] tally over the stage's runs | recorded |

- Breakpoint plan for a human session: none needed while the traces answer.
- Owner: agent (Frida).

## Status

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

Play: BROKEN, playtest 49 (2026-11-06, docs/verbs/traps.md "Playtest 49"; Eli: "lever anim only plays on one screen though,
whoever flips it").
