# D-S3's build: traps follow the interaction (design read, 2026-11-05 ~08:5xZ)

A read-only design agent's plan for ADR-068's D-S3 (accepted by Eli 2026-11-05 08:04Z), against fork m4-scripts-2-seam at
7ee68bd7, condensed here by thuum-cf. Every file:line below is that head's; the census's disassembly (lab/pex.py over the lab's
archives, docs/research/trap-census-2026-11-05.md) gives the scripts' parent classes and instruction numbers. Inferred facts are
HYPOTHESIS until a probe reads them.

## Findings that change how D-S3 reads

- F1. The family as accepted (the class chain of TrapBase, TrapTriggerBase, TrapHitBase) leaves out three trap scripts:
  TrapFallingOilLampColLayer extends ObjectReference (USSEP and vanilla), TrapOilPool extends TrapExplosiveGas which extends
  ObjectReference, trapRockfallEffects extends ObjectReference. Inside the family: PressurePlate, Tripwire, SoundTrap, TrapLever
  (TrapTriggerBase); MovingTrap (so TrapSwingingWall, BladeTrap), DartTrap, PhysicsTrap, TrapRiggedRockfall (TrapBase);
  PhysicsTrapHit (TrapHitBase). So the oil lamp, D-S3 point 3's example, falls outside point 1's rule: Eli's word (D-T1).
