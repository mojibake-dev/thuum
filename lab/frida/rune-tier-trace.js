// rune-tier-trace.js: the rune glyph undressed on the observer, for thuum
// docs/verbs/spell-cast.md (the target-location section after playtest
// twenty-four, :1325-1343 and the Dynamic plan :1354-1372;
// docs/research/train-29-rows.md row 5). In x-rune-visible 20261019-215211
// the figure's Frost Rune stood armed at the relayed point in the observer's
// game for 67 s and tripped on the observer's walk, yet no glyph was drawn.
// The re-analyst's REA read (HYPOTHESIS until this trace): the one player
// test in a landed rune's look is the impact-effects pass 44213, once per
// landing (bit 20), where `shooter handle == *(403520)` picks the effect
// quality tier (0 or 4 for the player, 0xC for anyone else, `| 3` far from
// the camera) and the ground decal and the particles come from; nothing
// shooter-conditioned removes a figure's rune (the registration 40674 behind
// its gate 43934, `shooter == *(401069)`, registers the player's runes
// alone). Run on the OBSERVER's seat (c2 in the probe).
//
// Stations, each row with fn, seq (emit order) and the projectile's summary
// (proj: its form id, type, shooter: the shooter's form id resolved from its
// handle, with kind player, figure or npc, loc, parentCell, explosion, spell,
// livingTime, explosionTimer, flags):
// - launch: Projectile::Launch 44108 for a player's or a figure's shooter,
//   the LaunchData's base, spell, origin and cell, and at the leave the new
//   projectile's handle resolved to its form id: the rune to follow.
// - impactEffects: 44213 at the entry and the leave as one row: the shooter
//   handle raw, the handle at *(403520) raw, equal (the compare the read
//   names), tierByDoc (what the read says that compare grants: not measured),
//   bit20 before and after, the second to fourth argument registers raw, the
//   return and the caller's frames. Once per landing is the expectation.
// - triggerTick 44216 and triggerTest 44217, grenades (PGRE) alone: the
//   tick's first call per projectile with its parentCell and explosion
//   pointers (the early returns the read names), then every sixtieth call
//   with the timers; the test's first call and every call that returns true.
// - arrival 44163 and init3D 44222 (the model path, next if the tier is not
//   the cause), once per projectile; settle 43919, each call (once expected).
// - kill 44110 with a backtrace, each call: who ends a rune, if anything does.
// - addRune 40674 and runeGate 43934: each call, the arguments decoded as
//   forms, *(401069) raw and whether it is the player's actor pointer and
//   whether the shooter's resolved reference is it.
// Each hook assumes `this` (the first argument register) is the Projectile,
// as a member function's is; the row's type byte (PGRE 0x41 for a rune) shows
// a wrong assumption, and the first three calls of every hook are emitted as
// probe rows whatever the check says. The ready row self-tests the layout:
// the player singleton's form id (0x14), *(403520) resolved through
// LookupReferenceByHandle (0x14 when it is the player's handle, as the read
// says) and *(401069) against the player's pointer.
//
// What to look for. For the figure's rune (shooter kind figure): one
// impactEffects row at the landing with equal false, so tierByDoc 0xC,
// against the player's own rune's row with equal true; the tick rows'
// parentCell and explosion non-null; arrival and settle once, no kill while
// it stands; at the walk, a triggerTest true, the timer near 0.1 and one
// kill from the tick's frames. If the figure's row shows equal false and the
// glyph is still missing with everything else alike, the tier is the cause
// and the hook shape is spell-cast.md's (a tier override for dynamic-form
// shooters, filtered in native, plus a per-figure rune cap); if 44213 never
// runs for the figure's rune, the landing's look is skipped earlier; if
// init3D differs between the two runes, the model path is next.
//
// Ids, all for 1.6.1170, RVAs by lab/addr.py from addrlib/ (hard rule 1), the
// id's source beside each. Layouts are CommonLibSSE-NG's, cited per constant;
// the PROJECTILE_RUNTIME_DATA comments are the pre-1.6.629 layout's absolute
// offsets and the struct starts at 0xA0 on this runtime (Projectile.h:293),
// so each field shifts by 8 (face-dump.js:45-50). Resolving a handle keeps
// one extra reference count per distinct handle (face-dump.js:15-17); the
// script caches them, so a run leaks a handful. Run: a scenario's `frida
// {script: rune-tier-trace.js}` step on the observer (after that client's
// console steps, lab/frida/README.md), or `just frida rune-tier-trace.js c2`
// while the game runs. 1.6.1170 only.
'use strict';
function emit(obj) { obj.t = Date.now(); send(obj); console.log(JSON.stringify(obj)); }

