# Verb: mount

Status: DRAFT (17:30 PDT 2026-10-29, the weekend pass, thuum-magnus). M3's chart line "horses (host follows rider)" (PLAN.md) is
answered on paper here, as the pass's audit said it would be: the owner table's row, kind mount, written; the build is M7's, with
mounted combat. Nothing of this verb is code.

## Intent

A player rides a horse and the horse is simulated by the rider's own seat wherever the ride goes: it leaves its cell's host and
returns to the cell's rule at the dismount. Every other seat sees the pair move as one (the rider's figure on the horse's puppet,
the horse's stride from its simulator's stream). The horse is an NPC the server already knows (a game-file actor, npc-puppet);
what is new is the row that says who runs it while it is ridden.

Roadmap reference: skymp/ROADMAP.md "Horses" (always host the horse we ride; combat; mounted shooting separately)
Milestone: M7   Class: B

## Inventory (ADR-031: the action's consequences, before its rung)

Listed from the records and the engine's surface; the reference trace (a solo ride, lab/references/mount.json) is M7's first step
and may add rows.

| consequence | seen in | disposition |
| --- | --- | --- |
| the mount and dismount animations on rider and horse (the engine's paired actions) | trace (M7) | native on the rider's seat, imposed on every other as the rider's streamed actions on the pair (npc-stream's shape) |
| the horse's movement under the rider's input (speed, turn, jump, the gallop stamina) | trace (M7) | native on the rider's seat (R1: the rider's seat computes, the server validates against a horse's bounds), imposed on the others as a puppet's locomotion (train-33's channels) |
| the horse's AI while ridden (none: the rider drives) and after the dismount (its packages, its return to its stable) | record (AI packages) | native on the simulator; the dismount hands it back to the cell's host |
| the rider's camera, the horse's HUD name, the mount's sounds | trace (M7) | R3 on the rider's seat; the sounds native on every seat from the puppet's animation |
| the horse's health, its death under the rider, the rider thrown | record (NPC_ values), trace (M7) | R0 as npc-fate's deaths (the server's number, the simulator's engine dies by it, ADR-050 decision 2) |
| ownership (a stolen horse, the stable's), the horse's inventory (saddle) | record (ownership, CONT) | later: M5's crime, M7's stables |
| mounted combat (the rider's melee and bow from the saddle) | trace (M7) | later: M7 (melee-reach's bounds from the saddle, marksman's aim from the horse's motion) |

### Sequences and combinations (ADR-033)

| sequence or combination | probe or scenario | result |
| --- | --- | --- |
| mount, ride into another host's cell, dismount there (the row outranks the cell's host, then the cell's rule) | x-mount-cross (M7) | unwritten |
| mount, the rider relaunches mid-ride (the row ends with the rider, the horse to its cell's host at the rider's last place) | x-mount-relaunch (M7) | unwritten |
| two riders on two horses racing (two rows, two streams, one cell) | x-mount-pair (M7) | unwritten |
| a horse killed under its rider (the death word, the rider's fall on both screens) | x-mount-death (M7) | unwritten |

## Authority

Rung: R0 for the row (the server decides who simulates the horse: the rider at the mount, the cell's host at the dismount); R1
for the horse's movement while ridden (the rider's seat computes, the server validates it as the rider's own movement, with a
horse's speed bound in place of a player's); R2 for the horse's actions and values under the rider (recorded as a hosted actor's
are, npc-stream); R3 for the rider's camera and HUD.
Why this rung and not the one above it: the server has no physics or AI to run a horse (ADR-002), and the rider's seat is the
one place the horse's input exists; a validation bound is the most the server can hold.
What the server validates (R1) or records (R2): the horse's samples against its race's speed (the records' movement data, rule
1: from the esm, never from memory); the mount claim against reach (the rider within activation reach of the horse, the horse
an NPC of a mountable race, alive, unclaimed and unridden); the dismount as the row's release.
Rate limit / bounds: one row per horse and per rider; the movement budget the rider's own.

## The owner table's row (the pass's contribution)

ADR-050 decision 4 and ADR-052 name one owner table with the cell as its policy and per-actor rows that outrank it for a while:
follow (ADR-047), margin (D22's brake), claim (ADR-052, the dialogue), prop (ADR-058). The fifth kind is mount: {actor: the horse,
owner: the rider, epoch, since, kind mount}. Its rules, in the shape of the claim's:
- Granted at the rider's mount (the client's report of the engine's mount, Actor.isOnMount true for the player with the horse as
  GetMount's answer; the server checks reach, the race, the horse alive and unridden) and written as a follow row for the rider,
  so simulator_of names the rider and every server gate follows it for free (WorldState::HostOf through simulator_of; ADR-052).
- Outranks the cell's host wherever the ride goes: a horse ridden into a cell another player hosts stays the rider's (the follow's
  cross-cell shape, ADR-047 D6), its puppet on the host's seat fed by the rider's stream; the row survives the cell's grants.
- Released at the dismount (the client's report, Actor.isOnMount false), at the rider's departure (the horse falls to its cell's
  host at the rider's last place, as a toucher's props do, props.rs gone), at the horse's death (npc-fate's word), or when the
  server's own read says the rider is no longer on it (a late report, a lease of the claim's kind, UNMEASURED).
- No lease by time while ridden: a ride is as long as the rider wants; the release is the rider's act or its absence.
- The word to the seats is the per-actor UpdateHoster the claim uses; a late listener hears it at its subscription, as a prop's
  owner (the review of prop-physics, 2026-10-29).

## Engine surface

- CommonLibSSE-NG symbol(s): Actor::GetMount and GetMountedBy (include/RE/A/Actor.h:553-554); the mount flags kIsAMount,
  kMountPointClear, kGettingOnOffMount (Actor.h:197-199); PutActorOnMountQuick (Actor.h:370, vtable 0AC); SetLastRiddenMount and
  QLastRiddenMount (Actor.h:473-474). Skyrim Platform: Actor.isOnMount(), Actor.dismount() (skyrimPlatform.ts).
- Address Library ID(s): none needed for the row; the mount's paired animation hook is M7's read (UNKNOWN until then; `just addr`
  when it comes, never from memory).
- The mount event: Skyrim Platform sinks no mount event today (grep 2026-10-29); the client reads isOnMount at its movement
  cadence or hooks the paired-action start (M7's read; delegated to the re-analyst then).

## Observe (host or acting client sees the intent before the engine acts)

- Hook point: the rider's seat, isOnMount's flip with GetMount's horse (poll at the movement cadence) or the paired action (M7).
- SP filter (minSelfId / maxSelfId / eventPattern): the player's own actor (0x14).
- Data captured: the horse's id, the mount or dismount.
- Side effects of hooking here: HYPOTHESIS until M7's trace.

## Impose (observers render the server's decision)

- Mechanism (SP API call, native call, snippet): the rider's figure placed on the horse's puppet through the engine's own mount
  (PutActorOnMountQuick, Actor.h:370, or the paired action replayed; HYPOTHESIS which keeps the figure seated), the horse's
  stride from the rider's stream as any hosted actor's.
- Visual without simulation achieved by: the horse's puppet state (AI off, the locomotion channels fed), the rider's figure
  parented by the engine's mount.
- Side effects: HYPOTHESIS until M7's trace.

## Suppress (engine's own behavior blocked on non-hosts)

- What is suppressed: the horse's AI on every seat but the rider's (npc-puppet's switch); the horse's own activation (a second
  player cannot mount a ridden horse: blocked natively on the puppet).
- How (blockPapyrusEvents, setInventory guard, AI toggle, hook early-return): npc-puppet's demote.
- Release condition (host handoff, cell unload): the dismount's release, the rider's departure.
- Side effects: HYPOTHESIS until M7's trace.

## Message contract

- Message name / numeric type: ActorClaim (56) widened with a kind byte, or a MountClaim of its own: M7's call, with its validator,
  fixtures, C++ struct and TS interface in one commit (rule 4).
- Direction: C2S the claim and the release; S2C the per-actor hoster word (existing).
- Fields (name: type, units, bounds): idx (the horse), claim (bool), kind (u8, mount).
- Validator rules: reach, the race's mountable flag, alive, unridden, one per rider.
- Idempotency / ordering: a repeated claim is Same; a release of a row the rider does not hold is refused.
- Contract doc updated: no (M7).

## Server

- Where the logic lives: wire-rules cells.rs's follows table (the row kind), the bridge, PartOne's ClaimActor path.
- DB fields / migration: none (the row is memory; the horse's record is its own).
- Restart behavior: every row gone; the horse stands at its record under its cell's host; the rider's seat re-mounts by its
  own read.
- Papyrus natives touched (ledger lines added): none in the row; M7's hooks get theirs.

## Client

- SP binding: isOnMount, GetMount (a native to add if the platform lacks it; the ledger line then).
- TS handler: HostService's claim path, the mount's report at the movement cadence.
- Kill switch config key: npcMount (M7).

## Tests

- T0: the row's grant, release, departure and death cases in cells.rs and CellHostTest (M7).
- T1: none for the row.
- T2: a difftest session with a mount claim accepted and one refused (M7).
- T3 scenario id: lab/scenarios/b-mount.yaml (M7)
- Assertions that would fail if the verb silently regressed: the horse's simulator flips to the rider within a second of the
  mount on the server's host table; the horse's puppet on the other seat moves with the rider within the relay's lag; the
  dismount hands it back within the grace.

## Dynamic plan (fill when any tag above is still HYPOTHESIS)

- Frida script: lab/frida/mount-trace.js (M7): the paired action's start and PutActorOnMountQuick on both seats during a mount.
- Breakpoint plan for a human session: none yet.
- Owner: agent (Frida), M7.

## Status

- [x] doc complete, inventory listed with a disposition per row, rung declared (the row's design; the inventory from records and
      the engine's surface, the trace M7's)
- [ ] engine surface cited or delegated (the row's surface cited; the mount hook UNKNOWN, delegated at M7)
- [ ] server logic + T0
- [ ] message + validator (same commit)
- [ ] native hook + T1
- [ ] TS handler
- [ ] T2 green
- [ ] T3 scenario green, no HYPOTHESIS tags
- [ ] parity scenario green, or its later list reviewed with it (ADR-031)
- [ ] sequences and combinations green, every checklist item with its scenario (ADR-033)
- [ ] ledger and suppression registry updated
