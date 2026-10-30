// cloak-hostile.js: does a hostile creature's engine count the player as hostile before any blow? (thuum
// docs/verbs/npc-stream.md slice 6, H-53h, the one hypothesis left on the creature caster; the read runs under
// x-npc-creature-caster's frame as x-cloak-hostile: c1 hosts Riverwood under the server's TGM, a Flame Atronach
// 0x23aa6 placed at c1's player, nobody swings.) Vanilla's cloak abilities gate their contact effect on condition
// function 719 IsHostileToActor with a null parameter (the verb doc's reading of the record), so the engine's own
// notion of hostility decides whom a cloak burns, where the server's table waits for a counted hit (ADR-023).
// Hooks Actor::IsHostileToActor (CommonLibSSE-NG Actor.h:593, Actor.cpp:836: rcx self, rdx the other actor, al the
// answer; Address Library 37537 by `just addr`) and logs self, other, the answer and the caller's RVA for every
// call that involves the player (0x14) or the ACTOR param: the first time each (self, other, caller) triple is seen
// and at every change of its answer, plus a summary of every triple's count every ten seconds. Read against c1's
// log: an answer of 1 for (the atronach, the player) stamped before c1's first bolt hit (the server's first
// "OnSpellHit ... By caster: ff000002", c1's own hit line on this seat) says vanilla burns a stranger it means to
// attack, a limit to declare in the verb doc; 0 until that hit says the server's rule matches the engine's. The
// caller's RVA separates the condition evaluator from the AI's own calls; it is named later in Ghidra, never guessed
// here. Every statement above about 719 and its parameter is a HYPOTHESIS until this trace reads (rule 2).
// Params: ACTOR (a local form id to keep beside the player, default none), ALL (true keeps every call, the event
// stream capped at 2000), BT (true adds an in-module backtrace to the first 16 kept events).
// Offsets by `just addr` (lab/addr.py, Address Library 1.6.1170 only), 2026-10-29.
const PARAMS = (typeof LAB_PARAMS === 'object' && LAB_PARAMS) ? LAB_PARAMS : {};
const ACTOR = PARAMS.ACTOR === undefined ? 0 : Number(PARAMS.ACTOR);
const ALL = PARAMS.ALL === undefined ? false : !!PARAMS.ALL;
const BT = PARAMS.BT === undefined ? false : !!PARAMS.BT;
const PLAYER = 0x14;
const CAP = 2000;
function emit(obj) { obj.t = Date.now(); send(obj); console.log(JSON.stringify(obj)); }

const OFFSETS = {
  '1.6.1170.0': {
    isHostileToActor: 0x679f10, // 37537 Actor::IsHostileToActor
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

const exe = Process.getModuleByName('SkyrimSE.exe');
const version = fileVersion(exe.path);
const off = OFFSETS[version];
if (off === undefined) {
  emit({ error: 'no offsets for this runtime', version: version });
} else {
  const base = exe.base;
  const end = exe.base.add(exe.size);
  // an address inside the exe as its RVA, anything else as it is
  const rva = function (p) {
    try { return (p.compare(base) >= 0 && p.compare(end) < 0) ? '0x' + p.sub(base).toString(16) : String(p); } catch (e) { return String(p); }
  };
  const kept = function (a, b) { return ALL || a === PLAYER || b === PLAYER || (ACTOR !== 0 && (a === ACTOR || b === ACTOR)); };
  const seen = {}; // (self, other, caller) -> its last answer and counts
  let events = 0;
  let backtraces = 0;
  Interceptor.attach(base.add(off.isHostileToActor), {
    onEnter(args) {
      this.self = formId(args[0]);
      this.other = formId(args[1]);
      this.keep = kept(this.self, this.other);
      if (!this.keep) return;
      this.caller = rva(this.returnAddress);
      if (BT && backtraces < 16) { this.bt = Thread.backtrace(this.context, Backtracer.ACCURATE).map(rva); }
    },
    onLeave(retval) {
      if (!this.keep) return;
      const answer = retval.toInt32() & 0xff;
      const key = hex(this.self) + '>' + hex(this.other) + '@' + this.caller;
      let row = seen[key];
      let why = null;
      if (row === undefined) {
        row = seen[key] = { self: this.self, other: this.other, caller: this.caller, answer: answer, count: 0, flips: 0 };
        why = 'first';
      } else if (row.answer !== answer) {
        row.answer = answer;
        row.flips += 1;
        why = 'flip';
      }
      row.count += 1;
      if (why !== null && events < CAP) {
        events += 1;
        const ev = { fn: 'IsHostileToActor', id: 37537, tid: this.threadId, why: why, self: hex(this.self), other: hex(this.other), answer: answer, caller: this.caller, n: row.count };
        if (this.bt !== undefined) { ev.bt = this.bt; backtraces += 1; }
        emit(ev);
      }
    },
  });
  setInterval(function () {
    const rows = Object.keys(seen).map(function (k) {
      const r = seen[k];
      return { self: hex(r.self), other: hex(r.other), caller: r.caller, answer: r.answer, count: r.count, flips: r.flips };
    });
    emit({ event: 'summary', triples: rows.length, events: events, rows: rows.slice(0, 64) });
  }, 10000);
  emit({ event: 'ready', version: version, player: hex(PLAYER), actor: ACTOR ? hex(ACTOR) : 'none', all: ALL, bt: BT, hooks: Object.keys(off).length });
}
