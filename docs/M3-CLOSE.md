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

## 2. The T4 rows: playtest thirty-nine's eight, on the merged base

The record (22:30 PST 2026-11-01): the last M3 sitting with ticks was thirty-eight (2026-10-29, "basically everything failed in one way or
another", findings 65 to 76), whose findings the pass's trains fixed; thirty-nine (2026-10-30, the pass's own playtest, eight items
drafted in docs/private/playtest-m3-39.md) paused at its first finding before any item (F1, Survival's needs, memo D72) and never
resumed. So every M3 row below is still unticked by human eyes. The items are thirty-nine's, with the three limits it declared now
merged away (D71 the guest's loot, D70 Raise Wall's pose, D68 props): test 1 rotfern, test 2 Prisoner, both screens where it says so.

1. [ ] The found body (findings 65, 73, 74): a dead bandit or skeleton you find, not one you killed. The same items in its loot
       menu on BOTH screens; each of you takes one thing and the other's next open shows it gone; then the seat that does NOT host
       the cell casts Reanimate Corpse at it: it stands within two seconds on both screens and fights, and turns to ash on both when
       the effect ends.
2. [ ] Bodies lie where they died, no T-pose (71; D78: "within a stride" is this row's standard, same-spot bodies are M4's): rotfern kills a bandit; Prisoner relaunches and walks back in: no death sound
       and no fall at the load, the body lying within a stride of where rotfern's screen shows it. Then the other way round.
3. [ ] The roster and the hands (66, 68): rotfern leaves the hall while Prisoner stays (Prisoner's game takes the cell), then walks
       back in: every bandit Prisoner sees stands on rotfern's screen within seconds and rotfern's arrows HIT them; rotfern relaunches
       and fires once on arriving: the bow draws an arrow at the first shot.
4. [ ] Reanimation, both halves (38's item 4): Prisoner casts Reanimate Corpse on a body in a cell rotfern hosts, then rotfern casts
       Dead Thrall on a body in a cell Prisoner hosts; the body stands within two seconds on BOTH screens, walks and fights on both.
5. [ ] NPC reach and cone: a bandit's swing from beyond its reach or from behind takes no health (the bar still moves for swings in
       front and in reach); your swing on a bandit from outside the cone or beyond reach takes none of its health.
6. [ ] Quests, three halves: (a) both seats start outside Riverwood and walk in: A Lovely Letter starts for both; Prisoner relaunches
       and logs in inside: the quest is already there. (b) Prisoner talks to Lucan: The Golden Claw's entry appears in rotfern's
       journal within seconds. (c) a stage set on one seat (numidium's lever, MS10MiscObjPointer 0x10d3bb) shows in the other's journal.
7. [ ] Physics props (ADR-058 slice one, merged 2026-11-01): rotfern drops a basket from the inventory: it lands where Prisoner sees
       it land, within a step; rotfern runs through it: it flies and rests at the SAME spot on both screens, a beat behind on
       Prisoner's, no snap-back; Prisoner kicks it back: it moves on rotfern's screen the same way; a server restart leaves it where it
       rested on both seats. A prop that hangs in the air, jitters or vanishes is the finding; name the screen.
8. [ ] Raise Wall (D74's shape A, merged 2026-10-31): rotfern casts it facing Prisoner across open ground: the wall rises where
       rotfern aimed on BOTH screens and blocks Prisoner there (thirty-nine had it on the caster's screen only, by choice).
9. [ ] The guest's loot (D71, merged 2026-10-31 as M3's exit): the seat that does NOT host the cell loots a bandit the host killed;
       the body opens within three seconds on the guest's screen (the turbo checklist's item 7).
10. [ ] Talking the same (the voice slice; the dialogue claim H-58b was CONFIRMED at T4 on 2026-10-28, "shop worked!"): a resident's
       line is heard and mouthed on both screens when either of you talks to it, and no menu opens on the seat that did not talk.

Bonus reads, a word each, recorded not scored: the atronach's death as the watcher (75: does it fall and explode on the other
screen, or freeze); the "death service is busy" flood after a death (67); the fire cloak of an atronach nobody hit (H-53h); a
resident's face during a line, both screens (H-54c).

## 2b. The paper close

The verb rule ("done at T3 green with no open HYPOTHESIS") is not met on paper either: the pass's inventory of 2026-10-29
(docs/private/hypothesis-inventory-2026-10-29.md) unticked the "no HYPOTHESIS tags" boxes of npc-stream, npc-fate, npc-handoff,
npc-talk and cell-host, and prop-physics' are open since its merge. Its steps 3 and 4 remain: every open tag ends as a named limit,
a Dynamic plan line, or a deletion where the sentence is history; then the boxes read true. This is agent work beside the sittings,
not a thing for human eyes; it closes in this file's section 3 with the sitting that ticks the last row.

## 3. Report

Each sitting that ticks rows is recorded here by date with the build it ran on; the last unticked row names what still
owes. DONE goes into PLAN.md's M3 header only when this section's last entry ticks the last row.

## 4. Carries to M4 by name

Rows found red in a sitting and not fixed on a train before the close are listed here with the finding and the branch.
