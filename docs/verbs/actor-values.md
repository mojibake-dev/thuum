# Verb: actor-values

## Intent

A player's actor values and progress stay with its character across logins
and server restarts: every base value its game set (skill levels raised by
use, the health, magicka or stamina chosen at a level-up, carry weight), the
progress toward the next skill and character level, and the level itself.
The server can read and set any actor value of a player, from its Papyrus
natives and the gamemode, and the player's game shows the change.

Roadmap reference: skymp ROADMAP.md "ActorValues" ("Now only stamina, mana
and health, but you need to be able to manipulate all ActorValues on the
server side")
Milestone: M1 (Eli, 2026-10-05: the full ActorValue set stays in M1, with
the persistence work)   Class: B

## Authority

Rung: R2 for progress made in play, R0 for values the server sets.
- Play: the player's engine raises skills by use and the level by
  experience; the server records each report, bounded, not validated.
- Server: a Papyrus native or the gamemode sets or changes a value; the
  server records it and imposes it on the player's game.
Why not R1 for play: checking a skill gain needs the game's skill-use and
experience formulas server-side ([UESP, Skyrim:Leveling](https://en.uesp.net/wiki/Skyrim:Leveling)),
which is M5 Progression's verb (PLAN: "Disable the original leveling
formulas"). Until then a report is recorded unvalidated (rule 5).
Bounds: every value finite; an actor value's index below the engine's 164
(CommonLibSSE-NG include/RE/A/ActorValues.h, kTotal); a skill's base within
0 to 100, the game's ceiling for a base skill
([Skyrim:Skills](https://en.uesp.net/wiki/Skyrim:Skills)); a level within 1
to 1000; experience and thresholds 0 or more. Rate: a report per skill or
level increase, at most 4 at once and 1 a second after.

## Engine surface

- Actor values: `RE::ActorValue`, 164 of them (include/RE/A/ActorValues.h,
  kAggression 0 to kReflectDamage 163; skills kOneHanded 6 to kEnchanting 23;
  kHealth 24, kMagicka 25, kStamina 26; kCarryWeight 32).
- Reading and writing them: `RE::ActorValueOwner`
  (include/RE/A/ActorValueOwner.h): GetActorValue, GetPermanentActorValue,
  GetBaseActorValue, SetBaseActorValue, ModActorValue, RestoreActorValue,
  SetActorValue (which sets the base).
- The player's progress: `RE::PlayerCharacter::PlayerSkills::Data`
  (include/RE/P/PlayerCharacter.h, about line 440): character `xp` and
  `levelThreshold`; per skill (Skills::Skill, kOneHanded 0 to kEnchanting 17)
  a `SkillData` of `level`, `xp`, `levelThreshold`; `legendaryLevels[18]`.
  `PlayerCharacter::skills` holds it (same header, about line 509).
- The character level: `ACTOR_BASE_DATA::level`, a uint16 on the actor's
  base (include/RE/T/TESActorBaseData.h:69), read by `GetLevel`
  (TESActorBaseData.h:117).
- Skyrim Platform events: `skillIncrease` {player, actorValue} and
  `levelIncrease` {player, newLevel} (codegen skyrimPlatform.ts:502-523,
  :815-825).
- Papyrus semantics, measured with the game's own natives on the player as
  the oracle (thuum lab, x-av-probe 20261008-101643, 1.6.1170; Creation Kit
  wiki:
  [SetActorValue](https://ck.uesp.net/wiki/SetActorValue_-_Actor),
  [ModActorValue](https://ck.uesp.net/wiki/ModActorValue_-_Actor),
  [ForceActorValue](https://ck.uesp.net/wiki/ForceActorValue_-_Actor)):
  SetActorValue sets the base (Sneak 15 to 30, Health 100 to 150, current
  following); ModActorValue changes a permanent modifier and never the base
  (Sneak base 30, current and maximum 35; Health base 150, current and
  maximum 160); ForceActorValue sets the current value through that same
  modifier (Sneak base 30, current 40; Health base 150, current and maximum
  50). CONFIRMED. The server records bases only, so on a player its
  SetActorValue is R0 and its Mod and Force run in the player's own game
  (R2, the modifier the session's, not the record's).
- SkyMP's client turns skill and level experience off at its first update
  (skymp5-client disableSkillAdvanceService.ts: fXPPerSkillRank 0, every
  skill's use multiplier 0), so a skill never rises through play and
  Game.AdvanceSkill moves nothing (x-av-probe: magnitudes 10, 100 and 1000
  on Marksman left it at 15 with no experience). CONFIRMED. A skill changes
  only by the server (its natives, the console's SetAV) or a client-local
  call; the report path records what the game holds after either.
- Skyrim Platform refuses TESModPlatform's natives outside the Papyrus VM's
  context ("can't be called in this context", CallNativeApi.cpp), where a
  network message's handler runs: the client applies the server's record on
  the next update (x-av2-probe 20261008-102852 caught every apply failing
  inside the handler). CONFIRMED.
- Writing `PlayerSkills::Data` after a login shows in the Skills menu:
  CONFIRMED (x-av3-probe 20261008-132006 read the bases; Eli's playtest
  eleven, 2026-10-08: Archery 50 and One-Handed 45 in the Skills menu
  after a relaunch). Whether the next skill use continues from the
  written experience, and everything about a level above 1 (what the
  console's SetLevel writes, `ACTOR_BASE_DATA::level`, and whether the
  Stats menu, the HUD and leveled lists follow it) belong to M5,
  Progression (Eli, 2026-10-08: "keep leveling in 5 with progression"):
  in M1 SkyMP's client keeps skill experience off, so nothing raises a
  skill by use or a level, and the server serves no SetLevel. The level
  and progress are recorded and restored all the same.
- A base health, magicka or stamina set after a login does not fight
  SkyMP's own health sync (ChangeValues carries percentages; the server's
  ActorValues keeps the recorded base as the maximum): CONFIRMED
  (x-av-health-probe 20261008-234952: Health's base set from 100 to 250
  by the server's SetActorValue; c1's game read base 250 and current 250
  at full 6 s later, 30 s later and after a relaunch).

## Observe (host or acting client sees the intent before the engine acts)

- Hook point: Skyrim Platform's `skillIncrease` and `levelIncrease` events on
  the player, and the close of the LevelUp and Stats menus, filtered to the
  player before anything is read (rule 9).
- Data captured: one call to a new native returning the 164 base values and
  the progress block, compared with the last one sent; sent when it differs.
- Side effects of hooking here: none seen (events only): a-actor-values
  green (run 20261008-111013) and the merge sweep 29 of 29 on its build.

## Impose (observers render the server's decision)

- After a login (the map-markers login hook) the server sends the player its
  record; the client sets the bases, the progress and the level through new
  Skyrim Platform natives, after the first inventory sync, like favorites.
- After a server-side change (a Papyrus native, the gamemode), the same
  message with the new record; the client applies it.
- A server-set value holds against a stale report: the server takes a
  report for that value only once it matches what was imposed.
- The same holds for the whole record a login sends: the player's game
  starts each session on the race's values (a fresh generated save), so a
  skill increase reported before the record is applied would carry those
  defaults. Every value the login sends is held until a report matches it,
  and the client reports nothing until it applied the record (as favorites
  holds its list until the server's arrives).
- Other players see nothing new: their figures already show health, magicka
  and stamina through SkyMP's percentages.

## Suppress (engine's own behavior blocked on non-hosts)

- Nothing.

## Message contract

- Message name / numeric type: ActorValues, the next free MsgType (39 is
  taken by the RaceMenu sync verb's design; 40 here).
- Direction: both. Client to server: the player's report. Server to client:
  the record after a login or a server-side change.
- Fields: `bases`: up to 164 of {av: u8, base: f32}; `skills`: up to 18 of
  {skill: u8, level: f32, xp: f32, threshold: f32}; `xp: f32`,
  `threshold: f32`; `level: u16`; `legendary`: up to 18 of {skill: u8,
  count: u16}. The whole snapshot each time (idempotent, like Favorites).
- Validator rules: the Authority bounds; no actor value or skill twice
  (E_VAL_RANGE); 4 at once, 1 a second after (E_VAL_RATE).
- Idempotency / ordering: a later snapshot replaces the earlier one;
  ReliableOrdered.
- Contract doc updated: when the message lands.

## Server

- Where the logic lives: Rust, wire-rules `actor_values` (bounds, the
  merge of a report into the record, the hold on server-set values); the C++
  core keeps the record in the player's change form and answers the
  natives.
- DB fields / migration: `actorValueBases` (absent in older records, read
  as none: the race's and the base NPC's values, as today), `progress`,
  `level`. Health, magicka and stamina use the recorded base as the maximum
  when present (damage and percentages, R0).
- Restart behavior: the record survives in the change form; a scenario
  proves it.
- Papyrus natives touched (ledger lines added): Actor.GetActorValue,
  GetBaseActorValue, GetActorValueMax (today missing), SetActorValue
  (today delegated, its result not saved), ModActorValue, ForceActorValue
  (today missing); each R0 on a player. They need every actor value's
  Papyrus name (the server's ConvertToAV knows three): read from the game's
  own AVIF records with lab/esm.py, or the engine's ActorValueList through
  the re-analyst, never typed from memory (rule 1). CONFIRMED 2026-10-07
  (run 20261007-022013-x-racemenu-probe2, steps/025 and 026): av-table read
  all 164 actor values' form ids (ActorValueInfo.GetActorValueInfoByID), and
  av-names checked each Skyrim.esm AVIF editor ID less its "AV" through
  SKSE's GetActorValueInfoByName: 140 names find the form their editor ID
  names, none finds another. 24 indices have no confirmed name: nine
  editor IDs whose names find nothing (Mysticism, NormalWeaponsResist,
  EquippedItemCharge, EquippedStaffCharge, Muffled, CombatHealthRegenMultMod,
  CombatHealthRegenMultPowerMod, HealRatePowerMod, MagickaRateMod) and 15
  forms with no AVIF record in Skyrim.esm (0x3f5, 0x5e0, 0x5e1, 0x5e6,
  0x5ea, 0x5ee, 0x5ef, 0x5fc, 0x60b, 0x62f, 0x63c, 0x644, 0x647, 0x648,
  0x649). They sync by index like the rest; the server's natives refuse
  them by name as unknown until the engine's own names are read (the
  re-analyst, ActorValueInfo's enum name on sky-re).

- The natives, as built (fork m1-actor-values 04cd5da6, 2026-10-08). On a
  player (IsCreatedAsPlayer) every one is R0 against the record:
  GetBaseActorValue reads the record's base (or a value the server set and
  holds), GetActorValue the same for any value but Health, Magicka and
  Stamina, which are the server's percentage of their maximum; the
  maximum of those three is the recorded base once there is one (the
  engine's own, raised by level-ups), the race's and the base NPC's before.
  SetActorValue sets the base through wire-rules actor_values::set_ok
  (finite, within ±1e6; a skill past 100 is the server's to set), holds it
  against the player's stale reports and sends the record. ModActorValue
  runs in the player's own game (delegated: a modifier, never the base, so
  the record does not move), and so does ForceActorValue on a player; on
  any other actor ForceActorValue moves Health, Magicka or Stamina's
  current value within the maximum, else it is delegated (the semantics
  measured under Engine surface, x-av-probe 20261008-101643). A value
  the server sets before the player's first report waits in the hold and
  enters the record with that report, which is sent back; the client now
  also reports when a loading screen closes, so every player has a record
  seconds into its session. Names resolve through wire-rules
  actor_values::index_of (the 140 the lab confirmed); a name it does not
  know reads 0 with one log line and, for Set, Mod and Force, goes to the
  host as SetActorValue always did. Any actor but a player keeps that
  delegation (R2) for everything but the three attributes. Ledger rows in
  docs/NATIVES.md.

## Client

- SP binding: TESModPlatform natives, one call each: GetActorValueBases
  (Float[164]), SetActorValueBases (pairs), GetPlayerProgress and
  SetPlayerProgress (packed floats), SetPlayerLevel.
- TS handler: skymp5-client ActorValuesService (the events above; the
  message; apply after the first inventory sync).
- Kill switch config key: `actorValuesSync` in skymp5-client-settings.

## Tests

- T0: wire-rules bounds, merge and hold; the change form round trip; the
  login send; each server native.
- T1: none (no harness); the scenario is the proof, as for favorites.
- T2: a report out of bounds, or a value twice, changes nothing a client
  receives (difftest session).
- T3 scenario id: lab/scenarios/a-actor-values.yaml (207a762, approved by
  Eli 2026-10-08): the server's own SetActorValue sets One-Handed and
  Archery (Papyrus name Marksman: the game's names, not the menu's, are
  what natives take; wire-rules actor_values::NAMES) and c1's game shows
  both; its ModActorValue leaves the base, the game's own meaning; the
  server restarts and c1 relaunches on a fresh save, and both bases come
  back. Training a skill by play (Papyrus Game.AdvanceSkill, in Skyrim
  Platform `Game.advanceSkill`, codegen skyrimPlatform.ts:2606) is M5's,
  with leveling: SkyMP's client keeps skill experience off.
- Assertions that would fail if the verb silently regressed: after the
  relaunch, c1's One-Handed base and experience and its Archery base, read
  through Papyrus (GetBaseActorValue) and the player's skill data, not
  through the verb's own natives.

## Dynamic plan (fill when any tag above is still HYPOTHESIS)

- Frida script: none first; a lab probe applies a written progress block
  and level, opens the Stats menu (screenshot) and advances a skill once,
  then reads the experience back.
- Breakpoint plan for a human session: none expected.
- Owner: agent.

## Status

DONE on fork parity 26acffc4 (2026-10-08), after the merge sweep on that
build: 29 of 29 green (runs 20261008-132148 to -150004).

- [x] doc complete, rung declared (leveling moved to M5 by Eli,
      2026-10-08)
- [x] engine surface cited or delegated: the Papyrus names confirmed (140
      in wire-rules actor_values::NAMES), Set, Mod and Force measured,
      the skills shown after a login and a server-set base Health against
      SkyMP's health sync confirmed; SetLevel and the level's effects are
      M5's
- [x] server logic + T0 (fork m1-actor-values, stacked on m1-racemenu and
      rebased once before its merges began: wire-rules actor_values
      a84f535f and 16d87b09, the record, the holds and the login send
      ebeab290, the record's ordering 45ac5c82; unit/ActorValuesTest.cpp
      green in fork pipelines 874 and 882 (c19de24c); the difftest session
      actor-values a4e0cd14 for T2)
- [x] message + validator (same commit, 3919f4aa: ActorValues, MsgType
      40, wire id 48, SCHEMA_VERSION 9)
- [x] native hook (40a28072: TESModPlatform GetActorValueBases,
      SetActorValueBase, GetPlayerProgress, SetPlayerProgress); T1: none
- [x] TS handler (40a28072: ActorValuesService)
- [x] the server's Papyrus natives (Get, GetBase, GetMax, Set, Mod, Force on
      a player; fork 04cd5da6, unit/ActorValuesTest.cpp "A player's actor
      value natives read and set the server's record" and "A value set
      before the player's first report enters the record with that
      report"; the first test's later reports now carry Health as a
      client's whole snapshot does, 69750429, after MSVC's run 37752078184
      read 0.75 for 0.5; ctest green on Linux in pipeline 1007, which runs
      the same commits on m1-light-plugins)
- [x] T2 green (`just test-proto m1-light-plugins`, 2026-10-08, the
      actor-values session among the 15, identical up to its declarations)
- [x] the record reaches the game: applied on the next update (51c995b8;
      x-av2-probe 20261008-110553 read CarryWeight 400 and One-Handed 45
      in c1's game after the server set them)
- [x] T3 scenario green, no HYPOTHESIS tags: a-actor-values (thuum
      207a762) green in run 20261008-111013 for the bases, the server's
      sets and Mod, and the record across a restart and a relaunch. The
      record's skill progress and level now apply without an error through
      the scalar natives SetPlayerSkill and SetPlayerExperience, declared in
      the committed TESModPlatform.pex (7f77b42d; x-av3-probe
      20261008-132006: the base shows, the console history holds no
      ActorValuesService error). What a level above 1 does in the game
      moved to M5 with leveling (Eli, 2026-10-08); the base Health check
      green (x-av-health-probe 20261008-234952). DONE: no tag left
- [x] ledger and suppression registry updated (four NATIVES rows)
