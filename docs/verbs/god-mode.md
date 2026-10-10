# Verb: god-mode

## Intent

An admin's TGM and TIM work in multiplayer: god mode takes no damage and
spends no arrows, immortal mode takes damage but cannot die, each decided by
the server for everything the server computes.

Roadmap reference: skymp/ROADMAP.md "Console commands" (typed as in the
original game, with permissions).
Milestone: M2 (Eli, docs/private/decisions-m2.md question 1, the fourth
verb; the console table's row, docs/verbs/console-commands.md)   Class: B

## Authority

Rung: R0. Each flag is the server's, set by the console verb's rank check
(admin, docs/verbs/console-commands.md); the server's damage, arrow and
death rules read it.
What each does, by UESP's Console page (en.uesp.net/wiki/Skyrim:Console,
2026-10-10): TGM, "No damage taken, no magicka consumed, no stamina used, no
encumbrance, unlimited arrows, no shout cooldown"; TIM, "Everything behaves
as normal except you cannot die as a result of being reduced to 0 health".
Split by who computes each:
- the server's (R0): damage one actor deals another (ADR-028: weapons,
  arrows, spells, effects through magic-effects), the arrow a shot spends
  (marksman), death at no health, a shout's cooldown (the shouts verb);
- the player's own game (R3, by its own god mode): magicka and stamina
  spent, encumbrance; the server sets that game's god mode with the flag
  (Skyrim Platform's Debug.setGodMode, skyrimPlatform.ts:2459), so its
  reports (ChangeValues, R2 decreases) follow.
Why not R1: a console command is an intent with no simulation behind it
(the console verb's rule).
Rate limit / bounds: the console budget (four at once, one a second).

## Engine surface

- God mode in the player's own game: a global flag, read by
  PlayerCharacter::IsGodMode (CommonLibSSE-NG
  include/RE/P/PlayerCharacter.h:542, src/RE/P/PlayerCharacter.cpp:22-26),
  set by Papyrus Debug.SetGodMode (bound by Skyrim Platform,
  skyrimPlatform.ts:2459).
- Immortal mode: no CommonLib symbol and no Papyrus counterpart (the
  console verb's survey); not needed: the server keeps an immortal
  player's health above nothing, so neither the server nor that player's
  game ever registers a death. HYPOTHESIS: what the engine's own TIM shows
  at no health (UESP's note: decapitation and dragon kill moves can still
  kill), which the server need not copy.
- The server's paths: OnWeaponHit's damage and OnSpellHit through the
  effect rule (ActionListener.cpp), the effect rule's detrimental changes
  (MpActor::ApplyEffects, AdvanceEffects), the arrow a shot spends
  (ActionListener.cpp:1609), death at no health (MpActor::SetPercentage
  and SetPercentages, MpActor.cpp:705-745, MpActor::Kill :1663).

## Observe (host or acting client sees the intent before the engine acts)

- Hook point: the console verb's (the typed command reaches the server as
  ConsoleCommand; skymp5-client's consoleCommandsService).
- SP filter: as the console verb's.
- Data captured: the command and its caller.
- Side effects of hooking here: none new.

## Impose (observers render the server's decision)

- Mechanism: the server's numbers as now (ChangeValues); for TGM, an
  SpSnippet Debug.SetGodMode on the caller's own game, on and off with the
  flag; the console's own line back (ConsoleOutput: the game's own text,
  "God Mode ON" and "God Mode OFF", HYPOTHESIS until the lab reads the
  game's console).
- Visual without simulation: nothing new (observers see the same hits land
  and do nothing).
- Side effects: none expected.

## Suppress (engine's own behavior blocked on non-hosts)

- What is suppressed: the game's own TGM and TIM typed into the console
  stay the server's (the console verb routes them; a player without the
  rank is refused, its game untouched).
- How: the console verb's routing.
- Release condition: none.
- Side effects: none.

## Message contract

- No new message: ConsoleCommand in, ConsoleOutput and SpSnippet out, as
  the console verb has them.
- Validator rules: unchanged.
- Idempotency / ordering: a toggle; the server answers with the state it
  set.
- Contract doc updated: no change.

## Server

- Where the logic lives: the console rules (wire-rules console: TGM and TIM
  in the table, admin) and two flags on the actor, read by the damage rules
  (a god target takes no damage from another actor; its detrimental
  effects change nothing), marksman's arrow take (a god shooter spends
  none) and the death rule (an immortal actor's health stops above nothing,
  no kill).
- DB fields / migration: none. HYPOTHESIS that the game keeps neither flag
  in a save; the server keeps them for the session (cleared at the
  player's departure), which a restart scenario checks.
- Restart behavior: both flags off after a restart.
- Papyrus natives touched: none on the server; Debug.SetGodMode by
  SpSnippet to the caller's game (client side, already bound).

## Client

- SP binding: none new (Debug.setGodMode by snippet).
- TS handler: none new (the snippet service).
- Kill switch config key: none (the console table is the server's).

## Tests

- T0: the console rules (TGM and TIM an admin's, refused for a player); the
  server (a god target's health unchanged by a weapon hit, a spell hit and
  a running poison; a god shooter's arrows unspent; an immortal target at a
  lethal hit stays alive above nothing; both flags off after a departure).
- T1: none.
- T2: a difftest session: c1 typing tgm, then c2's hit: the legacy server
  takes the damage; declared.
- T3 scenario id: lab/scenarios/b-god.yaml: c1, an admin, types tgm; c2's
  arrow and Firebolt leave c1 at full health on the server and in its
  game; c1's own shot spends no arrow; tgm again, and c2's next arrow hurts.
  c1 types tim; c2 deals a lethal hit: c1 alive on both sides. c2, a
  player, types tgm: refused.
- Assertions that would fail if the verb silently regressed: c1's health
  after each hit, c1's arrow count, c1 alive after the lethal hit.

## Dynamic plan (fill when any tag above is still HYPOTHESIS)

- In b-god's first run: c1's console lines after tgm (the game's own
  text, through the console step's printed lines), c1's own magicka after a
  Firebolt under god mode (the engine's god mode spending none).
- Owner: agent.

## Status

Doc written 2026-10-10, before any code. Building on fork branch m2-god,
stacked on m2-effects (it merges after magic-effects): d6a02abf the server
(the console table serves TGM and TIM; the flags for the session, cleared at
the departure; Debug.SetGodMode to the caller's game; no damage to a god
target from a weapon or an effect, a buff's maximum still moving; no arrow
spent by a god shooter; an immortal actor's health stopped at one point, its
game told so; GodModeTest); b1d1e3dd the difftest session. The client
already routes tgm and tim to the server (consoleCommandsService.ts,
serverOnlyCommands), so no client build. Left: CI, T2, b-god.

- [x] doc complete, rung declared
- [x] engine surface cited or delegated (cited; HYPOTHESIS for the lab: the
      game's own console text, the engine's TIM at no health, and the game
      keeping neither flag in a save)
- [ ] server logic + T0
- [ ] message + validator (same commit)
- [ ] native hook + T1
- [ ] TS handler
- [ ] T2 green
- [ ] T3 scenario green, no HYPOTHESIS tags
- [ ] ledger and suppression registry updated
