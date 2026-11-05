// pillar-anim-trace.js: which engine family animates a world object (thuum
// docs/verbs/traps.md, ADR-059 decision 3; written 21:4x PST 2026-11-01 after
// x-object-anim v3 20261102-051618 read the puzzle pillar silent under the
// platform's NotifyAnimationGraph hook while the swinging wall and the plate
// spoke through it). Two hooks on SkyrimSE.exe 1.6.1170, both ids
// CommonLibSSE-NG's, resolved by lab/addr.py:
//   - TESObjectREFR::PlayAnimation_Impl (Offsets.h:546, Offset::TESObjectREFR::
//     PlayAnimation, AE 14297 -> 0x1d50a0): rcx this, rdx NiControllerManager,
//     r8 toSeq, r9 fromSeq; the NiControllerManager family (a sequence's name
//     at NiControllerSequence+0x10, include/RE/N/NiControllerSequence.h:87);
//   - the platform's SendAnimation target (game/Offsets.h SendAnimation, AE
//     38048 -> 0x6a35f0): rcx the IAnimationGraphManagerHolder, which sits
//     0x38 into its TESObjectREFR (include/RE/T/TESObjectREFR.h:112), rdx the
//     event name (a BSFixedString's char**); the behavior-graph family.
// Prints one row per call on a non-actor reference (form type not ACHR
// 0x3e, include/RE/F/FormTypes.h:202; a form's id at +0x14 and type at +0x1a,
// include/RE/T/TESForm.h:354, :356): {fn, refr, to, from | event, frames}.
// Rows: {ready, version, hooks} once; {fn: 'playAnimation', refr, to, from,
// frames} and {fn: 'notifyGraph', refr, event, frames} per call; {fn, err}
// once per failing hook. Run on the seat hosting Bleak Falls Temple before
// the host turns a pillar (x-object-anim v4's leg C). 1.6.1170 only.
const OFFSETS = {
  '1.6.1170.0': {
    playAnimation: 0x1d50a0, // lab/addr.py addrlib 1.6.1170 14297: TESObjectREFR::PlayAnimation_Impl (CommonLibSSE-NG Offsets.h:546)
    sendAnimation: 0x6a35f0, // lab/addr.py addrlib 1.6.1170 38048: the platform's SendAnimation hook target (game/Offsets.h)
  },
};
const HOLDER_IN_REFR = 0x38; // include/RE/T/TESObjectREFR.h:112
const SEQUENCE_NAME = 0x10; // include/RE/N/NiControllerSequence.h:87
const FORM_ID = 0x14; // include/RE/T/TESForm.h:354
const FORM_TYPE = 0x1a; // include/RE/T/TESForm.h:356
const ACHR = 0x3e; // include/RE/F/FormTypes.h:202

// every row to console.log as well: lab-api's preamble captures console.log alone (lamp-shot-trace.js v1.1's review)
function emit(row) { send(row); console.log(JSON.stringify(row)); }

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

function hex(n) { return '0x' + (n >>> 0).toString(16); }

function readable(p) {
  if (p.isNull()) return false;
  const r = Process.findRangeByAddress(p);
  return r !== null && r.protection.indexOf('r') === 0;
}

function describe(p) {
  const m = Process.findModuleByAddress(p);
  return m ? m.name + '+0x' + p.sub(m.base).toString(16) : p.toString();
}

function where(context) {
  let bt;
  try { bt = Thread.backtrace(context, Backtracer.ACCURATE); } catch (e) { bt = Thread.backtrace(); }
  return bt.slice(0, 10).map(describe);
}

const failed = {};
function fail(fn, e) {
  if (failed[fn]) return;
  failed[fn] = true;
  emit({ fn: fn, err: String(e) });
}

// a world object's id, or null when p does not read as a non-actor form
function refrInfo(p) {
  if (!readable(p)) return null;
  try {
    const type = p.add(FORM_TYPE).readU8();
    if (type === ACHR) return null;
    return { id: hex(p.add(FORM_ID).readU32()), type: type };
  } catch (e) {
    return null;
  }
}

function sequenceName(seq) {
  if (!readable(seq)) return null;
  try {
    const s = seq.add(SEQUENCE_NAME).readPointer();
    return readable(s) ? s.readUtf8String() : null;
  } catch (e) {
    return null;
  }
}

let seq = 0;
const exe = Process.getModuleByName('SkyrimSE.exe');
const version = fileVersion(exe.path);
const at = OFFSETS[version];
if (at === undefined) {
  emit({ error: 'no offsets for this runtime', version: version });
} else {
  let hooks = 0;
  try {
    Interceptor.attach(exe.base.add(at.playAnimation), {
      onEnter(args) {
        try {
          const info = refrInfo(args[0]);
          if (info === null) return;
          emit({
            fn: 'playAnimation', seq: ++seq, tid: Process.getCurrentThreadId(),
            refr: info.id, type: info.type,
            to: sequenceName(args[2]), from: sequenceName(args[3]),
            frames: where(this.context),
          });
        } catch (e) { fail('playAnimation', e); }
      },
    });
    hooks++;
  } catch (e) { fail('attach:playAnimation', e); }
  try {
    Interceptor.attach(exe.base.add(at.sendAnimation), {
      onEnter(args) {
        try {
          if (args[0].isNull()) return;
          const info = refrInfo(args[0].sub(HOLDER_IN_REFR));
          if (info === null) return;
          let event = null;
          if (readable(args[1])) {
            const s = args[1].readPointer();
            event = readable(s) ? s.readUtf8String() : null;
          }
          this.row = {
            fn: 'notifyGraph', seq: ++seq, tid: Process.getCurrentThreadId(),
            refr: info.id, type: info.type, event: event,
            frames: where(this.context),
          };
        } catch (e) { fail('notifyGraph', e); }
      },
      onLeave(retval) {
        if (this.row) {
          this.row.ret = retval.toString();
          emit(this.row);
        }
      },
    });
    hooks++;
  } catch (e) { fail('attach:sendAnimation', e); }
  emit({ ready: true, version: version, hooks: hooks });
}
