# Apocalypse's placed objects: every script that puts a reference into the world, by anchor and lifetime

thuum-cf, 2026-10-28, for the Raise Wall verb's table: "which other Apocalypse spells place world objects
by the same family of scripts (PlaceAtMe at the caster plus offsets, a lifetime from the effect), and do
any of them place at a projectile impact or on a hit target instead?" Read by apocrypha from the 10.2.3
archive in lab/.cache/mods/apocalypse-10.2.3 (the ESP's MGEF, SPEL, EXPL, ACTI, STAT, MSTT, FLST records
with their VMAD properties; all 206 compiled scripts disassembled; the placed meshes' blocks in the BSA),
2026-10-28. 40 of the 206 scripts call PlaceAtMe. Raise Wall's own read is in docs/MODS.md ("Four spells,
read for M2"), corrected the same day for its mesh (a MOPP collision body on SKYL_ANIMSTATIC, no navmesh
cut).

## The three anchors

Every placement is `<reference>.PlaceAtMe(<base>)` followed, where the object matters, by `MoveTo` with
offsets from the caster's position and yaw (`GetAngleZ`, `Math.Sin`, `Math.Cos`) and `SetAngle`. The
reference that receives PlaceAtMe is the anchor:

1. **The caster** (self-delivery spells: `akTarget` is the caster, or `akCaster` directly). The
   FabricateObject family: a base with real collision placed ahead of the caster, kept while the
   effect lasts, faded and deleted on `OnEffectFinish`.
2. **The hit target** (aimed, contact or target-actor delivery: `akTarget` is the struck actor): the
   object goes to the victim's feet.
3. **The projectile's impact**: an explosion whose record names a placed object (EXPL DATA), an
   activator carrying a spawner script whose `OnLoad` does the PlaceAtMe at `self` (the impact point)
   and then `Delete`s itself; or a target-location effect whose `akTarget` is the explosion's point.

## The caster-anchored family (Raise Wall's shape): collision bodies that stand in the world

