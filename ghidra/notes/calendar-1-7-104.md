# Calendar in 1.7.104: GameDaysPassed is rebuilt every frame

Status: HYPOTHESIS for the engine's internals below. Read statically on
2026-10-04 by the re-analyst subagent through the ghidra MCP, for
docs/verbs/time.md. Nothing was renamed or saved in the project.

Corroborated in the lab: a-time (run 20261004-035822-a-time) read both
clients' GameDaysPassed as the day count set through
TESModPlatform.SetGameDaysPassed plus GameHour / 24 (24.68319 at hour
16.3966). It was still in step with the server 30 s later and after a
restart. That is the rebuild formula this note reads. The run had no
negative control (a client that only calls SetValue), so "a SetValue lasts
one step" stays unproven in the lab.

Program: SkyrimSE-1.7.104.0.exe in the sky-re Ghidra project. Ids below are
Address Library ids, resolved with `lab/addr.py` against
versionlib-1-7-104-0.bin; addresses are the 1.7.104 image's. Every id here is
also present in versionlib-1-6-1170-0.bin, but the 1.6.1170 bodies were not
read.

## Anchors from CommonLibSSE-NG

| what | id | resolves to | identified by |
| --- | --- | --- | --- |
| Calendar singleton | Offset::Calendar::Singleton, RELOCATION_ID(514287, 400447), include/RE/Offsets.h:167 | 0x1421a05d0 | |
| Calendar::GetTimeDateString | RELOCATION_ID(35413, 36311), src/RE/C/Calendar.cpp:75 | 0x140646170 | the format strings "%s, %d:%02d %s, %d%s%s%s", ", 4E %d" and "Bad Day" |

GetTimeDateString reads TESGlobal::value (+0x34, include/RE/T/TESGlobal.h:45)
through Calendar +0x20, +0x18, +0x10, +0x28 and +0x08, with the same fallbacks
as CommonLib's getters (12, 17, 7, 1, 77). Calendar's layout
(include/RE/C/Calendar.h:87-94) therefore did not move in 1.7.104, unlike
SkyrimVM (skyrimvm-1-7-104.md).

## The functions

| id | 1.7.104 | what it does |
| --- | --- | --- |
| 36289 | | Calendar's constructor: the only store of a live pointer into the singleton. It looks up form ids 0x35 to 0x3A into gameYear through timeScale (+0x08 to +0x30), then does `GameDaysPassed += GameHour * (1/24)` and zeroes midnightsPassed and rawDaysPassed (+0x38, +0x3C). |
| 36291 | 0x140645d60 | The clock step, `void(Calendar*, float realSeconds)`; the only Calendar member that writes GameHour (see below). |
| 36564 | 0x140658870 | The main loop body ("Hitched from shader compile", "BGS_Logo.bik"). It calls 36291 with GetSecondsSinceLastFrame (id 410199, src/RE/M/Misc.cpp:84) unless UI::numPausesGame (UI.h:129) is non-zero or Main::freezeTime (Main.h:83) is set. |
| 40485 | | The wait and sleep step: 36291 with iSecondsToSleepPerUpdate / TimeScale. |
| 40445 | | Fast travel ("FastTravel: Could not compute path length to Cell "): 36291 with the travel time. |
| 13328 | | A cell move ("Moving to interior cell %08X %s"): 36291 with 120.0. |
| 36317 | 0x140646bb0 | `rawDaysPassed = floorf(GameDaysPassed->value)`, the only code that copies the global into the day count. It is called from LoadGlobalData (35654, case 3, after reading the save's (form id, float) pairs) and RevertGlobalData (35650). |
| 55923 | | Papyrus GlobalVariable.SetValue: `if (!(flags & kConstant)) value = a;`, nothing else. |

The clock step, trimmed. The constants were read from the binary, and 24.0 is
the float at id 195681, CommonLib's GetHoursPerDay:

```c
h = dt * timeScale->value * (1/3600) + gameHour->value;
if (h <= 24.0f) raw = this->rawDaysPassed;
else {
  // roll: day += 1 per whole 24 hours; at most one month step per call,
  // by the days-in-month table (id 15861 over id 359669, the 12 uint16
  // values of CommonLib's DAYS_IN_MONTH); month past 11 adds a year
  this->midnightsPassed += 1;
  raw = this->rawDaysPassed + 1.0f; this->rawDaysPassed = raw;
  // and one "days passed" event (ids 36328/36329) to the Days Passed stat
  // handler (VTABLE___DaysPassedToMiscStatHandler, Offsets_VTABLE.h:2084)
}
gameDaysPassed->value = h * (1/24) + raw;   // rebuilt, never incremented
gameHour->value = h;
```

## What follows (HYPOTHESIS)

- **A SetValue on GameDaysPassed lasts one clock step.** The next unpaused
  frame, wait step, fast travel or cell move overwrites it. TimeService's first
  design wrote it and would have lost the write every frame.
- **GameHour and TimeScale writes stick.** They are read from their globals on
  every step.
- **Date writes stick too.** GameDay, GameMonth and GameYear are read only at a
  roll, so a written date becomes the start of the next roll.
- **The engine rolls the date itself** once the hour goes past 24.0, adding one
  to its day count and to midnightsPassed and sending one Days Passed event.
  A write to the date globals does none of that.
- **The day count is whole days plus the hour over 24.** The constructor builds
  it that way and every step rebuilds it that way. A new game therefore starts
  at 1 + 8/24 at 08:00, and the weekday, uint(GameDaysPassed) % 7
  (Calendar.cpp:62-65), turns at midnight.
- **No precision slowdown.** Nothing accumulates into GameDaysPassed (the hour
  accumulates, below 24), so a slowdown past 64 days cannot come from this
  step. The value is only rounded to float spacing: 2^-17 days between day 64
  and 128. A Nexus forum thread's report of such a slowdown does not describe
  this code.
- **The fix thuum uses.** Set rawDaysPassed so that the step rebuilds the
  server's day count: `raw = daysPassed - GameHour / 24`. This is Skyrim
  Platform's TESModPlatform.SetGameDaysPassed, using only CommonLib's layout
  and its singleton id. To cross a midnight, write the old date and an hour
  past 24, and the engine's next step rolls everything itself.
- **Still unfixed by any write:**
  - midnightsPassed counts this session's own rolls; ids 29005, 29006 and
    42625 pair it with GetHour (36301) for time windows whose owner was not
    identified;
  - the Days Passed stat counts a midnight the engine rolled and a correction
    later undid.

## Frida plan, if a-time's daysPassed asserts fail

Get the RVAs with `python3 lab/addr.py addrlib 1.7.104 <id>`.

- **Hook 36291.**
  - Read on enter and again on leave: hour [[c+0x20]+0x34], days passed
    [[c+0x28]+0x34], raw [c+0x3C] as a float, midnights [c+0x38] as a u32, and
    the caller.
  - Emit only when the entering days passed differs from hour/24 + raw, or
    when midnights changes.
- **Hook 55923.** args[2] is the TESGlobal: read the form id at +0x14
  (TESForm.h:354), then the value on leave.
- **Hook 36317** on leave: read raw.

Expected:
- every SetValue on 0x39 enters the next step once and leaves as hour/24 + raw;
- 36564 makes no 36291 calls while the inventory is open;
- after TESModPlatform.SetGameDaysPassed, raw == daysPassed - hour/24 at the
  next step.

This is falsified by any of the following:
- the step's leaving days passed equals the written value plus
  dt * TimeScale / 86400;
- raw changes with no roll, load or revert;
- a-time's daysPassed asserts pass on a client that only calls SetValue.
