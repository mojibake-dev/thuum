// rock-motion-trace.js v1.1 DRAFT (thuum-cf, 2026-11-05, its fresh review's notes as written): PlayAnimation_Impl hooked
// beside 38048 for the platform's 'break' as a NiControllerManager sequence; the poll window reopened by every
// non-Keyframed set; the body re-read on every poll; an onLeave only on a hook whose handler reads the call's result;
// the impulse's path read from rows, not counts; bhkNiCollisionObject's body cited at :56. v1 follows.
// rock-motion-trace.js v1 DRAFT (thuum-cf, 2026-11-05; for lab/frida/ after its fresh review, ADR-064 amendment A):
// every motion change and impulse on Embershard's seven falling rocks on the seat whose wire fires, as the engine's
// own functions receive them, beside each body's Havok state, so x-trap-rock-hang v1 reads which hypothesis holds for
// a rock that stays at its hanging height (thuum docs/verbs/traps.md, rock 0xb6d4d; runs 20261105-153200, -210948).
// Every id by `just addr` (lab/addr.py, Address Library 1.6.1170) on 2026-11-05; every offset from CommonLibSSE-NG
// b93280e8 with its file:line; each is a HYPOTHESIS until this trace prints its ready row and the OnLoad rows (rule 2).
//   77866 (0xe87270) NiAVObject::SetMotionType(this, motionType, arg2, arg3, allowActivate) (include/RE/Offsets.h:398,
//     src/RE/N/NiAVObject.cpp:173; TESObjectREFR::SetMotionType calls it on Get3D(), src/RE/T/TESObjectREFR.cpp:879-890):
//     RCX the node, EDX the motion type, R8B, R9B, [RSP+0x28] allowActivate; the node's owner at +0xF8 (NiAVObject.h:163),
//     walking +0x30 parent (NiAVObject.h:153) when it is null.
//   78091 (0xe93380) bhkRigidBody::SetLinearImpulse(this, const hkVector4&) (src/RE/B/bhkRigidBody.cpp:19-24): RCX the
//     bhkRigidBody, RDX four floats. HYPOTHESIS: ApplyHavokImpulse's functor reaches it, read from a linearImpulse row
//     whose functor is 'impulseFunctor' (a liveness count is the whole game's total before the filter, so no count says
//     it); the body poll still reads the impulse's effect.
//   218360 (0x1929a80) SkyrimScript::SetMotionTypeFunctor's vtable (include/RE/Offsets_VTABLE.h:4612) and 218347
//     (0x1929018) ApplyHavokImpulseFunctor's (Offsets_VTABLE.h:4606): slot 0x01, DelayFunctor::operator() (include/RE/D/
//     DelayFunctor.h:35), the latent native's work on the main thread; RCX the functor (a by-value return rides RDX);
//     stackID +0x0C (DelayFunctor.h:43); SetMotionTypeFunctor's objectToChange +0x10, type +0x14, allowActivate +0x20
//     (SetMotionTypeFunctor.h:31, :32, :34): the arguments as the native's body read them, after the seam's neutral write
//     if any (ScriptNatives.cpp Neutralize). ApplyHavokImpulseFunctor has no CommonLib layout: its words +0x10..+0x2C are
//     printed raw as u32 and f32 (HYPOTHESIS: the handle, the direction and the magnitude 15).
//   38048 (0x6a35f0) the platform's SendAnimation target (skyrim-platform game/Offsets.h:43-44; pillar-anim-trace.js):
//     RCX the IAnimationGraphManagerHolder 0x38 into its TESObjectREFR (include/RE/T/TESObjectREFR.h:112), RDX the event
//     name (a BSFixedString's char*): the rigged platform 0xb6d47's 'break' (TrapRiggedRockfall[Idle].onActivate #2).
//   14297 (0x1d50a0) TESObjectREFR::PlayAnimation_Impl (include/RE/Offsets.h:546; pillar-anim-trace.js): RCX the
//     reference, RDX its NiControllerManager, R8 the sequence to, R9 the sequence from (a sequence's name at
//     NiControllerSequence+0x10, include/RE/N/NiControllerSequence.h:87): the same 'break' if the platform plays it as a
//     NiControllerManager sequence, which 38048 never sees.
// The body, from a reference: loadedData +0x68 (TESObjectREFR.h:497), data3D +0x68 (TESObjectREFR.h:101), the root's
// collisionObject +0x40 (NiAVObject.h:156) or a child's (NiNode children +0x110, NiNode.h:76; NiTArray _data +0x08,
// _size +0x14, NiTArray.h:116, :119), bhkNiCollisionObject body +0x20 (bhkNiCollisionObject.h:56), referencedObject
// +0x10 (bhkRefObject.h:26): the hkpRigidBody. Its simulationIsland +0x130 and motion +0x150 (hkpEntity.h:92, :99); the
// motion's type +0x10, deactivationIntegrateCounter +0x11, deactivationNumInactiveFrames +0x12 (two u16), linearVelocity
// +0xE0 (hkpMotion.h:77, :78, :79, :84; types 1 dynamic, 2 sphere, 3 box, 4 keyframed, 5 fixed, 6 thin box, hkpMotion.h:
// 26-35; sleep at 5 frames, :23); the island's byte +0x32, isInActiveIslandsArray bits 0-1, activeMark 2-3
// (hkpSimulationIsland.h:41-42). A keyframed motion drops a linear impulse (hkpKeyframedRigidMotion.h:27, "{ return; }").
// The node's world translate: world +0x7C (NiAVObject.h:158), translate +0x24 (NiTransform.h:26).
// Rows (t is this seat's Date.now(), the clock its console log stamps): {ready} once; {fn:'motionFunctor'|'impulseFunctor'}
// per functor run; {fn:'setMotionType', before, after} and {fn:'linearImpulse', motion, v0, v1} per call on a watched
// rock; {fn:'graphEvent'} and {fn:'playAnimation'} for the platform, the dust and the wire; {fn:'body'} for POLL_FOR_MS
// past each non-Keyframed set, every POLL_MS, on change and every 250 ms, the body re-read from its reference each poll;
// {fn:'liveness', counts} every 10 s; {fn, err} once per failing hook.
// Params: WATCH (hex ids), POLL_MS (50), POLL_FOR_MS (8000). 1.6.1170 only. Run on the firing seat before its cell loads.
const PARAMS = typeof LAB_PARAMS === "object" && LAB_PARAMS ? LAB_PARAMS : {};
const ROCKS = (
  PARAMS.WATCH || [
    "b6d45",
    "b6d48",
    "b6d49",
    "b6d4a",
    "b6d4b",
    "b6d4c",
    "b6d4d",
  ]
).map(function (s) {
  return parseInt(s, 16);
});
const GRAPH = [0xb6d47, 0xb6d40, 0xb6d3f]; // the rigged platform, the dust, the wire (lab/esm.py ref, 2026-11-05)
const POLL_MS = PARAMS.POLL_MS === undefined ? 50 : Number(PARAMS.POLL_MS);
const POLL_FOR_MS =
  PARAMS.POLL_FOR_MS === undefined ? 8000 : Number(PARAMS.POLL_FOR_MS);
