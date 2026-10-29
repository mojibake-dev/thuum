# RE: the claimed partner's missing vendor topic, or what GetOffersServicesNow reads (2026-10-28, 18:37 PDT)

The re-analyst's read for playtest 37's finding 40 (docs/LOG.md 18:02 PDT; Eli, 01:02Z: "rotfern talked to bartender.
shop window opens for her. start convo from prisoner no option to shop. doesnt restore even after leaving the cell as
prisoner. restored after rotfern left cell"). pyghidra on SkyrimSE 1.6.1170 (the program
`/SkyrimSE-1.6.1170.0.exe.unpacked.exe`; REA was disconnected this session), every Address Library ID a reverse lookup
of the RVA in addrlib/versionlib-1-6-1170-0.bin through lab/addr.py's loader, every CommonLibSSE-NG name cited to its
header in this tree, the game file read on sky-srv with lab/esm.py (a CTDA decoder appended for the run, scratch only;
no Strings files are under /srv/persist/esm, so no prompt text is quoted from the file). Engine names beyond
CommonLib's and every inferred side effect are HYPOTHESIS until a Frida trace confirms them. Fork code read:
m3-face-twelve 9936706e (PuppetApi.cpp, PuppetHooks.cpp, talkService.ts, puppetService.ts).

## The short answer

The vendor topic does not depend on the actor's package. Every INFO of the generic services topic asks
`GetOffersServicesNow == 1` of the speaker, and that condition reads one cached pointer, `Actor::vendorFaction`
(Actor.h:670), filled lazily by `Actor::CalculateCurrentVendorFaction` (Actor.h:774; Actor.cpp:1264,
RELOCATION_ID(36392, 37383)), which (a) refuses to run again within 20 s of unpaused game of its last run on that
actor, whatever that run found, and (b) when it runs, keeps the first of the actor's factions whose vendor hours hold
and whose vendor location holds; for Orgnar the location test is `actor->parentCell == RiverwoodSleepingGiantInn`.
A promoted actor whose cache is null when the Dialogue Menu's topic list is built shows no "What have you got for
sale?": either the last run failed within the previous 20 s (the throttle holds) or the run at the start fails its
cell test and re-arms the throttle. HYPOTHESIS H-58a; the trace in section 6 tells which. The parent's hypothesis
(the dialogue starts before the promoted actor runs a package) is falsified by the read: no package field is on the
path, and the promoted actor has a running package by the end of its first AI frame anyway (section 3). The lever is
at the claimant's activation: force the recompute with the engine's own sentinel and function, and activate once
`GetVendorFaction()` is non-null for an actor that has a vendor faction at all (section 5).

## 1. The records (Skyrim.esm as served to the lab, read on sky-srv)

- DIAL 0x0007F6BB OfferServicesTopic: quest DialogueGeneric 0x00013EB3, branch ServicesBranch 0x0007F6BD, subtype
  CUST, priority 50, 33 INFOs, FULL lstring 0xA9A4. It is the generic services prompt by its name, quest and branch;
  the English text is not verified from the file (no Strings on sky-srv).
- Every one of the 33 INFOs carries the same three conditions, all AND, all run on Subject: `GetInFaction(
  JobMerchantFaction 0x00051596) == 1`, `GetInFaction(<job faction>) == 1`, `GetOffersServicesNow == 1`. The
  innkeeper rows are INFO 0x000806A2 and 0x000A963A (JobInnkeeperFaction 0x0005091B). The other job factions:
  JobApothecary 0x5091C, JobBlacksmith 0x5091D, JobFence 0x806AA, JobFletcher 0x51592, JobJeweler 0x806A9, JobTailor
  0x806A8, JobMisc 0x51599, JobStreetVendor 0x7F6BE, an OR pair JobSpell 0x50921 / JobCourtWizard 0x5091E with a
  College exclusion (0x1F259 == 0), one Eorlund row (GetIsID 0x13B9D) and one JobInnServer row 0xDEE85 with its own
  prompt. The file's function index equals CommonLib's FUNCTION_DATA::FunctionID (TESCondition.h:28-320: 71
  GetInFaction, 72 GetIsID, 255 GetOffersServicesNow). The 32-byte CTDA layout is UESP's (Skyrim Mod File Format,
  CTDA), cross-checked with CommonLib's in-memory CONDITION_ITEM_DATA (TESCondition.h:897-947: the flags byte with
  the opcode in its top three bits, the comparison value, the function, two params, the run-on object).
