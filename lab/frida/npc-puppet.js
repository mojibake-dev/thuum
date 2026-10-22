// npc-puppet.js: the spin's autopsy (probe P0) and the puppet shape's counts
// (probe P1), for thuum docs/verbs/npc-puppet.md. Two modes, params {MODE}:
// - 'p0' (default): why a pinned actor turns. Hooks the keep-offset planner
//   agent's per-frame goal (42182, IMovementPlannerAgent slot 2 of
//   MovementPlannerAgentKeepOffset: rcx = agent+0x18, the target handle at
//   agent+0x38, the angle offset's z at agent+0x50, the controller at
//   agent+0x28 whose actor sits at controller+0x1B8, the out array in r8 with
//   the facing goal's z at +0x20), the keep-offset mode flip (41734: rcx the
//   movement controller, dl the flag, the controller state at +0x1C0) and
//   Actor::SetRotationZ (37230: rcx the actor; data.angle.z at actor+0x50
//   read on leave, since the angle arrives in xmm1, which Frida's context
//   does not expose; the return address names the caller). Decides: 42182
//   every frame with the state 13 and goal minus angle about the offset
//   confirms the keep-offset as the spinner; 41734's log says why Clear never
//   lands; a SetRotationZ return address outside 37356 names another writer.
// - 'p1': the detours at work on one puppet. Counts per second, for the
//   actor in params {ACTOR} (its form id): the movement step 37356 (rcx the
//   actor; zero expected once puppet), Actor::Move 37507 (rcx the actor, r8
//   the translation; one per frame with a zero translation expected under
//   hook 3's shape), the controller's simulate 78275 (rcx the controller;
//   stepInfo.deltaTime at +0x88 and invDeltaTime at +0x8C read on leave:
//   never zero while the body has a world), the rigid-body controller's
//   SetLinearVelocityImpl 79198 and SetPositionImpl 79193 (rcx the
//   controller; +0x88 read on entry: a zero here is Skyrim Together's #901
//   hazard), Actor::SetPosition 37309 (rcx the actor; the relay's warps), and
//   the animation job 41453 (ecx the 32-bit actor handle; distinct handles
//   per second: one more than before the puppeting). The controller's class
//   is read from its vtable against 240580 (rigid body) and 240560 (proxy).
// Every offset is Address Library 1.6.1170's by `just addr` (lab/addr.py)
// on 2026-10-21; the field offsets are the re-analyst's REA reads of the
// same day (docs/verbs/npc-puppet.md, Engine surface), CONFIRMED-STATIC for
// the instructions, HYPOTHESIS for the game's behavior until this trace.
// A form's id at +0x14 (CommonLibSSE-NG include/RE/T/TESForm.h:354);
// data.angle at TESObjectREFR +0x48 (include/RE/T/TESObjectREFR.h:495, the
// OBJ_REFR's angle after its three-float location at +0x54? no: location
// +0x54, angle +0x48; the REA read: data.angle.z = actor+0x50).
// Run: a scenario's `frida {script: npc-puppet.js, params: {MODE: p1, ACTOR:
// 0x1bcd8}}` step (lab-api prepends the params as globalThis.LAB_PARAMS), or
// `just frida npc-puppet.js c1` for mode p0 by hand.
'use strict';
function emit(obj) { obj.t = Date.now(); send(obj); console.log(JSON.stringify(obj)); }

// lab-api prepends `globalThis.LAB_PARAMS = {...}` for a step's params
// (labapi/runner.py _frida_start); `params` is kept for a hand-run copy
const PARAMS = (typeof LAB_PARAMS === 'object' && LAB_PARAMS) ? LAB_PARAMS
  : ((typeof params === 'object' && params) ? params : {});
const MODE = PARAMS.MODE || 'p0';
const ACTOR = PARAMS.ACTOR ? (PARAMS.ACTOR >>> 0) : 0;

