// lamp-shot-trace.js v1.1 (2026-11-05, its fresh review's fixes as written): every row to console.log as well as send(),
// since lab-api's preamble captures console.log alone and the artifact is the injector's .out plus that .log (a send-only
// trace printed nothing: x-trap-path 20261102-131634); the Sleep pulse through Process.getModuleByName (Frida 17 dropped the
// static Module.getExportByName: 131634's "attach:sleep" TypeError); TESHitEvent's layout cited to CommonLib; an onLeave only
// on the hook that reads a return. v1 follows.
// lamp-shot-trace.js v1: where a shot at a falling oil lamp stops, on the seat that fires it (thuum docs/verbs/traps.md,
// D-S3's window 1 reads and the lamp's Dynamic plan; written 2026-11-05 from the re-analyst's static read of that day on
// sky-re, every fact HYPOTHESIS until this trace reads it). x-trap-lamp-trigger v1 (20261105-135717) set no lamp off on the
// Temple's host: the player's Papyrus Activate on 0x9b0fb returned false before any event (the read: ActivateRef refuses a
// player activating a reference whose base has no name, and ACTI 0x90efc has no FULL), and Spell.Cast(Firebolt, player,
// 0x9b0e2) flew along the player's own aim, not at the target (the read: the player's desiredTarget is replaced and the
// heading and pitch are the player's). This trace follows a shot from the cast to the lamp's script. Ids by `just addr`
// (Address Library 1.6.1170), struct offsets from CommonLibSSE-NG b93280e8:
//   34404 (0x5bb9c0) the instant caster's CastSpellImmediate (MagicCaster.h:46, slot 01): RCX the caster, RDX the spell,
//     R9 the target; desiredTarget a handle at caster+0x20 (MagicCaster.h:87).
//   44108 (0x7e46c0) Projectile::Launch (Projectile.cpp:255-258, RELOCATION_ID(42928, 44108)): RDX the LaunchData
//     (Projectile.h:81-105: origin +0x08, projectileBase +0x20, shooter +0x28, angleZ +0x48, angleX +0x4C, desiredTarget
//     +0x58, spell +0x70, castingSource +0x78, autoAim +0x9E), angles in radians.
//   44213 (0x7ecd80) the impact handler that sends TESHitEvent (the read): RCX the projectile, RDX the impacted reference
//     or null, R8 the hit point (NiPoint3*).
//   38668 (0x6be880) BSTEventSource<TESHitEvent>::SendEvent (the read): RDX the event (TESHitEvent.h:26-30: +0x00 target,
//     +0x08 cause, +0x10 source form id, +0x14 projectile form id, +0x18 flags); the return address names the sender
//     (+0x7ed0dc 44213, +0x7ec777 44207, +0x6b7def 38586).
//   36909 (0x6555a0) TaskQueueInterface::QueueUpdateDestructibleObject (TaskQueueInterface.cpp:32-35): RDX the reference,
//     XMM2 the damage, [RSP+0x28] the cause.
//   104800 (0x14477f0) the VM's SendEvent (IVirtualMachine.h slot 0x24; sendevent-rate.js's reading): RDX the VMHandle,
//     whose low 32 bits are a plain form's id (HYPOTHESIS, the read of HandlePolicy 53508), [R8] the event name's chars
//     (BSFixedString.h:232).
//   19796 (0x2eac20) TESObjectREFR::ActivateRef (TESObjectREFR.cpp:52-57): RCX the reference, RDX the activator; its
//     return in AL.
// A form's id is at +0x14 and its type at +0x1a (TESForm.h:354, :356); a reference's base at +0x40 (TESObjectREFR.h:495,
// OBJ_REFR.objectReference), its angle at +0x48 and location at +0x54 (OBJ_REFR at +0x40: angle +0x08, location +0x14).
// Rows: {ready, version, hooks, resolved} once; one row per call that names a lamp (the refs below), the player's
// shooting, or the Firebolt; {fn: 'liveness', counts} every 10 s, with a kernel32!Sleep count so a dead Interceptor shows
// (trap-path-trace.js v3's lesson). LAB_PARAMS {refs: [ids]} replaces the lamps (default 0x9b0fb and 0x9b0e2). Run as a
// probe's `frida {script: lamp-shot-trace.js}` step on the seat that fires, before the shot. 1.6.1170 only.
'use strict';
function emit(obj) { obj.t = Date.now(); send(obj); console.log(JSON.stringify(obj)); }

