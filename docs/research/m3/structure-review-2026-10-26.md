# Are we patching an incomplete method? The NPC work reviewed (2026-10-26 01:37 PDT)

Eli, after filling in the letters on docs/research/m3/decisions-after-playtest-34.md:
"it seems like we're incrementally creeping towards a working endpoint ... confirm
or deny my thought that we're maybe doing something similar to our casting
problem: that we committed to an incomplete method and kept patching our way
there instead of finding a structurally more correct way to do the thing."
Three reviewers read independently, with no session notes and no conclusion
handed to them: A read the architecture against the prior art and the design
law; B classified every fix of trains 34 to 50; C characterized the casting
problem from the record and matched its signals against the NPC work. Their
reports are quoted below with their citations (the fork at m3-train-50
dac4c0ff; the docs on main). The synthesis and the recommendation are mine, at
the end; Eli decides.

## The short answer

Partly confirmed, in named places, not across the whole NPC effort.

- The hosting and puppet core (one engine simulates an NPC; every other engine
  shows the engine's own reference with its AI off and its graph fed from the
  host; cells to the first loader, with a grace and an epoch) is the prior art's
  shape and sound. Its recent fixes (the echo, the bench, a stale, dead or
  quitting host, the pass at a crossing) are missing cases of a sound model.
- Three commitments are the casting shape: a mirror at the wrong layer that
  then needs one patch per symptom. (1) The puppet's presentation rides a
  replay of the host's graph events, the very layer cast-action left; the
  action replay ADR-035 point 5 ordered for NPCs (npc-stream) was never built.
  (2) The engine that simulates an NPC has its own death blocked on every seat,
  the host's included, and the server rebuilds deaths one cause at a time,
  against ADR-031's "cut at the number". (3) Identity is the server's own
  leveled roll pinned into the engine one inventory category at a time (species,
  outfit, weapons, with a late re-roll), where both prior arts let one engine
  roll and record the result.
- One more is a HYPOTHESIS both A and C raised: ownership is derived from the
  record's cell while Skyrim's actors leave their cells, and five days of fixes
  have rebuilt per-actor ownership as exceptions to the cell.
- Risks 2 and 3 share a root: npc-stream, the host's stream of its actors'
  actions, values and equipment, is the one NPC verb never built; handoff and
  fate were built around its absence.

