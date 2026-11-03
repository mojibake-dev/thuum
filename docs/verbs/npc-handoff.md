# Verb: npc-handoff

Drafted 2026-10-22 (M3's fourth verb, docs/PLAN.md:976, :1042-1044,
:1050-1051) from ADR-035 points 7 and 8 (docs/DECISIONS.md:1309-1321),
ADR-045 (:2297-2377), the rows cell-host (:39-40, :58, :292-296, :429-430),
npc-puppet (:108, :1202-1224) and npc-stream (:50, :345-346, :716-721)
carried here, the prior art (docs/research/m3/tes3mp.md, te-npcs.md,
docs/TE-MAP.md:66) and a code read of the fork at the puppet worktree's head
25be67c7 (train-34, off parity a76125cb; every fork path below is at that
head), during playtest 32 and before any code. The cut (rule 3): the moments
a cell's actors change simulator and what the server tells the game that
takes over, so no screen shows a teleport. Not here: the per-NPC stream
(npc-stream); deaths, inventories, spawns, the leveled roll (npc-fate).

## Intent

When a cell changes hands, or an NPC walks out of the cell that hosts it,
the server's record and both games' engines agree within a bound on where
the NPC is and whose engine runs it, and no screen shows it jump: the new
host is told the record before it simulates, a host keeps the actors its
engine still runs into a cell nobody hosts, two live hosts pass an actor at
the boundary, and a cell's host does not flap as players walk.

Roadmap reference: skymp/ROADMAP.md "NPC" (make host change work; NPCs
travelling out of sight), skymp-hosting.md:440-444.
Milestone: M3   Class: B

## Inventory (ADR-031: the action's consequences, before its rung)

The action is "two games stand in and around Riverwood while its people
walk: a cell passes from one game to the other; an NPC leaves its host's
cell for nobody's, for the same host's other cell, for the other host's,
and through a door". From the references (r-npc-packages 20261019-021451,
r-cell-leave 20261017-083700; readings-2026-10-17.md:51-59, readings-2026-
10-18.md:36-43, :108-111), the records (riverwood-ids.md) and playtests 31
and 32 (docs/LOG.md:2248; docs/private/playtest-m3-31.md:160-165,
playtest-m3-32.md:66-80, :110-119; numidium's live reads of 2026-10-23
02:23Z to 02:35Z on fork parity a76125cb):

