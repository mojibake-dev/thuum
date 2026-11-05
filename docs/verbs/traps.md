# Verb: traps

Drafted 00:4x PDT 2026-10-31 from docs/VERB.md (pile item 9 of docs/private/turbo-2-prework.md; M4's dungeon row:
traps, pressure plates, linked refs, puzzle pillars, toward the exit scenario d-bleak-falls). From a code map of the
fork at parity 6dbabc7a. Nothing of it is built; the prework is the read, x-bleak-traps.

## Intent

A dungeon's mechanisms work for every player in it: a pressure plate one player steps on swings the blade on every
screen and the blade hurts whoever it hits; a lever's puzzle (Bleak Falls' pillars and the Golden Claw door) opens the
door for both; the state survives a restart mid-dungeon.

Roadmap reference: skymp/ROADMAP.md "Dungeon support" ("Traps, puzzles and more ... State must be saved on the
server") and "Linked Refs".
Milestone: M4   Class: B

## Inventory (ADR-031: the action's consequences, before its rung)

Actions: a player steps on a plate (the trap's activation parent fires the trap), a player turns a pillar (an ACTI
with a script), a player pulls a lever (the script checks the pillars and activates the linked door), a player is hit
by a trap (damage, a hazard death). The reference trace is owed (lab/references/bleak-plate.json); the records are the
REFRs' XAPR (activation parents with delays), XLKR (linked refs), XESP (enable parents) and the scripts the ACTIs and
DOORs carry (ACTI.cpp reads the VMAD alone).

| consequence | seen in | disposition |
| --- | --- | --- |
| the plate's press animation and sound on the stepping player's game | engine | native |
| the plate activates its children (XAPR, the delay): the blade's swing, the spears | engine (the cell's host runs the plate's script under ADR-059; CONFIRMED v4 legs A and B) | imposed: the host's game fires it (its engine's own parent link) and reports the self-activation (today: noted alone, ActionListener.cpp:1938-1963); the server runs the children through its own XAPR table (ActivateChilds :1928-1959) and tells the other games to play the child's activation (R2 recorded, the host's engine the oracle) |
| a trap's damage to a player | engine | native on the hit player's game, reported through its own ChangeValues (taken as reported today, :4154-4221; a hazard bound later) |
| a trap's kill of an NPC | engine | R2 recorded: ADR-048's hazard death with "an activation beside the body" (:3488-3496) |
| a pillar's turn (an ACTI's script PlayAnimation on itself) | engine | imposed: the server's Papyrus has no script, so the turn is the host's report of the pillar's state (its animation name, lastAnimation today, remoteServer.ts:386-399 "pillars in bleakfalls are not reliable") |
| the lever's check of the pillars and its activation of the linked door | engine (defaultPillarPuzzleLever) | imposed: the lever's script runs on the host's game; its door activation is an engine-internal activation (caster the lever) the client never sends (activationService.ts:47-76 sends a non-player caster only when caster equals target), so the server never opens the door for the other seat today: the fix is the host reporting the linked activation (caster lever, target door) and the server opening the door (SetOpen, R0 by the host's word) |
| the door's open state | code (isOpen) for a DOOR; the puzzle portcullis is an ACTI (NorPortcullisLarge01 0x3e726, lab/esm.py 01:58 PST 2026-11-01) whose rise is its script's animation | a DOOR's isOpen as today from the host's linked report through Activate's own path; the portcullis has no server state, each engine's script plays it on the relay (fork m4-traps cc62e749); across a restart it stands as the engines reload it (a known limit for d-bleak-falls' restart leg: pull the lever after the restart, or restart before the door) |
| the puzzle's state (the three pillars' faces) across a restart | engine | imposed: recorded as each pillar's last animation on its record (today's lastAnimation, MpChangeForms.h:134-135), restored at the cell's load |
| the "puzzle failed" spears when the lever is pulled wrong | engine | native on the host; the other seat's spears through the children relay above |

### Sequences and combinations (ADR-033)

| sequence or combination | probe or scenario | result |
| --- | --- | --- |
| the plate pressed by the host, the blade on both screens | x-bleak-traps | |
| the plate pressed by the guest (a self-activation the host never saw) | x-bleak-traps | |
| the pillars turned by the guest, the lever pulled by the host, the door on both | x-bleak-traps | |
| a restart with two pillars turned and the door shut, then the third and the lever | d-bleak-falls | |

## Authority

Rung: R2 for a trap's firing (the host's engine computes, the server records and relays), R0 for the door's state
and the puzzle's record, R1 for nothing yet (a trap's damage to a player is the player's own report today).
Why this rung and not the one above it: the engine runs the trap's physics and script on the host; the server
has neither the script nor the animation; it can only record what the host's engine did and tell the others.
What the server records (R2): a self-activation reported by the cell's host (today noted for hazards), its children
run through the server's own activation-parent table (ActivateChilds) with each child's activation sent to the other
games; the lever's linked activation (caster lever, target door) from the host, the door opened.
Rate limit / bounds: a self-activation per reference at most twice a second; a linked activation only from the
cell's host and only between references the game files link (XAPR or XLKR of the target names the caster).
An actor target (ADR-068, "A linked activation of an actor" below): R2 on the seat that simulates the actor; the server
drops the report when the reporter or nobody simulates it, and relays it to the simulator alone otherwise, after the same
two checks (the reporter hosts the trigger's cell, the actor's own XAPR names the trigger) and within the same budget.

## Engine surface

- The server: ActionListener.cpp:1938-1963 (a self-activation from the host: NoteActivation and return, "nothing is
  activated here"); MpObjectReference.cpp:484-549 Activate (the XAPD refusal :501-518, the pillars bypass :498-499),
  ActivateChilds :1928-1959 (a timer per child at its XAPR delay), ProcessActivateNormal :1669-1885 (an ACTI acts only
  for an actor: OpenContainer to its game :1847-1850); PapyrusObjectReference.cpp:524-542 (Activate's "workaround for
  defaultPillarPuzzlelever"); the server's trigger boxes (XPRM primitives, WorldState.cpp:662-680, OnTriggerEnter at
  SetPos :600-640); the scripts: InitScripts :2056-2117 runs stored scripts alone, the lab server ships one .pex
  (script-variables.md:57-68).
- libespm: REFR.cpp XAPD read as one byte :25-27, XAPR pushed :28-31, XLKR one pair kept :32-38 (a later one
  overwrites), XESP :41-46; ACTI.cpp reads the VMAD scripts alone; DOOR.h has no fields.
- The client: activationService.ts:47-76 (a non-player caster sent only when caster equals target and this game
  hosts the cell), objectReferenceEx.ts:41-60 (every ACTI and DOOR activation-blocked but CaveGSecretDoor01 0x6f703),
  modelApplyUtils.ts:13-35 (that door opened by activating it from 0x460ca), remoteServer.ts:386-399 (lastAnimation
  retried).
- The test world: unit/ActivateParentTest.cpp (trapwallwood 0x54b15, its plate 0x567f2 the one activation parent,
  delay 0; the wire's self-activation untested).
- CommonLibSSE-NG: none needed (no hook).

## Observe

- Hook point: the client's activation event (TESActivateEvent) for a non-player caster on the host: today filtered to
  caster equals target; the change admits caster-to-target pairs the game files link (the client reads the target's
  XAPR and XLKR through Skyrim Platform? No native lists them: the server judges the pair instead, so the client sends
  every non-player activation in a cell it hosts, bounded by a budget, and the server refuses unlinked pairs).
- SP filter: the host's cells alone; a budget of 8 then 4 a second.
- Data captured: {caster, target} as Activate carries them.
- Side effects: HYPOTHESIS until x-bleak-traps: the volume of engine-internal activations in a dungeon cell (the
  read counts them).

## Impose

- Mechanism: a child's activation to the other games as OpenContainer is today for an ACTI (the client's
  refr.activate(player, true) on a trap would run the trap's script with the player as activator: wrong caster);
  instead a new path: the server tells the other games "reference X activated by Y" and the client calls
  X.activate(Y) with the caster the server named (Skyrim Platform's ObjectReference.activate takes any activator).
  The door's open is isOpen as today.
- Visual without simulation achieved by: the engine playing its own trap on each game from the relayed activation.
- Side effects: HYPOTHESIS: a relayed trap on a game whose engine also fires it (both players on the plate) plays twice.

## Suppress

- What is suppressed: on a guest, the engine's own trap firing from its own plate press? No: a guest's press is a
  self-activation the guest's engine runs locally and reports; the host's engine then also fires it on the report
  (the relay above) and the server records once. The double firing on the guest is the hazard the read looks at.
- How, release, side effects: by the read.

## Message contract

- Message name / numeric type: Activate as today for the report (caster and target); a new S2C `RelayedActivation`
  { target: u32, caster: u32 } (MsgType after locks' and leveling's), reliable, to the cell's other games; validator:
  both never 0. The door's isOpen as today.
- Direction: C2S the report, S2C the relay.
- Validator rules: the report from the cell's host alone (the server's rule), the pair linked in the game files
  (XAPR or XLKR), a budget.
- ADR-059 decision 3 (fork m4-object-animation, 2026-11-01): `ObjectAnimation` { refr: u32, event: string } (MsgType 71,
  wire id 79, Both, SCHEMA_VERSION 30), reliable: C2S the host's report of a world object's animation event, S2C the
  server's relay of the same message to the cell's other games. Validator: refr never 0, event never empty
  (E_VAL_RANGE), the sender's budget 32 then 8 a second (E_VAL_RATE, UNMEASURED). The server's rule: the cell's host
  alone, a game-file reference that is no actor (E_OBJANIM_NOT_HOST, E_OBJANIM_ACTOR, E_OBJANIM_NO_REF,
  E_OBJANIM_NO_CELL, E_OBJANIM_RANGE), a DOOR dropped quietly (its open is isOpen's), at most 8 a second per reference
  (E_OBJANIM_RATE); the event is written as the reference's lastAnimation, the record field CreateActor already carries.
- Contract doc updated: docs/WIRE.md with the build.

## Server

- Where the logic lives (01:43 PST 2026-11-01, fork m4-traps b163fc62, the server half): ActionListener::OnActivate sends a caster
  that is no actor and not the target to OnLinkedActivation before the hosted caster's rule (which threw "Bad hoster" on
  a lever's report until now). The pair is the game files' through WorldState's activation-parent table, filled as each
  reference loads (the target's XAPR names the caster: the spike wall 0x54b15's names the plate 0x567f2, the portcullis
  0x3b9f1's names the lever 0x6a9e2, lab/esm.py 2026-11-01; the lever itself carries no XLKR, so no linked-ref table was
  needed for the exit dungeon); the reporter must host the target's cell (PartOne::GetCellHost); a game sends at most
  eight a second. The server records the activation through Activate's own path with the caster the engine named (a
  door's open by SetOpen, the hazard note, the target's own children) and relays RelayedActivation {target, caster} to
  the target's listeners but the reporter. Refusals by name: E_TRAP_NO_REF, E_TRAP_NO_CELL, E_TRAP_NOT_HOST,
  E_TRAP_UNLINKED, E_TRAP_RATE, E_TRAP_ACTIVATE. The client half (the host's report widened to its engine's non-player
  activations in hosted cells, the relay played by target.activate(caster) on the next update) follows x-bleak-traps.
- DB fields / migration: none new (isOpen, lastAnimation exist).
- Restart behavior: the door's state as saved; the pillars' faces as lastAnimation.
- Papyrus natives touched: none.

## Client

- SP binding: none new (activate with a named caster exists).
- TS handler: activationService sends the host's non-player activations under the budget; a new handler plays
  RelayedActivation; the pillars' lastAnimation path stays.
- Kill switch config key: server setting `dungeonRelay`.

## Tests

- T0: the linked-pair rule (a plate to its wall accepted, an unlinked pair refused, a non-host refused), the relay to
  the other games, the lever's door open; ActivateParentTest extended with the wire's path.
- T2: a session with a host's self-activation relayed.
- T3 scenario id: lab/scenarios/d-bleak-falls.yaml (M4's exit): both players through the puzzle door and the traps,
  a restart mid-dungeon. Probe x-bleak-traps by path first: the read of today.
- Assertions that would fail if the verb silently regressed: the blade still on one screen; the door shut on the
  guest after the lever.

## Dynamic plan (fill when any tag above is still HYPOTHESIS)

- Static pre-answer (02:40 PST 2026-11-01) for the relay's first HYPOTHESIS (an activation-blocked reference and a scripted activate):
  the Creation Kit's BlockActivation (ObjectReference) blocks the reference's default processing and the player's own
  activation while the OnActivate event is still sent to its scripts (https://ck.uesp.net/wiki/BlockActivation_-_ObjectReference),
  and ObjectReference.Activate with abDefaultProcessingOnly false runs the scripts
  (https://ck.uesp.net/wiki/Activate_-_ObjectReference). skymp5-client blocks every ACTI and DOOR (objectReferenceEx.ts), so
  the relayed `target.activate(caster, false)` should fire a trap's script (TrapSwingingWall's swing, the portcullis's rise)
  without the default processing the block withholds; a DOOR's open travels by its isOpen property regardless. The read
  confirms on the spike wall and the portcullis; the volume of engine-internal activations and the double play stay the read's.
- READ (x-bleak-traps v3 7858eaaa, 20261101-132023, green as a read; v1 122019 and v2 124836 fell on premises): NOTHING runs. A) c1
  (the host) on the plate 0x567f2 and B) c2 on it: no line on either seat or the server names the plate or the wall 0x54b15
  (log-count 0, 0, 0 three times). C) c2's activation of the pillar 0xaa8cb returned false; c2's console holds its one "Sent
  activation" line, c1 and the server nothing. D) c1's pull of the lever 0x6a9e2 returned false; one console line on c1, the
  server logged nothing for 6a9e2, 3b9f1 or 3720f. The static pre-answer above was half right and beside the point: the relay's
  scripted activate may well reach a script, but no trap, pillar or lever script RUNS on any seat today, so there is nothing to
  relay. Two blocks: skymp5-client's BlockActivation on every ACTI (objectReferenceEx.ts dealWithRef), which withholds the
  engine's own processing and, the Creation Kit wiki says, sends OnActivate only to the script that set the block (none here:
  Skyrim Platform sets it natively; https://papyrus.bellcube.dev/skyrimse/script/objectreference/function/blockactivation/ mirrors
  https://ck.uesp.net/wiki/BlockActivation_-_ObjectReference), and the Papyrus event block (blockPapyrusEventsService, ADR-044),
  which swallows OnTriggerEnter, OnActivate, OnLoad and OnCellAttach for every script not on the admitted list. The server's
  part held: a player's activation of a scripted ACTI is taken and does nothing (ProcessActivateNormal, an ACTI acts only for an
  actor), no refusal. HYPOTHESIS rows 27 to 35 are therefore FALSIFIED as "the host's engine fires it": the host's engine fires
  nothing until its scripts run. The scripts (lab/.cache/game "Skyrim - Misc.bsa", lab/tools/bsa-extract.py, the pex string
  tables; the VMADs by lab/esm.py's reader): the plate TrapStonePressurePlate02 0x1a4bb carries PressurePlate (extends
  TrapTriggerBase: OnTriggerEnter, Activate on itself, hasPerk Light Foot, getValue), the wall TrapWallWood 0xc6440 TrapHitBase and
  TrapSwingingWall (extends MovingTrap: onTriggerEnter, fireTrap, playAnimation 90For/180For/270For and the Trans* events), the
  lever NorLever01 0x21513 TrapLever (TriggerType 2, toggle) and NorLever01SCRIPT (playAnimation FullPull/FullPush), the
  portcullis NorPortcullisLarge01 0x3e726 default2StateActivator (SetOpen, playAnimation open/close), the pillars
  NorDefaultPuzzlePillar01 0xaa8ce defaultPuzzlePillarScript (onActivate, playAnimationandWait Trigger0N/Turned0N, GetLinkedRef,
  activate; the REFRs 0xaa8cb/cc/cd carry initialState 1/3/1 and solveState 3/2/2 and link 0xaa8c3), the puzzle lever 0xaa8c3
  (base 0xb7db4) defaultPillarPuzzleLever (pillarCount 3, puzzleDoorActivator the XMarker 0x3e728 whose activation parents open
  the portcullis 0x3b9f1 with XAPD 1, refActOnSuccess01 0x3b9f1, refActOnFailure01..04 0x39fdd, 0x3720f, 0x2ad49, 0x2ad43) plus
  traplever, the dart trap TrapDartPortSingle02 0x173fc DartTrap (NumShots). Every one is Papyrus: the engine's "trap" is a
  script calling playAnimation and Activate. The design this read forces is an ADR (world scripts run on the cell's host, their
  activations relayed, their animations recorded), written next; the server half built here (RelayedActivation, the linked
  report) stays as the relay's wire.
- Server, ADR-059 decision 2's last piece (fork m4-puzzle-relay 7a480818 off m4-traps 19e8d981, 08:01 PST 2026-11-01; T0 TrapRelayTest's
  pillar case both ways): a player's activation of a scripted world object (an ACTI or FURN whose record or base carries a script,
  the VMAD read once per base) is relayed to every other game in the cell as RelayedActivation with the player's actor as the
  caster: the host's engine runs the script where the cell is simulated (a guest's pillar turn counts on the host's lever), and the
  guests' engines run it while the layer admits the scripts everywhere (the hosted-cell gate's train replaces the guests' share with
  the host's animations, decision 3); every seat's echo of a figure's activation is taken quietly. Probe x-puzzle-relay v1 f67fabe3:
  the guest's four turns and the host's one relayed and played on the other seat, then the host's pull and the marker's portcullis
  on both (the success path's read; the face order 1 to 2 to 3 is HYPOTHESIS). Stages after the pair merges (no client change: the
  traps dist serves).
