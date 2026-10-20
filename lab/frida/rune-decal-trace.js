// rune-decal-trace.js: the rune's glyph as a decal, read on the CASTER, for
// thuum docs/verbs/spell-cast.md (the target-location section after playtest
// twenty-four, :1270-1343; the Dynamic plan :1354-1372; train-29's row 5 at
// :1453-1492). The rune's other half is settled: the observer's game holds
// the figure's Frost Rune (SPEL 0x6796F, PROJ RuneFrostProjectile 0x5FBBF, a
// Grenade) as an armed reference at the relayed point and draws no glyph
// (x-rune-visible 20261020-090323), and the tier compare 44213 and the settle
// 43919 never run for a rune on either seat (x-rune-visible-frida2
// 20261020-092130, docs/research/frida-reads-train29.md section D). The
// re-analyst's REA read of 2026-10-20 (scratchpad/re-37335-and-rune-landing.md,
// question 2, :80-141; HYPOTHESIS until this trace): the glyph is a DECAL
// placed by 44186 (:85; its only callers are 34452 and the collision-fed
// 44213, and it ends in BGSDecalManager, :88-89; the only decal path a rune
// born at rest can take, :90-91), called from the magic caster's
// target-location launch 34452 (:81) right after Projectile::Launch 44108
// when the new projectile's vtable slot 0xAE says grenade (:83-84; the slot
// is CommonLibSSE-NG include/RE/G/GrenadeProjectile.h:39, Projectile.h:210),
// with (projectile, the pick's position = the LaunchData's origin, the pick's
// normal scaled by 69.99, the material id from 44190, 1, 0, the grenade's own
// decal group through slot 0x9F GetDecalGroup (GrenadeProjectile.h:34), 1)
// (:85-88, :127). The relay (MagicApi.cpp:302) calls 44108 bare and never
// passes through 34452, so the observer's game never requests the figure's
// decal (:89-90). Run on the CASTER's seat: c1 in x-rune-visible's shape, the
// seat that casts Frost Rune at the ground (the probe's step is
// `c1: frida {script: ...}`, lab/.cache/probes/x-rune-visible-frida2.yaml:46).
//
// Stations, each row with fn, seq (emit order), t (UTC ms), tid and, on the
// entry rows, the caller's frames as module+offset:
// - decal: 44186 at the entry (one row) and the leave (a second row with the
//   return and the entry row's seq). The entry row: args 0 to 7 raw; arg 0
//   decoded as a projectile the way rune-tier-trace.js decodes one (form id,
//   type byte, base, shooter resolved from its handle with kind player, figure
//   or npc, loc, cell, explosion, spell, timers, flags); args 1 and 2 read as
//   NiPoint3 (the memo's &origin and &normal, :127), the normal with its
//   length (69.99 expected, :86) and its unit vector; arg 3 as the material id
//   (MATERIAL_ID is a std::uint32_t, MaterialIDs.h:5), named when it is one of
//   the four ground materials listed below, raw otherwise; args 4 to 7 raw
//   (1, 0, the decal group, 1 expected); the return address as module+offset,
//   its offset from 34452's start when it lies in [34452, 34453) (the extent
//   method of frida-reads-train29.md:165-166; +0x359 is Launch's own return
//   into 34452, :173, so the decal's should sit a little past it), and
//   whether a 34452 call is open on this thread right now (measured by
//   station 3's entry and leave, not inferred from frames). Every call is a
//   row; one per cast is the expectation.
// - material: 44190 at the leave, one row with the entry's args 0 to 3 raw
//   and their form reads (the memo gives no parameter list; :86-87 says only
//   that it finds the BGSMaterialType from the hit shape, landscape through
//   TES::GetLandMaterialType), the return raw, and the return decoded both
//   ways the memo leaves open: as a BGSMaterialType (form type MATT 0x63,
//   FormTypes.h:239) with its materialID at +0x30 (BGSMaterialType.h:51), or
//   as the id itself in the low 32 bits. Every call is a row while a 34452
//   call is open on its thread; outside that bracket the first 24 calls are
//   rows marked probe and the rest are counted (the count rides every
//   targetLaunch leave row), since the memo does not say who else calls it.
// - targetLaunch: 34452 at the entry and the leave, one row each, so the
//   cast's launch is bracketed in time with the decal call: args 0 to 8 raw
//   (the memo's param_9, :84, is the pick struct, so args[8]; its normal at
//   +0x30, collidable at +0x80 and flag at +0xc0 are the memo's reading of
//   the decompiler output, :132, HYPOTHESIS, read when the pointer is readable
//   and tagged pickByMemo), form reads of args 0 to 3 as rune-tier-trace.js's
//   probe rows do (arg 0 is the caster, not a form, by :81; its read shows
//   that), the depth of open 34452 calls on the thread, and at the leave the
//   return plus the counts of launch, material and decal calls this bracket
//   saw on its thread. Every call is a row.
// - launch: Projectile::Launch 44108 as rune-tier-trace.js hooks it (a
//   player's or a figure's shooter; the LaunchData's base, spell, origin and
//   cell; at the leave the new handle resolved to its form id), plus the
//   LaunchData's contactNormal (the field 34452 copies the pick's normal
//   into, memo :128), angleZ and angleX, autoAim and useOrigin (the pair
//   m2-train-29 flips, spell-cast.md:1479-1484), and whether a 34452 call is
//   open on this thread.
//
// What to look for, on the caster, per Frost Rune cast: one targetLaunch
// enter; a launch with inside34452 true and the player as shooter; material
// rows; ONE decal row with inside34452 true and retRel34452 a little past
// +0x359, arg 0 the rune (type PGRE 0x41, base 0x5fbbf, shooter the player),
// position equal to the launch's origin, normal of length about 69.99 and
// parallel to the launch's contactNormal and the pick's +0x30 normal,
// materialId a ground material equal to the material row's, a4 1, a5 0,
// decalGroup non-null, a7 1; then the targetLaunch leave with decal 1. On
// the OBSERVER (not this script's seat; it may run there too) the
// expectation is zero decal rows for the figure's rune, since the relay never
// enters 34452. The memo's falsifiers (:140-141) as this trace sees them: a
// decal row on the caster with inside34452 false and retRel34452 null (its
// other caller 44213 sits at SkyrimSE.exe+0x7ecd80, rune-tier-trace.js:74,
// and would show in frames); no decal row for a cast whose glyph the
// caster's own screenshot shows (then the glyph is not this decal); a decal
// row whose arg 0 is not the rune.
//
// Ids, all for 1.6.1170, RVAs by lab/addr.py from addrlib/ (hard rule 1), the
// id's source beside each. Layouts are CommonLibSSE-NG's, cited per constant;
// the PROJECTILE_RUNTIME_DATA comments are the pre-1.6.629 layout's absolute
// offsets and the struct starts at 0xA0 on this runtime (Projectile.h:293),
// so each field shifts by 8 (rune-tier-trace.js:100-110). Resolving a handle
// keeps one extra reference count per distinct handle (rune-tier-trace.js:62-64);
// the script caches them, so a run leaks a handful. Nothing here is typed
// from memory: what the memo does not state (44190's parameters and return
// type, 34452's parameters beyond param_9, the pick struct's layout beyond
// :132's three offsets) is logged raw and said so above. Run: a scenario's
// `frida {script: rune-decal-trace.js}` step on the caster (after that
// client's console steps, lab/frida/README.md), or
// `just frida rune-decal-trace.js c1` while the game runs. 1.6.1170 only.
'use strict';
function emit(obj) { obj.t = Date.now(); send(obj); console.log(JSON.stringify(obj)); }

