# Melee reach in 1.7.104: how a swing picks its target

Status: every finding is a HYPOTHESIS (rule 2). Static analysis only; no lab
run yet. Question from the melee-reach verb (M1 validation): which engine code
decides that a melee swing reaches a target, so the server can refuse an OnHit
the game could not have produced (skymp5-server/cpp/server_guest_lib/
ActionListener.cpp: GetReach at 967, GetSqrDistanceToBounds at 995,
IsDistanceValid at 1063, its call commented out at 1425).

Program and tools: SkyrimSE-1.7.104.0.exe in the sky-re Ghidra project
(auto-analysis), read through pyghidra-mcp (search_strings, list_xrefs,
decompile_function, disassemble, read_bytes). Nothing renamed, commented or
saved. IDs are Address Library (AE) IDs found by reverse lookup of the 1.7.104
address in addrlib/aio's versionlib-1-7-104-0.bin with lab/addr.py's loader;
every ID cited also exists in versionlib-1-6-1170-0.bin (presence checked;
1.6.1170 is not in Ghidra, so its bodies are unverified). 1.7.104 addresses are
given only to find things in Ghidra. Master-file numbers: lab/esm.py, run read
only on sky-srv against /srv/persist/esm (10 plugins, 2026-10-03). On-disk
layouts: skymp/libespm/include/libespm/WEAP.h:37-45 and UESP ("Skyrim Mod:Mod
File Format/RACE" and "/WEAP"), which agree with CommonLib's in-memory structs.

Finding settings without string xrefs: game settings are constant-initialized
Setting objects (vtable, value at +8, name pointer at +0x10; CommonLib
include/RE/S/Setting.h:51-52) and their name strings have no code references.
Ghidra does hold a DATA reference from each object to its vtable, so list_xrefs
on SettingT<GameSettingCollection>'s vtable (ID 186284,
include/RE/Offsets_VTABLE.h:15) lists all 3516 GMST objects, and on
SettingT<INISettingCollection>'s (ID 187079, :229) all 1716 INI ones. read_bytes
over them, matched against search_strings hits, gives each setting's object and
executable default; list_xrefs on object+8 gives every reader.

## Hypothesis: melee-reach / which function computes an actor's melee reach

- Candidate: Address Library ID 38538 (1.7.104: 0x1406c80b0, HYPOTHESIS), not named by CommonLibSSE-NG (confidence: high)
- Evidence:
  - Decompiled, trimmed; comments mine; checked against the disassembly:
    ```c
    fVar4 = DAT_1420a57b0;                               // fCombatBashReach (object ID 373487)
    if ((*(uint *)(param_1 + 200) & 0xf0000000) != 0x60000000) {   // meleeAttackState != kBash
      if (lVar2 == 0) fVar4 = (float)FUN_1406874a0(param_1);         // ID 37478: race unarmedReach
      else fVar4 = (float)FUN_14041f5c0(*(undefined4 *)(lVar2 + 0x174)); // ID 26427: fCombatDistance * reach
    }
    fVar3 = (float)FUN_1402e6f30(param_1);               // ID 19664 TESObjectREFR::GetScale
    fVar4 = fVar4 * fVar3;
    if ((param_1 == DAT_1431df300) && (*(int *)(DAT_1431a5720 + 0x20) == 4))
      fVar4 = fVar4 * _DAT_1420a5678;                    // fVATSMeleeReachMult (object ID 373455)
    ```
  - lVar2 is the right hand's weapon: ID 39806 (`FUN_140720660(process, hand)`) returns middleHigh->rightHand (+0x260; +0x220 leftHand when hand is 1) only if the entry's object has form type 0x29 (Weapon); ID 38538 passes 0 (`XOR EDX,EDX`). ID 26427 is all of `return DAT_1420a71f0 * param_1;` (fCombatDistance, object ID 374164). ID 37478 is `return *(float *)(*(longlong *)(param_1 + 0x1f8) + 0x14c);`.
  - Offsets match CommonLib's 1.6.629+ layout: Actor+0xF8 currentProcess, +0x1F8 race (ACTOR_RUNTIME_DATA at 0xE8, include/RE/A/Actor.h:651, 684, 712); ActorState at 0xC0, actorState1 at +8, meleeAttackState bits 28-31, kBash = 6 (Actor.h:128, include/RE/A/ActorState.h:28, 116); AIProcess middleHigh at 0x08 (include/RE/A/AIProcess.h:196); rightHand 0x260, leftHand 0x220 (include/RE/M/MiddleHighProcessData.h:185, 177); Weapon = 0x29 (include/RE/F/FormTypes.h:181); TESObjectWEAP weaponData at 0x168, reach at +0x0C (include/RE/T/TESObjectWEAP.h:169; GetReach src/RE/T/TESObjectWEAP.cpp:12); TESRace data at 0xE8, unarmedReach at +0x64 (include/RE/T/TESRace.h:124, 314); VATS singleton ID 400883, VATSMode at 0x20, kKillCam = 4 (include/RE/V/VATS.h:45-64).
  - DAT_1431df300 is ID 401069: the PlayerCharacter constructor (ID 40411, installs VTABLE_PlayerCharacter ID 208040, include/RE/Offsets_VTABLE.h:2231) stores `this` there; its destructor (ID 40412) clears it. CommonLib's own player singleton is ID 403521 (include/RE/Offsets.h:451).
  - GetScale (ID 19664, src/RE/T/TESObjectREFR.cpp RELOCATION_ID(19238, 19664)) is `refScale * 0.01` (uint16 at +0x98, include/RE/T/TESObjectREFR.h:476) times ID 24763 when the base object is an NPC: `race->data.height[sex] * npc->height` (NPC +0x158 race, +0x1F8 NAM6), which CommonLib reimplements as TESNPC::GetHeight (src/RE/T/TESNPC.cpp:125).
  - Code callers of ID 38538: ID 38603 (hit frame, sweep), ID 38608 (melee target), ID 42350 (player attack-action setup). No others.
