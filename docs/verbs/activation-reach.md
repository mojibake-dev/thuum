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
  GMST with "ActivatePick" in its editor id on 2026-10-03); it is an
  INI-backed setting in the executable: name, default and evidence pending
  from the re-analyst (Ghidra), HYPOTHESIS until a lab run confirms it.

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

- Where the logic lives: ActionListener::OnActivate; the bounds come from a
  new libespm reader for any base record's OBND (ObjectBounds.h).
- DB fields / migration: none.

## Tests

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
