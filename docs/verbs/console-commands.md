# Verb: console-commands

## Intent

A player types the console commands it knows from single-player. A command
that changes the shared world is decided and applied by the server, with
the game's own output in the player's console; a command that only touches
the player's own view runs in its game; a command that would go around the
server is refused with a line saying so. Who may use which command follows a
staff rank kept with the player, as TES3MP does.

Roadmap reference: skymp ROADMAP.md "Console commands" ("Make a list of
popular console commands, implement them. They should be typed as in the
original game. Their output should also be the same. Implement a system of
permissions...")
Milestone: M1 (Eli, 2026-10-05)   Class: B

## Authority

Rung: per command, declared in the table below; three classes.
- R0, server-executed: the server checks the rank, applies the command to
  its own state, and the clients render the result through the verbs that
  already carry that state (inventory, position, actor values, time).
- R3, client-only: the camera, the HUD, help lookups. Nothing synced.
- Refused: a command whose effect only the server may make (a save or a load
  of the game, a local god mode or no-clip for a player without the rank).
Why not R1 for the R0 class: a console command is an intent with no
simulation behind it; the server can apply it directly.
Bounds: the rank per command; arguments by type (a form that exists, a
count within the inventory verb's bounds); rate: the console's own pace,
four at once and one a second after.

## Engine surface

- SkyMP today: skymp5-client consoleCommandsService.ts replaces the
  `execute` of four vanilla commands (AddItem, EquipItem, PlaceAtMe,
  Disable) and adds `mp` through Skyrim Platform's findConsoleCommand,
  sending each as ConsoleCommand (MsgType 12); the server runs them in
  ConsoleCommands.cpp, gated by EnsureAdmin (the actor's
  consoleCommandsAllowed flag, or enableConsoleCommandsForAll).
- The vanilla command table and its handlers: Skyrim Platform's
  findConsoleCommand (ConsoleApi.cpp) reaches the engine's console command
  list; which commands exist and their argument schemas come from it.
- HYPOTHESIS: a replaced command's `execute` returning false stops the
  engine's own handler for every command in the list (true for the four
  today).

## Observe (host or acting client sees the intent before the engine acts)

- Hook point: the replaced `execute` of each listed command; the client
  sends ConsoleCommand with the parsed arguments and the selected reference
  as its server id (localIdToRemoteId).

## Impose (observers render the server's decision)

- The server applies the command to its own state; the result reaches every
  client through the existing verbs. The caller gets a ConsoleOutput line
  (the game's own wording where it prints one) or the refusal's reason.

## Suppress (engine's own behavior blocked on non-hosts)

- What is suppressed: the engine's own handler of each R0 and refused
  command, in every client.
- How: Skyrim Platform's console command replacement (execute returns
  false).
- Release condition: none.

## Commands, first set

| Command | Class | Rank | Through |
| --- | --- | --- | --- |
| AddItem, RemoveItem, EquipItem | R0 | admin | inventory |
| PlaceAtMe, Disable, Enable | R0 | admin | references |
| COC, MoveTo, SetPos, SetAngle | R0 | moderator | position (a teleport the server makes; the map-markers verb then judges discoveries where the player really is) |
| Kill, Resurrect | R0 | moderator | death |
| SetAV, ModAV, ForceAV, SetLevel, AdvSkill | R0 | admin | actor-values verb |
| Set GameHour, Set TimeScale | R0 | admin | the server's clock (ADR-021) |
| TGM, TCL | R0 | admin | a server flag the damage and movement rules read |
| TFC, TM, FOV, Help | R3 | anyone | nothing |
| Save, Load, QSave, QLoad | refused | nobody | the server owns the world |

Ranks are TES3MP's: 0 player, 1 moderator, 2 admin, 3 owner, kept with the
player (TES3MP CoreScripts keeps `staffRank` in each player's record:
[TES3MP/CoreScripts](https://github.com/TES3MP/CoreScripts)). The lab keeps
enableConsoleCommandsForAll, every player an owner.

## Message contract

- ConsoleCommand (MsgType 12, client to server) as today, arguments typed;
  a new ConsoleOutput (server to client): the line to print, and whether it
  is a refusal. Validator: a known command name, argument count and types
  per the command's schema, the rate above.

## Server

- Where the logic lives: the command table and the rank checks in Rust
  (wire-rules `console`: name, rank, argument schema, class); the C++ core
  applies an R0 command through the same paths its verbs use.
- DB fields / migration: `staffRank` in the player's change form (absent in
  older records: 0, or the consoleCommandsAllowed flag read as admin).
- Restart behavior: ranks survive in the change form.
- Papyrus natives touched: none.

## Client

- SP binding: findConsoleCommand replacement, as today, for every listed
  command.
- TS handler: consoleCommandsService.ts grows the table; ConsoleOutput
  prints through printConsole.
- Kill switch config key: none; the table is the server's.

## Tests

- T0: the rule's table (each class and rank); each R0 command's effect on
  the server's state; a refusal's output.
- T2: a command above the caller's rank changes nothing (difftest).
- T3 scenario id: lab/scenarios/a-console.yaml: c1 (owner) types COC to a
  cell and AddItem; the server moves it and adds the item, c2 sees c1 there;
  c1 types Save: refused, the console says so; a player of rank 0 types
  AddItem: refused.

## Dynamic plan (fill when any tag above is still HYPOTHESIS)

- A lab probe replaces one more command (COC) and checks the engine's own
  handler never ran (the player did not move before the server's teleport).

## Status

- [ ] doc complete, rung declared (the table and the ranks for Eli's review)
- [ ] engine surface cited or delegated
- [ ] server logic + T0
- [ ] message + validator (same commit)
- [ ] native hook + T1
- [ ] TS handler
- [ ] T2 green
- [ ] T3 scenario green, no HYPOTHESIS tags
- [ ] ledger and suppression registry updated
