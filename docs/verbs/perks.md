# Verb: perks

Drafted 2026-10-31 (pile item 13 of docs/private/turbo-2-prework.md; M5's "perks as transactions"), built the same
morning on fork m5-perks (stacked on m4-weather for the message ids). From the records (lab/esm.py on Skyrim.esm), the
engine headers and a code map of the fork: upstream's two perk services (sweetTaffyStaticPerksService.ts,
sweetTaffyDynamicPerksService.ts) grant SweetPie's perks by keyword and are inert without that mod; the server keeps
no perks before this verb (MpActor.h:475-477; HasPerk conditions on effects refused by design, ADR-039).

## Intent

A player's perk pick is the server's transaction: the pick is judged against the perk record's own conditions and the
player's perk points, written to the record, and the player's game is told its perk set and points, so perks survive
a login and a restart and the engine's conditions read the perks the game holds.

Roadmap reference: skymp/ROADMAP.md "Perks and level up" ("Selected perks must be saved. Then gradually make the
existing perks work") and "Skills".
Milestone: M5   Class: B

## Inventory (ADR-031: the action's consequences, before its rung)

The action is the pick in the Skills menu: the player spends a perk point on a perk the menu shows available. The
records (lab/esm.py, 2026-10-31; UESP "Skyrim Mod:Mod File Format/PERK"): a PERK's DATA is five bytes (isTrait, level,
numRanks, isPlayable, isHidden), NNAM names the next rank's PERK, and the CTDAs BEFORE the first PRKE section are, in
UESP's words, the "condition data subrecords for the perk to be available to the player". Those conditions carry the
whole tree: Armsman00 0xbabe4 has none (the root's child), Armsman20 0x79343 has GetBaseActorValue(OneHanded 6) >= 20
and HasPerk(Armsman00) == 1, FightingStance 0x52d50 has HasPerk(Armsman00) == 1 and GetBaseActorValue(6) >= 20; the
chain 0xbabe4, 0x79343, 0x79342, 0x79344, 0x79345 is Armsman's five ranks by NNAM. So the tree's lines (AVIF nodes'
connections, libespm AVIF.h) are a picture of the same rule, and the server judges a pick by the record's conditions
alone, as the engine's menu does. The function ids: GetActorValue 14, GetLevel 80, GetBaseActorValue 277
(CommonLibSSE-NG include/RE/T/TESCondition.h:48, :120, :351), HasPerk 448 (:566, libespm MGEF.h:136); the actor value
indexes CommonLibSSE-NG include/RE/A/ActorValues.h (kOneHanded 6 at :14). The CTDA layout: libespm CTDA.h (the
operator in the top three bits of byte 0, the comparison float at 4, the function u16 at 8, the first parameter u32 at
12).

| consequence | seen in | disposition |
| --- | --- | --- |
| the Skills menu's pick: the perk taken, a point spent, the sound and the constellation's star | engine (the menu) | native on the picking game; observed at the menu's close and reported (R1) |
| the perk point count the menu offers | engine (PlayerCharacter's perk count) | imposed: the server's points (level - 1 - the picks the server granted; a perk from the console, a quest or a mod spends nothing), Game.setPerkPoints at login and at each change |
| the perk's own effects (damage, costs, the entries' spells and abilities) | engine | native on the game that holds the perk; the server's formulas honour none yet (M5's second half, Known limits) |
| the perk set across a relaunch and a restart | code | R0: the record's perks; the client adds what the record holds and drops a tree perk the record lacks |
| a pick the server refuses | code | the game's perk removed and its points reset by the server's word (PerkState) |
| HasPerk conditions on the server's own effect riders (ADR-039) | code | the record answers for players (Condition.cpp's HasPerk for a player actor); the second half for figures' seats |
| the Legendary reset (a skill at 100 back to 15, its perks refunded) | engine | later |

### Sequences and combinations (ADR-033)

