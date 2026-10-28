// voice-lines.js: how a topic info's response lines start and end on a
// talking actor, for train 57 of thuum docs/verbs/npc-stream.md (the puppet
// plays an info's first line and stops; the re-analyst's read of 2026-10-27,
// docs/private/re-voice-responses.md, says every LATER line starts from the
// AI update's SayTopic with a null topic, which an AI-off puppet never runs,
// and that the player's dialogue partner speaks through
// Actor::UpdateInDialogue with no event). HYPOTHESIS until this trace reads
// it on a host seat: the player talks to Sven through a multi-line topic,
// then stands in Riverwood for barks and scenes, 120 s.
// Run: `just frida voice-lines.js c1` while c1's game runs the dialogue.
//
// Hooks (SkyrimSE 1.6.1170 only; Address Library ids resolved with
// `just addr` on 2026-10-27, the structures from CommonLibSSE-NG:
// TESForm::formID at 0x14, DialogueItem.h:55 (responses list at +0x08, the
// info at +0x20), HighProcessData.h:298 (greetTopic at +0x360),
// DialogueResponse's voice path at +0x18):
//   37542 SpeakSoundFunction(actor, path, ...): one call per LINE
//   39772 the bark path's line start (HighProcessData*, DialogueResponse*, Actor*)
//   37541 Actor::UpdateInDialogue(actor, DialogueResponse* or null): the menu's lines
//   25616 the topic info event sender (TESTopicInfo*, type: 0 begin, 1 end)
//   39632 the AI update's continuation (AIProcess*, Actor*): counted per actor
//   39643 start the item's current response (AIProcess*, DialogueItem*, Actor*)
'use strict';
function emit(obj) { obj.t = Date.now(); send(obj); console.log(JSON.stringify(obj)); }

const OFFSETS = {
  '1.6.1170.0': {
    speak: 0x67a9d0,     // 37542
    barkStart: 0x70c2b0, // 39772
    inDialogue: 0x67a140, // 37541
    infoEvent: 0x3ebac0, // 25616
    aiContinue: 0x6f16d0, // 39632
    startCurrent: 0x6f8020, // 39643
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

function formId(formPtr) {
  try {
    if (formPtr.isNull()) return 0;
    return formPtr.add(0x14).readU32();
  } catch (e) {
    return -1;
  }
}

// a BSFixedString's chars: the field holds a pointer to the characters
function fixedString(fieldPtr) {
  try {
    if (fieldPtr.isNull()) return null;
    const chars = fieldPtr.readPointer();
    if (chars.isNull()) return null;
    return chars.readUtf8String(160);
  } catch (e) {
    return null;
  }
}

// a path argument passed in a register: the characters themselves, or a
// pointer to a BSFixedString holding them (read both ways, keep what reads)
function pathArg(reg) {
  try {
    if (reg.isNull()) return null;
    const direct = reg.readUtf8String(160);
    if (direct && /^[\x20-\x7e]{4,}$/.test(direct.slice(0, 24))) return direct;
  } catch (e) { /* not characters */ }
  return fixedString(reg);
}

// the response's position in the item's list (BSSimpleList: item at +0, next at +8), 16 deep at most
function responseIndex(itemPtr, responsePtr) {
  try {
    let node = itemPtr.add(0x08);
    for (let i = 0; i < 16; i++) {
      if (node.isNull()) return -1;
      if (node.readPointer().equals(responsePtr)) return i;
      node = node.add(8).readPointer();
    }
  } catch (e) { /* fall through */ }
  return -1;
}

const exe = Process.getModuleByName('SkyrimSE.exe');
const version = fileVersion(exe.path);
const off = OFFSETS[version];
if (off === undefined) {
  emit({ error: 'no offsets for this runtime', version: version });
} else {
  const counts = { aiContinue: {}, speak: 0, barkStart: 0, inDialogue: 0, infoEvent: 0, startCurrent: 0 };

  Interceptor.attach(exe.base.add(off.speak), {
    onEnter(args) {
      counts.speak += 1;
      emit({ speak: true, actor: formId(args[0]).toString(16), path: pathArg(args[1]), tid: this.threadId });
    },
  });

  Interceptor.attach(exe.base.add(off.barkStart), {
    onEnter(args) {
      counts.barkStart += 1;
      let info = 0;
      let item = NULL;
      try {
        item = args[0].add(0x360).readPointer();
        if (!item.isNull()) info = formId(item.add(0x20).readPointer());
      } catch (e) { info = -1; }
      emit({
        barkStart: true,
        actor: formId(args[2]).toString(16),
        info: info.toString(16),
        index: item.isNull() ? -1 : responseIndex(item, args[1]),
        path: args[1].isNull() ? null : fixedString(args[1].add(0x18)),
      });
    },
  });

  Interceptor.attach(exe.base.add(off.inDialogue), {
    onEnter(args) {
      if (args[1].isNull()) return; // the per-tick call carries no response
      counts.inDialogue += 1;
      emit({ inDialogue: true, actor: formId(args[0]).toString(16), path: fixedString(args[1].add(0x18)) });
    },
  });

  Interceptor.attach(exe.base.add(off.infoEvent), {
    onEnter(args) {
      counts.infoEvent += 1;
      emit({ infoEvent: true, info: formId(args[0]).toString(16), type: args[1].toInt32() });
    },
  });

  Interceptor.attach(exe.base.add(off.aiContinue), {
    onEnter(args) {
      const id = formId(args[1]).toString(16);
      counts.aiContinue[id] = (counts.aiContinue[id] || 0) + 1;
    },
  });

  Interceptor.attach(exe.base.add(off.startCurrent), {
    onEnter(args) {
      counts.startCurrent += 1;
      let info = 0;
      try { info = formId(args[1].add(0x20).readPointer()); } catch (e) { info = -1; }
      emit({ startCurrent: true, actor: formId(args[2]).toString(16), info: info.toString(16) });
    },
  });

  setInterval(function () {
    emit({ summary: true, counts: counts });
  }, 10000);

  emit({ ready: true, version: version, offsets: off });
}