| spell (MGEF) | script | placed base | collision | offsets | lifetime |
| --- | --- | --- | --- | --- | --- |
| Raise Wall, SPEL 0300CC14 (concentration, self) | WB_FabricateWall_Script | MSTT WB_AlterationAlt_MovableStatic_RaiseWall 03098529 (via FLST 0309852A, one entry), plus the glow ACTI WB_AlterationAlt_Activator_FabricateObject 030735E8 and an FXEmptyActivator marker | MOPP body, SKYL_ANIMSTATIC | 192 ahead along yaw, Z from -288 to -48, yaw = caster's; `TranslateToRef` at 512 | the concentration; on finish `Disable(fade)`, wait 5, `Delete` all three |
| Fabricate Object (fire and forget, self) | WB_MinorCreation_Script | one of: FURN CommonChair01, FURN CommonBed01, STAT RTCanalsBridge01 (a vanilla bridge), or a crafting station from `WB_Furniture[9]` (enchanting and alchemy workbenches, tanning rack, armor workbench, anvil, cooking spit, ...), chosen through two message menus; plus the glow activator | vanilla meshes, each with its own body | ahead along yaw by `WB_DistanceInFront`, a height fudge, yaw = caster's | the effect's duration; `OnEffectFinish` waits 0.5, `Disable(fade)` then delete; `OnUpdate` keeps it |
| Wind Running (fire and forget, self) | WB_Levitate_Script | three STAT WB_AlterationAlt_Static_Levitate | convex body | three platforms re-positioned under the caster every `WB_UpdateRate` from `OnUpdate` (`MoveTo` and `SetPosition`) | the effect; on finish wait 0.5, `SetPosition` away, `Delete` x3 |
| Shattering Crystal (constant, self ability) | WB_ShatteringCrystal_Script | ACTI WB_DestructionFrost_Activator_ShatteringCrystal | none (a marker) | at the caster, scaled | the ability; on finish `Disable(fade)`, wait 5, `Delete` |
| Hethoth's Grimoire (fire and forget, self) | WB_HethothsGrimoire_Script | ACTI WB_AlterationAlt_Activator_HethothsGrimoire (the floating book) and an FXEmptyActivator | none | ahead along yaw at `WB_Height`; `OnUpdate` keeps a follower box | the effect; on finish an explosion at the book, wait 2, `Delete` |
| King's Heart (fire and forget, self) | WB_FollowsPlayerAndBuff_Script | LIGH WB_RestorationTap_Light_KingsHeart on a box that follows the caster (`TranslateToRef`) | none | at the caster, re-aimed from `OnUpdate` | the effect; on finish wait 2, `Disable`, `Delete` |
| Gravisphere (no spell binds it in 10.2.3; aimed) | WB_IntoTheClouds_Script | STAT WB_AlterationTelekinesis_Static_Collider and STAT ..._Gravisphere | MOPP bodies | at the target with `WB_HeightStart` and `WB_ObjectHeight` | the effect; on finish `Delete`, `Disable(fade)`, wait 2.5, `Delete` |
| Control Weather, Locate Object, Deep Storage (fire and forget, self) | WB_ControlWeather2_Script, WB_LocateObject_Script, WB_DeepStorage_Script | the glow activator; a marker STAT WB_AlterationAlt_Static_LocateObject and a LIGH at the found ore; EXPL WB_AlterationEarth_Explosion_DeepStorage (the chest comes from the explosion's placed object, not the script) | none | at the caster | seconds (waits 3 and 2; `WB_InitialWait` then updates) |
| Bone Spirit, Bloodseeker (fire and forget, aimed, but placed at the caster) | WB_BoneSpirit_Script, WB_BloodStar_Script | STAT WB_RestorationUndead_Static_BoneSpirit, STAT WB_RestorationBlood_Static_Bloodseeker: orbs placed at the caster at `WB_StartHeight` that `TranslateTo` the target on `OnUpdate` | none | caster, then flight | the effect; `Delete` on finish |

Only the first three put a body in anyone's way: Raise Wall (a wall), Fabricate Object (furniture and a
bridge), Wind Running (platforms under the caster's own feet). Gravisphere would too, but no spell in the
10.2.3 records casts it.

## Placed on the hit target (aimed, contact, target actor)

| spell (MGEF) | script | placed base | collision | lifetime |
| --- | --- | --- | --- | --- |
| Tharn's Prison (aimed) and Enter the Dungeon (target actor), the same script | WB_TharnsGibbet_Script | STAT WB_AlterationBaleful_Static_TharnsPrison, STAT WB_ConjurationGhosts_Static_EnterTheDungeon, placed at `akTarget`, scaled, moved by `WB_Z`, yaw set | MOPP bodies: a cage around the victim | the effect; on finish `Disable(fade)`, wait 2.5, `Delete` |
| Banish Living (target actor) | WB_BanishLiving_Script | CONT WB_BanishLiving_Chest at the victim (twice: the chest that takes the victim's inventory) and ACTI BanishTargetFXActivator | the vanilla chest's | `SecondsBeforeKill`, the victim deleted, `SecondsBeforeDelete`, the chest deleted |
| Crackle (aimed) | WB_CrackleNew_Script | ACTI WB_DestructionShock_Activator_Crackle (the cloud) at the target, then `TranslateToRef` | none | 0.75 s waits; `Disable`, `Delete` |
| Talons of Nirn (contact) | WB_ShiftingEarth_Hazard_Script | three EXPL WB_AlterationEarth_Explosion_TalonsOfNirn_Rupture at the target, moved and translated | explosions | `WB_DispelDelay`, `WB_RockSpikeLinger` |
| Twister (aimed) and its Bear Cage hazard (contact) | WB_IceTempest_Script, WB_TornadoHazard_Script | EXPL WB_DestructionFrost_Explosion_Tornado x3 at the target; FXEmptyActivator | explosions | the effect |
| Backlash, Burn Undead, Creeping Cold, Necroplague, Fracture, Gank, Shadowbond, Apocalypse, Dragon's Teeth | their scripts | FXEmptyActivator markers at the target (and Apocalypse's three ACTI ElementalHost orbs, Fracture's explosion, Gank's EffectSummonBanishFX) | none | seconds to the effect's end |

## Placed at the projectile's impact

- **Target-location effect:** Summoning Rune (SPEL's MGEF WB_Con_Summon3_Effect_SummoningRune, delivery
  target location, with explosion): WB_Gate_Script places an FXEmptyActivator at `akTarget` (the
  impact), waits `WB_Delay`, moves the summoned actor there, deletes after 4 s.
- **Explosions whose placed object is a spawner activator**, the OnLoad-at-self pattern
  (`self.PlaceAtMe(...)` then `Delete(self)`): WB_AlterationAlt_Explosion_WellocsInstantForest places
  ACTI ..._WellocsInstantForest_Spawner_Simple whose WB_PillarSpawner_Simple_Script places one of three
  ACTI ..._WellocsInstantForest_Tree_1/2/3 (each with a collision body), scaled: trees that stand where
  the spell lands, the one impact-anchored family with bodies; WB_AlterationEarth_Explosion_ThrummingStone
  (and _2C) place the ThrummingStone spawner, whose script places ACTI ..._ThrummingStone (no collision)
  rising by `TranslateToRef` and deleted from `OnUpdate`; WB_AlterationTelekinesis_Explosion_DropZone
  places the DropZone activator, whose WB_SoftLanding_Script places HAZD ..._Hazard_DropZone;
  WB_DestructionFire_Explosion_VolcanoNew places the Volcano controller (lights and translated FX, deleted
  on `OnUnload`); WB_AlterationEarth_Explosion_Entomb_Spawner places the Entomb activator (deleted after
  5 s; the entombing itself is WB_Entomb_Quest_Script moving the victim); WB_AlterationAlt_Explosion_Milestones
  places the Milestones spawner (moves the five pre-placed anchor REFRs, no new objects);
  WB_DestructionShock_Explosion_CyclonicRift places a spawner that moves two pre-placed refs;
  WB_DestructionShock_Explosion_LightningStrike (_2C) and _FingersOfTheMountain_2 place activators with
  WB_DestroyAfterDelay_Script (wait `WB_Delay`, `Disable`, `Delete`), FX only; WB_AlterationAlt_Explosion_DetonateLock
  places the DetonateLock activator (a lock script). Explosions whose placed object has no script
  (Deep Storage's chest among them) are the engine's own placement, no Papyrus.
- Nothing in the mod places at a projectile impact from the effect script itself except through these
  two routes.

## For the server table

The caster family is the one Raise Wall's table generalises to: a base (or a small set chosen by menu),
offsets from the caster's position and yaw, a lifetime tied to the effect (concentration, or a duration)
plus a fade delay. Two differences to carry: Fabricate Object chooses its base through message menus
on the caster's seat (the choice must reach the server with the cast, or the server places only on the
menu's result), and Wind Running re-positions its three platforms every update rather than placing once.
The hit-target family (Tharn's Prison, Enter the Dungeon, Banish Living) anchors on the victim's
position at hit time; the impact family anchors on the explosion's point, with Wellocs Instant Forest the
one that leaves bodies. Everything else placed is a marker, a light or an explosion with no body, the
caster's own FX.
