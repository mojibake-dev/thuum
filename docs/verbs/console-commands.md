# Verb: console-commands

## Intent

A player types the console commands it knows from single-player. A command
that changes the shared world is decided and applied by the server, with
the game's own output in the player's console; a command that only touches
the player's own view runs in its game; a command that would go around the
server is refused with a line saying so. Who may use which command follows a
staff rank kept with the player, as TES3MP does, and a player names another
by its number, as TES3MP's own player commands do.

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
- R1, CenterOnCell (COC) alone: the caller's own game computes where it
  lands (the engine's own spot in the cell) and the server validates it:
  the cell the server named, once, within a minute (wire-rules movement's
  permitted jump).
- ToggleCollision (TCL, M1.1, Eli 2026-10-09): the server decides who may
  (R0, an admin's) and the caller's own game carries it out; the collision
  state is that game's alone, client-local and never synced (R3 for the
  state). Nothing of it is validated because the server models no
  collision for anyone; the movement rule bounds every move's speed as
  before, so a no-clip player moves no faster than any other.
Why not R1 for the R0 class: a console command is an intent with no
simulation behind it; the server can apply it directly. Why not R0 for COC:
the spot is the engine's own choice (markers, statics, the land's height
outside; ghidra/notes/coc-1-7-104.md), which the server would have to
reimplement, while the destination is what needs validating (CLAUDE.md: we
reimplement only what needs validation).
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
- The engine's names (thuum lab, 2026-10-08): every routed name is a
  console or script function the game knows except `set`
  (x-console2-probe 20261008-120751: the client's startup log names `set`
  alone as not found). CONFIRMED. `set <global> to <value>` is compiled
  as a script statement, so the game still runs it locally, and the
  server's clock wins: CONFIRMED (x-set-probe 20261008-224857: two
  seconds after `set gamehour to 3` c1's GameHour read 8.86, on the
  server's clock, and 65 s after, 9.218 against the server's 9.231;
  skymp5-client's TimeService writes the hour from the server's clock).
