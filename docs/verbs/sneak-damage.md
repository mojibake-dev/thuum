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

  The same values, by weapon, are UESP's table of sneak attack multipliers:
  one-handed weapons and daggers 3x, two-handed weapons and unarmed 2x
  ([UESP, Skyrim:Sneak](https://en.uesp.net/wiki/Skyrim:Sneak)).
- **No setting names bows, crossbows or staffs.** UESP gives bows 2x, but no
  Skyrim.esm setting carries it. Ranged sneak attacks are out of this verb;
  they keep SkyMP's 1.3 until a ranged verb finds where the engine's number
  comes from and measures it.
- **The weapon type** is the WEAP record's DNAM animation type, which libespm
  already reads (libespm/include/libespm/WEAP.h, `AnimType`: 0 hand to hand,
  1 to 4 one-handed sword, dagger, axe, mace, 5 and 6 two-handed sword and
  axe, 7 bow, 8 staff, 9 crossbow). An unarmed hit's source is the unarmed
  weapon (0x1F4), animation type 0.
- **The engine's hit data** carries the bonus it applied:
  `RE::HitData::sneakAttackBonus` (CommonLibSSE-NG
  include/RE/H/HitData.h:70). Perks raise it through the entry point
  `kModSneakAttackMult` (include/RE/B/BGSEntryPoint.h:31).
- **CONFIRMED (exploratory run 20261004-212438):** the base multiplier of a
  hit without perks is the weapon type's setting. After c1's sneak hit with
  the iron sword, c1's screen read "Sneak attack for 3.0X damage!", which is
  fCombatSneak1HSwordMult (screenshot 015-c1.png in the run). The other
  types use their own settings by name, and UESP's values agree with every
  one. `fDamageSneakAttackMult` (1.0) and `fCombatSneakAttackBonusMult`
  (100.0) have roles no one has established. At their Skyrim.esm values
  they leave a perkless hit at the setting. A load order that changes them
  is out of this verb.

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
- **T2:** no new session. A kept sneak attack needs the server to hold the
  attacker sneaking, which comes from its movement. Neither fakeclient can
  mark a move sneaking: the wire one's move step takes dx, dy, dz and
  runMode only, and the legacy one is frozen with the RakNet image. The
  arithmetic is T0 on the real formula; the whole chain is T3. T2 is the
  nine existing sessions, unchanged.
- **T3, a-sneak-damage:** c1 with an iron sword hits c2 once sneaking and
  then once plainly. Left Ctrl (29) toggles the engine's sneak, and Home
  (199) is the attack key on the clones.
  - The sneak hit comes first. The engine grants a sneak attack only while
    the target has not detected the attacker, and a hit is detection.
  - c2 regenerates about half a percent of its health a second, so each
    check comes 2 s after its hit.
  - The sneak hit leaves c2 between 0.75 and 0.87. The exploratory run
    measured about 0.81. SkyMP's 1.3 would leave about 0.92, and 2.0 about
    0.87.
  - The plain hit leaves c2 between 0.90 and 0.98 (measured about 0.935):
    it lands, and it is not a sneak attack.

## Dynamic plan

- Done for the iron sword. The exploratory run 20261004-212438 took a
  screenshot right after the sneak hit: "Sneak attack for 3.0X damage!".
  The scenario keeps a screenshot after its own sneak hit.
- Bare hands should read 2.0x. That is a check in the second T4 playtest
  (docs/private). A lab run of it needs a lab-driver step that unequips the
  sword, which does not exist yet.

## Status

- [x] doc complete, rung declared (R0)
- [x] engine surface cited (GMSTs, WEAP animation type, HitData)
- [x] server logic + T0 (wire-rules `damage::sneak_mult` with its cargo
      tests; TES5DamageFormulaTest in ctest with the master files, pipeline
      715: all 265 test cases passed)
- [x] message + validator (none: no message changes)
- [x] native hook + T1 (none)
- [x] TS handler (none)
- [x] T2 green (the nine sessions against the m1-sneak build, 2026-10-04)
- [x] T3 scenario green, no HYPOTHESIS tags: a-sneak-damage on 1.7.104
      (run 20261004-213205) and 1.6.1170 (run 20261004-213505), the sneak
      hit leaving c2 at 0.8051 and the plain one at 0.935 on both
- [x] ledger and suppression registry updated (no native touched)
