// action-trace.js: the engine's action path, call by call (thuum
// docs/verbs/cast-action.md): every ActorMediator::PerformAction (the one
// entry every BGSAction goes through, the four phases of a cast included)
// with its TESActionData on entry and on exit, every call of the mediator's
// second entry (the one that performs a data as given, Skyrim Platform's
// performAction), and every cast-shaped graph event an actor's holder is
// sent (IAnimationGraphManagerHolder::NotifyAnimationGraph), tagged with
// whether a PerformAction is open on that thread. The re-analyst's static
// read of 2026-10-14 says (HYPOTHESIS, this trace is its test): the data
// comes into PerformAction with its event empty and leaves with the chosen
// idle's event, the input type is 2 on every engine-originated action, the
// caster's actions index 45..52 (left, right), 60..63 (voice), and no
// cast-phase event reaches the graph without a PerformAction around it. On
// the observer, performAction's replays hit the second entry once each and
// the figure's graph takes the event or not. Run: a scenario's frida step
// on c1 (the caster) or c2 (the observer); 1.6.1170 only.
//
// Ids are Address Library 1.6.1170's by lab/addr.py: 38949 PerformAction,
// 38953 the second entry, 32901 NotifyAnimationGraph. Layouts are
// CommonLibSSE-NG's: TESActionData (include/RE/T/TESActionData.h,
// A/ActionInput.h, A/ActionOutput.h) source +0x08, action +0x18, unk20
// +0x20, animEvent +0x28 (a BSFixedString: a pointer to the characters),
// result +0x38, animObjIdle +0x48, flags +0x58; a form's id at +0x14
// (T/TESForm.h), a BGSAction's index at +0x28 (B/BGSAction.h); an actor's
// IAnimationGraphManagerHolder base at TESObjectREFR+0x38
// (T/TESObjectREFR.h:112), so the holder's actor is holder-0x38 when the
// holder is an actor's (the base function serves other holders too; the
// read is kept to the player and the figures, ids 0x14 and 0xFF......, unless
// the params widen it).
//
// Params (lab-api prepends globalThis.LAB_PARAMS for a step's params; thuum
// docs/verbs/npc-stream.md, ADR-050): SOURCES 'figures' (default, the read
// above), 'all' (every actor the entry is called for: the inventory of what
// the world's NPCs perform through it, their event names and whether their
// graph events come inside a PerformAction, the in-flight mark's coverage),
// or a list of form ids; EVENTS 'cast' (the cast-shaped names, the default
// for 'figures') or 'all' (every name, the default otherwise).
'use strict';
const PARAMS = (typeof LAB_PARAMS === 'object' && LAB_PARAMS) ? LAB_PARAMS : {};
const SOURCES = PARAMS.SOURCES === undefined ? 'figures' : PARAMS.SOURCES;
const EVENTS = PARAMS.EVENTS === undefined ? (SOURCES === 'figures' ? 'cast' : 'all') : PARAMS.EVENTS;
function sourceAdmitted(id) {
  if (SOURCES === 'all') return id > 0;
  if (Array.isArray(SOURCES)) return SOURCES.indexOf(id) >= 0;
  return id === 0x14 || (id >>> 24) === 0xff;
}
function emit(obj) { obj.t = Date.now(); send(obj); console.log(JSON.stringify(obj)); }

const OFFSETS = {
  '1.6.1170.0': { perform: 0x6cd0d0, chosen: 0x6cd4a0, notify: 0x54c450 }, // lab/addr.py addrlib 1.6.1170 38949, 38953, 32901
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
const fixedString = function (p) { try { return p.isNull() ? '' : p.readUtf8String(); } catch (e) { return '?'; } };
const hex = function (n) { return n < 0 ? String(n) : '0x' + n.toString(16); };

// the TESActionData's fields, as a record
function dataFields(d) {
  try {
    const action = d.add(0x18).readPointer();
    const sourceId = formId(d.add(0x08).readPointer());
    return {
      source: hex(sourceId),
      sourceId: sourceId,
      action: hex(formId(action)),
      index: action.isNull() ? -1 : action.add(0x28).readU32(),
      type: d.add(0x20).readU32(),
      event: fixedString(d.add(0x28).readPointer()),
      result: d.add(0x38).readS32(),
      idle: hex(formId(d.add(0x48).readPointer())),
      flags: d.add(0x58).readU32(),
    };
  } catch (e) { return { error: String(e) }; }
}

const exe = Process.getModuleByName('SkyrimSE.exe');
const version = fileVersion(exe.path);
const off = OFFSETS[version];
if (off === undefined) {
  emit({ error: 'no offsets for this runtime', version: version });
} else {
  const open = {}; // thread id -> PerformAction calls open on it
  const CAST_EVENT = /^(MRh_|MLh_|DualMagic|shout|Voice|Cast)/i;

  Interceptor.attach(exe.base.add(off.perform), {
    onEnter(args) {
      this.data = args[1];
      this.entry = dataFields(args[1]);
      open[this.threadId] = (open[this.threadId] || 0) + 1;
    },
    onLeave(retval) {
      open[this.threadId] = (open[this.threadId] || 1) - 1;
      const exit = dataFields(this.data);
      // the player's and the figures' by default; the rest is the world's
      // NPCs, admitted by SOURCES
      const src = this.entry.source || '';
      if (!sourceAdmitted(this.entry.sourceId === undefined ? -1 : this.entry.sourceId)) return;
      emit({ perform: true, tid: this.threadId, source: src, actionIn: this.entry.action, index: this.entry.index, typeIn: this.entry.type, eventIn: this.entry.event, flagsIn: this.entry.flags, eventOut: exit.event, idleOut: exit.idle, resultOut: exit.result, flagsOut: exit.flags, ret: retval.toInt32() & 0xff });
    },
  });

  Interceptor.attach(exe.base.add(off.chosen), {
    onEnter(args) { this.data = args[1]; this.entry = dataFields(args[1]); },
    onLeave(retval) {
      const exit = dataFields(this.data);
      emit({ chosen: true, tid: this.threadId, source: this.entry.source, action: this.entry.action, index: this.entry.index, type: this.entry.type, eventIn: this.entry.event, idle: this.entry.idle, flagsIn: this.entry.flags, resultOut: exit.result, flagsOut: exit.flags, ret: retval.toInt32() & 0xff });
    },
  });

  Interceptor.attach(exe.base.add(off.notify), {
    onEnter(args) {
      this.skip = true;
      try {
        const name = fixedString(args[1].readPointer());
        if (EVENTS === 'cast' && !CAST_EVENT.test(name)) return;
        // the base function serves holders that are not actors (a weapon's,
        // a furniture's); their id read is garbage and filtered by value
        const id = formId(args[0].sub(0x38));
        if (!sourceAdmitted(id)) return;
        this.skip = false;
        this.name = name;
        this.actor = hex(id);
        this.inPerform = open[this.threadId] || 0;
      } catch (e) { this.skip = true; }
    },
    onLeave(retval) {
      if (this.skip) return;
      emit({ notify: true, tid: this.threadId, actor: this.actor, event: this.name, inPerform: this.inPerform, ret: retval.toInt32() & 0xff });
    },
  });

  emit({ ready: true, version: version, sources: SOURCES, events: EVENTS, perform: '0x' + off.perform.toString(16), chosen: '0x' + off.chosen.toString(16), notify: '0x' + off.notify.toString(16) });
}
