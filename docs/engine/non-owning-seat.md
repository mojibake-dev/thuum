# A reference's life on a seat that does not own it: the engine model (W1 system 1)

Written 22:2x PST 2026-11-02 (numidium, the promote rows from the night's lab runs; thuum-cf takes the design from them) under the
root-cause plan's W1 (docs/research/root-cause-plan-2026-11-02.md, "Engine model first") and ADR-064 decisions 1, 2 and 7: a
reference's path on a seat as it gains or loses the simulation (a promotion at a cell grant, a D9 pass or a return; a demotion),
as it loads late, and as its recorded state is applied at load, per viewpoint, each claim CONFIRMED with the run that saw it or
HYPOTHESIS. The system is frozen (ADR-064 decision 7): no code in it reaches a seat until section 5's condition holds. The verb docs
are docs/verbs/npc-handoff.md (D6 follows, D9 passes, D22 the margin, D9's settle), cell-host.md (the grant) and npc-fate.md (the
dead state at load, the redress); they cite these rows (P-, D- numbers) instead of re-deriving them.

The reading rule: a code read or a decompiler read is a hypothesis with a source; a playtest's server log without a run id is a
hypothesis with a witness; a T0 test proves the server's rule, never the engine or the client's placement. Run ids are the lab's.

## 1. Scope and sources

Three viewpoints: (a) the NEW OWNER's game at a promotion (the grantee of a cell, the receiver of a D9 pass, the host a return
names); (b) the OLD OWNER's game at its demotion, and the other seat whose own copy stands on the other side of a door; (c) a seat
that LOADS the reference late (a login, a cell entry, a reconnect, a restart).

The paths in scope: the server's ownership words (UpdateHoster, ActionListener's D9 block, PartOne's grant and its replay of held
sightings, "finding 66"); the client's promote and demote (the fork's skymp5-client puppetService.ts and formView.ts at
m4-turbo2-chest; the promote's placement read by thuum-cf as "the record's last point and heading first", puppetService.ts:134,
2026-11-02 18:4x); the relay's channels (the passing movement unreliable, the hoster word reliable-ordered on channel 0,
wire-transport lib.rs:534); the dead state's apply at load (formView's bind, deathService's KillSilent); npc-fate's redress.

## 2. The claims

### (a) The new owner's game at a promotion

