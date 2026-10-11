# Blocking in 1.7.104: the blocked share, the cone, the stagger

Status: static analysis (the re-analyst, 2026-10-10), every finding a
HYPOTHESIS (rule 2) until a lab run or a Frida trace confirms it. Question
from the blocking verb (docs/verbs/blocking.md): the engine's own melee block
formula, where fBlockSkillMult and fBlockMax enter, the block cone, and what
staggers a blocker on a power attack or a bash.

Program and tools: SkyrimSE-1.7.104.0.exe in the sky-re Ghidra project, read
through pyghidra-mcp (search_strings, search_code, list_xrefs,
decompile_function, disassemble, read_bytes). Nothing renamed, commented or
saved. The 1.6.1170 program's .text is still wrapped (at ID 26425's 1.6.1170
address, 0x140418150, it disassembles to `XCHG EAX,ESI; CLD; POP RAX ...`), so
bodies were read in 1.7.104 under the shared Address Library IDs, as in
melee-reach-1-7-104.md. Each ID is a reverse lookup of the 1.7.104 address in
versionlib-1-7-104-0.bin with lab/addr.py's loader; every ID cited is present
in versionlib-1-6-1170-0.bin, and the 1.6.1170 address given after an ID is
that database's (`just addr <id>`), unverified as code. The 1.6.1170 .data is
not wrapped: the Setting objects at the 1.6.1170 addresses of IDs 374517,
374520, 374523, 374526, 374535 to 374547, 374154 to 374162, 375300, 374451 to
374457, 373707, 373710 and 381353 hold the same names and executable defaults
as in 1.7.104 (read_bytes on both programs). CommonLibSSE-NG citations are the
submodule at b93280e8.

Settings method: melee-reach-1-7-104.md's. A Setting is vtable, value at +8,
name pointer at +0x10 (include/RE/S/Setting.h); the DAT_ addresses the
decompiler shows are object+8; read_bytes over runs of objects gives each name
and executable default; list_xrefs on object+8 gives every reader. Master
values are the verb doc's (docs/verbs/blocking.md, "The game settings, read
from Skyrim.esm with lab/esm.py"); a setting it does not list is marked "read
needed". The name sky-srv did not resolve from this session and going through
the Proxmox host was out of bounds, so no master was read for this note.

## Short answer (HYPOTHESIS)

```
S = fArmorRatingBase + (fArmorRatingMax - fArmorRatingBase) * Block / 100   // AV 9, the blocker's
shield (an ARMO in the blocker's race shield slot):
  p = fShieldBaseFactor + (S + ShieldPerks) * R * fShieldScalingFactor / 100
      // R = the shield ARMO's armorRating / 100 (the record's rating), ShieldPerks = AV 66
no shield (right-hand weapon drawn, or empty hands):
  p = fBlockWeaponBase + S * D * fBlockWeaponScaling / 100
      // D = the ATTACKER's weapon base damage (TESAttackDamageForm), 0 for a bash
power attack (HitData kPowerAttack):  p = p * fBlockPowerAttackMult
p = kModPercentBlocked(perk owner = blocker, p)          // entry point 39
p = min(p, fPlayerMaxResistance / 100)
if p > 0:  damage = damage_after_armor * (1 - p)
```

- UESP's 1.5 is fArmorRatingMax - fArmorRatingBase at the executable defaults
  (2.5 and 1.0): with Skyrim.esm's 0.45 and 0.2 the shield line is UESP's
  "45 + 0.2 x rating x (1 + 1.5 x Block / 100)" percent, if the masters leave
  those two settings alone (read needed).
- fBlockSkillMult, fBlockSkillBase, fBlockMax, fBlockAmountWeaponMult and
  fBlockAmountHandToHandMult have no reader in the program. The cap is
  fPlayerMaxResistance (85 in the executable), for every blocker.
- Cone: the blocker's heading against the yaw to the attacker, half angle
  fCombatHitConeAngle (35, no master override per melee-reach-1-7-104.md),
  through the melee hit-cone function ID 47297.
- Arrows: no cone; an arrow is blockable only if it struck a collision body
  tagged BIPED_PART kShield, then blocked if the target IsBlocking.
- Stagger: ID 37710 sets the graph floats staggerMagnitude and
  staggerDirection and performs the default action kActionStaggerStart. A hit
  with HitData.stagger > 0 that was blocked or is a bash always calls it; other
  melee hits roll iStaggerAttackChance. A blocked hit's stagger is the attack
  stagger minus a block reduction, floored at fStaggerMin; a bash on a
  blocking target is multiplied by fStaggerBlockingMult (0 in Skyrim.esm), so
  it does not stagger unless it lands during the target's attack (kTimedBash,
  which instead performs kActionLargeRecoil on the target).

## The settings