So: not "decidedly on the correct path". The core stands; the three commitments
want the casting remedy (one read of the engine with the playtest findings as
the questions, then the engine's own entry), not more patches.

## A. The architecture against the prior art (verdict GAPS)


Half right. The core is the right decomposition, and it is TES3MP's. One engine simulates an NPC. Every other engine shows the engine's own reference with its AI off at one gate and its graph fed from the host (SP/PuppetHooks.cpp:41-89, :112-166; npc-puppet.md Rules A to C). Grants go to the first loader, with a grace window, fenced by an epoch (W/cells.rs:111-126, :339-350). The fixes there (the echo, the bench, stale, dead and quitting hosts) are missing cases of a sound model.

Three things are not missing cases, and they will keep producing patches:

1. **Ownership is derived from the record's cell**, in a game whose actors leave their cells. Five days of fixes have rebuilt per-actor ownership as exceptions to the cell.
2. **The server re-derives an NPC's health and death**, and the simulating engine's own death is blocked. This is the casting problem exactly. ADR-031 described it: "the suppressions cut events, not numbers", and the verbs "re-add the consequences one at a time" (DECISIONS.md:903-925).
3. **Identity is a server reimplementation of the engine's leveled roll**, imposed one inventory category at a time. This is the per-element copying that cast-action replaced with the engine's one entry (ADR-032).

Items 2 and 3 put R0 on outcomes the host's engine simulates. That cuts against two rules:
- the law: "we do not reimplement engine systems a host client will run for us" (CLAUDE.md:24-25);
- ADR-031 point 3: "the server's decision reaches the subject's host game as the cause" (DECISIONS.md:947-953).

The tell is Rule A: "nothing multiplayer writes to an actor this game hosts" (DECISIONS.md:2352). It now has a standing exception at exactly these places:
- the deferred kill (C/view/formView.ts:397-401);
- the server's health pushed into the host's actor (S/MpActor.cpp:1004 through :549-564);
- the fate pin (DECISIONS.md:2403);
- the teleport (cell-host.md:327).

### The decomposition as built, and its dualities


1. **Who simulates.** The cell grant and the per-actor follow and pass are joined in `simulator_of` (W/cells.rs:354-365). The client keeps a grant table (C/services/services/hostService.ts:49-55) beside the per-actor word it obeys (:67-75). The puppet service's header still says "the switch is the cell's grant alone" (puppetService.ts:12).
2. **Fencing.** A grant has an epoch (W/cells.rs:111-126). An actor's pass or follow has none. A time window, FOLLOW_SETTLE_MS, stands in for one against samples "reordered on the unreliable channel" (:33-39). Skyrim Together fences per actor (te-npcs.md:57-62).
3. **Remote display.** Puppet AI off versus figure AI on with a keep-offset on itself (movementApply.ts:64-72). Which one applies is decided by base id (puppetService.ts:94-120).
4. **Actor kind.** Two predicates answer the same question:
   - The 0xff000000 id range decides fate (S/MpActor.cpp:1745; S/PartOne.cpp:1687), death reports (deathReportService.ts:43, :71), loot and resurrection (deathService.ts:169-211), blanks (animation.ts:436-446) and dressing (formView.ts:778-786).
   - IsCreatedAsPlayer keys on id and base (S/MpActor.cpp:1581-1584), and IsFateRespawned on that (:2191-2200).

   The upshot: a server-made NPC is an NPC on the server and a figure on the client.
5. **Health.** The server's number and the host engine's are joined by overwrite. The host's value is never stored (DECISIONS.md:2563-2566).
6. **Death.** Two paths, plus the simulator's own death blocked (risk 2).
7. **Identity carriers.** ActorFate, plus CreateActor's chain and equipment as "the late copy" (DECISIONS.md:2711-2712).
8. **Squares.** The interest grid and the fate ring truncate (S/MpObjectReference.cpp:164; S/PartOne.cpp:1647-1648, :1692-1693; S/ActionListener.cpp:259-260). Cells, reach and adjacency use floor (S/WorldState.cpp:1318-1319; S/PartOne.cpp:1556-1557, :1999-2002). They differ only at squares -1 and 0. HYPOTHESIS: never exercised.
9. **Off screen.** The server freezes the actor (DECISIONS.md:1320-1321). Every client's engine runs it and snaps it at re-entry (puppetService.ts:62-78; npc-puppet.md:1355-1360).

### Against the prior art


| Step | thuum | TES3MP | Skyrim Together | Shape |
|---|---|---|---|---|
| Identity | Server rolls; engines pinned | First visitor's engine rolls; persisted (tes3mp.md:62, :225) | Owner's engine rolls; the pick rides the wire (te-npcs.md:269) | Different |
| Ownership unit | Cell, plus per-actor follow and pass from the record | Cell: first loader, lowest ping (tes3mp.md:33-40) | Actor, bounded by the owner's high-process list; epoch per actor (te-npcs.md:14-17, :34-42) | TES3MP's unit with TE's cases |
| Off-host display | AI off, animation re-admitted, movement step skipped | Global AI off, lerp (tes3mp.md:90-110) | AI on, outputs blocked (te-npcs.md:133-150) | Same as TES3MP |
| Host stream | Movement and graph events only | Stats, equipment, attacks, deaths (tes3mp.md:53) | Actions, equipment, values (te-npcs.md:80-101) | thuum lacks it |
| Boundary | Four verdicts, a door rule, a roster | ActorCellChange; becomes local if the target cell is ours (tes3mp.md:85) | Owner keeps it until it relinquishes (te-npcs.md:34-42) | Pass is TES3MP's; Follow is TE's |
| Off screen | Server freezes; every engine runs it | Frozen (tes3mp.md:144-150) | Destroyed (te-npcs.md:42) | Different |
| Hit on an NPC | Server numbers it; the host gets the number | Every client replays it (tes3mp.md:113-114, :187) | Hitter or hittee's owner decides (te-npcs.md:207-216) | Different |
| Death | Number, or evidence; the simulator's death blocked | Authority reports (tes3mp.md:228) | Owner's state; receivers kill at 0 (te-npcs.md:96, :222) | Different |
| Body and loot | Server container | Server data (tes3mp.md:235) | No remote loot (te-npcs.md:149) | Same as TES3MP |
| Respawn | Server clock | None on a timer (tes3mp.md:242) | Engine's own | They lack it |
| Handoff | Word flip, from the puppet's last point; no keyframe | State, grant, full update (tes3mp.md:164-168) | Epoch, ActorData, pick (te-npcs.md:62-72) | Thinner than both |
| Server-made NPC | Copy with its own rules | Server id, then one actor model (tes3mp.md:216-224) | Leader spawns (te-npcs.md:26) | Different |

### The three structural risks, with the alternatives and their cost


### 1. Ownership is derived from the record's cell

**Evidence.**
- `simulator_of` reads the record's cell plus the follows (W/cells.rs:354-424). The record moves only on accepted samples, so a refused sample freezes the answer while the engine walks on. Stump was refused 751 times; Alvor ended up 49,000 units apart on two screens (npc-handoff.md, Inventory).
- The fixes since are per-actor ownership written as cell exceptions:
  - the word, needed because persistent parent cells are the worldspace's (DECISIONS.md:2305-2313);
  - the roster moved to the high-process list (npc-puppet.md:1267-1329);
  - the follow, door, settle, pass and cold start (ADR-047);
  - the listener pin (S/MpObjectReference.cpp:728-735);
  - the teleport sent ahead of an unsubscribe (S/ActionListener.cpp:249-283);
  - the release of unloaded puppets and the loss demote (puppetService.ts:62-78, :206-229).
- The client switch has six entry points (formView.ts:619-626; puppetService.ts:51, :62-78, :206, :232, :255).
- The word is a cache pushed from three sites (S/PartOne.cpp:1129-1131, :1486-1500; S/ActionListener.cpp:404-413). A follow that ends changes the answer and emits nothing (W/cells.rs:233-257).
- The pin is set from the actor's side only, so the follower's own square change can undo it (S/MpObjectReference.cpp:552-572, :709-760). HYPOTHESIS.

**Patch class.** Every way an actor and its record's cell part company becomes a new verdict, poll or pin. Today: doors, schedules, low-process walks. Ahead: scripted MoveTo, followers, mounts ("we must always host the horse we ride", skymp-hosting.md:447), dragons, summons, fights across a border. HYPOTHESIS for the cases ahead.

**Why the unit doesn't fit.** TES3MP's unit suits actors that stay in their cells. Skyrim's residents live indoors, work outdoors, and run in low process everywhere (cell-host.md:40).

**Alternative.** Keep the cell as the policy; make the actor the record.
- An owner table in wire-rules: actor to {player, epoch, since}.
- Four transitions:
  - claim: a grant takes the cell's standing actors, and a sighting takes unowned ones;
  - pass: crossing into another live host's cell;
  - relinquish: the owner's engine drops the actor from high process (SP already snapshots that list, SP/PuppetHooks.cpp:69-81), or the owner leaves, goes stale or dies;
  - reassign by policy.
- The word carries the actor's epoch and is sent only from the table's decisions.

Follow, door, settle, pin, release and loss demote then become cases of one function. The precedents: Colyseus's per-object primary (Bharambe, Pang, Seshan, NSDI 2006); Fiedler's per-object authority (gafferongames.com, "Networked Physics in Virtual Reality"); per-object fencing (Kleppmann 2016; Burrows, OSDI 2006).

**Cost.** About train-40's size, since the follow table is the seed: the table and its T0, the core's call sites, one wire field (rule 4), and the client's relinquish. It needs an ADR refining 035 and 047.

### 2. The simulator's death is blocked and rebuilt cause by cause

**Evidence.**
- The deferred kill is on every viewed actor, the host's own included (formView.ts:397-401; DECISIONS.md:2546).
- The server's health is written into the host's actor (S/MpActor.cpp:1004) while the host's engine also damages and regenerates it.
- Deaths are found by a 500 ms poll (deathReportService.ts:60-89) and accepted on one cause's evidence at a time: a numbered hit within 3 s, a 200-unit drop within 4 s, an activation within 512 units in 5 s (S/ActionListener.cpp:2172-2187, :2318-2384).
- Traps needed trigger forwarding (S/ActionListener.cpp:1225-1256), and bear traps, floors, oil and lamps still leave the NPC at the floor (npc-fate.md:736-740).
- Server-made NPCs never report, so a fall leaves one standing at the floor (deathReportService.ts:43, :71). HYPOTHESIS.
- A hit from a non-host player reaches the NPC's simulator as a number only, with no stagger and no hostility (S/ActionListener.cpp:4163-4166, :4239-4241). TES3MP replays every attack on every client (tes3mp.md:187).

**Patch class.** One patch per health cause the server does not number: traps, hazards, effects over time, drowning, scripts, spell scripts that run in the caster's game (ADR-029). Plus jumping bars and corpses that stand back up wherever the two numbers disagree.

**Alternative.** ADR-031 point 3, applied to NPCs.
- The server keeps every number a player deals or takes (ADR-028 stands).
- It delivers that number to the simulator as a cause, through the engine's own hit path (the RE task left owed at DECISIONS.md:953). The host's engine then reacts and dies by itself.
- The host reports state through npc-stream's HostedActorState under the hold rule (npc-stream.md, Authority).
- Death reports are still checked as under ADR-048 option B; a refusal is corrected through the respawn path. That is optimistic and corrected, where today is pessimistic and rebuilt.
- The deferred kill stays on puppets only. GameplayCues draws the same line (DECISIONS.md:971).

**Cost.** The largest of the three: npc-stream (drafted, unbuilt), one RE read, and an ADR on ADR-048's mechanism. Its trust choice is untouched.

### 3. Identity is the server's roll, pinned per category

**Evidence.**
- The server's own evaluator rolls (S/MpActor.cpp:1737-1761; S/PartOne.cpp:1580-1636). Both prior arts let one engine roll and keep the result (tes3mp.md:62; te-npcs.md:269).
- The roll must arrive before the engine attaches the cell (S/PartOne.cpp:1638-1715). Interiors and logins are late by construction (DECISIONS.md:2725-2745).
- There is one detour per category: species, outfit, weapons (SP/FateHooks.cpp:432-441). The late re-roll left thirteen NPCs invisible (SP/FateApi.cpp:147).
- The sleep outfit, gold and loot, and ammo stay each engine's own (npc-fate.md:395, :420, :913).
- Server-made NPCs fall outside the roll (S/MpActor.cpp:1745). Their hits were dropped silently (S/ActionListener.cpp:3577-3602) until the once-dress (formView.ts:786).
- The host's later equips are never reported (sendInputsService.ts:287-289).

**Patch class.** Every category, distributor or equip change the engine resolves itself becomes a mismatch between the record (read by the server's numbers, headshots and loot) and the screens. It shows as dropped hits, wrong helmets and pops, with one detour or one dress per fix.

**Alternative.** One recorded resolution per actor.
- The first simulator's engine resolves the actor whole and reports it once (base, inventory, worn set), starting from the sighting's draft base field.
- The server stores it and pushes it to every engine, so "the server's roll pushed to both" still holds.
- It is pinned at one site, the inventory init the three adds run under (SP/FateHooks.cpp:31-41), plus the base pin. HYPOTHESIS: that site can be answered whole.
- npc-stream keeps it current, and server-made NPCs go through the same path.
- The evaluator becomes the provisional value and the oracle that logs mismatches.

**Cost.** Moderate: the detours consolidate, plus one wire field and the stream's equipment row. It needs an ADR refining ADR-046 decision 1 and ADR-049 D2.

## Keep, and the common root

Keep the puppet, first loader with grace and epoch, the echo suppression, the corpse as a container, and the respawn on server time.

Risks 2 and 3 share a root: ADR-035 point 5's stream, ordered third (DECISIONS.md:1293-1301, :1326-1332), is the one NPC verb never built (npc-stream.md:749-759). Handoff and fate were built around its absence, which is why the fate pins equipment and the death report polls health. Build npc-stream first, then the owner table.

## C. The casting precedent, and its signals in the NPC work (verdict MATCH in named places)

## Part 1. The casting problem

**Method and its layer.** From playtest fourteen (2026-10-12) a figure's hands
were driven by relaying the caster's graph OUTPUTS: the events its graph took,
replayed through Debug.sendAnimationEvent, and its variables written by index
every 500 ms (spell-cast.md:908-920). The engine enters a hand's cast only
through the actor's own MagicCaster: the want variable, the graph's BeginCast
answer, then a BGSAction through ActorMediator::PerformAction (spell-cast.md:919;
DECISIONS.md:1013-1021). A scripted event reaches a graph that is not in that
state and is refused, nondeterministically. Right layer: the action entry,
gated by the graph's handshake. The record said so on 10-14 at 07:29 PDT
(x-cast-solo: "The pose is not the animation relay's to give",
spell-cast.md:768-776); it was walked back on a partial observation
("overreached", :802-823) and the patching went on thirteen more hours.

**Signals before the pivot.** Six client patches on five branches in 45 hours
(4cb2082e, 4f13fa50, 21f8e49d and 4f74c3e1 merged as m2-hands, 25e38e2f on
m2-firebolt, 9795d9bd on m2-hands-exit), f0e4f073 on m2-breath beside them;
ADR-032 retired m2-hands' held start and the other three branches died
(DECISIONS.md:1063). One question re-answered: the cast's hand five times
(40d15f6d, 0f4e3b75, 965cf222, e75ee5c8, c7d49cc0), the moment a figure takes a
start eleven times, the last a930968b. Two code shapes for one question (a held
start for concentration, the want first for fire-and-forget, 25e38e2f). Probes
rewritten to find a moment that works (x-figure-cast 1 to 4, ending in "no
script sends a fire-and-forget start at a moment the graph takes it",
spell-cast.md:902-907). The words: "a candidate, kept on this branch until",
"the interim", "stopgap" (:1002). The owner: "there's gotta be a more wholistic
approach than one element of a thing at a time" (DECISIONS.md:882); "something
about how we're doing animations overall is a little iffy" (spell-cast.md:894).

**Pivot and cost.** A whole read with playtest eighteen's findings as its
questions found one cause; "the figure plays the caster's actions" (ADR-032) was
approved at 21:00, built and merged in under five hours (0d69f6fe to e75ee5c8;
LOG.md:1338, :1364). A smaller second instance followed inside it: a timer stood
in for the graph's handshake ("every test only half works", LOG.md:1413), closed
in ten hours by nine commits and three hook attempts (34bdf0c3 crashed, 5df863fd
never fired, a930968b took 49 of 49). Cost: 45 hours and three playtests on the
wrong layer against five hours for the pivot; three days from playtest fourteen
to every hands item ticked (LOG.md:1581). The lesson became ADR-031 (inventory
first, cut at the number, diff against the engine alone), ADR-033 (sequence
tables; the engine's handshake over a measured constant) and ADR-034.

## Part 2. The signals in the NPC work (2026-10-21 to 10-26)

Scale: 140 fork commits since M2's close, 86 of them from fb6f3f09 to train-50
in 74 hours; seventeen trains (34 to 50); five playtests (30 to 34). My reading
of the 86: about 24 build decided features, about 37 fix built behaviour (a
dozen of those re-fix a fix from the same window or replace a premise found
wrong), about 25 are CI, test and lab tooling.

**1. A mirror at the wrong layer: yes, two firm, one HYPOTHESIS.**
- (a) Puppets are animated by relayed graph events through
  Debug.sendAnimationEvent (m3-train-50 sync/animation.ts:212;
  npc-puppet.md:482), the layer cast-action left. ADR-035 point 5 put NPC
  actions on the action replay (DECISIONS.md:1296); its verb, npc-stream, is a
  DRAFT with every box open (npc-stream.md:730-760), and the PerformAction hook
  reads the player alone (FridaHooks.cpp:461). Symptoms are patched one at a
  time: locomotion events relayed for NPCs (b6dd852b) "arrived but changed
  nothing" (animation.ts:305); a refused chair exit answered with
  IdleForceDefaultState, itself HYPOTHESIS (786a029d; animation.ts:394-411);
  bow animations on one screen and jerky sitting (LOG.md:2438). Unmet so far: a
  hosted NPC's hand-cast events are dropped at the relay's source
  (animation.ts:321) while its casts still go out (magicSyncService.ts:82-84), so
  a puppet mage casts with no hand animation by either channel (code read,
  HYPOTHESIS). Rule C names the right layer, the graph "fed the host's inputs"
  (npc-puppet.md:79-83); the code meets it for locomotion alone.
- (b) Deaths are cut at the event. Every viewed actor, the host's residents
  included, carries the engine's deferred kill (formView.ts:400; npc-fate.md:112,
  "no isMine gate"): the habit ADR-031 named ("The suppressions cut events, not
  numbers", DECISIONS.md:903; "Cut at the number", :947) and an exception to
  ADR-045's Rule A (:2352). The compensations followed: the clamp and one-percent
  floor (ac557132, d40d4fa6), a twice-a-second health poll in place of the
  engine's death event because "deathStart was the wrong ear" (6cdc2b35;
  npc-fate.md:1040), the kill mark's expiry (c5faa067), the life mirror
  (61ffa74e), resurrectActor (5ee047df). Eli asked first for the structural
  answer: "what's stopping it from being as simple as 'npc's health hits 0, by
  any damage. that death propagats?'" (DECISIONS.md:2532).
- (c) HYPOTHESIS: the cell is the unit of authority (TES3MP's layer,
  DECISIONS.md:1261) while Skyrim tracks these actors one by one: persistent
  references answer GetParentCell with the worldspace's persistent cell
  (:2307-2308), residents are placed indoors and walk out (LOG.md:2244),
  cellAttach never fires for them (69958274), the engine loads 5x5 against the
  server's 3x3 (LOG.md:2248). Each fact became a per-actor exception (signal 2),
  so the model is now per actor with a cell default, reached by patch. ADR-035
  itself cites the per-object primary copy as the general model (Bharambe, Pang
  and Seshan, "Colyseus", NSDI 2006, DECISIONS.md:1337; accessible: G. Fiedler,
  "Networked Physics in Virtual Reality", gafferongames.com, 2018).

**2. Fixes that re-open one question: yes.** "Which game simulates this actor,
and does every game know" re-answered in more than twenty commits since 10-21
(7fef1bec, ad1f2356, 8785d34e, 69958274, 89c35590, 1e4a5cd6, 8dc3b974,
a5e431e2, a146ee0c then 3d103426 then 856fed7d, 53432d22, 9b412a10, f70cf19f
among them). The roll's site moved after each falsification (1a3a91c4,
962fc913, 227f9c18); the puppet's activation block took three tries (8eafa85d,
7e59c32c, 8785d34e).