- Decision 2's relay to the host READ (18:42 PST 2026-11-01; x-puzzle-relay v1 f67fabe3 on the bondblock train's stage, run 20261102-023719): the
  guest's turn of pillar 0xaa8cb reaches the host and its engine runs the pillar's script ("relayed activation aa8cb by ff000001" on
  c1, "ff000001 activates aa8cb in cell 371de (its host ff000000): relayed to 1 other game(s)" on the server), so a guest's turn
  counts on the host's lever. The run's one red was the probe's own claim of no E_TRAP_ line: the host's engine then reported
  aa8cb activating 0x4fcdf, which the server never loads (E_TRAP_NO_REF, by design as the marker 0x3e728's case): 0x4fcdf is an
  XMarker (base 0x3b) in the puzzle room at (5418.6, -555.3, -760.0) whose XAPR activation parents are the three pillars 0xaa8cb,
  0xaa8cc and 0xaa8cd (lab/esm.py ref and id on sky-srv), the engine's own child of every pillar turn, with no consequence the
  server owns. The probe's claims name the codes from v2 on: no E_TRAP_NOT_HOST, E_TRAP_UNLINKED or E_TRAP_RATE, and every
  E_TRAP_NO_REF the marker's ([[lab-refusal-claims-name-codes]] in spirit: a no-refusal claim names its codes).
- ADR-059 decision 3 BUILT (fork m4-object-animation off m4-world-scripts-host 38ac3350, 14:2x PST 2026-11-01; the head in
  docs/LOG.md): the host's engine's world-object animation events reach the guests. Client: ObjectAnimationService hooks
  sendAnimationEvent for the family the trap and puzzle scripts play, matched in native (HookPattern; from the scripts' own
  names in the game's pex files and the bases' VMAD, read 14:23 PST 2026-11-01: the pillars' Trigger0N and Turned0N, a lever's FullPull
  and FullPulledDown, a two-state activator's open, close and opened, the plate's Down, the swinging wall's 90/180/270 For,
  Half, End and Back and Rearm, TrapBase's Reset and Idle; the engine's exact set HYPOTHESIS until x-object-anim reads it;
  fork dceb62e0), notes
  the event and on the next update reports it when this seat hosts the reference's cell and the reference is no actor or
  door; a relayed ObjectAnimation plays through the engine's own PlayAnimation (the path remoteServer's lastAnimation replay
  uses). Server: OnObjectAnimation (above) records it as lastAnimation and relays; T0 ObjectAnimationTest (recorded and
  relayed to the guest alone; a guest's, an actor's, a missing reference's, an empty event's refused; the ninth in a second
  on one reference dropped). The train with the hosted-cell gate: the layer's traps row flips to scope=host, guests stop
  running the scripts, and the relay plus these animations are what a guest sees; its read is x-object-anim (the plate's
  wall and the pillar's turn played on the guest, the guest's own plate silent under the gate: H3's other half). What stays
  the host's engine's alone: the sound (the engine plays a script's sounds where the script runs; a guest hears none until
  a later slice) and the trap's harm (decision 4).
- ADR-059 decision 4 (harm), the Dynamic plan (rule 8; 14:23 PST 2026-11-01). Static, from the game's files: the wall TrapWallWood 0xc6440's
  VMAD carries TrapSwingingWall's level table, LvlDamage1..6 = 75, 100, 125, 150, 175, 200 by LvlThreshold1..5 = 10, 15, 20, 25,
  30 (the victim's level against the thresholds picks the damage; MovingTrap carries the same shape, DartTrap's is LvlWeapon1..6
  by the same thresholds), and TrapHitBase's hit shape (trapPushBack 45, trapCausesStagger with staggerAmount 0.7, canDisease with
  diseaseChance 1 and the six disease spells, hitFX, cameraShake, rumble, hitOnlyOnce false); TrapBase's TrapLevel (0 Easy to 3
  VeryHard, "currently only tied to damage") and its `damage`; the placed wall 0x54b15's own VMAD sets rotation 1 alone, the
  plate 0x567f2 and the portcullis 0x3b9f1 carry none (their bases' scripts: PressurePlate with isTriggerVolume and the Light Foot
  check, default2StateActivator). The engine's path, HYPOTHESIS: TrapHitBase.OnTrapHitStart on the hit actor runs the Papyrus
  damage, Actor.DamageActorValue("Health", damage), which is ActorValueOwner::RestoreActorValue(kDamage, Health, -damage) on the
  victim (CommonLibSSE-NG include/RE/A/ActorValueOwner.h, slot 06), not the melee path's DamageActor that FridaHooks.cpp:1131
  replaces for figures and puppets; so on the host the guest's FIGURE loses health locally and the guest never knows, and under
  the hosted-cell gate the guest's own engine runs no trap at all: a trap cannot hurt a guest until this slice. The trace
  lab/frida/trap-hit-trace.js (written 14:46 PST 2026-11-01, 1.6.1170; x-object-anim v3 runs it on c1 before leg B): c1 hosting the temple, c2's figure on the plate; hook the figure's
  ActorValueOwner vtable slot 06 (the figure's pointer from its form id, as the other traces look forms up) and log the modifier,
  the actor value and the amount with the caller's module offset; hook the Papyrus event dispatch on the wall 0x54b15 for
  OnTrapHit and OnTrapHitStart (Skyrim Platform's sendPapyrusEvent hook) and log the target. Expected: one RestoreActorValue
  (kDamage, Health, -75) on the figure per swing at a level-1 figure, inside OnTrapHitStart's dispatch, and nothing on the guest's
  seat. x-object-anim v2 (5805d687) carries the first read without Frida: c1's av-read of its figure of c2 after the wall swung at
  it (leg B), beside c2's own under god mode. Then the build, in the verb's order: TrapHit { refr, target, damage } C2S from the
  host (the next wire row with its validator and fixtures); the server's rule reads the trap base's table from its VMAD by the
  target's recorded level and TrapLevel, checks the trap's trigger volume against the target's recorded position, applies the
  number to the record (R1) with the trap as the cause (ADR-048's hazard death if it kills), and ChangeValues shows the hit seat;
  the host's client reports from the trace's hook point (a platform export beside damageActor's) and the figure's local loss is
  restored by the server's word. Decision 5 (counts) after it.
- x-trap-path v2 read (22:51 PST 2026-11-01; 20261102-064240, green on its premise, on the pillar-fix head): the host's own god-mode body on the
  plate first, then the guest's figure; the trace loaded with five hooks and printed NOTHING in either leg, the engine's
  TESTrapHitEvent dispatch included, so no row even for the player. Two candidates stand, and the trace cannot yet tell them
  apart: the trap path was not taken (god mode may end the engine's trap hit before any of the five run, and the figure case has
  now been silent twice against x-object-anim v3's fourteen DamageActor rows), or the attaches do not fire where they sit (the
  five ids are the re-analyst's; the same DamageActor attach fired in v3, and none of these functions is platform-hooked on this
  build). v3 of the probe (lab/.cache/probes x-trap-path, sha1 below in the LOG) adds a liveness leg: one sword swing by the host on
  the figure before the plate, whose ProcessHitVictim and DamageActor rows prove the attaches and the filters; with them present,
  silence on the plate legs is the engine's word and decision 4's client half moves to the engine's trap-hit event or to the
  figure's body in the Havok world; without them the trace is wrong before the engine is. Runs in the morning's first free window
  (the sweep holds the lab). The TrapHit server half stands either way; the client half's hook stays HYPOTHESIS.
- x-trap-path v4 read (05:23 PST 2026-11-02; 20261102-131634, green on its premise; numidium's read of the self-proving trace): the ready row
  carried pid 4188 while c1's game was pid 10704 (the run's own c1-skyrim-platform-pid10704.log), all five addresses resolved (the
  DamageActor entry's first bytes a JMP, the platform's own detour, as expected), and no liveness row ever came: the agent lived
  in another SkyrimSE.exe. lab-api's frida step (config.py's frida_exec_template) takes `Get-Process SkyrimSE`, sleeps 5 s and
  injects into that pid, so a second game process alive at that moment (the previous game still exiting after the relaunch, a
  launcher stage) takes the injection; intermittent, which is why x-object-anim v3's leg B saw its fourteen DamageActor rows and
  every later trace saw nothing. CONSEQUENCES: the silences of x-trap-path v1 to v3 and of pillar-anim-trace.js decide nothing;
  the "a Frida attach on a platform-attached function fires nothing" reading is RETRACTED; the physics candidates for the figure
  (its body out of the Havok world after a long teleport, the trap's physics unwoken) are withdrawn, unread; the re-analyst's
  chain and the hook on 56212 stand as HYPOTHESIS exactly as before the traces. The fix is numidium's in lab-api (inject into the
  game process deliberately: the pid the platform log names, or the newest SkyrimSE.exe with SkyrimPlatformImpl.dll loaded, and
  the chosen pid in the step's note), after Eli's turbo; x-trap-path v4 reruns on it unchanged. Standing rule for every trace:
  the ready row's pid against the platform log's, and no row is read before it matches.
- x-trap-path v3 read (05:16 PST 2026-11-02; 20261102-130725 on the merged base, green on its premise): the liveness swing LANDED twice (the
  server's "OnWeaponHit - ff000000 hits ff000001 with 12eb7 for 0 damage" at 13:11:15 and 13:11:18, c2's god mode the zero), so
  Actor::ProcessHitVictim and Actor::DamageActor ran on c1 for the figure, and the trace printed no row for them either: the trace
  is wrong before the engine is (the attaches do not fire where they sit, or the agent is not in the game's process; x-object-anim
  v3's fourteen DamageActor rows came through a different script). So the two silent plate runs decide nothing about the trap's
  physics yet. Trace v3 proves itself (lab/frida/trap-path-trace.js, main eb6ed459: the process id against the platform log's pid,
  the module base, each hook's resolved address and first eight bytes, per-hook call counts before any filter, a kernel32!Sleep
  count as the Interceptor's pulse, a liveness row every ten seconds); probe x-trap-path v4 (sha1 c83f645a) is v3's steps with it.
  Also in that run's server log, twice at 13:10:50: "Script 'TrapSwingingWall' not found in the script storage": the server's Papyrus
  VM asked for the wall's script at the relayed activation; Skyrim.esm's scripts are not in the server's storage by ADR-059's
  design, so the line is noise, not a finding (a filter for the eleven host-scoped names is a later tidy). Decision 4's client half
  keeps its HYPOTHESIS; the TrapHit branch waits on v4's rows.
- x-object-anim v4 GREEN (22:43 PST 2026-11-01; 20261102-063627 on the pillar-fix head ad1aa50a over layer 6d059c11, every claim of the three
  legs). Decision 1's lifecycle rule CONFIRMED: with its OnCellLoad admitted the pillar's script left its empty state, and the host's
  turn moved the pillar (c1's screenshots before and after show the eagle face giving way to the snake face) and played
  "Trigger01" through the hook ("object animation aa8cb Trigger01 reported" on c1 at 06:41:12.5, "played" on c2 27 ms earlier by
  c2's clock, the server's "aa8cb animates aa8cb 'Trigger01'" recorded and relayed to one game; the marker's two E_TRAP_NO_REF by
  design). Decision 3's names CONFIRMED for the plate (Down), the wall (180For, 180Back, Rearm; no Half or End reached JS) and the
  pillar (Trigger01; the Turned0N the script waits for is the graph's event back to it, not sent through the hook). c2's leg C
  screenshot is black (its look-at aimed into the dark), so the guest's turn is proven by its log line, not by eye; the turbo
  sitting reads it. The pillar's engine family stays HYPOTHESIS and is immaterial: the trace lab/frida/pillar-anim-trace.js
  printed no row (RETRACTED 05:23 PST 2026-11-02: not the double-attach reading written here first; the lab's Frida step had injected into the
  wrong SkyrimSE.exe process, see the x-trap-path v4 read below). numidium runs the full sweep as the pair's gate;
  on its green the pair merges (PROMOTE=0 verb-merge plus the LAYER_RUN layer-merge) and the Status ticks follow.
- x-trap-path v1 read (22:08 PST 2026-11-01; 20261102-055845, green on its premise): the trace was live before the swing and the figure
  stood on the plate (c1's av-read at 8589, -5338; the plate fired twice, the wall played 180For, 180Back and Rearm), yet
  none of the four hooked functions ran for it: on this run the host's engine registered no blade on the figure, where
  x-object-anim v3's leg B had fourteen DamageActor calls on it. The visible difference: in v3 the host had stood on the plate
  itself first and the figure arrived from 200 units away; here the host kept 400 units off and the figure came from across
  the cell (its recorded place exactly the teleport's, no physics nudge). HYPOTHESIS, two candidates: the blade's Havok contact
  with the figure's character controller (the trap hit event is the Havok listener's) depends on the figure's body being in
  the world as a teleport from afar leaves it (lab-teleport-settle-fault), or on the trap's physics having been woken by the
  player's own presence. v2 of the trace and the probe (the native and DoTrap1 unfiltered, the TESTrapHitEvent dispatch 26104
  hooked; the host's own body on the plate first, the figure after) reads the player's rows as proof of the hooks and the
  figure's rows, or their absence, as the physics' word; if the engine never fires the event for a figure, decision 4 needs
  the figure's body in the world first, not a different hook.
- Decision 4's client half BUILT (21:58 PST 2026-11-01): fork m4-trap-hit 71e1dd13 (over ddbfce5c, off the pair's ed7aa29a; server-only push, the
  client build when it stages). Skyrim Platform hooks the ProcessTrapHit native's callback (game/Offsets.h ProcessTrapHit,
  REL::ID(56212), AE only: r8 the hit reference, r9 the trap, the Papyrus floats as stack arguments five, six and fourteen, read
  through gum's nth-argument as float32 low dwords; HYPOTHESIS until trap-path-trace.js) and raises `trapHit` {trap, target,
  damage, pushback, stagger} on the next tick (EventManager's EmplaceEvent, Definitions.txt's TrapHitEvent, the regenerated
  typings); skymp5-client's TrapHitService sends TrapHit (MsgType 72) when this game hosts the trap's cell (HostService.isHostedHere)
  and the hit reference is a server copy (another player's figure; the player's own body and game-file NPCs are not its), logging
  "trap hit <trap> on <target> for <damage> reported". Observed only: the engine's DoTrap1, ProcessHitVictim and DamageActor run as
  they do, the DamageActor replacement cutting the figure's number, so the figure's health is the server's word alone. Left: the
  trace's confirmation (x-trap-path 339985cd by path on the layer's seats), the pair's merge and parity into this branch, its client
  build and stage with x-trap-hit (lab/.cache/probes x-trap-hit.yaml: c2 without god mode on the plate, the server's hit line with
  the distance for traps::REACH, c2's health under 60), then b-trap-hit and the Status ticks. The disease roll, the camera shake
  and the rumble stay the hit player's own engine's and never reach a guest (Limits).
- Decision 4's engine path, the re-analyst's static read on sky-re (21:54 PST 2026-11-01; pyghidra-mcp on SkyrimSE-1.6.1170.0, REA down; every
  id below is 1.6.1170's by `just addr`, every inferred fact HYPOTHESIS until lab/frida/trap-path-trace.js runs). The trace's three
  return addresses were not the trap routine: +0x654a70 sits in the TaskQueueInterface pump (36891, 0x654880) and +0x657972 in the
  task processor (36991, 0x656f30), whose case 0x10 runs the deferred hit on the main thread; +0x6b806c is inside
  Actor::ProcessHitVictim (38586, 0x6b7bc0), the general victim-side hit processor that calls DamageActor (37335) with the
  HitData's aggressor, which a trap leaves invalid (the null attacker in the trace). The chain per swing: the Havok listener
  (26032 state 2, 26033 state 0) dispatches TESTrapHitEvent through ScriptEventSourceHolder+0xF78 (14298; CommonLibSSE-NG
  ScriptEventSourceHolder.h:110) with no damage in it; SkyrimVM's sink (53999, the only xrefs of "OnTrapHit" and
  "OnTrapHitStart") sends OnTrapHitStart to the TRAP's script; TrapHitBase calls the native ProcessTrapHit, whose registered
  callback is 56212 (0xa2f3b0; the registration pairs the string "ProcessTrapHit" with it at 0x140a3568d, 11 parameters, the
  NativeFunction's callback slot +0x50, CommonLib NativeFunction.h:65-67): entry RCX IVirtualMachine*, EDX stack id, R8 self (the
  hit TESObjectREFR*), R9 akTrap (TESObjectREFR*), [RSP+0x28] afDamage (float32 in the low dword), [RSP+0x30] pushback,
  [RSP+0x38..0x48] velocity, [RSP+0x50..0x60] position, [RSP+0x68] material, [RSP+0x70] stagger (prologue PUSH RBX; SUB RSP,0x90).
  It builds a 0x44-byte TrapData (+0x00 the trap's handle by CreateRefHandle 12326, +0x04 damage, +0x10 pushback, +0x18 stagger,
  +0x20 velocity, +0x30 position, +0x40 material) and calls the target's vtable slot 88, TESObjectREFR::DoTrap1(TrapData&)
  (TESObjectREFR.h:284): a bare RET for a non-actor (19696), Actor::DoTrap1 for actors (37509, 0x677b70, the three actor vtables'
  slot 88), which fills a HitData (totalDamage +0x50 = afDamage, sourceRef +0x20 = the trap's handle, aggressor +0x18 untouched,
  pushback at +0x78, stagger +0x68 rolled from afStagger) and calls ProcessHitVictim (38586) on the Papyrus thread, which under
  ShouldUseTaskQueue (39033) only enqueues task 0x10; the pump runs ProcessHitVictim again next frame on the main thread, where
  DamageActor, the stagger roll and the push impulse happen. So ProcessHitVictim fires twice per trap hit with the same numbers
  and the trap's identity survives only as HitData.sourceRef. Recommendation taken: hook 56212's entry (R8 target, R9 trap,
  [RSP+0x28] damage: the script's leveled pick before any engine scaling, exactly what the server validates by table membership),
  AE only (no SE id read); 37509 is the fallback (RCX actor, RDX TrapData). The trace to confirm (the re-analyst's spec, written as
  lab/frida/trap-path-trace.js, probe x-trap-path by path): per swing one 56212 row (trap 0x54b15, the figure, damage 75), one
  37509, two 38586 (Papyrus thread then main), then DamageActor with no attacker; a swing with DamageActor and no 56212 row, a
  56212 row whose R9 is not the trap or whose float is not the pick, or two 56212 rows per swing falsifies it.
- The pair's second stage read (21:34 PST 2026-11-01; x-object-anim v3 20261102-051618 on ed7aa29a over layer 745e643f): legs A and B GREEN,
  leg C red. A: the host's plate fires ("567f2 activates 54b15" 3), the wall's 180For, 180Back and Rearm and the plate's Down reach
  c1's service and c2 plays them (the engine's names for TrapSwingingWall rotation 1 and PressurePlate: CONFIRMED, the HYPOTHESIS
  list was right for these two). B (H3 CONFIRMED): the guest's figure on the plate fires the plate on the host's engine (5 more
  activations), c2's own engine fires nothing, c2 plays the wall again. Decision 4's trace on c1 through leg B: fourteen
  Actor::DamageActor calls naming c2's figure (regs figure, 3, 0, 0; the frames inside the Papyrus native's call, skse64's
  native-call layer two frames up) and NO RestoreActorValue on it; c1's av-read of the figure after the swings reads 100 of 100,
  the platform's DamageActor replacement having cut the engine's number. So the trap's harm on a figure takes the melee path's
  function with no attacker, and the host's report point is that replacement (victim a figure, attacker none): the amount is
  there, the trap's identity is not (DamageActor carries none); the trap's id is ProcessTrapHit's akTrap argument, so the
  client half wants the native's own implementation hooked (the function two frames above DamageActor in the trace,
  SkyrimSE.exe+0x657972 and +0x654a70 as leads; its registration string "ProcessTrapHit"): an RE brief for the re-analyst, rule 1.
  C: the host's pillar turn ran nothing: c1's screenshots before and after agree (the same face), and the script's bytecode shows
  why under the gate: defaultPuzzlePillarScript's onActivate exists only in its position states, which OnCellLoad enters, and the
  temple loaded at c1's teleport 3.5 s before c1 hosted it, so OnCellLoad was blocked and the script stayed in its empty state
  (the two "linked activation of 4fcdf" lines are the engine's XAPR propagation). Decision 1 gains the rule: a host-scoped
  script's LIFECYCLE events (OnInit, OnLoad, OnUnload, OnCellLoad, OnCellAttach, OnCellDetach, OnAttachedToCell,
  OnDetachedFromCell, OnReset) pass on every seat; they are the engine's word on the world's state and come before any host is
  known, and a guest's pillar then stands on its initial face (OnCellLoad's StartState02 and StartState03). Limit: what a
  lifecycle handler does beyond state (MovingTrap.onCellAttach's fireTrap for a trap caught mid-firing) plays as a visual on a
  guest; the harm stays the host's. Decision 3 gains the engine's other family: a world object without a behavior graph animates
  by NiControllerManager sequences through TESObjectREFR::PlayAnimation_Impl (CommonLibSSE-NG Offsets.h:546, 14189/14297;
  src/RE/T/TESObjectREFR.cpp:812-840 is the Papyrus path's shape), which the NotifyAnimationGraph hook never sees; the platform
  hooks it and raises the sequence's name as the same sendAnimationEvent, so one JS family covers both (fork m4-object-animation
  ab9b7fd8, local until the grace's parity is in). Which family the pillar uses is HYPOTHESIS until lab/frida/pillar-anim-trace.js
  (both hooks, non-actor references) runs on c1 in probe v4 (lab/.cache/probes x-object-anim 2059c95e).
- Decision 4's server half BUILT (21:17 PST 2026-11-01): fork m4-trap-hit ddbfce5c (off the pair's ed7aa29a, SCHEMA_VERSION 31; server-only push,
  CI's T0 pending). The contract is docs/WIRE.md's TrapHit (t 72) `{ refr, target, damage }` C2S, R1: the host's engine computes
  the number (the scripts' leveled pick through ProcessTrapHit), the server validates it by membership in the trap's own table
  (wire-rules traps::hit over the VMAD's LvlDamage1 to LvlDamage6 and TrapHitBase's damage, base then reference, read by
  ActionListener::TrapDamageTable; the encounter level is the engine's and never recomputed) and by reach (traps::REACH 512 from
  the trap's origin to the target's recorded feet, UNMEASURED until the probe reads it), then applies the table's value to the
  record as OnWeaponHit does (god mode and ethereal take nothing; a kill is the server's own with no killer). Gates in the core:
  the cell's host alone, a game-file world object, a target that is another player's actor in the same cell (the host's own body
  stays its actor-values report, an NPC's values its HostedActorState), 8 reports a second per trap. Codes: E_TRAPHIT_RANGE,
  _NO_REF, _ACTOR, _NO_CELL, _NOT_HOST, _TARGET, _CELL, _RATE, _TABLE, _REACH, _DAMAGE. T0 unit/TrapHitTest.cpp on the wall
  0x54b15 (75 lands, 76 does not, 200 kills; the guest's report, the host's own body, Alvor, the portcullis, 600 units and the
  ninth report are refused). Left for the trace: the client's report point and whether the host's engine lets the figure lose
  health locally (restored by the server's word either way); then the SP export, the TS service, the probe x-trap-hit (the real
  distance, the frames) and b-trap-hit, the Status ticks.
- Decision 4, the scripts' own path, static from their bytecode (21:00 PST 2026-11-01; `lab/pex.py disasm` on movingtrap.pex, traphitbase.pex and
  trapbase.pex out of "Skyrim - Misc.bsa" by lab/tools/bsa-extract.py). This replaces the plan's Papyrus-damage HYPOTHESIS: the
  swinging wall's harm is an engine native, not a script's DamageActorValue. TrapBase.fireTrap calls ResolveLeveledDamage, which
  MovingTrap overrides: `damageLevel = CalculateEncounterLevel(TrapLevel)` (ObjectReference's native, SKSE ObjectReference.psc:173,
  the reference's encounter zone and the player's level at the engine's difficulty 0 to 4), then the ladder LvlDamage1 for a level
  at or under LvlThreshold1, LvlDamage2 above it and at or under LvlThreshold2, ... LvlDamage6 above LvlThreshold5, written into the
  same reference's TrapHitBase `damage` property. TrapHitBase.OnTrapHitStart(akTarget, velocities, position, material, ...) in its
  `canhit` state: a target with the ghostAbility spell or in noHitFaction is skipped; hitOnlyOnce moves the trap to CannotHit; then
  `akTarget.ProcessTrapHit(self, damage, trapPushBack, velocities, position, material, staggerAmount)` (the engine native, SKSE
  ObjectReference.psc:489) does the damage, the push and the stagger inside the engine; after it the sound (throttled by
  soundDelay), the disease roll (isPlayer only: the target must be the game's own player, so a guest's figure never catches one on
  the host), hitFX, a detection event, and rumble and camera shake for the player alone. The event itself is the engine's
  TESTrapHitEvent (CommonLibSSE-NG ScriptEventSourceHolder.h:110 sources it, SkyrimVM.h:128 sinks it for Papyrus; its layout is
  not in the headers). Consequences for the build: (1) the server validates the host's number by membership in the trap's six-value
  table from the VMAD (TrapLevel's encounter-level scaling is the engine's own system, never reimplemented; the recorded level is
  not an input), the hit itself by the trap's reach to the target's recorded position, so R1 as planned; (2) the host's report point
  is where the engine takes afDamage: the trace's two hooks (RestoreActorValue's slot and Actor::DamageActor) tell whether
  ProcessTrapHit lands in one of them for a figure (then the platform's existing DamageActor replacement is the hook, with the
  trap as the attacker argument or none) or in neither (then the native's own implementation, found by its registration string
  "ProcessTrapHit" in Ghidra, is the hook: an RE task before the client half); (3) the whole action on a guest's body (ADR-031):
  damage by TrapHit to the server, push and stagger by the host's engine on the figure (already the figure's local motion), sound
  and FX host-side until a later slice, the disease a known gap (server-owned later, noted in Limits). The trace's expectation
  (lab/frida/trap-hit-trace.js) is corrected to match: the amount arrives from the engine's trap path, not from the VM's dispatch.
- Decision 1's declaration (20:57 PST 2026-11-01): the hosted-cell gate's native SetCellHosted (the client's HostService telling the platform
  which cells this seat hosts at every grant and release) was bound in C++ and called from TypeScript but never declared in the
  compiled TESModPlatform.pex, so the call threw "Native function not found" on every seat and the host-scoped scripts stayed
  blocked on the host (x-object-anim v3 20261102-045036: the plate 0x567f2 never activated the wall). Declared on m4-object-animation
  ed7aa29a (lab/pex.py add-native, the .psc line beside it); the stage repeats on that head. The lesson is the pex rule's: a new
  TESModPlatform native is the binding, the .psc line and the .pex declaration, and the dump is the check before any push.
- Decision 4's server half, static (20:53 PST 2026-11-01): the server needs no new parser for the trap's table. libespm reads a record's
  whole VMAD (RecordHeader::GetScriptData, skymp/libespm/src/RecordHeader.cpp:43-66; Utils.cpp:177-204 fills each script's name,
  status and properties, Utils.cpp:123-175 the values: Object, Int, Float, Bool, String and their arrays, libespm/Property.h), ACTI
  carries it as `scriptData` (libespm/ACTI.h:16), and the server already walks a reference's scripts base-then-ref
  (MpObjectReference.cpp:1766-1794, `for (auto record : { base.rec, refr.rec })`, the ref's VMAD after the base's) and picks one
  script's properties by name (ScriptVariablesHolder.cpp:101-121, stricmp on scriptName). So TrapSwingingWall's LvlDamage1..6 and
  LvlThreshold1..5 on the wall's base 0xc6440, TrapBase's TrapLevel and damage, and the placed 0x54b15's overrides are one
  GetScriptData per record at the rule's judgment, cached like the rest of the espm. The rule's inputs are then the target's
  recorded level (the leveling verb's record), the trap's table and the host's reported number; what the trace decides is the
  client's hook point and whether the host's engine can read the number it dealt the figure (TrapHit carries it for the server to
  check against the table, R1) or only the hit (the server computes from the table alone, R0).
- Static pre-answers for ADR-059's next slices (08:03 PST 2026-11-01). Decision 3 (the host's animations to the guests): Skyrim Platform's
  sendAnimationEvent hook (FridaHooks.cpp OnSendAnimationEventEnter) takes the engine's animation-graph holder from rcx and reads
  the TESObjectREFR 0x38 bytes below it, so every reference with a graph reaches EventsApi::SendAnimationEventEnter(formId, name),
  a pillar's Trigger0N and Turned0N and a portcullis's open as much as an actor's attack; the client's hook on the game-file id range
  in a hosted cell is the report's source (H2 half-answered: the hook's reach is the reference's, the event names a probe reads).
  Decision 4 (harm): the platform's DamageActor replacement cuts the engine's damage to figures and puppets alone, so a trap's hit
  on the PLAYER's own body on the engine that runs the trap's script lands and travels as the player's own ChangeValues (the
  actor-values verb's bounded report), which is why traps hurt today on every seat whose engine runs the script; under the
  hosted-cell gate a guest's engine runs none, and TrapHit (the host's number on the figure, the server's table) is the only path.
  Decision 5 (counts): a replay must be limited to scripts whose activation history has no side effect on other references (a
  pillar's turn), never a lever's (its failure fires darts); the list is by script name.
- READ CONFIRMED (x-bleak-traps v4- READ CONFIRMED (x-bleak-traps v4- READ CONFIRMED (x-bleak-traps v4 20261101-153828, green, first run, m4-traps 19e8d981 under the layer's rows; 07:52 PST 2026-11-01): with
  the scripts admitted and the engine's activation kept on their bases, Bleak Falls Temple runs. A) the host on the plate: its
  PressurePlate fires (c1 "Sent a trigger's own activation for 567f2"), the engine's activation parent activates the wall with
  the plate as the caster ("Sent a linked activation of 54b15 by 567f2"), the server relays once per activation ("567f2 activates
  54b15 in cell 371de ... relayed to 1 game(s)") and c2 plays it ("relayed activation 54b15 by 567f2"); a press fires TWICE, at
  the entry and about 3 s later (the engine's own shape, four lines a press on each side). B) the guest on the plate: the host's
  engine fires for the guest's FIGURE (H3 confirmed) and the relay reaches the guest the same way; whether the guest's own
  engine also fired its plate (the scripts are admitted everywhere in this dist) left no line and is the hosted-cell gate's read.
  C) the guest's pillar turn stays on its own screen (one "Sent activation" line, nothing relayed): decision 2's relay to the host
  is the next slice. D) the lever: two linked activations of the portcullis 200 ms apart (the lever's own and its script's),
  relayed, c2 playing both. E) the puzzle lever with the pillars unsolved: defaultPillarPuzzleLever fires its four failure darts
  once each (0x39fdd, 0x3720f, 0x2ad49, 0x2ad43), all four relayed through the links the server read from the script's
  properties; the door marker is never named on the failure path (so no E_TRAP_NO_REF, and the marker-caster path waits for a
  solved pull). No E_TRAP_ or E_ACTIVATE_REACH line in the run. Scenario b-bleak-traps (main 9053286c) claims A, B, D and E.
- Platform, ADR-059 decision 1 (SUPERSEDED by ADR-062's flip on m4-scripts-flip, 2026-11-04: the host-scoped rows are deleted, the host runs every world script of its hosted cells by rule; the paragraph stays as history) (fork m4-world-scripts-host b69bf508 off m4-traps 7ab2d1c7, 06:07 PST 2026-11-01; a Windows build): Skyrim
  Platform's LoadAdmittedScripts reads a second row kind, "<plugin> host: <class> ...", into a host-scoped set; OnSendEventEnter reads
  the event's reference's parent cell and AdmittedByChain passes a host-scoped name only when that cell is in the hosted set;
  TESModPlatform.SetCellHosted(cellFormId, hosted) fills the set and skymp5-client's hostService calls it (callNative, on the next
  update) at every grant, release, clear and restore. papyrus-map.py writes the marker from the tsv's scope=host column (main
  41da7e87). Not in v4's dist: the read runs with the rows everywhere; the row flips to host when this platform is staged, and its
  own read is whether a guest's plate stays silent while the host's fires (H3's other half). HYPOTHESIS until then.
- Server, ADR-059 decision 2's first two pieces (fork m4-traps 7ab2d1c7, 05:58 PST 2026-11-01; T0 TrapRelayTest's puzzle room case):
  MpObjectReference::Init reads a reference's VMAD and, for defaultPillarPuzzleLever, puts its refActOn* and puzzleDoorActivator
  object properties into activationChildsByActivationParent from the parent's side (delay 0), so the puzzle lever's darts and
  marker are links the relay knows; and OnLinkedActivation takes the caster by id with the form optional, so a STAT marker the
  loader skips (0x3e728, named by the portcullis's XAPR) is a caster the relay accepts by id, with no server-side activation
  through it. A never-loaded TARGET (the lever activating the marker) stays E_TRAP_NO_REF by design: its consequence arrives as
  the marker's own linked activation of the portcullis. Probe v4 re-stamped 343f06bc with that expectation.
- x-bleak-traps v4 6fc6748f (05:49 PST 2026-11-01; ADR-059 slice 1): the two blocks lifted for Bleak Falls Temple's pieces, the scripts admitted
  by name on the layer branch layer-world-scripts 6b865ab0 (lab/layer/papyrus-admitted.tsv's named rows, papyrus-map.py's fourth
  column, main 4135464c) and the engine's activation kept on their bases by the client's activationUnblockedBases (fork m4-traps
  0ec0407b, the relaunch step's json write). Reads A to E in the probe's header: the plate's own fire and the wall's linked
  activation relayed to the guest; the guest's plate (its own engine and the host's for its figure, H3); the guest's pillar turning
  on its own screen alone (decision 2's gap); the lever's portcullis on both; the puzzle lever's four darts refused E_TRAP_UNLINKED
  (links by script property, the link table's next source). H1 (OnActivate under the native block) is moot where the block is
  lifted; the host-gated shape comes with the platform change.
- x-bleak-traps v1 by path (the read, no code): c1 hosts Bleak Falls Temple 0x371de, c2 beside; (1) c1 teleported onto
  the plate 0x567f2: both screenshots at 1 and 3 s (the wall 0x54b15's swing), the server log's activation note, c2's
  console for any activation event lines; (2) c2 onto the same plate: the same reads (the guest's engine fires its own
  wall; the host's wall?); (3) the pillars and the lever by their ids (lab/esm.py on the cell), c2 turning a pillar,
  c1's screenshot of it, c1 pulling the lever after the right faces, the door's isOpen on the server and c2's
  screenshot; (4) a server restart with the door open: its state after. Recorded, not claimed, except the server's
  door state. Owner: agent.

### Playtest 41's spike wall: the lab's lever was never laid for play (17:33 PST 2026-11-02)

Eli: "also traps dont fire. so the spike wall doesnt run." The server held the plate's own lines (567f2 "fired itself" twice,
"animates 567f2 'Down' ... relayed to 0 game(s)" at 00:49:10Z) and nothing for the wall 54b15; c1's console the plate's two "Sent a
trigger's own activation" and its Down report, no OnActivate for the wall. Cause: the engine's activation processing on the plate
and the wall was lifted by the CLIENT setting activationUnblockedBases, which only the trap scenarios ever wrote (b-object-anim,
b-bleak-traps and b-puzzle-relay's relaunch step: "1a4bb c6440 21513 3e726 aa8ce b7db4 173fc 2079f"); no layer, deploy file or
playtest setup laid it, and both seats' skymp5-client-settings.txt carried no such key, so a blocked plate's script fired but its
default processing (the activation parents) never activated the wall. The gates were green on their own premise: the gate audit's
class (numidium's audit, ADR-062's baseline row). The pillars worked because a press on a blocked activator still reaches its own
script. Resolution: ADR-062 slice 1a (fork m4-scripts-work f08abd57) lifts the engine's activation on activators and movable statics
in a cell this game HOSTS, following the hosting at every grant and release, and the list retires; tonight's stopgap is the same
key laid by a relaunch on both seats, at Eli's word. The b-* scenarios drop their relaunch writes when slice 1 stages.

## Status

- [ ] doc complete, inventory listed with a disposition per row, rung declared (the reference trace owed)
- [x] engine surface cited or delegated (the code map of 2026-10-31)
- [x] server logic + T0 (fork m4-traps 2e156211: OnLinkedActivation, the host's linked report, the relay, the budget; 7ab2d1c7: links from script properties, the caster by id; TrapRelayTest three cases)
- [x] message + validator (same commit; b163fc62, RelayedActivation MsgType 70, SCHEMA_VERSION 28; decision 3's
  ObjectAnimation MsgType 71, SCHEMA_VERSION 30, fork m4-object-animation)
- [x] decision 2 whole: a player's activation of a scripted world object relayed to the cell's other games, both ways
  (fork m4-puzzle-relay, MERGED to parity fcbced40 20:09 PST 2026-11-01 in the bondblock train); x-puzzle-relay v3 green 030924 and
  promoted to lab/scenarios/b-puzzle-relay.yaml (6b45c119): the guest's turns run on the host, the host's reach the guest, the
  solved pull opens the portcullis; the pillars' marker 0x4fcdf E_TRAP_NO_REF by design
- [x] decisions 1 and 3 whole (fork m4-object-animation, MERGED to parity ad1aa50a with layer-world-scripts-host to main 482f157b,
  05:09 PST 2026-11-02, numidium: the sweep 20261102-064754 114 of 114 green in 126 runs, verdict watch on b-npc-talk's two
  lone-red reruns; both clones promoted): the hosted-cell gate (host-scoped script rows, SetCellHosted, the lifecycle events admitted
  everywhere), ObjectAnimation (MsgType 71) from the host's two engine families (the behavior graph's event and the NiControllerManager
  sequence) to the guests, recorded as lastAnimation. T3: b-object-anim (promoted from x-object-anim v4, green 063627; 7875c655),
  b-puzzle-relay, b-bleak-traps. What a player gets: plates, walls, levers and pillars play on every screen as the host's engine plays
  them; a guest's own engine runs none of the cell's scripts; a trap still harms no guest (decision 4, TrapHit, on its branch)
- [x] native hook + T1 (decisions 1 and 3: SetCellHosted (TESModPlatform, declared in the pex), the SendAnimation hook's reference
  range and the PlayAnimation_Impl hook (14297), AE only; T1 is the lab's platform log lines)
- [x] TS handler, first cut (relayedActivationService.ts plays the relay, activationService.ts sends a hosted cell's non-player activations, objectReferenceEx.ts keeps the engine's activation on activationUnblockedBases; 0ec0407b, tsc green); its hosted-cell shape is ADR-059 decision 1's platform change
- [x] T2 green (the pair's verb-merge on the per-sha tag of ad1aa50a, 2026-11-02; every session identical; no difftest session
  triggers ObjectAnimation or TrapHit yet, the fake clients host no cell)
- [ ] T3 scenario green, no HYPOTHESIS tags
- [ ] parity scenario green, or its later list reviewed with it (ADR-031)
- [ ] sequences and combinations green, every checklist item with its scenario (ADR-033)
- [x] ledger and suppression registry updated (no new native; the suppression rows are the inventory's)

Play: BROKEN, playtest 41 (2026-11-02, LOG 16:53, 17:33): the spike wall never fired in play (its activationUnblockedBases key
was laid by the trap scenarios' relaunch alone, never for play); the Hall of Stories pillars and Embershard's bridge worked; the
traps stopgap laid at break 3, unread in play.

Play: playtest 44 (2026-11-03 night, canon-3 9869d28c): the pillars did nothing on the host's own screen and the guest's E sent
nothing until the key was laid live on both seats at 20:01 PST (the same lever, never laid for play before; now in
lab/deploy/sky-client/skymp5-client-settings.txt for every stage, thuum 6ddf8ae2); with it the puzzle opened the gate end to end on
the host's faces (VERIFIED IN PLAY), with three pieces left: a pillar's starting face differing between the seats, one pillar never
turning, and the guest's own turn showing on the host's screen only (b-puzzle-relay v2's new claim; the last green run had the
guest's "played" line for her own turns).

## The pillar's side (14:12 PST 2026-11-04, 22:12Z 11-04; playtest 45's item 5, 44's shape)

The puzzle pillar (ACTI NorDefaultPuzzlePillar01, model Clutter\Ruins\Pillar\RuinsPuzzlePillar01.nif; the NiNode Pillar01 turns under
the Havok project RuinsPuzzlePillar01.hkx, Skyrim - Animations.bsa) runs Behavior00.hkx, a state machine with no variables: Side01,
Side02, Side03; Turn0N fires on Trigger0N from Side0N alone (the animations RuinsPillarTrigger01/02/03 on Pillar01), Turned0N at a
turn's end, StartState02 and StartState03 jump to a side with no turn, Side01 the default. The host's defaultPuzzlePillarScript jumps
its graph at the load (StartState0N) and sends Trigger0N by its own state; a guest's graph never got the jump (the relay carried
Trigger*, Turned* and the trap names, no StartState*), and a late joiner's replay of the record's Trigger0N from Side01 has no
transition, so a guest pillar whose start side is not 01 sits desynced, dropping every relayed Trigger silently until the host's
cycle reaches Side01 (playtest 44: "2nd pillar STARTED desynced ... resumed syncing once the rotation passed the one it was desynced
ON"; playtest 45: the guest's own turn on the host's screen alone while the gate opened on the host's state; numidium's reading of
the graph, confirmed by its string table). FIX fork m3-canon-4-pillar-side 843fed95 (client script alone; the wire refuses an empty
event only, the server records any): StartState* relayed and recorded like any event; a relayed or replayed Trigger02/03 played
after the graph's own StartState02/03, Trigger01 alone (Side01 the default), remoteServer's record replay through the same path; the
guest's "object animation <refr> <event> played" line gains "(relayed|the record, taken|refused, after StartState0N taken|refused)".
HYPOTHESIS until Eli's T4 at the pillars (turbo) and x-puzzle-guest-view v2's node read on the guest (a platform export of a node's
rotation, the shape sitting on its node's origin; NetImmerse's Euler natives take arrays the platform cannot pass). Known limit: a
Trigger01 relayed to a guest still on Side02/03 is dropped until a Trigger02/03 resyncs it.

PLAYTEST 46 (14:48 PST 2026-11-04, 22:48Z 11-04): with 843fed95 turbo-client'd, NEITHER seat could turn any pillar: every E reached the
server, zero "animates" lines, no "object animation" line on either seat. The cause, from the change: remoteServer's replay of
the record's lastAnimation at a CreateActor runs on every seat, the host included, and 843fed95 routed it through the jump, so the
host's graph was moved to the record's side (StartState0N, Trigger0N) while its script stayed on its own start state; the script's
first Trigger0N had no transition, PlayAnimationAndWait never saw its Turned0N and the script's busy flag never cleared. The
host's graph is its script's: the record reaches the host's script through its activations (decision 5), never through graph
events. HOTFIX ae010d0a: the jump is a live relay's alone (a guest's); the record's replay plays the plain trigger as before (the
host's seat relaunched to clear the stuck script). The guest's replay at a load therefore still lands on the record's side only
when the plain trigger matches its default side: the limit stands until the host's script state is fed from the record (decision
5's activation counts, or the script's own state property through script-variables), the next build.

THE REVIEW (15:05 PST 2026-11-04, 23:05Z 11-04; a fresh read-only agent on 7c79fc3e..ae010d0a, ADR-064 rule A): seven findings, applied as
written in fork m3-canon-4-pillar-side fffd8a66 (carried onto m3-canon-4-noderot 34d85b9f). F1 (medium, new with 843fed95): the record's
lastAnimation can now be the host's reported StartState0M, and the plain replay at a CreateActor still ran on the host, after its
script's own jump (the first attempt at onceLoad is refused before the graph exists, the taken one comes 2 s later); a stale M
would have moved the host's graph off its script: now the replay waits one interval and skips a seat that hosts the cell
(HostService.hostsCell), logging "not replayed: hosted here"; a grant slower than the interval still lets a host replay once, the
limit until the server sends the record to non-host loaders alone (CreateActor without lastAnimation, the ObjectAnimation message
for both the relay and the record; the next build). F2 (medium, pre-existing): a TypeScript playAnimation runs under
CallNativeApi's Override, which the animation hooks return early under, so no replay ever re-entered the hook; the self-played
marks only hid GENUINE reports for 20 s, the host's first turn within 20 s of a pillar's CreateActor among them (44's and 45's
teleport-then-turn shape; b-puzzle-relay's 48 s gap is why it stayed green): the marks now consume on their hit over 3 s, and a
"dropped as self-played" trace says whether a re-entry ever happens (zero lines with a record present means the marks can go).
F3 (low, pre-existing): a hand-off's new host plays a relay in flight as a guest and its script and graph differ after a turn;
decision 5's state feed is the fix. F4 (HYPOTHESIS): "after StartState0N refused" on a guest already on Side0N is a self-transition
the graph may refuse, the trigger then plays from Side0N: the expected word, not a fault. F5: every seat's script runs OnCellLoad
(a lifecycle event passes the gate everywhere, ADR-062 decision 1) and jumps its graph to the reference's INITIAL side, so a guest
sits on the host's initial side at a load, not Side01; the wording above and in the code follows. F6: the record path's id is
the remote one. F7: the record path says "replayed", so b-puzzle-relay's " played" claim never counts a host's refused replays.

### The next build: the hand-off (15:19 PST 2026-11-04, 23:19Z 11-04; DRAFT, no code)

Playtest 46's second lay (fffd8a66, c1 inheriting the Temple at epoch 3 after c2's relaunch) showed F3 live: a seat's pillar graphs
move while it is a guest (the record's replay at its load, every live relay after), its scripts stay on their initial sides (OnCellLoad
runs everywhere, OnActivate on the host alone), and when it inherits the cell its scripts' first Trigger0I has no transition:
PlayAnimationAndWait never returns, busy for good, every pillar dead for every seat. Tonight's protocol: the Temple's host first-in
and never relaunched during the pillars. The build after decision 5, two halves, both needed (a feed alone advances a graph that was
never where the script thinks it is):

1. The client's re-sync at a grant (hostService's cellHostChanged {hosted: true}): for every puzzle pillar of the cell this seat has
   seen events for (a reference whose Trigger0N or StartState0N passed the hook), the graph is put back on the script's initial side
   (the StartState0N the hook saw from the local script at the cell load, stored per reference; initial side 01 has no jump event and
   takes the round Trigger02, a wait for Turned02, Trigger03), with plain playAnimation calls, never marked self-played, so the new
   host REPORTS them and every guest and the record follow. Cost: the pillar snaps to its initial side on the new host's screen and
   its guests' within a turn or two; a press inside that round (about five seconds) finds the script's trigger refused mid-turn and
   sticks it, the same shape, so the client holds E on a pillar until its round ends (blockActivation for the round, or the E
   dropped with a console word).
2. The server's state feed (decision 5): the reference's activation count since the cell's record began (scriptedActivations on the
   change form: a migration, rule 6, and a restart-persistence scenario), fed to the new host at the grant as that many relayed
   activations spaced by the script's busy window; a pillar needs the count mod 3 (its graph is a three-cycle) and the client knows
   it is a pillar by the StartState0N or Trigger0N it saw, so the feed is short; the lever's own count stays on its host's script as
   today (its check reads the pillars' states at the pull). The new host's script then equals the record and its graph, reset
   first, follows it turn by turn, relayed to the guests.
3. The record's replay to guests becomes the server's business: CreateActor drops lastAnimation (a contract narrowing, its fixture),
   and the server sends a non-host loader the reference's last event as the ObjectAnimation message after ApplyHostDecisions, so
   the host never replays and a guest's view comes through the one path with the jump (the review's F1).

Reads: x-puzzle-handoff (c2 hosts first, c1 loads as a guest, c2 relaunches, c1 inherits: c1's own E turns aa8cb, the server's
animates, the guest's view by node-rotation); the restart-persistence scenario for the count; b-puzzle-relay as the regression.

BUILT (15:25 PST 2026-11-04, 23:25Z 11-04), client alone, smaller than the draft: the record's lastAnimation already encodes a pillar's side
(StartState0M is M; Trigger0N turns from N, so the side is N+1), and the local script's StartState0N at the cell load (the hook sees
the engine's own event on every seat; a TypeScript play never re-enters) gives the initial side, so no count, no migration and no
wire are needed for a pillar. Fork m3-canon-4-pillar-side 30839d4b (objectAnimationService.ts, remoteServer.ts; on
m3-canon-4-noderot 68093a7d): at cellHostChanged {hosted: true} each pillar of the cell has its graph put back on its script's
initial side (StartState0I; the round Trigger02 then Trigger03 for Side01), activation blocked meanwhile, then k = (S - I) mod 3
activations fed to its own script through refr.activate(player) spaced by the turn, each reported, relayed and recorded; the line
"pillar <id> re-synced at the grant of <cell>: the script's initial side I, the record <event> (side S), k turn(s) fed to the script".
The guest's replay carries the jump again; the host never replays (the deferred hostsCell skip). Draft items 2 (the count) and 3
(the record through the server) stay as the structural shape for other scripted objects. Read: x-puzzle-handoff v1 by path
(sha1 c0ca8641); a fresh review runs on the commit.

### The dropped Trigger02 (15:44 PST 2026-11-04, 23:44Z 11-04; playtest 46 on fffd8a66 with a first-in host)

Eli: "on EITHER seat, if i turn a pillar to whale, that pillar doesnt rotate on the other screen until i rotate it OFF of whale,
then the other screen will rotate 2 times to catch up." The server's log since 23:35Z shows the host reporting Trigger01 and
Trigger03 and never Trigger02 (activations with no "animates" at 23:36:10.966 and kin); 45's server log has the same shape for all
three pillars (aa8cb 3 Trigger01 and 2 Trigger03, aa8cc 2 and 2, aa8cd 3 and 2, a cycle needing a Trigger02 between), and so has
the green b-puzzle-relay run 045100 (no Trigger02 anywhere). The server refuses nothing (every refusal logs an E_OBJANIM line; the
per-reference window is eight a second), so the host's client never sent it: objectAnimationService dropped a noted event whose
engine flag said it had not taken (ctx.animationSucceeded, NotifyAnimationGraph's return value through FridaHooks
OnSendAnimationEventLeave), and the whale turn's Trigger02 comes back false while the pillar visibly turns (HYPOTHESIS on the
why: Behavior00's Turn02 a different transition kind than Turn01 and Turn03, Havok's handleEvent answering false for it). So since
the relay began a guest sat one side behind the host until the cycle passed it (44's "resumed syncing once the rotation passed the
one it was desynced ON"); with the side jump the catch-up became the visible double turn. FIX fork m3-canon-4-pillar-flag 83a40da3
(fffd8a66 plus 22 lines, the lay for 46's turbo on Eli's word): a pillar's Trigger0N is reported whatever the flag says (the
script sends a Trigger only when it turns), every other event keeps the flag, the line "object animation <id> <event> reported (the
graph's flag said refused)" when it lied; the same condition rides m3-canon-4-pillar-side from beffa74d.

THE HAND-OFF'S REVIEW (15:44 PST): a fresh agent on 30839d4b found a blocker and seven more, applied as written in d1f23444 (on
m3-canon-4-noderot bb559685): F1 the grant's listener called natives inside a message handler (hostService's own rule: the
platform's gameThrQ is the update's, a native there throws and skips the listeners after it, changeFormService's among them), now
once('update'); F2 the activation block protects nothing (the Creation Kit's BlockActivation withholds default processing alone,
OnActivate still reaches the script), so the reset is one turn at most (StartState03 then Trigger03 for Side01, a jump otherwise)
with no block, a press inside that turn the known limit and the cell's scripts held through the gate its next shape; F3 the
script's side is its LAST side-naming act, not the first StartState seen (a seat that hosted, turned and walked out keeps its
Papyrus state); F4 the probe's step C passed on the feed alone, so x-puzzle-handoff v2 (sha1 93adae62) counts past the feed and
claims the feed itself; F5 a catch says a failure and the feed stops when the seat no longer hosts the cell; F6 no self-played
marks in the re-sync; F7 a record naming no side is said, the base decides a pillar when readable, the record keyed by the local
id; F8 an unused import. Still ahead of its first lab run.


### The whale's real cause (19:47 PST 2026-11-04, 03:47Z 11-05; supersedes "The dropped Trigger02"'s HYPOTHESIS)

x-native-frame 20261105-033116 (bb559685's dist, native-frame.js v2) read the host's three turns of aa8cb at the VM's native
dispatch, NativeFunctionBase::Call 104651: three rows on VM worker thread 9032, caller defaultPuzzlePillarScript.RotatePillarToState,
"frame own yes", "args agree yes", Call returning 2 (kInProgress, a latent native): PlayAnimationAndWait on aa8cb with Trigger01
Turned01, then trigger02 Turned02, then Trigger03 Turned03. The whale's event is the script's own LOWERCASE "trigger02". The engine
matches a graph event without case, so the pillar turns; the platform's hook filter compares bytes (Handler::Matches, a memcmp for
the StartsWith pattern 'Trigger*'), so the hook never handed "trigger02" to the client and no seat ever reported the whale (44, 45,
46 and every relay run). The flag condition of 83a40da3 was harmless and beside the point. FIX: fork m3-canon-4-whale c4775a85 (on
73ed0c52 merged with bb559685, tree bb559685's): each pillar pattern registered in both cases ('trigger*', 'turned*',
'startState*' beside the old), and the side, jump and report regexes case-blind, so a guest jumps to the whale's side before a
relayed 'trigger02' as it does for Trigger03. Lines say 'trigger02' in lowercase from now on; claims match case-blind
("[Tt]rigger02"). The proof: b-puzzle-relay, b-object-anim, x-puzzle-guest-view v3 (sha1 3027db06, local rotations; turn B is
the whale) and x-puzzle-handoff v3 (sha1 37d0d4ce, the profiles' ids, a whale claim on the new host) on bb559685's dist with
c4775a85's bundle; green moves canon 83a40da3 to c4775a85 (the side sync, the hand-off, the export, the whale).

### A linked activation of an actor (21:08 PST 2026-11-04, 05:08Z 11-05; fork ccc98a2d on m4-scripts-1-flip, ADR-068; the relay to another simulator and its checks 22:01 PST 2026-11-04, 06:01Z 11-05, fork 03714dc8 and dcef5d8f)

Authority: R2 on the seat that simulates the actor. A host's report of its engine's linked activation whose TARGET is an actor
(an ambush's draugr woken by its trigger: Bleak Falls Temple's defaultActivateSelfTRIG 0x38098 and its ACHR children 0x380b3,
0x380b4, 0x380b5, 0x380b9, whose XAPR name the trigger with delays 0, 4, 3, 5 s) is that actor waking on its simulator. The
server never relays it to the cell's other games (a relay there would run the engine's activation on a watcher's puppet, which
renders and never simulates, ADR-063 decision 3) and asks who simulates the actor (OnLinkedActivation, before the reference,
cell, host and link checks of the non-actor path; WorldState::HostOf: the player a follow or a dialogue claim names, else the
cell's host, else nobody):
- The reporter, or nobody, or a simulator with no game connected: dropped, since the reporter's engine ran the waking or no
  engine runs the actor. The line, unchanged since ccc98a2d: "[verb:traps] <host> reports <caster> activating actor <id>: the
  actor's simulator's (the NPC stream carries it), not relayed". HYPOTHESIS until a two-seat read: the NPC stream carries what
  follows (the actor's waking, its walk and its attack) to the other games' puppets (x-bleak-traps-npcs v2 reads it on rung 1's
  stage).
- Another seat (a dialogue's claimant, ADR-052; a pass-margin follow into the reporter's cell; a thrall's commander once
  ADR-060's row lands): the same RelayedActivation (target, caster) to that seat's game alone, within the reporter's budget of eight linked relays a second (shared with the non-actor path; a refusal
  spends none). The line: "[verb:traps] <host> reports <caster> activating actor <id>: its simulator <owner> is another seat's,
  relayed to it". Before the relay two checks, the non-actor path's own: the reporter hosts the cell the trigger stands in
  ("E_TRAP_NOT_HOST: <host> reports <caster> activating actor <id>, its trigger in a cell it does not host"; with no claim the
  cell's host simulates the actor, so a guest's report would otherwise wake the host's own; a trigger the server never loads, a
  marker on OnActivate's record path, has no cell the server knows: "E_TRAP_NO_CELL: <host> reports <caster> activating actor
  <id>, its trigger's cell is unknown", 5 of Skyrim.esm's 937 actor activation links), and the actor's game-file record's XAPR
  names the trigger ("E_TRAP_UNLINKED: <host> reports <caster> activating actor <id>, whose activation parents do not name it";
  read from the ACHR as MpObjectReference::Init reads a non-actor's, since the table skips actors). HYPOTHESIS until a T3 run: the
  simulator's engine wakes the actor on the relayed activate (relayedActivationService plays target.activate(caster) for any
  reference).
An actor the server never loaded (0x380b4, NPCs on or off) is judged an actor by its game-file record (ACHR) and has no
simulator the server knows of: dropped. Before this rule the pairs read E_TRAP_UNLINKED (the activation-parent table is filled for
non-actor references alone, MpObjectReference::Init) with NPCs on and E_TRAP_NO_REF with NPCs off (x-bleak-traps-npcs
20261105-023048; b-bleak-traps v1 on canon and on 83a40da3, 20261105-013206, 013632, 020830, 021251).
T0: TrapRelayTest's "A host's linked activation of an actor is the actor's simulator's" (the unloaded draugr 0x380b4 judged by
its record while NPCs are off, then the loaded 0x380b3 with the reporter as its simulator; each drop line once through the
default logger, no E_TRAP_ line, no relay, the plate's wall still relayed; 0aba88c4 made it able to fail: deleting the rule turns
the two reports into E_TRAP_NO_REF and E_TRAP_UNLINKED) and "A host's linked activation of an actor another seat simulates goes
to that seat's game alone" (before any claim, the guest's report of the pair refused E_TRAP_NOT_HOST with nothing relayed; the
guest's dialogue claim makes it the simulator, the host's report relayed to the guest alone with the trigger as the caster; the
host's report of the plate 0x567f2 and the draugr refused E_TRAP_UNLINKED).
Not validated (rule 5, recorded here): that the trigger fired at all and when (the host's word, R2; the XAPR delays are the
engine's), and what the woken actor does next (the NPC stream's own rows). The drop records nothing, since the stream is the
record.
OPEN, the exterior ambush (the review of 066cce4e..536e30d4, finding 1): the client reports a linked activation only when its
seat hosts the TARGET's cell (activationService.ts's linked branch), so a trigger in a cell one seat hosts whose actor stands in a
cell another seat hosts is reported by nobody: the trigger's host is not the target's, and the actor's host never runs the
trigger's script (its gate blanks a cell it does not host). The ambush then wakes on no seat. 72 of Skyrim.esm's 937 actor
activation links cross an exterior cell boundary. The fix is the client's gate for an actor target (report when the seat hosts
the CASTER's cell, which is what the server's relay checks), as its own change with its own two-seat probe.
OWED at T3 (rule 3) before the relay counts as proven: a read of the relay itself, a claim or a follow putting an activation
child on the guest, then its trigger fired on the host, then the guest's "relayed activation <actor> by <trigger>" and the actor
waking there. The dialogue claim cannot be staged on a hostile ambush actor, so the read waits for a follow or a thrall
(ADR-060) in reach of a linked trigger; until then the relay is T0's alone and this section's HYPOTHESIS stands.

### The re-sync's form wrappers (22:40 PST 2026-11-04, 06:40Z 11-05; fork m3-canon-4-whale fe753e3f, merged into m4-scripts-1-flip dd280139)

The first re-sync to feed a turn threw (x-puzzle-handoff-late v2 20261105-060929: c1 inherited Bleak Falls Temple with aa8cb's
script on side 1 against the record's Trigger01; "pillar aa8cb re-sync at the grant of 371de failed: Error: SP3NativeValueCasts::
JsObjectToNative...", the console's cut). A Skyrim Platform form wrapper dies at the first wrapper minted after the Papyrus update
count moves (docs/engine/scripts.md S5), and the re-sync kept the pillar across its waits, so the side-1 reset's Trigger03, its
first native after a wait, threw; v4 and v5 had fed nothing. fe753e3f takes the pillar and the player again by id after every wait
(its fresh review GO with notes: no defect, no other wrapper in skymp5-client kept across a wait). The lines the re-sync prints, for
the probes' claims:
- "pillar <id> re-synced at the grant of <cell>: the script's side <I>, the record <event> (side <S>), <k> turn(s) fed to the
  script" (unchanged; the console keeps it to about "fed to").
- "pillar <id>: the re-sync at the grant of <cell> stopped, this seat no longer hosts the cell (<i> of <k> turn(s) fed)"
  (unchanged).
- NEW: "pillar <id>: the re-sync at the grant of <cell> stopped, the pillar is gone (the reset's Trigger03)" and "pillar <id>: the
  re-sync at the grant of <cell> stopped, the pillar is gone (<i> of <k> turn(s) fed)"; the same with "the player is gone" cannot
  fire (Game.getPlayer's fast path always wraps the player).
- CHANGED: "pillar <id> re-sync at the grant of <cell> failed at <step>: <error>", the step StartState0<N>, Trigger03 or "turn <i>
  of <k>", before the platform's text, which the console cuts at 128 characters.
Known, from the review: the reset's own "no longer hosts" return (after its first wait) prints nothing, so a probe cannot tell a
reset stopped there from a re-sync never begun; a line for it rides the next commit that touches the re-sync.

### D-S3, traps follow the interaction (02:37 PST 2026-11-05, 10:37Z 11-05; fork m4-scripts-2b-traps 9ff1895e, its reviews and first build running)

ADR-068's D-S3 (accepted by Eli 08:04Z): whoever sets a trap off owns that firing, as a conversation claims an NPC (ADR-052) and a
touch claims a prop (ADR-058). The design and its findings: docs/research/trap-slice-d-s3-2026-11-05.md. Built in three layers on
rung 2's seam; the pieces and their rungs:
- The firing: every seat runs the trap family's scripts (every script on the reference in the class chain of TrapBase,
  TrapTriggerBase, TrapHitBase; the platform's TrapFamily.cpp), in any cell, and fires a trap for what its own engine sees, a
  figure on a plate included. R3 per seat (D-S2 B's cosmetic copies). The client never blocks activation on a family reference;
  the seam runs a family reference's natives as the seat's own (state rows counted " (trap)", action rows unmirrored).
- The hit: ObjectReference.ProcessTrapHit's self is the hit actor, owned on that actor's own seat alone, so a non-owner's copy
  skips it (scriptNonOwnerSkip nonLatent) and each player is hurt only by what its own screen showed. R1 (the hit seat computes;
  the player's health reaches the server as its actor values). Retires fork m4-trap-hit's host report (never merged).
- A single-use result: DestructionStage (MsgType 78, docs/WIRE.md), reported by the seat that caused it or saw it first, recorded
  once (the stage only rises, destroyed only goes true), served to late joiners and after a restart from the reference's record.
  R2. Not validated (rule 5): that the reported step happened at all (the reporter's word); the server checks only that the
  reference is a game-file non-actor and that the reporter's game has its cell loaded. A spent trap goes deaf on every seat: the
  platform's gate gives a destroyed family reference its lifecycle events alone (FridaHooks.cpp, "a spent trap, hears its
  lifecycle alone"; x-trap-boulders-claim 140118's c2.log read it on the wire b6d3f), so a copy whose script never fired, a late
  joiner's or one the record reached first, cannot fire a single-use trap again.
- A trap body moved by physics (Embershard's rocks): simulated by the seat whose firing moved it (a prop claim by impulse, touch
  3; the first firing wins, E_PROP_MOVING for the second), streamed to the others, its rest recorded; a following seat's own
  motion calls run neutralized. R2. Not validated: the body's samples (the prop stream's own rule).
- The relay: a linked pair whose trigger and target are both family is fired by every seat itself and not reported; mechanism
  triggers (levers, pull chains, the puzzle lever) and their targets still go through the host and its relay. Phase 2: a
  player-only trigger's pair is reported from the seat whose player tripped it (the server's not-the-host exception for a trigger
  whose VMAD sets playerOnlyTrigger, from a reporter with the cell loaded).
HYPOTHESIS until the slice's probes read them: H-T2 (an unblocked plate on a non-hosting seat fires its children there; CONFIRMED by run, x-trap-family-fire 20261105-135134 on 46b95609: the guest's plate fired for the host's figure and each seat fired the wall itself, nothing reported or relayed, the pull chain's blades still through the host), H-PO1
(Object::GetProperty reads playerOnlyTrigger), H-AW (a neutral argument written into the native's frame is what its body reads),
H-KF (a Keyframed follower rock hurts its own seat's player), H-DS1 and H-DF1 (the destroyed flag's timing beside the stage
event), H-DS4 (the engine's own stage explosion plays when a served record is applied), H-EX (an explosion's damage goes through
DamageActor, cut for figures and puppets). Open with Eli: D-T1 (the oil lamp's script, TrapFallingOilLampColLayer, is outside the
class chain: a "trap" name prefix, two named roots, or the host's), D-T2 (rewriting b-bleak-traps' and b-object-anim's legs A and
B, which claim the host's relay of the plate's wall). The probes: x-trap-dodge, x-trap-lamp, x-trap-boulders (lab/.cache/probes,
by path, with their fresh review before the first run). Owed before the slice merges whole: a restart-persistence scenario for
the destruction record (rule 6) and a T2 difftest session for DestructionStage.
Declared limits, from the slice's two fresh reviews (GO with notes on 9ff1895e; their hardening rides the next head): the
engine's own stage effects (a destructible's stage explosion placed by its stage data, script or not) are no Papyrus event, so
no blank covers them, and a late joiner or a restarted seat standing under a shot lamp may be hit by its explosion again at the
apply (x-trap-lamp's late and restart legs read the applying seat's health); the served record's blank is lifted one update
after the last DamageObject (H-DS1); the loaded-cell gate on a destruction report rests on the reporter's own CellLoaded
(client-reported, rule 5), and a trap body's touch-3 claim is the claimant's word (R2), bounded by the hardening (a destruction
record only for a trap or destructible world body, E_DESTRUCTION_KIND; a world body's sample at most 2048 units from its
game-file position, E_PROP_FAR, UNMEASURED; a per-row distance allowance at the 6000 units a second cap in place of the
per-sample floor); the record only rises, so an engine cell reset never re-arms a trap; the relay goes to the reference's grid
listeners, so a seat with a large interior loaded past that 3x3 hears a record at its next subscribe and may fire its own copy
meanwhile; the served line logs at info on every subscribe.

Window 1 (06:20 PST 2026-11-05 (14:20Z 11-05); numidium's stage on fork m4-scripts-2b-traps 46b95609, the lever on): six of seven green, b-puzzle-relay v4
134221, x-trap-spots 134713, x-trap-family-fire 135134, x-trap-boulders-claim 140118 (the seat that trips the wire claims the
rocks), x-bleak-scripts v3.1 140410, x-puzzle-handoff-late-flip v1.3 141042. RED, a premise: x-trap-lamp-trigger 135717, neither
lamp set off. The lamp 0x9b0fb is ACTI 0x90efc TrapFallingOilLamp01, its base's TrapFallingOilLampColLayer falling on OnActivate,
OnHit or OnMagicEffectApply in its waiting state (switchToFalling: DamageObject 10, DisableLinkChain), destructible with 100 health
and two stages; yet on c1, the Temple's host, the driver's Activate returned false, no activate event fired (no "engine's own
activation" line), the script's DamageObject census read 0, and the driver's Spell.Cast at 0x9b0e2 reached nothing either.
Dynamic plan (rule 8; the read before any lamp claim): a probe of the lamp's trigger alone on the host, recording (1) whether
0x9b0fb is in the host's loaded refs at the press (refs-near with ids), (2) the platform's SendEvent gate for the lamp's handle
around the press (the gate's blank tally, or a Frida trace on the event dispatch filtered to the lamp's VM handle: OnActivate
reaching the script or blanked), (3) Activate's return beside the reference's activation-blocked state, and (4) a hit by another
route (a melee strike, or a hand cast aimed once the driver can turn the camera onto a reference); expected: OnActivate reaching
the script on the host moves the lamp to Triggered and its DamageObject runs. D-T1 (the lamp's family) is Eli's and does not
change the host's case.

Window 1's reads (06:32 PST 2026-11-05 (14:32Z 11-05); numidium's three from the runs, mine of 135717's artifacts):
- DestructionStage end to end, x-trap-boulders-claim 140118: c2, the tripper, "trap result b6d3f: stage 0, destroyed true
  reported" (14:02:28.815Z on c2's clock); the server "ff000001 reports b6d3f at stage 0, destroyed true: recorded (the first
  report), relayed to 1 game(s)" (14:02:30.745); c1 "trap result b6d3f applied from the record: stage 0, destroyed true (here
  stage 0)" (14:02:29.113 on c1's clock; the seats' clocks run a few seconds behind sky-srv's); no "the record stands" line and no
  E_DESTRUCTION_ in that server log. The message's report, record, relay and apply CONFIRMED by run for a destroyed flag at stage
  0. H-DF1 (a destruction reaching its destroying stage sets kDestroyed) is not read by it: the stage stayed 0.
- The lamp run 135717: the facing premise HELD. The Temple's north marker 0x37258 (STAT 0x3 NorthMarker, rot (0, 0, 180) by
  lab/esm.py) turns the interior's compass, so the screenshots' "N" is world south, the heading both teleports asked: 020-c1 shows
  a lit lamp hanging intact straight ahead after the press (0x9b0fb by its place, 256 units south), 035-c1 the oil corridor with
  two lamps intact after the cast. c1's census at 13:59:18.712Z read "census ObjectReference.Activate (platform) 1 in 30 s": the
  press reached the engine through rung 2's seam as the platform's own call, not skipped, and the engine answered false, with no
  activation line from activationService, no DamageObject in any census window and no line naming 9b0fb or 90efc in either log.
  The driver's Spell.Cast(player, 0x9b0e2) resolved ("onResult called: Spell.cast (call 1)", 13:59:06.589Z) and nothing
  followed. H-CAST (the probe's: the driver's Spell.Cast raises the player's cast on the wire) FALSIFIED by run, 0 OnSpellCast
  lines; no D-S3 lamp claim needs it (the lamp's own stage report is the path). The teleport to oilcast also crossed the oil room's
  ambush box 0x383f9 (c1 "Sent a trigger's own activation for 383f9", then its linked 383f8, 800a9, 383ec, 383f7): that spot
  stands inside the box, not outside as v1's header said.
- Dynamic plan, revised with the facing ruled out: (1) the static read of TESObjectREFR::ActivateRef (CommonLibSSE-NG
  src/RE/T/TESObjectREFR.cpp:52-57, RELOCATION_ID(19369, 19796), `just addr 19796` 0x2eac20) and of the Papyrus Activate native's
  callback: every return before a TESActivateEvent or an OnActivate is queued, and what kBlockActivate (include/RE/E/ExtraFlags.h:17)
  changes; the re-analyst's; (2) a premise probe with a Frida trace on c1: ActivateRef's entry and return for the lamps, the VM's
  SendEvent rows for the lamps' handles with their names, the projectile's launch and the hit's dispatch for a hand cast aimed at
  a lamp (the teleport's heading, a mouse pitch, crosshairRef recorded), and the console's GetDisabled and GetDestroyed on the lamp
  before the press. Expected on a working route: OnActivate or OnHit on the lamp's handle, then DamageObject on the host.

The lamp's static read (07:03 PST 2026-11-05 (15:03Z 11-05); the re-analyst on sky-re through pyghidra, REA down; every line HYPOTHESIS until
lab/frida/lamp-shot-trace.js reads it): TESObjectREFR::ActivateRef 19796 (CommonLibSSE-NG src/RE/T/TESObjectREFR.cpp:52-57)
returns false, before it sends TESActivateEvent (20038 on ScriptEventSourceHolder+0x58) and so before SkyrimVM's sink 53959
queues OnActivate, when the activator is the player and the reference's base has no name and is neither water nor a talking
activator; ACTI 0x90efc carries no FULL (lab/esm.py), so a player's press on an oil lamp is never a route, while a non-player
activator (a trigger, the lamp itself) skips the rule, and kBlockActivate is read only after the event. The Papyrus Activate
native 56139 returns ActivateRef's answer unchanged. Spell.Cast's native 55747 queues a CastFunctor whose run (55744) calls
CastSpellImmediate 34404; with the player as caster the desired target is replaced and the bolt launches (Projectile::Launch
44108, CommonLibSSE-NG Projectile.cpp:255-258) along the player's own heading and pitch, so v1's level bolt flew under the hanging
lamp. A projectile's impact (44213) sends TESHitEvent (38668), relayed to the reference's scripts as OnHit by SkyrimVM's sink
53974, after the engine has queued the destructible's damage (QueueUpdateDestructibleObject 36909, TaskQueueInterface.cpp:32-35),
which raises the lamp's stage and so its script's OnDestructionStageChanged too. Dynamic plan: x-trap-lamp-trigger v2 aims the
host's shot (the teleport's heading onto the lamp, a mouse pitch swept up in four steps, a cast at each) with lamp-shot-trace.js
on the firing seat (the cast, the launch's angles, the impact, the hit event, the destructible damage, the VM's events for the
lamps, ActivateRef on them); expected: an impact on 0x9b0fb, OnHit and OnDestructionStageChanged to it, the host's report and
the server's record.

Window 2 (07:26 PST 2026-11-05 (15:26Z 11-05)): probes by path, each after its fresh review (ADR-064 amendment A): x-trap-wire-restart v1.2 (rule 6: the
destruction record across a server restart and into a fresh game; H-DEAF expected true by the spent-trap blank), x-trap-lamp-trigger
v2.1 (the host's aimed shot under lab/frida/lamp-shot-trace.js), x-trap-boulders-rest v1.1 (each rock at one place on both
seats and in the record, on lab-api 56ae7fc7's refs_near().pos_of), x-trap-hit-premise v2 (below). x-trap-hit v2.1 is HELD.
The T2 difftest session for DestructionStage (fork 029769f7, local until the lab is quiet): tried on sky-srv against
m4-scripts-2b-traps-46b95609's binary, all 41 sessions identical to their declarations.
Trap damage to a player, HYPOTHESIS until x-trap-hit-premise reads it (x-trap-hit v2's fresh review, finding 2, and the premise
probe's review): skymp5-client writes all six fDiffMultHPToPC* to 0 at its first update and again at every teleport of the player
(ragdollService.ts, remoteServer.ts's safeRemoveRagdollFromWorld), for ADR-028's "no game applies [an actor's damage] on its
own", while the repo's static read of DamageActor 37335 (docs/research/re-37335-and-rune-landing.md (c) 3) applies the
multiplier to a player victim unless the byte flag is set and the multiplier is at least 1.0, and a trap's hit passes flag 0:
as built a trap may deal a player nothing, against ADR-028's own decision that the world's damage, a trap's included, stays the
victim's game's. The same read puts a fall (flag 1) under a multiplier below 1.0 as well. Every trap probe before it ran under
god mode. If the premise reads yes, the fix carries ADR-028 out as written (the world's damage the game's own); it reopens
nothing.

Window 2's reads (07:56 PST 2026-11-05 (15:56Z 11-05); numidium's stage on the pinned lay, lab-api 56ae7fc7):
- x-trap-wire-restart v1.2 GREEN (20261105-153200; its first run 152648 ended E_RUN_GAME_REPLACED, c1's game replaced about 20 s
  after the start, a lab fault numidium chases, every claim block held there too): the destruction record survives a server
  restart and reaches a fresh game (rule 6 for D-S3's record).
- x-trap-boulders-rest v1.1 GREEN (20261105-154408): each of Embershard's seven rocks rests within 32 units of the server's
  record on both seats, c2's at-rest samples and c1's follow ends claimed per rock.
- x-trap-hit-premise v2.1 GREEN on its premises (20261105-154820), its answer CONFIRMED by run: as built a trap's hit deals the
  player NOTHING. Leg A (the client's six fDiffMultHPToPC* read 0 before and after the walk): c1 walked onto the Temple plate,
  the wall's hit counted bare on c1 (one census row), and c1's watched health never moved (two samples, both 1000). Leg B (the
  six set to 1.0 by set-gmst, read 1 before and after the walk, no teleport between): one drop, 1000 to 939.97 at 9.1 s into the
  walk, the leg's one counted hit: a spike wall's hit costs 60 at the lab's level, not the 75 the trap-path read assumed
  (HYPOTHESIS falsified). The gate is the multiplier: DamageActor 37335 applies it to a player victim's damage from the world
  as well as from an actor, so the client's zero (ADR-028's way of keeping an actor's hit off the player's own engine) also
  zeroes the world's damage ADR-028 keeps the game's. A fall rides the same gate (HYPOTHESIS, the static read's flag rule).
  D-T4 (docs/research/trap-slice-d-s3-2026-11-05.md) is the fix's one open choice; x-trap-hit v2.1 stays HELD on it.
- x-trap-lamp-trigger v2.1 RED (20261105-153748) on its own premise, not D-S3: the aim held (the crosshair on the lamp's body at
  -100 counts, about 5 degrees over it at -250: c1 turns about 16.7 counts a degree), but the driver's Papyrus Spell.Cast with
  the player as source never reached a cast: lamp-shot-trace.js, live (kernel32 Sleep 2.1M calls, the VM's SendEvent 54k), counted
  0 CastSpellImmediate and 0 Projectile::Launch through all six casts, and 3 of the 6 latent calls returned (why: unread). v3 casts
  by the player's own hand (in review).
- The DestructionStage difftest session is on the slice (fork 029769f7, pushed server-only); its sessions are the trial's byte
  for byte, so that trial (41 of 41 identical) is the head's T2.
- x-trap-lamp-trigger v3.1 GREEN (08:10 PST 2026-11-05 (16:10Z 11-05); 20261105-160444): the player's own hand cast drops the lamp on the host and the
  record carries it to the guest. lamp-shot-trace.js CONFIRMED the static read's hit route by run: the hand's launch (shooter
  0x14, Firebolt 0x12fd0, angleZ 3.0665 and angleX -0.1966: heading 175.7, 11.3 degrees up, the aim the count model put
  there; c1 landed at z -2311.305 again), the impact on 0x9b0fb (44213), the hit event to it (38668: cause 0x14, source 0x12fd0),
  OnMagicEffectApply and OnHit to its script, the engine's destructible damage (36909, cause 0x14), two OnDestructionStageChanged;
  then c1's two reports, the server's "ff000000 reports 9b0fb at stage 1, destroyed false: recorded (the first report),
  relayed to 1 game(s)" and "... at stage 2, destroyed true: recorded ...", c2's two "applied from the record", no "here
  already", no E_DESTRUCTION_. The lamp's oil hazard then hit c1 under god mode. The scripted press and the scripted cast stay
  unread as routes and need not be read: a player shoots a lamp by hand.
- H-DEAF CONFIRMED by run (x-trap-wire-restart 153200's recorded leg): c2's fresh game, the wire's record applied at its login,
  walked the wire's line again and nothing fired (no "fired here" for the wire or the rocks, no claim), while the spent-trap
  blank printed three "to b6d3f blanked: a destroyed trap family reference" lines.
- Rock 0xb6d4d stayed hung (z about 8843, its game-file height) on both seats and in the record through all of 153200, though
  the server granted c2's claim of all seven; the other six rested near z 8630 to 8650. The seats and the record agree, so no
  sync fault; the fall itself flaked for one rock in one firing (HYPOTHESIS: the impulse never woke it). In 154408 all seven fell.
Window 2 is read: what is left of D-S3 before it merges whole is x-trap-hit (point 2) on D-T4's fix (fork e4c78077, local, in
review), x-trap-dodge (window 3), D-T1 and D-T2 (Eli's), and the restart scenario committed from x-trap-wire-restart (rule 6).

D-T4's fix (08:29 PST 2026-11-05 (16:29Z 11-05); fork m4-scripts-2b-traps e4c78077 and bd0c8cf8, the second its fresh review's notes applied as written,
GO with notes; built ahead of Eli's answer, so it stages and reads and merges only on it): the platform's DamageActor
replacement cuts any damage another actor deals the player (the server's, R0), unconditionally, and records whether it went
in (isDamageActorReplaced); the client sets the six fDiffMultHPToPC* from worldDamageMult (1 by default) only while the
replacement is in (0 otherwise), and the player's own ragdoll removal alone zeroes them for its window. R2 for the world's
damage (the victim's engine computes it, its actor values report it); worldDamageMult is a per-seat client setting, R3 as every
client setting is, so a seat set to 0 ignores the world's damage on its own engine (a server-carried value is the shape if
D-T4's answer must hold for every seat). HYPOTHESIS, from the review, each unread: the attacker-less paths that now land on the
player's own engine besides a trap's (37336's environmental damage and 36991's call; a hazard a figure's spell placed, such as
Wall of Flames, whose caster AddTarget's refusal does not cover and whose DamageActor attacker is unread; an owner that no
longer resolves: a rune outliving its figure, an arrow in flight, an effect's remaining ticks); the self-cast relay
(CastBondProc) passes both guards and carries concealment alone today; a lamp's or an oil pool's explosion credited to its
shooter (setActorCause) would now be cut on another seat's player (x-trap-lamp reads c1's health under the fire); a fall read
unzeroed under the old 0 (b-push), so its path is unread, and the static read skips the multiplier for a fall at 1.0 or more,
so D-T4's option B would scale a trap and not a fall. The stage's regression read needs floors on the server's record, which a
converged double count cannot pass: b-duel, b-block, b-marksman, b-spell, b-hailstone, b-poison, b-fod-kill; b-shout and
b-shout-repeat and b-shadowbond as before; b-push (equal to its history: falls unchanged; about 0.96: the landing names the
pusher and is now cut; lower: falls newly scaled); b-god's TIM leg; x-trap-hit v3. b-npc-archer, b-npc-caster, b-host-own-hit
and c-dungeon-enemies run under TGM, which puts the victim's own engine in god mode, so none can see a local copy. A low record
is read against the seat's height first: the summit sheds seats, and falls cost health.

D-T4's stage (09:31 PST 2026-11-05 (17:31Z 11-05); numidium's verb-stage of fork m4-scripts-2b-traps bd0c8cf8, server sha256:d1dee00d, client build 19241,
platform a66d1b9b): twelve of thirteen GREEN. The floors held: b-duel 164913, b-block 165255, b-marksman 165616, b-spell 165828,
b-hailstone 170029, b-poison 170230, b-fod-kill 170441, b-shout 170622, b-shout-repeat 170944, b-shadowbond 171135, b-god 171627
(its TIM leg: a lethal arrow under immortal mode left c1 at 0.0547, then 0.013, alive), so no actor's damage counts twice under
the moved cut. RED b-push 171416 on its own old flake (its y claim read -170.02; six of its nine runs of 10-20 and 10-21 read
-149 to -206 there): its push mechanics held, and its health read the falls: c2's record 0.9178 after the push against 0.9376 to
0.9431 in all nine past runs, so a fall now costs the player its own engine's damage, as ADR-028 keeps it (the old zero had
cut it).
D-S3 point 2 CONFIRMED by run on the fix: x-trap-hit v3.1 GREEN (20261105-172521, c0031667, all 28 claims): both walkers' six
multipliers read 1.0; c2's walk (leg A) left c2 at 247.024 of 300 on its own engine with its record down and c1's full, c2's
hit row bare and c1's copy " (skipped)"; c1's walk (leg B) the mirror, 246.775 of 300; neither seat's " (not hosted)" row.
A trap hurts exactly the player its own screen showed it hitting. The fix merges with the slice only on Eli's D-T4.

The dodge (10:09 PST 2026-11-05 (18:09Z 11-05); numidium's run of x-trap-dodge v2.1, 20261105-175906, on the pinned D-T4 lay bd0c8cf8; recorded under
ADR-064 amendment B, so MECHANISM ONLY until a claimed scenario or Eli's eyes): a guest outruns the spike wall its own engine
swings and is hurt nowhere. c2's six multipliers read 1 before each leg (a hit would have cost about 60). Leg 1, a run (W 4000
ms, 86 to 90 units per 250 ms, about 350 units a second; the plate crossed near 2.0 s, the run ended at y -4616): c2's watched
health 300 throughout with no StaggerPlayer, its record 1.0, its own ProcessTrapHit row 0 after two census windows, while both
seats' "fired here" lines rose (c2's own plate fired the wall) and c1's " (skipped)" row stayed 0 (c1's copy never reached the
figure). Leg 2, a sprint (W, then Left Alt in the next step: SprintStart at 509 ms, stamina falling, about 510 units a second,
ended at y -4520): the same, health 300 and 1.0, no row on either seat. With x-trap-hit v3.1, Eli's rule reads on two seats: a
trap's hit counts on the seat whose screen showed it, and a dodge on a player's own screen costs nothing anywhere. A claimed
scenario would take its end bounds from this run (the run ended past v2.1's estimate).
D-S3 stands read on every point: the firing (H-T2), the hit's owner (D-S2 B), the single-use record (DestructionStage, its
restart scenario), the trap bodies (the rocks' claim and rest), the relay's split, the spent trap's blank, the lamp by hand, the
dodge. Left before it merges whole: Eli's D-T1, D-T2 (its scenario rewrites follow the word) and D-T4 (the fix staged green).


Eli's answers and the heads that carry them (10:5x to 11:2x PST 2026-11-05 (18:5xZ to 19:2xZ 11-05); docs/research/
trap-slice-d-s3-2026-11-05.md's last paragraph holds the words). D-T3 A: playtest 47 includes traps, after the slice merges.
D-T1, every trap triggerable from every seat: fork ff9b804a widens the family by the census's rule (docs/research/
trap-prefix-census-2026-11-05.md section 4: the chain to TrapBase, TrapTriggerBase, TrapHitBase or HazardBase, or the script's own
"trap" name in any case; every script on the reference a trap class and its base no inventory object): 4,887 family references
against 3,622, the oil pools, oil lamps, explosive gas, bear traps, poison gas, rockfall dust, spike beds and Nordic platforms
joining, the TG02 and TGTQ04 quest subclasses and the 52 soul gem pickups staying the host's. D-T4 B, the world's damage scaled
to the difficulty (a trap's hit; a fall's is not raised above Adept, re-37335 (a) and UESP's difficulty page): c09b1dd5 leaves the engine's six fDiffMultHPToPC* in force (read once before this client's first write,
logged as "[verb:traps] world damage multipliers"; 0 for the player's own ragdoll removal window; worldDamageMult a lab
override; 0 without the DamageActor cut). At skymp5-client's pinned Legendary, Update.esm's fDiffMultHPToPCL is 3.0, so a wall
hit that cost 60.03 at 1.0 should cost about 180 (inferred, unread). ce298e0f, built ahead of D-T5 (which difficulty the world
plays at; Eli's), reads the pin from the client setting difficulty (default 5, upstream's). Open with Eli: D-T2 (the two
scenarios' legs A and B) and D-T5. Owed before the stage: the fresh review of bd0c8cf8..ce298e0f (ADR-064 amendment A) and the
three probes' reviews (x-trap-oilpool-guest, x-trap-lamp-guest, x-trap-hit-difficulty); pipeline 5479 builds ce298e0f.
Declared, HYPOTHESIS: a family trap's state that no record carries stays each seat's copy (a bear trap re-armed by one player's
press is armed on that seat alone).
