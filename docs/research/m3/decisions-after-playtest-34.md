# Decisions after playtest 34 (DRAFT, 2026-10-25 16:12 PDT, thuum-magnus for Eli, relayed by numidium)

Playtest 34 ran on fork parity fa8809a1 (trains 39 to 45) from 14:33 PDT on
2026-10-25, with two world resets on Eli's word (22:18Z and 23:07Z, the copy
playtest-m3-34b-rotfern-20261025T2217Z). Its findings that were defects are
built, on train-46 (server, fork m3-train-46 aaafffe5: the pass between live
hosts, the server-made actor's death rule, E_HIT_WEAPON at info, the corpse's
occupancy released) and train-47 (client, fork m3-train-47 3a8a50a8, built
ahead: the body's inventory as a diff alone, the hosted server-made copy
dressed once). Seven findings are calls rather than defects, D18 to D24 below,
each with its options and the recommendation last, numbered after the memo
before this one (docs/research/m3/decisions-for-playtest-34.md, D1 to D17).
Sources: docs/verbs/npc-fate.md (the playtest 34 paragraphs), cell-host.md
(the quitting host row), npc-handoff.md (decision (d)), numidium's log reads
of the session (https://thuum.gaussing.tv/results/playtest-34/).

How to answer: "all recommended", or the ones to change, e.g. "D20 B".

## cell-host

### D18. A dead player as a cell host
The night's read (b-cell-host 20261025-115250) showed c1 taking a cell at
epoch 2 while dead, before its 25 s respawn; not a bug under today's rules,
where the candidates are the players loaded in the cell whatever their state.
- A. Leave as today: a dead player hosts like a live one until its respawn
  teleports it away and its cells pass by distance after the grace.
- B. A dead player is no candidate, and its cells start their grace at the
  death (an R0 fact the server already holds), so the handover begins up to
  25 s earlier than A's and the village never runs on a dead player's engine.
- C. B, and a dead host's cells pass at once (no grace), the way a quitting
  host's do under D12-B.
- Recommended: B. The death is the server's own number, the rule reads in one
  place (the candidate filter), and the grace keeps a respawn-in-place from
  bouncing the cell. C saves five seconds a death at the cost of a flip when
  the player stands up where it fell.
- Built ahead, not merged (16:28 PDT, fork m3-train-48, after D21-B): the
  rules' dead flag (died, respawned; eligible and candidate read it), the
  bridge's two calls, WorldState::onDeathState from SendAndSetDeathState
  into PartOne::OnDeathState for a player's actor; the rules' test and
  CellHostTest's case. Awaits the letter.

## npc-fate

### D19. The hands of a server-made copy
Finding 2: two server-made bandits' every swing was dropped at OnHit's weapon
check, because the host's engine dressed each copy from the base's own roll
while the record held the server's (Rule A kept the server's equipment off a
hosted actor), and nothing pins a copy the way a game-file actor's fate pins
its hands (D17). Train-46 says the drop at info (E_HIT_WEAPON); train-47 is
built on B.
- A. Leave as today: a hosted server-made NPC's hits are dropped and logged;
  its copies on the other seats wear the server's set.
- B. The copy this game hosts takes the server's equipment ONCE at its first
  apply (its identity, as the fate's pin is a game-file actor's), and Rule A
  holds from then on. Built on train-47.
- C. The server sends a server-made NPC's whole inventory and every seat lays
  it in as a container's at creation, so the copy's loot and hands are the
  server's everywhere.
- Recommended: B. One condition in the view, the same shape as D17 for game
  file actors, and the copy's loot is already the server's container when it
  dies (the fate's body). C costs a property on the wire for every NPC and a
  reset of the copy's base container on every seat.

### D20. A body's one occupant
Section 5's "the non-host can't interact with the body" and "rotfern couldn't
take armor, test 2 could" read, in the lines, as the container rule (D16-A:
one occupant within 512 units) plus a defect (the corpse's closing activation
never released the occupant; fixed on train-46 aaafffe5). With the fix, the
rule stands as upstream's for every container: the second player at an open
body is refused with no menu and no message until the first closes.
- A. Leave as today: one looter at a time, the second waits, nothing said.
- B. A, and the refused player is told (a console or HUD line from the
  server's refusal, the activate hook's path back).
- C. Admit both: two menus on one server inventory, the takes serialized on
  the server, each menu refreshed by the other's take.
