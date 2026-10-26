# Verb: cell-host

Drafted 2026-10-21 (M3's first verb, docs/PLAN.md, the M3 section) from
ADR-035 (docs/DECISIONS.md:1202-1338) and docs/research/m3, before any code.
The cut (rule 3): this verb is ADR-035's points 2, 3 and 8, the lazy half of
9 (the loader's switch) and the server half of 1 (an NPC known by its own
form id). The server elects a cell's host, keeps it through a grace window,
hands it to the lowest round trip on leave, fences every grant with an
epoch and freezes a cell nobody has loaded; the host's game streams the
cell's NPCs through the relay SkyMP already runs for hosted actors. The
second verb, npc-puppet, takes point 4 (AI off, the animation pass put back,
the movement step skipped, combat stopped: re-ai-puppet.md Q2) and the
client half of point 1 (the cell's own references kept, the cleaner and the
PlaceAtMe copies retired, the loader's humanoid ban lifted); npc-stream
takes 5, npc-handoff 7, npc-fate 6 (the ADR's consequences, :1330-1332).

## Intent

One player's game runs a cell's NPCs and the server knows, for every cell,
which game that is: the first to load it, kept while it stays, passed on
leave after about 5 s to the remaining visitor with the lowest round trip,
every grant fenced by an epoch, and no game at all when nobody has the cell.

Roadmap reference: skymp/ROADMAP.md "NPC" (make host change work) and
"Physics" ("implement a host switching mechanism"), skymp-hosting.md:440-447.
Milestone: M3   Class: B

## Inventory (ADR-031: the action's consequences, before its rung)

The action is "a game loads a cell with NPCs; a second game arrives; the
first leaves". The engine alone, from the references (r-npc-packages,
r-cell-leave; readings-2026-10-17.md and -18.md) and the records
(riverwood-ids.md):

| consequence | seen in | disposition |
| --- | --- | --- |
| the cell's NPCs run their packages: walks, work idles, dialogue (Alvor's forge, Sigrid's hoe, Hod's lever; nine of fourteen moved, readings-18:21-34) | trace r-npc-packages 20261019-021451 | native: the host's engine, under the grant |
| the schedule switch at 8:00 (Hod back to the mill, readings-17:39-43) | trace | native on the host; the clock is the server's (docs/verbs/time.md) |
| a persistent NPC walks between cells (Embry through the inn door, readings-18:36-43); every named resident lives in an interior and walks out (riverwood-ids.md:10-14) | trace, record | native on the host; the server accepts the cell change from the host of the destination cell (Server, the cell-change rule); into a cell another player hosts: later, npc-handoff |
| the engine keeps a left cell's schedules going in low process (Hod moved while the player was in the inn, readings-17:51-59) | trace r-cell-leave 20261017-083700 | suppressed on the server: an unhosted cell freezes at its record and no game may report it (ADR-035 point 8); the old host's local divergence is replayed over at the next grant: later, npc-handoff |
| the cell's references attach and detach at a load (TESCellAttachDetachEvent, TESCellFullyLoadedEvent) | record (Engine surface) | native; the fully-loaded moment is this verb's report (Observe) |
| two games each running the same NPC's AI on their own copies (skymp-hosting.md:27-34, 288-298) | code | later: npc-puppet; this verb keeps SkyMP's copies and observer shape (KeepOffsetFromActor plus translateTo, formView.ts:460-536) |
| the engine's own NPCs deleted by every client (worldCleanerService.ts:37-108) | code | later: npc-puppet (ADR-035 point 1); unchanged here |
| named residents and humanoid bandits never loaded (WorldState.cpp:476-584: dead, disabled, npcEnabled, essential or protected or unique, crime factions 0x26953, the banned races) and the lab's npcEnabled off (lab/tools/playtest-start.sh:12) | code | imposed: npcEnabled on, on a probe-only lab setting (ADR-035 point 9), so creatures load; the ban lists stay until npc-puppet can show a humanoid right |
| a leveled base rolled per game (formView.ts:156-160) | code | later: npc-fate (point 6: one roll per cell, by the server) |
| a death respawning after 25 s at the editor location (MpActor.cpp:1941; a record loaded dead respawns, :829) | code | later: npc-fate |
| the host's own reports echoed back to it (RelayToListeners, ActionListener.cpp:108-118; the double play, skymp-hosting.md:309-315) | code | suppressed: the relay skips the host for its hosted NPCs (Suppress) |

### Sequences and combinations (ADR-033)

| sequence or combination | probe or scenario | result |
| --- | --- | --- |
| the host steps out and back inside the grace: a door (an interior detaches at once); an exterior boundary (a cell leaves the loaded set only two grid cells away) | b-cell-host | green 20261021-201430 (the exterior case, two cells east and back in 3.7 s: still c1 at epoch 1); the door's case is x-cell-attach's measurement (the exterior stays loaded in the inn, so the grace comes from the grid moving to the interior) |
| the host leaves for longer than the grace; disconnects; relaunches | b-cell-host | green 201430: epoch 2 to c2 past the grace with the release printed in c1's game; unhosted at epoch 2 six seconds after c2's game is gone; the relaunched game hosting at epoch 3 |
| two games load the cell in the same tick; both leave together (the freeze) | b-cell-host (c1 and c2 teleport in one step) | green 201430: the double entry grants once (epoch 2); both out leaves it unhosted; the predator's record equal over 10 s with nobody in reach |
| a player teleports in (no walk); a game still loading (docs/research/load-freeze.md) reports nothing and gets nothing | x-cell-attach | green 185728 (the coc's 25 cells fire within 2 ms once loaded, nothing before); b-cell-host's teleports grant within the next report |
| a game crossing an exterior boundary back and forth at a person's rhythm (no grant churn: the loaded set has the engine's hysteresis) | x-cell-attach | green 185728: five cells fire per one-cell shift, the far column detaches one cell later than it attached (the 5x5 against the 3x3), no cell fired twice while loaded; with a second seat on the other side of a boundary the reading did not hold: the grant flickered between the two games at the edge (b-npc-puppet 2026-10-22; npc-handoff's flicker damping, decision b) |
| an NPC crossing into a cell the same host holds; into a cell another player holds | b-cell-host; later npc-handoff | the same host's case is CellHostTest's first case (the wolf 4500 units into a cell the host holds, accepted; into an unhosted cell, dropped); the other player's case is npc-handoff's |
| a server restart with both seats in the cell (hosts rebuilt from the clients' reports) | b-cell-host | green 201430: a grant within 10 s of the reconnects at epoch 1 |
| an exterior cell loaded by two players standing in neighbouring cells (first wins) | b-cell-host | green 201430: the second visitor gets nothing at epoch 1; the first loader keeps it |

## Authority

Rung: R0 for the host, the epoch, the grace and the freeze; R1 for a
game's "I have this cell loaded"; R2 for which cell an NPC is in.
- The server decides who hosts (ADR-035 point 2): the first game to report
  the cell fully loaded, among the games whose interest grid holds the cell
  (SkyMP's 3x3 chunks of 4096 units, MpObjectReference.cpp:152-155 and
  Grid.h:75-95 on ef44a1d8, skymp-hosting.md:170-176; a chunk is one
  exterior grid cell). TES3MP's first loader (tes3mp.md:33-34) without its
  40 ms takeover (:35-37; ADR-035: hosts never churn).
- The epoch is a fencing token (Kleppmann 2016; Burrows, OSDI 2006): one per
  cell, up at every grant, on every grant, release and host record; an older
  epoch is dropped (ADR-035 point 3; Skyrim Together's PR 887, te-npcs.md:
  75-76, 240-243).
- A loaded report is the client's word (rule 5): validated by shape and
  budget; a cell the server's grid does not give the sender yields no grant,
  so a forged report costs a token and nothing else.
- An NPC's cell is its record (R2), written from the host's accepted
  movement under MovementValidation's bounds (same cell, under 4096 units a
  report, MovementValidation.cpp:96-101; no speed budget for NPCs,
  docs/verbs/movement-speed.md:29-30), plus this verb's cell-change rule.
Why not R1 for the host: a game cannot see who else has the cell, nor
anyone's round trip; TES3MP and Skyrim Together both keep the stamp on the
server (tes3mp.md:45-47; te-npcs.md:56-58).
Rate limit / bounds: CellLoaded 128 at once, 32 a second after (MEASURED
on b-cell-host 20261021-184501, fork c0e4a029: the save's load fired 30
loaded reports within 14 ms, a teleport five cells away 25 unloaded and 25
loaded within 60 ms, loads and unloads sharing the bucket; the first bucket
of 32 then 8 refused the landing cell's own report, E_VAL_RATE, which no
client retries, so the server never learned the host had it; the bucket is
sized to the engine's bursts and carried with those numbers, ADR-033 point
5, fork a591bdeb); GRACE_MS 5000; the host's stream keeps its own budgets.

## Engine surface

- The cell: RE::TESObjectCELL, EXTERIOR_DATA cellX and cellY (CommonLibSSE-NG
  include/RE/T/TESObjectCELL.h:45, :58-59), GetCoordinates (:200),
  IsExteriorCell and IsInteriorCell (:210-211), cellState with kAttached 7
  (:139, :259). An exterior cell's id is its CELL record's (Riverwood 0x9732
  at (4,-12), riverwood-ids.md:37-41).
- The load moment: RE::TESCellFullyLoadedEvent { cell }
  (include/RE/T/TESCellFullyLoadedEvent.h:7-11) and
  RE::TESCellAttachDetachEvent { reference, attached }
  (include/RE/T/TESCellAttachDetachEvent.h:10-13). Skyrim Platform sinks
  both (skyrim_platform/EventHandler.h:32-33, registered :471-473) and
  publishes cellFullyLoaded with the cell (skyrimPlatform.ts:633, payload
  :164-166) and cellAttach and cellDetach with the reference only (:756-760,
  :364-366); Cell.isAttached() (:2428 and following) reads kAttached;
  ObjectReference.getParentCell (:1921). ADR-034: the engine's event, no
  hook of ours.
- Address Library IDs: none for this verb. The AI switches are npc-puppet's,
  resolved in re-ai-puppet.md by `just addr`: EnableAI 37504 clears
  kProcessMe (Actor.h:160; Actor.cpp:230, :741) and drops the actor from the
  animation stage (41370, 41466), CONFIRMED-STATIC, the freeze measured
  (x-npc-puppet 20261017-082859, 20261019-022024); the movement step 37356
  and the combat manager are not gated, measured (the slide, the fight with
  AI off); EvaluatePackage (Actor.h:523; Actor.cpp:249) and
  StopCombatAndAlarmOnActor 41340 (ProcessLists.h:47; ProcessLists.cpp:108)
  with the promote and demote order an open question of npc-puppet's
  (re-ai-puppet.md Q4, its doc's H5). Cited so the cut is explicit.
- The hostable set, a lead only (ADR-005): Skyrim Together's boundary is the
  high process list, ProcessLists::GetSingleton and highActorHandles
  (ProcessLists.h:36, :69; te-npcs.md:277-281). Not used here: the host's
  stream covers the server's NPCs by their views.
- MEASURED (x-cell-attach 20261021-185728, solo, fork c0e4a029, the
  driver's cell-events steps): cellFullyLoaded fires once per cell, 25
  exterior cells within 2 ms at the coc into Riverwood (plus one
  runtime-created exterior cell with an 0xff id, which carries no map
  square and should be skipped by the client), the five cells of the new
  column at each one-cell shift east (44.5, 58.4, 72.2 s), the interior
  0x133c6 once at the inn's door, and at the coc back out five cells then
  twenty-four more half a second later; no cell fired twice while loaded.
  isAttached() read every 250 ms turned false for the far column within
  one sample of its cellDetach events (cellDetach fires per reference, 1
  to 430 a cell); the spawn's cells detached at the coc and were reported
  unloaded. The player's parent cell read 0x9732 at (17225, -47204) and
  0x9731, 0x9730, 0x972f, 0x972e along y about -48000: floor on both axes,
  as cell_of has it (truncation would have read row -11). The bursts size
  the CellLoaded budget (Authority).

## Observe (host or acting client sees the intent before the engine acts)

- Hook point: Skyrim Platform's cellFullyLoaded; once a second, isAttached()
  of each cell reported loaded (a handful of cells, no per-frame work; rule
  9 met without a native filter).
- SP filter: none needed (one event per cell load).
- Data captured: the cell's form id, interior or exterior, the attach state;
  sent as CellLoaded { cell, loaded }.
- Side effects of hooking here: none seen in x-cell-attach 20261021-185728
  (131 s of events and 250 ms reads over 66 cells, the game unchanged).

## Impose (observers render the server's decision)

- Mechanism: HostGrant { cell, epoch } to one client; HostRelease { cell,
  epoch } to the old host. The client's HostService keeps { cell: epoch }; a
  view's NPC is "hosted here" when its copy's parent cell is in that set,
  which is what storage['hosted'] answered per actor (remoteServer.ts:
  153-179 on ef44a1d8; formView.ts:450-464, 515-532 on t31 9ad635cd). The
  hosted actors' stream is SkyMP's own: movement every 130 ms, animation,
  hits and casts (sendInputsService.ts:111-153, 216-252; hitService.ts:
  17-41; magicSyncService.ts:62-64).
- Visual without simulation achieved by: nothing new; observers keep today's
  shape for a hosted NPC (formView.ts:466-536) until npc-puppet.
- Side effects: a grant clears the view's keep-offset and re-enables default
  animations as HostStart does today (formView.ts:460-464). Whether the
  host's own set of actors equals the server's for the cell (H6) is
  npc-stream's row, measured there with the stream's actor set; this verb
  computes both sides from one CellOf, so a gap would be a copy the view
  lacks, not an election fault.

## Suppress (engine's own behavior blocked on non-hosts)

- What is suppressed: the per-actor ask and grant. tryHost and
  hostAttempts.ts (formView.ts:472-479, 525-532, 768-782), Host (MsgType
  14), HostStart (26), HostStop (27) and OnHostAttempt's 2 s lapse
  (ActionListener.cpp:2143-2236) retire from senders; the ids stay in the
  table (append-only, ADR-012). The echo: RelayToListeners skips the sender
  for an NPC it hosts (:108-118), as OnUpdateAction already does (:318 on
  ef44a1d8). A report for an NPC in a cell the sender does not host is
  dropped (ActorUpdatableBy, :58-106), with a log line this time
  (docs/verbs/validation.md:34-35).
- How: the server's gate; the client's HostService.
- Release condition: HostRelease, or the connection's end.
- Side effects: none seen in b-cell-host 20261021-201430 and 201045 (the
  host's game ran the cell's copies, left, came back and relaunched without
  a crash once a copy is disabled before its delete); H6 and H7 (the
  host's set, each relayed animation played once) are npc-stream's rows.

## Message contract

- HostGrant and HostRelease, server to one client, reliable: thuum messages
  in the SkyMP family's shape, MsgType 48 and 49 and so ids 56 and 57 (the
  family's rule id = MsgType + 8, wire-schema lib.rs's test
  skymp_wire_ids_are_msg_type_plus_offset), fields { cell: u32, epoch: u32 }
  (wire-schema skymp.rs, built 2026-10-21 on fork m3-cell-host). The M0
  rows 7 and 8, { cell: FormId } with no sender, stay reserved and dead as
  ReservedHostGrant and ReservedHostRelease (ADR-012: ids are append-only).
  Idempotent per (cell, epoch). validate_server (the shape, both sides): a
  cell and an epoch above 0. The monotonic rule, a grant or release whose
  epoch is not above the last seen for that cell in this connection is
  ignored (TES3MP's late-grant desync, tes3mp.md:194-196; Skyrim Together
  ignores a stale epoch, te-npcs.md:70-71), is the client's HostService's,
  since the stateless validator keeps no per-cell state; the epochs clear at
  Welcome, a restarted server counting from 1 again.
- HostedActorState, id 5, host to server, ReliableUnordered today
  (channels.rs:38), fields { actor, transform, health, inventory_delta }
  (lib.rs:227-242), validated at wire-validate lib.rs:557-566 (transform,
  finite health, no zero delta); the `epoch: u32` field and the rule "the
  sender hosts the actor's cell at this epoch" (the core's, through
  accepts; the stateless validator can check only epoch above 0,
  E_VAL_RANGE) go in with npc-stream, which gives the message its sender
  and moves it to Unreliable (ADR-035 point 5): a field no sender fills and
  no validator path reads would be dead wire (rule 4), so this verb leaves
  the message as it is (decided 2026-10-21 07:15).
- CellLoaded, new, id 55, MsgType 47, client to server, ReliableOrdered (a
  load then an unload keep their order), cap 16 bytes, fields { cell: u32,
  loaded: bool } (built 2026-10-21). Validator: the budget above as
  wire-validate's cell_loaded_budget (128 at once, 32 a second since
  a591bdeb; E_VAL_RATE), a
  cell of 0 refused (E_VAL_RANGE), nothing more about the cell, since the
  election checks the server's own grid; idempotent (it sets a bit). The C++
  side: CellLoadedMessage, HostGrantMessage, HostReleaseMessage
  (skymp5-server/cpp/messages), MsgType 47 to 49, PacketParser's case to
  ActionListener::OnCellLoaded; two fixtures each in wire-json.
- The legacy stream for hosted NPCs (UpdateMovement 2, UpdateAnimation 3,
  OnHit 17, SpellCast 23) keeps its bytes and budgets; the gate changes.
- Byte caps re-derived, `just wire-header-check`, docs/WIRE.md:121 and
  172-175 updated in the same commit (rule 4). No JSON form (WIRE.md:128);
  TypeScript reads them through the ffi export (ADR-012).

## Server

- Where the logic lives: wire-rules `cells` (Rust, ADR-010; hostility.rs's
  shape: facts in, verdicts out, a monotonic clock in ms). Facts: Loaded
  { player, cell, now }, Unloaded { player, cell, now }, Gone { player, now }
  (PartOne.cpp:609-632's disconnect, which releases nothing today,
  skymp-hosting.md:111-114), Reach { player, cells } (the server's 3x3 for
  that player), Rtt { player, ms } (renet 2.0.0's RenetServer::rtt(client),
  seconds as f64, the smoothed ack round trip (remote_connection.rs:444-465,
  an EWMA 0.875/0.125), exposed as wire-transport Server::client_rtt_ms
  (None unless connected; try_from_secs_f64, no `as`), mirrored in
  wire-bridge beside client_ip, read in C++ as IServer::GetRttMs(userId)
  through WireServer's clientsByUser table (WireServer.cpp:191-229). Built
  2026-10-21 (fork m3-cell-host f2b59a33): wire-bridge Server::client_rtt_ms
  (-1 while unknown), IServer::GetRttMs with that default, WireServer's and
  the combined server's, PartOne::SetRoundTripSource installed by
  ScampServer and read every cell-host tick; CellHostTest's third case ranks
  two visitors by it. CONFIRMED and fixed on the way (docs/research/
  transport-clock.md, fork wire-renet-clock cb6bedee, merged into this
  branch 1c21308a): wire-transport's polls called transport.update(dt,
  renet) and never renet.update(dt) (lib.rs:330, :582), so renet's
  connection clock stood at zero, every rtt read 0 and no lost reliable
  packet was ever resent (reliable.rs:112-113); a loopback T0 fails without
  the fix), Tick { now }. Decisions: Grant { player, cell,
  epoch }, Release { player, cell, epoch }, Unhosted { cell }. Rules: a cell
  with no host goes to the first player with it loaded and in reach (either
  fact may come second: the game loads a 5x5 while the grid is a 3x3, so a
  cell is often loaded before it is reached, and Reach is a fact with
  decisions too, built 2026-10-21 07:00, fork 8f17d7a4), epoch plus one;
  the host's Unloaded, its Reach dropping the cell, or Gone arms GRACE_MS;
  loaded and in reach again before the deadline disarms it (a Loaded while
  out of reach disarms nothing); at the deadline the visitors with the cell
  loaded and in reach rank by Rtt, lowest first, earliest Loaded on a tie:
  the first gets Grant, the old host Release; none: Unhosted, epoch kept.
  Queries: host_of(cell), accepts(cell, player, epoch), epoch_of(cell).
- The core (C++, legacy): `hosters` (WorldState.h:257) and
  lastMovUpdateByIdx's host role retire; ActorUpdatableBy (ActionListener.
  cpp:58-106), GetActorToSendTo (MpActor.cpp:527-528: Teleport, ChangeValues,
  the death state, snippets; DelegateToHost PapyrusActor.cpp:189-195) and
  UpdateHoster (MpObjectReference.cpp:736-737) resolve through
  host_of(cell_of(npc)). cell_of: the record's worldOrCell for an interior
  (a CELL); for an exterior (a WRLD) the CELL at (worldspace,
  floor(x/4096), floor(y/4096)) through libespm's index of every exterior
  CELL's XCLC, built at load (Browser.cpp:297-313, the key
  NavMeshKey(world, grid); FindExteriorCell Browser.cpp:106-115, by load
  order CombineBrowser.cpp:110-125, the last file winning), exactly as
  GetParentCell resolves it (PapyrusObjectReference.cpp:815-834, floor, the
  2026-10-04 NATIVES decision); a null LookupResult means no CELL at that
  square in any file: unhostable, not 0. The server's own 4096-unit chunks
  truncate toward zero (MpObjectReference.cpp:152-155), a neighbourhood
  heuristic that stays as it is; cell_of floors, as the engine's grid does
  (cell -1 spans -4096 to 0). MEASURED 2026-10-21 (Skyrim.esm's XCLCs
  through lab/esm.py on sky-srv): Tamriel's persistent CELL 0xd74 sits
  directly under WORLD_CHILDREN with an XCLC of (0, 0) and the persistent
  flag, beside the map's 0x99a2 (BleakwindBasinExterior01) at the same
  square; libespm's index assigned by file order and the map's cell came
  later, which a plugin overriding the persistent cell would have undone
  (CombineBrowser asks the last file first), so the index now takes only a
  cell inside an exterior sub-block (fork 29a7b56e), pinned by EspmTest
  (the origin 0x99a2, the T2 spawn's (32, -15) 0xbbb1, an empty square).
  The cell-change
  rule: a hosted NPC's report naming another cell is accepted when the sender
  hosts the destination and the origin is unhosted or the sender's
  (MovementValidation.cpp:96-101 relaxed for that case alone, logged);
  otherwise dropped, npc-handoff's row. isHostedByOther never reached the
  client's copy of an ESM actor (u32 refr_id, skymp.rs:426, against
  CreateActor's u64, :1159; skymp-hosting.md:149-166): the client's
  engine-reference branch dropped the flip, so as merged the host never
  reported a game-file actor and playtest thirty's wolves spun on every
  screen (docs/verbs/npc-puppet.md, "Why now"); npc-puppet retires the
  property for them and derives the host's role from the grant alone.
- DB fields / migration: none; cell hosts live in memory.
- Restart behavior: every cell unhosted at start; each client re-sends its
  loaded set after Welcome and the election runs again. NPC records stand as
  today (saved at most every 30 s, MpObjectReference.cpp:1355-1360 on
  ef44a1d8).
- Lab setting: `npcEnabled: true` on a probe-only server-settings file
  (ADR-035 point 9); npcSettings left unset, so its parser's two bugs stay
  out of the way (skymp-hosting.md:341-350).
- Papyrus natives touched: none (ledger unchanged).

- A hosted actor's activation (playtest 32, 2026-10-22). The host's client
  reports an activation by an actor it hosts as that actor's (the caster's
  host must be the sender, ActionListener::OnActivate), and the server
  records it (a door's state, a furniture's occupant). The reply that
  performs a player's own activation in its game (OpenContainer, which the
  client answers with refr.activate(player) because it blocked the player's
  activation and waited for the word) went out through GetActorToSendTo,
  which hands an offline actor's messages to its cell's host: when a
  resident sat on Riverwood's bench 2ad10 by package in rotfern's game, her
  game activated the bench with her own player and she sat ("rotfern sat
  down on a bench all on her own"; her own activation then followed each of
  the resident's at 01:21:23Z and 01:24:44Z, answered "occupant is another
  object and is nearby"). Since train-34 1db977ed (fork parity 7e59c32c, 2026-10-22 21:40 PDT) the
  reply goes only to an actor with a user; CellHostTest's case covers a hosted sitter
  at a bed. Teleport and ChangeValues keep the host route (the host's game
  must apply them to its actor).
- A host that quits (playtest 32, 2026-10-22, numidium's section 6): test 2's
  game stopped at 02:31:36Z while it held Riverwood; the server dropped the
  user at about 02:31:54Z (the connection timeout) and the cell passed at
  the grace, 02:32:00Z. For about 24 s the cell belonged to a game that was
  gone: its residents froze on the other screen, nobody's to move. Since
  train-39 (fork m3-train-39 206190dc, 2026-10-23 13:26 PDT) the server reads
  each connection's silence itself (R0): the wire transport stamps every
  received message per client (Server::client_silence_ms, IServer::GetSilenceMs
  through the combined server), and TickCellHosts marks a user silent for
  kStaleHostMs stale (cells.rs stale: every cell it hosts starts its grace at
  that tick, it is no candidate anywhere, its loaded set and reach kept) and a
  user heard again revived (cells.rs revived: each loaded cell considered anew,
  a running grace of its own disarmed, a free cell granted). A killed, crashed
  or quit game therefore passes its cells in kStaleHostMs plus a tick plus the
  grace, about eight to nine seconds, with no disconnect needed; netcode's
  timeout still ends the connection later. The client's disconnect at exit
  (option i of docs/research/m3/decisions-for-playtest-34.md) stays a later
  row: the process ends its threads before any exit hook could flush one, and
  it is blind to a crash or a kill. HYPOTHESIS on the number alone:
  kStaleHostMs 3'000 is twenty-three missed reports at the client's 130 ms
  cadence and past a save's or a loading screen's stall of a second or two;
  the lab read (the host's game killed with both seats in Riverwood, the
  cell's host read every second) measures the pass and a loading screen's
  silence calibrates it. CellHostTest's case: the silent host's cell passes
  at the grace with no disconnect, the revived host is a candidate again, a
  host heard again inside its grace keeps its cell at the same epoch;
  wire-rules and wire-transport carry their own tests.
  MEASURED by x-host-kill 20261023-205837 on train-39's stage (numidium's
  read): c1's last report about 21:01:08.4Z, "silent 3701 ms, stale" at
  21:01:12.1, the release and c2's grant at epoch 2 at 21:01:17.1 (8.7 s
  after the last report, 5 s before netcode's disconnect at 21:01:22.2),
  c2's Alvor and Hilde AI on, the relaunched c1 taking nothing back; and the
  number's false positives: three live silences of 3.1, 3.5 and 3.1 s, all
  at a game's first loads after a login (the first teleport after connect,
  a relaunched game's login), none at the four mid-session loading screens
  (Bleak Falls Temple and back on each seat), no grant changed hands on
  them. kStaleHostMs is 4 s from train-39's next commit (2b14f213, local
  until the stage is free), which clears all three; a login-time blip costs
  a second of candidacy at most, since revived disarms the grace.
  Second read, x-host-kill 20261023-214420 on 2b14f213 (4 s): the pass 9.4 s
  after the last report (stale at 4.4 s, the grace), the disconnect 4.4 s
  later; and 4 s still tripped at each seat's first load after its login
  (4.5 and 4.8 s, n=5 across the two runs: 3.1 to 4.8), never mid-session,
  never moving a grant. Two changes (fork m3-train-39 f88cd50d, carried by
  m3-train-40 92529f31): the silence is the smaller of netcode's time since
  any packet (renet_netcode's time_since_last_received_packet: a keepalive
  counts, so a game whose network tick runs while its world loads is heard;
  the client's tick rides Skyrim Platform's tick event, so during a load it
  likely stalls too, HYPOTHESIS the next read settles) and the time since a
  message; and only a host is marked stale, since a login's first loads come
  before any grant and a silent visitor hosts nothing to pass on. The
  threshold stays 4 s.
  Third read, x-host-kill 20261023-221644 on train-40's stage 92529f31 (the
  two changes carried): no stale line at either login; the kill's alone,
  "silent 4032 ms, stale" and the pass at epoch 2 about 9.0 s after c1's
  last report, the disconnect 4.6 s later. The row's number is MEASURED and
  its login blips closed. Carried in train-40 a5e431e2: T2 green (33 sessions), the gate set
  GREEN 9 of 9 (run set 20261024-044200-gate-m3-train-40, 22:13 PDT) and
  x-host-kill green on 92529f31 with the rule unchanged since; the merge
  waits on Eli's D12 alone (a restage first if 41's stage has replaced the
  gate's, as agreed with numidium). The row's committed T3 (23:04 PDT, main
  1cb745d1, its own commit): lab/scenarios/b-host-kill.yaml, x-host-kill's
  shape with the timing claimed: the kill through `relaunch {until:
  stopped}` (lab-api 0d3dd4d3, the step back at the kill with nothing told
  to the server) and `until: {within: 12, expect: [server.host(0x9732).client
  == "c2"]}`, which the timeout's 24 s would miss; first run GREEN
  (20261024-065333 on 42's stage, lab-api 0d3dd4d3, 00:00 PDT): the pass 7.0 s
  after the kill (8 polls), c2 hosting and running 0x13482 and 0x35534, still
  the host after c1's return and both seats' loading screens. D12's number
  stands at T3; green again in the citable set (162052, gate-m3-train-43 155001
  on de9d048e, 09:55 PDT).
  D12's B built (train-44, fork m3-train-44 cf8b6007, 2026-10-24 16:25 PDT;
  Eli, 15:49 PDT: "leaning towards B, that's the best practice way right? but
  also A as a background"): the client disconnects at the game's own quit.
  The re-analyst's read of the quit path (REA on sky-re, 16:00 PDT,
  CONFIRMED-STATIC for the instructions): every quit is one byte store,
  Main::quitGame (CommonLibSSE-NG include/RE/M/Main.h:77; Main::Singleton
  403449, the byte at +0x10), by the console's QuitGame (22896), the main and
  system menus' QuitToDesktop callbacks (52119, 53265, nine bytes each), the
  window procedure's WM_DESTROY case (36649; Alt-F4 and the title bar's X
  reach it through DefWindowProc) and Skyrim Platform's own exitProcess;
  WinMain (36544) tests the byte after each Main::Update (36564) and makes
  one call to the shutdown routine (36551) at WinMain+0x1ae, on the main
  thread, with our network thread (wire-client-ffi's std::thread, no
  engine's) alive through the whole teardown; the engine never calls
  ExitProcess (the CRT's exit does after WinMain returns), and no SKSE
  message marks the quit. Skyrim Platform's thunk on that call (Hooks.cpp
  OnQuitShutdown, write_call<5> at Offsets::Hooks::QuitShutdownCall, AE only)
  tears the client down first (MpClientPluginApi::DestroyClientAtQuit, only
  when a client was created) and logs the cost, then runs the engine's
  shutdown; the call site read again through REA on 2026-10-24 16:57 PDT
  (thuum-magnus): 0x14063eb1e inside WinMain 0x14063e970 decodes as `CALL
  0x140641c60`, bytes e8 3d 31 00 00, five bytes, reached by the conditional
  jump from 0x14063eb08 (the quitGame test), so write_call<5> fits the
  instruction exactly (CONFIRMED-STATIC); the teardown's wait for the network thread is bounded at 200 ms
  (wire-client-ffi shutdown: Close, the disconnect datagram, one last poll,
  normally 5 to 10 ms; the handle dropped past the bound), so a wedged socket
  never hangs the quit. Expected: the server's ClientDisconnected and the
  cell's pass inside the same second as the quit, ahead of the 4 s stale
  line. HYPOTHESIS until the lab's read (rule 2): lab/frida/quit-path.js
  stamps Main::Update's first frame with the byte set, the shutdown call's
  thread, time and caller, DestroyClient's entry, return and cost, and
  ExitProcess; lab/.cache/probes/x-host-quit.yaml (by path, for 44's stage)
  quits c1 through the console (qqq) while it hosts Riverwood and claims
  c2's grant within 4 s. What would falsify it: a quit reaching ExitProcess
  with no shutdown entry (a GetProcAddress'd ExitProcess), the callbacks on
  another thread, the datagram sent and no ClientDisconnected, or the
  teardown past 200 ms. The stale rule stays the backstop for a crash or a
  kill (A as the background, Eli's words).
  MEASURED by x-host-quit 20261025-004815 on 44's stage 154ca7d4 (numidium's
  read, 17:50 to 18:00 PDT): the trace holds the premise, the quit flag's
  frame and the shutdown's entry on one thread (3928, the main thread),
  DestroyClient entered at the flag and left 5 ms later from the thunk
  (caller SkyrimPlatformImpl.dll), the shutdown entered at +5 ms from
  WinMain+0x1b3; c1.log's production line "[verb:cell-host] quit: the
  client disconnected in 4 ms; the engine's shutdown follows". The server's
  "WireServer: user 1 left (connection terminated by the transport layer)"
  read 3.4 s after the flag until the clocks were paired: the seat's clock
  runs about 3.42 s behind sky-srv's (numidium's agent, 18:50 PDT: the pcap
  on sky-srv holds c1's netcode Disconnect datagram, prefix 0x26, sequence
  0x4ee7 after the last payload's 0x4ee6, at 01:29:30.7328 in run 012653,
  sent inside DestroyClient, which ran 18:29:27.308 to .313 on c1, so 3.416
  to 3.425 s; nine roster pairs in that run 3.412 to 3.422, seven of eight
  in 004815 3.417 to 3.422; a first read of 3.26 s came from one host-grant
  pair taken during a cell-load hitch), so the leave came about 5 ms after
  the quit flag: the "left" line 0.2 ms after the datagram, one datagram as
  the code says (renet_netcode 2.0 sends exactly one netcode Disconnect
  packet synchronously, client.rs:49-62; renetcode's server drops the
  client on it at once, server.rs:411; a lost one would mean the 15 s
  timeout). The reason text, renet's DisconnectReason::Transport, is the
  same for a Disconnect packet and a netcode timeout, so the pcap is what
  proves the packet; no "silent ... stale" line either way. The grant to
  c2 ("ff000001 hosts cell 9732 at epoch 2") 5.383 s after the leave,
  GRACE_MS 5000 plus the once-a-second tick's phase. The probe's own claim
  was wrong: the pass waits the grace, and the quit step returns before the
  driver types qqq and Enter (0.2 to 1 s), so the grant lands about 6 to 7 s
  after the step; v4 claims the leave line within 6 s (lab-api's server
  log-count fact, numidium) and the grant within 12. The trace's shutdown
  leave and exitProcess lines are missing because the crash happens inside
  the shutdown, not because the tail was lost; the crash logs of 012653 and
  013410 are identical apart from ASLR (the same 187 modules and registers,
  RCX = RBX+0x127490 in both, the process's initial thread). Their probable
  stack's frame [8], SkyrimPlatformImpl.dll+0x54fab0, reads by position as
  Skyrim Platform's own HookedWinMain return site (tilted/reverse/
  Entry.cpp:23-42), not the thunk; the thunk's own frame is absent, which
  is what a tail call leaves (`return func(...)` compiled as a jump,
  HYPOTHESIS; harmless, and the trace shows the thunk ran). A variable the
  next stage can hold fixed: both seats fail "Trying to get server mods"
  (status 0, no connection) about every 42 s all run long, and a fetch was
  in flight at both crashing quits.
  Cited: gate set 20261025-015916-gate-m3-train-44 on 6cdc2b35 (20:13 PDT),
  b-host-quit green on its last runs (030427, 030801 after the 025053
  settle red at c2's first teleport, the set's watch item), b-host-kill
  green with it; train-44 merge-ready by citation, Eli's word next.
  MERGED 22:23 PDT on Eli's "Merge now": fork parity 6cdc2b35, the clones
  promoted; the quitting host's two halves (the stale rule and the quit's
  disconnect) are parity's. Open: the quit crash's three discriminators on
  the next stage (the Papyrus quit, the no-client quit, the console quit on
  parity), then the heaps mode if they point at a movie.
  THE CRASH PREDATES 44 (x-quit-console-43 20261025-185002 on m3-train-43
  de9d048e, the build without the thunk, numidium's read, 11:5x PDT): c1
  wrote c1-crash-2026-10-25-11-52-22.log at that quit, the same exception
  at SkyrimSE.exe+0x10EA550 and the same stack frame by frame through
  36551+0x3f4 and WinMain+0x1b3 (the Skyrim Platform frame at a different
  offset, +0x54f640, a different SP build, which fits the HookedWinMain
  reading), with the client ALIVE at the teardown. So the console quit
  crashes the same way without OnQuitShutdown: the class is the engine's or
  the load order's, and 44's thunk is cleared. Left: whether a quit with no
  menu open crashes (x-host-quit-papyrus on the merged build, next), and
  the seat (c1 against c2). A design question filed for Eli from the same
  night's reads (b-cell-host 20261025-115250): a DEAD player can still host
  a cell (c1 took epoch 2 while dead, before its 25 s respawn). Not a bug
  under today's rules; the recommendation when it is decided: a dead player
  is no candidate and its cells start their grace at the death (an R0 fact
  the server already holds), since its respawn teleports it away and passes
  them by distance anyway.
  Filed as D18 in docs/research/m3/decisions-after-playtest-34.md (B
  recommended) and BUILT AHEAD on fork m3-train-48 (16:28 PDT, not merged):
  wire-rules' PlayerState.dead with died and respawned, the bridge's two
  calls, and the server's WorldState::onDeathState (MpActor::
  SendAndSetDeathState, the death true and the respawn false) into
  PartOne::OnDeathState for a player's actor alone; the rules' test and
  CellHostTest's case (the grace from the death, the dead player's loaded
  report granting nothing, the respawn's grant).
  The Papyrus quit too (x-host-quit-papyrus 20261025-190351 on the merged
  build, Debug.QuitGame from the driver's next tick with no menu open,
  numidium's read, 12:07 PDT): GREEN on D12-B's claims (the leave 1.2 s
  after the step, the grant 5.0 s later, c1 back without retaking), and
  c1 crashed at the quit with the same stack frame for frame. The tally:
  the console quit on 44 three of three (with and without Frida), the
  console quit on 43 without the thunk one of one, the Papyrus quit on 44
  with no menu open one of one. The thunk, Frida and the Console menu's
  movie are cleared; whatever is alive at the teardown is alive at every
  quit (a persistent movie, the HUD's or a plugin's own, or no movie at all).
  Left: the seat (every quit so far was c1's; x-host-quit-c2 by path swaps
  the seats), the mod stack (the no-client solo quit: Skyrim Platform
  loaded, nothing connected), and quit-path.js's heaps mode to name what
  is alive at the teardown (under Frida the crash is the same, so the trace
  does not confound the read). Two leftover crash logs ride clean-m1-next
  (17-50-50 and 43's 11-52-22): only one stamped inside a run counts. The
  lab stands on the merged build with the current driver, ready for the
  playtest; Eli chooses between playing now and the remaining
  discriminators.
  Eli chose the discriminators first ("id rather have everything sured up
  before I actually sit to test"). All three GREEN on D12-B's claims and all
  three CRASHED alike (numidium, 12:33 PDT): x-host-quit-c2 192025 (c2 hosts
  and quits; c2-crash-2026-10-25-12-22-43.log inside the run: the SEAT is
  cleared); x-quit-solo 192810 (solo, no skymp5-client, Debug.QuitGame from
  Riverwood; c1-crash-2026-10-25-12-29-54.log: the crash NEEDS NO SKYMP
  CLIENT, so Skyrim Platform and the SKSE plugins are what is left, vanilla
  unread); x-host-quit-heaps 192408 (the heaps mode on a Papyrus quit): the
  crash read 0x01E74A0EF030 and the trace's ninth and LAST heapDestroy, heap
  0x1e74a0f60c0, carried exactly that handler, mapped at DestroyItself's
  entry and freed before 87837 read it; six setLimitHandler(nullptr) calls
  and five contextDtor records came first (five movie memory contexts
  destroyed and cleared, five of the six nulls from SkyrimSE.exe+0x1057b65
  inside 85286), and the ninth heap's context never was: a leaked movie
  memory context, the F030 low bits of every crash its heapLimit. Every
  heap name read "?": HeapInfo.name at heap+0x80 (the _info at +0x38, its
  name at +0x48) is unconfirmed (rule 1). To NAME the leaked movie the
  trace must record heap and movie creation from early in the session (the
  heap's creation with its name, or the movie's load with its file), so the
  ninth heap's address maps to a name at quit: the re-analyst's next read;
  or the SKSE plugins bisected in solo runs (a layer change). With no
  skymp5-client in the solo crash the fix is not in our client: a plugin's
  movie, or Skyrim Platform's own UI (NirnLabUIPlatform at startup is
  numidium's candidate, unverified). Playtest 34 goes ahead with the box
  known; the fix is its own row.
  The naming hooks (the re-analyst, REA on sky-re, 12:51 PDT, CONFIRMED-
  STATIC for the layouts and ids): a heap's name is a char* at heap+0x80
  pointing at the heap's own copy at heap+0x828 (GMemoryHeap.h:97-99, :231;
  the root's CreateHeap 84512 makes the copy: rdx the name, r8 the parent,
  rax the heap; the child list at +0x88/+0x90, DestroyItself walking it head
  to tail, so the ninth heap destroyed is the youngest surviving child);
  the heaps run read nothing because it read a sized UTF-8 string over the
  bytes past the NUL. A movie's memory context is made by
  GFxMovieDefImpl::CreateMemoryContext 85302 (rdx the heap name `MovieView
  "<file>"`, built by CreateInstance 85300 from GetFileURL's basename; rax
  the 0x60-byte context inside the new heap, its heap at +0x10, the limit
  handler at +0x30 installed through SetLimitHandler, the heap's auto-
  release at heap+0x30), its root by CreateInstance 85301 (rdx the context,
  rax the GFxMovieRoot: context at +0x28, heap at +0x38, refcount at +0x08);
  the context dies normally in 85286 from GFxMovieRoot::Release 83930 when
  the root's refcount reaches zero, which the UI destructor 82073 drives
  for every menu in UI::menuMap (IMenu+0x10 the movie); BSScaleformManager
  ::LoadMovie 82325 formats "Interface/%s.swf" into GFxLoader::CreateMovie
  84640. So the leaked heap is a movie whose root's refcount never reached
  zero (an extra holder: a plugin's GPtr, an IMenu made but never
  registered, a load task; HYPOTHESIS which); the sixth
  SetLimitHandler(nullptr) came from the `_Mesh_Cache` heap's owner, not a
  movie. The leak dump at quit is a stub (84555 `xor al,al; ret`), so the
  engine prints no heap names: the trace must. quit-path.js's names mode
  (thuum main, this commit) joins 84512, 85302, 85301, 82073's menu walk
  and 84554 on the heap address and prints, for the handler-carrying heap,
  its name, its context, its roots with their refcounts and the menu that
  owns it or none. One run on any build (the crash is the same everywhere)
  names the movie; falsified if the heap's name is not a MovieView's, the
  handler is not a context's +0x30, or the root's refcount reads zero.
  NAMED (x-host-quit-names 20261025-201238, train-45's stage probe, green
  on D12-B, the crash inside the run; numidium's read, 13:18 PDT): the
  leaked movie is the engine's own LOADING MENU. The ninth and faulting
  heap is `MovieView "LoadingMenu.swf"` (name and inline copy agree), its
  handler the context's +0x30 and the context's +0x10 that heap; the UI
  destructor's walk listed 38 menus, six with a live movie at its entry
  (TrueHUD at refcount 4, LoadWaitSpinner, Console, Loading Menu, HUD Menu
  at 11, Fader Menu), and five of those heaps never reached DestroyItself
  (released properly: the five context destructors of the heaps run);
  only the Loading Menu's movie, refcount 1 (its IMenu's GPtr the one
  holder, so no plugin holds the movie view itself), survives to the
  teardown with its handler set. No creation join: it was made before the
  attach, at startup. The other eight heaps are the engine's (Global,
  _ResourceLib_Images, _Font_Cache, the MovieData heaps of fonts_console,
  fonts_en, fonts_cclub and LoadingMenu.swf), _Mesh_Cache with its own
  handler and no fault. Reading: the movie is held only by its IMenu, so
  the IMenu itself is what never dies before the heap teardown: an extra
  holder of the Loading Menu's IMenu (a plugin's or Skyrim Platform's
  smart pointer kept from a menu event or a loading hook) or the UI
  destructor's own order (HYPOTHESIS which). Next, after the playtest: the
  names mode prints the IMenu's refcount in the walk (IMenu+0x08, the
  GRefCountBase count) so a count above one names a holder; the re-analyst
  reads the Loading Menu's release path under the UI destructor and who
  references the Loading Menu's IMenu (Skyrim Platform's loading hooks,
  LoadGame.cpp, are the first suspect, then SSEDisplayTweaks' and
  po3_Tweaks' loading-screen options); then a solo quit per suspect plugin
  disabled (a layer change each). Not a thuum verb's bug; a fix row of its
  own.
  The re-analyst's read of the holders (REA on sky-re, 13:41 PDT): the
  Loading Menu is an ALWAYS-OPEN menu by engine design (flags
  kPausesGame|kAlwaysOpen|kAllowSaving|kApplicationMenu, LoadingMenu.h:13;
  the hide path keeps a kAlwaysOpen menu's instance, movie and delegate
  until shutdown, which is why five engine menus were alive at the UI
  destructor's entry), and the UI destructor 82073 is the one place it
  dies: per live entry AddRef, UnregisterHandler (releasing the two
  callback references its FxDelegate holds, "RequestPlayerInfo" and
  "RequestLoadingText"), Release; then the map destructor 82118 and the
  stack destructor 82107 release their pointers; an untouched Loading Menu
  counts 3 at the entry, 1 after the loop, 0 after the map destructor, and
  36551 calls 82073 at +0x33a before the Scaleform teardown at +0x3df, so
  no ordering bug (CONFIRMED-STATIC). For the movie to survive, the
  IMenu's count must stay at or above 1 after the map destructor: an extra
  reference taken after the creator returned (an outside holder, HYPOTHESIS
  who) or an unregister that released fewer than two (HYPOTHESIS). No
  global pointer to the Loading Menu exists in the engine (the creator
  51943, both destructors and ProcessMessage write only the instance and a
  byte flag). Skyrim Platform keeps no IMenu or GFxMovieView (the fork's
  sources read: EventHandler, FridaHooksUtils, main, BrowserApi,
  PapyrusTESModPlatform, LoadGame; the overlay is the CEF one, NirnLab
  headers only). Of the lab layer's 33 DLLs the one with a documented
  loading-screen feature is SSEDisplayTweaks (its LoadingScreen frame-rate
  settings); po3_Tweaks has none (the earlier lead corrected); TrueHUD,
  TrueDirectionalMovement, MCMHelper, SKSEMenuFramework, ImprovedCameraSE,
  ConsoleUtilSSE and skee64 touch the UI otherwise. quit-path.js's holders
  mode (thuum main) reads the Loading Menu's IMenu count at the destructor's
  entry, after its callbacks' release and after the map and stack
  destructors, with its stack membership and delegate count: 4 or more at
  the entry names an outside holder, 3 with a count above zero after the
  map destructor a short delegate release. Bisect order if the count says a
  holder: SKSE with no DLL plugins and SP off (engine against load order),
  then SSEDisplayTweaks, then TrueHUD with TrueDirectionalMovement, then the
  menu frameworks, then skee64 with Skyrim Platform, the rest by halves.
  A FINDING with it: the quit CRASHES inside the engine's shutdown after the
  teardown (c1-crash-2026-10-24-17-50-50.log: EXCEPTION_ACCESS_VIOLATION at
  SkyrimSE.exe+0x10EA550, mov rax, [rcx], the main thread, reading a garbage
  pointer; the stack through the thunk, WinMain+0x1b3, 36551+0x3f4, 82324,
  84561, 84559 (RE::GSysAllocPaged::ShutdownHeapEngine, Scaleform's paged
  heap teardown, GSysAllocPaged.h:39), 84554 twice, 87837+0x50). The leave
  landed before it, so the village passes; a player gets the WER box and a
  CrashLogger log at every quit until it is understood. HYPOTHESIS: a
  pre-existing crash on exit of this load order inside Scaleform's memory
  teardown, unseen because every lab relaunch so far was a kill and never a
  quit; the re-analyst names the frames, and two lab discriminators are
  numidium's (older CrashLogger logs on the seats with the same stack; a
  quit from the main menu with no client ever created, where the thunk does
  nothing). If the no-client quit does not crash, the teardown is in the
  frame.
  The re-analyst's read of the stack (REA on sky-re, 18:19 PDT,
  CONFIRMED-STATIC for the chain, HYPOTHESIS for the cause): 36551 at +0x3df
  loads the BSScaleformManager singleton and calls its teardown 82324
  (BSScaleformManager.h:50-56's fields released in order), which calls
  84561, GMemory's ShutdownHeapEngine shape, which calls 84559
  (RE::GSysAllocPaged::ShutdownHeapEngine: the global heap's leak dump, then
  its DestroyItself 84554, GMemoryHeap.h:190), which walks the global heap's
  child heaps (+0x88) destroying each, then frees its own engine through
  87837, the allocation engine's destructor: per segment it loads the heap's
  limit handler from engine+0x748 and calls OnFreeSegment on it
  (GMemoryHeap.h:120). The crash is that load, MOV RAX,[RCX] with RCX the
  handler, a canonical user-mode address ending in 0x30, the offset of
  heapLimit inside GFxMovieDef's MemoryContextImpl (GFxMovieDef.h:93): a
  movie's memory context whose destructor (85286, which begins with
  SetLimitHandler(nullptr)) never ran, so a movie-scale child heap of the
  global heap was alive at quit with a handler into memory already
  unmapped. Networking on 36551's path before the Scaleform teardown: none
  to depth two (its 47 direct calls named, BSAudioManager's GetSingleton
  the only CommonLib-named one; the exe's WinHttpCloseHandle sites all lie
  in bnet code none of the 47 reaches). The thunk touches no Scaleform
  object, and GFx heaps are VirtualAlloc segments, not the CRT heap a Rust
  free reaches. Verdict, HYPOTHESIS until a run: the engine's known at-exit
  class, a GFx movie leaked past the UI teardown; the only way the thunk
  could matter is ordering (a JS callback leaving a menu or GFxValue alive).
  Decides it: the plain quit (no Frida) and the no-client quit as above, and
  lab/frida/quit-path.js's heaps mode, which lists every heap 84554 destroys
  at quit by name (HeapInfo.name at +0x80 through +0x38, GMemoryHeap.h:97-99)
  with its handler and whether that handler is mapped: the leaked movie's
  name. One lab fact worth the read: the lab's quit is the console's qqq with
  the Console menu open, a movie a player's menu quit never has open.
  GREEN at T3: x-host-quit v4 20261025-012653 on 44 6cdc2b35 (numidium's
  read, 18:30 PDT): the server's "user N left" line held 1.2 s after the
  quit step returned (two polls of lab-api's server.log_count, the console
  typing inside it), the grant of 0x9732 to c2 held 5.0 s after that (the
  grace), Alvor's AI on for c2, and c1 back after its relaunch without
  taking the village (online 27.1 s after the relaunch). D12-B measured on
  its own claim. The crash recurred at that quit with the same stack
  (c1-crash-2026-10-24-18-29-27.log, reading 0x1D4C91AF030), Frida armed
  again, so no discriminator yet; the plain quit after the gate is the
  first. The committed scenario b-host-quit follows the plain run's green,
  since the committed shape carries no Frida step (rule 13: a green probe
  promoted unchanged).
  The plain run (x-host-quit-plain 20261025-013410, 18:36 PDT, no Frida in
  the process): GREEN on the same numbers (the leave line 1.2 s after the
  quit step, the grant 5.0 s after that, c1 online 27.1 s after its
  relaunch), and the crash AGAIN, c1-crash-2026-10-24-18-36-26.log, no frida
  module, the same exception and a stack identical frame by frame, the read
  address 0x0273C9A4F030 against 0x01D4C91AF030 and 0x012049B7F030 before:
  three times the F030 ending, MemoryContextImpl's heapLimit offset. Frida
  is cleared; the finding reads: on 44 the game crashes inside the engine's
  own teardown after the disconnect at every console quit tested (3 of 3),
  the server side whole. Committed as lab/scenarios/b-host-quit.yaml (main
  8dcc000) from the plain run. Across all of /srv/lab/results only these
  three quits carry the 84559 stack, and no earlier run ever quit through
  the engine (a relaunch kills). On numidium's question whether the pre-44
  build reached the shutdown routine at a quit at all: it did, statically
  (CONFIRMED-STATIC by the WinMain read: every quit's byte store leads to
  the same call, and the thunk only runs code ahead of it, so 44 did not
  change whether the engine tears down, only that the client is gone when
  it does). What differs between the three crashing quits and playtest 32's
  clean one: the console path with the Console menu open against a menu
  quit, the seat (c1 against c2), and the build (44 against parity); the
  Papyrus quit on the next stage separates the first, the no-client quit the
  second and third. All three need a stage change, so they wait for Eli's
  look at 39 to 44.

