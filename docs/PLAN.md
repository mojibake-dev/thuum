# PLAN: SkyMP to TES3MP parity

## What this document is

This is the plan for building the lab and the automation that let us finish
SkyMP: take its server-authoritative platform, replace its network edge with
the Rust wire (docs/WIRE.md), and add the game half until it mirrors what
TES3MP does for Morrowind. The lab (docs/LAB.md) is the oracle; the agent
loop (CLAUDE.md, docs/VERB.md) is the labor; the wire is the part that has
to be right before anyone else connects. This file says what gets built, in
what order, and what "done" means. It does not repeat how; the other three
documents own that. Since 2026-10-13 this file is the chart alone: one line of
state per item; the dated account of how each got there is docs/LOG.md, appended
by date, and `just status` prints every verb's live state from its own doc.

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
(ADR-007); dragons before M7; VR; Skyrim LE; any runtime other than SE
1.7.104 and 1.6.1170 (ADR-022).

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
it carries a HYPOTHESIS tag. This section keeps one line of state per item and
the order; the dated account of how each item got there, the playtests'
findings and the lab's evidence live in docs/LOG.md (appended by date), and
`just status` prints every verb's live state from its doc's Status boxes.

State words: DONE (date, fork parity commit), BUILDING (the fork branch),
NEXT (planned, no code on a branch yet), LATER (another milestone's).

### M0: Lab and baseline (2 to 4 weeks, mostly infra). DONE 2026-10-01

- The fork of upstream skyrim-multiplayer/skymp (ADR-013), public from the
  first commit (ADR-014) through GitLab and the GitHub mirror (ADR-016). DONE.
- The lab per docs/LAB.md: sky-srv, sky-ci, sky-re with pyghidra-mcp, two
  Windows clones with their own GPUs, the agent on Eli's Mac. DONE 2026-10-01.
- `smoke-two-players` green and unattended: DONE 2026-10-01 (run
  20261001-233455, 17 of 17 steps, 3 min 10 s); `smoke-solo` is the one-client
  floor (run 20261001-201016).
- Ghidra programs for SkyrimSE 1.7.104 (2026-09-29) and 1.6.1170 (2026-10-04),
  CommonLib's names imported by `just relid`. DONE.
- `just addr` against addrlib/; docs/NATIVES.md generated from papyrus-vm. DONE.
- The m0-* regression floor: m0-appearance and m0-inventory green 2026-10-01;
  m0-attributes red by design until M1's attributes verb (every server start
  healed every actor); m0-death on the knocked-down state (Eli, option a,
  scenario c489296); m0-forge green once the lab had a forge (a6ec749,
  10edb9a). DONE.
- skymp-wire's M0 gate (docs/WIRE.md, ADR-010 to ADR-012, ADR-015): schema,
  codec, validate, transport, difftest and the three fuzz targets green on T2;
  `just wire-test` in CI on sky-ci. DONE.

### M1: Close Class A (4 to 8 weeks, agent-heavy). DONE 2026-10-09

Exit met 2026-10-09: the exit sweep on parity 89db8732 went 30 of 30 green
(runs 20261009-191424 to -203427). Every a-* scenario green, including
a-restart-persistence (position, inventory, equipment and attributes across a
restart); each later persistence verb proves its own restart in its own
scenario.

- The bridge (ADR-019): RakNet gone from both ends, the Rust edge on both,
  every new handler Rust. DONE 2026-10-02, parity 2d50bf5e (smoke-two-players
  run 20261002-220606).
- The natives ledger: the seven stubs decided by Eli 2026-10-04, five made real
  on m1-stubs (parity b183e529); SetScale and GetCurrentStageID deferred to
  verbs of their own. DONE.
- Persistence verbs: attributes DONE 2026-10-02; map-markers DONE 2026-10-06
  (add51356); learned-effects and favorites DONE 2026-10-07 (1e782672);
  light-plugins (ESL plugins on the server) DONE 2026-10-08 (26acffc4);
  actor-values, with ADR-026's derivation of the appearance from the look,
  DONE 2026-10-08 (26acffc4). script-variables left M1 (Eli, 2026-10-08) for
  the milestone where the server runs the world's own Papyrus; its design
  stays in docs/verbs/script-variables.md.
- Validation verbs (docs/verbs/validation.md surveys what the server checked
  before them): movement-relay DONE 2026-10-02; activation-reach (b095fca6),
  character-creation (c104128f), melee-reach (15eb653d), movement-speed
  (8266a21c) and damage-flags (f0045206; the five rules Rust, ADR-020) DONE
  2026-10-03; hit-cone DONE 2026-10-04 (64ba89a4). PvE and hosted-NPC reach
  and angle moved to M3 (2026-10-08).
- Time: time, the shared server clock (ADR-021), DONE 2026-10-04 (4257036e);
  rest, a player's own wait at 360 s of regeneration a rested hour (measured),
  DONE 2026-10-04 (142493d7); sleep (any bed, every time, Rested) DONE
  2026-10-05 (13b2e188). Globals beyond the clock wait for the first verb that
  needs one (Apocalypse, M2).
