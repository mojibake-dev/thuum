# Verb: traps

Drafted 00:4x PDT 2026-10-31 from docs/VERB.md (pile item 9 of docs/private/turbo-2-prework.md; M4's dungeon row:
traps, pressure plates, linked refs, puzzle pillars, toward the exit scenario d-bleak-falls). From a code map of the
fork at parity dc3ec679. Nothing of it is built; the prework is the read, x-bleak-traps.

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
| the plate activates its children (XAPR, the delay): the blade's swing, the spears | engine (every game runs the vanilla script of the loaded cell) | imposed: the host's game fires it (its engine's own parent link) and reports the self-activation (today: noted alone, ActionListener.cpp:1938-1963); the server runs the children through its own XAPR table (ActivateChilds :1928-1959) and tells the other games to play the child's activation (R2 recorded, the host's engine the oracle) |
| a trap's damage to a player | engine | native on the hit player's game, reported through its own ChangeValues (taken as reported today, :4154-4221; a hazard bound later) |
| a trap's kill of an NPC | engine | R2 recorded: ADR-048's hazard death with "an activation beside the body" (:3488-3496) |
| a pillar's turn (an ACTI's script PlayAnimation on itself) | engine | imposed: the server's Papyrus has no script, so the turn is the host's report of the pillar's state (its animation name, lastAnimation today, remoteServer.ts:386-399 "pillars in bleakfalls are not reliable") |
| the lever's check of the pillars and its activation of the linked door | engine (defaultPillarPuzzleLever) | imposed: the lever's script runs on the host's game; its door activation is an engine-internal activation (caster the lever) the client never sends (activationService.ts:47-76 sends a non-player caster only when caster equals target), so the server never opens the door for the other seat today: the fix is the host reporting the linked activation (caster lever, target door) and the server opening the door (SetOpen, R0 by the host's word) |
| the door's open state | code (isOpen) for a DOOR; the puzzle portcullis is an ACTI (NorPortcullisLarge01 0x3e726, lab/esm.py 01:58 PST 2026-11-01) whose rise is its script's animation | a DOOR's isOpen as today from the host's linked report through Activate's own path; the portcullis has no server state, each engine's script plays it on the relay (fork m4-traps 333a1cdc); across a restart it stands as the engines reload it (a known limit for d-bleak-falls' restart leg: pull the lever after the restart, or restart before the door) |
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
- Contract doc updated: docs/WIRE.md with the build.

## Server

- Where the logic lives (01:43 PST 2026-11-01, fork m4-traps 702567ba, the server half): ActionListener::OnActivate sends a caster
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
- Server, ADR-059 decision 2's first two pieces (fork m4-traps dc881a11, 05:58 PST 2026-11-01; T0 TrapRelayTest's puzzle room case):
  MpObjectReference::Init reads a reference's VMAD and, for defaultPillarPuzzleLever, puts its refActOn* and puzzleDoorActivator
  object properties into activationChildsByActivationParent from the parent's side (delay 0), so the puzzle lever's darts and
  marker are links the relay knows; and OnLinkedActivation takes the caster by id with the form optional, so a STAT marker the
  loader skips (0x3e728, named by the portcullis's XAPR) is a caster the relay accepts by id, with no server-side activation
  through it. A never-loaded TARGET (the lever activating the marker) stays E_TRAP_NO_REF by design: its consequence arrives as
  the marker's own linked activation of the portcullis. Probe v4 re-stamped 343f06bc with that expectation.
- x-bleak-traps v4 6fc6748f (05:49 PST 2026-11-01; ADR-059 slice 1): the two blocks lifted for Bleak Falls Temple's pieces, the scripts admitted
  by name on the layer branch layer-world-scripts 20877978 (lab/layer/papyrus-admitted.tsv's named rows, papyrus-map.py's fourth
  column, main afa69250) and the engine's activation kept on their bases by the client's activationUnblockedBases (fork m4-traps
  20b1da65, the relaunch step's json write). Reads A to E in the probe's header: the plate's own fire and the wall's linked
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

## Status

- [ ] doc complete, inventory listed with a disposition per row, rung declared (the reference trace owed)
- [x] engine surface cited or delegated (the code map of 2026-10-31)
- [x] server logic + T0 (fork m4-traps 16d29f6c: OnLinkedActivation, the host's linked report, the relay, the budget; dc881a11: links from script properties, the caster by id; TrapRelayTest three cases)
- [x] message + validator (same commit; 702567ba, RelayedActivation MsgType 70, SCHEMA_VERSION 28)
- [x] native hook + T1 (none)
- [x] TS handler, first cut (relayedActivationService.ts plays the relay, activationService.ts sends a hosted cell's non-player activations, objectReferenceEx.ts keeps the engine's activation on activationUnblockedBases; 20b1da65, tsc green); its hosted-cell shape is ADR-059 decision 1's platform change
- [ ] T2 green
- [ ] T3 scenario green, no HYPOTHESIS tags
- [ ] parity scenario green, or its later list reviewed with it (ADR-031)
- [ ] sequences and combinations green, every checklist item with its scenario (ADR-033)
- [x] ledger and suppression registry updated (no new native; the suppression rows are the inventory's)