- RentRoomTopic 0x0009CC92 (RentRoomBranch 0x9CC96, 4 INFOs): `GetInFaction(JobRentRoomFaction 0x0009CC97) == 1`,
  `GetActorValue(Variable09 = 76) == 0 or 1` (ActorValues.h:84) and `GetItemCount(Gold001) >= RoomCost` (GLOB
  0x9CC98 = 10) on the Target; no GetOffersServicesNow. Orgnar holds JobRentRoomFaction at rank -1 (SNAM 255), which
  the faction merge below drops until RentRoomScript adds him. Not today's finding.
- Orgnar (NPC_ 0x00013479, ACHR 0x00013486, class VendorFood, package OrgnarWorkInn0x24 0x000B0D13): factions
  CrimeFactionWhiterun, JobInnkeeperFaction, JobMerchantFaction, JobRentRoomFaction (-1),
  RiverwoodSleepingGiantInnFaction, ServicesRiverwoodSleepingGiantInn 0x000914F1, TownRiverwoodFaction. Only the
  Services faction is a vendor (DATA 0x4000, TESFaction.h:36 kVendor): VENV hours 0 to 23, radius 256; PLVD type 1
  (PackageLocation.h:19 kInCell) cell 0x000133C6 RiverwoodSleepingGiantInn; VEND VendorItemsInnkeeperOrgnar
  0x0010BED9; VENC the chest REFR 0x00078C0F. His package's PKDT flags are 0x40 (TESPackage.h:105-124
  kUnlocksDoorsAtPackageStart), kOffersServices (TESPackage.h:108) clear, type 18 kPackage.

## 2. What GetOffersServicesNow reads

- The table. CommonLib's FirstScriptCommand (Offsets.h:481, id 361120, RVA 0x1FDBA10) is an array of SCRIPT_FUNCTION
  (CommandTable.h:313-331, 0x50 each). Entry 255 at 0x1FE09C0 reads functionName "GetOffersServicesNow" (the string
  at 0x17D44F8, its one xref), output 0x10FF (4096 + 255), referenceFunction 1, no params, executeFunction 22361,
  compileFunction 21956, conditionFunction 21565.
- 21565 (0x3310A0; renamed Condition_GetOffersServicesNow_21565): result 0.0; if the subject's formType is Actor
  (0x3E) the result is 37572(subject); the debug strings "%s is offering services" and "%s is not offering services"
  ride on it. Nothing else is read: no package, no process, no dialogue state.
- 37572 (0x67EE70; HYPOTHESIS name Actor_CanOfferServices): the body is CommonLib's C++ `Actor::CanOfferServices`
  (Actor.h:508; Actor.cpp:136-140): `vendorFaction` (Actor+0x168 in 1.6.1170, Actor.h:670 `/* 160 */` in SE
  numbering), computed by 37383 when null and reread; return `vendorFaction->vendorData.vendorSellBuyList != nullptr`
  (TESFaction.h:99, vendorData 0xA8 + 0x20; TESFaction::OffersServices, TESFaction.cpp:194-197). 37573 (0x67EEE0) is
  a byte-identical twin.
