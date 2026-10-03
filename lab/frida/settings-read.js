// settings-read.js: the live value of game settings in the running game, found
// by name rather than by address: each setting is a Setting object (vtable at
// +0, value at +8, name pointer at +0x10; CommonLibSSE-NG include/RE/S/
// Setting.h), so find the name string in SkyrimSE.exe, then the pointer to it,
// then read the float beside it. Version-independent, and it reflects any INI
// override. For docs/verbs/activation-reach.md (rule 2: confirm the
// re-analyst's defaults in the lab). Run: `just frida settings-read.js c1`.
'use strict';
function emit(obj) { obj.t = Date.now(); send(obj); console.log(JSON.stringify(obj)); }
const NAMES = [
  'fActivatePickLength:Interface',
  'fActivatePickRadius:Interface',
  'fFavorRequestPickDistance',
  'fLargeActivatePickLength_G',
];
const exe = Process.getModuleByName('SkyrimSE.exe');
function hex(s) {
  let out = [];
  for (let i = 0; i < s.length; i++) out.push(('0' + s.charCodeAt(i).toString(16)).slice(-2));
  out.push('00');
  return out.join(' ');
}
function pointerPattern(p) {
  const bytes = [];
  let v = p;
  for (let i = 0; i < 8; i++) { bytes.push(('0' + v.and(0xff).toNumber().toString(16)).slice(-2)); v = v.shr(8); }
  return bytes.join(' ');
}
NAMES.forEach(function (name) {
  const strings = Memory.scanSync(exe.base, exe.size, hex(name));
  if (strings.length === 0) { emit({ setting: name, error: 'name not found in SkyrimSE.exe' }); return; }
  strings.forEach(function (s) {
    const refs = Memory.scanSync(exe.base, exe.size, pointerPattern(s.address));
    refs.forEach(function (r) {
      const setting = r.address.sub(0x10);
      emit({
        setting: name,
        string: '+0x' + s.address.sub(exe.base).toString(16),
        object: '+0x' + setting.sub(exe.base).toString(16),
        value: setting.add(8).readFloat(),
      });
    });
    if (refs.length === 0) emit({ setting: name, string: '+0x' + s.address.sub(exe.base).toString(16), error: 'no pointer to the name' });
  });
});
emit({ done: true });
