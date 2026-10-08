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
  DONE 2026-10-01: run 20261001-233455 green, 17 of 17 steps, 3 min 10 s
  wall (rollback of both clones 81 s, c1 reconnect after the restart 40 s),
  unattended, against the 1.7.104 port with sky-c1 (GTX 1050) and sky-c2
  (RTX 5060 Ti). `smoke-solo` (run 20261001-201016) is the one-client floor.
  The day's fixes on the way there, all in the harness and the fixture, none
  in the game: judged teleports (the client drops server moves for about 8 s
  after online), profile 2 parked off the origin, c2 off c1's path, the
  stepped move at full speed, an item outside the spawn kit.
- Ghidra project for SkyrimSE.exe 1.6.1170 analyzed, CommonLib types
  imported, reachable from the agent through pyghidra-mcp.
- `just addr <id>` resolves against addrlib/.
- docs/NATIVES.md generated from papyrus-vm: every native as implemented,
  delegated (SpSnippet), or stub.
- Re-verify SkyMP's "done" column (appearance, attributes, death, inventory,
  forge) as scenarios `m0-*`. They are the regression floor.
  Status 2026-10-01: m0-appearance green (run 20261001-232145) and
  m0-inventory green (run 20261001-234336: give, equip, the observer sees
  the equipped weapon, all of it across a restart). m0-attributes (run
  20261001-235144): server-set health, magicka and stamina reach the client
  and the observer within a second (the sample moved from 3 s to 1 s because
  magicka and stamina regenerate); across a server restart and relog they do
  not survive: server record and client both read 1.0 again. Cause, pinned
  on 2026-10-02 by a T2 run (the record reads 1.0 right after the restart,
  before any login, while the change form on disk still holds the saved
  values): MpActor::ApplyChangeForm replaces a loaded actor's values with
  the master files' base values, percentages included, so every server start
  heals every actor. That is a real gap in the "done" column and stays red
  here; the fix is M1's first persistence verb (docs/verbs/attributes.md),
  not a scenario edit. m0-death: the server marks the player dead and the other
  client sees a dead actor, but the stock client never kills the local
  player (skymp5-client deathService.killWithPush ragdolls it; isDead()
  stays false, health stays full), so `c1.state.isDead == true` describes
  a client the fork does not have yet. Eli decided (option a, scenario
  c489296 approved): the observable is the driver's knocked-down state
  (`c1.state.down`), SkyMP's own death; m0-death green since, last in the
  2026-10-08 merge sweep (run 20261008-093914). The ragdoll also rolled
  off the summit at the origin, so the kill moved to the flat strip. m0-forge waits for a forge reference, which is the
  lab cell (Track L4).
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
  DONE 2026-10-02 (ADR-019, still proposed): `smoke-two-players` green on
  the wire, run 20261002-220606, 17 of 17 steps, 2 min 31 s, both clones on
  the Rust MpClientPlugin.dll (lab-api rolls them back to `clean-m1`); fork
  parity fast-forwarded to 2d50bf5e. Deleted: Networking.cpp, RakNet on
  both ends, the BitStream archives, the C++ client plugin and fakeclient.
  PacketParser stays as the dispatcher of the JSON the Rust edge renders
  (ADR-019 point 2), not deleted as this bullet first said. T2 (`just
  test-proto`) is green against the pinned RakNet image with one declared
  divergence (the wire notices a graceful disconnect at once).

- Natives ledger: every stub becomes implemented (R0), delegated (R2 with a
  reason), or "never" with a reason. No silent stubs. Eli decided the seven
  stubs on 2026-10-04. Five are made real on fork branch m1-stubs:
  IncrementStat delegated; EnableNoWait and DisableNoWait; GetParentCell for
  exteriors; PlaceAtMe of an explosion drawn by the clients. Its ctest and
  T2 are green. DONE: merged into parity (b183e529), and every T3 sweep
  since has been green with it, the latest on 81f953dd (runs
  20261005-092733 to -094551). SetScale and GetCurrentStageID are deferred
  to verbs of their own.
