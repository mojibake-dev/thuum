# State no native reaches: the AI's night lock and a package's door use (W1 system 5)

Written 08:50Z 2026-11-03 (thuum-cf's agent; the static half, no trace of its own) under the root-cause plan's W1
(docs/research/root-cause-plan-2026-11-02.md:58-82, system 5: "state no native reaches (the AI's night lock, a package's door
use): ADR-062's H3") and ADR-064 decisions 1, 2 and 7 (docs/DECISIONS.md:4073): the engine's own path for world state the AI
changes with no Papyrus native in the way, from the input (the clock reaching a package's hour, a package's procedure that locks or
unlocks doors, an NPC's package needing a door, an owner leaving its house) to every consequence, per viewpoint, each claim
CONFIRMED with the run or trace id that saw it or HYPOTHESIS. The system is frozen (ADR-064 decision 7): no lock or door code
reaches a seat until section 5's condition holds. The verb docs are docs/verbs/locks.md (its engine table lacks the night lock, the
finding ADR-064 names; its "host's engine-made lock" section at :281-294 is the first write-up), docs/verbs/npc-handoff.md (the
door walk, D6 and D9) and docs/verbs/papyrus-events.md (ADR-062's hooks at the natives' entries, the census); they cite these rows
(E-numbers) instead of re-deriving a slice. ADR-062's words the plan cites (DECISIONS.md:3861, the Lock row of its census):
"hook at the ENGINE level (the reference's lock set, which the AI's night lock-up and a script's Lock both reach; playtest 41's
Alvor door, locked on the host alone)"; its H3: "a native's Papyrus entry is not one function per name". ADR-063's H3
(DECISIONS.md:3971): "an engine path no channel covers (the AI's night lock reached no native) shows up as a desync in play; the
fix is a channel, a row in ADR-062's table, never a name."

The reading rule for every row below: a decompiler read is a hypothesis with a source (ADR-064 decision 1); a record read from
Skyrim.esm is a fact about the data, never about the engine, so a row standing on one says "the records read" and keeps the engine's
part HYPOTHESIS; a playtest's log or Eli's words without a run id is a hypothesis with a witness; a code read of the fork says what
the project does today, never what the engine does. Every Ghidra read below was taken from the UNPACKED program
(/SkyrimSE-1.6.1170.0.exe.unpacked.exe on sky-re, 2026-11-03 08:3x to 08:5xZ): the packed program's functions decompile to an
`int3` stub (19512 read as `swi(3)` there), so a read against it says nothing. Addresses are the program's (image base
0x140000000); an Address Library id is given wherever CommonLibSSE-NG names one and `just addr` resolved it (1.6.1170, 428461
entries, 2026-11-03); a function with no id is named by its address and by the vtable slot that reaches it.

## 1. Scope and sources

