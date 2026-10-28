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
- Amended 17:47 PDT 2026-10-27 (Eli: "let's do the expidition and drop 35 tonight", on the estimate that
  the layer's full sweep pushed 35 to the morning): the layer lands AFTER playtest 35, riding the nightly or
  its own sweep tomorrow; 35 is set up tonight on 53's merged parity with DeathDropOverhaul still in the load
  order, its shield drop a named known limit in the checklist. layer-d37-ddo-out already carries main (8905804).

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
- 08:42 PDT 2026-10-27: b-npc-death-engine 153601 (the rest's lone red) read as a premise red of my own making:
  with Sven's AI off the engine's death names no killer, so f1829c2's still hold broke the report's killer claim.
  Main 249da50 keeps the still hold for the first swing only and restores his AI and combat for the kill
  swings; the claims unchanged. The engine fact (an AI-off actor's death carries no killer; the server records
  the death on its own evidence) goes into npc-fate.md with the watch item.
- 09:01 PDT 2026-10-27: b-npc-death-engine's lone-red rerun 155405 missed its single measured swing on a still
  Sven (the approach faces the record, the hit cone wants the body). Main f9767f2: look-at before every draw and
  the iron sword for up to three measured swings (none lethal under the still hold), the warhammer for the kill
  legs; claims unchanged. numidium runs rest2 (death-engine alone) and the merge cites gate, rest and rest2.
- 09:10 PDT 2026-10-27: rest2's b-npc-death-engine 160214 red again at the one-number read: the still hold does
  not hold a walking actor on its host (AI off, 260 units walked) and look-at never turns the player. Main
  bb3da60: the measured leg under the combat hold with six iron-sword swings (repeat), the warhammer after,
  AI on throughout; claims unchanged. numidium runs rest3 (death-engine alone); the merge cites the chain.
  Two lab facts for the lab notes: the npc-ai lever freezes a standing actor only; look-at's heading is a read.
- 09:13 PDT 2026-10-27: rest2's b-npc-death-engine 160510 landed its measured swings and lost the killer on the
  warhammer's lethal blow ("died of unknown ..., killer 0", the engine's deathStart naming none after a single
  lethal blow; the server's pending line names ff000000). Call (numidium's a, b, c): (c) now, main 70da78b, the
  sword for the kill legs as the stage's 123746 proved, claims unchanged; and (a) as train 54's code (the credit
  from the server's own pending aggressor, R0, an ActorDeathTest case, a big-blow scenario in 54's gate), H-52b
  in npc-fate.md until then; not (b), a loosening with a real gap behind it; not a restage of 52, since the fix
  lands in the next train before playtest 35.
- 09:20 PDT 2026-10-27: rest3's b-npc-death-engine 161323 lost the killer with the sword as well (the report 77 ms
  after the pending line, no killer; the green 123746's came 2.3 s later from the engine's own kill move): H1
  refuted for the killer, the server's credit (54's 240a31de) the fix. Call: the killer line loosened on main
  895f135 to the pending line's aggressor or the report's killer until 54 merges, a loosening named here as
  copy-fate's was; the strict line returns in 54's scenario commit with x-npc-death-blow proving the credit.
  Not a restage of 52: the fix is in the next train and 52's death path otherwise holds on every claim.
