// corpse-lay-heap-pool.js v1.1 DRAFT (thuum, 2026-11-12; never run). v1.1: v1 84b678bb's fresh review,
// lab/.cache/drafts/reanimate/review-heap-pool.md (sha1 c5a5d688, READY with nits), its seven items applied as written (ADR-064
// amendment A): the holds and the lay tally kept for the lay windows (1), the reallocation's leave a count alone (2), a new
// block's record cleared of the slot's last freer (3), the verdict narrowed (4), Character's slot 0xAB printed (5), the cites
// and the TESObjectREFR slot test (6), maxSize 0x20 (7). Item 1's two statements sit right after `const what`, which they name.
// One line beyond the text: the default TTL is 1200 s, over x-reanimate-look v1.1's timeout_s 1020 (a hand run takes no params).
// v1's header follows, its Run and Expected lines rewritten.
// corpse-lay-heap-pool.js v1 DRAFT (thuum, 2026-11-12; corpse-lay-heap.js on thuum main, sha1 64b6ceae, is its base and
// house shape). ONE question (ADR-064 rule B): on a watcher seat, what lists one block twice in MemoryManager's small-block pool, so
// that a later pop hands out an address inside SkyrimSE.exe? That is c2's two crashes, 20261112-085636 and 20261112-102238, read in
// lab/.cache/drafts/reanimate/read-u0-085636.md section 7 (the memo below). Two suspects, each HYPOTHESIS:
//   (a) the live word's Resurrect (37321) landing inside c2's own unfinished raise of its copy (34750, then 38820), and
//   (b) the post-death lay (the change-form apply 35568) and its reconcile, which unequips a worn list and removes it (the fork's
//       FateApi.cpp ReconcileInventoryOnGameThread at 21ea849a, :355 to :361), while an equip the stream queued on the copy may
//       still hold that list (the memory skyrim-equip-queue-use-after-free names the shape).
// On the stage build (fork m4-reanimate-claim-2 21ea849a; its head 0065ae6e changes only unit/NpcFateTest.cpp) D4 B refuses c2's
// own raise; the rules that read a run are under Expected below.
//
// ATTACH ONLY, READ ONLY: no Interceptor.replace, no engine call, no write to engine memory. The script reads engine memory and
// writes only its own (the CModule's tables). Native filters (CLAUDE.md rule 9's spirit): every hot hook is a CModule listener
// that crosses into JavaScript only on an anomaly or a watched actor. Rows are capped per kind. At TTL every hook detaches.
//
// Address Library 1.6.1170 ids, every offset by `just addr <id>` (lab/addr.py over addrlib/, 428461 entries) on 2026-11-12, never
// from memory (rule 1). A role is CommonLibSSE-NG b93280e8's where cited, a static read of the shipped exe where marked "image"
// (lab/.cache/game/exe-1.6.1170, sha256 80c1ea73, the bytes REA imports; Apple LLVM objdump and the vtables' locators), else REA's
// (the memo, section 7.2; HYPOTHESIS by rule 2):
//    68115  0xcc40c0   MemoryManager::Allocate(this, size, alignment, aligned)   MemoryManager.h:36-41; image: sizes up to 0x200 go to
//                      the small-block allocator at this+0x430 (`cmp rdi, 0x200`), and a size of 0 returns a static .data address
//    68116  0xcc4310   MemoryManager::Reallocate(this, old, size, ...)           MemoryManager.h:57-62; image: it calls 68115 and
//                      68117 itself (0x140cc434b, 0x140cc44dd), whose hooks book both ends, so its leave only counts the call
//    68117  0xcc4510   MemoryManager::Deallocate(this, block, aligned)           MemoryManager.h:43-48
//    36098  0x11bd80   the sized delete (block, size): image, it calls 68117(the manager at 0x1435f11e0, block, 0)  label only
//    35568  0x603700   the change-form apply (manager, form) -> bool              corpse-lay-heap.js:24 (the fork's ChangeForm.cpp:57)
//    37178  0x65ebd0   Actor::Set3D(this, node, queue3DTasks)                     TESObjectREFR.h:304, slot 0x6C (corpse-lay-heap.js:28)
//    34750  0x5cbbc0   ReanimateEffect::Start(this)                               image: slot 0x14 (ActiveEffect.h:84) of
//                      VTABLE_ReanimateEffect 206016 (0x187f868), whose locator names .?AVReanimateEffect@@
//    37321  0x665ad0   Actor::Resurrect(this, resetInventory, attach3D)           Actor.h:369; image: slot 0xAB of VTABLE_Character[0]
//    38820  0x6c6e00   the reanimation proper (Actor* this)                       the fork's game/Offsets.h@c3f9d175:182; re-resurrect-hook.md
//    38894  0x6c9820   ActorEquipManager::EquipObject(this, actor, object, list, count, slot, queue, force, sounds, applyNow)
//                                                                                 Offsets.h:25, ActorEquipManager.h:19
//    38901  0x6ca010   ActorEquipManager::UnequipObject(same, then slotToReplace) Offsets.h:27, ActorEquipManager.h:22
//    19689  0x2e1750   TESObjectREFR::RemoveItem(this, item, count, reason, list, moveToRef, ...)   TESObjectREFR.h:282; slot 0x56
//                      of VTABLE_TESObjectREFR[0] 190259 (Offsets_VTABLE.h:649); image: that locator names .?AVTESObjectREFR@@
//    37797  0x692800   Actor::RemoveItem, the override (Actor.h:300); image: slot 0x56 of VTABLE_Character[0], and it calls
//                      39822 (the queue's purge by list), 19689 and 38894 (equip-queue-trace.js:39-47). Image: a member
//                      function returning ObjectRefHandle takes the result through a hidden pointer in rdx (37797's prologue:
//                      `mov rsi, rdx; mov dword ptr [rdx], eax`, and it reads currentProcess at [rbx+0xf8]), so the list is
//                      Frida's args[5], not args[4]: equip-queue-trace.js:51-53 reads the removals one slot short
//   190259  0x17ae180  VTABLE_TESObjectREFR[0]        Offsets_VTABLE.h:649; image: its slot 0x56 holds 19689 (selfTest reads it)
//   207886  0x18a5558  VTABLE_Character[0]            Offsets_VTABLE.h:2215; image: its locator names .?AVCharacter@@ at offset 0
//   207894  0x18a5f80  VTABLE_Character[4], Character's MagicTarget vtable   Offsets_VTABLE.h:2215; image: locator offset 0xa0
//   246821  0x1a4aaa0  VTABLE_MovementMessagePathComplete   Offsets_VTABLE.h:6464; the address both crashes' pops handed out
//   403449  0x31872c0  Main's singleton, a Main** (threadID +0x28)   Offsets.h:383, Main.h:87
// Labels only (a return address's `near`): 16059, 27315, 27336, 28043, 36098, 37313, 37434, 37490, 37612, 37818, 37877, 37892, 39814,
// 39821, 39822, 41297, 41381, 41614, 41717, 41762, 68163, 68168, 69378, 90854, 90880, 92937, 92957, 92958, 92969, each by `just addr`
// the same day. Data labels: 200713 VTABLE_BGSAIWorldLocationRefRadius (Offsets_VTABLE.h:1064), 186407 VTABLE_IngredientItem (:36),
// 207706 VTABLE_ActorMediator (:2196).
// Layouts, CommonLibSSE-NG b93280e8 (AE, runtime 1.6.629 and later):
//   TESForm: formID +0x14, formType +0x1A (TESForm.h:354, :356); ActorCharacter 0x3E (FormTypes.h:202).
//   Actor: ActorState at +0xC0 (Actor.h:737), actorState1 at its +0x08 (ActorState.h:203), lifeState in bits 21 to 24 (:114; kDying 1,
//   kDead 2, kReanimate 4, ActorState.h:7-18); the runtime data at +0xE8 (Actor.h:712): boolBits at +0x00 (Actor.h:647), kProcessMe
//   1 << 1 (Actor.h:160) is IsAIEnabled (src Actor.cpp:741-744); currentProcess at +0x10 (Actor.h:651), so Actor+0xF8.
//   MagicTarget in Actor at +0xA0 (Actor.h:721; the locator above agrees). AIProcess::middleHigh +0x08 (AIProcess.h:196).
//   MiddleHighProcessData::itemstoEquipUnequip +0x188 (MiddleHighProcessData.h:157), a QueuedItem list: next +0x00, object +0x08,
//   equipParams.extraDataList +0x10, count +0x18, equip +0x40 (:85-94, :62-70). The header carries no AE relocation for that class:
//   that its AE layout is SE's is HYPOTHESIS, so a queue read is checked (each node's object a form) and its error printed.
//   ActiveEffect: caster (ActorHandle) +0x34, spell +0x40, effect +0x48, target +0x50 (ActiveEffect.h:98-104); Effect::baseEffect
//   +0x10 (Effect.h:39). ExtraDataList on 1.6.629 and later: a virtual BaseExtraList (data +0x08, presence +0x10) and its lock at
//   +0x18 (ExtraDataList.h:38-47; src ExtraDataList.cpp:359-365), so 0x20 bytes, the poisoned pool's size (HYPOTHESIS until a row).
//
// How it reads. The heap side is native (a CModule): 68115's leave and 68117's enter keep one record per block by address (2^20
// direct-mapped slots of 48 bytes, about 48 MB: the block, its size, its state, its last allocation's and last free's caller, time
// and thread). Only blocks of 1 to maxSize bytes (0x20: the poisoned pool and AE's ExtraDataList are both 0x20, src
// ExtraDataList.cpp:359-366, BSAtomic.h:91) are recorded; a free of a block with no record is counted, never judged.
// Four checks, each a row with its stack:
//   - inImage: an allocation of any size above 0 returned an address inside SkyrimSE.exe: the poisoned pop itself; the crash follows.
//   - link: a recorded small block came back with its first qword inside SkyrimSE.exe: the pop after it will be inImage, if the
//     pool keeps its next link in a free block's first qword (crash-0225 and crash-0226's two pops, the memo 7.2, support that).
//   - twice: 68115 handed out a block whose record says allocated: the block was listed twice in its free list.
//   - double: 68117 was given a block whose record says freed: a double free. Its row names both frees' callers.
// The actor side: the nine hooks above, each filtered in C to an actor in refs, an actor whose lay window is open (any ACHR's 35568
// opens one for postLayMs), or, for the hooks that touch a body, a dead or dying actor (lifeState 1 or 2). JavaScript reads the
// rest: the form ids, the AI bit, the life state, each list's record, and the actor's equip queue.
//
// Rows (one JSON line each through console.log and send(); every row carries seq, tid, main (the thread against Main's threadID) and
// t, the seat's Date.now()):
//   {ready} once: pid (match it against the run's c2-skyrim-platform-pid<N>.log first), base, each hook's id, rva, first eight bytes
//     and attach result, the CModule variant or its errors, selfTest (the four locators; the RemoveItem slots of Character and TESObjectREFR and
//     ReanimateEffect's Start, each compared; Character's slot 0xAB printed, which the platform rewrites), params.
//   {fn: 'heap', what: 'inImage' | 'link' | 'twice' | 'double'}: block (where: a vtable is named), size, via, link (the block's first
//     qword), record (the block's last allocation and free: caller, ms ago, thread, size, state), caller, stack (return addresses
//     found after a call), lays (the open lay windows), recent (the last 12 actor rows: fn, actor, seq, ms ago), counts. inImage and
//     the first 20 of twice and double hold their thread flushMs (600) so the line reaches the .log before the crash.
//   {fn: 'lay', phase}: 35568 on a watched actor; actor, lifeState, ai, why (ref, dead, laid), queue.
//   {fn: 'set3D'}: a watched actor's Set3D (the lay's 3D loss): node, nullNode, queue3DTasks.
//   {fn: 'reanimateStart'}: 34750 on a watched or dead actor: actor, lifeState, ai, spell, effect, caster handle. On the D4 B build
//     none is expected on c2: D4 B refuses the item at AddTarget, so no ReanimateEffect starts there.
//   {fn: 'resurrect', phase}: 37321: resetInventory, attach3D, lifeState and ai before (enter) and after (leave), queue.
//   {fn: 'reanimate', phase}: 38820: lifeState and ai before and after, queue.
//   {fn: 'equip' | 'unequip' | 'removeItem' | 'actorRemoveItem', phase}: actor, why, lifeState, ai, object or item, count, list,
//     listState (the list's record: allocated, freed or unknown) with its record, the flags (queue, force, sounds, applyNow; or reason
//     and moveToRef), depth (37797 nests 19689), caller, queue {nodes [{object, list, listState, count, equip}], listQueued (the
//     list is a queued node's), danglingQueued (a queued node's list reads freed)}, critical. A call handed a freed list
//     (listState freed at enter) or a queue holding a freed list is critical: always printed, the first 20 hold flushMs.
//   {fn: 'layWindow'}: postLayMs after each watched lay's leave: the heap anomalies and actor rows inside it, and the pattern
//     {doubleInWindow, twiceInWindow, freedListCall, danglingQueued}.
//   {fn: 'exception'}: each first-chance fault (breakpoints and guard pages skipped, the first 20): its site, the memory operation
//     and address (inImage), rax rcx rdx with their places, a fuzzy backtrace, the anomaly counts before it.
//   {fn: 'liveness'} every 10 s: every hook's calls before its filter and its passes, the native totals (allocations, frees,
//     reallocations, small blocks, untracked frees, evictions, the 0x20 blocks), kernel32!Sleep's count as the Interceptor's pulse,
//     rows logged and capped, holds. {fn: 'ttl'} at TTL: the hooks detached.
//
// Expected, by suspect, in one run on the stage build with c2 holding a thrall's copy through its end and the post-death lay:
//   (b) the lay: a double or twice row inside that lay's window points at the lay only if its block is a `list` from that
//       window's rows, or its stack or record names 37797, 19689, 38901, 39814 or 39822; timing alone is not enough. The shape: an
//       unequip and an actorRemoveItem on the copy with the underskin's list, then a double row whose block is that list (or a
//       twice row for it), the record naming the other freer, then link, then inImage and the fault. Or an equip or unequip whose
//       caller is near 39814 (the queue's flush) with listState freed: the queued equip outlived its list.
//   (a) the raise: a reanimateStart row on the copy and a resurrect row with lifeState 2 before it and no 38820 between, then the
//       anomalies. With D4 B live, a reanimateStart row on c2 proves D4 B failed only when its why is `ref`: with dead_counts 1
//       the hook also passes any dead ACHR (hp_rstart_enter, hp_watch).
// A fault (an exception at 27315+0x7 or 41762+0x68 in the image, or any write into it) with no double, twice or link row before it
// means the trace was blind, not both suspects falsified: check the pid, the hooks and the allocate count first. No fault and no
// anomaly is no verdict: the double listing did not happen in this run.
// Limits: an allocation or free that bypasses 68115 and 68117 is unseen, and a later one through them may then read twice or
// double (the liveness counts before the stage's events give the base rate; a healthy run reads 0); a direct-mapped slot keeps the
// newest block, so an evicted record is a miss, never a hit; a write into a freed block (a use after free) shows only at the pops
// it poisons; the queue read rests on the AE layout HYPOTHESIS above; 38820 already carries the platform's own Gum hook
// (FridaHooks.cpp@c3f9d175:3398, InstallReanimateHook), so this attach sits on its patch (the ready row's first bytes show it) and
// 37321 is reached through the platform's Character slot 0xAB thunk (Hooks.cpp HostedResurrect) as well as directly; the heap hooks
// cost every allocation and free a listener, so read the liveness pulse against an untraced run's before reading any timing.
// Params: globalThis.LAB_PARAMS (a scenario's frida step); a hand run (`just frida <file> c2`) carries none and gets the defaults,
// which are the stage's: refs [0x13491, 0x35534] (numbers or hex strings), maxSize 0x20, slotsLog2 20 (16 to 22), postLayMs 2000,
// cap 200 (each row kind's non-critical rows before it only counts), ttl 1200 s, flushMs 600 (0 off). 1.6.1170 only.
// Run: on c2 alone, by hand, `just frida lab/.cache/probes/corpse-lay-heap-pool.js c2`, no params, POSTed right after step 1 (c2's
// connect) of the stage's x-reanimate-look v1.1 run (lab/.cache/probes/x-reanimate-look-v1.yaml, sha1 43f6c592, fork
// m4-reanimate-claim-2 0065ae6e), so the ready row lands before step 35, c2's kill of Hilde. Her end (step 105, c1's 60 s timer,
// then the post-death lay on c2) is that probe's first lay of the crash's shape, not a control: c1 commands and runs her decay.
// Sven (killed at step 122, raised with Dead Thrall 7e8df at step 151) has no timed end, and when c2 kills him at step 299 c2
// simulates him (U6's departure line, step 192), so that lay is c1's. The cow 0x60b22 (killed at step 229) gets no underskin.
// The 1200 s TTL covers the probe's timeout_s 1020 (x-reanimate-look-v1.yaml:103) from step 1. A scenario's `c2: frida
// {script: ...}` step would need the file on main (lab-api serves lab/frida from main, thrall-link.js:9-11), so the hand upload
// is the path that needs no commit. Read the ready row's pid against c2's game in result.json (games) before any other row.
'use strict';
function emit(obj) {
  obj.t = Date.now();
  send(obj);
  console.log(JSON.stringify(obj));
}

