// face-dump.js: what the renderer holds for a face right now. For the player
// and for every figure (a created reference, form ID 0xff000000 and up, which
// is what SkyMP spawns for another player) it walks the actor's loaded 3D and
// prints one line per geometry under a BSFaceGenNiNode, plus any geometry
// elsewhere whose shader carries the face flags: the shader property's class
// and flags, alpha, emissive; the material's class, specular colour, power
// and scale, alpha, refraction, rim and subsurface terms; each bound texture
// by name with its live D3D11 size and format; the texture set's nine paths;
// the facegen tint colour or tint/detail/subsurface textures. Two heads on
// the same actor, a hidden duplicate, a specular flag or a texture format
// that differs between a matte seat and a glossy one is the answer to
// docs/verbs/racemenu-sync.md's open question (rotfern's face is glossy in
// the lab and not on fenestrate, 2026-10-07).
//
// Read-only except for one call into the game, LookupReferenceByHandle, to
// turn the process list's actor handles into references (each resolved
// reference keeps one extra reference count; a probe, not a resident).
// Textures are measured through ID3D11Texture2D::GetDesc, which only copies
// the description (d3d11.h). Nothing is hooked, so it can attach to a game
// in play. Layouts are CommonLibSSE-NG b93280e8's, read for 1.6.1170 and
// cited per field; the three absolute addresses are Address Library 1.6.1170 IDs
// resolved with `just addr` (hard rule 1). It refuses to run when the module
// is not 1.6.1170 by checking the player singleton's class name first.
// Run: `just frida lab/frida/face-dump.js c2`; the lines land in
// C:\sky-lab\frida\face-dump.js.out on the client.
'use strict';
function emit(obj) { obj.t = Date.now(); console.log(JSON.stringify(obj)); }
const hex = (n) => '0x' + (n >>> 0).toString(16);

const exe = Process.getModuleByName('SkyrimSE.exe');
const base = exe.base;
const end = base.add(exe.size);
const inExe = (p) => p.compare(base) >= 0 && p.compare(end) < 0;
const nz = (p) => p !== null && !p.isNull();

// Address Library 1.6.1170, `just addr <id>` on 2026-10-07:
//   403521 Offset::PlayerCharacter::Singleton, a NiPointer<PlayerCharacter>
//          (include/RE/Offsets.h:451; src/RE/P/PlayerCharacter.cpp:18) -> 0x31874f8
//   400315 ProcessLists::GetSingleton's ProcessLists**
//          (src/RE/P/ProcessLists.cpp:13) -> 0x20f69b0
//   12332  LookupReferenceByHandle(const RefHandle&, NiPointer<TESObjectREFR>&)
//          (include/RE/Offsets.h:582; include/RE/M/Misc.h:25) -> 0x179710
const ADDR = { player: 0x31874f8, processLists: 0x20f69b0, lookupRef: 0x179710 };

