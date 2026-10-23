# LOG: the dated record

What this is: how each item in docs/PLAN.md got done, in the order it happened:
the lab runs and their ids, the playtests' findings and their fixes, the
decisions as they were taken. PLAN.md carried all of it inline until 2026-10-13
and had grown to 1,218 lines, so every session read thirty thousand tokens to
learn where things stood; the process audit of that day moved the narrative
here and left PLAN.md the chart (one line of state per item) with `just status`
as the live check. Rules: entries are appended by date under "Entries", newest
last; nothing above an entry is rewritten (a correction is a new entry that
names what it corrects); a verb's own detail stays in its doc under docs/verbs/,
a decision's in docs/DECISIONS.md, the lab's in docs/LAB.md.

## As PLAN.md told it, 2026-09-24 to 2026-10-13

Verbatim, the Milestones section of PLAN.md as it stood at the move (its state
words and "Status" notes were written at the dates they name).


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
  DONE 2026-10-02 (ADR-019, accepted 2026-10-04): `smoke-two-players` green on
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
  on the server; it left M1 (Eli, 2026-10-08) for the milestone where the
  server runs the world's own Papyrus.
- Light (ESL) plugins on the server (Eli, 2026-10-07: "we want ESL plugins
  for SURE"). libespm reads only full-slot plugins, so the server's load
  order leaves every ESL-flagged plugin out (docs/LAB.md: the light Creation
  Club plugins load on the clients only), and an item from one cannot exist
  server-side: found with rotfern's outfit, whose scarf is Lowered Fur
  Hoods', a light plugin. Most current mods ship as light plugins. The verb:
  libespm gives a light plugin's records the form ids the engine gives them,
  the server's load order takes light plugins in the engine's order and the
  clients match it; a T0 test on the form id mapping, and a scenario that
  carries an item from a light plugin through a restart. DONE 2026-10-08
  (docs/verbs/light-plugins.md; a-light-plugin green; on parity 26acffc4,
  The rest of M1, item 2).
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
  The full ActorValue set DONE 2026-10-08 (docs/verbs/actor-values.md; on
  parity 26acffc4) and console commands DONE 2026-10-08, with TES3MP's
  player numbers 2026-10-09 (docs/verbs/console-commands.md; on parity
  89db8732): The rest of M1, items 1 and 3. Globals beyond the clock wait
  for the first verb that needs one (ADR-021; Apocalypse in M2 is expected
  first, ahead of M6's quests).
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
  (green, run 20261007-135454, server 9c0968b8; commit 952a8e4, approved
  by Eli 2026-10-08). Measured (probe x-head-parts, run 20261007-133253): the sync's
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
  teleport. Measure before touching the scenario. The light-plugins merge
  sweep's run (20261008-140709) covered 301.
- Playtest eleven (2026-10-08 afternoon, docs/private/playtest-m1-11.md;
  1.6.1170, fork m1-console e0d5e439, Eli's playtest-10 world). Passed:
  skills the server sets held through a relaunch; console AddItem,
  Rare Curios' Sload Soap (0xFE00181E) by AddItem and eaten, its effect
  taught again after each relaunch; Save refused; COC to every cell tried,
  both seats (Riverwood, the Sleeping Giant, Whiterun's square (8, -5),
  the Silver-Blood Inn), test 2 back where it stood after a quit; Kill and
  Resurrect; a player's COC and AddItem refused. Eli kept the success
  lines. Failed: MoveTo after a kill and a resurrect ("invalid object
  reference", the game's own; nothing reached the server), and the
  straight Done owed since the RaceMenu leg: hair and skin back to the
  race's colors, the tint layers off the record. Both measured and fixed
  on fork m1-console the same evening (docs/verbs/racemenu-sync.md
  Status, docs/verbs/console-commands.md Impose); x-set-probe confirmed
  the server's clock wins over a console `set gamehour`. Eli then put her
  back by importing her template in the race menu and fitted the
  Shrouded Robes; after a relaunch "she looks perfect", saved as the
  server snapshot playtest-11-rotfern-20261008T224415Z. Weather differs
  between seats: not synced yet, M4's (each game rolls its own).
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
     promoted to clean-m1. The owed straight-Done check failed in playtest
     eleven, was fixed (5746fa9a, 137f3fb5) and passed in playtest twelve;
     apocrypha's mesh bake stays in parallel, outside M1.
  1. The full ActorValue set (fork m1-actor-values: rule, MsgType 40,
     record, client service and natives, T0 and difftest built; left: the
     server's Get, Set, Mod and Force natives on a player, the four
     HYPOTHESIS tags, T2, `a-actor-values`) with ADR-026's derivation of
     the appearance from the look in the same server pass. About three
     sessions. Status 2026-10-08 night: built (natives 04cd5da6, ADR-026
     e83b8ded; the probes found the record never applied in the game, Mod
     and Force meaning a modifier, and callNative refusing an array, each
     fixed on the branch); T2 green; `a-actor-values` and a-racemenu's
     ADR-026 check green. DONE 2026-10-08: on fork parity 26acffc4 with
     light plugins, after the merge sweep on that build, 29 of 29 green
     (runs 20261008-132148 to -150004); both clones' clean-m1 promoted.
  2. Light (ESL) plugins on the server (the bullet above): a verb doc
     first, libespm's light form ids with a T0 test on a fixture plugin the
     repo owns, the load order and the client's verification, CBBE's
     plugins joining the server, `a-light-plugin`. About four sessions.
     Status 2026-10-08 night: built (libespm, FormDesc, the manifest, the
     client's comparison); the clones' numbering measured; the server
     loads SurvivalMode, Curios and _ResourcePack in the engine's order; T2
     green (the legacy stack without the .esl files); `a-light-plugin`
     green. CBBE's two plugins stay client-only, each the last of its
     kind. DONE 2026-10-08: on fork parity 26acffc4 (the same merge sweep,
     29 of 29).
  3. Console commands (docs/verbs/console-commands.md): Eli's
     review of the command table's ranks and of how an owner is named
     comes first; then the Rust message and handler, `coc`, `additem`, and
     the actor-value commands through their verbs, `a-console`. About four
     sessions. Status 2026-10-08 night: two slices built on fork
     m1-console (the table and ranks, ConsoleOutput, AddItem through
     MoveTo, the actor-value commands, the staffRank property); T2's
     console session identical up to its declarations; the ranks on Eli's
     form; COC's engine path read in Ghidra and left for a Frida trace.
     Later the same night: Skyrim Platform's console bugs found by typing in
     the lab and fixed (a command without parameters never dispatched; an
     unconvertible parameter threw); `a-console` green (run
     20261008-153841; scenario 730528f approved by Eli 2026-10-08). COC served 2026-10-08 (Eli: "anyone
     with admin should be able to COC"): the caller's own game goes to the
     named cell and the server's movement rule takes that one jump (R1;
     fork m1-console 0708f531, e0d5e439); the server does not reimplement
     the engine's spot, so the Frida trace is no longer on the verb's path.
     Green in the lab the same day: x-coc-probe 20261008-191416 (Riverwood
     and the Sleeping Giant Inn, each landing where the server permitted),
     then a-console with COC (scenario commit 6559446, run
     20261008-191741; approved by Eli 2026-10-08). Eli approved the ranks the same
     day. Playtest eleven passed it but for MoveTo after a kill and a
     resurrect (fixed and measured, 738be708); `set` against the clock
     confirmed, the success lines kept (Eli). DONE 2026-10-08: the merge
     sweep on fork m1-console 137f3fb5 (the console verb, COC, MoveTo, and
     the RaceMenu straight-Done fix 5746fa9a and 137f3fb5 with
     a-racemenu's plain-Done check 9c24514) went 30 of 30 green (runs
     20261009-010443 to -022103); fork parity fast-forwarded to 137f3fb5,
     both clones' clean-m1 promoted, NATIVES regenerated. a-movement-speed's
     held run covered 276 units (bound 200; 354 to 434 before the RaceMenu
     client stack): the watch item stands. Playtest twelve (2026-10-08
     night, docs/private/playtest-m1-12.md, on parity 137f3fb5 from Eli's
     playtest-eleven world): the plain Done held, and so did COC and the
     rest after a quit; MoveTo did not: within one cell the moved player
     went "a little" or not at all, and a player in another cell could not
     be named, a typed id being the caller's own figure. Fixed on fork
     m1-console the same night: a teleport the server makes waits for its
     arrival (d99a01fb, docs/verbs/movement-speed.md; x-arrival-probe:
     MoveTo at 1237 units sent back three times of four before, held four
     of four after), and TES3MP's player numbers on mp (Eli: "ok i like
     that... make it so"): `mp list`, `mp tp <n>`, `mp tpto <n>`
     (ec92fcd2, with Skyrim Platform's console fix 89db8732). a-console
     grew both (scenario commit 55e2f42, approved by Eli 2026-10-09). T2 green on
     89db8732 (16 of 16). The merge sweep on fork m1-console 89db8732 went
     29 of 30 green (runs 20261009-072145 to -083936); a-racemenu was red
     once on a figure's head scale after a reconnect (the engine's node at
     1.0 under RaceMenu's recorded 1.6; docs/verbs/racemenu-sync.md, watch
     item) and green on both reruns (20261009-084041, -084413), as the
     RaceMenu leg's sweep was; fork parity fast-forwarded to 89db8732 on
     2026-10-09, both clones' clean-m1 promoted. a-movement-speed's held
     run covered 411 units in it (20261009-072747), back in its old range.
     Playtest twelve's section 2 passed (Eli, 2026-10-09 around noon, on
     parity 89db8732 from his saved world): `player.moveto` and `moveto
     player` landed and held, `mp list` numbered both players, `mp tpto`
     into Whiterun and `mp tp` into the Sleeping Giant, `mp tp` after a
     kill and a resurrect, a player's `mp tp` refused; with sections 1 and
     3 the playtest passed whole. His world is saved as
     playtest-m1-12-20261009T190948Z (`just playtest-restore`).
  4. Exit: doc hygiene (stale Status boxes), the mirror's Formatting
     check (red on m1-console since the light-plugins and ADR-026 code:
     FormDesc.cpp, RaceMenuPresetTest.cpp and PapyrusUtils.h under the
     linter's clang-format, which a local clang-format passes; done: green
     since fork 274c2acd, formatted with the linter's clang-format 21.1.8,
     where the local one is 23), m0-death's observable (Eli,
     M0: done, the knocked-down state), PvE and hosted-NPC reach and angle
     moved to the NPC milestone
     (done: M3), the Moonlight sound fix confirmed (done), one sweep green
     on parity (done: the exit sweep on parity's own image 89db8732, 30 of
     30 green with no rerun, runs 20261009-191424 to -203427; the doc pass
     2026-10-09, thuum 5b73604). M1's exit is met. M2 opens
     with the first ranged hit verb (arrows do not fly; Headshot Kills
     rides it).
  5. M1.1, TCL (Eli, 2026-10-09: "lets do tcl now as m1.1 and then lets
     kick off m2"): the console's ToggleCollision, an admin's, the
     caller's own game toggling its collision as COC moves it
     (docs/verbs/console-commands.md); fork branch m1-tcl from parity
     89db8732. TGM and TIM go to M2. DONE 2026-10-09: x-tcl-probe
     20261009-203554 confirmed it, a-console's TCL check green twice
     (thuum 4382f56, awaiting Eli's review), T2 green, and the merge
     sweep on fork m1-tcl 90294654 went 30 of 30 green with no rerun
     (runs 20261009-210818 to -222623); fork parity fast-forwarded to
     90294654.
- Exit: scenarios `a-*` green including `a-restart-persistence`. Each
  persistence verb since attributes proves its own restart in its own
  scenario (favorites, learned effects, map markers, RaceMenu, actor values,
  light plugins), so a-restart-persistence stays the position, inventory,
  equipment and attributes check.
  Status 2026-10-02: `a-restart-persistence` exists and is green on the
  wire (run 20261002-231256: position, inventory, the equipped weapon as
  the player and the observer see it, and attributes survive a restart); it
  grows with each persistence verb. `a-movement-reject` green (movement
  relay order). Both reviewed by Eli (accepted with the scenario commits up
  to 9e87c65; confirmed 2026-10-04).

### M2: Combat and magic authority (8 to 12 weeks, Class B)

- The M2 chart (2026-10-09, Eli: "lets kick off m2"), after a survey of the
  fork at parity 89db8732 (file and line citations go into each verb's doc
  as it starts). What exists:
  - Melee is the server's: OnHit, the TES5 damage formula, M1's reach,
    cone, flag and sneak rules. Health goes to the victim as a percentage
    of its race's base health, not the player's recorded maximum
    (ActionListener.cpp:1822-1843 against MpActor.cpp:1924-1939). The
    blocked and bash flags are taken as sent, and OnHit has no rate budget.
  - Ranged: a bow shot (PlayerBowShot, sent unreliable though the wire
    contract calls it reliable) removes one arrow on the server and is
    relayed to nobody, and nothing launches an arrow in an observer's game,
    where spells have a launch path (Skyrim Platform's MagicApi.cpp,
    Projectile::Launch): why arrows do not fly. A ranged hit has no range
    check and no link to a shot, and the arrow's own damage is not counted.
  - Magic: casts are relayed (unreliable on the server's side), an
    observer's figure casts its own equipped spell, and a cast's end is one
    message that four steps can lose (playtest six's Flames). Spell damage
    has two paths, the victim's own engine and the server's OnSpellHit,
    possibly both at once (unmeasured), and a spell hit starts no fight.
    Active effects exist on the server in a legacy form (one per actor
    value, restores applied at once, persisted); clients see none, and none
    of Papyrus's magic natives is implemented. A potion is drunk by the
    game and written straight to health by the server; a poison is drunk
    too.
  - Shouts: the voice slot only. Containers (now M4's): one player at a
    time, their changes reach nobody else, no corpse loot.
  The order proposed, each a verb through CLAUDE.md's workflow:
  1. marksman: the shot relayed reliably and launched in observers' games
     (an arrow launch beside MagicApi's spell launch), its aim on the wire,
     the server checking the shot (bow and ammo equipped) and each ranged
     hit against a shot (one hit per arrow, within its flight), the arrow's
     damage counted; the health percentage against the recorded maximum
     and the hit messages' rate budget with it, as the first damage verb.
     Scenario `b-marksman`. Headshot Kills rides it (stretch). DONE
     2026-10-10: with the draw's power as the game has it (the re-analyst's
     read of Projectile::Launch, the lab's measurements: a hit counts at its
     shot's power, an observer's arrow flies at it), b-marksman (thuum
     773716b, awaiting Eli's review) green twice, T2 green, and the merge
     sweep on fork m2-marksman 7be31a9d 31 of 31 green with no rerun (runs
     20261010-090810 to -102926); fork parity fast-forwarded to 7be31a9d and
     both clones' clean-m1 promoted. Eli's rotfern bow quirk (her bow
     staying drawn in first person) is open: no lab run reproduced it, and
     the lab's first-person finding, her released arrow flying past near
     geometry, is a separate one (docs/verbs/marksman.md); playtest
     thirteen separates the causes.
  2. spell-cast: a cast's start and end as server state, relayed reliably,
     the observer's figure casting the spell sent; the victim's own engine
     applying none of a remote spell's damage (the server's OnSpellHit the
     one path); a spell hit starting a fight (ADR-023). Scenario `b-spell`.
     DONE 2026-10-10: a stream counted by the time it held its target
     (each hit the time since the last, at most 250 ms), a fire-and-forget
     cast once, every hit within the spell's projectile range; the
     caster's stop per hand from its own graph, the observer casting the
     relayed spell. The lab found the "stream ends after a second" was the
     draw (x-spell-time), that a figure's spell lands nothing on the player
     it targets, so no second path and no suppression (x-spell-observe), and
     that a bystander sees the figure's stream (x-spell-side). b-spell (thuum
     9ed66b8, awaiting Eli's review) green twice, T2 green, and the merge
     sweep on fork m2-spell 45839102 32 of 32 green with no rerun (runs
     20261010-122057 to -134720); fork parity fast-forwarded to 45839102
     and both clones' clean-m1 promoted.
  3. magic-effects: the server's effects from the records (MGEF read in
     full), magnitude and duration, persisted with their remaining time,
     sent to clients that show them and keep the engine's own application
     out; potions and poisons as effects; Papyrus's ActiveMagicEffect and
     MagicEffect natives as the effects need them. Scenarios `b-potion`
     and the exit's `b-magic-restart`. In the lab (2026-10-10): the
     drinker's engine and the server agree while a drink runs, but both
     gave a fortify back at its end (b-potion left 0.02 of 0.34), so the
     player's engine applies no drink of its own and holds the server's
     buffs (docs/verbs/magic-effects.md, Suppress); effects count on the
     server's wall clock, as ADR-021's game time does. The poison on a
     weapon became a verb of its own (below), blocked on playtest
     thirteen's poison section (CLAUDE.md rule 8). DONE 2026-10-10, merged
     with god-mode: b-potion (thuum bc796d5) and b-magic-restart (ec9dac2),
     both awaiting Eli's review, green twice each, T2 green, and the merge
     sweep on fork m2-god 35acc275 33 of 35 green: a-time had no verdict
     (sky-c1's guest agent down, 20261011-044541) and was green on its
     rerun (-051631); a-melee-reach red once (-042255) and green twice
     (-051934, -052147), a watch item by ADR-027 (docs/verbs/
     melee-reach.md). Fork parity fast-forwarded to 35acc275 and both
     clones' clean-m1 promoted.
  3a. poison: a poison on the weapon in the server's inventory (the hand
     and the charges the playtest shows), a poisoned hit applying it
     through the effect rule and spending a charge, both games agreeing.
     Scenario `b-poison`.
  4. god-mode: TGM and TIM, flags the server's damage and death rules read.
     DONE 2026-10-10: b-god (thuum 189171e, awaiting Eli's review) green
     twice, T2 green, merged with magic-effects in the same sweep (fork
     parity 35acc275).
  5. blocking: the attacker's blocked claim checked against the target's
     recorded block and facing, the shield test fixed, the bash's reach
     (melee reach's carried cases), stagger shown to observers. In flight
     (2026-10-10, fork m2-block): the server decides blocks and their share
     by the engine's own formula and cone (thuum ghidra/notes/
     block-formula.md, confirmed in the lab where measured), the bash backed
     by its start; the stagger moved to 5a. T2 green (2026-10-10, its
     session's declarations from the formula held to the digit), the
     weapon line measured (about 31 percent stopped, the formula's 31.4,
     x-weapon-block-probe 20261011-054315), b-block (thuum 5eebce8,
     awaiting Eli's review) green twice with every server value the
     formula's. DONE 2026-10-11: the merge sweep on fork m2-block
     f828279f went 36 of 36 green with no rerun (runs 20261011-062658 to
     -081239); fork parity fast-forwarded to f828279f and both clones'
     clean-m1 promoted.
  5a. stagger: a bash's or a blocked power attack's stagger imposed on the
     victim's game and shown to observers (the engine's gate and magnitude
     in ghidra/notes/block-formula.md; deathService refuses every figure's
     staggerStart today), the roadmap's "Anims triggered by enemy". Built
     on fork m2-stagger (2026-10-10: the rule, the server's snippet, the
     client native TESModPlatform.Stagger over ID 37710, deathService's
     narrowed refusal; T0 and T2 green). x-stagger-probe 20261011-055806
     confirmed the victim's own game never staggers from a figure's hit,
     the attacker's engine tries to stagger the figure (blanked), and a
     self-started stagger plays and relays. b-stagger (thuum 7431108,
     awaiting Eli's review) green twice on fork 9cfbcff7 (2026-10-11), after
     two fixes the lab found: the server's snippet to the native failed in
     Skyrim Platform (callNative now), and the engine's stagger never
     reaches other screens by itself (the server sends it). DONE
     2026-10-11: T2 green on f321a52f (its session now compares the
     relayed animation message by message), the merge sweep 37 of 37 green
     (b-spell red once and green on both reruns, an ADR-027 watch item);
     fork parity fast-forwarded to f321a52f and both clones' clean-m1
     promoted (docs/verbs/stagger.md).
  6. shouts: words of power and their unlocks as server state (SHOU and
     WOOP read by libespm), the shout cast on spell-cast's path, the
     cooldown the server's; the movement budget measured against Whirlwind
     Sprint and Unrelenting Force (carried from M1). Doc 2026-10-10
     (docs/verbs/shouts.md). x-shout-probe 20261011-060059: a shout fires
     no Skyrim Platform spellCast, so it reaches the server not at all
     today (the hook is open); the console's TeachWord and UnlockWord run
     in the caller's game alone; one word of Whirlwind Sprint (1052 units)
     fits the burst. DONE 2026-10-11: the record (shouts, words
     known and unlocked) is the server's, an admin's console writes it and
     every login teaches it; a shout's cast is reported from the voice
     recovery the game sets at the release and judged against the record
     and the server's own recovery (wire-rules shouts), its damage counted
     against the accepted shout, its hits held for the report; the voice
     slot now reaches the server. b-shout (thuum db6ed77, awaiting Eli's
     review) green twice; T2 green on 3f9e4bc8; the merge sweep 38 of 38 (two
     lab faults on sky-c1, green on their reruns); fork parity
     fast-forwarded to 3f9e4bc8 with playtest thirteen's left-hand cast fix,
     both clones' clean-m1 promoted (docs/verbs/shouts.md).
  7. Lag compensation (Bernier 2001) only if a playtest shows hits refused
     inside M1's slack: positions kept per actor, rewound by the attacker's
     latency.
  8. Exit: `b-duel` and `b-magic-restart`.
  Decisions taken (Eli, 2026-10-09, docs/private/decisions-m2.md): this
  order; ADR-027 and ADR-028 accepted; lag compensation only when a
  playtest shows hits refused that should land; Apocalypse after
  spell-cast and magic-effects, with a small step that gives the server
  its global variables; Headshot Kills with marksman; containers and
  loot to M4 ("looting and containers is way more a dungeon thing than a
  combat thing"). At M1's pace (a verb in two to four sessions) the six
  verbs are about eighteen sessions, with the stretch mods beside them.

- Magic effect system on the server: apply and remove effects with magnitude
  and duration read from ESM records; potions and poisons become effects
  rather than direct attribute writes. Client renders shaders and sounds and
  suppresses the engine's own application. Rung: R0.
- Spells: cast intent from the caster (observe), server resolves, broadcast
  to renderers (impose), suppress local resolution. Shouts with words known
  as server state. Rung: R1 intent, R0 resolution.
  - Carried from M1: whether Whirlwind Sprint's dash and Unrelenting
    Force's knockback fit the movement budget's 2048 burst
    (docs/verbs/movement-speed.md). The dash fits: x-whirlwind-probe
    20261012-072444 measured one word 1548 units and three words 2140,
    the server taking each. The knockback moves its target and waits for
    the push (docs/verbs/shouts.md, a later slice).
  - Apocalypse - Magic of Skyrim 10.2.3 (from the stretch list; Eli,
    2026-10-05: "apocalypse at spells"): records plus 206 vanilla-Papyrus
    scripts, effectively no SKSE. Of its 165 natives, 102 are missing,
    GlobalVariable.GetValue and SetValue the most called, which makes it
    the first verb to need server-owned globals (ADR-021 decision 4); each
    native it calls gets its ledger line. Eli (2026-10-05): most of its
    spells should behave about the same as vanilla ones, so they ride this
    bullet's cast path. The projectile teleport once listed here is not
    Apocalypse's (2026-10-10: no 10.2.3 spell moves its caster to where its
    cast lands; apocrypha found it in Eli's rotfern save, hotkey 7: Lost
    Grimoire's "Teleportation", docs/MODS.md). Its shape still stands for
    any teleport a player casts: the movement-speed budget
    (docs/verbs/movement-speed.md) refuses the jump, so the server takes
    the cast (R1) and allows one jump to the landing point within the
    spell's reach. Apocalypse's own hard cases are Raise Wall (a shared
    wall the server places) and Milestones (five anchors one world shares).
    Scenario `b-apocalypse`: a vanilla-like Apocalypse spell and Raise
    Wall, seen by an observer and blocking him. Placed after
    spell-cast and magic-effects (Eli, 2026-10-09). ADR-029 (accepted
    2026-10-13, Eli: the hybrid) sets its shape: its effect scripts run
    in the caster's game by default (the filter, with Ghostwalk its first
    verb), its globals are each player's (the MCM settings among them)
    but for a world-shared list (the small globals step, where ADR-021's
    deferral ends), and a server-run allowlist of effect scripts grows
    verb by verb, Nature's Balance first (docs/apocalypse-options.md,
    sections 4 and 5).
  - Lost Grimoire 1.6 (Eli, 2026-10-10, from the stretch list; Nexus 4455,
    Fenestrate's version, so his own install matches the server): its
    Teleportation moves the caster to where the cast lands, in the
    caster's own game (an explosion-placed marker, the mod's script). The
    server's part is the cast teleport above: the spell named as a
    teleport, one jump allowed within its reach at its recorded cast.
    LostGrimoire.esp joins the shared mod set and the server's load order.
    Scenario `b-teleport`: c1 casts Teleportation, lands where it aimed and
    stays there on the server and on c2's screen. DONE 2026-10-12, fork
    parity ef3fb03c (docs/verbs/cast-teleport.md): castTeleports names the
    spell with its reach (the lab's 8000 until playtest fourteen's
    farthest cast sets it), a named teleport's cast permits one jump and
    is relayed to nobody, and the client lets the mod's marker script run
    in the caster's game (the Papyrus event filter blanked it); the
    console's AddSpell is the server's. T2 green (the teleports session),
    b-teleport green twice (thuum 52d6195, awaiting Eli's review), the
    merge sweep green; x-whirlwind-probe on the way measured Whirlwind
    Sprint inside the burst. The lostgrimoire layer merged into main.
- Hit registration with lag compensation (rewind by client latency, Bernier
  2001), blocking, marksman aim pitch on the wire, projectile ownership.
  - Carried from M1: melee reach's unmeasured cases, the bash, bare hands
    and the scale across races (docs/verbs/melee-reach.md), and whether a
    power attack reaches by the pick alone (docs/verbs/damage-flags.md);
    each HYPOTHESIS until this verb's lab runs measure it.
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
- God mode and immortality, the console's TGM and TIM (Eli, 2026-10-09,
  out of M1): a flag the server's damage and death rules read, beside the
  game's own god mode for what it computes itself (Debug.setGodMode,
  Skyrim Platform's codegen skyrimPlatform.ts:2457); TIM has no Papyrus
  counterpart, so it is the server's rule alone
  (docs/verbs/console-commands.md).
- Found in playtest six (2026-10-05): a remote player's Flames keeps
  spraying on the observer's screen after the caster stops, damages the
  observer through the observer's own game, and starts no fight. The cast
  stop is not mirrored, and spell damage is the victim's client's today, not
  the server's: both belong to this milestone's spell resolution. Settled by
  spell-cast (DONE 2026-10-10): the stop was lost on the caster's own
  lookup (fixed); a figure's spell lands nothing on the player it targets
  (x-spell-observe 20261010-114556), so the damage was the old server
  counting a whole second of Flames for each of five hit reports a second
  (x-spell-probe), not the observer's own game; spell hits now begin a
  fight (docs/verbs/spell-cast.md).
- Found in playtest fourteen (2026-10-12; Eli's order: the plugin spell's
  fix, poison, the visual fixes, then Apocalypse and headshots):
  - Merged on fork parity c918a7a1 (2026-10-12 22:38, the sweep 39 of 39
    green, T2 green, both clones promoted):
    - CastFactsFor finds a plugin spell's own effect and projectile
      (docs/verbs/spell-cast.md);
    - a figure stands up from a crouch with hands readied
      (docs/verbs/movement-relay.md);
    - difftest reads its sessions with serde-saphyr, since cargo deny's
      RUSTSEC-2024-0449 stopped every pipeline.
  - rotfern.esp carries the Nord's stagger offsets (apocrypha; Eli: "yes
    give her vanilla values").
  - Merged on fork parity 11c126b9 (2026-10-13 05:31: the sweep
    of every scenario on be69bf68, 40 of 40 green, and T2 green on 11c126b9,
    which adds a difftest session change alone; both clones promoted),
    fork m2-visuals on m2-poison:
    - poison: a poison put on the right-hand weapon is the server's to
      carry, run on the target by the next hit and spent (b-poison, thuum
      de09fdc, awaiting Eli's review; docs/verbs/poison.md);
    - the shout's breath on observers (the server relays an accepted
      shout as it resolved it, with the shouter's graph variables and
      facing), and a silent re-teach (a login restores a known word by its
      known flag: Game.TeachWord raised the word-of-power message;
      docs/verbs/shouts.md);
    - a concentration cast's hand animation (the relay sends the graph's
      events in order), a figure placed past 1024 units instead of gliding
      (the teleport's slide), the crouch's resend once a second;
    - dual casting counted per hand (the game runs each hand's stream on
      the target, CONFIRMED by Frida; the server keeps a clock per hand,
      the client keeps a second hand's hit and names its cast; CONFIRMED
      at T3 by x-dual-cast3 on be69bf68; docs/verbs/spell-cast.md);
    - a spell of Self delivery cast on the caster's figure in observers'
      games, so its look shows there (Become Ethereal does; Eli's spell
      visuals, docs/verbs/magic-effects.md);
    - damage another actor deals the player counts only on the server:
      locally it counts nothing (ADR-028), so a figure's shout or spell no
      longer hurts its target twice (docs/verbs/shouts.md).
  - Playtest fifteen (2026-10-13, Eli, on 11c126b9; each verb doc's
    "Playtest fifteen"): passed poison end to end (its trace CONFIRMED the
    game's poisoning under a person's Yes), Fire Breath on the other
    screen with the server's damage alone, the silent relaunch, dual
    casting, the teleport's blink past 15 m, the crouch, stagger both
    ways, TCL and tim. Found: Unrelenting Force never reported by the
    shouter's client (its hits refused, no shout drawn or counted); the
    server's shout recovery without slack (a shout refused 18 ms early);
    a poisoned sword's look lost on the figure and later in its owner's
    hand; no concentration pose on figures; Invisibility's look outliving
    a wait on the figure; Become Ethereal not sparing damage; TCL's
    figure pushed out of the ground; the block-and-stagger look on the
    figure (small). Inconclusive: b-magic-restart's check (the restart
    came after the effect ran out).
  - Next, toward playtest sixteen: Unrelenting Force's report and the
    recovery's slack, the poisoned sword's look, the self-cast slice (the
    server runs a self spell's effects on its caster: Invisibility hidden
    and ended with its time, Become Ethereal spared, Oakflesh's armor;
    wards' absorption), the spell relay sent as the server resolved it
    (fork m2-relay 1aa96a8f, docs/verbs/spell-cast.md), a server-side lab
    command for shouts and words in place of the assist's console; then
    the concentration pose, TCL on observers, the pushes and paralysis
    decided by the server as staggers are (Unrelenting Force's ragdoll),
    the teleport's vanish and appear on observers, then Apocalypse
    (ADR-029, Ghostwalk's filter first) and headshots.
  - In progress, fork m2-fifteen on m2-relay (2026-10-13): shouts
    reported from their own hits when the recovery cannot name them, god
    mode's shouts without recovery, the recovery's skew
    (docs/verbs/shouts.md); the self-cast verb (docs/verbs/self-cast.md:
    a Self spell's effects on the server, Invisibility and Etherealize as
    states, no damage to an ethereal player, a rest running the effects,
    Oakflesh's armor in the damage); the server's console for the lab's
    setup (mp.executeConsoleCommand). The poisoned sword's look did not
    reproduce on the lab (docs/verbs/poison.md); playtest sixteen watches
    for it.
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

Three mods Eli wants working (2026-10-03). They are acceptance cases for
definition of done item 6 and M7's compatibility matrix, not a widening of
the non-goal: each works to the extent the ledger says. Since 2026-10-05
(Eli) each sits in the milestone whose systems it leans on, with its own
scenario there:

- Eli's rotfern race: M1, beside character creation and appearance sync.
- Apocalypse - Magic of Skyrim 10.2.3: M2, under spells.
- Headshot Kills - CIF 1.2: M2, under hit registration, with the first
  ranged hit verb.
- Lost Grimoire 1.6 (Eli, 2026-10-10: "i guess we're rolling in
  lostgrimoire as well"), for its Teleportation, the cast teleport on
  rotfern's hotkey 7 (docs/MODS.md): M2, under spells, beside Apocalypse.

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
  green (approved by Eli, its body-morph addition 952a8e4 too on
  2026-10-08), playtest eight passed. DONE 2026-10-08: on fork parity
  c8b26bf7 after its merge sweep (rotfern and playtest ten with it).

Game versions (ADR-022, Eli, 2026-10-04): thuum supports and tests 1.7.104
and 1.6.1170, one version per lab run (`just lab-run <scenario> [game]`).
Both clones carry a 1.6.1170 folder, built from Steam's own depots for that
build, kept in persist. On sky-c1 it launched through SKSE 2.2.6 and logged
in against the server on 1.6.1170's masters (2026-10-04). The detail,
sources and gaps of the three mods are in docs/MODS.md (apocrypha's
analysis, 2026-10-04); rotfern's own look does not need RaceMenu.


## Entries

### 2026-10-13

- Eli approved the process audit's plan and accepted ADR-030 (the gate sweep at
  the merge, the full sweep nightly, merge trains); the delineation of the
  sessions: core owns the estate's IaC and its pipeline, thuum-mundus plans the
  sky lab's infra, thuum-magnus builds thuum.
- Landed from the audit: the fork's wire-fuzz as one job with the four targets
  side by side (154 s where the matrix took 608) and the Windows client built at
  every milestone branch's push (fork parity a9879bc9); thuum's auto-cancel of
  pending pipelines off; `SESSIONS=tree` for test-proto; lab-api keeps the
  outgoing server log before a run replaces the world and the clients' logs
  after a quiet spell; scenario-gate on main pushes; `just status`; this file.
  Requested of thuum-mundus and core: a second runner slot on sky-ci and
  sky-build (720) powered off so sky-re can stay up during lab runs.
- thuum-magnus: fork m2-fifteen (on m2-relay) staged on the lab toward
  playtest sixteen; x-uf-hold green; x-self-cast's missed Become Ethereal under
  investigation. Its merge runs ADR-030's first gate sweep.

### 2026-10-14

- m2-fifteen (on m2-relay) merged to fork parity 8eb4e78e (2026-10-14T01:03Z, 18:03
  PDT), the first merge through ADR-030's gate and `just verb-merge`. Verbs: shouts
  (Unrelenting Force reported from its own hits when the recovery cannot name it, a
  shout's release with magic readied or a weapon drawn as CombatReady_BreathExhaleShort,
  god mode's shouts without recovery, the recovery's 400 ms skew, the push through the
  server's stagger: a spell's Stagger effect played at its magnitude), self-cast
  (docs/verbs/self-cast.md: a Self spell's effects run on the server, Invisibility
  and Etherealize as states, no damage to an ethereal player, a rest advancing the
  effects, Oakflesh's armor in the damage; b-self-cast c260ff3), spell-cast's relay as
  the server resolved it (m2-relay), and the server-side console call for the lab's
  setup. T2 green on 8eb4e78e at 17:19 PDT, every session identical (the shouts
  session declares the shout's stagger since 8eb4e78e, verified from the tree with
  SESSIONS= before its commit). The gate: run set 20261014-002126-merge-m2-fifteen,
  13 of 13 green with no rerun, 20261014-002126-smoke-two-players to
  20261014-005854-a-racemenu (smoke-two-players, a-restart-persistence, b-shout,
  b-stagger, b-spell, b-self-cast, b-potion, b-magic-restart, b-god, a-console,
  a-movement-speed, a-melee-reach, a-racemenu), 37 min. Both clones' clean-m1-next
  promoted to clean-m1 (the 744fddb0 client; 8eb4e78e changed a session file only).
  verb-merge's first live run found two faults of its own on the way, both fixed on
  main: gate.yaml read with PyYAML, which the Mac's python3 lacks (e1f63a8), and the
  nightly's start condition (24a526c, d7745a8).
- Eli decided B5 of the process audit (2026-10-14, 06:1x UTC, "then yes"): the SteamStub-wrapped
  1.6.1170 exe is unpacked for the Ghidra project, so the re-analyst reads the target version's
  bodies instead of 1.7.104's under shared Address Library ids. The unpack runs inside sky-re
  (Steamless under mono), the file stays under /srv/persist/game beside the pinned exe with its
  checksum line, never in a repo or a registry. How, after thuum-mundus's reading of the tool
  (2026-10-14 06:3x UTC): not under Mono on sky-re (Steamless under Mono writes a corrupt PE
  signature, atom0s/Steamless issue 76, and the CT cannot write beside the pinned exe), but on
  sky-c1, whose clean baseline already holds the 1.6.1170 exe, under a lab hold after the
  nightly: the exe's SHA256 checked against game/SHA256SUMS, Steamless run on the client where
  its runtime is native, the output gated (the PE signature, a clean parse, no .bind section,
  .text entropy below the encrypted level), pulled by `sky-lab client pull` and placed by the
  host; the clone's next rollback (to its newest snapshot, clean-m1-next) removes the tool and
  the file. The import, the analysis proper, runs on sky-re. Steamless is CC BY-NC-ND 4.0:
  private, non-commercial use, never redistributed, no modified build. persist is under
  sanoid's production policy, so the unpacked exe and its log also live in the host's private
  snapshots for the retention period (mundus, 14i): within the license, never off the host,
  and the thing to know if the file ever has to go. With this every item of the audit's plan is decided; A5
  (sky-re always on) landed on Eli's go the afternoon before.
- The first unattended nightly (run set 20261014-103014-nightly, 03:30 to 06:16 PDT): 42
  scenarios, 36 green, none red; at 05:10 sky-c2's passthrough GPU (vfio 0000:01:00.0, the GTX
  1050) fell to D3cold ("Unable to change power state from D3cold to D0", QEMU exit 1) and the
  twelve runs after it ended in E_RUN_NO_HEARTBEAT on c2, so six scenarios never had a real
  attempt (m0-appearance, m0-attributes, m0-death, m0-forge, m0-inventory,
  smoke-two-players). Under ADR-030, by ADR-027's logic (a lab fault is a rerun, never a red),
  the union of the 36 and a green completion set of the six on the same clean-m1-next content
  is the full sweep for the recorder staging's promotion; it runs when mundus has c2 back. The
  sweep's lesson goes into the runner: a set stops, resumable, after two consecutive lab
  faults, so the next hardware fault costs ten minutes, not an hour. The cause, read on the
  host by thuum-mundus (06:27 PDT): a failed D3cold wake at 05:10 left garbage PCIe config on
  the card at 0000:01:00.0 (fenestrate's RTX 5060 Ti on loan to sky-c2; the mapping names are
  swapped), which vfio replayed at every start, so the guest's UEFI hung before Windows; not
  memory. The card was re-enumerated and pinned out of D3cold until the next reboot; the
  durable fix (vfio-pci disable_idle_d3=1) goes to core as IaC. 712 rolled back to
  clean-m1-next and started at 06:27:10, agent up at 32 s.
- B5's unpack ran on sky-c1 at 06:29 PDT under a lab hold, by mundus's gated script: verdict
  PASS (SteamStub Variant 3.1 x64; .text entropy 8.0 in the original, 6.431 unpacked; the
  source and the Steamless zip as pinned), out_sha256
  80c1ea737d33c6bfac09b101b8d77ab0f9f6630128c3ed052f9d945bed54e7e4, 36,950,016 bytes; 711
  shut down cleanly for core's pull and placement. core placed it (06:30: persist/game/
  SkyrimSE-1.6.1170.0.exe.unpacked.exe with its .log sidecar, SHA256SUMS three lines all OK,
  verified again by mundus); 711 rolled back to clean-m1-next and started, the hold released
  at 06:32:57; `just ghidra-import` ran on sky-re 06:32:59 to 06:41 (Analysis succeeded, Save
  succeeded, the same shape as the 1.7.104 import). The section walk on sky-re: the first
  .text 8.000 to 6.431 bits/byte, exactly the wrapped 1.7.104's unencrypted .text; the second
  .text (6,408 bytes, 2.614) never encrypted and unchanged; .bind gone. The Ghidra project now
  holds SkyrimSE-1.6.1170.0.exe.unpacked.exe: the re-analyst reads 1.6.1170 bodies at their own
  addresses from here, and the "read on 1.7.104 under shared ids" caveat ends for new notes.
  B5 done; every item of the process audit's plan is executed.
- The sweep completed: run set 20261014-133332-nightly-completion, the six scenarios the
  nightly never reached, all green on the same clean-m1-next (20261014-133332-m0-appearance to
  -134628-smoke-two-players, 13 min); with the nightly's 36 that is every committed scenario
  green with no red, the full sweep ADR-030 asks before a promotion that is not a verb's merge.
  Both clones' clean-m1-next promoted to clean-m1 at 06:49:32 and 06:50:03 PDT (lab-driver
  adr031-recorder 479b22c with the recorder and solo-start, launch.ps1's solo boot, the
  m2-fifteen client unchanged), clean-m1-next restacked; the lab is thuum-magnus's for the
  m2-push staging.
- m2-push merged to fork parity 4e8aa04c (2026-10-14T17:19Z, 10:19 PDT), the first verb built
  the ADR-031 way and the second merge through `just verb-merge`, this one with no hand on it.
  Verbs: push (docs/verbs/push.md: Unrelenting Force's throw as the engine's own, the server
  imposing the shout's hit in the target's game and the client's Papyrus filter letting the
  spell's VoicePushEffectScript run there, 2fe894e1; the player's AddTarget refusing only
  another actor's Health, Magicka and Stamina value effects, no hit-time dispel of a figure's
  spell, 4e8aa04c, which was the real blocker), the figure animation queue delivering a cast's
  start and release in order (4f13fa50, the concentration pose), and the four-file
  clang-format (83710f05). b-push committed alone (thuum 5b1e0d2), green twice by path before
  the gate. T2 green on 4e8aa04c (19 min, every session identical). The gate: run set
  20261014-161704-merge-m2-push, 20 of 20 green with no rerun (smoke-two-players,
  a-restart-persistence, b-duel, b-push, b-stagger, b-block, b-marksman, b-shout,
  a-sneak-damage, a-hostility, a-fight-end, b-self-cast, b-potion, b-magic-restart,
  b-poison, b-teleport, b-god, a-melee-reach, a-racemenu, b-spell), 58 min. Both clones'
  clean-m1-next promoted to clean-m1 (the 4e8aa04c client with main's driver). Known and
  cosmetic, not a gate item: the queue relays a refused blockStart and SneakStop pair about
  every 130 ms after a stagger.
- m2-hands merged to fork parity 4f74c3e1 (2026-10-14T20:52Z, 13:52 PDT), the third merge
  through `just verb-merge`, untouched. Two client-only commits on 4e8aa04c: the observer's
  view holds a hand's spell start (MRh_, MLh_, DualMagic_ ...Spell...Start) and the events
  behind it until the figure has carried its caster's casting state (IsCastingRight or Left)
  since an earlier frame, at most a second, and the animation queue's cap goes from 8 to 32.
  Why: the relay delivered a cast's start about 290 ms before the casting variables, so the
  figure's graph refused it; playtest fifteen's missing grab-and-push pose, raised again by Eli
  today. Staged by verb-stage (12:13 to 12:30); x-recorder-flames showed the figure taking the
  start and the release in one frame as the engine's own caster does; x-recorder-firebolt is
  still refused, a separate finding. b-spell strengthened (the figure takes the start) and
  committed alone at thuum b04f625, green twice by path. T2 green on 4f74c3e1 (the server
  unchanged). The gate: run set 20261014-195749-merge-m2-hands, 18 of 18 green with no rerun
  (smoke-two-players, a-restart-persistence, b-duel, b-spell, b-self-cast, b-teleport,
  b-magic-restart, b-god, b-push, b-shout, b-stagger, b-block, b-marksman, a-hostility,
  a-fight-end, a-sneak-damage, a-melee-reach, a-racemenu), 50 min. Both clones' clean-m1-next
  promoted to clean-m1 (the 4f74c3e1 client). Next from magnus: m2-flight (the throw's caster
  half: the target's figure flies in the shouter's game), merged with m2-hands, so its merge is
  a fast-forward after its own staging and probe.

### 2026-10-15

- m2-flight merged to fork parity 05192845 (2026-10-15T01:18Z, 18:18 PDT), the fourth merge
  through `just verb-merge`, untouched. On parity 4f74c3e1: 320cfda8 (skyrim-platform: ADR-029
  A1 test 1's caster half, an event on an effect the player cast passes the Papyrus event
  block, so the shouter's game runs the vanilla push on the target's figure and the figure
  flies there), f3569b95 (an invisible figure shows no name), cadb5648 and 05192845 (a figure
  its own game knocked down gets no relayed zero-force re-knock and no movement until its
  get-up; sync/knockState.ts). Probed with lab/frida/push-trace.js: the relayed re-knock gone
  from every trace, the figure flying in the shouter's game in most runs; when the two games'
  flights land far apart the movement relay corrects the figure after its get-up, inherent
  since the engine's own throw distance varies from 503 to 1,405 units run to run. No flight
  assertion committed yet (a largest-step check is defeated by that correction; a track-based
  one comes later); b-push as committed stayed green; x-invisible-name hid the label. T2 green
  on 05192845. The gate: run set 20261015-002043-merge-m2-flight, 20 of 20 green with no rerun
  (smoke-two-players, a-restart-persistence, b-duel, b-push, b-shout, b-spell, b-stagger,
  b-block, b-self-cast, b-teleport, b-magic-restart, b-god, b-marksman, b-poison, b-potion,
  a-hostility, a-fight-end, a-sneak-damage, a-melee-reach, a-racemenu), 53 min. Both clones'
  clean-m1-next promoted to clean-m1 (the 05192845 client). Playtest eighteen next.
- numidium's role, Eli's word (2026-10-14 evening PDT): release and lab operations. Merges on
  thuum-magnus's "go" (`just verb-merge`, `just layer-merge`: the gate's verdict, the
  promotions, the LOG entry and the submodule pin; never whether a verb is done); the lab's
  calendar (holds, the nightly, the order of a night's stagings and sweeps; thuum-mundus keeps
  the lab's infrastructure); the CI operator (retries and cancellations with the api token, a
  runner or route fault diagnosed and handed to core); the process tooling (a workflow scripted
  by hand twice becomes one command). Never the builder's judgment and never Eli's approvals
  (scenarios, ADRs, a non-verb layer he has not seen). The rest of the 2026-10-13 delineation
  stands: core the estate, thuum-mundus the sky lab's infrastructure, thuum-magnus the build.

- Playtest eighteen (19:36 to 19:46 PDT, parity 05192845; world saved
  playtest-m2-18-20261015T024812Z): the flight and the invisible name passed;
  the hands did not (the figure's grab-and-push never stops, a left-hand
  Firebolt's bolt leaves the figure's right hand, a Self cast shows no
  animation), the god-mode breath's fire "sometimes" twice. The night's lab
  (19:55 to 20:56, 24 runs, all green) and a research pass took each to a
  cause: the relay rewrites the cast's exit event (M[LR]h_Equipped_Event) to
  a fake equip, Skyrim Platform's castingSource falls back to the right hand
  when the same spell is in both hands (x-left-firebolt2), a Self or
  fire-and-forget start is taken when the caster's variables arrive first
  and refused when they do not (x-self-anim, x-figure-cast4), and the breath
  was never a rendering matter: shoutService's 3 s hit window swallows a
  second shout in god mode (x-tgm-breath4, the server log). Eli's plan
  (21:00): the cast-action verb (docs/verbs/cast-action.md), the figure
  replaying the caster's actions through the engine's action entry, the
  effect decided apart; melee stays on its event relay; withheld spells show
  their animations; Ghostwalk and the per-player globals wait behind it. On
  main the same night: b-push's flight check (6f90239), the driver's
  delayFrames and globals steps, lab-api's globalValue, three Frida traces,
  pex.py disasm, and the verb docs ghostwalk, player-globals and
  natures-balance; fork branches m2-ghostwalk, m2-player-globals (T0 green),
  m2-breath, m2-firebolt and m2-hands-exit (the last three dead or
  superseded). The Apocalypse layer staged 20:57 to 21:02 (numidium), its
  sweep running at the entry's time.

- The Apocalypse layer (thuum branch apocalypse f84a5d23, main merged in) staged and went red;
  withdrawn (21:03 to 21:36 PDT). `just layer-stage apocalypse` ran clean in five minutes:
  persist-mods, deploy-srv with the spaced name, the m2-flight server restarted on the new load
  order, add-mods on both clones reporting all eight plugins, clean-m1-next "apocalypse layer
  f84a5d23". Then `just layer-merge`'s full sweep (run set 20261015-040243-layer-apocalypse) went
  red on its first three runs (a-activation-reach, a-actor-values, a-character-creation: c1
  connected and never answered), and numidium stopped it: nothing promoted, main not moved. The
  cause is on the client. Skyrim Platform's `ValidateFilename` takes only [0-9A-Za-z._-]
  (skyrim-platform/src/platform_lib/Validators.cpp:3-13) and `getFileInfo` applies it
  (FileInfoApi.cpp:12), so "Apocalypse - Magic of Skyrim.esp" throws and the client's load-order
  check (skymp5-client loadOrderVerificationService.ts) fails in once('update'); c1.log: "'Apocalypse
  - Magic of Skyrim.esp' is not a valid argument for 'filename'". The server took the spaced name
  cleanly. The fix is thuum-magnus's, on fork branch m2-spaced-plugins (spaces allowed in
  getFileInfo; the client's catch). The lab is back on main for the cast-action probes: deploy-srv
  from main 7f8f9836 and the server restarted without Apocalypse; persist-mods from main; each
  clone's layer snapshot deleted, the clone rolled back to clean-m1 (05192845), main's driver laid
  by client-driver (main's lab/driver is 26a7d1a's), clean-m1-next retaken; smoke-two-players green
  on it (20261015-043315). The Apocalypse ESP stays unreferenced in persist's esm directories. The
  retry, once Eli clears the magic animation shape: `verb-stage` of the fix's client, then
  `layer-stage apocalypse`, which now ends in a smoke run with the layer, so a layer that breaks
  the client stops at its staging instead of in the merge's sweep. Ghostwalk, m2-player-globals and
  the cast candidates wait (Eli, 20:30 PDT: the magic animation shape first; the next verb is
  cast-action, docs/verbs/cast-action.md).

- The cast-action verb's engine read and build (21:07 to 22:00 PDT; docs/verbs/cast-action.md).
  The re-analyst read the action path on sky-re (28 minutes, 115 tool calls): TiltedEvolution's
  five numbers are 1.6.1170's own ids, each confirmed by `just addr` (38949 ActorMediator::
  PerformAction, the one entry every BGSAction takes, reached from SourceActionMap::DoAction 34202
  through TESActionData::Process 41557; 38953 its second entry, the tail that performs a data as
  given, no validation, no idle selection, no code caller; 403567 the mediator singleton; 39004 the
  post step both entries call, the ActorState bookkeeping keyed by the event name, not the
  master-behavior variables). The data arrives with its event empty and leaves with the chosen
  idle's event; unk20 is 2 on every engine action and read by nobody; flags bit 0 is the engine's
  dry run. Ghidra names and plate comments saved. Built on fork m2-cast-action 0d69f6fe: the hook
  on 38949 (the player's data only, dry runs and refused calls left out, read at the leave, a
  per-thread stack; the JS event actionPerformed with the variables as they were when the graph was
  asked) and the export performAction(actor, action, idle, eventName, type) through 38953, both
  AE only; its Windows run 38683079932 started 21:44. Thuum cast-action feebd30: the driver keeps
  the player's recent actions with their variables and figure-action replays them on a figure
  ({replay: all} at the original spacing, the recorded variables applied first through
  applyAnimationVariablesToActor); lab/frida/action-trace.js logs 38949, 38953 and the cast-shaped
  events at 32901, the test of the read. The step's name alone went to main (7aa620a) so main's
  lab-api image takes the probes. Twelve ADR-031 references committed alone on main
  (ff74e6c..3381c42: spell-bolt-a/-b, self-invisibility-a, self-oakflesh-a, shout-firebreath-a/-b,
  shout-uf3-a/-b, melee-power-a/-b, melee-swing-b, block-b), each from a solo run's watch-stop with
  its cut and its bandit's id; melee-swing-a and spell-stream-a wait for retakes with combat AI off
  (the bandit's counterattack was in the player's record), r-invisible-prompt for a redo in frame.
  numidium started verb-stage m2-cast-action at 22:00 from the branch's worktree (merge 403fe5c9,
  LABAPI 1533) with the four probes by path, x-figure-action, -bolt, -self, -dual (P1 to P4: c1
  casts, its hook records, c1's driver replays on c2's figure in c1's own game); their reading
  decides between the action replay and the fallback.

- The cast-action verb proved and built (22:28 to 23:15 PDT; docs/verbs/cast-action.md). The four
  probes ran on the staged branch (numidium's verb-stage, with a step-7 fix of its own on the way:
  a fresh worktree lacks the built driver, main 0f46a2d). Two false starts: a frida step right
  before a console step on the same client left the console unopenable (052852, 053059), and the
  figure's own player held no spell, so the figure had no cast transitions and refused every replay
  (053450, 053807 round one). With the figure armed, a same-tick replay was still refused every
  time (054049, 054336, 055039 round one); the caster's variables one update before the action
  (the driver's delayFrames 1) was taken every time: Flames' start and release, the 4 s loop, the
  Interrupt's Equipped exit and the casting state down 196 ms after (055039), Firebolt's start,
  ready and release (055907), Invisibility's Self cast (060152), and the dual cast on a figure
  without the perk (060444), which the engine performs as the left hand's actions carrying the dual
  idle. action-trace.js (055622) confirmed the read live (the event empty on entry and chosen on
  exit, type 2, the replay through 38953) and that key input survives a frida attach. The
  re-analyst's second read found no engine cancel: the same-tick refusal is the graph's one-update
  latency. P1 to P4 hold; the fallback (the figure's own caster) stays unbuilt. Built on fork
  m2-cast-action, in order: 9de6f123 the wire message UpdateAction, MsgType 44 (wire id 52, schema
  14, the branch leaving 05192845 where 43 is last; PlayerGlobals renumbers to 45 when it lands)
  with its validator, fixtures and the C++ and TypeScript types; 303a85d7 the server relay to the
  neighbours but the sender; 965cf222 Skyrim Platform's cast hand from any caster state but kNone
  (eighteen's second finding); 3f8d8f77 the client (ActionSyncService, the view's two-update
  replay, the event relay without the hands' cast events, the held-start logic removed,
  magicSyncService sending only the player's own casts); e3648112 the T2 session. On thuum
  cast-action: b-spell's new assertions (0d44f4b, its own commit: the Equipped exit on the figure,
  the bolt's wind-up). On main: the spell-stream-a reference from its retake with combat AI off
  (060845). Windows build 38690816553 at 23:12; next the staged run of b-spell, p-spell-bolt and
  the left-hand and dual relays, then T2, references, the gate and playtest nineteen.
- m2-cast-action merged to fork parity e75ee5c8 (2026-10-15T08:50Z, 01:50 PDT), through `just verb-merge`
  run from thuum branch cast-action's worktree so the gate judged the branch's driver and b-spell; then
  cast-action landed on main. The verb is the magic animation shape Eli asked to settle before Apocalypse
  (playtest eighteen: the hands' cast never ended, a left-hand Firebolt left the right hand, a Self cast
  showed nothing; docs/verbs/cast-action.md): the figure plays the caster's own actions through the
  engine's action entry (a PerformAction hook and a performAction native, read on sky-re), carried by the
  wire message UpdateAction (44) and the server's relay, replayed one frame after the action (a same-tick
  replay is refused on an armed figure); a cast event's hand is the hand of the player's last action
  (Skyrim Platform, e75ee5c8); every exhale arms the shout gate (the god-mode breath of playtests sixteen
  and eighteen, ea57c551). Readings: x-figure-action, -bolt, -self, -dual and x-action-trace-input green;
  x-left-firebolt2 green with castingSource 0 on both launches in c2's launch trace (20261015-075606; 1 on
  both before e75ee5c8); x-dual-relay and x-tgm-breath4 green; b-spell green with its new assertions (the
  figure's cast ends, a bolt's wind-up shows); p-spell-bolt, ADR-031's first parity scenario, green
  (20261015-080752) against the retaken reference spell-bolt-a, its ten findings in the later list with
  reasons (the target's stagger cascade, which the B reference cannot show yet; the caster's figure's hit,
  ADR-028). T2 green with 26 sessions, the new cast-action session among them (difftest job 6654 at
  e75ee5c8). The gate: run set 20261015-083019-merge-m2-cast-action, 6 of 6 green (smoke-two-players,
  a-restart-persistence, b-duel, b-spell, a-melee-reach, a-racemenu); both clones promoted to the
  e75ee5c8 client. Tooling found on the way, all on main: verb-stage runs from a branch's worktree and
  every probe runs even after a red one; test-proto refuses a difftest artifact older than its branch's
  skymp-wire (the first T2 here passed without the new session); lab-api's parity cut takes a list of
  kinds and seeds a series' baseline from its first sample. Next: the Apocalypse retry, when Eli says.

- cast-action DONE (2026-10-15 01:49 PDT; docs/verbs/cast-action.md, ADR-032). Stage two on ea57c551
  (00:00): b-spell green with its new assertions (065943: the figure's Flames start and release one
  update apart, the Equipped exit 4 s later, Firebolt's start, ready and release, all taken through
  the real relay), x-dual-relay green (070729, the figure 41 ms behind the caster), x-tgm-breath4
  (071021: the 2.5 s breath reported and shown; a god-mode miss with no hit stays unreported, a known
  limit), x-left-firebolt2 (070447) still launching from the right with the state read widened, so
  the hand moved into the action hook itself (fork e75ee5c8, Frida::LastCastHand; 075606: both
  launches from the left), and p-spell-bolt red twice as the parity tool's (the target's own game
  takes no hit, ADR-028, so a "hit" cut had no anchor there; the caster's figure none either; and a
  reference cut at 0 made every variable's first sample a consequence). Tool fixes on main: a cut
  lists kinds tried per view and value:<av> (34c2f3a, test fixed 422abf8, the image by API pipeline
  1555: a lab-api push must have its tests green first), a series' first sample seeds its baseline
  (3470159). References: spell-stream-a (060845) and melee-swing-a (061047) retaken with combat AI
  off, spell-bolt-a retaken because the first take missed (080129). p-spell-bolt green by id on the
  committed file (080752, 5bf1d51, its later list ADR-028's differences, the stagger the B
  reference's Spell.Cast cannot show, the figures' refused idle probes): the first parity scenario
  to pass. The gate (numidium, verb-merge from the cast-action worktree): T2 on the branch image
  with the cast-action session, then run set 20261015-083019, 6 of 6 green (smoke-two-players,
  a-restart-persistence, b-duel, b-spell, a-melee-reach, a-racemenu); parity to e75ee5c8, the
  thuum landing by numidium's report. Playtest nineteen's checklist drafted (the hands whole, the
  left hand, Self and dual casts, the breath). Left for later verbs: the voice's and melee's actions
  (the event relay stays), a mage bandit's B reference for the spell staggers, p-spell-stream
  (drafted; no streaming B yet), the invisible-prompt reading (no vantage yet), the Apocalypse layer
  retry (m2-spaced-plugins), Ghostwalk and the per-player globals, now unblocked.

- Playtest nineteen (2026-10-15 10:36 to 10:45 PDT, parity e75ee5c8; docs/private/playtest-m2-19.md):
  "basically every test only half works". Read from c2's log (251 replays on test 1's figure): the
  casts alternate, one refused whole and the next taken whole, at Eli's rhythm of 400 to 700 ms
  between a cast's exit and the next start; the lab's probes had never cast closer than four
  seconds. Four probes at that rhythm (174811, 175053, 175554, 175846): only the strafing one
  refused, a start 570 ms after a taken exit. Two causes in the view's timing against the graph
  (the want variable left up by the exit's variables, so the next start's want has no rise; the
  start performed one update after its variables whatever the graph's state, where the caster's
  engine waits for the graph's answer) and one regression of the last hand fix (every cast event
  named with the latest start's hand, so both hands casting the same spell separately streamed from
  one hand). Fixed on fork m2-cast-action: c7d49cc0 one pending start per hand, 867f0ac8 the want
  dropped after an exit and before a start, the snapshot off a figure's casting booleans, abe44a55
  a refused action retried for up to fifteen updates. Eli's word on the term: "dual casting" is two
  things, both hands separately (A) and the perk's (B); the probes had covered B. The stage of
  abe44a55 with x-cast-twice-fast, x-both-hands-relay, x-left-firebolt2 and b-spell, then the gate
  and nineteen again; the Apocalypse retry parked behind it (numidium). Eli's world saved as
  playtest-m2-19-20261015T174737Z. docs/verbs/cast-action.md's T3 box reopened.
- m2-cast-action merged again, playtest nineteen's fix, to fork parity abe44a55 (2026-10-15T20:05Z, 13:05
  PDT), through `just verb-merge` from thuum branch cast-action-2's worktree, which then landed on main.
  Playtest nineteen ("every test only half works"): the figure took every other cast at Eli's rhythm
  (400 to 700 ms between casts; the lab had never cast twice closer than 4 s), and two hands casting
  separately streamed from one. The fix, three commits on parity e75ee5c8: one pending cast start per hand
  (c7d49cc0); the figure's want variable falls with its exit and rises for every start, and the snapshot
  leaves a figure's casting bits alone (867f0ac8); a refused action is tried again, variables then
  action, for up to fifteen updates (abe44a55), since the graph may still be finishing its exit (the
  strafing probe x-cast-twice-move 175846 refused a start with the want rising). Probes on abe44a55, all
  green: x-cast-twice-fast 184857, x-both-hands-relay 185138, x-left-firebolt2 185440 (castingSource 0 on
  both launches), b-spell 185722. Under ADR-033 the gate ran the rhythm as scenarios, committed alone on
  cast-action-2: b-cast-rhythm (eight Flames casts 0.4 s apart, every start, release and exit taken on the
  figure) and b-cast-both-hands (three starts and exits per hand). The first gate (run set
  20261015-192503) went red on b-cast-rhythm alone because of the scenario: one assertion read the
  caster's figure in its own game, c1.watched(c1), which is always 0. thuum-magnus dropped it (5e126a9,
  for Eli's review: the claim stands on the figure's three checks, since eight starts on c2's figure need
  eight casts by c1), and that set was stopped with 5 green. The gate again, with T2 skipped since T2 was
  green on abe44a55 at 12:25: run set 20261015-194205-merge-m2-cast-action, 8 of 8 green (smoke-two-players,
  a-restart-persistence, b-duel, b-spell, b-cast-rhythm 195257, b-cast-both-hands 195533, a-melee-reach,
  a-racemenu). Both clones promoted to the abe44a55 client. Also this cycle, ADR-033's tooling on main:
  the parity diff counts (5ded43ae), `just playtest-record` (b9f9ad31, c2c54bb0). Next: playtest
  nineteen again, recorded into results/playtest-19-2.

- cast-action's second merge (2026-10-15 13:04 PDT; docs/verbs/cast-action.md, ADR-033). The fixes for
  nineteen's half on fork m2-cast-action (c7d49cc0 one pending cast start per hand; 867f0ac8 the want
  variable dropped after an exit and before a start, the snapshot off a figure's casting booleans;
  abe44a55 a refused action retried up to fifteen updates) staged at 11:49 and probed: x-cast-twice-fast
  184857 24 of 24 (no retry fired), x-both-hands-relay 185138 (both hands' casts and both streams),
  x-left-firebolt2 185440 (the left hand kept), b-spell 185722. ADR-033 accepted and written (a verb is
  proved over its sequences and combinations; a playtest is recorded): numidium landed parity counts
  (5ded43ae) and `just playtest-record <n>` (b9f9ad31, c2c54bb0) the same hour; the two probes became
  gate scenarios on thuum branch cast-action-2 (b-cast-rhythm 8107fb8, b-cast-both-hands 95c1630; one
  assertion of the first dropped, 5e126a9: the caster's own record is watched_self, not watched(c1)).
  The gate (numidium, verb-merge from cast-action-2): the first set 5 green and 1 red on that
  assertion, stopped; the rerun 194205, 8 of 8 green (smoke-two-players, a-restart-persistence,
  b-duel, b-spell, b-cast-rhythm 195257, b-cast-both-hands, a-melee-reach, a-racemenu). Parity to
  abe44a55 and the thuum landing by numidium's report; nineteen's second session next, recorded.
- A correction to commit 1dc55906's message (build-client by commit): its example is wrong. The hand restage
  that laid 0ce34196 over abe44a55 (2026-10-15 14:2x) did not go through build-client; thuum-magnus ran a
  by-id `gh run download` into a dist folder an earlier stage had left full, it stopped on "file exists",
  and the restage went on with the old folder until client-dist's DLL hash showed it. The fix stands on
  its own: without a commit, build-client takes the branch's newest successful build (0ce34196 for
  m2-cast-action then, checked), which a stage of an older head would have laid the same way;
  `just build-client <branch> <sha>` clears the folder, downloads by commit and prints what it got.
- Playtest nineteen's second session (13:13 to 13:18, abe44a55, recorded as playtest-19-2): Eli's
  reading "reliability is almost every other cast. improved, but not perfect": Flames, Invisibility
  and the perk's dual cast about half, Firebolt almost every time, the streams right in number and
  placement, the breath about half. c2's log: the figure's Flames casts refused and taken in strict
  alternation (eight of eight after a taken exit refused at 534 to 1334 ms, every one after a
  refused cast taken at 183 to 553 ms); Firebolt 20 of 24. Read first as a 1.5 s window after a
  taken exit (x-cast-human 202506, strafing and turning, agreed: 1394 and 1469 ms refused, 1683 and
  1817 taken). Two fork pushes chased it: 0ce34196 performed the action synchronously inside the JS
  update so the view's retry could read the graph's answer, and HUNG the game at the first replay
  on its stage (x-cast-gap 211105, x-cast-human 211518: the action's graph event re-entered Skyrim
  Platform's sendAnimationEvent hook, a JS call from within a JS call); caff3e04 put the perform
  back on the game-thread queue (drained right after the JS tick) with performActionResult read
  on the next update, and carries 6a7fdd52, the log sink that reopens its file after a failed
  write (numidium's stopped-log chase: InitLog flushes every line, so one failed fwrite leaving
  the CRT's error flag set is the mechanism that fits; the trigger is still in the guest, the
  recorder now captures handle64 and Defender's events live). The window itself was WITHDRAWN by
  two abe44a55 probes with lab/frida/figure-cast-trace.js (the figure's graph events with the
  graph's answer, its own caster's calls, the action entries, the begin-cast handlers): x-cast-gap
  213755 standing still took 17 of 17 starts through the relay at every gap from 513 to 2651 ms,
  each 4 to 7 ms after the figure's graph answered the want variable's rise with BeginCastRight
  (34 of 34 rises answered, FinishCast from the interrupt message 33 to 54 ms before every exit
  and harmless); x-cast-replay-gap 214106 (the driver's replay, no relay) refused 5 of 6 starts in
  the graph itself because that replay never drops the want, so the graph gets no rise. The fault,
  then: the view performed a start one update after its variables, a timer, where the engine's
  caster waits for the graph's answer; a still figure answers within a frame, a moving one later,
  and nineteen's seats move. The fix is the engine's own handshake on the figure, fork 34bdf0c3:
  a hook on the three spell-cast response handlers' ExecuteHandler (vtables from CommonLib's
  Offsets_VTABLE.h, slot 1 per IHandlerFunctor.h) records each BeginCast for a non-player actor,
  castReady(actor, hand) takes it, formView performs a start only on it (a second without one and
  the want rises again, twice, then the start goes as before). Eli's directions today: name which
  dual casting is meant (A, both hands separately; B, the perk's, its own animation; B rides the
  action data's idle and needs no perk on the figure, its effect multiplier waits for server-owned
  perks); spin up agents for reads and scripts to save context (the probe readings, the Moonlight
  times from the Mac's unified log, the trace script were theirs); and, at 14:5x, stop juggling
  the lab: from then numidium runs stages, probes and builds (caff3e04 staged 15:05, 34bdf0c3
  chained behind its probes) and thuum-magnus writes the fix and reads results. Lab lessons of
  the hand restage (lab/frida/figure-cast-trace.js committed 8a79b33, the red row 0852f7f): a
  scenario's frida step reads only the deployed lab tree, uploads serve `just frida` attaches;
  verb-stage from a worktree needs FORK_DIR; a by-id `gh run download` into a full folder stops on
  "file exists" and a background task hides it, so check the DLL hash before client-dist; the Bash
  tool's ten-minute cap kills a stage run through it.

### 2026-10-16

- m2-cast-action-retry merged to fork parity caff3e04 (2026-10-16T00:34Z, 17:34 PDT), through `just
  verb-merge` run from thuum branch cast-action-2's worktree so the gate judged its b-cast-moving and
  b-cast-dual; then cast-action-2 landed on main. The merge carries playtest nineteen's moving case by a
  retry, not by the handshake: 0ce34196 (performAction returns the graph's answer, so the view tries a
  refused start again with a fresh rise), caff3e04 (the perform back on the game thread's queue, drained
  right after the JS tick, its answer read on the next update; performed inside the JS update, 0ce34196
  hung c2 at the first replay) and 6a7fdd52 (Skyrim Platform's log sink reopens its file after a failed
  write). Readings, caff3e04 staged twice: as m2-cast-action at 15:05, x-cast-human 20261015-221432 green
  with 6 of 6 starts taken while both seats strafe and turn (asks per start 1, 1, 1, 2, 6, 2), x-cast-gap
  221733, b-spell 222044, b-cast-rhythm 222326 and b-cast-both-hands 222607 green; as its own branch at
  16:01, once m2-cast-action had moved on to the handshake, b-cast-moving 20261015-233639 green (6 of 6,
  asks 1, 1, 1, 2, 5, 4, the slowest taken 267 ms after its first ask) and b-cast-dual 233941 green. T2
  green with 26 sessions, cast-action's among them (difftest job 6833 at caff3e04). The gate: run set
  20261016-000313-merge-m2-cast-action-retry, 10 of 10 green (smoke-two-players, a-restart-persistence,
  b-duel, b-cast-moving 001226, b-cast-dual, b-spell, b-cast-rhythm, b-cast-both-hands, a-melee-reach,
  a-racemenu); both clones promoted to the caff3e04 client. Not in this merge: the engine's handshake
  (castReady on the three spell-cast response handlers), which docs/verbs/cast-action.md names as the
  moving row's fix. 34bdf0c3 hung and then crashed c2 (a first-chance access violation in
  SkyrimPlatformImpl.dll reading the low half of a stack address, a truncated pointer); its replacement,
  5df863fd on m2-cast-action (typed vtable swaps), is staged after playtest nineteen's third session.
  Main gains b-cast-moving (1bdd23e), b-cast-dual (d82b6d2), lab/frida/figure-cast-trace.js and the
  doc's afternoon text (416e04f).
- Correction to the stopped-log finding of playtest nineteen (numidium; 3d0ee21's and 6087069's messages,
  6a7fdd52's premise): the Skyrim Platform log never stopped. What writes a seat's log during play is its
  game replaying the other seat's spell actions (cast-action's performAction lines with their onResult and
  latent-callback lines); a seat's own casts and moves write nothing to its own log. The recorder's rule
  counted the seat's own events after the log's last line, so every "stop" it reported was a quiet log.
  Judged by the other seat's spell actions: in session two, c1's last spell action was 13:18:01.325 and c2's
  last line, its replay, 13:18:01.443, and c2 made no spell action in that cycle, so c1's log had nothing to
  hold; in session three (17:38 to 18:02 PDT, results/playtest-19-3), c1's last action of any kind was
  17:56:35 with c2's log to 17:56:47, c2's last 17:56:54 with c1's log to 17:57:21, and both logs had
  silences of about 330 s mid-session that ended with the next spell actions; in session one, c2's log
  replays c1's Self casts to 10:41:12 (shouts are not replayed). Session three's live capture
  (capture-c1-5.txt) found the game alone holding the file and no Defender or Application event, which fits.
  lab/tools/log-stop.py now judges a log by the other seat's spell actions after its last line (2 s for the
  replay, counted only in cycles where the seat's own trace shows a figure), and the recorder's live check
  does the same per cycle once both seats' traces are in; lab/tests/test_log_stop.py. Replayed on session
  three's traces: no finding on either log, and a finding on c2's log cut at 17:50 (50 spell actions of c1
  after its last line at 17:45:23). 6a7fdd52's sink reopen is harmless and stays.
- m2-cast-action 5df863fd (the handshake as typed vtable swaps on the three spell-cast response handlers) staged
  18:09 to 18:39 PDT from main and withdrawn: the figure's starts wait for castReady and none ever came. Readings on
  c2, the observer (scratchpad cast-readings.py): x-cast-human 20261016-011836 took 0 of 1 start (9 asks about 3.1 s
  apart, then no later start; caff3e04 took 6 of 6 on the same probe), x-cast-gap 012117 1 of 2, b-cast-moving 012428
  red 1 of 2, b-cast-dual 012709 red 0 of 1, b-spell 012940 red 0 of 1, b-cast-rhythm 013353 red 2 of 3,
  b-cast-both-hands 013624 red with 5 of 5 starts taken at the first ask (its red lies elsewhere); no castReady line in
  any run, no hang, no crash. magnus's slot-probe.js on c2's 5df863fd game (18:39): slot 1 of the left, right and voice
  spell-cast handler vtables points into skse64_1_6_1170.dll (+0xd800, +0xd760, +0xd930), not into
  SkyrimPlatformImpl.dll or SkyrimSE.exe; the response dispatcher hands BeginCastRight to the figure about once a
  second while the view re-raises its want (15 lines from two Flames holds by assist), and x-cast-gap's
  figure-cast-trace has 46 beginCastRight calls, each from skse64_1_6_1170.dll+0xd7e6. So the graph answers and SKSE's
  own function owns the slot; the swap's thunk was never in the chain (magnus: the handshake stands, the hook's point
  was wrong). The event SKSE's thunk exists for is in CommonLib: SKSE::ActionEvent (include/SKSE/Events.h:37-67,
  kSpellCast and kVoiceCast with a slot) through SKSE::GetActionEventSource (include/SKSE/API.h:31); magnus's
  a930968b listens there with no vtable write, and a start waits four updates at most before caff3e04's timing
  (1de955e6). The lab went back to parity caff3e04 at 18:49 (server tag parity-caff3e04, both clones' clean-m1-next
  retaken from clean-m1 with main's driver; smoke-two-players 20261016-014644 green), and a930968b is staged over it
  with the same seven runs, the lab returned to parity after them for the 03:30 nightly. Also run tonight on
  caff3e04 for Eli's notes from playtest nineteen's third session (17:36 to 18:02, recorded into
  results/playtest-19-3, world playtest-m2-19-3-20261016T010249Z): b-marksman 20261016-010247 green (c2's game shows
  c1's arrows, 2633 units against c1's own 2555 at a full draw, 1328 against 1445 at a half; the playtest's five shots
  were the same Long Bow and iron arrows, every one taken by the server), and x-tgm-breath4 010539 green (breaths one
  to three drawn on c2, each cone 0 to 3 emitters of 20, so the emitter cap is not the missing fire; the fourth, the
  control, came while c2 was dead from the third, hit nothing and never reached the server, so it was never relayed).
- Playtest nineteen's third session (17:42 to 17:57 PDT, parity caff3e04, recorded playtest-19-3,
  world playtest-m2-19-3-20261016T010249Z): every Flames, Firebolt, Invisibility and dual item
  ticked, the first time since eighteen; the hands hold at T4 on the retry alone. c1's first game of
  the session exited silently at 17:38:42, 15 s after its stream opened and 3 s after the recorder's
  watch-start, no crash or hang report; relaunched at 17:41:39 and fine after (one stream per seat,
  opened by thuum-magnus alone, the time noted). Eli's findings and the recording's reading (an
  agent over the traces and server.log): rotfern's arrows "not visible on test 2" were there (eight
  of eleven struck the same object in both games, 22 to 43 ms apart; b-marksman 010247 green on the
  same build), leaving from the figure's hand along its facing where his own left along the
  crosshair; Eli's requirement follows, the arrow's path identical on both screens (report the
  engine's launch, origin and angles and power, replay exactly, the server checking the origin at
  the shooter; a parity scenario). The god-mode second breath "not fixed": 13 of his 18 releases
  never reached the server, including every second breath within three seconds; caff3e04's
  shoutService reports a release only from a hit when the voice recovery reads zero, and breaths
  that hit nobody are never reported (x-tgm-breath4 010539 agrees, its control confounded by c2's
  death); the fix is the one the verb doc names, the release reported from the engine's voice cast.
  Recasting Invisibility while invisible "made me visible on the other screen": the recording has
  only test 2 recasting, 13 times, each arriving on test 1's screen as the server's end and a fresh
  effect 60 to 81 ms later; a probe with screenshots next. A Flames stream aimed straight up shows
  forward on the other screen (the damage goes up): the figure's stream ignores pitch; a probe next.
  The handshake chase after the session: 5df863fd's vtable swap never fired (seven runs, no
  castReady, the view's three-second fallback then refused); the re-analyst read the path (the
  dispatcher 38447 calls the handler's slot 1, which is 42820 and kin, the only way in) and
  slot-probe.js on the running game found SKSE's own function in that slot (skse64+0xd760 and kin,
  its action events), over any plugin's write; a930968b reads the answer from SKSE::ActionEvent
  (kSpellCast, kVoiceCast) with a sink at kDataLoaded and waits four updates at most before
  caff3e04's timing (1de955e6); staged tonight by numidium over the restored parity, the lab back
  on parity before the nightly. Eli's direction at 14:5x stands: numidium runs the lab, thuum-magnus
  writes the fix and reads the results. The order before Apocalypse: the breath report, the
  invisibility probe, the stream pitch, the arrow-path parity, the handshake's landing, the two
  open cast-action rows (an interrupted cast; both seats casting at each other); then the layer
  retry on Eli's word, player-globals renumbered, Ghostwalk.
- m2-cast-action merged to fork parity a930968b (2026-10-16T03:30Z, 20:30 PDT) through `just verb-merge` from
  main 44f59cf5, on magnus's conditional go (the seven stage runs green first): the engine's handshake for a figure's
  cast start. The answer comes from SKSE's action events: a BSTEventSink on SKSE::GetActionEventSource()
  (CommonLibSSE-NG include/SKSE/API.h:31, include/SKSE/Events.h:37-67), registered at kDataLoaded, notes kSpellCast
  (left or right) and kVoiceCast for every actor but the player, and castReady(actor, hand) takes it; a start waits four
  updates at most for it, then goes with caff3e04's timing and retry (1de955e6). No vtable write: 5df863fd's swap never
  sat in the chain, since SKSE's own function owns slot 1 of the spell-cast handler vtables. The stage (18:49 to 19:41)
  took 49 of 49 starts on the figure (45 at the first ask, 4 at the second), castReady 1 to 2 ms before every taken
  start: x-cast-human 20261016-021749 6 of 6, x-cast-gap 022241 17 of 17, b-cast-moving 022553 6 of 6, b-cast-dual
  022834 4 of 4, b-spell 023116 2 of 2, b-cast-rhythm 023357 8 of 8, b-cast-both-hands 023628 6 of 6. T2 green with 26
  sessions, cast-action's among them (difftest job 6654). The gate: run set 20261016-030133-merge-m2-cast-action, 10
  of 10 green (smoke-two-players, a-restart-persistence, b-duel, b-cast-moving 031001, b-cast-dual 031244, b-spell
  031528, b-cast-rhythm 031805, b-cast-both-hands, a-melee-reach, a-racemenu); both clones promoted to the a930968b
  client. The 03:30 nightly judges this parity; the verb doc's merge line and the SKSE-events decision are magnus's for
  the morning.
- m2-arrow-path merged to fork parity 0636f14e (2026-10-16T15:09Z, 08:09 PDT) through `just verb-merge` from thuum
  branch lab-launches with main merged, on magnus's go. It carries:
  - the arrow's path identical on both screens: the shooter's first-update flight, after the engine's auto-aim, is
    sent with the shot (PlayerBowShot and ArrowShot gain has_launch, origin and the launch angles, wire schema 16, the
    validator in the same commit; the server refuses an origin more than 512 units from its shooter, E_SHOT_ORIGIN),
    and the figure's arrow is launched there through LaunchArrowAt, now declared in the shipped TESModPlatform.pex
    (2d983dd0's b-marksman 130329 was red without it: no figure arrow on c2);
  - a figure's stream following its player's pitch (setActorAimPitch);
  - the Invisibility recast fix: a cast ends concealment except the archetype it carries, and a bow release or an
    activation ends it as the engine does;
  - 35a3975f's breath report at the engine's voice fire. It sends nothing for a breath into empty air (x-tgm-breath6
    20261016-135744: one server line for five breaths, one cone on c2); its fix is fork m2-breath-launch.
  Readings on 0636f14e's stage: b-marksman 134247 green (full draw 2680 own, 2898 on c2; half 1508 and 1477);
  x-arrow-path 134528 flights 10 of 10 paired at 0.0 units and 0.00 degrees, the Launch entries differing by up to
  11.5 degrees of pitch before auto-aim; x-invis-recast 135452 the figure invisible through the recast, no "acts:
  ... end" line (parity's 124840 showed it visible from the recast on); x-cast-interrupt 134830: no exit reaches a
  figure after its caster's sheathe, its cast up about 5 s longer (the fix also rides m2-breath-launch). T2 green
  with 26 sessions (difftest job 6949). The gate: run set 20261016-142307-merge-m2-arrow-path, 16 of 16 green
  (smoke-two-players, a-restart-persistence, b-duel, b-marksman, b-arrow-path, the cast five, b-cast-crossfire,
  b-self-cast, b-shout, b-invis-recast, a-melee-reach, a-racemenu). b-arrow-path and b-invis-recast are the first
  gates to assert with lab-api's flights_match and drops (main 7130921e, 2cfdf2fa). Both clones promoted to the
  0636f14e client. Main gains lab-launches: the recorder's launches, flights and av: watch bools, and the scenarios
  b-cast-crossfire, b-arrow-path and b-invis-recast.
- m2-breath-launch merged to fork parity 84db2c4e (2026-10-16T18:07Z, 11:07 PDT) through `just verb-merge` from thuum
  branch lab-launches with main merged. The merge was decided on its stage's readings against thuum-magnus's
  criteria. It carries:
  - the shout reported from the player's own voice projectile launch of one of the equipped shout's variation
    spells: SKSE's voice-fire event names the shout, not the spell, which is why 35a3975f's report sent nothing;
  - the sheathe and redraw on a figure: a sheathed caster's figure drops its pending ready, release and exit
    actions, and the relayed sheathe flag forces the drawn state for one second, then the caster's movement
    decides. Before, the relayed SkympFakeUnequip stayed the figure's last animation, held it sheathed against
    the redraw (an engine action, Magic_Equip, with no graph event), and the figure refused every cast until a
    stagger re-equipped it.
  Readings on 84db2c4e's stage:
  - x-tgm-breath6 20261016-162045: five server shout lines and five figure launches for five breaths into empty
    air. 0636f14e gave one of five.
  - x-tgm-breath5 162436: five of five. b-shout 162818 green.
  - x-cast-interrupt 163330, the three sheathes: the figure's cast ends 28, 56 and 60 ms before c1's, once the two
    watches' 125 ms offset is taken out. Casts 2 and 3 start on the figure (5 of 5 starts taken, castReady 8).
    Each redraw reaches it within about 40 ms (Magic_Equip 4773, 10499, 16233 against c1's 4868, 10585, 16319).
    Ready refusals fell from 64 on 0636f14e to 2.
  - Still open, the stagger attempt: the figure's cast breaks at its own stagger, rises again and stays up about
    1.6 s past c1's release.
  T2 green with 26 sessions (difftest job 7042). The gate: run set 20261016-170039-merge-m2-breath-launch, 16 of 16
  green (smoke-two-players, a-restart-persistence, b-duel, b-shout, b-shout-repeat, b-self-cast, the cast five,
  b-cast-crossfire, b-invis-recast, b-arrow-path, a-melee-reach, a-racemenu). b-shout-repeat, the breath row,
  asserts with lab-api's launched(). Both clones promoted to the 84db2c4e client.
  Lab note: from 84db2c4e's stage on, a run's client rollback takes 142 to 264 s against 73 to 75 s on 5474291f.
  Both are cold snapshots, and the launcher shows no retry, so the cause is not found yet.
- m2-spaced-on-21 merged to fork parity 4a2b386b (2026-10-16T22:38Z, 15:38 PDT) through `just verb-merge` from main
  8aa07cac, on thuum-magnus's go. The head is m2-twenty-one e15770fb with m2-spaced-plugins merged in, magnus's offer,
  taken so one stage and one gate carry both. It carries:
  - the same character logging in again with the same look is neither reset nor reloaded (e15770fb,
    docs/verbs/racemenu-sync.md, playtest twenty);
  - twenty's first fixes (3d9129e9, with 457817d7 and 3486b2f1 putting back what its clang-format pass changed): an
    invisible figure's crosshair prompt hidden through ExtraFlags kBlockActivateText (Eli: "yes hide it"; HYPOTHESIS
    still, since the probe's crosshair never lay on the figure); the latent-call log naming its native, the first three
    calls of each and every 1000th (playtest twenty had 19,889 unnamed pairs in 16 minutes on c2); and the latent
    SetWeaponDrawnMode asked only on a change of the wanted draw state or after a second;
  - a plugin file name may hold spaces (m2-spaced-plugins 3ff99181): Skyrim Platform's ValidateFilename refused
    `Apocalypse - Magic of Skyrim.esp`, the red of the Apocalypse layer's first gate (2026-10-14).
  Readings on e15770fb's stage (12:37 to 12:54 PDT):
  - x-invis-recast 20261016-193722, a-racemenu 194014, a-character-creation 194345, b-cast-moving 194606 and
    b-self-cast 194858 green.
  - The rotfern probe on the playtest-twenty world, node scales through playtest-step. After the world's restore,
    which logs the running games in again (A at login, B 30 s later), c1's own skeleton stood at 1.0 where her race
    scales Root 0.6, Pelvis 0.72, Spine 0.83, Spine1 0.89 and Spine2 1.10, while c2's figure of her was right. After
    c1's relaunch (C) both were right. So e15770fb does not cover a login as another character inside one game;
    `just playtest-restore` now relaunches both seats after the restore (main 8aa07cac), and the character switch
    stays open for a code fix.
  T2 green with 26 sessions (difftest job 7154). The gate: run set 20261016-215533-merge-m2-spaced-on-21, 14 of 14
  green (smoke-two-players, a-restart-persistence, b-duel, a-racemenu, a-character-creation, b-self-cast,
  b-invis-recast, the cast five, b-cast-crossfire, a-melee-reach). Both clones promoted to the 4a2b386b client.
  Also staged today and not merged: fork m2-teleport-look 2540be96 from thuum branch teleport-look, for the
  teleport's look on other screens; its readings went to the verb doc, and the look moves to the main line as
  m2-teleport-look-main.
  Lab notes:
  - The slow client rollback of the entry above followed one disk image, not a build. It was sky-c2's clean-m1-next
    from 84db2c4e's stage (16:19Z), promoted to clean-m1 by that merge. That image added 65 to 70 s between the guest
    agent's answer and the game's start, while c1 stayed at its usual time. It ended at the next retake (e15770fb's
    stage, 19:37Z); this gate's rollbacks took 63 to 87 s.
  - Snapshots follow a clean ACPI shutdown (lab-api proxmox.py snapshot_clone), so some state saved in that image
    replayed at every boot. Which state, Steam or a Windows task, is still unread; the clone's C:\sky-lab\launch.log
    holds the timings.
  - On teleport-look's stage, b-cast-moving 20261016-203757 timed out on c2's first console step after c2's game
    logged nothing past PostLoadGame, a load freeze. Its rerun was green (204406).

### 2026-10-17

- The Apocalypse layer merged to main 5160fb8c (2026-10-17T01:40Z, 18:40 PDT on 10-16) through `just layer-merge`, on
  Eli's "yes please retry" (relayed by thuum-magnus at 13:58 PDT). Thuum branch apocalypse b3f6d602 (088bf901 with main
  674ef33) on fork parity 4a2b386b, whose Skyrim Platform takes a spaced plugin name (m2-spaced-plugins 3ff99181).
  - Plugins: `Apocalypse - Magic of Skyrim.esp` after LostGrimoire.esp in both server-settings load orders, so Lost
    Grimoire keeps its 0x0B index and Teleportation stays 0x0B0A86DF. persist-mods placed it and client-mods laid it on
    both clones (6 files fetched on each). Ghostwalk, Apocalypse's first verb, does not ride with it.
  - The staging: layer-stage clean in about 7 minutes. Its load check, smoke-two-players with the layer, went green
    (20261016-224453); that is the check the layer's first gate failed on 2026-10-14.
  - The gate is the full sweep on one staging, in two run sets:
    - 20261016-224726-layer-apocalypse: 14 green, then sky-c2's GPU dropped at a slot reset (lab notes). a-movement-reject
      232344 went red: c2's game ran at under one frame a second (3 watch frames in 6.7 s against about 260) and saw no
      player figure. a-racemenu 233318 and its rerun, and a-rest 233920, were lab faults. The set was stopped by hand
      and then ended by the hold.
    - Its rest, 20261016-234932-layer-apocalypse: 39 of 39 green (a-movement-reject 234932 to t2-fakeclient-restart
      20261017-013849), through runset.sh RUNSET_AFTER and layer-merge.sh GATE_AFTER (main 55253f9 and 452db6a), so the
      14 greens were not rerun on the same image.
  - Both clones promoted to the layer: clean-m1 is the 4a2b386b client with Apocalypse.
  Lab notes:
  - A known lab fault, not a test result: sky-c2 can drop its GPU at a slot reset. thuum-mundus traced both incidents
    (2026-10-14, and today from 16:24 to 16:33 PDT) to a link that fails to retrain after a vfio reset ("Data Link
    Layer Link Active not set"). vfio then finds the BARs wiped, and a later start meets an inaccessible card, which the
    kernel names D3cold, so the 10-14 pins could not prevent it.
  - Each lab-api rollback resets the slot twice, and about one reset in a few hundred fails. The recovery is mundus's:
    a remove and rescan under root port 00:01.1 (16:43), then one controlled start (16:45: agent in 16 s, the game
    running 84 s after logon). A retry is another reset, so a run set is stopped at the first failed start. The levers
    are Eli's: the root port tops out at 8 GT/s for a Gen5 card (a BIOS cap or a riser), and the card is a loan.
  - The sweep found a server crash under a green run. 20261016-233122-a-movement-speed's server aborted (libstdc++'s
    bounds assertion in a vector of optional time points, signal 6) when c2's leftover game reconnected without an
    actor and then logged in. thuum-magnus traced it to OnHostAttempt writing lastMovUpdateByIdx at the hosted form's
    index past the vector's size, and fixed it on fork m2-teleport-look-main ef44a1d8 with HostAttemptTest; upstream
    main has the same write.
- m2-teleport-look-main merged to fork parity ef44a1d8 (2026-10-17T03:03Z, 20:03 PDT on 10-16) through `just verb-merge`
  from thuum branch teleport-look-main (0d41c85: the look in both server-settings files, with main and the Apocalypse
  layer merged in), on thuum-magnus's go. It carries:
  - the teleport's look on other screens (docs/verbs/cast-teleport.md): at the cast, the server plays the vanish
    (MGTeleportOutEffect on the caster's figure in each neighbour's game); at the landing it places the figure, a pop
    and not a glide, stops the vanish, and plays the appear (MGTeleportInEffect, 1.75 s) and the sound. Ported from
    m2-teleport-look 2540be96 on Ghostwalk's line onto the main line as a7ed583f and 055e66b8; server snippets only, no
    client change.
  - the OnHostAttempt fix (ef44a1d8): the hosting path wrote lastMovUpdateByIdx at the hosted form's index past the
    vector's size. That aborted 20261016-233122's server when a game reconnected without an actor. The fix grows the
    vector first, as OnUpdateMovement does; HostAttemptTest covers it.
  Readings on its stage (ef44a1d8 with the layer):
  - x-teleport-look 20261017-015128: maxStep 517 at the landing, the pop onto the server's landing point. Then the known
    settle: about 37 units back and an 80-unit glide to c1's own spot. The out effect shows on c2's screen. A 5.4-unit
    creep after the landing goes to the settle row, after twenty-one.
  - b-teleport 015349, b-teleport-look 015610 (asserts maxStep >= 400) and b-self-cast 015832: green.
  T2 green with 26 sessions on skymp-server:m2-teleport-look-main (difftest job 7242, from API pipeline 1703 at the head;
  teleports identical with 15 declared divergences). The gate: run set 20261017-022224-merge-m2-teleport-look-main, 13
  scenarios, verdict watch (smoke-two-players, a-restart-persistence, b-duel, b-teleport, b-teleport-look, the cast
  five, b-self-cast, a-melee-reach, a-racemenu). b-cast-both-hands 024554 went red on c1's load freeze (below), was
  green on both ADR-027 reruns, and is the watch item. The branch changed no client, so the clones were not promoted;
  clean-m1 holds the same client.
  Lab note: a seat's game can freeze right after loading the save. Its skyrim-platform log stops at PostLoadGame (skse
  message type 3, about 38 lines), the seat counted online at its connect step, and the first console step times out
  at 60 s. Seen twice today, once per seat and on both fork lines: c2 in 20261016-203757 on 2540be96, and c1 in
  20261017-024554 here. The next one gets a full dump of SkyrimSE.exe and the seat's logs before the rollback, a lab-api
  change after playtest twenty-one.
- Playtest twenty-one (2026-10-16, 20:03 to about 20:24 PDT) on parity ef44a1d8 with the Apocalypse layer.
  - Twenty's world restored by `just playtest-restore`, the first restore with its relaunch of both seats (main 8aa07cac).
  - SunshineService restarted on both seats, one stream per seat, then both games relaunched under the streams. Both
    heartbeats were live.
  - The world saved as playtest-m2-21-20261017T032431Z. The evidence, taken before any rollback, is at
    results/playtest-21/: the server's log since the hold, and both seats' skyrim-platform.log and skse64.log.
- The Steam update-host fix on both clones' clean-m1-next (main 960ef27 and 6c91f38; 20:31 to 20:38 PDT).
  - Each clone was rolled back to its clean-m1-next first, so nothing the playtest left on the live disks reached an
    image. Then game-firewall.ps1 ran and the snapshot was retaken.
  - A connect to client-update.steamstatic.com:443 took about 21.2 s before: the name resolves (146.75.95.82) and the
    SYN goes unanswered. After the fix it took 79 ms on c2 and 82 ms on c1.
  - Smoke 20261017-033542 green, with an 83 s client rollback. clean-m1 is promoted after a green nightly (ADR-030).
  - The first try left c2's hosts file empty: Set-Content truncated it, then lost its second open to another process.
    6c91f38 writes it in one open with retries and checks the count.
- Ghostwalk's first stage, no merge (thuum-magnus's ask; 20:44 to 21:48 PDT on 10-16): fork m2-ghostwalk-main 6d09befe
  from thuum ghostwalk-main 6bcc0ff.
  - Probes r-ghostwalk 20261017-042234 and x-ghostwalk-relay 042445 green.
  - T2 red as expected: 26 sessions identical, and the ghostwalk session had 4 differences. Both seats get two effect
    messages at t 43, an empty one and one for effect 0x0C00AAE5 from Apocalypse's spell 0x0C00AAE8, that the legacy
    server never sends. magnus declared them in 728ca163.
- docs-m2-21 landed on main (1b778552), with hud-trace.js taking LAB_PARAMS.TYPES on top (CommonLibSSE-NG
  include/RE/H/HUDData.h:16-37). The superseded docs-te-map and docs-racemenu-row were deleted; their tips are in main.
- The crosshair fix (fork m2-crosshair 50d7c718, an invisible figure's display name emptied), staged from main, no merge.
  - x-crosshair-invis 20261017-045850 measured nothing of the invisible state: c2's game died 46 ms after c1's
    Invisibility reached the server, and launch.ps1 started it again. The middle point caught the reload, and the HUD
    trace was empty.
  - Its WER dump was lost to the restore's rollback.
  - A rerun without Frida was cancelled mid-stage when Eli parked the fix for after the alpha ("we can pass on that for
    now"). m2-crosshair stays unmerged.
- The hang-evidence lab-api is live (main d23fefcd, version d23fefcd at 22:15 PDT). A run whose step timed out naming a
  seat keeps that seat's skse64.log and a full dump of SkyrimSE.exe: dbghelp's MiniDumpWriteDump, 4.5 GB in 15 s on
  sky-c1, uploaded by the seat to PUT /lab/clients/<client>/hang-dump/<run>.
  - Still missing, after tonight's crash: a game that died and was relaunched mid-run. Its WER minidumps in
    C:\sky-lab\dumps should be kept the same way.
- The lab was back on parity ef44a1d8 at 22:19 PDT with the Steam-fixed clean-m1-next (smoke 20261017-051935 green) for the
  03:30 nightly.
- M3's first lab work, on Eli's "fire at will" (relayed by thuum-magnus; 00:47 to 01:10 PDT on 10-17).
  - Thuum m3-npc-probe 5801c6cf on main by fast-forward, with lab-api 5801c6cf: the driver's npc-ai step (Papyrus
    EnableAI on the placed NPC), its npc-state step (AI state, package, combat target, flags, position, head node) and
    their names in scenario.py's action list.
  - The driver laid on both clones and clean-m1-next retaken; smoke 20261017-075637 green.
  - Correction (01:30): the first four solo c1 runs (x-npc-puppet 20261017-075909, r-npc-packages 080111, r-npc-fight
    080443, r-cell-leave 080655) ran paused and measured nothing. The drafts lacked the global step every solo
    reference has after solo-start, which marks Survival Mode's first prompt (0x8DF, ccQDRSSE001-SurvivalMode.esl)
    answered, so "Enable Survival Mode?" held each game for the whole run. Every watched actor stood still with no
    events, and r-cell-leave's game hour stayed at 7.90. They passed green only because their asserts check nothing.
  - The reruns with the fixed drafts replace them, all green and all live:
    - x-npc-puppet 20261017-082859: the bandit moved 122 units with 2 graph events in a 4.5 s watch.
    - r-npc-packages 083112: Gerdur, Faendal and Hod walked 2469, 1690 and 918 units in a 90 s watch.
    - r-npc-fight 083447: the two bandits had 91 and 71 graph events, and the player moved 41 units.
    - r-cell-leave 083700: Sven and Faendal moved 520 and 1086 units in a 15 s watch. Its lab-run lost the connection
      when this Mac's Tailscale was logged out of headscale.gaussing.tv (01:47 to 03:29), but the run went on.
    They are readings for thuum-magnus; nothing merges from them.
  - Owed to lab-api: fail a run whose watch shows every actor standing still with no events for more than a few
    seconds (a paused game), never pass it green.
  - The 03:30 nightly is the driver change's full sweep before clean-m1 is promoted (ADR-030).
- m2-train-22 merged to fork parity 3536ba43 (2026-10-17T22:09Z, 15:09 PDT) through `just verb-merge`, from thuum branch
  ghostwalk-main with main merged in, on thuum-magnus's go. A merge train of three fork branches, staged together:
  - m2-ghostwalk-main 728ca163: Ghostwalk, Apocalypse's first verb, with its return {reach 0, waitMs 15400, relay true} in
    both server-settings files, its difftest session, and the four t 43 effect lines T2 first found, now declared.
  - m2-perk-riders 93358eea: libespm reads whether a magic effect's own conditions call HasPerk, and the server keeps
    such a rider out of ApplyEffects and the spell stagger loop. That covers Firebolt's Impact stagger, measured on 67 of
    91 lab hits, and Disintegrate's 200 Health.
  - m2-stream-aim 8c241d93: a figure's relayed aimed stream is cast with no target and the caster's desiredTarget
    cleared, so Scattershock no longer runs backward on the other screen.
  Readings on the stage (thuum-magnus's reads):
  - x-firebolt-riders 20261017-135254: no stagger in three hits, against 0.25 a hit earlier the same day; damage
    unchanged at about 0.757 left.
  - b-ghostwalk 135747: every assert held, and server.log has "made its cast teleport's jump" for the 2206-unit return,
    with no send-back.
  - x-stream-aim 135526: the figure's missile and Flames follow its aim, at a constant 2.75 degree heading offset (a
    follow-up row). Scattershock's 2.5 s charge left one missile in a 3 s hold.
  T2 green with 27 sessions on skymp-server:m2-train-22.
  The gate ran on one staging in two run sets:
  - 20261017-142215-merge-m2-train-22: 8 green (smoke-two-players, a-restart-persistence, b-duel, b-ghostwalk, b-spell,
    b-self-cast, b-invis-recast, b-teleport). Then sky-c1's GTX 1050 failed at a slot reset (07:45:49 PDT, "device
    inaccessible", QEMU exit 1), so b-teleport-look and b-cast-moving ran without a working c1.
  - Its rest, 20261017-214345-merge-m2-train-22, after core's warm reboot of the host had cleared the card: 7 of 7 (the
    two above, b-cast-dual, b-cast-rhythm, b-cast-both-hands, a-melee-reach, a-racemenu).
  Both clones promoted to the 3536ba43 client. clean-m1 now also carries the Steam update-host fix and the 5801c6cf
  driver: the nightly of 10-17 went red on two load freezes, so they were not promoted before.
  The nightly 20261017-103000-nightly, 52 of 54: a-rotfern and b-push froze at load. Their reruns: a-rotfern 132848 froze
  again, giving the first dump of the freeze (see below), then 133453 green; b-push 133201 and 133855 green.
  Lab notes:
  - The load freeze's first dump: 20261017-132848-a-rotfern, c1-SkyrimSE.dmp, 4.35 GB. thuum-magnus's HYPOTHESIS: an
    engine pathing loop on a stale return address, NaN only for some randomized image bases. Every run now keeps each
    seat's skse64.log, which prints the image base (lab-api dc0b63f). The existing AI Pathing Freeze Fix (Nexus 190049)
    patches the call, and is proposed to Eli as a layer.
  - sky-c1's card was wedged from 07:45 to 14:36: it answered reads and ignored writes, and only a host reboot could
    clear it (thuum-mundus). core rebooted the host on Eli's go. The warm reboot cleared it, and both cards are clean.
  - sky-srv (onboot 0) did not come back with the host and was started by hand. Its cloud-init flip gave it a new SSH
    host key, SHA256:Gk6ckTwF..., checked against core's guest-agent reading before the re-key.
  - core's sky-ci runner change waits for a stable home link.
- Playtest twenty-two (2026-10-17, 15:22 to 15:33 PDT) on parity 3536ba43 (the lab server on skymp-server:m2-train-22, the
  same commit) with the Apocalypse layer.
  - Twenty-one's world restored by `just playtest-restore` with its relaunch of both seats (main b23bb8b).
  - SunshineService restarted on both seats, one stream per seat (thuum-magnus), then both games relaunched under the
    streams at 15:26. Both heartbeats were live, and labState listed profiles 1 and 2.
  - Eli ticked all four items: Ghostwalk's long and short returns, Firebolt without its stagger, and Scattershock forward.
    His one note: a short Ghostwalk return slides on the other screen where a long one snaps, the teleport's old problem.
    thuum-magnus takes it as a follow-up branch (castTeleports' pop, and the return's own visual and sound).
  - The world saved as playtest-m2-22-20261017T223252Z (7 records, like twenty's and twenty-one's), then the hold
    released. No evidence was taken, since nothing failed.
  - core's sky-ci runner change landed during the restore: gitlab-runner and its helper images held at 19.4.1, sky-ci
    rebooted at 15:24, and both lanes (sky and sky-light) back online. The restore and relaunch pushed nothing and pulled
    nothing from the registry.

### 2026-10-18

- m2-train-23 merged to fork parity ef02c565 (2026-10-18T01:14Z, 18:14 PDT on 10-17) through `just verb-merge`, from
  thuum branch ghostwalk-look with main merged in, on thuum-magnus's go. A merge train of three fork branches, staged
  together:
  - m2-look-settle f98700aa: for 600 ms after a cast teleport's pop, a figure leaves unapplied any movement report
    nearer its pre-pop spot than the pop, so the stale pre-landing reports no longer pull it back (movementApply.ts).
    Ghostwalk's castTeleports entry gains the cast-teleport look (appear 0207c1, sound 0207bf) in both server-settings
    files, and its difftest session declares the three lines the look adds for c2. This answers playtest twenty-two's
    note: a short Ghostwalk return slid on the other screen where a long one snapped.
  - m2-quiver 5207d2e8: a figure wears its quiver again (1000 of the shooter's worn ammo). Skyrim Platform's launch hook
    drops the figure's own engine arrow unless a relayed launch opened its scope, so a shot stays one arrow.
  - m2-dirmonitor 01ec9927: Skyrim Platform's DirectoryMonitor waits 5 s before retrying and closes its change
    notifications. In the freeze dump its watcher for the absent Data/Platform/PluginsDev had used 72.4 s of kernel CPU.
  Readings (thuum-magnus's reads):
  - The look stage on m2-look-settle alone: x-teleport-look 20261017-231105, b-teleport-look 231320, b-ghostwalk-look
    231524 and b-ghostwalk 231728, all green, and T2 green. In b-ghostwalk-look the short return's figure moved 851.7
    units in one frame of a ~930-unit return and ended within 0.003 units of the server's y. On parity it slid the
    whole way. The last 50 to 80 units still glide in about half a second, the figure catching up to its caster's last
    reports, left to Eli's eyes at the M2 close.
  - The train's stage: x-quiver 20261018-001041 showed c1's figure wearing its quiver on c2's screen. It had 5 launches
    against c1's 5 (not 10), flights paired at 0.0 units and 0.0 degrees, and 5 "a figure's own arrow dropped" lines in
    c2.log with nothing crashed. b-arrow-path 001318, b-marksman 001555, x-teleport-look 001820 and b-ghostwalk-look
    002025 were green.
  T2 green on skymp-server:m2-train-23 (17:45 PDT). The gate 20261018-004536-merge-m2-train-23 was 12 of 12 green with no
  rerun, 20261018-004536-smoke-two-players to 20261018-011120-b-spell. Both clones promoted to the ef02c565 client.
  Lab notes:
  - lab-api 8ef063a1, deployed before the train's stage (its smoke 20261017-235551 green). Every run's end now reads each
    managed seat's game: SkyrimSE crash dumps since the run began, uploaded as <client>-SkyrimSE-crash.dmp, and the game
    process against the version check's pid@start. A crash, or a game replaced or lost, turns a would-be green into
    error. Every log in the seat's SKSE folder is kept. An assert or until over a seat paused under MessageBoxMenu fails
    (E_RUN_PAUSED). A snapshot's quiesce empties the dump folders and WER's queues.
  - crash-dumps.ps1 caps sunshine.exe at one stacks-only dump (thuum-mundus). A short-lived Sunshine child had crashed
    about every 21 s on both clones, a 4 to 38 MB dump each time, under the global LocalDumps setting that NVIDIA's
    installer's subkeys create. The train's clean-m1-next carries the cap and none of the old dumps (c1's of 10-05 to
    10-07, c2's five of 10-15, a queued WER report of 10-06).
- The class pass (2026-10-18T01:14Z to 01:43Z, 18:14 to 18:43 PDT on 10-17), thuum-magnus's probes, one for each
  Apocalypse spell family that acts on players, on parity ef02c565 with the Apocalypse layer. Seven runs by path, 7 of 7
  green: readings, not gates, every assert >= 0. thuum-magnus's reads:
  - x-class-self 20261018-011427:
    - Shock Nova's and Battletide's area hits hit the race again, E_SPELL_NO_CAST in the same millisecond as the cast
      (m2-self-burst, in train-24). Each burst also produced a spurious unarmed weapon hit (source 0x1F4) that the
      server counted as 3.71 damage, a new finding.
    - Sotha's Maelstrom's procs hit c2's figure 22 times in c1's game and Blood Boil's 8, and the server applied none
      (m2-second-hand, in train-24). The engine's cloak proc reports came every 496 to 504 ms per target, which set
      second-hand's claim cadence (b532b86c).
    - Inferno's granted Ember Bolt was refused twice ("not found in equipment"), and its 4 hits dropped. Shock Nova left
      its caster's health at exactly 1.0.
  - x-class-target 012152:
    - A relayed touch or target-actor spell at the other player named it by its server id, which the client turned into
      0. So in the target's game Azure Reconstruction healed the casting figure and Shadowbond landed nowhere
      (m2-target-actor, in train-24).
    - Shadowbond's hit was refused E_SPELL_NO_CAST: its script's remote cast arrives as a hit of an unlisted spell, which
      second-hand covers once its reach set includes it.
    - Decompose's cloak left c2 at 0.565 of its 0.5 start in its own game and the server unmoved (Cloak is not in
      EffectFactsOf, as the census said). Leech Seed's absorb ran in c1's game only (c1 0.54, c2 untouched). Finger of
      Death did nothing visible on either side.
  - x-class-bolts 012605: Bolide and Rift Bolt hit and counted once. Rift Bolt's scripted teleport proc was refused
    E_SPELL_NO_CAST (second-hand's reach). Nature's Balance's bolt counted but swapped nothing (c1 stayed 0.33, c2 1.0;
    its B1 is unbuilt). Thundercrack launched with no hit. Hailstone, Static Dome and Crackle never released: the probe's
    300 ms holds were too short for these charge-0 spells, and it now holds 900 ms.
  - x-class-streams 013048: Creeping Cold and Howling Blast counted by time (0.1 and 0.17 s a tick), Scattershock 0.25 a
    tick with two hits refused after its stop. Scorching Hands launched 16 times against c2's 18, with no hit registered.
    The figure's launches matched c1's within one for every stream.
  - x-class-location 013501: nothing on c2's screen for Thrumming Stone, Lightning Strike or the rune, no figure launch
    and no server line. The observer sees the cast animation and nothing else.
  - r-shock-nova 013824 (solo): the caster's health stayed 1.0 at every dump-state across two bursts, while the bandit
    took all four effects and ragdolled. The engine spares the caster, so the server's RunSelfSpell applying a hostile
    area to its caster is a measured server bug (for train-25).
  - r-stagger-cast 014025 (solo): inconclusive, since its bandit never attacked. It reruns after train-24's stage with an
    aggressive bandit, and both r- probes now keep the trace artifact.
- freeze-fix (a mod layer) merged to main e7780cf1 by merge commit (2026-10-18T09:29Z, 02:29 PDT) through `just
  layer-merge`, the gate in two sets:
  - 20261018-021041-layer-freeze-fix: 17 green, then stopped by hand when sky-c1's GPU wedged. That set's a-racemenu
    hit a failed start of 711 (024729, error) and its lab-fault rerun 024835 was green.
  - Its rest 20261018-075013-layer-freeze-fix: 39 of 39, 20261018-075013-a-restart-persistence to
    20261018-092228-t2-fakeclient-restart, verdict watch. b-duel 082158 went red at step 65,
    `server.actor(c2).healthPercentage < 0.78` read 0.7869 (c2's own game 0.7905): one hit short, not the layer
    (thuum-magnus). It was green on both ADR-027 reruns and is now a watch item.
  Both clones promoted. Plugins: none new. AI Pathing Freeze Fix 1.1 (cashboxs, Nexus 190049 file 801783, GPL-3.0) is one
  SKSE DLL, TMS_AIPathingFreezeFix.dll, in the 1.6.1170 folder's Data\SKSE\Plugins (persist-mods.sh, docs/MODS.md). The
  load orders and the server settings are unchanged. Each seat's skse64.log in the stage, smoke 20261018-020545 and
  b-marksman 020807, reads "plugin TMS_AIPathingFreezeFix.dll (00000001 AI Pathing Freeze Fix 01000000) loaded
  correctly". The plugin's own log is under My Games\Skyrim.INI\SKSE, which lab-api 27e847f fetches from train-24's
  stage on: empty mid-run means loaded, no repair (thuum-magnus).
  Lab notes:
  - sky-c1's GTX 1050 wedged again at 19:47 PDT on 10-17: a slot reset's link retrain failed, "invalid PCI interrupt pin
    255", QEMU exit 1. Its DevCtl then read 0x79ff, the replayed all-ones state that came before the morning's wedge,
    and thuum-mundus's remove and rescan at 19:58 did not stick (the card ignores config writes).
  - Eli's calls: the host reboot, plus hardware and ADR-036 (relaunch instead of a per-run rollback) as the structural
    fixes. A reboot alone won't hold, since the 1050 has no FLR and every reset is a slot reset: about one link failure
    in 750 resets, about 5 h of sweeps.
  - Eli and core then swapped the two cards' slots (the cable-tension theory) with two full power-offs. After a reseat
    the 1050 is at 0a:00 and the RTX at 0b:00, both on x1 ports (the x16 slot did not link). core pushed the new
    addresses through the IaC, and DevCtl read 0x293f on all four functions.
  - The first starts after the swap were clean (c2's agent after 15 s, c1's after 13 s), sky-srv came back on its known
    host key, and the solo references reran green: r-stagger-cast 20261018-074517 with the aggressive bandit and the
    trace, r-shock-nova 074819.
- m2-train-24 merged to fork parity a86238ed (2026-10-18T12:16Z, 05:16 PDT) through `just verb-merge`, from thuum branch
  player-globals 647228f with main merged in, on thuum-magnus's go. A merge train, staged as one:
  - m2-player-globals-main 91b3f9c7: per-player globals, wire schema 17 (Apocalypse's settings and counters are each
    player's own and survive a restart; 53 playerGlobals in both server-settings files).
  - m2-spell-launch a33b5ffc: a cast carries its launch fields, the same schema 17 bump. f3dff3e9 gives the ghostwalk
    session's cast those fields.
  - m2-self-burst 7ea47e5c and d0befa07: a Self burst's first hit no longer races its cast, and RunSelfSpell drops its
    hostile area effects before applying the spell to its caster (r-shock-nova: the engine spares the caster).
  - m2-second-hand ca641d55 and 2b3478df: a hit by a spell the caster's own recorded cast reaches through the records (a
    cloak's spell, a bolt's proc) is claimed against that cast, at the engine's measured cadence (cloak procs every 496
    to 504 ms in x-class-self).
  - m2-target-actor ea213315: a relayed touch or target-actor spell at another player lands on that player in its game.
  - The fork's two Formatting-check faults fixed (Hooks.cpp at clang-format 21.1.8, Definitions.txt), so parity's
    Formatting check is green again.
  - T2's declarations: a71fc88a (the PlayerGlobals message for every seat that moves, in 27 session files) and a86238ed
    (second-hand's proc Health change matched by shape). T2 green on a86238ed, 03:57 to 04:20 PDT.
  Readings on the stage (thuum-magnus's reads; the staged client was 14d70eb1's, the same code as a86238ed):
  - The class pass again as the "after": x-class-self 20261018-100816, x-class-target 101320, x-class-bolts 101733,
    x-class-streams 102216 and x-class-location 102618 green, then x-class-target2 103809 and 105815 (the re-cut).
  - b-player-globals 103133 green, committed alone. x-two-cloaks 103345 and 104500 green as readings: both cloaks cast,
    but Flame Cloak's contact damage applies through AddTarget with no hit event, so train-25's apply path reports it.
  - b-second-hand went red five times on the draft, never the verb: the draw swallowed the first cast (102930), the
    left-hand Flame Cloak 0xDE511 never cast from the right hand (103607), the cloak's procs had no hit event (104248),
    and a look after the draw left the hands sheathed (104931, 105614). Re-cut to Crackle alone, it read the claims on
    the server ("hits ff000001 with spell c0b2c83, claimed as a spell its cast reaches") and missed its bound by a hair
    at 2000 Health (110714). It was green at 1000 (111322) and is committed alone.
  The gate 20261018-112123-merge-m2-train-24: 23 of 23 green with no rerun, 20261018-112123-smoke-two-players to
  20261018-121220-a-racemenu. Both clones promoted to the 14d70eb1 client, at 05:15 and 05:16 PDT.
  Lab notes:
  - The stage's first try (02:30) stopped at step 7 when c2's client-dist got empty guest-agent answers twice. Laid by
    hand clean at 02:38, the second try (02:58) went through. lab-api 1650da4d came with it, so every run now keeps the
    SKSE logs of every My Games\<folder>\SKSE, the freeze fix's included.
  - An upward set-percentages can revert within about 2 s (7 of 11 in x-class-target2's runs). docs/LAB.md says to read
    right after the set; the server fix is a later verb row.
  - test-proto's staleness guard refused SESSIONS=dir on session-only changes (03:04). Each declaration ran T2 from its
    head's pipeline instead.
- m2-area-effect (train-25) merged to fork parity b352b82d (2026-10-18T16:25Z, 09:25 PDT) through `just verb-merge`,
  from origin/main (no thuum branch), on thuum-magnus's go:
  - A target-location spell placed where its caster aimed on the other screen, through the engine's placer 34413 and the
    native placeAreaEffect.
  - A figure's aimed streams leaving along the caster's aim heading (setActorAimHeading, the 2.75 degree offset gone).
  - m2-area-report: the player's spell effects on another player's figure reported from the effect's apply, and the
    explosion's Unarmed stand-in dropped.
  - m2-area-event 707231fc: areaEffectPlaced registered in Skyrim Platform's EventManager::InitCustom. d0ccf852's client
    refused the name, its startup broke before NetworkingService, and c2 never came online, which stopped the first stage
    at 06:04.
  T2 green on d0ccf852 (06:04 to 06:27 PDT, all 29 sessions identical). It stands for b352b82d: the fix since is the client
  DLL alone.
  Readings on the stage at b352b82d (thuum-magnus's reads):
  - x-class-location 20261018-135152, x-stream-aim2 135515, x-area-hit 135726, x-explosion-gate 140111 and
    x-second-hand-cloak2 140554 green. The placer is measured on Thrumming Stone, placed in c2's game at the relayed point.
    The stream heading offset is gone, and Scorching Hands now counts.
  - b-target-location 135949 and 140829 red, both on the probe. First its learn-spell ids were miscomputed. Then the
    driver's look step never pitches the first-person aim, so the two short-range target-location spells fizzled for want
    of a ground point. They wait on a driver step that really pitches the view, and the playtest covers them by eye.
  - b-cloak-apply 140353 red: a cloak on a peaceful neighbour is an application the engine turns into no hit and no damage.
    x-second-hand-cloak2 measured that once a fight has begun, the ticks are hits the server claims. So the apply report
    was withdrawn on train-26 (m2-apply-start-off), and b-cloak-fight replaces the probe.
  The gate 20261018-141630-merge-m2-area-effect went red on two reds:
  - b-duel 142100: 13 hit reports where every green has 18 to 21, gaps at the engine's cadence. It's a stream-count jitter,
    and the design fix is filed in spell-cast.md. c1's link and fps are unchanged by the slot swap (thuum-mundus; c2's RTX
    is on one lane now).
  - b-push 145328: c2 rolled off the spawn's ridge and never got up.
  Two reds give ADR-027 nothing to rerun, so the whole gate ran again as a fresh set: 20261018-151626-merge-m2-area-effect,
  25 of 25 with b-push a watch item (red at 155712, the same saddle landing, then green on both reruns).
  20261018-151626-smoke-two-players to 20261018-161634-a-racemenu. Both clones promoted to the b352b82d client at 09:24 and
  09:25 PDT. Where b-push throws c2 is Eli's decisions-lab.md question 4.
- headshots (a mod layer) merged to main e6495a7f by fast-forward (2026-10-18T19:01Z, 12:01 PDT) through `just
  layer-merge`. Its gate was the full sweep 20261018-164415-layer-headshots, 58 of 58 green with no rerun,
  20261018-164415-a-activation-reach to 20261018-190034-t2-fakeclient-restart. Both clones promoted at 12:01 PDT.
  Plugins and files:
  - Headshot Kills.esp, last in both load orders.
  - CIF (Core Impact Framework 2.0.7, its DLL and headshot.json), from persist-mods.
  - A `headshot` block in both server-settings files: the mod's spell 801, the ten playable races and ElderRace,
    minArchery 60. The parity server ignores the block, and the headshot verb (fork m2-headshot, on train-26) reads it.
  The branch took main in by a merge (e6495a7). Its three conflicts, the two settings files and persist-mods.sh, kept
  both sides: the freeze fix and CIF, the playerGlobals, Ghostwalk's look and the layer's load order (thuum-magnus).
  The stage at e6495a7 was clean:
  - smoke 20261018-163447, b-marksman 163659 and b-arrow-path 163920 green.
  - Both seats' skse64.log load CoreImpactFramework.dll and TMS_AIPathingFreezeFix.dll. lab-api kept both plugins' own
    logs from My Games\Skyrim.INI\SKSE.
  - x-headshot-probe 164202, a reading, went red at step 28: an iron helmet the items table lacks. Its bare-head half
    tested nothing, since `papyrus-av {set, Archery, 60}` named the skill by a name the server doesn't index (Papyrus
    calls it Marksman) and was delegated silently. Both headshot drafts now say Marksman and equip the helmet through the
    console. The probe reruns on the merged layer before train-26's stage.
  - The r-push-ground reading for Eli's question 4 ran green before it, 20261018-162536.
- m2-train-26 merged to fork parity d5b05e89 (2026-10-18T21:06Z, 14:06 PDT) through `just verb-merge`, from origin/main
  (no thuum branch), on thuum-magnus's go:
  - The headshot rule on the server (m2-headshot 0ff620c9, thuum docs/verbs/headshot.md). The shooter's game reports a
    head hit as Headshot Kills' instant death spell on the victim. The server kills, once per claimed hit, when a bow hit
    it claimed on that victim came within 1500 ms, the victim's head and hair slots are bare by its equipment record, its
    race is one the rule names, and the shooter's base archery (Marksman) reaches the floor. The facts are logged at each
    claim (60e9e2ae).
  - ADR-037's explosion gates (m2-explosion-gate a42d5512, accepted by Eli 2026-10-18). In a game, an explosion owned by
    another player's figure changes none of the player's Health, Magicka or Stamina: AddTarget's refusal is widened to a
    figure's EnchantmentItems, and PlayerCharacter::HandleHealthDamage drops a figure's damage. The knockdown, the look
    and the placed object stay, and the server's number arrives once.
  - m2-cast-target 9359e2c7: a target-delivered cast names the actor under the crosshair.
  - m2-unarmed-window 6edb8c9b: the explosion's Unarmed stand-in is dropped within ten updates of the player's own effect
    on the same figure, not one.
  - The apply report withdrawn (bf73bf53): a cloak on a peaceful neighbour's figure is an application the engine turns
    into no hit, and inside a fight its ticks are hits the server claims (b-cloak-fight).
  T2 green on d5b05e89 (12:49 PDT, all 29 sessions identical), on API pipeline 1934's difftest. The first try at 12:23
  stopped at test-proto's staleness guard: the branch's newest difftest artifact predated its head's skymp-wire.
  Readings on the stage at d5b05e89 (thuum-magnus's reads):
  - x-headshot-probe 20261018-190159 green on the merged headshots layer, before the stage.
  - b-headshot 191414 red: the iron set kept c2's head helmeted. Green at 192338 with the helmet taken off first and c1's
    Marksman read back before the shot.
  - x-class-target2 191615 and b-cloak-fight 192059 green.
  The gate 20261018-195009-merge-m2-train-26: 27 of 27 with b-invis-recast a watch item: b-invis-recast (red 204244,
  green 210056, green 210313). 20261018-195009-smoke-two-players to 20261018-210313-b-invis-recast.
  b-invis-recast's red was the lab's pacing, not the build (thuum-magnus's read). c2's screenshot step waited the whole
  120 s on a pid the guest agent no longer knew ("PID ... does not exist"), which spaced the first cast and the recast
  past Invisibility's 30 s. The run's real recast pair, 11.9 s apart, dropped nothing. lab-api now ends such an exec at
  once (labapi-owed, E_PVE_EXEC_LOST).
  Both clones promoted to the d5b05e89 client at 14:05 and 14:06 PDT.
- Playtest twenty-three, the M2 close (2026-10-18, about 17:30 to 18:55 PDT) on parity d5b05e89 (train-26) with the
  Apocalypse, freeze-fix and Headshot Kills layers.
  - Set up server-side after train-26's merge, 14:06 to 14:08 PDT:
    - Twenty-two's world restored by `just playtest-restore`, with its relaunch of both seats.
    - playtest-start's two camp teleports, and nothing else of it.
    - Test 1: its thirteen spells, and Marksman 60, read back as 60 on the server.
    - Test 2: its four spells and an Iron Helmet. It then carried two, because the restored world held one.
    - All three bars full on both seats, holding at the first set.
    - SunshineService restarted on both seats.
  - One stream per seat (thuum-magnus, 14:08), then both games relaunched under them at 14:09. Both were online with
    live heartbeats, and the setup was unchanged in the relaunched games.
  - Eli's results (docs/private/playtest-m2-23.md):
    - Held: the quiver (x-quiver); Crackle's proc, then Blood Boil's ticks (b-second-hand); Flame Cloak inside a fight
      (b-cloak-fight); Shock Nova beside test 2 (x-class-self, ticked "xw"); and the headshot kill ("it WORKS but
      there's a little bit of a lag").
    - Not as expected, in his notes:
      - The teleport and Ghostwalk still slide.
      - The globals check needs SkyUI.
      - Azure Reconstruction read "Prisoner resisted azure reconstruction".
      - Shadowbond's invisibility and its jump showed on test 1's screen alone.
      - Test 2 could not see Acceleration Rune. When it tripped, test 2 collapsed on test 1's screen only.
      - Test 2 seemed to take no damage from vanilla Frost Rune.
    - Not tried: the staggered cast.
    - His question: is the short slide of Ghostwalk, the teleport and Shadowbond the spells' own movement in vanilla,
      rather than the relay?
  - Evidence kept at 18:57 PDT, before any run, since no recorder ran: https://thuum.gaussing.tv/results/playtest-23/
    holds the window's server log, the whole session's, and each seat's Skyrim Platform, driver and Sunshine logs.
    thuum-magnus reads them.
  - The world was saved as playtest-m2-23-20261019T015813Z (7 records). The hold, playtest-relaunch's 180 minutes from
    14:09, had lapsed at 17:09, before the playtest began. Nothing was queued.

### 2026-10-19

- Playtest twenty-four (2026-10-19, about 10:50 to 11:12 PDT) on train-27's stage, not merged: the server of fork
  m2-train-27-snap ab14087f (the branch head 88c43e77 adds only CI) with 9fb0732f's client dist, and the
  Apocalypse, freeze-fix and Headshot Kills layers. The first playtest on a stage (ADR-040 item 1).
  - Set up server-side by `just playtest-setup 24` (lab/playtests/24.yaml), 07:28 to 07:29:41 PDT, all ok in 82 s:
    - Twenty-three's world playtest-m2-23-20261019T015813Z restored, with both seats relaunched on it.
    - The camp's two teleports.
    - Test 1: its thirteen spells, and Marksman 60, read back as 60 on the server.
    - Test 2: its four spells, and a third 0x12e4d.
    - All bars full on both seats; SunshineService restarted on both.
  - One stream per seat (thuum-magnus, 10:02:28). Then `just playtest-ready 24`, 10:03:15 to 10:03:49:
    - both games relaunched under the streams, and every check ok;
    - the hold renewed to 13:03.
    Eli's ask for the streams, about 07:0x, reached numidium only at 10:02.
  - Eli's results (docs/private/playtest-m2-24.md):
    - Held:
      - one-blink arrivals for short and long teleports and Ghostwalk's return (b-teleport-look, b-ghostwalk-look);
      - Azure Reconstruction refused on a player (x-azure-player, "seems to behave correctly?");
      - Finger of Death kept off the list;
      - a rune's trip counted once (x-rune-cast);
      - headshots and the helmet case (b-headshot: "lag is noticably better");
      - Flame Cloak only inside a fight (b-cloak-fight);
      - Crackle's proc, then Blood Boil (b-second-hand).
    - Noted:
      - Shadowbond's swap "works perfect, we're still both visibile on player 2's screen": the bond's invisibility
        does not reach the observer.
      - The placed rune is not visible on test 2's screen once set: "i can see the cast and the initial rune, but
        not after it's set".
      - Lightning Strike "played effect on player 1, not on 2, the bolt looks the same and hangs. check those logs."
      - thuum-magnus reads all three as gaps twenty-three already had, not train-27's.
    - Not run: per-player globals (b-player-globals), "skyui still not present", since the essentials layer was not
      yet staged.
  - Evidence kept by hand before any run (no recorder ran): https://thuum.gaussing.tv/results/playtest-24/ holds the
    server log since the world's restore (14:28Z, 924 lines) and each seat's Skyrim Platform, lab-driver and Sunshine
    logs. thuum-magnus reads them.
  - The world was saved as playtest-m2-24-20261019T181352Z (7 records) at 11:13; lab/playtests/25.yaml restores it.
- m2-train-27-snap merged to fork parity 88c43e77 (2026-10-19T20:46Z): the gate 20261019-200334-merge-m2-train-27-snap, 20261019-200334-smoke-two-players to 20261019-203756-b-invis-recast (16 runs); watch items: a-melee-reach; T2 cited, not rerun: ab14087f's, 30 of 30 green on the guard's own sessions (88c43e77 adds only .github, no wire path); clones promoted. Verbs: train-27's rows (docs/PLAN.md), each in its verb doc: target-location casts that no longer throw at the cast or the trip, with the observer's placement relayed and the server's 600 s claim window for a placed trigger (target-location.md); the relayed cast naming the target its first hit names (spell-cast.md); effect conditions the server evaluates, unknown functions refused and logged (ADR-039: Azure Reconstruction on a player refused); a server-vouched jump relayed as a placement at any distance (cast-teleport.md), and Shadowbond's swap as the server's move of both actors with the pin (shadowbond.md); headshot prediction, the shooter's game playing the kill and the server confirming or reverting (ADR-038); the Windows build's coverage made optional while chocolatey is down (ci-cppcov-optional). Playtest twenty-four held every row it ran (above).
  - The first gate, 20261019-181550 (11:15 to 11:57 PDT), went 13 of 14 green: b-push red twice on its health band only (0.9412 and 0.9377 against under 0.9). The band encoded damage the server applied without judging Dragonborn's conditions; train-27's evaluator gives the shout's vanilla 10. Eli approved the new band (under 0.97, above 0.8; docs/private/decisions-2026-10-19.md section 3, 13:01), main cc37349 merged it alone, and the gate ran again. gate.yaml's watch list only adds scenarios: ADR-027's set rule passes a red that goes green on its reruns, and red twice blocks.

### 2026-10-20

- m2-train-28 merged to fork parity e3806870 (2026-10-20T02:00Z): the gate 20261020-013037-merge-m2-train-28, 20261020-013037-smoke-two-players to 20261020-015208-b-invis-recast (12 runs); watch items: b-shadowbond; T2 green beside the gate (verb-merge's new T2_LOG), e3806870's own sessions on difftest job 9056's binary, 32 identical; b81ce2a9's first T2 was red on a declaration slip in the shadowbond session (two relay messages matched one declaration), fixed sessions-only in e3806870; clones promoted. Verbs: train-28's rows, each in its verb doc: the figure values, each player's recorded maxima told to every game that sees it (figure-values.md, b-figure-values); Shadowbond's concealment through the SpellCast relay, the proc relayed as each bonded actor's own instant cast (bond3, shadowbond.md, b-shadowbond); the plugin loader's case-insensitive master match that lets the essentials layer load (86fe569e); the observer's guard against a projectile-less effect and the script-event whitelist admitting WB_DestroyAfterDelay_Script, both in the client (x-rune-visible's clean c2.log, Eli's Lightning Strike bolt no longer hanging in playtest twenty-five). Staged WITHOUT the essentials layer (from main 2375eb0, clones from clean-m1), since playtest twenty-six found the layer not ready; the layer stays off the merge path until its fixes land.
  - The watch item: b-shadowbond's first run (20261020-014021) went red at step 44, the second bond's proc on c2 at 0 s: the second cast missed, since the swap puts each player where the other's figure stands and the engine pushed c2 41 units out of that capsule, 15 degrees off the scenario's fixed aim (thuum-magnus's read of server.log 01:42:31, "spellCastData.target 0"); the first bond and its concealment on both screens held (steps 22 and 33). Green on its rerun; a placement fix for the scenario follows separately.
- m2-clientbuild-first merged to fork parity 602a2dd2 (2026-10-20T03:12Z): the gate 20261020-024730-merge-m2-clientbuild-first, 20261020-024730-smoke-two-players to 20261020-030445-b-invis-recast (10 runs); watch items: b-push; T2 green beside the gate (T2_LOG) on skymp-server:m2-clientbuild-first; clones not promoted. Verbs: none, CI only, so the fork's own GitLab client-build on sky-build passes now that CLIENT_BUILD_WINDOWS is set project-wide (core, 2026-10-19): CMakeLists tests GITHUB_ACTIONS rather than CI for GitHub's C:/vcpkg toolchain (WIN32-guarded, so the Linux server and GitHub's Windows builds take the same paths as before) and client-build gets a 4 h timeout for a cold vcpkg build (7dca03d5, cadcb210, 04dce744; thuum-magnus). Its own pipeline 2168 built the client on sky-build in 479 s, the first push-built GitLab client. The watch item b-push failed on its landing as in train-25's gates (c2 thrown, no GetUpBegin within the window, c1's watch losing c2), then went green on its rerun.
- m2-ci-dist-world fast-forwarded to fork parity d5f478c3 (2026-10-20T09:56Z), CI only and without a gate: ci/server.Dockerfile removes build/dist/server/world before every server build. The build tree is the cache mount every branch shares (cb078277), and cmake/run_integration_test.cmake runs its servers in build/dist/server, clearing world/changeForms before a run and nothing after it; m2-formdesc-world's servers write world/load-order.json at every load (ADR-043), its pipeline 2193 left one in the cache, and server-build 9323 (m2-train-29 99c39e3e, a client-only change) failed DistContentsTest on it as an excess file. Pipeline 2201 proved the guard on that cache (server-build 9336, 13 of 13 tests). No gate, unlike 602a2dd2's: every server service in lab/deploy/sky-srv/docker-compose.yml mounts its own world over /srv/skymp/world, so no lab run reads what the guard removes, and train-29's merge gate is its first lab exercise. The in-flight branches merge parity before their merges (verb-merge refuses a branch that does not contain it); m2-formdesc-world carries a4da51e8 (load-order.json in step 5 of the runner, its list of a test server's runtime files) and reverts its own run_test_unit.cmake guard 8b8346e2 when it takes parity.
- m2-train-29 merged to fork parity 4720d0d3 (2026-10-20T20:41Z): the gate 20261020-201530-merge-m2-train-29, 20261020-201530-smoke-two-players to 20261020-203745-b-invis-recast (10 runs); T2 green beside the gate (T2_LOG) on skymp-server:m2-train-29 at 4720d0d3, 32 sessions identical with the PlayerGlobals login send declared once in difftest/divergences.yaml (the first T2 of the head broke when a stray verb-merge without T2=skip started a second T2 on the same test containers, numidium's slip; both killed, rerun clean); clones promoted. Gated WITHOUT the layer: the gate under the essentials layer (20261020-190735) went red on three watch items, systematic on rerun (a-racemenu 193623, b-spell 193945, b-push 194207), each the layer's or older than this train (thuum-magnus's reads: Playable Headparts All Races.esp overrides the Nord head parts without the male flag; MysticismMagic.esp and Odin rewrite Firebolt to 20 damage; b-push's refused second Ragdoll, seen without the layer on 20261019-131236); the clones' layered clean-m1-next was deleted, rolled to clean-m1 and restaged from main, and the three went green here. Verbs: train-29's rows, each in its verb doc: the client's Papyrus event filter admitting scripts by class chain and the served plugin list (ADR-044, b2db6354), so Survival Mode's check and the MCM list run in a connected game (playtest twenty-seven: both seats answered the Creation's box Yes, 828 = 1 and 8df = 1 recorded); the server's IsEssential and EffectWasDualCast conditions; Lightning Strike's relayed launch (x-lightning-strike 20261020-102508 green, its first run 101404 a lab fault); the projectile pick and the OpenContainer deadline (18c0e603); playerGlobals entries may carry a default sent at login when the record is silent, the lab's settings giving Survival's Prompted flag 8df the default 1 (edb2608c, main 6d642a5), and the login's globals send moved from the first movement to SetUserActor (50a56e4a), which wins the race against Survival_MainScript's 5 s check (x-survival-restore-timing 185534, 185906, 190218 green, 37 to 74 ms after the connect, where 18:23's playtest relaunch lost it at 4.2 s). The night's launch-flag try for an observer's rune glyph (99c39e3e) was reverted in d34053e0: the caster places the glyph as a decal (44186, x-rune-decal-frida 20261020-102818) that a relayed bare launch never calls, train-30's row. With it to parity: the CI fresh-tree fix (6591a0c0: the shared server build tree drops ninja's log and deps, cargo's target and the dist before each build, after server-build 9362 linked objects of two branches) over d5f478c3's world guard.
- Playtest twenty-seven (2026-10-20, 07:05 to about 11:30 PDT; fork m2-train-29 709c90b0 under the essentials layer as re-rendered at 06:23): every row ticked. The layer's three fixes held (aspens with bark, cloaks under FSMP, rotfern whole with her stagger patch reverted); Survival Mode's own box came up on both seats, the first time in a connected game, warmth from a WIC cloak, and the choice survived a server restart; the MCM listed all eight menus and an Apocalypse setting survived the restart; Shadowbond's concealment on both screens with the break by either seat; Lightning Strike seen on test 2; Electrosphere dual cast; Finger of Death's fail branch hurting the caster alone. Found: a server-taught spell list lost on a reconnect with the game process up (Train-30's first row, fork m2-train30-spells 096d2cd8, b-spells-reconnect approved and red by design), and Survival's login restore losing its race to the Creation's 5 s check once in two relaunches (the per-global default and the login-time send, both in train-29's merge). The scenarios b-papyrus-events and b-spells-reconnect approved by Eli; ADR-042 accepted ("accept 42 and 43").
- The layered gate's three reds read (2026-10-20, 19:50Z to 21:00Z, each twice with the same values; thuum-magnus's readers): a-racemenu, Playable Headparts All Races.esp overriding every Nord head part without the gender bit so RaceMenu skipped the preset's parts at every load (the rotfern root cause for everyone; the wire identical to green); b-spell, the layer's Mysticism and Odin rewriting Firebolt to 20 damage against the scenario's vanilla 25 (the server right, the expectation vanilla-only; a served-magnitude read for lab-api is the fix, the layer sweep runs as a measurement meanwhile); b-push, the victim's own game refusing a second Ragdoll about 60 ms after the first so the flight died, seen once on 10-19 without the layer (the server's stagger snippet landing after the Ragdoll is the suspect; probe x-push-knock-frida written). The layer-free gate of the same train ran all three green.
- The essentials layer re-rendered without FSMP (apocrypha/layer-essentials cf363c44, 20:26Z) on Eli's word after the playtest ("the cape physics worked but it looked jank"): FSMP, both Artesian physics packages and the Survival collection's HDT patch pair out; warmth kept by the collection's non-HDT patches, patched light at build so they hold slots 11 and 12 and no other plugin moves; and the a-racemenu fix in the same render, a build-time, size-preserving plugin patch (lab/layer/plugin-patches.tsv, lab/tools/plugin-patch.py) giving Playable Headparts' 805 head-part records both gender bits, Eli's "patch it" over dropping the mod. Staged 21:06Z (stage-layer-train29 7d2f806 on clean-m1 at 4720d0d3's client, no old layer files; 100 client plugins, 91 served, every served plugin in the clients' slot); the smoke 20261020-210408 green with no Survival box and no hdtsmp64 log; x-layer-headparts 20261020-210719 green, the patch CONFIRMED (racemenu-sync.md). The full sweep under the layer follows as a measurement; nothing merges or promotes without Eli's word on b-spell.
- Train-30 built between reads (2026-10-20 afternoon): spell-projectile flights (fork m2-train30-flights 951b5bbc raises projectileFlight for a spell's projectiles; the driver's flights rows carry projectile and spell as columns nine and ten, thuum main 7e00c41); the arrows step counting PROJ 0x32 (main 916860e); the figure-dent gate as a Gum interceptor-replace at DamageActor 37335 with HookHandler::Replace and the train-28 vfunc guard removed (fork m2-train30-dent e6a8270a, client built green, HYPOTHESIS until its hit steps run; b-figure-values gained them, main 5f64b26, on lab-api's rises() b7b0429, pending until that stage). ADR-043's rule-6 scenario b-formdesc-world approved by Eli ("approve b-formdesc-world", main de069a7b) on the committed fixture adr043-preslice-25 (main ebc4d726, twenty-five's eight raw records with their order); lab-api gained `server: world:`, FormDesc ids in the known step and rises() (numidium, 3fd7ae5, 687c622, b7b0429); fork m2-formdesc-world 80cf1e35 carries parity 4720d0d3 for its stage. gate.yaml's pending: b-spells-reconnect, b-figure-values, b-formdesc-world (badbacc).
- Train-30's last rows and the close's shape (2026-10-20, 21:20Z to 22:15Z): the Hailstone conditions GetActorValue (14) and HasMagicEffect (214) built with T0 (fork m2-train30-conditions), their parameters confirmed from the record bytes numidium read on sky-srv (the actor value index; the MGEF id in the file's own index space, which the reader now maps through the owning record for any function that declares a form parameter), and the race's constant abilities read from the records into the server's one modifier (a Nord's 50 ResistFrost, an Altmer's Highborn magicka, which the maxima had run short by); then the resistance rule the Hailstone probe would have exposed (fork m2-train30-resist, stacked): the server imposes a player's damage and the player's engine refuses those effects, so the engine's resistance never ran on them; the element's resist value (libespm reads MGEF DATA 0x10 now) after Magic Resistance, each capped at the player's 85, Hostile effects only, at ApplyEffects' one entry. Eli's M2 scope calls through numidium's session (the shouts' bystander, lag compensation and ADR-043 slice two to M3; the snap-back fix and melee reach's cases stay; playtest twenty-eight closes M2) written into PLAN; Eli: "wanna cook on a closeout set of tests? that if it passes we call m2 done? (provided you're confident in pushing spells that instantiate items like runes and the raise wall spell into m3)": docs/M2-CLOSE.md written (the m2-close run set, gate.yaml; T2 and T0; the T4 list; the carries by name, world-object spells among them with the reasoning; the HYPOTHESIS policy; the order with the nightly over the stage cited by GATE_SET), b-hailstone on its review branch. Fork m2-train-30 1d88a6b7 assembled by four clean merges on parity 4720d0d3 (the spells fix, formdesc slice one, the dent gate, resist with conditions) for the one stage playtest twenty-eight runs on; numidium stages it after the layer gate (20261020-220005-layer-stage-layer-train29, 62 scenarios, running since 15:00 PDT) merges and promotes.
- The essentials layer's first full gate and its four reds (2026-10-20, 22:00Z to 23:56Z; thuum-magnus's readers, numidium's and apocrypha's audits; docs/research/layer-reds-2026-10-20.md): `just layer-merge stage-layer-train29` on render cf363c44 (FSMP out, the head parts given both gender bits) went red at 25 of 62 and was stopped at 38 of 62 at 23:47Z on Eli's goal ("feel free to continue to that last playtest"), nothing promoted. a-rotfern: c1's game died in the VANILLA race menu's slider rebuild on rotfern's 33-layer tint list (an unchecked index into the player's tint masks), the vanilla menu up because SkyUI_SE.bsa carries a racesex_menu.swf too and the layer's client-only SkyUI loads last, so its copy beat RaceMenu's on every layer seat (no RaceMap::CreateDefaultMap in any layer skee64 log; RaceMenu's install notes say after SkyUI; the no-layer lab has no SkyUI); found on the way and banned by rule, a layer plugin's override of the Player base 0x7 (Supernatural Survival Tweaks' werebeast patch; Eli: "patch it"; numidium's load-order check now refuses any served plugin's NPC_ 0x7 or 0x14). a-racemenu: the gender-both head-part patch's own side effect, the vanilla menu's rebuild rejecting a male's both-gender parts and seating ApachiiHair's male hair. b-duel's Flames row: seven hits short, all at the stream's start (the first contact a second late), likeliest a one-off; the 0.78 bound stays. b-god: no hit claim from c2's game, since a first-person arrow launches about 4 units higher under the layer (Improved Camera SE the candidate) on a 250-unit shot whose crosshair sat at the top of c1's head; the scenario's shooter moves to 150 units (main 7f65c0c9). The fixed layer, apocrypha/layer-essentials c38a3b04 (the 0x7 drop-record, the head parts on their masters' gender bits, RaceMenu's menu laid loose; a new build-time patch kind, a BSA extractor, the rule "when two archives share a path and the plugins' order cannot be the installer's, lay the winner's copy loose"), re-stages with a-rotfern, a-racemenu and b-duel as its deciders, the train stage on it after, then playtest twenty-eight; the layer merges by its own gate after the playtest.
- Train-30 assembled and the snap-back fix built (2026-10-20, 22:13Z to 23:56Z): fork m2-train-30 1d88a6b7, four merges on parity 4720d0d3 (the reconnect spell fix, ADR-043 slice one, the dent gate, the Hailstone conditions with the resistance rule), CI 2309 green in every job and T2 identical across 32 sessions; then 44372078, clang-format alone for the fork's Formatting check (verb-stage stops on a red one), CI and T2 rerun at it. The health snap-back fix on fork m2-snapback eef10842 (a percentage the server raised holds against the client's reports until one reaches it, the bases' rule; the drink's 5 s blanket drop goes), its T0 green after it caught the hold being asked after the report's equality; b-snapback approved by Eli ("approve b-snapback") and pending for the train after twenty-eight. The M2 closeout set (docs/M2-CLOSE.md) and its m2-close run set; playtest twenty-eight's checklist drafted (docs/private/playtest-m2-28.md), lab/playtests/28.yaml ready (numidium).
- Playtest twenty-eight (2026-10-20, seats ready 17:58, report 18:18 PDT; fork m2-train-30 44372078 on the fixed essentials layer c38a3b04, twenty-seven's world migrated by ADR-043 slice one): Eli: "im not super happy with this test ngl. deffo some backsliding in what i expected". Ticked: rotfern herself under the layer's order and after a restart, the reconnect keeping the spells, no dent, Survival asking no box, Hailstone's numbers on both seats, vanilla capes, loads and frame rate, the MCM (11 entries), teleports, the quiver, no freeze, globals, the staggered cast. Found: test 2's heals undone and no natural regen (the log: no Self cast reached the server, Azure Reconstruction ran in his own game under ADR-029's default and the crop undid the rise; Survival on for both seats, no passive regen); spells landing in different places on the two screens; Finger of Death's ash on test 1's screen only; the headshot row unticked (four bow shots by test 1 reached the server, none a hit claim); Teleportation missing on test 1 (lost before tonight) and mis-based on test 2 (a world saved without its order); the setup's gives stacking (fixed, main 485c4ee). Eli's calls at the report: a heal applies by the record (Healing Hands on another player heals them, Azure Reconstruction does not heal a non-summon) and a scripted kill is the server's in both games ("why on earth would i want them dead in only one game"); both Train-31 (PLAN), with the snap-back fix. Process: a mid-playtest edit of the live checklist cost Eli his ticks; the checklist is his while he plays (memory rule). After: the world saved as playtest-m2-28-20261021T012414Z and a cleaned copy (the dangling 'a86df:Cloaks.esp' out of profile 2); x-syncspells-reconnect 20261021-012700 green (the reconnect keeps a listed spell). The m2-close nightly over the stage follows at 03:30. docs/research/layer-reds-2026-10-20.md holds the reads.
- ADR-042a ACCEPTED (2026-10-20 18:47 PDT, Eli: "sure whatever go with 42a"): the layer's merge cites the m2-close nightly beside the train's, both promotes after the second merge; numidium builds gate-cite's layer citation before the merges; the fallback sweep is not needed. Also at the report: the arrows landed alike on both screens ("marksman check was great. just copy that for the spells"), so Train-31's spell-aim row copies the arrow-path shape; the three spell records read on sky-srv (docs/research/train-31-reads.md section 5): Azure Reconstruction is a minion heal by IsCommandedActor, so twenty-eight's "heals rejected" was the record's own answer and nothing is built for it; Healing Hands' row is the hostility defect plus the snap-back (its Health effect is applied already); Finger of Death's kill is the script's arithmetic, which the server computes from the claimed hit under its seven conditions.
- M2 closes on playtest twenty-nine (Eli, 2026-10-20 before 18:55 PDT: "lets aim to close this out on test 29"): Train-31 (twenty-eight's findings: Healing Hands' hostility and snap-back, Finger of Death's server kill, the spells' aim parity, the relaunched game's dropped reports, Survival's need globals, the legacy-world repair) becomes the closing train on the base the morning's merges make; docs/M2-CLOSE.md re-pointed (the rule, section 3b's T4 items, step 6).
- Train-31 built (2026-10-20, 18:58 to 20:05 PDT; fork m2-train-31, worktree lab/.cache/wt/t31, off m2-train-30 44372078 with m2-snapback eef10842 and m2-train30-flights 951b5bbc merged; head 3642bc32, pipeline 2421 green in server-build and client-build; T2 at the head running from the lab side, numidium): the six rows of twenty-eight's report, each with its T0. (1) A spell hit begins a fight only through a hostile or detrimental effect, so Healing Hands on another player heals it and starts nothing (ActionListener::OnSpellHit; unit/HealOtherTest, whose first run read 0.01 of 250 healed because a stream's hit credits the time since the cast, 1 ms in T0; fixed to the Flames test's shape). (2) The scripted kill: server-settings' scriptedEffects names Finger of Death, the server runs the script's arithmetic from the claimed hit under the effect's seven conditions and kills by the caster's hand (wire-rules scripted_effects with both branches, PartOne::ClaimScriptedKill, unit/ScriptedKillTest; docs/verbs/scripted-effects.md). (3) The login's actor-value hold is armed at the login, compares skills, attributes and level only, names what a refused report fell under, and the client echoes the applied record once (wire-rules actor_values login_compares and login_shortfall, PartOne::SetUserActor, actorValuesService.ts; unit/ActorValuesTest's relaunch case; the probes x-relaunch-reports 20261021-015132 and -b 015600 reproduced twenty-eight's test 2 first). (4) A Self concentration spell runs on the server as a stream for the cast's span (RunSelfSpell, EndSelfStream, ApplyEffects' streamSeconds, magic::SELF_STREAM_CAP_S 60 s; unit/SelfCastTest's Healing case). (5) A spell projectile flies the arrow's way: the caster's game fills the cast's launch for every fire-and-forget projectile and prefers the flight's angles, the figure's cast takes it for any projectile (magicSyncService.ts, MagicApi.cpp; no wire change, the fields were there; the measured gap 65 units of origin at equal angles, b-hailstone's launches). (6) Survival's three need globals (0x81A, 0x81B, 0x816 of the .esl, plain globals the need scripts write each tick) join playerGlobals in lab/deploy/sky-srv/server-settings.json (main 90fa736 after numidium's conflict fix). On main: scenarios b-heal-other d0a06bf, b-fod-kill 1caa8eb, b-relaunch-reports e37ecc2, b-spell-aim dceed8b (Eli's review), their pending lines (numidium 19b5314), 29.yaml (3654430, 41 sets), the checklist draft docs/private/playtest-m2-29.md, verb sections in magic-effects, actor-values, self-cast, spell-cast and player-globals, docs/research/train-31-reads.md sections 1 to 8 (the three spell records, the code reads, the flights, the Survival globals, the saved world's format and the 28 snapshot's nine mis-based learned spells). Left: the world-repair tool (being written), the four scenarios' review, the stage after the morning's merges, playtest twenty-nine.
- Train-31's T2 and the repair tool (2026-10-20, 19:47 to 20:20 PDT): T2 at 3642bc32 from the lab side (numidium) read 31 sessions identical and one declared divergence that no longer occurs: the shadowbond session's StartCombat to c2 at the bond's hit, gone because Shadowbond's effect (MGEF 03055B2F: Recover, No Magnitude, No Area, FX Persist) is neither hostile nor detrimental and train-31's rule begins a fight only through such an effect; right by the record, the declaration dropped (fork m2-train-31 3b579f41, pipeline 2423; docs/verbs/shadowbond.md), T2 again at the new head. lab/tools/world-repair.py landed (main 06b360d): every form a saved world names checked against the order it was written under, a repaired copy under --out, 35 self-checks; its first case the raw 28 snapshot's nine mis-based learned spells (the hand-cleaned entry was test 2's Teleportation, eight Apocalypse spells beside it named as Cloaks - Dawnguard's), run on sky-srv by numidium with main's 17-file order as the candidate, the repaired copy a candidate for twenty-nine's world.
- The repair tool's first run (2026-10-20 20:17 PDT, numidium on sky-srv): the raw 28 snapshot read "OK 222, MISBASED 9", the nine named (Teleportation and eight Apocalypse spells: Shock Nova, Ghostwalk, Decompose, Scattershock, Hailstone, Battletide, Static Dome, Azure Reconstruction); the repaired copy, placed as /srv/lab/snapshots/playtest-m2-28-repaired-20261021T031739Z, is twenty-nine's world (29.yaml, main 38bef46); the tool refuses to write under the snapshots directory itself, so the lab's save step places it.
- Playtest twenty-nine (2026-10-20, seats 21:33 PDT on fork m2-train-31 3b579f41 over the staged essentials layer plus main's settings, the repaired 28 world; re-staged at 22:02 on 9ad635cd at Eli's word, "just implement the fixes now ill wait", after the stage's probes found Finger of Death's caster dying with its target (the server's share and the script's stacked) and the bolt's origin offset, both fixed and probed green (b-fod-kill 045336, b-spell-aim 045557) before he resumed; report 22:33): the closing playtest's T4 half met. Ticked: Healing Hands heals the other player and starts no fight; the self heal holds; Finger of Death's two branches, test 2 dead in both games on the kill; the headshot by hand with the helmet case; Teleportation after a restart; Survival's bars; the MCM's eleven entries; every spot check; eight of the nine Apocalypse class representatives. Marked unsure: the relaunch row (proven by the lab and the live 22:12 relaunch), Prepare for Adventure (items vanished and did not return: a finding), Sealed Resolve (a log read). Notes: the victim's game plays a plain death where the caster's shows the ash pile; Flames' stream lands in different places on the two screens while the bolts match; Thoughtsteal's granted spell worked where the text said refused; Become Ethereal's translucency missing on the other screen; a server set lost to the login echo at setup (Magicka 400 to 120, re-set held). Process: I fixed and planned to swap the server under the test before his word ("why on earth would you do that?"); the build under test is frozen from seats ready to the report, saved as a rule; his override put the fixes in. Perks: "you need to be writing what perks i need to give characters in playtests or giving them yourselves": the checklist's perks block (numidium) and a `perks:` list applied at login next. What remains before M2 DONE: the morning's merges (train-30 and the layer under ADR-042a after the 03:30 sweep of the re-laid train-30 stage), m2-train-31 staged on main's merged layer and swept, its merge.
- Twenty-nine's report corrected (Eli, 2026-10-20 22:42 PDT): the Survival needs row is a no, "those reset when test 2 came back"; Train-31's need-globals row (the three values in playerGlobals) did not hold through a relaunch and reopens for the next train, the log read pending.
- The four Train-31 scenarios approved (Eli, 2026-10-20 22:52 PDT: "approve b-heal-other b-fod-kill b-relaunch-reports b-spell-aim"); their pending lines in lab/gate.yaml lift when m2-train-31 is staged on main's merged layer in the morning (the re-laid train-30 stage lacks their fixes).

### 2026-10-21

- M3 started (00:05 PDT, Eli: "i suppose kick it off when you're ready"), M2's close finishing in parallel: the first verb cell-host, its doc drafted from ADR-035 and docs/research/m3 (the engine-alone references and the puppet probe of 2026-10-18 stand as its ADR-031 references); the lab goes to M3 after the morning order (the 42a merges, Train-31's stage and merge, x-survival-needs-relaunch, the perks step).
- The transport's frozen clock (2026-10-21, 00:20 to 00:38 PDT; found by the cell-host round-trip read): wire-transport's polls updated the netcode transport and never renet itself, so every connection's clock stood at zero on both ends: no lost reliable packet was ever resent and every round trip read 0 (renet 2.0.0 source; docs/research/transport-clock.md). Fixed on fork branch wire-renet-clock (renet's update before the transport's in both polls, Server::client_rtt_ms, a loopback T0 that fails without the fix); its gate and merge after Train-31, a netem-loss probe its lab measurement. M3's first code the same night: wire-rules cells (the cell host table with its T0) on fork m3-cell-host, docs/verbs/cell-host.md's cell_of resolved to libespm's existing exterior-cell index.
- M3's first night's code (2026-10-21, 00:10 to 00:47 PDT, fork m3-cell-host off 9ad635cd): wire-rules cells, the cell host table (the first loader in reach hosts, grace, the lowest round trip on a handoff, the epoch, the freeze; six T0, afc792c1); the wire contract CellLoaded 47, HostGrant 48 and HostRelease 49 (ids 55 to 57 by the family's rule, the M0 rows 7 and 8 kept reserved) with validators, JSON forms, fixtures and the C++ message layer (ea0e24d3; docs/WIRE.md); docs/verbs/cell-host.md's status boxes.
- The 03:30 sweep red and the morning order re-planned (2026-10-21, 03:33 to 06:37 PDT): 60 of 65 green on the cited train-30 plus layer stage; the rerun of the five held four: a-melee-reach (no hit claim reached the server, a train-30 regression under read), b-cloak-fight (0.9751 against a 0.97 bound set when Firebolt's perk riders wrongly applied; the server now refuses them under ADR-039), b-push (the layer's known refused second Ragdoll), b-spell (the layer's Firebolt 20 against the vanilla constant: fixed, main aa2dd21, the served band). The merges wait; the path: the layer re-staged with main's settings, the fixed m2-train-31 staged on it, one sweep, both merges citing it.
- The four reds read and the merges unblocked (2026-10-21, 06:40 to 06:58 PDT): a read agent over the runs and the train-30 code found no fork fix. a-melee-reach: the swing sent, no OnHit on the server at all, the hit path whole on the same image; c2 at 179.4 units against the sword's edge at 185, the verb doc's own watch item: c2 to 170 (main 8550593). b-cloak-fight: 0.97 derived from a 3-tick run against a 2-to-4 tick measurement (a Blood Boil tick is 12.5 of 1000, two claimed in both reds): 0.98 (main 673db44). b-spell: aa2dd21. b-push: the known refused second Ragdoll, Eli's word pending; its probe x-push-knock-frida has never run (numidium asked for a slot). Step 3 stages m2-train-31 at 9ad635cd unchanged. Side rows in PLAN: x-melee-edge under the layer, GetGlobalValue's index space for 2020e99 (HYPOTHESIS).
- cell-host's server side (2026-10-21, 06:40 to 07:15 PDT, fork m3-cell-host 8f17d7a4 and 9aadeaea, CI 2477 pending): reach became a fact with decisions (the game loads a 5x5 while the server's grid is a 3x3, so a cell is often loaded before it is reached; a cell newly reached that the game has loaded and nobody hosts is granted, the grid dropping a hosted cell arms the grace, reaching it again disarms it; one rule for every transition, loaded and in reach); wire-bridge Cells and wire-validate's tests for the three messages; the core: WorldState::CellOf (an interior's own CELL, or the exterior CELL at the floor grid square from libespm's index) and HostOf, PartOne's OnCellLoaded, RefreshReach, TickCellHosts and the disconnect's gone, HostGrant and HostRelease to the player's game, the cell's actors flipping isHostedByOther (the host's own; hosted by other on every other screen and on every screen while unhosted: frozen by default), ActorUpdatableBy, GetActorToSendTo, the hosted caster and aggressor checks and DelegateToHost through the cell's host, the cell-change rule in OnUpdateMovement with MovementValidation's bounds standing aside for that case alone, Host 14 read and ignored, HostStart and HostStop no longer sent, the hosters map retired; unit/CellHostTest replaces HostAttemptTest. HostedActorState's epoch deferred to npc-stream (a field with no sender is dead wire).
- cell-host's client side (2026-10-21, 07:15 to 07:30 PDT, fork m3-cell-host 5f10768c and 8145082b): HostService (the loaded set as CellLoaded from cellFullyLoaded and a once-a-second Cell.isAttached read, re-sent when the player's own actor is created; grants and releases per cell with the monotonic epoch; isHostedHere and isMine, the grant and the server's isHostedByOther agreeing), asked by formView, hitService, magicSyncService and sendInputsService in place of storage['hosted']; tryHost, hostAttempts.ts, the quiet-figure re-host and the HostStart/HostStop handlers retired; the cellHost settings key; the client type-checks (yarn classic through npx, tsc --noEmit). Server: a played actor is nobody's to report for (the hosted caster and aggressor checks), and the player's own accepted movement refreshes its reach. CI 2477's one red was the test's 4000-unit player step against the ground budget; the player is placed by the server there now.
- cell-host's round trip, T2 session and lab facts (2026-10-21, 07:25 to 07:45 PDT, fork m3-cell-host f2b59a33 to 29a7b56e): wire-renet-clock merged into the branch; the round trip through wire-bridge client_rtt_ms, IServer::GetRttMs, WireServer, the combined server and PartOne::SetRoundTripSource, read every cell-host tick (CellHostTest's third case ranks two visitors by it); difftest session cell-host.yaml at the T2 spawn's cell (Tamriel (32, -15), 0xbbb1, read from Skyrim.esm's XCLCs on sky-srv); the host table listed for the lab (Cells::hosts, mp.get(0, "cellHosts"), the gamemode's labState cellHost and ref kinds, main 6c1adbe, lab-api's server.host and server.ref specified to numidium). The doc's persistent-cell HYPOTHESIS measured: Tamriel's 0xd74 carries (0, 0) beside the map's 0x99a2; libespm's index now takes only a cell inside an exterior sub-block (29a7b56e, EspmTest). CI 2481 green (8145082b); the later heads building.
- cell-host's lab side drafted (2026-10-21, 07:40 to 07:50 PDT): the driver's cell-events-start and cell-events-stop (main 4b69e9c, built), the probe x-cell-attach (lab/.cache/probes: coc riverwood, a walk into (5,-11) and back, the inn and out), the scenario b-cell-host (main 9a5272e, reviews-pending for Eli: Tamriel (30,-20) 0x9810, the leveled predator 0x85547 read from the master's ACHRs; the hunters' camp flat's own cell holds Stalleo's vanguard, humans) and its four lab-api asks to numidium (server.host, server.ref, a snapshot compare, the run's own npcEnabled). The M2 sweep 20261021-144529-m2-close runs 07:45 to about 10:45 on m2-train-31 9ad635cd over the re-laid layer; both merges and the promotes follow it (numidium).
- cell-host's branch green (2026-10-21 08:05 PDT): fork m3-cell-host 29a7b56e passes CI whole (2481 at 8145082b, 2483 at f2b59a33 with the round trip, 2487 at 38f29158 with the lab facts, 2488 at 29a7b56e with the libespm guard); the verb's T2 run and the lab's probe wait for the M2 merges.
- npc-puppet's verb doc drafted (2026-10-21, 07:50 to 08:10 PDT, an agent from ADR-035 point 4 and the client half of point 1, re-ai-puppet.md, skymp-hosting.md, the 10-17 and 10-18 readings and cell-host.md; reviewed: every Address Library id named traces to the research, no offsets, no em dash, every template section): the games that do not host a cell show its NPCs as the engine's own placed references with AI off and graphs ticking at the host's relayed positions and events; the world cleaner and the PlaceAtMe copies retire for them; the loader's three bans lift behind npcEnabled; no new message (rule 4 met by no change). Ten HYPOTHESIS tags, the biggest the puppet's walk cycle from relayed graph variables (H2, probe P4, the fallback named); the prototypes of 41370, 41453 and 37356 delegated to the re-analyst before any hook is coded. The research's gaps noted in the doc: ADR-035 point 7's EvaluatePackage against the sit-state condition, the CK wiki's AI-off Havok claim against the measured slide, Embry's door under cell-host's cell-change rule, no npc-state package read on a puppet, two lab-api facts the T3 needs (a seat's npc-state by form id, its 0xff actors by base).
- npc-puppet's engine prototypes read (2026-10-21, 08:13 to 08:43 PDT, the re-analyst through REA on sky-re, 30 min, 78 tool calls): 41370 (ProcessLists*, the stage's job list; gates only runAnimations and the high actors' count), 41466 (the one kProcessMe test on the animation path, plus 3D with a parent, an attached cell, not deleted or disabled, a process), 41453 (a 32-bit ActorHandle in ecx, not an Actor*; a sibling of vtable 0x7D's body; the graph tick through 20123 and UpdateAnimationGraphManager with no hidden gate in six bodies), 69349 (jobs, fn, arg; the fourth argument dead), 37356 and its chain from stage 39053 through 41306, 41444 and 37350 (Actor* and the per-actor delta; no kProcessMe read anywhere in it); the handle paths; the Frida trace that confirms or falsifies each. Pasted into docs/verbs/npc-puppet.md's Engine surface (main 0afa73a); seven corrections appended to re-ai-puppet.md, the largest that rcx is the Actor* only for 37350, 37355 and 37356.
- The M2 close sweep and Eli's two words (2026-10-21, 07:45 to 11:05 PDT): run set 20261021-144529-m2-close, 70 scenarios on m2-train-31 9ad635cd over the re-laid layer, 69 green, b-push red twice (the known refused second Ragdoll in the victim's own game; its probe crashed its first seat and is lighter since). Eli at 11:03: "carry b-push to m3, approve b-cell-host": b-push pending at the merge under ADR-042b (numidium's; the probe on the first free slot, the fix in M3's first train), and b-cell-host approved (reviews-pending ticked), so cell-host's T3 counts on its stage. The merges (verb-merge m2-train-31 citing the set and T2's log, the layer's merge citing the set and its smoke, both promotes, deploy-srv) are numidium's next.
- The next playtest chosen (2026-10-21 11:07 PDT, Eli: "go with the first one"): M3's first look, playtest thirty, cell hosting live on the existing NPC copies with npcEnabled on, seats aimed at 2026-10-22 evening if cell-host's stage goes green today (PLAN's M3 section); the M3 proper playtest (npc-puppet's engine references on every screen) follows three to five days after cell-host proves out.
- m2-train-31 merged to fork parity 9ad635cd (2026-10-21T18:10Z): the gate 20261021-144529-m2-close (cited, ADR-042, red only on b-push, pending at the merge under ADR-042b), 20261021-144529-a-activation-reach to 20261021-175042-t2-fakeclient-restart (71 runs); T2 green at 9ad635cd beforehand (32 sessions identical); clones not promoted here (ADR-042a: the layer's merge promotes the pair). Verbs: train-30 folded in, and train-31's six rows of playtest twenty-eight's report with the snap-back and the flights' origin (the Train-31 built entry, 2026-10-20).
- stage-layer-train31 (a mod layer) merged to main b0252470 by merge commit (2026-10-21T18:12Z): the full sweep 20261021-144529-m2-close (cited with m2-train-31, ADR-042a and 042b; the layer's own run 20261021-135859-smoke-two-players), 20261021-144529-a-activation-reach to 20261021-175042-t2-fakeclient-restart (71 runs); both clones promoted (clean-m1-next to clean-m1, 11:12 PDT). Plugins: the essentials layer as re-laid at fd1ed9fe, its deciders a-rotfern 140130, a-racemenu 140513 and b-duel 140854 green.
- M2 DONE (2026-10-21 11:13 PDT): the train and the layer merged as one stage under one sweep; b-push carried to M3 by name (Eli, 11:07: "carry b-push to m3"; docs/verbs/push.md; its probe x-push-knock-frida 20261021-175459 read: c2 is never thrown under the layer, the stagger re-knock refuted, the refused Ragdoll's sender unread).
- Two readings on merged parity 9ad635cd (2026-10-21, 11:24 to 11:34 PDT, numidium's runs): x-survival-needs-relaunch 182745 green as a finding: the server restored the three needs at the relaunched login and they held for 90 s only because Survival_ModeEnabled 0x826 stayed 0 (the Creation had not re-enabled Survival in the relaunched game; cold stopped falling); HYPOTHESIS that its later start writes the start values over the restored ones, Eli's reset; the next probe reads out to five minutes with an 826 assert (player-globals.md). x-renet-loss 182102 red under 25 percent loss (c2's figure never cast, a start never sent again) with the no-loss control 182443 green: the transport clock bug's measured face on parity; the after-reading rides cell-host's stage (transport-clock.md).
- cell-host's first stage and its reads (2026-10-21, 11:45 to 11:58 PDT; verb-stage m3-cell-host c0e4a029, numidium): smoke green; x-cell-attach refused at its POST (lab-api's CLIENT_ACTIONS lacked the two driver names; fixed main 854c63b, to rerun); b-cell-host 184501 RED at the first host check, read from server.log and c1.log: the election worked (nine grants at the login's reach, the reach-drop grace at the teleport, c2 taking the spawn's cells at epoch 2, the rest frozen), the CellLoaded budget failed (the login's 30 reports, then a teleport's 25 unloads and 25 loads within 60 ms against 32-then-8; the landing cell's report refused, E_VAL_RATE, never retried); the budget is 128 then 32 a second, carried with the numbers (fork a591bdeb, server-side only). x-renet-loss's after-reading 184702: the end arrives under 25 percent loss where the before-reading's start never did, once 2.7 s late (head-of-line on the ReliableOrdered channel, HYPOTHESIS; a transport row, transport-clock.md).
- x-cell-attach green and read (2026-10-21, 12:05 to 12:14 PDT; run 20261021-185728 on cell-host's first stage, numidium): cellFullyLoaded fires once per cell (25 at an exterior load, 5 at a one-cell shift, 1 at an interior's door, 5 then 24 at the coc back out), isAttached read every 250 ms tracks the detach within a sample, the parent cell reads floor on both axes (0x9732 at (17225, -47204); 0x9731 to 0x972e along y about -48000): the verb doc's H1, H2 and grid-math tags lifted. Side findings: a runtime 0xff exterior cell is reported (the client should skip it); the driver's move step ran the player east for the whole run instead of to its target (a driver fault, to read). The five-minute Survival read (x-survival-relaunch-start 190130) is a finding: 0x826 never turns 1 in a relaunched game whose 0x828 the server restored as 1; an agent reads the Creation's scripts for the enable path.
- Survival's relaunch enable read and fixed (2026-10-21, 12:15 to 12:40 PDT; an agent over the Creation's 38 scripts on sky-srv with the two runs' screenshots): the relaunched game's start runs each need's first tick before it sets Survival_ModeEnabled, and with the restored values at stage 2 or more the tick opens the Creation's modal help box (Survival_HelpHungerHigh, then cold and exhaustion), which pauses the game under a dead single-shot poll: both runs ended under the HUNGER box. The earlier HYPOTHESIS (StartNeed overwriting the values) is refuted: nothing in the start writes NeedValue. Fix without code: the three help-shown flags 8e0, 8e1, 8e2 kept as playerGlobals with the lab default 1 beside 8df (lab/deploy/sky-srv/server-settings.json and the 1.7.104 file; numidium deploys); the relaunch read with them is the confirming probe; a restored cold of 1000 is a death on the first tick (CheckIfMaxCold). docs/verbs/player-globals.md carries the read.
- cell-host's second stage (2026-10-21, 12:10 to 12:36 PDT; verb-stage m3-cell-host 6ac33367, numidium): smoke green; b-cell-host 192314 held the first two blocks (c1 hosts 0x9810 at epoch 1; the second visitor gets nothing) and failed the away-and-back block on the scenario's own timing (a teleport step lands 3.2 s after it starts, so the away time was 3 plus 3.2 against the 5 s grace; c2 rightly took the cell at epoch 2 two seconds before c1 was back): the wait is 0.5 s (main e6e9474). The rerun 192835 lost c1's game 50 s in: CrashLogger's job thread on a MovementControllerNPC for a Character "Deer" [0x00000000] (the form id read from freed memory); the deleting side is skymp5-client's world cleaner, which picks a random actor within 8192 every update and runs a latent disable then delete, and picks the same actor again under its disable: two chains, the second delete on a freed Character (HYPOTHESIS for the cause, MEASURED for the double pick; no hosting flip on the stack; the lab's first runs with npcEnabled on). Fix fork a896acf3 (an actor being cleaned is skipped; a form gone or deleted at the disable's end is left alone), another Windows build and stage; two probes meanwhile (b-cell-host as is; the solo hold with npcEnabled).
- b-cell-host's fourth run (2026-10-21, 12:36 to 12:45 PDT; 193557 on the 6ac33367 stage with the 0.5 s wait, numidium): no crash; the asserts at steps 6, 9, 14 and 17 hold (the first loader at epoch 1, the second visitor nothing, the grace's return keeping c1, c2 taking 0x9810 at epoch 2 past the grace, "stops hosting cell 9810" at 19:38:18.4); step 19's c1.printed read false although the console step's history carried "Trace in HostService: released cell 9810 (epoch 1)": lab-api's reader read only the step's own lines, fixed main b5e41ad, no scenario change. The x-cell-attach walk fault was lab-api's move step (a written target taken as an offset from the server's record, the stale spawn in a solo run), fixed the same push, not the driver. Next: the cleaner hold before the fix, the lab-api pull, b-cell-host to its relaunch and restart blocks, then a896acf3's re-stage with the hold as the after-reading.
- The crash's likelier path (2026-10-21, 12:45 to 12:52 PDT): the solo hold x-npc-cleaner-hold 193854 (c1 alone, npcEnabled, 3 min at 0x9810 and 3 at Riverwood) saw no crash, so numidium's contrast point (the crash came 50 s in as c1 took the cell with c2 arriving) sent the read to formView.destroy: a figure or NPC copy is deleted outright on the next update, no disable, harmless for a player's figure that no AI moves, but a copy the game hosts runs under the engine's AI, and c1's teleport away from the spawn destroyed the spawn's copies (deer among them) that its engine was running as the host of the spawn's nine cells since the login: a delete while the movement job still ran them is the crash's shape. Fix fork 535544db: disabled first, deleted once the latent disable returns (the Creation Kit's rule for Delete), in formView.destroy and the death-state respawn path; the cleaner's guard a896acf3 rides along. The stage moves to 535544db; b-cell-host's teleports out of hosted cells are the after-reading.
- cell-host's third stage (2026-10-21, 12:58 to 13:16 PDT; verb-stage m3-cell-host 535544db, numidium): smoke 200814 green; the old b-cell-host 201045 held steps 6, 9, 14, 17 and 19 with no crash (no E_RUN_GAME_REPLACED, no crash log) through c1's teleports out of hosted cells with wildlife: the after-reading for the disable-then-delete fix, one clean run against one crash in three on the stage before, a weak sign the new scenario's teleports add to; red only at the old relaunch block, which main 7ef5522 replaces (relaunch {until: gone}, lab-api c176d7e). The new b-cell-host runs by hand on this stage once the chain has pulled lab-api 608113b; T2 at 535544db runs beside.
- cell-host GREEN at T3 (2026-10-21, 13:14 to 13:25 PDT): b-cell-host 20261021-201430 on the 535544db stage, all twelve asserts, no crash (the first loader at epoch 1, the second visitor nothing, the return inside the grace, the handoff at epoch 2 with the release printed, unhosted at epoch 2 six seconds after the host's game is gone, the relaunched game hosting at epoch 3, the freeze over 10 s with nobody in reach, c1 back at epoch 4, the restart's epoch 1 within 10 s, the double entry's one grant); relaunch {until: gone} returned 15.5 s after the stop (c2 off the list 11.6 s after its game stopped), the connect 10.7 s, the restart 10.5 s. The verb doc's remaining tags are lifted or carried by name (H5 waits for a third seat; H6 and H7 are npc-stream's; H8 npc-handoff's); the sequences table carries its runs; every status box but T2 is ticked. T2 at 535544db runs; the merge (`just verb-merge m3-cell-host b-cell-host`, the set always plus b-cell-host plus watch) follows it, so playtest thirty runs on merged parity.
- m3-cell-host merged to fork parity 535544db (2026-10-21T20:47Z): the gate 20261021-202319-merge-m3-cell-host, 20261021-202319-smoke-two-players to 20261021-204428-b-invis-recast (8 runs); T2 green beside the gate at 535544db (T2_LOG, 33 sessions identical, cell-host's included); clones promoted. Verbs: cell-host, M3's first (docs/verbs/cell-host.md; ADR-035: the cell's NPCs under one game's AI, the server's election with a 5 s grace, the epoch on every grant, unhosted cells frozen at their records). Its T3, b-cell-host, green on the stage first by hand (20261021-201430, all twelve asserts) and again in the gate (203119). On the way (the day's reds read in order): the CellLoaded budget and its 30 s re-report, the client's disable-then-delete of a hosted copy (a deleted deer under the engine's movement job crashed c1, 192835) with the world cleaner's guard, and lab-api's move target, printed()'s matched history and relaunch {until: gone}. No gate run lost or replaced a game.
- cell-host DONE (2026-10-21 13:47 PDT): merged to fork parity 535544db by `just verb-merge m3-cell-host b-cell-host` (numidium; the gate 20261021-202319-merge-m3-cell-host, 8 of 8 green, no rerun, no game lost; T2 33 sessions identical, cell-host's among them), both clones promoted, main 6b593f6 pins it, deploy-srv from main with the Survival help flags. M3's first verb, built and proven in one day: the doc 00:30, the rules and wire 01:00, the core and client by 07:30, the lab proof 11:45 to 13:25 through three stages and five fixes, the merge 13:47. The transport clock fix (wire-renet-clock) is on parity with it. Playtest thirty (M3's first look) can be set up on Eli's word.

- The playtest-30 profile's build line follows (lab/playtests/30.yaml).
- Playtest thirty under way and its first finding fixed live (2026-10-21, 15:04 to 16:47 PDT): seats ready 15:04 on fork parity 535544db with npcEnabled for this server alone (numidium; the first setup try stopped on a root-owned overlay file, fixed main c735f94); both seats to the forest cell 0x9810 at 15:06 (test 1 the host at epoch 1). Eli at place 1: "the wolves are like,,, spinning around in place", on both screens in different directions. Read: the relay echo. RelayToListeners sent a hosted actor's reports to every listener including the host that sent them (the verb doc's Suppress section claimed the skip; the code never had it), and the figure's animation replay is not gated on who hosts, so the host's own wolf got its own turn and movement events back; test 2's copy got them too under its own engine AI (npc-puppet's AI switch is what ends that side). Eli: "go ahead and fix it now" (16:3x), his word over the freeze. Fix fork branch m3-relay-echo 41f554ad off parity (a hosted actor's report is not echoed to its sender; a player's own actor keeps its echo; CellHostTest asserts the relay reaches the other game once and the host not at all; the first head 74291a37 red on the test's own 5 units). Live at 16:47 by `just turbo-srv m3-relay-echo-41f554ad` (numidium: the world saved as playtest-turbo-m3-relay-echo-41f554ad-20261021T234658Z, the server swapped alone with the npcEnabled mount kept after a turbo-srv fix, main 4835bc4; both seats back in 28 s; the hold stands to 18:03). The branch goes through verb-merge after the playtest.
- The wolves' deep dive and the one-shot plan (2026-10-21, 17:00 to 17:41 PDT; Eli: "take some time to really deep dive. use skyre to its fullest ... come up with a one shot implementation plan"): three reads in parallel (our code paths on 535544db and m3-relay-echo; the prior art, TES3MP, Skyrim Together, SkyMP upstream and the CK; REA on sky-re over the keep-offset, rotation, EnableAI and PlaceAtMe paths) plus numidium's live reads on the host seat (results playtest-30-wolves/01 to 08, lab-api 8adfcacf admitting refs-near, npc-state and npc-ai as playtest steps). The cause, measured: the grant's isHostedByOther flip went out under the raw u32 id while CreateActor had used id + 0x100000000, the client's engine-reference branch dropped it, so the host never reported a game-file actor (the record of 0x85547 identical across five reads 2 s apart) and every screen re-applied the frozen record every 2 s (a moveBackward/moveForward pair every 2 s on a wolf near nobody), the apply's self keep-offset with a nonzero angle being a turn that renews itself every frame (REA: planner agent 42182's goal is the actor's own angle plus the offset, in the per-frame pass; Clear only flips a mode byte). A second defect beside it: the copies' own AI in combat with the host player, attacks blanked. The plan (approved 17:41): npc-puppet built whole on fork m3-npc-puppet, six stages, the probes P0 to P5 then b-npc-puppet, no playtest between; ADR-045 proposed; the premise of 17:0x ("the host spins, the non-host mirrors the relay") withdrawn: there was no relay for these wolves at all.
- npc-puppet Stage 1 pushed (2026-10-21, 17:41 to 17:52 PDT; fork m3-npc-puppet a29bfb08 off parity 535544db with m3-relay-echo 41f554ad merged, pipeline 2555): CreateActor sends a game-file actor's own id with baseRecordType NPC_ and no hosted flag, UpdateHoster sends nothing for such an actor, the loader's essential/unique, crime-faction and playable-race bans lifted under npcEnabled; CellHostTest's game-file case (the cow 0x10ebaf: own id, no flag, no property at the grant, the host's report relayed once and not echoed, the other game's dropped) and the 0xff flip's assertion; NpcExists reads the flag under props (the top-level read was vacuous) and loads Alvor 0x13482. T2 keeps no ESM actor (the T2 settings have no npcEnabled and the legacy image is frozen on the old id scheme); the docs of the same hour: npc-puppet.md's "Why now", Rule A to C, H11 and P0; cell-host.md's correction; WIRE.md's note. Stage 2 (the Skyrim Platform switch; R1, the step-time write, with the re-analyst) and Stage 3 (the client) follow; numidium's grammar after Eli's report.
- npc-puppet Stages 2 and 3 pushed (2026-10-21, 17:52 to 18:20 PDT; fork m3-npc-puppet): the client first (eaa3b6d0, tsc clean against a sibling worktree's node_modules): an actor from the game files gets a form model and a view bound to the engine's own reference (remoteServer's NPC_ test, formView's engine path with attackDamageMult 0 and no dealWithRef), HostService.isMine reads the grant alone for it and the report list follows isMine, PuppetService (new) switches every NPC this game does not host to a puppet at cellAttach, at the view's update and at a release, and back at the grant (the record's last point first), with the combat sink undoing a draft (H6); the view applies nothing to an actor this game hosts (Rule A); a puppet's movement is written absolutely (Rule B: setAngle, Speed and Direction on the graph, no keep-offset); a figure's offset angle wraps to the short way; the cleaner keeps every engine reference; the hit, headshot and activation services recognize a server actor by the world model (isSyncedActorId) instead of a 0xff id; settings key npcPuppet. Then Skyrim Platform (d9a003fd; the SP map by an agent: Napi exports registered in SkyrimPlatform.cpp's lambda, Definitions.txt plus the codegen, function-entry detours through Frida Gum's Replace, the weapDrawnMode share's mutex idiom; no T1 exists, `just addr` and the install logs stand for it): setPuppet and isPuppet (PuppetApi), the set (Puppets), PuppetHooks with the two Gum replacements: 41370 queues the engine's own job 41453 through its push 69349 for every flagged AI-off actor 41466's gate dropped, and 37356 runs Actor::Move(delta, zero) for a flagged actor instead of the step. R1 by the re-analyst (REA, 18:0x): the controller's step time is stamped only inside its simulate 78275 through Move (37507); Skyrim Together's plain early return leaves it zero and the rigid-body controller's two readers divide by it (their #901), so the detour Moves at rest instead; shape 4 (plain return plus one Move while the step reads 0) is the fallback; every id by `just addr`. The Frida probe script lab/frida/npc-puppet.js (6ce514e): P0's spin autopsy and P1's counts. Pipelines 2555 and 2557 red on one new assertion alone: the 0xff wolf's isHostedByOther flip was not sent to its host at the grant because, created a moment before, the wolf had no listeners yet (the dump: "actor listeners 0, c1 emitters 72"); the live game's 130 ms reports subscribe long before any grant; the test now has the players report once (22240db7). Eli, on the figures: "when a player loads in there is a brief moment where they too are spinning before the control is handed over": the same keep-offset mechanism, held by the owner's first report a second or two later; a small row for the figure's first apply.
- npc-puppet green at CI (2026-10-21, 18:20 to 18:35 PDT; fork m3-npc-puppet eab366b2, pipeline 2562: server-build and the Windows client-build success). Two more reds on the way: 2560 on the same test assertion (the players' standing reports run no grid pass; a created actor joins the grid at its own first SetPos, which PartOne::CreateActor never writes, so the test writes it once, 6f08c050; in the live game the host's first report for a server-made actor does it, and a gamemode that spawns an actor without a position write leaves it unseen until then, a row for later) and 2558's Windows compile (Actor's currentProcess and boolBits live behind GetActorRuntimeData() in the NG pin, eab366b2; memory commonlib-runtime-data-accessor). Status boxes: server logic + T0, message + validator, TS handler ticked; native hook + T1 waits on P1's install log and counts. The lab side (T2 on the stage, P0 on today's copies, P1 to P5 on the new dist, b-npc-puppet) waits on Eli's playtest-30 report, then numidium's grammar (heading in watch samples, a seat's npc-state fact by id, a seat's 0xff actors by base, the driver step npc-puppet {formId, puppet}).
- Playtest thirty closed (2026-10-21 21:00 PDT; Eli: "then yes im done go for it", after "im stopped at the wolves spinning because the whole thing is contingent on that working presumably yes?"; yes: every NPC on the build is a copy pinned against a frozen record). The report as given: the wolves spinning on both screens from the first minute, one stopped for good on test 1, the host's copies lunging at the host player without damage; his figure note (a figure spins a second or two at login until its own report lands: the same mechanism). Nothing was deployed to the playtest after the 16:47 echo fix; the npc-puppet build stayed on the fork (CI green eab366b2) and the grammar on numidium's branch. The lab sequence at his word (numidium): the playtest close, P0 x-npc-spin-autopsy on today's build before any swap, the grammar merge (lab-npc-puppet-grammar 4cd1a31: npc_state, runtime_of, the watch's heading and turns, the npc-puppet and npc-pose steps, gameHour) and lab-api deploy, `just verb-stage m3-npc-puppet`, x-npc-puppet-2 on the staged dist, then b-npc-puppet (its own commit after the merge, Eli's review) with b-cell-host, the gate, playtest 31. Checklist docs/private/playtest-m3-30.md closed with the result; sections 3 to 7 move to thirty-one's list unchanged.
- npc-puppet's lab sequence begun (2026-10-21, 21:00 to 21:3x PDT; numidium): playtest thirty saved as playtest-m3-30-20261022T040151Z and released; P0 x-npc-spin-autopsy 20261022-040233 GREEN on its asserts (the record of 0x85547 frozen across the run, the console history all "block anim" lines) but its Frida artifact 0 bytes: numidium read the .out on c1 once the stage stopped the game, "TypeError: cannot define variable 'ptr'": the script's top-level helper ptr shadowed Frida's global, so nothing ran; and frida-inject's stdout to the .out is block-buffered, so a short trace's lines or its load error never reach lab-api's end-of-run fetch (the long traces only ever showed output by filling the buffer; the fetch fix is numidium's, before x-npc-puppet-2's P1 trace). A second script defect found reading lab-api: params arrive as globalThis.LAB_PARAMS, not params. Both fixed on main (ae07f44, a4996b1; memory frida-lab-script-pitfalls). No 535544db client remains, so P0 is retired to the static evidence as the plan allowed. The grammar lab-npc-puppet-grammar 4cd1a31 merged to main 9b4bec3 (742 tests), its lab-api image 2566; `just verb-stage m3-npc-puppet` (eab366b2) running from main 9b4bec3 with the new driver, smoke and T2 first; b-npc-puppet committed alone to lab/scenarios (3a3aef0; loaded 44 steps, the 742 lab-api tests green locally), Eli's review entry in reviews-pending.
- x-npc-puppet-2's first run (2026-10-21, 21:25 to 21:40 PDT; 20261022-042521 on the npc-puppet stage, numidium; the Frida trace empty, the rest real): the export switches the AI (false 10 s after npc-puppet true, true 0.5 s after false); the pose step moved the AI-off puppet 500 units to within 3 units of its target (H3) and left its heading at exactly 90, profile in the frames (H11); one write of Speed and Direction put the graph into a stride at 0.2 s, gone by 1.2 s with the body arrived and nothing re-written (H2 supported; the sustained cycle is b-npc-puppet's frames); the shout staggered the puppet with its graph playing it (IsStaggering 1495 to 4228 ms, the head 28 units lower: H1) and the body moved 12.7 units at most against the 120-unit slide of 2026-10-18 (hook 3's Move at rest); the draft into combat measured again and, solo, never undone (the sink is the client's: H6 open for the two-seat run); at the promote the bandit moved within 0.5 s and attacked after the second shout (H5). play-idle returned false on the AI-off actor (Papyrus PlayIdle refuses it); the sneak frame inconclusive (H7). Smoke 20261022-042248 GREEN on the stage; T2 running identical. docs/verbs/npc-puppet.md's Dynamic plan carries the readings.
- b-npc-puppet approved (2026-10-21 21:36 PDT; Eli: "approve b-npc-puppet"; the entry in docs/private/reviews-pending.md ticked). It runs on the npc-puppet stage with b-cell-host beside it once T2 and P1's rerun are through (numidium), then `just verb-merge m3-npc-puppet b-npc-puppet,b-cell-host`; the merge after the gate as always.
- npc-puppet T2 green (2026-10-21 21:39 PDT; numidium: test-proto at m3-npc-puppet eab366b2, 33 of 33 difftest sessions identical between legacy and wire; the log scratchpad/t2-m3-npc-puppet.log is the one verb-merge's T2_LOG cites). The frida fetch check waits on a9aa9d6's lab-api image; then P1's rerun, then the gate with b-npc-puppet and b-cell-host.
- P1 read (2026-10-21 21:50 PDT; x-npc-puppet-2's rerun 20261022-044255 on lab-api a9aa9d6, the trace 281 lines): the detours installed (c1.log's "[verb:npc-puppet] detours installed: animation queue true, movement step true"), the demote and promote logged natively; on the trace's clock every Move during the puppet phase carried a zero translation, the stagger included, and the controller's output returns in the second of the promote: hook 3 confirmed, the step skipped and the controller ticking at rest with its step stamped every frame (no zero steps on the simulated controllers). A first misread corrected: the step's entry count stays at frame rate under a Gum replacement, so the translation is the discriminator; and the step list's seconds, not the trace's ready stamp, put the switch 8 s off. One zero-step hazard twice a second on a controller the engine never simulates, from before the puppeting, not ours (HYPOTHESIS, harmless). The native hook box ticked. The gate runs (verb-merge m3-npc-puppet b-npc-puppet b-cell-host with T2_LOG); lab-api's frida-step idle wait is on main 6cd980c.
- npc-puppet's gate RED (2026-10-21 22:09 PDT; numidium): b-npc-puppet 20261022-045602 and b-cell-host 20261022-045917 both lost c1 at step 4, its first teleport into a cell with server-known NPCs (Riverwood; 0x9810): the server's record at the target, the game alive and never answering (E_RUN_TELEPORT after 60 s), lab-api's hang dumps taken (c1-SkyrimSE.dmp in each run, 5.3 GB; copies on sky-re at /srv/persist/dumps/20261022/). Parity does not move. The same b-cell-host passed twice on the 535544db stage and playtest thirty stood in 0x9810 for hours; on this stage the solo probe (no server actors) passed twice and the smoke (no NPCs) passed, so the landing's puppet path (CreateActor for every actor of the cell, the demote at attach or first view, the promote at the grant) is the first suspect and the known load freeze (docs/research/load-freeze.md) the second. Under way: a dump read on the Mac (every thread's stack against the Address Library, the load-freeze method), numidium's solo discriminator x-npc-cow-solo (cow tamriel 30 -20 with the detours installed and no puppet) after the gate's watch runs. Two hardenings prepared on the fork branch, unpushed until the cause is named: setPuppet's actor lookup moved to the game thread (performAction's shape; a JS-thread lookup under the forms map's lock while the game thread waits for the tick is the one place the puppet path differs from every export the solo run exercised), and the client's demote waiting for the actor's 3D. Playtest 31 waits.
- The gate's reds narrowed (2026-10-21 22:16 PDT). Run set 20261022-044752-merge-m3-npc-puppet: 6 green, 3 red; parity still 535544db. a-racemenu 050437 CONFIRMED a regression of the branch: c2.log's "[verb:npc-puppet] puppet ff00081d / ff0008fd / ff000900 / ff000901" lines, one per incarnation of c1's figure, since PuppetService's cellAttach path demoted every actor attaching in a cell c2 did not host and a figure's hold (the keep-offset on itself) is an AI package. The solo discriminator x-npc-cow-solo 20261022-051307 GREEN (numidium): `cow tamriel 30 -20` on the stage's dist with the detours installed and no server landed and answered 60 s later among two wolves, so the detours' presence and the engine's wolves do not hang a landing and the old load freeze is not it; the puppet path on landing is (CreateActor for the cell's copies, the demote burst at attach, c2.log's sixteen demotes in 5 ms, setPuppet's lookup during the load). Three fixes pushed, fork m3-npc-puppet 9faa4be0: setPuppet's actor lookup on the game thread alone (performAction's shape); the client's demote waiting for the actor's loaded 3D and the native demote skipping the keep-offset clear while the actor has no movement controller (37895 reads it with no null test); a player's figure never demoted. The dump read (every thread's stack against the Address Library) runs on for the mechanism's record; a re-stage and the gate follow the Windows build.
- The landing hang read (2026-10-21 22:49 PDT; the dump of b-npc-puppet 045602, 5.36 GB, parsed on the Mac with the minidump package, 115 threads scanned for return addresses and the exe's turned into Address Library ids through lab/addr.py's database, dump/threads.txt): a different hang from the load freeze (the image base's slot outside the NaN ranges, TMS AI Pathing Freeze Fix armed and silent, 70172, 90711 and 93210 on no stack, no exe thread spinning). 114 threads wait; the one running thread is Skyrim Platform's JS worker (88 s of CPU), spinning in V8's stack-handler unwind: the StackHandler at the live entry frame links to itself, which a JS entry at that depth leaves behind when it exits without unwinding (a C++ or SEH exception thrown through V8 frames); beneath it AcquireEnvAndCall nested twice, the "update" function, a hooks-API function (its strings handlerObj, minSelfId, maxSelfId, pattern, remove) and a V8 API call, with a lazy deoptimization in progress. The Papyrus job thread waits in OnUpdate's io_context::run for the StopWorker that never comes; the primary thread waits in the frame update (36564, then 36555) on an event. The timing from c1.log: the hang is at the first ticks after c1's LOAD, 0.6 s after PostLoadGame, at the old benign filename line (DigitigradeKhajiit+ArgonianRaptor.esp refused by the plugin-name check, present in every run on every build), before any teleport; in every green run on this stage the demote burst follows that line within 0.1 s, and the two hung runs are the only ones whose server had NPCs on, so the trigger is the new client path at login (form models and views bound to the spawn's game-file wildlife at the first update), not the detours (x-npc-cow-solo green) and not setPuppet's lookup (the JS thread spins, it does not wait). The three pushed fixes (9faa4be0) do not cover it; numidium stopped the restarted gate after its smoke (run set 054143), parity untouched, the stage laid on 9faa4be0. Next, rule 8: lab/frida/exception-trace.js (ccfe3ec: every exception raised by thread with its stack, a C++ throw's class names from its ThrowInfo, first-chance faults) attached before connect in lab/.cache/probes/x-npc-landing-trace.yaml on the laid stage; the second dump checked for the same signature. The Windows artifact ships no PDB for SkyrimPlatformImpl.dll (build/dist alone), so the hooks-API frame stays an offset: a row.
- The landing hang named and fixed (2026-10-21 22:5x to 23:06 PDT). The second dump (b-cell-host 045917) matched the first byte for byte and placed the spin: the frame under the spinning JS entry held the login's benign filename error, so the spin began inside that exception's unwind. x-npc-landing-trace 20261022-054932 reproduced the hang on 9faa4be0 with lab/frida/exception-trace.js attached (no C++ throw, no fault in its window: it attached after the grant). Hook.cpp's AddHandler throws a C++ std::runtime_error whenever addRemoveBlocker is non-zero, an atomic any game or job thread raises before handing an animation event's Enter to the JavaScript thread, and the hooks API's add callback was unwrapped: the C++ exception crossed V8's frames, the handler chain was left dangling, and the next exception unwind spun. The npc-puppet build hosts game-file actors and adds one animation hook per hosted actor at the grant while those actors animate from the job threads: the collision was certain (the old builds met it only when a lone copy became hosted at the wrong instant). A second bug in the same server log: c1's player movement streamed under a deer's index for 28 s before the grant (the player's slot taken by a game-file actor's model; the id manager reuses freed slots) and moved the deer's record to the player once granted. Fixes on fork m3-npc-puppet 931de577: the hook guard as the JS thread's re-entrancy depth with add and remove wrapped; the client verifying the player's slot (isMyClone) on every player message and sending nothing for the player until its form is here. numidium: verb-stage 931de577 on green CI, then the gate with T2=skip citing t2-m3-npc-puppet-3.log (the server unchanged). The settings bisect stood down unrun; its JSON-key relaunch lever lands as a general tool.
- The hook fix did not hold (2026-10-21 23:38 PDT): the gate on 931de577 (run set 20261022-062334, smoke, a-restart-persistence and b-duel green) lost c1 again in b-npc-puppet 20261022-063157, at login, 4.5 s after PostLoadGame on the same last line, with SkyrimPlatformImpl.dll 6817a999 from job 10628 (Hook.cpp and EventsApi.cpp compiled from 931de577) on both seats; the dump staged on sky-re. So the AddHandler mechanism is wrong or not alone; it stays in the record as a real defect fixed, not as the cause. Next, no theory: the client's two settings switches through lab-api's new JSON relaunch lever (8d86aa06), one seat under npcEnabled each: cellHost false (no grants, no host path), npcPuppet false (grants and the stream, no demote or promote), both false if both hang (the engine-reference views and the puppet apply alone); and the new guard's "player message dropped: slot" lines from 063157's logs. The set runs on for b-cell-host's and a-racemenu's readings; parity cannot move on it.
- The landing hang's bisect by switches (2026-10-22, 23:49 to 00:12 PDT; numidium's runs on the 931de577 stage, parity still 535544db): the gate set 20261022-062334 closed red 7 of 9 (smoke, a-restart-persistence, b-duel, a-melee-reach, a-racemenu, b-spell, b-invis-recast green; b-npc-puppet 063157 and b-cell-host 063508 red, c1 hung at login before any grant, c2 lived). Then one seat under npcEnabled, c1's game relaunched with a settings key written by lab-api's new JSON relaunch lever: A cellHost false (x-npc-switch-a 064935) HUNG; B npcPuppet false (065308) HUNG, PuppetService inert; C both false (065645) HUNG, the identical signature each time (c1.log's last line the benign filename error 0.59 s after skse message 3; the dump-state timing out). Cleared: the grant, the host stream, the demote, both client switches. Needed: npcEnabled (the server's raw-id NPC_ CreateActors, with the loader bans lifted far more actors than parity ever sent), a fresh login, the first update after the load; every hang on c1, and c2 has never hung on a fresh login (its two fresh logins came 4 to 5 s after c1 had stopped). Architecture facts from the fork, for the dumps: Skyrim Platform runs the game's JavaScript on one pool thread (ThreadPoolWrapper.h, BS::light_thread_pool with one thread), OnUpdate hands the tick to it and spins an asio io_context on its own thread to execute the natives the script calls (main.cpp:118-131, CallNative.cpp:489), and a hook's handlers reach the pool thread through PushAndWait (Hook.cpp:86, :113); the spinning thread in both analysed dumps is the pool thread (88 s of user CPU inside libnode.dll), the OnUpdate thread idle in the io_context's completion wait. x-npc-landing-trace 054932's exception trace left no artifact (its result notes "unknown artifact 'frida' ignored"), so the "no C++ exception" reading of 23:06 rests on nothing; WrapCppExceptions rethrows every wrapped std::exception as a C++ Napi::Error inside the callback (NapiHelper.h:277-286), so C++ throws do happen in every tick. Next: numidium's lone-seat runs (c2 alone on a fresh server, then c1), and lab/frida/napi-trace.js on C's shape (lab/.cache/probes/x-npc-napi-trace.yaml): every Node-API callback by name and thread, every C++ to JS call and its status, every JS exception raised from C++ with the callback in progress, the engine's native dispatch by thread, RaiseException; the last 300 bridge events and 200 natives printed when the bridge goes quiet. In parallel, two bisect builds off m3-npc-puppet for the lab: the fork's TS at parity with the new server and Skyrim Platform (is Stage 3's client path needed), and the fork's Skyrim Platform at parity with the new TS and server (is Stage 2's native side needed).
- The landing hang's mechanism named and its fix pushed (2026-10-22, 00:12 to 00:4x PDT). Numidium's runs on 931de577 closed the question from the lab side: lone c2 (x-npc-lone-c2 070852) GREEN, lone c1 (x-npc-lone-seat 071125) HUNG; c1 logged in as profile 2 (x-npc-c1-as-p2 073443, lab-api's new gameData.profileId lever) GREEN; profile 1 moved 200 units south into profile 2's cells (x-npc-p1-south 073851, snapshot clean-p1south-20261022T0740Z) GREEN. So the trigger is the actor set at profile 1's parking spot (14 units north of a cell edge; the streaming grid gives it the cell one north of profile 2's; fe010803, an ESL-slot form, drew the server's Negative Magicka warning only in those logins), not the seat and not the record (both players' records carry baseDesc 7:Skyrim.esm, no stored baseId; but CreateActorMessage.h's optional baseId defaults to 0 and the wire carries it, so every player arrives as baseId 0, which the branch's isNpcModel and isFigure read as an NPC: a real defect, fixed in the same commit). From the Mac: the two analysed dumps (045602, 054932) ran job 10565's DLL (eab366b2; every return address on the spinning thread is preceded by a call in that build and in no other), their Skyrim Platform frames are the update dispatch (the _Func_impl "update" lambda at +0x1d53dc, napi_call_function's caller at +0x194211), and the spin itself, read in libnode 23.2.0 (V8 12.9.202.28-node.11) from job 10565's dist, is Isolate::UnwindAndFindHandler advancing a StackFrameIterator (the C_WASM_ENTRY handler pop and the handler loop at libnode+0xf86cc0, the JS-frame-skipping loop at +0xf86c70) over a StackHandler chain linked to itself: what a C++ exception unwound through a JSEntry leaves behind. Both earlier exception traces armed AFTER their hangs (054932's ready at 05:50:48.7 UTC against the hang at 05:50:47.3; 071646's 1 s late; the injector attaches by process name and a relaunched game is already past kDataLoaded), so the mechanism was never excluded. The single unwrapped callback that can throw: CallNativeApi.cpp's latent path built its promise with an executor lambda (platform_lib/CreatePromise.h = new Promise(executor)) that ran CallNativeSafe and a null-pointer test from inside V8's Promise constructor. Fix on fork m3-npc-puppet 7dd03c88 (pipeline 2591): the latent native is called in the wrapped callback and resolved through a Napi::Promise::Deferred, so a failing latent call is a JavaScript error, never a C++ throw across V8's frames; the client treats baseId 0 as a player. Still owed: the trace in the relaunch shape (x-npc-napi-relaunch, numidium) naming which latent native fails on that actor set, then the client path for it; then verb-stage 7dd03c88, the lone profile-1 login on clean, b-npc-puppet and b-cell-host, the gate. Bisect builds m3-npc-bisect-a 27348b3a (client at parity, pipeline 2589) and m3-npc-bisect-b 8a14c727 (Skyrim Platform's C++ at parity, 2588) are green and unused unless the rerun hangs. Memory: skyrim-platform-thread-shape.
- The landing hang's root, from the armed trace (2026-10-22, 00:4x to 00:53 PDT): x-npc-napi-relaunch 20261022-074205 (numidium; lab-api 51d7764's relaunch {frida} arms the injector while the game is stopped, so the trace was 3.3 s ahead of the engine) caught the hang with ONE C++ exception in the login second: code 0xe06d7363 raised inside the callback getFileInfo at 00:44:52.684, the "once('update')" filename line logged at .685, no napi_throw and no escape anywhere in the run, then sp3 native callbacks until .687 and silence (the quiet line at idle 3185 ms, the current callback an sp3 native method). FileInfoApi.h registered getFileInfo bare (no WrapCppExceptions), so InvalidArgumentException (std::runtime_error from ValidateFilename refusing DigitigradeKhajiit+ArgonianRaptor.esp) unwound through V8's frames to the dispatch's catch on every login since that plugin joined the load order, leaving V8's StackHandler chain pointing at a dead frame; the next JavaScript throw's unwind spun whenever the dead slot's garbage linked to itself, which profile 1's parking-spot path (its actor set: 0x107CF7, 0x365DD, 0x365DE, 0xF31FE and 0xFE01080C, mihailringneckedpheasant.esp's pheasant in ClearspringTarnExterior01, against profile 2's 0x107D07) produced every time. The 23:06 and 01:0x readings named two real gaps of the same class (the hooks add/remove callbacks, the latent Promise executor) that were not this login's throw. Fix on fork m3-npc-puppet 54df2a42 (pipeline 2594): getFileInfo and writeLogs wrapped (the tree's only two bare registrations), a plus sign accepted as a file-name character (Validators.cpp, beside 2026-10-14's space), with 7dd03c88's deferred, a24a61b4's failure log line and the baseId-0 fix. Proof owed on the lab: the lone profile-1 login on clean without the filename line and without the hang, then b-npc-puppet and b-cell-host, then the gate. napi-trace.js and exception-trace.js: a C++ throw's what() read from the exception object, type names read to the NUL (the trace's "unreadable: can't decode byte 0x00").
- The landing hang's PROOF (2026-10-22 01:15 PDT, numidium): verb-stage of fork m3-npc-puppet 54df2a42 done 01:13:44 (SkyrimPlatformImpl.dll 759020ec1daf87c9, the dist js 77f9e3b5ea1b9d82 on both clones, clean-m1-next retaken, the server 2594's image, the same server code since eab366b2; 2594's first server-build red was CellHostTest.cpp:192's stray "true", task #21, green on the retry). x-npc-lone-seat 20261022-081400, the exact shape that hung on every build before (c1 alone as profile 1 on clean, the client switches at their defaults): GREEN; c1.log carries no "is not a valid argument" line at all (the plus-signed plugin name now takes its CRC), skse message 3 at 01:15:46.170 and the demote burst of 24 puppets at 01:15:46.801 (profile 2's spot gave 16 or 17: the extra actors of profile 1's cell), no "[callNative] latent ... failed" line, the dump-state answered in 0.169 s. b-npc-puppet 081631 running, then b-cell-host, then the gate.
- The fixed landing's two reds and their fixes (2026-10-22, 01:1x to 01:30 PDT). On 54df2a42 (numidium): b-npc-puppet 081631 RED at step 14, the host's named residents never promoted (5 of 23 at the Riverwood attach, none named: persistent references, whose Papyrus GetParentCell is the worldspace's persistent cell, so the client's isHostedHere never counted them and the grant's Cell.getNthRef walk never listed them; the walk also ran at the message's tick, 27 "can't be called in this context" lines); b-cell-host 081903 RED at step 17, the handoff lost because the cell's second predator killed c2 1.6 s after it arrived (129.92 unarmed damage, a power attack at the race's number: legitimate) and the respawn unloaded its set. Fixes: fork m3-npc-puppet 7fef1bec (pipeline 2598): the server's word per actor, CreateActor's isHostedByOther explicit true or false for every actor and UpdateHoster flipping game-file actors too, the client's isMine by that word alone, PuppetService's cell walk removed and its attach asking isMineLocal, T0 rewritten (the game-file case's explicit word and flip, both flip reads the last word; NpcExists explicit true); thuum main b46e3ed7, its own commit: b-cell-host's god mode on both seats, assertions unchanged. ADR-045 point 2 revised (DECISIONS.md, before acceptance), WIRE.md and the verb doc's contract, client and tests sections with it. The lab is held to 05:05 PDT (numidium) so the 03:30 nightly waits for the gate. Task #20 closed (the hang), #18 carries the rest, #21 the test's stray "true".
- The unit test was right: UpdateHoster forwarded an offline listener's word to the host (2026-10-22 01:39 PDT). Three server-builds red on CellHostTest's flip read (jobs 10667 at line 192, 10688 and 10690 at line 202 after the last-word rewrite): the host's stream ended on "true" for its own wolf. The only two senders of isHostedByOther are CreateActor's props and UpdateHoster, and UpdateHoster sent every listener's word through listener->GetActorToSendTo(), cell-host's rule that forwards an OFFLINE actor's messages (teleports, value changes) to its cell's host; a userless actor in reach of the wolf (in the test an actor left from an earlier pass of the same case, the log's "ff000c04 hosts cell 95c0 at epoch 2") is a listener whose word is "true", never the hoster, and it landed in the host's own stream in the listener set's order, after the host's "false". The client keeps the last word, so the host's game would have puppeted an actor it runs; with the word now sent for game-file actors too (7fef1bec), every NPC in reach is such a listener of every neighbour, and Riverwood's residents would have stayed puppets on their host for a second reason. Fix on fork m3-npc-puppet 1b0a7d0d (pipeline 2603): the word goes only to listeners with a user, sent to that user directly; the test counts the host's words at the grant, exactly one, and matches by form id. 5237e474 was never staged (numidium held it on the red). Sequence after 2603: test-proto, verb-stage 1b0a7d0d, the lone profile-1 login, b-npc-puppet, b-cell-host, the gate.
- The residents' root and the roster (2026-10-22, 02:0x to 02:32 PDT). On 1b0a7d0d: lone p1 green, b-cell-host green with god mode, T2 green (33 identical), b-npc-puppet 090227 RED with ZERO live lines on the host for anyone. The unit case 1fdf5cfb (pipeline 2605, red by design) and numidium's probe x-npc-sigrid-ref 091354 said the same thing from two sides: libespm files Sigrid 0x13483 at no square around Riverwood, and the server's record of her stands in RiverwoodAlvorsHouse 0x133c8, her placement; every named resident is an ACHR placed in an interior and walked outside by its schedule (lab/esm.py on the scratchpad's verified Skyrim.esm). The server loads actors by their placement square, so it never held a resident where her host's engine had her, no CreateActor and no word could reach the host, and the five promoted on 081631 were the engine's own through the cell walk. The missing piece is TES3MP's actor list: ActorSightings (MsgType 50, wire id 58, client to server, up to 64 entries of refrId, worldOrCell, pos, rot): a game hosting a cell sends every 2 s the game-file actors its engine has attached that the world model holds no form for (HostService.reportSightings, fed by cellAttach); the server (PartOne::OnActorSighting) takes an entry only from the host of the cell of the sighted position, for a game-file actor with no user not already standing there and not hosted elsewhere, loads the record on demand and places it there, and the normal path follows. Built on fork m3-npc-puppet after 1fdf5cfb: the schema with its full-capacity sample, the JSON family and fixtures, the validator's check_sightings with a unit test and a proptest (all wire tests green locally), the C++ message, registration, dispatch and handler, the client's message, enum and sender (tsc clean), two T0 cases (the roster's four outcomes on Sigrid; her placement as a loader fact) and the T2 session's dropped non-host sighting; WIRE.md's section and the verb doc's contract, server, client and tests. Pushed as ad1f2356, pipeline 2607 green.
- The roster's first lab result and the silent wire log (2026-10-22, 02:36 to 03:19 PDT). On ad1f2356 (staged 02:57): x-npc-lone-seat 095809 green, b-cell-host 100312 green, T2 green (33 identical, the new difftest), b-npc-puppet 100041 RED and numidium's x-npc-sigrid-ref 100845 the same from one seat: zero "sights" lines on the server, zero live lines on c1, Sigrid's record still in Alvor's house 20 s after the landing and both 0x13483 and 0x1066df aiEnabled false on c1. The roster never reached PartOne's accept path, and nothing said why: the client sent no line per roster, PartOne logged only successes, and numidium's read-only look at the clones found c1's Data\Platform\Logs\MpClientPlugin-logs.txt at 4,194,407 bytes, last written 2026-10-18 02:36. The wire plugin stopped writing at its 4 MiB cap, the cap's comment said "until the game restarts" but the file persists across launches and sits inside clean-m1-next, so every run since the 18th started with c1's refusals invisible. MpClientPlugin.dll itself is current on every game folder (mp 9b2b06ac78ee4276, sp 4a915bbc7607a78f, 2607's dist). c2's log is live and every one of its 1,835 send lines is a refusal: type 5 UpdateEquipment with an inventory entry of count -1 (baseId 0x13790), refused by the schema's u32, so that seat's equipment has never gone out on the wire; a standing defect for its own branch, filed here, not npc-puppet's: the client's inventory takes each entry's count from the engine's ExtraCount (sync/inventory.ts:160, a container-changes delta that can be negative when a stack is removed below its base), merges per entry and filters only zero (:202), and the equipment builder keeps that count for ammo (sync/equipment.ts:87), so a -1 arrow stack goes out and the schema's u32 refuses the whole message; the fix is to drop a non-positive count before the send, with a T0 case on the server's side of the inventory and a wire fixture. Fixes on fork m3-npc-puppet: 23d8abfa (the client looks each sighted reference up afresh at report time instead of keeping the event's wrapper, and traces every roster sent with its counts) and 757066f3 (the server logs each roster's arrival once in ten seconds per reporter and every drop reason once a minute per actor; the wire plugin's log rotates to MpClientPlugin-logs.1.txt past 4 MiB instead of falling silent, unit test and clippy green), pipeline 2609 (2608 on 23d8abfa superseded). numidium empties the wire log on every game folder when client-dist lays a dist (main, before the next stage) and holds the lab to 05:05 PDT. The next b-npc-puppet reads three ways: a "roster:" line in c1.log says the client sent; a "refused" line with t 50 in c1's wire log says the plugin dropped it and why; "roster from" and "dropped:" lines in server.log say the server took it and why nothing changed.
- The roster works and the handoff's two halves (2026-10-22, 03:37 to 04:00 PDT). 757066f3 staged 03:37:59 with the wire logs emptied (numidium's client-dist cb2f4b3): x-npc-lone-seat 103801 green, T2 green (33 identical), b-npc-puppet 104032 green to step 29. The host runs the residents: c1's Sigrid 0x13483 aiEnabled true and c2's false with no 0xff copies (step 14, 4 of 4); over the minute maxDisplacement 284.79 on c1 and 294.42 on c2, final positions 0.004 units apart, turns 0.5173 for Sigrid and 0.1566 for 13489, no spin (step 24, 6 of 6). The server took 21 rosters, dropped 52 entries for the two expected reasons (c1's before Riverwood's grant "nobody's yet", c2's for c1's cells "another game's") and accepted 10 (eight residents placed from their interiors into 9731, 9713 and 9712 at 10:42:06 UTC, Sigrid at (24064, -45204, -41) from 133c8). Red at step 29, the handoff: c1 teleported to the lab spawn, the server moved nine cells from ff000000 to ff000001 at epoch 2 (10:44:03.411 to .417) and FlipHostedFlags ran for each, yet c2 never promoted her and c1's read stayed AI on. Two causes, both in the code: (1) UpdatePropertyMessage carries baseRecordType only for DOOR (MpObjectReference.cpp PreparePropertyMessage_, upstream's #1186 optimization), and skymp5-client's skipFormViewCreation files any id under 0xff000000 without the NPC_ type under the plain engine-reference branch, which applies only inventory, isOpen, isHarvested and disabled; CreateActor names the type, which is why the word at placement worked, and the flip never arrived. (2) A host that teleports away is no longer a listener of the residents when the release comes after the grace (its forms were destroyed at leaving reach), so no word can reach it and its engine kept the AI bit on the unloaded persistent actor. Fixes on fork m3-npc-puppet eedc2f58 then 19e7ca9b (pipeline 2614; 2613's server-build 10721 red on RespawnTest, which keeps a player's property message free of the type, so the type rides on game-file ids alone): the property message names NPC_ for a game-file id as it names DOOR, CellHostTest asserts the type on the cow's flip; an actor from the game files whose form the server takes back while live here goes puppet at the form's loss (formView.destroy(lost) from formViewArray's two server-driven destroys, PuppetService.demoteOnLoss), TES3MP's leaving-host shape, and the native Demote clears the bit alone for an actor with no 3D (Actor::Is3DLoaded, CommonLibSSE-NG TESObjectREFR.h:435). c1's wire log on the fresh stage: 4 refusals, all the type 5 count -1 (the row above), none of type 50. H2's legs stay unread: the end-of-minute shot faces the forest; a look at a resident before the shot is a scenario amendment after the gate. Side draft: docs/verbs/npc-stream.md written by an agent during the wait, uncommitted, for review.
- npc-puppet DONE (2026-10-22, 04:19 to 05:54 PDT). 19e7ca9b staged 04:19:49 (the property message's NPC_ type for game-file ids, the demote at the form's loss): x-npc-lone-seat 111951 green, T2 green (33 identical, t2-m3-npc-puppet-7.log), b-npc-puppet 112222 held the roster (step 14), the tracks (step 24: 176 to 183 units over the minute, 0.004 units apart, turns 0.32) and the handoff (step 29: c2 granted 9731 and 9732 at epoch 2 at 11:25:56 UTC, c2's Sigrid live at 04:25:53.8 by its clock, c1's demoted at its teleport 04:25:49.6 through the native's full path, and the no-3D path's burst of "AI off (no 3D, the bit alone)" lines on c2 at its later reconnect). Red only at the restart's first read (step 37): skymp5-client reconnects on its own inside the 20 s wait, the server grants the cell again to its only loader within about 12 s (11:26:27.989), and on that seat the demote at the reconnect precedes the grant's promote by 1.6 s, so a read after the wait cannot catch both seats puppet. The scenario's restart read amended on main cf72f4f (its own commit; docs/private/reviews-pending.md carries the reasoning and my approval under the standing word): the invariant, never two games live on one resident at any read, and the unchanged 12 s check (the cell hosted again, exactly one live). b-npc-puppet 113031 GREEN at 04:35 on the amended read; the first gate set red on a-restart-persistence 113744 by the driver's random near sample (the entry above), the fixed driver ebb6969 laid on both seats, then the fresh set. The gate: run set 20261022-122513-merge-m3-npc-puppet nine of nine on lab-driver ebb6969 (smoke, a-restart-persistence, b-duel, b-npc-puppet 123325, b-cell-host, a-melee-reach, a-racemenu, b-spell, b-invis-recast), after the first set 113519 went eight of nine red on a-restart-persistence 113744 by the driver's random near sample; T2 33 identical beside it; fork parity 19e7ca9b, thuum main fbee62d. The verb doc's Status boxes closed; PLAN's M3 line; the tags that stay carry a name (H2 CONFIRMED by x-npc-legs 121157, the puppet's graph runs its own locomotion under the relay; H6 and H7 npc-stream's; H8 npc-handoff's). docs/verbs/npc-stream.md committed as a reviewed DRAFT (an agent's work during the waits, every box unticked, three open questions for Eli in its Status). Playtest 31's checklist (docs/private/playtest-m3-31.md) carries the build and seats; its setup at Eli's word through numidium.
- Playtest 31 and its live findings (2026-10-22, 10:4x to 11:31 PDT). Eli's word at 10:4x; numidium's setup on a fresh world (the clock at 7.9, npcEnabled, the camp at the landing), my streams, ready at 10:46:53 (game hour 9.0). Eli changed the plan live: rotfern on test 1's seat, test 2 plain, and the staggered arrival. The rotfern preset slipped first: lab/gamemode/presets/rotfern-eli-2.json carries race 0x0800AA00 from 2026-10-07's load order (rotfern.esp sits at 0x2F now), so set-appearance put a headless default adult on test 2; numidium built playtest-m3-31-rotfern-20261022T1800Z from the fresh world with playtest thirty's profile-1 record (rotfern, 0x2F00AA00) as 0.json and re-ran the setup; seats ready 10:58:54, streams reopened (92805, 92917), test 2 parked at the lab spawn and brought to the landing on Eli's word at game hour 10.3 (memory lab-appearance-presets-bake-load-order; the presets are gitignored and deploy-srv's rsync --delete removes them from sky-srv, a row). Rotfern's Survival needs rode in on the record (hunger 1000, exhaustion 960); Eli reset them himself. Eli switched to live feedback ("stuff is janky enough"): (1) at the camp, with both arriving together, "everyone was moving right"; (2) with test 2 joining late, sliding NPCs on test 2's screen, and test 2 unable to talk to anyone; (3) both players' figures move oddly for the other and clip through the floor; (4) rotfern's screen darkens and twitches at times. Read live by numidium (server log, SP logs, paired watches, npc-state, labState poller) and by me in the code: (2a) the slide is the relay's: sync/animation.ts ignoredAnims drops moveStart, moveStop, turnStop, TurnLeft and TurnRight at the source for every actor the host reports, so a puppet's graph never enters the walking state (c1's Sigrid played moveStart and moveStop, her puppet on c2 only idles and the TurnToWalk idles, the same track); H2 re-opened, x-npc-legs 121157 was over-read; (2b) a puppet cannot be talked to by design on this build (AI off), the checklist's known limit, npc-stream's question; (4 and the hitching) ten ObjectReference.enable calls a second on both seats: formView.applyAll's harvested apply (every 666 ms per view) reads refr.isDisabled() against the model and force-enables a reference the engine holds disabled, and with every game-file actor bound to a view that hit the disabled residents, the engine disabling them back; e93d2, Riverwood's E3 demo thief under the disabled marker 0x93638 (XESP), was loaded by the server (its own flags carry no 0x800), puppeted with no 3D on both seats and flapped with the cell; 105a35, a LvlAmbientCreatures placement in 9771, was sighted into 9752 by its host, walked home into 9771, which both seats load but neither hosts (the 3x3 reach against the 5x5 load), and 1,254 of the host's moves were refused ("hosts neither"); it was demoted when it left c1's subscription grid (the demote at the form's loss) while c1's engine still ran it, and its record's spawnPoint_pos is the server's default spawn (the lab spawn), npc-fate's row; (3) open: both records are base 7 (not the isNpcModel path), the standing figures match their players exactly (dz 0), the walk watch waits on Eli's walk. Fixes on fork m3-train-32 (off parity 19e7ca9b), the build under test frozen until Eli's report: b6dd852b (the relay keeps an NPC source's five locomotion events; the view applies neither harvested nor open to an actor; the roster skips a disabled reference) and fb12f482 (libespm reads XESP; the loader skips a placement its enable parent disables; a host's sighting loads a record with both disabled filters lifted; NpcExists covers both), pipeline 2629. Rule findings for Eli, not this train's: the reach ring (hosting and subscription at 3x3, the engine loading 5x5) freezes an NPC that walks two cells from its host and refuses its moves into an unhosted cell, npc-handoff's first item (a host follows its actor into an unhosted cell it loads; the CellLoaded edge flicker between two seats damped); the west column of Riverwood's cells changed hands six times in four minutes as the two seats moved. After the report: verb-stage m3-train-32, x-npc-legs (moveStart on c2 and a stride), b-npc-puppet, the gate.
- Train-32's stage and the walk cycle's second reading (2026-10-22, 11:5x to 12:18 PDT). Playtest 31 closed at Eli's word (the checklist's Result section; the world playtest-m3-31-20261022T185547Z; the logs at results/playtest-31/). verb-stage m3-train-32 at 16b8854a (pipeline 2632 green: the four client fixes, the loader's enable-parent filter with the sighted bypass and its NpcExists case, the equipment report's counts, isFigure by the engine's base; the include fix of the test's first two builds, 10773 and 10777). x-npc-legs 190831 GREEN on it with the storm gone (2 enable results a seat), no figure demoted, both npc-state reads held, and H2 still open: the relayed locomotion events arrive and the turn-to-walks are taken, but the graph's inputs (Speed, SpeedSampled, Direction, bInMoveState) read 0 on every puppet for the whole minute although the client writes two of them at every sample; the engine refreshes them each frame from movement data the skipped step leaves at zero (the verb doc's Dynamic plan has the figures). Decision: the gate runs on train-32 as it stands (the glide is parity's too, the rest holds) and the walk cycle is train-33's, with the plan's R2 handed to the re-analyst (how Speed and Direction are fed, docs/research/m3/re-puppet-locomotion.md) and two baselines on the merged build first, x-npc-legs-host and x-npc-legs-burst (lab/.cache/probes).
- R2 answered and train-33 (2026-10-22, 12:2x to 12:51 PDT). The re-analyst's static read on sky-re (docs/research/m3/re-puppet-locomotion.md): the graph's Speed, Direction and TurnDelta are Actor data channels polled at every graph tick from MiddleHighProcessData::currentMovementSpeed, rotation.z and rotationSpeed.z, written by the movement step and its feedback tail alone, so the skipped step leaves a puppet's inputs at zero and a Papyrus SetAnimationVariableFloat is overwritten by the channel push before the same tick's step; the Speed channel's 5.0 threshold raises the engine's own moveStart and moveStop (HYPOTHESIS). Fork m3-train-33 off 16b8854a: ed7eb504 (the setPuppetLocomotion export and its per-puppet registry sample; the Move detour writes the four fields every frame after its Move stamp; the client feeds the sample per 130 ms instead of the two variable writes; the relay's locomotion events back to the figures' rule) and a9c43bf0 (the declaration in Definitions.txt and the regenerated skyrimPlatform.ts: ed7eb504 had edited the generated file by hand, fork-lint said so, and the pipe to tail hid its exit so the commit went out; the lint's own exit code from now on). Order on the lab after train-32's merge: x-npc-legs-host on parity (the host's baseline), numidium's x-burst-check (the new screenshot {count, intervalMs} step, thuum branch lab-burst), verb-stage m3-train-33, x-npc-legs and x-npc-legs-burst on it, b-npc-puppet, the gate. If Speed still reads 0, the report's Frida plan F1 and F5 is the next probe.
- Train-33 works on two of three (2026-10-22, 13:0x to 13:30 PDT). x-npc-legs-host 195031 on parity gave the host's baseline (Speed about 80 walking, 220 running; bInMoveState no indicator, False on the host too); numidium's burst step landed (lab-api main fd60cc6, x-burst-check 200551: 500 ms frames at 484 to 513 ms, 200 ms at 186 to 220, read-back 1.3 s a frame); train-33 a9c43bf0 staged 13:20 and x-npc-legs 202106 GREEN with the mechanism proven: Sigrid's and Faendal's puppets read Speed following each walk (peaks 106 and 126), Direction changing, and the engine's own moveStart and moveStop paired with the speed and taken, where 19e7ca9b refused every moveStop; Alvor glided with Speed 0 because his puppet's graph had refused the relayed IdleChairExitStart and sat its way across the yard. Two follow-ups on 786a029d (pipeline 2644): the host reports a game-file actor's Speed, the graph's input, not SpeedSampled (1.3 to 1.5 times higher, a jog); a refused furniture exit on a puppet is answered with IdleForceDefaultState on the next update (HYPOTHESIS). Next: x-npc-legs-burst on a9c43bf0 (the stride on film), then 786a029d staged, x-npc-legs on it, b-npc-puppet, the gate. The fallback trace x-npc-legs-trace (lab/frida/npc-locomotion.js, main 42d04bc) stays unrun.
- H2 confirmed: the puppet walks (2026-10-22, 13:33 PDT). x-npc-legs-burst 202522 on train-33 a9c43bf0 with the new burst step (40 frames at 500 ms): Sigrid's puppet's Speed 76 to 106 through a walk with the engine's own moveStart and moveStop taken at its ends, Dorthe's run at 307, and the frames show the stride (results/train-33-stride, the zoom sheet f13 to f20: profile mid-step, then walking into the camera with the arm swing changing frame to frame). The verb doc's H2 tag closed on train-33's mechanism; 786a029d (the host's Speed as the reported speed; the refused furniture exit's reset) is the head to stage, then x-npc-legs, b-npc-puppet and the gate; its merge is playtest 32's build.
- Train-33's second and third heads (2026-10-22, 13:4x to 13:54 PDT). 786a029d staged 13:47; x-npc-legs 204726 GREEN with the puppets' Speed at the host's (Sigrid 77.8 against 80.1, Dorthe 223.1 running against 221.4, Faendal 83.3 against 81.6) and every moveStart and moveStop taken; Alvor still at Speed 0 through two walks, his chair exit taken this time, isInFurniture 0. Cause: getRunMode (movementGet.ts) answers Standing for any actor holding a furniture reference, which Alvor keeps between the forge's markers, and applyPuppetPose fed 0 under Standing. Third head 929e3bc2 (pipeline 2647, client only): the host's Speed fed whatever the run mode. The gate held for it (numidium); then x-npc-legs on it, b-npc-puppet, the gate with the train's T2 log, the merge.
- Train-33's fourth head (2026-10-22, 14:0x to 14:23 PDT). 929e3bc2 staged 14:12; x-npc-legs 211250 green (Sigrid 77.8, Faendal 83.3, every moveStart and moveStop taken) with Alvor at his bench, so his fix went unread; the rerun 211702 went red at step 6 before the watch: c1 never reported loading 9732, its own landing cell, after the teleport (its four neighbours reported and granted at epoch 1), the first miss in seven runs that day and nothing of train-33's (cell reports are HostService's). Fourth head 2ce4fd36 (pipeline 2649, client only): the player's own parent cell joins HostService's loaded set at every poll without waiting for its event (cell-host.md's Client section). numidium holds the gate for it; then verb-stage, x-npc-legs once (9732 granted at the landing the new read; Alvor if he walks), b-npc-puppet, the gate with the train's T2 log, the merge. b-npc-puppet 205140 on 786a029d green; 211942 on 929e3bc2 running as a read.
- Alvor fed; the gate runs on train-33's fourth head (2026-10-22, 14:3x to 14:45 PDT). 2ce4fd36 staged 14:41; x-npc-legs 214026 GREEN: Alvor walked and was fed (Speed to 77.8, moveStart and moveStop taken), Sigrid 77.8 with four starts and four stops, Faendal 83.3, Dorthe sat; the enable count 2; 9732 loaded and granted on time, so the own-cell guard went unexercised (HYPOTHESIS by name). b-npc-puppet 211942 on 929e3bc2 green. The gate: verb-merge m3-train-33 b-npc-puppet b-cell-host with t2-m3-train-33-1.log (33 identical; the four heads after a9c43bf0 touch hostService.ts, animation.ts, movementApply.ts and movementGet.ts only); the merge on green is playtest 32's build.
- Train-33's gate and b-duel's watch item (2026-10-22, 15:10 PDT). Gate 20261022-214947-merge-m3-train-33 on 2ce4fd36: smoke, a-restart-persistence and b-npc-puppet 215843 green; b-duel 215524 RED at step 65 (c2's health 0.8316 against < 0.78): the sword hits identical to the morning's green, the Flames stream 11 ticks over 2.2 s instead of 19 over 3.5 s, begun 1.2 s later against the fixed hold, the cadence intact; the same shape once before, 20261020-232356. Written into docs/verbs/spell-cast.md as ADR-027's watch item with the HYPOTHESIS (the driver's hold-key landing late; not the server's number, not train-33, whose relay change touches game-file sources only). The set reruns it twice as the lone red; ADR-027's "green on the branch before the sweep" is not met for b-duel (it never ran on train-33 before this gate; its last green on the parent 16b8854a was 192438), noted. The other five runs to come; the merge on green.
- Train-33's gate red, the stream probe (2026-10-22, 15:2x to 15:38 PDT). Run set 20261022-214947-merge-m3-train-33 ended red: eight of nine green (smoke, a-restart-persistence, b-npc-puppet 215843, b-cell-host 220333, a-melee-reach 220928, a-racemenu 221150, b-spell 221540, b-invis-recast 221824), b-duel red twice (215524 at 0.8316, the rerun 222125 at 0.8153); a red rerun is red under ADR-027, parity stays 16b8854a, the watch item becomes a block. The hold-landing-late hypothesis fell to the step durations (identical to a tenth); the first OnSpellHit came 0.51 and 0.97 s later than the morning's green by the sword-hit anchor with the stream's end fixed by the key's release. x-duel-stream 223232 (lab/.cache/probes; the duel's opening, the Flames phase watched on both seats, no assert) on the same stage: the caster's cast 0.10 s after the hold, the figure's 0.13 s behind, 20 ticks and 3.6 s registered, the whole stream on time. So the reds are variance of the stream finding c2's figure late or losing early hits, not a fixed delay of the build; numidium runs b-duel three times on the stage to measure the rate before any code changes (three greens: a fresh gate; a red: the probe with the assert and the watch kept to the end, thrice). Eli's word: playtest 32 waits for the fix and the merge. Row: c1's figure of c2 takes a refused combat idle every 15 ms under the relay's idle blank (the engine's per-frame retry), a suspect for playtest 31's odd-walking figures; the figures' idle rule, its own train.
- The stream's lost reports found in the caster's hit path (2026-10-22, 15:4x to 16:07 PDT). b-duel three more times on train-33's stage: green, red (12 ticks), red (13): 4 red of 5 on the train against 1 of 13 before, the build. x-duel-stream three times (21, 20, 10 ticks); the short run 225540 with both watches: the caster's 21 launches and c2's 20 hits taken on time in both games, the server registering 10 in clusters with nothing refused or rejected anywhere. Cause: skymp5-client hitService's two magic-hit dedupes measured in JS frames (dedupFrames 2; every second same-key hit inside one frame), so a stalled tick folds two real 183 ms stream ticks into one and drops a report before any send. Fix on fork m3-train-33 ab1740bf (pipeline 2654): both rules in milliseconds (8 for the engine's double, 34 for a hit and its apply). Open by name: whether c1's tick stalled (its watch sample gaps against the server's holes, numidium reading) and what stalls it (the roster's per-actor lookups every 2 s on a host, the first suspect). Then: stage ab1740bf, b-duel three times (19 or 20 ticks each), the gate, the merge; playtest 32 on the merge at Eli's word.
- The stream's cause found: the figure left where the stagger pushed it (2026-10-22, 16:0x to 16:11 PDT). numidium's read of x-duel-stream 225540 against 225208 falsified the stall (c1 at 60 updates a second, no gap) and the dedupe as the cause (c1's own hits dealt: 20 pairs against 10, at the server's exact holes): the caster's game registered fewer hits because c2's figure on c1's screen stood 6 to 7.6 units from the record after phase 2's stagger on every red (0.3 to 0.4 on the greens), under translateTo's 8-unit standing deadband, which the 2 s re-apply ran too, so nothing brought it back while c2 stood still, and the Flames stream aimed at the record missed half its ticks. Fix on fork m3-train-33 8a581ede (pipeline 2656; ab1740bf's dedupe in time kept beneath it): the periodic re-apply of an unchanged record settles a standing figure or puppet from one unit. Rows: the figure 8 units below its player's z on flat ground in every run (playtest 31's clipping, the figures' spawn height and ground); the figure's refused combat idle every 15 ms. Next: 2656 green, verb-stage, b-duel three times (19 or 20 ticks; the phase-2 error under one unit), the gate, the merge, playtest 32 at Eli's word.
- The settle that never came (2026-10-22, 16:2x to 16:46 PDT). 8a581ede staged at 16:20's green: b-duel red (11 ticks, the figure 6.8 off after phase 2), red (10, 5.8 off), green (16, 0.3); x-duel-stream 233951 read c2's figure on c1 a constant 6.9 units off for the whole stream window. The settle rode the view's 2 s re-apply, which runs only when no new sample arrived, and a standing player's game reports movement at every tick, so every apply was a fresh sample under the 8-unit deadband. 3bd8d8ae (pipeline 2658): the deadband is one unit whenever the record is still (the target equals the last target sent), whatever the sample count; the settle prints a console line for the lab. Then the stage, b-duel three times (ticks and the phase-2 error), the gate, the merge, playtest 32 at Eli's word (already given for the merge).
- The settle's second miss and its reading (2026-10-22, 17:0x to 17:16 PDT). 3bd8d8ae staged 17:02: b-duel green three times on its assert (19, 17, 15 ticks), the figure still 4.4 and 4.9 off after phase 2 in two runs, no settle line (the stillness test compared against the last translation sent, none behind a teleported figure; and printConsole never reaches c1.log). fb6f3f09 (pipeline 2661): the stillness read from consecutive records. numidium holds the gate for it; then the stage, b-duel three times (19 or more ticks and the phase-2 error under one unit), the gate, the merge, playtest 32 at Eli's word.
- The figure settles; train-33's gate runs again (2026-10-22, 17:2x to 17:45 PDT). fb6f3f09 staged at 17:3x: b-duel three times green with the figure back on the record (19 ticks and the phase-2 error 0.0; 19 and 0.4; 18 ticks over 3.22 s and 0.2), where 3bd8d8ae's x-duel-stream 001417 still read 5.3 units off for the whole stream. numidium started the gate (verb-merge m3-train-33 b-npc-puppet b-cell-host, T2=skip with t2-m3-train-33-1.log; the branch skymp5-client only after a9c43bf0): b-duel runs in it again and a short stream reds it. On green: the merge is playtest 32's build.
- Train-33 MERGED (2026-10-22, 18:13 PDT; the entry written 18:16). Gate 20261023-004438-merge-m3-train-33 nine of nine green, b-duel 004922 included, T2 33 identical; fork parity fb6f3f09 (was 16b8854a), both clones promoted (client fb6f3f09, lab-driver ebb6969), main e6e2f250 with numidium's entry and the pin. The train, head by head: a9c43bf0 (the puppet's graph fed where the engine reads, R2; the relay's locomotion rule back to parity's), 786a029d (the host reports a game-file actor's Speed; a refused furniture exit resets the puppet), 929e3bc2 (the host's Speed fed whatever the run mode: Alvor's furniture reference), 2ce4fd36 (the player's own cell reported without its event), ab1740bf (the magic-hit dedupes in time), 8a581ede and 3bd8d8ae (the settle's two misses), fb6f3f09 (a standing figure or puppet settles onto a still record from one unit). Playtest 32's setup starts on it at Eli's word, given at the merge: the world playtest-m3-32-rotfern-20261022T2206Z with rotfern's needs zeroed; the checklist docs/private/playtest-m3-32.md, its first read the two figures walking.
- Playtest 31's end and the last reads (2026-10-22, 11:31 to 11:56 PDT). The figures were not demoted: no puppet or live word names a figure in either seat's Skyrim Platform log from the 10:58:40 launches on (the window of the clipping report), and npc-state at 11:36:54 read aiEnabled true on both (0xff000d6f on c1, 0xff000d8a on c2, package 0x654e2). Neither seat's wire refused an UpdateAnimation or an UpdateMovement all day (the plugin logs connects, disconnects and refusals; one E_CLIENT_NOT_CONNECTED UpdateMovement each at the 05:20:03 timeout); every connect on both seats is followed by two UpdateEquipment refusals for counts under zero (gold -10, arrows -23, the weapon 0x13790 -1), so neither seat's equipment reached the server today, c1's included. The server logs no line per accepted movement or animation report. On c1, test 2's figure took one failing idle event a frame (1,979 in 33 s, MotionDrivenIdle and the IdleHD and IdleHH set, every one refused) while test 2's own graph on c2 took none: c1's own head tracking, old behavior (thuum-magnus). Eli called it done before the walk watch, so the figures' odd walk and clipping stay open; the walk watch (both seats; height at the same ground spot, sample gaps, jumps, events) is the next read. The world saved as playtest-m3-31-20261022T185547Z (71 records); the logs and the live reads at https://thuum.gaussing.tv/results/playtest-31/ (live/ holds the watches, the npc-states, the SP and wire logs); the hold released. Train-32 at 16b8854a, pipeline 2632 green (server-build 178 s, client-build 499 s): b6dd852b's three client fixes, fb12f482's loader and sighting fix, 7cb7db42's equipment counts and the engine-first figure test, 16b8854a's include; 2628, 2629 and 2631 cancelled as superseded (2629's and 2631's server-build red on NpcExists.cpp without wire_bridge_cxx/rules.h). Next: verb-stage m3-train-32, x-npc-legs, b-npc-puppet, the gate.
- The gate's first set on 19e7ca9b and the driver's random sample (2026-10-22, 04:35 to 04:59 PDT). b-npc-puppet 113031 GREEN on the amended restart read (main cf72f4f). The gate (verb-merge m3-npc-puppet b-npc-puppet b-cell-host, T2=skip with 19e7ca9b's T2_LOG): smoke 113519 green, b-duel 114012 green, b-npc-puppet 114333 ended on a lab fault (E_RUN_GAME_REPLACED, c2's game restarted by launch.ps1 at its first teleport) with every assertion held on the way (752 units of track, the puppet 0.002 units from the host), its automatic rerun 114824 green, b-cell-host 115300 green; a-restart-persistence 113744 RED at step 19, "c2 does not see c1" after the restart. The red was not the build's: c2's saved dump of the step before (steps/018) lists c1's figure 0xff0008f6 "test 1" 300 units away at c1's exact position with the SteelSword equipped, and c1's dump lists c2's figure the same way; both figures were rebuilt after the restart (the setPosition, enable, resurrect triple at 04:39:45.7 on each seat, the same triple the last green run showed). lab-api's view() matches a seat's near list against the server's record of the other client within 512 units, and an assert step takes a fresh dump-state from each seat (runner.py:944-952) rather than the saved one; the driver's near list (lab/driver/src/index.ts nearbyActors) was twelve Game.findRandomActor draws within 4096 units, up to eight distinct actors, a random sample that misses one actor of four or five in a few percent of draws, and the lab spawn had the wolf, the fox, the rabbit and the figure in range. Every earlier green of that read was a fair roll. numidium's driver fix on main ebb6969 (its own commit, suite 746 green): the draws run until 32 in a row add nobody new (at most 160) and the nearest eight are returned, sorted; docs/LAB.md's line on the watch's random search updated. The order from here (numidium's): the set's remaining runs (a-melee-reach, a-racemenu, b-spell, b-invis-recast), x-npc-legs by path (H2), a-restart-persistence once more under the old driver with a labState poller beside it (actor and online by profile every second across the restart, the server-record read that closes the other half), then the fixed driver laid on both seats (client-driver, clean-m1-next retaken) and a fresh gate set on it for the merge. Side rows: c2's weapon 0x13790 is the item at count -1 behind the UpdateEquipment refusal (the dump's equippedRight 79760), so that seat's weapon never shows on the other screen; a memory note on the sample (lab-near-list-is-a-random-sample).

### 2026-10-22

- m3-npc-puppet merged to fork parity 19e7ca9b (2026-10-22T12:54Z): the gate 20261022-122513-merge-m3-npc-puppet, 20261022-122513-smoke-two-players to 20261022-125123-b-invis-recast (9 runs); T2 green beside the gate on skymp-server:m3-npc-puppet (t2-m3-npc-puppet-7.log, 33 sessions identical); clones promoted (clean-m1 carries client 19e7ca9b and lab-driver ebb6969). Verbs: npc-puppet (M3, ADR-045: a game-file NPC runs under its cell host's engine and is a puppet on every other game; the host's roster (ActorSightings) brings scheduled residents to the server where the engines have them; the hosting word per actor, the handoff and the restart). The first set on this head, 20261022-113519, went red 8/1 on a-restart-persistence 113744, lab-driver's random near list (rerun 121803 green, the server record steady); the driver fix ebb6969 was laid before this set.
- m3-train-32 merged to fork parity 16b8854a (2026-10-22T19:49Z): the gate 20261022-191934-merge-m3-train-32, 20261022-191934-smoke-two-players to 20261022-194602-b-invis-recast (9 runs); T2 green beside the gate on skymp-server:m3-train-32 (t2-m3-train-32-1.log, 33 sessions identical); clones promoted (clean-m1 carries client 16b8854a and lab-driver ebb6969). Fixes, playtest 31's (npc-puppet, M3): the relay keeps an NPC source's five locomotion events (moveStart, moveStop, turnStop, TurnLeft, TurnRight; the two Cyclic blends stay dropped); the view applies neither harvested nor open to an actor (the enable storm: 2 enable calls a seat in x-npc-legs 190831 against thousands on 19e7ca9b); the roster skips a disabled reference; libespm reads XESP and the loader skips a placement its enable parent disables (the E3 demo thief 0xe93d2 under E3demoMarker 0x93638), while a host's sighting loads one with the disabled filters lifted; the equipment report never carries a count under one (every connect on both seats had been refused, gold -10 and arrows -23); isFigure asks the engine for the actor's base before the view's id map. On the stage: x-npc-legs 20261022-190831 green (the storm gone, the relayed turn-to-walks taken, but the puppets' Speed, SpeedSampled and bInMoveState at 0 for the whole minute: H2 open, the walk cycle is train-33's) and b-npc-puppet 20261022-191438 green.

### 2026-10-23

- m3-train-33 merged to fork parity fb6f3f09 (2026-10-23T01:13Z): the gate 20261023-004438-merge-m3-train-33, 20261023-004438-smoke-two-players to 20261023-011024-b-invis-recast (9 runs); T2 green beside the gate on skymp-server:m3-train-33 (t2-m3-train-33-1.log, 33 sessions identical, on a9c43bf0's server; the branch's later heads change skymp5-client alone: hostService.ts, hitService.ts, animation.ts, movementApply.ts, movementGet.ts, formView.ts); clones promoted (clean-m1 carries client fb6f3f09 and lab-driver ebb6969). Verbs: npc-puppet (M3), the walk cycle and two fixes the gate found. H2 confirmed: a puppet's Speed, Direction and TurnDelta fed each frame into its MiddleHighProcessData by the Move detour from setPuppetLocomotion's registry (a9c43bf0), so the engine raises its own moveStart and moveStop (x-npc-legs-burst 20261022-202522's frames show Sigrid's stride); the host reports a game-file actor's Speed, not SpeedSampled (786a029d: the puppets at the host's 80 walking and 220 running, against the host baseline x-npc-legs-host 20261022-195031); a puppet is fed the host's Speed whatever its run mode (929e3bc2: Alvor between the forge's markers, fed at 77.8 in 20261022-214026); a host's own cell joins its loaded set at each poll (2ce4fd36, after 20261022-211702's c1 never reported 9732; HYPOTHESIS by name until a missed event recurs); the magic-hit dedupes in milliseconds, not JS frames (ab1740bf, latent); and the figure's settle (8a581ede, 3bd8d8ae, fb6f3f09): the first gate, 20261022-214947, went red on b-duel twice (215524, its lone-red rerun 222125; b-duel then 4 red of 5 on the stage) because c2's figure on c1's screen stayed 6 to 8 units from c2's record after phase 2's stagger, under the 8-unit deadband, so c1's Flames missed it half the time (x-duel-stream 20261022-225540: c1 launched 21, c2's game took 20, c1's game registered 10 on the figure); fb6f3f09 settles a standing figure or puppet from one unit when consecutive records are still (b-duel 20261023-003355, 003717, 004039 green, the figure back to 0.0, 0.4 and 0.2 units, 19, 19 and 18 ticks). Rows carried: a figure sits about 8 units under its player's z on flat ground in every run (playtest 31's "clipping for the other player"); a figure's graph takes a refused idle every frame (c1's figure of c2 the combat idles every 15 ms); the reach ring and npc-fate's spawn point from playtest 31.
- Playtest 32 (2026-10-22, 18:19 to about 19:39 PDT; Eli: "i closed out my testing"), M3's NPCs walk, second session, on fork parity fb6f3f09 (train-33) with the server alone and npcEnabled, both seats at Riverwood's landing, live feedback instead of the list. Eli: running around "looks a looooot better on both screens"; the handoff "largely kosher"; and five failures, every one traced tonight. Fixed on fork m3-train-34 (four heads, pipeline 2672 green 19:37): Embry's pair walking in place on the puppet screen (a talker's small turns report a Speed of 10 to 20 with no displacement; 8074833a bounds the fed speed by the record's displacement and the native sample goes stale after 400 ms); every NPC headshot refused E_HEADSHOT_RACE (race 0 from an appearance a game-file actor never has; dc6e3adb reads it through MpActor::GetRaceId, HeadshotTest's Alvor case; tonight's overlay "0:Skyrim.esm" in headshot.races let one pass end to end at 01:52:11Z); nobody could be talked to after a handoff, "there's a prompt it does nothing" on both screens (every relayed sample ran blockActivation(true) on a puppet and the promote restored the AI alone; 8eafa85d: ensureLive clears the block, the look-at and restores head tracking, ensurePuppet blocks from the demote); rotfern "sat down on a bench all on her own just cause she was near it" (a resident took bench 2ad10 by package in her game, her client reported it as the hosted actor's, the server's furniture branch answered OpenContainer through GetActorToSendTo, which hands an offline actor's messages to its host, and her game ran refr.activate(player); her own activation followed each resident's at 01:21:23Z and 01:24:44Z; 1db977ed sends the reply only to an actor with a user, CellHostTest's hosted-sitter case). Rows: the tenth arrow (eight accepted shots, then E_SHOT_EQUIPMENT and E_HIT_NO_SHOT at 907 units with no equipment line between; accepted UpdateEquipment is unlogged; marksman, probe x-quiver-dry); the dungeon's LVLN placements run twice and the server's 25 s respawn of 39fe4 by SkyMP's timer, at its placement by the code (MpActor::GetSpawnPoint returns the editor location for a game-file id; the default spawn is a copy's), the body's rising unread (npc-fate); the forest predators (both LvlAnimalForestPredator) killing both seats on arrival with the server's record of 0x85549 resolved to EncBearCave, EncBear under a wolf on screen, 130-point unarmed hits (npc-fate's leveled identity against the server; H10 widened), the dead player's regeneration until the respawn (HYPOTHESIS); a crime's guard dialogue on the puppet screen (npc-stream); the restart's cell split by arrival order (nine cells to one game, three to the other, in 20 ms; Eli "weird"; npc-handoff's decision), a quitting host's cell left to a gone game for the timeout plus the grace, about 24 s (cell-host); Stump through a door into unhosted 133c7, 751 refusals in five minutes (npc-handoff's door case); and six residents live in both games after test 2's relaunch, Alvor's and Gerdur's households, whose records sit in interior cells nobody has loaded, so the server sent them to neither game and each engine ran them by its own schedule, up to 49,000 units apart (the door case from the other side; the roster moving a record nobody hosts to the sighter's cell is the HYPOTHESIS in npc-handoff's draft). "deaths that dont propagate" is the LVLN half by construction; the recorded half is probe x-npc-death (by path: the host's console kills Sigrid, the record and the puppet read). Docs: cell-host (the quitting host, the activation reply), npc-puppet (row 110 and the release condition, H10), marksman ("the tenth arrow"); drafts in flight: npc-handoff and npc-fate. Next: numidium's close-out (save, release, the overlay restored, 32.yaml's camp), then train-34's stage, x-npc-talk, x-npc-legs, x-npc-death, b-npc-puppet, b-duel, the gate with its own T2, merge.
- npc-fate drafted (2026-10-22, 19:1x to 19:4x PDT, a drafting agent; docs/verbs/npc-fate.md DRAFT, every box unticked): one actor per leveled placement on every screen and the server, one body across screens and restarts, loot once and the server's, respawn by the server's rule at the placement. Playtest 32's three readings traced to code: AttachEspmRecord admits NPC_ bases only (a LVLN placement has no record; an NPC_ with a LVLN template is rolled by the server at level 0 while each engine rolls again: the cave bear under the wolf); DeathEvent arms RespawnWithDelay for every actor with spawnDelay 25, and GetSpawnPoint resolves to the placement for a game-file id; the corpse's take path by code needs an occupant only the CONT and FURN branches set (how tonight's bow reached rotfern's record is its H7). Twelve HYPOTHESIS items, six RE tasks for the re-analyst (the roll site, SetObjectReference, the cell reset decision, the dead-at-load shape, the dead-actor activation branch, zone level lock), a tentative S2C ActorFate message, seven T0 shapes, b-npc-fate's prose with the grammar it needs first; one ADR's decisions parked for Eli (death authority shape, roll level, respawn pick, dedicated message or deltas, formVersion). One defect found with a T0 oracle: the server reads a leveled list's chance-none global as 100 where the engine reads the global's value (its H12).
- npc-handoff drafted (2026-10-22, 18:4x to 20:00 PDT, a drafting agent; docs/verbs/npc-handoff.md DRAFT, every box unticked): the saved state replayed before a grant, the host following its actor into a cell nobody has loaded, and the reach ring's flicker, framed as one ADR's decisions for Eli: (a) a host follows its actor into an unhosted adjacent cell or a door's interior while its game has it loaded (a per-actor follow table answers simulator_of; ADR-035 point 8 refined from "nobody hosts" to "no game has loaded"); (b) flicker damping with a reach-only grace and a candidate dwell, both unmeasured placeholders; (c) an ActorHandoff keyframe (the record plus npc-stream's furniture, target and package) before HostGrant on the same ordered channel, or a widened HostGrant; (d) a per-actor pass between two live hosts through the existing UpdateHoster flip with a tenure for the boundary wanderer. Folded from tonight: the refusal's rate (Stump's 751 lines), the cold-start split after a restart (nine cells to one game, three to the other, by arrival), and the roster moving a record out of an interior nobody has loaded (the six residents live in both games), HYPOTHESIS. The exact lines to change named: MayMoveActor's return (PartOne.cpp:1624) with ActionListener.cpp:90's HostOf gate and MovementValidation.cpp:115-120's stand-aside. Contradictions the draft found, owed to their docs: b-npc-puppet.yaml:95-97 times c2's "live" 1.1 s before the server's grant line (two clocks, so "about 2 s" is no latency); ADR-035 point 7 still says "its own copies" after ADR-045 made puppets engine references; PLAN.md:1050-1051's server-side replay is the client's own record today; cell-host.md:57's one-seat hysteresis reading did not hold with two seats.
- m3-train-34 merged to fork parity 7e59c32c (2026-10-23T04:40Z): the gate 20261023-041115-merge-m3-train-34, 20261023-041115-smoke-two-players to 20261023-043730-b-invis-recast (9 runs, 9 green, no rerun), the first gate held to its own builds before the push (gate-cite.py --fresh --head, main 54defa58: checks 2 to 5 ok); T2 green on 1db977ed's server (t2-m3-train-34-1.log, 33 sessions identical; the head's one later commit changes skymp5-client alone, puppetService.ts); clones promoted (clean-m1 carries client 7e59c32c and lab-driver 745d12d, lab-api 745d12d7). Verbs: npc-puppet, cell-host and headshot, playtest 32's fixes: a puppet never walks in place (8074833a); an NPC headshot reads the race through MpActor::GetRaceId, not an appearance a game-file actor never has (dc6e3adb); the promote undoes the puppet's blockActivation, so a resident handed off to a seat answers Talk again (8eafa85d); a furniture reply goes to the activating player alone, so the host's own player no longer sits on the bench a resident used (1db977ed; playtest 32's rotfern); the demote makes no Papyrus-backed call at the attach (7e59c32c; b-invis-recast green here, red twice under Intuitive Dragon Ride Control's start-up box in the first gate, docs/MODS.md). Two gates came before: 20261023-031111 red on b-invis-recast 2/2, and 20261023-034935 stopped by hand at 20:54 PDT when 7e59c32c landed a minute in (step 4 pushed origin/<branch> then and would have put it on parity ungated; fixed on main 54defa58).
- The night's probes on parity 7e59c32c (2026-10-22, 21:50 to 23:00 PDT; numidium ran them by path from lab/.cache/probes on the grammar it built as they asked for it: npc-state's isDead, healthPercentage, isEssential, isProtected and activationBlocked, npc-kill with a killer, npc-damage, approach, dump-state's crosshairRef and menuOpen; main 745d12d, 1e56cea7, 8d3b3139). x-npc-talk-prompt took seven versions to a GREEN (055858): the Talk-prompt fix 8eafa85d confirmed by its state at every phase (the first host's resident activationBlocked false right after the grant, which also covers Eli's "that is prior to you moving them"; the puppet true; the promoted resident false); the player's own E stayed unproven as evidence (a Papyrus Activate is not E; Sigrid walked; Alvor at his 9.0 task by the mill sat bent under a beam; the rule learned: an evidence step must be one that cannot fail, a failed approach ends a run). x-npc-death took four: the console's kill is a server command (030603 showed the server's death reaching both games); Actor.kill with no killer and with the player did nothing (044628, 051540; the three residents neither essential nor protected) because formView starts the engine's deferred kill on every actor it views, the host's own live residents included; and npc-damage (054215) found the split: a host's actor floored at -128.87% stood on its host while its puppet, under the same deferred kill with its AI off, died of the relayed number through the apply's damageActorValue step, playtest 32's "definitely some desynced NPCs" in one measurement. Train-35 opened on the fork at ac557132 for it (the host's report clamped to [0, 1] at the source, the puppet apply floored at one percent so the server's death state is the only death, wire-validate refusing an UpdateMovement outside [0, 1] with its test; the contract line in docs/WIRE.md), staged tonight by numidium with the full T2 and a gate carrying m0-death. npc-fate's H5 and its Dynamic question (which path kills a deferred-kill actor with its AI off) and npc-handoff's H9 (Sigrid's record in her house while she gardened, the sighting line) took the measurements. Also tonight: the lab-driver typings trap closed (main c11ba62d), Intuitive Dragon Ride Control's start-up box filed for Eli in docs/MODS.md, the quitting host and the activation reply in cell-host, the puppet apply's Papyrus cost in npc-stream.
- m3-train-35 merged to fork parity ac557132 (2026-10-23T06:49Z): the gate 20261023-061702-merge-m3-train-35, 20261023-061702-smoke-two-players to 20261023-064608-b-invis-recast (10 runs, 10 green, no rerun), held to its own builds before the push (gate-cite.py --fresh --head: checks 2 to 5 ok); T2 green beside the gate on skymp-server:m3-train-35 (t2-m3-train-35-1.log, 33 sessions identical); clones promoted (clean-m1 carries client ac557132 and lab-driver 8d3b3139, lab-api 8d3b3139). Verbs: npc-puppet, tonight's health fix (ac557132): a reported health percentage lives in [0, 1] at the source (movementGet), the puppet apply floors its target at one percent so a figure or a puppet dies by the server's death state alone, and wire-validate refuses an UpdateMovement whose health_percentage leaves [0, 1] (the contract line on main 51e4bea0). The case it closes: x-npc-death 20261023-054215 on 7e59c32c, where a host-made health of -128.87 left Sigrid standing on the host under the engine's deferred kill and killed her on the puppet seat by the relayed number. m0-death in the gate: a player's death crosses the new refusal green.
- Playtest 33 (2026-10-23, 01:06 to 01:44 PDT; Eli: "go ahead and call that this test. i think you have enough things to fix. funny thing is ,, quests seem to populate just fine lol"), M3's NPCs, third session, on fork parity ac557132 (trains 34 and 35), live feedback. Held: the bench fix, the handoff both ways in about 4 s, talk on the promoted seat (the Talk fix's claim), movement "a Tiny bit jumpy, otherwise doing ok", quests populating. Found: (1) a late-joining seat ran eight residents frozen at its own engine's placement, unblocked and unsampled, until a lookup loaded their records: their saved ChangeForms were deferred (WorldState::LoadChangeForm defers a game-file id until the form loads, the chunk loader loads the game files' exterior placements alone, and these residents are placed indoors), so no seat ever got a CreateActor and both engines ran them; the host's own E, refused for reach against the stale record, loaded it through OnActivate's LookupFormById, the first report 31 to 48 ms later; the host's roster never named them (the animals alone), the open client question; (2) E on such an unblocked puppet opened the engine's dialogue with an AI-off actor and the Dialogue Menu stayed, test 2 stuck until a relaunch (the block was per relayed sample; 7e59c32c had dropped the demote-time call); (3) headshots: the race fix works (eight claims reached the check), seven refused for a helmet the server's own outfit roll put on a bandit no screen showed, one accepted on a body already at zero ("bandits need to be uniform across games to ahve headshots register"): npc-fate's leveled identity extended to outfits and server-placed actors, section 4 waits for it; (4) 50 then 100 arrows given, one seen, the record's count unread. Train-36 on the fork (m3-train-36 c068c776, after 8785d34e's two builds read a private member): WorldState::LoadDeferredActors as the save attaches (NpcExists' case with Hod's saved record), OnActorSightings' ten-second line listing every id, PuppetApi's Demote setting TESObjectREFR::SetActivationBlocked and the Promote clearing it with the TS calls gone for puppets; staged by numidium with the full T2 and the probes x-npc-talk-prompt v7, b-npc-puppet and x-npc-late-join (new, by path) before its gate. Eli's pronouns are it/its (memory feedback-agent-pronouns). World playtest-m3-33-20261023T084433Z (107 records); logs at results/playtest-33/.
- m3-train-36 merged to fork parity 7b3a17c6 (2026-10-23T10:02Z): the gate 20261023-092824-merge-m3-train-36, 20261023-092824-smoke-two-players to 20261023-095652-b-invis-recast (9 runs, 9 green, no rerun), held to its own builds before the push (gate-cite.py --fresh --head: checks 2 to 5 ok); T2 green beside the gate on skymp-server:m3-train-36 (t2-m3-train-36-1.log, 33 sessions identical); clones promoted (clean-m1 carries client 7b3a17c6, lab-driver 8d3b3139). Verbs: npc-puppet, playtest 33's fixes: the save's game-file actors load onto the grid at startup (WorldState::LoadDeferredActors), so a seat arriving late gets every resident the save holds (x-npc-late-join 20261023-092309 on the stage: seven of eight puppeted and blocked on the late seat; Hilde, in no save, runs live in both games until the roster's source changes, train-37); the roster's ten-second line lists its ids (the host's named only animals, creatures and placements); the puppet's activation block is native (PuppetApi's Demote and Promote, TESObjectREFR::SetActivationBlocked) and the TS blockActivation calls for puppets are gone. Probes on the stage: x-npc-talk-prompt v7 20261023-091415 green, b-npc-puppet 20261023-091827 green.
- m3-train-37 merged to fork parity 69958274 (2026-10-23T15:07Z): the gate 20261023-143826-merge-m3-train-37, 20261023-143826-smoke-two-players to 20261023-150430-b-invis-recast (9 runs, 9 green, no rerun), held to its own builds before the push (checks 2 to 5 ok); T2 is train-36's (t2-m3-train-36-1.log, 33 identical), since the train changes skyrim-platform and skymp5-client alone over 7b3a17c6; clones promoted (clean-m1 carries client 69958274, lab-driver 8d3b3139). Verbs: npc-puppet, playtest 33's Hilde case: the roster reads the engine's high-process actors (Skyrim Platform's getHighProcessActors) and PuppetService demotes every game-file actor the server's word does not name as this game's, so a resident with no saved record becomes a record at the first roster and a puppet on every other seat (x-npc-late-join 20261023-101310 on the stage, eight of eight; the server's "sights 35534 ... the record stood in 1cb84" at 10:14:41Z). The nightly on train-37's stage, 20261023-104716-nightly, was 70 of 71: p-spell-bolt red twice on the stealth mod's detection dummies (fe014811, fe01481d) pulsed by the lab spawn's wildlife, live in the games since npc-puppet; red on 7b3a17c6 too (the bisect, 20261023-142552); declared on p-spell-bolt's later list by main 626108f6. The citation failed its check 1, so the fresh gate ran.
- ADR-046 accepted (2026-10-23, about 08:15 PDT; Eli, relayed by numidium): the server's roll of a leveled or placed NPC's outfit and look is imposed on every engine, the host's included ("for 1, i want the servers roll pushed to both": npc-fate's roll covers outfits and 0xff placements, and playtest 33's headshot section passes with its build), and a figure carries only what the server gives it ("for 2 go with your recommendation": the client strips every distributor-added spell and ability at the figure's load, getSpellCount and getNthSpell then removeSpell, one rule for every SPID mod; the Player base kept; perks and keywords when a case shows them). The nightly's p-spell-bolt red of the same morning was the stealth mod's detection probes pulsed by the lab spawn's fox and rabbit (SPID's cloak on every non-player actor; the wildlife stands since npc-puppet's cleaner floor), declared on the probe's later list (main 626108f6, its own commit, the review entry filed), the reference kept, no train at fault.
- m3-train-38 merged to fork parity a25caf02 (2026-10-23T18:05Z): the gate 20261023-173049-merge-m3-train-38, 20261023-173049-smoke-two-players to 20261023-175237-b-invis-recast (11 runs), verdict watch: b-npc-puppet red once at step 3 on a teleport the seat never took (20261023-173905, E_RUN_TELEPORT: c2 stood at its start for 20 attempts), then green twice on the lone-red reruns (20261023-175513, 20261023-175945); held to its own builds before the push (checks 2 to 5 ok); T2 is train-36's (33 identical), the train changing skymp5-client and skymp-wire/ci/Dockerfile alone; clones promoted (clean-m1 carries client a25caf02). Verbs: ADR-046's figure half: a figure keeps only the spells the server equips on it (keepOnlyServerSpells at every equipment apply and in a ten-second sweep, since SPID adds at the actor's load), a puppet or a hosted resident never touched; and the CI image pins the stable toolchain (thuum/rust-ci installs stable by name, so a Rust job no longer reaches static.rust-lang.org at its start; the estate's DNS was out 14:52 to 16:45Z, the Mullvad relay repinned by core). Probes on the stage: b-duel 20261023-172149, b-spell 20261023-172521 and p-spell-bolt 20261023-172803, all green.
- Train-39, the quitting host, built on fork m3-train-39 206190dc (2026-10-23 13:26 PDT, pipeline 2743 running; the first of the four limits Eli wants built before playtest 34, docs/research/m3/decisions-for-playtest-34.md): the server reads each connection's silence itself. The wire transport stamps every received message per client and answers Server::client_silence_ms; IServer::GetSilenceMs (default -1) is forwarded by the combined server and measured by the wire server; PartOne::TickCellHosts marks a user silent for kStaleHostMs (3 s: twenty-three missed 130 ms reports, past a save's or a loading screen's stall; the lab calibrates it) stale, cells.rs stale() arms the grace on every cell it hosts and takes it out of every candidacy with its loaded set kept, and a user heard again is revived (each loaded cell considered anew, a grace of its own disarmed, a free cell granted). A killed, crashed or quit game passes its cells in about eight to nine seconds instead of playtest 32's twenty-four, with no disconnect needed; the client's disconnect at exit stays a later row (the process ends its threads before any exit hook). Tests: two in wire-rules (206 green), one in wire-transport (11 green), CellHostTest's silent-host case for the core (CI); clippy -D warnings, clang-format and fork-lint clean. The stage with T2 (a server change) and the kill-the-host read are numidium's; the verb doc's quitting-host row carries the rule and its one HYPOTHESIS, the number.
- Train-40, doors, built on fork m3-train-40 f64d556f (2026-10-23 13:58 PDT, four commits stacked on m3-train-39 206190dc; ADR-047 PROPOSED on main 935142d5 with the memo's D-numbers): D6 the follow (cells.rs: a follow table and may_move's verdict Refuse, Accept or Follow; a host's report moving its actor into a cell nobody hosts is a Follow when the host vouches for it, an adjacent exterior square its game has loaded or a door, an interior at either end with a persistent actor; simulator_of answers the follower while the cell is unhosted; the follow ends at a grant of the cell, the follower's unload of it or its departure; PartOne::MayMoveActor gathers the facts from libespm, CELL::Interior and the record header's PersistentReference flag; WorldState::simulatorOf feeds HostOf, so the word, the routing and the sighting gate see one simulator; ForceSubscriptionsUpdate keeps the simulator among an actor's listeners where the grid would drop it; the client moves an engine reference into its record's new cell through moveRefrToPosition instead of destroying its view, logged "[verb:npc-handoff] moved"); D10 the cold start (the first grants provisional for 5 s, UNMEASURED, a nearer eligible player by grid ring taking the cell at once, ties with arrival, no churn after; RefreshReach feeds rings through reach_ranked); (e) a refusal logged once a minute per actor with the count; D11 needs no server change (OnActorSighting already moves a record out of an unhosted cell) and waits for the night read. Switches: the cellFollow server setting and the npcHandoff client key, both default on, so D6 can run off if Eli's answer differs ("for D6, i dont love A": numidium answered that A moves no player). Tests: three in wire-rules (209), CellHostTest's follow case (the record moves one square on, the follower stays a listener, a visitor's report is dropped, the grant ends the follow, the espm facts); tsc, clippy, clang-format and fork-lint clean; the pipeline builds the C++. mp.get(0, "cellFollows") for the lab. H5 (a move into an unloaded interior) stays HYPOTHESIS until x-handoff-door; the three reads (door, restart, night) are drafted for numidium's grammar answer. ADR-048 (the mixed trust model) PROPOSED on main a0198f45 at Eli's request; D1 waits on it.
- x-host-kill 20261023-205837 GREEN on train-39's stage 206190dc (14:06 PDT, numidium's read): the killed host's cell passed 8.7 s after its last report (stale at 3.7 s, the grace's 5 s), about 5 s before netcode's disconnect and against playtest 32's 24 s; the visitor's Alvor and Hilde ran at once; the relaunched host took nothing back. The threshold's hypothesis measured: three live silences of 3.1 to 3.5 s at first loads after a login flagged stale and revived within a second, none at a mid-session loading screen, no grant moved on them; kStaleHostMs goes to 4 s (fork m3-train-39 2b14f213, local until the stage and T2 are done, then a fresh stage and gate). The merge still waits for Eli's D12.
- RE read for train-41 (the roll pushed to both, ADR-046 decision 1), 14:33 PDT, the re-analyst through REA on sky-re: docs/research/m3/re-npc-roll.md. The leveled base is rolled once at InitItemImpl (the reference's load, before any 3D) and stored as a cloned TESNPC behind ExtraLeveledCreature; the outfit is rolled separately at the first dressing with ExtraOutfitItem tags that suppress a second roll; both use engine-local randomness, so two games roll two species and two outfits by construction. Recommended imposition: two native detours (the roll wrapper 14752 answering the server's pick, the outfit init 16072 adding the server's tagged list) and the engine's own re-roll for a late fate; five observations to confirm on a seat first (section 7), the Frida plan in section 5. Two notes: CommonLibSSE-NG's pin binds id 16068 to two names (InventoryChanges::GenerateLeveledListChanges and InitScripts), and a reverse offset-to-id lookup is worth a `just addr --reverse`.
- lab/frida/npc-roll.js (14:48 PDT, written by an agent from re-npc-roll.md's section 5, every offset by `just addr` on the day and re-verified; node --check clean): ten hooks (the leveled resolver, the roll wrapper, CalculateCurrentFormList, GetCalcLevel, the outfit equipper, InitOutfitItems, AddWornOutfit, RemoveOutfitItems, the re-roll, ResetInventory) with the known callers' offsets for the near field, refs and bases filters, a 200-event cap on the frame-rate hooks, a ready line and a 5 s summary. Two header facts corrected the plan's register notes: CalculateCurrentFormList is a member (the out array in r9, the two flags on the stack) and RemoveOutfitItems takes the outfit alone. The probe x-npc-fate-roll (by path) runs it solo on c1 over the forest's two LvlAnimalForestPredator placements, with a relaunch leg for the persistence read; numidium runs it when a seat is free.
- x-host-kill 20261023-214420 GREEN on train-39's 4 s head (14:54 PDT, numidium's read): the pass 9.4 s after the last report; the login blips moved with the threshold (4.5 and 4.8 s at the first load after connect), so the number alone cannot clear them. Train-39 f88cd50d (local until its stage is free; merged into m3-train-40 92529f31 and pushed there): the silence is the smaller of netcode's time since any packet and the time since a message, and only a host is marked stale. kStaleHostMs stays 4 s; the next kill read on train-40's stage should show no stale line at a login and the pass still under 10 s.
