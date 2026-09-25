# PLAN: SkyMP to TES3MP parity

## What this document is

This is the plan for building the lab and the automation that let us finish
SkyMP: take its server-authoritative platform, replace its network edge with
the Rust wire (docs/WIRE.md), and add the game half until it mirrors what
TES3MP does for Morrowind. The lab (docs/LAB.md) is the oracle; the agent
loop (CLAUDE.md, docs/VERB.md) is the labor; the wire is the part that has
to be right before anyone else connects. This file says what gets built, in
what order, and what "done" means. It does not repeat how; the other three
documents own that.

## Intent

TES3MP gives Morrowind a persistent server-owned world in which the actual
game is playable cooperatively: NPCs run their AI under a per-cell authority
client, the server records and relays, world objects and journal state
persist, and server-side scripts set the rules. SkyMP has the server half of
that (authoritative state, persistence, server-side Papyrus, TypeScript
gamemode) and almost none of the game half. This plan closes the game half.

The move that makes it tractable is TES3MP's own: we do not simulate NPCs,
physics, scenes, or dialogue on the server. A host client runs the engine for
its cell; the server records the results (R2), validates what it can (R1), and
computes what it must (R0). That turns most of SkyMP's "TODO" list from
"reimplement the engine" into "hook the engine, define the contract, persist
the result".

## Definition of done (TES3MP parity)

All of the following, verified by T3 scenarios and a restart in the middle:

1. A fresh player joins a running server and plays vanilla content
   cooperatively: quests, dialogue, dungeons with traps and puzzles, NPCs with
   AI, magic, shouts, leveling and perks.
2. NPCs behave under their packages while any player hosts their cell, and
   their positions, inventories, and deaths persist while nobody does.
3. World objects persist: doors, locks, containers, movables, dropped items.
4. Quest and journal state is server-owned, with a per-quest policy
   (per-player or world-shared), and survives restarts.
5. Server-side scripts (Papyrus on the VM, TypeScript gamemode) can gate,
   validate, and modify all of the above.
6. Record-only mods work through the server's load order; script mods work to
   the extent docs/NATIVES.md says they do, and the ledger is honest.
7. Nothing on rungs R0/R1 can be forged from a client.
8. Every network byte on both ends is recognized by the Rust wire before
   anything else sees it; RakNet is gone from the server and the client, and
   the three fuzz targets in docs/WIRE.md run in CI.

Non-goals: matching STR's mod compatibility; running the Helgen intro
(ADR-007); dragons before M7; VR; Skyrim LE; any runtime other than SE 1.6.1170.

## Work classes

The class of an item is set by where its spec lives and what its oracle is,
not by how much code it needs.

- Class A: spec is public (Creation Kit wiki, UESP), oracle is a server test,
  no client change. Agent grinds; human reviews rung decisions.
- Class B: spec is public, oracle is visual. Server side writes itself; the
  client half (render the server's decision, suppress the engine's own) needs
  lab runs. Agent writes, human tests.
- Class C: spec is inside the binary, oracle is "feels like Skyrim". RE
  projects. Agent assists static analysis and writes Frida traces; human owns
  the loop.

Hosting (M3) is what moves NPC AI, physics, and scenes from C to B: the
engine does the simulating, we only observe, record, and hand off.

## Milestones

Calendar ranges assume one human in the loop and a working lab; they are for
ordering, not commitment. Each milestone has a scenario set under
lab/scenarios/<prefix>-*.yaml and is done when the set is green and no verb in
it carries a HYPOTHESIS tag.

### M0: Lab and baseline (2 to 4 weeks, mostly infra)

- Fork upstream skyrim-multiplayer/skymp (ADR-013 settled the base; there is
  no fork worth diffing). Public repo from the first commit (ADR-014), through
  the GitLab-to-GitHub mirror (ADR-016).
- Proxmox lab per docs/LAB.md: the sky-srv VM and the sky-ci runner, one
  client VM once its GPU arrives plus fenestrate (Eli's desktop VM) as client
  two, Ghidra served by pyghidra-mcp on sky-re. The agent runs on Eli's Mac
  in M0 (ADR-016).
- `just lab run smoke-two-players` green: connect, see each other, walk,
  restart server, positions and inventories survive.
- Ghidra project for SkyrimSE.exe 1.6.1170 analyzed, CommonLib types
  imported, reachable from the agent through pyghidra-mcp.
- `just addr <id>` resolves against addrlib/.
- docs/NATIVES.md generated from papyrus-vm: every native as implemented,
  delegated (SpSnippet), or stub.
- Re-verify SkyMP's "done" column (appearance, attributes, death, inventory,
  forge) as scenarios `m0-*`. They are the regression floor.
