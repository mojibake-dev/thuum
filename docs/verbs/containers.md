# Verb: containers

Written 00:3x PDT 2026-10-31 (pile item 7 of docs/private/turbo-2-prework.md; M4's "containers and loot" row) from a
code map of the fork at parity dc3ec679. It records memo D52's shared containers (fork m3-shared-containers dbfc8e82,
built 2026-10-28 without a verb doc) and carries the rest of the row as fork m4-containers-rest.

## Intent

Several players stand in one container at once and see each other's moves; a move in or out is taken from a player
at the container; a looted container refills when the game files say and a restart does not push that later; a
container nobody is in is shut, after a restart and after a player's disconnect; and the other players see the lid
move when one of them opens it.

Roadmap reference: skymp/ROADMAP.md "Containers" ("You should animate the opening of the container for everyone,
including sounds ... 2 or more players should be able to loot a container at the same time.")
Milestone: M4 (D52's half landed in M3)   Class: B

## Inventory (ADR-031: the action's consequences, before its rung)

The action is "a player opens a container, moves items, closes it"; the reference trace is owed
(lab/references/container-open.json); the record is the CONT (its item list and leveled lists; its open and close
sounds, not parsed yet).

| consequence | seen in | disposition |
| --- | --- | --- |
| the lid's Open animation and the open sound on the opener's game | engine | native (the opener's own activation) |
| the ContainerMenu with the container's items | engine | native on the opener; the inventory is the server's (OpenContainer carries it, R0) |
| the container's open state | code (SetOpen at the first open, the last close) | imposed: isOpen to every listener (D52: from the first occupant's open to the last's close) |
| the lid's Open and Close on the other players' games | engine (the Open and Close animation events) | imposed: the client plays them on the isOpen change for a CONT base (HYPOTHESIS until x-container-rest) |
| the open and close sounds on the other players' games | record (CONT SNAM, QNAM) | later: the record's sounds are not parsed; a later slice plays them through the snippet path |
| a put or a take | code | R0: the server moves the items between the records; R1: taken from a mover at the container (this train) |
| the other occupants' menus redraw under a move | engine | imposed: D52's inventory re-send to the other occupants (refreshContainerMenu, playtest 37's chest) |
| the refill of an emptied container after its reloot time | code (RequestReloot at an emptied CONT; the master's respawn flags unread) | R0: the record's moment honoured across a restart (this train); the refill adds the base list on top of what stands (a known shape, the master resets to base: a later read) |
| a container saved open with nobody in it | code | R0: shut at load (this train) |
| a disconnecting occupant | code | R0: released, the chest shut when it was the last (this train) |
| the "empty" label on an unopened container | engine | known limit (ROADMAP's "Incorrect empty label"): the inventory arrives at the open |

### Sequences and combinations (ADR-033)

| sequence or combination | probe or scenario | result |
| --- | --- | --- |
| two players in one chest, a take by one seen by the other (D52) | PartOne_ActivateTest "Two players in one container"; x-shared-chest | T0 green; T3 the live chest under chestRedraw reopen (playtest 37, finding 37) |
| a put from 900 units off with the menu open | T0 (this train); x-container-rest | |
| a restart with a reloot pending (the moment kept) | T0 (this train); x-container-rest's restart leg | |
| a restart with the chest saved open | T0 (this train); x-container-rest | |
| a disconnect of the one occupant, the other seat's lid | T0 (this train); x-container-rest | |
| the lid on the watcher at the open and the close | x-container-rest (the screenshots, the trace line) | |

## Authority

Rung: R0 for the container's inventory, open state and reloot moment; R1 for a player's put or take (the server
moves the items; the move is taken only from a player at the container, in its cell or world and within the
activation reach); R2 for nothing; R3 for the menus and the sounds today.
Why this rung and not the one above it: the inventory has no rung above R0; a move cannot be computed by the server
(the player's choice), so it is validated.
What the server validates (R1): the mover occupies the container (D52), stands in its cell or world
(E_CONTAINER_CELL) and within the activation reach (wire-rules activation.rs: 452 units plus the target's size,
E_CONTAINER_REACH), and holds the items it puts; a refusal resyncs both inventories to the mover (the engine moved the
item locally already).
Rate limit / bounds: the inventory messages' own (PutItem, TakeItem budgets).

## Engine surface

- CommonLibSSE-NG symbols: none (no hook).
- Address Library IDs: none.
- The server: ActionListener.cpp OnPutItem :2045-2073 and OnTakeItem :2075-2102 (the gate added before PutItem and
  TakeItem); MpObjectReference.cpp PutItem and TakeItem :685-724 (CheckInteractionAbility, IsContainerOccupant,
  ResyncAfterRefusedMove :733-744); the occupant set and its sinks (MpObjectReference.h:310-317, .cpp:93-169,
  :758-800; the CONT and corpse branch :1818-1846, kOccupationReach 512 :1826; the release at the second activation
  :1911-1916); RequestReloot :1323-1345 (the window it wrote: now plus GetRelootTime whatever the time asked),
  DoReloot :1347-1357, RelootContainer :1100-1108, EnsureBaseContainerAdded :2288-2357; ApplyChangeForm :1427-1447
  (the record's nextRelootDatetime re-asked for the time left, the open state copied as saved); the change form's
  isOpen, isHarvested, nextRelootDatetime (MpChangeForms.h:84-87); SetOpen :675-683 and its isOpen property to every
  listener; the disconnect (PartOne.cpp:723-763) touching no container.
- The client: modelApplyUtils.ts:13-14 applyModelIsOpen (SetOpen; a door's state), its callers formView.ts:671-674
  (every 133 ms for 0xff references and doors), remoteServer.ts:373 (CreateActor) and :925-926 (the property);
  Skyrim Platform's `open` and `close` events (EventHandler.h:516-517) unused; the engine's Open and Close animation
  events on a container's graph (PlayAnimation).
- libespm CONT.cpp reads EDID, FULL and the item list; its sounds and the master's respawn flags are not read.

## Observe (host or acting client sees the intent before the engine acts)

- Hook point: none new; the opener's activation and the menu's moves are the existing messages (Activate,
  OpenContainer, PutItem, TakeItem).
- SP filter: none.
- Data captured: as today.
- Side effects of hooking here: none.

## Impose (observers render the server's decision)

- Mechanism: the isOpen property (UpdateProperty, CreateActor) as before; the client plays the lid's Open or Close
  animation event on a CONT base when it changes (modelApplyUtils.ts).
- Visual without simulation achieved by: the animation event alone; no state change on the watcher's reference.
- Side effects: HYPOTHESIS (x-container-rest): the opener's own game hears the property too and plays Open on a lid
  already open, which the graph ignores; a chest whose base has no Open event (a sack, a barrel) plays nothing.

## Suppress (engine's own behavior blocked on non-hosts)

- What is suppressed: nothing new.
- How, release condition, side effects: none.

## Message contract

- Message name / numeric type: none new. PutItem and TakeItem as today; UpdateProperty isOpen as today.
- Direction, fields, validator rules: unchanged.
- Idempotency / ordering: unchanged.
- Contract doc updated: not needed (no wire change).

## Server

- Where the logic lives: ActionListener.cpp ContainerMoveWithinReach (the cell and the activation reach, the resync
  on a refusal, "[verb:containers] E_CONTAINER_REACH ..." and "E_CONTAINER_CELL ..."); MpObjectReference.cpp
  RequestReloot writes now plus the time asked (a restart's remaining time stays), ApplyChangeForm shuts a CONT saved
  open; the occupant set tells the actor (MpActor::MarkContainerOccupied, OccupiedContainers), and PartOne's
  disconnect task releases every container the player stood in (the chest shuts for the others when it was the last).
- DB fields / migration: none (isOpen and nextRelootDatetime exist; the load's reading changes for CONT).
- Restart behavior: a pending reloot fires at its recorded moment (or at once if it passed); a chest saved open comes
  back shut.
- Papyrus natives touched (ledger lines added): none.
- Kill switch: none (fixes).

## Client

- SP binding: none new.
- TS handler: modelApplyUtils.ts applyModelIsOpen plays Open or Close on a CONT base ("container <id> lid Open played
  for the server's isOpen" trace).
- Kill switch config key: none.

## Tests

- T0: unit/PartOne_ActivateTest.cpp, the Containers cases: a put from 900 units off refused and the mover resynced, the
  same put taken at the barrel, a take from afar refused; a reloot asked for 30 s keeps that moment in the record and a
  load keeps it (not the 1 s window); a container saved open loads shut; a disconnect releases the occupant and the
  other user hears isOpen false.
- T1: none.
- T2: the smoke session's container leg as today.
- T3 scenario id: lab/scenarios/b-container-rest.yaml (after the probe): c1 opens the lab's chest, c2's screenshot
  shows the lid open and its trace line reads "lid Open played"; c2 opens the same chest (two occupants), c1 walks 900
  units off with the menu open and takes an item: refused in the server log, c1's inventory resynced; c1 closes, c2
  closes, the lid shut; c1 opens and disconnects (relaunch until gone): the chest shut on c2 within a second; a server
  restart with a chest saved open: shut after the load; the reloot's moment across the restart read from the server's
  log. Probe x-container-rest by path first.
- Assertions that would fail if the verb silently regressed: a take from 900 units taken; a chest open after a restart
  with nobody in it; a chest open after its one occupant's disconnect; the reloot line a full window later than its
  record said after a restart.

## Dynamic plan (fill when any tag above is still HYPOTHESIS)

- Frida script: none. x-container-rest reads the lid on the watcher (screenshot and the trace line), the opener's own
  lid after the property (no visible flicker), and the Open on a barrel or sack (nothing played, no error).
- Breakpoint plan: none.
- Owner: agent.

## Status

- [ ] doc complete, inventory listed with a disposition per row, rung declared (the reference trace owed)
- [x] engine surface cited or delegated (the code map of 2026-10-31)
- [x] server logic + T0 (fork m4-containers-rest: the reach gate, the reloot moment, the shut at load, the disconnect's release; four Containers cases; the C++ T0 is the pipeline's)
- [x] message + validator (none: no wire change)
- [x] native hook + T1 (none)
- [x] TS handler (fork m4-containers-rest: the lid's Open and Close on the isOpen change)
- [ ] T2 green
- [ ] T3 scenario green, no HYPOTHESIS tags
- [ ] parity scenario green, or its later list reviewed with it (ADR-031)
- [ ] sequences and combinations green, every checklist item with its scenario (ADR-033)
- [x] ledger and suppression registry updated (none: no native, no suppression)

## Open questions

- The refill adds the base list on top of what the container holds (EnsureBaseContainerAdded), where the master
  resets a respawning container to its base and keeps a NoRespawn one: a read of the master's rule and of the
  REFR_NoRespawn flag (libespm RecordFlags.h:39, unread) before changing it; players' stored items are the stake.
- The open and close sounds for observers: the CONT's SNAM and QNAM are not parsed; the snippet path could play them
  at the lid's event.
- A partly looted container never reloots (RequestReloot at an emptied CONT alone); the master reloots on the cell's
  reset regardless. A design question for M4's dungeon pass.
