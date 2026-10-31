# Verb: leveling

Drafted 02:2x PDT 2026-10-31 from docs/VERB.md (pile item 12 of docs/private/turbo-2-prework.md; M5 Progression's
first verb; actor-values.md records what M1 built). Nothing of it is built yet; the Status boxes say so.

## Intent

Skills rise by use and the character levels by skill gains, computed by the server from the game's documented
formulas and the game files' constants, written to the record and shown by every game; the player's own engine
advances nothing (SkyMP already turns its skill and level experience off), so there is one number for a skill on
every seat and across a restart.

Roadmap reference: skymp/ROADMAP.md "Skills" ("Disable the original leveling formulas and add the ability to level
skills for existing synchronizations") and "Perks and level up".
Milestone: M5   Class: A

## Inventory (ADR-031: the action's consequences, before its rung)

The action is "a skill use" (a hit landed, damage taken, a spell cast, a lock picked, an item made or sold) and its
two outcomes, a skill level and a character level. The reference trace is owed (lab/references/skill-use.json: a solo
game's One-handed from 15 to 16 with the recorder, the engine's own experience on). The records are the AVIF skill
entries (AVSK: skill use mult, skill use offset, skill improve mult, skill improve offset; CommonLibSSE-NG
ActorValueInfo.h:34-41) and the game settings fSkillUseCurve, fXPPerSkillRank, fXPLevelUpBase, fXPLevelUpMult.

| consequence | seen in | disposition |
| --- | --- | --- |
| the engine adds skill experience for an action (PlayerCharacter::AddSkillExperience; Actor::UseSkill) | engine | observed and reported (R1): the use's amount per action, the engine's own advance off (the mults zeroed, today's DisableSkillAdvanceService) |
| the skill's experience and level threshold on the player (PlayerSkills::Data::SkillData xp, levelThreshold) | engine | imposed: the server's numbers (R0) written through the actor-values path, so the Skills menu reads them |
| the skill level-up: the "Skill increased" message and sound, the skill's base up by one | engine | imposed: the server raises the base (R0, actor-values' SetActorValue path) and the client plays the message (a later slice for the sound) |
| the character experience bar and the level-up ("You have reached level N") | engine | imposed: xp, threshold and level written (R0); the engine shows its level-up when the threshold is met |
| the level-up's choice of health, magicka or stamina (+10) and the perk point | engine (the Stats menu) | later: a transaction verb (pile item 13's perks; the attribute pick with it) |
| the Legendary reset (a skill at 100 back to 15, the perks refunded) | engine | later: with the perk transactions |
| skill-dependent conditions in the world (dialogue, perks' ranks) | engine | native: the engine reads the base the server wrote |
| the skill books and trainers | engine | later: both are increments the server validates (a book read once, a trainer's gold and five a level) |

### Sequences and combinations (ADR-033)

| sequence or combination | probe or scenario | result |
| --- | --- | --- |
| a hundred One-handed hits at a person's rhythm, the level rising once | x-skill-use | |
| each skill's use shape reported once (a hit, a block, a cast of each school, a lock, a craft, a sale) | x-skill-use | |
| the level-up threshold met on both seats' displays after a relaunch and a restart | p-level-up | |
| two players raising skills at once (two records, no crosstalk) | p-level-up | |

## Authority

Rung: R1 for a skill use (the player's engine computes the action's base experience; the server bounds it), R0 for
the experience, the skill levels, the character experience and level (the server computes and writes), R3 for the
menus and messages.
Why this rung and not the one above it: the use's base amount depends on the action in the player's game (damage
dealt, magicka spent, gold traded) that the server sees only in part; the formulas from the amount up are the game's
and run on the server. Not R2 (the record would take any number).
What the server validates (R1): the skill is one of the eighteen (ActorValue 6 to 23); the amount is finite and
within the skill's cap per use (a table from the per-skill rules: damage dealt up to the weapon's base times a bound,
a cast's cost up to the spell's cost, a sale's gold up to the item's value times the count; UNMEASURED bounds from
the reference trace); the rate (at most 8 uses a second, UNMEASURED); a use of a skill whose action the server knows
nothing of (a hit the server never saw within the last second) is refused (E_SKILL_NO_ACTION, HYPOTHESIS that the
pairing is cheap: hits, casts and crafts already arrive).
Rate limit / bounds: as above; skills 15 to 100 (legendary resets later); the level up to 1000 (actor-values' bound).

## Engine surface

- CommonLibSSE-NG: `ActorValueInfo::Skill` (AVSK: useMult, offsetMult, improveMult, improveOffset;
  include/RE/A/ActorValueInfo.h:34-41, `skill` :86); `PlayerCharacter::AddSkillExperience(ActorValue, float)`
  (include/RE/P/PlayerCharacter.h:546; the id RELOCATION_ID(39413, 40488) in src/RE/P/PlayerCharacter.cpp:238-243, a
  cited source, not memory); `Actor::UseSkill(ActorValue, float points, TESForm*)` (include/RE/A/Actor.h:445, virtual);
  `PlayerCharacter::PlayerSkills::Data` (PlayerCharacter.h:410-457: xp, levelThreshold, skills[18] of SkillData {level,
  xp, levelThreshold}, legendaryLevels[18]); `ACTOR_BASE_DATA::level` (TESActorBaseData.h:69).
- Address Library IDs: the hook on the player's skill experience is AddSkillExperience's RELOCATION_ID(39413, 40488)
  from CommonLibSSE-NG's source (rule 1 satisfied: a cited source); its runtime address is Skyrim Platform's to
  resolve as its other hooks do (FridaHooks.cpp's shape).
- Skyrim Platform today: `skillIncrease {player, actorValue}` and `levelIncrease {player, newLevel}` events
  (skyrimPlatform.ts:502-523, :815-825), fired by the engine's own advance (off under SkyMP); `ActorValueInfo`
  natives getSkillUseMult :2195, getSkillImproveMult :2191, setSkillUseMult :2202, setSkillOffsetMult :2201;
  `Game.setGameSettingFloat` (fXPPerSkillRank 0 today). No event carries a skill use's amount: the native hook above is
  the new surface (an `skillUse {skill, amount}` event, filtered to the player in native, rule 9).
- The client today: disableSkillAdvanceService.ts zeroes every skill's use and offset mult and fXPPerSkillRank at the
  first update; actorValuesService.ts reports the whole snapshot on skillIncrease and levelIncrease (which never fire
  now).
- The server today: OnActorValues records the snapshot within bounds (R2; actor-values.md); ActorValueRecord holds
  bases, skills' progress, xp, threshold, level (ActorValueRecord.h); ActorValuesTest.cpp.
- libespm: AVIF read since fork m5-leveling bb0b37d8 (AVIF.h: the AVSK constants and the perk tree's nodes; EspmTest
  on One-handed 0x44c, Smithing 0x450 and AVDragonSouls 0x62c). The load order is the source: Skyrim.esm's Smithing
  AVSK reads 160, 0, 0.25, 300 but Update.esm overrides it to 1, 0, 0.25, 300, which the browser returns and UESP's
  table shows (the patched game); a read of one plugin alone is not the game's value (the two pipelines red on the
  160, 2026-10-31). The rule's Table takes the records and keeps UESP's numbers as the fallback.

## The formulas (UESP, Skyrim:Leveling, read 2026-10-31)

- A use's skill experience: `xp = skillUseMult * baseXp(action) + skillUseOffset` (AVSK's first two floats; the
  per-skill base action values: One-handed, Two-handed and Archery the weapon's base damage; Block the raw damage
  blocked (5 for a bash); Heavy and Light Armor the raw damage received; Destruction the base magicka cost plus the
  damage inflicted; Alteration, Conjuration, Illusion the base magicka cost; Restoration the damage healed, or the
  magicka used on non-healing spells; Enchanting 1 per item enchanted and 1 per 400 gold of a disenchanted item's
  enchantment; Smithing `count * (25 + 3 * value^0.65)` crafting and `3.8 * dValue^0.5 * dQuality^0.5` improving;
  Pickpocket 1 per gold stolen; Lockpicking 0.25 a broken pick and 2, 3, 5, 8 or 13 a lock picked by level; Sneak 2.5
  on becoming hidden, 0.625 a second hidden, 30 a melee sneak attack, 2.5 a ranged one; Alchemy 1 per gold of value
  made plus 1 per potion; Speech 1 per gold traded and 75 times the Speech level per check passed).
- The next skill level's cost: `cost(level) = skillImproveMult * (level - 1)^fSkillUseCurve + skillImproveOffset`,
  fSkillUseCurve 1.95 (AVSK's last two floats: 2 and 0 for most; Enchanting 1 and 170; Smithing and Lockpicking 0.25
  and 300; Pickpocket 0.25 and 250; Sneak 0.5 and 120; Alchemy 1.6 and 65).
- Character experience: `skillLevelGained * fXPPerSkillRank` (1) per skill level; the level's threshold
  `fXPLevelUpBase + level * fXPLevelUpMult` (75 + 25 * level, so `(level + 3) * 25`); a level-up grants +10 to one of
  health, magicka, stamina and one perk point (item 13); skills cap at 100 (Legendary to 15 later); the character
  level has no hard cap.
- The game files hold the eighteen AVSK rows and the four game settings; the table above is the doc's reading of
  UESP for the T0's expected numbers, the server reading the records themselves (libespm AVIF, or the settings
  fallback while that lands).

