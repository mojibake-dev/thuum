<!-- Copied into thuum 2026-11-05 from a read-only census agent's report (thuum-cf) and the build fork's re-measure against the
rule as built. Their readers (scripts_census.py, vmad_census.py, analyze.py, final.py, q3.py, more.py, verify_dt1.py) lived in a
session scratchpad and on sky-srv's /tmp; they use the deployed lab copies of lab/pex.py, lab/tools/bsa-extract.py and
lab/labapi/labapi/slots.py, and "#n" is an instruction index in lab/pex.py's disassembly of a script's winning copy. -->

# D-T1's census: which trap scripts the class chain misses (2026-11-05)

Read-only, 10:55 PST 2026-11-05 (18:55Z 11-05), for ADR-068 D-S3's D-T1 (docs/research/trap-slice-d-s3-2026-11-05.md, its
finding F1 and its Decisions). Every count comes from the lab's 1.6.1170 load order on sky-srv: Skyrim.esm and the 99 later
plugins of /srv/persist/mods/plugins.txt, each script's winning copy, each form's winning record. Nothing ran on the lab. The
rule as built (fork m4-scripts-2b-traps ff9b804a) was measured again within the hour; its numbers are the last section's.

## How the copies and attachments were read

- Which copy of a script wins: the ini's archives first (Skyrim_Default.ini:48-49), then each plugin's archive in the engine's
  masters-first order (slots.py:46-49), then loose Data/Scripts files on top (AFK Mods, "BSAs and You",
  https://www.afkmods.com/index.php?/topic/4280-update-bsas-and-you/). 15,240 winning scripts, 0 parse errors; Skyrim - Misc.bsa
  carries 14,026 of them (the DLCs' included: the depot has no DLC archive), USSEP 4.3.8a's archive 1,724.
- Which scripts a reference runs: its base's VMAD plus its own (the Creation Kit's Papyrus introduction,
  https://ck.uesp.net/wiki/Papyrus_Introduction, read through a search summary because the page answers 403). All 100 plugins,
  the winning record per form: 16,642 scripted base records, 33,142 scripted references, 0 parse failures. References flagged
  deleted (0x20) are skipped.
- A reference is family only when EVERY script on it passes (F2: the gate decides per reference, so one passing script would
  open the event to all of them).

## 1. Scripts whose name starts with "trap", any case: 32

19 reach the class chain (TrapBase, TrapTriggerBase, TrapHitBase): the three roots (each a child of ObjectReference); under
TrapBase, TrapDweBallista, TrapFlamethrower, TrapGenericEffectHazard, TrapRiggedRockfall; under MovingTrap then TrapBase,
TrapDweFlamePillar, TrapDwePiston, TrapDweThresher, TrapNorPlatform, TrapSwingingWall; under TrapHitBase, TrapDweFlamePillarHit,
TrapDweThresherHit; under TrapTriggerBase, TrapFirePlate, TrapLever, TrapRiggedBeam, TrapTriggerHinge, TrapTriggerTimeInterval.

13 fall outside, so F1's "three" undercounts: TrapBear, TrapBreakAwayBase, TrapExplosiveGas, TrapFallingOilLamp,
TrapFallingOilLampAnim, TrapFallingOilLampColLayer, trapMagicLoot, TrapOilPool (extends TrapExplosiveGas), TrapPoisonGas,
TrapPoisonGasCough (extends ActiveMagicEffect), trapRockfallEffects, trapSight, trapSoulGemController; all but those two extend
ObjectReference directly. USSEP's copy wins for 11 of the 32 (TrapBear, TrapDweFlamePillar, TrapDweThresher, TrapExplosiveGas,
TrapFallingOilLampColLayer, TrapFlamethrower, TrapHitBase, trapSoulGemController, TrapSwingingWall, TrapTriggerBase,
TrapTriggerHinge), Skyrim - Misc.bsa's for the other 21; no Creation Club, mod-layer or loose copy of any of them exists. Four
names begin with a lowercase "trap", so a case-sensitive test would lose trapRockfallEffects and trapSoulGemController.

## 2. What the drafted option A would have admitted

As drafted (TrapFamily.cpp:30-31 on bd0c8cf8), A put the prefix in IsFamilyName, which IsFamilyType calls for every class up the
parent chain (:154-171, ADR-044's shape), so A also admitted TrapExplosiveGas's two quest subclasses.

| Script | What it does | References | Most in |
| --- | --- | --- | --- |
| TrapOilPool | lit by fire: DamageObject, PlaceAtMe fire | 798 (764 on TrapOilPool01) | SunderstoneGorge01 57, Alftand02 52 |
| TrapBear | the trigger snaps it: PlayAnimation, a Light Foot perk check; the TrapHitBase beside it does the hit | 179 (BearTrap01) | Tamriel 58, Irkngthand02 9 |
| TrapFallingOilLampColLayer | a hit or a spell: DamageObject(self), PlaceAtMe explosion | 145 | SunderstoneGorge01 10, Valthume01 8 |
| trapSoulGemController | a hit or a grab disarms its MagicTrap; OnActivate #5 Disable, #12 AddItem(gem) to the player | 52, on the soul gems themselves (SLGM DummySoulGem 0x6a0c2) | WarehouseTraps 16 |
| TrapExplosiveGas | fire or lightning: DamageObject(self) | 49 | StonyCreekCave01 17 |
| trapRockfallEffects | Sound.Play, ShakeCamera, dust | 37 | Kagrenzel01 5 |
| TrapPoisonGas | OnTrigger: PlaceAtMe gas | 14 | DLC1DarkfallPassageWorld 6 |
| TG02Beehive (not a trap name) | on destruction, #18 calls the TG02 quest's HiveGone() | 7 | Tamriel 6 |
| TGTQ04BannerBurnScript (not a trap name) | on destruction, #4 SetStage(TGTQ04, 65) | 2 | UtteringHillsCave01 1 |
| TrapPoisonGasCough | a magic effect on MGEF 0x9f28f: a cough line, CreateDetectionEvent | 0 | |
| TrapBreakAwayBase, TrapFallingOilLamp, TrapFallingOilLampAnim, trapMagicLoot, trapSight | attached to nothing | 0 | |

Whole references joining under the drafted A: 3,622 family today, 4,900 under A (1,278 more); a prefix on the script's own name
alone adds 1,269 (the quest pair's 9 drop out). 89 of the 1,278 stand in test cells (WarehouseTraps 42, XTestGrantInt 33,
XTestGrantInt3 14). Under the class chain alone, all 179 bear traps were mixed (TrapBear beside TrapHitBase) and so the host's.
Option B as worded (TrapFamily.cpp:27-32: TrapExplosiveGas as a named root) admitted the same quest pair.

## 3. Traps both drafted rules missed

- HazardBase, vanilla, extends ObjectReference: in its CanHit state OnTrapHitStart runs doLocalHit, which calls ProcessTrapHit
  (#3) and a Weapon.Fire dust puff. On 49 references: 34 spike beds (TrapWoodSpikeBed01, its only script) and 15 Nordic
  platforms beside TrapNorPlatform; most in DLC1VampireCastleDungeon01 (10), Tamriel (8), DarklightTower02 (5). One platform,
  0xea269 (TrapNorPlatformStairs), also carries USSEP's usleep_disablelinkedrefonactivation, so 48 of the 49 can join.
- Eight one-off references, each tied to the player or a quest: dunRannveigsFastTrapDoorSCRIPT 2, dunBorderWallNocturnalTrapDoorSCRIPT
  1, dunShaftTrapScript 1, dunTolvaldsCaveTrap 1 and its escape pull chain 1, DLC1VQ05BoneyardTrapTriggerScript 1 (SetStage 70),
  DB05FallingStatueActivate 1 (ProcessTrapHit and Actor.Kill). They stay the cell host's.
- On a quest alias, not a reference: DA10GhostTrap and DA10GhostTrapHit (ProcessTrapHit), on QUST DA10HauntingController 0x2bb38.
- Trap-named bases running generic scripts: LeanToTrap01 (25 references, default2StateActivator) and TrapStoneButton (1).
- Never placed in the lab's load order: RP_TrapCactusScript, ccBGS_ARSpikeTrapScript (a HazardBase subclass), blindClifftrap.
- Signals that were not traps: the 8 DamageObject(self) callers outside both rules are ore veins, ambushes and destructibles
  (MineOreScript alone is on 1,739 references); every PushActorAway caller outside the chain is a magic effect or Portal.esp's
  portal. MagicTrap, the soul gem trap's caster, extends TrapBase and was family already.

## 4. The rule as built (Eli's D-T1, 2026-11-05: "all traps should be equally triggerable by both guest and host")

Fork m4-scripts-2b-traps ff9b804a (TrapFamily.cpp):
- A script class is a trap class when its parent chain reaches TrapBase, TrapTriggerBase, TrapHitBase or HazardBase, or when its
  own name begins with "trap" in any case. The prefix is never inherited through a parent that is not a root, so TG02Beehive and
  TGTQ04BannerBurnScript stay the host's.
- A reference is family when every script on it is a trap class and its base is no inventory object (TESForm::IsInventoryObject,
  CommonLibSSE-NG include/RE/T/TESForm.h:329, body src/RE/T/TESForm.cpp:192-214; the base from TESObjectREFR::GetBaseObject,
  include/RE/T/TESObjectREFR.h:384). The soul gems are items: taking one is a pickup, and a pickup has one owner (the inventory
  verb, R0). The trap that shoots, MagicTrap, fires on every seat.

Measured over the same load order (verify_dt1.py on sky-srv, read-only): 4,887 family references against the chain's 3,622,
1,265 more (the own-name 1,269, plus HazardBase's 48, less the 52 soul gems). Joining: TrapOilPool 793, TrapBear 179,
TrapFallingOilLampColLayer 145, TrapExplosiveGas 49, HazardBase 48, trapRockfallEffects 37, TrapPoisonGas 14. The item test drops
exactly the 52 soul gems and no reference of the chain's family leaves; the quest pair's 9 references stay out; 950 references
stay mixed and the host's (the 5 DLC1VC_EmbersToggleable among them, another script beside TrapOilPool). The family's bases by
type: ACTI 4,819, DOOR 53, FURN 13, STAT 2, and no LIGH (CommonLib's item test counts every light as an inventory object,
carryable or not, so a light-based trap would be excluded; none exists in this load order).

Declared, HYPOTHESIS until a probe reads them: a family trap's state that no record carries stays each seat's own copy (a bear
trap re-armed by one player's press is armed on that seat alone); whether an oil pool's burn raises its own destruction stage
(and so travels as DestructionStage like the lamp) or reaches the other seat only through the caster's replayed spell is
x-trap-oilpool-guest's question.
