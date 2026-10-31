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

### Playtest 36, the turbo day (11:36 PDT 2026-10-28): the record froze at a hot push; the cold Kill
rotfern's Survival needs read hunger 30 and exhaustion 18 after four idle real hours (Eli: "it doesnt seem to kill them like
it should to starve them"). Not the clock (20x by the run overlay and by the live cadence: a report every 42.9 s, Survival's
quarter-game-hour tick) and not Survival (hunger and exhaustion never kill, apocrypha's read): the reports STOPPED at the
seat's hot push (numidium's log read: the last line 13:25:21Z, two seconds after client-hot) because this service kept the
list to watch in a class field filled once by the login's message, and a reloaded client never logs in again. Fixed
7fbb5e74: the list in sp.storage, a resumed service reports every watched value once. After the 18:23Z and 18:24Z relaunches
on the fixed bundle no "recorded" line had come by 18:33Z; whether the seats run (Eli stopped at 11:21 PDT; a console or a
save menu pauses Survival's ticks) is numidium's dump read, a regression the fallback reading. The cold Kill: Survival's one
lethal need calls PlayerRef.Kill() at Survival_ColdNeedValue (81b) 1000; the server cannot honour a client-side kill (no C2S
death report exists for players, MpActor::Kill comes from its own number alone) and the seat holds its player in the
engine's deferred kill: memo D51, B recommended (the server's word from its recorded cold need), probe x-player-cold-kill.