// Field offsets for 1.6.1170. Where a header gives two numbers, NG's
// REL::RelocateMember(self, seAndAE, vr) (REL/Relocation.h:633) means the
// first is SE and AE together and the second is VR; RelocateMemberIfNewer
// (version, self, older, newer) picks the second on a runtime at or past the
// version, and the field comments inside such a struct are the older layout's
// absolute offsets, so each shifts by the difference.
const O = {
  formID: 0x14,            // TESForm.h:354
  refData: 0x40,           // TESObjectREFR.h:495 OBJ_REFR data; .objectReference at +0 (:77)
  loadedData: 0x68,        // TESObjectREFR.h:497
  data3D: 0x68,            // TESObjectREFR.h:101 LOADED_REF_DATA::data3D
  actorRace: 0x1F8,        // Actor.h:684 race /* 1F0 */ in ACTOR_RUNTIME_DATA, which starts at 0xE0 before 1.6.629 and 0xE8 from it on (Actor.h:712)
  netName: 0x10,           // NiObjectNET.h:53 BSFixedString name (a const char*, BSFixedString.h:232)
  avFlags: 0xF4,           // NiAVObject.h:144 RelocateMember(this, 0x0F4, 0x10C); kHidden = 1 << 0
  children: 0x110,         // NiNode.h:76 "110, 138" NiTObjectArray: vtable +0, _data +8, _capacity u16 +0x10 (NiTArray.h:116-117)
  geomRuntime: 0x120,      // BSGeometry.h:120 RelocateMember(this, 0x120, 0x160); properties[2] +0, skinInstance +0x10 (:70-71)
  spAlpha: 0x30,           // BSShaderProperty.h:221
  spFlags: 0x38,           // BSShaderProperty.h:222 (u64)
  spMaterial: 0x78,        // BSShaderProperty.h:230
  lspEmissiveColor: 0xF0,  // BSLightingShaderProperty.h (NiColor*)
  lspEmissiveMult: 0xF8,
  lspSpecularLODFade: 0x100,
  apFlags: 0x30,           // NiAlphaProperty.h:63 (u16), threshold u8 +0x32
  mSpecularColor: 0x38,    // BSLightingShaderMaterialBase.h:47 NiColor (3 floats, NiColor.h:273)
  mDiffuse: 0x48,          // :49
  mNormal: 0x58,           // :52
  mRimSoft: 0x60,          // :53
  mSpecBack: 0x68,         // :54
  mTextureSet: 0x78,       // :57
  mAlpha: 0x80, mRefraction: 0x84, mSpecularPower: 0x88, mSpecularScale: 0x8C, // :58-61
  mSubsurfaceRolloff: 0x90, mRimPower: 0x94, // :62-63
  fgTintTexture: 0xA0, fgDetailTexture: 0xA8, fgSubsurfaceTexture: 0xB0, // BSLightingShaderMaterialFacegen.h:30-32
  fgTintColor: 0xA0,       // BSLightingShaderMaterialFacegenTint.h:26
  tsTextures: 0x10,        // BSShaderTextureSet.h:30 after BSTextureSet's 0x10 (BSTextureSet.h:53)
  stRendererTexture: 0x48, // NiSourceTexture.h:39 -> BSGraphics::Texture { ID3D11Texture2D* texture +0 } (:73)
  plHighActors: 0x30,      // ProcessLists.h:69 BSTArray<ActorHandle>: _data +0, _capacity +8 (BSTArray.h:140-141), _size +0x10 (:47; Allocator before BSTArrayBase, :374-376)
};
// BSTextureSet.h:18-33
const SLOT = ['diffuse', 'normal', 'envMask/subsurfaceTint', 'glow/detail', 'height', 'environment', 'multilayer', 'backlight/specular', 'unused'];
// BSShaderProperty.h EShaderPropertyFlag, bit order as declared
const FLAG = ['Specular', 'Skinned', 'TempRefraction', 'VertexAlpha', 'GrayscaleToPaletteColor', 'GrayscaleToPaletteAlpha', 'Falloff', 'EnvMap',
  'ReceiveShadows', 'CastShadows', 'Face', 'Parallax', 'ModelSpaceNormals', 'NonProjectiveShadows', 'MultiTextureLandscape', 'Refraction',
  'RefractionFalloff', 'EyeReflect', 'HairTint', 'ScreendoorAlphaFade', 'LocalMapClear', 'FaceGenRGBTint', 'OwnEmit', 'ProjectedUV',
  'MultipleTextures', 'RemappableTextures', 'Decal', 'DynamicDecal', 'ParallaxOcclusion', 'ExternalEmittance', 'SoftEffect', 'ZBufferTest',
  'ZBufferWrite', 'LODLandscape', 'LODObjects', 'NoFade', 'TwoSided', 'VertexColors', 'GlowMap', 'AssumeShadowmask',
  'CharacterLighting', 'MultiIndexSnow', 'VertexLighting', 'UniformScale', 'FitSlope', 'Billboard', 'NoLODLandBlend', 'EnvmapLightFade',
  'Wireframe', 'WeaponBlood', 'HideOnLocalMap', 'PremultAlpha', 'CloudLOD', 'AnisotropicLighting', 'NoTransparencyMultiSample', 'MenuScreen',
  'MultiLayerParallax', 'SoftLighting', 'RimLighting', 'BackLighting', 'Snow', 'TreeAnim', 'EffectLighting', 'HDLODObjects'];
