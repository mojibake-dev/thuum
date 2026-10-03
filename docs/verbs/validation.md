# Verbs: validation (draft)

Draft for M1's "validation: character creation, damage range and angle,
movement speed bounds, activation distance" (docs/PLAN.md). Nothing here is
built. It records what the server checks today, from a read of the fork on
2026-10-02, so each check can become its own verb (rule 3: one verb, one
doc, one scenario). Paths are in skymp5-server/cpp/server_guest_lib unless
noted.

## Everywhere

- A handler that throws is logged and the message dropped
  (addon/ScampServer.cpp, Tick). No validation path disconnects anyone.
- Before any C++ handler, the Rust edge caps message size and per-client
  bytes per second, caps every collection, rejects non-finite floats, and
  bounds UpdateMovement positions (skymp-wire wire-transport limits.rs,
  wire-validate). It has no per-message rate rules for SkyMP's messages.

## Movement (R1)

- Checked: the actor index must be the sender's own actor or an NPC it
  hosts (ActionListener.cpp, SendToNeighbours; otherwise HostStop and drop);
  a change of cell or worldspace, or a jump of 4096 units or more in one
  message, is rejected and the sender's own actor snapped back with
  Teleport2 (MovementValidation.cpp); the first update after a server
  teleport is always rejected and snapped back.
- Defect, FIXED 2026-10-02 (docs/verbs/movement-relay.md, on parity):
  OnUpdateMovement relayed the raw packet to every neighbour
  (SendToNeighbours) before MovementValidation ran, so a rejected move had
  already reached the other clients.
- Not checked: speed over time (only the per-message jump), message rate,
  height and navmesh, rotation. A hosted NPC's rejected move is dropped
  without a snap-back or a log line.

## Hits and damage (R1, damage R0)

- Checked in OnHit: aggressor is the sender or a hosted NPC; the target
  exists; same cell or worldspace; distance under 4096 units for non-bow
  hits; the source is equipped (or unarmed); a weapon-speed cooldown, with
  a splash window for sweeping attacks.
- Not checked: melee reach (the IsDistanceValid call is commented out, and
  its bow branch is what SkyMP's roadmap calls an incorrect shooting range
  check); facing or angle; who may be hit (any reference, oneself
  included); a rate for spell hits; any link from PlayerBowShot to the hit.
- Damage is the server's formula, but it trusts three client flags: power
  attack (x2), blocked (x0.1), sneak (x1.3) (formulas/TES5DamageFormula.cpp).
- unit/HitTest.cpp "OnHit doesn't damage character if it is out of range"
  never equips the weapon, so it exits at the not-equipped branch and
  passes at any distance: it does not test range.
- Melee reach, DONE 2026-10-03 for player against player
  (docs/verbs/melee-reach.md, on parity 15eb653d): the largest reach the
  attacker's equipment allows, or the eye cast, plus both forward extents
  and 256 of slack; 447 units for a Nord with a sword. PvE, hosted NPCs,
  the cone and the client's damage flags are still open.

## Activation and containers (R1)

- Checked: an activator other than the player must be a hosted NPC; same
  worldspace; activation-parent-only objects; the gamemode's ActivateEvent
  and activationBlocked; disabled or deleted targets; for PutItem and
  TakeItem, the sender must be the container's occupant and own the counts.
- Not checked: the distance between activator and target. "Same
  worldspace" outdoors is all of Tamriel. The 512 and 256 unit reach in
  MpObjectReference.cpp measures the current occupant, not the activator.

## Character creation (R1, the record R0)

- Checked: the race menu must be open, and an accepted appearance closes
  it. A refusal is silent apart from onUpdateAppearanceAttempt, which no
  gamemode code handles.
- Bounded by the wire only: name, tint and headpart counts (wire-schema).
- Not checked: race allow-list (bannedEspmCharacterRaceIds filters NPC
  spawns, never players), sex, weight, headpart and texture-set validity,
  name content.
- Race allow-list, DONE 2026-10-03 (docs/verbs/character-creation.md, on
  parity c104128f): the race must have the Playable flag or be the race the
  server already records. Sex, weight, head parts, tints and the name are
  still recorded as sent.

## Client-side shape that never reaches a validator

- skymp5-client can put a negative count in an UpdateEquipment inventory
  entry (its getInventory sums base container and container changes; an item
  removed from the base nets to -1). The wire's recognizer refuses the
  message (E_JSON_SHAPE, count is u32), as the C++ plugin's reader did
  before it (it threw on the same field). Seen on sky-c1 at login on
  2026-10-02; later equipment messages pass.

## Order of work (proposal)

1. Movement: validate before relay (done, docs/verbs/movement-relay.md),
   then speed bounds from the game's movement records.
2. Activation distance.
3. Melee reach (player against player done 2026-10-03; the bow range
   question still open).
4. Character creation (race allow-list first; done 2026-10-03).
5. Damage flags: decide which of power, sneak and blocked the server can
   know itself.
