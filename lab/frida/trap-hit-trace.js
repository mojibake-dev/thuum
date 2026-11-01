// trap-hit-trace.js: who damages a figure when a trap fires (thuum
// docs/verbs/traps.md, ADR-059 decision 4's Dynamic plan). On the seat that
// HOSTS Bleak Falls Temple, the plate's spike wall swings at the guest's
// figure and TrapHitBase's script hurts it; the hypothesis is the Papyrus
// path, Actor.DamageActorValue, which is ActorValueOwner::RestoreActorValue
// (kDamage, Health, -damage) on the figure's ActorValueOwner (CommonLibSSE-NG
// include/RE/A/ActorValueOwner.h:20, virtual 06), not the melee path's
// Actor::DamageActor that the fork's FridaHooks.cpp replaces for figures. The
// trace replaces slot 06 of the three ActorValueOwner vtables (Actor,
// Character, PlayerCharacter) and prints one row per Health change on the
// player or a figure (the modifier, the amount, the health before and after,
// the stack as module offsets), plus every Actor::DamageActor call naming one
// of ours, so the two paths are told apart. Expected (HYPOTHESIS): one
// RestoreActorValue(kDamage, Health, -75) on the figure per swing at a
// level-one figure (TrapSwingingWall's LvlDamage1 on TrapWallWood 0xc6440),
// inside the VM's dispatch, and no DamageActor. Run: a frida step on c1 (the
// host) before the guest steps on the plate; 1.6.1170 only.
//
// Ids are Address Library 1.6.1170's by lab/addr.py: 207515, 207890, 208044
// the ActorValueOwner vtables (the third entry of VTABLE_Actor,
// VTABLE_Character and VTABLE_PlayerCharacter, include/RE/Offsets_VTABLE.h
// :2142, :2215, :2231), 403521 the player singleton (include/RE/Offsets.h,
// face-dump.js), 37335 Actor::DamageActor (figure-dent-trace.js). Layouts are
// CommonLibSSE-NG's: the ActorValueOwner base at Actor+0xB8 on 1.6.1170
// (include/RE/A/Actor.h:729, RelocateMemberIfNewer 0xB0/0xB8), a form's id at
// +0x14 and type at +0x1A (include/RE/T/TESForm.h:354, :356), ACHR 0x3e
// (include/RE/F/FormTypes.h:202); ACTOR_VALUE_MODIFIER kPermanent 0,
// kTemporary 1, kDamage 2 (include/RE/A/ActorValues.h:180-182); Health 24
// (include/RE/A/ActorValues.h:32).
//
// Rows: {ready, version, slots, replaced, player, playerHealth} once;
// {fn: 'restoreActorValue', actor, modifier, av, value, healthBefore,
// healthAfter, frames} per Health change on ours (the first three calls on
// anyone, as a probe that the hook fires); {fn: 'damageActor', regs, frames}
// per DamageActor naming ours; {fn, err} once per failing hook.

function emit(obj) { obj.t = Date.now(); send(obj); console.log(JSON.stringify(obj)); }

const OFFSETS = {
  '1.6.1170.0': {
    actorAvOwnerVtable: 0x189e1d0, // lab/addr.py addrlib 1.6.1170 207515: VTABLE_Actor[2] (Offsets_VTABLE.h:2142)
    characterAvOwnerVtable: 0x18a5ec8, // lab/addr.py addrlib 1.6.1170 207890: VTABLE_Character[2] (Offsets_VTABLE.h:2215)
    playerAvOwnerVtable: 0x18ac358, // lab/addr.py addrlib 1.6.1170 208044: VTABLE_PlayerCharacter[2] (Offsets_VTABLE.h:2231)
    playerSingleton: 0x31874f8, // lab/addr.py addrlib 1.6.1170 403521: NiPointer<PlayerCharacter> (face-dump.js:37)
    damageActor: 0x666d20, // lab/addr.py addrlib 1.6.1170 37335: Actor::DamageActor (figure-dent-trace.js)
  },
};
const RESTORE_SLOT = 6; // include/RE/A/ActorValueOwner.h:20, virtual 06 (modifier, av, float)
const GET_ACTOR_VALUE_SLOT = 1; // include/RE/A/ActorValueOwner.h:15, virtual 01 (av) -> float
const AV_OWNER = 0xb8; // include/RE/A/Actor.h:729, the newer runtime's
const AV_HEALTH = 24; // include/RE/A/ActorValues.h:32
const MODIFIERS = ['permanent', 'temporary', 'damage']; // include/RE/A/ActorValues.h:180-182
const FORM_ID = 0x14; // include/RE/T/TESForm.h:354
const FORM_TYPE = 0x1a; // include/RE/T/TESForm.h:356
const ACHR = 0x3e; // include/RE/F/FormTypes.h:202
const PLAYER_ID = 0x14;
const FIGURE_MIN = 0xff000000;

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

function describe(p) {
  const m = Process.findModuleByAddress(p);
  return m ? m.name + '+0x' + p.sub(m.base).toString(16) : p.toString();
}

function where(context) {
  let bt;
  try { bt = Thread.backtrace(context, Backtracer.ACCURATE); } catch (e) { bt = Thread.backtrace(); }
  return bt.slice(0, 12).map(describe);
}

const failed = {};
function fail(fn, e) {
  if (failed[fn]) return;
  failed[fn] = true;
  emit({ fn: fn, err: String(e) });
}