const OFFSETS = {
  "1.6.1170.0": {
    setMotionType: 0xe87270, // just addr 77866
    setLinearImpulse: 0xe93380, // just addr 78091
    motionFunctorVtable: 0x1929a80, // just addr 218360
    impulseFunctorVtable: 0x1929018, // just addr 218347
    sendAnimation: 0x6a35f0, // just addr 38048
    playAnimation: 0x1d50a0, // just addr 14297: TESObjectREFR::PlayAnimation_Impl (CommonLibSSE-NG Offsets.h:546)
  },
};
const FORM_ID = 0x14; // TESForm.h:354
const SEQUENCE_NAME = 0x10; // include/RE/N/NiControllerSequence.h:87
const NODE = {
  parent: 0x30,
  collision: 0x40,
  worldTranslate: 0x7c + 0x24,
  owner: 0xf8,
  children: 0x110,
};
const REFR = { loadedData: 0x68, holder: 0x38 };
const LOADED_3D = 0x68;
const ENTITY = { island: 0x130, motion: 0x150 };
const MOTION = { type: 0x10, counter: 0x11, frames: 0x12, v: 0xe0 };

function emit(row) {
  row.t = Date.now();
  send(row);
  console.log(JSON.stringify(row));
}
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
  return (n >>> 0).toString(16);
}
function readable(p) {
  if (p === null || p.isNull()) return false;
  const r = Process.findRangeByAddress(p);
  return r !== null && r.protection.indexOf("r") === 0;
}
function ptrAt(p, off) {
  const q = p.add(off);
  return readable(q) ? q.readPointer() : NULL;
}
const failed = {};
function fail(fn, e) {
  if (!failed[fn]) {
    failed[fn] = true;
    emit({ fn: fn, err: String(e) });
  }
}

