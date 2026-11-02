// trap-path-trace.js v3: the engine's path from a trap's swing to a body's damage
// on the seat hosting the cell (thuum docs/verbs/traps.md, ADR-059 decision 4;
// written 21:5x PST 2026-11-01 from the re-analyst's static read on sky-re, every
// fact HYPOTHESIS until this trace reads it; v2 at 22:08 PST 2026-11-01 after x-trap-path v1
// 20261102-055845 printed no row for the figure while the wall swung at it: the
// native and DoTrap1 rows are now unfiltered, any target, and the engine's own
// TESTrapHitEvent dispatch is hooked, so the player's own hit proves the hooks
// and a figure's silence places the miss). Five attaches on SkyrimSE.exe
// 1.6.1170, ids by lab/addr.py. v3 (05:15 PST 2026-11-02) after x-trap-path v3 20261102-130725: the liveness swing
// landed twice (the server's OnWeaponHit lines) and the trace still printed no row, so
// the trace is wrong before the engine is. v3 proves itself: the ready row carries the
// process id (compare with the platform log's pid), the module base, each hook's
// resolved address and its first eight bytes; every hook counts every call before any
// filter; a sixth attach on kernel32!Sleep counts a call the process makes constantly;
// and a {fn: 'liveness'} row every ten seconds carries the counts. A zero Sleep count
// means the Interceptor is not live in this process; hook counts of zero with a live
// Sleep count mean the functions were not called; counts with no rows mean the filter.
//   26104 (0x401c90) BSTEventSource<TESTrapHitEvent>::SendEvent as the Havok
//     listeners (26032, 26033) call it on ScriptEventSourceHolder+0xF78 (CommonLibSSE-NG
//     ScriptEventSourceHolder.h:110): RCX the source, RDX the event {+0x00 trap
//     TESObjectREFR*, +0x08 target TESObjectREFR*, +0x10 state (0 start, 2 hit)};
//   56212 (0xa2f3b0) the Papyrus native ObjectReference.ProcessTrapHit's callback:
//     RCX IVirtualMachine*, EDX stack id, R8 self (the hit TESObjectREFR*), R9 akTrap,
//     [RSP+0x28] afDamage (float32 in the low dword), [RSP+0x30] afPushback,
//     [RSP+0x68] aeMaterial (int32), [RSP+0x70] afStagger;
//   37509 (0x677b70) Actor::DoTrap1(TrapData&): RCX the actor, RDX TrapData
//     (+0x00 the trap's handle, +0x04 damage, +0x10 pushback, +0x18 stagger);
//   38586 (0x6b7bc0) Actor::ProcessHitVictim(HitData&): RCX the actor, RDX HitData
//     (+0x18 aggressor handle, +0x20 sourceRef handle, +0x50 totalDamage;
//     CommonLibSSE-NG include/RE/H/HitData.h);
//   37335 (0x666d20) Actor::DamageActor(victim, damage, attacker, killMove):
//     RCX victim, XMM1 damage, R8 attacker.
// Prints one row per call naming the player or a figure (a form's id at +0x14 and
// type at +0x1a, include/RE/T/TESForm.h:354, :356; ACHR 0x3e, FormTypes.h:202),
// with the thread id and the stack. Expected per swing (the read): one
// processTrapHit (trap 0x54b15, the figure, damage 75 at level one), one doTrap1,
// two processHitVictim (the Papyrus thread, then the main thread's task), then one
// damageActor with no attacker. Rows: {ready, version, hooks} once; {fn, ...} per
// call; {fn, err} once per failing hook. Run on the seat hosting Bleak Falls
// Temple before the guest steps on the plate (x-trap-path). 1.6.1170 only.
const OFFSETS = {
  '1.6.1170.0': {
    trapHitEvent: 0x401c90, // lab/addr.py addrlib 1.6.1170 26104 (the re-analyst's read, 2026-11-01: the event source's SendEvent)
    processTrapHit: 0xa2f3b0, // lab/addr.py addrlib 1.6.1170 56212 (the re-analyst's read, 2026-11-01)
    doTrap1: 0x677b70, // lab/addr.py addrlib 1.6.1170 37509: Actor::DoTrap1 (CommonLibSSE-NG TESObjectREFR.h:284, slot 88)
    processHitVictim: 0x6b7bc0, // lab/addr.py addrlib 1.6.1170 38586
    damageActor: 0x666d20, // lab/addr.py addrlib 1.6.1170 37335: Actor::DamageActor (figure-dent-trace.js)
  },
};
const FORM_ID = 0x14; // include/RE/T/TESForm.h:354
const FORM_TYPE = 0x1a; // include/RE/T/TESForm.h:356
const ACHR = 0x3e; // include/RE/F/FormTypes.h:202
const PLAYER_ID = 0x14;
const FIGURE_MIN = 0xff000000;

function emit(row) { send(row); }

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

