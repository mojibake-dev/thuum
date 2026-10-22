// napi-trace.js: what Skyrim Platform's JavaScript bridge was doing when a
// game stopped, for thuum docs/verbs/npc-puppet.md (the landing hang of
// 2026-10-21 and 2026-10-22: the first update after a fresh login under
// npcEnabled, the pool thread that runs the game's JavaScript spinning inside
// libnode.dll while the thread that called OnUpdate idles in the asio loop;
// exception-trace.js saw no C++ exception in 20261022-054932's window, so the
// corrupt V8 handler chain is not an exception's). Three layers, one step:
// 1. libnode.dll's exported Node-API entry points (Skyrim Platform embeds
//    Node, NodeInstance.cpp; every C++ callback and every C++ -> JS call
//    passes here): napi_create_function, napi_set_named_property,
//    napi_define_properties and napi_define_class give a callback's name at
//    registration (its data pointer is the key; a function created without a
//    name takes the name of the property it is stored under); napi_get_cb_info
//    marks every callback's entry with its thread; napi_call_function every
//    C++ -> JS call with its status (a non-zero status is a JS exception that
//    escaped to C++); napi_get_and_clear_last_exception the moment such an
//    escape is taken; napi_throw and its variants every JS exception raised
//    from C++, with the callback in progress on that thread and the frames;
//    the reference and handle-scope calls, counted per thread, show any
//    thread beside the JavaScript one touching the engine.
// 2. The engine's Papyrus native dispatch, BSScript::NF_util::
//    NativeFunctionBase::Call (Address Library 104651, CommonLibSSE-NG
//    include/RE/N/NativeFunctionBase.h:130; the function's name at this+0x10
//    and its class at +0x18, :62-63, BSFixedString's chars at +0 of each,
//    include/RE/B/BSFixedString.h): every native a JS callNative reaches and
//    every native the game's own scripts call, by thread. The offset is
//    `just addr 104651` for 1.6.1170 on 2026-10-22.
// 3. KERNELBASE RaiseException and first-chance faults, exception-trace.js's
//    shape, so one step covers both reads.
// Output, one JSON object per line: {ready}, then every second {second} with
// the callbacks, natives, calls and threads of that second; every throw,
// escape and off-thread touch as it happens; and when the bridge has run and
// then stays silent for QUIET_S seconds, one {quiet} line with the last RING
// bridge events and the last NATIVE_RING natives: the hang's last breath, by
// callback name and by native. Params (lab-api's globalThis.LAB_PARAMS):
// QUIET_S (3), RING (300), NATIVE_RING (200). Place the step after the game
// to be read is up and before `connect`: a relaunched seat needs the step
// after its `relaunch`, since the injector attaches by process name.
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
const QUIET_S = PARAMS.QUIET_S || 3;
const RING = PARAMS.RING || 300;
const NATIVE_RING = PARAMS.NATIVE_RING || 200;

// helper names avoid Frida's globals (ptr, hexdump, int64, uint64, NULL)
function hex(n) {
  return "0x" + (n >>> 0).toString(16);
}
function modOff(a) {
  const m = Process.findModuleByAddress(a);
  return m ? m.name + "+0x" + a.sub(m.base).toString(16) : a.toString();
}
function where(context, depth) {
  try {
    return Thread.backtrace(context, Backtracer.FUZZY)
      .slice(0, depth || 18)
      .map(modOff);
  } catch (e) {
    return ["backtrace failed: " + e];
  }
}
function readPtr(p) {
  try {
    return p.isNull() ? NULL : p.readPointer();
  } catch (e) {
    return NULL;
  }
}
function readStr(p, len) {
  try {
    if (p.isNull()) return null;
    if (len === undefined || len < 0 || len > 4096) return p.readUtf8String();
    return p.readUtf8String(len);
  } catch (e) {
    return null;
  }
}
function cstr(p) {
  return readStr(readPtr(p));
}

