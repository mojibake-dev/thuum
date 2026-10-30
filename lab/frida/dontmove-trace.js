// dontmove-trace.js (thuum-magnus, 2026-10-30): the hold finding's read (docs/verbs/npc-talk.md, Dynamic plan,
// "The hold on 3o-win"). b-npc-talk v7 went red at 24 s twice on 3o-win: Sven, 0x13491, keeps walking under the lab's
// npc-hold, Skyrim Platform's Actor.setDontMove(true), on the seat that hosts his cell, where the same step stopped
// him at his leg's end on earlier builds. The engine's path, from the re-analyst's Ghidra read of 2026-10-30 (every
// id resolved by `just addr` for 1.6.1170): the Papyrus native SetDontMove is callback 54761 (rcx VM*, rdx stack id,
// r8 Actor*, r9b bool), which calls Actor_SetDontMove 37489 (rcx Actor*, dl bool); true writes lifeState 9 through
// Actor::SetLifeState 37612 (rcx Actor*, edx value) and calls StopMoving 37817 then 37818; false writes 0 if it still
// reads 9. The field is ActorState::actorState1.lifeState, four bits at bit 21 (CommonLibSSE-NG
// include/RE/A/ActorState.h:114 and :203) of the dword at Actor+0xC8 (ActorState at Actor+0xC0 on 1.6.629 and later,
// Actor.h AsActorState; actorState1 at +0x08). The consumer is Actor::Move 37507 (vtable slot 0xC8, Actor.h:398),
// called at the movement step 37356's tail once per step: with lifeState 9 (or an immobile race) it drives the
// character controller through 78276 (a zero velocity) instead of 78275. Resurrect 37321 writes 0 over any lifeState,
// unconditionally, and 40491 reaches it too. So, for one actor (ACTOR, default 0x13491; every hook filters on the
// form id at +0x14), this trace logs:
//   hold:       54761 and 37489 entries (the bool, a stamp): the call reached the engine, and when;
//   lifeState:  37612 entries (the new value, the old bits of +0xC8, the caller's RVA): every transition, so a write
//               of 0 while held names the clearer (37489 at the release is the expected one; 37321 or 40491 is a
//               resurrect; anything else is new);
//   resurrect:  37321 and 40491 entries (the caller's RVA), the writers that clear a hold without reading it;
//   move:       37507 entries per step (the lifeState bits, the position at +0x54, the form flags at +0x10 whose bit 4
//               picks the SetPosition tail of 37356 that never consults lifeState) and which controller branch the
//               step takes (78276 zero velocity, 78275 normal), caught on the same thread while the actor's Move runs;
//   stops:      37817 and 37818 entries (stamps); 37356 entries whose rcx is the actor (a count).
// Rows: a flip row the instant lifeState changes; a row every second (Move calls, the two branches' counts, the
// lifeState, the form flags, the position and the units moved in that second, the step count, held or not); the
// hold, stop and resurrect rows as they happen. Expected if the hold works: one 37612 write of 9 within a frame of
// 54761, every Move after it on 78276 and a flat position from the next second, one write of 0 from 37489 at the
// release. Falsified by: Move not called per step for the actor (another mover, or another seat, moves him); the
// position changing while 78276 is the branch (the zero velocity does not stop the controller); a write of 0 from a
// caller other than 37489 during the hold (the clearer); +0xC8 not reading 9 after 54761 returned (the field).
// v2 (2026-10-30, after x-npc-hold v4's read 124551): the hold held every frame yet the actor's position jumped eight times by
// 100.77 units along his path at 4 s intervals to his leg's end. So the trace also hooks TESObjectREFR::MoveTo_Impl (56626: rcx the
// reference, r8/r9 the cell and worldspace, the stack's fifth argument the NiPoint3* position), the engine's one entry for SetPosition
// and MoveTo, and for the watched actor logs the new position, the caller's RVA and a six-frame backtrace (RVAs inside SkyrimSE.exe,
// module plus offset elsewhere): a row per warp names the warper; no row during a warp says the writer bypasses MoveTo (the next read
// is then a watchpoint on +0x54). Params through LAB_PARAMS: ACTOR (a form id, default 0x13491). Offsets for 1.6.1170 only.
function emit(obj) { obj.t = Date.now(); send(obj); console.log(JSON.stringify(obj)); }

