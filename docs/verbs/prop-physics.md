# prop-physics

Status: physics rungs 1 to 3 BUILT on fork branches, none staged green and none merged (2026-11-12; ADR-071's ladder, and
playtest 51 waits for them): rung 1 "props hold" on m4-physics-1-arbitration d9da7da3, rung 2 "sample v2" on
m4-physics-2-sample cc5c44f3 (rung 1's head merged in), rungs 3a and 3 "the impact" on m4-physics-3-impact 92b032cd (rung 2's
head merged in), its platform and client review's fixes at 042f6907. The rung sections under Ownership and the Rung, Message
contract, Server and Client sections describe those heads; fork canon keeps slice one's rule with its timers. Slice one: MERGED
to fork parity 4f746162 (04:03Z 2026-11-01, numidium: the gate 20261101-031523-merge-m3-prop-physics 11 of 11,
b-prop-push green at its first run 032302, T2 green with the prop-physics session identical at 18 declared divergences, both clones
promoted; slice one whole: the drop at the drop point, D73's rest, D75's persistence, the walk's nudge on both seats and across a
restart). Earlier: DRAFT (the weekend pass, thuum-magnus; ADR-058). Slice one's server half BUILT 14:54 PDT 2026-10-29 on fork m3-prop-physics
(879f9e88 the wire rows with validators, fixtures, C++ structs and client interfaces, SCHEMA_VERSION 21; 8699e3c8 the owner rule
props.rs with its bridge, the handlers, PartOne's plumbing, unit/PropTest.cpp, the difftest session; cargo tests and clippy green,
fork-lint green, the C++ compiles on CI only); the client service in build; nothing at T3 yet.

Milestone: M3 (the pass's head 3; ADR-058)   Class: B

## Intent

A prop (a kicked basket, a dropped sword, a boulder, a body) moves the same on every screen: the seat whose player touched it
simulates it, the server records where it is, every other seat shows the stream. Garry's Mod's shape without its server (ADR-058;
Eli: "the canon perfection of multiplayer phys objects is gmod"). Today every such reference is Keyframed on arrival and moves on
one screen alone (skymp5-client/src/extensions/objectReferenceEx.ts, view/spawnProcess.ts).

## Ownership (ADR-063: ownership, not permission; written 18:52 PST 2026-11-02, before any code moves again)

Owner: the cell's host by default, for a resting or stalled body; the engine that set a prop moving (its capsule, its hand, its
drop, an impulse whose cause it owns) while it moves; a grabber until its release, its rest, its departure or its unload.
Ownership passes by the server's PropOwner word alone: a grant at a claim the rule admits, the return to the host at the owner's
own asleep sample, the host's wake by id, the departure's and the unload's returns. No seat infers ownership from a timer, a
silence or who it can see, and since rung 1 the server runs no timer on it either.
Channel: PropTransform (the owner's samples, the asleep one reliable; v2 since rung 2, under the owner's epoch with a sequence, its
clock and both velocities, and the server's record answer at seq 0) and PropOwner (the server's word, player 0 the host default
since rung 1); the claim PropClaim with its touch kind (v2: one to sixteen references). No new message: v2 is a change of shape
(SCHEMA_VERSION 46), and the platform's propContact and (rung 3) propImpulse events are a seat's own.
Content-specific code: none. The movable-static list (propStatics) named what is a prop, not who may touch it; no code on canon
ever read it (f07ba07e's reader never merged), it leaves the deploy with rung 1's merge, and ADR-071 decision 1 derives a static's
class from its model at rung 4 (D-PH9).
Two seats: b-prop-arbitration (from x-prop-arbitration by path), the touches from both seats, a carry handed over, a blast beside a
prop the other seat streams; for rung 1 also x-prop-edge (playtest 44's cell edge), for rung 2 b-prop-follow (from x-prop-follow:
the follower's screen through a roll, a loss leg and a take-over) and for rung 3 b-prop-impulse (the Riverwood Trader cart's
cabbages under Hailstone, Fireball and Unrelenting Force from down the road, each claim on the other seat's screen and the
record); none promoted yet.

### The arbitration rule (18:52 PST 2026-11-02; ADR-063 decision 4's row for props, after playtest 41's close)

Eli at the close: "item physics sync is more broken than it was when we STARTED testing". The server since break 3 granted 13 of 13
claims and refused a blasted prop's owner while it still flew (E_PROP_NOT_OWNER at 02:19:26Z and 02:19:49Z with no claim between).
ADR-063 retired the owner checks (E_PROP_CELL, E_PROP_REACH) and never wrote the arbitration they stood in for. A read agent mapped
every ownership transition on b926a7d4 (the break-3 server; the client bundle e742d086 beside it); the two failure families:

1. Newest touch wins over a moving prop. wire-rules props.rs:204-236: any live, ungrabbed row is overwritten by any other player's
   claim, whatever the touch kind and whether the prop moves (pinned by props.rs:353-365 and PropTest.cpp:257-265); the client claims
   every contact with a prop it does not simulate, a prop flying into a standing player included (propService.ts:812-836), two
   seats trading a flying prop once per 2 s each; the hand-over drops the motion (the claimant's copy goes Dynamic at zero velocity,
   propService.ts:546-556; "with the last streamed velocity" has no code).
2. Ownership returns to the host by timers nobody hears. The server's lapses send no word: the 3 s silence of accepted samples
   (props.rs:166; samples lost, refused TooFast, over the edge budget or paused in a menu all count as silence), the 3 s lease after
   an asleep sample (:163-165, :292), the 120 s grab cap, the host's takeover, the departure. The client mirrors a lease of its own
   from its asleep send and never clears it on its later awake sends (propService.ts:656-661, 641-650), so the owner demotes itself
   at the old deadline while its body moves (C1: nobody streams), a held body's asleep sample lapses the grabber on every seat while
   the server names it (C2), a relayed takeover sample re-arms the old toucher (C3: two simulators), a word naming a player this seat
   cannot see falls back to the host (C4), and the mirrors' skews leave gaps (C6). E_PROP_NOT_OWNER never reaches a client.

The rule (R0: the server decides, the word is the decision; R2 for the transform as before):

- A1. One owner, by the word alone. A seat simulates a prop while the server's last PropOwner word names it, or while the word names
  nobody (player 0, the host default) and the seat hosts the prop's cell. The client's lease mirror, its silence test and its
  presence test go (ownerOf reads the word and hostsCell, nothing else).
- A2. A grab beats a touch; nothing beats a grab. A live grabbed row answers every other seat's claim Held (as today). A grab claim
  on a live, ungrabbed row another seat owns is granted (the grabber's engine has the body in hand; a Keyframed copy cannot be
  grabbed, so the case is a race at rest). A grab on a row the holder already owns restarts the cap's clock; the cap itself ends
  by a word: the holder's first sample past PROP_GRAB_MAX_MS is refused (E_PROP_GRAB_CAP) and the prop is the host's again at a
  new epoch (the review of 20:10 PST 2026-11-02).
- A3. A non-owner's contact never takes a moving prop. A contact, drop or impulse claim on a row another seat streams awake (its last
  accepted sample younger than PROP_MOVING_MS, 1000 ms, UNMEASURED) is refused E_PROP_MOVING, logged and counted; the claimant's copy
  stays on the stream. A resting row (the owner's asleep sample) or a stalled one (older than PROP_MOVING_MS) is anyone's to claim.
- A4. Ownership returns to the host only at rest on the owner's screen, by the owner's own final sample, and every return is a
  word. At an accepted asleep sample of an ungrabbed row, the host's own included, the row sleeps and the server sends PropOwner
  {refr, player 0, epoch + 1} to every listener, so no seat ever keeps an older word (the review of 20:10 PST 2026-11-02: without the host's
  own word a seat that walked away and came back after a host change streamed into refusals an answer at the same epoch could not
  heal). A refused final sample (over the step budget) takes the rest and returns the prop the same way, the position standing.
  PROP_LEASE_MS and PROP_SILENCE_MS retire. A departure returns the player's live rows to the host with a word each. The 120 s grab
  cap stays as the one timer, ended by a word (A2).
- A5. Every refusal is answered. E_PROP_NOT_OWNER, E_PROP_HELD and E_PROP_MOVING send the sender the current word (the live owner
  or 0, the epoch), once per prop per second, so a divergent mirror heals instead of streaming into refusals and the loser of a
  double grab hears who holds the prop; since every return advances the epoch, the answer is never older than a mirror's word,
  and the client applies an equal epoch again (the answer heals a seat that applied the standing word wrongly; round three).
  Claim refusals count in the stream counters. A late subscriber hears the word whenever the prop ever had one (player 0 for a
  resting prop).
- A6. The hand-over of a MOVING prop happens by a grab alone (A2, A3), so no velocity travels; a resting prop's hand-over starts at
  rest. The first bump on a Keyframed copy is still swallowed until the grant lands (the known limit since slice one). A held prop
  never rests on the wire: the holder's seat streams an awake sample at least every HOLD_SAMPLE_MS (500) while still, so the
  followers' copies stay Keyframed in the hand's place (D73 would otherwise rest them Dynamic and drop them) and the server's row
  stays awake and grabbed; a hand that loses a double grab (the answer word names another seat while this seat holds) lets go,
  Keyframed, so no two hands move one prop (ADR-063 decision 3).
- A7. Every seat's word names the seat that streams. The host's own wake of a resting prop (its engine's kick, a grab past its
  cap it samples before the tick) is a word naming the host BY ID at a new epoch (Woken), never player 0 over a row that names
  the host: with the default word a host change left the old host reading itself as no owner, stopping without a final sample,
  while the new host's samples were refused and answered with the old host's name, and nobody streamed (the review of 2026-11-03,
  round four). So a host change leaves the old host streaming until its rest, which returns the prop to the host by default, the
  new one, with the word. No timer takes a row: a stream that stops without an asleep sample is a stalled row, anyone's to claim
  (A3); the asleep sample is reliable, untracking sends a final sample while the 3D is loaded, a crash ends in the departure's
  word (every row the seat still owned, a capped grab included), and the grab's cap ends by the table's tick (once a second from
  PartOne::Tick) with the word whether or not the holder samples again. A player's game unloading a cell (a door, a teleport, a
  square leaving its grid) drops its 3D of every prop there before any final sample (the rescan untracks first; HYPOTHESIS, the
  client's order, until a run), so the server returns that player's rows in the cell (live or past the cap) to the host by default
  with the word, beside the cells rule's unload (Props::unloaded; round five, the review of 2026-11-03: the old host leaving
  through a door mid-flight left a live row nobody streamed). The unload is a state, not a moment (round six): until that
  player's game reports the cell loaded again, or the cell is in its reach again (RefreshReach, the way a follow vouches by
  loaded or reach; round seven: a load report a seat never sends, playtest 41's 9731 missing from c1's set for 57 s, must not
  refuse it for good), its GRANTS and WAKES there are refused E_PROP_AWAY (Away), since an unloading host still hosts through
  its 5 s grace and its late sample would wake the prop by id again, and the same seat's claim would be granted again; a live
  owner's own stream passes wherever its sample lands, so no row is stranded; a gate on the seat's own report, not on a
  position (ADR-063). A seat reports a cell unloaded through its 1 s
  isAttached poll only for cells in its loaded set: a cell whose cellFullyLoaded never fired (the landing cell's patch covers
  the landing alone) or any cell on a seat with cellHost off is never reported, and a silent stale host keeps its rows until
  netcode's timeout; a disconnect is the departure's word. Whether the engine ends a grab at a door is an engine claim
  (HYPOTHESIS; prop-grab.js's DestroyMouseSprings hook reads it). A grant changes no row: resting rows name nobody already, live
  rows stay their owners' and a grab past its cap waits for the tick's word. Round three's takeover (the host's sample of an
  owner silent for PROP_MOVING_MS) was a lease by another name and is gone.