- 37383 (0x66C250; renamed Actor_CalculateCurrentVendorFaction_37383), CONFIRMED-STATIC by CommonLib's
  RELOCATION_ID(36392, 37383):
  1. The throttle. `calculateVendorFactionTimer` (Actor.h:671, an AITimeStamp, Actor+0x170): if it is not -FLT_MAX
     and `clock - stamp < 20.0`, return with nothing changed. The clock is the global at 404125 (0x319B05C),
     advanced by the frame delta (DAT_1431CC288, the delta the AI timers subtract) in Main's per-frame update 36564
     (0x645EA0; Skyrim Platform's own Hooks::FrameUpdate target, game/Offsets.h:15-17) only while the game is not
     paused; the 20.0 is a bare constant at 381203 (0x2013420). One recompute per actor per 20 s of unpaused game,
     and a run that found nothing holds the null for 20 s. The Dialogue Menu does not pause the game. The stamp's
     initial value and the sentinel's writer were not established (HYPOTHESIS: a faction change writes -FLT_MAX).
  2. `stamp = clock; vendorFaction = nullptr`.
  3. The faction list: the base's FACTION_RANK array (TESActorBaseData.h:130) merged with the reference's
     ExtraFactionChanges (TESObjectREFR.h:498 extraList) by 14356 (0x1D6AD0): base ranks of -1 skipped, a change
     with rank -1 removes, any other rank adds.
  4. For each faction until one is kept: `startHour < hour && hour < endHour` (TESFaction.h:77-89; the hour is the
     global at 404077 (0x319AEC4), the Calendar's hour of day as UpdateAI 37347 also uses it), `vendorConditions`
     null or true (TESFaction.h:98), `vendorLocation` non-null (TESFaction.h:97) and 29825 (0x49DA90; HYPOTHESIS
     name PackageLocation_ContainsRef) true: kInCell is `ref->parentCell == location.object` (TESObjectREFR.h:496,
     PackageLocation.h:31-48), kNearReference the distance to the reference within the radius, kNearSelf true. The
     kept faction is the cache; vendorSellBuyList is read only afterwards, by 37572.
- Reads that are false for a just-promoted actor, by cause: (i) the throttle after a run within 20 s that kept
  nothing, whoever asked (the condition inside a Hello lookup 19519 or the topic list build 35285/35287, or the
  vendor's sell test 37382 from the barter code); (ii) a run whose kInCell test fails because `parentCell` is not
  the vendor cell object at that instant (the claim's grant writes the position and angle through Papyrus,
  puppetService.ts:116-117, before the promote); (iii) the hour outside (0, 23): not this finding, since 37.yaml
  starts the clock at 7.9, the 00:39Z restore reset it and the shop test at 01:02Z sat near 15.6 on both seats,
  which share the server's clock. Reads that stay true regardless: talkingToPC, the running package, the process
  level, the sit state. None is on the path.

## 3. The package after EnableAI(true) + EvaluatePackage(false, false) (for the record; not the cause)

- 37401 Actor::EvaluatePackage (Actor.cpp:249-253): a_immediate false sets boolBits kEvpBuffered (Actor.h:175, bit
  16; kResetAI bit 17 when asked) and pulls AIProcess+0x48 back to `hour - 1`, then returns; no package work. 37347
  (Actor_UpdateAI, HYPOTHESIS name; per frame for a high-process actor from 41369) consumes the bit as
  `37401(true, kResetAI)` after the voice timer and the movement planner, before the package step 39108/39109.
- The immediate path returns early unless sitSleepState (ActorState.h:65-80) is kNormal 0, kIsSitting 3 or
  kIsSleeping 7 (mask 0x89), skips when the current package is an interrupt type (29581), then runs
  CheckForNewPackage 39114 at once; for a high-process actor its body 39645 (0x6FA450) runs the selection 39213
  (0x6DA270) whenever immediate, returning early only for inCommandState (HighProcessData.h:342) or a sit state
  outside the three. So `AIProcess::GetRunningPackage()` (AIProcess.h:172; AIProcess.cpp:116-126:
  middleHigh->runOncePackage.package, else currentPackage.package) is set by the end of the first UpdateAI frame
  after the promote, inside the 100 ms the client waits (talkService.ts:151-160). CommonLib documents the parameters
  by name only (Actor.h:523); (true, true) also ends combat and the interrupt package first (re-ai-puppet.md:341-348).
- A "has a running package" gate is readable through `GetActorRuntimeData().currentProcess->GetRunningPackage()`,
  cheap and sound for what it says, but GetOffersServicesNow never reads it: it would not restore the topic.

## 4. What the claim's activation waits for today

- talkService.ts:151-160: 100 ms after the grant ("its AI ticks once before the activation"), then
  `sp.activatePickRef()`.
- PuppetApi.cpp:573-628 ActivatePickRef, on the game thread: skip if the Dialogue Menu is open, if the
  MenuTopicManager's speaker is the pick, or if the pick's `high->talkingToPC` is set; then
  PlayerCharacter::ActivatePickRef (40548). No package or vendor read.
- Promote (PuppetApi.cpp:112-166): the block lifted, the dead check, the in-flight line cleared, EnableAI(true),
  EvaluatePackage(false, false). The handoff runs the same Promote; what differs is how long the actor is live before
  the player's E (seconds to minutes against 100 ms) and that no claim-path writes precede it.

## 5. The recommended fix, and the alternatives

Recommended (claimant-local, R3; CommonLib names only, no new id): in ActivatePickRef's task, for the pick actor,
before `player->ActivatePickRef()`:
1. `auto& rt = actor->GetActorRuntimeData(); rt.calculateVendorFactionTimer.timeStamp = -FLT_MAX;
   rt.vendorFaction = nullptr;` (the engine's own sentinel, Actor.h:670-671), then
   `actor->CalculateCurrentVendorFaction()` (Actor.h:774).
2. Is the actor a vendor at all: any current faction with `TESFaction::IsVendor()` (TESFaction.h:178) through
   `Actor::VisitFactions` (Actor.h:639).
3. If it is and `GetVendorFaction()` (Actor.h:564) is still null, log `GetParentCell()->formID`,
   `Calendar::GetSingleton()->GetHour()` (Calendar.h:64,72) and the clock minus the stamp, and re-queue the task for
   the next frame, at most 30 frames; then activate anyway and log it. Otherwise activate at once.
The gate reads exactly what the condition reads, so a non-null result there is the topic's presence, and the log
names the failing input when it stays null. HYPOTHESIS H-58b until x-npc-vendor-claim reads the row on c2.
Alternatives:
- A. The sentinel alone, at Promote(): the first lazy recompute after the promote ignores any earlier stamp; no
  retry. Enough for cause (i) when the failing run precedes the promote; not for (ii), where the start's own run
  fails and re-arms the throttle.
- B. Lengthen the 100 ms: no. 20 s would be the number, and a Hello's run would still come first.
- C. A running-package gate: sound for the package, blind to the vendor faction; not this finding.
- D. Write `vendorFaction` by hand from the base's vendor faction: skips the hours and cell tests the host's seat
  applies, a divergence between seats; no.

## 6. The Frida plan (one claimed dialogue with Orgnar on c2 while c1 hosts the inn)

Hooks by Address Library ID (lab/frida, LAB_PARAMS; addresses from Module.findBaseAddress plus the RVA):
- 37383 CalculateCurrentVendorFaction: onEnter rcx (the actor; form id at +0x14), the stamp at +0x170, the clock at
  base+0x319B05C, the hour at base+0x319AEC4, `Thread.backtrace` (who asked: 21565 under 19519 or 35285/35287, or
  37382); onLeave the pointer at +0x168 and its form id. The early return shows as a call that leaves the stamp.
- 29825 the location test: onEnter rcx (the location: type byte at +0x8, object at +0x10), rdx (the ref; parentCell
  at +0x60), r8d (the radius); onLeave al.
- 21565 the condition: onEnter rcx (the subject) and the result pointer (r9), read on leave (0.0 or 1.0).
- 24715 TESNPC::Activate, 35282 the MenuTopicManager's start and 19519 the Hello lookup, for the order.
- Steps: c2 in the inn with Orgnar a puppet, c1 hosting; c2's E on Orgnar (the claim); read the 37383 calls between
  the "claim granted" line and the menu's open; release, walk out, back in, re-claim; then c1 leaves the inn (the
  handoff) and c2's E again. Expected under H-58a: before every claimed menu either no 37383 run writes a faction
  (an early return with `clock - stamp < 20`) or the run's 29825 call reads a parentCell that is not 0x133C6; on the
  handoff's E a run keeps 0x914F1.

## 7. What would falsify it

- A 37383 run before the claimed menu opens that keeps 0x914F1 while the topic is still absent: the condition is not
  the gate; look at the topic list build (35285/35287) and the INFO's two GetInFaction rows on the claimant's copy.
- 21565 returning 1.0 for Orgnar at the claim's start: the topic is filtered elsewhere (branch, quest, dialogue type).
- The hour read outside (0, 23) at the claim: cause (iii), a clock fault between the seats, the time verb's fix.
- The symptom on the host's own seat with no claim: not the claim path at all.

## 8. IDs (Address Library, 1.6.1170; reverse lookups of the RVAs through lab/addr.py's loader)

| ID | RVA | name | status |
|---|---|---|---|
| 361120 | 0x1FDBA10 | SCRIPT_FUNCTION::FirstScriptCommand (Offsets.h:481) | CommonLib |
| 21565 | 0x3310A0 | entry 255's conditionFunction, GetOffersServicesNow | proven by the table; renamed |
| 22361 / 21956 | 0x356810 / 0x341460 | entry 255's executeFunction / compileFunction | HYPOTHESIS |
| 37572 | 0x67EE70 | Actor_CanOfferServices (Actor.cpp:136 reimplements it) | HYPOTHESIS name |
| 37573 | 0x67EEE0 | its twin | HYPOTHESIS |
| 37383 | 0x66C250 | Actor::CalculateCurrentVendorFaction (Actor.cpp:1267) | CommonLib; renamed |
| 37382 | 0x66C0E0 | the vendor's sell test (CanSellItem) | HYPOTHESIS name |
| 14356 | 0x1D6AD0 | the faction merge (base ranks >= 0 plus ExtraFactionChanges) | HYPOTHESIS name |
| 29825 | 0x49DA90 | PackageLocation_ContainsRef (kInCell is parentCell equality) | HYPOTHESIS name |
| 404125 | 0x319B05C | the AI clock, seconds of unpaused game | HYPOTHESIS |
| 404077 | 0x319AEC4 | the hour of day | HYPOTHESIS |
| 381203 | 0x2013420 | the 20.0 s window | HYPOTHESIS |
| 36564 | 0x645EA0 | Main's per-frame update, the clock's one writer (SP Hooks::FrameUpdate) | CommonLib-pinned by SP |
| 37401 / 37347 / 39114 | 0x66CCF0 / 0x6672B0 / 0x6D5690 | EvaluatePackage (CommonLib) / UpdateAI / CheckForNewPackage | CommonLib; HYPOTHESIS; HYPOTHESIS |
| 39645 / 39213 | 0x6FA450 / 0x6DA270 | CheckForNewPackage's high-process body / the package selection | HYPOTHESIS |
| 37504 / 24715 / 40548 | 0x6764E0 / 0x3B9500 / 0x73E980 | EnableAI (CommonLib) / TESNPC::Activate / ActivatePickRef | as re-claimed-dialogue-state.md |
| 35282 / 35285 / 35287 / 19519 / 41369 | 0x5E0840 / 0x5E1210 / 0x5E1830 / 0x2D9C60 / 0x7706B0 | the MenuTopicManager's start / its list builders / the Hello lookup / the high actor AI job | as re-claimed-dialogue-state.md and re-ai-puppet.md |

Ghidra (saved): 37383 and 21565 renamed as above (both proven); plate comments on 37383, 21565, 37572, 37382, 29825
and 14356 with their sources and HYPOTHESIS names.