Three viewpoints: (a) the HOST's engine, the seat whose AI runs the resident whose package locks, unlocks or walks through a door
(the cell's host for its residents, ADR-063 decision 1; the follower of an actor into a cell nobody hosts, ADR-047 D6); (b) a
NON-HOST's engine, a seat that loads the same door, whose residents are puppets with the AI off (npc-puppet.md:19, :97), and what the
project's sync carries to it today (the server's isOpen property at frame rate, the lock property, the door line "door 13407:
1348a's host ff000000 walks it through to 3c"); (c) a seat that LOADS LATE (a login, a cell entry, a reconnect, a restart), where the
engine's own load of the record and the server's recorded state meet.

The engine systems in scope, each with its CommonLibSSE-NG surface (the pin b93280e8, paths under CommonLibSSE-NG/include/RE/):

- The lock. `LOCK_LEVEL` (E/ExtraLock.h:9-18: kUnlocked -1, kVeryEasy 0 to kVeryHard 4, kRequiresKey 5); `REFR_LOCK` (:20-46:
  baseLevel :34, key :38, flags :39 with kLocked 1<<0 :25 and kLeveled 1<<2 :26, numTries :42; `SetLocked` :31, `IsLocked` :30,
  `GetLockLevel` :29); `ExtraLock { REFR_LOCK* lock; // 10 }` (:48-63; ExtraDataTypes.h:216 kLock 0x2A); the reference's accessors
  `GetLock` (T/TESObjectREFR.h:407; src/RE/T/TESObjectREFR.cpp:434-438 through Offset::TESObjectREFR::GetLock, Offsets.h:541
  RELOCATION_ID(19818, 20223)), `GetLockLevel` (:408; src :441-444: the lock's level or kUnlocked), `IsLocked` (:450; src
  :714-716: GetLockLevel() != kUnlocked), `IsAnOwner(const Actor*, bool a_useFaction, bool a_requiresOwner)` (:440; src :641-645
  RELOCATION_ID(19805, 20210)), `GetOwner` (:412); the change flags kOwnershipExtra 1<<6 (:146), kLockExtra 1<<12 (:150),
  kOpenDefaultState 1<<22 (:152), kOpenState 1<<23 (:153); `TESLockChangedEvent { lockedObject }` (T/TESLockChangedEvent.h:13);
  the holder's source `BSTEventSource<TESLockChangedEvent>` at 06E0 (S/ScriptEventSourceHolder.h:85) and `GetSingleton`
  (src/RE/S/ScriptEventSourceHolder.cpp:12 RELOCATION_ID(14108, 14298)); the conditions kGetLocked 5 (T/TESCondition.h:39),
  kGetLockLevel 65 (:104), kLock 114 and kUnLock 115 (:159-160), kIsUnlockedDoor 718 (:864), kGetIsLockBroken 519 (:643).
- The door. `TESObjectDOOR` (T/TESObjectDOOR.h:13-19: TESBoundAnimObject, TESFullName, TESModelTextureSwap,
  BGSDestructibleObjectForm, BGSOpenCloseForm at 88; Flag kAutomatic 1<<1 :28, kHidden :29, kMinimalUse :30, kSliding :31,
  kDoNotOpenInCombatSearch :32; the ChangeFlag kTeleportExtra 1<<17 :39; `Activate` override slot 37 :62; `HandleOpen` override
  :68; `LinkRandomTeleportDoors` :70-75 RELOCATION_ID(17539, 17944); openSound :79, closeSound :80, flags FNAM :82);
  `BGSOpenCloseForm` (B/BGSOpenCloseForm.h:13-20 OPEN_STATE kNone 0, kOpen 1, kOpening 2, kClosed 3, kClosing 4; `HandleOpen`
  slot 01 :25, `HandleClose` slot 02 :26; `GetOpenState` :29, src/RE/B/BGSOpenCloseForm.cpp:9 RELOCATION_ID(14180, 14288);
  `SetOpenState(ref, open, snap)` :30, src :16 RELOCATION_ID(14179, 14287)); `TESOpenCloseEvent { ref, activeRef, opened }`
  (T/TESOpenCloseEvent.h:11-13), its source at 08F0 (S/ScriptEventSourceHolder.h:91) and `SendOpenCloseEvent` (:128); the
  teleport: `DoorTeleportData { linkedDoor, position, rotation, flags }` (E/ExtraTeleport.h:10-19), `ExtraTeleport` (:21-36;
  ExtraDataTypes.h:217 kTeleport 0x2B), `ExtraDataList::GetTeleportLinkedDoor` (E/ExtraDataList.h:190); the activation
  `ActivateRef` (T/TESObjectREFR.h:367; src :55 RELOCATION_ID(19369, 19796)); `MoveTo` (:456), `MoveTo_Impl` (:507),
  `SetParentCell` slot 98 (:352), `IsDead` slot 99 (:353), `SetAltered` slot 24 (:235); the AI's door bookkeeping in
  HighProcessData: lastExtDoorActivated (H/HighProcessData.h:208), approachingAutoTeleportDoor (:350), doorActivated (:365);
  kSetLastExtDoorActivated 557 (T/TESCondition.h:686); the record flag kInaccessible 1<<8 for a DOOR (T/TESObjectREFR.h:175).
- The package. `PACKAGE_PROCEDURE_TYPE` (T/TESPackage.h:34-83: kSleep 4 :41, kSandbox 12 :49, kPackageTemplate 19 :56, kTrespass
  23 :60; no lock procedure in the enum, the lock procedures are named strings, E1); `PACKAGE_DATA` (:102, PKDT) whose
  `GeneralFlag` has kUnlocksDoorsAtPackageStart 1<<6 (:111) and kUnlocksDoorsAtPackageEnd 1<<7 (:112) and NO flag that locks;
  `PACK_SCHED_DATA` (:189: hour :211, duration in minutes :216) and `PackageSchedule` (:220, PSDT); the class's packData (:300),
  packLoc (:303), packSched (:306), procedureType (:314); `PackageLocation` (P/PackageLocation.h:15-29 Type kNearEditorLocation 3
  :21; locType :48, rad :51, data :52); `ActorPackage` (A/ActorPackage.h:22 package, :25 currentProcedureIndex, :26
  packageStartTime); `AIProcess::currentPackage` at 018 (A/AIProcess.h:198), hourPackageEvaluated (:36), `GetRunningPackage`
  (:172); `Actor::EvaluatePackage` (A/Actor.h:523), `PutCreatedPackage` slot DF (:421), `MoveToMiddleHigh` slot F4 (:442); the
  conditions kGetNumericPackageData 612 and kIsNullPackageData 611 (T/TESCondition.h:744-745), kGetVMScriptVariable 630 (:763,
  non-owning-seat.md P7), kGetIsCurrentPackage 161 (:213), kGetCurrentAIPackage 110 (:155).
- The cell. `TESObjectCELL::Flag` (T/TESObjectCELL.h:122-134: kIsInteriorCell 1<<0 :125, kPublicArea 1<<5 :130, kHandChanged
  1<<6 :131, kWarnToLeave 1<<9 :133); its ChangeFlag kOwnership 1<<3 (:148). FormType values (F/FormTypes.h: Faction 0B :151,
  Activator 18 :164, Container 1C :168, Door 1D :169, Furniture 28 :180, ActorCharacter 3E :202, Package 4F :219); TESForm's
  formID at 14 and formFlags at 10 (T/TESForm.h:353-354), `AddChange` slot 0A (:133).
- The vtables (Offsets_VTABLE.h, the AE id and its 1.6.1170 offset by `just addr`): VTABLE_TESObjectDOOR :542 ([0] 189666 ->
  0x179ede8, [4] the BGSOpenCloseForm table 189674 -> 0x179f128), VTABLE_TESObjectREFR :649 ([0] 190259 -> 0x17ae180),
  VTABLE_BGSProcedureLock :1408 (202819 -> 0x1853bd8), VTABLE_BGSProcedureUnlock :1410 (202857 -> 0x1853e18),
  VTABLE_BGSProcedureLockUnlockExecState :1412 (202869 -> 0x1853f88), VTABLE_BGSProcedureSleep :1461 (203357 -> 0x1856908),
  VTABLE_TESPackage :1515 (203948 -> 0x185b2c0), VTABLE_Actor :2142 ([0] 207511 -> 0x189d870), VTABLE_Character :2215 ([0]
  207886 -> 0x18a5558), VTABLE_PlayerCharacter :2231 ([0] 208040 -> 0x18ab9c0); the RTTI rows RTTI_BGSProcedureLock,
  RTTI_BGSProcedureUnlock, RTTI_BGSProcedureLockUnlockExecState (Offsets_RTTI.h:1509-1513).
- The ids resolved for this doc (`just addr`, 1.6.1170): 12401 -> 0x17b740 (REFR_LOCK::SetLocked), 19512 -> 0x2d92e0 (the
  lock-changed bookkeeping, TE's "LockChange", docs/TE-MAP.md:35), 19513 -> 0x2d94a0, 19682 -> 0x2e14b0, 19796 -> 0x2eac20
  (ActivateRef), 14287 -> 0x1d47f0 (SetOpenState), 14288 -> 0x1d4a50 (GetOpenState), 14297 -> 0x1d50a0 (PlayAnimation, the
  fork's hooked sequence entry), 14298 -> 0x1d5230 (ScriptEventSourceHolder::GetSingleton), 20210 -> 0x2fa6f0 (IsAnOwner), 20216
  -> 0x2faa90, 20221 -> 0x2fab60, 20223 -> 0x2fad60 (GetLock), 12981 -> 0x18c610, 11976 -> 0x16a9f0, 17944 -> 0x27f8c0
  (LinkRandomTeleportDoors), 56198 -> 0xa2d8d0 (Papyrus ObjectReference.Lock), 56229 -> 0xa304a0 (SetLockLevel), 56233 ->
  0xa30920 (SetOpen). The addresses the re-analyst paired with these ids in docs/research/adr062/papyrus-native-entries.md:57-68
  all agree with `just addr`.

The records (Skyrim.esm 1.6.1170, read by lab/esm.py on sky-srv over the host jump, 2026-11-03 08:3x to 08:5xZ; the three DLCs
and Update.esm not checked for overrides except where said):

- Alvor and Sigrid's house. The exterior door 0x13420 (base FarmhouseLDoor01 0x29cb0, FNAM 0: not kAutomatic) carries XTEL to
  0x133fb in 0x133c8 (landing (-512.8, -205.8, 240)), XNDP, DATA, and NO XLOC and NO XOWN. The interior door 0x133fb carries XTEL
  back to 0x13420, XLOC (level byte 0, key 0x36a3d RiverwoodAlvorHouseKey, the flag bytes after the key read 00 1a 29 00:
  unparsed), XOWN 0x35d3f RiverwoodAlvorsHouseFaction (a FACT), XLRT 0x70e64 HouseMainDoorRefType (an LCRT). The cell 0x133c8
  RiverwoodAlvorsHouse: DATA 0x0081, XOWN 0x35d3f, XLCN 0x1cb88. Hod and Gerdur's house: the interior door 0x13407 in 0x133c7
  RiverwoodGerdursHouse carries XTEL to 0x13423 in 0x3c, XLOC (level 0, key 0x36a40 RiverwoodGerdursHouseKey), XOWN 0x35d41
  RiverwoodGerdursHouseFaction, XLRT 0x70e64; the cell's XOWN 0x35d41. So the LOCK of each house lives on the INTERIOR door's
  record; the exterior door's record has none (locks.md:283 reads 0x13420 alone and concludes "the server holds no lock on it",
  which is true of the server and not of the engine, E6).
- The residents. Alvor is ACHR 0x13482 AlvorREF of NPC_ 0x13475 (SNAM includes 0x35d3f); his packages (PKID order) 0x1cb09
  AlvorSigridDortheEat20x1 (PSDT hour 20, 60 min; template 0x19714 Eat), 0x8b81f MQ102AlvorWork8x12 (08, 720; template 0x19715;
  quest 0x2bf9c), 0x1cb07 AlvorWork8x12 (08, 720; template 0x604ee SandboxWorking), 0x350fc AlvorTavernPackage21x2 (21, 120;
  template 0x1c254 Sandbox), 0x350fb AlvorSleepPackage (00, 360; template 0x19717 Sleep). Sigrid is ACHR 0x13483 of NPC_ 0x13476
  (SNAM includes 0x35d3f): 0x1e618 DefaultEatEditorLoc6x1 (06, 60; Eat), 0x1cb15 DefaultSleepEditorLoc22x7 (22, 420; Sleep),
  0xd2c59, 0xaaa0e, 0xd2c5b, 0xd2c5d (the garden and forge walks, 08 to 11, template 0x16faa), 0xd2c5c and 0xd2c5e (sweeps 09
  and 11, SandboxWorking), 0xd2c38 SigridHoeGarden8x8 (SandboxWorking). Hod is ACHR 0x1348a of NPC_ 0x1347d (SNAM includes
  0x35d41): 0x1e604 HodSawmillSawLog8x11 and 0x734ce HodSawmillLoadLog8x11 (P7's conditioned pair), 0x734cd HodSawmillSandbox8x11
  (08, 660; SandboxWorking), 0x35696 HodSleepingGiant19x3 (19, 180; template 0x68b86 SandboxMultiLocation), 0x1b210
  DefaultSleepEditorLoc24x8 (00, 480; Sleep), 0x1e618 (06, 60; Eat), 0x1b217 DefaultSandboxEditorLocation512 (Sandbox). None of
  Alvor's five packages carries kUnlocksDoorsAtPackageStart or End (PKDT packFlags 0x00000000 or 0x00000001).
- The templates. Sleep 0x19717 (PKDT packType 0x13 kPackageTemplate): a Sequence of four branches: the procedure Travel (PKC2
  inputs 0x00, 0x0b, 0xff); the procedure LockDoors (PNAM "LockDoors", inputs 0x00 the Location and 0x0d a Bool) under ONE
  condition (CITC 1; CTDA hex 00 11b514 0000803f 6402 0000 0f000000 00000000 00000000 00000000 ffffffff: function 0x0264 = 612
  GetNumericPackageData, parameter 1 = 0x0f, operator ==, value 1.0, run on the subject); a Simultaneous of Find (inputs 0, 1, 2,
  8) and Sandbox (0, 0x11); the rest of the tree beyond 90 printed lines unread. Its data inputs by id (UNAM order): 0x00 Location,
  0x01 TargetSelector, 0x0f Bool (template default 1), 0x0d Bool (default 1), 0x0b Bool (0), 0x02 ObjectList, 0x08 Bool (0), 0x11
  Bool (0), 0x12 to 0x16 and 0x19 Bools (1), 0x1a Float 300, 0x06 Bool (0), 0x18 Float 50. The instances: AlvorSleepPackage 0x350fb
  sets 0x0f = 1 and 0x0d = 1 (Location kNearEditorLocation radius 500); DefaultSleepEditorLoc22x7 0x1cb15 (Sigrid) sets 0x0f = 1 and
  0x0d = 1 (radius 2000); DefaultSleepEditorLoc24x8 0x1b210 (Hod) unread. Eat 0x19714, Sandbox 0x1c254 and SandboxWorking 0x604ee
  each hold ONE procedure named UnlockDoors and no LockDoors; SandboxMultiLocation 0x68b86 holds thirteen UnlockDoors; their
  conditions and inputs unread.
- The setting. fAILockDoorsSeenRecentlySeconds is in neither Skyrim.esm nor Update.esm (`find GMST` empty on both); the exe's
  Setting object at 0x141ffcec8 (vtable, value, name 0x1417f2548) holds the float 0x40a00000 = 5.0 (read_bytes, the compiled
  default; a DLC override unread).

The project's code today (the fork at the handoff worktree 0b61fc80, m3-promote-record on union-srv-3; parity holds the same lock
and door code since m4-locks 395cdc49 and m3-door-pass 2a18f926):

- Server: MpObjectReference::GetLock (skymp5-server/cpp/server_guest_lib/MpObjectReference.cpp:711-738) returns the change form's
  lock, else, when `locksEnabled` (WorldState.h:391, false by default; true in the lab deploy, lab/deploy/sky-srv/
  server-settings.json:366 `"locks": true`) and the REFR's own XLOC is present (libespm REFR.cpp:42-45 `hasLock`, REFR.h:132-140),
  {level, key, locked: true}; SetLock (:740-758) writes the record, sends the "lock" property and logs "[verb:locks] {:x} locked|
  unlocked (level L, key K, N broken)"; SetOpen (:695-708) writes isOpen and sends the "isOpen" property; the DOOR branch of
  ProcessActivateNormal (:1897-1996): a teleport door sets isOpen true and RequestReloot (DoReloot :1435-1441 resets isOpen
  false), then for a game-file actor whose activation came as its host's report asks npcDoorVerdict (PartOne.cpp:1137-1150, the
  move verdict for its simulator) and sends the host an SpSnippet ObjectReference.Activate(actor, default processing) with the line
  "npc-handoff: door {:x}: {:x}'s host {:x} walks it through to {:x}; the record follows its report" (:1961-1965) or "may not cross"
  (:1967-1972); a player's or script's door keeps the Teleport (:1974-1988); a non-teleport door toggles isOpen (:1996). The lock
  gate (:1852-1867) runs before the branches for a player activator only.
- Client: dealWithRef (skymp5-client/src/extensions/objectReferenceEx.ts:67-106) blocks every door's activation (:81-88, the
  CaveGSecretDoor01 exemption) and applies the server's lock prop with `setLockLevel` and `lock(locked, false)` or, with none,
  `if (self.isLocked()) self.lock(false, false)` (:100-106), called at CreateActor (remoteServer.ts:527 with `msg.props?.lock`) and
  for puppets (formView.ts:301, no lock); applyModelLock on the "lock" property (modelApplyUtils.ts:67-77; remoteServer.ts:1125);
  applyModelIsOpen (modelApplyUtils.ts:13-64: `refr.setOpen(isOpen)` every call, the lid animation for CONT bases, the secret-door
  hack) at CreateActor (remoteServer.ts:537), on the property (:1122-1123) and every 133 ms from formView (formView.ts:715-718);
  LockService (lockService.ts:40-48, :96-110) reads `lockChanged` only inside a prompted attempt (no attempt, no report);
  ObjectAnimationService skips doors and containers ("a door's open is isOpen's", objectAnimationService.ts:126-131); the Teleport
  handler's hide rule (npc-handoff.md:668-686). Skyrim Platform sinks TESLockChangedEvent (skyrim-platform EventHandler.cpp:769) and
  TESOpenCloseEvent (:1015). ADR-062 slice 1b's hooks sit at the Papyrus entries of Lock, SetLockLevel and SetOpen among 24
  (papyrus-events.md:200, :253: census only in that slice; the client's own applies marked "(platform)").
- The lab's reads that exist: b-locks (lab/scenarios/b-locks.yaml: a chest's lock on two seats, the console, the key, a restart;
  the server's "[verb:locks]" and the client's "lock <id> set at creation" and "lock <id> applied" lines), b-npc-handoff-door and
  -door-hosts (the door line counted, the record's and the engines' cells), b-npc-handoff-night (the record indoors at 23.0 and
  out after a restart at 7.9). No scenario or probe reads a door's lock or a door's open state on either seat (gate-audit
  2026-11-02:68 "doors (a player's door): MISSING"). lab/references holds no door or lock trace (its README lists blocks, melee,
  spells and shouts).

