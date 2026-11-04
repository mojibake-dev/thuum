// reroll-main-trace.js: the living re-roll's 3D work against the main thread's
// deferred DetachHavok, for docs/verbs/npc-fate.md THE RAGDOLL CRASH READ
// (x-fate-inventory 20261104-202729: c1 crashed at SkyrimSE.exe+0xEB59A3,
// 78536+0x173, on thread 7380, a constraints buffer of one bhkRigidBody freed
// and recycled under the engine's ragdoll rebind that follows a Load3D; the fix
// fork m3-canon-4-reroll-main cc5c82b6 moves the fate's engine work onto the
// main thread through SKSE's UI task queue). The hypothesis under test, the
// re-analyst's static read: on the Papyrus VM thread TESObjectREFR::Set3D
// (19730) asks TaskQueueInterface::ShouldUseTaskQueue (39033) and DEFERS the
// old 3D's DetachHavok (37307) to the main thread as a task (36933 through the
// queue push 36993); the re-roll's Load3D (37177, 19727) then binds the new
// skeleton on the VM thread (20103, 32894, 63357, 63596, 63792, 78423, 78507,
// 78536) while the main thread drains the deferred DetachHavok, reads the NEW
// 3D and pulls its collision objects from the world (77864, 77883), freeing
// constraint buffers (68170, 78066, 79805) that the loader threads'
// bhkRagdollConstraint constructors (79806, 79807, 79810) recycle. One JSON
// line per event (hook, phase, seq, tid, the fields below, ret with near),
// aligned on the `ready` line, which also names Main's thread. Expected on a
// build before cc5c82b6 at a login into the Temple whose server fate for a
// living leveled clone differs from the client's pick (dress v8's premise):
// reroll enter on the VM thread (not Main's), refrSet3D with a null node,
// shouldQueue leaving true, a deferDetach and a queuePush, then refrLoad3D and
// the chain down to collector on the SAME thread, and, on a near miss,
// detachHavok on Main's thread with a non-null get3D2 while that window is
// still open, with arrayFree or constraintDtor lines on Main's thread inside
// the window. Expected on cc5c82b6: reroll enter on Main's thread, shouldQueue
// leaving false (or never asked), no deferDetach, the chain on Main's thread.
// Falsifiers: a free of the walked buffer on the VM thread itself inside the
// window (a same-thread lifetime bug); a constructor write with no free
// (aliasing); detachHavok never on Main's thread while a window is open on a
// run that still crashes at 78536+0x173 (then hook MemoryManager::Deallocate
// 68117 with the same window).
//
// Address Library 1.6.1170 ids; every offset by `just addr <id>` (lab/addr.py
// over addrlib/, runtime 1.6.1170.0, 428461 entries) on 2026-11-04. Names are
// the re-analyst's static read (HYPOTHESIS) or CommonLibSSE-NG's:
//    37323  0x665fc0  the engine's re-roll of a leveled actor (actor, int)       the fork's Offsets::Fate::ActorReroll
//    19730  0x2e5380  TESObjectREFR::Set3D (ref, node, bool)                      CommonLib (TESObjectREFR.h vfunc 0x6C)
//    39033  0x6d1ee0  TaskQueueInterface::ShouldUseTaskQueue                       CommonLib (TaskQueueInterface.h:19)
//    36933  0x655cd0  the deferred DetachHavok task (0x32)                         HYPOTHESIS name
//    36939  0x655f40  the deferred follow-up task (0x46)                           HYPOTHESIS name
//    36993  0x6595d0  the task queue's push                                        HYPOTHESIS name
//    37177  0x65e9e0  Actor::Load3D                                                CommonLib (TESObjectREFR.h vfunc 0x6A)
//    19727  0x2e3970  TESObjectREFR::Load3D                                        CommonLib
//    37178  0x65ebd0  Actor::Set3D                                                 CommonLib (vfunc 0x6C)
//    37307  0x664540  Actor::DetachHavok                                           CommonLib (TESObjectREFR.h:297, vfunc 0x65)
//    20103  0x2f69f0  post-load animation setup                                    HYPOTHESIS name
//    63357  0xba3b30  BSAnimationGraphManager::SetRootNodes                        HYPOTHESIS name
//    63596  0xbb3370  BShkbAnimationGraph::SetRootNode                             HYPOTHESIS name
//    63792  0xbbef90  the ragdoll driver's rebind to the scene graph               HYPOTHESIS name
//    78423  0xea7b20  the collector's wrapper (memory-context tag)                 HYPOTHESIS name
//    78507  0xeb4410  the skeleton walk over blend collision objects               HYPOTHESIS name
//    78536  0xeb5830  the ragdoll collector per body (ctx, bhkRigidBody*, ...)     HYPOTHESIS name; the fault site
//    68170  0xcc6d40  BSTArray buffer free                                         HYPOTHESIS name
//    78066  0xe91160  bhkRigidBody destructor body                                 HYPOTHESIS name
//    79805  0xef3a90  bhkRagdollConstraint destructor body                         HYPOTHESIS name
//    79806  0xef3ad0  bhkRagdollConstraint constructor                             HYPOTHESIS name
//    79807  0xef3ba0  bhkRagdollConstraint constructor                             HYPOTHESIS name
//    79810  0xef3e50  bhkRagdollConstraint constructor                             HYPOTHESIS name
//    77864  0xe87150  the detach visitor over a skeleton                           HYPOTHESIS name
//    77883  0xe87df0  the detach visitor's per-node callback                       HYPOTHESIS name
//    16129  0x236b60  InventoryChanges::InitLeveledItems                           the fork's FateHooks site
//   104651  0x143dc00 NativeFunctionBase::Call (names the Papyrus VM thread)       CommonLib (Offsets.h:130)
//   403449  0x31872c0 Main's singleton (a Main* static; threadID at +0x28)         CommonLib (Main.cpp:8, Main.h:87)
// Layouts by the headers: bhkRigidBody's constraints array at +0x28
// (bhkRigidBody.h:58, BSTArray<void*>), a BSTArray being its allocator first
// (data +0, capacity +8; BSTArray.h:140-141) then its base (size +0x10;
// BSTArray.h:47, :374-376), so data +0x28, size +0x38; TESObjectREFR's Get3D2
// is virtual slot 0x70 (TESObjectREFR.h:308); a form's id at +0x14
// (TESForm.h:354). Argument positions by the x64 convention.
//
// Params through globalThis.LAB_PARAMS (lab-api prepends them for a scenario's
// `frida {script: reroll-main-trace.js, params: {...}}` step; `just frida`
// carries none, so a hand run logs everything):
//   refs [formIds]   only re-rolls (37323) on these actors open a window; every
//                    other hook logs inside an open window (its own thread's or
//                    any, see below) and counts outside it (cap-bound)
//   cap (300)        each hook logs its first cap events outside a window
//   elements (16)    how many constraints-array elements the collector prints
// A window opens per thread at a re-roll's entry and closes at the next
// TESObjectREFR::Load3D leave on that thread, or after 10 s. The lifetime hooks
// and detachHavok log on ANY thread while a window is open anywhere (the race
// is cross-thread). A `summary` line every 5 s carries every hook's counts.
// Run: `c1: frida {script: reroll-main-trace.js, params: {refs: [0x1d219]}}`
// before a login into the Temple, or `just frida reroll-main-trace.js c1`.
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