const OFFSETS = {
  '1.6.1170.0': {
    keepOffsetGoal: 0x795830, // 42182
    keepOffsetFlip: 0x785530, // 41734
    setRotationZ: 0x661690, // 37230
    movementStep: 0x6698d0, // 37356
    actorMove: 0x6768a0, // 37507
    controllerSimulate: 0xe9f170, // 78275
    rigidSetLinearVelocity: 0xed4660, // 79198
    rigidSetPosition: 0xed3fb0, // 79193
    actorSetPosition: 0x664680, // 37309
    animationJob: 0x776a90, // 41453
    havokStepGlobal: 0x202c688, // 389089
    vtableRigid: 0x19ee668, // 240580
    vtableProxy: 0x19edff0, // 240560
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

// helper names avoid Frida's globals (ptr, hexdump, int64, uint64, NULL):
// a top-level `ptr` failed the load ("cannot define variable 'ptr'",
// run 20261022-040233)
function hex(n) { return '0x' + (n >>> 0).toString(16); }
function u32(p) { try { return p.isNull() ? 0 : p.readU32(); } catch (e) { return -1; } }
function f32(p) { try { return p.isNull() ? NaN : p.readFloat(); } catch (e) { return NaN; } }
function readPtr(p) { try { return p.isNull() ? NULL : p.readPointer(); } catch (e) { return NULL; } }
function formId(form) { return form.isNull() ? 0 : u32(form.add(0x14)); }
function angleZ(actor) { return f32(actor.add(0x50)); }
function wrap(d) { return ((((d + 180) % 360) + 360) % 360) - 180; }
function deg(r) { return r * 180 / Math.PI; }
function caller(context) {
  const a = context.rsp.readPointer();
  const m = Process.findModuleByAddress(a);
  return m ? m.name + '+0x' + a.sub(m.base).toString(16) : a.toString();
}

const exe = Process.getModuleByName('SkyrimSE.exe');
const version = fileVersion(exe.path);
const at = OFFSETS[version];
if (at === undefined) {
  emit({ error: 'no offsets for this runtime', version: version });
} else {
  emit({ ready: true, version: version, mode: MODE, actor: ACTOR ? hex(ACTOR) : 'every actor' });
  const watched = function (id) { return ACTOR === 0 || id === ACTOR; };

  // per-second summaries, keyed by actor id (the hooks are per frame)
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

  if (MODE === 'p0') {
    // the keep-offset planner agent's per-frame goal
    Interceptor.attach(exe.base.add(at.keepOffsetGoal), {
      onEnter(args) {
        const agent = args[0].sub(0x18);
        const controller = readPtr(agent.add(0x28));
        const actor = controller.isNull() ? NULL : readPtr(controller.add(0x1b8));
        this.actor = actor;
        this.out = args[2];
        this.controller = controller;
        this.target = u32(agent.add(0x38));
        this.offsetZ = deg(f32(agent.add(0x50)));
      },
      onLeave() {
        const id = formId(this.actor);
        if (!watched(id)) return;
        const goal = deg(f32(this.out.add(0x20)));
        const angle = deg(angleZ(this.actor));
        bump('keepOffsetGoal', id, {
          state: this.controller.isNull() ? -1 : u32(this.controller.add(0x1c0)),
          targetHandle: hex(this.target),
          offsetZ: Math.round(this.offsetZ * 100) / 100,
          goalMinusAngle: Math.round(wrap(goal - angle) * 100) / 100,
          angle: Math.round(angle * 100) / 100,
        });
      },
    });
    // the mode flip: Keep (dl 1) or Clear (dl 0), and the state around it
    Interceptor.attach(exe.base.add(at.keepOffsetFlip), {
      onEnter(args) {
        this.controller = args[0];
        this.flag = args[1].toInt32() & 0xff;
        this.before = u32(this.controller.add(0x1c0));
      },
      onLeave() {
        const actor = readPtr(this.controller.add(0x1b8));
        const id = formId(actor);
        if (!watched(id)) return;
        emit({ keepOffsetFlip: true, actor: hex(id), flag: this.flag, stateBefore: this.before,
               stateAfter: u32(this.controller.add(0x1c0)) });
      },
    });
    // every heading write, by caller
    Interceptor.attach(exe.base.add(at.setRotationZ), {
      onEnter(args) {
        this.actor = args[0];
        this.from = caller(this.context);
        this.before = deg(angleZ(this.actor));
      },
      onLeave() {
        const id = formId(this.actor);
        if (!watched(id)) return;
        const after = deg(angleZ(this.actor));
        bump('setRotationZ ' + this.from, id, {
          lastDelta: Math.round(wrap(after - this.before) * 100) / 100,
          angle: Math.round(after * 100) / 100,
        });
      },
    });
  }

  if (MODE === 'p1') {
    Interceptor.attach(exe.base.add(at.movementStep), {
      onEnter(args) { const id = formId(args[0]); if (watched(id)) bump('movementStep', id); },
    });
    Interceptor.attach(exe.base.add(at.actorMove), {
      onEnter(args) {
        const id = formId(args[0]);
        if (!watched(id)) return;
        const t = args[2];
        bump('actorMove', id, { translation: [f32(t), f32(t.add(4)), f32(t.add(8))].map(function (v) { return Math.round(v * 1000) / 1000; }) });
      },
    });
    Interceptor.attach(exe.base.add(at.actorSetPosition), {
      onEnter(args) {
        const id = formId(args[0]);
        if (!watched(id)) return;
        bump('actorSetPosition', id, { updateController: args[2].toInt32() & 0xff });
      },
    });
    // the controller hooks carry no actor: the controller's class and its step are logged for every controller
    function controllerClass(controller) {
      const vt = readPtr(controller);
      if (vt.equals(exe.base.add(at.vtableRigid))) return 'rigid';
      if (vt.equals(exe.base.add(at.vtableProxy))) return 'proxy';
      return vt.toString();
    }
    Interceptor.attach(exe.base.add(at.controllerSimulate), {
      onEnter(args) { this.controller = args[0]; },
      onLeave() {
        const dt = f32(this.controller.add(0x88));
        const g = f32(exe.base.add(at.havokStepGlobal));
        const key = 'controllerSimulate ' + controllerClass(this.controller);
        const c = counts[key] || (counts[key] = { what: key, n: 0, zeroSteps: 0, minDt: Infinity, maxDt: 0 });
        c.n += 1;
        if (dt === 0) c.zeroSteps += 1;
        if (dt < c.minDt) c.minDt = dt;
        if (dt > c.maxDt) c.maxDt = dt;
        c.havokStep = g;
        c.invDt = f32(this.controller.add(0x8c));
      },
    });
    for (const name of ['rigidSetLinearVelocity', 'rigidSetPosition']) {
      Interceptor.attach(exe.base.add(at[name]), {
        onEnter(args) {
          const dt = f32(args[0].add(0x88));
          const key = name + (dt === 0 ? ' ZERO-STEP' : '');
          const c = counts[key] || (counts[key] = { what: key, n: 0 });
          c.n += 1;
          c.lastDt = dt;
          if (dt === 0) emit({ hazard: name, controller: args[0].toString(), stepZero: true });
        },
      });
    }
    // the animation job: distinct handles per second
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
}
