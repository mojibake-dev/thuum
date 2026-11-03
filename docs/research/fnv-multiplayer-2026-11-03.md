# New Vegas multiplayer, read for ADR-063 and ADR-065: NV:MP, NVCoop, fnv-coop, VaultMP and the older Gamebryo projects (2026-11-03)

Read 2026-11-03 (written 04:11 PST) for numidium, at Eli's suggestion that the Fallout: New Vegas multiplayer projects may have
solved problems we have. New Vegas runs on Gamebryo, the lineage of Skyrim's Creation Engine, with the same changed-forms save
system and a script engine of the same family. Each project gets seven questions (capture, authority, late join, scripts, NPCs on
non-owners, containers and physics, failures), then its mechanisms are set against ADR-063 (one owner per object; non-owners
render; the server validates consistency only) and ADR-065 (PROPOSED: the save is the state). Section 5 is the short list.

Rule 7 applies to every project here as it does to Skyrim Together: they are read for design ideas and engine hook points, and no
code from any of them enters this repo, whatever its license. The addresses below are FalloutNV.exe 1.4.0.525's as the projects
publish them: leads for which engine function matters, never a Skyrim address (rule 1).

The evidence differs by project, and each claim says which kind it is:
- NV:MP has been public since at least 2016 (fnv-coop docs/05-nvmp-intel.md:110-113, citing GameSpot's 2016 article) and is
  closed. Its mechanisms come from its changelog, its server SDK, an early public snapshot of its own code and a third party's
  reading of its binaries. A changelog line says what broke and what was fixed; a mechanism behind it is an inference, marked so.
- NVCoop publishes a README; its source is private.
- fnv-coop publishes its tree. Most of its code ran only in game-free tests, and its docs say so file by file; its dated in-game
  findings are quoted as such.

## Sources

| Project | Read | License | State |
|---|---|---|---|
| NV:MP: https://nv-mp.com/ and its wiki, https://nuwiki.nv-mp.com/wiki/Main_Page (Changelog, Hosting_CO:OP, Hosting_TTW, Client_Troubleshooting, Getting_Started; raw wikitext) | changelog through 9.32 (04/10/2026), fetched 2026-11-03 | client and server closed; the site: "provided 'as is,' with no express or implied warranty" | active |
| x-native, https://github.com/dev-oren/x-native: NV:MP's own 2020 rewrite ("NVMP-X", README.md:4) | 8dfc161e, 2020-11-24 | none declared | a snapshot: "The legacy project is still closed source" (README.md:24) |
| NVMP-SDK, https://github.com/clayne/NVMP-SDK: a mirror of the deleted NVMP/SDK (fnv-coop docs/nvmp-findings.md:41), NV:MP's C# server SDK | 59ea7e5d, 2025-09-13 | none declared | mirror |
| NVMP-Companion, https://github.com/devmlew/NVMP-Companion: a third party's runtime patches to NV:MP 8.1 | 9ec39ea4, 2026-04-02 | none declared | active |
| NVCoop overview, https://github.com/bretm9/nvcoop-overview | 4cc06d7d, 2026-09-21 | no license file; "The source code is private" (README.md:9) | alpha between two machines (README.md:96) |
| fnv-coop, https://github.com/cranebeaker/fnv-coop; lonelybean13/fnv-coop and Schrofingerbib/fnv-coop are forks of it | the xNVSE design at 5b74d712 (2026-10-25, via the lonelybean13 fork) and the legacy-xnvse branch head dcac47c5 (2026-10-31); main at d21ec483 (2026-11-02) for the move to nv-rs | MIT on the xNVSE branches (LICENSE, "Copyright (c) 2026 cranebeaker"); GPL-3.0 on main, which builds on slaterain/nv-rs (GPL-3.0) | the xNVSE plugin stopped at alpha 0.1.8; main is the nv-rs version |
| VaultMP, OblivionOnline and the Fallout 4 projects | section 4's table | | |

Paths below are relative to each project's root at the commit in this table; "legacy" is fnv-coop's legacy-xnvse head and "main"
its main head. The changelog is cited by version and date.

## 1. NV:MP

### Capture
- Discovery is by encounter: "Players will sync to the server specific gameplay objects they encounter. The server is never fully
  aware of the state around a player unless they send encounter messages to the server" (NVMP-SDK
  NVMP/src/Entities/INetCharacterEncounterConfig.cs:7-11). The encounter kinds are actors, references and doors
  (NVMP/src/Entities/NetCharacterEncounterTypes.cs:6-18).
- The owner pushes an object's state and nobody else does. In the 2020 snapshot an object synchronises only where it is local,
  `ShouldSynchronise` returning "connected and local" (x-native source/lib/lib_net/src/networkobject.cpp:68-71), and every object
  sync writes the owner first (:75-76). The state is a list of bit-packed network variables registered on the object
  (source/lib/lib_net/inc/networkobject.h:155-163).
- The shipped code marks what to send per variable and per variable group. 5.57 (12/09/2023) fixed "the network code would always
  sync out boolean states due to always having 'set' data, when this was incorrect" and "would always sync out the initial/reset
  state of variable groups due to them always being marked as active even if their children were not"; 5.5 (31/08/2023) fixed
  groups that "would never trigger their OnChanged events if a group element changed by a remote entity".
- What is synced, by the changelog: movement and animation; actor values and health; inventory and equipment; life state and
  corpses; doors' open and closed state and "All activators with animations", but not locks (5.4, 11/08/2023); destructible health
  (5.5); scale on any reference (5.0, 25/03/2023); furniture use (9.1); containers, from 9.1 (19/07/2026); game time and weather
  (4.9, 11/02/2023); facegen and ragdolls (9.3, 02/10/2026).
- Not synced: quests, stages, globals and script variables. No changelog entry adds them, and fnv-coop's reading of the client
  found nothing that replicates them (fnv-coop docs/05-nvmp-intel.md:132-136).
- Engine functions: none published. fnv-coop's Ghidra reading of client.dll 9.4 names two (docs/nvmp-findings.md:12-26; a lead,
  not a fact): FUN_100cc9e0, "NetEncounterManager 'Encountered Actor'", and FUN_10056040, the per-actor update. The binary has
  Microsoft Detours sections (:3-4). Two changelog lines suggest NV:MP also marks the engine's own change flags when it applies
  state: "Inventory code will mark changes on their references to indicate actor refreshes" (RADD 6.4, 19/04/2024) and "Removed
  accidental debug code that would set modified flags on low-level engine code every frame" (5.55, 07/09/2023). Which function
  they call is not published.

### Authority
- One owner per reference: `PlayerOwner`, "The player who currently owns this actor for synchronisation" (NVMP-SDK
  NVMP/src/Entities/Interfaces/INetReference.cs:179-182). The owner's copy is local and every other copy a ghost: the client's
  network reference has a locality byte at +0x1AE, 0 ghost and 1 local (NVMP-Companion PATCHES.md:92-98, NV:MP 8.1). The owner
  sentinels are the server (-1) and nobody (0) (x-native source/lib/lib_net/inc/networkobject.h:12-13).
- Assignment: clients discover and upload what they encounter, and the server arbitrates owners (fnv-coop
  docs/05-nvmp-intel.md:53-57). Ownership moves on touch: "Activating a door will now change ownership" (5.42 to 5.45,
  15/08/2023); "Attaching an object to another object will automatically transfer ownership" (SDK 5.25, 19/07/2023); a script may
  hand an object to the server (same entry). A player's own character never changes hands: "Cannot change ownership of
  INetCharacter" (NVMP/src/Entities/Network/NetReference.cs:632-635).
- Time and weather follow "the worldspace's host" by default (4.9); a "non-transient" worldspace is "fully serverside controlled"
  (SDK 4.9).
