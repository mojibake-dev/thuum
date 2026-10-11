# Verb: blocking

## Intent

A player who blocks an attack (shield or weapon raised, facing the attacker)
takes the damage the game's own block rules leave, decided by the server; a
shield, and only a shield, stops arrows; a bash is a real bash; and the
stagger a bash or a blocked power attack causes shows on the right screens.

Roadmap reference: skymp/ROADMAP.md "Blocking" ("The ability to repel an
attack may require 'Reverse Animation Events'"); "Anims triggered by enemy"
("Usually in PvP. Stagger ...").
Milestone: M2 (Eli, docs/private/decisions-m2.md question 1: the fifth verb)
Class: B
Scope note (2026-10-10): the stagger (a bash's or a blocked power attack's,
imposed on the victim's game and shown to observers) leaves this verb for
one of its own under the roadmap's "Anims triggered by enemy" (docs/PLAN.md
M2 5a): how a game starts a stagger on demand needs its own probe, and the
engine's own rules for it are in the notes below. This verb is the blocked
decision, its share, the shield and the cone, and the bash's backing.

## Authority

Rung: R0 for whether a hit was blocked and what it does; R2 for the block
itself.
- The block is the blocker's own game's: it raises the shield or weapon and
  reports it (the blockStart and blockStop animation events and the movement
  report's isBlocking; recorded, R2).
- Whether a given hit was blocked is the server's: the target's recorded
  block, its facing against the attacker's position (both on the server),
  and, for an arrow or a bolt, a shield in the target's hands by the
  server's equipment record and the shield's records. The damage a block
  leaves is the server's (ADR-028).
- The attacker's game's own verdict (OnHit's isHitBlocked) is read and
  logged, never trusted: the server decides from its own records.
- A bash (OnHit's isBashAttack) counts only when the attacker's recorded
  animation events show one, as damage-flags backs a power attack
  (docs/verbs/damage-flags.md, wire-rules damage::backed_flags).
- A stagger from a bash, or from a power attack on a block, is imposed on
  the victim's own game by the server (the victim's game never sees the
  hit) and shown to observers.
Why not R1 for the blocked decision: everything it needs is already on the
server; the attacker's game sees the target's block only through a relayed
animation, a round trip late.
Rate limit / bounds: OnHit's own (melee's and marksman's); the stagger, one
per hit.

## Engine surface

- What the server does today (fork parity 45839102):
  - the block: AnimationSystem's blockStart and blockStop set
    MpActor::SetIsBlockActive (AnimationSystem.cpp:13-31), and five movement
    reports without isBlocking clear it (ActionListener.cpp:213-247);
  - the decision: OnWeaponHit marks a hit blocked when the target's block
    is active and ShouldBeBlocked holds (the attacker within 1 radian of the
    target's view, ActionListener.cpp:2030-2040, 2582-2626);
  - arrows: a remote bow attack is blocked only "by a shield", tested as any
    worn armor whose equipSlotId is above 0 (ActionListener.cpp:2603-2622),
    which is no shield test;
  - the claim: the attacker's isHitBlocked is never cleared, so its game's
    verdict stands when the server's test fails;
  - the damage: a blocked hit counts a tenth (formulas/TES5DamageFormula.cpp:
    215-218, "TODO(#460): implement correct block formula");
  - the bash flag is trusted as sent; no stagger anywhere (thuum scratchpad
    m2-survey.md, 2026-10-09).
- What the game does (UESP, "Skyrim:Block", en.uesp.net/wiki/Skyrim:Block,
  read 2026-10-10): with a shield, "Blocked Damage % = (45 + 0.2 x
  BaseShieldArmorRating x (1 + BlockSkill x 1.5 / 100)) x (1 + Shield Wall
  perk) x (1 + Enchantments) x (1 + Potion) x (fBlockPowerAttackMult if power
  attack)"; with a weapon, the same with "30 + 0.2 x EnemyWeaponBaseDamage";
  bashing "carries a chance of staggering an opponent and of interrupting an
  opponent's power attack".
- The game settings, read from Skyrim.esm with lab/esm.py (2026-10-10):
  fShieldBaseFactor 0.45, fShieldScalingFactor 0.2, fBlockWeaponBase 0.3,
  fBlockWeaponScaling 0.2, fBlockSkillMult 2.0, fBlockMax 0.7,
  fBlockAmountWeaponMult 1.0, fBlockPowerAttackMult 0.66,
  fStaminaBlockDmgMult 0.25, fStaminaBlockBase 0, fShieldBashMin 0.05,
  fShieldBashMax 0.25, fShieldBashPCMax 0.25, iPerkBlockDisarmChance 50,
  and the stagger set (fStaggerBlockBase 0.001, fStaggerBlockMult 0.005,
  fStaggerBlockAttackMult -0.0001, fStaggerBlockAttackShieldBase 0.01,
  fStaggerBlockAttackShieldMult 0.001, fStaggerBlockingMult 0,
  fStaggerMassOffsetBase 2.1, fStaggerPlayerMassMult 2.5, fStaggerMin 0,
  iStaggerAttackChance 50), and fArmorRatingBase 1.0, fArmorRatingMax 2.5.
- The engine's own reading (thuum ghidra/notes/block-formula.md, the
  re-analyst on 1.7.104 under Address Library IDs shared with 1.6.1170,
  2026-10-10; HYPOTHESIS by rule 2 except where the lab agrees):
  - the share, ID 26425, from the hit's damage adjustment (ID 44014): S =
    fArmorRatingBase + (fArmorRatingMax - fArmorRatingBase) x Block / 100
    (so UESP's 1.5); with a shield, fShieldBaseFactor + (S + ShieldPerks,
    actor value 66) x the shield record's rating x fShieldScalingFactor /
    100; without one, fBlockWeaponBase + S x the attacker's weapon damage x
    fBlockWeaponScaling / 100 (the blocker's own weapon never enters); times
    fBlockPowerAttackMult on a power attack; then the perk entry point
    kModPercentBlocked; capped at fPlayerMaxResistance / 100 (85 in the
    executable; the masters set none); the damage after armor times (1 -
    share). fBlockSkillMult, fBlockMax, fBlockSkillBase,
    fBlockAmountWeaponMult and fBlockAmountHandToHandMult are read nowhere.
    The lab agrees: an Iron Shield stopped 50.0 percent at Block 15 to 20,
    the formula 49.9 to 50.2 (x-block-probe2);
  - the cone, ID 47297: fCombatHitConeAngle (35, the executable's; no
    master sets it) each side of the blocker's heading, yaw only; the lab
    agrees (no block at 45 degrees);
  - arrows skip the cone: an arrow is a block candidate only when it strikes
    the shield's collision body (ArrowProjectile::AddImpact, ID 43710), so a
    raised sword never stops one;
  - every blocked hit has the victim perform kActionBlockHit (ID 37707) and
    a melee attacker that is not bashing perform kActionRecoil (ID 37708):
    the lab's recoilStart in the attacker's own events;
  - the stagger, ID 37710 (from the victim's hit processing, ID 38586): a
    blocked hit, or any bash, with stagger above 0 always staggers, others
    at iStaggerAttackChance; the magnitude the attack's stagger less a block
    reduction (ID 26426), at least fStaggerMin; a bash on a blocker times
    fStaggerBlockingMult, 0 in the masters, so it never staggers unless it
    lands during the target's attack (then kActionLargeRecoil); it sets the
    graph floats staggerMagnitude and staggerDirection and performs
    kActionStaggerStart;
  - stamina, ID 26430: a blocked hit drains share x the damage before armor
    x fStaminaBlockDmgMult + stagger x fStaminaBlockStaggerMult (5 in the
    executable) + fStaminaBlockBase.
- The block's cone: fCombatHitConeAngle, above; the server's 1 radian
  (57 degrees each side) was wider than the engine's 35.
- A shield in the records: an ARMO whose biped slots include the shield's,
  BGSBipedObjectForm::BipedObjectSlot::kShield, 1 << 9 (CommonLibSSE-NG
  include/RE/B/BGSBipedObjectForm.h:22), which libespm's ARMO reader can
  test from BOD2 (libespm ARMO.cpp, as headshot's head slots).
- The stagger: the victim's game plays it from an animation event
  (staggerStart); every observer's game refuses staggerStart on a remote
  figure today (skymp5-client deathService.ts:45-57, a sendAnimationEvent
  hook over 0xff000000 to 0xffffffff), so a figure never staggers.
  HYPOTHESIS: how the engine starts a stagger on demand (an animation event
  with the stagger's direction and magnitude graph variables, or Papyrus
  Debug.SendAnimationEvent on the player alone), measured.
- Stamina: a blocked hit drains the blocker's stamina in the game
  (fStaminaBlockDmgMult); the server's stamina rule is the blocker's own
  game's report today (R2). Kept so in this slice.

## Observe (host or acting client sees the intent before the engine acts)

- Hook point: none new. The block is the blocker's animation events and
  movement (as now); the hit is OnHit (as now); the bash, the attacker's
  animation events (the server already records the last ones per actor).
- SP filter: as now.
- Data captured: OnHit's isHitBlocked and isBashAttack, read as claims.
- Side effects of hooking here: none new.

## Impose (observers render the server's decision)

- Mechanism: the server's damage as any hit (ChangeValues to the victim);
  for a stagger, an SpSnippet to the victim's own game that starts its
  player's stagger (HYPOTHESIS: which call, Dynamic plan), whose animation
  then relays to observers as any of its events.
- Visual without simulation achieved by: the stagger's animation on the
  victim's figure in observers' games, once deathService lets a relayed
  staggerStart through for a stagger the server imposed.
- Side effects: HYPOTHESIS (the attacker's game plays its own block and
  stagger effects on the figure from its own verdict; where the server's
  verdict differs, that game shows the wrong one for a moment).

## Suppress (engine's own behavior blocked on non-hosts)

- What is suppressed: nothing new; deathService's staggerStart refusal on
  figures is narrowed to staggers the server did not impose (or replaced by
  the impose path above).
- How: the sendAnimationEvent hook's filter.
- Release condition: none.
- Side effects: HYPOTHESIS (why the refusal exists: a stagger playing twice
  or knocking a figure out of sync; the Dynamic plan watches for it).

## Message contract

- No new message: OnHit in, ChangeValues, SpSnippet and the animation
  relay out.
- Validator rules: unchanged (OnHit's budget is melee's).
- Idempotency / ordering: one stagger per hit.
- Contract doc updated: no change.

## Server

- Where the logic lives: a Rust rule (wire-rules damage or a new block
  module, ADR-010): blocked or not from the facts (the target's block, its
  facing, the attacker's direction, the source a bow or a crossbow, a shield
  in hand), the fraction a block stops by the game's formula from the
  masters' settings (the shield's armor rating or the attacker's weapon
  damage, the blocker's Block skill from actor-values, a power attack), the
  bash backed by the attacker's animation events, and whether the hit
  staggers. The C++ core gathers the facts (equipment and its records, the
  skill, the animation events) and applies the result.
- DB fields / migration: none.
- Restart behavior: none (the block is live state).
- Papyrus natives touched: none on the server; the stagger's snippet a
  client native or Papyrus call (a NATIVES line if new).

## Client

- SP binding: none new unless the stagger needs one (Dynamic plan).
- TS handler: deathService.ts (the stagger refusal narrowed).
- Kill switch config key: none (the server's rule).

## Tests

- T0: wire-rules (blocked when blocking and facing within the cone, not
  from behind, not unblocking; an arrow blocked by a shield only; the
  shield's and the weapon's fractions at Block 15 and 100, a power attack's
  multiplier; a bash claim without its animation event refused; the
  stagger's cases); the server (a blocked hit's damage by the formula; the
  attacker's isHitBlocked ignored both ways; the shield test by BOD2).
- T1: none.
- T2: a difftest session: c2 blocks (blockStart) facing c1, c1 hits it
  claiming not blocked, then from behind claiming blocked: the legacy
  server's tenth and trusted claim against the fixed server's decision.
  Declared.
- T3 scenario id: lab/scenarios/b-block.yaml: c2 raises a shield (an Iron
  Shield) facing c1; c1's sword hit takes the game's blocked share on the
  server and in c2's game; the same hit from behind takes the full damage;
  c1's arrow is stopped by the shield and not by a raised sword; c1's bash
  staggers c2 on c2's screen and on c1's.
- Assertions that would fail if the verb silently regressed: c2's health
  after each hit (blocked by the formula, unblocked in full, arrow blocked
  by a shield only); the stagger seen.

## Dynamic plan (fill when any tag above is still HYPOTHESIS)

- x-block-probe: c2 with an Iron Shield (Skyrim.esm, its armor rating and
  BOD2 read with lab/esm.py) raises it (a held block key, a driver hold-key)
  facing c1; c1 hits c2's figure five times with an Iron Sword, under c1's
  watch of c2's figure (the engine's own damage on the figure in c1's game
  for the frame before the server's number, as x-bow-damage read arrows):
  the engine's blocked share at the clones' Block skill; then from 90 and
  135 degrees off c2's facing (the cone); then a power attack (its
  multiplier); then c1 bashes (its animation events, whether c2's figure
  staggers in c1's game, whether c2's own game staggers: it should not
  today); the same with a sword raised instead of the shield (the weapon
  formula). Read: the formula's constants, the cone, the bash's events,
  the stagger's events and variables in the attacker's game.
- Expected: a blocked share near UESP's at the clones' Block skill; a cone
  near 1 radian or a setting found; a bash with its own animation events.
- x-block-probe 20261011-021114 (fork m2-effects 9e038edd, green):
  - a block raised by the graph (anim-event blockStart) is a block to the
    engine: c2's own game played blockAnticipateStart and blockHitStart at
    c1's figure's swings, and c1's own events show recoilStart after each of
    its three swings at the facing blocker (none from behind, none at a
    lowered block): the attacker's recoil, kActionRecoil (above); CONFIRMED
    that the attacker's game decides blocks from the relayed animation;
  - the engine's damage on the blocking figure in c1's game: 2.875, 2.938,
    2.875 a swing; the unblocked swings fell outside the watch (it keeps
    256 samples), so the blocked share is still open;
  - the server's verdicts matched the engine's in each phase (0.6328, a
    tenth of 6.328, for the three facing swings and the bash; 6.328 from
    behind and with the block lowered), its 1 radian untested between
    head-on and behind;
  - c2's own health followed the server's numbers alone (99.38 for the
    server's 0.993672): a figure's swing that lands in the victim's game
    deals nothing there;
  - the bash: bashStart then recoilStart in c1's game, blocked on the
    server; no stagger anywhere.
- x-block-probe2 20261011-031501 (fork m2-god 35acc275, the server's old
  block logic; one watch of c1's per phase; the engine's damage on c2's
  figure in c1's game):
  - shield block facing: 2.875 and 2.875 (recoil each); unblocked facing:
    5.688 and 5.75; so the Iron Shield (rating 20) at c2's Block stopped
    50.0 percent (UESP's formula gives 50.2 at Block 20, profile 2 being
    an Orc, 49.9 at 15; HYPOTHESIS the exact terms, the re-analyst's
    ghidra/notes/block-formula.md to settle);
  - the cone: turned 45, 90 and 135 degrees off c1, a raised shield blocked
    nothing (5.75, no recoil), so the engine's cone is under 45 degrees,
    while the server's 1 radian (57) still blocked the 45 degree swing
    (0.6328 in its log): a real disagreement for the rule to fix;
  - a power attack sent as attackPowerStartInPlace hit as a plain swing
    (2.875 on the shield, the server's flag not backed): no power attack
    measured; the multiplier waits for a real one (a held key);
  - a block with the sword alone: 4.188 against 5.75, about 27 percent
    stopped (UESP's weapon formula gives about 31.8 with the Iron Sword's
    7); the phase's other reading (74.56) fell on a server correction of
    the figure's health, not a swing;
  - c2's own game played its block-hit animations for both blocks.

## Status

Doc written 2026-10-10, before any code. Building on fork branch m2-block,
stacked on m2-god 35acc275: 7d438879 the rule (wire-rules block), 0ecbaed7
the server (OnWeaponHit decides the block before the Papyrus OnHit event,
the attacker's verdict logged and never trusted, the formula's tenth gone,
the shield by its biped slot; BlockingTest), e911dd2b the engine's formula
and cone (the re-analyst's reading). 1e0e89bf the bash's backing
(bashStart among the attacker's events within 3 s; E_HIT_BASH). Left: CI,
T2, b-block (the stagger went to its own verb).

- [ ] doc complete, rung declared
- [ ] engine surface cited or delegated
- [ ] server logic + T0
- [ ] message + validator (same commit)
- [ ] native hook + T1
- [ ] TS handler
- [ ] T2 green
- [ ] T3 scenario green, no HYPOTHESIS tags
- [ ] ledger and suppression registry updated
