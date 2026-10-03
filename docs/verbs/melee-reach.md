# Verb: melee reach

The fifth item of M1's validation work (docs/verbs/validation.md, Hits and
damage): the server refuses a player's melee hit on another player from
beyond the reach the game itself allows. SkyMP's only bound was 4096 units
(IsDistanceValid sat commented out in ActionListener.cpp): a client could
strike anyone in the same worldspace from most of a cell away.

## Intent

A player's sword reaches as far as the game's would, plus room for the
server's view of both players being a moment old.

Roadmap reference: SkyMP's "incorrect shooting range check" (validation.md);
docs/PLAN.md M1 "Validation: ... damage range and angle"
Milestone: M1   Class: A

## Authority

Rung: R1 (the attacker's client decides the swing and the engine picks its
target; the server validates the hit before applying damage, which is R0).
Why this rung and not the one above it: the swing and its target pick run in
the attacker's engine; the server cannot simulate the swing, only bound it.
What the server validates: on OnHit (MsgType 17) from a player against
another player's actor, with a weapon or bare hands and not a bow or
crossbow shot, the distance between the two actors' recorded positions
against the bound below. Out of scope: hits on NPCs and creatures and hits
by hosted NPCs (their scales and body extents are their own records'; they
keep the 4096 bound), the hit's angle (the cone), spells and arrows.
Rate limit / bounds: unchanged (the weapon-speed cooldown and the splash
window stand).

## Engine surface

All from ghidra/notes/melee-reach-1-7-104.md (re-analyst on the 1.7.104
program, 2026-10-03; Address Library IDs there):

- The pick (ID 38608 through ID 47272): the target whose center lies within
  R + F_a + F_t of the attacker's, where R is the attacker's scale times
  fCombatBashReach for any bash, fCombatDistance times the right-hand
  weapon's DNAM reach, or the race's unarmedReach (ID 38538), and F is an
  actor's forward bound extent times its scale (ID 37443, ID 47276).
- The eye cast (ID 38628), when the pick finds nothing: a sphere of radius
  fHitCasterSizeSmall swept from the eye for fObjectHitWeaponReach (150),
  fObjectHitTwoHandReach (112) or fObjectHitH2HReach (64) by weapon type.
- Scale (ID 19664): refScale times the race's height for the actor's sex
  times the base record's height.

Read in the lab (run 20261003-083828, lab-driver settings): fCombatDistance
141, fCombatBashReach 141 (both Skyrim.esm), fHitCasterSizeSmall 12,
fObjectHitWeaponReach 150, fObjectHitTwoHandReach 112, fObjectHitH2HReach 64,
fCombatHitConeAngle 35, fVATSMeleeReachMult 2 (executable defaults). Race
heights 0.95 to 1.08 and unarmedReach 96 for the ten playable races
(lab/esm.py on the lab's Skyrim.esm; libespm now reads the heights). The
player actors' bound: length 28, width 44, height 128 (Papyrus GetLength,
GetWidth, GetHeight, same run), so F is 14 times scale.

Measured (a Nord, scale 1.03, swinging at another standing still, due
north; runs 20261003-084251 and 20261003-084645; lab-driver anim-event
attackStart on the parity server, which has no reach check, so the engine
alone decides):

| weapon | reach | hit at | missed at | modeled edge |
| --- | --- | --- | --- | --- |
| IronSword | 1.0 | 185 | 190 | 190.8 (the eye cast 162 + 2 * 14.4) |
| SteelGreatsword | 1.3 | about 215 | 230 | 217.6 (the pick 188.8 + 2 * 14.4) |

CONFIRMED for those two at scale 1.03: the edge sits where the model puts
it, within the few units the two clients' positions differ by. Still
HYPOTHESIS (not measured): the bash reach, bare hands (modeled 127.7), the
scale's effect across races, mounted attacks (fMountedAttackRange:Combat
135, measured from the mount) and the cone.

Two lab findings on the way: a teleport's rotation reaches skymp5-client in
degrees and is applied in radians (docs/LAB.md); a hit only lands when the
attacker faces the target, so the measurements stand due north at
rotation 0.

## Observe, impose, suppress

- Observe: unchanged; skymp5-client reports the engine's hit as OnHit.
- Impose: a refused hit does nothing on the server: no damage, no
  ChangeValues to the target, no Papyrus OnHit event.
- Suppress: the server's processing of a refused hit.

## Message contract

- OnHit (MsgType 17): unchanged.

## Server

- Where the logic lives: ActionListener::OnHit and MeleeReachBound (fork
  f9ef96ec, on parity 15eb653d). The bound is max(s_a * max(fCombatBashReach,
  fCombatDistance * the longest reach among the attacker's worn weapons,
  unarmedReach), 162) + 14 * (s_a + s_t) + 256, s being the race's height
  for the actor's sex (refScale and the base record's height are 1 for
  player characters). The server takes the largest reach the attacker's
  equipment allows, since the bash flag is the client's claim, and the
  longest eye cast; the 256 covers positions up to 130 ms stale per actor
  (skymp5-client sends movement every 130 ms, sendInputsService.ts) for two
  actors at sprint speed (500 units a second, Skyrim.esm MOVT), with room
  for latency. A Nord with a sword: 447 units. If a game record the bound
  needs is missing, the hit is not refused (logged).
- A refusal logs E_HIT_REACH with both actors, the distance and the bound.
- DB fields / migration: none.

## Tests

- T0: "A melee hit on a player from beyond reach does nothing"
  (unit/HitTest.cpp, with the lab's master files): an iron sword on a
  player at 400 lands, at 500 and 2000 does not (E_HIT_REACH, bound 447);
  on an actor no user plays, at 2000, it still lands (scope). Green in
  pipeline 602.
- T2: difftest session melee-reach: c2 walks 2000 units off and c1 sends a
  bare-handed hit on it; the legacy server lowers c2's health (ChangeValues),
  the fixed server refuses it. Green on m1-melee, 2026-10-03, with the four
  other sessions.
- T3: lab/scenarios/a-melee-reach.yaml (awaiting Eli's review): c1's real
  swing at c2 180 units off lands; then c1 raises its own fCombatDistance to
  1000 (lab-driver set-gmst, the console's setgs) and its engine lands a
  swing on c2 from 519 units. Red on parity at that assert (run
  20261003-091943: the hole), green on m1-melee (run 20261003-092301:
  E_HIT_REACH, 519 units against a bound of 447). The level strip south of
  lab-spawn (x 0, y -546 to -66) hosts it: north of lab-spawn the summit
  drops away (run 20261003-091513).

## Status

- [x] engine surface statically analyzed (re-analyst) and the edge measured
  for two weapons
- [x] server logic + T0
- [x] T2 green
- [x] T3 scenario green on the fix and red without it (the scenario is
  under Eli's review); the tags left are on the parts of the engine model
  the bound does not lean on (bash, bare hands, other races, mounts, the
  cone), which the 256 of slack covers
- [x] on fork parity (15eb653d, 2026-10-03)
