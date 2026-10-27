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

### M2: Combat and magic authority (8 to 12 weeks, Class B). DONE 2026-10-21 (started 2026-10-09)

Closed 2026-10-21 11:13 PDT (docs/M2-CLOSE.md; LOG): playtest twenty-nine
the T4 half (2026-10-20, Eli: "lets aim to close this out on test 29"),
the scenario half the sweep 20261021-144529-m2-close (70 scenarios on
Train-31 9ad635cd over the re-laid layer, 69 green, b-push pending at the
merge under ADR-042b by Eli's word), Train-31 merged to fork parity
9ad635cd and the layer to main b0252470 as one stage under one sweep, both
clones promoted. Carried to M3 by name: docs/M2-CLOSE.md section 4 plus
b-push (the refused second Ragdoll under the layer, deterministic, its
sender the next probe's hook; push.md), the rows after twenty-nine listed
below (a stream's origin on the other screen, the victim's disintegration,
Prepare for Adventure's items, the login echo over a server set, Become
Ethereal's translucency, Survival's needs across a relaunch, the four side
rows of the 03:30 read) and the transport clock (with cell-host's merge).
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
   bystander's screen and the parity scenario p-shout-uf3 move to M3, when
   there are three seats (the friend playtests; Eli 2026-10-20, through
   numidium's session: "agree with all of those").
7. Lag compensation (Bernier 2001): moves to M3 (Eli 2026-10-20), still only
   if a playtest shows hits refused inside M1's slack.
8. cast-teleport (Lost Grimoire's Teleportation, from the stretch list): one
   permitted jump at the recorded cast, the mod's marker script let through in
   the caster's game alone. DONE 2026-10-12 (ef3fb03c); b-teleport 52d6195.
9. self-cast: a Self spell's effects run on the server (Invisibility and
   Etherealize as states, no damage to an ethereal player, a rest advancing
   the effects, Oakflesh's armor in the damage). DONE 2026-10-13
   (8eb4e78e); b-self-cast c260ff3. The invisible figure's crosshair
   prompt: PARKED until after the alpha (Eli, 2026-10-16; out of M2,
   reaffirmed 2026-10-20); the state and the parked fork branch
   m2-crosshair in docs/verbs/self-cast.md.
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
      list on thuum branch player-globals. SkyUI is in the essentials layer
      and playtest twenty-seven recorded and restored an Apocalypse MCM
      setting (test 1's 40bef:Apocalypse = 1): resolved.
    - B1, Nature's Balance (docs/verbs/natures-balance.md), drafted: the
      server's effect runtime and the first allowlist entry. The conditions
      settled by ADR-039 (ACCEPTED 2026-10-18: the server evaluates them,
      an unknown function refuses and logs), built across trains 27, 29
      and 30.
    - By class, not by spell (proposed 2026-10-16 in answer to Eli's "do we
      wanna do those in one big pass?"; the class table passed on his
      2026-10-16 split, player classes in M2 and NPC classes to M3, probes
      2026-10-18, fixes from train-24). A census sorts the learnable
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
        from 10000 to 1 (docs/verbs/spell-cast.md). Decided (Eli,
        2026-10-18, decisions §6): figures carry their player's real base
        values. The verb figure-values (R0), after the big playtest: the
        client gives a figure the maxima the server records for that
        player (actor-values' 164 bases) instead of a million, so the
        percentage the server sends reads as the right number and every
        script sees what it would see in Skyrim; the million's two jobs
        stay done by attackDamageMult 0 and the AddTarget refusal (a
        figure's own game never applies a figure's number) and by the
        server showing a stream's drain.
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
    - Train-27 (playtest twenty-three's findings, 2026-10-18 evening; Eli:
      "go build train-27"), in build order, each its verb doc's row:
      - rune and Lightning Strike casts: the caster's client throws at the
        cast and at the trip, so no cast reaches the server and the hits
        are refused (target-location.md); handlers made safe, a solo probe,
        then the observer's placement and the server's number re-read.
      - target actor by first hit: the relayed cast carries the target its
        first hit names, one hop later (spell-cast.md); the crosshair field
        a hint only.
      - effect conditions (ADR-039): the server evaluates CTDAs on effects
        aimed at another player, unknown functions refuse and log; Azure
        Reconstruction on a player the T3 claim (effect-conditions.md).
      - teleport snap: a server-vouched jump is relayed as a placement at
        any distance (cast-teleport.md); Shadowbond's swap as the server's
        move of both actors, once apocrypha's script read says what the
        swap does (docs/research/apocalypse/train-27-spells.md).
      - headshot prediction (ADR-038): the shooter's game plays the kill at
        once, the server confirms or reverts (headshot.md).
      - figure-values (decided above) follows the train with its own doc.
      - target actor, second cut (fork m2-cast-target, train-26; x-class-target2
        20261018-191615): the sender names the actor under the crosshair, so
        the self-landing is gone and Azure Reconstruction at 180 units is
        counted and healed by the server; at 300 units the crosshair pick
        names nobody while the engine's own pick hits (HYPOTHESIS: the
        activate reach), so Finger of Death and Shadowbond still land on
        nobody in the target's game. Follow-ups: name the engine's picked
        target (desiredTarget or a ray to the spell's range); a heal from
        another player must not begin a fight (OnSpellHit's hostility notice
        takes every spell hit); the imposed tick's re-basing forfeits the
        victim's regeneration since its last report (HYPOTHESIS).
      - found on the way (x-class-target2 20261018-105815, read 2026-10-18):
        a server-set rise in a player's Health is reverted within about 2 s
        by the client's stale report (OnChangeValues takes the lower report
        as a fall, then crops the client's later report of the set value
        back down and sends it back; 7 of 11 upward sets in two runs); a
        server-applied heal would snap back the same way. STAYS in M2
        (Eli 2026-10-20), a verb fix on a train: BUILT 2026-10-20 on fork
        m2-snapback eef10842 (the percentage hold, attributes.md; T0; its
        scenario b-snapback on review), for the train after twenty-eight.
        The rule: an owner's set and the
        server's own changes win over
        reports that predate them (a sequence or a grace window in
        OnChangeValues); until then a scenario sets downward or reads at
        once (docs/LAB.md, numidium's note).
    - Train-28 (playtests twenty-four and twenty-five's findings, 2026-10-19;
      merged to fork parity e3806870 2026-10-20T02:00Z, gate 20261020-013037
      ten green with b-shadowbond the watch item, T2 32 sessions identical),
      each its verb doc's row:
      - figure values: a figure carries its player's recorded maxima, not a
        million (figure-values.md; b-figure-values green; a player's own
        dent on a figure's bar is NOT fixed, train-29).
      - Shadowbond's concealment, third shape: the server records the proc's
        invisibility on both at the hit and relays it as each actor's own
        instant cast to every game but the caster's; the break or 20 s
        dispels it (shadowbond.md; b-shadowbond green twice after one red
        on its own aim, placement fixed main 8a2cb11; the own-player half
        CONFIRMED, four HYPOTHESIS tags left with plans).
      - the plugin loader matches a master's name without case (the
        Unofficial Patch's lower-case Creation Club masters), which lets the
        essentials layer load (libespm CombineBrowser).
      - the observer's guard against a projectile-less effect and the
        script-event whitelist admitting WB_DestroyAfterDelay_Script, so
        Lightning Strike's bolt no longer hangs on the caster's screen
        (spell-cast.md).
      - log hygiene (an unknown condition function warned once, then debug)
        and T2's pinned load order (server-settings-t2-load-order.json).
      - playtest twenty-five (the stage, no layer): figure values and
        Scattershock ticked; the concealment on test 2 failed (the Papyrus
        snippet applied nothing, hence the third shape); Finger of Death's
        ash pile, the rune's undressed glyph and Lightning Strike unseen by
        test 2 go to train-29. Playtest twenty-six (the essentials layer):
        loads and frame rate held; no MCM, cloaks without physics, no
        warmth, bare aspens, rotfern undressed by the slot shift (ADR-043,
        ACCEPTED 2026-10-19; the layer's three fixes render 2026-10-20 06:23).
    - Train-29 MERGED 2026-10-20 13:40, fork parity 4720d0d3 (built
      overnight on Eli's word; fork m2-train-29 709c90b0: 18c0e603's client
      and server content, a rune try measured and reverted, and the CI
      fresh-tree fix merged with parity d5f478c3; staged 04:02 with its
      gate's always set green and both clones' clean snapshot retaken on
      it, the essentials layer stacked on it for playtest twenty-seven;
      after the report, the 8df default and the login-time globals send
      (50a56e4a) and the T2 declaration move (4720d0d3) joined it; the
      layered gate's three reds read to the layer's headparts plugin, the
      served Firebolt and a refused second Ragdoll, and the layer-free gate
      20261020-201530-merge-m2-train-29 ran 10 of 10 green with T2
      identical across 32 sessions; both clones promoted; docs/LOG.md;
      each row's facts in docs/research/train-29-rows.md), in build order:
      - the client's Papyrus event filter: MERGED (b2db6354, docs/verbs/
        papyrus-events.md): a parent-chain walk so every MCM passes, the
        layer's plugin list read at Skyrim Platform's load, OnUpdate per
        script (ADR-044 ACCEPTED 2026-10-19, CONFIRMED by x-survival-unblock3
        20261020-024406 and by twenty-seven's Survival box and eight MCM
        entries); b-papyrus-events approved by Eli 2026-10-20 and in the
        layer sweep.
      - Lightning Strike on the observer: MERGED (07b33046) and the launch
        CONFIRMED (x-lightning-strike 20261020-085414: the observer's game
        launches the lobber 0x0c0cfe00); the bolt seen on test 2's screen in
        twenty-seven.
      - Finger of Death: IsEssential (354) MERGED on the server (eea3a5d5,
        T0; twenty-seven: the fail branch hurt the caster alone); the
        scripted kill stays the caster's game's (the ash pile), ADR-029's
        default, until the allowlist verb.
      - a player's own dent on a figure's bar: READ (x-figure-values-hit-frida
        20261020-085705): the fork's guard works and the vfunc it blocks is a
        post-write notification inside DamageActor 37335; signature
        resolved by the re-analyst (bool (Actor*, float, Actor*, bool),
        returns IsDead); train-30: a Gum interceptor-replace at 37335
        returning false for a figure victim (docs/verbs/figure-values.md).
      - the rune's glyph on the observer: READ (x-rune-visible-frida
        20261020-085906): the landing's look never runs for the relayed rune
        (no 44213, no 43919; arrived from the trigger tick, not a collision),
        so the tier is not the cause; the rune stands as a PROJ-based
        reference (refs-near); the glyph is the decal 34452 places through
        44186 after the caster's own launch, which the relay skips:
        CONFIRMED by x-rune-decal-frida 20261020-102818 (one decal call on
        the caster with normal and material, none on the observer); a
        launch-flag try measured a no-op and was reverted; train-30: relay
        the normal and material and call 44186 after the relayed launch.
      - Scattershock's hits: MEASURED and closed (x-scattershock-6s
        20261020-080751: thirteen missiles on both seats, the server records
        the hits; the 2.5 s hold had matched the charge); the missile's
        angle on the observer waits for a flights record for spell
        projectiles (Train-30's lab row, BUILT 2026-10-20).
      - small, all MERGED: the OpenContainer wait loop's 15 s deadline
        (18c0e603, activation-reach.md); EffectWasDualCast (724) with the
        dual flag from the cast message through the cast record to the
        evaluator (eea3a5d5, T0); the refs-near and papyrus-events driver
        steps on thuum main.

    - ADR-043's build (ACCEPTED 2026-10-19; the world stores every form as a
      FormDesc, a saved world carries its order and migrates, a login whose
      appearance does not resolve is refused): sized in
      docs/research/formdesc-world-map.md. Slice one BUILT overnight
      2026-10-20 on fork m2-formdesc-world d0693ef4 (not merged; CI green,
      13 of 13, 401 test cases): formVersion 2 with the presence guard;
      the load order saved beside the records (load-order.json for the file
      and zip drivers, a loadOrder document for mongo, passed through the
      migration driver); the twelve raw fields as "<hex>:<plugin>" on disk
      with runtime ids in memory, converted at the record boundary, the
      appearance's forms in a sibling appearanceForms; unresolved forms
      parked whole in a per-record list and written back when their plugin
      returns; a raw record re-based from the saved order at the first load
      that sees it; seven T0 cases (round trip, save under A load under B,
      v1 under a saved order, the parked plugin, the drivers). Its rule-6
      scenario b-formdesc-world APPROVED by Eli 2026-10-20 13:49 and on
      main de069a7b (scenario 973a412c; the fixture adr043-preslice-25 on main
      ebc4d726, twenty-five's eight raw records with the order they were
      written under; lab-api's `server: world:` restore and FormDesc ids in
      the known step on main 3fd7ae5); it proves the migration on a stage
      whose order differs from the fixture's, the layer stage, so it sits in
      gate.yaml's pending until the formdesc branch stages there; the branch
      carries parity 4720d0d3 since its merge 80cf1e35 (pipeline 2279, green).
      Slice one stays in M2 and merges through its stage's gate. Slice two
      moves to M3, before the friend deploys (Eli 2026-10-20): decision 3
      (the login refusal; the record is kept but LoadChangeForm still skips
      an unresolved race, so the 17:25 hazard stands until then), the six
      keep-on-miss fixes on fields already FormDesc, the thuum side of
      playtest-restore, the legacy effects map (deletable).

    - Train-30 (the rows found on 2026-10-20 before and during playtest
      twenty-seven; each to its verb doc as it is built), ASSEMBLED 15:13
      as fork m2-train-30 1d88a6b7 (four merges on parity 4720d0d3: the
      spells fix, ADR-043 slice one, the dent gate, the Hailstone
      conditions with the resistance rule; pipeline 2309 green, ctest
      included, T2 identical at 32 sessions; then 44372078, clang-format
      alone over three files for the fork's Formatting check; its pipeline
      2349 green in every job, T2 at it numidium's), the one stage
      for playtest twenty-eight (docs/M2-CLOSE.md), in build order:
      - learned spells lost on a RECONNECT (playtest twenty-seven, 11:21: a
        server restart with the game process up): the client's login path
        removes every spell and re-adds the server's list (remoteServer.ts,
        sync/spell.ts), and on a reconnect the re-add did not land (test 1
        knew only its save's Flames and Healing; the server's record held
        all fifteen and sent them; a fresh relaunch restored all seventeen).
        Read: there is no reload on a reconnect; the one difference from a
        launch is removing and re-adding the same spells in one frame
        (HYPOTHESIS). BUILT 2026-10-20 on fork m2-train30-spells 096d2cd8
        (client only, pipeline 2236 green): the list applied as a diff with
        a second pass a second later (docs/verbs/learned-spells.md); T3
        b-spells-reconnect approved by Eli and on main (red by design until
        this stages); a-restart-persistence takes the assertion after.
      - Survival's login race: the record's restore of 828 and 8df rode the
        login send and lost to the Creation's 5 s check once in two
        relaunches (test 2, 18:23Z), so the per-global default (built,
        fork m2-train30-globals-default edb2608c, thuum
        lab-survival-prompt-default bac34a7) is the belt and the lab's
        fixture is the clones' template save carrying 8df = 1 and 828 = 0
        (numidium's snapshot retake after the playtest).
      - a player's own dent on a figure's bar: a Gum interceptor-replace at
        DamageActor 37335 returning false for a figure victim (signature
        resolved; figure-values.md); the slot-0x104 guard goes.
      - the rune's glyph on the observer: relay the caster's contactNormal
        and material id with the cast (a wire change, message plus
        validator in one commit) and call the decal placement 44186 after
        the relayed launch for a grenade projectile (spell-cast.md); a
        per-figure rune cap in the observer's game.
      - Finger of Death's kill: the allowlisted server-side kill (ADR-029's
        ground; MpActor::Kill is the primitive) with the client's script
        blanked. Not built in Train-30; the default stood into playtest
        twenty-eight, where Eli ruled the kill ("if it kills them by effect
        of the spell, yes kill them"): Train-31's row.
      - Hailstone and kin: GetActorValue (14) and HasMagicEffect (214) as
        server condition functions, since Hailstone's own effects gate on
        them and apply nothing today (spell-cast.md). BUILT 2026-10-20 on
        fork m2-train30-conditions f2c0ba33 with T0 (the current Health,
        Magicka or Stamina; any other value from the player's record plus
        the server's own modifiers; a running effect by its MGEF); two
        HYPOTHESES in the doc, since resolved: the parameters CONFIRMED
        from the record bytes (the actor value index; the MGEF id in the
        file's own index space, mapped through the owning record,
        39affd73), and the race's constant abilities read from the records
        into the one modifier (52ea63f8: a Nord's 50 ResistFrost, an
        Altmer's Highborn magicka), T0 for both; a Hailstone probe for its
        T3 after the branch stages.
      - the resistance rule, found by the Hailstone row: the server imposes
        another actor's damage on a player and the player's engine refuses
        those effects, so the engine's resistance never ran on them. BUILT
        2026-10-20 on fork m2-train30-resist 8219604e, stacked on the
        conditions branch (libespm reads the MGEF's resist value; wire-rules
        resistance_factor, the element after Magic Resistance, each capped at
        the player's 85; MpActor::ResistanceFactorOf at ApplyEffects' one
        entry; T0 unit/ResistanceTest.cpp on Firebolt against a recorded
        Resist Fire and Resist Magic; magic-effects.md); HYPOTHESIS for a
        dual modifier's second value until x-hailstone, the same probe.
      - the lab: a flights record for spell projectiles in the driver (the
        Scattershock angle; BUILT 2026-10-20: fork m2-train30-flights
        951b5bbc raises projectileFlight for a spell's projectiles, the
        driver records projectile and spell as columns nine and ten,
        spell-cast.md), and the arrows step counting PROJ 50 (its PARW
        count was always 0): the count BUILT 2026-10-20 on thuum main,
        rides the next driver deploy; one base's presence stays the
        projectiles step's (marksman.md).

- Playtest twenty-seven (2026-10-20 morning, fork m2-train-29 709c90b0 under
  the essentials layer 29d83a0b; world playtest-m2-26-20261020T004645Z):
  every row ticked. The layer's three fixes (aspens, Artesian's cloaks under
  FSMP, rotfern whole with her stagger patch reverted); Survival Mode's own
  box on both seats, the first in a connected game, warmth from a WIC
  cloak, and the choice surviving a server restart; the MCM listing all
  eight menus with an Apocalypse setting surviving the restart;
  Shadowbond's concealment on both screens with the break by either seat;
  Lightning Strike visible on test 2; Electrosphere dual cast as the row
  said; Finger of Death's fail branch hurting the caster alone with test 2
  at full health. Found: a server-taught spell list lost on a RECONNECT
  with the game process up (the server's record intact; a relaunch
  restored it; Train-30's first row, b-spells-reconnect); Survival's login
  restore losing its race to the 5 s check once in two relaunches (the
  template-save fixture). Train-29's gate, its verb-merge and the layer's
  full sweep follow the report (ADR-040). Eli's call after the report
  (13:05 PDT): FSMP out, the cape physics worked but looked jank; the
  cloaks go back to vanilla capes in apocrypha's next render, which the
  layer stage and sweep take. Rendered 13:26: apocrypha/layer-essentials
  cf363c44 (FSMP, both Artesian physics packages and the Survival
  collection's HDT patch pair out; warmth kept by the collection's non-HDT
  patches, patched light at build so they hold slots 11 and 12 and no
  other plugin moves; nothing else in the layer leaned on FSMP), carrying
  the layer sweep's a-racemenu fix too: Playable Headparts All Races'
  head-part flags given both gender bits by a build-time plugin patch
  (lab/layer/plugin-patches.tsv; Eli 13:40: "patch it", over dropping the
  mod), CONFIRMED 14:07 by x-layer-headparts 20261020-210719 on the layer
  stage (racemenu-sync.md); the stage's smoke green with no FSMP log.

- Playtest twenty-eight (2026-10-20 evening, fork m2-train-30 44372078 on
  the fixed essentials layer c38a3b04; world playtest-m2-27-20261020T183558Z
  migrated by slice one): Eli's report 18:18, "im not super happy with this
  test ngl. deffo some backsliding in what i expected". Ticked: rotfern
  herself under the layer's order and after a restart; the reconnect keeps
  the spells; the dent gone; Survival asks no box; Hailstone's numbers on
  both seats; vanilla capes; loads and frame rate; the MCM (11 entries, the
  fixed layer woke more menus); teleports, quiver, no freeze, globals, the
  staggered cast. Found: test 2's heals doing nothing and no natural regen
  (both seats held Azure Reconstruction, a minion heal by its record,
  IsCommandedActor, so the caster's own engine refuses it on a player and
  the server saw no claim: right by the record, as Eli ruled at the
  report; Survival on for both seats, 828 = 1, so no passive regen; the
  heal that must work on another player is Healing Hands, Train-31's
  row); spells landing in
  different places on different screens (the arrow-path problem for spell
  projectiles; this train records their launch angles on both screens);
  Finger of Death's ash on test 1's screen only (the documented default,
  overruled by Eli at the report: "if it kills them by effect of the
  spell, yes kill them. why on earth would i want them dead in only one
  game"); the headshot row not tested by hand (Eli: the four bow shots in
  the log were a check of the marksman bug, not at the player, and the
  arrows landed alike on both screens; b-headshot green on the stage
  stands);
  Teleportation missing on test 1 (lost before tonight, in the slot-shift
  days; test 2's copy mis-based by the migration of a world saved without
  its order: slice two's first row); Survival's hunger, cold and fatigue
  asked for on the server (the Creation's globals, a per-player globals
  row); the setup's gives stacking (fixed, idempotent, main 485c4ee). The
  m2-close nightly over this stage and the merges per ADR-042a follow.
    - Train-31 (the rows of twenty-eight's report; the closing train since
      Eli's "lets aim to close this out on test 29": fork m2-train-31,
      head 3b579f41 on 2026-10-20 20:10, every row below BUILT with its T0,
      pipeline 2423 green, T2 32 of 32 identical at 20:45: stage-ready; it
      stages on the morning's
      merged base and playtest twenty-nine runs on it; each row to its
      verb doc as built), in build order:
      - heals by the record (Eli at the report, 2026-10-20: "azure
        reconstruction cast on another player should not heal them.
        they're not a summon. however i should be able to cast healing
        hands on them"): the server applies a restore effect to whoever
        the record's delivery and conditions name, as it applies a hostile
        effect's damage already (magic-effects.md), the effect's own
        conditions evaluated as ADR-039 does for Hailstone. The reads
        (docs/research/train-31-reads.md): Azure Reconstruction is a
        minion heal (IsCommandedActor, GetActorValuePercent), refused on a
        player by the caster's own engine, so nothing to build beyond the
        two functions in the evaluator; Healing Hands on another player is
        applied end to end already (measured 0.51 to 0.77), so its row
        fixes the two defects (a held heal counts as hostility and starts
        a fight; the Respite slot's HasPerk refuses as E_CONDITION_UNKNOWN
        where the record's answer is false) with the snap-back fix beneath
        (fork m2-snapback eef10842, b-snapback) so the server's raise
        survives the next stale report; and RunSelfSpell's
        FireAndForget-only gate widens to Concentration so vanilla Healing
        on yourself is the server's too. The hostility part BUILT
        2026-10-20 19:05 on fork m2-train-31 b0e4ba38 (T0
        unit/HealOtherTest.cpp); the self stream BUILT 19:36, 6f7b7a06
        (docs/verbs/self-cast.md, T0 unit/SelfCastTest.cpp); CI pending.
      - spell projectiles' aim parity: the caster's launch angles sent with
        the cast and the observer's figure launching from them, as arrows do
        (docs/verbs/marksman.md's shape; the flights record of this train
        measures the gap first). Eli at the report: "marksman check was
        great. just copy that for the spells": the arrows held on both
        screens in twenty-eight, so the row copies the arrow-path shape.
        BUILT 2026-10-20 19:50 on fork m2-train-31 c3dae632, no wire change
        (the cast carried the launch already; the caster's game now fills
        it for every projectile and the figure's cast takes it; the
        measured gap was 65 units of origin at equal angles,
        docs/research/train-31-reads.md section 6); b-spell-aim for review.
        Its first probe (20261021-042101, tonight's stage): the figure now
        launches from the recorded origin exactly, 0.00 units and 0.0
        degrees off; the 2.5 to 34.5 units left are the caster's own bolt
        moving from the Launch call's origin before its first update, so
        the cast now carries the flight's position as the origin (the
        commit after 3b579f41 on m2-train-31, for the morning's stage).
      - Survival's need globals per player (hunger, cold, fatigue values
        and their states) in the playerGlobals list, R2 (docs/verbs/
        player-globals.md), after a read of which globals the Creation
        keeps them in. READ and BUILT 2026-10-20 19:50: the three values
        are plain globals the need scripts write each tick (0x81A, 0x81B,
        0x816 of the .esl), the stage a script variable recomputed from
        them; three entries in lab/deploy/sky-srv/server-settings.json's
        playerGlobals, deployed with the train's stage; HYPOTHESIS: the
        restore lands before the need quests start (twenty-nine's item 7).
        Twenty-nine's answer (Eli, 22:42, correcting his tick): "those
        reset when test 2 came back", so the three values did NOT survive
        test 2's relaunch; NOT met. The log read (asked) says whether the
        seats ever reported the three, what the login sent back, or
        whether the Creation's start overwrote a restored value; the row
        stays open for the next train. The read (numidium, 22:50): the
        server sent the three at test 2's relaunch login ("sent 58 to
        watch, 5 values", 05:13:19) and the seat reported about every 40 s
        after, so neither side dropped them; the log carries counts, not
        values, and what is left is the Creation's start on the fresh save
        writing the defaults over the restored values before the first
        report. READ 2026-10-21 (x-survival-needs-relaunch 182745,
        x-survival-relaunch-start 190130, the Creation's scripts): the
        relaunched game's start runs each need's first tick before it sets
        Survival_ModeEnabled, and restored values at stage 2 or more open
        the Creation's modal help box, which pauses the game; the start
        never overwrites the values. Fix laid without code: the three
        help-shown flags 8e0, 8e1, 8e2 kept as playerGlobals with the lab
        default 1 (server-settings.json; numidium deploys); the relaunch
        read with them confirms (player-globals.md's Survival section).
      - ADR-043 slice two's first row: a repair for the lab's legacy worlds
        saved without their order (ids written across two orders), and the
        dangling 'a86df:Cloaks.esp' in twenty-seven's profile 2 cleaned.
        BUILT 2026-10-20 20:15 as lab/tools/world-repair.py (verdicts OK,
        DANGLING-PLUGIN, DANGLING-FORM, MISBASED, AMBIGUOUS over every form a
        record names, own records by MAST count, the server's numbering; a
        repaired copy under --out, never in place; 35 self-checks, the
        fixture clean); the read found the hand-cleaned entry was test 2's
        Teleportation mis-based and eight Apocalypse spells named as Cloaks
        - Dawnguard's beside it (docs/research/train-31-reads.md section 8);
        numidium runs it on sky-srv against the raw 28 snapshot with main's
        17-file order as the candidate, and the repaired copy may become
        twenty-nine's world.
      - Finger of Death's kill as the server's (Eli at the report: "if it
        kills them by effect of the spell, yes kill them"): when the
        script's kill fires in the caster's game the victim dies on the
        server and so in both games, ADR-029's first allowlist entry; the
        shape from the reads (docs/research/train-31-reads.md): the
        script's kill is arithmetic on the two Health values and one
        global (SelfDamage = 1.25 x the target's Health; the kill branch
        when the caster survives it, else the caster to 1 and the target
        down 0.8 of that), computed by the server (R0) from the claimed
        hit once the effect's seven conditions hold (IsActor, GetDead,
        three HasKeyword, IsUndead, IsEssential), as a wire-rules function
        with T0 for both branches; the C++ side joins the headshot list's
        shape (scriptedEffects: spell, kill: true, consulted in OnSpellHit
        after the claim and EffectConditionsHold) and calls Kill(aggressor)
        as the headshot does; the caster's game keeps the script's visuals
        (its player damage yields to the server's numbers already), the
        victim's game gets the death from the server. HYPOTHESIS:
        WB_IsResist's default, the figure's local kill racing a differing
        server verdict. BUILT 2026-10-20 19:05 on fork m2-train-31 b0e4ba38
        (docs/verbs/scripted-effects.md; wire-rules scripted_effects with
        T0, PartOne::ClaimScriptedKill, unit/ScriptedKillTest.cpp; CI
        pending; b-fod-kill to write).
      - the headshot row: not tested in twenty-eight (Eli: the bow shots
        were a check of the marksman bug); the next checklist carries it,
        b-headshot its proof.
      - a server set lost to the login echo (found at twenty-nine's setup,
        numidium 21:31: test 1's Magicka set to 400 between the login send
        and the client's echo of the applied record read 120 after the echo
        was taken; a second set held): HYPOTHESIS until the log read says
        which side dropped it; the held set must outrank the echo
        (docs/research/train-31-reads.md section 9); setup sets after the
        echo meanwhile.
      - Become Ethereal's look on the other screen (Eli during twenty-nine,
        2026-10-20 21:38: "there are actually TWO affects that should
        propagate to rotferns view but only one does. player two has
        whisps but never actually goes transparent"): the shout's relayed
        Self cast gives the figure the wisps and not the translucency.
        HYPOTHESIS until the record read: the word's spell 0x5F6EB
        (VoiceMakeEtherealScript's spell; docs/verbs/shouts.md) carries the
        Etherealize archetype whose translucency the engine applies to an
        actor by a path the figure's cast misses (a second effect or shader
        not relayed, or the archetype's alpha on a non-player actor); the
        read names it, then the figure gets both.
      - a relaunched game's value reports not taken (numidium's grep of
        twenty-eight's log: after test 2's 18:08 relaunch "report before
        the login's record was applied, not taken" three times and no new
        "recorded N bases" line, so his reports were dropped for the rest
        of the session; docs/research/train-31-reads.md section 3b):
        the gate named by the code read and numidium's two probes
        (x-relaunch-reports 20261021-015132 and -b 015600): the hold armed
        only at the record's send and cleared only by a report dominating
        all 164 bases, never echoed by the client. BUILT 2026-10-20 19:36
        on fork m2-train-31 6f7b7a06 (docs/verbs/actor-values.md: the hold
        armed at the login, the comparison over skills, attributes and
        level, the refusal naming the bases, the client's echo; T0 both
        sides; CI 2423 green); b-relaunch-reports GREEN 20261021-041549 on
        the tonight stage (the early report refused and the echo taken
        0.1 s later), for Eli's review.
- Playtest twenty-nine (2026-10-20, seats 21:33 on fork m2-train-31
  3b579f41, re-staged at Eli's word 22:02 on 9ad635cd with the two fixes
  the stage's probes called for; the staged essentials layer plus main's
  settings; the repaired 28 world; report 22:33): the closing playtest
  (docs/M2-CLOSE.md section 3b). Every item ticked but three marked
  unsure: the relaunch row ("unsure what this is testing": the lab's
  b-relaunch-reports and numidium's live read of test 2's 22:12 relaunch
  are its proof), Prepare for Adventure ("i had things in my inventory,
  then they vanished, then they wouldn't come back 2nd time i cast": a
  finding, the inventory the server owns against a script that stores and
  returns items, HYPOTHESIS until the log read) and Sealed Resolve ("hard
  to tell visually as the perk only lasts 15 seconds", the log read asked).
  Ticked with notes: Finger of Death's kill branch kills test 2 in both
  games with the ash pile on test 1's screen only (the victim's own game
  plays a plain death: a cosmetic row); projectiles land alike on both
  screens but "the fire stream doesnt hit the same spot for flames" (a
  stream's origin, the next row of the aim family); Thoughtsteal's granted
  spell "worked just fine" where the checklist said the server refuses it
  (the spell-list sync of train-30 teaches it; the census tag is stale);
  the MCM shows eleven entries (apocalypse, goggles, idrc, jewelry limiter,
  reading list, skyui, stealth detection fixes, true directional movement,
  true HUD, undead fx, unread books glow). Section 5 empty: none of
  twenty-eight's backsliding named. Corrected after the report (Eli,
  22:42): the Survival needs row is a NO, "those reset when test 2 came
  back"; the need-globals row reopens. By the checklist's own rule a class
  spell that misbehaves is a finding, not a fail of the close, so the T4
  half of the close is met with the findings carried by name; the
  scenario half is the morning's sweep over the train staged on main's
  merged layer, then `just verb-merge m2-train-31`, then M2 DONE.
    - The rows after twenty-nine (the next train, M2's tail, or M3 by
      name in docs/M2-CLOSE.md section 4), in build order:
      - a stream's origin on the other screen (Flames): the figure's
        concentration cast starts at its own hand along the relayed aim;
        the caster's stream starts at its own node, as the bolts did
        before b5075e04; the same launch-position carry for a stream's
        first projectile, or the aim's origin per update (spell-cast.md).
      - the victim's own game plays the disintegration the caster's does
        (SetCriticalStage and the ash pile) when the server's kill came
        from a scripted effect: a relayed look in the scripted-effects
        entry, as cast-teleport's `look` names one (scripted-effects.md).
      - Prepare for Adventure and its class (World or player state): the
        log read (numidium, 22:50): the script's AddItem ran in test 1's
        game, the server's R0 inventory never held the two items, and ten
        seconds later the equipment update naming them was refused and
        undone ("inventory does not contain item 1a0dd9db"); so the server
        gives the spell's items, in scriptedEffects' shape (an entry naming
        what the spell grants), a train row.
      - Sealed Resolve: read, nothing to build (one self cast, its effects
        run on the server, no refusal; the perk is the caster's game's);
        his death to Hailstone during the 15 s hid it.
      - the grants class (Thoughtsteal, Inferno, Knowledge is Power,
        Meridia's Wrath): NOT a row. The log read found no cast of the
        granted spell at the server, and Eli corrected my reading (22:58):
        "the player one equipped those spells and that was visible to
        player 2. that's allowed to be non server authoritative. something
        like that is perfectly fine riding on the existing functionality":
        the granted spell's equip rides the equipment relay to the other
        screen, and that is the class's design. The census tag ("the
        server refuses its equip") is corrected to that. Thoughtsteal's
        effect on the target refused on function 570, unknown to the
        evaluator (ADR-039): a note, nothing applied for a script effect
        anyway.
      - the login echo over a server set (section above) and Become
        Ethereal's translucency (section above).
      - the transport's frozen clock (found 2026-10-21 00:20 on the way to
        cell-host's round trip, docs/research/transport-clock.md): the
        polls never called renet's own update, so no lost reliable packet
        was ever resent and every round trip read 0; fixed on fork branch
        wire-renet-clock (off 9ad635cd) with a T0 that fails without it;
        no wire change. Merged into fork m3-cell-host (1c21308a), so it
        lands with cell-host's merge, unless cell-host stalls past the
        friend-deploy date, when it gets its own gate (agreed with
        numidium 2026-10-21 08:4x); the lab measures it under netem loss
        (the new `server: netem` step, main 2294723) with the probe
        x-renet-loss, before on parity at 9ad635cd after Train-31's merge
        and after on m3-cell-host's stage; a red after-reading stages
        wire-renet-clock alone to separate the two branches.
      - from the 03:30 sweep's read (2026-10-21 morning, the four reds,
        docs/research/layer-reds-2026-10-20.md's sequel): b-push's known
        refused second Ragdoll has its decisive probe written and never
        read, lab/.cache/probes/x-push-knock-frida.yaml (HYPOTHESIS: the
        server's imposed stagger snippet lands after the victim's own
        Ragdoll and re-knocks it in place; the fix, skip PlayStagger for a
        hit whose spell carries the push effect, waits on that run; the
        probe's first run crashed c2 before a line, the trace is lighter
        since). CARRIED TO M3 by Eli, 2026-10-21 11:03 ("carry b-push to
        m3"): pending at the merge under ADR-042b, red twice in the M2
        close sweep (20261021-144529-m2-close, 69 of 70 green otherwise);
        the probe on the first free slot, the fix in M3's first train
        (push.md's last section);
        x-melee-edge, the sword's edge re-measured under the layer (180
        units hit on the train-29 stage and missed twice on train-30 plus
        the layer at identical positions; the layer's bodies are the
        suspect; a-melee-reach stands at 170 meanwhile); GetGlobalValue
        reading the Dragonborn gate's global 2020e99 in the plugin's own
        index space rather than the load order's (HYPOTHESIS, a mapping
        gap in the form-parameter rule; harmless today, the reward is 0
        either way).
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
  damage-flags.md); they STAY in M2 as nightly or probe measurements (Eli
  2026-10-20). Whirlwind Sprint's dash fits the burst (measured
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
  Named (Eli 2026-10-20, through numidium's session): playtest twenty-eight
  closes M2, the list above plus train-30's rows, on a stage carrying them
  (the essentials layer merged, the reconnect spell fix, ADR-043 slice one,
  the dent gate, the Hailstone conditions and the resistance rule as they
  land); after it the HYPOTHESIS probes and the snap-back fix. Moved by Eli
  after twenty-eight's report (2026-10-20, before 18:55: "lets aim to close
  this out on test 29"): twenty-eight's findings make Train-31 the closing
  train, built on the morning's merged base (the train and the layer under
  ADR-042a), staged, probed, and playtest twenty-nine on that stage closes
  M2 with every T4 item ticked. Nothing else in M2 waits on him. The
  closeout set, the scenarios and T4 items whose
  green closes M2 and the carries to M3 by name: docs/M2-CLOSE.md (Eli,
  2026-10-20: "cook on a closeout set of tests, that if it passes we call
  m2 done").

### M3: Hosting (8 to 16 weeks, the TES3MP move)

- STARTED 2026-10-21 00:05 PDT (Eli, after twenty-nine's report: "i
  suppose kick it off when you're ready"), with M2's close finishing in
  parallel (the morning's merges, Train-31's stage and merge). The first
  verb is cell-host (docs/verbs/cell-host.md, drafted from ADR-035 and
  docs/research/m3 the same night): the cell's own NPCs under one game's
  AI, puppets elsewhere, the server's election, grace and freeze, the
  reserved wire family given its senders. The engine-alone references
  (r-npc-packages, r-npc-fight, r-cell-leave) and the puppet probe
  (x-npc-puppet) ran on the new driver on 2026-10-18 (docs/research/m3/
  readings-2026-10-18.md); their reruns on the merged base and the first
  verb's probes take the lab after the morning order. Apocalypse's NPC
  classes, the placers, the shouts' bystander and ADR-043 slice two ride
  this milestone (docs/M2-CLOSE.md section 4). The verb order, from
  ADR-035's consequences and the first doc's cut: cell-host (the election,
  grace, epoch and freeze; the reserved wire family given senders; the
  host's NPCs on SkyMP's existing relay), npc-puppet (AI off on the other
  games, the engine's own references kept, the cleaner and the copies
  retired), npc-stream (the host's state stream, HostedActorState as
  Unreliable), npc-handoff (the saved state replayed before the grant),
  npc-fate (one leveled roll per cell, deaths that persist). The first
  doc's probes: x-cell-attach (solo, the cell events and the grid math),
  then b-cell-host on a creature cell; the exits c-riverwood and
  c-dungeon-enemies after npc-handoff and npc-fate. Built the first night
  on fork m3-cell-host: the cell host table (wire-rules cells, afc792c1,
  six T0) and the wire contract (CellLoaded 47, HostGrant 48, HostRelease
  49 with validators, fixtures and the C++ message layer, ea0e24d3); the
  verb doc's cell_of resolved to libespm's existing exterior-cell index;
  the round trip's exposure designed (Server::client_rtt_ms, on
  wire-renet-clock). The morning of 2026-10-21 (07:00 to 07:15): reach
  made a fact with decisions (the 5x5 load against the 3x3 grid,
  8f17d7a4), the bridge's Cells, the core's integration (9aadeaea:
  CellOf and HostOf, the facts, HostGrant and HostRelease sent, the
  hosted flag frozen by default, the cell-change rule, Host 14 ignored,
  the hosters map retired, CellHostTest), then the client's HostService
  (5f10768c, 07:22: CellLoaded from cellFullyLoaded plus the attach poll,
  the grants with the monotonic epoch, isHostedHere and isMine at the four
  sites; tryHost and the HostStart/HostStop handling retired; tsc clean).
  Then (07:25 to 07:50): the round trip (wire-renet-clock merged into
  the branch, client_rtt_ms through IServer::GetRttMs to the table every
  tick, f2b59a33), the T2 session cell-host.yaml at the spawn's cell
  0xbbb1 (5fef550a), the host table listed for the lab (38f29158 and the
  gamemode's labState cellHost and ref, main 6c1adbe), libespm's exterior
  index guarded against a worldspace's persistent cell (29a7b56e, the
  doc's HYPOTHESIS measured), the driver's cell-events steps (4b69e9c),
  the probe x-cell-attach and the scenario b-cell-host (9a5272e, Eli's
  review). CI 2481 green at 8145082b; the later heads building. Waits:
  lab-api's server.host, server.ref, a snapshot compare and the run's
  npcEnabled (numidium, after the M2 merges), a stage-client with the new
  driver, then x-cell-attach, b-cell-host and the verb's T2 run on sky-srv.
  The second verb's doc, docs/verbs/npc-puppet.md, drafted the same
  morning (08:10): puppets as the engine's own references with AI off on
  the non-host games, the cleaner and the copies retired, the loader's
  bans lifted; its code waits on the re-analyst's prototypes (41370,
  41453, 37356) and cell-host's probes.
  cell-host DONE 2026-10-21 13:47: fork parity 535544db, b-cell-host green
  twice on its stage and in the gate, T2 33 identical, the verb doc closed
  (docs/verbs/cell-host.md; three lab fixes on the way: the CellLoaded
  budget 128 then 32, the client's 30 s refresh of its loaded set, a copy
  disabled before its delete and the cleaner's double-pick guard; the
  tags carried by name: H5 a third seat's, H6 and H7 npc-stream's, H8
  npc-handoff's). The transport clock fix landed with it.
  NEXT PLAYTEST (Eli, 2026-10-21 11:07, "go with the first one"): M3's
  first look, playtest thirty: cell hosting live on SkyMP's existing NPC
  copies, the server with npcEnabled on (today's loader admits the
  wildlife and the non-unique, non-essential, non-humanoid NPCs; the
  humanoid lift is npc-puppet's), one game running a cell's NPCs, the
  handoff when it leaves, the freeze when nobody is there. Seats aimed at
  2026-10-22 evening if cell-host's stage goes green today: after the M2
  merges, lab-api's deploy and a stage-client with the new driver,
  verb-stage m3-cell-host (T2, x-cell-attach, b-cell-host, the smoke),
  the gate sweep and its merge, then the playtest's own server setting
  (npcEnabled for that server, off the shared file, ADR-035 point 9) and
  the checklist docs/private/playtest-m3-30.md with each seat's perks.
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
- npc-puppet DONE 2026-10-22 05:54 PDT; the walk cycle re-opened by playtest 31 the same morning and CLOSED by train-33 (fork parity fb6f3f09, 18:13 PDT, the gate 9 of 9): the graph's Speed and Direction are data channels fed from the movement step's fields, which the puppet's detour now writes every frame from the host's sample (docs/research/m3/re-puppet-locomotion.md); the stride on film at results/train-33-stride; train-32 (parity 16b8854a, 12:4x) carried the playtest's other fixes; train-33 also settled a standing figure or puppet onto a still record (b-duel's stagger-pushed figure) and the host's own cell report (fork parity 19e7ca9b, main fbee62d; the gate run set 20261022-122513-merge-m3-npc-puppet nine of nine on lab-driver ebb6969 (smoke, a-restart-persistence, b-duel, b-npc-puppet 123325, b-cell-host, a-melee-reach, a-racemenu, b-spell, b-invis-recast), after the first set 113519 went eight of nine red on a-restart-persistence 113744 by the driver's random near sample; T2 33 identical beside it; the record below). Begun 2026-10-21 17:41 PDT, Eli's approval of the Train-34 (fork parity 7e59c32c, 2026-10-22 21:40 PDT, the gate 20261023-041115 nine of nine) carried playtest 32's four fixes: the walk-in-place guard, the NPC headshot's race from the NPC_ base, the promote's undo of the activation block, and the activation reply sent only to the activating player. Train-35 (fork parity ac557132, 23:48 PDT, the gate 20261023-061702 ten of ten) carried the night's finding: a health percentage lives in [0, 1] on the wire and the puppet apply never kills, so a host's actor floored below zero no longer dies on the other screen. Train-36 (fork parity 7b3a17c6, 2026-10-23 03:01 PDT, the gate 20261023-092824 nine of nine) carried playtest 33's two: the save's game-file actors loaded onto the grid as the save attaches (a late seat had run eight residents frozen and unblocked, their records deferred) and the puppet's activation blocked natively from the demote (a dialogue opened on an unblocked puppet never closed); train-37 (fork parity 69958274, 08:07 PDT, the gate 20261023-143826 nine of nine) made the roster and the demote read the engine's high-process actors, since the attach events name temporary references alone; x-npc-late-join green on all eight residents on its stage.
  one-shot plan after playtest thirty's spinning wolves): the measured
  cause (docs/verbs/npc-puppet.md "Why now": the hosted flag never reached
  a game-file actor's client copy, so the host never reported it and every
  screen re-applied a frozen record every 2 s through a self keep-offset
  whose turn renews itself each frame), ADR-045 proposed, Stage 1 on fork
  m3-npc-puppet a29bfb08 (the server's id and flag change, the bans lifted,
  T0). Stages 2 (Skyrim Platform's puppet switch and two detours), 3 (the
  client), 4 (numidium's grammar), 5 (P0 to P5, b-npc-puppet, the gate) and
  6 (docs) follow with no playtest between; playtest 31 after the merge.

- STATE 2026-10-23 17:45 PDT (the day's chart line, replacing the 15:2x
  one): cell-host DONE (parity 535544db), npc-puppet DONE (19e7ca9b), trains
  34 to 38 merged (parity a25caf02). The four limits Eli asked for before
  playtest 34: train-39 the quitting host (fork m3-train-39 f88cd50d: the
  stale-host rule, the pass under 10 s measured three times, no login
  blips; carried inside 40; merge at D12); train-40 doors (m3-train-40
  10375935: D6 the follow behind cellFollow and npcHandoff, D10 the cold
  start by ring proven in the lab, the refusal log; the door finding fixed,
  a hosted NPC's door is its host engine's to walk through with the server
  judging and asking, the viewer's half two ways; four fixes from the door
  read; staging, the door probe v4 decides D6's proof, then T2 and the gate;
  merge at D6 and D12); train-41 the roll pushed to both (m3-train-41
  45ae4194: ActorFate 51, the server's one roll at the first loader's level
  ahead of the engine's attach, the respawn re-roll, two Skyrim Platform
  detours on the sites the lab confirmed, the leveled wrapper and the outfit
  resolver 16155, behind npcFate off by default until the parity probe;
  ADR-049 PROPOSED; stages after 40); train-42 deaths (m3-train-42 31fbfa12:
  the death-word seam built, option-independent; the rest waits on ADR-048,
  the mixed trust model, the path mapped in docs/research/m3/death-path.md).
  Decisions with Eli: D6, D12, ADR-048 with C-ii, ADR-049. Playtest 34 after
  the four and their reads; its checklist at Eli's word.

- STATE 2026-10-24 16:45 PDT (the day's chart line, replacing the 17:45
  one): trains 39 to 43 merge-ready by citation at fork m3-train-43 de9d048e
  (gate set 155001 all sixteen, T2 green, gate-cite's five checks; 43 the
  hands pin, D17); Eli's answers (15:49 PDT, the memo): D1 B, D2 a middle
  ground, D3 to D11 A, D12 B with A as the background, D13 to D17 A; and
  "Hold until built": the merge waits for train-44 (fork m3-train-44
  53b9fd65, stacked on 43, built 16:05 to 16:39 PDT, CI running): D1-B the
  host's checked death report (ActorDeath 52; the server takes a death it
  has no number for when it can check the cause against its own evidence:
  the killer's numbered hit, the host's samples' drop, an activation beside
  the body; ADR-048 ACCEPTED as B); D12-B the client's disconnect at the
  game's own quit (Skyrim Platform's thunk on WinMain's call to the engine's
  shutdown, the re-analyst's read; the stale rule stays the backstop); D2 the
  roll's level by one rule behind npcRollLevel (party-mean by default; the
  pick a settings line). Two HYPOTHESIS reads owed on 44's stage
  (x-npc-fall-report, x-host-quit with lab/frida/quit-path.js). Then
  numidium's stage, T2 and gate of sixteen plus the two, Eli's look, the
  merge of 39 to 44, the clones' promotion, playtest 34 (its checklist
  drafted in docs/private/playtest-m3-34.md, the build named).
  18:42 PDT, the same line's end of day: 44's head is 6cdc2b35 (the trap
  trigger's own activation forwarded as the hazard evidence after the
  scripts' read; the death report read from the health floor after the
  first fall run fired nothing under the engine's deferred kill); both
  reads GREEN on its stage (the fall's drop of 3813 units taken, the quit's
  leave line 1.2 s after the quit and the grant at the grace) and committed
  as b-npc-death-report (3c6c54e) and b-host-quit (8dcc000); T2 and the
  gate of seventeen run. One finding open: on 44 the game crashes inside
  its own Scaleform teardown after the disconnect at every console quit
  tested (3 of 3), the server side whole, HYPOTHESIS a GFx movie alive at
  quit (the console's, the lab's quit path); its discriminators need a stage
  change and wait for Eli's look. Research drafted during the waits:
  docs/research/m3/encounter-zones.md (ADR-049's owed clamp). 20:13 PDT:
  MERGE-READY by citation (gate set 20261025-015916-gate-m3-train-44,
  eighteen green on their last runs, T2 green at 6cdc2b35, gate-cite's five
  checks); the command in the memo's "Merge-ready (44)"; Eli's word next.
  22:23 PDT: MERGED on Eli's "Merge now" (numidium's verb-merge citing the
  set): trains 39 to 44 on fork parity 6cdc2b35 (from a25caf02), both clones
  promoted to clean-m1 at 6cdc2b35 (22:24), thuum main cd39f801 with the
  pin; D2 settled as A2 party-mean (the default). The lab stands on the
  merged build. Next: playtest 34 at Eli's word from the checklist; the quit
  crash's three discriminators on the stage after it; then the playtest's
  findings, and M3's remaining rows (npc-stream's smooth motion, dialogue on
  a puppet, the encounter zone clamp drafted in docs/research/m3/
  encounter-zones.md, the trap evidence's lab read).
- STATE 2026-10-25 14:22 PDT: the night's nightly on the merged build read
  four M3 reds, none the code's (a spin bound too tight, god mode lost at
  a restart, a one-in-five roll, and the client's unbounded wait on the
  engine's ragdoll call); the three scenarios are amended and green again,
  and the fourth is train-45 (fork m3-train-45 fa8809a1, the ragdoll wait
  bounded, client only), MERGED at 14:20 on Eli's word with a gate of
  eighteen green (parity fa8809a1, the clones promoted, thuum main
  9c1652dd). Eli chose the quit-crash checks before the playtest: six of
  six quits crash alike on every seat, path and build, with or without our
  client, so the crash is the Skyrim Platform and SKSE stack's, not ours;
  the leak is NAMED (the engine's always-open Loading Menu's movie held past
  the heap teardown), the holders mode and the bisect order wait for after
  the playtest. The fall scenario's subject is a fixed wolf (no roll). The
  lab stands on skymp-server:m3-train-45 and clean-m1 at fa8809a1; playtest
  34 at Eli's word from docs/private/playtest-m3-34.md.
- STATE 2026-10-25 18:24 PDT: playtest 34 ran on fa8809a1 (14:33 to 16:11,
  called by Eli) and every defect it showed is built: train-46 (fork
  m3-train-46 aaafffe5, server: the pass between live hosts at a crossing,
  the server-made actor's death by the NPC rule, the hosted hit's weapon
  mismatch said at info, the corpse's occupancy released by its looter's
  closing activation) is MERGED (18:44 PDT, Eli: "Merge now"; fork parity
  aaafffe5, thuum main bfc41e0b; gate 20261026-001639 eighteen of eighteen,
  T2 green, the four fixes read true at T3; four scenarios committed from
  the greens, b-host-own-hit, b-npc-handoff-cross, b-npc-body-release and
  b-npc-protected); train-47 (client,
  f70cf19f: the looted body's inventory as a diff alone, the hosted
  server-made copy dressed once, the late fate's redress-or-reload of the
  3D, a puppet's own activation not forwarded) and train-48 (server,
  9b412a10: a disabled actor's death schedules no respawn, a dead player
  hosts nothing) are built ahead, CI green, waiting on Eli's letters to the
  memo docs/research/m3/decisions-after-playtest-34.md (D18 to D23). The
  playtest's reads: the invisible dungeon pair was the late fate's 3D, the
  body's "can't interact" the container's one occupant plus a release
  defect, the zero damage god mode. The quit crash's holders read and the
  bisect wait for the lab's next window.
- STATE 2026-10-26 03:10 PDT: the structural review
  (docs/research/m3/structure-review-2026-10-26.md) found the core sound and
  three commitments in the casting shape, two with one root (npc-stream
  never built); ADR-050 ACCEPTED (Eli: "proceed with the pivot. open
  ADR-050 and start npc-stream"): NPCs through the engine's own entries,
  npc-stream first, deaths by the engine next, one NPC path, the owner table
  as a later ADR, the safeguards back on. Trains 47 to 50 HELD unmerged
  pending Eli's word per survivor. npc-stream slice 1 (ACTIONS) BUILT on
  fork m3-npc-stream c2129b4a (the hosted set and the in-flight mark in
  Skyrim Platform, the hook widened, a hosted actor's actions as UpdateAction
  under its own id, the puppet's replay admitted for every action, the
  relay's source dropping what the action covers; CI building), probes P1
  (solo inventory, today's client) and P4 (two seats, the stage) by path for
  numidium. The quit crash is not ours (both halves read: two plugins' leak,
  the engine's world teardown); D24 stands at B with D.
- STATE 2026-10-26 13:20 PDT: the NPC ladder APPROVED by Eli (plan file humble-crunching-iverson.md;
  "if something is drafted just do the thing, 35 can wait till that's done"): Step 0 merges (D25-C the
  stream alone, P7 v3 green on its letter with the resident still deferred; D28-B as one stack m3-train-50b
  of 47b, 48, 49), Step R reads (x-npc-bow, x-npc-spell, p3, p6 v3), trains 51 one NPC path with the
  reconciler, 52 deaths by the engine, 53 bows and spells, 54 gaze and face plus the safeguards, 55 the
  dialogue claim (ADR-051, npc-talk), one gate, playtest 35 at the end; about seven working days.
- STATE 2026-10-26 14:53 PDT: the ladder's code is BUILT but train 53 (bows and spells, after Step R's
  reads): 47b d049eddc; 51 m3-npc-path 4be36aed (ADR-051 PROPOSED); 52 m3-npc-death 55a95002 (DamageCause
  55/63); 54 m3-npc-face 867c4210 (the gaze and the face, the stream counters); 55 m3-npc-talk 0d453dc1
  (ADR-052 PROPOSED, ActorClaim 56/64); voice v4 m3-npc-voice 8da16ef6; D22's brake m3-pass-margin 11bf32f3
  (memo D36). The lab: the stream's gate running (one login-transient red, reruns at its end), then Step R,
  the voice stage, 50b, 51, 52, 54, 55 in numidium's queue; each merges on a green gate (D32 B).
- STATE 2026-10-26 15:40 PDT: the STREAM MERGED (fork parity 66f04f2a, 22:14Z, 25 green; b-npc-handoff-cross
  an ADR-027 watch item); Step R DONE (P3 and P6 v3 green, H6 confirmed; the bow and spell reads' records in
  hand, their projectile reads re-timed in v2); 50b cut as m3-train-50b 951ea43d; the brake current
  045f5ca0; train 53's server half built, m3-npc-cast 30e72b86 (a hosted NPC's spell list recorded R2, its
  hits validated R1), the bow relay and the spell client next on it. The lab: the voice v4 stage (merge only
  on a green P7 v4), then 50b, 51, 52, 54, 55, 53.
- STATE 2026-10-26 22:50 PDT: 50b MERGED (parity 951ea43d; b-cell-host's lone red was D18-B meeting the
  scenario's old fixed wait, its premise fixed on main); the voice stays off (P7 v4 red on its premise, v5
  by path for 52's stage); Step R's bow and spell reads green; the host's dropped arrows and the outfit's
  double roll found and fixed; train 53 built (m3-npc-cast 78b877b1, the bow relay, the spell path); every
  ladder branch green on its current head; 51 (m3-npc-path 39cf3f4d) in T2 then its gate, merge-ready
  after it; D32 (merge authority), D36 (the brake) and D37 (DeathDropOverhaul's drop) wait on Eli.
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
- Lab aim (2026-10-18): the driver's look step does not pitch the
  first-person view (SetAngle on the player, readback pitch 0), so a probe
  cannot cast a short-range target-location spell at the ground: Lightning
  Strike and the runes fizzled in every class-pass run and b-target-location
  and x-explosion-gate wait on it (docs/research/apocalypse/target-location.md).
  Needed: a step that really pitches the aim (mouse input through the
  driver, or a Skyrim Platform native setting the player's look pitch), then
  the two scenarios run as drafted.

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
