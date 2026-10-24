// npc-roll.js: the engine's leveled roll and outfit roll on one seat, for
// docs/research/m3/re-npc-roll.md sections 5 and 8 (train-41, ADR-046 decision
// 1) and docs/verbs/npc-fate.md's x-npc-fate-roll leg. Fifteen hooks along two
// chains. The base: InitItemImpl -> the leveled resolver (14374) -> the roll
// wrapper (14752) -> CalculateCurrentFormList (14751) -> GetCalcLevel (20205).
// The outfit, per section 8: InitInventoryIfRequired (16038) -> RemoveOutfitItems
// (19690, a null outfit) -> InventoryChanges::InitLeveledItems (16129) -> the
// outfit-array resolver (16155) once per non-null outfit -> 14751 per LVLI item;
// later the equipper (418622) -> HasOutfitItems (19691) and, only on an actor
// with no tagged entries, InitOutfitItems (16072) -> 16155; AddWornOutfit
// (19692), ActorEquipManager::EquipObject (38894), the re-roll (37323) and
// Actor::ResetInventory (37322) around them. Every event is one JSON line: hook,
// phase (enter, leave or call), seq (order for equal stamps), tid, the fields
// below, ret (the caller's return address as module+offset) with near (the
// nearest known function start at or below it, a hint: sizes are unknown, and
// section 8.1 showed two such labels that were not containment) and t
// (Date.now()). Where section 8.1 states a body range (16129, 16155, 16072) a
// return is classified by containment (retIn, site, slot, fromInit); "lvln" for
// 14751 is still a nearest-start label, 14752's body is unread. Align the trace
// on its `ready` line, never on the step list.
//
// Expected per fresh actor (section 8.4): 16038 (near 19507) with a null-outfit
// 19690 at 16038+0xb4 (fromInit true), then 16129, then 16155 once per non-null
// outfit (retIn 16129, slot default then sleep) whose 14751 calls return to
// 16155+0xca (site outfit, in16155 true), then 418622 at the biped init with
// HasOutfitItems true (the leave's hasOutfitItems) and no 16072 inside it;
// 16072 only on an actor with no tagged entries (a puppet after applyEquipment,
// by its owner id). Falsifiers: a 16155 return outside 16129 and 16072 (retIn
// other); a 14751 return to 16155+0xca with no 16155 entry on the thread (site
// outfit, in16155 false); tagged entries surviving a 19690 from 16038; a 418622
// with a non-null outfit, no 19692 inside it and no horse keyword (the 418622
// read wrong; the leave's equipObject count and the first equipObject lines say
// what wore the outfit if 19692 stays zero). Scenario: the solo leg with a 15 s
// wait before the teleport. A persistent leveled actor (x-npc-fate-outfit
// 20261024-000244, Embershard's bandits) shows no first roll inside InitItemImpl
// but a re-roll at the cell's attach: 37323 (arg -1) returning into 19231 (near
// "19231 attach re-roll caller (RE this)"), its 14374 with skipInit 0, then
// 37322 ResetInventory from the same caller; so the outfit rolls twice per such
// actor, once in the resolver's inventory init and once in ResetInventory's.
//
// Address Library 1.6.1170 ids; every offset by `just addr <id>` (lab/addr.py
// over addrlib/, runtime 1.6.1170.0, 428461 entries) on 2026-10-23. Names and
// argument shapes are re-npc-roll.md's (sections 1, 2, 6 and 8; its status):
//    14374  0x1d74e0  the leveled resolver (a_data TESActorBaseData*, a_ref, a_skipInit)       HYPOTHESIS
//    14752  0x1e3e70  the per-reference roll wrapper (a_list TESLeveledList*, a_ref, a_out)      HYPOTHESIS
//    14751  0x1e3a30  TESLeveledList::CalculateCurrentFormList                                  CommonLib name
//    20205  0x2fa590  GetCalcLevel (a_ref, a_adjustLevel)                                         CommonLib name
//   418622  0x3bd380  the outfit equipper (a_npc, a_actor, bool, a_equipBest, bool, a_noEventScope) HYPOTHESIS
//    16072  0x22e730  InventoryChanges::InitOutfitItems (this, a_outfit, a_npcLevel)             CommonLib name; the late path (8.1)
//    19692  0x2e1b00  Actor::AddWornOutfit (this, a_outfit, a_forceUpdate)                       CommonLib name
//    19690  0x2e1930  Actor::RemoveOutfitItems (this, a_outfit)                                   CommonLib name
//    37323  0x665fc0  the re-roll (a_actor, a_arg)                                                HYPOTHESIS
//    37322  0x665ec0  Actor::ResetInventory (this, a_leveledOnly), vfunc 0x8A                     CONFIRMED-STATIC vtable
//    16129  0x236b60  InventoryChanges::InitLeveledItems (this)                                   CommonLib name; flow HYPOTHESIS (8.5)
//    16155  0x23a2b0  the outfit-array resolver (a_items BSTArray<TESForm*>*, a_ctx OutfitInitCtx*) callers and registers CONFIRMED-STATIC (8.5)
//    16038  0x225770  TESObjectREFR::InitInventoryIfRequired (this, a_ignoreContainerExtraData)   CommonLib name; flow HYPOTHESIS (8.3)
//    19691  0x2e1a50  Actor::HasOutfitItems (this, a_outfit)                                      CommonLib name
//    38894  0x6c9820  ActorEquipManager::EquipObject (this, a_actor, a_object, a_extraData, a_count, a_slot, 4 bools) CommonLib Offset
// All fifteen resolved; nothing left out. Not hooked, resolved the same day so a
// return address can be matched to the report's expected callers:
//    19507  0x2d8730  TESObjectREFR::InitItemImpl        37791  0x692560  Character::InitItemImpl
//    13723  0x1b6c10  CreateReferenceAtLocation           24725  0x3bba20  the biped worn init
//    39800  0x70d7b0  the process-side outfit step        40746  0x74cc90  InitOutfitItems' other caller
//    19802  0x2ecda0  TESObjectREFR::ResetInventory       12095  0x170380  the change-form reader (by shape)
//    54755  0x9ea540  Papyrus Actor.SetOutfit             54691  0x9e8980  Papyrus Actor.GetLeveledActorBase
//    16128  0x236890  add calced picks (8.2)              16053  0x226a20  add an entry with an extra list (8.2)
//    11647  0x15d210  ExtraOutfitItem setter (8.2)        14608  0x1dffc0  AddChange by shape (8.2)
//    37897  0x698d60  HasKeyword(kKeywordHorse) (8.4)     419334 0x678000  the worn entry by biped slot (8.4)
//    22405  0x3581d0  console SetLevel by shape (8.1)     19654  0x2e0460  InitLeveledItems' indirect caller (8.1)
//    14384  0x1d7cf0  TESActorBaseData::GetLevel (8.1)
//    19231  0x2c9990  the attach re-roll caller: 37323 returns at +0x132, 37322 at +0x14b (RE this;
//                     the nearest Address Library entry at or below both, by lab/addr.py's loader
//                     in reverse, bounded by 19232 at 0x2c9b70; relids.tsv names neither)
// Body ranges and expected return offsets are section 8.1's and 8.3's REA reads
// (CONFIRMED-STATIC), not Address Library entries: 16129 0x236b60..0x236e33,
// 16155 0x23a2b0..0x23a4b8, 16072 a 0x40-byte wrapper; 16155 returns into 16129
// at +0xcc (defaultOutfit) and +0xe9 (sleepOutfit); 14751 returns into 16155 at
// +0xca (the outfit roll) and into 16129 at +0x21c (the container loop); 19690
// returns into 16038 at +0xb4 (the null-outfit strip).
//
// Structure offsets, CommonLibSSE-NG at the pin (b93280e8), as the report cites them:
//   TESForm::formID +0x14 (include/RE/T/TESForm.h:354); formType +0x1A (:356)
//   TESObjectREFR::data +0x40 (T/TESObjectREFR.h:495); OBJ_REFR::objectReference +0x00 (:77)
//   TESActorBaseData at TESNPC+0x30 (T/TESNPC.h:32 TESActorBase at 000; T/TESActorBase.h:21),
//     so a_data - 0x30 is the TESNPC; TESActorBaseData::baseTemplateForm +0x30 (T/TESActorBaseData.h:128), the TPLT
//   TESLeveledList at TESLevCharacter+0x30 (T/TESLevCharacter.h:12), TESLevItem+0x30 (T/TESLevItem.h:11)
//     and TESLevSpell+0x30 (T/TESLevSpell.h:11), so a_list - 0x30 is the owning form for all three
//   CALCED_OBJECT: form +0x00, count +0x08, sizeof 0x28 (T/TESLeveledList.h:27-37)
//   BSScrapArray<T> = BSTArray<T, BSScrapArrayAllocator> (B/BSTArray.h:652); the allocator comes
//     first (:374-376) with _allocator +0x00, _data +0x08, _capacity +0x10, sizeof 0x18 (:367-371),
//     then BSTArrayBase::_size (:47), so the count sits at +0x18 and the data pointer at +0x08
//   BSTArray<TESForm*> (the heap allocator): _data +0x00 (B/BSTArray.h:140), _capacity +0x08 (:141),
//     sizeof 0x10 (:143), then BSTArrayBase::_size (:47), so the count sits at +0x10 and the data
//     pointer at +0x00 (re-npc-roll.md 8.2 reads 16155 the same way); BGSOutfit::outfitItems +0x20 (B/BGSOutfit.h:43)
//   OutfitInitCtx (re-npc-roll.md 8.2, 8.4; CONFIRMED-STATIC by both callers' stores and 16155's reads):
//     outfit BGSOutfit* +0x00, changes InventoryChanges* +0x08, level u16 +0x10
//   InventoryChanges::owner +0x08 (I/InventoryChanges.h:64)
//   TESNPC::defaultOutfit +0x218 (T/TESNPC.h:281); sleepOutfit +0x220 (:282)
//   FormType ARMO 0x1A, CONT 0x1C, WEAP 0x29, NPC_ 0x2B, LVLN 0x2C, LVLI 0x35, REFR 0x3D, ACHR 0x3E,
//     LVSP 0x52, OTFT 0x7C (F/FormTypes.h:166, 168, 181, 183, 184, 193, 201, 202, 222, 264)
// Argument positions follow the headers: CalculateCurrentFormList is a member
// (T/TESLeveledList.h:65; src/RE/T/TESLeveledList.cpp:7-11, RELOCATION_ID(14579,
// 14751)), so rcx this, dx a_level, r8w a_count, r9 a_calcedObjects, and a_arg5
// and a_usePlayerLevel on the stack (Frida's args[4] and args[5]); the plan's
// "arg5 in r9" is where the header puts the out array, so r9 is read as the
// array and its count logged on leave. RemoveOutfitItems takes the outfit
// alone (A/Actor.h:617); HasOutfitItems too (A/Actor.h:572); AddWornOutfit's
// second argument is a_forceUpdate (A/Actor.h:502); ResetInventory's is
// a_leveledOnly (A/Actor.h:335, the override of T/TESObjectREFR.h:338);
// InitInventoryIfRequired's is a_ignoreContainerExtraData in dl
// (T/TESObjectREFR.h:434). EquipObject is a member (A/ActorEquipManager.h:19):
// rcx this, rdx a_actor, r8 a_object, r9 a_extraData, then a_count, a_slot,
// a_queueEquip, a_forceEquip, a_playSounds, a_applyNow on the stack (Frida's
// args[4] to args[9]). That r8 of 14752 and r9 of 14751 hold a
// BSScrapArray<CALCED_OBJECT> is the report's HYPOTHESIS; the layout read
// through it is the header's.
//
// Params through globalThis.LAB_PARAMS (lab-api prepends them for a scenario's
// `frida {script: npc-roll.js, params: {...}}` step, labapi/runner.py
// frida_script_text; `just frida` carries none, so a hand run logs everything):
//   refs [formIds]   only events whose reference is listed, where one is known
//                    (14374, 14752, 418622, 16072, 19692, 19690, 19691, 37323,
//                    37322; the owner for 16129 and 16155, the ref for 16038)
//   bases [formIds]  the same gate by the placed base, the TPLT, the list, the
//                    NPC, the owner's base or the outfit (either list admits an event)
//   cap (200)        14751 and 20205 log their first cap calls each, then counts
//                    only; a call nested inside a passing outer hook on the same
//                    thread (inRoll: true), or on a listed ref, always logs
//   equipCap (50)    38894's own cap, the same rule (a frame-rate hook)
// A `summary` line every 5 s carries every attached hook's counts since the last
// one (n, logged, filtered, capped; zeros included, so a hook that never ran is
// visible; outfitEquip adds a tally of null and non-null defaultOutfit per call)
// so a frame-rate hook never floods. Both send and console.log carry every line
// (frida-inject's stdout is block-buffered; the lab's preamble turns console.log
// into a flushed file and send into a no-op). Run: a scenario step `c1: frida
// {script: npc-roll.js, params: {refs: [0x85547, 0x85549]}}` before the teleport
// into the forest cell 0x9810 (b-cell-host's landing), or `just frida
// npc-roll.js c1` by hand. The run collects the lines as frida/c1-npc-roll.jsonl;
// a hand run's come back with the next run as frida/c1-npc-roll.before-run.jsonl
// (lab/frida/README.md).
"use strict";
function emit(obj) {
  obj.t = Date.now();
  send(obj);
  console.log(JSON.stringify(obj));
}

