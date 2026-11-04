// arrows-apply-trace.js: a change-form record's attached-arrows block against
// the copy's own arrows under the apply, for docs/verbs/change-form.md READ 8
// (x-fate-dress-bleak v8 20261104-183635: c2 crashed at SkyrimSE.exe+0x184FBF
// applying the record of a body with arrows in it, the fix f4014f39 on
// m3-canon-4-followups). The hypothesis under test, the re-analyst's static
// read: ExtraDataList::LoadGame (12095) marks at its start every extra type
// the copy holds whose mask meets the record's flags and fetches a marked one
// later with GetByType (12329); the leveled-creature block (0x2D) calls
// Set3D(nullptr) (Actor::Set3D, 37178) while kLoading is clear, which removes
// the copy's own attached arrows (RemoveByType 11577, type 0x98); the arrows
// block's loader (12782) then takes a null. Six hooks, one JSON line per event
// (hook, phase, seq, tid, the fields below, ret with near), aligned on the
// `ready` line. Expected on a build before f4014f39, during one apply of a
// record with arrows onto a copy with arrows: apply enter (35568) for the
// form, loadGame enter (12095), set3D with a null node (37178), removeByType
// with type 0x98 (11577) inside it, getByType 0x98 leaving null (12329), the
// arrows loader entered with a null extra (12782) and the crash. Expected on
// f4014f39: removeByType 0x98 BEFORE the apply enter (the fork's own call,
// near the platform's code), no getByType 0x98 null inside the apply, the
// loader entered with a real extra, the apply leaving. Falsifiers: the loader
// entered with null while no 11577(0x98) fired inside the apply; a crash
// elsewhere with the loader never entered.
//
// Address Library 1.6.1170 ids; every offset by `just addr <id>` (lab/addr.py
// over addrlib/, runtime 1.6.1170.0, 428461 entries) on 2026-11-04. Names are
// the re-analyst's static read (HYPOTHESIS) or CommonLibSSE-NG's:
//    35568  0x603700  the change-form apply (the loader of one record)          the fork's own entry (ChangeForm.cpp)
//    12095  0x170380  ExtraDataList::LoadGame (this, buf, ...)                   HYPOTHESIS name
//    37178  0x65ebd0  Actor::Set3D (this, NiAVObject* node, bool)                 CommonLib (TESObjectREFR.h vfunc 0x6C)
//    11577  0x151a90  BaseExtraList::RemoveByType (this, type)                     HYPOTHESIS name
//    12329  0x179250  BaseExtraList::GetByType (this, type)                        HYPOTHESIS name
//    12782  0x184f40  ExtraAttachedArrows3D's loader (extra, buf)                  HYPOTHESIS name
// Argument positions by the x64 convention (rcx, rdx, r8, r9): the list or
// actor in rcx, the type byte or node in rdx. Extra data types: 0x98
// kAttachedArrows3D, 0x2D kLeveledCreature (E/ExtraDataTypes.h:326, :219).
//
// Params through globalThis.LAB_PARAMS (lab-api prepends them for a scenario's
// `frida {script: arrows-apply-trace.js, params: {...}}` step; `just frida`
// carries none, so a hand run logs everything):
//   refs [formIds]   only applies (35568) on these forms open a window; every
//                    other hook logs inside an open window on its thread and
//                    counts outside it (cap-bound)
//   cap (300)        each hook logs its first cap events outside a window
// A `summary` line every 5 s carries every hook's counts. Both send and
// console.log carry every line. Run: `c2: frida {script: arrows-apply-trace.js,
// params: {refs: [0x39fe4]}}` before the kill (lab/.cache/probes/
// x-corpse-arrows.yaml), or `just frida arrows-apply-trace.js c2` by hand.
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

// top-level names carry the prefix aa (a name matching a Frida global fails
// the load, lab/frida/npc-roll.js's note)
function aaIdSet(list) {
  const s = new Set();
  if (Array.isArray(list)) {
    for (const v of list)
      s.add((typeof v === "string" ? parseInt(v, 16) : v) >>> 0);
  }
  return s;
}
const aaRefs = aaIdSet(PARAMS.refs);
const aaCap = PARAMS.cap >>> 0 || 300;
const aaSummaryMs = 5000;