const OFFSETS = {
  '1.6.1170.0': {
    launch: 0x7e46c0, // lab/addr.py addrlib 1.6.1170 44108: Projectile::Launch (fork game/Offsets.h ProjectileLaunch; CommonLibSSE-NG src/RE/P/Projectile.cpp:258)
    impactEffects: 0x7ecd80, // lab/addr.py addrlib 1.6.1170 44213: the impact-effects pass (spell-cast.md:1332; train-29-rows.md row 5)
    triggerTick: 0x7ed8b0, // lab/addr.py addrlib 1.6.1170 44216: the rune trigger tick (spell-cast.md:1370; row 5)
    triggerTest: 0x7edef0, // lab/addr.py addrlib 1.6.1170 44217: the trigger test (spell-cast.md:1370; row 5)
    arrival: 0x7e81f0, // lab/addr.py addrlib 1.6.1170 44163: the arrival (spell-cast.md:1370)
    kill: 0x7e5130, // lab/addr.py addrlib 1.6.1170 44110: the projectile kill (spell-cast.md:1371; README.md mps-trace.js)
    settle: 0x7d7700, // lab/addr.py addrlib 1.6.1170 43919: the settle (spell-cast.md:1371; row 5)
    init3D: 0x7ee3e0, // lab/addr.py addrlib 1.6.1170 44222: Init3D, the model path (spell-cast.md's Dynamic plan; README.md mps-trace.js)
    addRune: 0x7489e0, // lab/addr.py addrlib 1.6.1170 40674: the rune registration (spell-cast.md:1327; row 5)
    runeGate: 0x7d7c40, // lab/addr.py addrlib 1.6.1170 43934: the registration's gate (row 5)
    playerHandle: 0x31874f4, // lab/addr.py addrlib 1.6.1170 403520: a RefHandle (CommonLibSSE-NG src/RE/B/BarterMenu.cpp:7), the tier test's compare target (spell-cast.md:1332; row 5)
    runeGateRef: 0x3137698, // lab/addr.py addrlib 1.6.1170 401069: the gate's compare target (row 5); not in CommonLibSSE-NG, logged raw
    playerSingleton: 0x31874f8, // lab/addr.py addrlib 1.6.1170 403521: NiPointer<PlayerCharacter> (include/RE/Offsets.h:451; face-dump.js:37)
    lookupRef: 0x179710, // lab/addr.py addrlib 1.6.1170 12332: LookupReferenceByHandle(const RefHandle&, NiPointer<TESObjectREFR>&) (include/RE/Offsets.h:582; include/RE/M/Misc.h:25)
  },
};
const FORM_ID = 0x14; // include/RE/T/TESForm.h:354
const FORM_TYPE = 0x1a; // include/RE/T/TESForm.h:356
const TYPE = {
  ACHR: 0x3e, // include/RE/F/FormTypes.h:202
  PGRE: 0x41, // include/RE/F/FormTypes.h:205 (GrenadeProjectile: a rune)
  PROJ_LO: 0x3f, // include/RE/F/FormTypes.h:203 PMIS ...
  PROJ_HI: 0x45, // ... :209 PBAR, the placed projectile references
};
// TESObjectREFR: OBJ_REFR data at 0x40 (include/RE/T/TESObjectREFR.h:495) with objectReference at +0
// (:77) and location at +0x14 (:79); parentCell at 0x60 (:496)
const REF = { base: 0x40, location: 0x54, parentCell: 0x60 };
// PROJECTILE_RUNTIME_DATA on 1.6.1170: RelocateMemberIfNewer(RUNTIME_SSE_1_6_629, this, 0x98, 0xA0)
// (include/RE/P/Projectile.h:293), the field comments being the 0x98 layout's
function rt(comment) { return 0xa0 + (comment - 0x98); }
const PROJ = {
  shooter: rt(0x120), // ObjectRefHandle shooter (Projectile.h:254)
  explosion: rt(0x150), // BGSExplosion* explosion (:260)
  spell: rt(0x158), // MagicItem* spell (:261)
  livingTime: rt(0x194), // float livingTime (:271)
  explosionTimer: rt(0x1a0), // float explosionTimer (:274)
  flags: rt(0x1cc), // std::uint32_t flags (:283)
};
// Projectile::LaunchData (include/RE/P/Projectile.h:81-95)
const LD = { origin: 0x08, projectileBase: 0x20, shooter: 0x28, parentCell: 0x68, spell: 0x70 };
const PLAYER_ID = 0x14;
const FIGURE_MIN = 0xff000000;
const BIT20 = 1 << 20;
const MAX_EMITS = 6000;

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

