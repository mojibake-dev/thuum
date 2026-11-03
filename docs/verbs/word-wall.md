# Verb: word-wall

Drafted 00:4x PDT 2026-10-31 from docs/VERB.md (pile item 11 of docs/private/turbo-2-prework.md; M4's "word walls
teach through the server's shout record", docs/verbs/shouts.md:453-454; Eli, playtest fourteen: "leave it in
dungeons"). From a code map of the fork at parity dc3ec679. Nothing of it is built.

## Intent

A word wall teaches its word into the server's shout record of the player who reads it, so the word is known on every
login and by every console read, and the engine's own learning on the seat is the server's word's echo.

Roadmap reference: skymp/ROADMAP.md "Shouts" ("Learning words of power. Possibility to limit the study of words of
power").
Milestone: M4   Class: B

## Inventory (ADR-031: the action's consequences, before its rung)

The action is a player approaching a word wall: the wall's trigger, the word's glow and chant, the camera pull, the
word learned (Game.TeachWord), the HUD notice; later the unlock with a dragon soul (Game.UnlockWord). The records:
the wall's trigger (an ACTI or a trigger box with the WordWallTrigger script: unread), the WOOP (the word) and the
SHOU (its three words, libespm SHOU.cpp:8-24; no WOOP reader).

| consequence | seen in | disposition |
| --- | --- | --- |
| the trigger as the player nears the wall | engine (the trigger's primitive sends OnTrigger to its reference twice a half second while the player stands in it; CONFIRMED x-word-wall-read 20261101-131832, no OnTriggerEnter from inside the box) | observed: the host's or the player's own report (the Dynamic plan reads which) |
| the chant, the glow of the word, the camera pull | engine | native on the reading player's game; the other game sees the wall's glow by its own engine when the server's record says so (HYPOTHESIS; the read) |
| Game.TeachWord on the seat (the word known, the HUD notice "Word of Power learned") | engine (the script) | suppressed as state: the server's record is the word's truth (R0); the seat's own TeachWord stands only as the echo; a login re-teaches from the record (ShoutSnippets.cpp:28-55, Form.SetPlayerKnows silent) |
| the word's unlock with a soul | engine (the player's menu) | later: a transaction (the soul count on the record) |
| a second player reading the same wall | engine | native on its game; its own record (each player's) |

### Sequences and combinations (ADR-033)

| sequence or combination | probe or scenario | result |
| --- | --- | --- |
| the wall read by the host, the word on the record and after a relaunch | b-word-wall | |
| the same wall read by the guest after the host (its own record) | b-word-wall | |
| a restart between the read and the login | b-word-wall | |

## Authority

Rung: R0 for the record (the server writes the word), R1 for the report (the reading player's own game reports the
wall and the word; the server validates the wall's WOOP against the game files and the player's reach to the wall), R3
for the chant and camera.
Why this rung and not the one above it: the trigger is the player's own game's (its camera and chant), so the report is
the player's; the word is the game files' and the record is the server's.
What the server validates (R1): the reported reference is a word wall trigger (its WordWallTriggerScript names a word,
myWord01, a WOOP), the player in the cell of and within the activation reach of the WALL the script names (wordWall01; the
trigger's own bounds are the chamber, a box of about 4,000 units a side, so a reach to it meant nothing: pipeline 4391
taught from 2,600 units; the wall's bounds are about 320 units, fork bdeb086e, 01:58 PST 2026-11-01), the word not known already (a
repeat is idempotent).
Rate limit / bounds: one report per wall per player; a budget of 2 then 1 a second.

## Engine surface

- The server: ShoutRecord.h:11-36 {shouts, wordsKnown, wordsUnlocked} on the change form (MpChangeForms.h:181-184),
  its API MpActor.cpp:1425-1472; written by the console alone (ConsoleCommands.cpp:499-527: TeachWord, UnlockWord,
  AddShout, the type check "SHOU"/"WOOP" :513, RecordShoutEntry :517); the seat told by ShoutSnippets.cpp:9-26
  (Actor.AddShout, Game.TeachWord, Game.UnlockWord) and at login :28-55 (SetPlayerKnows, silent); read by
  ActionListener.cpp:1236-1250 and wire-rules shouts.rs:88.
- libespm: SHOU's three SNAM (word, spell, recovery; SHOU.h:15-34, SHOU.cpp:8-24); no WOOP reader (shouts.md:250
  overstates it); no reader of the wall's trigger.
- Skyrim Platform natives: Game.teachWord :2893, Game.unlockWord :2896, Game.isWordUnlocked :2850, Actor.addShout
  :2081, Shout.getNthWordOfPower :3384; the `known` lab step reads isWordUnlocked (driver index.ts:1505-1521).
- The wall's script in the engine: WordWallTrigger (vanilla; its event and its call of TeachWord unread: the
  Dynamic plan).
- The records, decoded from Skyrim.esm's VMAD on sky-srv (01:43 PST 2026-11-01; esm.py prints 32 bytes of a field, the decode ran the
  module's record reader): the trigger reference 0x709d2 carries three scripts, WordWallTrigger02Script (status 3, removed),
  WordWallTriggerScript with nine properties (myStage 60, myWord01 = WOOP 0x13e22, shoutGlobal 0x7096d, wordWall01 0x709d1,
  myQuest 0x39645, lookTargetWord01 0x709d4, soundWallWhisper 0x709d3, word01Sound 0x709ce, myEnabler 0x493b7) and
  WordWallTriggerBleakFallsScript; the base ACTI 0x5095e WordWallTrigger carries WordWallTriggerScript with the five shared
  properties (the imagespace modifiers, the quest, WICastMagic04) and WordWallTrigger02Script. So the wall's word is the
  reference's own `myWord01`; the server reads it there (PartOne::WordOfWall, the base's copy first, the reference's winning,
  a removed script skipped). The first T0 (pipeline 4383) looked for `myWord` and refused the Sanctum's trigger as no wall.
