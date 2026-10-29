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
- Built on fork m2-visuals 7769ec57: a figure's SneakStart or SneakStop is
  sent on a change of the report and at most once a second while the graph
  disagrees, and merged on fork parity 11c126b9 (2026-10-13 05:31: the sweep
  of every scenario on m2-visuals be69bf68, 40 of 40 green, and T2 green on
  11c126b9, which adds a difftest session change alone).

## Playtest fifteen (2026-10-13, Eli, parity 11c126b9)

- Passed: with magic readied, test 1's crouch and its stand showed on test
  2's screen within about a quarter second.

## The figure's glide knobs (2026-10-28, fork m3-follow-mode c84da2c3)

The other player's figure is moved once per sample (about every 130 ms plus a frame) by one engine translateTo
(skymp5-client/src/sync/movementApply.ts, translateTo), the planner fed an offset so the AI plays the walk. The knobs
live under "movement" in the client's settings file (the lab template lab/deploy/sky-client/skymp5-client-settings.txt
overwrites a seat's at every dist): leadSeconds (default 0.2, upstream's lead: the target is the sample plus speed times
the lead along the heading, the glide timed by the lead), mode "lead" or "follow" (default "lead", today's behaviour
byte for byte), followMargin (1.15). Playtest 37 read the lead's two failures on Eli's screen: at 0.1 "the yoyo is
decreased but it looks like,, frames are missing?" (a glide shorter than the sample spacing finishes early and the
figure stands until the next sample, then runs at distance over the lead), at 0.2 the overshoot past the sender's stop
and the walk back (the stop learned a sample late). Follow mode targets the sample itself and times the glide by the
smoothed arrival spacing (an exponential average, alpha 0.3, clamped 0.08 to 0.4 s, from 0.14) times the margin, so
the engine is still gliding when the next sample lands: the figure runs at the sender's speed about one spacing behind
with no overshoot, Skyrim Together's delayed-playback trade with the engine's own glide instead of a per-frame set.
HYPOTHESIS (H-MV1) until a probe measures both modes (x-figure-settle-lead's two-pass shape with a 16 ms watch: stall
frames under 5% of moving frames, max step under twice the median, overshoot past the stop under 8 units); the stop's
last glide in the idle pose is the trade to watch. Laid as hot-3g-1.js with the template on "follow" (21:37 PDT).
