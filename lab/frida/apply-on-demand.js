// apply-on-demand.js (thuum, the re-analyst 2026-11-03; docs/research/adr065-serialize-on-demand-2026-11-03.md, "(c)"): the (c) probe. On
// one seat, for a DEAD actor FORM, at its kDead mark (TRIGGER mark: AddChange's inner 35576 with FLAG, deferred to PlayerCharacter::Update's
// return as serialize-on-demand-actor.js does; TRIGGER now: the first Update return after the attach, the form by TESForm::LookupByID), on
// Main.threadID: MODE roundtrip (default) serializes the copy's own record with the actor script's recipe (36035, 36037, slot 0x0D, 35715,
// slot 0x0E, 36081); MODE apply takes the owner's record from RECORD (hex) with FLAGS. The record is written into the form's changes-map
// entry as transplant-inject.js writes one (RECORD's bytes on the engine heap by 68115; 35509 the Value {flags, 0, record}), then 35568
// runs (the apply's wrapper: decode, initial data, LoadGame, the pending array) and 35567 (the finish pass: InitLoadGame, the flush that
// hands the Havok block to 19535, FinishLoadGame), with a snapshot row before, after the apply and after the finish. THE ONE ENGINE-STATE
// WRITE is 35509: the entry's record pointer is then the engine's (its decode 36080 frees it); if 35568 returns 0 the record is still ours
// and the entry is put back and the record freed. The flags written are the recipe's headerFlags (the bits 0x0D kept, what the engine's own
// stash stores) or FLAGS; the readers gate on them, so the record's Havok block is checked against them before any engine call. Witnesses:
// 35519 (the "FORMS:" log, the engine's own verdicts), 19535 and 19538 (the Havok reader and its per-body reader), bhkRigidBody::SetPosition
// and SetRotation (slots 0x35, 0x36 of VTABLE_bhkRigidBody 190275, read at the attach), 36031 (which flush kind reached the form), 11977
// (the block parked in an ExtraSavedHavokData: no 3D). Expected for the round trip: 35568 returns 1, the entry's record nulled, the pending
// count (+0x328) 1 then 0, no mismatch log, SetPosition and SetRotation once per non-root body, and no visible change (position, angle, root
// z, head z, lifeState equal before and after). Premises (any failure refuses): the actor script's, plus kInitingForms clear, the entry present
// with a null record, the 3D present, the actor dead (lifeState 2), the pending count 0 (FORCE overrides), slot 0x0F 37650 or Character's
// 40267; for apply also: RECORD parses, type 1 (ACHR), the engine's version, lengths consistent, raw unless FORCE, SUM when given, the
// record's Havok body count equal to the live count from 19533 unless FORCE (both print). Every engine call is wrapped, but a fault inside is
// only CONVERTED to a JS exception (a lock taken inside stays held): the premises are the real safety. Every id, offset, slot and layout is the
// static read's ((c)'s id table, CommonLib, `just addr`): HYPOTHESIS until a run reads as expected (rule 2). The record is not decoded here:
// its header, lengths, FNV-1a and the Havok block's framing print. LAB_PARAMS: FORM (required), MODE, TRIGGER, FLAG (0x400), RECORD, FLAGS,
// SUM, FORCE (false), SUPPRESS (false: 19378 around 35567 as the cell's 3D build does), RUNS (1). Ready prints Process.id. Size: above the
// 20 KiB cap: wait: 15 after the frida step, and read the ready t against the kill's step before trusting a negative.
const PARAMS = (typeof LAB_PARAMS === 'object' && LAB_PARAMS) ? LAB_PARAMS : {};
const FORM = Number(PARAMS.FORM);
const MODE = PARAMS.MODE === 'apply' ? 'apply' : 'roundtrip';
const TRIGGER = PARAMS.TRIGGER === 'now' ? 'now' : 'mark';
const FLAG = PARAMS.FLAG === undefined ? 0x400 : Number(PARAMS.FLAG); // Actor.h:234 kLifeState
const RECORD = typeof PARAMS.RECORD === 'string' ? PARAMS.RECORD : '';
const FLAGS = PARAMS.FLAGS === undefined ? -1 : Number(PARAMS.FLAGS);
const SUM = PARAMS.SUM === undefined ? -1 : Number(PARAMS.SUM);
const FORCE = PARAMS.FORCE === true || PARAMS.FORCE === 'true';
const SUPPRESS = PARAMS.SUPPRESS === true || PARAMS.SUPPRESS === 'true';
const RUNS = PARAMS.RUNS === undefined ? 1 : Number(PARAMS.RUNS);
function emit(obj) {
  obj.t = Date.now();
  send(obj);
  console.log(JSON.stringify(obj));
}
// Offsets: the note's id tables ((c) included) and `just addr` (Address Library 1.6.1170 only), 2026-11-03; (c) = called, (h) = hooked
const OFFSETS = {
  '1.6.1170.0': {
    innerAdd: 0x604320, // 35576 AddChange's inner (h: the trigger)
    mapRead: 0x600930, // 35503 the changes map's read (c)
    mapWrite: 0x600e20, // 35509 the changes map's write (c: THE engine-state write)
    bufCtor: 0x626a90, // 36035 BGSSaveFormBuffer ctor (c)
    bufInit: 0x626ce0, // 36037 the header (c)
    bufDestroy: 0x626e20, // 36044 frees the buffer's data (c)
    initialData: 0x60e1c0, // 35715 the initial data (c)
    pack: 0x6283e0, // 36081 buffer to record (c)
    saveVersion: 0x610980, // 35740 returns 0x4e (c)
    heap: 0x11bba0, // 11141 MemoryManager::GetSingleton (c)
    allocate: 0xcc40c0, // 68115 MemoryManager::Allocate (c, apply mode)
    deallocate: 0xcc4510, // 68117 MemoryManager::Deallocate (c, our record only)
    saveLoadGame: 0x317aba8, // 403330 BGSSaveLoadGame** (BGSSaveLoadGame.h:71)
    saveLoadManager: 0x317abf0, // 403340 BGSSaveLoadManager** (Offsets.h:54)
    main: 0x31872c0, // 403449 Main** (Offsets.h:383)
    dataHandler: 0x20f6320, // 400269 TESDataHandler** (Offsets.h:504)
    player: 0x31874f8, // 403521 NiPointer<PlayerCharacter> (Offsets.h:451)
    lookupByID: 0x1e01a0, // 14617 TESForm::LookupByID (c, TRIGGER now)
    refrCheckSave: 0x2da4f0, // 19527 TESObjectREFR::CheckSaveGame = slot 0x0D of Actor and Character
    actorSave: 0x686710, // 37649 Actor::SaveGame, slot 0x0E of VTABLE_Actor
    characterSave: 0x727d40, // 40266 Character::SaveGame, slot 0x0E of VTABLE_Character (every NPC)
    actorLoad: 0x686de0, // 37650 Actor::LoadGame, slot 0x0F of VTABLE_Actor
    characterLoad: 0x727d50, // 40267 Character::LoadGame, slot 0x0F of VTABLE_Character
    playerUpdate: 0x732660, // 40447 PlayerCharacter::Update, slot 0xAD of 208040 (Actor.h:371) (h)
    applyWrap: 0x603700, // 35568 the apply's wrapper (mgr, form) -> uint8 (c)
    finishPass: 0x603140, // 35567 the finish pass (mgr, fromFullLoad) (c)
    suppress: 0x2cfe60, // 19378 the suppress bit (mgr, clear): 0 sets, 1 clears (c, SUPPRESS)
    formsLog: 0x601770, // 35519 the "FORMS:" log (fmt, ...) (h)
    havokRead: 0x2db450, // 19535 the Havok block reader (ref, buf) (h)
    havokBody: 0x2dbfc0, // 19538 its per-body reader (h)
    havokPrePass: 0x2db1b0, // 19533 the pre-pass (ref, state): the live body count (c)
    flushEntry: 0x6264e0, // 36031 the flush's per-entry handler (kind*, form, subBuffer) (h)
    savedHavokSet: 0x16aa00, // 11977 the ExtraSavedHavokData setter (extraList, subBuffer*) (h)
    rigidBodyVtable: 0x17aeb58, // 190275 VTABLE_bhkRigidBody[0]: slots 0x35, 0x36 (bhkRigidBody.h:43-44) (h)
  },
};
// TESForm.h:353-356; BGSSaveLoadGame.h:61-63 (kLoading 2, kSaving 4, kInitingForms 8), :93 (the BSTArray at +0x318: data, capacity +8, size +0x10),
// :94, :96; BGSSaveLoadManager.h:114; TESDataHandler.h:76-88 (HYPOTHESIS); Main.h:78, :87; BGSSaveGameBuffer.h:30-32, BGSSaveFormBuffer.h:23-25
const FORM_FLAGS = 0x10, FORM_ID = 0x14, IN_GAME_FLAGS = 0x18, FORM_TYPE = 0x1a;
const CHANGES_MAP = 0x330, MANAGER_FLAGS = 0x340, PENDING_COUNT = 0x328, DRY_RUN = 0x120, CLEARING_DATA = 0xda5, RESET_GAME = 0x11, MAIN_THREAD = 0x28;
const BUF = { data: 0x08, pos: 0x14, header: 0x18, flags: 0x1b, form: 0x28, size: 0x30 };
const SLOT_CHECK = 0x0d, SLOT_SAVE = 0x0e, SLOT_LOAD = 0x0f, SLOT_SET_POS = 0x35, SLOT_SET_ROT = 0x36; // TESForm.h:136-138; bhkRigidBody.h:43-44
// Actor.h:712 (+8): currentProcess :651; ActorState at 0xC0 (:737), actorState1 +8 (ActorState.h:203), lifeState bits 21-24 (:114); AIProcess.h:197,
// :225; HighProcessData.h:357; TESObjectREFR.h:78-79 (data at +0x40: angle +0x48, location +0x54), :497 loadedData, :101 data3D, :498 extraList;
// NiAVObject.h:158 world + NiTransform.h:26 translate; NiObjectNET.h:53 name; NiNode.h:76 children; NiTArray.h:116-119 (data +8, u16 size +0x14)
const ACHR = 0x3e, PLAYER_ID = 0x14, A_PROCESS = 0xf8, A_STATE1 = 0xc8, P_HIGH = 0x10, P_LEVEL = 0x137, H_FAR = 0x468;
const R_ANGLE = 0x48, R_LOCATION = 0x54, R_LOADED = 0x68, L_DATA3D = 0x68, R_EXTRA = 0x70, N_WORLD_T = 0xa0, N_NAME = 0x10, N_CHILDREN = 0x110, TA_DATA = 0x08, TA_SIZE = 0x14;
const K_HAVOK = 1 << 2; // TESObjectREFR.h:142 kHavokMoved; 35708's kinds: created 5, kCellChanged or kPromoted (0x02000008) 6, kMoved or kHavokMoved (6) 4
const LIFE = ['kAlive', 'kDying', 'kDead', 'kUnconcious', 'kReanimate', 'kRecycle', 'kRestrained', 'kEssentialDown', 'kBleedout']; // ActorState.h:9-17
const HEAD = 'NPC Head [Head]';
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
const u16 = function (p, o) { try { return p.add(o).readU16(); } catch (e) { return -1; } };
const u32 = function (p, o) { try { return p.add(o).readU32(); } catch (e) { return -1; } };
const f32 = function (p, o) { try { return +p.add(o).readFloat().toFixed(3); } catch (e) { return null; } };
const ptrAt = function (p, o) { try { return p.add(o).readPointer(); } catch (e) { return NULL; } };
const bytesHex = function (a) { let s = ''; for (let i = 0; i < a.length; i++) s += ('0' + a[i].toString(16)).slice(-2); return s; };
const toHex = function (p, n) { return bytesHex(new Uint8Array(p.readByteArray(n))); };
const fnv1a = function (bytes) { let h = 0x811c9dc5; for (const b of bytes) { h ^= b; h = Math.imul(h, 0x01000193) >>> 0; } return h >>> 0; };
const vi = function (b, o) { const w = b[o] & 3; return w === 0 ? [b[o] >> 2, 1] : (w === 1 ? [((b[o + 1] << 8) | b[o]) >> 2, 2] : [((b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 2), 4]); }; // 36052: value << 2 | width
// a record (the pack 36081): type index and size code, version, length1, length2 (the inflated size, 0 when raw), the data inline
const recordHeader = function (rec) {
  const b0 = rec.readU8();
  const s = b0 >> 6;
  const n = s === 0 ? 1 : (s === 1 ? 2 : 4);
  const len = function (o) { return n === 1 ? rec.add(o).readU8() : (n === 2 ? rec.add(o).readU16() : rec.add(o).readU32()); };
  const length1 = len(2);
  return { type: b0 & 0x3f, sizeCode: s, version: rec.add(1).readU8(), length1: length1, length2: len(2 + n), total: 2 + 2 * n + length1 };
};
// the initial data's Havok block ((c) Q2, HYPOTHESIS): 35708's kind from the flags, the fixed part 27/31/34, then a varint length and the block:
// u8 flags (bit 4: pitch and roll follow), varint body count, ...; the block's byte count is the framing the queue reader 36023 uses
const havokOf = function (b, flags, id) {
  const kind = id >= 0xff000000 ? 5 : ((flags & 0x02000008) !== 0 ? 6 : ((flags & 6) !== 0 ? 4 : 0));
  const fixed = kind === 4 ? 27 : (kind === 5 ? 31 : (kind === 6 ? 34 : 0));
  const r = { kind: kind, fixed: fixed, present: (flags & K_HAVOK) !== 0 && kind !== 0, initialLen: fixed };
  if (!r.present) return r;
  if (b.length < fixed + 2) { r.error = 'body too short for the block'; return r; }
  const len = vi(b, fixed), start = fixed + len[1];
  r.blockLen = len[0]; r.blockStart = start; r.initialLen = start + len[0];
  if (len[0] < 2 || r.initialLen > b.length) { r.error = 'block length ' + len[0] + ' does not fit the body'; return r; }
  r.blockFlags = hex(b[start]);
  const cnt = vi(b, start + 1);
  r.count = cnt[0];
  if ((b[start] & 0x10) !== 0) { const dv = new DataView(b.buffer, b.byteOffset + start + 1 + cnt[1], 8); r.pitchRoll = [+dv.getFloat32(0, true).toFixed(3), +dv.getFloat32(4, true).toFixed(3)]; }
  return r;
};

const exe = Process.getModuleByName('SkyrimSE.exe');
const version = fileVersion(exe.path);
const off = OFFSETS[version];
if (off === undefined || !(FORM > 0) || (MODE === 'apply' && (!/^([0-9a-fA-F]{2})+$/.test(RECORD) || !(FLAGS >= 0)))) {
  emit({ event: 'ready', error: off === undefined ? 'no offsets for this runtime' : (!(FORM > 0) ? 'FORM is required' : 'apply needs RECORD (hex) and FLAGS'), version: version, pid: Process.id });
} else {
  const at = function (name) { return exe.base.add(off[name]); };
  const rva = function (p) { return hex(p.sub(exe.base).toUInt32()); };
  const nf = {
    mapRead: new NativeFunction(at('mapRead'), 'bool', ['pointer', 'uint32', 'pointer']),
    mapWrite: new NativeFunction(at('mapWrite'), 'void', ['pointer', 'uint32', 'pointer']),
    bufCtor: new NativeFunction(at('bufCtor'), 'pointer', ['pointer']),
    bufInit: new NativeFunction(at('bufInit'), 'void', ['pointer', 'uint32', 'uint32', 'uint32', 'uint8']),
    bufDestroy: new NativeFunction(at('bufDestroy'), 'void', ['pointer']),
    initialData: new NativeFunction(at('initialData'), 'uint32', ['pointer', 'pointer', 'uint32']),
    pack: new NativeFunction(at('pack'), 'void', ['pointer', 'pointer']),
    saveVersion: new NativeFunction(at('saveVersion'), 'uint8', []),
    heapOf: new NativeFunction(at('heap'), 'pointer', []),
    allocate: new NativeFunction(at('allocate'), 'pointer', ['pointer', 'uint64', 'int32', 'bool']),
    deallocate: new NativeFunction(at('deallocate'), 'void', ['pointer', 'pointer', 'bool']),
    lookupByID: new NativeFunction(at('lookupByID'), 'pointer', ['uint32']),
    applyWrap: new NativeFunction(at('applyWrap'), 'uint8', ['pointer', 'pointer']),
    finishPass: new NativeFunction(at('finishPass'), 'void', ['pointer', 'uint8']),
    suppress: new NativeFunction(at('suppress'), 'uint8', ['pointer', 'uint8']),
    prePass: new NativeFunction(at('havokPrePass'), 'void', ['pointer', 'pointer']),
  };
  const slotFn = function (p, ret) { return new NativeFunction(p, ret, ['pointer', 'pointer']); };
  const singletons = function () {
    return { game: ptrAt(at('saveLoadGame'), 0), manager: ptrAt(at('saveLoadManager'), 0), main: ptrAt(at('main'), 0), handler: ptrAt(at('dataHandler'), 0), player: ptrAt(at('player'), 0) };
  };
  const value = Memory.alloc(16); // the entry's Value {flags, u32, record}
  const readEntry = function (map) {
    value.writeU32(0); value.add(4).writeU32(0); value.add(8).writePointer(NULL);
    const found = nf.mapRead(map, FORM, value);
    return { found: found, flags: value.readU32(), record: value.add(8).readPointer() };
  };
  const writeEntry = function (map, flags, rec) { value.writeU32(flags); value.add(4).writeU32(0); value.add(8).writePointer(rec); nf.mapWrite(map, FORM, value); return readEntry(map); };
  const state = Memory.alloc(0x30); // 19533's state: flags u8, two counts at +4 and +8, the form, the node, the root's collision object, the buffer
  const liveBodies = function (form) { for (let o = 0; o < 0x30; o += 8) state.add(o).writeU64(0); nf.prePass(form, state); return { flags: hex(u8(state, 0)), a: u32(state, 4), b: u32(state, 8), count: u32(state, 4) + u32(state, 8), node: String(ptrAt(state, 0x18)) }; };
  const rootOf = function (form) { const ld = ptrAt(form, R_LOADED); return ld.isNull() ? NULL : ptrAt(ld, L_DATA3D); };
  const vec3 = function (p, o) { return [f32(p, o), f32(p, o + 4), f32(p, o + 8)]; };
  const nameOf = function (node) { try { const s = ptrAt(node, N_NAME); return s.isNull() ? '' : s.readUtf8String(64); } catch (e) { return ''; } };
  const findNode = function (node, name, depth, budget) { // a guarded walk of the NiNode children (HYPOTHESIS: a leaf's +0x110 reads past it, bounded by the size and depth checks)
    if (node.isNull() || depth > 24 || budget.n <= 0) return NULL;
    budget.n -= 1;
    if (nameOf(node) === name) return node;
    const arr = node.add(N_CHILDREN), data = ptrAt(arr, TA_DATA), n = u16(arr, TA_SIZE);
    if (data.isNull() || n <= 0 || n > 512) return NULL;
    for (let i = 0; i < n; i++) { const c = ptrAt(data, i * 8); if (c.isNull()) continue; const r = findNode(c, name, depth + 1, budget); if (!r.isNull()) return r; }
    return NULL;
  };
  const snapshot = function (form, label) {
    const proc = ptrAt(form, A_PROCESS), high = proc.isNull() ? NULL : ptrAt(proc, P_HIGH), root = rootOf(form), st1 = u32(form, A_STATE1);
    const s = singletons(), map = s.game.isNull() ? NULL : ptrAt(s.game, CHANGES_MAP), e = map.isNull() ? { found: false, flags: 0, record: NULL } : readEntry(map);
    const life = st1 < 0 ? -1 : (st1 >>> 21) & 0xf;
    const row = { event: 'snapshot', label: label, form: hex(FORM), lifeState: life, lifeStateName: LIFE[life] || '?', level: proc.isNull() ? 'none' : u8(proc, P_LEVEL),
      farGeometry: high.isNull() ? 'no high process' : u8(high, H_FAR), position: vec3(form, R_LOCATION), angle: vec3(form, R_ANGLE), root: String(root),
      rootWorld: root.isNull() ? null : vec3(root, N_WORLD_T), entry: { found: e.found, flags: hex(e.flags), record: String(e.record) }, pending: s.game.isNull() ? -1 : u32(s.game, PENDING_COUNT) };
    if (!root.isNull()) {
      try { const head = findNode(root, HEAD, 0, { n: 4096 }); row.head = head.isNull() ? 'not found' : { node: String(head), worldZ: f32(head, N_WORLD_T + 8) }; } catch (err) { row.headError = String(err); }
      try { row.liveBodies = liveBodies(form); } catch (err) { row.liveBodiesError = String(err); }
    }
    emit(row);
    return row;
  };

  // the premises (the actor script's, plus (c)'s); any failure refuses
  const premises = function (form, threadId) {
    const s = singletons();
    const checks = [];
    const add = function (name, val, ok) { checks.push({ name: name, value: val, ok: ok }); };
    add('BGSSaveLoadGame', String(s.game), !s.game.isNull());
    add('BGSSaveLoadManager', String(s.manager), !s.manager.isNull());
    const mflags = s.game.isNull() ? -1 : u32(s.game, MANAGER_FLAGS);
    add('kLoading, kSaving, kInitingForms clear', hex(mflags), mflags >= 0 && (mflags & 0xe) === 0);
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
    const high = ptrAt(ptrAt(form, A_PROCESS), P_HIGH), fg = type === ACHR ? (high.isNull() ? 'no high process' : u8(high, H_FAR)) : -1;
    add('far skin absent (a set farGeometry would make 0x0E strip it and mark kInventory)', String(fg), fg === 0 || fg === 'no high process');
    const vt = ptrAt(form, 0);
    const slot = function (i) { return vt.isNull() ? NULL : ptrAt(vt, i * 8); };
    const slotC = slot(SLOT_CHECK), slotS = slot(SLOT_SAVE), slotL = slot(SLOT_LOAD);
    add('slot 0x0D is 19527', rva(slotC), slotC.equals(at('refrCheckSave')));
    add('slot 0x0E is Actor::SaveGame 37649 or Character\'s 40266', rva(slotS), slotS.equals(at('actorSave')) || slotS.equals(at('characterSave')));
    add('slot 0x0F is Actor::LoadGame 37650 or Character\'s 40267', rva(slotL), slotL.equals(at('actorLoad')) || slotL.equals(at('characterLoad')));
    const root = rootOf(form);
    add('3D present (loadedData +0x68, data3D +0x68)', String(root), !root.isNull());
    const st1 = u32(form, A_STATE1), life = st1 < 0 ? -1 : (st1 >>> 21) & 0xf;
    add('actor dead (lifeState 2)', life + ' ' + (LIFE[life] || '?'), life === 2);
    const pending = s.game.isNull() ? -1 : u32(s.game, PENDING_COUNT);
    add('pending array empty (+0x328; FORCE overrides)', pending, pending === 0 || (FORCE && pending >= 0));
    const map = s.game.isNull() ? NULL : ptrAt(s.game, CHANGES_MAP);
    let entry = { found: false, flags: 0, record: NULL };
    if (!map.isNull()) entry = readEntry(map);
    add('entry present', entry.found ? hex(entry.flags) : 'none', entry.found);
    add('entry record null (an engine record is never touched)', String(entry.record), entry.found && entry.record.isNull());
    return { ok: checks.every(function (c) { return c.ok; }), checks: checks, entry: entry, type: type, slotC: slotC, slotS: slotS, map: map, root: root };
  };
  // apply mode: RECORD checked before any engine call (transplant-inject's review's finding 2)
  const parseRecord = function () {
    const bytes = new Uint8Array(RECORD.length / 2);
    for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(RECORD.substr(2 * i, 2), 16);
    const b0 = bytes[0], s = b0 >> 6, n = s === 0 ? 1 : (s === 1 ? 2 : 4);
    const le = function (o) { let v = 0; for (let k = n - 1; k >= 0; k--) v = v * 256 + bytes[o + k]; return v; };
    const r = { bytes: bytes, type: b0 & 0x3f, sizeCode: s, version: bytes[1], length1: le(2), length2: le(2 + n), bodyStart: 2 + 2 * n, total: bytes.length, fnv1a: hex(fnv1a(bytes)), problems: [] };
    const want = nf.saveVersion();
    if (r.type !== 1) r.problems.push('type ' + r.type + ' is not ACHR (1)');
    if (s > 2) r.problems.push('size code ' + s);
    if (r.version !== want) r.problems.push('version ' + r.version + ', the engine writes ' + want);
    if (r.bodyStart + r.length1 !== bytes.length) r.problems.push('length1 ' + r.length1 + ' disagrees with ' + bytes.length + ' bytes');
    if (r.length2 !== 0 && !FORCE) r.problems.push('deflated (length2 ' + r.length2 + '): the body count is unreadable, refused without FORCE');
    if (SUM >= 0 && fnv1a(bytes) !== SUM) r.problems.push('checksum ' + r.fnv1a + ', SUM says ' + hex(SUM));
    return r;
  };

  const watch = { active: false, tid: -1, reads: 0, bodies: 0, setPos: 0, setRot: 0, flush: [], parked: 0, logs: [] };
  const run = function (form, p, q) {
    const row = { event: 'apply', mode: MODE, form: hex(FORM), thread: q.runThread, markThread: q.markThread, deferredMs: q.deferredMs, deferredVia: q.via, entryFlags: hex(p.entry.flags) };
    const before = snapshot(form, 'before');
    const s = singletons(), map = p.map;
    let buf = null, rec = NULL, flagsOut = 0, body = null, step = 'start';
    watch.active = true; watch.tid = q.runThread; watch.reads = 0; watch.bodies = 0; watch.setPos = 0; watch.setRot = 0; watch.flush = []; watch.parked = 0; watch.logs = [];
    try {
      if (MODE === 'roundtrip') { // the actor script's recipe, the record kept for the entry
        step = 'ctor 36035';
        const raw = Memory.alloc(BUF.size);
        for (let o = 0; o < BUF.size; o += 8) raw.add(o).writeU64(0);
        nf.bufCtor(raw);
        buf = raw;
        step = 'header 36037';
        nf.bufInit(buf, FORM, p.entry.flags, p.type, nf.saveVersion());
        buf.add(BUF.form).writePointer(form);
        step = 'slot 0x0D';
        row.checkSaveGame = slotFn(p.slotC, 'bool')(form, buf);
        if (!row.checkSaveGame) throw new Error('0x0D returned 0: nothing to save');
        flagsOut = u32(buf, BUF.flags) >>> 0;
        row.writtenFlags = hex(flagsOut); row.dropped = hex((p.entry.flags & ~flagsOut) >>> 0);
        step = 'initial data 35715';
        row.kind = nf.initialData(buf, form, flagsOut); row.initialLen = u32(buf, BUF.pos);
        step = 'slot 0x0E';
        slotFn(p.slotS, 'void')(form, buf);
        step = 'plain body';
        const n = u32(buf, BUF.pos);
        body = new Uint8Array(ptrAt(buf, BUF.data).readByteArray(n));
        row.plain = { bytes: n, fnv1a: hex(fnv1a(body)) };
        step = 'pack 36081';
        const out = Memory.alloc(16);
        out.writeU64(0); out.add(8).writeU64(0);
        nf.pack(out, buf);
        rec = out.readPointer();
        if (rec.isNull()) throw new Error('the pack gave no record');
        const h = recordHeader(rec);
        row.record = h; row.deflated = h.length2 !== 0; row.recordFnv1a = hex(fnv1a(new Uint8Array(rec.readByteArray(Math.min(h.total, CAP)))));
      } else {
        step = 'RECORD';
        const r = parseRecord();
        row.record = { type: r.type, sizeCode: r.sizeCode, version: r.version, length1: r.length1, length2: r.length2, total: r.total }; row.recordFnv1a = r.fnv1a; row.deflated = r.length2 !== 0;
        if (r.problems.length !== 0) throw new Error('RECORD refused: ' + r.problems.join('; '));
        flagsOut = FLAGS >>> 0; row.writtenFlags = hex(flagsOut);
        body = r.deflated ? null : r.bytes.subarray(r.bodyStart);
        step = 'allocate 68115';
        rec = nf.allocate(nf.heapOf(), r.bytes.length, 0, 0);
        if (rec.isNull()) throw new Error('the engine heap gave no memory');
        rec.writeByteArray(r.bytes);
      }
      step = 'body count';
      row.havok = body === null ? { note: 'deflated: block unread' } : havokOf(body, flagsOut, FORM);
      if (MODE === 'roundtrip' && row.havok.initialLen !== undefined) row.framingCheck = row.havok.initialLen === row.initialLen ? 'the block framing matches 35715\'s length' : 'MISMATCH: framing ' + row.havok.initialLen + ' vs initial ' + row.initialLen;
      if (row.havok.error !== undefined) throw new Error('Havok block: ' + row.havok.error);
      row.liveBodies = before.liveBodies === undefined ? null : before.liveBodies.count;
      if (row.havok.count !== undefined && row.liveBodies !== null && row.havok.count !== row.liveBodies && !FORCE) throw new Error('body count ' + row.havok.count + ' in the record, ' + row.liveBodies + ' live: refused without FORCE');
      step = 'write 35509'; // THE engine-state write; the record pointer is the engine's from here unless 35568 refuses
      const w = writeEntry(map, flagsOut, rec);
      row.written = { flags: hex(w.flags), record: String(w.record) };
      if (!w.record.equals(rec)) throw new Error('the entry does not hold our record after the write');
      step = 'apply 35568';
      const ours = rec; rec = NULL; // from here the engine owns it (its decode frees it); never freed by us after the call
      row.applyReturn = nf.applyWrap(s.game, form);
      const a = readEntry(map);
      row.afterApply = { flags: hex(a.flags), record: String(a.record), pending: u32(s.game, PENDING_COUNT) };
      if (row.applyReturn === 0) {
        if (a.record.equals(ours)) { writeEntry(map, p.entry.flags, NULL); nf.deallocate(nf.heapOf(), ours, 0); row.restored = 'the entry put back with its old flags and a null record, our record freed'; }
        throw new Error('35568 returned 0 (no entry, no record, a type mismatch or kLoading): read the formsLog rows');
      }
      snapshot(form, 'after apply');
      step = 'finish 35567';
      if (SUPPRESS) row.suppressWasClear = nf.suppress(s.game, 0);
      nf.finishPass(s.game, 0);
      if (SUPPRESS && row.suppressWasClear === 1) nf.suppress(s.game, 1);
      const f = readEntry(map);
      row.afterFinish = { flags: hex(f.flags), record: String(f.record), pending: u32(s.game, PENDING_COUNT) };
      row.result = 'ok';
    } catch (e) { row.error = 'at ' + step + ': ' + e; }
    watch.active = false;
    try { if (!rec.isNull()) { nf.deallocate(nf.heapOf(), rec, 0); row.recordFreed = 'refused before the write: our record freed'; } } catch (e) { row.freeError = String(e); }
    try { if (buf !== null) { nf.bufDestroy(buf); row.bufferDestroyed = true; } } catch (e) { row.destroyError = String(e); }
    row.witness = { havokRead: watch.reads, bodies: watch.bodies, setPosition: watch.setPos, setRotation: watch.setRot, flushKinds: watch.flush, parkedInExtra: watch.parked, logs: watch.logs };
    emit(row);
    snapshot(form, 'after');
  };

  const counts = { innerAdd: 0, innerAddForm: 0, triggers: 0, runs: 0, refused: 0, playerUpdate: 0, formsLog: 0, havokRead: 0, havokBody: 0, flushEntry: 0, savedHavokSet: 0, rigidSetPosition: 0, rigidSetRotation: 0 };
  let busy = false;
  let pending = null; // the armed trigger, run at PlayerCharacter::Update's return (or a main-thread AddChange after 250 ms)
  let updateThread = -1;
  let nowArmed = false;
  const act = function (q) { // q: { form, flags, markThread, t, runThread, deferredMs, via }
    if (counts.runs >= RUNS || busy) return;
    busy = true;
    try {
      if (q.form.isNull()) q.form = nf.lookupByID(FORM); // TRIGGER now
      if (q.form.isNull()) { counts.refused += 1; emit({ event: 'refused', reason: 'TESForm::LookupByID found no form', form: hex(FORM) }); busy = false; return; }
      const p = premises(q.form, q.runThread);
      if (p.ok) counts.runs += 1; else counts.refused += 1;
      if (p.ok || counts.refused <= REFUSED_ROWS) {
        for (const c of p.checks) emit({ event: 'check', name: c.name, value: c.value, ok: c.ok });
        const failed = p.checks.filter(function (c) { return !c.ok; }).map(function (c) { return c.name; });
        emit({ event: p.ok ? 'premises' : 'refused', mode: MODE, trigger: hex(q.flags), markThread: q.markThread, thread: q.runThread, deferredMs: q.deferredMs, deferredVia: q.via, ok: p.ok, failed: failed,
          entryFlags: hex(p.entry.flags), entryRecordNull: p.entry.record.isNull() });
      }
      if (p.ok) run(q.form, p, q);
    } catch (e) { emit({ event: 'error', where: 'act', error: String(e) }); }
    busy = false;
  };
  const firstBytesAt = function (p) { return rva(p) + ':' + toHex(p, 4); };
  const rbSetPos = ptrAt(at('rigidBodyVtable'), SLOT_SET_POS * 8), rbSetRot = ptrAt(at('rigidBodyVtable'), SLOT_SET_ROT * 8);
  const hookBytes = {}; // every hook's resolved address and first bytes, read before the attach (the pitfalls rule)
  ['innerAdd', 'playerUpdate', 'formsLog', 'havokRead', 'havokBody', 'flushEntry', 'savedHavokSet'].forEach(function (n) { hookBytes[n] = firstBytesAt(at(n)); });
  hookBytes.rigidSetPosition = rbSetPos.isNull() ? 'null slot' : firstBytesAt(rbSetPos); hookBytes.rigidSetRotation = rbSetRot.isNull() ? 'null slot' : firstBytesAt(rbSetRot);
  const mainTid = function () { const m = ptrAt(at('main'), 0); return m.isNull() ? -1 : u32(m, MAIN_THREAD); };
  const runPending = function (threadId, via, id) {
    if (pending === null || busy || threadId !== mainTid()) return;
    if (via !== 'PlayerCharacter::Update' && Date.now() - pending.t < 250) return; // AddChange is the fallback only
    const q = pending; pending = null; q.runThread = threadId; q.deferredMs = Date.now() - q.t; q.via = id === undefined ? via : via + ' ' + hex(id); act(q);
  };
  const attachErrors = [];
  const attachAt = function (name, p, cb) { try { if (p.isNull()) throw new Error('null address'); Interceptor.attach(p, cb); } catch (e) { attachErrors.push(name + ': ' + e); } };
  const attach = function (name, cb) { attachAt(name, at(name), cb); };
  const inWindow = function (tid) { return watch.active && tid === watch.tid; };
  attach('innerAdd', {
    onEnter(args) { counts.innerAdd += 1; this.form = args[1]; this.flags = args[2].toUInt32(); this.id = u32(args[1], FORM_ID); },
    onLeave(retval) {
      runPending(this.threadId, 'AddChange', this.id);
      if (this.id !== FORM || TRIGGER !== 'mark') return;
      counts.innerAddForm += 1;
      if ((retval.toUInt32() & 0xff) !== 1 || (this.flags & FLAG) === 0) return;
      counts.triggers += 1;
      const q = { form: this.form, flags: this.flags, markThread: this.threadId, t: Date.now(), runThread: this.threadId, deferredMs: 0, via: null };
      if (pending === null && counts.runs < RUNS && !busy) { pending = q; emit({ event: 'mark', form: hex(FORM), flags: hex(q.flags), thread: q.markThread, armed: true }); }
      else emit({ event: 'mark', form: hex(FORM), flags: hex(q.flags), thread: q.markThread, armed: false, reason: pending !== null ? 'pending armed' : (busy ? 'busy' : 'runs spent') });
    },
  });
  attach('playerUpdate', { // PlayerCharacter::Update: once per frame on the main thread (HYPOTHESIS)
    onEnter() { counts.playerUpdate += 1; },
    onLeave() {
      updateThread = this.threadId;
      if (TRIGGER === 'now' && !nowArmed && pending === null) { nowArmed = true; pending = { form: NULL, flags: 0, markThread: this.threadId, t: Date.now(), runThread: this.threadId, deferredMs: 0, via: null }; emit({ event: 'mark', form: hex(FORM), trigger: 'now', armed: true }); return; }
      runPending(updateThread, 'PlayerCharacter::Update');
    },
  });
  attach('formsLog', { // the engine's own verdicts, printed only while the probe runs
    onEnter(args) { counts.formsLog += 1; if (!inWindow(this.threadId)) return; let fmt = ''; try { fmt = args[0].readUtf8String(240); } catch (e) { fmt = 'unreadable: ' + e; } watch.logs.push(fmt); emit({ event: 'formsLog', fmt: fmt, a1: String(args[1]), a2: String(args[2]), a3: String(args[3]) }); },
  });
  attach('havokRead', {
    onEnter(args) { counts.havokRead += 1; this.hit = u32(args[0], FORM_ID) === FORM; if (this.hit) { watch.reads += 1; emit({ event: 'havokRead', form: hex(FORM), thread: this.threadId, inWindow: inWindow(this.threadId) }); } },
    onLeave() { if (this.hit) emit({ event: 'havokReadDone', form: hex(FORM), bodies: watch.bodies, setPosition: watch.setPos, setRotation: watch.setRot }); },
  });
  attach('havokBody', { onEnter() { counts.havokBody += 1; if (inWindow(this.threadId)) watch.bodies += 1; } });
  attachAt('rigidSetPosition', rbSetPos, { onEnter() { counts.rigidSetPosition += 1; if (inWindow(this.threadId)) watch.setPos += 1; } });
  attachAt('rigidSetRotation', rbSetRot, { onEnter() { counts.rigidSetRotation += 1; if (inWindow(this.threadId)) watch.setRot += 1; } });
  attach('flushEntry', { onEnter(args) { counts.flushEntry += 1; if (u32(args[1], FORM_ID) !== FORM) return; const kind = u32(args[0], 0); watch.flush.push(kind); emit({ event: 'flush', form: hex(FORM), kind: kind, thread: this.threadId, inWindow: inWindow(this.threadId) }); } });
  attach('savedHavokSet', { onEnter(args) { counts.savedHavokSet += 1; if (u32(args[0].sub(R_EXTRA), FORM_ID) !== FORM) return; watch.parked += 1; emit({ event: 'parkedInExtraSavedHavokData', form: hex(FORM), note: 'no 3D at the flush: the block waits for the 3D init' }); } });
  setInterval(function () { emit({ event: 'liveness', counts: counts, updateThread: updateThread, pending: pending !== null, runs: counts.runs }); }, 10000);

  const s0 = singletons();
  let ver0 = -1;
  try { ver0 = nf.saveVersion(); } catch (e) { attachErrors.push('saveVersion: ' + e); }
  const ready = { event: 'ready', version: version, pid: Process.id, base: String(exe.base), form: hex(FORM), mode: MODE, trigger: TRIGGER, flag: hex(FLAG), runs: RUNS, force: FORCE, suppress: SUPPRESS, hooks: hookBytes,
    game: String(s0.game), manager: String(s0.manager), main: String(s0.main), handler: String(s0.handler), player: String(s0.player),
    managerFlags: s0.game.isNull() ? -1 : hex(u32(s0.game, MANAGER_FLAGS)), pending: s0.game.isNull() ? -1 : u32(s0.game, PENDING_COUNT), dryRun: s0.manager.isNull() ? -1 : u8(s0.manager, DRY_RUN),
    mainThread: s0.main.isNull() ? -1 : u32(s0.main, MAIN_THREAD), saveVersion: ver0, attachErrors: attachErrors };
  if (MODE === 'apply') { try { const r = parseRecord(); ready.record = { type: r.type, sizeCode: r.sizeCode, version: r.version, length1: r.length1, length2: r.length2, total: r.total, fnv1a: r.fnv1a, problems: r.problems, flags: hex(FLAGS >>> 0), havok: r.length2 === 0 ? havokOf(r.bytes.subarray(r.bodyStart), FLAGS >>> 0, FORM) : 'deflated' }; } catch (e) { ready.recordError = String(e); } }
  emit(ready);
}
