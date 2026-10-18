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
   docs/verbs/headshot.md is NEXT after Apocalypse's first verb. Its mods
   on thuum branch headshots (CIF 2.0.7 and Headshot Kills 1.2, whose
   plugin is light by its header, FE003 on both ends), staged by their own
   layer-stage after Apocalypse's: CIF's boot on 1.6.1170 is unverified.
2. spell-cast: a cast's start and end as server state, a stream counted by the
   time it held its target, the observer casting the relayed spell, a spell
   hit starting a fight. DONE 2026-10-10 (45839102); b-spell 9ed66b8. The
   relay as the server resolved it: DONE 2026-10-13 (8eb4e78e, merged with
   m2-fifteen). The figure's cast animation: DONE 2026-10-15 as the
   cast-action verb (docs/verbs/cast-action.md, ADR-032; fork parity
   e75ee5c8, the gate 6 of 6 at 01:49, run set 20261015-083019): the figure
   plays the caster's actions through the engine's action entry, the
   caster's variables one update before each, the effect decided apart by
   the server's relay; b-spell 0d44f4b asserts the Equipped exit and the
   bolt's wind-up, p-spell-bolt 5bf1d51 is the first parity scenario to
   pass; the cast's hand comes from the action hook, a shout reports at its
   release; playtest eighteen's three findings
   and the god-mode breath each measured to a cause that night (the exit
   event rewritten by the relay, Skyrim Platform's hand fallback, the order
   of a start and its variables, shoutService's 3 s hit window). Melee keeps
   its event relay; withheld spells show their animations. Ghostwalk and the
   per-player globals wait behind it ("pin down how magic animations and
   effects are handled before Apocalypse").
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
   the server's stagger: DONE 2026-10-13 (8eb4e78e) as a stagger of 1.5, a
   stumble. The ragdoll throw: DONE 2026-10-14 (4e8aa04c) as the game's own push
   in the target's game (docs/verbs/push.md, ADR-031's first verb); b-push
   5b1e0d2. The figure's flight on the shouter's screen: DONE 2026-10-14
   (05192845: the shouter's game runs the vanilla push on the target's figure,
   ADR-029 A1's caster half; b-push 6f90239 checks that the figure flies, by
   the recorder's track, green twice; playtest eighteen ticked it). A
   bystander's screen and the parity scenario p-shout-uf3 are LATER.
7. Lag compensation (Bernier 2001): only if a playtest shows hits refused
   inside M1's slack. LATER.
8. cast-teleport (Lost Grimoire's Teleportation, from the stretch list): one
   permitted jump at the recorded cast, the mod's marker script let through in
   the caster's game alone. DONE 2026-10-12 (ef3fb03c); b-teleport 52d6195.
9. self-cast: a Self spell's effects run on the server (Invisibility and
   Etherealize as states, no damage to an ethereal player, a rest advancing
   the effects, Oakflesh's armor in the damage). DONE 2026-10-13
   (8eb4e78e); b-self-cast c260ff3. The invisible figure's crosshair
   prompt: PARKED until after the alpha (Eli, 2026-10-16); the state and
   the parked fork branch m2-crosshair in docs/verbs/self-cast.md.
10. Apocalypse (ADR-029, accepted 2026-10-13): the caster's game runs its own
    spells' effect scripts; a server-run allowlist grows verb by verb
    (docs/apocalypse-options.md, sections 4 and 5). Scenario b-apocalypse.
    - The mod on the lab: thuum branch apocalypse (10.2.3 into persist-mods
      and both load orders), staged by numidium's `just layer-stage` with a
      full sweep; NEXT after playtest eighteen's probes.
    - A1, Ghostwalk (docs/verbs/ghostwalk.md): its return taken as a cast
      jump (castTeleports with reach 0, a wait and the cast relayed), fork
      m2-ghostwalk f43d1f91, T0 green; its settings entry on thuum branch
      ghostwalk. Staged after the layer.
    - A2, per-player globals (docs/verbs/player-globals.md): 53 globals kept
      per player and set at login, fork m2-player-globals (rule, PlayerGlobals
      MsgType 44, the change form's record, server, client), T0 green; the
      list on thuum branch player-globals. Open for Eli: SkyUI for the MCM.
    - B1, Nature's Balance (docs/verbs/natures-balance.md), drafted: the
      server's effect runtime and the first allowlist entry. Open for Eli:
      the conditions, evaluated by the server (recommended) or the engine's
      word.
    - By class, not by spell (proposed 2026-10-16 in answer to Eli's "do we
      wanna do those in one big pass?"; the census's class table goes to him
      before anything is built from it). A census sorts the learnable
      spells, 175 of the plugin's 373,
      into classes by the engine's own parts: cast type, delivery,
      projectile, effect archetype, and what a script does to a shared
      world. Each class is fixed once, as a verb, in the order of how many
      spells it unblocks; one parameterized scenario runs each class's
      representatives against the engine alone (ADR-031), and the nightly
      runs every spell. A playtest checks one spell per class. The split
      (Eli, 2026-10-16: "the delineation of what spells go where ... fine
      adjustments to the plan"): the classes that act on players finish
      here; those that act on NPCs (summons,
      calm, fear and frenzy, a spell's detection event) move to M3, which
      hosts the NPCs they need. Twenty-one's first two class gaps:
      Scattershock's concentration missiles drawn backward on the other
      screen, and Decompose's cloak unseen by its own target.
    - The pass's probes ran 2026-10-18 01:14 to 01:40 UTC on parity ef02c565
      (x-class-self, -target, -bolts, -streams, -location, r-shock-nova,
      r-stagger-cast; docs/LOG.md), one class per row, each fix a fork
      branch on train m2-train-24 unless named otherwise:
      - target actor and touch: the relayed cast named the player by its
        server id, which the client made 0, so the figure's spell landed on
        nobody (Azure Reconstruction healed the figure itself);
        m2-target-actor, half measured: on train-24 (x-class-target2
        20261018-105815) the server counts Finger of Death's, Decompose's,
        Leech Seed's and Shadowbond's hits on the other player, which
        parity refused, but in that player's own game the relayed casts
        still land on nobody (Azure's stream healed the figure itself, 15
        applies, none on the player). HYPOTHESIS: the relayed cast carries
        target 0 for these deliveries (the sender fills it from Skyrim
        Platform's spellCast event, which names no target at cast time);
        the fix after the big playtest names the target from the aimed-at
        actor. Azure's heal raises no hit event, so its number waits on
        train-25's apply path. Also measured: an Apocalypse script that
        reads a figure's Health value misjudges it (figures hold a
        million): Finger of Death's self-damage branch took its caster
        from 10000 to 1 (docs/verbs/spell-cast.md).
      - second-hand (cloaks, procs; 30 spells): the caster's game reported
        every proc hit, the server dropped them all as hits of an unequipped
        spell; fixed by claiming a hit against the recorded cast whose
        records reach its spell, m2-second-hand (docs/verbs/second-hand.md).
      - Self bursts: the first hit refused for arriving with its cast
        (m2-self-burst); the engine spares the burst's own caster where
        RunSelfSpell hurt it (r-shock-nova; m2-self-burst).
      - target location: an observer's game showed nothing for Thrumming
        Stone, Lightning Strike or the rune; the explosion is now placed at
        the caster's point by the engine's own placer (34413), the
        projectile ones at the relayed launch (m2-spell-launch on train-24,
        m2-area-effect on train-25, docs/research/apocalypse/
        target-location.md); the explosion's own numbers are ADR-037,
        accepted 2026-10-18 (its gates ride train-26).
      - aimed streams: counted by time as built; Scattershock's 2.75 degree
        heading offset read to the figure's AimHeadingCurrent and fixed
        (m2-area-effect); an area stream (Scorching Hands) registers no hit
        on the caster's side at all, HYPOTHESIS under probe x-area-hit.
      - aimed bolts and beams: counted as built; Nature's Balance's swap
        waits on B1 (the conditions question, decisions-m2-apocalypse.md
        section 4).
      - the staggered cast (twenty-one): r-stagger-cast's bandit never
        attacked; rerun queued with an aggressive one.
      - per-player globals (A2) ride train-24 with these.
      - found on the way (x-class-target2 20261018-105815, read 2026-10-18):
        a server-set rise in a player's Health is reverted within about 2 s
        by the client's stale report (OnChangeValues takes the lower report
        as a fall, then crops the client's later report of the set value
        back down and sends it back; 7 of 11 upward sets in two runs); a
        server-applied heal would snap back the same way. A verb fix on a
        later train: an owner's set and the server's own changes win over
        reports that predate them (a sequence or a grace window in
        OnChangeValues); until then a scenario sets downward or reads at
        once (docs/LAB.md, numidium's note).
- Fix trains merged on the way: m2-fixes 2026-10-12 (c918a7a1: a plugin
  spell's reach, the crouch's hands, difftest on serde-saphyr); m2-visuals
  2026-10-13 (11c126b9: the shout relay, the silent re-teach, per-hand
  streams, Self casts on figures, the player's game counting no actor damage
  under ADR-028); m2-fifteen 2026-10-13 (8eb4e78e: a shout reported with
  magic readied or a weapon drawn, the recovery's 400 ms slack, god mode's
  shouts, a shout reported from its own hit, the server's console for the
  lab's setup); m2-push 2026-10-14 (4e8aa04c: an effect the player bears runs its
  script, a figure plays every relayed animation event in order, and a
  figure's spell on the player runs there except its Health, Magicka and
  Stamina numbers, which are the server's); m2-hands 2026-10-14 (4f74c3e1: a
  figure's hand spell start is held until the figure holds its caster's
  casting state, so a concentration cast's grab and push shows on other
  screens; b-spell b04f625 checks it); m2-flight 2026-10-14 (05192845: the
  shouter's game throws the target's figure by the vanilla push, a figure
  knocked down by its own game keeps still until its get-up, and an
  invisible figure shows no name).
- Playtest sixteen (2026-10-13, parity 8eb4e78e): self-cast, Unrelenting
  Force in both states and the restart of a running effect passed. Found:
  a god-mode shout's second breath shows no fire on the other screen (the
  figure's own voice recovery, probe x-tgm-breath), and the poisoned
  sword's look once more, when a spell went to the left hand (probe
  x-sword-left). Next (Eli, 2026-10-13: lab test scenarios before
  Apocalypse, player-driven work after): ADR-031's references and parity
  run with its gap list, the push verb (the ragdoll throw), then b-duel,
  then Apocalypse and headshots.
- Playtest seventeen (2026-10-14, parity 4e8aa04c; world
  playtest-m2-17-20261014T181512Z): Unrelenting Force's throw passed in the
  target's own game, one and two words a stumble only, the target's health
  unchanged from sixteen; Flames and Fire Breath on a player unchanged; the
  block hit and the stagger on the figure every time (the animation
  queue). As expected, the thrown player's figure on the shouter's screen
  drops where it stood and snaps to the landing once both are up (the
  push verb's flight, fork m2-flight). Found: the god-mode second breath
  still shows no fire on the other screen; an invisible player's name
  still shows above its figure (self-cast). Next (Eli, 2026-10-14): the
  hands first (the concentration pose), then the figure's flight.
- Playtest eighteen (2026-10-14, parity 05192845; world
  playtest-m2-18-20261015T024812Z): the flight passed (the thrown figure
  flies on the shouter's screen and is where its player is once both are
  up); the invisible player's name is gone. The hands did not pass: the
  figure's grab-and-push starts and does not stop, a left-hand Firebolt's
  bolt leaves the figure's right hand, and a Self cast shows no cast
  animation on the figure; the god-mode breath's fire shows "sometimes"
  twice now, still janky. Eli: look at how the animations that work are
  done. Probes x-flames-stop, x-left-firebolt and x-self-anim read the
  three; the hands fix ships with references and a parity scenario, since
  b-spell asserts only the start (docs/verbs/spell-cast.md).
- Carried from M1 into this milestone's lab runs: melee reach's unmeasured
  cases (the bash, bare hands, the scale across races) and whether a power
  attack reaches by the pick alone (docs/verbs/melee-reach.md,
  damage-flags.md); Whirlwind Sprint's dash fits the burst (measured
  2026-10-12); Unrelenting Force's knockback is a later slice of shouts.
- Exit: `b-duel` (server-authoritative damage between two players, effects
  visible to an observer) and `b-magic-restart`. MET 2026-10-14: b-duel
  cbed9a7 green twice by path (20261014-080327, -080710: a plain swing, a
  power attack's stagger on both screens, a block, Flames' stream, Fire
  Breath, each by the server's number with the victim's game within 0.01);
  b-magic-restart green, its playtest check passed in sixteen. The chart's
  remaining items continue under M2: the push verb DONE 2026-10-14 (4e8aa04c),
  then Apocalypse and headshots; ADR-031's parity assertion is in lab-api
  (bb9fed0) and joins b-duel with its references.
- The close (Eli, 2026-10-17: "can we roll 23 and 24 into one test? id
  rather just knock them all out if that's the last of m2"): one playtest
  checks everything M2 has left: both teleports' landing without the slide
  and Ghostwalk's look, the shooter's quiver on other screens, the load
  freeze fix, headshots, per-player globals, the staggered cast, and one
  spell per Apocalypse class that acts on players. It follows the class
  pass's probes (each class's gap measured before it is built) and the
  fixes they call for. SkyUI moves to the shared set's essentials, which
  Eli picks from his own mod list (a mod layer, checked by its sweep).

### M3: Hosting (8 to 16 weeks, the TES3MP move)

- How it starts (Eli, 2026-10-16): the way cast-action did, with the
  engine alone first. ADR-031's references of a host's simulation (NPCs
  under packages, a fight, a cell entered and left) are recorded before any
  code, and Skyrim Together's dropped AI package sync is read first
  (docs/TE-MAP.md, the cautions; its References.cpp: "experiment didn't
  work"). SkyMP's existing host path is lightly tested: the night before,
  its OnHostAttempt aborted the server (fixed on parity ef44a1d8). The
  rule is TES3MP's cell authority: the first player to load a cell hosts
  it, and on leave it passes to the visitor with the lowest ping
  (CoreScripts 0.8.1 logicHandler.lua). Apocalypse's NPC classes ride
  this milestone (M2's Apocalypse item).
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
- Vampirism and lycanthropy as declared state (R0; Eli's caveat on
  Nature's Balance, 2026-10-18): the race swap accepted from the player's
  game against the known vampire variant of its race and relayed to every
  figure, the spells and the feeding counters with it. Today the server
  takes an appearance only from the race menu (OnUpdateAppearance), so a
  turned player stays mortal to the server and to every other game, and
  every condition that reads ActorTypeUndead judges them wrong until then.
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
