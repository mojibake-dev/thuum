# TES3MP prior art for thuum M3 (hosting)

Read-only research, 2026-10-16. Nothing cloned; files fetched raw at pinned commits.

## Pins and citation format

- `T:` TES3MP/TES3MP branch 0.8.1 head `49be5b6405d6ab427e06ed350cf76c715a1f3bdd` (2024-02-13). The latest
  release is tag tes3mp-0.8.1 (2022-05-01); the branch carries post-release fixes.
  Permalink: `https://github.com/TES3MP/TES3MP/blob/49be5b6405d6ab427e06ed350cf76c715a1f3bdd/<path>#L<a>-L<b>`
- `C:` TES3MP/CoreScripts branch 0.8.1 head `3e397a11eaf7d0d4ff08df4bb9925e67748b4db8` (2025-10-10).
  Permalink: `https://github.com/TES3MP/CoreScripts/blob/3e397a11eaf7d0d4ff08df4bb9925e67748b4db8/<path>#L<a>-L<b>`
- `path:a-b` means lines a to b at that pin. "Client" is apps/openmw (OpenMW plus mwmp); "server" is
  apps/openmw-mp (C++) plus CoreScripts (Lua). "Authority" in TES3MP is thuum's "host".
- INFERENCE marks a conclusion read from code with no run behind it.

## Vocabulary (client side)

- LocalActor: an NPC or creature in a cell this client has authority over; it is simulated here and its
  state is sent. DedicatedActor: a wrapper created when a packet about a non-local actor arrives; it
  is rendered from packets. (T:apps/openmw/mwmp/Cell.cpp:480-555)

## Q1. Cell authority

- What "load" means: every cell that enters the client's active set. Exteriors are a 3x3 grid
  (CellGridRadius = 1), each newly active cell is stored as LOAD, unloads as UNLOAD, and the batch goes
  to the server as PlayerCellState (T:components/misc/constants.hpp:27-28;
  T:apps/openmw/mwworld/scene.cpp:382, 390-392, 483, 568-637, 647-651). So the authority of an exterior
  cell can be a player standing in a neighbouring cell.
- Server path: PlayerCellState -> CellController::update -> Cell::addPlayer -> Lua OnCellLoad ->
  logicHandler.LoadCellForPlayer (T:apps/openmw-mp/processors/player/ProcessorPlayerCellState.hpp:20-25;
  T:apps/openmw-mp/CellController.cpp:159-191; T:apps/openmw-mp/Cell.cpp:24-48;
  C:scripts/eventHandler.lua:1212-1223).
- Chosen: the first loader becomes authority when the cell has none and is not resetting
  (C:scripts/logicHandler.lua:876-886). A later arrival takes over only if its average ping is lower
  than the current authority's by more than `config.pingDifferenceRequiredForAuthority` = 40
  (C:scripts/logicHandler.lua:887-894; C:scripts/config.lua:249-253). Ping is RakNet's
  GetAveragePing (T:apps/openmw-mp/Script/Functions/Server.cpp:108-113; T:apps/openmw-mp/Networking.cpp:604-607).
- Moves: when the authority unloads the cell or disconnects, the remaining visitor with the lowest
  average ping gets it, immediately, with no grace window (C:scripts/logicHandler.lua:103-121, 906-932;
  C:scripts/eventHandler.lua:668-675). Moderators can force it with /setauthority
  (C:scripts/commandHandler.lua:45-54). With no visitors left, nothing is reassigned: the C++ cell is
  deleted when its player list empties, OnCellDeletion fires, Lua saves the cell to disk and drops it
  (T:apps/openmw-mp/CellController.cpp:115-133, 148-155, 180-190; C:scripts/eventHandler.lua:1235-1241;
  C:scripts/logicHandler.lua:897-904).
- Recorded: Lua SetAuthority calls SendActorAuthority, which stamps the GUID on the server's C++ cell
  and sends ActorAuthority to every connected player, cell loaded or not
  (C:scripts/cell/base.lua:252-258, 1618-1625; T:apps/openmw-mp/Script/Functions/Actors.cpp:531-546).
  Weather regions use the same scheme (C:scripts/logicHandler.lua:934-997).
