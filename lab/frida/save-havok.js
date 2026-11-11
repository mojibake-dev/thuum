// save-havok.js v1.2 DRAFT (thuum, 2026-11-11; the re-review's FIX FIRST applied as written): a SetAngularVelocity row's scaled column
// is named 'scaled', no longer 'game', the name the linear rows keep for real game units (its vector is rad/s times the scale, to
// compare with the block's angular floats, which the adr065 read's :781 calls game units, HYPOTHESIS). v1.1's header follows.
// save-havok.js v1.1 DRAFT (thuum, 2026-11-11; the fresh review's FIX FIRST applied as written, ADR-064 amendment A): the scale is
// bhkWorld::GetWorldScaleInverse's float (187407, game units per Havok unit), where v1 read GetWorldScale's (188105), its inverse
// (69.99125 and 0.0142875 in the exe's .rdata, lab/.cache/game/exe-1.6.1170, read 2026-11-11; the adr065 read's :781 and :821), so
// v1's (1, 1000) test failed and every game-unit column printed null; v1.1 trusts the scale only when the two floats multiply to 1
// and prints both in the ready row. And one clarification: an angular velocity is radians a second, not a length, so a
// SetAngularVelocity row's game column is the raw vector times the scale only to compare with the block's angular floats, which the
// static read says the writer scales too (HYPOTHESIS), and the speed is printed for linear rows alone. v1's header follows,
// corrected in place.
// save-havok.js v1 DRAFT (thuum, 2026-11-11; ADR-071 rung 0, docs/research/physics-leg-2026-11-11.md "The kHavokMoved block keeps an
// awake body's velocities"): does a save written while a body rolls keep that body's velocities in its Havok block, and does the
// load hand them back to the body? The plan's read: 19534 at a save while a body rolls, then 19538 and 78089 at the load. Records
// are written only at rest (ADR-071 decision 6), so nothing in the leg depends on the answer; it closes the engine reader's row 6
// ("kept, not dropped", a static read). New, so a fresh review comes before its first run (ADR-064 rule A). Attach only: no
// replacement, no write to engine memory, no engine call (memory reads alone).
//
// Where it runs: a seat whose game saves and loads, a solo run (ADR-031's solo boot, x-quit-solo's frame: no skymp5-client, so the
// game's own save and load are vanilla), with the body set rolling (a cabbage kicked down a slope, or pushed by a shout), a console
// `save <name>` while it rolls, then `load <name>`. FORM names the rolling body's reference (rows print for it whatever its block
// holds); other references print only when their block carries an active body's velocities, at most ROWS.
//
// Ids, by `just addr <id>` (lab/addr.py over addrlib/, runtime 1.6.1170.0, 428461 entries, run 2026-11-11; never from memory):
//   CommonLibSSE-NG b93280e8 names these (RELOCATION_ID is (SE, AE), the AE id resolved):
//   78089  0xe931e0   bhkRigidBody::SetLinearVelocity(this, const hkVector4&), include/RE/B/bhkRigidBody.h:55, src/RE/B/bhkRigidBody.cpp:29
//                     RELOCATION_ID(76259, 78089); ATTACHED
//   78090  0xe932b0   bhkRigidBody::SetAngularVelocity(this, const hkVector4&), bhkRigidBody.h:53, bhkRigidBody.cpp:15 RELOCATION_ID(76260,
//                     78090); ATTACHED (the adr065 read names 78088 for this step; CommonLib's 78090 is the setter, and 78088 is left
//                     out: the same read calls it the body's activate)
//   403449 0x31872c0  Main** (Offsets.h:383); threadID +0x28 (M/Main.h:87)
//   187407 0x177adfc  bhkWorld::GetWorldScaleInverse's float (B/bhkWorld.h:48-52): game units per Havok unit (69.99125), so the
//                     block's game-unit velocities and the setters' Havok-unit vectors read side by side (v1.1)
//   188105 0x17849dc  bhkWorld::GetWorldScale's float (:42-46): Havok units per game unit (0.0142875), the cross-check, printed
//   Named by the static read alone (pyghidra-mcp on sky-re, 2026-11-03; HYPOTHESIS by rule 2; docs/research/adr065-serialize-on-demand-
//   2026-11-03.md: the id table :718, the block's layout :768-783, the reader :810-822):
//   19534  0x2db2c0   the Havok block writer (ref, buf): ATTACHED; the block's bytes are the save buffer's from its position at the
//                     entry to its position at the leave
//   19537  0x2dbce0   its per-body writer, called by the collision-object traversal inside 19534: ATTACHED as a bracket only (its
//                     own arguments unread), so each body's bytes are the buffer's from its entry position to its leave position
//   19535  0x2db450   the Havok block reader (ref, buf): ATTACHED as a bracket; the velocities set inside it on its thread are its
//   19538  0x2dbfc0   its per-body reader: ATTACHED, counted inside each 19535
//
// Layouts (CommonLibSSE-NG b93280e8, include/RE/): BGSSaveGameBuffer buffer +0x08, size +0x10, bufferPosition +0x14
// (B/BGSSaveGameBuffer.h:30-32), the class BGSSaveFormBuffer extends (B/BGSSaveFormBuffer.h:7); TESForm formID +0x14
// (T/TESForm.h:354); TESObjectREFR data.objectReference
// +0x40 (T/TESObjectREFR.h:77, :495); a bhkRigidBody's referencedObject +0x10, the hkpRigidBody (B/bhkRefObject.h:26), whose
// collidable at +0x20 (H/hkpWorldObject.h:67) is never resolved here (no engine call): a velocity row names the 19535 call's form.
// The block, per the static read (:770-783, HYPOTHESIS): u8 flags (bit 0 bodies and none anim-targeted, bit 2 a flag byte per body,
// bit 4 a character controller), a varint count (value << 2 | width, 36052's encoding, as apply-on-demand.js's vi() reads it), two
// floats pitch and roll with bit 4, then per body in traversal order: unless it is the root's collision object, three floats of
// position and four of rotation in game units; with bit 2, a body flag byte (bit 0 active, bit 1 keyframed, bit 2 not
// anim-targeted); when active, three floats of linear and three of angular velocity in game units. A body's slice is decoded by
// its length (0, 28, 29, 52, 53), each length printed, so a layout that differs shows as a length the decoder does not name.
//
// Expected (the read, rule 2): at the save, FORM's block with flags bit 2, its body's flag byte with bit 0 set and six velocity
// floats near the body's speed then; at the load, one 19535 for FORM with its 19538 count equal to the block's, and a
// SetLinearVelocity inside it whose vector times the world scale is the saved linear velocity. Falsified by a slice of 28 or 29
// bytes for the rolling body (the velocities dropped) or no setter inside its 19535.
//
// Rows (console.log and send(); the lab's preamble flushes them to the trace's .log every 250 ms):
//   {event:'ready'}: version, pid (against the run's c<N>-skyrim-platform-pid<N>.log), base, Main's thread, both scale floats, every
//     site's id, rva, address and first bytes before the attach, params, attachErrors.
//   {event:'havokWrite'} at 19534's leave, for FORM or a block with an active body: the reference, its base, the thread, the
//     block's length, flags, count, pitch and roll, and each body's slice decoded.
//   {event:'havokRead'} at 19535's leave, for FORM or a call that set a velocity: the reference, the thread, the caller, the 19538
//     count, the vectors SetLinearVelocity and SetAngularVelocity took inside it (Havok units, and times the scale: a linear row's
//     game column and speed, an angular row's scaled column, v1.2).
//   {event:'velocity'} for a setter outside any 19535, the first 32: the caller and the vector, so another writer shows.
//   {event:'liveness'} every 10 s: every hook's count before its filter.
// Params (LAB_PARAMS): FORM (a reference id, a number or a hex string; 0 prints by the active rule alone), ROWS (64), BODIES (16 a
// row). 1.6.1170 only.
const PARAMS = (typeof LAB_PARAMS === 'object' && LAB_PARAMS) ? LAB_PARAMS : {};
const num = function (v, d) { return (v === undefined || v === null) ? d : Number(v); };
const FORM_ID = typeof PARAMS.FORM === 'string' ? parseInt(PARAMS.FORM, 16) : num(PARAMS.FORM, 0);
const ROWS = num(PARAMS.ROWS, 64);
const BODIES = num(PARAMS.BODIES, 16);
function emit(obj) { obj.t = Date.now(); send(obj); console.log(JSON.stringify(obj)); }

