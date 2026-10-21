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
| the host steps out and back inside the grace: a door (an interior detaches at once); an exterior boundary (a cell leaves the loaded set only two grid cells away) | b-cell-host | |
| the host leaves for longer than the grace; disconnects; relaunches | b-cell-host | |
| two games load the cell in the same tick; both leave together (the freeze) | b-cell-host (c1 and c2 teleport in one step) | |
| a player teleports in (no walk); a game still loading (docs/research/load-freeze.md) reports nothing and gets nothing | x-cell-attach | |
| a game crossing an exterior boundary back and forth at a person's rhythm (no grant churn: the loaded set has the engine's hysteresis) | x-cell-attach | |
| an NPC crossing into a cell the same host holds; into a cell another player holds | b-cell-host; later npc-handoff | |
| a server restart with both seats in the cell (hosts rebuilt from the clients' reports) | b-cell-host | |
| an exterior cell loaded by two players standing in neighbouring cells (first wins) | b-cell-host | |

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
Rate limit / bounds: CellLoaded 32 at once, 8 a second after (a 5x5 load is
25 cells; uGridsToLoad 5, te-npcs.md:31; the constant is measured in
x-cell-attach and carries its conditions, ADR-033 point 5); GRACE_MS 5000;
the host's stream keeps its own budgets.

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
  with the promote and demote order HYPOTHESIS (re-ai-puppet.md Q4). Cited
  so the cut is explicit.
- The hostable set, a lead only (ADR-005): Skyrim Together's boundary is the
  high process list, ProcessLists::GetSingleton and highActorHandles
  (ProcessLists.h:36, :69; te-npcs.md:277-281). Not used here: the host's
  stream covers the server's NPCs by their views.
- HYPOTHESIS (code reading; x-cell-attach decides): cellFullyLoaded fires
  once per cell for each loaded grid cell at an exterior load and for each
  new row or column at a grid shift, once for an interior at its door; a
  cell leaves the loaded set when isAttached() turns false.

## Observe (host or acting client sees the intent before the engine acts)

- Hook point: Skyrim Platform's cellFullyLoaded; once a second, isAttached()
  of each cell reported loaded (a handful of cells, no per-frame work; rule
  9 met without a native filter).
- SP filter: none needed (one event per cell load).
- Data captured: the cell's form id, interior or exterior, the attach state;
  sent as CellLoaded { cell, loaded }.
- Side effects of hooking here: none expected (an event and a getter);
  HYPOTHESIS until x-cell-attach.

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
  animations as HostStart does today (formView.ts:460-464); HYPOTHESIS until
  b-cell-host that no NPC in a hosted cell is left unreported (H6).

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
- Side effects: HYPOTHESIS until b-cell-host (H6, H7).

## Message contract

- HostGrant, id 7, server to one client, ReliableOrdered by default
  (wire-transport channels.rs:35-41), reserved at wire-schema lib.rs:
  296-300 as { cell: FormId }; this verb adds `epoch: u32`. HostRelease, id
  8 (:301-305), the same. Idempotent per (cell, epoch). validate_server: the
  client refuses a grant or release whose epoch is not above the last it saw
  for that cell in this connection (TES3MP's late-grant desync, tes3mp.md:
  194-196; Skyrim Together ignores a stale epoch, te-npcs.md:70-71); the
  epochs clear at Welcome, since a restarted server counts from 1 again.
- HostedActorState, id 5, host to server, ReliableUnordered today
  (channels.rs:38), fields { actor, transform, health, inventory_delta }
  (lib.rs:227-242), validated at wire-validate lib.rs:557-566 (transform,
  finite health, no zero delta); this verb adds `epoch: u32` and the rule
  "the sender hosts the actor's cell at this epoch" (E_VAL_RANGE for an
  older one). Its sender arrives with npc-stream, which also moves it to
  Unreliable (ADR-035 point 5).
- CellLoaded, new, id 55 (TABLE is [Row; 55], lib.rs:426), client to
  server, ReliableOrdered (a load then an unload keep their order), cap 16
  bytes, fields { cell: FormId, loaded: bool }. Validator: the budget above
  (E_VAL_RATE) and nothing about the cell, since the election checks the
  server's own grid; idempotent (it sets a bit).
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
  that player), Rtt { player, ms } (renet's per-client round trip; no
  accessor is read in wire-transport or wire-bridge today, to confirm against
  the pinned renet, ADR-015), Tick { now }. Decisions: Grant { player, cell,
  epoch }, Release { player, cell, epoch }, Unhosted { cell }. Rules: a cell
  with no host goes to the first Loaded whose Reach holds it, epoch plus one;
  the host's Unloaded or Gone arms GRACE_MS; a Loaded from the same host
  before the deadline disarms it; at the deadline the visitors with the cell
  loaded and in reach rank by Rtt, lowest first, earliest Loaded on a tie:
  the first gets Grant, the old host Release; none: Unhosted, epoch kept.
  Queries: host_of(cell), accepts(cell, player, epoch).