Sources, in rule 1's order: the headers above; `just addr`; the Ghidra reads named per row (the unpacked program); docs/TE-MAP.md:35
(TESObjectREFR::Activate 19796 and LockChange 19512 as Skyrim Together's hooks, hook points only, ADR-005) and :66 (InternalMoveTo
56626 for the door transit's lead); the records above; the project's code above; the runs cited in the rows (every run id is the
lab's; the playtest's lines are witnesses). The lock paths were found by the strings "LockDoors" (0x141854030) and "UnlockDoors"
(0x1418540a0), the RTTI strings of BGSProcedureLock, BGSProcedureUnlock and BGSProcedureLockUnlockExecState, and the callers of
REFR_LOCK::SetLocked (12401, fifteen call sites) and of the lock-changed bookkeeping (19512, fifteen call sites).

## 2. The claims table

One row per engine claim. Status is CONFIRMED <run or trace id> or HYPOTHESIS; a row whose evidence is a decompile, a record, a
code read, a playtest log or Eli's words is HYPOTHESIS and says why. "Native on the path" says whether a Papyrus native sits between
the input and the state (then ADR-062's entry filter sees it) or none does (then the row is this system's). "Dynamic read" names
the section 4 read that moves the row.

### (a) The host's engine

| # | Claim | Status | Source | Native on the path | Dynamic read |
| --- | --- | --- | --- | --- | --- |
| E1 | The night lock is a package PROCEDURE, not a package flag and not a script: "LockDoors" and "UnlockDoors" are procedure names registered at startup into the procedure factory keyed by BSFixedString (FUN_14046f6b0 registers "LockDoors", FUN_14046f890 "UnlockDoors"; both build a BSTCreateFactoryManager entry and a static creator), implemented by BGSProcedureLock and BGSProcedureUnlock (RTTI strings at 0x142053038 and kin; vtables 202819, 202857) sharing one exec state, BGSProcedureLockUnlockExecState (vtable 202869, nine slots). The PKDT has no lock flag (TESPackage.h:105-120 names only kUnlocksDoorsAtPackageStart and End) and PACKAGE_PROCEDURE_TYPE has no lock entry (:34-83). | HYPOTHESIS (a decompile and the strings; no trace) | Ghidra FUN_14046f6b0, FUN_14046f890 (the registrations), the RTTI strings; T/TESPackage.h:34-83, :105-120 | none | R1 (a 12401 row whose backtrace passes 0x46fab0) |
| E2 | The Sleep template (PACK 0x19717) runs LockDoors as the second branch of its Sequence, gated by one condition, GetNumericPackageData(input 0x0f) == 1, with inputs 0x00 (the Location: near the editor location, radius 500 for Alvor's instance and 2000 for Sigrid's) and 0x0d (a Bool, 1 in both instances). AlvorSleepPackage (00:00, 360 min) and Sigrid's DefaultSleepEditorLoc22x7 (22:00, 420 min) both set input 0x0f = 1. So Sigrid's 22:00 package is the first lock of Alvor's house each night and Alvor's 00:00 package the second; Hod's DefaultSleepEditorLoc24x8 (00:00) uses the same template with its inputs unread. | the records CONFIRMED (Skyrim.esm by lab/esm.py, 2026-11-03 08:4xZ: the tree, the CTDA, the UNAM and CNAM lists); the engine's reading of them HYPOTHESIS (no run saw the hour) | the records above; T/TESCondition.h:745 (612 GetNumericPackageData) | none | R1 at 22:00 and 00:00 |
| E3 | The exec state's step (reached from BGSProcedureLock's slot 12, FUN_14046f5f0, and BGSProcedureUnlock's, FUN_14046f7d0, when the Location input is valid; its body FUN_14046fab0) runs ONCE per procedure start (the done flag at state+0x11): it resolves the Location to its cell (the location's slot 0x40) and acts only when the cell is an interior (TESObjectCELL::Flag kIsInteriorCell, +0x40 bit 0); for a LOCK it stands down when the cell carries kWarnToLeave (bit 9); when the cell is not kPublicArea (bit 5), the state's second input is set (state+0x12, from the Bool 0x0d's byte, bit 1: its meaning unread) and the actor's +0x34 is 0, it scans the actor's perceived-actor list (currentProcess +0x10, FUN_1406f2080) with FUN_140470070: a live actor (IsDead false), not the owner, in the same cell, whose last-seen stamp is younger than fAILockDoorsSeenRecentlySeconds (5.0 by the exe's default) and whom FUN_140679650(owner, actor, 1) accepts; such an actor cancels this step's lock (the done flag cleared, so the step retries) and runs FUN_14066e960(owner, actor, ...) (a warn-to-leave, HYPOTHESIS). Otherwise the walk (E4). | HYPOTHESIS (a decompile) | Ghidra FUN_14046f5f0, FUN_14046f7d0, FUN_14046fab0, FUN_140470070; the Setting at 0x141ffcec8; T/TESObjectCELL.h:125, :130, :133 | none | R6 (the state's bytes and the cell's flags at entry and exit; the intruder case) |
| E4 | The walk is the cell's reference walk FUN_1402bd0f0(cell, pos, FLT_MAX, pos, FLT_MAX, callback, actor) (0x7f7fffff: every reference in the cell) with the lock callback FUN_1406d3a30 or the unlock callback FUN_1406d3980. The lock callback acts on a reference whose base is a DOOR (FormType 0x1D) when the actor is alive (vtable slot 99 IsDead(false) false), IsAnOwner(actor, a_useFaction = the door has teleport data, a_requiresOwner = true) (20210) holds, and GetLock (20223) is non-null: it calls the lock wrapper FUN_1402faf40 (the ExtraLock on this door or on its linked door through FUN_1402faf80, REFR_LOCK::SetLocked(true) 12401, then the bookkeeping 19512) and, for a load door, 12981(teleportData, door, 0). The unlock callback mirrors it with SetLocked(false) (FUN_1402faf00) and 12981(..., 1). The walk never creates a lock: a door with no REFR_LOCK stays as it is, and the level stays the XLOC's. | HYPOTHESIS (a decompile) | Ghidra FUN_1402bd0f0, FUN_1406d3a30, FUN_1406d3980, FUN_1402faf40, FUN_1402faf00, FUN_1402faf80; E/ExtraLock.h:31; T/TESObjectREFR.h:353, :440; F/FormTypes.h:169 | none | R1 (the 12401 rows and their backtraces) |
| E5 | Door ownership for the walk: IsAnOwner (20210) reads the door's own ExtraOwnership first, else, for a load door, the LINKED door's (ExtraDataList::GetTeleportLinkedDoor); a DOOR, a FURN or an ACTI never inherits its CELL's owner (the fallback to the parent cell's owner runs only for other base types); a faction owner (FormType 0x0B) matches an actor in that faction at the ownership's rank; a_requiresOwner true refuses an unowned door. Alvor's interior door 0x133fb carries XOWN RiverwoodAlvorsHouseFaction, Alvor's and Sigrid's NPC_ records list that faction; the exterior door 0x13420 has no XOWN and is owned through the link. | the records CONFIRMED (the XOWN and SNAM reads above); the engine's rule HYPOTHESIS (a decompile) | Ghidra FUN_1402fa6f0 (20210); E/ExtraDataList.h:190; F/FormTypes.h:151, :164, :169, :180 | none | R1 (a lock row on 0x133fb at 22:00 settles the ownership path for this pair) |
| E6 | One lock per door PAIR: the REFR_LOCK lives on one REFR (0x133fb's XLOC); GetLock (20223) on a door with no ExtraLock looks up the linked door through the teleport data and returns ITS lock, so IsLocked and GetLockLevel on 0x13420 read 0x133fb's flags; the bookkeeping 19512 on a lock-less door forwards to the linked door: AddChange(kLockExtra 0x1000) on the lock's holder and a TESLockChangedEvent naming the HOLDER (14298's holder, the source at 06E0, FUN_1402f5710). So the host's lockChanged event for Alvor's door names 0x133fb whichever side was locked. This is where the sources disagree: locks.md:283 reads "no XLOC" on 0x13420 and infers "no lock"; the engine's lock for that door is 0x133fb's. | HYPOTHESIS (a decompile and the records) | Ghidra FUN_1402fad60 (20223), FUN_1402d92e0 (19512), FUN_1402f5710, FUN_1401d5230 (14298); T/TESObjectREFR.h:150; S/ScriptEventSourceHolder.h:85; the XLOC reads above | none | R1 (which reference the lockChanged event names); R2 (the strip on 0x13420 moving 0x133fb's flags) |
| E7 | The bookkeeping 19512 is the convergence point of every lock write in the exe: its fifteen call sites are the two wrappers (FUN_1402faf40, FUN_1402faf00), the console Lock and Unlock handlers (FUN_140352610 "Locked %s with lock level %d", FUN_140352760 "Unlocked %s "), TESObjectDOOR::Activate (FUN_14027da50), FUN_14027c450 (a container's activate, HYPOTHESIS), FUN_1406754a0, FUN_1405bb2d0, FUN_1402d8730, FUN_140155ab0, FUN_140938720 (unread), and the Papyrus natives Lock (56198) and SetLockLevel (56229). Skyrim Together hooks it as "LockChange" (TE-MAP.md:35). A hook there, or on 12401 with a backtrace, sees the AI's lock and a script's alike: ADR-062's "hook at the ENGINE level" is this function. It is a plain function, not a virtual (the only DATA xref is a table entry). | HYPOTHESIS (the xref list and decompiles) | Ghidra list_xrefs on 0x1402d92e0 and 0x14017b740; docs/TE-MAP.md:35 | none at 19512; the Papyrus entries are two of its callers | R1 |
| E8 | The engine locks and unlocks owned doors on four more paths with no procedure and no script: (i) a package with kUnlocksDoorsAtPackageStart (PKDT bit 6, read by FUN_14048fd90 as byte +0x20 bit 6) whose procedure type is not one of the engine's interrupt types (FUN_140494fb0: types 0x14 to 0x26 except 0x1a and 0x1e) runs FUN_14066cc30: the unlock callback over the TES within 5000 units of the actor (FUN_1401b5110: the cell's walk indoors, the worldspace's outdoors), from four package-change callers (FUN_140673d20, FUN_1406d4a10, FUN_1406da270, FUN_140681d80); Actor::EvaluatePackage (37401) references the unlock callback itself (the End flag, HYPOTHESIS); none of Alvor's packages carries either flag. (ii) Actor::SetParentCell (VTABLE_Actor slot 0x98, FUN_140664240): when the actor leaves an interior cell whose owner (FUN_1402b8c30 through FUN_1402b8b80) is the actor's own NPC_ base (FormType 0x2B) or a FormList (0x5B) holding it, and a walk of the cell's references passes (FUN_1402c8a20's predicate unread), the LOCK callback runs over that cell and kWarnToLeave is cleared: a sole owner locks the house behind them. A FACTION owner (0x0B) fails the first test, so Alvor's and Hod's houses (XOWN a FACT on the cell and the interior door) never take this path by this reading; it is the player-home shape, not Riverwood's. (iii) Actor::MoveToMiddleHigh (slot 0xF4, FUN_140683590): under a running kTrespass package (23) whose target actor lacks the +0x204 bit-12 flag, the lock callback within 5000 units. (iv) TESObjectDOOR::Activate (FUN_14027da50, slot 0x37 of VTABLE_TESObjectDOOR[0]): an NPC activator with a lockpick (the default object at DAT_143137648 found in its container by FUN_1406793c0) unlocks the door it activates (FUN_1406711b0, then SetLocked(false) and 19512); an NPC that owns the destination cell (FUN_14027ed10 through FUN_1402b5b70), a follower of the player (FUN_14068d450) and anyone at a kAutomatic door pass a locked door with the lock unchanged; the player with the key unlocks it ("Unlocked with %s.", the UILockpickingUnlock sound, SetLocked(false), 19512, then ActivateRef again); the player without key or pick gets the Lockpicking Menu (FUN_1409372c0). | HYPOTHESIS (decompiles; (i) the flag bit by decompile against T/TESPackage.h:111) | Ghidra FUN_14066cc30, FUN_14048fd90, FUN_140494fb0, FUN_1401b5110, FUN_140664240, FUN_1402b8c30, FUN_1402b8b80, FUN_140683590, FUN_14027da50, FUN_14027ed10, FUN_1402b5b70, FUN_14068d450, FUN_1406793c0; F/FormTypes.h:151, :183, :231; the vtable slots computed from `just addr` 207511 (0x14189d870: 0x14189dd30 is slot 0x98, 0x14189e010 slot 0xF4) and 189666 (0x14179ede8 + 0x37*8 = 0x14179efa0 holds 0x14027da50); T/TESObjectREFR.h:352; A/Actor.h:442; T/TESObjectDOOR.h:28, :62 | none ((iv)'s player branch is the engine's own activation; a snippet's Activate reaches it through 56139 and 19796) | R4 ((ii) at 08:00), R5 ((iv) at 23:00), R1 ((iii) if a trespass ever runs in the lab) |
| E9 | The Papyrus-visible lock paths, for contrast: ObjectReference.Lock (56198: GetLock or a new REFR_LOCK, SetLocked, 19512, the as-owner cell flags, SetAltered; papyrus-native-entries.md:67), SetLockLevel (56229; :68), the console lock and unlock (the handlers in E7; the client intercepts the typed command and the server runs its own, locks.md:89-97), and Actor.UnlockOwnedDoorsInCell (the native FUN_1409eb6d0: the actor's parent cell must be an interior, else "has no parentcell or parentcell is not an interior so can not unlock any doors"; then the cell's walk with the UNLOCK callback and the actor as owner). ADR-062 slice 1b hooks the first two at their entries and sees none of E1 to E8. | HYPOTHESIS (decompiles; the census rows are the fork's own: papyrus-events.md:313-320 counted Lock 1 and SetLockLevel 1 filtered "(not hosted)" and Lock 4 "(platform)" on a guest in 20261103-073235) | Ghidra FUN_1409eb6d0, the string 0x141916e70; docs/research/adr062/papyrus-native-entries.md:67-68; papyrus-events.md:200, :253, :313-320 | yes (these four) | none needed; R1's backtraces tell them from E1 to E8 |
| E10 | The morning unlock is a procedure too: the Eat (0x19714), Sandbox (0x1c254) and SandboxWorking (0x604ee) templates each carry one UnlockDoors procedure (SandboxMultiLocation 0x68b86 thirteen); the candidate for Alvor's house is Sigrid's DefaultEatEditorLoc6x1 at 06:00 (the Eat template at her editor location, inside the house, an interior as E3 requires); Alvor's own 08:00 work (SandboxWorking at the forge, an exterior) and 21:00 tavern (Sandbox at the inn, a cell he does not own) can unlock nothing of his. The gates and inputs of those UnlockDoors branches are unread. | the records CONFIRMED (the PNAM counts); the hours and the engine's use HYPOTHESIS | the template reads above; E3, E4 | none | R4 (a 12401(false) row through 0x6d3980 at 06:00) |
| E11 | A package's door use is an ACTIVATION of the door by the actor: the AI reaches TESObjectDOOR::Activate (slot 0x37) through ActivateRef (19796), the same virtual the player's E reaches. For a load door with an NPC activator the engine moves the actor inside Activate: the destination from the DoorTeleportData (its position FUN_14018c290, rotation FUN_14018c2a0, the linked door's cell FUN_14018c2b0), FUN_1406728a0(actor, cell, ..., &pos), SetPosition and SetAngle on the activator (FUN_1402ea960, FUN_1402ea890), then FUN_1402eb8c0(actor, cell, ...); for the player it sets PlayerCharacter flags (+0xbe4 |= 2) and queues the transition (FUN_140747c40; HandleOpen FUN_14027e740 queues a task through PTR_FUN_14179f168 for the player and plays the door's sound for others, FUN_140773a60). The swing is the open toggle FUN_1401d3ed0: the state from the OPEN flag (FUN_1402e14b0, 19682) and the "Open"/"Close" NiControllerSequences, the sequence played through TESObjectREFR::PlayAnimation (14297, the fork's hooked entry), the activator recorded on the extra list, AddChange, and the base's HandleOpen or HandleClose (slots 01 and 02). The project already channels the activation: the client blocks every door (dealWithRef), the AI's blocked activation becomes a TESActivateEvent report with the actor as caster, the server's DOOR branch sets isOpen and asks the host's game to Activate with default processing, and the engine's own transit runs on the host. | the channel CONFIRMED: x-handoff-door v3 20261024-001915 and v4 013234 ("the snippet walked Alvor into the inn under his evening package, the record followed"), D6 proven 025527 (npc-handoff.md:517-540); live 2026-10-29 00:47:23Z (Hod through the inn's door, npc-handoff.md:737-738); the door line in 20261103-052100 at 05:22:16.593 "door 13407: 1348a's host ff000000 walks it through to 3c" (LOG.md:5652-5653); the engine's path inside Activate HYPOTHESIS (a decompile) | Ghidra FUN_14027da50, FUN_14027e740, FUN_1401d3ed0, FUN_1402e14b0; MpObjectReference.cpp:1897-1996; objectReferenceEx.ts:81-88; the runs | the blocked activation is reported, not a native; the snippet's replay is Papyrus Activate (56139 -> 19796), which ADR-062's Activate entry sees as "(platform)" | R3 (the swing on both seats), R5 (the NPC's branch inside Activate) |
| E12 | The AI's own door bookkeeping, HighProcessData::lastExtDoorActivated (:208), approachingAutoTeleportDoor (:350) and doorActivated (:365), with the condition kSetLastExtDoorActivated 557: what sets them, and whether a blocked activation (the engine's Activate never runs for the AI's own press on a blocked door) leaves them unset so the actor retries the door every few seconds (Hod "retrying the door about every 14 s" in 20261103-052100, non-owning-seat.md P1) is unread. | HYPOTHESIS (header fields; the retry is a run's observation with another cause named) | H/HighProcessData.h:208, :350, :365; T/TESCondition.h:686; non-owning-seat.md P1 | unknown | R5 (the fields logged at each Activate of a load door by an NPC) |
| E13 | What changes on the host with no native: the REFR_LOCK flags on the lock's holder (both doors read them), the change flag kLockExtra, a TESLockChangedEvent naming the holder, the two cells' flags kHandChanged (set by 12981 on unlock, cleared on lock) and kWarnToLeave (cleared), the actor's package state (ActorPackage.currentProcedureIndex and the exec state's done flag), and at a transit the actor's parentCell and position. What the project sees today: the lockChanged event only inside a LockService attempt (lockService.ts:96-110; none without a prompt), the Papyrus entries Lock and SetLockLevel (never on these paths), the TESActivateEvent (the door walk, E11), the PlayAnimation sequence hook (ObjectAnimation skips doors, objectAnimationService.ts:126-131). So the lock change is unobserved, unrecorded and unrelayed: ADR-063's "missing channel". | HYPOTHESIS (code reads; the desync is playtest 41's witness: Eli, 17:22 PST 2026-11-02, "alvor and sigrids house is locked for rotfern and not locked for prisoner. no one has interacted with the door.", locks.md:281, LOG.md:5446; no run id) | lockService.ts:96-110; objectAnimationService.ts:126-131; papyrus-events.md:200; locks.md:281-294 | none | R1 on both seats |

### (b) A non-host's engine

| # | Claim | Status | Source | Native on the path | Dynamic read |
| --- | --- | --- | --- | --- | --- |
| E14 | A non-host's residents are puppets with the AI off (EnableAI(false), kProcessMe), so its engine evaluates no package and runs no procedure: no LockDoors, no UnlockDoors, no SetParentCell lock of its own for a puppet it moves by the stream; its door's lock changes only by the server's "lock" property and by its own strip (E15). | HYPOTHESIS (design: npc-puppet.md:19, :97, :143-167; playtest 41's "not locked for prisoner" is the witness) | npc-puppet.md:19, :97; locks.md:286-287 | the applies are Papyrus Lock and SetLockLevel, marked "(platform)" by slice 1b | R1 on the non-host (no 12401 row from 0x6d3a30 expected) |
| E15 | The strip: at the exterior door's creation the client, given no lock prop (the server seeds only from the REFR's own XLOC and 0x13420 has none), runs `if (self.isLocked()) self.lock(false, false)`; IsLocked follows the linked door's REFR_LOCK (E6) and Papyrus Lock (56198) writes through GetLock to the same REFR_LOCK, so the strip on 0x13420 UNLOCKS 0x133fb's lock in that seat's engine (19512 forwards the event to 0x133fb). When that seat later enters the house the server's lock prop for 0x133fb ({locked, level 0, key 0x36a3d} from its XLOC) relocks the pair. Two seats therefore stand on opposite lock states by their visit history alone, with no AI involved: a second candidate for playtest 41's finding beside E2. | HYPOTHESIS (code read against E6; no run) | objectReferenceEx.ts:100-106; remoteServer.ts:527; MpObjectReference.cpp:711-738; papyrus-native-entries.md:67; E6 | yes (the client's Lock call, "(platform)") | R2 |
| E16 | The symptom's shape: the server's lock gate reads 0x13420's own lock (none) and admits the player's Activate (the Teleport), while the client's ActivationService holds an Activate on a reference that READS locked (the shared lock set on that seat) and waits for the lock to go (locks.md:183-184); no LockPrompt comes because the server sees no lock on 0x13420. The player stands at a door that shows a lock level and opens nothing. | HYPOTHESIS (code read; the stuck door is the playtest's symptom) | locks.md:101-105, :183-184; MpObjectReference.cpp:1852-1867 | the client's isLocked read is a native (IsLocked), read not written | R2 (the prompt's absence and the engine's isLocked on both seats) |
| E17 | The open state on a non-host: the server's isOpen is applied every 133 ms (formView.ts:715-718 -> applyModelIsOpen -> refr.setOpen -> Papyrus SetOpen 56233: GetOpenState and, only when the state disagrees, ActivateRef with a null activator, papyrus-native-entries.md:66), about 40 calls a second per seat; a load door a hosted NPC used is isOpen true on the server until the reloot resets it (DoReloot), so the non-host's engine swings the door open at the first apply and the pair stands open there until the reloot. | the apply rate CONFIRMED 20261103-073235 (c2 as guest: "SetOpen 12037 in ten windows", papyrus-events.md:290-292, :319); the standing-open door HYPOTHESIS (code read, never read on a screen) | formView.ts:715-718; modelApplyUtils.ts:13-14; MpObjectReference.cpp:1900-1904, :1435-1441; papyrus-native-entries.md:66 | yes (SetOpen, "(platform)") | R3 |
| E18 | The non-host sees a resident's passage as the server's word, not as a door use: the Teleport ahead of the unsubscribe or formView's cell rule moves its copy, and the hide rule disables a copy whose record stands in an interior this game has not loaded; its engine never runs Activate for the puppet. | the move CONFIRMED (x-handoff-door 025527 by formView's rule; 032354 and 041126 by the Teleport; npc-handoff.md:552-560); the door's swing on the viewer's screen unread | npc-handoff.md:552-560, :668-686 | none | R3 |
| E19 | A non-host hears no TESLockChangedEvent for the host's AI lock (nothing travels) and plays no lock sound; the lock level its engine shows on the exterior door is its own shared lock's state (E6, E15), which the host's lock never reaches. | HYPOTHESIS (E13 and E15 together; the witness is playtest 41) | E6, E13, E15 | none | R1 on both seats |

### (c) A seat that loads late, and the recorded state applied at load

| # | Claim | Status | Source | Native on the path | Dynamic read |
| --- | --- | --- | --- | --- | --- |
| E20 | At a seat's game load every persistent door's REFR_LOCK comes from its record's XLOC (0x133fb: level 0, key 0x36a3d) with no save to override it (a lab relaunch is a fresh game), so a seat starts with Alvor's house locked in its engine at any hour; the strip at the exterior door's creation (E15) unlocks it; the server's lock prop at the interior's creation relocks it. Whether the engine marks an XLOC lock kLocked at load (libespm reads an XLOC as locked, REFR.h:132-140, as the server does) is a record convention not yet read in the engine. | HYPOTHESIS (code and record reads) | libespm REFR.h:132-140, REFR.cpp:42-45; objectReferenceEx.ts:100-106; E6 | the strip and the apply are Papyrus Lock calls | R2 |
| E21 | The server's record is the lock's one home for what the server knows: MpChangeFormREFR.lock seeded at first touch from the REFR's own XLOC, isOpen in the change form, both applied at CreateActor (the lock through dealWithRef with props.lock, remoteServer.ts:527; isOpen at :537) and kept across a restart. A door's lock has never been in a run; a chest's has. | CONFIRMED for a chest's lock across a relaunch and a restart (b-locks 20261101-212943, the cold rerun that held every claim; locks.md:187-193); a door HYPOTHESIS | locks.md:187-198; remoteServer.ts:527, :537 | yes (the applies) | R2's restart leg |
| E22 | A late HOST (a reconnect, or the house granted to a seat after 22:00) whose engine starts the residents' packages anew runs the Sleep template's tree from its first branch, so LockDoors runs again at the promotion (the exec state is created with the procedure) and the door relocks on that seat with no record and no relay; a seat granted the house at 23:00 locks it although the record never saw a lock. | HYPOTHESIS (E3's once-per-exec-state flag read by decompile; P4's "the package not re-evaluated at the promote" is the open counter-reading, non-owning-seat.md P4) | E3; non-owning-seat.md P4, P8 | none | R1 with a relaunch of the host after 22:00 |
| E23 | A slow landing drops every CreateActor prop including the lock until the pending-loads sweep applies them after cellFullyLoaded or cellAttach (m4-onceload-pending f3f27ce0), so a late loader's door lock can be applied seconds after the door is visible, and until then the engine's own record state stands (E20). | the race CONFIRMED 20261101-212155 (c1's 9.6 s landing, "Failed to load object reference 371e9", no lock line; locks.md:189-193); the fix unread in a run | locks.md:187-198 | yes (the apply) | R2's slow-landing leg if the lab can force one (it cannot today, locks.md:196-197) |

Counts: 23 rows. CONFIRMED in part: E2, E5 and E10 (the records alone), E11 (the channel: 001915, 013234, 025527, the live walk of
2026-10-29, 052100's door line), E17 (the apply rate, 20261103-073235), E18 (the viewer's move: 025527, 032354, 041126), E21 (a
chest's lock, 212943), E23 (the race, 212155); every engine claim about the LOCK (E1, E3, E4, E6, E7, E8, E9, E13, E14, E15, E16,
E19, E20, E22) is HYPOTHESIS, and so are E12 and the engine halves of E2, E5, E10, E11. Player-visible rows: the door's lock as a
seat reads it (E6, E13, E14, E15, E16, E19, E20, E22), the door's swing (E11, E17, E18), the resident's passage (E11, E18): none of
the lock rows is CONFIRMED on any viewpoint; the passage and the move are CONFIRMED on the host's and the viewer's by runs, the
swing on neither. No trace of this system has ever run: every CONFIRMED mark above is a run's log line or a claim, not a Frida row.

## 3. What a fix relies on

A fix of the night lock's sync is a channel (ADR-063 decision 2, ADR-062's Lock row): the host's engine-made lock change reported
from the engine level, recorded R2 and relayed as the lock property every seat applies (locks.md:288-291). Each row names the engine
claims it rests on; a fix standing on a HYPOTHESIS is a fix the lab has not yet earned (ADR-064 decision 2: the trace before the merge).

| Row | What the fix needs | Rests on | Status of what it rests on |
| --- | --- | --- | --- |
| F1 | The hook point: 19512 (the bookkeeping every lock write reaches, with the reference whose lock changed) or 12401 (the flag write, with a backtrace to tell the AI's call from the client's own applies), filtered to references in a cell this seat hosts (rule 9) and to calls that are not the platform's own (slice 1b's "(platform)" mark), then the locks verb's report. | E7 (the convergence), E6 (the event names the lock's HOLDER, so a report for 0x133fb must reach the seats that hold 0x13420), E13 (nothing else sees it) | all HYPOTHESIS |
| F2 | The record's identity: the server keys a lock per REFR and seeds from the REFR's own XLOC; the engine keeps one lock per door pair on the interior door. The server must learn the pair (the XTEL on both sides is in libespm's REFR data: `teleport->destinationDoor`, MpObjectReference.cpp:1903-1906) and treat the exterior door's lock as the interior's, or the relay for 0x133fb reaches a seat that only holds 0x13420 as "no form held, skipped" (remoteServer.ts:1136-1142). | E6, E15 | HYPOTHESIS (R1, R2) |
| F3 | The strip must stop unlocking a lock the server knows under another id: dealWithRef's `else if (self.isLocked()) self.lock(false, false)` on a load door whose linked door holds the server's lock. | E6, E15, E20 | HYPOTHESIS (R2) |
| F4 | The two-seat scenario's premise (b-locks-door, locks.md:291-293, written for "21:00 game time"): the first lock is Sigrid's 22:00 Sleep package (E2), run by the seat that hosts the house or follows her in (ADR-047 D6), with no non-owner seen inside the house within the last 5 s (E3's intruder rule), and the house an interior (E3). A seat standing inside at 22:00 is the intruder case, not the baseline. | E2, E3, E4, E5 | the records CONFIRMED, the engine HYPOTHESIS (R1, R6) |
| F5 | The unlock must travel too (06:00 by the Eat template's UnlockDoors, E10; the owner's own passage and the key, E8 iv), or the record stays locked past dawn and the other seats refuse a door the host's engine opened. | E10, E8 | HYPOTHESIS (R4, R5) |
| F6 | The other lock paths (an owner leaving the house, E8 ii; a trespass, E8 iii; a package flag, E8 i) go through the same 19512, so a channel at F1 covers them; a channel at the procedure alone (a hook on the exec state) would miss them. | E7, E8 | HYPOTHESIS (R1, R4) |

The three the fix most depends on and still HYPOTHESIS: E6 (one lock per pair, which decides what the report names and what the
record keys), E7 (19512 as the one hook point), and E15 (the client's own strip is a lock write the server never hears, on the
same lock the AI will set). E2 to E5 decide the scenario's premise and are the records plus a decompile.

## 4. Open reads

The Frida plan rows and the probe legs that settle them. Every trace runs by `just frida <script> <client>` (lab-api's /frida; the
lab's clock and process pitfalls in memory: align on the ready stamp, read the ready row's pid, LAB_PARAMS not params). No read here
invents an id: the scripts resolve 12401, 19512, 20223, 20210, 56198, 56233, 14287, 14288, 14298 and the vtables 189666, 189674,
202819, 202857, 207511 by `just addr` at write time; functions with no id (0x46fab0, 0x6d3a30, 0x6d3980, 0x664240, 0x683590,
0x27da50, 0x1d3ed0) are reached through the vtable slots named in section 1 or named only as backtrace labels from the module base,
never hooked by a bare offset. The game hour comes from the seat's console log and the server's clock (lab-playtest-clock).

| Read | State | Settles | How |
| --- | --- | --- | --- |
| R1 lab/frida/lock-change.js (to write): on-enter hooks on 12401 REFR_LOCK::SetLocked (this = REFR_LOCK*, the bool; the flags byte at +0x10 before and after) and 19512 (this = TESObjectREFR*, its formID at +0x14), an on-leave hook on 20223 GetLock (this, the result pointer: whether the lock is this door's or the linked door's), each row with Thread.backtrace(accurate, 8 frames) labelled against the module base (0x46fab0 the procedure walk, 0x6d3a30 and 0x6d3980 the callbacks, 0x664240 SetParentCell, 0x683590 MoveToMiddleHigh, 0x27da50 TESObjectDOOR::Activate, 0xa2d8d0 Papyrus Lock, 0x352610 and 0x352760 the console), and the platform's lockChanged event logged by the client (lockService.ts, a trace line outside an attempt to add). | NOT WRITTEN | E1, E2, E3's outcome, E4, E5, E6, E7, E13, E14, E19, E22 (with a host relaunch after 22:00) | two seats in Riverwood from 21:30 to 00:30 game time: c1 hosts the exterior and follows Sigrid into 0x133c8 at 22:00 (D6) while both players stand OUTSIDE (F4); expected on c1: at 22:00 a 12401(true) row on the REFR_LOCK of 0x133fb through 0x6d3a30 and 0x46fab0, a 19512 row naming 0x133fb, the lockChanged event's lockedObject 0x133fb, and at 00:00 the same pair again for Alvor's package; expected on c2: no 12401 row at all after its creation-time strip; then each seat's `isLocked()` on 0x13420 (the console GetLocked on each) differing, c1 true and c2 false |
| R2 x-lock-door-strip (by path, to write): c1 lands at the house door's landing (-513, -206, 240 is the interior's; the exterior door 0x13420 stands at (21365, -44736, -81) in 0x3c), reads 0x13420's GetLocked, enters the house, reads 0x133fb's, leaves, reads 0x13420's again; c2 lands outside and never enters, reads 0x13420's; both with lock-change.js armed and the client lines "lock 133fb set at creation: locked, level 0, key 36a3d" and "lock 13420 ..." counted; a restart leg reads the same after `server: restart`. | NOT WRITTEN | E15, E16, E20, E21 (a door), E6's strip half | expected: on each seat a 12401(false) row through 0xa2d8d0 (Papyrus Lock) on 0x133fb's REFR_LOCK at 0x13420's creation; on c1 a 12401(true) through 0xa2d8d0 at 0x133fb's creation; c1's GetLocked on 0x13420 true after the visit, c2's false; no LockPrompt line for either |
| R3 the swing on two seats: b-npc-handoff-door-hosts leg B's shape (Hod through 13407 or 13423 at 22:00) with an on-enter hook on 14287 SetOpenState (ref, open, snap) and the platform's TESOpenCloseEvent sink logged (EventHandler.cpp:1015; the TS event's exposure to check) on both seats, the server's "isOpen" lines and the door line counted. | NOT WRITTEN | E11's swing half, E17, E18's swing | expected on the host: one SetOpenState(true) from the snippet's Activate, the engine's own transit after it; on the viewer: one setOpen(true) from the first isOpen apply and then silence (SetOpen's early return while the state agrees), the door open on its screen until the reloot's SetOpen(false) |
| R4 the morning: lock-change.js on the host from 05:30 to 08:30 game time. | NOT WRITTEN | E10 (a 12401(false) row through 0x6d3980 and 0x46fab0 at 06:00 for 0x133fb), E8 ii (NO 12401 row through 0x664240 expected when Alvor leaves at 08:00, the house being faction-owned; a row there refutes that reading of FUN_1402b8b80) | the same two-seat premise as R1 with the clock at 05:30 |
| R5 the owner's passage: an on-enter and on-leave hook on TESObjectDOOR::Activate (VTABLE_TESObjectDOOR[0] slot 0x37, id 189666) logging the activator's formID, the door's, the lock's flags before and after, the return value, and HighProcessData's lastExtDoorActivated and doorActivated (+0x0D8, +0x470 of the activator's high process) at each call, armed on the host from 22:30 to 23:30 while Alvor returns from the inn. | NOT WRITTEN | E8 iv (the owner passes, the lock unchanged), E11's NPC branch, E12 | expected: one Activate with Alvor as activator at about 23:00 through the snippet (the client's blocked activation reported first, the door line in the server log), the lock flags equal before and after, the actor's cell 0x133c8 after the return |
| R6 the exec state's conditions: an on-enter and on-leave hook on BGSProcedureLock's slot 12 (VTABLE_BGSProcedureLock id 202819, the slot's pointer read at attach) logging the exec state's bytes +0x10, +0x11, +0x12 and its cell's flags (+0x40) at entry and exit, with c2 standing INSIDE the house at 22:00 (the intruder case) and a second leg with nobody inside. | NOT WRITTEN | E3 (the intruder rule, the once flag, fAILockDoorsSeenRecentlySeconds), F4's premise | expected: with c2 inside, no 12401 row at 22:00 and the done flag cleared each step until c2 leaves or 5 s pass unseen; with nobody inside, one walk and the lock |
| R7 the reference trace (ADR-031's recorder): a solo recording of Riverwood 21:30 to 22:30 and 05:30 to 06:30 with lock-change.js: the owner's reference rows this doc's section 2 should have come from (W1). | NEVER RECORDED (lab/references holds no door or lock file) | the baseline every two-seat read is compared against | a solo scenario at the next lock stage |
| R8 what the lab cannot take | none here: every read above is a Frida hook or a console read on a seat; nothing goes to Eli's T4 by rule 8 for this system | | |

Reads this doc retires rather than runs: none yet; E9's Papyrus paths need no trace (the census already counts them).

## 5. Thaw condition

The system thaws when every player-visible claim in this doc is CONFIRMED on both viewpoints (the plan's W1: "A frozen system thaws
when every player-visible claim in its doc is CONFIRMED on both viewpoints"; ADR-064 decision 7 adds "and a two-player test covers
the change"). Today no lock row is confirmed on any viewpoint by a trace, the swing is confirmed on neither, and the channel the fix
needs stands on E6, E7 and E15 unread. The order that earns the thaw cheapest: R1 and R2 together on one two-seat stage (one evening
from 21:30 with the clock, the strip read at the seats' landings first), then R3 beside the door scenario's leg B (already in the
gate set), then R4 and R5 on the same stage's morning and late evening, R6 only if R1 shows the lock late or absent with a player
inside. The fix itself (F1 to F6) merges only after its two-seat scenario b-locks-door claims both seats' GetLocked on 0x13420 and
0x133fb at 22:00 and at 06:00, the server's "[verb:locks] 133fb locked" line between them, and goes red with the `locks` switch off
(ADR-064 decision 3's mutation run). locks.md's engine table cites E1 to E8, E13 and E15 from the next pass on instead of its
"vanilla's night lock-up, the owners' package" sentence at :286, and its scenario sentence at :291-293 moves its hour to 22:00 (F4).
