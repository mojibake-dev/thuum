// thrall-link.js v1.3 DRAFT (thuum, 2026-11-12; the fresh review lab/.cache/drafts/reanimate/review-return-v1.2.md b42630b1 applied as
// written, ADR-064 amendment A): its fix 1 (the step runs only when the update's this is 401069's player, counts.notPlayer the
// others, run.player that pointer), its nits 4 (the liveness row's slot), 5 (the slot's current target named where 40447 was),
// 6 (HYPOTHESIS on "38799 put it back") and 8 (38786 filtered on Dead Thrall 0x7e8df). v1.2's header follows.
// thrall-link.js v1.2 DRAFT (thuum, 2026-11-12; the read of run 20261112-103005, lab/.cache/drafts/reanimate/read-return-103005.md
// a1597065: RED, the link never ran, since v1.1 replaced PlayerCharacter::Update only when VTABLE_PlayerCharacter slot 0xAD held
// 40447, and on c1 it held another module's function). Its decisions as taken: D1 A, whatever slot 0xAD holds is replaced,
// body-impose.js's idiom, the original called through the slot's prior target, and the ready row names the slot's module (name,
// base, offset); D2 B, the 38799 refresh armed by the probe (REFRESH_FRAMES 30); D3 A, the thrall's scene (slot 0x4A) in every
// state row, the probe's hops waiting for the intro scene's end. A fresh review comes before the run (ADR-064 amendment A). v1.1's
// header follows.
// thrall-link.js v1.1 DRAFT (thuum, 2026-11-12; the fresh review lab/.cache/drafts/reanimate/review-return-v1.md c8d82512 applied as
// written, ADR-064 amendment A): its fix 4 (the link rows read the thrall's combat target and that target's own, so the fight tells
// defence of c1 from self-defence: ACTOR.combatTarget, the state row's combatTarget and targetsTarget), its fix 5 (the reference
// counts' list) and its nits (38786's this; the arguments of 42880, 37316, 15331 and 40058). v1's header follows.
// thrall-link.js v1 DRAFT (thuum, 2026-11-12; ADR-060 as amended on thuum branch reanimate-docs 90ba55a9, Eli: "thrall returns to
// caster obvs"; the static read lab/.cache/drafts/reanimate/return-to-caster-read.md sha1 9a43041f, "the memo" below, sections 6, 8
// and 10). ONE question (ADR-064 rule B): can a fresh game take command of a living, already-reanimated thrall through the engine's
// own command routine, with no death and no get-up, so that the thrall follows and fights for that player again? Its probe is
// lab/.cache/probes/x-reanimate-return-v1.yaml. New, so a fresh review comes before its first run (ADR-064 amendment A). lab-api
// serves lab/frida from main alone, so this file goes to main on its own thuum branch (lab/frida/thrall-link.js and its README
// entry, nothing else) before that probe runs.
//
// A LAB EXPERIMENT THAT WRITES ENGINE STATE in its link mode, on one seat, never a resident, and it changes no build. Mode trace
// writes nothing. Mode link's writes, all of them, every one through an engine function the memo names, on the main thread inside
// the player's own update:
//   - 37490(thrall, 1) when SET_REANIMATE is 1: the thrall's life state to kReanimate (4) through Actor::SetLifeState 37612, the
//     write the engine's own reanimation makes (memo section 1; 38820 calls 37490 with 1);
//   - 38798(thrall, player, null): the command (memo section 0 point 2): the thrall's MiddleHighProcessData::commandingActor and
//     its kIsCommandedActor flag (39950, under the engine's lock), the player's commandedActors entry {thrall, null} under the
//     commanded-actor limit (40056, which may dispel the player's oldest commanded actor's effect; a fresh game holds none), the
//     ability of default object 25 kCommandedActorAbility (Actor::AddSpell 38716) and a created follow package targeting the
//     player (37404, PutCreatedPackage);
//   - 38799(thrall, player, null) every REFRESH_FRAMES frames while linked, only when REFRESH_FRAMES > 0 (0 by default; since v1.2
//     the probe passes 30, the static read's section 8 "every 30th frame", read-return-103005.md D2 B: in run 103005's leg B
//     Sven's schedule took the follow package within 1.8 s of the get-up and 38799 put it back, HYPOTHESIS: read-return-103005.md
//     :290-291): CommandEffect::Update's re-link and
//     follow-package rebuild;
//   - 38800(thrall, null) once, UNLINK_AFTER_MS after the thrall first reads dying or dead: the inverse (39950 with the null
//     handle, the entry removed by 40057, Actor::RemoveSpell 38717 of default object 25, 29507 on the current package, the
//     kEvpBuffered bit, Actor.h:175);
//   - and, as body-impose.js's lookups do, one reference count kept on each object a handle resolves to (12332: every actor the
//     process-list scan meets before the thrall, the commanding handle, the player's entries and the combat targets, once each;
//     the seat's next relaunch or rollback frees them).
// The replacement of slot 0xAD's current target (40447, or another module's function in its place) is reverted from Frida's own
// thread when the run's link is done (the unlink's rows written), at TTL_S,
// or by the liveness timer when TTL_S plus 30 s pass with no frame. Nothing is restored: the command, the ability and the package
// stay as the engine leaves them until the unlink, and the life state stays as the engine writes it. The seat's next relaunch or
// rollback ends all of it.
//
// MODES (LAB_PARAMS.MODE):
//   trace: ATTACH ONLY, writes nothing, never replaces slot 0xAD's current target (40447, or another module's function in its
//     place), so a link run in the same game holds the one replacement Frida allows
//     per function (serialize-on-demand-actor.js's "one replacement per game process"). Every hook counts its calls before its
//     filter; the filtered rows name FORM (the thrall) or the player. Armed by a frida step before the raise (leg B, the baseline
//     the link rebuilds) and by the relaunch's frida arm for the fresh game (F0, F1, F2).
//   link: REPLACE ONLY (no attach), the recipe above, run by events the script sees, never by the probe's clock: find the thrall
//     (the process lists' handles, body-impose.js's scan), gate it (alive, process level kHigh or kMiddleHigh), link it, a state
//     row every STATE_MS, then at its first dying or dead read a state row every 2 s and the unlink UNLINK_AFTER_MS later. Engine
//     calls run only on Main's thread inside the replacement of PlayerCharacter::Update, after the original (Frida's listener guard
//     makes every hooked function called from a listener invisible on that thread: frida-lab-script-pitfalls, 2026-11-03; a
//     replacement's body runs with the guard cleared, so the trace's hooks see the recipe's callees). One 'thread' row if the update
//     runs elsewhere, and no step there.
//
// Ids, each by `just addr <id>` (lab/addr.py over addrlib/, runtime 1.6.1170.0, 428461 entries, run 2026-11-12; never from memory).
// A name and a signature are CommonLibSSE-NG b93280e8's where cited (include/RE, src/RE), else the memo's (section and table row;
// HYPOTHESIS by rule 2, from REA's Ghidra 12.1.4 pseudocode of the unpacked exe, the session scratchpad's rea/ folders d2 to d4):
//   Called (link mode):
//   37490  0x675130  void (Actor*, uint8): Actor::SetLifeState(actor, b << 2) (memo section 1, table; d3 0x140675130.c); the bool
//                    passed as the Number 1 into a uint8 (frida-bool-args)
//   38798  0x6c5cb0  void (Actor* commanded, Actor* commander, ActiveEffect* effect): the command link (memo section 9's first block;
//                    d2 0x1406c5cb0.c: needs the commanded's process at +0xF8, a commander, and 37965 < 2; then 39950, AddSpell of
//                    default object 25 if it is a SPEL, then 37404 for the commander at 401069's address or one with no running
//                    package or in combat)
//   38799  0x6c5da0  void (Actor*, Actor*, ActiveEffect*): the per-update refresh (memo section 1; d2 0x1406c5da0.c: a re-link when
//                    the commanding actor differs, the follow package out of combat; the effect-only tail skipped for null)
//   38800  0x6c5fd0  void (Actor* commanded, ActiveEffect* effect): the unlink (memo section 9; d2 0x1406c5fd0.c)
//   12332  0x179710  LookupReferenceByHandle (CommonLibSSE-NG include/RE/Offsets.h:582), bool (const RefHandle&, NiPointer&), as
//                    body-impose.js calls it
//   Read (both modes):
//   208040 0x18ab9c0 VTABLE_PlayerCharacter[0] (Offsets_VTABLE.h:2231); slot 0xAD Update(float) (A/Actor.h:371), REPLACED in link
//                    mode with a NativeCallback of that signature that calls the original first; printed beside 40447 0x732660.
//                    v1.2: whatever the slot holds is replaced (on the lab's seats another module's function, not 40447: run
//                    103005), the original called through that prior target; the ready row names the slot's module and offset
//   400315 0x20f69b0 ProcessLists** (src/RE/P/ProcessLists.cpp:13); the four handle arrays +0x30 +0x48 +0x60 +0x78
//                    (P/ProcessLists.h:69-72), each a BSTArray: data +0x00, size +0x10
//   403449 0x31872c0 Main** (Offsets.h:383); threadID +0x28 (M/Main.h:87)
//   403521 0x31874f8 PlayerCharacter's singleton, a NiPointer (Offsets.h:451, src/RE/P/PlayerCharacter.cpp:16-19): printed beside
//                    401069, whose player the step requires as the update's this (counts.notPlayer)
//   401069 0x3137698 the player pointer 38798 compares its commander against (memo table, "by use"; d2 0x1406c5cb0.c's
//                    DAT_143137698): printed beside 403521's
//   207511 0x189d870 VTABLE_Actor[0] and 207886 0x18a5558 VTABLE_Character[0] (Offsets_VTABLE.h:2142, :2215): slot 0x10E KillImpl
//                    (A/Actor.h:468), printed against 37896
//   207894 0x18a5f80 VTABLE_Character[4], the MagicTarget sub-vtable (Offsets_VTABLE.h:2215; memo section 2): slot 1 AddTarget
//                    (M/MagicTarget.h:78), printed against 38786
//   Attached (trace mode; each row's registers by the Windows x64 convention, rcx rdx r8 r9; memo section 8's hook list):
//   34617  0x5c6cb0  the reanimate-target predicate (rcx actor; al): memo section 2
//   34754  0x5cc230  the Reanimate archetype's add check (al): memo section 2
//   38786  0x6c50a0  the actor classes' MagicTarget AddTarget, slot 1 (rcx the MagicTarget at Actor+0xA0, Actor.h:721; rdx the
//                    AddTargetData, MagicTarget.h:56-72; al): memo section 2; its this is the MagicTarget, its pseudocode opening
//                    with param_1 + -0xa0 (d14/0x1406c50a0.c)
//   34755  0x5cc290  the Reanimate archetype's ctor (rax the new ReanimateEffect): memo section 1
//   34750  0x5cbbc0  ReanimateEffect::Start, 34751 0x5cbf00 Finish, 34746 0x5cba40 Update (rcx the effect): memo table
//   34260  0x5b6150  CommandEffect::Start, 34259 0x5b6070 FinishLoadGame, 34261 0x5b6240 Finish, 34256 0x5b5e30 Update (rcx): memo
//   38801  0x6c6060  the commander transfer (rcx, rdx): memo section 5
//   39950  0x7141a0  AIProcess::SetCommandingActor (rcx the commanded's process, rdx a handle pointer, r8 the commanded, r9 the
//                    effect): memo section 1; d3 0x1407141a0.c
//   40056  0x717800  commandedActors append under the limit (rcx the commander's process, rdx the entry, r8 the commander): d4
//   40057  0x717a40  commandedActors remove by handle (rcx the process, rdx the entry): d4; 40058 0x717af0 dismiss, which takes
//                    (process, entry) (d16/0x140717af0.c)
//   37404  0x66d480  the follow package targeting the commander (rcx commanded, rdx commander): d3 0x14066d480.c
//   37612  0x680740  Actor::SetLifeState(this, ACTOR_LIFE_STATE) (src/RE/A/Actor.cpp:1031-1036, RELOCATION_ID(36604, 37612))
//   38820  0x6c6e00  the reanimation proper (rcx actor): memo section 1 (the platform attaches it too, FridaHooks.cpp at c3f9d175)
//   42880  0x7ba170  GetUpEndHandler slot 1: rdx is the Actor& (I/IHandlerFunctor.h:10, :19; Offsets_VTABLE.h:2687); rows carry
//                    rcx and rdx's form id
//   37316  0x664f80  the kill ReanimateEffect::Finish calls: rcx is the actor (re-resurrect-hook.md:69-71); rows carry its form id
//   37896  0x6972d0  Actor::KillImpl(this, Actor* attacker, float, bool, bool), slot 0x10E (A/Actor.h:468; memo table)
//   38716  0x6c12a0  Actor::AddSpell(this, SpellItem*) (Offsets.h:9; src/RE/A/Actor.cpp:82-87); 38717 0x6c14b0 Actor::RemoveSpell
//                    (src/RE/A/Actor.cpp:1002-1007, RELOCATION_ID(37772, 38717))
//   15330  0x1ff290  attach form 0x294 to a reference (rcx a manager, rdx the reference, r8 the form): memo section 1; 15331
//                    0x1ff470 its detach, which takes (manager, ref, form, char) (d2/0x1401ff470.c)
//   39577  0x6eeab0  set HighProcessData's reanimateCaster and reanimateSpell (rcx the process, rdx the caster, r8 the spell): d2
//   kernel32!Sleep   the Interceptor's pulse (the liveness row's sleep count; Frida 17's Process.getModuleByName(...).getExportByName)
//
// Layouts (CommonLibSSE-NG b93280e8, include/RE/):
//   TESForm formID +0x14, formType +0x1A (T/TESForm.h:354, :356). TESObjectREFR data.location +0x54 (OBJ_REFR at +0x40, location
//     +0x14: T/TESObjectREFR.h:79, :495), parentCell +0x60 (:496).
//   Actor on 1.6.1170 (the runtime data moved by 8 from 1.6.629, A/Actor.h:710-713; ActorState at +0xC0, :736-737; MagicTarget at
//     +0xA0, :721): actorState1 +0xC8, lifeState its bits 21-24 (A/ActorState.h:114, :203; the enum :7-18, kAlive 0, kDying 1,
//     kDead 2, kReanimate 4, kRecycle 5; 9 is SetDontMove's, unnamed: the memory note skyrim-setdontmove-lifestate); actorState2
//     +0xCC, reanimating its bit 4 (:128, :204); currentProcess +0xF8 (the 0F0 of :651 plus 8); boolFlags +0x204 (the 1FC of :686
//     plus 8), kIsCommandedActor 1 << 16 (:212). Slot 0xE3 IsInCombat (:425), called on Main in link mode's state rows.
//   AIProcess middleHigh +0x08, currentPackage (an ActorPackage) +0x18, processLevel (u8) +0x137 (A/AIProcess.h:196, :198, :225;
//     PROCESS_TYPE :23-30, kHigh 0, kMiddleHigh 1); ActorPackage's package +0x08 (A/ActorPackage.h:21-22); the running package as
//     AIProcess::GetRunningPackage reads it, runOncePackage's first, then currentPackage's (src/RE/A/AIProcess.cpp:116-127).
//   MiddleHighProcessData runOncePackage +0x58, commandedActors (a BSTArray<CommandedActorData>) data +0x100, size +0x110,
//     commandingActor (an ActorHandle) +0x218 (M/MiddleHighProcessData.h:135, :147, :175); CommandedActorData {handle +0x00,
//     activeEffect +0x08}, 0x10 bytes (:52-60; 40056's stride in d4 agrees).
//   TESPackage packData.packType (u8) +0x24, procedureType (u32) +0xD8 (T/TESPackage.h:149, :300, :314; kFollow 1, kAccompany 7,
//     kPackage 18 in the enum :38-80).
//   ActiveEffect caster handle +0x34, spell +0x40, effect +0x48, target (a MagicTarget*) +0x50, elapsedSeconds +0x70, flags +0x7C
//     (A/ActiveEffect.h:100-111); CommandEffect commandedActor +0x90 (C/CommandEffect.h:28); ReanimateEffect unk98 +0x98
//     (R/ReanimateEffect.h:25); Effect baseEffect +0x10 (E/Effect.h:39). MagicTarget::AddTargetData caster +0x00, magicItem +0x08,
//     effect +0x10 (M/MagicTarget.h:58-60).
//
// HYPOTHESIS until a run reads as expected (rule 2): every role and signature above that is the memo's or REA's; that 38798 with a
// null effect and the player commands a living thrall (the state rows' commanding handle resolving to the player, the flag, the
// player's entry {thrall, 0}); that 37404's package makes it follow; that the command makes it fight the player's enemies; that it
// follows through a load door with no per-update refresh (the memo's G1); that 38800 undoes the command on a dead thrall with no
// fault; that the player's update, through whatever function slot 0xAD holds (v1.2), runs once a frame on the main thread
// (body-impose.js's replacement did through that module: read-corpse-193821-194559.md:224-226). 38786's this is the MagicTarget at
// Actor+0xA0: its pseudocode opens with param_1 + -0xa0 (d14/0x1406c50a0.c).
//
// Rows (console.log and send(); lab-api's preamble flushes console.log to the trace's .log every 250 ms; send is then a no-op):
//   {event:'ready'} once: script, v, mode, runtime version, pid (against the run's games and c<N>-skyrim-platform-pid<N>.log: the
//     memory note lab-frida-wrong-process), base, Main's thread, every site's id, rva, address and first bytes read before any
//     patch, the vtable cross-checks, params, attachErrors. No other row is read before this one's pid matches the seat's game.
//   trace mode: {event:'call', fn: '<id>'} per filtered call, each site's first ROWS_MAX: 34617 (form, lifeState, ret), 34754 (ret),
//     38786 (target, caster, spell, mgef, lifeState, ret), 34755 (effect), 34750 and 34751 and 34260 and 34259 and 34261 (the
//     effect: spell, caster and commanded handles, target form, unk98, elapsed, flags), 34746 (FORM's effect every 2 s: unk98,
//     elapsed, lifeState), 38798 and 38800 and 38801 (forms, effect), 39950 (handle, effect, before and after: the commanding
//     handle and the flag), 40056 and 40057 (the entry, the list before and after), 40058, 37404 (on leave: the running package's
//     form, packType, procedureType), 37490 and 37612 and 38820 (the argument, lifeState before and after), 42880, 37316, 37896
//     (attacker, sendEvent, lifeState before and after), 38716 and 38717 (spell form and type, ret), 15330 and 15331 (form and
//     type), 39577 (caster, spell). {event:'liveness'} every 10 s: every site's calls and rows, sleep and sleep10s, 38799's calls
//     for FORM and their 10 s delta (none in the fresh game before the link; after it, the link's own refreshes, its
//     counts.refreshes, and any more is a refresh the script did not make).
//   link mode: {event:'gate'} once while the thrall is not yet linkable; {event:'state', phase} before and after the link
//     ('before', 'after'), every STATE_MS while linked ('linked'), at the first dying or dead read and every 2 s after ('dead'),
//     around the unlink ('before unlink', 'unlinked'): lifeState, reanimating, isCommanded, boolFlags, processLevel, the commanding
//     handle resolved (form, isPlayer), the running package, the scene holding the thrall (v1.2, slot 0x4A), the player's
//     commandedActors resolved (size, {handle, form,
//     isThrall, effect}), inCombat, the thrall's and the player's positions and their distance, both parent cells;
//     {event:'link', call} after each engine call; {event:'thread'} once if the update ran off Main; {event:'done'}, then
//     {event:'reverted'}; {event:'liveness'} every 10 s (stage, reverted, counts, frames10s, the replacement held).
//   both: {event:'error', where} once per site that threw.
// Params (LAB_PARAMS): MODE ('trace' or 'link'; default 'trace'), FORM (required: the thrall's reference, a number or a hex
// string), ROWS_MAX (200), and for link: SET_REANIMATE (1), UNLINK_AFTER_MS (8000), REFRESH_FRAMES (0, off), STATE_MS (5000),
// TTL_S (600). 1.6.1170 only.
const PARAMS = (typeof LAB_PARAMS === 'object' && LAB_PARAMS) ? LAB_PARAMS : {};
const num = function (v, d) { return (v === undefined || v === null) ? d : Number(v); };
const MODE = String(PARAMS.MODE === undefined ? 'trace' : PARAMS.MODE);
const FORM_ID = typeof PARAMS.FORM === 'string' ? parseInt(PARAMS.FORM, 16) : num(PARAMS.FORM, 0);
const ROWS_MAX = num(PARAMS.ROWS_MAX, 200);
const SET_REANIMATE = num(PARAMS.SET_REANIMATE, 1) ? 1 : 0;
const UNLINK_AFTER_MS = num(PARAMS.UNLINK_AFTER_MS, 8000);
const REFRESH_FRAMES = Math.max(0, num(PARAMS.REFRESH_FRAMES, 0));
const STATE_MS = num(PARAMS.STATE_MS, 5000);
const TTL_S = num(PARAMS.TTL_S, 600);
function emit(obj) { obj.t = Date.now(); send(obj); console.log(JSON.stringify(obj)); }

