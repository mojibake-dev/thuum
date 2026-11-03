// change-census.js: which persistent world changes reach the engine's own change tracking, TESForm::AddChange (thuum,
// numidium 2026-11-03; the night's goal: one observe point for scripts, containers and physics). AddChange is TESForm's
// virtual slot 0x0A (CommonLibSSE-NG include/RE/T/TESForm.h:133; RemoveChange 0x0B, SaveGame 0x0E, LoadGame 0x0F beside
// it), and CommonLib's body note on SetDelete (slot 0x23, TESForm.h:158) is the pattern the census tests: flip the bit,
// then AddChange(1). The change flags are CommonLib's: TESObjectREFR.h:141-160, Actor.h:234 on, TESQuest.h (kQuestStages
// at :208), TESObjectCELL.h:146-152, TESNPC.h, TESObjectDOOR.h, BGSLocation.h:89. thuum-cf's static read
// (docs/research/adr062/papyrus-native-entries.md) found PlaceActorAtMe AddChange(0x40000000), SetDestroyed AddChange(1),
// Quest.Stop AddChange(2) and SetCurrentStageID AddChange(0x80000000), and one counter-example, GlobalVariable.SetValue,
// which writes TESGlobal's value with no call at all. The script reads slots 0x0A and 0x0B of 59 form classes' primary
// vtables (VTABLE_<Class>[0], Address Library ids by lab/addr.py for 1.6.1170 below), skips a target that is a stub (a
// return within its first four bytes, a class that keeps no changes) or lies outside SkyrimSE.exe, and hooks each other
// target once. Per call it keys (function, form type, flags, caller): the first FIRST_N calls of a key print whole (form
// id, a reference's base form id, AddChange's answer), and every FLUSH_MS a sum row prints each key's new count. A form
// pointer whose type byte is past the last FormType (0x8A) is counted as foreign, so a shared (folded) body shows itself.
// Every slot target and argument meaning is a HYPOTHESIS until this trace reads as expected (rule 2). Byte budget:
// BUDGET (1.2 MB) of rows, after which only sum rows print, one every 5 s (lab/frida/README.md's guest output limit).
// Params: FLUSH_MS (1000), FIRST_N (8), REMOVE (true), MAX_ROWS_PER_S (150), BUDGET (1200000).
const PARAMS = (typeof LAB_PARAMS === 'object' && LAB_PARAMS) ? LAB_PARAMS : {};
const FLUSH_MS = PARAMS.FLUSH_MS === undefined ? 1000 : Number(PARAMS.FLUSH_MS);
const FIRST_N = PARAMS.FIRST_N === undefined ? 8 : Number(PARAMS.FIRST_N);
const REMOVE = PARAMS.REMOVE === undefined ? true : !!PARAMS.REMOVE;
const MAX_ROWS_PER_S = PARAMS.MAX_ROWS_PER_S === undefined ? 150 : Number(PARAMS.MAX_ROWS_PER_S);
const BUDGET = PARAMS.BUDGET === undefined ? 1200000 : Number(PARAMS.BUDGET);
let spent = 0;
function emit(obj) {
  obj.t = Date.now();
  const s = JSON.stringify(obj);
  spent += 2 * s.length;
  send(obj);
  console.log(s);
}