// the names of a C++ exception's catchable types from its ThrowInfo (MSVC
// x64), exception-trace.js's reader
function throwTypes(params, paramCount) {
  try {
    if (paramCount < 4) return [];
    const throwInfo = params.add(16).readPointer();
    const imageBase = params.add(24).readPointer();
    if (throwInfo.isNull() || imageBase.isNull()) return [];
    const ctaOff = throwInfo.add(12).readU32();
    const cta = imageBase.add(ctaOff);
    const n = Math.min(cta.readU32(), 8);
    const names = [];
    for (let i = 0; i < n; i++) {
      const ct = imageBase.add(cta.add(4 + 4 * i).readU32());
      const td = imageBase.add(ct.add(4).readU32());
      names.push(td.add(16).readCString(96));
    }
    return names;
  } catch (e) {
    return ["unreadable: " + e];
  }
}

// rings and the per-second summary
const bridge = [];
const natives = [];
function push(ring, cap, ev) {
  ev.t = Date.now();
  ring.push(ev);
  if (ring.length > cap) ring.shift();
}
let sec = null;
function resetSecond() {
  sec = {
    cb: {},
    natives: {},
    tids: {},
    nativeTids: {},
    calls: 0,
    callsPending: 0,
    escapes: 0,
    throws: 0,
    created: 0,
    refs: 0,
    scopes: 0,
  };
}
resetSecond();
function bump(map, k) {
  map[k] = (map[k] || 0) + 1;
}
function top(map, n) {
  return Object.keys(map)
    .sort(function (a, b) {
      return map[b] - map[a];
    })
    .slice(0, n)
    .map(function (k) {
      return k + ":" + map[k];
    });
}
let lastBridgeT = 0;
let everActive = false;
let quietReported = false;
const currentCb = {};
function touched(tid) {
  lastBridgeT = Date.now();
  everActive = true;
  quietReported = false;
  bump(sec.tids, tid);
}

// callback names: the data pointer Node-API hands back at every entry is the
// key (node-addon-api's CallbackData, one per Napi::Function::New); a function
// made without a name takes the name of the property it is set under next
const byData = {};
const lastCreated = {};
function nameFor(data, ret) {
  const k = data.toString();
  return byData[k] || "cb@" + modOff(ret);
}
function learn(data, name) {
  if (data.isNull() || !name) return;
  const k = data.toString();
  if (!byData[k]) byData[k] = name;
}
// napi_property_descriptor: utf8name +0, name +8, method +16, getter +24,
// setter +32, value +40, attributes +48, data +56 (64 bytes on x64)
function learnDescriptors(props, count, prefix) {
  const n = Math.min(count, 512);
  for (let i = 0; i < n; i++) {
    const d = props.add(64 * i);
    const name = cstr(d) || "?";
    const data = readPtr(d.add(56));
    if (!readPtr(d.add(16)).isNull()) learn(data, prefix + name);
    if (!readPtr(d.add(24)).isNull()) learn(data, "get " + prefix + name);
    if (!readPtr(d.add(32)).isNull()) learn(data, "set " + prefix + name);
  }
}

