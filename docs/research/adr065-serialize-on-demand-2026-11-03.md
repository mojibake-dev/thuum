# ADR-065, the sending half (b): a change form serialized on demand, on the owner, while the reference is loaded (static read, 2026-11-03)

Written 12:3x UTC 2026-11-03 (04:3x PST; the re-analyst) for ADR-065 (PROPOSED, DECISIONS.md:4221 on: at its frame's end the
owner calls the engine's own serializers on the forms AddChange flagged). The lab has the receiving half: docs/engine/change-forms.md
D1 to D3 (runs 20261103-114726 and 20261103-120316) proved that a record the engine itself stashed at a cell's unload, written into
a fresh seat's changes map before the cell loaded, is applied by that seat's cell init as its own. This note reads how the same bytes
are produced for a LOADED reference, outside any save and outside the unload, so the owner can send them after TESForm::AddChange
(TESForm.h:133, slot 0x0A) at its frame's end.

The reading rule is change-forms.md's: a decompiler read is a HYPOTHESIS with its source; a vtable slot whose address equals a
CommonLib id's address is CONFIRMED-STATIC; CONFIRMED needs a run. Nothing below is from memory: every id came from lab/addr.py over
addrlib/versionlib-1-6-1170-0.bin (forward by `just addr <id>`, reverse by a scratch pass over the same loader, the Papyrus note's
method, docs/research/adr065-papyrus-state-2026-11-03.md), every slot from the headers under CommonLibSSE-NG/include/RE/, every body
from pyghidra-mcp on `/SkyrimSE-1.6.1170.0.exe.unpacked.exe` (image base 0x140000000; REA did not connect). Nothing in Ghidra was
renamed. Names beyond CommonLib's are HYPOTHESIS names and read as such.

## Method

1. The headers: BGSSaveGameBuffer.h, BGSSaveFormBuffer.h, BGSLoadGameBuffer.h, BGSLoadFormBuffer.h, BGSLoadFormData.h,
   BGSSaveLoadGame.h, BGSSaveLoadManager.h, BGSNumericIDIndex.h, TESForm.h (the virtuals :133-141, the members :353-358, the
   RecordFlags :54-89, the InGameFormFlag :107-116), TESObjectREFR.h (ChangeFlags :141-160, the save slots :217-224, Get3D2 :308,
   ShouldSaveAnimationOnUnloading :318, ShouldSaveAnimationOnSaving :319, AsExplosion :342, AsProjectile :343, the members :495-498),
   Actor.h (ChangeFlags :234-247, the save slots :275-279, currentProcess and movementController in its runtime data :651, :667),
   Projectile.h:216 (IsPermanent, slot 0xB4), ExtraDataTypes.h, ExtraSavedAnimation.h, TESDataHandler.h:76-88, Main.h, Offsets.h,
   Offsets_VTABLE.h.
2. The vtables, by id, read with read_bytes: VTABLE_TESObjectREFR[0] (190259) slots 0x0D to 0x13 and VTABLE_Actor[0] (207511) the
   same; VTABLE_BGSSaveFormBuffer (206723), VTABLE_BGSSaveGameBuffer (206725), VTABLE_BGSLoadFormBuffer (187480),
   VTABLE_BGSLoadGameBuffer (206715). Every REFR and Actor slot address equals the id change-forms.md C1 named (CONFIRMED-STATIC,
   table below).
3. The bodies: the stash 35570, the save walk 35599, the apply 35569, the decode 36080, the pack 36081, the buffer's ctor, header
   init, destroy and stream write (found by the xrefs of VTABLE_BGSSaveFormBuffer: one function, 36035, writes that vtable), the
   write helpers, the id encoder and decoder and the form-id map's four functions, TESObjectREFR's and Actor's CheckSaveGame,
   SaveGame, LoadGame and Revert, TESForm's defaults, ExtraDataList::SaveGame, the initial-data writer and its type decision, the
   animation block writer, the changes map's read, write, OR, set, erase and remove-flags, AddChange's inner, and the full-load
   FinishLoadGame pass. Two literal searches over the decompiled index found every reader of the kSaving bit and the one writer of
   the manager's +0x120 byte.
4. Two tables read from the image: the per-extra change-flag mask table ExtraDataList::SaveGame indexes (DAT_141fd3db0, 177 u32s)
   and the save-type-to-FormType table (DAT_1420121d0). The FormType-to-save-type table (DAT_143186db0) is filled at runtime and
   reads as zeros in the image.

### The id table (1.6.1170; RVA; how found)

| Function (CommonLib name where it has one) | RVA | id | Found by |
| --- | --- | --- | --- |
| TESObjectREFR::CheckSaveGame, SaveGame, LoadGame, InitLoadGame, FinishLoadGame, Revert, InitItemImpl (TESObjectREFR.h:217-223) | 0x2da4f0, 0x2da5c0, 0x2da720, 0x2daad0, 0x2dac30, 0x2daee0, 0x2d8730 | 19527, 19528, 19529, 19530, 19531, 19532, 19507 | slots 0x0D to 0x13 of 190259 (CONFIRMED-STATIC) |
| Actor::SaveGame, LoadGame, InitLoadGame, FinishLoadGame, Revert, InitItemImpl (Actor.h:275-279); Actor's slot 0x0D is TESObjectREFR's 19527 (no override) | 0x686710, 0x686de0, 0x687720, 0x687a80, 0x688aa0, 0x692560 | 37649, 37650, 37651, 37652, 37653, 37791 | slots 0x0D to 0x13 of 207511 (CONFIRMED-STATIC) |
| TESForm::CheckSaveGame default (returns 1, TESForm.h:136's comment), TESForm::SaveGame default, TESForm::FinishLoadGame default, TESForm::LookupByID | 0x1e0030, 0x1e0040, 0x1e0180, 0x1e01a0 | 14611, 14612, 14615, 14617 | Ghidra's imported names for the three defaults; 0x1e01a0 is unnamed there (LookupByID is CommonLib's inline, TESForm.h:210-220) and its decompile takes LockForRead and UnlockForRead on allFormsMapLock (400517) around the allForms (400507) walk, the inline in the binary (HYPOTHESIS); all four callees of 19527 and 19528 |
| TESForm::AddChange (slot 0x0A body), the forced entry, BGSSaveLoadGame's AddChange inner, RemoveChange inner, GetChange (BGSSaveLoadGame.h:78), GetChange inner | 0x1dff90, 0x1dffc0, 0x604320, 0x6044c0, 0x604400, 0x600a70 | 14607, 14608, 35576, 35581, 35577, 35505 | change-forms.md A1 to A4; CommonLib |
| BGSSaveFormBuffer ctor; BGSSaveGameBuffer ctor (the base); header init (id, flags, type, version); destroy (frees the data); stream write (9-byte header, lengths, data); record allocate | 0x626a90, 0x626e00, 0x626ce0, 0x626e20, 0x626ad0, 0x626760 | 36035, 36043, 36037, 36044, 36036, 36032 | 36035 by the xrefs of VTABLE_BGSSaveFormBuffer; the rest callees of the stash, the walk and the pack |
| BGSSaveGameBuffer::SaveDataEndian (BGSSaveGameBuffer.h:25); the buffer grow; form pointer as a 3-byte id; FormID value as a 3-byte id; string (u16 length, bytes); varint placeholder; varint patch; varint direct; byte insert for the patch | 0x627400, 0x627570, 0x627000, 0x626f80, 0x627090, 0x627170, 0x6272e0, 0x6271d0, 0x6276d0 | 36053, 36056, 36048, 36047, 36049, 36050, 36052, 36051, 36057 | CommonLib; callees of 19528, 12094, 35599 |
| the pack (buffer to record); deflate (zlib "1.2.7"); inflate; size code of a length; width of a size code; length write (buffer); length write (stream); length read; stored record to stream | 0x6283e0, 0x620390, 0x620510, 0x601810, 0x601830, 0x6018d0, 0x601850, 0x6019f0, 0x627c90 | 36081, 35932, 35933, 35522, 35523, 35525, 35524, 35527, 36077 | change-forms.md D1; callees of the pack, 36036, 36080 |
| GetFormType (save index to FormType, DAT_1420121d0); SetFormType (FormType to save index, "BGSSaveLoadFormInfo::SetFormType()" by its own error string) | 0x6202b0, 0x6202d0 | 35929, 35930 | callees of 36037, the pack and the apply |
| BGSNumericIDIndex::SetNumericID, GetNumericID (BGSNumericIDIndex.h:28, :22); the form-id map's index-or-insert, reverse lookup, ctor, reset, loader, writer; the loader's plugin-index remap | 0x620240, 0x6201f0, 0x602360, 0x602430, 0x602150, 0x6021e0, 0x6025b0, 0x6024e0, 0x6057e0 | 35928, 35927, 35554, 35555, 35550, 35552, 35559, 35558, 35596 | CommonLib; callees and xrefs of 35554 and 35599 |
| the load-side 3-byte id reader (buffer); the initial data writer; its type decision; the initial data reader and its body; IsCreated (id above 0xFEFFFFFF); is-a-reference-type (0x3D to 0x46); the save-parent-cell helper; TESObjectREFR::GetSaveParentCell (Ghidra import); the stash's cell-or-worldspace getter | 0x624fc0, 0x60e1c0, 0x60dac0, 0x60e5e0, 0x60e630, 0x1be0e0, 0x2dd500, 0x60f0c0, 0x2ed8b0, 0x2ed870 | 36000, 35715, 35708, 35716, 35717, 13783, 19546, 35719, 19817, 19816 | callees of 19529, 35570, 35569 |
| ExtraDataList::SaveGame; the ExtraSavedAnimation buffer getter (GetByType 0x41 plus 0x10); ExtraDataList::GetByType; InventoryChanges save; GetInventoryChanges (no init); the animation block; the graph holder's stream writer (takes the kSaving bit); the sequence name getter; the controller sequence writer; the queued sub-buffer write; the Havok block; NonActorMagicTarget's effect list | 0x16f450, 0x16a900, 0x179250, 0x239220, 0x2259d0, 0x2f5de0, 0x54b260, 0x15f920, 0x2dcc20, 0x625a80, 0x2db2c0, 0x5ad7a0 | 12094, 11974, 12329, 16142, 16039, 20098, 32879, 11730, 19541, 36017, 19534, 34076 | callees of 19528, 19527, 35715, 12094 |
| TESObjectREFR::ShouldSaveAnimationOnUnloading, ShouldSaveAnimationOnSaving (TESObjectREFR.h:318-319, slots 0x7A and 0x7B); Actor's chooser between them (reads kSaving) | 0x2f71b0, 0x2f7200, 0x66ae00 | 20115, 20116, 37362 | Ghidra imports; the kSaving literal search |
| the stash; the save walk; the apply; the apply's stack-buffer wrapper; the decode; the full-load LoadGame pass; the full-load FinishLoadGame pass (walks the manager's +0x318) | 0x603a70, 0x605880, 0x6037a0, 0x603700, 0x628210, 0x602d00, 0x603140 | 35570, 35599, 35569, 35568, 36080, 35566, 35567 | change-forms.md; xrefs of VTABLE_BGSLoadFormBuffer; the "+ 0x318" literal search |
| the changes map: read, write, OR, set flags, erase, remove flags; its hash insert, find, erase | 0x600930, 0x600e20, 0x600be0, 0x600d10, 0x600ec0, 0x600f70, 0x6010b0, 0x601330, 0x601660 | 35503, 35509, 35507, 35508, 35510, 35511, 35512, 35515, 35518 | the transplant scripts; callees of 35570 and 35599 |
| the suppress bit set-and-restore (TLS +0x670 bit 0); the version (returns 0x4e); the manager event handler that sets +0x120; BGSSaveLoadManager::Save_Impl and Load_Impl (Offsets.h:53, :55); the "FORMS:" log | 0x2cfe60, 0x610980, 0x613fd0, 0x60fd40, 0x610480, 0x601770 | 19378, 35740, 35775, 35727, 35728, 35519 | callees of the apply and the stash; the "+ 0x120) = 1" literal search |
| the reference-map registrations the stash makes for initial types 5 and 6 (cell map, worldspace map); the apply's three | 0x61ee70, 0x61e9b0; 0x61f090, 0x61eae0, 0x608c40 | 35907, 35902; 35908, 35903, 35636 | callees of 35570 and 35569 |
| the ExtraDataList revert (Revert's extra pass); the hash entry free | 0x173de0, 0x28ea80 | 12098, 18264 | callees of 19532 and the map reset |
| MemoryManager::GetSingleton, Allocate, Deallocate (MemoryManager.h:29, :36, :43) | 0x11bba0, 0xcc40c0, 0xcc4510 | 11141, 68115, 68117 | transplant-inject.js |
| singletons: BGSSaveLoadGame** (BGSSaveLoadGame.h:71), BGSSaveLoadManager** (Offsets.h:54), Main** (Offsets.h:383) | 0x317aba8, 0x317abf0, 0x31872c0 | 403330, 403340, 403449 | `just addr`; Ghidra's labels agree |
| vtables: VTABLE_BGSSaveFormBuffer, VTABLE_BGSSaveGameBuffer, VTABLE_BGSLoadFormBuffer, VTABLE_BGSLoadGameBuffer (Offsets_VTABLE.h:1991, :1992, :274, :1990) | 0x188e718, 0x188e7b8, 0x177cf38, 0x188e358 | 206723, 206725, 187480, 206715 | `just addr` |
| their slots: BGSSaveFormBuffer dtor, GetForm, GetReference, GetActor; BGSSaveGameBuffer dtor, GetForm, GetReference, GetActor; BGSLoadFormBuffer dtor, GetVersion; BGSLoadGameBuffer dtor, GetVersion | 0x626db0, 0x626df0, 0x626d30, 0x626d60; 0x627750, 0x6277f0, 0x627800, 0x6277e0; 0x1c1aa0, 0x624a90; 0x625520, 0x624fa0 | 36041, 36042, 36038, 36039; 36058, 36060, 36061, 36059; 13854, 35990; 36010, 35999 | read_bytes on the four vtables; the slot order is the headers' (BGSSaveGameBuffer.h:15-20, BGSLoadGameBuffer.h:11-14) |

## Q1. BGSSaveFormBuffer: layout, construction, what slot 0x0D decides, what slot 0x0E writes

**Candidate (confidence high for the layout and the header, high for the REFR body's order, medium for the per-type payloads).**
BGSSaveFormBuffer is a 0x30-byte stack object: a growable byte buffer (BGSSaveGameBuffer, 0x18 bytes) followed by the save
file's nine-byte change-form header in file order and the form pointer. The header is filled by 36037 from the changes map entry's
flags before CheckSaveGame runs; CheckSaveGame (slot 0x0D) may clear header bits; SaveGame (slot 0x0E) then appends the body for
the bits that survived, each flag's section in a fixed order, through SaveDataEndian and three id and length writers. The record the
lab transplanted is the pack (36081) of that buffer: it carries the type, the version, the lengths and the body, and NOT the header's
id or flags, which travel in the changes map entry (Value.flags and the key) and are rebuilt at a save by 36077.

**Evidence (the layout).** The ctor 36035 calls the base ctor 36043 (vtable VTABLE_BGSSaveGameBuffer, zeroes +0x08 and the u64 at
+0x10), then writes VTABLE_BGSSaveFormBuffer, zeroes the u16 at +0x18, the byte at +0x1a, the u32 at +0x1b, the u16 at +0x1f and
the pointer at +0x28. The header init 36037(buf, id, flags, formType, version) is `BGSNumericIDIndex::SetNumericID(buf+0x18, id);
*(u32*)(buf+0x1b) = flags; SetFormType(buf+0x1f, formType); *(u8*)(buf+0x20) = version`. The stream writer 36036 ORs the size code
into the top two bits of +0x1f and writes exactly nine bytes from +0x18 to the save stream, then the lengths and the data: so
+0x18..+0x20 is the file's header, refID (3), changeFlags (4), type (1), version (1), as UESP draws it. Every SaveGame reads the
flags as `*(u32*)(buf + 0x1b)` (19528, 14612, 12094). The pack 36081 reads the data pointer at +0x08, the length at +0x14, the
version at +0x20 and the type at +0x1f. So:

```
+0x00  vtable                      VTABLE_BGSSaveFormBuffer (206723); BGSSaveFormBuffer.h:11
+0x08  void*  buffer               BGSSaveGameBuffer.h:30 (engine heap, grown by 36056)
+0x10  u32    size                 :31 (capacity)
+0x14  u32    bufferPosition       :32 (bytes written)
+0x18  BGSNumericIDIndex formID    3 bytes (BGSNumericIDIndex.h:33-46); CommonLib's unk18 (BGSSaveFormBuffer.h:21) starts here
+0x1b  u32    changeFlags          the header's flags; the bits every SaveGame tests
+0x1f  u8     type                 low 6 bits the save-type index, top 2 bits the size code (set by 36036 or 36081)
+0x20  u8     version              0x4e today (35740)
+0x21  pad to +0x27                never written by the ctor
+0x28  TESForm* form               BGSSaveFormBuffer.h:23; the stash and the walk set it before CheckSaveGame
```

GetForm (slot 1, 36042) returns +0x28; GetReference (slot 2, 36038) and GetActor (slot 3, 36039) cast it; the base's versions (36060,
36061, 36059) return null (BGSSaveGameBuffer.h:18-20's comments). ExtraDataList::SaveGame (12094) calls slots 2 and 3 on the buffer to
learn the owner (its created-ref rule and its case 0x2D read them), so +0x28 must be set before 0x0D and 0x0E run (HYPOTHESIS that a
null owner is only degraded output and not a crash: case 0x2D dereferences the actor pointer without a check).

The mirror, for the other analyst: BGSLoadFormBuffer (BGSLoadFormBuffer.h:8-21) is BGSLoadGameBuffer (data at +0x08, the scrap heap
the decode allocates from at +0x10, capacity at +0x18, size at +0x20, position at +0x24: CommonLib's unk10, unk18, unk20,
bufferPosition, BGSLoadGameBuffer.h:24-29) plus BGSLoadFormData at +0x28 (formID +0x28, size +0x2c, uncompressedSize +0x30, form
+0x38, changeFlags +0x40, oldChangeFlags +0x44, flags +0x48, version +0x4b: BGSLoadFormData.h:23-32). The decode 36080 writes the
record's byte 1 to +0x4b and the data to +0x08; the apply 35569 writes the form to +0x38 and the entry's flags to +0x40.

**Evidence (the write helpers).** SaveDataEndian 36053(buf, data, size, ...) grows the buffer through 36056 (from the current
capacity, add max(capacity, 0x400) while under 0x4000, then 0x4000 at a time; MemoryManager::Allocate(size, 0, 0), copy, free the old
block; TLS +0x768 set to 0x5b around the allocation, a memory-context tag) and memcpys at +0x14, unless the byte at
BGSSaveLoadManager +0x120 (unk120, BGSSaveLoadManager.h:114) is nonzero: then no allocation and no copy, only the position advances
(a dry run; see Q2). 36048(buf, form) writes `SetNumericID(form ? form->formID : 0)` as three bytes; 36047 the same from a FormID
value; 36049 writes a u16 length then the bytes of a C string (no terminator). 36050 reserves one byte (it writes the sentinel 0x23)
and returns its position; 36052(buf, value, pos) patches it as a variable-width integer, `value << 2 | width`, one byte under 0x40,
two bytes under 0x4000 (36057 inserts the extra byte and shifts the tail), four under 0x40000000, else the log "Variable-sized value
%08X is too large to be stored."; 36051 writes such an integer directly (HYPOTHESIS name: not decompiled, inferred from its call
shape `36051(buf, count)` in 12094).

**Evidence (slot 0x0D, TESObjectREFR::CheckSaveGame 19527).** It calls TESForm's default (14611, returns 1), then: if bit 28
(kAnimation) is set and the reference has no ExtraSavedAnimation buffer (11974 on the extra list at +0x70: ExtraDataList::GetByType
with type 0x41, ExtraDataTypes.h:239, returning the BGSLoadGameSubBuffer at its +0x10, ExtraSavedAnimation.h:21, or a static null)
and Get3D2 (slot 0x70, TESObjectREFR.h:308) is non-null, it asks ShouldSaveAnimationOnUnloading (slot 0x7A) when the manager's
kSaving bit (BGSSaveLoadGame.h:62, +0x340 bit 2) is clear and ShouldSaveAnimationOnSaving (slot 0x7B) when it is set, and clears
bit 28 when the answer is no or there is no 3D. If flags carry kInventory or kLeveledInventory (0x08000020) and the reference has
no InventoryChanges (16039 returns null), it clears both. It returns 0 when inGameFormFlags bit 7 is set (kRefPermanentlyDeleted,
TESForm.h:115): nothing to save, and both the stash and the walk then erase the entry (35510).

**Evidence (slot 0x0E, TESObjectREFR::SaveGame 19528, the body in order).**

1. TESForm::SaveGame (14612): if bit 0 (kFlags), formFlags as u32 (TESForm.h:353) and inGameFormFlags as u16 (:355). Nothing else.
2. Bit 7 (kBaseObject): the base object's id through 36048 (3 bytes).
3. Bit 4 (kScale): refScale (TESObjectREFR.h:476, u16) times 0.01 as a float (4 bytes).
4. The extra data, when flags intersect 0xA6021C40 for a REFR or 0xA6061840 for an actor (type byte 0x3E): bits 31 kGameOnlyExtra,
   29 kEncZoneExtra, 26 kActivatingChildren, 25 kPromoted, 17 (kTeleportExtra for a door, kDismemberedLimbs for an actor), 12
   kLockExtra, 11 kAmmoExtra or kPackageExtraData, 6 kOwnershipExtra, and for a REFR bit 10 kItemExtraData, for an actor bit 18
   kLeveledActor instead. ExtraDataList::SaveGame (12094) takes the list's read lock, reserves a varint, and walks the list: an
   extra is written when the mask table DAT_141fd3db0[type] intersects the buffer's flags, and, if that mask has bit 30
   (kCreatedOnlyExtra), only when the owner reference is created (its id above 0xFEFFFFFF, 13783); type 0xA9 has an extra predicate
   (12821). Each written extra is its type byte then a per-type payload (the switch in 12094); the count is patched at the end.
   The mask table, read from the image (the rows that matter for a reference; the whole table is 177 entries, the rest zero):
   kLock 0x2A: 0x1000 (kLockExtra); kTeleport 0x2B: 0x20000; kEncounterZone 0x70: 0x20000000; kOwnership 0x21, kGlobal 0x22,
   kRank 0x23: 0x440; kCount 0x24, kHealth 0x25, kTimeLeft 0x27, kCharge 0x28, kLeveledItem 0x2E, kScale 0x2F, kWorn 0x16,
   kWornLeft 0x17, kReferenceHandle 0x1C, kPoison 0x3E, kEnchantment 0x9B, kSoul 0x9C, kHotkey 0x49: 0x400 (kItemExtraData);
   kPackageStartLocation 0x18, kFollower 0x1D, kAmmo 0x6A: 0x800; kLeveledCreature 0x2D: 0x40000; kActivateRefChildren 0x53:
   0x4000000; kPromotedRef 0x8C: 0x2000000; kLevCreaModifier 0x1E, kRadius 0x59: 0x40000000 (created only); and the kGameOnlyExtra
   group 0x80000000: kPackage 0x19, kTresPassPackage 0x1A, kRunOncePacks 0x1B, kGhost 0x1F, kMapMarker 0x2C, kMagicCaster 0x31,
   kNonActorMagicTarget 0x32, kPlayerCrimeList 0x34, kItemDropper 0x38, kFriendHits 0x44, kHeadingTarget 0x45, kInfoGeneralTopic
   0x4C, kHasNoRumors 0x4D, kTerminalState 0x4F, kCanTalkToPlayer 0x54, kObjectHealth 0x55, kModelSwap 0x58, kFactionChanges 0x5B,
   kActorCause 0x5D, kCombatStyle 0x65, kOpenCloseActivateRef 0x68, kPackageData 0x6C, kSayTopicInfoOnceADay 0x6F, kSayTopicInfo
   0x71, kGuardedRefData 0x78, kAshPileRef 0x85, kFollowerSwimBreadcrumbs 0x87, kSceneData 0x92, kAttachedArrows3D 0x98,
   kForcedTarget 0x9D, kFlags 0xA0, kRefrPath 0xA1, kForcedLandingMarker 0xA4, kInteraction 0xA9, kGroupConstraint 0xAE,
   kScriptedAnimDependence 0xAF, kCachedScale 0xB0 (and 0x80000400 for kAliasInstanceArray 0x88, kTextDisplayData 0x99,
   kUniqueID 0x9F, kUnk0C 0x0C). The lock's payload (case 0x2A): level (u8), the flags byte at the lock data's +0x10 (u8), the key
   as a 3-byte id, two u32s. The NonActorMagicTarget's (case 0x32): the target form at +0x28 as a 3-byte id, then 34076's list of
   active effects behind a varint count.
5. The inventory, when flags intersect 0x08000020: InventoryChanges' save (16142) on the existing changes, or on a freshly made one
   (TESObjectREFR::MakeInventoryChanges) if none exists: a mutation of the form, unreachable in practice because 0x0D cleared those
   bits when no changes existed (HYPOTHESIS: a race between 0x0D and 0x0E is the only way in).
6. Bit 28 (kAnimation): if an ExtraSavedAnimation buffer exists, it is written whole (36017); else a varint is reserved, the graph
   block 20098 is written, and the varint is patched with the block's length. 20098 hands the kSaving bit to the graph holder's
   stream writer (32879); when that writes nothing (its return 0), it writes the sequence name (11730, through 36049) and the
   controller sequence's state (19541 with -1.0f), then the marker u32 0x2A and one bool per biped slot (two).

The initial data (35715, called before 0x0E by both the stash and the walk) decides its kind with 35708: for a reference type
(19546: formType in 0x3D to 0x46), kind 5 if created, 6 if flags carry kCellChanged or kPromoted (0x02000008), 4 if kMoved or
kHavokMoved (6), else 0 (nothing). Kind 4 is the save parent cell (35719) as a 3-byte id, the location (REFR +0x54, OBJ_REFR.location,
TESObjectREFR.h:79, three floats) and the angle (+0x48, :78, three floats): 27 bytes; kind 5 adds the base object's id and a flags
byte (bit 0 always, bit 1 from 19593, bit 3 from 19596): 31; kind 6 adds the editor location's cell id and two u16 grid coordinates
(13678): 34, or logs "Could not get editor location for reference". Kinds 1 to 3 are CELL forms' (type byte 0x3C): a u16 index from
the worldspace map (35554 on the manager's +0x30, BGSSaveLoadGame.h:85) and grid bytes. After the switch, for a reference whose flags
carry kHavokMoved (4): the stored sub-buffer if the 3D is gone and one exists, else a varint-prefixed Havok block from 19534. This is
change-forms.md C2's "initial data and Havok data come just before", now with the kinds.

The lab's record, read against this (run 114726; the inject probe carries the bytes): `00 4e 24 00` is type 0 (REFR: the inverse
table DAT_1420121d0 reads 0x3D, 0x3E, 0x3F, 0x41, 0x42, 0x43, 0x3C, 0x4C, 0x4D, 0x2B, 0x18, 0x19, 0x1A, 0x1B, 0x1C, 0x1D for
indices 0 to 15, so REFR 0, ACHR 1, PMIS 2, PGRE 3, PBEA 4, PFLA 5, CELL 6, INFO 7, QUST 8, NPC_ 9, ACTI 10, TACT 11, ARMO 12,
BOOK 13, CONT 14, DOOR 15; CONFIRMED-STATIC for those sixteen), version 0x4e, length1 36, length2 0. The body: `08` (varint, two
extras), `32 4e3a7a 00` (kNonActorMagicTarget: the door's own id as type 1, an empty effect list), `2a 32 01 000000 00000000
00000000` (kLock: level 50, flags 1, no key, two zero u32s), `3c` (varint, 15 bytes of animation), `00 0500 Close 00 2a000000
00 00` (32879's empty byte, the sequence name "Close", 19541's byte, the 0x2A marker, two absent bipeds). No field of it is a clock.

**Side effects (HYPOTHESIS).** 0x0D and 0x0E on a loaded reference allocate the buffer's data on the engine heap (36056) and read
the extra list under its read lock; they write nothing into the form except the inventory case above. The id writer inserts into
the manager's form-id map for plugin ids (Q2). The stash's and the walk's other side effects (the map entry's fix-up, the
reference-map registrations) belong to them, not to 0x0D and 0x0E.

**Suggested Frida trace.** The recipe in Q4 is the trace: it prints the nine header bytes, the body, the pack's record and its
FNV-1a. Alongside, for the first run, hook 36053 (SaveDataEndian: log size and the buffer's position), 36048 (the id writer: log the
form id and the three bytes) and 35928 (SetNumericID: log the id and whether the map path was taken) while the recipe runs, keyed
by the buffer's address, to see the body assemble. Lab step: the capture probe's `lock 50` on 0xe3a7a in the Sleeping Giant.

**What would falsify this.** A header that is not nine bytes from +0x18 (a stream write of another length in 36036); a SaveGame
that reads its flags elsewhere than +0x1b; the lab's record decoding differently against the body order above (for instance a
lock payload that is not 13 bytes); 0x0D returning 0 for a loaded, undeleted door.

## Q2. What SaveGame reads from global state, and what must hold for 0x0E outside a save

**Candidate (confidence high).** Outside a save, 0x0D and 0x0E need four things: the two save managers to exist (BGSSaveLoadGame at
403330 for the form-id map, BGSSaveLoadManager at 403340 for the dry-run byte), the manager's kSaving bit clear (it changes the
record's content in three places), the dry-run byte at BGSSaveLoadManager +0x120 zero (else no bytes are copied and the buffer's
data pointer stays null), and a form that passes AddChange's own gates (not kTemporary, not id 0). The form-id map at +0x298 is the
"refid table": it is consulted only for ids whose load index is neither 00 nor FF and for id 0, it inserts on a miss (so a live
serialization grows it exactly as a save would), its indices are seat-local, and index 0 is the null form on every seat.

**Evidence (the readers of kSaving).** The literal search for the bit-2 read of +0x340 over the decompiled index finds three
functions, and the animation block adds a fourth by value: (1) TESObjectREFR::CheckSaveGame (Q1: the choice of slot 0x7A or 0x7B);
(2) Actor::SaveGame 37649: `if (movementController != 0 && kSaving) write 1 and call its slot 0x12 on the buffer, else write 0`
(Actor.h:667's movementController at +0x150 by the runtime-data accessor, the memory note commonlib-runtime-data-accessor); (3)
37362, an Actor helper that answers ShouldSaveAnimationOnSaving under kSaving and ShouldSaveAnimationOnUnloading otherwise; (4)
20098 passes `(flags >> 2) & 1` to the graph holder's stream writer 32879. So a record produced with kSaving set is not the record
the unload produces: for the lab's door the animation decision and block may differ, for an actor the movement block is present.
The unload stash runs with kSaving clear (35599 alone sets it, `|= 4` at its start and `&= ~4` at its end). For byte equality with
D1's record, and for the receiving seat's LoadGame to see the unload-shaped record it already consumes, the on-demand serializer
must run with kSaving clear, which is the normal state.

**Evidence (the dry-run byte).** Every writer (36053, 36048, 36049, 36050, 36052, 36056) tests `*(u8*)(BGSSaveLoadManager::Singleton
+ 0x120) == 0` before copying or allocating; when nonzero they only advance +0x14, and 36036 writes zero-filled placeholders of the
right length to the stream. One function writes it: 35775, an event handler on the manager, sets it to 1 when the event's state
(+0x10) is 0 and clears it (and sets +0x33c to 1) when the state is 2 (HYPOTHESIS: the save data system's availability; the handler
also tears down the manager's file list). In the lab it reads 0 (saves work). A serializer that ignores it would read a null data
pointer after a successful-looking 0x0E.

**Evidence (the form-id map).** BGSNumericIDIndex::SetNumericID (35928): `if (id == 0 || (id >> 24 != 0 && id >> 24 != 0xff)) value
= 35554(mgr + 0x298, id); else value = (id < 0x1000000 ? 0x400000 : 0x800000) | id;` then the three bytes big-endian (bits 16..23,
8..15, 0..7). So a game-file form with load index 00 is type 1 with its 22-bit id (the door 0xe3a7a became 4e 3a 7a, as D1 read),
a created form (FF) is type 2, and everything else, a plugin's form or a null, is type 0 with an index. 35554(map, id): unless the
id is created, look the id up in the forward map (BGSSaveLoadFormIDMap unk00, BGSSaveLoadGame.h:20); on a miss, take the counter
(unk60, :22), insert (id, index) forward and (index, id) in the reverse map (unk30, :21), bump the counter, return the index. The
map's ctor 35550 and reset 35552 zero both maps, set the counter to 0 and call 35554(map, 0): index 0 is the null form, seeded at
every reset, and the file's table (written by 35558 after the forms: count minus one entries from index 1; read back by 35559,
which reseeds the null, remaps each plugin id through 35596 and assigns indices from 1 in file order) never carries it. So three zero
bytes mean "no form" on every seat (CONFIRMED-STATIC by the seeding; the lab's lock key `000000` is that), and any other type-0
index is this seat's and this session's: a fresh seat assigns indices in first-encounter order, a seat that loaded a save holds the
file's order. GetNumericID (35927) reverses: types 1 and 2 directly (`0xff000000 | value` for type 2, the 22 bits for type 1), type
0 through 35555(mgr + 0x298, index), which returns 0 on a miss. The load-side buffer reader 36000 returns a "nonzero bytes, zero
form" flag that TESObjectREFR::LoadGame (19529) ignores: a missing index resolves to null, the base object stays as it was, the lock
key becomes none: silent, not a crash.

**Evidence (the other globals).** TLS +0x768 (a memory-context tag the stash, the walk, the map write and the allocations set to
0x5b and restore) is bookkeeping. TLS +0x670 bit 0 (the suppress bit AddChange refuses under, change-forms.md A3) is set by the apply
around LoadGame (19378) and not read by 0x0D or 0x0E. The version is a constant: 35740 is `return 0x4e` (CONFIRMED-STATIC). The
stash's own gates (TESDataHandler.clearingData at +0xDA5 by arithmetic over TESDataHandler.h:76-88 from the runtime block's start
at 0xDA0, HYPOTHESIS; Main.resetGame at +0x11, Main.h's member list; kLoading unless forced) are the stash's, not 0x0E's, but a
serializer should refuse under them for the same reasons the engine does.

**What happens when they do not hold.** A null BGSSaveLoadGame: 35928 dereferences +0x298 for any plugin or null id and crashes;
unreachable after startup. A null BGSSaveLoadManager: every writer dereferences +0x120; unreachable likewise. The dry-run byte set:
a zero-length or null-data buffer, no crash in the engine's own callers, a null read in a naive one. A wrong type byte at +0x1f on
the sending side: the receiver's apply compares the record's type (35929 on byte 0) to the live form's and refuses with "(Load
Error) Form ... was saved with form type %s, but currently has form type %s" and erases the entry (35569). A type-0 index the
receiver does not hold: null, silently.

**Side effects (HYPOTHESIS).** The form-id map grows by one entry per new plugin id the body references; the next real save writes
the grown table, which is what a save would have done anyway. No other global changes.

**Suggested Frida trace.** At attach on a seat: print the manager's +0x340, the manager's +0x120, the form-id map's counter (mgr +
0x298 + 0x60) and the null seed (35555(mgr + 0x298, 0) should return 0 and the forward lookup of 0 should hit index 0). Hook 35554
on the map at +0x298 and log (id, returned index, miss or hit) across a session: the per-seat index order is the fact ADR-065's
wire has to carry. Lab step: any; the Riverwood AI alone drives stashes.

**What would falsify this.** A fourth or fifth reader of kSaving in 0x0E's call tree that the literal index missed (the index
names the singleton as DAT_14317aba8; a reader through a copied pointer would not match); a counter that does not start at 1 after
the seed (then "000000" could name a real form on some seat); 35554 refusing to insert outside a save (then a plugin id would fail
to encode live).

## Q3. Why the unload's stash cannot serve a live form, the entry's shape, scratch buffer versus copy-out

**Candidate (confidence high).** The stash 35570 can run on a loaded reference (none of its gates tests the 3D or the cell's state),
but it does the wrong thing for one: it writes the record INTO the changes map entry, and an entry with a record is frozen. AddChange's
OR (35507) skips an entry that holds a record, the remove-flags path (35511) skips it too, the real unload then refuses it ("is
unloading, but it already has a buffer. This unload will be skipped."), and the next save writes the stored record (35599's 36077
branch) instead of the live form. A copy-out (call the stash, read the entry, copy, write the entry back with record null, free the
record) works only if nothing marks the form between the stash and the restore, and it still performs the stash's reference-map
registrations for moved refs. A scratch BGSSaveFormBuffer on the owner's stack never touches the map and is five calls; it is the
cheaper route and the safe one.

**Evidence (the entry).** BGSSaveLoadChangesMap (BGSSaveLoadGame.h:94, the pointer at the manager's +0x330) holds a hash table at
+0x08 (capacity at +0x0c, end sentinel at +0x18, entries at +0x28) under a BSReadWriteLock at +0x30. An entry is 0x20 bytes: the
form id at +0x00, the flags at +0x08, a u32 at +0x0c, the record pointer at +0x10, the chain at +0x18. The Value the read (35503)
copies out and the write (35509) takes is 16 bytes: flags, the u32, the record pointer, the shape transplant-capture.js and
transplant-inject.js already use (change-forms.md D5 is now a read, still HYPOTHESIS until a dump). The record is 36081's: byte 0 the
save-type index in its low six bits and the size code in the top two, byte 1 the version, then length1 and length2 of the code's
width (35522: one byte under 0x100, two under 0x10000, else four), then the data; length2 is the inflated size when the data was
deflated (35932: zlib, only when the setting byte DAT_1420122a0 is set and the data is 32 bytes or longer and shrinks) and 0 when raw.
The pack allocates it with 36032 (MemoryManager::Allocate(size, 0, 0)), which is why the inject allocates with the engine's heap and
the apply frees with MemoryManager::Deallocate.

**Evidence (the stash's sequence and its refusal).** 35570(mgr, form, force): refuse under kLoading unless forced; refuse while
TESDataHandler.clearingData (+0xDA5) or Main.resetGame (+0x11) is set; refuse a kTemporary form (formFlags bit 14, TESForm.h:83);
refuse a reference that is a projectile that is not permanent (AsProjectile slot 0x8F, Projectile::IsPermanent slot 0xB4,
Projectile.h:216), an explosion (AsExplosion slot 0x8E) or kWantsDelete (inGameFormFlags bit 0, TESForm.h:109). Read the entry
(35503): no entry, nothing to do; an entry with a record, the "already has a buffer" log and nothing. For an actor with a
currentProcess (+0xF8), call its slot 0xF2 first. Then: 36035 ctor, 36037 header from the entry's flags with the live formType and
35740's version, +0x28 = form, slot 0x0D; if false, erase the entry (35510); else remove from the entry the bits 0x0D dropped
(35511, which also erases an entry left with no flags unless the form is created, and returns 1 when it erased: the stash then
stops); 35715 with the reduced flags; slot 0x0E; 36081 into the Value's record; 35509 the Value back; for initial kinds 5 and 6,
register the reference in the cell or worldspace reference maps (35907 or 35902 on the manager's +0xC8 or +0xF8) and, for kind 6, the
manager's +0xD0; 36044 destroys the buffer. The save walk (35599) does the same with two differences: the header flags are the live
entry's and the fix-up goes both ways (35508 adds bits 0x0D set, 35511 removes bits it cleared), and the buffer goes to the stream
(36036) instead of the map, with the stored-record branch (36077) for entries the unload already filled.

**Evidence (the freeze).** 35507(map, id, bits): under the write lock, find the entry; if its record pointer is nonzero, unlock and
return without ORing; else OR the bits and write the entry. 35511: the same early exit for a record-bearing entry. So from the moment
an entry holds a record until the apply consumes it (35569 writes the entry back with the record freed and nulled), the engine's own
marks for that form are dropped, and its save carries the stale record.

**Side effects (HYPOTHESIS).** The copy-out route: the entry's flags are reduced to what 0x0D kept (the stash's fix-up), the cell or
worldspace reference maps gain the reference for moved refs (an insert the real unload would make again; 35907's idempotence is
unread), and the window of frozen marks. The scratch route: none beyond Q1's and Q2's.

**Suggested Frida trace.** To see the freeze rather than argue it: on a seat, pick a loaded door, call 35570(mgr, door, 1) from a
hook on the game thread, then `lock 50` it and read the entry (35503): the flags will lack kLockExtra and the record will be the
pre-lock one; then write the entry back with the record null and free the record, mark again, and read: the flags carry it. Lab step:
the capture probe's `lock 50` with the extra stash call placed before it.

**What would falsify this.** 35507 ORing into an entry that has a record (then the freeze is only in 35511 and the stale-record save,
a smaller hazard); the real unload replacing a stored record instead of skipping; a stash gate that tests the 3D (then the copy-out
route is simply refused for a loaded form).

## Q4. The recipe: bytes for a loaded reference on demand

**Candidate (confidence medium until the lab read below).** On the game thread, with kSaving and kLoading clear and the dry-run byte
zero, a scratch BGSSaveFormBuffer run through the stash's own sequence minus the map produces the same bytes the unload stash stores,
without touching the changes map, the suppress bit or the manager's flags.

**The sequence (every call an engine function by id; the Frida types in brackets).**

```
premises (refuse on any failure, print why):
  mgr  = *(ptr)(base + 0x317aba8)            403330, BGSSaveLoadGame**;  non-null
  sm   = *(ptr)(base + 0x317abf0)            403340, BGSSaveLoadManager**;  non-null
  (u32(mgr + 0x340) & 6) == 0                kLoading, kSaving clear (BGSSaveLoadGame.h:61-62)
  u8(sm + 0x120) == 0                        the dry-run byte (BGSSaveLoadManager.h:114)
  u8(TESDataHandler + 0xDA5) == 0, u8(Main + 0x11) == 0   clearingData, resetGame (the stash's gates; Main** at 403449)
  form: u32(form + 0x10) bit 14 clear (kTemporary), u16(form + 0x18) bit 0 clear (kWantsDelete), bit 7 clear (kRefPermanentlyDeleted)
  value = {0, 0, NULL}; found = 35503(u64(mgr + 0x330), formId, &value)   [bool(pointer, uint32, pointer)]
  found, and value.record == NULL             an entry with a record is the engine's own stash: copy that record instead, never re-serialize
  flags = value.flags

build:
  buf = Memory.alloc(0x30)
  36035(buf)                                  [pointer(pointer)]      the ctor (calls the base ctor 36043)
  36037(buf, formId, flags, u8(form + 0x1a), 35740())   [void(pointer, uint32, uint32, uint32, uint8)]   the nine-byte header
  buf.add(0x28).writePointer(form)                                   the owner, for GetReference/GetActor
  ok = vtable(form)[0x0D](form, buf)          [uint8(pointer, pointer)]   19527 for a REFR, the same for an actor
  if !ok: destroy (36044) and report "nothing to save" (the engine would erase the entry; we leave it)
  flags2 = u32(buf + 0x1b)                                           the bits 0x0D kept; record (flags & ~flags2) as "dropped"
  kind = 35715(buf, form, flags2)             [uint32(pointer, pointer, uint32)]   the initial data and the Havok block
  vtable(form)[0x0E](form, buf)               [void(pointer, pointer)]   19528 or 37649

read:
  header = bytes(buf + 0x18, 9)              (the size code is not yet in +0x1f; 36081 or 36036 sets it)
  body   = bytes(u64(buf + 8), u32(buf + 0x14))
  rec    = Memory.alloc(8); 36081(rec, buf)   [void(pointer, pointer)]   the record, on the engine heap
  record = bytes(*rec, 2 + 2 * width(code) + length1)   as transplant-capture.js's recordHeader reads it
  print {formId, flags, flags2, kind, header, body, record, fnv1a(record), threadId}

restore:
  68117(11141(), *rec, 0)                     MemoryManager::Deallocate, the record is ours (MemoryManager.h:43)
  36044(buf)                                  [void(pointer)]   frees the buffer's data; the stack object itself is Frida's
```

What travels, as the capture and inject already do it: the record (the pack's bytes), the entry's flags (flags2 is what the engine
would have left in the entry after its fix-up; D1's 0x90001000 was that), and the form id. The receiver's write is unchanged
(transplant-inject.js: allocate on the engine heap, 35509 the Value {flags2, 0, record} before the cell loads).

**It must not touch.** The changes map (no 35509, 35507, 35508, 35510, 35511 on the live entry; the reduced flags are reported, not
written back, so the engine's own stash at the real unload still sees the full entry); the manager's flags (never set kSaving to make
0x0D "save-shaped": the receiver consumes unload-shaped records, D2); the suppress bit TLS +0x670 (it is the apply's, and setting it
would silence the frame's own marks); the reference maps (+0xC8, +0xD0, +0xF8: the stash registers moved references there because
its record will be applied by THIS engine later; a record leaving the seat needs no local registration, and the receiver's apply
registers on its side, 35908 and 35903). The memory-context tag TLS +0x768 is optional.

**Thread.** 0x0E reads live state under the extra list's read lock only; the stash runs it on the main thread from the cell's unload
(19113), and the walk from the save on the main thread. The recipe runs where the trigger runs: a hook on 35576 fires on the marking
thread, which for a console `lock` and for the AI's marks is the main thread (HYPOTHESIS; the row prints the thread id and the stash
row at the unload prints its own for comparison). In production the seat is Skyrim Platform's OnUpdate, a Papyrus native the game calls
each frame on its main thread, where TESModPlatform natives run (the memory note skyrim-platform-thread-shape): a native that takes a
form and returns {flags, bytes} is this recipe in CommonLib types, with REL::Relocation for 36035, 36037, 36044, 36081, 35715, 35503
and 35740 (none of them has a CommonLib binding; BGSSaveFormBuffer itself does, BGSSaveFormBuffer.h:7-25).

**Side effects (HYPOTHESIS).** The form-id map grows for plugin ids in the body (Q2). The inventory case of 0x0E can create an
InventoryChanges on a form that had none (Q1 item 5), only in a race. Nothing else: no mark, no map write, no registration.

**Suggested Frida trace (the proof the brief asks for: a live door locked on c1, its bytes produced on demand, compared byte for
byte against the unload stash's record from run 114726).** One script, serialize-on-demand.js (a name), params FORM (0xe3a7a),
TRIGGER (0x1000, kLockExtra). Hooks: 35576 (BGSSaveLoadGame's AddChange inner, as change-census.js v3 hooks it): in onLeave, when
args[1]'s id is FORM, the flags intersect TRIGGER and the return is 1, run the recipe once on that thread and print its rows, then
read the entry again (35503) and print its flags and record pointer (expected: flags unchanged by us, record still null); 35570 (the
stash) and 35509 (the map write) as transplant-capture.js hooks them, so the engine's own record for FORM prints at the purge; and a
compare row when both exist: equal, or the first differing offset and which section it falls in (header, extras, animation, by the
varint boundaries). Arguments to log: the entry flags before and after, flags2, kind, the nine header bytes, the body length, the
record hex and FNV-1a, the thread id of the recipe and of the stash. Lab steps: the capture probe's (solo-start, coc
RiverwoodSleepingGiantInn, tgm, prid 000e3a7a, getlocked, the attach, `lock 50`, getlocked, coc riverwood, pcb), with the attach
before the lock; the on-demand record is produced at the lock, the engine's at the purge. Expected: the on-demand record equals
114726's `004e240008324e3a7a002a320100000000000000000000003c000500436c6f7365002a0000000000` (FNV-1a 0x4ebbb261) byte for byte, and
the entry after the recipe still reads flags 0x90001000 with a null record. The compare row is the claim; whether lab-api's assert
grammar can read a trace row is not checked here (the scenario's log-count claims cannot), so the first read is a run read.

**What would falsify this.** (1) 0x0D returns 0 live while the purge produces a record: a gate the static read missed. (2) The entry
after the recipe differs (flags reduced or a record present): the recipe touched the map through a path not read here. (3) Bytes
differ in the extras section: the live state differs from the unload's (the NonActorMagicTarget's effect list, the lock's two u32s),
and the record is still valid but not identical; the receiver would still apply it. (4) Bytes differ only in the animation section:
32879 writes graph data while the 3D is loaded and not at the unload (or the reverse); then "identical" is the wrong claim and the
comparison should stop at the varint before the animation block, with the receiver's apply of the live record as the real test. (5) A
crash in 0x0E: the recipe ran off the main thread or the dry-run byte was set. (6) A record that the inject refuses or that c2's apply
does not take: the pack's size code or the version differ from the stash's (they come from the same functions, so this would mean a
state the pack reads that the recipe did not set).

**The inverse's dependencies, for (c), in one paragraph.** LoadGame (slot 0x0F) on a 3D-loaded copy depends on what the apply (35569)
sets up and what it defers: the suppress bit (19378) around the call so the setters inside 0x0F do not mark; a BGSLoadFormBuffer the
decode (36080) filled (version at +0x4b, data at +0x08) with the form at +0x38 and the entry's flags at +0x40; the initial data read
(35716 then 35717) before 0x0F, which for kinds 4 to 6 carries a cell id and a position that a loaded reference cannot take by a
raw write (what 35717 does to a loaded one is unread); the id decode through 35927, direct for types 1 and 2 and through this seat's
+0x298 reverse map for type 0 (index 0 null everywhere, the rest seat-local, Q2); and after 0x0F the apply sets formFlags bit 21
(kStillLoading, TESForm.h:89) and pushes a 0x28-byte BGSLoadFormData copy onto the manager's +0x318 array, which only the full-load
pass 35567 drains in this read (kInitingForms set, InitLoadGame slot 0x10 per entry, then FinishLoadGame slot 0x11, kStillLoading
cleared, entries whose BGSLoadFormData flags carry kCellChanged re-marked with 8 and re-stashed through 35570 forced); the cell-init
path's drain of +0x318 is unread, and D3's door worked, so either something else drains it or a door's 0x0F needs no finish. Revert
(slot 0x12, 19532) is the engine's return to the plugin's state before a different record is loaded: it reads the OLD flags
(BGSLoadFormData +0x44) and undoes per category (ResetInventory or slot 0x8A for the inventory, SetOpenState for the open state, the
extra list's revert 12098, a forced kAnimation mark through 14608 when the data's flags carry kRevertOnly (BGSLoadFormData.h:16) and
a graph exists), so a mid-game apply to a loaded copy is Revert(old) then LoadGame(new), the full-load pass's shape (35566, unread
here), and change-forms.md C4's risk stands: no engine path does it to a loaded reference. The other analyst's question.

## What ADR-065 can rely on today

- The engine's own serializer is callable outside a save on a loaded form with a stack buffer: five engine functions (36035, 36037,
  the form's slots 0x0D and 0x0E, 35715) and two to read and free (36081, 36044), all resolved for 1.6.1170, none needing the
  changes map. Static; the lab read above is its proof.
- The record format and the nine-byte header are read from the code and match D1's bytes: type and size code, version 0x4e (a
  constant), two lengths of the code's width, the body; the header's id and flags live in the entry, not the record. The receiver's
  write (D3) needs exactly {form id, flags, record}, which the recipe produces.
- The REFR body's order and the per-flag sections (Q1), the extra mask table, the initial data kinds, and the Actor block's shape
  (C3 holds: process level, a u32, the REFR body, then the actor's fixed fields and blocks).
- The id encoding: load index 00 is direct (type 1), created is direct (type 2), three zero bytes are null on every seat (the seeded
  index 0). Game-file references' records are portable as D3 proved; a record whose body carries only such ids needs no translation.
- The invariants a serializer must hold: kSaving clear (three readers plus the animation block change the bytes under it), kLoading
  clear, the dry-run byte zero, the map untouched, the suppress bit untouched.
- The freeze: an entry that holds a record stops the engine's own marks (35507 and 35511 skip it). A seat never leaves a record in a
  loaded form's entry; the inject writes only before the cell loads (D3's premise), and the apply consumes it.

## What it must build

1. The native: TESModPlatform.SerializeChangeForm(form) or its Rust-fronted equivalent on the OnUpdate thread, the recipe in CommonLib
   types with REL::Relocation for the seven ids, refusing under the premises and returning {flags2, record} or the refusal's reason;
   T1 proves the relocations resolve, the lab read above proves the bytes.
2. The frame collector: the (form, flags) marks of the frame from a native hook on 35576 (filtered in native before JS, rule 9), the
   coalesced set serialized once at the frame's end, the kHavokMoved streams (change-forms.md B3, B6) rate-limited by the owner, the
   at-rest record at the stream's end.
3. The id translation for plugin forms: every type-0 index in a record is seat-local. The wire needs, per record, the sender's
   (index, form id) pairs for the type-0 ids its body carries (the sender reads them back through 35927 on each 3-byte field it
   wrote, or logs 35554's inserts during the serialization), and the receiver needs an install step before its apply: seed its own
   +0x298 with those pairs (35554 gives it the index its map assigns, which may differ from the sender's) and rewrite the record's
   3-byte fields to its indices, or carry the body in a sender-neutral form (a form-id list beside the record and a rewrite on both
   ends). Which fields are ids is known per extra type from 12094's switch and per form class from its SaveGame; a generic rewrite
   needs that table. Load-order identity across seats (the lab's load-order rule) makes the pairs meaningful.
4. The owner-side rule for a form whose entry already holds a record (the engine stashed it: the cell is unloading on the owner): send
   that record as is, never re-serialize, and never clear it; the next host of the cell gets the record the owner's engine made.
5. The receiver's mid-game path, (c): Revert then LoadGame on a loaded copy, or the engine's own apply at the next cell init with the
   load-time state in between; the other analyst's note decides.
6. The lab pieces: serialize-on-demand.js as above; a scenario comparing the two records (a trace-row claim if lab-api's grammar can
   read one, else the run read); a second read on an actor (37649's block and the kSaving-gated movement block absent) and on a moved
   prop (kind 4 initial data and the Havok block from 19534).

## Open reads (not done tonight)

- The cell-init path's drain of the manager's +0x318 (which function runs InitLoadGame and FinishLoadGame for records 35569 applied
  outside a full load, and clears kStillLoading); 35566's revert-then-load sequence.
- 35717 (the initial data reader) on a loaded reference: what kinds 4 to 6 do to a reference with 3D.
- 32879 (the graph holder's stream writer): when it writes graph data (the kSaving argument's effect, the 3D's presence), the one
  section where the on-demand bytes could differ from the unload's.
- 35775's event (which BSSaveDataEvent or BSSystemEvent state sets the dry-run byte) and whether the lab's seats ever see it.
- 35907's and 35902's idempotence (the copy-out route's double registration), moot if the scratch route is taken.
- The Actor block's field names (37649's fixed fields at +0x278, +0xEC, +0x110 and the four modifier blocks) against Actor.h's
  runtime data, for the actor record's size and for ADR-065's per-field validation.

## Run 20261103-131511: what the lab confirmed (13:19Z 11-03, numidium's run, thuum-cf's read)

serialize-on-demand.js in serialize mode on c1 alone (x-serialize-on-demand-serialize, by path; the check run 20261103-130xxx before it
held every premise with the stash's record byte-identical to 114726's). At 35576's leave for 0xe3a7a's kLockExtra mark, on
Main.threadID (thread 3584), the entry 0x90001000 with a null record: CheckSaveGame returned 1 with headerFlags 0x90001000 (nothing
dropped), 35715's kind 0, the header 4e3a7a00 10009000 4e (id 0xe3a7a in BGSNumericIDIndex order, flags 0x90001000, type 0x4e REFR,
version 0x4e), the record type 0, size code 0, version 78, length1 36, length2 0, 40 bytes, FNV-1a 0x4ebbb261; recordFreed and
bufferDestroyed true; the entry re-read 0x90001000 with a null record (entryUntouched true). At the purge the engine's own stash wrote
the same 40 bytes and the compare row read equal. So, by this run:

- CONFIRMED: BGSSaveFormBuffer's layout as used (the header at +0x18 in file order, the flags at +0x1b, the form at +0x28) and the five
  call signatures (36035, 36037, 35715, 36081, 36044), since the bytes came out right and nothing faulted;
- CONFIRMED: a console lock's mark runs on Main.threadID (the stash row and the trigger agreed);
- CONFIRMED: slot 0x0D then 0x0E on a loaded REFR outside a save leave the changes-map entry untouched (flags unchanged, record null);
- CONFIRMED: the on-demand record equals the unload's stash record byte for byte for the same state, and the stash's record is
  deterministic across sessions (the check run's purge against 114726; ADR-065 decision 7's premise);
- CONFIRMED-STATIC stays as it was for the slot ids and the singletons;
- HYPOTHESIS still: that +0xDA5 is TESDataHandler::clearingData and that +0x120's byte is the dry-run flag (both read zero, which a
  wrong offset would also show; a read under a save or a clearing would settle them);
- HYPOTHESIS still, untouched by this run: an actor's bytes (the stash's slot 0xF2 pre-call for an actor with a currentProcess, no
  signature read yet), the extras' per-type mask table beyond the two extras this record carries, and the inverse (c): LoadGame on a
  3D-loaded copy (risk 1).

What it means for ADR-065: the sending half (b) is proven on the engine's own code, and with the transplants (change-forms.md D1 to D3,
C5) the whole pipeline runs on the engine at both ends: observe at AddChange, serialize on demand through a scratch buffer, apply
before the reference's first frame. The next reads: the actor class (0xF2), then (c).

## The actor class: the stash's pre-call and Actor::SaveGame (static read)
Written 13:45Z 2026-11-03 (the re-analyst) after run 131511, for the actor class and for D7 (numidium's x-transplant-capture-npc v1: the
promoted MS13 bandit 0x39fe4 took no stash). Sources and rule as above; nothing renamed. Actor offsets are CommonLib's plus 8 (Actor.h:712).

### Id rows added (1.6.1170; RVA; how found)
| Function (CommonLib name where it has one) | RVA | id | Found by |
| --- | --- | --- | --- |
| VTABLE_Actor[0] slots 0x7A, 0x7B, 0x7C: Actor::ShouldSaveAnimationOnUnloading (returns 0), ShouldSaveAnimationOnSaving (currentProcess at kHigh), ShouldPerformRevert (Actor.h:325) | 0x6a39d0, 0x6a39e0, 0x6a3a10 | 38055, 38056, 38057 | read_bytes on 207511 (CONFIRMED-STATIC); Ghidra's import names agree |
| slots 0xF1 to 0xF4: Actor::MoveToHigh, MovetoLow (the stash's pre-call), MovetoMiddleLow, MoveToMiddleHigh (Actor.h:439-442); slot 0x109 CreateMovementController (:463) | 0x681d80, 0x6826d0, 0x682f20, 0x683590, 0x692650 | 37621, 37622, 37623, 37624, 37793 | read_bytes on 207511 (CONFIRMED-STATIC) |
| the actor's set-process-level (37650's first call); the process-level update that stashes a demoted actor; the far-skin undo, its predicate and setter (high +0x468); the cached-values invalidation; the four-flag reset | 0x6760d0, 0x675c70, 0x663610, 0x6ef270, 0x6ef250, 0x67fac0, 0x6c3720 | 37502, 37501, 37287, 39583, 39582, 37592, 38754 | callees of 37650, 37649, 37622; xrefs of 35570 |
| AIProcess::SaveGame, LoadGame; the AIProcess ctor (level 3) and dtor; ProcessLists add-to-list, remove-from-list | 0x6e4710, 0x6e67c0, 0x6d3af0, 0x6dd4f0, 0x767ba0, 0x767c50 | 39429, 39430, 39107, 39250, 41290, 41291 | callees of 37649, 37650, 37502 |
| the block writers and readers: ActorState, Modifiers, ActorValueStorage, the +0x188 list; CombatController's writer; the cached values, ActorPackage and unk108 writers; the handle lookups (reference, actor) | 0x6cea60, 0x6ced00, 0x6cff40, 0x6cffc0, 0x6d1030, 0x6d1200, 0x6c28c0, 0x6c29c0, 0x559db0, 0x725de0, 0x6cdb90, 0x724360, 0x1795f0, 0x18a9b0 | 38987, 38988, 39009, 39010, 39023, 39024, 38743, 38744, 33243, 40221, 38965, 40167, 12331, 12922 | callees of 37649, 37650, 39429 |
| promotion: promote, demote, the owner add and remove on ExtraPromotedRef, IsPersistent (two bodies), the kRefOriginalPersistent test, SetPersistent, the large-STAT test, the post-promotion call (unread), the unload queue (unread) | 0x1ff290, 0x1ff470, 0x16da10, 0x16db10, 0x2de550, 0x2de560, 0x2de5a0, 0x2de5b0, 0x28b680, 0x2e0da0, 0x63b120 | 15330, 15331, 12058, 12059, 19593, 19594, 19596, 19597, 18219, 19669, 36459 | xrefs of 14608 and 35570; callees of 15330 and 15331 |
| the cell unload, its collector, the set walk with the persistence filter, the file predicate in it, TESForm::GetFile | 0x2bfae0, 0x2ca090, 0x2c9800, 0x1c8d10, 0x1e0420 | 19113, 19235, 19230, 14001, 14621 | `just addr 19113`; xrefs of 35570; callees of 19113 and 19235 |

### Q1. The pre-call is Actor::MovetoLow, the unload's demotion, not a serialization step
35570 reads the entry, then `if (formType == 0x3E && *(actor + 0xF8) != 0) vtable[0xF2](actor)`. Slot 0xF2 of 207511 is 0x1406826d0 =
37622, Ghidra's Actor::MovetoLow, Actor.h:440: CONFIRMED-STATIC. `bool MovetoLow(Actor*)`, returns 1, takes no buffer. Body (HYPOTHESIS):
under the process spinlock shared with 37502 and 37501, a high-process actor gets the far-skin undo 37287, a package flush and
StopCombatAndAlarmOnActor; every actor gets iIsInSneak zeroed on its graph, its interrupt package ended, its cast interrupted (38757), the
four-flag reset 38754, kEssentialDown returned to alive, KillImmediate when lifeState is kDying, the move to process list 3 (41291 out,
41290 in), the movement controller's slots 2 and 4, meleeAttackState cleared, boolBits bit 13 set, boolFlags bits 3, 11, 14 cleared (4 too
for a high actor, 8 set for a middle or low one), and RemoveChange(0x100000) (slot 0x0B, TESForm.h:134), which strips kTempModifiers from
the entry. It flushes nothing for
SaveGame's sake: it is the AI demotion the unload performs anyway, placed before 0x0D so the record reads level 3. The save walk 35599 has
no such call (LookupByID, header, 0x0D, fix-up, 35715, 0x0E, 36036 at whatever level the actor holds; HYPOTHESIS). Thread: main
(HYPOTHESIS). It never reads kSaving. So the pre-call is no prerequisite of 0x0E, and it is the one call the recipe must NOT add for a
live actor: it ends packages and combat, kills a dying actor at once and demotes the AI until 37501 re-promotes it.

### Q2. Actor::SaveGame (37649): the actor block, in order
Nothing in 37649 reads the header flags at +0x1b: the actor block is state-driven. The change flags gate only TESObjectREFR::SaveGame's
sections (the type-0x3E extras mask, Q1) and Revert (below). The body (HYPOTHESIS; CommonLib names, 1170 offsets):
1. u32 process level (currentProcess ? AIProcess +0x137, AIProcess.h:225, kHigh 0 to kLow 3 : 0xFFFFFFFF); u32 boolBits (+0xE8). Then, if
   kHigh and high->farGeometry (+0x468, HighProcessData.h:357), 37287 removes the base's farSkin (TESNPC.h:280) by RemoveItem (slot 0x56)
   and clears the flag: a 3D side effect of 0x0E.
2. TESObjectREFR::SaveGame (19528), Q1's body. 3. If currentProcess, AIProcess::SaveGame (39429): unk048, unk04C, a byte and the cached
   values (40221), currentPackage (38965), lowProcessFlags, essentialDownTimer, unk100 as an id, numberItemsActivate, deathTime,
   trackedDamage, skippedTimeStampForPathing, unk134, unk108 (40167), unk120 as an id, genericLocations and equippedForms as counted ids,
   equippedObjects[2], ignoringCombat, unk128 as an id (AIProcess.h:195-227); then middleLow's first u32, a middle-high block of about
   sixty fields and a high block of about a hundred, each only if present; one byte of the high block is 37362(actor): Actor's 0x7A
   (38055, returns 0) under kSaving clear, so the animation sub-block is absent on demand, 0x7B (38056, high process only) under a save.
4. u8 soundCallBackSet (+0x278; Actor.h:697-698's comments are swapped), u32 updateTargetTimer, voiceTimer, float now minus lastUpdate
   (+0x260; an age the reader re-bases), checkMyDeadBodyTimer, actionValue, timerOnAction, unk11C, emotionType, emotionValue,
   criticalStage, thiefCrimeStamp, lastSeenTime (+0xEC, +0x110, +0x10C, +0x11C, +0x120, +0x124, +0x174, +0x178, +0xF0, +0x118, +0x264),
   float TESNPC::weight (base +0x1FC, TESNPC.h:277; a change rebuilds both bipeds on load), myKiller (+0x108) as an id.
5. ActorState (38987 on +0xC0, 18 bytes): u16 actorState1 bits 0 to 13, u8 sitSleepState, flyState, lifeState, knockState,
   meleeAttackState, eleven u8 of actorState2 (ActorState.h:101-135). A dead NPC's lifeState byte is 2 (kDead, ActorState.h:11).
6. unk1E8 (+0x1F0) as a reference id (so an ObjectRefHandle, HYPOTHESIS), the four magic casters (SaveGameMagicCasterVisitor: a presence
   byte, then blocks), selectedSpells[4] (+0x1C8) and selectedPower (+0x1E8) as ids.
7. Modifiers (39009: u32 3, three floats) for health, magicka, stamina, voicePoints (+0x230, +0x23C, +0x248, +0x254); ActorValueStorage
   (39023 on +0x208): varint-counted (av minus 1, value) base values and (av minus 1, three floats) modifiers; counted addedSpells
   (+0x190) ids.
8. u8 movement block present (1 only with movementController and kSaving, then its slot 0x12; 0 on demand); u32 boolFlags (+0x204); u8
   combatController present (+0x160) then 33243's block; 38743: counted (id, u32) pairs of the list at +0x188 (unk180; the decompile
   re-emits the head node, a quirk for a run); u32 intimidateBribeDayStamp (+0x184), underWaterTimer (+0x114), exclusiveBranch (+0x228) as
   an id, u8 unk273 bit 0 (+0x27B); the reader gates these last three on versions above 0x27, 0x2A, 0x2C (today 0x4E).
Two reader facts for the dead NPC. 38988 applies the ActorState block whole, lifeState included, with no flag test. kLifeState (bit 10) is
read in none of 37649, 37650, 38988; its reader is Actor::Revert 37653: `if (old flags bit 10 && lifeState != 0) 0x680bf0(actor)` (a
resurrection reset, HYPOTHESIS), beside `(flags | old) & 0x8000020` (inventory reset) and old bit 17 without new bit 17 (limbs restored).
So kLifeState keeps the entry alive and tells Revert to undo a death; the death itself travels in the ActorState bytes. And the first u32
goes to 37502(actor, level) before anything else is read: 0xFFFFFFFF destroys the process (41291, 39250); any other level creates one when
missing (39107 sets +0x137 to 3, 41290 adds it to list 3) and, when the current level differs, calls MoveToHigh (0), MoveToMiddleHigh (1),
MovetoMiddleLow (2) or MovetoLow (3) on the spot; the process block is read only if a process exists.

### Q3. Actor's slot 0x0D
Slot 0x0D of 207511 reads 0x1402da4f0 = TESObjectREFR::CheckSaveGame 19527: CONFIRMED-STATIC, no override. The difference is in the
virtuals it calls: Actor's 0x7A (38055) returns 0, so with kSaving clear kAnimation (bit 28) is dropped for every actor with 3D and no
ExtraSavedAnimation; under a save 0x7B (38056) keeps it for a high-process actor. The inventory rule is the REFR's. Nothing else.

### Q4. Extending the recipe to an actor
The recipe holds with one change and one caveat. The change: no slot-0xF2 call. The premises stay, plus two: not the player (0x14 is no
transplant class), and high->farGeometry read and printed before 0x0E (a set flag makes 0x0E remove the far skin, HYPOTHESIS). kSaving
stays clear: three readers change the bytes otherwise (0x0D's 0x7B, 37649's movement byte, 39429's 37362 byte) and the receiver consumes
unload-shaped records. The caveat: without 37622 the record is save-shaped, not unload-shaped; the expected differences from a stash of
the same actor (HYPOTHESIS until a run): the first u32 (0 or 1, not 3), the process block (middleHigh and high present, hundreds of bytes,
deflated when the setting byte is set: length2 nonzero), boolBits bit 13, boolFlags bits 3, 4, 8, 11, 14, meleeAttackState, kTempModifiers
in the entry flags. The engine's save walk writes exactly this shape for every loaded actor, and 37650 consumes it by moving the
receiver's actor to the record's level inside LoadGame: on the receiving seat that is MoveToHigh (37621) on an actor whose cell is still
initializing, outside kLoading. That is the actor transplant's risk 1; only a run reads it.
Initial data for an ACHR (35708, Q1): created 5; kCellChanged or kPromoted 6 (the editor cell id and grid, 13678); kMoved or kHavokMoved 4
(the save parent cell 35719 as an id, position, angle: 27 bytes); else 0. A living NPC carries kMoved (D7's 0x39fe4 read 0x9a040022), so a
dead NPC in place is kind 4 with its current cell, and one that changed cells is kind 6 keyed on where the plugin placed it, while the
stash's own map registration keys on the current parentCell (+0x60) or worldspace (19816). The receiver's apply registers from the record
(35908, 35903); D3 exercised kind 0 only, so kinds 4 and 6 are unproven on the receiving side.

### Q5. A promoted reference at a save, and why it never stashes (D7)
The cell unload 19113 collects its victims with 19235, whose set walk 19230 skips a reference when IsPersistent (19593: formFlags bit 10,
TESForm.h:73) or when TESForm::GetFile (14621) names a file 14001 rejects (unread), then calls TryUpdateActorLastSeenTime (slot 0x95), the
stash 35570 and the unload queue 36459 on each survivor. Promotion sets kPersistent (15330 calls SetPersistent 19597 with 1), so a
promoted actor is never in the set: no stash, no record, its state stays live (decompile; HYPOTHESIS; D7 is the consistent observation).
The actor's own path, 37501, stashes an actor it demoted to level 2 or 3 only when IsPersistent is false and its cell is not held
(cellState +0x44, TESObjectCELL.h:259). At a save the walk has no promoted branch: every entry with a null record is serialized live,
promoted or not, under kSaving with the two-way fix-up; a promoted record differs from a plain one only through its flags (kPromoted
selects the kPromotedRef extra 0x8C through the mask and initial kind 6). So the on-demand recipe applies to a promoted, loaded reference
unchanged (HYPOTHESIS), and (c), the apply to a live form, is the only half that differs.

### Q6. Who sets and who clears kPromoted
15330 (HYPOTHESIS name PromoteReference(ref, owner); its forced entry at 0x1ff362 is census v3's return address 0x1ff367): when
GetAllowPromoteToPersistent (slot 0x47, TESObjectREFR.h:267; Projectile.h:179 says no) allows: SetPersistent(1) unless persistent, 12058
adds the owner to ExtraPromotedRef::promotedRefOwners (ExtraPromotedRef.h:22); unless kRefOriginalPersistent (19596, inGameFormFlags bit
6) a stored record is applied to the now-live form by 35568, and kStillLoading cleared when there was none; then, unless 18219 (a Static
or MovableStatic, FormType 0x22 or 0x24, above a radius setting), the forced entry 14608 with kPromoted and 19669 (unread); for an actor a
pending deferred demotion is dropped from the array at 0x1420fc1b0. One caller Ghidra names Start (the quest side: TESQuest::promotedRefs,
TESQuest.h:282; BGSLocation.h:131). 15331 (HYPOTHESIS name DemoteReference(ref, owner, force)): for a non-actor, or forced, or under
kLoading without kInitingForms (BGSSaveLoadGame.h:60-62): 12059 removes the owner and returns 1 when the owners array is empty (removing
the extra); then RemoveChange(kPromoted) (slot 0x0B) clears the bit from the entry, and unless kRefOriginalPersistent: the stash 35570
when the cell is null or its cellState is 0, SetPersistent(0), and the unload queue 36459 when stashed or when kWantsDelete without 3D. An
actor not forced is instead queued to 0x1420fc1b0 for a later forced demotion (callers include ClearTargetImpl and Finish: the alias clear
and the quest finish, HYPOTHESIS). So kPromoted clears when the last holder lets go, not when a stage moves: for MS13's bandit the alias
clear or the quest's finish, with a stash only if its cell is then unloaded.

### Id rows added for Q7 (1.6.1170; RVA; how found)
| Function (CommonLib name where it has one) | RVA | id | Found by |
| --- | --- | --- | --- |
| Character::SaveGame (Character.h:31; slot 0x0E of VTABLE_Character 207886); PlayerCharacter::SaveGame (slot 0x0E of VTABLE_PlayerCharacter 208040; calls 40266 at 0x14073a322); Character's slot 0x0D (19527, no override) | 0x727d40, 0x73a2f0, 0x2da4f0 | 40266, 40538, 19527 | read_bytes on 207886 + 0x68 and + 0x70 and on 208040 + 0x70 (CONFIRMED-STATIC); Ghidra names 0x727d40 Character::SaveGame and leaves 0x73a2f0 unnamed; run 143818 read 0x727d40 on the bandit |
| Actor::Update, which Character does not override (slot 0xAD, Actor.h:371); PlayerCharacter::Update (the same slot of 208040): the script's per-frame main-thread trigger | 0x667d40, 0x732660 | 37348, 40447 | read_bytes on 207511 + 0x568, 207886 + 0x568, 208040 + 0x568 (CONFIRMED-STATIC for the slots; the names are CommonLib's, Ghidra has none for either) |
| the MovetoLow caller at the player's exit (run 144049's return address 0x675fb7 lies inside 37501, the process-level update of the actor's own path, Q5) | 0x675c70 | 37501 | addr.py's reverse pass; the decompile in Q7 |

### Q7. Character's slot 0x0E is 40266, an inlined copy of Actor::SaveGame; what runs 143818 and 144049 showed
Written 15:1x UTC 2026-11-03 (the re-analyst) after serialize-on-demand-actor.js's first runs (check 20261103-143818, serialize 20261103-144049,
RUNS 2 and DEFER true, the promoted bandit 0x39fe4): the recipe never ran because two premises refused, "on Main.threadID" and "slot 0x0E is
37649". Every NPC is a Character (Character.h:7, `class Character : public Actor`), and VTABLE_Actor (207511) is nobody's live vtable, so the
row "Actor's slot 0x0E is 37649" above holds for the class and not for any NPC: the bandit's slot 0x0E read 0x727d40, which VTABLE_Character
holds at +0x70 (the DATA xref 0x1418a55c8 = 207886 + 0x70; CONFIRMED-STATIC) and Ghidra names Character::SaveGame; CommonLib declares the
override (Character.h:31, with the comment `{ Actor::SaveBuffer(a_buf); }`). The body (HYPOTHESIS, decompile): it does NOT call 37649; the
compiler inlined Actor::SaveGame whole, so 40266 is a second copy of Q2's sequence field for field (the level from AIProcess +0x137 or
0xFFFFFFFF, boolBits +0xE8, the far-skin undo 37287 under the level-0 predicate 39583, TESObjectREFR::SaveGame 19528, AIProcess::SaveGame
39429, the fixed fields +0x278, +0xEC, +0x110, now minus +0x260, +0x10C, +0x11C, +0x120, +0x124, +0x174, +0x178, +0xF0, +0x118, +0x264,
TESNPC +0x1FC, myKiller +0x108 through 12922 and 36048, ActorState 38987 on +0xC0, +0x1F0 through 12331, the casters, selectedSpells
+0x1C8, selectedPower +0x1E8, Modifiers 39009 on +0x230, +0x23C, +0x248, +0x254, ActorValueStorage 39023 on +0x208, addedSpells +0x190
counted, the movement byte under kSaving with movementController +0x150's slot 0x12, boolFlags +0x204, the combat controller +0x160 through
33243, 38743, +0x184, +0x114, +0x228 through 36048, +0x27B bit 0). The five block writers are calls, not inlined, so the script's marks bound
the same sections under 40266. One refinement to Q2 step 6 from this read: the four casters are written as ONE presence byte (the
SaveGameMagicCasterVisitor's first pass over the four slots) and then the present casters' blocks (its second pass), not a byte per caster,
so the span between the ActorState block and the first Modifiers block is 3 (the +0x1F0 id) + 1 + the blocks + 12 + 3 bytes. Character's
slot 0x0D is 19527 (the vtable at +0x68, no override) and its slot 0xF2 is 37622 (the check run's premise passed). PlayerCharacter's slot
0x0E is 40538, which calls 40266, so a Character's record and the player's share the body; the player stays refused. The script's premise
now reads "slot 0x0E is Actor::SaveGame 37649 or Character's 40266", an exact match on either, anything else refusing.

Two more facts from the runs. (1) A kill's kLifeState marks fire OFF the main thread: 143818's marks for 0x39fe4 (lifeState 0 then 1, process
level 0, farGeometry 0) came on threads 1056, 1964 and 3292 and 144049's on 6872, against Main.threadID; the engine's death path marks from
its own threads, so the script's DEFER exists for this, and its deferred run now fires at the first of PlayerCharacter::Update's return
(40447, VTABLE_PlayerCharacter's slot 0xAD by Actor.h:371: once per frame on the main thread, HYPOTHESIS until the row prints its thread) or
the next main-thread AddChange (alone it waited 13,115 ms in 144049 while the player stood still; the host mark was form 0x38ab1's). (2) D7
again, now with its mechanism seen live: at the player's exit the engine ran MovetoLow on 0x39fe4 from 0x675fb7, inside 37501, whose body
(decompile, HYPOTHESIS) computes the actor's target level, calls that level's move slot (0xF1 for 0, 0xF4 for 1, 0xF3 for 2, 0xF2 for 3) and,
for levels 2 and 3, stashes through 35570 only when IsPersistent (19593) is false and the cell is neither held (cellState 2) nor passing a
TES check (unread), after the four-flag reset 38754; the promoted bandit is persistent, so MovetoLow ran and no stash followed (stashForm 0,
the writers meanwhile firing for other forms: stash 4,087, refrSave 339, processSave 66, actorStateSave 71, modifiersSave 284, avStorageSave
71). The entry flags at the kill read 0x9a040427 with a null record: 0x9a040022 plus kFlags (bit 0), kHavokMoved (bit 2) and kLifeState (bit
10).

What the next run must show: the slot premise passing on the bandit, the deferred run within a frame or two (deferredMs under about 50,
deferredVia PlayerCharacter::Update, thread equal to Main.threadID), 0x0D's dropped bits, the kind, the level u32 (0 expected, the bandit in
high process) and the lifeState byte of the ActorState block against the live info, and length2.

### What a first actor run must read
1. A dead lab NPC (not the player), serialize mode: 0x0D's dropped bits, 35715's kind, the level u32, length2, lifeState 2, myKiller, the
   Modifiers.
2. The same actor's stash after `coc riverwood` and `pcb`, aligned by sections: Q4's predicted differences and nothing else.
3. The receiving side, in a later inject: 37502 and 37621 hooked on c2 (MoveToHigh at a cell-init apply), then lifeState and cell once
   loaded.
4. The unload filter: 19230 hooked to log IsPersistent per reference at a `pcb` (D7's promoted actor logs 1 and never reaches 35570).
5. The deferred demotion: 15331 hooked at the quest's finish for a promoted actor, reading RemoveChange(kPromoted) and the stash.

## Runs 20261103-153648 and 153929: the actor class on the lab (15:43Z 11-03, numidium's runs, thuum-cf's read)

serialize-on-demand-actor.js on c1 alone, the promoted bandit MS13BanditCampfire01 0x39fe4 killed by npc-kill: the check run (FLAG
0xffffffff, RUNS 8) and the serialize run (FLAG 0x400, RUNS 2, DEFER true), both green on their kill asserts. The kLifeState marks
came off the main thread (6852, then 6620), were deferred through PlayerCharacter::Update's return in 1 and 17 ms, and every premise
held, slot 0x0E as 40266 included. At kDying (lifeState 1): type ACHR, size code 1, version 78, length1 4789, raw (deflateSetting 0),
4,795 bytes, FNV-1a 0x73ded23b, the initial data [0, 1053], levelBoolBits [1053, 1061], the process block absent at level 0. At kDead
(lifeState 2): 4,481 bytes, FNV-1a 0x2f0621cd, the initial data [0, 1029]. Header flags 0x8a040426 and 0x8a040427 (kAnimation dropped,
Actor's 0x7A returning 0), kind 6 (the cell 0x4371de direct, then the position, then the Havok blob). recordFreed, bufferDestroyed and
entryUntouched true both times. The engine's own MovetoLow ran at the player's exit outside the recipe (caller 0x675fb7) and no stash
formed (D7, the third time). Recorded by numidium as change-forms.md C6. So, by these runs:

- CONFIRMED: Q7, a Character's slot 0x0E is 40266 and the recipe serializes a Character through it with no pre-call; the record is
  save-shaped (level 0, the process block absent) as Q4 predicted;
- CONFIRMED: a kill's kLifeState marks fire off the main thread, and PlayerCharacter::Update's return is a main-thread trigger a
  frame or two after the mark (the deferral 1 and 17 ms);
- CONFIRMED: the five block writers bound the sections under 40266 (the marks gave the region table);
- CONFIRMED: a promoted actor never stashes at the unload (D7), with MovetoLow still running for it at the exit;
- HYPOTHESIS still: the deflate setting's meaning (0 here, the record raw); 37501's IsPersistent gate as the predicate that skipped
  the stash; the inverse (c), LoadGame on a 3D-loaded copy.

The initial data of kind 6 opens with the cell and the position and carries the Havok blob, which for a dead actor is the ragdoll's
bone transforms on the owner's engine: the owner holds the corpse's exact pose in the engine's own format. Applying that record to
the guest's loaded copy (the live-form apply, (c)) is a candidate cure for the guest's half-up body (playtest 41's item 3, the
death-freeze reds), beside the Frida sampler's search. HYPOTHESIS until a guest applies one.

## (c) The apply to a loaded actor: LoadGame, the initial data and the Havok blob (static read)

Written 16:0x UTC 2026-11-03 (the re-analyst) after runs 20261103-153648 and 153929 (the actor script on the promoted bandit 0x39fe4:
kDying record 4,795 bytes, initial data [0, 1053] of kind 6, levelBoolBits [1053, 1061], the process block absent; kDead 4,481 bytes,
initial data [0, 1029]). Sources and rule as above: ids by addr.py (forward and the reverse pass), slots and members by the headers,
bodies by pyghidra on the unpacked 1.6.1170; nothing renamed. The one concrete target: the initial data's Havok blob is the owner's
ragdoll, body by body, and the question is whether the engine's own reader puts it on a guest's 3D-loaded copy (playtest 41's item 3,
the half-up body). Short answer first: yes, by a chain that exists in the engine for exactly this case, the finish pass's flush; what
is unproven is the result on screen.

### Id rows added for (c) (1.6.1170; RVA; how found)
| Function (CommonLib name where it has one) | RVA | id | Found by |
| --- | --- | --- | --- |
| the apply's stack-buffer wrapper (mgr, form); the apply (mgr, form, BGSLoadFormBuffer*) -> bool; the finish pass (mgr, fromFullLoad); the full-load passes (unread) | 0x603700, 0x6037a0, 0x603140, 0x602d00, 0x605f90 | 35568, 35569, 35567, 35566, 35600 | change-forms.md; xrefs of 35569 and 35567 |
| the apply's callers: the cell init's reference visitor (actors deferred), the cell init, its second apply loop; the promotion batch (promote each, then the finish pass), promote; the apply-finish-reserialize path and its caller (unread) | 0x2cc2d0, 0x2b3260, 0x603e00, 0x1fedb0, 0x1ff290, 0x620ed0, 0x621170 | 19283, 18882, 35572, 15328, 15330, 35940, 35941 | xrefs of 35569, 35568, 35567 |
| the finish pass's other callers: the cell's 3D build (cellState 3 at its start, 4 at its end, TESObjectCELL.h:259; runs the pass under the suppress bit); two unread (0x1a5df0; the wrapper's callers 0x61f1e0, 0x61f530) | 0x2b7840, 0x1a5df0, 0x61f1e0, 0x61f530 | 18978, 13430, 35909, 35910 | xrefs of 35567 and 35568 |
| BGSLoadGameBuffer ctor, dtor (frees the scrap data), prepare (inflate target); BGSLoadFormData ctor; the record decode (frees the record); the form from a BGSLoadFormData; the sub-buffer to load-buffer bridge; the varint read; the version-0x37 reader; the 3-byte id reader | 0x624d30, 0x624d60, 0x624f20, 0x624880, 0x628210, 0x6249a0, 0x625b80, 0x625320, 0x625400, 0x624fc0 | 35993, 35994, 35998, 35984, 36080, 35987, 36019, 36004, 36007, 36000 | callees of 35568, 35569, 36031 |
| the initial data: reader (buf, form, flags) -> kind, its body, the fixed-part decoder, the type decision, the writer; TESObjectREFR::SetAngle and SetPosition (HYPOTHESIS names), the cell move, the cell-or-worldspace resolver, the grid cell, the ACHR registration, the actor predicate before editorLocForm, the position check, the TES cell check, the worldspace registrations | 0x60e5e0, 0x60e630, 0x60df60, 0x60dac0, 0x60e1c0, 0x2ea6a0, 0x2ea960, 0x2eb8c0, 0x21f1b0, 0x1af5c0, 0x607aa0, 0x663ea0, 0xd17350, 0x19cdf0, 0x30af40, 0x30aca0, 0x30a120 | 35716, 35717, 35714, 35708, 35715, 19786, 19790, 19799, 15903, 13641, 35607, 37301, 70171, 13308, 20542, 20541, 20526 | callees of 35569 and 35717 |
| the Havok block writer (ref, buf), its pre-pass (ref, state), its pre-pass callback, its per-body writer, the collision-object traversal (node, state, callback); the block READER (ref, buf) and its per-body reader; the body's motion-type set, the collision object's update, the body activate; the keyframe predicate on a living actor; the character controller getter | 0x2db2c0, 0x2db1b0, 0x2dbc00, 0x2dbce0, 0xe87df0, 0x2db450, 0x2dbfc0, 0xe92b20, 0xea59b0, 0xe93140, 0x674f50, 0x6628f0 | 19534, 19533, 19536, 19537, 77883, 19535, 19538, 78077, 78384, 78088, 37484, 37258 | callees of 35715, 19534, 19535; xrefs of 19535 |
| the queued sub-buffers at the manager's +0x208: the enqueue (mgr, kind, buf, id), the queue read (queue, kind, buf, id), the flush of all three kinds, the flush of one kind, the per-entry handler (kind*, form, subBuffer), the sub-buffer alloc, the hash insert; the ExtraSavedHavokData setter and its applier (from the 3D init, two call sites), the ExtraSavedAnimation setter, the animation reader, the character-controller reader, the discard | 0x6053f0, 0x625ef0, 0x626020, 0x6261b0, 0x6264e0, 0x626760, 0x626250, 0x16aa00, 0x16ab60, 0x625800, 0x2e8140, 0x16a7d0, 0x2f5fe0, 0x715f90, 0x5b4050 | 35587, 36023, 36024, 36026, 36031, 36032, 36027, 11977, 11979, 36014, 19742, 11973, 20099, 40045, 34201 | callees of 35717, 35567, 36031; xrefs of 19535 and 11979 |
| Actor::LoadGame, Character::LoadGame (slot 0x0F of 207886 at +0x78; an inlined copy sharing 37650's tail), Actor::FinishLoadGame, the ActorState reader, the Modifiers reader, the ActorValueStorage reader, AIProcess::LoadGame, its finish, the set-process-level, the target-level chooser, the cached-values invalidation; the penetration util getter (middleHigh +0x258, MiddleHighProcessData.h:184) and its bhk setup; the per-graph callbacks; IsInRagdollState (Ghidra's name) | 0x686de0, 0x727d50, 0x687a80, 0x6ced00, 0x6cffc0, 0x6d1200, 0x6e67c0, 0x6e97b0, 0x6760d0, 0x676370, 0x67fac0, 0x70f6d0, 0xe98d40, 0x541590, 0x54e2b0, 0x54e400, 0x66afa0 | 37650, 40267, 37652, 38988, 39010, 39024, 39430, 39432, 37502, 37503, 37592, 39859, 78210, 32710, 32956, 32963, 37364 | read_bytes on 207886 + 0x78 (CONFIRMED-STATIC); callees of 37650, 37652, 19535 |
| the suppress-bit helper (mgr, clear) -> was-clear; the "FORMS:" log; the unload queue; the cell detach; the quit predicate; ProcessLists' queued move | 0x2cfe60, 0x601770, 0x63b120, 0x2ba0b0, 0x648cb0, 0x76e5c0 | 19378, 35519, 36459, 19032, 36600, 41343 | callees of 35569, 35567, 37652 |

### Q1. The engine's own paths that apply a record to a form, and which of them reach a loaded actor
**35569, the apply** (mgr, form, buf) -> bool (HYPOTHESIS, decompile): refuses under kLoading (bit 1 of +0x340 must be CLEAR, the full load
uses 35566 instead); reads the entry (35503); no entry or a null record returns 0; compares the record's save type (35929 on byte 0)
with the form's formType and on a mismatch logs "(Load Error) Form '%s' (%08X) was saved with form type %s, but currently has form type
%s. Its loading will be skipped." and erases the entry (35510); else sets TLS +0x670 bit 0 (the suppress bit, old value kept), decodes
the record into the buffer (36080: version to +0x4B, length1 and length2 by the size code, a raw body copied into scrap memory at +0x08
or inflated by 35933 into length2 bytes, then the record FREED and the entry's pointer nulled), writes the entry back (35509, now with a
null record), sets buf +0x38 = form and +0x40 = the entry's flags, sets formFlags bit 21 (kStillLoading, TESForm.h:89), runs the initial
data (35716: the kind from 35708 on the entry's flags, then 35717), calls slot 0x0F LoadGame, copies the BGSLoadFormData (0x28 bytes) onto
the manager's pending array (+0x318, count at +0x328) for the finish pass, registers kinds 5 and 6 in the reference maps (35908 on +0xC8
or 35903 on +0xF8, and 35636 for kind 6; the log "FORMS: No Worldspace or Cell could not be found while loading reference '%s' (%08X)"),
restores the suppress bit through 19378 and returns 1. It never calls FinishLoadGame itself and never tests the 3D.

**35568, the wrapper** (mgr, form): a stack BGSLoadFormBuffer (35993, 35984, VTABLE_BGSLoadFormBuffer), 35569, ScrapHeap::Deallocate of
the decoded data, 35994. Its callers: **15330 promote** (the note's Q6: a stored record applied to the now-live form unless
kRefOriginalPersistent), 35909 and 35910 (unread), and 35940 (apply, finish pass, then serialize the form again into a save-side
context; its caller 35941 unread). **35569's own callers**: 19283, the cell init's per-reference visitor (a non-actor gets InitItemImpl
then 35569 with the init's shared buffer, kStillLoading cleared on refusal; an ACTOR is pushed to a scrap array instead), 18882 the cell
init (two direct calls) and 35572 (its second loop): so at a cell's init the actors are applied after the other references, in the same
init, before any 3D exists (change-forms.md D1 to D3 ran this path).

**35567, the finish pass** (mgr, fromFullLoad) (HYPOTHESIS, decompile): under a global spinlock, sets kInitingForms (+0x340 bit 3);
first loop over the pending array: the form from each BGSLoadFormData (35987), its AsReference1 (slot 0x2C, TESForm.h:166) collected and
ref-counted, the data copied into a stack buffer, slot 0x10 InitLoadGame; then **36024(mgr + 0x208): the flush of the three queued
sub-buffer kinds** (Q2); then, unless quitting (36600), the second loop: slot 0x11 FinishLoadGame on every form not kDeleted, and for a
BGSLoadFormData whose flags carry kCellChanged (bit 4, BGSLoadFormData.h:19) the re-mark with 8 (35507), the forced re-stash (35570),
the cell detach (19032) and the unload queue (36459); kStillLoading cleared on every form; the array emptied; kInitingForms cleared. It
does NOT touch the suppress bit: 18978 (the cell's 3D build) sets it around the call, 15328 (the promotion batch) calls it bare after
promoting each alias reference, the full load (35600) and 35940 call it too, 13430 is unread. So the cell-init path's drain of +0x318,
the note's open read, is 18978: the cell builds its 3D, then InitLoadGame, the flush, FinishLoadGame run for everything the init applied.

**Does the engine ever apply a record to a LOADED actor outside a game load?** The path is promotion: 15330 on a loaded alias reference
whose entry holds a record runs 35568, and 15328 then runs 35567; nothing in 35568, 35569, 35717 or 36031 refuses a form with 3D (35717
warps the 3D, 36031 feeds the 3D). In practice the entry of a loaded actor holds a record only after a stash, and both stashes (the cell
unload's 35570, the demotion's 37501 behind its IsPersistent and cell gates) run on a reference that is unloading, so the loaded case is
reachable by the engine but rare; our injection makes it the normal case. Requirements, from the code: kLoading and kSaving clear (35569
refuses the first; the second changes nothing here but the note's invariant stands), an entry with a record (35509 writes it), the record's
type equal to the form's, the thread the engine uses for the callers above (the main thread: promotion and cell init run there,
HYPOTHESIS), the version 0x4E, and the form-id map for any type-0 id in the body (Q2 of the REFR read). Signatures for the probe:
35568 [uint8(pointer mgr, pointer form)], 35567 [void(pointer mgr, uint8 fromFullLoad = 0)], 19378 [uint8(pointer mgr, uint8 clear)]:
clear = 0 SETS the suppress bit, 1 CLEARS it, the return is 1 when it was clear before (so the engine's restore is 19378(mgr, wasClear)).

### Q2. The initial data of kind 6 for an actor, the Havok block's framing and layout, and the reader side
The writer (35715, the note's Q1): kind 6 is 34 fixed bytes: the save parent cell as a 3-byte id (35719; run 153648 read it direct,
0x4371de), the location (REFR +0x54, three floats), the angle (+0x48, three floats), the editor location's cell id (3 bytes) and two
u16 grid coordinates (13678); then, because the flags carried kHavokMoved (bit 2), a varint length and the Havok block from 19534
(run 153648: 1053 = 34 + 2 + 1017; 153929: 1029 = 34 + 2 + 993: the two-byte varint, then the block). The block (19534 with the
pre-pass 19533, the traversal 77883 over the 3D's collision objects, the per-body writer 19537; HYPOTHESIS, decompile):

```
u8      flags       19533: bit 0 when there are bodies and none is anim-targeted, bit 2 when some are (then a flag byte per body),
                    bit 4 when the actor has a character controller (37258)
varint  count       the number of bhkRigidBody collision objects the traversal met (two counters summed)
f32 x2  pitchAngle, rollAngle   only with bit 4: bhkCharacterController +0x24C, +0x250 (bhkCharacterController.h:128-129)
per body, in traversal order:
  [unless it is the root's collision object]  f32 x3 position, f32 x4 rotation quaternion:
        a body whose collision object carries kAnimTargeted (1 << 10, bhkNiCollisionObject.h:26) writes the node's LOCAL translate
        (NiAVObject +0x48 local, NiTransform translate +0x24) and an identity quaternion; any other body writes the rigid body's
        position (slot 0x33) and rotation (slot 0x34, bhkRigidBody.h:42) in game units (times 69.99125)
  [with flags bit 2]  u8 bodyFlags: bit 0 the body is active (hkpEntity through 0xb2e550), bit 1 its motion type is keyframed
        (hkpMotion::type at motion +0x10, hkpMotion.h:18; the entity's motion at +0x150, hkpEntity.h:99) and not flag bit 9,
        bit 2 the collision object is not anim-targeted
  [when active]  f32 x3 linear velocity (motion +0xE0), f32 x3 angular velocity (motion +0xF0), game units
```
The reader side, in order. 35717 (the body of 35716) for kinds 4 and 6: decodes the fixed part (35714), resolves the cell or worldspace
(14617 then 15903, the exterior cell by grid 13641), and unless the reference is the player under +0x340 bit 6 or the position fails
70171 or (kind 4 only) the cell differs for a non-persistent reference: SetAngle (19786) and SetPosition (19790), then slot 0x3F
Update3DPosition(warp = 1) (Actor.h:282), so a LOADED reference's root IS moved; kPromoted in the flags runs 19669 and makes the form
persistent (19597) when it is not; cell changes go through 19799 with the logs "has been moved from its saved cell", "Trying to load
non-persistent reference ... into unloaded cell"; a reference with 3D in a cell that fails the TES check (13308) loses its 3D under its
own lock (slot 0x6C Set3D(nullptr, false), TESObjectREFR.h:304); for an ACHR, 35607 registers it and kind 6 sets editorLocForm
(+0x138) when 37301 is false; finally, flags bit 2 (kHavokMoved) runs 35587(mgr, 2, buf): 36023 reads the varint length, allocates a
sub-buffer [u8 version][varint length][the bytes] (36032) and inserts it in the manager's queue for kind 2 keyed by the form id
(the three per-kind maps at +0x208 + 8 + kind * 0x30). NOTHING is applied to the bodies at LoadGame time. The three kinds, from 36031's
own messages: 0 the animation data, 1 the character controller, 2 the Havok data.

The consumer is the finish pass. 35567 calls 36024(mgr + 0x208), which calls 36026 for kinds 0, 1 and 2; 36026 walks the kind's map and
hands every pending entry to 36031(kind, form, subBuffer); 36031: for a reference WITHOUT 3D, kind 0 becomes an ExtraSavedAnimation
on the extra list (11973; an actor's is discarded), kind 1 is discarded (34201), kind 2 becomes an **ExtraSavedHavokData** (11977,
ExtraSavedHavokData.h:17, type 0x3C) to wait for the 3D; for a reference WITH 3D it builds a stack BGSLoadFormBuffer from the sub-buffer
(36019) and runs the kind's reader: 20099 for the animation, 40045 on the actor's process for the character controller (the logs "with
queued char controller is not a reference", "is not a mobile object", "does not have one to load"), and for kind 2 **19535(ref, buf)**,
the Havok reader; a stored ExtraSavedHavokData is applied later by 11979 (from 19742, the 3D init, two call sites; unread) through
36014, which is the same 19535. So the order at a cell's init is: records applied (blobs queued), the cell's 3D built, the finish pass:
InitLoadGame, the flush (19535 puts the saved bodies on the fresh 3D), FinishLoadGame (the physics setup), and that is how a save's
corpse lies where it fell.

**19535, the Havok reader** (ref, buf) (HYPOTHESIS, decompile): no 3D -> the log "Cannot load Havok data for reference %s %08X because it
has no 3D." and return; reads the flags byte and the count; runs the pre-pass 19533 on the LIVE 3D (its counts and flags); sets the
whole node's motion type (NiAVObject::SetMotionType, NiAVObject.h:133) to kKeyframed (4) for a living actor (not dead by IsDead(0),
slot 0x99, Actor.h:345; lifeState not kDying, not kUnconcious; 37484 false) and to kDynamic (1) otherwise (hkpMotion.h:28-33); a
dismembered limb's node gets kDynamic; with flags bit 4 reads pitchAngle and rollAngle into the character controller; calls slot 0xAE
UpdateNoAI (Actor.h:372, the 3D position update) and NiAVObject::Update; then, ONLY IF the saved count equals the live count, traverses
the live collision objects with 19538, which per bhkRigidBody: takes the saved position and quaternion (or, for the root body, the REFR's
position and angle: flag bit 1 of the state), reads the per-body flag byte when flags bit 2 is set (bit 1 sets that body keyframed through
78077; a mismatch between the saved and the live kAnimTargeted bit is counted and ends in the log "Behavior ragdoll save/load state
mismatch. Actor %s %08X pose may be incorrect."), and for a non-anim-targeted body whose saved position lies within 4096 units of the
REFR's position calls **bhkRigidBody::SetRotation (slot 0x36) and SetPosition (slot 0x35)** (bhkRigidBody.h:43-44; the position scaled by
0.0142875) then the collision object's slot 0x2B; an anim-targeted body gets the node's local translate and rotation written instead;
active bodies' velocities are collected and applied after (bhkRigidBody::SetLinearVelocity, SetAngularVelocity, 78088). A count
mismatch logs "Havok data bone count differs on reference %s %08X. Original count: %i, Current count: %i. This should only happen with
art changes." and applies nothing to the bodies (the sub-buffer is its own, so the record is unharmed). Then NiAVObject::Update and
three passes over the actor's animation graphs (IAnimationGraphManagerHolder at +0x38, TESObjectREFR.h:112) with 32710, 32956 and, for
a dead actor, a third callback (per-graph ragdoll calls, unread).

### Q3. Would the owner's blob move the guest's bones, and what the engine needs first
CONFIRMED-STATIC: the chain 35568 -> 35569 -> 35717 -> 35587 (the blob queued), then 35567 -> 36024 -> 36026 -> 36031 -> 19535 -> 19538 ->
bhkRigidBody::SetRotation and SetPosition on each live rigid body exists for a reference that HAS 3D, and the same chain with
ExtraSavedHavokData -> 11979 -> 36014 -> 19535 exists for one that gets its 3D later. HYPOTHESIS: that the resulting transforms are what the
guest then shows. What the engine needs first, from the code: (1) the copy's 3D present (else the blob parks in an ExtraSavedHavokData
and waits); (2) the same collision-object count as the owner's (the same base NPC and skeleton, the same dismemberment, the same armor
set that carries collision; a difference logs and skips the bodies); (3) the REFR's position set to the owner's before the flush (the
kind-6 initial data does it in 35717, which is why the record's own initial data must travel with the blob: a saved body farther than
4096 units from the REFR's position is skipped); (4) the actor dead or dying, so 19535 sets the bodies dynamic (a living one is set
keyframed and the animation keeps the pose); (5) the ragdoll driving the skeleton: 19535 writes rigid-body transforms, FinishLoadGame then
sets the collision layer (kDeadBip 32 when IsInRagdollState, kBipedNoCC 33 when sitting or by a race flag, kBiped 8 otherwise,
CollisionLayers.h:15-40) and the motion type (kDynamic in ragdoll state, kKeyframed otherwise), re-adds the node's bodies to the
bhkWorld (bhkWorld slot 0x35, unnamed in CommonLib, bhkWorld.h:39) and updates the rigid constraints; if the guest's copy is still
animation-driven (bodies anim-targeted, the half-up pose held by the death animation), the mismatch warning fires and the written body
transforms are overridden by the animation on the next step; (6) a bhkWorld on the cell (else FinishLoadGame's physics block is skipped).
Risk points: a blob for a different skeleton or body count (skipped, logged; harmless); a null penetration util or character controller
(FinishLoadGame guards both); the root body excluded from the blob (it takes the REFR's position and angle); the owner's velocities
applied to the guest's bodies (a corpse's are near zero; a dying one's are not); the kDying record (lifeState 1) versus the kDead one:
the dead record is the one to send, both for the ActorState block and for the dynamic motion type.

### Q4. Actor::LoadGame on a loaded actor, and what it would undo on a guest's puppet
37650 (and Character's 40267, an inlined copy with a shared tail; HYPOTHESIS, decompile) writes, in order: race (+0x1F8 from the base);
the process level through 37502 (0xFFFFFFFF destroys the process; a level creates one when missing and moves to it when it differs:
MoveToHigh for 0); boolBits (+0xE8) whole; TESObjectREFR::LoadGame (19529); AIProcess::LoadGame (39430) when a process exists; +0x278,
+0xEC, +0x110; the live lifeState bits are put back over whatever 19529 and 39430 left (actorState1 &= 0xFE1FFFFF then |= the saved
bits 21 to 24), 37592; +0x260 (now minus the saved age), +0x10C, +0x11C, +0x120, +0x124, +0x174, +0x178, +0xF0, +0x118, +0x264; weight
(a change removes all parts of both bipeds through slot 0x7E before setting it); myKiller (+0x108); **the ActorState block (38988),
whole, lifeState included**; +0x1F0; the casters' presence byte and blocks; selectedSpells (+0x1C8) and selectedPower (+0x1E8); the four
Modifiers (39010); ActorValueStorage (39024); addedSpells appended to +0x190; criticalStage (+0xF0) zeroed when IsDead(0) is false; the
movement byte: 0 with a controller and race flag bit 7 destroys and recreates the controller (slot 0x109 CreateMovementController,
Actor.h:463), 1 loads the controller (its slot 0x13) and calls its slot 0x11 with the fly-state bits; boolFlags (+0x204) whole; the
combat controller created (0xE0 bytes) and loaded when the byte says so; 38744 (the +0x188 pairs); +0x184; boolBits bit 3 cleared when
slot 0x4A GetCurrentScene is null; +0x114, exclusiveBranch, +0x27B bit 0 by version. 37652 FinishLoadGame then adds the process re-level
(the move slot for a 3D-less actor), SetLifeState(kDead) for kReanimate, the physics block of Q3, BSFaceGen paused for the dead,
ApplyPerksFromBase (slot 0x101), UpdateAwakeSound, the casters' finish, and under kLoading clear with no loadedData clears the attack
state bits. For a guest's puppet copy (AI off, SetDontMove) the writes that undo the puppet state (HYPOTHESIS; the hold is lifeState 9
per the memory note skyrim-setdontmove-lifestate, Actor::Move zeroing the controller's velocity while it reads 9): the ActorState block
replaces lifeState 9 with the owner's (2 for a corpse, which is the state wanted; 0 for a living subject, which releases the hold);
boolBits and boolFlags whole (any AI or process gate the gamemode set there, unread); 37502 to level 0 (the AI promoted; on a copy
already at 0 nothing moves); the movement controller rebuilt; the Modifiers and ActorValueStorage (health damage) replacing the
puppet's. The apply scope for a corpse is therefore the whole record with nothing to restore; for a living puppet, lifeState 9 and the
gamemode's hold flags would have to be re-asserted after FinishLoadGame, which is the (c) question for live actors and not this read's.

### Q5. The minimal Frida read that proves (c) on the lab
Two halves, the round trip first because it exercises every engine call with bytes the engine itself made from the same copy and
predicts NO change. Half one, one seat: a dead NPC loaded (an own kill, or the bandit after a kill), the actor script's recipe in
serialize mode produces {flags2, record} on the owner; the probe script (a third script, to write) then, on PlayerCharacter::Update's
return (the actor script's trigger, so the main thread): premises as the actor script's plus Get3D2 non-null (slot 0x70,
TESObjectREFR.h:308), the cell's +0x44 state printed, the entry present with a null record (else refuse: never free an engine record),
the record's type 1 and version 0x4E, the record's kHavokMoved in flags2 iff its initial data holds a block (the reader runs 35587 on the
flag alone), the pending count u32(mgr + 0x328) printed (0 expected); then: allocate the record on the engine heap (transplant-inject's
68115), 35509 the Value {flags2, 0, record}; 35568(mgr, form) -> expect 1 (the rows: the return, the entry after, which must now hold a
null record, the pending count, 1 expected); 35567(mgr, 0) (optionally 19378(mgr, 0) before and 19378(mgr, 1) after when it returned 1;
the engine's promotion batch runs it bare); hook 35519 (the "FORMS:" log) for the whole probe and print its format string: the five
messages of Q2 are the engine's own verdicts (count mismatch, state mismatch, no 3D, type mismatch, not a reference). Rows before and
after each step: lifeState (actor +0xC8 bits 21 to 24), the process level, position (+0x54, three floats), angle (+0x48), the 3D root's
world translate (Get3D2 +0x7C + 0x24, NiAVObject.h:158, NiTransform.h:26), the live body count from 19533 on a scratch 0x30 state (its
+4 and +8 summed) against the record's varint, the entry's flags and record, the pending count; headZ from lab-api's npc-state beside the
trace. Expected in half one: 35568 returns 1, the entry's record nulled and its flags equal to flags2 or flags2 plus the bits FinishLoadGame
marked, the pending count 1 then 0, no mismatch log, position and root z unchanged within float noise, lifeState 2 before and after.
Half two, the cross-seat apply: the owner's kDead record (HEX, FLAGS, SUM as transplant-inject takes them) on the guest's loaded copy,
same probe; the claim is the root z and headZ moving toward the owner's and no mismatch log. What a crash means: inside 35568, LoadGame on
a loaded actor is not safe mid-game (risk 1 is real: 37502, the biped rebuild, the controller rebuild); inside 35567, FinishLoadGame's
physics block on a copy whose bhkWorld or ragdoll state differs from a load's. What a no-op means: 35568 returned 0 (the entry, the type,
kLoading); 1 with no pose change and a count-mismatch log (the skeletons differ, the same base NPC must be used); 1 with the state
mismatch log and no change (the copy is animation-driven, the bodies anim-targeted: the applied transforms were overridden, and the cure
needs the ragdoll active on the guest first); 1, no log, no change (the pending count stayed 0: the data was not pushed, or 35567 did not
run its flush: the +0x328 rows decide). The half to try first is the round trip, on c2 against its own copy if a dead copy exists there,
else on c1 against an own kill.

### What (c) settles and what stays open
- CONFIRMED-STATIC: the apply chain and the Havok chain exist for a reference with 3D, as functions and vtable slots; the flush point is
  the finish pass; the finish pass is what the cell's 3D build, the promotion batch and the full load run.
- HYPOTHESIS until a run: every body above (36080's layout, 35569's gates, 35717's 3D handling, 19535's rules, 37650's writes), the thread,
  the pose on screen, and whether the guest's half-up copy is ragdoll-driven or animation-driven at the moment of the apply.
- Open: 35566 (the full load's LoadGame pass), 35909, 35910, 35941, 13430 (the finish pass's and the wrapper's other callers), 19742
  (the 3D init that applies a stored ExtraSavedHavokData), the three per-graph callbacks, 19536 (the pre-pass callback's counting rule).

## Run 20261103-164416: the round trip on the lab (16:50Z 11-03, numidium's run, thuum-cf's read of the rows)

apply-on-demand.js 8fc23fc3 in roundtrip mode on c1 alone, the promoted bandit 0x39fe4 killed by npc-kill. The kDying mark (lifeState 1)
was refused by the "actor dead" premise as designed; the kDead mark came on thread 4560, was deferred 16 ms to the main thread 10844
through PlayerCharacter::Update, and all 23 premises held (slots 0x0E 40266 and 0x0F 40267, the 3D present, the pending array empty, the
entry 0x9a040427 with a null record). Before: lifeState 2, level 0, the root 0x246411df830 at (-3690.0, 854.8, 606.0), 19533's pre-pass
19 live bodies (flags 0x14; a 18, b 1). The record: 4,468 bytes, type 1, size code 1, version 78, length1 4462, raw; written flags
0x8a040427; kind 6; the initial data 1029 bytes with the Havok block at 36 (length 993, flags 0x14, count 19, pitch -0.87, roll
0.044), its framing equal to 35715's own length. "step: apply 35568": applyReturn 1; after the apply the root is NULL, the pending array
holds 1, the entry's record is nulled and its flags read 0x8a040427. "step: finish 35567": the pending array 0, the root still NULL.
Witnesses: havokRead for 0x39fe4 at +14 ms on thread 4560 (the physics thread, outside the run window), havokReadDone with 0 bodies, 0
SetPosition, 0 SetRotation; no flush kind row and no ExtraSavedHavokData park for the form; the FORMS log printed nothing. Ten seconds
later lab-api read the copy is3DLoaded true and isDead true at (-3693.8, 854.3, 609.1), the head 15 units above the root, the screenshot
a body lying on the temple floor. So, by this run:

- CONFIRMED: 35568 accepts a loaded, dead Character mid-game and returns 1; the pending array reads 1 after it and 0 after 35567; the
  entry's record is nulled by the engine's decode; the recipe's record round-trips through the engine's own apply (risk 1 is not a
  crash);
- CONFIRMED: the apply RELEASES the loaded actor's 3D (the root NULL right after 35568) and the engine rebuilds it from the applied
  state within 10 s, the body lying at the record's position in the engine's own death pose;
- CORRECTED by the static read below: the rows "havokReadDone bodies 0, setPosition 0, setRotation 0" and the empty FORMS log were the
  probe's own artifacts, gated on its run window, not observations; the 19535 at +14 ms on thread 4560 ran outside the window and, by
  the xrefs, can only have come from the rebuilt 3D's init (19742 through 11979 and 36014) consuming a saved Havok extra, fed either
  by Set3D's own release path (the live pose of a ragdolling actor) or by the flush's park of the record's block. Whether the rebuilt
  body got the record's pose or the copy's own is NOT decided by this run;
- HYPOTHESIS, answered statically below: the releaser is ExtraDataList::LoadGame's kLeveledCreature case (a leveled actor's mid-game
  apply releases its 3D and rebuilds its base), the rebuild runs on the task thread with 19742 applying the saved extra; the park
  (11977 after 35568, before the load completes) and the re-apply (36014 after the root returns) are the two routes for a pose.

What it means for ADR-065: the pipeline is the engine's at both ends for a loaded actor too (observe, serialize, apply, rebuild); a corpse
arriving by the apply lies at the record's position in the engine's own pose, acceptable for a corpse, a visible pop for a live actor.
For item 3's pose (the guest's body in the owner's pose) the blob must be parked or re-applied after the rebuild: the next read.

## The pose after the apply's 3D reload: why the blob was not parked, and the re-apply (static read)

Written 17:1x UTC 2026-11-03 (the re-analyst) after x-apply-roundtrip 20261103-164416 (c1 solo, the dead bandit 0x39fe4, apply-on-demand.js
8fc23fc3; change-forms.md C4). Sources and rule as above; ids by addr.py (forward and the reverse pass), bodies by pyghidra, members by the
headers; nothing renamed. One correction before the reading: the run's `havokReadDone bodies 0, setPosition 0, setRotation 0` and its empty
`formsLog` are artifacts of the probe, not observations. Those counters and that hook are gated on the probe's window (`watch.active` on the
probe's thread); the 19535 at +14 ms ran on thread 4560 outside the window, so its per-body calls and the engine's log lines around it were
not counted or printed. What the rows do establish: the root went NULL inside 35568, the pending count went 1 then 0, no verdict log fired
inside the window, 19535 ran for the form 14 ms later on a task thread, and the body came back lying at the record's position. Whether the
rebuilt 3D got the record's pose or the copy's own is NOT decided by the rows; the reading below says what the code does and what the next
run must print.

### Id rows added (1.6.1170; RVA; how found)
| Function (CommonLib name where it has one) | RVA | id | Found by |
| --- | --- | --- | --- |
| the lock-wrapped slot 0x6C call (ref, node, queue3DTasks) under the reference's spinlock at +0x90; TESObjectREFR::Set3D (TESObjectREFR.h:304; stores the live Havok pose in an ExtraSavedHavokData at a release); Actor::Set3D (Actor.h:316, slot 0x6C of 207511 and 207886); the data3D setter (ref, node) (HYPOTHESIS: the order from its callers' calls `(ref, 0)` and `(ref, node)`; loadedData +0x68 -> +0x68); Character's slot 0x6B Release3DRelatedData | 0x17a6e0, 0x2e47c0, 0x65ebd0, 0x2e5380, 0x2e4350 | 12358, 19729, 37178, 19730, 19728 | the literal search for `+ 0x360))(` over the decompiled index; read_bytes on 207886 + 0x358 and + 0x360 (CONFIRMED-STATIC); xrefs of 11977 and 19730 |
| the live-pose sub-buffer builder 36016 (HYPOTHESIS, decompile: `(BGSLoadGameSubBuffer** holder, TESForm* form)`, the holder in rcx and the form in rdx; AsReference1 on the form, else the log "Form '%s' %08X passed to BGSLoadGameSubBuffer::SaveAnimation() is not a reference", a name the string carries although the body serializes the Havok block; a scratch BGSSaveFormBuffer by 36035 and 36037 with flags 4, 19534 on the reference, then the pack 36020 (holder, buffer) writes the sub-buffer pointer through rcx, 36044), the live-animation sub-buffer, the sub-buffer pack, the old sub-buffer's free; the varint width, write and read (35529 writes the 36052 encoding); the load buffer's data setter | 0x6259a0, 0x6258c0, 0x625d00, 0x17fae0, 0x601a30, 0x601a60, 0x601ab0, 0x624f00 | 36016, 36015, 36020, 12617, 35528, 35529, 35530, 35997 | callees of 19729, 11977, 36023, 36019 |
| ExtraDataList::LoadGame (the extras loader 19529 calls: three slot-0x6C sites, the kLeveledCreature case 0x2D at 0x140170b89 and 0x140172974, the kModelSwap case 0x58 at 0x140172b72); InventoryChanges::LoadGame; Actor::InitLoadGame (Actor.h:277; releases a level 2 or 3 actor's 3D in the finish pass); TESObjectREFR::FinishLoadGame (TESObjectREFR.h:221); the leveled template builder the 0x2D case calls (unread) | 0x170380, 0x239350, 0x687720, 0x2dac30, 0x1d7880 | 12095, 16143, 37651, 19531, 14375 | callees of 19529 and of 12095's case 0x2D; xrefs of 12358 |
| the 3D load's completion (detach the old node under the reset flag, 37501, the cell's 3D build 18978, 19742): the task thread's attach; the other data3D setters and 19742's other callers; the reset-flag test, test and set on formFlags bit 19; Actor::Update3DPosition (Actor.h:286) and the base's; the havok warp; the dead-bip attach | 0x1a0920, 0x1a0bc0, 0x18d850, 0x18dd90, 0x2bbe70, 0x2c8420, 0x2de450, 0x2de4b0, 0x2de4c0, 0x664ee0, 0x2d9800, 0xe87310, 0x2e2270 | 13355, 13356, 13005, 13015, 19061, 19220, 19587, 19589, 19590, 37315, 19517 (TESObjectREFR::Update3DPosition, Ghidra's name; the reverse pass of 0x2d9800), 77867, 19706 | xrefs of 19742 and 19730; read_bytes on 207886 + 0x1F8 |
| Actor_IsInRagdollState (Ghidra's name, confirmed by the reverse pass; Actor.h:597), the four-flag reset's siblings in the Set3D callers (the AI high and middle updaters, the ragdoll-exit updater, the model updater's caller, the criticalStage handler, the player's Set3D wrapper) | 0x675150, 0x6d3c10, 0x718f90, 0x6eb630, 0x6637f0, 0x665fc0, 0x680f40, 0x6e3b70, 0x734fe0 | 37491, 39108, 40072, 39457, 37292, 37323, 37616, 39395, 40465 | callees of 19729 and 37652; the literal search |

### Q1. The flush's has-3D test, why the blob was not parked, what released the 3D, and when the engine rebuilt it
**The test.** 36031 (the flush's per-entry handler) decides with `TESObjectREFR::Get3D2(ref)` (slot 0x70: loadedData +0x68 then data3D +0x68, the
same pointer the probe's `root` reads): NULL parks (kind 2 to an ExtraSavedHavokData through 11977), non-null feeds 19535. With the root NULL after
35568, the flush inside the probe's 35567 cannot have called 19535; and the 19535 of the rows ran 14 ms later on thread 4560, outside the window.
Its caller, by the xrefs, can only be 36014, which only 11979 calls, which only 19742 calls: the 3D init of a freshly attached node, run by the load
completion 13355 on the task thread that loaded the model. So the sequence the rows fit is: the 3D released inside 35568; the probe's 35567
flushed the queued record block into an ExtraSavedHavokData (the park) or found the extra already there; the reload completed 14 ms later;
19742 applied whatever the extra held to the new 3D and removed it (11979: GetByType 0x3C, 36014, RemoveByType 0x3C, under the list's write lock).
Two stores compete for that extra (HYPOTHESIS, decompile): (1) TESObjectREFR::Set3D's release path: when the node is being released, formFlags
bit 5 is clear and the entry carries kHavokMoved (35577 GetChange with 4), and the reference is not an actor or the actor IsInRagdollState (37491:
true for a dead actor unless reanimating) or a limb is dismembered, it serializes the LIVE pose (36016: a scratch BGSSaveFormBuffer with flags 4,
19534, packed into a sub-buffer by 36020) and stores it (11977); otherwise it strips kHavokMoved from the entry (slot 0x0B); likewise for the
animation data (36015, 11973, or the strip of 0x10000000). (2) The flush's park of the record's block. 11977 on a list that already holds one logs
"SetSavedHavokData() is being called when there is already saved havok data.", frees the old sub-buffer (12617) and keeps the new. The static
chain therefore predicts, for the round trip: Set3D stores the copy's live pose, the flush replaces it with the record's block (the same pose,
same bytes up to velocities), 19742 applies the record's block to the new 3D. The run's hooks on 36031 and 11977 reported neither call for the
form and the in-window log never printed: if the liveness totals for `flushEntry` and `savedHavokSet` are zero across a run in which a 3D was
released and a finish pass ran, those two hooks were not live (the ready row's `attachErrors` says), and the next probe must read the state
instead of trusting hooks: GetByType (12329) for 0x3C on the extra list at every snapshot, with the sub-buffer's [version, varint length] header
and the FNV-1a of its block against the record's block and against a fresh 36016 of the live pose; and the kind-2 map's occupancy (capacity at
+4 minus the free count at +8 of the map at mgr + 0x208 + 8 + 2 * 0x30). If instead the hooks were live, the record's block never reached the
map: the disassembly at 0x1406038db shows r8d carrying the entry's flags into 35716, and 35717's call into 35587 zeroes r9 (0x14060edec), so the
block is queued under the form by 36023 (the key is the form 35987 resolves from the BGSLoadFormData) and the flush walks every occupied slot
(36026 empties the map: entry[2] nonzero marks an occupied slot); a silent flush then has no static explanation, and the map occupancy row settles it.

**The releaser.** Nothing in 35569, 35717, 37650 or 37502 releases a level-0 actor's 3D (37502 releases only for level 0xFFFFFFFF, when it destroys
the process; 35717's Set3D branch needs the TES cell test 13308 to fail, which it cannot for cellState 7; Actor::Update3DPosition only moves the
character controller and the node). The release is in **ExtraDataList::LoadGame (12095), case 0x2D kLeveledCreature** (HYPOTHESIS, decompile):
the saved extra's two bases are read as 3-byte ids and a u32 after them; then `if ((ref && Get3D2(ref) && newTemplate && newTemplate != stored) ||
kLoading is CLEAR) 12358(ref, 0, 0)`: outside a game load the 3D is released unconditionally for a reference that carries the extra; then, when
both bases resolve and the original has templates, a NEW leveled TESNPC is built from them (14375, the template builder, unread), the reference's base is replaced through slot
0x84 (`SetObjectReference`, TESObjectREFR.h) after the old created base is released, the saved NPC_ change flags (the u32) are loaded into the new
base through its own slot 0x0F with the buffer's flags swapped in for the call, and a race change releases the 3D once more. The bandit's entry
carries kLeveledActor (bit 18), which selects the 0x2D extra (the mask table, Q1 of the REFR read), so every mid-game apply of a leveled actor's
record releases its 3D and rebuilds its base. Other releasers in the apply tree, not taken here: 12095's case 0x58 kModelSwap (Set3D plus the
removal of a saved Havok extra), 19529's base-object change (bit 7), 19799's cell move, 37502 at level 0xFFFFFFFF, and in the finish pass
Actor::InitLoadGame (37651) for an actor at level 2 or 3 or whose process flags a model update (AIProcess::Update3DModel 39395 through 12358).

**The rebuild.** The release leaves the actor loaded without 3D in an attached cell; the engine's own loader (the actor's update queues the model on
the task pool: HYPOTHESIS, the request is not in the apply's tree) completes 14 ms later with the model cached, on the task thread: 13355 detaches
an old node under the reset flag (19587, 19589, 19590: formFlags bit 15 and bit 19), runs 37501 (the process-level update: the persistent bandit
stashes nothing, Q5 and Q7 above), 18978 (the cell's 3D build: a second finish pass under the suppress bit, nothing pending), attaches the node
(19730), 19742 (the 3D init: NiAVObject::Update, the actor's 37644, slot 0x66, then 11979: the saved Havok data applied and the extra removed, then
the actor's 37616, 37364 and the process re-attach), and queues the actor's post-load work (41343). FinishLoadGame (37652) had run inside the probe's
35567 WITHOUT 3D, so its physics block (layer, motion type, the world re-add) did nothing; the new node's physics came from the load path, and the
pose from the extra at +14 ms. lab-api's `is3DLoaded true, isDead true` 10 s later is that node.

### Q2. The park route: the script creating the ExtraSavedHavokData itself
11977 is `(ExtraDataList* list, BGSLoadGameSubBuffer** holder)` (HYPOTHESIS, decompile): under the list's write lock (+0x18; ExtraDataList.h:41,
:202), a null `*holder` removes the 0x3C extra; otherwise GetByType 0x3C, or allocate 0x18 bytes, set VTABLE_ExtraSavedHavokData (186773) and
ExtraDataList::Add; an existing one logs the "already saved havok data" line and frees its old sub-buffer; then `extra->havokBuffer = *holder`
(ExtraSavedHavokData.h:17): the pointer is TAKEN, not copied, so the script allocates it on the engine heap (68115) in the queue's own shape, the
one 36023 builds and 36019 reads: `u8 version (35740's 0x4E), varint length (35529's encoding, 36052's: value << 2 | width), the 19534 block`, the
block being the bytes between the initial data's fixed part and the end of the record's initial data (the actor script's `havok.blockStart` and
`blockLen`: flags, varint count, pitch and roll, the bodies). The consumer is 19742 through 11979 and 36014: 36019 copies the block into scrap memory,
sets the buffer's version from byte 0 and FREES the sub-buffer (MemoryManager::Deallocate) and nulls the holder, 19535 applies it with its own
rules (the live count against the varint count, the REFR position within 4096 of each body, dynamic motion for a dead actor, the mismatch logs),
35994 frees the scrap data, 12354 removes the extra. Thread: 19742's, the task thread 13355 runs on or the main thread of a cell attach (19061,
19220). Timing: the call must land AFTER the release (so Set3D's own store, if any, is the one replaced: the "already saved" log is the proof it
was) and BEFORE the load completes, that is right after 35568 returns and before 35567, on the main thread; the window was 14 ms in the run,
long enough for one call but not for a poll. The record's block already parks itself through the flush when the flush sees the map entry; the
script's own 11977 is the belt to that brace, and the log line distinguishes the two.

### Q3. The re-apply route: handing the block to 19535 after the 3D returns
The clean call is **36014(holder, form)**: it is 11979's body without the extra: a stack BGSLoadFormBuffer (35993, 35984, VTABLE_BGSLoadFormBuffer),
36019 from the sub-buffer (consumed and freed), AsReference1, 19535(ref, buf) or the log "Form '%s' %08X with queued havok data is not a reference",
35994. So the script allocates the same [version, varint length, block] sub-buffer on the engine heap, polls the root on PlayerCharacter::Update's
returns until data3D is non-null (and, to be sure the init is done, until a liveBodies count equals the record's), then calls 36014 on the main
thread. What 19535 needs around it (HYPOTHESIS, decompile): the 3D present (else only the log); the pre-pass count equal to the saved count (else
the "bone count differs" log and no body touched); the REFR position already at the record's (35717 set it; each saved body farther than 4096 units
is skipped); the actor dead or dying, so the node's motion type is set dynamic (a living actor is set keyframed and the animation keeps the pose);
and the ragdoll driving, since the mismatch between saved and live kAnimTargeted bits logs "Behavior ragdoll save/load state mismatch" and an
animation-driven body overwrites the written transform on the next step. No bhkWorld lock is taken by 19535 or 19538; the engine runs this exact
path from the task thread (13355) and from the main thread (the flush), so the main thread at an Update return is a place the engine itself uses
(HYPOTHESIS: safe). Risks: a second apply after the 3D init already applied the extra moves the bodies twice (harmless if the bytes are the same);
a 19535 on a copy whose bodies are still keyframed by the death animation changes nothing visible; the velocities in the block are the owner's at
its kDead mark (near zero for a settled corpse).

### Q4. Which route for the cross-seat apply, and what the first run must read
The park route is the engine's own and costs one call: after 35568 returns (the 3D gone) and before 35567, `11977(ref + 0x70, &sub)` with the
owner's block; the reload then applies it where the engine applies a save's corpse pose, with the engine's count check and logs. The re-apply
route (36014 after the root returns) is the fallback for the case the reload does not happen (a record without the 0x2D extra, that is a
non-leveled actor whose LoadGame does not release the 3D) and the check for the case it does (a second, idempotent apply). Cheaper and safer is the
park; the re-apply needs the poll and a decision about doubling. The first run must read, with the witnesses moved off the window: (1) the
releaser: 12358's and 19730's return addresses when the form's 3D goes (expect inside 12095's 0x2D case); (2) the extra: GetByType 0x3C at every
snapshot and at 19535's entry, with the sub-buffer header and the block's FNV-1a against the record's and against 36016's live pose; (3) the
"already saved havok data" log and the two mismatch logs, printed for the whole run (35519 ungated); (4) the kind-2 map occupancy before 35568,
after it (expect one more) and after 35567 (expect empty); (5) 19538, SetPosition and SetRotation counted per 19535 call for the form on any
thread (expect one pair per non-root body, 18 for 19 bodies); (6) the root's return time (the first Update return with data3D non-null) and the
pending count across the reload's second finish pass; (7) headZ and the root z against the owner's after the reload settles.

### What this read settles and what stays HYPOTHESIS
- CONFIRMED-STATIC: the slot 0x6C addresses (Actor::Set3D 37178 on both vtables), the Set3D wrapper 12358, 13355 as the data3D setter's caller on the
  load path, the queue's key (the form) and the flush's full walk (36026 and 36027), the flags register into 35716 and the zeroed r9 into 35587.
- HYPOTHESIS until a run: that 12095's 0x2D case is the releaser on this seat (a hook on 12358 with its return address decides); that Set3D stored
  the live pose and the flush replaced it (the log and the extra's bytes decide); that 19742 applied the record's block at +14 ms (the per-body
  counts decide); the thread of 19742 (4560 by the run); the safety of 36014 on the main thread.
- Open: who queues the model reload after the release (the actor's update or the base swap), whether 19742's apply precedes or follows the
  process re-attach for the ragdoll's motion type, and the content of 36016's block for a settled corpse against the record's.

## Run 20261103-174905: the pose after the apply's 3D reload (17:49Z 11-03, numidium's run, thuum-cf's read of the rows)

x-apply-roundtrip v2, c1 solo on the r3 image (m3-system1-r3 df9e1009's server), apply-on-demand.js v2.1 (fb244ad7), PARK false, the
dead promoted bandit 0x39fe4 again; 1.6.1170 at base 0x7ff6834a0000, pid 2656, the main thread 6604; every hook resolved with its first
bytes as the static read gave them. The rows (frida/c1-apply-on-demand-...-7.js.jsonl, 70 rows), times relative to the finish pass at
17:50:31.613Z:

- The first kLifeState mark (17:50:29.469Z, thread 4932) was refused on one premise, "actor dead (lifeState 2)": the first 0x400 mark is
  the dying step; the second mark 2.0 s later (thread 11824, a task thread) found kDead, deferred 16 ms to PlayerCharacter::Update's return
  on 6604 and passed every premise (the entry present with a null record, D7; flags 0x9a040427). B1's two marks 2 s apart, as recorded.
- before: lifeState 2, level 0, the root 0x1ea50b99d90 at (-3742.66, 817.29, 591.21), angle z 5.377, 19 live bodies (18 active, 1 asleep;
  flags 0x14), no ExtraSavedHavokData, the kind-2 map empty (capacity 0), the live pose by 36016: version 78, 993 bytes, 19 bodies, FNV-1a
  0xe662d9bf.
- The record built on demand: ACHR (type 1), version 78, 4,452 plain bytes (FNV 0xd34298dd; the framed record 0x33e582c5), its Havok block
  the same 993 bytes with the same hash 0xe662d9bf: the record is this body's own serialization at the mark, so the record's block and the
  live pose are the same bytes by construction. 35568 took it with flags 0x8a040427 (kInitingForms 0x10000000 dropped) and returned 1.
- after apply (the same millisecond): the root null (the leveled release inside 35568), pending 1, an ExtraSavedHavokData PRESENT with
  sub-buffer 0x1e9b920c020: version 78, 993 bytes, 19 bodies, hash 0x8c7368f2, the release's own store of the pose, different in content
  from the 36016 block of 2 ms earlier (the same length; the moment or the encoding, HYPOTHESIS below); the kind-2 map now holds the form
  (capacity 8, occupancy 1, keyed by the form POINTER, not the id) with sub-buffer 0x1e9b884efd0, the record's block as 35568 queued it.
- finish 35567 (the same millisecond): pending back to 0, the kind-2 map empty, and the extra's sub-buffer is now 0x1e9b884efd0, the very
  pointer the kind-2 map held, hash 0xe662d9bf. The finish pass moved the record's block out of the queue into the extra and replaced the
  release's store: identity by pointer, not only by hash.
- +35 ms (17:50:31.648Z): data3D set to 0x1ea50b986b8 on thread 11824 (the mark's own task thread; caller RVA 0x1a0a6b). +36 ms: 19535 on
  the same thread (caller 0x62586f, 36014's path, outside any window) read the saved block 0xe662d9bf (19 bodies, 993 bytes) against 19 live
  bodies (flags 0x15); the extra was present at its entry with its sub already detached (sub 0x0: the reader takes the buffer before the
  call); 19 havokBody calls; SetPosition 1 and SetRotation 1.
- rebuilt, 49 ms after the root appeared (172 ms after the finish): the root at the same position and angle as before the apply, the extra
  gone (consumed), the kind-2 map empty, 19 bodies (18 active, 1 asleep), the live pose by 36016 now 0xc05e84c (993 bytes).
- settled, 5 s later: (-3733.19, 811.43, 589.79), 11.2 units of drift, angle z 0.885, all 19 bodies asleep, the live block 561 bytes
  (0x682255e1): a sleeping ragdoll serializes shorter than an awake one.
- result: poseSource "the record's block", judged by the block 19535 read; liveHash equal to the record's by construction; parkHash null;
  lastStored null. Liveness at the end: havokRead 1, havokBody 19, havokPrePass 1, rigidSetPosition 1, rigidSetRotation 1, setData3D 3,
  savedHavokSet (11977) 0, flushEntry (the hooked 0x6264e0) 0, formsLog 0 (none of 35519's logs carried the form or the known strings: no
  "already saved havok data", no mismatch).

### What this run settles

- CONFIRMED by run: on a loaded LEVELED actor the mid-game apply releases the 3D inside 35568 and stores the pose in an ExtraSavedHavokData;
  the finish pass parks the RECORD's block over that store (the sub-buffer pointer moves from the kind-2 map into the extra); the rebuilt
  3D's init consumes it (19535 on 36014's path, 36 ms after the finish, on the task thread); the body re-lies within 11 units after 5 s.
  PARK is not needed for a leveled actor: the engine's own path carries the record's pose to the rebuilt body. change-forms.md C4 (numidium,
  1d527cec) says the same.
- Corrected expectations from the static read: Q4's (5), one setter pair per non-root body (18 for 19), was wrong for the off-thread read
  that did fire: SetPosition and SetRotation ran once each inside 19535 on thread 11824, so the per-body application goes another way (the
  19 havokBody calls; a motion-state write or a setter the script did not hook), HYPOTHESIS. The MAIN-thread zeros (savedHavokSet 0 for the
  park inside 35567, flushEntry 0, formsLog 0, no 12358 row for the release inside 35568) are NOT evidence of other paths: they are Frida's
  listener guard (the subsection below), which blinds every hook on the recipe's own thread while the recipe runs inside Update's onLeave.
  First written here as "other paths" and corrected 18:5xZ 11-03. The extra's bytes and its sub-buffer pointer, read after each call, are
  the witnesses that decided, and they suffice; v2.2's replace-based trigger lets the on-thread rows appear in the next run.
- Open, for the cross-seat run: a one-seat round trip cannot separate the record's block from the live pose at the mark (the same bytes), so
  the owner's record applied to a GUEST copy whose pose differs is the run that shows a guest body taking the owner's pose; by this run's
  mechanism it will (the release's store is replaced either way on the leveled path). Also open: why the release's store (0x8c7368f2)
  differs from the 36016 block of 2 ms earlier at the same length (the bodies detached from the world before the store, or a changing field
  in the block); a dump of both blocks in the next version decides. And the non-leveled actor (no release, no rebuild): there the flush
  feeds 19535 directly on the standing 3D, unread.

## D6: the record's ids across seats (numidium's premise before any cross-seat actor apply; the census to run)

A change form names other forms as 3-byte numeric ids (BGSNumericIDIndex, "Evidence (the form-id map)" above): the top two bits are the
kind. Type 1 is a load-index-00 form with its 22-bit id: portable to any seat with the same masters. Type 2 is a created form (0xFF): the id
is this seat's, assigned by its own engine at creation; another seat's clone of the same thing has another id, or none. Type 0 is an index
into this seat's and this session's form-id map (35554 at mgr + 0x298), assigned in first-encounter order or the loaded save's order: it means
nothing on another seat, and only the seeded index 0 (three zero bytes) is null everywhere. So before a record crosses seats, which ids it
carries decides what must be rewritten. The REFR round trip (131511) never met the question: a door's record names its base and cell by
type 1 and its lock key by the null. An ACHR's record is where it bites: a leveled actor's base is a runtime clone (type 2 by the rule), its
inventory and spells may come from plugins (type 0 on this load order: SPID distributes forms into every NPC's record), and
Actor::LoadGame's base swap with a wrong form is worse than with a null one (the null leaves the base as it was, the REFR note's silent
case).

**The census (serialize-on-demand-actor.js v2, CENSUS default true; new code, its fresh review before its first run).** Inside the
serialize recipe only (attached after the scratch buffer's constructor and before 36037, which writes the header's own id; detached after
the pack), 35928 is hooked on the recipe's thread: onEnter takes edx as the id and rcx as the 3-byte output (BGSNumericIDIndex.h:25-30
declares SetNumericID(FormID) on the 3-byte struct, its kind bits are CommonLib's Flags::kDefault 1 << 6 for load index 00 and kCreated
1 << 7 for 0xFF at :10-14, and the disassembly at 0x620240 stores the three bytes big-endian through rcx with edx the id); onLeave reads
the bytes back and emits one `id` row (seq, id, kind, the 22-bit value, the encoded bytes, the type-0 index, the plugin byte, the caller's
RVA, the form's type byte through the engine's own LookupByID 14617 at 0x1e01a0, the thread), capped at 400, then an `idCensus` summary at
the recipe's end (total, counts by kind, every type-0, type-2 and type-3 id with its form type, plugin and caller, and the myKiller field
matched by its bytes). The caller RVA maps a row to its writer (36037 the header, one site; 35715 the initial data's cell ids, five sites; 36048 and 36047
the body's; 35928 has six more code callers, 24098, 24258, 24290, 25235, 53826 and 53831, vtable-only or save-impl helpers, and 36077 is
the save stream's: a caller outside the four names a field the decode does not section, not a hook fault); CommonLib's LookupByID (TESForm.h:210-220) is an inline over GetAllForms() under its read lock, and the decompile at 0x1e01a0 (14617, which
Ghidra leaves unnamed) takes LockForRead and UnlockForRead on allFormsMapLock (400517) around the hash walk of allForms (400507): the inline
in the binary (HYPOTHESIS until the run, rule 2). The read lock returns at once to its own writer thread and otherwise waits only on a held
write bit (BSAtomic.h:70-91), so the census adds the wait any main-thread LookupByID has; the recipe thread holds no all-forms lock (inside
12094 it holds the subject's ExtraDataList read lock), and it runs on the serializing thread, Main's under DEFER. HYPOTHESIS until the run: that every 35928 of the
recipe is on the recipe's thread (the gate would drop another thread's silently; total against the record's id-bearing fields tells).
First run, 20261103-183149 (numidium, the bandit, v2.1 on the r3 image): the recipe ran at both marks (records of 4,774 and 4,460 plain
bytes), the ready row proved the hook (0x620240:40534883) and the attach raised no error, yet both idCensus rows read total 0 with
droppedOtherThreads 0: the hook was live and never entered. The cause is Frida's listener guard (the subsection below): the recipe runs
inside PlayerCharacter::Update's onLeave, so 36037's call to 35928 bypassed the hook on that thread. The resident run 183432 (Sven 0x13491)
is void for the census by the same rule; its record bytes stand. v2.2 moves the trigger to a replacement; the census reruns on it.
Second run, 20261103-192013 (numidium, the bandit, v2.2 8838368e, c1 solo, GREEN): the fix's checklist held (updateReplaced true,
attachErrors [], updateThread equal to mainThread 10196 in every liveness row, updateFaults 0; both marks armed on non-main threads 1580
and 11220 and premised on the main thread through PlayerCharacter::Update in 10 and 17 ms; the first id row seq 0, kind 1, 0x39fe4 in
'header (+0x18, 36037)'; the writer marks no longer empty: refr 1061 to 1201, process 1201 to 4448, actorState, four modifiers, avStorage
4640 to 4778 at kDying; cleanup 'runs spent', reverted true, at the second run; droppedOtherThreads 0). D6 for a LEVELED actor: byKind[2] is
0 at both marks (178 and 149 ids), so the clone is NOT written as a base under bit 7 and the loader rebuilds it from the two templates (C4's
reading); kind 3 is 0; of kind 0, 62 and 49 rows are the seeded null 000000; the real type-0 ids are SPELLS (formType 0x16): at kDying
0xFE014817 (three times), 0xFE014819 and 0xFE01480B (a light plugin, FE:014; indices 10582 to 10584 appended in first-use order), at kDead
0x2B005373 (index 10585), all through the id writer at 0x627030 (inside 36048) with offsets inside the PROCESS region, none in the
inventory. So the inventory's drop rule (paragraph 3 below) does not cover the bandit's record; the AI process block's reader of those
spell ids (39430 and callees: null, or another form under a receiver's reused index) is the safety read before any cross-seat apply of it;
queued to the re-analyst. Design note (numidium): the census rows ARE amendment F's re-encode table: each type-0 row carries the record
offset of its three bytes and the sender's full form id, so a receiver can look the same form up in its own map (35554 inserting on a miss)
and patch the three bytes with its own index before 35568; the census hook is the sender's half of the re-encode, a receiver-side Frida step
is the probe's half, the client's native the ADR's.

**Subjects and expectations, and what the censuses read.** Expected: the dead promoted bandit 0x39fe4 (a leveled base) with a type-2 base
(the clone), type-1 cell and template ids, type-0 indices for any plugin form; a Riverwood resident (a game-file base) type 1 throughout
except the plugins' distributed forms. Read (v2.2, 192013 the bandit, 192345 Sven): the type-2 expectation is REFUTED for both, byKind[2] 0
at every mark (the clone is not written as a base; the loader rebuilds it from the two templates); kind 3 is 0; and the type-0 ids are the
SAME five spells in both records, all in the AI PROCESS block, none in the inventory: 0xFE014817 (three times), 0xFE014819, 0xFE01480B at
kDying and 0x2B005373 at kDead (Sven's kDead record: 3,420 bytes, FNV-1a 0x7dd12708, flags 0xaa000427, raw; 152 ids, 103 type 1, 48 nulls,
1 type 0, encoded 00 29 5a at record offset 2097, index 0x295a = 10586, the one patch site). The indices are session-local by direct proof: 0xFE014817 is index
10582 in the bandit's session and 10583 in Sven's. So no subject on this load order has an all-type-1 record, the inventory's drop rule
(paragraph 3 of the static read) covers neither, and the AI process block's reader of those spell ids is the safety read before any
cross-seat apply (queued; the paragraphs below when they land). Sven's dead body in 192345 lay at (20954.6, -45804.7), head
(20914.9, -45844.9), about 68 units from 183432's: ragdolls land differently per session, so a match after a cross-seat apply means
something.

**The receiver's half of the re-encode (the REMAP step, apply-on-demand.js v2.3, to write and review).** A LAB_PARAM string of rows
`offset:formId:index` (Sven: `2097:0x2B005373:10586`), applied to the RECORD bytes after the record parses and the SUM over the sender's
bytes is verified, before 35568. Per row: the three bytes at the offset must decode to type 0 with exactly the row's index, else the run
refuses (a wrong offset never patches); LookupByID(formId) on the receiver (14617) must be non-null, its form type recorded (a null refuses:
the encoder would mint an index for a form this seat lacks and the reader would resolve it to null later); the receiver's encoding comes
from the engine's own encoder, 35928 on a 3-byte scratch with the full form id (the function the census watched), never from an index the
script computes; the bytes are written and a `remap` row emitted (offset, formId, from, to, the receiver's index, formType); the record's
FNV-1a is recomputed for the apply row. Rows whose bytes decode to type 1 or 2 refuse (nothing to remap: a wrong row). HYPOTHESIS: 35554's
insert on the receiver's map is safe on the main thread under the replacement (the engine's save path does it). This is the probe's half;
the client's native does the same on every received record once amendment F is accepted.

**Consequences, as options for the ADR (no decision here).** Type 0: re-encode per seat; the sender's reverse map (GetNumericID 35927 through
35555) gives the plugin form id, the wire carries it plugin-relative (as ADR-043 already stores every form; each seat resolves it to its own runtime
id), and the receiver's SetNumericID assigns its own index at the apply. Type 2: the server's created-form map (each seat
reports its clone's id for the actor; the server translates on relay), or, when the census shows the clone is the record's only type-2 id,
a receiver-side rewrite of that one field to the receiver's own clone. Type 3 should not occur for any vanilla id: a load-index-00 id with bit 22 or 23 set would alias to kind 3 (or to kind 1 short a bit),
and no vanilla master reaches 0x400000, so a kind-3 row on this load order is that aliasing or a hook fault, aliasing first; never a form.

### D6 static read: LoadGame's walk over a record from another seat, and why a header flag cannot be masked (re-analyst, 18:5xZ 11-03)

Numidium's objection to masking kInventory in the apply's FLAGS parameter, settled by the decompiles (pyghidra on the unpacked 1.6.1170
exe; `f` is the reader's change flags, BGSLoadFormData::changeFlags at BGSLoadFormBuffer +0x40, BGSLoadFormData.h:28, which the decode 36080
fills from the Value's flags, so the apply script's FLAGS parameter is exactly `f`; everything from a decompile HYPOTHESIS by rule 2).

1. TESObjectREFR::LoadGame (19529, 0x2da720) walks the body in this order, each section gated as written: TESForm::LoadGame (14613) under
   `f & 1` (6 fixed bytes: formFlags and inGameFormFlags under masks); the base under `(f >> 7) & 1` (one 3-byte id through the load-side id
   reader 36000, LookupByID 14617, RTDynamicCast to TESBoundObject; when NON-NULL and different from the current base, 12358(ref, 0, 1), C4's
   lock-wrapped Set3D(nullptr), then slot 0x84 SetObjectReference; a NULL skips the swap and keeps the base); kEmpty `(f >> 21) & 1` for
   non-actors (no bytes); the scale under `(f >> 4) & 1` (4 bytes); the extras under the COMBINED non-zero test `(f & (isActor ? 0xa6061840 :
   0xa6021c40)) != 0`: ExtraDataList::LoadGame (12095), a count-prefixed list of [type byte, a payload only that type's case knows], self-
   delimited; the inventory under the COMBINED test `(f & 0x8000020) != 0` (bit 5 or bit 27 alone consumes it): InventoryChanges::LoadGame
   (16143) over [varint count, entries of 3-byte id, i32 countDelta, varint n, n extra lists], self-delimited; kAnimation `(f >> 28) & 1`:
   the queue read 36023, the ONLY length-prefixed section (a varint length, skippable); kOpenDefaultState for non-actors (no bytes); an
   unconditional no-byte tail. So a flag bit cleared without its bytes cut either changes nothing (the other bit of a combined mask still
   consumes the section) or starts the next reader on the wrong bytes.
2. Actor::LoadGame (37650, 0x686de0) and Character's (40267, 0x727d50, an inlined copy that jumps into 37650's tail) read the actor block
   UNCONDITIONALLY and check nothing: u32 level to 37502 first (the process destroyed or created), u32 boolBits, then 19529, then
   AIProcess::LoadGame (39430) whenever a process exists (no flag test, no count check), then fixed fields, ActorState (18 bytes applied
   whole, lifeState included), handles and MagicItem ids by 3-byte id, four Modifiers blocks, ActorValueStorage (39024: varint counts into
   fresh allocations), the spell list (u32 count), the movement controller, the combat block, and three tail fields gated only on the
   header's version byte. No magic, no section length, no count bound: a misaligned start feeds counts and ids from inventory bytes, so the
   failure is silent corruption for small garbage (timers, lifeState, values, spells) and a hang or an access violation for a large count
   (an unbounded list loop, or an allocation of gigabytes returning null and written through); the only refusal on the apply path is 35569's
   type byte, which a flags-only mismatch passes. The only other readers of `f` in the chain: 39430's re-equip under `(f & 0x8000020) != 0`
   and Actor::Revert (not run by the apply).
3. InventoryChanges::LoadGame (16143, 0x239350): the owner's existing kContainerChanges extra is removed first (11938), then a fresh
   InventoryChanges (16040, or a stack one when the owner can carry none; the bytes are consumed either way) is filled entry by entry
   (16030: the id through 36000 and 14617, countDelta, the extra lists through 12095); then `if (entry->object == NULL ||
   !TESForm::IsInventoryObject(object))` (14538) frees the entry: DROPPED, no log, no fault, the walk aligned. A type-0 index missing from
   this seat's form-id map decodes to 0 (35927 through 35555, the REFR note's silent case), 14617(0) is null, so a guest applying a sender's
   record keeps every vanilla item and silently loses the sender's plugin items, and its own prior inventory changes with them. For D6 the
   inventory's type-0 ids are therefore a loss, not a crash, with one case beside the drop (numidium): a type-0 index the receiver's map
   DOES hold, for another form, substitutes that item instead of dropping it; both lab seats load the same clean-m1-next save, whose
   form-id table seeds both maps in the file's order (35559), so the early indices may coincide and the substitution is plausible, not
   exotic; the receiver's worn list before and after the apply tells which happened. The base's type-2 id (bit 7) is the danger: null
   keeps the base, a DIFFERENT created form on the receiver (the receiver's own clones take the same 0xFF ids in their own order) swaps
   the base to the wrong actor.
4. A cut is feasible: the recipe's 0x0E (40266) reaches 19528, which calls InventoryChanges' save (16142, 0x239220) exactly once under the
   same `(flags & 0x8000020) != 0` and writes the whole inventory block between its entry and its return (the count placeholder, per entry
   the id, the count delta and the extra lists, the count patched last by 36052, which may INSERT bytes when the count outgrows the
   placeholder), so a mark hook on 16142 on v2.2's now-visible recipe thread, reading buf+0x14 at entry and at RETURN, brackets the span; a
   sender-side cut of those bytes from the raw plain body, bits 5 and 27 cleared in the header flags the apply writes through 35509, and
   length1 rewritten (a deflated record inflated first) yields a body 19529 walks consistently, since 0x08000020 gates nothing else there and
   its only other reader, 39430's re-equip, is then skipped (the guest keeps its own equipment). Not before the census; a record whose own
   0x0D cleared both bits needs no cut.

## Frida's listener guard: a recipe run inside a hook callback sees none of its own callees' hooks (read 18:4xZ 11-03)

frida-gum's interceptor (gum/guminterceptor.c at main c73c1bbf, 2026-11-02) sets a thread-local guard key at the start of every hooked
invocation (_gum_function_context_begin_invocation, gum_interceptor_guard_key set at :2254) and bypasses any hooked function entered while
the key is set (:2249-2252, "goto bypass"); the key stays set while the on_enter listeners run and is cleared at :2364, before the jump to
the original or to a replacement (:2379-2385); _gum_function_context_end_invocation sets it again at :2415 around the on_leave listeners and
clears it at :2480. Inside a replacement's body the key is clear, and only the replaced function itself bypasses (the calling_replacement
check at :2260-2271), which is the documented chain-to-original idiom (frida.re/docs/javascript-api, Interceptor.replace). The NativeFunction
`traps` option is unrelated: its default does invoke Interceptor callbacks; `none` suppresses them; `all` adds Stalker.

Consequence for every script here that defers a recipe to PlayerCharacter::Update's onLeave (the REFR script's DEFER, the actor script,
apply-on-demand.js): the recipe's own calls, and everything the engine does inside them on that thread, bypass every hook of the script on
that thread. Rows that this voided: the actor script's writer marks (marks [] in 153648, 153929 and 183149; the decode worked from the
bytes) and the id census of 183149 (total 0); apply-on-demand.js 174905's release row (12358 inside 35568), the park's 11977 row inside
35567, the flush entry and the forms log on the main thread. Rows it never touched: anything on another thread (19535 and data3D on 11824
in 174905, the post-apply snapshots, every pointer and byte read after a call), so C4's pose verdict and the sub-buffer identity stand.
Reading rule from now on: a "0 calls" count for an on-thread callee of a recipe run inside a listener reads as unobserved, never as absent.

The fix (v2.2 of the actor and apply scripts): the trigger becomes Interceptor.replace on PlayerCharacter::Update (Actor.h:371, slot 0xAD,
`Update(float a_delta)`) with a NativeCallback that chains to the original through a NativeFunction at the same address and then runs the
pending recipe outside any listener; the AddChange hook only arms; Interceptor.revert in the cleanup. Its fresh review (FIX FIRST, two
blocking, applied as written) added two facts: the chained original runs with exceptions 'propagate', because NativeFunction's default
'steal' wraps the engine's whole frame in Frida's exceptor and turns any exception in it, a C++ throw included, into a JS throw (a longjmp
out of the engine with no crash and no dump; gumquickcore.c:4540-4541, :4805; gumexceptor.c:530-548; gumexceptor-windows.c:135-137), so a
fault is now the engine's own crash with its dump; and one replacement per process on an eternalized script (frida-inject -e), so the
actor script replaces only for a deferred serialize run, both revert on runs spent, result or a 600 s TTL, and a second instance on an
unrelaunched seat would read "already replaced this function" (every lab run relaunches its seat, so each census is one fresh instance).
Expected on the next runs: the census
rows (the header's kind-1 row from 36037 first), the writer marks, and in the apply the release row with its caller inside 35568 and the
park's savedHavokSet row with `ours: false` inside 35567.