// top-level names carry the prefix rm (a name matching a Frida global fails
// the load, lab/frida/npc-roll.js's note)
function rmIdSet(list) {
  const s = new Set();
  if (Array.isArray(list)) {
    for (const v of list)
      s.add((typeof v === "string" ? parseInt(v, 16) : v) >>> 0);
  }
  return s;
}
const rmRefs = rmIdSet(PARAMS.refs);
const rmCap = PARAMS.cap >>> 0 || 300;
const rmElements = PARAMS.elements >>> 0 || 16;
const rmSummaryMs = 5000;
const rmWindowMs = 10000;

// offsets by `just addr <id>` for 1.6.1170 on 2026-11-04 (never from memory, CLAUDE.md rule 1)
const OFFSETS = {
  "1.6.1170.0": {
    reroll: 0x665fc0, // 37323
    refrSet3D: 0x2e5380, // 19730
    shouldQueue: 0x6d1ee0, // 39033
    deferDetach: 0x655cd0, // 36933
    deferFollow: 0x655f40, // 36939
    queuePush: 0x6595d0, // 36993
    actorLoad3D: 0x65e9e0, // 37177
    refrLoad3D: 0x2e3970, // 19727
    actorSet3D: 0x65ebd0, // 37178
    detachHavok: 0x664540, // 37307
    postLoad: 0x2f69f0, // 20103
    setRootNodes: 0xba3b30, // 63357
    setRootNode: 0xbb3370, // 63596
    rebind: 0xbbef90, // 63792
    collectWrap: 0xea7b20, // 78423
    walk: 0xeb4410, // 78507
    collector: 0xeb5830, // 78536
    arrayFree: 0xcc6d40, // 68170
    rigidBodyDtor: 0xe91160, // 78066
    constraintDtor: 0xef3a90, // 79805
    constraintCtor1: 0xef3ad0, // 79806
    constraintCtor2: 0xef3ba0, // 79807
    constraintCtor3: 0xef3e50, // 79810
    detachVisit: 0xe87150, // 77864
    detachVisitNode: 0xe87df0, // 77883
    initLeveled: 0x236b60, // 16129
    vmCall: 0x143dc00, // 104651
    mainSingleton: 0x31872c0, // 403449 (data, not hooked)
  },
};
const rmIds = {
  reroll: 37323, refrSet3D: 19730, shouldQueue: 39033, deferDetach: 36933,
  deferFollow: 36939, queuePush: 36993, actorLoad3D: 37177, refrLoad3D: 19727,
  actorSet3D: 37178, detachHavok: 37307, postLoad: 20103, setRootNodes: 63357,
  setRootNode: 63596, rebind: 63792, collectWrap: 78423, walk: 78507,
  collector: 78536, arrayFree: 68170, rigidBodyDtor: 78066,
  constraintDtor: 79805, constraintCtor1: 79806, constraintCtor2: 79807,
  constraintCtor3: 79810, detachVisit: 77864, detachVisitNode: 77883,
  initLeveled: 16129, vmCall: 104651, mainSingleton: 403449,
};
// the lifetime and visitor hooks: logged on any thread while a window is open
const rmAnyThread = new Set([
  "arrayFree", "rigidBodyDtor", "constraintDtor", "constraintCtor1",
  "constraintCtor2", "constraintCtor3", "detachVisit", "detachVisitNode",
  "detachHavok", "queuePush", "deferDetach", "deferFollow",
]);
const rmKnownStarts = {
  "1.6.1170.0": [
    [0x236b60, "16129 InitLeveledItems"],
    [0x2e3970, "19727 TESObjectREFR::Load3D"],
    [0x2e5380, "19730 TESObjectREFR::Set3D"],
    [0x2f69f0, "20103 post-load setup"],
    [0x54bdf0, "32894 graph setup"],
    [0x6595d0, "36993 queue push"],
    [0x655cd0, "36933 deferred DetachHavok"],
    [0x655f40, "36939 deferred follow-up"],
    [0x65e9e0, "37177 Actor::Load3D"],
    [0x65ebd0, "37178 Actor::Set3D"],
    [0x664540, "37307 Actor::DetachHavok"],
    [0x665fc0, "37323 re-roll"],
    [0x6d1ee0, "39033 ShouldUseTaskQueue"],
    [0xba3b30, "63357 SetRootNodes"],
    [0xbb3370, "63596 SetRootNode"],
    [0xbbef90, "63792 ragdoll rebind"],
    [0xcc6d40, "68170 BSTArray free"],
    [0xe87150, "77864 detach visitor"],
    [0xe87df0, "77883 detach visitor node"],
    [0xe91160, "78066 bhkRigidBody dtor"],
    [0xea7b20, "78423 collector wrapper"],
    [0xeb4410, "78507 skeleton walk"],
    [0xeb5830, "78536 ragdoll collector"],
    [0xef3a90, "79805 bhkRagdollConstraint dtor"],
    [0xef3ad0, "79806 bhkRagdollConstraint ctor"],
    [0xef3ba0, "79807 bhkRagdollConstraint ctor"],
    [0xef3e50, "79810 bhkRagdollConstraint ctor"],
    [0x143dc00, "104651 NativeFunctionBase::Call"],
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
  try {
    return form.isNull() ? 0 : u32(form.add(0x14));
  } catch (e) {
    return 0;
  }
} // TESForm.h:354
function rmPtr(p) {
  return p && !p.isNull() ? p.toString() : "0x0";
}
function rmQword(p) {
  try {
    return p.isNull() ? "0x0" : p.readPointer().toString();
  } catch (e) {
    return "unreadable";
  }
}

const exe = Process.getModuleByName("SkyrimSE.exe");
const version = fileVersion(exe.path);
const at = OFFSETS[version];
if (at === undefined) {
  emit({ error: "no offsets for this runtime", version: version });
} else {
  const exeEnd = exe.base.add(exe.size);
  function rmInExe(p) {
    try {
      return !p.isNull() && p.compare(exe.base) >= 0 && p.compare(exeEnd) < 0;
    } catch (e) {
      return false;
    }
  }
  const rmKnown = rmKnownStarts[version].slice().sort(function (a, b) {
    return a[0] - b[0];
  });
  function rmNearest(off) {
    let best = null;
    for (const k of rmKnown) {
      if (k[0] <= off) best = k;
      else break;
    }
    return best;
  }
  function rmCaller(ret) {
    if (!ret || ret.isNull()) return { ret: "0x0" };
    const m = Process.findModuleByAddress(ret);
    if (!m) return { ret: ret.toString() };
    const off = ret.sub(m.base);
    const row = { ret: m.name + "+0x" + off.toString(16) };
    if (m.base.equals(exe.base)) {
      const best = rmNearest(off.toUInt32());
      if (best)
        row.near = best[1] + "+0x" + (off.toUInt32() - best[0]).toString(16);
    }
    return row;
  }
  // Main's thread id, read from the singleton (Main.cpp:8, Main.h:87)
  function rmMainThread() {
    try {
      const main = exe.base.add(at.mainSingleton).readPointer();
      return main.isNull() ? 0 : main.add(0x28).readU32();
    } catch (e) {
      return -1;
    }
  }
  // a reference's Get3D2 through its vtable's slot 0x70 (TESObjectREFR.h:308)
  function rmGet3D2(ref) {
    try {
      if (ref.isNull()) return "0x0";
      const fn = ref.readPointer().add(0x70 * 8).readPointer();
      const call = new NativeFunction(fn, "pointer", ["pointer"]);
      return call(ref).toString();
    } catch (e) {
      return "unreadable";
    }
  }

  let rmSeq = 0;
  const rmCounts = {};
  function rmCount(name) {
    if (!rmCounts[name]) rmCounts[name] = { n: 0, logged: 0, capped: 0 };
    return rmCounts[name];
  }
  // the re-roll windows open per thread (37323 entered on a listed actor)
  const rmWindows = new Map();
  function rmOwnWindow() {
    return rmWindows.get(Process.getCurrentThreadId());
  }
  function rmAnyWindow() {
    return rmWindows.size > 0;
  }
  function rmLog(name, row, force) {
    const c = rmCount(name);
    c.n++;
    const own = rmOwnWindow();
    const inWin = own !== undefined || (rmAnyThread.has(name) && rmAnyWindow());
    if (!force && !inWin && c.logged >= rmCap) {
      c.capped++;
      return;
    }
    c.logged++;
    row.hook = name;
    row.seq = ++rmSeq;
    row.tid = Process.getCurrentThreadId();
    row.inWindow = inWin;
    if (own !== undefined) row.windowForm = hex(own.form);
    row.windowsOpen = rmWindows.size;
    emit(row);
  }

  const attached = [];
  function rmAttach(name, cb) {
    try {
      Interceptor.attach(exe.base.add(at[name]), cb);
      attached.push(name);
    } catch (e) {
      emit({ hook: name, error: String(e) });
    }
  }
  function rmEnterLeave(name, fields) {
    rmAttach(name, {
      onEnter(args) {
        this.row = fields ? fields(args) : {};
        this.row.phase = "enter";
        Object.assign(this.row, rmCaller(this.returnAddress));
        rmLog(name, this.row, false);
      },
      onLeave(retval) {
        rmLog(name, { phase: "leave", ret0: retval.toString() }, false);
      },
    });
  }

  // the re-roll (37323): opens a window on its thread for a listed actor
  rmAttach("reroll", {
    onEnter(args) {
      const id = formId(args[0]);
      const listed = rmRefs.size === 0 || rmRefs.has(id >>> 0);
      if (listed) {
        rmWindows.set(Process.getCurrentThreadId(), { form: id, since: Date.now() });
      }
      const row = { phase: "enter", actor: hex(id), level: args[1].toInt32(), listed: listed, mainThread: rmMainThread() };
      Object.assign(row, rmCaller(this.returnAddress));
      rmLog("reroll", row, listed);
    },
    onLeave(retval) {
      rmLog("reroll", { phase: "leave", ret0: retval.toString() }, false);
    },
  });
  rmAttach("refrSet3D", {
    onEnter(args) {
      const row = { phase: "enter", ref: hex(formId(args[0])), node: rmPtr(args[1]), nullNode: args[1].isNull(), flag: args[2].toInt32() };
      Object.assign(row, rmCaller(this.returnAddress));
      rmLog("refrSet3D", row, false);
    },
  });
  rmAttach("shouldQueue", {
    onEnter(args) {
      this.row = rmCaller(this.returnAddress);
    },
    onLeave(retval) {
      const row = { phase: "leave", answer: retval.toInt32() };
      Object.assign(row, this.row);
      rmLog("shouldQueue", row, false);
    },
  });
  rmEnterLeave("deferDetach", function (args) {
    return { a0: rmPtr(args[0]), a1: rmPtr(args[1]), a2: rmPtr(args[2]) };
  });
  rmEnterLeave("deferFollow", function (args) {
    return { a0: rmPtr(args[0]), a1: rmPtr(args[1]), a2: rmPtr(args[2]) };
  });
  rmAttach("queuePush", {
    onEnter(args) {
      const row = { phase: "enter", queue: rmPtr(args[0]), task: rmPtr(args[1]), taskQword0: rmQword(args[1]), taskQword1: rmQword(args[1].isNull() ? args[1] : args[1].add(8)) };
      Object.assign(row, rmCaller(this.returnAddress));
      rmLog("queuePush", row, false);
    },
  });
  rmEnterLeave("actorLoad3D", function (args) {
    return { actor: hex(formId(args[0])), flag: args[1].toInt32() };
  });
  rmAttach("refrLoad3D", {
    onEnter(args) {
      const row = { phase: "enter", ref: hex(formId(args[0])), flag: args[1].toInt32(), mainThread: rmMainThread() };
      Object.assign(row, rmCaller(this.returnAddress));
      rmLog("refrLoad3D", row, false);
    },
    onLeave(retval) {
      const tid = Process.getCurrentThreadId();
      const own = rmWindows.get(tid);
      rmLog("refrLoad3D", { phase: "leave", ret0: retval.toString(), closesWindow: own !== undefined }, own !== undefined);
      if (own !== undefined) rmWindows.delete(tid);
    },
  });
  rmEnterLeave("actorSet3D", function (args) {
    return { actor: hex(formId(args[0])), node: rmPtr(args[1]), nullNode: args[1].isNull(), flag: args[2].toInt32() };
  });
  // the deferred detach's drain: on Main's thread with a non-null Get3D2 while
  // a re-roll window is open elsewhere is the race's witness
  rmAttach("detachHavok", {
    onEnter(args) {
      const tid = Process.getCurrentThreadId();
      const main = rmMainThread();
      const row = { phase: "enter", actor: hex(formId(args[0])), nodeArg: rmPtr(args[1]), get3D2: rmGet3D2(args[0]), mainThread: main, onMain: tid === main, race: tid === main && rmAnyWindow() };
      Object.assign(row, rmCaller(this.returnAddress));
      rmLog("detachHavok", row, row.race);
    },
    onLeave(retval) {
      rmLog("detachHavok", { phase: "leave" }, false);
    },
  });
  rmEnterLeave("postLoad", function (args) {
    return { ref: hex(formId(args[0])) };
  });
  rmEnterLeave("setRootNodes", function (args) {
    return { manager: rmPtr(args[0]), a1: rmPtr(args[1]) };
  });
  rmEnterLeave("setRootNode", function (args) {
    return { graph: rmPtr(args[0]), root: rmPtr(args[1]) };
  });
  rmEnterLeave("rebind", function (args) {
    return { a0: rmPtr(args[0]), a1: rmPtr(args[1]), a2: rmPtr(args[2]) };
  });
  rmEnterLeave("collectWrap", function (args) {
    return { a0: rmPtr(args[0]), a1: rmPtr(args[1]) };
  });
  rmEnterLeave("walk", function (args) {
    return { ctx: rmPtr(args[0]), node: rmPtr(args[1]) };
  });
  // the collector (78536): the body's constraints array printed, never
  // dereferenced past one qword; an element inside the exe image is the dump's
  // shape (a recycled block whose first qword is a vtable)
  rmAttach("collector", {
    onEnter(args) {
      const body = args[1];
      const row = { phase: "enter", ctx: rmPtr(args[0]), body: rmPtr(body) };
      let inExe = false;
      try {
        if (!body.isNull()) {
          const data = body.add(0x28).readPointer();
          const size = body.add(0x38).readU32();
          row.data = data.toString();
          row.size = size;
          const els = [];
          for (let i = 0; i < size && i < rmElements; i++) {
            let el = NULL;
            try {
              el = data.add(i * 8).readPointer();
            } catch (e) {
              els.push({ i: i, error: "unreadable slot" });
              continue;
            }
            const e = { i: i, el: el.toString(), elInExe: rmInExe(el) };
            if (!el.isNull() && !e.elInExe) {
              const q = rmQword(el);
              e.first = q;
              e.firstInExe = q !== "unreadable" && rmInExe(ptr(q));
            }
            if (e.elInExe) inExe = true;
            els.push(e);
          }
          row.elements = els;
        }
      } catch (e) {
        row.error = String(e);
      }
      row.faultShape = inExe;
      Object.assign(row, rmCaller(this.returnAddress));
      rmLog("collector", row, inExe);
    },
    onLeave(retval) {
      rmLog("collector", { phase: "leave" }, false);
    },
  });
  // the lifetime ring: any thread while a window is open anywhere
  rmEnterLeave("arrayFree", function (args) {
    return { header: rmPtr(args[0]), headerQword0: rmQword(args[0]), a1: rmPtr(args[1]) };
  });
  rmEnterLeave("rigidBodyDtor", function (args) {
    return { body: rmPtr(args[0]) };
  });
  rmEnterLeave("constraintDtor", function (args) {
    return { self: rmPtr(args[0]) };
  });
  rmEnterLeave("constraintCtor1", function (args) {
    return { self: rmPtr(args[0]) };
  });
  rmEnterLeave("constraintCtor2", function (args) {
    return { self: rmPtr(args[0]) };
  });
  rmEnterLeave("constraintCtor3", function (args) {
    return { self: rmPtr(args[0]) };
  });
  rmEnterLeave("detachVisit", function (args) {
    return { node: rmPtr(args[0]), a1: rmPtr(args[1]), a2: rmPtr(args[2]) };
  });
  rmEnterLeave("detachVisitNode", function (args) {
    return { node: rmPtr(args[0]), a1: rmPtr(args[1]) };
  });
  rmEnterLeave("initLeveled", function (args) {
    return { changes: rmPtr(args[0]), a1: rmPtr(args[1]) };
  });
  // the Papyrus VM thread named once per thread (104651 is hot: counted, logged once per tid)
  const rmVmThreads = new Set();
  rmAttach("vmCall", {
    onEnter(args) {
      const tid = Process.getCurrentThreadId();
      rmCount("vmCall").n++;
      if (rmVmThreads.has(tid)) return;
      rmVmThreads.add(tid);
      emit({ hook: "vmCall", phase: "firstOnThread", tid: tid, seq: ++rmSeq, mainThread: rmMainThread() });
    },
  });

  emit({
    ready: true,
    script: "reroll-main-trace.js",
    version: version,
    base: exe.base.toString(),
    hooks: attached,
    ids: rmIds,
    refs: Array.from(rmRefs).map(hex),
    cap: rmCap,
    elements: rmElements,
    mainThread: rmMainThread(),
  });
  setInterval(function () {
    const now = Date.now();
    rmWindows.forEach(function (w, tid) {
      if (now - w.since > rmWindowMs) {
        emit({ hook: "window", phase: "expired", tid: tid, form: hex(w.form), seq: ++rmSeq });
        rmWindows.delete(tid);
      }
    });
    emit({ summary: true, counts: rmCounts, windowsOpen: rmWindows.size, vmThreads: Array.from(rmVmThreads), mainThread: rmMainThread() });
  }, rmSummaryMs);
}
