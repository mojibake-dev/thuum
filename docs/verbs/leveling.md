# Verb: leveling

Drafted 00:3x PDT 2026-10-31 from docs/VERB.md (pile item 12 of docs/private/turbo-2-prework.md; M5 Progression's
first verb; actor-values.md records what M1 built). MERGED to fork parity b6748da0 at 16:20Z 2026-10-31 (numidium's verb-merge:
the gate 20261031-153419 green 10 of 10 in 11 runs with p-level-up 154211, a-actor-values and b-figure-values, c-riverwood green on
its watch rerun; T2 beside); the Status boxes say what each tier read, the HYPOTHESIS tags what the playtest still owes.

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
| a skill book read: the skill one level up, the bar keeping its share, the character credited, the base form marked read | engine (IncrementSkill at the Book Menu's open, the re-analyst's static read 2026-11-02) | imposed (R0): the server's one-level increment once per book per character (the record's readBooks), the record sent so the seat's own rise is the server's number (the Skill books section; fork m5-skill-books 38659a3e, 2026-11-02) |
| the trainers | engine | later: an increment the server validates (a trainer's gold and five a level) |

### Sequences and combinations (ADR-033)

| sequence or combination | probe or scenario | result |
| --- | --- | --- |
| a hundred One-handed hits at a person's rhythm, the level rising once | x-skill-use | |
| each skill's use shape reported once (a hit, a block, a cast of each school, a lock, a craft, a sale) | x-skill-use | |
| the level-up threshold met on both seats' displays after a relaunch and a restart | p-level-up | GREEN 152612 (c1's level 2 and base 27 after the relaunch and the restart; the other seat's display of a figure carries no level) |
| two players raising skills at once (two records, no crosstalk) | p-level-up | GREEN 152612 (the target's record stayed at 20 through 168 hits on it; both raising at once is the playtest's) |
| a skill book read once, read again, read after a relaunch and after a restart (one level the first time, the record back every time, the other seat untouched) | x-skill-book by path, then b-skill-book | |

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
  engine's base amount times 0: READ (x-skill-use-read v3, 2026-10-31: the engine hands the hook the action's base amount, 7.0 for an iron sword, and the use mult is the server's formula's) on
  after this entry. If after, the hook sees the base amount; if before, the client re-enables the mults and the hook
  cancels the engine's write instead, reporting the amount).
- SP filter (minSelfId / maxSelfId / eventPattern): the player alone (the function is the player's), the skill 6 to
  23.
- Data captured: {skill, amount}, batched per second into one SkillUse message.
- Side effects of hooking here: READ 2026-10-31: the solo trace (x-skill-use-read v3) fired once per landed hit and the two-seat runs
  (x-skill-use 151047, 151449) sent no use before the first hit and one per hit after, so no other caller showed at load or in play.

## Impose (observers render the server's decision)

- Mechanism: the actor-values path (ActorValues MsgType 40, server to client: bases, skills' xp and thresholds, the
  character's xp, threshold and level), which the client applies today; the Skills menu and the HUD read them.
- Visual without simulation achieved by: the engine's own display of the written numbers; the "Skill increased"
  message played by the client on a base change the server made (a later slice for the sound).
- Side effects: HYPOTHESIS: the engine's own level-up prompt (the Stats menu's pick) fires when xp meets the
  threshold the server wrote; item 13 takes the pick.
  (p-level-up 152612: the screenshot about 8 s after "reaches character level 2" shows no HUD toast, the engine's lasting about
  5 s, so unread here; the Skills menu's level-up on a seat is Eli's T4 read in turbo 2's item 3)

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
- A server set of a skill's base (the console's SetAV, a script's Actor.SetActorValue: MpActor::SetActorValueBaseByServer)
  moves the record's progress entry with the base since m5-skill-set (2026-10-31): the level set, no experience toward the
  next, the threshold the skill table's cost of that step (WorldState::skillLevelCost, installed by PartOne); the base is the
  progress level shown, and before this the skill's next use recomputed the base from the old progress and the set snapped
  back (found writing x-lockpick v4's Lockpicking 100). wire-rules actor_values::skill_index names the progress index.
- Kill switch: server setting `leveling` (false: the server records snapshots as today and takes no SkillUse).
- DB fields / migration, since the Skill books section (2026-11-02): `readBooks` on the actor's change form (a set of base ids
  beside learnedSpells, written in both JSON shapes; a record without it reads empty, rule 6's migration), its restart scenario
  b-skill-book's restart leg.

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
  m5-skill-set: LevelingTest's set case (the console's SetAV OneHanded 50 writes the progress entry 50/0/cost(50) and the
  base, the record goes to the player whole, the next use earns 63 toward the step from 50 with the level and base staying
  50) and ConsoleCommandTest's actor value case (Marksman 45's progress entry with its base); actor_values.rs's skill_index
  test.
- T1: none (the hook is a Skyrim Platform export; its proof is T3).
- T2: a difftest session with a SkillUse accepted and one refused.
- Probe x-skill-use by path, GREEN at v4's rerun 20261031-151449 on m5-leveling b6748da0 (two seats, c2 the target 120 units south
  under god mode, twenty swings: sixteen hits, the batches sent, One-handed 20 to 21 on the server and on the seat's base with the
  carry, kept across a relaunch); v5 f804a96c swings thirty-six times for the record.
