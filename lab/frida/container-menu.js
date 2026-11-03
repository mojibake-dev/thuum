// container-menu.js: the open ContainerMenu's own path, on BOTH seats (thuum docs/engine/containers.md section 4, read R1
// with R4's counters; rows E6, E8 to E11, E13, E14, E16, E19 to E24, E26, E27, E32). Written 02:4x PST 2026-11-03 (10:4xZ)
// from the doc's static reads; never run. Every engine claim it reads is a HYPOTHESIS until a run reads as expected (rule 2).
//
// Hooks: SkyrimSE.exe's base plus the RVA lab/addr.py resolves for each Address Library id in addrlib/versionlib-1-6-1170-0.bin
// (2026-11-03; every one equals the RVA containers.md R1 lists). Signatures are CommonLibSSE-NG's (the b93280e8 pin, paths under
// include/RE/ unless named) where it declares one; the rest are Ghidra's reads of /SkyrimSE-1.6.1170.0.exe.unpacked.exe on
// 2026-11-03, HYPOTHESIS, and their rows carry HYPOTHESIS in their fn.
//   51126 ContainerMenu::ProcessMessage(UIMessage&) (C/ContainerMenu.h:61; slot 04 of VTABLE_ContainerMenu 215061, I/IMenu.h:70,
//     Offsets_VTABLE.h:4008): RCX the menu, RDX the message.
//   51144 UpdateItemList and 51146 the dirty rebuild (names from docs/research/m3/re-container-menu-refresh.md Q1): RCX the menu
//     (Ghidra: 51144 tests [RCX+0x70] and calls 51146 with RCX unchanged when it is not zero; 51146 walks [RCX+0x60]).
//   52849 SendUIMessage::SendInventoryUpdateMessage(TESObjectREFR*, const TESBoundObject*) (S/SendUIMessage.h:10,
//     src/RE/S/SendUIMessage.cpp:10).
//   13631 UIMessageQueue::AddMessage(const BSFixedString&, UI_MESSAGE_TYPE, IUIMessageData*) (Offsets.h:569;
//     U/UIMessageQueue.h:24): RDX the name, R8 the type, R9 the data.
//   35855 the message-data factory's lookup by name and 52803 the InventoryUpdateData creator's CreateImpl (names from
//     docs/research/m3/re-inventory-update-factory.md Q2): Ghidra's 35855 hashes *RCX and compares the map's keys to it (RCX a
//     BSFixedString*) and returns the creator's product or 0; 52803 allocates 0x20 bytes, writes VTABLE_InventoryUpdateData 216346
//     and the null handle 400312 and returns the object (in RAX: the row checks its vtable). A plugin that posts through
//     CommonLib's GetCreator (B/BSTCreateFactoryManager.h:36-40, the header's own map walk) reaches 52803 without 35855.
//   19689 TESObjectREFR::RemoveItem (T/TESObjectREFR.h:282, slot 0x56) and Actor's 37797 (slot 0x56 of VTABLE_Actor): RCX this,
//     RDX the hidden ObjectRefHandle out (Ghidra: 19689 stores the null handle through its second argument and returns it), R8
//     the item, R9 the count, then [RSP+0x28] the reason (TESObjectREFR.h:63-71), +0x30 the extra list, +0x38 moveToRef.
//   19708 TESObjectREFR::AddObjectToContainer (TESObjectREFR.h:286, slot 0x5A) and Actor's 37525: RCX this, RDX the object, R8
//     the extra list, R9 the count, [RSP+0x28] fromRefr (Ghidra's 19708 reads them so).
//   16059 and 16053 the engine's InventoryChanges remove and add (names from re-container-menu-refresh.md Q2): RCX the
//     InventoryChanges (its owner at +0x08, I/InventoryChanges.h:64); 16059 as Ghidra's 19689 calls it: RDX a handle out, R8 the
//     ref, R9 the item, [RSP+0x28] the count, +0x30 the reason; 16053 as Ghidra's 19708 calls it: RDX the object, R8 the extra
//     list, R9 the count, [RSP+0x28] fromRefr.
//   51031 ItemList::Update_Impl(TESObjectREFR*) (Offsets.h:351; I/ItemList.h:42): RCX the list, RDX the owner.
//   51017 ItemList::GetSelectedItem (the id from re-container-menu-refresh.md's table; I/ItemList.h:27; Ghidra's body reads +0x50,
//     "selectedIndex", +0x48 and +0x38 as src/RE/I/ItemList.cpp:7-26 does): RCX the list, RAX the row.
//   82641 FxDelegate::Callback(GFxMovieView*, const char*, const GFxValue*, uint32) (F/FxDelegate.h:41; slot 01 of
//     VTABLE_FxDelegate 242193, Offsets_VTABLE.h:6150): RDX the movie, R8 the method, R9 the args, [RSP+0x28] their count.
//   82082 UI::ProcessMessages (Skyrim Souls RE's name, re-container-menu-refresh.md Q2): the dispatcher's pass, enter and leave.
//   kernel32!Sleep, counted only: the Interceptor's pulse (trap-path-trace.js v3).
// An argument past the fourth sits at [RSP+0x28] and on at the entry (the return address, then the 32-byte home area), as
// trap-path-trace.js reads its native's.
//
// Rows, one JSON object a line. {ready} once: the pid (compare with the run's c<N>-skyrim-platform-pid<N>.log), the base, each
// hook's address and its live first eight bytes against the image's (Ghidra, 2026-11-03; same false is a wrong address or another
// module's inline hook), the vtable slots against the hooks (on the seats Skyrim Souls RE's ContainerMenuEx owns the menu's slot
// 04 and forwards to 51126, containers.md section 1), the statics, and the self-test of 403520 as the player's handle
// (h403520IsPlayer). {fn: 'attach', err} for a hook that did not install (the others still do). {fn, id, ev, seq, tid, pass or
// out, ...} per call that passes its filter: pass is the ProcessMessages pass the row ran inside (on the pass's thread), out the
// last pass begun when it ran outside one; a pass prints its own row (ms, rows) only when rows ran inside it, with UI's counters
// and the menu's flags when it showed the menu (the push and the counters follow ProcessMessage's kShow, E6). {fn: 'liveness'}
// every SUMMARY_MS: every hook's count before its filter, the window's counts, the drops, ProcessMessage's types, the busiest
// AddMessage names, factory names and Flash methods, the Sleep pulse. A rows dump is pane:objDesc:object:firstExtraList per row
// (pane p when the row's owner handle is *(403520), t when it is the target's), or "same" when unchanged since the last dump.
//
// Filters, so the .log stays small (a 5.6 MB guest exec once killed a seat's agent): ProcessMessage every type but 6
// (kScaleformEvent, counted); 52849 for a watched owner, or while a ContainerMenu stands or an item menu is counted; AddMessage
// for type 8, "ContainerMenu" and types 1 to 4 (the rest counted by name and type); 35855 for "InventoryUpdateData" (the rest
// counted by name); the inventory hooks when a watched reference is this, the source or the destination: CHEST, REFS, the open
// menu's target (resolved from 405962 at its kShow), the player, and with FIGURES any figure (an ACHR at 0xFF000000 and up,
// trap-path-trace.js's test); FxDelegate.Callback for the menu's own movie or the names the menu registers; at most CAP rows a
// second per hook and ALL_CAP a second in all, the rest counted as drops; past BUDGET bytes of rows only the liveness rows print.
//
// Expected on the opener's seat (containers.md R1, by the static read), per foreign store: AddObjectToContainer(chest, item)
// from SkyrimPlatformImpl.dll with no 52849 of its own; CreateImpl (and 35855 when the poster asks the engine's lookup) and
// AddMessage("Top Menu", 8, {the chest's handle, 0}) from the platform; in the next pass ProcessMessage type 8 with match
// 'target', UpdateItemList full, unk50 0 at its leave and the row count one up. Per foreign take: RemoveItem, its own
// 52849(chest, item) with posted 1 and AddMessage type 8 with the object, the dirty count 1 after that pass, then the null and
// 51146. Falsified: an AddMessage type 8 with no ProcessMessage type 8 after it; match 'neither'; unk50 still 1 after a pass
// that ran 51144; 52849 with posted 0 while the menu stands (E19); an AddObjectToContainer after the pass that consumed its null
// (E20). E21's read: a row whose object or first extra list changes between two dumps with no rebuild between them.
// Arm on both seats after the connects, then `wait: 15` before the moves (x-shared-chest-phantom's frame).
// Params through LAB_PARAMS: CHEST (0x371e9, TreasBanditChest), REFS ([]), FIGURES (true), ROWS ('all', 'container' or 'none'),
// ROWS_MAX (160), FRAMES (4; 0 keeps the caller alone), CAP (40), ALL_CAP (150), BUDGET (1500000 bytes), SUMMARY_MS (10000),
// PULSE (true), RAW (false: the raw registers on the InventoryChanges rows). 1.6.1170 only.
'use strict';
function emit(obj) { obj.t = Date.now(); send(obj); const line = JSON.stringify(obj); console.log(line); return line.length; }

