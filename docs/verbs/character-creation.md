# Verb: character creation (race)

The fourth item of M1's validation work (docs/verbs/validation.md,
Character creation): the server takes a race from a client's race menu only
if the menu offers it. SkyMP checked only that the menu was open, so a
client could name any form as its race: a dragon, a Dremora, a child, or a
record that is not a race at all.

## Intent

A player's race is one the game's character creation offers, or one the
server itself gave them.

Roadmap reference: none directly; docs/PLAN.md M1 "Validation: character
creation"
Milestone: M1   Class: A

## Authority

Rung: R1 (the client's race menu makes the appearance; the server validates
it before recording it). The record, once taken, is R0
(docs/verbs/appearance.md).
Why this rung and not the one above it: the look is made in the engine's
race menu on the client; the server cannot run the menu, only accept or
refuse what it produced.
What the server validates: on UpdateAppearance while the actor's race menu
is open, the race must be a RACE record in the server's load order with the
Playable flag, or the race the server already records for the actor (a
gamemode's choice, which the menu must not undo). The rest of the
appearance is recorded as before, unvalidated (see "Not in this verb").
Rate limit / bounds: unchanged; one accepted result per race menu open.

## Engine surface

- The flag: RACE's DATA field holds seven skill boosts (14 bytes), 2 bytes,
  four floats (heights and weights), then a uint32 of flags at byte 32, bit
  0 Playable, bit 2 Child (UESP, "Skyrim Mod:Mod File Format/RACE",
  https://en.uesp.net/wiki/Skyrim_Mod:Mod_File_Format/RACE, which describes
  Playable as the race being selectable by players). libespm reads the same
  offset (libespm/src/RACE.cpp, RACE::GetData) and names the bits
  (libespm/include/libespm/RACE.h, RACE::Flags); CommonLibSSE-NG names the
  flag in memory (include/RE/T/TESRace.h, RACE_DATA::Flag::kPlayable).
- In the lab's files (lab/esm.py races, 2026-10-03): Skyrim.esm has 99
  races, ten of them playable, the ten character races (ArgonianRace through
  WoodElfRace, 0x00013740 to 0x00013749); the vampire variants, the child
  races, DremoraRace, ElderRace and the creature races are not. Update.esm
  repeats the same ten; Dawnguard, HearthFires and Dragonborn add none.
- The menu itself: CommonLibSSE-NG's RaceSexMenu (include/RE/R/RaceSexMenu.h)
  does not name its race list, so the lab looked: the race menu the server
  opened on sky-c1 listed exactly the ten playable races, Argonian through
  Wood Elf, and the Down key moved the selection from Nord to Orc
  (exploratory run 20261003-074358, its first and third screenshots).
  CONFIRMED for the vanilla files.
- The client: skymp5-client sends UpdateAppearance when the RaceSex Menu
  closes (src/services/services/sendInputsService.ts, sendAppearance), built
  from the player's base record at that moment (src/sync/appearance.ts,
  getAppearance): the race is whatever the base record holds, so a script,
  the console or a modified client can put any race there.

## Observe, impose, suppress

- Observe: unchanged; skymp5-client reports the menu's result when the
  RaceSex Menu closes.
- Impose: a refused result changes nothing on the server: the record keeps
  its previous look (or none), the race menu stays open on the server, and no
  other client is told. The refused client keeps showing its own choice until
  it logs in again, when the server's record and its open race menu
  (isRaceMenuOpen in CreateActor) bring the menu back.
- Suppress: the server's processing of a refused result.

## Message contract

- UpdateAppearance (MsgType 4), SetRaceMenuOpen (29): unchanged.
- The gamemode event onUpdateAppearanceAttempt (actor, appearance,
  isAllowed) reports a race refusal as isAllowed false, as it already did
  for a closed menu.

## Server

- Where the logic lives: ActionListener::OnUpdateAppearance and
  IsAllowedRace (fork faa575d2, on parity c104128f). The rule itself moved to Rust on 2026-10-03 (skymp-wire wire-rules, ADR-020; fork f0045206): the C++ handler gathers the facts and asks. The race must resolve, in the
  server's load order, to a RACE record with the Playable flag, unless it is
  the race already recorded for the actor. A refusal logs E_APPEARANCE_RACE
  with the actor and the race. Without loaded game files (unit tests only)
  there is nothing to check against and the check is skipped.
- DB fields / migration: none.

## Client

- No client change: skymp5-client shows the menu on SetRaceMenuOpen and
  sends its result when the menu closes, as before.
- Lab only: lab-driver's close-menu action (the engine's own close of a
  named menu through Skyrim Platform's TESModPlatform.CloseMenu), because
  the menu's finish box does not take tapped keys; the gamemode's
  open-race-menu command and its record of the server's verdicts
  (onUpdateAppearanceAttempt), which labState reports.

## Not in this verb

The rest of the appearance is still recorded as the client sends it: sex,
weight, head parts, head texture set, tints (texture paths, as strings, go
to every client), face morphs and presets, and the name. Each needs its own
source for what the menu can produce before the server can refuse anything
else; head parts in particular come with extra parts the engine adds, so a
naive allow-list would refuse real characters. The receiving client already
drops head part ids that are not head parts (HeadPart.from in
applyAppearanceCommon, src/sync/appearance.ts). Candidates for a later verb.

## Tests

- T0: "The race menu accepts only a race it offers"
  (unit/PartOne_UpdateLookTest.cpp, with the lab's master files):
  DremoraRace is refused (no record, the menu still open, nothing relayed),
  NordRace is taken (recorded, the menu closed, relayed once); with
  DremoraRace set by the server, ElderRace is refused and DremoraRace taken.
- T2: difftest session character-creation: a new character (profile 9, its
  menu open) answers with DremoraRace; the legacy server records it and
  relays it to c1 and c2, the fixed server sends neither. Green on
  m1-character, 2026-10-03 (`just test-proto m1-character`: smoke,
  attributes, and the four sessions identical up to their declarations).
- T3: lab/scenarios/a-character-creation.yaml (approved by Eli, 2026-10-05;
  its race-pick revision 97834ad approved 2026-10-08): the
  server opens c1's race menu (labCommand open-race-menu), the stock client
  shows it, lab-driver picks the next race in the list (tap-key 208, Down:
  Nord to Orc) and closes the menu (close-menu, the engine's own close: the
  menu's Ok/Cancel finish box does not take tapped keys, exploratory runs
  20261003-074730 to -075403), and the server takes the result: Orc, through
  the Playable check, since c1's recorded race is Nord. A second open and
  close keeps the recorded race. Green on m1-character, run
  20261003-081014, 7 of 7. It guards against refusing a real player; it
  cannot fail on a server without the check, since the stock menu offers no
  other race, so the refusal's evidence is T2.

## Status

- [x] the flag sourced (UESP, libespm, CommonLibSSE-NG) and read from the
  lab's files
- [x] server logic + T0 (fork m1-character faa575d2; ctest green with the
  lab's master files in pipeline 586, both refusals logged)
- [x] T2 green
- [x] T3 scenario green, no HYPOTHESIS tags (the scenario is under Eli's
  review)
- [x] on fork parity (c104128f, 2026-10-03)