| consequence | seen in | disposition |
| --- | --- | --- |
| the new host's engine takes a cell's actors over at the grant: b-npc-puppet step 29 on 6139dc60 (yaml :82-91, run 123325) promotes every resident within the 8 s wait; the restart read (yaml :92-98, run 112222) puts the promote within about 2 s of the grant's line on two machines' clocks (Status); the old host demotes at the form's loss (npc-puppet.md:1202-1224) | b-npc-puppet | native on the new host after the imposition; the position written at the promote is the client's own record today (puppetService.ts:101-117) and the server's keyframe from here (decision c; Impose) |
| the package resumed from where the actor stands and the hour (TES3MP: the new host "continues from wherever its own copy was lerped to", package progress restarting, tes3mp.md:183-186) | trace r-npc-packages | native on the new host: EvaluatePackage at the promote (PuppetApi.cpp Promote's since 2026-10-27; the Papyrus shape re-ai-puppet.md:335-347); H1 HYPOTHESIS until c-riverwood's claim 2 (lab/scenarios/c-riverwood.yaml, drafted 2026-10-29, unrun): after c1's relaunch and c2's grant within 12 s, Alvor 0x13482 and Gerdur 0x13489 run on c2 each within 128 units of c1's last read, no reset to the placement |
| the furniture and sit state at a handoff (Alvor between the forge's markers holds a furniture reference, docs/LOG.md's train-33 entries; a puppet's graph refused IdleChairExitStart, fork d0d53bf5) | trace, code | imposed as an observation: the keyframe carries the occupied furniture (Actor::GetOccupiedFurniture, Actor.h:556; sitSleepState, ActorState.h:112) so the lab reads whether the engine re-enters it; nothing forces a sit, the package does; H2 HYPOTHESIS until x-handoff-sit, once npc_state carries sitState: c1 hosts Riverwood at 9.0 with Alvor 0x13482 at the forge, c1 to the lab spawn past the grace, c2 hosts; c2.npc_state(0x13482).sitState read at the promote and 15 s after (re-entered or standing, recorded, not asserted) |
| the combat target across a handoff (TES3MP transfers none; combat by sight existed only on the old host, tes3mp.md:187-191; ADR-035 point 7's StartCombat on the recorded target) | ADR, prior art | imposed when D8 lands: Papyrus StartCombat with npc-stream's recorded target at the promote (skyrimPlatform.ts:2206); H3 a known limit until then: the combat target is not imposed at a promote (D8's keyframe unbuilt; npc-stream.md:518's limit): the record carries none, a handoff drops the fight and the new host's engine re-acquires it by its own senses, TES3MP's shape (tes3mp.md:187-191); c-dungeon-enemies as drafted has no handoff leg, so the re-acquisition stays unread; every number stays npc-fate's |
| the old host's divergence: the engine keeps a left cell's schedules running in low process (Hod moved while the player was in the inn, readings-17:51-59), and a persistent actor keeps walking on the old host's screen after its reports are refused (the pause then catch-up of playtest-m3-32.md:70-74); its late reports on the unreliable channel (tes3mp.md:194-196; te-npcs.md:70-73) | trace r-cell-leave, playtest 32 | suppressed on the server since cell-host (a non-host's report dropped, ActionListener.cpp:87-99; cells::accepts for npc-stream's state message); the old host's puppets follow the record once the word flips; the gap at its return is measured (x-handoff-return; H7); cell-host's H8 carried here |
| an NPC walking into a cell nobody hosts while its host's engine still loads it: 105a35, a LvlAmbientCreatures placement, sighted into 9752 by c1, walked home into 9771, which both seats load and neither hosts; 1,254 of c1's moves refused ("hosts neither"); demoted at the form's loss while c1's engine still ran it; its record frozen at its last accepted sample (docs/LOG.md:2248) | playtest 31 | imposed: decision (a), the host follows its actor and the record keeps moving; the freeze (ADR-035 point 8) applies to a cell no game has loaded |
| the hosted word flapping as two players walk: Riverwood's west column (0x9733 at (3,-12), 0x9752 at (3,-13), riverwood-ids.md:37-44) changed hands six times in four minutes (18:03 to 18:07 UTC; results/playtest-31/'s server log, docs/LOG.md:2248), each pass flipping the residents live or puppet on both seats | playtest 31 | suppressed: decision (b), hysteresis in the election |
| an NPC crossing into the same host's other cell (the wolf 4500 units east, unit/CellHostTest.cpp:249-262), and into another live host's cell (cell-host.md:39 and :58, carried here; MayMoveActor refuses it today and the record freezes at the boundary) | T0, code | the same host's: native, accepted since cell-host, unchanged; another host's: imposed, decision (d), one actor passed between two live hosts |
| a persistent NPC through a door, the record left at it: Embry 0x3550C into the inn 0x133C6 (readings-18:36-43; the other screen's puppet stands at the door, cell-host.md's known limit, playtest-m3-32.md:110-111; the watch's 50032-unit jump is its coordinate frame, readings-18:108-111); the dog Stump 0x1e62b into Gerdur's house 0x133c7, the host's reports refused 751 times from 02:23:22Z to 02:28Z ("ff000001 may not move 1e62b to cell 133c7"), one per tick for five minutes | trace, playtest 32 | native on the host; the host follows him (decision a, the door branch); the puppet is moved into the interior by the record (Impose); the refusal's rate is suppressed (decision e) |
| the door's other side, the record indoors while the engines bring the actor out: after the restart and test 2's relaunch at 02:35Z six residents (Alvor 0x13482, Sigrid 0x13483, Dorthe 0x13484, 0x13487, 0x13488, 0x13489) were live with AI on in BOTH games, up to 49,000 units apart (c1 had Alvor in bed at interior coordinates, c2's fresh game walking home outdoors); neither Skyrim Platform log holds a puppet or live word for them since the restart: their records sit in their houses' interior cells (accepted indoors earlier under the own-cell report), an interior is not in the exterior grid, so nothing subscribed either player and no CreateActor went out | playtest 32 | imposed: decision (g), the roster moves a record out of a cell nobody hosts; H9 CONFIRMED: the record in his house at 23.0, outdoors within 180 s of the restart's reconnects, one seat live (x-handoff-night 230913; b-npc-handoff-night 161723 after D11's fix fc7b2718, green again 191840 in 54's gate); the second direction measured directly in x-npc-death 20261023-051540: the server's one line for her, 05:17:11.709Z "ff000000 sights 13483 at (24064, -45204, -41) in 3c, cell 9731; the record stood in 133c8", Sigrid gardening outdoors on her host while her record sat in her house; and the case with no record at all: x-npc-late-join 20261023-092309 on train-36 had Hilde 0x35534 live in both games with no server line naming her, because the host's roster never carries a named resident (the attach events skip persistent references; npc-puppet.md, playtest 33), so the roster's source is the first fix and this row's move-the-record rule covers the records that exist |
| an engine reference reported from another cell on a puppet screen: today it stands where it is (formView.ts:549-556 returns on RespawnNeededError for an id under 0xff000000; movementApply.ts:398-424 throws it on a world-or-cell change or an unloaded far reference) | code | imposed: the puppet's reference moved to the record's cell and point with TESModPlatform.moveRefrToPosition (skyrimPlatform.ts:3377; the player's own path, remoteServer.ts:277 and :526); H5 CONFIRMED for a non-player reference and an unloaded interior: the viewer moved its engine reference into a house its game had not loaded, no crash (x-handoff-door 025527; v6 054447 all four legs; b-npc-handoff-door 161002) |
| the leveled identity of a creature differing between two engines at a pass (npc-puppet's H10); a death during a handoff; 105a35's spawnPoint_pos at the lab spawn (LOG:2248) | playtest 31 | later: npc-fate |
| a restart's grants: both games reconnected within 6 ms and the server split the loaded cells in the same 20 ms by arrival order alone, nine to ff000001 (9732, 9751, 9750, 9712, 9731, 974f, 9730, 9713, 9711) and three to ff000000 (9752, 9714, 9733) | playtest 32 | imposed: decision (f), the cold start's split; the records stand as saved (cell-host.md:305-307) |

The parity scenario (ADR-031) is c-riverwood's handoff leg (cell-host.md:
382-389); its `later:` list is the npc-fate row above; no yaml of its own.

### Sequences and combinations (ADR-033)

| sequence or combination | probe or scenario | result |
| --- | --- | --- |
| the cell handed over again at a person's rhythm (the host out past the grace, back, out again, three times in two minutes; the keyframe each time) and interrupted: the old host back inside the grace (no pass, the epochs unchanged); the new host relaunching during the grace (unhosted at the kept epoch); a restart between the keyframe and the grant | b-npc-handoff | |
| two seats walking the west column's boundary at a person's rhythm for two minutes (the flicker) | x-handoff-flicker, b-npc-handoff | |
| an actor across each boundary: into nobody's cell the host loads (105a35's shape), into the same host's cell, into the other host's cell, through a door into an unloaded interior and out of one by schedule; the boundary wanderer back and forth under D22's margin and the settle | x-handoff-ring; b-npc-handoff (the predator, the night); x-handoff-door; x-handoff-cross | |
| after a login (a late joiner's CreateActor is its keyframe: transform, animation, equipment, the word; PartOne.cpp:957-1060) and after a restart (every cell unhosted; the split by (f); the records indoors by (g); the first grant's keyframe from the record) | b-npc-handoff | |

## Authority

Rung: R0 for who simulates an actor (the cell's host, a follow, a per-actor
pass, the roster's placement), for the dwell and the settle that damp a pass,
and for the keyframe the server sends; R1 for the host's cell-change report
(the sender simulates the actor, the destination adjacent or a door's, the
sender's game loads it) and for a sighting; R2 for the actor's cell and
transform as the host's engine has them, and for a door transit's
destination this slice (no door-link index yet; TES3MP takes cell changes
from anyone, tes3mp.md:85, :282-289; here the simulator's alone, logged,
rule 5); R3, declared: the puppet's smoothing and settle, the new host's
camera and HUD.

### Decisions for Eli (one ADR, its number to be assigned)

The current rule, read at 25be67c7 (the Rust table's lines are under
Server). PartOne::MayMoveActor (:1606-1626): no destination, refused; the
same cell, accepted when the sender hosts it; another cell, accepted when
the sender hosts the destination and the origin is unhosted or its own. The
exact line to change is :1624, `return hostOf(destCell) == me &&
(originHost == 0 || originHost == me);`, with ActionListener.cpp:90's HostOf
and MovementValidation.cpp:115-120, which today bounds that change at no
distance.

(a) A host follows its actor. R0 for the follow, R1 for the report. A move
by the actor's simulator into a cell nobody hosts is accepted when the
sender's game has the destination loaded (its CellLoaded set, cells.rs:
84-85) and the destination is adjacent to the origin square (Chebyshev
distance 1 in one worldspace) or a door's interior (an interior CELL; until
memo D54 B, 2026-10-28, also a persistent ACHR, kPersistent 1 << 10,
TESObjectREFR.h:181, since dropped: every actor's door counts, fork
m3-door-walk 88c350b6, CellMoveFacts' door fact). The server
records a follow, actor to (player, origin cell, its epoch), which
simulator_of(actor) answers while the cell is unhosted and which a grant of
the cell (FlipHostedFlags, PartOne.cpp:1389-1403), the follower's Gone or
unload, or a move into a hosted cell ends. ADR-035 point 8 (:1320-1321)
refined: a cell no game has LOADED freezes; a loaded, unreached cell keeps
its actors under the last host that moved them. A followed actor is pinned
to its follower's listener set, since the grid drops an emitter two squares
out (cell-host.md:66-70; MpObjectReference.cpp:554-555); the alternative is
a 5x5 grid. Row: imposed.

(b) Damping the edge flicker. R0. Two election knobs, UNMEASURED
placeholders until x-handoff-flicker sizes them (ADR-033 point 5):
GRACE_REACH_MS 15_000 for a lapse of reach alone while the host's game still
loads the cell (GRACE_MS 5000 for an unload or a Gone), and
CANDIDATE_DWELL_MS 5_000, a visitor counting as a candidate only after being
eligible that long (a pass, not TES3MP's takeover by ping, tes3mp.md:33-37).
Server-side: the unload report is a client's word (rule 5). Assertion: under
two hands-changes a minute on the west column. Row: suppressed.

(c) The saved state replayed before the grant. R0. Before HostGrant for a
cell, the server sends the new host one ActorHandoff per actor standing in
the cell among that player's emitters: the record's world or cell, position
and heading, the epoch of the grant it precedes, and npc-stream's three
in-memory fields (furniture, combat target, package; 0 for none), on the
grant's own ReliableOrdered channel, TES3MP's order (tes3mp.md:164-168,
:194-196). npc-stream's HostedActorState (npc-stream.md:356-381) gains
`furniture: u32` with its check (rule 4); until it lands the keyframe
carries the record alone. Row: imposed.

(d) An actor crossing into another live host's cell. R0 for the pass, R1
for the report. BUILT 2026-10-25 (train-46, fork m3-train-46 78ed369c, off
parity 0bc54e17) after playtest 34 exposed it: a server restart's cold start
gave Sigrid's two cells, 9712 and 9731, to different players (D10 by ring,
within 10 ms) and every crossing between them was refused, seven a second,
test 2's engine walking her live where test 1 held her record (numidium's
read of the server log, 21:40 to 21:44Z). The build: wire-rules'
MoveVerdict::Pass for the simulator's adjacent crossing into a cell another
live player hosts (a teleport across squares or a stranger's report stays
refused; the pass ends any follow); the server applies the move as a hosted
cell change and flips the word per actor through UpdateHoster (the new
host's game hears "not hosted by other" and goes live from the relayed
point, the sender's hears "hosted by other" and demotes; the sender's
further reports are dropped by the verdict), one info line "npc-handoff D9:
X now simulates Y in cell Z"; no ActorHandoff message (the clients already
act on the per-actor word and the new host's puppet stands at the relayed
border point), and no tenure in this slice (ACTOR_TENURE_MS stays
UNMEASURED: a border shuttle passes at every crossing, each pass a demote
and a promote; the lab read says whether that thrashes). T0: wire-rules'
tests (a crossing both ways, the refusals), CellHostTest's case (the record
moves, the simulator flips, both words sent, the old host's report dropped,
the new host's accepted, the crossing back). T3: x-handoff-cross by path
(the restart scenario's shape, the premise that the two cells' hosts
differ, three minutes of her shuttle, no refusal, at least one pass, one
seat's AI on at the end), on 46's stage after the playtest. The server accepts the origin host's sample when the
destination is adjacent and hosted by another player, writes the record,
sends that player an ActorHandoff, then flips the word both ways through
UpdateHoster (MpObjectReference.cpp:746-770); the new host's game promotes
at the word, the old host's demotes, the gate drops its stale reports. The
tenure (ACTOR_TENURE_MS 10_000, UNMEASURED, never built) is retired in favour
of D9's settle (2026-11-03): the new host's report back into the cell the
actor came from inside handoffPassSettleMs is a stale copy's sample, and the
passing report reaches the new host reliably ahead of the word (TES3MP's
shape, tes3mp.md:85, read as a fencing token rather than a lease). Row:
imposed.

(e) A refused actor is not reported every tick. R0 for the log, R1 for the
report. Stump's 751 refusals in five minutes are one warn line per sample
(ActionListener.cpp:193-202) for an actor whose word still names the host.
The server logs a refusal once a minute per actor (PartOne.cpp:1489-1505's
idiom) and counts the rest; the client's report list (hostService.ts:91-108)
drops an actor in a cell it neither hosts nor loads. Row: suppressed.

(f) The cold start's split. R0. After a restart every cell is unhosted and
the first reporter wins (ADR-035 point 2), so two games reconnecting within
6 ms split Riverwood by arrival order, nine cells and three. Proposal: in a
table with no host anywhere, a grant waits CANDIDATE_DWELL_MS and goes to
the eligible player nearest the cell's square. Alternative for Eli: leave
it, since hosts never churn. Row: imposed.

(g) The record indoors while the engines bring the actor out. R0 for the
placement, R1 for the sighting, R2 for the position. A record in a cell no
game has loaded subscribes nobody (an interior is not in the exterior
grid): no CreateActor, no word, every engine runs the actor by schedule. The fix: a sighting
(ActorSightings, npc-puppet.md:577-600) of an actor whose record sits in a
cell nobody hosts moves the record to the sighter's cell; the grid then
carries it to every game and the word follows. OnActorSighting admits that
case today (PartOne.cpp:1536-1541), so H9 asks first why no sighting
arrived (the roster reports only attached references the world model lacks,
hostService.ts:244-300; the six were attached before the reconnect). D11
PROVEN: the roster's sighting after the reconnect moved the record out and
one seat ran him (x-handoff-night 230913); playtest 32's missing sighting
was the reconnect's loss path demoting every game-file actor and the no-3D
demote clearing its AI, fixed fc7b2718
(b-npc-handoff-night 161723). Row: imposed.

## Engine surface

Nothing new is hooked (ADR-034): the moments are the server's decisions and
Skyrim Platform's existing events and natives; the headers are cited so
each imposition's target is explicit.
- An actor's cell: RE::TESObjectREFR parentCell (CommonLibSSE-NG include/
  RE/T/TESObjectREFR.h:496), GetParentCell (:413), GetSaveParentCell
  (virtual 97, :351), SetParentCell (virtual 98, :352), IsPersistent (:453;
  RecordFlags kPersistent :181); a persistent reference's exterior parent
  cell is the worldspace's (TESWorldSpace.h:188; ExtraPersistentCell.h:22),
  so the server computes CellOf from the position; RE::TESObjectCELL
  cellState kAttached (TESObjectCELL.h:139, :259), cellDetached (:261).
- The imposition of a point: TESObjectREFR::MoveTo (:456), MoveTo_Impl
  (:507), SetPosition (:469-470); Actor::SetPosition (virtual 0A9, include/
  RE/A/Actor.h:367); TESModPlatform.moveRefrToPosition (skyrimPlatform.ts:3377).
- The promote's calls: Actor::EnableAI (Actor.h:521; the fork's setPuppet),
  EvaluatePackage (:523; Papyrus Actor.evaluatePackage, skyrimPlatform.ts:
  2043, buffered to the first AI tick, re-ai-puppet.md:341-347),
  GetOccupiedFurniture (:556), ActorState sitSleepState (ActorState.h:112,
  SIT_SLEEP_STATE :65-80; getSitState :2090), startCombat (:2206).
- The engine's moments, sunk by Skyrim Platform and read, not hooked:
  RE::TESMoveAttachDetachEvent (TESMoveAttachDetachEvent.h:9-18;
  EventHandler.h:49; H4 reads only whether it fires at a grid crossing),
  RE::TESFurnitureEvent { actor, targetFurniture, type kEnter, kExit }
  (TESFurnitureEvent.h:9-23; EventHandler.h:41; Definitions.txt:389-392).
- Address Library IDs: none new. The ids the Dynamic plan names are
  re-ai-puppet.md's (Q4, :335-350, resolved there by `just addr`) and
  TE-MAP.md:66's leads, each verified per rule 1 before a script names it.

## Observe (host or acting client sees the intent before the engine acts)

- Hook point: none in the engine. The crossing is read on the server from
  the host's 130 ms sample (MovementData world_or_cell and pos, skymp.rs:
  296-324; CellOf at ActionListener.cpp:190-192); the hands-change is the
  server's own decision; the record indoors is the roster's sighting.
- SP filter (minSelfId / maxSelfId / eventPattern): none (rule 9 met).
- Data captured: the keyframe's fields from the record and npc-stream's
  memory; on the host the last furnitureEvent target per hosted actor
  (getOccupiedFurniture is not a Papyrus native) for the `furniture` field.
- Side effects of hooking here: none expected (x-handoff-flicker reads it).

## Impose (observers render the server's decision)

- Mechanism: ActorHandoff to the new host (Message contract), applied at
  the promote: PuppetService.ensureLive takes the keyframe in place of the
  view's model.movement (puppetService.ts:101-117 writes position and
  heading, then setPuppet(false)); with the AI on, Actor.evaluatePackage,
  and Actor.startCombat on the keyframe's target when it is not 0 (ADR-035
  point 7's order, :1309-1319, unbuilt with D8 and H3's known limit
  meanwhile; re-ai-puppet.md:341-347: a reset evaluation stops combat, so
  combat is restored after it). The word's flip stays the trigger (ADR-045
  point 2). A puppet whose record moved to another cell: moveRefrToPosition
  to the record in formView's RespawnNeededError branch
  (formView.ts:549-556), where today it returns.
  A record moved by the roster (g) takes npc-puppet's placement path
  (PartOne.cpp:1546-1553).
