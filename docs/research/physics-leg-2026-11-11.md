# The physics leg's plan, as approved (2026-11-11, thuum-fa; ADR-071)


## Context
Eli, 2026-11-11, about 16:04Z: "instead of expanding on functionality we havent tested, can you start the physics leg of work?"
Eli then switched to plan mode to see the plan first. This is recorded under ADR-067 decision 7's order (main 8fbfd188):
- physics prework starts now, ahead of rung 6;
- nothing new is built on the scripting and quest lines until playtest 51 is played;
- train 52 stays built and stages after 51.

**The two tests (ADR-067 d7):**
- a player drags a corpse, and both screens see it;
- spells hit a cart's cabbages, and both screens show the same scatter.

**The problem today:**
- **Slice one has a weak foundation.** It made dropped items props (ADR-058, merged 2026-11-01), but:
  - playtest 44 read "physics props do not work" (E_PROP_CELL at a cell edge);
  - b-prop-push is pending in gate.yaml;
  - the arbitration rule, statics, the blast pair and the E_PROP_CELL retirement sit off canon, never verified;
  - ADR-064 d7 froze new prop code, with no thaw recorded.
- **The docs contradict themselves.** There are six contradictions, including three mechanisms on record for bodies.

**The intended outcome:** one row kind and one stream for every Havok body, whether item, static or corpse. The seat that set a body moving owns it. Both tests are green on canon, and four playtests verify them in play.

**Inputs:**
- Research:
  - the repo and fork (acdcc86c);
  - the Havok surface, with CommonLib ids checked by `just addr` (ab87ae92);
  - prior art: Fiedler's Networked Physics and VR authority, Source's prop_ragdoll, Unity and PUN, FiveM, Skyrim Together (a9265ff8).
- Design: the mechanism (a4d3278b), the ladder (af4fd77f), the skeptic (a0b18542).
- Eli's calls below.

## Eli's decisions (2026-11-11, in plan mode)
- **W1a, ownership: A1 to A7.** This is ADR-063's proposed props note.
  - A grab beats a touch.
  - A moving prop stays with its mover.
  - It returns to the cell's host only at rest, by the owner's own final sample, never on a timer.
- **W1b, the ADR-064 d7 freeze: lifted rung by rung.** A rung merges once the havok-props.md rows it rests on read on both screens and its scenario is green. The whole doc thaws at the last rung.
- **W5, the impact: caster only.** Other seats skip a remote player's push on props and render the caster's stream. Sound and visuals still play everywhere.
- **W6, bodies:** the engine's saved Havok block holds the resting pose (D78, re-applied at reload, login and restart), and compact per-bone samples carry the live drag.
- **W2, statics: kept.** They are a rung of this leg. The static class is derived from the base's model (its BSXFlags kDynamic bit, read once from the archives or the loaded 3D),
  never from a per-name list (ADR-063 d5); rung 0's census found the record type no predictor.
- **W4: test with all three.** Hailstone, Fireball and Unrelenting Force on the cabbage cart.
- **W7: four playtests,** P1 to P4.
- **Physics settings: the same fix for everyone.** Already true (apocrypha, 2026-11-11): the shared layer lays Display Tweaks
  0.5.16 with Eli's INI on every seat (essentials.tsv:89). Its dynamic mode steps a 47 fps seat at 1/60 and a 144 fps seat
  at 1/144, so rest is read by the engine's deactivation (model point 8). Eli then capped it ("that works . cap it"): every
  player at 60 fps with a static 1/60 physics step, an ini-patches row on SSEDisplayTweaks.ini laid after playtest 51.
- **The b-npc-handoff-cross window: widened.** The scenario waits up to 60 s more for Sigrid's crossing through an until, with the claim unchanged. Its red was marginal by seconds in any mode: the green's crossing came at 225.6 s, and the reds' logs end at about 227 s.
- **The two diagnostic reads: "Run them now"** (step 0).
- **W3 stays Eli's at the time:** a rewrite of b-prop-push's step 27, if the drop read calls for one.

## Step 0, at approval
1. **docs/DECISIONS.md:**
   - ADR-071 ACCEPTED, "Physics as one system", carrying the model below and Eli's calls verbatim;
   - ADR-064 d7's dated amendment (rung by rung);
   - ADR-063's props note marked accepted.
   - Save this plan as docs/research/physics-leg-2026-11-11.md.
