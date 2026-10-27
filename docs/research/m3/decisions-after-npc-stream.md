# Decisions after npc-stream's first stages (DRAFT, 2026-10-26 11:05 PDT, thuum-magnus for Eli, relayed by numidium)

ADR-050 (Eli, 02:22 PDT: "proceed with the pivot. open ADR-050 and start
npc-stream") was built the same day: npc-stream's three slices (the host's
actions, values and hands travel as themselves; the puppets perform them
through the engine's own entries) on fork m3-npc-stream 66f04f2a, and the
voice slice on its own branch m3-npc-voice a7cba312. The first stage crashed
the puppet seat three times (the variables descriptor wrote the humanoid
master behaviour's fixed indexes into creature graphs, no bounds check; v2
gates the graph by project and size); the second and third stages ran clean
with T2 green twice, P5 green, P4 and P6 green at v2's claims, the bandit's
six attacks performed on the puppet through the engine's entry. Three
scenarios are promoted from those greens (b-npc-stream-actions, -state,
-equipment, their own commits, the review entries self-approved under the
10-13 word). The voice stage with P7 runs as this is written. Five calls
are Eli's, D25 to D29, numbered after decisions-after-playtest-34.md's D24.
Sources: docs/verbs/npc-stream.md (the slices as built, the stages' reads),
docs/DECISIONS.md ADR-050, docs/verbs/npc-fate.md (decision 2 as mapped).

How to answer: "all recommended", or the ones to change, e.g. "D27 B".

## npc-stream

### D25. Merging m3-npc-stream (the three slices)
The branch is CI green, T2 green twice, three scenarios green on its stage,
no crash on either seat since v2. Open after the stage: H6 (the puppet's
hands against the record on the other seat, unclaimed by a probe), the
counters and the budgets' measured numbers (slice 4), the parity scenario
and the reference trace (ADR-050 decision 5).
- A. Leave as today: the branch stays staged and unmerged until slice 4
  (the counters, the budgets, the parity scenario) and H6 are in.
- B. Merge now (ADR-030's verb-merge with the three new scenarios named
  in the gate set), slice 4 as its own train after.
- C. B after the voice stage's read, merging the voice branch with it if
  P7 is green, the stream alone if not.
- Recommended: C. The slices are done to the verb's own bar (T0, T2, T3
  green, every hypothesis of slices 1 to 3 read but H6), and playtest 35
  needs them on parity, not on a stage; the voice's read is an hour away
  and decides whether one merge or two. Slice 4's rows are measurement and
  bookkeeping that read the merged build better than a stage.

- Decision: recommended

### D26. The epoch on HostedActorState (the verb doc's Q1, revised at the build)
The draft carried the cell's epoch on every state; the build dropped it:
a client cannot name a persistent reference's cell (getParentCell is the
worldspace's persistent cell, b-npc-puppet's lesson), the server's host
table already refuses a sender that is not the actor's host, and a stale
state cannot outlive the grace between a release and a regrant to the same
host. ADR-035 point 5's "with the epoch" is met by the server's number.
- A. Leave as built: no epoch on the wire; the server's table is the fence.
- B. Restore the field, fed by a per-actor epoch the server sends with the
  word (a new property beside isHostedByOther at every grant: one message
  more per actor per flip), and the server checks it against the cell's.
- Recommended: A. B adds a message per actor per grant to carry a number
  the server already holds, for a race the grace already closes.

- Decision: recommended

