# Verb: time (the shared clock)

Part one of M1's "game time and globals, wait and sleep as server-owned
time" (docs/PLAN.md): one clock, owned by the server, shown by every client.
Per-player wait and sleep (decision 2) is part two. Other globals are
deferred (decision 4).

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
- **Days passed.** daysPassed = start.daysPassed + elapsed hours / 24.
- **Weekday.** The engine derives the weekday as uint(GameDaysPassed) % 7
  (CommonLibSSE-NG src/RE/C/Calendar.cpp:62-65). With Skyrim.esm's start
  (daysPassed 1.0 at 08:00), the weekday therefore turns at 08:00 game time.
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

daysPassed advances by one per real day, starting from `start.daysPassed` at
the epoch.

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
- **HYPOTHESIS: a written GameDaysPassed stays written.** The engine may
  rebuild GameDaysPassed from `rawDaysPassed` each frame. If it does, a
  client's write would not stick. T3 reads GameDaysPassed back on both
  clients and settles this.
- **The engine stops advancing GameDaysPassed itself.** Past about 64 game
  days, the engine's own GameDaysPassed stops advancing in real time; only
  save, load, rest and travel move it. Sources:
  - [Nexus forums, "GameDaysPassed Precision bug past 64 days"](https://forums.nexusmods.com/topic/13528839-gamedayspassed-precision-bug-past-64-days);
  - the cause is a single-precision float that no longer resolves one
    frame's increment (Goldberg, "What Every Computer Scientist Should Know
    About Floating-Point Arithmetic", ACM Computing Surveys 23(1), 1991).

  At 20 game days per real day, the server's clock passes 64 within four
  real days. So clients take daysPassed from the server; the engine's own
  value is never trusted.

## Observe, impose, suppress

- **Observe:** nothing. No client intent exists.
- **Impose:** TimeService writes GameYear, GameMonth, GameDay, GameHour,
  GameDaysPassed and TimeScale from the server's clock (Client, below).
- **Suppress:**
  - TimeService stops reading the PC clock and `hoursOffset`;
  - the TimeScale nudge goes;
  - local waiting stays disabled (setInChargen) until part two.

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
  | `daysPassed` | f32 | at least 0 |
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
  by the real time since receipt x timeScale: the hour and daysPassed move,
  and the date stays as sent.
  - **Midnight.** When the advanced hour reaches 24, a midnight has passed
    since the message. The client then waits for the next message (at most
    60 s away) instead of doing calendar arithmetic of its own.
  - **Hour and date.** Otherwise, if the engine's GameHour is a game minute
    or more off the target, or its date differs, the client writes GameYear,
    GameMonth, GameDay and GameHour.
  - **Days passed.** GameDaysPassed is written whenever it is off by a game
    minute (Engine surface).
  - **Time scale.** TimeScale is always the message's.
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
  - daysPassed;
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
  - a GameDaysPassed write that does not stick fails the daysPassed
    assertion.

## Status

- [x] decisions 1 to 4 settled (ADR-021; 4 deferred)
- [x] doc complete, rung declared
- [x] engine surface cited (Calendar.h); one HYPOTHESIS (GameDaysPassed
      writes) for T3
- [ ] server logic + T0
- [ ] message + validator (same commit)
- [ ] TS handler
- [ ] T2 green
- [ ] T3 scenario green, no HYPOTHESIS tags
- [ ] ledger updated (GetCurrentGameTime, WaitGameTime)