2. **The two diagnostic reads.** Write them from /Users/eli/.claude/plans/humble-crunching-iverson-agent-a34854dbae83ce2b9.md into lab/.cache/drafts/reads/, byte for byte:
   - x-ghostwalk-warm-read (sha1 a20627b6);
   - x-handoff-cross-timing (c567fbcb).

   Run probe-check on each, get a fresh review, then send them to numidium, who runs them as agreed: ghostwalk once, the handoff read as a cold-then-warm pair.
   - The ghostwalk read now leads with suspect 1. Every red run's start ran c2's Companions quests under rung 5's acting scope in c1's game (060821 c1.log :222-249); no green did.
3. **b-npc-handoff-cross's widened window,** as its own scenario commit (rule 13) citing Eli's word.
4. **ghostwalk.md's correction:** 061139 rolled c2 back too.
5. **The physics step for every player:** Display Tweaks is already laid (essentials.tsv:89). Eli's cap (60 fps, a static
   1/60 step) is apocrypha's ini-patches row, laid after playtest 51. The rest reads (E10) read Havok's own deactivation and run
   after the cap lands.

## The model
1. **One row, one stream.** Every Havok body, whether an item, a derived static or a dead actor's ragdoll, is a "prop" row in wire-rules props.rs, on PropTransform. No rule names content.
2. **Ownership (A1 to A7), with no timers:**

   | state | owner | taken by | ends by |
   |---|---|---|---|
   | resting, stalled | the cell's host (player 0) | any claim at e+1 | |
   | moving | its mover | a grab only; else E_PROP_MOVING | the owner's asleep sample, or a departure word (A7) |
   | held | the grabber | nothing (E_PROP_HELD) | `held` false, then as moving |
   | dying body | the death's simulator | as moving | as moving |

   - **Claim causes:** touch 0 is the capsule (the 79131 hook); 1 is the hand; 2 is a drop; 3 is an impulse whose cause the seat owns, or island contact with a body it moved.
   - **A moving island has one owner,** and other claims on its members are refused.
   - **Liveness is judged, never timed out.** Every return to the host is a word, and a take-over's first read is always sent.
3. **Cell edges.** A moving body's owner never depends on its cell. A listener check (E_PROP_UNSEEN) replaces E_PROP_CELL and E_PROP_REACH; those retire only together with A1 to A7 (alone, they granted 13 of 13 claims). The default owner at rest is the server's word.
4. **Non-owners render.**
   - A copy goes Keyframed at a word naming another seat, or at the first awake sample. Otherwise it stays Dynamic and asleep (D73 kept, for a responsive first touch).
   - It interpolates three samples behind the owner's clock (about 300 ms, UNMEASURED) and never extrapolates.
   - A late joiner stays Keyframed until the owner's rest, and no copy is placed inside a capsule.
5. **Impulses.** A seat applies a Havok impulse only from a cause it owns.
   - The mechanism is one Replace on the impulse site H2 names (26005 AddExplosionImpulse or 26004 ScaleGameplayImpulseForce). The cause comes from HitData::aggressor or Explosion::actorOwner.
   - An impulse from another seat's cause is zeroed and counted in native code (rule 9). This covers replayed projectiles, explosions and puppet pushes.
   - The caster raises propImpulse, claims its bodies in one PropClaim per impact, and tracks what it owns at any distance.
6. **Bodies.**
   - A dead actor's row is owned by the death's simulator, and its rest is its asleep sample.
   - The grab on a corpse:
     - the dragger's copy is Dynamic at the first frame (a laid corpse takes no SetMotionType), with a pre-grab guard at StartGrabObject 40552 if H5 says otherwise;
     - Held is answered at once, and the loser ends its grab and swallows its next activation;
     - one hold covers both: a held corpse can't be looted, and an open one can't be grabbed.
   - The live drag streams PropTransform's bones field. The follower imposes the pose by path A (keyframe each body) or path B (a block replay through 19535), whichever H6 reads within 32 units. It skips zero-step and paused frames, re-asserts after KillDying, and warps past a bound.
   - At rest, the engine's saved Havok block goes out as ChangeForm 72, served to late joiners and at restart (D78 whole). If neither path holds, D78's backlog clause applies: the drag ships as a re-rest alone.
