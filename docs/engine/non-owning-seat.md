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
| P2a | 055217's stale sample: the visiting seat's own brief simulation walked him toward the door ("ff000001 follows 1348a into cell 9713, which nobody hosts (D6)" at 05:53:05.698, then "may not move 1348a to cell 133c7" at .746 and "moves 1348a into cell 133c7, which it hosts" at 05:53:06.767), and that outdoor sample is the one the next grantee promoted from | REFUTED for the first promotion (R1): the stale copy is the seat's OWN engine's | 20261103-065955 (c2, the visit's grant): "promote gate 1348a: the engine at (19277, -44313, 91) in 3c, the record at (-299, -41, 0) in 133c7; moved to the record below" and "moved 1348a into 133c7 (the engine had it in 3c, at its promotion)"; 20261103-070357 (c1, the swapped visit) the same line; (19277, -44313, 91) is the mill's 0x71dfc: each seat's own game holds Hod at his daytime spot, the record in his house |
| P2b | The promote's gate moves the engine copy to the record when the cells differ, once per record cell (formView.ts:140-155, `movedInto`, thuum-cf's static read docs/research/promote-path-static-2026-11-03.md); a second promotion in the same record cell (055217's interior grant after the visit's) is not corrected, so the copy stands where that seat's engine has it | the first half CONFIRMED (R1, the two runs above); the second HYPOTHESIS | on the parent, a run that reaches the interior grant reads "not moved here (moved into this record cell once already)"; the fix head (m3-promote-record 0238e3b8) resets the gate at every promotion, so that line cannot print there and R6 is its read |
| P8 | The stale engine copy is REPORTED before the gate's move lands: with c2's clock about 2.07 s behind the server's (the first state report of 1348a at 07:03:25.165 on c2 and 07:03:27.239 on the server), the order in 065955 is the grant at 07:03:26.723, the gate's decision ("moved to the record below") at about 26.92, the server's "ff000001 follows 1348a into cell 9713, which nobody hosts (D6)" at 27.009 with Hod at the mill's 0x71dfc position, about 5200 units from his door (no walk covers that in 286 ms), "may not move 1348a to cell 133c7" at .044 (the follow's stale rule), and "moves 1348a into cell 133c7" at 28.044, the move landing about 1.3 s after the word. The engine held him at the mill because its own day package is the sawmill's: "state 1348a: ... package 734cd" (HodSawmillSandbox8x11, 08:00 for 660 min). So a premise that keeps the record home while the engine runs his day package (17:00 to 19:00) is the stale-copy condition itself, the right one for the parent's red; at night the engine agrees with the record and no bounce shows. He also attacked the visiting player ("1348a hits ff000001 with 13790 ... a fight begins" at 07:03:36.305; the redress's "late fate for 1348a ... queued" 1.4 s before the hits is the first suspect, HYPOTHESIS) | the order CONFIRMED (R1 with the clock paired); the attack's cause HYPOTHESIS | 20261103-065955 (c2's console and HostedStateService lines, the server's lines); thuum-cf's reading of the 286 ms, corrected for the measured offset; a fix places the copy at the record at the word's arrival and holds that actor's movement reports until the placement is applied, with the record ahead of the word |
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
| D1 | A dead record applied at a cell re-entry kills the body silently (formView's bind emits silent: true; deathService runs KillSilent), yet the death is heard again at each re-entry | the sound CONFIRMED by ear (a witness); the cause HYPOTHESIS: on a watcher's late load the bind's silent kill plays the body's animation events (CONFIRMED by run), whether the sound rides them unread | playtest 41, Eli: "on a cell reentry i hear their deaths again"; the 2 s animation-event trace on m4-turbo2-chest 654d3b2a is the read; 20261103-100946 (R4 v4, the break-3 build): leg W, c2's late load: "dead record 35534 loaded alive on a watcher's seat: moved 86 units to the record's spot" then "body 35534: anim event" IdleFurnitureExit, SneakStop, Ragdoll, Ragdoll during the silent kill; leg A, the host's same-session return (also 091943): no bind, no events, the engine kept her dead |
| D2 | npc-fate's redress (AddWornOutfit and the equip path) on an actor whose 3D is not loaded crashes the seat | CONFIRMED by its crash log (a witness) | c1 at 17:51:00 PST 2026-11-02, CrashLogger: EXCEPTION_ACCESS_VIOLATION at SkyrimSE.exe+070DB20 (a null read), Sven 0x13491, an Iron Dagger and outfit 0x9D5DF on the stack, in the second the client un-hosted all 15 Riverwood NPCs (results/playtest-41/c1-crash-2026-11-02-17-51-00.log); the guard in e742d086 waits for the 3D, unread in a run |
| D3 | Two seats' copies of one resident can wear different equipment at load: each seat's npc-fate rolls the late fate or redress on its own (both log "late fate for <id>: engine re-roll or redress queued" at the cell's load), so a promotion hands the next host's engine its own copy's gear, not the record's | HYPOTHESIS | 20261103-084006 (round two 0238e3b8): Hod 1348a "3 worn, right 1397e left 0, numChanges 2" on c2 at its grant against "3 worn, right 13790 left 0, numChanges 3" on c1 at its own (c2-console.log:758, c1-console.log:959); whose gear the record holds, and what the other seat shows after a host's change, unread |
| D4 | A host whose engine never saw an NPC's death (a relaunched host's fresh process; by the same rule a later joiner who hosts) loads the dead NPC alive and, with no bind on its own hosted copy, reports her alive; the server takes the first alive sample as "resurrection by its host's engine" and clears the record's death, so she stands again on every seat | CONFIRMED by run | 20261103-100946 (R4 v4, break-3 build), server 10:14:54.626: "resurrection by its host's engine: 35534 stands again with health 1.000 on ff000000's sample, 171 s after its death; the record's death cleared"; c1's "dead record 35534 loaded alive" 0 after its relaunch; server.ref and c1's npc_state isDead false. Playtest 41's "the dead stay dead across the restart" was a SERVER restart, where the clients' engines kept the deaths |
| P9 | A seat's engine places a resident where its own save last had him, at any game hour, not where the server's record or the hour's package would put him | CONFIRMED by run | 20261103-101556 (door v19 on the break-3 build): at the server's 02:00, c1's engine had Hod outdoors at (19179, -44737, -24) with his 3D loaded (the seat's clean-m1-next save, from about 17.x), while the record stood in his house 133c7; a scenario's premise about where an actor stands must be read on the seat, never inferred from the hour |
| P10 | A host's sighting of an actor in a cell it hosts moves the record there when the record stood elsewhere, with no promotion and no pass | CONFIRMED by run | 20261103-101556: "npc-puppet: ff000000 sights 1348a at (19179, -44737, -24) in 3c, cell 9713; the record stood in 133c7", then "ff000000 moves 1348a into cell 9732, which it hosts" five seconds later |
| P11 | A visitor inside a resident's house can draw the resident into combat with that player, and combat holds him inside whatever his package says | the combat CONFIRMED by run; its cause HYPOTHESIS (trespass in an owned interior, the late fate's redress, or relayed hostility) | 20261103-085226 (the swap probe on round two): c2's state line "target ff000001 package 734cd" at 08:54:15.790, his exit never coming in 400 s; 20261103-070357 (Hod attacked the visiting player) |
| P12 | A seat's exit from an interior back to the exterior it came from re-attaches those exterior cells WITHOUT a cellFullyLoaded event for them (Skyrim Platform's event, read by HostService); a cold arrival fires one per cell | the event's absence CONFIRMED by run; the mechanism (the engine's cell buffer re-attaching recently detached cells) HYPOTHESIS | 20261103-134832 (door v22 leg B): c1's exit from the inn 133c6 at 13:55:09.1 re-reported only its own cell ("own cell 9712 reported without its load event", granted at epoch 2 at 13:55:10.85) and never 9731, which stayed unhosted for the run; the cold exits of 055217 ("unloaded 1, loaded 27", 9731 re-granted in 220 ms) and 084006 fired 27. The client's fix on m3-system1-r3 31167a9b re-reports a recently detached cell once it stands attached again (x-warm-exit v1 the read) |
| P13 | After that exit, the visitor's copy of a resident it had run live in the interior (Hod 0x1348a) stays 3D-loaded in the interior cell for at least 21 s, with the puppet flags of the exit's demote (aiEnabled false, activationBlocked true), where the cold house exits of 055217 and 084006 read is3DLoaded false 20 s after | HYPOTHESIS on the cause (H1: the exit-tick demote's puppet natives keep the copy in high process with its 3D; H2: the interior buffer keeps the inn's 3D) | 20261103-134832 step 81: cell 133c6, is3DLoaded true, position identical to the visit's read; x-warm-exit v1 records Hod's npc-state every 3 s for 18 s after the exit and the cell events around the visit (rule 8's Dynamic read) |

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
- R4 (D1): x-npc-death-reentry by path (c1 kills a resident, leaves until the cell is nobody's, returns), with 654d3b2a's trace of
  the body's animation events around the silent bind kill.
  Read as 20261103-091943 (v2, leg A) and 20261103-100946 (v4, all legs) on the break-3 build: leg A nothing, leg W the four
  events in D1's row, leg B the resurrection (D4). To read again on m3-system1-r2 with D4's fix.
- R5 (D2): a run in which the redress meets an actor with no 3D, its "late fate for <id>: its 3D is not loaded, the redress waits for
  the load" line and no crash. Read on the break-3 build (e742d086) as 20261103-091943: the line 13 times on c1 after its departure
  from Riverwood, no crash; to read again on m3-system1 (a4ed5277 is the same patch).
- R6 (the fix, 0238e3b8): at each promotion of 1348a on the new owner's seat, the hold's line, "hold 1348a: placed at the record
  after N ms, the engine at (x, y, z) in <cell>, the record at (x, y, z) in <cell>; released", with the engine's position within
  64 units of the record's in the record's cell, and the server's first "passes|follows|moves 1348a" after it timed after the
  release and never from the mill's side; "not placed after N ms ...; released on the timeout" counted (none expected in the
  door's legs), on door v13's two legs, the swap probe v11 and the settle-0 read (handoffPassSettleMs 0, the placement alone).
  First read, 20261103-084006 (door v14 on 0238e3b8): three promotions placed at the record in 49, 29 and 46 ms with the engine
  already within a unit of it each time; his day package 0x734cd (live on both seats from the grant) walked him out through
  door 13407 at 17.96 with the door's line, the pass to the street seat sent ahead of the word, and nothing passed him back. The
  stale case (the engine away from the record at a promotion) was not reached: neither fresh seat had simulated him elsewhere,
  and no gate move or create-word hold precedes the first grant (c2-console.log:669 to :749); door v15 makes it deliberately.

## 5. Thaw condition

Every player-visible row above CONFIRMED on the viewpoints it names by a run or trace id (R1 to R5), and the door scenario's claims
across each grant (b-npc-handoff-door-hosts at its current version, v17 on thuum main ff9be106: the stale copy made on purpose, no
pass, follow or move of him across the promotion, the hold's line naming both places, with the door line counted beside them) red on
the merge branch's parent, parity 188a8dea, and green twice on m3-system1 (the promote fix cherry-picked onto parity, ADR-064's
freeze), and R5's guard read on that head too (run 20261103-091943 read it on the break-3 build). Until then nothing in this system
merges: m3-handoff-settle stays a branch, and the settle window is not in m3-system1.
