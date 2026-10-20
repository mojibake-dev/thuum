# M2 closeout: the set whose green closes the milestone

Asked by Eli, 2026-10-20 ("wanna cook on a closeout set of tests? that if it
passes we call m2 done?"), beside the scope calls of the same day (PLAN, the
M2 close). The rule: M2 is DONE when every row below is green on ONE stage,
fork m2-train-30 under the merged essentials layer, and playtest twenty-eight
on that stage is reported with every T4 item ticked. Anything red is fixed
on the train or carried to M3 by name, in this file, before the word "done"
is used. Nothing here is graded by feel; a T4 item is a yes or a no.
"Under the merged layer" became "under the staged layer" on 2026-10-20
16:13, when the layer's own gate (20261020-220005) ended red at 25 of 62
(a-rotfern: c1's game died at the mid-game race pick in the VANILLA race
menu's slider rebuild on rotfern's tint list, up because RaceMenu's chargen
never initialises under the layer; the player's shared base record 0x7
overridden by a layer plugin, Supernatural Survival Tweaks' werebeast
patch, found on the way and ruled out as a rule; a-racemenu: the layer's
slot-0x09 head parts in c1's record after a menu close, the same vanilla
menu's rebuild; docs/research/layer-reds-2026-10-20.md): the layer merges
by its own gate after
its fixes, before M2 is called done, and twenty-eight runs on the fixed
layer staged.

## 1. The scenarios (the lab's T3, `just verb-merge m2-train-30`)

The deployed set, "all" in lab/gate.yaml, as it stands after the layer
merges (65 files in lab/scenarios: smoke, a-, b-, m0-, p-), with the four
scenarios now in `pending` leaving it as the train carries their fixes:

| scenario | proves | carried by |
| --- | --- | --- |
| b-spells-reconnect | a server-taught spell survives a reconnect with the game up (playtest 27's loss) | fork m2-train30-spells 096d2cd8 |
| b-figure-values (the hit steps) | a figure's bar never dents below the server's number on the hitter's screen | fork m2-train30-dent e6a8270a |
| b-formdesc-world | a world saved under one load order reads right under another, and after a restart (ADR-043 slice one, rule 6) | fork m2-formdesc-world 80cf1e35 |
| b-hailstone (new, from probe x-hailstone; approved by Eli 2026-10-20, main a6991674) | the server evaluates an effect's own conditions (GetActorValue with the race's abilities, HasMagicEffect) and resists a hostile effect as the engine does: 0.85 on both seats by different paths | fork m2-train30-resist on m2-train30-conditions |

Plus every scenario already green on parity 4720d0d3 and on the layer gate
of 2026-10-20 (the full sweep; b-spell on the served band). A red in a
scenario that was green before the train is the train's, not a carry.

Not in the set, by Eli's calls of 2026-10-20: p-shout-uf3 (the bystander's
screen, M3 with three seats), anything of the crosshair prompt (post-alpha),
ADR-043 slice two's scenarios (M3).

## 2. T2 and T0

`just test-proto m2-train-30` identical across every difftest session (the
common file carries the login clock and the login globals; a train that
widens the wire declares its divergence in the same commit). The fork's
ctest green at the train's head (the condition functions, the race
abilities, the resistance rule, formdesc's 401 cases, the dent's client
build). Both DONE for 1d88a6b7 on 2026-10-20: pipeline 2309 green in every
job, and T2 at 16:05 PDT identical across 32 sessions (numidium's run on
2309's artifact); they stand while the head stays 1d88a6b7 (ADR-042
check 4).

## 3. Playtest twenty-eight (T4, Eli, both seats, on the train's stage)

The seven items PLAN named for M2's one closing playtest, plus train-30's
rows. Each is ticked or written up as a finding:

1. Both teleports land without the slide; Ghostwalk's return look (b-teleport-look, b-ghostwalk-look hold them green already).
2. The shooter's quiver on the other screen (b-arrow-path's figure).
3. The load freeze fix: both seats load and relaunch without the hang (a-restart-persistence's relaunches).
4. Headshots, including the helmet case (b-headshot).
5. Per-player globals: an Apocalypse MCM setting kept across a restart (b-player-globals; twenty-seven ticked it).
6. The staggered cast (b-stagger; twenty-one's "still able to cast" measured since).
7. One spell per Apocalypse class that acts on players (the class pass's representatives; twenty-seven ticked Shadowbond, Lightning Strike, Electrosphere, Finger of Death's fail branch).
8. Train-30: a reconnect keeps the taught spells (test 1 on rotfern, twenty-seven's finding); your own sword leaves no dent on the figure's bar; Survival's box asks once and never after a relaunch (the 8df default); the MCM lists all eight menus; Hailstone's numbers on both seats; cloaks as vanilla capes with FSMP gone; rotfern's look and spells intact under the layer's order (ADR-043 slice one on your own world: b-formdesc-world's proof on the fixture, then your record).

## 4. Carried to M3, by name

- Spells that instantiate world objects: runes (the glyph's decal on the
  observer, spell-cast.md's train-30 row, drops with it), Raise Wall and
  kin. A two-seat game instantiates them from the relayed launch in both
  engines and they measure green (placement, the trip counted once); what
  M2 lacks is the server knowing the object (position, lifetime, owner),
  which a late joiner and a wall's collision parity need, and that is
  ADR-035's cell authority. Eli, 2026-10-20: "provided you're confident",
  with this reasoning.
- The shouts' bystander screen and p-shout-uf3; lag compensation (only if
  a playtest shows hits refused inside M1's slack).
- The invisible figure's crosshair prompt (post-alpha).
- ADR-043 slice two (the login refusal, the keep-on-miss fixes,
  playtest-restore's thuum side, the legacy effects map), before the
  friend deploys.
- Finger of Death's scripted kill: ADR-029's documented default (the
  caster's game runs the script; the victim lives) stands through M2 unless
  playtest twenty-eight calls it out; the allowlisted server kill is M3's
  first allowlist entry otherwise.
- The health snap-back fix STAYS in M2 (a train fix), as do melee reach's
  unmeasured cases (nightly or probe measurements).

## 5. HYPOTHESIS tags

A verb's HYPOTHESIS tag at the close is either lifted by the closeout runs
(the probe named beside it) or carried with one line in its doc naming the
M3 row that lifts it. The count per doc before the close is in `git grep -c
HYPOTHESIS docs/verbs`; the close's commit lists what was lifted and what
was carried. The ones the train's probes lift: the dent's calling convention
and hit reactions (b-figure-values), Hailstone's parameters (lifted by the
record bytes already), the resistance rule's dual second value
(x-hailstone), the headparts patch (lifted 2026-10-20), the layer's
Survival race (lifted by the 8df default's smoke).

## 6. Order

1. The layer gate (red at 25 of 62, 16:13) was STOPPED at 38 of 62 at
   16:47 on Eli's word to reach twenty-eight tonight: its head could not
   merge, and the runs it had left are measured by tonight's m2-close
   nightly over the final stage. Its four reds are read
   (docs/research/layer-reds-2026-10-20.md): the vanilla race menu under
   the layer (SkyUI's archive shadowing RaceMenu's menu SWF) behind
   a-rotfern's CTD and a-racemenu's hair swap, the gender-both head-part
   patch's own side effect, the player-base override found on the way and
   banned by rule (numidium's 2b check), b-duel's late first contact as a
   likely one-off, b-god under read. The fixed layer, apocrypha's
   c38a3b04 (the 0x7 drop-record, the head parts on their masters' gender
   bits, RaceMenu's menu laid loose; no slot moves), re-stages with
   a-rotfern, a-racemenu and b-duel as its deciders on the parity image
   alone; it merges by its own gate after twenty-eight.
2. m2-train-30 1d88a6b7 (assembled, CI 2309 green, T2 identical) staged
   once on the staged layer (numidium, verb-stage from the layer's
   worktree); the probes in order, b-formdesc-world first, green on the
   stage before the playtest world is restored onto it. If the layer's fix
   moves plugin slots, the train re-stages on the fixed layer.
3. Playtest twenty-eight's setup (lab/playtests/28.yaml: twenty-seven's
   world restored under the layer's order through slice one; seats and
   spells server-side), the checklist as docs/private/playtest-m2-28.md.
   Safety (numidium, 2026-10-20): the restore COPIES the saved world
   (/srv/lab/snapshots/playtest-m2-27-20261020T183558Z, raw slot ids) into
   the live world directory, so slice one's one-way migration rewrites the
   live copy only; the snapshot stays raw and restores onto a pre-slice
   server if a migration goes wrong, and the migrated live world is saved
   under its own label when twenty-eight ends.
4. Eli's report; findings to the train or to section 4.
5. The m2-close set (lab/gate.yaml names it, main 95aee33: "all" on the
   train's stage with the four train-30 scenarios out of pending and
   b-snapback staying pending for the train after twenty-eight) runs as
   the 03:30 nightly over the stage, each of the four leaving pending as
   its probe goes green on the stage (b-hailstone is approved and on main);
   or by name, `just sweep m2-close`, about 4 h. `just verb-merge
   m2-train-30` then cites
   that sweep with GATE_SET (ADR-042's own case, its first use; numidium
   merges adr042-gate-set fbca257 first), T2 beside it. Green: M2 DONE in
   PLAN and LOG, the carries moved to M3's chart.
