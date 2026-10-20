// figure-dent-trace.js: the local dent, for thuum docs/verbs/figure-values.md
// (docs/research/train-29-rows.md row 3). In x-figure-values-hit
// 20261019-214505 the hitting player's own sword moved the FIGURE's bar in
// the hitter's game (100 to 93.83 one sample before the hit record, while
// the server's number was 6.496) although the fork's FigureHealthDamage
// guard (skyrim-platform Hooks.cpp:222-242 on origin/parity: Character's
// vfunc 0x104, drop the call when the victim's form id is dynamic and its
// kAttackDamageMult reads 0) was in the tested dist. Two hypotheses, both
// HYPOTHESIS: (H-a) the vfunc is a notification after the number lands
// (ADR-037's own caveat, docs/DECISIONS.md:1388-1391; Skyrim Together gates
// Actor::DamageActor 37335 one call earlier, docs/TE-MAP.md:62); (H-b) the
// figure test fails at the hit (the value not 0 as read, or the figure's
// class not reaching that slot). Run on the HITTER's seat (c1 in the probe).
//
// Stations, each row with seq (emit order), tid and the caller's frames:
// - handleHealthDamage: the function in slot 0x104 of VTABLE_Character[0]
//   and of VTABLE_PlayerCharacter[0], REPLACED (Interceptor.replace with a
//   NativeCallback of the header's signature, (Actor* this, Actor* attacker,
//   float damage): CommonLibSSE-NG include/RE/A/Actor.h:458) so the float
//   damage is read as the ABI passes it (an attach's context has no XMM
//   registers). Rows carry the victim, the attacker, the damage, the
//   victim's Health BEFORE and AFTER the call through its own
//   ActorValueOwner, its kAttackDamageMult (the guard's test), which slot's
//   function ran (via), and inner: how many nested handleHealthDamage calls
//   ran inside it (the fork's thunk calling the engine's function). When the
//   slot holds the fork's thunk, the ready row says so (slot module
//   SkyrimPlatformImpl.dll); the engine's own function behind it is reached
//   through slot 0x104 of VTABLE_Actor[0] when a class does not override it
//   (HYPOTHESIS, the ready row says whether the three slots differ).
// - damageActor: Actor::DamageActor 37335, the gate Skyrim Together uses
//   (docs/TE-MAP.md:62; its semantics docs/research/m3/te-npcs.md:208-217).
//   Its parameters are not in CommonLibSSE-NG nor in a thuum reading, so the
//   row carries the four integer argument registers raw, each decoded as an
//   actor when it reads as one (form type ACHR), and this's Health before
//   and after, plus the return.
// - explosionPass: 43849, the explosion's own pass that deals an EXPL's
//   DATA damage through 37335 (docs/DECISIONS.md:1365-1368, ADR-037;
//   docs/research/apocalypse/target-location.md:99-100), raw arguments and
//   frames, capped: the explosion counterpart of the row's sword hit.
// Rows are kept when the victim or the attacker is the player (0x14) or a
// figure (a dynamic ACHR, id at or above 0xFF000000); NPC on NPC is skipped.
//
// What to look for. The hit's rows in seq order: if damageActor's entry
// shows the figure's Health whole and its leave shows it dented while the
// handleHealthDamage row nested inside it (or after it) already shows
// healthBefore dented, the vfunc is a notification after the write (H-a) and
// the hook belongs at 37335. If handleHealthDamage shows healthBefore whole
// and healthAfter dented with via the fork's thunk, inner 1 and
// attackDamageMult 0, the thunk passed the call it should have dropped; with
// attackDamageMult not 0, the mark is loose (H-b); with no handleHealthDamage
// row for the figure at all, the figure's class does not reach that slot. A
// dent with no damageActor row means the sword's path bypasses 37335.
//
// Ids, all for 1.6.1170, RVAs by lab/addr.py from addrlib/ (hard rule 1), the
// id's source beside each. Layouts are CommonLibSSE-NG's, cited per constant.
// Run: a scenario's `frida {script: figure-dent-trace.js}` step on the
// hitter (after that client's console steps, lab/frida/README.md), or
// `just frida figure-dent-trace.js c1` while the game runs. 1.6.1170 only.
'use strict';
function emit(obj) { obj.t = Date.now(); send(obj); console.log(JSON.stringify(obj)); }

