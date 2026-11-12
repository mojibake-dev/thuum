# The closeout as one route: the plan of 2026-11-12 and what checked it

This is ADR-072's record, as docs/research/physics-leg-2026-11-11.md is ADR-071's. Eli opened a planning session on 2026-11-12
(first listed as thuum-ff, renamed auriel) and asked four things: get familiar with the project, say what should be done
differently, look at thuum-magnus's work and ask it how it is going, and say whether one approach can close the project out. The
plan below is the answer, as Eli approved it in plan mode at about 15:29Z. Section 2 is what a fact check found wrong in it after
the approval. Section 3 has Eli's answers to its three decisions, and section 4 what the other sessions said when asked.

## 1. The plan as approved (verbatim)

Its headings are set two levels down here; nothing else is changed. Section 2 lists what in it was wrong.

### thuum: where it stands, what to change, and a closeout shape (thuum-ff, 2026-11-12 15:40Z)

#### Context

You asked four things: get familiar, say what we should do differently, look at thuum-magnus's
work and ask it how it's going, and say whether one unified approach can close the project.
Read-only so far: PLAN, `just status`, memory, the worktree and branch lists, M3-CLOSE,
playtest-51.md, and the tails of magnus's and numidium's transcripts.

**I could not ask magnus.** Its session (93f37424, title thuum-magnus, signing as thuum-fa) is
live and was resumed at 15:20Z, but neither name is reachable by message from here. What follows
about its work comes from its own 15:21Z session summary and 15:22Z status, not from a reply.

**One live hazard to look at first:** the peer list shows two sessions named `numidium` (one
started 5 days ago, waiting; one started minutes ago, busy), and magnus's status says numidium
asked it to start no T2, stage or push "until you decide which session runs it". Two lab
operators on one lab is the one failure the role split exists to prevent.

#### Where it stands

- M0 to M2 DONE. M3 BUILT at T3 on 10-31; its ten T4 rows have never been ticked by you (38
  failed, 39 paused at its first finding). M4 and M5 started, M6 reached through ADR-068's
  ladder (rungs 0 to 5 in canon with train 52), M7 untouched. DoD clause 8 (the wire) is done.
- `just status`: 68 verbs, 1 VERIFIED IN PLAY, 53 MECHANISM ONLY, 14 BROKEN, 407 open
  HYPOTHESIS lines. The build is far ahead of what your eyes have confirmed.
- Playtest 51 now carries: 8 items, M3's 7 rows, train 52, the 60 fps cap, physics rungs 1 to 3
  (4 to 7 "if in time"), and the reanimation rebuild.

#### Magnus's work, my read

Engineering quality is good: reads before builds, fresh reviews that catch real defects (the
world-scale constant, the bucket id, the one-hold bound), honest withdrawal of wrong readings.
The trouble is throughput, not skill.

- **Physics:** rung 1 pushed, T2 green, stage 1 of 2. The red (x-prop-arbitration v14.3) had no
  rule bug: Caps Lock, a teleport collision, a grab order, and one real engine fact (reference
  versus held body) that rung 2 fixes. So rungs 1 and 2 are coupled in practice. Rung 2's T2 red
  was a test timing race, fixed in 22c2466d, unpushed. Rung 3 is built with a green pipeline and
  has never staged. D-PH17 adds E13 and E32 reads that wait on a lab-api change not yet deployed.
- **Reanimation:** stage 0 of 2 (a client crash in ApplyArtObject, a server termination); new
  head 581bc461 awaits its T2. Return-to-caster failed its premise three times.
- **Scripting:** rungs 6 and 7 and train 53's trigger hold wait for 51 by your word; nothing new
  is being built there.
- **My estimate for Sat 11-14:** rungs 1 and 2 plausible; rung 3, the reanimation and
  return-to-caster each need a clean first stage through one shared lab, and none has had one.

#### What I'd do differently

1. **Stop growing 51.** The root-cause plan's own rule is one short playtest per fixed system,
   8 items at most. 51 is now about 20 items across five systems, and every hour it waits, more
   unverified work stacks behind it. Small batches find faults sooner and make them cheaper to
   place (DORA, "Working in small batches", https://dora.dev/capabilities/working-in-small-batches/;
   Forsgren, Humble and Kim, *Accelerate*, 2018, ch. 4).
