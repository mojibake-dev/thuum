// corpse-lay-heap.js v1 (the 50 reads, 2026-11-06 PST; written for lab/.cache/drafts/fifty/x-corpse-lay-crash.yaml, never run;
// its fresh review under ADR-064 amendment A before the first run). ONE QUESTION (ADR-064 amendment B): does an ActorMediator
// sink add or remove touch a freed array during a corpse lay on a loaded leveled actor, and does MemoryManager::Allocate then
// return the ActorMediator singleton's storage?
// Why: playtest 49's c1 crash, 2026-11-06 22:20:47 PST (thuum docs/private/playtest-49-c1-crash/crash-47.log): an access
// violation at 70199+0x7 (the NiObject constructor's `mov dword ptr [rcx+0x08], 0`, NiRefObject::_refCount at +0x08,
// CommonLibSSE-NG include/RE/N/NiRefObject.h:27) on thread 3908, the background loader (13049's loop), cloning draugr 0x380b8's
// skeleton.nif 54 ms after c1 laid its corpse record ("ApplyChangeForm 0x380b8: applied (35568 1, ... root false then false)" at
// 22:20:47.173 on main 1368, the reconcile at .227), RCX SkyrimSE.exe+0x18A05A0, VTABLE_ActorMediator: an allocation handed out
// read-only memory. The hypothesis under test is the re-analyst's static read of the same night (REA, candidate (c), medium
// confidence; the session scratchpad's crash49/reanalyst-report.md), every id's role HYPOTHESIS: the lay's leveled-creature
// block calls Set3D(nullptr) on the loaded copy (the fork's ChangeForm.cpp at 75c134ad) while the engine's background reload of
// the same corpse's 3D runs, so the copy's animation graph is torn down and registered again; an ActorMediator sink add (20140)
// or remove (38402) writes the singleton's address into a sink array already freed; a freed block's first qword is its pool's
// next link, so the pool hands out the singleton's storage (504076, whose first qword is its vtable 207706) and next the vtable
// itself, and the constructor's write faults.
//
// Address Library 1.6.1170 ids, every offset by `just addr <id>` (lab/addr.py over addrlib/, 428461 entries) on 2026-11-06:
//    20140  0x2f7f80   BSTEventSource<T>::AddEventSink(this source, sink): BSTEvent.h:34-56's body     HYPOTHESIS (report Q2)
//    38402  0x6b0350   BSTEventSource<T>::RemoveEventSink(this source, sink): BSTEvent.h:64-87's body  HYPOTHESIS (report Q2)
//    68115  0xcc40c0   MemoryManager::Allocate(this, size, alignment, aligned)          CommonLib include/RE/M/MemoryManager.h:36-41
//    68116  0xcc4310   MemoryManager::Reallocate(this, old, size, alignment, aligned)   CommonLib MemoryManager.h:57-62
//    68117  0xcc4510   MemoryManager::Deallocate(this, block, aligned)                  CommonLib MemoryManager.h:43-48
//    35568  0x603700   the change-form apply's stack-buffer wrapper (mgr, form) -> bool the fork's ChangeForm.cpp:57 (its id table)
//    37177  0x65e9e0   Actor::Load3D(this, backgroundLoading): TESObjectREFR.h:302, slot 0x6A  HYPOTHESIS role (report Q1)
//    37178  0x65ebd0   Actor::Set3D(this, node, queue3DTasks): TESObjectREFR.h:304, slot 0x6C  HYPOTHESIS role (arrows-apply-trace.js)
//   504076  0x3198690  the ActorMediator singleton's storage (data, never hooked; the sink)   HYPOTHESIS (report Q2)
//   403567  0x31877b8  the pointer to it (data, read once by the ready row)                  HYPOTHESIS (report Q2)
//   207706  0x18a05a0  VTABLE_ActorMediator (data, one vtable)                               CommonLib include/RE/Offsets_VTABLE.h:2196
//   232870  0x19881f8  VTABLE_BShkbAnimationGraph (data, one vtable)                         CommonLib Offsets_VTABLE.h:5175
//   403449  0x31872c0  Main's singleton, a Main** (threadID +0x28)            CommonLib include/RE/Offsets.h:383, Main.cpp:10, Main.h:87
// Two hooks beyond the report's list, each on the hypothesis' own path: 68116 (a block it moves is a free and an allocation, and
// a poisoned pointer could come back through it) and 37178 (the lay's null Set3D). Labels only (a return address's `near`, no
// hook), each by `just addr`: 13019, 13049, 13108, 17667, 19727, 24721, 68445, 70188, 70199, 70244, 70280, 70500, 70860, 71432,
// 105473 (the crash's frames, report Q1), 37983, 37987, 40737, 40754 (the four callers that add or remove the mediator on an
// actor's active graph, report Q2), 38948 and 38951 (its constructor and the caller of its callback at +0x10). No id failed to
// resolve; no hook was left out for want of a source.
// Layouts, CommonLibSSE-NG b93280e8: BSTEventSource (include/RE/B/BSTEvent.h:130-134): sinks +0x00, pendingRegisters +0x18,
// pendingUnregisters +0x30, lock +0x48, notifying +0x50 (size 0x58, :139); each a BSTArray<Sink*> with BSTArrayHeapAllocator
// first (data +0x00, capacity +0x08: include/RE/B/BSTArray.h:140-141, size 0x10 at :143) and BSTArrayBase second (its _size,
// :47; the order :374-376), so the size at +0x10; the lock a BSSpinLock (owningThread +0x0, lockCount +0x4: include/RE/B/
// BSAtomic.h:65-66); BShkbAnimationGraph (include/RE/B/BShkbAnimationGraph.h:28-32): BSTEventSource<BSTransformDeltaEvent> at
// +0x010, BSTEventSource<BSAnimationGraphEvent> at +0x068, holder (Actor*) +0x210 (:135), size 0x250 (:151); TESForm::formID
// +0x14 (include/RE/T/TESForm.h:354). A buffer a BSTArray holds comes from MemoryManager::Allocate and goes back through
// Deallocate in CommonLib's mirror of the allocator (BSTArray.h:119-130 through RE::malloc and free, MemoryManager.h:98-104);
// that the engine's own BSTArray does the same is HYPOTHESIS. CommonLib has no ActorMediator class: its first qword being its
// one vtable is the layout of a class with one vtable (Offsets_VTABLE.h:2196), read back by the ready row's self-test; its being
// a BSTEventSink at offset 0 is the report's Q2 (HYPOTHESIS). That a pool keeps its next link in a free block's first qword is
// the report's Q2 inference from the vtable handed out (HYPOTHESIS; poisonedLink rows rest on it).
//
// How it reads, all of the heap side native (a CModule; frida.re's CModule, the shape of native-frame.js's): 68115's and
// 68116's leave writes each block into a size table (2^20 slots by address) and marks the block's free record reused; 68117's
// enter (and 68116 when it moves a block) writes the block into a free record (2^18 slots by address: each block's last free,
// its size, GetTickCount64 time (ms), ring index and thread, state freed until its next allocation marks it reused) and into a
// ring of the last 65,536 frees; never a row per call, and no QueryPerformanceCounter on that path (on a VM it can be a
// syscall). A reallocation's late free is written only when the old block's size slot saw no allocation in between (its
// generation unchanged), so a block another thread took meanwhile never reads freed. 20140 and 38402 cross into JavaScript only
// when the sink is the mediator's storage, or when an array of the source (its three data pointers), the source itself, or a
// graph holding it at +0x10 or +0x68 has a free record in state freed: a write into freed memory by any sink is reported, the
// mediator's always, a call on a live source at its leave only. The allocation leave crosses only when the block is 504076's
// storage or 207706's address (`poisoned: true`), or when a block 68115 hands out holds either in its first qword
// (`poisonedLink: true`: the next allocation from that list will be the singleton's storage; a 68116 block is skipped, its
// words are the old block's copy).
// Rows (one JSON line each through console.log; send() too; every row carries tid and, where it names a call, main: the thread
// against Main's threadID): {ready} once every hook is attached: pid (read it against the run's c1-skyrim-platform-pid<N>.log
// first), base, each hook's id, rva and first eight bytes before the attach, the CModule variant or its errors, the self-test
// (403567 names 504076; 504076's first qword is 207706), Main's thread, params. {fn: 'sinkAdd'|'sinkRemove', phase:
// 'enter'|'leave'} for the mediator (mediator: true) or a freed source: the source, notifying, the lock, sinks,
// pendingRegisters and pendingUnregisters each with data, capacity, size, its free record and, on a watched or fault row, its
// elements (mediator or a pointer with its vtable), the graph (its base, which source, its holder's form id, its own record),
// sourceInFreedBlock (the newest ring free whose block holds the source, with freesAgo; kept out of fault, the tally and the
// holds), freedMask and freedWhat, fault (true when an array, the source or its graph is in state freed, by exact block),
// watched (the holder in refs, or an apply or load3D window open), the windows, and the caller (ret, near). {fn: 'alloc',
// poisoned: true | poisonedLink: true}: via allocate or reallocate, the block, the size, the caller, a stack scan (return
// addresses after a call instruction, the exe's and the plugins'), the faults before it and the last one. {fn: 'apply'} enter
// and leave of 35568 for a form in refs (form from the second argument, +0x14), opening a window on its thread; {fn: 'load3D'}
// enter and leave of 37177 for an actor in refs (background, the root returned), a window too; {fn: 'set3D'} per 37178 on one
// (node, nullNode). {fn: 'layWindow'} one second after each watched apply's leave: the tally from its enter (mediator adds and
// removes per thread, main or not; faults; poisoned; poisonedLink; load3D and set3D calls; exceptions) and pattern
// {mediatorRemoveOnMain, mediatorAddOffMain, fault, poisoned}. {fn: 'exception'} per first-chance fault (breakpoints and guard
// pages skipped, the first 20): its site with near, the memory operand, RCX (rcxIsVtable, rcxIsMediator), a fuzzy backtrace,
// the poisoned and fault counts before it. {fn: 'liveness'} every 10 s: every native hook's call count before its filter
// (allocate, reallocate, deallocate, addEventSink, removeEventSink), the hits, the frees later reused, the frees whose size the
// table knew, the ring's head, kernel32!Sleep's count as the Interceptor's pulse, the rows logged and capped. {fn: 'ttl'} at
// TTL, the hooks detached. A critical row (a mediator fault's leave, the first 20; poisoned, poisonedLink, an exception) holds
// its thread flushMs (600) before it returns, the JavaScript lock released, so lab-api's preamble flushes it to the .log (every
// 250 ms) before a crash can lose it: a hitch on the seat at such a row is the trace's own.
// Expected if the hypothesis holds, on the applying seat: inside the apply's window for 0x380b8 a set3D row with nullNode true
// on the main thread, a sinkRemove with mediator true on the main thread, then a load3D with background 1 off the main thread
// and a sinkAdd with mediator true on it, one of the two with fault true, then an alloc row with poisoned true (the storage,
// then VTABLE_ActorMediator), and an exception at 70199+0x7 with rcxIsVtable true if the crash reproduces. Falsified by: that
// crash with no poisoned row before it, or that crash with every mediator add and remove in the lay's window at fault false. No
// crash, no fault and no poisoned row is no verdict (the race did not run). Limits: SendEvent's pending-list writes
// (BSTEvent.h:95-121) are unhooked, so a poison written there reads as poisoned with no fault row; an allocation reaching a
// pool by any entry but 68115 or 68116 is unseen, and a block freed by 68117 and handed out that way keeps reading freed; the
// prefilter reads three qwords of every source 20140 and 38402 are given (the engine reads them next); a free record slot
// shared by two blocks keeps the newer; the heap hooks cost every allocation and free a listener: read the liveness pulse
// against an untraced run's before reading any timing.
// Params through globalThis.LAB_PARAMS (lab-api prepends them for a probe's `frida {script: corpse-lay-heap.js, params: {...}}`
// step; `just frida` carries none, so a hand run watches 0x380b8): refs [formIds] (numbers or hex strings; default [0x380b8])
// the forms whose apply, load3D and set3D are stamped and whose windows open; cap (150) each row kind's rows outside a window
// before it only counts (faults, poisoned rows and exceptions always print; a freed source with another sink prints its first
// 100); ttl (900 s) until the hooks detach; flushMs (600, 0 off). Run: `c1: frida {script: corpse-lay-heap.js, params: {refs:
// [0x380b8]}}` on the applying seat before the kill, then `wait: 15` (the attach and the compile). 1.6.1170 only.
'use strict';
function emit(obj) {
  obj.t = Date.now();
  send(obj);
  console.log(JSON.stringify(obj));
}

