// change-census.js v3: which persistent world changes reach the engine's own change tracking, and from where (thuum, numidium
// 2026-11-03; docs/engine/change-forms.md). v2 hooked TESForm's slot 0x0A (CommonLibSSE-NG include/RE/T/TESForm.h:133) per
// vtable and ran as 20261103-111808. Its fresh review (FIX FIRST) and the re-analyst's read changed the shape:
//   - the slot's body (AL 14607) tail-jumps into BGSSaveLoadGame's AddChange (AL 35576: manager, form, flags, force), which a
//     forced entry (AL 14608) also reaches, so v3 hooks 35576 itself: one hook sees every mark that goes through AddChange, the
//     forced ones (kAnimation) included, and its return address is the original caller under a tail jump (the load's 35566 and
//     35567 OR the map directly, and the stash 35570 and SaveGame 35599 clear it, outside AddChange);
//   - TESNPC's override (TESActorBase's AL 24385) reaches 35576 for a normal form and writes a created NPC's template forms
//     itself, so it is hooked with a per-thread guard and counted only when it does not reach 35576;
//   - RemoveChange is hooked at its inner function (AL 35581) the same way, beside TESNPC's (AL 24386);
//   - every target must lie in an executable range of SkyrimSE.exe (BGSMovableStatic's [0] vtable is TESFullName's, and v2
//     hooked an RTTI pointer through it), and the ready row prints the first instruction of slot 0x0A's body to show the jump;
//   - every changed key is printed (rows of 80), a heartbeat every 10 s carries each hook's raw count, and a type byte at or
//     past 0x8A (FormType::Max) is foreign.
// Change flags and form types are CommonLib's (TESObjectREFR.h:141-160, Actor.h:234 on, TESQuest.h:208, TESObjectCELL.h:146-152,
// TESNPC.h, TESObjectDOOR.h, TESObjectBOOK.h, TESFaction.h:132, BGSEncounterZone.h:54, BGSLocation.h:78-79, TESPackage.h:266,
// FormTypes.h). Every id and argument meaning is a HYPOTHESIS until this trace reads as expected (rule 2). Byte budget BUDGET
// (1.2 MB) of rows, then only sum rows, one every 5 s. Params: FLUSH_MS (1000), FIRST_N (8), MAX_ROWS_PER_S (150), BUDGET.
const PARAMS = (typeof LAB_PARAMS === 'object' && LAB_PARAMS) ? LAB_PARAMS : {};
const FLUSH_MS = PARAMS.FLUSH_MS === undefined ? 1000 : Number(PARAMS.FLUSH_MS);
const FIRST_N = PARAMS.FIRST_N === undefined ? 8 : Number(PARAMS.FIRST_N);
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

// Offsets by `just addr` (lab/addr.py, Address Library 1.6.1170 only), 2026-11-03
const OFFSETS = {
  '1.6.1170.0': {
    innerAdd: 0x604320, // 35576 BGSSaveLoadGame's AddChange (manager, form, flags, force)
    innerRemove: 0x6044c0, // 35581 BGSSaveLoadGame's RemoveChange
    formAdd: 0x1dff90, // 14607 TESForm::AddChange, slot 0x0A's body (checked, not hooked)
    formRemove: 0x1dfff0, // 14609 TESForm::RemoveChange, slot 0x0B's body (checked, not hooked)
    forcedAdd: 0x1dffc0, // 14608 the forced entry (checked, not hooked)
    npcAdd: 0x3a93a0, // 24385 TESActorBase's AddChange override (TESNPC's slot 0x0A)
    npcRemove: 0x3a9420, // 24386 TESActorBase's RemoveChange override
    formVtable: 0x1780b00, // 187895 VTABLE_TESForm[0]
  },
};
const FORM = { id: 0x14, type: 0x1a }; // TESForm.h:354, :356
const REFR_BASE = 0x40; // TESObjectREFR.h:495 OBJ_REFR data at 0x40, its objectReference at 0x00 (:77)
const FORM_TYPE_MAX = 0x8a; // FormTypes.h: FormType::Max

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
  0x0b: { 1: 'kFactionFlags', 2: 'kFactionReactions', 31: 'kFactionCrimeCounts' },
  0x67: { 1: 'kZoneFlags', 31: 'kGameData' },
  0x68: { 30: 'kKeywordData', 31: 'kCleared' },
  0x4f: { 26: 'kWaitingFlag', 31: 'kNeverRunFlag' },
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