- When an owner leaves, the reference's simulation type decides (NVMP/src/Entities/NetReferenceSimulationType.cs:7-38). Static
  stays on the owner's list until they disconnect. HotSwap "will swap to other player's lists if they become invalid, either by
  disconnecting or losing PVS", and "If the reference swaps to the server, the object will reset to it's default state until the
  next player that is available receives it". HotSwapTemp is destroyed if it lands on the server; Temp dies with its owner. An
  owner that pauses stalls its objects: `IsIdle` is true when the owner "has tabbed out of the game, entered a game menu that
  freezes the game, or has lost connection" (INetReference.cs:322-326).
- The server enforces ownership on combat. In 8.1 the story server's attack handler refuses an attack unless the attacker owns the
  target NPC, and the client's damage receiver refuses damage to a ghost (NVMP-Companion PATCHES.md:18-45, :61-74). From 5.5:
  "Destructable objects owned by another machine will no longer receive damage until they become local".

### The ownership-tracking bug (5.55)
The entry (5.55, 07/09/2023): "Fixed an invisible issue where the game server would dirty and update every synced reference due to
ownership tracking code falsely dispatching ownership updates. Should reduce a lot of server spent time." The design behind it, as
far as the published pieces show (an inference; the server is closed):
1. The owner is part of each object's synchronised state: the 2020 code writes `m_Owner` at the head of every object sync
   (x-native networkobject.cpp:75-76).
2. The network layer sends what is marked (the 5.57 "set" and "active" entries above), so its cost scales with the marked objects.
3. The server re-decides owners all the time: encounters, PVS loss, door activations, attachments, the SimType rules. That tracker
   dispatched an ownership update even when the owner had not changed; each dispatch wrote the owner and marked the reference, so
   every synced reference was serialised and resent every tick, and the dirty mask saved nothing.

The same release removed debug code that "would set modified flags on low-level engine code every frame", and the two 5.57 entries
are the same failure in two more places: a mark set on write rather than on change decays into a full resend.

### Late join and materialization
- An object's state reaches a player when the object enters the player's potentially visible set: "leaving a PVS with an object
  doesn't re-send the object state, but only when acquiring PVS" (4.77, 24/01/2023). A joining client's first "Message of the Day"
  packet "tells the server you're ready to be synchronized" (wiki, Client_Troubleshooting).
- Construction at the record: "Construction of TESObjectREFR's and Actor's will now use the direct network position, instead of
  the interpolated value to prevent origin spawning / initial desync when encountering a remote object" (5.4).
- Ordering at a change of owner: "the network code would not wait for new owner's of references to sync in the data needed to
  clone to other players correctly, instead driving through the dedicated server's copy to other players first", and "encountered
  references would not be synced to the server from the object owner's state, and would reset to default properties (such as NPCs
  resetting their appearance data)" (both 5.57).
- Two arrivals at once: "TESObjectREFR's of the same form type could potentially duplicate if two players entered a cell at the
  exact moment" (5.4). 9.0 (18/04/2026) fixed "saved-state reload, and PVS re-entry stale-state recovery".
- No published use of the engine's save or load path for network state. Players keep separate local MP saves ("ATK operates on
  it's own MP saves", wiki Getting_Started; a "temp-store to live-game-saves" step, Client_Troubleshooting).

### Scripts
- Every client runs its own scripts, and the co-op server runs none: "No server-side scripting" (wiki Hosting_CO:OP). Nothing
  replicates script state. Quest-flagged, follower and runtime-created actors are kept per player by the encounter logic: "Quest
  NPCs are deliberately excluded from sync" (fnv-coop docs/nvmp-findings.md:12-21, its reading of FUN_100cc9e0).
- Locks stay local on purpose: "We have chosen not to synchronise locked states to avoid potential quest breakage" (5.4).
- The wiki's advice for a broken quest: "sometimes in-game time and other players in the area can disrupt scripts"
  (Client_Troubleshooting).

### NPCs on non-owners
- Ghosts follow the owner's stream and cannot be damaged locally (above). Life state converges on the network's: the per-actor
  update kills a local copy when the network says dead and resurrects it in the reverse case, logging "auto-killing" and
  "auto-resurrecting" (fnv-coop docs/nvmp-findings.md:23-26, its reading of FUN_10056040).
- Tried and reverted: "Remote actors are now internally classified as essential in damage code" (5.4), then "Reverted essential
  flag changes to remote actors due to random on screen prompts and damage tracking isues" and "Reverted changes to knocked state
  sync as it was causing players in PVP to start randomly sinking" (5.42 to 5.45).
- Corpses: "Dead actors have a bit more tolerance on their dead body's synchronised location to prevent clipping behaviours"
  (5.4); "fixes for missing player corpses" (5.0); pathing tweaked for "Actors that are synced but simulated locally"
  (23/04/2024).

### Containers and physics
- Containers became "synchronized and persistent" only in 9.1 (19/07/2026); 9.3 fixed "containers may suddenly self-delete".
  Inventory sync applied twice: "the network code would duplicate all items by +1 when the server updates the state of actor's
  inventory (such as /stock or /additem)" (5.57). 9.1 fixed "inventory crashes that have plagued us for the last 6 years".
- Two players on one object: ownership moves on activation and on attachment (above); a simultaneous cell entry duplicated
  references (5.4).
- Physics: network quaternions "could occasionally move references and actors with NaN rotations, causing the engine to panic and
  remove NiNode's from the render list", "usually ... with rotations of objects that had settled"; angle panics now "assert and
  back out before they reach NiNodes" (5.5). Moved statics crashed players when "that cell was unloaded due to culling" (5.5); 9.1
  fixed "object flicker when on the edge of sync boundaries".

### What it reports as failed or hard
Beyond the above: "a ghost object or actor might follow one player for the entire of the server's playtime" (9.3); local saves
corrupted by network state, "doors would be deleted if they threw an SEH exception on activation, causing save-baked missing
doors" (5.57) and "spamming a door to enter it would sometimes remove the door entirely from your save file if the previous cell
unloaded quick enough" (5.55); a load-order change mid-session now ends the connection (4.9).

### Against thuum
- Confirms ADR-063's one owner and "non-owners render" (DECISIONS.md:4002-4014): ghosts take no damage, owned destructibles wait
  to become local, and ownership moves on touch as ADR-058's toucher and ADR-061's opener have it.
- Shows what ADR-065 fixes. A server with no record of its own resets an unowned object to its default (HotSwap) and lets a stale
  copy through (5.57); that is the class of thuum's D4 and P9 (docs/engine/non-owning-seat.md:55-56).
- Warns ADR-065 decision 2 (DECISIONS.md:4220). AddChange marks on write: the census answered all 16,433 kMoved marks from
  SetPosition true in about 170 s, and ACHR kGameOnlyExtra came about 146 times a second (docs/engine/change-forms.md:55). A mark
  is a candidate, as NV:MP's "set" and "active" flags were (item 3 of section 5).
- Locks: NV:MP left them local because each client ran the quests. ADR-062 gives a cell's scripts and its locks one owner, which
  removes that reason; the night lock (system 5) is a lock the AI changed with no script, which only an observe point below the
  scripts sees.

## 2. NVCoop

"An xNVSE plugin (C++) that turns Fallout: New Vegas ... into a two-player co-op session over LAN" (README.md:5); 565 commits in
seven weeks and a v2 rewrite (README.md:93-94).

- Capture: "Engine hooks capture quest-stage changes, script-variable and global writes, actor state, inventory changes,
  containers, world items, physics props, doors, time, and weather" (README.md:28), at addresses taken from xNVSE and JIP LN NVSE,
  each recorded with its source in an address table (README.md:54). "The same hooks handle quests in the base game and DLC without
  code for individual quests" (README.md:34). How a script-variable or global write is caught is not published.