- T3 scenario id: lab/scenarios/p-level-up.yaml (M5's exit; on thuum main d9e02b7d since 2026-10-31, its first run owed before the
  leveling gate): a seat's One-handed from 20 to 21 by hits on the other player's figure (the console's SetActorValue wrote the base alone
  until m5-skill-set, so the draft could not start at 15; the seat's own 20 is the start), then to 25 with the character's level 2, rate-proof counts, no crosstalk on the target's
  record, a relaunch and a server restart keeping the level. As first drafted: a seat's One-handed from 15 to 16 by hits on a lab NPC
  (the hits the server already judges), the "Skill increased" on its screen, the other seat's figure values and the
  record agreeing, a relaunch and a server restart keeping the level; a character level-up from a skill run (the
  threshold at level 1 is 100 xp: eight skill levels). Probe x-skill-use by path first (the hook's amounts against
  the formula on a dozen hits).
- Assertions that would fail if the verb silently regressed: a skill level on the record differing from the game's;
  a skill rising on a seat with leveling off; a level lost across a restart.

## Dynamic plan (fill when any tag above is still HYPOTHESIS)

- x-skill-use v1 (549cec01) at ef618dee's stage, 05:25 PDT 2026-10-31: red twice before any swing at c2's teleport (the engine dropped
  the move: the client's dump unmoved 1,176 units under lab-spawn while the server's record held the target; c1 moved). The hypothesis, withdrawn below:
  a move asked 11 s after c2's 3D load falls inside Skyrim Platform's post-load block (the wall probe moved c2 at about 20 s); v3
  (4585b2a0) dumps and screenshots both seats before any move, waits 10 s more and moves c2 first.
  WITHDRAWN 07:24 PDT: v3 (20261031-141639) red the same way with a clean pre-move dump (c2 at the clean spot, HUD only, every control
  on); the target (0, 120) is over lab-spawn's north edge (docs/LAB.md's summit note of 2026-10-01: "(0, +150) and (200, 0) are over
  the north and east edges"), so c2 landed, fell 1,176 units under god mode and rested at the same spot every run. The probe's
  frame, not the client: v4 (7db1a600) stands c2 at (0, -120) facing north, c1 at the origin facing south.
- v4 (20261031-151047), 08:16 PDT: both teleports landed; the hook's read is CONFIRMED on a figure: twelve "skill uses sent: 6:7.0
  (1 use(s))" for the twelve OnWeaponHit lines of twenty swings (0 damage under god mode), no refusal line. Too few for the step:
  12 hits are 529 xp of the 688 from 20 to 21, so no level. v5 swings thirty-six times and claims "at least 21, never 23"; the
  landing rate is the swing's, 60% here.
- v4's relaunched rerun (20261031-151449) GREEN, 08:19 PDT: sixteen of twenty swings landed (sixteen uses sent, sixteen OnWeaponHit
  lines), "ff000000 skill 6 reaches level 21" once, the seat's base 21 with the carry 16.886 applied (the server writes the step's
  remainder into the record, the seat applies it), kept across the relaunch. v5 (f804a96c, thirty-six swings) for the record.