const PARAMS =
  typeof LAB_PARAMS === 'object' && LAB_PARAMS ? LAB_PARAMS : typeof params === 'object' && params ? params : {};

// top-level names carry the prefix cl (a name matching a Frida global fails the load, lab/frida/npc-roll.js's note)
function clIdSet(list) {
  const s = new Set();
  for (const v of list) s.add((typeof v === 'string' ? parseInt(v, 16) : Number(v)) >>> 0);
  return s;
}
const clRefs = clIdSet(Array.isArray(PARAMS.refs) ? PARAMS.refs : [0x380b8]);
const clCap = PARAMS.cap >>> 0 || 150;
const clTtlMs = (Number(PARAMS.ttl) > 0 ? Number(PARAMS.ttl) : 900) * 1000;
const clFlushMs = PARAMS.flushMs === undefined ? 600 : Math.max(0, Number(PARAMS.flushMs) || 0);
const clPostLayMs = 1000;
const clElements = 16;
const clScanQwords = 2048;
const clFaultOtherCap = 100;

// offsets by `just addr <id>` for 1.6.1170 on 2026-11-06 (never from memory, CLAUDE.md rule 1)
const OFFSETS = {
  '1.6.1170.0': {
    addEventSink: 0x2f7f80, // 20140
    removeEventSink: 0x6b0350, // 38402
    allocate: 0xcc40c0, // 68115
    reallocate: 0xcc4310, // 68116
    deallocate: 0xcc4510, // 68117
    apply: 0x603700, // 35568
    load3D: 0x65e9e0, // 37177
    set3D: 0x65ebd0, // 37178
    mediator: 0x3198690, // 504076 (data)
    mediatorPointer: 0x31877b8, // 403567 (data)
    mediatorVtable: 0x18a05a0, // 207706 (data)
    graphVtable: 0x19881f8, // 232870 (data)
    mainSingleton: 0x31872c0, // 403449 (data)
  },
};
const clIds = {
  addEventSink: 20140, removeEventSink: 38402, allocate: 68115, reallocate: 68116, deallocate: 68117, apply: 35568,
  load3D: 37177, set3D: 37178, mediator: 504076, mediatorPointer: 403567, mediatorVtable: 207706, graphVtable: 232870,
  mainSingleton: 403449,
};
// function starts for labeling return addresses, `just addr` the same day; a label reaches 0x2000 past its start
const clKnownStarts = {
  '1.6.1170.0': [
    [0x18e180, '13019 the queued reference Load3D'],
    [0x18f810, '13049 BackgroundProcessThread loop'],
    [0x1934d0, '13108 QueuedCharacter step'],
    [0x2726a0, '17667 the base model clone for a reference'],
    [0x2e3970, '19727 TESObjectREFR::Load3D'],
    [0x2f7f80, '20140 AddEventSink'],
    [0x3bb600, '24721 actor-base Clone3D'],
    [0x603700, '35568 change-form apply'],
    [0x65e9e0, '37177 Actor::Load3D'],
    [0x65ebd0, '37178 Actor::Set3D'],
    [0x69da60, '37983 mediator sink caller'],
    [0x69e700, '37987 mediator sink caller'],
    [0x6b0350, '38402 RemoveEventSink'],
    [0x6cd080, '38948 ActorMediator constructor'],
    [0x6cd390, '38951 mediator callback caller'],
    [0x74bb00, '40737 mediator sink caller'],
    [0x74e2b0, '40754 mediator sink caller'],
    [0xcc40c0, '68115 MemoryManager::Allocate'],
    [0xcc4310, '68116 MemoryManager::Reallocate'],
    [0xcc4510, '68117 MemoryManager::Deallocate'],
    [0xcd0d80, '68445 background thread entry'],
    [0xd17f60, '70188 NiObject::Clone'],
    [0xd18200, '70199 NiObject constructor'],
    [0xd1bb10, '70244 NiAVObject::CopyMembers'],
    [0xd1caa0, '70280 NiNode::CopyMembers'],
    [0xd259e0, '70500 NiObjectNET::CopyMembers'],
    [0xd35020, '70860 NiExtraData constructor'],
    [0xd4d450, '71432 NiIntegerExtraData::CreateClone'],
    [0x14797d0, '105473 BSFadeNode::CreateClone'],
  ],
};