- Authority: "Interaction locks resolved by the host, simulation authority per cell ('cell hosts'), and a quest-authority table
  that changes as players start interactions" (README.md:56). "The player who starts dialogue or opens a container or terminal
  controls that interaction. The partner sees 'busy' until it ends, and the results replicate to both games" (README.md:35); "The
  host resolves conflicts and supplies join snapshots" (README.md:36). How a cell host is chosen and what happens when one leaves
  are not published. (The cell hosts, the host-resolved locks and the quest-authority table are NVCoop's; fnv-coop has none of the
  three terms.)
- Late join: "A joining client receives quest states, quest-script variables, globals, tracked world changes, clock, and weather.
  Each player saves locally with a session epoch recorded in the NVSE co-save" (README.md:59). Join snapshots go on a reliable,
  unordered bulk channel beside a 20 Hz state channel (README.md:58). Dynamic references (drops, spawns, projectiles) get
  session-wide NetIDs mapped to each game's local form ids; static form ids pass through, with load-order hashes checked at the
  handshake (README.md:57). Whether the snapshot lands before or after a cell's references load is not published.
- Scripts: "Quest scripts run on the peer responsible for that quest, reference scripts run on the cell host, player-triggered
  blocks run where the local player caused the event, and dialogue results run on the interaction's lock holder. A hook at the
  script runner prevents the other game from executing the same logic. The resulting changes are then captured and sent to the
  other game" (README.md:66).
- NPCs on non-owners, containers and physics: beyond the capture list and the locks, not published.
- Failures: "The first version used symmetric peers. In-game testing led to a v2 rewrite with host-authoritative sync: the PC
  hosts the world, and the Steam Deck joins with a character" (README.md:94). The plugin detects hook sites JIP LN NVSE has
  overwritten, reports the affected features and disables co-op when a required hook is missing (README.md:80).

Against thuum:
- Its script rule is ADR-062's and ADR-063's in four clauses: reference scripts on the cell host; player-triggered blocks on the
  player's own game (ADR-044's player-scoped class); dialogue results on the lock holder (ADR-061's opener rule applied to a
  conversation); quest scripts on the quest's owner.
- The quest-authority table is what ADR-063 decision 1 lacks. Its list of owners (DECISIONS.md:4002-4008) has no row for a quest,
  and the guest measurement under decision 3 found Quest.Start (401 calls), Quest.Stop (403) and GlobalVariable.SetValue (118)
  running live on a guest, as natives "with no cell to gate on" (DECISIONS.md:4021-4025). Item 2 of section 5.
- v1's failure confirms the single-owner direction from the other side: symmetric peers did not survive in-game testing.

## 3. fnv-coop

A story co-op for 2 to 4 players. At 5b74d712 it is "an xNVSE plugin plus a game-free sync core that keeps quests, objectives,
dialogue results, reputation and karma identical on every machine" (README.md:19-21); by the legacy head it has its own avatars,
NPC, combat, loot and world sync and needs no NV:MP (legacy README.md:23-35). The xNVSE version stopped at alpha 0.1.8 on
2026-10-31, with "Goodsprings stage sweep: 65 of 104 stages pass" and "Goodsprings story run ...: 7 of 18 steps pass" (legacy
README.md:16-17). On 2026-11-02 the project moved to nv-rs, a from-scratch New Vegas engine in Rust and Bevy: "Co-op needs an
engine we can change, which is why it lives there" (main README.md:10-12; commit dbd514f).

What ran in a game: a stage script's batch captured on the host and applied on a guest with its quest scripts blocked, "the guest
re-ran 0 scripts, the effects match, and the guest snapshot equals the host snapshot" (docs/STATUS.md:31-34); the actor adapter's
36 checks on one copy and the first step of a two-copy fight (docs/WORK-QUEUE.md:13-18); later the Goodsprings gecko fight on two
copies (legacy README.md:49). The loot, area-digest and story-capture layers say "NOTHING has run in a game" as of 2026-10-21
(docs/tools/loot.md:5; docs/tools/area-desync.md:3; docs/tools/story-capture.md:4-5).

### Capture
- Effect capture, per engine setter and per script command, scoped to a script's run: "Only the host runs quest and dialogue
  result scripts. While one runs, hooks record every primitive world change it causes", shipped "as one ordered transaction"
  (README.md:82-85). Scopes nest, "Only the OUTERMOST scope emits an EffectTxn", and SetStage is recorded on entry so receivers
  apply the stage before its consequences (plugin/hooks/capture_hub.h:7-10). A mutation outside any scope is counted as "ambient
  gameplay" and dropped (capture_hub.h:35).
- The hooks, each entry's first 16 bytes compared before it is patched (docs/engine-addresses.md:39-95): TESQuest::SetStage
  0x60D510, QuestStageInfo::Run 0x60F4A0, QuestStageItem::RunResult 0x60FB60, TESTopicInfo::RunResultScript 0x61F170,
  Script::Execute 0x5AC1E0 (the guest gate), BGSQuestObjective::SetState 0x5EC5D0, TESQuest::SetRunning 0x60C9C0 and SetCompleted
  0x60CA30, TESObjectREFR::SetDisabled 0x5650D0, TESReputation's Add, Set and Remove (0x615C90, 0x615580, 0x615FA0),
  Player::RewardKarma 0x94FD30, and command handlers where no primitive exists (Cmd_AddItem 0x5B4BE0, Cmd_RemoveItem 0x5B4E90,
  Cmd_KillActor 0x5BE2A0, Cmd_Lock 0x5CBF80 and others, :56-75, :146-153). Then 74 more command handlers behind one RefCommand
  effect (:199-207; docs/tools/story-capture.md:40-59), and condition evaluators such as GetDistance's at 0x59BFA0 for party-aware
  conditions (docs/engine-addresses.md:170-188). TESObjectREFR::Activate 0x573170 is an observer on guests (:167).
- Coverage, counted statically over the game's script call sites: 66.6 % synced before the story-capture round and 99.98 % after
  (docs/tools/story-capture.md:9-14), all of it off by default and never run in a game (:4-5).
- Globals and quest variables have no setter: "`set X to y` is executed inline by the script interpreter"
  (docs/engine-addresses.md:121). The first answer diffed every TESGlobal and quest variable around the outermost capture scope
  (plugin/hooks/engine_hooks.cpp:131-192). That missed object scripts' inline writes, so the host now polls every quest variable
  and every global once per frame and reports a value only when it differs from the last one reported (engine_hooks.cpp:1406-1438;
  plugin/hooks/change_tracker.h:9-29; plugin/coop/coop_module.cpp:326-336; plugin/coop/coop_runtime.h:179-184). A host with no
  world baseline makes its first pass silent, so a session does not flood every value (change_tracker.h:15-20). Writes coalesce to
  the last value per key under a token bucket (synccore/include/fnvcoop/replicator.h:1-7, :19-23).
- Reference script variables are polled the same way with a per-poll budget; the first sighting is the baseline, and a cell's
  unload forgets its references so the next sighting baselines again (plugin/hooks_world/world_core.h:147-165). Weather and time
  scale are polled on the host (:167-183).
- What the AI changes on its own: an owned NPC that drinks a Stimpak changes its inventory with no script command, so "the copies
  kept the item (corpse_loot_race, game 2026-10-22: host 2 Stimpaks, client 3, before anyone looted)"; the owner now reads its
  actors' inventories every 500 ms and publishes a list that changed and then held for 1 s (plugin/actors/actor_sync.cpp:786-790;
  docs/tools/actor-port.md:57-64).
- New Vegas has the change flags ADR-065 rests on: its SetStage ends in a virtual call at vtable +0x48 with 0x80000000, which
  fnv-coop names MarkModified (docs/engine-addresses.md:11, :80), and TESReputation::Set marks 2 (:83); JIP's headers put a
  MarkModified at 0x84A690 beside the BGSSaveLoadGame singleton (docs/02-engine-re.md:57). fnv-coop never hooks it. The
  quest-stage mark is bit 31 in both engines: Skyrim's kQuestStages is `1 << 31` (CommonLibSSE-NG include/RE/T/TESQuest.h:208),
  and thuum-cf's decompile saw SetCurrentStageID call AddChange(0x80000000) (DECISIONS.md:4206-4207).