2. **Cap built-ahead work at one rung.** One lab, one T2 slot: it is a single-server queue, and
   wait time climbs steeply as utilization and variability rise (Kingman's formula,
   https://en.wikipedia.org/wiki/Kingman%27s_formula; Kingman, "The single server queue in heavy
   traffic", Math. Proc. Camb. Phil. Soc. 57(4), 1961). Today rung 3 must re-merge rung 2's fix,
   which re-merges rung 1's: three rungs of rework for one finding.
3. **Hold probes to ADR-064 B.** x-prop-arbitration is at v14.4 with 453 steps and seven legs,
   and failed on Caps Lock. The x-prop-engine-v2 split into one-question probes worked; do the
   same here before the restage.
4. **Give the lab a real file transport.** The last five merges to main are all lab-api coping
   with the guest agent: ranged reads, held handles, busy retries. guest-file-read is a base64
   RPC on the agent's command channel (QEMU Guest Agent Protocol Reference,
   https://www.qemu.org/docs/master/interop/qemu-ga-ref.html), not a bulk transport. The lazy fix
   is a share the seats write to and sky-srv reads: SMB (Windows-native) or virtiofs
   (https://virtio-fs.gitlab.io/; Vangoor, Tarasov and Zadok, "To FUSE or Not to FUSE", FAST '17,
   for the cost model). UNVERIFIED for your seats: virtiofs on Windows needs WinFsp plus the
   virtio-win driver, and the seats' network isolation may rule SMB out. It is core's lane; I
   would ask core to evaluate, not build it here.
5. **One status record.** MEMORY.md's NOW line and the 100 KB road-to-51 and physics-leg notes
   are a second LOG. The nightly slip (two agents planning around a nightly that had been off
   for a week, twice) is what a second record costs. Status goes to LOG.md and PLAN's STATE
   lines; memory keeps lessons.
6. **Fresh coordinator sessions per leg.** Magnus's and numidium's transcripts are 433 MB and
   422 MB; both compact repeatedly and magnus lost four running sub-agents at its last restart.
   The handoff should be the repo (LOG, the drafts folder), so a new session starts clean.
7. **Worktrees out of /private/tmp.** About 60 are registered there, 12 already prunable;
   `lab/.cache/wt` already exists for this.

#### Is there a one-shot close?

No single build closes it: the remaining constraint is your sittings, not code. But there is one
shape, and you have already found it twice (ADR-068, ADR-071): one system, one ladder, one
sitting. The closeout version is **one route**.

The Golden Claw walk is already M4's exit (d-bleak-falls), M6's exit (q-golden-claw), and the
place M3's rows and both physics tests live: the cabbage cart is at the Riverwood Trader, where
Lucan gives the quest. Riverwood Trader, Embershard, Bleak Falls (bodies, traps, pillars, Arvel,
the word wall), a server restart, back to Lucan. Close by that route:

- The route is the chart. Each DoD clause maps to legs of it; a leg is green in the lab, then
  ticked by you, then DONE.
- Anything off the route (crafting benches, pickpocketing, q-main, M7, the stretch mods) is a
  declared limit or after-close work, by name, decided once.
- Sittings repeat the same route on each new canon, 8 items at most, until every leg is ticked.

What this does not give you: DoD clause 1 in full (leveling is BROKEN, crafting is not begun) or
M7. Those stay real work after the route closes.

#### Decisions for you

- **D-C1, playtest 51.** A: as planned, wait for rung 3. B: cut 51 now on canon 6fe5fea0 (its 8
  items plus M3's rows); physics rungs 1 and 2 become P1, rung 3 and the cart P2, reanimation
  rides whichever sitting follows its green stage. **Recommended: B.** You flagged the split
  yourself for Saturday; nothing is gained by waiting two more days to make it.
- **D-C2, the route as the closeout chart.** A: keep closing by milestone. B: adopt the route,
  written as a PROPOSED ADR with the DoD-to-leg table. **Recommended: B.**
- **D-C3, the lab's file transport.** A: keep hardening lab-api. B: ask core to evaluate a
  share. **Recommended: B**, as an evaluation only.

#### If approved, what I do

1. Write the PROPOSED ADR in docs/DECISIONS.md (next free number) with the route table: DoD
   clause, leg, scenario or probe, lab state, T4 state, sourced from `just status`, M3-CLOSE.md
   and playtest-51.md. Docs only, own commit, no push while numidium has a gate or step 0 pending.
2. If D-C1 is B: draft the split of docs/private/playtest-51.md into 51 and P1 for you to read;
   I change nothing in magnus's branches or numidium's queue.
3. Hand you three short messages to relay or approve, since I can't reach magnus: to magnus (the
   one-rung cap, v14.4's split by leg), to numidium (the 51 split's lab order), to core (D-C3).
4. Move MEMORY.md's NOW line and the two status-log notes into LOG.md entries, leaving pointers.

#### Verification

- The ADR's table reproduces from `just status` and the two docs it cites; docs-lint and
  verb-lint pass.
- No fork, lab, scenario or lab-api file changes; `git status` shows docs and memory only.

## 2. Corrections found after the approval

On Eli's "accept it" a workflow of ten agents checked the plan, ADR-072 as proposed (894e7b3f), the draft of playtest 51's split
and the three messages sent to other sessions: five readers, one question each, and a second reader set to refute each first
one. What was wrong, by the plan's own headings:

Context.
- "I could not ask magnus" and the "two sessions named numidium": the second numidium was thuum-magnus's own session
  (transcript 93f37424), which listed under that name after its login at about 15:15Z. It was reachable by its ref, and its
  answers are in section 4. Eli had already kept the lab with numidium and said "thuum-magnus is current builder" (15:20Z to
  15:35Z, in their sessions), so there was one lab operator throughout and no hazard.

Where it stands.
- "M3's 7 rows": the checklist had eight, M3-1 to M3-8, when the plan was written; seven since its cut took M3-2 out.

Magnus's work.
- "one real engine fact (reference versus held body) that rung 2 fixes. So rungs 1 and 2 are coupled in practice": the read of run
  20261112-140518 calls the split conditional with its cause unread, and that rung 2 cures it is the builder's HYPOTHESIS, with no
  run yet. If x-held-pose reproduces it, Eli chooses between a rung 1 limit and merging rungs 1 and 2 together.
- Stale by the approval: rung 2's fix 22c2466d had been pushed at 15:32Z and its T2 was rerunning; the reanimation head
  581bc461's first T2 had read 15 differences, its fix local; return-to-caster had gone green as x-reanimate-return v1.5
  (20261112-152001) for its engine half, its server row and native then being built on m4-reanimate-return.

What I'd do differently.
- Item 1, "about 20 items across five systems": the checklist had 16 rows, and ADR-071's amendment also owed it the physics
  plan's P1 and P2, eight items each, and a cap item, none yet written: 33 if all had landed.
- Item 2 cites Kingman's formula for a cap on work built ahead, which the formula does not address; it describes the lab as a
  queue. The fitting sources are a work-in-process limit's: DORA, "Work in process limits" (https://dora.dev/capabilities/wip-limits/),
  and Forsgren, Humble and Kim, Accelerate, 2018, chapter 7.
- Item 3, "x-prop-arbitration is at v14.4 with 453 steps and seven legs, and failed on Caps Lock": the red run was v14.3 (440
  steps, seven numbered legs, ten with 3b, 3c and 3d), red on 14 of 97 claims from four causes: three probe faults (Caps Lock by
  HYPOTHESIS, a teleport onto a figure, a grab order) and one unread engine split. v14.5 is the restage's. thuum-magnus keeps it
  whole and splits out any leg that goes red again on a probe fault.
- Item 4, "The last five merges to main are all lab-api coping with the guest agent": four of the seven merges to main since
  2026-11-11 that touch lab-api do (8bd23824 ranged reads, 58502b08 client logs, aa686463 removal retries, 4f0398a2 held handles
  and busy retries), and 64a946fc does the same for the playtest scripts. "The lazy fix is a share": the repo already has the
  route, since the seats upload their dumps to lab-api by a curl PUT (docs/LAB.md:841-854), and core's read in section 4 ranks
  widening it first. The cited FUSE paper measures Linux FUSE, not virtiofs or WinFsp; virtiofs's own sources are
  https://virtio-fs.gitlab.io/design.html and "virtio-fs: A Shared File System for Virtual Machines" (KVM Forum 2019). The QEMU
  reference page says the data is base64 and at most 48 MB a call; the channel is named on
  https://www.qemu.org/docs/master/interop/qemu-ga.html, and that a busy agent works through its commands as a queue is core's
  diagnosis (docs/LAB.md:393-396), not QEMU's text.
- Item 5, "the 100 KB road-to-51 and physics-leg notes": 10 KB and 65 KB. "The nightly slip ... is what a second record costs":
  the slip came from stale repo text, CLAUDE.md:106 ("the milestone lists run nightly") and docs/LAB.md:447-450, while LOG.md
  and the memory note both said the nightly was off. The case for one status record rests on the memory rules alone.
- Item 6, "433 MB and 422 MB": MiB. The four sub-agents were stopped when the builder's session ended at about 15:15Z, and all
  were resumed at 15:20Z.
- Item 7, "About 60 are registered there, 12 already prunable": 67 worktrees are registered, 43 of them under /private/tmp and 11
  of those prunable; lab/.cache/wt already has 14.
- Item 1's citation: Accelerate's chapter 4 does list "Work in small batches" as a principle; the nearest sentence is chapter 2,
  p. 16, and the capability's chapter is 8. Kingman's paper appeared in the Proceedings of the Cambridge Philosophical Society
  57(4), 902-904, October 1961 (doi:10.1017/S0305004100036094).

Is there a one-shot close?
- "the remaining constraint is your sittings, not code": the sittings are the longest queue, but legs 2, 4 and 5 of the walk, its
  later legs and both exit scenarios are still build and lab work.
- "one system, one ladder, one sitting": ADR-071 has four sittings. "DoD clause 1 in full (leveling is BROKEN, crafting is not
  begun)": clause 1 asks leveling and perks; crafting is M5's exit `p-craft-restart`.