- What only the authority's client does:
  - runs engine AI for its LocalActors while global AI is off everywhere (Q2);
  - runs navmesh updates (T:apps/openmw/mwmp/processors/actor/ProcessorActorAuthority.hpp:39-42;
    T:apps/openmw/mwmp/CellController.cpp:73-77; https://github.com/TES3MP/TES3MP/issues/580);
  - streams actor state every 25 ms: position, anim flags, anim play, speech, death, dynamic stats,
    equipment, attack, cast, cell change (T:apps/openmw/mwmp/Cell.cpp:32-115);
  - computes its actors' melee and ranged hits and applies spell effects to them, which every other
    client skips (T:apps/openmw/mwclass/npc.cpp:551-564, 628-642; T:apps/openmw/mwmechanics/combat.cpp:234-251;
    T:apps/openmw/mwmechanics/spellcasting.cpp:185-196);
  - picks death animations and reports deaths with the killer (T:apps/openmw/mwmechanics/character.cpp:865-880;
    T:apps/openmw/mwmp/LocalActor.cpp:343-360);
  - spawns and despawns summons placed in its cells (T:apps/openmw/mwmechanics/summoning.cpp:106-156;
    T:apps/openmw/mwmechanics/actors.cpp:2478-2491).
  The leveled-creature roll goes to whichever visitor gets the server's ActorList REQUEST, which in
  practice is the first loader, who becomes authority a moment later (C:scripts/cell/base.lua:214-217,
  2073-2086; C:scripts/logicHandler.lua:874-882; T:apps/openmw/mwmp/processors/actor/ProcessorActorList.hpp:28-33).

## Q2. Actor sync

Transport: every actor packet is HIGH_PRIORITY, RELIABLE_ORDERED, on one channel, CHANNEL_ACTOR
(T:components/openmw-mp/Packets/Actor/ActorPacket.cpp:11-13), at most 3000 actors per packet
(T:components/openmw-mp/Packets/Actor/ActorPacket.hpp:29). Object packets (spawns, deletes) ride a
different channel, CHANNEL_OBJECT (T:components/openmw-mp/Packets/Object/ObjectPacket.cpp:12-14).
"Forwarded" below means Cell::sendToLoaded: every player with the cell loaded except the sender
(T:apps/openmw-mp/Cell.cpp:184-209).

| Packet | Sender | Server rule | Lua | Receiver effect |
|---|---|---|---|---|
| ActorAuthority | server only | no server processor | sent by SetAuthority | new authority: Dedicated -> Local, force-send; others drop Locals (T:apps/openmw/mwmp/processors/actor/ProcessorActorAuthority.hpp:25-57) |
| ActorList | server REQUEST; client reply | reply accepted from any visitor, forwarded (T:apps/openmw-mp/processors/actor/ProcessorActorList.hpp:16-27) | saves refIds, marks full actor list (C:scripts/cell/base.lua:834-854) | REQUEST makes the client roll leveled spawns and list its actors (T:apps/openmw/mwmp/processors/actor/ProcessorActorList.hpp:28-33) |
| ActorPosition | authority | dropped unless sender GUID is the cell authority; latest kept in C++ memory; forwarded (T:apps/openmw-mp/processors/actor/ProcessorActorPosition.hpp:16-25; T:apps/openmw-mp/Cell.cpp:77-110) | snapshot at unload and new load (Q4) | DedicatedActor lerp (T:apps/openmw/mwmp/DedicatedActor.cpp:78-107) |
| ActorStatsDynamic | authority | same gate, kept in memory, forwarded (T:apps/openmw-mp/processors/actor/ProcessorActorStatsDynamic.hpp:16-25) | snapshot (Q4) | forced every frame; health > 0 resurrects (T:apps/openmw/mwmp/DedicatedActor.cpp:145-162) |
| ActorAnimFlags, ActorAnimPlay, ActorSpeech, ActorAttack, ActorCast | authority | same gate, forwarded, no Lua event (T:apps/openmw-mp/processors/actor/ProcessorActorAnimFlags.hpp:16-23 and siblings) | none | flags and draw state set, anim group played, voice played, attack or cast replayed (T:apps/openmw/mwmp/Cell.cpp:161-193, 281-301, 361-403; T:apps/openmw/mwmp/MechanicsHelper.cpp:346-565) |
| ActorSpellsActive, ActorDeath | authority | same gate, Lua event, forwarded (T:apps/openmw-mp/processors/actor/ProcessorActorSpellsActive.hpp:16-27; T:apps/openmw-mp/processors/actor/ProcessorActorDeath.hpp:16-27) | saved (C:scripts/cell/base.lua:937-1040) | effects added or removed; death state queued (T:apps/openmw/mwmp/Cell.cpp:225-254, 303-331) |
| ActorEquipment | any visitor | no authority check, forwarded (T:apps/openmw-mp/processors/actor/ProcessorActorEquipment.hpp:16-27) | saved (C:scripts/cell/base.lua:917-935) | items added and equipped (T:apps/openmw/mwmp/DedicatedActor.cpp:164-208) |
| ActorAI | any client | no check; Lua decides (T:apps/openmw-mp/processors/actor/ProcessorActorAI.hpp:16-24) | stock: forward to other visitors, not saved (C:scripts/eventHandler.lua:1284-1307) | packages stacked (T:apps/openmw/mwmp/DedicatedActor.cpp:210-311) |
| ActorCellChange | authority; follower moves from anyone; anything for a cell the server has not loaded | sent to everyone (T:apps/openmw-mp/processors/actor/ProcessorActorCellChange.hpp:16-56) | moves the saved data, loading the target cell temporarily (C:scripts/cell/base.lua:1042-1191) | Dedicated moved, or converted to Local if the target is ours (T:apps/openmw/mwmp/Cell.cpp:405-478) |

- Send thresholds on the authority: position while moving or airborne; stats when health moves by 3 or
  magicka or fatigue by 7, or a value reaches or leaves 0; equipment on slot change
  (T:apps/openmw/mwmp/LocalActor.cpp:88-111, 178-210, 212-264).
- How a non-authority shows an actor: a DedicatedActor is created lazily on the first packet about it
  (T:apps/openmw/mwmp/Cell.cpp:539-555). It lerps toward the received position by dt*15 when within
  40 units and snaps otherwise, applies anim flags and draw state (both skipped when a frame takes
  0.1 s or more), and forces dynamic stats every frame (T:apps/openmw/mwmp/DedicatedActor.cpp:56-66,
  78-162). Engine paths skipped for it: melee hit calculation (T:apps/openmw/mwclass/npc.cpp:551-564;
  T:apps/openmw/mwclass/creature.cpp:247), projectile hits (T:apps/openmw/mwmechanics/combat.cpp:242-243),
  spell effects after reflection (T:apps/openmw/mwmechanics/spellcasting.cpp:185-196), casting on the
  animation key (T:apps/openmw/mwmechanics/character.cpp:1152-1166), automatic torches
  (T:apps/openmw/mwmechanics/actors.cpp:1493-1504), and cell changes that disagree with the packet's
  cell (T:apps/openmw/mwworld/worldimp.cpp:1314-1331).
- AI is disabled on non-authority clients, by switching OpenMW's global AI flag off and re-enabling
  AI per actor. The flag is the one the `toggleai`/`tai` console command flips
  (T:components/compiler/extensions0.cpp:62-63; T:apps/openmw/mwscript/aiextensions.cpp:571-577).
  TES3MP toggles it off right after starting a new game and forces it false on playerLoaded
  (T:apps/openmw/mwmp/Main.cpp:158-166; T:apps/openmw/mwmechanics/mechanicsmanagerimp.cpp:826-857).
  Actors::update then gates engageCombat, crime pursuit, AiSequence::execute, greetings, idle
  dialogue and movement speed on `isLocalActor || aiActive`; DedicatedActors get only head tracking
  (T:apps/openmw/mwmechanics/actors.cpp:2065, 2172-2248). The AI processing range cap is raised from
  7168 to 409600 units so a host's AI covers all its cells (T:apps/openmw/mwmechanics/actors.cpp:1708-1721).
- Hits involving players: the attacker's client rolls hit chance and damage, applies onHit locally,
  and sends the result (PlayerAttack or ActorAttack) with the damage (T:apps/openmw/mwclass/npc.cpp:626-748,
  998-1046). The server forwards PlayerAttack to the attacker's loaded cells if the attacker is alive,
  without checking anything else (T:apps/openmw-mp/processors/player/ProcessorPlayerAttack.hpp:21-24).
  Each receiver calls onHit on its copy of the victim with the packet's damage
  (T:apps/openmw/mwmp/MechanicsHelper.cpp:368-384, 483-484); for an NPC victim the authority's copy
  then wins, because its stats overwrite everyone else's every frame.

## Q3. AI packages

- AI execution is left entirely to the authority's engine: packages from the data files, combat
  started by engageCombat, pathing and pursuit all run only for LocalActors (Q2). Package state is
  never sent. Maintainer statement: "NPC AI is client side at the moment. The authority player tells
  server what the NPCs are doing and the server relays that to other players"
  (https://github.com/TES3MP/TES3MP/issues/548#issuecomment-602530815); server-side AI control
  "simply never got that far" (https://github.com/TES3MP/TES3MP/issues/548#issuecomment-602287982).
- ActorAI carries one-shot transitions (CANCEL, ACTIVATE, COMBAT, ESCORT, FOLLOW, TRAVEL, WANDER), not
  sequence state (T:components/openmw-mp/Base/BaseActor.hpp:81-90;
  T:components/openmw-mp/Packets/Actor/PacketActorAI.cpp:12-47).
- Scripted AI changes: mwscript local scripts run on every client with no authority gate (no tes3mp
  change in T:apps/openmw/mwworld/localscripts.cpp). Four engine paths send ActorAI "regardless of
  whether we're the cell authority or not; the server can decide": SetFight to 100, StartCombat,
  AiFollow, and a follower teleporting with its player (T:apps/openmw/mwscript/aiextensions.cpp:309-323,
  362-381, 538-555; T:apps/openmw/mwworld/actionteleport.cpp:112-151). Stock Lua forwards these to the
  other visitors and does not persist them (C:scripts/eventHandler.lua:1284-1307).
- Server-originated packages (logicHandler.SetAIForActor) are persisted per actor, except ACTIVATE,
  and sent to every visitor, not only the authority, "If the cell authority leaves, we want the new
  cell authority to resume this AI package" (C:scripts/logicHandler.lua:785-819). They are replayed to
  new visitors from the cell file (C:scripts/cell/base.lua:1827-1912).
- Receipt on the authority: it wraps its own actors in temporary DedicatedActors, stacks the package,
  then deletes the wrappers (T:apps/openmw/mwmp/Cell.cpp:333-359). Quirk: every application sets
  AI_Fight to 0 (T:apps/openmw/mwmp/DedicatedActor.cpp:210-213).

## Q4. Unloaded cells

- The server simulates nothing; a cell nobody has loaded is frozen. The C++ cell, with its in-memory
  latest positions and dynamic stats, is deleted when its last player leaves
  (T:apps/openmw-mp/Cell.cpp:77-110; T:apps/openmw-mp/CellController.cpp:115-133).
- What persists is the Lua cell file, data/cell/<description>.json (C:scripts/cell/json.lua:8-46):
  `objectData` per uniqueIndex (refNum-mpNum) with refId, location, stats, equipment, deathState,
  killer, ai, spellsActive, inventory, cellChangeTo/From and summon data, plus per-type index lists
  (C:scripts/config.lua:436-439; C:scripts/cell/base.lua:10-54, 834-1191). Positions and dynamic
  stats are copied from the C++ cell into the file at every visitor unload and before each new
  visitor loads (C:scripts/logicHandler.lua:861-866, 911-914; C:scripts/cell/base.lua:856-915).
- Containers, corpse inventories included, are server data (C:scripts/cell/base.lua:656-795);
  container packets for unloaded cells are refused by default (C:scripts/config.lua:268-269;
  C:scripts/eventHandler.lua:1577-1583).
- Time: active spells and summons are stamped with server wall-clock time, so they expire while the
  cell is frozen (C:scripts/cell/base.lua:971-976, 1295-1314).
- On the next load: initial data (deletions, placements, spawns, locks, traps, scales, states, door
  states, client script locals, containers, actor cell changes, deaths, equipment, active spells, AI)
  goes only to a player who has not visited since their last login; momentary data (positions,
  dynamic stats) goes to every new visitor; a cell without a full container or actor list asks the
  visitor for one (C:scripts/cell/base.lua:176-219, 2088-2133). Saved positions outside the cell's
  bounds are not sent (C:scripts/cell/base.lua:1644-1646).
- Order: AddVisitor (which sends all of the above) runs before SetAuthority
  (C:scripts/logicHandler.lua:871-894), and both ride CHANNEL_ACTOR, which RakNet keeps in order
  (https://github.com/facebookarchive/RakNet/blob/master/Source/PacketPriority.h#L58-L60). So a new
  first loader holds the recorded state before it is told to simulate. Spawned actors arrive on
  CHANNEL_OBJECT, possibly later; a change to a cell's references re-runs LocalActor initialization
  (T:apps/openmw/mwworld/cellstore.cpp:455-470; T:apps/openmw/mwmp/CellController.cpp:56-72).
- Actors that walked to another cell are tracked as cellChangeTo/From with the target cell loaded
  temporarily; spawned actors move wholesale (C:scripts/cell/base.lua:1042-1191;
  C:scripts/eventHandler.lua:1347-1367).

## Q5. Handoff

- Mechanics: the server switches the GUID immediately and broadcasts ActorAuthority
  (T:apps/openmw-mp/Script/Functions/Actors.cpp:531-546). From then on the old authority's actor
  packets are dropped (T:apps/openmw-mp/processors/actor/ProcessorActorPosition.hpp:21). The new
  authority deletes its DedicatedActors, builds LocalActors from its existing engine references,
  force-sends a full update and turns on the navmesh; the others drop their LocalActors
  (T:apps/openmw/mwmp/processors/actor/ProcessorActorAuthority.hpp:25-57; T:apps/openmw/mwmp/Cell.cpp:496-521).
- Mid-move: the new host continues from wherever its own copy was lerped to, so there is no teleport,
  but package progress restarts from its local AiSequence, which never executed while the actor was
  dedicated (T:apps/openmw/mwmp/DedicatedActor.cpp:78-107; T:apps/openmw/mwmechanics/actors.cpp:2227-2246).
  Cross-cell conversions copy position, flags and stats (T:apps/openmw/mwmp/Cell.cpp:450-467).
- Mid-fight (INFERENCE): combat state is not transferred. Combat that began from hits is probably
  already on the new host's copy, since every client replays each attack through onHit and onHit
  starts combat even against remote attackers (T:apps/openmw/mwmp/MechanicsHelper.cpp:483-484;
  T:apps/openmw/mwclass/npc.cpp:761-765; T:apps/openmw/mwmechanics/mechanicsmanagerimp.cpp:1574-1600).
  Combat begun by sight existed only on the old host; the new host re-runs engageCombat
  (T:apps/openmw/mwmechanics/actors.cpp:2180-2192).
- Gap: between the switch and the new host receiving ActorAuthority, nobody simulates the cell.
- Recorded problems:
  - 0.8.0: "Fix desyncs caused by late-arriving ActorAuthority packets by sending the packets to
    everyone on the server" (T:tes3mp-changelog.md:37); "Alleviate actor-related desyncs by not
    ignoring an entire packet when one of the actors referenced in it cannot be found"
    (T:tes3mp-changelog.md:45).
  - 0.7.0: "Reworked summoning synchronization that prevents duplicate summons"
    (T:tes3mp-changelog.md:63); followers "able to follow non-authority players" and "NPCs can now
    start combat through dialogue with non-authority players" (T:tes3mp-changelog.md:86-87).
  - #701 (2025, open): a non-authority player's hits often fail to register, NPCs hit back from stun
    animations, no enemy health bar; the reporter's workaround is for the authority to leave and
    re-enter, which is a forced handoff. The maintainer questioned it; the reporter posted local
    reproduction videos (https://github.com/TES3MP/TES3MP/issues/701,
    https://github.com/TES3MP/TES3MP/issues/701#issuecomment-3133944982).
  - #603 (2022, open): Absorb Health heals the caster only when the caster holds authority
    (https://github.com/TES3MP/TES3MP/issues/603), consistent with effects on dedicated targets being
    skipped (T:apps/openmw/mwmechanics/spellcasting.cpp:185-196).
  - #580 (2021, closed): navmesh updates died with global AI off and broke pathfinding
    (https://github.com/TES3MP/TES3MP/issues/580).
  - No report of NPCs duplicated by a handoff in any of the tracker's 282 issue titles (listed through
    the API on 2026-10-16); the duplicate fix on record is the summons one above.

## Q6. Spawning and death

- Spawning is proposed by a client and owned by the server. The client rolls the leveled list or the
  summon, places the creature, captures it into ObjectSpawn and deletes its own copy
  (T:apps/openmw/mwmp/MechanicsHelper.cpp:52-83; T:apps/openmw/mwmechanics/summoning.cpp:106-156). The
  server assigns an mpNum to each object and persists the counter
  (T:apps/openmw-mp/processors/object/ProcessorObjectSpawn.hpp:21-26; C:scripts/eventHandler.lua:1974-1975),
  validators can refuse refIds (C:scripts/eventHandler.lua:32-46), and Lua saves the spawn and echoes
  it to every visitor, the proposer included (C:scripts/eventHandler.lua:1432-1434;
  C:scripts/cell/base.lua:467-530, 1275-1330). Clients place it with the server's mpNum only if it
  is not already there (T:apps/openmw/mwmp/ObjectList.cpp:483-493).
- Leveled creatures are rolled once per cell, then persist as spawns (C:scripts/cell/base.lua:214-217,
  847-853). Summons are not respawned after their duration or while the summoner is offline, and a
  disconnect deletes the player's summons (C:scripts/cell/base.lua:1297-1314; C:scripts/eventHandler.lua:654).
- Death is detected on the authority: only its ActorDeath is accepted
  (T:apps/openmw-mp/processors/actor/ProcessorActorDeath.hpp:21-26); the killer is recorded on the hit
  or spell (T:apps/openmw/mwclass/npc.cpp:1040-1046; T:apps/openmw/mwmechanics/spellcasting.cpp:281-283);
  the death animation is chosen there and replayed by the others
  (T:apps/openmw/mwmechanics/character.cpp:821-836, 865-880).
- Persistence: deathState and killer are saved (C:scripts/cell/base.lua:1012-1040); kill counts are
  server-owned and the client no longer counts locally (C:scripts/eventHandler.lua:185-275;
  T:apps/openmw/mwmechanics/actors.cpp:2360-2369). A fresh corpse is an "unusable container" that
  cannot be deleted or looted until the authority answers a container request
  (C:scripts/eventHandler.lua:11-30, 183-186, 255, 277, 1592-1620).
- Reload: a dead actor is sent as an instant death if its saved health is below 1; it appears at the
  end of its death animation, collision off, no dying words (C:scripts/cell/base.lua:1789-1825;
  T:apps/openmw/mwmp/Cell.cpp:247-251; T:apps/openmw/mwmechanics/character.cpp:799-812;
  T:apps/openmw/mwmechanics/actors.cpp:2403-2413).
- Respawn: stock CoreScripts has none on a timer. /resetcell wipes the cell's data and sends
  CellReset; clients park players in a placeholder interior, clear the cell and reload it
  (C:scripts/defaultCommands.lua:440-458; C:scripts/logicHandler.lua:999-1025;
  T:apps/openmw/mwmp/Worldstate.cpp:476-532). UNVERIFIED: OpenMW's client-local respawn on cell load
  (T:apps/openmw/mwworld/cellstore.cpp:1320-1354) still exists; its interaction with server deaths was
  not traced.

## Copy (five)

1. The server holds the authority stamp and gates on it. One authority per cell: first loader;
   lowest ping on leave; arrival takeover only past a 40 ms hysteresis. Actor state from anyone else
   is dropped. (C:scripts/logicHandler.lua:869-932; C:scripts/config.lua:249-253;
   T:apps/openmw-mp/Script/Functions/Actors.cpp:531-546;
   T:apps/openmw-mp/processors/actor/ProcessorActorPosition.hpp:21.) Same as Colyseus's single
   primary copy per object (Bharambe, Pang, Seshan, NSDI 2006, section 3,
   https://www.usenix.org/conference/nsdi-06/colyseus-distributed-architecture-online-multiplayer-games)
   and Fiedler's per-object authority
   (https://gafferongames.com/post/networked_physics_in_virtual_reality/). Thuum adds the grace
   window TES3MP lacks (docs/PLAN.md:305-307).
2. Global AI off; AI on only for hosted actors; observers do presentation only (lerp, flags, forced
   stats). (T:apps/openmw/mwmp/Main.cpp:164; T:apps/openmw/mwmechanics/mechanicsmanagerimp.cpp:849-857;
   T:apps/openmw/mwmechanics/actors.cpp:2172-2248; T:apps/openmw/mwmp/DedicatedActor.cpp:56-162.)
   Colyseus section 3: a node "only executes the think functions associated with primary objects".
   Maps to docs/PLAN.md:311-312.
3. Replay, then grant, then keyframe: recorded state reaches the new host before the grant, in order;
   the grant goes to everyone; the new host force-sends a full update.
   (C:scripts/logicHandler.lua:871-894; C:scripts/cell/base.lua:176-219, 2088-2133;
   T:apps/openmw/mwmp/processors/actor/ProcessorActorAuthority.hpp:32-37; T:tes3mp-changelog.md:37.)
   Maps to docs/PLAN.md:313-314.
4. Propose, delete, server ID, echo, for every spawn; leveled rolls once per cell, then data.
   (T:apps/openmw/mwmp/MechanicsHelper.cpp:52-83; T:apps/openmw-mp/processors/object/ProcessorObjectSpawn.hpp:21-26;
   C:scripts/eventHandler.lua:1432-1434; T:apps/openmw/mwmp/ObjectList.cpp:483-493;
   C:scripts/cell/base.lua:214-217.) Maps to docs/PLAN.md:315.
5. Death and corpses as data: deathState and killer saved; reload as an instant death without dying
   words; corpse container locked until the host reports it; positions and stats snapshotted at
   every unload. (C:scripts/cell/base.lua:1012-1040, 1789-1825; C:scripts/eventHandler.lua:183-278,
   1592-1620; T:apps/openmw/mwmechanics/actors.cpp:2403-2413; C:scripts/logicHandler.lua:911-914.)

## Avoid (three)

1. Authority as trust. The only check is "the sender is the authority"; attack damage is the
   attacker's own number, forwarded unvalidated; equipment and AI are accepted from any visitor; cell
   changes for unloaded cells from anyone (T:apps/openmw-mp/processors/player/ProcessorPlayerAttack.hpp:21-24;
   T:apps/openmw/mwclass/npc.cpp:626-748; T:apps/openmw-mp/processors/actor/ProcessorActorEquipment.hpp:21-26;
   T:apps/openmw-mp/processors/actor/ProcessorActorAI.hpp:18-23;
   T:apps/openmw-mp/processors/actor/ProcessorActorCellChange.hpp:43-47). Thuum's rule 5 and R1 say
   the server validates; the classic method is server-side lag compensation (Gambetta,
   https://www.gabrielgambetta.com/lag-compensation.html; Bernier, Valve, "Latency Compensating
   Methods in Client/Server In-game Protocol Design and Optimization",
   https://www.gamedevs.org/uploads/latency-compensation-in-client-server-protocols.pdf).
2. Handoff without a state snapshot. Combat targets and package progress are never replicated; only
   four scripted transitions plus server-set packages travel, as one-shot events, and client-sent
   ones are not saved (T:apps/openmw/mwscript/aiextensions.cpp:309-323, 362-381, 538-555;
   C:scripts/eventHandler.lua:1284-1307; C:scripts/logicHandler.lua:793-814). Visible cost:
   https://github.com/TES3MP/TES3MP/issues/701 (contested) and https://github.com/TES3MP/TES3MP/issues/603.
   Thuum's plan already streams combat targets to the server (docs/PLAN.md:308-310); that record
   should become the next host's keyframe.
3. One reliable ordered channel for everything, 25 ms positions included, with no epoch on the data
   (T:components/openmw-mp/Packets/Actor/ActorPacket.cpp:11-13; T:apps/openmw/mwmp/Cell.cpp:37-40;
   the unreliable option is commented out for player positions,
   T:components/openmw-mp/Packets/Player/PacketPlayerPosition.cpp:9-10). One lost datagram stalls
   every later actor packet (RakNet PacketPriority.h:58-60 above; Fiedler,
   https://gafferongames.com/post/udp_vs_tcp/; RFC 9000 section 13,
   https://www.rfc-editor.org/rfc/rfc9000.txt). Thuum's renet has Unreliable and ReliableOrdered
   channels (https://docs.rs/renet/latest/renet/enum.DefaultChannel.html): deltas unreliable and
   stamped with an authority epoch (Fiedler's authority sequence, VR article above); grants and
   keyframes reliable.

## Side findings (stock CoreScripts bugs, not authority design)

- ResetCell sets a global `unloadCellAtEnd` (no `local`) and never clears it, so after one reset of
  an unloaded cell, a later reset of a loaded cell unloads it (C:scripts/logicHandler.lua:1004-1020).
- `isResetting` is set and never cleared, so a reset cell takes no new authority until its Lua cell is
  recreated (C:scripts/logicHandler.lua:881, 918, 1009; C:scripts/cell/base.lua:40).