- Console commands, TES3MP's player numbers and COC: DONE 2026-10-08 and
  2026-10-09 (89db8732); the ranks approved by Eli.
- From the playtests (their findings and fixes are in LOG.md): sneak-damage
  DONE 2026-10-04 (bb0725ec); hostility-sync, with the fight's end (ADR-023
  and its amendment) DONE 2026-10-05; the lab games' idle quits (the WinHTTP
  leak) fixed 2026-10-05; the Moonlight sound fixed 2026-10-08.
- Eli's rotfern race and RaceMenu sync (from the stretch list): a-rotfern;
  racemenu-sync DONE 2026-10-08 (c8b26bf7), ADR-026 built with actor-values,
  the straight-Done fix passed playtest twelve. apocrypha's mesh bake runs
  outside M1.
- M1.1, TCL (Eli, 2026-10-09): DONE 2026-10-09 (90294654); a-console's TCL
  check (4382f56) awaits Eli's review. TGM and TIM went to M2.

### M2: Combat and magic authority (8 to 12 weeks, Class B). IN PROGRESS since 2026-10-09

The chart and Eli's decisions are docs/private/decisions-m2.md (this order;
ADR-027 and ADR-028 accepted; lag compensation only if a playtest shows hits
refused that should land; Apocalypse after spell-cast and magic-effects;
Headshot Kills with marksman; containers and loot to M4). The survey of the
fork at parity 89db8732 that the chart rests on is in LOG.md. Since
2026-10-13 a merge runs ADR-030's gate sweep; the full sweep runs nightly.

1. marksman: the shot relayed and launched in observers' games, each hit
   claimed against a shot at the draw's power, the arrow's damage counted.
   DONE 2026-10-10 (7be31a9d); b-marksman 773716b. Headshot Kills (CIF) rides
   it: Eli (2026-10-12) trusts the shooter's game a little, bounded;
   docs/verbs/headshot.md is NEXT after Apocalypse's first verb.
2. spell-cast: a cast's start and end as server state, a stream counted by the
   time it held its target, the observer casting the relayed spell, a spell
   hit starting a fight. DONE 2026-10-10 (45839102); b-spell 9ed66b8. The
   relay as the server resolved it: BUILDING on fork m2-relay (1aa96a8f),
   carried by m2-fifteen.
3. magic-effects: the server's effects from the records, persisted with their
   time, drinks through the rule, the engine's own application held out.
   DONE 2026-10-10 (35acc275, merged with god-mode); b-potion bc796d5 and
   the M2 exit's b-magic-restart ec9dac2.
3a. poison: a poison on the right-hand weapon is the server's to carry, run on
   the target by the next hit and spent. DONE 2026-10-13 (11c126b9); b-poison
   de09fdc.
4. god-mode: TGM and TIM as flags the server's damage and death rules read.
   DONE 2026-10-10 (35acc275); b-god 189171e.
5. blocking: whether a hit was blocked and its share by the engine's own
   formula and cone. DONE 2026-10-11 (f828279f); b-block 5eebce8.
5a. stagger: the stagger decided by the server, imposed on the victim's game
   and shown to observers. DONE 2026-10-11 (f321a52f); b-stagger 7431108.
6. shouts: shouts and words known as the server's record, a shout judged
   against the server's recovery, the breath relayed as resolved. DONE
   2026-10-11 (3f9e4bc8); b-shout db6ed77. Unrelenting Force's push through
   the server's stagger: BUILDING on m2-fifteen.
7. Lag compensation (Bernier 2001): only if a playtest shows hits refused
   inside M1's slack. LATER.
8. cast-teleport (Lost Grimoire's Teleportation, from the stretch list): one
   permitted jump at the recorded cast, the mod's marker script let through in
   the caster's game alone. DONE 2026-10-12 (ef3fb03c); b-teleport 52d6195.
9. self-cast: a Self spell's effects run on the server (Invisibility and
   Etherealize as states, no damage to an ethereal player, a rest advancing
   the effects, Oakflesh's armor in the damage). BUILDING on fork m2-fifteen
   (docs/verbs/self-cast.md; b-self-cast to write).
10. Apocalypse (ADR-029, accepted 2026-10-13): the caster's game runs its own
    spells' effect scripts; a server-run allowlist grows verb by verb. NEXT:
    Ghostwalk's filter (A1), per-player globals with the MCM settings (A2),
    then the allowlist's first entry, Nature's Balance
    (docs/apocalypse-options.md, sections 4 and 5). Scenario b-apocalypse.
- Fix trains merged on the way: m2-fixes 2026-10-12 (c918a7a1: a plugin
  spell's reach, the crouch's hands, difftest on serde-saphyr); m2-visuals
  2026-10-13 (11c126b9: the shout relay, the silent re-teach, per-hand
  streams, Self casts on figures, the player's game counting no actor damage
  under ADR-028).
- Toward playtest sixteen, BUILDING on m2-fifteen (on m2-relay): Unrelenting
  Force's report and the recovery's slack, self-cast, the relay as resolved,
  the server-side console for the lab's setup. After it: the concentration pose
  on figures, TCL's figure on observers, pushes and paralysis decided by the
  server as staggers are, the teleport's vanish and appear on observers, then
  Apocalypse and headshots. The poisoned sword's look (playtest fifteen) did
  not reproduce in the lab; sixteen watches for it.
- Carried from M1 into this milestone's lab runs: melee reach's unmeasured
  cases (the bash, bare hands, the scale across races) and whether a power
  attack reaches by the pick alone (docs/verbs/melee-reach.md,
  damage-flags.md); Whirlwind Sprint's dash fits the burst (measured
  2026-10-12); Unrelenting Force's knockback is a later slice of shouts.