| setting | object ID | 1.7.104 object (HYPOTHESIS) | executable default | masters (verb doc) | read by (ID) |
| --- | --- | --- | --- | --- | --- |
| fArmorRatingMax | 374517 | 0x1420a7d88 | 2.5 | read needed | 26425; 26424 |
| fArmorRatingBase | 374520 | 0x1420a7da0 | 1.0 | read needed | 26425; 26424 |
| fArmorRatingPCMax | 374523 | 0x1420a7db8 | 2.5 | not used by the block | 26424 only |
| fArmorRatingPCBase | 374526 | 0x1420a7dd0 | 1.0 | not used by the block | 26424 only |
| fShieldScalingFactor | 374535 | 0x1420a7e18 | 0.25 | 0.2 | 26425 |
| fShieldBaseFactor | 374538 | 0x1420a7e30 | 0.08 | 0.45 | 26425 |
| fBlockWeaponBase | 374541 | 0x1420a7e48 | 0.05 | 0.3 | 26425 |
| fBlockWeaponScaling | 374544 | 0x1420a7e60 | 0.05 | 0.2 | 26425 |
| fBlockPowerAttackMult | 374547 | 0x1420a7e78 | 0.75 | 0.66 | 26425 |
| fPlayerMaxResistance | 375300 | 0x1420a9ae0 | 85 | read needed | 44014 (the cap); 38737 |
| fBlockSkillBase | 374154 | 0x1420a7170 | 0 | not listed | none |
| fBlockSkillMult | 374156 | 0x1420a7188 | 1.0 | 2.0 | none |
| fBlockMax | 374158 | 0x1420a71a0 | 0.75 | 0.7 | none |
| fBlockAmountWeaponMult | 374160 | 0x1420a71b8 | 0.5 | 1.0 | none |
| fBlockAmountHandToHandMult | 374162 | 0x1420a71d0 | 0.25 | not listed | none |
| fArmorScalingFactor | 374514 | 0x1420a7d70 | 0.15 | read needed | 44014 (armor, before the block) |
| fMaxArmorRating | 374508 | 0x1420a7d40 | 95 | read needed | 44014 (armor cap) |
| fDamageToArmorPercentage | 374138 | 0x1420a70c8 | 0.5 | read needed | 26419 |
| fCombatPlayerBleedoutHealthDamageMult | 374478 | 0x1420a7c50 | 1.0 | read needed | 44014 |
| fCombatHitConeAngle | 373601 | 0x1420a5ce8 | 35 | none (melee-reach sweep) | 47297; 27397 |
| fCombatDeadActorHitConeMult | 373604 | 0x1420a5d00 | 2 | none | 47297 (dead actor only) |
| fStaminaBlockDmgMult | 374451 | 0x1420a7b78 | 0.25 | 0.25 | 26430 |
| fStaminaBlockStaggerMult | 374454 | 0x1420a7b90 | 5 | read needed | 26430 |
| fStaminaBlockBase | 374457 | 0x1420a7ba8 | 10 | 0 | 26430 |
| fStaminaBashBase | 374460 | 0x1420a7bc0 | 5 | read needed | 26429 |
| fStaminaPowerBashBase | 374463 | 0x1420a7bd8 | 10 | read needed | 26429 |
| iStaggerAttackChance (int) | 373698 | 0x1420a6078 | 100 | 50 | 38586 |
| fStaggerAttackBase | 373701 | 0x1420a6090 | 0.5 | read needed | 26422 |
| fStaggerAttackMult | 373704 | 0x1420a60a8 | 0.01 | read needed | 26422 |
| fStaggerBlockBase | 373707 | 0x1420a60c0 | 0.5 | 0.001 | 26426 |
| fStaggerBlockMult | 373710 | 0x1420a60d8 | 0.005 | 0.005 | 26426 |
| fStaggerMassBase | 373713 | 0x1420a60f0 | 0 | read needed | 26422; 26428 |
| fStaggerMassMult | 373716 | 0x1420a6108 | 1 | read needed | 26422; 26428 |
| fStaggerShieldMult | 373719 | 0x1420a6120 | 1 | read needed | 26422 |
| fStagger1WeapMult | 373722 | 0x1420a6138 | 0.2 | read needed | 26422 |
| fStagger2WeapMult | 373725 | 0x1420a6150 | 0.5 | read needed | 26422 |
| fStaggerBlockingMult | 373728 | 0x1420a6168 | 1 | 0 | 26422 |
| fStaggerRunningMult | 373731 | 0x1420a6180 | 1.5 | read needed | 26422 |
| fStaggerRecoilingMult | 373734 | 0x1420a6198 | 1.5 | read needed | 26422 |
| fStaggerBlockAttackBase | 373737 | 0x1420a61b0 | 1 | not listed | none |
| fStaggerBlockAttackMult | 373739 | 0x1420a61c8 | -0.005 | -0.0001 | none |
| fStaggerBlockAttackShieldBase | 373741 | 0x1420a61e0 | 1 | 0.01 | 26426 |
| fStaggerBlockAttackShieldMult | 373744 | 0x1420a61f8 | -0.005 | 0.001 | 26426 |
| fStaggerMassOffsetBase | 374550 | 0x1420a7e90 | 3 | 2.1 | 26426; 26428 |
| fStaggerMassOffsetMult | 374553 | 0x1420a7ea8 | 0.15 | read needed | 26426; 26428 |
| fStaggerPlayerMassMult | 374556 | 0x1420a7ec0 | 2 | 2.5 | 26428 |
| fStaggerMin | 374493 | 0x1420a7cc8 | 0.05 | 0 | 44009; 26422 |
| fStaggerDaggerAR | 360322 | 0x14207b480 | 5 | read needed | 18093 |
| fStagger1WeapAR | 360325 | 0x14207b498 | 10 | read needed | 18093 |
| fStagger2WeapAR | 360328 | 0x14207b4b0 | 15 | read needed | 18093 |
| fStaggerBowAR | 360331 | 0x14207b4c8 | 5 | read needed | 18093 |
| bPlayerAlwaysStaggered:Combat (INI bool) | 381353 | 0x1420b6e60 | 1 (true) | INI, client-editable | 38586 |
| iPerkBlockDisarmChance (int) | 373900 | 0x1420a6810 | 5 | 50 | none |
| iPerkBlockStaggerChance (int) | 373902 | 0x1420a6828 | 5 | not listed | none |
| fShieldBashMin, Max, PCMin, PCMax | 373643, 373646, 373649, 373652 | 0x1420a5e80 to 0x1420a5ec8 | 0.1, 0.5, 0.1, 0.5 | 0.05, 0.25, not listed, 0.25 | 26421 |
| fWeaponBashMin, Max, PCMin, PCMax | 373655, 373658, 373661, 373664 | 0x1420a5ee0 to 0x1420a5f28 | 0.1, 0.5, 0.1, 0.5 | read needed | 26421 |

Names were read from each object's name pointer (for example fBlockPowerAttackMult's object reads `60037e41 01000000 0000403f 00000000 50508841 01000000`: vtable ID 186284, 0.75, the string "fBlockPowerAttackMult" at 0x141885050). bPlayerAlwaysStaggered:Combat's object carries SettingT<INISettingCollection>'s vtable (ID 187079, include/RE/Offsets_VTABLE.h:229).

## Hypothesis: blocking / which function computes the blocked share

