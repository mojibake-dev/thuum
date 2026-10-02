# Verb: time (draft)

Draft for M1's "game time and globals, wait and sleep as server-owned
time" (docs/PLAN.md). Nothing here is built. This doc records what SkyMP
does today, from a read of the fork on 2026-10-02, and the decisions the
verb needs before code.

## Intent

The server owns the game clock: every client shows the same time of day,
date and time scale, and they survive a restart. Waiting and sleeping are
server decisions, not something one client does to its own clock.

Roadmap reference: SkyMP ROADMAP.md "Time" ("Implement global variables
(GlobalVariable) on the server that affect time ... Now we have UTC time
like everything") and "Wait" ("Players should be able to sleep/wait if all
players on the server are willing to do so"), both in its TODO list.
Milestone: M1   Class: A

## What SkyMP does today

- No server clock. GameHour, GameDaysPassed, TimeScale and weather appear
  nowhere in skymp5-server (C++ or TypeScript), papyrus-vm or the gamemode
  API (ScampServer.cpp's method table); no message carries time (MsgType.h
  ends at CreateActor, 33).
- Each client makes its own time from its PC clock: skymp5-client
  TimeService (src/services/services/timeService.ts) reads UTC plus a
  per-client `hoursOffset` setting, writes GameHour, GameDay, GameMonth and
  GameYear every 2 s when they drift by a game minute or more, and nudges
  TimeScale to 0.6 or 1.2 to keep the engine's clock near it. Game time is
  therefore real time of day, and two clients with different clocks or
  offsets see different times. GameDaysPassed is never written.
- At login the hour reaches the generated save (remoteServer.ts passes
  TimeService's hour to loadGame; Skyrim Platform's LoadGameApi.cpp reads it
  as an integer, so minutes are lost there); weather is passed as null.
- Wait is disabled on the client: enforceLimitationsService.ts calls
  Game.setInChargen(true, true, false), whose second argument disables
  waiting; nothing listens for the Sleep/Wait menu. Whether bed sleeping is
  blocked too is engine behavior to confirm in the lab.
- Papyrus on the server has no GlobalVariable class: GetValue, SetValue and
  Mod on a GLOB property hit "method not found" and return None
  (PapyrusClassesFactory.cpp registers no such class; VirtualMachine.cpp's
  CallMethod). libespm has no GLOB record reader. Globals are not in the
  change forms (MpChangeForms.h) and never reach clients.
- The server's Utility natives fake time: GetCurrentGameTime is real days
  since 1 January of the current year, GameTimeToString is a constant,
  WaitGameTime counts 60 real seconds per game hour
  (script_classes/PapyrusUtility.cpp).

## Authority

Rung: R0 for the clock and for globals the server owns. A client's own
GameHour becomes a render of the server's value; its local changes are
suppressed or corrected.

## Decisions needed before code (Eli; an ADR once settled)

1. Time scale. SkyMP runs game time at real time (one game hour per real
   hour). Single-player Skyrim reads its rate from the TimeScale global in
   Skyrim.esm. Which does the server run, and is it a server setting?
2. Wait and sleep. Options: keep them disabled; let one player's wait pass
   only for that player's view (breaks shared time); pass global time when
   every online player agrees (SkyMP's own roadmap line); or give sleep its
   benefits (healing, the rested bonus) without moving the clock.
3. Unhosted time. With TES3MP-style cell hosting (M3), does the clock run
   while nobody is online?
4. Which globals are server-owned. The time globals are; quest and
   faction globals ride with M6. A server GlobalVariable class needs
   libespm to read GLOB records and a persistence home outside the per
   reference change forms, which is a schema change (rule 6: migration and
   a restart scenario).

## Sketch, to be confirmed by the decisions

- Server: a clock in Rust behind the bridge (ADR-010, new handlers are
  Rust), persisted, advancing at the chosen scale; GameHour, GameDay,
  GameMonth, GameYear and GameDaysPassed derived from it.
- Wire: a new wire-schema message, server to client, carrying the clock and
  the scale, sent at login and on change (append-only id, a validator, a
  verb-doc reason code).
- Client: TimeService renders the server's clock instead of the PC's;
  hoursOffset goes; the login save gets the hour with its minutes.
- Papyrus: Utility time natives read the server clock; a GlobalVariable
  class for the time globals.
- T3: a scenario where two clients with deliberately skewed PC clocks see
  the same GameHour, before and after a server restart.

## Status

- [ ] decisions 1 to 4 settled (ADR)
- [ ] doc complete, rung declared
- [ ] server logic + T0
- [ ] message + validator (same commit)
- [ ] TS handler
- [ ] T2 green
- [ ] T3 scenario green, no HYPOTHESIS tags