- The core (C++, legacy): `hosters` (WorldState.h:257) and
  lastMovUpdateByIdx's host role retire; ActorUpdatableBy (ActionListener.
  cpp:58-106), GetActorToSendTo (MpActor.cpp:527-528: Teleport, ChangeValues,
  the death state, snippets; DelegateToHost PapyrusActor.cpp:189-195) and
  UpdateHoster (MpObjectReference.cpp:736-737) resolve through
  host_of(cell_of(npc)). cell_of: the record's worldOrCell for an interior;
  for an exterior the CELL at (worldspace, floor(x/4096), floor(y/4096))
  from the masters' XCLC (lab/esm.py reads it, riverwood-ids.md:3-5; whether
  libespm's browser indexes it is unread: HYPOTHESIS, code). The cell-change
  rule: a hosted NPC's report naming another cell is accepted when the sender
  hosts the destination and the origin is unhosted or the sender's
  (MovementValidation.cpp:96-101 relaxed for that case alone, logged);
  otherwise dropped, npc-handoff's row. isHostedByOther keeps its ESM defects
  (u32 refr_id, skymp.rs:426, against CreateActor's u64, :1159;
  skymp-hosting.md:149-166) until npc-puppet replaces the property.
- DB fields / migration: none; cell hosts live in memory.
- Restart behavior: every cell unhosted at start; each client re-sends its
  loaded set after Welcome and the election runs again. NPC records stand as
  today (saved at most every 30 s, MpObjectReference.cpp:1355-1360 on
  ef44a1d8).
- Lab setting: `npcEnabled: true` on a probe-only server-settings file
  (ADR-035 point 9); npcSettings left unset, so its parser's two bugs stay
  out of the way (skymp-hosting.md:341-350).
- Papyrus natives touched: none (ledger unchanged).

## Client

- SP binding: none new (cellFullyLoaded, Cell.isAttached, getParentCell,
  clearKeepOffsetFromActor :2023 exist).
- TS handler: HostService (skymp5-client services; the "TODO: make host
  service" at formView.ts:450 and :515): the loaded set and its reports; the
  hosted cells with epochs; isHostedHere(refr) for formView, hitService,
  magicSyncService and sendInputsService in place of storage['hosted']; the
  HostGrant and HostRelease handlers; tryHost and hostAttempts.ts removed.
- Kill switch config key: `cellHost` under skymp5-client's settings (off: no
  reports, so the server grants nothing; the per-actor path is gone either
  way).

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
  cell per 250 ms and isAttached() of every cell seen. Decides H1 (which
  cells fire, once each, at a load and a shift), H2 (isAttached tracks the
  detach), the grid math at negative coordinates (floor, not truncation: y
  -44000 is row -11; Riverwood 0x9732 at (4,-12) is the check) and the
  CellLoaded budget. Falsified by a missing or doubled cellFullyLoaded, or an
  exterior cell that never detaches.
- Before b-cell-host: H5, two seats on the lab LAN read the same round trip,
  so the handoff pick is a tie; the scenario's netem knob on c2 makes it
  deterministic and the pick is asserted both ways. H6, c1's hosted set
  equals the server's NPCs in the cell (dump-state gains `hosting`). H7, c1's
  own wolf plays each relayed animation once (the watch's counts, ADR-033
  point 4). H8, r-cell-leave on two seats: the size of the old host's local
  divergence after 60 s away, for npc-handoff's replay.
- Breakpoint plan for a human session: none needed.

## Status

Doc drafted 2026-10-21, before any code.

- [ ] doc complete, inventory listed with a disposition per row, rung declared
- [ ] engine surface cited or delegated
- [ ] server logic + T0
- [ ] message + validator (same commit)
- [ ] native hook + T1 (none: events through Skyrim Platform)
- [ ] TS handler
- [ ] T2 green
- [ ] T3 scenario green, no HYPOTHESIS tags
- [ ] parity scenario green, or its later list reviewed with it (ADR-031)
- [ ] sequences and combinations green, every checklist item with its scenario (ADR-033)
- [ ] ledger and suppression registry updated
