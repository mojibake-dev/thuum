# thuum after playtest 41: the root-cause plan

numidium, 2026-11-02 evening. Supersedes the executed 2026-10-13 process audit (its record: ADR-030, ADR-031, LOG).
Eli's calls for this plan (AskUserQuestion, 2026-11-02): freeze the five break-prone systems until each has its engine
model and a two-player test; one short playtest per fixed system.

## Context

Playtest 41 (Turbo 2 arm two, closed 18:30 PST) broke in ways the weekend's gates had called done: the Golden Claw door,
Arvel, the draugr ambush, the spike wall, shared containers, bodies on the guest's screen, reanimation, Hod at the inn
door, a crash in the redress, props worse than at the start. Eli named three faults: features built without knowing
what the engine does underneath; validation that second-guesses the owner's own game; scripting run by an allow-list
when the host should own its cells' scripts. Two more hid and worsened them: the gates never looked at the second
player's screen, and the arm stacked live fixes. ADR-062 (scripts work) and ADR-063 (ownership, not permission) settled
the principles tonight. This plan makes them enforceable, runs the audits they imply, and orders the work.

## Five root causes, with tonight's evidence

1. **Engine unknowns shipped as features.** About 256 HYPOTHESIS tags are open across 59 shipped verb docs; 27 docs tick
   "no HYPOTHESIS tags" anyway; 44 decompiler-only reads are labelled CONFIRMED-STATIC, which is a guess with a source.
   Worse, several of tonight's breakages were never tagged at all: containers.md has 0 tags after three failed redraw
   designs, nothing tags the death sound, and the night lock is absent from locks.md's engine table. The pattern, dated in
   the docs: the static read comes first and is tagged; the runtime check is written "by path" and not run before the
   merge; the next read comes after a playtest breaks (the ContainerMenu redraw on 10-28, the level-up handed to T4 unread
   on 10-31, the redress order tagged 10-28 and never read, tonight). On 10-29 two commits cut npc-puppet's tags from 40
   to 11 and cell-host's from 20 to 3 by relabelling, not by new evidence. ADR-054 decision 3 already says the read comes
   before engine-facing code, but only "where a trace is cheap", nothing enforces it, each read covers one hook, and none
   reads the NON-OWNER's engine. Tonight's six all sit on engine behaviour nobody had confirmed: KillSilent still plays the
   death through its animation (the re-entry sound); equipping an actor with no 3D crashes (c1, 17:51); a promoted copy
   stands at the last relayed pre-door sample (Hod); the engine's own level-up never arms under fXPPerSkillRank 0 (no
   attribute pick); an open ContainerMenu took three redraw designs and none held; the AI's night lock moves a door
   without any Papyrus native. Most share ONE engine path that no doc models: a reference's life on a seat that does
   not own it (load, 3D attach, promote, demote, unload, the dead state applied at load).
2. **Over-validation.** The server can emit 159 distinct E_ codes (union-srv-3 b926a7d4): 114 CONSISTENCY (28 of them the
   wire's shape and rate), 26 OWNER-CHECK, 9 R0-NUMBER, 10 unsure; plus two owner-checks with no code (the snap-back on
   a 4096-unit jump or a cell change, MovementValidation.cpp:123-127; "WorldSpace doesn't match" in
   CheckInteractionAbility, MpObjectReference.cpp:2576). The design law's R1 rung ("host computes, server validates")
   was read as "check the owner". Tonight: E_PROP_CELL and E_PROP_REACH refused the carried bucket; "may not move" refused Sven's
   follow; Raise Wall's slope band. And the converse lesson: retiring the prop checks without writing the arbitration
   that replaces them left nothing deciding who owns a contested prop (13 of 13 claims granted, props thrashed).
3. **Permission by name.** 43 places key behaviour to named content (8 server, 13 client and platform, 16 layer and
   settings lists, 6 scenario steps); 3 have a retirement planned (ADR-062's two, ADR-045's forced aggression, still in
   code). papyrus-admitted.tsv admitted world scripts by name and activationUnblockedBases lifted activation per base;
   every dungeon failed on a name the list lacked (six at Bleak Falls), and the spike wall worked only in scenarios,
   which laid the key at their relaunch, never in play. The same shape waits elsewhere: word walls accept one script
   class and one trigger base (other word-teaching scripts exist in the census); castTeleports names one spell; 4 quests
   are shared by name; one secret-door base and one activator drive every cell's door state; slow time is patched out
   record by record from Skyrim.esm alone; 14 races get forced aggression to stand in for masterAmbushScript.
4. **Gates that cannot see a player's screen** (docs/research/gate-audit-2026-11-02.md): of 73 items PLAN called done,
   20 had no claim on any seat, 51 one case, 2 all; `c1.view(c2)` in 1 of 122 scenarios; both players on one object
   in 4 of 56 rows; 17 of 29 NPC scenarios in god mode; 14 literal `>= 0` claims; 85 of 122 never leave the flat
   strip; 27 docs tick "no HYPOTHESIS tags" with tags open.