**3. Growing known-limit lists: yes, partly scope.** Thirty found one thing,
the spin; thirty-two five fixes and nine rows (LOG.md:2275), thirty-four about fifteen
items and seven decisions, D18 to D24 (LOG.md:2436-2467). Each playtest also
reached further, so part of the growth is scope (HYPOTHESIS on the split). Rows
deferred to the unbuilt npc-stream accumulate.

**4. Probes rewritten to make a claim hold: in volume, different in kind.**
x-npc-talk-prompt took seven versions (LOG.md:2279), x-handoff-door six; most
reds were the lab's world (rival wolves, god mode lost at a restart), where
casting's rewrites hunted a working moment for one mechanism. But committed
claims moved too: eight claim changes to NPC scenarios in four days (cf72f4f,
3ce1173, a619494, f72acb9, 17a0bb1, dee5efe, d0c20e6, 4960604), several
widening a bound or a claim, all self-approved, each with a measured reason.

**5. Two code shapes for one question: yes.** The cell grant beside the
per-actor word, follow and pass; engine references beside PlaceAtMe copies for
server-made NPCs, which alone produced three defects on 10-25 (fe1ee08f,
fdd0b123, 89f8a9ef); the numbered death beside the host's report and its poll;
the fate's ahead pin beside its late path (D23's invisible NPCs came from the
late one).