Closed at 12:25 PDT (apocrypha's read of Survival_MainScript's bytecode): the silence after the relaunches was the Creation's rule, not
the record's. The main script's 5 s poll starts the mode (StartSurvivalMode: perks, items, the three needs' StartNeed) when
Survival_ModeToggle 828 == 1, Survival_ModeEnabled 826 != 1 and ModeCanBeEnabled(): MQ101 completed OR (fighting controls enabled AND
not in an interior). A generated save never has MQ101 done, so a login indoors (today's Embershard Mine) leaves Survival off until the
first step outside; the camp starts it within 5 s. Two rules for this verb fall out. (1) A listed global is a switch the player sets (828)
or the player's data (the needs 81A, 81B, 816; 8DF the prompt shown; 8E0 to 8E2 the help boxes shown), never a script's own running
state: 826 and Update.esm's Survival_ModeEnabledShared (00314A) are never listed, since a restored 1 would read as "already running" in a
fresh game whose quests are not running, and A0F (ModeCanBeEnabled's output) is derived. (2) A restored need value needs no care: StartNeed
applies its stage at once and each tick adds elapsed game hours from the script's own stamp. Known limit (the checklist's): Survival waits
for the outdoors after an indoor login. If a train ever wants it on from login indoors, the Creation's own StartSurvivalMode() is the path.

## Status

### Memo D51 B built (17:1x PDT 2026-10-28, Eli: "that sounds good")

A death from recorded state is the server's word (R0). A `playerGlobals` entry may carry `killAt` (a finite
number) beside `default`; when a player's merged record puts that global at or past it, the server kills the
player through its own death path (MpActor::Kill, the respawn following as for any death) and logs "dies by the
server's word: global X at V reached its killAt". Survival's cold need, 81b:ccQDRSSE001-SurvivalMode.esl, carries
killAt 1000 in both server settings files (the mod's own CheckIfMaxCold threshold; apocrypha's read). The client's
own Kill stays untrusted (rule 5): the seat's deferred kill holds the player until the server's word. Built on fork
m3-door-pass after 9fb04fec: wire-rules player_globals.rs `kill_at` and `lethal()` with the crate's test, the bridge's
player_globals_lethal, PartOne::LethalPlayerGlobals, the handler's kill, PlayerGlobalsTest's case (GameHour standing
in for the cold need). HYPOTHESIS H-D51a (the seat's deferred kill swallows Survival's own Kill, so the server's word
is the one death) until x-player-cold-kill reads it; the probe gains the global's set through the lab `global` step
and the server's `isDead`.

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
      that never moves receives none). Since the login-time send (train-29,
      above) every seat receives it at its login, so fork 4720d0d3 declares
      it once, for every client of every session, in difftest's
      divergences.yaml beside the login clock, and the 37 per-session
      entries are gone (T2 on 50a56e4a had shown c1's undeclared in every
      session where c1 never moved)
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
seconds before the Creation's check. CONFIRMED the same day: on the server
of fork 50a56e4a, x-survival-restore-timing 20261020-185534, 185906 and
190218 all green, the send 37 to 74 ms after the connect (against 4,200 ms
when it rode the first movement report), no box on the caster's 8 s
screenshots, the two-seat asserts holding after the fresh relaunch (the
lab's other login sends stay at the first movement). Fork m2-train-29, server
only, MERGED to parity 4720d0d3 (2026-10-20 13:40; its T2 declaration moved
to difftest's common file); the T0 case now logs the actor in a second time, as a reconnect does,
and reads the send. The default from the section above stays the belt.
The proper cure for every script that reads a global before any update
(train-30): the server's globals travel with the own player's CreateActor
(a wire change, message and validator in one commit) and LoadGame::Run
writes them into the generated save's globals, so the first frame reads
them; it also spares a player the re-ask after a relaunch.

## Survival's needs (train-31, 2026-10-20)

Eli at playtest twenty-eight: "with the addition of survival, are hunger,
fatigue, and cold states kept on the server like health?" The read of the
Creation's plugin and its 38 scripts on sky-srv (docs/research/train-31-reads.md
section 7): the three live amounts are plain globals, written every tick by
the need scripts (Survival_NeedBase.IncrementNeed ends in NeedValue.SetValue)
and read back by them: Survival_HungerNeedValue 0x81A (145 at the start),
Survival_ColdNeedValue 0x81B (55), Survival_ExhaustionNeedValue 0x816 (140),
none constant. The STAGE is no global: ApplyXStage recomputes it from the
value against thresholds the scripts hold as literals (hunger 80, 160, 340,
520, 770; cold 50, 120, 300, 500, 800; exhaustion 80, 160, 340, 560, 800),
keeps it in a script variable and expresses it as the stage spell on the
player, and the HUD's percent globals in Update.esm are recomputed each tick
from the value. So the server keeps the three values the way it keeps the
mode toggle 0x828 and the help flag 0x8DF: three more entries in
server-settings.json's playerGlobals (lab/deploy/sky-srv, R2 as every player
global), nothing else; the login's send restores them before the Creation's
quests start (docs/verbs/player-globals.md, the send at the login), and the
first tick after StartNeed recomputes the stage and the penalty from the
restored value (StartNeed sets oldStage to 99). HYPOTHESIS, for a probe: the
restore has to land before the toggle starts the need quests, or the first
tick reads the record's default and the restored value arrives one tick late
(a cold tick is 0.0834 game hours). The two message timers (0x821, 0x812)
and the help-shown flags per need (0x8E0 to 0x8E2) are left as the game's.
T4: playtest twenty-nine item 7 (what the bars show after a restart): Eli,
2026-10-20 22:4x: a no, "those reset when test 2 came back".
MEASURED 2026-10-21 (x-survival-needs-relaunch 20261021-182745 on merged
parity 9ad635cd, numidium; the first run 181741 red on the probe's own
bound, cold falling in a warm spot): before the relaunch the three read
500, 560, 600 as set; the server restored them at the relaunched login
("sent 58 to watch, 5 values after a login") and at +5, +30 and +90 s the
game read {828: 1, 826: 0, 81a: 500, 81b: 560, 816: 600}: the restore held
only because nothing ticked. Survival_ModeEnabled 0x826 stayed 0 for 90 s
with the restored toggle 0x828 at 1, and cold stopped falling: the
Creation had not re-enabled Survival in a relaunched game within 90 s.
The five-minute read (x-survival-relaunch-start 20261021-190130): the six
reads at +5 to +300 s identical, 0x826 never 1. The cause, read from the
scripts the same hour, is below; the earlier HYPOTHESIS (StartNeed writing
the start values over the restored ones) is refuted there, and the
client-side re-apply is not the fix.

