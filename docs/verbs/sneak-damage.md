# Verb: sneak damage

From Eli's first T4 playtest (2026-10-04): a sneak attack showed its bonus on
the attacker's screen, but the damage did not follow. SkyMP's server formula
multiplies a kept sneak attack by a flat 1.3
(skymp5-server/cpp/server_guest_lib/formulas/TES5DamageFormula.cpp, upstream's
own `TODO(GM-613): get from GameSettings`), while the game's base multipliers
are 2 to 3 by weapon type.

## Intent

A sneak attack does the damage Skyrim gives it: the base multiplier for the
attacker's weapon type, from the game's own settings.

Roadmap reference: none (SkyMP's TODO GM-613)
Milestone: M1   Class: A (a server rule over facts it holds)

## Authority

Rung: R0. The server computes damage numbers (CLAUDE.md, rung R0); this verb
changes one factor of that computation.
- Why not lower: the client already reports the flag, and the damage-flags
  verb keeps it only while the server holds the attacker sneaking
  (docs/verbs/damage-flags.md). The multiplier is data the server has.
- Bounds: the multiplier comes from the master files, never from the client.

## Engine surface

- **The base multipliers are game settings in Skyrim.esm** (lab/esm.py find
  GMST CombatSneak, 2026-10-04):

  | GMST | form id | value |
  | --- | --- | --- |
  | fCombatSneak1HSwordMult | 0x00050DA2 | 3.0 |
  | fCombatSneak1HMaceMult | 0x00050DA1 | 3.0 |
  | fCombatSneak1HAxeMult | 0x00050DA0 | 3.0 |
  | fCombatSneak1HDaggerMult | 0x00050D9F | 3.0 |
  | fCombatSneak2HSwordMult | 0x00069F47 | 2.0 |
  | fCombatSneak2HAxeMult | 0x00069F48 | 2.0 |
  | fCombatSneakHandMult | 0x00050DA3 | 2.0 |

- **No setting names bows, crossbows or staffs.** Their sneak attacks are
  out of this verb; they keep SkyMP's 1.3 until a ranged verb measures them.
- **The weapon type** is the WEAP record's DNAM animation type, which libespm
  already reads (libespm/include/libespm/WEAP.h, `AnimType`: 0 hand to hand,
  1 to 4 one-handed sword, dagger, axe, mace, 5 and 6 two-handed sword and
  axe, 7 bow, 8 staff, 9 crossbow). An unarmed hit's source is the unarmed
  weapon (0x1F4), animation type 0.
- **The engine's hit data** carries the bonus it applied:
  `RE::HitData::sneakAttackBonus` (CommonLibSSE-NG
  include/RE/H/HitData.h:70). Perks raise it through the entry point
  `kModSneakAttackMult` (include/RE/B/BGSEntryPoint.h:31).
- **HYPOTHESIS:** the base multiplier of a hit without perks is exactly the
  weapon type's GMST. `fDamageSneakAttackMult` (1.0) and
  `fCombatSneakAttackBonusMult` (100.0) may scale it, and their roles are
  not established. The Dynamic plan below checks the engine's own number.

## Observe, impose, suppress

- Observe: OnHit's sneak flag and source, as today.
- Impose: the target is told its health as usual; the damage is the
  server's.
- Suppress: nothing.

## Message contract

- None new. OnHit (17) unchanged.

## Server

- **The rule** (ADR-020) is Rust, in wire-rules `damage`: the multiplier for
  a kept sneak attack, from the weapon's animation type and the table of
  game settings the core read from the master files. For a type without a
  setting, SkyMP's 1.3 stays.
- **The core** (TES5DamageFormula) gathers the hit's weapon animation type
  and the seven settings, and asks.
- **Perks** (Backstab, Assassin's Blade, Deadly Aim) are progression, which
  the server owns from M5. Until then a player's sneak attack gets the base
  multiplier, as a character without those perks does.
- DB fields: none.

## Client

- None.

## Tests

- **T0, cargo:** the multiplier for each animation type, the 1.3 fallback,
  and a table missing a setting.
- **T0, ctest:** a kept sneak hit with an iron sword deals 3 times the plain
  hit's damage, bare-handed 2 times.
- **T2:** difftest session sneak-damage. c1 moves with sneaking set, then
  hits c2 bare-handed flagged as a sneak attack. The legacy server applies
  1.3, the fixed one 2.0 (fCombatSneakHandMult): a declared divergence in
  c2's health.
- **T3, a-sneak-damage:** c1 with an iron sword hits c2 once plainly and once
  sneaking (the engine's sneak toggle, then the attack key).
  - The plain hit leaves c2 above 0.94.
  - The sneak hit leaves c2 below 0.90.
  - The sneak hit's damage is about 3 times the plain hit's, which 1.3
    cannot reach.

## Dynamic plan

- A screenshot right after the T3 sneak hit shows the engine's own message,
  "Sneak attack for 3.0x damage!" for the iron sword (sSuccessfulSneakAttack
  Main/End). That is the engine's multiplier for a one-handed sword with no
  perks. The same with bare hands should read 2.0x.
- If the message shows another number, the GMST table is not the whole
  formula, and the HYPOTHESIS above stays open for the re-analyst (HitData
  sneakAttackBonus's writer).

## Status

- [x] doc complete, rung declared (R0)
- [x] engine surface cited (GMSTs, WEAP animation type, HitData)
- [ ] server logic + T0
- [ ] message + validator (none: no message changes)
- [ ] native hook + T1 (none)
- [ ] TS handler (none)
- [ ] T2 green
- [ ] T3 scenario green, no HYPOTHESIS tags
- [ ] ledger and suppression registry updated (no native touched)