5. **Live stacked fixes and overclaiming words.** Three prop changes went to the seats in one arm, none read on two
   seats; DONE and MERGED meant "a narrow scenario passed", and status reports repeated them.

## The plan: five workstreams

### W1. Engine model first (thuum-cf with the re-analyst; numidium runs the traces)

- A doc per engine SYSTEM, `docs/engine/<system>.md`: the engine's own path for a behaviour, from input to every
  consequence, per viewpoint (the owner's engine, a non-owner's, a seat that loads it late), each claim CONFIRMED with
  a run or trace id or HYPOTHESIS. Sources in rule 1's order; the solo reference trace is ADR-031's recorder; the
  two-seat traces are Frida (`just frida`) on both seats. This is a characterization test of the engine: record what
  it actually does before changing anything (accessible: Michael Feathers' "characterization test"; foundational:
  Feathers, *Working Effectively with Legacy Code*, 2004).
- The burden of proof flips, the same inversion as ADR-063's: an engine claim is HYPOTHESIS unless it cites a run or
  trace id. CONFIRMED-STATIC retires as a label (a decompiler read is a hypothesis with a source). The system doc's rows
  come from the reference trace, so every consequence the engine plays is a row, and an unknown cannot hide by never
  being tagged.
- Verb docs cite the system doc's lines in their Engine surface instead of re-deriving a slice of it.
- The stale tags whose probes already ran are settled from their runs first (npc-fate.md:120 and :2426,
  spell-cast.md:1032, shouts.md:180, weather.md:88, and the rest the census names): an afternoon, and it shrinks the
  real list.
- The five frozen systems, in this order:
  1. a reference's life on a seat that does not own it (cell attach and detach, 3D load, promote and demote, the dead
     state applied at load): tonight's crash, Hod, the death sound, the guest's frozen bodies, the headless bandits;
  2. containers and the open menu (how the engine updates an open ContainerMenu; containers.md's Frida plan on
     ContainerMenu::ProcessMessage);
  3. Havok props (motion types, contacts, at rest, what a spell's impulse emits);
  4. progression UI (PlayerSkills' level-up arming, the Stats menu's attribute pick);
  5. state no native reaches (the AI's night lock, a package's door use): ADR-062's H3.
- A frozen system thaws when every player-visible claim in its doc is CONFIRMED on both viewpoints.

### W2. Validate consistency only (thuum-cf writes; numidium merges R0)

- The validator audit, `docs/research/validator-audit-2026-11-03.md`: tonight's census (159 codes, classed, with sites)
  committed as its table. The 26 OWNER-CHECKs, the ten most likely to refuse ordinary two-player play first: E_HIT_REACH,
  E_HIT_CONE, E_MOVE_SPEED (with the codeless snap-back), E_DEATH_UNCHECKED, E_SPELL_RANGE, E_HIT_POWER, E_HIT_WEAPON,
  E_ACTIVATE_REACH, E_CONTAINER_REACH, E_SHOUT_RECOVERY; then E_HIT_SNEAK, E_HIT_BASH, E_HIT_RANGE, E_SPELL_ORIGIN,
  E_SHOT_ORIGIN, E_CONTAINER_CELL, E_CLAIM_REACH, E_LOCK_REACH, E_WORDWALL_CELL and _REACH, E_MARKER_NONE,
  E_EFFECTS_NO_EAT, E_PLACED_RANGE (Raise Wall's band), E_PROP_STEP, E_DEATH_FAR, E_DEATH_IMMORTAL. The 10 unsure
  (E_EQUIP_REFUSED, E_REST_FIGHTING, the policy switches) get a line each. Where a check sits on a hit between two
  players, ADR-063 keeps the server's damage NUMBER (R0) and the audit names whether the hit's acceptance is a
  consistency question or the owner's; those rows go to Eli as one decision memo.
- Each OWNER-CHECK retires with its replacing rule written first: what hand-off it guarded, its tie-break, and a
  two-seat scenario of the collision itself. First the two already in flight: the prop rule (a grab beats a touch; a
  non-owner's contact never takes a moving prop; ownership returns at rest by the owner's own final sample, never by a
  timer) and m3-handoff-settle's door rule (the passing movement sent reliably before the hoster word, a settle window).
  Then the ten above, in order, the codeless "may not move" and snap-back paths with them.
- Done when no OWNER-CHECK row is left and each retirement merged through the gate with its scenario.

### W3. Ownership for scripts and content (thuum-cf; apocrypha for the layer rows)

- ADR-062's slices: 1a BUILT (f08abd57), 1b pushed (9b413fb1), 2 (the record-and-relay rows), 3 (q-golden-claw and
  q-embershard green twice); then papyrus-admitted.tsv's host rows and activationUnblockedBases are deleted.
- The content census, committed as `docs/research/content-census-2026-11-03.md` (43 rows): each list gets the channel or
  ownership rule it stands for (ADR-063 decision 5), riding ADR-062's hooks where one exists (TeachWord for the word
  walls, SetOpen for the secret door, Kill for Finger of Death, ScriptPlacement for Raise Wall, the hosted-cell lift
  for the 18 host rows and the forced aggression); the dormant upstream SweetPie code and the server VM's "Sweet"
  filter are deleted; the 6 scenario premises go with activationUnblockedBases.