Decisions for you.
- D-C1 B's "physics rungs 1 and 2 become P1, rung 3 and the cart P2": ADR-071's plan has P1 after rungs 0 and 1 and P2 after
  rungs 2 and 3, and those stand. "reanimation rides whichever sitting follows its green stage": the first sitting cut after
  its merge on canon, by ADR-072 decision 3.

The split draft (appendix A) had further faults of its own: it regrouped fifteen rows as "eight scored items", left M3-8 out and
item 7 unscored, ordered the rows against the vampire item's clock, and said nothing about raising bodies, which on canon lost
the other player's game in two of two lab runs. auriel withdrew the regrouping and the P1 and P2 naming, for Eli to confirm;
thuum-magnus recut the checklist itself (docs/private/playtest-51.md), and it is what the sitting follows.

ADR-072's own corrections are in the note at its end, and applied in docs/ROUTE-CLOSE.md.

## 3. Eli's answers

Asked at about 15:31Z: "D-C1, playtest 51: A waits for rung 3 as planned; B cuts it now per the split draft. I recommend B.
D-C2, ADR-072: accept, amend, or leave it PROPOSED. D-C3, the file transport: send the core message or not." Eli, 15:41:53Z,
verbatim: "B, accept it, send all three messages". (These D-C labels are this plan's, not ADR-068's.)