const exe = Process.getModuleByName('SkyrimSE.exe');
const version = fileVersion(exe.path);
const off = OFFSETS[version];
if (off === undefined) {
  emit({ error: 'no offsets for this runtime', version: version });
} else {
  const lo = exe.base;
  const hi = exe.base.add(exe.size);
  const inExe = function (p) { return p.compare(lo) >= 0 && p.compare(hi) < 0; };
  const executable = function (p) {
    const r = Process.findRangeByAddress(p);
    return r !== null && r.protection.indexOf('x') >= 0;
  };
  const at = function (name) { return exe.base.add(off[name]); };
  const rva = function (p) { return hex(p.sub(lo).toUInt32()); };
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
  // the first jmp within ten instructions of p, and whether it lands on want (14607 and 14608 start mov rax, rcx; the jmp is +0x18)
  const jumpOf = function (p, want) {
    try {
      let i = Instruction.parse(p);
      for (let n = 0; n < 10; n++) {
        if (i.mnemonic === 'jmp') {
          let to = NULL;
          try { to = ptr(i.opStr); } catch (e) { to = NULL; }
          return { at: rva(i.address), op: i.opStr, toWant: !to.isNull() && to.equals(want) };
        }
        i = Instruction.parse(i.next);
      }
      return { error: 'no jmp in ten instructions' };
    } catch (e) { return { error: 'unparsed: ' + e }; }
  };

  // the checks the ready row carries: slot 0x0A of TESForm's vtable holds 14607, and 14607 and 14608 lead to 35576
  const slotA = ptrAt(at('formVtable'), 0x0a * 8);
  const checks = {
    slot0A: rva(slotA), slot0AIs14607: slotA.equals(at('formAdd')),
    formAddJump: jumpOf(at('formAdd'), at('innerAdd')), forcedAddJump: jumpOf(at('forcedAdd'), at('innerAdd')),
    formRemoveJump: jumpOf(at('formRemove'), at('innerRemove')),
  };
  const refuse = [];
  for (const name of ['innerAdd', 'innerRemove', 'npcAdd', 'npcRemove']) {
    if (!executable(at(name))) refuse.push(name);
  }
  if (refuse.length > 0) {
    emit({ event: 'ready', error: 'a target is not executable', refuse: refuse, checks: checks, pid: Process.id });
  } else {
    const keys = {};
    const raw = { innerAdd: 0, innerRemove: 0, npcAdd: 0, npcRemove: 0, npcOwn: 0 };
    let rowsThisSecond = 0;
    let second = 0;
    let foreign = 0;
    const inNpc = {}; // thread id -> { reached }
    const note = function (fn, form, flags, ret, answer, force) {
      const type = u8(form, FORM.type);
      if (type < 0 || type >= FORM_TYPE_MAX) { foreign += 1; return; }
      const caller = callerOf(ret);
      const key = fn + '|' + type + '|' + flags + '|' + caller + '|' + force;
      let k = keys[key];
      if (k === undefined) {
        k = { fn: fn, type: type, flags: flags, caller: caller, force: force, n: 0, nTrue: 0, sent: 0, lastId: 0, printed: 0 };
        keys[key] = k;
      }
      const id = u32(form, FORM.id);
      k.n += 1;
      if (answer === 1) k.nTrue += 1;
      k.lastId = id;
      if (k.printed >= FIRST_N || spent > BUDGET) return;
      const s = Math.floor(Date.now() / 1000);
      if (s !== second) { second = s; rowsThisSecond = 0; }
      if (rowsThisSecond >= MAX_ROWS_PER_S) return;
      rowsThisSecond += 1;
      k.printed += 1;
      const row = { event: 'call', fn: fn, type: TYPE_NAMES[type] || hex(type), flags: hex(flags), names: flagNames(type, flags),
        caller: caller, id: hex(id), answer: answer, force: force };
      if (isRefr(type)) row.base = hex(u32(ptrAt(form, REFR_BASE), FORM.id));
      emit(row);
    };

    const attachErrors = [];
    const attach = function (name, cb) { try { Interceptor.attach(at(name), cb); } catch (e) { attachErrors.push(name + ': ' + e); } };
    attach('innerAdd', {
      onEnter(args) {
        raw.innerAdd += 1;
        let ret = this.returnAddress;
        const g = inNpc[this.threadId];
        if (g !== undefined) { g.reached = true; ret = g.ret; } // under TESNPC's hook the return slot holds Frida's trampoline
        this.form = args[1]; this.flags = args[2].toUInt32(); this.force = args[3].toUInt32() & 0xff; this.ret = ret;
      },
      onLeave(retval) { note('AddChange', this.form, this.flags, this.ret, retval.toUInt32() & 0xff, this.force); },
    });
    attach('innerRemove', {
      onEnter(args) {
        raw.innerRemove += 1;
        let ret = this.returnAddress;
        const g = inNpc[this.threadId];
        if (g !== undefined) { g.reached = true; ret = g.ret; }
        note('RemoveChange', args[1], args[2].toUInt32(), ret, -1, -1);
      },
    });
    const npcHook = function (fn, counter) {
      return {
        onEnter(args) {
          raw[counter] += 1;
          this.tid = this.threadId; // 24385 and 24386 do not nest (their review): set unconditionally, so a throw leaves no stale guard
          inNpc[this.tid] = { reached: false, ret: this.returnAddress };
          this.form = args[0]; this.flags = args[1].toUInt32(); this.ret = this.returnAddress;
        },
        onLeave(retval) {
          const g = inNpc[this.tid];
          delete inNpc[this.tid];
          if (g === undefined || g.reached) return; // counted at the inner function
          raw.npcOwn += 1;
          note(fn, this.form, this.flags, this.ret, fn === 'AddChangeNPC' ? (retval.toUInt32() & 0xff) : -1, -1);
        },
      };
    };
    attach('npcAdd', npcHook('AddChangeNPC', 'npcAdd'));
    attach('npcRemove', npcHook('RemoveChangeNPC', 'npcRemove'));

    let lastSum = 0;
    setInterval(function () {
      const now = Date.now();
      if (spent > BUDGET && now - lastSum < 5000) return;
      lastSum = now;
      const rows = [];
      for (const key in keys) {
        const k = keys[key];
        if (k.n === k.sent) continue;
        rows.push([k.fn, TYPE_NAMES[k.type] || hex(k.type), hex(k.flags), k.caller, k.force, k.n - k.sent, k.n, k.nTrue, hex(k.lastId)]);
        k.sent = k.n;
      }
      for (let i = 0; i < rows.length; i += 80) {
        emit({ event: 'sum', cols: 'fn type flags caller force new total true lastId', rows: rows.slice(i, i + 80), part: i / 80,
          foreign: foreign, spent: spent });
      }
    }, FLUSH_MS);
    setInterval(function () { emit({ event: 'heartbeat', raw: raw, foreign: foreign, keys: Object.keys(keys).length }); }, 10000);

    emit({ event: 'ready', version: version, pid: Process.id, base: String(exe.base), checks: checks, attachErrors: attachErrors,
      hooks: { innerAdd: rva(at('innerAdd')), innerRemove: rva(at('innerRemove')), npcAdd: rva(at('npcAdd')), npcRemove: rva(at('npcRemove')) },
      first_n: FIRST_N, flush_ms: FLUSH_MS, budget: BUDGET });
  }
}