- Typed in the console (x-console-probe 20261008-120316, lab-driver's
  console step): `player.additem f 7` (the server gave seven gold, c1's
  game held 140), `player.setav marksman 40` (c1's Marksman 40), `player
  .setpos x 100` and `player.setangle z 90` (the server's teleport), each
  answered "<command> done"; `coc riverwood` answered "The server does not
  run this command yet" (before COC was served). CONFIRMED. Two of Skyrim Platform's own console
  bugs showed and are fixed on the branch: a command typed without
  parameters (tgm, tcl, player.kill, player.resurrect) ran neither the
  replacement nor the game's handler, its name parsed as empty
  (ConsoleApi.cpp ParseCommand, 4b2ec408); and a parameter it could not
  convert (save's file name) threw before the replacement ran, so the
  refused save printed nothing (5c68aa5a). The rerun with the fixed client
  settles both.

- COC (served since fork 0708f531): the game's own console path and its
  spot are mapped in ghidra/notes/coc-1-7-104.md (static, not relied on).
  The server has the caller's game run the Papyrus global native
  Debug.CenterOnCell(String) (Skyrim Platform declares it,
  skyrim-platform/src/platform_se/codegen/convert-files/skyrimPlatform.ts:2441;
  SP3 registers a static function under its Papyrus name and the camelCase
  one, assets/sp3.js:186-195, so a snippet's `Debug.CenterOnCell` resolves).
  The native moves the player as the console's COC does, and an exterior
  landing lies in the named cell's square. CONFIRMED (x-coc-probe
  20261008-190207 and -191416, 1.6.1170): `coc riverwood` landed at (17225,
  -47204, -128), inside Riverwood's square (4, -12), 2.8 to 3.6 s after the
  command and at the same spot in both runs; `coc
  riverwoodsleepinggiantinn` landed in 0x133c6 at (-265, -341, 0) 1.0 s
  after; the screenshots show Riverwood's bridge and the inn's fire pit.
  Skyrim Platform passes the typed cell name by the engine's parameter type
  (GetTypedArg, ConsoleApi.cpp:256-287): as text, or, through its editor-ID
  lookup, as the cell's form id. The server takes either; the game sent the
  text for both names, exterior and interior (the server's "named by text"
  in both runs). CONFIRMED. The form-id path is T0's alone.
- SkyMP's `mp` has no engine command of its own: consoleCommandsService.ts
  replaces the engine's " ConfigureUM" (or `test`) and names it mp
  (:66-73), so Skyrim Platform converts mp's words by that command's
  parameter table. A word past the end
  of that table was converted against whatever followed it in memory
  (ConsoleApi.cpp ConsoleComand_Execute, `paramInfo[i]` for every typed
  word); since fork 89db8732 such a word goes to the replacement as its
  text (`i < numArgs`). Found by reading, before the `mp` player commands
  were typed in a lab; `mp tp 2` and `mp tpto 2` reach the server with
  their number on the fixed client (x-mp-probe 20261009-062818).
- TCL (served since fork 90294654): Skyrim Platform declares the Papyrus
  global native Debug.toggleCollisions() (codegen
  convert-files/skyrimPlatform.ts:2465, beside setGodMode at :2457), and
  the server sends it as COC's Debug.CenterOnCell (a snippet with self 0,
  no arguments). The client already routes `tcl` by name (its
  serverOnlyCommands), so no client change. HYPOTHESIS until the lab: that
  it toggles the player's collision as the console's own TCL does,
  observed as the player walking off the spawn strip's east edge without
  falling, and falling once it is typed again.

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
- COC: the server permits the caller's actor one jump into the cell and
  sends the caller's game a Debug.CenterOnCell snippet with the cell's
  editor id; the game goes there and reports its movement from there, and
  the server takes that report as the jump (the record moves into the
  cell) and relays it as any movement. Other clients see the player leave
  and arrive through the movement verb.
- "<command> done" is ours; the game's own console may print nothing on
  success (not measured). Eli's T4 call in playtest eleven (2026-10-08):
  keep the lines ("behavior seems fine if less immediate than the OG
  console command"; the server's answer takes a round trip).
- MoveTo, playtest eleven: `player.moveto <id>` on the other player's
  figure, after a kill and a resurrect of it, answered the game's own
  "invalid object reference" and reached nothing of ours. x-moveto-probe
  20261008-225615: `player.moveto b3184` (the hunters' camp's bedroll)
  and `player.moveto` with the figure's id as the game had it then both
  moved c1 there through the server; `moveto player` with the figure
  selected failed on the server ("Form with id 0x0 doesn't exist": Skyrim
  Platform reads the word player as a hex id, 0), fixed in 738be708 (the
  destination reads 0 as the caller, as the target does). A kill and a
  resurrect rebuild the figure under a new id, so a selection made before
  them names a deleted reference: CONFIRMED (x-moveto2-probe
  20261008-234317: c2's figure 0xff0008e3 before, 0xff0008e7 after; then
  `player.moveto` with the new id moved c1 to c2, and `prid` with `moveto
  player` brought c2 to c1 on 738be708). A player clicks the other again
  after a resurrect; keeping the figure's reference across a respawn is
  SkyMP's figure lifecycle, not this verb's.
- MoveTo, playtest twelve (2026-10-08, parity 137f3fb5): within one cell
  the moved player went "a little" or not at all, though the console
  printed the server's line; after a COC to Whiterun the other player could
  not be reached. Two causes. The movement rule undid the server's own
  teleport (the reports the moved game sent before it; docs/verbs/
  movement-speed.md, arrivals). And a typed id is the caller's game's own
  figure: each game numbers the figures it builds itself (Eli: test 2 was
  ff000d32 from test 1's console, test 1 ff000daf from test 2's, each
  itself 14), and a player outside the caller's loaded cells has no figure
  there at all, so nothing the caller can type names it.
- Player numbers (Eli, 2026-10-08, adopting TES3MP's): `mp list` answers
  one line per player online, `<number> <name> (<form id>) in <cell>`, the
  caller's own marked "(you)"; `mp tp <number>` has the server bring that
  player to the caller and `mp tpto <number>` take the caller to that
  player, the server's teleport (MpActor::Teleport) wherever the two are,
  no figure needed; the brought player's console prints "<caller> brought
  you to them". The number is the player's profile id, the same at every
  login (TES3MP CoreScripts scripts/commandHandler.lua /list, /teleport
  and /teleportto, scripts/logicHandler.lua TeleportToPlayer:
  [TES3MP/CoreScripts](https://github.com/TES3MP/CoreScripts)).
  CONFIRMED (x-mp-probe 20261009-062818: `mp list` named both; `mp tpto
  2` took c1 about 25700 units across Tamriel to c2, landing 43 units off
  it; `mp tp 2` brought c2 back to c1, 49 units off; a-console's runs
  below: into and out of the inn both ways).

## Suppress (engine's own behavior blocked on non-hosts)

- What is suppressed: the engine's own handler of every routed command, in
  every client: the served ones, the ones the server does not run yet, and
  the refused ones. A typed COC never runs the console's handler; an
  admin's game moves only through the server's snippet.
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
| mp list (SkyMP's mp, TES3MP's /list) | R0 | player | yes | the server's players online, by number |
| mp tp, mp tpto (TES3MP's /teleport, /teleportto) | R0 | moderator | yes | position: the server's teleport, wherever the two players are |
| mp, any other (SkyMP's own: mp disable) | R0 | admin | yes | references |
| MoveTo, SetPos, SetAngle | R0 | moderator | yes | position: an actor through the server's teleport, any other reference through the Papyrus natives |
| CenterOnCell (COC) | R1 | admin (Eli, 2026-10-08) | yes | position: the caller's own game (Debug.CenterOnCell by SpSnippet), the server's movement rule taking that one jump into the named cell; the map-markers verb then judges discoveries where the player really is |
| Kill, Resurrect | R0 | moderator | yes | death: MpActor::Kill, and the respawn without its teleport |
| SetActorValue (SetAV), ModActorValue (ModAV), ForceActorValue (ForceAV) | R0 | admin | yes | actor-values verb: the server's Papyrus natives, R0 on a player |
| SetLevel, AdvancePCSkill (AdvSkill) | R0 | admin | M5, with leveling (Eli, 2026-10-08) | actor-values verb |
| Set (a global) | R0 | admin | not yet | the server's clock (ADR-021); other globals wait for the verb that needs one |
| ToggleCollision (TCL) | R0 who, R3 the state | admin | yes (M1.1) | the caller's own game toggles its collision (Debug.ToggleCollisions by SpSnippet, as COC); the server models no collision, the movement rule bounds speed as ever |
| ToggleImmortalMode (TIM), ToggleGodMode (TGM) | R0 | admin | M2 (Eli, 2026-10-09) | a god or immortal flag the server's damage and death rules read, with M2's damage and effects authority; the game's own god mode for what it computes locally (Debug.setGodMode, skyrimPlatform.ts:2457); TIM has no Papyrus counterpart |
| ToggleFreeCamera (TFC), ToggleMenus (TM) | R3 | anyone | in the game | nothing; never sent |
| Save, Load, SaveGame, LoadGame | refused | nobody | never | the server owns the world |

Ranks are TES3MP's: 0 player, 1 moderator, 2 admin, 3 owner, kept with the
player (TES3MP CoreScripts keeps `staffRank` in each player's record:
[TES3MP/CoreScripts](https://github.com/TES3MP/CoreScripts)). The gamemode
names its staff through the server's property `staffRank` (mp.set; the lab
gamemode's labCommand staff-rank). A recorded rank wins; a player without
one is an owner when the server's enableConsoleCommandsForAll is on (the
lab keeps it on), else consoleCommandsAllowed reads as admin and anything
else as player.

## Message contract

- ConsoleCommand (MsgType 12, client to server) as before: the name and up
  to 32 arguments, each an integer or a string of at most 256 bytes.
  Validator (wire-validate): the console budget, four at once and one a
  second after. The name, the caller's rank and the arguments are the
  server's decision, so every command that passes the budget is answered.
- ConsoleOutput (MsgType 41, server to client, new; wire schema 10, wire id
  49, text capped at 1024 bytes): the line to print and whether the command
  was refused. Fixtures 41-ConsoleOutput-0 and -1.
- COC adds no message: the cell travels as ConsoleCommand's second
  argument (a string, or an integer form id), the server's order as the
  existing SpSnippet (class Debug, function CenterOnCell, self 0, one
  string), and the landing as the existing UpdateMovement.

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
- TCL (ExecuteToggleCollision, fork 90294654): an admin's tcl, by either
  name, sends the caller's game Debug.ToggleCollisions and answers "tcl
  done"; the server keeps no state of it.
- COC (ExecuteCenterOnCell): the cell by its editor id, case aside, over
  the server's load order (the last file that has a cell of that name), or
  by the form id Skyrim Platform found for it; a name or id no CELL has
  fails ("no cell named <name>"). An interior cell is permitted as itself,
  an exterior one as its worldspace and grid square (XCLC, libespm
  CELL::GetGrid). PartOne::PermitJump stores the permit in the movement
  rule (wire-rules movement: Landing, JumpCheck, JUMP_WAIT_MS 60 s, through
  wire-bridge MovementBudgets). MovementValidation asks the rule whenever
  its bounds refuse a player's move (another cell, a jump of 4096 units or
  more, or a ground budget overrun): the permitted landing passes once (an
  interior: that cell; an exterior: that worldspace, within a square of the
  cell either way); while the permit waits any other refused move is
  dropped without the snap back, a guard for a report from the loading
  screen (skymp5-client reports cell 0 when the player has neither a
  worldspace nor a cell, objectReferenceEx.ts getWorldOrCell); the probe
  saw none, the first report after each COC being its landing. Without a
  permit the snap back stands. ActionListener::OnUpdateMovement
  then moves the record into the new cell (SetCellOrWorldObsolete, then
  SetPos attaches it to that cell's grid), as MpActor::Teleport does.
- mp's player commands (ExecuteMp, fork ec92fcd2): Execute judges `mp
  <word>` by its own table row when the table has one (`mp list`, `mp
  tp`, `mp tpto`) and as `mp` otherwise. `mp list` walks the users online
  (ServerState::ActorByUser) in their order. `mp tp` and `mp tpto` find
  the number among the profiles (WorldState::GetActorsByProfileId) and
  want that actor online (ServerState::UserByActor), else "no player <n>
  online"; a caller's own number fails ("that number is yours"). The moved
  actor takes the other's place, cell or worldspace, position and angle,
  through MpActor::Teleport, so the movement rule's arrival applies.
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
  forceav, the second slice's seven, coc as the selected reference and the
  cell); the rest by name alone; ConsoleOutput prints through printConsole
  in place of "sent". The server's Debug.CenterOnCell runs through
  spSnippetService.ts's static path (a snippet with self 0).
- Kill switch config key: none; the table is the server's.

## Tests

- T0: wire-rules console (names long and short, ranks, refusals, not yet
  served, rank numbers, every name unique, COC an admin's); wire-rules
  movement (a permitted jump lands once in its cell, an exterior landing
  within a square of its cell, a permit waits a minute and the last one
  counts); wire-bridge (the permit through the bridge); wire-validate (the
  budget); unit/ConsoleCommandTest.cpp (a rank too low changes nothing and
  says so; an admin's AddItem lands and answers; Save refused, SetLevel not
  yet, an unknown name; COC: a moderator refused, a name or an id no cell
  has refused, Riverwood by its name and the inn by its form id each sent
  as the snippet, the loading screen's report and a far one dropped
  without a snap back, the landing taken once and the next jump sent back,
  the record moved into the interior; the rank through the change form; SetAV and ModAV with a
  fraction through the natives; "lots", "nan", "inf" and "12abc" refused
  with one line; RemoveItem, SetPos and SetAngle on one axis, a bad axis
  refused, MoveTo, Kill and Resurrect with their refusals, Enable after
  Disable; "mp list names the players online, mp tp brings one and mp
  tpto goes to one": the list's lines, a player's tp refused for its rank,
  a moderator's tp and tpto, a number no one online has, the caller's own
  number; "A teleport the server makes is not undone by the reports sent
  before it", the movement-speed verb's). wire-rules console: the three
  `mp` rows and their ranks. Green in fork pipeline 1088 (89db8732).
- T0 for TCL (fork 90294654): "TCL has an admin's own game toggle its
  collision" (unit/ConsoleCommandTest.cpp: a moderator's refused with no
  snippet; an admin's, by either name, sends one Debug.ToggleCollisions
  each; tgm and tim still answered "not yet"); wire-rules console: tcl
  served, tgm and tim not.
- T2: a command above the caller's rank changes nothing (difftest session
  console-ranks: the C++ core and the Rust edge agree on the line and on
  the unchanged state). COC is not in a T2 session: difftest's moves are
  offsets within the client's own cell, so the permitted jump is proven by
  T0 (the server in process) and T3 (the game).
- T3 scenario id: lab/scenarios/a-console.yaml: c1 types `player.additem`
  for an item and `player.setav marksman 40` in its console; the server's
  record has both and c1's console printed both lines; c1 types `save x`:
  refused, nothing saved; with the server's ranks on (lab setting off for
  the run), c2 at rank 0 types AddItem: refused, its inventory unchanged.
  COC (scenario commit 6559446): c1, made an admin, types `coc
  RiverwoodSleepingGiantInn`; its game and the server's record are in the
  inn (0x133c6); c2 types the same and is refused, still at the lab spawn;
  after the restart and c1's relaunch, c1 is in the inn on both sides.
  MoveTo and the player numbers (scenario commit 55e2f42): c2 waits 1237
  units down the mountain and c1's `player.moveto` on its figure holds,
  twice, ten seconds after each, on the server and in c1's game (the range
  playtest twelve lost; docs/verbs/movement-speed.md, arrivals); `mp list`
  names both by number and cell; c2's `mp tp 1` is refused for its rank;
  `mp tp 2` brings c2 into the inn beside c1, `mp tpto 2` takes c1 back
  into it beside c2; c2's record is still in the inn after the restart.

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
- COC: done. x-coc-probe (scratchpad, run by path; green 20261008-191416
  on fork e0d5e439 with lab-driver 8aed0d9): c1 at rank 2 typed `coc
  riverwood`, then `coc riverwoodsleepinggiantinn`; both landed where the
  server permitted (Engine surface above). Its first run (-190207) took
  Riverwood and lost the inn to the lab driver, which typed the second
  command into the console the first had just closed (fixed in 8aed0d9: a
  console step ends once its console is shut). The engine's own path and
  spot: ghidra/notes/coc-1-7-104.md.

## Status

On fork branch m1-console, stacked on m1-light-plugins by merge: the first
slice (3ef05197, 57b7cc04: the table, ConsoleOutput, the ranks, the actor
value commands, the routing, the rate) and the second (1d9793d2:
RemoveItem, Enable, Kill, Resurrect, SetPos, SetAngle, MoveTo), then COC
(0708f531, e0d5e439: an admin's by Eli's word, 2026-10-08). Left:
the god-mode toggles and Set on a global (not yet); SetLevel and AdvSkill
go to M5 with leveling (Eli, 2026-10-08).

- [x] doc complete, rung declared (the ranks approved by Eli, 2026-10-08,
      COC an admin's by his word the same day)
- [x] engine surface cited or delegated (Skyrim Platform's source; the
      engine's names are a lab measurement, tagged above)
- [x] server logic + T0 (the table, the decision, the three actor value
      commands, the second slice, COC with the movement rule's permit; the
      rest of "not yet" is a later slice)
- [x] message + validator (same commit): ConsoleOutput 3ef05197, the
      console budget 57b7cc04
- [x] native hook + T1: no native hook of ours (Skyrim Platform's
      replacement, two of its bugs fixed: 4b2ec408, 5c68aa5a); T1 none
- [x] TS handler
- [x] T2 green (`just test-proto m1-console`, 2026-10-08: all 16 sessions
      identical up to their declarations, the console session's three
      wire-only reply lines and smoke's AddItem line declared; again on
      e0d5e439 with COC, movement-reject and movement-speed unchanged)
- [x] T3 scenario green, no HYPOTHESIS tags: a-console (thuum 730528f)
      green in run 20261008-153841 on fork 08b124d4 (typed AddItem and
      SetAV by an owner, Save refused, a player's AddItem refused for its
      rank, the results across a restart and a relaunch); with COC
      (6559446) green in run 20261008-191741 on fork e0d5e439 (an admin's
      COC into the inn on both sides and across the restart, a player's
      refused). Playtest eleven (2026-10-08) passed but for MoveTo; `set`
      against the clock confirmed (x-set-probe) and the success lines kept
      (Eli); MoveTo's fix and the kill-and-resurrect reading confirmed
      (x-moveto2-probe 20261008-234317). DONE 2026-10-08: the merge sweep
      on fork m1-console 137f3fb5 went 30 of 30 green (a-console
      20261009-010824 among them) and fork parity fast-forwarded to it
- [x] ledger and suppression registry updated (no Papyrus native added; the
      engine handlers it suppresses are listed under Suppress, with the
      hook and no release)

After playtest twelve (2026-10-08 night, Eli: "ok i like that... make it
so"), on fork m1-console: the movement rule's arrivals (d99a01fb), TES3MP's
player numbers on mp (ec92fcd2), Skyrim Platform's console reading a word
past a command's own parameters as text (89db8732).

- [x] server logic + T0 (fork pipeline 1088, 89db8732)
- [x] T3: x-mp-probe 20261009-062818; x-arrival-probe before and after
      (20261009-064748, 20261009-065137); a-console with the MoveTo rounds
      and the mp commands green twice (20261009-065601, 20261009-070154),
      scenario commit 55e2f42, approved by Eli 2026-10-09
- [x] T2 (`just test-proto m1-console`) on 89db8732, 2026-10-09: all 16
      sessions identical up to their declarations, console, movement-reject
      and movement-speed among them
- [x] the merge sweep, then fork parity: on fork m1-console 89db8732, 29 of
      30 green (runs 20261009-072145 to -083936; a-console with the MoveTo
      rounds and the mp commands among them), a-racemenu red once on a
      figure's head scale (docs/verbs/racemenu-sync.md, watch item) and
      green on both reruns (20261009-084041, -084413); fork parity
      fast-forwarded to 89db8732, 2026-10-09
- [x] playtest twelve's section 2 (Eli, 2026-10-09 around noon, parity
      89db8732, docs/private/playtest-m1-12.md): `player.moveto` and
      `moveto player` landed and held; `mp list` numbered both; `mp tpto 2`
      into Whiterun, `mp tp 2` into the Sleeping Giant with the brought
      player told who; `mp tp 2` after a kill and a resurrect; a player's
      `mp tp 1` refused

M1.1, TCL (Eli, 2026-10-09: "lets do tcl now as m1.1"), on fork branch
m1-tcl from parity 89db8732:

- [x] doc: the table's row, the authority, the engine surface (one
      HYPOTHESIS, the lab's)
- [x] server logic + T0 (fork 90294654)
- [x] message + validator: none new (ConsoleCommand in, SpSnippet out)
- [x] native hook + T1: none of ours (Debug.ToggleCollisions through
      Skyrim Platform's snippet path, as COC)
- [x] TS handler: none new (`tcl` already routed by name)
- [ ] T2 (`just test-proto m1-tcl`)
- [ ] T3: x-tcl-probe, then a TCL check in a-console (its own scenario
      commit)
- [ ] the merge sweep, then fork parity