// a form's id and type, or null when p does not read as one
function form(p) {
  if (!readable(p)) return null;
  try {
    return { id: hex(p.add(FORM_ID).readU32()), type: p.add(FORM_TYPE).readU8() };
  } catch (e) {
    return null;
  }
}
function formId(p) {
  try { return p.isNull() ? 0 : hex(p.add(FORM_ID).readU32()); } catch (e) { return 'unreadable'; }
}
function kindOf(id) { return id === PLAYER_ID ? 'player' : id >= FIGURE_MIN ? 'figure' : 'npc'; }
const isProjectile = function (f) { return f !== null && f.type >= TYPE.PROJ_LO && f.type <= TYPE.PROJ_HI; };

function describe(p) {
  const m = Process.findModuleByAddress(p);
  return m ? m.name + '+0x' + p.sub(m.base).toString(16) : p.toString();
}
function where(context, n) {
  return Thread.backtrace(context, Backtracer.ACCURATE).slice(0, n || 10).map(describe);
}

// one {fn, err} per hook, the first failure's
const failed = {};
function fail(fn, e) {
  if (failed[fn]) return;
  failed[fn] = true;
  emit({ fn: fn, err: String(e) });
}

let seq = 0;
let emits = 0;
function row(obj) {
  if (emits >= MAX_EMITS) return;
  emits++;
  obj.seq = ++seq;
  emit(obj);
  if (emits === MAX_EMITS) emit({ capped: MAX_EMITS });
}

