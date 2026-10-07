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
- Papyrus semantics, for the server's natives (HYPOTHESIS until a T0 and a
  lab read agree: the wiki refused this machine's fetches): SetActorValue
  sets the base, ModActorValue changes it, ForceActorValue sets the current
  value, Damage and Restore move the current value within the maximum
  (Creation Kit wiki:
  [SetActorValue](https://ck.uesp.net/wiki/SetActorValue_-_Actor),
  [ModActorValue](https://ck.uesp.net/wiki/ModActorValue_-_Actor),
  [ForceActorValue](https://ck.uesp.net/wiki/ForceActorValue_-_Actor)).
- HYPOTHESIS: writing `PlayerSkills::Data` after a login shows in the Skills
  menu and the next skill use continues from the written experience.
- HYPOTHESIS: setting `ACTOR_BASE_DATA::level` on the player's base is what
  the console's SetLevel does, and the Stats menu, the HUD's level and
  leveled lists follow it. No Papyrus function sets a level; the
  re-analyst reads SetLevel's console handler on sky-re.
- HYPOTHESIS: a base health, magicka or stamina set after a login does not
  fight SkyMP's own health sync (ChangeValues carries percentages; the
  server's ActorValues keeps the race's starting value as the maximum).

## Observe (host or acting client sees the intent before the engine acts)

- Hook point: Skyrim Platform's `skillIncrease` and `levelIncrease` events on
  the player, and the close of the LevelUp and Stats menus, filtered to the
  player before anything is read (rule 9).
- Data captured: one call to a new native returning the 164 base values and
  the progress block, compared with the last one sent; sent when it differs.
- Side effects of hooking here: none expected (events only). HYPOTHESIS until
  the scenario runs.

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
  the re-analyst, never typed from memory (rule 1).

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
- T3 scenario id: lab/scenarios/a-actor-values.yaml. c1 trains One-Handed by
  play's own path (Papyrus Game.AdvanceSkill, in Skyrim Platform as
  `Game.advanceSkill(asSkillName, afMagnitude)`, codegen skyrimPlatform.ts:2606;
  that it adds experience as use does, per the Creation Kit wiki's
  [AdvanceSkill](https://ck.uesp.net/wiki/AdvanceSkill_-_Game), is a
  HYPOTHESIS until the scenario runs) until its level rises; the server
  records it; a server-side SetActorValue sets
  Archery; the server restarts and c1 relaunches; c1's game shows both, and
  One-Handed's experience is where it was.
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

- [ ] doc complete, rung declared
- [ ] engine surface cited or delegated (four HYPOTHESIS tags; SetLevel and
      the actor values' Papyrus names to look up)
- [x] server logic + T0 (fork m1-actor-values: wire-rules actor_values
      8ebc5f91 and e5549cfc, the record, the holds and the login send
      d7e73cd9; unit/ActorValuesTest.cpp)
- [x] message + validator (same commit, 4fb8fe6a: ActorValues, MsgType
      40, wire id 48, SCHEMA_VERSION 9)
- [x] native hook (a4b5b457: TESModPlatform GetActorValueBases,
      SetActorValueBase, GetPlayerProgress, SetPlayerProgress); T1: none
- [x] TS handler (a4b5b457: ActorValuesService)
- [ ] the server's Papyrus natives (Get, Set, Mod, Force on a player)
- [ ] T2 green
- [ ] T3 scenario green, no HYPOTHESIS tags
- [x] ledger and suppression registry updated (four NATIVES rows)
