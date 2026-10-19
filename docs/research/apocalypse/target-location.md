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

## The explosions' own numbers, read (lab/esm.py on sky-srv, 2026-10-18)

ADR-037's two paths need an EXPL that carries damage or an enchantment.
Among Apocalypse's 87 explosion records, 3 carry damage (Detonate Lock 1,
Skull Trap 1, Frozen Orb's end 2) and none an enchantment; Lightning
Strike's (0x030f5058, force 512, radius 300) and Thrumming Stone's (four
records, force 128 to 256) carry neither. Lost Grimoire: 10 of 54, five
with enchantments. Skyrim.esm: the fire and shock rune explosions carry
damage 2, Fireball's impact explosion damage 2, the frost rune explosion
0x44089 the enchantment SlowFrostRune 0xb72a2 (40 frost, 50 slow for 5 s).
The gates' probe (x-explosion-gate) therefore uses the vanilla runes, which
both games know without a layer, and runs ungated on train-25 first. The
full list is in the ADR.

## The observer's call, read (the re-analyst on sky-re, 2026-10-17 evening)

Every id by `just addr` on 1.6.1170; the signature CONFIRMED-STATIC, the
behavior HYPOTHESIS until a trace. Decompile dumps in the session's
scratchpad (re34413/).

- 34413 is `void (MagicCaster* caster, const NiPoint3* point, TESObjectCELL*
  cell, MagicItem* spell, Effect* effect, BSScrapArray<NiPointer<TESObjectREFR>>*
  targets)`, the last two on the stack. FindTargets 34410 passes
  MagicItemDataCollector's largestAreaEffect, and calls it only when that
  effect's delivery is not Aimed. It reads the caster through three virtuals
  (GetCasterAsActor, GetMagicNode, GetIsDualCasting) and desiredTarget, never
  currentSpell or state. Use REL::ID(34413) on 1.6.1170 alone: CommonLib binds
  SE 34413 to DialogueItem::Ctor.
- It gathers nothing (41425 filled the list) and applies no number: it
  creates the explosion (43829: factory 43812, constructor 43827, Initialize
  43830, which places the EXPL's impactPlacedObject through 13723), owned by
  the caster's actor, radius the EXPL's or area x 22, the dual cast's
  explosion and scale when dual casting. A Spawn Scripted Ref effect
  (archetype 43) pushes its placed object into the list. The spell's own
  effects reach actors through 34461, after 34413, which a direct call never
  runs.
- Calling it from the observer's game: the figure's GetMagicCaster(hand) (its
  actor owns the explosion), the relayed point, TES::GetCell(point) (skip
  when null or not attached), the spell, the largest-area effect of a
  MagicItemDataCollector traverse, an empty BSScrapArray; on the main thread
  (SKSE TaskInterface::AddTask); the dual-cast flag mirrored.
- What else lands on the observer's player inside the radius: the
  explosion's own pass (43847, 43849) always lists the player, then deals
  the EXPL record's DATA damage through Actor::DamageActor 37335 and casts its
  enchantment through the owner's instant caster: both outside the fork's
  AddTarget refusal (Hooks.cpp: a figure's spell-type H/M/S effects), the
  first never touching AddTarget, the second an EnchantmentItem. So a figure
  owned explosion would apply its record's numbers locally beside the
  server's. ADR-028's rule (the server's numbers alone reach a player)
  extends to both paths: the refusal covers a figure's enchantments, and the
  explosion pass skips damage and enchantment when its owner is a figure (or
  37335 refuses a figure attacker). Which spells it matters for depends on
  each placer's EXPL record (DATA damage, EITM), unread.

## Measured on parity ef02c565 (x-class-location 20261018-013501)

Thrumming Stone, Lightning Strike and Acceleration Rune cast at the ground
300 units ahead of c1: in c2's game the figure launched nothing (0 launches
in its watch) and c2's screenshots after each cast show no explosion, strike
or rune anywhere, not even misplaced; the server logged no cast and no hit
for any of the three. So today an observer sees a target-location spell's
cast animation and nothing else. The fix is the observer's call above, with
m2-spell-launch's relayed point for the projectile ones (Lightning Strike's
lobber, the rune).


## Built (fork m2-area-effect 5a7d2478, 2026-10-17 evening, on train-24)

- Skyrim Platform: game/Offsets.h PlaceAreaEffect (REL::ID(34413), AE only);
  a Frida hook on it filtered to the player's caster raising areaEffectPlaced
  (spell, effect, point, dual); the native placeAreaEffect(actor, spell,
  hand, x, y, z, dual) making the call as read above, on the game thread,
  with the point's attached cell and the spell's largest-area non-Aimed
  effect.
- skymp5-client: the sender carries the placed point as the cast's launch
  (angles zero) and waits for it as for a projectile's; the observer calls
  placeAreaEffect at the relayed point for a spell whose area effect has no
  projectile, after castSpellImmediate.
- Still HYPOTHESIS, for the rerun of x-class-location on the branch: the
  explosion appears at c1's point in c2's game and is owned by the figure;
  what its record's damage and enchantment do to c2 standing in it (the
  ADR-028 extension is not built; Thrumming Stone's stagger on c2 is the
  first reading).