## Observe (host or acting client sees the intent before the engine acts)

- Hook point: a Skyrim Platform native hook on PlayerCharacter::AddSkillExperience (the one entry the engine's own
  skill uses funnel through; the game's own advance stays off since the mults are 0, so the hook's amount is the
  engine's base amount times 0: HYPOTHESIS to settle in the Dynamic plan: whether the mult is applied before or
  after this entry. If after, the hook sees the base amount; if before, the client re-enables the mults and the hook
  cancels the engine's write instead, reporting the amount).
- SP filter (minSelfId / maxSelfId / eventPattern): the player alone (the function is the player's), the skill 6 to
  23.
- Data captured: {skill, amount}, batched per second into one SkillUse message.
- Side effects of hooking here: HYPOTHESIS until a Frida trace of a solo game: no other caller of the entry.

## Impose (observers render the server's decision)

- Mechanism: the actor-values path (ActorValues MsgType 40, server to client: bases, skills' xp and thresholds, the
  character's xp, threshold and level), which the client applies today; the Skills menu and the HUD read them.
- Visual without simulation achieved by: the engine's own display of the written numbers; the "Skill increased"
  message played by the client on a base change the server made (a later slice for the sound).
- Side effects: HYPOTHESIS: the engine's own level-up prompt (the Stats menu's pick) fires when xp meets the
  threshold the server wrote; item 13 takes the pick.

## Suppress (engine's own behavior blocked on non-hosts)

- What is suppressed: the engine's own skill and level advance on every seat (today's DisableSkillAdvanceService
  keeps it off).
- How: the mults zeroed and fXPPerSkillRank 0 (as today), or the hook's cancel (the Dynamic plan decides).
- Release condition: none.
- Side effects: none new.

## Message contract

- Message name / numeric type: SkillUse, MsgType 63 (wire id 71), client to server, reliable: `{ uses: [{ skill: u8
  (6 to 23), amount: f32 }] }` (up to 18 entries, one per skill per second, the amounts summed). The server's answer is
  ActorValues (MsgType 40) as today. SCHEMA_VERSION 23 (fork m5-leveling 553863f8, 2026-10-31; locks' LockReport takes 64).
- Direction: C2S.
- Fields: as above.
- Validator rules: skill 6 to 23 and listed once (E_VAL_RANGE), amounts finite and within 0 to 1e6 (E_VAL_NONFINITE,
  E_VAL_RANGE); a budget of 8 then 2 a second (E_VAL_RATE).
- Idempotency / ordering: a use is a delta; a repeated message adds (the rate bounds the harm); the server's ActorValues
  reply is idempotent.
- Contract doc updated: docs/WIRE.md, same commit (rule 4).

## Server

- Where the logic lives: wire-rules leveling.rs (Rust, ADR-010): the eighteen skills' constants (from the AVIF rows
  when libespm reads them, else the settings' table), the per-use experience, the level costs, the character
  experience and threshold, the caps, the per-skill per-use bounds, the pairing with a known action (HYPOTHESIS);
  PartOne: the handler (OnSkillUse) feeding the rule from the actor's record, the record written through the
  actor-values path and sent (ActorValues to the player; the bases to the other seats as today's base changes go).
- DB fields / migration: none new (ActorValueRecord holds the numbers).
- Restart behavior: the record's numbers load as saved (actor-values' restart scenario).
- Papyrus natives touched (ledger lines added): none (AdvanceSkill and SetLevel exist on the console; their rung
  stays R0).
- Kill switch: server setting `leveling` (false: the server records snapshots as today and takes no SkillUse).

## Client

- SP binding: a native hook on AddSkillExperience exported as the `skillUse` event (filtered to the player).
- TS handler: skillUseService.ts batches the uses per second and sends SkillUse; the ActorValues apply as today;
  disableSkillAdvanceService stays (or the hook's cancel replaces it).
- Kill switch config key: `leveling` (server), mirrored by the login's settings.

## Tests

- T0: leveling.rs: the per-use experience for each skill shape, the level cost at 15, 50 and 99 against UESP's totals
  (528,804 for a 2 and 0 skill from 15 to 100; 91,600 Smithing; 278,852 Enchanting), the character threshold at
  levels 1, 10, 50, the level-up at the threshold with the overflow carried, the caps, the refusals by name;
  LevelingTest.cpp: a SkillUse raises the record's skill xp, a level gained writes the base and the character xp, the
  ActorValues reply carries them, the kill switch; a restart keeps them (actor-values' pattern).
- T1: none (the hook is a Skyrim Platform export; its proof is T3).
- T2: a difftest session with a SkillUse accepted and one refused.
- T3 scenario id: lab/scenarios/p-level-up.yaml (M5's exit): a seat's One-handed from 15 to 16 by hits on a lab NPC
  (the hits the server already judges), the "Skill increased" on its screen, the other seat's figure values and the
  record agreeing, a relaunch and a server restart keeping the level; a character level-up from a skill run (the
  threshold at level 1 is 100 xp: eight skill levels). Probe x-skill-use by path first (the hook's amounts against
  the formula on a dozen hits).
- Assertions that would fail if the verb silently regressed: a skill level on the record differing from the game's;
  a skill rising on a seat with leveling off; a level lost across a restart.

## Dynamic plan (fill when any tag above is still HYPOTHESIS)

- Frida script: lab/frida/skill-use.js: AddSkillExperience (RELOCATION_ID 39413 for 1.6.1170, resolved through
  addrlib by `just addr 39413`) on a solo seat with the engine's advance ON: the amounts per One-handed hit against
  the weapon's base damage and the AVSK mult (whether the mult is applied before the entry), per Block, per
  Destruction cast; the same with the mults zeroed (what the entry sees under SkyMP's switch). Owner: agent.
- Breakpoint plan for a human session: Actor::UseSkill's callers if AddSkillExperience is not the one funnel.
- Owner: agent (Frida); Eli for the Stats menu's pick (item 13).

## Status

- [ ] doc complete, inventory listed with a disposition per row, rung declared (the reference trace owed)
- [x] engine surface cited or delegated (headers and CommonLibSSE-NG's source; the Frida read planned)
- [x] server logic + T0 (fork m5-leveling, 2026-10-31: wire-rules leveling.rs with its Table (nine cases), libespm's AVIF reader (EspmTest), the bridge's LevelingTable (its case), PartOne's LoadSkillTable at AttachEspm, ApplySkillUse and the `leveling` switch, ActionListener::OnSkillUse; unit/LevelingTest.cpp's three cases ride the pipeline)
- [x] message + validator (same commit: SkillUse 63, check_skill_use, the budget, two fixtures, SkillUseMessage.h; m5-leveling 553863f8)
- [ ] native hook + T1
- [ ] TS handler
- [ ] T2 green
- [ ] T3 scenario green, no HYPOTHESIS tags
- [ ] parity scenario green, or its later list reviewed with it (ADR-031)
- [ ] sequences and combinations green, every checklist item with its scenario (ADR-033)
- [ ] ledger and suppression registry updated

## Open questions

- Which amounts the server can pair with an action it saw (hits, casts, crafts arrive; sneak seconds, gold traded and
  damage taken by armor do not yet): the first slice may take the reported amount under the per-skill bound alone
  (R1 by bounds), the pairing a hardening later.
- The AVIF rows from the game files (libespm) or the settings' table: the files are the one source; the table is the
  fallback the T0 can pin.
- Skill books, trainers, the Legendary reset and the level-up's pick: item 13's verb and later slices.
