# TE NPC hosting, read as a map for M3

Read 2026-10-16 from tiltedphoques/TiltedEvolution, branch dev at 69fe8e67
(committed 2026-10-16 19:20 UTC), file by file through `gh api .../contents`
(no clone; the fetched files are cached under `te/` beside this note). GPL-3.0,
a map only (ADR-005): nothing here is code to copy. Every `path:line` is TE's at
69fe8e67. Numbers after a function name are TE's Address Library ids (the AE
slot); they are leads under rule 1, not sources. Not redone: docs/TE-MAP.md
(origin/main).

## 1. Ownership: who simulates an NPC, when it moves, what the server keeps

Who owns
- First reporter. Discovery polls the engine's high process list (actors with
  3D) every pre-update (Code/client/Services/Generic/DiscoveryService.cpp:228-242);
  a new one raises ActorAddedEvent (222), then ProcessNewEntity and
  RequestServerAssignment (Code/client/Services/Generic/CharacterService.cpp:1267-1303,
  1305-1459). The server creates the entity owned by the requester
  (Code/server/Services/CharacterService.cpp:618-709, owner at 644); a reference
  already managed is answered Owner=false (211-241).
- Party leader overrides. A leader's client claims every remote, non-temporary,
  non-mount actor it discovers (client CharacterService.cpp:1281-1290), and all
  of them on becoming leader (1225-1236). The server grants a claim only with the
  current epoch, not a mount or player, in range, requester is leader, current
  owner in the leader's party (server CharacterService.cpp:775-822; claim 348-357;
  on discovery 218, 237-239). The leader's client alone spawns random encounters
  (PR #314 body, merged 2022-07-15).
- Range is cells: same interior cell, or same worldspace within +-2 grid cells
  (+-10 for dragons) (Code/server/Components/CellIdComponent.h:33-42;
  Code/encoding/Structs/GridCellCoords.h:10-11, GridCellCoords.cpp:58-65). The
  client refuses to play unless uGridsToLoad is 5 (DiscoveryService.cpp:284-290).

When it transfers
- Leaving, distance, cell change: no distance rule exists. When the owner's
  engine drops the actor from the high list or unloads its 3D, discovery raises
  ActorRemovedEvent (DiscoveryService.cpp:248-268); CancelServerAssignment sends
  RequestOwnershipTransfer(Relinquish) with the actor's last worldspace, cell and
  position (client CharacterService.cpp:266-296, 1461-1533). The server records
  them, sends NotifyActorTeleport to every other player (who MoveTo it there,
  client 1208-1265), and hands the actor to the first other player in range not
  already refused (server CharacterService.cpp:286-316, 872-905). No candidate:
  the character is destroyed (903-904, 329-346). The server keeps nothing for an
  NPC nobody hosts. PR #194 (merged 2022-05-31) is where "Actors also properly
  travel through doors and such" came from.
- Disconnect: every actor the player owned gets an OwnershipTransferEvent
  (Code/server/GameServer.cpp:604-619), so TransferToNextOwner runs with a fresh
  candidate list (server CharacterService.cpp:319-327); the player's own
  character is removed (GameServer.cpp:608-612). A client that disconnects gives
  its remote NPCs back their local AI (client CharacterService.cpp:332-349).
- Mount: mounting transfers the horse to the rider (server CharacterService.cpp:475-523, at 514).
- Decline: a client granted an actor it cannot materialize (unknown, or no 3D yet)
  declines (client CharacterService.cpp:777-785, 795-815); the server keeps the
  decliners in InvalidOwners so the actor cannot bounce between unloaded clients
  (server CharacterService.cpp:309-316, 887-900; Code/server/Components/OwnerComponent.h:27).

The server registry
- OwnerComponent {owner, OwnershipEpoch, InvalidOwners}, IsCurrentOwner(player,
  epoch) (OwnerComponent.h:8-28).
- OwnerView<T...> iterates only the sender's entities; movement, actions and
  factions are accepted only through it (Code/server/Game/OwnerView.h:3-77; used
  at server CharacterService.cpp:373, 424, 458).
- TransferOwnership bumps the epoch and sends NotifyOwnershipTransfer (epoch,
  ActorData, leveled pick) in range and directly to the old owner (server
  CharacterService.cpp:824-870). Reasons: LeaderAssignment, LeaderClaim, Mount,
  Relinquish, OwnerUnavailable (Code/server/Services/CharacterService.h:43-49).
- Epoch-checked: actor values, max values, death
  (Code/server/Services/ActorValueService.cpp:31, 58, 110), equipment
  (Code/server/Services/InventoryService.cpp:113), mount (server
  CharacterService.cpp:498), release (263). Movement carries no epoch.
- Client: a stale epoch is ignored (client CharacterService.cpp:770-774); a grant
  reconciles to the server's ActorData while the actor is still flagged remote,
  then installs LocalComponent and clears the flag (817-835); an observer resets
  interpolation to where the actor stands, because "the new owner ... stamps
  snapshots with its own clock" (847-851).
- Epochs are seven weeks old: PR #887 (merged 2026-08-29), commit 1f488f6fef
  "Replace optimistic client ownership with versioned server grants".

## 2. What the owner sends, what remotes do, how remote AI is muted

Owner sends, all read from its own engine
- Movement: ClientReferencesMoveRequest {tick; per actor cell, worldspace,
  position, rotation x and z, animation variables, direction}
  (Code/encoding/Structs/Movement.h:22-27; Code/client/Systems/AnimationSystem.cpp:112-131),
  every 30 ms for players, mounts and actors in combat, every third send for the
  rest, 8 actors per unreliable packet (client CharacterService.cpp:1776-1836).
- Actions: every BGSAction the owner's ActorMediator::PerformAction 38949 ran:
  {tick, action, target, idle, actor state flags 1 and 2, type, event names,
  animation variables} (Code/client/Games/Animation.cpp:23-65;
  Code/encoding/Structs/ActionEvent.h:11-21; AnimationSystem.cpp:133-142).
- Equipment: EquipManager equip and unequip hooks for local actors
  (Code/client/Games/Skyrim/EquipManager.cpp:158-222; ids 38929, 38934, 38928,
  38933, 38930, 38935 at 325-330); server checks owner and epoch
  (InventoryService.cpp:99-146).
- Values: a full diff each second with the epoch
  (Code/client/Services/Generic/ActorValueService.cpp:103-163, 274-286); health
  as deltas (165-233); death state every 250 ms (235-272).
- Projectiles: Projectile::Launch 44108 from local shooters
  (Code/client/Games/Skyrim/Projectiles/Projectile.cpp:55-67;
  Code/client/Services/Generic/CombatService.cpp:40-88); casts from
  ActorMagicCaster::SpellCast 34144 (Code/client/Games/Skyrim/Magic/ActorMagicCaster.cpp:29-46).
- Factions each 2 s (client CharacterService.cpp:1939-1978); speech
  (Code/client/Games/Skyrim/Actor.cpp:1215-1232); mounting (1195-1201).

Server
- Relays movement unreliable, no Nagle, to players in range, and takes the
  owner's position and cell as the actor's (server CharacterService.cpp:371-420).
- Relays actions (a script hook may cancel them) and keeps the last 32 for late
  joiners, trimmed at the last "exit" action, idles swapped for instant variants
  (422-454; Code/server/Game/Animation/ActionReplayCache.cpp:18-62,
  ActionReplayCache.h:19). Its header: the best answer would be serializing
  animation graphs, "a pretty hard reverse engineering task"
  (ActionReplayCache.h:7-10).

Remotes do
- Movement: snapshots sorted by tick on a per-actor playback clock; extrapolate
  at most 150 ms; over 1024 units between snapshots is a teleport; corrections
  over 256 units snap (Code/client/Systems/InterpolationSystem.cpp:14-22, 124-141).
  Each frame: ForcePosition, LoadAnimationVariables, the middle process's
  direction, SetRotation (95-121). ForcePosition is SetPosition under a recursion
  override that also refreshes the char controller's step timing (Actor.cpp:181-199).
- Actions at the playback tick: set the actor state flags, load the animation
  variables, build a TESActionData, ActorMediator::ForceAction, which is
  PerformComplexAction 38953 then ApplyAnimationVariables 39004
  (AnimationSystem.cpp:23-70; Animation.cpp:81-101; TESActionData vtable 188603
  at 143-151; ActorMediator singleton 403567 at 67-72). A spawn replays the cached
  chain at once (AnimationSystem.cpp:83-95; server CharacterService.cpp:135-136).
- Health: ForceActorValue(DAMAGE) by the delta, Kill() at 0
  (client ActorValueService.cpp:288-314); other values set or forced except health
  and dragon souls (316-350); death state Kill() or Respawn() (382-417).
- Weapon draw: SetWeaponDrawnEx twice, at 0.5 s and 2 s, "Skyrim's weapon drawing
  is the most finnicky thing in existence" (client CharacterService.cpp:2044-2076).

How a remote NPC is kept from acting: TE never turns the AI off (a code search
for EnableAI in TE finds nothing). The AI still runs on remotes (PR #27 had to
gate their package update loop; #898 describes the engine retrying ActionSheath
every frame on a replica); each effector refuses for an actor flagged remote:
- ActorMediator::PerformAction 38949 returns 0 (Animation.cpp:28, 64): no
  attacks, draws, idles. Issue #810 calls clearing the flag what "unlocks NPC AI".
- Actor::ActorProcess 37356 is skipped, keeping only the char controller step
  timing (Actor.cpp:1241-1255); TE calls it "native movement processing" (#901).
- Actor::SetPosition 19790 (Actor.cpp:907-925) and TESObjectREFR::RotateX/Y/Z
  19787 to 19789 (Code/client/Games/Skyrim/TESObjectREFR.cpp:1100-1137, 1154-1156).
- Equip and unequip of items, spells, shouts without an override
  (EquipManager.cpp:163-169, 197-204, 230-231).
- SpellCast 34144 (ActorMagicCaster.cpp:29-30); Projectile::Launch 44108 nulls the
  projectile (Projectile.cpp:55-67).
- DamageActor 37335 (Actor.cpp:964-1014); RegenAttributes 37448 for health
  (1046-1061); ApplyActorEffect 35086 for positive health (1019-1041);
  AddDeathItems 37198 (1260-1266).
- Package selection, CheckForNewPackage 39114, was meant to be gated: compiled out
  (section 3).
- ActorKnowledge::UpdateDetectionState 42704 cancels only a remote PLAYER's
  detection of the local player (Actor.cpp:1157-1177; IsRemotePlayer is remote
  and player, Code/client/Games/ActorExtension.cpp:20-23). TE-MAP's "a remote's
  NPCs never detect the local player" is wrong; this hook leaves NPC detection alone.
- IsFleeing 37577 returns false for players (Actor.cpp:1271-1279): the fix for NPCs
  ignoring remote players, who were flagged fleeing (#591, comment 2023-12-09).

## 3. The dropped AI package sync

The code (Code/client/Games/References.cpp:81-115): `#define AI_SYNC 0` under
"Disable AI sync for now, experiment didn't work, code might be useful later on
though." Both hooks stay installed (144-145) and pass straight through:
- CheckForNewPackage 39114: return false for remotes, so a remote stops choosing
  its own packages (84-95).
- InitFromPackage 38959: on the owner, raise InitPackageEvent(actor, package); on
  a remote, refuse unless the guard `s_execInitPackage` is set, which marks the
  remote applying a received package (97-115).
Still wired: InitPackageEvent to NewPackageRequest (client CharacterService.cpp:1041-1068);
NotifyNewPackage to Actor::SetPackage, which calls PutCreatedPackage under the
guard (1070-1097; Actor.cpp:315-322); the server relays it in range with no owner
check (server CharacterService.cpp:525-536). Nothing fires the event.
The third hook in the file is Console SetCurrentPickREFR 51093
(References.cpp:117-131, 138): it sets the debug overlay's id, nothing about AI
(CommonLib names AE 51093 RE::Offset::Console::SetSelectedRef,
CommonLibSSE-NG include/RE/Offsets.h:173).

History (gh api commits and pulls)
- 2022-01-11 de84956e48 "feat: first step in syncing AI packages" (the
  CheckForNewPackage gate, then in Skyrim/Actor.cpp); 17080d15df "tweak: force set
  actor AI package" (names vtable slot DF PutCreatedPackage).
- 2022-01-22 a2aa136298 "feat: sync TESPackage by actor ownership" (InitFromPackage
  hook, event, the two messages, server relay); d86dfdaedd "feat: AI sync for
  Fallout 4" (moved to References.cpp, added the guard and SetPackage).
- PR #27 "AI sync" (merged 2022-01-23; two approvals, no comments), body:
  "Highly experimental (but functional) code, I need this to be properly tested
  before expanding. This code does the following two things: it firstly disables
  the AI package update loop for remote actors. Secondly, it synchronizes the
  current AI package performed by the owner of the actor with the other clients.
  The problem this aims to solve is smoothing over actor ownership transitions,
  specifically having idle animations match up with their local AI."
- 2022-02-09 3dfb56936d "tweak: disable AI sync for now". PR #47 (merged
  2022-02-12), body: "It's causing too many crashes right now, and it didn't work,
  will figure out a better solution later." That is the whole record: no issue,
  no comment, no trace of which crash or what "didn't work" meant.
- 2024-11-02 10bbc7a389 moved the guard and SetPackage to Skyrim/Actor.cpp as
  `static thread_local` (Actor.cpp:315) while References.cpp:104 still names it:
  flipping AI_SYNC to 1 would not compile (inference from internal linkage; code
  search finds the symbol only in those two files).
- 2026-10-16 ea0f6c390f (PR #854, today) message: "AI packages only run on Leader,
  so if Member triggers a scene, the AI packages doesn't run. If it is anything of
  consequence ... the scene will get stuck and Leader will have to take over."
  Its two options: "SceneMaster to take ownership of NPCs in-scene", or "reactivate
  AI on 'remote' NPCs for the duration of the scene, This sounds more fragile."

## 4. Combat: whose game decides a hit on an NPC

DamageActor 37335 (Actor.cpp:964-1014), read as code, untested:
- hittee is the local player: applied here (975-985); with PvP off a remote
  player's hit is dropped (977-981).
- hittee is a remote player: never applied here (986-989).
- hitter is the local player: applied here whoever owns the NPC (991-998), and the
  delta goes out (HealthChangeEvent, then RequestHealthChangeBroadcast,
  client ActorValueService.cpp:165-205).
- hitter is a remote player: not applied here (999-1002); its own game did.
- NPC on NPC: applied only where the hittee is local (1005-1013).
So a player's game decides that player's hits on any NPC; the victim's game
decides hits on a player; between NPCs owned by different clients, the hittee's
owner decides, against the attacker's replayed swing.
- Server: health deltas are accepted from any client for any actor, no owner or
  epoch check, applied to the record and relayed (ActorValueService.cpp:77-100,
  the TODO at 81). Every receiver kills at 0 HP (client ActorValueService.cpp:301-306),
  besides the owner's death state.
- Targeting is the owner's engine AI. TE's own override (CombatController::UpdateTarget
  33236, and the hit and target code in CombatService) is compiled out
  (Code/client/Games/Skyrim/Combat/CombatController.cpp:77-87; CombatService.cpp:165-199, 204-249).
- Ranged: remotes relaunch from the owner's launch data with bUseOrigin
  (CombatService.cpp:90-161); the server relays without checks
  (Code/server/Services/CombatService.cpp:15-56).

## 5. Known problems in TE's tracker

Searches (`gh api search/issues`, repo:tiltedphoques/TiltedEvolution): npc
desync, duplicate npc, npc duplicate, npcs duplicated, npc teleport, npcs
teleporting, ownership, owner npc, npc sync, AI package, npc combat, npc stuck,
npcs not moving, double npc, npc position, sliding npc, ownership transfer, actor
ownership, desync teleport, npc dead alive, npc t-pose, npc respawn, party leader
npc. The separate bug repo #241 was moved to (tiltedphoques/bug-feature-reports)
now returns 404.
- Ownership fighting: PR #887 (merged 2026-08-29): epochs "prevent clients from
  fighting over control (usually happened when an NPC entered the cell) or applying
  stale inventory and equipment updates"; it is the root fix for naked NPCs (#396,
  reported 2022-07-23).
- Duplicates: PR #906 (merged 2026-10-02, commit 2478ef001b): owners applied the
  server's echo of their own stale request; dead encounter NPCs (the WE23 soldiers)
  were Respawn()ed, reset, rediscovered as new, and each relinquished copy went to
  another player, "piling up hundreds of NPCs until the game crashed". The fix is
  visible at client CharacterService.cpp:444-451. Earlier: #298 (2022) NPCs seen by
  only some players, fixed by #314 (leader spawns encounters, "they also won't
  duplicate").
- Handoff breaks AI: #810 (open since 2025-09-22): when the leader leaves a cell
  the others receive its NPCs, the flag clears, and NPCs spam Unequip and
  combatStanceStop and never attack. #881 (closed unmerged 2026-07-21: "couldn't
  conclude that the commits ... resolved the core issue"); #898 (open, 2026-09-15)
  traces it to SetWeaponDrawnEx's state flip leaving the weapon state at 4 ("wants
  to sheathe"), refused by the graph, retried every frame. On #845 (open) a
  maintainer, 2026-01-01: "first resolve the bugs surrounding NPC ownership
  transfer so that cell changes become less fragile and desync-prone".
- Teleporting: no issue by that name turned up. In code, a relinquish teleports
  every observer to the old owner's last view (server CharacterService.cpp:286-298),
  and a grant resets interpolation (client 847-851).
- Animation and movement: #811 (merged 2025-10-27): "sliding NPCs" (slide, skate,
  T-pose, stand on chairs, run while seated), reduced by the replay cache, "do not
  fully resolve the issue"; #921 (merged 2026-10-11): remotes were shown a fixed
  0.3 s late and froze on hiccups, and standing NPCs still send 10 times a second;
  #901 (merged 2026-09-22): Havok "gliding" from remotes' zero controller timestep;
  #176 (2022): 3D not moving while positions update.
- Identity: #882, #892, #899 (2026): leveled NPCs resolving to different NPCs on
  each client; the owner's pick now rides the wire.
- Combat: #258, #307, #591 (2022 to 2023): NPCs aggro only the leader (remote
  players flagged fleeing); #306 (2022): non-leaders take punch damage from armed
  NPCs; #228, #241 (2022): NPCs at 0 HP not dying.