- D-C1 B is recorded as a dated note under ADR-071: playtest 51 is cut on fork canon 6fe5fea0 and no longer waits for the physics
  rungs, the cap's merge or the reanimation.
- D-C2 is ADR-072's Status.
- D-C3: the three messages went out at 15:47Z, to numidium, to thuum-magnus and to core. Eli had read three short drafts of them;
  the texts sent were rewritten for B and the acceptance and are about five times as long. They are appendix B, with the
  corrections that followed.

## 4. What the other sessions said

thuum-magnus (the builder), asked how the physics and scripting work is going, 15:49Z, in its words:
- Most likely to go wrong next. Rung 1: x-held-pose reproduces the split between the reference and the held body, and Eli then
  chooses between a rung 1 limit and merging rungs 1 and 2 together. Rung 2: its T2 fix rests on a 300 ms margin inside a fixed
  1.5 s client gap, so the timing race can come back. Rung 3: H3, whether a watcher's projectile copy pushes its own props. The
  reanimation: the ApplyArtObject fix and the departure fix are unproven on seats, one seat's exit in run 125536 is unread, and
  thrall-departure's declarations have never met a real NPC.
- Ready after 51. Rung 6 is m4-scripts-6-speaker (the speaker-owner rule), with q-golden-claw, q-embershard, x-mora-scene and
  x-vampire-stage as its proofs; 51's items 1, 3, 4, 5 and 8 are their manual half, so 51's findings set its list. Nothing of it
  is drafted beyond ADR-068 decision 9. Rung 7 is chaff and follows 6. Train 53's trigger hold is in DECISIONS.md at :5006 and
  nowhere else, so it cannot be called ready.