- Side effects (HYPOTHESIS): pure. reach = s * base * v:
  - base = fCombatBashReach while the attacker's melee attack state is kBash (any bash; the weapon is ignored);
  - else fCombatDistance * DNAM reach of the TESObjectWEAP in the right hand;
  - else the attacker's race unarmedReach, with no fCombatDistance factor;
  - s = GetScale(attacker) = refScale/100 * base NPC's race height[sex] * NPC height (NAM6);
  - v = fVATSMeleeReachMult when the attacker is the player and VATS is in kill cam, else 1.
  - Power attacks do not change it. The left hand never enters: a left-hand strike uses the right hand's weapon, or race unarmedReach when the right hand holds a spell, a torch or nothing.
  - Inputs read: Actor+0xC8, +0xF8, middleHigh+0x260, InventoryEntryData object (+0, include/RE/I/InventoryEntryData.h:59) and its form type (+0x1A), TESObjectWEAP+0x174, actor race (+0x1F8)+0x14C, refScale +0x98, NPC race +0x158 height (+0xF8 + 4 * sex), NPC +0x1F8, VATS +0x20, and the three settings.
  - Lab numbers: fCombatDistance 141 and fCombatBashReach 141 (Skyrim.esm GMST 0x00055640, 0x00055641); fVATSMeleeReachMult 2 (executable, no override). NordRace height 1.03/1.03; unarmedReach 96 for all ten playable races (WerewolfBeastRace 150); Player NPC_ NAM6 1.0. SteelSword reach 1.0, SteelGreatsword 1.3, SteelDagger 0.7, SteelBattleaxe and SteelWarhammer 1.3. Nord male player at refScale 1: sword 145.23, greatsword 188.80, dagger 101.66, any bash 145.23, unarmed 98.88.
