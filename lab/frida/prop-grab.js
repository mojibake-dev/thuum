// prop-grab.js: the player's grab of a prop, on the grabber's seat and on the other seat (thuum docs/engine/havok-props.md
// rows E13, E14, E15, E31; docs/verbs/prop-physics.md A2 and A6). The engine's grab is PlayerCharacter::StartGrabObject
// (CommonLibSSE-NG include/RE/Offsets.h:452, RELOCATION_ID(39475, 40552); include/RE/P/PlayerCharacter.h:570); its end is
// DestroyMouseSprings (src/RE/P/PlayerCharacter.cpp:66-70, RELOCATION_ID(39480, 40557); EndGrabObject at :74-79 is inline
// and calls it when grabType is kNormal). The player's grab state lives in its runtime data: grabbedObject (an
// ObjectRefHandle, PlayerCharacter.h:697 "8C8"), grabObjectWeight (:698 "8CC") and grabType (:712 "AF4"; GrabbingType
// kNone 0, kNormal 1, kTelekinesis 2 at :255-260). The runtime data begins at 0x3E0 on runtimes newer than 1.6.629
// (GetPlayerRuntimeData, PlayerCharacter.h:793-796: RelocateMemberIfNewer 0x3D8, 0x3E0) and the field comments are the
// older layout's absolute offsets (the first field reads "3D8, 3E0"), so on 1.6.1170 each field sits 8 bytes on:
// grabbedObject 0x8D0, grabObjectWeight 0x8D4, grabType 0xAFC (HYPOTHESIS until a grab reads a sane handle and weight
// here; RAW shows the raw words). The player is the singleton at 403521 (Offsets.h:451; PlayerCharacter.cpp:16-20, a
// NiPointer<PlayerCharacter>*); a handle becomes a reference through LookupReferenceByHandle (Offsets.h:582,
// RELOCATION_ID(12204, 12332)); each lookup keeps one reference count, as face-dump.js's does, and the poll's lookups run
// on Frida's thread as face-dump.js's walk did. Hooks: StartGrabObject (enter and leave: the grab fields before and after,
// the grabbed reference's form id), DestroyMouseSprings (the release: the fields at entry); a poll every POLL_MS (250)
// emits the grab fields whenever they change, so each seat's hold is a timeline. Expected on the grabber's seat:
// StartGrabObject once per E held past the engine's threshold (the gap from the lab's key press to the enter stamp IS the
// threshold, E13), the handle non-zero and the weight set on leave, the poll holding them until DestroyMouseSprings; on the
// other seat during the hold: no StartGrabObject and the poll's handle 0 throughout (E14, E15); and if the other seat's E
// is held on the same body (a Keyframed copy under the holder's stream): StartGrabObject with the handle still 0 on leave,
// or no call at all (E31, E28's refusal). Every id is a HYPOTHESIS until this trace reads as expected (rule 2).
// Params: POLL_MS (250), RAW (false).
// Offsets by `just addr` (lab/addr.py, Address Library 1.6.1170 only), 2026-11-03.
const PARAMS = (typeof LAB_PARAMS === 'object' && LAB_PARAMS) ? LAB_PARAMS : {};
const RAW = PARAMS.RAW === undefined ? false : !!PARAMS.RAW;
const POLL_MS = PARAMS.POLL_MS === undefined ? 250 : Number(PARAMS.POLL_MS);
function emit(obj) { obj.t = Date.now(); send(obj); console.log(JSON.stringify(obj)); }

const OFFSETS = {
  '1.6.1170.0': {
    startGrab: 0x73ec70, // 40552 PlayerCharacter::StartGrabObject
    destroyMouseSprings: 0x7414b0, // 40557 PlayerCharacter::DestroyMouseSprings
    playerSingleton: 0x31874f8, // 403521 the NiPointer<PlayerCharacter> singleton
    lookupRef: 0x179710, // 12332 LookupReferenceByHandle(const RefHandle&, NiPointer<TESObjectREFR>&)
  },
};
// PlayerCharacter.h:697-698 and :712, the older layout's "8C8", "8CC", "AF4" plus the 8 bytes of the newer runtime-data start
const FIELDS = { grabbedObject: 0x8d0, grabObjectWeight: 0x8d4, grabType: 0xafc };

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
const u32 = function (p, o) { try { return p.add(o).readU32(); } catch (e) { return -1; } };
const f32 = function (p, o) { try { return p.add(o).readFloat(); } catch (e) { return NaN; } };
const ptrAt = function (p, o) { try { return p.add(o).readPointer(); } catch (e) { return NULL; } };
const r1 = function (x) { return Math.round(x * 10) / 10; };
const raw = function (args) { return RAW ? [String(args[0]), String(args[1]), String(args[2]), String(args[3])] : undefined; };

const exe = Process.getModuleByName('SkyrimSE.exe');
const version = fileVersion(exe.path);
const off = OFFSETS[version];
if (off === undefined) {
  emit({ error: 'no offsets for this runtime', version: version });
} else {
  const at = function (name) { return exe.base.add(off[name]); };
  const lookup = new NativeFunction(at('lookupRef'), 'bool', ['pointer', 'pointer'], 'win64');
  const refOfHandle = function (handle) {
    if (handle <= 0) return '0x0';
    const h = Memory.alloc(4);
    h.writeU32(handle);
    const out = Memory.alloc(Process.pointerSize);
    out.writePointer(NULL);
    try {
      lookup(h, out);
      const r = out.readPointer();
      return r.isNull() ? '0x0' : hex(formId(r));
    } catch (e) { return 'err'; }
  };
  const grabFacts = function (player) {
    if (player.isNull()) return { handle: 0, weight: NaN, type: -1 };
    return { handle: u32(player, FIELDS.grabbedObject), weight: r1(f32(player, FIELDS.grabObjectWeight)), type: u32(player, FIELDS.grabType) };
  };
  const withRef = function (f) { return { handle: hex(f.handle), ref: refOfHandle(f.handle), weight: f.weight, type: f.type }; };
  const player = function () { return ptrAt(at('playerSingleton'), 0); };

  Interceptor.attach(at('startGrab'), {
    onEnter(args) { this.player = args[0]; this.before = grabFacts(args[0]); this.a = raw(args); },
    onLeave(retval) {
      const after = grabFacts(this.player);
      emit({ fn: 'StartGrabObject', id: 40552, tid: this.threadId, before: withRef(this.before), after: withRef(after), args: this.a });
    },
  });
  Interceptor.attach(at('destroyMouseSprings'), {
    onEnter(args) {
      emit({ fn: 'DestroyMouseSprings', id: 40557, tid: this.threadId, held: withRef(grabFacts(args[0])), args: raw(args) });
    },
  });
  let lastKey = null;
  setInterval(function () {
    const f = grabFacts(player());
    const key = f.handle + '/' + f.type + '/' + f.weight;
    if (key === lastKey) return;
    lastKey = key;
    emit(Object.assign({ event: 'grab state' }, withRef(f)));
  }, POLL_MS);
  emit({ event: 'ready', version: version, poll_ms: POLL_MS, raw: RAW });
}
