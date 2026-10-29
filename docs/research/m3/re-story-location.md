# RE: the Story Manager's Change Location event on 1.6.1170 (the re-analyst, 14:16 PDT 2026-10-29; for docs/verbs/quest-stage.md, H-56a's fix)

Static read: CommonLibSSE-NG headers (BGSStoryEventManager.h:24-42 AddEvent to AddEvent_Impl, RELOCATION_ID 31576/32359; TESQuest.h:176-184
BGSStoryEvent; BGSStoryManagerEventNode.h:22-33 BGSRegisteredStoryEvent; the typed-event idiom BGSAddToPlayerInventoryEvent.h:21-37, index
static 380074; TESActorLocationChangeEvent.h:10-18; ScriptEventSourceHolder.h:68, :164-168; PlayerCharacter.h:574, :703 with the 1.6.629
shift at :795; TESObjectREFR.h:352, :389, :496; Actor.h:344), Address Library ids by `just addr` (32359 0x52bc80, 22790 0x367620, 380069
0x2010688 the CLOC index static, 40466 0x7351b0 PlayerCharacter::SetParentCell, 32288 0x528620 the event helper, 32330 0x52aaf0 the
BGSStoryEvent ctor, 5197 0x8db90 the registration initializer, 53828 0x9b8190 the Papyrus OnStoryChangeLocation dispatcher, 19812 0x2ed5e0
GetCurrentLocation, 20039 0x2f45d0 the location-change SendEvent), bodies through Ghidra on the unpacked program.

The mechanism (HYPOTHESIS until the Frida plan): PlayerCharacter::SetParentCell (vtable slot 0x98) returns when the cell is the parent
cell, raises the cell leave/enter events, reads the cell's location (TESObjectCELL::GetLocation, 18905) and, ONLY when the player's
currentLocation (+0xAD0) differs, builds the Change Location event {ObjectRefHandle actor @0, BGSLocation* old @8, BGSLocation* new @0x10}
(0x18 bytes; members registered by 5197 as Actor R1, Old Location L1, New Location L2, event CLOC = SMEN 0x1320e's ENAM), queues it
through AddEvent_Impl(mgr, *380069, &e) (immediate 0: the Story Manager consumes it on its update) and sends TESActorLocationChangeEvent
(Skyrim Platform's locationChanged); then currentLocation = loc. A seat loading INSIDE the location attaches with currentLocation already
equal: no event, no quest (H-56a's cause). FreeformQuestsNode 0x9002a conditions GetEventData on L2's LocTypeHabitation 0x39793; A Lovely
Letter's CTDA on L2 == RiverwoodLocation 0x13163.

The narrowest native: a typed struct {ObjectRefHandle actor; BGSLocation* oldLoc; BGSLocation* newLoc} with a static GetIndex() reading
REL::ID(380069), passed to BGSStoryEventManager::GetSingleton()->AddEvent(e): byte for byte the engine's own call; actor the player's
handle, old nullptr (or the record's last location), new TESObjectREFR::GetCurrentLocation(). Papyrus has no route (Keyword.SendStoryEvent
feeds the Script Event index 380070). Side effects (HYPOTHESIS): every child of SMEN 0x1320e evaluates at the raise (Skyrim.esm: BQBranchNode-
SHARES 0xcba9f, CompanionsNode 0x9002e, IntroScenesNode 0x9002b, FreeformQuestsNode 0x9002a, QuestNode 0x90028, FavorsNode 0xb2440,
WIChangeLocationNode 0xa39c6, CWGarrisonNode 0x3844e, DungeonNode 0x30b13; SMQN WIChangeLocationThiefNode 0x23f1b, WITavernQuestNodeSHARES
0xdee94, CWChangeLocationScenes 0xd5176, WIGreetingNodeSHARES 0xc791b, ClearSkiesChangeLocationNode 0x1e4cd, WICourierNodeSharesEvent
0x39fbd; Dawnguard's vampire attack nodes 0x02010de3/4, 0x0200d911, 0x02004210, 0x020041d3, 0x020162a0; HearthFires 0x0200308c;
Dragonborn 0x0203332d, 0x02020686, 0x0203842c, 0x02035472, 0x0202c49f; the .esp layer unscanned), as a fast travel's arrival does in single
player; a quest already run is not restarted (TESQuest::alreadyRun, the node's perQuestFlags). The narrow call raises neither the cell
events nor locationChanged. Falsifiers: a CLOC AddEvent at login without the native (the cause would be the SM's gating), or a different
index at a real arrival.

Frida plan: hook 32359 (rcx mgr, edx index against *(base+0x2010688), r8 the event: u32 @0, forms @8 and @0x10 with ids at +0x14), 40466
(rcx player, rdx cell: the cell's id, the parent's, *(player+0xAD0), the return of 18905), 32485 BGSStoryTeller::BeginStartUpQuest (rdx the
quest), optional 20039. Expected (a) a placement into Riverwood: one SetParentCell with +0xAD0 != 0x13163, one AddEvent with the CLOC index
and {handle, old, 0x13163}, BeginStartUpQuest 0x74a83 within the next update; (b) a login inside: SetParentCell with +0xAD0 == 0x13163 and
no AddEvent; the native then yields one AddEvent of the same shape, then BeginStartUpQuest 0x74a83.

### rev.py

```
# Reverse lookup: RVA -> Address Library id(s) for 1.6.1170, through lab/addr.py's loader.
import sys
sys.path.insert(0, "lab")
import addr
db = addr.load_for_runtime(addr.Path("addrlib"), "1.6.1170")
by_off = {}
for i, o in zip(db.ids, db.offsets):
    by_off.setdefault(o, []).append(i)
for a in sys.argv[1:]:
    rva = int(a, 16)
    print(f"rva 0x{rva:x}: ids {by_off.get(rva, 'NONE')}")

```

### sm-nodes.txt

```
#### SMBN
SMBN 0x001092de SkyHavenTempleScenesNode
  PNAM[4] 0x00015fce (float 1.26204e-40)
  SNAM[4] 0x000a71ab (float 9.59131e-40)
  CITC[4] 0x00000003 (float 4.2039e-45)
  CTDA[32] floats ['2.20069e-22', '1', '5.03066e-43', '1.42868e-40', '0', '9.80909e-45', '0', '1.76928e-41']
  CTDA[32] floats ['2.20069e-22', '1', '5.03066e-43', '1.42868e-40', '0', '9.80909e-45', '0', '1.80515e-41']
  CTDA[32] floats ['2.20071e-22', '20', '8.12753e-44', '2.6011e-40', '0', '0', '0', 'nan']
  DNAM[4] 0x00000000 (float 0)
  XNAM[4] 0x00000000 (float 0)
SMBN 0x00108426 MQSovngardeBranch
  PNAM[4] 0x00015fce (float 1.26204e-40)
  SNAM[4] 0x00000000 (float 0)
  CITC[4] 0x00000003 (float 4.2039e-45)
  CTDA[32] floats ['4.15378e-27', '10', '8.12753e-44', '4.0714e-40', '0', '0', '0', 'nan']
  CTDA[32] floats ['4.1538e-27', '200', '8.12753e-44', '4.07142e-40', '0', '0', '0', 'nan']
  CTDA[32] floats ['4.15375e-27', '1', '9.3887e-44', '8.59618e-40', '0', '2.8026e-45', '2.8026e-44', 'nan']
  DNAM[4] 0x00000000 (float 0)
  XNAM[4] 0x00000000 (float 0)
SMBN 0x0010538a TutorialCraftingNode
  PNAM[4] 0x00039d86 (float 3.32015e-40)
  SNAM[4] 0x00000000 (float 0)
  CITC[4] 0x00000000 (float 0)
  DNAM[4] 0x00000000 (float 0)
  XNAM[4] 0x00000000 (float 0)
SMBN 0x001027a7 WERoadQuests
  PNAM[4] 0x000896a8 (float 7.88729e-40)
  SNAM[4] 0x000f2199 (float 1.38959e-39)
  CITC[4] 0x00000001 (float 1.4013e-45)
  CTDA[32] floats ['5.78611e-29', '1', '8.07148e-43', '2.95404e-09', '1.48359e-39', '0', '0', 'nan']
  DNAM[4] 0x00000001 (float 1.4013e-45)
  XNAM[4] 0x00000000 (float 0)
SMBN 0x00101732 WESpecificQuestsNode
  PNAM[4] 0x000896a8 (float 7.88729e-40)
  SNAM[4] 0x0009cb5f (float 8.99475e-40)
  CITC[4] 0x00000000 (float 0)
  DNAM[4] 0x00000000 (float 0)
  XNAM[4] 0x00000000 (float 0)
SMBN 0x000fde7e AchievementHardWorkerBranchNode
  PNAM[4] 0x00039d86 (float 3.32015e-40)
  SNAM[4] 0x0004f593 (float 4.55437e-40)
  CITC[4] 0x00000000 (float 0)
  DNAM[4] 0x00000000 (float 0)
  XNAM[4] 0x00000000 (float 0)
SMBN 0x000f8a84 WEBountyCollectorBranchNode
  PNAM[4] 0x000896a8 (float 7.88729e-40)
  SNAM[4] 0x000896a9 (float 7.88731e-40)
  CITC[4] 0x00000001 (float 1.4013e-45)
  CTDA[32] floats ['2.29813e-43', '1.56041e-39', '1.079e-43', '0', '0', '0', '0', 'nan']
  DNAM[4] 0x00000000 (float 0)
  XNAM[4] 0x00000000 (float 0)
SMBN 0x000f838c CWOrderedMissionNodeSons
  PNAM[4] 0x000cd6d1 (float 1.17909e-39)
  SNAM[4] 0x000f838b (float 1.42472e-39)
  CITC[4] 0x00000001 (float 1.4013e-45)
  CTDA[32] floats ['1.1093e-23', '6.65472e-40', '8.81417e-43', '1.48632e-40', '0.0433128', '0', '0', 'nan']
  CIS2[23] 3a3a706c61796572416c6c656769616e63655f76617200
  DNAM[4] 0x00000000 (float 0)
  XNAM[4] 0x00000000 (float 0)
SMBN 0x000f838b CWOrderedMissionNodeImperial
  PNAM[4] 0x000cd6d1 (float 1.17909e-39)
  SNAM[4] 0x00000000 (float 0)
  CITC[4] 0x00000001 (float 1.4013e-45)
  CTDA[32] floats ['1.1093e-23', '6.65471e-40', '8.81417e-43', '1.48632e-40', '0.0433129', '0', '0', 'nan']
  CIS2[23] 3a3a706c61796572416c6c656769616e63655f76617200
  DNAM[4] 0x00000000 (float 0)
  XNAM[4] 0x00000000 (float 0)
SMBN 0x000f6085 CompanionsFarkasSplitNode
  PNAM[4] 0x000bfc76 (float 1.10076e-39)
  SNAM[4] 0x000bfc79 (float 1.10076e-39)
  CITC[4] 0x00000001 (float 1.4013e-45)
  CTDA[32] floats ['3.11373e-27', '1', '8.07148e-43', '2.95404e-09', '2.13206e-40', '0', '0', 'nan']
  DNAM[4] 0x00000000 (float 0)
  XNAM[4] 0x00000000 (float 0)
SMBN 0x000ec1a7 CompanionsVilkasSplitNode
  PNAM[4] 0x000bfc76 (float 1.10076e-39)
  SNAM[4] 0x000f6085 (float 1.41216e-39)
  CITC[4] 0x00000001 (float 1.4013e-45)
  CTDA[32] floats ['3.11373e-27', '1', '8.07148e-43', '2.95404e-09', '2.13205e-40', '0', '0', 'nan']
  DNAM[4] 0x00000000 (float 0)
  XNAM[4] 0x00000000 (float 0)
SMBN 0x000cdb5a SolitudeShopsScenes
  PNAM[4] 0x00035243 (float 3.05016e-40)
  SNAM[4] 0x000b2441 (float 1.0232e-39)
  CITC[4] 0x00000000 (float 0)
  DNAM[4] 0x00000000 (float 0)
  XNAM[4] 0x00000000 (float 0)
SMBN 0x000cd6d1 CWOrderedMissionNode
  PNAM[4] 0x000236a1 (float 2.03268e-40)
  SNAM[4] 0x0005b5a5 (float 5.24339e-40)
  CITC[4] 0x00000001 (float 1.4013e-45)
  CTDA[32] floats ['1.31987e-22', '1', '8.81417e-43', '1.48632e-40', '3.09674e-18', '0', '0', 'nan']
  CIS2[28] floats ['4.06553e+24', '4.54482e+30', '1.59753e+25', '14681.8', '1.84943e+31', '1.64577e+19', '1.05042e-38']
  DNAM[4] 0x00000000 (float 0)
  XNAM[4] 0x00000000 (float 0)
SMBN 0x000bc3ee MainQuestPartyScenes
  PNAM[4] 0x00015fce (float 1.26204e-40)
  SNAM[4] 0x00108426 (float 1.51677e-39)
  CITC[4] 0x00000003 (float 4.2039e-45)
  CTDA[32] floats ['4.15378e-27', '100', '8.12753e-44', '3.09002e-40', '0', '0', '0', 'nan']
  CTDA[32] floats ['4.15381e-27', '180', '8.12753e-44', '3.09002e-40', '0', '0', '0', 'nan']
  CTDA[32] floats ['4.15375e-27', '0', '8.81417e-43', '3.09002e-40', '3.94926e-13', '0', '0', 'nan']
  CIS2[30] 3a3a4e6f5061727479436f6e766572736174696f6e466c61675f76617200
  DNAM[4] 0x00000000 (float 0)
  XNAM[4] 0x00000000 (float 0)
SMBN 0x000b2441 SolitudeBluePalaceScenes
  PNAM[4] 0x00035243 (float 3.05016e-40)
  SNAM[4] 0x00035248 (float 3.05023e-40)
  CITC[4] 0x00000000 (float 0)
  DNAM[4] 0x00000000 (float 0)
  XNAM[4] 0x00000000 (float 0)
SMBN 0x0004f593 WICraftItemBranchNode
  PNAM[4] 0x00039d86 (float 3.32015e-40)
  SNAM[4] 0x0010538a (float 1.49934e-39)
  CITC[4] 0x00000002 (float 2.8026e-45)
  CTDA[32] floats ['2.14797e-27', '0', '5.03066e-43', '1.4446e-40', '0', '2.8026e-45', '2.8026e-44', 'nan']
  CTDA[32] floats ['2.14797e-27', '1', '1.03696e-43', '3.09012e-40', '0', '0', '0', 'nan']
  DNAM[4] 0x00000000 (float 0)
  XNAM[4] 0x00000000 (float 0)
SMBN 0x000d1208 WhiterunHelloEvents
  PNAM[4] 0x0002b367 (float 2.48028e-40)
  SNAM[4] 0x00000000 (float 0)
  CITC[4] 0x00000000 (float 0)
  DNAM[4] 0x00000000 (float 0)
  XNAM[4] 0x00000000 (float 0)
SMBN 0x000d1207 WhiterunHellosNode
  PNAM[4] 0x0002fd4a (float 2.74534e-40)
  SNAM[4] 0x0005b2f4 (float 5.23374e-40)
  CITC[4] 0x00000001 (float 1.4013e-45)
  CTDA[32] floats ['4.71939e-35', '1', '5.03066e-43', '1.41461e-40', '0', '9.80909e-45', '0', '1.76928e-41']
  DNAM[4] 0x00000000 (float 0)
  XNAM[4] 0x00000000 (float 0)
SMBN 0x000cba9f BQBranchNodeSHARES
  PNAM[4] 0x0001320e (float 1.09792e-40)
  SNAM[4] 0x000b2440 (float 1.02319e-39)
  CITC[4] 0x00000001 (float 1.4013e-45)
  CTDA[32] floats ['1.98588e-26', '1', '8.07148e-43', '1.18744e-08', '3.29881e-40', '0', '0', 'nan']
  DNAM[4] 0x00000000 (float 0)
  XNAM[4] 0x00000000 (float 0)
SMBN 0x000bfc76 CompanionsRadiantNode
  PNAM[4] 0x0001379a (float 1.11782e-40)
  SNAM[4] 0x000236a1 (float 2.03268e-40)
  CITC[4] 0x00000006 (float 8.40779e-45)
  CTDA[32] floats ['3.11373e-27', '1', '8.07148e-43', '2.95404e-09', '1.66125e-40', '0', '0', 'nan']
  CTDA[32] floats ['3.11373e-27', '1', '8.07148e-43', '2.95404e-09', '2.13206e-40', '0', '0', 'nan']
  CTDA[32] floats ['3.11373e-27', '1', '8.07148e-43', '2.95404e-09', '2.13203e-40', '0', '0', 'nan']
  CTDA[32] floats ['3.11373e-27', '1', '8.07148e-43', '2.95404e-09', '2.13205e-40', '0', '0', 'nan']
  CTDA[32] floats ['3.11373e-27', '1', '8.07148e-43', '2.95404e-09', '1.10076e-39', '0', '0', 'nan']
  CTDA[32] floats ['3.11373e-27', '1', '8.07148e-43', '2.95404e-09', '1.00432e-39', '0', '0', 'nan']
  DNAM[4] 0x00000001 (float 1.4013e-45)
  XNAM[4] 0x00000000 (float 0)
SMBN 0x0009002e CompanionsNode
  PNAM[4] 0x0001320e (float 1.09792e-40)
  SNAM[4] 0x00090028 (float 8.26576e-40)
  CITC[4] 0x00000000 (float 0)
  DNAM[4] 0x00000000 (float 0)
  XNAM[4] 0x00000000 (float 0)
SMBN 0x0009002d RiverwoodIntroScenesNode
  PNAM[4] 0x0009002b (float 8.2658e-40)
  SNAM[4] 0x0009002c (float 8.26581e-40)
  CITC[4] 0x00000001 (float 1.4013e-45)
  CTDA[32] floats ['2.63724e-26', '1', '8.07148e-43', '1.18744e-08', '1.09552e-40', '0', '0', 'nan']
  DNAM[4] 0x00000000 (float 0)
  XNAM[4] 0x00000000 (float 0)
SMBN 0x0009002c WhiterunIntroScenesNode
  PNAM[4] 0x0009002b (float 8.2658e-40)
  SNAM[4] 0x00055aa7 (float 4.91697e-40)
  CITC[4] 0x00000001 (float 1.4013e-45)
  CTDA[32] floats ['1.03763e-35', '1', '8.07148e-43', '1.18744e-08', '1.41461e-40', '0', '0', 'nan']
  DNAM[4] 0x00000000 (float 0)
  XNAM[4] 0x00000000 (float 0)
SMBN 0x0009002b IntroScenesNode
  PNAM[4] 0x0001320e (float 1.09792e-40)
  SNAM[4] 0x0009002e (float 8.26584e-40)
  CITC[4] 0x00000000 (float 0)
  DNAM[4] 0x00000000 (float 0)
  XNAM[4] 0x00000000 (float 0)
SMBN 0x0009002a FreeformQuestsNode
  PNAM[4] 0x0001320e (float 1.09792e-40)
  SNAM[4] 0x000d5176 (float 1.22308e-39)
  CITC[4] 0x00000001 (float 1.4013e-45)
  CTDA[32] floats ['5.12982e-37', '1', '8.07148e-43', '1.18744e-08', '3.29881e-40', '0', '0', 'nan']
  DNAM[4] 0x00000000 (float 0)
  XNAM[4] 0x00000000 (float 0)
SMBN 0x00090028 QuestNode
  PNAM[4] 0x0001320e (float 1.09792e-40)
  SNAM[4] 0x00000000 (float 0)
  CITC[4] 0x00000000 (float 0)
  DNAM[4] 0x00000000 (float 0)
  XNAM[4] 0x00000000 (float 0)
SMBN 0x000b2440 FavorsNode
  PNAM[4] 0x0001320e (float 1.09792e-40)
  SNAM[4] 0x00030b13 (float 2.79479e-40)
  CITC[4] 0x00000002 (float 2.8026e-45)
  CTDA[32] floats ['5.2818e-37', '1', '8.07148e-43', '1.18744e-08', '3.29881e-40', '0', '0', 'nan']
  CTDA[32] floats ['5.2818e-37', '0', '8.07148e-43', '2.96859e-09', '1.09363e-40', '0', '0', 'nan']
  DNAM[4] 0x00000000 (float 0)
  XNAM[4] 0x00000000 (float 0)
SMBN 0x000a39c6 WIChangeLocationNode
  PNAM[4] 0x0001320e (float 1.09792e-40)
  SNAM[4] 0x00023f1b (float 2.06309e-40)
  CITC[4] 0x00000004 (float 5.60519e-45)
  CTDA[32] floats ['8.81303e-25', '0', '5.03066e-43', '1.4446e-40', '0', '2.8026e-45', '2.8026e-44', 'nan']
  CTDA[32] floats ['8.81319e-25', '9.98711e-40', '1.079e-43', '0', '0', '0', '0', 'nan']
  CTDA[32] floats ['8.81303e-25', '1', '1.03696e-43', '3.09012e-40', '0', '0', '0', 'nan']
  CTDA[32] floats ['8.81316e-25', '7.9874e-44', '1.03696e-43', '3.09014e-40', '0', '0', '0', 'nan']
  DNAM[4] 0x00000001 (float 1.4013e-45)
  XNAM[4] 0x00000000 (float 0)
SMBN 0x000a39c0 WIAssaultNode
  PNAM[4] 0x0002c494 (float 2.5419e-40)
  SNAM[4] 0x0002e3ff (float 2.65461e-40)
  CITC[4] 0x00000004 (float 5.60519e-45)
  CTDA[32] floats ['8.81303e-25', '0', '5.03066e-43', '1.4446e-40', '0', '2.8026e-45', '2.8026e-44', 'nan']
  CTDA[32] floats ['8.81319e-25', '9.98711e-40', '1.079e-43', '0', '0', '0', '0', 'nan']
  CTDA[32] floats ['8.81303e-25', '1', '1.03696e-43', '3.09012e-40', '0', '0', '0', 'nan']
  CTDA[32] floats ['8.81316e-25', '7.9874e-44', '1.03696e-43', '3.09013e-40', '0', '0', '0', 'nan']
  DNAM[4] 0x00000001 (float 1.4013e-45)
  XNAM[4] 0x00000000 (float 0)
SMBN 0x00092487 FalkreathConvoScenes
  PNAM[4] 0x000340cf (float 2.98755e-40)
  SNAM[4] 0x00000000 (float 0)
  CITC[4] 0x00000003 (float 4.2039e-45)
  CTDA[32] floats ['2.05253e-19', '1', '7.91734e-43', '1.41443e-40', '0', '9.80909e-45', '0', '1.76928e-41']
  CTDA[32] floats ['2.05253e-19', '1', '7.91734e-43', '1.41443e-40', '0', '9.80909e-45', '0', '1.80515e-41']
  CTDA[32] floats ['2.05253e-19', '1', '5.03066e-43', '1.41443e-40', '0', '9.80909e-45', '0', '1.76928e-41']
  DNAM[4] 0x00000000 (float 0)
  XNAM[4] 0x00000000 (float 0)
SMBN 0x000896a8 WEQuestNode
  PNAM[4] 0x0001379a (float 1.11782e-40)
  SNAM[4] 0x00000000 (float 0)
  CITC[4] 0x00000003 (float 4.2039e-45)
  CTDA[32] floats ['1.30667e-27', '1', '1.03696e-43', '1.0614e-39', '0', '0', '0', 'nan']
  CTDA[32] floats ['1.30667e-27', '1', '8.07148e-43', '2.95404e-09', '4.26892e-40', '0', '0', 'nan']
  CTDA[32] floats ['1.30667e-27', '1', '8.07148e-43', '2.95404e-09', '1.48359e-39', '0', '0', 'nan']
  DNAM[4] 0x00000000 (float 0)
  XNAM[4] 0x00000000 (float 0)
SMBN 0x00023e90 EastmarchSettlementScenes
  PNAM[4] 0x000340d0 (float 2.98757e-40)
  SNAM[4] 0x0008690d (float 7.72369e-40)
  CITC[4] 0x00000000 (float 0)
  DNAM[4] 0x00000000 (float 0)
  XNAM[4] 0x00000000 (float 0)
SMBN 0x0008690d NarzulburScenes
  PNAM[4] 0x000340d0 (float 2.98757e-40)
  SNAM[4] 0x0008063f (float 7.36925e-40)
  CITC[4] 0x00000001 (float 1.4013e-45)
  CTDA[32] floats ['6.28342e-24', '1', '7.91734e-43', '1.44393e-40', '0', '9.80909e-45', '0', '1.76928e-41']
  DNAM[4] 0x00000000 (float 0)
  XNAM[4] 0x00000000 (float 0)
SMBN 0x0008063f KynesgroveScenes
  PNAM[4] 0x000340d0 (float 2.98757e-40)
  SNAM[4] 0x00077f8b (float 6.88602e-40)
  CITC[4] 0x00000002 (float 2.8026e-45)
  CTDA[32] floats ['7.61717e-31', '1', '7.91734e-43', '1.4145e-40', '0', '9.80909e-45', '0', '1.76928e-41']
  CTDA[32] floats ['7.61717e-31', '1', '5.03066e-43', '1.4145e-40', '0', '9.80909e-45', '0', '1.76928e-41']
  DNAM[4] 0x00000000 (float 0)
  XNAM[4] 0x00000000 (float 0)
SMBN 0x00077f8b DarkwaterCrossingScenes
  PNAM[4] 0x000340d0 (float 2.98757e-40)
  SNAM[4] 0x0004b2e1 (float 4.31512e-40)
  CITC[4] 0x00000002 (float 2.8026e-45)
  CTDA[32] floats ['7.61717e-31', '1', '7.91734e-43', '1.41448e-40', '0', '9.80909e-45', '0', '1.76928e-41']
  CTDA[32] floats ['7.61717e-31', '1', '5.03066e-43', '1.41448e-40', '0', '9.80909e-45', '0', '1.76928e-41']
  DNAM[4] 0x00000000 (float 0)
  XNAM[4] 0x00000000 (float 0)
SMBN 0x00070222 WIActorDialogueBranchNode
  PNAM[4] 0x00015fce (float 1.26204e-40)
  SNAM[4] 0x0006b19e (float 6.1473e-40)
  CITC[4] 0x00000003 (float 4.2039e-45)
  CTDA[32] floats ['6.08404e-22', '0', '5.03066e-43', '1.4446e-40', '0', '2.8026e-45', '2.8026e-44', 'nan']
  CTDA[32] floats ['6.08404e-22', '1', '7.84727e-44', '6.43598e-40', '0', '0', '0', 'nan']
  CTDA[32] floats ['6.08404e-22', '1', '7.84727e-44', '1.27944e-39', '0', '0', '0', 'nan']
  DNAM[4] 0x00000000 (float 0)
  XNAM[4] 0x00000000 (float 0)
SMBN 0x00070216 WICastMagicEventNode
  PNAM[4] 0x00046829 (float 4.04708e-40)
  SNAM[4] 0x000a8aba (float 9.68121e-40)
  CITC[4] 0x00000004 (float 5.60519e-45)
  CTDA[32] floats ['8.81303e-25', '0', '5.03066e-43', '1.4446e-40', '0', '2.8026e-45', '2.8026e-44', 'nan']
  CTDA[32] floats ['8.81319e-25', '9.98711e-40', '1.079e-43', '0', '0', '0', '0', 'nan']
  CTDA[32] floats ['8.81303e-25', '1', '1.03696e-43', '3.09012e-40', '0', '0', '0', 'nan']
  CTDA[32] floats ['8.81316e-25', '7.9874e-44', '1.03696e-43', '6.436e-40', '0', '0', '0', 'nan']
  DNAM[4] 0x00000001 (float 1.4013e-45)
  XNAM[4] 0x00000000 (float 0)
SMBN 0x0006d1e6 WIScriptEventBranchNode
  PNAM[4] 0x0001379a (float 1.11782e-40)
  SNAM[4] 0x000b0274 (float 1.01107e-39)
  CITC[4] 0x00000006 (float 8.40779e-45)
  CTDA[32] floats ['1.41842e-27', '1', '8.07148e-43', '2.95404e-09', '6.26309e-40', '0', '0', 'nan']
  CTDA[32] floats ['1.41842e-27', '1', '8.07148e-43', '2.95404e-09', '6.40325e-40', '0', '0', 'nan']
  CTDA[32] floats ['1.41842e-27', '1', '8.07148e-43', '2.95404e-09', '9.98718e-40', '0', '0', 'nan']
  CTDA[32] floats ['1.41842e-27', '1', '8.07148e-43', '2.95404e-09', '4.33497e-40', '0', '0', 'nan']
  CTDA[32] floats ['1.41842e-27', '1', '8.07148e-43', '2.95404e-09', '4.63803e-40', '0', '0', 'nan']
  CTDA[32] floats ['1.41842e-27', '1', '8.07148e-43', '2.95404e-09', '9.39985e-40', '0', '0', 'nan']
  DNAM[4] 0x00000000 (float 0)
  XNAM[4] 0x00000000 (float 0)
SMBN 0x0006b19d CWActorDialogueNode
  PNAM[4] 0x00015fce (float 1.26204e-40)
  SNAM[4] 0x0004bccc (float 4.3507e-40)
  CITC[4] 0x00000000 (float 0)
  DNAM[4] 0x00000000 (float 0)
  XNAM[4] 0x00000000 (float 0)
SMBN 0x0006b19b CWActorHelloNode
  PNAM[4] 0x0002fd4a (float 2.74534e-40)
  SNAM[4] 0x000f0a16 (float 1.38115e-39)
  CITC[4] 0x00000000 (float 0)
  DNAM[4] 0x00000000 (float 0)
  XNAM[4] 0x00000000 (float 0)
SMBN 0x0006a790 ShorsStoneScenes
  PNAM[4] 0x000340c7 (float 2.98744e-40)
  SNAM[4] 0x00067735 (float 5.93776e-40)
  CITC[4] 0x00000001 (float 1.4013e-45)
  CTDA[32] floats ['8.36413e-26', '1', '5.03066e-43', '1.41447e-40', '0', '9.80909e-45', '0', '1.76928e-41']
  DNAM[4] 0x00000000 (float 0)
  XNAM[4] 0x00000000 (float 0)
SMBN 0x00067735 IvarsteadScenes
  PNAM[4] 0x000340c7 (float 2.98744e-40)
  SNAM[4] 0x00046e0f (float 4.06824e-40)
  CITC[4] 0x00000001 (float 1.4013e-45)
  CTDA[32] floats ['1.67642e-25', '1', '5.03066e-43', '1.41446e-40', '0', '9.80909e-45', '0', '1.76928e-41']
  DNAM[4] 0x00000000 (float 0)
  XNAM[4] 0x00000000 (float 0)
SMBN 0x000622fc KarthwastenConvoScenes
  PNAM[4] 0x000340c5 (float 2.98741e-40)
  SNAM[4] 0x0001fd94 (float 1.82802e-40)
  CITC[4] 0x00000001 (float 1.4013e-45)
  CTDA[32] floats ['1.06931e-36', '1', '5.03066e-43', '1.41458e-40', '0', '9.80909e-45', '0', '1.76928e-41']
  DNAM[4] 0x00000000 (float 0)
  XNAM[4] 0x00000000 (float 0)
SMBN 0x0001fd94 KolskeggrConvoScenes
  PNAM[4] 0x000340c5 (float 2.98741e-40)
  SNAM[4] 0x0004b118 (float 4.30871e-40)
  CITC[4] 0x00000001 (float 1.4013e-45)
  CTDA[32] floats ['2.36532e-36', '1', '5.03066e-43', '1.42855e-40', '0', '9.80909e-45', '0', '1.76928e-41']
  DNAM[4] 0x00000000 (float 0)
  XNAM[4] 0x00000000 (float 0)
SMBN 0x000609ad ThievesGuildRadiantNode
  PNAM[4] 0x0001379a (float 1.11782e-40)
  SNAM[4] 0x000b39a5 (float 1.03087e-39)
  CITC[4] 0x00000000 (float 0)
  DNAM[4] 0x00000000 (float 0)
  XNAM[4] 0x00000000 (float 0)
SMBN 0x0005b5a6 GenericScenes
  PNAM[4] 0x00015fce (float 1.26204e-40)
  SNAM[4] 0x000e6def (float 1.32513e-39)
  CITC[4] 0x00000000 (float 0)
  DNAM[4] 0x00000000 (float 0)
  XNAM[4] 0x00000000 (float 0)
SMBN 0x0005b2f4 CreatureHellosNode
  PNAM[4] 0x0002fd4a (float 2.74534e-40)
  SNAM[4] 0x0002b367 (float 2.48028e-40)
  CITC[4] 0x00000003 (float 4.2039e-45)
  CTDA[32] floats ['2.54211e-33', '2.47154e-40', '1.079e-43', '0', '0', '0', '0', 'nan']
  CTDA[32] floats ['2.54208e-33', '1', '7.84727e-43', '1.11775e-40', '0', '9.80909e-45', '0', '1.76928e-41']
  CTDA[32] floats ['2.54208e-33', '1', '7.84727e-43', '1.11775e-40', '0', '9.80909e-45', '0', '1.80515e-41']
  DNAM[4] 0x00000000 (float 0)
  XNAM[4] 0x00000000 (float 0)
SMBN 0x00051b01 SaarthalConvoScenes
  PNAM[4] 0x000340cd (float 2.98753e-40)
  SNAM[4] 0x00037ed5 (float 3.21005e-40)
  CITC[4] 0x00000002 (float 2.8026e-45)
  CTDA[32] floats ['7.61717e-31', '1', '7.91734e-43', '1.44425e-40', '0', '9.80909e-45', '0', '1.76928e-41']
  CTDA[32] floats ['7.61717e-31', '1', '5.03066e-43', '1.44425e-40', '0', '9.80909e-45', '0', '1.76928e-41']
  DNAM[4] 0x00000000 (float 0)
  XNAM[4] 0x00000000 (float 0)
SMBN 0x0004bccc TGHeadquartersScenes
  PNAM[4] 0x00015fce (float 1.26204e-40)
  SNAM[4] 0x0005b5a6 (float 5.24341e-40)
  CITC[4] 0x00000001 (float 1.4013e-45)
  CTDA[32] floats ['1.70108e-27', '1', '9.3887e-44', '1.30511e-40', '0', '9.80909e-45', '0', '1.76928e-41']
  DNAM[4] 0x00000000 (float 0)
  XNAM[4] 0x00000000 (float 0)
SMBN 0x0004b2e1 WindhelmCityScenes
  PNAM[4] 0x000340d0 (float 2.98757e-40)
  SNAM[4] 0x00000000 (float 0)
  CITC[4] 0x00000002 (float 2.8026e-45)
  CTDA[32] floats ['1.29722e-24', '1', '5.03066e-43', '1.41462e-40', '0', '9.80909e-45', '0', '1.76928e-41']
  CTDA[32] floats ['1.29722e-24', '1', '5.03066e-43', '1.41462e-40', '0', '9.80909e-45', '0', '1.80515e-41']
  DNAM[4] 0x00000000 (float 0)
  XNAM[4] 0x00000000 (float 0)
SMBN 0x0004b11a AngasMillConvoScenes
  PNAM[4] 0x000340ce (float 2.98754e-40)
  SNAM[4] 0x00043d38 (float 3.89303e-40)
  CITC[4] 0x00000002 (float 2.8026e-45)
  CTDA[32] floats ['7.61717e-31', '1', '7.91734e-43', '1.42253e-40', '0', '9.80909e-45', '0', '1.76928e-41']
  CTDA[32] floats ['7.61717e-31', '1', '5.03066e-43', '1.42253e-40', '0', '9.80909e-45', '0', '1.76928e-41']
  DNAM[4] 0x00000000 (float 0)
  XNAM[4] 0x00000000 (float 0)
SMBN 0x0004b118 OldHroldanConvoScenes
  PNAM[4] 0x000340c5 (float 2.98741e-40)
  SNAM[4] 0x00043a26 (float 3.88202e-40)
  CITC[4] 0x00000001 (float 1.4013e-45)
  CTDA[32] floats ['7.75255e-25', '1', '5.03066e-43', '1.4146e-40', '0', '9.80909e-45', '0', '1.76928e-41']
  DNAM[4] 0x00000000 (float 0)
  XNAM[4] 0x00000000 (float 0)
SMBN 0x00046e0f RiftenCityScenes
  PNAM[4] 0x000340c7 (float 2.98744e-40)
  SNAM[4] 0x000340c8 (float 2.98746e-40)
  CITC[4] 0x00000001 (float 1.4013e-45)
  CTDA[32] floats ['7.61717e-31', '1', '5.03066e-43', '1.41464e-40', '0', '9.80909e-45', '0', '1.76928e-41']
  DNAM[4] 0x00000000 (float 0)
  XNAM[4] 0x00000000 (float 0)
SMBN 0x000443a2 MorthalConvoScenes
  PNAM[4] 0x000340c9 (float 2.98747e-40)
  SNAM[4] 0x0002f1b0 (float 2.70372e-40)
  CITC[4] 0x00000001 (float 1.4013e-45)
  CTDA[32] floats ['5.55368e-24', '1', '7.91734e-43', '1.41457e-40', '0', '9.80909e-45', '0', '1.76928e-41']
  DNAM[4] 0x00000000 (float 0)
  XNAM[4] 0x00000000 (float 0)
SMBN 0x00043d38 LoreiusConvoScenes
  PNAM[4] 0x000340ce (float 2.98754e-40)
  SNAM[4] 0x0003d21e (float 3.50882e-40)
  CITC[4] 0x00000002 (float 2.8026e-45)
  CTDA[32] floats ['1.05327e-33', '1', '7.91734e-43', '1.42858e-40', '0', '9.80909e-45', '0', '1.76928e-41']
  CTDA[32] floats ['1.05327e-33', '1', '5.03066e-43', '1.42858e-40', '0', '9.80909e-45', '0', '1.76928e-41']
  DNAM[4] 0x00000000 (float 0)
  XNAM[4] 0x00000000 (float 0)
SMBN 0x00043a26 CidhnaMineConvoScenes
  PNAM[4] 0x000340c5 (float 2.98741e-40)
  SNAM[4] 0x000340c6 (float 2.98743e-40)
  CITC[4] 0x00000001 (float 1.4013e-45)
  CTDA[32] floats ['0', '1', '5.0557e-33', '1.42261e-40', '0', '9.80909e-45', '0', '1.76928e-41']
  DNAM[4] 0x00000000 (float 0)
  XNAM[4] 0x00000000 (float 0)
SMBN 0x0003d21e DawnstarConvoScenes
  PNAM[4] 0x000340ce (float 2.98754e-40)
  SNAM[4] 0x00000000 (float 0)
  CITC[4] 0x00000001 (float 1.4013e-45)
  CTDA[32] floats ['3.40226e-23', '1', '5.03066e-43', '1.41453e-40', '0', '9.80909e-45', '0', '1.76928e-41']
  DNAM[4] 0x00000000 (float 0)
  XNAM[4] 0x00000000 (float 0)
SMBN 0x0003844e CWGarrisonNode
  PNAM[4] 0x0001320e (float 1.09792e-40)
  SNAM[4] 0x0009002a (float 8.26578e-40)
  CITC[4] 0x00000000 (float 0)
  DNAM[4] 0x00000000 (float 0)
  XNAM[4] 0x00000000 (float 0)
SMBN 0x0002b367 HabitationHellosNode
  PNAM[4] 0x0002fd4a (float 2.74534e-40)
  SNAM[4] 0x0006b19b (float 6.14726e-40)
  CITC[4] 0x00000004 (float 5.60519e-45)
  CTDA[32] floats ['2.31991e-24', '2.47154e-40', '1.079e-43', '0', '0', '0', '0', 'nan']
  CTDA[32] floats ['2.31988e-24', '1', '7.84727e-43', '1.11773e-40', '0', '9.80909e-45', '0', '1.76928e-41']
  CTDA[32] floats ['2.31988e-24', '1', '7.84727e-43', '1.11773e-40', '0', '9.80909e-45', '0', '1.80515e-41']
  CTDA[32] floats ['2.31988e-24', '1', '8.07148e-43', '2.96859e-09', '3.29881e-40', '0', '0', 'nan']
  DNAM[4] 0x00000000 (float 0)
  XNAM[4] 0x00000000 (float 0)
SMBN 0x00039c8a RoriksteadConvoScenes
  PNAM[4] 0x000340c4 (float 2.9874e-40)
  SNAM[4] 0x00000000 (float 0)
  CITC[4] 0x00000003 (float 4.2039e-45)
  CTDA[32] floats ['7.61717e-31', '1', '7.91734e-43', '1.4144e-40', '0', '9.80909e-45', '0', '1.76928e-41']
  CTDA[32] floats ['7.61717e-31', '1', '7.91734e-43', '1.4144e-40', '0', '9.80909e-45', '0', '1.80515e-41']
  CTDA[32] floats ['7.61717e-31', '1', '5.03066e-43', '1.4144e-40', '0', '9.80909e-45', '0', '1.76928e-41']
  DNAM[4] 0x00000000 (float 0)
  XNAM[4] 0x00000000 (float 0)
SMBN 0x0003833e WIDeadBodyNode
  PNAM[4] 0x0003833d (float 3.22586e-40)
  SNAM[4] 0x000b48fc (float 1.03637e-39)
  CITC[4] 0x00000005 (float 7.00649e-45)
  CTDA[32] floats ['8.81303e-25', '0', '5.03066e-43', '1.4446e-40', '0', '2.8026e-45', '2.8026e-44', 'nan']
  CTDA[32] floats ['8.81319e-25', '10', '1.079e-43', '0', '0', '0', '0', 'nan']
  CTDA[32] floats ['8.81303e-25', '0', '9.94922e-44', '3.25889e-40', '0', '9.80909e-45', '0', '1.80515e-41']
  CTDA[32] floats ['8.81316e-25', '7.9874e-44', '1.03696e-43', '3.0902e-40', '0', '0', '0', 'nan']
  CTDA[32] floats ['8.81303e-25', '1', '1.03696e-43', '3.09012e-40', '0', '0', '0', 'nan']
  DNAM[4] 0x00000000 (float 0)
  XNAM[4] 0x00000000 (float 0)
SMBN 0x00037ed5 WinterholdConvoScenes
  PNAM[4] 0x000340cd (float 2.98753e-40)
  SNAM[4] 0x00000000 (float 0)
  CITC[4] 0x00000002 (float 2.8026e-45)
  CTDA[32] floats ['7.61717e-31', '1', '7.91734e-43', '1.41454e-40', '0', '9.80909e-45', '0', '1.76928e-41']
  CTDA[32] floats ['7.61717e-31', '1', '5.03066e-43', '1.41454e-40', '0', '9.80909e-45', '0', '1.76928e-41']
  DNAM[4] 0x00000000 (float 0)
  XNAM[4] 0x00000000 (float 0)
SMBN 0x00035b5c WIAddItemNodes
  PNAM[4] 0x0002c439 (float 2.54062e-40)
  SNAM[4] 0x00000000 (float 0)
  CITC[4] 0x00000004 (float 5.60519e-45)
  CTDA[32] floats ['8.81303e-25', '0', '5.03066e-43', '1.4446e-40', '0', '2.8026e-45', '2.8026e-44', 'nan']
  CTDA[32] floats ['8.81319e-25', '9.98711e-40', '1.079e-43', '0', '0', '0', '0', 'nan']
  CTDA[32] floats ['8.81316e-25', '7.9874e-44', '1.03696e-43', '3.09017e-40', '0', '0', '0', 'nan']
  CTDA[32] floats ['8.81303e-25', '1', '1.03696e-43', '3.09012e-40', '0', '0', '0', 'nan']
  DNAM[4] 0x00000000 (float 0)
  XNAM[4] 0x00000000 (float 0)
SMBN 0x00035248 SolitudeCastleScenes
  PNAM[4] 0x00035243 (float 3.05016e-40)
  SNAM[4] 0x00035247 (float 3.05022e-40)
  CITC[4] 0x00000003 (float 4.2039e-45)
  CTDA[32] floats ['7.61717e-31', '1', '7.91734e-43', '1.83864e-40', '0', '9.80909e-45', '0', '1.76928e-41']
  CTDA[32] floats ['7.61717e-31', '1', '7.91734e-43', '1.83864e-40', '0', '9.80909e-45', '0', '1.80515e-41']
  CTDA[32] floats ['7.61717e-31', '1', '5.03066e-43', '1.83864e-40', '0', '9.80909e-45', '0', '1.76928e-41']
  DNAM[4] 0x00000000 (float 0)
  XNAM[4] 0x00000000 (float 0)
SMBN 0x00035247 SolitudeDocksScenes
  PNAM[4] 0x00035243 (float 3.05016e-40)
  SNAM[4] 0x00035246 (float 3.05021e-40)
  CITC[4] 0x00000001 (float 1.4013e-45)
  CTDA[32] floats ['0', '1', '2.11095e-31', '3.07334e-40', '0', '9.80909e-45', '0', '1.76928e-41']
  DNAM[4] 0x00000000 (float 0)
  XNAM[4] 0x00000000 (float 0)
SMBN 0x00035246 SolitudeAvenuesScenes
  PNAM[4] 0x00035243 (float 3.05016e-40)
  SNAM[4] 0x00035245 (float 3.05019e-40)
  CITC[4] 0x00000000 (float 0)
  DNAM[4] 0x00000000 (float 0)
  XNAM[4] 0x00000000 (float 0)
SMBN 0x00035245 SolitudeWellsScenes
  PNAM[4] 0x00035243 (float 3.05016e-40)
  SNAM[4] 0x00000000 (float 0)
  CITC[4] 0x00000000 (float 0)
  DNAM[4] 0x00000000 (float 0)
  XNAM[4] 0x00000000 (float 0)
SMBN 0x00035244 DragonBridgeConvoScenes
  PNAM[4] 0x000340cc (float 2.98751e-40)
  SNAM[4] 0x00035243 (float 3.05016e-40)
  CITC[4] 0x00000002 (float 2.8026e-45)
  CTDA[32] floats ['7.61717e-31', '1', '7.91734e-43', '1.41439e-40', '0', '9.80909e-45', '0', '1.76928e-41']
  CTDA[32] floats ['7.61717e-31', '1', '5.03066e-43', '1.41439e-40', '0', '9.80909e-45', '0', '1.76928e-41']
  DNAM[4] 0x00000000 (float 0)
  XNAM[4] 0x00000000 (float 0)
SMBN 0x00035243 SolitudeConvoScenes
  PNAM[4] 0x000340cc (float 2.98751e-40)
  SNAM[4] 0x00000000 (float 0)
  CITC[4] 0x00000003 (float 4.2039e-45)
  CTDA[32] floats ['7.61717e-31', '1', '7.91734e-43', '1.41467e-40', '0', '9.80909e-45', '0', '1.76928e-41']
  CTDA[32] floats ['7.61717e-31', '1', '7.91734e-43', '1.41467e-40', '0', '9.80909e-45', '0', '1.80515e-41']
  CTDA[32] floats ['7.61717e-31', '1', '5.03066e-43', '1.41467e-40', '0', '9.80909e-45', '0', '1.76928e-41']
  DNAM[4] 0x00000000 (float 0)
  XNAM[4] 0x00000000 (float 0)
SMBN 0x00035242 HaafingarSettlementScenes
  PNAM[4] 0x000340cc (float 2.98751e-40)
  SNAM[4] 0x00035244 (float 3.05018e-40)
  CITC[4] 0x00000000 (float 0)
  DNAM[4] 0x00000000 (float 0)
  XNAM[4] 0x00000000 (float 0)
SMBN 0x00034d02 DBSanctuaryScenes
  PNAM[4] 0x00015fce (float 1.26204e-40)
  SNAM[4] 0x00070222 (float 6.43614e-40)
  CITC[4] 0x00000004 (float 5.60519e-45)
  CTDA[32] floats ['6.41194e-23', '1', '5.03066e-43', '3.0001e-40', '0', '9.80909e-45', '0', '1.76928e-41']
  CTDA[32] floats ['6.41194e-23', '1', '7.91734e-43', '3.0001e-40', '0', '9.80909e-45', '0', '1.76928e-41']
  CTDA[32] floats ['6.41194e-23', '0', '7.84727e-44', '3.49711e-40', '0', '0', '0', 'nan']
  CTDA[32] floats ['6.41194e-23', '0', '7.84727e-44', '1.75904e-40', '0', '0', '0', 'nan']
  DNAM[4] 0x00000000 (float 0)
  XNAM[4] 0x00000000 (float 0)
SMBN 0x000340d0 EastmarchHoldScenes
  PNAM[4] 0x00015fce (float 1.26204e-40)
  SNAM[4] 0x000340cc (float 2.98751e-40)
  CITC[4] 0x00000002 (float 2.8026e-45)
  CTDA[32] floats ['1.29722e-24', '1', '5.03066e-43', '1.28933e-40', '0', '9.80909e-45', '0', '1.76928e-41']
  CTDA[32] floats ['1.29722e-24', '1', '5.03066e-43', '1.28933e-40', '0', '9.80909e-45', '0', '1.80515e-41']
  DNAM[4] 0x00000000 (float 0)
  XNAM[4] 0x00000000 (float 0)
SMBN 0x000340cf FalkreathHoldScenes
  PNAM[4] 0x00015fce (float 1.26204e-40)
  SNAM[4] 0x000340cd (float 2.98753e-40)
  CITC[4] 0x00000002 (float 2.8026e-45)
  CTDA[32] floats ['0', '1', '7.91734e-43', '1.2894e-40', '0', '9.80909e-45', '0', '1.76928e-41']
  CTDA[32] floats ['0', '1', '7.91734e-43', '1.2894e-40', '0', '9.80909e-45', '0', '1.80515e-41']
  DNAM[4] 0x00000000 (float 0)
  XNAM[4] 0x00000000 (float 0)
SMBN 0x000340ce PaleHoldScenes
  PNAM[4] 0x00015fce (float 1.26204e-40)
  SNAM[4] 0x000340c9 (float 2.98747e-40)
  CITC[4] 0x00000001 (float 1.4013e-45)
  CTDA[32] floats ['0', '1', '8.12776e-32', '1.28938e-40', '0', '9.80909e-45', '0', '1.76928e-41']
  DNAM[4] 0x00000000 (float 0)
  XNAM[4] 0x00000000 (float 0)
SMBN 0x000340cd WinterholdHoldScenes
  PNAM[4] 0x00015fce (float 1.26204e-40)
  SNAM[4] 0x000340ce (float 2.98754e-40)
  CITC[4] 0x00000002 (float 2.8026e-45)
  CTDA[32] floats ['0', '1', '7.91734e-43', '1.28935e-40', '0', '9.80909e-45', '0', '1.76928e-41']
  CTDA[32] floats ['0', '1', '7.91734e-43', '1.28935e-40', '0', '9.80909e-45', '0', '1.80515e-41']
  DNAM[4] 0x00000000 (float 0)
  XNAM[4] 0x00000000 (float 0)
SMBN 0x000340cc HaafingarHoldScenes
  PNAM[4] 0x00015fce (float 1.26204e-40)
  SNAM[4] 0x000340c4 (float 2.9874e-40)
  CITC[4] 0x00000002 (float 2.8026e-45)
  CTDA[32] floats ['0', '1', '2.11095e-31', '1.28942e-40', '0', '9.80909e-45', '0', '1.76928e-41']
  CTDA[32] floats ['0', '1', '2.11095e-31', '1.28942e-40', '0', '9.80909e-45', '0', '1.80515e-41']
  DNAM[4] 0x00000000 (float 0)
  XNAM[4] 0x00000000 (float 0)
SMBN 0x000340c9 HjaalmarchHoldScenes
  PNAM[4] 0x00015fce (float 1.26204e-40)
  SNAM[4] 0x000340c5 (float 2.98741e-40)
  CITC[4] 0x00000002 (float 2.8026e-45)
  CTDA[32] floats ['0', '1', '7.91734e-43', '1.28939e-40', '0', '9.80909e-45', '0', '1.76928e-41']
  CTDA[32] floats ['0', '1', '7.91734e-43', '1.28939e-40', '0', '9.80909e-45', '0', '1.80515e-41']
  DNAM[4] 0x00000000 (float 0)
  XNAM[4] 0x00000000 (float 0)
SMBN 0x000340c8 SnowShodFarmScenes
  PNAM[4] 0x000340c7 (float 2.98744e-40)
  SNAM[4] 0x0003027d (float 2.76399e-40)
  CITC[4] 0x00000001 (float 1.4013e-45)
  CTDA[32] floats ['8.36413e-26', '1', '5.03066e-43', '1.42869e-40', '0', '9.80909e-45', '0', '1.76928e-41']
  DNAM[4] 0x00000000 (float 0)
  XNAM[4] 0x00000000 (float 0)
SMBN 0x000340c7 RiftHoldScenes
  PNAM[4] 0x00015fce (float 1.26204e-40)
  SNAM[4] 0x000340d0 (float 2.98757e-40)
  CITC[4] 0x00000001 (float 1.4013e-45)
  CTDA[32] floats ['8.36413e-26', '1', '7.91734e-43', '1.28936e-40', '0', '9.80909e-45', '0', '1.76928e-41']
  DNAM[4] 0x00000000 (float 0)
  XNAM[4] 0x00000000 (float 0)
SMBN 0x000340c6 MarkarthConvoScenes
  PNAM[4] 0x000340c5 (float 2.98741e-40)
  SNAM[4] 0x0003015c (float 2.75994e-40)
  CITC[4] 0x00000001 (float 1.4013e-45)
  CTDA[32] floats ['3.80989e-36', '1', '5.03066e-43', '1.41465e-40', '0', '9.80909e-45', '0', '1.76928e-41']
  DNAM[4] 0x00000000 (float 0)
  XNAM[4] 0x00000000 (float 0)
SMBN 0x000340c5 ReachHoldScenes
  PNAM[4] 0x00015fce (float 1.26204e-40)
  SNAM[4] 0x000340c7 (float 2.98744e-40)
  CITC[4] 0x00000001 (float 1.4013e-45)
  CTDA[32] floats ['0', '1', '5.85516e-32', '1.28932e-40', '0', '9.80909e-45', '0', '1.76928e-41']
  DNAM[4] 0x00000000 (float 0)
  XNAM[4] 0x00000000 (float 0)
SMBN 0x000340c4 WhiterunHoldScenes
  PNAM[4] 0x00015fce (float 1.26204e-40)
  SNAM[4] 0x00034d02 (float 3.03132e-40)
  CITC[4] 0x00000001 (float 1.4013e-45)
  CTDA[32] floats ['4.97094e-37', '1', '5.03066e-43', '1.28945e-40', '0', '9.80909e-45', '0', '1.76928e-41']
  DNAM[4] 0x00000000 (float 0)
  XNAM[4] 0x00000000 (float 0)
SMBN 0x00033659 LeftHandMineConvoScenes
  PNAM[4] 0x000340c5 (float 2.98741e-40)
  SNAM[4] 0x00000000 (float 0)
  CITC[4] 0x00000001 (float 1.4013e-45)
  CTDA[32] floats ['2.36532e-36', '1', '5.03066e-43', '1.42857e-40', '0', '9.80909e-45', '0', '1.76928e-41']
  DNAM[4] 0x00000000 (float 0)
  XNAM[4] 0x00000000 (float 0)
SMBN 0x00033655 DushnikhYalConvoScenes
  PNAM[4] 0x000340c5 (float 2.98741e-40)
  SNAM[4] 0x0003313c (float 2.93168e-40)
  CITC[4] 0x00000001 (float 1.4013e-45)
  CTDA[32] floats ['4.3591e-23', '1', '5.03066e-43', '1.4401e-40', '0', '9.80909e-45', '0', '1.76928e-41']
  DNAM[4] 0x00000000 (float 0)
  XNAM[4] 0x00000000 (float 0)
SMBN 0x0003313c MorKhazgurConvoScenes
  PNAM[4] 0x000340c5 (float 2.98741e-40)
  SNAM[4] 0x00033659 (float 2.95003e-40)
  CITC[4] 0x00000001 (float 1.4013e-45)
  CTDA[32] floats ['0', '1', '7.91734e-43', '1.44384e-40', '0', '9.80909e-45', '0', '1.76928e-41']
  DNAM[4] 0x00000000 (float 0)
  XNAM[4] 0x00000000 (float 0)
SMBN 0x00033136 SoljundsConvoScenes
  PNAM[4] 0x000340c5 (float 2.98741e-40)
  SNAM[4] 0x00033655 (float 2.94997e-40)
  CITC[4] 0x00000001 (float 1.4013e-45)
  CTDA[32] floats ['0', '1', '7.91734e-43', '1.44458e-40', '0', '9.80909e-45', '0', '1.76928e-41']
  DNAM[4] 0x00000000 (float 0)
  XNAM[4] 0x00000000 (float 0)
SMBN 0x00030b13 DungeonNode
  PNAM[4] 0x0001320e (float 1.09792e-40)
  SNAM[4] 0x0001e4cd (float 1.73914e-40)
  CITC[4] 0x00000001 (float 1.4013e-45)
  CTDA[32] floats ['5.75961e-29', '1', '7.8753e-43', '1.09362e-40', '0', '9.80909e-45', '0', '1.76928e-41']
  DNAM[4] 0x00000000 (float 0)
  XNAM[4] 0x00000000 (float 0)
SMBN 0x000303f7 SarethiFarmScenes
  PNAM[4] 0x000340c7 (float 2.98744e-40)
  SNAM[4] 0x00000000 (float 0)
  CITC[4] 0x00000001 (float 1.4013e-45)
  CTDA[32] floats ['8.36413e-26', '1', '5.03066e-43', '1.42867e-40', '0', '9.80909e-45', '0', '1.76928e-41']
  DNAM[4] 0x00000000 (float 0)
  XNAM[4] 0x00000000 (float 0)
SMBN 0x000302c5 HeartwoodMillScenes
  PNAM[4] 0x000340c7 (float 2.98744e-40)
  SNAM[4] 0x000303f7 (float 2.76929e-40)
  CITC[4] 0x00000001 (float 1.4013e-45)
  CTDA[32] floats ['8.36413e-26', '1', '5.03066e-43', '1.42847e-40', '0', '9.80909e-45', '0', '1.76928e-41']
  DNAM[4] 0x00000000 (float 0)
  XNAM[4] 0x00000000 (float 0)
SMBN 0x0003027d MerryfairFarmScenes
  PNAM[4] 0x000340c7 (float 2.98744e-40)
  SNAM[4] 0x000302c5 (float 2.765e-40)
  CITC[4] 0x00000001 (float 1.4013e-45)
  CTDA[32] floats ['8.36413e-26', '1', '5.03066e-43', '1.4286e-40', '0', '9.80909e-45', '0', '1.76928e-41']
  DNAM[4] 0x00000000 (float 0)
  XNAM[4] 0x00000000 (float 0)
SMBN 0x0003015c SalviusFarmConvoScenes
  PNAM[4] 0x000340c5 (float 2.98741e-40)
  SNAM[4] 0x00033136 (float 2.9316e-40)
  CITC[4] 0x00000001 (float 1.4013e-45)
  CTDA[32] floats ['1.18234e-25', '1', '5.03066e-43', '1.42865e-40', '0', '9.80909e-45', '0', '1.76928e-41']
  DNAM[4] 0x00000000 (float 0)
  XNAM[4] 0x00000000 (float 0)
SMBN 0x0002f1b0 StonehillsConvoScenes
  PNAM[4] 0x000340c9 (float 2.98747e-40)
  SNAM[4] 0x00000000 (float 0)
  CITC[4] 0x00000001 (float 1.4013e-45)
  CTDA[32] floats ['0', '1', '7.91734e-43', '1.41455e-40', '0', '9.80909e-45', '0', '1.76928e-41']
  DNAM[4] 0x00000000 (float 0)
  XNAM[4] 0x00000000 (float 0)
SMBN 0x00026e47 RiverwoodConvoScenes
  PNAM[4] 0x000340c4 (float 2.9874e-40)
  SNAM[4] 0x00018958 (float 1.41105e-40)
  CITC[4] 0x00000003 (float 4.2039e-45)
  CTDA[32] floats ['7.61717e-31', '1', '7.91734e-43', '1.09552e-40', '0', '9.80909e-45', '0', '1.76928e-41']
  CTDA[32] floats ['7.61717e-31', '1', '7.91734e-43', '1.09552e-40', '0', '9.80909e-45', '0', '1.80515e-41']
  CTDA[32] floats ['7.61717e-31', '1', '5.03066e-43', '1.09552e-40', '0', '9.80909e-45', '0', '1.76928e-41']
  DNAM[4] 0x00000000 (float 0)
  XNAM[4] 0x00000000 (float 0)
SMBN 0x000236a1 CWBranchNode
  PNAM[4] 0x0001379a (float 1.11782e-40)
  SNAM[4] 0x0006d1e6 (float 6.2631e-40)
  CITC[4] 0x00000000 (float 0)
  DNAM[4] 0x00000000 (float 0)
  XNAM[4] 0x00000000 (float 0)
SMBN 0x0001e491 WIKillEventsBranchNode
  PNAM[4] 0x00013010 (float 1.09077e-40)
  SNAM[4] 0x000eafa8 (float 1.34871e-39)
  CITC[4] 0x00000006 (float 8.40779e-45)
  CTDA[32] floats ['8.81303e-25', '0', '5.03066e-43', '1.4446e-40', '0', '2.8026e-45', '2.8026e-44', 'nan']
  CTDA[32] floats ['8.81303e-25', '1', '7.84727e-43', '1.11773e-40', '0', '9.80909e-45', '0', '1.76928e-41']
  CTDA[32] floats ['8.81303e-25', '0', '9.94922e-44', '1.64294e-40', '0', '9.80909e-45', '0', '1.76928e-41']
  CTDA[32] floats ['8.81303e-25', '0', '9.94922e-44', '1.64295e-40', '0', '9.80909e-45', '0', '1.76928e-41']
  CTDA[32] floats ['8.81316e-25', '7.9874e-44', '1.03696e-43', '3.09016e-40', '0', '0', '0', 'nan']
  CTDA[32] floats ['8.81303e-25', '1', '1.03696e-43', '3.09012e-40', '0', '0', '0', 'nan']
  DNAM[4] 0x00000000 (float 0)
  XNAM[4] 0x00000000 (float 0)
SMBN 0x00018966 WIPlayerRemoveItemNodes
  PNAM[4] 0x0002c6ac (float 2.54941e-40)
  SNAM[4] 0x00000000 (float 0)
  CITC[4] 0x00000004 (float 5.60519e-45)
  CTDA[32] floats ['8.81303e-25', '0', '5.03066e-43', '1.4446e-40', '0', '2.8026e-45', '2.8026e-44', 'nan']
  CTDA[32] floats ['8.81319e-25', '9.98711e-40', '1.079e-43', '0', '0', '0', '0', 'nan']
  CTDA[32] floats ['8.81316e-25', '7.9874e-44', '1.03696e-43', '3.09019e-40', '0', '0', '0', 'nan']
  CTDA[32] floats ['8.81303e-25', '1', '1.03696e-43', '3.09012e-40', '0', '0', '0', 'nan']
  DNAM[4] 0x00000001 (float 1.4013e-45)
  XNAM[4] 0x00000000 (float 0)
SMBN 0x00018958 WhiterunConvoScenes
  PNAM[4] 0x000340c4 (float 2.9874e-40)
  SNAM[4] 0x00039c8a (float 3.31662e-40)
  CITC[4] 0x00000001 (float 1.4013e-45)
  CTDA[32] floats ['4.97094e-37', '1', '5.03066e-43', '1.41461e-40', '0', '9.80909e-45', '0', '1.76928e-41']
  DNAM[4] 0x00000000 (float 0)
  XNAM[4] 0x00000000 (float 0)
SMBN 0x00028a4c MagesGuildRadiantNode
  PNAM[4] 0x0001379a (float 1.11782e-40)
  SNAM[4] 0x000bfc76 (float 1.10076e-39)
  CITC[4] 0x00000000 (float 0)
  DNAM[4] 0x00000000 (float 0)
  XNAM[4] 0x00000000 (float 0)
SMBN 0x0000005b Root
  PNAM[4] 0x00000000 (float 0)
  SNAM[4] 0x00000000 (float 0)
  CITC[4] 0x00000000 (float 0)
  DNAM[4] 0x00000000 (float 0)
  XNAM[4] 0x00000000 (float 0)
#### SMQN
SMQN 0x00017045 SovngardeSparringNode
  PNAM[4] 0x0001379a (float 1.11782e-40)
  SNAM[4] 0x0010c044 (float 1.53834e-39)
  CITC[4] 0x00000001 (float 1.4013e-45)
  CTDA[32] floats ['0', '1', '8.07148e-43', '2.95404e-09', '1.32109e-40', '0', '0', 'nan']
  DNAM[4] 0x00000000 (float 0)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000001 (float 1.4013e-45)
  NNAM[4] 0x000f0a10 (float 1.38114e-39)
SMQN 0x0001703e MS05KingOlafsFestivalNode
  PNAM[4] 0x00090028 (float 8.26576e-40)
  SNAM[4] 0x0003fa1a (float 3.65226e-40)
  CITC[4] 0x00000003 (float 4.2039e-45)
  CTDA[32] floats ['0', '6', '2.38221e-43', '0', '0', '0', '0', 'nan']
  CTDA[32] floats ['0', '1', '8.07148e-43', '1.18744e-08', '1.41467e-40', '0', '0', 'nan']
  CTDA[32] floats ['0', '1', '7.60905e-43', '4.78214e-40', '0', '0', '0', 'nan']
  DNAM[4] 0x00020000 (float 1.83671e-40)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000001 (float 1.4013e-45)
  NNAM[4] 0x0001703c (float 1.32098e-40)
SMQN 0x0010fbf4 CompanionsJorrvaskrTheftNode
  PNAM[4] 0x0002c439 (float 2.54062e-40)
  SNAM[4] 0x00035b5c (float 3.0828e-40)
  CITC[4] 0x00000003 (float 4.2039e-45)
  CTDA[32] floats ['0', '1', '8.81417e-43', '4.315e-40', '5.13038e-10', '0', '0', 'nan']
  CIS2[33] 3a3a506c617965725468696576696e67416e644e6f74506179696e675f766172
  CTDA[32] floats ['1.4013e-45', '1', '9.3887e-44', '1.28321e-40', '0', '2.8026e-45', '2.8026e-44', 'nan']
  CTDA[32] floats ['1.4013e-45', '1', '9.3887e-44', '6.96112e-40', '0', '2.8026e-45', '2.8026e-44', 'nan']
  DNAM[4] 0x00020000 (float 1.83671e-40)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000001 (float 1.4013e-45)
  NNAM[4] 0x0010fbf5 (float 1.55975e-39)
SMQN 0x0010faef DA08KillFriendNode
  PNAM[4] 0x00013010 (float 1.09077e-40)
  SNAM[4] 0x00000000 (float 0)
  CITC[4] 0x00000003 (float 4.2039e-45)
  CTDA[32] floats ['0', '1', '1.00893e-43', '9.80909e-45', '0', '9.80909e-45', '0', '1.80515e-41']
  CTDA[32] floats ['0', '1', '2.55036e-43', '4.26016e-40', '0', '9.80909e-45', '0', '1.80515e-41']
  CTDA[32] floats ['1.35926e-43', '1', '8.07148e-43', '1.24564e-08', '0', '0', '0', 'nan']
  DNAM[4] 0x00000000 (float 0)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000001 (float 1.4013e-45)
  NNAM[4] 0x0010faee (float 1.55938e-39)
SMQN 0x0010f4ad MGScollSwapNode
  PNAM[4] 0x00090028 (float 8.26576e-40)
  SNAM[4] 0x000c6cf2 (float 1.14111e-39)
  CITC[4] 0x00000002 (float 2.8026e-45)
  CTDA[32] floats ['1.14621e-27', '1', '8.81417e-43', '3.10504e-40', '1.24715e-10', '0', '0', 'nan']
  CIS2[20] floats ['3.89646e+21', '1.14333e+27', '2.74896e+20', '1.64577e+19', '1.05042e-38']
  CTDA[32] floats ['1.14621e-27', '0', '8.07148e-43', '1.18744e-08', '1.76307e-40', '0', '0', 'nan']
  DNAM[4] 0x00000000 (float 0)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000001 (float 1.4013e-45)
  NNAM[4] 0x0010f4ac (float 1.55714e-39)
SMQN 0x0010ec64 MQGreybeardCallNode
  PNAM[4] 0x0001379a (float 1.11782e-40)
  SNAM[4] 0x00028a4c (float 2.33283e-40)
  CITC[4] 0x00000001 (float 1.4013e-45)
  CTDA[32] floats ['4.76105e-23', '1', '8.07148e-43', '2.95404e-09', '1.55417e-39', '0', '0', 'nan']
  DNAM[4] 0x00000000 (float 0)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000001 (float 1.4013e-45)
  NNAM[4] 0x0010ec61 (float 1.55416e-39)
SMQN 0x0010ea41 FFR09KickerNode
  PNAM[4] 0x0005bd79 (float 5.27147e-40)
  SNAM[4] 0x000d91d2 (float 1.24617e-39)
  CITC[4] 0x00000001 (float 1.4013e-45)
  CTDA[32] floats ['8.23755e-24', '1.5534e-39', '1.12104e-43', '0', '0', '2.8026e-45', '2.8026e-44', 'nan']
  DNAM[4] 0x00020000 (float 1.83671e-40)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000001 (float 1.4013e-45)
  NNAM[4] 0x0005331c (float 4.77512e-40)
SMQN 0x0010dcd9 
  PNAM[4] 0x0005bd78 (float 5.27146e-40)
  SNAM[4] 0x000fcc30 (float 1.45078e-39)
  CITC[4] 0x00000000 (float 0)
  DNAM[4] 0x00020000 (float 1.83671e-40)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000001 (float 1.4013e-45)
  NNAM[4] 0x0010dcd8 (float 1.54859e-39)
SMQN 0x0010dcd7 
  PNAM[4] 0x0005bd7a (float 5.27149e-40)
  SNAM[4] 0x00000000 (float 0)
  CITC[4] 0x00000000 (float 0)
  DNAM[4] 0x00020000 (float 1.83671e-40)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000001 (float 1.4013e-45)
  NNAM[4] 0x0010d9f4 (float 1.54755e-39)
SMQN 0x0010d9f0 VoiceoftheSkyNode
  PNAM[4] 0x00013010 (float 1.09077e-40)
  SNAM[4] 0x0004d918 (float 4.45221e-40)
  CITC[4] 0x00000005 (float 7.00649e-45)
  CTDA[32] floats ['2.01035e-24', '1', '1.00893e-43', '9.80909e-45', '0', '9.80909e-45', '0', '1.80515e-41']
  CTDA[32] floats ['2.01035e-24', '1', '3.1249e-43', '1.52779e-39', '0', '9.80909e-45', '0', '1.80515e-41']
  CTDA[32] floats ['2.01035e-24', '1', '7.84727e-43', '1.11779e-40', '0', '9.80909e-45', '0', '1.76928e-41']
  CTDA[32] floats ['2.01035e-24', '1', '9.94922e-44', '2.67103e-40', '0', '9.80909e-45', '0', '1.76928e-41']
  CTDA[32] floats ['2.01035e-24', '1', '9.94922e-44', '2.67104e-40', '0', '9.80909e-45', '0', '1.76928e-41']
  DNAM[4] 0x00020000 (float 1.83671e-40)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000001 (float 1.4013e-45)
  NNAM[4] 0x0010d9f1 (float 1.54755e-39)
SMQN 0x0010c5f7 CWRiftQuestFortSiegeNodeREGAINDUPLICATE000
  PNAM[4] 0x000f838c (float 1.42472e-39)
  SNAM[4] 0x0010c5f6 (float 1.54038e-39)
  CITC[4] 0x00000009 (float 1.26117e-44)
  CTDA[32] floats ['1.1093e-23', '1', '7.91734e-43', '1.44363e-40', '0', '9.80909e-45', '0', '1.80515e-41']
  CTDA[32] floats ['1.1093e-23', '6.65472e-40', '8.49187e-43', '1.28945e-40', '2.42624e-40', '0', '0', 'nan']
  CTDA[32] floats ['1.1093e-23', '6.65472e-40', '8.49187e-43', '1.2894e-40', '2.42624e-40', '0', '0', 'nan']
  CTDA[32] floats ['1.1093e-23', '6.65472e-40', '8.49187e-43', '1.28932e-40', '2.42624e-40', '0', '0', 'nan']
  CTDA[32] floats ['1.1093e-23', '6.65472e-40', '8.49187e-43', '1.28939e-40', '2.42624e-40', '0', '0', 'nan']
  CTDA[32] floats ['1.1093e-23', '6.65472e-40', '8.49187e-43', '1.28938e-40', '2.42624e-40', '0', '0', 'nan']
  CTDA[32] floats ['1.1093e-23', '6.65472e-40', '8.49187e-43', '1.28935e-40', '2.42624e-40', '0', '0', 'nan']
  CTDA[32] floats ['1.10931e-23', '6.65472e-40', '8.49187e-43', '1.28936e-40', '2.42624e-40', '0', '0', 'nan']
  CTDA[32] floats ['1.10931e-23', '6.65472e-40', '8.49187e-43', '1.28942e-40', '2.42624e-40', '0', '0', 'nan']
  DNAM[4] 0x00000000 (float 0)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000001 (float 1.4013e-45)
  NNAM[4] 0x00083042 (float 7.51996e-40)
SMQN 0x0010c5f6 CWWinterholdQuestFortSiegeNodeREGAINDUPLICATE000
  PNAM[4] 0x000f838c (float 1.42472e-39)
  SNAM[4] 0x0010c5f5 (float 1.54038e-39)
  CITC[4] 0x00000009 (float 1.26117e-44)
  CTDA[32] floats ['1.1093e-23', '1', '7.91734e-43', '1.44381e-40', '0', '9.80909e-45', '0', '1.80515e-41']
  CTDA[32] floats ['1.1093e-23', '6.65472e-40', '8.49187e-43', '1.28945e-40', '2.42624e-40', '0', '0', 'nan']
  CTDA[32] floats ['1.1093e-23', '6.65472e-40', '8.49187e-43', '1.2894e-40', '2.42624e-40', '0', '0', 'nan']
  CTDA[32] floats ['1.1093e-23', '6.65472e-40', '8.49187e-43', '1.28932e-40', '2.42624e-40', '0', '0', 'nan']
  CTDA[32] floats ['1.1093e-23', '6.65472e-40', '8.49187e-43', '1.28939e-40', '2.42624e-40', '0', '0', 'nan']
  CTDA[32] floats ['1.1093e-23', '6.65472e-40', '8.49187e-43', '1.28938e-40', '2.42624e-40', '0', '0', 'nan']
  CTDA[32] floats ['1.10931e-23', '6.65472e-40', '8.49187e-43', '1.28935e-40', '2.42624e-40', '0', '0', 'nan']
  CTDA[32] floats ['1.10932e-23', '6.65472e-40', '8.49187e-43', '1.28936e-40', '2.42624e-40', '0', '0', 'nan']
  CTDA[32] floats ['1.10931e-23', '6.65472e-40', '8.49187e-43', '1.28942e-40', '2.42624e-40', '0', '0', 'nan']
  DNAM[4] 0x00000000 (float 0)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000001 (float 1.4013e-45)
  NNAM[4] 0x00083042 (float 7.51996e-40)
SMQN 0x0010c5f5 CWPaleQuestFortSiegeNodeREGAINDUPLICATE000
  PNAM[4] 0x000f838c (float 1.42472e-39)
  SNAM[4] 0x000cd6d5 (float 1.17909e-39)
  CITC[4] 0x00000009 (float 1.26117e-44)
  CTDA[32] floats ['1.1093e-23', '1', '7.91734e-43', '1.44379e-40', '0', '9.80909e-45', '0', '1.80515e-41']
  CTDA[32] floats ['1.1093e-23', '6.65472e-40', '8.49187e-43', '1.28945e-40', '2.42624e-40', '0', '0', 'nan']
  CTDA[32] floats ['1.1093e-23', '6.65472e-40', '8.49187e-43', '1.2894e-40', '2.42624e-40', '0', '0', 'nan']
  CTDA[32] floats ['1.1093e-23', '6.65472e-40', '8.49187e-43', '1.28932e-40', '2.42624e-40', '0', '0', 'nan']
  CTDA[32] floats ['1.1093e-23', '6.65472e-40', '8.49187e-43', '1.28939e-40', '2.42624e-40', '0', '0', 'nan']
  CTDA[32] floats ['1.10931e-23', '6.65472e-40', '8.49187e-43', '1.28938e-40', '2.42624e-40', '0', '0', 'nan']
  CTDA[32] floats ['1.10932e-23', '6.65472e-40', '8.49187e-43', '1.28935e-40', '2.42624e-40', '0', '0', 'nan']
  CTDA[32] floats ['1.10932e-23', '6.65472e-40', '8.49187e-43', '1.28936e-40', '2.42624e-40', '0', '0', 'nan']
  CTDA[32] floats ['1.10931e-23', '6.65472e-40', '8.49187e-43', '1.28942e-40', '2.42624e-40', '0', '0', 'nan']
  DNAM[4] 0x00000000 (float 0)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000001 (float 1.4013e-45)
  NNAM[4] 0x00083042 (float 7.51996e-40)
SMQN 0x0010c5f4 CWReachQuestFortSiegeNodeREGAINDUPLICATE000
  PNAM[4] 0x000f838b (float 1.42472e-39)
  SNAM[4] 0x0010c5f3 (float 1.54038e-39)
  CITC[4] 0x00000009 (float 1.26117e-44)
  CTDA[32] floats ['1.1093e-23', '1', '7.91734e-43', '1.44372e-40', '0', '9.80909e-45', '0', '1.80515e-41']
  CTDA[32] floats ['1.1093e-23', '6.65471e-40', '8.49187e-43', '1.28945e-40', '2.42624e-40', '0', '0', 'nan']
  CTDA[32] floats ['1.1093e-23', '6.65471e-40', '8.49187e-43', '1.28938e-40', '2.42624e-40', '0', '0', 'nan']
  CTDA[32] floats ['1.1093e-23', '6.65471e-40', '8.49187e-43', '1.28936e-40', '2.42624e-40', '0', '0', 'nan']
  CTDA[32] floats ['1.1093e-23', '6.65471e-40', '8.49187e-43', '1.41454e-40', '2.42624e-40', '0', '0', 'nan']
  CTDA[32] floats ['1.1093e-23', '6.65471e-40', '8.49187e-43', '1.28939e-40', '2.42624e-40', '0', '0', 'nan']
  CTDA[32] floats ['1.1093e-23', '6.65471e-40', '8.49187e-43', '1.2894e-40', '2.42624e-40', '0', '0', 'nan']
  CTDA[32] floats ['1.10931e-23', '6.65471e-40', '8.49187e-43', '1.28932e-40', '2.42624e-40', '0', '0', 'nan']
  CTDA[32] floats ['1.10931e-23', '6.65471e-40', '8.49187e-43', '1.28933e-40', '2.42624e-40', '0', '0', 'nan']
  DNAM[4] 0x00000000 (float 0)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000001 (float 1.4013e-45)
  NNAM[4] 0x00083042 (float 7.51996e-40)
SMQN 0x0010c5f3 CWFalkreathQuestFortSiegeNodeREGAINDUPLICATE000
  PNAM[4] 0x000f838b (float 1.42472e-39)
  SNAM[4] 0x0010c5f2 (float 1.54038e-39)
  CITC[4] 0x00000009 (float 1.26117e-44)
  CTDA[32] floats ['1.1093e-23', '1', '7.91734e-43', '1.44367e-40', '0', '9.80909e-45', '0', '1.80515e-41']
  CTDA[32] floats ['1.1093e-23', '6.65471e-40', '8.49187e-43', '1.28945e-40', '2.42624e-40', '0', '0', 'nan']
  CTDA[32] floats ['1.1093e-23', '6.65471e-40', '8.49187e-43', '1.28938e-40', '2.42624e-40', '0', '0', 'nan']
  CTDA[32] floats ['1.1093e-23', '6.65471e-40', '8.49187e-43', '1.28936e-40', '2.42624e-40', '0', '0', 'nan']
  CTDA[32] floats ['1.1093e-23', '6.65471e-40', '8.49187e-43', '1.41454e-40', '2.42624e-40', '0', '0', 'nan']
  CTDA[32] floats ['1.1093e-23', '6.65471e-40', '8.49187e-43', '1.28939e-40', '2.42624e-40', '0', '0', 'nan']
  CTDA[32] floats ['1.10931e-23', '6.65471e-40', '8.49187e-43', '1.2894e-40', '2.42624e-40', '0', '0', 'nan']
  CTDA[32] floats ['1.10931e-23', '6.65471e-40', '8.49187e-43', '1.28932e-40', '2.42624e-40', '0', '0', 'nan']
  CTDA[32] floats ['1.10931e-23', '6.65471e-40', '8.49187e-43', '1.28933e-40', '2.42624e-40', '0', '0', 'nan']
  DNAM[4] 0x00000000 (float 0)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000001 (float 1.4013e-45)
  NNAM[4] 0x00083042 (float 7.51996e-40)
SMQN 0x0010c5f2 CWHjaalmarchQuestFortSiegeNodeREGAINDUPLICATE000
  PNAM[4] 0x000f838b (float 1.42472e-39)
  SNAM[4] 0x000cd6db (float 1.1791e-39)
  CITC[4] 0x00000009 (float 1.26117e-44)
  CTDA[32] floats ['1.1093e-23', '1', '7.91734e-43', '1.44374e-40', '0', '9.80909e-45', '0', '1.80515e-41']
  CTDA[32] floats ['1.1093e-23', '6.65471e-40', '8.49187e-43', '1.28945e-40', '2.42624e-40', '0', '0', 'nan']
  CTDA[32] floats ['1.1093e-23', '6.65471e-40', '8.49187e-43', '1.28938e-40', '2.42624e-40', '0', '0', 'nan']
  CTDA[32] floats ['1.1093e-23', '6.65471e-40', '8.49187e-43', '1.28936e-40', '2.42624e-40', '0', '0', 'nan']
  CTDA[32] floats ['1.1093e-23', '6.65471e-40', '8.49187e-43', '1.41454e-40', '2.42624e-40', '0', '0', 'nan']
  CTDA[32] floats ['1.10931e-23', '6.65471e-40', '8.49187e-43', '1.28939e-40', '2.42624e-40', '0', '0', 'nan']
  CTDA[32] floats ['1.10931e-23', '6.65471e-40', '8.49187e-43', '1.2894e-40', '2.42624e-40', '0', '0', 'nan']
  CTDA[32] floats ['1.10931e-23', '6.65471e-40', '8.49187e-43', '1.28932e-40', '2.42624e-40', '0', '0', 'nan']
  CTDA[32] floats ['1.10931e-23', '6.65471e-40', '8.49187e-43', '1.28933e-40', '2.42624e-40', '0', '0', 'nan']
  DNAM[4] 0x00000000 (float 0)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000001 (float 1.4013e-45)
  NNAM[4] 0x00083042 (float 7.51996e-40)
SMQN 0x0010c044 HighHrothgarTrainingNode
  PNAM[4] 0x0001379a (float 1.11782e-40)
  SNAM[4] 0x001092e3 (float 1.52206e-39)
  CITC[4] 0x00000004 (float 5.60519e-45)
  CTDA[32] floats ['1.00969e-27', '1', '8.07148e-43', '2.95404e-09', '1.53834e-39', '0', '0', 'nan']
  CTDA[32] floats ['1.0097e-27', '160', '8.12753e-44', '2.07608e-40', '0', '0', '0', 'nan']
  CTDA[32] floats ['1.0097e-27', '220', '8.12753e-44', '2.07608e-40', '0', '0', '0', 'nan']
  CTDA[32] floats ['1.0097e-27', '10', '8.12753e-44', '2.6011e-40', '0', '0', '0', 'nan']
  DNAM[4] 0x00010000 (float 9.18355e-41)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000003 (float 4.2039e-45)
  NNAM[4] 0x0010c045 (float 1.53834e-39)
  NNAM[4] 0x0010c052 (float 1.53836e-39)
  NNAM[4] 0x0010c055 (float 1.53836e-39)
SMQN 0x001092e3 SkyHavenSparringNode
  PNAM[4] 0x0001379a (float 1.11782e-40)
  SNAM[4] 0x00047027 (float 4.07575e-40)
  CITC[4] 0x00000001 (float 1.4013e-45)
  CTDA[32] floats ['1.00969e-27', '1', '8.07148e-43', '2.95404e-09', '1.52206e-39', '0', '0', 'nan']
  DNAM[4] 0x00000000 (float 0)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000001 (float 1.4013e-45)
  NNAM[4] 0x001092d3 (float 1.52204e-39)
  RNAM[4] 0x42400000 (float 48)
SMQN 0x00108427 MQ304SovngardeCombatNode
  PNAM[4] 0x00108426 (float 1.51677e-39)
  SNAM[4] 0x00000000 (float 0)
  CITC[4] 0x00000000 (float 0)
  DNAM[4] 0x00000000 (float 0)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000001 (float 1.4013e-45)
  NNAM[4] 0x00017042 (float 1.32106e-40)
  RNAM[4] 0x4099999a (float 4.8)
SMQN 0x0010736e WESpecificWE100
  PNAM[4] 0x00101732 (float 1.47769e-39)
  SNAM[4] 0x0010736d (float 1.51077e-39)
  CITC[4] 0x00000001 (float 1.4013e-45)
  CTDA[32] floats ['3.92251e-27', '100', '8.07148e-43', '3.11411e-09', '0', '0', '0', 'nan']
  DNAM[4] 0x00000000 (float 0)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000001 (float 1.4013e-45)
  NNAM[4] 0x000a17ae (float 9.2685e-40)
SMQN 0x0010736d WESpecificWEJS23
  PNAM[4] 0x00101732 (float 1.47769e-39)
  SNAM[4] 0x0010736c (float 1.51077e-39)
  CITC[4] 0x00000001 (float 1.4013e-45)
  CTDA[32] floats ['3.92251e-27', '123', '8.07148e-43', '3.11411e-09', '0', '0', '0', 'nan']
  DNAM[4] 0x00000000 (float 0)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000001 (float 1.4013e-45)
  NNAM[4] 0x000e8933 (float 1.33491e-39)
SMQN 0x0010736c WESpecificWERoad07
  PNAM[4] 0x00101732 (float 1.47769e-39)
  SNAM[4] 0x0010736b (float 1.51077e-39)
  CITC[4] 0x00000001 (float 1.4013e-45)
  CTDA[32] floats ['3.92251e-27', '307', '8.07148e-43', '3.11411e-09', '0', '0', '0', 'nan']
  DNAM[4] 0x00000000 (float 0)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000001 (float 1.4013e-45)
  NNAM[4] 0x00105d15 (float 1.50276e-39)
SMQN 0x0010736b WESpecificWEDL02
  PNAM[4] 0x00101732 (float 1.47769e-39)
  SNAM[4] 0x0010736a (float 1.51077e-39)
  CITC[4] 0x00000001 (float 1.4013e-45)
  CTDA[32] floats ['3.92251e-27', '202', '8.07148e-43', '3.11411e-09', '0', '0', '0', 'nan']
  DNAM[4] 0x00000000 (float 0)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000001 (float 1.4013e-45)
  NNAM[4] 0x000b813f (float 1.05656e-39)
SMQN 0x0010736a WESpecificWE09
  PNAM[4] 0x00101732 (float 1.47769e-39)
  SNAM[4] 0x00101731 (float 1.47769e-39)
  CITC[4] 0x00000001 (float 1.4013e-45)
  CTDA[32] floats ['3.92251e-27', '9', '8.07148e-43', '3.11411e-09', '0', '0', '0', 'nan']
  DNAM[4] 0x00000000 (float 0)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000001 (float 1.4013e-45)
  NNAM[4] 0x0009d5a0 (float 9.03154e-40)
SMQN 0x001058ab MarkarthBlacksmithConvoScenes
  PNAM[4] 0x000340c6 (float 2.98743e-40)
  SNAM[4] 0x0009ca12 (float 8.99009e-40)
  CITC[4] 0x00000002 (float 2.8026e-45)
  CTDA[32] floats ['5.78845e-24', '1', '3.57331e-43', '0', '0', '9.80909e-45', '0', '1.76928e-41']
  CTDA[32] floats ['5.78845e-24', '1', '3.57331e-43', '0', '0', '9.80909e-45', '0', '1.80515e-41']
  DNAM[4] 0x00010001 (float 9.18369e-41)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000002 (float 2.8026e-45)
  NNAM[4] 0x00055a6e (float 4.91618e-40)
  NNAM[4] 0x00025ef8 (float 2.17739e-40)
SMQN 0x00105586 TutorialAlchemyNode
  PNAM[4] 0x0010538a (float 1.49934e-39)
  SNAM[4] 0x0010538b (float 1.49934e-39)
  CITC[4] 0x00000002 (float 2.8026e-45)
  CTDA[32] floats ['1.00841e-23', '1', '7.84727e-44', '1.50003e-39', '0', '0', '0', 'nan']
  CTDA[32] floats ['1.00842e-23', '10', '8.12753e-44', '1.50003e-39', '0', '0', '0', 'nan']
  DNAM[4] 0x00020000 (float 1.83671e-40)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000001 (float 1.4013e-45)
  NNAM[4] 0x00105585 (float 1.50005e-39)
SMQN 0x0010538b TutorialBlacksmithingNode
  PNAM[4] 0x0010538a (float 1.49934e-39)
  SNAM[4] 0x00000000 (float 0)
  CITC[4] 0x00000002 (float 2.8026e-45)
  CTDA[32] floats ['1.00841e-23', '1', '7.84727e-44', '1.49933e-39', '0', '0', '0', 'nan']
  CTDA[32] floats ['1.00842e-23', '10', '8.12753e-44', '1.49933e-39', '0', '0', '0', 'nan']
  DNAM[4] 0x00020000 (float 1.83671e-40)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000005 (float 7.00649e-45)
  NNAM[4] 0x00105389 (float 1.49933e-39)
  NNAM[4] 0x00105392 (float 1.49935e-39)
  NNAM[4] 0x00105395 (float 1.49935e-39)
  NNAM[4] 0x00105397 (float 1.49935e-39)
  NNAM[4] 0x0010539a (float 1.49936e-39)
SMQN 0x0010481d DA04SeptimusFindPlayerNode
  PNAM[4] 0x00090028 (float 8.26576e-40)
  SNAM[4] 0x00081c5a (float 7.44855e-40)
  CITC[4] 0x00000002 (float 2.8026e-45)
  CTDA[32] floats ['7.63854e-26', '35', '8.12753e-44', '2.60106e-40', '0', '0', '0', 'nan']
  CTDA[32] floats ['7.6386e-26', '1.30343e-39', '1.12104e-43', '0', '0', '2.8026e-45', '2.8026e-44', 'nan']
  DNAM[4] 0x00020000 (float 1.83671e-40)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000001 (float 1.4013e-45)
  NNAM[4] 0x0010481c (float 1.49524e-39)
SMQN 0x00102d65 WERoadQuestNode
  PNAM[4] 0x001027a7 (float 1.48359e-39)
  SNAM[4] 0x00000000 (float 0)
  CITC[4] 0x00000000 (float 0)
  DNAM[4] 0x00010001 (float 9.18369e-41)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x0000001e (float 4.2039e-44)
  NNAM[4] 0x001034df (float 1.48833e-39)
  NNAM[4] 0x001027a5 (float 1.48359e-39)
  NNAM[4] 0x00062119 (float 5.62886e-40)
  NNAM[4] 0x000b80f3 (float 1.05645e-39)
  NNAM[4] 0x000b813f (float 1.05656e-39)
  NNAM[4] 0x000b8143 (float 1.05656e-39)
  NNAM[4] 0x000bd757 (float 1.08744e-39)
  NNAM[4] 0x000bd758 (float 1.08744e-39)
  NNAM[4] 0x000b32f2 (float 1.02847e-39)
  NNAM[4] 0x000bc037 (float 1.07914e-39)
  NNAM[4] 0x000b85b8 (float 1.05816e-39)
  NNAM[4] 0x000bed92 (float 1.09541e-39)
  NNAM[4] 0x000b8169 (float 1.05661e-39)
  NNAM[4] 0x000b85aa (float 1.05814e-39)
  NNAM[4] 0x000e8929 (float 1.3349e-39)
  NNAM[4] 0x0009d5a0 (float 9.03154e-40)
  NNAM[4] 0x00105170 (float 1.49858e-39)
  NNAM[4] 0x00105172 (float 1.49859e-39)
  NNAM[4] 0x00105173 (float 1.49859e-39)
  NNAM[4] 0x00105d15 (float 1.50276e-39)
  NNAM[4] 0x000bc5bd (float 1.08113e-39)
  NNAM[4] 0x00105d19 (float 1.50277e-39)
  NNAM[4] 0x00105d1d (float 1.50277e-39)
  NNAM[4] 0x001065f4 (float 1.50594e-39)
  NNAM[4] 0x001065fa (float 1.50595e-39)
  NNAM[4] 0x00106a59 (float 1.50752e-39)
  NNAM[4] 0x00106a5e (float 1.50753e-39)
  NNAM[4] 0x0010bf8e (float 1.53808e-39)
  NNAM[4] 0x00105d12 (float 1.50276e-39)
  NNAM[4] 0x000ba0c0 (float 1.06786e-39)
SMQN 0x00102d5f C00LocationMonitoringHardcoreNode
  PNAM[4] 0x0009002e (float 8.26584e-40)
  SNAM[4] 0x00000000 (float 0)
  CITC[4] 0x00000003 (float 4.2039e-45)
  CTDA[32] floats ['1.02969e-22', '1', '9.94922e-44', '4.14473e-40', '0', '2.8026e-45', '2.8026e-44', 'nan']
  CTDA[32] floats ['1.02969e-22', '1', '7.60905e-43', '1.66076e-40', '0', '0', '0', 'nan']
  CTDA[32] floats ['1.02969e-22', '0', '7.84727e-44', '1.66078e-40', '0', '0', '0', 'nan']
  DNAM[4] 0x00020000 (float 1.83671e-40)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000001 (float 1.4013e-45)
  NNAM[4] 0x000a3ee5 (float 9.40917e-40)
SMQN 0x00101731 WESpecificWEJS21
  PNAM[4] 0x00101732 (float 1.47769e-39)
  SNAM[4] 0x00000000 (float 0)
  CITC[4] 0x00000001 (float 1.4013e-45)
  CTDA[32] floats ['5.75961e-29', '121', '8.07148e-43', '3.11411e-09', '0', '0', '0', 'nan']
  DNAM[4] 0x00000000 (float 0)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000001 (float 1.4013e-45)
  NNAM[4] 0x000e892e (float 1.33491e-39)
SMQN 0x001016b2 dunWhiteRiverWatchNode
  PNAM[4] 0x00030b13 (float 2.79479e-40)
  SNAM[4] 0x000f86ae (float 1.42585e-39)
  CITC[4] 0x00000001 (float 1.4013e-45)
  CTDA[32] floats ['5.75961e-29', '1', '5.03066e-43', '1.44486e-40', '0', '0', '0', 'nan']
  DNAM[4] 0x00020000 (float 1.83671e-40)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000001 (float 1.4013e-45)
  NNAM[4] 0x0001c3fb (float 1.6214e-40)
SMQN 0x000ff236 CompanionsSwapCrimeFactionsNode
  PNAM[4] 0x000236a1 (float 2.03268e-40)
  SNAM[4] 0x0001c1f7 (float 1.61417e-40)
  CITC[4] 0x00000002 (float 2.8026e-45)
  CTDA[32] floats ['1.14249e-26', '1', '8.07148e-43', '2.95404e-09', '3.12173e-40', '0', '0', 'nan']
  CTDA[32] floats ['1.14249e-26', '1', '8.07148e-43', '2.96859e-09', '1.41461e-40', '0', '0', 'nan']
  DNAM[4] 0x00020000 (float 1.83671e-40)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000001 (float 1.4013e-45)
  NNAM[4] 0x000ff235 (float 1.46442e-39)
SMQN 0x000fe47a T03PostQuestNode
  PNAM[4] 0x00090028 (float 8.26576e-40)
  SNAM[4] 0x000b18e3 (float 1.01912e-39)
  CITC[4] 0x00000004 (float 5.60519e-45)
  CTDA[32] floats ['5.75591e-29', '1', '7.60905e-43', '1.62346e-40', '0', '0', '0', 'nan']
  CTDA[32] floats ['5.75591e-29', '0', '8.26766e-44', '1.45949e-39', '1.4013e-43', '0', '0', 'nan']
  CTDA[32] floats ['5.75591e-29', '0', '8.07148e-43', '1.18744e-08', '1.41461e-40', '2.8026e-45', '2.8026e-44', 'nan']
  CTDA[32] floats ['5.75591e-29', '0', '8.07148e-43', '2.96859e-09', '1.41461e-40', '2.8026e-45', '2.8026e-44', 'nan']
  DNAM[4] 0x00020000 (float 1.83671e-40)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000001 (float 1.4013e-45)
  NNAM[4] 0x000fe479 (float 1.45949e-39)
SMQN 0x000fde7f AchievementHardWorkerQuestNode
  PNAM[4] 0x000fde7e (float 1.45735e-39)
  SNAM[4] 0x00000000 (float 0)
  CITC[4] 0x00000001 (float 1.4013e-45)
  CTDA[32] floats ['1.14621e-27', '1', '7.84727e-43', '9.51609e-40', '0', '9.80909e-45', '0', '1.76928e-41']
  DNAM[4] 0x00020000 (float 1.83671e-40)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000001 (float 1.4013e-45)
  NNAM[4] 0x000fde7d (float 1.45735e-39)
SMQN 0x000fcc30 
  PNAM[4] 0x0005bd78 (float 5.27146e-40)
  SNAM[4] 0x00000000 (float 0)
  CITC[4] 0x00000000 (float 0)
  DNAM[4] 0x00020000 (float 1.83671e-40)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000001 (float 1.4013e-45)
  NNAM[4] 0x000fcc2f (float 1.45078e-39)
SMQN 0x000f9095 WEBountyCollectorWinterholdNode
  PNAM[4] 0x000f8a84 (float 1.42722e-39)
  SNAM[4] 0x000f9094 (float 1.4294e-39)
  CITC[4] 0x00000002 (float 2.8026e-45)
  CTDA[32] floats ['1.4013e-43', '1.42723e-39', '6.43196e-43', '2.30103e-40', '0', '0', '0', 'nan']
  CTDA[32] floats ['0', '1', '8.07148e-43', '2.96859e-09', '1.28935e-40', '0', '0', 'nan']
  DNAM[4] 0x00000000 (float 0)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000001 (float 1.4013e-45)
  NNAM[4] 0x000f8a80 (float 1.42722e-39)
  RNAM[4] 0x44900000 (float 1152)
SMQN 0x000f9094 WEBountyCollectorWhiterunNode
  PNAM[4] 0x000f8a84 (float 1.42722e-39)
  SNAM[4] 0x000f9093 (float 1.4294e-39)
  CITC[4] 0x00000002 (float 2.8026e-45)
  CTDA[32] floats ['1.4013e-43', '1.42723e-39', '6.43196e-43', '2.20948e-40', '0', '0', '0', 'nan']
  CTDA[32] floats ['0', '1', '8.07148e-43', '2.96859e-09', '1.28945e-40', '0', '0', 'nan']
  DNAM[4] 0x00000000 (float 0)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000001 (float 1.4013e-45)
  NNAM[4] 0x000f8a80 (float 1.42722e-39)
  RNAM[4] 0x44900000 (float 1152)
SMQN 0x000f9093 WEBountyCollectorRiftNode
  PNAM[4] 0x000f8a84 (float 1.42722e-39)
  SNAM[4] 0x000f8a85 (float 1.42722e-39)
  CITC[4] 0x00000002 (float 2.8026e-45)
  CTDA[32] floats ['1.4013e-43', '1.42723e-39', '6.43196e-43', '2.30097e-40', '0', '0', '0', 'nan']
  CTDA[32] floats ['0', '1', '8.07148e-43', '2.96859e-09', '1.28936e-40', '0', '0', 'nan']
  DNAM[4] 0x00000000 (float 0)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000001 (float 1.4013e-45)
  NNAM[4] 0x000f8a80 (float 1.42722e-39)
  RNAM[4] 0x44900000 (float 1152)
SMQN 0x000f9092 WEBountyCollectorPaleNode
  PNAM[4] 0x000f8a84 (float 1.42722e-39)
  SNAM[4] 0x000f9091 (float 1.42939e-39)
  CITC[4] 0x00000002 (float 2.8026e-45)
  CTDA[32] floats ['1.4013e-43', '1.42723e-39', '6.43196e-43', '2.30102e-40', '0', '0', '0', 'nan']
  CTDA[32] floats ['0', '1', '8.07148e-43', '2.96859e-09', '1.28938e-40', '0', '0', 'nan']
  DNAM[4] 0x00000000 (float 0)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000001 (float 1.4013e-45)
  NNAM[4] 0x000f8a80 (float 1.42722e-39)
  RNAM[4] 0x44900000 (float 1152)
SMQN 0x000f9091 WEBountyCollectorHjaalmarchNode
  PNAM[4] 0x000f8a84 (float 1.42722e-39)
  SNAM[4] 0x000f9090 (float 1.42939e-39)
  CITC[4] 0x00000002 (float 2.8026e-45)
  CTDA[32] floats ['1.4013e-43', '1.42723e-39', '6.43196e-43', '2.301e-40', '0', '0', '0', 'nan']
  CTDA[32] floats ['0', '1', '8.07148e-43', '2.96859e-09', '1.28939e-40', '0', '0', 'nan']
  DNAM[4] 0x00000000 (float 0)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000001 (float 1.4013e-45)
  NNAM[4] 0x000f8a80 (float 1.42722e-39)
  RNAM[4] 0x44900000 (float 1152)
SMQN 0x000f9090 WEBountyCollectorHaafingarNode
  PNAM[4] 0x000f8a84 (float 1.42722e-39)
  SNAM[4] 0x000f908f (float 1.42939e-39)
  CITC[4] 0x00000002 (float 2.8026e-45)
  CTDA[32] floats ['1.4013e-43', '1.42723e-39', '6.43196e-43', '2.40239e-40', '0', '0', '0', 'nan']
  CTDA[32] floats ['0', '1', '8.07148e-43', '2.96859e-09', '1.28942e-40', '0', '0', 'nan']
  DNAM[4] 0x00000000 (float 0)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000001 (float 1.4013e-45)
  NNAM[4] 0x000f8a80 (float 1.42722e-39)
  RNAM[4] 0x44900000 (float 1152)
SMQN 0x000f908f WEBountyCollectorFalkreathNode
  PNAM[4] 0x000f8a84 (float 1.42722e-39)
  SNAM[4] 0x000f908e (float 1.42939e-39)
  CITC[4] 0x00000002 (float 2.8026e-45)
  CTDA[32] floats ['1.4013e-43', '1.42723e-39', '6.43196e-43', '2.30104e-40', '0', '0', '0', 'nan']
  CTDA[32] floats ['0', '1', '8.07148e-43', '2.96859e-09', '1.2894e-40', '0', '0', 'nan']
  DNAM[4] 0x00000000 (float 0)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000001 (float 1.4013e-45)
  NNAM[4] 0x000f8a80 (float 1.42722e-39)
  RNAM[4] 0x44900000 (float 1152)
SMQN 0x000f908e WEBountyCollectorEastmarchNode
  PNAM[4] 0x000f8a84 (float 1.42722e-39)
  SNAM[4] 0x00000000 (float 0)
  CITC[4] 0x00000002 (float 2.8026e-45)
  CTDA[32] floats ['1.4013e-43', '1.42723e-39', '6.43196e-43', '2.20939e-40', '0', '0', '0', 'nan']
  CTDA[32] floats ['0', '1', '8.07148e-43', '2.96859e-09', '1.28933e-40', '0', '0', 'nan']
  DNAM[4] 0x00000000 (float 0)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000001 (float 1.4013e-45)
  NNAM[4] 0x000f8a80 (float 1.42722e-39)
  RNAM[4] 0x44900000 (float 1152)
SMQN 0x000f9076 CRLocationExpansionNode
  PNAM[4] 0x0009002e (float 8.26584e-40)
  SNAM[4] 0x0009d6f7 (float 9.03634e-40)
  CITC[4] 0x00000000 (float 0)
  DNAM[4] 0x00020000 (float 1.83671e-40)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000001 (float 1.4013e-45)
  NNAM[4] 0x000f9075 (float 1.42935e-39)
SMQN 0x000f8a85 WEBountyCollectorReachNode
  PNAM[4] 0x000f8a84 (float 1.42722e-39)
  SNAM[4] 0x000f9092 (float 1.42939e-39)
  CITC[4] 0x00000002 (float 2.8026e-45)
  CTDA[32] floats ['3.86279e-27', '1.42723e-39', '6.43196e-43', '2.30099e-40', '0', '0', '0', 'nan']
  CTDA[32] floats ['3.86276e-27', '1', '8.07148e-43', '2.96859e-09', '1.28932e-40', '0', '0', 'nan']
  DNAM[4] 0x00000000 (float 0)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000001 (float 1.4013e-45)
  NNAM[4] 0x000f8a80 (float 1.42722e-39)
  RNAM[4] 0x44900000 (float 1152)
SMQN 0x000f86ae dunSunderstoneGorgeNode
  PNAM[4] 0x00030b13 (float 2.79479e-40)
  SNAM[4] 0x000eceb8 (float 1.35985e-39)
  CITC[4] 0x00000001 (float 1.4013e-45)
  CTDA[32] floats ['4.39405e-27', '1', '5.03066e-43', '5.60658e-40', '0', '0', '0', 'nan']
  DNAM[4] 0x00020000 (float 1.83671e-40)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000001 (float 1.4013e-45)
  NNAM[4] 0x0008b72a (float 8.00391e-40)
SMQN 0x000f6f1c 
  PNAM[4] 0x0002d386 (float 2.59551e-40)
  SNAM[4] 0x0002d387 (float 2.59553e-40)
  CITC[4] 0x00000000 (float 0)
  DNAM[4] 0x00020000 (float 1.83671e-40)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000001 (float 1.4013e-45)
  NNAM[4] 0x000f2593 (float 1.39101e-39)
SMQN 0x000f6086 CompanionsFarkasPostQuestlineNode
  PNAM[4] 0x000f6085 (float 1.41216e-39)
  SNAM[4] 0x00000000 (float 0)
  CITC[4] 0x00000002 (float 2.8026e-45)
  CTDA[32] floats ['3.11373e-27', '1', '7.60905e-43', '1.66079e-40', '0', '0', '0', 'nan']
  CTDA[32] floats ['3.11373e-27', '1', '8.81417e-43', '4.315e-40', '3.24988e-08', '0', '0', 'nan']
  CIS2[26] 3a3a4661726b61734861734265617374426c6f6f645f76617200
  DNAM[4] 0x00000000 (float 0)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000001 (float 1.4013e-45)
  NNAM[4] 0x000e3163 (float 1.30341e-39)
SMQN 0x000f6084 VilkasPostQuestlineNode
  PNAM[4] 0x000ec1a7 (float 1.35517e-39)
  SNAM[4] 0x00000000 (float 0)
  CITC[4] 0x00000002 (float 2.8026e-45)
  CTDA[32] floats ['3.11373e-27', '1', '7.60905e-43', '1.66079e-40', '0', '0', '0', 'nan']
  CTDA[32] floats ['3.11373e-27', '1', '8.81417e-43', '4.315e-40', '3.42714e-08', '0', '0', 'nan']
  CIS2[26] 3a3a56696c6b61734861734265617374426c6f6f645f76617200
  DNAM[4] 0x00000001 (float 1.4013e-45)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000001 (float 1.4013e-45)
  NNAM[4] 0x000e3163 (float 1.30341e-39)
SMQN 0x000f2199 WEDL
  PNAM[4] 0x000896a8 (float 7.88729e-40)
  SNAM[4] 0x0004a601 (float 4.26893e-40)
  CITC[4] 0x00000001 (float 1.4013e-45)
  CTDA[32] floats ['1.15571e-27', '0', '1.03696e-43', '1.918e-40', '0', '0', '0', 'nan']
  DNAM[4] 0x00010001 (float 9.18369e-41)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000000 (float 0)
SMQN 0x000f0a16 MQSovngardeHallofHeroesNode
  PNAM[4] 0x0002fd4a (float 2.74534e-40)
  SNAM[4] 0x00000000 (float 0)
  CITC[4] 0x00000003 (float 4.2039e-45)
  CTDA[32] floats ['6.93647e-22', '10', '8.12753e-44', '4.0714e-40', '0', '0', '0', 'nan']
  CTDA[32] floats ['6.93649e-22', '200', '8.12753e-44', '4.07142e-40', '0', '0', '0', 'nan']
  CTDA[32] floats ['6.93643e-22', '1', '9.3887e-44', '8.59618e-40', '0', '2.8026e-45', '2.8026e-44', 'nan']
  DNAM[4] 0x00000000 (float 0)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000000 (float 0)
SMQN 0x000edf6e MQ304SovngardeScenes
  PNAM[4] 0x00108426 (float 1.51677e-39)
  SNAM[4] 0x00108427 (float 1.51678e-39)
  CITC[4] 0x00000002 (float 2.8026e-45)
  CTDA[32] floats ['1.79366e-43', '1200', '1.4013e-45', '2.8026e-44', '0', '9.80909e-45', '0', '1.76928e-41']
  CTDA[32] floats ['0', '1', '8.81417e-43', '4.0714e-40', '4.34636e-11', '0', '0', 'nan']
  CIS2[29] 3a3a48616c6c6f664865726f6573436f6d626174466c61675f76617200
  DNAM[4] 0x00000001 (float 1.4013e-45)
  XNAM[4] 0x00000001 (float 1.4013e-45)
  QNAM[4] 0x00000003 (float 4.2039e-45)
  NNAM[4] 0x000edf6a (float 1.36584e-39)
  RNAM[4] 0x4019999a (float 2.4)
  NNAM[4] 0x000f1a41 (float 1.38695e-39)
  RNAM[4] 0x4099999a (float 4.8)
  NNAM[4] 0x000f1a44 (float 1.38695e-39)
  RNAM[4] 0x4099999a (float 4.8)
SMQN 0x000eceb8 dunGauldursonCLENode
  PNAM[4] 0x00030b13 (float 2.79479e-40)
  SNAM[4] 0x000eb9e3 (float 1.35238e-39)
  CITC[4] 0x00000004 (float 5.60519e-45)
  CTDA[32] floats ['2.29953e-27', '1', '5.03066e-43', '1.44416e-40', '0', '0', '0', 'nan']
  CTDA[32] floats ['2.29953e-27', '1', '5.03066e-43', '1.44021e-40', '0', '0', '0', 'nan']
  CTDA[32] floats ['2.29953e-27', '1', '5.03066e-43', '1.44425e-40', '0', '0', '0', 'nan']
  CTDA[32] floats ['2.29953e-27', '1', '5.03066e-43', '1.44042e-40', '0', '0', '0', 'nan']
  DNAM[4] 0x00020000 (float 1.83671e-40)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000001 (float 1.4013e-45)
  NNAM[4] 0x000eceb7 (float 1.35985e-39)
SMQN 0x000ec1a8 CompanionsVilkasSkjorDeadNode
  PNAM[4] 0x000ec1a7 (float 1.35517e-39)
  SNAM[4] 0x000bfc7a (float 1.10076e-39)
  CITC[4] 0x00000001 (float 1.4013e-45)
  CTDA[32] floats ['9.07935e-25', '1', '6.44597e-44', '0', '0', '2.8026e-45', '1.51588e-40', 'nan']
  DNAM[4] 0x00020001 (float 1.83672e-40)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000003 (float 4.2039e-45)
  NNAM[4] 0x000c18e1 (float 1.11095e-39)
  NNAM[4] 0x00025250 (float 2.13199e-40)
  NNAM[4] 0x00025251 (float 2.13201e-40)
SMQN 0x000ec19a DRMNode
  PNAM[4] 0x00090028 (float 8.26576e-40)
  SNAM[4] 0x000e1371 (float 1.29267e-39)
  CITC[4] 0x00000004 (float 5.60519e-45)
  CTDA[32] floats ['2.01874e-27', '1', '7.84727e-44', '5.77554e-40', '0', '0', '0', 'nan']
  CTDA[32] floats ['2.01874e-27', '1', '8.26766e-44', '5.77554e-40', '4.2039e-44', '0', '0', 'nan']
  CTDA[32] floats ['2.01874e-27', '0', '8.26766e-44', '5.77554e-40', '4.90454e-44', '0', '0', 'nan']
  CTDA[32] floats ['2.01874e-27', '0', '8.26766e-44', '5.77554e-40', '5.60519e-44', '0', '0', 'nan']
  DNAM[4] 0x00020000 (float 1.83671e-40)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000001 (float 1.4013e-45)
  NNAM[4] 0x000ec199 (float 1.35515e-39)
SMQN 0x000eb9e3 dunRebelsCairnCLENode
  PNAM[4] 0x00030b13 (float 2.79479e-40)
  SNAM[4] 0x000adff2 (float 9.98691e-40)
  CITC[4] 0x00000002 (float 2.8026e-45)
  CTDA[32] floats ['4.51761e-27', '1', '5.03066e-43', '9.65185e-40', '0', '0', '0', 'nan']
  CTDA[32] floats ['4.51761e-27', '1', '5.03066e-43', '1.44009e-40', '0', '0', '0', 'nan']
  DNAM[4] 0x00020000 (float 1.83671e-40)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000001 (float 1.4013e-45)
  NNAM[4] 0x000eb9e2 (float 1.35238e-39)
SMQN 0x000eafce E3DemoKids
  PNAM[4] 0x0009002d (float 8.26583e-40)
  SNAM[4] 0x00035102 (float 3.04567e-40)
  CITC[4] 0x00000000 (float 0)
  DNAM[4] 0x00020000 (float 1.83671e-40)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000001 (float 1.4013e-45)
  NNAM[4] 0x000340a4 (float 2.98695e-40)
SMQN 0x000eafa8 TG04KillMonitor
  PNAM[4] 0x00013010 (float 1.09077e-40)
  SNAM[4] 0x000eafa7 (float 1.34871e-39)
  CITC[4] 0x00000003 (float 4.2039e-45)
  CTDA[32] floats ['6.57092e-23', '1', '7.84727e-44', '1.91316e-40', '0', '0', '0', 'nan']
  CTDA[32] floats ['6.57092e-23', '1', '1.00893e-43', '9.80909e-45', '0', '9.80909e-45', '0', '1.80515e-41']
  CTDA[32] floats ['6.57092e-23', '1', '1.00893e-43', '1.09957e-40', '0', '9.80909e-45', '0', '1.76928e-41']
  DNAM[4] 0x00020000 (float 1.83671e-40)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000001 (float 1.4013e-45)
  NNAM[4] 0x000b8831 (float 1.05905e-39)
SMQN 0x000eafa7 TG03KillMonitor
  PNAM[4] 0x00013010 (float 1.09077e-40)
  SNAM[4] 0x000eafa6 (float 1.34871e-39)
  CITC[4] 0x00000004 (float 5.60519e-45)
  CTDA[32] floats ['6.57092e-23', '1', '7.84727e-44', '1.91315e-40', '0', '0', '0', 'nan']
  CTDA[32] floats ['6.57092e-23', '1', '1.00893e-43', '9.80909e-45', '0', '9.80909e-45', '0', '1.80515e-41']
  CTDA[32] floats ['6.57092e-23', '1', '1.00893e-43', '2.50591e-40', '0', '9.80909e-45', '0', '1.76928e-41']
  CTDA[32] floats ['6.57092e-23', '1', '1.00893e-43', '2.50594e-40', '0', '9.80909e-45', '0', '1.76928e-41']
  DNAM[4] 0x00020000 (float 1.83671e-40)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000001 (float 1.4013e-45)
  NNAM[4] 0x000b8830 (float 1.05905e-39)
SMQN 0x000eafa6 TG01KillMonitor
  PNAM[4] 0x00013010 (float 1.09077e-40)
  SNAM[4] 0x000b1145 (float 1.01639e-39)
  CITC[4] 0x00000005 (float 7.00649e-45)
  CTDA[32] floats ['6.57092e-23', '1', '7.84727e-44', '1.79061e-40', '0', '0', '0', 'nan']
  CTDA[32] floats ['6.57092e-23', '1', '1.00893e-43', '9.80909e-45', '0', '9.80909e-45', '0', '1.80515e-41']
  CTDA[32] floats ['6.57092e-23', '1', '1.00893e-43', '1.10272e-40', '0', '9.80909e-45', '0', '1.76928e-41']
  CTDA[32] floats ['6.57092e-23', '1', '1.00893e-43', '1.10239e-40', '0', '9.80909e-45', '0', '1.76928e-41']
  CTDA[32] floats ['6.57092e-23', '1', '1.00893e-43', '1.10264e-40', '0', '9.80909e-45', '0', '1.76928e-41']
  DNAM[4] 0x00020000 (float 1.83671e-40)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000001 (float 1.4013e-45)
  NNAM[4] 0x000b882f (float 1.05904e-39)
SMQN 0x000e8b51 MGR1TriggerNode
  PNAM[4] 0x00090028 (float 8.26576e-40)
  SNAM[4] 0x000e16c7 (float 1.29387e-39)
  CITC[4] 0x00000003 (float 4.2039e-45)
  CTDA[32] floats ['4.72971e-23', '0', '7.84727e-44', '2.20599e-40', '0', '0', '0', 'nan']
  CTDA[32] floats ['4.72971e-23', '1', '8.07148e-43', '1.18744e-08', '6.82749e-40', '0', '0', 'nan']
  CTDA[32] floats ['4.72971e-23', '0', '8.07148e-43', '2.96859e-09', '6.82749e-40', '0', '0', 'nan']
  DNAM[4] 0x00020000 (float 1.83671e-40)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000001 (float 1.4013e-45)
  NNAM[4] 0x000e8b50 (float 1.33567e-39)
SMQN 0x000e16c7 DA16WalkSceneNode
  PNAM[4] 0x00090028 (float 8.26576e-40)
  SNAM[4] 0x000e76e4 (float 1.32835e-39)
  CITC[4] 0x00000003 (float 4.2039e-45)
  CTDA[32] floats ['5.77579e-29', '25', '8.12753e-44', '2.07593e-40', '0', '0', '0', 'nan']
  CTDA[32] floats ['5.77579e-29', '1', '1.03696e-43', '1.29387e-39', '0', '0', '0', 'nan']
  CTDA[32] floats ['5.77579e-29', '0', '1.03696e-43', '1.38697e-39', '0', '0', '0', 'nan']
  DNAM[4] 0x00020000 (float 1.83671e-40)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000001 (float 1.4013e-45)
  NNAM[4] 0x000e16c6 (float 1.29387e-39)
SMQN 0x000e1371 TG06WizardsQuartersNode
  PNAM[4] 0x00090028 (float 8.26576e-40)
  SNAM[4] 0x000e8b51 (float 1.33567e-39)
  CITC[4] 0x00000001 (float 1.4013e-45)
  CTDA[32] floats ['5.5624e-22', '1', '5.03066e-43', '1.41465e-40', '0', '0', '0', 'nan']
  DNAM[4] 0x00020000 (float 1.83671e-40)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000001 (float 1.4013e-45)
  NNAM[4] 0x00087105 (float 7.75228e-40)
SMQN 0x000d91d2 MS06IncreaseLevelNodeSHARES
  PNAM[4] 0x0005bd79 (float 5.27147e-40)
  SNAM[4] 0x000bd721 (float 1.08736e-39)
  CITC[4] 0x00000003 (float 4.2039e-45)
  CTDA[32] floats ['4.48416e-44', '1', '5.03066e-43', '1.41467e-40', '0', '2.8026e-45', '2.8026e-44', 'nan']
  CTDA[32] floats ['0', '1', '7.60905e-43', '8.46618e-40', '0', '0', '0', 'nan']
  CTDA[32] floats ['1.4013e-43', '1.24623e-39', '1.12104e-43', '0', '0', '2.8026e-45', '2.8026e-44', 'nan']
  DNAM[4] 0x00020002 (float 1.83674e-40)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000001 (float 1.4013e-45)
  NNAM[4] 0x00026c4d (float 2.22522e-40)
SMQN 0x000cdb66 SolitudeAgenlinesAromaticsScenes
  PNAM[4] 0x000cdb5a (float 1.18071e-39)
  SNAM[4] 0x000cdb64 (float 1.18073e-39)
  CITC[4] 0x00000001 (float 1.4013e-45)
  CTDA[32] floats ['7.26636e-25', '1', '9.3887e-44', '1.29885e-40', '0', '0', '0', 'nan']
  DNAM[4] 0x00000001 (float 1.4013e-45)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000001 (float 1.4013e-45)
  NNAM[4] 0x000cdb58 (float 1.18071e-39)
SMQN 0x000cdb64 SolitudeRadiantRaimentScenes
  PNAM[4] 0x000cdb5a (float 1.18071e-39)
  SNAM[4] 0x000cdb5b (float 1.18072e-39)
  CITC[4] 0x00000001 (float 1.4013e-45)
  CTDA[32] floats ['7.26636e-25', '1', '9.3887e-44', '1.29882e-40', '0', '0', '0', 'nan']
  DNAM[4] 0x00000001 (float 1.4013e-45)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000001 (float 1.4013e-45)
  NNAM[4] 0x000cdb56 (float 1.18071e-39)
SMQN 0x000cdb5b SolitudeBitsAndPiecesScenes
  PNAM[4] 0x000cdb5a (float 1.18071e-39)
  SNAM[4] 0x00000000 (float 0)
  CITC[4] 0x00000001 (float 1.4013e-45)
  CTDA[32] floats ['7.26636e-25', '1', '9.3887e-44', '1.29884e-40', '0', '0', '0', 'nan']
  DNAM[4] 0x00000001 (float 1.4013e-45)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000001 (float 1.4013e-45)
  NNAM[4] 0x000cd851 (float 1.17963e-39)
SMQN 0x000cd6dc CWEastmarchQuestFortSiegeNode
  PNAM[4] 0x000f838b (float 1.42472e-39)
  SNAM[4] 0x0010c5f4 (float 1.54038e-39)
  CITC[4] 0x00000009 (float 1.26117e-44)
  CTDA[32] floats ['1.1093e-23', '1', '7.91734e-43', '1.44362e-40', '0', '9.80909e-45', '0', '1.80515e-41']
  CTDA[32] floats ['1.1093e-23', '6.65471e-40', '8.49187e-43', '1.28945e-40', '2.42624e-40', '0', '0', 'nan']
  CTDA[32] floats ['1.1093e-23', '6.65471e-40', '8.49187e-43', '1.28938e-40', '2.42624e-40', '0', '0', 'nan']
  CTDA[32] floats ['1.1093e-23', '6.65471e-40', '8.49187e-43', '1.28936e-40', '2.42624e-40', '0', '0', 'nan']
  CTDA[32] floats ['1.1093e-23', '6.65471e-40', '8.49187e-43', '1.41454e-40', '2.42624e-40', '0', '0', 'nan']
  CTDA[32] floats ['1.1093e-23', '6.65471e-40', '8.49187e-43', '1.28939e-40', '2.42624e-40', '0', '0', 'nan']
  CTDA[32] floats ['1.1093e-23', '6.65471e-40', '8.49187e-43', '1.2894e-40', '2.42624e-40', '0', '0', 'nan']
  CTDA[32] floats ['1.1093e-23', '6.65471e-40', '8.49187e-43', '1.28932e-40', '2.42624e-40', '0', '0', 'nan']
  CTDA[32] floats ['1.10931e-23', '6.65471e-40', '8.49187e-43', '1.28933e-40', '2.42624e-40', '0', '0', 'nan']
  DNAM[4] 0x00000000 (float 0)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000001 (float 1.4013e-45)
  NNAM[4] 0x00083042 (float 7.51996e-40)
SMQN 0x000cd6db CWWinterholdQuestMission04Node
  PNAM[4] 0x000f838b (float 1.42472e-39)
  SNAM[4] 0x000cd6da (float 1.1791e-39)
  CITC[4] 0x0000000a (float 1.4013e-44)
  CTDA[32] floats ['1.1093e-23', '1', '7.91734e-43', '1.4438e-40', '0', '9.80909e-45', '0', '1.80515e-41']
  CTDA[32] floats ['1.1093e-23', '0', '8.81417e-43', '1.48632e-40', '0.0433219', '0', '0', 'nan']
  CIS2[22] 3a3a43574d697373696f6e3034446f6e655f76617200
  CTDA[32] floats ['1.1093e-23', '6.65471e-40', '8.49187e-43', '1.28945e-40', '2.42624e-40', '0', '0', 'nan']
  CTDA[32] floats ['1.1093e-23', '6.65471e-40', '8.49187e-43', '1.28938e-40', '2.42624e-40', '0', '0', 'nan']
  CTDA[32] floats ['1.1093e-23', '6.65471e-40', '8.49187e-43', '1.28936e-40', '2.42624e-40', '0', '0', 'nan']
  CTDA[32] floats ['1.10931e-23', '6.65471e-40', '8.49187e-43', '1.41454e-40', '2.42624e-40', '0', '0', 'nan']
  CTDA[32] floats ['1.10931e-23', '6.65471e-40', '8.49187e-43', '1.28939e-40', '2.42624e-40', '0', '0', 'nan']
  CTDA[32] floats ['1.10931e-23', '6.65471e-40', '8.49187e-43', '1.2894e-40', '2.42624e-40', '0', '0', 'nan']
  CTDA[32] floats ['1.10931e-23', '6.65471e-40', '8.49187e-43', '1.28932e-40', '2.42624e-40', '0', '0', 'nan']
  CTDA[32] floats ['1.10931e-23', '6.65471e-40', '8.49187e-43', '1.28933e-40', '2.42624e-40', '0', '0', 'nan']
  DNAM[4] 0x00000000 (float 0)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000001 (float 1.4013e-45)
  NNAM[4] 0x00035a23 (float 3.07841e-40)
SMQN 0x000cd6da CWRiftQuestFortSiegeNode
  PNAM[4] 0x000f838b (float 1.42472e-39)
  SNAM[4] 0x000cd6d9 (float 1.1791e-39)
  CITC[4] 0x0000000a (float 1.4013e-44)
  CTDA[32] floats ['1.1093e-23', '1', '7.91734e-43', '1.44365e-40', '0', '9.80909e-45', '0', '1.80515e-41']
  CTDA[32] floats ['1.1093e-23', '1', '8.81417e-43', '1.48632e-40', '0.043322', '0', '0', 'nan']
  CIS2[22] 3a3a43574d697373696f6e3037446f6e655f76617200
  CTDA[32] floats ['1.1093e-23', '6.65471e-40', '8.49187e-43', '1.28945e-40', '2.42624e-40', '0', '0', 'nan']
  CTDA[32] floats ['1.1093e-23', '6.65471e-40', '8.49187e-43', '1.28938e-40', '2.42624e-40', '0', '0', 'nan']
  CTDA[32] floats ['1.10931e-23', '6.65471e-40', '8.49187e-43', '1.28936e-40', '2.42624e-40', '0', '0', 'nan']
  CTDA[32] floats ['1.10931e-23', '6.65471e-40', '8.49187e-43', '1.41454e-40', '2.42624e-40', '0', '0', 'nan']
  CTDA[32] floats ['1.10931e-23', '6.65471e-40', '8.49187e-43', '1.28939e-40', '2.42624e-40', '0', '0', 'nan']
  CTDA[32] floats ['1.10931e-23', '6.65471e-40', '8.49187e-43', '1.2894e-40', '2.42624e-40', '0', '0', 'nan']
  CTDA[32] floats ['1.10931e-23', '6.65471e-40', '8.49187e-43', '1.28932e-40', '2.42624e-40', '0', '0', 'nan']
  CTDA[32] floats ['1.10931e-23', '6.65471e-40', '8.49187e-43', '1.28933e-40', '2.42624e-40', '0', '0', 'nan']
  DNAM[4] 0x00000000 (float 0)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000001 (float 1.4013e-45)
  NNAM[4] 0x00083042 (float 7.51996e-40)
SMQN 0x000cd6d9 CWRiftQuestMission07Node
  PNAM[4] 0x000f838b (float 1.42472e-39)
  SNAM[4] 0x000cd6d8 (float 1.1791e-39)
  CITC[4] 0x0000000a (float 1.4013e-44)
  CTDA[32] floats ['1.1093e-23', '1', '7.91734e-43', '1.44365e-40', '0', '9.80909e-45', '0', '1.80515e-41']
  CTDA[32] floats ['1.1093e-23', '0', '8.81417e-43', '1.48632e-40', '0.0433221', '0', '0', 'nan']
  CIS2[22] 3a3a43574d697373696f6e3037446f6e655f76617200
  CTDA[32] floats ['1.1093e-23', '6.65471e-40', '8.49187e-43', '1.28945e-40', '2.42624e-40', '0', '0', 'nan']
  CTDA[32] floats ['1.1093e-23', '6.65471e-40', '8.49187e-43', '1.28938e-40', '2.42624e-40', '0', '0', 'nan']
  CTDA[32] floats ['1.10931e-23', '6.65471e-40', '8.49187e-43', '1.28936e-40', '2.42624e-40', '0', '0', 'nan']
  CTDA[32] floats ['1.10931e-23', '6.65471e-40', '8.49187e-43', '1.41454e-40', '2.42624e-40', '0', '0', 'nan']
  CTDA[32] floats ['1.10931e-23', '6.65471e-40', '8.49187e-43', '1.28939e-40', '2.42624e-40', '0', '0', 'nan']
  CTDA[32] floats ['1.10931e-23', '6.65471e-40', '8.49187e-43', '1.2894e-40', '2.42624e-40', '0', '0', 'nan']
  CTDA[32] floats ['1.10931e-23', '6.65471e-40', '8.49187e-43', '1.28932e-40', '2.42624e-40', '0', '0', 'nan']
  CTDA[32] floats ['1.10931e-23', '6.65471e-40', '8.49187e-43', '1.28933e-40', '2.42624e-40', '0', '0', 'nan']
  DNAM[4] 0x00000000 (float 0)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000001 (float 1.4013e-45)
  NNAM[4] 0x000504f0 (float 4.60949e-40)
SMQN 0x000cd6d8 CWPaleQuestFortSiegeNode
  PNAM[4] 0x000f838b (float 1.42472e-39)
  SNAM[4] 0x000cd6d7 (float 1.1791e-39)
  CITC[4] 0x0000000a (float 1.4013e-44)
  CTDA[32] floats ['1.1093e-23', '1', '7.91734e-43', '1.44377e-40', '0', '9.80909e-45', '0', '1.80515e-41']
  CTDA[32] floats ['1.1093e-23', '1', '8.81417e-43', '1.48632e-40', '0.0433223', '0', '0', 'nan']
  CIS2[22] 3a3a43574d697373696f6e3033446f6e655f76617200
  CTDA[32] floats ['1.1093e-23', '6.65471e-40', '8.49187e-43', '1.28945e-40', '2.42624e-40', '0', '0', 'nan']
  CTDA[32] floats ['1.10931e-23', '6.65471e-40', '8.49187e-43', '1.28938e-40', '2.42624e-40', '0', '0', 'nan']
  CTDA[32] floats ['1.10931e-23', '6.65471e-40', '8.49187e-43', '1.28936e-40', '2.42624e-40', '0', '0', 'nan']
  CTDA[32] floats ['1.10931e-23', '6.65471e-40', '8.49187e-43', '1.41454e-40', '2.42624e-40', '0', '0', 'nan']
  CTDA[32] floats ['1.10931e-23', '6.65471e-40', '8.49187e-43', '1.28939e-40', '2.42624e-40', '0', '0', 'nan']
  CTDA[32] floats ['1.10931e-23', '6.65471e-40', '8.49187e-43', '1.2894e-40', '2.42624e-40', '0', '0', 'nan']
  CTDA[32] floats ['1.10931e-23', '6.65471e-40', '8.49187e-43', '1.28932e-40', '2.42624e-40', '0', '0', 'nan']
  CTDA[32] floats ['1.10931e-23', '6.65471e-40', '8.49187e-43', '1.28933e-40', '2.42624e-40', '0', '0', 'nan']
  DNAM[4] 0x00000000 (float 0)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000001 (float 1.4013e-45)
  NNAM[4] 0x00083042 (float 7.51996e-40)
SMQN 0x000cd6d7 CWPaleQuestMission03Node
  PNAM[4] 0x000f838b (float 1.42472e-39)
  SNAM[4] 0x00000000 (float 0)
  CITC[4] 0x0000000a (float 1.4013e-44)
  CTDA[32] floats ['1.1093e-23', '1', '7.91734e-43', '1.44377e-40', '0', '9.80909e-45', '0', '1.80515e-41']
  CTDA[32] floats ['1.1093e-23', '0', '8.81417e-43', '1.48632e-40', '0.0433224', '0', '0', 'nan']
  CIS2[22] 3a3a43574d697373696f6e3033446f6e655f76617200
  CTDA[32] floats ['1.1093e-23', '6.65471e-40', '8.49187e-43', '1.28945e-40', '2.42624e-40', '0', '0', 'nan']
  CTDA[32] floats ['1.10931e-23', '6.65471e-40', '8.49187e-43', '1.28938e-40', '2.42624e-40', '0', '0', 'nan']
  CTDA[32] floats ['1.10931e-23', '6.65471e-40', '8.49187e-43', '1.28936e-40', '2.42624e-40', '0', '0', 'nan']
  CTDA[32] floats ['1.10931e-23', '6.65471e-40', '8.49187e-43', '1.41454e-40', '2.42624e-40', '0', '0', 'nan']
  CTDA[32] floats ['1.10931e-23', '6.65471e-40', '8.49187e-43', '1.28939e-40', '2.42624e-40', '0', '0', 'nan']
  CTDA[32] floats ['1.10931e-23', '6.65471e-40', '8.49187e-43', '1.2894e-40', '2.42624e-40', '0', '0', 'nan']
  CTDA[32] floats ['1.10931e-23', '6.65471e-40', '8.49187e-43', '1.28932e-40', '2.42624e-40', '0', '0', 'nan']
  CTDA[32] floats ['1.10931e-23', '6.65471e-40', '8.49187e-43', '1.28933e-40', '2.42624e-40', '0', '0', 'nan']
  DNAM[4] 0x00000000 (float 0)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000001 (float 1.4013e-45)
  NNAM[4] 0x0003bcc4 (float 3.43223e-40)
SMQN 0x000cd6d6 CWHaafingarQuestFortSiegeNode
  PNAM[4] 0x000f838c (float 1.42472e-39)
  SNAM[4] 0x0010c5f7 (float 1.54038e-39)
  CITC[4] 0x00000009 (float 1.26117e-44)
  CTDA[32] floats ['1.1093e-23', '1', '7.91734e-43', '1.44373e-40', '0', '9.80909e-45', '0', '1.80515e-41']
  CTDA[32] floats ['1.1093e-23', '6.65472e-40', '8.49187e-43', '1.28945e-40', '2.42624e-40', '0', '0', 'nan']
  CTDA[32] floats ['1.1093e-23', '6.65472e-40', '8.49187e-43', '1.2894e-40', '2.42624e-40', '0', '0', 'nan']
  CTDA[32] floats ['1.1093e-23', '6.65472e-40', '8.49187e-43', '1.28932e-40', '2.42624e-40', '0', '0', 'nan']
  CTDA[32] floats ['1.1093e-23', '6.65472e-40', '8.49187e-43', '1.28939e-40', '2.42624e-40', '0', '0', 'nan']
  CTDA[32] floats ['1.1093e-23', '6.65472e-40', '8.49187e-43', '1.28938e-40', '2.42624e-40', '0', '0', 'nan']
  CTDA[32] floats ['1.1093e-23', '6.65472e-40', '8.49187e-43', '1.28935e-40', '2.42624e-40', '0', '0', 'nan']
  CTDA[32] floats ['1.1093e-23', '6.65472e-40', '8.49187e-43', '1.28936e-40', '2.42624e-40', '0', '0', 'nan']
  CTDA[32] floats ['1.10931e-23', '6.65472e-40', '8.49187e-43', '1.28942e-40', '2.42624e-40', '0', '0', 'nan']
  DNAM[4] 0x00000000 (float 0)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000001 (float 1.4013e-45)
  NNAM[4] 0x00083042 (float 7.51996e-40)
SMQN 0x000cd6d5 CWHjaalmarchQuestFortSiegeNode
  PNAM[4] 0x000f838c (float 1.42472e-39)
  SNAM[4] 0x000cd6d3 (float 1.17909e-39)
  CITC[4] 0x0000000a (float 1.4013e-44)
  CTDA[32] floats ['1.1093e-23', '1', '7.91734e-43', '1.44376e-40', '0', '9.80909e-45', '0', '1.80515e-41']
  CTDA[32] floats ['1.1093e-23', '1', '8.81417e-43', '1.48632e-40', '0.0433227', '0', '0', 'nan']
  CIS2[22] 3a3a43574d697373696f6e3033446f6e655f76617200
  CTDA[32] floats ['1.1093e-23', '6.65472e-40', '8.49187e-43', '1.28945e-40', '2.42624e-40', '0', '0', 'nan']
  CTDA[32] floats ['1.1093e-23', '6.65472e-40', '8.49187e-43', '1.2894e-40', '2.42624e-40', '0', '0', 'nan']
  CTDA[32] floats ['1.1093e-23', '6.65472e-40', '8.49187e-43', '1.28932e-40', '2.42624e-40', '0', '0', 'nan']
  CTDA[32] floats ['1.10931e-23', '6.65472e-40', '8.49187e-43', '1.28939e-40', '2.42624e-40', '0', '0', 'nan']
  CTDA[32] floats ['1.10932e-23', '6.65472e-40', '8.49187e-43', '1.28938e-40', '2.42624e-40', '0', '0', 'nan']
  CTDA[32] floats ['1.10932e-23', '6.65472e-40', '8.49187e-43', '1.28935e-40', '2.42624e-40', '0', '0', 'nan']
  CTDA[32] floats ['1.10932e-23', '6.65472e-40', '8.49187e-43', '1.28936e-40', '2.42624e-40', '0', '0', 'nan']
  CTDA[32] floats ['1.10931e-23', '6.65472e-40', '8.49187e-43', '1.28942e-40', '2.42624e-40', '0', '0', 'nan']
  DNAM[4] 0x00000000 (float 0)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000001 (float 1.4013e-45)
  NNAM[4] 0x00083042 (float 7.51996e-40)
SMQN 0x000cd6d4 CWReachQuestFortSiegeNode
  PNAM[4] 0x000f838c (float 1.42472e-39)
  SNAM[4] 0x000cd6d2 (float 1.17909e-39)
  CITC[4] 0x0000000a (float 1.4013e-44)
  CTDA[32] floats ['1.1093e-23', '1', '7.91734e-43', '1.4436e-40', '0', '9.80909e-45', '0', '1.80515e-41']
  CTDA[32] floats ['1.1093e-23', '1', '8.81417e-43', '1.48632e-40', '0.0433228', '0', '0', 'nan']
  CIS2[22] 3a3a43574d697373696f6e3037446f6e655f76617200
  CTDA[32] floats ['1.1093e-23', '6.65472e-40', '8.49187e-43', '1.28945e-40', '2.42624e-40', '0', '0', 'nan']
  CTDA[32] floats ['1.1093e-23', '6.65472e-40', '8.49187e-43', '1.2894e-40', '2.42624e-40', '0', '0', 'nan']
  CTDA[32] floats ['1.10931e-23', '6.65472e-40', '8.49187e-43', '1.28932e-40', '2.42624e-40', '0', '0', 'nan']
  CTDA[32] floats ['1.10932e-23', '6.65472e-40', '8.49187e-43', '1.28939e-40', '2.42624e-40', '0', '0', 'nan']
  CTDA[32] floats ['1.10932e-23', '6.65472e-40', '8.49187e-43', '1.28938e-40', '2.42624e-40', '0', '0', 'nan']
  CTDA[32] floats ['1.10932e-23', '6.65472e-40', '8.49187e-43', '1.28935e-40', '2.42624e-40', '0', '0', 'nan']
  CTDA[32] floats ['1.10932e-23', '6.65472e-40', '8.49187e-43', '1.28936e-40', '2.42624e-40', '0', '0', 'nan']
  CTDA[32] floats ['1.10931e-23', '6.65472e-40', '8.49187e-43', '1.28942e-40', '2.42624e-40', '0', '0', 'nan']
  DNAM[4] 0x00000000 (float 0)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000001 (float 1.4013e-45)
  NNAM[4] 0x00083042 (float 7.51996e-40)
SMQN 0x000cd6d3 CWHjaalmarchQuestMission03Node
  PNAM[4] 0x000f838c (float 1.42472e-39)
  SNAM[4] 0x000cd6d4 (float 1.17909e-39)
  CITC[4] 0x0000000a (float 1.4013e-44)
  CTDA[32] floats ['1.1093e-23', '1', '7.91734e-43', '1.44376e-40', '0', '9.80909e-45', '0', '1.80515e-41']
  CTDA[32] floats ['1.1093e-23', '0', '8.81417e-43', '1.48632e-40', '0.0433229', '0', '0', 'nan']
  CIS2[22] 3a3a43574d697373696f6e3033446f6e655f76617200
  CTDA[32] floats ['1.1093e-23', '6.65472e-40', '8.49187e-43', '1.28945e-40', '2.42624e-40', '0', '0', 'nan']
  CTDA[32] floats ['1.1093e-23', '6.65472e-40', '8.49187e-43', '1.2894e-40', '2.42624e-40', '0', '0', 'nan']
  CTDA[32] floats ['1.1093e-23', '6.65472e-40', '8.49187e-43', '1.28932e-40', '2.42624e-40', '0', '0', 'nan']
  CTDA[32] floats ['1.10931e-23', '6.65472e-40', '8.49187e-43', '1.28939e-40', '2.42624e-40', '0', '0', 'nan']
  CTDA[32] floats ['1.10932e-23', '6.65472e-40', '8.49187e-43', '1.28938e-40', '2.42624e-40', '0', '0', 'nan']
  CTDA[32] floats ['1.10932e-23', '6.65472e-40', '8.49187e-43', '1.28935e-40', '2.42624e-40', '0', '0', 'nan']
  CTDA[32] floats ['1.10932e-23', '6.65472e-40', '8.49187e-43', '1.28936e-40', '2.42624e-40', '0', '0', 'nan']
  CTDA[32] floats ['1.10931e-23', '6.65472e-40', '8.49187e-43', '1.28942e-40', '2.42624e-40', '0', '0', 'nan']
  DNAM[4] 0x00000000 (float 0)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000001 (float 1.4013e-45)
  NNAM[4] 0x0003bcc4 (float 3.43223e-40)
SMQN 0x000cd6d2 CWReachQuestMission07Node
  PNAM[4] 0x000f838c (float 1.42472e-39)
  SNAM[4] 0x000cd6d0 (float 1.17909e-39)
  CITC[4] 0x0000000a (float 1.4013e-44)
  CTDA[32] floats ['1.1093e-23', '1', '7.91734e-43', '1.4436e-40', '0', '9.80909e-45', '0', '1.80515e-41']
  CTDA[32] floats ['1.1093e-23', '0', '8.81417e-43', '1.48632e-40', '0.043323', '0', '0', 'nan']
  CIS2[22] 3a3a43574d697373696f6e3037446f6e655f76617200
  CTDA[32] floats ['1.1093e-23', '6.65472e-40', '8.49187e-43', '1.28945e-40', '2.42624e-40', '0', '0', 'nan']
  CTDA[32] floats ['1.1093e-23', '6.65472e-40', '8.49187e-43', '1.2894e-40', '2.42624e-40', '0', '0', 'nan']
  CTDA[32] floats ['1.10931e-23', '6.65472e-40', '8.49187e-43', '1.28932e-40', '2.42624e-40', '0', '0', 'nan']
  CTDA[32] floats ['1.10932e-23', '6.65472e-40', '8.49187e-43', '1.28939e-40', '2.42624e-40', '0', '0', 'nan']
  CTDA[32] floats ['1.10932e-23', '6.65472e-40', '8.49187e-43', '1.28938e-40', '2.42624e-40', '0', '0', 'nan']
  CTDA[32] floats ['1.10932e-23', '6.65472e-40', '8.49187e-43', '1.28935e-40', '2.42624e-40', '0', '0', 'nan']
  CTDA[32] floats ['1.10932e-23', '6.65472e-40', '8.49187e-43', '1.28936e-40', '2.42624e-40', '0', '0', 'nan']
  CTDA[32] floats ['1.10931e-23', '6.65472e-40', '8.49187e-43', '1.28942e-40', '2.42624e-40', '0', '0', 'nan']
  DNAM[4] 0x00000000 (float 0)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000001 (float 1.4013e-45)
  NNAM[4] 0x000504f0 (float 4.60949e-40)
SMQN 0x000cd6d0 CWFalkreathMission04Node
  PNAM[4] 0x000f838c (float 1.42472e-39)
  SNAM[4] 0x00000000 (float 0)
  CITC[4] 0x0000000a (float 1.4013e-44)
  CTDA[32] floats ['1.1093e-23', '1', '7.91734e-43', '1.44366e-40', '0', '9.80909e-45', '0', '1.80515e-41']
  CTDA[32] floats ['1.1093e-23', '0', '8.81417e-43', '1.48632e-40', '0.0433232', '0', '0', 'nan']
  CIS2[22] 3a3a43574d697373696f6e3034446f6e655f76617200
  CTDA[32] floats ['1.1093e-23', '6.65472e-40', '8.49187e-43', '1.28945e-40', '2.42624e-40', '0', '0', 'nan']
  CTDA[32] floats ['1.10931e-23', '6.65472e-40', '8.49187e-43', '1.2894e-40', '2.42624e-40', '0', '0', 'nan']
  CTDA[32] floats ['1.10932e-23', '6.65472e-40', '8.49187e-43', '1.28932e-40', '2.42624e-40', '0', '0', 'nan']
  CTDA[32] floats ['1.10932e-23', '6.65472e-40', '8.49187e-43', '1.28939e-40', '2.42624e-40', '0', '0', 'nan']
  CTDA[32] floats ['1.10932e-23', '6.65472e-40', '8.49187e-43', '1.28938e-40', '2.42624e-40', '0', '0', 'nan']
  CTDA[32] floats ['1.10932e-23', '6.65472e-40', '8.49187e-43', '1.28935e-40', '2.42624e-40', '0', '0', 'nan']
  CTDA[32] floats ['1.10932e-23', '6.65472e-40', '8.49187e-43', '1.28936e-40', '2.42624e-40', '0', '0', 'nan']
  CTDA[32] floats ['1.10931e-23', '6.65472e-40', '8.49187e-43', '1.28942e-40', '2.42624e-40', '0', '0', 'nan']
  DNAM[4] 0x00000000 (float 0)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000001 (float 1.4013e-45)
  NNAM[4] 0x00035a23 (float 3.07841e-40)
SMQN 0x000c7d0d SolitudeStreetScenes
  PNAM[4] 0x00035246 (float 3.05021e-40)
  SNAM[4] 0x00035250 (float 3.05035e-40)
  CITC[4] 0x00000000 (float 0)
  DNAM[4] 0x00010001 (float 9.18369e-41)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000007 (float 9.80909e-45)
  NNAM[4] 0x000c7cfd (float 1.14686e-39)
  NNAM[4] 0x000c7d04 (float 1.14687e-39)
  NNAM[4] 0x000c7d06 (float 1.14688e-39)
  NNAM[4] 0x000c7f58 (float 1.14771e-39)
  NNAM[4] 0x000c7f55 (float 1.1477e-39)
  NNAM[4] 0x000c7f53 (float 1.1477e-39)
  NNAM[4] 0x000c7f51 (float 1.1477e-39)
SMQN 0x000bd721 MS04IncreaseLevelNodeSHARES
  PNAM[4] 0x0005bd79 (float 5.27147e-40)
  SNAM[4] 0x000c4cc5 (float 1.12957e-39)
  CITC[4] 0x00000001 (float 1.4013e-45)
  CTDA[32] floats ['8.07768e-23', '1.08737e-39', '1.12104e-43', '0', '0', '2.8026e-45', '2.8026e-44', 'nan']
  DNAM[4] 0x00020002 (float 1.83674e-40)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000001 (float 1.4013e-45)
  NNAM[4] 0x000209ca (float 1.87183e-40)
SMQN 0x000bc3f2 PartyScenes
  PNAM[4] 0x000bc3ee (float 1.08048e-39)
  SNAM[4] 0x00000000 (float 0)
  CITC[4] 0x00000000 (float 0)
  DNAM[4] 0x00000000 (float 0)
  XNAM[4] 0x00000002 (float 2.8026e-45)
  QNAM[4] 0x00000003 (float 4.2039e-45)
  NNAM[4] 0x000bc3e0 (float 1.08046e-39)
  RNAM[4] 0x4019999a (float 2.4)
  NNAM[4] 0x000bc3fd (float 1.0805e-39)
  RNAM[4] 0x4099999a (float 4.8)
  NNAM[4] 0x000bf25b (float 1.09713e-39)
  RNAM[4] 0x4099999a (float 4.8)
SMQN 0x000b812f MG01ShoutNode
  PNAM[4] 0x00046829 (float 4.04708e-40)
  SNAM[4] 0x00070216 (float 6.43597e-40)
  CITC[4] 0x00000003 (float 4.2039e-45)
  CTDA[32] floats ['4.03629e-26', '1', '8.07148e-43', '2.88128e-09', '1.29089e-40', '0', '0', 'nan']
  CTDA[32] floats ['4.03629e-26', '1', '8.81417e-43', '1.78762e-40', '6.59958', '0', '0', 'nan']
  CIS2[19] 3a3a53686f7574547269676765725f76617200
  CTDA[32] floats ['4.03629e-26', '1', '8.81417e-43', '1.78762e-40', '6.59955', '0', '0', 'nan']
  CIS2[22] 3a3a57616974696e67466f7253686f75745f76617200
  DNAM[4] 0x00000000 (float 0)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000001 (float 1.4013e-45)
  NNAM[4] 0x000b812e (float 1.05653e-39)
SMQN 0x000b39a5 MQResurrectDragonNode
  PNAM[4] 0x0001379a (float 1.11782e-40)
  SNAM[4] 0x00046b8d (float 4.05924e-40)
  CITC[4] 0x00000001 (float 1.4013e-45)
  CTDA[32] floats ['4.0444e-25', '1', '8.07148e-43', '2.95404e-09', '1.03087e-39', '0', '0', 'nan']
  DNAM[4] 0x00000000 (float 0)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000001 (float 1.4013e-45)
  NNAM[4] 0x000b3991 (float 1.03084e-39)
SMQN 0x000b2442 SolitudeBluePalaceConvoScenes
  PNAM[4] 0x000b2441 (float 1.0232e-39)
  SNAM[4] 0x00000000 (float 0)
  CITC[4] 0x00000000 (float 0)
  DNAM[4] 0x00000001 (float 1.4013e-45)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x0000000a (float 1.4013e-44)
  NNAM[4] 0x000367f7 (float 3.12802e-40)
  NNAM[4] 0x000a958e (float 9.72005e-40)
  NNAM[4] 0x000367f8 (float 3.12803e-40)
  NNAM[4] 0x000367f9 (float 3.12805e-40)
  NNAM[4] 0x000367fa (float 3.12806e-40)
  NNAM[4] 0x000a9392 (float 9.71293e-40)
  NNAM[4] 0x000a93b0 (float 9.71335e-40)
  NNAM[4] 0x000a940a (float 9.71461e-40)
  NNAM[4] 0x000a9564 (float 9.71946e-40)
  NNAM[4] 0x000a9575 (float 9.7197e-40)
SMQN 0x000aefa6 CRReconKickerNode
  PNAM[4] 0x000bfc76 (float 1.10076e-39)
  SNAM[4] 0x00000000 (float 0)
  CITC[4] 0x00000001 (float 1.4013e-45)
  CTDA[32] floats ['2.08387e-23', '1', '8.07148e-43', '2.95404e-09', '1.00432e-39', '0', '0', 'nan']
  DNAM[4] 0x00020000 (float 1.83671e-40)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000001 (float 1.4013e-45)
  NNAM[4] 0x000aef91 (float 1.0043e-39)
SMQN 0x000adff2 dunValtheimKeepQSTnode
  PNAM[4] 0x00030b13 (float 2.79479e-40)
  SNAM[4] 0x0008356b (float 7.53847e-40)
  CITC[4] 0x00000001 (float 1.4013e-45)
  CTDA[32] floats ['1.12644e-27', '1', '5.03066e-43', '1.44481e-40', '0', '0', '0', 'nan']
  DNAM[4] 0x00020000 (float 1.83671e-40)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000001 (float 1.4013e-45)
  NNAM[4] 0x000adfe7 (float 9.98676e-40)
SMQN 0x000ad97b MorthalHighmoonHallScenes
  PNAM[4] 0x000443a2 (float 3.91604e-40)
  SNAM[4] 0x0004b2c8 (float 4.31477e-40)
  CITC[4] 0x00000001 (float 1.4013e-45)
  CTDA[32] floats ['3.79196e-27', '1', '9.3887e-44', '1.1221e-40', '0', '9.80909e-45', '0', '1.76928e-41']
  DNAM[4] 0x00000001 (float 1.4013e-45)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000007 (float 9.80909e-45)
  NNAM[4] 0x000ad953 (float 9.96316e-40)
  NNAM[4] 0x000ad94a (float 9.96304e-40)
  NNAM[4] 0x000ad90b (float 9.96215e-40)
  NNAM[4] 0x000ad907 (float 9.9621e-40)
  NNAM[4] 0x000aedde (float 1.00369e-39)
  NNAM[4] 0x000aede7 (float 1.0037e-39)
  NNAM[4] 0x000aeea4 (float 1.00396e-39)
SMQN 0x000a8aba WICastMagicNonHostileReactionNode
  PNAM[4] 0x00046829 (float 4.04708e-40)
  SNAM[4] 0x00000000 (float 0)
  CITC[4] 0x00000000 (float 0)
  DNAM[4] 0x00020000 (float 1.83671e-40)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000001 (float 1.4013e-45)
  NNAM[4] 0x000a8a86 (float 9.68048e-40)
SMQN 0x000a71ab ReachcliffCaveScenes
  PNAM[4] 0x00015fce (float 1.26204e-40)
  SNAM[4] 0x000340cf (float 2.98755e-40)
  CITC[4] 0x00000001 (float 1.4013e-45)
  CTDA[32] floats ['7.84645e-25', '1', '5.03066e-43', '1.44415e-40', '0', '9.80909e-45', '0', '1.76928e-41']
  DNAM[4] 0x00010001 (float 9.18369e-41)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000006 (float 8.40779e-45)
  NNAM[4] 0x000a71a9 (float 9.59129e-40)
  RNAM[4] 0x44100000 (float 576)
  NNAM[4] 0x000a71a7 (float 9.59126e-40)
  RNAM[4] 0x44100000 (float 576)
  NNAM[4] 0x000a7185 (float 9.59078e-40)
  RNAM[4] 0x44100000 (float 576)
  NNAM[4] 0x000a7242 (float 9.59343e-40)
  RNAM[4] 0x44100000 (float 576)
  NNAM[4] 0x000a7240 (float 9.5934e-40)
  RNAM[4] 0x44100000 (float 576)
  NNAM[4] 0x000a71ac (float 9.59133e-40)
  RNAM[4] 0x44100000 (float 576)
SMQN 0x000940db FavorChangeLocationMorthal
  PNAM[4] 0x000b2440 (float 1.02319e-39)
  SNAM[4] 0x000940d9 (float 8.49782e-40)
  CITC[4] 0x00000001 (float 1.4013e-45)
  CTDA[32] floats ['6.26313e-24', '1', '8.07148e-43', '1.18744e-08', '1.41457e-40', '0', '0', 'nan']
  DNAM[4] 0x00060000 (float 5.51013e-40)
  XNAM[4] 0x00000000 (float 0)
  MNAM[4] 0x00000004 (float 5.60519e-45)
  QNAM[4] 0x00000004 (float 5.60519e-45)
  NNAM[4] 0x000a34ce (float 9.37298e-40)
  NNAM[4] 0x000403b0 (float 3.68665e-40)
  NNAM[4] 0x000ca210 (float 1.16016e-39)
  NNAM[4] 0x000ca439 (float 1.16094e-39)
SMQN 0x000940d9 FavorChangeLocationWinterhold
  PNAM[4] 0x000b2440 (float 1.02319e-39)
  SNAM[4] 0x0006901c (float 6.0271e-40)
  CITC[4] 0x00000001 (float 1.4013e-45)
  CTDA[32] floats ['6.26313e-24', '1', '8.07148e-43', '1.18744e-08', '1.41454e-40', '0', '0', 'nan']
  DNAM[4] 0x00060000 (float 5.51013e-40)
  XNAM[4] 0x00000000 (float 0)
  MNAM[4] 0x00000004 (float 5.60519e-45)
  QNAM[4] 0x00000004 (float 5.60519e-45)
  NNAM[4] 0x000940d0 (float 8.4977e-40)
  NNAM[4] 0x000ca209 (float 1.16015e-39)
  NNAM[4] 0x0003f46a (float 3.63186e-40)
  NNAM[4] 0x000a34d7 (float 9.3731e-40)
SMQN 0x0006901c FavorChangeLocationKynesgrove
  PNAM[4] 0x000b2440 (float 1.02319e-39)
  SNAM[4] 0x00068ffc (float 6.02665e-40)
  CITC[4] 0x00000001 (float 1.4013e-45)
  CTDA[32] floats ['4.92136e-25', '1', '8.07148e-43', '1.18744e-08', '1.4145e-40', '0', '0', 'nan']
  DNAM[4] 0x00060000 (float 5.51013e-40)
  XNAM[4] 0x00000000 (float 0)
  MNAM[4] 0x00000003 (float 4.2039e-45)
  QNAM[4] 0x00000003 (float 4.2039e-45)
  NNAM[4] 0x000ca209 (float 1.16015e-39)
  NNAM[4] 0x0006fe37 (float 6.42208e-40)
  NNAM[4] 0x00069043 (float 6.02764e-40)
SMQN 0x00068ffc FavorChangeLocationDarkwaterCrossing
  PNAM[4] 0x000b2440 (float 1.02319e-39)
  SNAM[4] 0x00079b2b (float 6.98512e-40)
  CITC[4] 0x00000001 (float 1.4013e-45)
  CTDA[32] floats ['4.92136e-25', '1', '8.07148e-43', '1.18744e-08', '1.41448e-40', '0', '0', 'nan']
  DNAM[4] 0x00060000 (float 5.51013e-40)
  XNAM[4] 0x00000000 (float 0)
  MNAM[4] 0x00000002 (float 2.8026e-45)
  QNAM[4] 0x00000002 (float 2.8026e-45)
  NNAM[4] 0x0006fd35 (float 6.41847e-40)
  NNAM[4] 0x000403b0 (float 3.68665e-40)
SMQN 0x0004f594 WICraftItemNode
  PNAM[4] 0x0004f593 (float 4.55437e-40)
  SNAM[4] 0x00000000 (float 0)
  CITC[4] 0x00000000 (float 0)
  DNAM[4] 0x00030001 (float 2.75508e-40)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000003 (float 4.2039e-45)
  NNAM[4] 0x0003c7a0 (float 3.47118e-40)
  RNAM[4] 0x41400000 (float 12)
  NNAM[4] 0x0009bb1e (float 8.93644e-40)
  RNAM[4] 0x41400000 (float 12)
  NNAM[4] 0x0009bb27 (float 8.93657e-40)
  RNAM[4] 0x41400000 (float 12)
SMQN 0x00037fbe WIAssautRememberNode
  PNAM[4] 0x0002c494 (float 2.5419e-40)
  SNAM[4] 0x0002e3ff (float 2.65461e-40)
  CITC[4] 0x00000002 (float 2.8026e-45)
  CTDA[32] floats ['8.81303e-25', '0', '5.03066e-43', '1.4446e-40', '0', '2.8026e-45', '2.8026e-44', 'nan']
  CTDA[32] floats ['8.81319e-25', '3.21342e-40', '1.079e-43', '0', '0', '0', '0', 'nan']
  DNAM[4] 0x00020000 (float 1.83671e-40)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000001 (float 1.4013e-45)
  NNAM[4] 0x00037f13 (float 3.21092e-40)
SMQN 0x00023f1b WIChangeLocationThiefNode
  PNAM[4] 0x0001320e (float 1.09792e-40)
  SNAM[4] 0x000c791b (float 1.14547e-39)
  CITC[4] 0x00000005 (float 7.00649e-45)
  CTDA[32] floats ['2.17222e-26', '5', '1.12104e-43', '0', '0', '2.8026e-45', '2.8026e-44', 'nan']
  CTDA[32] floats ['2.17221e-26', '1', '8.26766e-44', '1.91325e-40', '2.8026e-43', '0', '0', 'nan']
  CTDA[32] floats ['2.17223e-26', '2.06523e-40', '1.079e-43', '0', '0', '0', '0', 'nan']
  CTDA[32] floats ['2.17222e-26', '22', '1.03696e-43', '7.84727e-44', '0', '0', '0', 'nan']
  CTDA[32] floats ['2.17223e-26', '4', '1.03696e-43', '7.84727e-44', '0', '0', '0', 'nan']
  DNAM[4] 0x00030001 (float 2.75508e-40)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000001 (float 1.4013e-45)
  NNAM[4] 0x00023eeb (float 2.06242e-40)
SMQN 0x00090e55 FavorChangeLocationAngasMill
  PNAM[4] 0x000b2440 (float 1.02319e-39)
  SNAM[4] 0x00090e34 (float 8.31615e-40)
  CITC[4] 0x00000001 (float 1.4013e-45)
  CTDA[32] floats ['9.44149e-23', '1', '8.07148e-43', '1.18744e-08', '1.42253e-40', '0', '0', 'nan']
  DNAM[4] 0x00040000 (float 3.67342e-40)
  XNAM[4] 0x00000000 (float 0)
  MNAM[4] 0x00000001 (float 1.4013e-45)
  QNAM[4] 0x00000001 (float 1.4013e-45)
  NNAM[4] 0x000403b0 (float 3.68665e-40)
SMQN 0x00090e34 FavorChangeLocationDawnstar
  PNAM[4] 0x000b2440 (float 1.02319e-39)
  SNAM[4] 0x00055660 (float 4.90163e-40)
  CITC[4] 0x00000001 (float 1.4013e-45)
  CTDA[32] floats ['8.91123e-25', '1', '8.07148e-43', '1.18744e-08', '1.41453e-40', '0', '0', 'nan']
  DNAM[4] 0x00060000 (float 5.51013e-40)
  XNAM[4] 0x00000000 (float 0)
  MNAM[4] 0x00000005 (float 7.00649e-45)
  QNAM[4] 0x00000005 (float 7.00649e-45)
  NNAM[4] 0x000ca439 (float 1.16094e-39)
  NNAM[4] 0x0006fe37 (float 6.42208e-40)
  NNAM[4] 0x000a34d4 (float 9.37306e-40)
  NNAM[4] 0x00090e36 (float 8.31617e-40)
  NNAM[4] 0x00094152 (float 8.49952e-40)
SMQN 0x00085472 SolitudeWellsRandomScenes
  PNAM[4] 0x00035245 (float 3.05019e-40)
  SNAM[4] 0x0003524c (float 3.05029e-40)
  CITC[4] 0x00000000 (float 0)
  DNAM[4] 0x00000001 (float 1.4013e-45)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000002 (float 2.8026e-45)
  NNAM[4] 0x000358ca (float 3.07358e-40)
  NNAM[4] 0x000367bb (float 3.12718e-40)
SMQN 0x0008356b duhHunterQSTnode
  PNAM[4] 0x00030b13 (float 2.79479e-40)
  SNAM[4] 0x00013595 (float 1.11057e-40)
  CITC[4] 0x00000001 (float 1.4013e-45)
  CTDA[32] floats ['4.93855e-29', '1', '5.03066e-43', '1.22485e-39', '0', '0', '0', 'nan']
  DNAM[4] 0x00020000 (float 1.83671e-40)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000000 (float 0)
SMQN 0x00079b2b FavorChangeLocationNarzulbur
  PNAM[4] 0x000b2440 (float 1.02319e-39)
  SNAM[4] 0x0006fd0f (float 6.41793e-40)
  CITC[4] 0x00000001 (float 1.4013e-45)
  CTDA[32] floats ['1.80304e-23', '1', '8.07148e-43', '1.18744e-08', '1.44393e-40', '0', '0', 'nan']
  DNAM[4] 0x00060000 (float 5.51013e-40)
  XNAM[4] 0x00000000 (float 0)
  MNAM[4] 0x00000001 (float 1.4013e-45)
  QNAM[4] 0x00000001 (float 1.4013e-45)
  NNAM[4] 0x000ca210 (float 1.16016e-39)
SMQN 0x000705bc FavorChangeLocationFalkreath
  PNAM[4] 0x000b2440 (float 1.02319e-39)
  SNAM[4] 0x0006fd99 (float 6.41987e-40)
  CITC[4] 0x00000001 (float 1.4013e-45)
  CTDA[32] floats ['7.74598e-25', '1', '8.07148e-43', '1.18744e-08', '1.41443e-40', '0', '0', 'nan']
  DNAM[4] 0x00060000 (float 5.51013e-40)
  XNAM[4] 0x00000000 (float 0)
  MNAM[4] 0x00000006 (float 8.40779e-45)
  QNAM[4] 0x00000006 (float 8.40779e-45)
  NNAM[4] 0x000403b0 (float 3.68665e-40)
  NNAM[4] 0x0006fe37 (float 6.42208e-40)
  NNAM[4] 0x000ca439 (float 1.16094e-39)
  NNAM[4] 0x0007172a (float 6.51158e-40)
  NNAM[4] 0x000a34de (float 9.3732e-40)
  NNAM[4] 0x0003f46a (float 3.63186e-40)
SMQN 0x0006fd99 FavorChangeLocatiomSolitude
  PNAM[4] 0x000b2440 (float 1.02319e-39)
  SNAM[4] 0x000c2b6b (float 1.1176e-39)
  CITC[4] 0x00000001 (float 1.4013e-45)
  CTDA[32] floats ['6.26313e-24', '1', '8.07148e-43', '1.18744e-08', '1.41467e-40', '0', '0', 'nan']
  DNAM[4] 0x00060000 (float 5.51013e-40)
  XNAM[4] 0x00000000 (float 0)
  MNAM[4] 0x00000006 (float 8.40779e-45)
  QNAM[4] 0x00000006 (float 8.40779e-45)
  NNAM[4] 0x0006fd35 (float 6.41847e-40)
  NNAM[4] 0x0006fe37 (float 6.42208e-40)
  NNAM[4] 0x000ca209 (float 1.16015e-39)
  NNAM[4] 0x000a2c9b (float 9.34356e-40)
  NNAM[4] 0x000940e0 (float 8.49792e-40)
  NNAM[4] 0x000ca439 (float 1.16094e-39)
SMQN 0x0006fd0f FavorChangeLocationMorKhazgur
  PNAM[4] 0x000b2440 (float 1.02319e-39)
  SNAM[4] 0x0006c829 (float 6.22817e-40)
  CITC[4] 0x00000001 (float 1.4013e-45)
  CTDA[32] floats ['3.40994e-23', '1', '8.07148e-43', '1.18744e-08', '1.44384e-40', '0', '0', 'nan']
  DNAM[4] 0x00060000 (float 5.51013e-40)
  XNAM[4] 0x00000000 (float 0)
  MNAM[4] 0x00000001 (float 1.4013e-45)
  QNAM[4] 0x00000001 (float 1.4013e-45)
  NNAM[4] 0x000ca210 (float 1.16016e-39)
SMQN 0x0006c829 FavorChangeLocationDushnikhYal
  PNAM[4] 0x000b2440 (float 1.02319e-39)
  SNAM[4] 0x00090e55 (float 8.31661e-40)
  CITC[4] 0x00000001 (float 1.4013e-45)
  CTDA[32] floats ['9.44149e-23', '1', '8.07148e-43', '1.18744e-08', '1.4401e-40', '0', '0', 'nan']
  DNAM[4] 0x00060000 (float 5.51013e-40)
  XNAM[4] 0x00000000 (float 0)
  MNAM[4] 0x00000001 (float 1.4013e-45)
  QNAM[4] 0x00000001 (float 1.4013e-45)
  NNAM[4] 0x000ca210 (float 1.16016e-39)
SMQN 0x0006bc1b MS10PostQuestOfficeSwap
  PNAM[4] 0x00090028 (float 8.26576e-40)
  SNAM[4] 0x000a31f1 (float 9.36271e-40)
  CITC[4] 0x00000003 (float 4.2039e-45)
  CTDA[32] floats ['7.51715e-25', '1', '8.07148e-43', '1.18744e-08', '1.41462e-40', '2.8026e-45', '2.8026e-44', 'nan']
  CTDA[32] floats ['7.51715e-25', '0', '8.07148e-43', '2.96859e-09', '1.41462e-40', '2.8026e-45', '2.8026e-44', 'nan']
  CTDA[32] floats ['7.51715e-25', '1', '7.60905e-43', '1.70751e-40', '0', '0', '0', 'nan']
  DNAM[4] 0x00020000 (float 1.83671e-40)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000001 (float 1.4013e-45)
  NNAM[4] 0x0006bc1a (float 6.18491e-40)
SMQN 0x000647a9 FreeformMarkarthMPostNode
  PNAM[4] 0x0009002b (float 8.2658e-40)
  SNAM[4] 0x0009002d (float 8.26583e-40)
  CITC[4] 0x00000002 (float 2.8026e-45)
  CTDA[32] floats ['1.76779e-27', '1', '8.26766e-44', '5.76696e-40', '2.8026e-44', '0', '0', 'nan']
  CTDA[32] floats ['1.76779e-27', '1', '8.07148e-43', '2.96859e-09', '1.41465e-40', '0', '0', 'nan']
  DNAM[4] 0x00020000 (float 1.83671e-40)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000001 (float 1.4013e-45)
  NNAM[4] 0x000647a6 (float 5.76716e-40)
SMQN 0x00055aa7 MarkarthPostAttackSceneNode
  PNAM[4] 0x0009002b (float 8.2658e-40)
  SNAM[4] 0x0005ce30 (float 5.33144e-40)
  CITC[4] 0x00000002 (float 2.8026e-45)
  CTDA[32] floats ['1.03763e-35', '1', '8.26766e-44', '1.00709e-39', '7.00649e-43', '0', '0', 'nan']
  CTDA[32] floats ['1.03763e-35', '1', '8.07148e-43', '2.96859e-09', '1.41465e-40', '0', '0', 'nan']
  DNAM[4] 0x00020000 (float 1.83671e-40)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000001 (float 1.4013e-45)
  NNAM[4] 0x00055a76 (float 4.91629e-40)
SMQN 0x00055660 FavorChangeLocationDragonBridge
  PNAM[4] 0x000b2440 (float 1.02319e-39)
  SNAM[4] 0x000705bc (float 6.44906e-40)
  CITC[4] 0x00000001 (float 1.4013e-45)
  CTDA[32] floats ['2.21866e-25', '1', '8.07148e-43', '1.18744e-08', '1.41439e-40', '0', '0', 'nan']
  DNAM[4] 0x00060000 (float 5.51013e-40)
  XNAM[4] 0x00000000 (float 0)
  MNAM[4] 0x00000001 (float 1.4013e-45)
  QNAM[4] 0x00000001 (float 1.4013e-45)
  NNAM[4] 0x000555dd (float 4.89979e-40)
SMQN 0x00047027 BardSongScriptNode
  PNAM[4] 0x0001379a (float 1.11782e-40)
  SNAM[4] 0x000763ec (float 6.78694e-40)
  CITC[4] 0x00000001 (float 1.4013e-45)
  CTDA[32] floats ['1.02575e-35', '1', '8.07148e-43', '2.95404e-09', '4.07569e-40', '0', '0', 'nan']
  DNAM[4] 0x00000000 (float 0)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000001 (float 1.4013e-45)
  NNAM[4] 0x00074a55 (float 6.69514e-40)
SMQN 0x0003fbd2 WindhelmMarketScenes
  PNAM[4] 0x0004b2e1 (float 4.31512e-40)
  SNAM[4] 0x0004b2e9 (float 4.31523e-40)
  CITC[4] 0x00000002 (float 2.8026e-45)
  CTDA[32] floats ['1.29722e-24', '1', '3.57331e-43', '0', '0', '9.80909e-45', '0', '1.76928e-41']
  CTDA[32] floats ['1.29722e-24', '1', '3.57331e-43', '0', '0', '9.80909e-45', '0', '1.80515e-41']
  DNAM[4] 0x00000001 (float 1.4013e-45)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000009 (float 1.26117e-44)
  NNAM[4] 0x0003ee50 (float 3.60997e-40)
  RNAM[4] 0x44100000 (float 576)
  NNAM[4] 0x0003ee5b (float 3.61012e-40)
  RNAM[4] 0x44100000 (float 576)
  NNAM[4] 0x0003ee60 (float 3.61019e-40)
  RNAM[4] 0x44100000 (float 576)
  NNAM[4] 0x0003ee77 (float 3.61052e-40)
  RNAM[4] 0x44100000 (float 576)
  NNAM[4] 0x0003ee7b (float 3.61057e-40)
  RNAM[4] 0x44100000 (float 576)
  NNAM[4] 0x0003ee7d (float 3.6106e-40)
  RNAM[4] 0x44100000 (float 576)
  NNAM[4] 0x0003efba (float 3.61504e-40)
  RNAM[4] 0x44100000 (float 576)
  NNAM[4] 0x0003efbc (float 3.61507e-40)
  RNAM[4] 0x44100000 (float 576)
  NNAM[4] 0x0003efc1 (float 3.61514e-40)
  RNAM[4] 0x44100000 (float 576)
SMQN 0x0003f4c4 FavorChangeLocationWindhelm
  PNAM[4] 0x000b2440 (float 1.02319e-39)
  SNAM[4] 0x000c0609 (float 1.10419e-39)
  CITC[4] 0x00000001 (float 1.4013e-45)
  CTDA[32] floats ['4.93901e-29', '1', '8.07148e-43', '1.18744e-08', '1.41462e-40', '0', '0', 'nan']
  DNAM[4] 0x00060000 (float 5.51013e-40)
  XNAM[4] 0x00000000 (float 0)
  MNAM[4] 0x0000000b (float 1.54143e-44)
  QNAM[4] 0x0000000b (float 1.54143e-44)
  NNAM[4] 0x0003f46a (float 3.63186e-40)
  NNAM[4] 0x000ca209 (float 1.16015e-39)
  NNAM[4] 0x0003f4ec (float 3.63368e-40)
  NNAM[4] 0x000403b0 (float 3.68665e-40)
  NNAM[4] 0x000ca210 (float 1.16016e-39)
  NNAM[4] 0x000a2ca6 (float 9.34372e-40)
  NNAM[4] 0x00094158 (float 8.4996e-40)
  NNAM[4] 0x000ca439 (float 1.16094e-39)
  NNAM[4] 0x0006fd35 (float 6.41847e-40)
  NNAM[4] 0x0006fe37 (float 6.42208e-40)
  NNAM[4] 0x0007105b (float 6.48716e-40)
SMQN 0x00013595 dunBrokenFangCaveNode
  PNAM[4] 0x00030b13 (float 2.79479e-40)
  SNAM[4] 0x000e7a30 (float 1.32953e-39)
  CITC[4] 0x00000001 (float 1.4013e-45)
  CTDA[32] floats ['1.85312e-23', '1', '5.03066e-43', '1.4396e-40', '0', '0', '0', 'nan']
  DNAM[4] 0x00020000 (float 1.83671e-40)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000000 (float 0)
SMQN 0x000e7a30 dunGeirmundsNode
  PNAM[4] 0x00030b13 (float 2.79479e-40)
  SNAM[4] 0x00000000 (float 0)
  CITC[4] 0x00000001 (float 1.4013e-45)
  CTDA[32] floats ['3.25105e-35', '1', '5.03066e-43', '1.44042e-40', '0', '0', '0', 'nan']
  DNAM[4] 0x00020000 (float 1.83671e-40)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000001 (float 1.4013e-45)
  NNAM[4] 0x000e738f (float 1.32715e-39)
SMQN 0x000e76e4 HighHrothgarNode
  PNAM[4] 0x00090028 (float 8.26576e-40)
  SNAM[4] 0x000e6802 (float 1.32301e-39)
  CITC[4] 0x00000001 (float 1.4013e-45)
  CTDA[32] floats ['2.72979e-35', '1', '8.07148e-43', '1.18744e-08', '1.42848e-40', '0', '0', 'nan']
  DNAM[4] 0x00020000 (float 1.83671e-40)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000001 (float 1.4013e-45)
  NNAM[4] 0x000e76de (float 1.32834e-39)
SMQN 0x000e6def SkyhavenTempleScenes
  PNAM[4] 0x001092de (float 1.52205e-39)
  SNAM[4] 0x000e6def (float 1.32513e-39)
  CITC[4] 0x00000000 (float 0)
  DNAM[4] 0x00010001 (float 9.18369e-41)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000004 (float 5.60519e-45)
  NNAM[4] 0x000e6de7 (float 1.32512e-39)
  RNAM[4] 0x44100000 (float 576)
  NNAM[4] 0x000e6de9 (float 1.32513e-39)
  RNAM[4] 0x44100000 (float 576)
  NNAM[4] 0x000e6deb (float 1.32513e-39)
  RNAM[4] 0x44100000 (float 576)
  NNAM[4] 0x000e6ded (float 1.32513e-39)
  RNAM[4] 0x44100000 (float 576)
SMQN 0x000e6802 SkyHavenTempleNode
  PNAM[4] 0x00090028 (float 8.26576e-40)
  SNAM[4] 0x000d1eeb (float 1.20495e-39)
  CITC[4] 0x00000001 (float 1.4013e-45)
  CTDA[32] floats ['2.72979e-35', '1', '8.07148e-43', '1.18744e-08', '1.42868e-40', '0', '0', 'nan']
  DNAM[4] 0x00020000 (float 1.83671e-40)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000001 (float 1.4013e-45)
  NNAM[4] 0x000e3e67 (float 1.30808e-39)
SMQN 0x000e2514 MS02ThonarEscapeSceneNode
  PNAM[4] 0x00090028 (float 8.26576e-40)
  SNAM[4] 0x00054881 (float 4.85187e-40)
  CITC[4] 0x00000003 (float 4.2039e-45)
  CTDA[32] floats ['1.85911e-33', '1', '6.44597e-44', '0', '0', '2.8026e-45', '1.46752e-40', 'nan']
  CTDA[32] floats ['1.85911e-33', '1', '7.84727e-44', '3.71061e-40', '0', '0', '0', 'nan']
  CTDA[32] floats ['1.85911e-33', '1', '8.07148e-43', '1.18744e-08', '1.41465e-40', '0', '0', 'nan']
  DNAM[4] 0x00020000 (float 1.83671e-40)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000001 (float 1.4013e-45)
  NNAM[4] 0x0006a9a0 (float 6.11863e-40)
SMQN 0x000e1a9e dunSleepingTreeCampNode
  PNAM[4] 0x00030b13 (float 2.79479e-40)
  SNAM[4] 0x000ddf93 (float 1.27406e-39)
  CITC[4] 0x00000001 (float 1.4013e-45)
  CTDA[32] floats ['4.48616e-36', '1', '5.03066e-43', '1.44453e-40', '0', '0', '0', 'nan']
  DNAM[4] 0x00020000 (float 1.83671e-40)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000001 (float 1.4013e-45)
  NNAM[4] 0x000e1a9d (float 1.29524e-39)
SMQN 0x000dee9d WITavernActorDialogueEvent
  PNAM[4] 0x00070222 (float 6.43614e-40)
  SNAM[4] 0x00000000 (float 0)
  CITC[4] 0x00000002 (float 2.8026e-45)
  CTDA[32] floats ['5.18423e-37', '1', '9.94922e-44', '1.27945e-39', '0', '9.80909e-45', '0', '1.76928e-41']
  CTDA[32] floats ['5.18423e-37', '1', '9.94922e-44', '1.27946e-39', '0', '9.80909e-45', '0', '1.80515e-41']
  DNAM[4] 0x00000001 (float 1.4013e-45)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000001 (float 1.4013e-45)
  NNAM[4] 0x000dee9a (float 1.27946e-39)
SMQN 0x000dee94 WITavernQuestNodeSHARES
  PNAM[4] 0x0001320e (float 1.09792e-40)
  SNAM[4] 0x00039fbd (float 3.3281e-40)
  CITC[4] 0x00000001 (float 1.4013e-45)
  CTDA[32] floats ['5.18423e-37', '1', '8.07148e-43', '1.18744e-08', '1.64847e-40', '0', '0', 'nan']
  DNAM[4] 0x00020000 (float 1.83671e-40)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000001 (float 1.4013e-45)
  NNAM[4] 0x000dee92 (float 1.27944e-39)
SMQN 0x000ddf93 dunPOIAnisesCabin
  PNAM[4] 0x00030b13 (float 2.79479e-40)
  SNAM[4] 0x00000000 (float 0)
  CITC[4] 0x00000001 (float 1.4013e-45)
  CTDA[32] floats ['2.51198e-27', '1', '5.03066e-43', '1.24739e-39', '0', '0', '0', '1.76928e-41']
  DNAM[4] 0x00020000 (float 1.83671e-40)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000001 (float 1.4013e-45)
  NNAM[4] 0x000ddf8d (float 1.27406e-39)
SMQN 0x000dc9e1 DA08KickerNode
  PNAM[4] 0x0005bd79 (float 5.27147e-40)
  SNAM[4] 0x00000000 (float 0)
  CITC[4] 0x00000001 (float 1.4013e-45)
  CTDA[32] floats ['5.55191e-26', '1.26628e-39', '1.12104e-43', '0', '0', '2.8026e-45', '2.8026e-44', 'nan']
  DNAM[4] 0x00020000 (float 1.83671e-40)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000001 (float 1.4013e-45)
  NNAM[4] 0x000dc9e0 (float 1.26628e-39)
SMQN 0x000db856 FreeformCidhnaMine
  PNAM[4] 0x0009002a (float 8.26578e-40)
  SNAM[4] 0x0006e835 (float 6.34313e-40)
  CITC[4] 0x00000001 (float 1.4013e-45)
  CTDA[32] floats ['4.47643e-32', '1', '8.07148e-43', '1.18744e-08', '1.42261e-40', '0', '0', 'nan']
  DNAM[4] 0x00020000 (float 1.83671e-40)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000001 (float 1.4013e-45)
  NNAM[4] 0x000db851 (float 1.25998e-39)
SMQN 0x000d5f09 CWFortObserverQuestNodeShares
  PNAM[4] 0x0003844e (float 3.22968e-40)
  SNAM[4] 0x0002994d (float 2.38665e-40)
  CITC[4] 0x00000001 (float 1.4013e-45)
  CTDA[32] floats ['5.77471e-29', '1', '8.07148e-43', '2.96859e-09', '1.62381e-40', '0', '0', 'nan']
  DNAM[4] 0x00020000 (float 1.83671e-40)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000001 (float 1.4013e-45)
  NNAM[4] 0x000d5f08 (float 1.22795e-39)
SMQN 0x000d5176 CWChangeLocationScenes
  PNAM[4] 0x0001320e (float 1.09792e-40)
  SNAM[4] 0x0009002b (float 8.2658e-40)
  CITC[4] 0x00000001 (float 1.4013e-45)
  CTDA[32] floats ['2.18312e-27', '0', '7.84727e-44', '1.20113e-39', '0', '0', '0', 'nan']
  DNAM[4] 0x00000000 (float 0)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000004 (float 5.60519e-45)
  NNAM[4] 0x000d5165 (float 1.22306e-39)
  NNAM[4] 0x000d5f0a (float 1.22796e-39)
  NNAM[4] 0x000e1b36 (float 1.29546e-39)
  NNAM[4] 0x000e2d3a (float 1.30192e-39)
SMQN 0x000d2ac0 WhiterunMarketplaceHellosNode
  PNAM[4] 0x000d1207 (float 1.20033e-39)
  SNAM[4] 0x00000000 (float 0)
  CITC[4] 0x00000000 (float 0)
  DNAM[4] 0x00010001 (float 9.18369e-41)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000000 (float 0)
SMQN 0x000d1eeb BardSongStarterNode
  PNAM[4] 0x00090028 (float 8.26576e-40)
  SNAM[4] 0x000cf02b (float 1.18818e-39)
  CITC[4] 0x00000001 (float 1.4013e-45)
  CTDA[32] floats ['2.98348e-35', '1', '8.07148e-43', '1.18744e-08', '1.64847e-40', '0', '0', 'nan']
  DNAM[4] 0x00020000 (float 1.83671e-40)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000001 (float 1.4013e-45)
  NNAM[4] 0x000be159 (float 1.09103e-39)
SMQN 0x000d1450 CWFinaleNode
  PNAM[4] 0x000236a1 (float 2.03268e-40)
  SNAM[4] 0x00000000 (float 0)
  CITC[4] 0x00000001 (float 1.4013e-45)
  CTDA[32] floats ['3.2285e-35', '1', '8.07148e-43', '2.95404e-09', '1.20115e-39', '0', '0', 'nan']
  DNAM[4] 0x00000000 (float 0)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000001 (float 1.4013e-45)
  NNAM[4] 0x000d1444 (float 1.20113e-39)
SMQN 0x000cf944 dunStonehillBarrowNode
  PNAM[4] 0x00030b13 (float 2.79479e-40)
  SNAM[4] 0x000c6021 (float 1.13651e-39)
  CITC[4] 0x00000001 (float 1.4013e-45)
  CTDA[32] floats ['8.27824e-36', '1', '5.03066e-43', '1.44468e-40', '0', '0', '0', 'nan']
  DNAM[4] 0x00000000 (float 0)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000001 (float 1.4013e-45)
  NNAM[4] 0x000cf915 (float 1.19138e-39)
SMQN 0x000cf02b MS09ArgueSceneNode
  PNAM[4] 0x00090028 (float 8.26576e-40)
  SNAM[4] 0x000c6b9e (float 1.14063e-39)
  CITC[4] 0x00000007 (float 9.80909e-45)
  CTDA[32] floats ['1.85913e-33', '8', '1.03696e-43', '7.84727e-44', '0', '0', '0', 'nan']
  CTDA[32] floats ['1.85914e-33', '20', '1.03696e-43', '7.84727e-44', '0', '0', '0', 'nan']
  CTDA[32] floats ['1.85911e-33', '0', '8.81417e-43', '1.66146e-40', '3.71128e-13', '0', '0', 'nan']
  CIS2[19] 3a3a4d5330395363656e6552756e5f76617200
  CTDA[32] floats ['1.85914e-33', '40', '8.12753e-44', '1.66146e-40', '0', '0', '0', 'nan']
  CTDA[32] floats ['1.85912e-33', '1', '8.07148e-43', '1.18744e-08', '1.80952e-40', '0', '0', 'nan']
  CTDA[32] floats ['1.85912e-33', '1', '8.07148e-43', '1.18744e-08', '1.80955e-40', '0', '0', 'nan']
  CTDA[32] floats ['1.85911e-33', '1', '8.07148e-43', '1.18744e-08', '1.80954e-40', '0', '0', 'nan']
  DNAM[4] 0x00020000 (float 1.83671e-40)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000001 (float 1.4013e-45)
  NNAM[4] 0x00037cc2 (float 3.20261e-40)
SMQN 0x000cbaa9 BQReachNodeSHARES
  PNAM[4] 0x000cba9f (float 1.16897e-39)
  SNAM[4] 0x00000000 (float 0)
  CITC[4] 0x00000003 (float 4.2039e-45)
  CTDA[32] floats ['1.09861e-27', '1', '8.07148e-43', '1.18744e-08', '3.29881e-40', '0', '0', 'nan']
  CTDA[32] floats ['1.09861e-27', '1', '5.03066e-43', '1.28932e-40', '0', '0', '0', 'nan']
  CTDA[32] floats ['1.09861e-27', '0', '8.49187e-43', '1.28932e-40', '1.16896e-39', '0', '0', 'nan']
  DNAM[4] 0x00030001 (float 2.75508e-40)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000004 (float 5.60519e-45)
  NNAM[4] 0x00095125 (float 8.55629e-40)
  NNAM[4] 0x000bd77f (float 1.0875e-39)
  NNAM[4] 0x000bd78c (float 1.08751e-39)
  NNAM[4] 0x000cba9a (float 1.16897e-39)
SMQN 0x000cbaa7 BQRiftNodeSHARES
  PNAM[4] 0x000cba9f (float 1.16897e-39)
  SNAM[4] 0x000cbaa2 (float 1.16898e-39)
  CITC[4] 0x00000003 (float 4.2039e-45)
  CTDA[32] floats ['1.09861e-27', '1', '8.07148e-43', '1.18744e-08', '3.29881e-40', '0', '0', 'nan']
  CTDA[32] floats ['1.09861e-27', '1', '5.03066e-43', '1.28936e-40', '0', '0', '0', 'nan']
  CTDA[32] floats ['1.09861e-27', '0', '8.49187e-43', '1.28936e-40', '1.16896e-39', '0', '0', 'nan']
  DNAM[4] 0x00030001 (float 2.75508e-40)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000004 (float 5.60519e-45)
  NNAM[4] 0x00095125 (float 8.55629e-40)
  NNAM[4] 0x000bd77f (float 1.0875e-39)
  NNAM[4] 0x000bd78c (float 1.08751e-39)
  NNAM[4] 0x000cba9a (float 1.16897e-39)
SMQN 0x000cbaa6 BQEastmarchNodeSHARES
  PNAM[4] 0x000cba9f (float 1.16897e-39)
  SNAM[4] 0x00000000 (float 0)
  CITC[4] 0x00000003 (float 4.2039e-45)
  CTDA[32] floats ['1.09861e-27', '1', '8.07148e-43', '1.18744e-08', '3.29881e-40', '0', '0', 'nan']
  CTDA[32] floats ['1.09861e-27', '1', '5.03066e-43', '1.28933e-40', '0', '0', '0', 'nan']
  CTDA[32] floats ['1.09861e-27', '0', '8.49187e-43', '1.28933e-40', '1.16896e-39', '0', '0', 'nan']
  DNAM[4] 0x00030001 (float 2.75508e-40)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000004 (float 5.60519e-45)
  NNAM[4] 0x00095125 (float 8.55629e-40)
  NNAM[4] 0x000bd77f (float 1.0875e-39)
  NNAM[4] 0x000bd78c (float 1.08751e-39)
  NNAM[4] 0x000cba9a (float 1.16897e-39)
SMQN 0x000cbaa5 BQWinterholdNodeSHARES
  PNAM[4] 0x000cba9f (float 1.16897e-39)
  SNAM[4] 0x00095126 (float 8.5563e-40)
  CITC[4] 0x00000003 (float 4.2039e-45)
  CTDA[32] floats ['1.09861e-27', '1', '8.07148e-43', '1.18744e-08', '3.29881e-40', '0', '0', 'nan']
  CTDA[32] floats ['1.09861e-27', '1', '5.03066e-43', '1.28935e-40', '0', '0', '0', 'nan']
  CTDA[32] floats ['1.09861e-27', '0', '8.49187e-43', '1.28935e-40', '1.16896e-39', '0', '0', 'nan']
  DNAM[4] 0x00030001 (float 2.75508e-40)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000004 (float 5.60519e-45)
  NNAM[4] 0x00095125 (float 8.55629e-40)
  NNAM[4] 0x000bd77f (float 1.0875e-39)
  NNAM[4] 0x000bd78c (float 1.08751e-39)
  NNAM[4] 0x000cba9a (float 1.16897e-39)
SMQN 0x000cbaa4 BQFalkreathNodeSHARES
  PNAM[4] 0x000cba9f (float 1.16897e-39)
  SNAM[4] 0x000cbaa3 (float 1.16898e-39)
  CITC[4] 0x00000003 (float 4.2039e-45)
  CTDA[32] floats ['1.09861e-27', '1', '8.07148e-43', '1.18744e-08', '3.29881e-40', '0', '0', 'nan']
  CTDA[32] floats ['1.09861e-27', '1', '5.03066e-43', '1.2894e-40', '0', '0', '0', 'nan']
  CTDA[32] floats ['1.09861e-27', '0', '8.49187e-43', '1.2894e-40', '1.16896e-39', '0', '0', 'nan']
  DNAM[4] 0x00030001 (float 2.75508e-40)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000004 (float 5.60519e-45)
  NNAM[4] 0x00095125 (float 8.55629e-40)
  NNAM[4] 0x000bd77f (float 1.0875e-39)
  NNAM[4] 0x000bd78c (float 1.08751e-39)
  NNAM[4] 0x000cba9a (float 1.16897e-39)
SMQN 0x000cbaa3 BQPaleNodeSHARES
  PNAM[4] 0x000cba9f (float 1.16897e-39)
  SNAM[4] 0x00000000 (float 0)
  CITC[4] 0x00000003 (float 4.2039e-45)
  CTDA[32] floats ['1.09861e-27', '1', '8.07148e-43', '1.18744e-08', '3.29881e-40', '0', '0', 'nan']
  CTDA[32] floats ['1.09861e-27', '1', '5.03066e-43', '1.28938e-40', '0', '0', '0', 'nan']
  CTDA[32] floats ['1.09861e-27', '0', '8.49187e-43', '1.28938e-40', '1.16896e-39', '0', '0', 'nan']
  DNAM[4] 0x00030001 (float 2.75508e-40)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000004 (float 5.60519e-45)
  NNAM[4] 0x00095125 (float 8.55629e-40)
  NNAM[4] 0x000bd77f (float 1.0875e-39)
  NNAM[4] 0x000bd78c (float 1.08751e-39)
  NNAM[4] 0x000cba9a (float 1.16897e-39)
SMQN 0x000cbaa2 BQWhiterunNodeSHARES
  PNAM[4] 0x000cba9f (float 1.16897e-39)
  SNAM[4] 0x000cbaa5 (float 1.16898e-39)
  CITC[4] 0x00000003 (float 4.2039e-45)
  CTDA[32] floats ['1.09861e-27', '1', '8.07148e-43', '1.18744e-08', '3.29881e-40', '0', '0', 'nan']
  CTDA[32] floats ['1.09861e-27', '1', '5.03066e-43', '1.28945e-40', '0', '0', '0', 'nan']
  CTDA[32] floats ['1.09861e-27', '0', '8.49187e-43', '1.28945e-40', '1.16896e-39', '0', '0', 'nan']
  DNAM[4] 0x00030001 (float 2.75508e-40)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000004 (float 5.60519e-45)
  NNAM[4] 0x00095125 (float 8.55629e-40)
  NNAM[4] 0x000bd77f (float 1.0875e-39)
  NNAM[4] 0x000bd78c (float 1.08751e-39)
  NNAM[4] 0x000cba9a (float 1.16897e-39)
SMQN 0x000cbaa1 BQHjaalmarchNodeSHARES
  PNAM[4] 0x000cba9f (float 1.16897e-39)
  SNAM[4] 0x000cbaa2 (float 1.16898e-39)
  CITC[4] 0x00000003 (float 4.2039e-45)
  CTDA[32] floats ['1.09861e-27', '1', '8.07148e-43', '1.18744e-08', '3.29881e-40', '0', '0', 'nan']
  CTDA[32] floats ['1.09861e-27', '1', '5.03066e-43', '1.28939e-40', '0', '0', '0', 'nan']
  CTDA[32] floats ['1.09861e-27', '0', '8.49187e-43', '1.28939e-40', '1.16896e-39', '0', '0', 'nan']
  DNAM[4] 0x00030001 (float 2.75508e-40)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000004 (float 5.60519e-45)
  NNAM[4] 0x00095125 (float 8.55629e-40)
  NNAM[4] 0x000bd77f (float 1.0875e-39)
  NNAM[4] 0x000bd78c (float 1.08751e-39)
  NNAM[4] 0x000cba9a (float 1.16897e-39)
SMQN 0x000ca841 CWCapitalTownFortSiegeNode
  PNAM[4] 0x000236a1 (float 2.03268e-40)
  SNAM[4] 0x00018387 (float 1.39019e-40)
  CITC[4] 0x00000001 (float 1.4013e-45)
  CTDA[32] floats ['1.97733e-35', '1', '8.07148e-43', '2.95404e-09', '1.16238e-39', '0', '0', 'nan']
  DNAM[4] 0x00000000 (float 0)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000001 (float 1.4013e-45)
  NNAM[4] 0x00087c21 (float 7.79213e-40)
SMQN 0x000c791b WIGreetingNodeSHARES
  PNAM[4] 0x0001320e (float 1.09792e-40)
  SNAM[4] 0x000dee94 (float 1.27945e-39)
  CITC[4] 0x00000001 (float 1.4013e-45)
  CTDA[32] floats ['1.33964e-25', '0', '2.03188e-43', '0', '0', '2.8026e-45', '2.8026e-44', 'nan']
  DNAM[4] 0x00020000 (float 1.83671e-40)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000001 (float 1.4013e-45)
  NNAM[4] 0x000c7919 (float 1.14547e-39)
SMQN 0x000c6cf2 MossMotherNodeCavernNode
  PNAM[4] 0x00090028 (float 8.26576e-40)
  SNAM[4] 0x000ec19a (float 1.35515e-39)
  CITC[4] 0x00000002 (float 2.8026e-45)
  CTDA[32] floats ['5.77979e-29', '1', '5.03066e-43', '1.44387e-40', '0', '0', '0', 'nan']
  CTDA[32] floats ['5.77979e-29', '1', '5.03066e-43', '1.41443e-40', '0', '0', '0', 'nan']
  DNAM[4] 0x00020000 (float 1.83671e-40)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000001 (float 1.4013e-45)
  NNAM[4] 0x000376ee (float 3.1817e-40)
SMQN 0x000c6b9e MS12bStartingNode
  PNAM[4] 0x00090028 (float 8.26576e-40)
  SNAM[4] 0x00055bff (float 4.92179e-40)
  CITC[4] 0x00000004 (float 5.60519e-45)
  CTDA[32] floats ['1.00832e-35', '1', '8.26766e-44', '2.6011e-40', '2.8026e-43', '0', '0', 'nan']
  CTDA[32] floats ['1.00832e-35', '1', '8.26766e-44', '2.53388e-40', '1.4013e-43', '0', '0', 'nan']
  CTDA[32] floats ['1.00832e-35', '0', '7.84727e-44', '2.10077e-40', '0', '0', '0', 'nan']
  CTDA[32] floats ['1.00832e-35', '1.14063e-39', '1.03696e-43', '7.9874e-44', '0', '0', '0', 'nan']
  DNAM[4] 0x00020000 (float 1.83671e-40)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000001 (float 1.4013e-45)
  NNAM[4] 0x0002499c (float 2.10077e-40)
SMQN 0x000c6021 dunKatariahNode
  PNAM[4] 0x00030b13 (float 2.79479e-40)
  SNAM[4] 0x00000000 (float 0)
  CITC[4] 0x00000001 (float 1.4013e-45)
  CTDA[32] floats ['5.9593e-36', '1', '5.03066e-43', '1.07737e-39', '0', '0', '0', '1.76928e-41']
  DNAM[4] 0x00020000 (float 1.83671e-40)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000001 (float 1.4013e-45)
  NNAM[4] 0x000c6020 (float 1.13651e-39)
SMQN 0x000c4cc5 DA13IncreaseLevelNodeSHARES
  PNAM[4] 0x0005bd79 (float 5.27147e-40)
  SNAM[4] 0x0009e1af (float 9.07479e-40)
  CITC[4] 0x00000001 (float 1.4013e-45)
  CTDA[32] floats ['2.66054e-35', '1.12956e-39', '1.12104e-43', '0', '0', '2.8026e-45', '2.8026e-44', 'nan']
  DNAM[4] 0x00020002 (float 1.83674e-40)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000001 (float 1.4013e-45)
  NNAM[4] 0x0008998d (float 7.89768e-40)
SMQN 0x000c370f dunNchuandZelNode0
  PNAM[4] 0x00030b13 (float 2.79479e-40)
  SNAM[4] 0x0007a380 (float 7.01501e-40)
  CITC[4] 0x00000001 (float 1.4013e-45)
  CTDA[32] floats ['0', '1', '5.03066e-43', '1.44394e-40', '0', '0', '0', 'nan']
  DNAM[4] 0x00020000 (float 1.83671e-40)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000001 (float 1.4013e-45)
  NNAM[4] 0x000c3709 (float 1.12177e-39)
SMQN 0x000c2b6b FavorChangeLocationMarkarth
  PNAM[4] 0x000b2440 (float 1.02319e-39)
  SNAM[4] 0x0003f4c4 (float 3.63312e-40)
  CITC[4] 0x00000001 (float 1.4013e-45)
  CTDA[32] floats ['6.26313e-24', '1', '8.07148e-43', '1.18744e-08', '1.41465e-40', '0', '0', 'nan']
  DNAM[4] 0x00060000 (float 5.51013e-40)
  XNAM[4] 0x00000000 (float 0)
  MNAM[4] 0x00000008 (float 1.12104e-44)
  QNAM[4] 0x00000008 (float 1.12104e-44)
  NNAM[4] 0x000403b0 (float 3.68665e-40)
  NNAM[4] 0x000ca209 (float 1.16015e-39)
  NNAM[4] 0x000790e1 (float 6.94821e-40)
  NNAM[4] 0x000ca210 (float 1.16016e-39)
  NNAM[4] 0x0006c824 (float 6.2281e-40)
  NNAM[4] 0x0007105b (float 6.48716e-40)
  NNAM[4] 0x000a2c86 (float 9.34327e-40)
  NNAM[4] 0x000a3504 (float 9.37373e-40)
SMQN 0x000c1ad0 dunRebelsCairnNode
  PNAM[4] 0x00030b13 (float 2.79479e-40)
  SNAM[4] 0x00000000 (float 0)
  CITC[4] 0x00000002 (float 2.8026e-45)
  CTDA[32] floats ['4.96658e-37', '1', '5.03066e-43', '9.65185e-40', '0', '0', '0', 'nan']
  CTDA[32] floats ['4.96658e-37', '1', '5.03066e-43', '1.44009e-40', '0', '0', '0', 'nan']
  DNAM[4] 0x00020000 (float 1.83671e-40)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000001 (float 1.4013e-45)
  NNAM[4] 0x000c1acc (float 1.11164e-39)
SMQN 0x000c0609 FavorChangeLocationWhiterun
  PNAM[4] 0x000b2440 (float 1.02319e-39)
  SNAM[4] 0x00000000 (float 0)
  CITC[4] 0x00000001 (float 1.4013e-45)
  CTDA[32] floats ['6.26313e-24', '1', '8.07148e-43', '1.18744e-08', '1.41461e-40', '0', '0', 'nan']
  DNAM[4] 0x00060000 (float 5.51013e-40)
  XNAM[4] 0x00000000 (float 0)
  MNAM[4] 0x00000005 (float 7.00649e-45)
  QNAM[4] 0x00000005 (float 7.00649e-45)
  NNAM[4] 0x000a2c9e (float 9.34361e-40)
  NNAM[4] 0x000ca209 (float 1.16015e-39)
  NNAM[4] 0x000ca210 (float 1.16016e-39)
  NNAM[4] 0x000ca439 (float 1.16094e-39)
  NNAM[4] 0x0007105b (float 6.48716e-40)
SMQN 0x000bfc7b CompanionsReconNode
  PNAM[4] 0x000bfc76 (float 1.10076e-39)
  SNAM[4] 0x000bfc7a (float 1.10076e-39)
  CITC[4] 0x00000001 (float 1.4013e-45)
  CTDA[32] floats ['2.08387e-23', '1', '8.07148e-43', '2.95404e-09', '1.10076e-39', '0', '0', 'nan']
  DNAM[4] 0x00020001 (float 1.83672e-40)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000003 (float 4.2039e-45)
  NNAM[4] 0x00025252 (float 2.13202e-40)
  NNAM[4] 0x0009d6fc (float 9.03641e-40)
  NNAM[4] 0x0009d700 (float 9.03647e-40)
SMQN 0x000bfc7a CompanionsVilkasAlwaysNode
  PNAM[4] 0x000ec1a7 (float 1.35517e-39)
  SNAM[4] 0x000f6084 (float 1.41216e-39)
  CITC[4] 0x00000001 (float 1.4013e-45)
  CTDA[32] floats ['3.11373e-27', '0', '6.44597e-44', '0', '0', '2.8026e-45', '1.51588e-40', 'nan']
  DNAM[4] 0x00020001 (float 1.83672e-40)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000002 (float 2.8026e-45)
  NNAM[4] 0x00025251 (float 2.13201e-40)
  NNAM[4] 0x000e3156 (float 1.3034e-39)
SMQN 0x000bfc79 CompanionsSkjorNode
  PNAM[4] 0x000bfc76 (float 1.10076e-39)
  SNAM[4] 0x000bfc77 (float 1.10076e-39)
  CITC[4] 0x00000002 (float 2.8026e-45)
  CTDA[32] floats ['3.11373e-27', '1', '8.07148e-43', '2.95404e-09', '2.13203e-40', '0', '0', 'nan']
  CTDA[32] floats ['3.11373e-27', '0', '6.44597e-44', '0', '0', '2.8026e-45', '1.51588e-40', 'nan']
  DNAM[4] 0x00020001 (float 1.83672e-40)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000002 (float 2.8026e-45)
  NNAM[4] 0x000c18e1 (float 1.11095e-39)
  NNAM[4] 0x00025250 (float 2.13199e-40)
SMQN 0x000bfc78 CompanionsFarkasNode
  PNAM[4] 0x000f6085 (float 1.41216e-39)
  SNAM[4] 0x000f6086 (float 1.41216e-39)
  CITC[4] 0x00000000 (float 0)
  DNAM[4] 0x00020001 (float 1.83672e-40)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000003 (float 4.2039e-45)
  NNAM[4] 0x00025231 (float 2.13156e-40)
  NNAM[4] 0x0002522f (float 2.13153e-40)
  NNAM[4] 0x000e3156 (float 1.3034e-39)
SMQN 0x000bfc77 CompanionsAelaNode
  PNAM[4] 0x000bfc76 (float 1.10076e-39)
  SNAM[4] 0x000aefa6 (float 1.00432e-39)
  CITC[4] 0x00000001 (float 1.4013e-45)
  CTDA[32] floats ['2.08387e-23', '1', '8.07148e-43', '2.95404e-09', '1.66125e-40', '0', '0', 'nan']
  DNAM[4] 0x00020001 (float 1.83672e-40)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000003 (float 4.2039e-45)
  NNAM[4] 0x0001ceee (float 1.66068e-40)
  NNAM[4] 0x00025185 (float 2.12915e-40)
  NNAM[4] 0x000e3145 (float 1.30337e-39)
SMQN 0x00087e27 MakeFriendsNode
  PNAM[4] 0x00025e22 (float 2.17439e-40)
  SNAM[4] 0x0007431c (float 6.66923e-40)
  CITC[4] 0x00000005 (float 7.00649e-45)
  CTDA[32] floats ['7.44721e-23', '0', '9.94922e-44', '4.62451e-40', '0', '9.80909e-45', '0', '1.76928e-41']
  CTDA[32] floats ['7.44721e-23', '0', '9.94922e-44', '4.62451e-40', '0', '9.80909e-45', '0', '1.80515e-41']
  CTDA[32] floats ['7.44731e-23', '0', '8.07148e-43', '3.11411e-09', '0', '0', '0', 'nan']
  CTDA[32] floats ['7.44727e-23', '1', '5.64723e-43', '2.8026e-44', '0', '9.80909e-45', '0', '1.76928e-41']
  CTDA[32] floats ['7.44727e-23', '1', '5.64723e-43', '2.8026e-44', '0', '9.80909e-45', '0', '1.80515e-41']
  DNAM[4] 0x00000000 (float 0)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000001 (float 1.4013e-45)
  NNAM[4] 0x00087e28 (float 7.7994e-40)
SMQN 0x0007a380 TG04BrinewaterGrottoNode
  PNAM[4] 0x00030b13 (float 2.79479e-40)
  SNAM[4] 0x00016c8f (float 1.30779e-40)
  CITC[4] 0x00000001 (float 1.4013e-45)
  CTDA[32] floats ['1.98131e-36', '1', '5.03066e-43', '5.46764e-40', '0', '0', '0', 'nan']
  DNAM[4] 0x00020000 (float 1.83671e-40)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000001 (float 1.4013e-45)
  NNAM[4] 0x0007a282 (float 7.01145e-40)
SMQN 0x000763ec FavorOrcsIntroNode
  PNAM[4] 0x0001379a (float 1.11782e-40)
  SNAM[4] 0x0001e3c2 (float 1.7354e-40)
  CITC[4] 0x00000001 (float 1.4013e-45)
  CTDA[32] floats ['1.07093e-35', '1', '8.07148e-43', '2.95404e-09', '6.78654e-40', '0', '0', 'nan']
  DNAM[4] 0x00000000 (float 0)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000001 (float 1.4013e-45)
  NNAM[4] 0x00076335 (float 6.78437e-40)
SMQN 0x00064351 CWCitizensFleeNode
  PNAM[4] 0x000236a1 (float 2.03268e-40)
  SNAM[4] 0x000ca841 (float 1.16238e-39)
  CITC[4] 0x00000001 (float 1.4013e-45)
  CTDA[32] floats ['1.97733e-35', '1', '8.07148e-43', '2.95404e-09', '5.7516e-40', '0', '0', 'nan']
  DNAM[4] 0x00000000 (float 0)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000001 (float 1.4013e-45)
  NNAM[4] 0x0006434a (float 5.75152e-40)
SMQN 0x0001e4cd ClearSkiesChangeLocationNode
  PNAM[4] 0x0001320e (float 1.09792e-40)
  SNAM[4] 0x000a39c6 (float 9.3908e-40)
  CITC[4] 0x00000001 (float 1.4013e-45)
  CTDA[32] floats ['7.70939e-28', '1', '7.84727e-44', '1.73516e-40', '0', '0', '0', 'nan']
  DNAM[4] 0x00020000 (float 1.83671e-40)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000001 (float 1.4013e-45)
  NNAM[4] 0x0001e3c8 (float 1.73548e-40)
SMQN 0x0001e3c2 WeatherChange
  PNAM[4] 0x0001379a (float 1.11782e-40)
  SNAM[4] 0x000a9b1a (float 9.73995e-40)
  CITC[4] 0x00000000 (float 0)
  DNAM[4] 0x00000000 (float 0)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000002 (float 2.8026e-45)
  NNAM[4] 0x0001e3b1 (float 1.73516e-40)
  NNAM[4] 0x000a1a59 (float 9.27807e-40)
SMQN 0x00018387 CWNonFortFortSiegeNode
  PNAM[4] 0x000236a1 (float 2.03268e-40)
  SNAM[4] 0x0007e32d (float 7.24344e-40)
  CITC[4] 0x00000001 (float 1.4013e-45)
  CTDA[32] floats ['1.97733e-35', '1', '8.07148e-43', '2.95404e-09', '1.39016e-40', '0', '0', 'nan']
  DNAM[4] 0x00000000 (float 0)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000001 (float 1.4013e-45)
  NNAM[4] 0x00087c21 (float 7.79213e-40)
SMQN 0x00016c8f dunDeadMensRespiteNode
  PNAM[4] 0x00030b13 (float 2.79479e-40)
  SNAM[4] 0x00000000 (float 0)
  CITC[4] 0x00000001 (float 1.4013e-45)
  CTDA[32] floats ['3.04591e-36', '1', '5.03066e-43', '1.43988e-40', '0', '0', '0', 'nan']
  DNAM[4] 0x00020000 (float 1.83671e-40)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000001 (float 1.4013e-45)
  NNAM[4] 0x00016c8d (float 1.30776e-40)
SMQN 0x000279de FreeformOldHroldanNode
  PNAM[4] 0x0009002a (float 8.26578e-40)
  SNAM[4] 0x0006383e (float 5.71189e-40)
  CITC[4] 0x00000001 (float 1.4013e-45)
  CTDA[32] floats ['3.36406e-23', '1', '8.07148e-43', '1.18744e-08', '1.4146e-40', '0', '0', 'nan']
  DNAM[4] 0x00040000 (float 3.67342e-40)
  XNAM[4] 0x00000000 (float 0)
  MNAM[4] 0x00000002 (float 2.8026e-45)
  QNAM[4] 0x00000001 (float 1.4013e-45)
  NNAM[4] 0x0006819a (float 5.97505e-40)
SMQN 0x0009ca12 MarkarthGenericConvoScenes
  PNAM[4] 0x000340c6 (float 2.98743e-40)
  SNAM[4] 0x000590d6 (float 5.11135e-40)
  CITC[4] 0x00000001 (float 1.4013e-45)
  CTDA[32] floats ['1.02575e-35', '1', '8.26766e-44', '1.00709e-39', '1.4013e-43', '0', '0', 'nan']
  DNAM[4] 0x00010001 (float 9.18369e-41)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000003 (float 4.2039e-45)
  NNAM[4] 0x0009ca0c (float 8.99e-40)
  RNAM[4] 0x44100000 (float 576)
  NNAM[4] 0x0009ca0e (float 8.99003e-40)
  RNAM[4] 0x44100000 (float 576)
  NNAM[4] 0x0009ca10 (float 8.99006e-40)
  RNAM[4] 0x44100000 (float 576)
SMQN 0x00095126 BQHaafingarNodeSHARES
  PNAM[4] 0x000cba9f (float 1.16897e-39)
  SNAM[4] 0x00000000 (float 0)
  CITC[4] 0x00000003 (float 4.2039e-45)
  CTDA[32] floats ['1.09861e-27', '1', '8.07148e-43', '1.18744e-08', '3.29881e-40', '0', '0', 'nan']
  CTDA[32] floats ['1.09861e-27', '1', '5.03066e-43', '1.28942e-40', '0', '0', '0', 'nan']
  CTDA[32] floats ['1.09861e-27', '0', '8.49187e-43', '1.28942e-40', '1.16896e-39', '0', '0', 'nan']
  DNAM[4] 0x00030001 (float 2.75508e-40)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000004 (float 5.60519e-45)
  NNAM[4] 0x00095125 (float 8.55629e-40)
  NNAM[4] 0x000bd77f (float 1.0875e-39)
  NNAM[4] 0x000bd78c (float 1.08751e-39)
  NNAM[4] 0x000cba9a (float 1.16897e-39)
SMQN 0x000734a9 CaravanScenes
  PNAM[4] 0x00015fce (float 1.26204e-40)
  SNAM[4] 0x000ba541 (float 1.06947e-39)
  CITC[4] 0x00000002 (float 2.8026e-45)
  CTDA[32] floats ['7.84645e-25', '1', '9.94922e-44', '6.60035e-40', '0', '9.80909e-45', '0', '1.76928e-41']
  CTDA[32] floats ['7.84645e-25', '1', '9.94922e-44', '6.60034e-40', '0', '9.80909e-45', '0', '1.80515e-41']
  DNAM[4] 0x00010001 (float 9.18369e-41)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000008 (float 1.12104e-44)
  NNAM[4] 0x000731e9 (float 6.60753e-40)
  NNAM[4] 0x000731e8 (float 6.60751e-40)
  NNAM[4] 0x000731e7 (float 6.6075e-40)
  NNAM[4] 0x000731e6 (float 6.60749e-40)
  NNAM[4] 0x000731e5 (float 6.60747e-40)
  NNAM[4] 0x000731e4 (float 6.60746e-40)
  NNAM[4] 0x000731e2 (float 6.60743e-40)
  NNAM[4] 0x000731cf (float 6.60716e-40)
SMQN 0x00072a96 dunShroudHearthNode
  PNAM[4] 0x00030b13 (float 2.79479e-40)
  SNAM[4] 0x00000000 (float 0)
  CITC[4] 0x00000001 (float 1.4013e-45)
  CTDA[32] floats ['7.71986e-18', '1', '5.03066e-43', '6.24472e-40', '0', '0', '0', 'nan']
  DNAM[4] 0x00020000 (float 1.83671e-40)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000001 (float 1.4013e-45)
  NNAM[4] 0x00072206 (float 6.55054e-40)
SMQN 0x0005ce30 RDSScene05NodeSHARES
  PNAM[4] 0x0009002b (float 8.2658e-40)
  SNAM[4] 0x000b6690 (float 1.04698e-39)
  CITC[4] 0x00000002 (float 2.8026e-45)
  CTDA[32] floats ['1.33044e-27', '1', '8.07148e-43', '1.18744e-08', '1.96762e-40', '0', '0', 'nan']
  CTDA[32] floats ['1.33044e-27', '0', '1.03696e-43', '5.3313e-40', '0', '0', '0', 'nan']
  DNAM[4] 0x00020000 (float 1.83671e-40)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000001 (float 1.4013e-45)
  NNAM[4] 0x0005ce25 (float 5.33128e-40)
SMQN 0x0005221f WIPlayerAddItemPurchaseNode
  PNAM[4] 0x00035b5c (float 3.0828e-40)
  SNAM[4] 0x00000000 (float 0)
  CITC[4] 0x00000001 (float 1.4013e-45)
  CTDA[32] floats ['4.94001e-29', '2', '8.07148e-43', '3.11411e-09', '0', '0', '0', '1.80515e-41']
  DNAM[4] 0x00010000 (float 9.18355e-41)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000000 (float 0)
SMQN 0x0002e3ff DBSuspensionAssault
  PNAM[4] 0x0002c494 (float 2.5419e-40)
  SNAM[4] 0x00000000 (float 0)
  CITC[4] 0x00000005 (float 7.00649e-45)
  CTDA[32] floats ['6.41194e-23', '1', '9.94922e-44', '1.59887e-40', '0', '9.80909e-45', '0', '1.76928e-41']
  CTDA[32] floats ['6.41194e-23', '1', '1.00893e-43', '9.80909e-45', '0', '9.80909e-45', '0', '1.80515e-41']
  CTDA[32] floats ['6.41194e-23', '0', '7.84727e-44', '9.31471e-40', '0', '0', '0', 'nan']
  CTDA[32] floats ['6.41194e-23', '0', '7.84727e-44', '3.49711e-40', '0', '0', '0', 'nan']
  CTDA[32] floats ['6.412e-23', '50', '8.12753e-44', '1.75892e-40', '0', '0', '0', 'nan']
  DNAM[4] 0x00020000 (float 1.83671e-40)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000001 (float 1.4013e-45)
  NNAM[4] 0x000a2490 (float 9.31471e-40)
SMQN 0x0002994d CWGarrisonObserverNodeSHARES
  PNAM[4] 0x0003844e (float 3.22968e-40)
  SNAM[4] 0x00000000 (float 0)
  CITC[4] 0x00000006 (float 8.40779e-45)
  CTDA[32] floats ['0', '0', '1.03696e-43', '1.918e-40', '0', '0', '0', 'nan']
  CTDA[32] floats ['1.34525e-43', '0', '9.12245e-43', '1.62375e-40', '0', '2.8026e-45', '2.8026e-44', 'nan']
  CTDA[32] floats ['1.4013e-45', '1', '7.8753e-43', '1.62375e-40', '0', '0', '0', 'nan']
  CTDA[32] floats ['1.4013e-45', '1', '7.8753e-43', '1.62377e-40', '0', '0', '0', 'nan']
  CTDA[32] floats ['1.4013e-45', '1', '7.8753e-43', '3.74605e-40', '0', '0', '0', 'nan']
  CTDA[32] floats ['1.4013e-45', '1', '7.8753e-43', '1.62381e-40', '0', '0', '0', 'nan']
  DNAM[4] 0x00020000 (float 1.83671e-40)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000003 (float 4.2039e-45)
  NNAM[4] 0x0002994c (float 2.38664e-40)
  NNAM[4] 0x0002e8f0 (float 2.67233e-40)
  NNAM[4] 0x0002e8f1 (float 2.67235e-40)
SMQN 0x000bac26 MS11WindhelmEntranceCounting
  PNAM[4] 0x00090028 (float 8.26576e-40)
  SNAM[4] 0x000e2514 (float 1.299e-39)
  CITC[4] 0x00000003 (float 4.2039e-45)
  CTDA[32] floats ['3.47819e-27', '1', '8.07148e-43', '1.18744e-08', '1.41462e-40', '2.8026e-45', '2.8026e-44', 'nan']
  CTDA[32] floats ['3.47819e-27', '0', '8.07148e-43', '2.96859e-09', '1.41462e-40', '2.8026e-45', '2.8026e-44', 'nan']
  CTDA[32] floats ['3.47819e-27', '0', '8.07148e-43', '2.96859e-09', '1.09363e-40', '0', '0', 'nan']
  DNAM[4] 0x00020000 (float 1.83671e-40)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000001 (float 1.4013e-45)
  NNAM[4] 0x000bac24 (float 1.07194e-39)
SMQN 0x000ba541 DialogueOrcHuntersNode
  PNAM[4] 0x00015fce (float 1.26204e-40)
  SNAM[4] 0x0006b19d (float 6.14729e-40)
  CITC[4] 0x00000002 (float 2.8026e-45)
  CTDA[32] floats ['5.4542e-36', '1', '9.94922e-44', '1.06946e-39', '0', '9.80909e-45', '0', '1.76928e-41']
  CTDA[32] floats ['5.4542e-36', '1', '9.94922e-44', '1.06946e-39', '0', '9.80909e-45', '0', '1.80515e-41']
  DNAM[4] 0x00000000 (float 0)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000001 (float 1.4013e-45)
  NNAM[4] 0x000ba53c (float 1.06947e-39)
SMQN 0x000b997d DragonBridgeMiscConvoScenes
  PNAM[4] 0x00035244 (float 3.05018e-40)
  SNAM[4] 0x000b997c (float 1.06525e-39)
  CITC[4] 0x00000000 (float 0)
  DNAM[4] 0x00000001 (float 1.4013e-45)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000001 (float 1.4013e-45)
  NNAM[4] 0x00052b90 (float 4.74805e-40)
SMQN 0x000b997c DragonBridgeHorgeirsHouseScenes
  PNAM[4] 0x00035244 (float 3.05018e-40)
  SNAM[4] 0x000b997b (float 1.06525e-39)
  CITC[4] 0x00000000 (float 0)
  DNAM[4] 0x00000001 (float 1.4013e-45)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000003 (float 4.2039e-45)
  NNAM[4] 0x00052b96 (float 4.74813e-40)
  NNAM[4] 0x00052b94 (float 4.7481e-40)
  NNAM[4] 0x00052b95 (float 4.74812e-40)
SMQN 0x000b997b DragonBridgeLylvieveHouseScenes
  PNAM[4] 0x00035244 (float 3.05018e-40)
  SNAM[4] 0x000b997a (float 1.06525e-39)
  CITC[4] 0x00000000 (float 0)
  DNAM[4] 0x00000001 (float 1.4013e-45)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000002 (float 2.8026e-45)
  NNAM[4] 0x00052b8e (float 4.74802e-40)
  NNAM[4] 0x00052b8f (float 4.74803e-40)
SMQN 0x000b997a DragonBridgeInnScenes
  PNAM[4] 0x00035244 (float 3.05018e-40)
  SNAM[4] 0x00000000 (float 0)
  CITC[4] 0x00000000 (float 0)
  DNAM[4] 0x00000001 (float 1.4013e-45)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000002 (float 2.8026e-45)
  NNAM[4] 0x00052b97 (float 4.74815e-40)
  NNAM[4] 0x00052b98 (float 4.74816e-40)
SMQN 0x000b8ca2 dunRobbersGorgeNode
  PNAM[4] 0x00030b13 (float 2.79479e-40)
  SNAM[4] 0x00000000 (float 0)
  CITC[4] 0x00000001 (float 1.4013e-45)
  CTDA[32] floats ['5.88243e-36', '1', '5.03066e-43', '1.44428e-40', '0', '0', '0', '1.76928e-41']
  DNAM[4] 0x00020000 (float 1.83671e-40)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000001 (float 1.4013e-45)
  NNAM[4] 0x000b8c9f (float 1.06064e-39)
SMQN 0x000b882c TG00QuestNode
  PNAM[4] 0x0006b369 (float 6.15373e-40)
  SNAM[4] 0x00000000 (float 0)
  CITC[4] 0x00000002 (float 2.8026e-45)
  CTDA[32] floats ['5.67259e-36', '1', '7.84727e-44', '1.91325e-40', '0', '0', '0', 'nan']
  CTDA[32] floats ['5.67262e-36', '10', '8.12753e-44', '1.91325e-40', '0', '0', '0', 'nan']
  DNAM[4] 0x00020000 (float 1.83671e-40)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000001 (float 1.4013e-45)
  NNAM[4] 0x000b882d (float 1.05904e-39)
SMQN 0x000b7c0b dunRaldbtharNode
  PNAM[4] 0x00030b13 (float 2.79479e-40)
  SNAM[4] 0x0004b22f (float 4.31262e-40)
  CITC[4] 0x00000001 (float 1.4013e-45)
  CTDA[32] floats ['4.68962e-26', '1', '5.03066e-43', '8.28478e-40', '0', '0', '0', 'nan']
  DNAM[4] 0x00020000 (float 1.83671e-40)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000001 (float 1.4013e-45)
  NNAM[4] 0x000b7c01 (float 1.05467e-39)
SMQN 0x000b6690 RDSScene04NodeSHARES
  PNAM[4] 0x0009002b (float 8.2658e-40)
  SNAM[4] 0x00000000 (float 0)
  CITC[4] 0x00000002 (float 2.8026e-45)
  CTDA[32] floats ['1.33044e-27', '1', '8.07148e-43', '1.18744e-08', '1.97401e-40', '0', '0', 'nan']
  CTDA[32] floats ['1.33044e-27', '0', '1.03696e-43', '9.76009e-40', '0', '0', '0', 'nan']
  DNAM[4] 0x00020000 (float 1.83671e-40)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000001 (float 1.4013e-45)
  NNAM[4] 0x000b668c (float 1.04698e-39)
SMQN 0x000b555d FreeformRiverwoodNode
  PNAM[4] 0x0009002a (float 8.26578e-40)
  SNAM[4] 0x00000000 (float 0)
  CITC[4] 0x00000000 (float 0)
  DNAM[4] 0x00020000 (float 1.83671e-40)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000001 (float 1.4013e-45)
  NNAM[4] 0x00074a83 (float 6.69578e-40)
SMQN 0x000b48fc DA02BluePalaceDeadBodyNode
  PNAM[4] 0x0003833d (float 3.22586e-40)
  SNAM[4] 0x00000000 (float 0)
  CITC[4] 0x00000003 (float 4.2039e-45)
  CTDA[32] floats ['5.85672e-36', '1', '7.84727e-44', '4.45128e-40', '0', '0', '0', 'nan']
  CTDA[32] floats ['5.85675e-36', '50', '8.12753e-44', '4.45128e-40', '0', '0', '0', 'nan']
  CTDA[32] floats ['5.85672e-36', '1', '8.07148e-43', '2.96859e-09', '1.83859e-40', '0', '0', 'nan']
  DNAM[4] 0x00000000 (float 0)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000001 (float 1.4013e-45)
  NNAM[4] 0x000b48fb (float 1.03637e-39)
SMQN 0x000b18e3 DA02ChangeLocNode
  PNAM[4] 0x00090028 (float 8.26576e-40)
  SNAM[4] 0x00094d8f (float 8.54342e-40)
  CITC[4] 0x00000005 (float 7.00649e-45)
  CTDA[32] floats ['1.85911e-33', '1', '7.84727e-44', '4.45128e-40', '0', '0', '0', 'nan']
  CTDA[32] floats ['1.85913e-33', '50', '8.12753e-44', '4.45128e-40', '0', '0', '0', 'nan']
  CTDA[32] floats ['1.85911e-33', '0', '8.07148e-43', '2.96859e-09', '1.41467e-40', '0', '0', 'nan']
  CTDA[32] floats ['1.85912e-33', '1', '8.07148e-43', '1.18744e-08', '1.41467e-40', '0', '0', 'nan']
  CTDA[32] floats ['1.85912e-33', '1', '8.07148e-43', '1.18744e-08', '1.83859e-40', '0', '0', 'nan']
  DNAM[4] 0x00020002 (float 1.83674e-40)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000001 (float 1.4013e-45)
  NNAM[4] 0x000b18e1 (float 1.01912e-39)
SMQN 0x000b1145 MGSuspension
  PNAM[4] 0x00013010 (float 1.09077e-40)
  SNAM[4] 0x000adc8e (float 9.97475e-40)
  CITC[4] 0x00000005 (float 7.00649e-45)
  CTDA[32] floats ['2.86981e-25', '0', '9.66896e-44', '1.18149e-39', '0', '9.80909e-45', '0', '1.80515e-41']
  CTDA[32] floats ['2.86981e-25', '1', '1.00893e-43', '9.80909e-45', '0', '9.80909e-45', '0', '1.80515e-41']
  CTDA[32] floats ['2.86981e-25', '1', '9.94922e-44', '1.78773e-40', '0', '9.80909e-45', '0', '1.80515e-41']
  CTDA[32] floats ['2.86981e-25', '1', '9.94922e-44', '1.78773e-40', '0', '9.80909e-45', '0', '1.76928e-41']
  CTDA[32] floats ['2.86981e-25', '0', '7.84727e-44', '5.24416e-40', '0', '0', '0', 'nan']
  DNAM[4] 0x00020000 (float 1.83671e-40)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000001 (float 1.4013e-45)
  NNAM[4] 0x0005b5dc (float 5.24416e-40)
SMQN 0x000b0f5c dunLostValleyRedoubtNode
  PNAM[4] 0x00030b13 (float 2.79479e-40)
  SNAM[4] 0x000aa631 (float 9.77973e-40)
  CITC[4] 0x00000001 (float 1.4013e-45)
  CTDA[32] floats ['7.18574e-22', '1', '5.03066e-43', '1.44356e-40', '0', '0', '0', 'nan']
  DNAM[4] 0x00020000 (float 1.83671e-40)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000001 (float 1.4013e-45)
  NNAM[4] 0x000b0f5b (float 1.0157e-39)
SMQN 0x000b0e95 WIKillEventsNoRandomChanceSHARES
  PNAM[4] 0x0001e491 (float 1.7383e-40)
  SNAM[4] 0x00000000 (float 0)
  CITC[4] 0x00000000 (float 0)
  DNAM[4] 0x00020000 (float 1.83671e-40)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000001 (float 1.4013e-45)
  NNAM[4] 0x0001bff2 (float 1.60693e-40)
SMQN 0x000b0274 FavorSimpleDrunksNode
  PNAM[4] 0x0001379a (float 1.11782e-40)
  SNAM[4] 0x00047a26 (float 4.11161e-40)
  CITC[4] 0x00000001 (float 1.4013e-45)
  CTDA[32] floats ['1.41842e-27', '1', '8.07148e-43', '2.95404e-09', '1.01107e-39', '0', '0', 'nan']
  DNAM[4] 0x00000000 (float 0)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000001 (float 1.4013e-45)
  NNAM[4] 0x000b0270 (float 1.01106e-39)
SMQN 0x000ae003 WIFlatterQuestNode
  PNAM[4] 0x0005bd7c (float 5.27152e-40)
  SNAM[4] 0x00000000 (float 0)
  CITC[4] 0x00000004 (float 5.60519e-45)
  CTDA[32] floats ['8.81303e-25', '0', '5.03066e-43', '1.4446e-40', '0', '2.8026e-45', '2.8026e-44', 'nan']
  CTDA[32] floats ['8.81319e-25', '9.98711e-40', '1.079e-43', '0', '0', '0', '0', 'nan']
  CTDA[32] floats ['8.81316e-25', '7.9874e-44', '1.03696e-43', '9.98712e-40', '0', '0', '0', 'nan']
  CTDA[32] floats ['8.81303e-25', '1', '1.03696e-43', '3.09012e-40', '0', '0', '0', 'nan']
  DNAM[4] 0x00010001 (float 9.18369e-41)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000000 (float 0)
SMQN 0x000adc8e WIKillRunToCorpseSHARES
  PNAM[4] 0x00013010 (float 1.09077e-40)
  SNAM[4] 0x0001e490 (float 1.73828e-40)
  CITC[4] 0x00000005 (float 7.00649e-45)
  CTDA[32] floats ['8.81303e-25', '0', '5.03066e-43', '1.4446e-40', '0', '2.8026e-45', '2.8026e-44', 'nan']
  CTDA[32] floats ['8.81303e-25', '1', '1.03696e-43', '3.09012e-40', '0', '0', '0', 'nan']
  CTDA[32] floats ['8.81303e-25', '1', '7.84727e-43', '1.11773e-40', '0', '9.80909e-45', '0', '1.76928e-41']
  CTDA[32] floats ['8.81303e-25', '0', '9.94922e-44', '1.64294e-40', '0', '9.80909e-45', '0', '1.76928e-41']
  CTDA[32] floats ['8.81303e-25', '0', '9.94922e-44', '1.64295e-40', '0', '9.80909e-45', '0', '1.76928e-41']
  DNAM[4] 0x00020000 (float 1.83671e-40)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000001 (float 1.4013e-45)
  NNAM[4] 0x000adc8c (float 9.97472e-40)
SMQN 0x000aa631 dunLiarsRetreatNode
  PNAM[4] 0x00030b13 (float 2.79479e-40)
  SNAM[4] 0x000aa00d (float 9.7577e-40)
  CITC[4] 0x00000001 (float 1.4013e-45)
  CTDA[32] floats ['6.41508e-36', '1', '5.03066e-43', '1.44351e-40', '0', '0', '0', 'nan']
  DNAM[4] 0x00020000 (float 1.83671e-40)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000001 (float 1.4013e-45)
  NNAM[4] 0x000aa5d6 (float 9.77846e-40)
SMQN 0x000aa00d dunAlftandNode
  PNAM[4] 0x00030b13 (float 2.79479e-40)
  SNAM[4] 0x000a409f (float 9.41537e-40)
  CITC[4] 0x00000001 (float 1.4013e-45)
  CTDA[32] floats ['7.42747e-36', '1', '5.03066e-43', '1.43091e-40', '0', '0', '0', 'nan']
  DNAM[4] 0x00020000 (float 1.83671e-40)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000001 (float 1.4013e-45)
  NNAM[4] 0x0003b0fb (float 3.38995e-40)
SMQN 0x000a9b1a DA10HauntingNode
  PNAM[4] 0x0001379a (float 1.11782e-40)
  SNAM[4] 0x0007f3fd (float 7.30375e-40)
  CITC[4] 0x00000000 (float 0)
  DNAM[4] 0x00000000 (float 0)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000001 (float 1.4013e-45)
  NNAM[4] 0x0002bb38 (float 2.50832e-40)
SMQN 0x000a409f dunHaltedStreamCampNdode
  PNAM[4] 0x00030b13 (float 2.79479e-40)
  SNAM[4] 0x000a31cb (float 9.36217e-40)
  CITC[4] 0x00000001 (float 1.4013e-45)
  CTDA[32] floats ['7.32241e-36', '1', '5.03066e-43', '1.44058e-40', '0', '0', '0', 'nan']
  DNAM[4] 0x00020000 (float 1.83671e-40)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000001 (float 1.4013e-45)
  NNAM[4] 0x000a409d (float 9.41534e-40)
SMQN 0x000a3ee6 C00LocationMonitoringNode3
  PNAM[4] 0x0009002e (float 8.26584e-40)
  SNAM[4] 0x00102d5f (float 1.48564e-39)
  CITC[4] 0x00000005 (float 7.00649e-45)
  CTDA[32] floats ['8.68504e-26', '1', '8.07148e-43', '1.18744e-08', '1.41461e-40', '0', '0', 'nan']
  CTDA[32] floats ['8.68504e-26', '0', '8.07148e-43', '2.96859e-09', '1.41461e-40', '0', '0', 'nan']
  CTDA[32] floats ['8.68504e-26', '0', '8.07148e-43', '2.96859e-09', '1.09363e-40', '0', '0', 'nan']
  CTDA[32] floats ['8.68504e-26', '1', '9.94922e-44', '4.14473e-40', '0', '2.8026e-45', '2.8026e-44', 'nan']
  CTDA[32] floats ['8.68504e-26', '0', '8.81417e-43', '4.315e-40', '2.51406e-15', '0', '0', 'nan']
  CIS2[26] 3a3a53746f72795175657374497352756e6e696e675f76617200
  DNAM[4] 0x00020000 (float 1.83671e-40)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000001 (float 1.4013e-45)
  NNAM[4] 0x000a3ee5 (float 9.40917e-40)
SMQN 0x000a3ee3 C00LocationMonitoringNode2
  PNAM[4] 0x0009002e (float 8.26584e-40)
  SNAM[4] 0x000a3ee6 (float 9.40919e-40)
  CITC[4] 0x00000002 (float 2.8026e-45)
  CTDA[32] floats ['1.85911e-33', '0', '8.07148e-43', '1.18744e-08', '1.80968e-40', '0', '0', 'nan']
  CTDA[32] floats ['1.85911e-33', '100', '8.12753e-44', '4.315e-40', '0', '0', '0', 'nan']
  DNAM[4] 0x00020000 (float 1.83671e-40)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000001 (float 1.4013e-45)
  NNAM[4] 0x000a3ee4 (float 9.40916e-40)
SMQN 0x000a3ec6 C00LocationMonitoringNode1
  PNAM[4] 0x0009002e (float 8.26584e-40)
  SNAM[4] 0x000a3ee3 (float 9.40914e-40)
  CITC[4] 0x00000004 (float 5.60519e-45)
  CTDA[32] floats ['1.24053e-23', '0', '8.07148e-43', '1.18744e-08', '1.41461e-40', '0', '0', 'nan']
  CTDA[32] floats ['1.24053e-23', '0', '8.07148e-43', '2.96859e-09', '1.09363e-40', '0', '0', 'nan']
  CTDA[32] floats ['1.24053e-23', '0', '8.81417e-43', '4.315e-40', '1.44042e+07', '0', '0', 'nan']
  CIS2[28] floats ['1.61866e+25', '1.78596e+31', '249221', '4.28873e+33', '57.1118', '1.69615e+19', '1.05042e-38']
  CTDA[32] floats ['1.24054e-23', '40', '8.12753e-44', '4.315e-40', '0', '0', '0', 'nan']
  DNAM[4] 0x00020000 (float 1.83671e-40)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000001 (float 1.4013e-45)
  NNAM[4] 0x000a3ec5 (float 9.40872e-40)
SMQN 0x000a39c1 WIAssaultNodeA
  PNAM[4] 0x000a39c0 (float 9.39072e-40)
  SNAM[4] 0x00000000 (float 0)
  CITC[4] 0x00000000 (float 0)
  DNAM[4] 0x00010001 (float 9.18369e-41)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000002 (float 2.8026e-45)
  NNAM[4] 0x0002c493 (float 2.54189e-40)
  NNAM[4] 0x00039792 (float 3.2988e-40)
SMQN 0x000a31f1 MS13IntroSceneNode
  PNAM[4] 0x00090028 (float 8.26576e-40)
  SNAM[4] 0x0010481d (float 1.49524e-39)
  CITC[4] 0x00000001 (float 1.4013e-45)
  CTDA[32] floats ['7.63854e-26', '1', '8.07148e-43', '1.18744e-08', '1.09552e-40', '0', '0', 'nan']
  DNAM[4] 0x00020000 (float 1.83671e-40)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000001 (float 1.4013e-45)
  NNAM[4] 0x00038386 (float 3.22688e-40)
SMQN 0x000a31cb dunFaldarsToothNode
  PNAM[4] 0x00030b13 (float 2.79479e-40)
  SNAM[4] 0x000a31a3 (float 9.36161e-40)
  CITC[4] 0x00000001 (float 1.4013e-45)
  CTDA[32] floats ['5.59104e-36', '1', '5.03066e-43', '1.44016e-40', '0', '0', '0', 'nan']
  DNAM[4] 0x00020000 (float 1.83671e-40)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000001 (float 1.4013e-45)
  NNAM[4] 0x0004e667 (float 4.49995e-40)
SMQN 0x000a31a3 dunForelhostNode
  PNAM[4] 0x00030b13 (float 2.79479e-40)
  SNAM[4] 0x000a31a2 (float 9.3616e-40)
  CITC[4] 0x00000001 (float 1.4013e-45)
  CTDA[32] floats ['7.68149e-36', '1', '5.03066e-43', '1.44023e-40', '0', '0', '0', 'nan']
  DNAM[4] 0x00020000 (float 1.83671e-40)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000001 (float 1.4013e-45)
  NNAM[4] 0x00035354 (float 3.05399e-40)
SMQN 0x000a31a2 dunAnsilvundNode
  PNAM[4] 0x00030b13 (float 2.79479e-40)
  SNAM[4] 0x000786bb (float 6.91181e-40)
  CITC[4] 0x00000001 (float 1.4013e-45)
  CTDA[32] floats ['7.68186e-36', '1', '5.03066e-43', '1.5999e-40', '0', '0', '0', 'nan']
  DNAM[4] 0x00020000 (float 1.83671e-40)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000001 (float 1.4013e-45)
  NNAM[4] 0x0003d721 (float 3.5268e-40)
SMQN 0x000a17b2 WE100ObjQuestsNode
  PNAM[4] 0x0001379a (float 1.11782e-40)
  SNAM[4] 0x000896a8 (float 7.88729e-40)
  CITC[4] 0x00000001 (float 1.4013e-45)
  CTDA[32] floats ['5.28192e-37', '1', '8.07148e-43', '2.95404e-09', '9.26857e-40', '0', '0', 'nan']
  DNAM[4] 0x00000002 (float 2.8026e-45)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x0000000a (float 1.4013e-44)
  NNAM[4] 0x000a17ad (float 9.26848e-40)
  NNAM[4] 0x000a17b4 (float 9.26858e-40)
  NNAM[4] 0x000a17b5 (float 9.26859e-40)
  NNAM[4] 0x000a17b6 (float 9.26861e-40)
  NNAM[4] 0x000a17b7 (float 9.26862e-40)
  NNAM[4] 0x000a17b8 (float 9.26864e-40)
  NNAM[4] 0x000a17b9 (float 9.26865e-40)
  NNAM[4] 0x000a17ba (float 9.26866e-40)
  NNAM[4] 0x000a17bb (float 9.26868e-40)
  NNAM[4] 0x000a17bc (float 9.26869e-40)
SMQN 0x000a0e73 DA06IncreaseLevelNodeSHARES
  PNAM[4] 0x0005bd79 (float 5.27147e-40)
  SNAM[4] 0x0009e1ad (float 9.07477e-40)
  CITC[4] 0x00000001 (float 1.4013e-45)
  CTDA[32] floats ['1.21813e-17', '9.23536e-40', '1.12104e-43', '0', '0', '2.8026e-45', '2.8026e-44', 'nan']
  DNAM[4] 0x00020002 (float 1.83674e-40)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000001 (float 1.4013e-45)
  NNAM[4] 0x0003b681 (float 3.40977e-40)
SMQN 0x0009f362 WEDragonQuests
  PNAM[4] 0x000896a8 (float 7.88729e-40)
  SNAM[4] 0x000f8a84 (float 1.42722e-39)
  CITC[4] 0x00000003 (float 4.2039e-45)
  CTDA[32] floats ['0', '1', '1.03696e-43', '3.81805e-40', '0', '0', '0', 'nan']
  CTDA[32] floats ['0', '0', '1.03696e-43', '1.13852e-39', '0', '0', '0', 'nan']
  CTDA[32] floats ['1.84971e-43', '7.9874e-44', '1.03696e-43', '1.31495e-39', '0', '0', '0', 'nan']
  DNAM[4] 0x00010001 (float 9.18369e-41)
  XNAM[4] 0x00000001 (float 1.4013e-45)
  QNAM[4] 0x00000003 (float 4.2039e-45)
  NNAM[4] 0x0009a9c9 (float 8.87427e-40)
  NNAM[4] 0x0009c1b8 (float 8.96013e-40)
  NNAM[4] 0x0009cb5b (float 8.9947e-40)
SMQN 0x0009e1af DA02IncreaseLevelNodeSHARES
  PNAM[4] 0x0005bd79 (float 5.27147e-40)
  SNAM[4] 0x000a0e73 (float 9.23538e-40)
  CITC[4] 0x00000001 (float 1.4013e-45)
  CTDA[32] floats ['1.02781e-35', '9.07481e-40', '1.12104e-43', '0', '0', '2.8026e-45', '2.8026e-44', 'nan']
  DNAM[4] 0x00020000 (float 1.83671e-40)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000001 (float 1.4013e-45)
  NNAM[4] 0x0004d8d6 (float 4.45128e-40)
SMQN 0x0009e1ad DA09IncreaseLevelNodeSHARES
  PNAM[4] 0x0005bd79 (float 5.27147e-40)
  SNAM[4] 0x000dc9e1 (float 1.26628e-39)
  CITC[4] 0x00000001 (float 1.4013e-45)
  CTDA[32] floats ['4.22823e-36', '9.07478e-40', '1.12104e-43', '0', '0', '2.8026e-45', '2.8026e-44', 'nan']
  DNAM[4] 0x00020002 (float 1.83674e-40)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000001 (float 1.4013e-45)
  NNAM[4] 0x0004e4e1 (float 4.49448e-40)
SMQN 0x0009e0d6 DA11IntroSceneNode
  PNAM[4] 0x00090028 (float 8.26576e-40)
  SNAM[4] 0x0007d958 (float 7.20817e-40)
  CITC[4] 0x00000001 (float 1.4013e-45)
  CTDA[32] floats ['3.13683e-26', '1', '8.07148e-43', '1.18744e-08', '1.41465e-40', '0', '0', 'nan']
  DNAM[4] 0x00060000 (float 5.51013e-40)
  XNAM[4] 0x00000000 (float 0)
  MNAM[4] 0x00000002 (float 2.8026e-45)
  QNAM[4] 0x00000002 (float 2.8026e-45)
  NNAM[4] 0x0007d949 (float 7.20796e-40)
  NNAM[4] 0x000aec22 (float 1.00306e-39)
SMQN 0x0009d6f7 CR09LocationMonitoring
  PNAM[4] 0x0009002e (float 8.26584e-40)
  SNAM[4] 0x0005478d (float 4.84845e-40)
  CITC[4] 0x00000002 (float 2.8026e-45)
  CTDA[32] floats ['7.79343e-23', '1', '8.81417e-43', '4.315e-40', '2.10176e-09', '0', '0', 'nan']
  CIS2[32] floats ['1.59429e+31', '4.80238e+30', '1.04982e+12', '7.27314e+22', '1.74304e+28', '4.46311e+30', '1.76106e+19', '1.05042e-38']
  CTDA[32] floats ['7.79343e-23', '1', '9.12245e-43', '9.03636e-40', '0', '2.8026e-45', '2.8026e-44', 'nan']
  DNAM[4] 0x00020000 (float 1.83671e-40)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000001 (float 1.4013e-45)
  NNAM[4] 0x0009d6f6 (float 9.03633e-40)
SMQN 0x0009cb5f WE00TemplateNodeNOTforRealQuests
  PNAM[4] 0x000896a8 (float 7.88729e-40)
  SNAM[4] 0x00000000 (float 0)
  CITC[4] 0x00000001 (float 1.4013e-45)
  CTDA[32] floats ['4.34074e-16', '0', '1.03696e-43', '1.918e-40', '0', '0', '0', 'nan']
  DNAM[4] 0x00000000 (float 0)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000000 (float 0)
SMQN 0x0009b05f RoriksteadManorScenes
  PNAM[4] 0x00039c8a (float 3.31662e-40)
  SNAM[4] 0x0009b04a (float 8.8976e-40)
  CITC[4] 0x00000001 (float 1.4013e-45)
  CTDA[32] floats ['3.78708e-12', '1', '9.3887e-44', '1.12083e-40', '0', '9.80909e-45', '0', 'nan']
  DNAM[4] 0x00000001 (float 1.4013e-45)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000002 (float 2.8026e-45)
  NNAM[4] 0x00039df7 (float 3.32174e-40)
  NNAM[4] 0x0009b060 (float 8.89791e-40)
SMQN 0x0009b04a RoriksteadInnScenes
  PNAM[4] 0x00039c8a (float 3.31662e-40)
  SNAM[4] 0x0003a158 (float 3.33386e-40)
  CITC[4] 0x00000001 (float 1.4013e-45)
  CTDA[32] floats ['1.6838e-24', '1', '9.3887e-44', '1.12081e-40', '0', '9.80909e-45', '0', '1.76928e-41']
  DNAM[4] 0x00010001 (float 9.18369e-41)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000006 (float 8.40779e-45)
  NNAM[4] 0x0009b048 (float 8.89757e-40)
  NNAM[4] 0x0009b04b (float 8.89761e-40)
  NNAM[4] 0x0009b053 (float 8.89773e-40)
  NNAM[4] 0x0009b05b (float 8.89784e-40)
  NNAM[4] 0x0009b05d (float 8.89787e-40)
  NNAM[4] 0x0009b055 (float 8.89775e-40)
SMQN 0x00096ff5 DA07MuseumScenesNode
  PNAM[4] 0x00090028 (float 8.26576e-40)
  SNAM[4] 0x0001703e (float 1.321e-40)
  CITC[4] 0x00000003 (float 4.2039e-45)
  CTDA[32] floats ['0', '0', '7.60905e-43', '8.6664e-40', '0', '0', '0', 'nan']
  CTDA[32] floats ['0', '0', '7.84727e-44', '8.6664e-40', '0', '0', '0', 'nan']
  CTDA[32] floats ['0', '1', '8.07148e-43', '1.18744e-08', '2.0692e-40', '0', '0', 'nan']
  DNAM[4] 0x00020000 (float 1.83671e-40)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000001 (float 1.4013e-45)
  NNAM[4] 0x00096fd7 (float 8.6664e-40)
SMQN 0x00096593 RiverwoodIntroSceneNode
  PNAM[4] 0x0009002d (float 8.26583e-40)
  SNAM[4] 0x00000000 (float 0)
  CITC[4] 0x00000005 (float 7.00649e-45)
  CTDA[32] floats ['1.85914e-33', '50', '8.12753e-44', '4.4951e-40', '0', '0', '0', 'nan']
  CTDA[32] floats ['1.85911e-33', '0', '8.26766e-44', '8.56957e-40', '1.4013e-44', '0', '0', 'nan']
  CTDA[32] floats ['1.85913e-33', '8', '2.52234e-44', '0', '0', '0', '0', 'nan']
  CTDA[32] floats ['1.85914e-33', '20', '2.52234e-44', '0', '0', '0', '0', 'nan']
  CTDA[32] floats ['1.85911e-33', '1', '8.07148e-43', '1.18744e-08', '1.09552e-40', '0', '0', 'nan']
  DNAM[4] 0x00020000 (float 1.83671e-40)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000001 (float 1.4013e-45)
  NNAM[4] 0x000954d9 (float 8.56957e-40)
SMQN 0x00094d8f DA07StartNode
  PNAM[4] 0x00090028 (float 8.26576e-40)
  SNAM[4] 0x00096ff5 (float 8.66682e-40)
  CITC[4] 0x00000003 (float 4.2039e-45)
  CTDA[32] floats ['3.52754e-32', '0', '7.84727e-44', '8.54334e-40', '0', '0', '0', 'nan']
  CTDA[32] floats ['3.52754e-32', '0', '7.60905e-43', '8.54334e-40', '0', '0', '0', 'nan']
  CTDA[32] floats ['3.52756e-32', '20', '1.12104e-43', '0', '0', '2.8026e-45', '2.8026e-44', 'nan']
  DNAM[4] 0x00020000 (float 1.83671e-40)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000001 (float 1.4013e-45)
  NNAM[4] 0x00094d89 (float 8.54334e-40)
SMQN 0x00094bda DA10StartNode
  PNAM[4] 0x00090028 (float 8.26576e-40)
  SNAM[4] 0x0009e0d6 (float 9.07175e-40)
  CITC[4] 0x00000004 (float 5.60519e-45)
  CTDA[32] floats ['1.85911e-33', '1', '8.26766e-44', '1.00709e-39', '4.2039e-43', '0', '0', 'nan']
  CTDA[32] floats ['1.85911e-33', '1', '8.07148e-43', '2.96859e-09', '1.41465e-40', '0', '0', 'nan']
  CTDA[32] floats ['1.85911e-33', '0', '7.84727e-44', '2.00543e-40', '0', '0', '0', 'nan']
  CTDA[32] floats ['1.85911e-33', '0', '7.60905e-43', '2.00543e-40', '0', '0', '0', 'nan']
  DNAM[4] 0x00020000 (float 1.83671e-40)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000001 (float 1.4013e-45)
  NNAM[4] 0x00022f08 (float 2.00543e-40)
SMQN 0x000935f5 WhiterunCompanionsCatchall
  PNAM[4] 0x00018958 (float 1.41105e-40)
  SNAM[4] 0x0007f27d (float 7.29837e-40)
  CITC[4] 0x00000002 (float 2.8026e-45)
  CTDA[32] floats ['9.59982e-23', '1', '9.94922e-44', '4.14473e-40', '0', '9.80909e-45', '0', '1.76928e-41']
  CTDA[32] floats ['9.59982e-23', '1', '9.94922e-44', '4.14473e-40', '0', '9.80909e-45', '0', '1.80515e-41']
  DNAM[4] 0x00000000 (float 0)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000017 (float 3.22299e-44)
  NNAM[4] 0x000935f0 (float 8.45869e-40)
  RNAM[4] 0x44100000 (float 576)
  NNAM[4] 0x000935e6 (float 8.45855e-40)
  RNAM[4] 0x44100000 (float 576)
  NNAM[4] 0x000935ec (float 8.45863e-40)
  RNAM[4] 0x44100000 (float 576)
  NNAM[4] 0x000935e0 (float 8.45846e-40)
  RNAM[4] 0x44100000 (float 576)
  NNAM[4] 0x000935ea (float 8.4586e-40)
  RNAM[4] 0x44100000 (float 576)
  NNAM[4] 0x000935e4 (float 8.45852e-40)
  RNAM[4] 0x44100000 (float 576)
  NNAM[4] 0x000935ee (float 8.45866e-40)
  RNAM[4] 0x44100000 (float 576)
  NNAM[4] 0x000935e8 (float 8.45857e-40)
  RNAM[4] 0x44100000 (float 576)
  NNAM[4] 0x000935f2 (float 8.45871e-40)
  RNAM[4] 0x44100000 (float 576)
  NNAM[4] 0x000935de (float 8.45843e-40)
  RNAM[4] 0x44100000 (float 576)
  NNAM[4] 0x000935d8 (float 8.45835e-40)
  RNAM[4] 0x44100000 (float 576)
  NNAM[4] 0x000935dc (float 8.45841e-40)
  RNAM[4] 0x44100000 (float 576)
  NNAM[4] 0x000935da (float 8.45838e-40)
  RNAM[4] 0x44100000 (float 576)
  NNAM[4] 0x000935d6 (float 8.45832e-40)
  RNAM[4] 0x44100000 (float 576)
  NNAM[4] 0x000935e2 (float 8.45849e-40)
  RNAM[4] 0x44100000 (float 576)
  NNAM[4] 0x00093604 (float 8.45897e-40)
  RNAM[4] 0x44100000 (float 576)
  NNAM[4] 0x00093602 (float 8.45894e-40)
  RNAM[4] 0x44100000 (float 576)
  NNAM[4] 0x00093600 (float 8.45891e-40)
  RNAM[4] 0x44100000 (float 576)
  NNAM[4] 0x000935fe (float 8.45888e-40)
  RNAM[4] 0x44100000 (float 576)
  NNAM[4] 0x000935fc (float 8.45885e-40)
  RNAM[4] 0x44100000 (float 576)
  NNAM[4] 0x000935fa (float 8.45883e-40)
  RNAM[4] 0x44100000 (float 576)
  NNAM[4] 0x000935f8 (float 8.4588e-40)
  RNAM[4] 0x44100000 (float 576)
  NNAM[4] 0x000935f6 (float 8.45877e-40)
  RNAM[4] 0x44100000 (float 576)
SMQN 0x00092a51 EastmarchArrestHandlingNode
  PNAM[4] 0x0005bd7a (float 5.27149e-40)
  SNAM[4] 0x0008d5dc (float 8.11402e-40)
  CITC[4] 0x00000001 (float 1.4013e-45)
  CTDA[32] floats ['2.45958e-16', '1', '5.03066e-43', '1.28933e-40', '0', '2.8026e-45', '2.8026e-44', 'nan']
  DNAM[4] 0x00020000 (float 1.83671e-40)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000001 (float 1.4013e-45)
  NNAM[4] 0x00092a54 (float 8.41704e-40)
SMQN 0x0009248e DialogueFalkreathJarlsLonghouseScenes
  PNAM[4] 0x00092487 (float 8.39623e-40)
  SNAM[4] 0x0009248d (float 8.39631e-40)
  CITC[4] 0x00000001 (float 1.4013e-45)
  CTDA[32] floats ['1.73132e-19', '1', '7.91734e-43', '1.83953e-40', '0', '9.80909e-45', '0', '1.76928e-41']
  DNAM[4] 0x00010001 (float 9.18369e-41)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000003 (float 4.2039e-45)
  NNAM[4] 0x0002b9b9 (float 2.50296e-40)
  NNAM[4] 0x0002b9d7 (float 2.50338e-40)
  NNAM[4] 0x0002b9d8 (float 2.50339e-40)
SMQN 0x0009248d DialogueFalkreathHouseOfArkayScenes
  PNAM[4] 0x00092487 (float 8.39623e-40)
  SNAM[4] 0x0009248c (float 8.3963e-40)
  CITC[4] 0x00000001 (float 1.4013e-45)
  CTDA[32] floats ['1.73126e-19', '1', '7.91734e-43', '1.8395e-40', '0', '9.80909e-45', '0', '1.76928e-41']
  DNAM[4] 0x00010001 (float 9.18369e-41)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000003 (float 4.2039e-45)
  NNAM[4] 0x0002b9ba (float 2.50297e-40)
  NNAM[4] 0x0002b9d1 (float 2.50329e-40)
  NNAM[4] 0x0002b9e6 (float 2.50359e-40)
SMQN 0x0009248c DialogueFalkreathGrayPineGoodsScenes
  PNAM[4] 0x00092487 (float 8.39623e-40)
  SNAM[4] 0x0009248b (float 8.39629e-40)
  CITC[4] 0x00000001 (float 1.4013e-45)
  CTDA[32] floats ['1.73122e-19', '1', '7.91734e-43', '1.83947e-40', '0', '9.80909e-45', '0', '1.76928e-41']
  DNAM[4] 0x00010001 (float 9.18369e-41)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000001 (float 1.4013e-45)
  NNAM[4] 0x0002b9bf (float 2.50304e-40)
SMQN 0x0009248b DialogueFalkreathDengeirsHallScenes
  PNAM[4] 0x00092487 (float 8.39623e-40)
  SNAM[4] 0x0009248a (float 8.39627e-40)
  CITC[4] 0x00000001 (float 1.4013e-45)
  CTDA[32] floats ['1.73129e-19', '1', '7.91734e-43', '1.83939e-40', '0', '9.80909e-45', '0', '1.76928e-41']
  DNAM[4] 0x00010001 (float 9.18369e-41)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000003 (float 4.2039e-45)
  NNAM[4] 0x0002b9bb (float 2.50299e-40)
  NNAM[4] 0x0002b9da (float 2.50342e-40)
  NNAM[4] 0x0005a0c8 (float 5.16855e-40)
SMQN 0x0009248a DialogueFalkreathDeadMansDrinkScenes
  PNAM[4] 0x00092487 (float 8.39623e-40)
  SNAM[4] 0x00092489 (float 8.39626e-40)
  CITC[4] 0x00000001 (float 1.4013e-45)
  CTDA[32] floats ['1.29095e-16', '1', '5.03066e-43', '5.31695e-40', '0', '9.80909e-45', '0', '1.76928e-41']
  DNAM[4] 0x00010001 (float 9.18369e-41)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x0000000b (float 1.54143e-44)
  NNAM[4] 0x0002b9dd (float 2.50346e-40)
  NNAM[4] 0x0002b9be (float 2.50303e-40)
  NNAM[4] 0x0002b9de (float 2.50348e-40)
  NNAM[4] 0x0002b9df (float 2.50349e-40)
  NNAM[4] 0x0002b9e0 (float 2.5035e-40)
  NNAM[4] 0x0002b9e8 (float 2.50362e-40)
  NNAM[4] 0x0002b9e9 (float 2.50363e-40)
  NNAM[4] 0x0002b9ea (float 2.50364e-40)
  NNAM[4] 0x0002b9eb (float 2.50366e-40)
  NNAM[4] 0x00052b9c (float 4.74822e-40)
  NNAM[4] 0x00052b9f (float 4.74826e-40)
SMQN 0x00092489 DialogueFalkreathCorpselightFarmScenes
  PNAM[4] 0x00092487 (float 8.39623e-40)
  SNAM[4] 0x00092488 (float 8.39624e-40)
  CITC[4] 0x00000001 (float 1.4013e-45)
  CTDA[32] floats ['1.73112e-19', '1', '7.91734e-43', '1.83936e-40', '0', '9.80909e-45', '0', '1.76928e-41']
  DNAM[4] 0x00010001 (float 9.18369e-41)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000001 (float 1.4013e-45)
  NNAM[4] 0x0002b9e2 (float 2.50353e-40)
SMQN 0x00092488 DialogueFalkreathCemetaryScenes
  PNAM[4] 0x00092487 (float 8.39623e-40)
  SNAM[4] 0x00000000 (float 0)
  CITC[4] 0x00000001 (float 1.4013e-45)
  CTDA[32] floats ['1.73119e-19', '1', '7.91734e-43', '1.83933e-40', '0', '9.80909e-45', '0', '1.76928e-41']
  DNAM[4] 0x00010001 (float 9.18369e-41)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000002 (float 2.8026e-45)
  NNAM[4] 0x0002b9c2 (float 2.50308e-40)
  NNAM[4] 0x0002b9e5 (float 2.50357e-40)
SMQN 0x0008d5dc DB03JailNode
  PNAM[4] 0x0005bd7a (float 5.27149e-40)
  SNAM[4] 0x0010dcd7 (float 1.54859e-39)
  CITC[4] 0x00000001 (float 1.4013e-45)
  CTDA[32] floats ['3.05644e-24', '20000', '8.12753e-44', '1.75894e-40', '0', '0', '0', 'nan']
  DNAM[4] 0x00020000 (float 1.83671e-40)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000001 (float 1.4013e-45)
  NNAM[4] 0x0008d5da (float 8.11399e-40)
SMQN 0x000896a9 WEPriorityQuests
  PNAM[4] 0x000896a8 (float 7.88729e-40)
  SNAM[4] 0x00101732 (float 1.47769e-39)
  CITC[4] 0x00000001 (float 1.4013e-45)
  CTDA[32] floats ['0', '0', '1.03696e-43', '8.85804e-40', '0', '0', '0', 'nan']
  DNAM[4] 0x00010000 (float 9.18355e-41)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000003 (float 4.2039e-45)
  NNAM[4] 0x0004a602 (float 4.26894e-40)
  RNAM[4] 0x44d80000 (float 1728)
  NNAM[4] 0x0004eef6 (float 4.53065e-40)
  NNAM[4] 0x000bed92 (float 1.09541e-39)
SMQN 0x000880f2 CompanionsSingleCombatNode
  PNAM[4] 0x0001379a (float 1.11782e-40)
  SNAM[4] 0x000a17b2 (float 9.26855e-40)
  CITC[4] 0x00000001 (float 1.4013e-45)
  CTDA[32] floats ['4.65976e-24', '1', '8.07148e-43', '2.95404e-09', '7.80942e-40', '0', '0', 'nan']
  DNAM[4] 0x00020000 (float 1.83671e-40)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000001 (float 1.4013e-45)
  NNAM[4] 0x000880eb (float 7.80931e-40)
SMQN 0x0007f3fd MS08ArgueNode
  PNAM[4] 0x0001379a (float 1.11782e-40)
  SNAM[4] 0x0004c729 (float 4.38787e-40)
  CITC[4] 0x00000001 (float 1.4013e-45)
  CTDA[32] floats ['4.96996e-37', '10', '8.12753e-44', '1.66145e-40', '0', '0', '0', 'nan']
  DNAM[4] 0x00000000 (float 0)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000000 (float 0)
SMQN 0x0007d958 DA11HalloftheDeadSceneNode
  PNAM[4] 0x00090028 (float 8.26576e-40)
  SNAM[4] 0x000bac26 (float 1.07195e-39)
  CITC[4] 0x00000002 (float 2.8026e-45)
  CTDA[32] floats ['1.85911e-33', '10', '8.12753e-44', '7.20796e-40', '0', '0', '0', 'nan']
  CTDA[32] floats ['1.85911e-33', '1', '8.07148e-43', '1.18744e-08', '2.06661e-40', '0', '0', 'nan']
  DNAM[4] 0x00020000 (float 1.83671e-40)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000001 (float 1.4013e-45)
  NNAM[4] 0x0007d950 (float 7.20806e-40)
SMQN 0x00054ab1 CWPrepareCityNode
  PNAM[4] 0x000236a1 (float 2.03268e-40)
  SNAM[4] 0x000236a2 (float 2.0327e-40)
  CITC[4] 0x00000001 (float 1.4013e-45)
  CTDA[32] floats ['8.00499e-19', '1', '8.07148e-43', '2.95404e-09', '4.8597e-40', '0', '0', 'nan']
  DNAM[4] 0x00000002 (float 2.8026e-45)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000001 (float 1.4013e-45)
  NNAM[4] 0x00054aac (float 4.85965e-40)
SMQN 0x00054881 MS02MadanachEscapeSceneNode
  PNAM[4] 0x00090028 (float 8.26576e-40)
  SNAM[4] 0x0006bc1b (float 6.18493e-40)
  CITC[4] 0x00000003 (float 4.2039e-45)
  CTDA[32] floats ['3.08055e-27', '0', '6.44597e-44', '0', '0', '2.8026e-45', '1.46752e-40', 'nan']
  CTDA[32] floats ['3.08055e-27', '1', '7.84727e-44', '3.71061e-40', '0', '0', '0', 'nan']
  CTDA[32] floats ['3.08055e-27', '1', '8.07148e-43', '1.18744e-08', '1.29897e-39', '0', '0', 'nan']
  DNAM[4] 0x00020000 (float 1.83671e-40)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000001 (float 1.4013e-45)
  NNAM[4] 0x00054880 (float 4.85186e-40)
SMQN 0x00023edd BrotherMinersScenes
  PNAM[4] 0x0008690d (float 7.72369e-40)
  SNAM[4] 0x00023edc (float 2.06221e-40)
  CITC[4] 0x00000004 (float 5.60519e-45)
  CTDA[32] floats ['6.28342e-24', '1', '1.00893e-43', '1.55143e-40', '0', '9.80909e-45', '0', '1.76928e-41']
  CTDA[32] floats ['6.28342e-24', '1', '1.00893e-43', '1.55188e-40', '0', '9.80909e-45', '0', '1.76928e-41']
  CTDA[32] floats ['6.28342e-24', '1', '1.00893e-43', '1.55143e-40', '0', '9.80909e-45', '0', '1.80515e-41']
  CTDA[32] floats ['6.28342e-24', '1', '1.00893e-43', '1.55188e-40', '0', '9.80909e-45', '0', '1.80515e-41']
  DNAM[4] 0x00000001 (float 1.4013e-45)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000004 (float 5.60519e-45)
  NNAM[4] 0x00023ecd (float 2.062e-40)
  NNAM[4] 0x00023ecf (float 2.06202e-40)
  NNAM[4] 0x00023ed1 (float 2.06205e-40)
  NNAM[4] 0x00023ed3 (float 2.06208e-40)
SMQN 0x00023edc EvilAuntsScenes
  PNAM[4] 0x0008690d (float 7.72369e-40)
  SNAM[4] 0x00023edb (float 2.06219e-40)
  CITC[4] 0x00000004 (float 5.60519e-45)
  CTDA[32] floats ['6.28342e-24', '1', '1.00893e-43', '1.55139e-40', '0', '9.80909e-45', '0', '1.76928e-41']
  CTDA[32] floats ['6.28342e-24', '1', '1.00893e-43', '1.55138e-40', '0', '9.80909e-45', '0', '1.76928e-41']
  CTDA[32] floats ['6.28342e-24', '1', '1.00893e-43', '1.55139e-40', '0', '9.80909e-45', '0', '1.80515e-41']
  CTDA[32] floats ['6.28342e-24', '1', '1.00893e-43', '1.55138e-40', '0', '9.80909e-45', '0', '1.80515e-41']
  DNAM[4] 0x00000001 (float 1.4013e-45)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000007 (float 9.80909e-45)
  NNAM[4] 0x00023ed9 (float 2.06216e-40)
  NNAM[4] 0x00023ed7 (float 2.06214e-40)
  NNAM[4] 0x00023ed5 (float 2.06211e-40)
  NNAM[4] 0x00023ec5 (float 2.06188e-40)
  NNAM[4] 0x00023ec3 (float 2.06186e-40)
  NNAM[4] 0x00023ec1 (float 2.06183e-40)
  NNAM[4] 0x00023ebf (float 2.0618e-40)
SMQN 0x00023edb MauhulakhScenes
  PNAM[4] 0x0008690d (float 7.72369e-40)
  SNAM[4] 0x00000000 (float 0)
  CITC[4] 0x00000002 (float 2.8026e-45)
  CTDA[32] floats ['6.28342e-24', '1', '1.00893e-43', '1.55136e-40', '0', '9.80909e-45', '0', '1.76928e-41']
  CTDA[32] floats ['6.28342e-24', '1', '1.00893e-43', '1.55136e-40', '0', '9.80909e-45', '0', '1.80515e-41']
  DNAM[4] 0x00000001 (float 1.4013e-45)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x0000000a (float 1.4013e-44)
  NNAM[4] 0x00023ecb (float 2.06197e-40)
  NNAM[4] 0x00023ec9 (float 2.06194e-40)
  NNAM[4] 0x00023ec7 (float 2.06191e-40)
  NNAM[4] 0x00023ebd (float 2.06177e-40)
  NNAM[4] 0x00023ebb (float 2.06174e-40)
  NNAM[4] 0x00023eb9 (float 2.06172e-40)
  NNAM[4] 0x00023eb7 (float 2.06169e-40)
  NNAM[4] 0x00023eb5 (float 2.06166e-40)
  NNAM[4] 0x00023eb3 (float 2.06163e-40)
  NNAM[4] 0x00023eb0 (float 2.06159e-40)
SMQN 0x00023eb2 HollyfrostFarmScenes
  PNAM[4] 0x00023e90 (float 2.06114e-40)
  SNAM[4] 0x00023ea7 (float 2.06146e-40)
  CITC[4] 0x00000001 (float 1.4013e-45)
  CTDA[32] floats ['6.28342e-24', '1', '7.91734e-43', '1.42851e-40', '0', '9.80909e-45', '0', '1.76928e-41']
  DNAM[4] 0x00000001 (float 1.4013e-45)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000004 (float 5.60519e-45)
  NNAM[4] 0x00023ea8 (float 2.06148e-40)
  NNAM[4] 0x00023eaa (float 2.06151e-40)
  NNAM[4] 0x00023eac (float 2.06153e-40)
  NNAM[4] 0x00023eae (float 2.06156e-40)
SMQN 0x00023ea7 HlaaluFarmScenes
  PNAM[4] 0x00023e90 (float 2.06114e-40)
  SNAM[4] 0x00023e91 (float 2.06116e-40)
  CITC[4] 0x00000002 (float 2.8026e-45)
  CTDA[32] floats ['6.28342e-24', '1', '7.91734e-43', '1.4285e-40', '0', '9.80909e-45', '0', '1.76928e-41']
  CTDA[32] floats ['6.28342e-24', '1', '7.91734e-43', '1.4285e-40', '0', '9.80909e-45', '0', '1.80515e-41']
  DNAM[4] 0x00000001 (float 1.4013e-45)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000003 (float 4.2039e-45)
  NNAM[4] 0x00023ea1 (float 2.06138e-40)
  NNAM[4] 0x00023ea3 (float 2.06141e-40)
  NNAM[4] 0x00023ea5 (float 2.06144e-40)
SMQN 0x00023e91 BrandyMugScenes
  PNAM[4] 0x00023e90 (float 2.06114e-40)
  SNAM[4] 0x00000000 (float 0)
  CITC[4] 0x00000001 (float 1.4013e-45)
  CTDA[32] floats ['6.28342e-24', '1', '7.91734e-43', '1.42258e-40', '0', '9.80909e-45', '0', '1.76928e-41']
  DNAM[4] 0x00000001 (float 1.4013e-45)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000003 (float 4.2039e-45)
  NNAM[4] 0x00023e5e (float 2.06044e-40)
  NNAM[4] 0x00023e9f (float 2.06135e-40)
  NNAM[4] 0x00023e92 (float 2.06117e-40)
SMQN 0x00023e8f BraidwoodScenes
  PNAM[4] 0x0008063f (float 7.36925e-40)
  SNAM[4] 0x0008690b (float 7.72366e-40)
  CITC[4] 0x00000001 (float 1.4013e-45)
  CTDA[32] floats ['6.28342e-24', '1', '9.3887e-44', '1.12293e-40', '0', '9.80909e-45', '0', '1.76928e-41']
  DNAM[4] 0x00000001 (float 1.4013e-45)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000006 (float 8.40779e-45)
  NNAM[4] 0x00023e8c (float 2.06109e-40)
  NNAM[4] 0x00023e86 (float 2.061e-40)
  NNAM[4] 0x00023e83 (float 2.06096e-40)
  NNAM[4] 0x00023e81 (float 2.06093e-40)
  NNAM[4] 0x00023e7f (float 2.0609e-40)
  NNAM[4] 0x00023e7d (float 2.06088e-40)
SMQN 0x0008690c KjeldFamilyScenes
  PNAM[4] 0x0008063f (float 7.36925e-40)
  SNAM[4] 0x00023e8f (float 2.06113e-40)
  CITC[4] 0x00000000 (float 0)
  DNAM[4] 0x00000001 (float 1.4013e-45)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000006 (float 8.40779e-45)
  NNAM[4] 0x00023e7b (float 2.06085e-40)
  NNAM[4] 0x00023e79 (float 2.06082e-40)
  NNAM[4] 0x00023e77 (float 2.06079e-40)
  NNAM[4] 0x00023e6f (float 2.06068e-40)
  NNAM[4] 0x00023e6d (float 2.06065e-40)
  NNAM[4] 0x00023e6b (float 2.06062e-40)
SMQN 0x0008690b UrielSistersScenes
  PNAM[4] 0x0008063f (float 7.36925e-40)
  SNAM[4] 0x00080640 (float 7.36926e-40)
  CITC[4] 0x00000002 (float 2.8026e-45)
  CTDA[32] floats ['6.28342e-24', '1', '1.00893e-43', '1.11337e-40', '0', '9.80909e-45', '0', '1.76928e-41']
  CTDA[32] floats ['6.28342e-24', '1', '1.00893e-43', '1.14884e-40', '0', '9.80909e-45', '0', '1.76928e-41']
  DNAM[4] 0x00000001 (float 1.4013e-45)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000006 (float 8.40779e-45)
  NNAM[4] 0x000872a9 (float 7.75816e-40)
  NNAM[4] 0x00023e69 (float 2.0606e-40)
  NNAM[4] 0x00023e61 (float 2.06048e-40)
  NNAM[4] 0x00023e63 (float 2.06051e-40)
  NNAM[4] 0x00023e65 (float 2.06054e-40)
  NNAM[4] 0x00023e67 (float 2.06057e-40)
SMQN 0x00081c5a DA09ChangeLocationSharesEvent
  PNAM[4] 0x00090028 (float 8.26576e-40)
  SNAM[4] 0x00000000 (float 0)
  CITC[4] 0x00000002 (float 2.8026e-45)
  CTDA[32] floats ['2.79117e-23', '1', '7.84727e-44', '4.49448e-40', '0', '0', '0', 'nan']
  CTDA[32] floats ['2.79121e-23', '7.44852e-40', '1.079e-43', '0', '0', '0', '0', 'nan']
  DNAM[4] 0x00020000 (float 1.83671e-40)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000001 (float 1.4013e-45)
  NNAM[4] 0x00081c59 (float 7.44853e-40)
SMQN 0x00080640 SteamscorchMineScenes
  PNAM[4] 0x0008063f (float 7.36925e-40)
  SNAM[4] 0x00000000 (float 0)
  CITC[4] 0x00000001 (float 1.4013e-45)
  CTDA[32] floats ['4.06381e-36', '1', '5.03066e-43', '1.87268e-40', '0', '9.80909e-45', '0', '1.76928e-41']
  DNAM[4] 0x00000001 (float 1.4013e-45)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000008 (float 1.12104e-44)
  NNAM[4] 0x0008062f (float 7.36902e-40)
  NNAM[4] 0x00080631 (float 7.36905e-40)
  NNAM[4] 0x00080633 (float 7.36908e-40)
  NNAM[4] 0x00080635 (float 7.36911e-40)
  NNAM[4] 0x0008063d (float 7.36922e-40)
  NNAM[4] 0x0008063b (float 7.36919e-40)
  NNAM[4] 0x00080639 (float 7.36916e-40)
  NNAM[4] 0x00080637 (float 7.36913e-40)
SMQN 0x0007f27e WhiterunHouseGrayManeScenes
  PNAM[4] 0x00018958 (float 1.41105e-40)
  SNAM[4] 0x00000000 (float 0)
  CITC[4] 0x00000001 (float 1.4013e-45)
  CTDA[32] floats ['2.72156e-35', '1', '5.03066e-43', '1.80964e-40', '0', '9.80909e-45', '0', '1.76928e-41']
  DNAM[4] 0x00010001 (float 9.18369e-41)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000002 (float 2.8026e-45)
  NNAM[4] 0x0007f279 (float 7.29831e-40)
  RNAM[4] 0x44100000 (float 576)
  NNAM[4] 0x0007f27b (float 7.29834e-40)
  RNAM[4] 0x44100000 (float 576)
SMQN 0x0007f27d WhiterunHouseBattleBornScenes
  PNAM[4] 0x00018958 (float 1.41105e-40)
  SNAM[4] 0x0007ec98 (float 7.27722e-40)
  CITC[4] 0x00000001 (float 1.4013e-45)
  CTDA[32] floats ['9.59982e-23', '1', '9.3887e-44', '1.28313e-40', '0', '9.80909e-45', '0', '1.76928e-41']
  DNAM[4] 0x00010001 (float 9.18369e-41)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000002 (float 2.8026e-45)
  NNAM[4] 0x0007f275 (float 7.29826e-40)
  RNAM[4] 0x44100000 (float 576)
  NNAM[4] 0x0007f277 (float 7.29828e-40)
  RNAM[4] 0x44100000 (float 576)
SMQN 0x0007ec98 WhiterunMarketplaceScenes
  PNAM[4] 0x00018958 (float 1.41105e-40)
  SNAM[4] 0x0007ec97 (float 7.27721e-40)
  CITC[4] 0x00000000 (float 0)
  DNAM[4] 0x00000001 (float 1.4013e-45)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x0000000f (float 2.10195e-44)
  NNAM[4] 0x0007ec69 (float 7.27656e-40)
  RNAM[4] 0x44100000 (float 576)
  NNAM[4] 0x0007ec6b (float 7.27659e-40)
  RNAM[4] 0x44100000 (float 576)
  NNAM[4] 0x0007ec6d (float 7.27662e-40)
  RNAM[4] 0x44100000 (float 576)
  NNAM[4] 0x0007ec6f (float 7.27665e-40)
  RNAM[4] 0x44100000 (float 576)
  NNAM[4] 0x000a2bc0 (float 9.3405e-40)
  RNAM[4] 0x44100000 (float 576)
  NNAM[4] 0x000a2bc2 (float 9.34052e-40)
  RNAM[4] 0x44100000 (float 576)
  NNAM[4] 0x000a2bc4 (float 9.34055e-40)
  RNAM[4] 0x44100000 (float 576)
  NNAM[4] 0x000a2bc6 (float 9.34058e-40)
  RNAM[4] 0x44100000 (float 576)
  NNAM[4] 0x000a2bc8 (float 9.34061e-40)
  RNAM[4] 0x44100000 (float 576)
  NNAM[4] 0x000a2bca (float 9.34064e-40)
  RNAM[4] 0x44100000 (float 576)
  NNAM[4] 0x000a2cd8 (float 9.34442e-40)
  RNAM[4] 0x44100000 (float 576)
  NNAM[4] 0x000d2abe (float 1.20919e-39)
  RNAM[4] 0x44100000 (float 576)
  NNAM[4] 0x000e0da5 (float 1.29059e-39)
  RNAM[4] 0x44100000 (float 576)
  NNAM[4] 0x000e0da9 (float 1.2906e-39)
  RNAM[4] 0x44100000 (float 576)
  NNAM[4] 0x000e0da7 (float 1.29059e-39)
  RNAM[4] 0x44100000 (float 576)
SMQN 0x0007ec97 WhiterunVignarsHouseScenes
  PNAM[4] 0x00018958 (float 1.41105e-40)
  SNAM[4] 0x0007ec96 (float 7.2772e-40)
  CITC[4] 0x00000001 (float 1.4013e-45)
  CTDA[32] floats ['2.72156e-35', '1', '9.3887e-44', '1.28321e-40', '0', '9.80909e-45', '0', '1.76928e-41']
  DNAM[4] 0x00010001 (float 9.18369e-41)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000003 (float 4.2039e-45)
  NNAM[4] 0x0007ec85 (float 7.27696e-40)
  RNAM[4] 0x44100000 (float 576)
  NNAM[4] 0x0007ec87 (float 7.27698e-40)
  RNAM[4] 0x44100000 (float 576)
  NNAM[4] 0x0007ec89 (float 7.27701e-40)
  RNAM[4] 0x44100000 (float 576)
SMQN 0x0007ec96 WhiterunStablesScenes
  PNAM[4] 0x00018958 (float 1.41105e-40)
  SNAM[4] 0x0007ec94 (float 7.27717e-40)
  CITC[4] 0x00000001 (float 1.4013e-45)
  CTDA[32] floats ['2.72156e-35', '1', '9.3887e-44', '1.28292e-40', '0', '9.80909e-45', '0', '1.76928e-41']
  DNAM[4] 0x00010001 (float 9.18369e-41)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000004 (float 5.60519e-45)
  NNAM[4] 0x0007ec63 (float 7.27648e-40)
  RNAM[4] 0x44100000 (float 576)
  NNAM[4] 0x0007ec65 (float 7.27651e-40)
  RNAM[4] 0x44100000 (float 576)
  NNAM[4] 0x0007ec67 (float 7.27654e-40)
  RNAM[4] 0x44100000 (float 576)
  NNAM[4] 0x0007ec71 (float 7.27668e-40)
  RNAM[4] 0x44100000 (float 576)
SMQN 0x0007ec95 WhiterunMiscScenes
  PNAM[4] 0x00018958 (float 1.41105e-40)
  SNAM[4] 0x0007f27e (float 7.29838e-40)
  CITC[4] 0x00000002 (float 2.8026e-45)
  CTDA[32] floats ['9.59982e-23', '1', '1.00893e-43', '1.13238e-40', '0', '9.80909e-45', '0', '1.76928e-41']
  CTDA[32] floats ['9.59982e-23', '1', '1.00893e-43', '1.13246e-40', '0', '9.80909e-45', '0', '1.76928e-41']
  DNAM[4] 0x00010001 (float 9.18369e-41)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000003 (float 4.2039e-45)
  NNAM[4] 0x0007ec79 (float 7.27679e-40)
  RNAM[4] 0x44100000 (float 576)
  NNAM[4] 0x0007ec7b (float 7.27682e-40)
  RNAM[4] 0x44100000 (float 576)
  NNAM[4] 0x0007ec7d (float 7.27684e-40)
  RNAM[4] 0x44100000 (float 576)
SMQN 0x0007ec94 WhiterunAmrenHouseScenes
  PNAM[4] 0x00018958 (float 1.41105e-40)
  SNAM[4] 0x00019fdb (float 1.49181e-40)
  CITC[4] 0x00000001 (float 1.4013e-45)
  CTDA[32] floats ['2.72156e-35', '1', '9.3887e-44', '1.28307e-40', '0', '9.80909e-45', '0', '1.76928e-41']
  DNAM[4] 0x00010001 (float 9.18369e-41)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000004 (float 5.60519e-45)
  NNAM[4] 0x0007ec8b (float 7.27704e-40)
  RNAM[4] 0x44100000 (float 576)
  NNAM[4] 0x0007ec91 (float 7.27713e-40)
  RNAM[4] 0x44100000 (float 576)
  NNAM[4] 0x0007ec8d (float 7.27707e-40)
  RNAM[4] 0x44100000 (float 576)
  NNAM[4] 0x0007ec8f (float 7.2771e-40)
  RNAM[4] 0x44100000 (float 576)
SMQN 0x0007ec93 WhiterunDrunkenHuntsmenScenes
  PNAM[4] 0x00018958 (float 1.41105e-40)
  SNAM[4] 0x0007ec95 (float 7.27718e-40)
  CITC[4] 0x00000001 (float 1.4013e-45)
  CTDA[32] floats ['2.72156e-35', '1', '9.3887e-44', '1.28324e-40', '0', '9.80909e-45', '0', '1.76928e-41']
  DNAM[4] 0x00000001 (float 1.4013e-45)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000003 (float 4.2039e-45)
  NNAM[4] 0x0007ec73 (float 7.2767e-40)
  RNAM[4] 0x44100000 (float 576)
  NNAM[4] 0x0007ec75 (float 7.27673e-40)
  RNAM[4] 0x44100000 (float 576)
  NNAM[4] 0x0007ec77 (float 7.27676e-40)
  RNAM[4] 0x44100000 (float 576)
SMQN 0x0007ea5e CWEscapeCityNode
  PNAM[4] 0x000236a1 (float 2.03268e-40)
  SNAM[4] 0x0004f8c1 (float 4.56578e-40)
  CITC[4] 0x00000001 (float 1.4013e-45)
  CTDA[32] floats ['2.43289e-21', '1', '8.07148e-43', '2.95404e-09', '7.22121e-40', '0', '0', 'nan']
  DNAM[4] 0x00000002 (float 2.8026e-45)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000001 (float 1.4013e-45)
  NNAM[4] 0x0007ea5d (float 7.26922e-40)
SMQN 0x0007e32d CWSiegeQuestsNode
  PNAM[4] 0x000236a1 (float 2.03268e-40)
  SNAM[4] 0x000d1450 (float 1.20115e-39)
  CITC[4] 0x00000001 (float 1.4013e-45)
  CTDA[32] floats ['3.2285e-35', '1', '8.07148e-43', '2.95404e-09', '7.24342e-40', '0', '0', 'nan']
  DNAM[4] 0x00000002 (float 2.8026e-45)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000001 (float 1.4013e-45)
  NNAM[4] 0x000954e1 (float 8.56968e-40)
SMQN 0x00078f54 GoldenrockMineScenes
  PNAM[4] 0x00077f8b (float 6.88602e-40)
  SNAM[4] 0x00077fa0 (float 6.88632e-40)
  CITC[4] 0x00000000 (float 0)
  DNAM[4] 0x00000001 (float 1.4013e-45)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000003 (float 4.2039e-45)
  NNAM[4] 0x00078f4a (float 6.94251e-40)
  NNAM[4] 0x00078f4c (float 6.94254e-40)
  NNAM[4] 0x00078f4e (float 6.94257e-40)
SMQN 0x000786bb PinewatchNode
  PNAM[4] 0x00030b13 (float 2.79479e-40)
  SNAM[4] 0x0003a17e (float 3.33439e-40)
  CITC[4] 0x00000001 (float 1.4013e-45)
  CTDA[32] floats ['1.02002e-35', '1', '5.03066e-43', '1.44404e-40', '0', '9.80909e-45', '0', '1.76928e-41']
  DNAM[4] 0x00020000 (float 1.83671e-40)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000001 (float 1.4013e-45)
  NNAM[4] 0x000786b9 (float 6.91178e-40)
SMQN 0x00077fa0 HrefnaScenes
  PNAM[4] 0x00077f8b (float 6.88602e-40)
  SNAM[4] 0x00077f9f (float 6.8863e-40)
  CITC[4] 0x00000000 (float 0)
  DNAM[4] 0x00000001 (float 1.4013e-45)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000003 (float 4.2039e-45)
  NNAM[4] 0x00077f97 (float 6.88619e-40)
  NNAM[4] 0x00077f99 (float 6.88622e-40)
  NNAM[4] 0x00077f9d (float 6.88627e-40)
SMQN 0x00077f9f InnScenes
  PNAM[4] 0x00077f8b (float 6.88602e-40)
  SNAM[4] 0x00077f8c (float 6.88604e-40)
  CITC[4] 0x00000000 (float 0)
  DNAM[4] 0x00000001 (float 1.4013e-45)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000002 (float 2.8026e-45)
  NNAM[4] 0x00078f52 (float 6.94262e-40)
  NNAM[4] 0x00078f50 (float 6.94259e-40)
SMQN 0x00077f8c FishingHoleScenes
  PNAM[4] 0x00077f8b (float 6.88602e-40)
  SNAM[4] 0x00000000 (float 0)
  CITC[4] 0x00000000 (float 0)
  DNAM[4] 0x00000001 (float 1.4013e-45)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000000 (float 0)
SMQN 0x0004c729 WIFollowerCommentNode
  PNAM[4] 0x0001379a (float 1.11782e-40)
  SNAM[4] 0x00047ae9 (float 4.11434e-40)
  CITC[4] 0x00000000 (float 0)
  DNAM[4] 0x00000000 (float 0)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000003 (float 4.2039e-45)
  NNAM[4] 0x0004c49d (float 4.37874e-40)
  NNAM[4] 0x0004c6eb (float 4.387e-40)
  NNAM[4] 0x0004c727 (float 4.38784e-40)
SMQN 0x0007431c RelationshipMarriageNode
  PNAM[4] 0x00025e22 (float 2.17439e-40)
  SNAM[4] 0x00000000 (float 0)
  CITC[4] 0x00000002 (float 2.8026e-45)
  CTDA[32] floats ['4.06697e-27', '1', '9.94922e-44', '6.6692e-40', '0', '9.80909e-45', '0', '1.76928e-41']
  CTDA[32] floats ['4.06697e-27', '1', '9.94922e-44', '6.6692e-40', '0', '9.80909e-45', '0', '1.80515e-41']
  DNAM[4] 0x00000000 (float 0)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000001 (float 1.4013e-45)
  NNAM[4] 0x0007431b (float 6.66921e-40)
SMQN 0x00071227 RiftenBeggarConversations
  PNAM[4] 0x00046e0f (float 4.06824e-40)
  SNAM[4] 0x000517a0 (float 4.67653e-40)
  CITC[4] 0x00000001 (float 1.4013e-45)
  CTDA[32] floats ['8.36413e-26', '1', '5.03066e-43', '1.41464e-40', '0', '9.80909e-45', '0', '1.76928e-41']
  DNAM[4] 0x00000001 (float 1.4013e-45)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000002 (float 2.8026e-45)
  NNAM[4] 0x00071226 (float 6.49359e-40)
  NNAM[4] 0x00071228 (float 6.49362e-40)
SMQN 0x00070221 WIActorDialogueQuestNode
  PNAM[4] 0x00070222 (float 6.43614e-40)
  SNAM[4] 0x000dee9d (float 1.27946e-39)
  CITC[4] 0x00000000 (float 0)
  DNAM[4] 0x00000000 (float 0)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000001 (float 1.4013e-45)
  NNAM[4] 0x00070223 (float 6.43615e-40)
SMQN 0x0007021a WICastMagicNodeA
  PNAM[4] 0x00070216 (float 6.43597e-40)
  SNAM[4] 0x00000000 (float 0)
  CITC[4] 0x00000000 (float 0)
  DNAM[4] 0x00030001 (float 2.75508e-40)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000004 (float 5.60519e-45)
  NNAM[4] 0x00023ee4 (float 2.06232e-40)
  NNAM[4] 0x000167d3 (float 1.29081e-40)
  NNAM[4] 0x000ab3fa (float 9.82918e-40)
  NNAM[4] 0x00070217 (float 6.43598e-40)
  RNAM[4] 0x44900000 (float 1152)
SMQN 0x0006ec60 dunDA06FallowstoneCaveNode
  PNAM[4] 0x00030b13 (float 2.79479e-40)
  SNAM[4] 0x0004838f (float 4.14536e-40)
  CITC[4] 0x00000001 (float 1.4013e-45)
  CTDA[32] floats ['1.71373e-18', '1', '5.03066e-43', '1.44017e-40', '0', '0', '0', 'nan']
  DNAM[4] 0x00020000 (float 1.83671e-40)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000000 (float 0)
SMQN 0x0006e835 FreeformLeftHandMine
  PNAM[4] 0x0009002a (float 8.26578e-40)
  SNAM[4] 0x000279de (float 2.27389e-40)
  CITC[4] 0x00000001 (float 1.4013e-45)
  CTDA[32] floats ['8.69656e-26', '1', '8.07148e-43', '1.18744e-08', '1.42857e-40', '0', '0', 'nan']
  DNAM[4] 0x00020000 (float 1.83671e-40)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000001 (float 1.4013e-45)
  NNAM[4] 0x0001fd72 (float 1.82755e-40)
SMQN 0x0006d1e7 WIScriptEventQuestNode
  PNAM[4] 0x0006d1e6 (float 6.2631e-40)
  SNAM[4] 0x00000000 (float 0)
  CITC[4] 0x00000000 (float 0)
  DNAM[4] 0x00000000 (float 0)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000006 (float 8.40779e-45)
  NNAM[4] 0x000a3c4b (float 9.39984e-40)
  NNAM[4] 0x0006d1e1 (float 6.26303e-40)
  NNAM[4] 0x0006f8f2 (float 6.40318e-40)
  NNAM[4] 0x000ae004 (float 9.98717e-40)
  NNAM[4] 0x0004b869 (float 4.33496e-40)
  NNAM[4] 0x00050ce3 (float 4.638e-40)
SMQN 0x0006b94e GenericArrestNode
  PNAM[4] 0x0006b369 (float 6.15373e-40)
  SNAM[4] 0x000b882c (float 1.05904e-39)
  CITC[4] 0x00000000 (float 0)
  DNAM[4] 0x00000000 (float 0)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000001 (float 1.4013e-45)
  NNAM[4] 0x0006b94b (float 6.17484e-40)
SMQN 0x0006b19e CWActorDialogueSoldiersNode
  PNAM[4] 0x00015fce (float 1.26204e-40)
  SNAM[4] 0x000bc3ee (float 1.08048e-39)
  CITC[4] 0x00000002 (float 2.8026e-45)
  CTDA[32] floats ['6.08404e-22', '1', '9.94922e-44', '6.14705e-40', '0', '9.80909e-45', '0', '1.76928e-41']
  CTDA[32] floats ['6.08404e-22', '1', '9.94922e-44', '6.14705e-40', '0', '9.80909e-45', '0', '1.80515e-41']
  DNAM[4] 0x00010001 (float 9.18369e-41)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000002 (float 2.8026e-45)
  NNAM[4] 0x0006a270 (float 6.09285e-40)
  NNAM[4] 0x000fc076 (float 1.44657e-39)
SMQN 0x0006b19c CWActorHelloSoldiersNode
  PNAM[4] 0x0006b19b (float 6.14726e-40)
  SNAM[4] 0x00000000 (float 0)
  CITC[4] 0x00000002 (float 2.8026e-45)
  CTDA[32] floats ['5.78406e-22', '1', '9.94922e-44', '6.14705e-40', '0', '9.80909e-45', '0', '1.76928e-41']
  CTDA[32] floats ['5.78406e-22', '1', '9.94922e-44', '6.14705e-40', '0', '9.80909e-45', '0', '1.80515e-41']
  DNAM[4] 0x00000001 (float 1.4013e-45)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000001 (float 1.4013e-45)
  NNAM[4] 0x0006b190 (float 6.1471e-40)
SMQN 0x0006a792 ShorsStoneTownConversations
  PNAM[4] 0x0006a790 (float 6.11123e-40)
  SNAM[4] 0x00000000 (float 0)
  CITC[4] 0x00000001 (float 1.4013e-45)
  CTDA[32] floats ['1.67642e-25', '1', '5.03066e-43', '1.41447e-40', '0', '9.80909e-45', '0', '1.76928e-41']
  DNAM[4] 0x00010001 (float 9.18369e-41)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000006 (float 8.40779e-45)
  NNAM[4] 0x0006a784 (float 6.11106e-40)
  NNAM[4] 0x0006a786 (float 6.11109e-40)
  NNAM[4] 0x0006a788 (float 6.11112e-40)
  NNAM[4] 0x0006a78a (float 6.11115e-40)
  NNAM[4] 0x0006a78c (float 6.11117e-40)
  NNAM[4] 0x0006a78e (float 6.1112e-40)
SMQN 0x000695e5 OldHroldanHangedManInnScenes
  PNAM[4] 0x0004b118 (float 4.30871e-40)
  SNAM[4] 0x00000000 (float 0)
  CITC[4] 0x00000000 (float 0)
  DNAM[4] 0x00010001 (float 9.18369e-41)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000002 (float 2.8026e-45)
  NNAM[4] 0x000695f1 (float 6.04802e-40)
  RNAM[4] 0x44100000 (float 576)
  NNAM[4] 0x000695f3 (float 6.04805e-40)
  RNAM[4] 0x44100000 (float 576)
SMQN 0x000681db FreeformFrostRiver01
  PNAM[4] 0x0009002a (float 8.26578e-40)
  SNAM[4] 0x000b555d (float 1.04081e-39)
  CITC[4] 0x00000004 (float 5.60519e-45)
  CTDA[32] floats ['1.13939e-24', '0', '7.84727e-44', '5.97587e-40', '0', '0', '0', 'nan']
  CTDA[32] floats ['1.13939e-24', '1', '8.07148e-43', '1.18744e-08', '1.42843e-40', '0', '0', 'nan']
  CTDA[32] floats ['1.13941e-24', '7.9874e-44', '1.03696e-43', '5.97592e-40', '0', '0', '0', 'nan']
  CTDA[32] floats ['1.13939e-24', '0', '1.03696e-43', '5.97592e-40', '0', '0', '0', 'nan']
  DNAM[4] 0x00020000 (float 1.83671e-40)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000001 (float 1.4013e-45)
  NNAM[4] 0x000681d4 (float 5.97587e-40)
SMQN 0x00067739 IvarsteadFellstarFarmScenes
  PNAM[4] 0x00067735 (float 5.93776e-40)
  SNAM[4] 0x00067738 (float 5.93781e-40)
  CITC[4] 0x00000001 (float 1.4013e-45)
  CTDA[32] floats ['1.67642e-25', '1', '5.03066e-43', '1.41446e-40', '0', '9.80909e-45', '0', '1.76928e-41']
  DNAM[4] 0x00010001 (float 9.18369e-41)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000003 (float 4.2039e-45)
  NNAM[4] 0x00067727 (float 5.93757e-40)
  NNAM[4] 0x00067729 (float 5.9376e-40)
  NNAM[4] 0x0006772b (float 5.93762e-40)
SMQN 0x00067738 IvarsteadKlimmeksHouseScenes
  PNAM[4] 0x00067735 (float 5.93776e-40)
  SNAM[4] 0x00067737 (float 5.93779e-40)
  CITC[4] 0x00000001 (float 1.4013e-45)
  CTDA[32] floats ['1.67642e-25', '1', '5.03066e-43', '1.97533e-40', '0', '9.80909e-45', '0', '1.76928e-41']
  DNAM[4] 0x00010001 (float 9.18369e-41)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000002 (float 2.8026e-45)
  NNAM[4] 0x0006772d (float 5.93765e-40)
  NNAM[4] 0x0006772f (float 5.93768e-40)
SMQN 0x00067737 IvarsteadTembasMillScenes
  PNAM[4] 0x00067735 (float 5.93776e-40)
  SNAM[4] 0x00067736 (float 5.93778e-40)
  CITC[4] 0x00000001 (float 1.4013e-45)
  CTDA[32] floats ['1.67642e-25', '1', '5.03066e-43', '1.41446e-40', '0', '9.80909e-45', '0', '1.76928e-41']
  DNAM[4] 0x00010001 (float 9.18369e-41)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000002 (float 2.8026e-45)
  NNAM[4] 0x00067731 (float 5.93771e-40)
  NNAM[4] 0x00067733 (float 5.93774e-40)
SMQN 0x00067736 IvarsteadVilemyrInnScenes
  PNAM[4] 0x00067735 (float 5.93776e-40)
  SNAM[4] 0x00000000 (float 0)
  CITC[4] 0x00000001 (float 1.4013e-45)
  CTDA[32] floats ['1.67642e-25', '1', '5.03066e-43', '1.97541e-40', '0', '9.80909e-45', '0', '1.76928e-41']
  DNAM[4] 0x00010001 (float 9.18369e-41)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000007 (float 9.80909e-45)
  NNAM[4] 0x0006771b (float 5.9374e-40)
  NNAM[4] 0x0006771d (float 5.93743e-40)
  NNAM[4] 0x0006771f (float 5.93746e-40)
  NNAM[4] 0x00067721 (float 5.93748e-40)
  NNAM[4] 0x00067723 (float 5.93751e-40)
  NNAM[4] 0x00067725 (float 5.93754e-40)
  NNAM[4] 0x00043d2f (float 3.89291e-40)
SMQN 0x000674e8 CWTutorialMissionNode
  PNAM[4] 0x000236a1 (float 2.03268e-40)
  SNAM[4] 0x0005a82e (float 5.19509e-40)
  CITC[4] 0x00000002 (float 2.8026e-45)
  CTDA[32] floats ['6.37955e-24', '1', '8.07148e-43', '2.95404e-09', '5.92954e-40', '0', '0', 'nan']
  CTDA[32] floats ['6.37955e-24', '0', '8.81417e-43', '1.48632e-40', '2.85962e-05', '0', '0', 'nan']
  CIS2[30] 3a3a5475746f7269616c4d697373696f6e436f6d706c6574655f76617200
  DNAM[4] 0x00000000 (float 0)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000000 (float 0)
SMQN 0x00065723 WinterholdBirnasHouseScenes
  PNAM[4] 0x00037ed5 (float 3.21005e-40)
  SNAM[4] 0x00038790 (float 3.24137e-40)
  CITC[4] 0x00000001 (float 1.4013e-45)
  CTDA[32] floats ['3.87699e-32', '1', '9.3887e-44', '1.11951e-40', '0', '9.80909e-45', '0', '1.76928e-41']
  DNAM[4] 0x00000001 (float 1.4013e-45)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000004 (float 5.60519e-45)
  NNAM[4] 0x0006571d (float 5.82263e-40)
  NNAM[4] 0x0006571f (float 5.82266e-40)
  NNAM[4] 0x00065724 (float 5.82273e-40)
  NNAM[4] 0x00065726 (float 5.82276e-40)
SMQN 0x0006531c WinterholdFFCFin
  PNAM[4] 0x0009002a (float 8.26578e-40)
  SNAM[4] 0x0005d2e8 (float 5.34836e-40)
  CITC[4] 0x00000002 (float 2.8026e-45)
  CTDA[32] floats ['4.47643e-32', '1', '8.26766e-44', '5.7923e-40', '5.60519e-44', '0', '0', 'nan']
  CTDA[32] floats ['4.47643e-32', '1', '8.07148e-43', '1.18744e-08', '1.41454e-40', '0', '0', 'nan']
  DNAM[4] 0x00020000 (float 1.83671e-40)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000001 (float 1.4013e-45)
  NNAM[4] 0x0006531d (float 5.80828e-40)
SMQN 0x00063b3a KarthwastenMinersScenes
  PNAM[4] 0x000622fc (float 5.63563e-40)
  SNAM[4] 0x00063b26 (float 5.72231e-40)
  CITC[4] 0x00000000 (float 0)
  DNAM[4] 0x00010001 (float 9.18369e-41)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x0000000b (float 1.54143e-44)
  NNAM[4] 0x00063b31 (float 5.72247e-40)
  NNAM[4] 0x00063b33 (float 5.7225e-40)
  NNAM[4] 0x00063b35 (float 5.72252e-40)
  NNAM[4] 0x00063b37 (float 5.72255e-40)
  NNAM[4] 0x00063b14 (float 5.72206e-40)
  NNAM[4] 0x00063b16 (float 5.72209e-40)
  NNAM[4] 0x00063b18 (float 5.72212e-40)
  NNAM[4] 0x00063b39 (float 5.72258e-40)
  NNAM[4] 0x00063b3c (float 5.72262e-40)
  NNAM[4] 0x00063b3e (float 5.72265e-40)
  NNAM[4] 0x00063b40 (float 5.72268e-40)
SMQN 0x00063b26 KarthwastenT01Scenes
  PNAM[4] 0x000622fc (float 5.63563e-40)
  SNAM[4] 0x00000000 (float 0)
  CITC[4] 0x00000000 (float 0)
  DNAM[4] 0x00010001 (float 9.18369e-41)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000004 (float 5.60519e-45)
  NNAM[4] 0x00063b24 (float 5.72229e-40)
  NNAM[4] 0x00063b2b (float 5.72238e-40)
  NNAM[4] 0x00063b2d (float 5.72241e-40)
  NNAM[4] 0x00063b2f (float 5.72244e-40)
SMQN 0x0006383e FreeformKarthwastenAQuest
  PNAM[4] 0x0009002a (float 8.26578e-40)
  SNAM[4] 0x0006531c (float 5.80827e-40)
  CITC[4] 0x00000002 (float 2.8026e-45)
  CTDA[32] floats ['4.84398e-37', '0', '8.26766e-44', '5.63535e-40', '1.4013e-44', '0', '0', 'nan']
  CTDA[32] floats ['4.84398e-37', '1', '8.07148e-43', '1.18744e-08', '1.41458e-40', '0', '0', 'nan']
  DNAM[4] 0x00020000 (float 1.83671e-40)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000001 (float 1.4013e-45)
  NNAM[4] 0x000622e8 (float 5.63535e-40)
SMQN 0x0001fd9a KolskeggrMineHouseScenes
  PNAM[4] 0x0001fd94 (float 1.82802e-40)
  SNAM[4] 0x0001fd95 (float 1.82804e-40)
  CITC[4] 0x00000001 (float 1.4013e-45)
  CTDA[32] floats ['1.63649e-27', '1', '5.03066e-43', '1.80738e-40', '0', '9.80909e-45', '0', '1.76928e-41']
  DNAM[4] 0x00010001 (float 9.18369e-41)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000002 (float 2.8026e-45)
  NNAM[4] 0x0001fd96 (float 1.82805e-40)
  RNAM[4] 0x44100000 (float 576)
  NNAM[4] 0x0001fd98 (float 1.82808e-40)
  RNAM[4] 0x44100000 (float 576)
SMQN 0x0001fd95 KolskeggrMineScenes
  PNAM[4] 0x0001fd94 (float 1.82802e-40)
  SNAM[4] 0x00000000 (float 0)
  CITC[4] 0x00000000 (float 0)
  DNAM[4] 0x00010001 (float 9.18369e-41)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000002 (float 2.8026e-45)
  NNAM[4] 0x0001fd7a (float 1.82766e-40)
  RNAM[4] 0x44100000 (float 576)
  NNAM[4] 0x0001fd92 (float 1.82799e-40)
  RNAM[4] 0x44100000 (float 576)
SMQN 0x000609b5 TGRSLQuestNode
  PNAM[4] 0x000609ad (float 5.54484e-40)
  SNAM[4] 0x000609b4 (float 5.54494e-40)
  CITC[4] 0x00000001 (float 1.4013e-45)
  CTDA[32] floats ['1.64028e-33', '1', '8.07148e-43', '2.95404e-09', '2.32892e-40', '0', '0', 'nan']
  DNAM[4] 0x00000001 (float 1.4013e-45)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000001 (float 1.4013e-45)
  NNAM[4] 0x0002893e (float 2.32904e-40)
SMQN 0x000609b4 TGRNTQuestNode
  PNAM[4] 0x000609ad (float 5.54484e-40)
  SNAM[4] 0x000609b3 (float 5.54492e-40)
  CITC[4] 0x00000001 (float 1.4013e-45)
  CTDA[32] floats ['1.64028e-33', '1', '8.07148e-43', '2.95404e-09', '2.32889e-40', '0', '0', 'nan']
  DNAM[4] 0x00000001 (float 1.4013e-45)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000001 (float 1.4013e-45)
  NNAM[4] 0x00060990 (float 5.54443e-40)
SMQN 0x000609b3 TGRJBQuestNode
  PNAM[4] 0x000609ad (float 5.54484e-40)
  SNAM[4] 0x000609b2 (float 5.54491e-40)
  CITC[4] 0x00000001 (float 1.4013e-45)
  CTDA[32] floats ['2.09376e-19', '1', '8.07148e-43', '2.95404e-09', '2.32886e-40', '0', '0', 'nan']
  DNAM[4] 0x00000001 (float 1.4013e-45)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000000 (float 0)
SMQN 0x000609b2 TGRHCQuestNode
  PNAM[4] 0x000609ad (float 5.54484e-40)
  SNAM[4] 0x000609b1 (float 5.5449e-40)
  CITC[4] 0x00000001 (float 1.4013e-45)
  CTDA[32] floats ['1.64028e-33', '1', '8.07148e-43', '2.95404e-09', '2.32882e-40', '0', '0', 'nan']
  DNAM[4] 0x00000001 (float 1.4013e-45)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000001 (float 1.4013e-45)
  NNAM[4] 0x00028936 (float 2.32893e-40)
SMQN 0x000609b1 TGRGFQuestNode
  PNAM[4] 0x000609ad (float 5.54484e-40)
  SNAM[4] 0x000609b0 (float 5.54488e-40)
  CITC[4] 0x00000001 (float 1.4013e-45)
  CTDA[32] floats ['1.64028e-33', '1', '8.07148e-43', '2.95404e-09', '2.32887e-40', '0', '0', 'nan']
  DNAM[4] 0x00000001 (float 1.4013e-45)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000001 (float 1.4013e-45)
  NNAM[4] 0x00028922 (float 2.32865e-40)
SMQN 0x000609b0 TGRFOQuestNode
  PNAM[4] 0x000609ad (float 5.54484e-40)
  SNAM[4] 0x000609af (float 5.54487e-40)
  CITC[4] 0x00000001 (float 1.4013e-45)
  CTDA[32] floats ['1.64028e-33', '1', '8.07148e-43', '2.95404e-09', '2.32885e-40', '0', '0', 'nan']
  DNAM[4] 0x00000001 (float 1.4013e-45)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000001 (float 1.4013e-45)
  NNAM[4] 0x0006098e (float 5.54441e-40)
SMQN 0x000609af TGRDUQuestNode
  PNAM[4] 0x000609ad (float 5.54484e-40)
  SNAM[4] 0x000609ae (float 5.54485e-40)
  CITC[4] 0x00000001 (float 1.4013e-45)
  CTDA[32] floats ['1.64028e-33', '1', '8.07148e-43', '2.95404e-09', '2.3289e-40', '0', '0', 'nan']
  DNAM[4] 0x00000001 (float 1.4013e-45)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000001 (float 1.4013e-45)
  NNAM[4] 0x00015d24 (float 1.25248e-40)
SMQN 0x000609ae TRGBEQuestNode
  PNAM[4] 0x000609ad (float 5.54484e-40)
  SNAM[4] 0x00000000 (float 0)
  CITC[4] 0x00000001 (float 1.4013e-45)
  CTDA[32] floats ['1.64028e-33', '1', '8.07148e-43', '2.95404e-09', '2.32883e-40', '0', '0', 'nan']
  DNAM[4] 0x00000001 (float 1.4013e-45)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000001 (float 1.4013e-45)
  NNAM[4] 0x0002893b (float 2.329e-40)
SMQN 0x0005d331 DA05LocationCheckNode
  PNAM[4] 0x00090028 (float 8.26576e-40)
  SNAM[4] 0x00094bda (float 8.5373e-40)
  CITC[4] 0x00000002 (float 2.8026e-45)
  CTDA[32] floats ['9.78109e-26', '1', '8.07148e-43', '1.18744e-08', '1.41443e-40', '0', '0', 'nan']
  CTDA[32] floats ['9.78117e-26', '10', '8.12753e-44', '2.42719e-40', '0', '0', '0', 'nan']
  DNAM[4] 0x00020000 (float 1.83671e-40)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000001 (float 1.4013e-45)
  NNAM[4] 0x0005d330 (float 5.34937e-40)
SMQN 0x0005d2e8 WinterholdCollegeFF1
  PNAM[4] 0x0009002a (float 8.26578e-40)
  SNAM[4] 0x000681db (float 5.97596e-40)
  CITC[4] 0x00000005 (float 7.00649e-45)
  CTDA[32] floats ['4.84398e-37', '0', '6.44597e-44', '0', '0', '2.8026e-45', '1.61302e-40', 'nan']
  CTDA[32] floats ['4.84398e-37', '0', '6.44597e-44', '0', '0', '2.8026e-45', '1.61308e-40', 'nan']
  CTDA[32] floats ['4.84404e-37', '7.9874e-44', '1.03696e-43', '5.34841e-40', '0', '0', '0', 'nan']
  CTDA[32] floats ['4.84398e-37', '1', '9.94922e-44', '1.78773e-40', '0', '2.8026e-45', '2.8026e-44', 'nan']
  CTDA[32] floats ['4.84402e-37', '1', '5.64723e-43', '1.61308e-40', '0', '2.8026e-45', '2.8026e-44', 'nan']
  DNAM[4] 0x00020000 (float 1.83671e-40)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000001 (float 1.4013e-45)
  NNAM[4] 0x0005d2e9 (float 5.34838e-40)
SMQN 0x0005b5a7 GenericLumberjackScenes
  PNAM[4] 0x0005b5a6 (float 5.24341e-40)
  SNAM[4] 0x00016fa1 (float 1.3188e-40)
  CITC[4] 0x00000006 (float 8.40779e-45)
  CTDA[32] floats ['2.76301e-23', '8', '2.52234e-44', '0', '0', '0', '0', 'nan']
  CTDA[32] floats ['2.76303e-23', '18', '2.52234e-44', '0', '0', '0', '0', 'nan']
  CTDA[32] floats ['2.76298e-23', '1', '9.94922e-44', '4.6692e-40', '0', '9.80909e-45', '0', '1.76928e-41']
  CTDA[32] floats ['2.76298e-23', '1', '9.94922e-44', '4.6692e-40', '0', '9.80909e-45', '0', '1.80515e-41']
  CTDA[32] floats ['2.76298e-23', '1', '2.25609e-43', '5.52781e-40', '0', '9.80909e-45', '0', '1.76928e-41']
  CTDA[32] floats ['2.76298e-23', '1', '2.25609e-43', '6.22921e-40', '0', '9.80909e-45', '0', '1.76928e-41']
  DNAM[4] 0x00010001 (float 9.18369e-41)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000000 (float 0)
SMQN 0x0005b5a5 CWMissionStackedDebugBranch
  PNAM[4] 0x000236a1 (float 2.03268e-40)
  SNAM[4] 0x000674e8 (float 5.92951e-40)
  CITC[4] 0x00000001 (float 1.4013e-45)
  CTDA[32] floats ['1.16533e-17', '1', '8.07148e-43', '2.95404e-09', '1.85744e-40', '0', '0', 'nan']
  DNAM[4] 0x00000000 (float 0)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000000 (float 0)
SMQN 0x0005b2f5 CreatureHellosDog
  PNAM[4] 0x0005b2f4 (float 5.23374e-40)
  SNAM[4] 0x00000000 (float 0)
  CITC[4] 0x00000000 (float 0)
  DNAM[4] 0x00000001 (float 1.4013e-45)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000001 (float 1.4013e-45)
  NNAM[4] 0x0005b2f2 (float 5.23371e-40)
SMQN 0x0005a831 CWMissionCatchEventBottomNode
  PNAM[4] 0x000236a1 (float 2.03268e-40)
  SNAM[4] 0x000216a8 (float 1.91799e-40)
  CITC[4] 0x00000001 (float 1.4013e-45)
  CTDA[32] floats ['6.00226e-33', '1', '8.07148e-43', '2.95404e-09', '1.85744e-40', '0', '0', 'nan']
  DNAM[4] 0x00000000 (float 0)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000002 (float 2.8026e-45)
  NNAM[4] 0x0005a82d (float 5.19508e-40)
  NNAM[4] 0x0005a830 (float 5.19512e-40)
SMQN 0x0005a82e CWMissionCatchEventTopNode
  PNAM[4] 0x000236a1 (float 2.03268e-40)
  SNAM[4] 0x0002111d (float 1.8981e-40)
  CITC[4] 0x00000001 (float 1.4013e-45)
  CTDA[32] floats ['6.00226e-33', '1', '8.07148e-43', '2.95404e-09', '1.85744e-40', '0', '0', 'nan']
  DNAM[4] 0x00020000 (float 1.83671e-40)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000002 (float 2.8026e-45)
  NNAM[4] 0x0005a82c (float 5.19506e-40)
  NNAM[4] 0x0005a82f (float 5.1951e-40)
SMQN 0x000590d6 MarkarthRiversideConvoScenes
  PNAM[4] 0x000340c6 (float 2.98743e-40)
  SNAM[4] 0x00026317 (float 2.19218e-40)
  CITC[4] 0x00000001 (float 1.4013e-45)
  CTDA[32] floats ['5.78845e-24', '1', '4.34403e-43', '1.31096e-40', '0', '9.80909e-45', '0', '1.76928e-41']
  DNAM[4] 0x00010001 (float 9.18369e-41)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000008 (float 1.12104e-44)
  NNAM[4] 0x000b021f (float 1.01095e-39)
  RNAM[4] 0x44100000 (float 576)
  NNAM[4] 0x00059f74 (float 5.16378e-40)
  RNAM[4] 0x44100000 (float 576)
  NNAM[4] 0x00059f76 (float 5.16381e-40)
  RNAM[4] 0x44100000 (float 576)
  NNAM[4] 0x00059f78 (float 5.16384e-40)
  RNAM[4] 0x44100000 (float 576)
  NNAM[4] 0x00059f7a (float 5.16387e-40)
  RNAM[4] 0x44100000 (float 576)
  NNAM[4] 0x000af772 (float 1.00712e-39)
  RNAM[4] 0x44100000 (float 576)
  NNAM[4] 0x00059f7c (float 5.1639e-40)
  RNAM[4] 0x44100000 (float 576)
  NNAM[4] 0x00059f7e (float 5.16392e-40)
  RNAM[4] 0x44100000 (float 576)
SMQN 0x00055bff MS08Argue
  PNAM[4] 0x00090028 (float 8.26576e-40)
  SNAM[4] 0x000fe47a (float 1.45949e-39)
  CITC[4] 0x00000006 (float 8.40779e-45)
  CTDA[32] floats ['5.4246e-27', '0', '8.81417e-43', '4.92177e-40', '5.68018e-15', '0', '0', 'nan']
  CIS2[18] 3a3a5363656e655570646174655f76617200
  CTDA[32] floats ['5.4246e-27', '1', '8.07148e-43', '2.96859e-09', '1.41461e-40', '0', '0', 'nan']
  CTDA[32] floats ['5.4246e-27', '0', '8.07148e-43', '1.18744e-08', '1.41461e-40', '0', '0', 'nan']
  CTDA[32] floats ['5.4246e-27', '1', '8.26766e-44', '2.24079e-40', '5.60519e-44', '0', '0', 'nan']
  CTDA[32] floats ['5.42465e-27', '25', '8.12753e-44', '1.66145e-40', '0', '0', '0', 'nan']
  CTDA[32] floats ['5.42463e-27', '45', '8.12753e-44', '2.18485e-40', '0', '0', '0', 'nan']
  DNAM[4] 0x00020000 (float 1.83671e-40)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000001 (float 1.4013e-45)
  NNAM[4] 0x00055bfd (float 4.92177e-40)
SMQN 0x0005478d CR08LocationMonitoring
  PNAM[4] 0x0009002e (float 8.26584e-40)
  SNAM[4] 0x000a3ec6 (float 9.40874e-40)
  CITC[4] 0x00000002 (float 2.8026e-45)
  CTDA[32] floats ['4.84398e-37', '1', '7.84727e-44', '2.13201e-40', '0', '0', '0', 'nan']
  CTDA[32] floats ['4.84398e-37', '21', '8.12753e-44', '2.13201e-40', '0', '0', '0', 'nan']
  DNAM[4] 0x00020000 (float 1.83671e-40)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000001 (float 1.4013e-45)
  NNAM[4] 0x0005478c (float 4.84844e-40)
SMQN 0x0004bafb dunTalkingStoneNode
  PNAM[4] 0x00030b13 (float 2.79479e-40)
  SNAM[4] 0x0005160d (float 4.67088e-40)
  CITC[4] 0x00000002 (float 2.8026e-45)
  CTDA[32] floats ['5.77425e-29', '1', '5.03066e-43', '1.44398e-40', '0', '0', '0', 'nan']
  CTDA[32] floats ['5.77425e-29', '1', '5.03066e-43', '1.44471e-40', '0', '0', '0', '1.76928e-41']
  DNAM[4] 0x00020000 (float 1.83671e-40)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000001 (float 1.4013e-45)
  NNAM[4] 0x0004ba6c (float 4.34218e-40)
SMQN 0x0004838f dunBluePalaceWingNode
  PNAM[4] 0x00030b13 (float 2.79479e-40)
  SNAM[4] 0x0005160d (float 4.67088e-40)
  CITC[4] 0x00000001 (float 1.4013e-45)
  CTDA[32] floats ['1.53088e-29', '1', '5.03066e-43', '1.43955e-40', '0', '9.80909e-45', '0', '1.76928e-41']
  DNAM[4] 0x00000000 (float 0)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000001 (float 1.4013e-45)
  NNAM[4] 0x00048364 (float 4.14476e-40)
SMQN 0x00051b03 SaarthalInteriorConvoScenes
  PNAM[4] 0x00051b01 (float 4.68865e-40)
  SNAM[4] 0x00051b02 (float 4.68866e-40)
  CITC[4] 0x00000001 (float 1.4013e-45)
  CTDA[32] floats ['2.28427e-26', '1', '4.2039e-43', '0', '0', '9.80909e-45', '0', '1.76928e-41']
  DNAM[4] 0x00000000 (float 0)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000002 (float 2.8026e-45)
  NNAM[4] 0x00051b08 (float 4.68874e-40)
  NNAM[4] 0x00051b0a (float 4.68877e-40)
SMQN 0x00051b02 SaarthalExteriorConvoScenes
  PNAM[4] 0x00051b01 (float 4.68865e-40)
  SNAM[4] 0x00000000 (float 0)
  CITC[4] 0x00000001 (float 1.4013e-45)
  CTDA[32] floats ['2.28427e-26', '0', '4.2039e-43', '0', '0', '9.80909e-45', '0', '1.76928e-41']
  DNAM[4] 0x00000000 (float 0)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000003 (float 4.2039e-45)
  NNAM[4] 0x00037dcd (float 3.20635e-40)
  NNAM[4] 0x00051b04 (float 4.68869e-40)
  NNAM[4] 0x00051b06 (float 4.68872e-40)
SMQN 0x000517a0 HonorhallOrphanageConversations
  PNAM[4] 0x00046e0f (float 4.06824e-40)
  SNAM[4] 0x00046e1d (float 4.06843e-40)
  CITC[4] 0x00000001 (float 1.4013e-45)
  CTDA[32] floats ['8.36413e-26', '1', '5.03066e-43', '1.97391e-40', '0', '9.80909e-45', '0', '1.76928e-41']
  DNAM[4] 0x00000001 (float 1.4013e-45)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000001 (float 1.4013e-45)
  NNAM[4] 0x0005179e (float 4.6765e-40)
SMQN 0x0005160d RannveigNode
  PNAM[4] 0x00030b13 (float 2.79479e-40)
  SNAM[4] 0x0004f8b7 (float 4.56564e-40)
  CITC[4] 0x00000001 (float 1.4013e-45)
  CTDA[32] floats ['4.86977e-22', '1', '5.03066e-43', '1.44412e-40', '0', '9.80909e-45', '0', '1.76928e-41']
  DNAM[4] 0x00020000 (float 1.83671e-40)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000001 (float 1.4013e-45)
  NNAM[4] 0x0005160c (float 4.67086e-40)
SMQN 0x0004f8c1 CWAttackCityNode
  PNAM[4] 0x000236a1 (float 2.03268e-40)
  SNAM[4] 0x00054ab1 (float 4.85972e-40)
  CITC[4] 0x00000001 (float 1.4013e-45)
  CTDA[32] floats ['8.02431e-19', '1', '8.07148e-43', '2.95404e-09', '4.56577e-40', '0', '0', 'nan']
  DNAM[4] 0x00000002 (float 2.8026e-45)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000001 (float 1.4013e-45)
  NNAM[4] 0x0004f8bf (float 4.56575e-40)
SMQN 0x0004f8b7 dunStillbornCaveNode
  PNAM[4] 0x00030b13 (float 2.79479e-40)
  SNAM[4] 0x0004cee0 (float 4.41555e-40)
  CITC[4] 0x00000001 (float 1.4013e-45)
  CTDA[32] floats ['6.36522e-16', '1', '5.03066e-43', '1.44465e-40', '0', '9.80909e-45', '0', '1.76928e-41']
  DNAM[4] 0x00020000 (float 1.83671e-40)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000000 (float 0)
SMQN 0x0004d918 DA02KillFriendNodeOBSOLETE
  PNAM[4] 0x00013010 (float 1.09077e-40)
  SNAM[4] 0x0010faef (float 1.55939e-39)
  CITC[4] 0x00000005 (float 7.00649e-45)
  CTDA[32] floats ['0', '0', '1.03696e-43', '1.918e-40', '0', '0', '0', 'nan']
  CTDA[32] floats ['0', '1', '1.00893e-43', '9.80909e-45', '0', '9.80909e-45', '0', '1.80515e-41']
  CTDA[32] floats ['1.35926e-43', '1', '8.07148e-43', '1.24564e-08', '0', '0', '0', 'nan']
  CTDA[32] floats ['1.4013e-45', '1', '9.94922e-44', '1.0874e-39', '0', '9.80909e-45', '0', '1.76928e-41']
  CTDA[32] floats ['1.4013e-45', '1', '9.94922e-44', '5.31033e-40', '0', '9.80909e-45', '0', '1.76928e-41']
  DNAM[4] 0x00020000 (float 1.83671e-40)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000001 (float 1.4013e-45)
  NNAM[4] 0x0004d917 (float 4.45219e-40)
SMQN 0x0004cee0 dunFolgunthurNode
  PNAM[4] 0x00030b13 (float 2.79479e-40)
  SNAM[4] 0x0004b2a2 (float 4.31423e-40)
  CITC[4] 0x00000001 (float 1.4013e-45)
  CTDA[32] floats ['3.25105e-35', '1', '5.03066e-43', '1.44021e-40', '0', '0', '0', 'nan']
  DNAM[4] 0x00020000 (float 1.83671e-40)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000001 (float 1.4013e-45)
  NNAM[4] 0x0004cede (float 4.41552e-40)
SMQN 0x0004bccd TGHQConversations
  PNAM[4] 0x0004bccc (float 4.3507e-40)
  SNAM[4] 0x00000000 (float 0)
  CITC[4] 0x00000000 (float 0)
  DNAM[4] 0x00010000 (float 9.18355e-41)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000010 (float 2.24208e-44)
  NNAM[4] 0x0003dac7 (float 3.53989e-40)
  NNAM[4] 0x0003dac9 (float 3.53992e-40)
  NNAM[4] 0x0003dacb (float 3.53995e-40)
  NNAM[4] 0x0003dacd (float 3.53997e-40)
  NNAM[4] 0x0003dacf (float 3.54e-40)
  NNAM[4] 0x0003dad9 (float 3.54014e-40)
  NNAM[4] 0x0003dadb (float 3.54017e-40)
  NNAM[4] 0x0003dadd (float 3.5402e-40)
  NNAM[4] 0x0003dadf (float 3.54023e-40)
  NNAM[4] 0x0003dae1 (float 3.54025e-40)
  NNAM[4] 0x0003dae3 (float 3.54028e-40)
  NNAM[4] 0x0003dae5 (float 3.54031e-40)
  NNAM[4] 0x000ea2d1 (float 1.3441e-39)
  NNAM[4] 0x000ea2d3 (float 1.34411e-39)
  NNAM[4] 0x000ea2d5 (float 1.34411e-39)
  NNAM[4] 0x000ea2d7 (float 1.34411e-39)
SMQN 0x0004b2e9 ViolaLonelyGaleScenes
  PNAM[4] 0x0004b2e1 (float 4.31512e-40)
  SNAM[4] 0x0004b2e8 (float 4.31521e-40)
  CITC[4] 0x00000002 (float 2.8026e-45)
  CTDA[32] floats ['1.29722e-24', '1', '5.03066e-43', '1.87227e-40', '0', '9.80909e-45', '0', '1.76928e-41']
  CTDA[32] floats ['1.29722e-24', '1', '5.03066e-43', '1.87227e-40', '0', '9.80909e-45', '0', '1.80515e-41']
  DNAM[4] 0x00000001 (float 1.4013e-45)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000004 (float 5.60519e-45)
  NNAM[4] 0x00038586 (float 3.23406e-40)
  NNAM[4] 0x00038588 (float 3.23408e-40)
  NNAM[4] 0x0003858a (float 3.23411e-40)
  NNAM[4] 0x0003858c (float 3.23414e-40)
SMQN 0x0004b2e8 PalaceScenes
  PNAM[4] 0x0004b2e1 (float 4.31512e-40)
  SNAM[4] 0x0004b2e7 (float 4.3152e-40)
  CITC[4] 0x00000002 (float 2.8026e-45)
  CTDA[32] floats ['1.29722e-24', '1', '5.03066e-43', '1.87239e-40', '0', '9.80909e-45', '0', '1.76928e-41']
  CTDA[32] floats ['1.29722e-24', '1', '5.03066e-43', '1.87239e-40', '0', '9.80909e-45', '0', '1.80515e-41']
  DNAM[4] 0x00000001 (float 1.4013e-45)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000009 (float 1.26117e-44)
  NNAM[4] 0x0003a9a8 (float 3.36368e-40)
  RNAM[4] 0x44100000 (float 576)
  NNAM[4] 0x0003a9aa (float 3.3637e-40)
  RNAM[4] 0x44100000 (float 576)
  NNAM[4] 0x0003a9ac (float 3.36373e-40)
  RNAM[4] 0x44100000 (float 576)
  NNAM[4] 0x0003a9ae (float 3.36376e-40)
  RNAM[4] 0x44100000 (float 576)
  NNAM[4] 0x0003a9b0 (float 3.36379e-40)
  RNAM[4] 0x44100000 (float 576)
  NNAM[4] 0x0003a9b2 (float 3.36382e-40)
  RNAM[4] 0x44100000 (float 576)
  NNAM[4] 0x0003a9b4 (float 3.36384e-40)
  RNAM[4] 0x44100000 (float 576)
  NNAM[4] 0x0003a9b6 (float 3.36387e-40)
  RNAM[4] 0x44100000 (float 576)
  NNAM[4] 0x000b62d0 (float 1.04564e-39)
  RNAM[4] 0x44100000 (float 576)
SMQN 0x0004b2e7 CornerclubScenes
  PNAM[4] 0x0004b2e1 (float 4.31512e-40)
  SNAM[4] 0x0004b2e6 (float 4.31519e-40)
  CITC[4] 0x00000002 (float 2.8026e-45)
  CTDA[32] floats ['1.29722e-24', '1', '5.03066e-43', '1.87236e-40', '0', '9.80909e-45', '0', '1.76928e-41']
  CTDA[32] floats ['1.29722e-24', '1', '5.03066e-43', '1.87236e-40', '0', '9.80909e-45', '0', '1.80515e-41']
  DNAM[4] 0x00000001 (float 1.4013e-45)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000005 (float 7.00649e-45)
  NNAM[4] 0x0003a9cc (float 3.36418e-40)
  RNAM[4] 0x44100000 (float 576)
  NNAM[4] 0x0003a9ce (float 3.36421e-40)
  RNAM[4] 0x44100000 (float 576)
  NNAM[4] 0x0003a9d0 (float 3.36424e-40)
  RNAM[4] 0x44100000 (float 576)
  NNAM[4] 0x0003a9d2 (float 3.36427e-40)
  RNAM[4] 0x44100000 (float 576)
  NNAM[4] 0x0003a9d4 (float 3.36429e-40)
  RNAM[4] 0x44100000 (float 576)
SMQN 0x0004b2e6 CandlehearthScenes
  PNAM[4] 0x0004b2e1 (float 4.31512e-40)
  SNAM[4] 0x0004b2e5 (float 4.31517e-40)
  CITC[4] 0x00000002 (float 2.8026e-45)
  CTDA[32] floats ['1.29722e-24', '1', '5.03066e-43', '1.87227e-40', '0', '9.80909e-45', '0', '1.76928e-41']
  CTDA[32] floats ['1.29722e-24', '1', '5.03066e-43', '1.87227e-40', '0', '9.80909e-45', '0', '1.80515e-41']
  DNAM[4] 0x00000001 (float 1.4013e-45)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000006 (float 8.40779e-45)
  NNAM[4] 0x0003a9c2 (float 3.36404e-40)
  RNAM[4] 0x44100000 (float 576)
  NNAM[4] 0x0003a9c4 (float 3.36407e-40)
  RNAM[4] 0x44100000 (float 576)
  NNAM[4] 0x0003a9c6 (float 3.3641e-40)
  RNAM[4] 0x44100000 (float 576)
  NNAM[4] 0x0003a9c8 (float 3.36413e-40)
  RNAM[4] 0x44100000 (float 576)
  NNAM[4] 0x000b62b8 (float 1.0456e-39)
  RNAM[4] 0x44100000 (float 576)
  NNAM[4] 0x000b62bc (float 1.04561e-39)
  RNAM[4] 0x44100000 (float 576)
SMQN 0x0004b2e5 BrunwulfEldaScenes
  PNAM[4] 0x0004b2e1 (float 4.31512e-40)
  SNAM[4] 0x0004b2e4 (float 4.31516e-40)
  CITC[4] 0x00000002 (float 2.8026e-45)
  CTDA[32] floats ['1.29722e-24', '1', '5.03066e-43', '1.87227e-40', '0', '9.80909e-45', '0', '1.76928e-41']
  CTDA[32] floats ['1.29722e-24', '1', '5.03066e-43', '1.87227e-40', '0', '9.80909e-45', '0', '1.80515e-41']
  DNAM[4] 0x00000001 (float 1.4013e-45)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000003 (float 4.2039e-45)
  NNAM[4] 0x00039ce3 (float 3.31787e-40)
  RNAM[4] 0x44100000 (float 576)
  NNAM[4] 0x00039ce5 (float 3.3179e-40)
  RNAM[4] 0x44100000 (float 576)
  NNAM[4] 0x00039ce7 (float 3.31792e-40)
  RNAM[4] 0x44100000 (float 576)
SMQN 0x0004b2e4 BlacksmithScenes
  PNAM[4] 0x0004b2e1 (float 4.31512e-40)
  SNAM[4] 0x0004b2e2 (float 4.31513e-40)
  CITC[4] 0x00000000 (float 0)
  DNAM[4] 0x00000001 (float 1.4013e-45)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000003 (float 4.2039e-45)
  NNAM[4] 0x0003828b (float 3.22336e-40)
  RNAM[4] 0x44100000 (float 576)
  NNAM[4] 0x0003829b (float 3.22359e-40)
  RNAM[4] 0x44100000 (float 576)
  NNAM[4] 0x00038584 (float 3.23403e-40)
  RNAM[4] 0x44100000 (float 576)
SMQN 0x0004b2e2 AlchemyShopScenes
  PNAM[4] 0x0004b2e1 (float 4.31512e-40)
  SNAM[4] 0x00000000 (float 0)
  CITC[4] 0x00000002 (float 2.8026e-45)
  CTDA[32] floats ['1.29722e-24', '1', '5.03066e-43', '1.87249e-40', '0', '9.80909e-45', '0', '1.76928e-41']
  CTDA[32] floats ['1.29722e-24', '1', '5.03066e-43', '1.87249e-40', '0', '9.80909e-45', '0', '1.80515e-41']
  DNAM[4] 0x00000001 (float 1.4013e-45)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000003 (float 4.2039e-45)
  NNAM[4] 0x00039cdd (float 3.31778e-40)
  RNAM[4] 0x44100000 (float 576)
  NNAM[4] 0x00039cdf (float 3.31781e-40)
  RNAM[4] 0x44100000 (float 576)
  NNAM[4] 0x00039ce1 (float 3.31784e-40)
  RNAM[4] 0x44100000 (float 576)
SMQN 0x0004b2c8 MorthalAlvasHouseScenes
  PNAM[4] 0x000443a2 (float 3.91604e-40)
  SNAM[4] 0x0003ac43 (float 3.37302e-40)
  CITC[4] 0x00000001 (float 1.4013e-45)
  CTDA[32] floats ['1.66077e-25', '1', '9.3887e-44', '1.1224e-40', '0', '9.80909e-45', '0', '1.76928e-41']
  DNAM[4] 0x00000001 (float 1.4013e-45)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000001 (float 1.4013e-45)
  NNAM[4] 0x0004483f (float 3.93259e-40)
SMQN 0x0004b2a2 dunTrevaWatchNode
  PNAM[4] 0x00030b13 (float 2.79479e-40)
  SNAM[4] 0x00049db3 (float 4.23914e-40)
  CITC[4] 0x00000001 (float 1.4013e-45)
  CTDA[32] floats ['1.1817e-15', '1', '5.03066e-43', '1.44475e-40', '0', '0', '0', 'nan']
  DNAM[4] 0x00000000 (float 0)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000001 (float 1.4013e-45)
  NNAM[4] 0x0004b2a1 (float 4.31422e-40)
SMQN 0x0004b22f dunDarklightNode
  PNAM[4] 0x00030b13 (float 2.79479e-40)
  SNAM[4] 0x000b0f5c (float 1.0157e-39)
  CITC[4] 0x00000001 (float 1.4013e-45)
  CTDA[32] floats ['1.47157e-10', '1', '5.03066e-43', '1.43982e-40', '0', '0', '0', 'nan']
  DNAM[4] 0x00020000 (float 1.83671e-40)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000001 (float 1.4013e-45)
  NNAM[4] 0x0003fa89 (float 3.65382e-40)
SMQN 0x0004b11c AngasMillOutsideScenes
  PNAM[4] 0x0004b11a (float 4.30874e-40)
  SNAM[4] 0x0004b11b (float 4.30875e-40)
  CITC[4] 0x00000001 (float 1.4013e-45)
  CTDA[32] floats ['9.44149e-23', '1', '7.91734e-43', '1.42253e-40', '0', '9.80909e-45', '0', '1.76928e-41']
  DNAM[4] 0x00010001 (float 9.18369e-41)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000000 (float 0)
SMQN 0x0004b11b AngasMillCommonHouseScenes
  PNAM[4] 0x0004b11a (float 4.30874e-40)
  SNAM[4] 0x00000000 (float 0)
  CITC[4] 0x00000001 (float 1.4013e-45)
  CTDA[32] floats ['9.44149e-23', '1', '7.91734e-43', '1.83777e-40', '0', '9.80909e-45', '0', '1.76928e-41']
  DNAM[4] 0x00010001 (float 9.18369e-41)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000002 (float 2.8026e-45)
  NNAM[4] 0x0004463e (float 3.9254e-40)
  NNAM[4] 0x00044640 (float 3.92543e-40)
SMQN 0x0003ac43 MorthalMoorsideScenes
  PNAM[4] 0x000443a2 (float 3.91604e-40)
  SNAM[4] 0x00044839 (float 3.93251e-40)
  CITC[4] 0x00000001 (float 1.4013e-45)
  CTDA[32] floats ['1.56194e-25', '1', '9.3887e-44', '1.12213e-40', '0', '9.80909e-45', '0', '1.76928e-41']
  DNAM[4] 0x00000001 (float 1.4013e-45)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000008 (float 1.12104e-44)
  NNAM[4] 0x00044841 (float 3.93262e-40)
  RNAM[4] 0x41400000 (float 12)
  NNAM[4] 0x00044843 (float 3.93265e-40)
  RNAM[4] 0x41400000 (float 12)
  NNAM[4] 0x00044845 (float 3.93267e-40)
  RNAM[4] 0x41400000 (float 12)
  NNAM[4] 0x00044847 (float 3.9327e-40)
  RNAM[4] 0x41400000 (float 12)
  NNAM[4] 0x000aeecf (float 1.00402e-39)
  RNAM[4] 0x41400000 (float 12)
  NNAM[4] 0x000aeed4 (float 1.00403e-39)
  RNAM[4] 0x41400000 (float 12)
  NNAM[4] 0x000dba3d (float 1.26067e-39)
  RNAM[4] 0x42400000 (float 48)
  NNAM[4] 0x000dba3f (float 1.26067e-39)
  RNAM[4] 0x42400000 (float 48)
SMQN 0x0004a601 WEQuests
  PNAM[4] 0x000896a8 (float 7.88729e-40)
  SNAM[4] 0x0009f362 (float 9.13829e-40)
  CITC[4] 0x00000001 (float 1.4013e-45)
  CTDA[32] floats ['5.78919e-29', '1', '8.07148e-43', '2.95404e-09', '4.26892e-40', '0', '0', 'nan']
  DNAM[4] 0x00010001 (float 9.18369e-41)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000044 (float 9.52883e-44)
  NNAM[4] 0x0001dd08 (float 1.71127e-40)
  NNAM[4] 0x0004e4b5 (float 4.49387e-40)
  NNAM[4] 0x00098b52 (float 8.76498e-40)
  NNAM[4] 0x0009cabf (float 8.99251e-40)
  NNAM[4] 0x0009cac2 (float 8.99255e-40)
  NNAM[4] 0x0009d5a0 (float 9.03154e-40)
  NNAM[4] 0x0009f329 (float 9.13749e-40)
  NNAM[4] 0x0009f32c (float 9.13753e-40)
  NNAM[4] 0x0009f32f (float 9.13757e-40)
  NNAM[4] 0x0009f332 (float 9.13762e-40)
  NNAM[4] 0x0009f337 (float 9.13769e-40)
  NNAM[4] 0x0009f801 (float 9.15487e-40)
  NNAM[4] 0x0009f7e9 (float 9.15453e-40)
  NNAM[4] 0x0009f80a (float 9.15499e-40)
  NNAM[4] 0x0009f813 (float 9.15512e-40)
  NNAM[4] 0x0005e93e (float 5.42849e-40)
  NNAM[4] 0x00062103 (float 5.62855e-40)
  NNAM[4] 0x00062119 (float 5.62886e-40)
  NNAM[4] 0x00062131 (float 5.6292e-40)
  NNAM[4] 0x00074928 (float 6.69092e-40)
  NNAM[4] 0x0007492b (float 6.69096e-40)
  NNAM[4] 0x0007492e (float 6.691e-40)
  NNAM[4] 0x000753ca (float 6.72906e-40)
  NNAM[4] 0x000ba0b4 (float 1.06784e-39)
  NNAM[4] 0x000ba0bc (float 1.06785e-39)
  NNAM[4] 0x000ba0c0 (float 1.06786e-39)
  NNAM[4] 0x000bc09d (float 1.07929e-39)
  NNAM[4] 0x000a17ae (float 9.2685e-40)
  NNAM[4] 0x000b1179 (float 1.01646e-39)
  NNAM[4] 0x000b5d41 (float 1.04364e-39)
  NNAM[4] 0x000b5d46 (float 1.04365e-39)
  NNAM[4] 0x000b5d5e (float 1.04368e-39)
  NNAM[4] 0x000b5d5f (float 1.04369e-39)
  NNAM[4] 0x000b85bd (float 1.05817e-39)
  NNAM[4] 0x000ba2ff (float 1.06866e-39)
  NNAM[4] 0x000bedaf (float 1.09546e-39)
  NNAM[4] 0x000b1c79 (float 1.0204e-39)
  NNAM[4] 0x000b8169 (float 1.05661e-39)
  NNAM[4] 0x000b94ab (float 1.06352e-39)
  NNAM[4] 0x000bc5aa (float 1.0811e-39)
  NNAM[4] 0x000bf31c (float 1.0974e-39)
  NNAM[4] 0x000c1a1d (float 1.11139e-39)
  NNAM[4] 0x000c1a1f (float 1.1114e-39)
  NNAM[4] 0x000f5185 (float 1.40678e-39)
  NNAM[4] 0x000f5186 (float 1.40678e-39)
  NNAM[4] 0x000f5bc1 (float 1.41045e-39)
  NNAM[4] 0x000b328f (float 1.02833e-39)
  NNAM[4] 0x000b329e (float 1.02835e-39)
  NNAM[4] 0x000b32d6 (float 1.02843e-39)
  NNAM[4] 0x000b8141 (float 1.05656e-39)
  NNAM[4] 0x000bfb61 (float 1.10037e-39)
  NNAM[4] 0x000b91d8 (float 1.06251e-39)
  NNAM[4] 0x000b91ae (float 1.06245e-39)
  NNAM[4] 0x000b91c1 (float 1.06248e-39)
  NNAM[4] 0x000b91e3 (float 1.06252e-39)
  NNAM[4] 0x000bbd9d (float 1.07821e-39)
  NNAM[4] 0x000bd750 (float 1.08743e-39)
  NNAM[4] 0x000bd753 (float 1.08743e-39)
  NNAM[4] 0x000e8921 (float 1.33489e-39)
  NNAM[4] 0x000e8924 (float 1.33489e-39)
  NNAM[4] 0x000e892b (float 1.3349e-39)
  NNAM[4] 0x000e892d (float 1.33491e-39)
  NNAM[4] 0x000e892e (float 1.33491e-39)
  NNAM[4] 0x000e8931 (float 1.33491e-39)
  NNAM[4] 0x000e8933 (float 1.33491e-39)
  NNAM[4] 0x000e8941 (float 1.33493e-39)
  NNAM[4] 0x00105d12 (float 1.50276e-39)
  NNAM[4] 0x00105d19 (float 1.50277e-39)
SMQN 0x00049db3 SaarthalNode
  PNAM[4] 0x00030b13 (float 2.79479e-40)
  SNAM[4] 0x00048122 (float 4.13666e-40)
  CITC[4] 0x00000001 (float 1.4013e-45)
  CTDA[32] floats ['5.77979e-29', '1', '5.03066e-43', '1.44425e-40', '0', '0', '0', 'nan']
  DNAM[4] 0x00020000 (float 1.83671e-40)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000001 (float 1.4013e-45)
  NNAM[4] 0x00049db2 (float 4.23912e-40)
SMQN 0x00048122 FrostflowAbyssNode
  PNAM[4] 0x00030b13 (float 2.79479e-40)
  SNAM[4] 0x000443f5 (float 3.9172e-40)
  CITC[4] 0x00000001 (float 1.4013e-45)
  CTDA[32] floats ['0', '1', '3.52661e-36', '1.44039e-40', '0', '0', '0', 'nan']
  DNAM[4] 0x00020000 (float 1.83671e-40)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000001 (float 1.4013e-45)
  NNAM[4] 0x00048121 (float 4.13665e-40)
SMQN 0x00047ae9 DGIntimidateQuestNode
  PNAM[4] 0x0001379a (float 1.11782e-40)
  SNAM[4] 0x000609ad (float 5.54484e-40)
  CITC[4] 0x00000001 (float 1.4013e-45)
  CTDA[32] floats ['4.65976e-24', '1', '8.07148e-43', '2.95404e-09', '4.11424e-40', '0', '0', 'nan']
  DNAM[4] 0x00000000 (float 0)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000001 (float 1.4013e-45)
  NNAM[4] 0x00047ae6 (float 4.1143e-40)
SMQN 0x00047a26 MarriageNode
  PNAM[4] 0x0001379a (float 1.11782e-40)
  SNAM[4] 0x000880f2 (float 7.80941e-40)
  CITC[4] 0x00000000 (float 0)
  DNAM[4] 0x00000000 (float 0)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000002 (float 2.8026e-45)
  NNAM[4] 0x0007404e (float 6.65917e-40)
  NNAM[4] 0x00021382 (float 1.90669e-40)
SMQN 0x00046e1d TempleofMaraConversations
  PNAM[4] 0x00046e0f (float 4.06824e-40)
  SNAM[4] 0x00046e1c (float 4.06842e-40)
  CITC[4] 0x00000001 (float 1.4013e-45)
  CTDA[32] floats ['8.36413e-26', '1', '5.03066e-43', '1.97412e-40', '0', '9.80909e-45', '0', '1.76928e-41']
  DNAM[4] 0x00010001 (float 9.18369e-41)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000002 (float 2.8026e-45)
  NNAM[4] 0x00046b3d (float 4.05812e-40)
  NNAM[4] 0x00046b3f (float 4.05815e-40)
SMQN 0x00046e1c SnowShodHouseConversations
  PNAM[4] 0x00046e0f (float 4.06824e-40)
  SNAM[4] 0x00046e1b (float 4.0684e-40)
  CITC[4] 0x00000001 (float 1.4013e-45)
  CTDA[32] floats ['8.36413e-26', '1', '5.03066e-43', '1.97393e-40', '0', '9.80909e-45', '0', '1.76928e-41']
  DNAM[4] 0x00010001 (float 9.18369e-41)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000003 (float 4.2039e-45)
  NNAM[4] 0x00046b41 (float 4.05817e-40)
  NNAM[4] 0x00046b43 (float 4.0582e-40)
  NNAM[4] 0x00046b45 (float 4.05823e-40)
SMQN 0x00046e1b RaggedFlagonConversations
  PNAM[4] 0x00046e0f (float 4.06824e-40)
  SNAM[4] 0x00046e1a (float 4.06839e-40)
  CITC[4] 0x00000001 (float 1.4013e-45)
  CTDA[32] floats ['3.23225e-29', '1', '5.03066e-43', '1.97407e-40', '0', '9.80909e-45', '0', '1.76928e-41']
  DNAM[4] 0x00010001 (float 9.18369e-41)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000010 (float 2.24208e-44)
  NNAM[4] 0x00046d9a (float 4.0666e-40)
  NNAM[4] 0x00046d9c (float 4.06662e-40)
  NNAM[4] 0x000717b9 (float 6.51359e-40)
  NNAM[4] 0x000717bb (float 6.51361e-40)
  NNAM[4] 0x000717bd (float 6.51364e-40)
  NNAM[4] 0x000717bf (float 6.51367e-40)
  NNAM[4] 0x000717c1 (float 6.5137e-40)
  NNAM[4] 0x000717c3 (float 6.51373e-40)
  NNAM[4] 0x000717c5 (float 6.51375e-40)
  NNAM[4] 0x000717c7 (float 6.51378e-40)
  NNAM[4] 0x000717c9 (float 6.51381e-40)
  NNAM[4] 0x000b7304 (float 1.05145e-39)
  NNAM[4] 0x0003dad1 (float 3.54003e-40)
  NNAM[4] 0x0003dad3 (float 3.54006e-40)
  NNAM[4] 0x0003dad5 (float 3.54009e-40)
  NNAM[4] 0x0003dad7 (float 3.54011e-40)
SMQN 0x00046e1a PawnedPrawnConversations
  PNAM[4] 0x00046e0f (float 4.06824e-40)
  SNAM[4] 0x00046e19 (float 4.06838e-40)
  CITC[4] 0x00000001 (float 1.4013e-45)
  CTDA[32] floats ['8.36413e-26', '1', '5.03066e-43', '1.97404e-40', '0', '9.80909e-45', '0', '1.76928e-41']
  DNAM[4] 0x00010001 (float 9.18369e-41)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000003 (float 4.2039e-45)
  NNAM[4] 0x00046b35 (float 4.05801e-40)
  NNAM[4] 0x00046b37 (float 4.05803e-40)
  NNAM[4] 0x00071224 (float 6.49356e-40)
SMQN 0x00046e19 MjollsHouseConversations
  PNAM[4] 0x00046e0f (float 4.06824e-40)
  SNAM[4] 0x00046e18 (float 4.06836e-40)
  CITC[4] 0x00000001 (float 1.4013e-45)
  CTDA[32] floats ['8.36413e-26', '1', '5.03066e-43', '1.97395e-40', '0', '9.80909e-45', '0', '1.76928e-41']
  DNAM[4] 0x00010001 (float 9.18369e-41)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000002 (float 2.8026e-45)
  NNAM[4] 0x00046d96 (float 4.06654e-40)
  NNAM[4] 0x00046d98 (float 4.06657e-40)
SMQN 0x00046e18 RiftenKeepConversations
  PNAM[4] 0x00046e0f (float 4.06824e-40)
  SNAM[4] 0x00046e17 (float 4.06835e-40)
  CITC[4] 0x00000001 (float 1.4013e-45)
  CTDA[32] floats ['8.36413e-26', '1', '5.03066e-43', '1.97401e-40', '0', '9.80909e-45', '0', '1.76928e-41']
  DNAM[4] 0x00010001 (float 9.18369e-41)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000013 (float 2.66247e-44)
  NNAM[4] 0x00046b6b (float 4.05876e-40)
  NNAM[4] 0x00046b6d (float 4.05879e-40)
  NNAM[4] 0x00046b6f (float 4.05882e-40)
  NNAM[4] 0x00046b71 (float 4.05885e-40)
  NNAM[4] 0x00046b73 (float 4.05888e-40)
  NNAM[4] 0x00046b75 (float 4.0589e-40)
  NNAM[4] 0x00046b77 (float 4.05893e-40)
  NNAM[4] 0x00046b79 (float 4.05896e-40)
  NNAM[4] 0x00046b7b (float 4.05899e-40)
  NNAM[4] 0x00046b7d (float 4.05902e-40)
  NNAM[4] 0x00046da7 (float 4.06678e-40)
  NNAM[4] 0x00071208 (float 6.49317e-40)
  NNAM[4] 0x0007120a (float 6.4932e-40)
  NNAM[4] 0x0007120c (float 6.49322e-40)
  NNAM[4] 0x0007120e (float 6.49325e-40)
  NNAM[4] 0x00071210 (float 6.49328e-40)
  NNAM[4] 0x00071212 (float 6.49331e-40)
  NNAM[4] 0x00071214 (float 6.49334e-40)
  NNAM[4] 0x00071216 (float 6.49336e-40)
SMQN 0x00046e17 HaelgaBunkhouseConversations
  PNAM[4] 0x00046e0f (float 4.06824e-40)
  SNAM[4] 0x00046e16 (float 4.06833e-40)
  CITC[4] 0x00000001 (float 1.4013e-45)
  CTDA[32] floats ['2.9622e-25', '1', '5.03066e-43', '1.97388e-40', '0', '9.80909e-45', '0', '1.76928e-41']
  DNAM[4] 0x00010001 (float 9.18369e-41)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x0000000c (float 1.68156e-44)
  NNAM[4] 0x00046b47 (float 4.05826e-40)
  NNAM[4] 0x00046b49 (float 4.05829e-40)
  NNAM[4] 0x00046b4b (float 4.05831e-40)
  NNAM[4] 0x00046b4d (float 4.05834e-40)
  NNAM[4] 0x0007121c (float 6.49345e-40)
  NNAM[4] 0x0007121e (float 6.49348e-40)
  NNAM[4] 0x00071220 (float 6.4935e-40)
  NNAM[4] 0x00071222 (float 6.49353e-40)
  NNAM[4] 0x0006499c (float 5.77419e-40)
  NNAM[4] 0x0006499e (float 5.77422e-40)
  NNAM[4] 0x000649a0 (float 5.77425e-40)
  NNAM[4] 0x000649a2 (float 5.77427e-40)
SMQN 0x00046e16 GrandPlazaConversations
  PNAM[4] 0x00046e0f (float 4.06824e-40)
  SNAM[4] 0x00046e14 (float 4.06831e-40)
  CITC[4] 0x00000002 (float 2.8026e-45)
  CTDA[32] floats ['2.355e-23', '1', '4.34403e-43', '1.30472e-40', '0', '9.80909e-45', '0', '1.76928e-41']
  CTDA[32] floats ['2.355e-23', '0', '4.2039e-43', '0', '0', '9.80909e-45', '0', '1.76928e-41']
  DNAM[4] 0x00010001 (float 9.18369e-41)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x0000002b (float 6.02558e-44)
  NNAM[4] 0x00046b59 (float 4.05851e-40)
  RNAM[4] 0x41c00000 (float 24)
  NNAM[4] 0x00046b5b (float 4.05854e-40)
  RNAM[4] 0x41c00000 (float 24)
  NNAM[4] 0x00046b5d (float 4.05857e-40)
  RNAM[4] 0x41c00000 (float 24)
  NNAM[4] 0x00046b5f (float 4.05859e-40)
  RNAM[4] 0x41c00000 (float 24)
  NNAM[4] 0x00046b61 (float 4.05862e-40)
  RNAM[4] 0x41c00000 (float 24)
  NNAM[4] 0x00046b63 (float 4.05865e-40)
  RNAM[4] 0x41c00000 (float 24)
  NNAM[4] 0x00046b65 (float 4.05868e-40)
  RNAM[4] 0x41c00000 (float 24)
  NNAM[4] 0x00046b67 (float 4.05871e-40)
  RNAM[4] 0x41c00000 (float 24)
  NNAM[4] 0x00046b69 (float 4.05873e-40)
  RNAM[4] 0x41c00000 (float 24)
  NNAM[4] 0x000b6688 (float 1.04697e-39)
  RNAM[4] 0x41c00000 (float 24)
  NNAM[4] 0x0005fb1c (float 5.49259e-40)
  RNAM[4] 0x41c00000 (float 24)
  NNAM[4] 0x0005fb1e (float 5.49261e-40)
  RNAM[4] 0x41c00000 (float 24)
  NNAM[4] 0x0005fb20 (float 5.49264e-40)
  RNAM[4] 0x41c00000 (float 24)
  NNAM[4] 0x0005fb22 (float 5.49267e-40)
  RNAM[4] 0x41c00000 (float 24)
  NNAM[4] 0x0005fb24 (float 5.4927e-40)
  RNAM[4] 0x41c00000 (float 24)
  NNAM[4] 0x0005fb26 (float 5.49273e-40)
  RNAM[4] 0x41c00000 (float 24)
  NNAM[4] 0x0005fb28 (float 5.49275e-40)
  RNAM[4] 0x41c00000 (float 24)
  NNAM[4] 0x0005fb2a (float 5.49278e-40)
  RNAM[4] 0x41c00000 (float 24)
  NNAM[4] 0x0005fb2c (float 5.49281e-40)
  RNAM[4] 0x41c00000 (float 24)
  NNAM[4] 0x0005fb2e (float 5.49284e-40)
  RNAM[4] 0x41c00000 (float 24)
  NNAM[4] 0x0005fc1d (float 5.49619e-40)
  RNAM[4] 0x41c00000 (float 24)
  NNAM[4] 0x0005fc97 (float 5.4979e-40)
  RNAM[4] 0x41c00000 (float 24)
  NNAM[4] 0x0005fcc0 (float 5.49847e-40)
  RNAM[4] 0x41c00000 (float 24)
  NNAM[4] 0x0005fd0d (float 5.49955e-40)
  RNAM[4] 0x41c00000 (float 24)
  NNAM[4] 0x00063ee7 (float 5.73578e-40)
  RNAM[4] 0x41c00000 (float 24)
  NNAM[4] 0x00063ee9 (float 5.73581e-40)
  RNAM[4] 0x41c00000 (float 24)
  NNAM[4] 0x00063eeb (float 5.73584e-40)
  RNAM[4] 0x41c00000 (float 24)
  NNAM[4] 0x00063eee (float 5.73588e-40)
  RNAM[4] 0x41c00000 (float 24)
  NNAM[4] 0x00063ef0 (float 5.73591e-40)
  RNAM[4] 0x41c00000 (float 24)
  NNAM[4] 0x00063ef2 (float 5.73594e-40)
  RNAM[4] 0x41c00000 (float 24)
  NNAM[4] 0x00063ef4 (float 5.73596e-40)
  RNAM[4] 0x41c00000 (float 24)
  NNAM[4] 0x00063ef6 (float 5.73599e-40)
  RNAM[4] 0x41c00000 (float 24)
  NNAM[4] 0x00063ef8 (float 5.73602e-40)
  RNAM[4] 0x41c00000 (float 24)
  NNAM[4] 0x00063efa (float 5.73605e-40)
  RNAM[4] 0x41c00000 (float 24)
  NNAM[4] 0x00063efc (float 5.73608e-40)
  RNAM[4] 0x41c00000 (float 24)
  NNAM[4] 0x00063efe (float 5.7361e-40)
  RNAM[4] 0x41c00000 (float 24)
  NNAM[4] 0x00063f00 (float 5.73613e-40)
  RNAM[4] 0x41c00000 (float 24)
  NNAM[4] 0x00063f02 (float 5.73616e-40)
  RNAM[4] 0x41c00000 (float 24)
  NNAM[4] 0x00063f05 (float 5.7362e-40)
  RNAM[4] 0x41c00000 (float 24)
  NNAM[4] 0x00063f07 (float 5.73623e-40)
  RNAM[4] 0x41c00000 (float 24)
  NNAM[4] 0x00063f0a (float 5.73627e-40)
  RNAM[4] 0x41c00000 (float 24)
  NNAM[4] 0x00063f0c (float 5.7363e-40)
  RNAM[4] 0x41c00000 (float 24)
  NNAM[4] 0x00063f0e (float 5.73633e-40)
  RNAM[4] 0x41c00000 (float 24)
SMQN 0x00046e14 FisheryConversations
  PNAM[4] 0x00046e0f (float 4.06824e-40)
  SNAM[4] 0x00046e13 (float 4.06829e-40)
  CITC[4] 0x00000001 (float 1.4013e-45)
  CTDA[32] floats ['8.36413e-26', '1', '5.03066e-43', '1.97386e-40', '0', '9.80909e-45', '0', '1.76928e-41']
  DNAM[4] 0x00010001 (float 9.18369e-41)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000004 (float 5.60519e-45)
  NNAM[4] 0x00046d9e (float 4.06665e-40)
  NNAM[4] 0x00046da0 (float 4.06668e-40)
  NNAM[4] 0x00046da3 (float 4.06672e-40)
  NNAM[4] 0x00046da5 (float 4.06675e-40)
SMQN 0x00046e13 ElgrimsElixirsConversations
  PNAM[4] 0x00046e0f (float 4.06824e-40)
  SNAM[4] 0x00046e12 (float 4.06828e-40)
  CITC[4] 0x00000001 (float 1.4013e-45)
  CTDA[32] floats ['8.36413e-26', '1', '5.03066e-43', '1.96775e-40', '0', '9.80909e-45', '0', '1.76928e-41']
  DNAM[4] 0x00010001 (float 9.18369e-41)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000004 (float 5.60519e-45)
  NNAM[4] 0x00046da9 (float 4.06681e-40)
  NNAM[4] 0x00046dab (float 4.06683e-40)
  NNAM[4] 0x00071218 (float 6.49339e-40)
  NNAM[4] 0x0007121a (float 6.49342e-40)
SMQN 0x00046e12 BlackBriarMeaderyConversations
  PNAM[4] 0x00046e0f (float 4.06824e-40)
  SNAM[4] 0x00046e11 (float 4.06826e-40)
  CITC[4] 0x00000001 (float 1.4013e-45)
  CTDA[32] floats ['8.36413e-26', '1', '5.03066e-43', '1.96768e-40', '0', '9.80909e-45', '0', '1.76928e-41']
  DNAM[4] 0x00010001 (float 9.18369e-41)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000003 (float 4.2039e-45)
  NNAM[4] 0x00046b2f (float 4.05792e-40)
  NNAM[4] 0x00046b31 (float 4.05795e-40)
  NNAM[4] 0x00046b33 (float 4.05798e-40)
SMQN 0x00046e11 BlackBriarManorConversations
  PNAM[4] 0x00046e0f (float 4.06824e-40)
  SNAM[4] 0x00046e10 (float 4.06825e-40)
  CITC[4] 0x00000001 (float 1.4013e-45)
  CTDA[32] floats ['8.36413e-26', '1', '5.03066e-43', '1.96765e-40', '0', '9.80909e-45', '0', '1.76928e-41']
  DNAM[4] 0x00010001 (float 9.18369e-41)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000002 (float 2.8026e-45)
  NNAM[4] 0x00046b39 (float 4.05806e-40)
  NNAM[4] 0x00046b3b (float 4.05809e-40)
SMQN 0x00046e10 BeeAndBarbConversations
  PNAM[4] 0x00046e0f (float 4.06824e-40)
  SNAM[4] 0x00000000 (float 0)
  CITC[4] 0x00000001 (float 1.4013e-45)
  CTDA[32] floats ['8.36413e-26', '1', '5.03066e-43', '1.96762e-40', '0', '9.80909e-45', '0', '1.76928e-41']
  DNAM[4] 0x00010001 (float 9.18369e-41)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000014 (float 2.8026e-44)
  NNAM[4] 0x00044d1f (float 3.95008e-40)
  NNAM[4] 0x00044d21 (float 3.95011e-40)
  NNAM[4] 0x00044d23 (float 3.95013e-40)
  NNAM[4] 0x00044d25 (float 3.95016e-40)
  NNAM[4] 0x0004580e (float 3.9893e-40)
  NNAM[4] 0x00046b2b (float 4.05787e-40)
  NNAM[4] 0x00046b2d (float 4.05789e-40)
  NNAM[4] 0x00046b4f (float 4.05837e-40)
  NNAM[4] 0x00046b51 (float 4.0584e-40)
  NNAM[4] 0x00046b53 (float 4.05843e-40)
  NNAM[4] 0x00046b55 (float 4.05845e-40)
  NNAM[4] 0x00046b57 (float 4.05848e-40)
  NNAM[4] 0x000b6686 (float 1.04697e-39)
  NNAM[4] 0x000b7302 (float 1.05145e-39)
  NNAM[4] 0x0005ee55 (float 5.44675e-40)
  NNAM[4] 0x0005ee57 (float 5.44678e-40)
  NNAM[4] 0x0005ee5c (float 5.44685e-40)
  NNAM[4] 0x0005ee62 (float 5.44693e-40)
  NNAM[4] 0x0005ee68 (float 5.44702e-40)
  NNAM[4] 0x0005ee76 (float 5.44721e-40)
SMQN 0x00046b8d MQCallDragonNode
  PNAM[4] 0x0001379a (float 1.11782e-40)
  SNAM[4] 0x0010ec64 (float 1.55417e-39)
  CITC[4] 0x00000001 (float 1.4013e-45)
  CTDA[32] floats ['4.76105e-23', '1', '8.07148e-43', '2.95404e-09', '4.05917e-40', '0', '0', 'nan']
  DNAM[4] 0x00000000 (float 0)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000001 (float 1.4013e-45)
  NNAM[4] 0x00046b8e (float 4.05925e-40)
SMQN 0x00044839 MorthalFalionsHouseScenes
  PNAM[4] 0x000443a2 (float 3.91604e-40)
  SNAM[4] 0x000443a9 (float 3.91614e-40)
  CITC[4] 0x00000001 (float 1.4013e-45)
  CTDA[32] floats ['3.47159e-24', '1', '9.3887e-44', '1.12216e-40', '0', '9.80909e-45', '0', '1.76928e-41']
  DNAM[4] 0x00000001 (float 1.4013e-45)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000004 (float 5.60519e-45)
  NNAM[4] 0x00044838 (float 3.93249e-40)
  NNAM[4] 0x0004483b (float 3.93253e-40)
  NNAM[4] 0x0004483d (float 3.93256e-40)
  NNAM[4] 0x000ad8e1 (float 9.96156e-40)
SMQN 0x000443f5 dunHighGateRuinsNode
  PNAM[4] 0x00030b13 (float 2.79479e-40)
  SNAM[4] 0x00043bb0 (float 3.88754e-40)
  CITC[4] 0x00000001 (float 1.4013e-45)
  CTDA[32] floats ['0', '1', '3.15045e-36', '1.4406e-40', '0', '0', '0', 'nan']
  DNAM[4] 0x00000000 (float 0)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000001 (float 1.4013e-45)
  NNAM[4] 0x000443f4 (float 3.91719e-40)
SMQN 0x000443a9 MorthalThaumaturgistHutScenes
  PNAM[4] 0x000443a2 (float 3.91604e-40)
  SNAM[4] 0x00000000 (float 0)
  CITC[4] 0x00000001 (float 1.4013e-45)
  CTDA[32] floats ['0', '1', '1.44446e-32', '1.12209e-40', '0', '9.80909e-45', '0', '1.76928e-41']
  DNAM[4] 0x00000001 (float 1.4013e-45)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000003 (float 4.2039e-45)
  NNAM[4] 0x000443a7 (float 3.91611e-40)
  NNAM[4] 0x00044834 (float 3.93244e-40)
  NNAM[4] 0x00044836 (float 3.93246e-40)
SMQN 0x00043d3b LoreiusFarmOutsideConvoScenes
  PNAM[4] 0x00043d38 (float 3.89303e-40)
  SNAM[4] 0x00043d39 (float 3.89305e-40)
  CITC[4] 0x00000001 (float 1.4013e-45)
  CTDA[32] floats ['0', '1', '2.03433e-33', '1.42858e-40', '0', '0', '0', 'nan']
  DNAM[4] 0x00010001 (float 9.18369e-41)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000002 (float 2.8026e-45)
  NNAM[4] 0x00043d34 (float 3.89298e-40)
  NNAM[4] 0x00043d36 (float 3.893e-40)
SMQN 0x00043d39 LoreiusFarmInsideConvoScenes
  PNAM[4] 0x00043d38 (float 3.89303e-40)
  SNAM[4] 0x00000000 (float 0)
  CITC[4] 0x00000001 (float 1.4013e-45)
  CTDA[32] floats ['9.44149e-23', '1', '5.03066e-43', '3.89306e-40', '0', '0', '0', 'nan']
  DNAM[4] 0x00010001 (float 9.18369e-41)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000000 (float 0)
SMQN 0x00043bb0 dunShipwreck04Node
  PNAM[4] 0x00030b13 (float 2.79479e-40)
  SNAM[4] 0x0003faa5 (float 3.65421e-40)
  CITC[4] 0x00000001 (float 1.4013e-45)
  CTDA[32] floats ['0', '1', '3.45608e-36', '1.44437e-40', '0', '0', '0', 'nan']
  DNAM[4] 0x00020000 (float 1.83671e-40)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000001 (float 1.4013e-45)
  NNAM[4] 0x00043bab (float 3.88747e-40)
SMQN 0x00043a27 CidhnaMinePrisonerConvoScenes
  PNAM[4] 0x00043a26 (float 3.88202e-40)
  SNAM[4] 0x00000000 (float 0)
  CITC[4] 0x00000001 (float 1.4013e-45)
  CTDA[32] floats ['2.67259e-23', '1', '5.03066e-43', '1.42261e-40', '0', '0', '0', 'nan']
  DNAM[4] 0x00010001 (float 9.18369e-41)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000005 (float 7.00649e-45)
  NNAM[4] 0x00043a0e (float 3.88168e-40)
  RNAM[4] 0x44100000 (float 576)
  NNAM[4] 0x00043a12 (float 3.88174e-40)
  RNAM[4] 0x44100000 (float 576)
  NNAM[4] 0x00043a14 (float 3.88176e-40)
  RNAM[4] 0x44100000 (float 576)
  NNAM[4] 0x00043a16 (float 3.88179e-40)
  RNAM[4] 0x44100000 (float 576)
  NNAM[4] 0x000dd5ef (float 1.27061e-39)
  RNAM[4] 0x44100000 (float 576)
SMQN 0x0003faa5 darklightNode
  PNAM[4] 0x00030b13 (float 2.79479e-40)
  SNAM[4] 0x0003ed88 (float 3.60717e-40)
  CITC[4] 0x00000001 (float 1.4013e-45)
  CTDA[32] floats ['1.54927e-15', '1', '5.03066e-43', '1.43982e-40', '0', '0', '0', 'nan']
  DNAM[4] 0x00020000 (float 1.83671e-40)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000001 (float 1.4013e-45)
  NNAM[4] 0x0003fa89 (float 3.65382e-40)
SMQN 0x0003fa1a DA14QuestStartNode
  PNAM[4] 0x00090028 (float 8.26576e-40)
  SNAM[4] 0x0005d331 (float 5.34939e-40)
  CITC[4] 0x00000003 (float 4.2039e-45)
  CTDA[32] floats ['1.16088e-26', '14', '1.12104e-43', '0', '0', '2.8026e-45', '2.8026e-44', 'nan']
  CTDA[32] floats ['1.16088e-26', '5', '8.12753e-44', '1.59136e-40', '0', '0', '0', 'nan']
  CTDA[32] floats ['1.16087e-26', '1', '8.07148e-43', '1.18744e-08', '3.29881e-40', '0', '0', '1.76928e-41']
  DNAM[4] 0x00020000 (float 1.83671e-40)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000001 (float 1.4013e-45)
  NNAM[4] 0x0003fa17 (float 3.65222e-40)
SMQN 0x0003ed88 dunValthumeNode
  PNAM[4] 0x00030b13 (float 2.79479e-40)
  SNAM[4] 0x0003e906 (float 3.591e-40)
  CITC[4] 0x00000001 (float 1.4013e-45)
  CTDA[32] floats ['1.54932e-15', '1', '5.03066e-43', '2.97613e-40', '0', '0', '0', 'nan']
  DNAM[4] 0x00020000 (float 1.83671e-40)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000001 (float 1.4013e-45)
  NNAM[4] 0x0003ed82 (float 3.60708e-40)
SMQN 0x0003e906 HillgrundsTombNode
  PNAM[4] 0x00030b13 (float 2.79479e-40)
  SNAM[4] 0x0003d27b (float 3.51013e-40)
  CITC[4] 0x00000000 (float 0)
  DNAM[4] 0x00020000 (float 1.83671e-40)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000001 (float 1.4013e-45)
  NNAM[4] 0x0003e897 (float 3.58944e-40)
SMQN 0x0003d27b RavenscarNode
  PNAM[4] 0x00030b13 (float 2.79479e-40)
  SNAM[4] 0x0003cd37 (float 3.49124e-40)
  CITC[4] 0x00000001 (float 1.4013e-45)
  CTDA[32] floats ['1.45571e-16', '1', '5.03066e-43', '1.44414e-40', '0', '0', '0', 'nan']
  DNAM[4] 0x00020000 (float 1.83671e-40)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000001 (float 1.4013e-45)
  NNAM[4] 0x0003d26c (float 3.50992e-40)
SMQN 0x0003d227 DawnstarWindpeakInnConvoScenes
  PNAM[4] 0x0003d21e (float 3.50882e-40)
  SNAM[4] 0x0003d225 (float 3.50892e-40)
  CITC[4] 0x00000001 (float 1.4013e-45)
  CTDA[32] floats ['7.735e-25', '1', '5.03066e-43', '1.83813e-40', '0', '9.80909e-45', '0', '1.76928e-41']
  DNAM[4] 0x00010001 (float 9.18369e-41)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000008 (float 1.12104e-44)
  NNAM[4] 0x0003d21a (float 3.50877e-40)
  RNAM[4] 0x44100000 (float 576)
  NNAM[4] 0x0003d21c (float 3.5088e-40)
  RNAM[4] 0x44100000 (float 576)
  NNAM[4] 0x0005b297 (float 5.23243e-40)
  RNAM[4] 0x44100000 (float 576)
  NNAM[4] 0x0005b299 (float 5.23246e-40)
  RNAM[4] 0x44100000 (float 576)
  NNAM[4] 0x0005b29b (float 5.23249e-40)
  RNAM[4] 0x44100000 (float 576)
  NNAM[4] 0x0005b29d (float 5.23252e-40)
  RNAM[4] 0x44100000 (float 576)
  NNAM[4] 0x0005b29f (float 5.23255e-40)
  RNAM[4] 0x44100000 (float 576)
  NNAM[4] 0x0005b2a1 (float 5.23257e-40)
  RNAM[4] 0x44100000 (float 576)
SMQN 0x0003d226 DawnstarWhiteHallSonsConvoScenes
  PNAM[4] 0x0003d21e (float 3.50882e-40)
  SNAM[4] 0x00000000 (float 0)
  CITC[4] 0x00000001 (float 1.4013e-45)
  CTDA[32] floats ['7.735e-25', '1', '5.03066e-43', '1.83808e-40', '0', '9.80909e-45', '0', '1.76928e-41']
  DNAM[4] 0x00010001 (float 9.18369e-41)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000006 (float 8.40779e-45)
  NNAM[4] 0x0003cdda (float 3.49352e-40)
  RNAM[4] 0x44100000 (float 576)
  NNAM[4] 0x0003d202 (float 3.50843e-40)
  RNAM[4] 0x44100000 (float 576)
  NNAM[4] 0x0003d204 (float 3.50846e-40)
  RNAM[4] 0x44100000 (float 576)
  NNAM[4] 0x0003d206 (float 3.50849e-40)
  RNAM[4] 0x44100000 (float 576)
  NNAM[4] 0x0003d208 (float 3.50852e-40)
  RNAM[4] 0x44100000 (float 576)
  NNAM[4] 0x0003d20a (float 3.50854e-40)
  RNAM[4] 0x44100000 (float 576)
SMQN 0x0003d225 DawnstarWhiteHallImperialConvoScenes
  PNAM[4] 0x0003d21e (float 3.50882e-40)
  SNAM[4] 0x0003d226 (float 3.50894e-40)
  CITC[4] 0x00000001 (float 1.4013e-45)
  CTDA[32] floats ['2.67259e-23', '1', '5.03066e-43', '1.83808e-40', '0', '9.80909e-45', '0', '1.76928e-41']
  DNAM[4] 0x00010001 (float 9.18369e-41)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000005 (float 7.00649e-45)
  NNAM[4] 0x0003d20c (float 3.50857e-40)
  RNAM[4] 0x44100000 (float 576)
  NNAM[4] 0x0003d20e (float 3.5086e-40)
  RNAM[4] 0x44100000 (float 576)
  NNAM[4] 0x0003d210 (float 3.50863e-40)
  RNAM[4] 0x44100000 (float 576)
  NNAM[4] 0x0003d212 (float 3.50866e-40)
  RNAM[4] 0x44100000 (float 576)
  NNAM[4] 0x0003d214 (float 3.50868e-40)
  RNAM[4] 0x44100000 (float 576)
SMQN 0x0003d224 DawnstarQuicksilverConvoScenes
  PNAM[4] 0x0003d21e (float 3.50882e-40)
  SNAM[4] 0x0003d222 (float 3.50888e-40)
  CITC[4] 0x00000000 (float 0)
  DNAM[4] 0x00010001 (float 9.18369e-41)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000002 (float 2.8026e-45)
  NNAM[4] 0x0003cdd6 (float 3.49347e-40)
  RNAM[4] 0x44100000 (float 576)
  NNAM[4] 0x0003cdd8 (float 3.49349e-40)
  RNAM[4] 0x44100000 (float 576)
SMQN 0x0003d222 DawnstarRustleifSmithyConvoScenes
  PNAM[4] 0x0003d21e (float 3.50882e-40)
  SNAM[4] 0x0003d221 (float 3.50887e-40)
  CITC[4] 0x00000000 (float 0)
  DNAM[4] 0x00010001 (float 9.18369e-41)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000002 (float 2.8026e-45)
  NNAM[4] 0x0003cdca (float 3.4933e-40)
  RNAM[4] 0x44100000 (float 576)
  NNAM[4] 0x0003cdc8 (float 3.49327e-40)
  RNAM[4] 0x44100000 (float 576)
SMQN 0x0003d221 DawnstarIronBreakerConvoScenes
  PNAM[4] 0x0003d21e (float 3.50882e-40)
  SNAM[4] 0x0003d21f (float 3.50884e-40)
  CITC[4] 0x00000000 (float 0)
  DNAM[4] 0x00010001 (float 9.18369e-41)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000002 (float 2.8026e-45)
  NNAM[4] 0x0003cdce (float 3.49335e-40)
  RNAM[4] 0x44100000 (float 576)
  NNAM[4] 0x0003cdd0 (float 3.49338e-40)
  RNAM[4] 0x44100000 (float 576)
SMQN 0x0003d21f DawnstarBrinaHorikConvoScenes
  PNAM[4] 0x0003d21e (float 3.50882e-40)
  SNAM[4] 0x0003d227 (float 3.50895e-40)
  CITC[4] 0x00000000 (float 0)
  DNAM[4] 0x00010001 (float 9.18369e-41)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000002 (float 2.8026e-45)
  NNAM[4] 0x0003cdc0 (float 3.49316e-40)
  RNAM[4] 0x44100000 (float 576)
  NNAM[4] 0x0003cdc2 (float 3.49318e-40)
  RNAM[4] 0x44100000 (float 576)
SMQN 0x0003cd37 TolvaldsCaveNode
  PNAM[4] 0x00030b13 (float 2.79479e-40)
  SNAM[4] 0x0001e4e6 (float 1.73949e-40)
  CITC[4] 0x00000001 (float 1.4013e-45)
  CTDA[32] floats ['8.27824e-36', '1', '5.03066e-43', '1.44474e-40', '0', '9.80909e-45', '0', '1.76928e-41']
  DNAM[4] 0x00020000 (float 1.83671e-40)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000001 (float 1.4013e-45)
  NNAM[4] 0x0003cd36 (float 3.49122e-40)
SMQN 0x000263f9 MarkarthKeepConvoScenes
  PNAM[4] 0x000340c6 (float 2.98743e-40)
  SNAM[4] 0x00000000 (float 0)
  CITC[4] 0x00000001 (float 1.4013e-45)
  CTDA[32] floats ['2.47326e-23', '1', '5.03066e-43', '1.79038e-40', '0', '9.80909e-45', '0', '1.76928e-41']
  DNAM[4] 0x00010001 (float 9.18369e-41)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x0000000f (float 2.10195e-44)
  NNAM[4] 0x00026047 (float 2.18209e-40)
  RNAM[4] 0x44100000 (float 576)
  NNAM[4] 0x00026043 (float 2.18203e-40)
  RNAM[4] 0x44100000 (float 576)
  NNAM[4] 0x00059b00 (float 5.14781e-40)
  RNAM[4] 0x44100000 (float 576)
  NNAM[4] 0x00059b02 (float 5.14784e-40)
  RNAM[4] 0x44100000 (float 576)
  NNAM[4] 0x00025f07 (float 2.1776e-40)
  RNAM[4] 0x44100000 (float 576)
  NNAM[4] 0x00026046 (float 2.18207e-40)
  RNAM[4] 0x44100000 (float 576)
  NNAM[4] 0x00026017 (float 2.18142e-40)
  RNAM[4] 0x44100000 (float 576)
  NNAM[4] 0x00025f01 (float 2.17752e-40)
  RNAM[4] 0x44100000 (float 576)
  NNAM[4] 0x00025ef9 (float 2.17741e-40)
  RNAM[4] 0x44100000 (float 576)
  NNAM[4] 0x00025ef2 (float 2.17731e-40)
  RNAM[4] 0x44100000 (float 576)
  NNAM[4] 0x00017295 (float 1.3294e-40)
  RNAM[4] 0x44100000 (float 576)
  NNAM[4] 0x00026048 (float 2.1821e-40)
  RNAM[4] 0x44100000 (float 576)
  NNAM[4] 0x00026041 (float 2.182e-40)
  RNAM[4] 0x44100000 (float 576)
  NNAM[4] 0x000b0223 (float 1.01096e-39)
  RNAM[4] 0x44100000 (float 576)
  NNAM[4] 0x000b0225 (float 1.01096e-39)
  RNAM[4] 0x44100000 (float 576)
SMQN 0x000263f8 MarkarthEndonsHouseConvoScenes
  PNAM[4] 0x000340c6 (float 2.98743e-40)
  SNAM[4] 0x000263f9 (float 2.19534e-40)
  CITC[4] 0x00000001 (float 1.4013e-45)
  CTDA[32] floats ['2.47326e-23', '1', '5.03066e-43', '1.79024e-40', '0', '9.80909e-45', '0', '1.76928e-41']
  DNAM[4] 0x00010001 (float 9.18369e-41)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000002 (float 2.8026e-45)
  NNAM[4] 0x00025eef (float 2.17727e-40)
  FNAM[4] 0x00000002 (float 2.8026e-45)
  RNAM[4] 0x44100000 (float 576)
  NNAM[4] 0x00026044 (float 2.18205e-40)
  FNAM[4] 0x00000002 (float 2.8026e-45)
  RNAM[4] 0x44100000 (float 576)
SMQN 0x000263f7 MarkarthHagsCureConvoScenes
  PNAM[4] 0x000340c6 (float 2.98743e-40)
  SNAM[4] 0x000263f8 (float 2.19533e-40)
  CITC[4] 0x00000001 (float 1.4013e-45)
  CTDA[32] floats ['5.19775e-24', '1', '5.03066e-43', '1.79028e-40', '0', '9.80909e-45', '0', '1.76928e-41']
  DNAM[4] 0x00010001 (float 9.18369e-41)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000004 (float 5.60519e-45)
  NNAM[4] 0x00025f08 (float 2.17762e-40)
  RNAM[4] 0x44100000 (float 576)
  NNAM[4] 0x00025f25 (float 2.17802e-40)
  RNAM[4] 0x44100000 (float 576)
  NNAM[4] 0x000d055b (float 1.19578e-39)
  NNAM[4] 0x000d0559 (float 1.19578e-39)
SMQN 0x000263f6 MarkarthMarketConvoScenes
  PNAM[4] 0x000340c6 (float 2.98743e-40)
  SNAM[4] 0x000263f7 (float 2.19532e-40)
  CITC[4] 0x00000001 (float 1.4013e-45)
  CTDA[32] floats ['3.13683e-26', '1', '4.34403e-43', '1.31096e-40', '0', '9.80909e-45', '0', '1.76928e-41']
  DNAM[4] 0x00010001 (float 9.18369e-41)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000009 (float 1.26117e-44)
  NNAM[4] 0x000590d4 (float 5.11132e-40)
  RNAM[4] 0x44100000 (float 576)
  NNAM[4] 0x000590d2 (float 5.11129e-40)
  RNAM[4] 0x44100000 (float 576)
  NNAM[4] 0x00017291 (float 1.32934e-40)
  RNAM[4] 0x44100000 (float 576)
  NNAM[4] 0x00017293 (float 1.32937e-40)
  RNAM[4] 0x44100000 (float 576)
  NNAM[4] 0x0001728d (float 1.32929e-40)
  RNAM[4] 0x44100000 (float 576)
  NNAM[4] 0x0001728f (float 1.32931e-40)
  RNAM[4] 0x44100000 (float 576)
  NNAM[4] 0x00017289 (float 1.32923e-40)
  RNAM[4] 0x44100000 (float 576)
  NNAM[4] 0x0001728b (float 1.32926e-40)
  RNAM[4] 0x44100000 (float 576)
  NNAM[4] 0x000b0221 (float 1.01095e-39)
  RNAM[4] 0x44100000 (float 576)
SMQN 0x000263f5 MarkarthNepossHouseConvoScenes
  PNAM[4] 0x000340c6 (float 2.98743e-40)
  SNAM[4] 0x000263f6 (float 2.1953e-40)
  CITC[4] 0x00000001 (float 1.4013e-45)
  CTDA[32] floats ['1.03763e-35', '1', '5.03066e-43', '1.79037e-40', '0', '9.80909e-45', '0', '1.76928e-41']
  DNAM[4] 0x00010001 (float 9.18369e-41)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000000 (float 0)
SMQN 0x000263f4 MarkarthArnleifConvoScenes
  PNAM[4] 0x000340c6 (float 2.98743e-40)
  SNAM[4] 0x000263f5 (float 2.19529e-40)
  CITC[4] 0x00000001 (float 1.4013e-45)
  CTDA[32] floats ['2.47326e-23', '1', '5.03066e-43', '1.7903e-40', '0', '9.80909e-45', '0', '1.76928e-41']
  DNAM[4] 0x00010001 (float 9.18369e-41)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000004 (float 5.60519e-45)
  NNAM[4] 0x00017ca5 (float 1.3655e-40)
  RNAM[4] 0x44100000 (float 576)
  NNAM[4] 0x00017e09 (float 1.37048e-40)
  RNAM[4] 0x44100000 (float 576)
  NNAM[4] 0x00059f70 (float 5.16373e-40)
  RNAM[4] 0x44100000 (float 576)
  NNAM[4] 0x00059f72 (float 5.16376e-40)
  RNAM[4] 0x44100000 (float 576)
SMQN 0x000263f3 MarkarthSilverFishInnConvoScenes
  PNAM[4] 0x000340c6 (float 2.98743e-40)
  SNAM[4] 0x000263f4 (float 2.19527e-40)
  CITC[4] 0x00000001 (float 1.4013e-45)
  CTDA[32] floats ['1.34481e-27', '1', '5.03066e-43', '1.79027e-40', '0', '9.80909e-45', '0', '1.76928e-41']
  DNAM[4] 0x00010001 (float 9.18369e-41)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000010 (float 2.24208e-44)
  NNAM[4] 0x00025eed (float 2.17724e-40)
  RNAM[4] 0x44100000 (float 576)
  NNAM[4] 0x00025ef7 (float 2.17738e-40)
  RNAM[4] 0x44100000 (float 576)
  NNAM[4] 0x00025efb (float 2.17744e-40)
  RNAM[4] 0x44100000 (float 576)
  NNAM[4] 0x00025f02 (float 2.17753e-40)
  RNAM[4] 0x44100000 (float 576)
  NNAM[4] 0x00025f03 (float 2.17755e-40)
  RNAM[4] 0x44100000 (float 576)
  NNAM[4] 0x00025ef3 (float 2.17732e-40)
  RNAM[4] 0x44100000 (float 576)
  NNAM[4] 0x00025f05 (float 2.17758e-40)
  RNAM[4] 0x44100000 (float 576)
  NNAM[4] 0x00025eff (float 2.17749e-40)
  RNAM[4] 0x44100000 (float 576)
  NNAM[4] 0x00025efe (float 2.17748e-40)
  RNAM[4] 0x44100000 (float 576)
  NNAM[4] 0x000590ce (float 5.11124e-40)
  RNAM[4] 0x44100000 (float 576)
  NNAM[4] 0x000590d0 (float 5.11126e-40)
  RNAM[4] 0x44100000 (float 576)
  NNAM[4] 0x00025eef (float 2.17727e-40)
  RNAM[4] 0x44100000 (float 576)
  NNAM[4] 0x00026044 (float 2.18205e-40)
  RNAM[4] 0x44100000 (float 576)
  NNAM[4] 0x00025eee (float 2.17725e-40)
  RNAM[4] 0x44100000 (float 576)
  NNAM[4] 0x00025ef1 (float 2.1773e-40)
  RNAM[4] 0x44100000 (float 576)
  NNAM[4] 0x00025f26 (float 2.17804e-40)
  RNAM[4] 0x44100000 (float 576)
SMQN 0x000263f2 MarkarthStablesConvoScenes
  PNAM[4] 0x000340c6 (float 2.98743e-40)
  SNAM[4] 0x000263f3 (float 2.19526e-40)
  CITC[4] 0x00000001 (float 1.4013e-45)
  CTDA[32] floats ['2.47326e-23', '0', '4.34403e-43', '1.31096e-40', '0', '9.80909e-45', '0', '1.76928e-41']
  DNAM[4] 0x00010001 (float 9.18369e-41)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000002 (float 2.8026e-45)
  NNAM[4] 0x00055b0f (float 4.91843e-40)
  RNAM[4] 0x44100000 (float 576)
  NNAM[4] 0x00055aa9 (float 4.917e-40)
  RNAM[4] 0x44100000 (float 576)
SMQN 0x000263f1 MarkarthTreasuryHouseConvoScenes
  PNAM[4] 0x000340c6 (float 2.98743e-40)
  SNAM[4] 0x000263f2 (float 2.19525e-40)
  CITC[4] 0x00000001 (float 1.4013e-45)
  CTDA[32] floats ['2.47326e-23', '1', '5.03066e-43', '1.79035e-40', '0', '9.80909e-45', '0', '1.76928e-41']
  DNAM[4] 0x00010001 (float 9.18369e-41)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000006 (float 8.40779e-45)
  NNAM[4] 0x00017297 (float 1.32943e-40)
  NNAM[4] 0x00017c93 (float 1.36524e-40)
  NNAM[4] 0x00017c9b (float 1.36536e-40)
  NNAM[4] 0x00017c9d (float 1.36538e-40)
  NNAM[4] 0x00017c9f (float 1.36541e-40)
  NNAM[4] 0x00017ca3 (float 1.36547e-40)
SMQN 0x000263f0 MarkarthWizardsTowerConvoScenes
  PNAM[4] 0x000340c6 (float 2.98743e-40)
  SNAM[4] 0x000263f1 (float 2.19523e-40)
  CITC[4] 0x00000001 (float 1.4013e-45)
  CTDA[32] floats ['1.76779e-27', '1', '5.03066e-43', '1.79038e-40', '0', '9.80909e-45', '0', '1.76928e-41']
  DNAM[4] 0x00010001 (float 9.18369e-41)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000000 (float 0)
SMQN 0x00026317 MarkarthWarrensConvoScenes
  PNAM[4] 0x000340c6 (float 2.98743e-40)
  SNAM[4] 0x000263f0 (float 2.19522e-40)
  CITC[4] 0x00000001 (float 1.4013e-45)
  CTDA[32] floats ['2.47326e-23', '1', '5.03066e-43', '1.79026e-40', '0', '9.80909e-45', '0', '1.76928e-41']
  DNAM[4] 0x00010001 (float 9.18369e-41)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000000 (float 0)
SMQN 0x0001e4e6 BrokenOarNode
  PNAM[4] 0x00030b13 (float 2.79479e-40)
  SNAM[4] 0x0003ad4c (float 3.37674e-40)
  CITC[4] 0x00000001 (float 1.4013e-45)
  CTDA[32] floats ['1.38309e-15', '1', '5.03066e-43', '1.43968e-40', '0', '0', '0', 'nan']
  DNAM[4] 0x00020000 (float 1.83671e-40)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000001 (float 1.4013e-45)
  NNAM[4] 0x0001e437 (float 1.73704e-40)
SMQN 0x00038790 WinterholdKorirsHouseScenes
  PNAM[4] 0x00037ed5 (float 3.21005e-40)
  SNAM[4] 0x0003878f (float 3.24136e-40)
  CITC[4] 0x00000001 (float 1.4013e-45)
  CTDA[32] floats ['3.56881e-25', '1', '9.3887e-44', '1.1195e-40', '0', '9.80909e-45', '0', '1.76928e-41']
  DNAM[4] 0x00000001 (float 1.4013e-45)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000006 (float 8.40779e-45)
  NNAM[4] 0x000376f3 (float 3.18177e-40)
  NNAM[4] 0x000379e1 (float 3.19228e-40)
  NNAM[4] 0x000379e3 (float 3.19231e-40)
  NNAM[4] 0x00035114 (float 3.04592e-40)
  NNAM[4] 0x00035125 (float 3.04616e-40)
  NNAM[4] 0x00035127 (float 3.04618e-40)
SMQN 0x0003878f WinterholdJarlsLonghouseScenes
  PNAM[4] 0x00037ed5 (float 3.21005e-40)
  SNAM[4] 0x000350f3 (float 3.04546e-40)
  CITC[4] 0x00000001 (float 1.4013e-45)
  CTDA[32] floats ['3.56881e-25', '1', '9.3887e-44', '1.11958e-40', '0', '9.80909e-45', '0', '1.76928e-41']
  DNAM[4] 0x00000001 (float 1.4013e-45)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000006 (float 8.40779e-45)
  NNAM[4] 0x00035114 (float 3.04592e-40)
  NNAM[4] 0x00035125 (float 3.04616e-40)
  NNAM[4] 0x00035127 (float 3.04618e-40)
  NNAM[4] 0x000376f3 (float 3.18177e-40)
  NNAM[4] 0x000379e1 (float 3.19228e-40)
  NNAM[4] 0x000379e3 (float 3.19231e-40)
SMQN 0x00038787 CWFortOpenGateNode
  PNAM[4] 0x000236a1 (float 2.03268e-40)
  SNAM[4] 0x00064351 (float 5.75162e-40)
  CITC[4] 0x00000001 (float 1.4013e-45)
  CTDA[32] floats ['8.91365e-26', '1', '8.07148e-43', '2.95404e-09', '3.24126e-40', '0', '0', 'nan']
  DNAM[4] 0x00000000 (float 0)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000000 (float 0)
SMQN 0x000350f3 WinterholdInnScenes
  PNAM[4] 0x00037ed5 (float 3.21005e-40)
  SNAM[4] 0x00037ede (float 3.21018e-40)
  CITC[4] 0x00000001 (float 1.4013e-45)
  CTDA[32] floats ['3.87699e-32', '1', '9.3887e-44', '1.11953e-40', '0', '9.80909e-45', '0', '1.76928e-41']
  DNAM[4] 0x00000001 (float 1.4013e-45)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000008 (float 1.12104e-44)
  NNAM[4] 0x000318c2 (float 2.84388e-40)
  NNAM[4] 0x000318c4 (float 2.84391e-40)
  NNAM[4] 0x00031942 (float 2.84567e-40)
  NNAM[4] 0x00031944 (float 2.8457e-40)
  NNAM[4] 0x00031946 (float 2.84573e-40)
  NNAM[4] 0x00031948 (float 2.84576e-40)
  NNAM[4] 0x0003194a (float 2.84578e-40)
  NNAM[4] 0x0003194c (float 2.84581e-40)
SMQN 0x0003ad4c HalldirsCairnNode
  PNAM[4] 0x00030b13 (float 2.79479e-40)
  SNAM[4] 0x000357e6 (float 3.07039e-40)
  CITC[4] 0x00000001 (float 1.4013e-45)
  CTDA[32] floats ['1.70108e-27', '1', '5.03066e-43', '1.44056e-40', '0', '0', '0', 'nan']
  DNAM[4] 0x00020000 (float 1.83671e-40)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000001 (float 1.4013e-45)
  NNAM[4] 0x0003ad4a (float 3.37671e-40)
SMQN 0x0003a17e MS13BleakFallsBarrowCampSceneNode
  PNAM[4] 0x00030b13 (float 2.79479e-40)
  SNAM[4] 0x000b8ca2 (float 1.06064e-39)
  CITC[4] 0x00000001 (float 1.4013e-45)
  CTDA[32] floats ['4.48616e-36', '1', '8.07148e-43', '1.18744e-08', '1.43102e-40', '0', '0', 'nan']
  DNAM[4] 0x00020000 (float 1.83671e-40)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000001 (float 1.4013e-45)
  NNAM[4] 0x0003a17c (float 3.33436e-40)
SMQN 0x0003a15d WhiterunHeimskrSceneNode
  PNAM[4] 0x0009002c (float 8.26581e-40)
  SNAM[4] 0x00000000 (float 0)
  CITC[4] 0x00000001 (float 1.4013e-45)
  CTDA[32] floats ['6.89369e-34', '1', '8.07148e-43', '1.18744e-08', '1.41461e-40', '0', '0', 'nan']
  DNAM[4] 0x00020000 (float 1.83671e-40)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000001 (float 1.4013e-45)
  NNAM[4] 0x0003a15a (float 3.33389e-40)
SMQN 0x0003a158 RoriksteadConversations
  PNAM[4] 0x00039c8a (float 3.31662e-40)
  SNAM[4] 0x00039c8b (float 3.31664e-40)
  CITC[4] 0x00000000 (float 0)
  DNAM[4] 0x00010001 (float 9.18369e-41)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x0000000d (float 1.82169e-44)
  NNAM[4] 0x00039c88 (float 3.31659e-40)
  NNAM[4] 0x0003a156 (float 3.33383e-40)
  NNAM[4] 0x0009b04d (float 8.89764e-40)
  NNAM[4] 0x0009b057 (float 8.89778e-40)
  NNAM[4] 0x0009b059 (float 8.89781e-40)
  NNAM[4] 0x000a31dc (float 9.36241e-40)
  NNAM[4] 0x000a31de (float 9.36244e-40)
  NNAM[4] 0x000a31e0 (float 9.36247e-40)
  NNAM[4] 0x000a31e2 (float 9.3625e-40)
  NNAM[4] 0x000a3237 (float 9.36369e-40)
  NNAM[4] 0x000a3235 (float 9.36366e-40)
  NNAM[4] 0x000a3233 (float 9.36363e-40)
  NNAM[4] 0x000a3231 (float 9.3636e-40)
SMQN 0x00039fbd WICourierNodeSharesEvent
  PNAM[4] 0x0001320e (float 1.09792e-40)
  SNAM[4] 0x0003844e (float 3.22968e-40)
  CITC[4] 0x00000008 (float 1.12104e-44)
  CTDA[32] floats ['0', '1', '1.03696e-43', '3.09012e-40', '0', '0', '0', 'nan']
  CTDA[32] floats ['1.34525e-43', '1', '1.03696e-43', '3.32807e-40', '0', '0', '0', 'nan']
  CTDA[32] floats ['0', '1', '8.07148e-43', '1.18744e-08', '3.29881e-40', '0', '0', 'nan']
  CTDA[32] floats ['0', '0', '8.07148e-43', '1.18744e-08', '1.09381e-40', '0', '0', 'nan']
  CTDA[32] floats ['1.34525e-43', '0', '9.12245e-43', '1.13029e-39', '0', '2.8026e-45', '2.8026e-44', 'nan']
  CTDA[32] floats ['0', '0', '8.07148e-43', '1.18744e-08', '6.82749e-40', '0', '0', 'nan']
  CTDA[32] floats ['0', '0', '5.03066e-43', '6.82749e-40', '0', '2.8026e-45', '2.8026e-44', 'nan']
  CTDA[32] floats ['0', '0', '5.03066e-43', '1.41444e-40', '0', '2.8026e-45', '2.8026e-44', 'nan']
  DNAM[4] 0x00020000 (float 1.83671e-40)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000001 (float 1.4013e-45)
  NNAM[4] 0x00039f82 (float 3.32727e-40)
SMQN 0x00039c8c DBSanctuaryConvSystem
  PNAM[4] 0x00034d02 (float 3.03132e-40)
  SNAM[4] 0x00000000 (float 0)
  CITC[4] 0x00000000 (float 0)
  DNAM[4] 0x00000000 (float 0)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000001 (float 1.4013e-45)
  NNAM[4] 0x0003444d (float 3.00008e-40)
  RNAM[4] 0x4099999a (float 4.8)
SMQN 0x00039c8b RoriksteadMiscScenes
  PNAM[4] 0x00039c8a (float 3.31662e-40)
  SNAM[4] 0x00000000 (float 0)
  CITC[4] 0x00000000 (float 0)
  DNAM[4] 0x00010001 (float 9.18369e-41)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000002 (float 2.8026e-45)
  NNAM[4] 0x00039c88 (float 3.31659e-40)
  FNAM[4] 0x00000002 (float 2.8026e-45)
  NNAM[4] 0x00039df7 (float 3.32174e-40)
SMQN 0x0003833f WIDeadBodyQuestNode
  PNAM[4] 0x0003833e (float 3.22587e-40)
  SNAM[4] 0x00000000 (float 0)
  CITC[4] 0x00000009 (float 1.26117e-44)
  CTDA[32] floats ['1.04316e-17', '1', '9.94922e-44', '2.20939e-40', '0', '9.80909e-45', '0', '1.80515e-41']
  CTDA[32] floats ['1.04316e-17', '1', '9.94922e-44', '2.30104e-40', '0', '9.80909e-45', '0', '1.80515e-41']
  CTDA[32] floats ['1.04316e-17', '1', '9.94922e-44', '2.40239e-40', '0', '9.80909e-45', '0', '1.80515e-41']
  CTDA[32] floats ['1.04316e-17', '1', '9.94922e-44', '2.301e-40', '0', '9.80909e-45', '0', '1.80515e-41']
  CTDA[32] floats ['1.04316e-17', '1', '9.94922e-44', '2.30102e-40', '0', '9.80909e-45', '0', '1.80515e-41']
  CTDA[32] floats ['1.04316e-17', '1', '9.94922e-44', '2.30099e-40', '0', '9.80909e-45', '0', '1.80515e-41']
  CTDA[32] floats ['1.04316e-17', '1', '9.94922e-44', '2.30097e-40', '0', '9.80909e-45', '0', '1.80515e-41']
  CTDA[32] floats ['1.04316e-17', '1', '9.94922e-44', '2.20948e-40', '0', '9.80909e-45', '0', '1.80515e-41']
  CTDA[32] floats ['1.04316e-17', '1', '9.94922e-44', '2.30103e-40', '0', '9.80909e-45', '0', '1.80515e-41']
  DNAM[4] 0x00010001 (float 9.18369e-41)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000001 (float 1.4013e-45)
  NNAM[4] 0x0003833c (float 3.22585e-40)
  RNAM[4] 0x44100000 (float 576)
SMQN 0x00037ede WinterholdCollegeDormitoryScenes
  PNAM[4] 0x00037ed5 (float 3.21005e-40)
  SNAM[4] 0x00037ed7 (float 3.21008e-40)
  CITC[4] 0x00000001 (float 1.4013e-45)
  CTDA[32] floats ['4.96715e-37', '1', '9.3887e-44', '1.11946e-40', '0', '9.80909e-45', '0', '1.76928e-41']
  DNAM[4] 0x00000001 (float 1.4013e-45)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x0000000b (float 1.54143e-44)
  NNAM[4] 0x00037eda (float 3.21012e-40)
  NNAM[4] 0x00037edc (float 3.21015e-40)
  NNAM[4] 0x0005d32a (float 5.34929e-40)
  NNAM[4] 0x0005d32c (float 5.34932e-40)
  NNAM[4] 0x0005d32e (float 5.34934e-40)
  NNAM[4] 0x0005e2d9 (float 5.40555e-40)
  NNAM[4] 0x0005e2db (float 5.40558e-40)
  NNAM[4] 0x0005e2df (float 5.40563e-40)
  NNAM[4] 0x0005e2e1 (float 5.40566e-40)
  NNAM[4] 0x000b3248 (float 1.02823e-39)
  NNAM[4] 0x000b3242 (float 1.02822e-39)
SMQN 0x00037ed7 WinterholdCollegeGHallScenes
  PNAM[4] 0x00037ed5 (float 3.21005e-40)
  SNAM[4] 0x00037ed6 (float 3.21007e-40)
  CITC[4] 0x00000001 (float 1.4013e-45)
  CTDA[32] floats ['8.49106e-16', '1', '9.3887e-44', '1.11944e-40', '0', '9.80909e-45', '0', '1.76928e-41']
  DNAM[4] 0x00000001 (float 1.4013e-45)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000006 (float 8.40779e-45)
  NNAM[4] 0x00037e82 (float 3.20889e-40)
  NNAM[4] 0x00037e84 (float 3.20892e-40)
  NNAM[4] 0x00037e86 (float 3.20895e-40)
  NNAM[4] 0x00037ed8 (float 3.21009e-40)
  NNAM[4] 0x0005e2dd (float 5.40561e-40)
  NNAM[4] 0x000b3240 (float 1.02822e-39)
SMQN 0x00037ed6 WinterholdCollegeArcanaeumScenes
  PNAM[4] 0x00037ed5 (float 3.21005e-40)
  SNAM[4] 0x00000000 (float 0)
  CITC[4] 0x00000001 (float 1.4013e-45)
  CTDA[32] floats ['3.87699e-32', '1', '9.3887e-44', '1.11947e-40', '0', '9.80909e-45', '0', '1.76928e-41']
  DNAM[4] 0x00000001 (float 1.4013e-45)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000006 (float 8.40779e-45)
  NNAM[4] 0x00037dd4 (float 3.20645e-40)
  NNAM[4] 0x00037dd3 (float 3.20644e-40)
  NNAM[4] 0x00037dd7 (float 3.20649e-40)
  NNAM[4] 0x00037e7e (float 3.20883e-40)
  NNAM[4] 0x00037e80 (float 3.20886e-40)
  NNAM[4] 0x0005e2d7 (float 5.40552e-40)
SMQN 0x00037e08 SnowShodFarmConversations
  PNAM[4] 0x000340c8 (float 2.98746e-40)
  SNAM[4] 0x00000000 (float 0)
  CITC[4] 0x00000000 (float 0)
  DNAM[4] 0x00000000 (float 0)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000002 (float 2.8026e-45)
  NNAM[4] 0x00037e07 (float 3.20717e-40)
  NNAM[4] 0x00037e09 (float 3.20719e-40)
SMQN 0x00036635 CWGovernmentNode
  PNAM[4] 0x000236a1 (float 2.03268e-40)
  SNAM[4] 0x000ff236 (float 1.46442e-39)
  CITC[4] 0x00000001 (float 1.4013e-45)
  CTDA[32] floats ['1.14249e-26', '1', '8.07148e-43', '2.95404e-09', '3.12173e-40', '0', '0', 'nan']
  DNAM[4] 0x00000000 (float 0)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000001 (float 1.4013e-45)
  NNAM[4] 0x00036626 (float 3.1215e-40)
SMQN 0x00035b5d WIPlayerAddItemNodeA
  PNAM[4] 0x00035b5c (float 3.0828e-40)
  SNAM[4] 0x0005221f (float 4.71418e-40)
  CITC[4] 0x00000004 (float 5.60519e-45)
  CTDA[32] floats ['1.4013e-45', '1', '1.01734e-42', '0', '0', '9.80909e-45', '0', '1.80515e-41']
  CTDA[32] floats ['0', '0', '6.34788e-43', '0', '0', '9.80909e-45', '0', '1.80515e-41']
  CTDA[32] floats ['1.4013e-45', '1', '1.01734e-42', '0', '0', '9.80909e-45', '0', '1.80515e-41']
  CTDA[32] floats ['0', '0', '1.00893e-43', '2.20944e-40', '0', '9.80909e-45', '0', '1.80515e-41']
  DNAM[4] 0x00010000 (float 9.18355e-41)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000004 (float 5.60519e-45)
  NNAM[4] 0x0002c437 (float 2.5406e-40)
  RNAM[4] 0x40c00000 (float 6)
  NNAM[4] 0x00034da3 (float 3.03357e-40)
  RNAM[4] 0x40c00000 (float 6)
  NNAM[4] 0x00035b5a (float 3.08277e-40)
  RNAM[4] 0x44900000 (float 1152)
  NNAM[4] 0x000a0f43 (float 9.2383e-40)
SMQN 0x000357e6 KarthspireRedoubtNode
  PNAM[4] 0x00030b13 (float 2.79479e-40)
  SNAM[4] 0x00030b38 (float 2.79531e-40)
  CITC[4] 0x00000001 (float 1.4013e-45)
  CTDA[32] floats ['1.70108e-27', '1', '5.03066e-43', '1.44344e-40', '0', '0', '0', 'nan']
  DNAM[4] 0x00000000 (float 0)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000001 (float 1.4013e-45)
  NNAM[4] 0x000357e5 (float 3.07037e-40)
SMQN 0x00035257 SolitudeSawmillScenes
  PNAM[4] 0x00035242 (float 3.05015e-40)
  SNAM[4] 0x00000000 (float 0)
  CITC[4] 0x00000001 (float 1.4013e-45)
  CTDA[32] floats ['0', '1', '6.78895e-33', '1.26959e-40', '0', '9.80909e-45', '0', '1.76928e-41']
  DNAM[4] 0x00010001 (float 9.18369e-41)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000001 (float 1.4013e-45)
  NNAM[4] 0x00035258 (float 3.05046e-40)
SMQN 0x00035256 SolitudeKatlasFarmScenes
  PNAM[4] 0x00035242 (float 3.05015e-40)
  SNAM[4] 0x00035257 (float 3.05044e-40)
  CITC[4] 0x00000001 (float 1.4013e-45)
  CTDA[32] floats ['0', '1', '6.78895e-33', '1.26979e-40', '0', '9.80909e-45', '0', '1.76928e-41']
  DNAM[4] 0x00010001 (float 9.18369e-41)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000001 (float 1.4013e-45)
  NNAM[4] 0x0003525a (float 3.05049e-40)
SMQN 0x00035252 SolitudeCastleInteriorScenes
  PNAM[4] 0x00035248 (float 3.05023e-40)
  SNAM[4] 0x00000000 (float 0)
  CITC[4] 0x00000000 (float 0)
  DNAM[4] 0x00010001 (float 9.18369e-41)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000004 (float 5.60519e-45)
  NNAM[4] 0x000367c9 (float 3.12738e-40)
  NNAM[4] 0x000367cb (float 3.1274e-40)
  NNAM[4] 0x000367cd (float 3.12743e-40)
  NNAM[4] 0x000367cf (float 3.12746e-40)
SMQN 0x00035251 SolitudeDocksGeneralScenes
  PNAM[4] 0x00035247 (float 3.05022e-40)
  SNAM[4] 0x00000000 (float 0)
  CITC[4] 0x00000000 (float 0)
  DNAM[4] 0x00010001 (float 9.18369e-41)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000003 (float 4.2039e-45)
  NNAM[4] 0x000367d1 (float 3.12749e-40)
  NNAM[4] 0x000367d3 (float 3.12752e-40)
  NNAM[4] 0x000367d5 (float 3.12754e-40)
SMQN 0x00035250 SolitudeFamilyScenes
  PNAM[4] 0x00035246 (float 3.05021e-40)
  SNAM[4] 0x0003524f (float 3.05033e-40)
  CITC[4] 0x00000000 (float 0)
  DNAM[4] 0x00010001 (float 9.18369e-41)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x0000000b (float 1.54143e-44)
  NNAM[4] 0x00017f01 (float 1.37396e-40)
  NNAM[4] 0x000367d7 (float 3.12757e-40)
  NNAM[4] 0x000367d9 (float 3.1276e-40)
  NNAM[4] 0x000367db (float 3.12763e-40)
  NNAM[4] 0x000367dd (float 3.12766e-40)
  NNAM[4] 0x000367df (float 3.12768e-40)
  NNAM[4] 0x000367e1 (float 3.12771e-40)
  NNAM[4] 0x000367e3 (float 3.12774e-40)
  NNAM[4] 0x000367e7 (float 3.1278e-40)
  NNAM[4] 0x000367e4 (float 3.12775e-40)
  NNAM[4] 0x000367e9 (float 3.12782e-40)
SMQN 0x0003524f SolitudeBardsCollegeScenes
  PNAM[4] 0x00035246 (float 3.05021e-40)
  SNAM[4] 0x0003524e (float 3.05032e-40)
  CITC[4] 0x00000001 (float 1.4013e-45)
  CTDA[32] floats ['6.85283e-26', '1', '7.91734e-43', '1.83853e-40', '0', '9.80909e-45', '0', '1.76928e-41']
  DNAM[4] 0x00010001 (float 9.18369e-41)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000006 (float 8.40779e-45)
  NNAM[4] 0x000367f1 (float 3.12794e-40)
  NNAM[4] 0x000367f2 (float 3.12795e-40)
  NNAM[4] 0x000367f3 (float 3.12796e-40)
  NNAM[4] 0x000e77ed (float 1.32872e-39)
  NNAM[4] 0x000e77f1 (float 1.32872e-39)
  NNAM[4] 0x000e77f2 (float 1.32873e-39)
SMQN 0x0003524e SolitudeTempleScenes
  PNAM[4] 0x00035246 (float 3.05021e-40)
  SNAM[4] 0x0003524d (float 3.0503e-40)
  CITC[4] 0x00000001 (float 1.4013e-45)
  CTDA[32] floats ['0', '1', '4.13794e-36', '1.83899e-40', '0', '9.80909e-45', '0', '1.76928e-41']
  DNAM[4] 0x00010001 (float 9.18369e-41)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000003 (float 4.2039e-45)
  NNAM[4] 0x000367eb (float 3.12785e-40)
  NNAM[4] 0x000367ed (float 3.12788e-40)
  NNAM[4] 0x000367ee (float 3.12789e-40)
SMQN 0x0003524d SolitudePalaceScenes
  PNAM[4] 0x00035246 (float 3.05021e-40)
  SNAM[4] 0x00000000 (float 0)
  CITC[4] 0x00000001 (float 1.4013e-45)
  CTDA[32] floats ['0', '1', '4.13794e-36', '1.83859e-40', '0', '9.80909e-45', '0', '1.76928e-41']
  DNAM[4] 0x00010001 (float 9.18369e-41)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000004 (float 5.60519e-45)
  NNAM[4] 0x000367f7 (float 3.12802e-40)
  NNAM[4] 0x000367f8 (float 3.12803e-40)
  NNAM[4] 0x000367f9 (float 3.12805e-40)
  NNAM[4] 0x000367fa (float 3.12806e-40)
SMQN 0x0003524c SolitudeWellMarketScenes
  PNAM[4] 0x00035245 (float 3.05019e-40)
  SNAM[4] 0x0003524a (float 3.05026e-40)
  CITC[4] 0x00000000 (float 0)
  DNAM[4] 0x00000001 (float 1.4013e-45)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000015 (float 2.94273e-44)
  NNAM[4] 0x000c7cf5 (float 1.14685e-39)
  NNAM[4] 0x000c7d10 (float 1.14689e-39)
  NNAM[4] 0x000c7d15 (float 1.1469e-39)
  NNAM[4] 0x000c7f4b (float 1.14769e-39)
  NNAM[4] 0x000c7f4d (float 1.14769e-39)
  NNAM[4] 0x000c7f4f (float 1.1477e-39)
  NNAM[4] 0x000c7d1a (float 1.1469e-39)
  NNAM[4] 0x000c7d17 (float 1.1469e-39)
  NNAM[4] 0x000c9b92 (float 1.15783e-39)
  NNAM[4] 0x000c9b98 (float 1.15784e-39)
  NNAM[4] 0x000c9b9a (float 1.15785e-39)
  NNAM[4] 0x000c9b94 (float 1.15784e-39)
  NNAM[4] 0x000c9b96 (float 1.15784e-39)
  NNAM[4] 0x000c9b9d (float 1.15785e-39)
  NNAM[4] 0x000d0536 (float 1.19573e-39)
  NNAM[4] 0x000d0540 (float 1.19574e-39)
  NNAM[4] 0x000d053a (float 1.19574e-39)
  NNAM[4] 0x000d053b (float 1.19574e-39)
  NNAM[4] 0x000d053e (float 1.19574e-39)
  NNAM[4] 0x000d0543 (float 1.19575e-39)
  NNAM[4] 0x000d0538 (float 1.19573e-39)
SMQN 0x0003524b SolitudeWellShopScenes
  PNAM[4] 0x00035245 (float 3.05019e-40)
  SNAM[4] 0x00085472 (float 7.64977e-40)
  CITC[4] 0x00000000 (float 0)
  DNAM[4] 0x00000001 (float 1.4013e-45)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000009 (float 1.26117e-44)
  NNAM[4] 0x000367bf (float 3.12724e-40)
  NNAM[4] 0x000367c0 (float 3.12725e-40)
  NNAM[4] 0x000367c1 (float 3.12726e-40)
  NNAM[4] 0x000367c5 (float 3.12732e-40)
  NNAM[4] 0x000367be (float 3.12722e-40)
  NNAM[4] 0x000367bd (float 3.12721e-40)
  NNAM[4] 0x000cd851 (float 1.17963e-39)
  NNAM[4] 0x000cdb56 (float 1.18071e-39)
  NNAM[4] 0x000cdb58 (float 1.18071e-39)
SMQN 0x0003524a SolitudeWinkingSkeeverScenes
  PNAM[4] 0x00035245 (float 3.05019e-40)
  SNAM[4] 0x00000000 (float 0)
  CITC[4] 0x00000001 (float 1.4013e-45)
  CTDA[32] floats ['3.51077e-24', '1', '7.91734e-43', '1.83902e-40', '0', '9.80909e-45', '0', '1.76928e-41']
  DNAM[4] 0x00000001 (float 1.4013e-45)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000006 (float 8.40779e-45)
  NNAM[4] 0x000358ba (float 3.07336e-40)
  NNAM[4] 0x000358bc (float 3.07338e-40)
  NNAM[4] 0x000358be (float 3.07341e-40)
  NNAM[4] 0x000358c0 (float 3.07344e-40)
  NNAM[4] 0x000358c4 (float 3.0735e-40)
  NNAM[4] 0x000358c6 (float 3.07352e-40)
SMQN 0x00035102 RiverwoodKidsSceneNode
  PNAM[4] 0x0009002d (float 8.26583e-40)
  SNAM[4] 0x00096593 (float 8.62957e-40)
  CITC[4] 0x00000005 (float 7.00649e-45)
  CTDA[32] floats ['2.63727e-26', '5', '2.52234e-44', '0', '0', '0', '0', 'nan']
  CTDA[32] floats ['2.63729e-26', '19', '2.52234e-44', '0', '0', '0', '0', 'nan']
  CTDA[32] floats ['2.63724e-26', '1', '8.07148e-43', '1.18744e-08', '1.09552e-40', '0', '0', 'nan']
  CTDA[32] floats ['2.63727e-26', '40', '8.12753e-44', '2.52407e-40', '0', '0', '0', 'nan']
  CTDA[32] floats ['2.63727e-26', '40', '8.12753e-44', '2.18482e-40', '0', '0', '0', 'nan']
  DNAM[4] 0x00020000 (float 1.83671e-40)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000001 (float 1.4013e-45)
  NNAM[4] 0x000340a4 (float 2.98695e-40)
SMQN 0x000350f6 WIChangeLocationNodeA
  PNAM[4] 0x000a39c6 (float 9.3908e-40)
  SNAM[4] 0x00000000 (float 0)
  CITC[4] 0x00000000 (float 0)
  DNAM[4] 0x00030001 (float 2.75508e-40)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000007 (float 9.80909e-45)
  NNAM[4] 0x0006c9c6 (float 6.23396e-40)
  RNAM[4] 0x41c00000 (float 24)
  NNAM[4] 0x000350f4 (float 3.04547e-40)
  RNAM[4] 0x41c00000 (float 24)
  NNAM[4] 0x0006e028 (float 6.31425e-40)
  RNAM[4] 0x44900000 (float 1152)
  NNAM[4] 0x0006f211 (float 6.3785e-40)
  RNAM[4] 0x44900000 (float 1152)
  NNAM[4] 0x00070e30 (float 6.47938e-40)
  RNAM[4] 0x43900000 (float 288)
  NNAM[4] 0x0004bcf1 (float 4.35121e-40)
  NNAM[4] 0x00050af1 (float 4.63103e-40)
SMQN 0x0003365a LeftHandMineScenes
  PNAM[4] 0x00033659 (float 2.95003e-40)
  SNAM[4] 0x00000000 (float 0)
  CITC[4] 0x00000000 (float 0)
  DNAM[4] 0x00010001 (float 9.18369e-41)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000006 (float 8.40779e-45)
  NNAM[4] 0x0001fd8c (float 1.82791e-40)
  RNAM[4] 0x44100000 (float 576)
  NNAM[4] 0x00030164 (float 2.76005e-40)
  RNAM[4] 0x44100000 (float 576)
  NNAM[4] 0x0001fd89 (float 1.82787e-40)
  RNAM[4] 0x44100000 (float 576)
  NNAM[4] 0x00030165 (float 2.76007e-40)
  RNAM[4] 0x44100000 (float 576)
  NNAM[4] 0x00030161 (float 2.76001e-40)
  RNAM[4] 0x44100000 (float 576)
  NNAM[4] 0x00066263 (float 5.86307e-40)
  RNAM[4] 0x44100000 (float 576)
SMQN 0x00033658 DushnikhYalLonghouseScenes
  PNAM[4] 0x00033655 (float 2.94997e-40)
  SNAM[4] 0x00033657 (float 2.95e-40)
  CITC[4] 0x00000001 (float 1.4013e-45)
  CTDA[32] floats ['1.63649e-27', '1', '5.03066e-43', '1.80797e-40', '0', '9.80909e-45', '0', '1.76928e-41']
  DNAM[4] 0x00010001 (float 9.18369e-41)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000003 (float 4.2039e-45)
  NNAM[4] 0x00033647 (float 2.94978e-40)
  RNAM[4] 0x44100000 (float 576)
  NNAM[4] 0x00033649 (float 2.9498e-40)
  RNAM[4] 0x44100000 (float 576)
  NNAM[4] 0x0003364b (float 2.94983e-40)
  RNAM[4] 0x44100000 (float 576)
SMQN 0x00033657 DushnikhYalExteriorScenes
  PNAM[4] 0x00033655 (float 2.94997e-40)
  SNAM[4] 0x00033656 (float 2.94999e-40)
  CITC[4] 0x00000000 (float 0)
  DNAM[4] 0x00010001 (float 9.18369e-41)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000005 (float 7.00649e-45)
  NNAM[4] 0x00033651 (float 2.94992e-40)
  RNAM[4] 0x44100000 (float 576)
  NNAM[4] 0x00033652 (float 2.94993e-40)
  RNAM[4] 0x44100000 (float 576)
  NNAM[4] 0x000606fb (float 5.53517e-40)
  RNAM[4] 0x44100000 (float 576)
  NNAM[4] 0x000606fd (float 5.5352e-40)
  RNAM[4] 0x44100000 (float 576)
  NNAM[4] 0x000606ff (float 5.53523e-40)
  RNAM[4] 0x44100000 (float 576)
SMQN 0x00033656 DushnikhYalMineScenes
  PNAM[4] 0x00033655 (float 2.94997e-40)
  SNAM[4] 0x00000000 (float 0)
  CITC[4] 0x00000001 (float 1.4013e-45)
  CTDA[32] floats ['1.63649e-27', '1', '5.03066e-43', '1.80798e-40', '0', '9.80909e-45', '0', '1.76928e-41']
  DNAM[4] 0x00010001 (float 9.18369e-41)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000002 (float 2.8026e-45)
  NNAM[4] 0x0003364d (float 2.94986e-40)
  RNAM[4] 0x44100000 (float 576)
  NNAM[4] 0x0003364f (float 2.94989e-40)
  RNAM[4] 0x44100000 (float 576)
SMQN 0x0003313f MorKhazgurMineScenes
  PNAM[4] 0x0003313c (float 2.93168e-40)
  SNAM[4] 0x0003313e (float 2.93171e-40)
  CITC[4] 0x00000001 (float 1.4013e-45)
  CTDA[32] floats ['3.40994e-23', '1', '7.91734e-43', '1.80804e-40', '0', '9.80909e-45', '0', '1.76928e-41']
  DNAM[4] 0x00010001 (float 9.18369e-41)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000000 (float 0)
SMQN 0x0003313e MorKhazgurExteriorScenes
  PNAM[4] 0x0003313c (float 2.93168e-40)
  SNAM[4] 0x0003313d (float 2.9317e-40)
  CITC[4] 0x00000001 (float 1.4013e-45)
  CTDA[32] floats ['1.63649e-27', '1', '7.91734e-43', '1.44384e-40', '0', '9.80909e-45', '0', '1.76928e-41']
  DNAM[4] 0x00010001 (float 9.18369e-41)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000002 (float 2.8026e-45)
  NNAM[4] 0x00033134 (float 2.93157e-40)
  RNAM[4] 0x44100000 (float 576)
  NNAM[4] 0x00060713 (float 5.53551e-40)
  RNAM[4] 0x44100000 (float 576)
SMQN 0x0003313d MorKhazgurLonghouseScenes
  PNAM[4] 0x0003313c (float 2.93168e-40)
  SNAM[4] 0x00000000 (float 0)
  CITC[4] 0x00000001 (float 1.4013e-45)
  CTDA[32] floats ['1.63649e-27', '1', '7.91734e-43', '1.80803e-40', '0', '9.80909e-45', '0', '1.76928e-41']
  DNAM[4] 0x00010001 (float 9.18369e-41)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000002 (float 2.8026e-45)
  NNAM[4] 0x0003312c (float 2.93146e-40)
  RNAM[4] 0x44100000 (float 576)
  NNAM[4] 0x0003312d (float 2.93147e-40)
  RNAM[4] 0x44100000 (float 576)
SMQN 0x00033139 SoljundsHouseScenes
  PNAM[4] 0x00033136 (float 2.9316e-40)
  SNAM[4] 0x00033138 (float 2.93163e-40)
  CITC[4] 0x00000001 (float 1.4013e-45)
  CTDA[32] floats ['1.63649e-27', '1', '5.03066e-43', '2.77512e-40', '0', '9.80909e-45', '0', '1.76928e-41']
  DNAM[4] 0x00010001 (float 9.18369e-41)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000004 (float 5.60519e-45)
  NNAM[4] 0x0003059c (float 2.77519e-40)
  RNAM[4] 0x44100000 (float 576)
  NNAM[4] 0x000614f7 (float 5.58534e-40)
  RNAM[4] 0x44100000 (float 576)
  NNAM[4] 0x000614fa (float 5.58538e-40)
  RNAM[4] 0x44100000 (float 576)
  NNAM[4] 0x000614fc (float 5.58541e-40)
  RNAM[4] 0x44100000 (float 576)
SMQN 0x00033138 SoljundsMineScenes
  PNAM[4] 0x00033136 (float 2.9316e-40)
  SNAM[4] 0x00000000 (float 0)
  CITC[4] 0x00000001 (float 1.4013e-45)
  CTDA[32] floats ['1.63649e-27', '1', '5.03066e-43', '2.77516e-40', '0', '9.80909e-45', '0', '1.76928e-41']
  DNAM[4] 0x00010001 (float 9.18369e-41)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000002 (float 2.8026e-45)
  NNAM[4] 0x0006150e (float 5.58566e-40)
  RNAM[4] 0x44100000 (float 576)
  NNAM[4] 0x00061510 (float 5.58569e-40)
  RNAM[4] 0x44100000 (float 576)
SMQN 0x00030b38 MistwatchNode01
  PNAM[4] 0x00030b13 (float 2.79479e-40)
  SNAM[4] 0x00030b14 (float 2.79481e-40)
  CITC[4] 0x00000001 (float 1.4013e-45)
  CTDA[32] floats ['9.88255e-23', '1', '5.03066e-43', '1.44383e-40', '0', '9.80909e-45', '0', '1.76928e-41']
  DNAM[4] 0x00020000 (float 1.83671e-40)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000001 (float 1.4013e-45)
  NNAM[4] 0x00030b36 (float 2.79528e-40)
SMQN 0x00030b14 ThalmorEmbassyNode
  PNAM[4] 0x00030b13 (float 2.79479e-40)
  SNAM[4] 0x00000000 (float 0)
  CITC[4] 0x00000001 (float 1.4013e-45)
  CTDA[32] floats ['0', '1', '5.03066e-43', '1.42263e-40', '0', '9.80909e-45', '0', '1.76928e-41']
  DNAM[4] 0x00000000 (float 0)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000001 (float 1.4013e-45)
  NNAM[4] 0x00030b15 (float 2.79482e-40)
SMQN 0x000303f8 SarethiFarmConversations
  PNAM[4] 0x000303f7 (float 2.76929e-40)
  SNAM[4] 0x00000000 (float 0)
  CITC[4] 0x00000001 (float 1.4013e-45)
  CTDA[32] floats ['1.67642e-25', '1', '5.03066e-43', '1.42867e-40', '0', '9.80909e-45', '0', '1.76928e-41']
  DNAM[4] 0x00010001 (float 9.18369e-41)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000003 (float 4.2039e-45)
  NNAM[4] 0x000e4d75 (float 1.31348e-39)
  NNAM[4] 0x000303f3 (float 2.76923e-40)
  NNAM[4] 0x000303f4 (float 2.76925e-40)
SMQN 0x000302c6 HeartwoodMillConversations
  PNAM[4] 0x000302c5 (float 2.765e-40)
  SNAM[4] 0x00000000 (float 0)
  CITC[4] 0x00000000 (float 0)
  DNAM[4] 0x00000000 (float 0)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000002 (float 2.8026e-45)
  NNAM[4] 0x000302c2 (float 2.76496e-40)
  NNAM[4] 0x000302c1 (float 2.76494e-40)
SMQN 0x0003027e MerryfairFarmConversations
  PNAM[4] 0x0003027d (float 2.76399e-40)
  SNAM[4] 0x00000000 (float 0)
  CITC[4] 0x00000000 (float 0)
  DNAM[4] 0x00010001 (float 9.18369e-41)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000002 (float 2.8026e-45)
  NNAM[4] 0x0003027b (float 2.76396e-40)
  NNAM[4] 0x00030279 (float 2.76394e-40)
SMQN 0x0003015d SalviusFarmOutsideScenes
  PNAM[4] 0x0003015c (float 2.75994e-40)
  SNAM[4] 0x00000000 (float 0)
  CITC[4] 0x00000000 (float 0)
  DNAM[4] 0x00010001 (float 9.18369e-41)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000004 (float 5.60519e-45)
  NNAM[4] 0x0002ec5d (float 2.68462e-40)
  RNAM[4] 0x44100000 (float 576)
  NNAM[4] 0x00030155 (float 2.75984e-40)
  RNAM[4] 0x44100000 (float 576)
  NNAM[4] 0x00030157 (float 2.75987e-40)
  RNAM[4] 0x44100000 (float 576)
  NNAM[4] 0x00030159 (float 2.7599e-40)
  RNAM[4] 0x44100000 (float 576)
SMQN 0x0002f1b1 StonehillsMineScenes
  PNAM[4] 0x0002f1b0 (float 2.70372e-40)
  SNAM[4] 0x00000000 (float 0)
  CITC[4] 0x00000001 (float 1.4013e-45)
  CTDA[32] floats ['0', '1', '9.3887e-44', '2.66673e-40', '0', '9.80909e-45', '0', '1.76928e-41']
  DNAM[4] 0x00000001 (float 1.4013e-45)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000004 (float 5.60519e-45)
  NNAM[4] 0x0002f1ae (float 2.70369e-40)
  NNAM[4] 0x0002f1b2 (float 2.70375e-40)
  NNAM[4] 0x0002f21d (float 2.70525e-40)
  NNAM[4] 0x0002f21f (float 2.70528e-40)
SMQN 0x00026e4f RiverwoodDryGoodsScenes
  PNAM[4] 0x00026e47 (float 2.23231e-40)
  SNAM[4] 0x00026e49 (float 2.23234e-40)
  CITC[4] 0x00000002 (float 2.8026e-45)
  CTDA[32] floats ['1.34525e-43', '100', '1.81038e-32', '3.29413e-40', '0', '0', '0', 'nan']
  CTDA[32] floats ['0', '1', '1.81038e-32', '1.10413e-40', '0', '9.80909e-45', '0', '1.76928e-41']
  DNAM[4] 0x00000001 (float 1.4013e-45)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000001 (float 1.4013e-45)
  NNAM[4] 0x00026e4c (float 2.23238e-40)
SMQN 0x00026e49 RiverwoodSleepingGiantScenes
  PNAM[4] 0x00026e47 (float 2.23231e-40)
  SNAM[4] 0x00026e48 (float 2.23232e-40)
  CITC[4] 0x00000001 (float 1.4013e-45)
  CTDA[32] floats ['5.86276e-24', '1', '9.3887e-44', '1.10408e-40', '0', '9.80909e-45', '0', '1.76928e-41']
  DNAM[4] 0x00000001 (float 1.4013e-45)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000009 (float 1.26117e-44)
  NNAM[4] 0x00026e45 (float 2.23228e-40)
  FNAM[4] 0x00000002 (float 2.8026e-45)
  RNAM[4] 0x42c00000 (float 96)
  NNAM[4] 0x00026e4a (float 2.23235e-40)
  FNAM[4] 0x00000002 (float 2.8026e-45)
  RNAM[4] 0x42c00000 (float 96)
  NNAM[4] 0x00098e58 (float 8.77583e-40)
  RNAM[4] 0x41c00000 (float 24)
  NNAM[4] 0x00098e5a (float 8.77586e-40)
  RNAM[4] 0x41c00000 (float 24)
  NNAM[4] 0x00098e61 (float 8.77595e-40)
  NNAM[4] 0x00098e63 (float 8.77598e-40)
  NNAM[4] 0x000d2c6a (float 1.20979e-39)
  NNAM[4] 0x000d2c6c (float 1.2098e-39)
  NNAM[4] 0x00098e5c (float 8.77588e-40)
  RNAM[4] 0x4019999a (float 2.4)
SMQN 0x00026e48 RiverwoodMiscScenes
  PNAM[4] 0x00026e47 (float 2.23231e-40)
  SNAM[4] 0x00000000 (float 0)
  CITC[4] 0x00000000 (float 0)
  DNAM[4] 0x00010001 (float 9.18369e-41)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x0000000d (float 1.82169e-44)
  NNAM[4] 0x00026e50 (float 2.23244e-40)
  NNAM[4] 0x00026e52 (float 2.23246e-40)
  NNAM[4] 0x00026e55 (float 2.23251e-40)
  NNAM[4] 0x0002d5c3 (float 2.60354e-40)
  NNAM[4] 0x00015fcc (float 1.26201e-40)
  FNAM[4] 0x00000002 (float 2.8026e-45)
  NNAM[4] 0x0008afc9 (float 7.97744e-40)
  RNAM[4] 0x41c00000 (float 24)
  NNAM[4] 0x0008cdbb (float 8.08486e-40)
  RNAM[4] 0x41c00000 (float 24)
  NNAM[4] 0x0008cdbf (float 8.08492e-40)
  RNAM[4] 0x41c00000 (float 24)
  NNAM[4] 0x0008cdbd (float 8.08489e-40)
  RNAM[4] 0x41c00000 (float 24)
  NNAM[4] 0x000954db (float 8.5696e-40)
  NNAM[4] 0x000954dd (float 8.56963e-40)
  RNAM[4] 0x42c00000 (float 96)
  NNAM[4] 0x000d2c5f (float 1.20978e-39)
  NNAM[4] 0x000d2c61 (float 1.20978e-39)
SMQN 0x000236a2 CWResetGarrisonNode
  PNAM[4] 0x000236a1 (float 2.03268e-40)
  SNAM[4] 0x00038787 (float 3.24125e-40)
  CITC[4] 0x00000000 (float 0)
  DNAM[4] 0x00000000 (float 0)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000008 (float 1.12104e-44)
  NNAM[4] 0x000236a3 (float 2.03271e-40)
  NNAM[4] 0x000548d5 (float 4.85305e-40)
  NNAM[4] 0x000548d6 (float 4.85306e-40)
  NNAM[4] 0x000548d7 (float 4.85307e-40)
  NNAM[4] 0x000548d8 (float 4.85309e-40)
  NNAM[4] 0x000548d9 (float 4.8531e-40)
  NNAM[4] 0x000548da (float 4.85312e-40)
  NNAM[4] 0x000548db (float 4.85313e-40)
SMQN 0x0002111d CWResolutionDefendCapitalSettlementNode
  PNAM[4] 0x000236a1 (float 2.03268e-40)
  SNAM[4] 0x0002b35b (float 2.48012e-40)
  CITC[4] 0x00000001 (float 1.4013e-45)
  CTDA[32] floats ['1.02452e-36', '1', '8.07148e-43', '2.95404e-09', '1.89809e-40', '0', '0', 'nan']
  DNAM[4] 0x00000000 (float 0)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000001 (float 1.4013e-45)
  NNAM[4] 0x0001fa52 (float 1.81634e-40)
SMQN 0x0001e490 WIKillActorMournerNodeSHARES
  PNAM[4] 0x00013010 (float 1.09077e-40)
  SNAM[4] 0x0010d9f0 (float 1.54755e-39)
  CITC[4] 0x00000006 (float 8.40779e-45)
  CTDA[32] floats ['2.01035e-24', '0', '1.03696e-43', '1.918e-40', '0', '0', '0', 'nan']
  CTDA[32] floats ['2.01035e-24', '0', '5.03066e-43', '1.4446e-40', '0', '2.8026e-45', '2.8026e-44', 'nan']
  CTDA[32] floats ['2.01035e-24', '1', '1.03696e-43', '3.09012e-40', '0', '0', '0', 'nan']
  CTDA[32] floats ['2.01035e-24', '1', '7.84727e-43', '1.11773e-40', '0', '9.80909e-45', '0', '1.76928e-41']
  CTDA[32] floats ['2.01035e-24', '0', '9.94922e-44', '1.64294e-40', '0', '9.80909e-45', '0', '1.76928e-41']
  CTDA[32] floats ['2.01035e-24', '0', '9.94922e-44', '1.64295e-40', '0', '9.80909e-45', '0', '1.76928e-41']
  DNAM[4] 0x00020000 (float 1.83671e-40)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000001 (float 1.4013e-45)
  NNAM[4] 0x000289e2 (float 2.33134e-40)
SMQN 0x00019fdb WhiterunDragonsreachScenes
  PNAM[4] 0x00018958 (float 1.41105e-40)
  SNAM[4] 0x00019fd5 (float 1.49172e-40)
  CITC[4] 0x00000001 (float 1.4013e-45)
  CTDA[32] floats ['5.75314e-29', '1', '9.3887e-44', '1.28296e-40', '0', '9.80909e-45', '0', '1.76928e-41']
  DNAM[4] 0x00010001 (float 9.18369e-41)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000009 (float 1.26117e-44)
  NNAM[4] 0x00019fd9 (float 1.49178e-40)
  RNAM[4] 0x44100000 (float 576)
  NNAM[4] 0x000c02f2 (float 1.10308e-39)
  RNAM[4] 0x44100000 (float 576)
  NNAM[4] 0x000c02f0 (float 1.10308e-39)
  RNAM[4] 0x44100000 (float 576)
  NNAM[4] 0x000c02f4 (float 1.10309e-39)
  RNAM[4] 0x44100000 (float 576)
  NNAM[4] 0x000c06e3 (float 1.1045e-39)
  RNAM[4] 0x44100000 (float 576)
  NNAM[4] 0x000c06e5 (float 1.1045e-39)
  RNAM[4] 0x44100000 (float 576)
  NNAM[4] 0x000c1796 (float 1.11049e-39)
  RNAM[4] 0x44100000 (float 576)
  NNAM[4] 0x000c6e33 (float 1.14156e-39)
  RNAM[4] 0x44100000 (float 576)
  NNAM[4] 0x000e3de0 (float 1.30789e-39)
SMQN 0x00019fd5 WhiterunTempleKynarethScenes
  PNAM[4] 0x00018958 (float 1.41105e-40)
  SNAM[4] 0x00018955 (float 1.41101e-40)
  CITC[4] 0x00000002 (float 2.8026e-45)
  CTDA[32] floats ['6.46881e-23', '1', '9.3887e-44', '1.28301e-40', '0', '9.80909e-45', '0', '1.76928e-41']
  CTDA[32] floats ['6.46881e-23', '1', '9.3887e-44', '1.28301e-40', '0', '9.80909e-45', '0', '1.80515e-41']
  DNAM[4] 0x00010001 (float 9.18369e-41)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000001 (float 1.4013e-45)
  NNAM[4] 0x00019fd1 (float 1.49167e-40)
  RNAM[4] 0x44100000 (float 576)
SMQN 0x00018967 WIPlayerRemoveItemAnyNode
  PNAM[4] 0x00018966 (float 1.41125e-40)
  SNAM[4] 0x00000000 (float 0)
  CITC[4] 0x00000000 (float 0)
  DNAM[4] 0x00010001 (float 9.18369e-41)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000005 (float 7.00649e-45)
  NNAM[4] 0x0002c6ab (float 2.5494e-40)
  RNAM[4] 0x44900000 (float 1152)
  NNAM[4] 0x00018965 (float 1.41123e-40)
  RNAM[4] 0x43900000 (float 288)
  NNAM[4] 0x0001be4d (float 1.60103e-40)
  NNAM[4] 0x00034dab (float 3.03369e-40)
  RNAM[4] 0x44900000 (float 1152)
  NNAM[4] 0x00035b67 (float 3.08295e-40)
  RNAM[4] 0x43900000 (float 288)
SMQN 0x00018955 WhiterunBanneredMareScenes
  PNAM[4] 0x00018958 (float 1.41105e-40)
  SNAM[4] 0x0007ec93 (float 7.27715e-40)
  CITC[4] 0x00000001 (float 1.4013e-45)
  CTDA[32] floats ['2.56052e-26', '1', '9.3887e-44', '1.26406e-40', '0', '9.80909e-45', '0', '1.76928e-41']
  DNAM[4] 0x00010001 (float 9.18369e-41)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000006 (float 8.40779e-45)
  NNAM[4] 0x00017f32 (float 1.37465e-40)
  RNAM[4] 0x44100000 (float 576)
  NNAM[4] 0x0007ec81 (float 7.2769e-40)
  NNAM[4] 0x0007ec7f (float 7.27687e-40)
  NNAM[4] 0x00018956 (float 1.41102e-40)
  RNAM[4] 0x44100000 (float 576)
  NNAM[4] 0x0001895b (float 1.41109e-40)
  RNAM[4] 0x44100000 (float 576)
  NNAM[4] 0x0007ec83 (float 7.27693e-40)
  RNAM[4] 0x44100000 (float 576)
SMQN 0x0002d38a WINewVoicePowerNode
  PNAM[4] 0x0002d389 (float 2.59556e-40)
  SNAM[4] 0x00000000 (float 0)
  CITC[4] 0x00000003 (float 4.2039e-45)
  CTDA[32] floats ['8.81303e-25', '0', '5.03066e-43', '1.4446e-40', '0', '2.8026e-45', '2.8026e-44', 'nan']
  CTDA[32] floats ['8.81303e-25', '1', '1.03696e-43', '3.09012e-40', '0', '0', '0', 'nan']
  CTDA[32] floats ['8.81316e-25', '7.9874e-44', '1.03696e-43', '3.09021e-40', '0', '0', '0', 'nan']
  DNAM[4] 0x00010001 (float 9.18369e-41)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000001 (float 1.4013e-45)
  NNAM[4] 0x0002d388 (float 2.59554e-40)
SMQN 0x0002d387 WISkillIncreaseNode
  PNAM[4] 0x0002d386 (float 2.59551e-40)
  SNAM[4] 0x00000000 (float 0)
  CITC[4] 0x00000002 (float 2.8026e-45)
  CTDA[32] floats ['1.67173e-23', '0', '5.03066e-43', '1.4446e-40', '0', '2.8026e-45', '2.8026e-44', 'nan']
  CTDA[32] floats ['1.67173e-23', '1', '1.03696e-43', '3.09012e-40', '0', '0', '0', 'nan']
  DNAM[4] 0x00030001 (float 2.75508e-40)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000001 (float 1.4013e-45)
  NNAM[4] 0x0002d385 (float 2.5955e-40)
SMQN 0x0002b35b CWResolutionAttackCaptialSettlementNode
  PNAM[4] 0x000236a1 (float 2.03268e-40)
  SNAM[4] 0x0007ea5e (float 7.26924e-40)
  CITC[4] 0x00000001 (float 1.4013e-45)
  CTDA[32] floats ['4.98828e-31', '1', '8.07148e-43', '2.95404e-09', '2.47687e-40', '0', '0', 'nan']
  DNAM[4] 0x00000000 (float 0)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000001 (float 1.4013e-45)
  NNAM[4] 0x0002b272 (float 2.47685e-40)
SMQN 0x00028a50 MGRUragNode
  PNAM[4] 0x00028a4c (float 2.33283e-40)
  SNAM[4] 0x00028a4f (float 2.33287e-40)
  CITC[4] 0x00000001 (float 1.4013e-45)
  CTDA[32] floats ['1.48899e-25', '1', '8.07148e-43', '2.95404e-09', '2.33294e-40', '0', '0', 'nan']
  DNAM[4] 0x00010000 (float 9.18355e-41)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000002 (float 2.8026e-45)
  NNAM[4] 0x00028a24 (float 2.33227e-40)
  NNAM[4] 0x000bc096 (float 1.07928e-39)
SMQN 0x00028a4f MGRSergiusNode
  PNAM[4] 0x00028a4c (float 2.33283e-40)
  SNAM[4] 0x00028a4e (float 2.33285e-40)
  CITC[4] 0x00000001 (float 1.4013e-45)
  CTDA[32] floats ['3.10835e-26', '1', '8.07148e-43', '2.95404e-09', '2.33292e-40', '0', '0', 'nan']
  DNAM[4] 0x00010001 (float 9.18369e-41)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000002 (float 2.8026e-45)
  NNAM[4] 0x00028a13 (float 2.33203e-40)
  NNAM[4] 0x00028a19 (float 2.33211e-40)
SMQN 0x00028a4e MGRDrevisNode
  PNAM[4] 0x00028a4c (float 2.33283e-40)
  SNAM[4] 0x00028a4d (float 2.33284e-40)
  CITC[4] 0x00000001 (float 1.4013e-45)
  CTDA[32] floats ['0', '1', '8.07148e-43', '2.95404e-09', '2.33291e-40', '0', '0', 'nan']
  DNAM[4] 0x00000001 (float 1.4013e-45)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000001 (float 1.4013e-45)
  NNAM[4] 0x000266f2 (float 2.20601e-40)
SMQN 0x00028a4d MGRTolfdirNode1
  PNAM[4] 0x00028a4c (float 2.33283e-40)
  SNAM[4] 0x00000000 (float 0)
  CITC[4] 0x00000001 (float 1.4013e-45)
  CTDA[32] floats ['5.53933e-36', '1', '8.07148e-43', '2.95404e-09', '2.3329e-40', '0', '0', 'nan']
  DNAM[4] 0x00000001 (float 1.4013e-45)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000001 (float 1.4013e-45)
  NNAM[4] 0x000266f1 (float 2.20599e-40)
SMQN 0x0002694c WIKillEventsRandomChance
  PNAM[4] 0x0001e491 (float 1.7383e-40)
  SNAM[4] 0x000b0e95 (float 1.01542e-39)
  CITC[4] 0x00000001 (float 1.4013e-45)
  CTDA[32] floats ['4.36626e-16', '9.98711e-40', '1.079e-43', '0', '0', '0', '0', 'nan']
  DNAM[4] 0x00010000 (float 9.18355e-41)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000003 (float 4.2039e-45)
  NNAM[4] 0x0004eef5 (float 4.53064e-40)
  NNAM[4] 0x0002694b (float 2.21443e-40)
  NNAM[4] 0x00071441 (float 6.50114e-40)
SMQN 0x000216a8 CWMissionNode
  PNAM[4] 0x000236a1 (float 2.03268e-40)
  SNAM[4] 0x000cd6d1 (float 1.17909e-39)
  CITC[4] 0x00000002 (float 2.8026e-45)
  CTDA[32] floats ['6.37955e-24', '0', '1.03696e-43', '1.918e-40', '0', '0', '0', 'nan']
  CTDA[32] floats ['6.37955e-24', '1', '8.07148e-43', '2.95404e-09', '1.85744e-40', '0', '0', 'nan']
  DNAM[4] 0x00010003 (float 9.18397e-41)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000004 (float 5.60519e-45)
  NNAM[4] 0x0003bcc4 (float 3.43223e-40)
  NNAM[4] 0x00035a23 (float 3.07841e-40)
  NNAM[4] 0x000504f0 (float 4.60949e-40)
  NNAM[4] 0x00083042 (float 7.51996e-40)
SMQN 0x0001c1f7 CWCampaignNode
  PNAM[4] 0x000236a1 (float 2.03268e-40)
  SNAM[4] 0x0005a831 (float 5.19513e-40)
  CITC[4] 0x00000001 (float 1.4013e-45)
  CTDA[32] floats ['6.00226e-33', '1', '8.07148e-43', '2.95404e-09', '1.61416e-40', '0', '0', 'nan']
  DNAM[4] 0x00000000 (float 0)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000001 (float 1.4013e-45)
  NNAM[4] 0x0001c4a1 (float 1.62373e-40)
SMQN 0x00016fa1 GenericScenesSpecial
  PNAM[4] 0x0005b5a6 (float 5.24341e-40)
  SNAM[4] 0x00000000 (float 0)
  CITC[4] 0x00000000 (float 0)
  DNAM[4] 0x00000001 (float 1.4013e-45)
  XNAM[4] 0x00000000 (float 0)
  QNAM[4] 0x00000003 (float 4.2039e-45)
  NNAM[4] 0x00016fa6 (float 1.31887e-40)
  FNAM[4] 0x00000002 (float 2.8026e-45)
  NNAM[4] 0x0001b112 (float 1.55356e-40)
  NNAM[4] 0x0005b1b9 (float 5.22932e-40)
#### SMEN
SMEN 0x00039d86 
  PNAM[4] 0x0000005b (float 1.27518e-43)
  SNAM[4] 0x00000000 (float 0)
  CITC[4] 0x00000000 (float 0)
  DNAM[4] 0x00000000 (float 0)
  XNAM[4] 0x00000000 (float 0)
  ENAM[4] 0x54465243 (float 3.40713e+12)
SMEN 0x0006b369 
  PNAM[4] 0x0000005b (float 1.27518e-43)
  SNAM[4] 0x00046829 (float 4.04708e-40)
  CITC[4] 0x00000000 (float 0)
  DNAM[4] 0x00000000 (float 0)
  XNAM[4] 0x00000000 (float 0)
  ENAM[4] 0x54525241 (float 3.61329e+12)
SMEN 0x00046829 
  PNAM[4] 0x0000005b (float 1.27518e-43)
  SNAM[4] 0x0003833d (float 3.22586e-40)
  CITC[4] 0x00000000 (float 0)
  DNAM[4] 0x00000000 (float 0)
  XNAM[4] 0x00000000 (float 0)
  ENAM[4] 0x54534143 (float 3.62933e+12)
SMEN 0x0005bd7d 
  PNAM[4] 0x0000005b (float 1.27518e-43)
  SNAM[4] 0x0005b5da (float 5.24414e-40)
  CITC[4] 0x00000000 (float 0)
  DNAM[4] 0x00000000 (float 0)
  XNAM[4] 0x00000000 (float 0)
  ENAM[4] 0x4d544e49 (float 2.22619e+08)
SMEN 0x0005bd7c 
  PNAM[4] 0x0000005b (float 1.27518e-43)
  SNAM[4] 0x0005bd7b (float 5.2715e-40)
  CITC[4] 0x00000000 (float 0)
  DNAM[4] 0x00000000 (float 0)
  XNAM[4] 0x00000000 (float 0)
  ENAM[4] 0x54414c46 (float 3.32083e+12)
SMEN 0x0005bd7b 
  PNAM[4] 0x0000005b (float 1.27518e-43)
  SNAM[4] 0x0005bd7a (float 5.27149e-40)
  CITC[4] 0x00000000 (float 0)
  DNAM[4] 0x00000000 (float 0)
  XNAM[4] 0x00000000 (float 0)
  ENAM[4] 0x4b434f4c (float 1.27998e+07)
SMEN 0x0005bd7a 
  PNAM[4] 0x0000005b (float 1.27518e-43)
  SNAM[4] 0x00000000 (float 0)
  CITC[4] 0x00000000 (float 0)
  DNAM[4] 0x00000000 (float 0)
  XNAM[4] 0x00000000 (float 0)
  ENAM[4] 0x4c49414a (float 5.27578e+07)
SMEN 0x0005bd79 
  PNAM[4] 0x0000005b (float 1.27518e-43)
  SNAM[4] 0x0005bd78 (float 5.27146e-40)
  CITC[4] 0x00000000 (float 0)
  DNAM[4] 0x00000000 (float 0)
  XNAM[4] 0x00000000 (float 0)
  ENAM[4] 0x4c56454c (float 5.61698e+07)
SMEN 0x0005bd78 
  PNAM[4] 0x0000005b (float 1.27518e-43)
  SNAM[4] 0x0005bd77 (float 5.27145e-40)
  CITC[4] 0x00000000 (float 0)
  DNAM[4] 0x00000000 (float 0)
  XNAM[4] 0x00000000 (float 0)
  ENAM[4] 0x414a5345 (float 12.6453)
SMEN 0x0005bd77 
  PNAM[4] 0x0000005b (float 1.27518e-43)
  SNAM[4] 0x0005bd7d (float 5.27153e-40)
  CITC[4] 0x00000000 (float 0)
  DNAM[4] 0x00000000 (float 0)
  XNAM[4] 0x00000000 (float 0)
  ENAM[4] 0x42495242 (float 50.3303)
SMEN 0x0005b5da 
  PNAM[4] 0x0000005b (float 1.27518e-43)
  SNAM[4] 0x0003833d (float 3.22586e-40)
  CITC[4] 0x00000000 (float 0)
  DNAM[4] 0x00000000 (float 0)
  XNAM[4] 0x00000000 (float 0)
  ENAM[4] 0x52434441 (float 2.09666e+11)
SMEN 0x00025e22 
  PNAM[4] 0x0000005b (float 1.27518e-43)
  SNAM[4] 0x0003833d (float 3.22586e-40)
  CITC[4] 0x00000000 (float 0)
  DNAM[4] 0x00000000 (float 0)
  XNAM[4] 0x00000000 (float 0)
  ENAM[4] 0x52524843 (float 2.25789e+11)
SMEN 0x0003833d 
  PNAM[4] 0x0000005b (float 1.27518e-43)
  SNAM[4] 0x0002fd4a (float 2.74534e-40)
  CITC[4] 0x00000000 (float 0)
  DNAM[4] 0x00000000 (float 0)
  XNAM[4] 0x00000000 (float 0)
  ENAM[4] 0x44414544 (float 773.082)
SMEN 0x0002fd4a 
  PNAM[4] 0x0000005b (float 1.27518e-43)
  SNAM[4] 0x0002d389 (float 2.59556e-40)
  CITC[4] 0x00000000 (float 0)
  DNAM[4] 0x00000000 (float 0)
  XNAM[4] 0x00000000 (float 0)
  ENAM[4] 0x4c454841 (float 5.17164e+07)
SMEN 0x0002d389 
  PNAM[4] 0x0000005b (float 1.27518e-43)
  SNAM[4] 0x0002d386 (float 2.59551e-40)
  CITC[4] 0x00000000 (float 0)
  DNAM[4] 0x00000000 (float 0)
  XNAM[4] 0x00000000 (float 0)
  ENAM[4] 0x4550564e (float 3333.39)
SMEN 0x0002d386 
  PNAM[4] 0x0000005b (float 1.27518e-43)
  SNAM[4] 0x0002c6ac (float 2.54941e-40)
  CITC[4] 0x00000000 (float 0)
  DNAM[4] 0x00000000 (float 0)
  XNAM[4] 0x00000000 (float 0)
  ENAM[4] 0x4c494b53 (float 5.27681e+07)
SMEN 0x0002c6ac 
  PNAM[4] 0x0000005b (float 1.27518e-43)
  SNAM[4] 0x0002c494 (float 2.5419e-40)
  CITC[4] 0x00000000 (float 0)
  DNAM[4] 0x00000000 (float 0)
  XNAM[4] 0x00000000 (float 0)
  ENAM[4] 0x504d4552 (float 1.37755e+10)
SMEN 0x0002c494 AssaultActorEvent
  PNAM[4] 0x0000005b (float 1.27518e-43)
  SNAM[4] 0x0002c439 (float 2.54062e-40)
  CITC[4] 0x00000000 (float 0)
  DNAM[4] 0x00000000 (float 0)
  XNAM[4] 0x00000000 (float 0)
  ENAM[4] 0x55535341 (float 1.45222e+13)
SMEN 0x0002c439 
  PNAM[4] 0x0000005b (float 1.27518e-43)
  SNAM[4] 0x0001379a (float 1.11782e-40)
  CITC[4] 0x00000000 (float 0)
  DNAM[4] 0x00000000 (float 0)
  XNAM[4] 0x00000000 (float 0)
  ENAM[4] 0x4c504941 (float 5.4601e+07)
SMEN 0x0001a838 
  PNAM[4] 0x0000005b (float 1.27518e-43)
  SNAM[4] 0x00013010 (float 1.09077e-40)
  CITC[4] 0x00000000 (float 0)
  DNAM[4] 0x00000000 (float 0)
  XNAM[4] 0x00000000 (float 0)
  ENAM[4] 0x56414641 (float 5.31269e+13)
SMEN 0x00015fce 
  PNAM[4] 0x0000005b (float 1.27518e-43)
  SNAM[4] 0x00000000 (float 0)
  CITC[4] 0x00000000 (float 0)
  DNAM[4] 0x00000000 (float 0)
  XNAM[4] 0x00000000 (float 0)
  ENAM[4] 0x41494441 (float 12.5792)
SMEN 0x0001379a 
  PNAM[4] 0x0000005b (float 1.27518e-43)
  SNAM[4] 0x0001320e (float 1.09792e-40)
  CITC[4] 0x00000000 (float 0)
  DNAM[4] 0x00000000 (float 0)
  XNAM[4] 0x00000000 (float 0)
  ENAM[4] 0x54504353 (float 3.57793e+12)
SMEN 0x0001320e 
  PNAM[4] 0x0000005b (float 1.27518e-43)
  SNAM[4] 0x0001a838 (float 1.52181e-40)
  CITC[4] 0x00000000 (float 0)
  DNAM[4] 0x00000000 (float 0)
  XNAM[4] 0x00000000 (float 0)
  ENAM[4] 0x434f4c43 (float 207.298)
SMEN 0x00013010 
  PNAM[4] 0x0000005b (float 1.27518e-43)
  SNAM[4] 0x00015fce (float 1.26204e-40)
  CITC[4] 0x00000000 (float 0)
  DNAM[4] 0x00000000 (float 0)
  XNAM[4] 0x00000000 (float 0)
  ENAM[4] 0x4c4c494b (float 5.35524e+07)

```
