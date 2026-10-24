# RE read: the leveled roll and the outfit roll (train-41, ADR-046 decision 1)

Static read for docs/verbs/npc-fate.md's roll (RE-1, part of RE-2, RE-4's first line, RE-6's
seed), 2026-10-23, the re-analyst. Sources in rule 1's order: CommonLibSSE-NG headers at the pin
(paths relative to CommonLibSSE-NG/include/RE/), the Address Library for 1.6.1170 (every id is the
AE column, by `just addr <id>` or lab/addr.py's table read in reverse; REA addresses are image base
0x140000000 plus the offset), and REA on sky-re (Ghidra 12.1.4 over
SkyrimSE-1.6.1170.0.exe.unpacked.exe, seeded with CommonLib's names; every answer carried confidence
"observed", authority "shipped-artifact"). Pseudocode is a hypothesis: what it implies is tagged
HYPOTHESIS; CONFIRMED-STATIC marks what bytes or a vtable slot settle without a run. Nothing is from
memory. Builds on npc-fate.md's Engine surface; docs/TE-MAP.md has no leveled-actor row (TE never
syncs the roll; te-npcs.md:268 records the symptom as its #882/#892/#899).

## Summary

- A placed NPC_ whose TPLT (TESActorBaseData::baseTemplateForm, T/TESActorBaseData.h:128) is an
  LVLN is rolled once, in TESObjectREFR::InitItemImpl (the reference's load from the plugin, before
  any 3D), by a resolver that rolls the list, CLONES a new TESNPC from the placed base, copies the
  pick into it (CopyFromTemplateForms), writes ExtraLeveledCreature{originalBase = the placed base,
  templateBase = the pick} and swaps the base to the clone with SetObjectReference. GetBaseObject,
  GetActorBase and the Papyrus GetLeveledActorBase all answer the clone.
- The outfit is rolled later and separately: never in InitInventoryIfRequired, only in one equipper
  (id 418622) at the actor's first biped/3D init or middle-high process entry and at every
  ResetInventory; its picks enter the inventory tagged ExtraOutfitItem{outfit id}, which
  HasOutfitItems, AddWornOutfit and RemoveOutfitItems all key on; tagged entries suppress the roll.