const OFFSETS = {
  '1.6.1170.0': {
    havokWrite: 0x2db2c0, // 19534 (static read) the Havok block writer
    havokBodyWrite: 0x2dbce0, // 19537 (static read) its per-body writer
    havokRead: 0x2db450, // 19535 (static read) the Havok block reader
    havokBodyRead: 0x2dbfc0, // 19538 (static read) its per-body reader
    setLinearVelocity: 0xe931e0, // 78089 bhkRigidBody::SetLinearVelocity
    setAngularVelocity: 0xe932b0, // 78090 bhkRigidBody::SetAngularVelocity
    mainSingleton: 0x31872c0, // 403449 Main**
    worldScaleInverse: 0x177adfc, // 187407 bhkWorld::GetWorldScaleInverse's float: game units per Havok unit (v1.1)
    worldScale: 0x17849dc, // 188105 bhkWorld::GetWorldScale's float: Havok units per game unit, the cross-check
  },
};
const SAVE_BUFFER = { data: 0x08, pos: 0x14 };
const FORM = { id: 0x14 };
const REFR_BASE = 0x40;

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

const hex = function (n) { return n < 0 ? String(n) : '0x' + (n >>> 0).toString(16); };
const isNil = function (p) { return p === null || p === undefined || p.isNull(); };
const u32 = function (p, o) { try { return p.add(o).readU32(); } catch (e) { return -1; } };
const f32 = function (p, o) { try { return p.add(o).readFloat(); } catch (e) { return NaN; } };
const ptrAt = function (p, o) { try { return p.add(o).readPointer(); } catch (e) { return NULL; } };
const r2 = function (x) { return Math.round(x * 100) / 100; };
const firstBytes = function (p) {
  try { return Array.from(new Uint8Array(p.readByteArray(8))).map(function (b) { return ('0' + b.toString(16)).slice(-2); }).join(' '); } catch (e) { return 'unreadable'; }
};
const vi = function (b, o) { const w = b[o] & 3; return w === 0 ? [b[o] >> 2, 1] : (w === 1 ? [((b[o + 1] << 8) | b[o]) >> 2, 2] : [((b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 2), 4]); };
const floats = function (bytes, o, n) { const dv = new DataView(bytes.buffer, bytes.byteOffset + o, 4 * n); const out = []; for (let i = 0; i < n; i++) out.push(r2(dv.getFloat32(4 * i, true))); return out; };
const len3 = function (v) { return r2(Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2])); };