- Suggested Frida trace: on ID 44001 (HitData::Populate, include/RE/H/HitData.h:43-48) onEnter, args[1] aggressor, args[2] target (skip null): call ID 38538 as NativeFunction('float', ['pointer']) on the aggressor (Interceptor's retval is RAX, not the XMM0 float) and log it with `(u32 at aggressor+0xC8) >>> 28`, ID 19664 on the aggressor, and the right-hand weapon. Scenario: c1 (Nord male) hits c2 with SteelDagger, SteelSword, SteelGreatsword, bare hands, a shield bash, and a power attack. Frida attach was refused once (docs/verbs/activation-reach.md); without it, the step-away test in the last block covers this.
- What would falsify this: a logged reach that is not s * base for its case (sword 141 * 1.03 = 145.23, unarmed 96 * 1.03 = 98.88, any bash 145.23); a bash whose reach follows the weapon; a power attack whose reach differs from the plain attack's; a left-hand strike whose reach follows the left weapon.

## Hypothesis: melee-reach / the settings involved and their values

- Candidate: these Setting objects, by Address Library ID (confidence: high for identity and executable default; live values need the lab)

  | setting | object ID | 1.7.104 object (HYPOTHESIS) | executable default | lab masters | read by (ID) |
  | --- | --- | --- | --- | --- | --- |
  | fCombatDistance | 374164 | 0x1420a71e8 | 128 | 141 (Skyrim.esm) | 26427; 34458 (touch-spell target visitor) |
  | fCombatBashReach | 373487 | 0x1420a57a8 | 128 | 141 (Skyrim.esm) | 38538; 49167 (AI bash range) |
  | fVATSMeleeReachMult | 373455 | 0x1420a5670 | 2 | none | 38538 |
  | fCombatHitConeAngle | 373601 | 0x1420a5ce8 | 35 | none | 47297; 27397 (BGSAttackData constructor) |
  | fCombatDeadActorHitConeMult | 373604 | 0x1420a5d00 | 2 | none | 47297 |
  | fMeleeSweepViewAngleMult | 373119 | 0x1420a4a28 | 2 | none | 38603 |
  | fAICombatSlopeDifference | 373959 | 0x1420a6ab0 | 48 | none | 47273 |
  | fHitCasterSizeSmall | 370082 | 0x14209e2e8 | 12 | none | 25925 |
  | fObjectHitWeaponReach | 375309 | 0x1420a9b28 | 150 | none | 38628 |
  | fObjectHitTwoHandReach | 375315 | 0x1420a9b58 | 112 | none | 38628 |
  | fObjectHitH2HReach | 375312 | 0x1420a9b40 | 64 | none | 38628 |
  | iActivatePickLength (int) | 375306 | 0x1420a9b10 | 150 | none | 38628 |
  | fMountedAttackRange:Combat (INI) | 382419 | 0x1420b9e60 | 135 | INI, client-editable | 47272 |
  | fHandReachDefault | 373582 | 0x1420a5c10 | 64 | none | 25300 (TESRace::InitializeData, VTABLE_TESRace ID 195941 slot 4) |
  | fCombatGiantCreatureReachMult | 373914 | 0x1420a68b8 | 2 | none | no code reader found |

- Evidence: the method in the header. Each value is the object's 32-bit value field in the image (for example fCombatDistance's object reads `60037e41 01000000 00000043 ...`: vtable, 128.0). `lab/esm.py find <plugin> GMST <name>` over all 10 plugins in /srv/persist/esm finds only fCombatDistance and fCombatBashReach overridden. The hit path (IDs 38538, 38603, 38608, 47272, 47273, 47276, 47297, 38628) reads no other reach or angle setting; ID 38628 also reads fWeaponClutterKnockMult, fWeaponClutterKnockMaxWeaponMass, fWeaponClutterKnockMinClutterMass and fWeaponClutterKnockBipedScale, which size the impulse on clutter. fCombatAttackMovingAttackReachMult, fCombatBlockAttackReachMult, fCombatMagicWardAttackReachMult, fCombatDistanceMin, fVATSMeleeMaxDistance and fAIActivateReach are not inputs to the hit test.
- Side effects (HYPOTHESIS): data only. fCombatHitConeAngle is only the default strikeAngle given to a new BGSAttackData (ID 27397 writes it at +0x30) and the fallback when an attack has no attack data; the angle used is the attack's ATKD strikeAngle. NordRace in Skyrim.esm (ATKD read in UESP's order, which matches CommonLib's AttackData, include/RE/B/BGSAttackData.h:26-37, and the flags corroborate the names): attackStart strikeAngle 50; the other 26 events (left hand 0x8, power 0x4, bash 0x2 and 0x6, sprint, dual wield) 35; attackAngle 0 everywhere. fHandReachDefault only seeds a race's unarmedReach before its DATA loads.
- Suggested Frida trace: none needed. lab-driver settings action: gmst [fCombatDistance, fCombatBashReach, fVATSMeleeReachMult, fCombatHitConeAngle, fCombatDeadActorHitConeMult, fMeleeSweepViewAngleMult, fAICombatSlopeDifference, fHitCasterSizeSmall, fObjectHitWeaponReach, fObjectHitTwoHandReach, fObjectHitH2HReach], ini [fMountedAttackRange:Combat]. iActivatePickLength is an integer GMST; the driver reads floats only (Game.getGameSettingFloat in lab/driver/src/index.ts), so it needs Game.GetGameSettingInt.
- What would falsify this: a live value other than the table (another plugin or an INI) changes the numbers, not the shape; a reader of these objects outside the listed functions means another path uses them.

## Hypothesis: melee-reach / where the hit test runs and which actor it picks