| Row | Claim | State | Evidence |
| --- | --- | --- | --- |
| P1 | At a D9 pass the receiving game is promoted and places its copy at `last`, the last relayed sample, not at the passing report's position, because the passing movement went unreliable after the reliable hoster word; its first report from the old side of the door is judged a pass back | the bounce CONFIRMED; the placement HYPOTHESIS | 20261103-052100 (door 13407: "ff000000 passes 1348a into cell 9731 (D9)" at 05:22:17.325, "ff000001 passes 1348a into cell 133c7" 56 ms later, the pair again at 05:22:31.9, :45.9, 05:23:34.7, :48.6, Hod retrying the door about every 14 s); playtest 41's 02:08:01Z (door 13419, three passes in half a second; a witness, no run id) |
| P2 | At a cell GRANT the grantee's game promotes its copies of the cell's actors from `last` as well; when `last` is a sample relayed from another cell, its first report is judged a pass across, with no door walk | the behaviour CONFIRMED twice; the placement HYPOTHESIS | 20261103-055217 (05:53:42.417 "ff000000 hosts cell 133c7 at epoch 2"; 05:53:42.597 "ff000000 passes 1348a into cell 9732 (D9)"; the door-13407 count 0); 20261103-060106 (06:02:29.120 "ff000001 hosts cell 133c7 at epoch 2"; .158 "ff000001 passes 1348a into cell 9732") |
| P2a | 055217's stale sample: the visiting seat's own brief simulation walked him toward the door ("ff000001 follows 1348a into cell 9713, which nobody hosts (D6)" at 05:53:05.698, then "may not move 1348a to cell 133c7" at .746 and "moves 1348a into cell 133c7, which it hosts" at 05:53:06.767), and that outdoor sample is the one the next grantee promoted from | HYPOTHESIS | the 055217 lines above; the trace R1 decides it |
| P7 | An actor's package choice on the simulating seat can depend on another reference's script state: Hod's sawmill packages carry a condition kGetVMScriptVariable (630, CommonLibSSE-NG TESCondition.h:763) on reference 0x71dfc (Tamriel, (19277.3, -44313.2)) with the string parameter "::ResourceState_var", HodSawmillSawLog8x11 0x1e604 when it equals 2 and HodSawmillLoadLog8x11 0x734ce when it equals 0; the inn package HodSleepingGiant19x3 0x35696 carries none. A seat whose VM holds no state for that script (the mill in a cell another seat hosts; on the parent, a world script the admitted list gates) can choose differently from the record's expectation | the conditions CONFIRMED (the records); the cross-seat effect HYPOTHESIS | Skyrim.esm 1.6.1170 read by lab/esm.py on sky-srv, 2026-11-02 22:3x PST (the CTDA and CIS2 of 0x1e604 and 0x734ce); a test premise should rest on an unconditioned package (the inn's, 19:00) |
| P4 | After a demote and a re-promote within about 40 ms (055217: ff000000 "told to demote" at 05:53:42.599, simulating again at .634) the actor's AI runs (speech idles from ff000000 about once a minute) but its scheduled package does not take it out: Hod's 08:00 sawmill package (HodSawmillSawLog8x11, from 08:00 for 660 min) never walked him out of 0x133c7 in the 400 s that followed (the clock 7.075 at step 23, about 9.3 at the until's end), with no movement or refusal line for 1348a | HYPOTHESIS (the package not re-evaluated at the promote, or the copy pathing from its stale position) | 20261103-055217 (steps 15, 23 and 32; the server log after 05:53:43) |

### (b) The old owner's game, and the other side's copy

| Row | Claim | State | Evidence |
| --- | --- | --- | --- |
| P3 | The seat that just received the actor reports it back from its own copy, which stands on the other side of the door, within tens of milliseconds, and the server judges that a pass the other way: both copies stale, on opposite sides | CONFIRMED (three runs) | 36 ms in 055217 (.597 to .633), 47 ms in 060106 (.158 to .205), 56 ms in 052100 (.325 to .381) |
| P5 | The demoted game turns its copy into a puppet: AI off, combat stopped, keep-offset cleared, activation blocked | CONFIRMED for one actor on one seat; HYPOTHESIS for the door case | playtest 41's c1 skyrim-platform.log, "puppet 847df: AI off, combat stopped, keep-offset cleared, activation blocked" at 17:50:57 PST (results/playtest-41-break3/) |

### (c) A seat that loads the reference late, and the recorded state applied at load

| Row | Claim | State | Evidence |
| --- | --- | --- | --- |
| P6 | A seat that subscribes to an actor after its record moved is created at the record's position: SetPos writes the position before it subscribes the seat, so CreateActor carries it | HYPOTHESIS (a code read) | MpObjectReference.cpp:599-618, :945 (the door scenario v3's review); the leg A precondition of 051454 against 052100 differed for a reason still unexplained (the orientation or the hour) |
| D1 | A dead record applied at a cell re-entry kills the body silently (formView's bind emits silent: true; deathService runs KillSilent), yet the death is heard again at each re-entry | the sound CONFIRMED by ear (a witness); the cause HYPOTHESIS (the kill's animation carries the sound) | playtest 41, Eli: "on a cell reentry i hear their deaths again"; the 2 s animation-event trace on m4-turbo2-chest 59af5508 is the read |
| D2 | npc-fate's redress (AddWornOutfit and the equip path) on an actor whose 3D is not loaded crashes the seat | CONFIRMED by its crash log (a witness) | c1 at 17:51:00 PST 2026-11-02, CrashLogger: EXCEPTION_ACCESS_VIOLATION at SkyrimSE.exe+070DB20 (a null read), Sven 0x13491, an Iron Dagger and outfit 0x9D5DF on the stack, in the second the client un-hosted all 15 Riverwood NPCs (results/playtest-41/c1-crash-2026-11-02-17-51-00.log); the guard in 12f199e6 waits for the 3D, unread in a run |

## 3. What a fix relies on

The three bounces share one cause: a promotion that places the new owner's copy anywhere but the record. ADR-063 decision 3 says a
non-owner renders the owner's results; a promotion is the moment a renderer becomes the simulator, so it must start from the record.
A fix therefore sends the record's position reliably with (or ahead of) every ownership word: a D9 pass (m3-handoff-settle's half
(a) does this for the pass alone), a cell grant (P2: not covered) and a return; and the client's promote places the copy at that
record, not at `last`. Only then is a settle window a safety net for P3. Before it, the settle's half (b) protects any false exit a
promotion makes: in 055217's shape it would drop the report back into 133c7 and leave Hod outdoors, though he never walked out.

## 4. Open reads

- R1 (P1, P2, P2a): a client line at every promote and demote on both seats, naming the placement's source (`last` or the record),
  its cell and position, and the record's cell, read in 052100's, 055217's and 060106's shapes (door v9 and the swap probe v7 by path
  replay them).
- R2 (P4): c1's npc_state of 1348a at 08:05 in 055217's shape (position, aiEnabled, the package field), and a Frida trace of
  Actor::EvaluatePackage at the promote (its id from CommonLibSSE-NG and `just addr`, rule 1).
- R3 (P6): a two-seat read where the second seat loads the cell after the actor moved, its first npc_state position against the
  record.
- R4 (D1): x-npc-death-reentry by path (c1 kills a resident, leaves until the cell is nobody's, returns), with 59af5508's trace of
  the body's animation events around the silent bind kill.
- R5 (D2): a run in which the redress meets an actor with no 3D, its "late fate for <id>: its 3D is not loaded, the redress waits for
  the load" line and no crash.

## 5. Thaw condition

Every player-visible row above CONFIRMED on the viewpoints it names by a run or trace id (R1 to R5), and door v9's claim of no pass
across each grant (b-npc-handoff-door-hosts, thuum main 02420ca6) red on the parent 35509f7a and green twice on a head that imposes
the record at every promotion. Until then nothing in this system merges: m3-handoff-settle stays a branch.