const OFFSETS = {
  '1.6.1170.0': {
    characterVtable: 0x18a5558, // lab/addr.py addrlib 1.6.1170 207886: VTABLE_Character[0] (include/RE/Offsets_VTABLE.h:2215; Hooks.cpp:239)
    playerVtable: 0x18ab9c0, // lab/addr.py addrlib 1.6.1170 208040: VTABLE_PlayerCharacter[0] (include/RE/Offsets_VTABLE.h:2231; Hooks.cpp:203)
    actorVtable: 0x189d870, // lab/addr.py addrlib 1.6.1170 207511: VTABLE_Actor[0] (include/RE/Offsets_VTABLE.h:2142)
    damageActor: 0x666d20, // lab/addr.py addrlib 1.6.1170 37335: Actor::DamageActor (docs/TE-MAP.md:62; train-29-rows.md row 3)
    explosionPass: 0x7d12d0, // lab/addr.py addrlib 1.6.1170 43849: the explosion's pass (docs/DECISIONS.md:1366; target-location.md:99)
    playerSingleton: 0x31874f8, // lab/addr.py addrlib 1.6.1170 403521: NiPointer<PlayerCharacter> (include/RE/Offsets.h:451; face-dump.js:37)
  },
};
// Actor::HandleHealthDamage's slot: include/RE/A/Actor.h:458 numbers it 104; the fork writes it
// with write_vfunc(0x104) on both vtables (Hooks.cpp:205, :241)
const SLOT = 0x104;
// the ActorValueOwner base inside an Actor on 1.6.1170: include/RE/A/Actor.h:127 "0B0, 0B8",
// AsActorValueOwner :729 RelocateMemberIfNewer(RUNTIME_SSE_1_6_629, this, 0xB0, 0xB8): the newer
const AV_OWNER = 0xb8;
const GET_ACTOR_VALUE_SLOT = 1; // include/RE/A/ActorValueOwner.h:15, virtual 01 (ActorValue) -> float
const AV_HEALTH = 24; // include/RE/A/ActorValues.h:32
const AV_ATTACK_DAMAGE_MULT = 154; // include/RE/A/ActorValues.h:162 (the guard's test, Hooks.cpp:228)
const FORM_ID = 0x14; // include/RE/T/TESForm.h:354
const FORM_TYPE = 0x1a; // include/RE/T/TESForm.h:356
const ACHR = 0x3e; // include/RE/F/FormTypes.h:202 (Actor, Character, PlayerCharacter)
const PLAYER_ID = 0x14;
const FIGURE_MIN = 0xff000000; // a dynamic form: a figure in this game (Hooks.cpp:225)

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

function hex(n) { return '0x' + (n >>> 0).toString(16); }

function readable(p) {
  if (p.isNull()) return false;
  const r = Process.findRangeByAddress(p);
  return r !== null && r.protection.indexOf('r') === 0;
}

// module+offset for a code pointer
function describe(p) {
  const m = Process.findModuleByAddress(p);
  return m ? m.name + '+0x' + p.sub(m.base).toString(16) : p.toString();
}

function where(context) {
  let bt;
  try { bt = Thread.backtrace(context, Backtracer.ACCURATE); } catch (e) { bt = Thread.backtrace(); }
  return bt.slice(0, 12).map(describe);
}

