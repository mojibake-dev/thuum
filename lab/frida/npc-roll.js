// npc-roll.js: the engine's leveled roll and outfit roll on one seat, for
// docs/research/m3/re-npc-roll.md section 5 (train-41, ADR-046 decision 1)
// and docs/verbs/npc-fate.md's x-npc-fate-roll leg. Ten hooks along the chain
// InitItemImpl -> the leveled resolver -> the roll wrapper ->
// CalculateCurrentFormList -> GetCalcLevel, the outfit side's equipper ->
// InitOutfitItems / AddWornOutfit / RemoveOutfitItems, the re-roll and
// Actor::ResetInventory. Every event is one JSON line: hook, phase (enter,
// leave or call), seq (order for equal stamps), tid, the fields below, ret
// (the caller's return address as module+offset) with near (the nearest known
// function start at or below it, a hint: sizes are unknown), and t
// (Date.now()). Align the trace on its `ready` line, never on the step list.
//
// Address Library 1.6.1170 ids; every offset by `just addr <id>` (lab/addr.py
// over addrlib/, runtime 1.6.1170.0, 428461 entries) on 2026-10-23. Names and
// argument shapes are re-npc-roll.md's (sections 1, 2 and 6; its status):
//    14374  0x1d74e0  the leveled resolver (a_data TESActorBaseData*, a_ref, a_skipInit)       HYPOTHESIS
//    14752  0x1e3e70  the per-reference roll wrapper (a_list TESLeveledList*, a_ref, a_out)      HYPOTHESIS
//    14751  0x1e3a30  TESLeveledList::CalculateCurrentFormList                                  CommonLib name
//    20205  0x2fa590  GetCalcLevel (a_ref, a_adjustLevel)                                         CommonLib name
//   418622  0x3bd380  the outfit equipper (a_npc, a_actor, bool, a_equipBest, bool, a_noEventScope) HYPOTHESIS
//    16072  0x22e730  InventoryChanges::InitOutfitItems (this, a_outfit, a_npcLevel)             CommonLib name
//    19692  0x2e1b00  Actor::AddWornOutfit (this, a_outfit, a_forceUpdate)                       CommonLib name
//    19690  0x2e1930  Actor::RemoveOutfitItems (this, a_outfit)                                   CommonLib name
//    37323  0x665fc0  the re-roll (a_actor, a_arg)                                                HYPOTHESIS
//    37322  0x665ec0  Actor::ResetInventory (this, a_leveledOnly), vfunc 0x8A                     CONFIRMED-STATIC vtable
// All ten resolved; nothing left out. Not hooked, resolved the same day so a
// return address can be matched to the report's expected callers:
//    19507  0x2d8730  TESObjectREFR::InitItemImpl        37791  0x692560  Character::InitItemImpl
//    13723  0x1b6c10  CreateReferenceAtLocation           24725  0x3bba20  the biped worn init
//    39800  0x70d7b0  the process-side outfit step        40746  0x74cc90  InitOutfitItems' other caller
//    16038  0x225770  InitInventoryIfRequired             16155  0x23a2b0  InitOutfitItems' item loop
//    54755  0x9ea540  Papyrus Actor.SetOutfit             54691  0x9e8980  Papyrus Actor.GetLeveledActorBase
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
//   InventoryChanges::owner +0x08 (I/InventoryChanges.h:64)
//   TESNPC::defaultOutfit +0x218 (T/TESNPC.h:281)
//   FormType NPC_ 0x2B, LVLN 0x2C, LVLI 0x35, ACHR 0x3E, LVSP 0x52 (F/FormTypes.h:183, 184, 193, 202, 222)
// Argument positions follow the headers: CalculateCurrentFormList is a member
// (T/TESLeveledList.h:65; src/RE/T/TESLeveledList.cpp:7-11, RELOCATION_ID(14579,
// 14751)), so rcx this, dx a_level, r8w a_count, r9 a_calcedObjects, and a_arg5
// and a_usePlayerLevel on the stack (Frida's args[4] and args[5]); the plan's
// "arg5 in r9" is where the header puts the out array, so r9 is read as the
// array and its count logged on leave. RemoveOutfitItems takes the outfit
// alone (A/Actor.h:617); AddWornOutfit's second argument is a_forceUpdate
// (A/Actor.h:502); ResetInventory's is a_leveledOnly (A/Actor.h:335, the
// override of T/TESObjectREFR.h:338). That r8 of 14752 and r9 of 14751 hold a
// BSScrapArray<CALCED_OBJECT> is the report's HYPOTHESIS; the layout read
// through it is the header's.
//
// Params through globalThis.LAB_PARAMS (lab-api prepends them for a scenario's
// `frida {script: npc-roll.js, params: {...}}` step, labapi/runner.py
// frida_script_text; `just frida` carries none, so a hand run logs everything):
//   refs [formIds]   only events whose reference is listed, where one is known
//                    (14374, 14752, 418622, 16072, 19692, 19690, 37323, 37322)
//   bases [formIds]  the same gate by the placed base, the TPLT, the list, the
//                    NPC or the outfit (either list admits an event)
//   cap (200)        14751 and 20205 log their first cap calls each, then counts
//                    only; a call nested inside a passing outer hook on the same
//                    thread (inRoll: true), or on a listed ref, always logs
// A `summary` line every 5 s carries each hook's counts since the last one (n,
// logged, filtered, capped) so a frame-rate hook never floods. Both send and
// console.log carry every line (frida-inject's stdout is block-buffered; the
// lab's preamble turns console.log into a flushed file and send into a no-op).
// Run: a scenario step `c1: frida {script: npc-roll.js, params: {refs: [0x85547,
// 0x85549]}}` before the teleport into the forest cell 0x9810 (b-cell-host's
// landing), or `just frida npc-roll.js c1` by hand. The run collects the lines
// as frida/c1-npc-roll.jsonl; a hand run's come back with the next run as
// frida/c1-npc-roll.before-run.jsonl (lab/frida/README.md).
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
  },
};