function attachNode(node) {
  function exp(name) {
    return node.findExportByName(name);
  }
  const missing = [];
  function hook(name, callbacks) {
    const a = exp(name);
    if (a === null) {
      missing.push(name);
      return;
    }
    Interceptor.attach(a, callbacks);
  }

  hook("napi_create_function", {
    onEnter(args) {
      const len = args[2].toInt32();
      this.name = readStr(args[1], len >= 0 && len < 4096 ? len : undefined);
      this.data = args[4];
      this.result = args[5];
    },
    onLeave(retval) {
      sec.created += 1;
      if (retval.toInt32() !== 0) return;
      const v = readPtr(this.result);
      lastCreated[this.threadId] = { value: v, data: this.data };
      learn(this.data, this.name);
    },
  });
  hook("napi_set_named_property", {
    onEnter(args) {
      const lc = lastCreated[this.threadId];
      if (lc && lc.value.equals(args[3])) learn(lc.data, readStr(args[2]));
    },
  });
  hook("napi_define_properties", {
    onEnter(args) {
      learnDescriptors(args[3], args[2].toInt32(), "");
    },
  });
  hook("napi_define_class", {
    onEnter(args) {
      const len = args[2].toInt32();
      const cls =
        readStr(args[1], len >= 0 && len < 4096 ? len : undefined) || "?";
      learn(args[4], "new " + cls);
      learnDescriptors(args[6], args[5].toInt32(), cls + ".");
    },
  });

  // every callback's entry
  hook("napi_get_cb_info", {
    onEnter(args) {
      this.dataOut = args[5];
      this.ret = this.returnAddress;
    },
    onLeave() {
      const tid = this.threadId;
      const name = nameFor(readPtr(this.dataOut), this.ret);
      currentCb[tid] = name;
      bump(sec.cb, name);
      push(bridge, RING, { k: "cb", n: name, tid: tid });
      touched(tid);
    },
  });
  // every C++ -> JS call and its status
  hook("napi_call_function", {
    onLeave(retval) {
      const st = retval.toInt32();
      sec.calls += 1;
      if (st !== 0) sec.callsPending += 1;
      push(bridge, RING, {
        k: "call",
        st: st,
        tid: this.threadId,
        in: currentCb[this.threadId] || null,
      });
      touched(this.threadId);
    },
  });
  hook("napi_get_and_clear_last_exception", {
    onEnter() {
      sec.escapes += 1;
      const ev = {
        k: "escape",
        tid: this.threadId,
        in: currentCb[this.threadId] || null,
      };
      push(bridge, RING, ev);
      emit({
        escape: true,
        tid: ev.tid,
        inCallback: ev.in,
        frames: where(this.context, 10),
      });
      touched(this.threadId);
    },
  });
  // every JS exception raised from C++
  function throwHook(kind, withMessage) {
    return {
      onEnter(args) {
        sec.throws += 1;
        const ev = {
          k: "throw",
          how: kind,
          tid: this.threadId,
          in: currentCb[this.threadId] || null,
          msg: withMessage ? readStr(args[2]) : null,
        };
        push(bridge, RING, ev);
        emit({
          thrown: true,
          how: kind,
          tid: ev.tid,
          inCallback: ev.in,
          msg: ev.msg,
          frames: where(this.context, 18),
        });
        touched(this.threadId);
      },
    };
  }
  hook("napi_throw", throwHook("napi_throw", false));
  hook("napi_throw_error", throwHook("napi_throw_error", true));
  hook("napi_throw_type_error", throwHook("napi_throw_type_error", true));
  hook("napi_throw_range_error", throwHook("napi_throw_range_error", true));
  hook("napi_fatal_exception", {
    onEnter() {
      emit({
        fatalException: true,
        tid: this.threadId,
        in: currentCb[this.threadId] || null,
        frames: where(this.context, 18),
      });
    },
  });
  // touches that a thread beside the JavaScript one would make
  [
    "napi_create_reference",
    "napi_delete_reference",
    "napi_reference_ref",
    "napi_reference_unref",
  ].forEach(function (n) {
    hook(n, {
      onEnter() {
        sec.refs += 1;
        bump(sec.tids, this.threadId);
      },
    });
  });
  hook("napi_open_handle_scope", {
    onEnter() {
      sec.scopes += 1;
      bump(sec.tids, this.threadId);
    },
  });

  emit({
    nodeHooked: true,
    module: node.name,
    base: node.base.toString(),
    missing: missing,
  });
}

// layer 2: the engine's native dispatch
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
const OFFSETS = {
  "1.6.1170.0": {
    nativeFunctionCall: 0x143dc00, // 104651
  },
};
const exe = Process.getModuleByName("SkyrimSE.exe");
const version = fileVersion(exe.path);
const at = OFFSETS[version];
if (at === undefined) {
  emit({ error: "no offsets for this runtime", version: version });
} else {
  Interceptor.attach(exe.base.add(at.nativeFunctionCall), {
    onEnter(args) {
      const fn = args[0];
      const key =
        (cstr(fn.add(0x18)) || "?") + "." + (cstr(fn.add(0x10)) || "?");
      bump(sec.natives, key);
      bump(sec.nativeTids, this.threadId);
      push(natives, NATIVE_RING, { k: "native", f: key, tid: this.threadId });
    },
  });
}