- Candidate: HitFrameHandler::ExecuteHandler, ID 42828 (VTABLE_HitFrameHandler ID 208845 slot 1, include/RE/Offsets_VTABLE.h:2401), calls ID 38603 (melee hit frame), which picks the target with ID 38608 (melee target) and ID 47272 (target pick) (confidence: high for the chain, med for each branch)
- Evidence:
  - ID 42828, complete apart from the attack-state update:
    ```c
    cVar1 = (**(code **)(*param_2 + 0x4c8))(param_2,0);   // Actor::IsDead(false), slot 0x99
    if (cVar1 == '\0') {
      lVar3 = FUN_1401544f0();
      FUN_1406cbee0(param_2,*(longlong *)(lVar3 + 0x5d0) == *param_3,1);   // +0x5d0 is "Left"
    }
    ```
    HitFrameHandler is an IHandlerFunctor<Actor, BSFixedStringCI> (RTTI strings; include/RE/I/IHandlerFunctor.h), so it serves every actor; the string cache entry at +0x5d0 is built from the literal "Left".
  - ID 38603, trimmed:
    ```c
    if (*(int *)(DAT_1431a5720 + 0x20) == 0) {             // VATS off
      lVar5 = FUN_1406cc490(param_1);                      // ID 38608
      if (lVar5 == 0) goto LAB_1406cc1c3;
      cVar3 = FUN_1406756b0(lVar5);                        // ID 37275 Actor::IsGhost (Offsets.h:12)
      if (cVar3 != '\0') goto LAB_1406cc1c3;
    } ...
    LAB_1406cc1c3:
      lVar5 = FUN_1406cd850(param_1);                      // ID 38628, eye sphere cast
      if (param_1 != DAT_1431df300) {                      // NPC: must be its combat target
        if (lVar5 == 0) goto LAB_1406cc211;
        iVar1 = *(int *)((longlong)param_1 + 0x104);
        piVar9 = (int *)FUN_1402f60c0(lVar5,local_res20);
        if (*piVar9 != iVar1) { lVar5 = 0; goto LAB_1406cc211; }
      }
    ...
    FUN_1406cd2f0(param_1,lVar5,0,param_2);                // ID 38627 applies the hit
    ```
  - ID 38608, trimmed; the forced-target test and the attack-data line paraphrased:
    ```c
    uVar5 = FUN_140172410(param_1 + 0xe,local_res8,...);   // ID 12037: ExtraForcedTarget handle (0x9D, include/RE/E/ExtraDataTypes.h:331)
    FUN_14017ed00(uVar5,&local_res10);
    cVar4 = (**(code **)(*param_1 + 0x718))(param_1);      // Actor::IsInCombat, slot 0xE3
    if ((cVar4 == '\0') && (local_res10 != 0)) { ... if Actor, return it ... }
    puVar6 = (process == 0) ? &DAT_1431e7950 : FUN_140700c60();  // ID 39540: &high->attackData (+0x258)
    uVar8 = FUN_1406c80b0(param_1);                        // ID 38538
    lVar7 = FUN_140866260(param_1,uVar8,uVar5);            // ID 47272
    ```
  - ID 47272, key lines verbatim, the loop paraphrased:
    ```c
    local_98[0] = *(undefined4 *)((longlong)param_1 + 0x104);   // currentCombatTarget handle
    cVar2 = FUN_140285a30(param_1);                             // ID 17965: !kIsAMount && ExtraInteraction, CommonLib's Actor::IsOnMount (src/RE/A/Actor.cpp:883)
    if (cVar2 != '\0') { param_2 = DAT_1420b9e68; }             // fMountedAttackRange:Combat
    // no combat target: ID 38702 Actor::GetMount(&mount); for each ProcessLists (ID 400315)
    //   highActorHandles entry: skip self, the mount, actors with no Get3D2 (slot 0x70),
    //   dead actors unless the attacker is the player, and every dead one in kill cam;
    //   keep it if FUN_140866600(param_1,cand,0,mount) <= param_2 (mount in R9, per the disassembly)
    //   and FUN_140867ca0(param_1,cand,param_1+0x54,cand+0x54,param_3,1.0f,&angle,1)
    //   and angle <= best; NPC attackers then test the player the same way;
    //   if the attacker is the player, FUN_1406a2830(player,best,6.2831855) must be nonzero.
    // combat target: FUN_140867ca0(...,1.0f,0,1) && FUN_140866600(param_1,target,1,0) <= param_2
    ```
  - ID 37768 (FUN_1406a2830) builds its ray filter on collision layer 0x29 = 41, kLOS (include/RE/C/CollisionLayers.h:48), from the eye to up to three points of the target: a line-of-sight test. The angle argument 2*pi disables its view cone.
  - ID 38627's only other caller, ID 44218, is the projectile hit: it resolves the handle at +0x128 (CommonLib Projectile shooter /* 120 */ in runtime data at 0x98, moved to 0xA0 on 1.6.629+, include/RE/P/Projectile.h:254, 293) and passes the projectile as the third argument. Melee hits reach ID 38627 only from ID 38603.
  - No weapon collision in flat Skyrim: the 1.7.104 executable has no LeftMeleeContactListener or RightMeleeContactListener RTTI (search_strings "ContactListener"); CommonLib lists them for VR only (include/RE/Offsets_RTTI.h:8048-8049).