const PARAMS =
  typeof LAB_PARAMS === 'object' && LAB_PARAMS ? LAB_PARAMS : typeof params === 'object' && params ? params : {};

// top-level names carry the prefix hp (a name matching a Frida global fails the load, frida-lab-script-pitfalls)
function hpIdSet(list) {
  const s = new Set();
  for (const v of list) s.add((typeof v === 'string' ? parseInt(v, 16) : Number(v)) >>> 0);
  return s;
}
const hpRefs = hpIdSet(Array.isArray(PARAMS.refs) ? PARAMS.refs : [0x13491, 0x35534]);
const hpMaxSize = Number(PARAMS.maxSize) > 0 ? Math.min(0x200, Number(PARAMS.maxSize) >>> 0) : 0x20;
const hpSlotsLog2 = Number(PARAMS.slotsLog2) >= 16 && Number(PARAMS.slotsLog2) <= 22 ? Number(PARAMS.slotsLog2) >>> 0 : 20;
const hpPostLayMs = Number(PARAMS.postLayMs) > 0 ? Number(PARAMS.postLayMs) >>> 0 : 2000;
const hpCap = PARAMS.cap >>> 0 || 200;
const hpTtlMs = (Number(PARAMS.ttl) > 0 ? Number(PARAMS.ttl) : 1200) * 1000;
const hpFlushMs = PARAMS.flushMs === undefined ? 600 : Math.max(0, Number(PARAMS.flushMs) || 0);
const hpScanQwords = 2048;
const hpCritCap = 100;
const hpQueueMax = 16;

