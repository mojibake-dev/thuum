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

- Skyrim Platform's console replacement (fork
  skyrim-platform/src/platform_se/skyrim_platform/ConsoleApi.cpp):
  findConsoleCommand looks a name up in the console command table, then in
  the script command table, by long or short name, case aside (:27-32,
  :378-392), and points the engine's handler at its own dispatcher
  (FindCommand, :350-375, :369). The dispatcher calls the JS `execute` with
  the selected reference's form id, or 0, then each typed parameter by type
  (GetTypedArg, :246-277: integers and floats as numbers, references and
  base forms as hex form ids, actor values, axes and characters as strings,
  anything else through an editor-id lookup). The engine's own handler runs
  only when `execute` returns true (:328-333, :344-346), for every replaced
  command alike. A parameter type it cannot convert throws before `execute`
  runs, and then neither runs (:315-321).
- A second lookup of a name resets its entry to a default `execute` that
  returns true, so the game's own handler runs again (FindCommand :361,
  FillCmdInfo :76-92). Only the client's service looks up a routed command;
  the lab driver never calls findConsoleCommand.
- SkyMP before this verb: consoleCommandsService.ts replaced AddItem,
  EquipItem, PlaceAtMe, Disable and its own `mp`, sending ConsoleCommand
  (MsgType 12); ConsoleCommands.cpp ran them behind EnsureAdmin (the
  actor's consoleCommandsAllowed flag, or enableConsoleCommandsForAll) and
  printed nothing back but the client's own "sent".
- HYPOTHESIS: the engine's names for the table's rows (the long and short
  names below come from the console's usual spellings, not from the
  engine). The client logs every name findConsoleCommand does not find; a
  lab run that types each routed command and sees the server's line settles
  each row.
- HYPOTHESIS: the console's `set <global> to <value>` is compiled as a
  script statement, not a console function, so findConsoleCommand("set")
  finds nothing and the game still runs it locally; the server's clock sync
  (ADR-021) then overwrites GameHour and TimeScale. Settled by the same run.

## Observe (host or acting client sees the intent before the engine acts)

- Hook point: the replaced `execute` of each routed command. A served
  command sends its arguments converted per its schema (the selected
  reference as its server id through localIdToRemoteId; a float with a
  fraction as its text, since the wire's console argument is an integer or
  a string). Every other routed command sends its name alone.

## Impose (observers render the server's decision)

- The server applies a served command to its own state; the result reaches
  every client through the existing verbs (inventory, references, actor
  values). The caller gets one ConsoleOutput line for every command it
  sends: "<command> done", the refusal's reason, or "Failed: <why>".
- HYPOTHESIS: the game's own console prints nothing when these commands
  succeed (an item added shows in the HUD through the inventory verb), so
  "<command> done" is ours, not the game's. Whether the line should then be
  empty is a T4 call.

## Suppress (engine's own behavior blocked on non-hosts)

- What is suppressed: the engine's own handler of every routed command, in
  every client: the served ones, the ones the server does not run yet, and
  the refused ones.
- How: Skyrim Platform's replacement, `execute` returning false
  (ConsoleApi.cpp:344-346).
- Release condition: none.

## Commands, first set

The server's table is wire-rules `console::TABLE`; the client routes the
same names (consoleCommandsService.ts). A name the server does not know is
answered "Unknown command".

| Command (short) | Class | Rank | Server runs it | Through |
| --- | --- | --- | --- | --- |
| AddItem, EquipItem | R0 | admin | yes | inventory |
| RemoveItem | R0 | admin | yes | inventory |
| PlaceAtMe, Disable | R0 | admin | yes | references |
| Enable | R0 | admin | yes | references (as Disable: what the server made, and actors) |
| mp (SkyMP's own) | R0 | admin | yes | references |
| MoveTo, SetPos, SetAngle | R0 | moderator | yes | position: an actor through the server's teleport, any other reference through the Papyrus natives |
| CenterOnCell (COC) | R0 | moderator | not yet | position (a teleport the server makes; the map-markers verb then judges discoveries where the player really is) |
| Kill, Resurrect | R0 | moderator | yes | death: MpActor::Kill, and the respawn without its teleport |
| SetActorValue (SetAV), ModActorValue (ModAV), ForceActorValue (ForceAV) | R0 | admin | yes | actor-values verb: the server's Papyrus natives, R0 on a player |
| SetLevel, AdvancePCSkill (AdvSkill) | R0 | admin | not yet | actor-values verb |
| Set (a global) | R0 | admin | not yet | the server's clock (ADR-021); other globals wait for the verb that needs one |
| ToggleImmortalMode (TIM), ToggleGodMode (TGM), ToggleCollision (TCL) | R0 | admin | not yet | a server flag the damage and movement rules read |
| ToggleFreeCamera (TFC), ToggleMenus (TM) | R3 | anyone | in the game | nothing; never sent |
| Save, Load, SaveGame, LoadGame | refused | nobody | never | the server owns the world |

Ranks are TES3MP's: 0 player, 1 moderator, 2 admin, 3 owner, kept with the
player (TES3MP CoreScripts keeps `staffRank` in each player's record:
[TES3MP/CoreScripts](https://github.com/TES3MP/CoreScripts)). The lab keeps
enableConsoleCommandsForAll, every player an owner.

## Message contract

- ConsoleCommand (MsgType 12, client to server) as before: the name and up
  to 32 arguments, each an integer or a string of at most 256 bytes.
  Validator (wire-validate): the console budget, four at once and one a
  second after. The name, the caller's rank and the arguments are the
  server's decision, so every command that passes the budget is answered.
- ConsoleOutput (MsgType 41, server to client, new; wire schema 10, wire id
  49, text capped at 1024 bytes): the line to print and whether the command
  was refused. Fixtures 41-ConsoleOutput-0 and -1.

## Server

- The table and the decision live in Rust: wire-rules `console` (Rank,
  Class, Command, TABLE, `decide(name, rank)`, `refusal_line`), reached
  from C++ through wire-bridge `console_decide` and
  `console_refusal_line`. ConsoleCommands::Execute asks before anything
  runs, then applies a served command through the paths its verb uses:
  AddItem, EquipItem, PlaceAtMe, Disable and mp as SkyMP ran them; SetAV,
  ModAV and ForceAV through PapyrusActor's SetActorValue, ModActorValue and
  ForceActorValue (docs/verbs/actor-values.md); RemoveItem, Enable, SetPos,
  SetAngle and MoveTo through PapyrusObjectReference's natives, except that
  an actor moves and turns by the server's teleport (skymp5-client turns a
  teleport's degrees into the engine's radians, remoteServer.ts); Kill and
  Resurrect through MpActor::Kill and MpActor::Respawn without its
  teleport, each refused on an actor already in the state it makes. A typed value that is not a
  finite number fails with one line and changes nothing; any other
  exception becomes "Failed: <what>".
- DB fields / migration: `staffRank` in the player's change form, written
  only when set. Absent in older records: consoleCommandsAllowed reads as
  admin, anything else as player. No migration; the field is optional.
- Restart behavior: ranks survive in the change form (T0 round trip).
- Papyrus natives touched: none new; the three actor value natives are
  called, not changed.

## Client

- SP binding: findConsoleCommand replacement, as before, for every routed
  command; one lookup per engine command.
- TS handler: consoleCommandsService.ts: served commands per their argument
  schema (additem, equipitem, placeatme, disable, mp, setav, modav,
  forceav); the rest by name alone; ConsoleOutput prints through
  printConsole in place of "sent".
- Kill switch config key: none; the table is the server's.

## Tests

- T0: wire-rules console (names long and short, ranks, refusals, not yet
  served, rank numbers, every name unique); wire-validate (the budget);
  unit/ConsoleCommandTest.cpp (a rank too low changes nothing and says so;
  an admin's AddItem lands and answers; Save refused, COC not yet,
  an unknown name; the rank through the change form; SetAV and ModAV with a
  fraction through the natives; "lots", "nan", "inf" and "12abc" refused
  with one line; RemoveItem, SetPos and SetAngle on one axis, a bad axis
  refused, MoveTo, Kill and Resurrect with their refusals, Enable after
  Disable).
- T2: a command above the caller's rank changes nothing (difftest session
  console-ranks: the C++ core and the Rust edge agree on the line and on
  the unchanged state).
- T3 scenario id: lab/scenarios/a-console.yaml: c1 types `player.additem`
  for an item and `player.setav marksman 40` in its console; the server's
  record has both and c1's console printed both lines; c1 types `save x`:
  refused, nothing saved; with the server's ranks on (lab setting off for
  the run), c2 at rank 0 types AddItem: refused, its inventory unchanged.

## Dynamic plan (fill when any tag above is still HYPOTHESIS)

- Typing: the lab driver opens the console with the grave key and types
  through SKSE's Input.TapKey with DirectInput scan codes (dinput.h DIK_*:
  [Microsoft, DirectInput keyboard device constants](https://learn.microsoft.com/en-us/previous-versions/windows/desktop/ee418641(v=vs.85)));
  whether the console's text field takes injected keys is the first
  observation (the console's text after typing, read back through the
  driver's UI read, or a screenshot).
- Names: for each routed name, type it with its usual arguments and expect
  the server's log line `ConsoleCommands: <id> ran '<name>'` and the
  ConsoleOutput line in c1.log; a name that never reaches the server is a
  wrong spelling or a parameter type Skyrim Platform cannot convert, and
  the client's log says which.
- Set: type `set gamehour to 3` and read GameHour before and after the
  server's next clock sync.

## Status

On fork branch m1-console, stacked on m1-light-plugins by merge: the first
slice (3ef05197, 57b7cc04: the table, ConsoleOutput, the ranks, the actor
value commands, the routing, the rate) and the second (1d9793d2:
RemoveItem, Enable, Kill, Resurrect, SetPos, SetAngle, MoveTo). Left:
COC, SetLevel, AdvSkill, the god-mode toggles, Set on a global.

- [ ] doc complete, rung declared (the table and the ranks for Eli's review)
- [x] engine surface cited or delegated (Skyrim Platform's source; the
      engine's names are a lab measurement, tagged above)
- [x] server logic + T0 (the table, the decision, the three actor value
      commands; COC and the rest of "not yet" are the next slice)
- [x] message + validator (same commit): ConsoleOutput 3ef05197, the
      console budget 57b7cc04
- [ ] native hook + T1 (no native hook: Skyrim Platform's replacement)
- [x] TS handler
- [ ] T2 green
- [ ] T3 scenario green, no HYPOTHESIS tags
- [ ] ledger and suppression registry updated