// lab-api prepends `globalThis.LAB_PARAMS = {...}` for a step's params
// (labapi/runner.py frida_script_text); `params` is kept for a hand-run copy
const PARAMS =
  typeof LAB_PARAMS === "object" && LAB_PARAMS
    ? LAB_PARAMS
    : typeof params === "object" && params
      ? params
      : {};

// This script's own top-level names carry the prefix nr: a top-level name that
// matches a Frida global (ptr, hexdump, int64, uint64, NULL, Module, Process,
// Memory, File, send, recv) fails the load ("cannot define variable 'ptr'", run
// 20261022-040233). emit, PARAMS, OFFSETS, fileVersion, hex, u32, readPtr and
// formId are the sibling scripts' proven names, kept so the files read alike.
function nrIdSet(list) {
  const s = new Set();
  if (Array.isArray(list)) {
    for (const v of list)
      s.add((typeof v === "string" ? parseInt(v, 16) : v) >>> 0);
  }
  return s;
}
const nrRefs = nrIdSet(PARAMS.refs);
const nrBases = nrIdSet(PARAMS.bases);
const nrCap = PARAMS.cap >>> 0 || 200;
const nrEquipCap = PARAMS.equipCap >>> 0 || 50;
const nrSummaryMs = 5000;

// offsets by `just addr <id>` for 1.6.1170 on 2026-10-23 (never from memory, CLAUDE.md rule 1)
const OFFSETS = {
  "1.6.1170.0": {
    leveledResolve: 0x1d74e0, // 14374
    rollWrapper: 0x1e3e70, // 14752
    calcFormList: 0x1e3a30, // 14751
    getCalcLevel: 0x2fa590, // 20205
    outfitEquip: 0x3bd380, // 418622
    initOutfitItems: 0x22e730, // 16072
    addWornOutfit: 0x2e1b00, // 19692
    removeOutfitItems: 0x2e1930, // 19690
    reroll: 0x665fc0, // 37323
    resetInventory: 0x665ec0, // 37322
    initLeveledItems: 0x236b60, // 16129
    outfitArrayResolve: 0x23a2b0, // 16155
    initInventoryIfRequired: 0x225770, // 16038
    hasOutfitItems: 0x2e1a50, // 19691
    equipObject: 0x6c9820, // 38894
  },
};
// the hook names' Address Library ids, for the ready line
const nrIds = {
  leveledResolve: 14374,
  rollWrapper: 14752,
  calcFormList: 14751,
  getCalcLevel: 20205,
  outfitEquip: 418622,
  initOutfitItems: 16072,
  addWornOutfit: 19692,
  removeOutfitItems: 19690,
  reroll: 37323,
  resetInventory: 37322,
  initLeveledItems: 16129,
  outfitArrayResolve: 16155,
  initInventoryIfRequired: 16038,
  hasOutfitItems: 19691,
  equipObject: 38894,
};

