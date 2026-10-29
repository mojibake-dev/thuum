// quest-stage-chain.js: the engine's chain from a quest stage's set to its Papyrus fragment, on both seats
// (thuum docs/verbs/quest-stage.md slice two, ADR-056's known limit: a relayed stage's fragment runs on the
// applying seat too). The re-analyst's static read (docs/research/m3/re-quest-fragment.md) names the chain:
// the Papyrus native Quest.SetCurrentStageID (56684) -> EnsureQuestStarted (25003) -> the latent wait's entry
// counter (53716) -> the setter (25004) -> the stage's done bit and the StoryTeller's waits (25252) -> per log
// entry (25260: conditions, journal, message, then the TESQuestStageEvent) -> the VM's stage sink
// SkyrimVM::ProcessEvent (53987) -> the FragmentSystem lookup (53429: the quest's script and fragment names)
// -> the dispatch functor (54240) -> the item-done event (25234) -> the latent return (53763). The console's
// setstage is 22151 over the same 25004. Expected: (a) a local setstage: 22151, 25004, 25260 per entry, 53987
// with 53429 true (two names) and later 54240 then 25234; no 53763. (b) a relayed apply (Skyrim Platform's
// Quest.SetStage): 56684, 53716, 25004, 25260, 53987, 53429, 54240, 25234, 53763 to zero. Under the planned
// detour of 53987 for a relayed pair: 25234 inside 53987's frame, no 53429 and no 54240. Every id is a
// HYPOTHESIS until this trace reads as expected (rule 2). Params: QUEST (a form id to keep, default all),
// RAW (true prints the unknown-shape functions' first four args as pointers).
// Offsets by `just addr` (lab/addr.py, Address Library 1.6.1170 only), 2026-10-29.
const PARAMS = (typeof LAB_PARAMS === 'object' && LAB_PARAMS) ? LAB_PARAMS : {};
const QUEST = PARAMS.QUEST === undefined ? 0 : Number(PARAMS.QUEST);
const RAW = PARAMS.RAW === undefined ? false : !!PARAMS.RAW;
function emit(obj) { obj.t = Date.now(); send(obj); console.log(JSON.stringify(obj)); }

