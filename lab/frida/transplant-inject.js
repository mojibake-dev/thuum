// transplant-inject.js (thuum, numidium 2026-11-03; docs/engine/change-forms.md D3, the transplant's second half): on a fresh
// seat that has never loaded the reference's cell, write a record another seat's engine stored (transplant-capture.js) into this
// engine's changes map, so the cell's init applies it as its own (AL 35569 through the reference's LoadGame, before its 3D loads).
// The record is allocated by the engine's own heap (MemoryManager::Allocate, as RE::malloc does, MemoryManager.h:98-104), since
// the apply frees it with MemoryManager::Deallocate; an entry already holding a record is freed first, since the write (AL 35509)
// frees nothing. The apply (35569) and the decode (36080) are hooked for FORM, so the trace shows whether the engine took it.
// Every id, signature and layout is the re-analyst's decompile (2026-11-03) and a HYPOTHESIS until this trace and the seat's
// read of the reference agree (rule 2). Its fresh review (FIX FIRST, applied as written): the record is checked in JS before any
// engine call (hex form, type 0, size code under 3, the engine's own version from AL 35740, 2 + 2n + length1 equal to the bytes,
// length2 0, no move, cell-change or promoted flag, a game-file form id, and the capture's FNV-1a); an existing entry is refused,
// never freed (a free outside the map's write lock can race a stash, an apply or a save); the write is refused while the
// manager loads or saves; Frida's 'bool' arguments take 0 or 1, not JS booleans; the ready row comes before the write, and the
// apply and decode calls are counted for every form, with a liveness row every 10 s.
// Params: FORM, FLAGS (the entry's change flags), HEX (the record's bytes), SUM (the capture's FNV-1a of them), all required.
const PARAMS = (typeof LAB_PARAMS === 'object' && LAB_PARAMS) ? LAB_PARAMS : {};
const FORM = Number(PARAMS.FORM);
const FLAGS = Number(PARAMS.FLAGS);
const HEX = typeof PARAMS.HEX === 'string' ? PARAMS.HEX : '';
const SUM = Number(PARAMS.SUM);
function emit(obj) {
  obj.t = Date.now();
  send(obj);
  console.log(JSON.stringify(obj));
}
// Offsets by `just addr` (lab/addr.py, Address Library 1.6.1170 only), 2026-11-03
const OFFSETS = {
  '1.6.1170.0': {
    stash: 0x603a70, // 35570 BGSSaveLoadGame's store of a form's record at its unload (manager, form, force)
    read: 0x600930, // 35503 the changes map's read (map, form id, Value* out) -> bool
    write: 0x600e20, // 35509 the changes map's write (map, form id, const Value*): insert or overwrite, frees nothing
    apply: 0x6037a0, // 35569 the record's apply at a cell's init (manager, form, BGSLoadFormBuffer*) -> bool
    decode: 0x628210, // 36080 the record's decode, run inside the apply
    singleton: 0x317aba8, // 403330 BGSSaveLoadGame** (BGSSaveLoadGame.h:71)
    heap: 0x11bba0, // 11141 MemoryManager::GetSingleton (MemoryManager.h:29)
    allocate: 0xcc40c0, // 68115 MemoryManager::Allocate (MemoryManager.h:36)
    deallocate: 0xcc4510, // 68117 MemoryManager::Deallocate (MemoryManager.h:43)
    saveVersion: 0x610980, // 35740 the change-form version the engine writes (the re-analyst: 0x4e)
  },
};
const CHANGES_MAP = 0x330; // BGSSaveLoadGame.h:94: BGSSaveLoadChangesMap* saveLoadChanges
const FORM_ID = 0x14; // TESForm.h:354
const MANAGER_FLAGS = 0x340; // BGSSaveLoadGame.h:96; kLoading 1 << 1, kSaving 1 << 2 (:61-62)
const FORBIDDEN_FLAGS = 0x0200000e; // kMoved, kHavokMoved, kCellChanged, kPromoted: initial data 4 or 6, which needs a cell registration
const fnv1a = function (bytes) { let h = 0x811c9dc5; for (const b of bytes) { h ^= b; h = Math.imul(h, 0x01000193) >>> 0; } return h >>> 0; };
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
const toHex = function (p, n) {
  const a = new Uint8Array(p.readByteArray(n));
  let s = '';
  for (let i = 0; i < a.length; i++) s += ('0' + a[i].toString(16)).slice(-2);
  return s;
};
// a change-form record in memory (the re-analyst's read of AL 36081 and 36080, HYPOTHESIS): byte 0 holds the type index in its
// low 6 bits and a size code in its top 2 (each length field 1, 2 or 4 bytes), byte 1 the version, then length1 (the stored data's
// length) and length2 (the uncompressed length, 0 when raw), then the data inline: 2 + 2n + length1 bytes in all
const recordHeader = function (rec) {
  const b0 = rec.readU8();
  const s = b0 >> 6;
  const n = s === 0 ? 1 : (s === 1 ? 2 : 4);
  const len = function (o) { return n === 1 ? rec.add(o).readU8() : (n === 2 ? rec.add(o).readU16() : rec.add(o).readU32()); };
  const length1 = len(2);
  const length2 = len(2 + n);
  return { type: b0 & 0x3f, sizeCode: s, version: rec.add(1).readU8(), length1: length1, length2: length2, total: 2 + 2 * n + length1 };
};