// known function starts for labeling return addresses (hooked or not); `just addr` the same day
const nrKnownStarts = {
  "1.6.1170.0": [
    [0x15d210, "11647 ExtraOutfitItem setter"],
    [0x170380, "12095 change-form reader"],
    [0x1b6c10, "13723 CreateReferenceAtLocation"],
    [0x1d74e0, "14374 leveledResolve"],
    [0x1d7cf0, "14384 TESActorBaseData::GetLevel"],
    [0x1dffc0, "14608 AddChange"],
    [0x1e3a30, "14751 CalculateCurrentFormList"],
    [0x1e3e70, "14752 rollWrapper"],
    [0x225770, "16038 InitInventoryIfRequired"],
    [0x226a20, "16053 add entry with extra list"],
    [0x22e730, "16072 InitOutfitItems"],
    [0x236890, "16128 add calced picks"],
    [0x236b60, "16129 InventoryChanges::InitLeveledItems"],
    [0x23a2b0, "16155 outfit-array resolver"],
    [0x2c9990, "19231 attach re-roll caller (RE this)"],
    [0x2d8730, "19507 TESObjectREFR::InitItemImpl"],
    [0x2e0460, "19654 InitLeveledItems indirect caller"],
    [0x2e1930, "19690 RemoveOutfitItems"],
    [0x2e1a50, "19691 HasOutfitItems"],
    [0x2e1b00, "19692 AddWornOutfit"],
    [0x2ecda0, "19802 TESObjectREFR::ResetInventory"],
    [0x2fa590, "20205 GetCalcLevel"],
    [0x3581d0, "22405 console SetLevel"],
    [0x3bba20, "24725 biped worn init"],
    [0x3bd380, "418622 outfitEquip"],
    [0x665ec0, "37322 Actor::ResetInventory"],
    [0x665fc0, "37323 reroll"],
    [0x678000, "419334 worn entry by biped slot"],
    [0x692560, "37791 Character::InitItemImpl"],
    [0x698d60, "37897 HasKeyword horse"],
    [0x6c9820, "38894 ActorEquipManager::EquipObject"],
    [0x70d7b0, "39800 process-side outfit step"],
    [0x74cc90, "40746 InitOutfitItems other caller"],
    [0x9e8980, "54691 Papyrus Actor.GetLeveledActorBase"],
    [0x9ea540, "54755 Papyrus Actor.SetOutfit"],
  ],
};

// body ranges [start, end) from re-npc-roll.md 8.1's REA read (CONFIRMED-STATIC): containment,
// where the nearest-start label is only a hint; 16072 is a 0x40-byte wrapper (8.1)
const nrBodies = {
  "1.6.1170.0": {
    initLeveledItems: [0x236b60, 0x236e33], // 16129
    outfitArrayResolve: [0x23a2b0, 0x23a4b8], // 16155
    initOutfitItems: [0x22e730, 0x22e770], // 16072
  },
};

// the expected return offsets, re-npc-roll.md 8.1 (16155 into 16129; 14751 into 16155 and 16129)
// and 8.3 (19690 into 16038), as function start + delta
const nrExpectedRets = {
  "1.6.1170.0": {
    outfitDefault: 0x236b60 + 0xcc, // 16129+0xcc: 16155's return for defaultOutfit
    outfitSleep: 0x236b60 + 0xe9, // 16129+0xe9: 16155's return for sleepOutfit
    rollOutfit: 0x23a2b0 + 0xca, // 16155+0xca: 14751's return in the outfit roll (0x23a37a)
    rollContainer: 0x236b60 + 0x21c, // 16129+0x21c: 14751's return in the container loop (0x236d7c)
    stripAtInit: 0x225770 + 0xb4, // 16038+0xb4: RemoveOutfitItems(nullptr) from InitInventoryIfRequired
  },
};