// offsets by `just addr <id>` for 1.6.1170 on 2026-11-04 (never from memory, CLAUDE.md rule 1)
const OFFSETS = {
  "1.6.1170.0": {
    apply: 0x603700, // 35568
    loadGame: 0x170380, // 12095
    set3D: 0x65ebd0, // 37178
    removeByType: 0x151a90, // 11577
    getByType: 0x179250, // 12329
    arrowsLoader: 0x184f40, // 12782
  },
};
const aaIds = {
  apply: 35568,
  loadGame: 12095,
  set3D: 37178,
  removeByType: 11577,
  getByType: 12329,
  arrowsLoader: 12782,
};
const aaKnownStarts = {
  "1.6.1170.0": [
    [0x151a90, "11577 RemoveByType"],
    [0x170380, "12095 ExtraDataList::LoadGame"],
    [0x179250, "12329 GetByType"],
    [0x184f40, "12782 attached-arrows loader"],
    [0x2d8a60, "19529 TESObjectREFR::LoadGame (unresolved here, label only)"],
    [0x603700, "35568 change-form apply"],
    [0x65ebd0, "37178 Actor::Set3D"],
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
function aaByte(a) {
  return a.toInt32() & 0xff;
}
function aaPtrKey(p) {
  return p && !p.isNull() ? p.toString() : "0x0";
}

const exe = Process.getModuleByName("SkyrimSE.exe");
const version = fileVersion(exe.path);
const at = OFFSETS[version];
if (at === undefined) {
  emit({ error: "no offsets for this runtime", version: version });
} else {
  const aaKnown = aaKnownStarts[version].slice().sort(function (a, b) {
    return a[0] - b[0];
  });
  function aaNearest(off) {
    let best = null;
    for (const k of aaKnown) {
      if (k[0] <= off) best = k;
      else break;
    }
    return best;
  }
  function aaCaller(ret) {
    if (!ret || ret.isNull()) return { ret: "0x0" };
    const m = Process.findModuleByAddress(ret);
    if (!m) return { ret: ret.toString() };
    const off = ret.sub(m.base);
    const row = { ret: m.name + "+0x" + off.toString(16) };
    if (m.base.equals(exe.base)) {
      const best = aaNearest(off.toUInt32());
      if (best)
        row.near = best[1] + "+0x" + (off.toUInt32() - best[0]).toString(16);
    }
    return row;
  }

  let aaSeq = 0;
  const aaCounts = {};
  function aaCount(name) {
    if (!aaCounts[name]) aaCounts[name] = { n: 0, logged: 0, capped: 0 };
    return aaCounts[name];
  }
  // the apply windows open per thread (35568 entered on a listed form)
  const aaWindow = new Map();
  function aaInWindow() {
    return aaWindow.has(Process.getCurrentThreadId());
  }
  function aaLog(name, row, force) {
    const c = aaCount(name);
    c.n++;
    const inWin = aaInWindow();
    if (!force && !inWin && c.logged >= aaCap) {
      c.capped++;
      return;
    }
    c.logged++;
    row.hook = name;
    row.seq = ++aaSeq;
    row.tid = Process.getCurrentThreadId();
    row.inApply = inWin;
    emit(row);
  }

  const attached = [];
  function aaAttach(name, cb) {
    try {
      Interceptor.attach(exe.base.add(at[name]), cb);
      attached.push(name);
    } catch (e) {
      emit({ hook: name, error: String(e) });
    }
  }

  // the apply (35568): the fork's own entry; its first argument is the save-load
  // game, the form is the fork's own log's; a window opens for every call when
  // no refs are listed, else for calls whose second argument reads as a listed form
  aaAttach("apply", {
    onEnter(args) {
      let id = 0;
      try {
        id = formId(args[1]);
      } catch (e) {
        id = 0;
      }
      const admit = aaRefs.size === 0 || aaRefs.has(id >>> 0);
      this.opened = admit;
      if (admit) aaWindow.set(Process.getCurrentThreadId(), id);
      aaLog(
        "apply",
        Object.assign(
          { phase: "enter", a0: aaPtrKey(args[0]), a1: aaPtrKey(args[1]), form: hex(id), admitted: admit },
          aaCaller(this.returnAddress),
        ),
        admit,
      );
    },
    onLeave(retval) {
      aaLog("apply", { phase: "leave", ret: retval.toString() }, this.opened === true);
      if (this.opened) aaWindow.delete(Process.getCurrentThreadId());
    },
  });
  aaAttach("loadGame", {
    onEnter(args) {
      aaLog(
        "loadGame",
        Object.assign({ phase: "enter", list: aaPtrKey(args[0]), buf: aaPtrKey(args[1]) }, aaCaller(this.returnAddress)),
        false,
      );
    },
    onLeave() {
      aaLog("loadGame", { phase: "leave" }, false);
    },
  });
  aaAttach("set3D", {
    onEnter(args) {
      const node = args[1];
      aaLog(
        "set3D",
        Object.assign(
          { phase: "enter", actor: hex(formId(args[0])), node: aaPtrKey(node), nullNode: node.isNull() },
          aaCaller(this.returnAddress),
        ),
        node.isNull() && aaInWindow(),
      );
    },
  });
  aaAttach("removeByType", {
    onEnter(args) {
      const type = aaByte(args[1]);
      const arrows = type === 0x98;
      aaLog(
        "removeByType",
        Object.assign({ phase: "enter", list: aaPtrKey(args[0]), type: hex(type), arrows: arrows }, aaCaller(this.returnAddress)),
        arrows,
      );
    },
  });
  aaAttach("getByType", {
    onEnter(args) {
      this.type = aaByte(args[1]);
      this.list = aaPtrKey(args[0]);
    },
    onLeave(retval) {
      const arrows = this.type === 0x98;
      if (!arrows && !aaInWindow()) {
        aaCount("getByType").n++;
        return;
      }
      aaLog(
        "getByType",
        { phase: "leave", list: this.list, type: hex(this.type), arrows: arrows, found: !retval.isNull(), ret0: retval.toString() },
        arrows,
      );
    },
  });
  aaAttach("arrowsLoader", {
    onEnter(args) {
      aaLog(
        "arrowsLoader",
        Object.assign(
          { phase: "enter", extra: aaPtrKey(args[0]), nullExtra: args[0].isNull(), buf: aaPtrKey(args[1]) },
          aaCaller(this.returnAddress),
        ),
        true,
      );
    },
    onLeave() {
      aaLog("arrowsLoader", { phase: "leave" }, true);
    },
  });

  emit({
    ready: true,
    script: "arrows-apply-trace.js",
    version: version,
    base: exe.base.toString(),
    hooks: attached,
    ids: aaIds,
    refs: Array.from(aaRefs).map(hex),
    cap: aaCap,
  });
  setInterval(function () {
    emit({ summary: true, counts: aaCounts, windows: aaWindow.size });
  }, aaSummaryMs);
}
