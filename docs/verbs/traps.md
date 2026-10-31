# Verb: traps

Drafted 02:4x PDT 2026-10-31 from docs/VERB.md (pile item 9 of docs/private/turbo-2-prework.md; M4's dungeon row:
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
| the door's open state | code (isOpen) | R0 as today for a player's activation; the puzzle door's open from the lever's report (above) |
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

- Where the logic lives: wire-rules activation.rs gains the linked-pair rule (the XAPR and XLKR tables fed from the
  REFR data) and the budget; PartOne relays a child's activation and opens the door on the lever's report; libespm
  keeps every XLKR (a list, with the keyword) instead of the last one.
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
- [ ] server logic + T0
- [ ] message + validator (same commit)
- [x] native hook + T1 (none)
- [ ] TS handler
- [ ] T2 green
- [ ] T3 scenario green, no HYPOTHESIS tags
- [ ] parity scenario green, or its later list reviewed with it (ADR-031)
- [ ] sequences and combinations green, every checklist item with its scenario (ADR-033)
- [ ] ledger and suppression registry updated
