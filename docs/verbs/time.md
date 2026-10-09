# Verb: time (the shared clock)

Part one of M1's "game time and globals, wait and sleep as server-owned
time" (docs/PLAN.md): one clock, owned by the server, shown by every client.
Per-player wait and sleep (decision 2) is part two, docs/verbs/rest.md (done
2026-10-04). Other globals are deferred (decision 4).

## Intent

Every player sees the same date, hour and time scale. The server owns them;
they keep running while nobody is online and pick up after a restart exactly
where they would have been.

Roadmap reference: SkyMP ROADMAP.md "Time" ("Implement global variables
(GlobalVariable) on the server that affect time ... Now we have UTC time
like everything") and "Wait" ("Players should be able to sleep/wait if all
players on the server are willing to do so"), both in its TODO list.
Milestone: M1   Class: B (the server half is public spec with a server
oracle; the client half renders and needs the lab)

## What SkyMP does today

Read from the fork on 2026-10-02.

- There is no server clock. GameHour, GameDaysPassed, TimeScale and
  weather appear nowhere in skymp5-server (C++ or TypeScript), papyrus-vm or
  the gamemode API (ScampServer.cpp's method table). No message carries
  time: MsgType.h ends at CreateActor, 33.
- Each client makes its own time from its PC clock. skymp5-client
  TimeService (src/services/services/timeService.ts):
  - reads UTC plus a per-client `hoursOffset` setting;
  - every 2 s, writes GameHour, GameDay, GameMonth and GameYear when they
    drift by a game minute or more;
  - nudges TimeScale to 0.6 or 1.2 to keep the engine's clock near its
    target.
  Game time is therefore real time of day, and two clients with different
  clocks or offsets see different times. GameDaysPassed is never written.
- At login, the hour reaches the generated save: remoteServer.ts passes
  TimeService's hour to loadGame. Skyrim Platform's LoadGameApi.cpp reads it
  as an integer, so the minutes are lost. Weather is passed as null.
- Wait is disabled on the client: enforceLimitationsService.ts calls
  Game.setInChargen(true, true, false), whose second argument disables
  waiting. Nothing listens for the Sleep/Wait menu. Whether bed sleeping is
  blocked too is engine behavior still to confirm in the lab.
- Papyrus on the server has no GlobalVariable class. GetValue, SetValue and
  Mod on a GLOB property hit "method not found" and return None: no such
  class is registered in PapyrusClassesFactory.cpp, and VirtualMachine.cpp's
  CallMethod does the lookup. libespm has no GLOB record reader. Globals are
  not in the change forms (MpChangeForms.h) and never reach clients.
- The server's Utility natives fake time (script_classes/PapyrusUtility.cpp):
  - GetCurrentGameTime returns real days since 1 January of the current year;
  - GameTimeToString returns a constant;
  - WaitGameTime counts 60 real seconds per game hour.

## Decisions (Eli, 2026-10-03; ADR-021)

1. **Time scale is a server setting.** The default is TES3MP's model: one
   shared, server-owned clock running at the game's own rate (the TimeScale
   global in Skyrim.esm). The setting can switch to SkyMP's real time of day.
2. **Wait and sleep are per player and never move the shared clock.** A
   player who waits or sleeps gets that rest's effects for themselves
   (healing; sleep's rested bonus). The world's time runs on as before.
3. **Unhosted time:** the clock keeps running while nobody is online.
4. **Other server-owned globals are deferred.** The time globals belong to
   the clock and come with it. Any other global waits until a verb needs it
   (quests, M6). The GLOB reader and its persistence home are built then,
   not now; that is a schema change under rule 6.

## Authority

Rung: R0.

- **Why not R1.** No client computes anything the server needs. The clock is
  a function of the server's own wall clock and its settings, so there is
  nothing to validate.
- **The engine's clock.** Each client's engine keeps advancing its own clock
  between corrections; it is the render of the server's clock. It is never
  reported back to the server, and its drift is corrected toward the server
  (Client, below).
- **What the server validates.** Nothing comes from clients. Each client's
  wire layer structurally validates the server's message (wire-validate,
  below).
- **Rate.** One SetGameTime per player at login, then one every 60 s.

## The clock

Game time is a pure function of the server's wall clock (Unix milliseconds)
and the `time` settings. It keeps no state:

- nothing to persist: no DB change, rule 6 untouched;
- it runs while nobody is online (decision 3);
- a restart resumes exactly where the function says.

It lives in Rust (ADR-010, ADR-020): skymp-wire/crates/wire-rules/src/clock.rs.
The C++ core reaches it through the rules bridge
(wire-bridge/src/rules.rs, `skymp::rules::GameClock`).

### Settings

All are optional, in server-settings.json under `time`. Rust parses and
checks them at startup, and a bad value stops the server with its name.

| key | default | meaning |
| --- | --- | --- |
| `mode` | `"game"` | `"game"` is decision 1's default. `"realTimeOfDay"` is SkyMP's current behavior, moved from the client to the server. |
| `timeScale` | 20 | Game seconds per real second, positive; game mode only. Skyrim.esm's TimeScale (GLOB 0x3a) is 20. |
| `epoch` | `"2026-10-03T00:00:00Z"` | The RFC 3339 instant at which the clock reads `start`. The default is the day ADR-021 was accepted. |
| `start` | year 201, month 7, day 17, hour 8, daysPassed 1 | The calendar at `epoch`. |
| `utcOffsetHours` | 0 | Real-time mode only. Replaces the client's `hoursOffset`. |

The `start` default is Skyrim.esm's own values, read with lab/esm.py on
sky-srv on 2026-10-03: GameYear 0x35 = 201, GameMonth 0x36 = 7 (counted from
0, so 7 is Last Seed), GameDay 0x37 = 17, GameHour 0x38 = 8, GameDaysPassed
0x39 = 1. The clock therefore starts where a new game starts.

A plugin that changes TimeScale is not honored: the setting is a constant
until the GLOB reader exists (decision 4).

### Game mode

- **Elapsed time.** Elapsed game hours = (now - epoch) x timeScale / 3600 s.
  Before the epoch, the clock holds at `start`.
- **Calendar.** The calendar advances from `start`:
  - the hour wraps at 24;
  - days roll through months by CommonLibSSE-NG's DAYS_IN_MONTH
    (include/RE/C/Calendar.h:12-24), so there are no leap years, matching
    Tamriel's months ([UESP, Lore:Calendar](https://en.uesp.net/wiki/Lore:Calendar));
  - months roll into years.
- **Days passed** are whole days plus the hour over 24, the way the engine
  counts them (Engine surface): daysPassed = start.daysPassed + (start.hour
  + elapsed hours) / 24. With Skyrim.esm's start that is 1 + 8/24 at 08:00,
  what the engine's own Calendar constructor makes of a new game.
- **Weekday.** The engine derives the weekday as uint(GameDaysPassed) % 7
  (CommonLibSSE-NG src/RE/C/Calendar.cpp:62-65), so it turns at midnight.
- **Changing the rate moves the clock.** A stateless clock has no "now" to
  continue from, so changing `timeScale` or `epoch` moves the time. An
  operator who changes the rate sets a new `epoch` and `start` with it. A
  persisted anchor would remove that chore, but it is a schema change, so
  not now.

### Real-time mode

This is SkyMP's mapping from timeService.ts, computed on the server:

- the UTC date and time of day, plus `utcOffsetHours`;
- GameDay = day of the month;
- GameMonth = the month, counted from 0;
- GameYear = the UTC year - 2020 + 199;
- time scale 1.

daysPassed is `start.daysPassed` plus the whole days since the epoch's date,
plus the hour over 24.

### Against TES3MP

TES3MP's server stores the calendar in its world file and advances it with
a one-second timer. At every game hour it sends hour, day, month, year,
daysPassed and timeScale to every player:

- the timer is scripts/serverCore.lua:130-166 in
  [CoreScripts 0.8.1](https://github.com/TES3MP/CoreScripts/tree/0.8.1);
- IncrementDay and LoadTime are scripts/world/base.lua:148-171 and 279-300;
- the defaults are scripts/config.lua:47-49;
- the clock stops while the server is empty by default (config.lua:71-72).

The fields on our wire are the same. Ours computes the time instead of
ticking it, so there is nothing to save, and decision 3 costs nothing.

## Engine surface

- **What the engine reads.** The engine's Calendar reads the six time
  globals (CommonLibSSE-NG include/RE/C/Calendar.h:87-92). It also keeps
  `midnightsPassed` and `rawDaysPassed` (Calendar.h:93-94).
- **How the client writes.** Clients write the globals through Skyrim
  Platform's GlobalVariable.setValue (Papyrus GlobalVariable.SetValue). This
  needs no native hook and no Address Library ID.
- **What is known to work.** TimeService has written GameHour, GameDay,
  GameMonth and GameYear this way since SkyMP shipped it, and the sky
  follows.
- **The engine's clock step, read in Ghidra on 1.7.104.**
  ghidra/notes/calendar-1-7-104.md has the ids, the trimmed code and a
  Frida plan, and keeps its static findings tagged HYPOTHESIS.
  - What this verb relies on is CONFIRMED in the lab (a-time, run
    20261004-035822-a-time). Both clients read GameDaysPassed as the day
    count set through SetGameDaysPassed plus GameHour / 24 (24.68319 at
    16.3966), and it still agreed with the server 30 s later and after a
    restart (Results).
  - Every unpaused frame, wait step, fast travel and cell move calls one
    step (Address Library 36291). It adds the frame's game hours to
    GameHour and rolls the date past 24.0 by the days-in-month table.
  - A roll adds one to its day count (`rawDaysPassed`) and to
    midnightsPassed, and sends one Days Passed stat event.
  - It **rebuilds** GameDaysPassed as GameHour / 24 + rawDaysPassed, so a
    SetValue on that global lasts one frame.
  - GameHour and TimeScale are read on every step, and the date only at a
    roll, so writes to those stick.
  - The Calendar constructor (36289) adds GameHour / 24 to GameDaysPassed,
    and a save load floors GameDaysPassed into rawDaysPassed (36317).
- **The day count is therefore set, not written: TESModPlatform.SetGameDaysPassed.**
  - It is a Skyrim Platform native, new in the fork: rawDaysPassed =
    daysPassed - GameHour / 24, through CommonLib's Calendar layout and its
    singleton id. The re-analyst resolved both on 1.7.104, and its
    GetTimeDateString reads the same fields.
  - It goes on the native ledger as a client-side binding. No new Address
    Library id is involved.
- **No slowdown past 64 days.** A Nexus forum thread reports
  GameDaysPassed slowing past about 64 days
  ([Nexus forums](https://forums.nexusmods.com/topic/13528839-gamedayspassed-precision-bug-past-64-days)).
  The step accumulates nothing into it, only the hour (below 24), so that
  report does not describe 1.7.104. The value is only rounded to float
  spacing: 2^-17 days between day 64 and 128 (Goldberg, "What Every
  Computer Scientist Should Know About Floating-Point Arithmetic", ACM
  Computing Surveys 23(1), 1991).

## Observe, impose, suppress

- **Observe:** nothing. No client intent exists.
- **Impose:** TimeService writes GameYear, GameMonth, GameDay, GameHour and
  TimeScale from the server's clock, and sets the day count through
  TESModPlatform.SetGameDaysPassed (Client, below).
- **Suppress:**
  - TimeService stops reading the PC clock and `hoursOffset`;
  - the TimeScale nudge goes;
  - local waiting stays disabled (setInChargen) until part two; since part
    two it is allowed, and TimeService holds its correction while the
    Sleep/Wait menu is open (docs/verbs/rest.md).

## Message contract

- **Message:** SetGameTime, SkyMP MsgType 34, wire id 42 (MsgType + 8,
  appended). SCHEMA_VERSION goes from 2 to 3.
- **Direction:** server to client, reliable, ordered. It is sent:
  - at login, before the player's own CreateActor, on the same ordered
    channel, so the client knows the time before it loads the save;
  - again every 60 s to each player, counted from their login.
- **Fields** (JSON keys as written):

  | key | type | range |
  | --- | --- | --- |
  | `year` | u32 | |
  | `month` | u32 | 0 to 11 |
  | `day` | u32 | 1 to 31 |
  | `hour` | f32 | at least 0, below 24 |
  | `daysPassed` | f32 | at least 0; whole days plus the hour over 24 |
  | `timeScale` | f32 | at least 0 |

- **Validator** (wire-validate; runs on the server before encoding and on
  the client after decoding):
  - every float finite, else E_VAL_NONFINITE;
  - every field in range, else E_VAL_RANGE (a new code).
- **Idempotency:** it replaces the previous value. Ordering matters only
  against CreateActor at login, and the ordered channel gives that.

## Server

- **The clock.** It lives in wire-rules (clock.rs). wire-bridge exposes
  `new_game_clock(settings_json)`, `now(unix_ms)`, `login(user, unix_ms)`,
  `resync_due(user, unix_ms)` and `forget(user)`.
- **Who calls it.** PartOne holds the clock, built from the settings that
  ScampServer.cpp passes. Calls:
  - SetUserActor pushes SetGameTime to the user;
  - Tick pushes a resync to each player whose last push is 60 s old;
  - a disconnect forgets the user.
- **Gamemode API.** `mp.get(0, "gameTime")` is a new read-only property:
  year, month, day, hour, daysPassed, timeScale.
- **DB.** None. A restart reads the same settings and the same wall clock.
- **Papyrus natives** (docs/NATIVES.md lines updated):
  - Utility.GetCurrentGameTime is the clock's daysPassed. It obtains "the
    current game time in terms of game days passed (same as the global
    variable)"
    ([Creation Kit wiki text](https://papyrus.bellcube.dev/skyrimse/script/utility/function/getcurrentgametime/)).
  - Utility.WaitGameTime(hours) waits hours x 3600 / timeScale real
    seconds. It pauses "for at least the specified amount of game time",
    in game hours
    ([Creation Kit wiki text](https://papyrus.bellcube.dev/skyrimse/script/utility/function/waitgametime/)).
    The old 60 s per hour assumed a scale of 60.
  - GameTimeToString stays the placeholder it is; the ledger says so.

## Client

TimeService renders the latest SetGameTime and keeps its receipt time.

- **Every 2 s** (its existing cadence), the target is the message advanced
  by the real time since receipt x timeScale:
  - the hours since the message day's midnight (above 24 once a midnight has
    passed);
  - the day count, continuous across midnight.
- **In step.** The engine is in step when both of these hold:
  - its day count is within 0.01 of the target's (a wrong day count is
    whole days off: a save's, a fast travel's);
  - its hours since the message day's midnight are within a game minute of
    the target's (its GameHour, plus 24 once it has rolled to the next
    date).
- **Correction.** When it is not in step, the client writes:
  - the message's date;
  - GameHour as those hours, even past 24, so that the engine's next step
    rolls the date, its day count and the Days Passed stat itself;
  - then the day count through SetGameDaysPassed, which is set against the
    hour.
- **More than a day past the message**, the client waits for the next one,
  which is at most 60 s away. The client never does calendar arithmetic.
- **Time scale.** TimeScale is always the message's.
- **Accepted, not fixed** (ghidra/notes/calendar-1-7-104.md): a fast travel
  across midnight rolls the engine a day, which the correction undoes. The
  Days Passed stat keeps the extra day, and midnightsPassed counts the
  session's own rolls.
- **Latency.** The receipt time stands in for the server's send time, which
  is Cristian's method without the round trip:
  - Cristian, "Probabilistic clock synchronization", Distributed Computing
    3(3), 1989;
  - accessible summary:
    [Cristian's algorithm](https://en.wikipedia.org/wiki/Cristian%27s_algorithm).

  A one-way delay of 100 ms is 2 game seconds at scale 20, well under the
  correction threshold.
- **Login save.** The save's hour is the server's: remoteServer.ts asks
  TimeService. LoadGameApi still takes whole hours, and the first tick
  writes the minutes.
- **No message, no takeover.** A client that has not received SetGameTime
  leaves the engine's clock alone.
- **Kill switch:** none; the clock always exists. `mode: "realTimeOfDay"`
  restores SkyMP's real-time behavior, now shared by every client.

## Tests

- **T0, cargo (wire-rules clock):**
  - the start at the epoch and the hold before it;
  - the rate;
  - rollover of day, month (31 to 28 to 31) and year;
  - daysPassed as whole days plus the hour over 24, the engine's way (a
    property over four years of game time);
  - real-time mapping with an offset across UTC midnight;
  - settings defaults and each refusal;
  - a property: for any instant, the hour is in [0, 24), the day is valid
    for its month, and the month is in range.
- **T0, cargo (wire-validate):** SetGameTime accepted, and refused for each
  out-of-range field and for a non-finite float.
- **T0, cargo (wire-json):** two fixtures for type 34. The C++ contract test
  reads them too.
- **T0, ctest:**
  - SetUserActor sends SetGameTime ahead of the player's CreateActor;
  - the resync comes after 60 s;
  - GetCurrentGameTime and WaitGameTime follow the clock.
- **T2:**
  - the fakeclient smoke receives exactly one SetGameTime at login with
    timeScale 20;
  - labState's time agrees with it;
  - difftest: every client of every session receives one SetGameTime on
    the wire and none on the legacy stack, declared once for all sessions.
- **T3, lab/scenarios/a-time.yaml.** Both clients connect, then the
  scenario asserts:
  - each client's TimeScale is the server's (20);
  - each client's GameHour is within 0.05 h (3 game minutes) of the
    server's at the assert;
  - each client's GameDay, GameMonth and GameYear equal the server's;
  - each client's GameDaysPassed is within 0.01 of the server's.

  It waits 30 s and asserts again; the hour has moved 10 game minutes on
  both sides. It restarts the server and both clients reconnect. The same
  assertions follow: the clock resumed and did not reset.
- **What fails if the verb regresses:**
  - a client on its PC clock fails the hour assertion (the server's game
    hour is unrelated to UTC);
  - the old nudge fails TimeScale == 20;
  - a clock that reset on restart fails the post-restart hour;
  - a client that writes GameDaysPassed instead of setting the day count
    fails the daysPassed assertions, because the engine's step rebuilds the
    global every frame.

## Results

T3: a-time green, run 20261004-035822-a-time, 2026-10-04. The run used the
fork's m1-time server image (pipeline 637) and its client and Skyrim
Platform build (GitHub run 37174019756) on both clones. All 21 assertions
held.

| point | c1 GameHour | c1 days passed | c2 GameHour | c2 days passed |
| --- | --- | --- | --- | --- |
| after login | 16.3966 | 24.68319 | 16.3965 | 24.68319 |
| 30 s later | 16.5658 | 24.69024 | 16.5680 | 24.69033 |
| after a server restart and relog | 16.7925 | 24.69969 | 16.7994 | 24.69998 |

- **Date and rate.** Both clients were on 4E 201, month 8 (Hearthfire),
  day 9, at TimeScale 20. The hour moved 10.2 game minutes in the 30 s
  between the first two dumps.
- **Agreement.** The two clients agreed within 0.5 game seconds, and each
  agreed with the server's clock (labState time) within the 3-minute
  tolerance at every assert.
- **Rotation fix.** It showed up in the same run: c2 spawned facing 72
  degrees, its record's rotation, where the old client turned that into 72
  radians (165.3 degrees).

T2: green on the same image, 2026-10-04:
- the smoke saw one SetGameTime ahead of its CreateActor (hour 9.093, days
  passed 24.3789);
- labState agreed 1.3 game minutes later;
- all seven difftest sessions were identical, with the clock's divergence
  declared once.

## Status

- [x] decisions 1 to 4 settled (ADR-021; 4 deferred)
- [x] doc complete, rung declared
- [x] engine surface cited (Calendar.h) and the clock step read in Ghidra
      (ghidra/notes/calendar-1-7-104.md); what the verb relies on was
      CONFIRMED by a-time (run 20261004-035822), and the static reading's
      other findings stay tagged in the notes, not relied on
- [x] SP binding: TESModPlatform.SetGameDaysPassed (T1 has no harness yet;
      a-time is the proof)
- [x] server logic + T0 (cargo, and the fork's ctest: 257 cases)
- [x] message + validator (same commit, f280d576)
- [x] TS handler (TimeService)
- [x] T2 green (2026-10-04)
- [x] T3 scenario green (run 20261004-035822-a-time); no HYPOTHESIS tag
      left on what the verb does
- [x] ledger updated (GetCurrentGameTime, WaitGameTime)
- [x] on parity 4257036e (2026-10-04), after a regression sweep on m1-time:
      13 of 15 green; m0-death (the client's own isDead, Eli's call) and
      m0-forge (no forge reference until the lab cell, Track L4) were red
      before it