// offsets by `just addr <id>` for 1.6.1170 on 2026-11-12 (never from memory, CLAUDE.md rule 1)
const OFFSETS = {
  '1.6.1170.0': {
    allocate: 0xcc40c0, // 68115
    reallocate: 0xcc4310, // 68116
    deallocate: 0xcc4510, // 68117
    apply: 0x603700, // 35568
    set3D: 0x65ebd0, // 37178
    reanimateStart: 0x5cbbc0, // 34750
    resurrect: 0x665ad0, // 37321
    reanimate: 0x6c6e00, // 38820
    equipObject: 0x6c9820, // 38894
    unequipObject: 0x6ca010, // 38901
    removeItem: 0x2e1750, // 19689
    actorRemoveItem: 0x692800, // 37797
    vtRefr: 0x17ae180, // 190259 (data)
    vtCharacter: 0x18a5558, // 207886 (data)
    vtCharacterMagicTarget: 0x18a5f80, // 207894 (data)
    vtReanimateEffect: 0x187f868, // 206016 (data)
    vtPathComplete: 0x1a4aaa0, // 246821 (data)
    mainSingleton: 0x31872c0, // 403449 (data)
  },
};
const hpIds = {
  allocate: 68115, reallocate: 68116, deallocate: 68117, apply: 35568, set3D: 37178, reanimateStart: 34750, resurrect: 37321,
  reanimate: 38820, equipObject: 38894, unequipObject: 38901, removeItem: 19689, actorRemoveItem: 37797, vtRefr: 190259, vtCharacter: 207886,
  vtCharacterMagicTarget: 207894, vtReanimateEffect: 206016, vtPathComplete: 246821, mainSingleton: 403449,
};
// function starts for labeling return addresses, `just addr` the same day; a label reaches 0x2000 past its start
const hpKnownStarts = {
  '1.6.1170.0': [
    [0x11bd80, '36098 the sized delete (calls 68117)'],
    [0x228180, '16059 the entry and list deleter'],
    [0x2e1750, '19689 TESObjectREFR::RemoveItem'],
    [0x440810, '27315 BGSAIWorldLocationRefRadius constructor'],
    [0x441600, '27336 package location builder'],
    [0x452190, '28043 its 0x20 allocation'],
    [0x5cbbc0, '34750 ReanimateEffect::Start'],
    [0x603700, '35568 change-form apply'],
    [0x65ebd0, '37178 Actor::Set3D'],
    [0x664950, '37313 move an actor to a location'],
    [0x665ad0, '37321 Actor::Resurrect'],
    [0x671c80, '37434 move a leader\'s followers'],
    [0x675130, '37490 SetLifeState(b << 2)'],
    [0x680740, '37612 Actor::SetLifeState'],
    [0x692800, '37797 Actor::RemoveItem'],
    [0x693680, '37818 reset an actor\'s movement'],
    [0x695430, '37877 the WarpToLocation handler'],
    [0x696d20, '37892 movement message dispatch'],
    [0x6c6e00, '38820 the reanimation proper'],
    [0x6c9820, '38894 ActorEquipManager::EquipObject'],
    [0x6ca010, '38901 ActorEquipManager::UnequipObject'],
    [0x70e250, '39814 the equip-queue flush'],
    [0x70e440, '39821 the queue node allocator'],
    [0x70e5d0, '39822 the queue purge by list'],
    [0x768cc0, '41297 the movement message job'],
    [0x771520, '41381 the actor-update job body'],
    [0x77d940, '41614 the controller\'s path clear'],
    [0x784900, '41717 drain a controller\'s messages'],
    [0x785f70, '41762 IMovementMessageInterface slot 2, the post'],
    [0xcc40c0, '68115 MemoryManager::Allocate'],
    [0xcc4310, '68116 MemoryManager::Reallocate'],
    [0xcc4510, '68117 MemoryManager::Deallocate'],
    [0xcc6890, '68163 the BSTArray push'],
    [0xcc6b40, '68168 the BSTArray heap allocation'],
    [0xcf77b0, '69378 BSJobs: run a job list'],
    [0x11b70e0, '90854 the arbiter\'s clear, slot 3'],
    [0x11b86d0, '90880 the arbiter\'s clear and PathCleared post'],
    [0x1219b00, '92937 a new MovementMessagePathComplete'],
    [0x1219f00, '92957 PathComplete constructor'],
    [0x1219f50, '92958 PathComplete destructor'],
    [0x121a2e0, '92969 PathComplete scalar deleting destructor'],
  ],
};
// in-image data addresses named in rows (a pop handing one out is the crash's shape)
const hpKnownData = {
  '1.6.1170.0': {
    0x1a4aaa0: 'VTABLE_MovementMessagePathComplete (246821)',
    0x1849d68: 'VTABLE_BGSAIWorldLocationRefRadius (200713)',
    0x1769028: 'VTABLE_IngredientItem (186407)',
    0x18a05a0: 'VTABLE_ActorMediator (207706)',
    0x18a5558: 'VTABLE_Character[0] (207886)',
    0x18a5f80: 'VTABLE_Character[4] (207894)',
    0x187f868: 'VTABLE_ReanimateEffect (206016)',
  },
};

// layouts (CommonLibSSE-NG b93280e8, file:line in the header)
const HP_FORM = { id: 0x14, type: 0x1a, achr: 0x3e };
const HP_ACTOR = { state1: 0xc8, boolBits: 0xe8, process: 0xf8, magicTarget: 0xa0 };
const HP_PROC = { middleHigh: 0x08 };
const HP_MH = { queue: 0x188 };
const HP_QUEUED = { next: 0x00, object: 0x08, list: 0x10, count: 0x18, equip: 0x40 };
const HP_EFFECT = { caster: 0x34, spell: 0x40, effect: 0x48, target: 0x50, effectBase: 0x10 };
const HP_MAIN_THREAD = 0x28;
const HP_LIFE = ['alive', 'dying', 'dead', 'unconscious', 'reanimate', 'recycle', 'restrained', 'essentialDown', 'bleedout'];
// the CModule's memory, laid out by hand on both sides (x64 natural alignment)
const HP_SH = { imageLo: 0x000, imageHi: 0x008, vtCharMt: 0x010, mtOffset: 0x018, armed: 0x020, maxSize: 0x024, nRefs: 0x028,
  postLayMs: 0x02c, refs: 0x030, layId: 0x070, layUntil: 0x0b0, layHead: 0x0f0, c: 0x0f8, size: 0x278 };
const HP_C = { alloc: 0, free: 1, realloc: 2, smallAlloc: 3, smallFree: 4, twice: 5, double: 6, inImage: 7, link: 8, pulse: 9,
  hits: 10, untrackedFree: 11, reallocMove: 12, evicted: 13, alloc20: 14, free20: 15, calls: 16, passes: 28, lays: 40, zero: 41 };
const HP_BLOCK = { ptr: 0x00, aret: 0x08, fret: 0x10, at: 0x18, ft: 0x1c, atid: 0x20, ftid: 0x24, size: 0x28, state: 0x2c, size_: 0x30 };
const HP_HIT = { kind: 0x00, phase: 0x04, a: 0x08, ret: 0x38, rsp: 0x40, tid: 0x48, st0: 0x50, st1: 0x54, rec: 0x58 };
const HP_KIND = { twice: 1, double: 2, inImage: 3, link: 4, lay: 10, set3D: 11, reanimateStart: 12, resurrect: 13, reanimate: 14,
  equip: 15, unequip: 16, removeItem: 17, actorRemoveItem: 18 };
const HP_KIND_NAME = { 1: 'twice', 2: 'double', 3: 'inImage', 4: 'link', 10: 'lay', 11: 'set3D', 12: 'reanimateStart', 13: 'resurrect',
  14: 'reanimate', 15: 'equip', 16: 'unequip', 17: 'removeItem', 18: 'actorRemoveItem' };
const HP_WHY = ['none', 'ref', 'dead', 'laid'];

