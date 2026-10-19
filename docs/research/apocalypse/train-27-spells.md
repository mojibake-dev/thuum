# Train-27: four Apocalypse spells, read from the records and the scripts (2026-10-18)

Research note for train-27, written by apocrypha at thuum-magnus's request after
playtest 23. Every fact below names its source:

- **records**: `Apocalypse - Magic of Skyrim.esp` 10.2.3 from lab/.cache/mods/apocalypse-10.2.3
  (the archive docs/MODS.md names, md5 26fa3eb0...), decoded with apocrypha's reader
  (chim/.scratch/apoc.py over espwalk.py; layouts per UESP "Skyrim Mod:Mod File Format"
  for SPEL, MGEF, PROJ, EXPL, HAZD, CTDA, and xEdit's wbDefinitionsTES5.pas for the
  CTDA function table, 402 entries, fetched 2026-10-18). Form ids are written as the
  plugin numbers them (prefix 03, its own index in the file); the lab's 1.6.1170 load
  order has the plugin at 0C, so 0x03031C4D is magnus's 0xC031C4D.
- **scripts**: the .pex files in lab/.cache/mods/apocalypse-10.2.3/scripts (unpacked from
  the mod's BSA), disassembled with chim/.scratch/pexdis.py (Papyrus 3.2 bytecode).
  Instruction numbers are the disassembler's.
- **Skyrim.esm was not read**: it is not on the Mac. Vanilla forms appear as ids, named
  only where a thuum doc already names them (FXEmptyActivator 000B79FF,
  docs/verbs/ghostwalk.md). What needs the ESM is listed under Open items.
- Statements about engine behaviour (what breaks invisibility, which effect lends a spell
  its projectile) are marked "engine" and are not read from the mod.

In an effect's own conditions, "Subject" is the actor the effect is being applied to and
"Target" is the caster (Creation Kit wiki, Magic Effect conditions; the Lightning Strike
conditions below read that way: HasPerk on Target is the caster's perk). Condition rows
are ANDed; a row with the OR flag is ORed with the row after it (UESP CTDA).

## 1. Shadowbond, SPEL 03031C4D (WB_Ill_Invis3_Spell_Shadowbond)

**Spell** (SPIT): Spell, Fire and Forget, delivery Target Actor, range 750, charge 0.5,
cost 182, half-cost perk 000C44C4 (Skyrim.esm). One effect: MGEF 03055B2F, magnitude 0,
area 0, duration 20. No spell-level conditions.

**Effect** MGEF 03055B2F WB_Ill_Invis3_Effect_Shadowbond "Shadowbond": archetype
**Script**, Fire and Forget, Target Actor; flags Recover, No Magnitude, No Area, FX
Persist, No Recast, Power Affects Duration, No Death Dispel; skill 21 (Illusion), min skill
50, base cost 85, resist value none (-1); keyword 030207B6 WB_Illusion_Keyword; hit shader
EFSH 03055B30 WB_IllusionShadow_FXS_ShadowRefuge; casting art ARTO 0311CC2D, hit art ARTO
0311CC2F, light LIGH 0311CC2E, image space modifier IMAD 030207BA WB_IllusionShadow_Imod.
Description: "Caster and target gain invisibility for <dur> seconds. When the invisibility
is broken, the caster and target swap places."
Conditions on the record (both AND, run on Subject): `IsActor == 1`, `GetDead == 0`.

**Script** WB_InvisProcTeleport_Script (VMAD on the MGEF), properties as the record sets them:

| property | value |
| --- | --- |
| WB_S_I050_Shadowbond_Spell_Proc | SPEL 03055B32 WB_Ill_Invis3_Spell_Shadowbond_Proc |
| MagicInvisibility | KYWD 0001EA6F (Skyrim.esm) |
| WB_CheckRate | 0.2 |
| WB_CheckLocation | False |
| FXEmptyActivator | ACTI 000B79FF (Skyrim.esm) |
| WB_IllusionShadow_Marker_Script_GhostwalkReturn | SOUN 030207BF |
| WB_IllusionShadow_VFX_GhostwalkReturn | RFCT 030207C1 |
| WB_IllusionShadow_Imod_GhostwalkReturn | IMAD 030207BC |
| WB_TriggerVFXDur | 3.0 |

The proc spell SPEL 03055B32: Spell, Fire and Forget, **delivery Self**, flags No
Absorb/Reflect (+0x200000), one effect MGEF 03055B31 WB_Ill_Invis3_Effect_Shadowbond_Proc,
duration **600**. That effect is archetype **Invisibility** (actor value 54), Self, keywords
0001EA6F MagicInvisibility and 030207B6, flags Recover, No Magnitude, No Area, FX Persist,
Hide in UI, Power Affects Duration, No Death Dispel; no script, no conditions.

The script's three events, every call in order:

`OnEffectStart(akTarget, akCaster)`: TheTarget = akTarget; TheCaster = akCaster;
TheBox = akTarget.PlaceAtMe(FXEmptyActivator, 1, False, False) (the box sits at the
target's position); Utility.Wait(0.25); Proc.Cast(akCaster, None); Proc.Cast(akTarget, None)
(each actor casts the Self spell on itself: both become invisible for up to 600 s);
RegisterForSingleUpdate(WB_CheckRate = 0.2).

`OnUpdate()`, every 0.2 s while the 20 s effect lives:
```
if (!TheCaster.HasEffectKeyword(MagicInvisibility) || !TheTarget.HasEffectKeyword(MagicInvisibility))
   && (casterLoc.IsSameLocation(targetLoc) || casterLoc.HasCommonParent(targetLoc) || !WB_CheckLocation)
      ; WB_CheckLocation is False, so the location clause is always true
    TheBox.MoveTo(TheCaster, 0, 0, 0, True)      ; 25: the box jumps to the caster's current spot
    TheCaster.MoveTo(TheTarget, 0, 0, 0, True)   ; 27: the caster goes to the target's spot
    TheTarget.MoveTo(TheBox, 0, 0, 0, True)      ; 28: the target goes to where the caster was
    Sound.Play on TheTarget, then on TheCaster (SOUN 030207BF)
    VisualEffect.Play(TheTarget, 3.0), VisualEffect.Play(TheCaster, 3.0) (RFCT 030207C1)
    WB_IllusionShadow_Imod_GhostwalkReturn.Apply(1.0)
    self.Dispel()                                ; ends the 20 s effect, so OnEffectFinish runs
else
    RegisterForSingleUpdate(0.2)
```

`OnEffectFinish(akTarget, akCaster)`: akCaster.DispelSpell(Proc); akTarget.DispelSpell(Proc);
TheBox.Delete().

**What triggers the swap**: not a timer and not an attack as such. The script polls, every
0.2 s, whether *either* actor still carries an effect with the MagicInvisibility keyword;
the first poll where one of them does not swaps them. The script never ends the
invisibility itself. What ends an Invisibility-archetype effect is engine behaviour
(engine; UESP Skyrim:Invisibility lists activating, attacking, casting and shouting), and
a dispel from anywhere counts too. If nothing breaks it within the 20 s of the main effect,
OnEffectFinish removes the proc invisibility from both and nobody moves.

**Who moves where**: positions are swapped at trigger time, not the positions at cast
time: the box is first moved onto the caster, then the caster onto the target, then the
target onto the box. Three MoveTo calls, all with abMatchRotation True.

**When the target is a player**: the effect lives on the *target* (Target Actor delivery),
so the script runs wherever that actor's effect scripts run; in the single-player model it
is one game, which casts the proc on both, watches both, and moves both. Nothing in the
records or the script distinguishes a player target from an NPC: no IsPlayer condition, no
player branch. Eli's observation (the caster jumped to the target's spot, the target never
moved, nobody went invisible on the target's own screen) matches a run in which only the
caster's game executed the script: its Cast on the target and its MoveTo of the target
produced nothing on the target's client, and the proc's invisibility existed only in the
caster's game. That mapping is an inference from the calls, not a reading of the fork.

Related: Ghostwalk's return (docs/verbs/ghostwalk.md) uses the same sound, VFX and imod
forms (030207BF, 030207C1, 030207BC) and the same WB_CheckLocation = False bypass.

## 2. Lightning Strike, SPEL 03002878 (WB_Des_Shock4_Spell_LightningStrike)

**Spell** (SPIT): Spell, Fire and Forget, **delivery Target Location**, range 125, charge
0.5, cost 361 (auto-calculated: the record does not set Manual Cost Calc), flags **Ignore
Resistance**, half-cost perk 000C44C1. Two effects, no spell-level conditions:

1. MGEF 030FADFD WB_Des_Shock4_Effect_LightningStrike "Lightning Strike", magnitude 60,
   area 0, duration 0.
2. MGEF 03100BA6 WB_Des_PerkDisintegrateFFTargetLocation_LightningStrike "Location
   Disintegrate", magnitude 200, area 0, duration 1.

**Effect 1** (the damage): archetype **Dual Value Modifier**, actor values 24 Health and
25 Magicka, Target Location, Fire and Forget; flags Hostile, Detrimental, No Duration,
Power Affects Magnitude; base cost 4, skill 20 (Destruction), min skill 75, resist value 42
(shock resistance, overridden by the spell's Ignore Resistance flag); keywords 0001CEAF
(Skyrim.esm), 0302283B WB_Destruction_Shock, 03022839 WB_Destruction, 000A9B1F
(Skyrim.esm), 03044D4E WB_Conjuration_NoNecrowitch; light 00057C68, casting art 00058E9B,
image space modifier 000A9D93 (all Skyrim.esm). **No projectile and no explosion of its
own**, no script, no conditions. Description: "Lightning strikes the target location,
dealing <mag> shock damage to Health and Magicka."

**Effect 2** (the perk rider, and the only carrier of the visuals): archetype Value
Modifier on Health, Target Location; flags Hostile, Detrimental, FX Persist, Hide in UI,
Power Affects Magnitude, No Death Dispel; **projectile PROJ 030CFE00**, dual cast art DUAL
03100BAA. Conditions on the record, all AND:

| # | condition | run on |
| --- | --- | --- |
| 1 | `HasPerk(PERK 000F3F0E) == 1` | Target (the caster) |
| 2 | `GetActorValuePercent(Health) < 0.15` | Subject (the actor hit) |
| 3 | `HasKeyword(KYWD 00000EDF) == 0` | Subject |

Script on it: magicAttachAshPileOnDeath (a vanilla script name; not shipped in the mod's
scripts folder, so not read here) with ShaderDuration 4.0, fDelay 1.25, MagicEffectShader
EFSH 000D22FB, ImmunityList FLST 000F6534 (both Skyrim.esm).

**How the bolt is produced**, from the chain on effect 2:

- PROJ 030CFE00 WB_DestructionShock_Projectile_LightningStrike: type **Lobber**, flags
  **Explosion, Alt. Trigger**, gravity 1.5, speed 768, range 1024, **alt-trigger timer
  2.5 s** (proximity 0), collision radius 50, relaunch interval 0.25, fade 0.5, light
  00056ACA, model `ApocNew\DestructionShock_Hazard_LightningStrikeIncoming.nif` (the bolt
  coming down), collision layer **COLL 03100BA7 WB_L_NoCollision** ("No Collision",
  description "Used for Lightning Strike", collides-with mask 0: it hits nothing, so the
  timer is what sets off its explosion).
- EXPL 030F5058 WB_DestructionShock_Explosion_LightningStrike: **damage 0**, force 512,
  radius 300, image-space radius 1024, flags Always Uses World Orientation, Ignore Image
  Space Swap (+0x1), light 000E7555, sounds SNDR 0300185C and 000A0F53, imod IMAD
  03001869, model `Magic\ExplosionShock01.nif`, **placed object ACTI 030FADFF**, no spawn
  projectile.
- ACTI 030FADFF WB_DestructionShock_Activator_LightningStrike: model
  `ApocNew\DestructionShock_Hazard_LightningStrike.nif` (the strike itself), no sound,
  script WB_DestroyAfterDelay_Script with WB_Delay 0.3.
- WB_DestroyAfterDelay_Script, the whole script: `OnLoad()`: Utility.Wait(WB_Delay);
  self.Disable(False); self.Delete(). Nothing else; no OnCellAttach, no timer fallback.

So: a Lobber projectile that collides with nothing carries the incoming-bolt model and
explodes on its 2.5 s timer; the explosion places an activator carrying the strike model,
and that activator removes itself 0.3 s after its 3D loads. No hazard record is involved
(no HAZD anywhere in the chain). **Lifetime**: the projectile until its timer, the placed
activator until OnLoad plus 0.3 s. **What removes it**: only that script's Disable and
Delete. Eli's "bolt stayed animated on the caster's screen" is the activator surviving,
which happens if OnLoad never runs for a placed object there; "invisible to the other
player" matches an explosion and a placement that exist only in the caster's game
(docs/MODS.md: PlaceAtMe of an explosion reaches the clients only). Both are inferences
from the calls, not readings of the fork.

**How damage reaches an actor**: the explosion record itself deals 0 damage. The spell's
two effects are what apply to actors within the explosion's radius 300 (Target Location
delivery); effect 1 is the 60 Health plus 60 Magicka hit, effect 2 only applies when its
three conditions hold (caster has perk 000F3F0E, victim under 15 % health, victim lacks
keyword 00000EDF). There is no direct spell, no second cast and no hazard tick.

**Open point for the engine**: which effect lends the spell its projectile. The Creation
Kit wiki says a spell's projectile and arts come from its costliest effect (engine), and
by the cost formula effect 1 is the costliest (4 x 60^1.1 = 362, matching SPIT cost 361;
effect 2 has base cost 0), yet effect 1 has no projectile and effect 2 has the bolt. If the
engine falls back to another effect's projectile, that is what makes the bolt appear;
docs/research/apocalypse/target-location.md's read (34452 launches a target-location
effect's projectile) is the place to confirm it on sky-re.

## 3. Acceleration Rune, SPEL 03124EC9 (WB_Alt_CrowdControl5_Spell_AccelerationRune)

**Spell** (SPIT): Spell, Fire and Forget, **delivery Target Location**, range **20**,
charge **3.0**, cost 1250, flags Ignore Resistance, half-cost perk 000C44BA. One effect:
MGEF 03124955, magnitude 0, area 0, duration 0. No spell-level conditions.

**Effect** MGEF 03124955 WB_Alt_CrowdControl5_Effect_AccelerationRune_Location "Acceleration
Rune": archetype **Script**, Target Location, Fire and Forget; flags Hostile, Detrimental,
No Duration, No Magnitude, No Recast, Painless, No Death Dispel; base cost 1250, skill 18
(Alteration), min skill 100, resist value none; keywords 00109D79 and 000806E1
(Skyrim.esm), 03002E1C WB_Alteration_Disable, 0303C52A WB_Alteration; **projectile PROJ
0312494C**; hit shader EFSH 03004404, hit art ARTO 0311BBD6, impact data IPDS 03124954,
light 0002016B and casting art 0002016C (Skyrim.esm); equip ability SPEL 0311C140 (a
constant-effect body-art holder, no mechanics). Description: "Cast on a nearby surface,
launches enemies in the direction they are moving."
Condition on the record: `HasKeyword(KYWD 000172AC) == 0`, run on Subject.

**The rune's projectile** PROJ 0312494C WB_AlterationTelekinesis_Rune: type **Lobber**,
flags **Explosion, Alt. Trigger**, **alt-trigger proximity 75** (the trigger radius; timer
0), gravity 0, speed 1000, range 10000, collision radius 50, relaunch interval 0.25, fade
0.5, model `ApocNew\AlterationTelekinesis_Rune.nif`, decal TXST 03124EDA
WB_DecalRune_Telekinesis, collision layer COLL 00100F2F (Skyrim.esm). There is no
"sticks to surface" flag in the PROJ flag set (UESP PROJ DATA flags); a rune is a Lobber
with Alt. Trigger by proximity, and its DATA has no field beyond those listed.

**Its explosion** EXPL 03124ED8 WB_AlterationTelekinesis_Explosion: **damage 0, force 8,
radius 128**, image-space radius 1024, vertical offset multiplier -10, flags **Ignore LOS
Check**, Ignore Image Space Swap (+0x1); neither knockdown flag (Knock Down Always 0x4,
Knock Down By Formula 0x8) is set; sounds SNDR 03003E81 and 0003C8FC, imod IMAD 03003E80,
model `ApocNew\AlterationTelekinesis_Explosion.nif`, no placed object, no spawn
projectile.

**The launch is scripted**, WB_AccelerationRune_Script on the effect, properties
FXEmptyActivator 000B79FF, MAGAlterationTelekinesisThrow SOUN 00053A60 (Skyrim.esm),
WB_AlterationTelekinesis_VFX_Strike RFCT 03004403, WB_FlingForce 32.0, WB_DistanceInFront
-150.0, WB_StartingBoxDisplacedZ -10.0. Its only event, `OnEffectStart(akTarget, akCaster)`,
runs once per actor the explosion applies the effect to:

```
StarterBox = akTarget.PlaceAtMe(FXEmptyActivator, 1, False, False)
x = akTarget.GetPositionX() + Math.Sin(akTarget.GetAngleZ()) * -150
y = akTarget.GetPositionY() + Math.Cos(akTarget.GetAngleZ()) * -150
z = akTarget.GetPositionZ() + -10
StarterBox.SetPosition(x, y, z)                 ; 150 units behind the actor's facing, 10 lower
StarterBox.PushActorAway(akTarget, 32.0)        ; the fling, away from the box, so forward
MAGAlterationTelekinesisThrow.Play(akTarget)
WB_AlterationTelekinesis_VFX_Strike.Play(akTarget, 5.0, None)
StarterBox.Delete()
```

So the "launch" direction is the actor's facing (GetAngleZ), not its velocity, despite the
description, and the force is PushActorAway's 32, not the explosion's 8. Damage: none from
the explosion, none from the effect (No Magnitude, Painless); any hurt comes from the fall.

**Against vanilla Frost Rune 0006796F**, read from Skyrim.esm on sky-srv by thuum-magnus's
reader (raw subrecord hex, 2026-10-18, decoded here with the same code; the file is kept as
chim/.scratch/frost-rune-records-20261018.txt). The vanilla rune's explosion is not on its
MGEF (DATA+76 is 0) but on its projectile (PROJ DATA+36 = EXPL 00044089); that EXPL's bytes
are still to come (Open items), the rest is read:

| field | Acceleration Rune (Apocalypse) | Frost Rune (Skyrim.esm) |
| --- | --- | --- |
| SPEL | 03124EC9, Target Location, FF, range 20, charge 3.0, cost 1250, Ignore Resistance | 0006796F FrostRune, Target Location, FF, range 20, charge 0.5, cost 293, Ignore Resistance |
| effect on the spell | magnitude 0, area 0, duration 0 | magnitude 50, area 0, duration 1 |
| MGEF | 03124955, archetype **Script**, No Magnitude, Painless, No Recast, Hostile, Detrimental, No Duration, No Death Dispel; min skill 100 | 0006796D RuneFrostFFLocation, archetype **Dual Value Modifier** (Health 24 and Stamina 26), Hostile, Detrimental, FX Persist, No Recast, Power Affects Magnitude, No Death Dispel; base cost 50, resist 43 (frost), min skill 25 |
| MGEF keyword(s) | 00109D79, 000806E1, WB_Alteration_Disable, WB_Alteration | 00109D79 only |
| MGEF conditions | `HasKeyword(000172AC) == 0` on Subject | none |
| MGEF script | WB_AccelerationRune_Script (PushActorAway 32 from a box behind the actor) | none |
| MGEF explosion field | 0 | 0 |
| PROJ | 0312494C: Lobber, Explosion + Alt. Trigger, **proximity 75**, timer 0, speed 1000, range 10000, collision radius 50, relaunch 0.25, fade 0.5, layer 00100F2F, decal WB_DecalRune_Telekinesis | 0005FBBF RuneFrostProjectile: Lobber, Explosion + Alt. Trigger, **proximity 150**, timer 0, speed 1000, range 10000, collision radius 50, relaunch 0.25, fade 0.5, layer 00100F2F, decal 0003AC49 |
| EXPL (from the PROJ) | 03124ED8: damage 0, force 8, radius 128, IS radius 1024, vertical offset x-10, Ignore LOS Check, no knockdown flags, no placed object | 00044089: pending the bytes |

So the rune mechanism itself is vanilla's, down to the collision layer, speed, range and
relaunch interval: a Lobber that sits where it lands and sets off its explosion when an actor
comes within the alt-trigger proximity. Three things differ. The trigger radius is half
(75 against 150). The charge time is six times longer (3.0 s against 0.5). And the payload
is a script, not an effect: vanilla hurts through its Dual Value Modifier (50 Health and
Stamina, frost) applied to the actors the explosion reaches, with no script and no
conditions; Acceleration Rune's effect has no magnitude and is Painless, is gated by a
keyword test on the actor, and does its work with PushActorAway. Whether the two explosions
differ in radius or knockdown waits on EXPL 00044089.

## 4. Azure Reconstruction, SPEL 03088694 (WB_Con_Heal1_Spell_AzureReconstruction)

**Spell** (SPIT): Spell, **Concentration**, **delivery Target Actor**, range 200, charge
0.5, cost 3, flags No Absorb/Reflect (+0x200000), half-cost perk 000F2CA7. One effect:
MGEF 03126DA1, magnitude 10, area 0, duration 0. No spell-level conditions.

**Effect** MGEF 03126DA1 WB_Con_Heal1_Effect_AzureReconstruction "Azure Reconstruction":
archetype **Value Modifier** on actor value 24 Health, Concentration, Target Actor; flags
FX Persist, Power Affects Magnitude (not Hostile, not Detrimental); base cost 0.25, skill
19 (Conjuration), resist value none; keywords 0001CEB0 (Skyrim.esm) and 03037E14
WB_Conjuration; projectile 00012FDC (Skyrim.esm), light 0003BA90 and casting art 000510CF
(Skyrim.esm), hit art ARTO 03088690. Description: "Heal a conjured minion <mag> points
per second." Script on it: SayOnHitByMagicEffectScript (vanilla name, not shipped by the
mod) with AllowForTeammate 1, GameDaysPassed GLOB 00000039, WICastNonHostileTimer
00000E0CDC, TopicToSay 000AB884 (Skyrim.esm): the comment line, no mechanics.

**Its CTDA list**, in record order, every field:

| # | function (index) | parameters | compare | value | run on | flags |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | IsCommandedActor (700) | none | == | 1.0 | Subject | none |
| 2 | GetActorValuePercent (640) | ActorValue 24 (Health) | < | 1.0 | Subject | OR |

Row 1 has no OR flag, so it is ANDed with what follows; row 2 carries OR but is the last
row, so there is nothing for it to OR with. The effect applies when the actor it is cast at
**is a commanded actor** (a summoned or reanimated creature under someone's command, which
is what IsCommandedActor reads) **and** is below full health. Both rows run on Subject, the
actor receiving the heal; neither reads the caster. There is no IsPlayer, no faction and no
keyword test: a player who is not a commanded actor fails row 1, which is the "resisted"
Eli's own game showed while the server, not evaluating it, healed. For the server,
"target is a summon" is exactly `IsCommandedActor == 1` on the target, from this effect's
MGEF-level CTDA (not a spell-level one: libespm drops spell-level CTDA bytes but this list
sits on the MGEF record, docs/research/apocalypse/effect-conditions.md).

## 5. Census: effects aimed at another actor that carry conditions

Counted over all 373 SPEL and 556 MGEF records of the plugin. An "effect slot" is one EFID
on a spell; a slot "carries conditions" when CTDAs follow its EFIT on the spell or sit on
its MGEF record. "Aimed at another actor" is read as a spell delivery other than Self
(Touch, Aimed, Target Actor, Target Location); the table gives each so the line can be
drawn elsewhere.

| spell delivery | effect slots | with conditions |
| --- | --- | --- |
| Aimed | 254 | 118 |
| Target Actor | 57 | 39 |
| Touch | 23 | 19 |
| Target Location | 36 | 7 |
| **non-Self total** | **370** | **183** |
| Self (for contrast) | 274 | 109 |

Of those 183, the conditions live on the MGEF record in 160 slots and after the EFIT on
the spell in 31 (some slots have both); 157 distinct MGEFs are involved. By the MGEF's own
delivery field: Aimed 103 of 179 MGEFs carry conditions, Target Actor 36 of 52, Touch 22
of 27, Target Location 7 of 37. All 370 slots are on records of type Spell (no powers or
abilities among the non-Self deliveries).

The condition functions, counted per CTDA row across those 183 slots, 40 distinct
functions in all; the ten most common (CTDA function index per xEdit):

| rows | function (index) | run on |
| --- | --- | --- |
| 179 | HasKeyword (560) | Subject 179 |
| 69 | GetDead (46) | Subject 69 |
| 67 | IsActor (353) | Subject 67 |
| 44 | IsUndead (715) | Subject 44 |
| 32 | IsHostileToActor (719) | Subject 32 |
| 29 | GetGlobalValue (74) | Subject 29 (reads a GLOB, no actor) |
| 27 | IsCommandedActor (700) | Subject 27 |
| 24 | HasMagicEffectKeyword (699) | Subject 18, Target 6 |
| 17 | HasPerk (448) | Target 16, Subject 1 |
| 17 | GetActorValuePercent (640) | Subject 15, Target 2 |

Next in line: HasEquippedSpell 14, GetIsID 13, HasMagicEffect 9, GetActorValue 7,
IsEssential 7, then GetIsFlying, GetIsRace, IsInList, GetDistance (4 each), IsCasting,
IsProtected, GetFlyingState, IsInCriticalStage, GetCurrentCastingType, GetIsObjectType (3
each), and 15 functions with one or two rows (IsInInterior, GetPlayerTeammate, IsInScene,
IsBeingRidden, IsStaggered, GetRandomPercent, GetRelativeAngle, IsChild, GetLineOfSight,
GetIsGhost, GetRestrained, IsMoving, GetBaseActorValue, GetCurrentDeliveryType,
GetVATSBackAreaFree). 58 MGEF-level rows in the plugin carry the OR flag; 3 compare
against a GLOB instead of a constant. The full per-row output is in
chim/.scratch/train27.py's run (apocrypha's scratch), reproducible from the esp.

## 6. Census: what Apocalypse's explosions place, and which of those carry scripts

For the stuck-bolt hypothesis (a client that does not run Papyrus events on objects the
server did not make). Counted over the plugin's 87 EXPL records (placed object at DATA+16),
with the placed object's VMAD and the event names present in its .pex string table:

- 29 explosions place an object; 28 distinct objects: **13 ACTI, 12 EXPL** (sub-explosions
  chained from a parent, Meteor, Frost Nova, Shock Nova, Scorching Hands, Corpse Explosion,
  Skull Trap, Thrumming Stone), **2 HAZD** (Static Dome, Talons of Nirn) and one Skyrim.esm
  object (00055926, from EXPL 030AC53E). 24 MGEFs reach such an explosion directly or through
  their projectile.
- **All 13 placed activators carry a script, and every one of those scripts handles
  OnLoad**; none of the sub-explosions or hazards carries one. The thirteen: Lightning Strike
  030FADFF and Fingers of the Mountain 031124AE (both WB_DestroyAfterDelay_Script, OnLoad
  only); Frozen Orb 0302C583 (WB_FrozenOrb2_Script, OnLoad, OnUpdate, OnUnload); Volcano
  controller 030834AD (WB_VolcanoController2_Script, OnLoad, OnUpdate, OnUnload); Thrumming
  Stone spawners 030A5390 and 030A5393 (WB_ThrummingStone_Spawner_Script, OnLoad,
  OnUpdate); Wizardfire 0305C717 (WB_WizardfireSelfDamage_Script, OnLoad); Drop Zone 03084542
  (WB_SoftLanding_Script, OnLoad); Wellocs Instant Forest spawner 030AD578
  (WB_PillarSpawner_Simple_Script, OnLoad); Entomb 030AE5AB (WB_Entomb_Activator_Script,
  OnLoad); Milestones spawner 030AE5BD (WB_MilestonesSpawner_Script, OnLoad); Cyclonic Rift
  spawner 030B5D19 (WB_CyclonicRift_Spawner_Script, OnLoad); Detonate Lock 0300857A
  (WB_LockActivator_Script, OnLoad).

So if a placed object's OnLoad does not fire, the Lightning Strike bolt is one of thirteen
Apocalypse placements that never clean up or never start their work; the two with OnUpdate
loops (Frozen Orb, Volcano) and the spawners also never spawn what they are meant to.

## Open items

1. **Vanilla Frost Rune's explosion**: EXPL 00044089 (named by PROJ 0005FBBF's DATA+36) in
   Skyrim.esm on sky-srv; its DATA (52 bytes) and EDID fill the last row of the section 3
   table. The SPEL, MGEF and PROJ arrived 2026-10-18 and are in the table.
2. **Which effect lends Lightning Strike its projectile** (section 2): an engine read.
3. **Vanilla names not resolved here**: KYWD 0001EA6F (MagicInvisibility is the script
   property's name for it), 0001CEAF, 000A9B1F, 00109D79, 000806E1, 000172AC, 00000EDF,
   0001CEB0; PERK 000F3F0E; PROJ 00012FDC; COLL 00100F2F; SOUN 00053A60; EFSH 000D22FB;
   FLST 000F6534; the perks 000C44C4, 000C44C1, 000C44BA, 000F2CA7. All Skyrim.esm.