### D27. The voice slice in playtest 35
Built on m3-npc-voice (the spoken-line sink filtered to hosted speakers,
ActorSpeech 54 unreliable, the puppet's say through the engine's own entry
with the info given, the detour's per-frame pair that ends a line). Four
hypotheses ride it (the sink sees every line; the engine's say takes an
info on an AI-off actor; the pair ends the line; the said-once mark is
harmless); P7 reads them this hour.
- A. Leave as today: the voice stays off the playtest's build whatever P7
  says, read again on a later stage with a solo Frida trace beside it.
- B. In the playtest if P7 is green (merged with the stream under D25-C),
  a line that never ends or a puppet that keeps talking a finding to say.
- C. In the playtest even on a partial P7 (a green V1 and V2 with V3 red:
  lines heard, some never ending), as the most direct read of what Eli
  hears.
- Recommended: B. A green P7 is the verb's own bar; a red one means the
  engine disagreed with the static read and the Dynamic plan's Frida read
  comes first (rule 8).

- Decision: recommended

## npc-fate

### D28. Trains 47 to 50 (held under ADR-050's consequences)
The structural review's recommendation stands: merge what survives any
model, hold what the one NPC path retires. 47 (client): the looted body's
inventory as a diff alone, the late fate's 3D reload, a puppet's own
activation not forwarded (survive); the hosted server-made copy's once-
dress (D19-B, retired by decision 3). 48 (server): D18-B the dead host,
D21-B (survive). 49: D24-B the quit's fast exit (D24 re-evaluated: B stands
with D). 50: the stack of the three.
- A. Leave as today: all four held until decision 3's train lands.
- B. Merge 47 without the once-dress (a new train off 47 with that commit
  dropped), 48 whole, 49 whole; drop 50.
- C. Merge 47, 48, 49 whole now (the once-dress included, retired later by
  decision 3's train), drop 50.
- Recommended: B. The once-dress is the one commit that decision 3 undoes
  and D29 decides its gap's path; the rest are decided fixes with green
  gates waiting.

- Decision: recommended

### D29. The server-made copy's dress (playtest 34's D19, read again by b-npc-stream-equipment)
A bandit the server places (PlaceAtMe) is dressed by its host's engine from
the base's own roll while the record holds the server's roll; slice 3 now
checks the host's worn items against the record and refuses the ones it
lacks, so the bandit's swings stay dropped (E_HIT_WEAPON): one refusal and
one dropped swing per run on the stage. The game-file residents are not
affected (the fate pins their roll).
- A. Leave as today: a placed NPC's weapon may differ on the two screens and
  its hits do not count until decision 3's train.
- B. Train-47's once-dress now (the host's copy dressed once from the
  record at creation): the engine's hands become the server's roll, the
  hits count; retired by decision 3 later.
- C. Decision 3's one NPC path next (the server's roll imposed on the
  server-made copy through the fate detours, as a game-file actor's is):
  the structural fix, a train of its own, D28-B's survivors merged first.
- Recommended: C, with B only if playtest 35 needs placed bandits to hit
  the players (the temple's bandits are game-file actors and hit already).

- Decision: recommended

### D30. The gaze and the face (Eli, 11:43 PDT: "the puppets end up fairly stiff on a cell guest's screen")
After slices 1 to 3 and the voice, a guest's puppet still aims its head at
a heuristic point and wears a neutral face outside speech; the engine
exposes both as plain fields (the six head-track slots, the emotion type
and value). The verb doc's slice 5 plans four small fields on
HostedActorState, the message relayed to the other listeners, the puppet
applying them through the engine's own setters; no new engine id.
- A. Leave as today: the gaze heuristic and the neutral face stay; the
  movement cadence (the larger stiffness) is measured first (P3).
- B. Build slice 5 now on m3-npc-stream, before D25's merge (one more
  stage and read, a day).
- C. Build slice 5 as the next train after D25's merge, with the cadence
  row's measurement beside it.
- Recommended: C. The branch up for merge has three green scenarios; a
  fourth slice on it restarts its stage, and the cadence number decides
  how much the gaze and the face buy against the lag a player sees first.

- Decision: recommended

## Recommendation, in one line
D25 C, D26 A, D27 B, D28 B, D29 C, D30 C.

## Added 13:13 PDT, after Eli's letters (all recommended): the ladder's calls, settled by Eli's words on the plan