let seq = 0;
const exe = Process.getModuleByName('SkyrimSE.exe');
const version = fileVersion(exe.path);
const at = OFFSETS[version];
if (at === undefined) {
  emit({ error: 'no offsets for this runtime', version: version });
} else {
  const inExe = function (p) { return p.compare(exe.base) >= 0 && p.compare(exe.base.add(exe.size)) < 0; };

  // an actor's id and kind, or null when p does not read as an ACHR form
  function actorInfo(p) {
    if (!readable(p)) return null;
    try {
      if (p.add(FORM_TYPE).readU8() !== ACHR) return null;
      const id = p.add(FORM_ID).readU32();
      return { id: hex(id), kind: id === PLAYER_ID ? 'player' : id >= FIGURE_MIN ? 'figure' : 'npc' };
    } catch (e) {
      return null;
    }
  }
  const ours = function (a) { return a !== null && a.kind !== 'npc'; };

  // GetActorValue through the owner's own vtable, one NativeFunction per distinct implementation
  const getters = {};
  function ownerValue(owner, av) {
    try {
      const fn = owner.readPointer().add(GET_ACTOR_VALUE_SLOT * Process.pointerSize).readPointer();
      if (!inExe(fn)) return 'vtable outside SkyrimSE.exe: ' + describe(fn);
      const key = fn.toString();
      if (!getters[key]) getters[key] = new NativeFunction(fn, 'float', ['pointer', 'int'], 'win64');
      return +getters[key](owner, av).toFixed(4);
    } catch (e) {
      return 'unreadable';
    }
  }

  // 1. slot 06 of the three ActorValueOwner vtables: what sits there, replaced once per distinct target
  const slots = {};
  const slotOf = function (name, vtable) {
    try {
      const target = exe.base.add(vtable).add(RESTORE_SLOT * Process.pointerSize).readPointer();
      slots[name] = target;
      return describe(target);
    } catch (e) {
      fail('slot:' + name, e);
      return 'unreadable';
    }
  };
  const ready = {
    ready: true,
    version: version,
    slot: RESTORE_SLOT,
    actorSlot: slotOf('actor', at.actorAvOwnerVtable),
    characterSlot: slotOf('character', at.characterAvOwnerVtable),
    playerSlot: slotOf('player', at.playerAvOwnerVtable),
  };

  let probes = 0;
  const replaced = {};
  const replaceSlot = function (target, via) {
    const key = target.toString();
    if (replaced[key]) { replaced[key].push(via); return; }
    replaced[key] = [via];
    const vias = replaced[key];
    const original = new NativeFunction(target, 'void', ['pointer', 'int', 'int', 'float'], 'win64');
    Interceptor.replace(target, new NativeCallback(function (owner, modifier, av, value) {
      let row = null;
      try {
        const actor = owner.sub(AV_OWNER);
        const info = actorInfo(actor);
        const probe = probes < 3;
        if ((av === AV_HEALTH && ours(info)) || probe) {
          if (probe) probes++;
          row = {
            fn: 'restoreActorValue',
            via: vias.join('+'),
            at: describe(target),
            seq: ++seq,
            tid: Process.getCurrentThreadId(),
            actor: info,
            modifier: MODIFIERS[modifier] || modifier,
            av: av,
            value: +value.toFixed(4),
            healthBefore: ownerValue(owner, AV_HEALTH),
            frames: where(this && this.context ? this.context : null),
          };
        }
      } catch (e) { fail('restoreActorValue', e); }
      original(owner, modifier, av, value);
      if (row !== null) {
        row.healthAfter = ownerValue(owner, AV_HEALTH);
        emit(row);
      }
    }, 'void', ['pointer', 'int', 'int', 'float'], 'win64'));
  };
  let hooks = 0;
  ['actor', 'character', 'player'].forEach(function (name) {
    if (!slots[name]) return;
    try {
      replaceSlot(slots[name], name);
      hooks++;
    } catch (e) { fail('replace:' + name, e); }
  });
  ready.replaced = Object.keys(replaced).map(function (k) { return { at: describe(ptr(k)), via: replaced[k].join('+') }; });

  // 2. Actor::DamageActor 37335: the melee path, which the trap's hit should never take; the four
  //    integer argument registers raw, each decoded when it reads as an actor
  try {
    Interceptor.attach(exe.base.add(at.damageActor), {
      onEnter(args) {
        this.row = null;
        try {
          const regs = [args[0], args[1], args[2], args[3]];
          const decoded = regs.map(actorInfo);
          if (!decoded.some(ours)) return;
          this.row = {
            fn: 'damageActor',
            seq: ++seq,
            tid: Process.getCurrentThreadId(),
            regs: regs.map(function (r) { return r.toString(); }),
            actors: decoded,
            frames: where(this.context),
          };
        } catch (e) { fail('damageActor', e); }
      },
      onLeave(retval) {
        if (this.row !== null) {
          this.row.ret = retval.toString();
          emit(this.row);
        }
      },
    });
    hooks++;
  } catch (e) { fail('attach:damageActor', e); }

  try {
    const player = exe.base.add(at.playerSingleton).readPointer();
    ready.player = actorInfo(player);
    ready.playerHealth = player.isNull() ? null : ownerValue(player.add(AV_OWNER), AV_HEALTH);
  } catch (e) { ready.player = 'unreadable: ' + e; }
  ready.hooks = hooks;
  emit(ready);
}