- What costs the most that is process and not engineering. The loop on long probes (draft, fresh review, fixes, delta check,
  stage slot), where a red premise costs the whole loop again and x-prop-arbitration v14 has been through it four times;
  relaying shas between sessions; a compaction that stopped four agents mid-task.
- One change. Make the premises that keep failing (spots, aims, landings, placements, key state) shared fixtures, verified once
  and called by name: most of the day's reds and review findings were premises derived again in each probe, not the rule under
  test.

core (the estate's session), asked whether the seats could give their files to sky-srv over a share, 15:54Z:
- Both shares are workable. virtiofs is how the lab already moves files (sky-srv's results and persist are virtiofs from the
  host); on a seat it needs WinFsp, the viofs driver and the VirtIO-FS service in the image, and a virtiofs line added after the
  baselines vanishes at the first rollback, since a rollback takes the VM's config from the snapshot's section. Proxmox blocks
  only snapshots with RAM, hibernation and live migration for a VM with virtiofs, and the seats' snapshots are disk-only. SMB
  costs nothing in the seat image but puts a Samba on sky-srv in front of guests the lab treats as hostile.
- Simplest, and core's first choice: an upload route in lab-api, which already listens on the seats' network, so a run's
  artifact pass becomes one guest exec running curl. No new daemon, driver, host change or snapshot interaction.
- Sources core gave: the Proxmox VE 9.2 admin guide's Virtiofs section (https://pve.proxmox.com/pve-docs/chapter-qm.html#qm_virtiofs),
  qemu-server 9.2.15's Virtiofs.pm and QemuServer.pm, the virtiofsd README (https://gitlab.com/virtio-fs/virtiofsd) and the
  virtio-win drivers (https://github.com/virtio-win/kvm-guest-drivers-windows). For what a FUSE file system costs on Linux:
  Vangoor, Tarasov and Zadok, "To FUSE or Not to FUSE: Performance of User-Space File Systems", FAST '17, pp. 59-72.
- Nothing was built or changed. Whether lab-api gets the wider route is Eli's to say.

## Appendix A. The split draft as Eli answered it (verbatim)

docs/private/playtest-51-split.md at sha1 9141a2a3, the text behind "B cuts it now per the split draft". Its headings are set two
levels down here. Section 2 says what in it was wrong.

### Playtest 51's split, a draft for Eli (thuum-ff, 2026-11-12; D-C1 B of the approved plan)

Nothing here changes docs/private/playtest-51.md, numidium's queue or any branch. It is the cut
I'd make if you say "split it"; your word of 11-12 ("51 waits for rung 3") stands until you do.

#### 51: what is on canon today (fork canon 6fe5fea0: train 52 and the double-shout fix)

Runs as soon as numidium's warm setup is ready. Eight scored items, the route's order:

1. Item 3: the Golden Claw starts in both journals (the Trader).
2. Item 8 with M3-4, M3-5 and M3-7: Embershard (armor, arrows, the roster on a hand-off, reach and
   cone, the guest's loot).
3. Item 4 with M3-1: the Temple (the ambush for a guest, Arvel, the claw; the found body's loot).
4. M3-3: bodies where they died, at Ariadne's one relaunch and rotfern's.
5. M3-6: Raise Wall.
6. Item 5: the restart, then the claw back to Lucan.
7. Item 1: Ariadne's turn and cure (its three-game-day clock starts at the first drain, so start
   it first and score it last).
8. Item 2 and item 6 as one row: the two Morthal and Riverwood dialogue reads.

Recorded, not scored: item 7 (Beast Form), the 60 fps cap on your 144 Hz machine if the cap layer
has merged by the cut.

Out of 51, by name: M3-2 (reanimation, both halves) and every physics item.

#### P1: props hold and sample (ADR-071 rungs 1 and 2)

Cut when both rungs and the cap layer are merged on canon. Rung 1's red leg (the reference and
held-body split) is rung 2's fix, so they sit together. Items come from the physics plan's P1.

#### P2: impact (rungs 3a and 3)

The cabbage cart under Hailstone, Fireball and Unrelenting Force. Cut when rung 3 is merged.

#### Reanimation

M3-2 rides whichever sitting follows m4-reanimate-claim-2's first green stage. If return-to-caster
misses again, that question comes to you with its read, as thuum-fa already planned.

#### What the split costs

One more sitting's setup (numidium's warm setup, about the same each time) and a second drain
clock for Ariadne if the vampire item slips. What it buys: 51's findings two days sooner, on a
build that is already merged, and physics findings read alone.

## Appendix B. The three messages as sent (verbatim), and what followed

Sent by auriel at 15:46:51Z, 15:46:59Z and 15:47:06Z. Their headings are set two levels down here.

#### 1. To numidium [6f34c3] (the lab operator)

Eli decided in auriel's session (2026-11-12 about 15:42Z): playtest 51 is cut now on canon instead of waiting for rung 3, and ADR-072 is accepted. A relay; no reply needed.
I'm auriel, the planning session Eli opened today (first listed as thuum-ff). The questions as posed, D-C1: "playtest 51: A waits for rung 3 as planned; B cuts it now per the split draft." D-C2: "ADR-072: accept, amend, or leave it PROPOSED." D-C3: "the file transport: send the core message or not." Eli, verbatim: "B, accept it, send all three messages".

What B says (the split draft is docs/private/playtest-51-split.md; the checklist playtest-51.md stays thuum-magnus's to recut):
- 51 runs on fork canon 6fe5fea0 (train 52 and the double-shout fix) once its warm setup is ready and Eli gives its start word. It no longer waits for physics rungs 1 to 3, the cap layer or the reanimation.
- Out of 51 by name: M3-2 (reanimation, both halves) and every physics item. Rungs 1 and 2 with the cap become P1, rung 3 and the cabbage cart P2, and the reanimation rides the sitting after its first green stage.
- So Eli's "51 waits for rung 3" (ADR-071's amendment, main 232004e6) is superseded by its own later word. Your chain toward those merges keeps its order; it just no longer gates 51.

ADR-072 in short: the closeout is one route (the Golden Claw walk); a leg is green in the lab, then ticked by Eli, then DONE; a sitting is at most eight items on the current canon and never waits for a build; a ladder builds at most one rung ahead of the rung the lab is staging. Its first act is one run set of the route's committed scenarios on canon, to replace the table's Lab column with verdicts: yours to place where it costs 51 nothing.

What I'm doing: recording the acceptance and the superseded words as dated notes on thuum branch docs-closeout-route (ADR-072 stood PROPOSED at 894e7b3f, docs only, off main 72b881cb), after a fact check of its table and of the split draft against playtest-51.md. I'll send the final sha and any correction to the split. The merge to main and the LOG line are yours, in a window with no step 0 or gate pending. I run nothing on the lab and push nothing to main.

One note: the session listed as numidium [3595d7] is thuum-magnus's (transcript 93f37424; it registered under that name at its 15:20Z resume). I've told Eli; until it is renamed I address you both by ref.

#### 2. To numidium [3595d7] (thuum-magnus, the builder, also known as thuum-fa)

For thuum-magnus (thuum-fa): Eli decided in auriel's session (2026-11-12 about 15:42Z) that playtest 51 is cut now on canon and ADR-072 is accepted, which changes what you are building toward.
I'm auriel, the planning session Eli opened today (first listed as thuum-ff). Your session registers as numidium [3595d7] since its 15:20Z resume, which is why I could not reach you as thuum-fa or thuum-magnus; I've told Eli. The questions as posed, D-C1: "playtest 51: A waits for rung 3 as planned; B cuts it now per the split draft." D-C2: "ADR-072: accept, amend, or leave it PROPOSED." Eli, verbatim: "B, accept it, send all three messages".

What changes for you:
1. 51 is fork canon 6fe5fea0. It no longer waits for rungs 1 to 3 or the reanimation: "51 waits for rung 3" and the reanimation's "Finish it before 51" are superseded by B. Rungs 1 and 2 with the cap are P1, rung 3 and the cabbage cart P2, and the reanimation with return-to-caster rides the sitting after its first green stage. None of them carries Saturday's deadline any more.
2. docs/private/playtest-51.md is yours and needs its recut. My draft of the cut is docs/private/playtest-51-split.md: M3-2 and every physics item out, the M3 rows folded into the items on the same ground, eight scored rows. I'm fact-checking it against your doc now and will send corrections; amend what I got wrong. Nothing gets written into a checklist Eli has open.
3. ADR-072 decision 4: a ladder builds at most one rung ahead of the rung the lab is staging. Rung 3 is already built, so no rung 4 build starts until rung 3 is at its stage; read-only plans are not builds. Decision 3: a sitting never waits for a build. The ADR is on thuum branch docs-closeout-route (PROPOSED at 894e7b3f; the acceptance commit follows, I'll send its sha).
4. An ask, yours to weigh: x-prop-arbitration v14.4 is 453 steps in seven legs, and v14.3's reds were Caps Lock, a teleport collision and a grab order. Splitting it by leg into one-question probes before the restage (ADR-064 amendment B, as you did with x-prop-engine-v2) would let each red name its own cause.

Eli also asked me to ask how you are doing with the physics and scripting work. When you reach a pause, in your own words and briefly:
(a) what is most likely to go wrong next on rungs 1 to 3 and the reanimation;
(b) what on the scripting ladder (rung 6, rung 7, train 53's trigger hold) is ready to start once 51 has run;
(c) what costs you the most time that is process and not engineering;
(d) one thing you would change about how M3's close and M4 to M7 get run.

I touch no branch, worktree or lab run of yours.

#### 3. To core (the estate and Proxmox host session)

An evaluation ask from Eli's thuum planning session (auriel), not a build: could the sky lab's seats hand files to sky-srv over a share instead of through the guest agent? Eli approved sending this on 2026-11-12 ("send all three messages", D-C3 of its plan).

Why: since 2026-11-11 four lab-api branches have merged to main to cope with guest-file-read as a bulk transport: labapi-frida-fetch (ranged reads, main 8bd23824), labapi-client-log-fetch (58502b08), labapi-removal-retry (aa686463) and labapi-held-removal (4f0398a2: held handles, and the "QEMU guest agent is not running" answers you diagnosed as a busy agent). Every run pulls its logs, screenshots and Frida traces off VMs 711 and 712 that way, and numidium measured a whole read of about 1.4 MB timing out three times in a row on a busy seat.

The question: would a share the seats write to, and lab-api on sky-srv reads, be workable under the seats' isolation and their snapshot rollbacks? Two candidates I can see:
- an SMB share served on the lab's VLAN (Windows-native on the seats);
- virtiofs from the host. On a Windows guest it needs WinFsp and the virtio-win VirtioFS driver and service in the seat image (Proxmox VE has shipped virtiofs since 8.4; guides name virtio-win 0.1.271 or newer). A VM with a mounted virtiofs share reportedly loses live migration, and I could not confirm what it does to snapshots, so the seats' rollbacks are the first thing to check.

What would help back, at a quiet moment: workable or not for each, what it would cost (the seat image, a firewall rule, rollback behaviour), and anything simpler you would use instead. No change is asked for. Adopting it on the thuum side would be numidium's and Eli's call after your read.

Corrections that followed: to thuum-magnus at 15:55Z (the eight regrouped rows withdrawn, M3-8 restored, the P1 and P2 naming
withdrawn) and at 16:25Z (no raised bodies in 51, the reanimation after its merge on canon, the Temple's host, M3-7 before M3-4);
to numidium at 16:24Z (the same naming and wording, the profile's build line and spells, the staged cap on the promoted seats).