const OFFSETS = {
  '1.6.1170.0': {
    setReanimate: 0x675130, // 37490
    commandLink: 0x6c5cb0, // 38798
    commandRefresh: 0x6c5da0, // 38799
    commandUnlink: 0x6c5fd0, // 38800
    lookupRef: 0x179710, // 12332 LookupReferenceByHandle
    playerVtable: 0x18ab9c0, // 208040 VTABLE_PlayerCharacter[0]
    playerUpdateById: 0x732660, // 40447, the cross-check for slot 0xAD
    processLists: 0x20f69b0, // 400315 ProcessLists**
    mainSingleton: 0x31872c0, // 403449 Main**
    playerSingleton: 0x31874f8, // 403521 PlayerCharacter singleton (a NiPointer)
    playerCompared: 0x3137698, // 401069 the player pointer 38798 compares against
    actorVtable: 0x189d870, // 207511 VTABLE_Actor[0]
    characterVtable: 0x18a5558, // 207886 VTABLE_Character[0]
    characterMagicTarget: 0x18a5f80, // 207894 VTABLE_Character[4]
    reanimateTarget: 0x5c6cb0, // 34617
    reanimateCheck: 0x5cc230, // 34754
    actorAddTarget: 0x6c50a0, // 38786
    reanimateCtor: 0x5cc290, // 34755
    reanimateStart: 0x5cbbc0, // 34750
    reanimateFinish: 0x5cbf00, // 34751
    reanimateUpdate: 0x5cba40, // 34746
    commandStart: 0x5b6150, // 34260
    commandFinishLoad: 0x5b6070, // 34259
    commandFinish: 0x5b6240, // 34261
    commandUpdate: 0x5b5e30, // 34256
    commandTransfer: 0x6c6060, // 38801
    setCommanding: 0x7141a0, // 39950
    commandedAppend: 0x717800, // 40056
    commandedRemove: 0x717a40, // 40057
    commandedDismiss: 0x717af0, // 40058
    followPackage: 0x66d480, // 37404
    setLifeState: 0x680740, // 37612
    reanimateProper: 0x6c6e00, // 38820
    getUpEnd: 0x7ba170, // 42880
    killFinish: 0x664f80, // 37316
    killImpl: 0x6972d0, // 37896
    addSpell: 0x6c12a0, // 38716
    removeSpell: 0x6c14b0, // 38717
    attachMarker: 0x1ff290, // 15330
    detachMarker: 0x1ff470, // 15331
    setReanimateCaster: 0x6eeab0, // 39577
  },
};
const FORM = { id: 0x14, type: 0x1a };
const REFR = { location: 0x54, cell: 0x60 };
const ACTOR = { magicTarget: 0xa0, state1: 0xc8, state2: 0xcc, process: 0xf8, combatTarget: 0x104 /* A/Actor.h:653, 0FC plus 8 */, boolFlags: 0x204 };
const PROC = { middleHigh: 0x08, currentPackage: 0x18, level: 0x137 };
const MH = { runOncePackage: 0x58, commandedData: 0x100, commandedSize: 0x110, commandingActor: 0x218 };
const ACTOR_PACKAGE_PACKAGE = 0x08;
const PKG = { packType: 0x24, procedureType: 0xd8 };
const ENTRY = { size: 0x10, effect: 0x08 };
const AE = { caster: 0x34, spell: 0x40, target: 0x50, elapsed: 0x70, flags: 0x7c, commanded: 0x90, unk98: 0x98 };
const EFFECT_BASE = 0x10;
const ATD = { caster: 0x00, magicItem: 0x08, effect: 0x10 };
const IS_COMMANDED = 1 << 16;
const SLOT = { update: 0xad, isInCombat: 0xe3, killImpl: 0x10e, addTarget: 0x01, currentScene: 0x4a /* GetCurrentScene: T/TESObjectREFR.h:270, A/Actor.h:292 */ };
const LISTS = [0x30, 0x48, 0x60, 0x78];
const LIFE_NAMES = ['alive', 'dying', 'dead', 'unconscious', 'reanimate', 'recycle', 'restrained', 'essentialDown', 'bleedout', 'nine (SetDontMove)'];
const PLAYER_FORM = 0x14;

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