### Why a relaunched game never re-enables Survival (2026-10-21, a static read of the Creation's scripts with the two runs' screenshots)

The cause, in one line: with the three need values restored before the
start, StartSurvivalMode's first need tick opens the Creation's modal HUNGER
help box and blocks there, two instructions before the one that sets
Survival_ModeEnabled; the box pauses the game, so nothing ticks and the 5 s
poll never re-arms. MEASURED: screenshots 022-c1.png
(20261021-182745-x-survival-needs-relaunch) and 028-c1.png
(20261021-190130-x-survival-relaunch-start) both show the HUNGER message box
with its single Ok button standing at the end of the run (+90 s and +300 s
after the relaunch), and every read in between held exactly {828: 1, 826: 0,
81a: 500, 81b: 560, 816: 600}. The fresh leg of the same runs enabled within
20 s because 145, 55 and 140 are all stage 1 and the box fires only at stage
2 or more. Scripts read as disassembled by lab/pex.py on sky-srv
(/tmp/thuum-survival/disasm/<script>.txt; "L" is a line of that file, "i"
an instruction index), bindings from the esl's VMAD.

1. Who sets Survival_ModeEnabled (0x826), and how the toggle is read.
   Survival_MainScript on QUST SurvivalModeMainQuest 0x898 (VMAD:
   Survival_ModeToggle 0x828, Survival_ModeEnabled 0x826,
   Survival_PlayerHasBeenPrompted 0x8DF, Survival_ModeCanBeEnabled 0xA0F,
   MQ101 0x0003372B, Survival_ModeEnabledShared 0x0100314A of Update.esm)
   sets 0x826 to 1 in StartSurvivalMode, i7 (L8-L19), and to 0 in
   StopSurvivalMode, i9 (L163-L175). MEASURED. The toggle is read by a
   stateless 5 s poll, nothing else: OnInit (L48-L53) and the player
   alias's OnPlayerLoadGame (Survival_MainQuestPlayerAlias L79-L89) call
   RestartUpdateTimer, which is RegisterForSingleUpdate(5.0) (L107-L109);
   OnUpdate (L139-L162) runs PromptToStartSurvivalMode (i0), canBeEnabled =
   ModeCanBeEnabled() (i1), then "if ModeShouldBeEnabled() and canBeEnabled
   and ModeIsDisabled(): StartSurvivalMode()" (i3-i12), "elseif
   ModeShouldBeDisabled() and ModeIsEnabled(): StopSurvivalMode()"
   (i14-i20), RestartUpdateTimer() (i22); ModeShouldBeEnabled is
   0x828.GetValueInt() == 1 (L114-L117), ModeIsEnabled 0x826.GetValueInt()
   == 1 (L103-L106). No remembered value, no OnInit read, no GlobalVariable
   event (Papyrus has none), no message-box callback: the box's result only
   sets 0x828 (point 3) and the same pass then starts the mode. MEASURED.
   ModeCanBeEnabled (L80-L96) is MQ101.IsCompleted() or
   (Game.IsFightingControlsEnabled() and not PlayerRef.IsInInterior()),
   written to 0xA0F each pass; the fork never touches MQ101, so in our
   games Survival switches on, or back on, only with fighting controls
   enabled and the player outdoors; a player who relaunches inside an inn
   waits, the poll retrying every 5 s, until they step out. MEASURED
   (control flow); untested in the lab.