## Client

- SP binding: none new (cellFullyLoaded, Cell.isAttached, getParentCell,
  clearKeepOffsetFromActor :2023 exist).
- TS handler: HostService (skymp5-client services; the "TODO: make host
  service" at formView.ts:450 and :515): the loaded set and its reports; the
  hosted cells with epochs; isHostedHere(refr) for formView, hitService,
  magicSyncService and sendInputsService in place of storage['hosted']; the
  HostGrant and HostRelease handlers; tryHost and hostAttempts.ts removed.
  As built (5f10768c): isMine(form, refr) is what the four sites ask, the
  grant and the server's own word on the actor (isHostedByOther, false
  only on the host's screen for the cell's actors no user plays, flipped
  at the grant for a 0xff actor; for an ESM actor the flip never landed,
  the defect above, so isMine stayed false for every game-file actor until
  npc-puppet) agreeing, so a player standing in a hosted cell is never
  reported for; a release is applied when it names the grant held (the
  monotonic rule is the grant's); the loaded set is re-sent when the
  player's own CreateActor arrives (the moment the server has the actor,
  after Welcome), and cells the engine detaches leave it by a once-a-second
  Cell.isAttached read. Since 6ac33367 the loaded set is reported again
  every 30 s: a report is a bit the server sets, so the repeat costs nothing
  there, and it heals a report the server never took (b-cell-host
  20261021-184501's refused landing cell); the budget is the first line,
  the refresh the second.
- Kill switch config key: `cellHost` under skymp5-client's settings (off: no
  reports, so the server grants nothing; the per-actor path is gone either
  way).