// a node's owning reference: its own +0xF8, else a parent's (four levels)
function ownerOf(node) {
  let n = node;
  for (let i = 0; i < 5 && readable(n); i++) {
    const r = ptrAt(n, NODE.owner);
    if (readable(r)) return r;
    n = ptrAt(n, NODE.parent);
  }
  return NULL;
}
function idOf(refr) {
  try {
    return readable(refr) ? refr.add(FORM_ID).readU32() : 0;
  } catch (e) {
    return 0;
  }
}
// the hkpRigidBody under a node: its collision object's body's referencedObject, else a child's (one level)
function bodyOfNode(node) {
  const direct = function (n) {
    const co = ptrAt(n, NODE.collision);
    if (!readable(co)) return NULL;
    const bhk = ptrAt(co, 0x20);
    if (!readable(bhk)) return NULL;
    const hkp = ptrAt(bhk, 0x10);
    return readable(hkp) ? { bhk: bhk, hkp: hkp } : NULL;
  };
  const b = direct(node);
  if (b !== NULL) return b;
  try {
    const data = ptrAt(node, NODE.children + 0x08);
    const count = readable(node.add(NODE.children + 0x14))
      ? node.add(NODE.children + 0x14).readU16()
      : 0;
    for (let i = 0; i < count && i < 16 && readable(data); i++) {
      const child = ptrAt(data, i * 8);
      if (readable(child)) {
        const c = direct(child);
        if (c !== NULL) return c;
      }
    }
  } catch (e) {
    fail("children", e);
  }
  return NULL;
}
function bodyOfRefr(refr) {
  const loaded = ptrAt(refr, REFR.loadedData);
  if (!readable(loaded)) return NULL;
  const root = ptrAt(loaded, LOADED_3D);
  return readable(root) ? { root: root, body: bodyOfNode(root) } : NULL;
}
function sequenceName(seq) {
  if (!readable(seq)) return null;
  try {
    const s = seq.add(SEQUENCE_NAME).readPointer();
    return readable(s) ? s.readUtf8String() : null;
  } catch (e) {
    return null;
  }
}
function f3(p) {
  return [0, 4, 8].map(function (o) {
    return +p.add(o).readFloat().toFixed(3);
  });
}
function state(body, root) {
  if (body === NULL) return null;
  try {
    const m = body.hkp.add(ENTITY.motion);
    const island = ptrAt(body.hkp, ENTITY.island);
    const flags = readable(island) ? island.add(0x32).readU8() : null;
    const v = f3(m.add(MOTION.v));
    return {
      type: m.add(MOTION.type).readU8(),
      counter: m.add(MOTION.counter).readU8(),
      frames: [
        m.add(MOTION.frames).readU16(),
        m.add(MOTION.frames + 2).readU16(),
      ],
      v: v,
      speed: +Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]).toFixed(3),
      island:
        flags === null
          ? null
          : { inActive: flags & 3, activeMark: (flags >> 2) & 3 },
      pos: readable(root) ? f3(root.add(NODE.worldTranslate)) : null,
    };
  } catch (e) {
    fail("state", e);
    return null;
  }
}

