// story-location.js: the Story Manager's Change Location event on a lab seat (thuum docs/verbs/quest-stage.md
// H-56a; docs/research/m3/re-story-location.md). The engine's sender PlayerCharacter::SetParentCell (40466)
// raises the event only when the player's currentLocation differs from the new cell's location, which a login
// inside the location never does; fork m3-story-arrival's native queues the same event once at login. Hooks:
// BGSStoryEventManager::AddEvent_Impl (32359: rcx the manager, edx the event index against the Change Location
// index static (380069), r8 the event: u32 handle at +0, forms at +8 and +0x10 with their ids at +0x14),
// SetParentCell (40466: rcx the player, rdx the cell; logs the cell's id, the player's currentLocation at +0xAD0
// and the cell's location by 18905), BGSStoryTeller::BeginStartUpQuest (32485: rdx the quest), and the
// location-change SendEvent (20039: rdx the TESActorLocationChangeEvent: NiPointer actor at +0, old +8, new
// +0x10). Expected (a) a placement into Riverwood: one SetParentCell with currentLocation != 13163, one AddEvent
// with the CLOC index and {handle, old, 13163}, one SendEvent, then BeginStartUpQuest 74a83 within the next
// Story Manager update (other listeners may start too). (b) a login inside: SetParentCell with currentLocation
// == 13163 and no AddEvent; the native then yields one AddEvent of the same shape, then BeginStartUpQuest 74a83.
// Every id is a HYPOTHESIS until this trace reads as expected (rule 2). Params: RAW (true prints raw args).
// Offsets by `just addr` (lab/addr.py, Address Library 1.6.1170 only), 2026-10-29.
const PARAMS = (typeof LAB_PARAMS === 'object' && LAB_PARAMS) ? LAB_PARAMS : {};
const RAW = PARAMS.RAW === undefined ? false : !!PARAMS.RAW;
function emit(obj) { obj.t = Date.now(); send(obj); console.log(JSON.stringify(obj)); }

const OFFSETS = {
  '1.6.1170.0': {
    addEvent: 0x52bc80, // 32359 BGSStoryEventManager::AddEvent_Impl
    setParentCell: 0x7351b0, // 40466 PlayerCharacter::SetParentCell (vtable slot 0x98)
    beginStartUpQuest: 0x532d20, // 32485 BGSStoryTeller::BeginStartUpQuest
    locationSendEvent: 0x2f45d0, // 20039 the TESActorLocationChangeEvent source's SendEvent
    clocIndex: 0x2010688, // 380069 the Change Location event's index static
    cellLocation: 0x2b5510, // 18905 TESObjectCELL::GetLocation
  },
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

const formId = function (p) { try { return p.isNull() ? 0 : p.add(0x14).readU32(); } catch (e) { return -1; } };
const hex = function (n) { return n < 0 ? String(n) : '0x' + n.toString(16); };
const ptrAt = function (p, o) { try { return p.add(o).readPointer(); } catch (e) { return NULL; } };
const u32 = function (p, o) { try { return p.add(o).readU32(); } catch (e) { return -1; } };
const raw = function (args) { return RAW ? [String(args[0]), String(args[1]), String(args[2]), String(args[3])] : undefined; };

const exe = Process.getModuleByName('SkyrimSE.exe');
const version = fileVersion(exe.path);
const off = OFFSETS[version];
if (off === undefined) {
  emit({ error: 'no offsets for this runtime', version: version });
} else {
  const at = function (name) { return exe.base.add(off[name]); };
  const clocIndex = function () { try { return at('clocIndex').readU32(); } catch (e) { return -1; } };
  const cellLocation = new NativeFunction(at('cellLocation'), 'pointer', ['pointer']);
  Interceptor.attach(at('addEvent'), {
    onEnter(args) {
      const index = args[1].toInt32();
      const e = args[2];
      this.row = { fn: 'AddEvent', id: 32359, tid: this.threadId, index: index, cloc: index === clocIndex(), clocIndex: clocIndex(),
        handle: hex(u32(e, 0)), oldLoc: hex(formId(ptrAt(e, 8))), newLoc: hex(formId(ptrAt(e, 0x10))), args: raw(args) };
    },
    onLeave(retval) { this.row.ret = String(retval); emit(this.row); },
  });
  Interceptor.attach(at('setParentCell'), {
    onEnter(args) {
      const player = args[0];
      const cell = args[1];
      let cellLoc = 0;
      try { cellLoc = cell.isNull() ? 0 : formId(cellLocation(cell)); } catch (e) { cellLoc = -1; }
      this.row = { fn: 'SetParentCell', id: 40466, tid: this.threadId, cell: hex(formId(cell)), parentCell: hex(formId(ptrAt(player, 0x60))),
        currentLocation: hex(formId(ptrAt(player, 0xad0))), cellLocation: hex(cellLoc) };
    },
    onLeave(retval) { emit(this.row); },
  });
  Interceptor.attach(at('beginStartUpQuest'), {
    onEnter(args) { this.q = formId(args[1]); },
    onLeave(retval) { emit({ fn: 'BeginStartUpQuest', id: 32485, tid: this.threadId, quest: hex(this.q), ret: String(retval) }); },
  });
  Interceptor.attach(at('locationSendEvent'), {
    onEnter(args) {
      const e = args[1];
      this.row = { fn: 'locationChanged SendEvent', id: 20039, tid: this.threadId, actor: hex(formId(ptrAt(e, 0))),
        oldLoc: hex(formId(ptrAt(e, 8))), newLoc: hex(formId(ptrAt(e, 0x10))) };
    },
    onLeave(retval) { emit(this.row); },
  });
  emit({ event: 'ready', version: version, clocIndex: clocIndex(), raw: RAW });
}