- F2. The gate decides per REFERENCE (one passing script lets the event reach all of a reference's scripts, FridaHooks.cpp:384-441),
  so the rule is "every script on the reference is in the family". Levers, pull chains and pull bars carry TrapLever beside a
  mechanism script (NorLever01SCRIPT, NorPullBar01SCRIPT, defaultPillarPuzzleLever), so under that rule they stay the cell host's,
  with no name named.
- F3. Point 5 read literally drops real traps on guests: the pull chains' blades and the puzzle lever's darts are fired by
  mechanisms only the host runs. The relay stops only when the TRIGGER is in the family too.
- F4. The server holds no vanilla scripts (no parent chains), so the relay decision moves to the reporting seat, which uses the
  gate's own test; the server's relay code is unchanged.
- F5. This branch's prop stream is ADR-058's first version (newest touch wins, item references only; props.rs:1-12, :194-224;
  ActionListener.cpp:3372-3376). Point 4 adds one refusal (a moving body another seat owns answers Moving: the first firing wins),
  not the later arbitration bundle.

## The build, by point

- The shared test: platform TrapFamily.cpp/.h (IsFamilyType by the parent chain, cached per class; IsFamily(handle): every attached
  script in the family; Destroyed(ref) from TESForm's destroyed flag; PlayerOnly(handle) from the trigger's playerOnlyTrigger
  property, HYPOTHESIS H-PO1), two flag sets in Hosted.h's style (bodies another seat streams; references whose record is being
  applied), and JS exports getTrapRole, setPropFollowed, setRecordApplying (setHosted's pattern; no Papyrus native).
- Point 1 (every seat runs the family): the gate passes a family reference's events in any cell; the client never sets the
  activation block on a family reference; the seam counts a family reference as every seat's own (its state calls run, counted
  " (trap)"; its action calls run under the script-action mark and are never queued, so no mirror and no lastAnimation); the
  late-join replay skips a family reference. Rung R3 per seat for the firing (D-S2 B's cosmetic copies). No wire, no server.
  HYPOTHESIS H-T2: an unblocked plate on a non-hosting seat fires its children there.
- Point 2 (a hit counts on the hit actor's own seat): one table row, ObjectReference.ProcessTrapHit (11 parameters, not latent,
  self = the hit actor), kind State, subject Self, relay none, in NativeRows.inc and natives_table.rs together; the seam's owner
  test and non-owner skip (lever nonLatent) skip it on a non-owner. Damage to figures and puppets is already cut by the DamageActor
  replacement (FridaHooks.cpp:1482-1505); the row adds no push or stagger on another seat's figure. Retire fork m4-trap-hit
  (71e1dd13, ddbfce5c): its register hook is the per-native shape ADR-068 decision 2 rejected, and its TrapHitService reports the
  hits point 2 says never count.
- Point 3 (a single-use result recorded once): the engine's change form cannot carry it today (actors only, the newest replaces,
  a world object's destruction in its record unread), so one typed row: DestructionStage, MsgType 78, wire id 84, SCHEMA 36 to 37,
  {refr u32, stage u8, destroyed bool, served bool}, both directions, reliable; validator (refr not 0 nor 0xff000000 and up, stage
  at most 127, rate 8 then 2 a second, fixtures), the C++ struct, MsgType, registration, parser case, TS interface and WIRE.md row
  in one commit (rule 4). Server: wire-rules destruction.rs (the stage only rises, destroyed only goes true: the first report of
  each step wins), OnDestructionStage beside OnLockReport (relayed to the reference's other listeners, served after the create
  word to a late joiner), an optional destruction field on the record beside lock (rule 6's migration and a restart scenario).
  Platform: SetDestroyed on a family reference batched; the gate blanks a destroyed family reference's non-lifecycle events (a
  spent trap goes deaf) and every event of a reference whose record is being applied. Client: trapResultService.ts (reports the
  stage rise and SetDestroyed; applies a record behind the local copy through damageObject and setDestroyed; a served record
  under the apply blank so a late joiner's lamp never replays its fall).
- Point 4 (a trap body by the seat whose firing moved it): two table rows, SetMotionType and ApplyHavokImpulse (both latent),
  kind State, owner Toucher (new); on a followed body the seam runs them with a neutral argument (Keyframed, magnitude 0),
  HYPOTHESIS H-AW; propService.ts takes trap bodies (impulse touch 3, the firing seat claims each body once, a follower keeps the
  body Keyframed until the owner's rest sample, placeAtRecord after a restart); the server's OnPropClaim and OnPropTransform admit
  a world body for touch 3 alone, props.rs gains the Moving refusal; the prop sample budget 20 then 10 a second raised to 64 then
  40 (UNMEASURED, with its WIRE.md line). Risks: the race (the second firing seat's rocks fall for one round trip, then glide onto
  the stream); H-KF, a Keyframed follower rock may never hurt its own seat's player.
- Point 5 (the relay): client only, in activationService.ts's linked branch: a pair whose trigger AND target are family is
  logged and not reported; everything else reports and relays as before; the hazard-death evidence is kept (the trigger's own
  self-activation is still reported). Phase 2, player-only boxes (Temple 0x86018, Sanctum 0x4e42b): the client reports such a
  pair from any seat, the server's not-the-host refusal gets one exception for a trigger whose record sets playerOnlyTrigger,
  from a reporter with the cell loaded.

## The probes (lines in the design's text)

- x-trap-dodge v1 (Temple plate 0x567f2 and wall 0x54b15; god mode off): each seat fires the trap itself ("trap 54b15 fired here
  by 567f2: every seat fires the trap family itself, not reported (D-S3)"), no server relay of the pair, ProcessTrapHit counted
  on the hit seat and "(skipped)" on the other, the hit player's health dropped on its seat and the server, the other's not; a
  dodge leg (stepped off in 0.3 s, unhurt); the pull chain's blades still relayed (a mechanism trigger).
- x-trap-lamp v1 (Temple lamp 0x9b0fb, base 0x90efc, at (5779, -7656, -2131), at least 1,660 units from every oil pool): c2 shoots
  it, the server records once and relays, c1 applies; a second shot records nothing; a server restart serves the record to both.
- x-trap-boulders v1 (Embershard tripwire 0xb6d3f, linker 0xb6d3e, rocks 0xb6d45 and six siblings): c2 walks the wire, claims the
  seven bodies by touch 3, c1 follows; the rocks agree within 32 units on both seats and the server after 6 s; the spent wire is
  deaf; a restart places the rocks at their recorded rest.

## Size and order

About 8 agent half-days (8.5 with phase 2) and three to four lab windows: a prefix census for F1 (0.25); server destruction.rs,
the props refusal and the three table rows, the C++ handler with its record and tests, the world-body prop admission (2.25);
wire DestructionStage and the prop budget, the T2 session (0.75); platform TrapFamily, the gate, the seam, the Windows build and
review (1.75); client activation block, relay filter, trapResultService, propService bodies (1.9); lab probes, scenario rewrites,
docs (1.5); phase 2 (0.5). The dodge is testable after the platform layer and the first client items; the lamp after
trapResultService; the boulders after propService.

## Decisions

Eli's: D-T1 the lamp's family (A a "trap" name prefix beside the class chain, the shape of ADR-044's SKI_ prefix, measured over
every script first; B the two outliers as named roots; C lamps stay the host's, the guest's shot reaching it as the figure's
replayed arrow, HYPOTHESIS H-ARROW); D-T2 rewriting b-bleak-traps' and b-object-anim's legs A and B, which claim the host's relay
D-S3 removes (green runs, so ADR-064 decision 4); D-T3 the schedule. thuum-cf's, stated: the relay stops only for a family pair
(F3); the reporting seat decides (F4); phase 2 in the slice (any seat triggers, Eli's requirement); the skip lever nonLatent for
the slice's stage; the latent body calls neutralized rather than skipped; H-KF's fallback decided at the boulders probe.

D-T4 (07:56 PST 2026-11-05 (15:56Z 11-05)), a trap's and a fall's damage to a player. CONFIRMED by run (x-trap-hit-premise 20261105-154820, docs/verbs/
traps.md's window 2 reads): as built a trap's hit deals the player nothing, because skymp5-client zeroes the six
fDiffMultHPToPC* (ADR-028: no actor's hit counts on the player's own engine) and the engine's DamageActor applies the same
multiplier to the world's damage; at 1.0, one spike-wall hit cost 60 of 1000. ADR-028's decision keeps the world's damage the
victim's game's, so the fix carries it out: the platform's DamageActor replacement (FridaHooks.cpp, which cuts a figure's, a
puppet's and an NPC's damage from a player's hand today and never touches the player) also cuts any damage another actor deals
the player (the server computes it, R0), and the multiplier then scales only the world's damage (a trap, a fall, lava; damage
with no attacker, or the player's own). The stage's regression read: b-duel, b-shout, b-shout-repeat and b-shadowbond stay
single-counted (an actor's damage that reached DamageActor with no attacker would start to count locally). The open choice is
the multiplier: A 1.0, the game's base (a spike wall's 60 at the lab's level); B the pinned difficulty's own (the client pins
iDifficulty 5, Legendary; the repo's static read puts the six between 0.5 and 2.5, so about two and a half times: a fresh
character dies to two wall hits); C traps and falls stay harmless, ADR-028 amended. thuum-cf recommends A: the world bites at
the game's own base, and nothing about multiplayer needs it harder or softer.