const PARAMS = (typeof LAB_PARAMS === 'object' && LAB_PARAMS) ? LAB_PARAMS
  : ((typeof params === 'object' && params) ? params : {});
const ACTOR = PARAMS.ACTOR ? (PARAMS.ACTOR >>> 0) : 0x13491;

// offsets by `just addr <id>` for 1.6.1170 (never from memory, CLAUDE.md rule 1)
const OFFSETS = {
  '1.6.1170.0': {
    papyrusSetDontMove: 0x9ea930, // addrlib: 54761
    setDontMove: 0x6750d0, // addrlib: 37489
    setLifeState: 0x680740, // addrlib: 37612
    stopMoving: 0x6934e0, // addrlib: 37817
    clearMoverGoal: 0x693680, // addrlib: 37818
    move: 0x6768a0, // addrlib: 37507
    controllerZero: 0xea00b0, // addrlib: 78276
    controllerNormal: 0xe9f170, // addrlib: 78275
    movementStep: 0x6698d0, // addrlib: 37356
    resurrect: 0x665ad0, // addrlib: 37321
    resurrectRebuild: 0x736eb0, // addrlib: 40491
    moveTo: 0xa447f0, // addrlib: 56626 (CommonLibSSE-NG Offsets.h:545 TESObjectREFR::MoveTo, the AE id of RELOCATION_ID(56227, 56626); SetPosition and MoveTo land here, TESObjectREFR.cpp:920)
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

// helper names avoid Frida's globals (ptr, hexdump, int64, uint64, NULL)
function hex(n) { return '0x' + (n >>> 0).toString(16); }
function u32(p) { try { return p.isNull() ? 0 : p.readU32(); } catch (e) { return -1; } }
function f32(p) { try { return p.isNull() ? NaN : p.readFloat(); } catch (e) { return NaN; } }
function formId(form) { try { return form.isNull() ? 0 : u32(form.add(0x14)); } catch (e) { return 0; } }
function lifeStateOf(actor) { const w = u32(actor.add(0xc8)); return w < 0 ? -1 : ((w >>> 21) & 0xf); }
function formFlagsOf(actor) { return u32(actor.add(0x10)); }
function posOf(actor) { return [f32(actor.add(0x54)), f32(actor.add(0x58)), f32(actor.add(0x5c))]; }
function dist(a, b) {
  if (!a || !b) return NaN;
  const dx = a[0] - b[0], dy = a[1] - b[1], dz = a[2] - b[2];
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

const exe = Process.getModuleByName('SkyrimSE.exe');
const version = fileVersion(exe.path);
const at = OFFSETS[version];
function rva(p) { return '0x' + p.sub(exe.base).toString(16); }

if (at === undefined) {
  emit({ error: 'no offsets for this runtime', version: version });
} else {
  emit({ ready: true, version: version, actor: hex(ACTOR) });
  const watched = function (actor) { return formId(actor) === ACTOR; };
  let held = false;
  let lastLifeState = -1;

  // the second's row
  let sec = null;
  function second() {
    if (sec === null) sec = { move: 0, zero: 0, normal: 0, step: 0, first: null, last: null, lifeState: -1, formFlags: 0 };
    return sec;
  }
  setInterval(function () {
    if (sec === null) return;
    const s = sec; sec = null;
    emit({
      second: true, held: held, move: s.move, zeroVelocity: s.zero, normalVelocity: s.normal, step: s.step,
      lifeState: s.lifeState, formFlags: hex(s.formFlags), pos: s.last, moved: dist(s.first, s.last),
    });
  }, 1000);

  // hold: the Papyrus native and the engine's call
  Interceptor.attach(exe.base.add(at.papyrusSetDontMove), {
    onEnter(args) {
      const actor = args[2];
      if (!watched(actor)) return;
      const on = (args[3].toInt32() & 0xff) !== 0;
      held = on;
      emit({ hold: 'papyrus', on: on, lifeState: lifeStateOf(actor), pos: posOf(actor) });
    },
  });
  Interceptor.attach(exe.base.add(at.setDontMove), {
    onEnter(args) {
      const actor = args[0];
      if (!watched(actor)) return;
      emit({ hold: 'engine', on: (args[1].toInt32() & 0xff) !== 0, lifeState: lifeStateOf(actor), caller: rva(this.returnAddress) });
    },
  });

  // lifeState: every write, with its caller
  Interceptor.attach(exe.base.add(at.setLifeState), {
    onEnter(args) {
      const actor = args[0];
      if (!watched(actor)) return;
      const next = args[1].toInt32() & 0xf;
      const old = lifeStateOf(actor);
      emit({ lifeState: 'write', from: old, to: next, held: held, caller: rva(this.returnAddress), pos: posOf(actor) });
    },
  });

  // resurrect: the writers that clear a hold without reading it
  Interceptor.attach(exe.base.add(at.resurrect), {
    onEnter(args) {
      const actor = args[0];
      if (!watched(actor)) return;
      emit({ resurrect: 'Resurrect', lifeState: lifeStateOf(actor), held: held, caller: rva(this.returnAddress) });
    },
  });
  Interceptor.attach(exe.base.add(at.resurrectRebuild), {
    onEnter(args) {
      const actor = args[0]; // HYPOTHESIS: rcx the Actor*, as for Resurrect
      if (!watched(actor)) return;
      emit({ resurrect: 'rebuild', lifeState: lifeStateOf(actor), held: held, caller: rva(this.returnAddress) });
    },
  });

  // stops
  Interceptor.attach(exe.base.add(at.stopMoving), {
    onEnter(args) { if (watched(args[0])) emit({ stop: 'StopMoving', caller: rva(this.returnAddress) }); },
  });
  Interceptor.attach(exe.base.add(at.clearMoverGoal), {
    onEnter(args) { if (watched(args[0])) emit({ stop: 'clearMoverGoal', caller: rva(this.returnAddress) }); },
  });

  // move: per step, with the controller branch caught on the same thread
  const moveThreads = {};
  Interceptor.attach(exe.base.add(at.move), {
    onEnter(args) {
      const actor = args[0];
      if (!watched(actor)) return;
      this.watched = true;
      moveThreads[this.threadId] = true;
      const s = second();
      s.move += 1;
      s.lifeState = lifeStateOf(actor);
      s.formFlags = formFlagsOf(actor);
      const p = posOf(actor);
      if (s.first === null) s.first = p;
      s.last = p;
      if (s.lifeState !== lastLifeState) {
        emit({ flip: true, from: lastLifeState, to: s.lifeState, held: held, pos: p });
        lastLifeState = s.lifeState;
      }
    },
    onLeave() { if (this.watched) delete moveThreads[this.threadId]; },
  });
  Interceptor.attach(exe.base.add(at.controllerZero), {
    onEnter() { if (moveThreads[this.threadId]) second().zero += 1; },
  });
  Interceptor.attach(exe.base.add(at.controllerNormal), {
    onEnter() { if (moveThreads[this.threadId]) second().normal += 1; },
  });
  Interceptor.attach(exe.base.add(at.movementStep), {
    onEnter(args) { if (watched(args[0])) second().step += 1; },
  });

  // v2: every MoveTo of the actor, with the caller and a short backtrace (the warps' writer, if they pass through here)
  function where(p) {
    const m = Process.findModuleByAddress(p);
    if (m === null) return p.toString();
    if (m.name === 'SkyrimSE.exe') return rva(p);
    return m.name + '+0x' + p.sub(m.base).toString(16);
  }
  Interceptor.attach(exe.base.add(at.moveTo), {
    onEnter(args) {
      const refr = args[0];
      if (!watched(refr)) return;
      const posPtr = args[4];
      const to = posPtr.isNull() ? null : [f32(posPtr), f32(posPtr.add(4)), f32(posPtr.add(8))];
      let bt = [];
      try { bt = Thread.backtrace(this.context, Backtracer.ACCURATE).slice(0, 6).map(where); } catch (e) { bt = ['backtrace failed: ' + e]; }
      emit({ moveTo: true, from: posOf(refr), to: to, held: held, lifeState: lifeStateOf(refr), caller: rva(this.returnAddress), bt: bt });
    },
  });
}
