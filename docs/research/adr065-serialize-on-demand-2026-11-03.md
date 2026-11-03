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
| TESForm::CheckSaveGame default (returns 1, TESForm.h:136's comment), TESForm::SaveGame default, TESForm::FinishLoadGame default, TESForm::LookupByID | 0x1e0030, 0x1e0040, 0x1e0180, 0x1e01a0 | 14611, 14612, 14615, 14617 | Ghidra's imported names; callees of 19527 and 19528 |
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