// layouts (CommonLibSSE-NG b93280e8, file:line in the header)
const CL_SRC = { sinks: 0x00, pendingRegisters: 0x18, pendingUnregisters: 0x30, lock: 0x48, notifying: 0x50 }; // BSTEvent.h:130-134
const CL_ARR = { data: 0x00, capacity: 0x08, size: 0x10 }; // BSTArray.h:140-141, :47 at +0x10 (:374-376)
const CL_GRAPH = { transformDelta: 0x10, animationGraphEvent: 0x68, holder: 0x210 }; // BShkbAnimationGraph.h:31, :32, :135
const CL_FORM_ID = 0x14; // TESForm.h:354
const CL_MAIN_THREAD = 0x28; // Main.h:87
// the CModule's memory, laid out by hand on both sides (x64 natural alignment)
const CL_SH = { mediator: 0x00, vtable: 0x08, ringHead: 0x10, armed: 0x14, alloc: 0x18, realloc: 0x20, free: 0x28, add: 0x30,
  remove: 0x38, hits: 0x40, reused: 0x48, pulse: 0x50, sized: 0x58, size: 0x60 };
const CL_SIZE_N = 1048576;
const CL_FREED_N = 262144;
const CL_RING_N = 65536;
const CL_HIT = { kind: 0x00, phase: 0x04, a: 0x08, b: 0x10, ret: 0x18, rsp: 0x20, tid: 0x28, freed: 0x30, via: 0x34, link: 0x38 };
const CL_FREED_WHAT = ['sinks', 'pendingRegisters', 'pendingUnregisters', 'source', 'graph at source-0x10', 'graph at source-0x68'];