const OFFSETS = {
  '1.6.1170.0': {
    decal: 0x7e9be0, // lab/addr.py addrlib 1.6.1170 44186: the decal placement (memo re-37335-and-rune-landing.md:85 "44186 (0x1407e9be0)"; :88-89 its callers 34452 and 44213 and its end in BGSDecalManager; :136 the suggested hook)
    material: 0x7ea500, // lab/addr.py addrlib 1.6.1170 44190: the material id lookup (memo :86 "44190 (0x1407ea500: BGSMaterialType from the hit shape, landscape via TES::GetLandMaterialType"; :137)
    targetLaunch: 0x5bfd60, // lab/addr.py addrlib 1.6.1170 34452: the magic caster's target-location launch (memo :81 "34452 (0x1405bfd60"; docs/research/apocalypse/target-location.md:18; frida-reads-train29.md:173)
    targetLaunchNext: 0x5c02e0, // lab/addr.py addrlib 1.6.1170 34453: the next id, 34452's extent bound (frida-reads-train29.md:165-166 the method; :173 "34453 at 0x5c02e0")
    launch: 0x7e46c0, // lab/addr.py addrlib 1.6.1170 44108: Projectile::Launch (rune-tier-trace.js:73; fork game/Offsets.h ProjectileLaunch; CommonLibSSE-NG src/RE/P/Projectile.cpp:258)
    impactEffects: 0x7ecd80, // lab/addr.py addrlib 1.6.1170 44213: the impact-effects pass, 44186's other caller (memo :88; rune-tier-trace.js:74); not hooked, listed in the ready row for the reader of frames
    playerSingleton: 0x31874f8, // lab/addr.py addrlib 1.6.1170 403521: NiPointer<PlayerCharacter> (rune-tier-trace.js:85; include/RE/Offsets.h:451)
    lookupRef: 0x179710, // lab/addr.py addrlib 1.6.1170 12332: LookupReferenceByHandle(const RefHandle&, NiPointer<TESObjectREFR>&) (rune-tier-trace.js:86; include/RE/Offsets.h:582; include/RE/M/Misc.h:25)
  },
};
const IDS = { decal: 44186, material: 44190, targetLaunch: 34452, targetLaunchNext: 34453, launch: 44108, impactEffects: 44213, playerSingleton: 403521, lookupRef: 12332 };
const FORM_ID = 0x14; // include/RE/T/TESForm.h:354
const FORM_TYPE = 0x1a; // include/RE/T/TESForm.h:356
const TYPE = {
  ACHR: 0x3e, // include/RE/F/FormTypes.h:202
  PGRE: 0x41, // include/RE/F/FormTypes.h:205 (GrenadeProjectile: a rune)
  PROJ_LO: 0x3f, // include/RE/F/FormTypes.h:203 PMIS ...
  PROJ_HI: 0x45, // ... :209 PBAR, the placed projectile references
  MATT: 0x63, // include/RE/F/FormTypes.h:239 BGSMaterialType
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
// Projectile::LaunchData (include/RE/P/Projectile.h:81-107)
const LD = {
  origin: 0x08, // NiPoint3 origin (:81)
  contactNormal: 0x14, // NiPoint3 contactNormal (:82); the pick's normal, copied in by 34452 (memo :128)
  projectileBase: 0x20, // BGSProjectile* projectileBase (:83)
  shooter: 0x28, // TESObjectREFR* shooter (:84)
  angleZ: 0x48, // float angleZ (:88)
  angleX: 0x4c, // float angleX (:89)
  parentCell: 0x68, // TESObjectCELL* parentCell (:94)
  spell: 0x70, // MagicItem* spell (:95)
  autoAim: 0x9e, // bool autoAim (:105)
  useOrigin: 0xa0, // bool useOrigin (:107)
};
// NiPoint3: x at 0, y at 4, z at 8 (include/RE/N/NiPoint3.h:44-46)
// BGSMaterialType: MATERIAL_ID materialID at 0x30 (include/RE/B/BGSMaterialType.h:51), an enum class over
// std::uint32_t (include/RE/M/MaterialIDs.h:5); the four ground names below are that header's
// (:14 kSnow, :52 kGrass, :74 kDirt, :86 kStone); any other id prints raw
const MATERIAL_ID_AT = 0x30;
const MATERIAL_NAMES = { 398949039: 'kSnow', 1848600814: 'kGrass', 3106094762: 'kDirt', 3741512247: 'kStone' };
// the pick struct 34452 takes as its ninth parameter (memo :84 param_9, :85 the collidable test), the memo's
// reading of the decompiler output (:132), HYPOTHESIS: normal at +0x30, collidable at +0x80, flag at +0xc0
const PICK = { normal: 0x30, collidable: 0x80, flag: 0xc0 };
const NORMAL_SCALE_BY_MEMO = 69.99; // memo :86
const PLAYER_ID = 0x14;
const FIGURE_MIN = 0xff000000;
const MATERIAL_PROBES = 24;
const MAX_EMITS = 4000;

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

// three floats at p, raw, or null when p does not read
function vec3(p) {
  if (!readable(p)) return null;
  try { return [p.readFloat(), p.add(4).readFloat(), p.add(8).readFloat()]; } catch (e) { return null; }
}
function round3(v, d) { return v === null ? null : v.map(function (c) { return +c.toFixed(d); }); }
function length3(v) { return v === null ? null : +Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]).toFixed(3); }
function unit3(v) {
  if (v === null) return null;
  const l = Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
  return l === 0 ? null : v.map(function (c) { return c / l; });
}
function low32(p) { return p.toInt32() >>> 0; }

