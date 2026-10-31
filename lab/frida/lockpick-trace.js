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
// v2 (11:49 PDT 2026-10-31, after x-lockpick v6 183903: the offsets read sane (sweet 42.6 at Lockpicking 100 on a Novice lock,
// partial 50.05, break 3 s) and the pick and lock angles sat at 0 through 27 lab attempts, so the injected input never reaches
// the minigame). Added: hooks on the menu's own input handlers, MenuEventHandler slots 01 CanProcess, 04 ProcessMouseMove and
// 05 ProcessButton (include/RE/M/MenuEventHandler.h:21-25) read from VTABLE_LockpickingMenu[1] (Address Library 215606 on AE,
// Offsets_VTABLE.h:4060; `this` there is the handler subobject at menu+0x30, LockpickingMenu.h:96), each row naming the event's
// device (InputEvent.h:53, 0 keyboard 1 mouse 2 gamepad), type (:54, 0 button 1 mouse move 3 thumbstick), user event string and
// id code (IDEvent.h:22-23, the BSFixedString's pointer is the characters), a button's value and held seconds (ButtonEvent.h:27-28)
// or a move's x and y (MouseMoveEvent.h:15-16), and the handler's answer: so a run shows whether the lab's input reaches the menu's
// handler at all (no rows while the lab moves and holds: dropped upstream), or reaches it and is ignored (rows with the wrong user
// event or device). And a second lever, TURN: TURN_START_MS after the menu's first frame (default 8000, so the lab's inputs are read
// first), the script writes the lock's angle as a ramp of TURN_DEG a frame (default 1.0, sign TURN_SIGN, default 1, to 100) with the
// pick snapped to the sweet spot: HYPOTHESIS that the menu's update opens the lock when lockAngle reaches its full turn whatever
// drove it there (falsified by the ramp rows showing the engine's angle back at 0 each frame or by no unlock at 100).
// Params through LAB_PARAMS: SNAP (default false), TURN (default false), TURN_DEG, TURN_SIGN, TURN_START_MS, EVERY_MS (default
// 1000). Offsets for 1.6.1170 only.
'use strict';
function emit(obj) { obj.t = Date.now(); send(obj); console.log(JSON.stringify(obj)); }

const PARAMS = (typeof LAB_PARAMS === 'object' && LAB_PARAMS) ? LAB_PARAMS
  : ((typeof params === 'object' && params) ? params : {});
const SNAP = !!PARAMS.SNAP;
const TURN = !!PARAMS.TURN;
const TURN_DEG = PARAMS.TURN_DEG ? Number(PARAMS.TURN_DEG) : 1.0;
const TURN_SIGN = PARAMS.TURN_SIGN ? Number(PARAMS.TURN_SIGN) : 1;
const TURN_START_MS = PARAMS.TURN_START_MS !== undefined ? (PARAMS.TURN_START_MS >>> 0) : 8000;
const EVERY_MS = PARAMS.EVERY_MS ? (PARAMS.EVERY_MS >>> 0) : 1000;

const OFFSETS = {
  '1.6.1170.0': {
    vtable: 0x18faf20, // just addr 215604 (VTABLE_LockpickingMenu[0], IMenu's table)
    runtime: 0x48, // LockpickingMenu.h:116 RelocateMember(this, 0x48, 0x58): SE and AE
    handlerVtable: 0x18faf70, // just addr 215606 (VTABLE_LockpickingMenu[1], MenuEventHandler's table)
    handlerInMenu: 0x30, // LockpickingMenu.h:96 RelocateMember(this, 0x30, 0x40): SE and AE
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
const HANDLER_SLOTS = { canProcess: 1, processMouseMove: 4, processButton: 5 }; // MenuEventHandler.h:21-25
// InputEvent.h:53-54, IDEvent.h:22-23, ButtonEvent.h:27-28, MouseMoveEvent.h:15-16
const EV = { device: 0x08, type: 0x0c, userEvent: 0x18, idCode: 0x20, value: 0x28, heldSecs: 0x2c, mouseX: 0x28, mouseY: 0x2c };

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
  let last = null, lastRow = 0, frames = 0, snapped = 0, firstFrameAt = 0, turnAngle = 0;
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
      if (firstFrameAt === 0) firstFrameAt = Date.now();
      if (TURN && Date.now() - firstFrameAt >= TURN_START_MS && v.cleared === 0 && turnAngle < 100) {
        turnAngle = Math.min(100, turnAngle + TURN_DEG);
        self.add(o.runtime).add(F.lockAngle).writeFloat(TURN_SIGN * turnAngle);
        if (turnAngle === TURN_DEG || Math.floor(turnAngle) % 10 === 0) {
          emit({ kind: 'turn', written: TURN_SIGN * turnAngle, engineLock: v.lock, pick: v.pick, sweet: v.sweet, frame: frames });
        }
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
  // the menu's own input handlers: what reaches them while the lab moves the mouse and holds a key
  const handlerVtable = exe.base.add(o.handlerVtable);
  function eventFacts(ev) {
    const out = { device: -1, type: -1 };
    try { out.device = ev.add(EV.device).readU32(); out.type = ev.add(EV.type).readU32(); } catch (e) { return out; }
    try { const sp = ev.add(EV.userEvent).readPointer(); out.userEvent = sp.isNull() ? '' : sp.readUtf8String(); } catch (e) { out.userEvent = '?'; }
    try { out.idCode = ev.add(EV.idCode).readU32(); } catch (e) { /* no id */ }
    if (out.type === 0) { try { out.value = ev.add(EV.value).readFloat(); out.heldSecs = ev.add(EV.heldSecs).readFloat(); } catch (e) { /* no body */ } }
    if (out.type === 1) { try { out.x = ev.add(EV.mouseX).readS32(); out.y = ev.add(EV.mouseY).readS32(); } catch (e) { /* no body */ } }
    return out;
  }
  Object.keys(HANDLER_SLOTS).forEach(function (name) {
    const fn = handlerVtable.add(HANDLER_SLOTS[name] * Process.pointerSize).readPointer();
    Interceptor.attach(fn, {
      onEnter(args) { this.ev = eventFacts(args[1]); },
      onLeave(retval) {
        const row = { kind: 'handler', handler: name, answer: retval.toInt32() & 0xff, tid: this.threadId };
        Object.assign(row, this.ev);
        emit(row);
      },
    });
    emit({ hooked: name, at: inExe(fn) });
  });
  emit({ ready: true, version: version, vtable: '0x' + o.vtable.toString(16), processMessage: inExe(processMessage), advanceMovie: inExe(advanceMovie), snap: SNAP, turn: TURN, turnDeg: TURN_DEG, turnSign: TURN_SIGN, turnStartMs: TURN_START_MS, everyMs: EVERY_MS });
}