## What thuum takes as a map

Leads under rule 1 (`just addr`, then Ghidra), SKSE events first (ADR-034).
1. Hostable set: the host engine's high process list with 3D is TE's whole
   ownership boundary (DiscoveryService.cpp:228-268). CommonLib names it:
   RE::ProcessLists::GetSingleton and highActorHandles
   (CommonLibSSE-NG include/RE/P/ProcessLists.h:36, 69). A host that cannot
   materialize an NPC declines (TE's DeclineGrant).
2. The non-host mute set, one gate per effector: PerformAction 38949, ActorProcess
   37356 (keep the controller timestep valid, #901), SetPosition 19790 (CommonLib:
   Actor::SetPosition virtual 0A9, include/RE/A/Actor.h:367), RotateX/Y/Z 19787 to
   19789, EquipManager 38928 to 38935, SpellCast 34144, Projectile::Launch 44108
   (CommonLib: src/RE/P/Projectile.cpp:258), DamageActor 37335, RegenAttributes
   37448, ApplyActorEffect 35086, AddDeathItems 37198. Untried by TE: CommonLib's
   Actor::EnableAI (include/RE/A/Actor.h:521) as one whole-AI mute; a T3 question,
   since TE's muted-but-thinking AI is what breaks at handoff (#810).
3. Replay on non-hosts: the ForceAction shape (PerformComplexAction 38953,
   ApplyAnimationVariables 39004, singleton 403567, TESActionData vtable 188603),
   LoadAnimationVariables, the middle process direction, ForcePosition, and a short
   replay cache for late joiners. It is our cast-action figure shape, for NPCs.
4. The movement envelope: 30 ms and 90 ms, about 120 bytes a humanoid, unreliable,
   stamped with the host's tick (client CharacterService.cpp:1778-1784), a playback
   clock per actor (InterpolationSystem.cpp:14-22; #921).
5. Handoff pieces: an epoch on every grant and every host message; a release that
   carries the last cell and position; decline when not loaded, with the decliners
   remembered; reconcile while still remote, then flip (client
   CharacterService.cpp:817-835); observers restart interpolation (847-851).
6. Packages as observe points only: CheckForNewPackage 39114, InitFromPackage 38959;
   CommonLib's PutCreatedPackage (virtual 0DF, Actor.h:421) and EvaluatePackage
   (Actor.h:523) if the server ever records a host's package (R2).
7. The weapon-state trap (#898): a forced draw or sheathe the graph refuses can
   strand ActorState at 4; check acceptance before imposing a draw on a figure.

## What thuum must not copy (TE trusts the owner)

1. Ownership by first discovery and by party role (server CharacterService.cpp:644,
   775-822): thuum's host is per cell and chosen by the server.
2. The owner's state as the record: movement and cell taken as sent (server
   CharacterService.cpp:396-404); values and death overwritten on the epoch alone
   (ActorValueService.cpp:23-48, 102-125); the base and leveled pick
   "Client-authoritative" (server CharacterService.cpp:657).
3. Hitter-decides damage and health deltas from anyone (Actor.cpp:991-998;
   ActorValueService.cpp:77-100): our damage numbers are R0, hit registration R1.
4. Destroying an NPC nobody hosts (server CharacterService.cpp:903-904): an
   unhosted cell freezes and the server keeps its last record.
5. Relaying package ids to remotes: tried in 2022, crashed, dropped, now dead code.
6. Teleporting every observer to the releaser's last view (server
   CharacterService.cpp:286-298): with a server
   record, the actor can hold until the next host's first snapshot.

## Concepts (for the doc's citations)

- The epoch is a fencing token: Kleppmann, "How to do distributed locking" (2016,
  martin.kleppmann.com); Burrows, "The Chubby lock service for loosely-coupled
  distributed systems", OSDI 2006 (sequencers).
- Snapshot playback a fixed or adaptive delay behind the sender: Valve, "Source
  Multiplayer Networking" (developer.valvesoftware.com); Bernier, "Latency
  Compensating Methods in Client/Server In-game Protocol Design and
  Optimization", GDC 2001.