- Kept by design, each with a line saying so: the engine's fixed ids, restrictedRaces (Eli's policy), RaceMenu's
  integration, the load order. Everything else on the list is either retired or has a dated reason.
- Done when the census holds only the kept rows.

### W4. Gates that play the game (numidium: grammar and lint; thuum-cf: the claims)

- lab-api grammar first: a container's contents per seat, a client transfer step, the crosshair target, a shout step,
  a two-seat npc_state compare.
- The two-seat contract, checked by a scenario lint in thuum CI (beside docs-lint and scenario-gate in .gitlab-ci.yml,
  using lab/labapi/labapi/scenario.py's parser):
  - every claim can fail: no `>= 0`, and a claim set must go red with the verb's kill switch off (a mutation run of the
    scenario; accessible: "mutation testing"; foundational: DeMillo, Lipton and Sayward, "Hints on Test Data Selection",
    IEEE Computer 11(4), 1978);
  - a verb with a player-visible effect claims both views, `c1.view(c2)` and `c2.view(c1)`, with each seat acting;
  - NPC damage on a player is claimed outside god mode;
  - a relaunch step lays only premises the deploy has.
- The audit's 20 MISSING rows get their claims, the five most likely to break first; the always set gains one
  both-directions two-seat scenario.
- The reviewer is independent of the author. Rule 13's scenario review has been mine since 2026-10-13, and I approved
  c-riverwood's restated claim (0e6215f2), which passed the very case that went red. From now: a scenario commit that
  relaxes or rewrites a claim goes to Eli; any other scenario commit gets a fresh reviewer agent checking it against the
  two-seat contract before the gate runs it.
- Done when the audit, rerun with the same brief, reads 0 MISSING and the lint is green on main.

### W5. Status and playtest discipline (numidium)

- docs-lint gains the box check: a verb doc whose T3 box is ticked while lab/status.py counts open tags fails CI, the
  box's wording dropped or not (13 of the 27 dropped "no HYPOTHESIS tags" from the text); the 27 are unticked in one
  commit with the date and the reason, as VERB.md already asks.
- `just verb-merge` refuses a verb whose doc names a probe with no run id ("by path, unrun") or carries an open tag on a
  player-visible row.
- PLAN's state words are three: VERIFIED IN PLAY (Eli saw it, or a two-seat claim asserted the player's view),
  MECHANISM ONLY, BROKEN; `just status` prints them from the evidence.
- Playtests per Eli's call: one per fixed system, at most eight items, each with its green two-seat run id; in an arm,
  one live change per system, read on two seats first; every seat's logs kept before any relaunch (a per-launch
  console file), since tonight's crash evidence nearly went.
- ADR-064 records W1, W4 and W5 as rules, amending ADR-030, ADR-031, ADR-033 and ADR-054.

## Order

1. Day 1. numidium: tonight's three censuses committed as research docs (validator audit, content census, and the
   engine census as `docs/research/engine-unknowns-2026-11-03.md`); W5's CI checks with their self-tests; ADR-064's
   draft for Eli; W4's grammar begun; ADR-062 slice 1b staged and gated. thuum-cf: the 27 boxes unticked; the stale tags
   settled from their runs; m3-handoff-settle and the prop rule (both in flight).
2. Days 2 to 3. W1 system 1 (the reference's life on a non-owning seat) read and traced, the re-analyst on the static
   half, numidium running the two-seat traces; m3-handoff-settle and the prop rule through the gate with their two-seat
   scenarios; the validator memo on the hit-between-players rows to Eli.
3. Then per frozen system: model, fix, two-seat scenario, that system's playtest (eight items at most). Alongside, not
   frozen: ADR-062's slices 2 and 3, W2's retirements in the order given, W3's census rows as ADR-062's hooks land.

## Verification

- W1: every claim in a system doc cites a run or trace id; a fresh reviewer agent checks each verb doc's Engine surface
  against its system doc before the verb's first lab run.
- W2: the validator audit table with 0 OWNER-CHECK rows; each retirement's collision scenario green twice.
- W3: q-golden-claw and q-embershard green twice; `git grep` for papyrus-admitted and activationUnblockedBases empty in
  the fork's code and lab/layer.
- W4: the audit rerun reads MISSING 0; the lint refuses a planted `>= 0` claim and a planted one-view verb (CI self-test).
- W5: CI goes red on a planted ticked box with an open tag; each per-system playtest's items map to green two-seat runs.
