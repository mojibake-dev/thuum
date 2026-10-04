# Verb: hostility sync

ADR-023, from Eli's first T4 playtest (2026-10-04): when one player hits
another, only the attacker's game marks the other an enemy. The victim's
game never does, so the victim can wait or sleep right after the fight,
which single-player forbids ("not with enemies nearby"; UESP,
[Skyrim:Beds](https://en.uesp.net/wiki/Skyrim:Beds)). Eli chose option (c):
the victim's game sees the fight too.

## Intent

When the server accepts a hit between two players, the victim's game also
treats the attacker as an enemy. The engine's own combat rules then apply
on both sides: the compass marks the enemy, and waiting, sleeping and fast
travel are refused while the enemy is near.

Roadmap reference: none (skymp/ROADMAP.md lists "Anims triggered by enemy"
and combat music, not hostility)
Milestone: M1   Class: A (a server rule over facts it holds, imposed on
one client)

## Authority

Rung: R0 for the fact, R3 for its consequences inside each game.
- The fact is that a fight began: the server accepted a hit from one
  player on another, after its own reach, cone and flag checks (R1, the
  melee-reach, hit-cone and damage-flags verbs). The server computes the
  fact from hits it already validated. The client reports nothing new.
- Its consequences are the engine's own and stay client-local (R3): the
  combat state of the other player's figure, the compass marker, the
  refusal to wait, sleep or fast travel, combat music. On the attacker's
  game the engine's hit reaction produces them. On the victim's game the
  server's notice does.
- Why not lower: the client has nothing to tell the server that the server
  does not already know, and the server does not trust a client's engine
  to enforce rests. The rest verb's 10-second rule stays as the backstop
  (docs/verbs/rest.md).
- New server state: none. The notice reuses the attacker's per-target hit
  times, which MpActor already keeps (MpActor::GetLastHitTime, an LRU of
  recent targets, in memory and never persisted).
- Bounds: at most one notice per attacker and victim per fight. A fight is
  a run of hits with gaps under 10 s, the rest verb's quiet window
  (wire-rules `rest::COMBAT_QUIET_MS`), so both verbs share one notion of
  fighting.

## Engine surface

All addresses below come from the re-analyst's static read of
SkyrimSE-1.7.104.0.exe on sky-re (2026-10-04), with Address Library ids
resolved through lab/addr.py. Every one is HYPOTHESIS until the Dynamic
plan confirms it. The 1.6.1170 program in the Ghidra project disassembles
to junk (its .text looks encrypted, likely the Steam wrapper), so its
bodies are unread; the ids exist in both databases.

- **The refusal.** The sleep and wait gate (id 40443, 1.7.104
  0x140743ef0) refuses with the game setting sNoWaitHostileActorsNear
  ("You cannot wait when enemies are nearby."), sNoSleepHostileActorsNear
  for a bed and sNoFastTravelHostileActorsNear for fast travel. HYPOTHESIS.
- **The test behind it** is id 41402 (0x140785b30). It scans the process
  lists' high-process actors (CommonLibSSE-NG include/RE/P/ProcessLists.h:69)
  within fHostileActorExteriorDistance (3000) outdoors or
  fHostileActorInteriorDistance (2000) indoors. An actor counts when
  either holds. HYPOTHESIS:
  - its combat group targets the player (id 38571; CombatController.h:31,
    CombatGroup.h);
  - it is hostile to the player by id 37533, which reads the actor's
    kAngryWithPlayer flag (include/RE/A/Actor.h:207), frenzy, guards and
    crime, and faction reactions.
- **Not inputs:** the player's own isInCombat flag, combat group and combat
  timer (include/RE/P/PlayerCharacter.h:301, 514, 519). HYPOTHESIS.
- **The compass** lists the members of every combat group that targets the
  player (id 41240, rebuilt every frame). kAngryWithPlayer alone never puts
  an actor there. HYPOTHESIS.
- **What a hit does on the attacker's game.** The victim's on-hit reaction
  (id 38626) raises the assault alarm (id 37425), which sets
  kAngryWithPlayer on the victim's figure (id 37463). It also starts the
  figure's combat against the attacker (id 39359, then 38561). That is why
  the attacker's game refuses waiting and the victim's does not: the hit
  runs only on the attacker's game. HYPOTHESIS.
- **The mechanism this verb uses:** Papyrus `Actor.StartCombat(akTarget)`
  (native id 54768) on the attacker's figure in the victim's game, with the
  player as the target. It queues the same combat start as a hit (id
  39359), so it produces the state the attacker's game already holds: the
  figure's combat group targets the player. HYPOTHESIS. The engine ends
  that combat on its own when the target is lost, or `Actor.StopCombatAlarm`
  (id 54771) ends it at once.
- **Rejected alternatives** (the re-analyst's read):
  - Setting kAngryWithPlayer directly (id 37463) needs native code and puts
    no marker on the compass.
  - Frenzy makes the figure hostile to everyone.
  - Faction.SetPlayerEnemy changes a whole faction.
  - SetRelationshipRank only matters for unique NPCs.
  - Actor.SendAssaultAlarm files the local player as the criminal.
- **SkyMP's figures keep their AI.** They are placed with placeAtMe and
  given attackDamageMult 0 (skymp5-client/src/view/formView.ts:170, 288).
  They are moved with keepOffsetFromActor, and the call to stopCombat
  above it is commented out (src/sync/movementApply.ts:57, 60). So a
  figure already runs combat AI on the attacker's game today, and its
  attacks deal no damage.

## Observe

- Nothing new. The server already sees every player-on-player hit
  (ActionListener::OnHit) and accepts or refuses it.

## Impose

- Mechanism: an SpSnippet, the server's existing way to make one client call
  a Papyrus function on a form (skymp5-server SpSnippet.h; the client's
  spSnippetService.ts). On an accepted hit that begins a fight, the server
  sends the victim's client `Actor.StartCombat` with:
  - self: the attacker's form id, which the client maps to its figure of
    the attacker;
  - argument: the object 0x14, the local player, which the client leaves
    as is.
  It goes to the victim alone; the attacker's engine has already reacted.
- Visual without simulation: the figure's position and animations still
  come from the attacker's real movement. Its combat AI must not move it
  or make it swing on its own; the Dynamic plan measures that.
- Side effects (HYPOTHESIS): combat music on the victim's side, as when an
  enemy attacks in single-player. Possibly combat dialogue from the figure,
  and an equip call by the combat start (the re-analyst saw 38561 reach
  ActorEquipManager).

## Suppress

- The figure's combat AI acts only through its attacks, which already deal
  no damage (attackDamageMult 0), and through movement, which
  keepOffsetFromActor overrides. HYPOTHESIS: whether that override wins
  against combat pathing, and whether the AI plays attack animations on its
  own, is the Dynamic plan's step 3.
- Release: the engine's own end of combat. If the figure's combat outlives
  the fight (after a respawn, say), the server can send
  `Actor.StopCombatAlarm`; not built until the lab shows a need.

## Message contract

- None new. SpSnippet (MsgType 30) unchanged, server to client, no result
  (snippetIdx 0xffffffff). The wire is not widened.

## Server

- **The rule** (ADR-020) is Rust, in wire-rules `hostility`: notify the
  victim when the hit is between two players and the attacker had not hit
  this victim within the quiet window, or ever. Facts: both sides are
  players, and the time since the attacker's previous hit on this target.
- **The core** (ActionListener::OnWeaponHit) reads the previous hit time
  before it records the new one. It asks the rule after the damage is
  applied, and sends the snippet through SpSnippet::Execute to the victim.
- **Spell hits** (OnSpellHit) start fights the same way in the game. They
  join this verb once a spell verb validates them (M2); until then only
  weapon hits notify.
- DB fields: none. Restart: the hit times are memory only, so the first hit
  after a restart notifies, which is right.
- Papyrus natives touched: none on the server VM. The ledger notes
  `Actor.StartCombat` as sent by the server for this verb.

## Client

- None. The existing spSnippetService runs the call.
- Kill switch: none needed on the client. A server setting can turn the
  notice off if the lab shows harm.

## Tests

- **T0, cargo:** the rule: the first hit notifies, hits under 10 s apart do
  not, a hit after the quiet window does again, and a hit on a non-player
  never does.
- **T0, ctest:** player A hits player B. B's user gets one SpSnippet
  "Actor" "StartCombat", self A, argument 0x14. A second hit 3 s later
  sends none. A hit after 10 s sends one again.
- **T2:** difftest session hostility: c1 hits c2 twice. The server under
  test sends c2 one SpSnippet; the legacy server sends none. A declared
  divergence.
- **T3, a-hostility:** c1 hits c2 once from behind. c2 is set to half
  health. 12 s later, past the server's 10-second rule, c2 presses T, then
  Enter.
  - The wait never happens. c2's health stays near half, where a rest would
    fill it: `server.actor(c2).healthPercentage < 0.8`.
  - c2's figure of c1 stays where c1 stands: c2's watch of c1 moves less
    than 100 units.
  - A screenshot after T shows the refusal text.
  - Regresses visibly: without the notice, c2's game opens the wait menu,
    the server grants the rest, and c2 is at full health.

## Dynamic plan

The T3 scenario confirms the behavior. Two more checks clear the tags
above, in an exploratory run first (lab/scenarios is for the final shape):

1. c2's screenshot right after T reads "You cannot wait when enemies are
   nearby.", the gate's own refusal (sNoWaitHostileActorsNear). The same
   screenshot shows c1 on c2's compass as an enemy (the CompassMarkerEnemy
   frame).
2. c2's figure of c1 over 10 s, while c1 stands still: position from c2's
   watch (no drift beyond 100 units) and screenshots (no swings c1 did not
   make). If it moves or swings, the Suppress section needs work before
   this verb ships.
3. If 1 fails, a Frida trace on c2 (lab/frida/hostility.js, functions by
   Address Library id through lab/addr.py):
   - hook 40443 and log its return value, with args[1] null for a wait;
   - hook 41402 and log its return value;
   - inside 41402, hook 38571 and 37533 with the actor's form id;
   - hook 52933, the notification, and log its text.
   Expected: 41402 returns 1 through 38571 for c1's figure.

Owner: agent (screenshots, watch, Frida).

## Status

- [ ] doc complete, rung declared
- [ ] engine surface cited or delegated
- [ ] server logic + T0
- [ ] message + validator (none: no message changes)
- [ ] native hook + T1 (none)
- [ ] TS handler (none)
- [ ] T2 green
- [ ] T3 scenario green, no HYPOTHESIS tags
- [ ] ledger and suppression registry updated
