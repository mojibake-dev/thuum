// equip-queue-trace.js: the AI process's equip queue against the inventory
// removals, for docs/verbs/npc-fate.md 1c (THE READ of c1's three crashes on
// 18531 at 06:12:38Z, 06:13:00Z and 06:13:23Z, 2026-11-04) and its fix
// (m3-canon-fate-inv 802842d9). The hypothesis under test: Actor::RemoveItem
// of a weapon queues the next-best weapon's equip on the process
// (MiddleHighProcessData::itemstoEquipUnequip, CommonLibSSE-NG include/RE/M/
// MiddleHighProcessData.h:157; a QueuedItem keeps ObjectEquipParams::
// extraDataList as a raw pointer, :66, :81-94), purging queued nodes only
// where the node's list is the a_extraList passed; the fork's reconcile
// passed nullptr and removed the queued weapon next, freeing its list, and
// the actor-update job's flush (39814 on a BSJobs::JobThread) handed the
// freed list to EquipObject or UnequipObject. Nine hooks, one JSON line per
// event (hook, phase, seq, tid, the fields below, ret with near), aligned on
// the `ready` line. The script keeps every list pointer a queue node took
// (39821) and every list a removal named or a free took (19689, 16059), so a
// 38894 or 38901 whose a_extraData is a queued list already removed or freed
// prints `fault: true`: on 18531 one such line precedes the crash; on
// 802842d9 none appears while the removals pass their own lists (`queued:
// true` on the 19689 line, so the purge matches) and the dress runs with the
// queue flag 0.
//
// Expected on 18531 (the fault): RedressOnGameThread's thread emits
// removeItem lines with list 0x0 on 39fe2's weapons, between them a
// queueNode line whose list is a real pointer, then an entryFree or a
// removeItem naming that list, then on another tid a queueFlush enter and an
// equipObject or unequipObject with that pointer and fault true, then the
// crash. Expected on the fix: removeItem lines with queued true where a node
// exists (and unequipObject with queue 0 and applyNow 1 before a worn
// stack's removal), no fault line, addWornOutfit's equips with queue 0.
// Falsifiers: a fault line whose list no queueNode took (another holder of
// the list); the free from a caller outside the redress (near says who);
// the crash with no fault line at all (the mechanism is elsewhere).
//
// Address Library 1.6.1170 ids; every offset by `just addr <id>` (lab/addr.py
// over addrlib/, runtime 1.6.1170.0, 428461 entries) on 2026-11-04. Names are
// the re-analyst's static read (HYPOTHESIS) or CommonLibSSE-NG's:
//    39814  0x70e250  the equip-queue flush (per node Equip/UnequipObject, queue flag 0)   HYPOTHESIS
//    39821  0x70e440  the queue node allocator (0x48 bytes, copies the list pointer)      HYPOTHESIS
//    39822  0x70e5d0  the queue purge by list (node list == a_extraList)                   HYPOTHESIS
//    38894  0x6c9820  ActorEquipManager::EquipObject                                       CommonLib Offsets.h
//    38901  0x6ca010  ActorEquipManager::UnequipObject                                     CommonLib Offsets.h
//    19689  0x2e1750  TESObjectREFR::RemoveItem                                             CommonLib name
//    37797  0x692800  Actor::RemoveItem (the override; purges by list, queues next-best)  HYPOTHESIS
//    16059  0x228180  the entry and list deleter at zero count                             HYPOTHESIS
//    41381  0x771520  the actor-update job body (UpdateNonRenderSafe, then 39814)          HYPOTHESIS
// Argument positions follow the headers: EquipObject and UnequipObject are
// members (A/ActorEquipManager.h:19, 22): rcx this, rdx a_actor, r8 a_object,
// r9 a_extraData, then a_count, a_slot, a_queueEquip, a_forceEquip,
// a_playSounds, a_applyNow on the stack (Frida's args[4] to args[9]).
// RemoveItem is a member (T/TESObjectREFR.h:282; A/Actor.h:300): rcx this,
// rdx a_item, r8d a_count, r9d a_reason, then a_extraList, a_moveToRef on the
// stack (args[4], args[5]). 39821, 39822 and 16059 have no header: their first
// four register arguments are printed raw and every pointer among them is
// matched against the lists seen. TESForm::formID +0x14 (T/TESForm.h:354).
//
// Params through globalThis.LAB_PARAMS (lab-api prepends them for a scenario's
// `frida {script: equip-queue-trace.js, params: {...}}` step; `just frida`
// carries none, so a hand run logs everything):
//   refs [formIds]   only equip, unequip and remove events on these actors
//                    (the manager's a_actor, RemoveItem's this); the queue
//                    hooks have no actor and always log, under cap
//   cap (400)        each hook logs its first cap events, then counts only;
//                    a fault line always logs
// A `summary` line every 5 s carries every hook's counts (n, logged, capped)
// and the sizes of the queued and removed sets. Both send and console.log
// carry every line (the lab's preamble turns console.log into a flushed file
// and send into a no-op). Run: `c1: frida {script: equip-queue-trace.js,
// params: {refs: [0x39fe2, 0x39fe4]}}` after the seat's relaunch and before
// its connect into Bleak Falls (lab/.cache/probes/x-fate-login-bleak-trace.yaml),
// or `just frida equip-queue-trace.js c1` by hand.
"use strict";
function emit(obj) {
  obj.t = Date.now();
  send(obj);
  console.log(JSON.stringify(obj));
}

