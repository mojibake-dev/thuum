# Route closeout: the legs whose ticks close the walk

Written 2026-11-12 at ADR-072's acceptance (Eli in auriel's session, "B, accept it, send all three messages"). ADR-072 makes one
two-player walk the project's closeout: the Riverwood Trader, Embershard, Bleak Falls' Temple and Sanctum, a server restart on
the way, and back to Lucan. This file is that walk's close set, laid out as docs/M3-CLOSE.md is for a milestone. The rule is
ADR-072's decisions 2 and 3: a leg is green in the lab (its scenarios, on canon), then ticked by Eli in a sitting, then DONE,
and nothing skips the tick. A sitting is the walk or a stretch of it on the current canon, eight items at most; a system that is
not merged on canon at a sitting's cut waits for the next one, and a sitting never waits for a build. A T4 row is a yes or a no,
not a feel. ADR-072's own table is the text Eli accepted and stays as it was; this file has that table with the acceptance's
corrections applied, and it is the copy that changes.

Eli kept this file as the copy of ADR-072's table that changes (2026-11-12, "Keep ROUTE-CLOSE.md"; the answered note at
ADR-072's end). Two readings taken here are not Eli's word yet (ADR-072's note lists them as open). A tick made before its leg's
lab green stands with its date and build, and DONE waits for both (ADR-067 decision 8 allows such a playtest). And a leg's DONE
also waits for the paper close of its verbs' HYPOTHESIS tags (CLAUDE.md's verb rule; M3-CLOSE.md section 2b), agent work beside
the sittings.

## 1. The legs and the lab's record

