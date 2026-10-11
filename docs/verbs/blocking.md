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
  iStaggerAttackChance 50). UESP's 1.5 does not match fBlockSkillMult's 2.0,
  and neither names fBlockMax: HYPOTHESIS which the engine uses, until the
  Dynamic plan measures the engine's own blocked damage.
- The block's cone: no setting named for it among the masters' GMSTs;
  UNKNOWN, measured (Dynamic plan) before the server's 1 radian is kept or
  replaced.
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
- Owner: agent.

## Status

Doc written 2026-10-10, before any code.

- [ ] doc complete, rung declared
- [ ] engine surface cited or delegated
- [ ] server logic + T0
- [ ] message + validator (same commit)
- [ ] native hook + T1
- [ ] TS handler
- [ ] T2 green
- [ ] T3 scenario green, no HYPOTHESIS tags
- [ ] ledger and suppression registry updated
