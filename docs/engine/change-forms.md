# The engine's own change tracking: the engine model (ADR-065's ground)

Written 03:3x PST 2026-11-03 (numidium) under Eli's goal for the night: a breakthrough that makes scripts, containers and
physics easy, and better use of the RE box. This is not one of ADR-064's five frozen systems. It is the model under all of
them: how the engine itself marks, stores, serializes and re-applies a form's persistent state, which its save game uses.
ADR-065 (PROPOSED) builds the wire on it.

The reading rule is non-owning-seat.md's. A code read or a decompiler read is a hypothesis with a source. A row is CONFIRMED
only with the run that saw it. The run ids are the lab's.

## 1. Sources

- CommonLibSSE-NG headers, in this tree:
  - TESForm.h:133-141: the virtuals AddChange 0x0A, RemoveChange 0x0B, CheckSaveGame 0x0D, SaveGame 0x0E, LoadGame 0x0F,
    InitLoadGame 0x10, FinishLoadGame 0x11, Revert 0x12.
  - The ChangeFlags enums: TESObjectREFR.h:141-160, Actor.h:234 on, TESQuest.h (kQuestStages at :208), TESObjectCELL.h:146-152,
    TESNPC.h, TESObjectDOOR.h, TESObjectBOOK.h, TESFaction.h, BGSEncounterZone.h, BGSLocation.h:78-79, TESPackage.h.
  - BGSSaveLoadGame.h: Flags, GetChange at RELOCATION_ID(34655, 35577), the changes map and the queued sub buffers.
- UESP: "Skyrim Mod:ChangeFlags" (https://en.uesp.net/wiki/Skyrim_Mod:ChangeFlags), the REFR and ACHR change form pages and
  "Skyrim Mod:Save File Format". They give the same bits as CommonLib: CHANGE_REFR_MOVE bit 1, CHANGE_REFR_INVENTORY bit 5,
  CHANGE_QUEST_STAGES bit 31.
- The static read: the re-analyst, 2026-11-03, pyghidra-mcp on SkyrimSE-1.6.1170.0.exe.unpacked.exe (REA did not connect).
  Address Library ids are AE ids for 1.6.1170, resolved by lab/addr.py. It renamed 11 functions in the Ghidra project.
- The census: lab/frida/change-census.js (main 5bcead1b), run on probe x-change-census v2 (by path, sha1 b56bde2d).
  - The run: 20261103-111808, solo on c1, in Riverwood after a typed `coc riverwood`.
  - Its ready row's pid (10376) matches none of the run's skyrim-platform log names. The trace is still this run's process:
    its rows carry the run's own acts at their times, Sven's death at the kill step and the player's equip at the equip.
  - v1 (20261103-111425) went red on its premise before the attach: the teleport step needs a server.
  - v2's one claim (Sven dead) sat in a top-level asserts block, which the loader dropped unread (fixed on main 24b864ab: an
    unknown top-level key is now refused). So v2's green says every step ran, and the death is the trace's kLifeState rows.
- The census script's fresh review (FIX FIRST on v1). Its findings bound what v2's trace can show, in section 2(e).

## 2. The claims

### (a) The observe point

| Row | Claim | State | Evidence |
|---|---|---|---|
| A1 | TESForm's slot 0x0A body (AL 14607, RVA 0x1dff90) is shared by 57 of the 59 form classes probed: REFR, every actor class, CELL, QUST, GLOB, DOOR, CONT and the projectiles. TESNPC alone overrides it, with TESActorBase's AL 24385 (RVA 0x3a93a0). | CONFIRMED | The census's ready row read the slot in all 59 vtables (20261103-111808). The re-analyst counted 145 vtables pointing at 14607. |
| A2 | AL 14607 forwards to BGSSaveLoadGame's AddChange (AL 35576), which applies the gates and then ORs the flags into the changes map (AL 35507), one uint32 per form id. The flags coalesce, and the return means "passed the gates", not "new bits". | HYPOTHESIS | The re-analyst's decompile of 14607, 35576 and 35507. |
| A3 | The gates refuse a mark in four cases: a suppression bit (TLS +0x670 bit 0, or BGSSaveLoadGame.flags bit 0, which CommonLib names kGlobalAllowChanges but which suppresses); a kTemporary form (formFlags bit 14); form id 0; a deleted created reference that is not persistent. | HYPOTHESIS | The re-analyst's read of 35576. |
| A4 | A forced entry (AL 14608) reaches 35576 with force 1, from six direct callers. Three of them are REFR paths marking kAnimation (0x10000000). The census did not hook it, so those marks are absent from 111808. | HYPOTHESIS | The re-analyst; the census review's item 3. |
| A5 | AddChange carries no value. It marks a category dirty, and the value is read from the live form when the engine saves it or unloads it. | HYPOTHESIS | The re-analyst (35576 and 35507). The census rows carry only the form and the flags. |
| A6 | A return to the default state is its own event, RemoveChange. A container's open marks kOpenState (0x800000) through AL 19683, and its close removes the mark through AL 19684. Each open and close calls again: no caller coalesces them. | CONFIRMED | 111808: BarrelFood01 0x1f229 marked at +22.9 s and +59.0 s, removed at +50.8 s and +63.2 s. The callers' return addresses (0x2e1534, 0x2e15b4) lie in 19683 and 19684. The static prediction was the re-analyst's. |

