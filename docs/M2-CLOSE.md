# M2 closeout: the set whose green closes the milestone

Asked by Eli, 2026-10-20 ("wanna cook on a closeout set of tests? that if it
passes we call m2 done?"), beside the scope calls of the same day (PLAN, the
M2 close). The rule, as moved by Eli after twenty-eight's report
(2026-10-20, before 18:55: "lets aim to close this out on test 29"): M2 is
DONE when every row below is green on ONE stage, fork m2-train-31 (Train-31,
twenty-eight's findings, on the base the morning's merges make: m2-train-30
and the essentials layer under ADR-042a) under the essentials layer as
merged, or as staged with the same content (Eli, 2026-10-20 20:55: "tonight.
same content counts": twenty-nine runs the night of the 20th on a temporary
stage of m2-train-31 over the staged layer plus main's two settings lines,
the morning's merges making the same content on main; the train-30 stage is
re-laid before the 03:30 sweep so the merges keep their citation), and
playtest twenty-nine on that stage is reported with every T4 item ticked. Anything red is fixed on the train or carried to M3 by name, in this
file, before the word "done" is used. Nothing here is graded by feel; a T4
item is a yes or a no. (As first written the stage was m2-train-30 and the
playtest twenty-eight; section 3's Report says why it moved.)
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
build). Both were DONE for 1d88a6b7 on 2026-10-20 (pipeline 2309 green in
every job; T2 at 16:05 PDT identical across 32 sessions); the head then
moved once, to 44372078 at 16:51, for clang-format alone (the fork's
Formatting check, three files, no code change), so its pipeline and a T2
at 44372078 are the ones the merge cites (ADR-042 check 4); pipeline 2349
green in every job at 17:13, the Windows client included, and T2 at
44372078 identical across 32 sessions at 17:19 (the same difftest binary
and sessions as 1d88a6b7's, since the format commit left skymp-wire alone).
Both DONE.

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

Report (Eli, 18:18 PDT, docs/private/playtest-m2-28.md; the log reads by
numidium after it): items 1 to 3 and 5 to 7 ticked; item 4 not tested by
hand (Eli: the four bow shots in the log were a check of the marksman bug,
not at the player; b-headshot green on the stage stands as its proof);
item 8 ticked but for the heals (both seats held Azure Reconstruction,
a minion heal by its record, so the caster's own engine refused it on a
player and the server saw no claim, right by the record; Survival on both
seats left no passive regen) and the spells' aim (landing in different
places on the two screens; the arrows held, Eli: "marksman check was
great. just copy that for the spells"). Eli's calls at the report: heals
apply by the record (Healing Hands on another player heals them; Azure
Reconstruction does not heal a player who is not the caster's summon), and
Finger of Death's kill is the server's, in both games. Both are Train-31 rows (PLAN): M2's rows, by his word, built after
the close's merges and before M3's first verb, as the snap-back fix is;
the headshot row goes to the next checklist. The findings' detail is in
docs/research/layer-reds-2026-10-20.md. M2 is called DONE at step 5's
green with Train-31 named here as its trailing train.

## 3b. Playtest twenty-nine (T4, Eli, both seats, on Train-31's stage)

Twenty-eight's unticked or re-tested items, each a yes or a no; the
checklist (docs/private/playtest-m2-29.md) carries them with the Apocalypse
class list Eli asked for:

1. Healing Hands from test 1 heals test 2 on both screens and starts no
   fight; the heal stays (no snap-back in the seconds after).
2. Finger of Death from test 1 kills test 2 in BOTH games (the ash pile on
   test 1's screen, test 2 dead and respawning on his own); the fail branch
   (test 2 at full Health, test 1 low) leaves test 2 alive and test 1 at 1
   Health on both screens.
3. A spell projectile (Firebolt, Electrosphere) lands in the same place on
   both screens, as the arrows did in twenty-eight.
4. "restart test 2" (the game relaunched with the server up), then a drink
   or a hit: test 2's bar moves on both screens afterwards (the relaunched
   game's reports taken).
5. Headshots, including the helmet case, by hand this time.
6. Teleportation on both seats after a server restart (the cleaned world).
7. Survival's hunger, cold and fatigue where the server keeps them (the
   row's shape decides what is visible).
8. Everything twenty-eight ticked, spot-checked: rotfern, the reconnect's
   spells, no dent, Survival's box, Hailstone, capes, the MCM list (write
   the entries), teleports, quiver, no freeze, globals, the staggered cast.

Report (Eli, 2026-10-20 22:33 PDT, docs/private/playtest-m2-29.md; the
night's stage of m2-train-31, 3b579f41 then 9ad635cd at his word after the
stage's probes found the caster dying with its target and the bolt's origin
offset, both fixed and probed green before he resumed): items 1 to 3 and 5
to 8 ticked; item 4 marked unsure ("unsure what this is testing"), proven by
the lab (b-relaunch-reports 20261021-041549) and the live log of test 2's
22:12 relaunch (its reports taken at once). Corrected at 22:42: section 2's
Survival needs row is a NO ("those reset when test 2 came back"), so the
need-globals row of Train-31 is not met and reopens for the next train (the
log read says which side lost the values). Notes that are rows, none a
fail by the checklist's own rule: the victim's game plays a plain death
where the caster's shows the ash pile; Flames' stream lands in different
places on the two screens while the bolts now match; Prepare for Adventure's
items vanished and did not return (the one class spell marked unsure as a
real misbehaviour); Sealed Resolve asks for a log read; Thoughtsteal's
granted spell worked where the text said the server refuses it. The T4 half
of the rule is met with those carried by name (PLAN, the rows after
twenty-nine); the scenario half is step 6's sweep and merge.

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
- Finger of Death's scripted kill: NOT carried. Twenty-eight called it out
  and Eli ruled at the report (2026-10-20): "if it kills them by effect of
  the spell, yes kill them. why on earth would i want them dead in only one
  game". The server's kill in both games is Train-31's, M2.
- Heals: NOT carried. By the record, Train-31 (Healing Hands on another
  player heals them; Azure Reconstruction's conditions refuse a player who
  is not the caster's summon; Eli, 2026-10-20).
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
   alone; it merges by its own gate after twenty-eight. Done 17:15: the
   three deciders green (a-rotfern 20261021-000439, a-racemenu 000831,
   b-duel 001214), RaceMenu's chargen initialising on both seats.
2. m2-train-30 44372078 (assembled as 1d88a6b7, then formatted; CI and T2
   at the head) staged
   once on the staged layer (numidium, verb-stage from the layer's
   worktree); the probes in order, b-formdesc-world first, green on the
   stage before the playtest world is restored onto it. If the layer's fix
   moves plugin slots, the train re-stages on the fixed layer. Staged
   17:16 to 17:25; the eight probes (docs/research/layer-reds-2026-10-20.md,
   the train stage's probes): four green, three read red and disposed of
   without a server change: b-formdesc-world's migration proved correct on
   disk and on the wire (its red was c2's game crashing in RaceMenu's
   overlay code at c1's login and a head-parts assert the ADR-026
   derivation owes, carried), b-figure-values' gate holds (the assert
   counted the figure's regeneration jitter; a threshold argument lands),
   b-hailstone's row 2 waits on the Shatter effect's record. The migration
   condition is met by the read, not the scenario's green; the crash
   reruns once before the playtest world is restored.
3. Playtest twenty-eight's setup (lab/playtests/28.yaml: twenty-seven's
   world restored under the layer's order through slice one; seats and
   spells server-side), the checklist as docs/private/playtest-m2-28.md.
   Safety (numidium, 2026-10-20): the restore COPIES the saved world
   (/srv/lab/snapshots/playtest-m2-27-20261020T183558Z, raw slot ids) into
   the live world directory, so slice one's one-way migration rewrites the
   live copy only; the snapshot stays raw and restores onto a pre-slice
   server if a migration goes wrong, and the migrated live world is saved
   under its own label when twenty-eight ends.
4. Eli's report, 18:18 (section 3's Report paragraph); findings to
   Train-31 or to section 4. Done.
5. The m2-close set (lab/gate.yaml names it, main 95aee33: "all" on the
   train's stage with the four train-30 scenarios out of pending and
   b-snapback staying pending for the train after twenty-eight) runs as
   the 03:30 nightly over the stage, each of the four leaving pending as
   its probe goes green on the stage (b-hailstone is approved and on main);
   or by name, `just sweep m2-close`, about 4 h. Then the merge order (ADR-042a, ACCEPTED
   2026-10-20 18:47 on Eli's word; numidium's read of the trap:
   both clones' snapshot is the stage, layer and all, and main has no layer
   yet): `just verb-merge m2-train-30` with GATE_SET on that sweep and
   PROMOTE=0, then the layer to main citing the same sweep under the same
   five checks, then both promotes; T2 at the head cited beside. The
   fallback (the train's merge with PROMOTE=0, then layer-merge's own full
   sweep on a re-laid stage) is not needed. Green: the base for Train-31.
6. Train-31 (PLAN's rows: Healing Hands' two defects with the snap-back
   fix, Finger of Death's server kill, the spells' aim parity in the
   arrow-path shape, the relaunched game's reports, Survival's need
   globals, slice two's legacy-world repair) built on that base as fork
   m2-train-31, CI and T2 green at its head, staged under the merged
   layer, its probes green; then playtest twenty-nine on that stage with
   section 3b's checklist; its report, then the gate (ADR-042: the nightly
   over the stage or `just sweep m2-close`), `just verb-merge
   m2-train-31`, and M2 DONE in PLAN and LOG, the carries moved to M3's
   chart. Where it stands at 2026-10-20 22:40: twenty-nine REPORTED (section
   3b, the T4 half met); the train's head 9ad635cd is CI-green and T2-green
   (at 3b579f41; 9ad635cd left skymp-wire alone), its five probes green on
   the night's stage; the morning's order (the train-30 and layer merges
   under ADR-042a after the 03:30 sweep of the re-laid train-30 stage, then
   m2-train-31 staged on main's merged layer and swept, then its merge) is
   what remains before the word.
   2026-10-21 06:37: the 03:30 sweep ended red (five of 65, four held on a
   rerun: a-melee-reach, a sword claim never reaching the server on
   train-30 over the layer, a regression under read; b-cloak-fight, its
   0.97 bound calibrated on Firebolt's perk riders the server now rightly
   refuses, to re-derive; b-push, the layer's known refused second
   Ragdoll, Eli's word; b-spell, the layer's Firebolt 20 against the
   vanilla constant, fixed on main aa2dd21), so neither merge can cite it
   (gate-cite check 1). The path chosen (numidium's sequence, the train
   folded): main merged into the stage branch, the layer re-staged at its
   new head with its three deciders for a fresh LAYER_RUN, the fixed
   m2-train-31 head staged on it, one full sweep, then `just verb-merge
   m2-train-31` (which carries train-30) and the layer's merge citing that
   sweep under 42a, both promotes. One stage, one sweep, as the rule says.
   06:58: the four reds read (a read agent over the runs and the code):
   none is a fork fix. a-melee-reach's swing was sent and the full server
   log has no OnHit line at all, the dent gate leaves TESHitEvent alone and
   seven sword scenarios landed on the same image; the one variable is c2
   at 179.4 units against the sword's edge measured at 185, the red the
   verb doc's watch item foresaw: c2 at 170 (main 8550593, scenario alone).
   b-cloak-fight's 0.97 came from a 3-tick run against a 2-to-4 tick
   measurement (a claimed Blood Boil tick is 12.5 of 1000; both reds
   claimed two): 0.98 (main 673db44, scenario alone). b-spell: aa2dd21.
   b-push: the known refused second Ragdoll, Eli's word; its probe
   x-push-knock-frida has never run. So step 3 stages m2-train-31 at
   9ad635cd as it stands.
   2026-10-21 11:13: M2 DONE. The sweep 20261021-144529-m2-close read 69
   of 70 green, b-push red twice (the known refused second Ragdoll in the
   victim's own game under the layer); Eli at 11:03 and again in
   numidium's session at 11:07: "carry b-push to m3", so ADR-042b
   (ACCEPTED, main ffd5347) moved it from watch to pending at the merge and
   the set stands. verb-merge m2-train-31 at 11:10 (fork parity 9ad635cd,
   T2's log cited), layer-merge stage-layer-train31 at 11:12 (thuum main
   b0252470, all eight checks), both clones promoted clean-m1-next to
   clean-m1, deploy-srv from main, lab-api 2294723b (cell-host's lab
   pieces, the perks mechanism, the netem step). The carries are section
   4's plus b-push and the rows after twenty-nine (PLAN's M2 section).
   M3's first look is playtest thirty (PLAN's M3 section).
