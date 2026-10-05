# Verb: rest (time part two; on fork branch m1-rest)

Part two of M1's "game time and globals, wait and sleep as server-owned
time" (docs/PLAN.md), following time part one (docs/verbs/time.md). ADR-021
decision 2 governs it: waiting and sleeping are per player and never move
the shared clock; the player gets the rest's effects for themselves. The
design's conventions were approved with Eli's "These are fine"
(2026-10-04). The code is on fork branch m1-rest; T3 is open.

## Intent

A player can wait or sleep as in the game. Their health, magicka and stamina
recover as the rest would recover them, and the world's clock, the other
players and the server's record of time do not move.

Roadmap reference: SkyMP ROADMAP.md "Wait" ("Players should be able to
sleep/wait if all players on the server are willing to do so"). ADR-021
decision 2 replaced that with per-player rest.
Milestone: M1   Class: B

## What happens today

- **Waiting is disabled.** skymp5-client's enforceLimitationsService.ts calls
  Game.setInChargen(true, true, false) at the first update and at every game
  load. Its second argument disables waiting.
- **Beds work once, sleep as a wait, and give no Rested effect.** Eli's
  second playtest (2026-10-04) slept in the hunters' camp bedrolls
  (Skyrim.esm 0x000B3184 and 0x000B3185). Three gaps:
  - **A bed works once per player.** SkyMP's server records a bed's occupant
    at activation and releases it only on the client's second activation.
    The client sends that once the player has entered and left the furniture
    (remoteServer.ts, getFurnitureReference). A vanilla bed opens the sleep
    menu without the player entering it, so the release never comes. Every
    later activation logged "occupant is already this object ... Blocking
    because it's FURN" (MpObjectReference::CheckIfObjectCanStartOccupyThis).
  - **A sleep is reported as a wait.** TimeService sets the report's sleep
    flag from the same furniture test, so both sleeps logged "waited 1 h".
  - **No Rested effect.** SkyMP's client blocks Papyrus events in the local
    game (blockPapyrusEventsService.ts), so the game's own sleep script never
    sees a sleep end, and never grants Rested.
  - The earlier "never reached the server" result (runs 20261004-212438 and
    -214508) was a bedroll Dawnguard.esm deletes (0x000CE5F9), not a SkyMP
    gap.
- **A stuck wait, not reproduced.** In the second playtest, after a 6-hour
  wait test 2 could look around but not move, open menus or wait again. That
  is what Game.DisablePlayerControls blocks with its defaults. Three lab
  probes did not reproduce it, and lab-driver now reads the engine's controls
  (dump-state `controls`). After each wait all four controls read true and
  the player walked:
  - a plain 6-hour wait (run 20261005-062647);
  - a fight, then a 6-hour wait three minutes later (-063140);
  - a 6-hour wait 3500 units from an attacker whose figure was still in
    combat, on the build where fights never end (-095456) and on the one
    where they do (-094935);
  - the playtest's own order, which the first three missed: its server log
    has test 2 waiting 6 hours at 06:12:23Z and playtest-start teleporting
    both players and setting half health at 06:13:07Z, 44 s later. Replayed
    with a hit first and the same 44 s (-182350), c2's controls read true and
    it walked.
  Not the idle-client memory leak found the same day
  (lab/deploy/sky-client/README.md): test 2's game had been running 16 to 21
  minutes (launched 05:56:58Z), about 5 to 6.5 GB of a 12 GB client.
  If a playtest hits it again, `just probe <client>` reads the client's
  controls with nothing reset.
- **The server would undo a rest's healing.** It crops a client's health and
  magicka reports to what regeneration allows over at most 2 s
  (docs/verbs/attributes.md; ActionListener::OnChangeValues,
  CropRegeneration.cpp). A rest that restores a player in one step is
  therefore cropped back. Stamina reports are recorded unvalidated (R2).
- **The client's clock already snaps back.** Since part one, a wait that
  moved the client's engine clock is pulled back to the server's within
  2 s of the menu closing. TimeService takes that path for any engine ahead
  of the server, and sets the day count back through SetGameDaysPassed.

## Engine facts

- **Regeneration.** Health regenerates 0.70 percent of its maximum per
  second outside combat and 0.49 percent in combat
  ([UESP, Skyrim:Health](https://en.uesp.net/wiki/Skyrim:Health)).
- **A rest restores fully, normally.** "Sleeping or waiting fully restores
  your health": under normal circumstances it takes 142.86 seconds to heal to
  full, "well under the hour minimum of waiting or sleeping" (the same page).
  The menu's minimum is therefore one hour.
- **What time the engine regenerates over during a rest: measured.** At time
  scale 20, the default, the engine gives a rest 360 seconds of
  regeneration per game hour, linear in hours. That is neither the rest's
  game seconds (3,600) nor their real-time equivalent (180). At time
  scale 10 it gave about 457 a game hour, a dependence on the time scale
  that the rule does not follow yet (see Measured).

## Authority

- **R1 for the rest itself.** The client reports that its player rested,
  and for how many hours and of which kind. The server validates it:
  - hours in [1, 24], the menu's range;
  - the player alive;
  - no hit dealt or taken by that player in the last 10 seconds, as the
    server saw them. This is the server's stand-in for the engine's "not
    with enemies nearby", which only the client can see. The 10 seconds is
    a setting and a choice, not an engine number. Eli's playtest showed it
    alone lets a victim rest 10 s after the last hit, because only the
    attacker's game marks the other an enemy. ADR-023 shares the hostility
    with the victim's game (a verb of its own), and the 10 s rule stays as
    the backstop.
  - No further rate limit. Rests one after another cannot heal past full,
    and the combat check keeps a rest from being an in-fight heal. The
    message's rate limit stops floods.
- **R0 for its effect on the record.** The server computes the recovery:
  each attribute's regeneration over the rested hours, at the rates
  CropRegeneration already uses (the race's and the actor's rate and rate
  multiplier), over 360 seconds per hour, as the engine gives at the
  default time scale. It writes the new
  percentages and sends them to the player, as every attribute change
  does (MpActor::NetSetPercentages).
- **R3 for the client's own world.** The engine's local jump in time during
  the menu stays on the resting client. That covers its view of weather and
  of NPC schedules, and the clock snaps back afterwards.
- **The rested bonus goes where skill gains go.** Sleep's bonuses are a
  multiplier on skill gains for eight game hours: Rested 5 percent, Well
  Rested 10 in an owned bed, Lover's Comfort 15
  ([UESP, Skyrim:Beds](https://en.uesp.net/wiki/Skyrim:Beds)). Skill gains
  are the client engine's until M5 computes them on the server (R0), so the
  engine applies the bonus where the gains happen. It moves with them in
  M5.

## Design

- **Client: allow waiting.** EnforceLimitationsService's
  setInChargen(true, false, false) keeps saving disabled and allows waiting.
  The lab confirms whether beds follow.
- **Client: observe the rest, in TimeService.** TimeService corrects the
  engine's clock every 2 s, which would pull a wait back while it runs, so
  the two are one mechanism:
  - While the Sleep/Wait menu is open (its name is "Sleep/Wait Menu",
    RE::SleepWaitMenu::MENU_NAME in CommonLibSSE-NG
    include/RE/S/SleepWaitMenu.h:16), the correction holds off.
  - After the menu has been open, the whole hours the engine's day count
    runs ahead of the server's clock are the rest. TimeService sends a
    RestIntent with them, capped at 24, then corrects the clock as before.
  - `sleep` is true when the player is still in furniture, the bed it slept
    in. Only the log and the rested bonus care, and the bonus is the
    client's anyway.
  - Only a Sleep/Wait menu counts, so a fast travel's hours are corrected
    without a rest.
- **Wire:** RestIntent, MsgType 35 (wire id 43, SCHEMA_VERSION 4), client
  to server, reliable. Fields: hours (f32) and sleep (bool).
  - The validator refuses non-finite hours (E_VAL_NONFINITE), hours outside
    1 to 24 (E_VAL_RANGE), and more than two at once or one a second after
    (E_VAL_RATE).
  - Message and validator shipped in one commit (rule 4), fork e9797e2d.
- **Server:** wire-rules `rest` (ADR-020) holds the checks and the
  recovery. ActionListener::OnRestIntent gathers the facts and asks it
  through the bridge:
  - the facts are the hours, death, and the last hit the player dealt or
    took. MpActor already recorded hits dealt; it now records hits taken too.
  - A rest let through sets each attribute to its regeneration over the
    rested hours, at CropRegeneration's own rates (now getters both use),
    and sends ChangeValues to the player.
  - Refusals log E_REST_HOURS, E_REST_DEAD or E_REST_FIGHTING.
- **Where rest is allowed** is the game's own rule, which the engine
  enforces: wait anywhere, sleep in a bed, bedroll or hay pile, and neither
  with enemies nearby or while trespassing
  ([UESP, Skyrim:Beds](https://en.uesp.net/wiki/Skyrim:Beds)). TES3MP's
  switches come on top as server settings, all on by default as TES3MP
  ships them (CoreScripts 0.8.1 scripts/config.lua:82-89, applied per player
  at login in eventHandler.lua:550-552): allowWait, allowBedRest,
  allowWildernessRest.

## Measured (2026-10-04)

lab-driver's afterRest reads the player's attributes on the first frame
after the Sleep/Wait menu closes, before the server's answer to the
client's RestIntent can arrive, so it shows the engine's own recovery. c1's
HealRateMult was 1 percent (set-av), its health half.

| run | time scale | wait | health gained |
| --- | --- | --- | --- |
| 20261004-095556 | 20 | 1 hour | 0.0252 |
| 20261004-095556 | 20 | 2 hours | 0.0506 |
| 20261004-100415 | 10 | 1 hour | 0.0320 |

- **The real-time rate**, run 20261004-100002: at HealRateMult 1 percent,
  health climbed 0.0020 in 30 real seconds, about 0.007 percent a second,
  UESP's 0.70 at 1 percent. At 100 percent the 10 s window read low: health
  regeneration waits a few seconds after a change.
- **So a rested hour is 360 seconds of regeneration at time scale 20.** The
  server's rule uses that (fork 142493d7).
- **At time scale 10 it was about 457.** Neither twice the real-time
  equivalent (720) nor a tenth of the game seconds (360) fits both runs.
  The rule keeps 360, which is right at the default and at the lab's
  setting. A server on another time scale gets 360 too: a difference only
  with a lowered rate, since at base rates any rest restores fully.

## Tests

- **T0:**
  - cargo: the recovery rule;
  - cargo: the validator's ranges and rate;
  - ctest: a RestIntent heals the record and sends ChangeValues; a refused
    one does nothing.
- **T2:**
  - the fakeclient sends a RestIntent and labState shows the healed
    percentages;
  - difftest declares the new message once (the legacy server has none).
- **T3 (a-rest):** c1, hurt to half, waits an hour through the real menu.
  - Afterwards the server's record shows it recovered.
  - Both clients' clocks are still the server's (a-time's assertions).
  - lab-driver drives the Sleep/Wait menu with tap-key: T (DirectInput 0x14)
    opens it and Enter (28) accepts its default hour (run 20261004-093837).

## Conventions adopted

Neither question this draft first put to Eli needed him: the baseline
answers both (Eli, 2026-10-04: "is there not a baseline convention for
resting in the tool anyway?").

- **Where rest is allowed.** The game's own rules, as above, plus
  TES3MP's switches, on by default.
- **The rested bonus.** It is a skill-gain multiplier, so it lives with skill
  gains: in the client's engine until M5.

## Server settings

TES3MP's switches, server-settings.json's `rest` block (fork 43b51ef1):
`{"allowWait": true, "allowSleep": true}`, both on when the block or a key
is missing, as TES3MP ships them. allowSleep is TES3MP's allowBedRest;
Skyrim has no wilderness sleep, so TES3MP's allowWildernessRest has no
counterpart, and an unknown key stops the server at start, named, as the
clock's `time` block does. A switched-off kind is refused, E_REST_OFF.

## Status

- [x] design reviewed (conventions: Eli, 2026-10-04)
- [x] doc complete, rung declared (R1 rest, R0 recovery)
- [x] server logic + T0 (wire-rules rest and its tests; RestTest in
      ctest, on CI)
- [x] message + validator (same commit, fork e9797e2d)
- [x] TS handler (TimeService; the Windows build compiles it)
- [x] T2 green (2026-10-04, image m1-rest): the rest session diverges as
      declared (the wire grants the rest after the fight window; a rest
      inside it is refused on both), the eight others unchanged
- [x] T3 scenario green: a-rest, run 20261004-094211 on 1.7.104 and run
      20261004-094636 on 1.6.1170. The exploratory run 20261004-093837 drove
      the real menu: T opened "Wait how long?" at 1 hour, Enter accepted,
      and the server logged "Rest: user 2 actor ff000000 waited 1 h,
      percentages now 1 1 1"
- [x] no HYPOTHESIS tags: the time base measured (360 s a game hour at
      time scale 20); its dependence on other time scales is measured once
      (time scale 10) and written down as not followed
- [ ] scenario reviewed by Eli (a-rest, thuum 7b12fa7)