// known function starts for labeling return addresses (not hooked); `just addr` the same day
const nrKnownStarts = {
  "1.6.1170.0": [
    [0x1b6c10, "13723 CreateReferenceAtLocation"],
    [0x1d74e0, "14374 leveledResolve"],
    [0x1e3a30, "14751 CalculateCurrentFormList"],
    [0x1e3e70, "14752 rollWrapper"],
    [0x225770, "16038 InitInventoryIfRequired"],
    [0x22e730, "16072 InitOutfitItems"],
    [0x23a2b0, "16155 InitOutfitItems item loop"],
    [0x2d8730, "19507 TESObjectREFR::InitItemImpl"],
    [0x2e1930, "19690 RemoveOutfitItems"],
    [0x2e1b00, "19692 AddWornOutfit"],
    [0x2fa590, "20205 GetCalcLevel"],
    [0x3bba20, "24725 biped worn init"],
    [0x3bd380, "418622 outfitEquip"],
    [0x665ec0, "37322 Actor::ResetInventory"],
    [0x665fc0, "37323 reroll"],
    [0x692560, "37791 Character::InitItemImpl"],
    [0x70d7b0, "39800 process-side outfit step"],
    [0x74cc90, "40746 InitOutfitItems other caller"],
    [0x9e8980, "54691 Papyrus Actor.GetLeveledActorBase"],
    [0x9ea540, "54755 Papyrus Actor.SetOutfit"],
  ],
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
  0x2b: "NPC_",
  0x2c: "LVLN",
  0x35: "LVLI",
  0x3e: "ACHR",
  0x52: "LVSP",
}; // FormTypes.h
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

