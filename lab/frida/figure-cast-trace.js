// figure-cast-trace.js: what the engine does for a figure's cast in the
// observer's game (thuum docs/verbs/cast-action.md: the figure replays the
// caster's actions through the mediator's second entry one update after its
// variables, and the relayed spell is cast through castSpellImmediate; the
// open rows are the interrupted casts and the figure that spawns mid-cast).
// Every hook filters to the figures: dynamic forms (id at or above
// 0xFF000000; the player's 0x14 is below it) whose form type is ACHR. The
// stations, each emit carrying fn and the figure's id as actor:
// - the graph's entry, IAnimationGraphManagerHolder::NotifyAnimationGraph
//   (32901): each event the figure's holder is sent and whether the graph
//   took it, at the leave (fn notify: event, taken);
// - the action entry, ActorMediator::PerformAction (38949), and the entry
//   that performs a data as given (38953, Skyrim Platform's performAction),
//   both at the leave, where the event is chosen (fn performAction,
//   performChosen: action, event, idle, ret); PerformAction's dry runs
//   (flags bit 0 on entry: the figure's AI probing an idle every 16 ms, the
//   verb doc) are skipped;
// - the figure's own ActorMagicCaster, at the entry: FinishCast (34435),
//   InterruptCast (34408, with its refund flag), StartCharge (34443),
//   CastSpell (34401, with the spell), RequestCastImpl (34136) and
//   CastSpellImmediate (with the spell), each with the caster's hand
//   (castingSource: 0 left, 1 right, 2 other, 3 instant);
// - the graph's begin-cast response handlers, RightHandSpellCastHandler
//   (42820) and LeftHandSpellCastHandler (42819): fn beginCastRight,
//   beginCastLeft, with a backtrace.
// Run: `just frida figure-cast-trace.js c2` while the observer's game runs,
// or a scenario's frida step on the observer (after that client's console
// steps, lab/frida/README.md). 1.6.1170 only.
//
// Ids. CommonLibSSE-NG wraps FinishCast and InterruptCast(bool a_refund)
// with RELOCATION_ID (src/RE/M/MagicCaster.cpp:26 and :40; the AE ids 34435
// and 34408). NotifyAnimationGraph is a virtual there
// (include/RE/I/IAnimationGraphManagerHolder.h:25, slot 01, (const
// BSFixedString&) -> bool) with no RELOCATION_ID, so 32901 is the verb
// doc's: the re-analyst's base implementation ("the base 24 vtables
// share"; the Actor's own entry 38048, where Skyrim Platform's
// sendAnimationEvent hook sits, is not hooked), confirmed live by
// action-trace.js 20261015-055622. 38949 ((ActorMediator*, TESActionData*)
// -> bool, the event empty on entry and chosen at the leave), 38953 (the
// same data argument), 34443, 34401, 34136, 42820 and 42819 are the verb
// docs' (docs/verbs/cast-action.md, the engine surface; spell-cast.md, the
// 2026-10-14 read), resolved with lab/addr.py from addrlib/ on 2026-10-15.
// CastSpell's spell as its first argument is this script's expectation, not
// a documented signature (HYPOTHESIS): the emit carries the form type byte
// beside the id, so a wrong read shows (a SPEL reads 0x16,
// include/RE/F/FormTypes.h:162). CastSpellImmediate has no RELOCATION_ID
// either (a virtual, include/RE/M/MagicCaster.h:46, slot 01): the hook takes
// the function in slot 01 of ActorMagicCaster's own vtable
// (VTABLE_ActorMagicCaster[0], AE 205828, include/RE/Offsets_VTABLE.h:1862),
// the engine's binding for every actor's caster, and the ready emit says
// whether it is spell-cast.md:730's 34404; slot 03 (RequestCastImpl,
// MagicCaster.h:48, overridden at ActorMagicCaster.h:43) is checked against
// 34136 the same way. The response handlers' signature is the header's:
// they derive from IHandlerFunctor<Actor, BSFixedStringCI>
// (include/RE/Offsets_RTTI.h:2711, :2721-2722), whose ExecuteHandler(Actor&,
// const BSFixedString&) is slot 01 (include/RE/I/IHandlerFunctor.h:16-19);
// when slot 01 of each handler's vtable (AE 208829 and 208827,
// Offsets_VTABLE.h:2392-2393) is the doc's function, the actor is decoded
// and filtered like the rest; when it is not, the hook emits the first two
// argument pointers raw, unfiltered, 200 emits in all.
//
// Layouts (CommonLibSSE-NG): a form's id at +0x14 and its type at +0x1A
// (include/RE/T/TESForm.h:354, :356; ACHR 0x3E, include/RE/F/FormTypes.h:202);
// an actor's IAnimationGraphManagerHolder base at TESObjectREFR+0x38
// (include/RE/T/TESObjectREFR.h:112); a BSFixedString's first member is its
// char pointer (include/RE/B/BSFixedString.h:232); TESActionData: ActionInput
// at +0 with source +0x08 and action +0x18 (include/RE/B/BGSActionData.h:9,
// include/RE/A/ActionInput.h:25, :27; a NiPointer is one raw pointer,
// include/RE/N/NiSmartPointer.h:191), ActionOutput at +0x28 with animEvent
// +0x00 and animObjIdle +0x20 (BGSActionData.h:10,
// include/RE/A/ActionOutput.h:15, :19), flags +0x58 (BGSActionData.h:23);
// ActorMagicCaster: MagicCaster at +0, actor +0xB8, castingSource +0xF4
// (include/RE/A/ActorMagicCaster.h:19, :82, :90; the hand's values
// include/RE/M/MagicSystem.h:23-28).
'use strict';
function emit(obj) { obj.t = Date.now(); send(obj); console.log(JSON.stringify(obj)); }

