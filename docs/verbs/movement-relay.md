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

## Found in playtests thirteen and fourteen (Eli)

- A player who stands up from sneaking with weapons drawn stays crouched on
  the other player's screen until it sheathes (playtest thirteen, again in
  fourteen, 2026-10-12). Carried from thirteen's notes too late: it was not
  filed then. HYPOTHESIS: the observer's client applies the figure's sneak
  state through an animation event that the drawn-weapon graph ignores, or
  only when the weapon state changes (skymp5-client sync/movementApply.ts
  is to read).
- Read and fixed (2026-10-12): the lab reproduced it with magic readied
  (x-crouch-magic2 20261012-235927: the figure still crouched three seconds
  after c1 stood, up only after the hands were sheathed); a drawn weapon,
  rotfern and a running fight all stood the figure up within 10 to 300 ms
  (x-crouch-drawn, -rotfern, -fight). With magic readied the graph's
  IsSneaking stays false, even in the player's own game, and a figure's
  isSneaking() never turns true, so applySneaking (sync/movementApply.ts)
  saw nothing to undo and never sent SneakStop. The fix keeps the last
  sneak state sent to each figure and sends the event on a change of the
  report. On the fix, x-crouch-magic2 20261013-004245 showed the figure up
  three seconds after the stand (the screenshot's delay, not the figure's;
  x-crouch-latency measures it). Merged on fork parity c918a7a1.
- Measured (x-crouch-latency2 20261013-060851, fork m2-poison on parity
  c918a7a1, magic readied, three crouches and three stands): the figure on
  c2's screen took its player's SneakStart or SneakStop 238 to 356 ms after
  c1's own (273, 339, 275, 238, 356, 273 ms), the relay's usual delay (its
  0.2 s glide plus the network). c1's zero is c2's plus the watch-start
  step between them (61 ms), so each figure lags by a few ms less.
- Found in that run: while c1 crouched with magic readied, c2's client sent
  the figure's graph SneakStart again every 100 to 130 ms (58 SneakStart,
  55 of them refused; 3 SneakStop). applySneaking resends while the graph
  disagrees with the report, and with magic readied the graph never reports
  sneaking. Harmless on screen, a waste per figure per update; the resend
  on disagreement is to be rate-limited (it recovers a figure whose graph
  reset, as on a reload of its 3D).