- Exit: `b-duel` (server-authoritative damage between two players, effects
  visible to an observer) and `b-magic-restart` (green; its playtest check was
  inconclusive in fifteen and runs again in sixteen).

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
- From M1's validation (2026-10-08): melee reach and the hit cone for a
  player hitting an NPC and for a hosted NPC hitting anyone, on the rules
  M1 built for players (docs/verbs/melee-reach.md, docs/verbs/hit-cone.md).
- Exit: `c-riverwood` (two players, NPC schedules run under host one; host
  one leaves; host two takes over; NPCs continue; restart restores) and
  `c-dungeon-enemies` (bandits fight both players under one host).

### M4: World and dungeons (6 to 10 weeks, Class B)

- Doors and locks, lockpicking, traps, pressure plates, puzzle pillars,
  linked refs (the lever that opens the door), statics.
- Weather and time as server globals; both rendered, neither rolled locally.
- Dropped items and kicked objects under the physics host.
- Containers and loot (from M2, Eli 2026-10-09: "looting and containers is
  way more a dungeon thing than a combat thing"): several players in one
  container, its changes sent to every viewer (the server keeps one
  occupant and sends a container's changes to nobody else today), corpse
  loot (no path exists), the open animation and sound for observers, a
  distance check on PutItem and TakeItem, the reloot timer that each
  restart pushes later, a container saved open coming back open with
  nobody in it (survey notes in M2's chart).
- Word walls teach through the server's shout record (Eli, 2026-10-12,
  playtest fourteen: "leave it in dungeons"): a wall's word goes into the
  record the console and logins use (docs/verbs/shouts.md).
- Exit: `d-bleak-falls` (both players through the puzzle door and the traps,
  with a restart mid-dungeon).

### M5: Progression (4 to 8 weeks, Class A/B)

- Skills, experience, and leveling from the documented formulas, computed
  R0; the client's own leveling disabled.
- Perks, enchanting, alchemy, pickpocketing as server transactions.
- From M1 (Eli, 2026-10-08: "keep leveling in 5 with progression"): what a
  level above 1 does in the game (the Stats menu, the HUD, leveled lists),
  the console's SetLevel and AdvSkill, and a skill's next use continuing
  from the experience the server wrote (docs/verbs/actor-values.md). M1
  records and restores the level and every skill's progress; nothing in
  M1 raises them, SkyMP's client keeping skill experience off.
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

### Stretch: Eli's mods

Acceptance cases for definition of done item 6 and M7's compatibility matrix,
not a widening of the non-goal: each works to the extent the ledger says. Each
sits in the milestone whose systems it leans on (Eli, 2026-10-05), with its own
scenario there; docs/MODS.md has their detail and sources.

- Eli's rotfern race: M1, with character creation and appearance sync. DONE
  (a-rotfern; rotfern.esp carries the Nord's stagger offsets since 2026-10-12).
- RaceMenu sync (Eli, 2026-10-04 and 2026-10-06: "i want my friends to be able
  to make their own hyper specific characters"): DONE 2026-10-08 (c8b26bf7), on
  the 1.6.1170 client set (ADR-025); docs/verbs/racemenu-sync.md.
- Apocalypse - Magic of Skyrim 10.2.3: M2 item 10 (ADR-029).
- Headshot Kills - CIF 1.2: M2 item 1's rider.
- Lost Grimoire 1.6 (Eli, 2026-10-10): M2 item 8, DONE.

Game versions (ADR-022, ADR-025): players and the lab run 1.6.1170; 1.7.104
stays runnable for a smoke when Steam or RaceMenu changes. One version per run
(`just lab-run <scenario> [game]`).

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
- CommonLibSSE-NG at the commit skymp's client builds against (CharmedBaryon b93280e8; the skyrim-multiplayer fork stopped in 2023): https://github.com/CharmedBaryon/CommonLibSSE-NG/tree/b93280e832f263dbef44e44cbe2936622a02f91a
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