- Side effects (HYPOTHESIS): on each HitFrame of a living actor, at most one primary target:
  1. the attacker's ExtraForcedTarget, if the attacker is not in combat (no reach, no cone);
  2. else, if the attacker has a current combat target (Actor+0x104; CommonLib currentCombatTarget /* 0FC */ plus the 1.6.629 shift), only that target, on cone and distance with the slope rule;
  3. else the high-process actor (and, for NPC attackers, the player) with the smallest cone angle among those within reach and inside the cone; the player's winner must also pass line of sight; a ghost is dropped;
  4. if nothing qualifies, ID 38628's eye sphere cast (its own block).
  - Mounted attackers: reach becomes fMountedAttackRange:Combat (135, not scaled) and distance is measured from the mount, which is never a candidate.
  - ID 38627 then applies the hit (ID 44001 HitData::Populate inside) with no further distance test; it only drops ghosts, deleted or disabled targets (formFlags 0x820), attackers without a process, and for an NPC attacker in combat a combat-controller check (combatController at Actor+0x160, include/RE/A/Actor.h:669 plus the 1.6.629 shift) can skip the target-side processing (ID 38586: damage, sneak attack).
- Suggested Frida trace: ID 42828 onEnter (args[1] actor; formID at +0x14, include/RE/T/TESForm.h:354; payload BSFixedString) and log the actor's u32 at +0x104; ID 38608 and ID 38628 onLeave (retval: target or 0); ID 44001 onEnter (aggressor, target). Scenario: c1 swings at c2 inside reach, just outside it, and inside it but 60 degrees off its heading.
- What would falsify this: a hit logged by ID 44001 during a HitFrame in which ID 38608 and ID 38628 both returned 0 (another path); a melee hit with no ID 42828 call; the player hitting an actor other than its +0x104 combat target while that handle is set.

## Hypothesis: melee-reach / the distance the reach is compared with

- Candidate: ID 47273 (melee distance), with ID 19823 (reference distance), ID 19494 (same interior cell or worldspace), ID 47276 (combined radius), ID 37443 and ID 37868 (actor forward extent), Actor::GetBoundMax/GetBoundMin ID 37180/37179 (VTABLE_Actor ID 207511 slots 0x74/0x73, same entries in VTABLE_Character 207886 and VTABLE_PlayerCharacter 208040), TESObjectREFR::GetBoundMax ID 19755 (VTABLE_TESObjectREFR ID 190259 slot 0x74) (confidence: high)
- Evidence:
  - ID 47273, trimmed; comments mine:
    ```c
    fVar9 = (float)FUN_1402f4120(plVar7,param_2,0,0);     // ID 19823; plVar7 = param_4 (mount) or param_1
    ... both actors: bVar4 = both have actorState1 & 0x400 (ID 38986), the swimming bit
    if ((bVar4) || ((param_3 != '\0' && (_DAT_1420a6ab8 <= ABS(fVar11 - fVar12))))) { // fAICombatSlopeDifference
      ... z extents from GetBoundMax/GetBoundMin (vtable 0x3a0/0x398) ...
      if (vertical extents overlap) fVar9 = SQRT((fVar1 - fVar3) * (fVar1 - fVar3) + fVar10 * fVar10);
    }
    fVar10 = (float)FUN_1408669a0(param_1,param_2);       // ID 47276
    fVar9 = fVar9 - fVar10;
    ```
  - ID 19823 returns `SQRT(dy*dy + dx*dx + dz*dz)` over data.location (+0x54; include/RE/T/TESObjectREFR.h:79, 495), or FLT_MAX if the target is deleted or disabled (formFlags bits 5 and 11, include/RE/T/TESForm.h:62, 75) or ID 19494 finds them in different interior cells or worldspaces.
  - ID 47276 is `F(a) + F(b)`: F(actor) = ID 37443; F(any other reference) = GetScale * GetBoundMax().y.
  - ID 37443 returns CachedValues+0x0C (AIProcess+0x50; include/RE/A/AIProcess.h:86, 201; CommonLib calls it cachedForwardLength) when flag 0x8000 is set, else ID 37868:
    ```c
    (**(code **)(*param_1 + 0x3a0))(param_1,local_38);    // GetBoundMax
    (**(code **)(*param_1 + 0x398))(param_1,local_28);    // GetBoundMin
    if (local_34 - local_24 <= 0.0) { local_34 = 16.0; }
    else { fVar3 = (float)FUN_1402e6f30(param_1); local_34 = local_34 * fVar3; /* cache, flag 0x8000 */ }
    ```
  - Actor::GetBoundMax (ID 37180) is center + extents of the object at middleHigh+0x180 (CommonLib unk180, include/RE/M/MiddleHighProcessData.h:156), read as a BSBound (center 0x18, extents 0x24, include/RE/B/BSBound.h:26-27); without it, TESObjectREFR::GetBoundMax (ID 19755): the loaded 3D's extra data named "BBX" (BSFixedString built from that literal), else the base object's OBND.