- CLAUDE.md layout and commands pinned to reality.
- skymp-wire (docs/WIRE.md, ADR-010 to ADR-012, ADR-015; lives in the fork):
  schema, codec, validate, transport, difftest, and all three fuzz targets
  green on T2. `just wire-test` in GitLab CI on sky-ci (ADR-016). renet's
  packet ingestion and fragment reassembly fuzzed for the M0 gate in ADR-011.
  The M0 difftest wire driver runs against an in-process Rust edge recorder;
  the bridged server it fronts lands in M1. No lab time required for any of
  this; it runs beside the lab build-out.

### M1: Close Class A (4 to 8 weeks, agent-heavy)

- The bridge lands: `Networking.cpp`, `PacketParser`, and the server's
  RakNet dependency deleted in the same PR; the client cdylib lands and the
  client's RakNet goes with it. `smoke-two-players` green on the new wire.
  From here every new handler is Rust behind the bridge.

- Natives ledger: every stub becomes implemented (R0), delegated (R2 with a
  reason), or "never" with a reason. No silent stubs.
- Persistence gaps from the roadmap: equipment in hands across restart,
  favorites, map markers, learned effects, script variables.
- Validation: character creation, damage range and angle, movement speed
  bounds, activation distance.
- Console commands, full ActorValue set, game time and globals, wait and
  sleep as server-owned time.
- Exit: scenarios `a-*` green including `a-restart-persistence`.

### M2: Combat and magic authority (8 to 12 weeks, Class B)

- Magic effect system on the server: apply and remove effects with magnitude
  and duration read from ESM records; potions and poisons become effects
  rather than direct attribute writes. Client renders shaders and sounds and
  suppresses the engine's own application. Rung: R0.
- Spells: cast intent from the caster (observe), server resolves, broadcast
  to renderers (impose), suppress local resolution. Shouts with words known
  as server state. Rung: R1 intent, R0 resolution.
- Hit registration with lag compensation (rewind by client latency, Bernier
  2001), blocking, marksman aim pitch on the wire, projectile ownership.
- Corpse loot, container open animation for observers, container contents
  reconciled on open.
- Exit: `b-duel` (server-authoritative damage between two players, effects
  visible to an observer), `b-magic-restart` (active effects survive a
  restart with remaining duration).

### M3: Hosting (8 to 16 weeks, the TES3MP move)

- Cell host election: first player to load a cell hosts it; server reassigns
  on leave with a grace window; a host handoff transfers NPC state without a
  visible teleport.
- On the host: engine AI runs under packages; NPC position, animation,
  combat targets, and inventory changes stream to the server (R2) with bounds
  checks where cheap (R1).
- Off the host: engine AI suppressed for that cell's NPCs; observers render
  what the server relays.
- Unhosted cells freeze at last recorded state; on the next host the server
  replays state into the engine before releasing suppression.
- Spawning and respawn rules server-side; deaths persist; physics host
  switching for movables; horses (host follows rider).
- Exit: `c-riverwood` (two players, NPC schedules run under host one; host
  one leaves; host two takes over; NPCs continue; restart restores) and
  `c-dungeon-enemies` (bandits fight both players under one host).

### M4: World and dungeons (6 to 10 weeks, Class B)

- Doors and locks, lockpicking, traps, pressure plates, puzzle pillars,
  linked refs (the lever that opens the door), statics.
- Weather and time as server globals; both rendered, neither rolled locally.
- Dropped items and kicked objects under the physics host.
- Exit: `d-bleak-falls` (both players through the puzzle door and the traps,
  with a restart mid-dungeon).

### M5: Progression (4 to 8 weeks, Class A/B)

- Skills, experience, and leveling from the documented formulas, computed
  R0; the client's own leveling disabled.
- Perks, enchanting, alchemy, pickpocketing as server transactions.
- Exit: `p-level-up` and `p-craft-restart`.

### M6: Quests and dialogue (open-ended; partial by design)

- Quest state serialized from the live engine through the CommonLib quest
  layout, mirroring the documented QUST change form (stages, objectives,
  script state, instances, run data). Server owns it per policy: per-player by
  default, world-shared by allowlist (TES3MP shared-journal semantics).
- Stage transitions arrive as validated events: script-driven ones resolve on
  the server's VM; scene- and dialogue-driven ones arrive from the host with
  the scene as evidence.