Verb states are `just status`'s words on main 72b881cb (68 verbs: 1 VERIFIED IN PLAY, 53 MECHANISM ONLY, 14 BROKEN); no verb
doc has changed since, to main e5e0291e. Fork canon is 6fe5fea0. A committed scenario's record is its run in the route run set
20261113-002613-route-canon on canon (ADR-072's first act, 2026-11-13; its conditions are under the table), each run named by its
six digits, 20261113-<digits>-<scenario>. A by-path probe's record is its newest run as of 2026-11-12 16:30Z, read from
https://thuum.gaussing.tv/results/ and its runsets/, with the fork build it ran on.

| Leg | What both screens must show | Verbs (state) | The lab's record |
|---|---|---|---|
| 1. The Trader: the quest | The Golden Claw starts in both journals with its objectives; Lucan's lines are heard and mouthed on both screens | quest-stage (BROKEN, 7/11), papyrus-events (BROKEN, 8/11), npc-talk (MECHANISM ONLY, 7/11) | In the route run set: b-quest-stage 020836, b-story-arrival 021032, b-quest-rumor 021323, b-papyrus-events 021630 green; b-npc-talk red 021752 at its stillness pair, before any claim ran, and green on its relaunched rerun 022104 (under the table). By path, x-acting-player v3 red 20261112-050846 (c3f9d175) on its E_SCRIPTSTATE_EPOCH claim alone, the limit declared at 52's merge (D-S4), its stage and reward claims held. No committed scenario starts the quest at Lucan (b-quest-stage sets a stage of MS10MiscObjPointer by console), and no run has read an objective in the other journal |
| 2. The Trader: the cart | a dropped prop pushed and kicked back rests at the same spot; Hailstone, Fireball and Unrelenting Force at the cabbage cart move the same cabbages to the same rest | prop-physics (BROKEN, 6/11) | b-prop-push pending (lab/gate.yaml), left out of the route run set: red 20261111-204534 at step 27 on 24f1cc6a, and it drops an ingot at lab-spawn, not at the cart. The cart's own b-prop-impulse v1.2 is a draft by path that has not run, its first run to be in rung 3's stage (D-PH18). Two reads at the cart by path: x-prop-blast v3 20261111-223256 (24f1cc6a) green as a read, two cabbages' bodies 940 and 263 units off their records on one seat; x-prop-cone v1 20261112-080520 (c3f9d175 under the staged cap) green as a read, rung 3's premise read of the shout. ADR-071 rung 1's stage on d9da7da3: x-prop-edge 20261112-142009 green, x-prop-arbitration 140518 red. Rungs 1 and 2 stage and merge as one unit on 22c2466d by Eli's word of 2026-11-12 ("prove rungs 1 and 2 together", ADR-071's note of that date); rung 3 unstaged |
| Riverwood: the residents (not in ADR-072's table) | a resident through a door on a hand-off, Sven and Hilde's scene once on both screens, a door locked at night | npc-handoff (BROKEN, 8/11), npc-puppet (BROKEN, 10/11), locks (BROKEN, 6/11): each verb's BROKEN line is one of these, from playtest 41 | In the route run set: b-npc-handoff-door 022454, -door-hosts 023046, -night 024336, -restart 024753, b-npc-puppet 025137 green. c-riverwood pending (lab/gate.yaml), left out of the run set: red 20261101-085158 on its hand-off and restart claims |
| 3. Embershard | the roster on a hand-off, arrows that hit, reach and cone, the guest's loot | cell-host, npc-handoff, npc-fate, npc-puppet (BROKEN); npc-stream, melee-reach, hit-cone, marksman (MECHANISM ONLY) | In the route run set: c-dungeon-enemies 002613, b-npc-body-release 003230, b-npc-loot 003526, b-cell-host 003750, b-npc-stream-equipment 004355, b-arrow-path 004757, a-melee-cone 005020, a-melee-reach 005203, b-npc-handoff-cross 005337 (the first run of its widened window, main d09bc3a4), b-npc-death (watch) 005915 green. By path, x-handoff-cross-timing cold red 20261111-174045 and warm green 174935 (24f1cc6a), read as run-to-run timing before the window was widened. None of these plays in Embershard: they host the Temple's first hall, Riverwood's cells and a forest cell |
| 4. The Temple: bodies and Arvel | found bodies, bodies where they died, the ambush for a guest, the spider's drop, Arvel freed by the web's cut and his scene run, the claw on his body | trigger-entry (BROKEN, 0/11), traps (BROKEN, 9/13), quest-stage (BROKEN, 7/11), papyrus-events (BROKEN, 8/11), npc-fate (BROKEN, 7/11), containers (BROKEN, 6/11) | In the route run set: b-cobweb-view 010428, b-body-loot 011143, b-container-exclusive 011354, b-container-rest 011730 green. By path: x-trigger-owner v2.5 20261110-113348 and x-alias-return 112825 green (44ffafc2); x-golden-claw-alias v1 20261107-222959 green (1acb834f, 150 commits behind canon), the one claw in Arvel's record and then on its taker; x-trigger-preload v2.3 20261111-132736 red (24f1cc6a), its fix placed in train 53. No committed scenario claims the ambush, the spider, Arvel's web or the claw |
| 5. The Temple: reanimation | a raised body stands, walks and fights on both screens with its look | npc-fate (BROKEN, 7/11), magic-effects (MECHANISM ONLY, 9/10) | m4-reanimate-claim-2 staged 0 of 2 at 0065ae6e: x-reanimate-claim 20261112-125536 and x-reanimate-look 130030 red, one seat's game lost in each; its fix 581bc461 is pushed and unstaged. On canon 6fe5fea0 the watcher's game was lost at the raised body's end in two of two runs (x-reanimate-look-u0 085636, 102238). x-reanimate-return v1.5 152001 green by path on rung 1's stage build |
| 6. The barrow: traps, pillars, locks | every trap, plate, lever and pillar the same on both screens | traps (BROKEN, 9/13), trigger-entry (BROKEN, 0/11), furniture (BROKEN, 0/11), locks (BROKEN, 6/11), papyrus-events (BROKEN, 8/11) | In the route run set: b-bleak-traps 012240, b-lever-relay 013319, b-object-anim 013654, b-pillar-reentry 014422, b-puzzle-relay 015043, b-trap-look 015435, b-locks 020251 green. All play in the Temple (b-trap-look in Embershard too); the Sanctum's blades have no committed scenario |
| 7. The Sanctum | the rings and the keyhole for the claw's holder; the word wall teaches | traps (BROKEN, 9/13) and quest-stage (BROKEN, 7/11) for the door; word-wall (MECHANISM ONLY, 6/11) | b-word-wall green 025536 in the route run set. The claw door by path alone: x-golden-claw-alias v1 20261107-222959 green (1acb834f, 150 commits behind canon), the keyhole pressed by the claw's holder, the door's open played on the guest's screen and the quest's stage 50 done in the guest's game. No committed scenario reads the rings or the keyhole |
| 8. The restart | journals, script state, references, traps and props as they were (M4's exit asks it mid-dungeon, PLAN.md:1442; playtest 51 restarts before the hand-in) | each leg's restart half; cell-host (BROKEN, 11/12) | In the route run set: b-quest-stage-restart 025905, b-script-state-restart 030230, b-ref-state-restart 030947, b-trap-record-restart 031700, a-restart-persistence (always) 032210 green; props wait on b-prop-push |
| 9. Back to Lucan | the quest completes in both journals; the reward lands once and stays | quest-stage (BROKEN, 7/11), papyrus-events (BROKEN, 8/11) | b-leveled-reward green 032358 in the route run set, its first run under its id; promoted unchanged at main 3e2ad0cd from x-leveled-reward v1, green 20261112-044101 on 52's stage (c3f9d175, one seat). Train 52 closed the take-back that playtest 51 had declared |
| Along the way | skills rise by use, a level and a perk taken; Raise Wall rises where it is aimed | leveling (BROKEN, 5/11), perks (VERIFIED IN PLAY, 3/11), spell-placed-object (BROKEN, 7/11) | In the route run set: p-level-up 032823, b-perk-pick 033614, b-perk-damage 034105, b-skill-book 034350, b-spell-placed-wall 034726 green. The level-up's attribute pick is not built (docs/verbs/leveling.md:33, :329) |
| Later on the route | a dragged body, bodies at the same spot, statics | ADR-071 rungs 4 to 7, not built | none committed; x-corpse-grab-v2 20261112-002429 green by path (24f1cc6a), rung 0's read of the engine's grab |

Legs 4 to 6 overlap in the Temple and are numbered by subject, not in the order its rooms are walked.

The route run set, ADR-072's first act, ran the walk's 43 committed scenarios on canon from 00:26Z to 03:53Z on 2026-11-13
(numidium): server skymp-server:m4-shout-once-6fe5fea0; both seats on canon's clean-m1-next with gitlab 20605 at ff467dab and
skymp5-client.js at 6fe5fea0, under the staged cap; lab-api e5e0291e; the server's tree deployed from the cap's d35dface (main
e5e0291e). Legs 3, 4 and 6 ran first, since the 22 commits between the last sweep's build (20261111-041437-pair-r5b-tidy, fork
f6ca339d) and canon changed hostService.ts, PuppetApi.cpp and ScriptNatives.cpp, on which those legs depend. Its verdict is green,
43 of 43 in 44 runs, under ADR-030's reruns. The two pending in lab/gate.yaml, b-prop-push and c-riverwood, were left out, as the
full sweep leaves them.

The one red was b-npc-talk's first run, 021752, at its stillness pair, its premise before any claim runs: 24 s after the host's
npc-hold (Actor.SetDontMove) on Sven, his record must move less than 5 units in x and in y over the next 3 s
(lab/scenarios/b-npc-talk.yaml:69-75). It moved 100.78 units (83.0 in x, 57.1 in y), and the rerun 022104 was green. The last
sweep's first run, 20261111-083435, was red at the same pair by 100.78 units (87.9, 49.4), and its rerun 083654 green. The
scenario's own notes give about 100 units for the leg the hold lets him finish (:56-58) and set the 24 s settle for legs of 3 to
18 s (:63-67, :70). Why he moves after the settle on a first run, by the same distance twice, is unread.

A green here is its scenario's claims and not its leg's show: `d-bleak-falls` and `q-golden-claw`, the two exits that would play
the walk itself, are not written.

By the definition of done's clauses (PLAN.md:36-51), auriel's reading: 1 is every row above; 2 is the residents' row, legs 3 to 5
and leg 8; 3 is legs 2, 4, 6 and 8; 4 is legs 1, 8 and 9; 5 to 8 are ADR-072 decision 6's. The walk does not close clause 1 in
full (leveling is BROKEN, and the benches are off the route) or M7; those are still work after the walk closes. In no row and on
no list: mod-lock (MECHANISM ONLY, 5/11) and weather (MECHANISM ONLY, 7/11).

## 2. The T4 rows, by leg

A leg is ticked when every row named for it is ticked in a playtest report of Eli's. M3's ten rows and their ticks stay in
docs/M3-CLOSE.md section 2. Playtest 51's checklist (docs/private/playtest-51.md) asks them under its own names: M3-1 is row 1's
loot half, M3-2 row 4 with row 1's reanimate half, M3-3 row 2, M3-4 row 3, M3-5 row 5, M3-6 row 8, M3-7 row 9, M3-8 row 10; row
6 (quests) is 51's items 3 and 5, and row 7 (props) is in no 51 item.

| Leg | Its rows | State |
|---|---|---|
| 1. The Trader: the quest | playtest 51 item 3; M3-CLOSE row 6 (b) and (c) through it; row 10 (51's M3-8) | unticked |
| 2. The Trader: the cart | M3-CLOSE row 7 (props); ADR-071's playtest items (docs/research/physics-leg-2026-11-11.md:140-168) | unticked; not in 51 |
| Riverwood: the residents | none written yet | no row |
| 3. Embershard | playtest 51 item 8; M3-CLOSE rows 3, 5 and 9 (51's M3-4, M3-5, M3-7) | unticked |
| 4. The Temple: bodies and Arvel | playtest 51 item 4; M3-CLOSE row 1's loot half and row 2 (51's M3-1, M3-3) | unticked |
| 5. The Temple: reanimation | M3-CLOSE row 4 and row 1's reanimate half (51's M3-2) | unticked; out of 51, at the first sitting cut after its merge on canon |
| 6. The barrow: traps, pillars, locks | none written yet | no row |
| 7. The Sanctum | playtest 51 item 4's end (the rings, the keyhole, the word wall) | unticked |
| 8. The restart | playtest 51 item 5's restart; M3-CLOSE row 6 through it | unticked |
| 9. Back to Lucan | playtest 51 item 5's hand-in | unticked |
| Along the way | M3-CLOSE row 8 (51's M3-6, Raise Wall); a leveling row, none written yet | Raise Wall unticked; perks ticked in playtest 41 (2026-11-02, docs/verbs/perks.md:275-276) |
| Later on the route | ADR-071's P3 and P4 items | unticked |

M3-CLOSE row 6 (a), A Lovely Letter starting for both on the walk into Riverwood, is struck (Eli, 2026-11-12, "Strike row
6(a)"): under ADR-068's D-Q5 A a Story Manager quest starts per seat, and no checklist asked it.

## 3. Report

Each sitting that ticks rows is recorded here by date with the build it ran on, as M3-CLOSE.md section 3 does for M3. A run set
that changes a leg's record is recorded the same way, and section 1's cell is then rewritten to it.

- 2026-11-12: no sitting has ticked a row. Playtest 51 is cut on fork canon 6fe5fea0 by Eli's word of this day (ADR-071's notes),
  to be played under the staged 60 fps cap and in one sitting of fifteen rows (Eli's answers of about 17:05Z). It asks the rows
  of legs 1, 3, 4, 7, 8 and 9 and the Raise Wall row. Legs 2 and 5 are not in it, and leg 6 and the residents have no row yet. M3
  stays BUILT after it whatever is ticked: M3-CLOSE's row 4, row 1's reanimate half and row 7 are still owed.
- 2026-11-13: ADR-072's first act, the route run set 20261113-002613-route-canon on fork canon 6fe5fea0 under the staged cap
  (numidium, 00:26Z to 03:53Z): 43 of 43 committed scenarios green in 44 runs, b-npc-talk on its rerun after a first-run red at
  its stillness pair, as in the last sweep; b-prop-push and c-riverwood left out as pending. Section 1's record is rewritten to
  it. No row is ticked.

## 4. Off the route, by name

ADR-072 decision 5 puts these off the walk, each a declared limit or after-close work once Eli says which: the crafting benches
(M5's exit `p-craft-restart`, PLAN.md:1603), pickpocketing (Eli's PvP pickpocketing of 2026-11-12 is NEXT when M5 opens,
PLAN.md:1575, which decision 5 makes after the walk closes unless Eli says sooner), vampirism past playtest 51's item 1, `q-main`
(PLAN.md:1624), M7 (PLAN.md:1647: dragons, with Eli's three calls at :1651, lycanthropy, mounted combat, the custom record push,
the mod matrix) and the stretch mods. From playtest 51: items 1 (Ariadne's turn and cure), 2 (Gorm's letter) and 7 (the Beast
Form) are off the walk; item 6 (the Aventus rumor at Riverwood's inn) is a read beside leg 1.

Not placed by ADR-072, Eli's to say: the definition of done's clause 6 (PLAN.md:46-47, mods through the load order). The walk
plays under the mod layer, and the clause's acceptance cases are the stretch mods (PLAN.md:1665).