- The player's own parent cell joins the loaded set at every poll without
  waiting for its load event (fork m3-train-33 2ce4fd36, 14:23 PDT): at a
  teleport the engine's cellFullyLoaded for the destination cell itself can
  go missing while its four neighbours' arrive (x-npc-legs 20261022-211702:
  c1 at the Riverwood landing reported 9752, 9733, 9712 and 9731, never 9732,
  its own, which stayed unhosted for the run; six earlier runs that day
  reported it), and the 30 s refresh re-reports only what the set holds. The
  player's parent cell is the engine's answer for the player, interior or
  exterior; c1.log traces "own cell <id> reported without its load event"
  when the guard fires. HYPOTHESIS on the miss's cause (the event's timing at
  a load screen); the guard holds either way.

## Tests

- T0: wire-rules cells (first loader; a second gets nothing; the grace
  disarmed by a return at 4.9 s, fired at 5.0 s; lowest round trip wins,
  earliest on a tie; the old host's Release; no visitor: Unhosted with the
  epoch kept; Gone as Unloaded; accepts refuses an older epoch and a
  non-host; out of reach: no grant). wire-validate: CellLoaded's budget; the
  epoch rules; proptest that none of the three panics (the
  hosted_never_panics shape, lib.rs:1491). C++: ActorUpdatableBy under a cell
  host for an ESM NPC; the relay without the host; the cell-change rule; the
  disconnect's release (unit/HostAttemptTest.cpp's premise retires).
