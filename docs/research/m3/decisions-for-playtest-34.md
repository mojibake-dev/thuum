# Decisions for playtest 34 (2026-10-23, thuum-magnus for Eli, relayed by numidium)

Eli asked that the four limits still expected on parity a25caf02 be built before
playtest 34: headshots on bandits (the server's gear roll not yet pushed),
doors (npc-handoff), deaths (a host-made zero-health NPC alive at the floor and
the 25 s respawn; npc-fate), and a quitting host's village frozen about 24 s
(cell-host). Below are the twelve decisions those builds need, D1 to D12, each
with its options (A, B, C) and the recommendation last; then the trains' order
and size. Sources: docs/verbs/npc-fate.md (the draft's Authority and Status),
docs/verbs/npc-handoff.md (its decisions a to g, kept in brackets below),
docs/verbs/cell-host.md (the quitting host row), ADR-046 (the roll pushed to
both, already decided).

How to answer: "all recommended", or the ones to change, e.g. "D2 B, D10 C".

## npc-fate: deaths, the roll, the message (one ADR)

### D1. Who decides an NPC's death
- A. The server's number alone kills. A death the server has no number for (a
  fall, a trap, a script) leaves the actor alive at the floor, and is counted.
- B. A host's death report is accepted (R1) when the server can check its cause:
  a fall by the sample's height change, a trap by an activation the server saw,
  an NPC against an NPC by a hit the host reported with both ids, which the
  server numbers. The rest is refused and logged.
- Recommended: A now, B as the next slice. A hosted NPC's hits on other NPCs
  already reach the server through the host's report and get the server's
  number, so a fight's deaths are the server's today. What A leaves at the floor
  is the fall and the trap, rare in a village and a dungeon's first chamber, and
  each of B's checks needs a lab read.
  
  - Decision: jump right to B
  - Built (thuum-magnus, 2026-10-24 16:20 PDT, fork m3-train-44 597bb9dc,
    dd285ad9, 6e827918): the ActorDeath message (MsgType 52), the server's
    checks (the reporter simulates the actor; a hit by the named killer the
    server numbered within 3 s; a drop of 200 units in the host's samples
    within 4 s; an activation within 512 units within 5 s; essential and
    protected by the engine's rule; a script refused), the client's report at
    deathStart, npcDeathReports (false restores A), five T0 cases. ADR-048
    accepted as B. The lab read owed: x-npc-fall-report (by path) on 44's
    stage; the trap's evidence is a HYPOTHESIS (docs/verbs/npc-fate.md).
    17:10 PDT: the trap half as first built could never fire (every vanilla
    trigger activates itself, the stepping actor is never the action
    reference); fixed in 44's restage: the host forwards a trigger's own
    activation and the server notes it as the evidence. Bear traps and oil
    pools stay the floor.


### D2. The level a leveled NPC is rolled at
- A. The level of the player whose arrival loads the placement, clamped by the
  cell's encounter zone.
- B. Level 0 with every entry allowed (today).
- Recommended: A. Level 0 is what rolled a cave bear under the games' wolf; A is
  the engine's own input and keeps the species the screens expect.

- Decision: some way to calculate a middle ground? 
- Options for the middle ground (thuum-magnus, 15:52 PDT; one rule for every placement, the zone's min and max clamp all three as the engine's own clamp does; the respawn's re-roll keeps the stored level, D3, so a dungeon stays as first rolled):
  - A2. The party's mean: the mean level of the players within the fate ring (three squares) at the roll, the players online when none is near, rounded down. A level-30 and a level-1 together roll a dungeon at 15: tuned for the pair, not for whoever stepped in first. Stable while the party is.
  - A3. The party's low end: the lowest level among the same players. The level-1 never meets a cave bear because a level-30 walked in ahead; the level-30 meets wolves. The safe pick for a mixed pair, dull for the strong one.
  - A4. The world's level: a server setting (npcRollLevel, say 10), the same for everyone until the operator raises it. A designed difficulty, as a dedicated TES3MP server often runs; nobody's arrival changes it; a lone level-1 meets level-10 lists.
  - Recommended: A2, with A3 as the switch for a friends' night with a newcomer. All three are one line where PartOne sets the roll's level around the fate pass (fateLoaderLevel), behind one setting (npcRollLevel: loader | party-mean | party-min | a number), a T0 each; the pin probe reads server.fate(id).level. A slice of an afternoon, after the merge.
  - Built (16:30 PDT, fork m3-train-44 e3b39ac8): all three behind
    npcRollLevel (PartOne::FateRollLevel), party-mean the default, A3 as
    "party-min", A4 as a number, the old rule as "loader"; T0
    NpcRollLevelTest. The pick is a line in lab/deploy/sky-srv/
    server-settings.json, not a build: say A2, A3 or A4 (or a number) and
    numidium sets it.

### D3. A respawned NPC's pick
- A. Re-roll at the respawn, as the engine re-rolls a leveled placement at a cell
  reset.
- B. Keep the first roll.
- Recommended: A, the engine's behavior.

- Decision: A 

### D4. How the server's roll reaches the games
- A. A dedicated ActorFate message: the base the server rolled, sent ahead of the
  actor's attach so the engine never rolls its own; the death, the respawn and
  the loot through the existing DeathStateContainer, Teleport and OpenContainer.
- B. The existing deltas alone, the roll riding CreateActor's base and equipment.
- Recommended: A. The pin has to reach the client before the engine's roll at
  attach, which CreateActor cannot promise; one appended type with its validator
  in the same commit.

- Decision: A 

### D5. The save format
- A. formVersion 2, the fate as an added optional field (ADR-043's decision 2).
- B. formVersion 3 with a migration.
- Recommended: A.

- Decision: A

## npc-handoff: doors and passing NPCs between hosts (one ADR)

### D6. An NPC walking into a cell nobody has loaded [handoff a]
- A. The host follows its actor into a cell no game has LOADED, while its own game
  has it loaded and the destination is adjacent or a door's interior; a
  per-actor follow table answers who simulates it. ADR-035's "nobody hosts" is
  refined to "no game has loaded".
- B. Hosting on a 5x5 grid instead of 3x3.
- Recommended: A. B doubles every host's load for the same door.

- Decision: A

### D7. Flicker damping at the reach ring [handoff b]
- A. A reach-only lapse keeps the cell for GRACE_REACH_MS (15 s placeholder), and
  a candidate waits CANDIDATE_DWELL_MS (5 s placeholder) before taking it; the
  two numbers come from x-cell-attach's reads on two seats.
- B. No damping (today).
- Recommended: A, the shape accepted and the numbers measured.

- Decision: A

### D8. The NPC's state sent to a new host [handoff c]
- A. A dedicated ActorHandoff message (the record plus npc-stream's furniture,
  target and package) before HostGrant, on the same ordered channel.
- B. A widened HostGrant carrying it.
- Recommended: A, appended, the grant left as it is.

- Decision: A

### D9. Passing an NPC between two live hosts [handoff d]
- A. Per actor, through the existing UpdateHoster flip, with ACTOR_TENURE_MS
  (10 s placeholder) for the NPC that wanders along a boundary.
- B. Not now (today: an NPC stays with its cell's host).
- Recommended: A.

- Decision: A

### D10. Who hosts each cell after a server restart [handoff f]
- A. Each cell to the nearest player at the restart's first grants, arrival order
  as the tiebreak.
- B. Arrival order (today: nine cells to one game and three to the other in 20 ms;
  Eli: "weird").
- C. One host for the whole loaded set.
- Recommended: A. Fewer handoffs, and the village is one game's when both stand
  in it.

- Decision: A

### D11. A resident's record left in an unhosted interior [handoff g]
- A. The roster moves the record out of a cell nobody hosts to the sighter's cell
  (the record indoors while the engines bring the resident out; measured with
  Sigrid's record in her house).
- B. Leave it (today).
- Recommended: A. It is the other direction of the door case and needs no new
  message.

- Decision: x

## cell-host: the quitting host

### D12. How a quitting host's village hands over
Today the village belongs to a gone game for about 24 s: the connection timeout
(about 18 s) plus the 5 s grace.
- A. The server treats a host whose reports stop for a few seconds as stale and
  starts the grace at once (server-side alone, R0: a per-host stamp of the last
  report in TickCellHostsEverySecond).
- B. The client's transport sends netcode's disconnect at process exit.
- C. A shorter connection timeout for a host.
- Recommended: A first, then B if the exit path allows. A covers the crash and the
  kill as well as the quit, and a host silent for two seconds at a 130 ms cadence
  has already lost fifteen reports. B: the transport already leaves cleanly when
  the client is dropped (DestroyClient flushes the disconnect packet), but nothing
  runs it at the game's exit; the process terminates its threads before any DLL
  detach or atexit handler, so a disconnect from an exit hook needs the socket
  moved out of the poll thread, and it is blind to a crash or a kill. C drops a
  laggy player's village for nothing.
- Built ahead of the answer, not merged: train-39 implements A with a three-second
  threshold (a save's or a loading screen's stall must not pass a village); the
  lab calibrates the number, and the merge waits for Eli's answer.

- Decision: leaning towards B, that's the best practice way right? but also A as a background. 
- Built (16:25 PDT, fork m3-train-44 cf8b6007): B on top of A. The
  re-analyst read the quit path (every quit is one byte store, Main::quitGame;
  WinMain's one call to the engine's shutdown routine runs on the main thread
  with the network thread alive; the engine never calls ExitProcess), so the
  exit hook's premise in the recommendation above was wrong: Skyrim Platform
  thunks that call, tears the client down first (the disconnect datagram
  goes out, the wait bounded at 200 ms) and then runs the shutdown. A (the
  stale rule) stays the backstop for a crash or a kill. HYPOTHESIS until
  the lab's read: lab/frida/quit-path.js and x-host-quit (by path) on 44's
  stage (docs/verbs/cell-host.md, the quitting-host row).

## The deaths' four calls, made under the design law while building (2026-10-23 20:39 PDT); say the letter to change one

### D13. The reset clock's source
- A. The master's GMST iHoursToRespawnCell, read from Skyrim.esm at load, with
  a server setting npcRespawnHours overriding it for the lab.
- B. A server setting alone.
- Recommended and built: A, the engine's number. Until the GMST's record id is
  read (numidium's esm.py) the executable's compiled 72 hours stand in.

- Decision: A 

### D14. The pick at the respawn when the death item resolves to nothing
- A. Rolled anew regardless (the engine's cell reset re-rolls every leveled
  actor and resets its inventory).
- B. Today's player-path gate: keep the pick and the inventory.
- Recommended and built: A.

- Decision: A

### D15. Unique, essential and protected bases
- A. The engine's rule: a unique base stays dead; an essential base never
  dies; a protected one dies to a player's own hand alone.
- B. Every game-file actor dies and respawns alike.
- Recommended and built: A.

- Decision: A 

### D16. Looting a corpse on a seat that does not host it
- A. Any player loots under the CONT occupancy rule: the body's activation is
  blocked on every seat and the server's OpenContainer opens the menu.
- B. The host alone.
- Recommended and built: A.

- Decision: A 

### D17. The bandits' weapons (23:34 PDT): the outfit pin holds for the armor and the race on both Embershard bandits (x-npc-fate-outfit 062856), but a bandit's WEAPON is the base's own inventory list, rolled by each engine at the inventory init and never by the outfit detour, so it may differ per screen (a mace here, a sword there); the damage is the server's either way
- A. Pin the inventory's leveled roll too before playtest 34: a detour at the per-entry LVLI roll (the trace's 14751 site, under the re-analyst's read tonight) answering the server's weapon for a fated actor, the same shape as the outfit's; a few hours of agent work plus one lab read (outfit v3 is the probe).
- B. Accept per-screen weapons for 34 as a known limit (armor, helmet and race the server's on every screen) and pin the weapons in M3's next train.
- Recommended: A if 34 is a day or more away, else B; your word on the day decides it.
- GREEN at T3 (00:32 PDT): x-npc-fate-outfit v3 on 43's stage (072041), the weapons the server's on both bandits at 20 and 60 s; the pin probe green on the same stage. The only question left is the merge's place: A rides 43 with 41 and 42 into 34, B leaves it for the next train.
- Built ahead of the answer, not merged (23:56 PDT): fork m3-train-43 962fc913, stacked on 42, the 16128 detour (re-npc-roll.md section 11); its read is x-npc-fate-outfit v3 on 43's stage after 42's.

- Decision: A 

## Merge-ready (09:55 PDT, 2026-10-24)

Train-43 at de9d048e carries 39 to 42 inside it and is merge-ready by citation:
the gate set 20261024-155001-gate-m3-train-43 (the nine plus the seven
committed scenarios) all green on their last runs, T2 green at that head
(33 sessions), gate-cite's five checks passing, the stage held on the lab.
One command at your word on D12, D6, D2 to D5, ADR-049, ADR-048 and D17
(numidium's): `GATE_SET=20261024-155001-gate-m3-train-43 T2=skip just
verb-merge m3-train-43 b-npc-puppet b-cell-host b-npc-handoff-door
b-npc-handoff-restart b-npc-handoff-night b-host-kill b-npc-death b-npc-loot
b-npc-respawn`. A narrower grouping (say D12 and D6 alone) needs its own
branch's stage and gate, about two hours of lab.

## The trains, in order, with sizes

1. Train-39, the quitting host (D12): the server's stale-host rule, a T0 in
   CellHostTest with the clock margins, and a lab read (the game stopped, the cell
   passed within the grace plus the threshold). Half a day with its gate and T2 (a
   server change). BUILT 2026-10-23 13:26 PDT, fork m3-train-39 206190dc; the
   stage with T2 and the kill-the-host read are numidium's next.
2. Train-40, doors (D6, D11, D10): the client's MoveTo of an engine reference
   across cells (MayMoveActor's return, the follow table, the roster moving a
   record out of an interior), with the restart split rule; D7, D8 and D9 as a
   second slice after the playtest unless time allows. Two days with the door
   scenario (a resident through a door seen from both seats).
   BUILT 2026-10-23 14:00 PDT, fork m3-train-40 f64d556f stacked on
   m3-train-39: D6 behind the cellFollow server setting and the npcHandoff
   client key (both default on, since Eli's D6 answer is open), D10 (the
   first grants provisional for 5 s, the nearer player by grid ring), (e)
   and the client's door move; D11 needs no server change; D7 to D9 the
   second slice. The door, restart and night reads wait for the lab grammar.
3. Train-41, the roll pushed to both (ADR-046 and D2 to D5): the ActorFate message
   and its validator, the server's roll at the first loader's level, the pin at
   the engine's roll site (an RE task for the re-analyst first; the swap after the
   roll as the fallback), the record's equipment applied to the engine's actor on
   every seat. Two days plus the RE read, and the NPC headshot section passes with
   it.
4. Train-42, deaths (D1 and D3): the respawn at the placement after the server's
   reset time with a re-roll, the body persisting across a restart (the schema row
   and its restart scenario), the corpse's loot through the CONT branch. Two days.

Playtest 34 with all four: about a week of agent work with the lab, 2026-10-29 or
10-30. With the first three and deaths left as a known limit: 2026-10-27.
