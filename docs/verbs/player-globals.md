# Verb: player-globals

## Intent

The global variables a player's game writes for that player (Apocalypse's
progress and its MCM settings) are kept by the server per player and set in
the player's game at login, so a summon's upgrades and a player's settings
follow the player between sessions and machines.

Roadmap reference: skymp/ROADMAP.md "Time" ("Implement global variables
(GlobalVariable) on the server"); docs/PLAN.md M2 item 10, ADR-029's second
package (A2, docs/apocalypse-options.md 3.2 and 5.1).
Milestone: M2   Class: A

## Inventory (ADR-031: the action's consequences, before its rung)

The action is a script's write to a listed global in the player's own game.
Its consequences are the value itself and what reads it later; the engine
plays nothing else for a SetValue. From the globals survey (2026-10-11, the
10.2.3 plugin's 99 GLOB records and its 206 scripts disassembled over
lab/pex.py, joined to the plugin's VMAD bindings and CTDA conditions):

| consequence | seen in | disposition |
| --- | --- | --- |
| a progress global changed by its spell's script in the caster's game (23: the Craftlord's 13, the Battlemage's 5, the Avenging Wraith's 4, BanishLiving's counter) | record, script | imposed: recorded by the server per player (R2) and set in the player's game at login |
| a running state's global (2: IsControlling, +1 and -1 around a mind control; LocateValuables' IsActive, set by a quest's stages, read by nothing) | script | suppressed: never saved, since what it describes ends with the session (a logout mid-control would strand IsControlling at 1, refusing every later control) |
| an MCM setting changed in the player's game (30, written only by WB_MCMQuest_Script) | record, script | imposed: as progress (Eli, 2026-10-13: "each player's own, like their progress"); later for people: the MCM is a SkyUI menu, and the lab's layer has no SkyUI (docs/MODS.md:379) |
| what reads them later: the scripts' GetValue at the next cast, 197 conditions over 35 globals (156 of them menu buttons) | record, script | native in the player's game, which holds the restored values |
| a per-cast hand-off or lock (5: CorpseExplosion's BaseHP, XivilaiLord's MagickaLoss, SharedTrauma's lockout, MedorasMemory's Enabled, Crackle's cooldown) | script | suppressed: transient within a cast, never saved (a value from a crashed cast must not survive a login) |
| a world object's global (7: the Milestones' five InUse, Cyclonic Rift's RiftID, EntombStatus) | script | later: world-shared R1 with M4's placed objects (ADR-029; the globals alone share nothing visible) |
| static tuning (13) and unused (19) | record | native: the record's value, nobody writes them |
| a constant global the MCM writes (Destruction_ShockScythe_Global_Threshold, kConstant) | record, script | HYPOTHESIS: SetValue on a kConstant TESGlobal is refused or ignored by the engine (CommonLibSSE-NG include/RE/T/TESGlobal.h:23-31 names the flag); recorded as written either way |

## Authority

Rung: R2, host computes, server records (ADR-029: "A global a player's game
writes is that player's (R2, recorded unvalidated)").
Why this rung and not the one above it: R1 would mean the server checks a
write against the script that made it, which needs the script's run on the
server (ADR-029's allowlist, B's runtime). The values are the player's own
progress and settings, read only in the player's game; nothing another
player sees rests on them (a summon's stats are its owner's game's, until
the summon is hosted, M3).
What the server records (R2), unvalidated: the latest value of each listed
global per player, in the player's change form.
Rate limit / bounds: listed ids only (the data list, Server); finite floats;
at most the list's length per report, one report a second (the client's
watch), the rest refused by the validator.

## Engine surface

- TESGlobal: a TESForm, FormType::Global; its type byte (kFloat 'f', kShort
  's', kLong 'l') and a float value whatever the type; record flag
  kConstant 1<<6 (CommonLibSSE-NG include/RE/T/TESGlobal.h:9-47). Apocalypse's
  carry the type in FNAM, the value in FLTV (the survey, 4a).
- Skyrim Platform: GlobalVariable.from(form), getValue(), setValue(value)
  (skyrim-platform codegen convert-files/skyrimPlatform.ts:2748-2752 at fork
  05192845); the game's VM has
  only GetValue and SetValue natives, Mod and the Int forms are script code
  over them (the survey, section 3), so a watch on the values sees every
  write however made.
- The precedent: skymp5-client TimeService reads and writes the clock's
  globals through GlobalVariable (timeService.ts:92 onward), and the server
  sends them at login (SetGameTime, docs/verbs/time.md).
- The server today: no GlobalVariable class on its VM, no GLOB reader in
  libespm (Records.h), no global stored anywhere (MpChangeForms.h); the
  survey's section 2.
- HYPOTHESIS: a value set by GlobalVariable.setValue after the login save's
  load holds for the session (the engine does not reset a mod's globals
  later; TimeService's writes hold, but those are vanilla's).

## Observe (host or acting client sees the intent before the engine acts)

- Hook point: none; the client watches the listed globals' values once a
  second (GlobalVariable.getValue) and reports the changed ones, as
  TimeService reads the clock. A write between two reads that is undone
  before the second is not seen, which only a per-cast lock does (those are
  not listed).
- SP filter: the list itself (the client reads only the ids the server
  names).
- Data captured: (global, value) pairs.
- Side effects of hooking here: none (reads only).

## Impose (observers render the server's decision)

- Mechanism: at login, after the load, the server sends the player's
  recorded values and the client sets each (GlobalVariable.setValue), in
  TimeService's shape. No other player is sent another's values.
- Visual without simulation achieved by: not applicable.
- Side effects: HYPOTHESIS (Engine surface).

## Suppress (engine's own behavior blocked on non-hosts)

- What is suppressed: nothing; a figure's globals do not exist (a global is
  per game, and a game's are its own player's).
- How: not applicable.
- Release condition: not applicable.
- Side effects: none.

## Message contract

- Message names: PlayerGlobals (both directions), a new wire-schema type
  and its validator in the same commit (rule 4).
- Direction: client to server, the changed values since the last report;
  server to client, the list to watch and the recorded values, at login.
- Fields: entries: list of {global: FormDesc (the plugin's name and the
  local id, so a change of load order keeps it), value: f32}, at most the
  list's length.
- Validator rules: every global is on the server's list; every value is
  finite; no duplicate ids; one report a second at most.
- Idempotency / ordering: the latest report wins per global; a report is
  the values, not a delta, so a repeat is harmless.
- Contract doc updated: docs/WIRE.md, with the commit.

## Server

- Where the logic lives:
  - the list: a server setting, playerGlobals, FormDescs (data, not code:
    53 of Apocalypse's, the 30 settings and 23 of progress, each checked a
    GLOB record in the 10.2.3 plugin; thuum branch player-globals 07d7932),
    read with the other settings;
  - the rule: wire-rules (Rust, ADR-010), the report's checks and the
    record's merge;
  - the record: the player's change form gains an optional list of
    (FormDesc, f32), absent in older records and read as none (the shouts
    record's pattern, MpChangeForms.h);
  - the login: the recorded values with the list, after the game's load.
- DB fields / migration: the change form's new field, absent reads as empty
  (rule 6), with a-restart-persistence grown by it.
- Restart behavior: the values hold across a server restart and a client
  relaunch.
- Papyrus natives touched (ledger lines added): none on the server
  (GlobalVariable.GetValue and SetValue stay missing there until a server
  script needs them, ADR-029's allowlist).

## Client

- SP binding: Skyrim Platform's GlobalVariable (no native work).
- TS handler: a playerGlobalsService beside TimeService: at login, set the
  received values; then once a second read the listed globals and send the
  changed ones.
- Kill switch config key: the setting itself (an empty playerGlobals).

## Tests

- T0: wire-rules (a report of an unlisted id refused, a non-finite value
  refused, the latest value kept; the record's merge); the change form's
  round trip with and without the field.
- T1: none.
- T2: a difftest session, player-globals: c1 reports a listed global's new
  value; the wire stack records it and, after c1 reconnects, sends it at
  login; an unlisted id is refused; the legacy stack knows neither.
- T3 scenario id: lab/scenarios/b-player-globals.yaml: c1's game writes a
  listed global (the driver's global step, as the mod's script would);
  after a server restart and c1's relaunch, c1's game holds the value; c2's
  game holds the record's default.
- Assertions that would fail if the verb silently regressed: c1's value
  after the restart (the record's default if nothing was recorded); c2's
  untouched value (fails if values leak between players).

## Dynamic plan (fill when any tag above is still HYPOTHESIS)

- Needs the Apocalypse layer (thuum branch apocalypse, docs/verbs/
  ghostwalk.md step 0). x-global-probe: c1's driver sets a listed global
  after login; read it back 1, 10 and 60 s later (does the engine keep it),
  and once more after a relaunch with the value set again at login (the
  restore path). The kConstant question: set ShockScythe's threshold and
  read it back.
- Owner: agent.

## Open, for Eli

- The MCM is a SkyUI menu (WB_MCMQuest_Script extends SKI_ConfigBase). The
  lab's layer has no SkyUI, so a person cannot change a setting there, and
  the record keeps the defaults. Does SkyUI join the shared mod set (Eli's
  fenestrate has it, INFERRED from the MCM being his), or do the settings
  stay at their defaults in multiplayer for now?

## Built

Fork branch m2-player-globals, stacked on m2-ghostwalk (2026-10-14):
- 4def3146, the rule: wire-rules player_globals (the list, the report's
  checks, the merge, the login's values) and wire-rules forms, the
  FormDesc parse it shares with castTeleports; T0.
- bf0339f8, the message and its validator (rule 4): PlayerGlobals, MsgType
  44 (wire id 52), schema 14, its fixtures, the C++ and TypeScript types.
- Renumbered on fork branch m2-player-globals-next (2026-10-16): the
  cast-action verb took MsgType 44, wire id 52 and schema 14 for UpdateAction
  on parity (a930968b), so f6dc57a3 (on m2-cast-action 35a3975f) moves
  PlayerGlobals to MsgType 45, wire id 53, schema 15, its fixtures renamed,
  the contiguous-id test green. Parity's next schema is 16 (the marksman
  launch fields, m2-arrow-path), so PlayerGlobals takes 17 when it meets
  parity; m2-ghostwalk-next 42904fb8 carries Ghostwalk with cast-action and
  the spaced-filename fix for the Apocalypse layer.
- 2d3d0254, the record: the change form's playerGlobals, absent in older
  records and read as none, with its round-trip test (rule 6's migration).
- 35422e48, the server: the setting read at start, OnPlayerGlobals through
  the bridge to the rule, the login's message on the first movement; its
  test on Skyrim.esm's GameHour.
- ee70094b, the client: PlayerGlobalsService.
- 45da81ac, PlayerGlobal's operator<, which the change form's tuple
  ordering needs (fork pipeline 1499's build).
T0 green 2026-10-14: Rust tests, clippy and cargo deny locally; the client
type-checks; fork pipeline 1504's server build ran ctest on the master
files, 13 of 13, test_unit's 359 cases with this verb's two.
- On parity 2026-10-17: fork m2-player-globals-main 91b3f9c7 merges parity
  3536ba43 (train-22) in; GitLab pipeline 1784 and the Windows build green.
  It rides fork train m2-train-24 with m2-spell-launch, which also moved
  SpellCast's schema past 16: both changes share schema 17 (neither had
  shipped). The train adds this verb's difftest session (player-globals,
  MsgType 45: a listed global recorded, an unlisted one refused, each
  login's PlayerGlobals on the wire stack; the divergences beyond the
  expected three are declared from its first T2 run) and stages with the
  draft T3 b-player-globals by path.

## Status

- [ ] doc complete, inventory listed with a disposition per row, rung declared
- [x] engine surface cited or delegated
- [x] server logic + T0
- [x] message + validator (same commit)
- [x] native hook + T1 (none needed: Skyrim Platform's GlobalVariable)
- [x] TS handler
- [x] T2 green: train-24's T2 at fork a86238ed (2026-10-18): the
      player-globals session identical with its five declared divergences,
      and the PlayerGlobals message declared in the 27 other sessions whose
      seats move (sent on a seat's first movement after a login, so a seat
      that never moves receives none)
- [x] T3 scenario green: b-player-globals 20261018-103133 on train-24
      (c1's global 3, c2's 0, before and after the server restart), in the
      merge gate 20261018-112123-merge-m2-train-24 (23 of 23); the MCM
      itself waits on SkyUI (Eli's essentials list)
- [ ] parity scenario green, or its later list reviewed with it (ADR-031)
- [ ] ledger and suppression registry updated

## A default for a silent record (train-30, 2026-10-20; fork m2-train30-globals-default, thuum lab-survival-prompt-default)

The essentials layer's first stage under train-29's event filter (06:41)
put the Survival Mode Creation's own "Enable Survival Mode?" box on both lab
clones: the verb working (docs/verbs/papyrus-events.md) and every lab
scenario paused under it (layer-stage smoke 20261020-134134, E_RUN_PAUSED).
The lab measured the two facts the fix rests on: the layer is sound past
the box (x-smoke-layer-survival 20261020-134606, each seat answering No),
and a value the server sends at login lands before the Creation's 5 s
check even in a fresh game (x-survival-restore-timing 20261020-135028: the
restore at 13:52:35.7, no box 25 s later, where a first login's box shows
within about 8 s).

So a `playerGlobals` entry may be an object, `{"global": "<hex>:<plugin>",
"default": n}`, beside the plain strings: the login sends the default to a
player whose record holds no value for that global, and a recorded value
always wins (wire-rules player_globals.rs; the bridge and the server pass
the entries through). Data per deployment: the lab's settings give the
Prompted flag (8df of ccQDRSSE001-SurvivalMode.esl) the default 1, so lab
seats never see the box; a players' deployment leaves it unset and each
player gets the box once, as the Creation intends. The alternatives, a
lab-api step answering the box at connect or the flag written into the
clean world's records, were set aside: the first is UI automation in every
scenario, the second a fixture that a snapshot retake must carry. Rung
unchanged: the default is the deployment's data, the record stays R2. T0:
two Rust tests (the object form and its refusals; the default only where the
record is silent). T3: the layer-merge sweep running without a pause, and
b-papyrus-events's reads of 8df (1 from the default on a lab seat).

## The login's race, and the send moved to the login (2026-10-20, after playtest twenty-seven)

Two facts closed the fixture: the clones hold no save file (Skyrim
Platform's template.ess is compiled into SkyrimPlatformImpl.dll and
LoadGame::Run patches a copy per login, deleting it seconds later; a
snapshot carries nothing of it), and the login restore can lose its race
to the Survival Creation's 5 s check (won at 13:52Z by x-survival-restore-
timing 20261020-135028, lost at 18:23Z on test 2's relaunch, when the
restore rode the first movement report 4.2 s after the connect and the box
asked again). So the send moves: PlayerGlobals goes out at the login
itself (PartOne::SetUserActor, with the clock's send), not with the other
login sends at the first movement report; the client's service holds the
message as pending and applies it at its first in-game update, a few
seconds before the Creation's check (HYPOTHESIS until
x-survival-restore-timing's three reruns on the new server; the lab's
other login sends stay at the first movement). Fork m2-train-29, server
only; the T0 case now logs the actor in a second time, as a reconnect does,
and reads the send. The default from the section above stays the belt.
The proper cure for every script that reads a global before any update
(train-30): the server's globals travel with the own player's CreateActor
(a wire change, message and validator in one commit) and LoadGame::Run
writes them into the generated save's globals, so the first frame reads
them; it also spares a player the re-ask after a relaunch.