// any form's id and kind, or null when p does not read as a form
function formInfo(p) {
  if (!readable(p)) return null;
  try {
    const type = p.add(FORM_TYPE).readU8();
    const id = p.add(FORM_ID).readU32();
    const kind = type !== ACHR ? 'object' : id === PLAYER_ID ? 'player' : id >= FIGURE_MIN ? 'figure' : 'npc';
    return { id: hex(id), type: type, kind: kind };
  } catch (e) {
    return null;
  }
}
const ours = function (f) { return f !== null && (f.kind === 'player' || f.kind === 'figure'); };

function f32(p) { try { return readable(p) ? +p.readFloat().toFixed(4) : null; } catch (e) { return null; } }
function u32(p) { try { return readable(p) ? hex(p.readU32()) : null; } catch (e) { return null; } }

let seq = 0;
const exe = Process.getModuleByName('SkyrimSE.exe');
const version = fileVersion(exe.path);
const at = OFFSETS[version];
if (at === undefined) {
  emit({ error: 'no offsets for this runtime', version: version });
} else {
  let hooks = 0;
  const counts = {};
  const resolved = {};
  const attach = function (name, offset, onEnter) {
    counts[name] = 0;
    try {
      const target = exe.base.add(offset);
      resolved[name] = { at: target.toString(), bytes: readable(target) ? target.readByteArray(8) && Array.from(new Uint8Array(target.readByteArray(8))).map(function (b) { return ('0' + b.toString(16)).slice(-2); }).join(' ') : 'unreadable' };
      Interceptor.attach(target, {
        onEnter: function (args) {
          counts[name]++;
          return onEnter.call(this, args);
        },
      });
      hooks++;
    } catch (e) { fail('attach:' + name, e); }
  };
  // a call the process makes constantly, so a zero count means the Interceptor itself is not live here
  try {
    const sleep = Module.getExportByName('kernel32.dll', 'Sleep');
    counts.sleep = 0;
    Interceptor.attach(sleep, { onEnter: function () { counts.sleep++; } });
    resolved.sleep = { at: sleep.toString() };
  } catch (e) { fail('attach:sleep', e); }
  // the native's entry: the stack slots are the caller's argument area, [RSP+0x28] on
  // the engine's trap hit event, every dispatch (the figure's absence here is the physics' word)
  attach('trapHitEvent', at.trapHitEvent, function (args) {
    try {
      const ev = args[1];
      if (!readable(ev)) return;
      emit({
        fn: 'trapHitEvent', seq: ++seq, tid: Process.getCurrentThreadId(),
        trap: formInfo(ev.readPointer()), target: formInfo(ev.add(0x08).readPointer()),
        state: ev.add(0x10).readU32(), frames: where(this.context),
      });
    } catch (e) { fail('trapHitEvent', e); }
  });
  attach('processTrapHit', at.processTrapHit, function (args) {
    try {
      const target = formInfo(this.context.r8);
      const sp = this.context.rsp;
      emit({
        fn: 'processTrapHit', seq: ++seq, tid: Process.getCurrentThreadId(),
        target: target, trap: formInfo(this.context.r9),
        damage: f32(sp.add(0x28)), pushback: f32(sp.add(0x30)), stagger: f32(sp.add(0x70)),
        material: readable(sp.add(0x68)) ? sp.add(0x68).readS32() : null,
        frames: where(this.context),
      });
    } catch (e) { fail('processTrapHit', e); }
  });
  attach('doTrap1', at.doTrap1, function (args) {
    try {
      const actor = formInfo(args[0]);
      const d = args[1];
      emit({
        fn: 'doTrap1', seq: ++seq, tid: Process.getCurrentThreadId(), actor: actor,
        trapHandle: u32(d), damage: f32(d.add(0x04)), pushback: f32(d.add(0x10)), stagger: f32(d.add(0x18)),
        frames: where(this.context),
      });
    } catch (e) { fail('doTrap1', e); }
  });
  attach('processHitVictim', at.processHitVictim, function (args) {
    try {
      const actor = formInfo(args[0]);
      if (!ours(actor)) return;
      const h = args[1];
      emit({
        fn: 'processHitVictim', seq: ++seq, tid: Process.getCurrentThreadId(), actor: actor,
        aggressorHandle: u32(h.add(0x18)), sourceHandle: u32(h.add(0x20)), totalDamage: f32(h.add(0x50)),
        frames: where(this.context),
      });
    } catch (e) { fail('processHitVictim', e); }
  });
  attach('damageActor', at.damageActor, function (args) {
    try {
      const victim = formInfo(args[0]);
      if (!ours(victim)) return;
      emit({
        fn: 'damageActor', seq: ++seq, tid: Process.getCurrentThreadId(), victim: victim,
        attacker: formInfo(args[2]), frames: where(this.context),
      });
    } catch (e) { fail('damageActor', e); }
  });
  emit({ ready: true, version: version, hooks: hooks, pid: Process.id, base: exe.base.toString(), resolved: resolved });
  setInterval(function () {
    emit({ fn: 'liveness', pid: Process.id, counts: JSON.parse(JSON.stringify(counts)) });
  }, 10000);
}