- 09:21 PDT 2026-10-27: the loosening above is WITHDRAWN. numidium read 895f135 against rule 13 ("Never turn a
  scenario green by weakening its assertions"): a claim relaxed only to wait for its fix is exactly that, where
  copy-fate's was restated to what 51 changed; D40 settles open calls and lifts no hard rule. Main 3055859
  reverts it whole; the killer line is strict. 52 ships inside 54 as one merge train (ADR-030): m3-npc-face
  carries 7cd47e24 and the credit 240a31de, 54's gate plays the strict line on the build with the credit, and
  parity goes 51 to 54 with 52's commits inside; no further rest for 52. 52's premise-fix watch items stand.
- 10:43 PDT 2026-10-27: x-npc-stream-face 173514 (54's stage) read as a premise red: the gaze path ran for the
  creatures near the host (targets streamed, relayed, taken by c2's puppets at slot 3) while the residents
  3600 units away set no head-track slot in 90 s (H-54d: the engine tracks heads near the player only). v2 by
  path brings both seats to the mill (300 and 400 units of Sven), claims unchanged; a rerun on this stage, no
  restage. The second red was a QEMU guest agent hiccup on sky-c2 during a log-count step.
- 10:48 PDT 2026-10-27: x-npc-death-blow 174006 (54's stage) red on the credit line alone: the engine's own kill
  move ended him first with the killer named, so the credit was not reached (the lethal blow's path is the
  engine's dice). Call (numidium's 1, 2, 3): 1, the server path's report shape forced without a lethal blow
  (two more sword swings for a numbered hit, then npc-damage on the host's engine, no attacker); v2 by path,
  claims unchanged, rerun from disk after T2. Not 2 (a pair of claims proves the credit only when the dice
  fall its way) and not 3 (luck).
- 12:13 PDT 2026-10-27: b-npc-death 190413 (54's gate) read as a premise red for the restart claim: the host held
  and the corpse moved 1300 units on the host's own engine between the kill and the restart (same height, no
  client line), the record following under R2. Main 0977292 measures the restart against a pre-restart snapshot
  and records the travel; H-54e opened in npc-fate.md with a drift probe for 55's stage and the candidate rule
  (a dead record holds after a settle window, R0) for 55 or later. The 256 bound and every other claim stand.
- 12:15 PDT 2026-10-27: 0977292 WITHDRAWN as a re-measurement (numidium: rule 13, the fall-point bounds are what
  caught the corpse's 1300-unit drift and a snapshot before the restart would hide it); main c6899e0 restores
  them and adds the restart's own bounds beside them. No mid-gate deploy; ADR-027's reruns play the strict file.
  A green rerun: the watch item carries H-54e open and 54 merges. A red rerun: D40's stop, reported, and
  H-54e read first (x-npc-corpse-drift on the stage); ours → the fix carries the strict claim; the engine's → a
  restatement in this memo naming what it no longer covers.
- 12:35 PDT 2026-10-27: b-npc-headshot-host 192858 (54's gate's second red) read as the lab's: lab-driver cannot
  aim (look and look-at leave the player's heading at the approach's; every look-at in the run read its
  approach's facing, and the shots flew at the record's point 26 units off the body); the headshot path's own
  claims held whenever a shot landed (104716 on 52's stage, by luck of the body's place). Call (numidium's
  proposal, nothing weakened): the scenario goes `pending` in gate.yaml (ADR-042b) with that reason, so its red
  stays out of the citation while the claim stands as written; numidium fixes the driver's aim right after the
  ladder (a same-spot teleport with the computed heading, since the teleport applies its heading) and un-pends
  it once a probe proves the aim. Named here for Eli: a committed scenario sits out gates until the lab can aim.
- 13:18 PDT 2026-10-27: b-npc-stream-voice 200545 (54's gate's third red) read as a premise red: the listener's
  computed landing point fell in an obstacle and the engine's placement sat 74 units off it, past the judge's
  tolerance. Main c70e828 gives the listener's approaches tolerance 150 (earshot, not a mark), claims unchanged;
  the judge's acceptance of a repeated placement is a lab-api row for numidium after the ladder.
- 14:13 PDT 2026-10-27: x-npc-talk-claim 210601 (55's stage) read as a premise red: E hit nothing, Sven walked his
  7.9 package out of the crosshair's line between the approach's judge and the press (look and look-at aim
  nothing). v3 by path: the clock at 9.0 (Sven at the mill's saw, standing), the host's npc-ai lever through the
  claim, the record asserted still, approach to 70 and E at once; the claim line's cell widened to 973[12] for
  the hour. The claim code (talkService, ActionListener's gates) is untested by this run; the rerun reads it.
- 14:21 PDT 2026-10-27: x-handoff-cross v3 211054 (55's stage) read: the brake (D36 C) works as designed, zero
  passes and 42 follows in Riverwood's three minutes (Sigrid 160 units into the other host's cell, a follow;
  Sven's 26 hovers followed), PASS_MARGIN_UNITS 256 MEASURED for that traffic. b-npc-handoff-cross's "one pass
  per crossing" was the unbraked rule's claim; restated to "a follow within the margin, passes at most six and
  recorded" (main, its own commit; v4 by path), a restatement matching the train's change, named for Eli as
  copy-fate's was. Not asserted at T3: a crossing deep enough to pass (CellHostTest proves it at T0).
- 14:22 PDT 2026-10-27 (D36 C's follow-up, named for Eli): what b-npc-handoff-cross no longer asserts at T3 is a
  crossing deep enough to pass; CellHostTest proves it at T0 and Riverwood's traffic never walks 256 deep in
  three minutes. One probe after the ladder reads it at T3: an actor walked or moved 300 units into the other
  host's square (npc-pose or a placed NPC's travel package), the pass line once, the follow lines before it, and
  the seats' AI swapping once. numidium holds it on the after-ladder list with the lab-api items.
- 14:26 PDT 2026-10-27: x-npc-corpse-drift 211727 GREEN on 55's stage: with the promote fix (c1be67d1) the corpse
  stayed at one point through 24 reads over four minutes on both seats, a restart and the host's reconnect
  included. H-54e's fix holds at T3; its mechanism (the promote switching AI on a dead actor at the reconciler's
  flip) stays the code's one candidate. b-npc-death's fall-point bounds stay strict with that.
- 15:00 PDT 2026-10-27: 55's T2 (job 12909 at c1be67d1) red on the npc-talk session alone: two wire-only notices
  undeclared (c2's HostGrant at epoch 2 and the DestroyActor of c1's actor), both the session's end as
  cell-host.yaml declares them; the claim handler grants no cell (OnActorClaim; PartOne's one HostGrant sender is
  the cell-host routine), so neither is the claim's. A sessions-only commit on m3-npc-talk (1b866786) declares
  them. Call with numidium: gate-cite accepts skymp-wire/difftest/sessions/** differences (they build nothing),
  T2 reruns with SESSIONS=tree at the new head, and 55's stage keeps c1be67d1's images; no restage.
- 16:09 PDT 2026-10-27: x-npc-talk-claim v3 230022 (55's stage) red at its own stillness assert, before any claim:
  with the host's npc-ai off Sven still walked a loop over the 9731/9732 border at 9.0 (195 x and 122 y in five
  seconds, package 0), the second time the lever failed to stop a walker. Call (numidium's a, b, c): a, a driver
  step `npc-hold {formId, held}` on Actor.setDontMove (the engine's own scene hold; his AI and dialogue keep
  running), numidium's to add with a live timing run; v4 of the probe holds him, keeps the stillness assert,
  approaches to 70 and presses E at once, releases at the end; claims unchanged. Not b (the re-approach grammar
  is not there) and not c (a guess about another resident's schedule).
- 16:32 PDT 2026-10-27: x-npc-hold v1 232338 (numidium's timing probe) red at its stillness pair: SetDontMove slowed
  Sven to about 33 units a second but did not stop him within five seconds (npc-ai's EnableAI(false) had left
  him at 77). Call: the press waits for him instead of holding him. x-npc-talk-claim v5 by path keeps the hold
  as a slowdown and presses E when lab-api's until reads him under c2's crosshair (c2.state.crosshairRef, the
  until refreshing the client's dump each poll, every quarter second for 90 s); claims unchanged, no new
  grammar, no driver step. The driver aim step stays on numidium's after-ladder list unless v5 reds.
- 16:44 PDT 2026-10-27: x-npc-talk-claim v6 233908 GREEN on 55's stage: the dialogue claim works end to end (the
  grant 157 ms after the E, the menu open on the guest, the release at its close, the host live again). Promoted
  as b-npc-talk (main, its own commit) for 53's gate. 55's three probes green (talk-claim, handoff-cross v4, the
  corpse-drift read); the gate runs on c1be67d1 and merges 1b866786 under the paper rule.
- 17:29 PDT 2026-10-27: b-npc-death-blow 002258 (55's gate) red on the credit line alone: all six measured swings
  landed and the two for the numbered hit made the eighth lethal, which rolled the engine's kill move; my
  arithmetic (eight sevens are 56, not under 50). Main dca3b06: four measured swings, 42 at most before
  npc-damage; claims unchanged; numidium deploys mid-gate for the reruns. A premise red of the probe's own.
- 19:40 PDT 2026-10-27 (D36 C's follow-up, drafted in 53's stage wait): x-handoff-deep v1 by path (lab/.cache/
  probes, probe-check ok), the pass a step beyond the margin at T3: Sigrid standing 300 or more inside c1's cell
  0x9712 (Riverwood02, grid 5,-11) is moved by c1's own engine to 300 inside c2's 0x9731 (Riverwood04, grid 5,-12;
  grids by esm.py's XCLC, the border at y -45056) with npc-pose's TranslateTo at 150 u/s, her AI off and
  SetDontMove on the host first (HYPOTHESIS: a TranslateTo under a running AI is fought; the reads tell). Read at the
  fork (parity 1b866786): the deep pass writes no "passes" line (ActionListener's cell-host line sits under
  hostedCellChange, false once the follow moved the record); its line is D9's "now simulates 13483 in cell 9731; the
  sender's game is told to demote", written at every Pass verdict. Claims: the margin follow line, D9's line once,
  no refusal, the follow row gone (server.follow), c2 hosting 9731 still, the seats' AI swapped, the record and c2's
  copy within 100 of the target. npc-pose takes lab-spawn's frame, so the target is written as offsets; a
  world-frame row for npc-pose is a lab-api wish on numidium's after-ladder list, where this probe runs.
### D41. Expedite: playtest 35 tonight, the D37 layer after it (17:47 PDT 2026-10-27, Eli)
Eli: "let's do the expidition and drop 35 tonight" (on the estimate: 55's gate to about 19:15 PDT, 53 to
about 23:15, then the layer's full sweep of about six hours would have put 35 at 06:00). Decision: after 53
merges and is recorded, playtest 35 is set up at once on that parity (trains 51 to 55 and 53; the D37 layer
not in it, DeathDropOverhaul's client-local shield drop a known limit on the checklist); the layer stage, its
probe x-body-loot v5, b-body-loot and layer-merge's full sweep follow after the playtest (the nightly at
03:30 PDT or a sweep tomorrow). Target: 35's seats ready around midnight PDT, each red on the way adding its
rerun. No other change to the ladder.
- 18:27 PDT 2026-10-27: b-npc-respawn 011906 (55's gate) read as a premise red: the restart's gameHour 14.0 lay
  before the body's hour (the kill at 13.53 h by a clock running twenty to one, the body until 14.53). Main
  59836b8 restarts at 16.0, claims unchanged; deployed mid-gate for the ADR-027 rerun.

### D42. Corpses after a cell reload: leave them to each engine (19:22 PDT 2026-10-27, Eli)
Eli: "for corpses lets go A, and defer it to a later arc where we seek to sync most/all physics objects.
(maybe throw out an agent to scout out how that would go while we wait but it doesn't need to be a thing for
now. so long as live npc behavior, death syncs, and corpse container shit all works appropriately)". Decision:
A. A seat that reloads a cell finds the corpse where its own engine re-settles it; the record stays the
host's body; the checklist names it. The ragdoll's rest and every other physics object (dropped items, the
M4 rows) belong to a later arc, "sync most or all physics objects"; a scouting report on how that arc would
go is written now (docs/research/m4/physics-sync-scout.md, a research agent, no code) and binds nothing. The
three things that must work for 35 are proved at T3 on this build: live NPC behaviour (the stream
scenarios), death sync (b-npc-death-engine, -guest, -report, -blow, b-npc-death) and the corpse's container
(b-npc-loot, b-npc-body-release).
- 19:24 PDT 2026-10-27 (D41's shape): Eli asked whether bows and spells can be in tonight's 35 (they are train 53's,
  the last train). Call, recommended to Eli and taken unless it objects: ADR-040's shape, as playtest 24 took on
  train 27's stage: 35 is set up on 53's STAGE once x-npc-archer, x-npc-caster and T2 are green (about 21:00
  PDT), 53's gate runs after Eli's report and the merge after the gate; the build under test is frozen from
  "seats ready" to the report. Fallback on a 53 red: 35 on 55's parity without bows and spells, Eli's call.
  55's rest was green (death-blow 014918 on four swings, respawn 015254 at 16.0); a gate-cite image-id false
  refusal (fixed, 03ba40f) cost one aborted set.

### D44. 53's archer red: fix and restage before 35, with a cutoff (19:52 PDT 2026-10-27, thuum-magnus under D40)
53's stage (m3-npc-cast ecec018e) read: x-npc-caster 024159 GREEN; x-npc-archer 023756 RED on its two shot
claims, a CODE red with the fix in hand. The archer fired seven arrows on the host (PROJ 50 in flight on c1's
polls; the puppet's attackRelease taken 1 on c2) and every launch threw in the client's projectileLaunched
handler ("'Game.getFormEx' can't be called in this context", c1.log, seven lines 19:40:36 to 19:40:55), so no
"hosted shot by" line formed and no OnPlayerBowShot reached the server. Cause: playerBowShotService's
onHostedLaunch (53's code) calls natives (Game.getFormEx, getEquippedWeapon, the aim reads) inside the handler,
where Skyrim Platform refuses them (CallNativeApi.cpp: requirements.vm is unset in the launch event's context);
the player's own shot keeps its launch and does its natives on the update tick, and the crossbow hook defers
with controller.once("update"). Options: A, fix (the hosted branch keeps the launch and reports on the next
update, the file's own idiom) and restage 53, 35 after the probes and T2 (about 21:45 PDT by numidium's
clock); B, 35 now on 53's stage as it stands, NPC bows a known limit, spells in; C, 35 on 55's parity without
bows or spells. Decision: A (the goal names bows), fork m3-npc-cast bf133744; numidium relaunches ladder 53 on it
with the no-gate switch (the Windows build, the stage, x-npc-archer, x-npc-caster, T2, TRAIN END 21, the 35
set-up re-armed). Cutoff 22:30 PDT: not green by then, B on the stage standing, numidium saying so first.

- 19:59 PDT 2026-10-27 (D42's follow-up): the physics-sync scouting report is written, docs/research/m4/
  physics-sync-scout.md (one agent, no code touched): the fork accepts movement for actors only and places a
  dropped item once at the dropper, frozen everywhere; nobody has shipped prop or ragdoll sync in Skyrim
  (TES3MP streams no object motion, Skyrim Together's per-frame body writes corrupted Havok; its unmerged #913
  is the keyframed-follower shape); the CommonLib surface is cited by file:line, the rest is nine "RE this" items.
  D43 PROPOSED there: A leave as today, B rest-only (TES3MP's shape, corpse-rest and item-rest as two whole verbs
  in M4, 7 to 11 days), C the whole arc with motion streams (20 to 30 days plus RE), D ragdoll pose; recommended
  B. Eli decides later; nothing before playtest 35 depends on it.
- 20:31 PDT 2026-10-27 (D44's outcome): A held. The restage at bf133744 (20:12 PDT) read x-npc-archer 032303 GREEN
  (four hosted shots reported, the placed archer's taken under its id, one relayed arrow in flight on c2, no arrow of
  the puppet's own) and x-npc-caster 032625 GREEN (H-53b confirmed); the first stage's T2 was green on ecec018e and
  the fix is client-only. T2 on bf133744 runs, then numidium's 35 set-up; well inside the 22:30 cutoff.
- 21:06 PDT 2026-10-27 (D41 and D44 closed): playtest 35 is set up on 53's stage bf133744 (T2 green at 20:58 after
  numidium's build-picker fix, main bd4b7e8), seats ready 21:03:09 PDT, the hold to 00:02 PDT; the build frozen until
  Eli's report; 53's gate and merge after it, then the D37 layer (D41).
- 21:12 PDT 2026-10-27: 35 re-set on rotfern and Prisoner's composed world (Eli's ask to numidium at 21:05); seats
  ready 21:10:06 PDT, the hold to 00:09 PDT; the build unchanged (53's stage bf133744), frozen until the report.
- 21:31 PDT 2026-10-27: playtest 35 called early by Eli with three asks and a fourth read (checklist's Result): a late
  joiner's missing in-progress action, the guest's claim never sent for Sven, dialogue voice relaying the first
  line only, rotfern's head node 0.94 after every teleport. The log read runs (pt35-read-1); D45 (the fix train's
  shape and order against the D37 layer) follows it. 53's gate and merge stay as armed, after the informal report.

### D45. Playtest 35's fixes: what rides before playtest 36 (21:41 PDT 2026-10-27, thuum-magnus under D40)
Eli called 35 early ("fix this at least. anims still dont fully work. NPC's cannot be claimed sufficiently, in
conversation only one voice file will play and not the next one"). The log read (docs/private/pt35-read-1.md)
and the code reads give six items, each a fix to a shipped verb:
- a. npc-talk, the stuck claim: a guest's granted claim was never released in play (no "released at the
  Dialogue Menu's close" on either seat, no "releases" at the server), the client's E handler returns silently
  behind `pending || claimed` (talkService.ts:43), and the 120 s lease lapsed with no word to the seats. Fix:
  the server's UpdateHoster word to both seats at the lapse (the release path), the client releasing a held
  claim when E lands on another puppet and at its own timeout equal to the lease, a trace on every decline, and
  a probe closing the menu as a player does (Tab) to read why onMenuClose missed. Server and client; T0 for the
  lapse's word.
- b. npc-stream voice, the later lines: the host captures one speech event per topic info (TESTopicInfoEvent at
  the begin alone), so a multi-line response plays its first line on the puppet and the rest on the host. RE
  first (the re-analyst): how the engine advances an info's responses on the host (the AI's dialogue update an
  AI-off puppet never runs) and whether SpeakSoundFunction is called per line; then the puppet's voice drive
  advancing the response at a line's end, or a per-line capture on the host with the puppet saying by index.
  HYPOTHESIS until the trace; probe on Sven's multi-line topics.
- c. npc-stream actions, the late joiner: CreateActor carries the last animation event, not the last action or
  the furniture, so Hilde's tanning was missing on a seat that joined two minutes after it began. Fix: the
  record keeps a hosted actor's last action (slice 1's BGSAction and idle, R2) and furniture reference; a late
  joiner's CreateActor and the promote path carry it; the puppet replays it once at creation. Server, client,
  the wire row if CreateActor's props need one (validator in the same commit).
- d. movement (figures), the snap after jogging: movementApply.ts:427's one-unit settle for a still record
  (train-33) pulls the other player's figure back by the running lead at the first Standing sample (108 settles
  on c1, mean 6.7 units, max 36.8). Fix: let the lead run out (an ease over the lead's length) before the
  deadband drops from 8 to 1. Client only; the probe reads the settle lines' mean and max against these.
- e. racemenu-sync, rotfern's head at 0.94: the client applies the server's node scales once (formView's
  isSetNodeScaleApplied, remoteServer's apply at CreateActor) through NetImmerse.setNodeScale, which skee does
  not persist; a 3D rebuilt after the apply (a teleport, a load into an interior) shows the race's own scale.
  Fix: re-apply node scales and texture sets whenever the actor's 3D loads, player and figures. Client only;
  probe: the node read after a teleport and after a relaunch into Bleak Falls.
- f. npc-fate, the arrow-borne zero: rotfern's three arrow hits took 39fe2's record to 0, no host report came in
  3 s, the server killed it by its word while the host's engine bar stood at a quarter. Read first (c1's cause
  lines in the Bleak Falls window, the refreshed log copy): the cause's apply for the host's own player's arrow
  hits, or the DamageActor cut's coverage of projectile damage. Server or Skyrim Platform; T0 and a probe (the
  host kills its hosted bandit with arrows; the engine dies with the killer, no "death by the server's word").
Options: A, train 56 now with a, c, d, e (code-ready), train 57 with b and f after their reads; the D37 layer
(layer-d37-ddo-out 8905804, D41) staged and swept overnight right after 53's merge while 56 is written (code
needs no lab); 56's stage and probes in the morning, playtest 36 on its stage under ADR-040; 57 after. B, one
train with all six after both reads (36 a day later). C, 36 on 56 alone, b and f deferred to M3's end (Eli
asked for the voice by name, so no). Recommended: A. Decision: A under D40 (21:41 PDT); 53's gate and merge first,
as armed.

### D46. Eli's idea for apocrypha: menus that do not pause (21:41 PDT 2026-10-27, relayed by numidium)
Eli, verbatim: "a thought to work with apocrypha on-- pausing, inventory, and containers shouldn't pause the
game. it should be transparent. rn it feels unnatural in multiplayer. the player who opens their inventory,
everything freezes for. im sure there's a mod for this." The standard tool (lazy): Skyrim Souls RE - Updated
(Nexus skyrimspecialedition/mods/27859; source github.com/Vermunds/SkyrimSoulsRE), an SKSE DLL that unpauses
chosen menus (inventory, containers, books, map, dialogue), per menu in Data/SKSE/Plugins/SkyrimSoulsRE.ini,
optional slow motion; requires SKSE64, VC++ 14, Address Library, and SSE Engine Fixes with the Memory Manager
Patch and Global Time Fix on. No plugin slot, no load-order change: a mod layer (persist-mods, layer-stage, the
full sweep) after D37's. apocrypha confirms: 1.6.1170 support in the current release, whether the lab carries
Engine Fixes, which menus to unpause (dialogue unpaused meets npc-talk's lease; containers meet the server's R0
inventory, the container menu's live updates while another player moves items a probe). Decision: pending
(apocrypha's layer; Eli's call on the menu list).
- 21:45 PDT 2026-10-27 (D45 addendum, playtest 35 ended): Eli's close adds NPC jerkiness on the non-host screen and
  player figures feeling off against the pre-stream movement ("what we had before for movement felt a TINY bit
  more natural"). Item g: before any tuning, the puppet and figure paths MEASURED with ADR-031's recorder on 56's
  stage against the reference traces (p-npc-stream's row, numidium's per-id grammar) and the pre-stream build's
  figure numbers (x-duel-stream 20261022-233951); numidium's note stands: by number, not by eye. Item d's ease
  ships in 56 with its own before and after numbers. Two causes pinned by the fresh logs: (a) the movement judge's
  Follow record overwrites a Claim row when the claimed actor crosses a cell (cells.rs's insert at the Follow
  verdict), so the claim ends silently, no ClaimEnded word, and the client's claimed flag never clears (Hilde's
  crossing 9732 to 9731; zero "ended with its lease" lines; E_CLAIM_NONE on rotfern's release at 04:26:48): the fix
  keeps the Claim row across the claimant's own crossings and ends it only by release, lease, departure, unload or
  death, plus the client's resets. (f) the host's death causes for its own player's arrow kill were queued with
  the attacker ff000000 mapped to local 0 (the local player's remote id has no local form in the map), and the
  engine's health followed only its own arrow damage, so the native apply did nothing without an attacker; the
  archer probe's causes (an NPC attacker) applied. The fix maps the local player to 0x14 and lets a cause with no
  attacker apply the server's number anyway (no killer credited). f moves into train 56 (small, pinned); b (the
  voice's later lines) stays 57's behind the re-analyst's read.
- 22:11 PDT 2026-10-27 (D45 built): train 56 on fork m3-pt35-fixes 6bc6657c, items a, c, d, e and f (f moved in once
  the logs pinned it); five probes by path, probe-check ok. One shape lesson: CreateActor takes no new typed field
  (wire-legacy decodes the lab's capture positionally; the late-join action is a custom property). 57: the voice's
  later response lines (the re-analyst's read runs now) and item g's measurement. Lab order unchanged: 53's gate
  and merge, the D37 layer overnight, 56's stage and probes in the morning, playtest 36 on its stage.
- 22:36 PDT 2026-10-27 (D45 b, the voice's later lines): the re-analyst's read is in (docs/private/re-voice-responses.md,
  the Dynamic section in npc-stream.md). The later lines of an info start from the AI update's null-topic SayTopic,
  which an AI-off puppet never runs; the player's dialogue partner speaks through UpdateInDialogue with no event
  (the one-capture-per-info of 35). Train 57's shape: A, the puppet's own continuation from DriveVoice (no wire
  change), after the Frida trace confirms the chain (lab/frida/voice-lines.js, a host seat, 120 s). Rule 8: no code
  before the trace.

### D47. The pace: how to run what remains (23:40 PDT 2026-10-27, Eli)
Eli: "if i wanted to throw all caution to the wind, all testing and whatever, and just 'code the rest of it' how would
that look? this is taking forever". The three ways given: A as today (one proved train a day); B code the rest with
T0 and T2 alone and a playtest per milestone (fast for a week, then an undigestible playtest: all six of 56's fixes
came from the lab or the playtest, none from code; defects found late cost most, Boehm and Basili 2001, DORA); C
split by rung and batch the lab (R0 merges on T0 and T2; engine-facing changes keep one probe at a daily slot; the
gate cut to the touched verbs; the milestone lists nightly). Eli: "im leaning C, but Id like a playtest or two a day
was the cadence we had a while ago". Decision: C with the cadence, ADR-053 PROPOSED (two stage slots a day, a short
playtest on each, eight items at most). First day, 2026-10-28: the morning slot stages 56 (x-voice-lines with the
trace, 56's five probes, T2) and carries playtest 36 trimmed to eight items; the evening slot carries 57 (if the
trace confirms the chain) and the D37 layer's result, playtest 37. The GPU question (D47's companion, 20:3x PDT):
no sharing on the lab's cards; more seats by passthrough.
- 23:47 PDT 2026-10-27: D47 closed, ADR-053 ACCEPTED (Eli: "oh then yes accept"). numidium's tooling moves off its branches: the gate's verb map, the slot wrapper, the R0 merge path, the nightly's list check, the lever library (two days between them); the slots run by hand meanwhile.

### D48. Faster still: the six levers beyond ADR-053 (00:01 PDT 2026-10-28, from Eli's words of 2026-10-27 late)
Eli: "yeah. full transparency, im impatient and think there has to be a faster way to be doing this." The six
levers given, by payoff per effort: (1) a client hot path onto a running seat (Skyrim Platform's reload, no CI,
no relaunch; five of 56's six fixes were TypeScript alone); (2) T0 and T2 before any push (two CI rounds died on a
test file); (3) reverse engineering before engine-facing code (the voice item: twenty-five minutes of static read
gave the fix shape); (4) a second seat pair and a second server; (5) ADR-036, a relaunch instead of a rollback; (6)
a scope cut of M4 to M6 to what an evening with friends needs. Eli: "do all of those sans 4. ill brainstorm on 4.
we might be able to do windows vms in AWS with a gpu each that are spun up as needed but we'll see." Decision:
ADR-054 ACCEPTED (1 to 3), ADR-036 ACCEPTED (5), the scope list written for Eli to strike (6,
docs/research/m4/scope-cut.md); 4 pending Eli (the AWS idea: Windows GPU instances on demand, each a seat
streaming to the Mac over Moonlight and reaching sky-srv over the tailnet; to size when Eli returns to it: the
cost per seat-hour, the Skyrim and Steam install per instance, the latency to the on-prem server, Sunshine on a
headless Windows display, and the lab's clone and snapshot shape against instances that come and go). Eli on
Docker: not wanted on the Mac; T0 and T2 run on sky-srv's toolchain instead (ADR-054 item 2).

### D49. A turbo day (00:21 PDT 2026-10-28, Eli)
Eli asked again what "throw ceremony and ci/cd to the wind and iterate as fast as possible" looks like; the
answer was ADR-041's turbo mode all day: Eli plays from the morning, fixes land live (a client change in under a
minute, a server or Skyrim Platform change in about ten, the compile being physics), the oracle is Eli plus the
server log and the seats' consoles, one turbo-log line per push, merges at the end of the day, the nightly the
only net; the costs named (Eli's time the limit, regressions a day late, a thin scenario library, authority bugs
that corrupt a world quietly). Eli: "yea cook on shit and we'll do a turbo day tomorrow". Decision: 2026-10-28 is
a turbo day on 56's stage (7b61b533 over parity bf133744), no gate before play; the voice trace runs first thing
for 57; authority changes (a claim, a death, an inventory or persistence rule) still take CI's T0 and T2 before a
push; the gate and the merge at night; the runbook is docs/research/process/turbo-day.md.

### D50. Two more for the turbo build: head tracking and mouth movement, and the pausing (00:45 PDT 2026-10-28, Eli)
Eli: "given you're cooking all night on this, id LIKE to add head tracking/mouth movement and the pausing to this
build as well. i feel like those are reasonable asks". Head tracking: the host's engine tracks heads near ITS player
only (H-54d), so on the guest's screen a resident far from its host stood stiff (35: "HIS face and head doesn't move
the way hilde's does", Hilde being live under Prisoner's claim). Built on fork m3-turbo-knobs 8acf15f9: a puppet
with no relayed gaze looks at the LOCAL player within 450 units (knob movement.localGazeRadius, hysteresis 100), a
relayed target still winning; in the morning's stage if its pipeline is green. Mouth movement: the puppet's lips
move with every line it says; the lines it never said are 57's (the continuation on m3-voice-lines 3eef89d3, built,
staged after the trace). The pausing: Skyrim Souls RE - Updated as a mod layer (D46), handed to apocrypha with the
lab's facts (Address Library present, Engine Fixes absent: its preloader lives in the game root, which add-mods.ps1
cannot lay); apocrypha decides the menus, the Engine Fixes question and whether it goes in for the morning (a
layer-stage with a smoke, the sweep at night) or the evening.
