// serialize-on-demand.js (thuum, the re-analyst 2026-11-03; docs/research/adr065-serialize-on-demand-2026-11-03.md Q4): on the
// Run 20261103-131511 (serialize mode, c1 solo): GREEN, the on-demand record equal to the stash's 40 bytes, FNV-1a 0x4ebbb261,
// the entry untouched; the layout, the five signatures, the main-thread mark and the equality CONFIRMED (the note's run section).
// owner, for a LOADED reference FORM, run the engine's own change-form serializer on a scratch BGSSaveFormBuffer when AddChange
// (AL 35576) marks it with FLAG, and compare the bytes with the record the engine stores itself at the cell's unload (the stash,
// AL 35570, read as transplant-capture.js reads it). MODE "check" (default): at the trigger each premise is read and printed as
// a row, with the entry's flags and whether its record is null; only the map's read (AL 35503) is called, nothing is allocated.
// MODE "serialize": the note's Q4 recipe with the ids below, one report row, the record freed (ours), the buffer destroyed,
// the entry read back. Never: a changes-map write (35509, 35507, 35508, 35510, 35511), kSaving, TLS +0x670, the reference maps
// (35907, 35902). The stash and the map write are hooked for FORM: the engine's record prints at the purge and a compare row
// says equal or names the first differing offset and its section. Both modes refuse, naming the failed premises. Every engine call
// is wrapped, but a native fault inside 0x0D or 0x0E is only CONVERTED into a JS exception (Frida's default exceptions: 'steal'),
// which unwinds past the engine's own cleanup, a lock taken inside staying held: the premises are the real safety, the wrap only
// keeps the seat alive to print. REFR only (type 0x3D): an actor's bytes are HYPOTHESIS-incomplete, the stash calls its slot
// 0xF2 before 0x0D for an actor with a currentProcess and that signature is not in the note. counts.innerAdd in the liveness
// row is the Interceptor's pulse (AddChange fires constantly for the AI's marks), in place of a kernel32!Sleep attach. Every id,
// offset, signature and layout is the static read's (the note's id table), a HYPOTHESIS until this trace reads as expected
// (rule 2); slots 19527 and 19528 and the singletons are CONFIRMED-STATIC.
const PARAMS = (typeof LAB_PARAMS === 'object' && LAB_PARAMS) ? LAB_PARAMS : {};
const FORM = Number(PARAMS.FORM);
const MODE = PARAMS.MODE === 'serialize' ? 'serialize' : 'check';
const FLAG = PARAMS.FLAG === undefined ? 0x1000 : Number(PARAMS.FLAG); // kLockExtra, TESObjectREFR.h:150; 0xffffffff for any mark
const RUNS = PARAMS.RUNS === undefined ? 1 : Number(PARAMS.RUNS);
function emit(obj) {
  obj.t = Date.now();
  send(obj);
  console.log(JSON.stringify(obj));
}
// Offsets: the note's id table and `just addr` (Address Library 1.6.1170 only), 2026-11-03
const OFFSETS = {
  '1.6.1170.0': {
    innerAdd: 0x604320, // 35576 BGSSaveLoadGame's AddChange (manager, form, flags, force)
    stash: 0x603a70, // 35570 the stash at a cell's unload (manager, form, force)
    mapRead: 0x600930, // 35503 the changes map's read (map, form id, Value*) -> bool
    mapWrite: 0x600e20, // 35509 the changes map's write (hooked only)
    bufCtor: 0x626a90, // 36035 BGSSaveFormBuffer ctor
    bufInit: 0x626ce0, // 36037 the header (buf, form id, flags, type, version)
    bufDestroy: 0x626e20, // 36044 frees the buffer's data
    initialData: 0x60e1c0, // 35715 the initial data (buf, form, flags u32) -> kind
    pack: 0x6283e0, // 36081 buffer to record (out, buf), engine heap
    saveVersion: 0x610980, // 35740 returns 0x4e
    heap: 0x11bba0, // 11141 MemoryManager::GetSingleton (MemoryManager.h:29)
    deallocate: 0xcc4510, // 68117 MemoryManager::Deallocate (MemoryManager.h:43)
    saveLoadGame: 0x317aba8, // 403330 BGSSaveLoadGame** (BGSSaveLoadGame.h:71)
    saveLoadManager: 0x317abf0, // 403340 BGSSaveLoadManager** (Offsets.h:54)
    main: 0x31872c0, // 403449 Main** (Offsets.h:383)
    dataHandler: 0x20f6320, // 400269 TESDataHandler** (Offsets.h:504, TESDataHandler.cpp:10), dereferenced once
    refrCheckSave: 0x2da4f0, // 19527 TESObjectREFR::CheckSaveGame, slot 0x0D
    refrSave: 0x2da5c0, // 19528 TESObjectREFR::SaveGame, slot 0x0E
  },
};
// layouts (the buffer's from the note's Q1, HYPOTHESIS)
const FORM_FLAGS = 0x10, FORM_ID = 0x14, IN_GAME_FLAGS = 0x18, FORM_TYPE = 0x1a; // TESForm.h:353-356
const CHANGES_MAP = 0x330, MANAGER_FLAGS = 0x340; // BGSSaveLoadGame.h:94, :96 (kLoading 1 << 1, kSaving 1 << 2, :61-62)
const DRY_RUN = 0x120; // BGSSaveLoadManager.h:114 unk120 is u16; the engine tests one byte, so one is read
const CLEARING_DATA = 0xda5; // TESDataHandler.h:76-88 clearingData, by arithmetic from 0xDA0 (HYPOTHESIS)
const RESET_GAME = 0x11, MAIN_THREAD = 0x28; // Main.h:78 resetGame, :87 threadID
const BUF = { data: 0x08, pos: 0x14, header: 0x18, flags: 0x1b, form: 0x28, size: 0x30 }; // BGSSaveGameBuffer.h:30-32, BGSSaveFormBuffer.h:23-25
const SLOT_CHECK = 0x0d, SLOT_SAVE = 0x0e; // TESForm.h:136-137
const REFR = 0x3d; // FormType::Reference, the only type admitted
const CAP = 65536; // hex printed up to this many bytes
const REFUSED_ROWS = 8;

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
const u8 = function (p, o) { try { return p.add(o).readU8(); } catch (e) { return -1; } };
const u32 = function (p, o) { try { return p.add(o).readU32(); } catch (e) { return -1; } };
const ptrAt = function (p, o) { try { return p.add(o).readPointer(); } catch (e) { return NULL; } };
const toHex = function (p, n) {
  const a = new Uint8Array(p.readByteArray(n));
  let s = '';
  for (let i = 0; i < a.length; i++) s += ('0' + a[i].toString(16)).slice(-2);
  return s;
};
const fnv1a = function (bytes) { let h = 0x811c9dc5; for (const b of bytes) { h ^= b; h = Math.imul(h, 0x01000193) >>> 0; } return h >>> 0; };
// a record (the pack 36081): type index and size code, version, length1, length2 (0 when raw), the data inline
const recordHeader = function (rec) {
  const b0 = rec.readU8();
  const s = b0 >> 6;
  const n = s === 0 ? 1 : (s === 1 ? 2 : 4);
  const len = function (o) { return n === 1 ? rec.add(o).readU8() : (n === 2 ? rec.add(o).readU16() : rec.add(o).readU32()); };
  const length1 = len(2);
  return { type: b0 & 0x3f, sizeCode: s, version: rec.add(1).readU8(), length1: length1, length2: len(2 + n), total: 2 + 2 * n + length1 };
};