const HP_C_SOURCE = `
#include <gum/guminterceptor.h>

#define HP_ALLOCATED 1
#define HP_FREED 2
#define HP_MIX(p) ((guint32) (((p) >> 4) ^ ((p) >> 21) ^ ((p) >> 37)))
#define HP_C_CALLS 16
#define HP_C_PASSES 28

typedef struct _HpShared HpShared;
typedef struct _HpBlock HpBlock;
typedef struct _HpHit HpHit;
typedef struct _HpCall HpCall;

struct _HpShared
{
  guint64 image_lo;       /* 0x000 SkyrimSE.exe's base */
  guint64 image_hi;       /* 0x008 its end */
  guint64 vt_char_mt;     /* 0x010 VTABLE_Character[4] (207894) */
  guint64 mt_offset;      /* 0x018 its locator's offset, 0xa0 (Actor.h:721) */
  guint32 armed;          /* 0x020 */
  guint32 max_size;       /* 0x024 */
  guint32 n_refs;         /* 0x028 */
  guint32 post_lay_ms;    /* 0x02c */
  guint32 refs[16];       /* 0x030 */
  guint32 lay_id[16];     /* 0x070 */
  guint32 lay_until[16];  /* 0x0b0 */
  guint32 lay_head;       /* 0x0f0 */
  guint32 pad;            /* 0x0f4 */
  guint64 c[48];          /* 0x0f8 counters, unsynchronized (rates, not counts) */
};

struct _HpBlock
{
  guint64 ptr;    /* 0x00 */
  guint64 aret;   /* 0x08 the last allocation's caller */
  guint64 fret;   /* 0x10 the last free's caller */
  guint32 at;     /* 0x18 GetTickCount64's low word at it */
  guint32 ft;     /* 0x1c */
  guint32 atid;   /* 0x20 */
  guint32 ftid;   /* 0x24 */
  guint32 size;   /* 0x28 */
  guint32 state;  /* 0x2c 1 allocated, 2 freed */
};

struct _HpHit
{
  guint32 kind;   /* 0x00 */
  guint32 phase;  /* 0x04 0 enter, 1 leave */
  guint64 a[6];   /* 0x08 */
  guint64 ret;    /* 0x38 */
  guint64 rsp;    /* 0x40 */
  guint64 tid;    /* 0x48 */
  guint32 st0;    /* 0x50 the record's state (heap) or the list's (actor hooks) */
  guint32 st1;    /* 0x54 life: lifeState | ai << 8 | formType << 16 | why << 24 */
  HpBlock rec;    /* 0x58 a copy of the record before the event */
};

struct _HpCall
{
  guint32 hit;
  guint32 kind;
  guint64 a[6];
};

extern volatile HpShared hp_shared;
extern volatile HpBlock hp_blocks[HP_SLOT_MASK + 1];
extern guint64 hp_ticks (void);
extern void hp_on_hit (HpHit * hit);

static guint64
hp_ret_of (GumInvocationContext * ic)
{
#ifdef HP_RET
  return (guint64) (gsize) gum_invocation_context_get_return_address (ic);
#else
  return 0;
#endif
}

static int
hp_in_image (guint64 p)
{
  return p >= hp_shared.image_lo && p < hp_shared.image_hi;
}

static guint64
hp_arg (GumInvocationContext * ic, guint n)
{
  return (guint64) (gsize) gum_invocation_context_get_nth_argument (ic, n);
}

static void
hp_copy (HpBlock * out, const volatile HpBlock * b)
{
  if (b == NULL)
  {
    out->ptr = 0;
    out->aret = 0;
    out->fret = 0;
    out->at = 0;
    out->ft = 0;
    out->atid = 0;
    out->ftid = 0;
    out->size = 0;
    out->state = 0;
    return;
  }
  out->ptr = b->ptr;
  out->aret = b->aret;
  out->fret = b->fret;
  out->at = b->at;
  out->ft = b->ft;
  out->atid = b->atid;
  out->ftid = b->ftid;
  out->size = b->size;
  out->state = b->state;
}

static void
hp_out (GumInvocationContext * ic, guint32 kind, guint32 phase, const guint64 * a, guint32 st0, guint32 st1,
    const volatile HpBlock * rec)
{
  HpHit hit;
  guint i;

  hit.kind = kind;
  hit.phase = phase;
  for (i = 0; i < 6; i++)
    hit.a[i] = a[i];
  hit.ret = hp_ret_of (ic);
#ifdef HP_CPU
  hit.rsp = (guint64) ic->cpu_context->rsp;
#else
  hit.rsp = (guint64) (gsize) &hit;
#endif
  hit.tid = (guint64) gum_invocation_context_get_thread_id (ic);
  hit.st0 = st0;
  hit.st1 = st1;
  hp_copy (&hit.rec, rec);
  hp_shared.c[10]++;
  hp_on_hit (&hit);
}

static volatile HpBlock *
hp_slot (guint64 p)
{
  return &hp_blocks[HP_MIX (p) & HP_SLOT_MASK];
}

static void
hp_note_alloc (GumInvocationContext * ic, guint64 p, guint64 size, guint32 via)
{
  volatile HpBlock * b;
  guint64 a[6];
  guint64 link;

  if (size == 0)
  {
    hp_shared.c[41]++;
    return;
  }
  a[0] = p;
  a[1] = size;
  a[2] = 0;
  a[3] = via;
  a[4] = 0;
  a[5] = 0;
  if (hp_in_image (p))
  {
    hp_shared.c[7]++;
    a[2] = *(const volatile guint64 *) (gsize) p;
    hp_out (ic, 3, 1, a, 0, 0, NULL);
    return;
  }
  if (size > hp_shared.max_size)
    return;
  hp_shared.c[3]++;
  if (size == 0x20)
    hp_shared.c[14]++;
  b = hp_slot (p);
  link = *(const volatile guint64 *) (gsize) p;
  a[2] = link;
  if (hp_in_image (link))
  {
    hp_shared.c[8]++;
    hp_out (ic, 4, 1, a, b->ptr == p ? b->state : 0, 0, b->ptr == p ? b : NULL);
  }
  if (via == 0 && b->ptr == p && b->state == HP_ALLOCATED)
  {
    hp_shared.c[5]++;
    hp_out (ic, 1, 1, a, b->state, 0, b);
  }
  else if (b->ptr != 0 && b->ptr != p && b->state == HP_ALLOCATED)
  {
    hp_shared.c[13]++;
  }
  b->state = 0;
  if (b->ptr != p) { b->fret = 0; b->ft = 0; b->ftid = 0; }
  b->ptr = p;
  b->size = (guint32) size;
  b->aret = hp_ret_of (ic);
  b->at = (guint32) hp_ticks ();
  b->atid = (guint32) gum_invocation_context_get_thread_id (ic);
  b->state = HP_ALLOCATED;
}

void
hp_alloc_enter (GumInvocationContext * ic)
{
  HpCall * call = GUM_IC_GET_INVOCATION_DATA (ic, HpCall);

  call->a[0] = hp_arg (ic, 1);
}

void
hp_alloc_leave (GumInvocationContext * ic)
{
  HpCall * call = GUM_IC_GET_INVOCATION_DATA (ic, HpCall);
  guint64 p;

  hp_shared.c[0]++;
  if (hp_shared.armed == 0)
    return;
  p = (guint64) (gsize) gum_invocation_context_get_return_value (ic);
  if (p != 0)
    hp_note_alloc (ic, p, call->a[0], 0);
}

void
hp_realloc_enter (GumInvocationContext * ic)
{
  HpCall * call = GUM_IC_GET_INVOCATION_DATA (ic, HpCall);

  call->a[0] = hp_arg (ic, 1);
  call->a[1] = hp_arg (ic, 2);
}

void
hp_realloc_leave (GumInvocationContext * ic)
{
  hp_shared.c[2]++;
}

void
hp_free_enter (GumInvocationContext * ic)
{
  guint64 p = hp_arg (ic, 1);
  volatile HpBlock * b;
  guint64 a[6];

  hp_shared.c[1]++;
  if (p == 0 || hp_shared.armed == 0)
    return;
  b = hp_slot (p);
  if (b->ptr != p)
  {
    hp_shared.c[11]++;
    return;
  }
  hp_shared.c[4]++;
  if (b->size == 0x20)
    hp_shared.c[15]++;
  if (b->state == HP_FREED)
  {
    hp_shared.c[6]++;
    a[0] = p;
    a[1] = b->size;
    a[2] = *(const volatile guint64 *) (gsize) p;
    a[3] = 2;
    a[4] = 0;
    a[5] = 0;
    hp_out (ic, 2, 0, a, b->state, 0, b);
  }
  b->fret = hp_ret_of (ic);
  b->ft = (guint32) hp_ticks ();
  b->ftid = (guint32) gum_invocation_context_get_thread_id (ic);
  b->state = HP_FREED;
}

void
hp_pulse (GumInvocationContext * ic)
{
  hp_shared.c[9]++;
}

static guint32
hp_form_id (guint64 form)
{
  return form == 0 ? 0 : *(const volatile guint32 *) (gsize) (form + 0x14);
}

static guint32
hp_life (guint64 form)
{
  guint32 type;
  guint32 s1;
  guint32 bits;

  if (form == 0)
    return 0xff;
  type = *(const volatile guint8 *) (gsize) (form + 0x1a);
  if (type != 0x3e)
    return 0xff | (type << 16);
  s1 = *(const volatile guint32 *) (gsize) (form + 0xc8);
  bits = *(const volatile guint32 *) (gsize) (form + 0xe8);
  return ((s1 >> 21) & 0xf) | (((bits >> 1) & 1) << 8) | (0x3eu << 16);
}

static guint32
hp_watch (guint64 form, guint32 life, guint32 dead_counts)
{
  guint32 id;
  guint32 now;
  guint32 i;
  guint32 n;

  if (form == 0)
    return 0;
  id = hp_form_id (form);
  n = hp_shared.n_refs;
  for (i = 0; i < n && i < 16; i++)
    if (hp_shared.refs[i] == id)
      return 1;
  if (dead_counts != 0 && ((life >> 16) & 0xff) == 0x3e && ((life & 0xff) == 1 || (life & 0xff) == 2))
    return 2;
  now = (guint32) hp_ticks ();
  for (i = 0; i < 16; i++)
    if (hp_shared.lay_id[i] == id && (gint32) (hp_shared.lay_until[i] - now) > 0)
      return 3;
  return 0;
}

guint32
hp_lookup (gpointer at, HpBlock * out)
{
  guint64 p = (guint64) (gsize) at;
  volatile HpBlock * b;

  if (p == 0)
  {
    hp_copy (out, NULL);
    return 0;
  }
  b = hp_slot (p);
  if (b->ptr != p)
  {
    hp_copy (out, NULL);
    return 0;
  }
  hp_copy (out, b);
  return b->state;
}

static void
hp_lay_mark (guint32 id)
{
  guint32 now = (guint32) hp_ticks ();
  guint32 i;
  guint32 k;

  for (i = 0; i < 16; i++)
  {
    if (hp_shared.lay_id[i] == id)
    {
      hp_shared.lay_until[i] = now + hp_shared.post_lay_ms;
      return;
    }
  }
  k = hp_shared.lay_head & 15;
  hp_shared.lay_head = k + 1;
  hp_shared.lay_until[k] = now + hp_shared.post_lay_ms;
  hp_shared.lay_id[k] = id;
  hp_shared.c[40]++;
}

/* a hook on one actor argument: the call counted, the filter in C, the arguments kept for the leave */
static void
hp_actor_enter (GumInvocationContext * ic, guint32 kind, guint64 form, const guint64 * a, guint32 list_at, guint32 dead_counts)
{
  HpCall * call = GUM_IC_GET_INVOCATION_DATA (ic, HpCall);
  guint32 life;
  guint32 why;
  guint32 st0 = 0;
  const volatile HpBlock * rec = NULL;
  guint i;

  call->hit = 0;
  hp_shared.c[HP_C_CALLS + kind - 10]++;
  if (hp_shared.armed == 0 || form == 0)
    return;
  life = hp_life (form);
  why = hp_watch (form, life, dead_counts);
  if (why == 0)
    return;
  hp_shared.c[HP_C_PASSES + kind - 10]++;
  call->hit = 1;
  call->kind = kind;
  for (i = 0; i < 6; i++)
    call->a[i] = a[i];
  if (list_at < 6 && a[list_at] != 0)
  {
    rec = hp_slot (a[list_at]);
    if (rec->ptr != a[list_at])
      rec = NULL;
    st0 = rec != NULL ? rec->state : 0;
  }
  hp_out (ic, kind, 0, a, st0, life | (why << 24), rec);
}

static void
hp_actor_leave (GumInvocationContext * ic, guint32 form_at, guint32 list_at)
{
  HpCall * call = GUM_IC_GET_INVOCATION_DATA (ic, HpCall);
  const volatile HpBlock * rec = NULL;
  guint32 st0 = 0;
  guint32 life;

  if (call->hit == 0)
    return;
  call->hit = 0;
  life = hp_life (call->a[form_at]);
  if (list_at < 6 && call->a[list_at] != 0)
  {
    rec = hp_slot (call->a[list_at]);
    if (rec->ptr != call->a[list_at])
      rec = NULL;
    st0 = rec != NULL ? rec->state : 0;
  }
  hp_out (ic, call->kind, 1, call->a, st0, life, rec);
}

/* 35568 (manager, form): every ACHR's apply opens its lay window; a watched one crosses */
void
hp_lay_enter (GumInvocationContext * ic)
{
  guint64 a[6];
  guint64 form = hp_arg (ic, 1);

  a[0] = form;
  a[1] = hp_arg (ic, 0);
  a[2] = 0;
  a[3] = 0;
  a[4] = 0;
  a[5] = 0;
  if (hp_shared.armed != 0 && form != 0 && *(const volatile guint8 *) (gsize) (form + 0x1a) == 0x3e)
    hp_lay_mark (hp_form_id (form));
  hp_actor_enter (ic, 10, form, a, 6, 1);
}

void
hp_lay_leave (GumInvocationContext * ic)
{
  HpCall * call = GUM_IC_GET_INVOCATION_DATA (ic, HpCall);

  if (call->hit != 0)
    hp_lay_mark (hp_form_id (call->a[0]));
  hp_actor_leave (ic, 0, 6);
}

/* 37178 (actor, node, queue3DTasks): refs and open lays only */
void
hp_set3d_enter (GumInvocationContext * ic)
{
  HpCall * call;
  guint64 a[6];

  a[0] = hp_arg (ic, 0);
  a[1] = hp_arg (ic, 1);
  a[2] = hp_arg (ic, 2) & 0xff;
  a[3] = 0;
  a[4] = 0;
  a[5] = 0;
  hp_actor_enter (ic, 11, a[0], a, 6, 0);
  call = GUM_IC_GET_INVOCATION_DATA (ic, HpCall);
  call->hit = 0;
}

/* 34750 (ReanimateEffect* this): the target actor through Character's MagicTarget vtable, else not judged */
void
hp_rstart_enter (GumInvocationContext * ic)
{
  HpCall * call;
  guint64 a[6];
  guint64 effect = hp_arg (ic, 0);
  guint64 target;
  guint64 actor = 0;

  if (effect != 0)
  {
    target = *(const volatile guint64 *) (gsize) (effect + 0x50);
    if (target != 0 && *(const volatile guint64 *) (gsize) target == hp_shared.vt_char_mt)
      actor = target - hp_shared.mt_offset;
  }
  a[0] = actor;
  a[1] = effect;
  a[2] = effect != 0 ? *(const volatile guint64 *) (gsize) (effect + 0x40) : 0;
  a[3] = effect != 0 ? *(const volatile guint64 *) (gsize) (effect + 0x48) : 0;
  a[4] = effect != 0 ? *(const volatile guint32 *) (gsize) (effect + 0x34) : 0;
  a[5] = 0;
  if (actor == 0)
  {
    hp_shared.c[HP_C_CALLS + 2]++;
    return;
  }
  hp_actor_enter (ic, 12, actor, a, 6, 1);
  call = GUM_IC_GET_INVOCATION_DATA (ic, HpCall);
  call->hit = 0;
}

/* 37321 (actor, resetInventory, attach3D) */
void
hp_res_enter (GumInvocationContext * ic)
{
  guint64 a[6];

  a[0] = hp_arg (ic, 0);
  a[1] = hp_arg (ic, 1) & 0xff;
  a[2] = hp_arg (ic, 2) & 0xff;
  a[3] = 0;
  a[4] = 0;
  a[5] = 0;
  hp_actor_enter (ic, 13, a[0], a, 6, 1);
}

void
hp_res_leave (GumInvocationContext * ic)
{
  hp_actor_leave (ic, 0, 6);
}

/* 38820 (actor) */
void
hp_rean_enter (GumInvocationContext * ic)
{
  guint64 a[6];

  a[0] = hp_arg (ic, 0);
  a[1] = 0;
  a[2] = 0;
  a[3] = 0;
  a[4] = 0;
  a[5] = 0;
  hp_actor_enter (ic, 14, a[0], a, 6, 1);
}

void
hp_rean_leave (GumInvocationContext * ic)
{
  hp_actor_leave (ic, 0, 6);
}

/* 38894 and 38901 (manager, actor, object, list, count, slot, queue, force, sounds, applyNow): a[5] packs the four flags' low bytes */
static void
hp_equip_common (GumInvocationContext * ic, guint32 kind)
{
  guint64 a[6];

  a[0] = hp_arg (ic, 1);
  a[1] = hp_arg (ic, 2);
  a[2] = hp_arg (ic, 3);
  a[3] = hp_arg (ic, 4) & 0xffffffff;
  a[4] = hp_arg (ic, 5);
  a[5] = (hp_arg (ic, 6) & 0xff) | ((hp_arg (ic, 7) & 0xff) << 8) | ((hp_arg (ic, 8) & 0xff) << 16) |
      ((hp_arg (ic, 9) & 0xff) << 24);
  hp_actor_enter (ic, kind, a[0], a, 2, 1);
}

void
hp_equip_enter (GumInvocationContext * ic)
{
  hp_equip_common (ic, 15);
}

void
hp_unequip_enter (GumInvocationContext * ic)
{
  hp_equip_common (ic, 16);
}

void
hp_equip_leave (GumInvocationContext * ic)
{
  hp_actor_leave (ic, 0, 2);
}

/* 19689 and 37797 (this, the ObjectRefHandle they return through a hidden pointer, item, count, reason, list, moveToRef): the
   image's 37797 keeps rdx as that result (mov rsi, rdx; mov dword ptr [rdx], eax), so each header argument sits one slot later */
static void
hp_remove_common (GumInvocationContext * ic, guint32 kind)
{
  guint64 a[6];

  a[0] = hp_arg (ic, 0);
  a[1] = hp_arg (ic, 2);
  a[2] = hp_arg (ic, 3) & 0xffffffff;
  a[3] = hp_arg (ic, 4) & 0xffffffff;
  a[4] = hp_arg (ic, 5);
  a[5] = hp_arg (ic, 6);
  hp_actor_enter (ic, kind, a[0], a, 4, 1);
}

void
hp_remove_enter (GumInvocationContext * ic)
{
  hp_remove_common (ic, 17);
}

void
hp_aremove_enter (GumInvocationContext * ic)
{
  hp_remove_common (ic, 18);
}

void
hp_remove_leave (GumInvocationContext * ic)
{
  hp_actor_leave (ic, 0, 4);
}
`;
// the CModule variants, tried in order: the hook's own stack pointer and the caller's return address, then dropping one each time
// (without HP_CPU the scan starts deeper, at the C frame; without HP_RET rows carry no caller); the ready row names the one compiled
const HP_VARIANTS = [
  { name: 'cpu+ret', defs: '#define HP_CPU 1\n#define HP_RET 1\n' },
  { name: 'ret', defs: '#define HP_RET 1\n' },
  { name: 'plain', defs: '' },
];