**6. The owner's doubt: yes.** "the whole thing is contingent on that working
presumably yes?" (LOG.md:2227); "take some time to really deep dive" (:2223);
"stuff is janky enough" (:2248); "weird" (:2275); "for D6, i dont love A"
(:2287); "Hold until built" (:2375); D24, "I feel like there's a more direct
fix" (:2485); and the question that opened this review.

**7. Measured facts against the premise: yes, absorbed as exceptions.** Besides
1(c): H2 "CONFIRMED" then "an over-read" (npc-puppet.md:827, :841); the engine
re-rolls at every load (DECISIONS.md:2732); the trap evidence "could never fire"
(decisions-for-playtest-34.md:41). This is the casting shape after its
Correction: the contradiction becomes a case split and the method stays.

**8. (new) The casting era's safeguards were skipped.** No NPC reference is
committed (lab/references holds the fifteen M2 traces), p-spell-bolt is the only
parity scenario, npc-puppet's ADR-033 box is ticked (npc-puppet.md:1264) over a
sequence table with an empty result column (:114-122), and npc-fate merged with
its inventory, parity and sequence boxes open (npc-fate.md:1608, :1616-1617) and
its reference "owed before the build" never recorded (:98-102). ADR-033's
diagnosis, "Every failure lived in a dimension the method had not asked about"
(DECISIONS.md:1085), fits playtests 31 to 34.