- Candidate: ID 44014 (1.7.104: 0x1407f09d0; 1.6.1170: 0x1407dbd20; HYPOTHESIS), not named by CommonLibSSE-NG: `void(HitData*, bool skipBlock)`, a hit's damage adjustment (armor, the weapon's resistance value, block, reflect). It computes the share with ID 26425 (1.7.104: 0x14041f4d0; 1.6.1170: 0x140418150), whose only caller it is (confidence: high)
- Evidence:
  - It is the only call in the decompiled program of BGSEntryPoint::HandleEntryPoint (ID 23526, include/RE/B/BGSEntryPoint.h:112-117) with kModPercentBlocked (39, BGSEntryPoint.h:52): `search_code` literal `FUN_14038cff0(0x27` has one hit.
  - It writes HitData::percentBlocked (+0x5C, include/RE/H/HitData.h:66) and the flags kBlocked and kBlockWithWeapon (HitData.h:21-22, flags at +0x80, HitData.h:75), and reads kBlockCandidate (HitData.h:23).
  - Callers and the skip argument each passes (read in each call site's disassembly, `XOR EDX,EDX` or `MOV DL,0x1`): HitData::Populate ID 44001 (HitData.h:44-49; melee) 0; ID 44002 (projectile, below) !kBlockCandidate; IDs 44000 and 44003 0; IDs 44004 and 44005 1 (never blockable). Their callers were not identified: ID 37509 (for 44000), 49044 (44003), 43849 (44004), 38185 (44005).
  - Decompiled, trimmed; comments mine; the block part checked against the disassembly 0x1407f0b90 to 0x1407f0e5b:
    ```c
    *(undefined4 *)(param_1 + 0x54) = *(undefined4 *)(param_1 + 0x50);   // physicalDamage = totalDamage, before armor
    fVar15 = DAT_1420a7d78;                                               // fArmorScalingFactor
    fVar14 = (float)FUN_1406c9f00(plVar10);                               // ID 38568 (target)
    local_res18[0] = fVar14 * fVar15 * 0.01;
    ...                                                                   // + vfunc 0x738, kModTargetDamageResistance (37), cap fMaxArmorRating / 100
    *(float *)(param_1 + 0x50) = (1.0 - local_res18[0]) * *(float *)(param_1 + 0x50);   // armor first
    ...                                                                   // then 1 - AV(weapon resistance) / 100
    if (param_2 == '\0') {
      lVar5 = FUN_1406ca230(plVar10);                     // ID 38577: the ARMO in the target's race shield slot
      if ((int)plVar10[0x1d] < 0) { cVar13 = '\0'; }      // boolBits kParalyzed (include/RE/A/Actor.h:190)
      else { cVar13 = FUN_1406aef60(plVar10); }           // ID 37952 Actor::IsBlocking (src/RE/A/Actor.cpp:768-773)
      if (((lVar5 != 0) || (lVar6 = FUN_140720660(plVar10[0x1f],0), lVar6 != 0)) ||
         (local_res8 = '\x01', cVar13 == '\0')) { local_res8 = '\0'; }   // empty-handed block
      ...
      cVar3 = FUN_140867ca0(plVar7,plVar9,(longlong)plVar7 + 0x54,(longlong)plVar9 + 0x54,0,
                            0x3f800000,0,0);              // ID 47297, the cone (next blocks)
      if ((cVar13 != '\0') && (((*(uint *)(param_1 + 0x80) >> 2 & 1) != 0 || (cVar3 != '\0')))) {
        *(uint *)(param_1 + 0x80) = *(uint *)(param_1 + 0x80) | 1;      // kBlocked
        if ((lVar5 == 0) && (lVar6 = FUN_140720660(plVar10[0x1f],0), lVar6 != 0)) {
          cVar13 = 0x5f < (*(uint *)((longlong)plVar10 + 0xcc) & 0xe0);   // weapon block: weaponState >= kDrawn
          local_res20 = (uint)(byte)cVar13;
        }
        // formula unless (empty-handed and (bow, staff or crossbow, or a projectile source)): then 0 (paraphrased)
          if (lVar5 == 0) {
            if (*(longlong *)(param_1 + 0x30) == 0) { fVar15 = 0.0; }
            else { uVar4 = (**(code **)(*(longlong *)(*(longlong *)(param_1 + 0x30) + 0xc0) + 0x20))();
                   fVar15 = (float)uVar4; }               // HitData.weapon's GetAttackDamage
          }
          else { fVar15 = (float)*(ushort *)(lVar5 + 0x200) * 0.01; }   // shield armorRating / 100
          uVar1 = *(undefined1 *)(param_1 + 0x82);                      // flags bit 16 kPowerAttack
          uVar16 = (**(code **)(plVar10[0x17] + 8))(plVar10 + 0x17,0x42);   // AV 66 kShieldPerks
          uVar17 = (**(code **)(plVar10[0x17] + 8))(plVar10 + 0x17,9);      // AV 9 kBlock
          uVar16 = FUN_14041f4d0(fVar15,uVar17,uVar16,local_res20 & 0xff,local_res8,(uVar1 & 1));
          *(undefined4 *)(param_1 + 0x5c) = uVar16;
        pfVar12 = (float *)(param_1 + 0x5c);
        FUN_14038cff0(0x27,plVar10,pfVar12);              // kModPercentBlocked, perk owner = the blocker
        fVar15 = *pfVar12;
        if (DAT_1420a9ae8 * 0.01 <= *pfVar12) { fVar15 = DAT_1420a9ae8 * 0.01; }   // fPlayerMaxResistance
        *pfVar12 = fVar15;
        if (0.0 < fVar15) { *(float *)(param_1 + 0x50) = (1.0 - fVar15) * *(float *)(param_1 + 0x50); }
        // flags bit 1 kBlockWithWeapon = the weapon-block test; if not empty-handed, +0x60 scaled by the share
    ```
  - Layouts: Actor runtime data at 0xE8 on 1.6.629+ (Actor.h:644-717, RelocateMemberIfNewer 0xE0, 0xE8 at :712), so +0xE8 is boolBits (:647) and +0xF8 currentProcess (:651); ActorState at 0xC0, actorState2 at +0xCC, weaponState bits 5-7 (include/RE/A/ActorState.h:82-89; kDrawn = 3, so `& 0xe0 >= 0x60`); ActorValueOwner at +0xB8 and its slot 1 GetActorValue (include/RE/A/ActorValueOwner.h:15); AV 9 kBlock, 66 kShieldPerks (include/RE/A/ActorValues.h:17, 74); TESObjectARMO::armorRating at 0x200, "CK value * 100" (include/RE/T/TESObjectARMO.h:71); TESObjectWEAP's TESAttackDamageForm at 0xC0 with GetAttackDamage at slot 4 (include/RE/T/TESObjectWEAP.h:70, include/RE/T/TESAttackDamageForm.h:20); weaponData at 0x168, animationType at +0x35 (TESObjectWEAP.h:182, 257), WEAPON_TYPE 7 kBow, 8 kStaff, 9 kCrossbow (TESObjectWEAP.h:53-55).
  - ID 38577 is `GetBiped2()` (vtable slot 0x7F, include/RE/T/TESObjectREFR.h:323) then ID 15695, which returns the BipedAnim object (include/RE/B/BipedAnim.h) at the index ID 19630 returns, only if its item has form type 0x1A (ARMO); ID 19630 reads the base NPC's race +0x138, TESRace data at 0xE8 plus shieldObject at +0x50 (include/RE/T/TESRace.h:119).
  - ID 37952, Actor::IsBlocking, is all of `GetGraphVariableImpl3(this + 0x38, FixedStrings->isBlocking, &out)` (slot 0x12, include/RE/I/IAnimationGraphManagerHolder.h:42; "IsBlocking" at FixedStrings 0x2B8, include/RE/F/FixedStrings.h:105): a block is the behavior graph's IsBlocking bool.
- Side effects (HYPOTHESIS):
  - A melee hit is blocked iff the target is not paralyzed, its graph's IsBlocking is true, and the attacker is inside the cone. Nothing else (no stamina test, no "facing the attack" test beyond the cone).
  - The share applies to the damage after armor and the weapon's resistance value, and before reflect (+0x7C from AV 163 kReflectDamage, melee only).
  - physicalDamage (+0x54) keeps the pre-armor damage; the stamina drain uses it (below).
  - The empty-handed case: no shield and no right-hand weapon; it uses the weapon line with the attacker's weapon damage, and stops nothing from a bow, a staff, a crossbow or any projectile.
  - A right-hand weapon that is not drawn while IsBlocking gives neither the weapon nor the empty-handed flag, so the shield line runs with R = the attacker's weapon damage (an edge case read off the branches, not seen in play).
- Suggested Frida trace: on the attacker's client, ID 44014 onEnter (args[0] the HitData, args[1] the skip flag): log +0x50 and the target handle (+0x1C); onLeave log +0x50, +0x54, +0x5C, +0x68, +0x80. Scenario: x-block-probe2's phases (head-on, 45, 90, 135 degrees off, a power attack, a raised sword).
- What would falsify this: a blocked swing whose +0x5C is not written by ID 44014; a block registered (blockHitStart, damage reduced) with IsBlocking false on the figure; a reduction applied before armor.

## Hypothesis: blocking / the formula and its inputs

- Candidate: ID 26425 (1.7.104: 0x14041f4d0; 1.6.1170: 0x140418150; HYPOTHESIS): `float(float rating, float block, float shieldPerks, bool weaponBlock, bool emptyHanded, bool powerAttack)` (confidence: high)
- Evidence:
  - Decompiled in full; the disassembly matches instruction for instruction (0x14041f4d0 to 0x14041f54c):
    ```c
    fVar1 = (DAT_1420a7d90 - _DAT_1420a7da8) * param_2 * 0.01 + _DAT_1420a7da8;   // fArmorRatingMax, fArmorRatingBase
    if ((param_5 == '\0') && (param_4 == '\0')) {
      fVar1 = (fVar1 + param_3) * param_1 * _DAT_1420a7e20 * 0.01 + _DAT_1420a7e38;   // fShieldScalingFactor, fShieldBaseFactor
    }
    else {
      fVar1 = fVar1 * param_1 * _DAT_1420a7e68 * 0.01 + _DAT_1420a7e50;     // fBlockWeaponScaling, fBlockWeaponBase
    }
    if (param_6 != '\0') {
      fVar1 = fVar1 * _DAT_1420a7e80;                                       // fBlockPowerAttackMult
    }
    return fVar1;
    ```
  - Arguments at the call (0x1407f0d8e to 0x1407f0ded): XMM0 the rating, XMM1 AV 9, XMM2 AV 66, R9B the weapon-block flag, [RSP+0x20] the empty-handed flag, [RSP+0x28] `byte [HitData+0x82] & 1`, which is flags bit 16, kPowerAttack (HitData.h:38). HitData::Populate (ID 44001) sets that bit from the attack's BGSAttackData flag kPowerAttack (include/RE/B/BGSAttackData.h:18): `uVar9 = *(uint *)(param_1 + 0x80) | 0x10000; if ((*(uint *)(lVar10 + 0x28) >> 2 & 1) == 0) { uVar9 = ... & 0xfffeffff; }`.
  - The skill term's two settings are the ones CommonLib's ActorValueOwner::GetArmorRatingSkillMultiplier (ID 26424, src/RE/A/ActorValueOwner.cpp:5-10) uses for a non-player: ID 26424 picks fArmorRatingPCMax and fArmorRatingPCBase when GetIsPlayerOwner (slot 8, ActorValueOwner.h:22) is true. ID 26425 has no player branch.
- Side effects (HYPOTHESIS): pure. In the short answer's form:
  - The Block skill enters once, as S = Base + (Max - Base) * Block / 100, with fArmorRatingMax and fArmorRatingBase, for every blocker including the player. Not fBlockSkillMult, not a 1.5 constant.
  - Shield: the blocker's own shield rating, the record's (tempering and kModArmorRating do not enter; the value is read from the form, not the inventory entry). ShieldPerks (AV 66) adds to S, inside the product with the rating.
  - Weapon or empty hands: the attacker's weapon's base damage (the "EnemyWeaponBaseDamage" of UESP), 0 when HitData has no weapon (a bash, below), the Unarmed WEAP's damage for an unarmed attacker (HitData::Populate puts ID 401061 there); the blocker's own weapon does not enter.
  - Power attack: the whole share times fBlockPowerAttackMult, before the perk entry point and the cap.
  - UESP's "(1 + Shield Wall perk) x (1 + Enchantments) x (1 + Potion)" can only enter through kModPercentBlocked (perk functions on the value), AV 9 or AV 66; nothing on this path reads kBlockModifier (99) or kBlockPowerModifier (138) (no `GetActorValue(..., 0x63)` or `0x8a` call in the decompiled program).
  - Worked numbers with Skyrim.esm's four factors and the executable's 2.5 and 1.0, an Iron Shield (20), no perks: p = 0.45 + 0.04 * (1 + 0.015 * Block) = 0.49 + 0.0006 * Block, so 0.499 at Block 15 and 0.55 at Block 100; a power attack multiplies it by 0.66. Weapon block of an attacker's weapon of base damage D: p = 0.3 + 0.002 * D * (1 + 0.015 * Block).
- Suggested Frida trace: at ID 44014 onLeave, call ID 26425 through NativeFunction('float', ['float','float','float','uint8','uint8','uint8']) with the logged inputs (shield rating or weapon damage, the target's AV 9 and AV 66, the two flags, `(u8 at +0x82) & 1`) and compare with +0x5C; Interceptor's retval is RAX, not XMM0, so do not read the share from an onLeave on ID 26425 itself.
- What would falsify this: blocked/unblocked damage ratios that do not equal 1 - p for the masters' values; a dependence on the blocker's weapon damage; a power attack ratio other than fBlockPowerAttackMult times the share; a player blocker following fArmorRatingPCMax instead of fArmorRatingMax.

## Hypothesis: blocking / fBlockSkillMult, fBlockMax and the other unread settings

- Candidate: fBlockSkillBase (ID 374154), fBlockSkillMult (374156), fBlockMax (374158), fBlockAmountWeaponMult (374160), fBlockAmountHandToHandMult (374162), fStaggerBlockAttackBase (373737), fStaggerBlockAttackMult (373739), iPerkBlockDisarmChance (373900), iPerkBlockStaggerChance (373902) are read by no code (confidence: med)
- Evidence:
  - list_xrefs on each value address (object+8) returns nothing; on the five block objects the only references are their static registration (for fBlockSkillMult FUN_140044960, which inserts `&PTR_vftable_1420a7188` into the collection through slot 1 of FUN_1401499e0's result), their atexit destructor (FUN_141762960) and an unwind entry. The same pattern holds for fArmorRatingMax's object, whose value does have readers.
  - The five sit in one run of objects among Fallout-era names (fDamageGunWeapCondBase, fDamageMeleeWeapCondMult, fAutomaticWeaponBurstFireTime, then fBlockSkillBase to fBlockAmountHandToHandMult, then fCombatDistance at 0x1420a71e8, matching melee-reach-1-7-104.md).
- Side effects (HYPOTHESIS): none. Skyrim.esm's overrides of fBlockSkillMult (2.0), fBlockMax (0.7) and fBlockAmountWeaponMult (1.0) change nothing in play. fBlockMax is not the cap.
- Suggested Frida trace: none. A lab check: set fBlockMax and fBlockSkillMult by the console (setgs) to extreme values on c1 and see the blocked damage unchanged.
- What would falsify this: a lookup by name through the setting collection (Papyrus Game.GetGameSettingFloat, a script, an INI-driven path) would not show as a reference; a blocked share that moves with setgs fBlockMax would.

## Hypothesis: blocking / the block cone

- Candidate: ID 47297 (1.7.104: 0x140867ca0; 1.6.1170: 0x140852c30; HYPOTHESIS), the melee hit-cone test of melee-reach-1-7-104.md, called from ID 44014 with (blocker, attacker, blocker position, attacker position, no attack data, 1.0, no angle out, 0) (confidence: high)
- Evidence:
  - The call in ID 44014, from the disassembly (0x1407f0c37 to 0x1407f0ca5): `[RSP+0x20] = 0` (attack data), `[RSP+0x28] = XMM8 = 1.0` (0x141b5be28 holds 0x3f800000), `[RSP+0x30] = 0`, `[RSP+0x38] = 0`. RCX is the target (the blocker) and RDX the source: the projectile if HitData+0x20 resolves (ID 12332, LookupReferenceByHandle, include/RE/Offsets.h:582), else the attacker; when the attacker is the player (ID 401069) with a bow or crossbow and no projectile reference, the two are swapped (the player's cone toward the target).
  - ID 47297, the lines that run with no attack data:
    ```c
    fVar7 = (float)FUN_140edbe70(&local_70);         // ID 70173: yaw of (source - blocker), x and y only
    if ((param_1 == DAT_143230778) && (cVar3 = FUN_140285a30(param_1), ... cVar3 == '\0')) {
      ...                                            // player blocker, not mounted: aim offset from ID 41248
    }                                                // on the node FixedStrings 0x208 "ProjectileNode" (FixedStrings.h:83)
    fVar8 = (float)(**(code **)(*param_1 + 0x520))(param_1,0);   // GetHeading(false)
    fVar9 = ABS((fVar8 + fVar9) - fVar7) * 57.295776;
    if (180.0 < fVar9) { fVar9 = ABS(fVar9 - 360.0); }
    fVar7 = DAT_1420a5cf0;                           // fCombatHitConeAngle; param_5 (attack data) is 0
    if (fVar7 * param_6 < fVar9) { /* fail, unless the source is a dead Actor within fCombatDeadActorHitConeMult times */ }
    else { uVar6 = 1; }
    ```
    The disassembly at 0x140867e91 to 0x140867ebc reads the same: `MOVSS XMM7,[0x1420a5cf0]`, `MULSS XMM7,[RSP+0xe8]` (param_6), `COMISS XMM6,XMM7; JA fail`.
  - fCombatHitConeAngle's object (ID 373601) reads `60037e41 01000000 00000c42 ...`: 35.0. melee-reach-1-7-104.md's lab/esm.py sweep over the 10 plugins found no override of it.
- Side effects (HYPOTHESIS): pure. Blocked only if |heading(blocker) + aim - yaw(attacker - blocker)| <= fCombatHitConeAngle (35 degrees, a half angle: 70 degrees in all). Height and pitch never enter. The aim term exists only when the blocker is the player and not mounted; a skymp figure (an NPC in the attacker's game) has none, so in the game that decides (the attacker's) the cone is the figure's heading. The attacker's attack data (strikeAngle, attackAngle) does not enter, since none is passed. The server's 1 radian (57.3 degrees) is wider than 35.
- Suggested Frida trace: at ID 44014 onEnter, call ID 47297 as NativeFunction('uint8', ['pointer','pointer','pointer','pointer','pointer','float','pointer','uint8']) with (target, attacker, target+0x54, attacker+0x54, NULL, 1.0, out, 0) and log the out angle with the outcome. Scenario: x-block-probe2 at 30 and 40 degrees off c2's facing (bracketing 35) besides 45, 90 and 135.
- What would falsify this: a swing at 40 to 55 degrees off the blocker's facing that is blocked (or one at 30 that is not) with IsBlocking true; a cone that changes with the attack (power attack against basic) or with height.

## Hypothesis: blocking / arrows: only a struck shield

- Candidate: ArrowProjectile::AddImpact, ID 43710 (1.7.104: 0x1407de340; 1.6.1170: 0x1407c97a0; HYPOTHESIS), with the projectile HitData builder ID 44002 (1.7.104: 0x1407f0030; 1.6.1170: 0x1407db380) (confidence: med)
- Evidence:
  - ID 43710 is slot 0xBD of VTABLE_ArrowProjectile (ID 209891, include/RE/Offsets_VTABLE.h:2771; the reference sits at 0x14193c830, slot 0 at 0x14193c248), AddImpact in include/RE/A/ArrowProjectile.h:40. Trimmed:
    ```c
    lVar5 = FUN_1407f4f90(param_1,param_2,...);      // ID 44041, the base AddImpact: the ImpactData
    if (param_2 is an Actor (form type 0x3E)) {
      ...                                            // the struck collision body's filter info
      if ((uVar2 & 0x1f00) == 0x1200) {              // bits 8-12 = 18
        *(uint *)(param_1 + 0x1d4) = *(uint *)(param_1 + 0x1d4) | 0x8000000;   // projectile flag bit 27
        local_48 = 0.0;
        FUN_14038cff0(0x28,plVar12,&local_48);       // kModShieldDeflectArrowChance (40), perk owner = the target
        ...
        if ((float)uVar3 * 2.3283064e-08 < fVar13) { // a roll against min(chance, 100) percent
          *(undefined4 *)(param_1 + 0x1e0) = 2;
          *(undefined4 *)(lVar5 + 0x40) = 2;         // ImpactData::impactResult = kBounce
        }
      }
    }
    ```
    18 is BIPED_PART::kShield (include/RE/C/CFilter.h:7-27); ImpactData::impactResult is at 0x40 (include/RE/P/Projectile.h:125) and 2 is ImpactResult::kBounce (include/RE/I/ImpactResults.h:9). Projectile flags are at 0x1CC plus the 1.6.629 shift of 8 (Projectile.h:283, 293), bit 27 CommonLib's unnamed kUnk27 (Projectile.h:163). The only other `search_code` hit for that store sets bit 31 (kMoved), not 27.
  - ID 44002 (trimmed): `*(longlong *)(param_1 + 0x30) = *(param_4 + 0x1b8)` (weaponSource), `*pfVar1 = *(float *)(param_4 + 0x1a0)` (weaponDamage), then `uVar6 = flags | 4; if ((*(uint *)(param_4 + 0x1d4) >> 0x1b & 1) == 0) uVar6 = flags & 0xfffffffb;` (kBlockCandidate from bit 27) and `FUN_1407f09d0(param_1, ~(byte)(uVar6 >> 2) & 1)`: the block section runs only for a block candidate.
- Side effects (HYPOTHESIS):
  - An arrow is blockable only if it struck a body tagged kShield; then it is blocked iff the target IsBlocking and is not paralyzed (kBlockCandidate passes the cone test by itself), and the shield line applies with the target's shield rating.
  - An arrow that strikes anything else, or a raised weapon, is never blocked; the empty-handed rule (no share against a bow, a crossbow or a projectile) is moot for arrows.
  - Whether the shield body exists only while the shield is raised was not traced: an arrow striking the shield of a target that is not blocking is a block candidate but not blocked.
  - On a won kModShieldDeflectArrowChance roll the arrow bounces; whether a bounced arrow still deals damage was not traced.
- Suggested Frida trace: ID 43710 onLeave: log the projectile's (u32 at +0x1D4) >>> 27 & 1 and the target's form ID; ID 44014 onEnter args[1] for the same hit. Scenario: c1 shoots c2 (shield raised, facing), c2 (shield lowered), c2 (sword raised).
- What would falsify this: an arrow blocked with flag bit 27 clear; a raised sword reducing an arrow's damage; an arrow into the shield with the block raised taking full damage.

## Hypothesis: blocking / what a blocked hit does next (block hit, attacker recoil, stamina)

- Candidate: ID 38586 (1.7.104: 0x1406ca640; 1.6.1170: 0x1406b7bc0; HYPOTHESIS), the victim-side hit processing (melee-reach-1-7-104.md: "38586(victim, HitData*)"), with ID 37707 (block hit action; 1.7.104: 0x14069fa60), ID 37708 (recoil action; 1.7.104: 0x14069fb20) and ID 26430 (stamina cost; 1.7.104: 0x14041f850) (confidence: high for the branch, med for the event names)
- Evidence:
  - ID 38586, the branch on percentBlocked (fVar29 = HitData+0x5C), trimmed:
    ```c
    else {                                                     // percentBlocked > 0
      FUN_14069fa60(param_1);                                  // ID 37707 on the victim
      FUN_140817110(DAT_1432543f0,param_1,0,3,0x23,0,0);       // not identified
      if ((((local_3f0 == (longlong *)0x0) && (pfVar23 != (float *)0x0)) &&
          (((uint)param_2[0x20] >> 0xe & 1) == 0)) && (victim not dead)) {
        FUN_14069fb20(pfVar23,0);                              // ID 37708 on the ATTACKER: no projectile, not a bash
      }
      fVar28 = (float)(**(code **)(*(longlong *)(param_1 + 0x2e) + 8))(param_1 + 0x2e,0x1a);   // AV 26 kStamina
      if ((0.0 < fVar28) && (fVar28 = (float)FUN_14041f850(param_2), 0.0 < fVar28)) {
        (**(code **)(*(longlong *)(param_1 + 0x2e) + 0x30))(param_1 + 0x2e,2,0x1a,-fVar28);   // RestoreActorValue(kDamage, kStamina, -cost)
      }
    ```
  - ID 37707 builds a BGSActionData for default object `+0x268` (objectInit `+0xC09`) and hands it to FUN_1406dfbc0 (ID 38949); ID 37708 does the same with `+0x278 + i * 8` (objectInit `+0xC0B + i`). With CommonLib's objects at 0x20 (include/RE/B/BGSDefaultObjectManager.h:1073), these are indices 73, 75 and 76: kActionBlockHit, kActionRecoil, kActionLargeRecoil (BGSDefaultObjectManager.h:86-89). In 1.7.104 objectInit sits at 0xBC0, not CommonLib's 0xB80: the manager's constructor (FUN_14031b830) zeroes `memset(param_1 + 4,0,0xd14)`, 372 objects plus 372 flags, eight more than CommonLib's 364 (kTotal, BGSDefaultObjectManager.h:379), so the 1.7 runtime appended eight default objects and indices 73 to 76 stand.
  - ID 26430, in full: `return *(float *)(param_1 + 0x5c) * *(float *)(param_1 + 0x54) * _DAT_1420a7b80 + DAT_1420a7b98 * *(float *)(param_1 + 0x68) + _DAT_1420a7bb0;` (fStaminaBlockDmgMult, fStaminaBlockStaggerMult, fStaminaBlockBase).
  - Slot 6 of ActorValueOwner is RestoreActorValue(modifier, value, amount) (ActorValueOwner.h:20); modifier 2 is kDamage (ActorValues.h:182), AV 26 kStamina (ActorValues.h:34).
- Side effects (HYPOTHESIS):
  - Every hit with a share above 0: the victim performs kActionBlockHit (its graph's block-hit reaction); a melee non-bash attacker performs kActionRecoil; the victim, if it has stamina, loses p * physicalDamage * fStaminaBlockDmgMult + HitData.stagger * fStaminaBlockStaggerMult + fStaminaBlockBase (Skyrim.esm: 0.25 * p * pre-armor damage + stagger * (read needed) + 0).
  - These hang on percentBlocked > 0, not on kBlocked: an empty-handed block against a projectile sets kBlocked with a 0 share and does none of this.
  - In skymp terms: in the attacker's game, c2's figure performs the block hit and c1 itself recoils. x-block-probe recorded recoilStart "on c2's figure" in c1's game; by this reading the recoil belongs to c1's own character, so either the probe's attribution or this branch is wrong.
- Suggested Frida trace: IDs 37707 and 37708 onEnter (args[0] the actor's form ID at +0x14, args[1] for 37708) inside ID 38586; stamina of the victim before and after. Scenario: x-block-probe2's head-on phase.
- What would falsify this: a blocked swing after which the attacker does not recoil, or the victim recoils; a stamina loss that does not scale with the share times the pre-armor damage.

## Hypothesis: blocking / the stagger magnitude, and the block's reduction of it

- Candidate: ID 44009 (1.7.104: 0x1407f0690; 1.6.1170: 0x1407db9e0; HYPOTHESIS), called by HitData::Populate before ID 44014 and stored in HitData.stagger (+0x68, HitData.h:69); with ID 26428 (attack stagger; 0x14041f5e0), ID 26422 (bash stagger; 0x14041f230), ID 26426 (block reduction; 0x14041f560), ID 18093 (weapon-type value; 0x14028c140) (confidence: high for the shape, med for the meaning of each input)
- Evidence:
  - ID 44001: `uVar15 = FUN_1407f0690(param_2,param_3,*(undefined8 *)(param_1 + 0x30),0); ... *(undefined4 *)(param_1 + 0x68) = uVar15;`, then later `FUN_1407f09d0(param_1,0);`.
  - ID 44009, trimmed:
    ```c
    if ((param_1 == 0) || (cVar1 = FUN_1406cba10(), cVar1 == '\0')) {   // ID 38595: attacker's meleeAttackState == kBash
      fVar6 = (float)FUN_14041f5e0(lVar2,param_2 + 0xb8,param_3,param_4);   // attack
    } else {
      fVar6 = (float)FUN_14041f230(param_1 + 0xb8,param_2 + 0xb8);          // bash
    }
    if ((((0.0 < fVar6) && (param_4 == 0.0)) && (cVar1 = FUN_1406aef60(param_2), cVar1 != '\0')) &&
       (-1 < *(int *)(param_2 + 0xe8))) {                                   // target IsBlocking, not paralyzed
      lVar2 = FUN_1406ca230(param_2);
      if (lVar2 == 0) { ... if ((lVar4 != 0) && (0x5f < (*(uint *)(param_2 + 0xcc) & 0xe0))) fVar9 = (float)FUN_14028c140(lVar4); }
      else { fVar9 = (float)*(ushort *)(lVar2 + 0x200) * 0.01; }
      uVar7 = (**(code **)(*plVar5 + 8))(plVar5,0x24);                      // AV 36 kMass
      uVar8 = (**(code **)(*plVar5 + 8))(plVar5,9);                         // AV 9 kBlock
      fVar9 = (float)FUN_14041f560(fVar9,uVar8,uVar7);
      fVar6 = fVar6 - fVar9;
      if (fVar6 <= DAT_1420a7cd0) { fVar6 = DAT_1420a7cd0; }               // fStaggerMin (MAXSS in the disassembly)
    }
    ```
    The call's registers (0x1407f07b0 to 0x1407f07e2): XMM0 the rating, XMM1 AV 9, XMM2 AV 36.
  - ID 26426, in full: `fVar1 = (param_3 - _DAT_1420a7e98) * _DAT_1420a7eb0; if (fVar1 <= 0.0) fVar1 = 0.0; return DAT_1420a6200 * param_1 + _DAT_1420a61e8 + DAT_1420a60e0 * param_2 + _DAT_1420a60c8 + fVar1;` (fStaggerMassOffsetBase, fStaggerMassOffsetMult, fStaggerBlockAttackShieldMult, fStaggerBlockAttackShieldBase, fStaggerBlockMult, fStaggerBlockBase).
  - ID 18093: a switch on the weapon's animationType: 1, 3, 4 fStagger1WeapAR; 2 fStaggerDaggerAR; 5, 6 fStagger2WeapAR; 7, 9 fStaggerBowAR; else 0.
  - ID 26428 (trimmed): mass m = target AV 36, times fStaggerPlayerMassMult when the target is the player (ID 401069); base = weapon staggerValue (+0x188, TESObjectWEAP.h:174 in weaponData at 0x168) times the attacker's current attack data staggerOffset (+0x34, BGSAttackData.h:32 at AttackData +0x18), 1.0 without a weapon, when param_4 is 0; `fVar3 = DAT_1420a6110 * fVar2 + DAT_1420a60f8;` then base / that (if above 0.0001), minus `max(0, (m - fStaggerMassOffsetBase) * fStaggerMassOffsetMult)`, plus the attacker's AV 87 kBowStaggerBonus (ActorValues.h:95) for a bow or crossbow.
  - ID 26422 (trimmed): target running (ID 37234, Offsets.h:16), IsBlocking, recoil bits (actorState2 & 0xC00, ActorState.h:132); attacker's shield (fStaggerShieldMult), else its weapon (none 1.0; types 5, 6, 7, 9 fStagger2WeapMult; else fStagger1WeapMult); `fVar12 = ((fVar10 * fVar3 + fVar2) / (fVar11 * fVar5 + fVar4)) * fVar13 * fVar14 * fVar12;` with fVar10 the attacker's AV 9, fVar3/fVar2 fStaggerAttackMult/Base, fVar11 the target's AV 36, fVar5/fVar4 fStaggerMassMult/Base, fVar13 = fStaggerRecoilingMult (if recoiling) * fStaggerRunningMult (if running) * fStaggerBlockingMult (if blocking), fVar12 the attack data's staggerOffset; floored at fStaggerMin.
- Side effects (HYPOTHESIS):
  - attack stagger = (weapon stagger * staggerOffset) / (fStaggerMassMult * m + fStaggerMassBase) - max(0, (m - fStaggerMassOffsetBase) * fStaggerMassOffsetMult) [+ BowStaggerBonus]; a power attack differs only through its attack data's staggerOffset (ATKD).
  - against a blocking target: minus r = fStaggerBlockAttackShieldMult * R + fStaggerBlockAttackShieldBase + fStaggerBlockMult * Block + fStaggerBlockBase + max(0, (m - fStaggerMassOffsetBase) * fStaggerMassOffsetMult), R the shield's rating or, for a drawn weapon, its type's AR value; floored at fStaggerMin. The reduction uses IsBlocking, not kBlocked: it applies even from behind, before the cone is tested.
  - bash stagger = (Block_attacker * fStaggerAttackMult + fStaggerAttackBase) / (fStaggerMassMult * m + fStaggerMassBase) * multipliers * staggerOffset, at least fStaggerMin; with Skyrim.esm's fStaggerBlockingMult 0 and fStaggerMin 0 a bash on a blocking target has stagger 0 and no reduction is taken.
- Suggested Frida trace: ID 44014 onEnter already logs +0x68 (the magnitude after the reduction); add ID 44009's inputs at HitData::Populate onLeave if a number disagrees.
- What would falsify this: a blocked power attack whose stagger does not fall with the blocker's Block skill or shield rating; a bash staggering a blocking target in an unmodded game.

## Hypothesis: blocking / what starts a stagger, and what it sets

- Candidate: ID 37710 (1.7.104: 0x14069fc00; 1.6.1170: 0x14068d0d0; HYPOTHESIS): `void(Actor* target, float magnitude, Actor* source)`, called for hits from ID 38586 (and from AIProcess::KnockExplosion ID 39895, src/RE/A/AIProcess.cpp:200, ID 36216 twice and ID 34982) (confidence: high)
- Evidence:
  - ID 37710, trimmed; comments mine:
    ```c
    lVar2 = (**(code **)(*param_1 + 0x380))();                       // has 3D
    if ((((lVar2 != 0) && (param_1[0x1f] != 0)) &&
        ((*(uint *)((longlong)param_1 + 0xcc) >> 0xd & 1) == 0)) &&  // not already staggered (ActorState.h:134)
       (((*(uint *)(param_1 + 0x19) & 0x1e00000) != 0xc00000 &&      // lifeState != kRestrained
        (cVar1 = FUN_140687c20(param_1), cVar1 == '\0')))) {         // ID 37491 Actor::IsInRagdollState (src/RE/A/Actor.cpp:860)
      local_res8[0] = param_2;
      if (param_3 != 0) { FUN_14038cff0(0x22,param_3,param_1,local_res8); }   // kModTargetStagger, owner = source
      FUN_14038cff0(0x21,param_1,param_3,local_res8);                         // kModIncomingStagger, owner = target
      // clamp to at most 1.0; return if not above 0
      lVar2 = FUN_1401544f0();                                       // ID 11437 FixedStrings::GetSingleton
      FUN_1405535a0(param_1 + 7,lVar2 + 0x4a8,local_res8[0]);        // ID 32887 SetGraphVariableFloat("staggerMagnitude")
      if (param_3 != 0) {
        ...                                                          // delta = source - target
        fVar5 = (float)FUN_140edbdc0(&local_90);                     // ID 70172: yaw of delta, in [0, 2pi]
        fVar4 = (float)(**(code **)(*param_1 + 0x520))(param_1,0);   // GetHeading(false)
        fVar5 = (float)FUN_140340620(fVar4 - fVar5);                 // ID 21800: wrap to [0, 2pi]
        fVar5 = fVar5 * 0.15915494;                                  // / 2pi
      }
      FUN_1405535a0(param_1 + 7,lVar2 + 0x4b0,fVar5);                // "staggerDirection"
      lVar2 = FUN_1401c8530();                                       // ID 13894 BGSDefaultObjectManager::GetSingleton
      uVar3 = 0; if (*(char *)(lVar2 + 0xc08) != '\0') { uVar3 = *(undefined8 *)(lVar2 + 0x260); }   // index 72
      FUN_1401f3a20(local_78,2,param_1,uVar3,0);                     // ID 14993, BGSActionData
      ...
      cVar1 = FUN_14078db80(local_78);                               // ID 41557, perform the action
      if ((cVar1 != '\0') &&
         (*(uint *)((longlong)param_1 + 0xcc) = *(uint *)((longlong)param_1 + 0xcc) | 0x2000,   // staggered
         param_1[0x1f] != 0)) { FUN_1407286f0(); }                  // ID 40040
    }
    ```
    Index 72 is kActionStaggerStart (BGSDefaultObjectManager.h:85), by the same 0x20 base and 1.7 objectInit shift as above (0xBC0 + 72 = 0xC08). staggerMagnitude and staggerDirection are FixedStrings 0x4A8 and 0x4B0 (FixedStrings.h:167-168), built by ID 15908 from the literals at 0x1418041c8 and 0x1418041e0.
  - The gate in ID 38586 (disassembly 0x1406cb001 to 0x1406cb09d). The whole reaction runs only when the hit's totalDamage is above 0 (or its limb damage above 0.0001) and the victim has 3D; it is skipped when the victim is in a kill move (its boolFlags bit 14, kIsInKillMove, Actor.h:210), when the hit killed it (ID 37335, the damage function, returns IsDead), when the attacker is in a kill move, when ID 37318 (a process query, ID 40011, not identified) holds, and while the victim is knocked (ID 37484: actorState1 & 0xE000000, knockState); then
    ```
    test flags bit 15 (kTimedBash): ID 37708(victim, 1)        // kActionLargeRecoil, no stagger
    else if HitData.stagger > 0:
      if victim == player (ID 401069) and byte [bPlayerAlwaysStaggered:Combat] != 0: stagger
      elif flags & 0x4001 (kBlocked or kBash):                   stagger
      elif HitData.weapon and animationType + 1 > 7 (bow, staff, crossbow): stagger
      elif rand() % 100 < iStaggerAttackChance:                  stagger
      stagger = ID 37710(victim, XMM1 = HitData.stagger, R8 = the attacker)
    ```
    R8 is RBX, loaded from the lookup of HitData+0x18 (the aggressor handle, HitData.h:54) at 0x1406ca792.
  - StaggeredStopHandler's handler, ID 42830 (VTABLE_StaggeredStopHandler ID 208849, include/RE/Offsets_VTABLE.h:2403, slot 1), is all of `*(uint *)(param_2 + 0xcc) = *(uint *)(param_2 + 0xcc) & 0xffffdfff;`: the graph's staggered-stop event clears the bit ID 37710 set.
- Side effects (HYPOTHESIS):
  - The stagger is a behavior action, not a named event sent by code: the graph floats staggerMagnitude (in (0, 1], after the two perk entry points) and staggerDirection (wrap(heading - yaw to source) / 2pi: 0 for a source dead ahead, 0.5 behind; which side is 0.25 depends on the heading convention, not checked) are set first, then the default action ActionStaggerStart is performed; the graph's response to that action (the staggerStart event of the verb doc) is the behavior's, not code here.
  - A blocked hit, or any bash, with stagger above 0 always staggers (no iStaggerAttackChance roll). A blocked power attack therefore staggers the blocker whenever its attack stagger exceeds the block reduction plus fStaggerMin.
  - A timed bash (HitData::Populate sets kTimedBash, bit 15, when the attacker bashes while the target's meleeAttackState is kDraw or kSwing: `(*(uint *)(param_3 + 200) >> 0x1c) - 1 < 2`, ActorState.h:23-24) makes the target perform kActionLargeRecoil instead.
  - While staggered (bit 13 until the graph's stop event) a second stagger is refused.
  - For the impose path: driving the victim's own game to stagger means the same three steps on its player (two graph floats and the ActionStaggerStart action), or a native that calls ID 37710 with the server's magnitude and the attacker's figure as the source, which also runs the two perk entry points.
- Suggested Frida trace: ID 37710 onEnter (args[0] target form ID, args[2] source form ID) and ID 32887 onEnter while inside ID 37710 (args[1] the BSFixedString, the float in XMM2 is not readable by Interceptor: read the graph variable after with GetGraphVariableFloat from the driver instead). Scenario: c1 power attacks c2 (shield raised), c1 bashes c2 (raised, then lowered, then during c2's swing).
- What would falsify this: a stagger on the blocker with no ID 37710 call; a blocked power attack that staggers only some of the time with stagger above 0; a bash on a lowered-shield target that fails to stagger with stagger above 0.

## Hypothesis: blocking / the bash itself

- Candidate: HitData::Populate (ID 44001; 1.7.104: 0x1407efca0; 1.6.1170: 0x1407daff0) marks bashes; the bash damage is ID 26421 (1.7.104: 0x14041f0a0; 1.6.1170: 0x140417d20); its stamina, ID 26429 (1.7.104: 0x14041f760) (confidence: high)
- Evidence:
  - ID 44001: `cVar5 = FUN_1406cba10(param_2); ... else { flags |= 0x4000; if ((param_3 != 0) && ((*(uint *)(param_3 + 200) >> 0x1c) - 1 < 2)) flags |= 0x8000; }` (kBash, kTimedBash, HitData.h:36-37); a bash has no weapon at +0x30 (ID 38627 passes no weapon entry when the attacker's attack state is kBash, `CMP ECX,0x60000000; CMOVNZ RBP,R14` at 0x1406cd468, and the HitData constructor, ID 43995, zeroes +0x30 and the flags), so the damage comes from ID 26421 with `FUN_14038cff0(0x1a,param_2,param_3,param_1 + 0x50)` (kModBashingDamage, BGSEntryPoint.h:39) and skill 9 (kBlock) at +0x88.
  - ID 38595 is all of `(*(uint *)(param_1 + 200) & 0xf0000000) == 0x60000000`: meleeAttackState == kBash (ActorState.h:28).
  - ID 26421: shield bash `(Block * (fShieldBashMax - fShieldBashMin) * 0.01 + fShieldBashMin) * shieldRating`, the PC pair for the player; without a shield `(Block * (fWeaponBashMax - fWeaponBashMin) * 0.01 + fWeaponBashMin) * weaponDamage` (1.0 unarmed).
- Side effects (HYPOTHESIS): a bash is a hit with kBash, no weapon, damage from the attacker's Block skill and its shield rating or weapon damage; against a shield blocker the shield line applies as for any hit; against a weapon or empty-handed blocker the share is fBlockWeaponBase (D = 0); no attacker recoil from the block branch (kBash excludes it); stagger as above.
- Suggested Frida trace: the ID 44014 log covers it (flags bit 14, bit 15, +0x50, +0x5C).
- What would falsify this: a bash HitData with a weapon at +0x30, or a weapon-block share against a bash other than fBlockWeaponBase.

## Hypothesis: blocking / TiltedEvolution's map

- Candidate: TiltedEvolution hooks nothing on this path (confidence: med)
- Evidence: its dev branch hooks the health damage function by ID 37335 (Code/client/Games/Skyrim/Actor.cpp: `POINTER_SKYRIMSE(TDamageActor, s_damageActor, 37335)`), the same ID that ID 38586 calls after the share is applied (decompiled shape `(Actor*, float, Actor*, bool) -> IsDead`); `gh search code` finds no HitData, block or stagger hook, while staggerMagnitude, staggerDirection, IsBlocking, IsBashing, IsStaggering and IsRecoiling are among the synced graph variables in Code/encoding/Structs/Skyrim/AnimationGraphDescriptor_*.cpp. Read for hook points only (ADR-005).
- Side effects (HYPOTHESIS): staggers there reach observers as graph state; a damage hook at ID 37335 sees post-block damage only.
- Suggested Frida trace: none.
- What would falsify this: a block or stagger hook found in a TiltedEvolution file the search missed.

## Hypothesis: blocking / not determined

- Candidate: none (confidence: n/a)
- Evidence: gaps, each a lab read or a follow-up:
  - The masters' fArmorRatingMax, fArmorRatingBase and fPlayerMaxResistance (the formula's skill term and cap), fStaminaBlockStaggerMult, fStaggerMassOffsetMult and the rest marked "read needed"; and bPlayerAlwaysStaggered:Combat in the clients' INIs.
  - What ID 38568 and Actor vtable slot 0x738 return in the armor step (only the order matters here: armor before block).
  - The callers of IDs 44000, 44003, 44004 and 44005 (IDs 37509, 49044, 43849, 38185) were not identified; two of the four can be blocked.
  - FUN_140817110(..., 3, 0x23, ...) in the blocked branch (ID of the manager at 0x1432543f0 not looked up).
  - Whether a Fortify Block effect raises AV 9 or kBlockModifier: the masters' MGEF records and a lab read settle it.
  - Whether the shield's kShield collision body exists only with the block raised, and whether a bounced arrow deals damage.
  - The graph's own response to ActionStaggerStart, ActionBlockHit and ActionRecoil (event names come from the behavior files and the masters' action records, not code).
  - AttackBlockHandler (VTABLE ID 208719, slot 1 ID 42454) only compares a value against two globals; not followed.
  - x-block-probe's 2.875 and 2.938 for identical swings: ID 26425 has no random term, so the 2 percent spread comes from elsewhere (health regeneration between samples, a different attack, or the watch).
  - Side observation for anyone reading HitData in a native: ID 44014 writes reflected damage at +0x7C and ID 38586 reads the sneak multiplier at +0x70 and the push-back magnitude at +0x78, one slot after CommonLib's names (HitData.h:70-74); not checked further.
  - 1.6.1170 bodies (an unwrapped exe).
- Side effects (HYPOTHESIS): none.
- Suggested Frida trace: the ID 44014 log above settles most numbers in one run.
- What would falsify this: n/a.

## Dynamic plan (for x-block-probe2)

- Predictions to check, with Skyrim.esm's factors, an Iron Shield (20), no perks, and the masters' fArmorRatingMax and fArmorRatingBase (executable 2.5, 1.0):
  - blocked / unblocked damage for the same swing = 1 - (0.49 + 0.0006 * Block) head-on, about 0.50 at low Block; so the engine's unblocked damage on c2's figure should be near 2.875 / 0.501 = 5.74 at Block 15 (between 5.64 at Block 0 and 6.39 at Block 100);
  - blocked at 30 degrees off c2's facing, not at 40, 45, 90 or 135;
  - a power attack: share times 0.66;
  - a raised sword: share 0.3 + 0.002 * D * S, D the Iron Sword's base damage;
  - an arrow: blocked only into the raised shield, never by the sword;
  - a bash on the raised shield: no stagger unless it lands during c2's swing; a bash on a lowered shield: a stagger whenever its stagger is above 0;
  - c2's stamina per blocked swing: 0.25 * p * pre-armor damage + stagger * fStaminaBlockStaggerMult;
  - in c1's game, recoilStart on c1 after each blocked swing, blockHitStart on c2's figure.
- Frida, if numbers disagree: the ID 44014 onEnter and onLeave log on c1 (1.6.1170 address from `just addr 44014`), plus IDs 37707, 37708 and 37710 onEnter. Frida attach was refused once (docs/verbs/activation-reach.md); the lab predictions above stand without it.
