# Verb: cast-action

## Intent

A player's cast looks on every other screen as it looks on the player's: the
figure plays the caster's own actions (the hand's attack, ready, release and
interrupt, the dual cast's, the voice's) through the engine's action entry,
with the caster's graph variables, so a Flames stream starts and stops, a
Firebolt winds up and leaves the right hand, a Self cast and a dual cast
show their idles, and a spell whose effect stays home (the teleport) still
shows its cast.

Roadmap reference: skymp/ROADMAP.md "Animation events" and "Spells".
Milestone: M2 (playtest eighteen's hands, docs/PLAN.md M2 item 2)   Class: B

## The model this verb fixes in place (Eli, 2026-10-14; the plan of that night)

Two axes, one rule each:

1. Animation: the figure plays the caster's actions. Every BGSAction the
   caster's actor performs is captured at the engine's one entry point and
   replayed on the figure through the same entry point, variables first.
   R3 visual state, declared here. Withheld spells show their animations too
   (Eli: "it makes it feel more alive, and that's a valid design choice for
   gaming"). Melee stays on the event relay it has (attackStart and kin; the
   server's AnimationSystem reads those names for stamina, bash and stagger).
2. Effect: the server decides, and relays only what every game may run
   (spell-cast R1, ADR-028's numbers, the AddTarget refusal, self-cast's
   states, cast-teleport's withheld relay). Unchanged by this verb except for
   two sender rules: the client reports every cast and every shout release
   and lets the server judge it; the hand a cast reports is the hand whose
   action performed it, never a fallback.

## Inventory (ADR-031: the action's consequences, before its rung)

The action is a cast seen from another screen. From the recordings and the
engine's chain (below); the reference traces are the solo casts listed under
Tests.

| consequence | seen in | disposition |
| --- | --- | --- |
| the hand's start idle (MRh_/MLh_SpellAimedStart, ...ConcentrationStart, ...SelfStart, DualMagic_...) with the want and casting variables | trace | imposed: the Attack action replayed with the caster's variables |
| the ready idle (M[LR]h_SpellReady_Event) at the charge's end | trace | imposed: the Ready action replayed |
| the release idle (M[LR]h_SpellRelease_Event) and the spell's launch or application | trace | imposed: the Release action replayed; the effect by axis 2 (the relayed SpellCast's castSpellImmediate or Projectile::Launch, or nothing for a withheld spell) |
| the concentration loop held while the stream runs | trace | imposed: the figure's graph holds it while the casting variables stand (the 500 ms snapshot's casting group masked on a casting figure) |
| the exit, M[LR]h_Equipped_Event after the Interrupt action | trace | imposed: the Interrupt action replayed on the relayed interrupt; the figure's stream ended by InterruptCast, not FinishCast |
| the dual cast's idles (kActionDualAttack, kActionDualRelease) | record, trace | imposed: the same replay; the perk lives in the caster's game, the idle in the action data |
| the voice's actions (kActionVoice, VoiceRelease) | trace | imposed: the same replay (the shout's effect stays shouts' relay) |
| the casting art on the hands and the magic node the bolt leaves from | engine | native: the figure's graph attaches them for the idle it plays (HYPOTHESIS: the magic node of a figure that never charged through its caster) |
| the spell's sound at the release | trace | native in the caster's game; HYPOTHESIS which part the replayed action plays (the idle's sound events) |
| magicka spent | engine | the server's (spell-cast); the figure's never changes |

## Authority

Rung: R3 for the animation (client-local visual state, no server record);
the cast and its effects keep spell-cast's R1 and ADR-028's R0.
Why this rung and not the one above it: an action's replay changes nothing
the server owns; what the caster did is already judged by the SpellCast it
sends. The relay carries it as it carries UpdateAnimation, unvalidated
beyond shape.
What the server validates: the UpdateAction message's shape (bounds, finite
floats); nothing of its content.
Rate limit / bounds: a casting player performs at most a few actions a
second (attack, ready, release, interrupt per hand); a budget of 16 at once
and 8 a second only ever stops a flood.

## Engine surface

- The engine performs every graph-facing step of a cast as an action
  through one entry (the re-analyst on sky-re, 2026-10-14, 1.6.1170, ids by
  lab/addr.py; HYPOTHESIS until a trace): CastSpell 34401 sets the spell
  and asks RequestCastImpl 34136 (CheckCast 34145, the want variable
  through 37950); the graph's response handler (42820 right, 42819 left,
  42821 voice) calls StartCharge 34443, whose StartChargeImpl 34137
  performs the hand's Attack action through SourceActionMap::DoAction
  34202 (CommonLibSSE-NG src/RE/S/SourceActionMap.cpp:27-32; the actions
  include/RE/B/BGSDefaultObjectManager.h:58-76); the charge timer in
  UpdateImpl 34400 ends in StartReadyImpl 34138 (the Ready action; for
  concentration StartCast 34445 at once); StartCastImpl 34139 performs the
  Release action; the graph's fire event reaches the Fire handler 42817,
  Fire 34407, FindTargets 34410 (Projectile::Launch 44108 for a bolt, the
  caster's own MagicTarget for Self). Nothing in the caster releases a
  non-player's charged spell: kReady waits for StartCast 34445 or the
  Release action. The concentration exit is InterruptCast 34408, whose
  InterruptCastImpl 34140 performs the Interrupt action; FinishCast 34435
  then drops the want variable and kills the stream's projectile.
- The action entry (the re-analyst on sky-re, 2026-10-14 night, every id
  1.6.1170's by lab/addr.py; HYPOTHESIS until action-trace.js confirms it in
  the probes): TESActionData (include/RE/T/TESActionData.h, Ctor
  RELOCATION_ID(15916, 41558)) over ActionInput (source, target, action,
  unk20; include/RE/A/ActionInput.h) and ActionOutput (animEvent,
  targetAnimEvent, result, sequence, animObjIdle, sequenceIndex;
  include/RE/A/ActionOutput.h), flags at 0x58, 0x60 in all, the layout the
  decompiles use field for field. DoAction 34202 builds it on the stack
  (unk20 = 2, the source and the action, no target, flags 0) and calls its
  Process (vslot 5, 41557), which calls ActorMediator::PerformAction 38949
  on the mediator singleton (403567 holds the pointer its constructor
  38948 stores). TiltedEvolution's five numbers are these ids themselves,
  no SE-to-AE translation. PerformAction, (ActorMediator*, TESActionData*)
  -> bool: (1) false without a BSAnimationGraphManager; (2) unless flags
  bit 1, the validators (39002: ragdoll, bIsSynced, the sprint, draw, bow
  and sneak gates; 37147: the idle chosen from the actor's idle tree by the
  action's index and its conditions, 24602, written as animEvent and
  animObjIdle, UNLESS animEvent is already set, which it takes as is;
  39003: the attack data's stamina; 32802: the paired manager); (3) flags
  bit 0: flags = 2 and true, nothing performed (the engine's dry run); (4)
  the perform: the sequencer for sequence idles (14999), the paired
  counterpart (32803), NotifyAnimationGraph of animEvent on the source's
  holder (43567, the virtual at 32901), then the post step 39004 with the
  graph's answer. 38953 is the tail alone, steps (4) and the post step,
  with no code caller in 1.6.1170: it performs a data as given, which is
  what the figure needs (its own conditions would choose its own idle,
  without the perk, in the wrong hand). 39004 is the engine's ActorState
  bookkeeping keyed by the event name (sneak, block, bow draw, the sync
  ints for sprint, move and turn); cast events match none of it, and both
  entries call it already, so a replay never calls it again: it is not the
  master-behavior variables, which Skyrim Platform's existing
  applyAnimationVariablesToActor writes. The event is empty on entry and
  chosen on exit for every DoAction-originated call, so the capture reads
  the data at the leave; unk20 is read by nothing in the chain, so the
  replay carries what the capture carried. Callers of 38949 besides
  Process: 38951 (the sequencer's continuation), 38063 (an idle preset
  from a TESIdleForm, unk20 0), nine Actor-region sites; of Process, 45,
  the four caster impls (34137 Attack, 34138 Ready, 34139 Release, 34140
  Interrupt, each indexing the per-source table at 380331: left 45..48,
  right 49..52, voice 60..63) and PlayerControls::DoAction 42350 among
  them. The bypass: NotifyAnimationGraph itself (32901, the base 24
  vtables share; the Actor's thunk 38048 is where Skyrim Platform's
  sendAnimationEvent hook sits), whose virtual callers cannot be listed
  statically; whether DrawWeaponMagicHands goes through an action is
  unread. A remote replay through 38953 can fail only on a missing graph
  manager or the graph's own refusal of the event. Ghidra names and plate
  comments saved on sky-re for all of these.
- The records (Skyrim.esm by lab/esm.py on sky-srv, 2026-10-14): the
  actions are AACT forms, ActionLeftAttack 0x13004, ActionRightAttack
  0x13005, ActionVoice 0x13008, ActionLeftRelease 0x13451, ActionLeftReady
  0x13452, ActionLeftInterrupt 0x13453, ActionRightRelease 0x13454,
  ActionRightReady 0x13455, ActionRightInterrupt 0x13456, ActionVoiceRelease
  0x13457, ActionVoiceReady 0x13458, ActionVoiceInterrupt 0x13459,
  ActionDualAttack 0x50C96, ActionDualRelease 0x50C97 (the DEFAULT_OBJECTs
  SourceActionMap names). The idles carry the graph event in their ENAM:
  CastRightConcentrationAimed 0x1346F (MRh_SpellAimedConcentrationStart),
  CastRightFireForgetAimed 0x1346C (MRh_SpellAimedStart),
  CastRightFireForgetSelf 0x1407B (MRh_SpellSelfStart), ReadyLeft 0x13464
  (MLh_SpellReady_Event), MagicRightRelease 0x205F6 (MRh_SpellRelease_Event),
  ReleaseLeft 0x13465, InterruptRight 0x13460 (MRh_Equipped_Event),
  InterruptLeft 0x13463, CastLeftConcentrationAimed 0x13469,
  CastLeftFireForgetAimed 0x13467, DualMagicConcentrationAimed0 0x35B9A
  (DualMagic_SpellAimedConcentrationStart), DualMagicFireForgetAimed 0x35B95,
  DualMagicFireForgetSelf 0x35B96, VoiceStart 0x13F40 (shoutStart); 94 idles
  name a cast event in all. The probes replay these by id until the hook's
  capture names the ones the caster's engine chose.
- Casters and graphs update only for actors with AI processing on
  (kProcessMe) in high or middle-high process; a figure is an NPC in high
  process with AI on (skymp5-client never disables it; formView.ts sets
  Aggression only).
- Measured on the relay as it is (2026-10-14): x-figure-cast4
  (20261015-030717) refused a scripted MRh_SpellAimedStart 0, 1, 2 and 3
  updates after bWantCastRight alone; x-left-firebolt (-031632) and
  x-self-anim (-031853) had the figure take the left-hand Firebolt's and the
  Self cast's start, ready and release when the caster's variables landed
  about 20 ms before the start; x-flames-stop (-031410) left the figure's
  IsCastingRight at 1 for 11 s after the caster released;
  x-left-firebolt2 (-035333, Firebolt in both hands, cast left) launched
  from the right in the observer's game both times (Skyrim Platform's
  castingSource fallback, EventHandler.cpp ~1346-1451).

## Observe (host or acting client sees the intent before the engine acts)

- Hook point: ActorMediator::PerformAction in Skyrim Platform, native,
  filtered to the player (rule 9), raising `actionPerformed` with the action
  form id, the idle form id, the event name, the input type bits and the
  actor's master-behavior variables (getAnimationVariablesFromActor's set).
- SP filter: the player's actor only (hosted actors a later slice).
- Data captured: as above; the SpellCast message keeps its own fields.
- Side effects of hooking here: none expected (a read at the entry);
  HYPOTHESIS until the trace shows PerformAction is where every cast action
  passes (the re-analyst's Q4).

## Impose (observers render the server's decision)

- Mechanism: a Skyrim Platform export beside castSpellImmediate,
  performAction(actor, action, idle, eventName, type) (MagicApi.cpp on fork
  m2-cast-action), building the TESActionData on the stack with the event
  and idle the caster's engine chose and performing it through the replay
  entry 38953, after the caller has put the caster's variables on the
  figure through the existing applyAnimationVariablesToActor; the figure's relayed interrupt ends its stream
  through MagicCaster::InterruptCast (include/RE/M/MagicCaster.h:79)
  instead of FinishCast.
- Visual without simulation achieved by: the idle the caster's engine
  chose, played by the figure's graph; the effect decided apart.
- Side effects: HYPOTHESIS (P1 to P4 below): the figure's graph takes the
  replayed action and holds the loop; the Interrupt action produces the
  Equipped exit; the dual idle plays without the perk; the Self idle plays.

## Suppress (engine's own behavior blocked on non-hosts)

- What is suppressed: the relay of the hands' and voice's cast events
  (MRh_, MLh_, DualMagic_ Spell* and the Equipped events) to figures, once
  the action path carries them; the casting group of the 500 ms snapshot
  on a figure whose cast is in flight (IsCastingRight 67, IsCastingLeft 68,
  bWantCastLeft 71, bWantCastRight 72, bCastReady 82, IsCastingDual 120 in
  the master-behavior list), masked with the figure's own values.
- How: sync/animation.ts' relay filter; remoteServer.ts
  onUpdateAnimVariablesMessage's mask.
- Release condition: none.
- Side effects: none expected.

## Message contract

- Message name / numeric type: UpdateAction, MsgType 44 (wire id 52),
  schema 14 (fork m2-cast-action 9de6f123). The plan said 45; the branch
  leaves 05192845, where the last message is 43, and wire-schema's test
  keeps the ids contiguous, so this verb takes 44 and the unmerged
  PlayerGlobals renumbers to 45 when it lands: first to merge takes the
  next number.
- Direction: client to server, relayed to the actor's neighbours but the
  sender (OnUpdateAction, as RelayCast skips the sender; UpdateAnimation
  echoes to it); reliable both hops (the start of a cast must arrive;
  UpdateAnimation's unreliable hops are why the wind-up was lost).
- Fields: idx u32; action u32 (the BGSAction's form id); idle u32 (the
  TESIdleForm's, 0 for none); eventName String<ANIM_EVENT> (128 bytes, the
  same cap as UpdateAnimation's event); type u32, serialized "type" (the
  ActionInput's unk20, 2 for everything the player does); actorAnimationVariables
  (the ActorAnimationVariables shape SpellCast carries: three byte vectors,
  8 KiB each at decode).
- Validator rules (wire-validate, 9de6f123): action != 0, eventName not
  empty (the replay entry sends the event as given), type <= 255
  (E_VAL_RANGE); a budget of 12 at once, 6 a second (E_VAL_RATE: a cast is
  three actions, from two hands at once); the strings and vectors bounded
  at decode. The variables are packed bytes, so there is no float to check.
- Idempotency / ordering: in order per sender on the reliable channel; the
  observer performs them in arrival order, one per two updates (its
  variables, then the action), at most 16 queued per figure.
- Contract doc: this section is the contract (docs/WIRE.md describes the
  families, not each message); the fixtures 44-UpdateAction-0/1 and the C++
  and TypeScript types came with the commit.

## Server

- Where the logic lives: ActionListener::OnUpdateAction (fork 303a85d7)
  relays the bytes as the wire validated them to every user listening to the
  actor but the sender, reliably, for the actor the sender may update
  (ActorUpdatableBy, OnUpdateAnimation's check); nothing recorded. The
  validation is Rust's (wire-validate); the C++ handler is a relay, the
  legacy shape, since the neighbours live in the C++ world state.
- DB fields / migration: none.
- Restart behavior: none.
- Papyrus natives touched (ledger lines added): none; performAction is a
  Skyrim Platform JavaScript export like castSpellImmediate, not a Papyrus
  native, so rule 10's ledger has no row for it; this doc declares it R3
  (client-local visual state).

## Client

- SP binding (fork 0d69f6fe): the hook on 38949 and the export
  performAction, JavaScript exports beside castSpellImmediate (no Papyrus
  native, so no .psc); the codegen declares ActionPerformedEvent and
  performAction; the client's typings (clientListener.ts) augment the npm
  module as for poisonApplied. A handler of actionPerformed may make no
  game call (Skyrim Platform's tick context: "'Form.getFormID' can't be
  called in this context", x-figure-action 20261015-053450); the sender
  builds its message there and sends it on the next update.
- TS handler (fork 3f8d8f77): services/services/actionSyncService.ts sends
  the hands' cast actions (events MRh_, MLh_, DualMagic_: the starts, ready,
  release and the Equipped exit) as UpdateAction, reliable, in order;
  remoteServer.ts queues them per form (actionQueue, 16 at most);
  view/formView.ts performs each through performAction, the caster's
  variables on one update and the action on the next (replayActions), the
  held-start logic gone (castStartWaiting, castStartHeldSince,
  castStartCastingSeen); sync/animation.ts no longer relays those events
  (they would play twice, and the Equipped exit, rewritten into
  SkympFakeEquip, never reached a figure); magicSyncService.ts sends only
  the player's own casts and its hosted actors' (a figure's
  castSpellImmediate raised the event too, refused by the server per cast).
  The hand a cast reports is fixed where it was wrong, in Skyrim Platform's
  EventHandler (fork 965cf222): any caster state but kNone names the hand,
  since an idle hand holds its equipped spell as currentSpell too. The end
  of a figure's stream stays FinishCast (the existing interruptCast native):
  the Equipped exit arrives as the Interrupt action, so the caster's own
  InterruptCast, which would perform that action a second time, is not
  needed. No sync/figureCast.ts: the action carries its own variables and
  the SpellCast its own spell, and nothing had to reconcile them in the
  probes; it returns if a staged run shows the two fighting.
- Not in this slice: the voice's actions (shoutStart keeps the event relay,
  which works) and melee (Eli: attackStart and kin stay, the server's
  AnimationSystem reads them); shoutService's 3 s hit window (the god-mode
  breath, its own small change, next).
- Kill switch config key: none planned; the relay filter is the switch
  (restoring the events restores today's look).

## Tests

- T0 (green, 9de6f123): the UpdateAction validator (no action, an empty
  event, a type past 255, the budget's thirteenth in a second refused, the
  fourteenth a second later taken); wire-schema's id and fixture tests;
  wire-json's round trip of the two generated fixtures.
- T1: the lab's probes stand for it (an engine call in a running game, as
  Stagger): the hook and performAction on 1.6.1170, x-figure-action and
  kin below.
- T2: difftest session cast-action (fork e3648112): c1's three cast actions
  relayed to c2 on the wire stack (three UpdateAction, declared), none on
  the legacy stack, which knows no MsgType 44; the declarations are the
  first run's to confirm.
- T3 scenario id: lab/scenarios/b-spell.yaml (thuum cast-action 0d44f4b,
  its own commit, rule 13): took("MRh_Equipped_Event") >= 1 on c1's figure
  after the Flames hold (finding 1), and a watch around the Firebolt cast
  with took("MRh_SpellAimedStart") >= 1 and took("MRh_SpellRelease_Event")
  >= 1 (the wind-up); the start and the drain pair stay. A left-hand cast,
  the Self cast and the dual cast are the parity scenarios' below.
- Parity (ADR-031): references of the engine alone, solo: r-spell-stream-a
  and r-spell-bolt-a (recorded 2026-10-14 night, green), their left-hand
  variants, dual-cast Flames with the perk, a Self cast (r-self-invisibility-a,
  recorded), the teleport's cast, Flames' B role (an NPC that really
  streams); then p-spell-stream, p-spell-bolt (with left-hand variants),
  p-spell-self and p-spell-dual diff the figure's view against them, so
  "starts but never stops" (MRh_Equipped_Event missing), the wrong hand
  (MLh_ missing, MRh_ extra), a missing Self animation and a missing dual
  idle each fail the gate.
- Assertions that would fail if the verb silently regressed: the Equipped
  exit on the figure; the left hand's events on a left-hand cast.
- Also in this verb's train, each with its own probe: the shout gate
  (x-tgm-breath4 rerun: four launches in the observer's game, not three);
  the sender's hand (x-left-firebolt2 rerun: source 0 both times).

## Dynamic plan (fill when any tag above is still HYPOTHESIS)

- Step 1 (done 2026-10-14 21:35): the re-analyst's read above; every id
  confirmed against addrlib by `just addr`.
- Step 2 (built 2026-10-14 21:40, fork m2-cast-action 0d69f6fe): the hook
  on 38949 (the player's data only, dry runs and refused calls left out,
  read at the leave, a per-thread stack for the mediator's re-entry; the JS
  event actionPerformed with the action, idle, event, type, flags, result
  and the variables as they were when the graph was asked) and the export
  performAction(actor, action, idle, eventName, type), which builds the
  TESActionData on the stack as DoAction does and calls 38953; both AE
  only. The Windows build on the mirror (run 38683079932). Thuum branch
  cast-action feebd30: the driver keeps the player's recent actions with
  their variables and figure-action replays them ({replay: all} at the
  original spacing, {replay: {action: id}} the last of one action), the
  recorded variables applied to the target first through
  applyAnimationVariablesToActor; lab/frida/action-trace.js logs 38949,
  38953 and the cast-shaped events at 32901 on the player and the figures.
- Step 3, the probes (x- files by path, ADR-009), each in c1's own game:
  c1 casts, its hook records the actions, c1's driver replays them on c2's
  figure, c2 holding the same hands drawn (a caster's figure mirrors the
  caster's hands; an unarmed figure has no cast transition and refused
  every replay, 20261015-053450 and 053807 round one). x-figure-action
  (P1), -bolt (P3), -self (P4), -dual (P2), and x-action-trace-input (the
  trace, taken apart from the console steps: a frida step right before a
  console step on the same client left the console unopenable, 052852 and
  053059).
- Measured 2026-10-14 22:28 to 23:08 PDT, all green: P1 holds, and with it
  P2, P3 and P4, under one rule, the caster's variables on one update and
  the action on the next. A replay in the same tick as its variables was
  refused every time on an armed figure (P1 055039 round one, -self
  054049 both rounds, -dual 054336); one update later (figure-action
  delayFrames 1): Flames' start and release taken, the loop held the 4 s,
  the Interrupt's Equipped exit taken and IsCastingRight down 196 ms
  after, the engine's own timing (055039 round two; the screenshots show
  the figure's raised, burning hand, then the hand down); Firebolt's start,
  ready and release taken twice (055907); Invisibility's Self start, ready
  and release taken twice (060152); the dual cast taken on a figure without
  the perk (060444). The dual answer: the engine performs a dual cast as
  the LEFT hand's actions carrying the dual idle (ActionLeftAttack 0x13004
  with DualMagicConcentrationAimed0 0x35B9A, ActionLeftRelease 0x13451 with
  ReleaseLeft 0x13465, ActionLeftInterrupt 0x13453 with InterruptLeft
  0x13463); ActionDualAttack never appears, so the perk's idle travels in
  the action data. The capture, every probe: Flames is Attack 0x13005 with
  CastRightConcentrationAimed 0x1346F and Release 0x13454 with
  MagicRightRelease 0x205F6 in one tick, then Interrupt 0x13456 with
  InterruptRight 0x13460 at the key-up; Firebolt and Invisibility are
  Attack with 0x1346C or 0x1407B, Ready 0x13455 with idle 0x42BEB, Release
  with 0x205F6; type 2 always.
- The trace (x-action-trace-input 055622, action-trace.js on c1): each of
  the caster's actions enters 38949 with an empty event and leaves with the
  chosen idle's event, type 2, result 0, the graph notified inside the call
  (ret 1); each replay is one 38953 call answered true, its notify taken.
  So the read holds, with one correction: BGSAction's index field is its
  own numbering (right attack 65, release 53, interrupt 51), not the
  DEFAULT_OBJECT positions. Injected key input survives a frida attach
  (the cast under the trace happened); only the console menu failed to open
  after one. The figure's AI probes an idle every 16 ms through 38949's dry
  run (flags 1, result -1), which the capture skips.
- The re-analyst's second read (the "cancel", 23:00): there is none. The
  graph's response handler (42820 right, 42819 left) runs StartCharge only
  when the hand's caster is in the requested state and is a no-op on an
  idle one; the only writer of bWantCast false is FinishCastImpl 34141,
  reached from FinishCast 34435 by paths that all need a current spell or a
  caster state; the caster's Update never reads the want variable. So the
  same-tick refusal is the graph's own one-update latency (it enters the
  cast-request state at its next update), and the later resets the probes
  saw were the graph's exit from that state or the other player's 500 ms
  snapshot. Nothing a replay sets provokes the engine, and the sync needs
  no mask on the snapshot: the caster's own snapshot carries the caster's
  casting state. HYPOTHESIS still: the graph's reset of the want variable
  (a modifier in the behavior file, not the exe).
- Owner: agent. If P1 fails: the fallback, the figure's own caster
  (CastSpell 34401 with kSkipCheckCast, StartCast 34445 at the relayed
  release, InterruptCast at the end), with the server's withheld relays
  deciding which spells a figure casts for real.

## Status

- [x] doc complete, inventory listed with a disposition per row, rung declared
- [x] engine surface cited or delegated (the action path read 2026-10-14, its ids confirmed by addr.py, the chain confirmed live by action-trace.js 20261015-055622)
- [x] server logic + T0 (the relay 303a85d7; the validator's tests 9de6f123)
- [x] message + validator (same commit, 9de6f123)
- [x] native hook + T1 (0d69f6fe; the probes 055039, 055907, 060152, 060444)
- [x] TS handler (3f8d8f77)
- [ ] T2 green (the session e3648112 waits for the staged server)
- [ ] T3 scenario green, no HYPOTHESIS tags (b-spell 0d44f4b waits for the staged build)
- [ ] parity scenario green, or its later list reviewed with it (ADR-031)
- [x] ledger and suppression registry updated (no Papyrus native; the suppression is the relay filter, named under Suppress)