**Not the pattern.** Much of the volume is owed under any model: decided
features (D1 to D24), legacy defects NPCs exposed (54df2a42, 7cb7db42, fa8809a1,
757066f3), a quit crash two plugins cause (LOG.md:2478-2480). Where the casting
lesson was used it converged in hours: locomotion moved to the engine's own data
channel (a9c43bf0), the stride on film the same afternoon (LOG.md:2250-2252);
the roll pinned at the engine's own sites; the roster on ProcessLists.

## VERDICT: MATCH, in named places rather than across the whole NPC effort

The wrong-layer commitments: (1) the puppet's presentation on the graph-event
relay, the casting precedent's own wrong layer, with ADR-035 point 5's action
replay designed in npc-stream and never built; (2) the death authority enforced
by suppressing the engine's death event on every seat, the host's included,
against ADR-031's cut-at-the-number rule; and, HYPOTHESIS, (3) the cell as the
unit of simulation authority, which the fixes are converting into per-actor
ownership one exception at a time. The precedent's remedy was a whole read with
the playtest findings as its questions, then the engine's own entry; its pivot
cost five hours against a forty-five-hour detour.

## B. The patch history of trains 34 to 50 (verdict: not the casting problem at the design layer; two seams patched the casting way at the implementation layer)

Reviewer B classified the 86 fork commits from fb6f3f09 (train-33's parity)
to train-50: (i) a designed slice built, (ii) a defect in a sound design, (iii)
a workaround for a structural flaw, (iv) lab, CI and test work. Its full table
is in the session's scratchpad (review-b-patch-history.md); the counts, the
trend, the clusters and the verdict follow.

### Counts and trend


83 NPC-related commits: (i) 23, (ii) 30, (iii) 6 plus 1 outside the model, (iv) 23. Of the 60 product commits, 38 percent build a designed slice, 50 percent fix a defect, 10 percent bend. Every (i) traces to an ADR or a memo letter.

| day | (i) | (ii) | (iii) | (iv) |
|---|---|---|---|---|
| 10-22 | 0 | 6 | 0 | 1 |
| 10-23 | 15 | 14 | 3 | 17 |
| 10-24 | 5 | 6 | 2 | 3 |
| 10-25 | 3 | 4 | 1, plus 1 external | 2 |

| cluster | (i) | (ii) | (iii) | reading |
|---|---|---|---|---|
| C1 who simulates, server | 7 | 1 | 0 | edges |
| C5 the roll | 6 | 5 | 0 | edges |
| C6 deaths | 7 | 3 | 1 | edges, one seam |
| C7 activations | 0 | 4 | 0 | edges of an undeclared rung |
| D display | 0 | 2 | 0 | edges |
| C2 puppet state, client | 0 | 8 | 1 | papered over (and 7e59c32c, iv) |
| C3 view lifecycle | 1 | 3 | 3 | papered over, contained |
| C4 inherited shapes | 2 | 4 | 1 | papered over, converging |

Trend. The (iii)s are present and flat, not growing: 0, 3, 2, 1 by day, or 0 of 6, 3 of 32, 2 of 13 and 1 of 8 product commits. The three of 10-23 are one evening's door chain (C3), quiet since D6 was proven at 20:00 PDT (LOG.md:2319); the later three sit on three separate seams. The (ii)s fall after 10-23's peak (6, 14, 6, 4) and the (i)s are front-loaded (trains 39 to 43 built on 10-23), so what remains is defects and letters, not unbuilt design. What does not fall is recurrence: C2 and C4 have findings in every playtest of the range (32, LOG.md:2275; 33, :2281; 34, :2436 to :2449) and in the gates between.

## Clusters

C1, who simulates, on the server: 206190dc, 2b14f213, f88cd50d, cf8b6007, 89c35590, e4474bcf, 53432d22, 9b412a10. A model finding its edges. Every rule was a memo letter before it was code (D6, D9, D10, D12, D18), all of it lives in one table (wire-rules cells.rs) behind one question (simulator_of), each rule has its T0 and a committed T3, and the one (ii) is a threshold refined by its own measurement. It is the general shape of per-object authority migrated between machines [Roblox; Colyseus]. No structural change needed; D7's damping and D8's keyframe are designed and unbuilt. One interaction was foreseeable: D10's cold start by ring splits neighbouring cells between players by design, which made common the D9 crossing that playtest 34 hit (LOG.md:2436) while ADR-047 had left D9 to a second slice.

C2, who simulates, on the client: 8eafa85d, 7e59c32c, 8785d34e, 69958274, 32dffbda, 5ee047df, a146ee0c, 3d103426, 856fed7d, f70cf19f, and 227f9c18's promote half. Defects of one kind on four consecutive days, across playtests 32 and 33, gate 43's night scenario and playtest 34: a path sets or clears part of the puppet bundle (the AI bit, the native flag, the activation block, look-at and head tracking, the tracked set) under a condition another path does not check (no 3D, dead, resurrecting, who may report). Each is a (ii); together they are the owner's pattern, at the implementation layer. The rule they converge on fits one line: AI off exactly when the actor is loaded here, is not this game's by the server's word, and is alive or a blocked body. It is spread over about eight entry points: puppetService.ts:41-80 (two polls), :125, :161, :206, :232, :255, FateApi.cpp's resurrectActor and PuppetApi.cpp's no-3D branch; the file's header still says the switch is the cell's grant alone (puppetService.ts:12), the rule ADR-045 revised to the word per actor (DECISIONS.md:2297-2311). Two of these patches composed into playtest 34's invisible, detecting bandits: the late re-roll dropped the 3D and 856fed7d's rule read "no 3D" as "not loaded here" and released ten of thirteen live (decisions-after-playtest-34.md:110-124). Retiring change: one reconciler per actor, the desired state computed in one function from (word, loaded here, dead, kind) and applied idempotently from every event and one poll, "loaded here" read from the actor's cell being attached rather than its 3D, the native side exposing primitives only; the control-loop shape [K8s; Borg]. HYPOTHESIS that it would have prevented the D11 triple and D23's blind promote. Separately, 856fed7d changed who simulates an unloaded actor (every engine's low-process schedule, the host's roster reconciling), which ADR-035 points 4 and 8 rule otherwise; it lives only in a verb doc amendment and needs an ADR.

C3, engine references under SkyMP's view lifecycle: b1aa119e, c60ab674, 8dc3b974, 10375935, 720f9a53, acaf4b34, a5e431e2. Papered over, but contained: six commits from 16:44 to 19:36 PDT on 10-23, no product commit since. SkyMP builds a view at the subscription and destroys it at the unsubscribe, a copy's lifecycle; an engine reference outlives every subscription, so a hosted cell change needs the viewer's move sent ahead of its own DestroyActor (8dc3b974) and the lookup done at message time (acaf4b34, a5e431e2). The residue stays: the Teleport-ahead ordering in ActionListener, and FOLLOW_SETTLE_MS, whose comment still blames a stale or reordered sample (cells.rs:32-39) for a flip-back that acaf4b34 traced to the host's own view moving its actor, a Rule A breach c60ab674 introduced. Retiring change: an engine reference's binding kept for the session, keyed by form id, the subscription governing only the stream and the word; leaving the grid then means "no word", which C2's rule turns into a puppet or a release. HYPOTHESIS; the ordering trick and the settle window would have no job.

C4, inherited shapes: dc6e3adb (a player's appearance read for an NPC's race), 8eafa85d, ac557132 and d40d4fa6 (the figure's per-sample block, health step and sample death on puppets), d2003056 (SPID on figures), fe1ee08f (the players' 25 s respawn on server-made NPCs), c7c389af and fdd0b123 (a hosted copy dressed from its base's own roll), 89f8a9ef (the 25 s respawn re-enabling a disabled actor), and the deferred kill under C6. Each is a behavior SkyMP built for players or their copies that reached NPCs by default and was carved out when a playtest found it; formView.ts tests the id range eleven times (:89, :143, :157, :207, :418, :431, :558, :578, :655, :778, :786). A structural flaw papered over, though converging (fe1ee08f keys the respawn once on "not a player"). Retiring change: an NPC path of its own: on the client an NPC view apart from the figure's; on the server the NPC rules keyed once on "not a player"; a server-made NPC as a fated actor whose engine reference the client makes by PlaceAtMe instead of finding, so D17's pin, D19's hands, the death and respawn rules and D21 are one rule set. HYPOTHESIS; the one new mechanism is a fate keyed before PlaceAtMe returns.

C5, the roll pushed into the engine: a891e6a6, 818287c3, 8535e336, 510f190c, 1a3a91c4, 0a10f977, 3aabd51e, 962fc913, 7ec13787, e3b39ac8, 227f9c18. A model finding its edges, and the casting lesson applied: the server's answer goes in at the engine's own decision (the roll's out array, 8535e336; the outfit resolver's entries tagged through the engine's own setter, 1a3a91c4; the container adder, after which "the engine's dresser equips the server's weapon as its own best pick, so no forced equip", 962fc913), and the engine produces the consequences. Its (ii)s are a static site the lab corrected as rule 2 expects, an ordering, a thread context and a Papyrus answer; species and the whole worn set held at T3 within ten hours (LOG.md:2335, :2352). Residue: the late path for a fate that arrives after the engine rolled, accepted as "one pop" (DECISIONS.md:2714) with the base compare owed (npc-fate.md:999-1000). No structural change for the method; the late path shrinks toward the respawn alone if fates reach the client before the engine's roll in more cases (an interior's at its door, a login's at connect). HYPOTHESIS.

C6, deaths: 645f9344, 95abf0dc, d908abca, 1d09fa04, 61ffa74e, 597bb9dc, dd285ad9, 6e827918, c5faa067, 154ca7d4, 6cdc2b35. Built to ADR-048 B's letter and green at T3 (b-npc-death-report, LOG.md:2401). One seam: every view starts the engine's deferred kill on its actor, the host's own included (formView.ts:398-400, its comment still about the figure), so the first report listened for an event that cannot fire (6e827918), the report now polls the floor (6cdc2b35) and filters the server's own kills with a 10 s mark (c5faa067). Retiring change: for actors this game simulates, the engine's zero crossing caught natively in place of the poll, or the deferred kill lifted on the host and a refused report answered by a resurrect; an ADR call, since it is Rule A's declared exception (npc-fate.md:113). HYPOTHESIS.

C7, the player's activation pipeline on NPCs: 1db977ed, 1e4a5cd6, 91690a6d, aaafffe5, with 154ca7d4 and f70cf19f beside them. The client blocks an actor's activation and waits for the server's reply, the player's shape, and each object type was decided when found (a reply routed to the host, a door teleported past the verdict and now bounced back as a snippet, a body's occupancy). cell-host.md:313-328 describes a hosted actor's activation as reported and recorded but declares no rung for it. Edges of an undeclared rung, cheap to retire: the rung declared once (R2 for a door or furniture the host's engine uses, not blocked on the host; R0 where shared state moves: containers, bodies, locks), after which the bounce has no job. HYPOTHESIS.

D, a puppet's display: fb6f3f09 and 8074833a. Small; the one bend is the speed heuristic in place of the turn input (movementApply.ts:137).

## Verdict

Not the casting problem. The history reads as a sound model finishing its cases in C1, C5, C6, C7 and D, with two seams (C2 and C4) patched the casting way at a smaller scale and at the implementation layer, and one bend (C3) contained.

The evidence that decides it:
1. No method was replaced, and none is shown incapable. Every fix keeps the ADRs' shapes: the cell host (ADR-035), AI-off engine references under the server's word per actor (ADR-045), the server's roll on every engine (ADR-046, ADR-049), the boundary rules (ADR-047), the checked death report (ADR-048 B). The casting stretch ended with its method replaced: about ten commits patched the figure's replay of the caster's graph events (40d15f6d on 10-11 through 9795d9bd on 10-14, one self-described as "a candidate", another as "the interim"), three branches died (LOG.md:1282-1283), and the fix was a different method, the caster's actions replayed through the engine's PerformAction (0d69f6fe, 3f8d8f77): inputs, not outputs [AoE; Fiedler]. Nothing in trains 34 to 50 is an engine refusing what we feed it, the way the figure's graph refused relayed events.
2. Where the NPC work faced that choice it took the input side: the locomotion feed writes the engine's own process data (a9c43bf0, train-33, LOG.md:2274), the roll answers the engine's own roll (C5), and npc-stream plans NPC actions as UpdateAction through cast-action's PerformAction hook (npc-stream.md:48, :184).
3. The (iii)s are 6 of 60 product commits and flat, every (i) traces to a decision, and the chains converge to T3 greens that stay green (C3's six commits in one evening; C5's pin and outfit in ten hours; C6's report in three commits).
4. What recurs is C2 and C4, in all three playtests; each finding is a missing path or an inherited default in code that has one rule to state, not an engine-level impossibility. Two such patches composed into playtest 34's invisible bandits, which is how scattered transitions fail.
5. One decision entered by patch: 856fed7d's release makes every engine simulate an unloaded actor's schedule, against ADR-035 points 4 and 8, with no ADR. That is the owner's fear in miniature; it should be written as a decision.

Two process notes. Two visible defects were facts written before the builds that missed them: the re-roll's 3D drop (re-npc-roll.md:51-52, e71db41 at 10-23 14:33, before 8535e336 at 15:23; found as D23) and the deferred kill on the host's own actors (npc-fate.md:112, thuum 5358d3d on 10-22, before 6e827918 on 10-24; found by the fall probe). And one lab artifact steered the product: 7e59c32c removed a correct call over a mod's box and reopened playtest 33's stuck dialogue.

What would move the verdict toward the owner's fear: a finding that needs a change to what a puppet is (AI off at one gate, fed the engine's own inputs) or to where the roll is imposed (the engine's roll sites), or C2 and C4 findings that persist after the reconciler and the NPC path exist.

The structural changes, ranked by the evidence: one reconciler for the client's puppet state (C2); one NPC path apart from the figure's, with server-made NPCs fated (C4); engine-reference bindings kept for the session (C3); D11's release written as an ADR; the NPC activation rung declared (C7); the deferred kill on the host's own actors decided (C6).



## Synthesis (01:43 PDT)

The three reviewers read without each other and without me. They disagree in
emphasis (A says GAPS, B says not the casting problem at the design layer, C
says MATCH in named places) and converge on the specifics:

1. **The core is sound and is the prior art's.** One engine simulates an NPC;
   every other engine shows the engine's own reference with its AI off at one
   gate and its graph fed from the host; cells go to the first loader with a
   grace and an epoch; a body is the server's container; respawn runs on the
   server's clock. The fixes there (the echo, the bench, the stale, dead and
   quitting host, the pass at a crossing) are missing cases, all written as
   letters before they were code, and B's workaround count is flat (0, 3, 2, 1
   by day). Nothing here is an engine refusing what we feed it, which is what
   the casting detour looked like.

2. **Three commitments are the casting shape**, a mirror at the wrong layer
   that then needs one patch per symptom, and two of them have one root.
   - **Presentation and actions.** A puppet is animated by replaying the
     host's graph events (sync/animation.ts:212), the layer cast-action left
     for the engine's own action entry. ADR-035 point 5 put NPC actions on the
     action replay; its verb, npc-stream, is a draft with every box open; the
     PerformAction hook reads the player alone (FridaHooks.cpp:461), so a
     hosted NPC's hand-cast events are dropped at the relay's source
     (animation.ts:321) and a puppet mage would cast with no hand animation
     (C's code read, HYPOTHESIS, no probe yet). Bows on one screen, jerky
     sitting and the refused chair exit are its symptoms.
   - **Deaths.** The engine that simulates an NPC has its own death blocked on
     every seat, the host's included (formView.ts:397-401), and the server
     rebuilds deaths one cause at a time: the floor, the 500 ms poll because
     deathStart cannot fire, the kill mark's expiry, the trap evidence, the
     causes bear traps and oil still miss. ADR-031 named this habit ("the
     suppressions cut events, not numbers") and Eli asked for the simple shape
     first (DECISIONS.md:2532).
   - **Identity.** The server's own leveled roll is pinned into the engine one
     category at a time (species, outfit, weapons, a late re-roll that dropped
     thirteen NPCs' 3D), server-made NPCs are outside it (three defects on
     10-25 alone), ammo, gold and the sleep outfit stay each engine's own. A
     says restructure (the first simulating engine resolves the actor whole
     and reports it; the server stores and pushes; one pin site); B says the
     pin is the casting lesson applied (the server's answer goes in at the
     engine's own roll sites) and the gap is the server-made NPC and the late
     path. I read it B's way for the method and A's way for the gap: the roll
     stays the server's (ADR-046, ADR-049, Eli's D2), and the duality closes by
     fating server-made NPCs through the same path, which also retires the
     once-dress (D19) and the weapon mismatch (E_HIT_WEAPON).
   - **The root of the first two:** npc-stream, the host's stream of its
     actors' actions, equipment and values, ordered third by ADR-035 and never
     built. Handoff and fate were built around its absence, which is why the
     fate pins equipment and the death report polls health.

3. **Ownership** (A's first risk, C's HYPOTHESIS): the simulator is derived
   from the record's cell while Skyrim's actors leave their cells, and the
   five days of fixes (the word, the roster, the follow and door follow, the
   settle window, the pass, the listener pin, the release of unloaded puppets)
   are per-actor ownership written as exceptions to the cell. B reads the
   server's table as a model finding its edges (one table, one question, every
   rule a letter first) and the CLIENT's puppet state as the seam: one rule
   ("AI off exactly when the actor is loaded here, is not this game's by the
   word, and is alive or a blocked body") spread over about eight entry points
   (puppetService.ts:41-80, :125, :161, :206, :232, :255; FateApi.cpp's
   resurrectActor; PuppetApi.cpp's no-3D branch), with the same kind of defect
   in every playtest of the range, two of which composed into playtest 34's
   invisible bandits. Both agree on the client: one reconciler computing each
   actor's puppet state from (word, loaded here, dead, kind) and applying it
   idempotently from every event and one poll. A's server-side owner table
   (actor to player, epoch, since; claim, pass, relinquish, reassign) is the
   right shape for the cases ahead (followers, mounts, dragons, summons) and
   fences a pass with an epoch where today a 1 s window stands in; it is not
   needed to close any case open now.

4. **Inherited shapes** (B's C4, A's duality 4): SkyMP's behavior for players
   and their copies reaches NPCs by default and is carved out one playtest at
   a time (formView.ts tests the id range eleven times; "a server-made NPC is
   an NPC on the server and a figure on the client"). The fix is an NPC path
   of its own: an NPC view apart from the figure's on the client, the NPC rules
   keyed once on "not a player" on the server (fe1ee08f began it), server-made
   NPCs fated.

5. **Process.** The casting era's safeguards were skipped for this verb set
   (C): no NPC reference trace is committed, npc-puppet's ADR-033 box is ticked
   over a sequence table with an empty result column, npc-fate merged with its
   inventory, parity and sequence boxes open. Two visible defects were facts
   already written in the research before the builds that missed them (the
   re-roll's 3D drop, the deferred kill on the host's own actors). One decision
   entered by patch with no ADR (856fed7d: every engine runs an unloaded
   actor's schedule, against ADR-035 points 4 and 8). And a lab artifact once
   steered the product (7e59c32c).

**So the answer to the question is: partly, in named places.** The model is
not wrong and nothing shows it incapable; but three commitments are the
casting shape, and the recent fixes in those places (the once-dress, the
health poll, the kill mark, the late reload, the eighth puppet entry point)
are the patches a wrong layer produces. The casting remedy was one read of
the engine with the playtest findings as the questions, then the engine's own
entry; it cost five hours against a forty-five-hour detour. The same remedy
applies here, in the order the root suggests.

## Recommendation (Eli decides)

Not "decidedly on the correct path", so the stack does not stage as the next
step. The proposal, as an ADR-050 "NPCs through the engine's own entries":

1. **npc-stream first** (the root). The host captures its hosted actors'
   BGSActions (the PerformAction hook extended from the player to the actors
   this game simulates) and streams them as UpdateAction, which a puppet
   performs through cast-action's existing replay; the graph-event relay is
   retired for puppets (locomotion stays on the native Speed and Direction
   feed, train-33's). Equipment, values and health ride HostedActorState under
   the hold rule the draft already states. Rough size: two days of agent work
   plus the lab's reads; the verb doc exists.
2. **Deaths by the engine** (ADR-031 point 3 for NPCs). The server keeps every
   number a player deals or takes (ADR-028 stands) and delivers that number to
   the simulating host as a cause through the engine's own hit path (the RE
   read owed since ADR-031); the host's engine reacts and dies by itself; the
   deferred kill stays on puppets only; the host's death report keeps ADR-048
   B's checks and a refusal is corrected through the respawn path; the 500 ms
   poll retires. One day plus one RE read plus an ADR on ADR-048's mechanism
   (its trust choice untouched).
3. **One NPC path.** Server-made NPCs fated through the same roll and pin as
   game-file actors (a fate keyed before PlaceAtMe returns), which retires the
   once-dress and E_HIT_WEAPON; the client's puppet state in one reconciler
   with one poll, "loaded here" read from the cell's attach rather than the
   3D; the NPC rules keyed once on "not a player"; engine-reference bindings
   kept for the session; the NPC activation rung declared (R2 for a door or
   furniture the host's engine uses, R0 where shared state moves); D11's
   release written as an ADR. About a day.
4. **The owner table with per-actor epochs** written as an ADR now, built when
   the first case needs it (followers, mounts, dragons), not before.
5. **The safeguards back on** before the next playtest: an NPC reference trace
   committed (ADR-031's diff against the engine alone), the sequence tables'
   result columns filled from runs, no verb merged with its boxes open.

**What this means for the built-ahead trains.** Merge, on your word, what
survives under any model: from 47 the body's inventory as a diff alone, the
late fate's 3D reload (the late seat exists under any pin) and the puppet's
own activation not forwarded; from 48 the dead host (D18-B) and the disabled
death (D21-B). Hold the hosted copy's once-dress (D19-B): it is correct play
now, but it is another id-range exception of the C4 kind and item 3 retires
it; if the pivot is weeks rather than days, merge it as the stopgap it is.
D20-B (the refused looter told) is a small server line that fits any model.
D24 waits on the solo read (below).

**What it costs.** About four to five days of agent work and lab before the
next playtest, against continuing to patch. The casting precedent's numbers
are the argument: 45 hours of patches and three playtests on the wrong layer,
then five hours to the right one.

**D24, the quit crash, closed by the four reads (01:44 PDT).** Each of the two
plugins (NextGenDecapitations, DeathDropOverhaul) alone holds one static
reference to the Loading Menu and alone crashes the quit in the Scaleform
teardown (081617, 082111); with both out that crash is gone and a second
crash in the world teardown remains, connected (022931), connected with our
puppet and fate detours off (082607), and with no skymp5-client in the game
at all (083649, the solo boot), carrying the same dynamic actor 0xff000d26 on
its stack each time, which no client of ours made. Neither crash is ours. A
direct fix would patch other plugins' or the engine's teardown; the fast exit
built on train-49 (D24-B) skips both, with the plugins' leak reported upstream
(D24-D) beside it. That is the recommendation for D24, with the facts Eli
asked for.