- Side effects (HYPOTHESIS): pure apart from the cache. melee distance = |p_target - p_origin| - (F_attacker + F_target):
  - p is the reference position (feet); origin is the attacker, or its mount when mounted;
  - 3D, except horizontal when both actors swim, or (combat-target branch only) when |dz| >= fAICombatSlopeDifference (48), and in both cases only when the attacker's top or bottom lies within the target's vertical extent;
  - F(actor) = forward (+Y) extent of its BBX bound * its own GetScale, 16 if the bound is flat.
  - So the hit condition is |p_t - p_o| <= reach + F_a + F_t. Target scale enters only through F_t; attacker scale twice (reach and F_a). No weapon node, and for loaded actors no OBND.
  - Inputs: positions (+0x54 to +0x5C), formFlags (+0x10), parentCell (+0x60) and its worldspace, actorState1 (+0xC8), the BSBound or BBX, refScale, NPC and race heights, CachedValues +0x0C and +0x2C, fAICombatSlopeDifference.
- Suggested Frida trace: at ID 44001 onEnter call ID 47273 (NativeFunction('float', ['pointer','pointer','uint8','pointer'])) with (aggressor, target, 0, NULL) and ID 37443 on each actor, and log both positions (3 floats at +0x54). Scenario: c1 at measured center distances from c2 on flat ground, once on stairs.
- What would falsify this: F not equal to BBX max Y * scale (for example F changing with facing); a logged melee distance other than |dp| - F_a - F_t; hits with |dp| above reach + F_a + F_t while ID 38628 returned 0.

## Hypothesis: melee-reach / the angular test (hit cone)

- Candidate: ID 47297 (1.7.104: 0x140867ca0, HYPOTHESIS) (confidence: high)
- Evidence: decompiled, trimmed; the last two lines paraphrased:
  ```c
  local_68 = param_4[2] - param_3[2]; local_6c = param_4[1] - param_3[1]; local_70 = *param_4 - *param_3;
  fVar7 = (float)FUN_140edbe70(&local_70);      // ID 70173: atanf(x / y) with quadrant fix, yaw only
  // player and not mounted: fVar9 = an aim angle from ID 41248 on the 3D node "ProjectileNode"
  if ((param_5 != 0) && ((param_8 == '\0' || ((*(uint *)(param_5 + 0x28) >> 4 & 1) == 0))))
    fVar9 = fVar9 + *(float *)(param_5 + 0x2c) * 0.017453292;          // attackAngle
  fVar8 = (float)(**(code **)(*param_1 + 0x520))(param_1,0);          // Actor::GetHeading(false), slot 0xA4
  fVar9 = ABS((fVar8 + fVar9) - fVar7) * 57.295776;
  if (180.0 < fVar9) { fVar9 = ABS(fVar9 - 360.0); }
  fVar7 = DAT_1420a5cf0;                         // fCombatHitConeAngle
  if (param_5 != 0) { fVar7 = *(float *)(param_5 + 0x30); }          // strikeAngle
  // pass if fVar9 <= fVar7 * param_6; else pass only for a dead Actor target with
  // fVar9 <= DAT_1420a5d08 * fVar7 * param_6 (fCombatDeadActorHitConeMult)
  ```
  param_5 is the current BGSAttackData (HighProcessData::attackData, include/RE/H/HighProcessData.h:256, through ID 39540); +0x28 flags, +0x2C attackAngle, +0x30 strikeAngle are AttackData at BGSAttackData+0x18 (include/RE/B/BGSAttackData.h:26-37, 54); flag bit 4 is kRotatingAttack.
- Side effects (HYPOTHESIS): pure. Pass if |heading + attackAngle (left out for rotating attacks when param_8 is 1, as in the pick) + player aim offset - yaw of (target - attacker)| <= strikeAngle * m, where m = 1 in the pick and fMeleeSweepViewAngleMult (2) for sweep extras, and a dead target gets fCombatDeadActorHitConeMult (2) times more. strikeAngle is a half angle; pitch and height never enter. NordRace: 50 degrees for the basic right attack, 35 for everything else.
- Suggested Frida trace: at ID 44001 onEnter call ID 47297 as NativeFunction('uint8', ['pointer','pointer','pointer','pointer','pointer','float','pointer','uint8']) with the attack data from `*(*(*(aggressor+0xF8)+0x10)+0x258)` and an out float; log the angle. Scenario: c1 swings at c2 well inside reach at 0, 30, 45 and 60 degrees off its heading, with the basic attack (50) and a power attack (35).
- What would falsify this: hits beyond strikeAngle while ID 38628 returned 0, misses inside it, or any dependence on pitch.

## Hypothesis: melee-reach / the fallback when no actor passes: a sphere cast from the eye

