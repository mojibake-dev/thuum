// poison-trace.js: the game's poisoning of a weapon, traced, for thuum
// docs/verbs/poison.md. The re-analyst's static read (2026-10-12, scratchpad
// poison-re.md) was made in 1.7.104's bodies under the same Address Library
// ids, so every step is HYPOTHESIS until this runs on 1.6.1170. Logged:
// - the box's opener (40481);
// - its callback (40482) with the message it gets (Yes is 2);
// - InventoryEntryData::PoisonObject (16024: the entry's object, the poison
//   and the doses; CommonLibSSE-NG include/RE/I/InventoryEntryData.h:54);
// - the PoisonedWeapon event's send (41044);
// - the equip event's send (38386), which a poisoning should never reach.
// ANSWER_YES answers the box itself: on the opener's return, on the game
// thread, it calls the callback with 2, which acts only while the player's
// pending poison is set (the opener sets it on the confirm path). The box
// then stays on screen until closed, and its own answer finds nothing
// pending. Started by hand it only watches, for a person at the box; a
// scenario's frida step passes ANSWER_YES. Run: `just frida poison-trace.js c2`
// while the game runs. Offsets per runtime resolved with lab/addr.py from
// addrlib/ on 2026-10-12; the runtime is the exe's file version, as SKSE
// reads it.
'use strict';
// a scenario's frida step sets it: `frida {script: poison-trace.js, params:
// {ANSWER_YES: true}}` (thuum lab-api runner _frida_start)
const ANSWER_YES = !!(globalThis.LAB_PARAMS && globalThis.LAB_PARAMS.ANSWER_YES);

function emit(obj) { obj.t = Date.now(); send(obj); console.log(JSON.stringify(obj)); }

const OFFSETS = {
  '1.6.1170.0': {
    open: 0x7365d0,         // 40481
    callback: 0x736740,     // 40482
    poisonObject: 0x2248d0, // 16024
    sendPoisoned: 0x759c40, // 41044
    sendEquip: 0x6b0070,    // 38386
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

// a TESForm's formID at +0x14 (CommonLibSSE-NG include/RE/T/TESForm.h:354)
function formId(form) {
  try {
    return form.isNull() ? 0 : form.add(0x14).readU32();
  } catch (e) {
    return -1;
  }
}

const exe = Process.getModuleByName('SkyrimSE.exe');
const version = fileVersion(exe.path);
const at = OFFSETS[version];
if (at === undefined) {
  emit({ error: 'no offsets for this runtime', version: version });
} else {
  const callback = new NativeFunction(exe.base.add(at.callback), 'void', ['uint32']);
  let answering = false;
  Interceptor.attach(exe.base.add(at.open), {
    onEnter() { emit({ open: true, tid: this.threadId }); },
    onLeave() {
      if (ANSWER_YES && !answering) {
        answering = true;
        callback(2);
        answering = false;
        emit({ answered: 2, tid: this.threadId });
      }
    },
  });
  Interceptor.attach(exe.base.add(at.callback), {
    onEnter(args) { emit({ callback: args[0].toUInt32(), tid: this.threadId, ours: answering }); },
  });
  // InventoryEntryData::object at +0x00 (include/RE/I/InventoryEntryData.h:59);
  // the message is IMessageBoxCallback::Message (include/RE/I/IMessageBoxCallback.h:12-17)
  Interceptor.attach(exe.base.add(at.poisonObject), {
    onEnter(args) {
      emit({
        poisonObject: true,
        weapon: formId(args[0].readPointer()),
        poison: formId(args[1]),
        doses: args[2].toUInt32(),
      });
    },
  });
  Interceptor.attach(exe.base.add(at.sendPoisoned), {
    onEnter(args) { emit({ poisonedWeaponEvent: true, source: args[0].toString() }); },
  });
  Interceptor.attach(exe.base.add(at.sendEquip), {
    onEnter() { emit({ equipEvent: true }); },
  });
  emit({ ready: true, version: version, answerYes: ANSWER_YES });
}