// layer 3: RaiseException and first-chance faults
// a thrown std::exception's what(): MSVC's std::exception keeps
// __std_exception_data { const char* what; bool doFree; } right after the
// vtable pointer, so the text sits at *(object + 8); the object is the
// second ULONG_PTR of a C++ throw's RaiseException arguments
function whatOf(params, paramCount) {
  try {
    if (paramCount < 2) return null;
    const obj = params.add(8).readPointer();
    if (obj.isNull()) return null;
    const what = obj.add(8).readPointer();
    return what.isNull() ? null : what.readCString(300);
  } catch (e) {
    return null;
  }
}

const seen = {};
function record(key, line) {
  const c = seen[key];
  if (c) {
    c.n += 1;
    return;
  }
  seen[key] = { n: 1, line: line };
  emit(line);
}
const kb = Process.getModuleByName("KERNELBASE.dll");
const raise = kb.findExportByName("RaiseException");
if (raise === null) {
  emit({ error: "no RaiseException export" });
} else {
  Interceptor.attach(raise, {
    onEnter(args) {
      const code = args[0].toInt32() >>> 0;
      const paramCount = args[2].toInt32();
      const types = code === 0xe06d7363 ? throwTypes(args[3], paramCount) : [];
      const frames = where(this.context, 14);
      record(
        this.threadId +
          ":" +
          code +
          ":" +
          types.join("|") +
          ":" +
          (frames[2] || ""),
        {
          raised: true,
          tid: this.threadId,
          code: hex(code),
          types: types,
          what: code === 0xe06d7363 ? whatOf(args[3], paramCount) : null,
          in: currentCb[this.threadId] || null,
          frames: frames,
        },
      );
    },
  });
}
Process.setExceptionHandler(function (details) {
  const frames = where(details.context, 14);
  const a = details.address;
  const m = a ? Process.findModuleByAddress(a) : null;
  record("fault:" + details.type + ":" + (frames[0] || ""), {
    fault: true,
    type: details.type,
    at: m ? m.name + "+0x" + a.sub(m.base).toString(16) : String(a),
    memory: details.memory
      ? {
          op: details.memory.operation,
          address: String(details.memory.address),
        }
      : null,
    frames: frames,
  });
  return false;
});

// the engine module: present once SkyrimPlatformImpl.dll has loaded it
function findNode() {
  const node = Process.findModuleByName("libnode.dll");
  if (node !== null) {
    attachNode(node);
    return;
  }
  setTimeout(findNode, 250);
}
findNode();

setInterval(function () {
  const keys = Object.keys(seen);
  for (const k of keys) {
    if (seen[k].n > 1)
      emit({
        repeats: true,
        of: seen[k].line.code || seen[k].line.type,
        tid: seen[k].line.tid,
        n: seen[k].n,
      });
    delete seen[k];
  }
  const s = sec;
  resetSecond();
  const any =
    s.calls ||
    s.throws ||
    s.escapes ||
    s.created ||
    Object.keys(s.cb).length ||
    Object.keys(s.natives).length;
  if (!any) return;
  emit({
    second: true,
    cb: top(s.cb, 12),
    natives: top(s.natives, 10),
    calls: s.calls,
    callsPending: s.callsPending,
    escapes: s.escapes,
    throws: s.throws,
    created: s.created,
    refs: s.refs,
    scopes: s.scopes,
    tids: s.tids,
    nativeTids: s.nativeTids,
    bridgeIdleMs: lastBridgeT ? Date.now() - lastBridgeT : null,
  });
}, 1000);

setInterval(function () {
  if (!everActive || quietReported) return;
  const idle = Date.now() - lastBridgeT;
  if (idle < QUIET_S * 1000) return;
  quietReported = true;
  emit({
    quiet: true,
    idleMs: idle,
    currentCb: currentCb,
    lastBridge: bridge.slice(),
    lastNatives: natives.slice(),
  });
}, 500);

emit({
  ready: true,
  version: version,
  exe: exe.base.toString(),
  quietS: QUIET_S,
  ring: RING,
  nativeRing: NATIVE_RING,
});