const CL_C_SOURCE = `
#include <gum/guminterceptor.h>
#ifdef CS_ATOMIC
#include <glib.h>
#endif

#define CS_SIZE_N 1048576
#define CS_FREED_N 262144
#define CS_RING_N 65536
#define CS_FREED 1
#define CS_REUSED 2
#define CS_MIX(p) ((guint32) (((p) >> 4) ^ ((p) >> 20) ^ ((p) >> 36)))

typedef struct _CsShared CsShared;
typedef struct _CsSize CsSize;
typedef struct _CsFreed CsFreed;
typedef struct _CsHit CsHit;
typedef struct _CsAllocCall CsAllocCall;
typedef struct _CsSinkCall CsSinkCall;

struct _CsShared
{
  guint64 mediator;   /* 0x00 504076's storage */
  guint64 vtable;     /* 0x08 VTABLE_ActorMediator */
  gint ring_head;     /* 0x10 */
  guint32 armed;      /* 0x14 */
  guint64 n_alloc;    /* 0x18 every call, unsynchronized (a rate, not a count) */
  guint64 n_realloc;  /* 0x20 */
  guint64 n_free;     /* 0x28 */
  guint64 n_add;      /* 0x30 */
  guint64 n_remove;   /* 0x38 */
  guint64 n_hits;     /* 0x40 */
  guint64 n_reused;   /* 0x48 */
  guint64 n_pulse;    /* 0x50 kernel32!Sleep */
  guint64 n_sized;    /* 0x58 */
};

struct _CsSize
{
  guint64 ptr;   /* 0x00 */
  guint32 size;  /* 0x08 */
  guint32 gen;   /* 0x0c bumped by every allocation written to the slot */
};

struct _CsFreed
{
  guint64 ptr;    /* 0x00 */
  guint32 size;   /* 0x08 0 when the size table did not know it */
  guint32 seq;    /* 0x0c the ring's index at the free */
  guint64 t;      /* 0x10 GetTickCount64 at the free (ms) */
  guint32 tid;    /* 0x18 */
  guint32 state;  /* 0x1c 1 freed, 2 reused */
};

struct _CsHit
{
  guint32 kind;   /* 0x00 0 add, 1 remove, 2 poisoned, 3 poisoned link */
  guint32 phase;  /* 0x04 0 enter, 1 leave */
  guint64 a;      /* 0x08 the source, or the block */
  guint64 b;      /* 0x10 the sink, or the size */
  guint64 ret;    /* 0x18 the caller's return address */
  guint64 rsp;    /* 0x20 where a stack scan starts */
  guint64 tid;    /* 0x28 */
  guint32 freed;  /* 0x30 the freed mask */
  guint32 via;    /* 0x34 the mediator's sink (1), or 68116 (1) */
  guint64 link;   /* 0x38 a block's first qword */
};

struct _CsAllocCall
{
  guint64 size;
  guint64 old;
  guint32 gen;
  guint32 pad;
};

struct _CsSinkCall
{
  guint32 hit;
  guint32 kind;
  guint32 mine;
  guint32 pad;
  guint64 src;
  guint64 sink;
};

extern volatile CsShared cs_shared;
extern volatile CsSize cs_sizes[CS_SIZE_N];
extern volatile CsFreed cs_freed[CS_FREED_N];
extern volatile CsFreed cs_ring[CS_RING_N];
extern guint64 cs_ticks (void);
extern void cs_on_hit (CsHit * hit);

static guint32
cs_state_of (guint64 p)
{
  volatile CsFreed * e;

  if (p == 0)
    return 0;
  e = &cs_freed[CS_MIX (p) & (CS_FREED_N - 1)];
  if (e->ptr != p)
    return 0;
  return e->state;
}

static void
cs_out (GumInvocationContext * ic, guint32 kind, guint32 phase, guint64 a, guint64 b, guint32 freed, guint32 via,
    guint64 link)
{
  CsHit hit;

  hit.kind = kind;
  hit.phase = phase;
  hit.a = a;
  hit.b = b;
#ifdef CS_RET
  hit.ret = (guint64) (gsize) gum_invocation_context_get_return_address (ic);
#else
  hit.ret = 0;
#endif
#ifdef CS_CPU
  hit.rsp = (guint64) ic->cpu_context->rsp;
#else
  hit.rsp = (guint64) (gsize) &hit;
#endif
  hit.tid = (guint64) gum_invocation_context_get_thread_id (ic);
  hit.freed = freed;
  hit.via = via;
  hit.link = link;
  cs_shared.n_hits++;
  cs_on_hit (&hit);
}

static void
cs_note_free (GumInvocationContext * ic, guint64 p)
{
  volatile CsSize * s;
  volatile CsFreed * e;
  volatile CsFreed * r;
  guint32 size = 0;
  guint64 t;
  guint32 tid;
  guint32 k;

  s = &cs_sizes[CS_MIX (p) & (CS_SIZE_N - 1)];
  if (s->ptr == p)
  {
    size = s->size;
    cs_shared.n_sized++;
  }
  t = cs_ticks ();
  tid = (guint32) gum_invocation_context_get_thread_id (ic);
#ifdef CS_ATOMIC
  k = (guint32) g_atomic_int_add (&cs_shared.ring_head, 1);
#else
  k = (guint32) cs_shared.ring_head;
  cs_shared.ring_head = (gint) (k + 1);
#endif
  e = &cs_freed[CS_MIX (p) & (CS_FREED_N - 1)];
  e->state = 0;
  e->size = size;
  e->seq = k;
  e->t = t;
  e->tid = tid;
  e->ptr = p;
  e->state = CS_FREED;
  r = &cs_ring[k & (CS_RING_N - 1)];
  r->ptr = 0;
  r->size = size;
  r->seq = k;
  r->t = t;
  r->tid = tid;
  r->state = 0;
  r->ptr = p;
}

static void
cs_note_alloc (GumInvocationContext * ic, guint64 ret, guint64 size, guint32 via)
{
  volatile CsSize * s;
  volatile CsFreed * e;
  guint64 link;

  s = &cs_sizes[CS_MIX (ret) & (CS_SIZE_N - 1)];
  s->gen++;
  s->size = (guint32) size;
  s->ptr = ret;
  e = &cs_freed[CS_MIX (ret) & (CS_FREED_N - 1)];
  if (e->ptr == ret && e->state == CS_FREED)
  {
    e->state = CS_REUSED;
    cs_shared.n_reused++;
  }
  if (ret == cs_shared.mediator || ret == cs_shared.vtable)
  {
    cs_out (ic, 2, 1, ret, size, 0, via, 0);
    return;
  }
  if (via != 0)
    return;
  link = *(const volatile guint64 *) (gsize) ret;
  if (link == cs_shared.mediator || link == cs_shared.vtable)
    cs_out (ic, 3, 1, ret, size, 0, via, link);
}

void
cs_alloc_enter (GumInvocationContext * ic)
{
  CsAllocCall * call = GUM_IC_GET_INVOCATION_DATA (ic, CsAllocCall);

  call->size = (guint64) (gsize) gum_invocation_context_get_nth_argument (ic, 1);
}

void
cs_alloc_leave (GumInvocationContext * ic)
{
  CsAllocCall * call = GUM_IC_GET_INVOCATION_DATA (ic, CsAllocCall);
  guint64 ret;

  cs_shared.n_alloc++;
  if (cs_shared.armed == 0)
    return;
  ret = (guint64) (gsize) gum_invocation_context_get_return_value (ic);
  if (ret != 0)
    cs_note_alloc (ic, ret, call->size, 0);
}

void
cs_realloc_enter (GumInvocationContext * ic)
{
  CsAllocCall * call = GUM_IC_GET_INVOCATION_DATA (ic, CsAllocCall);

  call->old = (guint64) (gsize) gum_invocation_context_get_nth_argument (ic, 1);
  call->size = (guint64) (gsize) gum_invocation_context_get_nth_argument (ic, 2);
  call->gen = call->old != 0 ? cs_sizes[CS_MIX (call->old) & (CS_SIZE_N - 1)].gen : 0;
}

void
cs_realloc_leave (GumInvocationContext * ic)
{
  CsAllocCall * call = GUM_IC_GET_INVOCATION_DATA (ic, CsAllocCall);
  volatile CsSize * s;
  guint64 ret;

  cs_shared.n_realloc++;
  if (cs_shared.armed == 0)
    return;
  ret = (guint64) (gsize) gum_invocation_context_get_return_value (ic);
  if (ret == 0)
    return;
  if (ret == call->old)
  {
    s = &cs_sizes[CS_MIX (ret) & (CS_SIZE_N - 1)];
    if (s->ptr == ret)
      s->size = (guint32) call->size;
    return;
  }
  if (call->old != 0 && cs_sizes[CS_MIX (call->old) & (CS_SIZE_N - 1)].gen == call->gen)
    cs_note_free (ic, call->old);
  cs_note_alloc (ic, ret, call->size, 1);
}

void
cs_free_enter (GumInvocationContext * ic)
{
  guint64 p = (guint64) (gsize) gum_invocation_context_get_nth_argument (ic, 1);

  cs_shared.n_free++;
  if (p == 0 || cs_shared.armed == 0)
    return;
  cs_note_free (ic, p);
}

static guint32
cs_source_freed (guint64 src)
{
  const volatile guint64 * w = (const volatile guint64 *) (gsize) src;
  guint32 m = 0;

  if (cs_state_of (w[0]) == CS_FREED)
    m |= 1;
  if (cs_state_of (w[3]) == CS_FREED)
    m |= 2;
  if (cs_state_of (w[6]) == CS_FREED)
    m |= 4;
  if (cs_state_of (src) == CS_FREED)
    m |= 8;
  if (cs_state_of (src - 0x10) == CS_FREED)
    m |= 16;
  if (cs_state_of (src - 0x68) == CS_FREED)
    m |= 32;
  return m;
}

static void
cs_sink_enter (GumInvocationContext * ic, guint32 kind)
{
  CsSinkCall * call = GUM_IC_GET_INVOCATION_DATA (ic, CsSinkCall);
  guint64 src;
  guint64 sink;
  guint32 freed;
  guint32 mine;

  call->hit = 0;
  if (kind == 0)
    cs_shared.n_add++;
  else
    cs_shared.n_remove++;
  if (cs_shared.armed == 0)
    return;
  src = (guint64) (gsize) gum_invocation_context_get_nth_argument (ic, 0);
  sink = (guint64) (gsize) gum_invocation_context_get_nth_argument (ic, 1);
  if (src == 0 || sink == 0)
    return;
  mine = sink == cs_shared.mediator ? 1 : 0;
  freed = cs_source_freed (src);
  if (mine == 0 && freed == 0)
    return;
  call->hit = 1;
  call->kind = kind;
  call->mine = mine;
  call->src = src;
  call->sink = sink;
  if (freed != 0)
    cs_out (ic, kind, 0, src, sink, freed, mine, 0);
}

void
cs_add_enter (GumInvocationContext * ic)
{
  cs_sink_enter (ic, 0);
}

void
cs_remove_enter (GumInvocationContext * ic)
{
  cs_sink_enter (ic, 1);
}

void
cs_sink_leave (GumInvocationContext * ic)
{
  CsSinkCall * call = GUM_IC_GET_INVOCATION_DATA (ic, CsSinkCall);

  if (call->hit == 0)
    return;
  cs_out (ic, call->kind, 1, call->src, call->sink, cs_source_freed (call->src), call->mine, 0);
}

void
cs_pulse (GumInvocationContext * ic)
{
  cs_shared.n_pulse++;
}

guint32
cs_lookup (gpointer at, CsFreed * out)
{
  guint64 p = (guint64) (gsize) at;
  volatile CsFreed * e;

  out->ptr = 0;
  out->state = 0;
  if (p == 0)
    return 0;
  e = &cs_freed[CS_MIX (p) & (CS_FREED_N - 1)];
  out->ptr = e->ptr;
  out->size = e->size;
  out->seq = e->seq;
  out->t = e->t;
  out->tid = e->tid;
  out->state = e->state;
  return out->ptr == p ? out->state : 0;
}

gint
cs_ring_find (gpointer at, CsFreed * out)
{
  guint64 addr = (guint64) (gsize) at;
  guint32 head = (guint32) cs_shared.ring_head;
  guint32 n;
  volatile CsFreed * e;
  guint64 p;
  guint64 size;

  for (n = 1; n <= CS_RING_N; n++)
  {
    e = &cs_ring[(head - n) & (CS_RING_N - 1)];
    p = e->ptr;
    if (p == 0)
      continue;
    size = e->size;
    if (addr == p || (size != 0 && addr > p && addr < p + size))
    {
      out->ptr = p;
      out->size = (guint32) size;
      out->seq = e->seq;
      out->t = e->t;
      out->tid = e->tid;
      out->state = cs_state_of (p);
      return (gint) n;
    }
  }
  return -1;
}
`;
// the CModule variants, tried in order: glib's atomic ring index, the hook's own stack pointer and the caller's return address,
// then dropping one each time (without CS_CPU the scan starts at the C frame's own stack, deeper by the listener's frames;
// without CS_RET the rows carry no caller); the ready row names the one that compiled
const CL_VARIANTS = [
  { name: 'atomic+cpu+ret', defs: '#define CS_ATOMIC 1\n#define CS_CPU 1\n#define CS_RET 1\n' },
  { name: 'cpu+ret', defs: '#define CS_CPU 1\n#define CS_RET 1\n' },
  { name: 'ret', defs: '#define CS_RET 1\n' },
  { name: 'plain', defs: '' },
];

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