- Visual without simulation achieved by: the puppet already stands at the
  relayed point (b-npc-puppet 104032: 0.004 units from the host; a76125cb's
  settle), so the promote moves it by the deadband at most.
- Side effects: six. H1: EvaluatePackage at the promote walks the actor on
  from its position (falsified by a track sample over 256 units in the 10 s
  after). H2: a puppet whose graph played the furniture enter has
  sitSleepState kNormal; the promoted engine re-enters within 15 s, or
  stands (read, not asserted). H3: startCombat on the recorded target
  restores the fight (falsified by inCombat false 3 s after). H5:
  moveRefrToPosition moves a puppet engine reference into an unloaded
  interior without a crash. H7: the returning old host's puppets stand at
  the record within one report. H9: a resident's sighting after a reconnect
  reaches the server and places him outside, so one game puppets him. H1
  HYPOTHESIS until c-riverwood's claim 2; H2 HYPOTHESIS until x-handoff-sit;
  H3 a known limit (the target not imposed); H5 CONFIRMED (025527, 054447);
  H7 CONFIRMED: the demoted old host's puppet, bound at its re-entry, within
  150 units of the live Alvor (b-npc-handoff-door leg 4 :84-95, 054447,
  161002); H9 CONFIRMED (230913, 161723).

## Suppress (engine's own behavior blocked on non-hosts)

