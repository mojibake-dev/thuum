// effect-stack-trace.js: whether two streams of one spell from one caster
// both work on one target, traced in the caster's game, for thuum
// docs/verbs/spell-cast.md (the dual-cast HYPOTHESIS). CommonLibSSE-NG
// b93280e8 gives the shape:
// - ValueModifierEffect (include/RE/V/ValueModifierEffect.h) overrides
//   Update (vfunc 0x04, :16) and declares ModifyActorValue (vfunc 0x20,
//   :36: Actor*, float, ActorValue). Its
//   GetAllowMultipleCastingSourceStacking (0x11, :18) is annotated
//   { return 1; }, ActiveEffect's (A/ActiveEffect.h:79) { return 0; }: a
//   value modifier from each hand would stack. Flames'
//   damage (MGEF 0x13CA9) is a Value Modifier on Health (lab/esm.py).
// - ActiveEffect's members (A/ActiveEffect.h:102-115): spell 0x40, target
//   0x50 (a MagicTarget*), magnitude 0x78, castingSource 0x88
//   (M/MagicSystem.h:23: 0 left, 1 right, 2 other, 3 instant).
// - An Actor's MagicTarget at +0xA0 on 1.6.1170, MEASURED by this script
//   (x-dual-cast3 20261013-082306: the target field less ModifyActorValue's
//   own Actor* = 160); A/Actor.h:126's comment reads "098, 0A0", and +0x98
//   read garbage in x-dual-stack. A form's id at +0x14 (T/TESForm.h:354).
//   The script still checks the offset against ModifyActorValue's Actor*.
// The vtable is VTABLE_ValueModifierEffect (Offsets_VTABLE.h:1953, Address
// Library 206143), resolved with lab/addr.py for 1.6.1170 on 2026-10-12.
// Logged, for one spell only (LAB_PARAMS.SPELL, Flames 0x12FCD by
// default): each effect object the first time it updates (hand, target,
// magnitude), and every 500 ms the effects that updated in that window with
// their Update and ModifyActorValue counts. Two objects on one target, hands
// 0 and 1, both modifying through the same windows: both streams count.
// Run: a scenario's `frida {script: effect-stack-trace.js}` step, or
// `just frida effect-stack-trace.js c1` while the game runs.
'use strict';
const PARAMS = globalThis.LAB_PARAMS || {};
const SPELL = Number(PARAMS.SPELL || 0x12fcd) >>> 0;
const WINDOW_MS = 500;
const MAGIC_TARGET_IN_ACTOR = 0xa0;

function emit(obj) { obj.t = Date.now(); send(obj); console.log(JSON.stringify(obj)); }

const OFFSETS = {
  '1.6.1170.0': {
    valueModifierVtable: 0x18825b8, // 206143
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
  // VS_FIXEDFILEINFO: dwSignature, dwStrucVersion, dwFileVersionMS, dwFileVersionLS
  const ffi = out.readPointer();
  const ms = ffi.add(8).readU32();
  const ls = ffi.add(12).readU32();
  return [ms >>> 16, ms & 0xffff, ls >>> 16, ls & 0xffff].join('.');
}

function formId(form) {
  try {
    return form.isNull() ? 0 : form.add(0x14).readU32();
  } catch (e) {
    return -1;
  }
}

function hex(n) { return (n >>> 0).toString(16); }

// the effect's spell, hand, target and magnitude, or null for another spell
function describe(effect) {
  try {
    if (formId(effect.add(0x40).readPointer()) !== SPELL) return null;
    const magicTarget = effect.add(0x50).readPointer();
    return {
      hand: effect.add(0x88).readU32(),
      target: magicTarget.isNull() ? 0 : formId(magicTarget.sub(MAGIC_TARGET_IN_ACTOR)),
      magnitude: effect.add(0x78).readFloat(),
    };
  } catch (e) {
    return null;
  }
}

const exe = Process.getModuleByName('SkyrimSE.exe');
const version = fileVersion(exe.path);
const at = OFFSETS[version];
if (at === undefined) {
  emit({ error: 'no offsets for this runtime', version: version });
} else {
  const vtable = exe.base.add(at.valueModifierVtable);
  const update = vtable.add(0x04 * Process.pointerSize).readPointer();
  const modify = vtable.add(0x20 * Process.pointerSize).readPointer();
  // an effect's address is reused after it ends, so every call describes
  // it again, and an entry is the address with the hand and target it had
  const known = new Set();
  let window = new Map(); // entry -> {hand, target, updates, modifies}
  let checked = false;

  const count = (effect, field) => {
    const d = describe(effect);
    if (d === null) return null;
    const key = effect.toString() + '/' + d.hand + '/' + hex(d.target);
    if (!known.has(key)) {
      known.add(key);
      emit({ effect: effect.toString(), hand: d.hand, target: hex(d.target), magnitude: d.magnitude, first: field });
    }
    const w = window.get(key) || { effect: effect.toString(), hand: d.hand, target: hex(d.target), updates: 0, modifies: 0 };
    w[field] += 1;
    window.set(key, w);
    return d;
  };

  Interceptor.attach(update, {
    onEnter(args) { count(args[0], 'updates'); },
  });
  Interceptor.attach(modify, {
    onEnter(args) {
      const d = count(args[0], 'modifies');
      if (d !== null && !checked) {
        checked = true;
        // the target's MagicTarget less this call's own Actor: where the
        // MagicTarget sits in an Actor on this runtime (x-dual-stack's check
        // failed at 0x98)
        let measured = null;
        try {
          measured = args[0].add(0x50).readPointer().sub(args[1]).toInt32();
        } catch (e) {
          measured = null;
        }
        emit({ offsetCheck: formId(args[1]) === d.target, actor: hex(formId(args[1])), fromTarget: hex(d.target), magicTargetInActor: measured, av: args[3].toInt32() });
      }
    },
  });
  setInterval(() => {
    if (window.size === 0) return;
    const effects = Array.from(window.values());
    window = new Map();
    emit({ windowMs: WINDOW_MS, effects: effects });
  }, WINDOW_MS);
  emit({ attached: true, version: version, spell: hex(SPELL), update: update.sub(exe.base).toString(), modify: modify.sub(exe.base).toString() });
}