function hpFileVersion(path) {
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

function hpHex(n) {
  return '0x' + (n >>> 0).toString(16);
}

const hpExe = Process.getModuleByName('SkyrimSE.exe');
const hpVersion = hpFileVersion(hpExe.path);
const hpAt = OFFSETS[hpVersion];
if (hpAt === undefined) {
  emit({ error: 'no offsets for this runtime', version: hpVersion, tid: Process.getCurrentThreadId() });
} else {
  const exeEnd = hpExe.base.add(hpExe.size);
  const known = hpKnownStarts[hpVersion].slice().sort(function (x, y) {
    return x[0] - y[0];
  });
  const knownData = hpKnownData[hpVersion];
  let modules = null;
  try {
    modules = new ModuleMap();
  } catch (e) {
    modules = null;
  }

  const failures = {};
  function fail(where, e) {
    failures[where] = (failures[where] || 0) + 1;
    if (failures[where] <= 5)
      emit({ fn: 'error', where: where, tid: Process.getCurrentThreadId(), error: String(e), stack: e && e.stack ? String(e.stack).slice(0, 300) : null });
  }
  function inExe(p) {
    try {
      return !p.isNull() && p.compare(hpExe.base) >= 0 && p.compare(exeEnd) < 0;
    } catch (e) {
      return false;
    }
  }
  function near(off) {
    let best = null;
    for (const k of known) {
      if (k[0] <= off) best = k;
      else break;
    }
    return best !== null && off - best[0] < 0x2000 ? best[1] + '+0x' + (off - best[0]).toString(16) : null;
  }
  function where(p) {
    if (p === null || p === undefined || p.isNull()) return '0x0';
    if (inExe(p)) {
      const off = p.sub(hpExe.base).toUInt32();
      if (knownData[off] !== undefined) return 'SkyrimSE.exe+0x' + off.toString(16) + ' (' + knownData[off] + ')';
      const n = near(off);
      return 'SkyrimSE.exe+0x' + off.toString(16) + (n !== null ? ' (' + n + ')' : '');
    }
    let m = null;
    try {
      m = modules !== null ? modules.find(p) : Process.findModuleByAddress(p);
    } catch (e) {
      m = null;
    }
    return m !== null ? m.name + '+0x' + p.sub(m.base).toString(16) : p.toString();
  }
  function caller(ret) {
    if (!ret || ret.isNull()) return { ret: '0x0' };
    if (inExe(ret)) {
      const off = ret.sub(hpExe.base).toUInt32();
      const row = { ret: 'SkyrimSE.exe+0x' + off.toString(16) };
      const n = near(off);
      if (n !== null) row.near = n;
      return row;
    }
    return { ret: where(ret) };
  }
  // a stack scan: every qword from rsp up that lands in the exe or a plugin right after a call instruction
  function afterCall(q) {
    try {
      const b = new Uint8Array(q.sub(7).readByteArray(7));
      if (b[2] === 0xe8) return true; // call rel32
      for (let k = 0; k < 6; k++) if (b[k] === 0xff && (b[k + 1] & 0x38) === 0x10) return true; // FF /2, any length
      return false;
    } catch (e) {
      return false;
    }
  }
  function scan(rsp, max) {
    const frames = [];
    if (rsp.isNull()) return frames;
    for (let i = 0; i < hpScanQwords && frames.length < max; i++) {
      let q;
      try {
        q = rsp.add(i * 8).readPointer();
      } catch (e) {
        break;
      }
      if (q.isNull()) continue;
      let keep = inExe(q);
      if (!keep && modules !== null) {
        const m = modules.find(q);
        keep = m !== null && m.name.toLowerCase().indexOf('frida') < 0;
      }
      if (keep && afterCall(q)) frames.push(where(q));
    }
    return frames;
  }
  function mainThread() {
    try {
      const m = hpExe.base.add(hpAt.mainSingleton).readPointer();
      return m.isNull() ? 0 : m.add(HP_MAIN_THREAD).readU32();
    } catch (e) {
      return -1;
    }
  }
  let mainTid = mainThread();
  function formId(form) {
    try {
      return form.isNull() ? 0 : form.add(HP_FORM.id).readU32() >>> 0;
    } catch (e) {
      return 0;
    }
  }
  function lifeOf(life) {
    const ls = life & 0xff;
    return {
      lifeState: ls === 0xff ? null : HP_LIFE[ls] || String(ls),
      ai: ls === 0xff ? null : ((life >>> 8) & 1) === 1,
      formType: hpHex((life >>> 16) & 0xff),
    };
  }

  // the self-test: the four locators and three vtable slots the header cites, read from the loaded image
  const selfTest = {};
  function locator(vtOff) {
    try {
      const vt = hpExe.base.add(vtOff);
      const col = vt.sub(8).readPointer();
      const offset = col.add(4).readU32();
      const td = col.add(12).readU32();
      return { offset: offset, type: hpExe.base.add(td).add(0x10).readCString() };
    } catch (e) {
      return { error: String(e) };
    }
  }
  selfTest.character = locator(hpAt.vtCharacter);
  selfTest.characterMagicTarget = locator(hpAt.vtCharacterMagicTarget);
  selfTest.reanimateEffect = locator(hpAt.vtReanimateEffect);
  selfTest.pathComplete = locator(hpAt.vtPathComplete);
  function slotIs(vtOff, slot, fnOff) {
    try {
      return hpExe.base.add(vtOff).add(slot * 8).readPointer().equals(hpExe.base.add(fnOff));
    } catch (e) {
      return false;
    }
  }
  selfTest.characterRemoveItemSlot = slotIs(hpAt.vtCharacter, 0x56, hpAt.actorRemoveItem);
  selfTest.refrRemoveItemSlot = slotIs(hpAt.vtRefr, 0x56, hpAt.removeItem);
  // the platform rewrites this slot at runtime (Hooks.cpp@21ea849a:530, HostedResurrect), so its holder is printed, not compared
  try {
    selfTest.characterResurrectSlot = where(hpExe.base.add(hpAt.vtCharacter).add(0xab * 8).readPointer());
  } catch (e) {
    selfTest.characterResurrectSlot = 'unreadable: ' + e;
  }
  selfTest.reanimateStartSlot = slotIs(hpAt.vtReanimateEffect, 0x14, hpAt.reanimateStart);
  const mtOffset = selfTest.characterMagicTarget.offset === 0xa0 ? 0xa0 : null;
  selfTest.magicTargetOffsetOk = mtOffset !== null;
  selfTest.mainThread = mainTid;

  // the CModule's memory: page multiples come from the OS zeroed; kept for the script's life (the C side writes into them)
  const slotCount = 1 << hpSlotsLog2;
  const shared = Memory.alloc(HP_SH.size);
  shared.writeByteArray(new ArrayBuffer(HP_SH.size));
  shared.add(HP_SH.imageLo).writePointer(hpExe.base);
  shared.add(HP_SH.imageHi).writePointer(exeEnd);
  shared.add(HP_SH.vtCharMt).writePointer(mtOffset !== null ? hpExe.base.add(hpAt.vtCharacterMagicTarget) : NULL);
  shared.add(HP_SH.mtOffset).writeU64(mtOffset !== null ? mtOffset : 0);
  shared.add(HP_SH.maxSize).writeU32(hpMaxSize);
  shared.add(HP_SH.postLayMs).writeU32(hpPostLayMs);
  const refList = Array.from(hpRefs).slice(0, 16);
  shared.add(HP_SH.nRefs).writeU32(refList.length);
  refList.forEach(function (id, i) {
    shared.add(HP_SH.refs + 4 * i).writeU32(id);
  });
  const blocks = Memory.alloc(slotCount * HP_BLOCK.size_);
  const scratch = Memory.alloc(HP_BLOCK.size_);
  const k32 = Process.getModuleByName('kernel32.dll');
  const ticksAddr = k32.getExportByName('GetTickCount64');
  // every helper the JavaScript calls is exclusive: a cooperative call lets another hit's callback run and reuse scratch
  const ticks = new NativeFunction(ticksAddr, 'uint64', [], { scheduling: 'exclusive' });
  function nowTicks() {
    return ticks().toNumber() >>> 0;
  }
  function agoMs(t32) {
    return t32 === 0 ? null : (nowTicks() - t32) >>> 0;
  }
  function counter(i) {
    return shared.add(HP_SH.c + 8 * i).readU64().toNumber();
  }

  let seq = 0;
  const counts = {};
  function count(name) {
    if (!counts[name]) counts[name] = { n: 0, logged: 0, capped: 0 };
    return counts[name];
  }
  const anomalies = { twice: 0, double: 0, inImage: 0, link: 0 };
  let lastAnomaly = null;
  let exceptions = 0;
  let holds = 0;
  let critical = 0;
  const recent = []; // the last 12 actor rows: fn, actor, seq, t
  const lays = []; // each watched lay from its enter to postLayMs past its leave
  const depth = new Map(); // tid -> the removal hooks' nesting
  function hold() {
    if (hpFlushMs > 0 && holds < 40) {
      holds++;
      Thread.sleep(hpFlushMs / 1000);
    }
  }
  function openLays() {
    const out = [];
    const now = Date.now();
    for (const lay of lays) if (now <= lay.until) out.push({ actor: hpHex(lay.actor), enterSeq: lay.enterSeq, msSinceEnter: now - lay.enterT, left: lay.leaveT !== 0 });
    return out;
  }
  function noteRecent(fn, actor, rowSeq) {
    recent.push({ fn: fn, actor: hpHex(actor), seq: rowSeq, t: Date.now() });
    if (recent.length > 12) recent.shift();
  }
  function recentRows() {
    const now = Date.now();
    return recent.map(function (r) {
      return { fn: r.fn, actor: r.actor, seq: r.seq, msAgo: now - r.t };
    });
  }
  function tallyLays(key) {
    const now = Date.now();
    for (const lay of lays) if (now <= lay.until) lay.tally[key] = (lay.tally[key] || 0) + 1;
  }

  // the record of a block, read through the CModule's helper (null until it compiles)
  let lookupFn = null;
  function recordAt(base) {
    const state = base.add(HP_BLOCK.state).readU32();
    if (state === 0 && base.readPointer().isNull()) return null;
    return {
      state: state === 1 ? 'allocated' : state === 2 ? 'freed' : 'unknown',
      size: base.add(HP_BLOCK.size).readU32(),
      allocBy: caller(base.add(HP_BLOCK.aret).readPointer()),
      allocMsAgo: agoMs(base.add(HP_BLOCK.at).readU32()),
      allocTid: base.add(HP_BLOCK.atid).readU32(),
      freeBy: base.add(HP_BLOCK.fret).readPointer().isNull() ? null : caller(base.add(HP_BLOCK.fret).readPointer()),
      freeMsAgo: agoMs(base.add(HP_BLOCK.ft).readU32()),
      freeTid: base.add(HP_BLOCK.ftid).readU32(),
    };
  }
  function lookup(p) {
    if (lookupFn === null || p.isNull()) return { state: 'unknown' };
    const st = lookupFn(p, scratch);
    if (st === 0) return { state: 'unknown' };
    return recordAt(scratch);
  }

  // the actor's equip queue (HYPOTHESIS: SE's layout on AE), each node's list against the records
  function queueOf(actor, list) {
    const out = { nodes: [], more: false, listQueued: false, danglingQueued: false };
    try {
      const proc = actor.add(HP_ACTOR.process).readPointer();
      if (proc.isNull()) {
        out.process = null;
        return out;
      }
      const mh = proc.add(HP_PROC.middleHigh).readPointer();
      if (mh.isNull()) {
        out.middleHigh = null;
        return out;
      }
      let node = mh.add(HP_MH.queue).readPointer();
      for (let i = 0; i < hpQueueMax && !node.isNull(); i++) {
        const object = node.add(HP_QUEUED.object).readPointer();
        const type = object.isNull() ? 0 : object.add(HP_FORM.type).readU8();
        if (!object.isNull() && type >= 0x8a) { // FormType::Max 0x8A (FormTypes.h:279)
          out.error = 'node ' + node + ': its object ' + object + ' is no form (type ' + hpHex(type) + '): the layout HYPOTHESIS fails here';
          return out;
        }
        const nodeList = node.add(HP_QUEUED.list).readPointer();
        const rec = lookup(nodeList);
        if (list !== undefined && !list.isNull() && nodeList.equals(list)) out.listQueued = true;
        if (rec.state === 'freed') out.danglingQueued = true;
        out.nodes.push({ object: hpHex(formId(object)), list: nodeList.toString(), listState: rec.state, count: node.add(HP_QUEUED.count).readS32(), equip: node.add(HP_QUEUED.equip).readU8() !== 0 });
        node = node.add(HP_QUEUED.next).readPointer();
      }
      out.more = !node.isNull();
    } catch (e) {
      out.error = String(e);
    }
    return out;
  }

  function heapRow(kind, a, ret, rsp, st0, recBase) {
    const what = HP_KIND_NAME[kind];
    tallyLays(what);
    const inLay = openLays().length > 0;
    anomalies[what]++;
    const c = count('heap:' + what);
    c.n++;
    const mustPrint = kind === HP_KIND.inImage || c.logged < 20 || inLay;
    if (!mustPrint && c.logged >= hpCritCap) {
      c.capped++;
      return;
    }
    c.logged++;
    const tid = Process.getCurrentThreadId();
    const block = a[0];
    const row = {
      fn: 'heap', what: what, seq: ++seq, tid: tid, main: tid === mainTid, block: where(block), size: a[1].toUInt32(),
      via: kind === HP_KIND.double ? 'deallocate' : a[3].toUInt32() === 1 ? 'reallocate' : 'allocate', link: where(a[2]),
      linkInImage: inExe(a[2]), recordState: st0 === 1 ? 'allocated' : st0 === 2 ? 'freed' : 'unknown', record: recordAt(recBase),
    };
    Object.assign(row, caller(ret));
    row.stack = scan(rsp, 24);
    row.lays = openLays();
    row.recent = recentRows();
    row.counts = Object.assign({}, anomalies);
    lastAnomaly = { seq: row.seq, what: what, block: row.block, tid: tid };
    emit(row);
    if (kind === HP_KIND.inImage || inLay) hold();
  }

  function actorRow(kind, phase, a, ret, st0, st1, recBase) {
    const fn = HP_KIND_NAME[kind];
    const tid = Process.getCurrentThreadId();
    const isRemoval = kind === HP_KIND.removeItem || kind === HP_KIND.actorRemoveItem;
    const isEquip = kind === HP_KIND.equip || kind === HP_KIND.unequip;
    let d = depth.get(tid) || 0;
    if (isRemoval && phase === 1) d = Math.max(0, d - 1);
    const actor = a[0];
    const id = formId(actor);
    const why = HP_WHY[(st1 >>> 24) & 0xff] || 'none';
    const row = { fn: fn, phase: phase === 0 ? 'enter' : 'leave', seq: ++seq, tid: tid, main: tid === mainTid, actor: hpHex(id) };
    if (phase === 0) row.why = why;
    Object.assign(row, lifeOf(st1));
    let list = null;
    if (kind === HP_KIND.lay) {
      row.queue = queueOf(actor);
    } else if (kind === HP_KIND.set3D) {
      row.node = a[1].toString();
      row.nullNode = a[1].isNull();
      row.queue3DTasks = a[2].toUInt32();
    } else if (kind === HP_KIND.reanimateStart) {
      row.effect = a[1].toString();
      row.spell = hpHex(formId(a[2]));
      try {
        row.effectBase = a[3].isNull() ? '0x0' : hpHex(formId(a[3].add(HP_EFFECT.effectBase).readPointer()));
      } catch (e) {
        row.effectBase = 'unreadable';
      }
      row.casterHandle = hpHex(a[4].toUInt32());
    } else if (kind === HP_KIND.resurrect || kind === HP_KIND.reanimate) {
      if (kind === HP_KIND.resurrect) {
        row.resetInventory = a[1].toUInt32() !== 0;
        row.attach3D = a[2].toUInt32() !== 0;
      }
      row.queue = queueOf(actor);
    } else if (isEquip) {
      list = a[2];
      row.object = hpHex(formId(a[1]));
      row.list = list.toString();
      row.count = a[3].toUInt32();
      const f = a[5].toUInt32();
      row.queueEquip = (f & 0xff) !== 0;
      row.force = ((f >>> 8) & 0xff) !== 0;
      row.sounds = ((f >>> 16) & 0xff) !== 0;
      row.applyNow = ((f >>> 24) & 0xff) !== 0;
    } else if (isRemoval) {
      list = a[4];
      row.item = hpHex(formId(a[1]));
      row.count = a[2].toInt32();
      row.reason = a[3].toUInt32();
      row.list = list.toString();
      row.moveToRef = hpHex(formId(a[5]));
      row.depth = d;
    }
    let crit = false;
    if (list !== null) {
      row.listState = st0 === 1 ? 'allocated' : st0 === 2 ? 'freed' : list.isNull() ? 'none' : 'unknown';
      row.listRecord = recordAt(recBase);
      row.queue = queueOf(actor, list);
      if (phase === 0 && st0 === 2) {
        row.freedListCall = true;
        crit = true;
      }
      if (row.queue.danglingQueued) crit = true;
      if (phase === 1 && row.listState === 'freed') row.listFreedAtLeave = true;
    }
    if (isRemoval && phase === 0) depth.set(tid, d + 1);
    if (isRemoval && phase === 1) depth.set(tid, d);
    row.critical = crit;
    const c = count(fn + ':' + row.phase);
    c.n++;
    if (crit) {
      critical++;
      tallyLays(row.freedListCall ? 'freedListCall' : 'danglingQueued');
    }
    tallyLays('actorRows');
    const inLay = openLays().length > 0;
    if (!crit && !inLay && c.logged >= hpCap) {
      c.capped++;
      return;
    }
    if (crit && critical > hpCritCap) {
      c.capped++;
      return;
    }
    c.logged++;
    Object.assign(row, caller(ret));
    row.lays = openLays();
    noteRecent(fn, id, row.seq);
    if (kind === HP_KIND.lay) {
      if (phase === 0) {
        lays.push({ actor: id, enterSeq: row.seq, enterT: Date.now(), leaveT: 0, until: Infinity, tally: {}, anomaliesAtEnter: Object.assign({}, anomalies) });
      } else {
        for (let i = lays.length - 1; i >= 0; i--) {
          const lay = lays[i];
          if (lay.actor === id && lay.leaveT === 0) {
            lay.leaveT = Date.now();
            lay.until = lay.leaveT + hpPostLayMs;
            setTimeout(function () {
              layWindow(lay);
            }, hpPostLayMs + 50);
            break;
          }
        }
      }
    }
    emit(row);
    if (crit && inLay) hold();
  }

  function layWindow(lay) {
    const t = lay.tally;
    emit({
      fn: 'layWindow', seq: ++seq, tid: Process.getCurrentThreadId(), actor: hpHex(lay.actor), enterSeq: lay.enterSeq, enterT: lay.enterT,
      leaveT: lay.leaveT, untilT: lay.until, tally: t,
      pattern: { doubleInWindow: (t.double || 0) > 0, twiceInWindow: (t.twice || 0) > 0, linkInWindow: (t.link || 0) > 0, freedListCall: (t.freedListCall || 0) > 0, danglingQueued: (t.danglingQueued || 0) > 0 },
    });
    const i = lays.indexOf(lay);
    if (i >= 0) lays.splice(i, 1);
  }

  function onHit(hit) {
    const kind = hit.add(HP_HIT.kind).readU32();
    const phase = hit.add(HP_HIT.phase).readU32();
    const a = [];
    for (let i = 0; i < 6; i++) a.push(hit.add(HP_HIT.a + 8 * i).readPointer());
    const ret = hit.add(HP_HIT.ret).readPointer();
    const rsp = hit.add(HP_HIT.rsp).readPointer();
    const st0 = hit.add(HP_HIT.st0).readU32();
    const st1 = hit.add(HP_HIT.st1).readU32();
    const recBase = hit.add(HP_HIT.rec);
    if (kind >= 1 && kind <= 4) heapRow(kind, a, ret, rsp, st0, recBase);
    else actorRow(kind, phase, a, ret, st0, st1, recBase);
  }
  // kept for the script's life: the C side calls it
  const onHitCb = new NativeCallback(
    function (hit) {
      try {
        onHit(hit);
      } catch (e) {
        fail('hit', e);
      }
    },
    'void',
    ['pointer'],
  );

  let cm = null;
  let cmVariant = null;
  const cmErrors = [];
  const symbols = { hp_shared: shared, hp_blocks: blocks, hp_ticks: ticksAddr, hp_on_hit: onHitCb };
  const slotDef = '#define HP_SLOT_MASK 0x' + (slotCount - 1).toString(16) + '\n';
  for (const v of HP_VARIANTS) {
    try {
      cm = new CModule(slotDef + v.defs + HP_C_SOURCE, symbols);
      cmVariant = v.name;
      break;
    } catch (e) {
      cmErrors.push(v.name + ': ' + String(e).slice(0, 400));
    }
  }
  if (cm !== null) lookupFn = new NativeFunction(cm.hp_lookup, 'uint32', ['pointer', 'pointer'], { scheduling: 'exclusive' });

  const resolved = {};
  const attached = [];
  const attachErrors = [];
  function bytesAt(p) {
    try {
      return Array.from(new Uint8Array(p.readByteArray(8)))
        .map(function (x) {
          return ('0' + x.toString(16)).slice(-2);
        })
        .join(' ');
    } catch (e) {
      return 'unreadable';
    }
  }
  function attach(name, target, callbacks) {
    resolved[name] = { id: hpIds[name] || null, at: target.toString(), rva: inExe(target) ? '0x' + target.sub(hpExe.base).toString(16) : null, bytes: bytesAt(target) };
    try {
      Interceptor.attach(target, callbacks);
      attached.push(name);
    } catch (e) {
      attachErrors.push(name + ': ' + e);
    }
  }
  if (cm !== null) {
    attach('allocate', hpExe.base.add(hpAt.allocate), { onEnter: cm.hp_alloc_enter, onLeave: cm.hp_alloc_leave });
    attach('reallocate', hpExe.base.add(hpAt.reallocate), { onEnter: cm.hp_realloc_enter, onLeave: cm.hp_realloc_leave });
    attach('deallocate', hpExe.base.add(hpAt.deallocate), { onEnter: cm.hp_free_enter });
    attach('apply', hpExe.base.add(hpAt.apply), { onEnter: cm.hp_lay_enter, onLeave: cm.hp_lay_leave });
    attach('set3D', hpExe.base.add(hpAt.set3D), { onEnter: cm.hp_set3d_enter });
    if (mtOffset !== null) attach('reanimateStart', hpExe.base.add(hpAt.reanimateStart), { onEnter: cm.hp_rstart_enter });
    else attachErrors.push('reanimateStart: not attached, Character[4] locator offset ' + JSON.stringify(selfTest.characterMagicTarget));
    attach('resurrect', hpExe.base.add(hpAt.resurrect), { onEnter: cm.hp_res_enter, onLeave: cm.hp_res_leave });
    attach('reanimate', hpExe.base.add(hpAt.reanimate), { onEnter: cm.hp_rean_enter, onLeave: cm.hp_rean_leave });
    attach('equipObject', hpExe.base.add(hpAt.equipObject), { onEnter: cm.hp_equip_enter, onLeave: cm.hp_equip_leave });
    attach('unequipObject', hpExe.base.add(hpAt.unequipObject), { onEnter: cm.hp_unequip_enter, onLeave: cm.hp_equip_leave });
    attach('removeItem', hpExe.base.add(hpAt.removeItem), { onEnter: cm.hp_remove_enter, onLeave: cm.hp_remove_leave });
    attach('actorRemoveItem', hpExe.base.add(hpAt.actorRemoveItem), { onEnter: cm.hp_aremove_enter, onLeave: cm.hp_remove_leave });
    try {
      attach('sleep', k32.getExportByName('Sleep'), { onEnter: cm.hp_pulse });
    } catch (e) {
      attachErrors.push('sleep: ' + e);
    }
    shared.add(HP_SH.armed).writeU32(1);
  }

  // first-chance faults, logged and passed on (the game's own handlers and CrashLogger run after)
  Process.setExceptionHandler(function (d) {
    try {
      if (d.type === 'breakpoint' || d.type === 'single-step' || d.type === 'guard-page') return false;
      exceptions++;
      if (exceptions > 20) return false;
      const tid = Process.getCurrentThreadId();
      const c = d.context;
      const reg = function (name) {
        try {
          return where(c[name]);
        } catch (e) {
          return null;
        }
      };
      const row = {
        fn: 'exception', seq: ++seq, tid: tid, main: tid === mainTid, type: d.type, at: where(d.address),
        memory: d.memory ? { operation: d.memory.operation, address: where(d.memory.address), inImage: inExe(d.memory.address) } : null,
        rax: reg('rax'), rcx: reg('rcx'), rdx: reg('rdx'), anomaliesBefore: Object.assign({}, anomalies), lastAnomaly: lastAnomaly,
        lays: openLays(), recent: recentRows(),
      };
      try {
        row.stack = Thread.backtrace(c, Backtracer.FUZZY).slice(0, 24).map(where);
      } catch (e) {
        row.stack = 'unreadable: ' + e;
      }
      emit(row);
      if (exceptions <= 5) hold();
    } catch (e) {
      // nothing: the fault goes on to the game's handlers
    }
    return false;
  });

  emit({
    ready: true, script: 'corpse-lay-heap-pool.js', version: hpVersion, pid: Process.id, tid: Process.getCurrentThreadId(),
    base: hpExe.base.toString(), size: hpExe.size, hooks: attached, attachErrors: attachErrors, resolved: resolved, ids: hpIds,
    native: cm !== null, cmodule: cmVariant, cmoduleErrors: cmErrors, selfTest: selfTest, mainThread: mainTid,
    refs: refList.map(hpHex), maxSize: hpHex(hpMaxSize), slots: slotCount, tableBytes: slotCount * HP_BLOCK.size_, postLayMs: hpPostLayMs,
    cap: hpCap, ttlS: hpTtlMs / 1000, flushMs: hpFlushMs,
  });
  const hookKinds = ['apply', 'set3D', 'reanimateStart', 'resurrect', 'reanimate', 'equipObject', 'unequipObject', 'removeItem', 'actorRemoveItem'];
  setInterval(function () {
    mainTid = mainThread();
    const perHook = {};
    hookKinds.forEach(function (name, i) {
      perHook[name] = { calls: counter(HP_C.calls + i), passed: counter(HP_C.passes + i) };
    });
    emit({
      fn: 'liveness', seq: ++seq, tid: Process.getCurrentThreadId(), pid: Process.id, mainThread: mainTid,
      native: cm === null ? null : {
        allocate: counter(HP_C.alloc), deallocate: counter(HP_C.free), reallocate: counter(HP_C.realloc), smallAllocs: counter(HP_C.smallAlloc),
        smallFrees: counter(HP_C.smallFree), allocs20: counter(HP_C.alloc20), frees20: counter(HP_C.free20), untrackedFrees: counter(HP_C.untrackedFree),
        reallocMoves: counter(HP_C.reallocMove), evicted: counter(HP_C.evicted), zeroSize: counter(HP_C.zero), twice: counter(HP_C.twice),
        double: counter(HP_C.double), inImage: counter(HP_C.inImage), link: counter(HP_C.link), hits: counter(HP_C.hits), lays: counter(HP_C.lays),
        pulse: counter(HP_C.pulse), armed: shared.add(HP_SH.armed).readU32(),
      },
      hooks: perHook, rows: counts, anomalies: anomalies, critical: critical, exceptions: exceptions, holds: holds, lays: openLays(), failures: failures,
    });
  }, 10000);
  setTimeout(function () {
    shared.add(HP_SH.armed).writeU32(0);
    try {
      Interceptor.detachAll();
    } catch (e) {
      fail('ttl', e);
    }
    emit({ fn: 'ttl', seq: ++seq, tid: Process.getCurrentThreadId(), seconds: hpTtlMs / 1000, note: 'hooks detached; the CModule, its memory and the callback stay referenced' });
  }, hpTtlMs);
  // keep every native object the C side holds reachable for the script's life
  globalThis.hpKeep = [cm, onHitCb, shared, blocks, scratch];
}