const exe = Process.getModuleByName('SkyrimSE.exe');
const version = fileVersion(exe.path);
const off = OFFSETS[version];
if (off === undefined) {
  emit({ event: 'ready', error: 'no offsets for this runtime', version: version, pid: Process.id });
} else {
  const at = function (name) { return exe.base.add(off[name]); };
  const rva = function (p) { try { return hex(p.sub(exe.base).toUInt32()); } catch (e) { return String(p); } };
  // game units per Havok unit: GetWorldScaleInverse's float, trusted only when GetWorldScale's is its inverse (v1.1); without it the
  // game columns print null and the Havok ones stand
  const scaleInverse = f32(at('worldScaleInverse'), 0);
  const scaleForward = f32(at('worldScale'), 0);
  const scaleOk = scaleInverse > 1 && scaleInverse < 1000 && Math.abs(scaleInverse * scaleForward - 1) < 0.001;
  const SCALE = scaleOk ? scaleInverse : NaN;
  const mainTid = function () { return u32(ptrAt(at('mainSingleton'), 0), 0x28); };
  const counts = { havokWrite: 0, havokBodyWrite: 0, havokRead: 0, havokBodyRead: 0, setLinearVelocity: 0, setAngularVelocity: 0 };
  const attachErrors = [];
  const failed = {};
  const fail = function (where, e) { if (failed[where]) return; failed[where] = true; emit({ event: 'error', where: where, error: String(e) }); };
  let rows = 0;
  let outside = 0;
  const idOf = function (r) { return isNil(r) ? 0 : u32(r, FORM.id); };
  const baseOf = function (r) { const b = ptrAt(r, REFR_BASE); return isNil(b) ? 0 : u32(b, FORM.id); };
  const posOf = function (buf) { return u32(buf, SAVE_BUFFER.pos); };
  const bytesOf = function (buf, from, to) {
    if (!(to > from) || to - from > 0x100000) return null;
    try { return new Uint8Array(ptrAt(buf, SAVE_BUFFER.data).add(from).readByteArray(to - from)); } catch (e) { return null; }
  };
  // one body's slice, decoded by its length (the static read's layout; any other length prints raw)
  const decodeBody = function (b, flagByte) {
    const n = b.length;
    const out = { len: n };
    if (n === 0) { out.note = 'nothing written (the root collision object, by the static read)'; return out; }
    let o = 0;
    if (n >= 28) { out.pos = floats(b, 0, 3); out.rot = floats(b, 12, 4); o = 28; }
    if (flagByte && n > o) { const fl = b[o]; out.bodyFlags = hex(fl); out.active = (fl & 1) !== 0; out.keyframed = (fl & 2) !== 0; o += 1; }
    if (n - o >= 24) { out.linV = floats(b, o, 3); out.angV = floats(b, o + 12, 3); out.speed = len3(out.linV); o += 24; }
    if (o !== n) out.rest = Array.from(b.subarray(o)).map(function (x) { return ('0' + x.toString(16)).slice(-2); }).join('');
    return out;
  };

  const resolved = {};
  const note = function (name, id, p) { resolved[name] = { id: id, rva: rva(p), at: String(p), bytes: firstBytes(p) }; };
  note('havokWrite 19534', 19534, at('havokWrite'));
  note('havokBodyWrite 19537', 19537, at('havokBodyWrite'));
  note('havokRead 19535', 19535, at('havokRead'));
  note('havokBodyRead 19538', 19538, at('havokBodyRead'));
  note('SetLinearVelocity', 78089, at('setLinearVelocity'));
  note('SetAngularVelocity', 78090, at('setAngularVelocity'));

  const writes = {}; // tid -> the 19534 call in flight: its buffer, its start position, the bodies' slices
  const reads = {}; // tid -> the 19535 call in flight: its form, its 19538 count, the velocities set inside it
  const attach = function (name, p, cb) { try { Interceptor.attach(p, cb); } catch (e) { attachErrors.push(name + ': ' + e); } };

  attach('19534', at('havokWrite'), {
    onEnter(args) {
      counts.havokWrite += 1;
      try { writes[this.threadId] = { refr: args[0], buf: args[1], from: posOf(args[1]), bodies: [], open: -1 }; } catch (e) { fail('19534 enter', e); }
    },
    onLeave() {
      const w = writes[this.threadId];
      delete writes[this.threadId];
      if (w === undefined) return;
      try {
        const to = posOf(w.buf);
        const all = bytesOf(w.buf, w.from, to);
        if (all === null || all.length < 2) return;
        const flags = all[0];
        const count = vi(all, 1);
        const head = { flags: hex(flags), count: count[0] };
        let o = 1 + count[1];
        if (flags & 0x10 && all.length >= o + 8) { head.pitchRoll = floats(all, o, 2); o += 8; }
        const bodies = w.bodies.map(function (s) { const b = bytesOf(w.buf, s[0], s[1]); return b === null ? { len: s[1] - s[0], unreadable: true } : decodeBody(b, (flags & 4) !== 0); });
        const active = bodies.some(function (b) { return b.linV !== undefined; });
        const id = idOf(w.refr);
        if (id !== FORM_ID && !active) return;
        rows += 1;
        if (rows > ROWS && id !== FORM_ID) return;
        emit({ event: 'havokWrite', ref: hex(id), base: hex(baseOf(w.refr)), tid: this.threadId, main: this.threadId === mainTid(), bytes: all.length, head: head, sliced: w.bodies.length, bodies: bodies.slice(0, id === FORM_ID ? 64 : BODIES), activeBodies: bodies.filter(function (b) { return b.active; }).length });
      } catch (e) { fail('19534 leave', e); }
    },
  });
  attach('19537', at('havokBodyWrite'), {
    onEnter() { counts.havokBodyWrite += 1; const w = writes[this.threadId]; if (w !== undefined) w.open = posOf(w.buf); },
    onLeave() { const w = writes[this.threadId]; if (w !== undefined && w.open >= 0) { w.bodies.push([w.open, posOf(w.buf)]); w.open = -1; } },
  });
  attach('19535', at('havokRead'), {
    onEnter(args) {
      counts.havokRead += 1;
      reads[this.threadId] = { refr: args[0], bodies: 0, linear: [], angular: [], caller: rva(this.returnAddress) };
    },
    onLeave() {
      const r = reads[this.threadId];
      delete reads[this.threadId];
      if (r === undefined) return;
      const id = idOf(r.refr);
      if (id !== FORM_ID && r.linear.length === 0 && r.angular.length === 0) return;
      rows += 1;
      if (rows > ROWS && id !== FORM_ID) return;
      emit({ event: 'havokRead', ref: hex(id), base: hex(baseOf(r.refr)), tid: this.threadId, main: this.threadId === mainTid(), caller: r.caller, havokBody: r.bodies, linear: r.linear.slice(0, 64), angular: r.angular.slice(0, 64) });
    },
  });
  attach('19538', at('havokBodyRead'), { onEnter() { counts.havokBodyRead += 1; const r = reads[this.threadId]; if (r !== undefined) r.bodies += 1; } });
  const velocityHook = function (name) {
    return {
      onEnter(args) {
        counts[name] += 1;
        try {
          const v = [f32(args[1], 0), f32(args[1], 4), f32(args[1], 8)];
          const row = { havok: v.map(r2) };
          const times = v.map(function (x) { return r2(x * SCALE); });
          // v1.2: a linear vector times the scale is game units a second; an angular one (rad/s) is only scaled, for the comparison
          if (name === 'setLinearVelocity') { row.game = times; row.speed = len3(times); } else row.scaled = times;
          const r = reads[this.threadId];
          if (r !== undefined) { (name === 'setLinearVelocity' ? r.linear : r.angular).push(row); return; }
          outside += 1;
          if (outside <= 32) emit(Object.assign({ event: 'velocity', fn: name, tid: this.threadId, caller: rva(this.returnAddress), body: String(args[0]) }, row));
        } catch (e) { fail(name, e); }
      },
    };
  };
  attach('78089', at('setLinearVelocity'), velocityHook('setLinearVelocity'));
  attach('78090', at('setAngularVelocity'), velocityHook('setAngularVelocity'));

  emit({ event: 'ready', script: 'save-havok.js', v: '1.2', version: version, pid: Process.id, base: String(exe.base), mainThread: mainTid(), worldScale: { inverse187407: scaleInverse, forward188105: scaleForward, ok: scaleOk }, hooks: resolved, params: { FORM: hex(FORM_ID), ROWS: ROWS, BODIES: BODIES }, attachErrors: attachErrors });
  setInterval(function () { emit({ event: 'liveness', pid: Process.id, counts: JSON.parse(JSON.stringify(counts)), rows: rows, outside: outside, mainThread: mainTid() }); }, 10000);
}