function fileVersion(path) {
  const ver = Module.load("version.dll");
  const size = new NativeFunction(
    ver.getExportByName("GetFileVersionInfoSizeW"),
    "uint32",
    ["pointer", "pointer"],
  );
  const info = new NativeFunction(
    ver.getExportByName("GetFileVersionInfoW"),
    "int",
    ["pointer", "uint32", "uint32", "pointer"],
  );
  const query = new NativeFunction(
    ver.getExportByName("VerQueryValueW"),
    "int",
    ["pointer", "pointer", "pointer", "pointer"],
  );
  const p = Memory.allocUtf16String(path);
  const n = size(p, NULL);
  if (n === 0) return null;
  const buf = Memory.alloc(n);
  if (!info(p, 0, n, buf)) return null;
  const out = Memory.alloc(Process.pointerSize);
  const len = Memory.alloc(4);
  if (!query(buf, Memory.allocUtf16String("\\"), out, len)) return null;
  // VS_FIXEDFILEINFO: dwSignature, dwStrucVersion, dwFileVersionMS, dwFileVersionLS
  const ffi = out.readPointer();
  const ms = ffi.add(8).readU32();
  const ls = ffi.add(12).readU32();
  return [ms >>> 16, ms & 0xffff, ls >>> 16, ls & 0xffff].join(".");
}

function hex(n) {
  return "0x" + (n >>> 0).toString(16);
}
function u32(p) {
  try {
    return p.isNull() ? 0 : p.readU32();
  } catch (e) {
    return -1;
  }
}
function readPtr(p) {
  try {
    return p.isNull() ? NULL : p.readPointer();
  } catch (e) {
    return NULL;
  }
}
function formId(form) {
  return form.isNull() ? 0 : u32(form.add(0x14));
} // TESForm.h:354
function nrU16(p) {
  try {
    return p.isNull() ? 0 : p.readU16();
  } catch (e) {
    return -1;
  }
}
function nrFormType(form) {
  try {
    return form.isNull() ? 0 : form.add(0x1a).readU8();
  } catch (e) {
    return -1;
  }
} // TESForm.h:356
const nrTypeNames = {
  0x1a: "ARMO",
  0x1c: "CONT",
  0x29: "WEAP",
  0x2b: "NPC_",
  0x2c: "LVLN",
  0x35: "LVLI",
  0x3d: "REFR",
  0x3e: "ACHR",
  0x52: "LVSP",
  0x7c: "OTFT",
}; // FormTypes.h:166, 168, 181, 183, 184, 193, 201, 202, 222, 264
function nrType(form) {
  const t = nrFormType(form);
  return nrTypeNames[t] || hex(t);
}
function nrBaseOf(ref) {
  return ref.isNull() ? NULL : readPtr(ref.add(0x40));
} // data.objectReference, TESObjectREFR.h:495 + OBJ_REFR.h:77
function nrByte(a) {
  return a.toInt32() & 0xff;
}
function nrI16(a) {
  return ((a.toInt32() & 0xffff) << 16) >> 16;
}
// a TESNPC's defaultOutfit (+0x218, TESNPC.h:281) and sleepOutfit (+0x220, :282); NULL for any other form
function nrNpcOutfit(npc, slot) {
  if (npc.isNull() || nrFormType(npc) !== 0x2b) return NULL;
  return readPtr(npc.add(slot === "sleep" ? 0x220 : 0x218));
}