// DXGI_FORMAT values that textures here can carry (dxgiformat.h); unknown ones print as numbers
const DXGI = { 2: 'R32G32B32A32_FLOAT', 10: 'R16G16B16A16_FLOAT', 28: 'R8G8B8A8_UNORM', 29: 'R8G8B8A8_UNORM_SRGB', 71: 'BC1_UNORM', 72: 'BC1_UNORM_SRGB',
  74: 'BC2_UNORM', 75: 'BC2_UNORM_SRGB', 77: 'BC3_UNORM', 78: 'BC3_UNORM_SRGB', 80: 'BC4_UNORM', 83: 'BC5_UNORM', 87: 'B8G8R8A8_UNORM', 91: 'B8G8R8A8_UNORM_SRGB',
  95: 'BC6H_UF16', 98: 'BC7_UNORM', 99: 'BC7_UNORM_SRGB' };

// MSVC x64 RTTI, read-only: vtable[-1] is the RTTICompleteObjectLocator
// { signature (1: image-relative), offset, cdOffset, pTypeDescriptor,
// pClassDescriptor, pSelf }; a TypeDescriptor's decorated name starts at +0x10
// (".?AVNiNode@@"); the class hierarchy descriptor { signature, attributes,
// numBaseClasses, pBaseClassArray } lists every base's descriptor, whose first
// field is its TypeDescriptor. Igor Skochinsky, "Reversing Microsoft Visual
// C++ Part II: Classes, Methods and RTTI", OpenRCE 2006.
function locator(obj) {
  try {
    const vt = obj.readPointer();
    if (!inExe(vt)) return null;
    const col = vt.sub(8).readPointer();
    if (!inExe(col) || col.readU32() !== 1) return null;
    if (!base.add(col.add(20).readS32()).equals(col)) return null;
    return col;
  } catch (e) { return null; }
}
function typeName(rva) { return base.add(rva).add(0x10).readCString().replace(/^\.\?AV/, '').replace(/@@$/, ''); }
function className(obj) { const col = locator(obj); return col ? typeName(col.add(12).readS32()) : null; }
function bases(obj) {
  const col = locator(obj);
  if (!col) return [];
  const chd = base.add(col.add(16).readS32());
  const n = chd.add(8).readU32();
  const arr = base.add(chd.add(12).readS32());
  const out = [];
  for (let i = 0; i < n && i < 64; i++) out.push(typeName(base.add(arr.add(4 * i).readS32()).readS32()));
  return out;
}
const isA = (obj, name) => bases(obj).indexOf(name) >= 0;

function fixedString(at) { const p = at.readPointer(); return nz(p) ? p.readCString() : null; }
function color3(at) { return [at.readFloat(), at.add(4).readFloat(), at.add(8).readFloat()].map((f) => +f.toFixed(4)); }
function flagNames(lo, hi) {
  const out = [];
  for (let b = 0; b < 32; b++) { if (lo & (1 << b)) out.push(FLAG[b]); if (hi & (1 << b)) out.push(FLAG[32 + b]); }
  return out;
}

// ID3D11Texture2D::GetDesc is vtable slot 10: IUnknown's three, ID3D11DeviceChild's
// four, ID3D11Resource's three, then GetDesc (d3d11.h). D3D11_TEXTURE2D_DESC:
// Width, Height, MipLevels, ArraySize, Format, SampleDesc.Count, .Quality, Usage, BindFlags, CPUAccessFlags, MiscFlags (11 u32).
const desc = Memory.alloc(64);
function textureInfo(texPtr) {
  if (!nz(texPtr)) return null;
  // a NiTexture is a NiObject, not a NiObjectNET: formatPrefs +0x10 (pixelLayout, alphaFormat, mipMapped), name +0x20 (NiTexture.h)
  const r = { name: fixedString(texPtr.add(0x20)), class: className(texPtr),
    prefs: [texPtr.add(0x10).readU32(), texPtr.add(0x14).readU32(), texPtr.add(0x18).readU32()] };
  try {
    const rt = texPtr.add(O.stRendererTexture).readPointer();
    const d3d = nz(rt) ? rt.readPointer() : null;
    if (nz(d3d)) {
      const getDesc = new NativeFunction(d3d.readPointer().add(10 * 8).readPointer(), 'void', ['pointer', 'pointer'], 'win64');
      getDesc(d3d, desc);
      const f = desc.add(16).readU32();
      r.d3d = { w: desc.readU32(), h: desc.add(4).readU32(), mips: desc.add(8).readU32(), format: DXGI[f] || f, bind: desc.add(32).readU32(), usage: desc.add(28).readU32() };
    }
  } catch (e) { r.d3dError = String(e); }
  return r;
}