// one {fn, err} per hook, the first failure's
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

  // GetActorValue through the actor's own ActorValueOwner vtable, one NativeFunction per distinct implementation
  const getters = {};
  function actorValue(actor, av) {
    try {
      const owner = actor.add(AV_OWNER);
      const fn = owner.readPointer().add(GET_ACTOR_VALUE_SLOT * Process.pointerSize).readPointer();
      if (!inExe(fn)) return 'vtable outside SkyrimSE.exe: ' + describe(fn);
      const key = fn.toString();
      if (!getters[key]) getters[key] = new NativeFunction(fn, 'float', ['pointer', 'int'], 'win64');
      return +getters[key](owner, av).toFixed(4);
    } catch (e) {
      return 'unreadable';
    }
  }
  const health = function (actor) { return actorValue(actor, AV_HEALTH); };

  // 1. slot 0x104 of the three vtables: what sits there, replaced once per distinct target
  const slots = {};
  const slotOf = function (name, vtable) {
    try {
      const target = exe.base.add(vtable).add(SLOT * Process.pointerSize).readPointer();
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
    slot: SLOT,
    characterSlot: slotOf('character', at.characterVtable),
    playerSlot: slotOf('player', at.playerVtable),
    actorSlot: slotOf('actor', at.actorVtable),
  };

  // per thread, the count of handleHealthDamage entries so a row can say how many ran nested inside it
  const entered = {};
  const replaced = {};
  const replaceSlot = function (target, via) {
    const key = target.toString();
    if (replaced[key]) { replaced[key].push(via); return; }
    replaced[key] = [via];
    const vias = replaced[key];
    const original = new NativeFunction(target, 'void', ['pointer', 'pointer', 'float'], 'win64');
    Interceptor.replace(target, new NativeCallback(function (self, attacker, damage) {
      const tid = Process.getCurrentThreadId();
      entered[tid] = (entered[tid] || 0) + 1;
      const innerBefore = entered[tid];
      let row = null;
      try {
        const v = actorInfo(self);
        const a = actorInfo(attacker);
        if (ours(v) || ours(a)) {
          row = {
            fn: 'handleHealthDamage',
            via: vias.join('+'),
            at: describe(target),
            seq: ++seq,
            tid: tid,
            victim: v,
            attacker: a,
            damage: +damage.toFixed(4),
            healthBefore: health(self),
            attackDamageMult: actorValue(self, AV_ATTACK_DAMAGE_MULT),
            frames: where(this && this.context ? this.context : null),
          };
        }
      } catch (e) { fail('handleHealthDamage', e); }
      original(self, attacker, damage);
      if (row !== null) {
        row.healthAfter = health(self);
        row.inner = entered[tid] - innerBefore;
        emit(row);
      }
    }, 'void', ['pointer', 'pointer', 'float'], 'win64'));
  };
  let hooks = 0;
  ['character', 'player', 'actor'].forEach(function (name) {
    if (!slots[name]) return;
    try {
      replaceSlot(slots[name], name);
      hooks++;
    } catch (e) { fail('replace:' + name, e); }
  });
  ready.replaced = Object.keys(replaced).map(function (k) { return { at: describe(ptr(k)), via: replaced[k].join('+') }; });

  // 2. Actor::DamageActor 37335: parameters unsourced, so the four integer argument registers raw
  //    (each decoded when it reads as an actor), this's Health before and after, the return
  let damageProbes = 0;
  Interceptor.attach(exe.base.add(at.damageActor), {
    onEnter(args) {
      this.row = null;
      try {
        const regs = [args[0], args[1], args[2], args[3]];
        const decoded = regs.map(actorInfo);
        const probe = damageProbes < 3;
        if (!decoded.some(ours) && !probe) return;
        if (probe) damageProbes++;
        this.self = args[0];
        this.row = {
          fn: 'damageActor',
          seq: ++seq,
          tid: this.threadId,
          probe: probe && !decoded.some(ours),
          args: regs.map(function (r) { return r.toString(); }),
          actors: decoded,
          healthBefore: decoded[0] !== null ? health(args[0]) : null,
          frames: where(this.context),
        };
      } catch (e) { fail('damageActor', e); }
    },
    onLeave(retval) {
      if (this.row === null) return;
      this.row.healthAfter = this.row.healthBefore !== null ? health(this.self) : null;
      this.row.ret = retval.toString();
      emit(this.row);
    },
  });
  hooks++;

  // 3. the explosion's pass 43849: raw arguments and frames, the first 40 calls
  let explosionRows = 0;
  Interceptor.attach(exe.base.add(at.explosionPass), {
    onEnter(args) {
      if (explosionRows >= 40) return;
      explosionRows++;
      try {
        const regs = [args[0], args[1], args[2], args[3]];
        emit({ fn: 'explosionPass', seq: ++seq, tid: this.threadId, args: regs.map(function (r) { return r.toString(); }),
               actors: regs.map(actorInfo), frames: where(this.context) });
      } catch (e) { fail('explosionPass', e); }
    },
  });
  hooks++;

  // the layout check: the player's own Health through the same path the rows use
  try {
    const player = exe.base.add(at.playerSingleton).readPointer();
    ready.player = actorInfo(player);
    ready.playerHealth = player.isNull() ? null : health(player);
    ready.playerAttackDamageMult = player.isNull() ? null : actorValue(player, AV_ATTACK_DAMAGE_MULT);
  } catch (e) { ready.player = 'unreadable: ' + e; }
  ready.hooks = hooks;
  emit(ready);
}