const PARAMS = (typeof LAB_PARAMS === 'object' && LAB_PARAMS) ? LAB_PARAMS : {};
// a form id as a number or a hex string ("0x371e9"); a scenario's YAML hex literal arrives as a number
function idParam(v, otherwise) {
  if (v === undefined || v === null) return otherwise;
  const n = typeof v === 'string' ? parseInt(v, 16) : Number(v);
  return isFinite(n) ? n >>> 0 : otherwise;
}
const CHEST = idParam(PARAMS.CHEST, 0x371e9); // TreasBanditChest, x-shared-chest-phantom's chest (containers.md section 4)
const REFS = (Array.isArray(PARAMS.REFS) ? PARAMS.REFS : []).map(function (v) { return idParam(v, 0); }).filter(function (n) { return n !== 0; });
const FIGURES = PARAMS.FIGURES === undefined ? true : !!PARAMS.FIGURES;
const ROWS = PARAMS.ROWS === undefined ? 'all' : String(PARAMS.ROWS);
const ROWS_MAX = PARAMS.ROWS_MAX === undefined ? 160 : (Number(PARAMS.ROWS_MAX) >>> 0);
const FRAMES = PARAMS.FRAMES === undefined ? 4 : (Number(PARAMS.FRAMES) >>> 0);
const CAP = PARAMS.CAP === undefined ? 40 : (Number(PARAMS.CAP) >>> 0);
const ALL_CAP = PARAMS.ALL_CAP === undefined ? 150 : (Number(PARAMS.ALL_CAP) >>> 0);
const BUDGET = PARAMS.BUDGET === undefined ? 1500000 : (Number(PARAMS.BUDGET) >>> 0);
const SUMMARY_MS = PARAMS.SUMMARY_MS === undefined ? 10000 : Math.max(1000, Number(PARAMS.SUMMARY_MS) >>> 0);
const PULSE = PARAMS.PULSE === undefined ? true : !!PARAMS.PULSE;
const RAW = !!PARAMS.RAW;