- Persistence gaps from the roadmap: equipment in hands across restart,
  favorites, map markers, learned effects, script variables.
  Attributes DONE 2026-10-02 (docs/verbs/attributes.md): every server start
  reset loaded actors to full health, magicka and stamina; fixed, T2 and
  m0-attributes green on the wire (run 20261002-222409), on parity.
  Equipment in hands already survives a restart (m0-inventory green on the
  wire, run 20261002-221239), so that roadmap line is stale.
  M0 floor on the wire (2026-10-02): m0-appearance green (run
  20261002-221528), m0-inventory green, m0-death then red only on the
  client's own isDead as under RakNet; green on the knocked-down state Eli
  chose (see M0).
  Map markers DONE 2026-10-06 (docs/verbs/map-markers.md): the server
  records each player's discovered map markers and shows them again after
  a login, each player's own; a-map-markers green on both versions, Eli's
  fifth playtest passed, and the full sweep on the branch green, 42 of 42
  with two reruns on 1.6.1170 (m0-forge: the driver's same-frame craft,
  fixed in the driver; a-melee-reach: one swing that never connected); on
  parity add51356. Learned effects (docs/verbs/learned-effects.md) and
  favorites (docs/verbs/favorites.md) are built on fork branches
  m1-learned-effects and m1-favorites, stacked so one client (wire schema
  7) carries both. Both are green at T3 on both versions (a-learned-effects
  runs 20261006-071353 and -074716; a-favorites runs 20261006-083811 and
  -094342, after playtest six found item marks lost at a login). Their
  merge waited on m0-forge, red with two players on that build:
  Skyrim Platform called an event's callbacks in hash order, not the order
  they subscribed, so skymp5-client could apply a player's older inventory
  after its newer one and take back the item just given (a Frida trace of
  the game console, run 20261006-183431-x-give-trace: addItemEx +1, then -1
  a frame later); the client's new update handlers only moved the hash
  order. Fixed in Skyrim Platform (fork 44753816). Learned effects and
  favorites DONE 2026-10-07: merged into parity 1e782672 after the full
  sweep on 1.6.1170, 26 of 26 green in 68 minutes (runs 20261007-000641 to
  -011406); clean-m1 promoted on both clones. Script variables is designed
  (docs/verbs/script-variables.md) and first needs the game's own scripts
  on the server.
- Light (ESL) plugins on the server (Eli, 2026-10-07: "we want ESL plugins
  for SURE"). libespm reads only full-slot plugins, so the server's load
  order leaves every ESL-flagged plugin out (docs/LAB.md: the light Creation
  Club plugins load on the clients only), and an item from one cannot exist
  server-side: found with rotfern's outfit, whose scarf is Lowered Fur
  Hoods', a light plugin. Most current mods ship as light plugins. The verb:
  libespm gives a light plugin's records the form ids the engine gives them,
  the server's load order takes light plugins in the engine's order and the
  clients match it; a T0 test on the form id mapping, and a scenario that
  carries an item from a light plugin through a restart.
- Validation: character creation, damage range and angle, movement speed
  bounds, activation distance.
  Survey of what the server checks today: docs/verbs/validation.md. First
  verb DONE 2026-10-02: a move the server rejects is no longer relayed
  before validation (docs/verbs/movement-relay.md; a-movement-reject green
  on the fix, run 20261002-230136, red without it, run 20261002-230814; on
  parity). Second DONE 2026-10-03: a client's activation must be within the
  game's reach, 180 + 16 confirmed live (docs/verbs/activation-reach.md;
  a-activation-reach green on the fix, run 20261003-070107, red on parity
  before it, run 20261003-062216; on parity b095fca6). Third DONE
  2026-10-03: the race menu takes only a race it offers (Playable flag) or
  the one the server records (docs/verbs/character-creation.md; T2 difftest
  character-creation: the legacy server took DremoraRace, the fixed one
  refuses it; a-character-creation green through the real menu, run
  20261003-081014; on parity c104128f). Fourth DONE 2026-10-03: a
  player's melee hit on a player must be within the game's reach plus room
  for stale positions, 447 units for a Nord with a sword where the bound
  was 4096 (docs/verbs/melee-reach.md; the engine's formula from Ghidra,
  its edge measured in the lab; a-melee-reach red on parity, run
  20261003-091943, green on the fix, run 20261003-092301; on parity
  15eb653d). Fifth DONE 2026-10-03: a player's movement over the ground
  spends a budget refilled at 660 units a second (the fastest movement
  type a player uses, 600, plus a tenth) and holding 2048, where a client
  could cover 4095 units every 130 ms update before
  (docs/verbs/movement-speed.md; a-movement-speed red on parity, run
  20261003-094307, green on the fix, run 20261003-100454; on parity
  8266a21c). Sixth DONE 2026-10-03: a player's power and sneak flags count
  only when the server saw a power attack start within 3 s or holds the
  attacker sneaking (docs/verbs/damage-flags.md; a-damage-flags green on
  the Rust rules, run 20261003-224045; on parity f0045206, where the five
  game rules are Rust, ADR-020). Seventh DONE 2026-10-04: a player's melee
  hit on a player must come from within the attacker's cone, 95 degrees off
  its heading for a Nord (145 for a power attack's sweep), where the game's
  own cone is the client's to widen (docs/verbs/hit-cone.md; a-melee-cone
  green, run 20261004-055345; on parity 64ba89a4). PvE and hosted-NPC reach
  and angle move to M3 (planning pass, 2026-10-08): the lab server runs
  without NPCs (npcEnabled false), and an NPC's swing is its host's to
  report there. The blocked flag only lowers the attacker's own damage and
  stays as it is.
