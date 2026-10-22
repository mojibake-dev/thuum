// npc-locomotion.js (thuum-magnus, 2026-10-22): docs/research/m3/re-puppet-locomotion.md's
// probes F1 and F2 for one actor. At the actor's graph tick entry (20123, rcx the Actor*) it
// reads the four MiddleHighProcessData fields the Speed, Direction, TurnDelta and TargetSpeed
// channels poll (currentMovementSpeed +0x2A8, rotation.z +0xB8, rotationSpeed.z +0xC4, unk2AC;
// CommonLibSSE-NG include/RE/M/MiddleHighProcessData.h:138-139 and :197-198, reached through
// Actor+0xF8 currentProcess (re-ai-puppet.md:15-18 for 1.6.1170) and AIProcess+8 middleHigh,
// AIProcess.h:196), and at the Speed channel's poll (38330, rcx the channel, its Actor* at
// +0x28, dl the poll flag, the value at +0x18 on return) it reads what the graph is about to
// get. Per-second rows per actor: ticks, the last fields, the poll's value and flag. On a
// puppet under train-33's detour the fields should hold the relayed sample every tick and the
// poll's value should equal it; zeros say the write did not reach the tick (another writer, or
// the stage order, F5). Params through LAB_PARAMS: ACTOR (a form id; 0 watches every actor
// whose speed field is nonzero, noisy).
function emit(obj) { obj.t = Date.now(); send(obj); console.log(JSON.stringify(obj)); }

const PARAMS = (typeof LAB_PARAMS === 'object' && LAB_PARAMS) ? LAB_PARAMS
  : ((typeof params === 'object' && params) ? params : {});
const ACTOR = PARAMS.ACTOR ? (PARAMS.ACTOR >>> 0) : 0;

// offsets by `just addr <id>` for 1.6.1170 (never from memory, CLAUDE.md rule 1)
const OFFSETS = {
  '1.6.1170.0': {
    graphTick: 0x2f78b0, // 20123
    speedPoll: 0x6ade10, // 38330
    animationJob: 0x776a90, // 41453
  },
};

function fileVersion(path) {
  const ver = Module.load('version.dll');
  const size = new NativeFunction(ver.getExportByName('GetFileVersionInfoSizeW'), 'uint32', ['pointer', 'pointer']);
  const info = new NativeFunction(ver.getExportByName('GetFileVersionInfoW'), 'int', ['pointer', 'uint32', 'uint32', 'pointer']);
  const query = new NativeFunction(ver.getExportByName('VerQueryValueW'), 'int', ['pointer', 'pointer', 'pointer', 'pointer']);
  const p = Memory.allocUtf16String(path);
  const n = size(p, NULL);
  if (n === 0) return null;
  const buf = Memory.alloc(n);
  if (!info(p, 0, n, buf)) return null;
  const out = Memory.alloc(Process.pointerSize);
  const len = Memory.alloc(4);
  if (!query(buf, Memory.allocUtf16String('\\'), out, len)) return null;
  const ffi = out.readPointer();
  const ms = ffi.add(8).readU32();
  const ls = ffi.add(12).readU32();
  return [ms >>> 16, ms & 0xffff, ls >>> 16, ls & 0xffff].join('.');
}

// helper names avoid Frida's globals (ptr, hexdump, int64, uint64, NULL)
function hex(n) { return '0x' + (n >>> 0).toString(16); }
function u32(p) { try { return p.isNull() ? 0 : p.readU32(); } catch (e) { return -1; } }
function f32(p) { try { return p.isNull() ? NaN : p.readFloat(); } catch (e) { return NaN; } }
function readPtr(p) { try { return p.isNull() ? NULL : p.readPointer(); } catch (e) { return NULL; } }
function formId(form) { return form.isNull() ? 0 : u32(form.add(0x14)); }
function deg(r) { return r * 180 / Math.PI; }
function middleHigh(actor) {
  const process = readPtr(actor.add(0xf8));
  return process.isNull() ? NULL : readPtr(process.add(8));
}

const exe = Process.getModuleByName('SkyrimSE.exe');
const version = fileVersion(exe.path);
const at = OFFSETS[version];
if (at === undefined) {
  emit({ error: 'no offsets for this runtime', version: version });
} else {
  emit({ ready: true, version: version, actor: ACTOR ? hex(ACTOR) : 'every actor with a nonzero speed field' });
  const watched = function (id, speed) { return ACTOR === 0 ? speed !== 0 : id === ACTOR; };

  const counts = {};
  function bump(key, actor, fields) {
    const k = hex(actor) + ' ' + key;
    const c = counts[k] || (counts[k] = { actor: hex(actor), what: key, n: 0 });
    c.n += 1;
    if (fields) Object.assign(c, fields);
  }
  setInterval(function () {
    const keys = Object.keys(counts);
    if (keys.length === 0) return;
    const rows = keys.map(function (k) { return counts[k]; });
    for (const k of keys) delete counts[k];
    emit({ second: true, rows: rows });
  }, 1000);

  // F1: the fields at the graph tick's entry
  Interceptor.attach(exe.base.add(at.graphTick), {
    onEnter(args) {
      const actor = args[0];
      const id = formId(actor);
      const mh = middleHigh(actor);
      if (mh.isNull()) return;
      const speed = f32(mh.add(0x2a8));
      if (!watched(id, speed)) return;
      bump('graphTick', id, {
        speed: speed,
        directionDeg: deg(f32(mh.add(0xb8))),
        turnRateDegPerS: deg(f32(mh.add(0xc4))),
        targetSpeed: f32(mh.add(0x2ac)),
      });
    },
  });

  // F2: the Speed channel's poll, what the graph gets
  Interceptor.attach(exe.base.add(at.speedPoll), {
    onEnter(args) {
      this.channel = args[0];
      this.flag = args[1].toInt32() & 0xff;
      this.id = formId(readPtr(args[0].add(0x28)));
    },
    onLeave() {
      const value = f32(this.channel.add(0x18));
      if (!watched(this.id, value)) return;
      bump('speedPoll', this.id, { value: value, pollFlag: this.flag });
    },
  });

  // the animation job: distinct handles per second (the puppet's graph ticks at all)
  let handles = {};
  Interceptor.attach(exe.base.add(at.animationJob), {
    onEnter(args) { handles[args[0].toInt32() >>> 0] = true; },
  });
  setInterval(function () {
    const n = Object.keys(handles).length;
    handles = {};
    emit({ animationJobs: true, distinctHandlesLastSecond: n });
  }, 1000);
}
