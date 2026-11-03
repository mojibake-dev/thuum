# Verb: weather

Drafted 00:4x PDT 2026-10-31 from docs/VERB.md (pile item 10 of docs/private/turbo-2-prework.md; M4's "weather and
time as server globals"), built the same morning on fork m4-weather (stacked on m4-locks for the message id). The
time verb (docs/verbs/time.md) is the shape it mirrors: a pure function of the clock, nothing persisted.

## Intent

Every player in a worldspace sees the same weather, picked by the server on its game clock from the game files'
weather lists for that worldspace, kept across a restart by construction, and never rolled by a seat's own engine.

Roadmap reference: skymp/ROADMAP.md "Weather" ("Learn how weather changes work in the original game and do the
same").
Milestone: M4   Class: C (cosmetic; docs/research/m4/scope-cut.md:23 says DEFER; the pile builds it behind a switch)

## Inventory (ADR-031: the action's consequences, before its rung)

The action is the sky changing: a weather chosen, a transition, the sound and the precipitation. The records (read
from Skyrim.esm with lab/esm.py, 2026-10-31): WRLD Tamriel 0x3c's CNAM names CLMT 0x812 SkyrimClimate, whose WLST
holds ONE weather (SkyrimCloudy 0x12f89 at 100), so the climate is not where the sky's variety lives; it lives in
the forty weather regions (REGN, editor ids Weather*: WeatherTundra 0xc5858 with six RDWT entries, WeatherFallForest,
WeatherReach, WeatherSnow, WeatherCoast, WeatherMountains, the cities', Sovngarde's one), each naming its worldspace
(WNAM) and its weathers with chances (RDWT, 12 bytes an entry: WTHR, percent, an unused global; UESP, "Skyrim
Mod:Mod File Format/REGN" and "/CLMT"). The engine picks by the region the player stands in; the server pools a
worldspace's regions into one list (chances summed) and picks once per worldspace, the geography a later refinement
(TES3MP syncs per region; see Known limits).

| consequence | seen in | disposition |
| --- | --- | --- |
| the engine rolls the next weather from the region's list on its own clock | engine | suppressed on every seat: the server's weather forced (Weather.forceActive) or blended into (setActive) |
| the transition between weathers over its time | engine | native (the engine blends into the server's pick at its own pace) |
| rain, snow, fog, the sky's sound | engine | native |
| the weather's effects on gameplay (Survival's cold, visibility) | engine | native, from the forced weather |
| the weather at login and on entering a worldspace | code | imposed: the server's word at login (after the player's own CreateActor) and at each place change |
| the sky in an interior | engine | native: the server releases its override there (a weather of 0) and forces again on the way out |
| the weather in a save (Skyrim Platform writes climate and weather into the login save, LoadGame.cpp:187-212, but hardcodes none, LoadGameApi.cpp:199) | code | the client re-forces the server's word two seconds after any drift from it (a load, a mod) |

### Sequences and combinations (ADR-033)

| sequence or combination | probe or scenario | result |
| --- | --- | --- |
| both seats the same weather at login | x-weather A, b-weather | |
| a change reaches both seats as a blend | x-weather B, b-weather | |
| an interior releases; the way out cuts | x-weather C | |
| a seat relaunched hears the current sky at its login | x-weather D, b-weather | |
| a restart keeps the sky and its next change | x-weather E (recorded), b-weather | |

## Authority

Rung: R0 (the server picks and keeps; the clients render).
Why this rung and not the one above it: none above R0.
What the server validates: nothing from clients (no client message).
Rate limit / bounds: one pick per worldspace per slot of `changeGameMinutes` (1 to 1440, default 120); a pool of 1
to 64 weathers; one word per player per place entered and per change stood through.

## Engine surface

- CommonLibSSE-NG: `Sky::SetWeather`, `ForceWeather`, `ReleaseWeatherOverride` (include/RE/S/Sky.h:72-75;
  currentClimate, currentWeather, overrideWeather :87-91); `TESClimate::weatherList` (TESClimate.h:87);
  `TESRegionDataWeather` (TESRegionDataWeather.h:29).
- Skyrim Platform: the Weather class (skyrimPlatform.ts:3576-3592): forceActive(abOverride), setActive(abOverride,
  abAccelerate), getCurrentWeather, getOutgoingWeather, getCurrentWeatherTransition, releaseOverride; no
  Game.setWeather. ObjectReference.getWorldSpace and getParentCell name the place.
- The lab: the `weather` step (lab/driver/src/index.ts: force, release, or `{read: true}` for the current, the
  outgoing and the blend's progress); guests.yaml names SkyrimClear 0x81a and SkyrimFog 0xc821e.
- The time verb's parts mirrored: wire-rules clock.rs (a pure function of the clock, who has heard it), PartOne
  TickGameTime and the login push, SetGameTimeMessage (MsgType 34), timeService.ts.
- libespm: REGN.h/.cpp (new: WNAM and the RDWT list; Browser indexes REGN for GetRecordsByType); WRLD's CNAM was
  already read and stays unused; no WTHR or CLMT reader (none needed: the WTHR id is all a seat needs).

## Observe

- Hook point: none (R0).

## Impose

- Mechanism: the S2C `SetWeather { place: u32, weather: u32, transition: bool }` (MsgType 66), reliable, to one
  player: at login (after its CreateActor), when it enters a place (the server sees the cell change at the next
  half-second tick), and at each change of the pick for its worldspace. `place` is the worldspace, or the interior
  cell a release is for; `weather` 0 releases the override. The client forces the weather (forceActive, a cut) on a
  login or a place change, blends into it (setActive with the engine's own pace) on a change it stood through, and
  keeps the override (the engine's own rolls off).
- Visual without simulation achieved by: the engine's own rendering of the forced weather.
- Side effects: a release in an interior is harmless (the interior has its own sky): CONFIRMED by x-weather v2
  20261031-171309 (the server's "user 1 hears 0 for 371de slot 0 (release)", the seat's "weather released in 371de
  (word)", Bleak Falls Temple's own torchlit sky in the screenshot, no error after); Weather.getCurrentWeatherTransition
  reads below 1 through a blend: CONFIRMED (0.65 and 0.58 mid-blend on both seats within 0.01 of each other, 1 with
  outgoing 0 once settled). CONFIRMED by b-weather's legs 3b and 3c (b-weather 20261101-102038 and 20261101-105309, both
  GREEN on m5-perks 487e1262, the gate 20261101-104201-merge-m5-perks that put weather on parity 2026-11-01; settled
  19:26 PST 2026-11-02): the override survives a cell change within the worldspace (x-weather's seats never left lab-spawn's cell; the
  scenario moves c1 to Riverwood, where its "weather released" count stayed at the interior's 1 and it read c2's sky,
  0x12f89 in 105309 and 0x81a in 102038), and the client leaves a blend alone and re-forces any drift, blending or settled
  (the first rule re-forced a settled one alone and never fired while a blend ran, b-weather 20261101-091049 red at step 52,
  the guard gone at 487e1262; the scenario forces SkyrimOvercastRain 0xc821f on c1 through the driver's weather step and
  read the one re-apply, "re-applied 1" once and c1 back on c2's sky within 10 s in both runs).

## Suppress

- What is suppressed: the engine's own weather roll on every seat (the override), while the server speaks.
- How: the forced weather's override; releaseOverride at the server's word (an interior, a worldspace without a pool).
- Release condition: the `weatherSync` switch off (nothing is sent; the games' overrides stand until a relaunch).
- Side effects: a seat whose game lags the server's change shows the blend late by one message; a seat that leaves
  an interior sees its engine's own sky for the half second before the server's cut.

## Message contract

- Message name / numeric type: SetWeather, S2C, reliable, MsgType 66 (wire id 74), `{ place: u32, weather: u32,
  transition: bool }`; validator (validate_server): place never 0 (`E_VAL_RANGE`); weather may be 0 (a release).
  SCHEMA_VERSION 25. Fixtures 66-SetWeather-0/1.json. No client message.
- Idempotency / ordering: idempotent; the last word stands; a word for a place the game is not in yet is kept and
  applied on arrival there.
- Contract doc updated: docs/WIRE.md (SetWeather, t 66).

## Server

- Where the logic lives: wire-rules weather.rs: the pools per worldspace (the files' regions merged, or the settings'
  pinned list), the slot (`floor(days passed * 1440 / changeGameMinutes)`), the pick (a chance-weighted draw by a
  splitmix64 hash of (seed, worldspace, slot), never the previous slot's weather when the pool has two or more
  entries, so a two-entry pool alternates), and who has heard which (place, slot, weather) for the words: a place
  change cuts, a slot change that moves the weather blends, a slot change that keeps it says nothing, an interior or
  a worldspace without a pool releases once. wire-bridge WeatherSync (new_weather_sync, set_pool, due, forget,
  pool_len). PartOne: LoadWeatherPools at AttachEspm (every REGN with weathers, keyed by its WNAM through the lookup's
  global ids; "[verb:weather] pools from the game files: N weather region(s) over M worldspace(s)"),
  SetWeatherSettings (server-settings.json's `weather` block: `changeGameMinutes`, `seed`, `pools` keyed by a
  worldspace as "3c:Skyrim.esm" or "0x3c" with entries {weather, chance}; a pinned pool outranks the files'; a bad
  key stops the server, named), SendWeatherWord at login and TickWeather every 500 ms ("[verb:weather] user U hears
  W for P slot S (cut|transition|release)"), forget at the disconnect. The switch `weatherSync` (ScampServer.cpp,
  default false).
- DB fields / migration: none. The pick is a function of the clock, the pool and the seed, so a restart recomputes
  the same sky (rule 6 by construction, as the clock).
- Restart behavior: the same weather after the restart; every player hears it again at its login.
- Papyrus natives touched: none (Weather natives on the server are later).

## Client

- SP binding: none new.
- TS handler: weatherService.ts: applies SetWeather (release, cut or blend) when the player's place matches, keeps a
  word for another place until the player gets there, and every two seconds re-forces a drift from the word, blending or settled.
  Lines: "weather applied W to P (cut|transition, word|late|re-applied N)", "weather released in P", "weather word
  for P kept".
- Kill switch config key: `weatherSync` (server). The client needs none: no word, no override.
- The late apply (the update tick, every 2 s) waits one tick from a word's arrival, so the word's own deferred apply runs
  first (a transition blends); a word kept for a place this game is not in yet applies late at the exit as before
  (m4-weather f73de11a, from x-weather 171309's double login apply).

## Tests

- T0: wire-rules weather.rs (six cases: slots from day 0, a two-entry pool alternates and a pool of one stands, the
  chain is a pure function of seed, worldspace and slot asked in any order, chances weight the draw, a player's words
  by place and slot with forget, pools merging and pinning with every refusal); unit/WeatherTest.cpp (the login word
  once and again after a relaunch, the interior's release, the switch off, bad settings named);
  unit/EspmTest.cpp's REGN case (WeatherTundra's shape, SovngardeIntWeather exact); wire-validate and wire-json cases.
- T2: the login session carries one SetWeather per client (difftest divergences.yaml, t 66, legacy 0 and wire 1);
  lab/tools/test-proto.sh pins T2's pool to one weather over Tamriel and a slot of a game day so no session straddles
  a change.
- T3 scenario id: lab/scenarios/b-weather.yaml, after the lab-api grammar gains a weather fact (the driver's read
  answers current, outgoing, transition; lab-api exposes none yet, so the probe claims through the seats' log counts):
  both seats outdoors read the same weather within 10 s of a server change; a relaunched seat reads it after login; a
  restart keeps it. Probe x-weather v1 by path first (legs A to E above).
- Assertions that would fail if the verb silently regressed: two seats reading different weathers outdoors; a weather
  changing by a seat's own roll under the switch; no blend line within a slot's length.

## Dynamic plan

- x-weather v1 by path (the lab's pool: SkyrimClear 0x81a and SkyrimCloudy 0x12f89 over Tamriel, a slot of ten game
  minutes, 30 s real at the clock's scale of 20): A the login words on both seats and the server's hears lines; B a
  change within 45 s as a blend on both; C an interior (Bleak Falls Temple) releases and the way out cuts; D a
  relaunched seat hears the sky at its login; E a restart (recorded: the hears lines name the same weather). The
  three HYPOTHESIS tags above are read from its console lines and screenshots.
- x-weather v2 (9f7c2cfd) GREEN at 20261031-171309 on m4-weather a1c203df's own build (an agent's read, 10:42 PDT): the
  login cut on both (81a at slot 193 to c1, 12f89 at 194 to c2), a transition word to both every 30 s (slots 195 to 201)
  applied on both consoles within the same second, eighteen transition applies all by the word (a blend) and none forced;
  the reads gave both seats the same current and outgoing sky with the blend's progress within 0.01 (0.65/0.66, then
  0.58/0.58); the interior's release and the way out's cut (late, after "weather word for 3c kept: this game is in
  371de"); c2's relaunch heard 12f89 at its login and read it settled (77705, 0, 1). The restart leg showed the slot's
  pick, not "the same sky": the lab's restart re-pins the hour (runner.py writes the clock's epoch anew for
  server.gameHour 7.9), so the slot rewound from 201 to 192 and both seats read 12f89 (slot 192's pick, as at the run's
  start). One finding: every fresh game applied its login word twice, "(cut, late)" then "(cut, word)" 18 ms apart (the
  update tick's late apply ran before the message handler's deferred apply, so a transition word landing on a due tick
  would be forced instead of blended): fixed at m4-weather f73de11a (the late apply waits one tick from the word's
  arrival; a word kept for another place still applies late at the exit).

- The drift watcher's rule (01:43 PST 2026-11-01, fork m5-perks 487e1262, b-weather 20261101-091049's read): every 2 s, a word applied for
  the place the player stands in is compared with the engine's current weather, which is a blend's target from the blend's
  first frame; equal, nothing (our own transition); anything else, settled or blending, is a drift and the word goes back on
  as a cut ("weather applied ... (cut, re-applied N)"). The earlier guard on the blend's progress silenced the watcher through
  a forced 24 s blend until the next 30 s slot's word absorbed it, so "re-applied" never fired; the lab's `weather` step
  forces by a blend (setActive accelerate, HYPOTHESIS inert at the engine's own rate). The login's word applies once: the
  late path marks it and the deferred word apply steps aside.

## Known limits

- One weather per worldspace: the regional geography (snow in the north, rain in the Rift) is folded into one pool.
  TES3MP syncs weather per region with a per-region authority; the pool per region and the point-in-polygon lookup
  (REGN RPLD) are the refinement if a playtest wants the regions back.
- The weather's chance weights are the lists' percents summed over the worldspace's regions, so the cities' short
  lists weigh as much as the tundra's.

## Status

- [x] doc complete, inventory listed with a disposition per row, rung declared
- [x] engine surface cited or delegated (the code map of 2026-10-31; the records read from the master file)
- [x] server logic + T0 (weather.rs, WeatherTest, EspmTest's REGN case)
- [x] message + validator (same commit)
- [x] native hook + T1 (none)
- [x] TS handler (weatherService.ts)
- [ ] T2 green
- [ ] T3 scenario green, no HYPOTHESIS tags (the probe x-weather v2 GREEN 20261031-171309; b-weather on thuum main dbdbed5b with the two
      hypotheses' legs 3b and 3c, its first run at the train's gate)
- [ ] parity scenario green, or its later list reviewed with it (ADR-031)
- [ ] sequences and combinations green, every checklist item with its scenario (ADR-033)
- [x] ledger and suppression registry updated (none)

Play: MECHANISM ONLY; playtest 41 (2026-11-02, break 2), Eli: "weather SEEMS ok but no promises".