function hex(n) {
  return '0x' + (n >>> 0).toString(16);
}
function clU32(p) {
  try {
    return p.readU32();
  } catch (e) {
    return null;
  }
}
function clU8(p) {
  try {
    return p.readU8();
  } catch (e) {
    return null;
  }
}
function clFormId(form) {
  try {
    return form.isNull() ? 0 : form.add(CL_FORM_ID).readU32() >>> 0;
  } catch (e) {
    return 0;
  }
}

const exe = Process.getModuleByName('SkyrimSE.exe');
const version = fileVersion(exe.path);
const at = OFFSETS[version];
if (at === undefined) {
  emit({ error: 'no offsets for this runtime', version: version, tid: Process.getCurrentThreadId() });
} else {
  const exeEnd = exe.base.add(exe.size);
  const clMediator = exe.base.add(at.mediator);
  const clMediatorVt = exe.base.add(at.mediatorVtable);
  const clGraphVt = exe.base.add(at.graphVtable);
  const clKnown = clKnownStarts[version].slice().sort(function (x, y) {
    return x[0] - y[0];
  });
  let clModules = null;
  try {
    clModules = new ModuleMap();
  } catch (e) {
    clModules = null;
  }

  const clFailures = {};
  function clFail(where, e) {
    clFailures[where] = (clFailures[where] || 0) + 1;
    if (clFailures[where] <= 5)
      emit({ fn: 'error', where: where, tid: Process.getCurrentThreadId(), error: String(e), stack: e && e.stack ? String(e.stack).slice(0, 300) : null });
  }
  function clInExe(p) {
    try {
      return !p.isNull() && p.compare(exe.base) >= 0 && p.compare(exeEnd) < 0;
    } catch (e) {
      return false;
    }
  }
  function clNear(off) {
    let best = null;
    for (const k of clKnown) {
      if (k[0] <= off) best = k;
      else break;
    }
    return best !== null && off - best[0] < 0x2000 ? best[1] + '+0x' + (off - best[0]).toString(16) : null;
  }
  function clWhere(p) {
    if (p === null || p === undefined || p.isNull()) return '0x0';
    if (clInExe(p)) {
      const off = p.sub(exe.base).toUInt32();
      const near = clNear(off);
      return 'SkyrimSE.exe+0x' + off.toString(16) + (near !== null ? ' (' + near + ')' : '');
    }
    let m = null;
    try {
      m = clModules !== null ? clModules.find(p) : Process.findModuleByAddress(p);
    } catch (e) {
      m = null;
    }
    return m !== null ? m.name + '+0x' + p.sub(m.base).toString(16) : p.toString();
  }
  function clCaller(ret) {
    if (!ret || ret.isNull()) return { ret: '0x0' };
    if (clInExe(ret)) {
      const off = ret.sub(exe.base).toUInt32();
      const row = { ret: 'SkyrimSE.exe+0x' + off.toString(16) };
      const near = clNear(off);
      if (near !== null) row.near = near;
      return row;
    }
    return { ret: clWhere(ret) };
  }
  function clPtrVt(p) {
    if (p.isNull()) return '0x0';
    try {
      return p.toString() + ' vt ' + clWhere(p.readPointer());
    } catch (e) {
      return p.toString();
    }
  }
  // a stack scan: every qword from rsp up that lands in the exe or a plugin right after a call instruction
  function clAfterCall(q) {
    try {
      const b = new Uint8Array(q.sub(7).readByteArray(7));
      if (b[2] === 0xe8) return true; // call rel32
      for (let k = 0; k < 6; k++) if (b[k] === 0xff && (b[k + 1] & 0x38) === 0x10) return true; // FF /2, any length
      return false;
    } catch (e) {
      return false;
    }
  }
  function clStack(rsp, max) {
    const frames = [];
    if (rsp.isNull()) return frames;
    for (let i = 0; i < clScanQwords && frames.length < max; i++) {
      let q;
      try {
        q = rsp.add(i * 8).readPointer();
      } catch (e) {
        break;
      }
      if (q.isNull()) continue;
      let keep = clInExe(q);
      if (!keep && clModules !== null) {
        const m = clModules.find(q);
        keep = m !== null && m.name.toLowerCase().indexOf('frida') < 0;
      }
      if (keep && clAfterCall(q)) frames.push(clWhere(q));
    }
    return frames;
  }
  function clMainThread() {
    try {
      const m = exe.base.add(at.mainSingleton).readPointer();
      return m.isNull() ? 0 : m.add(CL_MAIN_THREAD).readU32();
    } catch (e) {
      return -1;
    }
  }
  let clMainTid = clMainThread();

  // the CModule's memory: page multiples come from the OS zeroed; kept for the script's life (the C side writes into them)
  const clShared = Memory.alloc(CL_SH.size);
  clShared.writeByteArray(new ArrayBuffer(CL_SH.size));
  clShared.add(CL_SH.mediator).writePointer(clMediator);
  clShared.add(CL_SH.vtable).writePointer(clMediatorVt);
  clShared.add(CL_SH.armed).writeU32(1);
  const clSizes = Memory.alloc(CL_SIZE_N * 16);
  const clFreed = Memory.alloc(CL_FREED_N * 32);
  const clRing = Memory.alloc(CL_RING_N * 32);
  const clScratch = Memory.alloc(32);
  const clK32 = Process.getModuleByName('kernel32.dll');
  const clTicksAddr = clK32.getExportByName('GetTickCount64');
  // every helper the JavaScript calls is exclusive: a cooperative call lets another hit's callback run and reuse clScratch
  const clTicks = new NativeFunction(clTicksAddr, 'uint64', [], { scheduling: 'exclusive' });
  function clAgoMs(ms) {
    return ms === 0 ? null : clTicks().toNumber() - ms;
  }
  function clRingHead() {
    return clShared.add(CL_SH.ringHead).readU32();
  }

  let clSeq = 0;
  const clCounts = {};
  function clCount(name) {
    if (!clCounts[name]) clCounts[name] = { n: 0, logged: 0, capped: 0 };
    return clCounts[name];
  }
  const clJs = { apply: 0, load3D: 0, set3D: 0 };
  let clFaults = 0;
  let clFaultsOther = 0;
  let clPoisoned = 0;
  let clLinks = 0;
  let clExceptions = 0;
  let clHolds = 0;
  let clLastFault = null;
  const clApplyOpen = new Map(); // tid -> { form, t }
  const clLoadOpen = new Map(); // tid -> { form, background, t }
  const clLays = []; // each watched apply from its enter to one second past its leave

  function clOpenWindows() {
    const out = [];
    const now = Date.now();
    clApplyOpen.forEach(function (w, tid) {
      out.push({ fn: 'apply', form: hex(w.form), tid: tid, ms: now - w.t });
    });
    clLoadOpen.forEach(function (w, tid) {
      out.push({ fn: 'load3D', form: hex(w.form), tid: tid, background: w.background, ms: now - w.t });
    });
    return out;
  }
  function clNewTally() {
    return { sinkAdd: {}, sinkRemove: {}, faults: 0, poisoned: 0, poisonedLink: 0, load3D: [], set3D: [], exceptions: 0 };
  }
  function clTally(key, tid, detail) {
    const now = Date.now();
    for (const lay of clLays) {
      if (now > lay.until) continue;
      const t = lay.tally;
      if (key === 'sinkAdd' || key === 'sinkRemove') {
        const k = tid === clMainTid ? 'main' : String(tid);
        t[key][k] = (t[key][k] || 0) + 1;
      } else if (key === 'load3D' || key === 'set3D') {
        if (t[key].length < 32) t[key].push(detail);
      } else {
        t[key]++;
      }
    }
  }
  function clEmitLay(lay) {
    const t = lay.tally;
    let offMain = 0;
    Object.keys(t.sinkAdd).forEach(function (k) {
      if (k !== 'main') offMain += t.sinkAdd[k];
    });
    emit({
      fn: 'layWindow', tid: Process.getCurrentThreadId(), form: hex(lay.form), applyTid: lay.tid, enterT: lay.enterT,
      leaveT: lay.leaveT, untilT: lay.until, tally: t,
      pattern: { mediatorRemoveOnMain: (t.sinkRemove.main || 0) > 0, mediatorAddOffMain: offMain > 0, fault: t.faults > 0, poisoned: t.poisoned > 0 },
    });
    const i = clLays.indexOf(lay);
    if (i >= 0) clLays.splice(i, 1);
  }

  // the free record and the ring, read through the CModule's helpers (null until it compiles)
  let clLookupFn = null;
  let clRingFindFn = null;
  function clEntry(st, p) {
    const block = clScratch.readPointer();
    const size = clScratch.add(8).readU32();
    const seq = clScratch.add(12).readU32();
    const ms = clScratch.add(16).readU64().toNumber();
    const byTid = clScratch.add(24).readU32();
    const r = {
      state: st === 1 ? 'freed' : st === 2 ? 'reused' : 'unknown',
      block: block.toString(),
      size: size,
      freesAgo: (clRingHead() - seq) >>> 0,
      msAgo: clAgoMs(ms),
      byTid: byTid,
    };
    if (p !== undefined && !p.equals(block)) r.offset = '0x' + p.sub(block).toString(16);
    return r;
  }
  function clLookup(p) {
    if (clLookupFn === null || p.isNull()) return null;
    const st = clLookupFn(p, clScratch);
    return st === 0 ? null : clEntry(st, p);
  }
  function clRingFind(p) {
    if (clRingFindFn === null || p.isNull()) return null;
    const n = clRingFindFn(p, clScratch);
    if (n < 0) return null;
    const r = clEntry(clScratch.add(28).readU32(), p);
    r.freesAgo = n;
    return r;
  }
  function clArray(src, off, withElements) {
    try {
      const arr = src.add(off);
      const data = arr.add(CL_ARR.data).readPointer();
      const row = { data: data.toString(), capacity: arr.add(CL_ARR.capacity).readU32(), size: arr.add(CL_ARR.size).readU32() };
      const f = clLookup(data);
      if (f !== null) row.block = f;
      if (withElements && !data.isNull() && row.size > 0) {
        const n = Math.min(row.size, clElements);
        const els = [];
        let mAt = -1;
        for (let i = 0; i < n; i++) {
          const e = data.add(i * 8).readPointer();
          if (e.equals(clMediator)) {
            if (mAt < 0) mAt = i;
            els.push('mediator');
          } else {
            els.push(clPtrVt(e));
          }
        }
        row.elements = els;
        row.mediatorAt = mAt;
      }
      return row;
    } catch (e) {
      return { error: String(e) };
    }
  }
  function clGraphOf(src) {
    const cands = [['animationGraphEvent', CL_GRAPH.animationGraphEvent], ['transformDelta', CL_GRAPH.transformDelta]];
    for (const c of cands) {
      const base = src.sub(c[1]);
      let vt;
      try {
        vt = base.readPointer();
      } catch (e) {
        continue;
      }
      if (!vt.equals(clGraphVt)) continue;
      let holder = null;
      try {
        const h = base.add(CL_GRAPH.holder).readPointer();
        holder = h.isNull() ? 0 : h.add(CL_FORM_ID).readU32() >>> 0;
      } catch (e) {
        holder = null;
      }
      return { base: base.toString(), source: c[0], holder: holder === null ? null : hex(holder), holderWatched: holder !== null && clRefs.has(holder), block: clLookup(base) };
    }
    return null;
  }
  function clMaskNames(mask) {
    const out = [];
    for (let i = 0; i < CL_FREED_WHAT.length; i++) if (mask & (1 << i)) out.push(CL_FREED_WHAT[i]);
    return out;
  }
  function clHold() {
    if (clFlushMs > 0 && clHolds < 40) {
      clHolds++;
      Thread.sleep(clFlushMs / 1000);
    }
  }

  // a mediator add or remove, or any on a freed source
  function clSinkRow(kind, phase, src, sink, ret, freedMask, mine) {
    const tid = Process.getCurrentThreadId();
    const fn = kind === 0 ? 'sinkAdd' : 'sinkRemove';
    const graph = clGraphOf(src);
    const windows = clOpenWindows();
    const fault = freedMask !== 0;
    const watched = (graph !== null && graph.holderWatched) || windows.length > 0;
    const c = clCount(fn + (mine === 1 ? '' : ':other'));
    c.n++;
    if (mine === 1 && phase === 1) clTally(fn, tid);
    if (fault) clTally('faults', tid);
    if (fault && mine !== 1 && ++clFaultsOther > clFaultOtherCap) {
      c.capped++;
      return;
    }
    if (!fault && !watched && c.logged >= clCap) {
      c.capped++;
      return;
    }
    c.logged++;
    const sourceInFreedBlock = clRingFind(src);
    const row = {
      fn: fn, phase: phase === 0 ? 'enter' : 'leave', seq: ++clSeq, tid: tid, main: tid === clMainTid,
      mediator: mine === 1, sink: mine === 1 ? 'mediator' : clPtrVt(sink), source: src.toString(), graph: graph,
      sourceInFreedBlock: sourceInFreedBlock, freedMask: freedMask, freedWhat: clMaskNames(freedMask), fault: fault, watched: watched,
      notifying: clU8(src.add(CL_SRC.notifying)),
      lock: { owner: clU32(src.add(CL_SRC.lock)), count: clU32(src.add(CL_SRC.lock + 4)) },
      sinks: clArray(src, CL_SRC.sinks, fault || watched),
      pendingRegisters: clArray(src, CL_SRC.pendingRegisters, fault || watched),
      pendingUnregisters: clArray(src, CL_SRC.pendingUnregisters, fault || watched),
      windows: windows,
    };
    Object.assign(row, clCaller(ret));
    if (fault) {
      clFaults++;
      clLastFault = { seq: row.seq, fn: fn, phase: row.phase, tid: tid, mediator: mine === 1 };
    }
    emit(row);
    if (fault && phase === 1 && mine === 1 && clHolds < 20) clHold();
  }
  // an allocation that handed out the mediator's storage or its vtable, or a block whose first qword names either
  function clAllocRow(kind, block, size, ret, rsp, via, link) {
    const tid = Process.getCurrentThreadId();
    const name = function (p) {
      return p.equals(clMediator) ? 'the mediator storage (504076)' : 'VTABLE_ActorMediator (207706)';
    };
    const row = { fn: 'alloc', seq: ++clSeq, tid: tid, main: tid === clMainTid, via: via === 1 ? 'reallocate' : 'allocate', block: block.toString(), size: size.toUInt32() };
    if (kind === 2) {
      row.poisoned = true;
      row.returned = name(block);
      clPoisoned++;
      clTally('poisoned', tid);
    } else {
      row.poisonedLink = true;
      row.link = name(link);
      clLinks++;
      clTally('poisonedLink', tid);
    }
    Object.assign(row, clCaller(ret));
    row.stack = clStack(rsp, 24);
    row.faultsBefore = clFaults;
    row.lastFault = clLastFault;
    row.windows = clOpenWindows();
    emit(row);
    clHold();
  }
  function clHit(hit) {
    const kind = hit.add(CL_HIT.kind).readU32();
    const phase = hit.add(CL_HIT.phase).readU32();
    const a = hit.add(CL_HIT.a).readPointer();
    const b = hit.add(CL_HIT.b).readPointer();
    const ret = hit.add(CL_HIT.ret).readPointer();
    const rsp = hit.add(CL_HIT.rsp).readPointer();
    const freed = hit.add(CL_HIT.freed).readU32();
    const via = hit.add(CL_HIT.via).readU32();
    const link = hit.add(CL_HIT.link).readPointer();
    if (kind === 0 || kind === 1) clSinkRow(kind, phase, a, b, ret, freed, via);
    else clAllocRow(kind, a, b, ret, rsp, via, link);
  }
  // kept for the script's life: the C side calls it
  const clOnHit = new NativeCallback(
    function (hit) {
      try {
        clHit(hit);
      } catch (e) {
        clFail('hit', e);
      }
    },
    'void',
    ['pointer'],
  );

  let clCm = null;
  let clCmVariant = null;
  const clCmErrors = [];
  const clSymbols = { cs_shared: clShared, cs_sizes: clSizes, cs_freed: clFreed, cs_ring: clRing, cs_ticks: clTicksAddr, cs_on_hit: clOnHit };
  for (const v of CL_VARIANTS) {
    try {
      clCm = new CModule(v.defs + CL_C_SOURCE, clSymbols);
      clCmVariant = v.name;
      break;
    } catch (e) {
      clCmErrors.push(v.name + ': ' + String(e).slice(0, 400));
    }
  }
  if (clCm !== null) {
    clLookupFn = new NativeFunction(clCm.cs_lookup, 'uint32', ['pointer', 'pointer'], { scheduling: 'exclusive' });
    clRingFindFn = new NativeFunction(clCm.cs_ring_find, 'int', ['pointer', 'pointer'], { scheduling: 'exclusive' });
  }

  // the self-test: 403567 names 504076's storage and the storage's first qword is VTABLE_ActorMediator (207706)
  const clSelf = { mainThread: clMainTid };
  try {
    const p = exe.base.add(at.mediatorPointer).readPointer();
    clSelf.pointer = clWhere(p);
    clSelf.pointerNamesStorage = p.equals(clMediator);
  } catch (e) {
    clSelf.pointer = 'unreadable: ' + e;
  }
  try {
    const q = clMediator.readPointer();
    clSelf.storageFirstQword = clWhere(q);
    clSelf.storageHoldsVtable = q.equals(clMediatorVt);
  } catch (e) {
    clSelf.storageFirstQword = 'unreadable: ' + e;
  }

  const clResolved = {};
  const clAttached = [];
  const clAttachErrors = [];
  function clBytes(p) {
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
  function clAttach(name, target, callbacks) {
    clResolved[name] = { id: clIds[name] || null, at: target.toString(), rva: clInExe(target) ? '0x' + target.sub(exe.base).toString(16) : null, bytes: clBytes(target) };
    try {
      Interceptor.attach(target, callbacks);
      clAttached.push(name);
    } catch (e) {
      clAttachErrors.push(name + ': ' + e);
    }
  }

  // 35568: a window per watched form on its thread, and its lay's tally
  clAttach('apply', exe.base.add(at.apply), {
    onEnter(args) {
      this.watch = false;
      try {
        clJs.apply++;
        const id = clFormId(args[1]);
        if (!clRefs.has(id)) return;
        const tid = Process.getCurrentThreadId();
        const now = Date.now();
        this.watch = true;
        this.form = id;
        clApplyOpen.set(tid, { form: id, t: now });
        clLays.push({ form: id, tid: tid, enterT: now, leaveT: 0, until: Infinity, tally: clNewTally() });
        emit(Object.assign({ fn: 'apply', phase: 'enter', seq: ++clSeq, tid: tid, main: tid === clMainTid, form: hex(id), windows: clOpenWindows() }, clCaller(this.returnAddress)));
      } catch (e) {
        clFail('apply', e);
      }
    },
    onLeave(retval) {
      if (!this.watch) return;
      try {
        const tid = Process.getCurrentThreadId();
        const now = Date.now();
        clApplyOpen.delete(tid);
        for (let i = clLays.length - 1; i >= 0; i--) {
          const lay = clLays[i];
          if (lay.form === this.form && lay.tid === tid && lay.leaveT === 0) {
            lay.leaveT = now;
            lay.until = now + clPostLayMs;
            setTimeout(function () {
              clEmitLay(lay);
            }, clPostLayMs + 20);
            break;
          }
        }
        emit({ fn: 'apply', phase: 'leave', seq: ++clSeq, tid: tid, main: tid === clMainTid, form: hex(this.form), ret: retval.toInt32() & 0xff });
      } catch (e) {
        clFail('apply:leave', e);
      }
    },
  });
  // 37177: a watched actor's 3D load, its thread and whether it is the background's
  clAttach('load3D', exe.base.add(at.load3D), {
    onEnter(args) {
      this.watch = false;
      try {
        clJs.load3D++;
        const id = clFormId(args[0]);
        if (!clRefs.has(id)) return;
        const tid = Process.getCurrentThreadId();
        const background = args[1].toInt32() & 0xff;
        this.watch = true;
        this.form = id;
        clLoadOpen.set(tid, { form: id, background: background, t: Date.now() });
        clTally('load3D', tid, { tid: tid, main: tid === clMainTid, background: background });
        emit(Object.assign({ fn: 'load3D', phase: 'enter', seq: ++clSeq, tid: tid, main: tid === clMainTid, actor: hex(id), background: background, windows: clOpenWindows() }, clCaller(this.returnAddress)));
      } catch (e) {
        clFail('load3D', e);
      }
    },
    onLeave(retval) {
      if (!this.watch) return;
      try {
        const tid = Process.getCurrentThreadId();
        clLoadOpen.delete(tid);
        emit({ fn: 'load3D', phase: 'leave', seq: ++clSeq, tid: tid, main: tid === clMainTid, actor: hex(this.form), root: retval.toString() });
      } catch (e) {
        clFail('load3D:leave', e);
      }
    },
  });
  // 37178: a watched actor's Set3D (the lay's null node)
  clAttach('set3D', exe.base.add(at.set3D), {
    onEnter(args) {
      try {
        clJs.set3D++;
        const id = clFormId(args[0]);
        if (!clRefs.has(id)) return;
        const tid = Process.getCurrentThreadId();
        const nullNode = args[1].isNull();
        clTally('set3D', tid, { tid: tid, main: tid === clMainTid, nullNode: nullNode });
        emit(Object.assign({ fn: 'set3D', seq: ++clSeq, tid: tid, main: tid === clMainTid, actor: hex(id), node: args[1].toString(), nullNode: nullNode, queue3DTasks: args[2].toInt32() & 0xff, windows: clOpenWindows() }, clCaller(this.returnAddress)));
      } catch (e) {
        clFail('set3D', e);
      }
    },
  });
  // the native side: the heap and the two sink calls (none attach when the CModule did not compile)
  if (clCm !== null) {
    clAttach('allocate', exe.base.add(at.allocate), { onEnter: clCm.cs_alloc_enter, onLeave: clCm.cs_alloc_leave });
    clAttach('reallocate', exe.base.add(at.reallocate), { onEnter: clCm.cs_realloc_enter, onLeave: clCm.cs_realloc_leave });
    clAttach('deallocate', exe.base.add(at.deallocate), { onEnter: clCm.cs_free_enter });
    clAttach('addEventSink', exe.base.add(at.addEventSink), { onEnter: clCm.cs_add_enter, onLeave: clCm.cs_sink_leave });
    clAttach('removeEventSink', exe.base.add(at.removeEventSink), { onEnter: clCm.cs_remove_enter, onLeave: clCm.cs_sink_leave });
    try {
      clAttach('sleep', clK32.getExportByName('Sleep'), { onEnter: clCm.cs_pulse });
    } catch (e) {
      clAttachErrors.push('sleep: ' + e);
    }
  }

  // first-chance faults, logged and passed on (the game's own handlers and CrashLogger run after)
  Process.setExceptionHandler(function (d) {
    try {
      if (d.type === 'breakpoint' || d.type === 'single-step' || d.type === 'guard-page') return false;
      clExceptions++;
      if (clExceptions > 20) return false;
      const tid = Process.getCurrentThreadId();
      const c = d.context;
      let rcx = null;
      try {
        rcx = c.rcx;
      } catch (e) {
        rcx = null;
      }
      const row = {
        fn: 'exception', seq: ++clSeq, tid: tid, main: tid === clMainTid, type: d.type, at: clWhere(d.address),
        memory: d.memory ? { operation: d.memory.operation, address: clWhere(d.memory.address) } : null,
        rcx: rcx === null ? null : clWhere(rcx), rcxIsVtable: rcx !== null && rcx.equals(clMediatorVt), rcxIsMediator: rcx !== null && rcx.equals(clMediator),
        poisonedBefore: clPoisoned, poisonedLinksBefore: clLinks, faultsBefore: clFaults, lastFault: clLastFault, windows: clOpenWindows(),
      };
      try {
        row.stack = Thread.backtrace(c, Backtracer.FUZZY).slice(0, 24).map(clWhere);
      } catch (e) {
        row.stack = 'unreadable: ' + e;
      }
      clTally('exceptions', tid);
      emit(row);
      if (clExceptions <= 5) clHold();
    } catch (e) {
      // nothing: the fault goes on to the game's handlers
    }
    return false;
  });

  emit({
    ready: true, script: 'corpse-lay-heap.js', version: version, pid: Process.id, tid: Process.getCurrentThreadId(),
    base: exe.base.toString(), hooks: clAttached, attachErrors: clAttachErrors, resolved: clResolved, ids: clIds,
    heap: clCm !== null, cmodule: clCmVariant, cmoduleErrors: clCmErrors, selfTest: clSelf, mainThread: clMainTid,
    refs: Array.from(clRefs).map(hex), cap: clCap, ttlS: clTtlMs / 1000, flushMs: clFlushMs,
    tables: { sizes: CL_SIZE_N, freeRecord: CL_FREED_N, ring: CL_RING_N },
  });
  setInterval(function () {
    clMainTid = clMainThread();
    const s = clShared;
    const q = function (off) {
      return s.add(off).readU64().toNumber();
    };
    emit({
      fn: 'liveness', tid: Process.getCurrentThreadId(), pid: Process.id, mainThread: clMainTid,
      native: clCm === null ? null : {
        allocate: q(CL_SH.alloc), reallocate: q(CL_SH.realloc), deallocate: q(CL_SH.free), addEventSink: q(CL_SH.add),
        removeEventSink: q(CL_SH.remove), hits: q(CL_SH.hits), reused: q(CL_SH.reused), sizedFrees: q(CL_SH.sized),
        pulse: q(CL_SH.pulse), ringHead: s.add(CL_SH.ringHead).readU32(), armed: s.add(CL_SH.armed).readU32(),
      },
      js: clJs, rows: clCounts, faults: clFaults, poisoned: clPoisoned, poisonedLinks: clLinks, exceptions: clExceptions,
      holds: clHolds, windows: clOpenWindows(), failures: clFailures,
    });
  }, 10000);
  setTimeout(function () {
    clShared.add(CL_SH.armed).writeU32(0);
    try {
      Interceptor.detachAll();
    } catch (e) {
      clFail('ttl', e);
    }
    emit({ fn: 'ttl', tid: Process.getCurrentThreadId(), seconds: clTtlMs / 1000, note: 'hooks detached; the CModule, its memory and the callback stay referenced' });
  }, clTtlMs);
  // keep every native object the C side holds reachable for the script's life
  globalThis.clKeep = [clCm, clOnHit, clShared, clSizes, clFreed, clRing, clScratch];
}