2. Why a toggle already at 1 does not bring the mode on. It does enter the
   start: at the first pass after the relaunch 0x8DF is 1 (no prompt),
   0x828 is 1, 0xA0F true at lab-spawn (an exterior), 0x826 is 0, so i12
   calls StartSurvivalMode. Nothing compares the toggle against a past
   value. What fails is StartSurvivalMode itself: i6 StartSurvivalNeeds
   (L76-L79: Hunger.StartNeed, Exhaustion.StartNeed, Cold.StartNeed) runs
   each need's FIRST TICK synchronously on the main quest's thread before i7
   writes 0x826. Survival_NeedBase.StartNeed (L84-L97): Start() if not
   running (i0-i3), SetNeedStageValues (i5), OnUpdateGameTime() (i7),
   RegisterForSingleUpdateGameTime(interval) (i8-i9), UpdateAttributePenalty
   (i10-i11); OnUpdateGameTime (L405-L416) takes the lock (locked = True,
   i3), calls NeedUpdateGameTime (i4), then re-arms and unlocks (i6-i8).
   Survival_NeedHunger.NeedUpdateGameTime (L245-L296) calls
   IncrementNeedByTick (i21; L91-L125: Utility.Wait(1.0) at i1, then on
   firstUpdate returns value + 1 WITHOUT writing it, i13-i18) and
   ApplyHungerStage(new, lastValue) (i23). ApplyHungerStage (L160-L232)
   picks the stage from the literals (80, 160, 340, 520, 770;
   SetNeedStageValues L73-L83), applies the stage spell, then at i57-i70: if
   newStage >= 2 and Survival_HelpShown_Hunger (0x8E2) == 0 and not
   PlayerRef.IsInCombat(): Survival_HelpHungerHigh.Show() (i69), 0x8E2 = 1
   (i70). Survival_HelpHungerHigh (MESG 0x945), Survival_HelpColdHigh
   (0x944) and Survival_HelpExhaustionHigh (0x943) carry DNAM 0x1, the
   Message Box flag, with no ITXT (the default Ok) and no TNAM; every other
   MESG of the Creation but the start prompt (0x946, DNAM 0x1 with two ITXT)
   is DNAM 0, a corner notification. MEASURED (lab/esm.py over the esl).
   Message.Show on a message-box MESG is latent and returns the pressed
   button (the Creation's own prompt uses the return, L32-L33);
   MessageBoxMenu's flags are kPausesGame, kAlwaysOpen, kUsesCursor, kModal
   (CommonLibSSE-NG include/RE/M/MessageBoxMenu.h:8). So with hunger
   restored at 500 (stage 3: 340 to 520) the first tick shows the HUNGER
   box, the thread stops at NeedHunger i69 with Hunger's lock held,
   StartSurvivalMode never reaches i7, OnUpdate never reaches i22, and
   RegisterForSingleUpdate being single-shot the poll is dead; the paused
   game also freezes the three values, which is why they "held". The same
   gate exists for cold (ApplyColdStage L499-L574, i60-i73, flag 0x8E0;
   restored 560 is stage 4 of 50, 120, 300, 500, 800) and exhaustion
   (ApplyExhaustionStage L261-L360, i84-i97, flag 0x8E1; restored 600 is
   stage 4 of 80, 160, 340, 560, 800): two more Oks wait behind the first.
   MEASURED (disassembly plus the two screenshots). The fresh leg's start
   had 145, 55 and 140, all stage 1, so no box and 0x826 turned 1 (step 7
   of both runs). The cold tick that moved 600 to 560 before the relaunch
   (step 12) ran ApplyColdStage into stage 4 and, by the same instructions,
   opened Survival_HelpColdHigh and paused the fresh game too: HYPOTHESIS
   (no screenshot before the relaunch; the lab's reads run on Skyrim
   Platform's tick and work under a pause). The lab's cold script is
   Supernatural Survival Tweaks' override of Survival_NeedCold.pex (served
   from the esm folder, lab/layer/load-order.tsv); its source keeps the
   identical gate (its Survival_NeedCold.psc lines 331-334). MEASURED.
3. What 0x8DF gates. Survival_PlayerHasBeenPrompted gates only the opening
   box: PromptToStartSurvivalMode (L24-L39) shows Survival_StartPrompt when
   0x8DF == 0 and ModeCanBeEnabled() (i0-i7), sets 0x828 = 1 on button 0
   (i9-i11) and 0x8DF = 1 on either button (i13); StartSurvivalMode also
   writes 0x8DF = 1 (i0). The enabling branch (OnUpdate i3-i12) reads
   0x828, 0xA0F's condition and 0x826 and never 0x8DF, so skipping the box
   skips nothing of the enabling. MEASURED; the fresh leg of both runs is
   the live proof.
4. The smallest action that enables the mode with the restored values
   intact: keep the three help-shown flags the way 0x8DF is kept,
   playerGlobals entries for 8e0 (Survival_HelpShown_Cold), 8e1
   (Survival_HelpShown_Exhaustion) and 8e2 (Survival_HelpShown_Hunger) of
   ccQDRSSE001-SurvivalMode.esl with the lab default 1 (three lines in
   lab/deploy/sky-srv/server-settings.json, no code; R2 per player like
   every player global; a players' deployment leaves the default unset so
   each character sees each help once, presses Ok, and the start continues,
   the Creation's own behaviour, and the recorded flag stops the re-ask
   after a relaunch). With the flags at 1 StartSurvivalMode runs through:
   three first ticks (each Utility.Wait(1.0) plus WaitMenuMode(0.3) in
   ApplyNeedStagePlayerEffects, NeedBase L233-L254), so 0x826 turns 1 about
   4 s after the pass that entered the start, and the three values stay
   exactly as sent, since the first tick writes nothing (point 5). The
   restore at the login can stay before the start; the "set the three again
   once 0x826 turns 1" fix is not needed for the enable. MEASURED (control
   flow); the probe that confirms it is the relaunch read with the three
   flags defaulted. The other candidates: 0x828 to 0 and back to 1 does
   nothing while the start thread stands under the box (the poll is dead)
   and, with the poll alive and the mode on, runs StopSurvivalMode (StopNeed
   L207-L216: Stop, the spells removed, the penalty cleared, firstUpdate =
   True, unregister; no NeedValue write) then StartSurvivalMode again, a
   value-preserving restart (MEASURED); 0x826 = 1 written by the client
   satisfies the gates that read it but arms no need chain, since ticks
   exist only through StartNeed, OnUpdateGameTime and
   RegisterForSingleUpdateGameTime (MEASURED); StartSurvivalMode called
   again (cqf over the gamemode console) spins in WaitForUnlock (NeedBase
   L167-L171) behind the first call's lock, a second hung thread (MEASURED
   for the lock, HYPOTHESIS that nothing frees it); closing MessageBoxMenu
   from the client hides the menu without a button, so the latent Show may
   never return (HYPOTHESIS); pressing Ok (a lab click or a player)
   continues the start through the Exhaustion and Cold boxes, 0x826 turns
   1, the values stay, and every relaunch re-asks until the flags are kept
   (MEASURED); restoring the three only after 0x826 turns 1 avoids the block
   but not the boxes, which come on each need's next tick (MEASURED).