- CommonLibSSE-NG: none needed.

## Observe

- Hook point: the seat's own game: Skyrim Platform's sendPapyrusEvent hook on the trigger's OnTrigger (exact pattern, rule 9's native filter with the game-file id range; CONFIRMED by the read, the old alternatives were OnTriggerEnter or a self-activation) [was: either Skyrim Platform's sendPapyrusEvent hook on the wall's OnTriggerEnter (rule]
  9: the filter on the wall's script name), or a native hook on Game.TeachWord's Papyrus native (the word taught, the
  one funnel); the read decides.
- SP filter: the player as the triggering actor; the script by name.
- Data captured: {wall: u32, word: u32}.
- Side effects: HYPOTHESIS: the seat's own TeachWord fires the HUD notice before the server's word; harmless when the
  server accepts (the same word), wrong when it refuses (a forged word): the refusal re-reads the record to the seat
  (ShoutSnippets' login path).

## Impose

- Mechanism: the record written (RecordShoutEntry as the console does), the seat told as the console path tells it
  (ShoutSnippets: TeachWord, which the seat already did, idempotent).
- Visual without simulation achieved by: the engine's own chant on the reading seat.
- Side effects: none.

## Suppress

- What is suppressed: nothing on the seat (its TeachWord stands as the echo); a refused report is undone by the
  record's re-read.

## Message contract

- Message name / numeric type: WordWall, C2S, reliable, `{ wall: u32 }`, MsgType 69 (after PerkState 68); validator: the
  wall never 0, a budget of 2 then 1 a second. SCHEMA_VERSION bumped with it. The word travels nowhere: the server reads
  it from the wall's own record (the trigger reference's script property, below), so a seat can name a wall it stands at
  and nothing else (01:43 PDT 2026-11-01; the first draft carried the word too, an untrusted field the server would only have checked
  against the same table).
- Idempotency / ordering: a known word is a no-op; a wall reported again teaches nothing more.
- Contract doc updated: docs/WIRE.md with the build.

## Server

- Where the logic lives (01:13 PST 2026-11-01, fork m4-word-wall f32fcebc): ActionListener::OnWordWall resolves the reported trigger
  per report (no table at startup, no scan of every reference): PartOne::WordOfWall reads the WordWallTriggerScript's
  myWord property from the reference's script data and its base ACTI's (libespm's RecordHeader::GetScriptData, the
  reference's value winning as ScriptVariablesHolder reads them), made global through that record's lookup and checked
  to be a WOOP; the player must stand in the wall's cell within the activation reach (the lock report's idiom,
  wire-rules activation_within_reach); RecordShoutEntry WordKnown once, the seat told by SendShoutEntry (Game.TeachWord)
  as the console does; refusals E_WORDWALL_NO_REF, E_WORDWALL_NOT_A_WALL, E_WORDWALL_CELL, E_WORDWALL_REACH, each
  logged by name. The Papyrus natives Game.TeachWord, Game.UnlockWord, Game.IsWordUnlocked and Actor.AddShout are
  implemented on the server VM (NATIVES.md rows, R0) so a script's wall on the server could teach too. No SHOU rule
  was needed: the word is the trigger's own, not a choice among the shout's three.
- DB fields / migration: none (ShoutRecord exists).
- Restart behavior: the record as saved.
- Papyrus natives touched (ledger lines added): TeachWord, UnlockWord, IsWordUnlocked, AddShout (implemented, R0).

## Client

- SP binding: the hook above (an event or a native hook) as a `wordLearned {wall, word}` event.
- TS handler: wordWallService.ts sends WordWall; the login's record apply as today.
- Kill switch config key: none (a fix of the record's truth).

## Tests

- T0: the wall rule (the word in the wall's shout, a stranger's word refused, the repeat idempotent, the reach); the
  handler writing the record; the natives.
- T2: difftest session word-wall, a report from another cell refused by name (the fake clients stand at the spawn; the
  legacy server drops the type); the acceptance is T0's and T3's.
- T3 scenario id: lab/scenarios/b-word-wall.yaml: c1 walks to Bleak Falls' wall (Unrelenting Force's second word
  "Fus"? the wall teaches the first unknown word of its shout; the lab reads the record), the `known` step true after
  the chant on c1 and after a relaunch; c2 reads the same wall, its own record; a restart keeps both. Probe x-word-wall
  by path first (the trigger's event, the chant's duration, the TeachWord's timing).
- Assertions that would fail if the verb silently regressed: a word known on the seat and not on the record after a
  relaunch.

## Dynamic plan (fill when any tag above is still HYPOTHESIS)

- Static pre-answer (02:12 PST 2026-11-01, the fork's FridaHooks.cpp OnSendEventEnter): the platform dispatches the JS sendPapyrusEvent hook
  (EventsApi::SendPapyrusEventEnter) BEFORE it reads TESModPlatform::GetPapyrusEventsBlocked, so the client's hook sees the
  trigger's OnTriggerEnter while the seat blocks Papyrus events, and the wall's own script (the chant, the camera, its
  TeachWord) does not run there. The read confirms the event's name and timing. The design question it leaves for after the
  read, for Eli's eye: the wall's scripts could be let through the block on the seat (the push verb's per-record exception
  is the precedent in that hook) so the chant and the glowing word play as in the game, with the server's TeachWord then a
  repeat of the seat's own; or the word arrives silently by the server's snippet with the HUD notice alone. The first is
  the player's experience of a word wall; the second is what the server half gives today.
- CONFIRMED at T3 (x-word-wall 20261101-153103, b-word-wall's draft by path on m4-traps 346249e8: every claim held: the record
  empty before, "learns word 13e22 at wall 709d2" once, wordsKnown "0x13e22" on c1, the second pass teaching nothing more, the
  relaunch keeping it, c2's own record, the restart keeping both; promoted as b-word-wall, main 92c03ed9). The chant (x-word-wall-chant
  20261101-153506 under the layer's named rows): the trigger's scripts RAN on the seat: OnLoad at the trigger's 3D load, two
  OnTriggerEnter (one per listening script), the hook's report 270 ms later, OnUpdate (WordWallTriggerScript's
  RegisterForSingleUpdate) 540 ms after the entry, then MS13 0x39645 set to stage 60 by the seat's script and taken by the
  quest-stage verb ("ff000000 set 39645:Skyrim.esm stage 60: recorded, relayed to 1": the Golden Claw advances on the sharing
  seats as in the game; c2's own stage 12 the same way); the server's one learn line beside the seat's own TeachWord. The
  screen itself (the IMODs, the glowing word, the camera) stayed unread: every screenshot of the run failed on the guest agent's
  file read (E_PVE_FILE, a lab fault); the eye's read is the playtest's. `known` 0 before and after (a wall teaches, a soul
  unlocks).
- x-word-wall-read v1 147f0ba8 runs on the perk-effects train's stage- x-word-wall-read v1 147f0ba8 runs on the perk-effects train's stage after perks merges (01:43 PDT 2026-11-01; never run before).
- READ (x-word-wall-read 20261101-131832, green as a read): with the Papyrus block lifted and the driver's papyrus-log on the wall
  0x709d1 and the trigger 0x709d2, the engine sent `OnTrigger` to the trigger twice every half second for as long as c1 stood in
  its box (86 lines in 10 s) and NOTHING else: no OnTriggerEnter, because the teleport spot 400 units south of the trigger's
  centre is already inside its ~4,000-unit primitive, so the entry happened before the logger was on. The hook therefore keys on
  `OnTrigger` (a seat that spawns or loads inside the box never sees an Enter) and sends WordWall once per wall per session; the
  server's WordKnown record is the second guard. The word stayed unknown (`known` 0x13e22 = 0 before and after) although the block
  was lifted: WordWallTrigger02Script enters its `Listening` state in OnLoad (the pex's string table: OnLoad, Listening,
  StartWordWall), which the block had already swallowed at the cell's load, so lifting the block mid-cell runs no show; the chant
  needs the trigger's three scripts admitted before the cell loads (below). CONFIRMED: the hook's event and its timing.
- The chant (the design question above), the pass's call (05:3x PST 2026-11-01, thuum-magnus): option one, the wall's scripts run on
  the reading seat. Mechanism: Skyrim Platform's admitted list (Data/Platform/papyrus-scripts.txt, FridaHooks.cpp LoadAdmittedScripts,
  ADR-044) gains Skyrim.esm's WordWallTriggerScript, WordWallTrigger02Script and WordWallTriggerBleakFallsScript by NAME (today's
  rows are whole plugins: a per-script row is a papyrus-map.py change and an ADR-044 amendment, written with the traps' rows, which
  need the same). Consequences the scripts carry on the seat (the pex string tables, lab/.cache/game "Skyrim - Misc.bsa"):
  Game.TeachWord(myWord01) locally (the server's TeachWord snippet then repeats it; a refused report leaves the seat's word until the
  login's record, and a shout cast is judged against the record anyway, E_SHOUT_WORD), SetStage(MS13, 60) (the Golden Claw's
  stage at the word: the quest-stage verb's rule decides what the server records), ApplyCrossFade and the IMODs (R3), the wall's
  playAnimation (Learned, Dark1Wild to Dark3ExitWild: R3, the seat's own wall), the sounds and the enabler (R3). HYPOTHESIS until
  the layer probe x-word-wall-chant v1 7babc547 (05:53 PST 2026-11-01; the layer branch layer-world-scripts 20877978's rows, on a build with the verb) reads the
  show, the trigger's events, the one server learn line and MS13's stage as the quest-stage verb logs it; the verb's server half and hook ship
  first and do not wait on it.
- x-word-wall-read by path: c1 at Bleak Falls' word wall (its reference by lab/esm.py on the cell), Skyrim Platform's
  papyrus-events step recording the wall's events as c1 nears it (OnTriggerEnter? OnActivate?), the `known` step before
  and after, c1's console for the HUD notice line; a Frida read of Game.TeachWord's native if the event carries no
  word. Owner: agent.

## Status

- [ ] doc complete, inventory listed with a disposition per row, rung declared (the reference trace owed)
- [x] engine surface cited or delegated (the code map of 2026-10-31; the wall's script read owed)
- [x] server logic + T0 (fork m4-word-wall bb901be7: OnWordWall, PartOne::WordOfWall, the natives; e1b4288f: the trigger's primitive as the reach, libespm's XPRM type; WordWallTest four cases)
- [x] message + validator (same commit; f32fcebc, SCHEMA_VERSION 27)
- [x] native hook + T1 (none: Skyrim Platform's sendPapyrusEvent hook, an existing API, filtered in native to the game-file range and the exact event OnTrigger)
- [x] TS handler (wordWallService.ts on OnTrigger, c31208c0; the server's TeachWord snippet lands through the shouts path; tsc green)
- [ ] T2 green
- [ ] T3 scenario green, no HYPOTHESIS tags (x-word-wall 20261101-153103 green by path; b-word-wall promoted main 92c03ed9; the gate is the pair's full sweep) (UNTICKED 19:02 PST 2026-11-02: 3 open engine claim lines over it, the root-cause plan's W5 and VERB.md's rule; ticked again when each claim cites a run or trace id, lab/tools/verb-lint.py)
- [ ] parity scenario green, or its later list reviewed with it (ADR-031)
- [ ] sequences and combinations green, every checklist item with its scenario (ADR-033)
- [x] ledger and suppression registry updated (NATIVES.md: Game.TeachWord, Game.UnlockWord, Game.IsWordUnlocked, Actor.AddShout implemented, R0, verb word-wall)