// RVAs by lab/addr.py on addrlib/versionlib-1-6-1170-0.bin (2026-11-03), the id beside each. first: the function's first eight
// bytes in Ghidra's /SkyrimSE-1.6.1170.0.exe.unpacked.exe (read_bytes, 2026-11-03), checked against the live bytes at attach
const OFFSETS = {
  '1.6.1170.0': {
    hooks: {
      processMessage: { id: 51126, rva: 0x8f9fb0, first: '40 55 56 57 41 54 41 55' },
      updateItemList: { id: 51144, rva: 0x8fcac0, first: '40 55 53 56 57 41 54 41' },
      dirtyRebuild: { id: 51146, rva: 0x8fd190, first: '40 57 48 83 ec 40 48 c7' },
      sendInventoryUpdate: { id: 52849, rva: 0x976a80, first: '40 56 57 41 56 48 83 ec' },
      addMessage: { id: 13631, rva: 0x1af260, first: '40 56 57 41 56 48 83 ec' },
      factoryLookup: { id: 35855, rva: 0x61bba0, first: '48 89 5c 24 08 57 48 83' },
      createImpl: { id: 52803, rva: 0x975cb0, first: '48 83 ec 28 83 3d 15 b5' },
      removeItem: { id: 19689, rva: 0x2e1750, first: '48 89 5c 24 18 55 56 57' },
      actorRemoveItem: { id: 37797, rva: 0x692800, first: '4c 8b dc 49 89 5b 10 49' },
      addObject: { id: 19708, rva: 0x2e23d0, first: '40 55 56 57 41 54 41 55' },
      actorAddObject: { id: 37525, rva: 0x678f90, first: '44 89 4c 24 20 55 56 57' },
      changesRemove: { id: 16059, rva: 0x228180, first: '4c 89 4c 24 20 4c 89 44' },
      changesAdd: { id: 16053, rva: 0x226a20, first: '4c 8b dc 4d 89 43 18 49' },
      listUpdate: { id: 51031, rva: 0x8efb90, first: '40 57 48 83 ec 30 48 c7' },
      selectedItem: { id: 51017, rva: 0x8ef4f0, first: '40 53 48 83 ec 50 48 c7' },
      fxCallback: { id: 82641, rva: 0xfbea00, first: '48 8b c4 55 41 56 41 57' },
      processMessages: { id: 82082, rva: 0xfa3fa0, first: '48 89 4c 24 08 55 53 56' },
    },
    targetHandle: 0x31ace80, // 405962 ContainerMenu::GetTargetRefHandle's static, a RefHandle (src/RE/C/ContainerMenu.cpp:13)
    handle403520: 0x31874f4, // 403520 src/RE/B/BarterMenu.cpp:7's static; the player's RefHandle by containers.md E10 (HYPOTHESIS)
    takeAllByte: 0x31af788, // 406594 the take-all suppress byte 52849 reads (re-inventory-update-factory.md Q3, HYPOTHESIS)
    nullHandle: 0x20f699c, // 400312 the null handle 52803 and 19689 write (Ghidra, 2026-11-03; HYPOTHESIS name)
    uiSingleton: 0x20f6a00, // 400327 Offset::UI::Singleton (Offsets.h:557), a UI** (src/RE/U/UI.cpp:7-11)
    playerSingleton: 0x31874f8, // 403521 Offset::PlayerCharacter::Singleton (Offsets.h:451)
    lookupRef: 0x179710, // 12332 LookupReferenceByHandle(const RefHandle&, NiPointer<TESObjectREFR>&) (Offsets.h:582; M/Misc.h:25)
    vtables: {
      containerMenu: 0x18f32f0, // 215061 VTABLE_ContainerMenu[0] (Offsets_VTABLE.h:4008)
      refr: 0x17ae180, // 190259 VTABLE_TESObjectREFR[0] (Offsets_VTABLE.h:649)
      actor: 0x189d870, // 207511 VTABLE_Actor[0] (Offsets_VTABLE.h:2142)
      character: 0x18a5558, // 207886 VTABLE_Character[0] (Offsets_VTABLE.h:2215)
      playerCharacter: 0x18ab9c0, // 208040 VTABLE_PlayerCharacter[0] (Offsets_VTABLE.h:2231)
      fxDelegate: 0x1a04418, // 242193 VTABLE_FxDelegate[0] (Offsets_VTABLE.h:6150)
      inventoryUpdateData: 0x1905c18, // 216346 VTABLE_InventoryUpdateData[0] (Offsets_VTABLE.h:4149)
    },
  },
};
// a slot read at attach against the hook it should hold; Ghidra's image had every one equal on 2026-11-03
const SLOTS = [
  ['containerMenu', 0x04, 'processMessage'], // I/IMenu.h:70
  ['refr', 0x56, 'removeItem'], ['refr', 0x5a, 'addObject'], // T/TESObjectREFR.h:282, :286
  ['actor', 0x56, 'actorRemoveItem'], ['actor', 0x5a, 'actorAddObject'],
  ['character', 0x56, 'actorRemoveItem'], ['character', 0x5a, 'actorAddObject'],
  ['playerCharacter', 0x56, 'actorRemoveItem'], ['playerCharacter', 0x5a, 'actorAddObject'],
  ['fxDelegate', 0x01, 'fxCallback'], // F/FxDelegate.h:41
];
// struct offsets, CommonLibSSE-NG at the pin, paths under include/RE/
const F = {
  formId: 0x14, // T/TESForm.h:354
  formType: 0x1a, // T/TESForm.h:356
  msgMenu: 0x00, // U/UIMessage.h:30, a BSFixedString whose first field is its C string (B/BSFixedString.h:232)
  msgType: 0x08, // U/UIMessage.h:31
  msgData: 0x10, // U/UIMessage.h:33
  invRef: 0x10, // I/InventoryUpdateData.h:17, a RefHandle
  invObj: 0x18, // I/InventoryUpdateData.h:19
  userEvent: 0x18, // B/BSUIMessageData.h:27 fixedStr, type 7's data (U/UIMessage.h:18)
  menuMovie: 0x10, // I/IMenu.h:106 uiMovie, a GPtr whose first field is the pointer (G/GPtr.h:199)
  menuFlags: 0x1c, // I/IMenu.h:110
  dirtySize: 0x70, // C/ContainerMenu.h:37 unk60 at 30 of RUNTIME_DATA, at this+0x30 (:72); BSTArray's size at 0x10 (B/BSTArray.h:140-143, :47)
  itemList: 0x48, // C/ContainerMenu.h:34, 18 of RUNTIME_DATA (:72)
  listItems: 0x38, // I/ItemList.h:35, a BSTArray<Item*> whose data pointer is first (B/BSTArray.h:140)
  listCount: 0x48, // I/ItemList.h:35 plus BSTArray's size at 0x10
  listUnk50: 0x50, // I/ItemList.h:36
  rowObjDesc: 0x08, // I/ItemList.h:20 (an Item begins with its StandardItemData), S/StandardItemData.h:22
  rowOwner: 0x10, // S/StandardItemData.h:23, a RefHandle
  entryObject: 0x00, // I/InventoryEntryData.h:59
  entryLists: 0x08, // I/InventoryEntryData.h:60, a BSSimpleList whose head node's item is first (B/BSTList.h:77, :428)
  changesOwner: 0x08, // I/InventoryChanges.h:64
  uiPauses: 0x160, // U/UI.h:129 numPausesGame
  uiItemMenus: 0x164, // U/UI.h:130 numItemMenus
  uiDisablePause: 0x168, // U/UI.h:131 numDisablePauseMenu
  uiModal: 0x17c, // U/UI.h:136 modal
  gfxType: 0x08, // G/GFxValue.h:433
  gfxValue: 0x10, // G/GFxValue.h:435
  gfxSize: 0x18, // G/GFxValue.h:437
};
const ON_STACK = 0x40; // I/IMenu.h:23 kOnStack
const ACHR = 0x3e; // F/FormTypes.h:202
const FIGURE_MIN = 0xff000000; // a figure is a dynamic ACHR (trap-path-trace.js's test)
// G/GFxValue.h:97-112 (kBoolean 2, kNumber 3, kString 4, kManagedBit, kValueMask, kTypeMask); src/RE/G/GFxValue.cpp:656-659,
// :738 (a managed string's value points at its pointer), :995-998
const GFX = { boolean: 2, number: 3, string: 4, managed: 0x40, valueMask: 0x0f, typeMask: 0x8f };
// the Flash callbacks ContainerMenu::Accept (51128) registers, by re-container-menu-refresh.md Q2 (HYPOTHESIS)
const CALLBACKS = ['PlaySound', 'UpdateItem3D', 'RequestItemCardInfo', 'CloseMenu', 'ItemTransfer', 'EquipItem', 'QuantitySliderOpen',
  'TakeAllItems', 'ToggleFavorite', 'DisabledItemSelect', 'StartMouseRotation', 'StopMouseRotation', 'ZoomItemModel', 'CheckForMouseEquip'];

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

