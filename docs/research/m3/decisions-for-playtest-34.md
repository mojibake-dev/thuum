# Decisions for playtest 34 (2026-10-23, thuum-magnus for Eli, relayed by numidium)

Eli asked that the four limits still expected on parity a25caf02 be built before
playtest 34: headshots on bandits (the server's gear roll not yet pushed),
doors (npc-handoff), deaths (a host-made zero-health NPC alive at the floor and
the 25 s respawn; npc-fate), and a quitting host's village frozen about 24 s
(cell-host). The parked decisions those builds need, each with its options and
a recommendation, then the trains' order and size. Sources: docs/verbs/npc-fate.md
(the draft's Authority and Status), docs/verbs/npc-handoff.md (decisions a to g),
docs/verbs/cell-host.md (the quitting host row), ADR-046.

## npc-fate (one ADR; decision 1, the roll pushed to both, is ADR-046's)

1. Death authority. (a) The server's number alone kills; a death the server
   has no number for (a fall, a trap, a script) leaves the actor alive at the
   floor and is counted. (b) A host's death report accepted as R1 when the
   server can check its cause (a fall by the sample's height change, a trap
   by an activation it saw, an NPC against an NPC by a hit the host reported
   with both ids, which the server numbers), the rest refused and logged.
   Recommendation: (a) now, (b) as the next slice. The hosted NPC's hits on
   other NPCs already reach the server through the host's report and get the
   server's number, so a fight's deaths are the server's today; what (a)
   leaves at the floor is the fall and the trap, rare in a village and a
   dungeon's first chamber, and (b)'s checks each need a lab read.
2. The roll's level. (a) The level of the player whose arrival loads the
   placement, clamped by the cell's encounter zone. (b) Today's level 0, every
   entry allowed. Recommendation: (a). Level 0 is what rolled a cave bear
   under the games' wolf; (a) is the engine's own input and keeps the
   species the screens expect.
3. The respawn's pick. (a) Re-roll at the respawn, as the engine re-rolls a
   leveled placement at a cell reset. (b) Keep the first roll. Recommendation:
   (a), the engine's behavior.
4. The message. (a) A dedicated ActorFate message (the base the server rolled,
   sent ahead of the actor's attach so the engine never rolls its own; the
   death, the respawn and the loot through the existing DeathStateContainer,
   Teleport and OpenContainer). (b) The existing deltas alone, the roll riding
   CreateActor's base and equipment. Recommendation: (a). The pin has to reach
   the client before the engine's roll at attach, which CreateActor cannot
   promise; one appended type with its validator in the same commit.
5. formVersion. (a) 2, the fate as an added optional field (ADR-043's decision
   2). (b) 3 with a migration. Recommendation: (a).

## npc-handoff (one ADR)

a. The follow. A host follows its actor into a cell nobody has LOADED while
   its own game has it loaded and the destination is adjacent or a door's
   interior; a per-actor follow table answers who simulates it; ADR-035's
   "nobody hosts" refined to "no game has loaded". Alternative: hosting on a
   5x5 grid. Recommendation: the follow table; the 5x5 grid doubles every
   host's load for the same door.
b. Flicker damping at the reach ring: a reach-only lapse keeps the cell for
   GRACE_REACH_MS (15 s placeholder) and a candidate waits CANDIDATE_DWELL_MS
   (5 s placeholder) before taking it. Recommendation: accept the shape, the
   two numbers from x-cell-attach's reads on two seats.
c. The keyframe. An ActorHandoff message (the record plus npc-stream's
   furniture, target and package) before HostGrant on the same ordered
   channel. Alternative: a widened HostGrant. Recommendation: the dedicated
   message, appended, the grant left as it is.
d. The pass between two live hosts: per actor through the existing
   UpdateHoster flip, with ACTOR_TENURE_MS (10 s placeholder) for the
   boundary wanderer. Recommendation: accept.
f. The split after a restart. Today the loaded cells go by arrival order
   (nine to one game, three to the other, in 20 ms; Eli: "weird").
   Alternatives: each cell to the nearest player at the restart's first
   grants, arrival the tiebreak; or one host for the whole loaded set.
   Recommendation: nearest player per cell. Fewer handoffs, and the village
   is one game's when both stand in it.
g. The roster moves a record out of a cell nobody hosts to the sighter's cell
   (the record indoors while the engines bring the resident out; measured
   with Sigrid's record in her house). Recommendation: accept; it is the
   other direction of the door case and needs no new message.

## cell-host: the quitting host

The village belonged to a gone game for about 24 s: the connection timeout
(about 18 s) plus the grace. Options: (i) the client's transport sends
netcode's disconnect at process exit (renet's disconnect packets from
wire-client-ffi, at the plugin's unload or an atexit), so the server drops
the user at once and the grace alone remains; (ii) a shorter timeout for a
host; (iii) a host whose reports stop for two seconds is treated as stale and
the grace starts early. Recommendation: (i), correct by design and small, the
timeout and grace unchanged; (ii) drops a laggy player's village for nothing.

## The trains, in order, with sizes

1. Train-39, the quitting host: the disconnect at exit (Rust, wire-client-ffi)
   and a lab read (a quit, the drop within a second, the grace alone). Half a
   day with its gate.
2. Train-40, doors: npc-handoff's (a), (g) and the client's MoveTo of an engine
   reference across cells (MayMoveActor's return, the follow table, the roster
   moving a record out of an interior), with (f) the split rule; (b), (c) and
   (d) as a second slice after the playtest unless time allows. Two days with
   the door scenario (a resident through a door seen from both seats).
3. Train-41, the roll pushed to both (ADR-046 decision 1 and npc-fate's 2 to
   5): the ActorFate message and its validator, the server's roll at the
   first loader's level, the pin at the engine's roll site (an RE task for
   the re-analyst first; the swap after the roll as the fallback), the
   record's equipment applied to the engine's actor on every seat. Two days
   plus the RE read, and the NPC headshot section passes with it.
4. Train-42, deaths: npc-fate's decision 1 (a), the respawn at the placement
   after the server's reset time with a re-roll, the body persisting across a
   restart (the schema row and its restart scenario), the corpse's loot
   through the CONT branch. Two days.

Playtest 34 with all four: about a week of agent work with the lab,
2026-10-29 or 10-30. With the first three and deaths left as a known limit:
2026-10-27.