### Authority
- Three kinds (docs/FULL-SYNC-PLAN.md:18-28): story authority is "the host, always" (quests, stages, objectives, dialogue results,
  globals, karma and reputation); actor authority is "an area owner per cell or spawn site", the host when a host player is in or
  next to the cell and otherwise the nearest player, with an epoch; each player owns their own avatar.
- The actor ownership service (synccore/include/fnvcoop/ownership.h, game-free product code): "every live actor is simulated by
  exactly one machine, its OWNER. Ownership carries an EPOCH that rises on every change. Only the owner at the current epoch may
  publish the actor's movement, AV, death or inventory" (:3-4). The change of owner is a handshake: "Transfer(e+1, to) -> old
  owner keeps publishing at epoch e -> new owner applies the last state, sends Ack -> host sends Commit(e+1) -> new owner restores
  native AI and publishes at e+1; old owner stops. If the Ack does not arrive in time the host commits anyway (new owner
  connected) or grants the actor back" (:11-14). Hysteresis: an owner is kept 1.5 s after a change, and a challenger must be 25 %
  closer (:59-63). A leaver's actors are released and decided again (:96-98); a companion follows its recruiter (:107-108); every
  update is judged Accept, NotOwner, StaleEpoch, FutureEpoch, NotYetActive or EchoOfSelf (:153-162).
