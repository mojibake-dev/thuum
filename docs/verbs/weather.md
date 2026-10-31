# Verb: weather

Drafted 02:4x PDT 2026-10-31 from docs/VERB.md (pile item 10 of docs/private/turbo-2-prework.md; M4's "weather and
time as server globals"). From a code map of the fork at parity dc3ec679. Nothing of it is built. The time verb
(docs/verbs/time.md) is the shape to mirror.

## Intent

Every player in a worldspace sees the same weather, picked by the server on its clock from the game files' climate
for the region, kept across a restart, and never rolled by a seat's own engine.

Roadmap reference: skymp/ROADMAP.md "Weather" ("Learn how weather changes work in the original game and do the
same").
Milestone: M4   Class: C (cosmetic; docs/research/m4/scope-cut.md:23 says DEFER; the pile builds it behind a switch)

## Inventory (ADR-031: the action's consequences, before its rung)

The action is the sky changing: a weather chosen, a transition, the sound and the precipitation. The records: CLMT
(the climate's weather list with chances by time of day; TESClimate.h:87 weatherList), REGN's RDWT (a region's
weathers and chances; TESRegionDataWeather.h:29), WTHR (the weather's classification), WRLD's CNAM climate
(libespm WRLD.cpp:26-27, read and unused).

| consequence | seen in | disposition |
| --- | --- | --- |
| the engine rolls the next weather from the region's list on its own clock | engine | suppressed on every seat: the server's weather forced (Weather.forceActive) |
| the transition between weathers over its time | engine | native (the engine transitions to the forced weather) |
| rain, snow, fog, the sky's sound | engine | native |
| the weather's effects on gameplay (Survival's cold, visibility) | engine | native, from the forced weather |
| the weather at login and after a cell change between worldspaces | engine | imposed: the server's word at login (with SetGameTime) and at each change |
| the weather in a save (Skyrim Platform writes climate and weather into the login save, LoadGame.cpp:187-212, but hardcodes none, LoadGameApi.cpp:199) | code | later: the login save could carry it; the first slice forces it after the load |

### Sequences and combinations (ADR-033)

| sequence or combination | probe or scenario | result |
| --- | --- | --- |
| both seats the same weather after a relay | b-weather | |
| a seat relaunched mid-weather sees the current one | b-weather | |
| a restart keeps the weather and its next change | b-weather | |

## Authority

Rung: R0 (the server picks and keeps; the clients render).
Why this rung and not the one above it: none above R0.
What the server validates: nothing from clients (no client message).
Rate limit / bounds: the pick at the game's weather change rate (the climate's transition times; a change at most
every 10 game minutes).

## Engine surface

- CommonLibSSE-NG: `Sky::SetWeather`, `ForceWeather`, `ReleaseWeatherOverride` (include/RE/S/Sky.h:72-75;
  currentClimate, currentWeather, overrideWeather :87-91); `TESClimate::weatherList` (TESClimate.h:87);
  `TESRegionDataWeather` (TESRegionDataWeather.h:29).
- Skyrim Platform: the Weather class (skyrimPlatform.ts:3575-3592): forceActive(abOverride), setActive(abOverride,
  abAccelerate), getClassification, findWeather, getCurrentWeather, getOutgoingWeather, releaseOverride; no
  Game.setWeather.
- The lab: the `weather` step (lab/driver/src/index.ts:2114-2127: setActive(true, true) or releaseOverride);
  guests.yaml names SkyrimClear 0x81A and SkyrimFog 0xC821E; no scenario uses it yet.
- The time verb's parts to mirror: wire-rules clock.rs (RESYNC_MS :31, Clock :128), PartOne TickGameTime
  :1492-1506 and the login push :429-434, SetGameTimeMessage (MsgType 34), timeService.ts (every 2 s).
- libespm: no WTHR, CLMT or REGN reader (to add: CLMT's weather list with chances, REGN's RDWT; WTHR's
  classification for the lab's facts).

## Observe

- Hook point: none (R0).

## Impose

- Mechanism: a new S2C `SetWeather { weather: u32 (the WTHR form id), transition: bool }`, reliable, at login (after
  SetGameTime), at each server change, and to a seat entering a worldspace; the client forces it (Weather.forceActive
  on a cut, setActive(true, true) for a transition) and keeps the override (the engine's own rolls off).
- Visual without simulation achieved by: the engine's own rendering of the forced weather.
- Side effects: HYPOTHESIS: forceActive under an interior cell is harmless (the interior has its own sky); the
  override survives a cell change.

## Suppress

- What is suppressed: the engine's own weather roll on every seat (the override).
- How: the forced weather's override; releaseOverride only when the switch is off.
- Release condition: the switch.
- Side effects: a seat whose game lags the server's change shows the transition late by one message.

## Message contract

- Message name / numeric type: SetWeather, S2C, reliable, MsgType after the pile's others; `{ weather: u32, transition:
  bool }`; validator: weather never 0 (validate_server). SCHEMA_VERSION bumped with it.
- Idempotency / ordering: idempotent; the last word stands; sent after SetGameTime at login.
- Contract doc updated: docs/WIRE.md with the build.

## Server

- Where the logic lives: wire-rules weather.rs: the pick (the region's or the climate's list with chances, seeded by
  the server's clock so a restart repeats the same sequence, the transition times), the current weather per
  worldspace; PartOne: the tick (as TickGameTime), the login push, the message; the settings `weatherSync` (the
  switch) and `weather` (a per-worldspace list of WTHR ids with chances as the fallback while libespm reads no CLMT).
- DB fields / migration: the current weather and its next change per worldspace in the world's settings record (as
  the clock's epoch is kept), rule 6 with a-restart-persistence.
- Restart behavior: the same weather after the restart (the seed and the clock).
- Papyrus natives touched: none (Weather natives on the server are later).

## Client

- SP binding: none new.
- TS handler: weatherService.ts: applies SetWeather (force or transition), re-applies after a load and when the
  worldspace changes; the `weather` lab step reads it.
- Kill switch config key: `weatherSync` (server), mirrored.

## Tests

- T0: weather.rs: the pick's distribution over a list, the seeded sequence repeating from the same clock, the change
  interval; PartOne: the login message after SetGameTime, the switch.
- T2: the login session carries SetWeather.
- T3 scenario id: lab/scenarios/b-weather.yaml: both seats outdoors read the same weather (the lab's `weather` step's
  read: getCurrentWeather) within 10 s of a server change; a relaunched seat reads it after login; a restart keeps it.
- Assertions that would fail if the verb silently regressed: two seats reading different weathers outdoors; a weather
  changing by a seat's own roll under the switch.

## Dynamic plan

- No engine read owed beyond the override's behavior (x-weather by path: force, change, interior, cell change).

## Status

- [ ] doc complete, inventory listed with a disposition per row, rung declared
- [x] engine surface cited or delegated (the code map of 2026-10-31)
- [ ] server logic + T0
- [ ] message + validator (same commit)
- [x] native hook + T1 (none)
- [ ] TS handler
- [ ] T2 green
- [ ] T3 scenario green, no HYPOTHESIS tags
- [ ] parity scenario green, or its later list reviewed with it (ADR-031)
- [ ] sequences and combinations green, every checklist item with its scenario (ADR-033)
- [x] ledger and suppression registry updated (none)