- What is suppressed: a pass inside CANDIDATE_DWELL_MS and a reach-only
  lapse inside GRACE_REACH_MS (the flicker); the new host's report back into
  the cell its actor came from inside the settle window (D9's settle, the
  tenure's replacement); a non-simulator's report (ActorUpdatableBy through
  simulator_of) and its per-tick log line (e); a hosted cell change at any
  distance (MovementValidation.cpp:115-120 bounded to adjacency or a door);
  the freeze of a loaded, unreached cell (its actors follow); a second
  engine running a resident whose record sits indoors (g). How: the Rust
  table's verdicts (Server), the core's gate, PuppetService at the word.
- Release condition: a grant to anyone ends a follow; a pass's settle ends
  with its window (pruned at the tick); a release, a Gone or an unload ends
  the follower's standing; the knobs are server settings
  (handoffGraceReachMs, handoffCandidateDwellMs, handoffPassSettleMs), 0
  reproducing the rule without them.
- Side effects: two. H6 CONFIRMED: the follow held from an interior outside
  every grid, the record going home under its follower's report
  (x-handoff-door 025527, 054447), the pin holding where the grid drops him.
  H8, cell-host's, a known limit: the old host's unloaded copy wanders by
  the engine's low-process schedule until the word or the attach rebinds it,
  then snaps to the record (D11's note in the Status box; 041126's 500 units
  closed at the cell's load); the gap at 60 s is unmeasured and accepted
  (r-cell-leave 083700).

Known limits: The combat target (H3) is not imposed at a promote (D8's
keyframe unbuilt; npc-stream.md:518's limit): the record carries none, a
handoff drops the fight and the new host's engine re-acquires it by its own
senses, TES3MP's shape (tes3mp.md:187-191); c-dungeon-enemies as drafted has
no handoff leg, so the re-acquisition stays unread. The old host's unloaded
copy (H8) wanders by the engine's low-process schedule until the word or the
attach rebinds it, then snaps to the record (D11's note in the Status box;
041126's 500 units closed at the cell's load); the gap at 60 s is unmeasured
and accepted (r-cell-leave 083700).

## Message contract

- ActorHandoff, new, S2C: the next MsgType and wire id at the commit, in
  table order (ADR-012; wire-schema lib.rs:440-507, TABLE and WIRE_IDS 59;
  id = MsgType + 8, :509-510): MsgType 52 and wire id 60 after npc-stream's
  HostedActorState 51 and 59 (npc-stream.md:356-361), 51 and 59 if this
  verb lands first. ReliableOrdered on channel 0, the grant's own
  (wire-transport channels.rs:26), so the keyframes precede the grant. Cap
  128 bytes; SCHEMA_VERSION up by one (:35). Fields (`"t": 52`): idx u32,
  epoch u32 (the destination cell's epoch of the grant it precedes, or the
  current one for a pass), worldOrCell u32, pos Vec3, rot Vec3, furniture
  u32, combatTarget u32, package u32 (0 for none). Idempotent per (idx,
  epoch), later wins. Validator (wire-validate, the same commit, rule 4):
  check_handoff in validate_server (lib.rs:579; check_host :437 and the
  Teleport arm :606-611 are the idiom): finite floats (E_VAL_NONFINITE), the
  position in the world (E_VAL_OUT_OF_WORLD), epoch above 0 (E_VAL_RANGE),
  idx below u32::MAX; a proptest (:1606-1608's shape); the C++ message, two
  wire-json fixtures, docs/WIRE.md (:178-184, :232-256), `just wire-header-check`.
- UpdateMovement 2 (skymp.rs:296-343), ActorSightings 50 (:1495-1515;
  check_sightings, wire-validate lib.rs:475), HostGrant 48, HostRelease 49
  (skymp.rs:1441-1470) and UpdateProperty 7: bytes unchanged; the server's
  rules change (Server). HostedActorState 51 (npc-stream's) gains
  `furniture: u32` with its check; a field no event fills is dropped before
  merge (rule 4, npc-stream.md:222-223). Teleport 20 is not reused: no
  epoch, its receiver the current host (MpActor.cpp:2020-2036, :518-530).
- Idempotency / ordering: ActorHandoff before HostGrant on one ordered
  channel; a stale epoch is ignored by the client (hostService.ts:169-181).
  Contract doc updated: yes, in the same commit (above).

## Server

- Where the logic lives: the verdicts in Rust (ADR-010), the handlers in
  the core.
  - wire-rules cells (cells.rs; today: eligible means reach and loaded both
    hold the cell, :151-153; the first eligible player takes an unhosted
    cell, :158-179; a lapse of either arms GRACE_MS, :23, :162-168; the
    deadline ranks by round trip or goes Unhosted, :184-227): a follow table
    actor to Follow { player, cell, epoch, since_ms }; `may_move(sender,
    actor, origin, dest, adjacent, now) -> MoveVerdict { Accept, Follow,
    Pass { to }, Refuse }` reading the sender's loaded set (:84-85);
    `simulator_of(actor, cell)`; the three knobs, UNMEASURED; `consider`
    arms the reach-only grace apart; `candidate` takes the dwell and, in an
    empty table, the nearest player (f); `tick` emits Unhosted { cell, was,
    still_loaded }; a grant clears follows and passes. T0 beside the seven.
  - PartOne::MayMoveActor (:1606-1626) becomes the thin call; ActionListener
    ::OnUpdateMovement (:173-214) handles the four verdicts: Accept as
    today; Follow records it, pins the actor's subscription to the sender
    and logs; Pass writes the record, sends ActorHandoff to the
    destination's host and calls UpdateHoster(new host); Refuse drops,
    logged once a minute per actor and counted (e). Adjacency: Chebyshev 1
    between two squares of one worldspace, or an interior through a door
    (the persistence fact retired by memo D54 B, m3-door-walk 88c350b6);
    MovementValidation.cpp:115-120 stands
    aside only for an accepted verdict. HostOf (:1272-1290) asks simulator_of.
  - ApplyHostDecisions (:1405-1451): Grant sends one ActorHandoffMessage
    per actor of the cell among the host's emitters (FlipHostedFlags'
    iteration, :1389-1403), then HostGrantMessage, then the flips; Unhosted
    with still_loaded converts the cell's actors last moved by that player
    into follows, logged. OnActorSighting (:1485-1553) keeps its gate
    (:1536-1541), moves a record out of a cell nobody hosts as today, and
    counts the roster's arrivals per reporter (g, H9).
- DB fields / migration: none; follows, passes and the keyframe's three
  fields are memory by design (npc-stream.md:496-500); b-npc-handoff's
  restart step proves what persists (rule 6).
- Restart behavior: every cell unhosted, every follow forgotten; the split
  by (f); the records indoors brought out by (g); the keyframe from the
  record (the three fields 0).
- Papyrus natives touched: none (ledger unchanged); EvaluatePackage and
  StartCombat run on the client through Skyrim Platform's wrappers.

## Client

- SP binding: none new (the natives and the two sinks exist).
- TS handler: HandoffService (skymp5-client services, hostService.ts:31-34's
  settings idiom): keyframes per idx from actorHandoffMessage, dropped at a
  stale epoch; PuppetService.ensureLive(refr, keyframe ?? model.movement)
  (puppetService.ts:101-117), then evaluatePackage and startCombat, logged
  `[verb:npc-handoff] keyframe <id>` and `promoted <id>`; a furnitureEvent
  sink keeping the last target per hosted actor; formView's
  RespawnNeededError branch for an engine reference (formView.ts:549-556)
  calling moveRefrToPosition to the record, logged `moved <id> into <cell>`,
  never for the actor's own simulator except at the moment of its promotion
  by a pass (the record is the previous simulator's truth then; the door's
  pass of 2026-10-28, fork m3-pass-promote ae45544e, logged `at its
  promotion`); nothing else applied to an actor this game hosts (Rule A,
  ADR-045 point 4); the
  report list skips an actor whose cell this game neither hosts nor loads
  (e); the roster re-reads its attached set at a reconnect (g).
- Kill switch config key: `npcHandoff` under skymp5-client's settings: off,
  the keyframe is ignored, no cross-cell move, no furniture field (today's
  client); the server's rule stands. A bisect switch, not a play mode.

## Tests

- T0: Rust, wire-rules cells: Follow into an unhosted cell the sender
  loads; Refuse into one it does not load or two squares away; Follow into
  an interior through a door (any actor since D54 B: CellHostTest's two
  non-persistent cases, Hilde 0x35534 into RiverwoodSvensHouse 0x1cb84,
  unhosted and frozen, then into a live host's cell, passed); simulator_of
  answers the follower
  while unhosted and the host once granted; a grant, the follower's unload
  and Gone each end the follow; Pass { to } into another host's adjacent
  cell, Stale for the new simulator's report back into the cell the actor
  came from inside PASS_SETTLE_MS (dropped, no refusal), Pass back after;
  GRACE_REACH_MS for a reach-only lapse, GRACE_MS for an unload; no
  candidate under the dwell; the nearest player in an empty table (f).
  wire-validate: check_handoff (a NaN, an out-of-world point, epoch 0, idx
  u32::MAX refused; a full keyframe accepted) and the proptest. C++,
  unit/CellHostTest.cpp's shape (the fixture :30-55, its clock margins): the
  wolf 4500 units into kEast, loaded by c1 but outside its reach, is a
  follow (c1's reports accepted, c2's dropped, c1 still a listener), ended
  by kEast's grant to c2; the wolf into c2's hosted cell is a pass (the
  message to user 1, the word both ways); the keyframes precede the grant
  in p.Messages(); a second refusal within a minute only counts; a sighting
  of Sigrid with her record in 0x133C8, unhosted, moves her (:399's case).
- T1: none (no new Address Library id, no hook).
- T2: difftest session npc-handoff.yaml: a fakeclient's movement for a
  hosted NPC into an unhosted cell (both servers drop it); the legacy server
  knows no ActorHandoff. The hosted cases need an NPC, which T2's servers do
  not load (npc-puppet.md:706-711).
- T3 scenario ids, this slice (D6, D10, D11; committed 22:54 PDT on main
  23885e70, each in its own commit, rule 13): lab/scenarios/
  b-npc-handoff-door.yaml (the follow through a door, the viewer's reference
  moved, the grant at the viewer's entry, the unsubscribed puppet's bind: x-
  handoff-door v6 GREEN 054447), b-npc-handoff-restart.yaml (the nearest
  player's grants after a restart: x-handoff-restart GREEN 222408),
  b-npc-handoff-night.yaml (the record brought out of an unhosted interior:
  x-handoff-night GREEN 230913). The second slice's scenario (D7 to D9),
  sketched below as b-npc-handoff.yaml, waits for its grammar.
- T3 scenario id, the second slice: lab/scenarios/b-npc-handoff.yaml. Two seats, Riverwood as
  b-npc-puppet lays it (Tamriel 0x3C, 0x9732 at (4,-12), the clock to 7.9,
  npcEnabled, tgm on both as b-cell-host has it), c1 first. Grammar first
  (a scenario needing new facts lands after them): server.simulator(id)
  with .client and .kind (host, follow, pass); server.handoff(c).passes,
  .follows, .keyframes, .refused, .sightings (labState kinds `simulator`,
  `handoff`); c.log_count(pattern); server.host(cell).epoch counts grants.
  - the ring (a): c1 at the landing (17225, -47204, -128) hosts 0x9732;
    wait 20 (the roster); snapshot server.ref(0x13483) as "sigrid"; c1 two
    cells east (x about 26000: 0x9732 still in its 5x5, outside its 3x3), c2
    at the lab spawn; wait 20: server.host(0x9732).hosted == false;
    server.simulator(0x13483) == follow by c1; server.ref(0x13483) over 100
    units from "sigrid"; c1's aiEnabled true; server.handoff("c1").refused
    == 0.
  - the flicker (b): c2 to the landing; both seats `move` (index.ts:1859)
    at 150 units a second across the west column's boundary (x 16384) and
    back, offset by 10 s, for 120 s; server.host(0x9733).epoch and
    server.host(0x9752).epoch each rise by at most 3 (under two a minute);
    c1.log_count("live 13489") + c1.log_count("puppet 13489") <= 4, c2 too.
  - the handoff with its keyframe (c): c1 to the lab spawn past the grace;
    wait 8: server.host(0x9732).client == "c2"; c2.log_count("keyframe
    13483") >= 1, the line before "hosting cell 9732"; a watch on c2 across
    the step: c2.watched_id(0x13483).maxDisplacement < 256 (the exit's bound
    is 1024, cell-host.md:386-387); c2's and the server's positions of
    0x13483 within 64 units inside 10 s.
  - the door (a, e): a watch on both with 0x3550C and 0x1e62b; wait until
    c1.watched_id(0x3550C).first_event("IdleActivateDoor") or 120 s:
    server.ref(0x3550C).worldOrCell == 0x133C6 within 5 s of c1's report;
    c2.log_count("moved 3550c into 133c6") == 1; c2 enters the inn:
    c2.npc_state(0x3550C) resolves inside, its cell 0x133C6, within 10 s;
    server.handoff("c1").refused < 10 over the run (Stump's 751 gone).
  - the pass between live hosts (d): b-cell-host's predator cell 0x9810 and
    its western neighbour by lab-spawn offsets: c2 hosts 0x9810 (first
    loader), c1 the cell west, both in tgm at the boundary; the predator
    0x85547 attacks the nearer player and crosses: within 5 s of its
    record's cell change server.simulator(0x85547) == pass to c1; c1's
    aiEnabled true and c2's false; both watched tracks within 256 units of
    each other, maxDisplacement < 128 on each; server.handoff("c1").passes
    >= 1.
  - the night (g): the clock to 23.0 and wait 60 (the residents home:
    server.ref(0x13482).worldOrCell == 0x133C8); server restart; both
    reconnect; the clock to 7.9; wait 60: the two seats' sightings > 0;
    server.ref(0x13482).worldOrCell == 0x3C within 30 s of Alvor's first
    outdoor sample; exactly one seat's aiEnabled true for 0x13482; the two
    seats' positions of him within 256 units (no 49,000-unit split).
  - the restart (f): server restart, both reconnect, wait 15: server.host
    (0x9732).hosted == true and its client the seat standing in it;
    b-npc-puppet's invariant (never two games live on one resident, yaml
    :99-113); server.simulator(0x13483).kind == "host". dump-state on both;
    artifacts server.log, c1.log, c2.log, screenshots. c-riverwood
    (cell-host.md:382-389) runs on the merge, Embry's door included.
- Probes by path, drafted 2026-10-23 for train-40's stage (lab/.cache/probes,
  numidium runs them once the grammar lands: npc_state(id).cell, c.log_count,
  server.follow(id), `server: restart {gameHour}`): x-handoff-door (the clock
  at 19.9, Embry 0x3550C into the inn 0x133C6: the record follows within the
  until's window, the follow names c1, c2's log has "moved 3550c into 133c6",
  both engines have him in the inn; then c2 walks in: the inn granted to c2,
  the follow ended, c2 runs him); x-handoff-restart (c1 in 0x9732, c2 one
  square west in 0x9733, restart, both reconnect: each cell to the player
  standing in it, Alvor live on c1 alone, no churn a minute on);
  x-handoff-night (23.0, Alvor home to 0x133C8, restart at 7.9, his record
  outdoors within 180 s of the reconnects, c1 alone runs him). Their reds
  are findings; their greens tick D6, D10 and D11's rows and H5.
  First runs on train-40's stage 661bc67a (15:34 PDT, numidium's reads):
  x-handoff-restart 20261023-222408 GREEN, D10's split by nearness holds
  (each square's cell to the player standing in it, Alvor live on c1 alone,
  no churn a minute on). x-handoff-night 222831 RED on the probe's own fact
  (npc_state .cell is the parent CELL, 0x9732 outdoors, not the worldspace):
  the claim held, Alvor's record outdoors after the restart, c1 live, c2's
  puppet blocked; the probe compares 0x9732 now. x-handoff-door 222127 RED
  on its premise: at 19.9 Embry's record already stood in the inn and both
  engines had him there, so nothing crossed; v2 starts at 19.7 and waits
  for Alvor's record to come out by the roster and go back into his house
  under the host's report, D6's Follow, with Hod as the fallback resident.
  D6 is unproven until v2 runs; D10 is proven; D11's night step held.
  Reruns (16:14 PDT): x-handoff-night 230913 GREEN (the record in his house
  at 23.0, outdoors after the restart at 7.9, c1 live, c2's puppet blocked:
  D11 proven). x-handoff-door v2 230339 RED on the file's fact again:
  outdoors the server's record cell is the worldOrCell descriptor, the
  worldspace "3c:Skyrim.esm", and the interior only indoors (the client's
  .cell is the parent CELL); Alvor was out the whole time. v3 waits for the
  worldspace, then for leaving it (wherever his evening takes him), and
  compares the two engines' cells to each other.
  x-handoff-door v3 231505 RED, a finding (16:46 PDT, numidium's read):
  Alvor's record went into his house through the server's DOOR activation
  branch, not a follow. The client blocks every door's activation and
  reports it with the NPC as caster; the branch teleported the record
  indoors and sent a Teleport the host's game does not apply to an NPC, so
  the host's engine stood at the door, the record left the host's grid, both
  seats demoted him (the host too), the host's roster sighted him outdoors
  and brought the record back, and the loop ran every 4 s: residents stand
  at their doors with their AI blinking and never go home, on parity too by
  construction (the activation path and the roster predate train-40; not run
  on parity, which trains 39 to 44 left with the fix at 8efabb10). Fix on
  train-40 (7d46becf): for an
  activator no user plays the branch asks the follow verdict
  (WorldState::npcDoorVerdict, MayMoveActor for the actor's simulator), then
  an SpSnippet to the host's game, ObjectReference.Activate on the door with
  the actor and default processing, the engine's own transit; the record is
  not moved by the server and follows the host's next report; a refusal
  leaves the actor at the door. The claim for v3 on the new stage: Activate
  with default processing moves an NPC through a blocked door as it moves
  the player. CONFIRMED: the snippet's Activate with default processing
  walked Alvor through his door under his package, the record following his
  host's report (x-handoff-door v3 001915, v4 013234 twice; D6 PROVEN
  025527). The gate set of 661bc67a no longer cites 40; a fresh
  stage, T2 and gate follow on the new head. Pipeline 2786 on 7d46becf red
  on upstream's BrokenOarGrotto case (a runtime actor with no user activates
  an auto-load door through Papyrus and the server moves it), so the host
  path narrowed (16:58 PDT, f53592d6): only a game-file actor whose
  activation came as its host's report (Activate's reportedByHost, set by
  OnActivate for a hosted caster); a script's, a runtime actor's or a
  player's door keeps the server's transit. x-handoff-door v3 on f53592d6
  (run 20261024-001915, 17:29 PDT): the host path WORKS (the snippet walked
  Alvor into the inn under his evening package, the record followed at
  "133c6", the follow names c1), the viewer's did not (c2's engine kept him
  at the door, AI off, no "moved" line; c2's game had also been replaced
  30 s into the run, a separate fault numidium's agent reads). Two
  mechanisms for the viewer's half (a1c7b41e): formView moves an engine
  reference whenever the engine's own cell differs from the record's, once
  per record cell (a late viewer catches up), and the server, on an
  accepted or followed cell change, sends every listening game but the
  host's a Teleport for the actor before the record moves, so the grid's
  DestroyActor follows it in order and the viewer's engine has already
  moved its reference (remoteServer's onTeleportMessage). CONFIRMED both
  ways: the viewer's reference moved by formView's cell rule (025527) and by
  the server's Teleport ahead of the unsubscribe (032354, 041126); v6 054447
  all four legs; b-npc-handoff-door 161002. The
  door agent's read of 001915 (17:44 PDT): the
  server's lines show the snippet walking Alvor into his house at 00:21:17
  (before the probe's first wait), a false "no host to walk it" at the exit
  door at 00:23:10 (the door's pre-check called MayMoveActor, which REMOVED
  his standing follow before the host lookup; c1's engine walked him out
  anyway), then the inn at 00:23:44; c2's game had crashed at 00:20:30 in
  Actor.UnequipAll on its deleted copy of c1's character (kDeleted) and
  launch.ps1 relaunched it; c2 then got only the grid's DestroyActor at the
  crossing (the unreliable relay and nothing after), so a view update never
  came; c1 threw on 'tick' five times setting an interior door's isOpen on a
  form it held no model for; and the lab's log-count reads the Skyrim
  Platform log, so a printConsole line is invisible to it. Four fixes
  (62875e84): cells.rs judge and PartOne::WouldMoveActor, the door's
  pre-check with nothing recorded (the follow is the host's report's);
  applyEquipment and formView skip a deleted reference; a property for a
  form not held is skipped with a trace; the "moved" line through logTrace.
  numidium keeps a crashed game's Skyrim Platform log across the retry (main
  2492956) from this stage on. v4 on 62875e84 (013234, 18:44 PDT): no crash;
  the host path worked twice (the snippet walked Alvor into the inn, the
  follow named c1, "told to 1 viewing game" went out), but the record
  bounced out 133 ms after the first follow on the host's next report (a
  sample before the engine's transit, or reordered on the unreliable
  channel), and c2's engine still kept him at the door with no "Teleporting"
  line in its log at all (the handler never ran: a dispatch question the
  door agent reads); the viewer Teleport also fired on every exterior
  border crossing inside both grids, about thirty in four minutes. Fixes on
  46ed9c5e: FOLLOW_SETTLE_MS (1 s, UNMEASURED) refuses a report back into
  the cell left under a follow younger than the window; the Teleport goes
  only to games outside the destination's 3x3, the ones the move
  unsubscribes. The door agent's read of 013234 (18:54 PDT) corrected two
  assumptions: the viewer's Teleports DID reach the handler (the ragdoll
  calls it makes were logged 0.1 s after each "told to 1"), but the handler
  deferred everything to the next update and the same tick's DestroyActor
  freed the idx and the view first, so the deferred lookup found nothing;
  and the 133 ms flip-back was the host's own formView moving its own Alvor
  back out (the host never hears its own reports, so its model lagged its
  engine), not a stale sample. Also: logTrace is printConsole with a prefix,
  the in-game console alone, which lab-api's log-count never reads; the
  [verb:npc-puppet] lines that do appear are the native side's. Fixes on
  7f74336f: the Teleport resolves its reference at message time and defers
  the move alone; the engine-cell rule skips an actor this game simulates
  (HostService.isMine); logging.logLab writes through writeLogs to the
  Skyrim Platform log, and the "moved", "Teleport received" and "late fate"
  lines use it. The settle window stays as a guard against reordering.
  7f74336f's stage (023055, 19:37 PDT) refused every teleport, the player's
  own included: the handler's lookup called natives at message time and
  Skyrim Platform threw "can't be called in this context" (the lab's new
  console log showed it on its first run). d698fe38: the lookup at message
  time is pure JavaScript (the idx's model index and the view's stored local
  form id, worldViewMisc.getLocalRefrIdOfIndex), every native waits for the
  update; the ordering fix stands. Lab fact: writeLogs writes
  Data/Platform/Logs/<plugin>-logs.txt; since lab main 91169f23 the driver
  tees every console line into <client>-console.log and log-count counts it
  beside the Skyrim Platform log, so printConsole lines are countable.
  D6 PROVEN (20:00 PDT, x-handoff-door on d698fe38, run 20261024-025527):
  Alvor's record went home ("133c8") under the host's report 5 s into the
  wait, the follow named c1, and BOTH engines had him in 0x133C8 at the same
  point; c2's "moved 13482 into" counted once (the console log); the viewer
  moved its reference into a house its own game had not loaded, no crash:
  H5 held. The run's red was the probe's third leg naming the inn while he
  went home that night (his 19.7 h door varies by run); v5 approaches with
  `cell: record` (numidium's runner reads the record's cell) and asserts
  the follow's end and the two seats' AI without a cell name. The gate set
  runs on d698fe38; the merge waits on Eli's D6 and D12.
- Assertions that would fail if the verb silently regressed: a refusal for
  a followed actor; a frozen record while its host's track moves; an epoch
  step over the bound on the west column; no keyframe line before a grant;
  a jump over 256 at a promote; Embry's record at the door while his host's
  engine has him inside; two seats live on one actor; a record indoors at
  dawn.

## Dynamic plan (fill when any tag above is still HYPOTHESIS)

Of the probes named here, none has been written by path or run as of 2026-10-29 (the pass's inventory): x-handoff-sit
waits for npc_state's sitState in lab-api's grammar (the driver reads getSitState for the player alone); x-handoff-ring,
x-handoff-return and x-handoff-flicker belong to D7's knobs and D8's ActorHandoff, unbuilt, and c-riverwood's claim 2
carries H1 meanwhile.

- Frida script: lab/frida/npc-handoff.js (npc-puppet.js's shape and the
  2026-10-21 pitfalls), on the new host's seat at a promote: entries of
  Actor::SetPosition and the EvaluatePackage thunk per actor in the second
  after the grant, against the client's `promoted` lines (the ids from
  re-ai-puppet.md Q4, each confirmed by `just addr` first; the actor's
  formID at +0x14, TESForm.h:354).
- x-handoff-ring (two seats, the ring step alone, a 60 s watch on c1): H6
  (c1's listener count for 0x13483; no DestroyActor in c1.log).
  x-handoff-flicker (two seats walking the west column for 120 s, the knobs
  at 0 then at the placeholders): the epoch steps per cell and the word
  flips per resident; sizes the two knobs; the frame time on both.
  x-handoff-door (two seats): Embry's and Stump's transits under the
  follow; H5; the refusal count (e). x-handoff-night (the night step alone,
  both seats' roster lines and the server's "sights" and "dropped:" lines,
  PartOne.cpp:1489-1505): H9, and which half fails if the record stays
  indoors (no roster line: the client; a drop line: the server).
  x-handoff-sit (Alvor at the forge, a handoff at his work idle): H2 by
  getSitState and the furnitureEvent. x-handoff-cross (the predator): H3
  and the wanderer under the margin and the settle. x-handoff-return (r-cell-leave's
  shape, the old host 60 s away then back): H7 and cell-host's H8. H4 is
  read from the log in every run.
- Breakpoint plan for a human session: none unless x-handoff-door falsifies
  H5 (then TESObjectREFR::MoveTo_Impl on the puppet seat, the condition "the
  reference is Embry", watching the target cell argument; the lead
  TE-MAP.md:66, resolved per rule 1 first). Owner: agent (Frida); Eli only
  on a falsified H5.

## The viewing seat's hide (playtest 40's F2, 2026-11-02; fork m4-turbo2-settle a020511c)

Hilde (0x35534) on the guest's screen, 20:08:37Z: her host's engine walked her through her door into 1cb84, which nobody hosted
(D6: the server followed her record in, told the one viewing game a Teleport ahead of its unsubscribe, dropped that game's
sightings of her and sent it a Disable snippet once). On the guest, the reference was moved after her, lost its 3D in the unloaded
house, was released to its schedule after the grace (ADR-051, D11), and her own package walked her back out: she stood on the
street as a ghost under the puppet flag while her record sat indoors, the E at 20:09:28 claimed in vain, and the roster kept
sighting her every 10 s (the server's drop lines). b-npc-handoff-door never showed it because Alvor's schedule kept him inside on
both engines.

The rule, in the client (PuppetService.recordCellSeen from the view's engine-reference branch every update; hideInUnloadedCell from
RemoteServer's Teleport handler, since the view is destroyed in the same tick): an actor this game does not simulate whose record
stands in an interior this game has not loaded (Cell.isAttached false) is HIDDEN here, ObjectReference.Disable on its engine
reference, and reconcile never releases a hidden actor to its schedule; when its record is back in a loaded cell (it came out, or this
game walked in) it is shown (Enable, moved to the record) and reconciled (the house granted makes it live, the word makes it a
puppet). The host's own reference is never hidden. Unhosted cells freeze; a seat that does not load a cell sees none of its actors:
the design law's reading of D6 for the viewer. HYPOTHESIS, open until the hide's own probe x-handoff-hide (a draft in lab/.cache/probes, v2 6f7d2025) runs on the hide's branch m4-turbo2-settle a020511c when that branch stages (the hide is not in the system-1 merge m3-system1): the hide fires on the viewer once the
record stands in a cell it has not loaded, the D11 release never runs on a hidden actor (its copy a puppet 25 s on, no "released ...
no 3D here" line), and the show's enable-and-move lands within 15 s of the attach (its v2 claims these after ADR-064's fresh review of
2026-11-03). "Disable holds a puppet-flagged actor" (the server's own snippet did not hold Hilde: that snippet ran while the
Teleport's move was in flight, and the release re-enabled nothing) stays HYPOTHESIS past that run: this frame makes no ghost (Alvor's
package keeps him home on c2's engine too) and npc-state has no enabled field, so a ghost premise (Hilde into 1cb84 under a host,
playtest 40's witness) or an npc-state enabled field is its read; the probe records c2's console getdisabled meanwhile. The same
head carries the furniture hold (movementApply.ts: a puppet in furniture far from its record is told IdleFurnitureExit and, still
held, placed; the settle loop of f4a39's coffin and ff000d9d's bed in playtest 40).

## Status

Doc drafted 2026-10-22 during playtest 32, before any code; the fork lines
at the puppet worktree's head 25be67c7; playtest 32's three live facts
folded in the same night. Decisions for Eli, under Authority: (a) the
follow and its pin against a 5x5 grid, with ADR-035 point 8 refined to
"loaded"; (b) the two election knobs as UNMEASURED placeholders; (c) the
keyframe as its own message against a widened HostGrant, and `furniture` on
npc-stream's state message; (d) the per-actor pass and its tenure; (e) the
refusal's rate; (f) the cold start's split; (g) the roster moving a record
out of a cell nobody hosts; open beside them the door transit's rung, the
wire id and whether the combat target is imposed (npc-stream.md:50). Sources that
disagree: b-npc-puppet.yaml:95-97 times c2's "live" 1.1 s before the
server's grant line (two machines' clocks); ADR-035 point 7 says "its own
copies" where ADR-045 made puppets
engine references; PLAN.md:1050-1051's "the server replays state into the
engine" is the client's own record today (puppetService.ts:101-117);
MovementValidation.cpp:115-120 bounds a hosted cell change at no distance
against 4096 for a same-cell report (:22, :122-128).

Built, first slice (train-40, fork m3-train-40 df5ee477, 2026-10-23 14:00
PDT, stacked on m3-train-39; the decisions as ADR-047, PROPOSED, D6 to D11
at option A, Eli's D6 answer open: "for D6, i dont love A", numidium's
answer that A moves no player pending its reply): D6 the follow (cells.rs's
follow table and may_move verdict; PartOne::MayMoveActor's facts from libespm;
WorldState::simulatorOf behind HostOf; the listener pin in
ForceSubscriptionsUpdate; the client's moveRefrToPosition at the record's
cell change), behind the cellFollow server setting and the npcHandoff client
key, both default on; D10 the cold start (provisional first grants for
COLD_START_MS 5 s, UNMEASURED, the nearer player by grid ring taking a cell
at once, ties with arrival, no churn after; RefreshReach's rings through
reach_ranked); (e) the refusal logged once a minute per actor with the count,
the server half alone (the client keeps reporting an actor its engine runs
indoors, since the follow needs that report; the planned drop from the
report list would end every interior follow); D11 needs no server change
(OnActorSighting admits the case) and waits for the night read. Not built:
D7 (the two election knobs), D8 (ActorHandoff, no wire change this slice).
D9 (the pass between live hosts) BUILT on train-46 (2026-10-25, decision (d)
above), without ActorHandoff and without the tenure. The door's exit is a follow too (an interior at either end
with a persistent actor), so a resident coming out into an exterior its
follower does not host stays the follower's. A door into a cell ANOTHER seat
hosts passes the actor to that host since 2026-10-28 (Eli, playtest 37: "let
embry cross and hand him to the inn's host. that's a good rule to have"; fork
m3-door-pass 5d43e7aa; ADR-047's note of the day): the door's pre-check
admits it, the host's engine walks it through, its report from indoors passes
the record and flips the word (D9's path), the exit passes it back under D22's
margin brake; the refusal at the door is a stranger's or an unhosted actor's
alone. CONFIRMED live 2026-10-29 00:47:23Z (Hod 1348a through the Sleeping Giant's
door into rotfern's hosted inn: the walk, the pass, the new host live, the old demoted; playtest 37's finding 39);
T3: x-handoff-door-pass, then a hosted-interior leg of the door scenario, its own commit. mp.get(0, "cellFollows") for
the lab. H5 held (x-handoff-door 025527).

D9's settle (18:36 PST 2026-11-02; playtest 41 02:08Z, Hod 0x1348a at the Sleeping Giant's door 0x13419, Prisoner hosting the inn
0x133c6 and rotfern the street 0x9712; Eli: "hod just tried to leave the sleeping giant inn... cannot seem to... i thought we
fixed this"): the pass promoted the street's game with its copy still INSIDE. The door walk itself flips nothing (the record
follows the host's report); the host's first report after the transit is the pass, and its movement rode the unreliable channel
behind the reliable hoster word, so the new host's promote placed its copy at the puppet's last sample, the pre-door one
(puppetService's "the record's last point and heading first"), the sample that carried him through landed on a live actor and was
ignored, and the copy's first report from the unloaded interior (8 s later) was judged a door pass back (an interior is deep by
definition). Two owners a second, ADR-063's H2. Fork m3-handoff-settle 63bebcd9 (off union-srv-3 b926a7d4), server-side only:
(a) impose at promotion: OnUpdateMovement's pass block sends the passing report's bytes to the new host's game reliably ahead of
the hoster word, same channel, so its promote reads the door's far side as the last sample (no client change: the model's
movement updates before the view's promote); (b) the settle: wire-rules cells.rs remembers each pass (actor, cell, new host, when;
`passes`), and the judge answers the new host's report OUT of the passed-into cell within PASS_SETTLE_MS (1 s, UNMEASURED, the
follow's window) with MoveVerdict::Stale (= 4, new; the follow's stale rule of FOLLOW_SETTLE_MS gives the same word now), which
the core logs as "dropped as a stale copy's sample (D9's settle)" and counts, never as "may not move"; a stranger's late report
stays Refuse; the door's pre-check treats Stale as a refusal; a real return after the window passes as before, with its own
window. No wire change (no epoch travels; numidium's epoch shape is the alternative if the window proves too blunt). T0:
cells.rs `a_passed_actors_report_back_within_the_settle_window_is_a_stale_copys_sample` and the cross test's teleport moved past
the window; CellHostTest's door case reads the report's reliable send ahead of the word, the stale drop and the exit after the
window. The parent run of v7's leg A (20261103-055217, union-srv-3 b926a7d4, numidium's read) widened the case: red at the exit until
with NO door walk, and the bounce at the house seat's GRANT instead. 05:53:42.417 c1 granted 133c7 at epoch 2; 05:53:42.597 "ff000000
passes 1348a into cell 9732, which another game hosts (D9)", c1's FIRST report as the new host putting Hod outdoors; 05:53:42.633
"ff000001 passes 1348a into cell 133c7 (D9)", c2's indoor copy passing him back; then only his speech and state lines for 400 s.
Reading (HYPOTHESIS): the promote at the grant placed c1's copy at the LAST RELAYED SAMPLE (c2's follow of 05:53:05.698 during its
visit, when he stepped out and back in: "follows 1348a into cell 9713 (D6)", "may not move 1348a to cell 133c7", "moves 1348a into
cell 133c7, which it hosts"), not at the record (indoors since 05:53:06.767): the stale placement's mechanism at a grant rather than
a D9 pass. The swap probe v5 (20261103-060106, the roles swapped: c1 the visit, c2 the house's seat) showed the same at its grant,
06:02:29.120 the grant, .158 "ff000001 passes 1348a into cell 9732 (D9)" 38 ms after it, .205 "ff000000 passes 1348a into cell
133c7 (D9)": two for two at the grant, in both orientations, beside 052100's door-walk bounce. For the fix's scope: half (a) imposes
the passing report at a D9 pass alone, not at a grant; half (b) would PROTECT this
false exit (the report back came 36 ms after the pass out, inside the window), leaving him outdoors though he never walked. So the
record must be imposed at EVERY promotion (a grant, a D9 pass, a host's return), its position sent reliably with or before the hoster
word and the promote reading it rather than the last sample: ADR-064 system 1's model (a reference's life on a non-owning seat,
promote and demote), whose promote rows numidium wrote from 052100, 055217 and 060106 (docs/engine/non-owning-seat.md); the settle's
merge waits on that order. The instrumented runs 065955 and 070357 (R1's lines on the parent, fork m3-promote-record efa2eee7)
read the mechanism: the word flips the seat live and its movement reports begin at once from the engine's own position (Hod's
day copy at the mill, 5200 units from his house: no walk in 286 ms), 88 ms after the view's gate decided to move the copy and about
a second before the move landed (c2's clock 2.07 s behind the server's that run), so the record follows the stale copy and the
other side's indoor copy passes him back where another seat hosts the cell (P8; the last relayed sample, P2a, is refuted). The fix
(the branch's second commit 2fa32015; its third, 0238e3b8, after numidium's fresh review said FIX FIRST): the word's FLIP to mine
holds the actor's stream with the record that came with it, asks the gate's move once if nothing else places the copy, and ends the
hold when the engine's copy stands in the record's cell within 64 units, checked every update (a line naming both positions and the
wait; a 2 s timeout releases with the same line; a missing form or record releases at once: HostService.holdUntilPlaced and
checkPlacements, fed by remoteServer's flip handler and by a promotion inside the create word); the senders of a report that
carries a position (the death report, a shot's and a cast's origin) gate on HostService.isReportable, the word and the placement
together; the view's gate may move at every promotion; and the server sends each actor's record as a movement message reliably to
the game the word names ahead of every hoster word, a grant's, a claim's, a release's and a lease's end's, the host swap included
(PartOne::SendActorKeyframe to PlayerActor(SimulatorOf); the pass keeps sending the passing report); CellHostTest reads a grant's
and a swap's keyframe ahead of its word. Kept with its risk named: the gate's one-shot reset at every promotion (P2b) would
teleport the copy across the door at every pass if the ping-pong is not cured, which R1's lines would show.
The settle's window stays as the safety net it was meant to be. The scenario claims it since v9 (thuum 4bb5d18c) across EACH grant
(the street seat's visit's and the interior seat's), baselines right before the teleport in and equal after the grant, so the case
goes red where it happens and a fix is tested at the grant too: no pass, follow or move of him into an exterior cell (v9), and since
v13 none BACK into the interior either, with the door line counted beside them. v12 (thuum 54bb96cf, the author's call on numidium's
review of 2fa32015) had swapped the exit claim for the re-entry claim so a legitimate walk out by his day package 0x734cd would not
read as the bounce; ADR-064's fresh review of v12 (FIX FIRST) showed the tolerance does not exist (the same block claims the record's
cell and the interior seat's 3D, so any exit before his hour is red in v9 and v12 alike) and that the exit line is the only witness
where the fix head fails (it carries the settle, which drops the report back as a stale copy's sample for 1 s with no "into cell"
line, and the hold places the next promoted copy at the stale record outdoors, so no report back ever comes); what tells a walk
from a jump is the door line (a walk logs "door 13407: 1348a's host ... walks it through to 3c" first; 055217's and 060106's jumps
logged none), and a walk out once placed home would be P4 refuted and a premise finding for leg A, not the bounce. The bounce's
return: 36 ms by a pass back (055217), 1.0 s by the follow's stale rule (065955's "moves 1348a into cell 133c7" after the refused
report back; 070357 the same shape). T3: b-npc-handoff-door-hosts v20 (thuum b056d01d, 2026-11-03, with the fresh reviewer: leg A gains a settle phase after v19's red
run on break 3 at the PREMISE, 101556, where c1's engine had Hod outdoors with 3D at 02:00 because the seat's rollback save holds him
at the mill from 17.x and the sighting path took the record out before the MoveTo; v20 lets his sleep package walk the engine's copy
home under c1's follow, an until on the record back in 133c7 within 300 s, then restarts the server at 2.0, which forgets the hosts
and the follows and keeps the world, and claims the premise after the reconnects; the swap probe v18 1fa4f825 matches; v19 8d11a67f
READY FOR THE GREENS and the parent's red run by ADR-064's re-check of v18 639f65ec: every claim holds on m3-system1-r2 4ccb4259 and the set goes red on a build without the fix (the red
run plays first on break 3, union-srv-3 b926a7d4, the staged build Eli played; parity 188a8dea is the merge's formal parent) for the bedside
copy's second report into 133c7; v18 and v19 took the review of v17: the gate's line at the create-word promotion as the stale
case's witness, the hold's placed line and its asks as the cure's, the record claimed in absolute units, the 10 s read; v17 ff9be106
with the fresh reviewer; its leg A makes P8's condition server-side after 084006 showed a fresh seat's engine spawning him home at the house's load
and the review of v16 refused the visitor shape three ways: a hosted cell never passes to a nearer seat in steady state, `approach
{cell: record}` goes to the seat's own copy, and the visitor's indoor copy is neither indoors after its own door report nor frozen past
D11's 4 s release; v17 starts at gameHour 2.0, the street seat's engine copy at his bed, and the server's MoveTo of the RECORD to that
seat's feet promotes it against the bedside copy: the hold's line naming both places is the stale case's witness, the parent's red
the bedside copy's report into 133c7; then the sleep package walks him home by 13423 under the follow; leg B unchanged, its exit until
carrying the fight as its own red after 085226 and 084329 showed Hod fighting the visiting player indoors; v16 16fa2613, v15 73fdb632,
v14 f9977b84 READY FOR THE GREENS by the re-check of v13 70d36451, whose two nits v14 carried; v13 70d36451, v12 54bb96cf, v11 3ae65081, v10 ab631049, v9 4bb5d18c, v8 c999ebb2, v7 9fc01da4). v6's two red runs on the fix's parent b926a7d4 settled the
shape (numidium's reads): leg A 20261103-051454 was red at its premise with fresh seats and NO pass logged at Hod's house door, while
the swap probe 20261103-052100 REPRODUCED playtest 41's bounce at the house door ("ff000000 passes 1348a into cell 9731 (D9)" at
05:22:17.325, "ff000001 passes 1348a into cell 133c7 (D9)" 56 ms later, the pair every 14 s as he retried his door), the street
seat's game relaunched fresh for the run like the other's (numidium's result.json read): so the difference between the two runs is
UNEXPLAINED (the seats' orientation, or the hour, 19.94 against 19.49), the house door reproduces the bug at any exit hour, and 56 ms
sits inside the 1 s settle as well as being the placement's case. v7 and v8 keep the street seat's visit of the interior as a CLAIMED
premise (its copy of him indoors with no 3D at the exit is playtest 41's shape and the bounce's mechanism, not a proven cause) and
claim the door each leg tests; v8 (c999ebb2) parks leg A's street seat at lab-spawn through the restart so leg B's street seat lands
alone (a restart keeps the seats' places), bounds the hour above at each premise's end (a late clock would put the exit before the
baselines), starts the clock at 6.0 and names the mutation's proof: the counts block at 5 s going red. Leg A, the house door at 19:00 by his unconditioned inn package (v10, after 055217 showed no door walk for 400 s to about 9.3 h
and non-owning-seat.md P7 read his sawmill packages as CONDITIONED on the mill script's variable, with P4's no-package-after-a-
double-promote the other reading, both HYPOTHESIS; the clock starts at 17.0: the seats come online at 17.19 after a 35 s relaunch
or 17.69 after a 124 s rollback, the interior seat's premise ends 17.56 to 18.06, the exit comes 169 to 259 s after the baselines
and the 400 s until ends 141 to 231 s past 19:00, numidium's fit of four runs; c2 the street's seat, c1 the house's, 052100's
orientation): his record in 0x133c7; the street's seat teleports to the house door's landing (-506, -177, 0), is granted the house
with no pass, follow or move of him into an exterior cell or back into the house across the grant (v9's and v13's claims; 055217's
and 060106's grant promotions put him out; the door line counted tells a walk from a jump), sees him with 3D on neither sawmill package (v11: 17:00 to 19:00 lies inside the sawmill window, and a seat meeting the mill's
condition would walk him out early, a red with a working fix that would read as the grant bounce), teleports to the street, the
house unhosts behind it, and its copy of him is claimed indoors with no 3D beside its hosting of 0x9712 and 0x9731 and the hour
past 17; the house's seat enters by the same landing, is granted the house with the same two claims across its grant, the door line counted, his 3D
and AI there on neither sawmill package, the street seat's copy still indoors, the hour between 17 and 18.9; the baselines (the
door line first); the exit waited on the pass line itself; at 5 s the counts with the hour past 18.9 (the door 13407 line beyond
its baseline, one more "now simulates 1348a in cell 97xx", no "passes 1348a into cell 133c7" and no pass, follow or move of him
into the house beyond the baseline: on the parent the "now simulates" claim holds, since he retries the door every 14.6 s, and
the pass back into the house is the bounce's red), then the seats read back to back and the engine claims (the record in 3c, the
street's seat running him loaded within 150 units both ways, the house's seat with no 3D and its copy out of the house); at 65 s
the counts again and nobody's copy in the house. Leg B, the inn door at 22:00, playtest 41's own, the roles swapped (c1 the
street's, c2 the inn's): leg A's street seat parks at lab-spawn (27 cells from Riverwood's squares) before the restart, since a
restart keeps the seats' places and the cells rule hands a cell to a strictly nearer ring alone; a restart at 20.0 keeps the
world, c1 lands on the street alone, hosts 9712 and 9731 (claimed) and the until waits for his record in 133c6 within 200 s
(leg A's exit walked him there, or the inn package finishes the walk under c1's follow), then the same visit shape on the inn
(the grant ends the follow, claimed), c2 enters from lab-spawn, and at 22:00 the fallback sandbox near his editor location walks
him out by 0x13419 (the door 13419 line, "passes 1348a into cell 133c6" as the bounce line, the hour between 20 and 21.8 at the
premise's end and past 21.9 at the exit). The exterior cell claim of v5 and v6 is dropped (the record outdoors and
the 150-unit bound carry it). The by-path probe x-handoff-door-hosts-swap v17 (v19's leg A under the seat substitution, sha1 e9bf42aa) plays leg A with the roles swapped on the parent (a run
stops at its first red, so the scenario's second leg never reaches the parent); a third run at handoffPassSettleMs 0 reads the
reliable placement alone. HYPOTHESIS until those runs:
the mechanism above (every stamp fits it), and that the street seat's copy stands indoors at the promote (the precondition,
claimed). What the two halves carry (20:13 PST 2026-11-02, the settle branch's fresh review): the playtest's first bounce came about 8 s after
the promote, outside any 1 s window, so the reliable copy of the passing report ahead of the word carries the playtest's case
alone; the settle window catches the in-flight stale sample and the race the ordering cannot close (remoteServer.ts overwrites
the model's movement with any movement, so an older unreliable sample landing in the word's frame still gives the promote the
pre-door point; rare on a LAN, HYPOTHESIS). The window is the server setting handoffPassSettleMs (0 off, the mutation run's switch;
unset PASS_SETTLE_MS 1 s); the pass row remembers the cell the actor came from, so only a report back into it is stale and a move
onward is judged as any other; the table prunes passes at the tick and the Stale line is one per actor per 10 s. The tenure row
(ACTOR_TENURE_MS, handoffActorTenureMs) is retired in the settle's favour: one damper, one name. If a fixed window proves blunt the
next shape is ADR-063's "never by a timer": end the settle at the new host's first report from inside the passed-into cell, which
a stale copy never sends (a fencing token, not a lease).
Known limit (19:24 PST 2026-11-02): the door's pre-check reads Stale as a refusal, so a host's engine that turns an actor around
inside one second of a pass waits at the door until the window passes (its package retries the door as Embry's did,
playtest 37); a real turnaround that fast is the ping-pong's own shape, and the window is the cost of telling them apart.
The fix's T0 reds (pipelines 4768, 4773) were the two CellHostTest cases that walked an actor straight back through the
door inside the window; both now read the settle (the stale leg refused, the return after the window), head 08b479d6; its
pipeline 4778 died in an unrelated reloot case's SIGABRT (a runner flake: the same head's rerun 4782 is GREEN at 03:40Z, the whole
suite, wire-test, wire-fuzz, difftest-build, rust-image). The head waits for the gate: the door scenario's red run on b926a7d4
first, then its green runs on this head (numidium's order of the night).

- [x] doc complete, inventory listed with a disposition per row, rung declared (2026-10-22 draft; the decisions as ADR-047 PROPOSED 2026-10-23, D6 to D11)
- [x] engine surface cited or delegated (the cell getters through Skyrim Platform and libespm's CELL and record flags; moveRefrToPosition the player's own cross-cell call; no new native)
- [x] server logic + T0, first slice (D6, D10, e: fork m3-train-40 03eb98f0 the table with three tests, 87e77191 the core with CellHostTest's follow case, the include fix f9e3dfad compiled and ctest green in pipeline 2756, 2026-10-23 14:14 PDT, 424 cases; the head ff44809e merges train-39's 4 s; D7 to D9 open)
- [x] message + validator (same commit): none this slice (no wire change; ActorHandoff is D8's, the second slice; ticked 17:02 PDT 2026-10-29 by the pass under VERB.md's none rule; D8 reopens it)
- [x] native hook + T1 (none: no new Address Library id; ticked 17:02 PDT 2026-10-29 by the pass under VERB.md's none rule)
- [x] TS handler, first slice (formView's door move behind npcHandoff, fork m3-train-40 45713556; HandoffService with keyframes is D8's)
- [x] T2 green, first slice (train-40's stage 661bc67a: 33 sessions identical, 16:03 PDT; the follow and the cold start send nothing under T2's NPC-less servers, the message layer unchanged)
- [ ] T3 scenario green, no HYPOTHESIS tags (the template's wording restored and the box unticked 15:52 PDT 2026-10-29 by the pass's inventory: 4 tags with a named read and 9 without, D8 ActorHandoff unbuilt; the earlier tick read: T3 scenario green (09:55 PDT: gate-m3-train-43 155001 on 417cb746, all sixteen; b-npc-handoff-door 161002 four legs, b-npc-handoff-restart 161310, b-npc-handoff-night 161723 after the D11 fixes; T2 green; merge-ready by citation at Eli's D6 and D12) (committed: b-npc-handoff-door, b-npc-handoff-restart, b-npc-handoff-night on main 23885e70, the green probes promoted unchanged; they run at 40's merge gate; the probes: x-handoff-restart GREEN 222408, x-handoff-night GREEN 230913, x-handoff-door v5 GREEN 041126 on d698fe38 (lab-api f90320ff; D6 held in three runs, 025527 by formView's rule, 032354 and 041126 by the server's Teleport; the third leg lands in the record's cell); H5 held; D11 FINDING and fix (03:14 PDT): b-npc-handoff-night red on 43's information gate (092208): at a reconnect the view's loss path demoted every game-file actor it knew, and the native demote cleared the AI of an actor with no 3D, which no engine simulates, so a resident whose record sat in an unhosted house never ran his morning schedule, was never sighted, and the record never moved (13482, 13483 and 1348b, all live on c1 before; the probe's two greens had Alvor never live there). Fixed on m3-train-40 fc7b2718 (forward 41 dd48687b, 42 1b2c67b5, 43 dd76e98b): a lost actor with no 3D keeps its AI and its block, the engine's low-process schedule moves it, the sighting host's roster moves the record, and the server's word rebinds the copy when its cell loads; D11's wording "every engine runs the actor by schedule" is true again for the seat that was live for him. The far seat's unloaded copy wanders by schedule until it is rebound: a snap at re-entry, the engine's own behaviour for unloaded actors. GATE 9 of 9 on d698fe38 (run set 20261024-044200-gate-m3-train-40, 22:12 PDT) and T2 green: the merge of 39 and 40 waits on Eli's D12 and D6 alone; v6 GREEN 054447 on 41's stage (all four legs: the viewer's entry after the grant finds its puppet a unit from the host's live Alvor, and this run had no gap at all; 041126's 500 units were the unloaded-house case, closed once the viewer loads the cell; 22:51 PDT); v6 was written as the viewer's entry after the grant (its puppet, unsubscribed outside, sits where the Teleport put it until the attach binds it: 21:16 PDT); b-npc-handoff itself after the grammar; the gate set 20261023-223340-gate-m3-train-40 GREEN 9/9 stands for the merge by GATE_SET, which waits for Eli's D6 and D12))
- [ ] parity scenario green, or its later list reviewed with it (ADR-031)
- [ ] sequences and combinations green, every checklist item with its scenario (ADR-033)
- [ ] ledger and suppression registry updated

Play: BROKEN, playtest 41 (2026-11-02, break 3): "hod just tried to leave the sleeping giant inn... cannot seem to... i thought
we fixed this": 1348a handed back and forth at door 13419 by D9 three times in half a second (02:08:01Z); reproduced in the lab
(20261103-052100) and traced (R1, 20261103-065955; docs/engine/non-owning-seat.md).

## D22's brake read on 55's stage (14:21 PDT, x-handoff-cross v3 20261027-211054)

The brake held Riverwood's border traffic as follows and passed nobody in
three minutes: Sigrid's shuttle took her 160 units into c1's cell 9712 and
the server logged "ff000001 follows 13483 into cell 9712 ... within the pass
margin", c2 live and c1's copy a puppet; Sven hovered within 150 units of
the 9731/9732 line 26 times and was followed every time; Alvor once into
9731. No "may not move", no host flip, 42 follow lines in all (one per
crossing, where the unbraked nightly 20261026-132333 had 836 passes). So
PASS_MARGIN_UNITS 256 reads MEASURED for Riverwood: it holds every hover and
shuttle there as a follow, and the per-sample thrash is gone. The pass a
step beyond the margin is proved at T0 (CellHostTest's crossing case: a
hold at 256 inside, a pass a step deeper, back at the margin) and not yet at
T3, since no exterior actor walks that deep in the window; the door, night
and restart scenarios move actors between cells by their own paths. The
committed b-npc-handoff-cross asserted the unbraked rule's one pass per
crossing; it is restated to the follow within the margin with the passes
bounded at six each and recorded (its own commit, named in the memo under
D40), and x-handoff-cross v4 carries the same claims for the rerun. The
watch item above closes with 55's merge, as its line says.

## Train 55 merged (19:26 PDT 2026-10-27): the brake (D36 C) on parity c85dab3d

Fork parity c85dab3d (m3-npc-talk: the dialogue claim, ADR-052; D22's brake,
PASS_MARGIN_UNITS 256, MEASURED for Riverwood's traffic; the H-54e promote
fix), cited by 55's gate 20261027-234255 plus its rest (b-npc-death-blow and
b-npc-respawn, both premise fixes). b-npc-handoff-cross's watch item closes
here: v3 211054 read the brake holding, the scenario carries the follow and
the bounded pass count (39cab38), v4 230629 and the gate's 004521 ran it
green. The deep crossing's pass stays T0's (CellHostTest) until the probe
named in the memo under D36.

## Reviewer checklist

1. Is the rung right, and is the reason for not going one rung higher real?
2. Does every address come from CommonLib, addrlib, or a Ghidra reference?
3. Is there any state this verb creates that is not on a rung?
4. Does the validator reject the obvious forgery (wrong owner, out of range,
   too frequent)?
5. Does the restart scenario exist and pass?
6. Are the HYPOTHESIS tags gone, and were they cleared by evidence?
7. Is the suppression reversible on host handoff?
8. Did the ledger change if a native did?
9. Does the Inventory list every consequence of the reference trace and the
   records, each with one disposition, and does the parity scenario's later
   list match its later rows and nothing more?
10. Is every sequence and combination row green (the action again at a
    person's rhythm, each input that performs it, interrupted, both seats),
    and does every item of the playtest checklist have a scenario that does
    it the way a person does (ADR-033)?
11. Was `just fork-lint <fork tree>` clean before each fork push, and is the
    head's GitHub Formatting check green? Parity was red there from 10-15 to
    10-17 on two faults every branch inherited: Hooks.cpp formatted by a newer
    clang-format, and skyrimPlatform.ts edited without Definitions.txt.

GREEN AT T3 (16:58 PDT, 2026-10-25): x-handoff-cross v2 20261025-235039 on train-46's stage
c40a36a3: the cold start's split held (0x9712 to c1, 0x9731 to c2, each seat standing inside
its own cell), Sigrid crossed once with no refusal ("passes 13483 into cell" once, "may not
move 13483" never), and at the end c1 ran her AI with c2 a puppet. Committed as
b-npc-handoff-cross (main 750b4f4f). v1 (233736) had read its premise false on positions
alone (c1 at the landing was ring 1 for both cells). One pass in three minutes means no
shuttle thrash to read: D22's tenure stays unbuilt and A stands on this read.

MERGED (18:44 PDT, 2026-10-25): decision (d), the pass between live hosts, on
fork parity c40a36a3 with train-46 (Eli: "Merge now"; gate 20261026-001639
eighteen of eighteen; b-npc-handoff-cross committed from the stage's green).
