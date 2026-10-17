# Apocalypse's target-location spells: where their point lives (2026-10-17)

The census (docs/private/apocalypse-census.md, Eli's copy) counts 27 learnable
target-location spells. In other games a figure's relayed cast placed them
wrong: the fire-and-forget path's TODO launches 200 units in front of the
figure, and CastSpellImmediate places a non-player's cast at its own magic
node. Two engine reads on sky-re (the re-analyst, 1.6.1170, every id by
`just addr`; HYPOTHESIS until a lab run or trace) give the shape. The second
was cut short when Ghidra dropped at 01:41 PDT, so no renames were saved.

## How the engine places one

- A player's target-location cast picks its point by a ray from the magic
  node along the character's aim (MagicCaster::FindPickTarget 34456, its ray
  34457), the spell's range x 22 units long, snapped to the navmesh when the
  costliest effect asks it. Any other caster gets no pick: its point is its
  own magic node (34447).
- A target-location effect with a projectile goes to 34452 and launches there
  through Projectile::Launch 44108, which the fork's launch hook already sees.
- With an area effect that is not Aimed, the actors in the area are gathered
  (41425), then 34413 places the effect's explosion at the point through
  43829, owned by the caster. 34413 calls no AddTarget, so it applies no
  spell number to anyone; its arguments hold the final point (after the pick
  and the snap) in RDX, its only caller is FindTargets 34410, and RCX's
  caster has its actor at +0xB8 (ActorMagicCaster.h:82) for a player filter.
- A summon's point goes to SummonCreatureEffect::SetLocation (slot 07),
  only for the player's casts.

## The 27, by what the point does

- 19 summon (area 0, no explosion): M3's, with hosting (Eli, 2026-10-16:
  the NPC classes move to M3). Another game should not replay them at all.
- About seven place an explosion that places an activator or a second
  explosion: Drop Zone, Frozen Orb, Volcano, Milestones, Welloc's Instant
  Forest, Thrumming Stone (its stagger reaches the area through FindTargets),
  and Dremora Mentor (nothing placed). Their activators' scripts are the
  census's "placed object runs its own script" class.
- Lightning Strike is not projectile-less: its rider launches a lobber, so
  fork m2-spell-launch (a33b5ffc, the launch relayed with the cast) covers it.

## The fix, for the explosion placers

- Caster side: a hook on 34413's entry, filtered in native to the player
  (rule 9), raising the point; SKSE publishes no event that carries it
  (ADR-034's exception). The point rides the cast's launch fields that
  m2-spell-launch adds.
- Observer side: 34413 called with the figure's caster, the relayed point
  and its cell, the spell and its largest-area effect, and an empty target
  list: the explosion, owned by the figure, at the caster's point. What it
  still does to the observer's player: the explosion's force (knockdown for
  Milestones and Welloc's), image space, light and sound, and its placed
  object, whose script the fork's SendEvent filter blanks.
- The probe: c1 casts Volcano and a summon at a marker 400 units ahead; on
  c1, 34413 and 43829's records against the pick; on c2, 34413 at c1's point
  and every AddTarget on c2's player.