7. **The wire** (rule 4: one SCHEMA bump after train 52's 44, with validators, fixtures, C++ structs and WIRE.md rows in one commit):
   - **PropTransform v2:**
     - fields: refr; epoch; seq u16; t_ms u32 (the owner's clock); pos; rot (Euler for the root, as the record keeps it); lin and ang velocity; asleep; held; bones Vec<{pos, quat}, 64>;
     - validator codes: E_VAL_NONFINITE, E_VAL_RANGE (a quaternion more than 1% off unit, a bone more than 512 from pos, |lin| over 6000), E_VAL_OUT_OF_WORLD and E_VAL_RATE;
     - rule codes: E_PROP_STALE, E_PROP_FUTURE, E_PROP_NOT_OWNER and E_PROP_STEP;
     - each sample is bounded against the sender's previous one. A live owner's rest is clamped and accepted, and every refusal is answered with the record.
   - **PropClaim v2:** touch at most 3; refrs Vec<u32, 16>; a per-refr outcome.
   - **PropOwner:** player 0 admitted.
   - **ChangeForm 72:** a dead actor's record is accepted from its prop owner at the prop epoch, with Rust bounds on the Havok block's floats.
8. **Rest and budget.** Rest is the engine's deactivation, not the per-frame stir test. A 500 ms heartbeat goes out while a body is awake. The asleep sample is reliable, and a priority accumulator always lets rests through.
9. **Trust (rules 5 and 12)** stays on four checks: the epoch, conservation (no record under the floor or outside a cell), the speed cap, and Rust bounds on every relayed float.
10. **Scope of ADR-066.** This leg builds d3 and d4 (epochs) for the prop row. d5's ack and d2's ActorOwner are not built: a prop's new owner is always the engine whose copy moved, so nothing needs applying before its first report.
11. **Traps** are unified under these rules, with their scenarios kept green and unweakened.

## The ladder
Each fork rung is cut from the head below it. Canon fast-forwards after each proof, a failed rung is parked, and nothing is rebased. Every rung:
- runs T0 and T2 before any lab run;
- gets a fresh read-only review before its first lab run;
- carries its probes by path, and commits each scenario alone (rule 13).

R0 rungs merge on T0 and T2 alone. There is one Windows runner.

| rung | branch | builds | proof | deletes | slots |
|---|---|---|---|---|---|
| 0 reads | thuum physics-0-reads (lab/frida, its own commits) | prop-impulse.js (H2, H3, H4), prop-grab.js on a corpse (H5), body-impose.js (H6), save-havok.js; esm reads of Hailstone, Fireball and Unrelenting Force's PROJ and EXPL forces (H1, done: all three push) and the cart's six cabbages; x-prop-blast v1's unread red | x-prop-engine v1 (the rule-free havok-props.md rows), x-prop-blast v3, x-corpse-grab v1, x-body-impose v1, b-prop-push with bInventoryMenu=false: each row gets a two-seat run id | rows E7, E19, E38 | 2 windows |
| 1 props hold | m4-physics-1-arbitration | A1 to A7, rebuilt from 8deb7809, 4b471676 and up to 147a6cfe, with f67fb0f8; PropOwner player 0; the listener check; island refusal; cell-free ownership; traps unified | x-prop-arbitration v12, x-prop-edge v1 (playtest 44's edge); b-prop-push out of pending, then b-prop-arbitration | PROP_LEASE_MS, PROP_SILENCE_MS, the lease mirror, E_PROP_CELL, E_PROP_REACH, the propStatics list | 2 |
| 2 sample v2 | m4-physics-2-sample | PropTransform v2 and PropClaim v2 (rule 4); the platform's ReadBodies native; the three-sample buffer on the owner's clock; 78089 hand-off velocity; seq-bounded allowance; answered refusals; rest by deactivation plus heartbeat; prop epochs | x-prop-follow v1 (rolling basket, tumbling cabbages, a 5% loss leg); b-prop-follow | the arrival stamp, the one-interval glide, the stir test | 2 |
| 3a | m4-physics-3a-impact-srv (R0) | the first-sample allowance refill at each grant; budgets sized from rung 0's per-blast count | T0, T2 | | 0 |
| 3 impact | m4-physics-3-impact | the impulse Replace with the owned-cause test; propImpulse; one claim per impact; tracking owned props at any distance; island claims | x-prop-impact v1; b-prop-impulse with three legs (Hailstone, Fireball, Unrelenting Force of two words or more, at the Riverwood Trader cart's six ALCH cabbages 0x1c0c6 to 0x1c0cb, from XMarkerHeading 0x96595) and a restart leg; x-prop-blast v4 | objectReferenceEx's Keyframing of items on arrival; TOUCH_RADIUS and the proximity stand-in | 2 |
| 4 statics | m4-physics-4-statics | the derived static class (the base model's BSXFlags kDynamic bit, read from the archives or the loaded 3D), admitted as references under the same rows; f07ba07e as prior art only | x-prop-static v1 (a Havok world object pushed by a kick and by a spell); b-prop-static | | 2 |
| 5a | m4-physics-5a-bodies-srv (R0) | a dead actor as a props.rs row; ChangeForm acceptance from the prop owner | T0; T2's npc-fate sessions identical | BodyOwnerId, ClaimBodyOwner, E_BODY_NOT_OWNER | 0 |
| 5 drag | m4-physics-5-drag | PropClaim admits a dead actor; propService tracks the dead; the pre-grab guard; Held answered; the hold covering grab and loot; the bones stream and its impose path | x-corpse-drag v1 (a bandit dragged 300 units, within 32 per bone); b-corpse-drag; x-corpse-record, b-npc-death and b-npc-body-release unweakened | E_BODY_AT_REST; the corpse movement-sample path | 3 |
| 6 rest and reload | m4-physics-6-rest | D78 whole: the saved block recorded at deactivation and re-applied at reload, login and restart; late joiners Keyframed until rest; Rust checks of the block's velocities; rule 6's migration if the record changes | x-corpse-reload v1; b-corpse-drag's restart leg (its own commit) | CORPSE_REST_* and the settle backstop | 2 |
| 7 chaff | m4-physics-7a (R0), then 7 | dead code out; havok-props.md thawed whole; prop-physics.md's T3 box ticked; gate.yaml's pending list emptied | the regression run set: always, plus every prop, trap and body scenario, plus watch | as listed | 1 |

**Estimate:** about 16 stage slots, roughly 8 to 10 days with the reds and slots shared with train 52, and about 13 Windows heads.
**The smaller ladder, if the whole one stalls:** rungs 0, 1, 3a and 3 on v1 samples, then 5a plus the re-rest, in about 8 slots.

## Playtests (eight items each, every item with a green two-seat run id)
- **P1, after rungs 0 and 1:**
  1. a walk nudges a prop;
  2. the guest kicks the host's basket;
  3. a bucket carried across the cell edge;
  4. a grab and release from each seat;
  5. a kick into the other player takes nothing;
  6. a drop with Souls RE on;
  7. props rest where they did after a restart;
  8. Embershard's rocks from the guest's tripwire.
- **P2, after rungs 2 and 3:**
  1. Hailstone at the cart, cast by c1;
  2. Hailstone cast by c2;
  3. Fireball at the cart;
  4. Unrelenting Force at the cart;
  5. a rolling basket stays smooth on the other screen;
  6. the scatter is unchanged after a restart;
  7. a walk-in after the blast;
  8. an arrow at a bucket.
- **P3, after rungs 4 and 5:**
  1. a Havok world object kicked;
  2. one hit by a spell;
  3. the host drags a corpse;
  4. the guest drags one;
  5. both players grab one corpse, and only one hand holds it;
  6. the same rest on both screens;
  7. a shout on a corpse;
  8. a fresh kill's fall.
- **P4, after rungs 6 and 7:**
  1. leaving the cell and coming back to a dragged corpse;
  2. a server restart with a dragged corpse;
  3. a late joiner sees the corpse's pose;
  4. the scatter's rest after a restart;
  5. a dragged body looted;
  6. the trap rocks;
  7. everything from both seats;
  8. regressions, named.

## Hypotheses, each with its settling read (rung 0 unless named)
- **H1:** Hailstone, Fireball and Unrelenting Force each push props. Read their PROJ and EXPL forces with esm.py.
- **H2:** which call pushes a prop, and what names its cause. prop-impulse.js on the caster: 26005, 26004 and 78091.
- **H3:** a remote figure's projectile copy pushes the watcher's props. prop-impulse.js on the watcher. If it doesn't, the detour isn't built.
- **H4:** islands merge before a knocked body moves. Island entities logged per frame.
- **H5:** the engine grabs a ragdoll, and a laid corpse is Dynamic. prop-grab.js on the watcher's corpse: 40552, 40557, grabSpring 0x8A0, grabbedObject 0x8D0, grabType 0xAFC. Also whether canon's activation block on corpses (puppetService.ts:515-527) stops the grab.
- **H6:** the pose holds within 32 units by path A or B, and a humanoid's bodies fit 64 in one packet. body-impose.js.
- **H7:** rest by deactivation (E10, E14, E15, E31). prop-sleep.js and prop-grab.js on both seats, after the physics fix is laid.
- **The kHavokMoved block keeps an awake body's velocities.** save-havok.js. Records are written only at rest, so nothing depends on this.

## Verification
- **Per rung:**
  - `just test` (T0) and `just test-proto <branch>` (T2, with FORK_DIR set from a worktree);
  - the fresh review;
  - `just verb-stage <branch> <probes>`;
  - `just verb-merge <branch> <scenarios>`;
  - every claim is the other seat's screen or log, never the owner's (ADR-064).
- **The leg is done when:**
  - b-prop-impulse (all three spells) and b-corpse-drag are each green twice on canon, both seats' positions checked against the server record;
  - P1 to P4's items are VERIFIED IN PLAY;
  - havok-props.md §5 holds with run ids;
  - verb-lint is clean.
- **Rule 8 throughout:** where a read fails, its Dynamic section is written and handed to Eli. No looping on it.

## Critical files
- fork skymp-wire/crates/wire-rules/src/props.rs
- fork skymp-wire/crates/wire-schema/src/skymp.rs (PropTransform, PropClaim, PropOwner)
- fork skymp-wire/crates/wire-validate/src/lib.rs
- fork skymp5-server/cpp/server_guest_lib/ActionListener.cpp (OnPropClaim, OnPropTransform, ChangeForm)
- fork skymp5-client/src/services/services/propService.ts
- fork skymp5-client/src/services/services/sendInputsService.ts
- fork skyrim-platform/src/platform_se/skyrim_platform/FridaHooks.cpp (the contact hook; the impulse Replace)
- thuum docs/verbs/prop-physics.md, docs/engine/havok-props.md, docs/DECISIONS.md, lab/frida/, lab/gate.yaml

## Rung 0's static reads (2026-11-11, a7896bda; esm.py on sky-srv, the winning records in the 91-plugin order)
- H1 done, all three push props: Hailstone SPEL 02e634:Apocalypse (PROJ 0b477d impact force 5; its Shatter EXPL 0b2c7d force 24,
  radius 128), Fireball SPEL 0x01c789 (Odin's; PROJ 0x10fbed impact 1.5; EXPL 0x0439c0 force 1, radius 320), Unrelenting Force SHOU
  0x013e07 (a cone, impact 50, 65, 85 and range 1000, 2000, 10000 by word, no EXPL); fGameplayImpulseMultClutter 1.0. The engine
  scales PROJ and EXPL forces differently, so the records do not rank them; H2's trace does.
- The cart: six ALCH FoodCabbage 0x064b3f references (0x1c0c6 to 0x1c0cb, 0x1c0c9 included), each one CLUTTER body of 2 kg, on
  STAT HandCart02 0x1c0c1 (FIXED, a collider) by the Riverwood Trader's sign in cell 0x9731, not the mill. The caster spot:
  XMarkerHeading 0x96595 at (20587, -46080, -122), 1,190 units southwest on the road, in the same cell; Unrelenting Force's first
  word falls short from there, so the test shouts two words or more.
- x-prop-blast v1's red (20261104-004612): its build had no touch-3 claim (the blast pair off canon), and its refs-near steps
  passed no ids, so steps 19 and 20 listed nothing.
- Statics: the record type does not predict a moving body (0 of 194 STAT, 5 of 27 MSTT near Riverwood); the mesh's BSXFlags
  kDynamic bit matched the rigid-body read on all 252 referenced models. Riverwood's movable statics: SignRiverwoodBlacksmith01
  0x3822a, two HandCart01Wheel 0x1c0c2 and 0x14201, SignRiverwoodRiverwoodTrader01 0x5161a, SpitPotOpen01 0x54177.

