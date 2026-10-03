# Verb: activation reach

The second item of M1's validation work (docs/verbs/validation.md,
Activation): the server refuses an activation from beyond the player's
reach. SkyMP checked only that the activator and the target share a
worldspace, which outdoors is all of Tamriel: a client could harvest, open
or use anything loaded in its world from anywhere in it.

## Intent

A player can activate (harvest, open, use, talk to) only what the game
itself would let them reach.

Roadmap reference: none directly; docs/PLAN.md M1 "Validation: ...
activation distance"
Milestone: M1   Class: A

## Authority

Rung: R1 (the host decides to activate; the server validates it).
Why this rung and not the one above it: activation starts on the client
(crosshair, menus, the engine's own activate); the server cannot originate
it, only accept or refuse it.
What the server validates: on a client's Activate (first activation, not the
close of a container), the distance from the caster (the sender's actor or
an NPC it hosts) to the target, against the game's activation pick length
plus the target's own size (its base record's OBND, scaled by the
reference's scale) plus room for the player's body and camera. Activations
the server performs itself (a parent activating its children, Papyrus) are
not client input and are not checked.
Rate limit / bounds: the reach above; rate unchanged.

## Engine surface

- CommonLibSSE-NG: PlayerCharacter::ActivatePickRef
  (include/RE/P/PlayerCharacter.h, RELOCATION_ID 39471 / 40548 in
  include/RE/Offsets.h) is the player's pick-and-activate path.
- The pick length is not a game setting in Skyrim.esm (lab/esm.py found no
  GMST with "ActivatePick" in its editor id on 2026-10-03). Re-analyst on
  the 1.7.104 program (Ghidra, 2026-10-03), all HYPOTHESIS until read in a
  running game:
  - fActivatePickLength:Interface is an INI setting in the executable,
    default 180.0 (the Setting object at Address Library ID 370108 holds
    00 00 34 43 beside its name; constant-initialized, no constructor).
  - The crosshair pick (ID 26127) casts from the eye (the first-person
    camera object's world position, plus the third-person shoulder offset;
    zoom does not count) and accepts a target only when the hit lies within
    180; fActivatePickRadius (ID 370105) = 16 is the pick sphere's radius.
    ActivatePickRef (ID 40548) then calls TESObjectREFR::ActivateRef (ID
    19796) with no distance check of its own.
  - Exceptions: fFavorRequestPickDistance = 800 replaces 180 while the
    player commands a follower; fLargeActivatePickLength_G = 500 applies to
    extra-large actors. Neither applies yet (SkyMP runs without NPCs by
    default; no followers), and this verb does not allow them: revisit with
    followers (M2+).
  - The INI is client-editable, so the server enforces its own constant.
- Lab reading of the defaults: lab/frida/settings-read.js reads them by
  name in the running game, but the game refused the Frida agent on
  2026-10-03 (as on 2026-10-01); next, lab-driver reads them through
  Papyrus (Utility.GetINIFloat) with its next client install.

## Observe, impose, suppress

- Observe: unchanged; skymp5-client's ActivationService reports every
  activation the engine raises (src/services/services/activationService.ts),
  a script's Activate included, as Activate (MsgType 6).
- Impose: a refused activation does nothing on the server: no harvest, no
  container opened, no door used.
- Suppress: the server's processing of a refused activation.

## Message contract

- Activate (MsgType 6): unchanged.

## Server

- Where the logic lives: ActionListener::OnActivate (fork branch
  m1-activation). A client's first activation needs the caster within
  180 + 16 (the game's reach) + 256 (the eye above the feet and the shoulder
  offset; the server measures from the actor's position at its feet) + the
  target's size (the farthest point of its base record's OBND box from its
  origin, times the reference's XSCL scale) of the target's origin. Closing
  a container (the second activation) is not checked, so a player who
  walked away is not left holding it; across cells or worldspaces the
  existing worldspace error stands. A refusal logs E_ACTIVATE_REACH with
  the distance and the reach.
- libespm gains GetObjectBounds (OBND of any record) and BoundsRadius.
- DB fields / migration: none.

## Tests

- T0: "An activation from beyond reach harvests nothing"
  (unit/PartOne_ActivateTest.cpp): the Whiterun flower from 2500 units is
  refused, from beside it is harvested. The existing Whiterun activation
  tests place the actor on its target or 91 units from it (positions read
  with lab/esm.py ref), within reach.
- T2: difftest session activation-reach: the legacy server harvests the
  Canis Root from 1509 units (isHarvested, the harvest's OpenContainer, the
  root in the inventory; seen on 2026-10-03 on both the RakNet image and
  parity before the fix); the fixed server sends none of the three.

- T3: lab/scenarios/a-activation-reach.yaml (awaiting Eli's review): c1
  activates the Canis Root plant 1509 units from lab-spawn (reference
  0x0005355D; lab/esm.py), then from beside it. Baseline on parity without
  the check, run 20261003-062216: red at the first assert, because the far
  activation harvested the plant (the hole this verb closes).

## Status

- [ ] reach value sourced (Ghidra) and confirmed in the lab
- [ ] server logic + T0
- [ ] T2 green
- [ ] T3 scenario green, no HYPOTHESIS tags