Wire: PropOwner.player 0 gains the meaning "the cell's host" (wire-validate admits 0 for PropOwner alone, the contract line and the
fixtures with it, same commit); E_PROP_MOVING is a new refusal code (a log line, no message). Server: props.rs's claim and transform
carry the rule, `gone` and `tick` return rows, the C++ handlers send the words (the grant's, the rest's, the cap's from the tick, the
host's wake by id, the departure's) and answer NotOwner; a late subscriber's word names the live owner by id, the host's own row
included. Client:
ownerOf by the word; onOwner stores any epoch not below the known one, player 0 included; the mirror's two writes removed; the contact claim
skipped while another seat's awake stream is live here (STREAM_LIVE_MS; the server refuses it anyway); grab, release and drop claims
and the asleep send unchanged. Tests: props.rs (the moving refusal, the grab over a touch, the rest's return and word, the departure's
words, the stalled claim, the host's wake by id across a host change, the tick's cap), PropTest.cpp (the word at rest to both seats
with player 0, the moving refusal, NotOwner answered, the wake's word and the live row across the props table's grant),
wire-validate's PropOwner case (0 admitted).
Two seats: x-prop-arbitration v12 by path (v11 ran as 20261103-075626 on 147a6cfe and went red at leg 1's premise, not its rule: the 1.5 s walk stopped 20 units short of the ingot and prop-contact.js on c2 heard the ground alone, so nothing was claimed or streamed and legs 2 to 6 never ran; two Frida watchers a seat settled; v12 holds W 2.2 s and the contact watcher's motion-type field reads the non-owner's copy once the capsule reaches it; lab-spawn, a server-placed iron ingot at the mining floor marker; leg 1 c2's contact at
rest: granted, streams, rests, the word returns it; leg 2 c1 kicks it into c2: the contact takes nothing (the guest's own skip or
E_PROP_MOVING), the touch-0 grants unchanged through the flight, the host's wake and its rest and both seats' owner lines naming
the host risen against snapshots (lab-api 3b8273a5 takes a seat's fact in a snapshot after its log-count step), and the record moved;
leg 5 the guest's cell unload mid-stream on a second placed ingot: the contact granted, the unload's return line and the host's
player-0 word risen against snapshots, the rest line read beside them (a timing red told from a build red), the record
snapshotted after for E32's height; leg 6 the re-entry: the load report ends the unload's state, the contact granted again and
E_PROP_AWAY flat; leg 3 c2's grab at rest over a pitch sweep: granted, the hold's samples read through the
server's stream counters, the release's rest and word; leg 4 c2's blast at rest: the impulse grant or the host's own stream, one
of the two; every count read against a snapshot behind its own log-count step; lab/frida/prop-grab.js armed on both seats at the
relaunch for E13, E14 and E15, prop-sleep.js on c1 and prop-contact.js on c2 as each seat's second watcher (E10, E2, E26, E27;
whether a seat carries two is the run's first read); A2's Held and E31 wait for a concurrent step, a serial script cannot overlap
two seats' acts), then b-prop-arbitration in its own commit. Stale text fixed with
the build: skymp.rs:1816, PropClaimMessage.h:10, propClaimMessage.ts:8 and props.rs:201 (the cell refusal), skymp.rs:1833,
PropOwnerMessage.h:8-10 and propOwnerMessage.ts:4-6 (the velocity), PropTest.cpp:371's title, the reach row below (:268).

BUILT 19:21 PST 2026-11-02 on fork m4-prop-arbitration 8deb7809 (base: union-srv-3 b926a7d4 plus the chest bundle e742d086, the seats'
break-3 state), pipeline 4780 GREEN at 03:36Z 2026-11-03 (server, client, wire-test, wire-fuzz, difftest-build, rust-image): wire-rules props.rs (PROP_MOVING_MS 1000, ClaimVerdict::Moving,
TransformVerdict::Returned(epoch), `gone` returning the rows for their words, PROP_LEASE_MS and PROP_SILENCE_MS gone, nine
tests), the bridge (codes 3 and 4, PropReturn, prop_moving_ms), wire-validate (PropOwner.player 0 admitted; fixture
60-PropOwner-2), the schema's and the message headers' text, PartOne::SendPropOwnerWord (the grant's, the rest's, the departure's
and the NotOwner answer's one sender), ActionListener's E_PROP_MOVING and the Returned branch ("prop X rests on Y's screen at (x, y, z): the
host's again at epoch N"), PropTest's five cases rewritten to the rule, propService.ts (Owner without a lease; ownerOf by the
word; the two mirror writes and the presence set removed; the contact claim held while another seat's awake stream is live
here). The review round (20:10 PST 2026-11-02, numidium's fresh review of 8deb7809, FIX FIRST; fork 4b471676, pipeline 4799): the rows above as
amended (every rest a word, the cap and the refused rest as words, every refusal answered, the late subscriber's word, the held
stream and the lost hold, the grab's clock), SCHEMA_VERSION 33 for the player-0 word, the difftest session's two return words
declared, the probe's v2 (the return line's real pattern, server baselines, movement claimed on the grab and the blast, the blast's
either-or under E20). Open: PROP_MOVING_MS UNMEASURED; the stalled stream (A7) in no probe; E10, E31, E14 and E15 of
docs/engine/havok-props.md unread; the scenario b-prop-arbitration after the probe's read.

### Rung 1: A1 to A7 as built, with no timers (ADR-071 rung 1 "props hold"; fork m4-physics-1-arbitration d9da7da3, 2026-11-12)

The rule above, rebuilt by hand on train 52's c3f9d175 (its step allowance kept) from m4-prop-arbitration 147a6cfe, with Eli's
answers of 2026-11-11 (ADR-071's amendment: D-PH1 A, D-PH2 A, D-PH3 A, D-PH4 B and W3) and the fresh reviews' fixes
(lab/.cache/drafts/physics/rung1-plan.md d3398741; for its probes review-v14-edge.md ca57d58a and review-v14.2-edge1.2.md
4c8ddb5c): fork d463d367 the rule, 8d6f92f1 the wire, 715e0b8b the server, 95363b6c the T2 session, b7151a42 the client, then
7d9741e1, 1458d977, 1496634e, a872cf12, 46a7bfa4 and f38f5249, and the pickup below (a539bded, 7f4f1506). Where the build departs
from the text of 2026-11-02:

- No timer at all (D-PH3 A, "Drop it, read the grab"). PROP_LEASE_MS, PROP_SILENCE_MS and the grab's cap (PROP_GRAB_MAX_MS,
  E_PROP_GRAB_CAP and the tick that worded it) are not built, so a row is live while it is held or awake and for no other reason
  (PropRow::live), and who owns a prop is a function of the words alone (A1). A hold ends by the holder's release, its rest, its
  departure or its unload. The client reads its engine's grab once an update (Game.getPlayerGrabbedRef, readHolds), claims touch 1
  only while the engine names the body, so a grab the engine refuses in its own frame claims nothing (docs/engine/havok-props.md
  E43), and claims touch 2 when the hold ends; grabRelease is no longer read. HYPOTHESIS (the class comment): the native names the
  body for exactly as long as the engine's grab holds it (E40 and E41 read the grab's ends, never this native).
- The moving window (A3): PROP_MOVING_MS on the server and STREAM_LIVE_MS on the client, both 1,600 ms and kept equal, about three
  heartbeat intervals and a frame, so one or two lost unreliable beats never read a live stream stalled (1458d977: one lost beat
  left a gap of 1,000 to 1,066 ms, past the 2026-11-02 text's 1,000). UNMEASURED both (E10 sizes them). A judgment of a claim,
  never a return; the cost is a stalled stream taking 1.6 s, not 1, to be the next touch's.
- The heartbeat (D-PH4 B, ADR-071 decision 6's 500 ms, on v1 samples): every awake body a seat streams sends a sample at least
  every STREAM_HEARTBEAT_MS 500, moved or not, a held one included, and a held body never sends the asleep sample (A6), so the
  server never reads a live stream stalled and no follower rests its copy mid-stream (E42 read a still held body asleep under the
  stir test; E44 a still hold at its rest pose at speed 0). A hand that takes a resting body this seat simulates opens the stream
  at once ("stream <id> started: held").
- A new grab ends the claimant's hold of any other prop, whatever the new prop's own verdict (f38f5249, over 46a7bfa4's
  E_PROP_HELD_TWO refusal): the engine holds one grabbed object per player (CommonLibSSE-NG P/PlayerCharacter.h:697), so the claim
  itself says the old hold is over, whether or not the server heard it end (a release inside the grab claim's round trip, the
  engine's own drop, E41). The grab mark alone goes: the old row stays the player's awake row, streamed, or past PROP_MOVING_MS
  stalled and anyone's. No seat holds two props at once (the proptest a_player_never_holds_two_props).
- The listener check, E_PROP_UNSEEN, replaces E_PROP_CELL and E_PROP_REACH (ADR-071 decision 2; 715e0b8b): a claimant must be a
  listener of the prop (IsPropListener: the server sent its game the prop's create word and has not told it the prop is gone, the
  subscription the 3x3 grid squares of 4,096 units around the reference keep), and so must a sample's sender with no live row of
  its own (a host's wake); a live owner's stream passes wherever it lands. A consistency fact of the server's own state, never a
  judgment of where the claimant stands (ADR-063 decision 4). Refused "E_PROP_UNSEEN: X claims prop Y by touch T; the claimant is
  no listener of the prop (its game was never sent it, or was told it is gone)" with no word, since that game has no copy to heal.
  The claimant's cell and distance are no gate (playtest 41's carried bucket and playtest 44's kettle at the mill's cell edge were
  refused against records the carrier had already moved); the prop's own cell is the row's key, and a record in no cell is
  E_PROP_OUTSIDE. The check is coarser than the reach it replaces: one square either way, against 256, 512 and 2,048 units.
- A sample's old cell refusal splits in two: E_PROP_OUTSIDE (no cell at the sample's point, ADR-071 decision 6's conservation,
  whoever sends it) and E_PROP_FROZEN (a resting prop in a cell nobody hosts, the design law's freeze).
- PropOwner admits player 0 (8d6f92f1, SCHEMA_VERSION 45 by D-PH1 A): the host of the cell the prop's record stands in, whoever
  that is when the word is read. Every return is a player-0 word (a rest, a departure, an unload), and a late listener hears the
  current word after the create word whenever the prop's epoch is above 0, the live owner by id or 0. The bump is the loud guard: a
  client built before it would drop each player-0 word into its transport's counter and keep a stale owner with no sign.
- Every refusal is answered (A5): AnswerPropWord, once per prop per second per seat, for E_PROP_NOT_OWNER (a sample) and
  E_PROP_HELD, E_PROP_MOVING and E_PROP_AWAY (claims); the client applies an equal epoch, so the answer heals a seat that applied
  the standing word wrongly. Every refusal counts in the stream counters.
- The unload as a state (D-PH2 A, rounds five to eight as built at 147a6cfe): a seat's unload report returns its live rows in the
  cell with a word each, and its grants and wakes there are refused E_PROP_AWAY until its load report or the cell's return to its
  reach; a live owner's own stream passes.
- A final sample past the step budget took the rest and left the record standing (RestRefused, with the player-0 word); rung 2
  replaces it with the clamp.
- The traps' world bodies under the one rule (ADR-071 decision 8): claim_world_body and host_changed are deleted; a trap body's
  impulse is a claim by touch 3, the first firing winning by A3's E_PROP_MOVING and its rest returning it by A4's word, so
  b60e7f31's lapse retires with the lease mirror.
- The client's words (b7151a42, 7d9741e1, 1496634e): ownerOf reads the word and hostsCell alone (the lease mirror, the presence set
  and the lapse are gone); a seat that does not host says "prop <id> owner 0 epoch N (host of cell C)" after a rest, a departure or
  an unload word (R1's read at a cell edge); a seat the word makes the simulator follows on until REST_DYNAMIC_MS after the rest it
  heard, so its copy takes the rest pose before it goes Dynamic; a hand that loses a double grab (a word naming another seat after
  this hand's grab: the Held answer) goes Keyframed and says "prop <id>: another seat owns it while this hand held it; the hold
  ends", and that hold's end sends no release.
- W3 ("Fix the drop", ADR-071's amendment): the drop service disables the engine's own dropped copy and deletes it once the disable
  has run (the Creation Kit's order; a refused delete reaches the catch and is logged, a872cf12), where a delete alone left it
  listed, deleted and never freed under Skyrim Souls RE's running InventoryMenu (E39). HYPOTHESIS until a read shows the reference
  gone at once under the running menu: b-prop-push's step 27, unchanged, reads it.

Its server lines, which the probes count: "[verb:prop-physics] X claims prop Y by touch T: granted, epoch N; K listener(s) told";
"prop Y rests on X's screen at (x, y, z): the host's again at epoch N; ..."; "prop Y woken by its host X at (x, y, z): the host's by
name at epoch N; ..."; "prop Y: its simulator X left; the host's again at epoch N; ..." and "prop Y: its simulator X unloaded cell
C; the host's again at epoch N; ..."; each refusal "E_PROP_<CODE>: X claims prop Y by touch T; <why>" or "E_PROP_<CODE>: X moves
prop Y; <why>". The client's: "prop Y owner P epoch N (mine|theirs|the host)" and "(host of cell C)", "stream Y started" ("at the
grant", ": held"), "stream Y asleep", "prop Y held: the engine's grab names it", "prop Y let go: <why>", "contact Y layer L motion
M: claimed" ("owned, no claim", "another seat streams it awake, no claim").

Declared limits (rung 1; the plan's sections 2 and 7, the premise reads in lab/.cache/drafts/physics/read-rung1-premises.md
fed3f9cf, the fork's declared notes):
- The login shove: a copy whose record lies inside a player's capsule at its first placement is put back inside the capsule and
  shoved, since placeAtRecord has no capsule test. x-login-overlap v1.4 20261112-083057 moved the record 81.0 units in the plane by
  the surface pass's 46 pushes over 2 s, 44 of them after the placement put the copy back inside c2's capsule (E37). ADR-071
  decision 3's "no copy is placed inside a capsule" is rung 6's, D-PH13: such a copy is held Keyframed at its record until no
  capsule holds it, then D73's rest.
- Player 0 at a cell edge (the plan's R1): each seat resolves player 0 by its own copy's parent cell and the server by the record's,
  so at an exterior edge two seats can both read themselves the host, or neither, and the answer repeats player 0 and cannot heal
  it. x-prop-edge v1.3's leg D records each seat's "(host of cell C)" line; a fix needs a cell-at-position lookup the client lacks.
- The knocked body (R2): a resting body that a moving body knocks on a follower's engine is woken by that seat when it hosts the
  cell (A7's wake) or moves unstreamed, so the island has a second owner; the server knows no island's members. Rung 3's island
  claims take the mover's own island; a follower's knock stays.
- The host's wake against the guest's claim (R3): whichever reaches the server first owns the push, where the newest touch always
  gave it to the guest.
- A wake or a grant after a blast (R12): a first sample past the step budget's 600 units is refused E_PROP_STEP and the record
  stands until the rest; rung 3a's first-sample allowance answers it.
- The double grab's third order (S2): the host's held stream opens at its grab, so its first sample can set the guest's copy
  Keyframed before the guest's grab threshold passes; the guest's grab then closes in its own frame (E28), readHolds claims nothing
  and no "the hold ends" line comes, and the guest's key-up is a pickup the rule refuses (E_PROP_HELD, below).
- A claim or a late final sample racing an unsubscription (a Disable unsubscribes every listener; the lab's teleport moves the
  record before the client hears) reads E_PROP_UNSEEN; the probes count only the unexpected ones (review-v14-edge.md, finding 1).
- A stalled stream (the owner's client still connected, no asleep sample) leaves the follower's copy where the last sample put it
  until STREAM_LIVE_MS, then Dynamic; whether it then stands or settles is E32, unread.
- The untrack gap without a cell change (TRACK_MAX pushing a held prop out of the tracked set: no release and no final sample)
  holds the prop against every other seat until the seat's next grab, its unload of the cell or its departure (f38f5249's note).
- Rest is still the client's stir test at rung 1 (500 ms under 0.25 units, held in menu mode) against the engine's deactivation
  (E10, unread under the cap); rung 2 replaces it.

Tests (rung 1): T0 in wire-rules props.rs (the rebuilt cases, a_players_new_grab_ends_its_hold_of_another_prop, the pickup's, and
the three-seat proptest against an oracle of the stream: the record moves for the owner alone, every word raises the epoch by one,
no contact, drop or impulse takes a held row or one inside its moving window), the bridge's codes, wire-validate's player 0 and
unit/PropTest.cpp's eight cases with the pickup's; T2, the prop-physics session's two player-0 return words, green on f38f5249 at
09:29Z 2026-11-12 (numidium), 1af7641d's red on the pickup's row reverted at d9da7da3; T3 by path, x-prop-arbitration v14.3 and
x-prop-edge v1.3 (lab/.cache/drafts/physics/rung1-stage, unrun on the build; its five premise reads green by 20261112-083749),
then b-prop-arbitration in its own commit, and b-prop-push out of pending with W3's read.

### A pickup is a take (ADR-071 rung 1, D1 A; 02:34 PST 2026-11-12, fork m4-physics-1-arbitration a539bded, 7f4f1506; its T2 row 1aa78a86 reverted at d9da7da3)

Why: a grab the engine refuses in its own frame ends in a pickup at the key's release (docs/engine/havok-props.md E16 and E28),
and the server's pickup read no prop row: ProcessActivateNormal's pickable branch gives the item and deletes a 0xff reference for
any activator (MpObjectReference.cpp:2273-2289). In x-moving-press 20261112-082448 c1's key-up picked up the ingot c2's engine
was moving, deleted for every seat (c1-console.log:1701, server.log:947); rung 1's f38f5249 removed the refused grab's grant
(readHolds) but not the pickup (lab/.cache/drafts/physics/read-rung1-premises.md fed3f9cf, section 7, D1).

The rule (R0: a pickup is an inventory transfer the server computes; ADR-071 decision 2's table: held, taken by nothing; moving,
taken by a grab alone; resting, any claim). A player's first activation of an item reference is a take. A prop another player
holds grabbed is taken by nothing, so the pickup is refused E_PROP_HELD; one another seat streams awake is taken by a grab alone,
so the pickup is refused E_PROP_MOVING; the picker's own row and a prop at rest, stalled or unclaimed are taken as before, and the
pickup changes no row. A refused pickup does nothing else: OnActivate returns after the reach gate (no hazard note, no relay, no
Activate), so nothing reaches the picker's inventory, the reference stands for every seat, and the picker's game hears the
current word, once per prop per second (A5). The picker is the reporting game's player, the id the rows name, so a hosted
caster's pickup is its host's take. Built: the rule's pickup in wire-rules props.rs (a539bded) and
ActionListener::RefusePropPickup called from OnActivate (7f4f1506), proven at T0 (props.rs's pickup cases and proptest,
PropTest's case), with x-prop-arbitration v14.3's leg 3d its T3 read (unrun). T2's row of it (1aa78a86: c2's pickup of the dagger c1 streams
awake, refused E_PROP_MOVING and answered) went red on 1af7641d and is reverted (d9da7da3): the legacy stack's C++ fakeclient
resolves no {{created:80254}} placeholder, so its Activate fails that client, and difftest compares a client's exit and sends
strictly, which no declaration covers.

Its two lines, logged at warn for every refusal (the claim's shape, no rate limit; no stream counter counts an activation's
refusal), ActionListener.cpp:4037 at 7f4f1506:
- `[verb:prop-physics] E_PROP_HELD: <seat> picks up prop <id>; another player holds it grabbed`
- `[verb:prop-physics] E_PROP_MOVING: <seat> picks up prop <id>; another seat streams it awake: a pickup takes a prop at rest, a grab takes it at once`

The picker's own game after a refusal, HYPOTHESIS until a run reads it (x-prop-arbitration v14.3's leg 3d, its kept3d and
inv3d claims): unchanged, and no restore is needed. dealWithRef blocks the engine's activation of every item copy the server
sends (skymp5-client objectReferenceEx.ts:134-141: blockActivation(!lifted), lifted for ACTI and MSTT in a hosted cell alone);
the block withholds the engine's default processing, the pickup itself, while the activate event still fires and carries the
Activate to the server. The item reaches an inventory and the copy leaves a world only by the server's pickup, and a refused one
sends neither. The answer word repeats the standing one at its epoch, which onOwner applies (an equal epoch replaces), so the
picker's copy keeps following its owner's stream.

Declared limits (rung 1):
- After a successful pickup the prop's row stays in the props table, since the pickup changes no row: for a server-made 0xff
  prop the row belongs to a deleted reference.
- A game-file item whose create message has not reached the picker is not blocked (dealWithRef runs once the create message's
  reference loads, remoteServer.ts:597-603), so a refused pickup there leaves the item in the picker's game.

### Rung 2: the sample v2 (ADR-071 decision 6, rung 2 "sample v2"; fork m4-physics-2-sample cc5c44f3, 2026-11-12)

Built on rung 1's head, merged in and never rebased (lab/.cache/drafts/physics/rung2-plan.md 7912ad16; its fresh reviews
review-3892415e-server.md 97d5f5b8 and review-3892415e-platform.md 8f35b128): fork a8c36dd2 the rule, e8d2251d the wire
(SCHEMA_VERSION 46), ccadfced and 3dc4904b the server, e1afd811 and 70563920 the T2 session, 6009b024, 5d6d5259 and 4c9ff632 the
platform, 3b141876 and 6e405ab8 the client, 9fc1e8f7 the server review's fixes. The shapes are the Message contract's below and
docs/WIRE.md's; what the rung changes:

- A sample is judged by its epoch first, then the owner table, then its order, never by its position (ADR-066 decision 4): after
  rung 1's Outside, Frozen and Away, an epoch below the prop's is E_PROP_STALE (a sample of an earlier tenure) and one above it
  E_PROP_FUTURE, whoever sent it; then E_PROP_NOT_OWNER; then a sequence not newer than the row's last at the epoch is Late
  (serial-number arithmetic on the u16; accessible: Fiedler, "Reliable Ordered Messages", gafferongames.com, 2016; foundational:
  Elz and Bush, "Serial Number Arithmetic", RFC 1982, 1996), dropped and counted with no line and no answer; then the step budget.
  ADR-066's ack (d5) and its grace are not built.
- The step budget is one clock per prop, the generic cell rate algorithm's virtual scheduling (accessible: "Generic cell rate
  algorithm", Wikipedia; foundational: ITU-T Recommendation I.371). The distance bucket, refilled at PROP_MAX_SPEED_UNITS_PER_S
  6,000 units a second and holding one step (PROP_STEP_ALLOWANCE_UNITS 600), is the prop's, and so is its clock: an epoch's first
  sample brings the clock to the server's time, and each later one moves it by the owner's own elapsed time since its last
  accepted sample (tMs; nothing for a clock that ran backwards), held between PROP_CLOCK_LAG_MS 1,000 behind the server's clock
  and PROP_CLOCK_SLACK_MS 250 ahead of it; an epoch rise starts no fresh slack. So an honest stream whose arrivals bunch after a
  stall is taken whole, and whatever tMs claims, over any window of the server's time the record travels no farther than the cap
  allows for that window, PROP_CLOCK_LAG_MS and the slack, plus the one step: 14,100 units in a second, 8,100 at one instant
  (Trust, below). Both clock constants UNMEASURED. The plan's first form, a credit counted from each epoch's first sample, banked
  a whole epoch (60,000 units in a second in a8c36dd2's simulation).
- An awake sample past the budget is E_PROP_STEP, answered with the word and the record; an asleep one past it is clamped and taken
  (ADR-071 decision 6; Clamped replaces rung 1's RestRefused): the record moves the budget's distance from where it stands toward
  the sample, the other listeners hear that rest re-encoded (never the sender's bytes, which name the far point), the prop returns
  to the host with the player-0 word, the sender hears the record, unlimited, and the server's line is the rest's with ", clamped
  from (x, y, z)".
- Every answered refusal of a sample (E_PROP_NOT_OWNER, E_PROP_STALE, E_PROP_FUTURE, E_PROP_STEP, E_PROP_OUTSIDE, E_PROP_FROZEN)
  gets the word and then the record, PropTransform at seq 0 (AnswerPropRecord, behind rung 1's once per prop per second per
  seat), so a divergent word and copy heal; but the live owner's own stale sample is said and not answered (3dc4904b: its newer
  word is already on the reliable channel and the record lags its body, which an answer would rewind), so a record answer is
  always a place its receiver puts its copy. E_PROP_AWAY, E_PROP_UNSEEN, E_PROP_KIND, E_PROP_RANGE and E_PROP_FAR stay
  unanswered. A sample with bones is refused E_PROP_KIND before the rule: no row takes a body's parts until rungs 4 and 5.
- The engine's grab rides the sample (D-PH3 A on the wire): an accepted awake sample sets the row's grab to its held flag, so the
  first held-false sample ends a hold with no release claim; one hand a player holds (a late held sample of a hold the player's
  next grab ended never takes the hand back).
- A claim names one to sixteen references, each judged alone through rung 1's gates with its own verdict, word and line (the
  granted line a lone reference's, which b-trap-look and the rung 1 probes count); refusal lines share the samples' 10 s limit per
  seat, now kept on the connection (9fc1e8f7).
- The owner reads its body, never its reference (E21): one readBodies(simulated ids, false) an update, a platform export
  (6009b024, PuppetApi.cpp) answering each found body's awake bit, motion type, the 3D root's world pose (rot by the platform's own
  EulerDegreesXYZ, E45) and lin and ang from the entity's motion, filtered in native (rule 9: a body answered while awake and once
  at the read its island fell), on the JS thread under no lock (4c9ff632: a JS thread waiting on the world's lock could hang
  against an engine thread waiting on the JS thread). A sample is due at 2 units or 2 degrees or a hand change, at most every
  SEND_MIN_MS 100, and at the heartbeat; its seq runs from 1 at each epoch; tMs is the service's one clock (performance.now()
  where the embedded Node has it, named at startup, "samples timed by ..."); lin and ang are the read's, scaled within the wire's
  bounds. A priority accumulator holds the sends inside a mirror of the server's prop budget (128 at once, 80 a second), the rests
  first and always, the rest by the time since each body's last sample weighted by its speed (accessible: Fiedler, "State
  Synchronization", gafferongames.com, 2015; foundational: Frohnmayer and Gift, "The TRIBES Engine Networking Model", GDC 2000).
- Rest is the engine's deactivation plus the heartbeat: the asleep sample goes reliable at the read where readBodies' awake bit
  falls with no hand ("stream <id> asleep (deactivated, seq S)"), or once an open stream's body has read inactive for a heartbeat
  ("(inactive, seq S)"); a held body never rests on the wire. The stir test, SLEEP_AFTER_MS, REST_READ_MS and the menu-mode hold
  are deleted (a paused world steps no Havok, so its island stays awake on the wire's terms). HYPOTHESIS: havok-props.md E46, and
  E10 under the cap.
- The follower renders the stream three samples behind the owner's clock and never extrapolates (ADR-071 decision 3;
  sync/propFollow.ts, a pure module): the render clock is this seat's clock less the stream's offset (the least arrival less tMs
  over its last 16 samples, NTP's clock filter's choice; accessible: Mills, "The NTP Clock Filter Algorithm"; foundational: Mills,
  "Internet time synchronization: the Network Time Protocol", IEEE Trans. Communications 39(10), 1991) less propFollowDelayMs, a
  client setting, default 300 and at most 600 (the 8-sample buffer at the owner's cadence, less the pair the render clock is in);
  the render clock never steps back. One keyframed translate a segment, toward the pair's end, at the speed that covers what is
  left of the segment on the owner's clock (at least SEGMENT_MIN_MS 50); past the newest sample the copy holds and the frame counts
  dry; a target JUMP_UNITS 256 or farther lands within JUMP_MS 100; the asleep sample applies when the render clock reaches it, and
  D73's Dynamic set follows REST_DYNAMIC_MS 300 later; the stream is quiet at two heartbeats past its newest awake sample on the
  render clock (FOLLOW_QUIET_MS 1,000; with the delay, a gap between arrivals of 1,300 ms by default, inside the server's 1,600). A
  word naming another seat sets the copy Keyframed before any sample; a record answer ends the stream and places the copy at the
  record. Accessible: Fiedler, "Snapshot Interpolation", gafferongames.com, 2014; foundational: Bernier, "Latency Compensating
  Methods in Client/Server In-game Protocol Design and Optimization", GDC 2001. STREAM_LIVE_MS and the one-interval glide
  (GLIDE_MIN_MS, GLIDE_MAX_MS) are deleted.
- The take-over: a word naming this seat while its copy follows a live stream (a departure's or an unload's return to the host, a
  stalled row's claim) places the copy at the stream's newest sample by a keyframed translate, sets it Dynamic and, in that set's
  answer, hands it the sample's velocities through the platform's setBodyVelocity (CommonLib's bhkRigidBody::SetLinearVelocity
  and SetAngularVelocity, queued to the main thread): "took over <id> at seq S moving N units a second, J units ahead (velocity
  handed)". HYPOTHESIS: havok-props.md E47.
- E21's remedy: placeAtRecord reads the body against the record and sets a Dynamic body Keyframed before its keyframed translate
  (HYPOTHESIS: E48).
- A woken host's rest that its wake's word overtook (its one asleep sample named the old epoch: Stale, and unanswered as the live
  owner's own) is sent again under the new word when the body still reads asleep ("stream <id> asleep (re-sent under the new
  epoch, seq S)"; 6e405ab8, the server review's finding 1).

Declared limits (rung 2):
- The render delay: every follower shows the owner's body about propFollowDelayMs (300 ms) late, by design, since nothing
  predicts; a slow body's samples come at the heartbeat's 500 ms, and the copy holds at the newest between them.
- The woken host's dropped sample: A7's wake raises the epoch, so a sample the host sent before its wake's word came back reads
  Stale and is dropped, about one a wake at the lab's round trips; no grace is built (the plan's DEF-2b; ADR-066 decision 4 as
  written), and under loss more is the design (a lost reliable word waits for renet's 300 ms resend). x-prop-follow v1.2 records
  E_PROP_STALE from the woken host.
- A clamp's visible jump: the owner's copy goes back to the clamped record at the record answer (rare once rung 3a's first-sample
  allowance covers a blasted body's flight).
- PROP_CLOCK_LAG_MS and PROP_CLOCK_SLACK_MS are unmeasured: x-prop-follow's loss leg is netem on sky-srv, which shapes only
  sky-srv's outgoing traffic, so the seats' own samples reach the server unshaped and the arrival bunching the clock must forgive
  goes unread.
- readBodies runs on the JS thread under no lock: HYPOTHESIS that the JS tick never overlaps Havok's step on the worker threads
  (E2), a torn read at most one step's motion; if a read shows one, the read moves to the game thread (gameThrQ), never to a lock.

Tests (rung 2): T0 in props.rs (a_sample_is_judged_by_its_epoch_first, a_late_or_repeated_seq_spends_nothing,
the_owners_clock_takes_a_bunched_honest_stream, a_crafted_clock_buys_no_more_than_the_servers_time_and_its_slack,
a_still_clock_banks_no_more_than_the_lag_and_the_slack, an_epoch_rise_starts_no_fresh_slack,
a_rest_past_the_bucket_is_clamped_and_returns_the_prop, the_samples_held_flag_holds_and_ends_the_grab, and the proptests),
wire-validate (a_v2_prop_sample_bounds_every_float, a_prop_claim_names_one_to_sixteen_references_once_each), wire-schema's size
test, the bridge's speed-cap pin and PropTest's v2 cases; T2, the prop-physics session at cc5c44f3 (docs/WIRE.md); T3 by path,
x-body-read v1.2 and x-prop-follow v1.2 (lab/.cache/drafts/physics/rung2-stage, unrun), then b-prop-follow in its own commit.

### Rungs 3a and 3: the impact (ADR-071 decision 4, W5 "caster only"; fork m4-physics-3-impact 92b032cd and 042f6907, 2026-11-12)

Built on rung 2's head (lab/.cache/drafts/physics/rung3-plan.md 6dff3374 and its addendum, from the premise reads x-prop-cone v1
20261112-080520 and x-prop-arrow v1 20261112-080858, read in read-rung3-premises-080520-080858.md eb5cdad4) with Eli's D-PH5 to
D-PH8 (ADR-071's rung 3 decisions): fork d603ea09 and d3afb0da rung 3a, 92b032cd its bound on rung 2's final head; 07e0f47b the
server, bebaccc5 the platform, 6190c370 the client; 042f6907 the platform and client review's fixes (review-92b032cd-platform.md
52f149cf).

Rung 3a, the first sample's allowance (R0, server only): an epoch's first sample (none yet at its epoch: after a grant, a return,
a wake) may spend up to PROP_FIRST_SAMPLE_UNITS 3,000, half a second at the cap, of the time the prop's one clock has run since
the row's last write; any accepted sample leaves the bucket one step at most; nothing is banked (the mark is rung 2's last_seq 0,
so a seat that raises the epoch as fast as it can is held to the bound of one that never does). A blasted body flies before the
word naming its mover reaches that seat: the cabbage 0x1c0c6 left at 1,353.7 units a second under Unrelenting Force
(20261111-223256 on c1), one step in 0.44 s and this in 2.2 s. From a grant on a new row the record travels at most the cap for
the server's elapsed time and the slack, plus PROP_FIRST_SAMPLE_UNITS once: 10,500 units in a second; over any window rung 2's
14,100 a second and 8,100 at one instant stand. UNMEASURED: x-prop-impact v1.1 records each caster's impact-to-first-sample time.

The impulse rule (W5): a seat applies a Havok push only from a cause it owns.
- The sites: Gum replacements (HookHandler::Replace, the DamageActor shape) of TESHavokUtilities::ScaleGameplayImpulseForce 26004,
  which sizes every prop's and every static's push (havok-props.md E20, E50, E51), and AddExplosionImpulse 26005, which pushes
  ragdolls (E52), each installed from its RELOCATION_ID in game/Offsets.h's Hooks idiom with CommonLib's own signature.
- The cause: the innermost of three bracket kinds open on the impulse's thread (a thread-local stack): Explosion::Update (its
  actorOwner), Projectile::ProcessImpacts (its shooter; an arrow's push runs inside it) and ConeProjectile::HandleHits (the cone's
  shooter: the frame 20261112-080520 read on both seats, so D-PH6 is settled by the read). A shooter that is no actor (none, a
  trap's dart, a caster activator) is the world's, its cell host's, as an explosion no actor owns (042f6907). The owner is the
  platform's one taxonomy (CauseOwner, the presser rule's PresserOwner renamed): this seat's player or an actor hosted here;
  another seat's figure or puppet; undecided.
- The verdict, in native code (rule 9): another seat's cause, 26004 answers 0.0 and 26005 returns, neither calling its original,
  counted; this seat's, the original, the pushed reference joining the frame's impact set; undecided, the original, counted, no
  claim; no bracket open, the original, counted as outside any bracket. Sound and visuals play everywhere.
- D-PH5, "every physics body": another seat's cause is zeroed for every Havok body on the receiving engine, props, statics and
  ragdolls alike, so the Riverwood Trader's sign stays still on the other screen when another player's spell hits it, until rung 4
  streams statics.
- The kill switch: off by default in the platform (setImpulseCauseRule, setTriggerPresserRule's shape); the client turns it on
  while propPhysics is on and its setting propImpulseCause is not false (default on), and says which: "impulse rule on: another
  seat's cause is zeroed here, this seat's claims what it moved", or "... on, but the platform's impulse replacement did not go in:
  no push is zeroed here".
- Its lines, at each frame's leave: "impulse zeroed: N bodies, cause C (kind S), another seat's (26004 a, 26005 b; thread T)";
  "impulse applied: N bodies, cause C (kind S), this seat's: claim raised, impact K, M references ..." or "...: no reference to
  claim"; "impulse undecided: N bodies, cause C (kind S), no seat's word on it here: applied, no claim"; and, once a second while
  they come, "impulse outside any bracket: N calls, applied (T so far)".

The propImpulse event: for this seat's cause with a reference pushed, one event on the next tick (AddTickTask into
EventsApi::SendEvent, the propContact idiom), { impact, kind (explosion, impacts or cone), cause, refrs: { refrId, formType } },
at most 16 references an event.

One claim per impact: the client claims the event's rows it does not own in one PropClaim v2 by touch 3, "claim <ids> touch 3
(impact K: kind, cause C)", its rows the items (FormTypeEx.isItem of the event's form type) and the trap bodies this seat knows,
and nothing else: a static or a ragdoll is no row before rungs 4 and 5. A cone raises a new impact number at each HandleHits frame
that pushed, so its events fold by cause for CONE_BATCH_MS 100 (UNMEASURED; 042f6907); an explosion's or a projectile's impact is
claimed on the update its event comes. A row another seat streams awake stays home (A3), and a row this seat owns streams the push
as its own wake (A7). The island: readBodies' islands answer each awake simulated body's Dynamic island members by reference (at
most 16, the world's fixed island skipped), and the client claims, per island, the members it does not own and has not claimed in
CLAIM_EVERY_MS 2,000, "(island of <id>)" (HYPOTHESIS: havok-props.md E53).

Tracking at any distance: the tracked set is the nearest TRACK_MAX within TRACK_RADIUS and the trap bodies as before, plus, while
its 3D is loaded in the player's world or cell, every prop this seat owns, holds or streams, every stream it follows and every prop
it claimed in the last CLAIM_EVERY_MS; an awake relayed sample of an untracked prop tracks it in place on the next update; and once
a rescan, an untracked item past TRACK_RADIUS in a cell this seat hosts that its own engine woke is tracked ("rescan: N far
item(s) this seat's engine woke in a cell it hosts, tracked"). On the server, the listener keep (07e0f47b, npc-handoff D6's keep
for a prop): a live row's owner and its prop stay a pair where the grid would part them, on both sides of the subscription (the
prop's pass keeps its owner, the owner's pass every live prop of its), so a body the third word throws past the 3x3 squares around
its caster keeps the caster subscribed; at its rest the next grid pass parts them as the grid would.

Deleted (the plan's B6): the proximity stand-in (TOUCH_RADIUS, TOUCH_QUIET_MS, TOUCH_READ_MS and the setting
propContactFallback); objectReferenceEx's Keyframing of every item on arrival, which with canon's 1,024-unit Keyframing
(havok-props.md E34) was the remote blast's shield, so every game-file item rests Dynamic as the game files make it (D73 for every
item); and untrack's Keyframed park of a body this seat simulated.

Declared limits (rung 3):
- Statics and ragdolls are zeroed for another seat's cause but not streamed until rungs 4 and 5: the caster's engine moves them,
  and every other seat's copy stays still.
- Two owners in contact: another seat's moving body meeting this seat's is refused E_PROP_MOVING, and each engine meets the other's
  copy Keyframed.
- The arrow (D-PH7): its push is ApplyPointImpulse sized by 26004's result (E51), so the zero at 26004 covers it, HYPOTHESIS until a
  zero result reads (E49); no second site is built.
- Spawned copies stay Keyframed (spawnProcess.ts's set for the view's spawn), so a server-made copy such as a dropped item takes no
  push where no seat tracks it (E27): a far cast moves a dropped item on no seat.
- A rest whose write crosses a square drops the owner before its word: the rest sample's own write moves the record across a grid
  square and parts the owner in that write's subscription pass, so the owner hears the DestroyActor and not the word (its next
  subscription brings the current word, A5's path).
- An impact body beyond the claimant's 3x3 squares gets E_PROP_UNSEEN: an island member the flying body meets two squares from its
  caster, or a body the caster's engine moves that far before its claim, was never sent to the caster's game (the keep covers the
  owner's own rows).
- A puppet's or an unhosted NPC's walk into a far item moves it with no claim, since every item rests Dynamic (the plan's R6).

Tests (rungs 3a and 3): T0 in props.rs (a_blasted_props_first_sample_after_a_grant_has_half_a_second_of_flight,
a_first_samples_allowance_is_one_an_epoch_and_never_banked, a_wake_and_rest_cycle_buys_no_first_allowance_the_clock_has_not_run,
a_first_sample_spends_no_more_of_a_lagging_clock_than_its_allowance, and the cap's proptest over three seats' grabs, rests and
wakes) and PropTest's first-sample case, the keep's case and one impact's claim; T2, no session change; T3 by path, x-prop-impact
v1.1 and x-prop-blast v4.1 (lab/.cache/drafts/physics/rung3-stage, unrun), then b-prop-impulse in its own commit.

## Rung

Rung: R2 for the transform (the simulating seat's Havok computes, the server records), R0 for the claim and the pickup (the server
decides who simulates a prop and who takes it).

- The transform: R2. The owner's Havok computes; the server records the last transform and the rest, judging a sample only for
  consistency (its epoch, its owner, its order, conservation, the step budget: Trust, below). Not R1: the server has nothing to
  validate a position against but a speed bound, which it applies as the movement budgets do; not R0: ADR-002 forbids server
  physics.
- The claim: R0. The server decides who simulates by A1 to A7 (ADR-071 decision 2, rung 1): the cell's host owns a resting or
  stalled body; a claim from the engine that moved it takes it at the next epoch; a moving body stays with its mover and a grab
  alone takes it (E_PROP_MOVING); a held body is its grabber's (E_PROP_HELD); it returns to the host only by the owner's asleep
  sample or a departure or unload word.
- The pickup: R0, an inventory transfer the server computes, judged by the claim's rows (A pickup is a take, above).
- The push (rung 3): the cause's owner's engine alone applies it (W5, "caster only"); another seat's cause is zeroed in native
  code, and the push itself stays the owner's Havok (R2).
- Why not one rung higher for the transform: validation needs a physics the server has not got.

### Trust: what the server judges, and what it records on the owner's word (rules 5 and 12; physics rungs 1 to 3a)

- Judged, for consistency alone (ADR-063 decision 4: nothing judges a position against another seat's): the epoch (E_PROP_STALE,
  E_PROP_FUTURE), the owner at the epoch (E_PROP_NOT_OWNER), the order (Late), the listener check (E_PROP_UNSEEN), conservation
  (E_PROP_OUTSIDE) and an unhosted cell's freeze (E_PROP_FROZEN), a trap body's tether (E_PROP_FAR), the kind (E_PROP_KIND), and
  the step budget below.
- Bounded in Rust before anything sees the bytes (rule 12; wire-validate's check_prop_transform and check_prop_claim): every
  relayed float finite and inside the world, each angle within one turn, lin at most 6,000 units a second and ang at most 1,000
  radians a second in length, a bone within 512 units of pos and its quaternion within 1% of unit length, never asleep and held
  together, seq 0 refused from a client, a claim's one to sixteen references, and the budgets.
- Recorded on the owner's word, unvalidated (R2, rule 5): `held` (the owner's engine's grab: an accepted sample sets the row's grab
  to it, so a held flag holds the prop against every other seat's claim; a crafted seat's flag holds one row at a time, one hand a
  player), `tMs` (the owner's clock, which refills the step budget only within the server's, below), `lin` and `ang` (relayed to
  the followers, who use them only at a take-over's hand-off; never checked against the displacement), and the position and
  rotation themselves inside the step budget. A claim's touch kind is the claimant's word too, bounded by the contract and the
  listener check: under A1 to A7 only a grab differs from the rest (a touch 3 takes no more than a touch 0).
- The step budget, one clock per prop (rung 2, the generic cell rate algorithm; Rung 2, above): over any window of the server's
  time the record travels no farther than the cap allows for that window (6,000 units a second), PROP_CLOCK_LAG_MS 1,000 and
  PROP_CLOCK_SLACK_MS 250, plus one step: 14,100 units in a second and 8,100 at one instant (review-3892415e-server.md 97d5f5b8,
  finding 2). Rung 3a's first sample adds nothing to that bound over a window; from a grant on a new row it is 10,500 units in a
  second. A lie is a hop, never a teleport (ADR-063's H1 accepts the lie class on a friends' server). PROP_CLOCK_LAG_MS and
  PROP_CLOCK_SLACK_MS are UNMEASURED.

## Engine surface (CommonLibSSE-NG headers; cite before use, rule 1)

| what | where | note |
|---|---|---|
| a reference's position, angle, 3D | T/TESObjectREFR.h:73-80, :378-381, :414-417, :375, :421 | GetPosition, GetAngle, Get3D, GetTransform |
| the 3D node's collision object, rigid body | N/NiAVObject.h:122, B/bhkCollisionObject.h:30-35, B/bhkRefObject.h:26 | GetCollisionObject, GetRigidBody (REL::ID in the header), referencedObject to hkpRigidBody |
| the body's transform getters and setters | B/bhkRigidBody.h:41-55 | GetPosition, GetRotation, SetPosition, SetRotation, SetLinearVelocity, SetLinearImpulse |
| the motion: type, velocities, deactivation counters | H/hkpMotion.h:26-38, :77-88; H/hkpEntity.h:92, :99 | linearVelocity, angularVelocity, deactivationNumInactiveFrames; the entity's motion at its offset |
| awake or asleep | H/hkpSimulationIsland.h:41-42; H/hkpWorld.h:99-100 | the island's active mark; no isActive in the headers (HYPOTHESIS: in the active list means awake) |
| the motion type set | N/NiAVObject.h:126-135; T/TESObjectREFR.h:468 | SetMotionType Keyframed, Dynamic |
| write a position | T/TESObjectREFR.h:469-470, :456, :259 | SetPosition and MoveTo through MoveTo_Impl; Update3DPosition |
| the touch | B/bhkCharProxyController.h:22-25; H/hkpCharacterProxyListener.h:49 (slot 2); H/hkpRootCdPoint.h:16; H/hkpCollidable.h:54-69; T/TESHavokUtilities.h:15 | READ 15:37 PDT (docs/research/m3/re-havok-contact.md): the player's proxy controller's ContactPointAddedCallback, Address Library 79131 (just addr), fires for Keyframed bodies too; the reference by FindCollidableRef 26003; HYPOTHESIS until lab/frida/prop-contact.js |
| the hand (rung 1) | Game.getPlayerGrabbedRef (Skyrim Platform's vanilla native, skyrimPlatform.ts:2939 at fork c3f9d175); the engine's grabbedObject, P/PlayerCharacter.h:558, :697 | read once an update; HYPOTHESIS that it names the body exactly while the engine's grab holds it (havok-props.md E40, E41, E43) |
| a drop | A/Actor.h:401 | DropObject returns the handle; a dropped item is a prop from its first frame |
| what is a prop | B/BSXFlags.h:17; C/CollisionLayers.h:8-36 | the model's Havok flag and the body's layer (kClutter 4, kProps 10) |
| Skyrim Platform today | skyrimPlatform.ts: getPositionX/Y/Z, setPosition, setAngle, translateTo, applyHavokImpulse, setMotionType, getMass, dropObject, Cell.getNthRef | no velocity, no sleep state, no contact event in the published platform; the fork's own exports add them (the propContact event, readBodies and setBodyVelocity at rung 2, propImpulse and setImpulseCauseRule at rung 3) |
| a body's pose, velocity and rest (rung 2) | the platform's readBodies (fork 6009b024, 5d6d5259, 4c9ff632): T/TESForm.h:210-227, T/TESObjectREFR.h:375; the body by src/RE/N/NiAVObject.cpp:61-75's walk (N/NiAVObject.h:156, B/bhkNiCollisionObject.h:56, B/bhkRefObject.h:26), else the first child's (N/NiNode.h:57-65); N/NiAVObject.h:158; H/hkpEntity.h:92, :99; H/hkpMotion.h:77, :84-85; H/hkpSimulationIsland.h:41, :53; B/bhkWorld.h:48-52 | the root's world pose, rot by the platform's EulerDegreesXYZ (CommonLib's ToEulerAnglesXYZ misreads through NiFastATan2, src/RE/N/NiMath.cpp:23-71); no lock on the JS thread; islands since rung 3 (H/hkpWorld.h:97 the fixed island skipped); havok-props.md E45, E46, E53 |
| a body's velocity set (rung 2) | the platform's setBodyVelocity (6009b024): SKSE's AddUITask (include/SKSE/Interfaces.h:198); B/bhkRigidBody.h:55 SetLinearVelocity (src/RE/B/bhkRigidBody.cpp:26-31, RELOCATION_ID(76259, 78089)), :53 SetAngularVelocity (.cpp:12-17, RELOCATION_ID(76260, 78090)); B/bhkWorld.h:42-46 | queued to the main thread; the take-over's hand-off; havok-props.md E47 |
| the impulse sites (rung 3) | T/TESHavokUtilities.h:18 ScaleGameplayImpulseForce (src/RE/T/TESHavokUtilities.cpp:38, RELOCATION_ID(25467, 26004)), :14 AddExplosionImpulse (.cpp:10, RELOCATION_ID(25468, 26005)); fork bebaccc5's FridaHooks.cpp and game/Offsets.h | Gum replacements with CommonLib's own signatures; havok-props.md E20, E49, E52 |
| the impulse's cause (rung 3) | E/Explosion.h:53 Update, :72 actorOwner (the accessor :89-97); P/Projectile.h:208 ProcessImpacts, :254 shooter (the accessor :291-299); P/Projectile.h:226 and C/ConeProjectile.h:43 HandleHits; each slot read from its vtable at install (include/RE/Offsets_VTABLE.h:2771-2788) | three bracket kinds on a thread-local stack; havok-props.md E50, E51 |

## Observe, impose, suppress

- Observe (the simulator): each update, readBodies over the bodies this seat simulates (rung 2; the body, never the reference): a
  sample at 2 units or 2 degrees or a change of hand, at most every 100 ms, at least every 500 ms while awake or held (the
  heartbeat, rung 1), and once more, reliable, when the engine deactivates the body (never while held). The engine's grab is read
  once an update (Game.getPlayerGrabbedRef). The touches: the proxy controller's contact (the propContact event), the grab, the
  drop, and since rung 3 the propImpulse event of this seat's own cause and the island's members.
- Impose (every other seat): the stream on a Keyframed copy, rendered three samples behind the owner's clock and never
  extrapolated (rung 2's follower); the rest when the render clock reaches it, then D73's Dynamic; the server's record answer
  places the copy at the record.
- Suppress (every other seat): the body's dynamics while another seat streams it awake (Keyframed, and at a word naming another
  seat before any sample); since rung 3, another seat's cause's push on every Havok body (the replacements at 26004 and 26005
  return nothing), its sound and visuals kept.
- The claim: a seat whose engine moved a prop it does not own claims it (PropClaim); the server judges by A1 to A7 and tells every
  listener (PropOwner); a word naming this seat mid-flight takes the body over with the stream's last velocities (rung 2).

## Message contract (wire-schema, validators in the same commit; docs/WIRE.md's prop section)

- PropTransform v2 (MsgType 58, wire id 66; rung 2, SCHEMA_VERSION 46) {refr: u32, epoch: u32, seq: u16, tMs: u32, pos: Vec3, rot:
  Vec3, lin: Vec3, ang: Vec3, asleep: bool, held: bool, bones: Vec<PropBone, 64>}: C2S from the simulator, unreliable while awake
  (at most one per prop per 100 ms while it moves, at least one per 500 ms while awake or held), reliable at its rest; S2C the same
  bytes to the prop's other listeners, a clamped rest re-encoded, and the record answer at seq 0 to a refused sender.
- PropClaim v2 (MsgType 59, wire id 67; rung 2) {refrs: Vec<u32, 16>, touch: u8}: C2S, reliable; one to sixteen references, none
  0, each once; touch 0 a contact, 1 a grab while the engine holds the body, 2 a drop or a hold let go, 3 an impulse (one claim per
  impact since rung 3) or a trap body's firing; each reference judged alone.
- PropOwner (MsgType 60, wire id 68) {refr: u32, player: u32, epoch: u32}: S2C, reliable; player 0 the host of the cell the record
  stands in (rung 1, SCHEMA_VERSION 45); at every owner change, as every refusal's answer and to a late listener.
- Validator rules: Trust, above; E_VAL_RANGE, E_VAL_NONFINITE, E_VAL_OUT_OF_WORLD and E_VAL_RATE as docs/WIRE.md lists them. The
  rule's E_PROP_* codes are server log lines, never wire reasons.
- Idempotency / ordering: a repeated or overtaken sample is Late; a repeated claim on a granted row is Same; a word below an applied
  epoch is dropped and an equal one replaces; reliable sends keep their order, so a refused sample's word comes before its record
  answer.
- Contract doc updated: yes (docs/WIRE.md, 2026-11-12). Slice one's v1 (879f9e88, SCHEMA_VERSION 21) was {refr, pos, rot, asleep}
  and {refr, touch}; canon still carries it.

## Server (Rust first, ADR-010)

- Where the logic lives: wire-rules props.rs (rungs 1 to 3a): the owner table's row kind "prop" (owner, epoch, cell, asleep,
  grabbed, the last sample's time, the step budget's allowance and its clock, the epoch's last seq and tMs) beside the epoch table;
  claim (Granted, Held, Same, Moving, Away), pickup (Taken, Held, Moving), transform (Outside, Frozen, Away, Stale, Future,
  NotOwner, Late, TooFast, Clamped, Returned, Woken, Accepted), unloaded, gone, loaded and reached; no clock changes a row.
  wire-bridge rules.rs crosses them as codes (a sample's outcome {code, epoch, allowed}). The C++ gathers the facts and acts on the
  codes: ActionListener's OnPropClaim (per reference), OnPropTransform (the record by the movement path's SetPos and SetAngle, the
  relay, the words) and RefusePropPickup from OnActivate; PartOne's SendPropOwnerWord, AnswerPropWord and AnswerPropRecord (one
  limiter, once per prop per second per seat), SendPropRecord, the departure's and the unload's words and the late listener's
  word; and since rung 3 the listener keep in MpObjectReference::ForceSubscriptionsUpdate (WorldState's propLiveOwnerOf).
- DB fields / migration: none. The rows and the epochs live in memory and start at 0 after a restart, as each client's table does
  at its create word; the record's place is the reference's record (an asleep sample saves at once, SetPosMode::Other).
- Restart behavior: as slice one's (D75, havok-props.md E36): the record's rest returns on both screens at the load, every prop
  asleep and the host's by default.
- Papyrus natives touched: none (no docs/NATIVES.md row; the platform's exports are no Papyrus natives).

## Client (TypeScript)

- TS handler: PropService (skymp5-client propService.ts) and sync/propFollow.ts (rung 2's follower, a pure module): the owner's
  stream from readBodies with the heartbeat, the rest at deactivation and the priority accumulator (rung 2); the word by ownerOf and
  hostsCell, an equal epoch applied, a rest the word overtook sent again (rungs 1 and 2); the touches, the contact event held while
  another seat's stream is live here (A3), the hand from Game.getPlayerGrabbedRef, the drop, and since rung 3 propImpulse's one
  claim per impact and the island's claims; the follower's render clock and the take-over's hand-off (rung 2); the tracked set,
  the nearest 64 within 1,024 units, and since rung 3 every prop kept at any distance while loaded and the far wakes. The drop
  service frees the engine's own dropped copy by Disable before Delete (W3, rung 1).
- SP binding: the fork's own exports beside setPropFollowed, never Papyrus natives: the propContact event (slice one), readBodies
  and setBodyVelocity (rung 2), propImpulse, setImpulseCauseRule and readBodies' islands (rung 3), declared in codegen's
  Definitions.txt and typed for the client in clientListener.ts's module augmentation.
- Kill switch config keys: propPhysics (the verb); propImpulseCause (rung 3's impulse rule, default on); propFollowDelayMs (the
  render delay, default 300, 0 to 600); propBodyReadLog (the "body" lines, off by default). propContactFallback is deleted at
  rung 3.

## Tests

- Physics rungs 1 to 3 (2026-11-12): each rung's Tests line under Ownership. T0 and T2 run on each head (rung 1's T2 green on
  f38f5249; the later heads' at their stages); the T3 probes are drafts by path, unrun on the builds, and the gate scenarios
  b-prop-arbitration, b-prop-follow and b-prop-impulse are promoted only from their green legs, each in its own commit (rule 13).
- T0: the owner rule (claim, lease, host default, epoch), the validator's bounds and budget (wire-test fixtures per row).
- T2: a difftest session with a transform stream and a claim; the legacy core has no rows, so the session's divergences are declared.
- T3: x-prop-push (c1 walks into a basket at lab-spawn; within 2 s c2's basket is within 32 units of c1's and rests where c1's
  rests), x-prop-pass (c2 kicks it back; the owner flips; c1's copy follows), x-prop-drop (c1 drops a sword; c2 sees it land where
  c1's does), x-prop-restart (the basket where it rested after a server restart). Scenario b-prop-push after the probes hold.
  Written by path (2026-10-29 and 30): x-prop-push v2 (the restart half inside it, on the guard camp's tankard 0x3975b),
  x-prop-pass v2, x-prop-drop v1 (the server's AddItem gives c1 a SteelSword, the game's own console drops it, the touch-2 claim
  line, one runtime copy on each seat, the two copies within 32 units in x and y through lab-api's new refs-near pos fact: the
  listing's position rows, which no fact exposed before; the created reference's rest after a restart is not read, a created
  reference having no stable id for server.ref). All three play at the union's stage. x-prop-grab v1 (2026-10-30) reads the
  grab, slice one's first sure touch: the non-host pitches its view onto the host's tankard through lab-api's mouse step (look's
  SetAngle pitch may not reach the first-person view; the rune probes' 20.2 px per degree) and holds E 3 s; the claims are the
  touch-1 claim granted, the grabber's stream and the host's Keyframed follow, the record moved; the aim is the premise
  (crosshairRef), the engine's hold threshold HYPOTHESIS, the exclusivity (E_PROP_HELD) left to x-prop-grab-held.

## Dynamic plan

lab/frida/prop-contact.js (`just frida prop-contact <client>`): hooks the proxy controller's ContactPointAddedCallback (79131) and the
interaction's impulse body (78304) on both seats while the player walks into a basket twice; logs this, the collidable's layer, the
owner body's motion type, the reference's id (FindCollidableRef 26003) and the thread. Expected: on the simulating seat 79131 once per
touch and 78304 every step with bumpedBody the basket; on the other seat 79131 fires with motion type 4 and 78304 stays silent; then the
stream's first sample within 100 ms of the first contact on the owner's seat. The thread the callback runs on decides whether the
hook's event send hops to the JS thread.

Physics rungs 2 and 3 (2026-11-12): each new HYPOTHESIS row of docs/engine/havok-props.md names its read, all by path, each with a
fresh review before its first run (ADR-064 amendment A): x-body-read v1.2 (E45 at P0, E46 at leg A, E48 at leg B) and
x-prop-follow v1.2 (E47 at leg D) from lab/.cache/drafts/physics/rung2-stage; x-prop-impact v1.1 (E49 at I1 and I2, E52 and E53 at
I2) and x-prop-blast v4.1 (E51's watcher half at leg C) from rung3-stage, with prop-impulse.js ATTACH_ONLY on rung 3's seats, since
Frida takes one replacement a function a process. Owner: agent (the lab).

## Status

- [x] doc complete, inventory listed with a disposition per row, rung declared (ticked 17:36 PDT 2026-10-29 by the pass: the Engine surface table and the Observe, Impose, Suppress split carry a disposition per row; Rung R2 for the transform, R0 for the claim, declared at the top; the reference trace is the stage's, lab/references/prop-push.json when x-prop-push runs under the recorder; physics rungs 1 to 3's rules, lines and declared limits under Ownership, 2026-11-12)
- [x] engine surface cited or delegated (ticked 17:36 PDT 2026-10-29 by the pass: every row cites CommonLibSSE-NG by file:line; the touch was delegated to the re-analyst and read, docs/research/m3/re-havok-contact.md, its ids 79131, 78304 and 26003 by `just addr`, HYPOTHESIS until lab/frida/prop-contact.js; rungs 2 and 3's surface by CommonLib file:line, their engine claims docs/engine/havok-props.md E45 to E53, 2026-11-12)
- [x] message contract in wire-schema with validators and fixtures (same commit; 879f9e88; on fork branches, 2026-11-12: player 0 at 8d6f92f1, SCHEMA_VERSION 45, and v2 at e8d2251d, SCHEMA_VERSION 46, each with its validators, fixtures, C++ structs and TS interfaces)
- [x] server rule in Rust with T0 (8699e3c8; the C++ T0 PropTest runs on CI; on fork branches, 2026-11-12: A1 to A7 at d463d367 with the pickup a539bded, v2 at a8c36dd2, rung 3a at d603ea09 and 92b032cd, each with its T0)
- [ ] native hook + T1 (the contact hook BUILT, fork m3-prop-physics be76cf80: a Gum on-enter detour on 79131 filtered to the player's proxy controller and the clutter and props layers, one propContact event per prop per 250 ms through the tick queue; T1 none, the trace at the stage; the transform read and the Keyframed set are the platform's own natives; on fork branches, 2026-11-12: readBodies and setBodyVelocity, 6009b024, 5d6d5259 and 4c9ff632; the 26004 and 26005 replacements, the three brackets and propImpulse, bebaccc5 and 042f6907; T1 none)
- [x] SP binding and TS service (the TS PropService, bb4e9f9f; no new SP binding in slice one: setMotionType, translateTo, setPosition from the platform's own surface; on fork branches, 2026-11-12: the clients of rungs 1 to 3, b7151a42, 3b141876 and 6190c370, with their fixes)
- [x] T2 green (ticked 20:09 PDT 2026-10-29: P3 f61a2b39's T2 GREEN at 03:08Z, numidium, its own difftest job 14395; the prop-physics
      session identical to legacy with its 14 declared divergences, the kept server log without an E_PROP line; the union P3-win
      72c44f04's T2 is the last before the stage; the physics rungs, 2026-11-12: rung 1's T2 of f38f5249 green at 09:29Z, 1af7641d's red on
      the pickup's row reverted at d9da7da3; the later heads' at their stages)
- [ ] T3 scenario green (b-prop-push GREEN at the gate 20261101-032302 on 4f746162; x-prop-push v16 GREEN 20261101-014442 on b763e3ac with the restart leg; pass v13 and (UNTICKED 19:02 PST 2026-11-02: 30 open engine claim lines over it, the root-cause plan's W5 and VERB.md's rule; ticked again when each claim cites a run or trace id, lab/tools/verb-lint.py)
      grab v9 green on 222a7471, rerun on b763e3ac at the stage; b-prop-push on thuum main 703eabcf, its first run at the train's gate;
      the physics rungs' gate scenarios, 2026-11-12: b-prop-arbitration, b-prop-follow and b-prop-impulse unpromoted, their probes unrun on the builds)
- [ ] parity scenario green, or its later list reviewed with it (ADR-031)
- [ ] sequences and combinations green (ADR-033)
- [ ] ledger and suppression registry updated

Play: BROKEN, playtest 41 (2026-11-02): "a bucket carried doesnt show" (the server refused the carrier, E_PROP_REACH and
E_PROP_CELL), the cabbages launched out of sight, the smithy's wheel did not move, and at the close "item physics sync is more
broken than it was when we STARTED testing" (LOG 15:33 item 2, break 2, 18:30); the mine's cart synced until the seats parted.

## The build's departures from the first draft (14:54 PDT 2026-10-29, the server half)

- The rules are pure: owner_of, transform and host_changed take now_ms, and transform takes the cell's host (an unclaimed prop is the
  host's by default). The bridge: prop_owner_of(refr, cell_host, now_ms), prop_transform(refr, player, cell, cell_host, asleep, now_ms),
  props_host_changed(cell, host, now_ms); PartOne gained ClaimProp, PropTransform, PropOwnerOf, PropEpochOf, PropsHostChanged (in
  ApplyHostDecisions' Grant case) and props_gone beside cells->gone at the disconnect.
- PropRow has `grabbed`: a grab (touch 1) holds the prop against other players' claims until the owner's drop or impulse (HYPOTHESIS: the
  engine's grab is exclusive on its seat). WrongCell: no cell at the sample's point, or an unhosted cell with no live lease (the record
  freezes). A lapsed toucher's re-touch is Granted anew (a new epoch), so the host's seat hears the word and goes Keyframed. The
  transform's cell is the sample's position in the record's worldOrCell (HYPOTHESIS: a prop never changes world or interior by physics).
- PropClaim has no client event (C2S only); PropTransform and PropOwner have both. touch is u32 in C++, range-checked in the handler too.
- Unverified: the C++ on CI (listener population after ForceSubscriptionsUpdate, the LocationalData init, the first CellLoaded's grant);
  the lease's end tested in Rust alone; the difftest session drops an iron dagger and assumes the drop lands at 0xff000004.

## The client half (15:18 PDT 2026-10-29, fork m3-prop-physics bb4e9f9f, slice one)

PropService (skymp5-client/src/services/services/propService.ts, 880 lines; registered in index.ts; HostService gained hostsCell): every
500 ms the view's bound item references within 1024 units (the nearest 64; FormTypeEx.isItem's ten types) are tracked; the owner is
the last PropOwner's player while its lease lives (the client mirrors PROP_LEASE_MS 3000 and the asleep rule so a toucher's seat does
not keep a Dynamic body the server no longer accepts samples from), else the cell's host. The simulator's body is Dynamic and streams
a sample at more than 2 units or 2 degrees since the last sent, at least 100 ms apart, unreliable, and one reliable asleep sample after
500 ms still; the follower's body stays Keyframed and takes each sample by translateTo over the clamped interval (50 to 300 ms) under
256 units, setPosition and setAngle beyond and at sleep; echoes of owned props are ignored and logged once. Touches: a grab (touch 1), a
drop (touch 2: containerChanged out of the inventory matched to the server's copy by base within 3 s and 512 units; the release sends
touch 2 too, since props.rs holds a grabbed prop against every other claim until the holder's drop), and the proximity stand-in (touch 0:
a prop that moved more than 2 units between two reads with the player within 128 units and no sample for 300 ms, once per 2 s).
formView.ts skips the movement block for a tracked prop (the item's CreateActor movement, re-applied every 2 s, would yank a Dynamic
body back to its login place); PropService writes each sample into the model's movement so untracked props still land where the stream
left them. Wake policy: setMotionType(Dynamic, true) only when a PropOwner names this seat; host-default clutter gets false (no settle
storm of 64 bodies). A 1 s grace after tracking before any motion-type change (SpawnProcess's own Keyframed set comes last). Kill switch
propPhysics. Logs under [verb:prop-physics]: "claim <hex> touch N", "stream <hex> started|asleep", "applied <hex> from the stream"
(per 10 s), "prop <hex> owner <hex> epoch N (mine|theirs)" and "(host)" at a fallback.

**The structural hole, named:** a Keyframed body never moves from a bump, so the proximity touch fires only on bodies the arrival
forcing missed or an ex-owner's after its lease; a non-host walking into a basket gets nothing. The sure touches are the grab and the
drop, and the host's own push covers x-prop-push when the walker hosts the cell. The contact native (the Havok callback on the player's
character controller, the re-analyst's read in flight) is slice one's missing piece for x-prop-pass; until it lands, the claim on
contact is HYPOTHESIS and the probe uses the host as the walker. Everything engine-facing (motion-type flips at runtime, translateTo on
keyframed clutter, the 500 ms sleep stand-in, the drop match against DropItemService's delete) is untested until x-prop-push.

## The touch built (15:51 PDT 2026-10-29, fork m3-prop-physics be76cf80)

Offsets::Hooks::CharProxyContactPointAdded{{ REL::ID(79131) }} (Address Library 1.6.1170, just addr; AE only, as Reanimate), the on-enter
detour OnPropContactEnter: the point's rootCollidableB on layer kClutter or kProps (GetCollisionLayer), `this` (the listener subobject at
the controller's +0) cast to bhkCharProxyController and compared with PlayerCharacter::GetSingleton()->GetCharController(), the broad-
phase handle's type kEntity, the owner as hkpEntity and its motion type, the reference by TESHavokUtilities::FindCollidableRef; one event
per reference per 250 ms under a mutex; delivered by SkyrimPlatform::AddTickTask into EventsApi::SendEvent("propContact", {{refrId, layer,
motionType}}) (the locked tick queue, safe from any thread; EventManager's EmplaceEvent registers the name, the train-25 lesson). Typings
in codegen's Definitions.txt (skyrimPlatform.ts regenerated byte for byte) and the client's module augmentation. The client: PropService
queues the event's ids and, on the update, claims a tracked prop it does not simulate and does not own (PropClaim touch 0, the 2 s per-prop
throttle), logging "[verb:prop-physics] contact <hex> layer N motion N: claimed" or "owned, no claim"; the proximity stand-in sits
behind propContactFallback (default off). HYPOTHESIS until lab/frida/prop-contact.js: the callback's thread, that slot 2 fires for a
Keyframed body under the player's proxy controller, and that FindCollidableRef is safe there. The Windows build compiles it at the -win
push; MSVC's /WX is the first reader.

## Slice two's read and the persistence path (16:54 PDT 2026-10-29)

**Pulled forward 12:35 PST 2026-11-02 (turbo 2, Eli's close of arm one: "ok close out this arm of the playtest. that's enough things for now. land fixes for those things. quest script behavior, containers both boxes and bodies, skill books, physics world objects raise wall"):** slice two builds now, not in M4's dungeon work. First
read: the Riverwood cart Eli kicked (its reference and base record type by esm.py near the camp; the 10-29 survey listed no MSTT
there, so a STAT or a MISC with a Havok body is the likely answer), then the prop row kind widened to that type with the same
PropTransform, PropClaim and PropOwner shape; the persistence path as written below.

**BUILT 13:22 PST 2026-11-02, fork m4-prop-statics f07ba07e (off parity 4fdb2d31):** the cart Eli kicked is Riverwood's cart wheel, the one
MSTT named Cart in Skyrim.esm (HandCart01Wheel 0x1c0c3, placed twice: 0x1c0c2 by the smithy at (20758, -45548, -104) and 0x14201 at
(21377, -46104, -99); lab/esm.py). The admission is a list, not a type: server-settings.json's `propStatics` (["<shortid>:<plugin>",
...], the restrictedRaces key's shape; the lab's files list the wheel) names the movable static bases that are props, because every
other MSTT near the lab's cells is an effect, a sign or an animated static and a Raise Wall's MSTT must stay out. The server loads a
listed base's references from the game files as items (WorldState::AttachEspmRecord's isPropStatic, WorldState::IsPropStatic resolving
the FormDesc at the ask), IsPropKind takes claims and transforms on them, and the client's scan admits MovableStatic beside the item
types (FormTypeEx.isProp; the server sends records for the listed bases alone, so nothing else reaches the scan: no wire change, the
record write slice one's, no migration). T0: PropTest's movable static case (the wheel's claim granted and its sample moving the record
and relayed; the wall's refused; the list cleared; bad entries throw). Probe x-prop-static (9ef40b22), unrun while fork m4-prop-statics is unmerged: c1 hosts the smithy's
yard and walks through the wheel, both seats within 32 units and the record moved, the rest kept across a restart; HYPOTHESIS until it
runs: the proxy controller's contact fires for the wheel's collision layer (a non-host's walk would claim it; the probe's walker is the
host, so its leg needs no claim), and a walk shoves a cart wheel at all (the record's move is claimed over 4 units, not slice one's 16).
Then b-prop-static in its own commit. That stage runs the probe first, by path, before m4-prop-statics merges: probe-runs.py stops seeing this line once it names the branch (2026-11-05, the canon merge of 0f2f3c55, whose gate it refused). Slice three (dragging, bodies) stays as written below.

ADR-058 decision 4 gave slice two the movable statics (MSTT) and the Blue Palace's physical container. The master file says otherwise
for the lab's cells (esm.py on sky-srv, Skyrim.esm 1.6.1170, `near 0x3c` within 3000 units): eight MSTT references around Riverwood's
spot, none around lab-spawn, every one an effect or an animated static (FXMotesForest01, FXSmokeChimney02, FXMistStreet01,
FXrapidsBig01, Campfire01LandBurning, SpitPotOpen01), and no CONT editor id containing "Palace" or "Phys". The props a player moves
are items, slice one's set; the traps' bodies are M4's. Slice two is deferred to M4 with the dungeon work (ADR-058's note of this
hour); head 3 continues on slice one's proof, its persistence and the review.

Persistence (rule 6): the asleep sample's SetPos runs in SetPosMode::Other, which saves the record at once (MpObjectReference.h:55-62),
the awake samples in CalledByUpdateMovement, which saves from time to time; no schema changes, so no migration. x-prop-push carries the
restart half (the record's x within 8 of its rest after `server: restart`, the watcher's fresh copy at the record), so a separate
x-prop-restart is not needed; b-prop-push inherits the step. PropTest's third case reads the record after a sample (the same
ChangeForm the save writes). HYPOTHESIS until the run: that the client's arrival forcing (formView's item movement, skipped for a
tracked prop) leaves the restarted record's place standing on a fresh seat.

## The review's fixes (17:19 PDT 2026-10-29, fork m3-prop-physics 720a6608; P3 1b9e97f7, P3-win 1f53626c)

An agent's rules review of slice one (33240fd4..ff59516e) found six holes and two low notes; every one is fixed on the branch before
the trace, so the lab proves the rule as it ships.

1. The authority was the sample's cell: the position a seat sent named the cell whose host was asked, and no step bound existed, so
   an owner or a host could relocate a prop across cells in one message (rule 5). Now the host of the cell the RECORD stands in is
   the authority (PartOne::PropTransform takes the record's cell), and the rule judges every sample against a step budget from the
   record: PROP_MAX_SPEED_UNITS_PER_S 6000 for the time since the last accepted sample, never under PROP_STEP_FLOOR_UNITS 128 (both
   UNMEASURED; x-prop-push sizes them); a sample over it is TooFast (E_PROP_STEP), refused and relayed to nobody, the record standing.
   The sample's facts cross the bridge as one shared struct (PropSampleFacts), the melee rule's shape.
2. Every non-actor reference counted as a prop on the server where the client filters to items: a door, a container or an activator
   could be claimed and streamed under the floor. Now IsPropKind gates both handlers on libespm's item types (E_PROP_KIND), the
   client's FormTypeEx.isItem set, and a claim needs the claimant within reach of the prop's record: 256 units for a contact or a
   grab, 512 for a drop, 2048 for an impulse (E_PROP_REACH; UNMEASURED budgets).
3. A grab's exclusivity broke at the client's 500 ms stir test: an asleep sample started the lease, the host took the prop, and the
   row kept its grab mark, wedging every later claim as Held. Now a grabbed row sleeps into no lease and lapses in no silence; it
   ends by the holder's drop or impulse claim (which wakes the row for the dropper's fall samples), by the holder's departure, by the
   host's takeover of a lapsed row (which clears the mark), or by PROP_GRAB_MAX_MS 120 s, the safety against a release a seat never
   reported.
4. An owner that stopped streaming awake (its prop left tracking range, its game hung) held the prop for the session. Now an awake
   row lapses after PROP_SILENCE_MS 3 s without an accepted sample (the host simulates again; the toucher's next touch is a new
   grant), and the client's untrack sends one final asleep sample before parking a body it simulated.
5. A listener arriving while a seat simulated a prop never heard the owner and ran a second simulator until the lease lapsed. Now
   onSubscribe follows a non-actor reference's create word with PropOwner when the row is live (PartOne::PropLiveOwner, the rule's
   live_owner).
6. The refusal log's map was keyed by the unvalidated reference id and never pruned; it is keyed by the seat now. Two low notes: the
   C++ handler checks isfinite on every value (the legacy JSON path parses 1e999 as infinity; the Rust edge refused it already), and
   the asleep flag lives in the rule's row alone, not in the record, so after a restart every prop is asleep by construction and
   the host's default (ADR-058's "the record keeps the asleep flag" is corrected here).

The client also reads a resting body it simulates ten times a second instead of every frame (REST_READ_MS 100: sixty-four host-default
props at rest cost nine natives each per read), and the message module names PropService. T0: props.rs gains three cases (the silence
lapse, the grab through stillness and silence to its drop or limit, the step budget with its floor and a NaN), the bridge test covers
the new code and the live owner, PropTest a fourth case (a container refused, a claim from beyond reach, a sample across the cell
leaving the record, the late listener's word). Cargo tests (250 and 22) and clippy green locally, fork-lint and tsc green; the C++
compiles on CI (P3's push pipeline, whose difftest-build runs on the crate change).

## P3's first T2 (18:23 PDT 2026-10-29)

Red on the prop-physics session alone (numidium, 01:0xZ): the claim refused and the three relays absent, every other session
identical. The session had assumed the drop's id (0xff000004, the generator's next in an empty world) and the full run's earlier
sessions had allocated forms on the same server, so the claim named a reference that was not the dagger (E_PROP_UNKNOWN by the
header's own caveat; the refusal line itself was lost with the container). The fix is the harness's, not the rule's: a session
names a created form by its base, `"{{created:<baseId>}}"`, resolved by the fakeclient from the CreateActor it received and by the
harness per stack (docs/WIRE.md, Differential harness; fork m3-prop-physics 05184f99, P3 88e72156 with train 2's fixes merged). The
T2 runs again on 88e72156.

## The numbers the stage sizes (18:45 PDT 2026-10-29; every one UNMEASURED until x-prop-push and x-prop-pass)

| number | value | where | what sizes it |
| --- | --- | --- | --- |
| PROP_LEASE_MS | 3000 | wire-rules props; RETIRED at physics rung 1 (d463d367: A1 to A7, no timer) | how long a toucher keeps a sleeping prop before the host does; the hand-over's visible seam |
| PROP_SILENCE_MS | 3000 | wire-rules props; RETIRED at physics rung 1 (d463d367) | an awake row with no sample lapses; a creeping body (under 2 units per 100 ms) sends every 2 units, so its gaps bound it |
| PROP_GRAB_MAX_MS | 120000 | wire-rules props; RETIRED at physics rung 1 (D-PH3 A: no grab cap) | a grab nobody released; the longest a player holds an object in play |
| PROP_MAX_SPEED_UNITS_PER_S | 6000 | wire-rules props | the fastest a kicked or shouted body flies between accepted samples (E_PROP_STEP counts in the server log) |
| PROP_STEP_FLOOR_UNITS | 128 | wire-rules props | the first sample after a grant (the record's distance from the body); REPLACED on fork m4-scripts-2b-traps (ADR-068 D-S3's hardening) by a per-row distance allowance, a token bucket refilled at PROP_MAX_SPEED_UNITS_PER_S and capped at 600 units (UNMEASURED), owned by the prop and carried across grants, so over any window the record moves at most 600 + 6000 x seconds (a crafted 96 Hz stream cut from 122,880 to 60,416 units in 10 s); a body more than 600 units ahead of its record cannot catch up until it rests near the record again, which m4-prop-blast's 3000-unit first sample must reconcile (reconciled by rung 3a's PROP_FIRST_SAMPLE_UNITS below; the bucket's capacity is PROP_STEP_ALLOWANCE_UNITS) |
| PROP_FIRST_SAMPLE_UNITS | 3000 (PROP_MAX_SPEED x 0.5 s) | wire-rules props (physics rung 3a, d603ea09 and 92b032cd, on rung 2's clock from 020de9ab's number) | an epoch's first sample takes at most this much of the prop's clock time; any accepted sample leaves one step at most; 10,500 a second from a new row's grant; rung 2's 14,100 and 8,100 stand over any window. Half a second of flight, since a blast moves the prop before the word naming its mover arrives (playtest 41's cabbages; 0x1c0c6 at 1,353.7 units a second in 20261111-223256); x-prop-impact v1.1 reads the impact-to-first-sample time |
| kWorldBodyTether | 2048 (UNMEASURED: a fall's extent) | ActionListener (m4-scripts-2b-traps) | a trap body's sample farther than this from its game-file position is refused E_PROP_FAR (ADR-068 D-S3: a world body is claimed by impulse, touch 3, alone; the first firing wins, E_PROP_MOVING) |
| kPropTouchReach, kPropDropReach, kPropImpulseReach | 256, 512, 2048 | ActionListener; RETIRED at physics rung 1 (715e0b8b: the listener check, E_PROP_UNSEEN; the client's IMPULSE_WINDOW_MS of 81c8cb0f never reached canon, and rung 3's propImpulse event is the impulse's claim) | the claimant's distance to the record at a contact or grab, a drop, an impulse (E_PROP_REACH); the client sends touch IMPULSE for a prop that moves by itself within IMPULSE_WINDOW_MS 1500 of its own shout or cast release (propService, playtest 41; fork m4-prop-blast-client 81c8cb0f, in the chest bundle 8415e637) |
| SEND_MIN_MS, SAMPLE_UNITS, SAMPLE_DEGREES | 100, 2, 2 | PropService | the stream's cadence and dead band; the follower's glide reads as motion a sample behind |
| STIR_UNITS, SLEEP_AFTER_MS | 0.25, 500 | PropService; DELETED at physics rung 2 (3b141876: rest is readBodies' awake bit, the engine's deactivation) | the sleep stand-in (the platform exposes no Havok state); too short and a slowing body sleeps early, too long and the lease starts late |
| REST_READ_MS | 100 | PropService; DELETED at physics rung 2 (3b141876) | a resting simulated body's read cadence; the cost of sixty-four host-default props at rest |
| TRACK_RADIUS, TRACK_MAX, RESCAN_MS | 1024, 64, 500 | PropService | which props a seat tracks; the rescan's native count |
| GLIDE_MIN_MS, GLIDE_MAX_MS, JUMP_UNITS | 50, 300, 256 | PropService; the glide DELETED at physics rung 2 (the follower's segments, SEGMENT_MIN_MS 50), JUMP_UNITS kept | the follower's interpolation window and its snap threshold |
| PROP_MOVING_MS, STREAM_LIVE_MS | 1600, 1600 | wire-rules props, PropService | physics rung 1 (1458d977): the window in which no contact, drop or impulse takes another seat's awake stream, and the follower's live window, kept equal: about three heartbeat intervals and a frame; STREAM_LIVE_MS DELETED at rung 2 for the render clock's quiet (FOLLOW_QUIET_MS). UNMEASURED: E10 sizes them |
| STREAM_HEARTBEAT_MS | 500 | PropService | physics rung 1 (D-PH4 B): an awake or held body's sample at least this often, moved or not |
| PROP_STEP_ALLOWANCE_UNITS | 600 (PROP_MAX_SPEED x 0.1 s) | wire-rules props | the step budget's capacity for any sample after an epoch's first (63ead9b2's bucket), and since rung 3a the most any accepted sample leaves it |
| PROP_CLOCK_LAG_MS, PROP_CLOCK_SLACK_MS | 1000, 250 | wire-rules props | physics rung 2's one clock per prop (the generic cell rate algorithm): how far behind and ahead of the server's clock the step budget's own may run; the bound over any window, 14,100 units a second and 8,100 at one instant. UNMEASURED: x-prop-follow's loss leg, whose netem shapes only sky-srv's outgoing traffic |
| PROP_MAX_LIN_UNITS_PER_S, PROP_MAX_ANG_RAD_PER_S | 6000, 1000 | wire-validate | physics rung 2: a sample's lin (pinned to PROP_MAX_SPEED_UNITS_PER_S by wire-bridge) and ang in length; x-prop-follow's tumbling leg reads the largest ang. UNMEASURED |
| PROP_BONE_REACH_UNITS, PROP_QUAT_NORM_SLACK, cap::PROP_BONES | 512, 1%, 64 | wire-validate, wire-schema | physics rung 2: a body pose's distance from pos, its quaternion's slack, the poses one sample carries (a humanoid's 19 bodies, 20261111-194559). UNMEASURED |
| cap::PROP_CLAIM_REFRS | 16 | wire-schema | physics rung 2: the references one claim names (the cart's blast moved at most eight with every item Dynamic) |
| FOLLOW_DELAY_MS (propFollowDelayMs), FOLLOW_DELAY_MAX_MS | 300, 600 | PropService | physics rung 2: the follower's render delay behind the owner's clock, a client setting, and its most (the 8-sample buffer less the pair it renders). UNMEASURED |
| FOLLOW_QUIET_MS | 1000 | PropService | physics rung 2: two heartbeats past the newest awake sample on the render clock, the stream quiet and D73's rest (with the delay, a gap of 1,300 ms between arrivals by default) |
| SEND_BUDGET_BURST, SEND_BUDGET_PER_S, PRIORITY_SPEED_FLOOR | 128, 80, 100 | PropService | physics rung 2's priority accumulator: the mirror of the server's prop budget (128 at once, 96 a second) with margin, and the speed a still held body's heartbeat counts at. UNMEASURED |
| CONE_BATCH_MS | 100 | PropService | physics rung 3: a cone's impact events folded by cause before its one claim (the cone crosses the cart in about 70 ms). UNMEASURED: x-prop-impact's leg I2 |

## The candidate set (07:06 PDT 2026-10-30; the stage's read of x-prop-push 133010, x-prop-pass 133232, x-prop-drop 132737)

The union's first stage found the client half dead for every game-file item: zero PropService lines on any seat across ten prop
runs, nothing at the server. The cause (an agent's read, high confidence): RemoteServer.onCreateActorMessage returns early for
every reference below 0xff000000 that is no DOOR and no NPC_ (skipFormViewCreation: onceLoad, dealWithRef Keyframed, and no
FormModel and no FormView), while PropService.rescan built its candidates from the view's forms alone, so the set was empty by
construction; the model "the view's bound item references" (The client half) was wrong, and the server half streams them
correctly (LoadChunkIfNeeded admits items, Subscribe sends the CreateActor with the record's transform). The fix (fork
m3-prop-physics 6c1ba6a8, in the union at a4541cd0): PropService remembers every game-file item's CreateActor (refr, base, the
record's pose; a bounded map, no view, no model), the rescan adds those references when loaded and near, their record's pose is
imposed from the message where the model's movement would have been, and isItem caches nothing for a reference not loaded yet.
Two smaller holes stay noted: the record's pose for such a reference is the message's until a sample comes (recordSample keeps it
there too), and the engine's settle moves a tankard under SAMPLE_UNITS, so "placed at its record" does not print on the host; the
first visible line is "simulated here: Dynamic".

The switch: propPhysics is OFF unless the client setting says true (rule 3 and D68: the verb has no green T3 scenario yet), the
lab's probes turn it on through their relaunch files, and the default flips in the commit whose b-prop-push goes green. Premise
defects found beside the fault, fixed in the probes: the walkers' headings (set and settled before the key; the watcher out of
the lane), the drop through the InventoryMenu (DropItemService acts only while it is open; a console player.drop alone never
reaches it), and lab-api's server.ref, which is actor-typed, so a tankard's record is read through the seats' listings (pos) and
not server.ref until the gamemode's ref kind serves any reference.

### The drop at T3 (07:45 PDT 2026-10-30; x-prop-drop v3 143937 on the restage, a4541cd0)

Thirteen of fourteen claims held on the fixed client: the engine's own dropped reference deleted by DropItemService, the server's
copy placed and "simulated here: Dynamic" on the dropper's seat, its stream started and asleep twice as the sword settled, the
watcher applying it, one runtime SteelSword per seat, the two copies within 32 units in x and y (the pos fact). The one red was
the missing touch-2 claim, read first as the host rule's silence and then, with v4 (150222, c2 the non-host dropper: the copy
tracked on both seats, the sword at the dropper's feet on both screens, no claim, no stream, no apply), as the client never
sending a drop claim at all: PropService.onContainerChanged required the event's reference, which Skyrim Platform leaves
undefined when the engine's container event carries an empty handle, as a drop's does (EventHandler.cpp's conversion;
DropItemService's gate accepts the same event), so the drops list stayed empty and claimDrop never matched the copy. Fixed on
m3-prop-physics (2026-10-30; the union at b8a9d4c6): the guard without the reference, a trace per recorded drop and per new track (a
follower's new prop had no line: placed within two units, Keyframed from the start). The engine reuses the deleted drop's form
id for the copy's placeAtMe (HYPOTHESIS, harmless; settled 16:48 PST 2026-11-11 from the engine model docs/engine/havok-props.md
E38 and E39: the reuse is the sign of the engine's free under a pausing InventoryMenu, and under Skyrim Souls RE's running menu
the deleted drop is not freed while its dropper stays in the cell). x-prop-drop v4 reruns unchanged on the new client.

### The drop's stream at T3 (09:52 PDT 2026-10-30; x-prop-drop v4 162049 on b8a9d4c6, read by an agent)

With the record gate gone the non-host's drop claimed and was granted ("ff000001 claims prop ff000002 by touch 2: granted, epoch
1"), both seats took the word, and 3.6 s later the dropper's first sample met "E_PROP_NOT_OWNER: ... another seat simulates it".
The arithmetic: claim() sets since_ms and last_sample_ms at the grant, live() for an awake row is now < last_sample_ms +
PROP_SILENCE_MS (3000), and the client sends its first sample only once the body has moved 2 units from its baseline (a sleeping
copy at the dropper's feet never stirred for 3.6 s), so the row lapsed to the host before any sample and every sample after was
refused (the refusal reaches no client; the stream ended "out of reach"). v3 passed because the host's own first sample needs no
grant. Two faults, both the physics train's after the union's merge: (1) the seat a word names sends its first read at once as an
awake sample and starts its stream, so the asleep sample and the lease follow SLEEP_AFTER_MS later when nothing stirs (the
contract's own words: silence means a fault); the server alternative, counting an awake row's silence from max(last_sample_ms,
since_ms + PROP_LEASE_MS), stays a note. (2) The server places a drop's copy at the actor's own position (MpActor::DropItem's
PlaceAtMe) and the dropper's client wakes it Dynamic inside the player's capsule, which ejected it out of TRACK_RADIUS (c2 listed
no sword within 400 units afterwards; HYPOTHESIS on the ejection, the lines fit it): the copy goes a step ahead of the actor along
its heading. Follow-ups noted: a refused PropTransform should answer the sender with the current word, and the host's seat should
hear it simulates again at a lapse (today c1 kept the copy Keyframed, believing c2 owned it). The lab's prop site moves to
lab-spawn with a server-placed Basket01 (PlaceAtMe at the host's feet; the strip is flat, the cell 0xbbb1); Riverwood's exterior
has four MISC references in all (the camp's two tankards and pot in a rock pocket, the street bucket disabled in this world).

Built (09:54 PDT 2026-10-30, fork m3-prop-physics 604407b4 and after, the physics train off the union): (1) a prop whose word named this
seat (a granted touch, flip's wake) sends its first read at once and opens its stream ("stream <id> started at the grant"), so the
asleep sample and the server's lease follow SLEEP_AFTER_MS later when nothing stirs; the host-default simulation keeps the lazy
baseline (nothing out until a move), so a cell's clutter still makes no records. (2) MpActor::DropItem places the copy 64 units
ahead of the actor along its heading at its feet, never inside the capsule (DropItemTest's position follows). (3) The drop record
takes DropItemService's gate, the inventory menu open (940afd22). (4) propPhysics is on by default again in the train, which merges
only with b-prop-push green. The train's T3: the lab-spawn basket probes (push v9, pass v9, grab v7), then b-prop-push promoted.

## Slice three on paper (18:45 PDT 2026-10-29; ADR-058 decision 4 names it M4's build)

Two props the engine owns differently from clutter, written so the row kind "prop" covers them when the build comes:

- The held object (the engine's grab, the Z key; telekinesis). The engine surface is CommonLibSSE-NG's PlayerCharacter: StartGrabObject
  (PlayerCharacter.h:570, Offset::PlayerCharacter::StartGrabObject, Offsets.h:452, RELOCATION_ID 39475 and 40552), EndGrabObject (:553),
  GetGrabbedRef (:558), IsGrabbing (:565), the runtime data grabbedObject (:697), grabObjectWeight (:698), grabSpring (:696, the mouse
  springs) and grabType (:712, kNormal, kTelekinesis). Slice one already claims a grab (touch 1) from Skyrim Platform's grabRelease
  event and streams the held body as any simulated prop, and the rule holds a grabbed row against every other claim until its drop
  (props.rs). What slice three adds: the holder's heading as the held body's intent (the body hangs where the holder looks, so the
  follower may glide the body on the holder's figure instead of on samples alone, a prediction ADR-058 decision 3 forbids today and
  would relax for this one case), telekinesis's pull as an impulse touch, and a Frida read of StartGrabObject and EndGrabObject on both
  seats under a grab (HYPOTHESIS: grabRelease fires on the holder's seat alone and never for a puppet's engine grab, which no puppet
  performs).
- The body (a ragdoll at rest). A dead actor is a prop with many bodies; the stream's transform is the root's resting place, the one
  number every seat disagrees on today (playtest 34: bodies about 112 units apart; finding 71's silent kill and its fall). The row:
  the body's cell host simulates the ragdoll at death (its engine ran the kill) and sends one asleep PropTransform when the root rests
  (the 500 ms stir test on the root node); every other seat applies it as a SetPosition on the dead actor (no Keyframed set: a ragdoll
  takes none), once, within the snap threshold. HYPOTHESIS (the read before the build, x-body-pose's successor): that SetPosition on a
  settled ragdoll moves the whole body coherently on 1.6.1170, and that the second seat's own ragdoll, already at rest, re-settles
  within a stride rather than standing. Corpse dragging is the held object's case on a body (the engine's grab works on ragdolls).
  M4 by Eli's word (12:24 PDT 2026-10-30: "i think integrating the physics and bodies sooner rather than later will cause more problems than it will solve"); no earlier slice, whatever playtest 39 shows of the bodies' drift (ADR-058).
- D78 (23:28 PST 2026-11-01; Eli: "ok C for m3, B goes in M4 with dragging with a note that if it becomes too much of a bugbear it can get thrown into the backlog.") rewrites the body half above: the root-only SetPosition is retired (a dead ragdoll takes none,
  npc-fate's measurements; the death's Havok handoff is forced inside Actor::KillImpl for every ragdoll-bearing actor, so no
  death-animation route exists, npc-fate.md's Dynamic plan). The resting body is POSE REPLICATION: the host's settled ragdoll's bone
  transforms, sent once at rest and re-applied at a cell reload, keyframed on every other seat as the grab keyframes a ragdoll's
  root with the constraints following (HYPOTHESIS to trace before the build: a dead ragdoll on 1.6.1170 keyframes bone by bone).
  It shares its stream with corpse dragging and is built with it in M4; by Eli's clause it goes to the backlog if it becomes too
  much of a bugbear. M3's bodies row closes at "within a stride".
- The first acceptance case after the corpse slice (ADR-067 decisions 3 and 4 by ADR-065's path, m3-adr065-system1; Eli,
  2026-11-03, verbatim: "sure that saves where the body falls, but will prisoner see rotfern drag sven by his leg"): DRAG A CORPSE,
  THE WATCHER SEES IT PULLED. Today's slice is one-shot by construction on both ends: the owner stops sampling a dead body at its
  rest (sendInputsService's bodies map, atRest) until the engine's own dead flag clears, and the server refuses every later sample
  E_BODY_AT_REST until a later claim (MpActor.h's rest comment), so a drag moves the body on the dragger's engine alone and the
  watcher's copy never moves, not even at the drag's end. The case in two halves, the cheap one first: (a) the re-rest: the owner
  keeps watching an at-rest body and a move beyond kBodyRestUnits re-opens its settle (a new window, the record re-serialized and
  sent at the new rest), the server accepting the OWNER's re-open from at-rest (the mover's claim, ADR-063 decision 1) and the
  watcher re-applying the record, so the body jumps to where the drag left it; (b) the live pull: the grab claims the body as a prop
  (the toucher's rule), the dragger streams the record's Havok block (the ragdoll's bodies; run 210713 applied a record's pose
  cross-seat within 5 units) at a few Hz while held, the watcher applying each through ApplyChangeForm on its live-or-dead copy
  (the live apply read 2 gates), the release closing with (a)'s rest. Both share the stream with the held object above and are the
  physics-objects arm's first items after the slice (ADR-067 decision 7's third place); the stage's probe may add a drag leg as a
  reading only (the owner's grab on its own ragdoll, the watcher's copy unmoved, the E_BODY_AT_REST count), since the code already
  says what it will show.
- THE ARM'S TWO ACCEPTANCE CASES (Eli, 2026-11-03, verbatim via numidium: "yeah the 2 big tests of physics are can someone drag a
  body, and if i cast hailstone at a cart of cabbages from down the road, do they all fly the same directions for everyone"). The
  physics-objects arm (ADR-067 decision 7's third place) is done when both hold on two screens, each as its own scenario in its own
  commit, with claims per prop on both seats' positions against the server's record:
  1. A body dragged by one player is seen pulled on the other player's screen and lies at the same rest afterwards (the (a) and (b)
     halves above, b-corpse-drag): the dragger's seat is the body's owner for the drag (the toucher's rule), the other follows its
     stream, and the rest after the release is the record's.
  2. Any impulse on physics objects from a distance (Eli's correction, verbatim: "just an example of a spell that moves physics
     objects. shooting a bucket with an arrow, or using fireball both count."): a spell's explosion (Fireball, Hailstone) at a cart of
     cabbages or a pile, an arrow hitting a bucket, a shout, and the like: every prop flies the same way on both screens and comes to
     rest at the same place, each prop's owner the simulating seat with the others following its stream; the actor is far (the
     projectile's or the explosion's reach, not the contact's), so the claim is an impulse touch from the release or the hit. The
     scenario's legs: an arrow on a bucket, a Fireball at a pile, Hailstone optional (b-prop-impulse). Playtest 41's cabbage read
     below (E_PROP_REACH from the contact stand-in's 256 against the shout's 735 to 1400 units; E_PROP_STEP on the host against the
     record that never moved) is the red this case turns green.
- Not slice three's: traps' bodies (M4's dungeon work, with the MSTT admission ADR-058's note defers there), horses (mount.md).

## The physics stage's first reads (19:30 PDT 2026-10-30; m3-prop-physics 3586f2db on the merged base, LABAPI 4021)

x-prop-push v9 (021439) RED, 6 of 10, read against c1's console: "Create actor" and "PlaceAtMe done" at 02:17:33.8 (the basket at the
host's feet), a contact 200 ms later ("contact ff000947 layer 4 motion 2: not a tracked prop"): the host's own capsule ejecting the
awake, freshly spawned body, not the walk; the first track at +37 ms ("tracked, 26 units off": the distance to the player), the snap
back to the record ("placed at its record") into the capsule and the Dynamic set WITHOUT the wake flag ("simulated here: Dynamic"),
then nothing: no contact while the host stood in it, none from the run through its spot at 02:17:48 (the walk was clean, 243 units
south). HYPOTHESIS H-P1: a Dynamic body denied activation (setMotionType's allowActivate false) is inert to the character controller,
so a host's clutter could never be kicked; the comment's "rests until a contact wakes it" was the guess. Fix on the branch, local
until the read: 7a647687, allowActivate true whenever this seat simulates (the stream's lazy baseline keeps a resting cell silent).
x-prop-pass v9 (021831) a LAB FAULT (c2's relaunch lost its guest-agent pid), rerun queued. x-prop-grab v7 (022116) RED on 2 of 9: the
guest's grab worked end to end (the pitch sweep's hit at 800 counts, the claim, the grant 0.4 s into the 1.5 s hold, Dynamic, the
stream at the grant, asleep 0.5 s later), the host never applied and untracked the basket "out of reach" 1.6 s into the stream, and
after the release NEITHER seat listed the basket in the cell: it flew. HYPOTHESIS H-P2: the flip (stopTranslation, setMotionType
Dynamic) landing in the hand breaks the grab's spring and flings the body. Fix, local: a2256945, no motion set on a body this
seat's hand holds (grabRelease marks it; the engine's grab has it Dynamic), the stream unchanged. Both probes also showed the spawn
at the host's feet ejecting the body before its first track (push v9, grab v7 at 02:24:04.6). The reads before the head moves, on
this stage: x-prop-push v10 (49f0815b) and x-prop-grab v8 (7d0b64c6), the basket anchored on the mining floor marker 0x10e6cc
(relative (-423, -257, -175); ExecutePlaceAtMe takes any reference as its anchor), the host or grabber 80 north facing south, the
watcher 120 east facing west, the track lines awaited before the key; v8 reads the release's first second and claims the rest within
400 of the marker on both seats and no "out of reach" untrack. v10 red with its premise lines in place confirms H-P1; v8's flight
confirms H-P2; the fixed head then rebuilds and restages, and the four probes play again. Until that stage is proven, playtest 39
lays on clean-m1 (the merged base, props dark), since on this build a host's clutter cannot be kicked at all.

x-prop-drop v4 (022528, 19:33 PDT read) RED on one claim alone: the non-host's drop holds end to end on the physics stage (the record
gate clean, "drop of base 13989" and the engine copy deleted; "tracked, 0 units off", the claim by touch 2 granted at 02:30:56.998,
"stream ... started at the grant" at 57.491 and asleep at 58.019; the host's "applied ... from the stream" at 56.941; one runtime
SteelSword per seat, the copies within 12 x, 4 y and 20 z). The red: c2's distance to the sword 233 against 150, the sword having
rolled downhill from the camp's rise (z -288 to -309 against -144). The site, not the code: v5 by path (426cf923) on lab-spawn's flat
strip with every claim unchanged. push v10 and grab v8 re-shaped for probe-check's rule (a client log count is read at its log-count
step, never polled in an until): 861f51bf and 7689e959.

x-prop-pass v9's rerun (023534, 19:42 PDT read) RED on 3 of 15: the pass worked (the host's own epoch 1 at the spawn's ejection, its
stream and sleep, c2's apply; then c2's contact claimed, granted at epoch 2 at 02:37:57.331, Dynamic, the stream at the grant, the
host "theirs"), and 3 s after its grant c2 untracked the basket "out of reach"; both listings lost it. The same flight as grab v7's,
with no hand on the body, so H-P2 (the hand's spring) cannot be the whole cause. HYPOTHESIS H-P3: the grant's flip (stopTranslation,
setMotionType Dynamic with the wake) on a body that had followed the host's stream flings it; the follower's copy sits where the
stream's jump put it, and the Dynamic set may resolve a penetration (ground, capsule) violently, or resume the walker's push, or
hand the grab's stretched spring its force. The drop (v4) took the same flip at its grant without flight, on a copy the server
had just created at the drop point, never a follower. The read before the fix: x-prop-pass v10 by path (372f3a71), v9's frame with
the basket's position on both seats at 1, 2 and 4 s after the key (radius 1200, x, y, z recorded); grab v8's release read tells the
hand's case. The two local fixes (7a647687, a2256945) wait on these reads; one head move after them.

x-prop-grab v8 (024409, 19:52 PDT read) RED on 4 of 12: the grab held on the marker site (the sweep's third pitch, the claim by touch 1
granted, Dynamic, the stream at the grant at 02:47:36.113, asleep at 36.962; the host "theirs", Keyframed, applied at 36.011), then the
basket VANISHED on both seats within 20 ms (c2 at 37.479 "untracked: its reference is gone", c1 at 37.462 "out of reach"), half a
second after the grabber's asleep sample; no base-type-32 reference in the cell on either seat after. A simultaneous loss on the
owner's own seat is the server's doing (the view removes a reference the server unsubscribed or deleted), not physics. Two
candidates, HYPOTHESES: (a) the pickup delete, ProcessActivateNormal's "Deleting 0xff item" when a MISC 0xff reference is activated
(a held E may fire an activation at its press or release, the item then given to the activator and the reference deleted on every
seat); (b) an accepted asleep sample with a far position, OnPropTransform's SetPos(pos, Other) moving the record out of both seats'
subscriptions (pass v9's "out of reach" 3 s after the grant fits (b), with no E pressed). numidium greps the two runs' server logs
(the delete line, the activation, the inventory; E_PROP) and pass v10b (a0a6e14b, in v10's slot) reads server.ref(0xff000002) at 1,
2 and 4 s after the kick beside the seats' positions. drop v5 (024852) a lab fault at c2's files-lever relaunch (the guest agent lost
the pid, twice in eight c2 runs after a rollback; numidium's lab-api item), its rerun after push v11.

## D73: Dynamic at rest (19:56 PDT 2026-10-30)

grab v8's vanish is CONFIRMED as the pickup of a failed grab (numidium's grep): c2's "Sent activation for caster= 14 and target=
ff000002" at 02:47:37.346, the server's "Deleting 0xff item" at 38.003, the reference gone on both seats. The grab itself had closed
and released in one instant (touch 1 and touch 2 at 36.061): a Keyframed body cannot be held, so the grant and the flip came after
the hand had let go, and the E's release was an ordinary pickup. Together with pass v9 (a contact on a Keyframed body moves nothing
until the grant) and push v9 (a Dynamic body denied activation takes no contact), decision 3's "every follower Keyframed" gave the
first touch of anything no local physics. D73 (DECISIONS.md, under ADR-058): a body is Dynamic with leave to wake unless another
seat streams it awake right now; Keyframed from a stream's first awake sample to 150 ms after its asleep sample (or a second after
the last awake one); the grant's flip sets no motion on a body already Dynamic; the loss of the simulation sets none. Built on fork
m3-prop-physics c47a339f over 7a647687 (the wake); the held-hand guess a2256945 reverted. HYPOTHESIS until the restage's probes
(push v11 1e8203e4, pass v10b a0a6e14b, grab v8 7689e959, drop v5 426cf923): the resting copies settle alike, the glide holds, a grab
closes on the Dynamic body and its E consumes no pickup. The pickup of a real short press stays the engine's and the server's
(ProcessActivate's item branch).

pass v10b (025124, 20:00 PDT read): at 1 s after the kick the server's record of 0xff000002 sat unmoved at the premise's spot, the
host still listed the basket there, and the claimant (c2) listed nothing: the claimant's own engine loses its copy at the grant's
Dynamic set, the server and the stream innocent. Every flown copy had been placed by setPosition (the first track's "placed at its
record", the asleep sample's jump); the drop's copy, never placed, settled under the same Dynamic set. HYPOTHESIS H-P4: setPosition
leaves a Keyframed body's collision where it was and the Dynamic set resolves the mismatch violently. Fix 670ead48: the asleep sample,
a jump past JUMP_UNITS and the first placement all translateTo at a speed landing within 100 ms when the 3D is loaded (setPosition
only before), the rest-Dynamic set 300 ms after. The branch for the restage: 7a647687 (the wake), c47a339f (D73), 670ead48 (H-P4);
its probes push v11, pass v10c (02af9dc2: the record by `server: snapshot` steps, no pos claims, since the evaluator evaluates every
operand and a missing listing raises), grab v8, drop v5.

push v11 (025647, 20:01 PDT read; the old build 3586f2db, no wake fix) RED 5 of 10 at the stream claims, as expected, and it reads
H-P4 again from the host's side: the premise held on the marker site (both seats one copy at (133433.6, -61386.5), c1 "tracked, 80
units off", "placed at its record" (the setPosition snap) and "simulated here: Dynamic"); at the walk c1 logged "contact ff000002
layer 4 motion 2: owned, no claim" (02:59:54.610), so the Dynamic body set WITHOUT the wake flag did take the running walker's
contact (H-P1's inertness is therefore unconfirmed; push v9's silence was the body inside the standing host's capsule), and right
after the contact the host's own listing lost the basket while c2's kept it at the spot: the host's copy flew, no stream, no
E_PROP line. The same signature as v10b's claimant: a copy placed by setPosition and set Dynamic flies at its first contact. H-P4
reinforced; 670ead48 is the fix under test on the restage. The wake fix 7a647687 stays as the engine's own default for clutter
(allowActivate true), its H-P1 justification downgraded to a note.

drop v5's rerun (030029, 20:07 PDT read) RED on the distance claim alone, 157 against 150, and the number is not a roll: the sword's z on
both seats (14520.70 and 14518.55) sits about 150 units below the strip's ground at its own spot (the basket rested at 14670 there, the
player's feet at 14662), and v4's at the camp (z -288 to -309 against the camp's -144) was the same gap read as a hill. The 157 is the
3D distance down to it. The copy spawns at the dropper's feet z (MpActor::DropItem's SetPos keeps pos.z), half inside the terrain, and
falls through to the cell's floor on both seats alike, the stream faithful to the fall (the copies within 5 units). Player-visible: a
dropped item vanishes into the floor. The fix is the server's spawn lift (the copy at the feet plus a lift, falling onto the ground as
the engine's own drop does from the hand), a server commit on the physics branch after 4076's client build (server-only, the knob), with
DropItemTest's position following; drop v6 by path adds the floor claim (the sword's z above 14600 on both seats). The branch's three
client commits are pushed (670ead48, pipeline 4076 running).

## The fixed build's first read (20:33 PDT 2026-10-30; c080bbdb's server, 670ead48's client dist 14923, LABAPI 4021)

x-prop-push v11 (032724) RED 3 of 10 at the rest reads, and three fixes read true on it: "prop ff000002 placed at its record
(translated)" (H-P4's keyframed translate in place of the setPosition snap), "simulated here: Dynamic" with the settle stream started
and asleep (the wake), and at the walk "contact ff000002 layer 4 motion 2: owned, no claim" then "stream ff000002 started" (a kicked
body moves and streams), the follower applying it. Then the kick's stream reached no asleep sample and both seats untracked the
basket "out of reach" about 3 s after the kick, together: the host simulated it travelling far and the follower followed faithfully.
Two candidates: the marker's floor sits 175 units below the strip on a slope (a round basket kicked downhill rolls far), or a throw
(a contact impulse out of scale, or a small fast body tunnelling). pass v10c (running, the flat strip, the record snapshotted at 1,
2 and 4 s) separates them; push v12 by path (0a0e31ef) returns the push to the flat strip with the spawn's ejection as the host's
first contact (its settle asleep and the basket within 64 of the spot as the premise), the kick read with the record snapshotted
(b0, r1, r2, r4) and claimed as the second stream, the rest within 400 of the spot. Then grab v8 and drop v6.

pass v10c (033116, 20:37 PDT read) RED at its premise on the flat strip: the console's basket at the host's feet was claimed at once by the
host's own capsule contact ("contact ff000002 layer 4 motion 2: claimed", the grant at epoch 1), the first track's "placed at its
record (translated)" put it back into the capsule, and the Dynamic set threw it past 400 on both seats (the follower applied the stream
and untracked it out of reach 6 s later). With the wake the ejection from inside a capsule is a throw, and the slope question is moot:
push v11's travel on the marker had the same shape. Consequences. For the lab: a prop never spawns at a player's feet by the console
again; the probes make it appear by the verb's own path, the server's drop (64 ahead, 48 up, c080bbdb), which is also how a player
makes a prop appear: push v13 (e98f89ba) and pass v11 (by path) have the host drop a Basket01 from the inventory menu, its touch-2
claim, fall and sleep as the premise, then the kick. For the code, a follow-up, not tonight: the first track's placement translate
re-creates an overlap whenever the record sits inside a capsule (a login into a cell whose clutter rests where a player stands);
the placement could stand off, or wait, when the record lies within the player's radius.

grab v8 (033439, 20:40 PDT read; the fixed build) RED 4 of 12, the same shape as on the old build: the pitch sweep's hit, the claim's
touch 1 AND touch 2 logged in the same instant (03:38:03.958), the grant, Dynamic, the stream at the grant and asleep, the host
"theirs" and applied; then c2's "Sent activation for caster= 14 and target= ff000002" (05.259) and the server's "Deleting 0xff item"
(05.461): the held E's release picked the basket up. Under D73 c2's copy was Dynamic at the grab (no live stream, the marker spawn
untouched), so the instant release is not the Keyframed body's refusal: the engine's grab closes and lets go at once on this body
for a reason still unread (the motion type set to Dynamic (1) where the file's is SphereInertia (2), HYPOTHESIS; the hold-key's
press shape; the grab's own rules). Two items, neither tonight's: the grab's engine read (a Frida trace of the grab's start and
release on c2, PlayerCharacter's grab fields: PlayerCharacter.h:570 StartGrabObject, :553 EndGrabObject, :697 grabbedObject), and
the pickup after a failed grab (ActivationService could withhold an activation on a reference this seat tried to grab within the
last second and a half, since a long press is a grab in the engine's own grammar, not a pickup). For the physics train the grab
(touch 1) is a declared limit: a held E on a prop does not lift it on this build, and its release picks the item up; the kick,
the pass and the drop are the train's claims (b-prop-push promoted from push v13 on green).

drop v6 (033901, 20:45 PDT read; the lift build c080bbdb) RED 3 of 15, the floor claims alone: the sword rests at 14521.6 (c1) and
14514.1 (c2) against the strip's 14662, as v5's 14520.7 and 14518.6 did WITHOUT the lift. The lift moved nothing, so the copy is not
spawned inside the ground: it falls through the strip's collision on the dropper's seat (and through the camp's landscape in v4, the
same 150), the stream faithful, the sync green (the grant, two streams started and one asleep, the host's apply, one copy per seat
within 7.5 in z). The basket (a MISC) of the same world rests on the strip where it is placed (pass v10b's record at 14670; push v11's
marker basket at its floor), and push v13's premise drops a Basket01 by the same path: if it rests within 64 of the drop point, the
weapon's copy is the special case. REFUTED by x-prop-drop v6 GREEN 202154 (2026-10-31, below: the SteelSword's copy spawns ahead
and up, falls onto the strip and rests on both seats; settled 19:38 PST 2026-11-02 from the engine model docs/engine/havok-props.md E19): the
earlier reading was that a WEAP reference the view creates by PlaceAtMe and sets Keyframed (dealWithRef), then
Dynamic by this service, carries no working collision against the ground (the engine's own drop, DropObject, builds the weapon's
world physics; a weapon's L_WEAPON layer and shape may need it), where a MISC's clutter shape works under the same sequence; the
sinking was the spawn height (the drop fix of c080bbdb), not the collision. Reads
owed, not tonight: a Frida or console read of the placed sword's collision layer and motion on the dropper's seat after the Dynamic
set; and the design item, the server's copy ADOPTING the engine's own dropped reference (the record bound to the reference the
engine made, its physics the engine's) instead of a second reference the engine's is deleted for. Until then a dropped weapon is
the drop's declared limit (it falls through the ground on both seats; its record keeps it at the floor's depth and it can be picked
up there only by reaching it): the checklist says drop a basket or a tankard, not a weapon.

push v13 (034316, 20:51 PDT read; the fixed build) RED at its premise on the flat strip, and it settles two things. The drop's path works
for a MISC: "drop of base 12fe7 recorded", the engine's own drop deleted, the server's copy tracked at 0 units, the touch-2 grant,
Dynamic, the stream at the grant (15.349) and asleep (15.848): the basket fell its 48 units and settled, so drop v6's fall-through is
the WEAPON's own. Then, with the host standing still, one contact ("contact ff000002 layer 4 motion 2: owned, no claim" at 17.725; the
basket had rolled against the capsule) and the stream started again (17.825) and the basket was out of reach by 19.942: a standing
capsule's contact launched a resting body past 1200 units in two seconds, where the engine's own clutter takes a nudge. push v11's
travel on the marker was this launch, not the slope. The view's creation path, read for the stale-collision theory: SpawnProcess
places the copy with placeAtMe at the player initially DISABLED, setPosition's it to the record while disabled, then enables it, so the
3D and the Havok body are built at the final place (the theory does not cover the copy; it covered the first track's snap and the
asleep jump, which 670ead48 now translates). What remains unexplained is the launch itself: HYPOTHESES, (a) the character proxy's
penetration recovery on a light body made Dynamic by setMotionType(1, true) where the file's body is SphereInertia (the contact
reports motion 2, so the type is native; the mass or the inertia after the set is the question); (b) the wake flag's activation of a
body the proxy overlaps every frame; (c) something of ours moving the body at the contact (the host's own stream echoed back through
the record's movement: the view skips the movement block for a tracked prop, to re-check). The read, tomorrow's first lab item, by
Frida on the host seat (prop-contact.js extended): the body's linear velocity and motion type before and after each contact, and the
same for an engine-native basket the host walks into (the lab's clutter under no PropService), so the launch reads as ours or the
engine's. Decision (20:51 PDT, under the pass's rule): the physics train does not merge tonight; its four fixes stay on the branch with
their reads recorded; props stay dark on parity (D68); the lab goes to the guest-loot train (M3's exit) and then D69's; playtest 39
lays on clean-m1 with item 7 SKIPPED.

## Dynamic plan: the launch at a standing contact (written 21:49 PDT 2026-10-30, for the physics branch's restage)

- Frida script: lab/frida/prop-launch.js (main, beside prop-contact.js): the character proxy's ContactPointAddedCallback (79131) and
  the surface pass's impulse body (78304) as before, plus the owner body's embedded motion at each contact and before and after every
  push: type (+0x10), position (motionState +0x20, transform translation +0x30), linear velocity (+0xE0) and its length, angular speed
  (+0xF0), inverse mass (inertiaAndMassInv +0xD0, w); hkpEntity.h's motion at 0x150. Armed on the host at its relaunch.
- Probe: x-prop-launch v1 by path (sha1 3edfc17a, 63 steps): phase A, the engine's own basket (the game console's placeatme at the
  host's feet, no record), the host 80 north, a run through it, refs-near at 1, 2 and 4 s; phase B, the server's drop (64 ahead, 48
  up, settled under the touch-2 grant), the host 80 north, the same run, refs-near on both seats and the record's snapshots b0, r1,
  r2, r4. Premise claims only; every number is a read.
- What a reading names: the native basket's lines set the sane range (massInv about 0.3 to 1 for a basket, a nudge's speed under
  100, a few pushes). In phase B a launch reads as (a) a jump in vel at each push with a sane mass: the push's impulse on this body
  is out of scale (the proxy's recovery under an overlap, or the wake flag's activation inside the capsule); (b) a huge massInv: the
  mass after our setMotionType(Dynamic) is wrong (the body re-created without its shape's mass); (c) vel growing between pushes
  with few pushes: something of ours moves the body (the stream's echo through the record, the view's movement apply), which the
  server log and the "applied" lines would show on the host. The field offsets are HYPOTHESES until phase A reads sane.
- Owner: agent (Frida), on the physics branch's restage after the guest-loot and D69 trains; Eli (x64dbg) only if the trace
  contradicts itself.

### x-prop-launch v2's read (11:37 PDT 2026-10-31; run 20261031-181848 on m3-prop-physics 2c2e3437's build, red at step 18; an agent's read)

- The driver's place-ref worked: Basket01 0x12fe7 placed as 0xff0009c3 (the answer's 4278192579) at the host's feet, (133856.1,
  -61330.0, 14674.7). The trace's one row for it, 0.3 s later: `ContactPointAdded ... playerProxy:true, layer 4, motion 2, ref
  "0xff0009c3", body {type 2, massInv 0.2, pos [1912.5, -876.3, 209.7], vel [0, 0, 0]}`: a standing-capsule contact on a resting
  native Dynamic clutter body (layer 4 kClutter, CollisionLayers.h:11; motion 2 kSphereInertia, hkpMotion.h:30; 5 kg), the fault's
  exact shape. PropService's line at the same instant: "contact ff0009c3 layer 4 motion 2: not a tracked prop, no claim". Then no
  row for that body; 15 s later refs-near read `"32": {"inCell": 0, "near": 0, "refs": []}`: no MISC in cell 0xbbb1 at all.
- Not a deletion: the cleaner (worldCleanerService.ts) deletes Game.findRandomActor results at or above 0xff000000, actors only; no
  client line names ff0009c3 after the contact; the server never heard of it. Not the listing's blindness to temporaries: push v13
  and pass v11 listed a PlaceAtMe'd 0xff basket in the same cell (inCell 1, beyond the 400 radius).
- The geometry: lab-spawn's origin is world y -61130, the spot y -61330, exterior cells 4096 units a side, so cell 0xbbb1's southern
  edge is y -61440, 110 units south of the spot, across the strip the host runs along; refs-near lists one cell (SKSE
  Cell.GetNumRefs). So the basket left the cell under that contact (a launch, or an ejection larger than the premised few dozen
  units); the size is unmeasured because the trace has no row for the body after the contact and its two "impulse body" rows read
  motion 32 from args[1] (not a MotionType: that argument of 78304 is not the pushed body; RAW was off).
- v3 (3c0da75f): the basket placed 60 units south of the host (outside the capsule: the run is its first contact), every refs-near
  with ids: [0x12fe7] (Game.FindClosestReferenceOfType over the loaded cells, bisected to 10 units) at radius 1200 and the host's y
  recorded beside each read (the displacement follows), the tracer's RAW on for 78304's raw arguments. HYPOTHESIS until v3: the
  contact's push carried the basket more than 110 units (the fault) rather than the engine's own spawn ejection.

### 78304's arguments (the re-analyst's Ghidra read, 11:46 PDT 2026-10-31; the tracer's impulse hook corrected on main)

- CONFIRMED-BY-DECOMPILE: 78304 (0xea1600) is the body of bhkCharProxyController's ObjectInteractionCallback with `this` adjusted
  to the bhkCharacterController subobject: its one call site is the thunk 79133 (0xed1620: `mov rdx, r8; add rcx, 0x10; mov r8, r9;
  jmp`), slot 5 of the listener vtable 240558 whose slot 2 is 79131 (the tracer's ContactPointAdded). So rcx is the controller (its
  fields match bhkCharacterController.h: orientationCtrl +0x190, flags +0x218 with kNoFriction, bumpedForce +0x2B8, bumpedBody
  +0x2C0), rdx the hkpCharacterObjectInteractionEvent (hkpCharacterProxyListener.h: position 0x00, normal 0x10, objectImpulse 0x20 a
  float, timestep 0x24, projectedVelocity 0x28, objectMassInv 0x2C, body 0x30), r8 the hkpCharacterObjectInteractionResult
  (objectImpulse vector 0x00, impulsePosition 0x10). The tracer read rdx as the body: its "motion 32" was event+0x160, stack past the
  0x40-byte struct. Fixed: the body at rdx+0x30, the event's numbers and the result vector before and after logged.
- CONFIRMED-BY-DECOMPILE: the function scales result.objectImpulse and writes nothing on the body: zero unless 0 < mass < 95 (the
  .data float 389158 = 95.0, its one writer a copy of an .rdata 95.0; HYPOTHESIS that nothing writes it indirectly), factor 2.0, the
  props' layer 10 3.0 when mass <= 47.5 else 0.1, layers 6 and 14 0.1, shrunk so impulse/mass <= 1000; records bumpedForce and
  bumpedBody when the scaled magnitude grows; under kNoFriction the orientation controller may rewrite the vector (HYPOTHESIS, the
  interface header is absent in the pin). The push lands after it returns, in the surface pass 62648 (0xb83580): activate 60849
  (HYPOTHESIS), then the motion's ApplyPointImpulse(&result.objectImpulse, &result.impulsePosition) (hkpMotion.h:60), or a deferred
  buffer when 62648's fourth argument is non-null. 62654 dispatches the listeners per manifold point, skipping motion types 4 and 5
  (Keyframed, Fixed), clamping by the proxy's characterStrength times dt and adding the characterMass term.
- What this means for the launch: the tracer's "a velocity jump per push" appears in the NEXT 78304 call's `before`, never the same
  call's `after`; a body's leap at one standing contact would read as result.objectImpulse scaled far beyond the event's objectImpulse
  (the factor path), or as a sane result with the body's velocity leaping anyway (then the push is not this path: the stream's echo,
  the view's apply, or our Dynamic set's mass). v3's RAW rows carry the raw pointers for anything the shape above gets wrong.

### x-prop-launch v3's read: the launch is the engine's push plus the summit; the drop's copy spawned in the capsule (12:34 PDT 2026-10-31; run 20261031-190643, an agent's read of the fixed tracer; the fix m3-prop-physics b770e745)

- CONFIRMED by the trace (one row each, every field sane): the native Basket01 (0xff000884, placed 60 south of the host) took ONE push at
  the host's run-through: `event {objectImpulse -17.748, dt 0.02217, projectedVelocity 4.290, massInv 0.2175}; result |17.7| before,
  |35.5| after` (the clutter layer's factor 2); the body's velocity went from 0 to |6.8| m/s (476 units a second), which is the result
  times the inverse mass (0.2, a 5 kg basket; predicted |7.1|, z eaten by the ground). The next row's impulse is 0 (the body already
  leaving faster than the capsule). After it, no contact and no push: refs-near read it rolling down lab-spawn's west flank at 243 to
  267 units a second (z dropping 411 over 1,120 horizontal, the heading bending west), until out of the 1,200 search. So D73's "launch"
  item is the engine's own kick (7 m/s for a 5 kg body from a run) and the summit's slope; nothing of ours moves the body. A run-through
  kick needs a few hundred units to stop even on the flat; lab-spawn's strip is 110 units from the cell's edge and 450 long.
- CONFIRMED, the defect: the server's dropped copy (0xff000002) spawned at the dropper's own position (c1's "prop ff000002 tracked, 0
  units off", c2's "170 units off" = c2's distance to c1), although MpActor::DropItem set it 64 ahead and 48 up (c080bbdb): PlaceAtMe
  created it at the actor and the create word carried that position; the move after never reached the dropper's copy (no message, the
  DropItemTest's two messages). Its body stood inside the capsule through the paused InventoryMenu; at the first Havok step after the
  close it took one push (`objectImpulse -23.361 at projectedVelocity 0.094`, |46.7| after the factor; the body to |8.5| m/s = 595
  units a second: a penetration term, HYPOTHESIS, computed upstream of 78304) and left for 991 units. Fixed at b770e745: PlaceAtMe's
  core is PapyrusObjectReference::PlaceAt(anchor, form, where), the one creation path for a server-placed form, and DropItem creates the
  copy through it at the drop point; DropItemTest reads the create word's position.
- CONFIRMED, the second defect: the copy read "stream ff000002 asleep" 500 ms into the dropper's open InventoryMenu (a paused world stirs
  nothing), so the server leased a body that had never settled. Fixed at b770e745: the client holds a streaming prop's stir clock while
  Utility.isInMenuMode().
- The probes' premise changes from here: the basket appears by the drop (the copy at the drop point, falling onto the strip), the
  toucher WALKS into it (the walk toggle, Caps Lock, DIK 58; a walk's push is a fraction of a run's and the basket stops within the
  strip), the kick is read as a nudge of tens of units with the copies within 32, and no claim expects a kicked basket to stop within
  400 of a run's contact. x-prop-launch's purpose is served; it stays by path as the record (v3 3c0da75f).

### The fixed build's first probes (13:48 PDT 2026-10-31; b552b416 on b770e745's dist, numidium's reads of 2014xx to 2040xx, each red twice)

- x-prop-drop v6 GREEN (202154): the SteelSword's copy spawns ahead and up, falls onto the strip, the dropper streams the fall and
  sleeps, the watcher applies, one runtime sword per seat within 32 of each other on the strip. The drop fix holds.
- x-prop-push v14 and x-prop-pass v12 RED on the premise after the drop: the claim granted, tracked and Dynamic on the host, the
  watcher tracking, but no "stream asleep" and the Basket01 in neither seat's 400-unit listing: the copy landed clear of the capsule
  as meant and then ROLLED off the strip (a round body on a ridge), so its stream never slept. x-prop-grab v8 RED after the grab: c2's
  claim by touch 1, its stream started and asleep, c1's follow applied, then c1's "untracked: out of reach" and the basket near
  neither seat: the released basket rolled down the marker's slope. Nothing in the verb's path moved the body in either case.
- The prop for the lab is now an IronIngot (0x5ace4, MISC with Havok, a box that slides and stops): push v15, pass v13, grab v9 with
  the same steps and bounds; the basket is the playtest's prop at Riverwood's camp. CONFIRMED by x-prop-push v16 GREEN
  20261101-014442 and b-prop-push GREEN 20261101-032302 (the walker's nudge moved the ingot's record more than 16 units and both
  seats' copies rested within 32 of each other; settled 19:38 PST 2026-11-02 from the engine model docs/engine/havok-props.md E9): the capsule's
  contact reaches a small box on the floor as it does a basket.

### The basket runs read in full, and the grab's real cause (13:56 PDT 2026-10-31; numidium's read agent on 201426, 201809, 202618; the fix m3-prop-physics 222a7471)

- Push and pass: the roll CONFIRMED (c1's "stream started at the grant", then "untracked: out of reach" 8.1 s later with no asleep line;
  the settle 1,050 units west and 200 south of the drop, 22 units past the cell's edge; the strip itself slopes west, the drop's sword
  slid 39 units). Two lab facts: refs_near lists the seat's own cell only (lab/driver/src/index.ts), so a prop past the cell's edge
  leaves the listing while still in range; an untracked prop's last sample goes out asleep without the "asleep" line (propService.ts).
- Grab: NOT a roll, a pickup. c2's E at 20:29:40.0; its claim by touch 1 and 2 at 40.2; "asleep" at 40.8; then at 41.5 c2's game sent
  an ACTIVATION of the basket and took it into the inventory (addItemEx 12fe7, "its reference is gone"), the server deleted the 0xff
  copy at 42.1, and c1's follow read the deletion as "out of reach" (the label covers a deleted record). The body was still
  KEYFRAMED when E was pressed: tick() returned before D73's resting-to-Dynamic branch whenever no sample was pending and the touch
  fallback was off (wantsRef), so no seat logged "at rest: Dynamic" in any of the four runs; a Keyframed body cannot be grabbed and the
  E's release picks it up (the Havok prop facts of 2026-10-30). Fixed at 222a7471: the tick wants the reference when the rest or the quiet
  is due, and the existing branch runs. HYPOTHESIS until grab v9: the resting ingot reads Dynamic on c2 ("at rest: Dynamic (the stream
  ended)") within a second of the asleep sample, and E then grabs.

### The restart leg's cause and D75 (16:43 PDT 2026-10-31; x-prop-push v15 220439 and 221908 on 222a7471; the fix m3-prop-physics e3d17dd7)

- Pass v13 (220942) and grab v9 (221404) GREEN on 222a7471: the Keyframed-rest fix holds (the grab grabs). Push v15 RED at the restart
  leg alone, twice: the push and both streams held; after the restart neither seat listed the ingot and c1's console shows no create word
  for it in the new session (the old session's copy tracked at the first word, gone 0.3 s later at the view's reset).
- The cause, in the server log at the restart: "Skipping FF item 2 (type is MISC), will likely overwrite at some point":
  PartOne::AttachSaveStorage skips every 0xff reference whose base is an item (libespm IsItem) when it loads the save (the record counted
  among the "3 ChangeForms" is loaded after that skip). Beside it, MpActor::DropItem deletes a dropped copy two minutes after the drop and
  trims the dropper's queue at ten (the runs were shorter than two minutes; a playtest is not). Upstream's clutter policies, against
  decision 2's record that keeps a prop's rest. A T0 through WorldState::LoadChangeForm alone (5fae7d62, green) never met the skip; the
  case now goes through a file save storage and AttachSaveStorage itself.
- D75 (DECISIONS.md, under ADR-058): dropped items persist as props by default; the three policies hold only under the server setting
  propsPersist false (WorldState::propsPersist, PartOne::SetPropsPersist, read in ScampServer). DropItemTest: persisted, the copy loads
  at its drop point and the user's login hears its create word; not persisted, the item is skipped as upstream did. Restart behavior
  (the Server section): the record's rest comes back on both screens at the load; CONFIRMED by push v16 (20261101-014442 on b763e3ac,
  GREEN with the restart leg): at the reconnect c1 heard five create words (the ingot's among them), untracked the old session's
  copy at the view's reset, then "prop ff000002 tracked, 51 units off" and "simulated here: Dynamic" a second later; the server's
  load took 4 ChangeForms with no "Skipping FF item" line; both seats listed the ingot where it rested.
- The six "Specified Form is ObjectReference, but we tried to treat it as Actor" warnings in the push runs were the lab's own reads
  (labState ref's actor fields on a prop, six server.ref reads in the probe), fixed in lab/gamemode (thuum main 1ec2fabc), not a client
  bug.

### Playtest 41's cabbages (2026-11-02 evening PST; Eli: "just blast a bunch of cabbages. that should be a good prop test. only some stayed synced")

Two refusals in the server log, two causes. (1) E_PROP_REACH: the blown cabbages moved in c1's game and the contact stand-in claimed
them by touch 0 from 735 to 1400 units (the shout's reach), the contact's 256 refusing every one; the IMPULSE touch (3, reach 2048)
was in the contract and on the server with no sender. Fix, client: ShoutService and MagicSyncService note this seat's own release
(PropService.noteImpulse) and the two self-moved claim sites send touch 3 inside a 1.5 s window, touch 0 otherwise (fork
m4-prop-blast-client 81c8cb0f, cherry-picked into m4-turbo2-chest 8415e637). (2) E_PROP_STEP on the host (ff000001, 1c0c2, 1c0c6,
1c0c7): a prop with no live row had the floor (128 units) as its budget; a blasted cabbage's first sample moved farther, TooFast
returned before the row was written, and every later sample was measured against the never-moving record, so the host lost the prop
for good. Fix, rule: PROP_FIRST_SAMPLE_UNITS (3000, half a second at the top speed) is the budget of a sample with no live row, the
row is written at the first accepted sample and the elapsed budget takes over (fork m4-prop-blast 020de9ab, in the server train
m4-turbo2-union-srv a780f1e0; wire-rules test a_hosts_first_sample_of_a_blasted_prop_passes_and_writes_the_row). Rule 5 note: the
touch kind is the client's word, bounded by the reach alone; a later tightening admits touch 3 only after a cast or shout the server
accepted from the claimant within 2 s. Probe after the arm: x-prop-blast (c1 shouts Unrelenting Force at a cabbage cluster the host
c2 simulates; claims: the touch-3 grants in the server log, no E_PROP_REACH or E_PROP_STEP, every cabbage's server position within the
snap threshold of c1's and c2's reads 5 s after the blast).

The drop's deleted copy (18:30 PST 2026-11-05 (02:30Z 11-06), thuum-cf, from a read-only agent's read of the three reds).
b-prop-push went red three of three in canon's merge gate of fork m4-scripts-2c-traps 0f2f3c55 (run set 20261106-003311: 011237,
011509, 020736) on step 27 alone, the check right after the drop: c1.refs_near().runtime_of(0x5ace4) == 1 read 2. The second entry
is c1's own engine-made drop reference, which DropItemService logged as "Found and deleted reference" (0xff00093c, 0xff0008f5,
0xff0008fe), listed deleted at the spot the engine spawned it, 128 units over the strip; the live copy carries a fresh id and sits
on the ground; c1 got one create word for the drop and no destroy. In all five greens the engine freed the dropped reference
within about 100 ms and formView.ts:340's placeAtMe reused its id; in the reds it is never freed, so the copy takes a new id, and
runtime_of counts every listed 0xff reference of the base, deleted or not (lab/labapi/labapi/assertions.py:639-655). What
separates the reds from the greens: Skyrim Souls RE v3.2.0 with bInventoryMenu true (the menu does not pause the game) is loaded
on both seats in all three reds and in none of the five greens or the 68 earlier prop runs; it joined the standing layer at thuum
main 32459beb (2026-11-03 17:20 PST), about three hours after the last green; this scenario drops from inside the InventoryMenu.
Neither the trap slice's code nor canon's rungs touch the drop path (propService.ts byte-identical from c1600f98 to 9745d401;
dropItemService.ts unchanged; D-S3's additions refuse runtime ids and inventory bases). HYPOTHESIS: with the menu unpaused the
deleted drop stays flagged and unfreed (CommonLib's InGameFormFlag::kWantsDelete, TESForm.h:111); unread whether c1 shows it (a
deleted reference is not drawn, by the engine's usual rule; the reds stop before a screenshot). The read: one b-prop-push run with
c1's SkyrimSoulsRE.ini bInventoryMenu=false through the relaunch files lever: one listed entry carrying the deleted id means Souls
RE; the deleted entry still listed clears it and points at the seam's judging of Delete (NativeRows.inc:25). Pending in
lab/gate.yaml meanwhile; the claim itself unchanged (a runtime_of that skips deleted references would be a claim rewrite, Eli's).

### A moved prop's place is its body's, not its reference's (16:48 PST 2026-11-11 (00:48Z 11-12), thuum-fa, from a read-only analyst's read of x-prop-blast v3 20261111-223256 on canon 24f1cc6a; ADR-071 rung 0)

x-prop-blast v3's traces (lab/frida/prop-impulse.js v1.1 on both seats, whole) print each watched body's Havok position beside
the listings' reference position, and on c1 the two parted after canon's put-back at the track radius. When c1's player came
within TRACK_RADIUS 1024 of the cart (fork 24f1cc6a propService.ts:34), PropService tracked the cabbages, put each one more than
2 units or 2 degrees from its record back at the record by translateTo, and set it Dynamic (placeAtRecord :621-660, SAMPLE_UNITS
and SAMPLE_DEGREES :48-49, restMotion :725-734). Two cabbages already lay elsewhere at rest, and for them the translate moved the
reference and left the body:
- 0x1c0c7, placed at its record at 22:37:41.531Z (c1-console.log:3874), listed at the record from step 89 to the run's end while
  its body lay at rest on the road 940 units away (c1's prop-impulse trace, its final body row, row 650);
- 0x1c0c9, placed at 22:38:29.169Z (:4634), listed at the record at step 152 while its body stayed 263 units east of the cart,
  drawn on the boardwalk there in screenshot 157-c1, where the shout then woke it (row 485).

So an owned prop's position comes from its body, never its reference: the owner's samples, ADR-071 decision 4's "tracks what it
owns at any distance" and every check of a moved prop read the body. CONFIRMED as an observation by 20261111-223256 on c1
(docs/engine/havok-props.md E21). The mechanism, a translate moves the reference and the reference follows a body only while the
body moves, so a Dynamic body moved by translate alone stays behind, is HYPOTHESIS, as is the remedy for a placement that must
move a Dynamic body (keyframe it first). The fix is rung 2's body reader, the platform's ReadBodies native (the plan's rung 2,
docs/research/physics-leg-2026-11-11.md:128). For the lab: refs-near prints the reference's position, the one canon's service
reads, so a claim on a moved prop's place reads it too; 0x1c0c7's listing agreed with c2's copy and the record while c1 drew the
cabbage 940 units away.