const hex = function (n) { return (n === null || n === undefined) ? null : (n < 0 ? String(n) : '0x' + (n >>> 0).toString(16)); };
const isNil = function (p) { return p === null || p === undefined || p.isNull(); };
const u8 = function (p, o) { try { return p.add(o).readU8(); } catch (e) { return -1; } };
const u32 = function (p, o) { try { return p.add(o).readU32(); } catch (e) { return -1; } };
const f32 = function (p, o) { try { return p.add(o).readFloat(); } catch (e) { return NaN; } };
const ptrAt = function (p, o) { try { return p.add(o).readPointer(); } catch (e) { return NULL; } };
const r1 = function (x) { return Math.round(x * 10) / 10; };
const firstBytes = function (p) {
  try { return Array.from(new Uint8Array(p.readByteArray(8))).map(function (b) { return ('0' + b.toString(16)).slice(-2); }).join(' '); } catch (e) { return 'unreadable'; }
};
const formOf = function (p) { return isNil(p) ? -1 : u32(p, FORM.id); };
const lifeOf = function (a) { const st = u32(a, ACTOR.state1); return st < 0 ? -1 : (st >>> 21) & 0xf; };
const lifeName = function (n) { return n >= 0 && n < LIFE_NAMES.length ? LIFE_NAMES[n] : 'unknown'; };
const reanimatingOf = function (a) { const st = u32(a, ACTOR.state2); return st < 0 ? -1 : (st >>> 4) & 1; };
const commandedFlagOf = function (a) { const fl = u32(a, ACTOR.boolFlags); return fl < 0 ? null : (fl & IS_COMMANDED) !== 0; };
const posOf = function (r) { return [f32(r, REFR.location), f32(r, REFR.location + 4), f32(r, REFR.location + 8)]; };
const dist3 = function (a, b) { const dx = a[0] - b[0]; const dy = a[1] - b[1]; const dz = a[2] - b[2]; return Math.sqrt(dx * dx + dy * dy + dz * dz); };
// an effect's target actor: the MagicTarget at +0x50 is the actor's subobject at +0xA0 (HYPOTHESIS for an effect on an actor)
const targetFormOf = function (e) { const t = ptrAt(e, AE.target); return isNil(t) ? -1 : formOf(t.sub(ACTOR.magicTarget)); };
// the actor's running package, AIProcess::GetRunningPackage's order (runOncePackage, then currentPackage)
const packageOf = function (a) {
  const proc = ptrAt(a, ACTOR.process);
  if (isNil(proc)) return null;
  const mh = ptrAt(proc, PROC.middleHigh);
  let pkg = isNil(mh) ? NULL : ptrAt(mh, MH.runOncePackage + ACTOR_PACKAGE_PACKAGE);
  let from = 'runOncePackage';
  if (isNil(pkg)) { pkg = ptrAt(proc, PROC.currentPackage + ACTOR_PACKAGE_PACKAGE); from = 'currentPackage'; }
  if (isNil(pkg)) return { none: true };
  return { from: from, at: String(pkg), form: hex(formOf(pkg)), packType: u8(pkg, PKG.packType), procedureType: u32(pkg, PKG.procedureType) };
};
// an actor's commanding handle and flag, memory only (trace mode resolves no handle: it calls nothing)
const commandOf = function (a) {
  const proc = ptrAt(a, ACTOR.process);
  const mh = isNil(proc) ? NULL : ptrAt(proc, PROC.middleHigh);
  return { commandingHandle: isNil(mh) ? null : hex(u32(mh, MH.commandingActor)), isCommanded: commandedFlagOf(a) };
};
// a process's commandedActors, memory only: the size and the first eight {handle, effect}
const rawListOf = function (proc) {
  const mh = isNil(proc) ? NULL : ptrAt(proc, PROC.middleHigh);
  if (isNil(mh)) return null;
  const size = u32(mh, MH.commandedSize);
  const data = ptrAt(mh, MH.commandedData);
  const entries = [];
  for (let i = 0; i < size && i < 8 && !isNil(data); i++) entries.push({ handle: u32(data, i * ENTRY.size), effect: String(ptrAt(data, i * ENTRY.size + ENTRY.effect)) });
  return { size: size, entries: entries };
};
const hexList = function (l) { return l === null ? null : { size: l.size, entries: l.entries.map(function (x) { return { handle: hex(x.handle), effect: x.effect }; }) }; };