const OFFSETS = {
  '1.6.1170.0': {
    notify: 0x54c450, // lab/addr.py addrlib 1.6.1170 32901
    performAction: 0x6cd0d0, // lab/addr.py addrlib 1.6.1170 38949
    performChosen: 0x6cd4a0, // lab/addr.py addrlib 1.6.1170 38953
    finishCast: 0x5beb60, // lab/addr.py addrlib 1.6.1170 34435
    interruptCast: 0x5bbfa0, // lab/addr.py addrlib 1.6.1170 34408
    startCharge: 0x5bf030, // lab/addr.py addrlib 1.6.1170 34443
    castSpell: 0x5bb720, // lab/addr.py addrlib 1.6.1170 34401
    requestCastImpl: 0x5b0840, // lab/addr.py addrlib 1.6.1170 34136
    castSpellImmediate: 0x5bb9c0, // lab/addr.py addrlib 1.6.1170 34404 (spell-cast.md:730; the check, and the fallback)
    actorMagicCasterVtable: 0x187b8b0, // lab/addr.py addrlib 1.6.1170 205828 (VTABLE_ActorMagicCaster[0])
    beginCastRight: 0x7b7db0, // lab/addr.py addrlib 1.6.1170 42820
    beginCastLeft: 0x7b7d60, // lab/addr.py addrlib 1.6.1170 42819
    rightHandlerVtable: 0x18b9998, // lab/addr.py addrlib 1.6.1170 208829 (VTABLE_RightHandSpellCastHandler)
    leftHandlerVtable: 0x18b9980, // lab/addr.py addrlib 1.6.1170 208827 (VTABLE_LeftHandSpellCastHandler)
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
  // VS_FIXEDFILEINFO: dwSignature, dwStrucVersion, dwFileVersionMS, dwFileVersionLS
  const ffi = out.readPointer();
  const ms = ffi.add(8).readU32();
  const ls = ffi.add(12).readU32();
  return [ms >>> 16, ms & 0xffff, ls >>> 16, ls & 0xffff].join('.');
}

function hex(n) { return '0x' + (n >>> 0).toString(16); }

function formId(form) {
  try {
    return form.isNull() ? 0 : hex(form.add(0x14).readU32());
  } catch (e) {
    return 'unreadable';
  }
}

// the BSFixedString at p: its first member is the char pointer
function fixedString(p) {
  const chars = p.readPointer();
  return chars.isNull() ? '' : chars.readUtf8String();
}

// a figure's id, or 0: a dynamic form (the player's 0x14 is below that range) whose type is ACHR
function figureId(actor) {
  if (actor.isNull()) return 0;
  const id = actor.add(0x14).readU32();
  if (id < 0xff000000) return 0;
  return actor.add(0x1a).readU8() === 0x3e ? id : 0;
}

function where(context) {
  return Thread.backtrace(context, Backtracer.ACCURATE).slice(0, 10).map(function (a) {
    const m = Process.findModuleByAddress(a);
    return m ? m.name + '+0x' + a.sub(m.base).toString(16) : a.toString();
  });
}

// one {fn, err} per hook, the first failure's
const failed = {};
function fail(fn, e) {
  if (failed[fn]) return;
  failed[fn] = true;
  emit({ fn: fn, err: String(e) });
}

const exe = Process.getModuleByName('SkyrimSE.exe');
const version = fileVersion(exe.path);
const at = OFFSETS[version];
if (at === undefined) {
  emit({ error: 'no offsets for this runtime', version: version });
} else {
  let hooks = 0;
  const hook = function (target, callbacks) {
    Interceptor.attach(typeof target === 'number' ? exe.base.add(target) : target, callbacks);
    hooks++;
  };
  const slot = function (vtable, index) { return exe.base.add(vtable).add(index * Process.pointerSize).readPointer(); };
  const rva = function (p) { return '0x' + p.sub(exe.base).toString(16); };

  // 1. the graph's entry: this is the holder base inside the actor
  hook(at.notify, {
    onEnter(args) {
      this.actor = 0;
      try {
        const id = figureId(args[0].sub(0x38));
        if (!id) return;
        this.event = fixedString(args[1]);
        this.actor = id;
      } catch (e) { fail('notify', e); }
    },
    onLeave(retval) {
      if (!this.actor) return;
      emit({ fn: 'notify', actor: hex(this.actor), event: this.event, taken: (retval.toInt32() & 0xff) !== 0 });
    },
  });

  // 2. the action entries: args[1] is the TESActionData, read at the leave
  const actionHook = function (fn, skipDryRun) {
    return {
      onEnter(args) {
        this.actor = 0;
        try {
          const d = args[1];
          if (skipDryRun && (d.add(0x58).readU32() & 1)) return;
          const id = figureId(d.add(0x08).readPointer());
          if (!id) return;
          this.data = d;
          this.actor = id;
        } catch (e) { fail(fn, e); }
      },
      onLeave(retval) {
        if (!this.actor) return;
        try {
          const d = this.data;
          emit({ fn: fn, actor: hex(this.actor), action: formId(d.add(0x18).readPointer()), event: fixedString(d.add(0x28)),
                 idle: formId(d.add(0x48).readPointer()), ret: retval.toInt32() & 0xff });
        } catch (e) { fail(fn, e); }
      },
    };
  };
  hook(at.performAction, actionHook('performAction', true));
  hook(at.performChosen, actionHook('performChosen', false));

  // 3. the figure's own caster: this is the ActorMagicCaster
  const casterHook = function (fn, extra) {
    return {
      onEnter(args) {
        try {
          const caster = args[0];
          const id = figureId(caster.add(0xb8).readPointer());
          if (!id) return;
          const row = { fn: fn, actor: hex(id), hand: caster.add(0xf4).readU32() };
          if (extra) extra(args, row);
          emit(row);
        } catch (e) { fail(fn, e); }
      },
    };
  };
  const withSpell = function (args, row) {
    row.spell = formId(args[1]);
    try { row.spellType = args[1].isNull() ? -1 : args[1].add(0x1a).readU8(); } catch (e) { row.spellType = 'unreadable'; }
  };
  const withRefund = function (args, row) { row.refund = args[1].toInt32() & 1; };
  hook(at.finishCast, casterHook('finishCast'));
  hook(at.interruptCast, casterHook('interruptCast', withRefund));
  hook(at.startCharge, casterHook('startCharge'));
  hook(at.castSpell, casterHook('castSpell', withSpell));
  hook(at.requestCastImpl, casterHook('requestCastImpl'));
  // CastSpellImmediate from the vtable's slot 01; the doc's 34404 is the check and, if the slot cannot be hooked, the fallback
  let casterCheck;
  try {
    const s1 = slot(at.actorMagicCasterVtable, 1);
    hook(s1, casterHook('castSpellImmediate', withSpell));
    casterCheck = { castSpellImmediateAt: rva(s1), is34404: s1.equals(exe.base.add(at.castSpellImmediate)) };
  } catch (e) {
    fail('castSpellImmediate', e);
    hook(at.castSpellImmediate, casterHook('castSpellImmediate', withSpell));
    casterCheck = { castSpellImmediateAt: '0x' + at.castSpellImmediate.toString(16), is34404: true, vtable: 'unreadable' };
  }
  try {
    casterCheck.requestCastImplSlotIs34136 = slot(at.actorMagicCasterVtable, 3).equals(exe.base.add(at.requestCastImpl));
  } catch (e) { casterCheck.requestCastImplSlotIs34136 = 'unreadable'; }

  // 4. the response handlers: decoded when slot 01 of each handler's vtable is the doc's function, raw otherwise
  let decoded = false;
  try {
    decoded = slot(at.rightHandlerVtable, 1).equals(exe.base.add(at.beginCastRight)) &&
              slot(at.leftHandlerVtable, 1).equals(exe.base.add(at.beginCastLeft));
  } catch (e) { fail('beginCast', e); }
  let raw = 0;
  const responseHook = function (fn) {
    return {
      onEnter(args) {
        try {
          if (decoded) {
            const id = figureId(args[1]);
            if (!id) return;
            emit({ fn: fn, actor: hex(id), response: fixedString(args[2]), bt: where(this.context) });
          } else {
            if (raw >= 200) return;
            raw++;
            emit({ fn: fn, a1: args[1].toString(), a2: args[2].toString(), bt: where(this.context) });
          }
        } catch (e) { fail(fn, e); }
      },
    };
  };
  hook(at.beginCastRight, responseHook('beginCastRight'));
  hook(at.beginCastLeft, responseHook('beginCastLeft'));

  emit(Object.assign({ ready: true, version: version, hooks: hooks, responseDecoded: decoded }, casterCheck));
}