- Recommended: A for M3; B when a notice channel to the player exists (the
  HUD line the fate's deaths will want too). C is a client and server slice of
  its own and a race the engine's menu was not built for.
- The release itself is proven at T3 (18:42 PDT): b-npc-body-release (x-body-release
  v3 20261026-012319), so A reads as upstream's rule with the defect gone.

### D21. A disabled server-made actor's respawn
Numidium's section 5 read: the ice wolf ff000003, disabled by the console at
23:00:5xZ, was killed at 23:01:00 and came back enabled at 23:01:25 (the 25 s
respawn re-enables; under train-46's rule the fate respawn would, hours later).
- A. Leave as today: a disabled actor's death still schedules its respawn, and
  the respawn enables it.
- B. A disabled actor's death schedules no respawn, and a respawn due on an
  actor disabled meanwhile is dropped (the disable is the server's word that
  the actor is out of the world).
- C. The respawn keeps the disabled flag (the actor stands again, invisible,
  until enabled).
- Recommended: B. Disable is how the gamemode and the lab take an actor out;
  an out actor that comes back by its own clock is a surprise on every seat.
  A server fix with a T0 case, the next server train.
- Built ahead, not merged (16:23 PDT, fork m3-train-48 off train-46):
  RespawnWithDelay returns for a disabled non-player (the 25 s timer's
  callback too), the sweep drops a disabled body and keeps its stamp, and
  MpActor::Enable schedules the fated return (stamped at the enable when the
  death left none); NpcFateTest's case. Awaits the letter.

### D23. The late re-roll's lost 3D on a login inside a dungeon
Section 4: the campfire pair and eleven more leveled NPCs were invisible on
test 2, on its compass and detecting it, after every restore; visible on test
1. Numidium's agent's read of the 15:27 capture: test 2 logged in inside
371de from its saved position, so its engine loaded the temple BEFORE the
fates arrived (the server's 22 fates at 22:18:34.985Z), and the late path
(actorFateService.ts:74, rerollActor) sent every leveled clone through the
engine's own re-roll (FateApi.cpp:142-146, 37323), which drops the 3D
(re-npc-roll.md:53: Set3D(nullptr, true)) and nothing reloads it; the
promote then turned the AI on with no 3D check ("rerolled 39fe4 through the
engine (3D loaded false)", then "live 39fe4"). Ten of the thirteen were then
released by the D11 rule, which read the missing model as out of reach. The
six fixed-base NPCs, redressed only, kept their 3D; test 1, whose fates came
before its attach, pinned at load with no re-roll. This is re-npc-roll.md's
(b) falsifier, "leaves a live actor without 3D", met.
- A. Leave as today: a login inside a dungeon shows its leveled NPCs invisible
  on that seat until the cell is left and re-entered.
- B. The late path re-rolls only when the loaded clone's base differs from the
  fate's pick (the common case after a save or a login is equality: the save
  kept the roll the server pinned), redressing otherwise; after a re-roll it
  reloads the 3D (Load3D, CommonLibSSE-NG include/RE/T/TESObjectREFR.h:302
  and A/Actor.h:315; or Disable then Enable(false), :337 and :374, the
  resurrect path's shape), and the promote waits for Is3DLoaded (:435).
  Which reload the engine accepts on an attached actor is a lab read.
- C. The late path never re-rolls a loaded clone: redress always, and a
  species that differs from the fate's pick stands until the cell's next
  load (the pick re-applied at the engine's own next init).
- Recommended: B. C leaves two screens with two species until a reload (the
  leveled identity D10 was meant to end); A leaves a seat blind in every
  dungeon it logs into. B's first half costs nothing and covers the common
  case; its second half is a Skyrim Platform native change with one probe
  (a seat relaunched inside the temple, its leveled NPCs read 3D-loaded and
  visible after the late fate). Train-47 can carry it (a client dist), or
  the train after.

## cell-host, the quitting host: the crash at every quit

### D24. The quit crash's remedy (19:27 PDT)
Every quit crashes in the engine's Scaleform heap teardown (six of six on
every seat, path and build, with or without our client). The leak is NAMED
(cell-host.md, the quitting host row): the engine's always-open Loading
Menu's IMenu is held by two SKSE plugins in statics that nothing clears,
NextGenDecapitations.dll (+0x204d80) and DeathDropOverhaul.dll (+0x1e9620),
found by a pointer scan of the process (x-quit-scan v3 20261026-021707);
its count also grows by one at every loading screen (a taker, HYPOTHESIS:
one of the two, or the Core Impact Framework slot the scan found on a
stack). The UI destructor's own three releases cannot reach zero, the menu
and its movie outlive the UI, and the heap teardown reads a freed handler.
Skyrim Platform and skymp5-client hold no menu pointer. The crash lands
after our disconnect (D12-B's leave is 5 ms after the quit flag), so a
player sees a crash dialog at every quit and the lab's end checks read a
crash log per quit; nothing else is lost.
- A. Leave as today: a crash log per quit, the dialog for the player.
- B. Fast exit: our quit thunk (OnQuitShutdown, which already disconnects the
  client first) flushes the logs and ends the process (TerminateProcess)
  instead of running the engine's shutdown, the shape the "fast exit" SKSE
  plugins use; the teardown that crashes never runs, and nothing of ours
  needs it. The plugins' leak stays, harmless.
- C. Drop or replace the two plugins (the decapitation and death-drop
  features), if x-quit-bisect-ngd-ddo reads a clean quit without them; the
  per-load taker may be a third (CIF), which the same run tells.
- D. Report to the mods' author with the scan's offsets and wait.
- Recommended: B now, D alongside; C only on the bisect's word and your
  taste for the two features. B is a dozen lines in the thunk we already
  own and holds whatever plugin leaks next; A keeps a dialog at every quit
  of every playtest.

## npc-handoff

### D22. Tenure at the crossing (conditional)
Train-46 passes a hosted actor to the destination cell's live host at an
adjacent crossing with no tenure (ACTOR_TENURE_MS 10_000 stays UNMEASURED).
If x-handoff-cross on 46's stage shows the pass thrashing (Sigrid passing
back and forth at the border faster than the engines settle), the question
is which brake.
- A. Leave as today: no tenure; a pass at every adjacent crossing.
- B. A tenure of 10 s after a pass, during which the sender keeps the actor
  and the destination's host puppets it across the border.
- C. A hysteresis in distance: the pass fires only once the actor stands a
  cell margin (256 units) inside the destination.
- Recommended: decide on the read. A if the probe passes once per crossing;
  C before B if it thrashes, since a margin needs no clock and reads the same
  on both servers in T2.
- The read (16:58 PDT): x-handoff-cross v2 20261025-235039 GREEN, one pass in
  three minutes, no refusal, no thrash. A stands; nothing to build.

## MERGED (46) (18:44 PDT, 2026-10-25): Eli "Merge now"; fork parity aaafffe5 (from fa8809a1), thuum main bfc41e0b; the clones keep parity's client fa8809a1 (no client change on the train). Trains 47 (f70cf19f) and 48 (9b412a10) both contain aaafffe5 already and wait on the letters.

## Merge-ready (46) (18:24 PDT, 2026-10-25; numidium's citation)

Train-46 at fork m3-train-46 aaafffe5 (five commits over parity fa8809a1:
53432d22 the pass between live hosts, fe1ee08f the server-made actor's
death by the NPC rule, 5d391c4b its unit case, c7c389af E_HIT_WEAPON at
info, aaafffe5 the corpse's occupancy released) is merge-ready by citation:
gate-m3-train-46 (20261026-001639) GREEN 18 of 18 with no reruns
(smoke-two-players to b-invis-recast 011953); T2 green at aaafffe5
(17:16:36 PDT); gate-cite's five checks passing (one build; the registry
serving skymp-server:m3-train-46; the clones naming "m3-train-46 client
aaafffe5"; aaafffe5 the staged commit; nothing replaced it). The stage's
probes: x-host-own-hit GREEN (234109, committed b-host-own-hit b09d7b25),
x-handoff-cross v2 GREEN (235039, committed b-npc-handoff-cross 81211790),
x-body-release v2 with every claim held (235731; red on a mod's start-up
box alone) and x-npc-protected v2 with the floor held (000257; red on the
bear's own death line alone), both v3s running as this is written. The
command at Eli's word: `GATE_SET=20261026-001639-gate-m3-train-46 T2=skip
just verb-merge m3-train-46`, the eleven M3 b- scenarios named as for 45.
Built ahead of its letters and not merging with it: train-47 (client,
f70cf19f) and train-48 (server, 9b412a10).

## The trains, in order
1. train-46 (server), fork m3-train-46 aaafffe5: after Eli's report, numidium's
   stage with x-handoff-cross, x-host-own-hit and x-body-release by path, T2,
   the gate of eighteen, merge; the committable scenarios follow from the
   greens (rule 13).
2. train-47 (client), fork m3-train-47 3a8a50a8 on 46: stage with x-body-loot
   and the copy's hit (the console PlaceAtMe server action, numidium's), T2
   cited, gate, merge; D19-B is its design; D23-B's first half (redress when
   the bases agree) and, if the reload reads clean, its second.
3. train-48 (server), fork m3-train-48 off 46: D21-B and D18-B built ahead;
   D22's brake joins it if the read asks one.
