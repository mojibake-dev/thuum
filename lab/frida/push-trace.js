// push-trace.js: where Unrelenting Force's throw stops in the target's game,
// for thuum docs/verbs/push.md. The third word's effect (MGEF 0x7F82F)
// carries VoicePushEffectScript, whose OnEffectStart calls
// Caster.PushActorAway(Target, 15). Fork m2-push 2fe894e1 lets an event on an
// effect the player bears through skymp5-client's Papyrus event block, yet
// x-push (20261014-140325) staggered c2 and threw nothing. This logs the three
// stations in order:
// - every OnEffect* and OnMagicEffectApply event the VM is asked to send
//   (BSScript::Internal::VirtualMachine::SendEvent, Skyrim Platform's own hook
//   point: game/Offsets.h SendEvent, RELOCATION_ID(98077, 104800); called as
//   (this, VMHandle, const BSFixedString&, IFunctionArguments*)), with the
//   handle split in halves, since whether IObjectHandlePolicy::HandleIsType
//   reads an ActiveEffect's handle as type 142 (CommonLibSSE-NG
//   include/RE/A/ActiveEffect.h:31) is the filter's untested half;
// - the Papyrus native PushActorAway (Address Library 56213, the
//   re-analyst's reading, HYPOTHESIS: (VM*, StackID, TESObjectREFR* self,
//   Actor* target, float force)), the pusher's and the pushed's form ids;
// - AIProcess::KnockExplosion, every ragdoll's entry (CommonLibSSE-NG
//   src/RE/A/AIProcess.cpp:197-201, RELOCATION_ID(38858, 39895); called as
//   (AIProcess*, Actor*, const NiPoint3&, float)), the actor and the source.
// A form's id at +0x14 (include/RE/T/TESForm.h:354); BSFixedString's first
// member is its char pointer (include/RE/B/BSFixedString.h:232). Offsets resolved
// with lab/addr.py from addrlib/ for 1.6.1170 on 2026-10-14. Hooking SendEvent
// beside Skyrim Platform's own Frida hook runs this one first, so the names
// logged are the engine's, before the block.
// Run: a scenario's `frida {script: push-trace.js}` step on the target, or
// `just frida push-trace.js c2` while the game runs.
'use strict';
function emit(obj) { obj.t = Date.now(); send(obj); console.log(JSON.stringify(obj)); }

const OFFSETS = {
  '1.6.1170.0': {
    sendEvent: 0x14477f0, // 104800
    pushActorAway: 0xa2f4f0, // 56213
    knockExplosion: 0x710c80, // 39895
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

function where(context) {
  return Thread.backtrace(context, Backtracer.ACCURATE).slice(0, 10).map(function (a) {
    const m = Process.findModuleByAddress(a);
    return m ? m.name + '+0x' + a.sub(m.base).toString(16) : a.toString();
  });
}

const exe = Process.getModuleByName('SkyrimSE.exe');
const version = fileVersion(exe.path);
const at = OFFSETS[version];
if (at === undefined) {
  emit({ error: 'no offsets for this runtime', version: version });
} else {
  emit({ ready: true, version: version });
  Interceptor.attach(exe.base.add(at.sendEvent), {
    onEnter(args) {
      let name;
      try {
        name = args[2].readPointer().readCString();
      } catch (e) {
        return;
      }
      if (!name || !(name.startsWith('OnEffect') || name === 'OnMagicEffectApply')) return;
      const handle = args[1];
      emit({
        event: name,
        handle: handle.toString(),
        hi: hex(handle.shr(32).and(0xffffffff).toUInt32()),
        lo: hex(handle.and(0xffffffff).toUInt32()),
        tid: this.threadId,
      });
    },
  });
  Interceptor.attach(exe.base.add(at.pushActorAway), {
    onEnter(args) {
      emit({ pushActorAway: true, self: formId(args[2]), target: formId(args[3]), tid: this.threadId,
             backtrace: where(this.context) });
    },
  });
  Interceptor.attach(exe.base.add(at.knockExplosion), {
    onEnter(args) {
      let source = null;
      try {
        source = [args[2].readFloat(), args[2].add(4).readFloat(), args[2].add(8).readFloat()];
      } catch (e) {
        source = 'unreadable';
      }
      emit({ knockExplosion: true, actor: formId(args[1]), source: source, tid: this.threadId,
             backtrace: where(this.context) });
    },
  });
}