- Console commands, full ActorValue set, game time and globals, wait and
  sleep as server-owned time. Eli (2026-10-05): console commands and the
  full ActorValue set stay in M1, with the persistence work. Game time part one, the shared clock, DONE
  2026-10-04 (docs/verbs/time.md, ADR-021): a stateless Rust clock,
  SetGameTime at login and every minute, the client rendering it and
  setting the engine's day count through a new Skyrim Platform native
  (TESModPlatform.SetGameDaysPassed); a-time green, run
  20261004-035822-a-time; on parity 4257036e. Part two, per-player wait and
  sleep, DONE 2026-10-04 (docs/verbs/rest.md): a player's rest is its own.
  The client reports the hours its engine ran ahead across the Sleep/Wait
  menu (RestIntent, wire schema 4). The server checks them (the menu's 1 to
  24 hours, alive, no hit within 10 s, TES3MP's allowWait and allowSleep)
  and grants the rest's recovery, 360 s of regeneration a rested hour, as
  measured in the engine. Nobody's clock moves. a-rest green on 1.7.104 and
  1.6.1170 (runs 20261004-094211, -094636, and -111831 on the final image).
- From Eli's first T4 playtest (2026-10-04, sky-c1 and sky-c2 over
  Moonlight). Passed: movement with no snap-backs; hits, power attacks and
  reach; death and respawn; items. Found:
  - Sneak attack damage: the server multiplied by SkyMP's flat 1.3
    (TES5DamageFormula.cpp, upstream's TODO "get from GameSettings"), while
    the game promises its own multiplier. DONE 2026-10-04
    (docs/verbs/sneak-damage.md, fork bb0725ec): a kept sneak attack is
    worth the game's base multiplier for the weapon's type, from
    Skyrim.esm's fCombatSneak*Mult settings (one-handed and daggers 3,
    two-handed and unarmed 2), a Rust rule in wire-rules `damage`. Bows,
    crossbows and staffs keep 1.3 until a ranged verb. a-sneak-damage green
    on 1.7.104 and 1.6.1170 (runs 20261004-213205 and -213505); the
    engine's own message read "Sneak attack for 3.0X damage!".
  - Hostility is one-sided: only the attacker's game marks the other an
    enemy. ADR-023: share it with the victim's game. DONE 2026-10-04
    (docs/verbs/hostility-sync.md, fork 5af53787): on the first hit of a
    fight between players, the server has the victim's game call
    Actor.StartCombat on its figure of the attacker (an SpSnippet, no new
    message; the rule is Rust in wire-rules `hostility`). Both games then
    refuse a wait and mark the enemy on the compass; the figure does not
    drift. a-hostility green on 1.7.104 and 1.6.1170 (runs 20261004-230736
    and -231111).
  - The two clients' clocks looked "a few minutes" apart. Not drift: at
    time scale 20 a game minute passes every 3 real seconds, so reading two
    wait menus 10 to 15 s apart shows 3 to 5 minutes. Read back to back
    every minute for eight minutes, through a 7-hour rest and a death and
    respawn, they never differed by more than 0.9 game minutes (exploratory
    run 20261004-201638).
  - Next playtest: profile 2 needs a look of its own to judge appearance
    sync, players start hurt so a rest's recovery shows, and a bed within
    reach for sleep. Done 2026-10-04: profile 2 is an Orc named "test 2" in
    the clean world (preset lab-orc-2), and `just playtest-start` puts both
    players at half health by an unowned bedroll.
- From Eli's second T4 playtest (2026-10-04, docs/private/playtest-m1-2.md).
  Passed: two distinct characters (an Orc named test 2); sneak attacks at
  3.0x with the sword and 2.0x bare-handed, with the damage to match; a wait
  restores, and the other player's clock stays; after a hit both games show
  the enemy and refuse a wait, and the figure never acts on its own. Found:
  - Beds work once per player, a sleep reports as a wait, and no Rested
    effect appears (docs/verbs/rest.md lists the three causes). DONE
    2026-10-05 (docs/verbs/sleep.md, fork 13b2e188): a bed (FURN with
    kCanSleep) works every time, the server decides a sleep from the bed
    the player just activated, and a sleep grants Rested for eight game
    hours. a-sleep green on 1.7.104 and 1.6.1170.