const OFFSETS = {
  '1.6.1170.0': {
    castSpellImmediate: 0x5bb9c0, // 34404
    launch: 0x7e46c0, // 44108
    impactHit: 0x7ecd80, // 44213
    hitEventSend: 0x6be880, // 38668
    destructibleQueue: 0x6555a0, // 36909
    sendEvent: 0x14477f0, // 104800
    activateRef: 0x2eac20, // 19796
  },
};
const FORM_ID = 0x14; // TESForm.h:354
const FORM_TYPE = 0x1a; // TESForm.h:356
const REFR_BASE = 0x40; // TESObjectREFR.h:495
const REFR_ANGLE = 0x48;
const REFR_LOCATION = 0x54;
const PLAYER_ID = 0x14;
const FIREBOLT = 0x12fd0;
const P = (typeof LAB_PARAMS !== 'undefined' && LAB_PARAMS) || {};
const LAMPS = (Array.isArray(P.refs) ? P.refs : [0x9b0fb, 0x9b0e2]).map(function (x) { return x >>> 0; });
const EVENTS = ['OnActivate', 'OnHit', 'OnMagicEffectApply', 'OnDestructionStageChanged', 'OnTrapHitStart'];

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

function hex(n) { return '0x' + (n >>> 0).toString(16); }

function readable(p) {
  if (p.isNull()) return false;
  const r = Process.findRangeByAddress(p);
  return r !== null && r.protection.indexOf('r') === 0;
}

const failed = {};
function fail(fn, e) {
  if (failed[fn]) return;
  failed[fn] = true;
  emit({ fn: fn, err: String(e) });
}

function formId(p) {
  try { return readable(p) ? p.add(FORM_ID).readU32() >>> 0 : null; } catch (e) { return null; }
}
function formInfo(p) {
  if (!readable(p)) return null;
  try {
    const id = p.add(FORM_ID).readU32() >>> 0;
    const out = { id: hex(id), type: p.add(FORM_TYPE).readU8() };
    const base = p.add(REFR_BASE).readPointer();
    const baseId = formId(base);
    if (baseId !== null) out.base = hex(baseId);
    return out;
  } catch (e) {
    return null;
  }
}
function f32(p) { try { return readable(p) ? +p.readFloat().toFixed(4) : null; } catch (e) { return null; } }
function point(p) { return readable(p) ? [f32(p), f32(p.add(4)), f32(p.add(8))] : null; }
function isLamp(id) { return id !== null && LAMPS.indexOf(id >>> 0) >= 0; }