const exe = Process.getModuleByName('SkyrimSE.exe');
const version = fileVersion(exe.path);
const off = OFFSETS[version];
if (off === undefined || !(FORM > 0)) {
  emit({ event: 'ready', error: off === undefined ? 'no offsets for this runtime' : 'FORM is required', version: version, pid: Process.id });
} else {
  const at = function (name) { return exe.base.add(off[name]); };
  const rva = function (p) { return hex(p.sub(exe.base).toUInt32()); };
  const nf = {
    mapRead: new NativeFunction(at('mapRead'), 'bool', ['pointer', 'uint32', 'pointer']),
    bufCtor: new NativeFunction(at('bufCtor'), 'pointer', ['pointer']),
    bufInit: new NativeFunction(at('bufInit'), 'void', ['pointer', 'uint32', 'uint32', 'uint32', 'uint8']),
    bufDestroy: new NativeFunction(at('bufDestroy'), 'void', ['pointer']),
    initialData: new NativeFunction(at('initialData'), 'uint32', ['pointer', 'pointer', 'uint32']),
    pack: new NativeFunction(at('pack'), 'void', ['pointer', 'pointer']),
    saveVersion: new NativeFunction(at('saveVersion'), 'uint8', []),
    heapOf: new NativeFunction(at('heap'), 'pointer', []),
    deallocate: new NativeFunction(at('deallocate'), 'void', ['pointer', 'pointer', 'bool']),
  };
  const slotFn = function (p, ret) { return new NativeFunction(p, ret, ['pointer', 'pointer']); };
  const singletons = function () {
    return { game: ptrAt(at('saveLoadGame'), 0), manager: ptrAt(at('saveLoadManager'), 0), main: ptrAt(at('main'), 0), handler: ptrAt(at('dataHandler'), 0) };
  };
  const value = Memory.alloc(16); // the entry's Value
  const readEntry = function (map) {
    value.writeU32(0); value.add(4).writeU32(0); value.add(8).writePointer(NULL);
    const found = nf.mapRead(map, FORM, value);
    return { found: found, flags: value.readU32(), record: value.add(8).readPointer() };
  };

  // the premises (the note's Q2, Q4); any failure refuses both modes
  const premises = function (form, threadId) {
    const s = singletons();
    const checks = [];
    const add = function (name, val, ok) { checks.push({ name: name, value: val, ok: ok }); };
    add('BGSSaveLoadGame', String(s.game), !s.game.isNull());
    add('BGSSaveLoadManager', String(s.manager), !s.manager.isNull());
    const mflags = s.game.isNull() ? -1 : u32(s.game, MANAGER_FLAGS);
    add('kLoading, kSaving clear', hex(mflags), mflags >= 0 && (mflags & 6) === 0);
    const dry = s.manager.isNull() ? -1 : u8(s.manager, DRY_RUN);
    add('dry-run byte zero (+0x120)', dry, dry === 0);
    const clearing = s.handler.isNull() ? -1 : u8(s.handler, CLEARING_DATA);
    add('clearingData zero (+0xDA5, HYPOTHESIS)', clearing, clearing === 0);
    const reset = s.main.isNull() ? -1 : u8(s.main, RESET_GAME);
    add('resetGame zero (+0x11)', reset, reset === 0);
    const mainThread = s.main.isNull() ? -1 : u32(s.main, MAIN_THREAD);
    add('on Main.threadID', mainThread + ' vs ' + threadId, mainThread === threadId);
    const fflags = u32(form, FORM_FLAGS);
    add('not kTemporary (bit 14)', hex(fflags), fflags >= 0 && ((fflags >>> 14) & 1) === 0);
    const igf = u32(form, IN_GAME_FLAGS) & 0xffff;
    add('inGameFormFlags bits 0, 7 clear', hex(igf), igf >= 0 && (igf & 0x81) === 0);
    const type = u8(form, FORM_TYPE);
    add('form type REFR 0x3D (actors: see the header)', hex(type), type === REFR);
    const vt = ptrAt(form, 0);
    const slotC = vt.isNull() ? NULL : ptrAt(vt, SLOT_CHECK * 8);
    const slotS = vt.isNull() ? NULL : ptrAt(vt, SLOT_SAVE * 8);
    add('slot 0x0D is 19527', rva(slotC), slotC.equals(at('refrCheckSave')));
    add('slot 0x0E is 19528', rva(slotS), slotS.equals(at('refrSave')));
    const map = s.game.isNull() ? NULL : ptrAt(s.game, CHANGES_MAP);
    let entry = { found: false, flags: 0, record: NULL };
    if (!map.isNull()) entry = readEntry(map);
    add('entry present', entry.found ? hex(entry.flags) : 'none', entry.found);
    add('entry record null (else send the stashed one)', String(entry.record), entry.found && entry.record.isNull());
    return { ok: checks.every(function (c) { return c.ok; }), checks: checks, entry: entry, type: type, slotC: slotC, slotS: slotS, map: map };
  };

  let onDemand = null; // the last on-demand record, for the compare at the purge
  const serialize = function (form, p, threadId) {
    const row = { event: 'serialize', form: hex(FORM), thread: threadId, entryFlags: hex(p.entry.flags) };
    let buf = null;
    let rec = NULL;
    let step = 'ctor 36035';
    try {
      const raw = Memory.alloc(BUF.size); // ours; the engine owns only the data at +0x08
      for (let o = 0; o < BUF.size; o += 8) raw.add(o).writeU64(0);
      nf.bufCtor(raw);
      buf = raw; // only once the ctor returned: a throw inside it must not send an unconstructed object to 36044
      step = 'header 36037';
      const ver = nf.saveVersion();
      nf.bufInit(buf, FORM, p.entry.flags, p.type, ver);
      buf.add(BUF.form).writePointer(form);
      step = 'slot 0x0D';
      const ok = slotFn(p.slotC, 'bool')(form, buf);
      row.checkSaveGame = ok;
      if (!ok) {
        row.result = 'nothing to save (0x0D returned 0; the entry is left alone)';
      } else {
        const flags2 = u32(buf, BUF.flags);
        row.headerFlags = hex(flags2);
        step = 'initial data 35715';
        row.kind = nf.initialData(buf, form, flags2);
        step = 'slot 0x0E';
        slotFn(p.slotS, 'void')(form, buf);
        row.header = toHex(buf.add(BUF.header), 9);
        step = 'pack 36081';
        const out = Memory.alloc(16); // zeroed, printed whole
        out.writeU64(0); out.add(8).writeU64(0);
        nf.pack(out, buf);
        rec = out.readPointer();
        row.packOut = toHex(out, 16);
        if (rec.isNull()) throw new Error('the pack gave no record');
        const h = recordHeader(rec);
        const n = Math.min(h.total, CAP);
        const bytes = new Uint8Array(rec.readByteArray(n));
        row.record = h;
        row.hex = toHex(rec, n);
        if (h.total > CAP) row.truncated = true;
        row.fnv1a = hex(fnv1a(bytes));
        onDemand = { bytes: bytes, flags2: flags2, kind: row.kind, header: h };
        row.result = 'ok';
      }
    } catch (e) { row.error = 'at ' + step + ': ' + e; }
    try { if (!rec.isNull()) { nf.deallocate(nf.heapOf(), rec, 0); row.recordFreed = true; } } catch (e) { row.freeError = String(e); }
    try { if (buf !== null) { nf.bufDestroy(buf); row.bufferDestroyed = true; } } catch (e) { row.destroyError = String(e); }
    try {
      const after = readEntry(p.map);
      row.entryAfter = { found: after.found, flags: hex(after.flags), record: String(after.record) };
      row.entryUntouched = after.found && after.flags === p.entry.flags && after.record.isNull();
    } catch (e) { row.entryAfterError = String(e); }
    emit(row);
  };

  // sections: record header; form fields (6 bytes for bit 0, 3 for bit 7, 4 for bit 4); extras; the animation block (the last
  // varint-prefixed block when bit 28 is set, found from the end with a POSITIVE remainder; its tail is 2a 00 00 00 plus two bools)
  const sectionOf = function (offset, od) {
    const n = od.header.sizeCode === 0 ? 1 : (od.header.sizeCode === 1 ? 2 : 4);
    const bodyStart = 2 + 2 * n;
    if (offset < bodyStart) return 'record header';
    const f = od.flags2;
    if (od.kind !== 0 || (f & 0x08000020) !== 0) return 'body (initial data or inventory: unsectioned)'; // kInventory | kLeveledInventory, TESObjectREFR.h:145, :156
    const prefix = ((f & 1) !== 0 ? 6 : 0) + (((f >>> 7) & 1) !== 0 ? 3 : 0) + (((f >>> 4) & 1) !== 0 ? 4 : 0);
    const o = offset - bodyStart;
    if (o < prefix) return 'form fields (' + prefix + ' bytes before the extras)';
    const body = od.bytes.subarray(bodyStart);
    const L = body.length;
    let anim = -1;
    if (((f >>> 28) & 1) !== 0) {
      for (let p = L - 1; p >= prefix; p--) {
        const b = body[p];
        const r1 = L - p - 1;
        if (r1 > 0 && (b & 3) === 0 && (b >> 2) === r1) { anim = p; break; }
        const r2 = L - p - 2;
        if (r2 > 0 && (b & 3) === 1 && (((body[p + 1] << 8) | b) >> 2) === r2) { anim = p; break; }
      }
    }
    const tail = L >= 6 && body[L - 6] === 0x2a && body[L - 5] === 0 && body[L - 4] === 0 && body[L - 3] === 0 && body[L - 2] <= 1 && body[L - 1] <= 1;
    if (anim >= 0 && o >= anim) return 'animation block (varint at body+' + anim + (tail ? ', tail anchor ok)' : ', tail anchor absent)');
    return 'extras' + (anim >= 0 || ((f >>> 28) & 1) === 0 ? '' : ' (no animation varint found)');
  };
  const compare = function (engineHex) {
    if (onDemand === null) { emit({ event: 'compare', result: 'no on-demand record' }); return; }
    const a = onDemand.bytes;
    const b = new Uint8Array(engineHex.length / 2);
    for (let i = 0; i < b.length; i++) b[i] = parseInt(engineHex.substr(2 * i, 2), 16);
    let i = 0;
    while (i < a.length && i < b.length && a[i] === b[i]) i++;
    if (i === a.length && a.length === b.length) { emit({ event: 'compare', equal: true, bytes: a.length }); return; }
    emit({ event: 'compare', equal: false, firstDiff: i, section: sectionOf(i, onDemand), onDemandLength: a.length, engineLength: b.length });
  };

  const counts = { innerAdd: 0, innerAddForm: 0, triggers: 0, runs: 0, refused: 0, stash: 0, stashForm: 0, mapWrite: 0, mapWriteForm: 0 };
  let busy = false; // 0x0E may re-enter AddChange
  const act = function (form, flags, threadId) {
    counts.triggers += 1;
    if (counts.runs >= RUNS || busy) return;
    busy = true;
    try {
      const p = premises(form, threadId);
      if (p.ok) counts.runs += 1; else counts.refused += 1; // a refused trigger does not consume RUNS
      if (p.ok || counts.refused <= REFUSED_ROWS) {
        if (MODE === 'check') { for (const c of p.checks) emit({ event: 'check', name: c.name, value: c.value, ok: c.ok }); }
        const failed = p.checks.filter(function (c) { return !c.ok; }).map(function (c) { return c.name; });
        emit({ event: p.ok ? 'premises' : 'refused', mode: MODE, trigger: hex(flags), thread: threadId, ok: p.ok, failed: failed,
          entryFlags: hex(p.entry.flags), entryRecordNull: p.entry.record.isNull() });
      }
      if (p.ok && MODE === 'serialize') serialize(form, p, threadId);
    } catch (e) { emit({ event: 'error', where: 'act', error: String(e) }); }
    busy = false;
  };
  const firstBytes = function (name) { return rva(at(name)) + ':' + toHex(at(name), 4); };
  const hookBytes = { innerAdd: firstBytes('innerAdd'), stash: firstBytes('stash'), mapWrite: firstBytes('mapWrite') }; // pre-attach
  const attachErrors = [];
  const attach = function (name, cb) { try { Interceptor.attach(at(name), cb); } catch (e) { attachErrors.push(name + ': ' + e); } };
  attach('innerAdd', {
    onEnter(args) { counts.innerAdd += 1; this.form = args[1]; this.flags = args[2].toUInt32(); this.id = u32(args[1], FORM_ID); },
    onLeave(retval) {
      if (this.id !== FORM) return;
      counts.innerAddForm += 1;
      if ((retval.toUInt32() & 0xff) === 1 && (this.flags & FLAG) !== 0) act(this.form, this.flags, this.threadId);
    },
  });
  attach('stash', {
    onEnter(args) { counts.stash += 1; this.id = u32(args[1], FORM_ID); this.ret = this.returnAddress; },
    onLeave() {
      if (this.id !== FORM) return;
      counts.stashForm += 1;
      emit({ event: 'stash', form: hex(FORM), caller: rva(this.ret), thread: this.threadId });
      try {
        const s = singletons();
        const map = s.game.isNull() ? NULL : ptrAt(s.game, CHANGES_MAP);
        if (map.isNull()) { emit({ event: 'record', error: 'no changes map' }); return; }
        const e = readEntry(map);
        const row = { event: 'record', form: hex(FORM), found: e.found, flags: hex(e.flags), record: String(e.record) };
        if (e.found && !e.record.isNull()) {
          const h = recordHeader(e.record);
          const m = Math.min(h.total, CAP);
          Object.assign(row, h);
          row.hex = toHex(e.record, m);
          if (h.total > CAP) row.truncated = true;
          row.fnv1a = hex(fnv1a(new Uint8Array(e.record.readByteArray(m))));
        }
        emit(row);
        if (row.hex !== undefined) compare(row.hex);
      } catch (err) { emit({ event: 'error', where: 'stash read', error: String(err) }); }
    },
  });
  attach('mapWrite', {
    onEnter(args) {
      counts.mapWrite += 1;
      if (args[1].toUInt32() !== FORM) return;
      counts.mapWriteForm += 1;
      emit({ event: 'write', form: hex(FORM), flags: hex(u32(args[2], 0)), record: String(ptrAt(args[2], 8)), caller: rva(this.returnAddress) });
    },
  });
  setInterval(function () { emit({ event: 'liveness', counts: counts }); }, 10000);

  const s0 = singletons();
  let ver0 = -1;
  try { ver0 = nf.saveVersion(); } catch (e) { attachErrors.push('saveVersion: ' + e); }
  emit({ event: 'ready', version: version, pid: Process.id, base: String(exe.base), form: hex(FORM), mode: MODE, flag: hex(FLAG),
    hooks: hookBytes, game: String(s0.game), manager: String(s0.manager), main: String(s0.main), handler: String(s0.handler),
    managerFlags: s0.game.isNull() ? -1 : hex(u32(s0.game, MANAGER_FLAGS)), dryRun: s0.manager.isNull() ? -1 : u8(s0.manager, DRY_RUN),
    mainThread: s0.main.isNull() ? -1 : u32(s0.main, MAIN_THREAD), saveVersion: ver0, attachErrors: attachErrors });
}
