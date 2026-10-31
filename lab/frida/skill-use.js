// skill-use.js: what the engine hands its skill experience path, for the leveling verb's hook (thuum
// docs/verbs/leveling.md, Dynamic plan). ONE function: PlayerCharacter's UseSkill, vtable slot 0xF7 (CommonLibSSE-NG
// include/RE/A/Actor.h:445, `UseSkill(ActorValue, float points, TESForm*)`), which x-skill-use-read v2 (20261031-093933)
// resolved from the player's own vtable to the very address CommonLibSSE-NG names PlayerCharacter::AddSkillExperience
// (src/RE/P/PlayerCharacter.cpp:238-243, RELOCATION_ID(39413, 40488); RVA 0x736e20 on 1.6.1170): the two names are one
// override. v2 saw it fire once per landed hit (rcx the player, edx the skill 6, r9 the sword 0x12eb7) but read the float
// as null: an attach's context has no XMM registers. v3 REPLACES the function with a NativeCallback of the header's
// signature (figure-dent-trace.js's idiom), so `points` arrives as the ABI passes it (xmm2), and calls the original
// through a NativeFunction at the same address (Frida routes that call to the original). Expected: points 7 for an
// iron sword (its base damage), with the skill's xp rising 7 * 6.3 = 44.1 a hit where the mults stand (solo), 0 where
// skymp5-client zeroed them. The answer places the client hook: this function, its `points` the SkillUse amount.
// Params: none. Offsets by `just addr` (lab/addr.py, Address Library 1.6.1170 only), 2026-10-31.
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
  const target = game.base.add(offsets.addSkillExperience);
  // void PlayerCharacter::UseSkill(ActorValue skill, float points, TESForm* source), this in rcx
  const sig = ["pointer", "uint32", "float", "pointer"];
  const original = new NativeFunction(target, "void", sig, "win64");
  let calls = 0;
  Interceptor.replace(
    target,
    new NativeCallback(
      function (self, skill, points, source) {
        calls += 1;
        emit({
          ev: "useSkill",
          n: calls,
          self: hex(formId(self)),
          skill: skill & 0xff,
          points: points,
          source: hex(formId(source)),
        });
        original(self, skill, points, source);
      },
      "void",
      sig,
      "win64",
    ),
  );
  emit({ ev: "armed", useSkill: target.toString(), rva: hex(offsets.addSkillExperience), mode: "replace" });
}