const exe = Process.getModuleByName("SkyrimSE.exe");
const version = fileVersion(exe.path);
const at = OFFSETS[version];
if (at === undefined) {
  emit({ error: "no offsets for this runtime", version: version });
} else {
  const nrKnown = nrKnownStarts[version].slice().sort(function (a, b) {
    return a[0] - b[0];
  });

  // the return address as module+offset; near: the nearest known start at or below it
  function nrCaller(ret) {
    if (!ret || ret.isNull()) return { ret: "0x0" };
    const m = Process.findModuleByAddress(ret);
    if (!m) return { ret: ret.toString() };
    const off = ret.sub(m.base);
    const row = { ret: m.name + "+0x" + off.toString(16) };
    if (m.base.equals(exe.base)) {
      const n = off.toUInt32();
      let best = null;
      for (const k of nrKnown) {
        if (k[0] <= n) best = k;
        else break;
      }
      if (best) row.near = best[1] + "+0x" + (n - best[0]).toString(16);
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

  // per-hook counters: n, logged, filtered, capped reset at every summary; budget and capNoticed persist
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

  // a passing outer frame (14374, 14752, 418622, 37323, 37322) raises its thread's watch
  // depth, so the 14751 and 20205 calls inside it log past the cap (inRoll: true)
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

  // the cap gate for 14751 and 20205: 'roll' inside a watched frame, 'ref' on a listed
  // reference, 'cap' within the first nrCap calls, null once counts-only
  function nrAdmit(hook, tid, refId) {
    const c = nrCount(hook);
    c.n += 1;
    if (nrInRoll(tid)) {
      c.logged += 1;
      return "roll";
    }
    if (refId !== undefined && nrRefs.has(refId >>> 0)) {
      c.logged += 1;
      return "ref";
    }
    if (c.budget < nrCap) {
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
        cap: nrCap,
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

  const nrHooked = {};
  function nrAttach(name, callbacks) {
    try {
      Interceptor.attach(exe.base.add(at[name]), callbacks);
      nrHooked[name] = hex(at[name]);
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
  nrAttach("calcFormList", {
    onEnter(args) {
      this.tid = this.threadId;
      const why = nrAdmit("calcFormList", this.tid);
      this.on = why !== null;
      if (!this.on) return;
      const listForm = args[0].isNull() ? NULL : args[0].sub(0x30); // the list's owner, +0x30 for LVLN, LVLI and LVSP
      this.listId = formId(listForm);
      this.out = args[3];
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
        },
        this.returnAddress,
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
  nrAttach("outfitEquip", {
    onEnter(args) {
      const npc = args[0];
      const actor = args[1];
      this.tid = this.threadId;
      this.actorId = formId(actor);
      const npcId = formId(npc);
      this.on = nrGate("outfitEquip", this.actorId, [npcId]);
      if (!this.on) return;
      nrWatchEnter(this.tid);
      const outfit = npc.isNull() ? NULL : readPtr(npc.add(0x218)); // TESNPC.h:281
      nrEvent(
        "outfitEquip",
        "enter",
        this,
        {
          npc: hex(npcId),
          actor: hex(this.actorId),
          actorBase: hex(formId(nrBaseOf(actor))),
          defaultOutfit: hex(formId(outfit)),
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
      nrEvent("outfitEquip", "leave", this, { actor: hex(this.actorId) });
    },
  });

  // 16072 InventoryChanges::InitOutfitItems(this, a_outfit, a_npcLevel)
  nrAttach("initOutfitItems", {
    onEnter(args) {
      const changes = args[0];
      const owner = changes.isNull() ? NULL : readPtr(changes.add(0x08)); // InventoryChanges.h:64
      const refId = formId(owner);
      const outfitId = formId(args[1]);
      if (!nrGate("initOutfitItems", refId, [outfitId])) return;
      nrEvent(
        "initOutfitItems",
        "call",
        this,
        {
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

  // 19690 Actor::RemoveOutfitItems(this, a_outfit)
  nrAttach("removeOutfitItems", {
    onEnter(args) {
      const actorId = formId(args[0]);
      const outfitId = formId(args[1]);
      if (!nrGate("removeOutfitItems", actorId, [outfitId])) return;
      nrEvent(
        "removeOutfitItems",
        "call",
        this,
        { actor: hex(actorId), outfit: hex(outfitId) },
        this.returnAddress,
      );
    },
  });

  // 37323 the re-roll (a_actor, a_arg): the base before and after
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
      nrEvent("reroll", "leave", this, {
        actor: hex(this.actorId),
        base: hex(id),
        baseType: nrType(base),
        runtime: id >= 0xff000000,
      });
    },
  });

  // 37322 Actor::ResetInventory(this, a_leveledOnly): 418622 runs inside it (report section 2)
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
      nrEvent("resetInventory", "leave", this, { actor: hex(this.actorId) });
    },
  });

  // the ready stamp: everything after it is hooked; align the trace here
  emit({
    ready: true,
    script: "npc-roll.js",
    version: version,
    base: exe.base.toString(),
    hooks: nrHooked,
    refs: Array.from(nrRefs).map(hex),
    bases: Array.from(nrBases).map(hex),
    cap: nrCap,
    summaryMs: nrSummaryMs,
  });

  // the summary: counts since the last one, only when something ran
  let nrLast = Date.now();
  setInterval(function () {
    const hooks = {};
    let any = false;
    for (const k of Object.keys(nrCounts)) {
      const c = nrCounts[k];
      if (c.n === 0) continue;
      any = true;
      hooks[k] = {
        n: c.n,
        logged: c.logged,
        filtered: c.filtered,
        capped: c.capped,
      };
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