function material(mat) {
  if (!nz(mat)) return null;
  const m = { class: className(mat) };
  if (!isA(mat, 'BSLightingShaderMaterialBase')) return m;
  m.specularColor = color3(mat.add(O.mSpecularColor));
  m.specularPower = +mat.add(O.mSpecularPower).readFloat().toFixed(4);
  m.specularScale = +mat.add(O.mSpecularScale).readFloat().toFixed(4);
  m.alpha = +mat.add(O.mAlpha).readFloat().toFixed(4);
  m.refraction = +mat.add(O.mRefraction).readFloat().toFixed(4);
  m.subsurfaceRolloff = +mat.add(O.mSubsurfaceRolloff).readFloat().toFixed(4);
  m.rimPower = +mat.add(O.mRimPower).readFloat().toFixed(4);
  m.diffuse = textureInfo(mat.add(O.mDiffuse).readPointer());
  m.normal = textureInfo(mat.add(O.mNormal).readPointer());
  m.rimSoft = textureInfo(mat.add(O.mRimSoft).readPointer());
  m.specBack = textureInfo(mat.add(O.mSpecBack).readPointer());
  const ts = mat.add(O.mTextureSet).readPointer();
  if (nz(ts)) {
    m.textureSetClass = className(ts);
    m.textureSet = {};
    for (let i = 0; i < 9; i++) { const s = ts.add(O.tsTextures + 8 * i).readPointer(); if (nz(s)) m.textureSet[SLOT[i]] = s.readCString(); }
  }
  if (isA(mat, 'BSLightingShaderMaterialFacegen')) {
    m.tintTexture = textureInfo(mat.add(O.fgTintTexture).readPointer());
    m.detailTexture = textureInfo(mat.add(O.fgDetailTexture).readPointer());
    m.subsurfaceTexture = textureInfo(mat.add(O.fgSubsurfaceTexture).readPointer());
  }
  if (isA(mat, 'BSLightingShaderMaterialFacegenTint')) m.tintColor = color3(mat.add(O.fgTintColor));
  return m;
}

function geometry(geom, actor, path, underFace) {
  const rt = geom.add(O.geomRuntime);
  const alphaProp = rt.readPointer();
  const shader = rt.add(8).readPointer();
  const g = { geom: fixedString(geom.add(O.netName)), class: className(geom), actor: hex(actor), path, underFaceNode: underFace,
    hidden: (geom.add(O.avFlags).readU32() & 1) !== 0, skinned: nz(rt.add(0x10).readPointer()) };
  if (nz(alphaProp)) g.alphaProp = { class: className(alphaProp), flags: hex(alphaProp.add(O.apFlags).readU16()), threshold: alphaProp.add(O.apFlags + 2).readU8() };
  let want = underFace;
  if (nz(shader)) {
    const lo = shader.add(O.spFlags).readU32(), hi = shader.add(O.spFlags + 4).readU32();
    const names = flagNames(lo, hi);
    want = want || names.indexOf('Face') >= 0 || names.indexOf('FaceGenRGBTint') >= 0;
    g.shader = { class: className(shader), flags: hex(hi) + hex(lo).slice(2).padStart(8, '0'), set: names, alpha: +shader.add(O.spAlpha).readFloat().toFixed(4) };
    if (isA(shader, 'BSLightingShaderProperty')) {
      const ec = shader.add(O.lspEmissiveColor).readPointer();
      g.shader.emissiveColor = nz(ec) ? color3(ec) : null;
      g.shader.emissiveMult = +shader.add(O.lspEmissiveMult).readFloat().toFixed(4);
      g.shader.specularLODFade = +shader.add(O.lspSpecularLODFade).readFloat().toFixed(4);
    }
    g.material = material(shader.add(O.spMaterial).readPointer());
  }
  return want ? g : null;
}