- T1: none.
- T2: a fakeclient session with two users (skymp-hosting.md:555-557
  reshaped): CellLoaded from both; Grant epoch 1 to the first; its movement
  for a cell NPC accepted, the second's dropped; its Unloaded; 5 s; Grant
  epoch 2 to the second and Release to the first; a HostedActorState at
  epoch 1 refused; a disconnect; a restart and the reports again. The
  difftest smoke still sends Host (14): both servers ignore it; declared.
- T3 scenario id: lab/scenarios/b-cell-host.yaml. Two seats, a creature cell
  (a wolf by the hunters' camp flat, b-figure-values' ground, found by
  refs-near; creatures pass the filters, skymp-hosting.md:560-563),
  npcEnabled on the probe setting. c1 in: host c1, epoch 1 (server.host(cell)
  and server.actor_by_id, two lab-api facts to add); c2 in beside it: still
  c1; c1 two cells away and back inside 4 s: still c1, epoch 1; c1 away 7 s:
  host c2, epoch 2, HostRelease in c1.log; c2 relaunch, 7 s: unhosted and
  the wolf's record unchanged over 10 s (the freeze); c1 back: epoch 3;
  server restart, both reconnect: a grant within 10 s; both teleport in from
  outside in one step: one grant.
  c-riverwood (the exit, docs/PLAN.md's M3 section, after npc-puppet,
  npc-stream, npc-handoff): both seats to Riverwood (Tamriel 0x3C, grid
  (4,-12) 0x9732), the server's clock to 7.9, watch-start on both with the
  fourteen ids (riverwood-ids.md), 90 s: the nine walkers move on c1 and the
  same tracks reach c2 within the relay's lag; c1 leaves two cells; within
  5 s c2 hosts 0x9732 and its neighbours and the walkers continue without a
  jump over 1024 units (maxDisplacement, Embry's door excepted,
  readings-18:110-112); restart; positions restored within 30 s of the
  record.
  c-dungeon-enemies (the exit, after npc-fate and the humanoid lift): both
  seats in one interior chamber, the bandits by placed id (lab/esm.py),
  start-combat in c1's game; the host's hits on both players counted on the
  server under reach and cone (PLAN's M3 section); c2's screen shows the
  bandit attacking c2; a death stays dead; c1 leaves, c2 hosts within 5 s,
  the fight goes on.
- Assertions that would fail if the verb silently regressed: the host and
  epoch at each step; no grant to a game whose grid lacks the cell; the
  wolf's record still over the unhosted stretch; one grant for a same-step
  entry.

## Dynamic plan (fill when any tag above is still HYPOTHESIS)

- No Frida script: this verb hooks nothing in the engine. Owner: agent.
- x-cell-attach (solo, c1, the references' shape with the Survival prompt
  step): coc to Riverwood, walk east across (4,-12) to (5,-11) and back at a
  person's rhythm, into the inn and out; a driver step cell-events logs
  cellFullyLoaded, cellAttach and cellDetach with ids, the player's parent
  cell per 250 ms and isAttached() of every cell seen (written 2026-10-21:
  the driver's cell-events-start and cell-events-stop, main 4b69e9c, and
  lab/.cache/probes/x-cell-attach.yaml; RAN GREEN 20261021-185728 on
  cell-host's first stage: H1 and H2 measured in Engine surface, the grid
  math floor; two lab notes: the probe's move steps ran east for the whole
  run instead of to their targets, which was lab-api's move step treating
  a written target as an offset from the server's record, the stale spawn
  in a solo run, fixed by numidium on main b5e41ad, not the driver; and a
  runtime 0xff exterior cell is reported, to skip). Decides H1 (which
  cells fire, once each, at a load and a shift), H2 (isAttached tracks the
  detach), the grid math at negative coordinates (floor, not truncation: y
  -44000 is row -11; Riverwood 0x9732 at (4,-12) is the check) and the
  CellLoaded budget. Falsified by a missing or doubled cellFullyLoaded, or an
  exterior cell that never detaches.
- H5 (the handoff pick by round trip): not measurable with two seats, since
  every handoff has one candidate; the ranking is T0's (wire-rules cells and
  CellHostTest's third case: the lowest round trip, the earliest loaded on a
  tie, the lower id on a full tie) and the round trip's source is measured
  (IServer::GetRttMs through renet, non-zero since the clock fix). A third
  seat, or a friend's connection, measures it later. H6, H7 (the host's
  actor set against the server's; each relayed animation once): npc-stream's
  rows. H8 (r-cell-leave on two seats, the old host's divergence after 60 s
  away): npc-handoff's row. None of the four stands against this verb.