- From Eli's third T4 playtest (2026-10-05, docs/private/playtest-m1-3.md).
  Passed: Rested shows in Active Effects, the same bed works twice, swapping
  beds works. Found:
  - Aggro never expired: each game's figure of the other player is an AI in
    combat, which gives up only when it loses its target. Eli's call: a fight
    ends after 60 s without a hit, or with the players walked apart (ADR-023
    amendment). DONE 2026-10-05 (docs/verbs/hostility-sync.md, "Ending a
    fight"): wire-rules hostility::Fights, PartOne::TickFights, and
    Actor.StopCombatAlarm to both games; a-fight-end green.
  - A bed one player had activated blocked the other: SkyMP's furniture
    occupancy, meaningless for beds that seat no one. Beds now take no
    occupant (docs/verbs/sleep.md).
  - test 2's stuck wait waits on fights ending, so it moves to playtest four
    (docs/private/playtest-m1-4.md).
  - After a 6-hour wait test 2 could not act until the playtest reset moved
    it; no log shows why. Closed 2026-10-05 after playtest four (below):
    not reproduced.
  - No sound in the Moonlight streams. Cause found 2026-10-05: sky-c2's
    clean-m1 has no audio output at all (no Steam Streaming Speakers, which
    sky-c1's has), and Sunshine installs them only at a stream's start, after
    the game has launched without them. Fix: the speakers go into both clone
    snapshots (lab/deploy/sky-client/README.md). DONE, confirmed 2026-10-08:
    after the merge sweep both clones (rolled back to clean-m1-next at each
    run) have ROOT\STEAMSTREAMINGSPEAKERS\0000 and its "Speakers (Steam
    Streaming Speakers)" endpoint, both OK.
  - The lab games quit by themselves after 2.5 to 3.5 hours idle. Cause
    found and fixed 2026-10-05: refused, the game's Bethesda.net request
    retried hundreds of times a second and WinHTTP leaked each try until the
    client ran out of memory (lab/deploy/sky-client/README.md, "The game's
    traffic outside the lab"); an unresolvable machine WinHTTP proxy ends it.
- From Eli's fourth T4 playtest (2026-10-05, docs/private/playtest-m1-4.md).
  Passed: a fight shows on both games and refuses a wait, ends after a quiet
  minute or once the players walk apart (server log: 19:40:16 "a minute
  quiet", 19:40:45 "apart"), and stays on while hits keep coming; both
  players sleep in the same bedroll one after the other, each Rested. test
  2's stuck wait did not come back: two 6-hour sleeps and a 6-hour wait on
  test 2 in the server log, more of Eli's own after. Eli's call: closed; if
  it came from `just playtest-start` moving a player right after a wait, that
  is lab tooling, not a player's path, and not worth code (docs/verbs/rest.md).
- From Eli's fifth T4 playtest (2026-10-05, docs/private/playtest-m1-5.md),
  the map-markers verb (docs/verbs/map-markers.md, fork m1-map-markers).
  Passed: each player's discoveries (test 2 a fort and a wheat mill, test 1 a
  Dawnguard shack) came back on its own map after the game was quit and
  started again, twice, and never on the other's; the server showed them
  after the login ("a map update"). A discovery made after a console COC was
  refused (E_MARKER_NONE): the server never took the console teleport, so it
  judged the report at the player's old position, as server authority
  should; a COC the server honors belongs to the console-commands verb.
- Eli's rotfern race (from the stretch list; Eli, 2026-10-05: "my
  character rotfern whenever", placed with the systems it leans on, all
  M1's). The standalone plugin (masters Skyrim.esm and
  RaceCompatibility.esm) uses vanilla appearance data only, so it needs:
  both plugins in the server's and the clients' load orders (ESP and ESM,
  which libespm reads; never the RaceCompatibility SKSE plugin), the race
  offered in the race menu and taken by the character-creation check
  (docs/verbs/character-creation.md), and SkyMP's appearance sync and its
  persistence (m0-appearance). Scenario `a-rotfern`: a rotfern created in
  the race menu, seen as one by the other player, and still one after a
  restart. RaceMenu co-save data is not carried (see Stretch).
- From Eli's sixth T4 playtest (2026-10-05 late, docs/private/playtest-m1-6.md;
  fork m1-favorites client 8f5365da on both clones, the mod layer loaded).
  Passed: an eaten ingredient's first effect stays known after quitting the
  game, three kinds on test 2, and the server taught all three back; spell
  favorites and their keys come back after quitting; nothing propagates to
  the other player (test 1's login got no favorites and no effects). Found:
  - Item favorites did not come back after quitting (the server sent all
    three; the client's first inventory sync after a login empties and
    refills the inventory, which threw the mark away), and the next report
    then shrank the record to two. Fixed on the branch (7e58041b: items are
    marked after that first sync), in the client built after the playtest.
  - A remote player's Flames kept spraying on the other screen, damaged the
    observer, and started no fight (no hostility, ADR-023 covers weapon hits
    only). Spell cast sync and spell damage authority: M2 (magic authority,
    below), recorded there.
  - Rotfern: listed twice (its vampire race is meant to be selectable,
    Eli); picking an entry crashed the game once (0xC0000005, 23:32 PDT),
    which Eli placed right after he opened the Moonlight connection. The
    automated picks of either entry with the skeleton stopgap did not crash
    (runs 20261006-055423 and -063425), so the trigger is under
    investigation: the race menu, or the stream start (Sunshine switching
    the clone's audio device under a running game; a hypothesis, untested).
    Evidence for the stream start, 2026-10-07 21:01: a second Moonlight
    session was opened to each seat while an older one was still connected
    (21:01:31); the lab driver's heartbeat from inside both games stopped
    by 21:01:40 and Eli saw both frozen, with SkyrimSE.exe still answering
    Windows as responding. Rule since: one stream per seat, opened before
    the game or left alone while it runs; check for a running one first.
    After quitting, a rotfern showed as a Nord in its own game: an upstream
    SkyMP bug in the login save (Skyrim Platform wrote every form outside
    Skyrim.esm as a created form), fixed on the branch (dbed91b0, with a
    T0 test). Eli, on the fixed client after midnight: the race swap held
    through a relaunch, no crash; one more game end then was my restage
    stopping the game, not rotfern. What remains is the look RaceMenu gave
    the character on fenestrate (the sculpt, and the menu's options: the
    lab has no RaceMenu, there is no 1.7.104 build): bake the sculpt into
    the race's head mesh (chim's outstanding NifMerge step) or a RaceMenu
    sync verb (Stretch), Eli's call; apocrypha checks that the standalone
    derived from fenestrate's composite is not broken in itself.
- From Eli's seventh T4 playtest (2026-10-06, docs/private/playtest-m1-7.md;
  on 1.6.1170 after ADR-025, fork m1-favorites 3ffa1091 with Skyrim
  Platform's event-order fix). Passed: three ingredients given back to back
  to each player with both online all stayed; a weapon favorite and its key
  came back after quitting, on both players; rotfern picked in the race
  menu held in its own game and the other's after quitting. Found:
  - Each ingredient showed as two stacks, 2 and 1, while the server held one
    entry of 3: skymp5-client passed addItemEx the base name for every
    item, and a name makes addItemEx build an extra list the engine counts
    as one item (upstream since 94990795, 2020). Fixed on the branch
    (1e782672: a name only when the server records one).
  - Neither player knew an ingredient effect: expected, `lab-up` reset the
    server's world before the playtest and nobody had eaten since.
- From Eli's eighth T4 playtest (2026-10-07, docs/private/playtest-m1-8.md;
  on 1.6.1170, fork m1-racemenu ba000d6a, RaceMenu 0.4.20.0 on both
  clones). Passed, every check: each player shaped its look in RaceMenu
  (sculpt and RaceMenu's sliders), the other saw it within seconds, its own
  look stayed its own, and both looks came back after quitting, both ways
  round. The server recorded the looks at 24,463 and 41,332 bytes, so the
  RaceMenuPreset cap of 192 KiB stands. Found: picking rotfern in RaceMenu
  gives the race preset's sliders without the sculpted face meant to ship
  with the mod. A race preset NPC lends a player its head parts, sliders
  and tints, never its baked FaceGen mesh, and a sculpt cannot live in a
  plugin; the carrier is a RaceMenu preset (.jslot) in the mod, which
  apocrypha is making against the standalone's records (Eli, 2026-10-07).
- From Eli's rotfern session after it (2026-10-07). A hair colour changed
  in a race menu the player opened itself reached the other client as the
  look but not as the colour: SkyMP takes an appearance (which carries the
  colour, as RGB) only from a race menu the server opened and drops any
  other silently, and the look sync had no such gate. Now it has the same
  one, one look per server-opened menu (fork 06381be7, docs/verbs/
  racemenu-sync.md). Rotfern's shine is the specular term, shown by an A/B
  on test 1 with apocrypha's head mesh at specular strength 0 against the
  original 3.0 at glossiness 30; fenestrate's ENB gave skin 0.15 outdoors.
  Not the ENB (Eli: "i GUARANTEE it's not an enb"; apocrypha's dates agree:
  the ENB files are from 2026-07-01, the rotfern build from June 5 to 18).
  Candidate from fenestrate's own inis: bUse64bitsHDRRenderTarget=1 there,
  0 in the lab (the lab's prefs were never templated), so bright specular
  clips to white; the same-sun A/B (probe x-hdr) came out matte on both
  sides and decides nothing (the figure in profile, the sun off the face),
  so the key is set to 1 on every clone as fenestrate's value (display.ps1)
  and Eli judges the face in playtest nine; HYPOTHESIS until then. CBBE
  2.0.3 is in the shared mod set for every player (Eli: non-negotiable;
  body morphs are how armor is fitted, and a look carries them), laid out
  from its FOMOD by persist-mods; its light plugin stays client-side until
  the ESL verb above lands. `a-racemenu` now also carries a body morph
  (green, run 20261007-135454, server 9c0968b8; commit 952a8e4 for Eli's
  review). Measured (probe x-head-parts, run 20261007-133253): the sync's
  own load puts the preset's ear, weight and skin tint on the player and
  they survive a server-opened menu; Eli's record had SkyMP's appearance
  values instead, HYPOTHESIS the vanilla menu's Done commit over RaceMenu's
  UI preset load (docs/verbs/racemenu-sync.md), checked in playtest nine.
  With RaceMenu's menu in the set, `a-rotfern` went red (run
  20261007-140054: race-pick's 16 Down presses leave the race unchanged, the
  menu's race list is RaceMenu's); the driver now falls back to the game's
  own live race change (Actor.SetRace) after the presses, and the menu's
  close still sends the result for the server's check. Run 20261007-181613
  with the base-only fallback: the server took rotfern
  (lastAppearanceAllowed, raceId), c1's own actor stayed a Nord until a
  reload; the Actor.SetRace fallback is staged after playtest nine.
- Playtest nine (2026-10-07, docs/private/playtest-m1-9.md, in progress)
  found the root of the RaceMenu oddities: skymp5-client blocks every
  Papyrus event but OnUpdate, so RaceMenu's own scripts never ran in the
  lab (dead tint and hair color sliders, a preset loaded in the menu
  landing with the vanilla menu's bare commit, skin tone at alpha 1.0 and
  another color). Fork d9c940f1 lets scripts named RaceMenu* pass the
  block as SkyUI's do; 30b1e262 re-applies a menu-loaded preset through
  CharGen at the menu's close. Both build; staged after the playtest with
  CBBE's Face Pack (the head-to-body seam on every adult female) and the
  race-pick fallback. The shine: the HDR key is a lever in the lab (key 0
  clips highlights in sun and loses them at night, key 1 keeps them), and
  Eli rules out his lighting mods ("if it's lighting at all it's vanilla
  game shit"); the full ini diff against fenestrate leaves no other render
  key, so the tint fix lands first and the face is judged again.
- Found by apocrypha (2026-10-07, reading Eli's real save): SkyMP's login
  save writes the NPC face block's two counts as 8-byte size_t
  (savefile/src/SFChangeFormNPC.cpp:80 and :84, through the template
  Write), where the game reads 4-byte counts ([u32 19][19 floats][u32 4][4
  u32] in a real save). skymp5-client's login save carries a face (head
  parts and presets, remoteServer.ts loadGame), so the game misreads the
  rest of that record, the gender after it included, until
  applyAppearanceToPlayer sets the appearance a moment later. Fixed on the
  branch the same evening (4bd52443: the counts as uint32_t, with
  unit/SaveFileFaceBlockTest.cpp on the block's byte layout).
- The shine, resolved by measurement (2026-10-07 evening, docs/verbs/
  racemenu-sync.md). A read-only Frida walk of the live face geometries
  (lab/frida/face-dump.js: shader flags, material specular, every bound
  texture with its D3D11 format, texture-set paths) showed rotfern's head
  binding the engine's 16x16 stand-in texture on its specular slot: her
  head mesh named the textures of the child mod she was derived from
  (textures\actors\character\ranaline\child\...), which fenestrate has and
  the lab never did, and the facegen pass replaces the diffuse, normal and
  subsurface slots from the face texture set but never the specular. Not
  the HDR key, the tint, the overlays, the weather or the files the mod
  ships, all of which were byte-identical to fenestrate's. apocrypha
  re-pathed the head and ear meshes to the mod's own maps; restaged, both
  seats bind rotfern\head_s.dds and Eli sees her right (20:32). The same
  dump found the player's own seat wearing the Nord race's head and mouth
  parts under her other parts: the look had been applied while the actor
  still carried the race it loaded as, and the appearance recorded the Nord
  parts from that menu session (the two records can disagree: the look
  names rotfern's parts). Fork 0513beba applies the own look only once the
  actor's race is its base's and again after every alignment. Design debt
  named: head parts, race, colours and weight live in both the appearance
  and the look; the server deriving the appearance from the look at
  OnRaceMenuPreset (one authority, R0) is the next step, an ADR candidate.
  Rule-1 lesson for every future Frida script: CommonLibSSE-NG's two-number
  RelocateMember is (SE and AE, VR), and RelocateMemberIfNewer shifts a
  struct's field comments; the first dump walked nothing for that reason.
  Later the same evening (playtest ten): the vanilla menu's Done commit
  writes its Face and Mouth sliders over a preset loaded in the menu, and
  its open rebuilds the head from the base's vanilla data without
  RaceMenu's layer; fixes 77400a0d (the look read at the close event, put
  back over the commit) and c4eebeeb (the recorded look back on after the
  open; a stopgap). Eli's definition of done for the leg: she is perfect
  on both seats and a brand-new character comes out exactly right. The
  no-import route (docs/verbs/racemenu-sync.md) is more than half in the
  plugin already: rotfernNPC is the race's only CharGen preset NPC with the
  June morphs and tints; it lacks the ear, Eye Depth 0.3 and tint
  strengths (apocrypha, tonight), and the sculpt still needs baking into
  childhead.nif with its chargen tri (half a day, the follow-up); about two
  working days with the lab rounds. ADR-026 (one record) proposed.
- Playtest ten (2026-10-07 evening into 2026-10-08, docs/private/
  playtest-m1-10.md). Passed: her face matte on both seats after the mesh
  re-path; body sliders under the robes seen by the other seat and kept
  across a relaunch; hair colour kept across a relaunch; a brand-new
  character on a blanked world comes out exactly right (race pick alone
  gives tone, ear and hair from the race's preset NPC; one preset load
  gives the sculpted face; Done; relog); with the head parts flagged
  female (rotfern.esp 790d3b6c) a server-opened menu opens on her and the
  face node reads her head three seconds in. Found and fixed on the way:
  the vanilla menu's Done commit over a menu-loaded preset (77400a0d), the
  open losing RaceMenu's layer (482a331f), the head parts without a gender
  flag (the plugin). Found, for later: arrows do not fly (Eli: drawn,
  equipped, no arrow leaves the bow), the roadmap's marksman line.
- The RaceMenu leg's merge sweep (2026-10-08, client 3a8e4cfd on the
  m1-racemenu server): 24 of 27 green, then the three reds green on a rerun
  (a-movement-speed 20261008-095352, a-activation-reach 20261008-095553,
  a-character-creation 20261008-095804 with its race-pick revision). Watch
  item:
  a-movement-speed's 1.5 s run under a held W covered 354 to 434 units in
  every earlier run and 170 (red) and 213 (green, the bound is 200) on this
  client stack; both clones still run by default (SkyrimPrefs.ini
  bAlwaysRunByDefault=1, read after the sweep), so the next suspect is the
  run starting while the heavier mod layer still loads the cell after the
  teleport. Measure before touching the scenario.
- The rest of M1, charted 2026-10-08 (Eli's decisions in the planning
  pass): script variables leave M1 (the design in
  docs/verbs/script-variables.md stays; the verb joins the milestone where
  the server runs the world's own Papyrus); SetScale waits past M1 for the
  first verb that scales a reference; globals stay deferred per ADR-021
  (Apocalypse in M2 is the first to need them); ADR-026 is accepted and
  built in M1. In order, each a verb through CLAUDE.md's workflow with its
  scenario in its own commit and the sweep at its merge (ADR-024):
  0. Close RaceMenu sync: DONE 2026-10-08. The merge sweep on client
     3a8e4cfd (527e0b34 and the reloot test fix) green, fork parity
     fast-forwarded to m1-racemenu c8b26bf7, both clones' clean-m1-next
     promoted to clean-m1. Owed: one straight-Done check at Eli's next
     session; apocrypha's mesh bake in parallel.
  1. The full ActorValue set (fork m1-actor-values: rule, MsgType 40,
     record, client service and natives, T0 and difftest built; left: the
     server's Get, Set, Mod and Force natives on a player, the four
     HYPOTHESIS tags, T2, `a-actor-values`) with ADR-026's derivation of
     the appearance from the look in the same server pass. About three
     sessions.
  2. Light (ESL) plugins on the server (the bullet above): a verb doc
     first, libespm's light form ids with a T0 test on a fixture plugin the
     repo owns, the load order and the client's verification, CBBE's
     plugins joining the server, `a-light-plugin`. About four sessions.
  3. Console commands (docs/verbs/console-commands.md, design only): Eli's
     review of the command table's ranks and of how an owner is named
     comes first; then the Rust message and handler, `coc`, `additem`, and
     the actor-value commands through their verbs, `a-console`. About four
     sessions.
  4. Exit: doc hygiene (stale Status boxes), m0-death's observable (Eli,
     M0: done, the knocked-down state), PvE and hosted-NPC reach and angle
     moved to the NPC milestone
     (done: M3), the Moonlight sound fix confirmed (done), one sweep green
     on parity. M2 opens
     with the first ranged hit verb (arrows do not fly; Headshot Kills
     rides it).
- Exit: scenarios `a-*` green including `a-restart-persistence`.
  Status 2026-10-02: `a-restart-persistence` exists and is green on the
  wire (run 20261002-231256: position, inventory, the equipped weapon as
  the player and the observer see it, and attributes survive a restart); it
  grows with each persistence verb. `a-movement-reject` green (movement
  relay order). Both reviewed by Eli (accepted with the scenario commits up
  to 9e87c65; confirmed 2026-10-04).

### M2: Combat and magic authority (8 to 12 weeks, Class B)

- Magic effect system on the server: apply and remove effects with magnitude
  and duration read from ESM records; potions and poisons become effects
  rather than direct attribute writes. Client renders shaders and sounds and
  suppresses the engine's own application. Rung: R0.
- Spells: cast intent from the caster (observe), server resolves, broadcast
  to renderers (impose), suppress local resolution. Shouts with words known
  as server state. Rung: R1 intent, R0 resolution.
  - Apocalypse - Magic of Skyrim 10.2.3 (from the stretch list; Eli,
    2026-10-05: "apocalypse at spells"): records plus 206 vanilla-Papyrus
    scripts, effectively no SKSE. Of its 165 natives, 102 are missing,
    GlobalVariable.GetValue and SetValue the most called, which makes it
    the first verb to need server-owned globals (ADR-021 decision 4); each
    native it calls gets its ledger line. Eli (2026-10-05): most of its
    spells should behave about the same as vanilla ones, so they ride this
    bullet's cast path. The hard case is its projectile teleport, a blink
    step that moves the caster to where the projectile lands. The
    movement-speed budget (docs/verbs/movement-speed.md) refuses exactly
    that jump, so the spell needs its own path: the server takes the cast
    (R1) and allows a jump to the landing point within the spell's reach.
    Scenario `b-apocalypse`: a vanilla-like Apocalypse spell and the blink,
    seen by an observer, the blink not snapped back.
- Hit registration with lag compensation (rewind by client latency, Bernier
  2001), blocking, marksman aim pitch on the wire, projectile ownership.
  - Headshot Kills - CIF 1.2 (from the stretch list; Eli, 2026-10-05:
    "headshots whenever", placed with the first ranged hit verb, which may
    come before the rest of M2): an ESL and a script that Kill() the victim
    when Core Impact Framework (an SKSE plugin hooking projectile collision
    and hit processing on the shooting client) reports an unhelmeted head
    hit. The hit location rides ranged hit registration as untrusted input
    (hard rule 5), and the kill is the server's (R0). On the lab's 1.7.104
    it runs on CIF 2.0.7 unchanged (1.2.8 reads only the older Address
    Library format). Scenario `b-headshot`: an arrow to an unhelmeted head
    kills, the same arrow to a helmet does not.
- Corpse loot, container open animation for observers, container contents
  reconciled on open.
- Found in playtest six (2026-10-05): a remote player's Flames keeps
  spraying on the observer's screen after the caster stops, damages the
  observer through the observer's own game, and starts no fight. The cast
  stop is not mirrored, and spell damage is the victim's client's today, not
  the server's: both belong to this milestone's spell resolution.
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

### Stretch: Eli's mods

Three mods Eli wants working (2026-10-03). They are acceptance cases for
definition of done item 6 and M7's compatibility matrix, not a widening of
the non-goal: each works to the extent the ledger says. Since 2026-10-05
(Eli) each sits in the milestone whose systems it leans on, with its own
scenario there:

- Eli's rotfern race: M1, beside character creation and appearance sync.
- Apocalypse - Magic of Skyrim 10.2.3: M2, under spells.
- Headshot Kills - CIF 1.2: M2, under hit registration, with the first
  ranged hit verb.

- RaceMenu sync (Eli, 2026-10-04: "if this thuum project built that racemenu
  stuff that would slap"; 2026-10-06, chosen over baking rotfern's sculpt
  into the mod: "i want my friends to be able to make their own hyper
  specific characters"): every player's RaceMenu look (sculpt, overlays,
  body morphs, node scales, sliders), which SkyMP never sends, is captured
  on its client, kept with its character on the server, and applied on
  every client. It is a verb of its own, and it needs RaceMenu to load on
  every client. RaceMenu's current files (v0.4.20.0, Nexus 19080, uploaded
  2026-04-19/20) all require game 1.6.1170 (GOG 1.6.1179), none 1.7.x
  (Nexus file list, 2026-10-06), and SKSE 2.3.1 on 1.7.104 refuses its
  plugin (sky-c1, 2026-10-06), so it is built and tested on the lab's
  1.6.1170 client set (ADR-025). Status 2026-10-07: through RaceMenu's own
  CharGen natives (docs/verbs/racemenu-sync.md), T2 green, `a-racemenu`
  green (approved by Eli; its body-morph addition 952a8e4 awaits his
  review), playtest eight passed. DONE 2026-10-08: on fork parity
  c8b26bf7 after its merge sweep (rotfern and playtest ten with it).

Game versions (ADR-022, Eli, 2026-10-04): thuum supports and tests 1.7.104
and 1.6.1170, one version per lab run (`just lab-run <scenario> [game]`).
Both clones carry a 1.6.1170 folder, built from Steam's own depots for that
build, kept in persist. On sky-c1 it launched through SKSE 2.2.6 and logged
in against the server on 1.6.1170's masters (2026-10-04). The detail,
sources and gaps of the three mods are in docs/MODS.md (apocrypha's
analysis, 2026-10-04); rotfern's own look does not need RaceMenu.

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