const exe = Process.getModuleByName("SkyrimSE.exe");
const version = fileVersion(exe.path);
const at = OFFSETS[version];
const watched = {}; // form id -> { refr, root, body }
const byBhk = {}; // bhkRigidBody address -> form id
const inFunctor = {}; // thread id -> { kind, stack }
let seq = 0;
let pollUntil = 0;
if (at === undefined) {
  emit({ error: "no offsets for this runtime", version: version });
} else {
  const counts = { sleep: 0 };
  const resolved = {};
  let hooks = 0;
  const attach = function (name, target, callbacks) {
    counts[name] = 0;
    try {
      resolved[name] = {
        at: target.toString(),
        bytes: readable(target)
          ? Array.from(new Uint8Array(target.readByteArray(8)))
              .map(function (b) {
                return ("0" + b.toString(16)).slice(-2);
              })
              .join(" ")
          : "unreadable",
      };
      const hook = {
        onEnter: function (args) {
          counts[name]++;
          if (callbacks.onEnter) callbacks.onEnter.call(this, args);
        },
      };
      // an onLeave costs every call a return trampoline: only a hook whose handler reads the call's result (its return,
      // or the body it left) gets one, as lamp-shot-trace.js v1.1; 38048 and 14297 get none
      if (callbacks.onLeave) {
        hook.onLeave = function (ret) {
          callbacks.onLeave.call(this, ret);
        };
      }
      Interceptor.attach(target, hook);
      hooks++;
    } catch (e) {
      fail("attach:" + name, e);
    }
  };
  try {
    const sleep =
      Process.getModuleByName("kernel32.dll").getExportByName("Sleep");
    Interceptor.attach(sleep, {
      onEnter: function () {
        counts.sleep++;
      },
    });
  } catch (e) {
    fail("attach:sleep", e);
  }
  const track = function (refr) {
    const id = idOf(refr);
    if (ROCKS.indexOf(id) < 0) return 0;
    const b = bodyOfRefr(refr);
    watched[id] = {
      refr: refr,
      root: b === NULL ? NULL : b.root,
      body: b === NULL ? NULL : b.body,
    };
    if (b !== NULL && b.body !== NULL) byBhk[b.body.bhk.toString()] = id;
    return id;
  };
  // the two functors: each run marks its thread, so the nested engine call is attributed to the native's own call
  [
    ["motionFunctor", at.motionFunctorVtable],
    ["impulseFunctor", at.impulseFunctorVtable],
  ].forEach(function (pair) {
    const name = pair[0];
    let target = NULL;
    try {
      target = exe.base.add(pair[1]).add(0x08).readPointer();
    } catch (e) {
      fail("vtable:" + name, e);
      return;
    }
    attach(name, target, {
      onEnter: function (args) {
        const f = args[0];
        const tid = Process.getCurrentThreadId();
        try {
          const row = {
            fn: name,
            seq: ++seq,
            tid: tid,
            stack: f.add(0x0c).readU32(),
            handle: hex(f.add(0x10).readU32()),
          };
          if (name === "motionFunctor") {
            row.type = f.add(0x14).readU32();
            row.allowActivate = f.add(0x20).readU8();
          } else {
            row.raw = [];
            row.f = [];
            for (let o = 0x10; o < 0x30; o += 4) {
              row.raw.push(hex(f.add(o).readU32()));
              row.f.push(+f.add(o).readFloat().toFixed(4));
            }
          }
          this.row = row;
          inFunctor[tid] = { kind: name, stack: row.stack, seq: row.seq };
        } catch (e) {
          fail(name, e);
        }
      },
      onLeave: function () {
        const tid = Process.getCurrentThreadId();
        const mark = inFunctor[tid];
        delete inFunctor[tid];
        // a motion functor is printed when its nested engine call named a watched rock; an impulse functor always (rare:
        // a script's ApplyHavokImpulse), so a run whose impulse reaches no hooked function still shows its words
        if (!this.row) return;
        if (mark && mark.rock) this.row.rock = mark.rock;
        if (this.row.rock || name === 'impulseFunctor') emit(this.row);
      },
    });
  });
  attach("setMotionType", exe.base.add(at.setMotionType), {
    onEnter: function (args) {
      try {
        const refr = ownerOf(args[0]);
        const id = track(refr);
        if (id === 0) return;
        const tid = Process.getCurrentThreadId();
        const w = watched[id];
        const mark = inFunctor[tid] || null;
        this.rock = id;
        this.row = {
          fn: "setMotionType",
          seq: ++seq,
          tid: tid,
          refr: hex(id),
          node: args[0].toString(),
          type: args[1].toInt32() & 0xff,
          arg2: args[2].toInt32() & 0xff,
          arg3: args[3].toInt32() & 0xff,
          allowActivate: this.context.rsp.add(0x28).readU8(),
          functor: mark ? mark.kind : null,
          stack: mark ? mark.stack : null,
          before: state(w.body, w.root),
        };
        if (mark) mark.rock = hex(id);
      } catch (e) {
        fail("setMotionType", e);
      }
    },
    onLeave: function (ret) {
      if (!this.rock) return;
      const w = watched[this.rock];
      // the body may be rebuilt by the change: read it afresh
      const b = bodyOfRefr(w.refr);
      if (b !== NULL) {
        w.root = b.root;
        w.body = b.body;
        if (b.body !== NULL) byBhk[b.body.bhk.toString()] = this.rock;
      }
      this.row.ret = ret.toInt32() & 0xff;
      this.row.after = state(w.body, w.root);
      emit(this.row);
      if (this.row.type !== 4) pollUntil = Math.max(pollUntil, Date.now() + POLL_FOR_MS);
    },
  });
  attach("setLinearImpulse", exe.base.add(at.setLinearImpulse), {
    onEnter: function (args) {
      try {
        const id = byBhk[args[0].toString()];
        if (id === undefined) return;
        const tid = Process.getCurrentThreadId();
        const mark = inFunctor[tid] || null;
        const w = watched[id];
        this.rock = id;
        this.row = {
          fn: "linearImpulse",
          seq: ++seq,
          tid: tid,
          refr: hex(id),
          impulse: [0, 4, 8, 12].map(function (o) {
            return +args[1].add(o).readFloat().toFixed(4);
          }),
          functor: mark ? mark.kind : null,
          stack: mark ? mark.stack : null,
          motion: state(w.body, w.root),
        };
        if (mark) mark.rock = hex(id);
      } catch (e) {
        fail("setLinearImpulse", e);
      }
    },
    onLeave: function () {
      if (!this.rock) return;
      const w = watched[this.rock];
      const s = state(w.body, w.root);
      this.row.v1 = s ? s.v : null;
      emit(this.row);
    },
  });
  attach("sendAnimation", exe.base.add(at.sendAnimation), {
    onEnter: function (args) {
      try {
        const refr = args[0].sub(REFR.holder);
        const id = idOf(refr);
        if (GRAPH.indexOf(id) < 0) return;
        const name = readable(args[1]) ? args[1].readPointer() : NULL;
        emit({
          fn: "graphEvent",
          seq: ++seq,
          tid: Process.getCurrentThreadId(),
          refr: hex(id),
          event: readable(name) ? name.readCString() : null,
        });
      } catch (e) {
        fail("sendAnimation", e);
      }
    },
  });
  attach("playAnimation", exe.base.add(at.playAnimation), {
    onEnter: function (args) {
      try {
        const id = idOf(args[0]);
        if (GRAPH.indexOf(id) < 0) return;
        emit({
          fn: "playAnimation",
          seq: ++seq,
          tid: Process.getCurrentThreadId(),
          refr: hex(id),
          to: sequenceName(args[2]),
          from: sequenceName(args[3]),
        });
      } catch (e) {
        fail("playAnimation", e);
      }
    },
  });
  // the rocks' bodies for POLL_FOR_MS past each non-Keyframed set, on change and every 250 ms; each poll re-reads the body
  // from its reference, so a body rebuilt or freed since the last read is never read through a stale pointer
  const last = {};
  setInterval(function () {
    if (pollUntil === 0 || Date.now() > pollUntil) return;
    Object.keys(watched).forEach(function (k) {
      const w = watched[k];
      const b = bodyOfRefr(w.refr);
      w.root = b === NULL ? NULL : b.root;
      w.body = b === NULL ? NULL : b.body;
      if (w.body !== NULL) byBhk[w.body.bhk.toString()] = +k;
      const s = state(w.body, w.root);
      if (s === null) return;
      const prev = last[k];
      const now = Date.now();
      const changed =
        !prev ||
        prev.s.type !== s.type ||
        prev.s.speed >= 1 !== s.speed >= 1 ||
        prev.s.frames[0] >= 5 !== s.frames[0] >= 5 ||
        JSON.stringify(prev.s.island) !== JSON.stringify(s.island);
      if (changed || now - prev.at >= 250) {
        last[k] = { s: s, at: now };
        const row = { fn: "body", refr: hex(+k) };
        Object.keys(s).forEach(function (f) {
          row[f] = s[f];
        });
        emit(row);
      }
    });
  }, POLL_MS);
  emit({
    ready: true,
    version: version,
    hooks: hooks,
    pid: Process.id,
    base: exe.base.toString(),
    resolved: resolved,
    rocks: ROCKS.map(hex),
  });
  setInterval(function () {
    emit({
      fn: "liveness",
      pid: Process.id,
      counts: JSON.parse(JSON.stringify(counts)),
    });
  }, 10000);
}