// Offsets by `just addr` (lab/addr.py, Address Library 1.6.1170 only), 2026-11-03: each class's VTABLE_<Class>[0] RVA,
// its Address Library id and CommonLib's line
const OFFSETS = {
  '1.6.1170.0': {
    vtables: {
    TESForm: 0x1780b00, // 187895 include/RE/Offsets_VTABLE.h:311
    TESObjectREFR: 0x17ae180, // 190259 include/RE/Offsets_VTABLE.h:649
    Actor: 0x189d870, // 207511 include/RE/Offsets_VTABLE.h:2142
    Character: 0x18a5558, // 207886 include/RE/Offsets_VTABLE.h:2215
    PlayerCharacter: 0x18ab9c0, // 208040 include/RE/Offsets_VTABLE.h:2231
    TESObjectCELL: 0x17aaa90, // 190143 include/RE/Offsets_VTABLE.h:619
    TESWorldSpace: 0x17b2a68, // 190424 include/RE/Offsets_VTABLE.h:689
    TESQuest: 0x17e6a40, // 195890 include/RE/Offsets_VTABLE.h:937
    TESGlobal: 0x17c0978, // 191675 include/RE/Offsets_VTABLE.h:805
    TESNPC: 0x17e4d50, // 195816 include/RE/Offsets_VTABLE.h:931
    TESObjectDOOR: 0x179ede8, // 189666 include/RE/Offsets_VTABLE.h:542
    TESObjectCONT: 0x179e0d8, // 189633 include/RE/Offsets_VTABLE.h:539
    TESObjectACTI: 0x179bcf8, // 189485 include/RE/Offsets_VTABLE.h:524
    TESObjectBOOK: 0x179d960, // 189577 include/RE/Offsets_VTABLE.h:536
    TESObjectMISC: 0x179f3e0, // 189689 include/RE/Offsets_VTABLE.h:548
    TESObjectWEAP: 0x17a11a0, // 189786 include/RE/Offsets_VTABLE.h:557
    TESObjectARMO: 0x179d100, // 189542 include/RE/Offsets_VTABLE.h:533
    TESFaction: 0x17e1fc0, // 195672 include/RE/Offsets_VTABLE.h:923
    TESPackage: 0x185b2c0, // 203948 include/RE/Offsets_VTABLE.h:1515
    BGSLocation: 0x17a3b58, // 189916 include/RE/Offsets_VTABLE.h:570
    BGSScene: 0x17df428, // 195375 include/RE/Offsets_VTABLE.h:901
    BGSEncounterZone: 0x17a2468, // 189877 include/RE/Offsets_VTABLE.h:563
    TESTopicInfo: 0x17e9ad8, // 196107 include/RE/Offsets_VTABLE.h:951
    TESTopic: 0x17e90f0, // 196084 include/RE/Offsets_VTABLE.h:948
    BGSStoryManagerQuestNode: 0x186de58, // 205062 include/RE/Offsets_VTABLE.h:1752
    BGSRelationship: 0x17dea88, // 195361 include/RE/Offsets_VTABLE.h:897
    BGSListForm: 0x17b8818, // 190933 include/RE/Offsets_VTABLE.h:730
    BGSNote: 0x17dc9c8, // 195276 include/RE/Offsets_VTABLE.h:883
    BGSTalkingActivator: 0x1796048, // 189175 include/RE/Offsets_VTABLE.h:483
    TESLevItem: 0x1799b98, // 189382 include/RE/Offsets_VTABLE.h:511
    TESLevCharacter: 0x1799630, // 189369 include/RE/Offsets_VTABLE.h:508
    TESLevSpell: 0x179a168, // 189393 include/RE/Offsets_VTABLE.h:514
    TESClass: 0x17e1540, // 195645 include/RE/Offsets_VTABLE.h:917
    IngredientItem: 0x1769028, // 186407 include/RE/Offsets_VTABLE.h:36
    Hazard: 0x18c2038, // 209971 include/RE/Offsets_VTABLE.h:2783
    Projectile: 0x18c4470, // 210006 include/RE/Offsets_VTABLE.h:2788
    ArrowProjectile: 0x18bdca8, // 209891 include/RE/Offsets_VTABLE.h:2771
    MissileProjectile: 0x18c28b8, // 209980 include/RE/Offsets_VTABLE.h:2784
    BarrierProjectile: 0x18be5f0, // 209901 include/RE/Offsets_VTABLE.h:2773
    BeamProjectile: 0x18bf090, // 209914 include/RE/Offsets_VTABLE.h:2776
    ConeProjectile: 0x18bf900, // 209925 include/RE/Offsets_VTABLE.h:2777
    FlameProjectile: 0x18c0dc0, // 209953 include/RE/Offsets_VTABLE.h:2781
    GrenadeProjectile: 0x18c15f0, // 209962 include/RE/Offsets_VTABLE.h:2782
    Explosion: 0x18c06a8, // 209940 include/RE/Offsets_VTABLE.h:2779
    TESObjectLIGH: 0x179ac70, // 189414 include/RE/Offsets_VTABLE.h:517
    TESFlora: 0x1797ca8, // 189287 include/RE/Offsets_VTABLE.h:496
    TESFurniture: 0x17983c0, // 189309 include/RE/Offsets_VTABLE.h:499
    BGSMovableStatic: 0x17948e8, // 189117 include/RE/Offsets_VTABLE.h:471
    TESObjectSTAT: 0x179fa18, // 189715 include/RE/Offsets_VTABLE.h:551
    AlchemyItem: 0x17662f0, // 186204 include/RE/Offsets_VTABLE.h:11
    ScrollItem: 0x176c008, // 186591 include/RE/Offsets_VTABLE.h:58
    SpellItem: 0x176c760, // 186619 include/RE/Offsets_VTABLE.h:61
    TESKey: 0x1798f70, // 189342 include/RE/Offsets_VTABLE.h:505
    TESSoulGem: 0x17a1dc0, // 189850 include/RE/Offsets_VTABLE.h:560
    TESAmmo: 0x17967b0, // 189195 include/RE/Offsets_VTABLE.h:486
    TESObjectTREE: 0x179ff10, // 189725 include/RE/Offsets_VTABLE.h:554
    BGSIdleMarker: 0x17dba28, // 195235 include/RE/Offsets_VTABLE.h:872
    TESWeather: 0x17b1be8, // 190405 include/RE/Offsets_VTABLE.h:687
    TESRace: 0x17e7e78, // 195941 include/RE/Offsets_VTABLE.h:946
    },
  },
};
const SLOTS = [[0x0a, 'AddChange'], [0x0b, 'RemoveChange']]; // TESForm.h:133-134
const FORM = { id: 0x14, type: 0x1a }; // TESForm.h:354, :356
const REFR_BASE = 0x40; // TESObjectREFR.h:495 OBJ_REFR data at 0x40, its objectReference at 0x00 (:77)
const LAST_FORM_TYPE = 0x8a;