5. Does any start path write 145, 55, 140 over existing values? No. The
   literals appear nowhere as values in the 38 scripts (whole-word grep);
   they are the GLOB records' own FLTV in the esl (0x81A 145, 0x81B 55,
   0x816 140), what a game reads when nothing restored them. The only
   writers of NeedValue are Survival_NeedBase.IncrementNeed (SetValue at
   i26, L98-L133) and DecrementNeed (SetValue at i15, L133-L158); the three
   children only GetValue it, and their eating, sleeping and warming paths
   go through those two. StartNeed reads NeedValue for the penalty (NeedBase
   i10-i11) and runs the first tick, which on firstUpdate returns value + 1
   without SetValue (hunger, exhaustion and cold IncrementNeedByTick,
   i13-i18 each); StopNeed writes nothing. So the start never resets the
   values, and the step-7 reads of both runs (145, 55, 140 unchanged 20 s
   after a fresh start) agree. MEASURED. The HYPOTHESIS above, "StartNeed
   writes the start values over the restored ones", is refuted; the reset
   Eli saw at playtest twenty-nine was the record defaults with no restore
   yet. One hazard in the same path: NeedCold.CheckIfMaxCold (L87-L93,
   called at every cold tick, L716) kills the player when the value is at or
   above Survival_ColdNeedMaxValue (1000), so a restored cold of 1000 is a
   death on the first tick. MEASURED (control flow).

