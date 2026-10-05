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

What this verb relies on, confirmed in the lab (exploratory run
20261004-224519; a-hostility on 1.7.104 and 1.6.1170, runs 20261004-230736
and -231111):

- **Papyrus `Actor.StartCombat(akTarget)`** on the attacker's figure in the
  victim's game, with the player as the target, makes the victim's engine
  refuse a wait with its own message, "You cannot wait when enemies are
  nearby." (the game setting sNoWaitHostileActorsNear). It also puts the
  attacker on the victim's compass as an enemy. Screenshots 019-c2.png and
  027-c2.png in run 20261004-230736.
- **The figure stays put.** Its combat AI runs, but SkyMP's movement keeps
  it where the attacker is: 0.016 units of drift over 28 s in both runs.
  SkyMP places figures with placeAtMe, gives them attackDamageMult 0
  (skymp5-client/src/view/formView.ts:170, 288), and moves them with
  keepOffsetFromActor (src/sync/movementApply.ts:57, where the stopCombat
  call above it is commented out).
- **The attacker's side is unchanged.** Its engine's own hit reaction still
  refuses its wait (c1 at 0.592 and 0.5893 after trying).

How the engine does it, from the re-analyst's static read, is in
ghidra/notes/hostility-1-7-104.md: the wait gate (id 40443), its scan of
nearby actors whose combat group targets the player or who are angry with
the player (41402), the compass list (41240), and what a hit does on the
attacker's game (38626). The verb uses none of those addresses; it calls a
Papyrus native through Skyrim Platform.

## Ending a fight

ADR-023's amendment (Eli, 2026-10-05: "60 seconds OR walk apart"). Each
game's figure of the other player is an AI in combat, and such an AI gives
up only when it loses its target, so without an end the aggro never expired
(the third playtest).

- The fights live in Rust (wire-rules `hostility::Fights`, ADR-020). A hit
  between two players begins one, which tells the victim's game as above, or
  keeps it going.
- Once a second the core measures each pair (PartOne::TickFights). A fight
  ends when neither player has hit the other for 60 s, or when they have
  stood farther apart than the engine's "enemies nearby" range for 5 s. The
  range is 3000 units outdoors and 2000 indoors, the executable's defaults
  for fHostileActorExteriorDistance and fHostileActorInteriorDistance, which
  no master file overrides (ghidra/notes/hostility-1-7-104.md; lab/esm.py
  over the five masters).
- Both games then get `Actor.StopCombatAlarm` on their figure of the other.
  The re-analyst's read is that it stops the figure's combat, its alarm and
  its anger at the player (ghidra/notes/hostility-1-7-104.md). T3 confirms it
  by the wait it lets through.
- Until a fight ends, the rest rule refuses its players a rest, however long
  ago the last hit (wire-rules rest, `in_fight`).
- A player who leaves ends its fights without a notice.

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
  come from the attacker's real movement; its combat AI did not move it.
- To watch in the second T4 playtest: combat music on the victim's side, as
  when an enemy attacks in single-player, and any combat dialogue from the
  figure. The attacker's side has had both since before this verb.

## Suppress

- The figure's combat AI acts only through its attacks, which already deal
  no damage (attackDamageMult 0), and through movement, which
  keepOffsetFromActor overrides: no drift in the lab. Swings it might play
  on its own are a T4 check.
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

Done. The exploratory run 20261004-224519 and the scenario's screenshots
showed the refusal text and the compass marker on the victim's side, and the
watch showed no drift, so the Frida trace in the plan was not needed. It
stays in ghidra/notes/hostility-1-7-104.md for the day the engine's own end
of a fight needs measuring.

## Status

- [x] doc complete, rung declared (R0 for the fact, R3 for its
      consequences)
- [x] engine surface cited (Papyrus Actor.StartCombat, confirmed in the
      lab; the static read in ghidra/notes/hostility-1-7-104.md)
- [x] server logic + T0 (wire-rules `hostility` with its cargo tests; the
      HitTest case in ctest with the master files, pipeline 719: all 266
      test cases passed)
- [x] message + validator (none: no message changes)
- [x] native hook + T1 (none)
- [x] TS handler (none)
- [x] T2 green: the ten sessions against m1-hostility-5af53787, with
      that commit's own difftest artifact (job 3101), 2026-10-04. The new
      notice is declared in hostility, damage-flags and rest, the sessions
      where players fight.
- [x] T3 scenario green, no HYPOTHESIS tags: a-hostility on 1.7.104 (run
      20261004-230736) and 1.6.1170 (run 20261004-231111)
- [x] ledger and suppression registry updated (`Actor.StartCombat` noted)
