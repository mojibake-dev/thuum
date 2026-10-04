# Verb: rest (draft; time part two)

Part two of M1's "game time and globals, wait and sleep as server-owned
time" (docs/PLAN.md), following time part one (docs/verbs/time.md). ADR-021
decision 2 governs it: waiting and sleeping are per player and never move
the shared clock; the player gets the rest's effects for themselves. Nothing
here is built. This is the design, for review before code.

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

## Authority

- **R1 for the rest itself.** The client reports that its player rested,
  and for how many hours and of which kind. The server validates it:
  - hours in (0, 24];
  - not more often than the hours rested allow;
  - the player alive and not in a menu the server can see.
- **R0 for its effect on the record.** The server computes the recovery:
  each attribute's regeneration over the rested hours, at the rates
  CropRegeneration already uses for the race, in game time over the hours.
  It writes the new percentages and sends them to the player and its
  neighbours.
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

- **Client: allow waiting.** setInChargen(true, false, false) keeps saving
  disabled and allows waiting. The lab confirms whether beds follow.
- **Client: observe the rest.** Record the Sleep/Wait menu's open and close
  (Skyrim Platform menuOpen and menuClose; the menu's name is to be read in
  the lab). Measure the hours as the engine's game hours across the menu,
  from GameDaysPassed before and after, and the kind from whether the player
  is in bed furniture. Then send a RestIntent.
- **Wire:** RestIntent, a new message on the SkyMP family's next MsgType,
  client to server, reliable. Fields: hours (f32, in (0, 24]) and sleep
  (bool).
  - The validator refuses non-finite and out-of-range values (E_VAL_RANGE)
    and rate-limits the message.
  - Message and validator ship in the same commit (rule 4).
- **Server:** a Rust rule (ADR-020) computes the recovery from the hours
  and the race's regeneration rates. The core gathers the facts, writes the
  percentages, and sends ChangeValues.
- **Where rest is allowed** is the game's own rule, which the engine
  enforces: wait anywhere, sleep in a bed, bedroll or hay pile, and neither
  with enemies nearby or while trespassing
  ([UESP, Skyrim:Beds](https://en.uesp.net/wiki/Skyrim:Beds)). TES3MP's
  switches come on top as server settings, all on by default as TES3MP
  ships them (CoreScripts 0.8.1 scripts/config.lua:82-89, applied per player
  at login in eventHandler.lua:550-552): allowWait, allowBedRest,
  allowWildernessRest.

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
  - Afterwards the server's record shows it recovered, and c2 sees it
    recovered.
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

## Status

- [ ] design reviewed
- [ ] doc complete, rung declared
- [ ] server logic + T0
- [ ] message + validator (same commit)
- [ ] TS handler
- [ ] T2 green
- [ ] T3 scenario green, no HYPOTHESIS tags