- Candidate: ID 38628 (1.7.104: 0x1406cd850, HYPOTHESIS), with ID 25931 (linear cast), ID 25925 and ID 25930 (cast object and its bhkSphereShape) (confidence: med)
- Evidence:
  ```c
  fVar33 = (float)DAT_1420a9b18;                                   // iActivatePickLength
  if (((local_368 != 0) && (fVar33 = DAT_1420a9b48, *(char *)(local_368 + 0x19d) != '\0')) && // fObjectHitH2HReach
     (fVar33 = DAT_1420a9b30, (byte)(*(char *)(local_368 + 0x19d) - 5U) < 2)) {          // fObjectHitWeaponReach
    fVar33 = DAT_1420a9b60;                                        // fObjectHitTwoHandReach
  }
  (**(code **)(*param_1 + 0x610))(param_1,&local_598,&local_600,0); // Actor::GetEyeVector(origin, dir, false), slot 0xC2
  cVar4 = FUN_1403ff900(lVar10,plVar9,&local_598,&local_600,CONCAT44(uVar23,fVar33));   // ID 25931
  ```
  local_368 is HitData.weapon (+0x30 of the HitData filled by ID 44001); +0x19D is weaponData.animationType (0x168 + 0x35). ID 25931 sweeps from origin to origin + dir * length (both * 0.0142875, Havok units) using the phantom made by ID 25930: `bhkSphereShape` of radius size * 0.0142875, with size = fHitCasterSizeSmall for variant 0 of ID 25925, which is the one ID 38628 requests (`FUN_1403ff300(0,1)`); filter layer 43 (CommonLib names it kUnused0, include/RE/C/CollisionLayers.h:50). If the closest hit's owner is an Actor (form type 0x3E), ID 38628 returns it; otherwise it applies impulse and impact effects and returns 0.
- Side effects (HYPOTHESIS): when the pick finds nothing, a sphere of radius fHitCasterSizeSmall (12) is swept from the attacker's eye along its eye direction for 150 (one-handed and other non two-handed weapon types), 112 (two-handed sword and axe, types 5 and 6), 64 (weapon type 0, hand to hand), or 150 (iActivatePickLength, when HitData carries no weapon). The first actor it touches becomes the target: always for the player, only the combat target for an NPC. No cone, no scale, no reach formula. A short weapon could therefore land farther than its pick bound when aimed straight (a Nord's dagger pick reach is about 102 plus the F terms), so a server bound must cover the larger of the two.
- Suggested Frida trace: ID 38628 onEnter and onLeave (retval). Scenario: c1 with SteelDagger looking straight at c2 at 110, 130, 150 and 170 units center distance, then the same with SteelGreatsword.
- What would falsify this: no dagger hit beyond reach + F_a + F_t even when aimed straight (the collision matrix for layer 43 was not read; it may not include actor bodies), or hits farther than length + 12 + the target's body radius from the eye.

## Hypothesis: melee-reach / sweep attacks

- Candidate: inside ID 38603: ID 23526 BGSEntryPoint::HandleEntryPoint (include/RE/B/BGSEntryPoint.h:110-116) with entry point 0x32, kSetSweepAttack (:63) (confidence: high)
- Evidence:
  ```c
  FUN_14038cff0(0x32,param_1,lVar13,local_res8);           // HandleEntryPoint(kSetSweepAttack, attacker, weapon, &out)
  ... lVar13 = *plVar6 (the attack data) from here; for each ProcessLists highActorHandles entry
  ... other than the primary target:
  fVar14 = (float)FUN_140866600(param_1,local_80[0],0,0);  // ID 47273
  fVar15 = (float)FUN_1406c80b0(param_1);                   // ID 38538
  if ((fVar14 <= fVar15) && (cVar3 = FUN_140867ca0(param_1,lVar2,(longlong)param_1 + 0x54,lVar2 + 0x54,lVar13,
                             DAT_1420a4a30,0,1), cVar3 != '\0')) { FUN_1406cd2f0(param_1,lVar2); }
  ```
- Side effects (HYPOTHESIS): when a perk entry point returns nonzero for this attack, every other high-process actor within the same reach and within 2 * strikeAngle (fMeleeSweepViewAngleMult) is hit too (ID 38627). No line of sight, dead or 3D filter in this loop.
- Suggested Frida trace: count ID 38627 calls per ID 42828 call. Needs a character with a sweep perk; optional for M1.
- What would falsify this: extra targets hit outside reach or outside 2 * strikeAngle.

## Hypothesis: melee-reach / do players and NPCs share the path

