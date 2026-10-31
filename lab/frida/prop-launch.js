// prop-launch.js: prop-contact.js plus the body's motion at each contact and push (the launch read, D73's open item:
// a resting Dynamic basket thrown out of reach by a standing capsule contact, push v13 034316 and pass v11 034648).
// Added fields from the body's embedded motion (hkpEntity.h motion 0x150; hkpMotion.h type +0x10, motionState +0x20,
// inertiaAndMassInv +0xD0 whose w is the inverse mass, linearVelocity +0xE0, angularVelocity +0xF0; hkMotionState.h
// transform +0x00; hkTransform.h translation +0x30): pos, vel (its length), angVel length and massInv, at the contact and
// before and after every impulse push, so a launch reads as the push's impulse (a jump in vel per push), a wrong mass
// (massInv huge) or something else (vel grows between pushes). Every offset is a HYPOTHESIS on this runtime until the
// native basket's lines read as sane numbers (a basket's massInv about 0.3 to 1, a nudge's vel under 100).
// prop-contact.js: the player's Havok contact with a prop (thuum docs/verbs/prop-physics.md, ADR-058;
// docs/research/m3/re-havok-contact.md). The player's bhkCharProxyController hears every added contact
// point through hkpCharacterProxyListener slot 2, ContactPointAddedCallback (79131), with no motion-type
// filter, so a Keyframed clutter body's touch IS delivered; the surface-interaction pass applies the push
// through the impulse body (78304) only for dynamic bodies under the 95 mass cap, so a Keyframed body takes
// nothing. Hooks: 79131 (rcx this: the controller, whose vtable 0 is the listener; rdx the proxy; r8 the
// hkpRootCdPoint: rootCollidableB at its header offset, read as the second collidable slot), reading the
// collidable's layer (collisionFilterInfo & 0x7f), the owner body's motion type at +0x160 and the reference
// through TESHavokUtilities::FindCollidableRef (26003); 78304, the body of bhkCharProxyController's
// ObjectInteractionCallback with this adjusted to the bhkCharacterController (the re-analyst's Ghidra read of
// 11:45 PDT 2026-10-31, CONFIRMED-BY-DECOMPILE: its one caller is the thunk 79133, `mov rdx, r8; add rcx, 0x10;
// mov r8, r9; jmp`, slot 5 of vtable 240558 whose slot 2 is 79131): rcx the controller, rdx the
// hkpCharacterObjectInteractionEvent (hkpCharacterProxyListener.h: position 0x00, normal 0x10, objectImpulse
// 0x20 (a float), timestep 0x24, projectedVelocity 0x28, objectMassInv 0x2C, body 0x30), r8 the
// hkpCharacterObjectInteractionResult (objectImpulse vector 0x00, impulsePosition 0x10). The function scales
// result.objectImpulse (zero unless 0 < mass < 95, the .data constant 389158; factor 2, props' layer 10 3 or 0.1 by
// mass, layers 6 and 14 0.1, shrunk so impulse/mass <= 1000) and writes nothing on the body; the push lands after
// it returns, in the surface pass 62648 (activate 60849, then the motion's ApplyPointImpulse), so a velocity jump
// shows in the NEXT call's `before`, never this call's `after`. v2 (181848) read rdx as the body and got motion 32
// (stack past the 0x40-byte event); v3 reads the body at rdx+0x30 and logs the event's numbers and the result
// vector before and after the scaling. `player` tags the player's proxy controller (*rcx == vtable 240560).
// Expected (a) on the seat that simulates the basket: 79131 once per new contact with layer 4 and
// motion type 1 to 3, then 78304 every step with the basket as its body; (b) on the other seat: 79131 fires
// with motion type 4 and 78304 stays silent. Every id is a HYPOTHESIS until this trace reads as expected
// (rule 2). Params: RAW (true prints the raw args). The hkpRootCdPoint's rootCollidableB offset is read from
// CommonLibSSE-NG hkpRootCdPoint.h (contact 0x00, rootCollidableA 0x20, rootCollidableB 0x30), hkpCollidable.h
// (ownerOffset 0x20, the typed broad-phase handle 0x24: type +4, collisionFilterInfo +8), hkpEntity.h (motion
// 0x150) and hkpMotion.h (type +0x10), hkpWorldObject.h (the embedded collidable 0x20); if a struct differs on
// this runtime the layer reads nonsense and RAW shows it.
// Offsets by `just addr` (lab/addr.py, Address Library 1.6.1170 only), 2026-10-29.
const PARAMS = (typeof LAB_PARAMS === 'object' && LAB_PARAMS) ? LAB_PARAMS : {};
const RAW = PARAMS.RAW === undefined ? false : !!PARAMS.RAW;
function emit(obj) { obj.t = Date.now(); send(obj); console.log(JSON.stringify(obj)); }