function hex(n) { return '0x' + (n >>> 0).toString(16); }
function h32(n) { return n < 0 ? '?' : hex(n); }
function u8(p, o) { try { return p.add(o).readU8(); } catch (e) { return -1; } }
function u32(p, o) { try { return p.add(o).readU32(); } catch (e) { return -1; } }
function s32(p, o) { try { return p.add(o).readS32(); } catch (e) { return null; } }
function f64(p, o) { try { return p.add(o).readDouble(); } catch (e) { return null; } }
function ptrAt(p, o) { try { return p.add(o).readPointer(); } catch (e) { return null; } }
function pstr(p) { return p === null ? '?' : p.toString(); }
function cstr(p) {
  if (p === null) return '?';
  if (p.isNull()) return '';
  try { return p.readCString(64); } catch (e) { return '?'; }
}
// a form's id and type: {id: 0} for a null pointer, null when it does not read
function formOf(p) {
  if (p === null) return null;
  if (p.isNull()) return { id: 0, type: 0 };
  try { return { id: p.add(F.formId).readU32(), type: p.add(F.formType).readU8() }; } catch (e) { return null; }
}
function fid(f) { return f === null ? '?' : hex(f.id); }
function describe(p) {
  if (p === null) return '?';
  if (p.isNull()) return '0x0';
  const m = Process.findModuleByAddress(p);
  return m ? m.name + '+0x' + p.sub(m.base).toString(16) : p.toString();
}
function frames(context) {
  if (FRAMES === 0) return undefined;
  try { return Thread.backtrace(context, Backtracer.ACCURATE).slice(0, FRAMES).map(describe); } catch (e) { return ['backtrace failed: ' + e]; }
}
function bytesAt(p, n) {
  try {
    return Array.from(new Uint8Array(p.readByteArray(n))).map(function (b) { return ('0' + b.toString(16)).slice(-2); }).join(' ');
  } catch (e) { return 'unreadable'; }
}

