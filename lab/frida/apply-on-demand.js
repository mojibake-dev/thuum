// apply-on-demand.js v2 (thuum, the re-analyst 2026-11-03; docs/research/adr065-serialize-on-demand-2026-11-03.md, "(c)" and "The pose after
// the apply's 3D reload"): the (c) probe. On one seat, for a DEAD actor FORM, at its kDead mark (TRIGGER mark: AddChange's inner 35576 with
// FLAG, deferred to PlayerCharacter::Update's return as serialize-on-demand-actor.js does; TRIGGER now: the first Update return after the
// attach, the form by TESForm::LookupByID), on Main.threadID: MODE roundtrip (default) serializes the copy's own record with the actor
// script's recipe (36035, 36037, slot 0x0D, 35715, slot 0x0E, 36081); MODE apply takes the owner's record from RECORD (hex) with FLAGS: the
// operator hands a kDead record (this script decodes no lifeState) and the sender's writtenFlags as FLAGS. The record is written into the
// form's changes-map entry as transplant-inject.js writes one (RECORD's bytes on the engine heap by 68115; 35509 the Value {flags, mid,
// record}), then 35568 runs (the apply's wrapper: decode, initial data, LoadGame, the pending array), then, with PARK, 11977 parks the
// record's Havok block in an ExtraSavedHavokData, then 35567 (the finish pass: InitLoadGame, the flush, FinishLoadGame), with a snapshot row
// before, after the apply and after the finish, then the reload watched: a "rebuilt" snapshot when the root returns (or 20 s), a "settled"
// one 5 s later, and a result row naming the pose's source. THE ONE ENGINE-STATE WRITE is 35509 (plus 11977 under PARK): the entry's record
// pointer is then the engine's (its decode 36080 frees it); if 35568 returns 0 the record is still ours and the entry is put back and the
// record freed. What run 20261103-164416 taught, built in here: a mid-game apply of a LEVELED actor's record releases its 3D inside LoadGame
// (ExtraDataList::LoadGame's kLeveledCreature case 0x2D calls Set3D(nullptr) through 12358 whenever kLoading is clear, then rebuilds the base
// NPC from its templates), the engine reloads the model on a task thread (13355), and the new 3D's init (19742, 11979, 36014) applies
// whatever ExtraSavedHavokData the reference holds: Set3D's own store of the live pose at the release (36016 then 11977) or the flush's park
// of the record's block (36031 parks when Get3D2 is null); a non-leveled actor keeps its 3D and the flush feeds 19535 directly (the
// re-apply through 36014 after the root returns is a later option, not built here). v1's witnesses were gated on the probe's window and so
// said nothing about the 19535 that ran 14 ms later on the task thread; v2 counts every 19535 call for FORM on any thread (the body count it
// saw, the 19538 and SetPosition and SetRotation calls inside it, its caller: 36014's path is the 3D init, 36031's the flush), prints the
// 12358 and 19730 return addresses when FORM's 3D goes or comes, prints the verdict logs (35519) whenever they carry FORM or the known
// strings, reads the ExtraSavedHavokData (12329 GetByType 0x3C: the sub-buffer's version, varint length and the block's FNV-1a) and the kind-2
// queue's occupancy (the map at mgr + 0x270, 36027's layout) at every snapshot and around 35568 and 35567, and hashes the copy's live pose
// (36016) before anything, so the pose's source after the reload is decided by hashes: the record's block, the live pose, or neither. PARK
// (default false): after 35568 returns 1 and before 35567, the record's block is wrapped in the queue's own sub-buffer shape (u8 version
// 0x4E, the varint length in 36052's encoding, the 19534 block) on the engine heap and handed to 11977(ref + 0x70, &sub), which takes the
// pointer and replaces an existing extra (the "already saved havok data" log prints), so the rebuilt 3D's init consumes the record's pose;
// refused when the record carries no block. Premises (any failure refuses): the actor script's, plus kInitingForms clear, the entry present
// with a null record, the 3D present, the actor dead (lifeState 2), the pending count 0 (FORCE overrides), slot 0x0F 37650 or Character's
// 40267; for apply also: RECORD parses, type 1 (ACHR), the engine's version, lengths consistent, raw unless FORCE, SUM when given, the
// record's Havok body count equal to the live count from 19533 unless FORCE (both print). Every engine call is wrapped, but a fault inside is
// only CONVERTED to a JS exception (a lock taken inside stays held): the premises are the real safety. Every id, offset, slot and layout is
// the static read's (the sections' id tables, CommonLib, `just addr`): HYPOTHESIS until a run reads as expected (rule 2). LAB_PARAMS: FORM
// (required), MODE, TRIGGER, FLAG (0x400), RECORD, FLAGS, SUM, FORCE (false), SUPPRESS (false: 19378 around 35567), PARK (false), RUNS (1).
// Ready prints Process.id. Size: above the 20 KiB cap: wait: 15 after the frida step, and read the ready t against the kill's step first.
const PARAMS = (typeof LAB_PARAMS === 'object' && LAB_PARAMS) ? LAB_PARAMS : {};
const FORM = Number(PARAMS.FORM);
const MODE = PARAMS.MODE === 'apply' ? 'apply' : 'roundtrip';
const TRIGGER = PARAMS.TRIGGER === 'now' ? 'now' : 'mark';
const FLAG = PARAMS.FLAG === undefined ? 0x400 : Number(PARAMS.FLAG); // Actor.h:234 kLifeState
const RECORD = typeof PARAMS.RECORD === 'string' ? PARAMS.RECORD : '';
const FLAGS = PARAMS.FLAGS === undefined ? -1 : Number(PARAMS.FLAGS);
const SUM = PARAMS.SUM === undefined ? -1 : Number(PARAMS.SUM);
const flagOf = function (v) { return v === true || v === 'true'; };
const FORCE = flagOf(PARAMS.FORCE), SUPPRESS = flagOf(PARAMS.SUPPRESS), PARK = flagOf(PARAMS.PARK);
const RUNS = PARAMS.RUNS === undefined ? 1 : Number(PARAMS.RUNS);
function emit(obj) {
  obj.t = Date.now();
  send(obj);
  console.log(JSON.stringify(obj));
}
// Offsets: the sections' id tables and `just addr` (Address Library 1.6.1170 only), 2026-11-03; (c) = called, (h) = hooked
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
    allocate: 0xcc40c0, // 68115 MemoryManager::Allocate (c)
    deallocate: 0xcc4510, // 68117 MemoryManager::Deallocate (c, our own allocations only)
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
    playerUpdate: 0x732660, // 40447 PlayerCharacter::Update, slot 0xAD of 208040 (Actor.h:371) (h: the per-frame trigger and the reload poll)
    applyWrap: 0x603700, // 35568 the apply's wrapper (mgr, form) -> uint8 (c)
    finishPass: 0x603140, // 35567 the finish pass (mgr, fromFullLoad) (c)
    suppress: 0x2cfe60, // 19378 the suppress bit (mgr, clear): 0 sets, 1 clears (c, SUPPRESS)
    formsLog: 0x601770, // 35519 the "FORMS:" log (fmt, ...) (h)
    havokRead: 0x2db450, // 19535 the Havok block reader (ref, buf) (h)
    havokBody: 0x2dbfc0, // 19538 its per-body reader (h)
    havokPrePass: 0x2db1b0, // 19533 the pre-pass (ref, state): the live body count (c, h: the count 19535 sees)
    flushEntry: 0x6264e0, // 36031 the flush's per-entry handler (kind*, form, subBuffer) (h)
    savedHavokSet: 0x16aa00, // 11977 the ExtraSavedHavokData setter (extraList, subBuffer**) (h, c under PARK)
    getByType: 0x179250, // 12329 ExtraDataList::GetByType (extraList, type) -> BSExtraData* (c)
    livePose: 0x6259a0, // 36016 the live pose into a sub-buffer (holder*, form) (c: the copy's own pose hash)
    set3DWrapper: 0x17a6e0, // 12358 the lock-wrapped slot 0x6C call (ref, node, queue3DTasks) (h: who releases the 3D)
    setData3D: 0x2e5380, // 19730 the data3D setter (ref, node) (h: when the 3D goes and comes)
    rigidBodyVtable: 0x17aeb58, // 190275 VTABLE_bhkRigidBody[0]: slots 0x35 SetPosition, 0x36 SetRotation (bhkRigidBody.h:43-44) (h)
  },
};
// TESForm.h:353-356; BGSSaveLoadGame.h:61-63 (kLoading 2, kSaving 4, kInitingForms 8), :93 (the BSTArray at +0x318: data, capacity +8, size +0x10),
// :94, :96; BGSSaveLoadManager.h:114; TESDataHandler.h:76-88 (HYPOTHESIS); Main.h:78, :87; BGSSaveGameBuffer.h:30-32, BGSSaveFormBuffer.h:23-25;
// the queued sub-buffers at mgr + 0x208: three 0x30 blocks, the hash map at +8 of each (36027: capacity +4, free count +8, entries +0x20, 0x18 each:
// key, value, chain; chain nonzero marks an occupied slot), so kind 2's map is at mgr + 0x270 (HYPOTHESIS, the decompiles of 36023, 36026, 36027)
const FORM_FLAGS = 0x10, FORM_ID = 0x14, IN_GAME_FLAGS = 0x18, FORM_TYPE = 0x1a;
const CHANGES_MAP = 0x330, MANAGER_FLAGS = 0x340, PENDING_COUNT = 0x328, DRY_RUN = 0x120, CLEARING_DATA = 0xda5, RESET_GAME = 0x11, MAIN_THREAD = 0x28;
const KIND2_MAP = 0x270, MAP_CAP = 0x04, MAP_FREE = 0x08, MAP_ENTRIES = 0x20, MAP_ENTRY = 0x18;
const BUF = { data: 0x08, pos: 0x14, header: 0x18, flags: 0x1b, form: 0x28, size: 0x30 };
const LBUF = { data: 0x08, size: 0x20, pos: 0x24 }; // BGSLoadGameBuffer.h:24-29: buffer +0x08, size +0x20 (unk20), bufferPosition +0x24
const SLOT_CHECK = 0x0d, SLOT_SAVE = 0x0e, SLOT_LOAD = 0x0f, SLOT_SET_POS = 0x35, SLOT_SET_ROT = 0x36; // TESForm.h:136-138; bhkRigidBody.h:43-44
// Actor.h:712 (+8): currentProcess :651; ActorState at 0xC0 (:737), actorState1 +8 (ActorState.h:203), lifeState bits 21-24 (:114); AIProcess.h:197,
// :225; HighProcessData.h:357; TESObjectREFR.h:78-79 (data at +0x40: angle +0x48, location +0x54), :497 loadedData, :101 data3D, :498 extraList;
// NiAVObject.h:158 world + NiTransform.h:26 translate; NiObjectNET.h:53 name; NiNode.h:76 children; NiTArray.h:116-119 (data +8, u16 size +0x14);
// ExtraSavedHavokData.h:17 havokBuffer +0x10; ExtraDataTypes.h:234 kSavedHavokData 0x3C
const ACHR = 0x3e, PLAYER_ID = 0x14, A_PROCESS = 0xf8, A_STATE1 = 0xc8, P_HIGH = 0x10, P_LEVEL = 0x137, H_FAR = 0x468;
const R_ANGLE = 0x48, R_LOCATION = 0x54, R_LOADED = 0x68, L_DATA3D = 0x68, R_EXTRA = 0x70, N_WORLD_T = 0xa0, N_NAME = 0x10, N_CHILDREN = 0x110, TA_DATA = 0x08, TA_SIZE = 0x14;
const X_SAVED_HAVOK = 0x3c, X_BUFFER = 0x10;
const K_HAVOK = 1 << 2; // TESObjectREFR.h:142 kHavokMoved; 35708's kinds: created 5, kCellChanged or kPromoted (0x02000008) 6, kMoved or kHavokMoved (6) 4
const LIFE = ['kAlive', 'kDying', 'kDead', 'kUnconcious', 'kReanimate', 'kRecycle', 'kRestrained', 'kEssentialDown', 'kBleedout']; // ActorState.h:9-17
const HEAD = 'NPC Head [Head]';
const VERDICTS = /Havok data|ragdoll save\/load|SetSavedHavokData|queued havok|queued char controller|Load Error|FORMS:/;
const CAP = 65536, REFUSED_ROWS = 8, REBUILD_WAIT_MS = 20000, SETTLE_MS = 5000;

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
const viBytes = function (v) { return v < 0x40 ? [v << 2] : (v < 0x4000 ? [((v << 2) | 1) & 0xff, (v >> 6) & 0xff] : [((v << 2) | 2) & 0xff, (v >> 6) & 0xff, (v >> 14) & 0xff, (v >> 22) & 0xff]); }; // 35529's encoding, little-endian
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
  if ((b[start] & 0x10) !== 0) {
    if (start + 1 + cnt[1] + 8 > b.length) { r.error = 'pitch and roll run past the body'; return r; }
    const dv = new DataView(b.buffer, b.byteOffset + start + 1 + cnt[1], 8); r.pitchRoll = [+dv.getFloat32(0, true).toFixed(3), +dv.getFloat32(4, true).toFixed(3)];
  }
  r.blockHash = hex(fnv1a(b.subarray(start, start + len[0])));
  return r;
};
// a queued sub-buffer as 36023 builds and 36019 reads it (HYPOTHESIS for 36020's, Set3D's store, which 36019 also reads): u8 version, varint length, the block
const subHeader = function (p) {
  if (p.isNull()) return null;
  const head = new Uint8Array(p.readByteArray(5));
  const len = vi(head, 1);
  const r = { version: head[0], blockLen: len[0], width: len[1] };
  if (len[0] > 0 && len[0] <= CAP) { const block = new Uint8Array(p.add(1 + len[1]).readByteArray(len[0])); r.blockHash = hex(fnv1a(block)); r.blockFlags = hex(block[0]); r.count = vi(block, 1)[0]; }
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
    getByType: new NativeFunction(at('getByType'), 'pointer', ['pointer', 'uint32']),
    savedHavokSet: new NativeFunction(at('savedHavokSet'), 'void', ['pointer', 'pointer']),
    livePose: new NativeFunction(at('livePose'), 'void', ['pointer', 'pointer']),
  };
  const slotFn = function (p, ret) { return new NativeFunction(p, ret, ['pointer', 'pointer']); };
  const singletons = function () {
    return { game: ptrAt(at('saveLoadGame'), 0), manager: ptrAt(at('saveLoadManager'), 0), main: ptrAt(at('main'), 0), handler: ptrAt(at('dataHandler'), 0), player: ptrAt(at('player'), 0) };
  };
  const value = Memory.alloc(16); // the entry's Value {flags, mid, record}
  const readEntry = function (map) {
    value.writeU32(0); value.add(4).writeU32(0); value.add(8).writePointer(NULL);
    const found = nf.mapRead(map, FORM, value);
    return { found: found, flags: value.readU32(), mid: value.add(4).readU32(), record: value.add(8).readPointer() };
  };
  const writeEntry = function (map, flags, mid, rec) { value.writeU32(flags); value.add(4).writeU32(mid); value.add(8).writePointer(rec); nf.mapWrite(map, FORM, value); return readEntry(map); };
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
  const savedExtra = function (form) { // the ExtraSavedHavokData on the reference: present, and its sub-buffer's header and block hash
    const x = nf.getByType(form.add(R_EXTRA), X_SAVED_HAVOK);
    if (x.isNull()) return { present: false };
    const sub = ptrAt(x, X_BUFFER);
    return { present: true, extra: String(x), sub: String(sub), header: sub.isNull() ? null : subHeader(sub) };
  };
  const kind2 = function (form) { // the kind-2 queue map's occupancy and whether FORM's block is queued (36027's layout, HYPOTHESIS)
    const s = singletons();
    if (s.game.isNull()) return null;
    const m = s.game.add(KIND2_MAP), cap = u32(m, MAP_CAP), free = u32(m, MAP_FREE), entries = ptrAt(m, MAP_ENTRIES);
    const r = { capacity: cap, occupancy: entries.isNull() || cap < 0 || free < 0 ? 0 : cap - free, hasForm: false };
    if (!entries.isNull() && cap > 0 && cap <= 4096) for (let i = 0; i < cap; i++) { const e = entries.add(i * MAP_ENTRY); if (!ptrAt(e, 0x10).isNull() && ptrAt(e, 0).equals(form)) { r.hasForm = true; r.sub = String(ptrAt(e, 8)); break; } }
    return r;
  };
  const holder = Memory.alloc(8); // a BGSLoadGameSubBuffer* slot for 36016 and 11977
  const livePoseHash = function (form) { // the copy's own pose through the engine's own serializer (36016: 36035, 36037 flags 4, 19534, 36020), then freed
    holder.writePointer(NULL);
    nf.livePose(holder, form);
    const sub = holder.readPointer();
    if (sub.isNull()) return { note: '36016 produced no sub-buffer' };
    const h = subHeader(sub);
    try { nf.deallocate(nf.heapOf(), sub, 0); } catch (e) { h.freeError = String(e); }
    return h;
  };
  const snapshot = function (form, label, withLive) {
    const proc = ptrAt(form, A_PROCESS), high = proc.isNull() ? NULL : ptrAt(proc, P_HIGH), root = rootOf(form), st1 = u32(form, A_STATE1);
    const s = singletons(), map = s.game.isNull() ? NULL : ptrAt(s.game, CHANGES_MAP), e = map.isNull() ? { found: false, flags: 0, record: NULL } : readEntry(map);
    const life = st1 < 0 ? -1 : (st1 >>> 21) & 0xf;
    const row = { event: 'snapshot', label: label, form: hex(FORM), lifeState: life, lifeStateName: LIFE[life] || '?', level: proc.isNull() ? 'none' : u8(proc, P_LEVEL),
      farGeometry: high.isNull() ? 'no high process' : u8(high, H_FAR), position: vec3(form, R_LOCATION), angle: vec3(form, R_ANGLE), root: String(root),
      rootWorld: root.isNull() ? null : vec3(root, N_WORLD_T), entry: { found: e.found, flags: hex(e.flags), record: String(e.record) }, pending: s.game.isNull() ? -1 : u32(s.game, PENDING_COUNT) };
    try { row.extra = savedExtra(form); } catch (err) { row.extraError = String(err); }
    try { row.kind2 = kind2(form); } catch (err) { row.kind2Error = String(err); }
    if (!root.isNull()) {
      try { const head = findNode(root, HEAD, 0, { n: 4096 }); row.head = head.isNull() ? 'not found' : { node: String(head), worldZ: f32(head, N_WORLD_T + 8) }; } catch (err) { row.headError = String(err); }
      try { row.liveBodies = liveBodies(form); } catch (err) { row.liveBodiesError = String(err); }
      if (withLive) { try { row.livePose = livePoseHash(form); } catch (err) { row.livePoseError = String(err); } }
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
    let entry = { found: false, flags: 0, mid: 0, record: NULL };
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

  // the witnesses: per 19535 call on any thread (keyed by thread), the probe's window only for the log's inWindow flag
  const watch = { active: false, tid: -1, logs: [] };
  const reads = {}; // threadId -> the 19535 call in flight: bodies, setPos, setRot, live
  const result = { applied: false, recordBlockHash: null, liveHash: null, lastRead: null, parkHash: null, lastStored: null, extraAtFinish: null }; // for the result row after the reload
  const run = function (form, p, q) {
    const row = { event: 'apply', mode: MODE, park: PARK, form: hex(FORM), thread: q.runThread, markThread: q.markThread, deferredMs: q.deferredMs, deferredVia: q.via, entryFlags: hex(p.entry.flags) };
    const before = snapshot(form, 'before', true);
    result.liveHash = before.livePose && before.livePose.blockHash ? before.livePose.blockHash : null;
    const s = singletons(), map = p.map;
    let buf = null, rec = NULL, flagsOut = 0, body = null, step = 'start', suppressSet = false;
    watch.active = true; watch.tid = q.runThread; watch.logs = [];
    try {
      if (before.liveBodiesError !== undefined) throw new Error('the pre-pass 19533 faulted in the before snapshot (' + before.liveBodiesError + '): refused before any write');
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
        rec.writeByteArray(r.bytes.buffer);
      }
      step = 'body count';
      row.havok = body === null ? { note: 'deflated: block unread' } : havokOf(body, flagsOut, FORM);
      if (MODE === 'roundtrip' && row.havok.initialLen !== undefined) row.framingCheck = row.havok.initialLen === row.initialLen ? 'the block framing matches 35715\'s length' : 'MISMATCH: framing ' + row.havok.initialLen + ' vs initial ' + row.initialLen;
      if (row.havok.error !== undefined) throw new Error('Havok block: ' + row.havok.error);
      if (PARK && row.havok.present !== true) throw new Error('PARK refused: the record carries no Havok block');
      result.recordBlockHash = row.havok.blockHash || null;
      row.liveBodies = before.liveBodies === undefined ? null : before.liveBodies.count;
      if (row.havok.count !== undefined && row.liveBodies !== null && row.havok.count !== row.liveBodies && !FORCE) throw new Error('body count ' + row.havok.count + ' in the record, ' + row.liveBodies + ' live: refused without FORCE');
      step = 'write 35509'; // THE engine-state write; the record pointer is the engine's from here unless 35568 refuses
      const w = writeEntry(map, flagsOut, p.entry.mid, rec);
      row.written = { flags: hex(w.flags), record: String(w.record) };
      if (!w.record.equals(rec)) throw new Error('the entry does not hold our record after the write');
      step = 'apply 35568';
      const ours = rec; rec = NULL; // from here the engine owns it (its decode frees it); never freed by us after the call
      emit({ event: 'step', step: 'apply 35568', record: String(ours), header: row.record, writtenFlags: row.writtenFlags, pending: u32(s.game, PENDING_COUNT), kind2: kind2(form), extra: savedExtra(form) }); // the last row a death leaves
      row.applyReturn = nf.applyWrap(s.game, form);
      const a = readEntry(map);
      row.afterApply = { flags: hex(a.flags), record: String(a.record), pending: u32(s.game, PENDING_COUNT), kind2: kind2(form), extra: savedExtra(form) };
      if (row.applyReturn === 0) {
        if (a.record.equals(ours)) { writeEntry(map, p.entry.flags, p.entry.mid, NULL); nf.deallocate(nf.heapOf(), ours, 0); row.restored = 'the entry put back with its old flags and a null record, our record freed'; }
        throw new Error('35568 returned 0 (no entry, no record, a type mismatch or kLoading): read the formsLog rows');
      }
      if (a.record.equals(ours)) { writeEntry(map, a.flags, a.mid, NULL); row.dangling = 'the entry still held our record after a 1: nulled, not freed'; }
      result.applied = true;
      snapshot(form, 'after apply', false);
      if (PARK) { // the record's block into the queue's own sub-buffer shape, handed to 11977 (it takes the pointer; an existing extra is replaced with the log)
        step = 'park 11977';
        const blk = body.subarray(row.havok.blockStart, row.havok.blockStart + row.havok.blockLen);
        const lenBytes = viBytes(blk.length), total = 1 + lenBytes.length + blk.length;
        const sub = nf.allocate(nf.heapOf(), total, 0, 0);
        if (sub.isNull()) throw new Error('the engine heap gave no memory for the park');
        const bytes = new Uint8Array(total); bytes[0] = nf.saveVersion(); bytes.set(lenBytes, 1); bytes.set(blk, 1 + lenBytes.length);
        sub.writeByteArray(bytes.buffer);
        row.park = { before: savedExtra(form), sub: String(sub), bytes: total, blockHash: row.havok.blockHash };
        holder.writePointer(sub);
        nf.savedHavokSet(form.add(R_EXTRA), holder);
        row.park.after = savedExtra(form);
        result.parkHash = row.havok.blockHash;
      }
      step = 'finish 35567';
      if (SUPPRESS) { row.suppressWasClear = nf.suppress(s.game, 0); suppressSet = true; }
      emit({ event: 'step', step: 'finish 35567', suppress: SUPPRESS, pending: u32(s.game, PENDING_COUNT), kind2: kind2(form), extra: savedExtra(form) });
      nf.finishPass(s.game, 0);
      if (suppressSet && row.suppressWasClear === 1) { nf.suppress(s.game, 1); suppressSet = false; }
      const f = readEntry(map);
      row.afterFinish = { flags: hex(f.flags), record: String(f.record), pending: u32(s.game, PENDING_COUNT), kind2: kind2(form), extra: savedExtra(form) };
      result.extraAtFinish = row.afterFinish.extra;
      row.result = 'ok, the reload watched: the result row follows the settled snapshot';
    } catch (e) { row.error = 'at ' + step + ': ' + e; }
    if (suppressSet && row.suppressWasClear === 1) { try { nf.suppress(s.game, 1); } catch (e) { row.suppressRestoreError = String(e); } } // a throw inside 35567 must not leave the bit set
    watch.active = false;
    try { if (!rec.isNull()) { nf.deallocate(nf.heapOf(), rec, 0); row.recordFreed = 'refused before the write: our record freed'; } } catch (e) { row.freeError = String(e); }
    try { if (buf !== null) { nf.bufDestroy(buf); row.bufferDestroyed = true; } } catch (e) { row.destroyError = String(e); }
    row.logsInWindow = watch.logs;
    emit(row);
    snapshot(form, 'after', false);
    if (result.applied) poll = { form: form, started: Date.now(), rebuiltAt: 0, done: false };
  };
  // the reload watched on PlayerCharacter::Update's returns: "rebuilt" when the root returns (or 20 s), "settled" 5 s later, then the result row
  let poll = null;
  const sourceOf = function () { // judged by the bytes 19535 read (the load buffer's data), else by the last store and the extra after the finish
    const r = result.lastRead;
    if (r === null) return 'no 19535 ran for the form after the apply: the pose is the load path\'s own';
    let h = r.saved && r.saved.blockHash !== undefined ? r.saved.blockHash : undefined;
    if (h === undefined && result.extraAtFinish && result.extraAtFinish.header) h = result.extraAtFinish.header.blockHash;
    if (h === undefined && result.lastStored) h = result.lastStored.blockHash;
    if (h === undefined) return '19535 ran but no block bytes were readable: the buffer, the extra after the finish and the last store were all unreadable';
    if (h !== undefined && h === result.recordBlockHash) return 'the record\'s block (hash ' + h + ')' + (result.parkHash ? ', parked by PARK' : ', parked by the flush or identical to the live pose');
    if (h !== undefined && h === result.liveHash) return 'the copy\'s own live pose (hash ' + h + '): Set3D\'s store at the release, not the record';
    return 'a block of hash ' + h + ' matching neither the record (' + result.recordBlockHash + ') nor the live pose (' + result.liveHash + ')';
  };
  const pollStep = function () {
    if (poll === null || poll.done) return;
    const now = Date.now();
    if (poll.rebuiltAt === 0) {
      const root = rootOf(poll.form);
      if (!root.isNull() || now - poll.started >= REBUILD_WAIT_MS) {
        poll.rebuiltAt = now;
        const snap = snapshot(poll.form, root.isNull() ? 'rebuilt (timeout, no root)' : 'rebuilt', true);
        snap.rebuildMs = now - poll.started;
      }
      return;
    }
    if (now - poll.rebuiltAt < SETTLE_MS) return;
    poll.done = true;
    snapshot(poll.form, 'settled', true);
    emit({ event: 'result', form: hex(FORM), mode: MODE, park: PARK, recordBlockHash: result.recordBlockHash, liveHash: result.liveHash, parkHash: result.parkHash, lastStored: result.lastStored, extraAtFinish: result.extraAtFinish, lastRead: result.lastRead, poseSource: sourceOf() });
  };

  const counts = { innerAdd: 0, innerAddForm: 0, triggers: 0, runs: 0, refused: 0, playerUpdate: 0, formsLog: 0, havokRead: 0, havokReadForm: 0, havokBody: 0, havokPrePass: 0, flushEntry: 0, savedHavokSet: 0, set3DWrapper: 0, setData3D: 0, rigidSetPosition: 0, rigidSetRotation: 0 };
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
  const safeBytes = function (p) { try { return p.isNull() ? 'null slot' : firstBytesAt(p); } catch (e) { return 'unreadable: ' + e; } }; // a garbage slot must not fault the load
  const rbSetPos = ptrAt(at('rigidBodyVtable'), SLOT_SET_POS * 8), rbSetRot = ptrAt(at('rigidBodyVtable'), SLOT_SET_ROT * 8);
  const hookBytes = {}; // every hook's resolved address and first bytes, read before the attach (the pitfalls rule)
  ['innerAdd', 'playerUpdate', 'formsLog', 'havokRead', 'havokBody', 'havokPrePass', 'flushEntry', 'savedHavokSet', 'set3DWrapper', 'setData3D'].forEach(function (n) { hookBytes[n] = safeBytes(at(n)); });
  hookBytes.rigidSetPosition = safeBytes(rbSetPos); hookBytes.rigidSetRotation = safeBytes(rbSetRot);
  const mainTid = function () { const m = ptrAt(at('main'), 0); return m.isNull() ? -1 : u32(m, MAIN_THREAD); };
  const runPending = function (threadId, via, id) {
    if (pending === null || busy || threadId !== mainTid()) return;
    if (via !== 'PlayerCharacter::Update' && Date.now() - pending.t < 250) return; // AddChange is the fallback only
    const q = pending; pending = null; q.runThread = threadId; q.deferredMs = Date.now() - q.t; q.via = id === undefined ? via : via + ' ' + hex(id); act(q);
  };
  const attachErrors = [];
  const attachAt = function (name, p, cb) { try { if (p.isNull()) throw new Error('null address'); Interceptor.attach(p, cb); } catch (e) { attachErrors.push(name + ': ' + e); } };
  const attach = function (name, cb) { attachAt(name, at(name), cb); };
  const isForm = function (p) { return u32(p, FORM_ID) === FORM; };
  const argId = function (a) { try { return a.toUInt32() === FORM; } catch (e) { return false; } };
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
  attach('playerUpdate', { // PlayerCharacter::Update: once per frame on the main thread (HYPOTHESIS): the trigger's run and the reload poll
    onEnter() { counts.playerUpdate += 1; },
    onLeave() {
      updateThread = this.threadId;
      if (TRIGGER === 'now' && !nowArmed && pending === null) { nowArmed = true; pending = { form: NULL, flags: 0, markThread: this.threadId, t: Date.now(), runThread: this.threadId, deferredMs: 0, via: null }; emit({ event: 'mark', form: hex(FORM), trigger: 'now', armed: true }); return; }
      runPending(updateThread, 'PlayerCharacter::Update');
      if (!busy) { try { pollStep(); } catch (e) { emit({ event: 'error', where: 'poll', error: String(e) }); } }
    },
  });
  attach('formsLog', { // the engine's verdicts: printed in the window, or whenever the line carries FORM's id or a known verdict string, on any thread
    onEnter(args) {
      counts.formsLog += 1;
      let fmt = ''; try { fmt = args[0].readUtf8String(240); } catch (e) { fmt = 'unreadable: ' + e; }
      const inWindow = watch.active && this.threadId === watch.tid, carriesForm = argId(args[1]) || argId(args[2]) || argId(args[3]);
      if (!inWindow && !carriesForm && !VERDICTS.test(fmt)) return;
      if (inWindow) watch.logs.push(fmt);
      emit({ event: 'formsLog', fmt: fmt, a1: String(args[1]), a2: String(args[2]), a3: String(args[3]), thread: this.threadId, inWindow: inWindow, carriesForm: carriesForm });
    },
  });
  attach('havokRead', { // 19535 per call, any thread: the saved count from the buffer, the live count from 19533's hook, the per-body calls, the caller
    onEnter(args) {
      counts.havokRead += 1;
      this.hit = isForm(args[0]);
      if (!this.hit) return;
      counts.havokReadForm += 1;
      let saved = null; // the block 19535 reads: the load buffer's data from its position, hashed whole (36019's scrap copy of the sub-buffer's block)
      try { const pos = u32(args[1], LBUF.pos), size = u32(args[1], LBUF.size), d = ptrAt(args[1], LBUF.data).add(pos), n = Math.min(size - pos, CAP); const b = new Uint8Array(d.readByteArray(n)); saved = { blockFlags: hex(b[0]), count: vi(b, 1)[0], bytes: n, blockHash: hex(fnv1a(b)) }; } catch (e) { saved = { error: String(e) }; }
      let extra = null; try { extra = savedExtra(args[0]); } catch (e) { extra = { error: String(e) }; }
      reads[this.threadId] = { bodies: 0, setPos: 0, setRot: 0, live: null };
      this.row = { event: 'havokRead', form: hex(FORM), thread: this.threadId, caller: rva(this.returnAddress), inWindow: watch.active && this.threadId === watch.tid, saved: saved, extraAtEntry: extra, afterApply: result.applied };
      emit(this.row);
    },
    onLeave() {
      if (!this.hit) return;
      const r = reads[this.threadId] || { bodies: 0, setPos: 0, setRot: 0, live: null };
      delete reads[this.threadId];
      const done = { event: 'havokReadDone', form: hex(FORM), thread: this.threadId, caller: this.row.caller, saved: this.row.saved, live: r.live, bodies: r.bodies, setPosition: r.setPos, setRotation: r.setRot, extraAtEntry: this.row.extraAtEntry, afterApply: this.row.afterApply };
      if (this.row.afterApply) result.lastRead = done;
      emit(done);
    },
  });
  attach('havokPrePass', { // 19533 inside 19535: the live count the reader compares with the saved one
    onEnter(args) { counts.havokPrePass += 1; this.r = reads[this.threadId]; this.state = args[1]; },
    onLeave() { if (this.r !== undefined) this.r.live = { flags: hex(u8(this.state, 0)), count: u32(this.state, 4) + u32(this.state, 8) }; },
  });
  attach('havokBody', { onEnter() { counts.havokBody += 1; const r = reads[this.threadId]; if (r !== undefined) r.bodies += 1; } });
  attachAt('rigidSetPosition', rbSetPos, { onEnter() { counts.rigidSetPosition += 1; const r = reads[this.threadId]; if (r !== undefined) r.setPos += 1; } });
  attachAt('rigidSetRotation', rbSetRot, { onEnter() { counts.rigidSetRotation += 1; const r = reads[this.threadId]; if (r !== undefined) r.setRot += 1; } });
  attach('flushEntry', { onEnter(args) { counts.flushEntry += 1; if (!isForm(args[1])) return; emit({ event: 'flush', form: hex(FORM), kind: u32(args[0], 0), thread: this.threadId, inWindow: watch.active && this.threadId === watch.tid }); } });
  attach('savedHavokSet', { // 11977: the park (ours or the flush's) or Set3D's store of the live pose; the sub-buffer's header prints
    onEnter(args) {
      counts.savedHavokSet += 1;
      if (!isForm(args[0].sub(R_EXTRA))) return;
      let h = null; try { h = subHeader(ptrAt(args[1], 0)); } catch (e) { h = { error: String(e) }; }
      if (h !== null && h.error === undefined) result.lastStored = h;
      emit({ event: 'savedHavokSet', form: hex(FORM), caller: rva(this.returnAddress), thread: this.threadId, sub: h, matchesRecord: h !== null && h.blockHash === result.recordBlockHash, matchesLive: h !== null && h.blockHash === result.liveHash });
    },
  });
  attach('set3DWrapper', { onEnter(args) { counts.set3DWrapper += 1; if (!isForm(args[0])) return; emit({ event: 'set3D', form: hex(FORM), node: String(args[1]), caller: rva(this.returnAddress), thread: this.threadId }); } });
  attach('setData3D', { onEnter(args) { counts.setData3D += 1; if (!isForm(args[0])) return; emit({ event: 'data3D', form: hex(FORM), node: String(args[1]), caller: rva(this.returnAddress), thread: this.threadId }); } });
  setInterval(function () { emit({ event: 'liveness', counts: counts, updateThread: updateThread, pending: pending !== null, runs: counts.runs, polling: poll !== null && !poll.done }); }, 10000);

  const s0 = singletons();
  let ver0 = -1;
  try { ver0 = nf.saveVersion(); } catch (e) { attachErrors.push('saveVersion: ' + e); }
  const ready = { event: 'ready', version: version, pid: Process.id, base: String(exe.base), form: hex(FORM), mode: MODE, trigger: TRIGGER, flag: hex(FLAG), runs: RUNS, force: FORCE, suppress: SUPPRESS, park: PARK, hooks: hookBytes,
    game: String(s0.game), manager: String(s0.manager), main: String(s0.main), handler: String(s0.handler), player: String(s0.player),
    managerFlags: s0.game.isNull() ? -1 : hex(u32(s0.game, MANAGER_FLAGS)), pending: s0.game.isNull() ? -1 : u32(s0.game, PENDING_COUNT), dryRun: s0.manager.isNull() ? -1 : u8(s0.manager, DRY_RUN),
    mainThread: s0.main.isNull() ? -1 : u32(s0.main, MAIN_THREAD), saveVersion: ver0, attachErrors: attachErrors };
  if (MODE === 'apply') { try { const r = parseRecord(); ready.record = { type: r.type, sizeCode: r.sizeCode, version: r.version, length1: r.length1, length2: r.length2, total: r.total, fnv1a: r.fnv1a, problems: r.problems, flags: hex(FLAGS >>> 0), havok: r.length2 === 0 ? havokOf(r.bytes.subarray(r.bodyStart), FLAGS >>> 0, FORM) : 'deflated' }; } catch (e) { ready.recordError = String(e); } }
  emit(ready);
}
