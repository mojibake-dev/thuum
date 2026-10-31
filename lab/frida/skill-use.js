// skill-use.js: what the engine hands its skill experience path, for the leveling verb's hook (thuum
// docs/verbs/leveling.md, Dynamic plan). Two hooks on a seat: PlayerCharacter::AddSkillExperience (Address Library
// 40488 for 1.6.1170; CommonLibSSE-NG src/RE/P/PlayerCharacter.cpp:238-243 RELOCATION_ID(39413, 40488); rcx this, edx
// the ActorValue, xmm2 the experience) and the player's UseSkill through its vtable slot 0xF7 (CommonLibSSE-NG
// include/RE/A/Actor.h:445, `UseSkill(ActorValue, float points, TESForm*)`: rcx this, edx the ActorValue, xmm2 the
// points, r9 the form), read from the player's own vtable at the first AddSkillExperience call (its `this`), so no
// singleton address is needed. The question: with skymp5-client's mults zeroed (DisableSkillAdvanceService: every
// skill's use mult and offset 0, fXPPerSkillRank 0), does AddSkillExperience still see the use's base amount, or a zero
// (the mult applied before it, inside UseSkill), and what does UseSkill receive per hit (expected: the weapon's base
// damage for One-handed, the blocked damage for Block)? Each call prints the function, the skill, the float and the form.
// Params: none. Every offset is a HYPOTHESIS until a hit's line reads as a sane number (an iron sword's 7 at UseSkill).
// Offsets by `just addr` (lab/addr.py, Address Library 1.6.1170 only), 2026-10-31.
const PARAMS = typeof LAB_PARAMS === "object" && LAB_PARAMS ? LAB_PARAMS : {};
function emit(obj) {
  obj.t = Date.now();
  send(obj);
  console.log(JSON.stringify(obj));
}

const OFFSETS = {
  "1.6.1170.0": {
    addSkillExperience: 0x736e20, // 40488 PlayerCharacter::AddSkillExperience
  },
};
const USE_SKILL_SLOT = 0xf7; // Actor.h:445's vtable index

function fileVersion(path) {
  const ver = Module.load("version.dll");
  const size = new NativeFunction(
    ver.getExportByName("GetFileVersionInfoSizeW"),
    "uint32",
    ["pointer", "pointer"],
  );
  const info = new NativeFunction(
    ver.getExportByName("GetFileVersionInfoW"),
    "int",
    ["pointer", "uint32", "uint32", "pointer"],
  );
  const query = new NativeFunction(
    ver.getExportByName("VerQueryValueW"),
    "int",
    ["pointer", "pointer", "pointer", "pointer"],
  );
  const p = Memory.allocUtf16String(path);
  const n = size(p, NULL);
  if (n === 0) return null;
  const buf = Memory.alloc(n);
  if (!info(p, 0, n, buf)) return null;
  const out = Memory.alloc(Process.pointerSize);
  const len = Memory.alloc(4);
  if (!query(buf, Memory.allocUtf16String("\\"), out, len)) return null;
  const ffi = out.readPointer();
  const ms = ffi.add(8).readU32();
  const ls = ffi.add(12).readU32();
  return [ms >>> 16, ms & 0xffff, ls >>> 16, ls & 0xffff].join(".");
}

const formId = function (p) {
  try {
    return p.isNull() ? 0 : p.add(0x14).readU32();
  } catch (e) {
    return -1;
  }
};
const hex = function (n) {
  return n < 0 ? String(n) : "0x" + n.toString(16);
};
// the third float argument lives in xmm2; Frida exposes the vector registers' low lanes on x64 as context fields
const xmm2 = function (ctx) {
  try {
    return ctx.xmm2 !== undefined ? ctx.xmm2.readFloat() : null;
  } catch (e) {
    return null;
  }
};

const game = Process.getModuleByName("SkyrimSE.exe");
const version = fileVersion(game.path);
const offsets = OFFSETS[version];
emit({
  ev: "start",
  version: version,
  base: game.base.toString(),
  known: !!offsets,
});
if (!offsets) {
  emit({ ev: "error", what: "no offsets for this runtime", version: version });
} else {
  let useSkillHooked = false;
  const hookUseSkillFrom = function (player) {
    if (useSkillHooked || player.isNull()) return;
    try {
      const vtable = player.readPointer();
      const useSkill = vtable
        .add(USE_SKILL_SLOT * Process.pointerSize)
        .readPointer();
      emit({
        ev: "useSkillAt",
        player: hex(formId(player)),
        vtable: vtable.toString(),
        useSkill: useSkill.toString(),
        rva: hex(useSkill.sub(game.base).toInt32()),
      });
      Interceptor.attach(useSkill, {
        onEnter: function (args) {
          emit({
            ev: "useSkill",
            self: hex(formId(args[0])),
            skill: this.context.rdx.toInt32() & 0xff,
            points: xmm2(this.context),
            form: hex(formId(args[3])),
          });
        },
      });
      useSkillHooked = true;
    } catch (e) {
      emit({ ev: "useSkillHookFailed", error: String(e) });
    }
  };
  // AddSkillExperience(this, ActorValue skill, float experience): edx and xmm2; the player's pointer arms UseSkill
  Interceptor.attach(game.base.add(offsets.addSkillExperience), {
    onEnter: function (args) {
      const self = args[0];
      emit({
        ev: "addSkillExperience",
        self: hex(formId(self)),
        skill: this.context.rdx.toInt32() & 0xff,
        experience: xmm2(this.context),
        r8: args[2].toString(),
      });
      hookUseSkillFrom(self);
    },
  });
  emit({
    ev: "armed",
    addSkillExperience: game.base.add(offsets.addSkillExperience).toString(),
    useSkillSlot: USE_SKILL_SLOT,
  });
}
