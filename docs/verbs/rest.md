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
- **Beds are unconfirmed.** Whether sleeping in a bed is blocked too is engine
  behavior still to confirm in the lab.
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
- **HYPOTHESIS: what time the engine regenerates over during a rest.** It
  may be the rest's game seconds (3,600 per hour) or their real-time
  equivalent at the time scale (180 per hour at 20). Both restore fully at
  the base rates. They differ only when a rate is lowered. The Dynamic plan
  below measures it.

## Authority

- **R1 for the rest itself.** The client reports that its player rested,
  and for how many hours and of which kind. The server validates it:
  - hours in [1, 24], the menu's range;
  - the player alive;
  - no hit dealt or taken by that player in the last 10 seconds, as the
    server saw them. This is the server's stand-in for the engine's "not
    with enemies nearby", which only the client can see. The 10 seconds is
    a setting and a choice, not an engine number.
  - No further rate limit. Rests one after another cannot heal past full,
    and the combat check keeps a rest from being an in-fight heal. The
    message's rate limit stops floods.
- **R0 for its effect on the record.** The server computes the recovery:
  each attribute's regeneration over the rested hours, at the rates
  CropRegeneration already uses (the race's and the actor's rate and rate
  multiplier). The time it regenerates over follows the engine, which the
  Dynamic plan measures; until then, game seconds. It writes the new
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

## Dynamic plan

What the lab measures before the rule's time base loses its HYPOTHESIS tag:
- c1 sets its HealRateMult to 1 percent (set-av), takes damage to half
  health, waits one hour through the menu, then dumps its health.
- Game seconds predict +25.2 percent (0.70 percent x 0.01 x 3,600). The real-time
  equivalent predicts +1.26 percent (0.70 percent x 0.01 x 180).
- The same run with the menu on two hours tells a cap from a rate.

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
- **T3 (a-rest):** c1, hurt to half, waits two hours through the real menu.
  - Afterwards the server's record shows it recovered.
  - Both clients' clocks are still the server's (a-time's assertions).
  - It needs lab-driver to drive the Sleep/Wait menu. tap-key worked on the
    race menu's lists but not its finish box, so this is the open risk.

## Conventions adopted

Neither question this draft first put to Eli needed him: the baseline
answers both (Eli, 2026-10-04: "is there not a baseline convention for
resting in the tool anyway?").

- **Where rest is allowed.** The game's own rules, as above, plus
  TES3MP's switches, on by default.
- **The rested bonus.** It is a skill-gain multiplier, so it lives with skill
  gains: in the client's engine until M5.

## Open

- TES3MP's switches as server settings (allowWait, and allowBedRest as
  allowSleep; Skyrim has no wilderness sleep): not built yet. Both are on in
  TES3MP's own defaults, which is today's behaviour.

## Status

- [x] design reviewed (conventions: Eli, 2026-10-04)
- [x] doc complete, rung declared (R1 rest, R0 recovery)
- [x] server logic + T0 (wire-rules rest and its tests; RestTest in
      ctest, on CI)
- [x] message + validator (same commit, fork e9797e2d)
- [x] TS handler (TimeService; the Windows build compiles it)
- [ ] T2 green
- [ ] T3 scenario green, no HYPOTHESIS tags