### (b) What reaches it, per act (20261103-111808)

| Row | Act | Marks | State |
|---|---|---|---|
| B1 | A Papyrus kill: npc-kill of Sven 0x13491 | kLifeState 0x400, twice 2 s apart (Actor::SetLifeState, AL 37612, CommonLib Actor.cpp:1034); kHavokMoved 0x4 (KillImpl, AL 37896, Actor.h:468's slot); kInventory 0x20 (AL 16066, 16067); kGameOnlyExtra 0x80000000; kFlags 0x1. Then kHavokMoved from AL 25857, 41 calls while the corpse settles. | CONFIRMED |
| B2 | An equip of an item the player lacked (Papyrus EquipItem adds it first) | The player's kInventory 0x20 at +101.7 s (AL 16066). | CONFIRMED |
| B3 | Havok: two PlaceAtMe drops of base 0x12fe7 at the player | At creation, AddChange with no flags (AL 13723, TESDataHandler::CreateReferenceAtLocation, TESDataHandler.cpp:183). Then kMoved once from SetPosition (AL 19790), and kHavokMoved every frame from AL 19826 (176 and 346 calls) while the body moves. kMoved from the Havok path answers false meanwhile, a gate. Each ref's stream stops about 5 s after its drop, at sleep. | CONFIRMED for the two drops |
| B4 | A global's write (GlobalVariable.SetValue on Survival's 0x81B) | Nothing: no row of type GLOB. | CONFIRMED (thuum-cf's counter-example, docs/research/adr062/papyrus-native-entries.md; TESGlobal's SaveGame and LoadGame are TESForm's defaults, the re-analyst) |
| B5 | A quest stage (set-stage on 0xb6031) | Not read: the quest did not start (the step answered started false, stage 0). Other quests' stage marks appear in the background (B6). | UNREAD |
| B6 | The AI alone, Riverwood, about 170 s | Actors' kMoved from SetPosition: 16,433 calls, about 97 a second, all answered true. ACHR kGameOnlyExtra from AL 28722: 24,780 calls, about 146 a second, the hottest key. kPackageExtraData 0x800 from AL 37713: 7,237. kCellChanged 0x8: 107. Doors opened and closed by NPCs: kOpenState added and removed 36 times each, by 19683 and 19684. kLockExtra 0x1000 from AL 19512: 15. INFO said once, bit 31: 63. kEncZoneExtra: 29. Two mod quests (0x30002859, 0x2b01e2c7) start and stop about three times a second (kQuestFlags, kQuestRuntimeData added and removed, kQuestAlreadyRun), a mod's loop to be named. QUST kQuestStages 0x80000000 from AL 25000: 86. | CONFIRMED that the AI's own state changes reach the observe point. This is system 5's class: the night lock, a package's door. |
| B7 | Load | 57,513 calls in about 170 s, 78 keys, no foreign type byte, no crash with the hooks on. | CONFIRMED |

### (c) Serialization

| Row | Claim | State | Evidence |
|---|---|---|---|
| C1 | TESObjectREFR's SaveGame, LoadGame and Revert are AL 19528, 19529 and 19532 (slots 0x0E, 0x0F and 0x12 of VTABLE_TESObjectREFR[0], 190259). Actor's are AL 37649, 37650 and 37653 (VTABLE_Actor[0], 207511). | HYPOTHESIS | The re-analyst; slot reads in Ghidra. |
| C2 | REFR SaveGame writes its sections in this order: TESForm's flags; bit 7, the base; bit 4, the scale; the extra data under mask 0xA6021C40 (0xA6061840 for an actor); the inventory under 0x08000020; bit 28, the animation. The initial data and the Havok data come just before, from AL 35715. LoadGame mirrors it. | HYPOTHESIS | The re-analyst. The masks match UESP's nine REFR extra-data flags and their order. |
| C3 | Actor SaveGame always writes an actor block, whatever the flags: the AI process, actor values, handles, four modifier blocks, magic-target data and movement. | HYPOTHESIS | The re-analyst. UESP's two "unknown" ACHR fields sit where it writes the process level and Actor+0xE8. |
| C4 | The engine calls LoadGame outside a save load only through AL 35569, on references whose 3D is not loaded yet. No engine path applies it to a 3D-loaded reference. | HYPOTHESIS | The re-analyst (thuum-cf's risk 1 stays open). |

### (d) The engine's own materialize path

| Row | Claim | State | Evidence |
|---|---|---|---|
| D1 | When a reference unloads, AL 35570 stores its record in the changes map in save-file format. It runs CheckSaveGame, writes the initial data (AL 35715), runs SaveGame, packs the result (AL 36081) and stores {flags, record} in the entry (AL 35509). The callers include the cell's unload (AL 19113). | CONFIRMED | 20261103-114726 (x-transplant-capture v1, c1 solo): FarmhouseAnimDoor01 0xe3a7a in the Sleeping Giant, locked by `lock 50`. Its entry at the attach held flags 0x90000000 (kGameOnlyExtra, kAnimation) and no record, since the cell was live. At `pcb` the stash (its caller 0x2bfbf8) wrote it through 35509 (caller 0x603ca9, inside 35570) with flags 0x90001000, kLockExtra added. The record: type 0 (REFR), size code 0, version 0x4e (78) as AL 35740 returns, length1 36, length2 0 (raw), 40 bytes; the door's own id inside as 0x4e3a7a (type 1, direct) and its animation state "Close" readable. |
| D2 | At a cell's next init (slot 0x13, AL 18881 and 18882), each of the cell's references runs AL 35569 after its InitItemImpl: read the entry, check the type byte against the live form's, decode (AL 36080), consume, read the initial data and run LoadGame, all before its 3D loads. AL 35572 does the same for moved and created references. | CONFIRMED | 20261103-120316 (x-transplant-inject v1, c2 solo): at c2's `coc` into the Sleeping Giant, 35569 ran 499 times (one per reference of the cell) and decoded once, our entry's, for 0xe3a7a with `applied: 1`. |
| D3 | A record written into the changes map (AL 35509) before a cell loads is applied by D2 as the engine's own. It needs the right type byte, a version byte equal to AL 35740's (0x4e), its ref ids encoded as type 1 or 2 (or present in the session's form id map), and the cell's registration at +0xC8 if the reference changed cell. | CONFIRMED for a REFR's lock (kGameOnlyExtra, kAnimation, kLockExtra) and a container's inventory (kGameOnlyExtra, kLeveledInventory, kInventory); not yet for a moved, cell-changed or promoted reference | The transplant. c1's engine stored 0xe3a7a's record at its unload (114726, D1). Its 40 bytes, checked and FNV-1a'd (0x4ebbb261), went into c2's map with the engine's own allocator before c2 ever loaded the inn (120316: written, read back as ours). c2's engine applied it at the cell's init (D2), and c2 read GetLocked 1 for 0xe3a7a, which c2 never locked, and 0 for the untouched door 0xe3a79; both claims were assert steps, read and held. One seat's engine materialized another seat's record as its own. The same for a container: c1's `additem 0000000f 100` on BarrelFood01 0x1f229 in Riverwood, stored at the unload as flags 0x88000020, 37 bytes raw, gold 0x40000f with count 0x64 inside (20261103-120817). Written into a fresh c2's map before Riverwood loaded, it was applied at the cell's init (applied 1, one decode), and c2 read 100 gold in 0x1f229, which it never touched, beside 0 in the untouched 0x1f228, both claims held (20261103-121150). |
| D4 | The queued sub buffers (BGSSaveLoadGame.h's queuedSubBuffersMap) only defer 3D-dependent data: animation, character controller and Havok (AL 36024, 36026, 36031, "queued havok data"). They are not the materialize path. | HYPOTHESIS | The re-analyst. |
| D5 | The changes map can be walked under its read lock (BGSSaveLoadGame.h:94, entries of 0x20 bytes: form id, flags, unknown, record pointer), as the engine's SaveGame (AL 35599) does. | HYPOTHESIS | The re-analyst. |

| D6 | An actor's record carries the actor block whatever its flags (C3), its handles written as ref ids. For a templated or leveled base (most of Skyrim's NPCs: all three of Bleak Falls Temple's campfire bandits, base TPLT to LCharBanditOnlyNordM), InitItemImpl clones a runtime TESNPC and marks kLeveledActor (0x40000), and the record names that clone as a created form (type 2). That id means nothing on another seat, so an actor's transplant needs the server's id map for created forms (ADR-065 amendment F) first. Also, Actor::LoadGame puts the life state back to its pre-load value after its raw reads, so where a death is restored at load is unread. | HYPOTHESIS | The re-analyst; the dead-NPC capture's fresh review (lab/esm.py id on 0x39fe3). x-transplant-capture-npc v1 (by path) reads it: kLeveledActor and a type-2 id are expected, so the record is not portable. |

### (e) What the census could not see (its review's findings on v1, unfixed in v2)

- AL 14608's six callers (A4), so no kAnimation marks from them.
- TESNPC's marks are counted twice: its override tail-jumps into TESForm's.
- A sum row prints at most 80 keys and marks every changed key sent, so a busy second may lose later keys' counts. The acts'
  whole rows (the first 8 calls per key) are unaffected.
- BGSMovableStatic's [0] vtable is its TESFullName part (BGSMovableStatic.h:24-27). Its "slot 0x0A" was CopyComponent, and its
  "slot 0x0B" was an RTTI pointer in .rdata. Both were hooked in 111808, so that run's game had 14 bytes of RTTI data patched.
  The next rollback restored it. Its TESForm vtable is [2] (189121), which already points at 14607.

## 3. What it means, and the next reads

- One observe point exists for every persistent change, made by a script, the AI, the player or Havok: AddChange and
  RemoveChange, through 14607 and 14608 into 35576 and 35581, plus TESNPC's override. It marks without a value, so the owner
  reads the value with the engine's own serializer (C1, C2). This is the TRIBES model's per-object state mask, which the
  engine keeps for its save (Frohnmayer and Gift, "The TRIBES Engine Networking Model",
  https://www.gamedevs.org/uploads/tribes-networking-model.pdf).
- Discrete changes (an open, a close, a lock, an inventory, a death, a stage) mark once per change. Movement and Havok mark
  every frame (B3, B6), and that is the owner's stream. The end of a reference's kHavokMoved stream is its at-rest moment, the
  record physics needs.
- The engine has its own path for applying a record before a reference materializes (D1, D2). If D3 holds, a seat
  materializes the server's record natively, with no load-time fixes.
- Not in the change forms: the globals (B4), the save's other global tables, and the Papyrus objects. thuum-cf's re-analyst
  is reading those (docs/research/adr065-papyrus-state-2026-11-03.md). Also absent are a created NPC's template forms
  (AL 14408's path, A1).

Next reads (the transplant, read 2 below, ran GREEN as 20261103-120316: D2 and D3 CONFIRMED for a lock):
1. Census v3 with its review's fixes: hook 35576 itself, behind 14607's tail jump, plus 14608; drop BGSMovableStatic [0];
   refuse non-executable targets; a depth guard for TESNPC; every key in the sum rows; a raw-count heartbeat. It adds a quest
   that does start, a lock and an unlock, and a prop pushed.
2. The transplant, for D3. On c1, change a reference in a cell and leave until the cell unloads; read the record AL 35570
   stores. On c2, solo, write that record into the map with AL 35509 before the cell loads, then enter and read the
   reference. The engine materializing another seat's record is the safe-by-construction claim.
3. Mid-game LoadGame on a 3D-loaded reference (C4; thuum-cf's risk 1): 0x0E on the owner, 0x0F on the copy, with the menu
   and refs-near read beside it.
