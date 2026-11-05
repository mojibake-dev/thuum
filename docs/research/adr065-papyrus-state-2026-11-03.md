# ADR-065, the Papyrus part: the VM's per-object state, its save form, and the event gate (static read, 2026-11-03)

Read 2026-11-03 by the re-analyst for ADR-065's draft ("the save is the state": the world's persistent state is the save's
change forms, global tables and Papyrus script objects, carried to a new owner at a hand-off, with one non-owner gate at
IVirtualMachine::SendEvent). Scope: the Papyrus third alone, four questions; the change forms and the cell-load apply path are
another analyst's. Everything inferred from decompiler output is HYPOTHESIS (rule 2) until a Frida trace or a lab run confirms it;
a header fact, or a vtable slot whose address equals a CommonLibSSE-NG id's address, is marked CONFIRMED-STATIC. No id, offset or
slot below comes from memory (rule 1): CommonLibSSE-NG headers at the pinned commit (file:line), the Ghidra project on sky-re
(program `/SkyrimSE-1.6.1170.0.exe.unpacked.exe`, image base 0x140000000; RVAs below are image-relative), and Address Library ids
for 1.6.1170 by lab/addr.py's loader (a scratch reverse map from RVA to id over versionlib-1-6-1170-0.bin's 428,461 entries,
forward-checked with `just addr` on 104800, 104801, 104247, 104184, 54033 and 53955). REA was down; pyghidra-mcp did the reads.

## Method

1. CommonLib's declarations first: Object.h, ObjectTypeInfo.h, Variable.h, Array.h, TypeInfo.h, IVirtualMachine.h,
   VirtualMachine.h (BSScript::Internal), IVMSaveLoadInterface.h, IVMObjectBindInterface.h, IObjectHandlePolicy.h, HandlePolicy.h,
   SaveFileHandleReaderWriter.h, Stack.h, StackFrame.h, SkyrimVM.h, the bind policies, and the .cpp files that carry
   RELOCATION_IDs (Object.cpp, IVirtualMachine.cpp, SkyrimVM.cpp, Offsets.h).
2. The vtables, by id: VTABLE_BSScript__Internal__VirtualMachine (AE 252631 primary, 252633 the IVMObjectBindInterface
   sub-vtable, 252635 the IVMSaveLoadInterface one), VTABLE_SkyrimScript__HandlePolicy (216935) and
   VTABLE_SkyrimScript__SaveFileHandleReaderWriter (216937), resolved with `just addr` and read with `read_bytes`. Every slot
   CommonLib numbers was checked against the id CommonLib or the fork already binds: slot 0x24 of the primary vtable is
   0x14477f0 = id 104800 (the fork's SendEvent hook, skyrim-platform game/Offsets.h:26-27 `Hooks::SendEvent`
   RELOCATION_ID(98077, 104800)) and slot 0x25 is 0x1447b40 = 104801, so IVirtualMachine.h's slot numbering holds for this binary (CONFIRMED-STATIC).
3. The functions behind the slots, and their callees, decompiled; the save and load paths found from the strings "Someone tried
   to save without freezing the Papyrus VM first" (0x1419132d0 region) and "Errors occurred while loading the Papyrus save game
   data"; the lifecycle events from the strings "OnCellAttach", "OnLoad", "OnUnload", "OnReset" and "OnInit" and their xrefs.
4. Every RVA mapped back to its Address Library id (table below). Nothing in Ghidra was renamed.

### The id table (1.6.1170; RVA; how found)