const exe = Process.getModuleByName('SkyrimSE.exe');
const version = fileVersion(exe.path);
const at = OFFSETS[version];
if (at === undefined) {
  emit({ error: 'no offsets for this runtime', version: version });
} else {
  // a handle to its reference, once per distinct handle value (the lookup keeps a reference count)
  const lookup = new NativeFunction(exe.base.add(at.lookupRef), 'bool', ['pointer', 'pointer'], 'win64');
  const handles = {};
  function resolve(handle) {
    const key = handle >>> 0;
    if (handles[key] !== undefined) return handles[key];
    let out = { handle: hex(key), id: null, kind: null, ref: null };
    try {
      const h = Memory.alloc(4);
      const ref = Memory.alloc(8);
      h.writeU32(key);
      ref.writePointer(ptr(0));
      if (key !== 0 && lookup(h, ref)) {
        const p = ref.readPointer();
        if (!p.isNull()) {
          const id = p.add(FORM_ID).readU32();
          out = { handle: hex(key), id: hex(id), kind: kindOf(id), ref: p.toString() };
        }
      }
    } catch (e) { out.err = String(e); }
    handles[key] = out;
    return out;
  }
  const playerHandleNow = function () { try { return exe.base.add(at.playerHandle).readU32(); } catch (e) { return -1; } };

  // the projectile's summary, read from the reference; shooter from its handle
  function summary(p, f) {
    const s = { proj: f.id, type: f.type };
    try {
      const shooter = resolve(p.add(PROJ.shooter).readU32());
      s.shooter = shooter.id;
      s.shooterKind = shooter.kind;
      s.shooterHandle = shooter.handle;
      s.base = formId(p.add(REF.base).readPointer());
      s.loc = [p.add(REF.location).readFloat(), p.add(REF.location + 4).readFloat(), p.add(REF.location + 8).readFloat()].map(function (v) { return +v.toFixed(1); });
      s.parentCell = p.add(REF.parentCell).readPointer().isNull() ? null : formId(p.add(REF.parentCell).readPointer());
      s.explosion = formId(p.add(PROJ.explosion).readPointer());
      s.spell = formId(p.add(PROJ.spell).readPointer());
      s.livingTime = +p.add(PROJ.livingTime).readFloat().toFixed(3);
      s.explosionTimer = +p.add(PROJ.explosionTimer).readFloat().toFixed(3);
      s.flags = hex(p.add(PROJ.flags).readU32());
    } catch (e) { s.err = String(e); }
    return s;
  }
  const oursShooter = function (s) { return s.shooterKind === 'player' || s.shooterKind === 'figure'; };

  // per hook, the first three calls are emitted as probes whatever the filter says; per projectile, the calls seen
  const probes = {};
  const seen = {};
  function probe(fn, args, context) {
    probes[fn] = (probes[fn] || 0) + 1;
    if (probes[fn] > 3) return false;
    row({ fn: fn, probe: true, a0: form(args[0]), a1: form(args[1]), a2: form(args[2]), a3: form(args[3]),
          args: [args[0], args[1], args[2], args[3]].map(function (a) { return a.toString(); }), frames: where(context, 6) });
    return true;
  }
  function state(p) {
    const key = p.toString();
    if (!seen[key]) seen[key] = { tick: 0, test: 0, arrival: 0, init3D: 0, settle: 0, impact: 0 };
    return seen[key];
  }
  // this as a projectile of the wanted types (PGRE alone when grenadesOnly) and a shooter of ours, else null
  function thisProjectile(fn, args, context, grenadesOnly) {
    const f = form(args[0]);
    const ok = isProjectile(f) && (!grenadesOnly || f.type === TYPE.PGRE);
    if (!ok) { probe(fn, args, context); return null; }
    const s = summary(args[0], f);
    if (!oursShooter(s)) { probe(fn, args, context); return null; }
    return s;
  }

  let hooks = 0;
  const hook = function (name, callbacks) { Interceptor.attach(exe.base.add(at[name]), callbacks); hooks++; };

  // 1. the launch: LaunchData in args[1]; the new handle through the returned pointer
  hook('launch', {
    onEnter(args) {
      this.fields = null;
      try {
        const ld = args[1];
        const shooter = form(ld.add(LD.shooter).readPointer());
        if (shooter === null || kindOf(parseInt(shooter.id, 16)) === 'npc') return;
        this.fields = {
          fn: 'launch',
          shooter: shooter.id,
          shooterKind: kindOf(parseInt(shooter.id, 16)),
          base: formId(ld.add(LD.projectileBase).readPointer()),
          spell: formId(ld.add(LD.spell).readPointer()),
          origin: [ld.add(LD.origin).readFloat(), ld.add(LD.origin + 4).readFloat(), ld.add(LD.origin + 8).readFloat()].map(function (v) { return +v.toFixed(1); }),
          parentCell: formId(ld.add(LD.parentCell).readPointer()),
          tid: this.threadId,
          frames: where(this.context, 6),
        };
      } catch (e) { fail('launch', e); }
    },
    onLeave(retval) {
      if (this.fields === null) return;
      try {
        if (readable(retval)) {
          const r = resolve(retval.readU32());
          this.fields.handle = r.handle;
          this.fields.projectile = r.id;
        } else {
          this.fields.handle = 'unreadable';
        }
      } catch (e) { this.fields.handle = 'unreadable: ' + e; }
      row(this.fields);
    },
  });

  // 2. the impact-effects pass: the tier test's compare, read beside the engine's
  hook('impactEffects', {
    onEnter(args) {
      this.r = null;
      try {
        const s = thisProjectile('impactEffects', args, this.context, false);
        if (s === null) return;
        const st = state(args[0]);
        st.impact++;
        const ph = playerHandleNow();
        const sh = parseInt(s.shooterHandle, 16);
        this.p = args[0];
        this.r = {
          fn: 'impactEffects',
          proj: s,
          call: st.impact,
          handleAt403520: hex(ph),
          equal: ph === sh,
          tierByDoc: ph === sh ? '0 or 4 (the player), | 3 far from the camera' : '0xC (anyone else), | 3 far from the camera',
          bit20In: (parseInt(s.flags, 16) & BIT20) !== 0,
          a1: args[1].toString(),
          a2: args[2].toString(),
          a3: args[3].toString(),
          tid: this.threadId,
          frames: where(this.context, 8),
        };
      } catch (e) { fail('impactEffects', e); }
    },
    onLeave(retval) {
      if (this.r === null) return;
      try {
        this.r.ret = retval.toString();
        this.r.bit20Out = (this.p.add(PROJ.flags).readU32() & BIT20) !== 0;
        this.r.flagsOut = hex(this.p.add(PROJ.flags).readU32());
      } catch (e) { this.r.ret = 'unreadable: ' + e; }
      row(this.r);
    },
  });

  // 3. the trigger tick and its test, grenades alone
  hook('triggerTick', {
    onEnter(args) {
      this.r = null;
      try {
        const s = thisProjectile('triggerTick', args, this.context, true);
        if (s === null) return;
        const st = state(args[0]);
        st.tick++;
        st.last = { livingTime: s.livingTime, explosionTimer: s.explosionTimer, flags: s.flags };
        if (st.tick !== 1 && st.tick % 60 !== 0) return;
        this.r = { fn: 'triggerTick', proj: s, call: st.tick, tid: this.threadId };
        if (st.tick === 1) this.r.frames = where(this.context, 6);
      } catch (e) { fail('triggerTick', e); }
    },
    onLeave(retval) {
      if (this.r === null) return;
      this.r.ret = retval.toString();
      row(this.r);
    },
  });
  hook('triggerTest', {
    onEnter(args) {
      this.s = null;
      try {
        const s = thisProjectile('triggerTest', args, this.context, true);
        if (s === null) return;
        const st = state(args[0]);
        st.test++;
        this.s = s;
        this.call = st.test;
      } catch (e) { fail('triggerTest', e); }
    },
    onLeave(retval) {
      if (this.s === null) return;
      const r = retval.toInt32() & 0xff;
      if (this.call !== 1 && r === 0) return;
      row({ fn: 'triggerTest', proj: this.s, call: this.call, ret: r, tid: this.threadId });
    },
  });

  // 4. once per projectile: the arrival and the model path; the settle each call
  const oncePer = function (fn, grenadesOnly) {
    return {
      onEnter(args) {
        this.r = null;
        try {
          const s = thisProjectile(fn, args, this.context, grenadesOnly);
          if (s === null) return;
          const st = state(args[0]);
          st[fn]++;
          if (fn !== 'settle' && st[fn] !== 1) return;
          this.r = { fn: fn, proj: s, call: st[fn], tid: this.threadId, frames: where(this.context, 6) };
        } catch (e) { fail(fn, e); }
      },
      onLeave(retval) {
        if (this.r === null) return;
        this.r.ret = retval.toString();
        row(this.r);
      },
    };
  };
  hook('arrival', oncePer('arrival', false));
  hook('init3D', oncePer('init3D', false));
  hook('settle', oncePer('settle', true));

  // 5. the kill, with its backtrace and the last tick's timers
  hook('kill', {
    onEnter(args) {
      try {
        const s = thisProjectile('kill', args, this.context, false);
        if (s === null) return;
        const st = state(args[0]);
        row({ fn: 'kill', proj: s, ticks: st.tick, lastTick: st.last || null, tid: this.threadId, frames: where(this.context, 12) });
      } catch (e) { fail('kill', e); }
    },
  });

  // 6. the registration and its gate: the arguments as forms, *(401069) beside them
  const gateRef = function () { try { return exe.base.add(at.runeGateRef).readPointer(); } catch (e) { return ptr(0); } };
  const playerPtr = function () { try { return exe.base.add(at.playerSingleton).readPointer(); } catch (e) { return ptr(0); } };
  hook('addRune', {
    onEnter(args) {
      try {
        const forms = [args[0], args[1], args[2], args[3]].map(form);
        const projArg = forms.findIndex(isProjectile);
        const r = { fn: 'addRune', args: [args[0], args[1], args[2], args[3]].map(function (a) { return a.toString(); }), forms: forms,
                    tid: this.threadId, frames: where(this.context, 8) };
        if (projArg >= 0) r.proj = summary(args[projArg], forms[projArg]);
        r.ref401069 = gateRef().toString();
        r.ref401069IsPlayer = gateRef().equals(playerPtr());
        row(r);
      } catch (e) { fail('addRune', e); }
    },
  });
  hook('runeGate', {
    onEnter(args) {
      this.r = null;
      try {
        const s = thisProjectile('runeGate', args, this.context, true);
        if (s === null) return;
        const g = gateRef();
        const shooter = resolve(parseInt(s.shooterHandle, 16));
        this.r = { fn: 'runeGate', proj: s, ref401069: g.toString(), ref401069IsPlayer: g.equals(playerPtr()),
                   shooterIs401069: shooter.ref !== null && g.equals(ptr(shooter.ref)), tid: this.threadId, frames: where(this.context, 6) };
      } catch (e) { fail('runeGate', e); }
    },
    onLeave(retval) {
      if (this.r === null) return;
      this.r.ret = retval.toString();
      row(this.r);
    },
  });

  // the layout self-test: the player singleton, *(403520) resolved, *(401069) against the player
  const ready = { ready: true, version: version, hooks: hooks, offsets: PROJ };
  try {
    const player = playerPtr();
    ready.player = form(player);
    const ph = playerHandleNow();
    const resolved = resolve(ph);
    ready.handleAt403520 = hex(ph);
    ready.handleAt403520Resolves = resolved.id;
    ready.handleAt403520IsPlayer = resolved.ref !== null && ptr(resolved.ref).equals(player);
    ready.ref401069 = gateRef().toString();
    ready.ref401069IsPlayer = gateRef().equals(player);
  } catch (e) { ready.selfTest = 'unreadable: ' + e; }
  emit(ready);
}