function walk(node, path, actor, underFace, c, depth) {
  if (depth > 40 || c.nodes > 20000) return;
  c.nodes++;
  const b = bases(node);
  const name = fixedString(node.add(O.netName)) || '';
  const here = path ? path + '/' + name : name;
  let face = underFace;
  if (b.indexOf('BSFaceGenNiNode') >= 0) {
    face = true;
    c.faceNodes++;
    emit({ actor: hex(actor), faceNode: name, class: className(node), path: here, hidden: (node.add(O.avFlags).readU32() & 1) !== 0 });
  }
  if (b.indexOf('BSGeometry') >= 0) {
    c.geoms++;
    try { const g = geometry(node, actor, here, face); if (g) { c.faceGeoms++; emit(g); } } catch (e) { emit({ actor: hex(actor), path: here, error: String(e), at: (e.stack || '').split('\n').slice(1, 3).join(' ') }); }
    return;
  }
  if (b.indexOf('NiNode') < 0) return;
  const kids = node.add(O.children);
  const data = kids.add(8).readPointer();
  const cap = kids.add(0x10).readU16();
  if (!nz(data)) return;
  for (let i = 0; i < cap; i++) {
    const k = data.add(8 * i).readPointer();
    if (nz(k)) walk(k, here, actor, face, c, depth + 1);
  }
}

function dumpActor(ref, tag) {
  const formId = ref.add(O.formID).readU32();
  const baseObj = ref.add(O.refData).readPointer();
  const race = ref.add(O.actorRace).readPointer();
  const loaded = ref.add(O.loadedData).readPointer();
  const root = nz(loaded) ? loaded.add(O.data3D).readPointer() : null;
  const head = { actor: hex(formId), tag, class: className(ref), base: nz(baseObj) ? hex(baseObj.add(O.formID).readU32()) : null,
    actorRace: nz(race) ? hex(race.add(O.formID).readU32()) : null, root: nz(root) ? fixedString(root.add(O.netName)) : null };
  emit(head);
  if (!nz(root)) return;
  const c = { nodes: 0, geoms: 0, faceNodes: 0, faceGeoms: 0 };
  walk(root, '', formId, false, c, 0);
  emit({ actor: hex(formId), tag, walked: c });
}

try {
  emit({ module: exe.name, base: base.toString(), size: exe.size, pid: Process.id });
  const player = base.add(ADDR.player).readPointer();
  const playerClass = nz(player) ? className(player) : null;
  if (playerClass !== 'PlayerCharacter') {
    emit({ error: 'player singleton does not read as PlayerCharacter (' + playerClass + '): not 1.6.1170, or no game loaded', done: true });
  } else {
    dumpActor(player, 'player');
    const pl = base.add(ADDR.processLists).readPointer();
    if (!nz(pl)) emit({ error: 'no ProcessLists' });
    else {
      const arr = pl.add(O.plHighActors);
      const data = arr.readPointer();
      const size = arr.add(0x10).readU32();
      emit({ highActors: size });
      const lookup = new NativeFunction(base.add(ADDR.lookupRef), 'bool', ['pointer', 'pointer'], 'win64');
      const handle = Memory.alloc(4);
      const out = Memory.alloc(8);
      let figures = 0, others = [];
      for (let i = 0; i < size && i < 4096; i++) {
        handle.writeU32(data.add(4 * i).readU32());
        out.writePointer(ptr(0));
        if (!lookup(handle, out)) continue;
        const ref = out.readPointer();
        if (!nz(ref)) continue;
        const id = ref.add(O.formID).readU32();
        if (id === 0x14) continue;
        if (id >= 0xff000000) { figures++; dumpActor(ref, 'figure'); } else others.push(hex(id));
      }
      emit({ figures, otherActors: others.length, others: others.slice(0, 64) });
    }
    emit({ done: true });
  }
} catch (e) {
  emit({ error: String(e), stack: e.stack, done: true });
}