// FormType values, CommonLib include/RE/F/FormTypes.h (the ones this census names; others print as hex)
const TYPE_NAMES = {
  0x09: 'GLOB', 0x0b: 'FACT', 0x18: 'ACTI', 0x1a: 'ARMO', 0x1b: 'BOOK', 0x1c: 'CONT', 0x1d: 'DOOR', 0x1f: 'LIGH',
  0x20: 'MISC', 0x22: 'STAT', 0x24: 'MSTT', 0x27: 'FLOR', 0x28: 'FURN', 0x29: 'WEAP', 0x2a: 'AMMO', 0x2b: 'NPC_',
  0x2e: 'ALCH', 0x3c: 'CELL', 0x3d: 'REFR', 0x3e: 'ACHR', 0x3f: 'PMIS', 0x40: 'PARW', 0x41: 'PGRE', 0x42: 'PBEA',
  0x43: 'PFLA', 0x44: 'PCON', 0x45: 'PBAR', 0x46: 'PHZD', 0x47: 'WRLD', 0x4c: 'INFO', 0x4d: 'QUST', 0x4f: 'PACK',
  0x57: 'EXPL', 0x5b: 'FLST', 0x67: 'ECZN', 0x68: 'LCTN', 0x79: 'RELA', 0x7a: 'SCEN',
};
// change flag bits by class (CommonLib's ChangeFlags enums); bit 0 is TESForm's kFlags for every form (TESForm.h)
const REFR_BITS = {
  1: 'kMoved', 2: 'kHavokMoved', 3: 'kCellChanged', 4: 'kScale', 5: 'kInventory', 6: 'kOwnershipExtra', 7: 'kBaseObject',
  10: 'kItemExtraData', 11: 'kAmmoExtra', 12: 'kLockExtra', 21: 'kEmpty', 22: 'kOpenDefaultState', 23: 'kOpenState',
  25: 'kPromoted', 26: 'kActivatingChildren', 27: 'kLeveledInventory', 28: 'kAnimation', 29: 'kEncZoneExtra',
  30: 'kCreatedOnlyExtra', 31: 'kGameOnlyExtra',
};
const ACTOR_BITS = {
  10: 'kLifeState', 11: 'kPackageExtraData', 12: 'kMerchantContainer', 17: 'kDismemberedLimbs', 18: 'kLeveledActor',
  19: 'kDispModifiers', 20: 'kTempModifiers', 21: 'kDamageModifiers', 22: 'kOverrideModifiers', 23: 'kPermanentModifiers',
};
const BITS_BY_TYPE = {
  0x4d: { 1: 'kQuestFlags', 2: 'kQuestScriptDelay', 26: 'kQuestAlreadyRun', 27: 'kQuestInstanceData', 28: 'kQuestRuntimeData',
    29: 'kQuestObjectives', 30: 'kQuestScript', 31: 'kQuestStages' },
  0x3c: { 1: 'kFlags', 2: 'kFullName', 3: 'kOwnership', 28: 'kExteriorShort', 29: 'kExteriorChar', 30: 'kDetachTime', 31: 'kSeenData' },
  0x2b: { 1: 'kBaseData', 2: 'kAttributes', 3: 'kAIData', 4: 'kSpellList', 5: 'kFullName', 6: 'kFactions', 9: 'kNPCSkills',
    10: 'kClass', 11: 'kFace', 12: 'kDefaultOutfit', 13: 'kSleepOutfit', 24: 'kGender', 25: 'kRace' },
  0x1d: { 17: 'kTeleportExtra' },
  0x1b: { 5: 'kTeachesSkill', 6: 'kRead' },
  0x0b: { 1: 'kFactionFlags', 2: 'kFactionReactions' },
  0x67: { 1: 'kZoneFlags' },
  0x68: { 30: 'kKeywordData', 31: 'kCleared' },
  0x4f: { 26: 'kWaitingFlag' },
};
const isRefr = function (type) { return type >= 0x3d && type <= 0x46; };
const flagNames = function (type, flags) {
  const out = [];
  for (let b = 0; b < 32; b++) {
    if (((flags >>> b) & 1) === 0) continue;
    let n;
    if (b === 0) n = 'kFlags';
    else if (type === 0x3e && ACTOR_BITS[b] !== undefined) n = ACTOR_BITS[b];
    else if (isRefr(type)) n = REFR_BITS[b];
    else if (BITS_BY_TYPE[type] !== undefined) n = BITS_BY_TYPE[type][b];
    out.push(n === undefined ? 'bit' + b : n);
  }
  return out;
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

const hex = function (n) { return n < 0 ? String(n) : '0x' + n.toString(16); };
const u32 = function (p, o) { try { return p.add(o).readU32(); } catch (e) { return -1; } };
const u8 = function (p, o) { try { return p.add(o).readU8(); } catch (e) { return -1; } };
const ptrAt = function (p, o) { try { return p.add(o).readPointer(); } catch (e) { return NULL; } };
const bytesAt = function (p, n) {
  try { return Array.prototype.map.call(new Uint8Array(p.readByteArray(n)), function (b) { return ('0' + b.toString(16)).slice(-2); }).join(' '); }
  catch (e) { return 'unreadable'; }
};

const exe = Process.getModuleByName('SkyrimSE.exe');
const version = fileVersion(exe.path);
const off = OFFSETS[version];
if (off === undefined) {
  emit({ error: 'no offsets for this runtime', version: version });
} else {
  const lo = exe.base;
  const hi = exe.base.add(exe.size);
  const inExe = function (p) { return p.compare(lo) >= 0 && p.compare(hi) < 0; };
  const callerNames = {};
  const callerOf = function (ret) {
    if (inExe(ret)) return hex(ret.sub(lo).toUInt32());
    const k = String(ret);
    if (callerNames[k] === undefined) {
      const m = Process.findModuleByAddress(ret);
      callerNames[k] = m === null ? k : m.name + '+' + hex(ret.sub(m.base).toUInt32());
    }
    return callerNames[k];
  };

  const targets = {};
  const skipped = [];
  for (const cls in off.vtables) {
    const vt = exe.base.add(off.vtables[cls]);
    for (const pair of SLOTS) {
      const slot = pair[0];
      const fn = pair[1];
      if (fn === 'RemoveChange' && !REMOVE) continue;
      const p = ptrAt(vt, slot * 8);
      if (p.isNull() || !inExe(p)) { skipped.push({ cls: cls, fn: fn, why: 'outside SkyrimSE.exe', target: String(p) }); continue; }
      const head = bytesAt(p, 8);
      const rva = hex(p.sub(lo).toUInt32());
      const first4 = head.split(' ').slice(0, 4);
      if (first4.indexOf('c3') >= 0) { skipped.push({ cls: cls, fn: fn, why: 'stub', target: rva, bytes: head }); continue; }
      const k = fn + '@' + rva;
      if (targets[k] === undefined) targets[k] = { fn: fn, p: p, rva: rva, bytes: head, classes: [] };
      targets[k].classes.push(cls);
    }
  }

  const keys = {};
  let rowsThisSecond = 0;
  let second = 0;
  let foreign = 0;
  const note = function (fn, form, flags, ret, answer) {
    const type = u8(form, FORM.type);
    if (type < 0 || type > LAST_FORM_TYPE) { foreign += 1; return; }
    const caller = callerOf(ret);
    const key = fn + '|' + type + '|' + flags + '|' + caller;
    let k = keys[key];
    if (k === undefined) {
      k = { fn: fn, type: type, flags: flags, caller: caller, n: 0, nTrue: 0, sent: 0, firstId: 0, lastId: 0, printed: 0 };
      keys[key] = k;
    }
    const id = u32(form, FORM.id);
    k.n += 1;
    if (answer === 1) k.nTrue += 1;
    if (k.n === 1) k.firstId = id;
    k.lastId = id;
    if (k.printed >= FIRST_N || spent > BUDGET) return;
    const now = Date.now();
    const s = Math.floor(now / 1000);
    if (s !== second) { second = s; rowsThisSecond = 0; }
    if (rowsThisSecond >= MAX_ROWS_PER_S) return;
    rowsThisSecond += 1;
    k.printed += 1;
    const row = { event: 'call', fn: fn, type: TYPE_NAMES[type] || hex(type), flags: hex(flags), names: flagNames(type, flags),
      caller: caller, id: hex(id), answer: answer };
    if (isRefr(type)) row.base = hex(u32(ptrAt(form, REFR_BASE), FORM.id));
    emit(row);
  };

  let hooked = 0;
  for (const k in targets) {
    const t = targets[k];
    try {
      if (t.fn === 'AddChange') {
        Interceptor.attach(t.p, {
          onEnter(args) { this.form = args[0]; this.flags = args[1].toUInt32(); this.ret = this.returnAddress; },
          onLeave(retval) { note('AddChange', this.form, this.flags, this.ret, retval.toUInt32() & 0xff); },
        });
      } else {
        Interceptor.attach(t.p, {
          onEnter(args) { note('RemoveChange', args[0], args[1].toUInt32(), this.returnAddress, -1); },
        });
      }
      hooked += 1;
    } catch (e) {
      skipped.push({ fn: t.fn, target: t.rva, why: 'attach failed: ' + e });
    }
  }

  let lastSum = 0;
  setInterval(function () {
    const now = Date.now();
    if (spent > BUDGET && now - lastSum < 5000) return;
    lastSum = now;
    const rows = [];
    for (const key in keys) {
      const k = keys[key];
      if (k.n === k.sent) continue;
      rows.push([k.fn === 'AddChange' ? 'A' : 'R', TYPE_NAMES[k.type] || hex(k.type), hex(k.flags), k.caller, k.n - k.sent, k.n, k.nTrue, hex(k.lastId)]);
      k.sent = k.n;
    }
    if (rows.length > 0 || foreign > 0) emit({ event: 'sum', cols: 'fn type flags caller new total true lastId', rows: rows.slice(0, 80), more: Math.max(0, rows.length - 80), foreign: foreign, spent: spent });
  }, FLUSH_MS);

  const listed = [];
  for (const k in targets) listed.push({ fn: targets[k].fn, rva: targets[k].rva, bytes: targets[k].bytes, classes: targets[k].classes });
  emit({ event: 'ready', version: version, pid: Process.id, base: String(exe.base), hooked: hooked, targets: listed, skipped: skipped,
    first_n: FIRST_N, flush_ms: FLUSH_MS, budget: BUDGET });
}