const OFFSETS = {
  '1.6.1170.0': {
    contactAdded: 0xed1540, // 79131 bhkCharProxyController::ContactPointAddedCallback
    impulseBody: 0xea1600, // 78304 bhkCharProxyController::ObjectInteractionCallback's body (rdx the event, rdx+0x30 the body)
    proxyControllerVtable: 0x19edff0, // 240560 bhkCharProxyController's vtable: *rcx of 78304 for the player's own controller
    interactionThunk: 0xed1620, // 79133 the listener slot 5 thunk into 78304 (not hooked; the chain's record)
    surfacePass: 0xb83580, // 62648 the proxy's surface interaction pass that applies result.objectImpulse after 78304 returns (not hooked)
    findCollidableRef: 0x3fd3d0, // 26003 TESHavokUtilities::FindCollidableRef
    proxyControllerVtable: 0x19edff0, // 240560 the proxy controller's bhkCharacterController vtable (at +0x10)
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
const u8 = function (p, o) { try { return p.add(o).readU8(); } catch (e) { return -1; } };
const s8 = function (p, o) { try { return p.add(o).readS8(); } catch (e) { return -128; } };
const ptrAt = function (p, o) { try { return p.add(o).readPointer(); } catch (e) { return NULL; } };
const raw = function (args) { return RAW ? [String(args[0]), String(args[1]), String(args[2]), String(args[3])] : undefined; };
const f32 = function (p, o) { try { return p.add(o).readFloat(); } catch (e) { return NaN; } };
const r1 = function (x) { return Math.round(x * 10) / 10; };
// the body's motion fields (an hkpEntity): hkpEntity.h motion at 0x150 and hkpMotion.h's layout inside it
const MOTION = 0x150;
const motionFacts = function (body) {
  if (body.isNull()) return undefined;
  const m = body.add(MOTION);
  const pos = [f32(m, 0x20 + 0x30), f32(m, 0x20 + 0x34), f32(m, 0x20 + 0x38)];
  const vel = [f32(m, 0xe0), f32(m, 0xe4), f32(m, 0xe8)];
  const ang = [f32(m, 0xf0), f32(m, 0xf4), f32(m, 0xf8)];
  const len = function (v) { return Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]); };
  return { type: u8(m, 0x10), massInv: f32(m, 0xd0 + 0xc), pos: pos.map(r1), vel: vel.map(r1), speed: r1(len(vel)), spin: r1(len(ang)) };
};

// hkpWorldObject.h: the embedded hkpLinkedCollidable's offset (the header's comment column; verified at write time)
const COLLIDABLE_IN_WORLD_OBJECT = 0x20;
const exe = Process.getModuleByName('SkyrimSE.exe');
const version = fileVersion(exe.path);
const off = OFFSETS[version];
if (off === undefined) {
  emit({ error: 'no offsets for this runtime', version: version });
} else {
  const at = function (name) { return exe.base.add(off[name]); };
  const findRef = new NativeFunction(at('findCollidableRef'), 'pointer', ['pointer']);
  const proxyVtable = at('proxyControllerVtable');
  // the collidable (hkpCollidable.h: an hkpCdBody of 0x20 bytes, then ownerOffset int8 at +0x20, the typed
  // broad-phase handle at +0x24 whose type is at +4 and collisionFilterInfo at +8, so +0x28 and +0x2c):
  // the owner is this plus ownerOffset (type 1 = an entity, the rigid body), the layer the low seven
  // bits of the filter info (hkpCollidable::GetCollisionLayer), the body's motion type at +0x160
  // (hkpEntity.h: motion at 0x150; hkpMotion.h: type at +0x10)
  const collidableFacts = function (c) {
    if (c.isNull()) return { layer: -1, motion: -1, ref: '0x0', ownerType: -1 };
    const layer = u32(c, 0x2c) & 0x7f;
    const type = s8(c, 0x28);
    const ownerOffset = s8(c, 0x20);
    const owner = c.add(ownerOffset);
    const motion = type === 1 ? u8(owner, 0x160) : -1;
    let ref = 0;
    try { ref = formId(findRef(c)); } catch (e) { ref = -1; }
    const facts = type === 1 ? motionFacts(owner) : undefined;
    return { layer: layer, motion: motion, ref: hex(ref), ownerType: type, body: facts };
  };
  const seen = {}; // reference -> last emit ms, one line per reference per 250 ms
  Interceptor.attach(at('contactAdded'), {
    onEnter(args) {
      const controller = args[0];
      const isPlayerProxy = ptrAt(controller, 0x10).equals(proxyVtable);
      const point = args[2];
      const b = collidableFacts(ptrAt(point, 0x30));
      const now = Date.now();
      if (b.ref !== '0x0' && seen[b.ref] !== undefined && now - seen[b.ref] < 250) return;
      seen[b.ref] = now;
      emit({ fn: 'ContactPointAdded', id: 79131, tid: this.threadId, playerProxy: isPlayerProxy, layer: b.layer, motion: b.motion, ownerType: b.ownerType, ref: b.ref, body: b.body, args: raw(args) });
    },
  });
  const vec3 = function (p) { return p.isNull() ? undefined : [f32(p, 0), f32(p, 4), f32(p, 8)].map(r1); };
  const proxyVtableAddr = at('proxyControllerVtable');
  Interceptor.attach(at('impulseBody'), {
    onEnter(args) {
      this.a = raw(args);
      const ev = args[1];
      // hkpCharacterObjectInteractionEvent (hkpCharacterProxyListener.h): the body at 0x30, the numbers before it
      this.body = ptrAt(ev, 0x30);
      this.event = { objectImpulse: f32(ev, 0x20), dt: f32(ev, 0x24), projectedVelocity: f32(ev, 0x28), massInv: f32(ev, 0x2c) };
      this.result = args[2];
      this.resultBefore = vec3(this.result);
      this.player = ptrAt(args[0], 0).equals(proxyVtableAddr);
      this.before = motionFacts(this.body);
    },
    onLeave(retval) {
      let ref = 0;
      try { const c = this.body.isNull() ? NULL : this.body.add(COLLIDABLE_IN_WORLD_OBJECT); ref = c.isNull() ? 0 : formId(findRef(c)); } catch (e) { ref = -1; }
      emit({ fn: 'impulse body', id: 78304, tid: this.threadId, player: this.player, motion: u8(this.body, 0x160), ref: hex(ref),
        event: this.event, result: { before: this.resultBefore, after: vec3(this.result) }, before: this.before, after: motionFacts(this.body), args: this.a });
    },
  });
  emit({ event: 'ready', version: version, raw: RAW });
}