Sources for the engine facts: Message.Show is latent, returns the button and
shows a notification unless the MESG is flagged as a box
(https://ck.uesp.net/wiki/Show_-_Message); MESG DNAM 0x01 Message Box, 0x02
Auto Display, TNAM display time, ITXT buttons
(https://en.uesp.net/wiki/Skyrim_Mod:Mod_File_Format/MESG);
RegisterForSingleUpdate fires once
(https://ck.uesp.net/wiki/RegisterForSingleUpdate_-_Form); MessageBoxMenu's
flags, CommonLibSSE-NG/include/RE/M/MessageBoxMenu.h:8. The disassemblies
stay on sky-srv under /tmp/thuum-survival/ (nothing licensed left it).
The fix as laid: the three flags as playerGlobals with default 1 in
lab/deploy/sky-srv/server-settings.json and the 1.7.104 file (2026-10-21
12:3x, numidium deploys); the probe to confirm is the relaunch read with
them. A probe that sets high values with the flags at 0 cannot measure
ticking (it pauses under the box).

## Survival's food (2026-10-28, playtest 37; fork m3-hunger 853dd4fc)

Eli: "food doesnt replenish hunger." numidium's live read CONFIRMED it (the hunger need 81a at 1000 through 115 reads
while Eli ate): the food's Survival script never runs on a seat. The mechanism, read from the game files on sky-srv
(nothing from memory): the Creation's esl carries no amount keywords; a food's size is an MGEF on the ALCH record,
Update.esm's Survival_FoodRestoreHungerVerySmall 0x01002ee1 (51 records), Small 0x01002ee2 (24), Medium 0x01002ee3
(20), Large 0x01002ee4 (31), and Survival_FoodRestoreCold 0x01002ee5 on the twelve hot soups; the esl's overrides of
those MGEFs carry Survival_HungerRestoreEffectScript with amountToRestore bound to the GLOBs 0x8de VerySmall = 2,
0x82d Small = 18, 0x82b Medium = 220, 0x82c Large = 380, and the cold one 0x818 = 200 (lab/tools/bsa-extract.py and
lab/pex.py over the BSA; OnEffectStart to Hunger.DecreaseHungerBuffered to Survival_NeedBase.DecrementNeed, clamped
at 0; cold's floor 50). The effect's conditions: Survival_ModeEnabled 0x826 at 1 and the player as target.

Built, server-only: ActionListener::ApplySurvivalFood after a true OnEquip of an ALCH that is no poison: the item's
effects (MpActor::EffectsOf) against the `survivalFood` table in server-settings.json ({effect, need, amount, floor}
per MGEF FormDesc, each row's amount a required positive finite number (a row without one refuses the settings at load,
PartOne::SetSurvivalFoodSettings; the literals are the plugin's GLOBs 0x8de Very Small 2, 0x82d Small 18, 0x82b Medium 220,
0x82c Large 380 and 0x818 cold Medium 200, read on sky-srv's 1.6.1170 masters 2026-10-29; the doc said "from the GLOB's
record when the table gives none" until then, which the code never did); both lab/deploy settings files carry
the five rows), gated on the recorded switch 828 at 1, the floor applied, the record merged (RecordPlayerGlobals) and
the value sent to the player with the full watch list (the client's apply replaces its watch from every message),
one log line "[verb:player-globals] <actor> ate <item> <EditorId> (<effect EditorId>): 81a:... <before> -> <after>".
The needs lever: the console command SetGlobal <0x14|0|"self"|actor id> <FormDesc|form id> <value> (rank admin, a
wire-rules console row; ConsoleCommands.cpp in ExecuteAddSpell's shape), reachable in a playtest through lab-api's
console labCommand: {"kind":"console","profileId":1,"name":"setglobal","args":[20,"81a:ccQDRSSE001-SurvivalMode.esl",600]}.
T0: PlayerGlobalsTest's food and SetGlobal cases on the test order's vanilla records (the unit load order has no
Survival plugin: FoodRestoreHealth as the effect, GameHour as the need).

Known and HYPOTHESIS: the HUD's stage recomputes at its next hunger tick (0.25 game hours, up to about 45 s at 20x),
where the Creation's own path recomputes at once; a hunger tick landing between the write and the client's apply
reports the stale value, which wins (one round trip's window); gated on 828, not 826 (never listed by rule), so an
indoor login with 828 at 1 gets a restore the game would hold; not covered: the vampire blood potion (a keyword
condition), alchemy-made reduce-hunger potions (runtime records), werewolf feeding and cannibalism, the gutworm
multiplier. Probe: x-survival-eat v2 reads 81a before and after an eat of a Large food on a seat with 828 at 1.

## Playtest 39's first finding: Survival does not kill (18:48 PDT 2026-10-30, Eli at the seats before the playtest began)

Eli, pausing 39 at the laid seats: "noticing survival doesnt kill. (they sat too long and the survival screen fx for low needs are
hard to play through)". The seats stood 40 minutes under the running clock (7.9 at the lay, timescale 20) with the needs rising from
the set-up's zero to their maximum, the mod's low-needs image-space effects on both screens, and neither character died. Two things
in it. (1) The lab: the needs must be zeroed at the word that starts the playtest, not at the lay, and the clock could be held until
that word (numidium's set-up; told at once). (2) The game: whether Survival Mode's needs kill at all is the open question, not the
server's rule. The server takes a player's own reported health drop (ActionListener::OnChangeValues: the report is the new value
unless it sits below a value the server raised within the hold, attributes.md; increases cropped against regeneration), so an
engine-dealt survival damage would reach the record and the server's zero would kill as any other. The mod's cold stage either
drains health (then our client never reported it, a read) or only caps the maximums (then no death is the mod's own rule and the
finding is a design question). UNVERIFIED either way; the read before any build: the Survival scripts' names from the esl (lab/esm.py
on ccqdrsse001-survivalmode.esl) and the mod's documented stages, then x-survival-cold by path (a seat's needs forced to the cold
maximum through the needs globals, its health and the server's record over two minutes). Memo D72 for Eli (not in tonight's queue):
A) leave the mod's rule, whatever it is, and only fix the set-up; B) if the mod kills by draining health, read why the drain never
reached the record and make it reach it (the client's health report under an engine effect); C) if the mod only caps maximums, a
server rule that drains health at the cold maximum from the reported needs (R1 report, R0 drain), the mod's numbers from its records.
Recommended: A tonight, B or C by the read's answer as a train after M3 closes.

The read drafted (00:5x PDT 2026-10-31): x-survival-cold v1 by path (lab/.cache/probes, sha1 23b6403f; 34 steps, 14 claims), c1 alone
at lab-spawn with the mode switched on (828, the main script's poll starting it outdoors: 826 reads 1). Leg A, the stage: the cold need
set to 990 (stage 5; the help flags 8e0 to 8e2 are the deploy's default 1, so no box) and the seat's health read over a minute in two
dumps with the record's snapshots beside them: a drain shows on both, a cap shows as the maximum alone (recorded, not claimed; the
answer picks B or C). Leg B, the kill: the need set to 1000; the client's report within a second and the server's word (memo D51 B,
"dies by the server's word: global 81b:... at 1000 reached its killAt") within 10 s, the record dead, the seat down (c1.state.down), a
screenshot; the respawn within 40 s and ONE kill line over the next 40 s (a second line is a death loop, the lethal global still at
1000 after the respawn: a finding by name). H-D51a is read on the way (the seat's own Kill at the mod's next tick swallowed, the
server's word the one death). Runs in a lab gap, one seat; the probe is the draft of b-survival-cold once D72 is called.