const exe = Process.getModuleByName("SkyrimSE.exe");
const version = fileVersion(exe.path);
const at = OFFSETS[version];
if (at === undefined) {
  emit({ error: "no offsets for this runtime", version: version });
} else {
  const nrKnown = nrKnownStarts[version].slice().sort(function (a, b) {
    return a[0] - b[0];
  });
  const nrBody = nrBodies[version] || {};
  const nrExpected = nrExpectedRets[version] || {};

  // the nearest known start at or below an exe offset, or null
  function nrNearest(off) {
    let best = null;
    for (const k of nrKnown) {
      if (k[0] <= off) best = k;
      else break;
    }
    return best;
  }
  // a return address as an offset into SkyrimSE.exe, or null outside it
  function nrExeOff(ret) {
    if (!ret || ret.isNull()) return null;
    if (ret.compare(exe.base) < 0) return null;
    if (ret.compare(exe.base.add(exe.size)) >= 0) return null;
    return ret.sub(exe.base).toUInt32();
  }
  function nrInBody(off, body) {
    return (
      off !== null && body !== undefined && off >= body[0] && off < body[1]
    );
  }

  // the return address as module+offset; near: the nearest known start at or below it
  function nrCaller(ret) {
    if (!ret || ret.isNull()) return { ret: "0x0" };
    const m = Process.findModuleByAddress(ret);
    if (!m) return { ret: ret.toString() };
    const off = ret.sub(m.base);
    const row = { ret: m.name + "+0x" + off.toString(16) };
    if (m.base.equals(exe.base)) {
      const best = nrNearest(off.toUInt32());
      if (best)
        row.near = best[1] + "+0x" + (off.toUInt32() - best[0]).toString(16);
    }
    return row;
  }

  // 14751's return site: outfit (inside 16155's body), container (inside 16129's body),
  // lvln (nearest start 14752: a near label, its body is unread), else other
  function nrRollSite(ret) {
    const off = nrExeOff(ret);
    if (off === null) return "other";
    if (nrInBody(off, nrBody.outfitArrayResolve)) return "outfit";
    if (nrInBody(off, nrBody.initLeveledItems)) return "container";
    const best = nrNearest(off);
    if (best && best[0] === at.rollWrapper) return "lvln";
    return "other";
  }

  // 16155's return: retIn 16129 (slot default at +0xcc, sleep at +0xe9, else other), 16072, or other
  function nrResolveRet(ret) {
    const off = nrExeOff(ret);
    const row = { retIn: "other" };
    if (off === null) return row;
    if (nrInBody(off, nrBody.initLeveledItems)) {
      row.retIn = "16129";
      if (off === nrExpected.outfitDefault) row.slot = "default";
      else if (off === nrExpected.outfitSleep) row.slot = "sleep";
      else row.slot = "other";
    } else if (nrInBody(off, nrBody.initOutfitItems)) {
      row.retIn = "16072";
    }
    return row;
  }

  let nrSeq = 0;
  function nrEvent(hook, phase, ctx, fields, ret) {
    nrSeq += 1;
    const row = { hook: hook, phase: phase, seq: nrSeq, tid: ctx.threadId };
    Object.assign(row, fields);
    if (ret !== undefined) Object.assign(row, nrCaller(ret));
    emit(row);
  }

  // per-hook counters: n, logged, filtered, capped (and a hook's tally) reset at every summary;
  // budget and capNoticed persist. Every attached hook gets one at attach, so the summary shows zeros.
  const nrCounts = {};
  function nrCount(hook) {
    return (
      nrCounts[hook] ||
      (nrCounts[hook] = {
        n: 0,
        logged: 0,
        filtered: 0,
        capped: 0,
        budget: 0,
        capNoticed: false,
        tally: null,
      })
    );
  }

  // the refs/bases gate for the hooks where a reference is known
  function nrPass(refId, baseIds) {
    if (nrRefs.size === 0 && nrBases.size === 0) return true;
    if (nrRefs.has(refId >>> 0)) return true;
    for (const b of baseIds) if (nrBases.has(b >>> 0)) return true;
    return false;
  }
  function nrGate(hook, refId, baseIds) {
    const c = nrCount(hook);
    c.n += 1;
    if (nrPass(refId, baseIds)) {
      c.logged += 1;
      return true;
    }
    c.filtered += 1;
    return false;
  }

  // a passing outer frame (14374, 14752, 418622, 37323, 37322, 16038, 16129, 16155) raises its
  // thread's watch depth, so the 14751, 20205 and 38894 calls inside it log past the cap (inRoll: true)
  const nrWatch = {};
  function nrWatchEnter(tid) {
    nrWatch[tid] = (nrWatch[tid] || 0) + 1;
  }
  function nrWatchLeave(tid) {
    if (nrWatch[tid]) nrWatch[tid] -= 1;
  }
  function nrInRoll(tid) {
    return (nrWatch[tid] || 0) > 0;
  }

  // every 16155 frame on a thread, gated or not, so a 14751 line can say whether one is open
  // (the falsifier: a return to 16155+0xca with no 16155 entry on the thread)
  const nrResolveDepth = {};

  // the 418622 frame open on a thread (a passing enter): what ran inside it, logged at its leave
  const nrEquipFrames = {};
  function nrEquipFrame(tid) {
    return nrEquipFrames[tid];
  }

  // the cap gate for 14751, 20205 and 38894: 'roll' inside a watched frame, 'ref' on a listed
  // reference, 'cap' within the hook's first cap calls, null once counts-only
  function nrAdmit(hook, tid, refId, cap) {
    const c = nrCount(hook);
    const limit = cap || nrCap;
    c.n += 1;
    if (nrInRoll(tid)) {
      c.logged += 1;
      return "roll";
    }
    if (refId !== undefined && nrRefs.has(refId >>> 0)) {
      c.logged += 1;
      return "ref";
    }
    if (c.budget < limit) {
      c.budget += 1;
      c.logged += 1;
      return "cap";
    }
    c.capped += 1;
    if (!c.capNoticed) {
      c.capNoticed = true;
      emit({
        hook: hook,
        notice: "cap reached, counts only from here (summary lines)",
        cap: limit,
      });
    }
    return null;
  }

  // a BSScrapArray<CALCED_OBJECT> on leave: _data +0x08, _capacity +0x10, _size +0x18
  // (BSTArray.h:367-371, :374-376, :47, :652); CALCED_OBJECT 0x28 with form +0x00 and
  // count +0x08 (TESLeveledList.h:27-37); the first eight picks
  function nrCalced(out) {
    if (out.isNull()) return { outCount: -1 };
    const count = u32(out.add(0x18));
    const row = { outCount: count, outCapacity: u32(out.add(0x10)) };
    const data = readPtr(out.add(0x08));
    if (count > 0 && !data.isNull()) {
      const picks = [];
      for (let i = 0; i < count && i < 8; i++) {
        const form = readPtr(data.add(i * 0x28));
        picks.push({
          form: hex(formId(form)),
          type: nrType(form),
          count: nrU16(data.add(i * 0x28 + 0x08)),
        });
      }
      row.picks = picks;
      row.first = picks[0].form;
    }
    return row;
  }

  // a BSTArray<TESForm*> (the outfit's items, BGSOutfit.h:43): _data +0x00 (BSTArray.h:140),
  // _size +0x10 (:47 after the 0x10 allocator, :143); re-npc-roll.md 8.2; the first eight forms
  function nrFormArray(arr) {
    if (arr.isNull()) return { count: -1 };
    const count = u32(arr.add(0x10));
    const row = { count: count };
    const data = readPtr(arr);
    if (count > 0 && !data.isNull()) {
      const forms = [];
      for (let i = 0; i < count && i < 8; i++) {
        const form = readPtr(data.add(i * Process.pointerSize));
        forms.push({ form: hex(formId(form)), type: nrType(form) });
      }
      row.forms = forms;
    }
    return row;
  }

  const nrHooked = {};
  function nrAttach(name, callbacks) {
    try {
      Interceptor.attach(exe.base.add(at[name]), callbacks);
      nrHooked[name] = hex(at[name]);
      nrCount(name); // a counter from the start, so the summary carries its zero
    } catch (e) {
      emit({
        error: "attach failed",
        hook: name,
        offset: hex(at[name]),
        message: String(e),
      });
    }
  }

  // 14374 the leveled resolver (a_data TESActorBaseData*, a_ref TESObjectREFR*, a_skipInit)
  nrAttach("leveledResolve", {
    onEnter(args) {
      const data = args[0];
      const ref = args[1];
      const npc = data.isNull() ? NULL : data.sub(0x30); // TESActorBase.h:21
      const tplt = data.isNull() ? NULL : readPtr(data.add(0x30)); // TESActorBaseData.h:128
      this.ref = ref;
      this.refId = formId(ref);
      this.tid = this.threadId;
      const baseId = formId(npc);
      const tpltId = formId(tplt);
      this.on = nrGate("leveledResolve", this.refId, [baseId, tpltId]);
      if (!this.on) return;
      nrWatchEnter(this.tid);
      const current = nrBaseOf(ref);
      nrEvent(
        "leveledResolve",
        "enter",
        this,
        {
          ref: hex(this.refId),
          refType: nrType(ref),
          placedBase: hex(baseId),
          placedBaseType: nrType(npc),
          tplt: hex(tpltId),
          tpltType: nrType(tplt),
          current: hex(formId(current)),
          currentType: nrType(current),
          skipInit: nrByte(args[2]),
        },
        this.returnAddress,
      );
    },
    onLeave() {
      if (!this.on) return;
      nrWatchLeave(this.tid);
      const base = nrBaseOf(this.ref);
      const id = formId(base);
      nrEvent("leveledResolve", "leave", this, {
        ref: hex(this.refId),
        base: hex(id),
        baseType: nrType(base),
        runtime: id >= 0xff000000,
      });
    },
  });

  // 14752 the roll wrapper (a_list TESLeveledList*, a_ref, a_out BSScrapArray<CALCED_OBJECT>*)
  nrAttach("rollWrapper", {
    onEnter(args) {
      const listForm = args[0].isNull() ? NULL : args[0].sub(0x30); // TESLevCharacter.h:12
      this.listId = formId(listForm);
      this.refId = formId(args[1]);
      this.out = args[2];
      this.tid = this.threadId;
      this.on = nrGate("rollWrapper", this.refId, [this.listId]);
      if (!this.on) return;
      nrWatchEnter(this.tid);
      nrEvent(
        "rollWrapper",
        "enter",
        this,
        {
          list: hex(this.listId),
          listType: nrType(listForm),
          ref: hex(this.refId),
        },
        this.returnAddress,
      );
    },
    onLeave() {
      if (!this.on) return;
      nrWatchLeave(this.tid);
      nrEvent(
        "rollWrapper",
        "leave",
        this,
        Object.assign(
          { list: hex(this.listId), ref: hex(this.refId) },
          nrCalced(this.out),
        ),
      );
    },
  });

  // 14751 TESLeveledList::CalculateCurrentFormList(this, a_level, a_count, a_calcedObjects&, a_arg5, a_usePlayerLevel)
  // site: where the return lands (section 8.4): outfit (16155+0xca), container (16129+0x21c), lvln (near 14752), other
  nrAttach("calcFormList", {
    onEnter(args) {
      this.tid = this.threadId;
      const why = nrAdmit("calcFormList", this.tid);
      this.on = why !== null;
      if (!this.on) return;
      const listForm = args[0].isNull() ? NULL : args[0].sub(0x30); // the list's owner, +0x30 for LVLN, LVLI and LVSP
      this.listId = formId(listForm);
      this.out = args[3];
      this.ret = this.returnAddress;
      nrEvent(
        "calcFormList",
        "enter",
        this,
        {
          list: hex(this.listId),
          listType: nrType(listForm),
          level: args[1].toInt32() & 0xffff,
          count: nrI16(args[2]),
          arg5: args[4].toUInt32(),
          usePlayerLevel: nrByte(args[5]),
          inRoll: why === "roll",
          site: nrRollSite(this.ret),
          in16155: (nrResolveDepth[this.tid] || 0) > 0,
        },
        this.ret,
      );
    },
    onLeave() {
      if (!this.on) return;
      nrEvent(
        "calcFormList",
        "leave",
        this,
        Object.assign({ list: hex(this.listId) }, nrCalced(this.out)),
      );
    },
  });

  // 20205 GetCalcLevel(a_ref, a_adjustLevel): one line per call with the return
  nrAttach("getCalcLevel", {
    onEnter(args) {
      this.tid = this.threadId;
      this.refId = formId(args[0]);
      const why = nrAdmit("getCalcLevel", this.tid, this.refId);
      this.on = why !== null;
      if (!this.on) return;
      this.adjust = nrByte(args[1]);
      this.why = why;
      this.ret = this.returnAddress;
    },
    onLeave(retval) {
      if (!this.on) return;
      nrEvent(
        "getCalcLevel",
        "call",
        this,
        {
          ref: hex(this.refId),
          adjustLevel: this.adjust,
          level: retval.toInt32() & 0xffff,
          raw: retval.toInt32(),
          inRoll: this.why === "roll",
        },
        this.ret,
      );
    },
  });

  // 418622 the outfit equipper (a_npc TESNPC*, a_actor Actor*, bool, a_equipBest, bool, a_noEventScope)
  // defaultOutfit per call (rcx+0x218, TESNPC.h:281; section 8.4), tallied null vs set even when
  // filtered; a passing frame records what ran inside it (19691 results, 16072, 19692, 19690, 38894)
  nrAttach("outfitEquip", {
    onEnter(args) {
      const npc = args[0];
      const actor = args[1];
      this.tid = this.threadId;
      this.actorId = formId(actor);
      const npcId = formId(npc);
      const outfit = nrNpcOutfit(npc, "default");
      const c = nrCount("outfitEquip");
      c.tally = c.tally || { nullOutfit: 0, withOutfit: 0 };
      if (outfit.isNull()) c.tally.nullOutfit += 1;
      else c.tally.withOutfit += 1;
      this.on = nrGate("outfitEquip", this.actorId, [npcId]);
      if (!this.on) return;
      nrWatchEnter(this.tid);
      this.outfitId = formId(outfit);
      this.prevFrame = nrEquipFrames[this.tid];
      nrEquipFrames[this.tid] = {
        hasOutfitItems: [],
        initOutfitItems: 0,
        addWornOutfit: 0,
        removeOutfitItems: 0,
        equipObject: 0,
      };
      nrEvent(
        "outfitEquip",
        "enter",
        this,
        {
          npc: hex(npcId),
          actor: hex(this.actorId),
          actorBase: hex(formId(nrBaseOf(actor))),
          defaultOutfit: hex(this.outfitId),
          sleepOutfit: hex(formId(nrNpcOutfit(npc, "sleep"))),
          flag3: nrByte(args[2]),
          equipBest: nrByte(args[3]),
          flag5: nrByte(args[4]),
          noEventScope: nrByte(args[5]),
        },
        this.returnAddress,
      );
    },
    onLeave() {
      if (!this.on) return;
      nrWatchLeave(this.tid);
      const frame = nrEquipFrames[this.tid];
      if (this.prevFrame) nrEquipFrames[this.tid] = this.prevFrame;
      else delete nrEquipFrames[this.tid];
      nrEvent(
        "outfitEquip",
        "leave",
        this,
        Object.assign(
          { actor: hex(this.actorId), defaultOutfit: hex(this.outfitId) },
          frame || {},
        ),
      );
    },
  });

  // 16072 InventoryChanges::InitOutfitItems(this, a_outfit, a_npcLevel): the late path (8.1)
  nrAttach("initOutfitItems", {
    onEnter(args) {
      const changes = args[0];
      const owner = changes.isNull() ? NULL : readPtr(changes.add(0x08)); // InventoryChanges.h:64
      const refId = formId(owner);
      const outfitId = formId(args[1]);
      const frame = nrEquipFrame(this.threadId);
      if (frame) frame.initOutfitItems += 1;
      if (!nrGate("initOutfitItems", refId, [outfitId])) return;
      nrEvent(
        "initOutfitItems",
        "call",
        this,
        {
          changes: changes.toString(),
          owner: hex(refId),
          ownerBase: hex(formId(nrBaseOf(owner))),
          outfit: hex(outfitId),
          npcLevel: args[2].toInt32() & 0xffff,
        },
        this.returnAddress,
      );
    },
  });

  // 19692 Actor::AddWornOutfit(this, a_outfit, a_forceUpdate)
  nrAttach("addWornOutfit", {
    onEnter(args) {
      const actorId = formId(args[0]);
      const outfitId = formId(args[1]);
      const frame = nrEquipFrame(this.threadId);
      if (frame) frame.addWornOutfit += 1;
      if (!nrGate("addWornOutfit", actorId, [outfitId])) return;
      nrEvent(
        "addWornOutfit",
        "call",
        this,
        {
          actor: hex(actorId),
          outfit: hex(outfitId),
          forceUpdate: nrByte(args[2]),
        },
        this.returnAddress,
      );
    },
  });

  // 19690 Actor::RemoveOutfitItems(this, a_outfit): fromInit when the return is 16038+0xb4, the
  // null-outfit strip inside InitInventoryIfRequired (section 8.3)
  nrAttach("removeOutfitItems", {
    onEnter(args) {
      const actorId = formId(args[0]);
      const outfitId = formId(args[1]);
      const frame = nrEquipFrame(this.threadId);
      if (frame) frame.removeOutfitItems += 1;
      if (!nrGate("removeOutfitItems", actorId, [outfitId])) return;
      const ret = this.returnAddress;
      nrEvent(
        "removeOutfitItems",
        "call",
        this,
        {
          actor: hex(actorId),
          outfit: hex(outfitId),
          outfitNull: args[1].isNull(),
          fromInit: nrExeOff(ret) === nrExpected.stripAtInit,
        },
        ret,
      );
    },
  });

  // 19691 Actor::HasOutfitItems(this, a_outfit): the result in al on leave (section 8.2: read only
  // by 418622, so it gates the late 16072 and nothing at the load)
  nrAttach("hasOutfitItems", {
    onEnter(args) {
      this.tid = this.threadId;
      this.actorId = formId(args[0]);
      this.outfitId = formId(args[1]);
      this.ret = this.returnAddress;
      this.on = nrGate("hasOutfitItems", this.actorId, [this.outfitId]);
    },
    onLeave(retval) {
      const result = retval.toInt32() & 0xff;
      const frame = nrEquipFrame(this.tid);
      if (frame) frame.hasOutfitItems.push(result);
      if (!this.on) return;
      nrEvent(
        "hasOutfitItems",
        "call",
        this,
        {
          actor: hex(this.actorId),
          outfit: hex(this.outfitId),
          result: result,
        },
        this.ret,
      );
    },
  });

  // 16038 TESObjectREFR::InitInventoryIfRequired(this, a_ignoreContainerExtraData): the init that
  // strips and re-rolls (section 8.3); the ref is the gate's reference; expected callers 19507,
  // 37791, 14374, 13723, 19802, 54755, 12095 (the near label)
  nrAttach("initInventoryIfRequired", {
    onEnter(args) {
      const ref = args[0];
      this.tid = this.threadId;
      this.refId = formId(ref);
      const base = nrBaseOf(ref);
      const baseId = formId(base);
      this.on = nrGate("initInventoryIfRequired", this.refId, [baseId]);
      if (!this.on) return;
      nrWatchEnter(this.tid);
      this.ret = this.returnAddress;
      nrEvent(
        "initInventoryIfRequired",
        "enter",
        this,
        {
          ref: hex(this.refId),
          refType: nrType(ref),
          base: hex(baseId),
          baseType: nrType(base),
          ignoreContainerExtraData: nrByte(args[1]),
        },
        this.ret,
      );
    },
    onLeave(retval) {
      if (!this.on) return;
      nrWatchLeave(this.tid);
      nrEvent("initInventoryIfRequired", "leave", this, {
        ref: hex(this.refId),
        result: retval.toInt32() & 0xff,
      });
    },
  });

  // 16129 InventoryChanges::InitLeveledItems(this): rcx the changes, its owner at +0x08
  // (InventoryChanges.h:64); the load-time site of the outfit roll (section 8.1)
  nrAttach("initLeveledItems", {
    onEnter(args) {
      const changes = args[0];
      const owner = changes.isNull() ? NULL : readPtr(changes.add(0x08)); // InventoryChanges.h:64
      this.tid = this.threadId;
      this.ownerId = formId(owner);
      const base = nrBaseOf(owner);
      const baseId = formId(base);
      this.on = nrGate("initLeveledItems", this.ownerId, [baseId]);
      if (!this.on) return;
      nrWatchEnter(this.tid);
      this.ret = this.returnAddress;
      nrEvent(
        "initLeveledItems",
        "enter",
        this,
        {
          changes: changes.toString(),
          owner: hex(this.ownerId),
          ownerType: nrType(owner),
          ownerBase: hex(baseId),
          ownerBaseType: nrType(base),
          defaultOutfit: hex(formId(nrNpcOutfit(base, "default"))),
          sleepOutfit: hex(formId(nrNpcOutfit(base, "sleep"))),
        },
        this.ret,
      );
    },
    onLeave() {
      if (!this.on) return;
      nrWatchLeave(this.tid);
      nrEvent(
        "initLeveledItems",
        "leave",
        this,
        { owner: hex(this.ownerId) },
        this.ret,
      );
    },
  });

  // 16155 the outfit-array resolver (a_items BSTArray<TESForm*>*, a_ctx OutfitInitCtx*), the
  // detour site (section 8.4): rcx the outfit's items (count at +0x10), rdx the ctx {outfit +0,
  // changes +8, level u16 +0x10} (8.2); the owner through changes +0x08 (InventoryChanges.h:64).
  // slotByBase: which of the owner's base outfits the ctx's outfit is; the leave's slot and
  // retIn come from the return address (16129+0xcc default, +0xe9 sleep, or inside 16072)
  nrAttach("outfitArrayResolve", {
    onEnter(args) {
      const items = args[0];
      const ctx = args[1];
      this.tid = this.threadId;
      nrResolveDepth[this.tid] = (nrResolveDepth[this.tid] || 0) + 1;
      const outfit = readPtr(ctx); // OutfitInitCtx +0x00 (8.2)
      const changes = ctx.isNull() ? NULL : readPtr(ctx.add(0x08)); // +0x08 (8.2)
      const owner = changes.isNull() ? NULL : readPtr(changes.add(0x08)); // InventoryChanges.h:64
      this.ownerId = formId(owner);
      this.outfitId = formId(outfit);
      const base = nrBaseOf(owner);
      const baseId = formId(base);
      this.on = nrGate("outfitArrayResolve", this.ownerId, [
        this.outfitId,
        baseId,
      ]);
      if (!this.on) return;
      nrWatchEnter(this.tid);
      this.ret = this.returnAddress;
      let slotByBase = "other";
      if (!outfit.isNull()) {
        if (outfit.equals(nrNpcOutfit(base, "default"))) slotByBase = "default";
        else if (outfit.equals(nrNpcOutfit(base, "sleep")))
          slotByBase = "sleep";
      }
      nrEvent(
        "outfitArrayResolve",
        "enter",
        this,
        Object.assign(
          {
            items: items.toString(),
            outfit: hex(this.outfitId),
            outfitType: nrType(outfit),
            changes: changes.toString(),
            owner: hex(this.ownerId),
            ownerType: nrType(owner),
            ownerBase: hex(baseId),
            level: ctx.isNull() ? -1 : nrU16(ctx.add(0x10)), // u16 at +0x10 (8.2)
            slotByBase: slotByBase,
          },
          nrFormArray(items),
        ),
        this.ret,
      );
    },
    onLeave(retval) {
      if (nrResolveDepth[this.tid]) nrResolveDepth[this.tid] -= 1;
      if (!this.on) return;
      nrWatchLeave(this.tid);
      nrEvent(
        "outfitArrayResolve",
        "leave",
        this,
        Object.assign(
          {
            owner: hex(this.ownerId),
            outfit: hex(this.outfitId),
            result: retval.toInt32() & 0xff,
          },
          nrResolveRet(this.ret),
        ),
        this.ret,
      );
    },
  });

  // 38894 ActorEquipManager::EquipObject(this, a_actor, a_object, a_extraData, a_count, a_slot,
  // a_queueEquip, a_forceEquip, a_playSounds, a_applyNow) (A/ActorEquipManager.h:19): a frame-rate
  // hook, so counts only past its own cap (equipCap, 50) except inside a watched frame or on a
  // listed ref; the first lines carry the return's near label (what wears the outfit if 19692 stays zero)
  nrAttach("equipObject", {
    onEnter(args) {
      this.tid = this.threadId;
      const actor = args[1];
      const actorId = formId(actor);
      const frame = nrEquipFrame(this.tid);
      if (frame) frame.equipObject += 1;
      const why = nrAdmit("equipObject", this.tid, actorId, nrEquipCap);
      if (why === null) return;
      const object = args[2];
      nrEvent(
        "equipObject",
        "call",
        this,
        {
          actor: hex(actorId),
          actorBase: hex(formId(nrBaseOf(actor))),
          object: hex(formId(object)),
          objectType: nrType(object),
          extraData: args[3].toString(),
          count: args[4].toUInt32(),
          slot: hex(formId(args[5])),
          queueEquip: nrByte(args[6]),
          forceEquip: nrByte(args[7]),
          playSounds: nrByte(args[8]),
          applyNow: nrByte(args[9]),
          inRoll: why === "roll",
          inEquipFrame: frame !== undefined,
        },
        this.returnAddress,
      );
    },
  });

  // 37323 the re-roll (a_actor, a_arg): the base before and after; the return's near label on
  // both lines (at a cell's attach it is 19231 with arg -1, x-npc-fate-outfit 20261024-000244)
  nrAttach("reroll", {
    onEnter(args) {
      const actor = args[0];
      this.actor = actor;
      this.tid = this.threadId;
      this.actorId = formId(actor);
      const baseId = formId(nrBaseOf(actor));
      this.on = nrGate("reroll", this.actorId, [baseId]);
      if (!this.on) return;
      nrWatchEnter(this.tid);
      this.ret = this.returnAddress;
      nrEvent(
        "reroll",
        "enter",
        this,
        { actor: hex(this.actorId), base: hex(baseId), arg: args[1].toInt32() },
        this.returnAddress,
      );
    },
    onLeave() {
      if (!this.on) return;
      nrWatchLeave(this.tid);
      const base = nrBaseOf(this.actor);
      const id = formId(base);
      nrEvent(
        "reroll",
        "leave",
        this,
        {
          actor: hex(this.actorId),
          base: hex(id),
          baseType: nrType(base),
          runtime: id >= 0xff000000,
        },
        this.ret,
      );
    },
  });

  // 37322 Actor::ResetInventory(this, a_leveledOnly): 418622 runs inside it (report section 2);
  // the return's near label on both lines (19231 at a cell's attach, right after the re-roll)
  nrAttach("resetInventory", {
    onEnter(args) {
      const actor = args[0];
      this.tid = this.threadId;
      this.actorId = formId(actor);
      this.on = nrGate("resetInventory", this.actorId, [
        formId(nrBaseOf(actor)),
      ]);
      if (!this.on) return;
      nrWatchEnter(this.tid);
      this.ret = this.returnAddress;
      nrEvent(
        "resetInventory",
        "enter",
        this,
        { actor: hex(this.actorId), leveledOnly: nrByte(args[1]) },
        this.returnAddress,
      );
    },
    onLeave() {
      if (!this.on) return;
      nrWatchLeave(this.tid);
      nrEvent(
        "resetInventory",
        "leave",
        this,
        { actor: hex(this.actorId) },
        this.ret,
      );
    },
  });

  // the ready stamp: everything after it is hooked; align the trace here
  emit({
    ready: true,
    script: "npc-roll.js",
    version: version,
    base: exe.base.toString(),
    hooks: nrHooked,
    ids: nrIds,
    refs: Array.from(nrRefs).map(hex),
    bases: Array.from(nrBases).map(hex),
    cap: nrCap,
    equipCap: nrEquipCap,
    summaryMs: nrSummaryMs,
  });

  // the summary: every attached hook's counts since the last one, zeros included, only when
  // something ran anywhere
  let nrLast = Date.now();
  setInterval(function () {
    const hooks = {};
    let any = false;
    for (const k of Object.keys(nrHooked)) {
      const c = nrCount(k);
      if (c.n > 0) any = true;
      hooks[k] = {
        n: c.n,
        logged: c.logged,
        filtered: c.filtered,
        capped: c.capped,
      };
      if (c.tally) {
        hooks[k].tally = Object.assign({}, c.tally);
        for (const t of Object.keys(c.tally)) c.tally[t] = 0;
      }
      c.n = 0;
      c.logged = 0;
      c.filtered = 0;
      c.capped = 0;
    }
    if (!any) return;
    const now = Date.now();
    emit({ summary: true, sinceMs: now - nrLast, hooks: hooks });
    nrLast = now;
  }, nrSummaryMs);
}