let seq = 0;
const exe = Process.getModuleByName('SkyrimSE.exe');
const version = fileVersion(exe.path);
const at = OFFSETS[version];
if (at === undefined) {
  emit({ error: 'no offsets for this runtime', version: version });
} else {
  let hooks = 0;
  const counts = {};
  const resolved = {};
  const attach = function (name, offset, handlers) {
    counts[name] = 0;
    try {
      const target = exe.base.add(offset);
      resolved[name] = {
        at: target.toString(),
        bytes: readable(target) ? Array.from(new Uint8Array(target.readByteArray(8))).map(function (b) { return ('0' + b.toString(16)).slice(-2); }).join(' ') : 'unreadable',
      };
      const callbacks = {
        onEnter: function (args) {
          counts[name]++;
          if (handlers.enter) {
            try { handlers.enter.call(this, args); } catch (e) { fail(name, e); }
          }
        },
      };
      // an onLeave costs every call a return trampoline: only the hook that reads a return gets one
      if (handlers.leave) {
        callbacks.onLeave = function (retval) {
          try { handlers.leave.call(this, retval); } catch (e) { fail(name + ':leave', e); }
        };
      }
      Interceptor.attach(target, callbacks);
      hooks++;
    } catch (e) { fail('attach:' + name, e); }
  };
  try {
    const sleep = Process.getModuleByName('kernel32.dll').getExportByName('Sleep');
    counts.sleep = 0;
    Interceptor.attach(sleep, { onEnter: function () { counts.sleep++; } });
    resolved.sleep = { at: sleep.toString() };
  } catch (e) { fail('attach:sleep', e); }

  attach('castSpellImmediate', at.castSpellImmediate, {
    enter: function (args) {
      const spell = formId(args[1]);
      if (spell !== FIREBOLT) return;
      const caster = args[0];
      emit({
        fn: 'castSpellImmediate', seq: ++seq, tid: Process.getCurrentThreadId(), spell: hex(spell),
        target: formInfo(this.context.r9), desiredTargetHandle: readable(caster.add(0x20)) ? hex(caster.add(0x20).readU32()) : null,
      });
    },
  });
  attach('launch', at.launch, {
    enter: function (args) {
      const d = args[1];
      if (!readable(d)) return;
      const shooter = d.add(0x28).readPointer();
      const spell = formId(d.add(0x70).readPointer());
      if (formId(shooter) !== PLAYER_ID && spell !== FIREBOLT) return;
      const row = {
        fn: 'launch', seq: ++seq, tid: Process.getCurrentThreadId(),
        origin: point(d.add(0x08)), projectile: formId(d.add(0x20).readPointer()) === null ? null : hex(formId(d.add(0x20).readPointer())),
        shooter: formInfo(shooter), angleZ: f32(d.add(0x48)), angleX: f32(d.add(0x4c)),
        desiredTarget: formInfo(d.add(0x58).readPointer()), spell: spell === null ? null : hex(spell),
        castingSource: d.add(0x78).readU32(), autoAim: d.add(0x9e).readU8(),
      };
      if (readable(shooter)) row.shooterAngle = point(shooter.add(REFR_ANGLE));
      emit(row);
    },
  });
  attach('impactHit', at.impactHit, {
    enter: function (args) {
      const projectile = args[0];
      const impacted = formInfo(args[1]);
      emit({
        fn: 'impactHit', seq: ++seq, tid: Process.getCurrentThreadId(), projectile: formInfo(projectile),
        impacted: impacted, at: point(args[2]), lamp: impacted !== null && isLamp(parseInt(impacted.id, 16)),
      });
    },
  });
  attach('hitEventSend', at.hitEventSend, {
    enter: function (args) {
      const ev = args[1];
      if (!readable(ev)) return;
      const target = formInfo(ev.readPointer());
      const cause = formInfo(ev.add(0x08).readPointer());
      const targetId = target === null ? null : parseInt(target.id, 16);
      const causeId = cause === null ? null : parseInt(cause.id, 16);
      if (!isLamp(targetId) && causeId !== PLAYER_ID) return;
      emit({
        fn: 'hitEventSend', seq: ++seq, tid: Process.getCurrentThreadId(), target: target, cause: cause,
        source: hex(ev.add(0x10).readU32()), projectile: hex(ev.add(0x14).readU32()), flags: ev.add(0x18).readU8(),
        from: '+0x' + this.returnAddress.sub(exe.base).toString(16),
      });
    },
  });
  attach('destructibleQueue', at.destructibleQueue, {
    enter: function (args) {
      const ref = formInfo(args[1]);
      emit({
        fn: 'destructibleQueue', seq: ++seq, tid: Process.getCurrentThreadId(), ref: ref,
        lamp: ref !== null && isLamp(parseInt(ref.id, 16)), cause: formInfo(this.context.rsp.add(0x28).readPointer()),
      });
    },
  });
  attach('sendEvent', at.sendEvent, {
    enter: function (args) {
      const low = args[1].and(ptr('0xffffffff')).toUInt32() >>> 0;
      if (!isLamp(low)) return;
      let name = '?';
      try {
        const chars = args[2].readPointer();
        name = chars.isNull() ? '' : chars.readCString();
      } catch (e) {
        name = 'unreadable';
      }
      emit({ fn: 'sendEvent', seq: ++seq, tid: Process.getCurrentThreadId(), ref: hex(low), event: name, watched: EVENTS.indexOf(name) >= 0 });
    },
  });
  attach('activateRef', at.activateRef, {
    enter: function (args) {
      const id = formId(args[0]);
      this.lamp = isLamp(id);
      if (!this.lamp) return;
      emit({ fn: 'activateRef', seq: ++seq, tid: Process.getCurrentThreadId(), ref: hex(id), activator: formInfo(args[1]) });
    },
    leave: function (retval) {
      if (!this.lamp) return;
      emit({ fn: 'activateRef:leave', seq: ++seq, tid: Process.getCurrentThreadId(), result: retval.toUInt32() & 0xff });
    },
  });
  emit({ ready: true, version: version, hooks: hooks, pid: Process.id, base: exe.base.toString(), lamps: LAMPS.map(hex), resolved: resolved });
  setInterval(function () {
    emit({ fn: 'liveness', pid: Process.id, counts: JSON.parse(JSON.stringify(counts)) });
  }, 10000);
}