- Dialogue runs on the host client for the speaking player; observers see the
  animation, not the menu. One scene runner per scene; other players are
  spectators (STR's experience with NPC attention shifting is the warning).
- Exit: `q-golden-claw` (two players complete Bleak Falls Barrow and The
  Golden Claw with shared world progression and a restart), then `q-main`
  from a post-Helgen start.

### M7: The long tail

Dragons, lycanthropy, vampirism, mounted combat, custom record push to
clients (TES3MP 0.8 parity), a mod compatibility matrix generated from the
natives ledger.

## Cross-cutting tracks

- Natives ledger (docs/NATIVES.md): the honest list of what server Papyrus
  can do. Regenerated by `just ledger`; hand-annotated rungs.
- Persistence: every rung R0 to R2 field lands in the DB; `*-restart`
  scenarios exist for every milestone.
- Validation: every R1 verb has a bounds check and a rate limit in the
  validator; fuzz the message contract at T2.
- Wire contract: wire-schema is the contract; ids append-only; every message
  has a structural validator, a rejection test, and a fuzz corpus entry.
- Strangling (ADR-010): each milestone reports how much of the C++ edge and
  handler code remains; the number goes down or the milestone explains why.
- Distribution (from M2, when anyone outside the lab connects): two channels,
  Keizaal-style. Our own stack (SP, client cdylib, gamemode client scripts,
  server config, version check against the exe) ships through a launcher we
  control; third-party mods ship as a Nexus collection installed by Vortex,
  because Nexus terms do not allow redistributing other authors' mods and
  collections are the sanctioned form. The `Hello` load-order hash is the
  server-side half of the same idea. Candidates to reuse rather than write:
  the AGPL skymp-heavy-rp base's Electron launcher and modpack parity check.
  The lab template itself does not use Vortex; it uses a pinned, scripted
  load order.
- Suppression registry: every engine behavior we suppress is listed with the
  hook that does it and the condition that releases it.

## Risks

- Lab throughput. A T3 run is minutes; a human dynamic session is an hour.
  Verbs must be sized so one lab run answers one question.
- Version drift. Steam updates break SP, SKSE, and the address database at
  once; the pinned exe backup and offline mode are load-bearing.
- Engine coupling. Some visuals cannot be separated from their simulation
  through any known surface. Those verbs become R2 with the host rendering
  for everyone, and the ledger says so.
- Scenes. The single-runner rule will not cover every scripted scene; expect
  a curated list of scenes that need per-scene handling.
- Upstream. SkyMP is alive and moving; rebase weekly, upstream Class A work
  early so the fork stays small. The wire replacement is the one change
  upstream may not take; plan for it to live in the fork.
- Scale evidence is for the wrong profile. Keizaal proves SkyMP at hundreds
  of players with zero NPC simulation; our target is a handful of players
  with every Class C system on. Load numbers from there do not transfer to
  M3 onward.
- Memory safety is not the only bug class. Panics are denial of service,
  authority bugs are lies the validator accepts, and `unsafe` in the two FFI
  crates is still C-shaped code. The rules and fuzzers cover what Rust does
  not.

## References

- SkyMP roadmap: https://github.com/skyrim-multiplayer/skymp/blob/main/ROADMAP.md
- Skyrim Platform docs: https://github.com/skyrim-multiplayer/skymp/blob/main/docs/docs_skyrim_platform.md
- SP hooks: https://github.com/skyrim-multiplayer/skymp/blob/main/docs/skyrim_platform/events.md
- CommonLibSSE-NG (skyrim-multiplayer fork): https://github.com/skyrim-multiplayer/CommonLibSSE-NG
- CommonLibSSE-NG docs: https://ng.commonlib.dev/
- Address Library for SKSE Plugins: https://www.nexusmods.com/skyrimspecialedition/mods/32444
- UESP save format (change forms): https://en.uesp.net/wiki/Skyrim_Mod:Save_File_Format
- UESP QUST change form: https://en.uesp.net/wiki/Skyrim_Mod:Save_File_Format/QUST_Changeform
- UESP change flags: https://en.uesp.net/wiki/Skyrim_Mod:ChangeFlags
- Tilted Online technical overview (STR authority model): https://wiki.tiltedphoques.com/tilted-online/technical-documentation/overview
- TES3MP: https://github.com/TES3MP/TES3MP
- Bernier 2001, latency compensation: https://developer.valvesoftware.com/wiki/Latency_Compensating_Methods_in_Client/Server_In-game_Protocol_Design_and_Optimization
- Knutsson et al. 2004, "Peer-to-Peer Support for Massively Multiplayer Games" (coordinator per region), IEEE INFOCOM
- METR on AI-assisted development, late-2025 update: https://metr.org/blog/2026-02-24-uplift-update/
- Wire layer design and its references: docs/WIRE.md
- SkyMP TERMS.md (licensing): https://github.com/skyrim-multiplayer/skymp/blob/main/TERMS.md
- Keizaal Online (SkyMP at scale, player-only profile): https://keizaal.com
- skymp-heavy-rp (AGPL launcher and parity check candidates): https://github.com/vinicius3232/skymp-heavy-rp