function describe(p) {
  const m = Process.findModuleByAddress(p);
  return m ? m.name + '+0x' + p.sub(m.base).toString(16) : p.toString();
}
function where(context, n) {
  return Thread.backtrace(context, Backtracer.ACCURATE).slice(0, n || 10).map(describe);
}
function rawArgs(args, n) { const out = []; for (let i = 0; i < n; i++) out.push(args[i].toString()); return out; }
function formArgs(args, n) { const out = []; for (let i = 0; i < n; i++) out.push(form(args[i])); return out; }

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

  // the projectile's summary, read from the reference; shooter from its handle (rune-tier-trace.js:219-236)
  function summary(p, f) {
    const s = { proj: f.id, type: f.type };
    try {
      const shooter = resolve(p.add(PROJ.shooter).readU32());
      s.shooter = shooter.id;
      s.shooterKind = shooter.kind;
      s.shooterHandle = shooter.handle;
      s.base = formId(p.add(REF.base).readPointer());
      s.loc = round3(vec3(p.add(REF.location)), 1);
      s.parentCell = p.add(REF.parentCell).readPointer().isNull() ? null : formId(p.add(REF.parentCell).readPointer());
      s.explosion = formId(p.add(PROJ.explosion).readPointer());
      s.spell = formId(p.add(PROJ.spell).readPointer());
      s.livingTime = +p.add(PROJ.livingTime).readFloat().toFixed(3);
      s.explosionTimer = +p.add(PROJ.explosionTimer).readFloat().toFixed(3);
      s.flags = hex(p.add(PROJ.flags).readU32());
    } catch (e) { s.err = String(e); }
    return s;
  }

  // per thread: the 34452 calls open right now and what the open bracket has seen
  const open = {};
  function bracketOf(tid) {
    if (open[tid] === undefined) open[tid] = { depth: 0, launch: 0, material: 0, decal: 0, enterSeq: null };
    return open[tid];
  }
  function inside(tid) { return open[tid] !== undefined && open[tid].depth > 0; }
  function count(tid, what) { if (inside(tid)) open[tid][what]++; }
  let materialCalls = 0;
  let materialSuppressed = 0;

  // 34452's extent, bounded by the next id (frida-reads-train29.md:165-166)
  const start34452 = exe.base.add(at.targetLaunch);
  const end34452 = exe.base.add(at.targetLaunchNext);
  function within34452(p) { return p.compare(start34452) >= 0 && p.compare(end34452) < 0; }
  function relTo34452(p) { return within34452(p) ? '+0x' + p.sub(start34452).toString(16) : null; }

  let hooks = 0;
  const hook = function (name, callbacks) { Interceptor.attach(exe.base.add(at[name]), callbacks); hooks++; };

  // 1. the decal placement: the row the hypothesis stands or falls on; every call
  hook('decal', {
    onEnter(args) {
      this.entered = false;
      try {
        const tid = this.threadId;
        count(tid, 'decal');
        const f = form(args[0]);
        const normal = vec3(args[2]);
        const material = low32(args[3]);
        const ret = this.returnAddress;
        const r = {
          fn: 'decal',
          phase: 'enter',
          args: rawArgs(args, 8),
          a0IsProjectile: isProjectile(f),
          proj: f !== null ? summary(args[0], f) : null,
          position: round3(vec3(args[1]), 2),
          normal: round3(normal, 3),
          normalLength: length3(normal),
          normalLengthByMemo: NORMAL_SCALE_BY_MEMO,
          normalUnit: round3(unit3(normal), 3),
          materialId: material,
          materialName: MATERIAL_NAMES[material] || null,
          a4: args[4].toString(),
          a5: args[5].toString(),
          decalGroup: args[6].toString(),
          a7: args[7].toString(),
          ret: describe(ret),
          retRel34452: relTo34452(ret),
          inside34452: inside(tid),
          tid: tid,
          frames: where(this.context, 10),
        };
        row(r);
        this.entered = true;
        this.enterSeq = r.seq;
      } catch (e) { fail('decal', e); }
    },
    onLeave(retval) {
      if (!this.entered) return;
      try {
        row({ fn: 'decal', phase: 'leave', enterSeq: this.enterSeq, ret: retval.toString(), tid: this.threadId });
      } catch (e) { fail('decal', e); }
    },
  });

  // 2. the material lookup: every call inside a 34452 bracket, the first 24 outside it as probes
  hook('material', {
    onEnter(args) {
      this.r = null;
      try {
        const tid = this.threadId;
        materialCalls++;
        count(tid, 'material');
        const inB = inside(tid);
        if (!inB && materialCalls > MATERIAL_PROBES) { materialSuppressed++; return; }
        this.r = {
          fn: 'material',
          call: materialCalls,
          probe: !inB,
          args: rawArgs(args, 4),
          forms: formArgs(args, 4),
          inside34452: inB,
          tEnter: Date.now(),
          tid: tid,
          frames: where(this.context, 8),
        };
      } catch (e) { fail('material', e); }
    },
    onLeave(retval) {
      if (this.r === null) return;
      try {
        this.r.ret = retval.toString();
        const f = form(retval);
        if (f !== null && f.type === TYPE.MATT) {
          const id = retval.add(MATERIAL_ID_AT).readU32();
          this.r.retAsMaterialType = { form: f.id, materialID: id, name: MATERIAL_NAMES[id] || null };
        } else {
          this.r.retAsMaterialType = null;
        }
        const low = low32(retval);
        this.r.retLow32 = low;
        this.r.retLow32Name = MATERIAL_NAMES[low] || null;
      } catch (e) { this.r.ret = 'unreadable: ' + e; }
      row(this.r);
    },
  });

  // 3. the target-location launch: the bracket the other stations are read against; every call
  hook('targetLaunch', {
    onEnter(args) {
      this.entered = false;
      try {
        const tid = this.threadId;
        const b = bracketOf(tid);
        b.depth++;
        this.entered = true;
        if (b.depth === 1) { b.launch = 0; b.material = 0; b.decal = 0; }
        const r = {
          fn: 'targetLaunch',
          phase: 'enter',
          depth: b.depth,
          args: rawArgs(args, 9),
          forms: formArgs(args, 4),
          tid: tid,
          frames: where(this.context, 8),
        };
        const pick = args[8];
        if (readable(pick)) {
          const pk = {};
          try { pk.normal = round3(vec3(pick.add(PICK.normal)), 3); } catch (e) { pk.normal = 'unreadable: ' + e; }
          try { pk.collidable = pick.add(PICK.collidable).readPointer().toString(); } catch (e) { pk.collidable = 'unreadable: ' + e; }
          try { pk.flag = hex(pick.add(PICK.flag).readU32()); } catch (e) { pk.flag = 'unreadable: ' + e; }
          r.pickByMemo = pk;
        } else {
          r.pickByMemo = null;
        }
        row(r);
        if (b.depth === 1) b.enterSeq = r.seq;
      } catch (e) { fail('targetLaunch', e); }
    },
    onLeave(retval) {
      if (!this.entered) return;
      try {
        const tid = this.threadId;
        const b = bracketOf(tid);
        row({
          fn: 'targetLaunch',
          phase: 'leave',
          depth: b.depth,
          enterSeq: b.enterSeq,
          ret: retval.toString(),
          launch: b.launch,
          material: b.material,
          decal: b.decal,
          materialSuppressedSoFar: materialSuppressed,
          tid: tid,
        });
        b.depth--;
      } catch (e) { fail('targetLaunch', e); }
    },
  });

  // 4. the launch: LaunchData in args[1]; the new handle through the returned pointer (rune-tier-trace.js:267-301)
  hook('launch', {
    onEnter(args) {
      this.fields = null;
      try {
        const tid = this.threadId;
        count(tid, 'launch');
        const ld = args[1];
        const shooter = form(ld.add(LD.shooter).readPointer());
        if (shooter === null || kindOf(parseInt(shooter.id, 16)) === 'npc') return;
        this.fields = {
          fn: 'launch',
          shooter: shooter.id,
          shooterKind: kindOf(parseInt(shooter.id, 16)),
          base: formId(ld.add(LD.projectileBase).readPointer()),
          spell: formId(ld.add(LD.spell).readPointer()),
          origin: round3(vec3(ld.add(LD.origin)), 1),
          contactNormal: round3(vec3(ld.add(LD.contactNormal)), 3),
          angleZ: +ld.add(LD.angleZ).readFloat().toFixed(4),
          angleX: +ld.add(LD.angleX).readFloat().toFixed(4),
          autoAim: ld.add(LD.autoAim).readU8(),
          useOrigin: ld.add(LD.useOrigin).readU8(),
          parentCell: formId(ld.add(LD.parentCell).readPointer()),
          inside34452: inside(tid),
          tid: tid,
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

  // the ready row: the ids with their RVAs and addresses, each checked against the module's bounds,
  // 34452's extent, and the player singleton's form id (0x14) as the layout's self-test
  const playerPtr = function () { try { return exe.base.add(at.playerSingleton).readPointer(); } catch (e) { return ptr(0); } };
  const insideModule = function (rva) {
    const p = exe.base.add(rva);
    return p.compare(exe.base) >= 0 && p.compare(exe.base.add(exe.size)) < 0;
  };
  const ready = { ready: true, version: version, hooks: hooks, module: { base: exe.base.toString(), size: exe.size }, ids: {} };
  Object.keys(IDS).forEach(function (k) {
    ready.ids[k] = { id: IDS[k], rva: hex(at[k]), address: exe.base.add(at[k]).toString(), insideModule: insideModule(at[k]) };
  });
  ready.selfTest = {
    targetLaunchInsideModule: insideModule(at.targetLaunch),
    decalInsideModule: insideModule(at.decal),
    extent34452: hex(at.targetLaunchNext - at.targetLaunch),
    hooksExpected: 4,
  };
  ready.offsets = { PROJ: PROJ, LD: LD, PICK: PICK, MATERIAL_ID_AT: MATERIAL_ID_AT };
  try { ready.player = form(playerPtr()); } catch (e) { ready.selfTest.player = 'unreadable: ' + e; }
  emit(ready);
}
