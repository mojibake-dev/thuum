# Verb: sleep

From Eli's second T4 playtest (2026-10-04): a bed worked once per player,
the server took the sleep for a wait, and no Rested effect appeared
(docs/verbs/rest.md lists the three causes). The rest verb grants a rest's
recovery; this verb makes the bed part work as the game does.

## Intent

A player sleeps in any unowned bed as in the game: the bed works every time,
the server knows the rest was a sleep, and the player gets the Rested bonus
for eight game hours.

Roadmap reference: skymp/ROADMAP.md "Wait" ("Players should be able to
sleep/wait"); thuum ADR-021 decision 2 and docs/verbs/rest.md
Milestone: M1   Class: A (server rules over facts it holds, imposed on one
client)

## Authority

- **Bed use: R1.** The host's engine opens the sleep menu; the server
  validates the activation as it does any (reach,
  docs/verbs/activation-reach.md) and decides from the master files whether
  the furniture is a bed.
- **Sleep or wait: R0.** The server decides from its own facts: the player
  activated a bed shortly before and still stands at it. The client's
  `sleep` flag in RestIntent is ignored. It came from a furniture test that
  vanilla beds never pass, so it is wrong exactly when it matters.
- **The Rested bonus: R0 decision, R3 effect.** The server decides a sleep
  earns Rested and for how long. The bonus multiplies skill gains, which the
  client's engine computes until M5 moves them to the server (rest.md, "The
  rested bonus goes where skill gains go"), so the engine carries the spell
  for its eight hours.
- Why not lower: the client cannot tell a sleep from a wait, as the playtest
  showed, and must not grant itself bonuses.
- New server state, all in memory and never persisted: each player's last
  bed activation (the bed and when) and a grant counter for Rested. A server
  restart forgets both; the client's Rested goes with its session.

## Engine surface

- **What a bed is.** A FURN record whose active markers include
  `ActiveMarker::kCanSleep` (1 << 31; CommonLibSSE-NG
  include/RE/T/TESFurniture.h:50, furnFlags at :134). In the master files
  that is the FURN's MNAM field: 151 of Skyrim.esm's 400 FURN records set it.
  They are the beds, bedrolls and cots (Bedroll01F MNAM 0x88000001), plus some
  NPC lay-down markers and altars. Chairs do not (CommonChair01F 0x40000001)
  (lab/esm.py, 2026-10-04). It is the engine's own test, so any bed a mod
  adds counts.
- **The bonuses** (UESP, [Skyrim:Beds](https://en.uesp.net/wiki/Skyrim:Beds)):
  - Rested, +5 percent to skill increases: any normal bed, bedroll or hay
    pile;
  - Well Rested, +10: a bed the player owns;
  - Lover's Comfort, +15: married, with the spouse in the building.
  All last eight game hours, and a wait gives none. The spells, in Skyrim.esm
  (lab/esm.py): Rested 0x000FB981, WellRested 0x000FB984, MarriageRested
  0x000CDA1D. M1 has no owned beds and no marriage, so this verb grants
  Rested only.
- **Why the game's own grant never runs.** skymp5-client blocks Papyrus
  events in the local game (blockPapyrusEventsService.ts), so the script that
  grants the bonus when a sleep ends never hears it end.
- **SkyMP's furniture occupancy** (skymp5-server MpObjectReference.cpp):
  - A FURN activation records its occupant
    (CheckIfObjectCanStartOccupyThis).
  - The occupant's next first activation is blocked ("Blocking because it's
    FURN").
  - Only the client's second activation releases it (ProcessActivateSecond),
    or the occupant leaving, by distance or cell.
  - The client sends that second activation once the player has entered
    and left the furniture (remoteServer.ts onOpenContainer). A vanilla bed
    opens the sleep menu without the player entering it, so the release
    never comes.

## Observe

- Nothing new on the client. The server already sees each activation
  (ActionListener::OnActivate) and each rest (OnRestIntent).

## Impose

- Rested: an SpSnippet `Actor.AddSpell(Rested)` to the sleeper's own client
  (self 0x14 there), as the server already sends `Actor.RemoveSpell`
  (ActionListener.cpp). After eight game hours at the server clock's time
  scale (24 real minutes at 20), `Actor.RemoveSpell(Rested)`, unless a later
  sleep has granted it again.

## Suppress

- Nothing new. The game's own grant is already suppressed by SkyMP's
  Papyrus block.

## Message contract

- None new. RestIntent (35) unchanged; its `sleep` field is now ignored by
  the server. SpSnippet (30) as before.

## Server

- **libespm** reads a FURN record's MNAM flags (a new FURN record type) so
  the core can ask whether a furniture can be slept in.
- **The core:**
  - When a player's activation of a bed is allowed, MpObjectReference
    records the bed and the time on the actor.
  - The bed's occupancy no longer blocks its own occupant: a vanilla bed
    never seats the player, so a second activation is a new sleep, not a
    double one.
  - OnRestIntent gathers the facts: how long since the actor's last bed
    activation, and its distance to that bed.
  - After any rest it releases the bed and forgets it.
- **The rules** (ADR-020) are Rust, in wire-rules `rest`:
  - `slept`: a rest is a sleep when the bed activation is under 2 minutes
    old (the menu opens at once, and a 24-hour sleep runs about 24 s) and
    the player stands within 256 units of the bed (the occupancy reach).
  - `rested_bonus`: a sleep earns Rested for eight game hours.
  The rest rule's sleep and wait switches (allowSleep, allowWait) take the
  server's answer.
- DB fields: none.

## Client

- None for the game. lab-driver's dump-state reports which rested spell
  the player has, for the scenario.

## Tests

- **T0, cargo:**
  - `slept`: inside and outside the window, near and far from the bed;
  - `rested_bonus`;
  - the rest switches with the server's sleep.
- **T0, ctest:**
  - a player activates the camp bedroll (Skyrim.esm REFR 0x000B3184) twice:
    both activations are allowed;
  - a RestIntent with `sleep: false` right after one logs "slept";
  - the player's client gets AddSpell with Rested;
  - the bed is released;
  - a wait elsewhere logs "waited" and grants nothing;
  - with waiting switched off, a RestIntent flagged `sleep` but without a
    bed is refused, and a rest at a just-activated bed goes through. The
    rest verb's switch test, which trusted the flag, now sleeps at the bed.
- **T2:** the existing sessions. The fakeclients spawn far from any bed, and
  the activation reach refuses a bed across the map.
- **T3, a-sleep:** c1 stands at the camp bedroll at half health, activates
  it, and accepts the menu's hour.
  - The server's record is full, and c1's dump shows Rested.
  - Back at half health, the same bed works a second time.

## Status

- [x] doc complete, rung declared
- [x] engine surface cited (TESFurniture kCanSleep, the FURN MNAM in
      Skyrim.esm, the rested spells, UESP)
- [x] server logic + T0 (wire-rules `rest::slept` and `rest::rested_ms`
      with cargo tests; RestTest in ctest with the master files, pipeline
      730: the new case, and the switch case updated to sleep at a bed)
- [x] message + validator (none: no message changes)
- [x] native hook + T1 (none)
- [x] TS handler (none; lab-driver reports `rested`)
- [x] T2 green: the ten sessions against m1-sleep-13b2e188, with the
      branch's difftest artifact (job 3127)
- [x] T3 scenario green, no HYPOTHESIS tags: a-sleep on 1.7.104 (run
      20261005-071941) and 1.6.1170 (run 20261005-073126). The server
      logged "slept 1 h ... Rested for 1440 s" for both sleeps, the second
      at the same bed, and c1's game held Rested.
- [x] ledger and suppression registry updated (Actor.AddSpell and
      Actor.RemoveSpell noted)