const PARAMS =
  typeof LAB_PARAMS === "object" && LAB_PARAMS
    ? LAB_PARAMS
    : typeof params === "object" && params
      ? params
      : {};

// top-level names carry the prefix eq (a name matching a Frida global fails
// the load, lab/frida/npc-roll.js's note)
function eqIdSet(list) {
  const s = new Set();
  if (Array.isArray(list)) {
    for (const v of list)
      s.add((typeof v === "string" ? parseInt(v, 16) : v) >>> 0);
  }
  return s;
}
const eqRefs = eqIdSet(PARAMS.refs);
const eqCap = PARAMS.cap >>> 0 || 400;
const eqSummaryMs = 5000;

// offsets by `just addr <id>` for 1.6.1170 on 2026-11-04 (never from memory, CLAUDE.md rule 1)
const OFFSETS = {
  "1.6.1170.0": {
    queueFlush: 0x70e250, // 39814
    queueNode: 0x70e440, // 39821
    queuePurge: 0x70e5d0, // 39822
    equipObject: 0x6c9820, // 38894
    unequipObject: 0x6ca010, // 38901
    removeItem: 0x2e1750, // 19689
    actorRemoveItem: 0x692800, // 37797
    entryFree: 0x228180, // 16059
    actorUpdateJob: 0x771520, // 41381
  },
};
const eqIds = {
  queueFlush: 39814,
  queueNode: 39821,
  queuePurge: 39822,
  equipObject: 38894,
  unequipObject: 38901,
  removeItem: 19689,
  actorRemoveItem: 37797,
  entryFree: 16059,
  actorUpdateJob: 41381,
};
// known function starts for labeling return addresses; `just addr` the same day
const eqKnownStarts = {
  "1.6.1170.0": [
    [0x228180, "16059 entry and list deleter"],
    [0x2e1750, "19689 TESObjectREFR::RemoveItem"],
    [0x2e1930, "19690 Actor::RemoveOutfitItems"],
    [0x2e1b00, "19692 Actor::AddWornOutfit"],
    [0x692800, "37797 Actor::RemoveItem"],
    [0x6c9820, "38894 ActorEquipManager::EquipObject"],
    [0x6ca010, "38901 ActorEquipManager::UnequipObject"],
    [0x70e250, "39814 equip-queue flush"],
    [0x70e440, "39821 queue node allocator"],
    [0x70e5d0, "39822 queue purge by list"],
    [0x771220, "41380 actor-update job pusher"],
    [0x771520, "41381 actor-update job body"],
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
function formId(form) {
  return form.isNull() ? 0 : u32(form.add(0x14));
} // TESForm.h:354
function eqByte(a) {
  return a.toInt32() & 0xff;
}
function eqPtrKey(p) {
  return p && !p.isNull() ? p.toString() : "0x0";
}

const exe = Process.getModuleByName("SkyrimSE.exe");
const version = fileVersion(exe.path);
const at = OFFSETS[version];
if (at === undefined) {
  emit({ error: "no offsets for this runtime", version: version });
} else {
  const eqKnown = eqKnownStarts[version].slice().sort(function (a, b) {
    return a[0] - b[0];
  });
  function eqNearest(off) {
    let best = null;
    for (const k of eqKnown) {
      if (k[0] <= off) best = k;
      else break;
    }
    return best;
  }
  function eqCaller(ret) {
    if (!ret || ret.isNull()) return { ret: "0x0" };
    const m = Process.findModuleByAddress(ret);
    if (!m) return { ret: ret.toString() };
    const off = ret.sub(m.base);
    const row = { ret: m.name + "+0x" + off.toString(16) };
    if (m.base.equals(exe.base)) {
      const best = eqNearest(off.toUInt32());
      if (best)
        row.near = best[1] + "+0x" + (off.toUInt32() - best[0]).toString(16);
    }
    return row;
  }

  let eqSeq = 0;
  const eqCounts = {};
  function eqCount(name) {
    if (!eqCounts[name]) eqCounts[name] = { n: 0, logged: 0, capped: 0 };
    return eqCounts[name];
  }
  // the list pointers a queue node took, a removal named, a free took: pointer string -> seq
  const eqQueued = new Map();
  const eqRemoved = new Map();
  const eqFreed = new Map();
  function eqMark(map, p) {
    const k = eqPtrKey(p);
    if (k !== "0x0") map.set(k, eqSeq);
  }
  function eqSeen(map, p) {
    const k = eqPtrKey(p);
    return k !== "0x0" && map.has(k) ? map.get(k) : null;
  }
  function eqLog(name, row, force) {
    const c = eqCount(name);
    c.n++;
    if (!force && c.logged >= eqCap) {
      c.capped++;
      return;
    }
    c.logged++;
    row.hook = name;
    row.seq = ++eqSeq;
    row.tid = Process.getCurrentThreadId();
    emit(row);
  }
  function eqAdmits(actorId) {
    return eqRefs.size === 0 || eqRefs.has(actorId >>> 0);
  }

  const attached = [];
  function eqAttach(name, cb) {
    try {
      Interceptor.attach(exe.base.add(at[name]), cb);
      attached.push(name);
    } catch (e) {
      emit({ hook: name, error: String(e) });
    }
  }

  // the flush and the job around it: enter and leave with the thread
  eqAttach("actorUpdateJob", {
    onEnter(args) {
      this.row = { phase: "enter", a0: eqPtrKey(args[0]) };
      eqLog("actorUpdateJob", this.row, false);
    },
    onLeave() {
      eqLog("actorUpdateJob", { phase: "leave" }, false);
    },
  });
  eqAttach("queueFlush", {
    onEnter(args) {
      eqLog(
        "queueFlush",
        Object.assign(
          { phase: "enter", a0: eqPtrKey(args[0]), a1: eqPtrKey(args[1]) },
          eqCaller(this.returnAddress),
        ),
        false,
      );
    },
    onLeave() {
      eqLog("queueFlush", { phase: "leave" }, false);
    },
  });
  // the node allocator: every pointer among the first four arguments is a
  // candidate list; all are kept (the header has no shape for it)
  eqAttach("queueNode", {
    onEnter(args) {
      const row = { phase: "enter" };
      for (let i = 0; i < 4; i++) {
        row["a" + i] = eqPtrKey(args[i]);
        eqMark(eqQueued, args[i]);
      }
      eqLog("queueNode", Object.assign(row, eqCaller(this.returnAddress)), false);
    },
  });
  eqAttach("queuePurge", {
    onEnter(args) {
      const row = { phase: "enter" };
      for (let i = 0; i < 4; i++) row["a" + i] = eqPtrKey(args[i]);
      row.queuedList = eqSeen(eqQueued, args[1]) !== null || eqSeen(eqQueued, args[2]) !== null;
      eqLog("queuePurge", Object.assign(row, eqCaller(this.returnAddress)), false);
    },
  });
  // the equip manager's two calls: the actor, the object, the list and the queue flag
  function eqManagerHook(name) {
    return {
      onEnter(args) {
        const actorId = formId(args[1]);
        if (!eqAdmits(actorId)) return;
        const list = args[3];
        const queuedAt = eqSeen(eqQueued, list);
        const removedAt = eqSeen(eqRemoved, list);
        const freedAt = eqSeen(eqFreed, list);
        const fault = queuedAt !== null && (removedAt !== null || freedAt !== null);
        const row = {
          phase: "enter",
          actor: hex(actorId),
          object: hex(formId(args[2])),
          list: eqPtrKey(list),
          count: args[4].toInt32(),
          queue: eqByte(args[6]),
          force: eqByte(args[7]),
          sounds: eqByte(args[8]),
          applyNow: eqByte(args[9]),
          queuedAt: queuedAt,
          removedAt: removedAt,
          freedAt: freedAt,
          fault: fault,
        };
        eqLog(name, Object.assign(row, eqCaller(this.returnAddress)), fault);
      },
    };
  }
  eqAttach("equipObject", eqManagerHook("equipObject"));
  eqAttach("unequipObject", eqManagerHook("unequipObject"));
  // the removals: this, the item, the count, the reason, the list passed
  function eqRemoveHook(name) {
    return {
      onEnter(args) {
        const refId = formId(args[0]);
        if (!eqAdmits(refId)) return;
        const list = args[4];
        const row = {
          phase: "enter",
          ref: hex(refId),
          item: hex(formId(args[1])),
          count: args[2].toInt32(),
          reason: args[3].toInt32(),
          list: eqPtrKey(list),
          queued: eqSeen(eqQueued, list) !== null,
        };
        eqMark(eqRemoved, list);
        eqLog(name, Object.assign(row, eqCaller(this.returnAddress)), false);
      },
    };
  }
  eqAttach("removeItem", eqRemoveHook("removeItem"));
  eqAttach("actorRemoveItem", eqRemoveHook("actorRemoveItem"));
  // the deleter: pointers among its first four arguments that a node took are the freed lists
  eqAttach("entryFree", {
    onEnter(args) {
      const row = { phase: "enter" };
      let queuedList = false;
      for (let i = 0; i < 4; i++) {
        row["a" + i] = eqPtrKey(args[i]);
        if (eqSeen(eqQueued, args[i]) !== null) {
          queuedList = true;
          eqMark(eqFreed, args[i]);
        }
      }
      row.queuedList = queuedList;
      eqLog("entryFree", Object.assign(row, eqCaller(this.returnAddress)), queuedList);
    },
  });

  emit({
    ready: true,
    script: "equip-queue-trace.js",
    version: version,
    base: exe.base.toString(),
    hooks: attached,
    ids: eqIds,
    refs: Array.from(eqRefs).map(hex),
    cap: eqCap,
  });
  setInterval(function () {
    emit({
      summary: true,
      counts: eqCounts,
      queued: eqQueued.size,
      removed: eqRemoved.size,
      freed: eqFreed.size,
    });
  }, eqSummaryMs);
}
