// transplant-capture.js (thuum, numidium 2026-11-03; docs/engine/change-forms.md D1 to D3, the transplant's first half): on the
// seat where a reference changed, the record the engine itself stores for it when its cell unloads. AL 35570 stores a form's
// record in the changes map (CheckSaveGame, the initial data, SaveGame, packed by AL 36081, written by AL 35509); on its leave for
// the form FORM this script reads the map's entry back (AL 35503) and prints the entry's change flags and the record's bytes as
// hex, with the header decoded, for transplant-inject.js on another seat. Every id, signature and layout is the re-analyst's
// decompile (2026-11-03) and a HYPOTHESIS until this trace reads as expected (rule 2). Params: FORM (the form id, required).
const PARAMS = (typeof LAB_PARAMS === 'object' && LAB_PARAMS) ? LAB_PARAMS : {};
const FORM = Number(PARAMS.FORM);
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
  },
};
const CHANGES_MAP = 0x330; // BGSSaveLoadGame.h:94: BGSSaveLoadChangesMap* saveLoadChanges
const FORM_ID = 0x14; // TESForm.h:354
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
if (off === undefined || !(FORM > 0)) {
  emit({ error: off === undefined ? 'no offsets for this runtime' : 'FORM is required', version: version, pid: Process.id });
} else {
  const at = function (name) { return exe.base.add(off[name]); };
  const read = new NativeFunction(at('read'), 'bool', ['pointer', 'uint32', 'pointer']);
  const changesMap = function () { const g = ptrAt(at('singleton'), 0); return g.isNull() ? NULL : ptrAt(g, CHANGES_MAP); };
  const value = Memory.alloc(16);
  const entry = function (why) {
    const map = changesMap();
    if (map.isNull()) { emit({ event: 'record', why: why, error: 'no changes map' }); return; }
    value.writeU32(0); value.add(4).writeU32(0); value.add(8).writePointer(NULL);
    const found = read(map, FORM, value);
    const row = { event: 'record', why: why, form: hex(FORM), found: found, flags: hex(value.readU32()), unk: hex(value.add(4).readU32()) };
    const rec = value.add(8).readPointer();
    row.record = String(rec);
    if (found && !rec.isNull()) {
      try { const h = recordHeader(rec); Object.assign(row, h); row.hex = toHex(rec, h.total); } catch (e) { row.error = String(e); }
    }
    emit(row);
  };
  Interceptor.attach(at('stash'), {
    onEnter(args) { this.id = u32(args[1], FORM_ID); this.ret = this.returnAddress; },
    onLeave() { if (this.id === FORM) { emit({ event: 'stash', form: hex(FORM), caller: hex(this.ret.sub(exe.base).toUInt32()) }); entry('after the stash'); } },
  });
  Interceptor.attach(at('write'), {
    onEnter(args) {
      if (args[1].toUInt32() !== FORM) return;
      emit({ event: 'write', form: hex(FORM), flags: hex(u32(args[2], 0)), record: String(ptrAt(args[2], 8)), caller: hex(this.returnAddress.sub(exe.base).toUInt32()) });
    },
  });
  Interceptor.attach(at('apply'), {
    onEnter(args) { this.id = u32(args[1], FORM_ID); },
    onLeave(retval) { if (this.id === FORM) emit({ event: 'apply', form: hex(FORM), applied: retval.toUInt32() & 0xff }); },
  });
  emit({ event: 'ready', version: version, pid: Process.id, form: hex(FORM), map: String(changesMap()) });
  entry('at the attach');
}
