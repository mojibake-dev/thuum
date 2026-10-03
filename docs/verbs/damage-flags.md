# Verb: damage flags

The seventh item of M1's validation work (docs/verbs/validation.md, Hits and
damage): the damage formula's power and sneak multipliers count only when
the server saw the attacker do it. SkyMP's formula took the client's word
for both (formulas/TES5DamageFormula.cpp: twice the damage for a power
attack, 1.3 times for a sneak attack), so a client could double every hit.

## Intent

A plain swing hits as a plain swing, whatever the attacker's client says.

Roadmap reference: docs/PLAN.md M1 "Validation: ... damage range and angle"
(the flags are the part of the damage the client still chose)
Milestone: M1   Class: A

## Authority

Rung: R0 for the damage (the server computes it), with two of its inputs
moved from the client's claim to the server's own record.
What the server checks, for a player's own hit (the attacker is the sender's
actor; hosted NPCs' animation events are not processed by the server, so
their flags stand):
- isPowerAttack: kept only when the attacker's animation events include a
  power attack's start (any event beginning attackPowerStart, the server's
  AnimationSystem records the time) within the last 3 seconds; skymp5-client
  sends the player's animation events as they happen.
- isSneakAttack: kept only while the server holds the attacker sneaking
  (the IsSneaking variable its movement reports).
- isHitBlocked: unchanged; it only lowers the attacker's own damage.
A flag the server cannot back is dropped and the hit lands as a plain one
(not refused): a real hit whose animation event was lost still lands.

## Engine surface

- The flags come from the engine's hit (skymp5-client reports them with the
  hit); the animation events are the player's behavior graph events, which
  the server already prices in stamina (AnimationSystem.cpp:
  attackPowerStartInPlace, attackPowerStartForward and the rest, 30 stamina
  each).
- Window: a power attack's start to its hit frame is under a second in the
  vanilla animations (HYPOTHESIS until the T3 run times one); 3 seconds
  leaves room for the 130 ms movement cadence and network delay.

## Observe, impose, suppress

- Observe: UpdateAnimation (the attacker's events) and UpdateMovement (its
  sneaking) as today; OnHit's flags.
- Impose: the damage of a hit without the backing state is the plain
  damage; the target is told its health as usual.
- Suppress: nothing.

## Message contract

- OnHit (17), UpdateAnimation (3), UpdateMovement (2): unchanged.

## Server

- Where the logic lives: ActionListener::OnHit (the flag check before the
  reach check and OnWeaponHit) and AnimationSystem (the power attack start
  times), fork 69149658; the rule is Rust since the port (skymp-wire wire-rules, ADR-020), on parity f0045206. A dropped flag logs E_HIT_POWER or
  E_HIT_SNEAK.
- DB fields / migration: none (runtime state).

## Tests

- T0: "A player's power and sneak flags count only when the server saw them"
  (unit/HitTest.cpp: a damage formula that records the flags it is given; a
  power flag without a power attack's start arrives dropped and with one
  arrives kept; a sneak flag while not sneaking dropped, while sneaking
  kept).
- T0 green in pipeline 612 (255 test cases).
- T2: difftest session damage-flags: c1 hits c2 bare-handed flagged as a
  power attack with no power attack among its events; the legacy server
  doubles the damage (c2 told 0.92576), the fixed one does not (0.96288).
  Green on m1-damage-flags, 2026-10-03, with the six other sessions.
- T3: lab/scenarios/a-damage-flags.yaml: c1 taps the attack key (a plain
  hit on c2 120 units off) and holds it 1.5 s (a power attack); the server
  keeps the real power attack's flag and the second hit takes c2 below 0.92.
  Green on the Rust rules (m1-rules), run 20261003-224045. The clones bind
  Right Attack/Block to Home (lab/deploy/sky-client/controlmap.ps1, Eli's
  call). It cannot fail on a server without the check; the refusal is T2.

## Dynamic plan (resolved 2026-10-03 by option 2, the remap)

What the lab tried (2026-10-03, on m1-damage-flags, c1 with the IronSword
facing c2 180 units off):
- lab-driver anim-event attackStart: a plain hit, c2 at 0.947 (runs
  20261003-115017, -115324).
- anim-event attackPowerStartInPlace: a hit with the plain damage (c2 at
  0.9476 as c1 saw it) and no E_HIT_POWER on the server: skymp5-client took
  isPowerAttack false from the engine's hit event (hitService.ts), so the
  engine did not perform a power attack from the event alone.
- anim-event attackPowerStartForward, then attackStart: no hit.
- lab-driver hold-key on SKSE key code 256 (the left mouse button, the
  right hand's attack), 100 ms and 1500 ms: no attack at all (run
  20261003-115633).

What would settle it, cheapest first:
1. T4 by Eli through Moonlight on sky-c1: draw the IronSword facing c2
   (positioned by the lab as in the draft scenario), hold the left mouse
   button for a power attack. Expected: c2 loses about 10.5 percent (twice
   the plain hit), the server logs no E_HIT_POWER, and its stamina record of
   c1 drops by 30 (the AnimationSystem's charge for attackPowerStart).
2. Automation: map "Right Attack/Block" to a keyboard key in the clone's
   control map (Data\Interface\Controls\PC\controlmap.txt), then hold-key
   that key for 1.5 s. Expected as in 1. If that holds, the draft scenario
   becomes the T3 with the key's code.
Until one of them is green, the verb stays on fork branch m1-damage-flags.

## Status

- [x] server logic + T0
- [x] T2 green
- [x] T3 scenario green (run 20261003-224045); the power attack misses at
  188 units where a plain swing lands (exploratory run 20261003-223313),
  HYPOTHESIS that power attacks use the pick only, without the eye cast
- [x] on fork parity (f0045206, 2026-10-03, with the Rust port)
