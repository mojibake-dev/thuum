# Verb: hit cone

M1 validation, "damage range and angle" (docs/PLAN.md). This is the angle
half; docs/verbs/melee-reach.md is the range half. DONE 2026-10-04, on
parity 64ba89a4.

## Intent

The server refuses a player's melee hit on a target outside the attacker's
facing, as the game's own hit test would: a hit landing behind the attacker
is a forged one.

Roadmap reference: none. SkyMP checks no angle (docs/verbs/validation.md).
Milestone: M1   Class: A (a server rule over facts it holds; the lab measures
the edge)

## Authority

Rung: R1. The attacking client computes the hit; the server validates it.

- **Why not R0.** The server would have to run the engine's swing: the pick,
  the eye cast, animation timing. That is the host client's simulation, which
  we do not reimplement.
- **What the server validates.** The angle between the attacker's heading
  and the direction to the target, in the ground plane (the engine ignores
  pitch and height), against the attack's cone plus slack.
- **What it uses:** the attacker's heading and both positions as the server
  records them (UpdateMovement).

## Engine surface

From the melee-reach Ghidra reading (ghidra/notes/melee-reach-1-7-104.md,
1.7.104, HYPOTHESIS):

- **The angular test** is Address Library 47297. It passes a hit when
  |heading + attackAngle + the player's aim offset - yaw(target - attacker)|
  <= strikeAngle x m. In that formula:
  - m is 1 for the pick and fMeleeSweepViewAngleMult (2) for a sweep's extra
    targets;
  - a dead target gets fCombatDeadActorHitConeMult (2) more;
  - strikeAngle is a half angle from the attack's ATKD;
  - fCombatHitConeAngle (35) is only the default for attack data that has
    none.
- **The eye cast fallback** sweeps a 12-unit sphere along the attacker's eye
  direction for 150 units when the pick finds nothing. It has no cone, but it
  only reaches what the attacker looks at.
- **Strike angles in the lab's Skyrim.esm** (`lab/esm.py attacks`,
  2026-10-04):
  - the ten playable races' widest is 50, their basic right swing
    attackStart; DarkElfRace's is 35;
  - every other attack is 35, and attackAngle is 0 throughout;
  - the playable vampire races match their base races;
  - creatures run to 180 (a giant's stomp).
- **Update.esm overrides NordRace and NordRaceVampire** with four mounted side
  attacks (attackStart_MC_1HMRight and its kin: attack angle 90 or -90,
  strike angle 85), which aim a rider's cone to its side.
  - The first build counted them, so every Nord's bound on foot came out at
    130 degrees (the ctest log of pipeline 648).
  - The rule counts forward attacks only (attack angle 0): a Nord's widest
    forward strike angle is 50.
  - Mounted combat is M7, and until it is ruled a mounted side attack can be
    refused.
- **The player's aim offset** (ID 41248) was not followed.

## Measured (2026-10-04)

All on the m1-time server, which has no cone check, so the engine alone
decided. Setup: c2 stands 120 units due north of c1; c1 is a Nord with an
IronSword and swings with attackStart.

| run | c1's heading (degrees off c2) | swing |
| --- | --- | --- |
| 20261004-045109 (x-melee-cone-probe) | 0, 30 | lands |
| 20261004-045109 | 45, 55, 65, 80, 100, 135, 180, 315 (that is, -45) | misses |
| 20261004-045647 (x-melee-cone-probe2), after a console sets fCombatHitConeAngle 180 | 60, 90, 135, 180 | lands |

- **The live settings** in the same run: fCombatHitConeAngle 35,
  fMeleeSweepViewAngleMult 2, fCombatDeadActorHitConeMult 2.
- **The player's swing uses fCombatHitConeAngle's 35, not attackStart's 50.**
  That matches the edge between 30 and 45 once the target's width at 120
  units is added, and the cheat widening it. So for a player the attack data
  is absent and the engine falls back on the setting, which a console
  changes at will. The server cannot take the client's cone; it holds its
  own.

## Rule

`wire-rules/src/melee.rs` holds the rule, beside the reach (ADR-020).

- **Angle.** The angle between the server's record of the attacker's heading
  and the target, in the ground plane (the engine's yaw), may not exceed
  max(fCombatHitConeAngle 35, the attacker race's widest ATKD strike angle)
  x (fMeleeSweepViewAngleMult 2 for a kept power attack, else 1) + 45.
- **The 45 of slack** covers a heading up to one movement report (130 ms)
  old and the aim offset the engine adds, which the server does not see.
- **What that gives:**
  - a Nord: 95 degrees, 145 for its sweep;
  - a Dunmer, or a race without attack data: 80, and 115.
- **Exceptions.** Dead targets and a target on top of the attacker pass.
- **Refusal.** A hit outside the bound is dropped and logged E_HIT_CONE.
- **Scope.** Player against player, as the reach is.
- **Inputs.**
  - libespm reads the race's widest strike angle (RACE ATKD);
  - the C++ core passes the heading, the positions and the kept power flag
    (docs/verbs/damage-flags.md).

## Tests

- **T0, cargo.** The bound for a Nord, its sweep, a Dunmer and a race
  without attack data; the lab's swings land and a hit behind does not;
  headings wrap and bearings follow the engine's yaw; the dead and the
  directionless pass. Properties: the cone is symmetric and the angle alone
  decides, and a meaningless strike angle never narrows the sweep.
- **T0, ctest (HitTest).** The reach test's targets stand on the attacker's
  heading. The same player 100 units behind is refused; 30 degrees off, the
  hit lands.
- **T2, difftest melee-cone.** c2 steps 100 units to c1's back (bearing 252
  against c1's start angle of 72), and c1 sends a bare-handed hit. The legacy
  server takes it and the fixed one refuses it, as a declared divergence.
- **T3, a-melee-cone.**
  - c1 swings at heading 0 and at 30 degrees off, and both hits land.
  - Then a console raises fCombatHitConeAngle to 180, and c1 swings with its
    back to c2 (180) and at 135. The engine lands both and the server
    refuses both.
  - On a server without the check those hits land.

## Status

- [x] doc complete, rung declared (R1)
- [x] probe run, edge measured (runs 20261004-045109, -045647)
- [x] server logic + T0 (cargo; ctest on the fork's CI)
- [x] T2 green (2026-10-04, image a08ee1f2): the melee-cone session diverges
      as declared, the six others unchanged
- [x] T3 scenario green: a-melee-cone, run 20261004-055345 (the swings at 0
      and 30 degrees landed; with the cone widened by a console, the swings at
      180 and 135 were refused). a-melee-reach, a-damage-flags and
      smoke-two-players stayed green on the same image (runs
      20261004-055913, -060235, -060556)
- [x] on parity 64ba89a4 (2026-10-04)
- [x] scenario reviewed by Eli (2026-10-04)
