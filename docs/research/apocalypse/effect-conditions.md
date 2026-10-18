# Effect conditions: the server evaluates what it owns

Research note, 2026-10-18, for Eli's decision 4 (docs/private/decisions-m2-apocalypse.md)
and docs/verbs/natures-balance.md. The rule he set: a condition is evaluated
by whoever owns the state it reads. Each game keeps the engine's evaluation
for what it shows; the server evaluates an effect's conditions for the
number it applies, against the state it owns. This note holds what the fork
does today, what the vanilla records ask, and the build that follows. Code
facts read on fork f2f26ec3 (train-26) and parity 84db2c4e; records read on
sky-srv with lab/esm.py and a CTDA decoder (the session's scratchpad).

## What the server does today

- The evaluator exists: `skymp5-server/cpp/server_guest_lib/ConditionsEvaluator.{h,cpp}`,
  `Condition.{h,cpp}`, `condition_functions/` (ConditionFunctionFactory.cpp
  registers 17: GetEquipped 182, GetIsRace 69, GetIsPlayableRace 254,
  GetItemCount 47, HasSpell 264, WornHasKeyword 682, GetActorValuePercent
  640, IsWeaponMagicOut 101, IsWeaponOut 263, SpellHasKeyword 596,
  WornApparelHasKeywordCount 722, IsInInterior 300, GetEquippedItemType
  597, IsBlocking 569, and three SkyMP-only at 0xFFFF). It walks AND/OR
  groups; runOn Subject resolves to the aggressor, Target to the target,
  Reference to the aggressor (a declared hotfix), anything else to false;
  an unknown function evaluates to TRUE with a warning
  (ConditionsEvaluator.cpp, EvaluateCondition).
- It is called from two places only: the damage multiplier formula
  (weapon hits, conditions from server-settings JSON) and crafting (a
  COBJ's CTDAs through `Condition::FromCtda`). Never from OnHit,
  OnSpellHit, ApplyEffects or PlayStagger.
- libespm: `CTDA.h` is the full 32-byte struct; CTDAs are collected for
  COBJ and FACT. A spell-level CTDA (after an EFIT) only sets
  `hasConditions` on the effect entry (Effects.cpp); the bytes are dropped.
  MGEF read DATA alone until fork 93358eea (train-24 and after), which
  scans the MGEF's CTDAs for HasPerk (448) into `callsHasPerk`.
- The hit path: OnHit resolves the source, ClaimCast gives the scale,
  OnSpellHit reads the spell's effects and calls `MpActor::ApplyEffects`,
  which skips an effect `IsConditionGated` (a spell-level condition or a
  HasPerk on its record), turns the rest into facts (ValueMod,
  PeakValueMod, Dual; Invisibility, Light, Etherealize as state) and runs
  wire-rules `magic.rs apply` into value changes. A Stagger effect
  (archetype 33) is read by OnSpellHit's own loop into PlayStagger, with
  the same gate.
- So today the four vanilla perk riders (and Apocalypse's copies) stay out
  wholesale, which is the right answer while the server keeps no perks
  (M5). Every other condition on an effect record is ignored: an effect
  conditioned on its target's race, health share, keywords or on a dual
  cast applies regardless. The census counts 247 of Apocalypse's 556
  effects with conditions (docs/private/apocalypse-census.md).

## A measured case beyond the riders (train-24, 2026-10-18)

x-class-self 20261018-100816: Shock Nova (030D1E61, Health and Magicka
40) carries two rim effects of 20 each, gated on GetDistance at least 256
and at least 425 units (the census TSV). c1 cast it 250 units from c2 and
the server took 80 from c2's Health and Magicka, both rims included; the
engine, reading the conditions, applies 40 there. The server's number is
wrong by the conditions it does not read, not by the riders alone, which
is what the evaluator below fixes for every conditioned effect.

## What the vanilla riders ask (Skyrim.esm, CTDAs decoded)

None of Firebolt, Lightning Bolt, Sparks, Flames, Ice Spike or Fireball
carries a spell-level CTDA; the gates sit on the rider effects. Every CTDA
below is AND, no SwapSubject.

- PerkImpactStaggerPushFFAimed 0x153d3 (Stagger, 0.25): EffectWasDualCast
  724 == 1 on Target; HasPerk 448 Impact 0x153d2 == 1 on Target. The
  records gate Impact on 724, not IsDualCasting 627.
- PerkDisintegrateFFAimed 0xf3f0d and ConcAimed 0xf3f0c (ValueMod Health
  200 over 1 s, Detrimental): HasPerk Disintegrate 0xf3f0e == 1 on Target;
  GetActorValuePercent 640 Health < 0.15 on Subject; HasKeyword 560
  MagicNoDistintegrate 0xedf == 0 on Subject (the Conc one adds
  ActorTypeDaedra 0x13797 and ActorTypeDragon 0x35d59).
- PerkIntenseFlamesConfDownFFAimed 0xf392d, ConcAimed 0xf392f, FFAimedArea
  0xf3930 (Demoralize 99 for 15 s): HasPerk IntenseFlames 0xf392e == 1 on
  Target; 640 Health < 0.2 on Subject; IsCommandedActor 700 == 0 on
  Subject; HasKeyword != 1 on Subject for ActorTypeUndead 0x13796,
  ActorTypeDaedra 0x13797, ActorTypeDwarven 0x1397a; IsUndead 715 != 1 on
  Subject.
- PerkDeepFreezeParalysisFFAimed 0xf3932 (Paralysis for 3 s): HasPerk
  DeepFreeze 0xf3933 == 1 on Target; 640 Health < 0.2 on Subject;
  HasKeyword == 0 on Subject for ActorTypeDragon and ImmuneParalysis
  0xf23c5; GetRestrained 244 == 0 on Subject.

Function indices confirmed by two sources that agree: CommonLibSSE-NG
include/RE/T/TESCondition.h (kGetRestrained 244, kHasPerk 448,
kHasKeyword 560, kIsDualCasting 627, kGetActorValuePercent 640,
kIsCommandedActor 700, kIsUndead 715, kEffectWasDualCast 724) and UESP
"Skyrim Mod:Function Indices". The CK wiki's Condition Functions page
refuses fetches (403); not needed.

## Who Subject and Target are on an effect (HYPOTHESIS)

The riders put HasPerk on Target with no SwapSubject bit, and in the game
the perk is the caster's, so the engine resolves Target to the caster and
Subject to the actor the effect lands on. The CK wiki's Conditions page
says both resolve to the targeted reference; the records and the game's
behavior say otherwise, and win. Confirm the arguments of the engine's
active-effect condition check on sky-re before the mapping ships (rule 2;
CommonLibSSE-NG's TESCondition::IsTrue takes an action reference and a
target reference). Today's evaluator maps Subject to the aggressor for
weapon hits, so the effect caller passes (victim, caster) or gets a mapping
of its own.

## The build (after the big playtest, with Nature's Balance)

1. libespm: MGEF collects its CTDAs (a `std::vector<CTDA>`, the COBJ
   idiom) beside `callsHasPerk`, which then goes.
2. Server: a caller `kMagicEffect`; one helper (an effect, its victim, its
   caster, the cast's context) used by ApplyEffects and OnSpellHit's
   stagger loop in place of `IsConditionGated`; Subject the victim, Target
   the caster; the context carries the spell and the cast's isDualCasting
   (the SpellCast message has it; the claim keeps it).
3. Functions added, each a file in condition_functions/: HasPerk 448
   (false until M5 keeps perks, then the actor's perk list); EffectWasDualCast
   724 (the context's flag); HasKeyword 560 (the actor's keywords: its
   race record's KWDA and its base's; a player's race is its appearance's);
   IsUndead 715 (HYPOTHESIS: the race carries ActorTypeUndead; the vampire
   races do, docs/verbs/natures-balance.md); IsCommandedActor 700 (false);
   GetRestrained 244 (false); GetDead 46 (IsDead); IsActor for Nature's
   Balance's 353 once the index is checked against TESCondition.h. The
   functions Apocalypse's 247 conditioned effects use most come from the
   census TSV's conds column (apocrypha) and grow the list by data.
4. An unknown function stays TRUE with a warning (today's rule), logged
   once per function name, so the misses are a list and not a silence.
5. T0: PerkRiderTest grows (Firebolt's stagger rider refused on HasPerk,
   Lightning Bolt's Disintegrate refused, Intense Flames' Undead check on a
   vampire-race fixture false and on a mortal one true); Nature's Balance's
   six on both races. T3: b-natures-balance; x-firebolt-riders rerun (the
   scratchpad probe of 2026-10-16).
6. Rung: the number is the server's (R0); each game's own evaluation
   remains R3 (the look). Declared in natures-balance.md and
   magic-effects.md when built.

## Vampirism, filed

A turned player changes race in their own game alone (the vampire quest's
Actor.SetRace); the server takes an appearance only while the race menu is
open and for a race it offers (ActionListener::OnUpdateAppearance,
E_APPEARANCE_RACE), so every condition that reads ActorTypeUndead judges a
turned player mortal until vampirism and lycanthropy are declared state
(docs/PLAN.md, M5). No lab seat is a vampire.