| Function (CommonLib name where it has one) | RVA | id | Found by |
| --- | --- | --- | --- |
| Internal::VirtualMachine::SendEvent (IVirtualMachine.h:89, slot 0x24) | 0x14477f0 | 104800 | vtable slot; equals the fork's hook id |
| ::SendEventAll (:90, slot 0x25) | 0x1447b40 | 104801 | vtable slot |
| ::ForEachBoundObject (:77, slot 0x1B) | 0x14465f0 | 104791 | vtable slot |
| ::FindBoundObject (:81, slot 0x1C) | 0x1446700 | 104792 | vtable slot |
| ::MoveBoundObjects (:82, slot 0x1D) | 0x14467b0 | 104793 | vtable slot |
| ::ResetAllBoundObjects (:83, slot 0x1E) | 0x1446a70 | 104794 | vtable slot |
| ::DispatchStaticCall (:91, slot 0x26) | 0x1447c90 | 104802 | vtable slot |
| ::DispatchMethodCall1 (:92, slot 0x27) | 0x14480d0 | 104804 | vtable slot |
| ::DispatchMethodCall2 (:93, slot 0x28) | 0x1447fe0 | 104803 | vtable slot |
| ::CreateObject2 (:68, slot 0x15) | 0x1445cb0 | 104784 | vtable slot; an OnInit caller |
| IVMObjectBindInterface: GetBoundHandle, BindObject, HandleLoadedBinding, RemoveAllBoundObjects, RemoveAllDiskLoadedBoundObjects, HandleCObjectDeletion, UnbindObject, InitObjectProperties (VirtualMachine.h:140-149) | 0x1448dc0, 0x1448fa0, 0x1449150, 0x14494c0, 0x1449670, 0x1449810, 0x1449a00, 0x1449fb0 | 104818, 104820, 104821, 104822, 104823, 104824, 104825, 104827 | sub-vtable 1 slots 1 to 10 |
| IVMSaveLoadInterface: SaveGame, LoadGame, MarkSaveInvalid, CleanupSave, DropAllRunningData, Unk_0A, Unk_0D, Unk_0E, GetStackByID (VirtualMachine.h:152-166) | 0x144a840, 0x144b150, 0x144bc70, 0x144bd00, 0x144be80, 0x144cb70, 0x144cc50, 0x144cd10, 0x144cdc0 | 104828, 104829, 104830, 104832, 104834, 104837, 104840, 104841, 104842 | sub-vtable 2 slots 1 to 15 |
| IVMSaveLoadInterface::Unk_08 (:159, "{ return unk; }") and Unk_0B | 0x144cb50, 0x144cc30 | none (two-byte stubs) | sub-vtable 2 slots 8 and 11; disassembled `mov rax, rdx; ret` |
| SkyrimScript::HandlePolicy: HandleIsType, IsHandleObjectAvailable, EmptyHandle, GetHandleForObject, GetObjectForHandle, ConvertHandleToString (HandlePolicy.h:19-29) | 0x9a1a20, 0x9a1c50, 0x9a1d20, 0x9a1d40, 0x9a20a0, 0x9a2720 | 53505, 53506, 53507, 53508, 53512, 53515 | vtable 216935 slots 1, 2, 3, 4, 8, 11 |
| SkyrimScript::SaveFileHandleReaderWriter: SaveHandle, LoadHandle, SaveRefID, ParseScriptInstance (SaveFileHandleReaderWriter.h:17-20) | 0x9a2fb0, 0x9a3050, 0x9a32a0, 0x9a32c0 | 53522, 53523, 53526, 53527 | vtable 216937 slots 2 to 5 |
| BSScript::Object::GetHandle, IncRef, DecRef, Dtor (Object.cpp:20, 49, 56, 117) | 0x1422240, 0x1422ea0, 0x1422f50, 0x1422190 | 104247, 104252, 104253, 104246 | CommonLib RELOCATION_IDs; the decompiles call them |
| Object::Save (the object's own serializer) | 0x1422350 | 104249 | callee of the object-data writer |
| Variable::Save | 0x1424c50 | 104293 | callee of Object::Save |
| Object ctor (the loader's re-create) | 0x1423050 | 104255 | callee of the object-table loader |
| ObjectTypeInfo::GetTotalNumVariables (the count Object::Save writes) | 0x1426b80 | 104317 | callee of Object::Save |
| the variable-name-by-index helper | 0x1426df0 | 104320 | callee of Object::Save (error path) |
| BSScript::ObjectBindPolicy::BindObject (Offsets.h:123) | 0x141db30 | 104184 | CommonLib |
| SkyrimScript::ObjectBindPolicy's loaded binding | 0x141dba0 | 104185 | callee of the object-table loader |
| the OnInit dispatcher | 0x1451170 | 104875 | xref of "Unable to call member function OnInit on object %s" |
| the stack-finished path (dispatches OnInit when the last property-init stack ends) | 0x144ee40 | 104854 | caller of 104875 |
| the function lookup by name and state | 0x144d740 | 104847 | callee of DispatchMethodCall1 and of 104875 |
| the function-call queue push | 0x144d8e0 | 104848 | callee of DispatchMethodCall1 |
| the Stack factory | 0x1450b10 | 104870 | callee of DispatchMethodCall1 |
| FindBoundObject's body and its type matcher | 0x1451a80, 0x1457120 | 104880, 104912 | callees of 104792 |
| attachedScripts find | 0x145e270 | 105080 | callee of SendEvent, ForEachBoundObject, FindBoundObject |
| the save-table builder | 0x1451ed0 | 104882 | callee of SaveGame |
| string table write and load, type table write and load | 0x143f350, 0x143e4f0, 0x1440a80, 0x143f9b0 | 104679, 104661, 104699, 104690 | callees of SaveGame and LoadGame |
| the string-index writer (interns one BSFixedString into the writable table) | 0x143f670 | 104682 | callee of Object::Save and Variable::Save |
| object table write and load | 0x14524d0, 0x1452780 | 104883, 104884 | callees of SaveGame and LoadGame |
| object table entry writer | 0x145c460 | 105016 | callee of 104883 |
| object data write and load | 0x1454910, 0x1454b50 | 104889, 104890 | callees of SaveGame and LoadGame |
| one object's data record writer | 0x1462010 | 105149 | callee of 104889 |
| array table entry writer, arrays writer, stack table writer, stacks writer | 0x145c230, 0x14573d0, 0x1458180, 0x14583e0 | 105015, 104914, 104921, 104922 | callees of SaveGame |
| SkyrimVM: the save callback, the load callback, the save body, the load body | 0x9c9ef0, 0x9c9fd0, 0x9ccaf0, 0x9cdbd0 | 54017, 54018, 54041, 54049 | xrefs of the three Papyrus save strings |
| SkyrimVM::RelayEvent (SkyrimVM.h:215; Offsets.h:487) | 0x9cb910 | 54033 | CommonLib |
| SkyrimVM::EventRelayFunctor::operator(), EffectEventRelayFunctor::operator() | 0x9cb770, 0x9cb7f0 | 54030, 54031 | the functor vtables RelayEvent installs |
| SkyrimVM's TESCellAttachDetachEvent sink (SkyrimVM.h:92) | 0x9c3d70 | 53963 | xref of "OnCellAttach" |
| SkyrimVM's TESObjectLoadedEvent sink (SkyrimVM.h:110) | 0x9c5d90 | 53981 | xref of "OnUnload" |
| SkyrimVM's TESResetEvent sink (SkyrimVM.h:117) | 0x9c6e10 | 53988 | xref of "OnReset" |
| SkyrimVM's frozen check (the save refuses an unfrozen VM) | 0x9c3690 | 53958 | callee of 54017 |
| SkyrimVM::QueuePostRenderCall (Offsets.h:486) | 0x9c34c0 | 53955 | CommonLib |
| the alias walk under RelayEvent (two helpers) and the active-effect walk | 0x2e04d0, 0x2e0500, 0x5c4380 | 19655, 19656, 34540 | callees of 54033 |
| TESForm::LookupByID (HYPOTHESIS name) and the quest's alias-by-id | 0x1e01a0, 0x3cc130 | 14617, 25040 | callees of 53512 |
| the unique-id reference lookup under GetObjectForHandle | 0x9a3c90 | 53544 | callee of 53512 |
| u32 writer and u16 writer onto a BSStorage | 0x999410, 0x9a3a30 | 53381, 53533 | callees throughout |
| the static initializer that interns "OnInit" (DAT_14332a0c0) | 0xfc8f0 | 10198 | xref of the "OnInit" string |

Skyrim Together's map (docs/TE-MAP.md:48-49, :71) touches this area at two points only: BSScript::BindEverythingToScript (55739,
where TE registers its natives) and the VM's CompareVariables (105220, a patch TE dropped). TE hooks neither SendEvent nor the
save path nor any object state; its Papyrus scripts run on every client unsynchronised. No lead there for ADR-065.

## Q1. The VM's per-object layout and the variables' encodings

Candidate (confidence HIGH for the layout, CONFIRMED-STATIC where the decompiles read the same offsets the headers name; the
handle encoding and the "+3" reading are HYPOTHESIS): a bound script instance is one BSScript::Object of 0x30 header bytes plus
GetTotalNumVariables Variables of 0x10 each, positional and parent-first; names, declared types, initial values and the
property-to-variable map live in the ObjectTypeInfo, not the object; a VMHandle is a 64-bit (kind, mid, form id) triple.

Evidence.
- Object (CommonLibSSE-NG include/RE/O/Object.h:39-49): `constructed:1, initialized:1, valid:1, remainingPropsToInit:29` at
  +0x00; `BSTSmartPointer<ObjectTypeInfo> type` +0x08; `BSFixedString currentState` +0x10; `void* lockStructure` +0x18 ("first
  bit used as flag"); `volatile VMHandle handle` +0x20; `refCountAndHandleLock` +0x28; `Variable variables[0]` +0x30 with the
  comment "size == classPtr->GetTotalNumVariables() + 3". The decompiles read exactly these: Object::GetHandle (104247) spins on
  the sign bit of +0x28, then reads +0x20; Object::Save (104249) reads the three low bits and the field above bit 3 at +0x00,
  +0x10 as the state, +0x18 as a Stack pointer (it writes `*(u32*)(lock + 0x80)`, Stack::stackID, Stack.h:80), and the variables
  from +0x30 in 0x10 steps; the object-table loader (104884) allocates `(GetTotalNumVariables + 3) * 0x10` bytes for a re-created
  object, so the "+3" is the 0x30 header counted in Variable units (HYPOTHESIS, consistent with the header's sizeof 0x30).
- The lock: `lockStructure` is the Stack holding the object's lock (its stackID is what the save writes); `refCountAndHandleLock`'s
  sign bit is the handle lock Object::GetHandle takes (104247: a spin of Sleep(0) ten thousand times, then Sleep(1)).
- The variables' order (Object.cpp:84-112, GetVariable): the type chain is walked from the most derived class; once the name is
  found in class C at local index i, the counts of every class ABOVE C are added, so the layout is ancestors first, each class's
  variables in its declaration order, the most derived class last. GetTotalNumVariables (ObjectTypeInfo.cpp:74-81) is the chain's
  sum. A property reads its auto variable through PropertyTypeInfo::autoVarIndex (ObjectTypeInfo.cpp:155-167; Object.cpp:66-76).
- Variable (include/RE/V/Variable.h:93-94): `TypeInfo varType` (8) + `Value value` (8); Value is a union of i32, u32, float, bool,
  void*, BSTSmartPointer<Array>, BSTSmartPointer<Object>, BSFixedString (:17-31). TypeInfo (include/RE/T/TypeInfo.h:12-32):
  kNone 0, kObject 1, kString 2, kInt 3, kFloat 4, kBool 5, kNoneArray 10, kObjectArray 11, kStringArray 12, kIntArray 13,
  kFloatArray 14, kBoolArray 15; "the type id for classes IS their class ptr; an object is an array if its first bit is set"
  (TypeInfo.cpp:81-89 masks the ObjectTypeInfo pointer back out; GetUnmangledRawType :91-99 folds any value >= kArraysEnd to
  kObject or kObjectArray). Variable::Save (104293) applies the same fold: a raw value >= 0x10 becomes type byte 1, or 11 when its
  bit 0 is set. Strings are interned (BSFixedString; Variable.cpp:86 compares them as pointers), arrays and objects are shared by
  pointer (Variable.cpp:98, :137).
- Array (include/RE/A/Array.h:72-77): refcount, `TypeInfo _elementType` +0x08, `u32 _size` +0x10, a BSSpinLock +0x18, `Variable
  _data[]` +0x20; MAX_SIZE 128 (:69).
- ObjectTypeInfo (include/RE/O/ObjectTypeInfo.h): `name` +0x08 (:177), `parentTypeInfo` +0x10 (:178), the counts as bitfields
  (:180-191), one `data` blob (:192) laid out in this order (ObjectTypeInfo.cpp:83-153): UserFlagInfo x userFlagCount,
  VariableInfo {name, TypeInfo} x variableCount (:51-58), InitialValueInfo {variableIndex, Variable initialValue} x
  initialValueCount (:60-68), PropertyInfo {name, PropertyTypeInfo} x propertyCount (:70-77), GlobalFuncInfo, MemberFuncInfo,
  NamedStateInfo {name, memberFunctionCount:9, memberFunctionOffset:9} x namedStateCount (:95-122). A state is a name plus a
  function table; the object carries only the name (currentState).
- The handle (VMHandle = u64, include/RE/B/BSCoreTypes.h:7). HandlePolicy::GetHandleForObject (53508), GetObjectForHandle (53512),
  SaveHandle (53522) and LoadHandle (53523) agree on one encoding (HYPOTHESIS, four decompiles): bits 48 to 63 a kind, bits 32 to
  47 a middle word, bits 0 to 31 a form id. Kind 0 with mid 0xFFFF: a plain form (53508's default branch ORs 0xFFFF00000000
  onto the form id). Kind 0 with mid < 0xFFFF: an alias, mid = BGSBaseAlias::aliasID and the form id the owning quest's
  (BGSBaseAlias.h:76-77 per docs/research/adr062/papyrus-native-entries.md; 53508 takes this branch for VM type ids 139 to 141,
  BGSBaseAlias::VMTYPEID = 139 at BGSBaseAlias.h:15; 53512 resolves it by TESForm::LookupByID then the quest's alias-by-id, 25040,
  refusing a form whose type byte is not 0x4D Quest, FormTypes.h:217). Kind 1: a reference carrying ExtraUniqueID (an inventory
  item), mid = uniqueID and the form id = baseID, the owner's (ExtraUniqueID.h:24-25; 53508 reads the extra list at
  TESObjectREFR+0x70, TESObjectREFR.h:498, through TESForm::AsReference1, TESForm.h:166; 53512 resolves it through the policy's
  own map, 53544). Kind 2: an active effect, mid = ActiveEffect::usUniqueID (ActiveEffect.h:113), form id = the target actor's
  (53512 requires type byte 0x3E, FormTypes.h:202, and walks the actor's MagicTarget at +0xA0 with 34540). The empty handle is
  0x0000FFFF00000000 (53523 writes it on failure; HYPOTHESIS that EmptyHandle, 53507, returns the same). SaveHandle writes u16
  kind, u16 mid, then SaveRefID (53526) of the low 32 bits; LoadHandle reads them back and re-ORs the kind.
- Stack and StackFrame (include/RE/S/Stack.h:70-84; include/RE/S/StackFrame.h:21-33): a stack is memory pages, a frame chain,
  `state` (kWaitingOnLatentFunction = 3, Stack.h:32), `returnValue`, `stackID`, `stackType` (kNormal, kPropertyInitialize,
  kInitialize, :47-52), `owningTasklet`, `callback`; a frame is `owningFunction`, `owningObjectType`, `instructionPointer`,
  `self`. IStackCallbackFunctor::CanSave is false by default (IStackCallbackFunctor.h:23).

What a per-object serialization has to carry (the engine's own writer, Object::Save 104249, carries nothing else per object, so
this is sufficient as well as necessary): the handle as (kind, mid, form id); the script's type name (the object's
`type->name`); `currentState` ("" for the empty state); the flags that matter (`initialized`; `constructed` and `valid` are set
on every bound object, HYPOTHESIS); `remainingPropsToInit` (0 once initialized); the variable count and each Variable in the
Object's positional order, encoded by the folded type: none; int as i32; float as its 32 bits; bool; string as text (re-interned
on arrival); object as (the referenced object's handle, its type name), None as none; arrays by element type with the length (at
most 128) and the elements by the same rules. Variable names and declared types need not travel: both seats run the same .pex
(the lab's load-order rule) and the receiver checks the count against GetTotalNumVariables. Two arrays or two variables sharing one
Array by pointer lose their aliasing unless an array identity travels (HYPOTHESIS that shipped scripts rarely depend on it).

What it cannot carry: a running or waiting Stack (frames, instruction pointers, the VM's pages, a callback functor that cannot
save), the lock holder, the latent waits (SkyrimVM::queuedWaitCalls and kin keyed by stackID, SkyrimVM.h:240-242; the quest-stage
and animation wait registries DAT_1431afd70 and DAT_1431afba8 of papyrus-native-entries.md), RegisterForUpdate registrations
(SkyrimVM.h:248-249), the deferred DelayFunctors (an AddItem queued and not yet applied, SkyrimVM.h:256-263), the function
message queue (VirtualMachine.h:194-195), suspended stacks. The engine's save carries every one of these whole-VM, frozen (Q3),
never per object.

Side effects (HYPOTHESIS): writing `currentState` directly skips the Papyrus GotoState path and its OnEndState/OnBeginState
events (the engine's own loader writes the state straight from the save, so parity with a load is kept); writing a property's auto
variable skips a non-auto property's Set function (the loader writes variables directly too); an object-typed variable needs its
target to exist on the receiver, else it must become None; writing a Variable in place must run Variable::operator= (Variable.cpp:
49-56: Cleanup then Assign) so a replaced string or array releases its old value.

Suggested Frida trace: hook 104249 Object::Save (log arg 0 Object*: `+0x08` -> ObjectTypeInfo `+0x08` name, `+0x10` state,
`+0x20` handle, `+0x00` flags), 104293 Variable::Save (arg 0 Variable*: the raw TypeInfo and the folded type byte it writes),
104682 (the string index writer, to count the strings per object) and 53522 SaveHandle (arg 2 handle). Lab step: on c1, host of
Bleak Falls Temple with two pillars turned, a console `save adr065-q1` (the typed-command step; if the lab's grammar lacks a save
step, Eli's F5 on the seat under a lab hold). Expect one Object::Save per attached script, the pillars' scripts in their turned
state, variable counts equal to GetTotalNumVariables, and handle kinds within {0, 1, 2}.

Read on the lab (10:50 PST 2026-11-05 (18:50Z 11-05)): CONFIRMED by trace, x-script-save v1.1 20261105-184120 (docs/verbs/papyrus-events.md, ADR-068
rung 3's first read): 64591 objects, every count matching 104317's, one Object::Save per attached script, positional for every
watched object, handles in kinds 0 to 2 written by the object table (105016), plain forms kind 0 with mid 0xFFFF.

What would falsify this: a variable count written that differs from the type chain's sum (the positional model is wrong); a
handle kind outside {0, 1, 2} or a plain form whose mid is not 0xFFFF (the encoding is wrong); an Object::Save count that differs
from the attachedScripts population walked under the lock (objects live outside the map).

## Q2. FindBoundObject, the bind policy and the attached scripts per form

Candidate (confidence HIGH; CONFIRMED-STATIC for the slot and the lock; the matcher's parent walk is HYPOTHESIS from one
decompile): FindBoundObject(handle, className, out) takes attachedScriptsLock, finds the handle's small array of attached scripts
and returns the first whose type, or any ancestor type, is named className; every per-form enumeration goes through that one map.

Evidence.
- Declaration: IVirtualMachine.h:81 `bool FindBoundObject(VMHandle a_handle, const char* a_className, BSTSmartPointer<Object>&
  a_result) const`, slot 0x1C (0x1E on VR, IVirtualMachine.cpp:155-158); the slot's address 0x1446700 is id 104792.
- Body (104792 -> 104880 -> 104912): lock VM+0x93A0 (`attachedScriptsLock`, VirtualMachine.h:219, a re-entrant spin lock keyed by
  thread id); find VM+0x93A8 (`attachedScripts`, :220, `BSTHashMap<VMHandle, BSTSmallSharedArray<AttachedScript>>`) by handle
  (105080); make a BSFixedString of className (null means the empty string); for each attached Object (the AttachedScript is a
  `BSTPointerAndFlags<BSTSmartPointer<Object>, 1>`, AttachedScript.h:13, so the pointer is masked with ~1), walk `type` then
  `parentTypeInfo` comparing `ObjectTypeInfo::name` (+0x08) with className by interned pointer equality; with the exact flag
  (the loader passes 1, the public call passes 0) only the object's own type is compared; the first match is IncRef'd into out;
  unlock; return out != null. So FindBoundObject(h, "ObjectReference") is the first attached script of any kind, and
  FindBoundObject(h, "defaultPuzzlePillarScript") finds the pillar's script even when the attached type derives from it.
- ForEachBoundObject (IVirtualMachine.h:77, slot 0x1B, 104791): under the same lock, calls the functor's slot 1 with (Object*,
  the AttachedScript's flag bit) per script until it returns something other than 1. The flag bit is written into the save's object
  table entry as one byte (105016); its meaning is HYPOTHESIS (the `a_conditional` of BindObject, IVMObjectBindInterface.h:22, or
  the disk-loaded mark RemoveAllDiskLoadedBoundObjects consults, :25).
- The map's value: a count in the first u32, one inline element when the count is at most 1, a heap pointer otherwise; every
  decompile that walks it (104800, 104791, 104883, 104889) reads it so. How many scripts a reference binds = that count; how to
  enumerate them for one form = handle from `GetObjectHandlePolicy()->GetHandleForObject(form->GetFormType(), form)`
  (IObjectHandlePolicy.h:33; HandlePolicy slot 4, 53508), then ForEachBoundObject, or the walk the fork already does under
  `vm->attachedScriptsLock` (skyrim-platform FridaHooks.cpp:318-327 and :362-370). GetVariableValue2(handle, className, index,
  out) (IVirtualMachine.h:88) reads one variable through the same lookup.
- The bind side. IVirtualMachine::GetObjectBindPolicy (:100, :114) is SkyrimScript::ObjectBindPolicy (SkyrimScriptObjectBindPolicy.h);
  the base's BindObject (BSScriptObjectBindPolicy.h:36, Offsets.h:123 RELOCATION_ID(97379, 104184)) only sets a TLS marker and
  forwards to `bindInterface->BindObject` (IVMObjectBindInterface slot 3, 104820). The VM's binding interface (VirtualMachine.h:
  140-149): GetBoundHandle 104818, BindObject 104820, HandleLoadedBinding 104821 (the loader's path), RemoveAllBoundObjects 104822,
  UnbindObject 104825, CreateObjectWithProperties (slot 9; the loader re-creates a saved object with it), InitObjectProperties
  104827 (which ends by dispatching OnInit, Q4). The policy's own `attachedScripts` (BSScriptObjectBindPolicy.h:42,
  `BSTHashMap<VMHandle, UnkValue>`) is unread (HYPOTHESIS: its book of handles with pending or conditional bindings).
- CommonLib's own helper for the whole dance is BindID (PackUnpack.cpp:27-46): GetTypeIDForScriptObject, GetHandleForObject,
  HandleIsType and IsHandleObjectAvailable, then ObjectBindPolicy::BindObject.

Side effects (HYPOTHESIS): FindBoundObject takes the lock the SendEvent hook also takes; the hook runs at SendEvent's entry before
the VM's own lock, so a call from inside the hook is safe, as the fork's walk already is; a call from a Frida interceptor on the
VM thread inside 104800's body after the copy is also outside the lock (104800 releases it before dispatching).

Suggested Frida trace: hook 104792 (args: this, handle, className c-string, out; log the result's type name through out ->
Object +0x08 -> +0x08) and, from the same script, call it as a NativeFunction on c1 for a pillar's reference (its form id from
lab/esm.py) with "defaultPuzzlePillarScript", "ObjectReference" and a bogus name, the handle built as formId | 0xFFFF << 32 and,
for comparison, as 53508 returns it. Lab step: any seat standing in the temple. Expect the same Object for the two real names,
null for the bogus one, and the two handles equal.

What would falsify this: a null for the parent name while the own name matches (the walk is exact-only and the flag semantics are
inverted); the hand-built handle failing where 53508's succeeds (the kind-0 encoding is wrong); a count mismatch between
ForEachBoundObject's visits and the map value's first u32.

## Q3. The save's Papyrus section as the engine writes it, and whether a slice of it is portable

Candidate (confidence MEDIUM-HIGH on the order and the record shapes, HYPOTHESIS throughout since every line is decompiled): the
section is written by SkyrimVM's save body (54041) as [Internal::VirtualMachine::SaveGame's block] then SkyrimVM's own block; the
VM block is version, string table, type table, object table, array table, stack table, object data, array data, stack data,
function messages, suspended stacks, frozen stacks, objects awaiting reset, queued unbinds; a per-object record references a
per-save string table and identifies other objects and arrays by their save-time addresses, so no slice of it stands alone.

Evidence (the write side).
- Entry: BGSSaveLoadGame calls SkyrimVM's save callback (54017), which refuses an unfrozen VM (53958: "Someone tried to save
  without freezing the Papyrus VM first. Script save will be flagged as invalid!", then `saveLoadInterface->MarkSaveInvalid` and a
  u16 0xFFFF) and otherwise runs the body (54041) with a SaveFileHandleReaderWriter on its stack (vtable 0x141911fe0 =
  VTABLE_SkyrimScript__SaveFileHandleReaderWriter, AE 216937), then `CleanupSave` (IVMSaveLoadInterface slot 5) unless the call
  was a size calculation ("Calculating save size..." versus "Saving game...").
- The VM block (104828 = IVMSaveLoadInterface::SaveGame, VirtualMachine.h:152): u16 version 6; when the writable tables are not
  built, build them (104882: VM+0x94D8 `writableStringTable` and VM+0x9508 `writeableTypeTable`, VirtualMachine.h:238, :240,
  "Created/Used only while saving"); string table (104679, "Failed to write string table for internal VM save data"); type table
  (104699); then under attachedScriptsLock, runningStacksLock and arraysLock (VM+0x93A0, +0x9318, +0x93F8; :219, :210, :224):
  the object table (104883): u32 count (VM+0x94CC) then one entry per attached script over the whole attachedScripts map (105016:
  u64 object id, string index of the type name, SaveHandle (53522: u16 kind, u16 mid, SaveRefID 53526 of the form id), u8 the
  AttachedScript flag; "Failed to write object table entry for script %s attached to %s"), then u32 count and the same entries for
  `objectsAwaitingCleanup` (VM+0x93E0, :223, the unbound objects still alive through variables; "Unable to write object table to
  save game"); the array table: u32 count (VM+0x94D0) then one entry per `arrays` element (VM+0x9408, :227; 105015; "Unable to
  write array table to save game"); the stack table: u32 `nextStackID` (VM+0x9380, :213), u32 running count (allRunningStacks'
  capacity minus free, :211), one entry per running stack (104921; "Unable to write stack table to save game"); the object data
  (104889 -> 105149 per object: u64 id then Object::Save, "Unable to write objects to save game"; the detached objects are written
  with EmptyHandle as their handle); the array data (104914, "Unable to write arrays to save game"); the stack data (104922, with
  the save interface's `stackCallbackSaveInterface` VM+0xA8 and `handlePolicy` VM+0x90 in its context; "Unable to write stacks to
  save game"); under funcQueueLock (VM+0x200): u32 `uiWaitingFunctionMessages` (VM+0x8278, :197) then the `funcMsgQueue` and
  `overflowFuncMsgs` (:194-195; "Failed to write function call/return message to save game"); under suspendQueueLock (VM+0x92F0):
  u32 count and the `stacksToSuspend` queue plus its overflow, then `stacksToResume` plus its overflow (:206-209; "Failed to write
  suspended stack to save game"); under frozenStacksLock (VM+0x9384): u32 `frozenStacksCount` (:217) and, when non-zero, the first
  frozen stack's id (`frozenStacks->stackID`, :216, Stack.h:80); under objectResetLock (VM+0x9420): u32 count and one u64 id per
  `objectsAwaitingReset` entry (:229); under queuedUnbindLock (VM+0x94A8): the queued unbinds (:234).
- The object id is the object's address at save time: IVMSaveLoadInterface slot 8 (Unk_08, VirtualMachine.h:159 "{ return unk; }")
  disassembles to `mov rax, rdx; ret` at 0x14144cb50, and every writer passes its result to the u64 writer (0x1425d80). Arrays the
  same through slot 11 (Unk_0B, :162). The loader keeps `objectTable` and `arrayTable` (VM+0x9448, +0x9478; :231-232, "Used when
  loading a save") from saved id to the re-created object, and slot 10 (Unk_0A, 104837) is that lookup under objectLock.
- Object::Save (104249) writes: u8 flags (constructed -> 0x01, valid -> 0x02, a lock holder present -> 0x04, initialized -> 0x08,
  the lock pointer's flag bit -> 0x10), the string index of `currentState`, u32 `remainingPropsToInit`, the lock holder's stackID
  when present, then (if constructed) u32 GetTotalNumVariables and Variable::Save per variable in positional order, else u32 0
  ("Failed to write basic script data for %s attached to %s"; "Failed to write variable %s on script %s attached to %s").
- Variable::Save (104293) writes: u8 folded type (0 to 5, 10 to 15; a class pointer folds to 1, a class array to 11); then for an
  object: the string index of the class name (ObjectTypeInfo +0x08) and the u64 object id (the pointer, through slot 8, which also
  IncRefs and DecRefs around the read); for a string: the string index; for int, float, bool (and none): the u32 raw value; for an
  array: for a class array the string index of the element class, then the u64 array id (slot 11).
- SkyrimVM's own block (54041 after SaveGame): u16 version 5; a first registry (0x9cd020, HYPOTHESIS the update registrations);
  under userLogMapLock (SkyrimVM+0x88F8) the user logs; under renderSafeQueueLock and postRenderQueueLock (+0x88C8, +0x88E0) the
  four DelayFunctor queues (SkyrimVM.h:256-263; so a queued AddItem, MoveTo or Enable not yet applied is in the save); under
  queuedLOSEventCheckLock (+0x6F0) the LOS checks (:244); two more registries (0x9cd700, 0x9cd8d0; HYPOTHESIS the wait calls and
  the update events); under InventoryEventFilterMapLock (+0x8940) the filters (:276); then four static registries by their globals
  (0xa36a70's; DAT_1431afba8, the animation callbacks of papyrus-native-entries.md; DAT_1431afd08; DAT_1431afd70, the quest-stage
  waits; DAT_1431afdf0).

Evidence (the read side, 104829 = LoadGame, VirtualMachine.h:153): u16 version into `saveGameVersion` (VM+0x94C8, :235); 0xFFFF
means "VM tried to load save flagged as invalid. Ignoring load request."; above 6 means "VM Save file version number is too new.
Expected %u or lower, found %u"; the string table (104661, large indexes when version > 5, StringIndexSize kLarge,
IVMSaveLoadInterface.h:11-15) and the type table (104690) into the readable tables (VM+0x94F0, +0x9510; :239, :241); under the
three locks the object table (104884): per entry read the u64 id (slot 14, Unk_0E), the type name (a string index, 104664),
LoadHandle (53523), the flag byte; then FindBoundObject with the exact flag on that handle and type (104880 with 1): an object the
form already bound when it loaded is REUSED; failing that, the handle GetHandleScriptsMovedFrom (HandlePolicy slot 7) names is
tried; failing that, CreateObjectWithProperties(type) and the bind policy's loaded binding (104185); the id maps to the object in
`objectTable` ("Duplicate object handle 0x%X loaded from object handle table - second object ignored" otherwise); a second
section re-creates the detached objects ("Unable to re-create a %s object which is detached"; "Object handle 0x%X is in the
detached array but is already attached to a C object. Object has been forcibly detached."); then, by version, the array and stack
tables, the object data (104890: state and variables into the found objects, object references resolved through objectTable by
the saved id), the array data, the stack data, the function messages ("Unable to restore a function call request - an object may
fail to be initialized"), the suspended stacks, the frozen stacks (GetStackByID 104842), the objects awaiting reset (slot 14 then
slot 10 per id), the queued unbinds; finally the readable tables are freed.

Answer to the question. A per-object slice cannot be lifted from the engine's writer and applied by its reader as bytes:
1. every string in a record (type name, state, string values, element class) is an index into a table built per save by walking
   the whole VM (104882) and freed after (CleanupSave; the readable table after LoadGame), so a record is meaningless without that
   save's table;
2. every object reference and array reference is a save-time ADDRESS, resolved only through objectTable and arrayTable that the
   whole-section load fills first;
3. the handle's form id goes through SaveRefID (53526), the save file's own reference encoding (HYPOTHESIS: the save's compact
   refID with its plugin table), not the runtime form id;
4. the reader has no per-object entry point: LoadGame runs with the VM frozen, on a versioned stream, and the object data section
   cannot be entered without the tables and the object table before it.
So ADR-065 needs its own per-object encoder and decoder. It is small: Variable::Save's nine cases are the whole type system, both
seats share the load order (the handle travels as kind, mid, form id with no remap), and the engine's own record proves the SHAPE:
{flags, currentState, remainingPropsToInit, variables[]} is all the engine keeps per object. What the build can reuse from the
engine, as building blocks rather than bytes: identity (Object::GetHandle 104247; FindBoundObject 104792, the same
find-and-reuse the loader itself performs); the readers (GetVariableValue1 IVirtualMachine.h:87, GetPropertyValue :86, or the
positional `variables[]` with the type chain); the writers (SetPropertyValue :85 for properties; Variable::operator= for plain
variables, Variable.cpp:49-56; a direct `currentState` write, which the loader itself does from the save); and ResetAllBoundObjects
(104794) when a hand-off wants a clean slate before applying.

Side effects (HYPOTHESIS): the save freezes the VM for its duration (the stacks' FreezeState, Stack.h:40-45; the frozen check
53958), so a lab save stalls every script for the write; a save made while a DelayFunctor is queued carries the functor and
re-applies it at load (an AddItem counted twice is a real risk for a restart scenario that saves mid-apply); objects awaiting reset
are re-queued at load.

Suggested Frida trace: hook 54017 (the callback; log the frozen check's answer), 104828 SaveGame (entry and leave, with the
storage's GetPosition, BSStorage slot 2, BSStorage.h:32, at both, for the VM block's byte size), 104883 (the object table's count
at VM+0x94CC), 105016 per entry (the type name through the AttachedScript's object and the handle), 104249 per object (state), and
53522 (kind, mid, id written). Lab step: the console `save adr065-q3` of Q1's trace on c1. Expect one SaveGame; as many table
entries as the attachedScripts population; the ids at 105149 equal to the Object pointers seen at 104249; the strings written as
indexes (two or four bytes), never inline.

What would falsify this: an object id that is not the object's pointer (slot 8 is not the identity it disassembles to); a string
written inline; a LoadGame that creates objects without probing FindBoundObject first (then a loaded script would double up on a
form, and the engine's own apply is "create", not "find or reuse"); a version other than 6 in a 1.6.1170 save.

## Q4. The event gate: SendEvent, the lifecycle events' delivery, today's gate, and what a cell-host gate needs

Candidate (confidence HIGH for SendEvent's mechanics and the sinks, CONFIRMED-STATIC for the slot; HIGH that OnInit never passes
SendEvent, from the dispatcher's own error string and its three callers): SendEvent is a per-attached-object DispatchMethodCall by
name that QUEUES the handler; OnCellAttach, OnCellDetach, OnLoad, OnUnload and OnReset arrive through SendEvent (plus alias and
effect relays that also call SendEvent), so one hook sees them; OnInit is dispatched by the VM itself at object initialization and
never passes SendEvent, so no gate there can touch it.

Evidence.
- SendEvent (104800; IVirtualMachine.h:89): with TLS marker 0x14 set, lock attachedScriptsLock, copy the handle's attached
  objects into a scrap array (IncRef each, 104252), unlock, then for each object call slot 0x27 DispatchMethodCall1 (104804, :92)
  with (object, the event name as the function name, the args, a callback out); release the copies (104253, 104246 for the last
  reference). SendEventAll (104801, :90) iterates the attachedScripts map and calls SendEvent per handle. SkyrimVM::SendAndRelayEvent
  (SkyrimVM.cpp:26-33) is impl->SendEvent then RelayEvent.
- DispatchMethodCall1 (104804): IncRef the object's type; look the name up (104847) in the object's `currentState` up the type
  chain, then in the empty state (the interned "" at DAT_14332a0a8) up the chain; an empty function (IFunction::GetIsEmpty, slot
  0x0A, IFunction.h:56) completes the callback with None at once; a real one builds the argument array (IFunctionArguments slot 1,
  IFunctionArguments.h:20), packs `self`, allocates a call query, creates a Stack (104870, type kNormal) and pushes a FunctionMessage
  (104848); on failure "error: Unable to call member function %s on object %s due to stack creation failure or queue full, call
  ignored." So the handler runs later on the VM's Update, not inside SendEvent, and the fork's block (replacing the name with "",
  FridaHooks.cpp:432-434) makes 104847 find nothing: nothing is queued and nothing is logged (HYPOTHESIS: the decompile shows no
  message for an unknown name).
- The lifecycle events D-S1 names, as SkyrimVM delivers them:
  - OnCellAttach and OnCellDetach: the TESCellAttachDetachEvent sink (53963; SkyrimVM.h:92, the sub-object at +0x30; the event is
    {NiPointer<TESObjectREFR> reference, bool attached}, TESCellAttachDetachEvent.h:12-13): handle = handlePolicy->GetHandleForObject
    (reference->formType, reference) (SkyrimVM+0x328, :225; 53508), impl->SendEvent (SkyrimVM+0x200, :219; slot 0x24) with
    "OnCellAttach" or "OnCellDetach" and a ZeroFunctionArguments, then RelayEvent (54033) to the reference's aliases (19655/19656
    iterate them; the EventRelayFunctor 54030 makes an alias handle of VM type 140 and calls impl->SendEvent on it, after the
    optional ISendEventFilter) and, for an actor (type byte 0x3E), to its active effects (34540 over MagicTarget at +0xA0; the
    EffectEventRelayFunctor 54031); on detach the handle policy's cleanup (53519).
  - OnLoad and OnUnload: the TESObjectLoadedEvent sink (53981; SkyrimVM.h:110, +0xC0; the event is {FormID formID, bool loaded},
    TESObjectLoadedEvent.h:9-10): a handle from the form id (0x9a2b50, HYPOTHESIS the policy's "handle for a form id"), then
    impl->SendEvent + RelayEvent; OnUnload adds the cleanup (53519).
  - OnReset: the TESResetEvent sink (53988; SkyrimVM.h:117, +0xF8; {NiPointer<TESObjectREFR> object}, TESResetEvent.h:13): skipped
    for a deleted form (TESForm flag bit 5, kDeleted, TESForm.h:62 per papyrus-native-entries.md); otherwise a handle through 53508,
    then impl->ResetAllBoundObjects(handle) FIRST (slot 0x1E, 104794), then impl->SendEvent "OnReset" + RelayEvent. A reset rewrites
    the bound scripts' state before any event; neither the SendEvent hook nor the natives' hooks see that rewrite.
  - OnInit: NOT through SendEvent. The dispatcher (104875, found by its string "error: Unable to call member function OnInit on
    object %s due to stack creation failure or queue full, call ignored.") resolves the interned "OnInit" (DAT_14332a0c0, set by
    the static initializer 10198) on the object's type with 104847; a missing or empty OnInit just sets the object's `initialized`
    bit (Object.h:40, bit 1 of +0x00); a real one packs `self`, creates a Stack of type 2 = kInitialize (Stack.h:51) with 104870
    and pushes it with 104848. Its callers: CreateObject2 (slot 0x15, 104784), InitObjectProperties (IVMObjectBindInterface slot
    0x0A, 104827; the end of property initialisation) and the stack-finished path (104854), which decrements `remainingPropsToInit`
    (Object.h:42) per finished kPropertyInitialize stack and dispatches OnInit when it reaches zero, and sets `initialized` when the
    kInitialize stack returns. So OnInit is a VM-internal method call at the object's birth, and the fork's lifecycle list entry
    "oninit" (FridaHooks.cpp:151-153) can never match at the SendEvent hook: the D-S1 exception for OnInit is structural, not a
    grant of the gate; only not binding the script (104820, 104827) would prevent it, and that is also where the VMAD properties are
    filled. (SkyrimVM's TESInitScriptEvent sink, SkyrimVM.h:104 at +0x90, is HYPOTHESIS the moment a loading reference's scripts
    are bound; unread tonight.)
- Where ADR-062's slice 1a gate sits today (fork m4-scripts-work in the worktree; Windows build): skyrim-platform FridaHooks.cpp
  OnSendEventEnter (:236-434), installed on `Offsets::Hooks::SendEvent` (game/Offsets.h:26-27, RELOCATION_ID(98077, 104800)) by
  InstallSendEventHook (:437-442). Its key: the handle (Gum argument 1) -> `policy->GetObjectForHandle(ActorCharacter, h)` then
  `(Reference, h)` (53512; IObjectHandlePolicy.h:34) -> TESObjectREFR::GetParentCell -> `g_hostedCells` (:65-66), filled by
  Frida::SetCellHosted (:215-223) from TESModPlatform::SetCellHosted (PapyrusTESModPlatform.cpp:1050-1054), which skymp5-client's
  HostService.tellPlatform calls at every grant and release (hostService.ts:152-160; `hostsCell` :204-206, `isHostedHere` :62-67).
  A world object (not an actor, with a cell, not the player's 0x14 nor a figure at or above 0xff000000) passes in a hosted cell;
  the lifecycle names pass anywhere (IsLifecycleEvent :149-162); a simulated actor passes where `Hosted::Is && !Puppets::Is`;
  otherwise ADR-044's chain and plugin admission (:164-183), the never-admitted list (:184-213), the ActiveEffect exemption for the
  player's own effects (ActiveEffect::VMTYPEID 142, ActiveEffect.h:31), the named leaves; a blocked event's name becomes ""
  (:432-434). The second gate, ScriptNatives.cpp OnNativeEnter (:257-386) on the 24 natives' entries (resolved by class and name
  from Hooks.cpp's BindNativeMethod recorder, :452-521, the VM's slot 0x18): its key is the self reference (Gum argument 2) ->
  GetParentCell -> Frida::IsCellHosted, actors by Hosted and Puppets, quests, globals and aliases census-only, the platform's own
  calls marked (PlatformCall). Both keys are "the self reference's cell is hosted here".
- What a gate at SendEvent keyed on the object's reference's cell host needs, piece by piece: handle -> form: 53512 with 0x3D and
  0x3E (exists); an alias handle (kind 0, mid < 0xFFFF) names its quest in the low 32 bits (53508), so an alias event reads as the
  quest's, no cell, every seat (today's behaviour by selfCell 0; reading the FILLED reference's cell instead, through the quest's
  refAliasMap, TESQuest.h:260 per papyrus-native-entries.md, is a possible refinement, HYPOTHESIS and out of scope); an active
  effect handle (kind 2) names its target actor in the low 32 bits (today ADR-031's rule reads the effect object); form -> cell:
  GetParentCell (exists; null for an unloaded reference, which falls to the no-cell rules); cell -> hosted: g_hostedCells (exists);
  the D-S1 list passed through (exists; "oninit" inert); the player's own quests, aliases, effects and UI scripts have no
  reference cell, so the cell rule never gates them (exists, ADR-044's rows stand); the player's own actor and the figures are
  excluded by id (exists). Nothing is missing AT the gate. What ADR-065 adds beside it is the state carry: when SetCellHosted flips
  true on a seat, that seat's scripts have already run their lifecycle handlers locally (D-S1) and hold their own state; the
  record's state must be applied over them (Q3's apply) and read back from the old host at the release.

Side effects (HYPOTHESIS): a gate decision is final at SendEvent time because the handler is queued, so a grant arriving between
the event and the handler's run changes nothing; blanking by name costs one failed lookup (104847) per attached object; an alias
relay of a blocked reference event still reaches the alias's quest script on every seat (a quest script reacting to OnCellAttach of
its aliased reference runs everywhere; the natives' hooks then filter its consequences by cell).

Suggested Frida trace: hook 104800 SendEvent (argument 1 the handle: kind = h >> 48, mid = (h >> 32) & 0xffff, id = h &
0xffffffff; argument 2 a BSFixedString*, read its c-string), 104875 the OnInit dispatcher (argument 1 a BSTSmartPointer<Object>*:
the object's type name and its handle at +0x20), 53963 the cell sink (argument 1: the event's reference form id and the attached
byte), 104794 ResetAllBoundObjects (the handle), 104804 DispatchMethodCall1 (the name and its return, 1 dispatched or 0). Lab
step: x-script-natives v7's premise, c1 hosting Bleak Falls Temple, c2 teleporting in as the guest; then c1 turns a pillar.
Expect on c2: OnInit rows from 104875 for the pillars' scripts with no "OnInit" row at 104800; OnCellAttach and OnLoad rows at
104800 for the pillars' handles (kind 0, mid 0xFFFF) and alias relays (kind 0, mid below 0xFFFF) for any quest-aliased reference;
the blanked rows (name "") returning 0 at 104804. On c1 the same plus OnActivate when the pillar turns.

What would falsify this: an "OnInit" string observed at 104800 (then OnInit does pass SendEvent on some path and the list entry
is live); an OnCellAttach or OnLoad with no SendEvent row for its handle (another delivery path); a 104804 return of 1 for a
blanked name (the block leaks); a reset event without the ResetAllBoundObjects call before it.

## What ADR-065 can rely on today

1. The per-object state the engine itself persists is exactly {flags, currentState, remainingPropsToInit, variables[]}
   (Object::Save 104249 reads nothing else); everything else is whole-VM runtime. A hand-off that carries those fields carries what
   a save carries per object.
2. Identity is the VMHandle (kind, mid, form id) plus the script's type name, and FindBoundObject(handle, name) is the engine's own
   find-and-reuse at load (104884 probes it before creating); the receiver's objects already exist by the time the grant lands,
   because the engine bound and OnInit'd them at cell load (D-S1).
3. CommonLib exposes every accessor the encoder and decoder need: GetVariableValue, GetPropertyValue, SetPropertyValue
   (IVirtualMachine.h:85-88), the positional `variables[]` with the type chain (Object.cpp:84-112), ObjectTypeInfo's layout
   (ObjectTypeInfo.cpp:83-153), Variable's getters and setters (Variable.h:62-79), Array (Array.h).
4. The SendEvent gate is complete for every event that passes SendEvent, which includes every lifecycle event but OnInit, and the
   alias and effect relays; it is keyed on the hosted-cell set the client already maintains (SetCellHosted at every grant and
   release).
5. The event delivery is asynchronous (queued FunctionMessages), so the gate's decision at SendEvent is the only decision.

## What it must build

1. The per-object serializer and deserializer of Q3 (a Rust wire message first, rule 12, with its validator in the same commit,
   rule 4): handle, type name, state, flags, variables by Variable::Save's nine cases, object references as (handle, type name),
   arrays capped at 128 by the engine, strings bounded by the wire; a count check against GetTotalNumVariables on apply.
2. The read moment on the owner: at the release (hand-off) for the hosted cells' attached scripts (ForEachBoundObject over the
   cell's references), and a cadence or a trigger for changes between hand-offs (the VM has no "variable changed" event; the
   natives' census is the nearest trigger; the kASSIGN opcode runs inside the tasklet and is not a hook point).
3. The apply moment on the new owner: at the grant, after FindBoundObject returns the object and its `initialized` bit is set
   (Object.h:40), else deferred (the object may still be in its property-init or OnInit stacks); the write through
   Variable::operator= and a direct state write; a decision on whether to run ResetAllBoundObjects (104794) first.
4. A rule for the old owner's in-flight stacks: they finish locally; their late natives are already filtered as "(not hosted)"
   once the release lands (ScriptNatives.cpp), so no VM surgery.
5. Engine-side state rewrites as observe points: ResetAllBoundObjects (104794) under a reset or a cell respawn on the host, so the
   record follows the engine, not the scripts alone.
6. A written note in ADR-063's D-S1 text that OnInit is VM-internal (104875) and cannot be gated at SendEvent: the exception is a
   fact of the engine, not a policy.
7. The server's record schema for script state and its restart scenario (rule 6): the other analyst's and numidium's side.

## Open reads (not done tonight)

The array table entry (105015) and the type table's per-type content (104699): what the save keeps per type (HYPOTHESIS: the
variable names and types for remapping an older script); SkyrimVM's own block's three registries (0x9cd020, 0x9cd700, 0x9cd8d0)
and 0x9a2b50 (handle from form id); the TESInitScriptEvent sink (SkyrimVM.h:104) as the bind moment; the bind policy's own
attachedScripts map (BSScriptObjectBindPolicy.h:42); GetHandleScriptsMovedFrom's semantics (HandlePolicy.h:25) and
MoveBoundObjects (104793), the engine's own "scripts follow a new handle"; EmptyHandle's value (53507); the string index width
(StringIndexSize kSmall u16 versus kLarge u32, IVMSaveLoadInterface.h:11-15); what the AttachedScript flag bit means.