## Measured on train-25 b352b82d (x-class-location 20261018-135152, against train-24's 102618)

- Thrumming Stone: cast (the probe's draw-weapon first), and placed in c2's
  game: the figure's launch with projectile 0 and the spell at the relayed
  point (133759.86, -61909.27, 14642.74; 490 units from c1, behind c2), the
  figure's three hit events 31 ms later on c2's player, itself and a world
  reference, and c2's own `taken` from the figure with the explosion's spell
  0x0c0a5391. No stagger anywhere (the spawner's script is blanked in every
  game, as the census says), nothing in the screenshots (the point was
  behind the camera), c2's health flat. Train-24's run cast nothing (its
  first hold drew). So the relay places the explosion where the caster's
  engine did; the look of it on the other screen is for the playtest's
  eyes.
- Lightning Strike and Acceleration Rune: no spellCast event in c1's game
  in either run, the figure replaying a full cast (the action relay) and the
  magicka refunded (the rune: 3000 to 1898 and back): the casts fizzled for
  want of a ground point within range. Cause: the lab's aim. The driver's
  look step (ObjectReference.SetAngle on the player) reads back pitch 0 and
  does not pitch the first-person view, so every "20 degrees down" in the
  class pass and in b-target-location was level, the pick ran out to 490
  units, and the two short-range spells had nowhere to land (Thrumming Stone
  reaches). b-target-location (20261018-135949 on bad ids, 140829 on good
  ones: zero launches of either spell) and x-explosion-gate's runes cannot
  pass in the lab until the driver can aim down: a lab item (a mouse or
  camera-pitch step, or a native that sets the player's look pitch), filed
  in docs/PLAN.md. The playtest measures them by eye meanwhile.

## Playtest twenty-three (2026-10-18, Eli, parity d5b05e89; results/playtest-23)

- Eli: the rune is invisible to player two; when tripped, player two's
  figure collapses on the caster's screen only and player two sees no
  damage; Lightning Strike is invisible to player two, deals no damage, and
  its bolt from the sky stays animated on the caster's screen after the
  strike.
- The logs: no SpellCast ever reached the server for 0x6796F or 0xC124EC9;
  the caster's Skyrim Platform log (c1.log) shows the cause, three
  on('spellCast') exceptions ("Cannot read properties of undefined (reading
  'prototype')", 18:48:25, 18:49:50, 18:49:58 PDT) and two on('hit')
  exceptions ("Bad call result 4", 18:49:55) in this window and nowhere
  else; the rune's hits on the figure then arrived with no cast to claim
  against and were refused (E_SPELL_NO_CAST, 331 to 496 units away). So
  nothing of this was the relay or the pitch: the caster's client threw.
  MEASURED for the exceptions and the refusals; HYPOTHESIS that the same
  throw hides Lightning Strike and leaves its bolt (its casts were never
  logged either), and for where the throw is (the target-location cast
  path's MagicEffect.getProjectile wrapper, or the hit's getBaseObject on
  a projectile target, LAB.md's "any call on a projectile reference
  aborts"). Train-27's first row: a solo probe casting Frost Rune level from
  the spawn reproduces the cast-time throw without pitch, with the stack
  logged; the handlers made safe; then the observer's placement and the
  server's number read again.
