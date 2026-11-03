// serialize-on-demand-actor.js (thuum, the re-analyst 2026-11-03; docs/research/adr065-serialize-on-demand-2026-11-03.md, "The actor
// class"): serialize-on-demand.js's recipe (GREEN, run 20261103-131511) for a LOADED actor FORM (ACHR 0x3E only). At AddChange's inner
// (AL 35576) marking FORM with FLAG (default kLifeState: a kill), on the marking thread: 36035, 36037, slot 0x0D (19527, no Actor
// override), 35715, slot 0x0E (37649 Actor::SaveGame), the plain body read from the buffer, 36081; record freed, buffer destroyed,
// entry re-read. Against the REFR script: NO slot 0xF2 pre-call (37622 Actor::MovetoLow is the unload's AI demotion; hooked only to
// prove it never runs here); two more premises (not the player; farGeometry before and after 0x0E: HYPOTHESIS, a set flag makes 0x0E
// remove the far skin); a save-shaped record (level 0 or 1, the process block present); the body sectioned by the engine's own writers
// (19528, 39429, 38987, 39009, 39023 hooked on this thread, buffer position +0x14 at entry and exit). DECODED: level, boolBits, the 56
// fixed bytes (myKiller, weight), ActorState (lifeState at its byte 4), the four Modifiers; RAW with offsets: the initial data, extras,
// inventory, the process block, casters, avStorage, the tail (boolFlags): the 20 KiB cap. length2 nonzero means the pack deflated the
// body (35932, under the setting byte AL 380705); the engine inflates inside 36080 (35933, no signature in the note), never called here:
// deflated: true, and the decode is of the plain body read before the pack. MODE check (default): the premises, one row each, no 0x0D,
// no 0x0E, nothing allocated; serialize: the recipe, one row. No map write, no kSaving, no TLS +0x670, no reference maps. The stash
// (35570) and the map write are hooked for FORM: a record that comes gets a compare row; a promoted actor never stashes (change-forms.md
// D7), the serialize row says so, and no stash row is then no error. Every engine call is wrapped, but a fault inside 0x0D or 0x0E is
// only CONVERTED to a JS exception (a lock taken inside stays held): the premises are the real safety. Every id, offset, signature and
// layout is the static read's (the note, CommonLib, `just addr`): HYPOTHESIS until a run reads as expected (rule 2); slots and
// singletons CONFIRMED-STATIC. LAB_PARAMS: FORM (required), MODE, FLAG (0xffffffff: any mark), RUNS (1). Ready prints Process.id.
// Size: above the 20 KiB cap (the REFR skeleton alone is 20.7 KB), so put wait: 15 after the frida step before the kill.
const PARAMS = (typeof LAB_PARAMS === 'object' && LAB_PARAMS) ? LAB_PARAMS : {};
const FORM = Number(PARAMS.FORM);
const MODE = PARAMS.MODE === 'serialize' ? 'serialize' : 'check';
const FLAG = PARAMS.FLAG === undefined ? 0x400 : Number(PARAMS.FLAG); // Actor.h:234 kLifeState = 1 << 10
const RUNS = PARAMS.RUNS === undefined ? 1 : Number(PARAMS.RUNS);
function emit(obj) {
  obj.t = Date.now();
  send(obj);
  console.log(JSON.stringify(obj));
}
// Offsets: the note's id tables and `just addr` (Address Library 1.6.1170 only), 2026-11-03
const OFFSETS = {
  '1.6.1170.0': {
    innerAdd: 0x604320, // 35576 AddChange's inner (manager, form, flags, force)
    stash: 0x603a70, // 35570 the stash at a cell's unload (manager, form, force)
    mapRead: 0x600930, // 35503 the changes map's read (map, form id, Value*) -> bool
    mapWrite: 0x600e20, // 35509 the changes map's write (hooked only)
    bufCtor: 0x626a90, // 36035 BGSSaveFormBuffer ctor
    bufInit: 0x626ce0, // 36037 the header (buf, id, flags, type, version)
    bufDestroy: 0x626e20, // 36044 frees the buffer's data
    initialData: 0x60e1c0, // 35715 the initial data (buf, form, flags) -> kind
    pack: 0x6283e0, // 36081 buffer to record (out, buf), engine heap
    saveVersion: 0x610980, // 35740 returns 0x4e
    heap: 0x11bba0, // 11141 MemoryManager::GetSingleton
    deallocate: 0xcc4510, // 68117 MemoryManager::Deallocate
    saveLoadGame: 0x317aba8, // 403330 BGSSaveLoadGame** (BGSSaveLoadGame.h:71)
    saveLoadManager: 0x317abf0, // 403340 BGSSaveLoadManager** (Offsets.h:54)
    main: 0x31872c0, // 403449 Main** (Offsets.h:383)
    dataHandler: 0x20f6320, // 400269 TESDataHandler** (Offsets.h:504)
    player: 0x31874f8, // 403521 NiPointer<PlayerCharacter> (Offsets.h:451), one pointer read
    deflateSetting: 0x20122a0, // 380705 the deflate setting byte (HYPOTHESIS), read only
    refrCheckSave: 0x2da4f0, // 19527 TESObjectREFR::CheckSaveGame = Actor's slot 0x0D
    actorSave: 0x686710, // 37649 Actor::SaveGame, slot 0x0E (Actor.h:275)
    movetoLow: 0x6826d0, // 37622 Actor::MovetoLow, slot 0xF2 (Actor.h:440): hooked, NEVER called
    refrSave: 0x2da5c0, // 19528 TESObjectREFR::SaveGame inside 37649 (mark refr)
    processSave: 0x6e4710, // 39429 AIProcess::SaveGame (mark process)
    actorStateSave: 0x6cea60, // 38987 the ActorState block (mark actorState)
    modifiersSave: 0x6cff40, // 39009 a Modifiers block (mark modifiers, four times)
    avStorageSave: 0x6d1030, // 39023 the ActorValueStorage block (mark avStorage)
  },
};
// TESForm.h:353-356; BGSSaveLoadGame.h:61-62, :94, :96; BGSSaveLoadManager.h:114; TESDataHandler.h:76-88 (clearingData from 0xDA0,
// HYPOTHESIS); Main.h:78, :87; BGSSaveGameBuffer.h:30-32, BGSSaveFormBuffer.h:23-25; TESForm.h:136-137, Actor.h:440
const FORM_FLAGS = 0x10, FORM_ID = 0x14, IN_GAME_FLAGS = 0x18, FORM_TYPE = 0x1a;
const CHANGES_MAP = 0x330, MANAGER_FLAGS = 0x340, DRY_RUN = 0x120, CLEARING_DATA = 0xda5, RESET_GAME = 0x11, MAIN_THREAD = 0x28;
const BUF = { data: 0x08, pos: 0x14, header: 0x18, flags: 0x1b, form: 0x28, size: 0x30 };
const SLOT_CHECK = 0x0d, SLOT_SAVE = 0x0e, SLOT_MOVETO_LOW = 0xf2;
// Actor at 1.6.1170: CommonLib's runtime block plus 8 (Actor.h:712): boolBits :647, currentProcess :651, movementController :667,
// boolFlags :686; ActorState at 0xC0 (:737), actorState1 at its +8 (ActorState.h:203), lifeState bits 21-24 (:114); AIProcess::high
// +0x10 (AIProcess.h:197), processLevel +0x137 (:225); HighProcessData::farGeometry +0x468 (:357); FormTypes.h:202; TESObjectREFR.h:155
const ACHR = 0x3e, PLAYER_ID = 0x14, A_BOOLBITS = 0xe8, A_PROCESS = 0xf8, A_MOVEMENT = 0x150, A_BOOLFLAGS = 0x204, A_STATE1 = 0xc8;
const P_HIGH = 0x10, P_LEVEL = 0x137, H_FAR = 0x468, K_PROMOTED = 1 << 25;
const LIFE = ['kAlive', 'kDying', 'kDead', 'kUnconcious', 'kReanimate', 'kRecycle', 'kRestrained', 'kEssentialDown', 'kBleedout']; // ActorState.h:9-17
const CAP = 65536, REFUSED_ROWS = 8;

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
const bytesHex = function (a) { let s = ''; for (let i = 0; i < a.length; i++) s += ('0' + a[i].toString(16)).slice(-2); return s; };
const toHex = function (p, n) { return bytesHex(new Uint8Array(p.readByteArray(n))); };
const fnv1a = function (bytes) { let h = 0x811c9dc5; for (const b of bytes) { h ^= b; h = Math.imul(h, 0x01000193) >>> 0; } return h >>> 0; };
// a record (the pack 36081): type index and size code, version, length1, length2 (the inflated size, 0 when raw), the data inline
const recordHeader = function (rec) {
  const b0 = rec.readU8();
  const s = b0 >> 6;
  const n = s === 0 ? 1 : (s === 1 ? 2 : 4);
  const len = function (o) { return n === 1 ? rec.add(o).readU8() : (n === 2 ? rec.add(o).readU16() : rec.add(o).readU32()); };
  const length1 = len(2);
  return { type: b0 & 0x3f, sizeCode: s, version: rec.add(1).readU8(), length1: length1, length2: len(2 + n), total: 2 + 2 * n + length1 };
};
// the plain body by the note's actor Q2, bounded by the marks ({n, i, o}: a writer's name, the buffer position at its entry and exit)
const decode = function (b, marks, saveStart) {
  const d = { regions: { initial: [0, saveStart], levelBoolBits: [saveStart, saveStart + 8] }, initialHex: bytesHex(b.subarray(0, saveStart)) };
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const U = function (o) { return hex(dv.getUint32(o, true)); }, F = function (o) { return +dv.getFloat32(o, true).toFixed(3); };
  const span = function (name) { return marks.filter(function (m) { return m.n === name && m.o >= m.i; }).map(function (m) { return [m.i, m.o]; }); };
  try {
    d.level = U(saveStart); // 37649's first u32: AIProcess +0x137 (kHigh 0 to kLow 3) or 0xffffffff for no process
    d.boolBits = U(saveStart + 4);
    const refr = span('refr')[0], proc = span('process')[0], st = span('actorState')[0], mods = span('modifiers'), av = span('avStorage')[0];
    d.regions.refr = refr; d.regions.process = proc || 'absent'; d.regions.actorState = st; d.regions.modifiers = mods; d.regions.avStorage = av;
    if (!refr || !st || mods.length !== 4 || !av) { d.note = 'marks incomplete: regions only'; return d; }
    const f = proc ? proc[1] : refr[1];
    d.regions.fixed = [f, st[0]]; // u8 soundCallBackSet, twelve u32 (updateTargetTimer, voiceTimer, lastUpdate age, checkMyDeadBodyTimer, actionValue,
    // timerOnAction, unk11C, emotionType, emotionValue, criticalStage, thiefCrimeStamp, lastSeenTime), float TESNPC::weight, myKiller as a 3-byte id
    if (st[0] - f === 56) {
      const w = []; for (let k = 0; k < 12; k++) w.push(U(f + 1 + 4 * k));
      d.fixed = { soundCallBackSet: b[f], u32s: w, weight: F(f + 49), myKiller: bytesHex(b.subarray(f + 53, f + 56)) + ' (35928: top two bits the type, 1 game file)' };
    } else d.fixedNote = (st[0] - f) + ' bytes, 56 expected: not decoded';
    const a = st[0]; // 38987: u16 actorState1 bits 0 to 13, u8 sitSleep, fly, lifeState, knock, melee, eleven u8 of actorState2
    if (st[1] - a === 18) d.actorState = { state1: hex(dv.getUint16(a, true)), sitSleep: b[a + 2], fly: b[a + 3], lifeState: b[a + 4], lifeStateName: LIFE[b[a + 4]] || '?', knock: b[a + 5], melee: b[a + 6], state2: bytesHex(b.subarray(a + 7, a + 18)) };
    else d.actorStateNote = (st[1] - a) + ' bytes, 18 expected';
    d.regions.castersSpells = [st[1], mods[0][0]]; // unk1E8 id, four casters (a presence byte each), selectedSpells[4], selectedPower
    const names = ['health', 'magicka', 'stamina', 'voicePoints']; // Actor.h:689-692
    d.modifiers = {};
    mods.forEach(function (m, k) { d.modifiers[names[k]] = m[1] - m[0] === 16 ? { count: dv.getUint32(m[0], true), values: [F(m[0] + 4), F(m[0] + 8), F(m[0] + 12)] } : { bytes: m[1] - m[0] }; });
    d.regions.tail = [av[1], b.length]; // addedSpells, movement byte (0 on demand), boolFlags, combat byte, (id, u32) pairs, two u32, exclusiveBranch, unk273 bit 0
    d.tailHex = bytesHex(b.subarray(av[1]));
  } catch (e) { d.error = String(e); }
  return d;
};
const sectionAt = function (o, regions) {
  for (const k in regions) { const r = regions[k]; if (Array.isArray(r) && o >= r[0] && o < r[1]) return k; }
  return 'unsectioned (extras, inventory or process)';
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
    return { game: ptrAt(at('saveLoadGame'), 0), manager: ptrAt(at('saveLoadManager'), 0), main: ptrAt(at('main'), 0), handler: ptrAt(at('dataHandler'), 0), player: ptrAt(at('player'), 0) };
  };
  const value = Memory.alloc(16); // the entry's Value
  const readEntry = function (map) {
    value.writeU32(0); value.add(4).writeU32(0); value.add(8).writePointer(NULL);
    const found = nf.mapRead(map, FORM, value);
    return { found: found, flags: value.readU32(), record: value.add(8).readPointer() };
  };
  const farGeometry = function (form) { const high = ptrAt(ptrAt(form, A_PROCESS), P_HIGH); return high.isNull() ? 'no high process' : u8(high, H_FAR); };
  const actorInfo = function (form) { // reads only: the live state the record should reflect
    const proc = ptrAt(form, A_PROCESS);
    return { process: String(proc), level: proc.isNull() ? 'none' : u8(proc, P_LEVEL), farGeometry: farGeometry(form), lifeState: (u32(form, A_STATE1) >>> 21) & 0xf,
      boolBits: hex(u32(form, A_BOOLBITS)), boolFlags: hex(u32(form, A_BOOLFLAGS)), movementController: String(ptrAt(form, A_MOVEMENT)) };
  };

  // the premises (the note's Q2, Q4 and the actor Q4); any failure refuses both modes
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
    add('form type ACHR 0x3E', hex(type), type === ACHR);
    add('not the player (id 0x14, the singleton)', hex(FORM) + ' vs ' + String(s.player), FORM !== PLAYER_ID && !s.player.isNull() && !s.player.equals(form));
    const vt = ptrAt(form, 0);
    const slot = function (i) { return vt.isNull() ? NULL : ptrAt(vt, i * 8); };
    const slotC = slot(SLOT_CHECK), slotS = slot(SLOT_SAVE), slotL = slot(SLOT_MOVETO_LOW);
    add('slot 0x0D is 19527', rva(slotC), slotC.equals(at('refrCheckSave')));
    add('slot 0x0E is 37649', rva(slotS), slotS.equals(at('actorSave')));
    add('slot 0xF2 is 37622 (never called)', rva(slotL), slotL.equals(at('movetoLow')));
    const map = s.game.isNull() ? NULL : ptrAt(s.game, CHANGES_MAP);
    let entry = { found: false, flags: 0, record: NULL };
    if (!map.isNull()) entry = readEntry(map);
    add('entry present', entry.found ? hex(entry.flags) : 'none', entry.found);
    add('entry record null (else send the stashed one)', String(entry.record), entry.found && entry.record.isNull());
    return { ok: checks.every(function (c) { return c.ok; }), checks: checks, entry: entry, type: type, slotC: slotC, slotS: slotS, map: map, info: actorInfo(form) };
  };

  // marks: the writers' buffer positions on the recipe's thread (the hooks see our own NativeFunction calls too)
  let tracing = null; // { tid, buf, marks }
  const markHook = function (name) {
    return {
      onEnter(args) {
        if (tracing === null || this.threadId !== tracing.tid) return;
        const b = args[1].equals(tracing.buf) ? args[1] : (args[0].equals(tracing.buf) ? args[0] : null);
        if (b === null) return;
        this.b = b; this.m = { n: name, i: u32(b, BUF.pos), o: -1 }; tracing.marks.push(this.m);
      },
      onLeave() { if (this.m !== undefined) this.m.o = u32(this.b, BUF.pos); },
    };
  };

  let onDemand = null; // the last on-demand result, for the compare at a stash
  const serialize = function (form, p, threadId) {
    const row = { event: 'serialize', form: hex(FORM), thread: threadId, entryFlags: hex(p.entry.flags), live: p.info };
    row.stashExpected = (p.entry.flags & K_PROMOTED) !== 0 ? 'no stash row expected: a promoted reference never stashes (kPromoted; change-forms.md D7)' : 'yes, at the purge';
    let buf = null, rec = NULL, step = 'ctor 36035';
    try {
      const raw = Memory.alloc(BUF.size); // ours; the engine owns only the data at +0x08
      for (let o = 0; o < BUF.size; o += 8) raw.add(o).writeU64(0);
      nf.bufCtor(raw);
      buf = raw; // only once the ctor returned: a throw inside it must not send an unconstructed object to 36044
      step = 'header 36037';
      nf.bufInit(buf, FORM, p.entry.flags, p.type, nf.saveVersion());
      buf.add(BUF.form).writePointer(form);
      step = 'slot 0x0D';
      const ok = slotFn(p.slotC, 'bool')(form, buf);
      row.checkSaveGame = ok;
      if (!ok) {
        row.result = 'nothing to save (0x0D returned 0; the entry is left alone)';
      } else {
        const flags2 = u32(buf, BUF.flags);
        row.headerFlags = hex(flags2);
        row.dropped = hex((p.entry.flags & ~flags2) >>> 0);
        tracing = { tid: threadId, buf: buf, marks: [] };
        step = 'initial data 35715';
        row.kind = nf.initialData(buf, form, flags2);
        const saveStart = u32(buf, BUF.pos);
        step = 'slot 0x0E';
        row.farGeometryBefore = farGeometry(form);
        slotFn(p.slotS, 'void')(form, buf);
        row.farGeometryAfter = farGeometry(form);
        row.header = toHex(buf.add(BUF.header), 9);
        step = 'plain body';
        const plainLen = u32(buf, BUF.pos);
        const plain = new Uint8Array(ptrAt(buf, BUF.data).readByteArray(plainLen));
        row.plain = { bytes: plainLen, fnv1a: hex(fnv1a(plain)) };
        row.marks = tracing.marks.map(function (m) { return m.n + ':' + m.i + '-' + m.o; });
        row.decoded = decode(plain, tracing.marks, saveStart);
        tracing = null;
        step = 'pack 36081';
        const out = Memory.alloc(16);
        out.writeU64(0); out.add(8).writeU64(0);
        nf.pack(out, buf);
        rec = out.readPointer();
        if (rec.isNull()) throw new Error('the pack gave no record');
        const h = recordHeader(rec);
        const bytes = new Uint8Array(rec.readByteArray(Math.min(h.total, CAP)));
        row.record = h;
        row.deflated = h.length2 !== 0; // zlib (35932); the engine inflates inside 36080 (35933), not called here: the decode is of the plain body
        if (row.deflated && plainLen <= CAP) row.plain.hex = bytesHex(plain);
        row.hex = bytesHex(bytes);
        if (h.total > CAP) row.truncated = true;
        row.fnv1a = hex(fnv1a(bytes));
        onDemand = { bytes: bytes, regions: row.decoded.regions, deflated: row.deflated, bodyStart: h.total - h.length1 };
        row.result = 'ok';
      }
    } catch (e) { row.error = 'at ' + step + ': ' + e; }
    tracing = null;
    try { if (!rec.isNull()) { nf.deallocate(nf.heapOf(), rec, 0); row.recordFreed = true; } } catch (e) { row.freeError = String(e); }
    try { if (buf !== null) { nf.bufDestroy(buf); row.bufferDestroyed = true; } } catch (e) { row.destroyError = String(e); }
    try {
      const after = readEntry(p.map);
      row.entryAfter = { found: after.found, flags: hex(after.flags), record: String(after.record) };
      row.entryUntouched = after.found && after.flags === p.entry.flags && after.record.isNull();
    } catch (e) { row.entryAfterError = String(e); }
    emit(row);
  };

  // the REFR script's compare, on records: equal, or the first differing offset and its section (the on-demand regions, raw bodies only)
  const compare = function (b, engineDeflated) {
    if (onDemand === null) { emit({ event: 'compare', result: 'no on-demand record' }); return; }
    const a = onDemand.bytes;
    let i = 0;
    while (i < a.length && i < b.length && a[i] === b[i]) i++;
    if (i === a.length && a.length === b.length) { emit({ event: 'compare', equal: true, bytes: a.length }); return; }
    const section = onDemand.deflated || engineDeflated ? 'deflated: sections not mapped' : (i < onDemand.bodyStart ? 'record header' : sectionAt(i - onDemand.bodyStart, onDemand.regions));
    emit({ event: 'compare', equal: false, firstDiff: i, section: section, onDemandLength: a.length, engineLength: b.length });
  };

  const counts = { innerAdd: 0, innerAddForm: 0, triggers: 0, runs: 0, refused: 0, stash: 0, stashForm: 0, mapWrite: 0, mapWriteForm: 0, movetoLow: 0, movetoLowForm: 0 };
  let busy = false; // 0x0E may re-enter AddChange (the far-skin RemoveItem)
  const act = function (form, flags, threadId) {
    counts.triggers += 1;
    if (counts.runs >= RUNS || busy) return;
    busy = true;
    try {
      const p = premises(form, threadId);
      if (p.ok) counts.runs += 1; else counts.refused += 1; // a refused trigger does not consume RUNS
      if (p.ok || counts.refused <= REFUSED_ROWS) {
        if (MODE === 'check') { for (const c of p.checks) emit({ event: 'check', name: c.name, value: c.value, ok: c.ok }); emit({ event: 'info', live: p.info }); }
        const failed = p.checks.filter(function (c) { return !c.ok; }).map(function (c) { return c.name; });
        emit({ event: p.ok ? 'premises' : 'refused', mode: MODE, trigger: hex(flags), thread: threadId, ok: p.ok, failed: failed,
          entryFlags: hex(p.entry.flags), entryRecordNull: p.entry.record.isNull() });
      }
      if (p.ok && MODE === 'serialize') serialize(form, p, threadId);
    } catch (e) { emit({ event: 'error', where: 'act', error: String(e) }); }
    busy = false;
  };
  const firstBytes = function (name) { return rva(at(name)) + ':' + toHex(at(name), 4); };
  const hookBytes = { innerAdd: firstBytes('innerAdd'), stash: firstBytes('stash'), movetoLow: firstBytes('movetoLow'), actorSave: firstBytes('actorSave') };
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
  attach('movetoLow', {
    onEnter(args) {
      counts.movetoLow += 1;
      if (u32(args[0], FORM_ID) !== FORM) return;
      counts.movetoLowForm += 1;
      emit({ event: 'movetoLow', form: hex(FORM), caller: rva(this.returnAddress), insideRecipe: busy, thread: this.threadId });
    },
  });
  attach('refrSave', markHook('refr'));
  attach('processSave', markHook('process'));
  attach('actorStateSave', markHook('actorState'));
  attach('modifiersSave', markHook('modifiers'));
  attach('avStorageSave', markHook('avStorage'));
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
        if (!e.found || e.record.isNull()) { emit(row); return; }
        const h = recordHeader(e.record);
        Object.assign(row, h);
        row.deflated = h.length2 !== 0;
        const bytes = new Uint8Array(e.record.readByteArray(Math.min(h.total, CAP)));
        row.hex = bytesHex(bytes);
        if (h.total > CAP) row.truncated = true;
        row.fnv1a = hex(fnv1a(bytes));
        emit(row);
        compare(bytes, row.deflated);
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
  emit({ event: 'ready', version: version, pid: Process.id, base: String(exe.base), form: hex(FORM), mode: MODE, flag: hex(FLAG), runs: RUNS, hooks: hookBytes,
    game: String(s0.game), manager: String(s0.manager), main: String(s0.main), handler: String(s0.handler), player: String(s0.player),
    managerFlags: s0.game.isNull() ? -1 : hex(u32(s0.game, MANAGER_FLAGS)), dryRun: s0.manager.isNull() ? -1 : u8(s0.manager, DRY_RUN),
    deflateSetting: u8(at('deflateSetting'), 0), mainThread: s0.main.isNull() ? -1 : u32(s0.main, MAIN_THREAD), saveVersion: ver0, attachErrors: attachErrors });
}
