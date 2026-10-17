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