const exe = Process.getModuleByName('SkyrimSE.exe');
const version = fileVersion(exe.path);
const off = OFFSETS[version];
if (off === undefined) {
  emit({ error: 'no offsets for this runtime', version: version });
} else {
  const at = function (rva) { return exe.base.add(rva); };
  const lookup = new NativeFunction(at(off.lookupRef), 'bool', ['pointer', 'pointer'], 'win64');
  // a handle's reference through LookupReferenceByHandle; each lookup keeps one reference count, as prop-grab.js's and
  // rune-tier-trace.js's do, so it runs once at the ready row and once per menu open
  const refOfHandle = function (handle) {
    if (handle <= 0) return null;
    try {
      const h = Memory.alloc(4);
      h.writeU32(handle);
      const out = Memory.alloc(Process.pointerSize);
      out.writePointer(NULL);
      if (!lookup(h, out)) return null;
      const r = out.readPointer();
      return r.isNull() ? null : r;
    } catch (e) { return null; }
  };

  let playerId = 0x14; // the player's form id (trap-path-trace.js's PLAYER_ID) until the ready row reads it from 403521
  let targetId = 0; // the open menu's target, resolved from 405962 at its kShow
  let lastMenu = null; // the ContainerMenu the last ProcessMessage ran on, cleared when its kHide or kForceHide is taken
  const watched = function (f) {
    if (f === null || f.id === 0) return false;
    if (f.id === CHEST || f.id === playerId || f.id === targetId || REFS.indexOf(f.id) >= 0) return true;
    return FIGURES && f.type === ACHR && f.id >= FIGURE_MIN;
  };

  const counts = {};
  let windowCounts = {};
  let tallies = { types: {}, addMessage: {}, factory: {}, fx: {} };
  const drops = {};
  const capSecond = {};
  const capUsed = {};
  const tick = function (key) { counts[key] = (counts[key] || 0) + 1; windowCounts[key] = (windowCounts[key] || 0) + 1; };
  const tally = function (map, key) { map[key] = (map[key] || 0) + 1; };
  // at most CAP rows a second per hook and ALL_CAP in all; the rest are drops, reported in the liveness row
  const allow = function (key) {
    const s = Math.floor(Date.now() / 1000);
    if (capSecond[key] !== s) { capSecond[key] = s; capUsed[key] = 0; }
    if (capSecond.all !== s) { capSecond.all = s; capUsed.all = 0; }
    if (capUsed[key] < CAP && capUsed.all < ALL_CAP) { capUsed[key] += 1; capUsed.all += 1; return true; }
    drops[key] = (drops[key] || 0) + 1;
    return false;
  };
  const busiest = function (map, n) {
    const out = {};
    Object.keys(map).sort(function (a, b) { return map[b] - map[a]; }).slice(0, n).forEach(function (k) { out[k] = map[k]; });
    return out;
  };

  let seq = 0;
  let pass = 0;
  let passDepth = 0;
  let passTid = -1;
  let passBegan = 0;
  let passRows = 0;
  let passShown = null;
  let spent = 0; // bytes of rows printed, against BUDGET
  const row = function (r, tid) {
    r.seq = ++seq;
    if (spent >= BUDGET) { drops.budget = (drops.budget || 0) + 1; return r.seq; }
    r.tid = tid;
    if (passDepth > 0 && tid === passTid) { r.pass = pass; passRows += 1; } else { r.out = pass; }
    spent += emit(r);
    if (spent >= BUDGET) emit({ fn: 'budget', spent: spent, budget: BUDGET, seq: seq, note: 'rows stop here; the liveness rows go on' });
    return r.seq;
  };

  const handles = function () { return { target: u32(at(off.targetHandle), 0), h403520: u32(at(off.handle403520), 0) }; };
  const pane = function (owner, hs) { return owner === hs.h403520 ? 'p' : owner === hs.target ? 't' : h32(owner); };
  const uiNow = function () {
    const ui = ptrAt(at(off.uiSingleton), 0);
    if (ui === null || ui.isNull()) return null;
    return { pauses: u32(ui, F.uiPauses), itemMenus: u32(ui, F.uiItemMenus), disablePause: u32(ui, F.uiDisablePause), modal: u8(ui, F.uiModal) };
  };
  const menuFacts = function (menu) {
    const flags = u32(menu, F.menuFlags);
    return { flags: h32(flags), onStack: flags < 0 ? null : (flags & ON_STACK) !== 0 };
  };
  const listOf = function (menu) { return ptrAt(menu, F.itemList); };
  const menuState = function (menu) {
    const out = { dirty: u32(menu, F.dirtySize) };
    const list = listOf(menu);
    if (list === null || list.isNull()) { out.list = pstr(list); return out; }
    out.rows = u32(list, F.listCount);
    out.unk50 = u8(list, F.listUnk50);
    return out;
  };
  // an entry's first extra list: the head node's item of its BSSimpleList, 0x0 when the entry has no list
  const firstList = function (desc) {
    const lists = ptrAt(desc, F.entryLists);
    if (lists === null) return '?';
    return lists.isNull() ? '0x0' : pstr(ptrAt(lists, 0));
  };
  const lastDump = {};
  const dumpRows = function (menu) {
    if (ROWS === 'none') return undefined;
    const list = listOf(menu);
    if (list === null || list.isNull()) return undefined;
    const n = u32(list, F.listCount);
    const data = ptrAt(list, F.listItems);
    if (n < 0 || data === null || (n > 0 && data.isNull())) return ['unreadable'];
    const hs = handles();
    const out = [];
    for (let i = 0; i < n && i < ROWS_MAX; i++) {
      const item = ptrAt(data, i * Process.pointerSize);
      if (item === null || item.isNull()) { out.push(i + ':' + pstr(item)); continue; }
      const side = pane(u32(item, F.rowOwner), hs);
      if (ROWS === 'container' && side === 'p') continue;
      const desc = ptrAt(item, F.rowObjDesc);
      if (desc === null || desc.isNull()) { out.push(side + ':' + pstr(desc)); continue; }
      out.push(side + ':' + desc.toString() + ':' + fid(formOf(ptrAt(desc, F.entryObject))) + ':' + firstList(desc));
    }
    if (n > ROWS_MAX) out.push('cut at ' + ROWS_MAX);
    const text = out.join(' ');
    const key = menu.toString();
    if (lastDump[key] === text) return 'same';
    lastDump[key] = text;
    return out;
  };
  // up to four of a Flash call's arguments: booleans, numbers and strings, the type for the rest
  const gfxArgs = function (argv, argc) {
    const out = [];
    if (argv === null || argv.isNull() || argc <= 0) return out;
    for (let i = 0; i < argc && i < 4; i++) {
      const v = argv.add(i * F.gfxSize);
      const type = u32(v, F.gfxType);
      const kind = type & GFX.valueMask;
      if (type < 0) out.push('?');
      else if (kind === GFX.boolean) out.push(u8(v, F.gfxValue) === 1);
      else if (kind === GFX.number) out.push(f64(v, F.gfxValue));
      else if (kind === GFX.string) {
        const s = ptrAt(v, F.gfxValue);
        out.push(cstr(s !== null && (type & GFX.managed) !== 0 ? ptrAt(s, 0) : s));
      } else out.push('type ' + hex(type & GFX.typeMask));
    }
    return out;
  };

  const resolved = {};
  const failed = [];
  const errored = {};
  const fail = function (name, e) {
    if (errored[name]) return;
    errored[name] = true;
    emit({ fn: 'error', hook: name, err: String(e) });
  };
  // every hook counts every call before its filter; a hook's own failure prints once and the others go on
  const install = function (name, enter, leave) {
    const h = off.hooks[name];
    const key = String(h.id);
    counts[key] = 0;
    const target = at(h.rva);
    const live = bytesAt(target, 8);
    resolved[name] = { id: h.id, rva: hex(h.rva), at: target.toString(), bytes: live, same: live === h.first };
    const callbacks = {
      onEnter: function (args) {
        tick(key);
        try { enter.call(this, args); } catch (e) { fail(name, e); }
      },
    };
    if (leave) callbacks.onLeave = function (retval) { try { leave.call(this, retval); } catch (e) { fail(name, e); } };
    try {
      Interceptor.attach(target, callbacks);
    } catch (e) {
      resolved[name].err = String(e);
      failed.push(name);
      emit({ fn: 'attach', hook: name, id: h.id, at: target.toString(), err: String(e) });
    }
  };

  install('processMessage', function (args) {
    const menu = args[0];
    const msg = args[1];
    const type = u32(msg, F.msgType);
    tally(tallies.types, String(type));
    if (type === 6 || !allow('51126')) return; // 6 kScaleformEvent (U/UIMessage.h:17), counted only
    lastMenu = menu;
    const r = { fn: 'ProcessMessage', id: 51126, ev: 'enter', type: type, menu: menu.toString(), to: cstr(ptrAt(msg, F.msgMenu)) };
    const data = ptrAt(msg, F.msgData);
    if (type === 8) {
      r.data = pstr(data);
      if (data !== null && !data.isNull()) {
        const ref = u32(data, F.invRef);
        const hs = handles();
        r.ref = h32(ref);
        r.obj = fid(formOf(ptrAt(data, F.invObj)));
        r.target = h32(hs.target);
        r.h403520 = h32(hs.h403520);
        r.match = ref === hs.target ? 'target' : ref === hs.h403520 ? '403520' : 'neither';
      }
    } else if (type === 7 && data !== null && !data.isNull()) {
      r.userEvent = cstr(ptrAt(data, F.userEvent));
    }
    if (type !== 1) Object.assign(r, menuState(menu)); // kShow builds the list
    row(r, this.threadId);
    this.keep = true;
    this.menu = menu;
    this.type = type;
  }, function (retval) {
    if (!this.keep) return;
    const type = this.type;
    const result = retval.toInt32(); // UI_MESSAGE_RESULTS, I/IMenu.h:47-52: kHandled 0, kIgnore 1, kPassOn 2
    const r = { fn: 'ProcessMessage', id: 51126, ev: 'leave', type: type, result: result };
    if (type === 3 || type === 4) {
      if (result !== 1) {
        if (lastMenu !== null && lastMenu.equals(this.menu)) lastMenu = null;
        targetId = 0;
      }
    } else {
      Object.assign(r, menuState(this.menu));
    }
    if (type === 1) {
      Object.assign(r, menuFacts(this.menu));
      r.ui = uiNow();
      const target = refOfHandle(u32(at(off.targetHandle), 0));
      const tf = target === null ? null : formOf(target);
      targetId = tf === null ? 0 : tf.id;
      r.targetRef = hex(targetId);
      if (passDepth > 0 && this.threadId === passTid) passShown = this.menu;
    }
    if (type === 8) {
      const d = dumpRows(this.menu);
      if (d !== undefined) r.dump = d;
    }
    row(r, this.threadId);
  });

  install('updateItemList', function (args) {
    if (!allow('51144')) return;
    const menu = args[0];
    const s = menuState(menu);
    const mode = s.dirty === 0 ? 'full' : s.dirty > 0 ? 'incremental' : '?';
    row(Object.assign({ fn: 'UpdateItemList HYPOTHESIS', id: 51144, ev: 'enter', mode: mode, isMenu: lastMenu !== null && menu.equals(lastMenu) }, s), this.threadId);
    this.keep = true;
    this.menu = menu;
  }, function () {
    if (!this.keep) return;
    const r = Object.assign({ fn: 'UpdateItemList HYPOTHESIS', id: 51144, ev: 'leave' }, menuState(this.menu));
    const d = dumpRows(this.menu);
    if (d !== undefined) r.dump = d;
    row(r, this.threadId);
  });

  install('dirtyRebuild', function (args) {
    if (!allow('51146')) return;
    row(Object.assign({ fn: 'dirtyRebuild HYPOTHESIS', id: 51146, ev: 'enter' }, menuState(args[0])), this.threadId);
    this.keep = true;
    this.menu = args[0];
  }, function () {
    if (!this.keep) return;
    row(Object.assign({ fn: 'dirtyRebuild HYPOTHESIS', id: 51146, ev: 'leave' }, menuState(this.menu)), this.threadId);
  });

  // posted: the AddMessage calls on this thread inside the call; gate: re-inventory-update-factory.md Q3's three conditions
  const addsByThread = {};
  install('sendInventoryUpdate', function (args) {
    const owner = formOf(args[0]);
    const ui = uiNow();
    if (!watched(owner) && lastMenu === null && !(ui !== null && ui.itemMenus > 0)) return;
    if (!allow('52849')) return;
    const b = u8(at(off.takeAllByte), 0);
    const r = {
      fn: 'SendInventoryUpdateMessage', id: 52849, ev: 'enter', owner: fid(owner), obj: fid(formOf(args[1])),
      caller: describe(this.returnAddress), ui: ui, b406594: b, gate: ui !== null && ui.itemMenus > 0 && b === 0 && !args[0].isNull(),
    };
    const fr = frames(this.context);
    if (fr !== undefined) r.frames = fr;
    this.enterSeq = row(r, this.threadId);
    this.adds = addsByThread[this.threadId] || 0;
    this.keep = true;
  }, function () {
    if (!this.keep) return;
    row({ fn: 'SendInventoryUpdateMessage', id: 52849, ev: 'leave', enter: this.enterSeq, posted: (addsByThread[this.threadId] || 0) - this.adds }, this.threadId);
  });

  install('addMessage', function (args) {
    const tid = this.threadId;
    addsByThread[tid] = (addsByThread[tid] || 0) + 1;
    const name = cstr(ptrAt(args[1], 0)); // the BSFixedString's first field is its C string (B/BSFixedString.h:232)
    const type = args[2].toInt32();
    tally(tallies.addMessage, name + '/' + type);
    if (type !== 8 && name !== 'ContainerMenu' && !(type >= 1 && type <= 4)) return;
    if (!allow('13631')) return;
    const data = args[3];
    const r = { fn: 'AddMessage', id: 13631, menu: name, type: type, data: data.toString(), caller: describe(this.returnAddress) };
    if (type === 8 && !data.isNull()) {
      r.ref = h32(u32(data, F.invRef));
      r.obj = fid(formOf(ptrAt(data, F.invObj)));
      const fr = frames(this.context);
      if (fr !== undefined) r.frames = fr;
    }
    row(r, tid);
  });

  install('factoryLookup', function (args) {
    this.name = cstr(ptrAt(args[0], 0));
    tally(tallies.factory, this.name);
    this.keep = this.name === 'InventoryUpdateData';
    this.caller = this.returnAddress;
  }, function (retval) {
    if (!this.keep || !allow('35855')) return;
    row({ fn: 'factoryLookup HYPOTHESIS', id: 35855, name: this.name, ret: retval.toString(), caller: describe(this.caller) }, this.threadId);
  });

  const vtInventoryUpdateData = at(off.vtables.inventoryUpdateData);
  install('createImpl', function () {
    this.keep = true;
    this.caller = this.returnAddress;
  }, function (retval) {
    if (!this.keep || !allow('52803')) return;
    const vt = retval.isNull() ? null : ptrAt(retval, 0);
    row({
      fn: 'CreateImpl HYPOTHESIS', id: 52803, ret: retval.toString(), vtable: describe(vt),
      isInventoryUpdateData: vt !== null && vt.equals(vtInventoryUpdateData), ref: retval.isNull() ? null : h32(u32(retval, F.invRef)),
      caller: describe(this.caller),
    }, this.threadId);
  });

  const removeHook = function (name, label) {
    const id = off.hooks[name].id;
    install(name, function (args) {
      const self = formOf(args[0]);
      const sp = this.context.rsp;
      const moveTo = formOf(ptrAt(sp, 0x38));
      if (!watched(self) && !watched(moveTo)) return;
      if (!allow(String(id))) return;
      const r = {
        fn: label, id: id, self: fid(self), item: fid(formOf(args[2])), count: args[3].toInt32(), reason: u32(sp, 0x28),
        extra: pstr(ptrAt(sp, 0x30)), moveTo: fid(moveTo), caller: describe(this.returnAddress),
      };
      const fr = frames(this.context);
      if (fr !== undefined) r.frames = fr;
      row(r, this.threadId);
    });
  };
  removeHook('removeItem', 'RemoveItem');
  removeHook('actorRemoveItem', 'Actor.RemoveItem');

  const addHook = function (name, label) {
    const id = off.hooks[name].id;
    install(name, function (args) {
      const self = formOf(args[0]);
      const from = formOf(ptrAt(this.context.rsp, 0x28));
      if (!watched(self) && !watched(from)) return;
      if (!allow(String(id))) return;
      const r = {
        fn: label, id: id, self: fid(self), obj: fid(formOf(args[1])), extra: args[2].toString(), count: args[3].toInt32(),
        from: fid(from), caller: describe(this.returnAddress),
      };
      const fr = frames(this.context);
      if (fr !== undefined) r.frames = fr;
      row(r, this.threadId);
    });
  };
  addHook('addObject', 'AddObjectToContainer');
  addHook('actorAddObject', 'Actor.AddObjectToContainer');

  install('changesRemove', function (args) {
    const owner = formOf(ptrAt(args[0], F.changesOwner));
    if (!watched(owner) || !allow('16059')) return;
    const sp = this.context.rsp;
    const r = {
      fn: 'InventoryChanges.remove HYPOTHESIS', id: 16059, owner: fid(owner), ref: fid(formOf(args[2])), item: fid(formOf(args[3])),
      count: s32(sp, 0x28), reason: u32(sp, 0x30), caller: describe(this.returnAddress),
    };
    if (RAW) r.raw = [String(args[0]), String(args[1]), String(args[2]), String(args[3])];
    row(r, this.threadId);
  });
  install('changesAdd', function (args) {
    const owner = formOf(ptrAt(args[0], F.changesOwner));
    if (!watched(owner) || !allow('16053')) return;
    const r = {
      fn: 'InventoryChanges.add HYPOTHESIS', id: 16053, owner: fid(owner), obj: fid(formOf(args[1])), extra: args[2].toString(),
      count: args[3].toInt32(), from: fid(formOf(ptrAt(this.context.rsp, 0x28))), caller: describe(this.returnAddress),
    };
    if (RAW) r.raw = [String(args[0]), String(args[1]), String(args[2]), String(args[3])];
    row(r, this.threadId);
  });

  install('listUpdate', function (args) {
    if (!allow('51031')) return;
    row({
      fn: 'ItemList.Update', id: 51031, ev: 'enter', list: args[0].toString(), owner: fid(formOf(args[1])), unk50: u8(args[0], F.listUnk50),
      caller: describe(this.returnAddress),
    }, this.threadId);
    this.keep = true;
    this.list = args[0];
  }, function () {
    if (!this.keep) return;
    row({ fn: 'ItemList.Update', id: 51031, ev: 'leave', unk50: u8(this.list, F.listUnk50) }, this.threadId);
  });

  install('selectedItem', function (args) {
    this.keep = true;
    this.list = args[0];
    this.unk50 = u8(args[0], F.listUnk50);
    this.caller = this.returnAddress;
  }, function (retval) {
    if (!this.keep || !allow('51017')) return;
    const r = { fn: 'GetSelectedItem HYPOTHESIS', id: 51017, list: this.list.toString(), unk50: this.unk50, ret: retval.toString(), caller: describe(this.caller) };
    if (lastMenu !== null) {
      const l = listOf(lastMenu);
      r.isMenuList = l !== null && l.equals(this.list);
    }
    if (!retval.isNull()) {
      r.pane = pane(u32(retval, F.rowOwner), handles());
      const desc = ptrAt(retval, F.rowObjDesc);
      r.objDesc = pstr(desc);
      if (desc !== null && !desc.isNull()) {
        r.obj = fid(formOf(ptrAt(desc, F.entryObject)));
        r.first = firstList(desc);
      }
    }
    row(r, this.threadId);
  });

  install('fxCallback', function (args) {
    const method = cstr(args[2]);
    tally(tallies.fx, method);
    let own = false;
    if (lastMenu !== null) {
      const movie = ptrAt(lastMenu, F.menuMovie);
      own = movie !== null && movie.equals(args[1]);
    }
    if (!own && CALLBACKS.indexOf(method) < 0) return;
    if (!allow('82641')) return;
    const argc = u32(this.context.rsp, 0x28);
    row({ fn: 'FxDelegate.Callback', id: 82641, method: method, own: own, argc: argc, args: gfxArgs(args[3], argc), caller: describe(this.returnAddress) }, this.threadId);
  });

  let uiIsThis = null;
  install('processMessages', function (args) {
    if (passDepth > 0 && this.threadId !== passTid) return; // a pass on another thread is not this one's
    if (passDepth === 0) {
      pass += 1;
      passTid = this.threadId;
      passBegan = Date.now();
      passRows = 0;
      passShown = null;
      if (uiIsThis === null) {
        const ui = ptrAt(at(off.uiSingleton), 0);
        uiIsThis = ui !== null && ui.equals(args[0]);
      }
    }
    passDepth += 1;
    this.keep = true;
  }, function () {
    if (!this.keep) return;
    passDepth -= 1;
    if (passDepth > 0 || passRows === 0 || spent >= BUDGET) return;
    const r = { fn: 'ProcessMessages HYPOTHESIS', id: 82082, ev: 'leave', pass: pass, tid: passTid, began: passBegan, ms: Date.now() - passBegan, rows: passRows };
    if (passShown !== null) {
      Object.assign(r, menuFacts(passShown));
      r.ui = uiNow();
    }
    r.seq = ++seq;
    spent += emit(r);
  });

  if (PULSE) {
    try {
      const sleep = Process.getModuleByName('kernel32.dll').getExportByName('Sleep');
      counts.sleep = 0;
      Interceptor.attach(sleep, { onEnter: function () { tick('sleep'); } });
      resolved.sleep = { at: describe(sleep) };
    } catch (e) {
      failed.push('sleep');
      emit({ fn: 'attach', hook: 'sleep', err: String(e) });
    }
  }

  const slots = {};
  SLOTS.forEach(function (s) {
    const key = s[0] + '[' + hex(s[1]) + ']';
    try {
      const p = at(off.vtables[s[0]]).add(s[1] * Process.pointerSize).readPointer();
      slots[key] = { at: describe(p), hook: s[2], same: p.equals(at(off.hooks[s[2]].rva)) };
    } catch (e) { slots[key] = { err: String(e) }; }
  });
  const statics = {};
  try {
    const hs = handles();
    statics.target = h32(hs.target);
    statics.h403520 = h32(hs.h403520);
    statics.nullHandle = h32(u32(at(off.nullHandle), 0));
    statics.b406594 = u8(at(off.takeAllByte), 0);
    statics.ui = uiNow();
    const player = ptrAt(at(off.playerSingleton), 0);
    const pf = player === null || player.isNull() ? null : formOf(player);
    if (pf !== null && pf.id !== 0) playerId = pf.id;
    statics.player = fid(pf);
    // the 403520 self-test: the handle there resolved to a reference, against the player singleton
    const byHandle = refOfHandle(hs.h403520);
    statics.h403520IsPlayer = byHandle !== null && player !== null && byHandle.equals(player);
    const target = refOfHandle(hs.target);
    const tf = target === null ? null : formOf(target);
    if (tf !== null && tf.id !== 0) targetId = tf.id;
    statics.targetRef = hex(targetId);
  } catch (e) { statics.err = String(e); }
  emit({
    ready: true, version: version, pid: Process.id, base: exe.base.toString(), playerId: hex(playerId),
    params: {
      CHEST: hex(CHEST), REFS: REFS.map(function (n) { return hex(n); }), FIGURES: FIGURES, ROWS: ROWS, ROWS_MAX: ROWS_MAX, FRAMES: FRAMES,
      CAP: CAP, ALL_CAP: ALL_CAP, BUDGET: BUDGET, SUMMARY_MS: SUMMARY_MS, PULSE: PULSE, RAW: RAW,
    },
    hooks: resolved, failed: failed, slots: slots, statics: statics,
  });

  setInterval(function () {
    emit({
      fn: 'liveness', pid: Process.id, seq: seq, pass: pass, spent: spent, counts: counts, window: windowCounts, drops: drops, types: tallies.types,
      addMessage: busiest(tallies.addMessage, 8), factory: busiest(tallies.factory, 6), fx: busiest(tallies.fx, 6),
      menu: lastMenu === null ? null : lastMenu.toString(), targetRef: hex(targetId), uiIsThis: uiIsThis,
    });
    windowCounts = {};
    tallies = { types: {}, addMessage: {}, factory: {}, fx: {} };
  }, SUMMARY_MS);
}