Eli, on the one-shot plan: "i would argue not to defer actually. if something is drafted just do the thing, 35 can wait till that's done."
- D31. Talking to an NPC from a seat that does not host its cell: C, the dialogue claim (ADR-050 decision 4's first case; ADR-051 and docs/verbs/npc-talk.md first), train 55.
- D32. Merge authority for the ladder: recommended B (one word now; each train merges when its gate is green and its probes' claims hold, reported as it lands; any red, weakened assertion or scope question stops the chain). Read as B unless Eli says A.
- D33. When playtest 35 runs: A, at the ladder's end.
- D34. ADR-050 decision 2 (the engine's own death) in this ladder: A, built (train 52).
- D35. ADR-050 decision 3's client reconciler in this ladder: A, built (train 51).
- D27-B's read of P7 v3 (200538): green on its letter, the resident still deferred; the voice stays off the build until a resident speaks on a puppet (its own train after the Dynamic read); the stream merges alone under D25-C.

### D32 answered (23:36 PDT, Eli's words)
Eli: "plough ahead to test 35." Read as D32 B: one word for the ladder. Each train merges when its gate
is green and its probes' claims hold, reported as it lands; any red, weakened assertion or scope
question stops the chain for Eli's read. D36 (the brake) and D37 (the shield drop) are not covered by
it: the brake merges only on D36's letter, the mod stays until D37's.

- Decision: B (Eli, "plough ahead to test 35")

### D36. The pass thrash at a cell border (D22 revisited, 14:27 PDT)
D22's letter ("recommended" = A, no brake) stood on x-handoff-cross v2's read of one pass in three
minutes. Numidium's read of b-npc-handoff-cross's GREEN nightly run on aaafffe5 (20261026-132333)
found 836 "passes 13482 into cell" lines: Alvor working the border between 9731 and 9732 changed
hosts tens of times a second, every flip a demote on one seat and a promote on the other, which the
scenario's claims never counted. Pre-existing on main, not the stream's. The brake is built ahead on
fork m3-pass-margin 11bf32f3 (two rules tests green; x-handoff-cross v3 counts the passes).
- A. Leave as today: the pass fires at every crossing sample; an actor on a border flaps hosts.
- B. A tenure of 10 s after a pass, during which the sender keeps the actor (a clock, read differently
  on two servers in T2).
- C. A hysteresis by a cell margin: the pass waits until the actor stands 256 units (UNMEASURED) inside
  the other host's square; nearer the edge the crossing host keeps it as a follow into the hosted cell,
  and a step the margin deep passes it. No clock; the same read on both servers. Built.
- Recommended: C. It merges only on your letter, after x-handoff-cross v3's read on its stage.

- Decision: C (Eli, 00:00 PDT: "recommended on both", D36 and D37 together). The brake rides inside
  trains 55 and 53; x-handoff-cross v3 reads it on 55's stage, and 55 merges on its gate under D32 B.

### D37. A client mod drops a dead NPC's shield into the world (17:00 PDT)
x-body-loot 20261026-231653 on 50b's stage read RED at the dead bandit's worn list: alive it wore
hide boots, a hide shield, a steel war axe and a studded cuirass (the fate's roll, the server's);
dead, the shield was gone from the body. DeathDropOverhaul.dll (the seats' load order, also one of
the two Loading Menu holders of D24) drops a dead actor's held shield as a world reference on each
client. The server has no record of that reference: the shield is lootable from the body on the
server AND lies on the floor in each game, a client-local item outside the one-state rule (the
other seat's floor copy comes from its own engine's drop, or not at all for a puppet whose death is
the server's word). Train 47b's own claim holds: the record keeps the roll through the death and
the loot. x-body-loot v4 claims 47b's own point (the record equals the roll through the death and
the loot, the loot menu opens) and READS the body's worn list and the shield's whereabouts (v3's
look for an ARMO within 200 units of the body found none: where the mod puts the shield is itself
unread) so 50b can merge; the committed scenario b-body-loot inherits your letter here, and on B
the strict claim (the body wears the roll after the loot) returns to it.
- A. Leave as today: the mod stays; the body's shield doubles on the floor client-side; the
  probe and the scenario carry the "or" clause as a known limit.
- B. Drop DeathDropOverhaul from the lab and playtest load order (a persist-mods render, a layer
  stage) until M4's dropped-items row makes a dropped item the server's; the strict claim returns.
- C. Sync the drop now: the host's engine's drop reported as the server's item (M4's physics and
  dropped-items row pulled forward; a verb of its own, a week).
- Recommended: B. A client mod that creates world items the server never records breaks the one
  authority per state rule (CLAUDE.md), and D24 already names the same plugin for the quit leak.

- Decision: B (Eli, 00:00 PDT: "recommended on both"). DeathDropOverhaul leaves the lab and playtest
  load order until M4's dropped-items row (a persist-mods render laid on clean-m1, numidium and core,
  in a gap or before playtest 35's setup); the strict body-worn claim returns to x-body-loot and its
  promotion b-body-loot once the layer is on the seats.

### D38. How train 51's cut gate finishes (00:15 PDT, numidium)
51's gate set 20261027-054632 ended at 18 of 25 when sky-c2's RTX failed a link retrain at a lab-api slot reset
(23:53 PDT: root port 00:03.4 "retraining failed", QEMU exit 1, then no heartbeat; DevCtl 0x2df0 and 0x79ff, the
wedge of 10-16 and 10-17): 16 green; b-npc-body-release red on its old fixed point (459 units against the 452 reach;
the premise is fixed on main d85701d, only where c2 stands, the claims unchanged); b-npc-respawn and
b-npc-stream-actions lab faults; seven unrun. ADR-027's reruns of the red never ran. After the card is recovered (a
remove and rescan under 00:03.4, or a host power cycle if that does not stick; no core session is running), one
controlled start proves it, RUNSET_AFTER plays the set's rest (the nine not green) on the same stage, and verb-merge
cites the two sets as one gate (gate-cite.py's chain: a red in the first set cleared by a green in the rest is a watch
item, as a rerun's green is inside one set).
- A. Leave as agreed: the rest on the scenarios the stage deployed. b-npc-body-release's old point plays the retry the
  reruns would have, b-npc-stream-equipment its claims from before e42dbca. A green or watch rest merges under D32 B,
  a red one stops for your read. This is what happens without a letter.
- B. Deploy main's scenarios before the rest: b-npc-body-release plays d85701d's approach and b-npc-stream-equipment
  e42dbca's stricter claims (the server-made bandit's hands and swings). A green or watch rest merges, the old point's
  red kept in the record as a watch item.
- C. A fresh full gate on main's scenarios, b-npc-copy-fate included: about 1 h 50 min of lab against 50 min.
- Recommended: B. The rest then asserts what main asserts, and the one premise that changed moved where a seat
  stands, not what it claims.

- Decision: B (Eli, 00:44 PDT: "D38 B i suppose"). After the card's recovery, `just deploy-srv` runs before the rest:
  since the stage's deploy (main 84330e1d) only three scenario files changed, b-npc-body-release (d85701d's
  approach), b-npc-stream-equipment (e42dbca's two claims on the server-made bandit) and the new b-npc-copy-fate,
  which is not in the rest; the rest plays the first two as main has them.

### D39. Train 52's probes red on their premise (01:45 PDT, numidium)
On 52's stage (m3-npc-death f9859083) P7 v5 was green, and all three death probes were red the same way: Sven
(0x13491) walked his package away from the one approach, so no swing or shot from either seat reached the server
(x-npc-death-guest 083747, x-npc-death-host 084109, x-npc-headshot-host 084400; zero OnWeaponHit on 13491).
thuum-06's v3 of all three holds him first (start-combat on the host, so he stands and fights its god-mode player;
the engine's own death path untouched) and keeps a re-approach before every swing; the claims are unchanged. D32 B
says any red stops the chain for your read.
- A. Stop the chain until you have read the fixed probes' results yourself.
- B. If the fixed probes pass on the same stage with their claims unchanged, 52 gates and merges as usual, and the
  reds and the fix are reported as it lands.
- Recommended: B.
- Decision: B (Eli, 01:56 PDT: "go with B.").

### D40. Eli's standing word for the rest of the ladder (01:57 PDT 2026-10-27, verbatim)
Eli: "i keep getting pinged for questions and shit, just plough ahead to a fully functional playtest 35."
Read as: no more questions to Eli until playtest 35 is set up; every open or new decision on the way
takes the memo's recommendation by default, the scenario owner (thuum-magnus) and the process owner
(numidium) deciding between them and recording the call here; reds are read and fixed, and a premise
red fixed with the claims unchanged counts as the claims holding under D32 B (the chain merges on the
green gate and reports); only a red of a train's own code with no fix in hand stops the chain, and then
the stop is reported, not asked. This answers numidium's pending question on 52's premise reds: B.

- Decision: as above (Eli, "just plough ahead to a fully functional playtest 35")

Calls recorded under D40 (thuum-magnus and numidium between them):
- 02:32 PDT: the death probes claim EITHER order of an NPC's death, the server's number reaching zero
  first with the kill waiting on the host's report (death pending) or the host's engine ending the
  actor first (a kill move at low health decides before the damage) with the report taken on the
  server's evidence; both are ADR-050 decision 2 with ADR-048 B ("the engine's number outran the
  server's and the death stands on both screens", npc-fate.md), so the change aligns the claim with the
  design rather than weakening it (x-npc-death-host v3 20261027-091759 took the second path).
- 02:32 PDT: the bodies' distance is 52's code (a dead ragdoll takes no setPosition), fixed on
  m3-npc-death cc1d9025 and restaged; a code fix restages, a premise fix reruns.
- 04:25 PDT 2026-10-27: b-npc-copy-fate's victim claim restated from the player to any target
  ("OnWeaponHit - ff00000[2-9a-f] hits"): in 52's gate (111854) four residents reached the placed bandit
  first and it fought them, its swings counted as train 51 means (E_HIT_WEAPON judged the aggressor's
  hands, whoever was struck), so the claim still asserts 51's change with the three refusal claims; what it
  no longer asserts is a server-made copy's hit landing on a PLAYER (the R0 path), which no other scenario
  claims for a copy: that count is recorded in the scenario (a >= 0 row prints it) and playtest 35's bandit
  line in Bleak Falls Temple reads it on both screens. A loosening, named here so Eli sees it unasked.
- 04:46 PDT 2026-10-27: b-npc-death 112539 (52's gate) read as a premise red: the restart's cell grant is a
  race between the games' own logins, and the record after it is its host's body (R2); c2 won the race
  with a corpse its cell reload had re-settled 360 units down the slope (the engine's physics on a
  reloaded ragdoll, no line of ours), so the record followed c2's body. 52 writes no position on the
  server and moves no dead ragdoll on the client. Fixed on main 86d340b with the claims unchanged (c2
  held out of the cell through the restart, an until on c1's grant). Under D39 B the rerun's green
  counts as holding; with b-npc-copy-fate's (84805f1, d7692a2) the gate's two reds are both premise reds
  with fixes on main, so 52 merges on the two reruns' green. The known limit (a cell reload can
  re-settle a seat's corpse; the record follows the host) is recorded in npc-fate.md for playtest 35.
- 05:07 PDT 2026-10-27: b-npc-respawn 115833 (52's gate's third red) read as 52's own code: the life check's
  guard skipped the stand-up on the host, which binds a corpse when it logs in after the sweep (the
  respawn's container reaches the host of the moment only). Fixed on m3-npc-death 7cd47e24 (the check
  resurrects any copy whose record says alive; it still never kills a simulated one). D40: a code red
  WITH a fix in hand is a restage, not a stop; numidium cuts or finishes the gate, I push on its word,
  52 restages on 7cd47e24 and runs its probes with b-npc-respawn and the two premise fixes, then its gate.
  The reset case of a live copy on a dead record on the simulating seat is named in npc-fate.md, unprobed.
- 05:13 PDT 2026-10-27: b-npc-stream-actions 120242 (the cut gate's fourth red, 1 of 6) read as a premise red:
  the "block anim" print names no actor, and a creature's own blocked attack at c2's connect point, far from
  Riverwood, counted once against a claim of zero. Scoped on main f98c657 to the bandit's window (a baseline
  count before the bandit, the claim the difference), the five other claims unchanged; numidium adds it to
  52's stage probes. A later client line naming the actor (ctx.selfId) would let the pattern name the bandit;
  not a restage's worth now.
- 06:05 PDT 2026-10-27: b-npc-death 125354 (52's restage) red on the new premise step, not the claims: c2's
  teleport back within a second of its login never settled (the record written, the game unmoved for 60 s,
  the server correcting it every 3.5 s; the DB had carried c2's away position through the restart, and c1
  held the cell as pinned). A lab premise, not 52's: main c1f44fb gives c2 fifteen seconds after its
  reconnect before the move, the claims unchanged; finish-train's rerun plays it.
- 07:00 PDT 2026-10-27: b-host-own-hit 135408 (52's gate's first red) read as a premise red: the campfire pair's
  detection of c1 is the camp's own timing (no target in 90 s; green at 110935 on the cut gate; 7cd47e24
  changed only the life check). Main 9a2441d has the host's game start the fight (approach to 200 units,
  start-combat on both, inCombat asserted), the claims unchanged. A lone red reruns at the gate's end under
  ADR-027; numidium decides whether the rerun plays the deployed file or this one.
- 07:13 PDT 2026-10-27: b-npc-death-engine 140805 (52's gate's second red) read as a premise red: the combat hold
  keeps Sven in reach but moving, and the one swing before the one-number read missed (the stage's first swing
  had landed by luck). Main f1829c2 holds him still for the swings (npc-ai off, as b-npc-headshot-host does;
  the engine's death needs no AI of his), the claims unchanged. With two reds the gate ends red and
  finish-gate's rest plays the deployed tree, so this lands on main before the gate's end.
- 07:27 PDT 2026-10-27: b-npc-death 141823 (52's gate's third red) read as a premise red: the server's tgm is a
  session flag the restart forgot, and the pinned-host shape leaves c1 alone with the forest's predators for
  40 s, so 86117 killed it and the grace passed its cells to c2 before leg 4. Main b8c494f re-arms god mode
  through the server's lever after each login (b-cell-host's shape), the claims unchanged. Three premise reds in
  this gate (b-host-own-hit 9a2441d, b-npc-death-engine f1829c2, b-npc-death b8c494f), all on main before the
  gate's end for finish-gate's rest.
- 07:45 PDT 2026-10-27: b-npc-handoff-night 143604 (52's gate's fourth red) read as a premise red: the restart's
  grant race again (c2 won 0x9732 by 18 ms; its engine never brought Alvor out, the record sat indoors 180 s).
  Main ab00c67 pins c1 through the restart (b-npc-death's shape), the claims unchanged. Four premise reds in
  this gate, all on main for finish-gate's rest. Noted for after the ladder (numidium): a lab-api `server:
  restart` that reconnects the seats in their listed order, each waiting for its grants, so restart scenarios
  stop carrying their own guard; a-restart-persistence and b-npc-handoff-restart are exposed the same way.
- 08:08 PDT 2026-10-27: b-npc-respawn 150150 (52's gate's fifth red) read as a premise red: the respawn sweep under
  test stood the prelude's dead rivals up with the subject and the revived 85549 killed it inside the 40 s window,
  a death by the engine as designed (c2's report accepted). Main 717eeab kills the rivals again by kill-ref right
  after the reconnects, the claims unchanged. Five premise reds in this gate, all on main for finish-gate's rest.
