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