- Both rolls use the engine's RNG inside CalculateCurrentFormList, and the LVLN roll's level carries
  a per-game rotating offset (GetCalcLevel's adjust): two games, two species, no shared seed.
- Least surgery: detour the per-reference roll wrapper (14752) to answer the server's LVLN pick and
  the outfit roll (16072) to add the server's worn list tagged as the outfit's items; a late fate
  goes through the engine's own re-roll (37323) and the same detours. No base-swap code of our own.

## 1. The leveled base (RE-1)

Where (CONFIRMED-STATIC by vtable slot): InitItemImpl is vfunc 0x13 (T/TESObjectREFR.h:223); slot
0x13 of VTABLE_TESObjectREFR[0] (190259) is 0x1402d8730, id 19507; Character's (207886) is 37791.

InitItemImpl for an actor (formType 0x3E, F/FormTypes.h), HYPOTHESIS from 19507's pseudocode: the
NaN guard on position and angle; with the record's kStartsDead bit (formFlags 1 << 9, A/Actor.h:252)
on a non-player, Actor::SetLifeState(2 = kDead, A/ActorState.h:7-17; id 37612) and a ProcessLists
call (41291) with 3 (RE-4's dead-at-load shape: no KillImpl, no ragdoll); then the roll gate
`if (14372(base->actorData) && !20230(ref) && !35594(BGSSaveLoadGame, ref->formID)) 14374(base->actorData, ref, 1)`,
and InitInventoryIfRequired(ref, false) (16038, Offsets.h:544) at the end.
14372 (0x1d74a0): baseTemplateForm exists with formType 0x2C LeveledNPC. 20230 (0x2fb0b0): the
base is an NPC_ and extraList (+0x70, T/TESObjectREFR.h:498) has kLeveledCreature (0x2D,
E/ExtraDataTypes.h:219), "already rolled". 35594 (0x605770): HYPOTHESIS "the save holds a change
form for this reference"; with it the roll is skipped (persistence, below).

The resolver, 14374 (0x1d74e0), `(TESActorBaseData* a_data, TESObjectREFR* a_ref, bool a_skipInit)`,
HYPOTHESIS from pseudocode, in order:
1. Guards (a_ref, the TPLT is an LVLN, !20230), then the roll: 14752(lvln->list, a_ref, &out); the
   TESLeveledList sits at TESLevCharacter+0x30 (T/TESLevCharacter.h:12). No pick, or a pick that is
   not an NPC_: a_ref->SetDelete(true) (TESForm vfunc 0x23, T/TESForm.h:158), the placement deleted.
2. A pick: loaded 3D (vfunc 0x70 non-null) is dropped, Set3D(nullptr, true) (vfunc 0x6C,
   T/TESObjectREFR.h:304), under the reference's lock.
3. newBase = 13765(oldBase->formType) (HYPOTHESIS: the form factory's create-by-type, a fresh runtime
   NPC_); newBase->Copy(oldBase) (TESForm vfunc 0x2F, T/TESForm.h:170);
   newBase->actorData.CopyFromTemplateForms(pick) (TESActorBaseData vfunc 04,
   T/TESActorBaseData.h:93; TESNPC's override T/TESNPC.h:229).
4. 20231(a_ref, oldBase, pick): AddChange(0x40000) = Actor::ChangeFlags::kLeveledActor (1 << 18,
   A/Actor.h:238), then 11812(&extraList, oldBase, pick): finds or constructs ExtraLeveledCreature
   (ctor 12415, the only writer of VTABLE_ExtraLeveledCreature 186989) and writes +0x10 =
   originalBase, +0x18 = templateBase (E/ExtraLeveledCreature.h:23-24; the stores CONFIRMED-STATIC).
5. a_ref->SetObjectReference(newBase) (vfunc 0x84, T/TESObjectREFR.h:332). Character's slot 0x84 is
   37466 (0x673b40) = the base implementation 19785 (0x2ea670: data.objectReference at +0x40 and the
   destructible flag) plus actor->race (ACTOR_RUNTIME_DATA at 0xE8 on 1.6.1170, A/Actor.h:712, race
   at its 0x1F0 column, so +0x1F8) = newBase->race (TESNPC+0x158, T/TESNPC.h:33 with
   T/TESRaceForm.h:22). Nothing else: no 3D, inventory, skin or voice caches (RE-2, HYPOTHESIS).
6. If !a_skipInit: 19705, 19671 on the ref, 37592, 37917, 37918, 37722 on the actor, then
   InitInventoryIfRequired(a_ref, false); always Actor::SwitchRace(actor, newBase->race, false)
   (Offset::Actor::SwitchRace 37925, Offsets.h:17) and 38478(actor, 1).

Callers of 14374: InitItemImpl 19507 (a_skipInit = true; it initializes the inventory after);
CreateReferenceAtLocation 13723 (PlaceAtMe); the re-roll 37323; 37292, 22532, 24721, 56204 (unread).

The re-roll, 37323 (0x665fc0), `(Actor* a_actor, int a_arg)`, HYPOTHESIS: reads
ExtraLeveledCreature.originalBase (11810); if it differs from the current base: 12358(actor,0,0),
SetObjectReference(originalBase), 20231(ref, 0, 0) (RemoveChange(kLeveledActor), extra removed),
36460(0, clone) (HYPOTHESIS: the clone released), then 14374(original->actorData, ref, false) if the
TPLT is still an LVLN; a_arg == -1 skips a level check at 37730. Callers 19231, 22038, 24011, 25083,
56134: the cell reset and console paths, RE-3's leads, unread here.

The roll wrapper, 14752 (0x1e3e70), `(TESLeveledList* a_list, TESObjectREFR* a_ref,
BSScrapArray<CALCED_OBJECT>* a_out)`, HYPOTHESIS: mult = 1.0 and arg5 = 0 unless the reference
carries ExtraLevCreaModifier (kLevCreaModifier 0x1E, E/ExtraDataTypes.h:204;
E/ExtraLevCreaModifier.h:8-15), read by 11804 into a float (12581) and a flag (12582; the
difficulty multipliers, GMSTs by shape, unread); level = floor(GetCalcLevel(a_ref, true) * mult), 0
becomes 1; CalculateCurrentFormList(a_list, level, 1, a_out, arg5, a_usePlayerLevel = false)
(14751, src/RE/T/TESLeveledList.cpp:10).

GetCalcLevel, 20205 (0x2fa590), HYPOTHESIS: zone = 20202(ref) (the encounter zone through the extra
list); none, or the default zone object: Actor::GetLevel(player) (Offset::Actor::GetLevel 37334);
else zone->gameData.zoneLevel (B/BGSEncounterZone.h:36 within :79's gameData at 0x38, so +0x44), and
when it is 0, 18198(zone) computes it (RE-6's lock: written at first use, HYPOTHESIS). With
a_adjustLevel a process-global counter steps by one per call and wraps from one setting-shaped
global to minus another (iLevCharLevelDifferenceMax's family by shape, unread) and the level takes
it: a deterministic per-game sequence, different on every seat. Floored at 1.

CalculateCurrentFormList, 14751, HYPOTHESIS: level 0 reads as 1; with
kCalculateFromAllLevelsLTOrEqPCLevel (T/TESLeveledList.h:46) and arg5 == 0, or arg5 == 1, the lookup
level is capped at the highest entry level; GetMultCalc false (vfunc 05, :61): kUseAll (:48) rolls
the engine's RNG (modulo 100) against GetChanceNone (vfunc 04, :60) and takes every entry, otherwise
one pick through 14750 (the level filter and per-pick chance, unread); GetMultCalc true: a_count
single picks. Nested LVLN, LVLI and LVSP entries (0x2C, 0x35, 0x52) recurse with the uncapped level;
14755 appends a CALCED_OBJECT (:27-37); counts are multiplied by a_count. The chance none and the
pick are engine-local randomness: H12's chance none and the pick must both come from the server.

Persistence (HYPOTHESIS): the clone is a runtime form marked by kLeveledActor on the reference's
change form (step 6); InitItemImpl skips the roll when the save has a change form for the reference
(35594); the ExtraLeveledCreature constructor's other caller is 12095 (0x170380, 13 KB, also a
caller of InitInventoryIfRequired; not LoadGame, whose slot 0x0F holds 0x1402da720), the
change-form reader by shape. A reload keeps the roll; a cell reset re-rolls through 37323.
Falsified by a Frida 14374 hit on a save-restored reference.

Papyrus (CONFIRMED-STATIC by registration decode and vtable id 217505, Offsets_VTABLE.h:4378):
Actor.GetLeveledActorBase's native is 54691 (0x9e8980, no Ghidra function; the bytes read `mov
rcx,[r8+0x40]; xor eax,eax; test rcx,rcx; jz; cmp byte [rcx+0x1a],0x2b; cmove rax,rcx; ret`):
data.objectReference when it is an NPC_, the clone. Actor.GetActorBase was not located (no defined
string); RE this only if the client needs the placed base from Papyrus.

## 2. The outfit roll

InitInventoryIfRequired, 16038 (0x225770), HYPOTHESIS from pseudocode: initializes when the base
container holds a LeveledItem (0x35) entry or, for an actor, when parentCell->cellState (+0x44,
T/TESObjectCELL.h:259) is 2, 3, 4, 6 or 7 (7 = kAttached, :139); creates InventoryChanges when the
extra list has none (owner at +0x08), then InitLeveledItems (16129), InitFromContainerExtra (16130)
unless a_ignoreContainerExtraData, and 16068 (CommonLib binds that id to both
GenerateLeveledListChanges and InitScripts, src/RE/I/InventoryChanges.cpp:36 and :157; one is wrong).
No outfit in it. CONFIRMED-STATIC: InitOutfitItems (16072) has two callers, 418622 and 40746.

The outfit equipper, 418622 (0x3bd380), `(TESNPC* a_npc, Actor* a_actor, bool, bool a_equipBest,
bool, bool a_noEventScope)`, HYPOTHESIS: MakeInventoryChanges; the current weapon unequipped (vfunc
0x82 RemoveWeapon, T/TESObjectREFR.h:326), Actor::DispelWornItemEnchantments (34620), 38785; the
process's equip state cleared (39813, 39812, 39811); then with a_npc->defaultOutfit (+0x218,
T/TESNPC.h:281):
`if (!HasOutfitItems(actor, outfit) && (!IsDead(0) || !BGSSaveLoadGame::GetChange(ref, 0x20))) InitOutfitItems(changes, outfit, TESActorBaseData::GetLevel(npc))`
(0x20 = kInventory, T/TESObjectREFR.h:145; GetLevel 14384 is the NPC's own level with the PC level
mult: the roll's level input), then AddWornOutfit(actor, outfit, false) unless 37897(actor) holds
and an outfit item's biped slots (14121, 418613) clash with a worn item (419334 per slot); next the
kPlayerTeammate re-equip loop (BOOL_BITS 1 << 26, A/Actor.h; 16089, 19697,
ActorEquipManager::EquipObject), the farSkin (+0x210 ANAM, T/TESNPC.h:280) through AddWornItem
(vfunc 0x57), and with a_equipBest and the actor alive the best-weapon scoring (16088) and equips.

InitOutfitItems, 16072, calls 16155 (0x23a2b0) over outfit->outfitItems (B/BGSOutfit.h:43): a
LeveledItem entry: CalculateCurrentFormList(lvli->list, npcLevel, 1, out, 0, a_usePlayerLevel =
true), then 16128 adds each calced object inside a fresh ExtraDataList tagged by 11647 (allocates
0x18, vtable VTABLE_ExtraOutfitItem 186711, id at +0x10, E/ExtraOutfitItem.h:20) through 16053, and
sets the reference's change flag 1 << 27 = kLeveledInventory (T/TESObjectREFR.h:156) while a game
runs; a plain entry: added with the same tag unless an entry already carries kOutfitItem (0x8E,
E/ExtraDataTypes.h:316) with this outfit's id (16133, 15988, 15989). CONFIRMED-STATIC for the tag's
layout and vtable; HYPOTHESIS for the flow.

The three CommonLib-named outfit functions key on that tag (HYPOTHESIS): AddWornOutfit 19692 equips
every entry whose extra list has kOutfitItem with id == outfit->formID
(ActorEquipManager::EquipObject(actor, item, extra, 1, 0, a_forceUpdate, 0, 0, 0)), then with
a_forceUpdate queues the actor's update and, with the cell in state 4 and a process, 39907(process,
1); HasOutfitItems 19691 is "any tagged entry" (any tag when the outfit is null); RemoveOutfitItems
19690 removes each tagged entry through RemoveItem (vfunc 0x56, T/TESObjectREFR.h:282).

When 418622 runs (HYPOTHESIS, static callers): 39800 (0x70d7b0, `(AIProcess*, Actor*, bool)`): with
process->middleHigh null (A/AIProcess.h:196) it goes through 24725, the biped's worn init
(VTABLE___InitWornVisitor over the BipedAnim), which calls 418622 when 24384(npc, actor) wants the
default worn; with a middle-high process it calls 418622 directly and sets a bit in the high data.
39800's callers 22001, 39108, 39359, 39637, 39638, 40072, 40073, 40078 sit in the AIProcess
level-transition region. Actor::ResetInventory (vfunc 0x8A, Character's slot = 37322) calls
TESObjectREFR::ResetInventory (19802), AddDeathItems when dead (37198: TE-MAP:72's id and 0x660170
are one function) and then 418622(npc, actor, 1, flag, 0, 1). Callers 22405, 35498, 37651, 39653,
39654, 39671 are unread. So the outfit's moment is the first biped/3D init or middle-high entry,
after InitItemImpl and the leveled resolution; a_level is the NPC's GetLevel, a_usePlayerLevel true,
the chance none the engine's RNG inside 14751.

The Papyrus Actor.SetOutfit native is 54755 (0x9ea540; its NativeFunction2 vtable 217563 resolves
to the decoded address, CONFIRMED-STATIC): refuses None ("Cannot set sleep or default outfit to
None"), returns if unchanged, RemoveOutfitItems, 24694 or 24695 on the TESNPC (CommonLib's
TESNPC::SetDefaultOutfit, src/RE/T/TESNPC.cpp:230: the field plus AddChange(kDefaultOutfit,
T/TESNPC.h:57)), InitInventoryIfRequired(actor, false), then AddWornOutfit(actor, outfit, true)
unless formFlags bit 11 (kInitiallyDisabled, T/TESObjectREFR.h:182); CommonLib's
Actor::SetDefaultOutfit (src/RE/A/Actor.cpp:1016-1029) is the same sequence. It never calls
InitOutfitItems: a new outfit's items reach the inventory only through the next 418622
(HYPOTHESIS), so SetOutfit on a server-built BGSOutfit would still roll the engine's LVLI picks.

## 3. Imposition candidates

(a) Pin before the roll, the least surgery and the one that covers the base: a native detour on 14752
keyed by a_ref->formID against a fate table the client fills from ActorFate. For a fated reference
the detour writes the server's pick into a_out (one CALCED_OBJECT: the TESNPC the server named, count
1) and returns; the engine clones it, tags the extra and swaps the base as for its own pick (section
1, steps 3 to 6). A fate of "none" leaves a_out empty and the engine deletes the placement (step 1),
consistent with the server holding no actor there. The moment is InitItemImpl, for a cell's temporary
references the cell's load, before the 3D and before any Skyrim Platform event; the fate must be on
the client for the 5x5 ring ahead (npc-fate.md Impose A's H1). Persistent references roll at game
start, before the connection (HYPOTHESIS), so (a) alone cannot cover them.

(b) Swap after the roll: do not write one. The engine's re-roll 37323(actor, -1) undoes the clone,
restores the placed base, drops the 3D and re-resolves through 14374, hence through the 14752
detour, then re-initializes the inventory and switches the race (HYPOTHESIS): one pop, the engine's
own. SetObjectReference alone changes the base pointer and the race cache (section 1, step 5), so a
hand-rolled swap would owe the 3D reload, the inventory, the race switch and the extra's bookkeeping
that 14374 already does. Falsified if 37323 crashes or leaves a live actor without 3D in the lab.

(c) The outfit: add the server's worn items as entries tagged ExtraOutfitItem{defaultOutfit->formID}
before the first 418622 for that actor: HasOutfitItems is then true and the engine never calls
InitOutfitItems for it, AddWornOutfit equips exactly the server's items, SetOutfit and
RemoveOutfitItems keep working. No SP event sits there either, so this is a detour too: on 16072
(owner = changes->owner at +0x08) or at 418622's entry, for a fated actor, add the server's list
tagged (the engine's tag setter 11647 `(ExtraDataList*, BGSOutfit*)` by id, or an ExtraOutfitItem on
VTABLE_ExtraOutfitItem 186711, into TESObjectREFR::AddObjectToContainer, vfunc 0x5A,
T/TESObjectREFR.h:286) and skip the roll. For a late fate the same native, called from TS, removes
the tagged entries (19690), adds the server's list tagged and calls AddWornOutfit(actor, outfit,
true): one pop. Clearing TESNPC::defaultOutfit is wrong for shared bases and unnecessary for the
clone. Today's applyEquipment (removeAllItems, then the list untagged) leaves HasOutfitItems false,
so the engine's next 418622 (a process transition, a ResetInventory) dresses its picks over the
server's (HYPOTHESIS: the flap the Frida plan measures).

What Skyrim Platform exposes (skyrim-platform/src/platform_se/codegen/convert-files/skyrimPlatform.ts
under lab/.cache/wt/puppet): ObjectReference.getBaseObject :1901, removeAllItems :1978,
resetInventory :1983, addItem :1874, disable/enable :1885-1888, placeAtMe :1967;
Actor.getLeveledActorBase :2084, setOutfit :2193, equipItem :2040, unequipAll :2216;
ActorBase.getOutfit :2246, getTemplate :2252, setOutfit :2269; LeveledActor :2942-2948; Outfit
:3114; TESModPlatform.createNpc :3374, evaluateLeveledNpc :3375 (SP's own CloneNpc,
PapyrusTESModPlatform.cpp:320-372, not the engine's resolver), setNpcRace :3387. Nothing sets a
base, adds a tagged entry or reaches 14752, 37323 or 418622: the three natives are new, in the
puppet detours' shape (npc-fate.md cites FridaHooks.cpp:1097).

## 4. Today's client path

skymp5-client/src/sync/equipment.ts:181-202 applyEquipment: removeAllItems(null, false, true) twice
around unequipAll, setInventory with the worn list, the four spell slots, the ADR-046 decision-2
figure strip (isFigureBase :148-157, keepOnlyServerSpells :165-179). Call sites: view/formView.ts:740
inside `if (model.equipment && !alreadyHosted)` (:711, "Rule A again: a hosted actor's equipment is
its engine's"; alreadyHosted = HostService.isMine, :550-551) and services/services/remoteServer.ts:455
for the player's own. So the host's own hosted actors receive no equipment apply today; ADR-046
decision 1 is the one state write that guard must admit for NPC models (FormView.isNpcModel :558),
decision 2's figure sweep (:715-724) staying figure-only. The server's roll: MpObjectReference.cpp
:1946-1960 GetOutfitObjects through the template chain, :2000-2010 each LVLI with
LeveledListUtils::EvaluateListRecurse at kPlayerCharacterLevel = 1 (:44), :2044-2057 the worn list
into the equipment record; the engine rolls the same LVLIs at GetLevel(npc) with a_usePlayerLevel
true (section 2): different distributions, a server-side concern under ADR-046, not a client bug.

## 5. Frida plan

lab/frida/npc-roll.js in npc-puppet.js's idiom: OFFSETS keyed by the exe's file version from
GetFileVersionInfoW (console-trace.js:15-27), LAB_PARAMS, emit through send plus console.log, no
top-level name that shadows a Frida global. Hooks, each by `just addr` on the day it is written:
14374 (enter: ref id at ref+0x14, T/TESForm.h:354, the placed base id at a_data - 0x30 then +0x14,
the first return address as a module offset; leave: data.objectReference at +0x40 and its id);
14752 (enter: list id at a_list - 0x30 then +0x14, ref id; leave: a_out's count and first form id);
14751 (a_level in dx, a_count in r8w, arg5, a_usePlayerLevel, the caller's offset); 20205
(a_adjustLevel and the return: the rotating offset); 418622 (npc, actor, flags, caller's offset);
16072 (changes->owner at +0x08, outfit id, a_npcLevel in r8w); 19692, 19690 (actor, outfit, force);
37323, 37322 (actor id, the caller's offset).

Scenario: x-npc-fate-roll's solo leg (npc-fate.md Tests :135 and its Dynamic plan): frida on c1,
teleport into the forest cell with the leveled placements (their placed NPC_ 0x1e7a0, its TPLT the LVLN 0x42297: the lab read x-npc-fate-roll 232048 corrected the plan's direction), wait 10, refs-near
with bases, then the engine's own reset baseline (save, out, GameDaysPassed past the GMST hours, back
in). Expected: per fated placement one 14374 at the cell's load with the caller inside 19507, before
any 418622 for that actor; 14752 reporting one pick and 14374's leave a fresh runtime id (0xFF
prefix); 418622 once per actor at its 3D or middle-high entry (caller inside 24725 or 39800) with
InitOutfitItems at the clone's level and none again while tagged entries exist; after an
applyEquipment on a puppet, the next 418622 shows InitOutfitItems again (the flap). Falsifiers: a
14374 at 3D load with no InitItemImpl frame (the pin moves); 14752 returning more than one object
(the detour's out shape); an InitOutfitItems from a caller outside 418622 and 40746 (the tag
suppression has a hole); 418622 never running for an actor that still gets dressed (another path).

## 6. Address table (1.6.1170 AE ids; name status)

| id | offset | name | status |
| --- | --- | --- | --- |
| 19507, 37791 | 0x2d8730, 0x692560 | TESObjectREFR:: and Character::InitItemImpl (vfunc 0x13) | CONFIRMED-STATIC, vtable |
| 14374, 14372 | 0x1d74e0, 0x1d74a0 | the leveled resolver; TPLT-is-LVLN predicate | HYPOTHESIS |
| 14752, 11804 | 0x1e3e70, 0x163dc0 | the per-reference roll wrapper; LevCreaModifier read | HYPOTHESIS |
| 14751, 20205, 14384 | 0x1e3a30, 0x2fa590, 0x1d7cf0 | CalculateCurrentFormList, GetCalcLevel, TESActorBaseData::GetLevel | CommonLib names |
| 20230, 20231, 11812 | 0x2fb0b0, 0x2fb0e0, 0x164140 | has-, set-ExtraLeveledCreature on the ref; the extra-list writer | HYPOTHESIS; stores CONFIRMED-STATIC |
| 12415, 13765 | 0x17b9f0, 0x1bcb40 | ExtraLeveledCreature ctor; create a form by type | ctor CONFIRMED-STATIC; HYPOTHESIS |
| 19785, 37466 | 0x2ea670, 0x673b40 | SetObjectReference, base and Actor's override (vfunc 0x84) | CONFIRMED-STATIC, vtable |
| 20017, 20068 | 0x2f3c50, 0x2f57d0 | GetTemplateActorBase returns 0, SetTemplateActorBase no-op, both vtables | CONFIRMED-STATIC, bytes |
| 37323, 13723 | 0x665fc0, 0x1b6c10 | the re-roll; TESDataHandler::CreateReferenceAtLocation | HYPOTHESIS; CommonLib name |
| 54691, 54755 | 0x9e8980, 0x9ea540 | Papyrus Actor.GetLeveledActorBase, Actor.SetOutfit | CONFIRMED-STATIC, bytes and vtable ids |
| 16038, 418622 | 0x225770, 0x3bd380 | InitInventoryIfRequired; the outfit equipper | CommonLib name; HYPOTHESIS |
| 16072, 16155, 16128, 11647 | 0x22e730, 0x23a2b0, 0x236890, 0x15d210 | InitOutfitItems, its item loop, add calced tagged, set ExtraOutfitItem | name; HYPOTHESIS; tag layout CONFIRMED-STATIC |
| 19690, 19691, 19692 | 0x2e1930, 0x2e1a50, 0x2e1b00 | Actor::RemoveOutfitItems, HasOutfitItems, AddWornOutfit | CommonLib names |
| 39800, 24725 | 0x70d7b0, 0x3bba20 | process-side outfit step; biped worn init | HYPOTHESIS |
| 37322, 19802, 37198 | 0x665ec0, 0x2ecda0, 0x660170 | Actor:: and TESObjectREFR::ResetInventory (vfunc 0x8A); AddDeathItems (TE-MAP:72) | CONFIRMED-STATIC vtable; lead by address |

## 7. Recommendation for train-41

Build the imposition as two detours in Skyrim Platform's native layer plus one TS rule, and no
base-swap code of our own: a detour on 14752 that answers the server's LVLN pick (or none) for a
fated reference, so the engine clones, tags and swaps the base itself at InitItemImpl, and a detour
on 16072 (or 418622's entry) that adds the server's worn list as ExtraOutfitItem-tagged entries and
skips the engine's outfit roll; a fate that arrives after the roll goes through the engine's own
re-roll 37323 and the same two detours, one pop accepted. The TS side lifts formView.ts:711's hosted
guard for NPC equipment only (ADR-046's one exception) and feeds both fate tables from ActorFate and
the equipment record. Before it ships the lab must confirm on a seat: 14374 once per placement inside
InitItemImpl at the cell's load and never at 3D load (else the pin moves); 14752's out array holding
exactly one NPC_ (the detour's shape); 37323 on a live, loaded actor re-rolling without a crash or a
missing body (else B falls back to disable, native, enable); tagged entries suppressing
InitOutfitItems across process transitions and a ResetInventory (else the outfit detour must also
guard 418622); a reloaded seat keeping the imposed base without a new 14374 (persistence). Section
5's plan is those five observations.

## 8. Erratum: the outfit roll's real site (2026-10-23 lab read)

x-npc-fate-roll 232048 and 234133 (lab/frida/npc-roll.js): InitOutfitItems (16072) and AddWornOutfit
(19692) at zero through the cell's load while 418622 ran 65 times and outfit-shaped rolls (14751, arg5
0, a_usePlayerLevel 1, armor picks) returned to SkyrimSE.exe+0x236d7c, +0x236bd9 and +0x23a37a; 16072
fired twice in 234133's leg 2, 15 to 20 s after ready, on other actors. Re-read with REA (same seeds;
every answer confidence "observed", authority "shipped-artifact"); ids by `just addr`. Section 2's
"never in InitInventoryIfRequired" and "tagged entries suppress the roll" are wrong for 1.6.1170; the
script's "16072+0x864c" and "+0x84a9" were nearest-start labels, not containment.

### 8.1 The containing functions (CONFIRMED-STATIC, REA body ranges and complete call coverage)

0x236d7c and 0x236bd9 lie in InventoryChanges::InitLeveledItems, 16129 (0x236b60, body
0x236b60..0x236e33; CommonLib's name, src/RE/I/InventoryChanges.cpp:143): +0x79 is the join after
GetCalcLevel(owner, true) for a container owner or TESActorBaseData::GetLevel(npc->actorData) for an
actor (`CMP byte [RCX+0x1a],0x3e; MOV RAX,[RCX+0x40]; LEA RCX,[RAX+0x30]; CALL 14384`), so the 20205
hits there were the cell's chests; +0x21c is the container loop's `CalculateCurrentFormList(lvli+0x30,
level, |count|, &out, 0, 1)` over the base container's own LVLI entries, whose picks 16128 tags
ExtraLeveledItem (r9 = 0): inventory, not outfit. 0x23a37a lies in 16155 (0x23a2b0, body ..0x23a4b8,
unnamed), at +0xca, the return of its `CalculateCurrentFormList(lvli+0x30, ctx->level, 1, &out, 0, 1)`
(0x23a357..0x23a375: dx = word [R14+0x10], r8d = 1, r9 = &out, [rsp+0x20] = 0, [rsp+0x28] = 1).

The chain, CONFIRMED-STATIC by call references: InitLeveledItems, before its container loop, with an
actor owner whose base is a TESNPC, calls 16155 twice: `MOV RCX,[RBX+0x218]` (TESNPC::defaultOutfit,
T/TESNPC.h:281), ctx on the stack {[RBP-0x31] = outfit, [RBP-0x29] = R14 (this, the InventoryChanges),
[RBP-0x21] = DX (the level, u16)}, `ADD RCX,0x20` (BGSOutfit::outfitItems, B/BGSOutfit.h:43), `LEA
RDX,[RBP-0x31]`, `CALL 16155` (returns +0xcc), then the same for [RBX+0x220] (sleepOutfit, :282; returns
+0xe9). 16155 has exactly two callers: 16129 and 16072. 16072 InitOutfitItems(this, a_outfit,
a_npcLevel) is a 0x40-byte wrapper: `ctx = {a_outfit, this, a_npcLevel}; 16155(&a_outfit->outfitItems,
&ctx)`; its callers are 418622 (gated by HasOutfitItems, section 2) and 40746 (a player-side init by
shape: PlayerCharacter singleton, a +0x720 record's outfit; HYPOTHESIS). CommonLib's binding of 16072 is
right; it is the late path, not the load path. 16068 (GenerateLeveledListChanges or InitScripts) reaches
neither 14751 nor 16155 nor 16128 to a depth of two (16054 and 16147 read; 16054 has one unresolved
call). 14751's complete caller set: itself, 14752, 14864, 16056, 16057, 16129, 16155, 22000, 22511,
25063, 37198, 54655, 56203, 56489. InitLeveledItems' callers: 16038 InitInventoryIfRequired (from 19507
InitItemImpl, 14374 the resolver with a_skipInit false, 13723 CreateReferenceAtLocation, 19802
TESObjectREFR::ResetInventory, 54755 Papyrus SetOutfit, 12095 the change-form reader by shape); 19654
(no static caller; indirect or dead); 22405 (a console command by shape: Script::ParseParameters, the
actorbase's level fields, InitLeveledItems, then 418622(npc, actor, 1, 1, 0, 1): SetLevel, HYPOTHESIS).
So the outfit is rolled at the inventory's init, the same InitItemImpl moment as the LVLN roll, before
any 3D and before 418622; 418622 then finds HasOutfitItems true and skips 16072. The two late 16072
fires are 418622 on an actor with no tagged entries: an applyEquipment's removeAllItems on a puppet
(section 3(c)'s flap) or an outfit whose every roll failed (HYPOTHESIS; the owner id decides). Section
2's "SetOutfit never rolls" is wrong too: its InitInventoryIfRequired rolls the new outfit through
InitLeveledItems before AddWornOutfit.

### 8.2 Where the picks are tagged, and what HasOutfitItems gates

16155 `(BSTArray<TESForm*>* a_items, OutfitInitCtx* a_ctx)`, rcx data at +0, size at +0x10, rdx the ctx
{BGSOutfit* outfit; InventoryChanges* changes; uint16 level}; returns `MOV EAX,1`. Per item: an LVLI
(formType 0x35) rolls as above, then 16128(rcx = ctx->changes, rdx = &out, r8d = 0, r9 = ctx->outfit) at
+0xd9; any other form: 16133(changes, item, 0) finds the entry; unless it exists, has an extra list,
15988(entry, 0x8E) and 15989(entry) == outfit->formID, a fresh ExtraDataList (Allocate 0x20, ctor 11583
by shape), 11647(list, outfit), 16053(rcx = changes, rdx = item, r8 = list, r9d = 1, [rsp+0x20] = 0).
16128 (0x236890) `(InventoryChanges*, BSScrapArray<CALCED_OBJECT>*, uint32 a_lvliIndex, BGSOutfit*
a_outfit)`: a_outfit null tags each pick through 11637 (the ExtraLeveledItem setter by shape), SetCount,
the COED copy, 16053(changes, form, list, count, 0); a_outfit set skips a pick whose own entry already
carries this outfit's tag (16133, 15988, 15989), else tags it through 11647 and 16053(changes, form,
list, 1, 0); then, game running, 14608(owner, 0x8000000) (AddChange kLeveledInventory,
T/TESObjectREFR.h:156; HYPOTHESIS). 11647 (0x15d210) `(ExtraDataList*, BGSOutfit*)`: under the lock at
+0x18, GetByType(0x8E) by shape; found: id = outfit->formID; else Allocate(0x18), `*p =
&VTABLE_ExtraOutfitItem; p[0x10] = outfit->formID`, ExtraDataList::Add (CONFIRMED-STATIC).
HasOutfitItems (19691) is read only in 418622 (its callee list), never in 16129, 16155 or 16128: at the
load it gates nothing. The dedupe is per pick form, so a tagged server list does not stop a differing
engine pick from being added.

### 8.3 Why InitInventoryIfRequired calls RemoveOutfitItems(nullptr)

16038 (0x225770) `(TESObjectREFR* a_ref, bool a_ignoreContainerExtraData)`, pseudocode (HYPOTHESIS as
flow; the call targets, the vfunc slot and the return offset CONFIRMED-STATIC):
```
required = base container has an LVLI entry;
if (a_ref->formType == 0x3E) {                      // 0x1402257ea
  kw = 11436(0xa3);        // default object by index, lazily cached: kKeywordSkipOutfitItems = 163, B/BGSDefaultObjectManager.h:176
  if (!kw || !a_ref->HasKeywordHelper(kw))          // CALL [RAX+0x240] = vfunc 0x48, T/TESObjectREFR.h:268, rdx = kw
    Actor::RemoveOutfitItems(a_ref, nullptr);       // XOR EDX,EDX; CALL 19690 at 0x14022581f, returns +0xb4
  if (parentCell && cellState in {2,3,4,6,7}) required = true;   // +0x60 then +0x44, T/TESObjectCELL.h:259
}
if (!required) return false;
changes = GetInventoryChanges(extraList) or a new one (owner = a_ref, totalWeight -1);
InitLeveledItems(changes); if (!a_ignoreContainerExtraData) InitFromContainerExtra(changes); 16068(changes);
```
So every inventory init of an actor without the SkipOutfitItems keyword strips every outfit-tagged entry
(null outfit = any tag, section 2), then rolls the default and sleep outfits again. Entries added tagged
before the first InitInventoryIfRequired are removed at the init; ones added after it live until the
next init (the resolver's a_skipInit false path, ResetInventory, SetOutfit, PlaceAtMe), which strips and
re-rolls. On a fresh clone the strip removes nothing (the lab's 19690 at +0xb4 on every clone). A detour
that adds early is wrong on this build; it must answer inside the roll.

### 8.4 The detour (replaces section 3(c)'s 16072 site and section 7's second detour)

Detour 16155 in Skyrim Platform's native layer, `bool (*)(RE::BSTArray<RE::TESForm*>* a_items,
OutfitInitCtx* a_ctx)` with `struct OutfitInitCtx { RE::BGSOutfit* outfit; RE::InventoryChanges*
changes; std::uint16_t level; }` (layout CONFIRMED-STATIC by both callers' stores and 16155's reads).
When ctx->changes->owner (I/InventoryChanges.h:64) is a fated actor and ctx->outfit its base's
defaultOutfit: for each (form, count) of the server's worn list, a fresh ExtraDataList (the engine's
Allocate 0x20 plus 11583, or CommonLib's `ExtraDataList()` at E/ExtraDataList.h:136 if the pin defines
it; read the idiom first), 11647(list, ctx->outfit), 16053(ctx->changes, form, list, count, nullptr);
return true without touching a_items. Any other owner or outfit (the sleepOutfit's call included, a
declared gap) falls through to the original. The one site covers the load (16129), the engine's re-inits
(every InitInventoryIfRequired caller) and the late re-dress (16072 from 418622): idempotent by
construction, since each re-init strips and asks again. A fate arriving after the roll goes through one
new native: RemoveOutfitItems(actor, defaultOutfit) (not nullptr, to spare the sleep outfit's entries),
the same three calls, AddWornOutfit(actor, outfit, true): one pop. AddObjectToContainer (vfunc 0x5A,
T/TESObjectREFR.h:286) is the CommonLib-named fallback for the add but may raise events mid-init
(HYPOTHESIS); 16053 is the engine's own call here. Open: AddWornOutfit counted zero across 65 418622
calls. 418622's only skip around it is 37897(actor) = HasKeywordHelper(DefaultObjects[155] =
kKeywordHorse, B/BGSDefaultObjectManager.h:168; objects at +0x20, 366 entries, so +0x4f8 and +0xc2b)
plus a biped-slot clash through 419334 (the worn entry by slot); the whole block is skipped only when
npc->defaultOutfit is null (the lab spawn's figures and puppets, by shape). The script below logs the
outfit id per 418622 call to settle it.

Frida (npc-roll.js, ids by `just addr` on the day): 16129 (enter: rcx changes, owner at +0x08, id at
+0x14; ret), 16155 (enter: count at rcx+0x10; ctx: outfit at rdx and its id, changes at rdx+0x08, owner,
level u16 at rdx+0x10; ret: 16129+0xcc default, +0xe9 sleep, or inside 16072), 16038 (enter: ref id, dl;
ret: 19507, 37791, 14374, 13723, 19802, 54755, 12095), 19690 (keep; ret 16038+0xb4), 14751 (keep; ret
16155+0xca outfit, 16129+0x21c container, inside 14752 LVLN), 418622 (add the outfit id at rcx+0x218),
19691 (leave: result), 16072 and 19692 (counts), ActorEquipManager::EquipObject (Offset 38894; ret: what
wears the outfit if 19692 stays zero). Scenario: the solo leg with a 15 s wait before the teleport.
Expected per fresh actor: 16038 from 19507, 19690(nullptr) at +0xb4, 16129, 16155 once per non-null
outfit with its 14751 calls returning to +0xca, then 418622 at the biped init with HasOutfitItems true
and no 16072; 16072 only on an actor with no tagged entries (a puppet after applyEquipment, by owner
id). Falsifiers: a 16155 return outside 16129 and 16072; a 14751 return to 0x23a37a with no 16155 entry
on the thread; tagged entries surviving a 19690 from 16038; 418622 with a non-null outfit, no 19692 and
no horse keyword (the 418622 read wrong).

### 8.5 Address table additions (1.6.1170 AE ids, by `just addr`)

| id | offset | name | status |
| --- | --- | --- | --- |
| 16129 | 0x236b60 | InventoryChanges::InitLeveledItems: rolls defaultOutfit and sleepOutfit through 16155, then the container's LVLIs | CommonLib name; flow HYPOTHESIS |
| 16155 | 0x23a2b0 | the outfit-array resolver `(BSTArray<TESForm*>*, OutfitInitCtx*)`, the detour site | callers and registers CONFIRMED-STATIC |
| 16128, 16053 | 0x236890, 0x226a20 | add calced picks (tag by r9: outfit or leveled index); add an entry with an extra list `(changes, form, list, count, 0)` | HYPOTHESIS |
| 11647, 11637, 11583 | 0x15d210, 0x15c840, 0x151e90 | ExtraOutfitItem setter; ExtraLeveledItem setter and ExtraDataList ctor by shape | 11647 CONFIRMED-STATIC |
| 16133, 15988, 15989 | 0x237310, 0x222dd0, 0x222e70 | an item's entry; entry has extra type; its outfit id | HYPOTHESIS |
| 11436 | 0x14eeb0 | default object by index, lazily cached (0xa3 = kKeywordSkipOutfitItems) | index CONFIRMED by header |
| 37897, 419334, 14608 | 0x698d60, 0x678000, 0x1dffc0 | HasKeyword(kKeywordHorse); worn entry by biped slot; AddChange by shape | HYPOTHESIS |
| 19654, 22405, 40746 | 0x2e0460, 0x3581d0, 0x74cc90 | InitLeveledItems' indirect caller; console SetLevel by shape; 16072's player-side caller | HYPOTHESIS |
| 16054, 16147, 38894 | 0x227430, 0x239b70, 0x6c9820 | 16068's two unnamed callees (no roll to depth two); ActorEquipManager::EquipObject | CONFIRMED-STATIC; CommonLib Offset |

Recommendation: move the outfit pin off 16072 and onto 16155, the one function every outfit resolution
on 1.6.1170 passes through (the load's InitLeveledItems, every later InitInventoryIfRequired, 418622's
late InitOutfitItems), answering the server's worn list tagged with the outfit's id through the engine's
own 11647 and 16053 for a fated owner and falling through otherwise; drop every "add tagged entries
before the first dressing" plan, since InitInventoryIfRequired strips them before it rolls; keep section
7's 14752 detour for the species; and run the 8.4 trace once before the build to confirm the chain
(16038, 19690 at +0xb4, 16129, 16155, 14751 at +0xca) per fresh actor and to settle the AddWornOutfit
zero by the outfit id logged at 418622.

### 8.6 Lab confirmation (17:34 PDT, x-npc-fate-outfit 20261024-002544)

The chain of 8.4 held per bandit on a seat (numidium's read of npc-roll.js v2): 37323 from 19231 at
the attach, 14374 with a_skipInit false and one wrapper pick, 16038 from 14374 with 19690(null) at
+0xb4, 16129 from 16038, 16155 for defaultOutfit 0xC0197 at level 1 returning into 16129's default
slot with every 14751 inside it at the outfit site, then 37322 from 19231 with a second 16038 (from
19802, a_ignoreContainerExtraData true), 16129 and 16155; then 418622 with the outfit and no 16072. The
equipped set is the second roll, the first stripped. The open AddWornOutfit zero is answered: on the
lab's load order po3_SpellPerkItemDistributor.dll reads HasOutfitItems inside 418622's frame and issues
the armor EquipObject calls itself (the weapon's comes from 418622); AddWornOutfit never runs. So the
detour on 16155 decides the inventory both inits build, and SPID dresses from it; whether SPID's own
item distribution adds to it is the next read (HYPOTHESIS, the parity probe's worn comparison).
