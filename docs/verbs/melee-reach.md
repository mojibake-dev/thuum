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
against the bound below. Since fork m3-npc-reach 7a80172c (the weekend pass,
14:17 PDT 2026-10-29, M3's "NPC melee reach and hit cone"): a humanoid NPC, its
race playable (RACE DATA flag 0x1), is gated as a player is, as a target of a
player's swing and as an aggressor whose host reports the hit (R1: the host
computes, the server validates; its weapon from its record's hands, its
heading from the host's sample; the rule's 256 units of slack cover the
sample's age). Out of scope still: creatures and the non-playable humanoid
races (Elder, Dremora, the vampire races; their extents unread, they keep the
4096 bound), spells and arrows. HYPOTHESIS until a lab read of a hosted
bandit's refused swing (c-dungeon-enemies carries the read); T0 HitTest's
created actor at 2000 units refused, CellHostTest's hosted Sigrid beyond
reach refused and at 60 units landing.
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
HYPOTHESIS (not measured): the bash reach, bare hands (modeled 127.7) and
the scale's effect across races, with M2's hit registration (docs/PLAN.md);
mounted attacks (fMountedAttackRange:Combat 135, measured from the mount)
with mounted combat (M7). The cone became its own verb, measured and on
parity (docs/verbs/hit-cone.md).

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
  f9ef96ec, on parity 15eb653d). The rule itself moved to Rust on 2026-10-03 (skymp-wire wire-rules, ADR-020; fork f0045206): the C++ handler gathers the facts and asks. The bound is max(s_a * max(fCombatBashReach,
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
- T3: lab/scenarios/a-melee-reach.yaml (approved by Eli, 2026-10-05): c1's real
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
- [x] T3 scenario green on the fix and red without it (the scenario
  approved by Eli, 2026-10-05); the tags left are on the parts of the engine model
  the bound does not lean on (bash, bare hands, other races, mounts, the
  cone), which the 256 of slack covers
- [x] on fork parity (15eb653d, 2026-10-03)

Watch item (2026-10-10, the merge sweep on fork m2-god 35acc275, ADR-027;
CLOSED 2026-10-27: green at every gate since c2 moved to 170 units on
2026-10-21, 54's gate 20261027-201308 the last, gate.yaml's entry out):
a-melee-reach red once (20261011-042255) at its first assert: c2's health
read 1.0 three seconds after c1's swing (anim-event attackStart, sent), with
c1 at y -545.3 and c2 at -365.7 (179.6 units, inside the sword's measured
edge, a hit at 185 and a miss at 190, 2026-10-03). The run's server.log
copy ends at 04:24:45, some twenty seconds before the swing, so whether a
hit reached the server is not on record. The two reruns were green
(20261011-051934, -052147), and the scenario was green in every sweep
before it. HYPOTHESIS: the swing fell short at the edge (5 units of margin,
against the teleports' landing spread of a few units and c1's facing after
its teleport). If it shows again: read the full server log for an OnHit or
an E_HIT_REACH line, and move c2 to 170 units (the scenario's change in its
own commit, for Eli's review).
It showed again, twice, on the train-30 plus layer stage (20261021-110412
and the rerun -132032, identical positions, 179.4 units): the full server
log, complete to the run's end, has no OnHit line of any kind, so c1's
engine landed nothing; the hit path is whole on the same image
(a-melee-cone, a-sneak-damage, a-damage-flags, b-block, b-duel, a-fight-end
and b-figure-values all landed their swords that night, and the dent gate
replaces DamageActor after 38586 has raised TESHitEvent). c2 stands at
170 units since main 8550593 (2026-10-21). Whether the layer's bodies moved
the edge (a hit at 180 on the train-29 stage, a miss on this one) is
PLAN's x-melee-edge row, a measurement, not this verb's bound.
