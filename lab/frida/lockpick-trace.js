// lockpick-trace.js (thuum-magnus, 2026-10-31): the Lockpicking Menu's numbers while the lab drives it (docs/verbs/locks.md,
// Dynamic plan). x-lockpick v4 (20261031-175103) swept fourteen pick angles with A held and opened nothing, with nothing logged:
// the client reports a lock only at the menu's close, so the run could not tell an input that never reaches the minigame from
// angles that missed the engine's random sweet spot. This trace hooks the menu's own per-frame update and reads its runtime data,
// so a run shows, frame by frame: the pick's angle (does the lab's mouse turn it, by how much per count), the lock's angle (does
// the held A turn it), the sweet spot the engine rolled, the partial-pick angle, the pick's break timer and the broken count.
// With params {SNAP: true} it also writes the pick's angle to the sweet spot every frame (the lab's lever, as a teleport is for a
// position): the next hold of A then opens the lock by the engine's own minigame, whatever the mouse did. HYPOTHESIS until a run:
// the angles are degrees (the sweet spot GMSTs are); the write before the engine's update is the value the turn checks.
//
// Addresses (CLAUDE.md rule 1: never from memory): VTABLE_LockpickingMenu[0] is Address Library 215604 on AE (CommonLibSSE-NG
// include/RE/Offsets_VTABLE.h:4060, REL::VariantID(269215, 215604, ...)), resolved by `just addr 215604` for 1.6.1170; IMenu's
// slots are 04 ProcessMessage(UIMessage&) and 05 AdvanceMovie(float, uint32) (include/RE/I/IMenu.h:70-71), read from that table
// at attach. RUNTIME_DATA sits at this+0x48 on SE and AE (LockpickingMenu.h:116, RelocateMember(this, 0x48, 0x58); 0x58 on VR):
// HYPOTHESIS until the first row reads a sweet spot within [-90, 90]. Its fields (LockpickingMenu.h:34-80): pickAngle 0x94,
// lockAngle 0x98, damagePickAngle 0x9C, pickBreakSeconds 0xA0, sweetSpotAngle 0xB4, partialPickAngle 0xB8, numBrokenPicks 0xBC,
// animating 0xC1, menuCleared 0xC3, animationFinished 0xC4. UIMessage.type is the uint32 at +0x08 (UIMessage.h:31).
// Rows: {kind: frame} when the pick or lock angle moves by more than half a degree, the broken count or the sweet spot changes,
// the menu clears, or every EVERY_MS (default 1000) while the menu runs; {kind: message, type} at every ProcessMessage; {ready}
// at attach. Expected if the lab's inputs drive the minigame: pick rows following each mouse step (the ratio in degrees per
// count), lock rows rising while A is held and falling at its release, the break timer counting at a wrong angle. Falsified by:
// no frame row after the menu opens (the vtable or slot is wrong), a sweet spot outside [-90, 90] (the runtime offset), a pick
// angle flat through the mouse steps (the mouse never reaches the menu), a lock angle flat through the hold (the key does not).
// Params through LAB_PARAMS: SNAP (default false), EVERY_MS (default 1000). Offsets for 1.6.1170 only.
'use strict';
function emit(obj) { obj.t = Date.now(); send(obj); console.log(JSON.stringify(obj)); }

const PARAMS = (typeof LAB_PARAMS === 'object' && LAB_PARAMS) ? LAB_PARAMS
  : ((typeof params === 'object' && params) ? params : {});
const SNAP = !!PARAMS.SNAP;
const EVERY_MS = PARAMS.EVERY_MS ? (PARAMS.EVERY_MS >>> 0) : 1000;

const OFFSETS = {
  '1.6.1170.0': {
    vtable: 0x18faf20, // just addr 215604 (VTABLE_LockpickingMenu[0], IMenu's table)
    runtime: 0x48, // LockpickingMenu.h:116 RelocateMember(this, 0x48, 0x58): SE and AE
  },
};
// RUNTIME_DATA fields, LockpickingMenu.h:34-80
const F = {
  pickAngle: 0x94, lockAngle: 0x98, damagePickAngle: 0x9c, pickBreakSeconds: 0xa0,
  sweetSpotAngle: 0xb4, partialPickAngle: 0xb8, numBrokenPicks: 0xbc,
  animating: 0xc1, menuCleared: 0xc3, animationFinished: 0xc4,
};
const SLOT_PROCESS_MESSAGE = 4; // IMenu.h:70
const SLOT_ADVANCE_MOVIE = 5; // IMenu.h:71

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

const exe = Process.getModuleByName('SkyrimSE.exe');
const version = fileVersion(exe.path);
const o = OFFSETS[version];
if (o === undefined) {
  emit({ error: 'no offsets for this runtime', version: version });
} else {
  const vtable = exe.base.add(o.vtable);
  const processMessage = vtable.add(SLOT_PROCESS_MESSAGE * Process.pointerSize).readPointer();
  const advanceMovie = vtable.add(SLOT_ADVANCE_MOVIE * Process.pointerSize).readPointer();
  function inExe(p) { const m = Process.findModuleByAddress(p); return m ? m.name + '+0x' + p.sub(m.base).toString(16) : p.toString(); }
  function read(self) {
    const r = self.add(o.runtime);
    return {
      pick: r.add(F.pickAngle).readFloat(), lock: r.add(F.lockAngle).readFloat(),
      damage: r.add(F.damagePickAngle).readFloat(), breakS: r.add(F.pickBreakSeconds).readFloat(),
      sweet: r.add(F.sweetSpotAngle).readFloat(), partial: r.add(F.partialPickAngle).readFloat(),
      broken: r.add(F.numBrokenPicks).readU32(), animating: r.add(F.animating).readU8(),
      cleared: r.add(F.menuCleared).readU8(), finished: r.add(F.animationFinished).readU8(),
    };
  }
  let last = null, lastRow = 0, frames = 0, snapped = 0;
  Interceptor.attach(advanceMovie, {
    onEnter(args) {
      const self = args[0];
      frames += 1;
      let v;
      try { v = read(self); } catch (e) { if (frames % 300 === 1) emit({ error: 'read failed', what: String(e) }); return; }
      if (SNAP && isFinite(v.sweet) && Math.abs(v.sweet) <= 90 && Math.abs(v.pick - v.sweet) > 0.01) {
        self.add(o.runtime).add(F.pickAngle).writeFloat(v.sweet);
        snapped += 1;
        v.snapped = true;
      }
      const now = Date.now();
      const changed = !last || Math.abs(v.pick - last.pick) > 0.5 || Math.abs(v.lock - last.lock) > 0.5 ||
        v.broken !== last.broken || v.sweet !== last.sweet || v.cleared !== last.cleared;
      if (changed || now - lastRow >= EVERY_MS) {
        v.kind = 'frame'; v.frame = frames; v.snaps = snapped; v.tid = this.threadId;
        emit(v); lastRow = now; last = v;
      }
    },
  });
  Interceptor.attach(processMessage, {
    onEnter(args) {
      let type = -1;
      try { type = args[1].add(8).readU32(); } catch (e) { /* a message without a body */ }
      let v = null;
      try { v = read(args[0]); } catch (e) { /* the menu's data not readable: say so by the nulls */ }
      emit({ kind: 'message', type: type, pick: v && v.pick, lock: v && v.lock, sweet: v && v.sweet, broken: v && v.broken, tid: this.threadId });
    },
  });
  emit({ ready: true, version: version, vtable: '0x' + o.vtable.toString(16), processMessage: inExe(processMessage), advanceMovie: inExe(advanceMovie), snap: SNAP, everyMs: EVERY_MS });
}
