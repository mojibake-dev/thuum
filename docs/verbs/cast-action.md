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
- The action entry: TESActionData (include/RE/T/TESActionData.h, Create and
  Ctor RELOCATION_ID(15916, 41558)) over ActionInput (source, target,
  action, include/RE/A/ActionInput.h) and ActionOutput (animEvent,
  targetAnimEvent, result, sequence as the idle, animObjIdle,
  include/RE/A/ActionOutput.h); the mediator that performs it
  (ActorMediator: RTTI in include/RE/Offsets_RTTI.h:2486, no methods in the
  headers). TiltedEvolution's map: PerformAction (SE 38949) is the capture
  point, a sibling that performs a TESActionData whose idle is set (SE
  38953) plus a variables step (SE 39004) is the replay. Their 1.6.1170
  counterparts: UNKNOWN, delegated to the re-analyst 2026-10-14 (from
  DoAction 34202's own call after it builds the TESActionData).
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

- Mechanism: a new Skyrim Platform native, TESModPlatform.PerformActionOnActor
  (actor, actionId, idleId, eventName, type, variables), building a
  TESActionData with the idle set, loading the variables, performing it
  through the replay entry; the figure's relayed interrupt ends its stream
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

- Message name / numeric type: UpdateAction, MsgType 45 (wire id 53).
- Direction: client to server, relayed to the neighbours as UpdateAnimation
  is; reliable both hops (the start of a cast must arrive; UpdateAnimation's
  unreliable hops are why the wind-up was lost).
- Fields: idx u32; action u32 (the BGSAction's form id); idle u32 (the
  TESIdleForm's, 0 for none); eventName string (cap 64); type u8 (0 to 7);
  variables (the ActorAnimationVariables shape SpellCast carries).
- Validator rules: finite floats; eventName within its cap; type in range;
  the variables' arrays within their caps; a budget of 16 at once, 8 a
  second.
- Idempotency / ordering: in order per sender on the reliable channel; the
  observer replays in arrival order, one per update, the newest alone for a
  figure it first sees.
- Contract doc updated: with the commit (docs/WIRE.md, schema 15).

## Server

- Where the logic lives: ActionListener::OnUpdateAction relays the raw
  bytes to the neighbours (OnUpdateAnimation's shape); nothing recorded.
- DB fields / migration: none.
- Restart behavior: none.
- Papyrus natives touched (ledger lines added): none on the server;
  PerformActionOnActor is client-side (R3) and gets its NATIVES.md row.

## Client

- SP binding: the hook and the native above; Skyrim Platform's declarations
  (codegen skyrimPlatform.ts, Definitions.txt), the .psc and .pex through
  lab/pex.py add-native.
- TS handler: a sender service beside magicSyncService.ts (actionPerformed
  to UpdateAction, reliable, in order; magicSyncService sends only the
  player's own casts); sync/figureCast.ts, one home per figure and hand
  (the last action's hand and spell; the relayed SpellCast confirmed against
  it, a message for a hand not casting falling back to castSpellImmediate;
  the interrupt ending it through InterruptCast); remoteServer.ts queues
  UpdateAction per form and view/formView.ts replays it through
  PerformActionOnActor, the held-start logic gone (castStartWaiting,
  castStartHeldSince, castStartCastingSeen); magicSyncService.ts takes
  castingSource from the hand of the last cast action; shoutService.ts
  reports by release (its 3 s hit window dropped).
- Kill switch config key: none planned; the relay filter is the switch
  (restoring the events restores today's look).

## Tests

- T0: the UpdateAction validator (bounds, a string past its cap, a type out
  of range, the budget); the sender's ordering.
- T1: none (an engine call in a running game, as Stagger).
- T2: difftest session cast-action: c1's UpdateAction relayed to c2 on the
  wire stack, refused as an unknown MsgType on the legacy stack (the
  divergence listed).
- T3 scenario id: lab/scenarios/b-spell.yaml, grown past "the figure took
  the start" (:67-69): took("MRh_Equipped_Event") >= 1 on the figure after
  the Flames release; took("MRh_SpellAimedStart") >= 1 after Firebolt; a
  left-hand cast's MLh_ events on the figure; the Self cast's start taken;
  the dual cast's start the dual idle's; the drain pair as long as the
  figure's magicka falls. Its own commit (ADR-009, ADR-016, rule 13).
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

- Step 1 (read-only, in hand): the re-analyst resolves PerformAction, the
  replay entry and the variables step for 1.6.1170, the TESActionData
  fields a replay must set, and PerformAction's early returns on an NPC.
- Step 2: the hook and the native on fork branch m2-cast-action, the Windows
  build through the mirror; the driver's `figure-action {actionId, idleId,
  eventName, type}` step (on the nearest other actor) and a solo capture
  step that records the player's own actions.
- Step 3, probes on the staged branch: x-figure-action (P1: c1 holds Flames
  drawn; c2 replays the captured Attack action with c1's variables on c1's
  figure, then the Interrupt action; the figure's IsCastingRight and events;
  screenshots), x-figure-action-bolt (P3: the Attack, Ready and Release of
  Firebolt, right and left), x-figure-action-dual (P2) and
  x-figure-action-self (P4).
- Expected: the figure's graph takes each replayed action and plays its
  idle; the Interrupt produces MRh_Equipped_Event and the casting variables
  fall; the dual and Self idles play.
- Owner: agent. If P1 fails: the fallback, the figure's own caster
  (CastSpell 34401 with kSkipCheckCast, StartCast 34445 at the relayed
  release, InterruptCast at the end), with the server's withheld relays
  deciding which spells a figure casts for real.

## Status

- [ ] doc complete, inventory listed with a disposition per row, rung declared
- [ ] engine surface cited or delegated (delegated 2026-10-14: the action path's ids)
- [ ] server logic + T0
- [ ] message + validator (same commit)
- [ ] native hook + T1
- [ ] TS handler
- [ ] T2 green
- [ ] T3 scenario green, no HYPOTHESIS tags
- [ ] parity scenario green, or its later list reviewed with it (ADR-031)
- [ ] ledger and suppression registry updated