- Its warning comes from Skyrim Together: PR #906, "Fix rapid NPC duplication caused by owners applying stale assignment state"
  (https://github.com/tiltedphoques/TiltedEvolution/pull/906, merged 2026-10-02). fnv-coop's lessons from it: "Epochs on every
  ownership change; reject updates from non-owners or old epochs; never apply echoed or stale assignment state", and no Respawn or
  Reset3D during a handoff (docs/FULL-SYNC-PLAN.md:12, :70-71). Its fuzzer found three ownership bugs: "double AI, stale position
  after a host load, duplicate spawn identity" (:242).
- Interaction locks: a container has one leased lock, refreshed by every request and released by a close, by the holder leaving or
  by the lease running out (docs/tools/loot.md:19-20).
- A host that leaves: the xNVSE design releases a leaver's actors and nothing more. The nv-rs version decides it: "There is none,
  by policy ... If the host leaves or its link is lost for good, the session ends and the party reloads the last party save under
  a new host" (main docs/COOP.md:309-311).

### Late join and materialization
- A joiner gets the host's shadow state as a snapshot or resumes from its last applied sequence; a joiner whose world came from
  its own save sends (key, hash) for every tracked entry, and the host answers with the difference as force-set effects plus
  revert keys (docs/protocol.md:232-249). Hashes canonicalise script-variable and global values to float32 rounded to 1e-4, so
  float noise is not a difference (:247-248). A host that loads an older save sends Rebase and the client baselines again
  (:251-255); a resume is checked against a hash of the client's shadow at its cursor (:383-389).
- After the load, not before it. The client loads its own save and then applies; a move into a cell that is not loaded is parked
  and retried once a second (docs/tools/story-capture.md:82-83); there is "no verified cell-load event", so a container registers
  at its first open (docs/tools/loot.md:64-65). A load brings every actor back as the save had it: "a gecko killed in one run
  stayed alive on the guest in the next" (plugin/actors/actor_sync.cpp:454-456, game 2026-10-21).
- Created references get host-allocated ids `0xFF000000 | n`, mapped to each machine's local reference, with a tombstone so a late
  SpawnRef never brings one back; the counter is saved, so ids are not reused after a load (docs/protocol.md:451-454;
  plugin/hooks_world/world_core.h:22-38). A stale ledger entry for such an id hung the host after a reload, because by then the id
  named another object (docs/WORK-QUEUE.md:61-64).
- The engine's save path is not used for network state: "only the host's save is the world. Clients keep a sidecar"
  (docs/FULL-SYNC-PLAN.md:151-152).

### Scripts
- The guest gate (plugin/hooks/suppress_policy.h:3-12): quest-owned scripts never run on a guest; INFO and stage result scripts
  never run on a guest; any other script (object, NPC, magic effect) still runs, but "a shared-state mutator it calls is dropped";
  everything is lifted while a host transaction is applied. synccore/include/fnvcoop/authority.h:1-6 states the same rule.
- Inline writes slip past the gate: "`set VMS16.nGangerDeathCount to VMS16.nGangerDeathCount + 1` in a ganger's OnDeath block is
  executed by the script interpreter itself: there is no function to detour". A guest brackets such scripts, remembers the quest
  variables each is known to write (a table generated from the game's own scripts) and puts them back afterwards, and the host's
  value arrives through the poll (plugin/hooks/guest_objvars.h:1-9).
- Per-machine scripts are an allow-list: GuestLocalRun quests (achievements, rumble, DLC setup, fades) run on every machine and
  are never replicated (docs/protocol.md:478-480; docs/MASTER-PLAN.md:69).
- Volatile state is measured: repeated state dumps with no player action, within one launch and across two, mark a key volatile
  when it moves by itself (docs/snapshot-schema.md:97-104); the generated part of the shipped list came from 6 snapshots in 2
  launches, beside manual entries (plugin/snapshot/data/volatile_keys.txt:1-2). One such key was replicated before the list
  covered reference variables: "a per-machine timer on a ref (171CDC var 1, in game 2026-10-21)"
  (synccore/tests/test_baseline.cpp:313-315). The clock globals are excluded by name (docs/snapshot-schema.md:57).
- A guest's interaction runs on the host as the guest. The guest sends an intent (activate, trigger enter, pickup); the host
  re-issues it inside an "acting player" scope, in which the script engine's resolution of the player form and the condition
  evaluator's "run on player" subject return the guest's figure, at one choke point (docs/protocol.md:398-433). It is "NOT a
  global ThePlayer swap: script `player` operands are cached form pointers and the engine assumes a PlayerCharacter there"
  (plugin/hooks/suppress_policy.h:98-100).
- Conditions read script variables. Of 69,332 dialogue condition entries, GetQuestVariable is in 9,276
  (docs/dialogue-design.md:39-40), and 594 INFOs test an NPC's GetScriptVariable (:26). The initiator evaluates them on its own
  copy, so those variables must be current there (:65-71, :84-88).
- The apply path runs the engine's own setter with scripts gated: SetStage goes through TESQuest::SetStage, so the engine's native
  part of a stage (running flag, current stage, journal, HUD notice, MarkModified) happens and its result script does not; every
  apply runs under an echo guard (plugin/hooks/apply_remote.h:1-28).

### NPCs on non-owners
- AI off by `SetRestrained 1`, with `StopCombat` first; on by `SetRestrained 0`, `EvaluatePackage`, then `StartCombat` on the last
  target. "VaultMP and NV:MP use it for the same reason." A restraint the port did not make is never changed
  (docs/tools/actor-port.md:32-37).
- The trap (game 2026-10-22): "A dead or dying actor has no AI to stop, and SetRestrained on it overwrites its life state with 5
  ('restrained', which every reader counts as ALIVE)"; the owner showed a ganger alive while every other machine showed it dead
  (plugin/actors/engine/engine_port.cpp:425-431).
- Deaths: the owner declares them. "A non-owned copy that died locally waits deathGraceMs (1.5 s) for the owner's message, then is
  revived; a story NPC's copy is never revived" (docs/tools/actor-port.md:107-111). Health mirrored onto a copy is never written
  below 1, because "a mirrored 0 would kill the copy before the owner's death arrives" (:88-89).
- Save safety: every reference the port restrained, cloned, disabled or made essential goes into a ledger file and a cosave record
  and is undone at start, at every load and at a session's end, because "a save made while an NPC is restrained would keep it
  frozen in single player" (docs/tools/actor-port.md:48-53).
- Stand-ins: removing a clone in the frames of its last SetPos crashed three clients, "the engine ran a queued SetPos X on a
  removed stand-in's id" (docs/tools/actor-port.md:94-99).

### Containers and physics
- The rules (docs/tools/loot.md:15-41, game-free on 2026-10-21): one host record per container; open, take and put are requests,
  applied optimistically and rolled back on a refusal; one leased lock, and a second opener is refused Busy; leveled contents are
  resolved once, by the first sender; pickups are claims and the first wins; every transfer is an idempotent transaction, with a
  digest on close; "The host's engine is the authority for what scripts do", checked every 500 ms. Physics clutter is published by
  its mover while it moves, then one final at-rest pose, and "a second mover takes over only from an owner that is resting"
  (:38-39).
- Ordering rules the fuzzer found (loot.md:42-46): read an open container before handling a host message, since "a correction
  replaces the engine copy and would swallow a change nobody has looked at"; after a correction, read again and rebaseline.
- In game, 2026-10-26 and 27 (legacy docs/tools/loot.md:53-74): a take from a closed container with no menu (a console line, a
  quick-loot mod, a script) bypassed the lock, and two simultaneous grabbers both kept everything, "3 duct tape became 6". A 50 ms
  scan now compares each engine copy with what it held when it last matched the shared state, not with today's shared contents: an
  incoming delta between the local take and the scan had made the copy equal the shared contents and hidden the take.

### Against thuum
- Confirms ADR-065's premise from the other side. A per-command list reached 99.98 % of the script call sites and still needed one
  poll per path it could not see: quest variables and globals every frame, reference variables, weather, owned actors' inventories
  after the AI's own item use, the host's container sweep, the menu-less container scan. ADR-065 observes the same paths at one
  point, AddChange, for everything the save records.
- nv-rs went the same way. Once fnv-coop owned the engine, the host "mirrors its changes into the store" each frame (main
  docs/COOP.md:125-129): a FormID-keyed store per shared domain, globals and script variables among them (main
  crates/world/src/coop/mod.rs:91-131), filled by a full keyed diff that runs when the frame's effects say something changed and
  at least every 20 frames as a backstop "for writers that emit nothing"; a store write with no matching effect is counted as
  "uncovered", "a CI signal" (main crates/world/src/coop/bridge.rs:32-91). Default values are left out: "a missing key and a
  tombstone mean the same thing" (main crates/world/src/coop/export.rs:4-5). The guest applies the store at the start of its
  frame, before it simulates (bridge.rs:1-5, :94-120). That is ADR-065 decisions 2 to 4 written by a team that could change the
  engine: the marks as the trigger, the record as the truth, the record applied before the frame.
- Confirms m3-promote-record (DECISIONS.md:4057-4065): the new owner applies the last state before its AI runs
  (ownership.h:11-14).
- Confirms thuum's choice to leave SetRestrained and SetDontMove alone, since they "fight death for the field"
  (docs/verbs/npc-puppet.md:172-174); fnv-coop paid for the same trap in New Vegas.
- Contradicts the scope of ADR-065 decision 5 (DECISIONS.md:4236): variables that another seat's conditions read are needed on
  that seat all the time, not only at a hand-off (item 2).
- The GuestLocalRun allow-list and the generated table of object scripts' inline writes are what ADR-063 decision 5 calls the
  warning sign (DECISIONS.md:4031). Papyrus gives thuum a better gate (SendEvent, ADR-065 decision 5), and the per-frame poll
  catches the writes a gate misses.

## 4. VaultMP, OblivionOnline and the Fallout 4 projects

Read by a second reader the same night from clones of each repository (OblivionOnline from its SourceForge SVN), and spot-checked
here at the lines cited; a citation marked "(reader)" is the second reader's and was not re-read. Fallout 4 is outside the brief's
list. It is here because its engine is Skyrim's nearest relative, and two of its projects, F4Multiplayer on CommonLibF4 and
FO4_Wrld, meet ADR-065's mechanisms head on.

| Project | Read | License | State |
|---|---|---|---|
| VaultMP (Fallout 3 and New Vegas), https://github.com/foxtacles/vaultmp | 341d6220, 2021-06-16 | MIT "to all files in this repository, except for" eleven third-party paths (LICENSE:1-12) | "This project is no longer being maintained" (README.md:1) |
| OblivionOnline, https://sourceforge.net/p/oo-open/code/ | r474, 2008-09-01 | client GPL-3.0-or-later with an OBSE exception (file headers); server AGPL-3.0-or-later (OblivionOnlineServer/ReadMe.txt); the project page says GPLv2 (reader) | dormant |
| F4MP, https://github.com/cokwa/F4MP-Archive | 67fd2900, 2020-07-17 | GPL-3.0 | dead: "a lack of volunteers with the right skillset" (F4MP/F4MP README, reader) |
| F4Multiplayer, https://github.com/Jolley71717/F4Multiplayer (CommonLibF4) | 744382ad, 2026-11-03 | GPL-3.0-or-later with exceptions (LICENSE) | very active; built with AI agents (AGENTS.md) |
| FO4_Wrld, https://github.com/ThePie88/FO4_Wrld | c0f8abac, 2026-10-20 | AGPL-3.0 (LICENSE) | active, one developer |

Checked, with nothing usable: OB:MP for Oblivion Remastered publishes no source or design (ready.mp/blog/oblivionmp, 2026-08-05);
schme16/Oblivion-Remastered-Coop is a README; no "FOMP" was found (reader).

### VaultMP
- Capture: polling plus a few detours. vaultmp.exe drives the game over named pipes into an injected DLL, which calls a script
  command's handler by its opcode, optionally on the game thread (source/vaultmpdll/vaultmp.cpp:200-208, :791-915, reader). The
  client polls only its own player, GetPosAngle, GetActorState and GetParentCell on a priority schedule (Interface.cpp:124-169;
  Game.cpp:356-365, reader); detours catch activation and weapon fire (vaultmp.cpp:273-337, reader). Synced: the player, cells,
  server-held items, door and terminal locks, owners, time and weather (vaultserver/Server.cpp:41-98, reader). No quests, script
  variables or physics.
- Change records were treated as contamination: "Need savegames with no (minimal) change records as possible; need to define
  'default' states, which are reflected in the blank savegame" (issue #57, 2012-06-21,
  https://github.com/foxtacles/vaultmp/issues/57).
- Authority: the server, for everything, with Pawn or C++ scripts deciding; an activation goes to the server, which echoes it back
  for persistent doors (Server.cpp:310-328, reader). No host client and no hand-off.
- Late join: the client centres on the cell or world, then applies globals, weather and deleted statics and creates every object;
  an object outside the 3x3 cell context waits until its cell enters it (Game.cpp:404-426, verified; :457-490, :576-624, reader).
  So state lands after the cell loads, through script commands.
- Scripts: removed. The reader's parse of source/deps/vaultmp.esp finds it deletes every quest, script, dialogue info and package
  record and every placed NPC and creature (192 QUST, 1,257 SCPT, 22,327 INFO, 3,266 PACK, 2,154 ACHR, 3,349 ACRE). The one global
  with a precedent is the clock: the server pushes GameYear, GameMonth, GameDay and GameHour (vaultserver/Script.cpp:449-495), and
  the client sets TimeScale to 0 and turns autosaves and quickload off (source/Game.cpp:338-346).
- NPCs: spawned by script, SetRestrained on every client, killed at creation when dead (Game.cpp:862-896, reader).
- Containers: on the server; the menu is replaced by a server-built interface (vaultscript/default/cview.cpp:101-117, reader).
- Hard: "Current code is a PITA" on container sync (#99) and environment items and NPCs open since 2012 (#25, #26) (reader).

### OblivionOnline
- Capture: polling. An OBSE command run every frame from a book's GameMode script diffs the player's position, health, magicka and
  fatigue, and on the master client every actor in a player-occupied cell (OblivionOnline/SendActorCommands.cpp:44-280; the script
  1OOBookScript in OblivionOnline.esp; reader).
- Authority: one "master client" runs every NPC: the first player to join (OblivionOnlineServer/NetworkSystem.cpp:184-190),
  replaced by a remaining player when it disconnects (:238-259). The server relays (EntityUpdateManager.cpp:118-152, reader).
- Late join, scripts and containers: none. Each player plays their own save and is told "Please do not save!" (1OOTravellerScript,
  reader). Receivers move NPCs by SetPos and PositionCell from a queue, with no AI disable found (reader).

### F4MP
- Capture: polls the player's cell's objects each tick, and props within 500 units send their position (f4mp/f4mp.cpp:1080-1142,
  reader); Papyrus TopicInfo.OnBegin relays dialogue (scripts/F4MPQuest.psc:85-89, reader).
- Authority: the first client to report an NPC controls it (f4mp_server/Server.h:161-190); a prop update is taken only from the
  nearest client, the newest timestamp winning (:192-226); hits go to the hittee's controller (:145-151, reader). Mirrors are
  moved by SetPosition with their AI left on (f4mp.cpp:590-606, reader). Each player plays their own save; "in no way playable"
  (README, reader).

### F4Multiplayer (Fallout 4, CommonLibF4)
- Capture: engine events (TESDeathEvent, TESContainerChangedEvent, TESActivateEvent) and polls: every quest's done stages twice a
  second, doors every 500 ms (docs/DESIGN.md:1169-1175); the hour, the days passed and the weather every 5 s, of which the server
  passes on only the host's (:1991-1997).
- The receiver marks what it applies: a lock is `SetLocked` then `AddLockChange` (src/game/WorldSync.cpp:1691-1693); a destruction
  sets the form flag, then `AddChange(CHANGE_FORM_FLAGS)` and `AddChange(CHANGE_GAME_ONLY_EXTRA)`
  (src/game/Destructibles.cpp:349-352).
- The changes list at a cell's unload (Fallout 4 1.11.240, src/game/SaveGuard.cpp:30-43): `RemoveChanges(TESForm*)` "leaves a
  record alone once the form's cell has unloaded and the record was written out to a buffer (UnloadForm), so a stand-in whose cell
  had unloaded was saved all the same", while `ClearChanges` "takes the record out whether buffered or not"; "A buffered reference
  also stays listed under its cell (+E0) until that cell loads"; and "A load frees what has a record and nothing else", so a
  created form whose record was dropped outlived a load and crashed the next one. All puppets are deleted before every save and
  load (docs/DESIGN.md:186-188), and mirrored NPCs get their own AI back before a save (:309).
- Authority: one owner per NPC, granted by the server. A hit takes an NPC over, at most once every 5 s (:300-303); "When the owner
  unloads the NPC (or leaves), it is released and the next player who has it loaded claims it. One that dies is kept until its
  death is reported (up to 15 s)" (:307-309); a game stopped by a menu for 5 s hands its NPCs over (:299, :383). "The server is a
  relay with budgets; it has no copy of the world to check against" (:2445).
- NPCs on non-owners: a hook on Actor::Update calls UpdateNoAI, forces position and heading, sets kMovementBlocked every frame and
  re-applies the do-nothing package every 2 s (:189-193); "NPC AI fights forced positions. You need the Update hook,
  `kMovementBlocked` and `InitiateDoNothingPackage` together for an actor to stand still" (:201-202). Receivers apply a death by a
  kill when the reference loads (:1169).
- Late join and materialization: each player keeps their own save. Container changes are numbered per session, and each player
  stores which numbers its world contains in its F4SE co-save (:1434-1446); a reload dupe remains, "a friend takes it, reload: the
  reloaded game still carries it and the friend has it" (:1459-1461). "Remote changes are applied only while the player is in the
  world ... and to loaded references; everything else waits and is retried" (:1164-1165). A leveled NPC's roll written onto a
  built copy took effect only at that copy's next load, since "CopyFromTemplateForms, a disable and enable and `Reset3D` left the
  NPC already made as it was"; a hook in the engine's leveled-actor resolver now builds every copy as the session's roll the first
  time (:320-343).
- Scripts: every game runs its own, and quest stages travel by a poll of the done bits (:1174); no script variables are synced
  (reader).
- Props: one mover at a time, "the first grab wins", and the claim "is held until it rests" (:1584, :1601).

### FO4_Wrld (Fallout 4)
- Capture: the DLL "taps the two engine functions every inventory change goes through"; "Every save the engine attempts without
  the server's command is refused by one lifecycle module in the DLL, the quicksave and quickload keys are dropped, an uncommanded
  load is refused" (README.md:230-247).
- The engine's own save as the vehicle: to move a player, "the server rewrites a `.fos` that the engine then loads as its own"
  (README.md:152-154).
- Authority: the server elects each NPC's owner by threat with hysteresis, MIN_HOLD 2000 ms and FLIP_MARGIN 1.3; the non-owner's
  copy has its AI suppressed, its position pinned and its Havok body keyframed (CHANGELOG.md:2441-2472, reader).
- Hard (CHANGELOG.md:1966-1995): mirrors pinned through SetPosition at about 30 Hz never re-filed their cell; "The suppression
  hooks ate the engine's own repair writes": four non-owner bail detours swallowed 650+ engine writes in one window, one from
  inside the engine's MoveTo worker, "a MoveTo whose bookkeeping ran while its position write was swallowed", and the load then
  crashed; the owner election "kept churning a dead client", 7 hand-offs delivered to a loading client 155 ms before its fault. A
  death-time sweep that called MoveTo on every actor made it worse, because a MoveTo with no cell "queues a `moved` changeform and
  plants an `ExtraBadPosition` extra on every swept actor".

### Against thuum
- None of these projects sends change records between running games. FO4_Wrld comes closest, rewriting a save the engine then
  loads as its own (README.md:152-154); VaultMP fought the records (#57) and deleted the world's scripts and NPCs instead;
  F4Multiplayer and FO4_Wrld otherwise meet them as a hazard. ADR-065 decision 3 (DECISIONS.md:4225-4228) is new ground, but the
  mechanism reads the same on Fallout 4 as change-forms.md D1 and D3 have it for Skyrim (docs/engine/change-forms.md:71-73): a
  record buffered at the unload, the reference listed under its cell until the cell loads.
- F4Multiplayer's receiver marks what it applies. In Skyrim the record stored at a cell's unload is {flags, record} (D1), and
  SaveGame writes only the sections the set flags name (ADR-065 decision 3, DECISIONS.md:4225-4228); so a change applied without
  its mark would be missing from that record and lost at the next unload and reload (D1 and D2 are HYPOTHESIS rows). The observer
  drops the echo; the applier never skips the mark (item 5).
- F4Multiplayer's leveled roll confirms ADR-065 decision 4 (DECISIONS.md:4229-4235) and sharpens its risk 1 (:4270-4273): a write
  onto a built copy took only at the next load. The mid-game LoadGame read (change-forms.md C4) should expect the same.
- FO4_Wrld's crash is the warning for ADR-063 decision 3 (DECISIONS.md:4014) on a non-owner: suppress the decision (the AI, the
  script's event), never the engine's own writes. ADR-065 decision 2 already counts a non-owner's marks rather than blocking them
  (item 6).
- Hand-off triggers with hysteresis and a pause rule (F4Multiplayer's 5 s menu release, FO4_Wrld's MIN_HOLD and FLIP_MARGIN,
  OblivionOnline's re-election) confirm ADR-063 and add the paused owner, which a Skyrim seat can be (item 4).
- VaultMP's clock is the only precedent for globals outside fnv-coop. No Fallout 4 project hooks a global write either.

## 5. What thuum should take

Eight items, each with its sources, whether it confirms, contradicts or improves ADR-063 or ADR-065, and the technique.

1. **Globals: diff the table on its owner every frame.** fnv-coop found nothing to hook ("`set X to y` is executed inline by the
   script interpreter", fnv-coop docs/engine-addresses.md:121), tried a diff around each script scope
   (plugin/hooks/engine_hooks.cpp:131-192), and settled on a per-frame host poll that reports a global only when it differs from
   the last value reported, with a silent first pass (engine_hooks.cpp:1413-1438; change_tracker.h:9-29; coop_module.cpp:326-336).
   nv-rs keeps globals as one domain of the same diffed store (main crates/world/src/coop/mod.rs:100-101). Skyrim has the same
   gap: GlobalVariable.SetValue marks nothing (docs/engine/change-forms.md:53; DECISIONS.md:4206-4207). Improves ADR-065, closing
   its risk 3 (DECISIONS.md:4277-4278). Technique: at the frame's end, the owner of the world globals walks
   `TESDataHandler::GetFormArray<TESGlobal>()` (CommonLibSSE-NG include/RE/T/TESDataHandler.h:68-70, :222-224), compares each
   `TESGlobal::value` (include/RE/T/TESGlobal.h:45) with the last value the server acknowledged, and reports the changed ones; the
   first pass of a session primes from the server's record. One float compare per global per frame catches a Papyrus SetValue, a
   quest fragment, the engine's own writes and a mod DLL's alike. ADR-029's per-player globals use the same diff on each player's
   own game. The clock globals stay with ADR-021's clock, as fnv-coop leaves them out by name (fnv-coop
   docs/snapshot-schema.md:57). The only other precedent is VaultMP's server pushing the date globals
   (vaultserver/Script.cpp:449-495); no Fallout 4 project read hooks a global write (section 4).

2. **Quests need an owner, and the variables other seats read need a stream.** NVCoop runs "Quest scripts ... on the peer
   responsible for that quest", from "a quest-authority table that changes as players start interactions" (README.md:56, :66);
   fnv-coop gives the story to "the host, always" (docs/FULL-SYNC-PLAN.md:20-22) and polls every quest variable each frame
   (plugin/coop/coop_runtime.h:179-184); its guests need them current because their dialogue conditions read them:
   GetQuestVariable is in 9,276 of New Vegas's 69,332 dialogue condition entries (docs/dialogue-design.md:39-40, :84-88). Skyrim's
   conditions read the VM the same way, through kGetVMQuestVariable 629 and kGetVMScriptVariable 630 (CommonLibSSE-NG
   include/RE/T/TESCondition.h:762-763), and thuum already found one deciding an AI package on the simulating seat: Hod's sawmill
   packages test 0x71dfc's "::ResourceState_var" (docs/engine/non-owning-seat.md:37, P7). Contradicts the scope of ADR-065
   decision 5 (DECISIONS.md:4236), which moves Papyrus variables only at a hand-off, and fills a gap in ADR-063 decision 1
   (DECISIONS.md:4002-4008), which has no owner rule for a quest while Quest.Start, Quest.Stop and GlobalVariable.SetValue ran
   live on a guest (DECISIONS.md:4021-4025). Technique: (a) give quests an owner in ADR-063's list, either one story owner
   (fnv-coop's, simplest) or NVCoop's table, where a quest's owner follows the seat whose player starts the interaction that
   drives it; the live Quest.Start and Stop on a guest are what that rule gates. (b) The quest's owner streams the variables other
   seats read: the set comes from the load order's own condition records (functions 629 and 630 with their quest or reference and
   variable name; lab/esm.py reads CTDA already), so it is derived from the game data, not a list of names. Poll those on the
   owner each frame with item 1's last-reported comparison; the rest of a script object still moves at the hand-off. How a seat
   reads a VM object's variable safely from outside the VM's threads (BSScript::Object's variables, Object.h:49, under which lock)
   is a re-analyst read before any code (rule 1).

3. **A mark is a candidate: compare before sending, and never let ownership mark state.** NV:MP's 5.55 entry, "the game server
   would dirty and update every synced reference due to ownership tracking code falsely dispatching ownership updates", and its
   5.57 pair, booleans always "set" and variable groups always "active", are one failure: a mark set on write, not on change,
   decays into a full resend (section 1). The x-native snapshot writes the owner into every object sync (networkobject.cpp:75-76),
   which is how an ownership dispatch could dirty a reference. fnv-coop's answer is to report a value only when it differs from
   the last one reported (change_tracker.h:9-24) and to make owner evaluation idempotent, "no change -> nothing appended"
   (ownership.h:104-105); nv-rs runs its full diff only when the frame's effects say something changed, plus a backstop every 20
   frames, and counts "uncovered" changes that came with no effect (main crates/world/src/coop/bridge.rs:32-91). Skyrim's
   AddChange behaves like NV:MP's flags: the flags coalesce, its return means "passed the gates", not "new bits"
   (docs/engine/change-forms.md:40, A2), and kMoved came 16,433 times in 170 s, every one answered true (:55, B6). Improves
   ADR-065 decisions 2 and 3 (DECISIONS.md:4220-4228). Technique: at the frame's end the owner serialises each marked form
   (decision 3's SaveGame) and compares the bytes, or their hash, with the record the server last acknowledged for that form;
   equal bytes send nothing. The owner word and its epoch travel in their own message and never mark a form or resend its record.
   A periodic full pass over the owner's loaded forms (nv-rs's backstop) is the cross-check: a changed record with no AddChange
   that frame is counted per form type, which measures the observe point's gaps the way ADR-065 wants a non-owner's marks counted.

4. **The hand-off is a two-phase handshake, and every report is stamped with the owner's epoch.** fnv-coop's service: Transfer at
   e+1, the old owner keeps publishing at e, the new owner applies the last state and acks, the host commits e+1, and only then
   does the new owner's AI run; an update is judged NotOwner, StaleEpoch, FutureEpoch, NotYetActive or EchoOfSelf
   (ownership.h:11-14, :153-162), with 1.5 s of hysteresis and a 25 % margin (:59-63). Its source is Skyrim Together's PR #906,
   NPCs duplicated by "owners applying stale assignment state" (https://github.com/tiltedphoques/TiltedEvolution/pull/906), and
   its fuzzer's "stale position after a host load" (docs/FULL-SYNC-PLAN.md:242). NV:MP hit the order from the other side: it
   "would not wait for new owner's of references to sync in the data needed to clone to other players correctly" (5.57). Confirms
   m3-promote-record, "the server's record ahead of the ownership word and that actor's reports held until the placement is
   applied" (DECISIONS.md:4057-4065), and improves it by making "held" a named state. The release triggers in the Fallout 4
   projects add the case a Skyrim seat has: an owner whose game stops. F4Multiplayer hands a game's NPCs over after 5 s in a
   pausing menu and keeps a dying NPC up to 15 s for its death report (F4Multiplayer docs/DESIGN.md:299, :307-309, :383); NV:MP
   marks an object idle when its owner "entered a game menu that freezes the game" (INetReference.cs:322-326); FO4_Wrld's election
   "kept churning a dead client" with 7 hand-offs to a seat that was loading (FO4_Wrld CHANGELOG.md:1987-1991). A thuum seat can
   be paused by a menu (E_RUN_PAUSED, docs/LAB.md:764-767). Technique: the server stamps an owner epoch on every grant (cell, D9
   pass, prop claim, container open); every R2 report states the epoch it was made under, and the server drops and counts a report
   from a past epoch instead of judging its position; the new owner keeps the object passive until it has applied the record and
   acked, and the commit is what admits its reports. That replaces a settle timer with a state the server can read. A seat that is
   paused, loading or silent for a few seconds is not eligible for a grant and has its moving objects handed on, while a dying
   actor stays with its owner until the death is reported. fnv-coop's two-copy scenarios/ownership_handoff.json ("host walks away
   mid-fight", docs/FULL-SYNC-PLAN.md:195) is a premise worth a thuum scenario of its own, written fresh (rule 7).

5. **Apply at construction; mark what you apply; report before you apply.** F4Multiplayer wrote an NPC's leveled roll onto a built
   copy and saw it take only at the copy's next load, since Reset3D, a disable and enable and CopyFromTemplateForms "left the NPC
   already made as it was"; it moved the write into the engine's leveled-actor resolver (F4Multiplayer docs/DESIGN.md:320-343).
   Its receiver follows every direct write with the engine's own mark, `SetLocked` then `AddLockChange`
   (src/game/WorldSync.cpp:1691-1693; src/game/Destructibles.cpp:349-352). fnv-coop's fuzzer found that a correction "replaces the
   engine copy and would swallow a change nobody has looked at", so an open container is read before any host message and read
   again after a correction (fnv-coop docs/tools/loot.md:42-46); in game, a delta that landed between a local take and the scan
   hid the take, and two players kept 6 of 3 items until the scan compared against the last matched state (legacy
   docs/tools/loot.md:53-74). NV:MP's "+1" on every server inventory update (5.57) is the echo this fences; fnv-coop applies
   through the engine's own setter under an echo guard, with scripts gated (plugin/hooks/apply_remote.h:1-28). Confirms ADR-065
   decision 4 (DECISIONS.md:4229-4235) and improves its open rows on the mid-game apply and on echoes (:4270-4273, :4283).
   Technique: (a) the materialize-first route (the transplant, D3) is the primary path, and the mid-game LoadGame read (C4) is
   planned on the expectation that a built reference may keep its old state until it is rebuilt or reloaded. (b) Whatever applies
   a record leaves the engine's own mark in place (LoadGame or the engine's setter, never a bare field write), so the seat's next
   unload stores the applied state; the observer tags the marks made inside the apply scope as echoes and drops them from the
   report. (c) A seat reports its own marks for a form before it applies a remote record to that form, and after the apply
   serialises the form again as its baseline, so a partial apply shows up as a difference instead of vanishing.

6. **Keep the engine's books whole on a non-owner, and keep a seat's own saves out of the world.** FO4_Wrld's non-owner detours
   "ate the engine's own repair writes", 650+ in one window, one inside the engine's MoveTo worker, and the next load crashed; its
   repair sweep made things worse because a MoveTo with no cell "queues a `moved` changeform" (FO4_Wrld CHANGELOG.md:1966-1995).
   F4Multiplayer keeps its copies passive from one Actor::Update hook (UpdateNoAI and a do-nothing package)
   (docs/DESIGN.md:189-193, :201-202), and found that `RemoveChanges` leaves a record buffered at a cell's unload, so its
   stand-ins reached the save until it used `ClearChanges` (src/game/SaveGuard.cpp:30-43). FO4_Wrld refuses every save and load
   the server did not command (README.md:230-247); VaultMP turns autosaves and quickload off (source/Game.cpp:338-346); NV:MP's
   network state reached local saves as "save-baked missing doors" (5.57). fnv-coop ledgers every reference it restrained, cloned,
   disabled or made essential, in a file and the cosave, and undoes them at start, at each load and at a session's end (fnv-coop
   docs/tools/actor-port.md:48-53); a stale ledger id hung its host after a reload, because by then the id named another object
   (docs/WORK-QUEUE.md:61-64). Improves ADR-065, whose Open list has no row for these, and ADR-063 decision 3 (DECISIONS.md:4014).
   ADR-065 decision 4 writes records into a seat's changes map (DECISIONS.md:4229-4235), so the seat's engine will save them as
   its own. Technique: (a) a non-owner's passivity is a decision withheld (the AI's update, the script's event at SendEvent),
   never an engine write swallowed; the non-owner's marks are counted and pass through, as ADR-065 decision 2 says. (b) A seat's
   local save is never an input: the server's record wins at login and at every cell load (decision 4), and a seat's own saves are
   refused or written where nothing loads them. (c) Every engine change thuum makes for the network and not for the world (the
   hold, AI off, a parked copy, a stand-in) goes in a ledger the seat undoes before a save and after a load; the observer reads
   the same ledger, so thuum's own marks are never reported as world state, and a stand-in's record is cleared from the changes
   map (ClearChanges's Skyrim counterpart, a re-analyst read) rather than merely unmarked. (d) A record that names a created
   reference (0xFF ids) goes through the server's id map (fnv-coop docs/protocol.md:451-454; NVCoop README.md:57); ids in one
   seat's changes map mean nothing to another.

7. **Detect and heal per cell, and measure what is volatile before declaring a rung.** fnv-coop's area digest: every 2 s each
   machine sends one hash per (cell, category), the host compares, asks for the items of a mismatching group, and the authority
   heals a difference once both sides have been quiet for 1 s; a key healed twice in a minute is logged as a bug with both values
   (docs/tools/area-desync.md:14-38, guards :39-52; the story layer's 128-shard digest, docs/protocol.md:257-264); it is game-free
   only (area-desync.md:3). Its volatile probe classifies state by dumping it repeatedly with nobody acting, within a launch and
   across launches (docs/snapshot-schema.md:97-104). Its later parity checker has every machine sample what it shows around its
   own player every 2 s and the host compare the samples, "does my friend's screen show what mine shows?" (legacy
   docs/tools/parity.md:3-16; not run in a game). Improves ADR-063 risk H3, "an engine path no channel covers ... shows up as a
   desync in play" (DECISIONS.md:4049-4054), and serves ADR-064's "a gate reads the other screen". Technique: ADR-065's record
   makes the digest natural: per cell, a hash of each form's serialised record on the owner and on each non-owner, compared on the
   server every few seconds; a mismatch names the form and the changed section, which turns a missing channel into a counted lab
   signal instead of a playtest finding. Before STATE.md assigns rungs to its 80-odd flags, run census v3 on two seats from the
   same start with nobody acting: a flag or global that moves by itself on one seat (kGameOnlyExtra at about 146 a second is the
   first candidate, docs/engine/change-forms.md:55) is per-seat state, not world state.

8. **Run a guest's interaction on the host as that guest, at one choke point.** fnv-coop's intents: the guest asks, the host
   re-issues the activation inside an "acting player" scope where the script engine's resolution of the player form and the
   condition evaluator's "run on player" subject return the guest's figure (docs/protocol.md:398-433), deliberately not a global
   ThePlayer swap (plugin/hooks/suppress_policy.h:98-100). NVCoop runs "player-triggered blocks ... where the local player caused
   the event" (README.md:66). thuum has the relay half (ADR-059's RelayedActivation: the host's engine activates the reference as
   the guest's figure, DECISIONS.md:3654-3658) but meets scripts that gate on the player by name: the word walls' trigger scripts
   are admitted on every seat because "the scripts gate themselves on Game.GetPlayer(), and a host's seat ignores a figure in the
   trigger for the same reason" (DECISIONS.md:3648-3649). Improves ADR-063 decision 5 (DECISIONS.md:4031), replacing names with a
   channel. Technique: while the host's engine runs a relayed interaction for a guest's figure, the Papyrus native Game.GetPlayer
   and the condition subject's player test answer with that figure, scoped to the dispatch of that one event; everything outside
   the scope is untouched. This is an engine claim with no trace yet: it needs the re-analyst's read of Game.GetPlayer's native
   and of the condition system's player subject, and a Frida probe on a word wall, before any code (rule 8, ADR-064).