- Breakpoint plan for a human session: none needed.

## Status

Doc drafted 2026-10-21, before any code.

- [x] doc complete, inventory listed with a disposition per row, rung declared (2026-10-21; the dispositions stand on the 2026-10-18 references, to be re-read on the merged base)
- [x] engine surface cited or delegated (the cell events and getters through Skyrim Platform; cell_of through libespm's index; the AI switches npc-puppet's)
- [x] server logic + T0 (the cell host table: wire-rules cells with seven T0 and reach as a fact with decisions, fork m3-cell-host afc792c1 and 8f17d7a4; the bridge's Cells; the core, 9aadeaea 2026-10-21 07:10: WorldState::CellOf and HostOf, PartOne's facts and senders, the hosted flag frozen by default, the cell-change rule, Host 14 ignored, hosters retired; unit/CellHostTest's two ESM-backed cases; wire-validate's tests for the three messages; Linux CI green through 29a7b56e: 2481, 2483, 2487 and 2488, 2026-10-21 08:05; the Windows build's ctest failed two CellHostTest cases at 29a7b56e on the test's 1 ms clock margins against the server's own grace stamp, fixed c0e4a029 11:19 with 2.5 s inside and 2 s past, the election untouched)
- [x] message + validator (same commit): CellLoaded 47, HostGrant 48, HostRelease 49 with their validators, JSON forms, fixtures and C++ structs, fork m3-cell-host ea0e24d3
- [ ] native hook + T1 (none: events through Skyrim Platform)
- [x] TS handler (HostService, fork m3-cell-host 5f10768c 2026-10-21 07:22: the loaded set as CellLoaded from cellFullyLoaded plus Cell.isAttached once a second, reported anew when the player's own actor is created; grants and releases per cell with the monotonic epoch; isHostedHere and isMine for formView, hitService, magicSyncService and sendInputsService; tryHost, hostAttempts.ts and the HostStart/HostStop handlers retired; the cellHost settings key; tsc clean)
- [x] T2 green (difftest session cell-host.yaml, fork 5fef550a: c1's grant at epoch 1, c2's nothing, c1's unload and departure, c2's grant at epoch 2 at the deadline; "T2 green" at skymp-server:m3-cell-host 535544db, 33 sessions identical, run beside the merge gate 2026-10-21 and confirmed before parity moved)
- [x] on fork parity 535544db (2026-10-21 13:47, `just verb-merge m3-cell-host b-cell-host`: the gate 20261021-202319-merge-m3-cell-host 8 of 8 green with no rerun (the smoke, a-restart-persistence, b-duel, b-cell-host 203119, a-melee-reach, a-racemenu, b-spell, b-invis-recast), no game lost or replaced; both clones promoted; main 6b593f6 pins it; the lab's settings carry the Survival flags from the next server start)
- [x] T3 scenario green, no HYPOTHESIS tags (b-cell-host GREEN 20261021-201430 on the 535544db stage, all twelve asserts, no crash, the old shape 201045 clean through the handoff too; approved by Eli 11:03; the road there: 184501 red on the CellLoaded budget (fixed a591bdeb), 192314 red on the scenario's own away-and-back timing (the wait 0.5 s, main e6e9474), 192835 lost c1's game to a copy deleted while the host's engine still ran its movement job (fix 535544db, disable then delete; the cleaner's guard a896acf3), 193557 and 194846 held further each time, the freeze block reshaped around relaunch {until: gone} (main 7ef5522); x-cell-attach 185728 green and read; the tags that remained are npc-stream's and npc-handoff's by name, and H5 waits for a third seat)
- [x] parity scenario green, or its later list reviewed with it (ADR-031): no parity scenario of this verb's own (the election adds no engine action; the host's NPCs run as the engine alone runs them, the references r-npc-packages, r-npc-fight and r-cell-leave of 2026-10-18 standing); the parity diff of a hosted cell against the engine alone is npc-stream's row, listed there
- [x] sequences and combinations green, every checklist item with its scenario (ADR-033): the table above, each row with its run; the two rows that name later verbs carry by name
- [x] ledger and suppression registry updated: no native touched (docs/NATIVES.md unchanged); the Suppress section above is the registry entry (the per-actor ask and grant retired from the senders, the ids kept)

MERGED (18:44 PDT, 2026-10-25): train-46 on fork parity aaafffe5 carries the
pass between live hosts (npc-handoff D9) and the corpse's release; the dead
host (D18-B) rides train-48, built ahead on Eli's letter.

THE HOLDERS READ (18:49 PDT, 2026-10-25; x-quit-holders 20261026-014250 on
parity aaafffe5, numidium's run of quit-path.js's holders mode; the quit
crashed as every quit does, c1-crash-2026-10-25-18-45-37.log): at the UI
destructor's entry the Loading Menu's IMenu read refCount 5, onStack false,
delegateCallbacks 2, 207 ms after the quit flag. The UI's own references
are the menu map's entry and the two delegate callbacks, three; the two
over them are held OUTSIDE the UI, so the survival is an outside holder,
not the destructor's order (the second branch of the earlier HYPOTHESIS
falls). The records after the unregister and the map and stack destructors
never reached disk (the crash came before the next flush, or the hooks
never fired); the entry count decides it alone. Two reads are open: the
plugin bisect in the order above (SSEDisplayTweaks first), or one run that
names the holder: a write watchpoint on the IMenu's refcount word (IMenu +
0x08, the count the names mode reads) logging each writer's return address
and module across two loading screens and the quit, if the lab's Frida
offers hardware watchpoints (Thread.setHardwareWatchpoint, per thread). The
count of two matches the run's two loading screens (the login's and the
teleport's), so a holder that takes a reference at every Loading Menu open
and never gives it back is the first thing the watchpoint would show
(HYPOTHESIS).