const exe = Process.getModuleByName('SkyrimSE.exe');
const version = fileVersion(exe.path);
const off = OFFSETS[version];
if (off === undefined || !(FORM_ID > 0) || (MODE !== 'trace' && MODE !== 'link')) {
  emit({ event: 'ready', script: 'thrall-link.js', v: '1.3', mode: MODE, error: off === undefined ? 'no offsets for this runtime' : (!(FORM_ID > 0) ? 'FORM is required' : 'MODE is trace or link'), version: version, pid: Process.id });
} else {
  const at = function (name) { return exe.base.add(off[name]); };
  const rva = function (p) { try { return hex(p.sub(exe.base).toUInt32()); } catch (e) { return String(p); } };
  const mainTid = function () { return u32(ptrAt(at('mainSingleton'), 0), 0x28); };
  const resolved = {};
  const note = function (name, id, p, how) { resolved[name] = { id: id, rva: rva(p), at: String(p), how: how, bytes: firstBytes(p) }; };
  const attachErrors = [];
  const failed = {};
  const fail = function (where, e) { if (failed[where]) return; failed[where] = true; emit({ event: 'error', where: where, error: String(e) }); };
  const slotOf = function (vt, slot) { return ptrAt(vt, slot * Process.pointerSize); };
  const updateAt = slotOf(at('playerVtable'), SLOT.update);
  // the module that owns an address, its base and the offset in it (v1.2: slot 0xAD's owner, read-return-103005.md D1 A)
  const moduleOf = function (p) {
    try { const m = Process.findModuleByAddress(p); return m === null ? null : { name: m.name, base: String(m.base), offset: hex(p.sub(m.base).toUInt32()) }; } catch (e) { return { error: String(e) }; }
  };
  const checks = function () {
    const addTargetSlot = slotOf(at('characterMagicTarget'), SLOT.addTarget);
    const killActor = slotOf(at('actorVtable'), SLOT.killImpl);
    const killCharacter = slotOf(at('characterVtable'), SLOT.killImpl);
    const single = ptrAt(at('playerSingleton'), 0);
    const compared = ptrAt(at('playerCompared'), 0);
    return {
      update: { slot: String(updateAt), slotModule: moduleOf(updateAt), byId40447: rva(at('playerUpdateById')), agree: !isNil(updateAt) && updateAt.equals(at('playerUpdateById')) },
      addTarget: { characterSlot1: rva(addTargetSlot), byId38786: rva(at('actorAddTarget')), agree: !isNil(addTargetSlot) && addTargetSlot.equals(at('actorAddTarget')) },
      killImpl: { actorSlot: rva(killActor), characterSlot: rva(killCharacter), byId37896: rva(at('killImpl')) },
      player: { singleton403521: String(single), compared401069: String(compared), agree: !isNil(single) && single.equals(compared), form: hex(formOf(single)) },
    };
  };

  // ---------------------------------------------------------------- trace mode: attach only, writes nothing
  const traceMode = function () {
    const counts = {};
    const rows = {};
    const seq = { n: 0 };
    const sample = { u34746: 0 };
    const form38799 = { n: 0, last: 0 };
    const pulse = { n: 0, last: 0 };
    const row = function (fn, obj) {
      rows[fn] = (rows[fn] || 0) + 1;
      if (rows[fn] > ROWS_MAX) return;
      obj.event = 'call';
      obj.fn = fn;
      obj.seq = ++seq.n;
      obj.tid = Process.getCurrentThreadId();
      emit(obj);
    };
    // every hook counts its calls before its filter; an onLeave only where a handler reads the return or the state after
    const hook = function (fn, id, name, handlers) {
      const p = at(name);
      counts[fn] = 0;
      note(fn, id, p, 'attach');
      const cb = {
        onEnter(args) {
          counts[fn] += 1;
          if (handlers.enter) { try { handlers.enter.call(this, args); } catch (e) { fail(fn + ':enter', e); } }
        },
      };
      if (handlers.leave) {
        cb.onLeave = function (retval) {
          if (this.keep === undefined) return;
          try { handlers.leave.call(this, retval); } catch (e) { fail(fn + ':leave', e); }
        };
      }
      try { Interceptor.attach(p, cb); } catch (e) { attachErrors.push(fn + ': ' + e); }
    };
    const ret8 = function (retval) { return retval.toInt32() & 0xff; };
    const effectRow = function (e) {
      return { effect: String(e), spell: hex(formOf(ptrAt(e, AE.spell))), casterHandle: hex(u32(e, AE.caster)), commandedHandle: hex(u32(e, AE.commanded)), targetForm: hex(targetFormOf(e)), unk98: u8(e, AE.unk98), elapsed: r1(f32(e, AE.elapsed)), flags: hex(u32(e, AE.flags)) };
    };

    // F0 and B: the add path a Dead Thrall bolt takes (memo section 2)
    hook('38786', 38786, 'actorAddTarget', {
      enter(args) {
        const actor = args[0].sub(ACTOR.magicTarget);
        if (formOf(actor) !== FORM_ID) return;
        const d = args[1];
        // v1.3 (review-return-v1.2.md 8): Dead Thrall's bolt alone (SPEL 0x7e8df), so other spells' rows (cloaks, run 103005's
        // T51:213) do not use up ROWS_MAX before F0's
        if (formOf(ptrAt(d, ATD.magicItem)) !== 0x7e8df) return;
        const eff = ptrAt(d, ATD.effect);
        this.keep = { caster: formOf(ptrAt(d, ATD.caster)), spell: formOf(ptrAt(d, ATD.magicItem)), mgef: isNil(eff) ? -1 : formOf(ptrAt(eff, EFFECT_BASE)), life: lifeOf(actor) };
      },
      leave(retval) { const k = this.keep; row('38786', { target: hex(FORM_ID), caster: hex(k.caster), spell: hex(k.spell), mgef: hex(k.mgef), lifeState: k.life, lifeName: lifeName(k.life), ret: ret8(retval) }); },
    });
    hook('34617', 34617, 'reanimateTarget', {
      enter(args) { const a = args[0]; if (formOf(a) !== FORM_ID) return; this.keep = { life: lifeOf(a) }; },
      leave(retval) { row('34617', { form: hex(FORM_ID), lifeState: this.keep.life, lifeName: lifeName(this.keep.life), ret: ret8(retval) }); },
    });
    hook('34754', 34754, 'reanimateCheck', { enter() { this.keep = true; }, leave(retval) { row('34754', { ret: ret8(retval) }); } });
    hook('34755', 34755, 'reanimateCtor', { enter() { this.keep = true; }, leave(retval) { row('34755', { effect: String(retval) }); } });
    // the effect's life (B only: a fresh game holds no effect on the thrall)
    hook('34750', 34750, 'reanimateStart', {
      enter(args) { const e = args[0]; const t = ptrAt(e, AE.target); const r = effectRow(e); r.lifeState = isNil(t) ? -1 : lifeOf(t.sub(ACTOR.magicTarget)); row('34750', r); },
    });
    hook('34751', 34751, 'reanimateFinish', { enter(args) { row('34751', effectRow(args[0])); } });
    hook('34746', 34746, 'reanimateUpdate', {
      enter(args) {
        const now = Date.now();
        if (now - sample.u34746 < 2000) return;
        const e = args[0];
        if (targetFormOf(e) !== FORM_ID) return;
        sample.u34746 = now;
        const t = ptrAt(e, AE.target);
        row('34746', { effect: String(e), unk98: u8(e, AE.unk98), elapsed: r1(f32(e, AE.elapsed)), lifeState: lifeOf(t.sub(ACTOR.magicTarget)) });
      },
    });
    hook('34260', 34260, 'commandStart', { enter(args) { row('34260', effectRow(args[0])); } });
    hook('34259', 34259, 'commandFinishLoad', { enter(args) { row('34259', effectRow(args[0])); } });
    hook('34261', 34261, 'commandFinish', { enter(args) { row('34261', effectRow(args[0])); } });
    hook('34256', 34256, 'commandUpdate', {});
    // the command routines (memo sections 1 and 5)
    hook('38798', 38798, 'commandLink', {
      enter(args) { if (formOf(args[0]) !== FORM_ID) return; row('38798', { commanded: hex(FORM_ID), commander: hex(formOf(args[1])), commanderIsPlayer: formOf(args[1]) === PLAYER_FORM, effect: String(args[2]), lifeState: lifeOf(args[0]) }); },
    });
    hook('38799', 38799, 'commandRefresh', { enter(args) { if (formOf(args[0]) === FORM_ID) form38799.n += 1; } });
    hook('38800', 38800, 'commandUnlink', {
      enter(args) { if (formOf(args[0]) !== FORM_ID) return; row('38800', { commanded: hex(FORM_ID), effect: String(args[1]), lifeState: lifeOf(args[0]), before: commandOf(args[0]) }); },
    });
    hook('38801', 38801, 'commandTransfer', { enter(args) { row('38801', { rcx: hex(formOf(args[0])), rdx: hex(formOf(args[1])) }); } });
    hook('39950', 39950, 'setCommanding', {
      enter(args) { const c = args[2]; if (formOf(c) !== FORM_ID) return; this.keep = { commanded: c, handle: u32(args[1], 0), effect: String(args[3]), before: commandOf(c) }; },
      leave() { const k = this.keep; row('39950', { commanded: hex(FORM_ID), handle: hex(k.handle), effect: k.effect, before: k.before, after: commandOf(k.commanded) }); },
    });
    hook('40056', 40056, 'commandedAppend', {
      enter(args) { this.keep = { proc: args[0], entry: { handle: hex(u32(args[1], 0)), effect: String(ptrAt(args[1], ENTRY.effect)) }, commander: hex(formOf(args[2])), before: hexList(rawListOf(args[0])) }; },
      leave() { const k = this.keep; row('40056', { commander: k.commander, entry: k.entry, before: k.before, after: hexList(rawListOf(k.proc)) }); },
    });
    hook('40057', 40057, 'commandedRemove', {
      enter(args) { this.keep = { proc: args[0], handle: hex(u32(args[1], 0)), before: hexList(rawListOf(args[0])) }; },
      leave() { const k = this.keep; row('40057', { handle: k.handle, before: k.before, after: hexList(rawListOf(k.proc)) }); },
    });
    hook('40058', 40058, 'commandedDismiss', { enter(args) { row('40058', { rcx: String(args[0]) }); } });
    hook('37404', 37404, 'followPackage', {
      enter(args) { if (formOf(args[0]) !== FORM_ID) return; this.keep = { actor: args[0], commander: hex(formOf(args[1])), before: packageOf(args[0]) }; },
      leave() { const k = this.keep; row('37404', { commanded: hex(FORM_ID), commander: k.commander, before: k.before, after: packageOf(k.actor) }); },
    });
    // the life state's writers and the kill (memo sections 1, 3 and 8)
    hook('37490', 37490, 'setReanimate', {
      enter(args) { if (formOf(args[0]) !== FORM_ID) return; this.keep = { actor: args[0], arg: args[1].toInt32() & 0xff, before: lifeOf(args[0]) }; },
      leave() { const k = this.keep; row('37490', { form: hex(FORM_ID), arg: k.arg, before: k.before, after: lifeOf(k.actor) }); },
    });
    hook('37612', 37612, 'setLifeState', {
      enter(args) { if (formOf(args[0]) !== FORM_ID) return; this.keep = { actor: args[0], state: args[1].toInt32(), before: lifeOf(args[0]) }; },
      leave() { const k = this.keep; row('37612', { form: hex(FORM_ID), state: k.state, stateName: lifeName(k.state), before: k.before, after: lifeOf(k.actor), reanimating: reanimatingOf(k.actor) }); },
    });
    hook('38820', 38820, 'reanimateProper', {
      enter(args) { if (formOf(args[0]) !== FORM_ID) return; this.keep = { actor: args[0], before: lifeOf(args[0]) }; },
      leave() { const k = this.keep; row('38820', { form: hex(FORM_ID), before: k.before, after: lifeOf(k.actor), reanimating: reanimatingOf(k.actor) }); },
    });
    hook('42880', 42880, 'getUpEnd', { enter(args) { row('42880', { rcx: String(args[0]), rdxForm: hex(formOf(args[1])) }); } });
    hook('37316', 37316, 'killFinish', { enter(args) { row('37316', { rcxForm: hex(formOf(args[0])), rdxForm: hex(formOf(args[1])) }); } });
    hook('37896', 37896, 'killImpl', {
      enter(args) { if (formOf(args[0]) !== FORM_ID) return; this.keep = { actor: args[0], attacker: hex(formOf(args[1])), sendEvent: args[3].toInt32() & 0xff, before: lifeOf(args[0]), command: commandOf(args[0]) }; },
      leave() { const k = this.keep; row('37896', { form: hex(FORM_ID), attacker: k.attacker, sendEvent: k.sendEvent, before: k.before, after: lifeOf(k.actor), command: k.command }); },
    });
    hook('38716', 38716, 'addSpell', {
      enter(args) { if (formOf(args[0]) !== FORM_ID) return; this.keep = { spell: hex(formOf(args[1])), type: u8(args[1], FORM.type) }; },
      leave(retval) { row('38716', { form: hex(FORM_ID), spell: this.keep.spell, formType: this.keep.type, ret: ret8(retval) }); },
    });
    hook('38717', 38717, 'removeSpell', {
      enter(args) { if (formOf(args[0]) !== FORM_ID) return; this.keep = { spell: hex(formOf(args[1])), type: u8(args[1], FORM.type) }; },
      leave(retval) { row('38717', { form: hex(FORM_ID), spell: this.keep.spell, formType: this.keep.type, ret: ret8(retval) }); },
    });
    hook('15330', 15330, 'attachMarker', { enter(args) { if (formOf(args[1]) !== FORM_ID) return; row('15330', { ref: hex(FORM_ID), form: hex(formOf(args[2])), formType: u8(args[2], FORM.type) }); } });
    hook('15331', 15331, 'detachMarker', { enter(args) { if (formOf(args[1]) !== FORM_ID) return; row('15331', { ref: hex(FORM_ID), form: hex(formOf(args[2])), formType: u8(args[2], FORM.type) }); } });
    hook('39577', 39577, 'setReanimateCaster', { enter(args) { row('39577', { caster: hex(formOf(args[1])), spell: hex(formOf(args[2])) }); } });
    try {
      const sleep = Process.getModuleByName('kernel32.dll').getExportByName('Sleep');
      Interceptor.attach(sleep, { onEnter() { pulse.n += 1; } });
      note('sleep', 'kernel32!Sleep', sleep, 'attach');
    } catch (e) { attachErrors.push('sleep: ' + e); }

    emit({ event: 'ready', script: 'thrall-link.js', v: '1.3', mode: 'trace', version: version, pid: Process.id, base: String(exe.base), mainThread: mainTid(), checks: checks(), hooks: resolved, attachErrors: attachErrors, params: { MODE: MODE, FORM: hex(FORM_ID), ROWS_MAX: ROWS_MAX } });
    setInterval(function () {
      // Frida's own thread: a report, never an engine call
      emit({ event: 'liveness', mode: 'trace', pid: Process.id, counts: JSON.parse(JSON.stringify(counts)), rows: JSON.parse(JSON.stringify(rows)), sleep: pulse.n, sleep10s: pulse.n - pulse.last, refresh38799ForForm: form38799.n, refresh38799ForForm10s: form38799.n - form38799.last });
      pulse.last = pulse.n;
      form38799.last = form38799.n;
    }, 10000);
  };

  // ---------------------------------------------------------------- link mode: replace only, the recipe on Main
  const linkMode = function () {
    const counts = { frames: 0, offMain: 0, notPlayer: 0, scans: 0, lookups: 0, refreshes: 0 };
    const run = { stage: 'find', actor: NULL, player: NULL, deadAt: 0, lastState: 0, done: false, startedAt: Date.now(), gateSaid: false };
    const nf = {
      lookup: new NativeFunction(at('lookupRef'), 'bool', ['pointer', 'pointer'], 'win64'),
      setReanimate: new NativeFunction(at('setReanimate'), 'void', ['pointer', 'uint8'], 'win64'),
      link: new NativeFunction(at('commandLink'), 'void', ['pointer', 'pointer', 'pointer'], 'win64'),
      refresh: new NativeFunction(at('commandRefresh'), 'void', ['pointer', 'pointer', 'pointer'], 'win64'),
      unlink: new NativeFunction(at('commandUnlink'), 'void', ['pointer', 'pointer'], 'win64'),
    };
    ['setReanimate 37490', 'commandLink 38798', 'commandRefresh 38799', 'commandUnlink 38800', 'lookupRef 12332'].forEach(function (s) {
      const parts = s.split(' ');
      note(parts[0], Number(parts[1]), at(parts[0]), 'call');
    });
    note('PlayerCharacter::Update', 208040, updateAt, 'replace');
    const fnCache = {};
    const virtualFn = function (obj, slot, ret, argTypes) {
      const fp = ptrAt(ptrAt(obj, 0), slot * Process.pointerSize);
      if (isNil(fp)) throw new Error('no vtable slot ' + hex(slot));
      const k = String(fp) + '/' + ret + '/' + argTypes.join(',');
      if (fnCache[k] === undefined) fnCache[k] = new NativeFunction(fp, ret, argTypes, 'win64');
      return fnCache[k];
    };
    // a handle to its object, looked up once (body-impose.js's cache; each resolved object keeps one reference count)
    const handles = {};
    const resolve = function (h) {
      if (!(h > 0)) return NULL;
      if (handles[h] === undefined) {
        const hs = Memory.alloc(4);
        hs.writeU32(h);
        const out = Memory.alloc(Process.pointerSize);
        out.writePointer(NULL);
        counts.lookups += 1;
        let r = NULL;
        try { nf.lookup(hs, out); r = out.readPointer(); } catch (e) { r = NULL; }
        handles[h] = r;
      }
      return handles[h];
    };
    const named = function (h) {
      const r = resolve(h);
      return { handle: hex(h), form: isNil(r) ? null : hex(formOf(r)), isPlayer: !isNil(r) && !isNil(run.player) && r.equals(run.player), isThrall: !isNil(r) && !isNil(run.actor) && r.equals(run.actor) };
    };
    // FORM's actor by the process lists' four handle arrays (body-impose.js's scan), every 30 frames until found
    const findActor = function () {
      counts.scans += 1;
      const lists = ptrAt(at('processLists'), 0);
      if (isNil(lists)) return NULL;
      for (let l = 0; l < LISTS.length; l++) {
        const data = ptrAt(lists, LISTS[l]);
        const size = u32(lists, LISTS[l] + 0x10);
        for (let i = 0; i < size && i < 4096 && !isNil(data); i++) {
          const r = resolve(u32(data, i * 4));
          if (!isNil(r) && formOf(r) === FORM_ID) return r;
        }
      }
      return NULL;
    };
    const stateRow = function (phase) {
      const a = run.actor;
      const p = run.player;
      const proc = ptrAt(a, ACTOR.process);
      const mh = isNil(proc) ? NULL : ptrAt(proc, PROC.middleHigh);
      const life = lifeOf(a);
      const cmdH = isNil(mh) ? -1 : u32(mh, MH.commandingActor);
      const list = rawListOf(ptrAt(p, ACTOR.process));
      let inCombat = null;
      try { inCombat = virtualFn(a, SLOT.isInCombat, 'uint8', ['pointer'])(a) !== 0; } catch (e) { inCombat = 'error: ' + e; }
      // v1.2 (read-return-103005.md D3 A): the scene that holds the thrall, slot 0x4A, null for none; 37404 puts no package while one does
      let scene = null;
      try { const s = virtualFn(a, SLOT.currentScene, 'pointer', ['pointer'])(a); scene = isNil(s) ? null : hex(formOf(s)); } catch (e) { scene = 'error: ' + e; }
      const pos = posOf(a);
      const ppos = posOf(p);
      emit({
        event: 'state', phase: phase, frame: counts.frames, msSinceStart: Date.now() - run.startedAt, form: hex(formOf(a)),
        lifeState: life, lifeName: lifeName(life), reanimating: reanimatingOf(a), isCommanded: commandedFlagOf(a), boolFlags: hex(u32(a, ACTOR.boolFlags)),
        processLevel: isNil(proc) ? null : u8(proc, PROC.level), commanding: cmdH < 0 ? null : named(cmdH), package: packageOf(a), scene: scene,
        playerList: list === null ? null : { size: list.size, entries: list.entries.map(function (x) { const n = named(x.handle); n.effect = x.effect; return n; }) },
        inCombat: inCombat, combatTarget: named(u32(a, ACTOR.combatTarget)), targetsTarget: (function () { const t = resolve(u32(a, ACTOR.combatTarget)); return isNil(t) ? null : named(u32(t, ACTOR.combatTarget)); })(), pos: pos.map(r1), playerPos: ppos.map(r1), distance: r1(dist3(pos, ppos)),
        cell: hex(formOf(ptrAt(a, REFR.cell))), playerCell: hex(formOf(ptrAt(p, REFR.cell))),
      });
    };
    let reverted = false;
    const revert = function () {
      try { Interceptor.revert(updateAt); Interceptor.flush(); reverted = true; emit({ event: 'reverted', frame: counts.frames }); } catch (e) { fail('revert', e); }
    };
    // every finish runs inside the replacement on Main (step's callers alone); the revert from Frida's thread
    const finish = function (why) {
      if (run.done) return;
      run.done = true;
      emit({ event: 'done', why: why, stage: run.stage, frame: counts.frames, counts: JSON.parse(JSON.stringify(counts)) });
      setTimeout(revert, 0);
    };
    const DEAD = [1, 2, 5]; // kDying, kDead, kRecycle (ActorState.h:10-14), the states IsDead reads dead (the platform's note)
    const step = function () {
      if (run.done) return;
      const now = Date.now();
      if (now - run.startedAt > TTL_S * 1000) { finish('ttl ' + TTL_S + ' s at stage ' + run.stage); return; }
      if (run.stage === 'find') {
        if (counts.frames % 30 !== 0) return;
        const a = findActor();
        if (isNil(a)) return;
        run.actor = a;
        const proc = ptrAt(a, ACTOR.process);
        const level = isNil(proc) ? -1 : u8(proc, PROC.level);
        const life = lifeOf(a);
        // 38798's own gate is 37965 < 2 (kHigh or kMiddleHigh); a living thrall reads 0, 4 or the hold's 9
        if (isNil(proc) || !(level >= 0 && level < 2) || !(life === 0 || life === 4 || life === 9)) {
          if (!run.gateSaid) { run.gateSaid = true; emit({ event: 'gate', frame: counts.frames, form: hex(FORM_ID), process: String(proc), processLevel: level, lifeState: life, lifeName: lifeName(life), note: 'not linkable yet: the link needs the thrall alive with a high or middle-high process; tried again every 30 frames' }); }
          return;
        }
        stateRow('before');
        // a call that throws ends the run at once (no retry of an engine call that faulted); the fault is the row
        try {
          if (SET_REANIMATE) {
            nf.setReanimate(a, 1);
            emit({ event: 'link', call: '37490', args: [hex(FORM_ID), 1], frame: counts.frames, lifeStateAfter: lifeOf(a) });
          }
          nf.link(a, run.player, NULL);
          emit({ event: 'link', call: '38798', args: [hex(FORM_ID), 'the player', 'null'], frame: counts.frames });
        } catch (e) { emit({ event: 'error', where: 'the link', error: String(e) }); finish('the link threw'); return; }
        stateRow('after');
        run.stage = 'linked';
        run.lastState = now;
        return;
      }
      if (formOf(run.actor) !== FORM_ID) { finish('the thrall no longer reads its id at stage ' + run.stage); return; }
      const life = lifeOf(run.actor);
      if (run.stage === 'linked') {
        if (DEAD.indexOf(life) >= 0) { run.stage = 'dead'; run.deadAt = now; run.lastState = now; stateRow('dead'); return; }
        if (REFRESH_FRAMES > 0 && counts.frames % REFRESH_FRAMES === 0) {
          try { nf.refresh(run.actor, run.player, NULL); counts.refreshes += 1; } catch (e) { emit({ event: 'error', where: 'the refresh', error: String(e) }); finish('the refresh threw'); return; }
        }
        if (now - run.lastState >= STATE_MS) { run.lastState = now; stateRow('linked'); }
        return;
      }
      if (run.stage === 'dead') {
        if (now - run.deadAt >= UNLINK_AFTER_MS) {
          stateRow('before unlink');
          try { nf.unlink(run.actor, NULL); } catch (e) { emit({ event: 'error', where: 'the unlink', error: String(e) }); finish('the unlink threw'); return; }
          emit({ event: 'link', call: '38800', args: [hex(FORM_ID), 'null'], frame: counts.frames, msAfterDeath: now - run.deadAt });
          stateRow('unlinked');
          finish('unlinked ' + (now - run.deadAt) + ' ms after the thrall first read dead');
          return;
        }
        if (now - run.lastState >= 2000) { run.lastState = now; stateRow('dead'); }
      }
    };

    let updateReplaced = false;
    let updateCallback = null; // held here and read by the liveness row, so it outlives the revert (body-impose.js v1.1)
    let offMainSaid = false;
    // v1.2 (read-return-103005.md D1 A): whatever slot 0xAD holds is replaced, body-impose.js's idiom (body-impose.js:642,
    // :710-729), and the original is called through the slot's prior target. On the lab's seats that is another module's function,
    // not 40447 (run 103005: 0x7ffaaa55b8b0, outside SkyrimSE.exe; five physics reads since 11-11); v1.1's equality guard refused it,
    // so its link never ran. The ready row's checks.update names the slot's module (Process.findModuleByAddress).
    if (!isNil(updateAt)) {
      try {
        // the chain to the original with exceptions 'propagate' (apply-on-demand.js:831): no exceptor scope around the engine's code
        const original = new NativeFunction(updateAt, 'void', ['pointer', 'float'], { abi: 'win64', exceptions: 'propagate' });
        updateCallback = new NativeCallback(function (self, delta) {
          original(self, delta);
          try {
            const tid = Process.getCurrentThreadId();
            const main = mainTid();
            if (tid !== main) {
              counts.offMain += 1;
              if (!offMainSaid) { offMainSaid = true; emit({ event: 'thread', tid: tid, mainThread: main, note: 'the update ran off Main\'s thread: no step runs on it' }); }
              return;
            }
            const pc = ptrAt(at('playerCompared'), 0);
            if (isNil(pc) || !self.equals(pc)) { counts.notPlayer += 1; return; }
            counts.frames += 1;
            if (isNil(run.player)) run.player = pc;
            step();
          } catch (e) { fail('step at ' + run.stage, e); }
        }, 'void', ['pointer', 'float'], 'win64');
        Interceptor.replace(updateAt, updateCallback);
        Interceptor.flush();
        updateReplaced = true;
      } catch (e) { attachErrors.push('PlayerCharacter::Update replace: ' + e); }
    } else attachErrors.push('PlayerCharacter::Update: no slot 0xAD');

    emit({
      event: 'ready', script: 'thrall-link.js', v: '1.3', mode: 'link', version: version, pid: Process.id, base: String(exe.base), mainThread: mainTid(),
      checks: checks(), replaced: updateReplaced, hooks: resolved, attachErrors: attachErrors,
      params: { MODE: MODE, FORM: hex(FORM_ID), SET_REANIMATE: SET_REANIMATE, UNLINK_AFTER_MS: UNLINK_AFTER_MS, REFRESH_FRAMES: REFRESH_FRAMES, STATE_MS: STATE_MS, TTL_S: TTL_S },
    });
    let lastFrames = 0;
    setInterval(function () {
      // Frida's own thread: a report and, past TTL_S plus 30 s with no frame to finish on, the revert; never an engine call
      if (updateReplaced && !run.done && Date.now() - run.startedAt > (TTL_S + 30) * 1000) {
        run.done = true;
        emit({ event: 'done', why: 'ttl with no frame to finish on', stage: run.stage, frame: counts.frames, counts: JSON.parse(JSON.stringify(counts)) });
        revert();
      }
      emit({ event: 'liveness', mode: 'link', pid: Process.id, stage: run.stage, reverted: reverted, counts: JSON.parse(JSON.stringify(counts)), frames10s: counts.frames - lastFrames, mainThread: mainTid(), slot: String(slotOf(at('playerVtable'), SLOT.update)), replacement: String(updateCallback) });
      lastFrames = counts.frames;
    }, 10000);
  };

  if (MODE === 'trace') traceMode(); else linkMode();
}