const OFFSETS = {
  '1.6.1170.0': {
    setStageNative: 0xa46fd0, // 56684 Quest.SetCurrentStageID
    consoleSetStage: 0x34e060, // 22151
    ensureStarted: 0x3c9bf0, // 25003 TESQuest::EnsureQuestStarted
    entryCount: 0x9b1020, // 53716 the latent wait's log-entry counter
    setStage: 0x3c9d00, // 25004 the setter (quest, stage)
    stageDone: 0x3da8f0, // 25252 the done bit, the StoryTeller's waits
    logEntry: 0x3daea0, // 25260 per log entry, sends the TESQuestStageEvent
    stageSink: 0x9c6b70, // 53987 SkyrimVM::ProcessEvent(TESQuestStageEvent)
    fragmentLookup: 0x99b680, // 53429 FragmentSystem: script and fragment names
    dispatchFunctor: 0x9d66a0, // 54240 the dispatch's functor, fires the callback's slot 1
    itemDone: 0x3da060, // 25234 the callback's slot 1: TESQuestStageItemDoneEvent
    latentReturn: 0x9b3de0, // 53763 the latent return
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
const u32 = function (p, o) { try { return p.add(o).readU32(); } catch (e) { return -1; } };
const u16 = function (p, o) { try { return p.add(o).readU16(); } catch (e) { return -1; } };
const u8 = function (p, o) { try { return p.add(o).readU8(); } catch (e) { return -1; } };
const fixedString = function (p) { try { return p.isNull() ? '' : p.readPointer().readUtf8String(); } catch (e) { return '?'; } };
const kept = function (id) { return QUEST === 0 || id === QUEST; };
const raw = function (args) { return RAW ? [String(args[0]), String(args[1]), String(args[2]), String(args[3])] : undefined; };

const exe = Process.getModuleByName('SkyrimSE.exe');
const version = fileVersion(exe.path);
const off = OFFSETS[version];
if (off === undefined) {
  emit({ error: 'no offsets for this runtime', version: version });
} else {
  const at = function (name) { return exe.base.add(off[name]); };
  // the native: rcx vm, edx stackId, r8 the quest (its formID at +0x14), r9d the stage
  Interceptor.attach(at('setStageNative'), {
    onEnter(args) { this.q = formId(args[2]); this.stage = args[3].toInt32() & 0xffff; },
    onLeave(retval) { if (kept(this.q)) emit({ fn: 'SetCurrentStageID', id: 56684, tid: this.threadId, quest: hex(this.q), stage: this.stage, ret: retval.toInt32() }); },
  });
  Interceptor.attach(at('consoleSetStage'), {
    onEnter(args) { this.a = raw(args); },
    onLeave(retval) { emit({ fn: 'console setstage', id: 22151, tid: this.threadId, args: this.a, ret: retval.toInt32() }); },
  });
  Interceptor.attach(at('ensureStarted'), {
    onEnter(args) { this.q = formId(args[0]); this.startNow = args[1].toInt32() & 0xff; },
    onLeave(retval) { if (kept(this.q)) emit({ fn: 'EnsureQuestStarted', id: 25003, tid: this.threadId, quest: hex(this.q), startNow: this.startNow, ret: retval.toInt32() }); },
  });
  Interceptor.attach(at('entryCount'), {
    onEnter(args) { this.a = raw(args); },
    onLeave(retval) { emit({ fn: 'entry counter', id: 53716, tid: this.threadId, args: this.a, ret: retval.toInt32() }); },
  });
  // the setter: rcx the quest, dx the stage; al the result
  Interceptor.attach(at('setStage'), {
    onEnter(args) { this.q = formId(args[0]); this.stage = args[1].toInt32() & 0xffff; },
    onLeave(retval) { if (kept(this.q)) emit({ fn: 'SetStage', id: 25004, tid: this.threadId, quest: hex(this.q), stage: this.stage, ret: retval.toInt32() & 0xff }); },
  });
  Interceptor.attach(at('stageDone'), {
    onEnter(args) { this.a = raw(args); this.q = formId(args[0]); },
    onLeave(retval) { if (kept(this.q)) emit({ fn: 'stage done bit', id: 25252, tid: this.threadId, quest: hex(this.q), args: this.a }); },
  });
  // per log entry: rcx the stage item (entry index at +0x15, hasLogEntry at +0x16), dl
  Interceptor.attach(at('logEntry'), {
    onEnter(args) { this.entry = u8(args[0], 0x15); this.hasLog = u8(args[0], 0x16); this.dl = args[1].toInt32() & 0xff; },
    onLeave(retval) { emit({ fn: 'log entry', id: 25260, tid: this.threadId, entry: this.entry, hasLogEntry: this.hasLog, dl: this.dl }); },
  });
  // the VM's stage sink: rdx the TESQuestStageEvent (callback at +0, formID +8, stage +0xC, entry +0xE)
  Interceptor.attach(at('stageSink'), {
    onEnter(args) {
      this.q = u32(args[1], 0x8); this.stage = u16(args[1], 0xc); this.entry = u8(args[1], 0xe);
      this.cb = String(args[1].isNull() ? NULL : args[1].readPointer());
    },
    onLeave(retval) { if (kept(this.q)) emit({ fn: 'VM stage sink', id: 53987, tid: this.threadId, quest: hex(this.q), stage: this.stage, entry: this.entry, callback: this.cb, ret: retval.toInt32() }); },
  });
  // the fragment lookup: the two BSFixedString outs are args 5 and 6 (on the stack: args[4], args[5]); al the found flag
  Interceptor.attach(at('fragmentLookup'), {
    onEnter(args) { this.outScript = args[4]; this.outFragment = args[5]; this.a = raw(args); },
    onLeave(retval) {
      const found = retval.toInt32() & 0xff;
      emit({ fn: 'fragment lookup', id: 53429, tid: this.threadId, found: found, script: found ? fixedString(this.outScript) : '', fragment: found ? fixedString(this.outFragment) : '', args: this.a });
    },
  });
  Interceptor.attach(at('dispatchFunctor'), {
    onEnter(args) { this.a = raw(args); },
    onLeave(retval) { emit({ fn: 'dispatch functor', id: 54240, tid: this.threadId, args: this.a }); },
  });
  // the item-done event: rcx the callback (formID at +0x10, stage at +0x14)
  Interceptor.attach(at('itemDone'), {
    onEnter(args) { this.q = u32(args[0], 0x10); this.stage = u16(args[0], 0x14); },
    onLeave(retval) { if (kept(this.q)) emit({ fn: 'item done', id: 25234, tid: this.threadId, quest: hex(this.q), stage: this.stage }); },
  });
  // the latent return: the counter at rcx+0x50
  Interceptor.attach(at('latentReturn'), {
    onEnter(args) { this.counter = u32(args[0], 0x50); this.a = raw(args); },
    onLeave(retval) { emit({ fn: 'latent return', id: 53763, tid: this.threadId, counter: this.counter, args: this.a }); },
  });
  emit({ event: 'ready', version: version, quest: QUEST ? hex(QUEST) : 'all', raw: RAW, hooks: Object.keys(off).length });
}
