# M3 closeout: the set whose ticks close the milestone

Written 22:26 PST 2026-11-01 on Eli's correction of the weekend summary ("you called M3 closed, im accepting it closed as far as
building goes, but it still needs to be closed as of testing"). M3's building ended 2026-10-31 01:31 PDT when the exit's last
item, a guest's loot of a released body, went green and m3-guest-loot merged (fork parity d10789f7); PLAN.md's M3 header now
says BUILT. The rule, as M2 set it (docs/M2-CLOSE.md): the milestone is DONE when every T4 row below is ticked in a playtest
report of Eli's, on the merged base or a stage with the same content. Anything a sitting finds is fixed on a train or
carried to M4 by name, in this file, before the word DONE is used. A T4 row is a yes or a no, not a feel.

## 1. The scenarios (T3, already green)

The M3 set as the lab runs it, every row green on the merged base at the last gate that touched it (the always set runs
with each; lab/gate.yaml's `pending` names any row waiting on a fix, none of these tonight):

| scenario | state |
| --- | --- |
| b-body-loot | green at T3 on the merged base (lab/gate.yaml; pending rows excepted) |
| b-cell-host | green at T3 on the merged base (lab/gate.yaml; pending rows excepted) |
| b-host-kill | green at T3 on the merged base (lab/gate.yaml; pending rows excepted) |
| b-host-own-hit | green at T3 on the merged base (lab/gate.yaml; pending rows excepted) |
| b-host-quit | green at T3 on the merged base (lab/gate.yaml; pending rows excepted) |
| b-npc-archer | green at T3 on the merged base (lab/gate.yaml; pending rows excepted) |
| b-npc-body-release | green at T3 on the merged base (lab/gate.yaml; pending rows excepted) |
| b-npc-caster | green at T3 on the merged base (lab/gate.yaml; pending rows excepted) |
| b-npc-copy-fate | green at T3 on the merged base (lab/gate.yaml; pending rows excepted) |
| b-npc-death | green at T3 on the merged base (lab/gate.yaml; pending rows excepted) |
| b-npc-death-blow | green at T3 on the merged base (lab/gate.yaml; pending rows excepted) |
| b-npc-death-engine | green at T3 on the merged base (lab/gate.yaml; pending rows excepted) |
| b-npc-death-guest | green at T3 on the merged base (lab/gate.yaml; pending rows excepted) |
| b-npc-death-report | green at T3 on the merged base (lab/gate.yaml; pending rows excepted) |
| b-npc-handoff-cross | green at T3 on the merged base (lab/gate.yaml; pending rows excepted) |
| b-npc-handoff-door | green at T3 on the merged base (lab/gate.yaml; pending rows excepted) |
| b-npc-handoff-night | green at T3 on the merged base (lab/gate.yaml; pending rows excepted) |
| b-npc-handoff-restart | green at T3 on the merged base (lab/gate.yaml; pending rows excepted) |
| b-npc-headshot-host | green at T3 on the merged base (lab/gate.yaml; pending rows excepted) |
| b-npc-loot | green at T3 on the merged base (lab/gate.yaml; pending rows excepted) |
| b-npc-protected | green at T3 on the merged base (lab/gate.yaml; pending rows excepted) |
| b-npc-puppet | green at T3 on the merged base (lab/gate.yaml; pending rows excepted) |
| b-npc-respawn | green at T3 on the merged base (lab/gate.yaml; pending rows excepted) |
| b-npc-stream-actions | green at T3 on the merged base (lab/gate.yaml; pending rows excepted) |
| b-npc-stream-equipment | green at T3 on the merged base (lab/gate.yaml; pending rows excepted) |
| b-npc-stream-face | green at T3 on the merged base (lab/gate.yaml; pending rows excepted) |
| b-npc-stream-state | green at T3 on the merged base (lab/gate.yaml; pending rows excepted) |
| b-npc-stream-voice | green at T3 on the merged base (lab/gate.yaml; pending rows excepted) |
| b-npc-talk | green at T3 on the merged base (lab/gate.yaml; pending rows excepted) |
| b-prop-push | green at T3 on the merged base (lab/gate.yaml; pending rows excepted) |
| c-dungeon-enemies | green at T3 on the merged base (lab/gate.yaml; pending rows excepted) |
| c-riverwood | green at T3 on the merged base (lab/gate.yaml; pending rows excepted) |

## 2. The T4 rows (Eli's sittings; test 1 rotfern hosts unless the row says otherwise)

Behaving the same (npc-stream, npc-puppet, cell-host):
- [ ] A cell's NPCs move under their packages on the host's screen and the guest sees the same NPCs in the same places doing
      the same things (Riverwood's residents at their stations, the temple's bandits on their patrol).
- [ ] The guest's puppets do not fight the air, slide, or pop: a puppet attacks, blocks and staggers where the host's actor
      does (b-npc-stream-actions' set of actions, seen by eye).
- [ ] The host leaves the cell and the guest takes it over: the NPCs keep moving within the grace, nobody freezes for long,
      and the roster and the hands are right when the first host returns (npc-handoff; playtest 39's items 2 and 3).
- [ ] A restart mid-cell: the NPCs come back where they were, dead ones dead (b-npc-handoff-restart's world, by eye).

Talking the same (npc-talk, the voice slice):
- [ ] A resident's line is heard and mouthed on both screens when the host talks to it; the guest hears what the host
      hears (not a trade menu opening on both seats: playtest 37's finding, fixed).
- [ ] The guest can open dialogue with a resident in the host's cell and the host hears the lines (the dialogue claim).

Dying the same (npc-fate, death-path):
- [ ] The host kills a bandit: it dies once, on both screens, within a breath; no pop-back of its health bar on either seat.
- [ ] The guest kills the host's bandit: same; the host's actor reacts to the guest's hits.
- [ ] Bodies lie where they died on both screens, and still do after a relaunch; the guest loots a body the host killed
      and the container opens within three seconds (D71, item 7 of the turbo checklist).

Attacking the same (npc-stream's hits; bows and spells):
- [ ] A hosted bandit's melee lands on the guest and on the host; a hosted archer's arrows fly on both screens and hurt;
      a hosted mage's spells cast and land on both screens.

Props (prop-physics, ADR-058 slice one):
- [ ] Push, pass, grab and drop a prop between two seats: it lands in the same place on both; the drop point and the grab
      feel are the engine's (b-prop-* green; Eli's eye for the feel).

## 3. Report

Each sitting that ticks rows is recorded here by date with the build it ran on; the last unticked row names what still
owes. DONE goes into PLAN.md's M3 header only when this section's last entry ticks the last row.

## 4. Carries to M4 by name

Rows found red in a sitting and not fixed on a train before the close are listed here with the finding and the branch.
