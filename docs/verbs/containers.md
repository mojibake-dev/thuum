# Verb: containers

Written 00:3x PDT 2026-10-31 (pile item 7 of docs/private/turbo-2-prework.md; M4's "containers and loot" row) from a
code map of the fork at parity 6dbabc7a. It records memo D52's shared containers (fork m3-shared-containers e3fa27a6,
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
| the lid's Open and Close on the other players' games | engine (the Open and Close animation events) | imposed: the client plays them on the isOpen change for a CONT base (CONFIRMED, x-container-rest v4 20261031-195055: the watcher's "lid Open played" within a second of each of the server's two opens, "lid Close played" at the shut by the disconnect and at the reconnect's closed creation; a second occupant's join changes no isOpen and plays nothing) |
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
The hold (ADR-067 decisions 1 and 6, 2026-11-03; fork m3-turbo3-sys2-container): R0. One seat holds a container at a time, a
chest's or a corpse's: the first activation adds the one occupant, a second player's activation while it is held is refused
E_CONTAINER_BUSY with a notification on its seat (the holder named when its name is at hand), the holder's close, its leaving reach
(the prune at the next open), its disconnect or the reference's disable frees it. The contents sync at open (the record to the
opener) and at close (the record to the cell's listeners when the set empties); nothing redraws an open menu, and no verb may ask
for it (decision 1 dropped the live view, not solved it). A move from a seat that does not hold the container is refused
E_CONTAINER_OCCUPANT and the mover resynced. There is no setting: exclusive is the one model (the containerSharing switch of
ADR-061 decision 3 is deleted). Not persisted: a hold is runtime state like a cell's host; isOpen stays its shadow in the record.

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
- Side effects: CONFIRMED (x-container-rest v4 20261031-195055: the opener's own "lid Open played" at D's open, 19:54:54.6 on c1 against the server's 56.5): the opener's own game hears the property too and plays Open on a lid
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
- The live view and its fallback (ADR-061, playtest 41): the server setting `containerSharing`, "shared" (the default:
  every player who opens a container is in it, memo D52) or "exclusive" (one occupant at a time: MpObjectReference's
  CONT branch refuses every other player's activation while an occupant holds it, "[verb:containers] E_CONTAINER_BUSY:
  <player> activates <container> held by <occupant>", and the refused seat hears Debug.Notification "Someone is using
  this"; the occupant's close, its leaving reach or its disconnect frees it). Fork m4-container-exclusive, head c2617764:
  the default is "shared" (Eli, the same evening, after a flip to exclusive and back: "dont worry about setting the
  container exclusivity. we're not even live"); "exclusive" is the switch for a live server; the live multi-party view
  is the backlog (ADR-061's outcome).

## Client

- SP binding: none new.
- TS handler: modelApplyUtils.ts applyModelIsOpen plays Open or Close on a CONT base ("container <id> lid Open played
  for the server's isOpen" trace). The live view (ADR-061): view/liveContainer.ts applyLiveContainer, one apply for a
  chest's record (remoteServer, a viewless game-file CONT) and a body's (formView, an actor's view) while this seat's
  ContainerMenu is open on the reference: the record by base counts (this seat's own transfer, echoed by the server,
  changes nothing and draws nothing, "the record matches the engine"), another occupant's change applied and then the
  engine's inventory-update redraw asked once per burst (possible under "shared" alone). The reopen (CloseMenu and the
  container asked again, b86da361) ping-ponged between two occupants and is REJECTED by Eli's rule: no menu is ever closed
  and reopened under a player to sync it (ADR-061's outcome). The in-place redraw left stale rows in playtests 37, 40 and
  41 and is the backlog's trace. Fork m4-turbo2-chest, the commit after b86da361.
- Kill switch config key: the server's `containerSharing` (above).

## Tests

- T0: unit/PartOne_ActivateTest.cpp, the Containers cases: a put from 900 units off refused and the mover resynced, the
  same put taken at the barrel, a take from afar refused; a reloot asked for 30 s keeps that moment in the record and a
  load keeps it (not the 1 s window); a container saved open loads shut; a disconnect releases the occupant and the
  other user hears isOpen false; the second player is refused and notified while the first is in it and admitted once the
  first leaves (ADR-067 decision 6; the shared case is gone with the switch); the close sends the record to the cell's
  listeners; a non-occupant's move is refused and resynced, no exception.
- The live view is DROPPED by ADR-067 decision 1 (2026-11-03), not solved: the paragraph below stays as the record of what was
  tried; no scenario may claim an open menu's redraw.
- T3 for the live view (ADR-061 decision 2, was BACKLOG since the reopen's failure): x-shared-chest-phantom v2 after lab-api's
  transfer step and server.inventory(<refr>): c1 opens, c2 joins; c2 stores a weapon and a food while c1's menu is open;
  c1 takes the weapon, c2 the food; the roles swapped; a body as well as a CONT; after every change each seat's engine
  inventory of the container equals the record, no "Source inventory doesn't have enough" or unauthorized equip in the
  server log, each seat's menu redrawn in place (never closed). The backlog's gate, with the Frida plan on
  ContainerMenu::ProcessMessage. The hold's T3: x-container-hold v1 by path (c2's E on a chest c1 has open: E_CONTAINER_BUSY
  in the server log, no OpenContainer handler line on c2, c2's menu closed, the notification in its screenshot; c1 closes, c2
  opens; the corpse leg on the server-only branch records whether c2's own engine opened a menu, E25; the lost closing
  activation recorded), then b-container-exclusive in its own commit; b-container-rest's claim 2 (two occupants) is rewritten
  to the refusal in its own commit under decision 6.
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

- Finding and fix (06:16 PST 2026-11-01, x-locks-open v2 20261101-140443; fork m4-container-open-poll 06771bf3 off parity 5534294c): the
  open handler (remoteServer.ts onOpenContainerMesage) polled Ui.isMenuOpen through Utility.wait, which the VM suspends in menu
  mode, so a wait begun before the menu opened resumed only at its close; the open was never seen and the occupant left by the
  give-up path at the 15 s deadline (late for a short open; the state since Skyrim Souls RE's unpaused menus joined the layer,
  which keep menu mode). Utility.waitMenuMode runs through a menu (the closing delay already used it); both polls now use it, so
  "waiting for 'ContainerMenu open' to be false" and "menu closed" are the lines a run should show, and the closing activation
  leaves at the close. Gate: b-container-rest and the containers scenarios; the probe read is those two lines on an open.

## Status

- [ ] doc complete, inventory listed with a disposition per row, rung declared (the reference trace owed)
- [x] engine surface cited or delegated (the code map of 2026-10-31)
- [x] server logic + T0 (fork m4-containers-rest: the reach gate, the reloot moment, the shut at load, the disconnect's release; four Containers cases; the C++ T0 is the pipeline's)
- [x] message + validator (none: no wire change)
- [x] native hook + T1 (none)
- [x] TS handler (fork m4-containers-rest: the lid's Open and Close on the isOpen change)
- [ ] T2 green
- [ ] T3 scenario green, no HYPOTHESIS tags (x-container-rest v4 20261031-195055 on 44d4c225: every leg green, the one red a count's
      premise, v5 7fbc6645 corrected; b-container-rest on thuum main 872e75e6, its first run at the train's gate)
- [ ] parity scenario green, or its later list reviewed with it (ADR-031)
- [ ] sequences and combinations green, every checklist item with its scenario (ADR-033)
- [x] ledger and suppression registry updated (none: no native, no suppression)

Play: BROKEN, playtest 41 (2026-11-02): "still broken in the EXACT same way" (LOG 15:33 item 7: both seats stop applying the
chest's changes about 14 s after the second joins, and a store turns into a use); ADR-061's reopen "works worse than before"
(16:36).

## Open questions

- The refill adds the base list on top of what the container holds (EnsureBaseContainerAdded), where the master
  resets a respawning container to its base and keeps a NoRespawn one: a read of the master's rule and of the
  REFR_NoRespawn flag (libespm RecordFlags.h:39, unread) before changing it; players' stored items are the stake.
- The open and close sounds for observers: the CONT's SNAM and QNAM are not parsed; the snippet path could play them
  at the lid's event.
- A partly looted container never reloots (RequestReloot at an emptied CONT alone); the master reloots on the cell's
  reset regardless. A design question for M4's dungeon pass.