- Candidate: yes. ID 42828, ID 38603, ID 38608, ID 47272, ID 47273, ID 47297 and ID 38538 serve every actor, with player-only and NPC-only branches (confidence: high for the shared path, med for each branch)
- Evidence: the handler is per Actor (IHandlerFunctor<Actor, BSFixedStringCI>); the branches compare the attacker with the player pointers (ID 401069 in 38538, 38603, 47272; ID 403521 in 47272 and 47297); Actor, Character and PlayerCharacter share GetBoundMax/GetBoundMin. The player is not in ProcessLists highActorHandles (include/RE/P/ProcessLists.h:69), hence the explicit player test for NPC attackers. TiltedEvolution (dev, Code/client/Games/Skyrim/Actor.cpp) hooks only a damage function downstream (HookDamageActor) and has no reach check, so it maps nothing here.
- Side effects (HYPOTHESIS):
  - Player only: dead actors are pick candidates (dead cone 2x); line of sight (ID 37768) on the winner; the aim offset in the cone (ID 41248, not mounted); the kill-cam reach multiplier; the eye cast may return any actor.
  - NPC only: the player is tested explicitly; with a combat target, only that target is tested, with the slope rule; the eye cast must return the combat target; ID 38627's combat-controller check can skip the target-side processing (ID 38586).
  - Both: power attacks change only the attack data (strikeAngle, attackAngle); any bash switches the base reach to fCombatBashReach.
- Suggested Frida trace: the same hooks with a gamemode-spawned NPC attacking c1.
- What would falsify this: an NPC's hit on the player going through a different reach function, or a player-specific HitFrame handler.

## Hypothesis: melee-reach / the bound the server should enforce

- Candidate: replace GetReach and GetSqrDistanceToBounds (ActionListener.cpp:967, 995) with the engine's shape (confidence: med)
- Evidence: the blocks above; ActionListener.cpp today: GetReach multiplies weapon reach by fCombatDistance and uses race unarmedReach for unarmed, both without the attacker's scale, with no bash or mounted case; GetSqrDistanceToBounds measures from a point 15 + attacker OBND max Y in front of the attacker to the target's OBND box.
- Side effects (HYPOTHESIS): an engine-faithful acceptance test for a client OnHit:
  - pick: |p_t - p_a| (3D; horizontal when both swim) <= R + F_a + F_t, with R = s_a * (isBashAttack ? fCombatBashReach : right-hand weapon ? fCombatDistance * DNAM reach : race unarmedReach); mounted: R = fMountedAttackRange:Combat (135), measured from the mount;
  - or the eye cast: distance from the attacker's eye to the target's body <= L + fHitCasterSizeSmall, L = 150, 112, 64 or 150 by weapon type as above;
  - the TODO's "missing reach component" is F_a + F_t (BBX forward extents times scale) together with the scale on R. The server has no BBX: F needs a per-race (or per-skeleton) table measured in the lab, or one conservative constant;
  - plus latency slack, since the client tested positions the server saw a tick earlier;
  - the server treats source 0x1F4 as unarmed (ActionListener.cpp:939-942); that form is the WEAP "Unarmed" in Skyrim.esm (DNAM reach 1.0), which the engine holds in ID 401061 (looked up by form id 0x1F4 at load). The engine still uses race unarmedReach (96), not 141 * 1.0, because an empty hand has no inventory entry;
  - the engine takes R from the right hand even for a left-hand strike, so the server should use the attacker's equipped right hand, not hitData.source, to pick R.
- Suggested Frida trace: none needed for the T3 step-away test: for SteelDagger, SteelSword, SteelGreatsword, bare hands and a shield bash, record the largest center distance at which c1's swing still produces an OnHit on c2 (lab-driver positions, server log). With c1 turned 30 degrees off c2 (inside both 35 and 50, so only the pick can hit), d_max - R must be the same constant (F_a + F_t) for every weapon. Facing straight, the dagger and bare hands may exceed it (eye cast).
- What would falsify this: in the off-axis runs, d_max - R varying with the weapon.

## Hypothesis: melee-reach / what I could not find

- Candidate: none (confidence: n/a)
- Evidence: gaps, each a lab or follow-up question:
  - F itself: the BBX bound is runtime data from the skeleton NIF, in neither the executable nor the masters; measure it (ID 37443 per actor).
  - Whether layer 43 (the eye cast) collides with actor bodies: the collision matrix was not read. The code handles actor hits, but that is not proof.
  - Whether the player's currentCombatTarget handle (+0x104) is ever set; if it is, the player's pick narrows to that one target.
  - What ID 41248 (a large projectile-aim function) adds to the player's cone center for melee; not followed.
  - fCombatGiantCreatureReachMult: its only references are its registration (ID 2712) and destructor; no reader found.
  - Who sets ExtraForcedTarget (0x9D), which skips reach and cone for an attacker out of combat.
  - Kill moves (paired animations): a separate path, not traced.
  - That shield and weapon bashes both reach the hit frame in attack state kBash: the behavior graph sets that state, not code read here.
  - 1.6.1170: not in the Ghidra project; the IDs exist there, the bodies are unverified.
- Side effects (HYPOTHESIS): none.
- Suggested Frida trace: log ID 37443 per actor and the attacker's +0x104 at each ID 42828.
- What would falsify this: n/a.