const exe = Process.getModuleByName('SkyrimSE.exe');
const version = fileVersion(exe.path);
const off = OFFSETS[version];
if (off === undefined || !(FORM > 0) || !(FLAGS >= 0) || !(SUM >= 0) || !/^([0-9a-fA-F]{2})+$/.test(HEX)) {
  emit({ event: 'ready', error: off === undefined ? 'no offsets for this runtime' : 'FORM, FLAGS, HEX and SUM are required', version: version, pid: Process.id });
} else {
  const at = function (name) { return exe.base.add(off[name]); };
  const read = new NativeFunction(at('read'), 'bool', ['pointer', 'uint32', 'pointer']);
  const write = new NativeFunction(at('write'), 'void', ['pointer', 'uint32', 'pointer']);
  const heapOf = new NativeFunction(at('heap'), 'pointer', []);
  const allocate = new NativeFunction(at('allocate'), 'pointer', ['pointer', 'uint64', 'int32', 'bool']);
  const saveVersion = new NativeFunction(at('saveVersion'), 'uint8', []);
  const manager = function () { return ptrAt(at('singleton'), 0); };
  const changesMap = function () { const g = manager(); return g.isNull() ? NULL : ptrAt(g, CHANGES_MAP); };
  const bytes = [];
  for (let i = 0; i < HEX.length; i += 2) bytes.push(parseInt(HEX.substr(i, 2), 16));
  const value = Memory.alloc(16);
  const counts = { apply: 0, decode: 0 };
  let inApply = false;
  let decodes = 0;
  Interceptor.attach(at('apply'), {
    onEnter(args) { counts.apply += 1; this.id = u32(args[1], FORM_ID); if (this.id === FORM) { inApply = true; decodes = 0; } },
    onLeave(retval) {
      if (this.id !== FORM) return;
      inApply = false;
      emit({ event: 'apply', form: hex(FORM), applied: retval.toUInt32() & 0xff, decodes: decodes });
    },
  });
  Interceptor.attach(at('decode'), { onEnter() { counts.decode += 1; if (inApply) decodes += 1; } });
  setInterval(function () { emit({ event: 'liveness', counts: counts }); }, 10000);
  const g = manager();
  const managerFlags = g.isNull() ? -1 : u32(g, MANAGER_FLAGS);
  emit({ event: 'ready', version: version, pid: Process.id, base: String(exe.base), form: hex(FORM), map: String(changesMap()),
    managerFlags: hex(managerFlags) });
  const row = { event: 'inject', form: hex(FORM), flags: hex(FLAGS), bytes: bytes.length };
  try {
    // the record checked before any engine call (the review's finding 2)
    const b0 = bytes[0];
    const sizeCode = b0 >> 6;
    if ((b0 & 0x3f) !== 0) throw new Error('not a REFR record: type ' + (b0 & 0x3f));
    if (sizeCode > 2) throw new Error('size code ' + sizeCode);
    const n = sizeCode === 0 ? 1 : (sizeCode === 1 ? 2 : 4);
    const le = function (o) { let v = 0; for (let k = n - 1; k >= 0; k--) v = v * 256 + bytes[o + k]; return v; };
    const want = saveVersion();
    if (bytes[1] !== want) throw new Error('version ' + bytes[1] + ', the engine writes ' + want);
    const length1 = le(2);
    const length2 = le(2 + n);
    if (2 + 2 * n + length1 !== bytes.length) throw new Error('length1 ' + length1 + ' disagrees with ' + bytes.length + ' bytes');
    if (length2 !== 0) throw new Error('a compressed record (length2 ' + length2 + ')');
    if ((FLAGS & FORBIDDEN_FLAGS) !== 0) throw new Error('flags ' + hex(FLAGS) + ' carry a move, cell or promoted bit');
    if (FORM >= 0xff000000) throw new Error('a created form');
    const sum = fnv1a(bytes);
    if (sum !== SUM) throw new Error('checksum ' + hex(sum) + ', the capture printed ' + hex(SUM));
    if (managerFlags < 0 || (managerFlags & 6) !== 0) throw new Error('the manager is loading or saving (' + hex(managerFlags) + ')');
    const map = changesMap();
    if (map.isNull()) throw new Error('no changes map');
    value.writeU32(0); value.add(4).writeU32(0); value.add(8).writePointer(NULL);
    if (read(map, FORM, value)) throw new Error('an entry exists (flags ' + hex(value.readU32()) + '): refused, never freed');
    const rec = allocate(heapOf(), bytes.length, 0, 0);
    if (rec.isNull()) throw new Error('the engine heap gave no memory');
    rec.writeByteArray(bytes);
    row.header = recordHeader(rec);
    value.writeU32(FLAGS); value.add(4).writeU32(0); value.add(8).writePointer(rec);
    write(map, FORM, value);
    value.writeU32(0); value.add(8).writePointer(NULL);
    row.readBack = read(map, FORM, value);
    row.readBackFlags = hex(value.readU32());
    row.readBackIsOurs = value.add(8).readPointer().equals(rec);
    row.written = true;
  } catch (e) {
    row.error = String(e);
    row.written = false;
  }
  emit(row);
}
