# Verb: blocking

## Intent

A player who blocks an attack (shield or weapon raised, facing the attacker)
takes the damage the game's own block rules leave, decided by the server; a
shield, and only a shield, stops arrows; a bash is a real bash. (The stagger
a bash or a blocked power attack causes is the stagger verb's, below.)

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
Why not R1 for the blocked decision: everything it needs is already on the
server; the attacker's game sees the target's block only through a relayed
animation, a round trip late.
Rate limit / bounds: OnHit's own (melee's and marksman's).

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
- The stagger, for the stagger verb (docs/PLAN.md M2 5a): the victim's game
  plays it from an animation event (staggerStart); every observer's game
  refuses staggerStart on a remote figure today (skymp5-client
  deathService.ts:45-57, a sendAnimationEvent hook over 0xff000000 to
  0xffffffff), so a figure never staggers. How the engine starts a stagger
  on demand is that verb's probe; nothing here depends on it.
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

- Mechanism: the server's damage as any hit (ChangeValues to the victim,
  whose own game shows that number: a figure's hit lands nothing there,
  x-block-probe); scripts on the server hear the server's verdict (the
  Papyrus OnHit event's abHitBlocked).
- Visual without simulation achieved by: the block's own animations, which
  each game plays from the relayed block (the victim's blockHitStart, the
  attacker's recoilStart, x-block-probe).
- Side effects: the attacker's game plays its block effects on the figure
  from its own verdict; where the server's differs (a block the attacker's
  game saw late), that game shows the wrong effect for a moment, and the
  damage is the server's either way.

## Suppress (engine's own behavior blocked on non-hosts)

- What is suppressed: nothing new (a figure's blocked or unblocked hit
  already lands nothing in the victim's game).
- How: none.
- Release condition: none.
- Side effects: none.

## Message contract

- No new message: OnHit in, ChangeValues out.
- Validator rules: unchanged (OnHit's budget is melee's).
- Idempotency / ordering: one verdict per hit the server takes.
- Contract doc updated: no change.

## Server

- Where the logic lives: wire-rules block (Rust, ADR-010): blocked or not
  from the facts (the target's recorded block, its heading against the
  attacker's position within the engine's cone, an arrow or a bolt, a
  shield in hand by its biped slot), and the share a block stops by the
  engine's formula from the masters' settings (the shield's rating or the
  attacker's weapon damage, the blocker's Block and ShieldPerks from the
  actor-values record, a backed power attack, the cap); wire-rules damage
  backs a bash claim by the attacker's bashStart. The C++ core
  (ActionListener's BlockedShare, OnHit's flag facts) gathers the facts and
  applies the share once, before the Papyrus OnHit event.
- DB fields / migration: none.
- Restart behavior: none (the block is live state).
- Papyrus natives touched: none.

## Client

- SP binding: none new.
- TS handler: none new.
- Kill switch config key: none (the server's rule).

## Tests

- T0: wire-rules block (a shield's share at Block 15 and 100, with
  ShieldPerks, on a power attack; the weapon line; the cone at 0, 30, -34
  degrees in and 45, 90, 135, 180 out, headings wrapping, nonsense refused;
  no block without one; an arrow stopped by a shield only; the cap) and
  damage (a bash flag needs a bashStart within 3 s); the server
  (BlockingTest: the shield's share facing whatever the attacker's game
  says, the whole hit from behind or unblocked whatever it says, the weapon
  line; HitTest: a bash flag counts only after its bashStart).
- T1: none.
- T2: difftest session blocking (fork m2-block f828279f): c2 steps 50
  units east of the spawn turned to face c1; c1's first bare-handed hit
  claims a block c2 never raised (the legacy server deals a tenth on the
  claim, the fixed one the whole hit), then c2 raises its block (blockStart,
  a step with isBlocking) and the second hit claims none (the legacy server
  blocks by its 1 radian test and deals a tenth; the fixed one blocks by
  its records and stops the empty-handed share, fBlockWeaponBase 0.3, as
  Unarmed's damage is 0, Skyrim.esm WEAP 0x1F4). Declared from the formula
  before the run, to be checked against it.
- T3 scenario id: lab/scenarios/b-block.yaml: c1's full-draw arrow on c2's
  raised Iron Shield facing it is stopped by the shield's share, on c2's
  raised sword not at all; c1's Iron Sword swing on the raised shield facing
  it is stopped by the shield's share, from behind and from 45 degrees off
  (outside the engine's 35, inside the old 1 radian) not at all, on the
  raised sword alone by the weapon line; c2's game agrees with the server
  after each.
- Assertions that would fail if the verb silently regressed: c2's health
  after each hit on the server, bounded on both sides (the shield's share
  against the old tenth and against a whole hit; the cone's 45 degrees; an
  arrow on a sword unblocked), and c2's own game within 0.02 of it.

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
- Open: the weapon line. x-block-probe2's 27 percent took its unblocked
  swings with the shield worn (armor on the figure) and its weapon swings
  without, so the two do not compare; the re-analyst's line gives 31.4 to
  31.8 percent with the Iron Sword's 7. x-weapon-block-probe (thuum
  scratchpad, by path): c2 holds the Iron Sword alone throughout; unblocked,
  sword-blocked and unblocked again, two swings and one watch of c1's a
  phase; the ratio of the blocked swings to the unblocked ones is 1 minus
  the engine's share. Owner: agent, on the m2-block server before b-block.

## Status

Doc written 2026-10-10, before any code. Building on fork branch m2-block,
stacked on m2-god 35acc275: 7d438879 the rule (wire-rules block), 0ecbaed7
the server (OnWeaponHit decides the block before the Papyrus OnHit event,
the attacker's verdict logged and never trusted, the formula's tenth gone,
the shield by its biped slot; BlockingTest), e911dd2b the engine's formula
and cone (the re-analyst's reading). 1e0e89bf the bash's backing
(bashStart among the attacker's events within 3 s; E_HIT_BASH). f828279f
the difftest session (fork pipeline 1213). Left: T2, x-weapon-block-probe,
b-block (drafted in thuum's scratchpad), all chained after the m2-god merge
sweep (2026-10-10 evening); the stagger went to its own verb.

- [ ] doc complete, rung declared
- [ ] engine surface cited or delegated
- [ ] server logic + T0
- [ ] message + validator (same commit)
- [ ] native hook + T1
- [ ] TS handler
- [ ] T2 green
- [ ] T3 scenario green, no HYPOTHESIS tags
- [ ] ledger and suppression registry updated