- v5 (151817) landed 13 of 36 at 120 units, all in the first 14 s: each hit pushes the target back and after a dozen it stands out of
  the sword's reach (numidium's read); v7 (df00436b) swings in batches of twelve with c2 teleported back to 80 units between them.
  p-level-up v3 (e4647c46) GREEN standalone 152612 (08:35 PDT): 168 of 168 swings landed in fourteen batches, the skill 21 at hit 16,
  22 at 33, 25 at 94 with the character's level 2 the same tick, 27 at 145 and never 28; the seat read base 27, level 2, xp 18.79 at
  the last level and 1,033.09 after the relaunch (the login applies the record's carry; between levels the server accumulates without
  a send), kept across the restart; c2's record at 20 throughout. The missing "applied the server's
  actor values" line on both seats is the fresh world's normal path (no record before the seat's own report), not a leveling fault.
  v2 (55b7d02a) dropped the "xp == 0 after swings" claim: the server writes the step's carry into the record and the seat applies it.

- Frida script: lab/frida/skill-use.js, probe x-skill-use-read (by path; v1 f3cfb4df connected, v2 a18406a9 solo). READ
  2026-10-31, three runs (20261031-092918, -093933, -094735, numidium): the player's UseSkill (PlayerCharacter's vtable
  slot 0xF7, Actor.h:445) resolves from the player's own vtable to the address CommonLibSSE-NG names
  PlayerCharacter::AddSkillExperience (RELOCATION_ID(39413, 40488); RVA 0x736e20 on 1.6.1170): ONE function, the one
  funnel. It fires once per LANDED hit (eight swings at a held bandit, eight calls; v1's swings at nothing, none), with
  rcx the player (0x14), edx the skill (6), xmm2 the points and r9 the source form (the iron sword 0x12eb7). The points
  are the weapon's BASE DAMAGE: 7.0 on every call (v3, the function replaced with a NativeCallback of the header's
  signature; an attach's context has no XMM registers, so v2 read null). The engine's own record moved 0 to 352.8 xp
  over the eight hits, 44.1 a hit: the AVSK use mult 6.3 is applied INSIDE the function, after the entry. CONFIRMED.
- The client hook, decided by the read: a Skyrim Platform native hook at 40488 (a Gum replacement of the header's
  signature, as the fork's DamageActor replacement) raising a `skillUse {skill, points, source}` event to JS, where
  skillUseService batches a second's uses into SkillUse (63) with `amount` the points as received. The engine's own
  write stays as it is: under DisableSkillAdvanceService's zeroed mults the function adds 0 and the server's formulas
  (the same AVSK constants) write the record; the hook passes the call through. Block and the casting schools are
  read by the same hook when their probes run (expected: the blocked damage, the spell's cost).
- Owner: agent (the hook and the service, a client build); Eli for the Stats menu's pick (perks.md).

## Skill books (turbo 2's arm one, Eli 2026-11-02: "land fixes for those things ... skill books")

The increment the inventory called "later". Playtest 40's server log holds six "reading skill book ... detected, not implemented"
lines for ff000001 at 20:22:15 to 20:22:36Z (1b00e SkillSpeechcraft2, 1b00d, 1afc4, 1afee, 2f838, 1b01c; each a drop of the book
that the seat's game read first, F8's store turning into "use"), and that seat's console carries no "skill uses sent" at any of
them (its two lines of the night are Sneak's at 20:27): the engine's rise for a book never passes the hooked AddSkillExperience.

- Rung: R0. The server's rule gives the skill one level (nothing at the cap: the book is still spent), carries the experience
  toward the next level as the same share of the new step's cost, credits the character the new level as for any skill level, and
  does it once per book per character; the seat reports nothing new (the read travels as the equip report, OnEquip 11, as a
  spell tome's does: no wire change, rule 4 untouched). Not R1: the seat's own rise is an engine constant (one level) the server
  computes itself; the seat's number is replaced by the record's send whatever moved.
- Engine surface, the re-analyst's static read (pyghidra, 2026-11-02; every line HYPOTHESIS until x-skill-book): TESObjectBOOK::Read
  (RELOCATION_ID(17439, 17842), src/RE/T/TESObjectBOOK.cpp:60; 0x27aad0 on 1.6.1170 by `just addr`) gates on the reader being the
  player, then for a skill book (flags bit 0, kTeachesSpell clear) with the permanent value under 200 takes 1.0 through the perk
  entry point kAdjustBookSkillPoints (BGSEntryPoint.h:18), truncates it to a count and calls id 40489 (0x736e60, no CommonLib
  name; IncrementSkill by its shape, the console's IncPCS and the TrainingMenu call it too), which loops into id 41561 (the body
  behind 40488's wrapper) with the exact remainder to the threshold and the use mult off: the level rises by ActorValueOwner
  slot 5 ModActorValue(av, 1.0) (ActorValueOwner.h:19), the skill's experience is rescaled to its share of the new threshold
  (`newThreshold * xp / threshold`, the new threshold `improveMult * level^fSkillUseCurve + improveOffset`, 0 at 100), the
  character's experience gains the new level times fXPPerSkillRank (0 on a seat today), SkillIncrease and story events fire,
  AdvanceLevel is never reached (the Stats menu pulls the level-up). After the rise, on the base form: flags 0 and 2 cleared,
  bit 3 (kHasBeenRead) set, AddChange(kTeachesSkill) and AddChange(kRead), one BooksRead event. Read runs at BookMenu::OpenBookMenu's
  end (the rise is at the menu's OPEN) and from the two inventory handlers; a non-player reader gets nothing, and TESObjectBOOK::
  Activate never reads. The rule's carry matches this read; the DATA's teaches field of a skill book is the skill's ActorValue, not
  a form (lab/esm.py: SkillOneHanded1 0x1afe3 carries 6, SkillSpeechcraft2 0x1b00e 17, SkillAlchemy1 0x1afc4 16).
- Server (fork m5-skill-books 38659a3e): wire-rules leveling.rs `Progress::apply_book` (the character loop shared with apply_use;
  `carry_after_step`), the bridge's `apply_book` beside `apply_use` (one `judge`), PartOne::ApplySkillBook (the record write shared
  with ApplySkillUse through WriteLevelingOutcome, the record sent always), WorldState::applySkillBook installed by PartOne,
  MpActor::IsBookRead/MarkBookRead over the change form's `readBooks`, and ReadBookEvent's skill branch: ActorValue 6 to 23 else
  E_BOOK_SKILL; read before: "reads skill book {:x} again ... the record goes back to its game" and SendActorValueRecord; leveling
  off: dropped and the book not spent (ApplySkillBook's debug line); accepted: MarkBookRead and "{:x} reads skill book {:x}: skill
  {} one level up" after the rule's "skill {} reaches level {}". A blocked read (the gamemode's) re-sends the record. The book
  stays in the inventory (a spell tome goes).
- Client: nothing new. The seat's engine raises the skill at the menu's open; the record's send sets the base and the progress to
  the server's numbers. HYPOTHESIS: slot 5's ModActorValue on a skill moves the base and not a permanent modifier (the console's
  IncPCS, the same path, leaves no highlighted skill); if the probe reads the current value one over the base after the record's
  send, the client gets a one-line undo of the engine's own rise on the skillIncrease event.
- T0 (38659a3e): LevelingTest's skill-book case (One-handed 15 with 378 toward 392.6, the book takes it to 16 with the carry
  378 / 392.6 of the step from 16, the base 16, the character's 16, one ActorValues sent, the book kept; the same book again moves
  nothing and sends the record once; readBooks on the change form; leveling off drops a second book's read unspent),
  FormDescWorldTest's readBooks in both JSON shapes and across orders A to B (rotfern's slot 02 to 03), leveling.rs's three cases
  (the share kept, the character's level from six books, the cap and the refusals, the carry's bounds), the bridge's case.
- Probe x-skill-book by path, then scenario b-skill-book (its own commit when green): c1 at One-handed 20 reads SkillOneHanded1
  0x1afe3 from its inventory (the lab's equip opens the Book Menu; close-menu "Book Menu", CommonLibSSE-NG BookMenu.h:36): the
  server's two lines once, the seat's base 21 with the experience 0 and the level 1 within 10 s, no E_SKILL_ or E_BOOK_; the same
  book again: the "again" line, the base still 21; c2's record at 20 throughout; a relaunch keeps 21; a server restart keeps 21 and
  a third read says "again" (readBooks persisted); the current value recorded beside the base for the ModActorValue question.
- x-skill-book GREEN on its first run (20261102-212928 on m5-skill-books 38659a3e's stage, numidium): the baseline, the one-level
  read, the "again" with nothing moved, the base 21 after the relaunch and after the restart, "again" counted 2 after the restart.
  Promoted to b-skill-book (thuum main 2d42914c, its own commit). The head takes parity and goes R0 (ADR-053) after restart-dead's.
- Known limits: the seat's own base form carries the read flag only for its process (no save keeps it under SkyMP), so after a
  relaunch the game opens the same book as unread and raises the skill on its own until the server's record arrives, a flash of
  one level; the "Skill increased" message and sound are the engine's own at the open, before the server's word. Trainers stay
  "later".

## Status

- [ ] doc complete, inventory listed with a disposition per row, rung declared (the reference trace owed)
- [x] engine surface cited or delegated (headers and CommonLibSSE-NG's source; the Frida read planned)
- [x] server logic + T0 (fork m5-leveling, 2026-10-31: wire-rules leveling.rs with its Table (nine cases), libespm's AVIF reader (EspmTest), the bridge's LevelingTable (its case), PartOne's LoadSkillTable at AttachEspm, ApplySkillUse and the `leveling` switch, ActionListener::OnSkillUse; unit/LevelingTest.cpp's three cases ride the pipeline)
- [x] message + validator (same commit: SkillUse 63, check_skill_use, the budget, two fixtures, SkillUseMessage.h; m5-leveling 553863f8)
- [x] native hook + T1 (fork m5-leveling, 2026-10-31: Skyrim Platform's UseSkill replacement at 40488, game/Offsets.h and FridaHooks.cpp, the skillUse event; T1 is the client build)
- [x] TS handler (skillUseService.ts: a second's uses summed per skill into SkillUse 63; the engine's own write stays, nothing under the zeroed mults)
- [ ] T2 green
- [x] T3 scenario green (p-level-up v3, main e4647c46, GREEN standalone 20261031-152612 on m5-leveling b6748da0: 168 of 168 batched swings landed, One-handed 20 to 27, the character's level 2 at skill 25, the relaunch and the restart keeping both, c2's record untouched; 08:35 PDT 2026-10-31; the gate runs it again), HYPOTHESIS tags read as noted beside each
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
- RESOLVED on m5-skill-set (2026-10-31, the Server section): a console SetAV on a skill (found 10:09 PDT 2026-10-31 writing x-lockpick v4): ConsoleCommands' SetActorValue path is
  SetActorValueBaseByServer, which writes the record's base and sends it (the seat applies SetActorValueBase, so the skill's
  number moves at once) but leaves the record's progress entry at the login report's level; ApplySkillUse recomputes the
  base from that entry at the skill's next use, so the base snaps back. Candidate fix (server, T0): a skill av's set also
  writes the progress entry (level = the value, xp 0, threshold = level_cost). Until then a seat's skill number for a
  playtest goes through the leveling path, and the lockpick probe's Lockpicking 100 holds only until the first pick's use.

## Known limits

- With leveling on, the seat's actor values report moves none of the record's skills, experience, threshold, level or
  legendary counts, nor the skills' bases (ActionListener::OnActorValues; perks.md's pick reads them): the server computes them.
  A Legendary reset at a seat is therefore not recorded under leveling until it is a verb (the engine's reset stands on that
  seat alone). Off, the report stands as before (R1). (00:53 PDT 2026-11-01, the perks review.)
