# Verb: movement relay order

The first item of M1's validation work (docs/verbs/validation.md, Movement):
a move the server rejects reaches nobody. SkyMP validated a client's
UpdateMovement after it had already relayed it to every neighbour, so a
rejected jump still showed on the other clients' screens.

## Intent

When the server refuses a player's move and snaps them back, no other
player ever sees the move.

Roadmap reference: SkyMP ROADMAP.md "Movement" (lag compensation and
movement details); docs/PLAN.md M1 "Validation: ... movement speed bounds"
Milestone: M1   Class: A

## Authority

Rung: R1 (the host computes its own movement; the server validates it).
Why this rung and not the one above it: the client simulates its own
movement (physics, animation); the server can only accept or refuse what it
reports.
What the server validates: ownership (the sender's own actor or an NPC it
hosts), a change of cell or worldspace, and a jump of 4096 units or more in
one message (MovementValidation.cpp); the first update after a server
teleport is refused. A refused move of the sender's own actor is answered
with Teleport2 back to the server's position.
Rate limit / bounds: unchanged by this verb. Speed over time is still
unchecked (the next movement verb).

## Engine surface

- None new. The client applies Teleport2 through skymp5-client's own
  teleport path; observers render relayed moves as before.

## Observe, impose, suppress

- Observe: unchanged (skymp5-client sends UpdateMovement).
- Impose: unchanged (Teleport2 to the sender on a refusal).
- Suppress: the relay of a refused move, which is the whole change.

## Message contract

- UpdateMovement (MsgType 2) and Teleport2 (MsgType 31): unchanged.

## Server

- Where the logic lives: ActionListener::OnUpdateMovement
  (skymp5-server/cpp/server_guest_lib/ActionListener.cpp). SendToNeighbours
  is split into ActorUpdatableBy (ownership and hosting) and
  RelayToListeners; every other handler keeps calling SendToNeighbours and
  behaves as before. OnUpdateMovement checks ownership, validates, and
  relays only an accepted move.
- DB fields / migration: none.
- Restart behavior: n/a.
- Papyrus natives touched: none.

## Client

- None.

## Tests

- T0: "A movement the server rejects reaches no neighbour"
  (unit/PartOne_MovementTest.cpp): a 5000-unit jump snaps the sender back
  and relays nothing. Fails on the old order.
- T2: difftest session movement-reject (skymp-wire/difftest/sessions):
  against the pinned RakNet image, the rejected jump reached c1 (its echo)
  and c2 on the legacy stack and neither on the fixed one, as declared;
  green on 2026-10-02 with T2 on its own server under test.
- T3: lab/scenarios/a-movement-reject.yaml (approved by Eli, 2026-10-05): c1
  jumps 5000 units in one frame while c2 watches (lab-driver watch-start /
  watch-stop). Green on m1-movement (run 20261002-230136: c2 saw c1 move at
  most 1.7 units over 261 frames; c1 and its record back where they began).
  Red on the image without the fix (run 20261002-230814: c2 saw c1 move
  7635 units), so the scenario tells the two apart.
- Assertions that would fail if the verb silently regressed: T0's relay
  check, difftest's declared divergence (it would stop occurring), and
  a-movement-reject's maxDisplacement bound.

## Status

- [x] doc complete, rung declared
- [x] engine surface (none new)
- [x] server logic + T0
- [x] T2 green
- [x] T3 scenario green, no HYPOTHESIS tags (scenario d7758c5 approved by
  Eli with the commits through 9e87c65, confirmed 2026-10-04)
- [x] on fork parity (7ca272e2, 2026-10-02)