| sequence or combination | probe or scenario | result |
| --- | --- | --- |
| a pick with no points: refused, the perk gone again | x-perk-pick, b-perk-pick | |
| a pick after the server set the level: accepted, the record, the points down by one | x-perk-pick, b-perk-pick | |
| the second rank before the first: refused; after the first: accepted | x-perk-pick | |
| a pick under the skill's requirement: refused | x-perk-pick | |
| the perks held after a relaunch and after a restart | b-perk-pick | |

## Authority

Rung: R0 for the record and the points (the server writes), R1 for the pick (the player's own game reports the perk
its engine took; the server judges).
Why this rung and not the one above it: the menu is the player's game's (its UI, its sound); the server cannot see the
pick before the engine does, so the engine's pick is a report, judged and undone when refused.
What the server validates (R1): the perk exists in the game files and is playable and not hidden (DATA), not already
held, one point left (level - 1 - the picks granted, vanilla's one a level; the counter since 2026-11-02, see below), and every top-level condition of the record
holds against the record: HasPerk(X) against the perks held, GetBaseActorValue(av) against the record's skill level
for a skill (6 to 23) or its base otherwise, GetLevel against the character level; a condition with any other function
refuses the pick (E_PERK_CONDITION, one log per function id), by rule 5. The game's own perk points come from the
server alone (the engine never levels under skymp5-client's fXPPerSkillRank 0).
Rate limit / bounds: a budget of 8 then 2 a second (UNMEASURED); a perk set of at most 512.

## Engine surface

- Records: PERK (libespm PERK.h, new: DATA, NNAM, the top-level CTDAs; Browser indexes PERK for GetRecordsByType), the
  CTDA field (libespm CTDA.h), AVIF trees (AVIF.h, read since m5-leveling; unused by the rule).
- CommonLibSSE-NG: TESCondition.h FUNCTION_DATA::FunctionID (above); ActorValues.h; PlayerCharacter's perk count is
  the engine's (not touched natively: Game.setPerkPoints).
- Skyrim Platform: Actor.addPerk :2080, hasPerk :2167, removePerk :2219; Game.addPerkPoints :2774, getPerkPoints
  :2822, setPerkPoints :2877; ActorValueInfo.getPerks(actor, unowned, allRanks) :2348 (the tree's perks per skill,
  the universe the client manages); Perk.getNextPerk :3197; no perk event, so the pick is read at the "StatsMenu"
  close (actorValuesService.ts:38 names the menu) and by a poll.
- The server: ActorValueRecord (ActorValueRecord.h, level since m5-leveling) gains `perks`; MpChangeForms.cpp's JSON;
  MpActor::GetActorValueRecord/SetActorValueRecord (MpActor.cpp); Condition.cpp's HasPerk (ADR-039's refusal).
- The lab: `add-perks {ids}` (the driver adds perks to the player as the menu would), `known` extended to a PERK
  (Actor.hasPerk), server-console AddPerk, RemovePerk and SetLevel.

## Observe

- Hook point: the client's perkService: at the StatsMenu's close and every 5 s, the tree perks the player holds
  (ActorValueInfo.getPerks per skill, owned, all ranks) minus the record's set; each new one is a PerkPick.
- SP filter: the player alone.
- Data captured: {perk: u32}.
- Side effects: HYPOTHESIS until x-perk-pick: the menu's pick is visible to getPerks at the menu's close; the poll
  catches a perk a mod or the lab added, which the server then refuses and the client removes (a tree perk only).

## Impose

- Mechanism: PerkState {perks, points} to the player at login (after its actor values), after every pick accepted or
  refused, after a level change (leveling's path) and after the console's AddPerk, RemovePerk and SetLevel; the client
  sets the engine's perk points (Game.setPerkPoints), adds the record's perks the engine lacks and removes the TREE
  perks the engine holds that the record lacks (never a hidden or quest perk: only perks getPerks lists).
- Visual without simulation achieved by: the engine's own Skills menu over the server's count and set.
- Side effects: HYPOTHESIS: Game.setPerkPoints shows in the open menu; a removePerk during the menu is harmless.

## Suppress

- What is suppressed: the engine's own perk point grants (none happen: fXPPerSkillRank 0, DisableSkillAdvanceService);
  a refused pick (undone by PerkState).
- Release condition: the `perks` switch off: no PerkState, no judgement, the game's perks stay local as today.

## Message contract

- PerkPick, C2S, reliable, MsgType 67 (wire id 75): `{ perk: u32 }`; validator E_VAL_RANGE on 0; a budget of 8 then
  2 a second. PerkState, S2C, reliable, MsgType 68 (wire id 76): `{ perks: [u32] (at most 512, none 0), points:
  u16 }`; validator E_VAL_RANGE on a 0 entry. SCHEMA_VERSION 26. Fixtures 67-PerkPick-0/1, 68-PerkState-0/1.
- Idempotency / ordering: a pick already held is refused E_PERK_OWNED and the state resent (idempotent for the
  client); PerkState is the whole set, the last word stands.
- Contract doc updated: docs/WIRE.md (PerkPick, PerkState).

## Server

- Where the logic lives: wire-rules perks.rs: Table (perk -> playable, hidden, conditions as HasPerk(id, wanted),
  AtLeast/Compare(av, op, value), Level(op, value), Unknown(function)), `points(level, picks)`, `pick(table, record,
  perk) -> Result<(), Refusal>` with E_PERK_UNKNOWN, E_PERK_HIDDEN, E_PERK_OWNED, E_PERK_POINTS, E_PERK_PREREQ (a HasPerk
  condition), E_PERK_SKILL (a value condition), E_PERK_CONDITION (an unknown function). wire-bridge PerkTable.
  PartOne::LoadPerkTable at AttachEspm (every PERK of the load order, conditions' form ids made global);
  ActionListener::OnPerkPick (the switch, the rule, the record, PerkState, "[verb:perks] ..." lines); MpActor::
  SendPerkState; the natives Actor.AddPerk, RemovePerk, HasPerk (R0, the record; NATIVES.md); the console AddPerk,
  RemovePerk (admin, the record straight) and SetLevel (admin: the record's level, the lab's lever for points; the
  record and PerkState sent). Condition.cpp's HasPerk answers from a player's record. The `perks` setting (default
  false).
- DB fields / migration: ActorValueRecord.perks in the change form's JSON ("perks", absent in older records, read as
  none) and ActorValueRecord.perkPicks ("perkPicks", the picks the rule accepted; absent in a record from before the
  counter, read as the perks held capped at level - 1, so such a record keeps the points it showed): no schema
  migration (JSON fields); rule 6's restart scenario is b-perk-pick's.
- Restart behavior: the record as saved; the points recomputed from level and picks.
- The picks counter (playtest 41's item 6, 2026-11-02): the points were level - 1 - perks held, so a perk the console
  (the lab's setup), a quest or a mod granted counted against them and a seat set up with AddPerk reached its level-up
  with nothing to spend ("rotfern was NOT offered a perk"). Now an accepted pick increments perkPicks (MpActor::
  AddPerkByServer(perk, asPick)) and the points are level - 1 - perkPicks; the console's AddPerk, a native's and a
  quest's add spend nothing, RemovePerk refunds nothing (vanilla's console refunds nothing either), SetLevel moves the
  points as before.
- Papyrus natives touched (ledger lines added): Actor.AddPerk, Actor.RemovePerk, Actor.HasPerk (implemented, R0).

- The numbers a pick reads: with leveling on, the record's skills, experience, level and the skills' bases are the server's
  (R0; an actor values report moves none of them, ActionListener::OnActorValues), so the conditions judge what the server wrote;
  with leveling off they are the seat's own bounded reports (R1, actor-values.md), declared here: `perks` runs with `leveling`.
  The perks themselves ride no report and the merged record keeps them. A perk's conditions are judged in the engine's groups
  (a run of CTDA rows flagged OR and the row after them holds when any member holds; the groups are ANDed), so a perk with two
  parents takes with either. No PerkState leaves the server with `perks` off (the console's and the natives' writes included),
  and a pick before the record is refused with the state sent, so the engine's own pick is undone. The record's perks load
  sorted and unique; a server write stops at the wire's cap.

## Client

- SP binding: none new.
- TS handler: perkService.ts (the diff at the menu's close and the poll, PerkPick; PerkState applied: points, adds,
  removes within the tree universe); consoleCommandsService's schemas addperk, removeperk, setlevel. Lines: "perk pick
  <id> reported", "perk state: N perk(s), P point(s); added [...] removed [...]".
- Kill switch config key: `perks` (server). The client needs none: no PerkState, nothing managed.

## Tests

- T0: wire-rules perks.rs (the points, a first perk, no points, owned, a rank before its predecessor, a skill too low,
  a hidden or unknown perk, an unknown condition function, a GetLevel condition, a perk granted outside a pick spending
  no point); unit/PerkTest.cpp (the table from the game files: Armsman's chain and conditions; a pick accepted at level
  2 into the record with PerkState sent; the refusals; the console SetLevel; the switch off; the natives; the picks
  counter and the older record's read); unit/EspmTest.cpp's PERK case.
- T2: a session with a PerkPick accepted and one refused; PerkState at login declared in difftest's divergences when
  the lab's settings turn `perks` on.
- T3 scenario id: lab/scenarios/b-perk-pick.yaml (after the probe): a seat at level 3 by the console picks Armsman
  (accepted, held after a relaunch and a restart), Armsman 20 before the skill's 20 refused, Fighting Stance accepted
  after Armsman with One-handed 20. Probe x-perk-pick v1 by path first: the driver's add-perks stands in for the menu's
  pick (the same engine call the menu makes, Actor.AddPerk), the refusal's removal, the points in the game.
- Assertions that would fail if the verb silently regressed: a perk held on the seat and absent from the record after
  a relaunch; a pick with no points standing on the seat; the record's perk missing from the seat.

## Dynamic plan (fill when any tag above is still HYPOTHESIS)

- x-perk-pick v1 by path (one seat): (1) add-perks [0xbabe4] at level 1: the server's E_PERK_POINTS, the seat's perk
  gone within 5 s (known reads 0), points 0; (2) server-console SetLevel [0x14, 3]: PerkState points 2, the game's
  getPerkPoints 2 (a driver read); (3) add-perks [0x79343] (Armsman 20 with One-handed 20 but no Armsman): E_PERK_PREREQ,
  gone; (4) add-perks [0xbabe4]: accepted, known 1, points 1; (5) add-perks [0x52d50] with One-handed at 20 (set-av or
  the server's SetActorValue): accepted; (6) a relaunch: both perks known again at the login. The menu's own pick is
  Eli's T4 (the checklist: open the Skills menu, spend a point).
- x-perk-pick v1 READ (20261101-065822 and 070024 on m5-perks 2ab9b92b, red before step 1: no "perk state:" line within 25 s
  of the login): the console threw "Cannot read properties of undefined (reading 'prototype')" at this service's slot in the
  update order and every 5 s after (the tick); the platform's fault, not the verb's. Sp3Api stamps a native's result with the
  return type's class name, VmProvider::MakeValueType named kObject alone, so every array a native returns was stamped "" and
  sp3.js's wrapObject read sp[""].prototype; ActorValueInfo.getPerks is the one array call here (apply() before its log line),
  and no client code had consumed an array result before. Fixed in the platform at m5-perks c1fd8fc7 (MakeValueType names the
  element class for kObjectArray, wrapObject maps an array per element; the dist rebuilt whole, sp3.js being a resource inside
  the DLL); the probe stands unchanged and its rerun on the rebuilt dist is the confirmation.
- The stage on c1fd8fc7 (07:27Z): c1 crashed twice at launch in SkyrimPlatformImpl.dll (an access violation while a native's
  signature was described; c2 launched on the same dist). CommonLib's TypeInfo::GetTypeInfo masks 0xB off an object array's raw
  type and so clears the class pointer's bit 3; the heap layout decides per process. Fixed at 527910cc with the one bit masked and
  a raw type below kArraysEnd skipped, together with the review's eight fixes (LOG 00:53 PDT 2026-11-01); the same probe plays on its build.

## The second half: the perks' effects in the server's formulas (D77 A, 01:19 PDT 2026-11-01)

- Intent: a perk the record holds changes the numbers the server computes, read from the perk records' own entry points in the
  game files, never from a hand table: the weapon schools' damage ranks (Armsman, Barbarian, Overdraw and every rank that uses
  the same entry point) multiply the hit's damage; the armor schools' rating ranks (Juggernaut, Agile Defender and kin) multiply
  a worn piece's rating. Perks the server's formulas do not model (critical hits, stagger, sneak multipliers, spells' costs, the
  entries' abilities) stay the engine's on the holder's game and are listed under Known limits.
- Rung: R0. The damage number is the server's already (TES5DamageFormula::CalculateDamage, applied through NetSetPercentages,
  ActionListener.cpp:5946-5976); the multiplier is one more server-side term of it. Not R1: the attacker's game applies its own
  perk effects to its own display alone (the DamageActor replacement cuts figures' damage), and nothing of it is reported.
- Engine surface (the records): a PERK's effects are PRKE sections after its own conditions: PRKE {type, rank, priority} (type 2
  an entry point), DATA {entryPoint, function, tab count}, PRKC {tab} with that tab's CTDA conditions, EPFT {function data
  type}, EPFD {the value}, PRKF (UESP, "Skyrim Mod:Mod File Format/PERK"; libespm/src/PERK.cpp reads the record up to the first
  section today). Entry points: CommonLibSSE-NG include/RE/B/BGSEntryPoint.h:13-106 (kCalculateWeaponDamage 0, kModAttackDamage
  35, kModIncomingDamage 36, kModTargetDamageResistance 37, kModArmorRating 85); the functions: BGSEntryPointPerkEntry.h:20-37
  (SetValue 1, AddValue 2, MultiplyValue 3, the rest not judged); the data types: BGSEntryPointFunctionData.h:14-24 (OneValue 1).
  The condition functions on the tabs: TESCondition.h (HasPerk 448 :566, HasKeyword 560 :690, GetBaseActorValue 277 :351).
- Engine surface (what Skyrim.esm says, read on sky-srv with lab/esm.py 2026-11-01): Armsman00 0xbabe4 holds one PRKE of type 2,
  DATA 23 03 03: entry point 35 (kModAttackDamage), function 3 (multiply), three tabs; tab 0 holds HasPerk(Armsman20 0x79343) == 0
  (the next rank not held, so ranks do not stack), tab 1 holds HasKeyword == 1 for WeapTypeMace 0x1e714, WeapTypeSword 0x1e711,
  WeapTypeWarAxe 0x1e712, WeapTypeDagger 0x1e713, each flagged OR; tab 2 is empty; EPFT 1, EPFD 1.2. Armsman20 0x79343 the same with
  1.4; Overdraw00 0xbabed the same with WeapTypeBow 0x1e715; Barbarian80 0x79349 and Overdraw80 0x79354 DATA 23 03 03.
  Juggernaut00 0xbcd2a holds DATA 55 03 02: entry point 85 (kModArmorRating), multiply, two tabs; tab 0 HasPerk(Juggernaut20
  0x7935e) == 0; tab 1 HasKeyword(ArmorHeavy 0x6bbd2) == 1 and HasKeyword(0x965b2) == 0 (the shield keyword, HYPOTHESIS until a
  KYWD read names it); EPFD 1.2. AgileDefender00 0xbe123 the same with ArmorLight 0x6bbd3.
- HYPOTHESIS (the tab semantics, no header names them): for kModAttackDamage the tabs are the perk owner, the weapon and the
  target; for kModArmorRating the perk owner and the armor piece. The read above fits that (the owner's HasPerk on tab 0, the
  weapon's or the piece's HasKeyword on tab 1); the probe's measured multiplier confirms it. HYPOTHESIS: the engine applies
  kModArmorRating to each worn piece with that piece as the subject, before the pieces are summed.
- Observe: nothing new; the hit is the existing R1 report. Impose: the server's number lands as before (the target's health
  percentage); the attacker's own game shows its own engine's number on its own screen for a moment, as it does today.
  Suppress: nothing new.
- Message contract: none (no wire change; the rule crate gains the effects table beside the pick's conditions).
- Server: libespm reads the PRKE sections into PERK::entries (type, rank, priority, entry point, function, tab count, the tab's
  conditions, the data type and value). PartOne::LoadPerkTable adds each OneValue entry to the Rust table (`add_effect`) and its
  conditions per tab (`add_effect_condition`, HasPerk's and HasKeyword's parameter made global). wire-rules perks.rs holds the
  effects and `apply_entry_point(entry, start, record, subject keywords)`: over the held perks' effects on that entry point whose
  owner tab holds (the pick's judge, OR groups) and whose subject tab holds against the keywords (HasKeyword groups), in (priority,
  perk id) order, SetValue, AddValue and MultiplyValue applied to the running value; any other function, a condition the rule does
  not judge, or a condition on a third tab leaves that effect out (counted at load, logged once). WorldState carries
  `applyPerkEntryPoint` as PartOne installs it (the skill-set verb's std::function shape), so TES5DamageFormula asks it: the weapon
  damage (with the arrow's) through entry point 35 with the WEAP's keywords (RecordHeader::GetKeywordIds made global, the
  HasKeyword.cpp:32-35 idiom; unarmed has none), then each worn ARMO's rating through entry point 85 with that piece's keywords.
  With `perks` off the formula is unchanged.
- Client: nothing.
- Tests: T0 wire-rules (Armsman's effect multiplies with a sword's keyword and not with a bow's; the held next rank excludes the
  rank below so 1.4 applies, not 1.2 times 1.4; AddValue before MultiplyValue in priority order; an unjudged function leaves the
  effect out); EspmTest reads Armsman00's entry from Skyrim.esm (35, 3, 1.2, the two tabs' counts); TES5DamageFormulaTest: an
  attacker with Armsman00 and an iron sword deals 1.2 times the bare number, with Armsman20 as well 1.4 times; a target with
  Juggernaut00 in iron armor takes the rating times 1.2 (the shield unchanged). T2: no session changes (the numbers' messages are
  the same shape). T3: x-perk-damage by path (two swings on a figure, the health deltas with and without Armsman through the
  server console's AddPerk, the ratio within 1.2 plus the engine's rounding), then b-perk-damage.
- Known limits of this half: the formula still carries no skill term (the engine's weapon damage grows with the skill level,
  UESP "Skyrim:Damage"; the leveling verb's number reaches the display, not this formula: its own slice), no armor-skill scaling,
  no critical hits, no sneak multiplier perks (Assassin's Blade, Deadly Aim: kModSneakAttackMult 18, a later entry point), no
  shield perks' block share (kModPercentBlocked 39, blocking.md's own), nothing of the perks' abilities or spells.

## Known limits

- The server's formulas honour no perk yet: damage, costs and the rest use the record's values alone (M5's second
  half lists which perks the formula takes first: the weapon schools' damage ranks, the armor schools' rating ranks).
- Figures on other seats carry no perks; HasPerk riders on effects the server evaluates read the record for the
  player's own effects only.
- One point a level (vanilla); a server wanting more sets the record through the console.

## Status

- [x] doc complete, inventory listed with a disposition per row, rung declared
- [x] engine surface cited or delegated (the records read from the master file; the headers)
- [ ] server logic + T0
- [ ] message + validator (same commit)
- [x] native hook + T1 (none)
- [ ] TS handler
- [ ] T2 green
- [ ] T3 scenario green, no HYPOTHESIS tags
- [ ] parity scenario green, or its later list reviewed with it (ADR-031)
- [ ] sequences and combinations green, every checklist item with its scenario (ADR-033)
- [ ] ledger and suppression registry updated

Play: VERIFIED IN PLAY, playtest 41 (2026-11-02, break 2): after the points fix (LOG 15:57) rotfern takes a perk at a level-up,
Eli: "now can get a perk from leveling".
