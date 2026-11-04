// say-verdict.js v1 (thuum, the re-analyst 2026-11-03): the Dynamic read for the scripts-and-quests arm's first question,
// why a relayed voice line's say on a WATCHER seat's puppet ends "refused" (SayTopicInfo's fall-through verdict,
// PuppetApi.cpp:369-531 in the fork's skyrim_platform) instead of started, played or inaudible. Attach to the WATCHER's
// game (the puppet's engine), filtered to FORM, the speaker's form id. One `say` row per SayTopic call on FORM, built from a
// per-thread window opened at 39162's entry and closed at its return, carrying: SayTopic's arguments and return; the
// high-process stage 39642's entry, the branch it took and its return; whether the item picker 25541 was entered, whether it
// walked conditions (25544 entered; TESCondition::IsTrue 29888 and TESConditionItem::IsTrue 29924 counted under it); the play
// 39643, the voice-file start 39772 (or the sound-descriptor path 39771); SpeakSoundFunction 37542's entry with its gate's
// inputs (the 3D, the current scene and its interruptible flag, talking-to-player, the actor's position against the audio
// listener's from 67710 per axis, the dialogue output model's max distance); and the verdict word computed the way
// PuppetApi.cpp:470-506 computes it from the engine's state after the call (state byte 3 "started"; a valid handle or a running
// timer "played"; greetingPlayer "inaudible"; else "refused"), printed as `say <actor> info <info> -> <word>` so the row lines up
// with c<N>'s VoiceService console line (skymp5-client voiceService.ts:151-152). Outside a window: `infoEvent` rows (25616, the
// BEGIN 0 and END 1 of FORM's lines), `clearGreetTopic` rows (39334 on FORM's process, with the caller's module: the fork's
// pre-clear and inaudible clear, or the engine's own END paths), a count of UpdateVoiceTimer 37752 calls on FORM (the pair
// PuppetHooks.cpp:62-158 runs once a frame while a line is in flight), a kernel32!Sleep pulse, a liveness row every 10 s, and a
// summary at TTL with counts per verdict and per refusing branch. Attach only: no Interceptor.replace. Engine calls made from
// the listeners are getters the engine itself calls on this thread: BSSoundHandle::IsValid 67621 and GetDuration 67630 (what
// PuppetApi reads), BGSDefaultObjectManager::GetSingleton 13894, the Actor's GetCurrentScene virtual (TESObjectREFR.h:270,
// slot 0x4A) and the attenuation's GetMaxDistance virtual (BGSSoundOutput.h:69, slot 1); each is wrapped. Frida's listener
// guard (docs/research/adr065-serialize-on-demand-2026-11-03.md, "Frida's listener guard"): a hook never fires inside another
// hook's callback on the same thread, so nothing here calls a hooked function from a listener except the two sound-handle
// getters, whose own GetDuration hook is then bypassed for that call (the window's `duration` list holds only the engine's
// reads). Hooks DO fire for the engine's own nested calls (39162's body calls 39642, which calls 37266 and so on): the guard is
// set only while a callback runs.
//
// LAB_PARAMS (lab-api's frida step prepends globalThis.LAB_PARAMS; `params` alone is undefined): FORM, the speaker's form id as
// hex ("0x1348d" or "1348d"; a bare string is read as hex), required; TTL, seconds until the summary and the detach (default
// 600); VERBOSE, a sub-row per inner hook as it happens (default false); ITEMS, also hook the per-item evaluator 29924, which
// the engine calls very often (default false; the walk 25544 and 29888 are always hooked). Run it from a scenario on the
// watcher seat, `- c2: frida {script: say-verdict.js, params: {FORM: "0x13491", TTL: 900}}`, with a `wait: 15` before the
// lines (the pitfalls note: lab-api's 5 s sleep plus the attach); `just frida say-verdict.js c2` posts the client and the file
// only, so it cannot pass FORM, and a run without FORM answers the "FORM is required" ready row and does nothing. Read the ready
// row's pid against the run's c2-skyrim-platform-pid<N>.log before reading any row (lab-frida-wrong-process).
//
// Every id below is `just addr <id>` on Address Library 1.6.1170 (2026-11-03); the first bytes are Ghidra's read of
// /SkyrimSE-1.6.1170.0.exe.unpacked.exe at image base 0x140000000 and are printed again by the ready row from the live process.
// Structures: CommonLibSSE-NG b93280e8 headers (file:line inline) and the decompiles of this read (HYPOTHESIS where the
// decompile is the only source, rule 2). Actor's runtime data sits at +8 on 1.6.1170 (Actor.h:710-713 RelocateMemberIfNewer
// 0xE0 to 0xE8; the memory note commonlib-runtime-data-accessor), so the header's /* 0E0 */ boolBits is +0xE8 here, matching
// 37266's `*(uint *)(actor + 0xe8) & 0x180` and 37542's `param_1[0x22]` (0x110, voiceTimer) and `param_1 + 0x4f` (0x278, the
// state byte). HighProcessData and AIProcess offsets are not relocated: the decompiles use the header's numbers verbatim.
//
// The static read this script tests (the decompiles of 2026-11-03, docs/verbs/npc-stream.md:1344-1349 and :1779-1786):
// 39162 SayTopic(process, actor, topic, info, unused, flag6, flag7, keepExtra) runs the item itself when process->high is null
// (the low path) and otherwise tail-calls 39642 with the same arguments. 39642 writes high->unk45C = flag6, then refuses
// (returns 1, nothing said; it returns 1 after a successful play too and 0 only when the picker returned null, so `ret` never
// tells a refusal from a start and the branch never reads it) at three gates in this order: B1 the lip entry at high+0x3B8 exists and its word at +0xC has load
// state (bits 28 to 30) 1 or 2, queued or pending; B2 high->soundHandles[0] IsValid and GetDuration == 0, a sound still loading;
// B3 37266 says busy: (actor boolBits & 0x180) != 0x180 (kSoundFileDone 1<<7 and kVoiceFileDone 1<<8, Actor.h:166-167, both
// must be set) or voiceTimer > 0. Past the gates, 25541 makes the DialogueItem (with the info given it skips the condition walk
// 25544 and calls DialogueItem::Ctor 35220 directly: a given info ALWAYS yields an item), 39643 stores it in high->greetTopic
// and, if it has a current response, starts it: the response's +0x30 null and actor bit 7 set take 39772 (the voice file), a
// non-null +0x30 takes 39771 (the sound descriptor: no state byte, a handle, PuppetApi reads "played"); B4 no current response
// means nothing starts and nothing marks in flight: "refused" with the item held. 39772 calls 37542 and then sets greetingPlayer
// (+0x454) UNCONDITIONALLY and clears kVoiceFileDone unless the lip is pending. 37542 sets voiceTimer = -1 at its entry, and its
// gate returns 0 before the lip branch, the sound build and the state byte 3 when Get3D2 is null, when the path is null or a
// limb is gone (tested before the scene, failing whatever the scene), or, only with no current scene or an interruptible one
// (BGSScene.h:44, :95) and not talkingToPC (HighProcessData.h:341), when the actor lies at or beyond the output model's max
// distance from the audio listener (67710) on ANY axis (a cube): PuppetApi reads
// "inaudible" (in flight, nothing playing). So a "refused" verdict can only be B1, B2, B3 or B4, or a start whose state byte was
// later reset: this trace names which. The suspected mechanism (HYPOTHESIS): an earlier "inaudible" start cleared
// kVoiceFileDone (39772) and set the timer to -1 (37542's entry), the pair never ran (DriveVoice runs it only with state 1, 2, 3
// or a timer above 0) so no END set the done bits back, and PuppetApi's inaudible branch clears the item (39334) but not the
// bits: every later say on that puppet refuses at B3 with bits missing 0x100 and timer -1. The verb doc's open question
// (:1361-1363, the done bits' initial value on a fresh actor) is the `before.bits` of FORM's first say row.
//
// Reading rule (each row's `branch` says it; the summary counts `branchKey`, the label before the detail's colon):
// - A null-topic replay (the detour's own continuation, PuppetHooks.cpp DriveVoice) re-enters 39162 from 39642 on the same
//   thread; the window is the outer call's and the sub-records (stage, play, voiceFile, speak) then hold the innermost call;
//   `nested.length > 0` marks such a row, and its labels carry the prefix "greetTopic replay (null topic): " (no 25541 call:
//   39642 takes high->greetTopic itself).
// - "busy (B3): done bits missing ..." with `before.timer` <= 0: the previous line never ended on this seat (the bits were never
//   set back; kVoiceFileDone missing alone after an "inaudible" row is the mechanism above; both missing on the first say is the
//   fresh actor's initial value). With `before.timer` > 0 PuppetApi would print "played", not "refused".
// - "lip pending (B1)": the previous line's lip entry still queued or pending (an asynchronous load, flag7 true, that the
//   synchronous PuppetApi shape never asks for; the AI replay does).
// - "sound loading (B2)": `duration` rows with ret 0 on a valid handle (the previous line's sound stopped before it loaded).
// - "no response (B4)": `play.responses` 0, the item built with no response list on this seat (the INFO's responses did not
//   load here); `picker.walk` false and `cond` zeros are the expected case with the info given, a `walk.entered` true row means
//   the info was null (the AI's own replay) and conditions were walked.
// - "audibility gate (B6): ...": `speak.gate` names the input (no 3D, no path, or the axis distance against `speak.maxDistance`
//   with `speak.listener`); PuppetApi prints "inaudible" for it, so a "refused" verdict with this branch means the in-flight
//   mark was cleared between the start and the read.
// - "started": state byte 3 after 37542; the verdict word is then PuppetApi's own.
// - A console `-> played` with no `say` row at that time is PuppetApi's repeat branch (the item in progress, no engine call).
// - `clearGreetTopic` rows with a caller in SkyrimPlatformImpl.dll are the fork's pre-clear (a timer above 0 before the say) or
//   its inaudible clear; with a caller in SkyrimSE.exe the engine's own END (37544) or stop (37741).
// What changed: v1 reviewed GO 2026-11-03 (the fresh review; notes N1 to N5 and N7 to N11 applied as written: the null-topic
// replay's branch labels, hookBytes read before any attach, the scenario-only run line, the TTL guard, branch counts by label,
// 39642's return value, the gate's order of tests, the unreadable-bits guard, the nested-call reading rule, the has3D tag).
'use strict';
const PARAMS = (typeof LAB_PARAMS === 'object' && LAB_PARAMS) ? LAB_PARAMS : {};
const parseForm = function (v) {
  if (typeof v === 'number') return v;
  if (typeof v !== 'string') return NaN;
  const s = v.trim();
  if (/^0x[0-9a-f]+$/i.test(s)) return parseInt(s.slice(2), 16);
  if (/^[0-9a-f]+$/i.test(s)) return parseInt(s, 16);
  return NaN;
};
const flagOf = function (v) { return v === true || v === 'true' || v === 1 || v === '1'; };
const FORM = parseForm(PARAMS.FORM);
const ttlIn = Number(PARAMS.TTL);
const TTL_S = Number.isFinite(ttlIn) && ttlIn > 0 ? ttlIn : 600; // N4: Number("10m") is NaN and setTimeout(fn, NaN) fires at once
const VERBOSE = flagOf(PARAMS.VERBOSE);
const ITEMS = flagOf(PARAMS.ITEMS);
function emit(obj) { obj.t = Date.now(); send(obj); console.log(JSON.stringify(obj)); }

// `just addr` on Address Library 1.6.1170, 2026-11-03; (h) hooked, (c) called, (r) read. The bytes column is Ghidra's.
const OFFSETS = {
  '1.6.1170.0': {
    sayTopic: 0x6d71e0, // 39162 SayTopic (h): 48 8b c4 57 41 54 41 55; the fork's Offsets::Voice::SayTopic (game/Offsets.h:213)
    stage: 0x6f7bb0, // 39642 the high-process body (h): 4c 8b dc 56 57 41 54 41 (named SayTopic_HighProcessBody_39642 in the project)
    busy: 0x662a90, // 37266 the busy test (h): 8b 81 e8 00 00 00 25 80
    picker: 0x3e8160, // 25541 the item picker (h): 4c 8b dc 57 41 56 41 57
    walk: 0x3e82f0, // 25544 the condition walk the picker runs with a null info (h): 48 8b c4 4c 89 48 20 4c
    condIsTrue: 0x49f8f0, // 29888 TESCondition::IsTrue(action, target) (h): 48 83 ec 68 33 c0 48 89 (relids.tsv:377)
    condItem: 0x4a05e0, // 29924 TESConditionItem::IsTrue(params) (h under ITEMS): 48 89 4c 24 08 55 53 56 (relids.tsv:378)
    play: 0x6f8020, // 39643 the play of the item (h): 48 8b c4 48 89 50 10 56 (HighProcess_PlayDialogueItem_39643)
    voiceFile: 0x70c2b0, // 39772 the voice-file start (h): 48 85 d2 0f 84 0f 02 00 (HighProcess_SpeakResponseVoiceFile_39772)
    soundPath: 0x70bfc0, // 39771 the sound-descriptor path (h): 48 85 d2 0f 84 dc 02 00
    speak: 0x67a9d0, // 37542 Actor::SpeakSoundFunction (h): 48 8b c4 44 89 48 20 48
    listener: 0xcb2db0, // 67710 the audio listener's position, returns float* (h, onLeave): 48 8b 0d 01 78 51 02 e9
    getDuration: 0xcaf810, // 67630 BSSoundHandle::GetDuration (h and c): 40 53 48 83 ec 20 8b 19 (relids.tsv:629)
    isValid: 0xcaf5b0, // 67621 BSSoundHandle::IsValid (c): 40 53 48 83 ec 20 8b 19 (relids.tsv:625)
    infoEvent: 0x3ebac0, // 25616 TESTopicInfo's event sender (info, type, speaker handle, noCallback) (h): 48 8b c4 57 41 54 41 55
    clearGreet: 0x6e1b70, // 39334 ClearGreetTopic(process) (h): 40 57 48 83 ec 20 48 8b; the fork's Offsets::Voice::ClearGreetTopic (game/Offsets.h:222)
    voiceTimer: 0x68f4e0, // 37752 UpdateVoiceTimer(actor, force) (h, counted): 40 57 48 83 ec 20 f3 0f; Offsets::Voice::UpdateVoiceTimer (game/Offsets.h:214)
    defaultObjects: 0x1c2e70, // 13894 BGSDefaultObjectManager::GetSingleton (c): 40 53 48 83 ec 30 48 c7 (BGSDefaultObjectManager.h:1012)
    player: 0x31874f8, // 403521 NiPointer<PlayerCharacter> (r): CommonLib Offsets.h:451
    handleEntries: 0x20fc600, // 400622 the handle table (r): BSPointerHandleManager.h:30, resolved lock-free as apply-on-demand.js does
  },
};
// TESForm.h:353-356: formFlags +0x10, formID +0x14, formType +0x1A. TESObjectREFR.h:73-80 OBJ_REFR location +0x14 of data (+0x40, :495),
// so +0x54; loadedData +0x68 (:497) and its data3D +0x68 (:101). Actor.h (+8 on 1.6.1170): boolBits 0xE8, currentProcess 0xF8,
// dialogueItemTarget 0x100, voiceTimer 0x110, soundCallBackSet 0x278 (declared first in its byte at :698, the comment pair is swapped;
// 37542 writes 3 there). AIProcess.h:196-197 middleHigh +0x08, high +0x10. HighProcessData.h: soundDelay 0x2F8 (:281), soundHandles[0]
// 0x2FC (:282), greetingTimer 0x314 (:283), greetTopic 0x360 (:298), unk36C 0x36C (:300), unk3B8 0x3B8 (:315), unk450 0x450 (:333),
// greetingPlayer 0x454 (:337), talkingToPC 0x458 (:341), unk45C 0x45C (:345). DialogueItem.h:54-60: responses 0x08 (BSSimpleList with
// its head node inline, item +0 and next +8, BSTList.h:77-78), currentResponse 0x18, info 0x20, topic 0x28. TESTopicInfo.h:135-141:
// parentTopic 0x20, saidOnce 0x3A, data.flags 0x3C. TESTopic.h:170-172: ownerQuest 0x40, topicInfos 0x48, numTopicInfos 0x50.
// BSSoundHandle.h:51-55: soundID +0, state +8. BGSScene.h:95 flags +0xA0, :44 kInterruptible 1<<4. BGSSoundOutput.h:122 attenuation
// +0x30; its DynamicAttenuationCharacteristics is a vtable then DataType (sizeof 0x18 = 8 + 0x10, :51-76): minDistance +0x08, maxDistance
// +0x0C (HYPOTHESIS for the +8; the slot-1 getter is also called). BGSDefaultObjectManager.h:1073 objects +0x20, :160 kDialogueOutputModel3D
// 147 (+0x4B8, as 37542 reads it); :1075 objectInit at 0xB80 would put its byte at 0xC13, 37542 reads 0xC23 (two more default objects
// on this build than the header's kTotal 364: HYPOTHESIS, both bytes printed). DialogueResponse has no CommonLib header; 39772's and
// 39643's reads (HYPOTHESIS): +0x00 BSString text (chars pointer), +0x10 emotion type, +0x14 emotion value, +0x18 BSFixedString voice
// path (BSFixedString.h:232 _data +0), +0x30 the sound descriptor, +0x38 the emotion flag. BOOL_BITS Actor.h:156-190.
const FORM_ID = 0x14, FORM_TYPE = 0x1a, ACHR = 0x3e;
const R_LOCATION = 0x54, R_LOADED = 0x68, L_DATA3D = 0x68;
const A_BITS = 0xe8, A_PROCESS = 0xf8, A_TARGET = 0x100, A_VOICE_TIMER = 0x110, A_STATE = 0x278;
const P_HIGH = 0x10;
const H_SOUND_DELAY = 0x2f8, H_HANDLE = 0x2fc, H_GREET_TIMER = 0x314, H_GREET_TOPIC = 0x360, H_GREET_TARGET = 0x36c, H_LIP = 0x3b8;
const H_UNK450 = 0x450, H_GREETING_PLAYER = 0x454, H_TALKING_TO_PC = 0x458, H_UNK45C = 0x45c;
const DI_RESPONSES = 0x08, DI_CURRENT = 0x18, DI_INFO = 0x20, DI_TOPIC = 0x28;
const TI_PARENT = 0x20, TI_SAID_ONCE = 0x3a, TI_FLAGS = 0x3c;
const TP_INFOS = 0x48, TP_COUNT = 0x50;
const RS_TEXT = 0x00, RS_EMOTION = 0x10, RS_VALUE = 0x14, RS_PATH = 0x18, RS_DESCRIPTOR = 0x30;
const SH_ID = 0x00, SH_STATE = 0x08;
const SC_FLAGS = 0xa0, SC_INTERRUPTIBLE = 1 << 4;
const SO_ATTENUATION = 0x30, AT_MIN = 0x08, AT_MAX = 0x0c;
const DOM_MODEL_3D = 0x4b8, DOM_INIT_3D_DECOMPILE = 0xc23, DOM_INIT_3D_HEADER = 0xc13;
const SLOT_GET_CURRENT_SCENE = 0x4a, SLOT_GET_3D2 = 0x70, SLOT_GET_MAX_DISTANCE = 1;
const DONE_BITS = 0x180, K_SOUND_FILE_DONE = 1 << 7, K_VOICE_FILE_DONE = 1 << 8;
const FLT_MAX = 3.4028234663852886e38;
const HANDLE_INDEX_MASK = 0xfffff, HANDLE_AGE_MASK = 0x3f00000, HANDLE_INUSE_BIT = 1 << 26, HANDLE_REF_BASE = 0x20, REF_HANDLE_WORD = 0x28;
const BIT_NAMES = ['kDelayUpdateScenegraph', 'kProcessMe', 'kMurderAlarm', 'kHasSceneExtra', 'kHeadingFixed', 'kSpeakingDone', 'kIgnoreChangeAnimationCall', 'kSoundFileDone', 'kVoiceFileDone', 'kInTempChangeList', 'kDoNotRunSayToCallback', 'kDead', 'kForceGreetingPlayer', 'kForceUpdateQuestTarget', 'kSearchingInCombat', 'kAttackOnNextTheft', 'kEvpBuffered', 'kResetAI', 'kInWater', 'kSwimming', 'kVoicePausedByScript', 'kWasInFrustrum', 'kShouldRotateToTrack', 'kSetOnDeath', 'kDoNotPadVoice', 'kFootIKInRange', 'kPlayerTeammate', 'kGivePlayerXP', 'kSoundCallbackSuccess', 'kUseEmotion', 'kGuard', 'kParalyzed']; // Actor.h:159-190
const LIP_WORDS = { '-1': 'no entry', 0: 'absent', 1: 'queued', 2: 'pending', 3: 'loaded', 4: 'loaded', 5: 'failed', 6: '6', 7: '7' }; // PuppetApi.cpp:393-401 and the 39642/39772 tests: pending when 1 or 2, loaded when 3 or 4

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

const hex = function (n) { return n < 0 ? String(n) : '0x' + n.toString(16); };
const idHex = function (n) { return n < 0 ? String(n) : n.toString(16); }; // the console's shape: no 0x
const u8 = function (p, o) { try { return p.add(o).readU8(); } catch (e) { return -1; } };
const s8 = function (p, o) { try { return p.add(o).readS8(); } catch (e) { return -99; } };
const u32 = function (p, o) { try { return p.add(o).readU32(); } catch (e) { return -1; } };
const f32 = function (p, o) { try { return +p.add(o).readFloat().toFixed(3); } catch (e) { return null; } };
const ptrAt = function (p, o) { try { return p.isNull() ? NULL : p.add(o).readPointer(); } catch (e) { return NULL; } };
const bytesHex = function (a) { let s = ''; for (let i = 0; i < a.length; i++) s += ('0' + a[i].toString(16)).slice(-2); return s; };
const safeBytes = function (p) { try { return bytesHex(new Uint8Array(p.readByteArray(8))); } catch (e) { return 'unreadable'; } };
const utf8At = function (p, n) { try { return p.isNull() ? null : p.readUtf8String(n); } catch (e) { return null; } };
const fixedString = function (field) { return utf8At(ptrAt(field, 0), 160); }; // a BSFixedString field: the chars pointer at +0
const formIdOf = function (p) { return p.isNull() ? 0 : u32(p, FORM_ID); };
const vec3 = function (p, o) { return [f32(p, o), f32(p, o + 4), f32(p, o + 8)]; };
const lowByte = function (v) { try { return v.and(0xff).toInt32(); } catch (e) { return -1; } }; // a bool in a register or a stack slot: the low byte only
const bitNames = function (bits, mask) { const r = []; for (let i = 0; i < 32; i++) if ((mask >>> i) & 1 && !((bits >>> i) & 1)) r.push(BIT_NAMES[i]); return r; };

const exe = Process.getModuleByName('SkyrimSE.exe');
const version = fileVersion(exe.path);
const off = OFFSETS[version];
if (off === undefined || !(FORM > 0)) {
  emit({ event: 'ready', error: off === undefined ? 'no offsets for this runtime' : 'FORM is required (hex form id)', version: version, pid: Process.id, params: PARAMS });
} else {
  const at = function (name) { return exe.base.add(off[name]); };
  const rva = function (p) { try { return hex(p.sub(exe.base).toUInt32()); } catch (e) { return String(p); } };
  const whereIs = function (p) { const m = Process.findModuleByAddress(p); return m === null ? String(p) : m.name + '+' + hex(p.sub(m.base).toUInt32()); };
  const nf = {
    isValid: new NativeFunction(at('isValid'), 'uint8', ['pointer']),
    getDuration: new NativeFunction(at('getDuration'), 'uint64', ['pointer']),
    defaultObjects: new NativeFunction(at('defaultObjects'), 'pointer', []),
  };
  const callVirtual = function (obj, slot, ret) { // a getter the engine calls on this thread: GetCurrentScene (0x4A), GetMaxDistance (1)
    const vt = ptrAt(obj, 0);
    if (vt.isNull()) throw new Error('no vtable');
    return new NativeFunction(ptrAt(vt, slot * 8), ret, ['pointer'])(obj);
  };
  const counts = {
    sayTopic: 0, sayTopicForm: 0, stage: 0, busy: 0, picker: 0, walk: 0, condIsTrue: 0, condItem: 0, play: 0, voiceFile: 0, soundPath: 0, speak: 0,
    listener: 0, getDuration: 0, infoEvent: 0, infoEventForm: 0, clearGreet: 0, clearGreetForm: 0, voiceTimer: 0, voiceTimerForm: 0, pulse: 0,
    says: 0, nested: 0, verdicts: { started: 0, played: 0, inaudible: 0, refused: 0 }, branches: {},
  };
  const win = {}; // thread id -> the open say's record (opened at 39162's entry on FORM, closed at its return)
  let formActor = NULL, formProcess = NULL; // learned at FORM's first say: 39334 takes the process, not the actor
  const attachErrors = [];
  const attach = function (name, cb) { try { Interceptor.attach(at(name), cb); } catch (e) { attachErrors.push(name + ': ' + e); } };
  const playerOf = function () { return ptrAt(at('player'), 0); }; // the NiPointer's one read gives the actor (the memory note commonlib-relocation-columns)
  const refOfHandle = function (h) { // lock-free, the way the handle lookup 12331 resolves one (apply-on-demand.js refOfHandle; HYPOTHESIS for the layout)
    if (!(h > 0) || h === 0xffffffff) return { handle: hex(h >>> 0), resolved: false };
    const idx = h & HANDLE_INDEX_MASK, e = at('handleEntries').add(idx * 16), bits = u32(e, 0), p = ptrAt(e, 8);
    if (p.isNull() || (bits & HANDLE_INUSE_BIT) === 0 || (bits & HANDLE_AGE_MASK) !== (h & HANDLE_AGE_MASK)) return { handle: hex(h >>> 0), resolved: false };
    const ref = p.sub(HANDLE_REF_BASE), word = u32(ref, REF_HANDLE_WORD);
    if (word < 0 || (word >>> 11) !== idx) return { handle: hex(h >>> 0), resolved: false };
    return { handle: hex(h >>> 0), resolved: true, formId: idHex(u32(ref, FORM_ID)), formType: hex(u8(ref, FORM_TYPE)) };
  };
  const rootOf = function (actor) { const ld = ptrAt(actor, R_LOADED); return ld.isNull() ? NULL : ptrAt(ld, L_DATA3D); }; // loadedData->data3D (TESObjectREFR.h:497, :101); the gate calls Get3D2 (slot 0x70), the same pointer for a puppet (HYPOTHESIS, N8)
  const lipOf = function (high) { // HighProcessData.h:315 unk3B8: the current line's lip-sync resource entry; its +0xC word's bits 28-30 are the load state (PuppetApi.cpp:393-401, HYPOTHESIS)
    const entry = high.isNull() ? NULL : ptrAt(high, H_LIP);
    if (entry.isNull()) return { state: -1, word: 'no entry', loadedPtr: false };
    const w = u32(entry, 0xc), st = w < 0 ? -1 : (w >>> 28) & 7;
    return { state: st, word: LIP_WORDS[st] || '?', loadedPtr: !ptrAt(entry, 0x28).isNull() };
  };
  const handleOf = function (high) { // BSSoundHandle.h:51-55; IsValid and GetDuration are the engine's own getters (what PuppetApi reads)
    if (high.isNull()) return { present: false };
    const h = high.add(H_HANDLE), r = { soundID: hex(u32(h, SH_ID) >>> 0), assumedState: u32(h, SH_STATE) };
    try { r.valid = nf.isValid(h) !== 0; } catch (e) { r.validError = String(e); }
    try { r.duration = Number(nf.getDuration(h).toString()); } catch (e) { r.durationError = String(e); }
    return r;
  };
  const itemOf = function (item) { // DialogueItem.h:53-60
    if (item.isNull()) return null;
    const r = { item: String(item), info: idHex(formIdOf(ptrAt(item, DI_INFO))), topic: idHex(formIdOf(ptrAt(item, DI_TOPIC))), responses: 0, currentResponse: !ptrAt(item, DI_CURRENT).isNull() };
    try { // BSSimpleList: the head node inline at +0x08 (item +0, next +8), 16 deep at most
      let node = item.add(DI_RESPONSES);
      for (let i = 0; i < 16 && !node.isNull(); i++) { if (ptrAt(node, 0).isNull()) break; r.responses += 1; node = ptrAt(node, 8); }
    } catch (e) { r.responsesError = String(e); }
    return r;
  };
  const responseOf = function (resp) { // no CommonLib header: 39772's and 39643's reads (HYPOTHESIS)
    if (resp.isNull()) return null;
    return { text: utf8At(ptrAt(resp, RS_TEXT), 96), voicePath: fixedString(resp.add(RS_PATH)), emotion: u32(resp, RS_EMOTION), value: u32(resp, RS_VALUE), soundDescriptor: !ptrAt(resp, RS_DESCRIPTOR).isNull() };
  };
  const snapshot = function (actor, process) { // the facts PuppetApi.cpp logs before and after its call, read the same way
    const high = process.isNull() ? NULL : ptrAt(process, P_HIGH), bits = u32(actor, A_BITS), player = playerOf();
    const r = {
      bits: hex(bits >>> 0), doneBitsMissing: bits < 0 ? ['unreadable'] : bitNames(bits, DONE_BITS), timer: f32(actor, A_VOICE_TIMER), state: s8(actor, A_STATE),
      high: String(high), lip: lipOf(high), handle: handleOf(high), has3D: !rootOf(actor).isNull(), position: vec3(actor, R_LOCATION),
      dialogueItemTarget: refOfHandle(u32(actor, A_TARGET) >>> 0),
    };
    if (!high.isNull()) {
      r.greetTopic = itemOf(ptrAt(high, H_GREET_TOPIC));
      r.greetTarget = refOfHandle(u32(high, H_GREET_TARGET) >>> 0);
      r.greetingPlayer = u8(high, H_GREETING_PLAYER); r.talkingToPC = u8(high, H_TALKING_TO_PC); r.unk45C = u8(high, H_UNK45C); r.unk450 = u8(high, H_UNK450);
      r.soundDelay = f32(high, H_SOUND_DELAY); r.greetingTimer = f32(high, H_GREET_TIMER);
    }
    if (!player.isNull()) {
      const a = r.position, b = vec3(player, R_LOCATION);
      r.playerPosition = b;
      r.axisDistanceToPlayer = a[0] === null || b[0] === null ? null : +Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]), Math.abs(a[2] - b[2])).toFixed(1);
    }
    return r;
  };
  const verdictOf = function (after) { // PuppetApi.cpp:470-506, the engine's state read after the call
    if (after.state === 3) return 'started';
    if ((after.handle && after.handle.valid === true) || (after.timer !== null && after.timer > 0)) return 'played';
    if (after.greetingPlayer === 1) return 'inaudible';
    return 'refused';
  };
  const branchOf = function (rec) {
    if (!rec.stage) return 'low path (no high process: 39162 ran the item itself)';
    if (!rec.busy) {
      const lip = rec.before.lip.state;
      if (lip === 1 || lip === 2) return 'lip pending (B1)';
      const d = rec.duration.length === 0 ? null : rec.duration[rec.duration.length - 1].ret;
      if (d === 0) return 'sound loading (B2)';
      return 'returned before the busy test (unread)';
    }
    if (rec.busy.ret !== 0) {
      const missing = rec.busy.doneBitsMissing, timer = rec.busy.timer !== null && rec.busy.timer > 0;
      return 'busy (B3): ' + (missing.length > 0 ? 'done bits missing ' + missing.join('+') : 'done bits set') + (timer ? ' and voice timer ' + rec.busy.timer : '');
    }
    if (!rec.picker && !rec.play) return 'free but no picker call (unread)';
    const replay = !rec.picker && rec.play ? 'greetTopic replay (null topic): ' : ''; // N1: the detour's continuation passes a null topic; 39642 then takes high->greetTopic itself (no 25541) and plays it
    if (rec.picker && !rec.picker.item) return 'no item (the picker returned null' + (rec.walk ? ', after the condition walk' : '') + ')';
    if (!rec.play) return 'item made but 39643 not entered (unread)';
    if (rec.play.item && (rec.play.item.responses === 0 || !rec.play.item.currentResponse)) return replay + 'no response (B4)';
    if (rec.soundPath) return replay + 'sound-descriptor path (39771)';
    if (!rec.voiceFile) return replay + (rec.play.soundFileDoneBit === 1 ? '39643 took neither path (unread)' : 'kSoundFileDone clear at 39643');
    if (!rec.speak) return replay + '39772 entered but 37542 not (unread)';
    if (rec.speak.stateAfter === 3) return replay + 'started';
    return replay + 'audibility gate (B6): ' + (rec.speak.gate || 'unread');
  };
  const branchKeyOf = function (branch) { return branch.replace(/(\(B[0-9]\)): .*$/, '$1'); }; // N5: the label before the detail's colon (B3's timer value, B6's distances stay in the row)
  const sub = function (rec, obj) { if (VERBOSE) { obj.form = idHex(FORM); obj.say = rec.n; obj.thread = rec.tid; emit(obj); } };

  // the hook sites' first bytes, read BEFORE any attach (the pitfalls rule; N2): each should equal the header's Ghidra bytes
  const hookBytes = {};
  ['sayTopic', 'stage', 'busy', 'picker', 'walk', 'condIsTrue', 'condItem', 'play', 'voiceFile', 'soundPath', 'speak', 'listener', 'getDuration', 'infoEvent', 'clearGreet', 'voiceTimer', 'isValid', 'defaultObjects'].forEach(function (n) { hookBytes[n] = { rva: hex(off[n]), bytes: safeBytes(at(n)) }; });

  // 39162 SayTopic (process, actor, topic, info, unused, flag6, flag7, keepExtra): the window
  attach('sayTopic', {
    onEnter(args) {
      counts.sayTopic += 1;
      const actor = args[1];
      if (formIdOf(actor) !== FORM) return;
      counts.sayTopicForm += 1;
      const tid = this.threadId;
      if (win[tid] !== undefined) { counts.nested += 1; win[tid].nested.push({ topic: idHex(formIdOf(args[2])), info: idHex(formIdOf(args[3])) }); return; } // 39642's null-topic replay calls 39162 again
      formActor = actor; formProcess = args[0];
      counts.says += 1;
      const rec = {
        n: counts.says, tid: tid, t0: Date.now(), caller: whereIs(this.returnAddress),
        args: { process: String(args[0]), actor: idHex(FORM), topic: idHex(formIdOf(args[2])), info: idHex(formIdOf(args[3])), unused: lowByte(args[4]), flag6: lowByte(args[5]), flag7: lowByte(args[6]), keepExtra: lowByte(args[7]) },
        before: snapshot(actor, args[0]), stage: null, busy: null, picker: null, walk: null, cond: { isTrue: 0, items: 0 }, play: null, voiceFile: null, soundPath: null, speak: null,
        listener: null, duration: [], events: [], clears: 0, nested: [],
      };
      if (!args[3].isNull()) rec.args.infoParent = idHex(formIdOf(ptrAt(args[3], TI_PARENT)));
      win[tid] = rec;
      this.rec = rec;
      sub(rec, { event: 'sayTopic', args: rec.args, before: rec.before });
    },
    onLeave(retval) {
      const rec = this.rec;
      if (rec === undefined) return;
      rec.ret = lowByte(retval);
      rec.after = snapshot(formActor, formProcess);
      const verdict = verdictOf(rec.after), branch = branchOf(rec), branchKey = branchKeyOf(branch);
      counts.verdicts[verdict] = (counts.verdicts[verdict] || 0) + 1;
      counts.branches[branchKey] = (counts.branches[branchKey] || 0) + 1;
      delete win[rec.tid];
      emit({
        event: 'say', line: 'say ' + idHex(FORM) + ' info ' + rec.args.info + ' -> ' + verdict, actor: idHex(FORM), info: rec.args.info, topic: rec.args.topic, verdict: verdict, branch: branch, branchKey: branchKey,
        n: rec.n, thread: rec.tid, ms: Date.now() - rec.t0, caller: rec.caller, args: rec.args, ret: rec.ret, before: rec.before, after: rec.after,
        stage: rec.stage, busy: rec.busy, picker: rec.picker, walk: rec.walk, cond: rec.cond, play: rec.play, voiceFile: rec.voiceFile, soundPath: rec.soundPath, speak: rec.speak,
        listener: rec.listener, duration: rec.duration, events: rec.events, clears: rec.clears, nested: rec.nested,
      });
    },
  });
  // 39642 the high-process body: the three gates (B1 lip, B2 sound duration, B3 busy), then the picker and the play
  attach('stage', {
    onEnter(args) { counts.stage += 1; const rec = win[this.threadId]; if (rec === undefined) return; this.rec = rec; rec.stage = { entered: true, process: String(args[0]), topic: idHex(formIdOf(args[2])), info: idHex(formIdOf(args[3])), flag6: lowByte(args[5]), flag7: lowByte(args[6]), keepExtra: lowByte(args[7]) }; sub(rec, { event: 'stage', stage: rec.stage }); },
    onLeave(retval) { const rec = this.rec; if (rec === undefined) return; rec.stage.ret = lowByte(retval); },
  });
  // 37266 the busy test: (actor boolBits & 0x180) != 0x180 or voiceTimer > 0 returns 1
  attach('busy', {
    onEnter(args) { counts.busy += 1; const rec = win[this.threadId]; if (rec === undefined) return; this.rec = rec; const bits = u32(args[0], A_BITS); rec.busy = { bits: hex(bits >>> 0), doneBitsMissing: bits < 0 ? ['unreadable'] : bitNames(bits, DONE_BITS), timer: f32(args[0], A_VOICE_TIMER) }; },
    onLeave(retval) { const rec = this.rec; if (rec === undefined) return; rec.busy.ret = lowByte(retval); sub(rec, { event: 'busy', busy: rec.busy }); },
  });
  // 25541 the item picker (topic, actor, target, info, 0, 0): with the info given, DialogueItem::Ctor and no walk
  attach('picker', {
    onEnter(args) {
      counts.picker += 1; const rec = win[this.threadId]; if (rec === undefined) return; this.rec = rec;
      const info = args[3], topic = args[0];
      rec.picker = { entered: true, topic: idHex(formIdOf(topic)), topicInfos: u32(topic, TP_COUNT), actor: idHex(formIdOf(args[1])), target: args[2].isNull() ? null : idHex(formIdOf(args[2])), infoGiven: !info.isNull(), info: idHex(formIdOf(info)) };
      if (!info.isNull()) { rec.picker.infoParent = idHex(formIdOf(ptrAt(info, TI_PARENT))); rec.picker.saidOnce = u8(info, TI_SAID_ONCE); rec.picker.infoFlags = hex(u32(info, TI_FLAGS) & 0xffff); }
    },
    onLeave(retval) { const rec = this.rec; if (rec === undefined) return; rec.picker.item = retval.isNull() ? null : itemOf(retval); rec.picker.walk = rec.walk !== null; sub(rec, { event: 'picker', picker: rec.picker }); },
  });
  // 25544 the condition walk over the topic's infos (only with a null info)
  attach('walk', {
    onEnter(args) { counts.walk += 1; const rec = win[this.threadId]; if (rec === undefined) return; this.rec = rec; rec.walk = { entered: true, topic: idHex(formIdOf(args[0])), topicInfos: u32(args[0], TP_COUNT) }; },
    onLeave(retval) { const rec = this.rec; if (rec === undefined) return; rec.walk.ret = retval.isNull() ? null : idHex(formIdOf(retval)); rec.walk.condIsTrue = rec.cond.isTrue; rec.walk.condItems = rec.cond.items; sub(rec, { event: 'walk', walk: rec.walk }); },
  });
  // 29888 TESCondition::IsTrue(action, target) and, under ITEMS, 29924 TESConditionItem::IsTrue(params): counted inside the window
  attach('condIsTrue', { onEnter() { counts.condIsTrue += 1; const rec = win[this.threadId]; if (rec !== undefined) rec.cond.isTrue += 1; } });
  if (ITEMS) attach('condItem', { onEnter() { counts.condItem += 1; const rec = win[this.threadId]; if (rec !== undefined) rec.cond.items += 1; } });
  // 39643 the play (process, DialogueItem**, actor, target, flag7): greetTopic set, then 39772 or 39771 for the current response
  attach('play', {
    onEnter(args) {
      counts.play += 1; const rec = win[this.threadId]; if (rec === undefined) return; this.rec = rec;
      const item = ptrAt(args[1], 0), actor = args[2];
      rec.play = { entered: true, item: itemOf(item), response: responseOf(ptrAt(ptrAt(item, DI_CURRENT), 0)), target: args[3].isNull() ? null : idHex(formIdOf(args[3])), flag7: lowByte(args[4]), soundFileDoneBit: (u32(actor, A_BITS) >>> 7) & 1 };
    },
    onLeave() { const rec = this.rec; if (rec === undefined) return; const high = ptrAt(formProcess, P_HIGH); rec.play.greetTopicAfter = itemOf(ptrAt(high, H_GREET_TOPIC)); rec.play.greetingPlayerAfter = u8(high, H_GREETING_PLAYER); sub(rec, { event: 'play', play: rec.play }); },
  });
  // 39772 the voice-file start (high, response, actor, target, output model, flag7): calls 37542, then marks in flight and clears kVoiceFileDone
  attach('voiceFile', {
    onEnter(args) { counts.voiceFile += 1; const rec = win[this.threadId]; if (rec === undefined) return; this.rec = rec; rec.voiceFile = { entered: true, response: responseOf(args[1]), target: args[3].isNull() ? null : idHex(formIdOf(args[3])), outputModelArg: String(args[4]), async: lowByte(args[5]) }; },
    onLeave() { const rec = this.rec; if (rec === undefined) return; const high = ptrAt(formProcess, P_HIGH), bits = u32(formActor, A_BITS); rec.voiceFile.soundDelayAfter = f32(high, H_SOUND_DELAY); rec.voiceFile.greetingPlayerAfter = u8(high, H_GREETING_PLAYER); rec.voiceFile.bitsAfter = hex(bits >>> 0); rec.voiceFile.doneBitsMissingAfter = bits < 0 ? ['unreadable'] : bitNames(bits, DONE_BITS); sub(rec, { event: 'voiceFile', voiceFile: rec.voiceFile }); },
  });
  // 39771 the sound-descriptor path (no state byte; PuppetApi reads "played")
  attach('soundPath', { onEnter(args) { counts.soundPath += 1; const rec = win[this.threadId]; if (rec === undefined) return; rec.soundPath = { entered: true, response: responseOf(args[1]) }; sub(rec, { event: 'soundPath', soundPath: rec.soundPath }); } });
  // 37542 Actor::SpeakSoundFunction (actor, path, handle, emotion, value, length, speaker idle, listener idle, target, 1, output model, async lip, 1, 1): the gate's inputs
  attach('speak', {
    onEnter(args) {
      counts.speak += 1; const rec = win[this.threadId]; if (rec === undefined) return; this.rec = rec;
      const actor = args[0], process = ptrAt(actor, A_PROCESS), high = ptrAt(process, P_HIGH), player = playerOf();
      const s = { entered: true, path: utf8At(args[1], 160), pathNull: args[1].isNull(), handle: String(args[2]), emotion: args[3].toInt32(), value: args[4].toInt32(), length: args[5].toInt32(), target: args[8].isNull() ? null : idHex(formIdOf(args[8])), asyncLip: lowByte(args[11]),
        isPlayer: !player.isNull() && actor.equals(player), has3D: !rootOf(actor).isNull(), talkingToPC: high.isNull() ? -1 : u8(high, H_TALKING_TO_PC), position: vec3(actor, R_LOCATION), stateBefore: s8(actor, A_STATE), timerBefore: f32(actor, A_VOICE_TIMER) };
      try { const scene = callVirtual(actor, SLOT_GET_CURRENT_SCENE, 'pointer'); s.scene = scene.isNull() ? null : idHex(formIdOf(scene)); s.sceneFlags = scene.isNull() ? null : hex(u32(scene, SC_FLAGS) >>> 0); s.sceneInterruptible = scene.isNull() ? null : (u32(scene, SC_FLAGS) & SC_INTERRUPTIBLE) !== 0; } catch (e) { s.sceneError = String(e); }
      try { // the output model: the argument, else the default kDialogueOutputModel3D (147) as 37542 selects it for a non-player speaker
        let model = args[10], from = 'argument';
        if (model.isNull()) { const dom = nf.defaultObjects(); from = 'default 147'; s.defaultInitByteDecompile = u8(dom, DOM_INIT_3D_DECOMPILE); s.defaultInitByteHeader = u8(dom, DOM_INIT_3D_HEADER); model = ptrAt(dom, DOM_MODEL_3D); }
        s.model = { from: from, ptr: String(model), formId: model.isNull() ? null : idHex(formIdOf(model)) };
        const att = ptrAt(model, SO_ATTENUATION);
        s.model.attenuation = String(att);
        s.maxDistance = att.isNull() ? FLT_MAX : f32(att, AT_MAX); s.minDistance = att.isNull() ? null : f32(att, AT_MIN);
        if (!att.isNull()) { try { s.maxDistanceCall = +callVirtual(att, SLOT_GET_MAX_DISTANCE, 'float').toFixed(3); } catch (e) { s.maxDistanceCallError = String(e); } }
      } catch (e) { s.modelError = String(e); }
      rec.speak = s;
    },
    onLeave() {
      const rec = this.rec; if (rec === undefined) return; const s = rec.speak, actor = formActor, high = ptrAt(formProcess, P_HIGH);
      s.stateAfter = s8(actor, A_STATE); s.timerAfter = f32(actor, A_VOICE_TIMER); s.bitsAfter = hex(u32(actor, A_BITS) >>> 0); s.soundIDAfter = hex(u32(high.add(H_HANDLE), SH_ID) >>> 0);
      if (rec.listener !== null && s.position[0] !== null) { const d = [Math.abs(s.position[0] - rec.listener[0]), Math.abs(s.position[1] - rec.listener[1]), Math.abs(s.position[2] - rec.listener[2])]; s.axisDistanceToListener = +Math.max(d[0], d[1], d[2]).toFixed(1); s.beyondMax = s.maxDistance !== null && d.some(function (x) { return x >= s.maxDistance; }); }
      if (s.stateAfter === 3) s.gate = 'passed';
      else if (!s.has3D) s.gate = 'no 3D (Get3D2 null)';
      else if (s.pathNull) s.gate = 'no voice path';
      else if (s.talkingToPC !== 1 && (s.scene === null || s.sceneInterruptible === true) && s.beyondMax === true) s.gate = 'beyond the output model max distance ' + s.maxDistance + ' on an axis (listener distance ' + s.axisDistanceToListener + ')';
      else s.gate = 'returned before state 3, inputs not naming it (unread: a limb gone, the listener unread, or a sound build failure)';
      sub(rec, { event: 'speak', speak: s, listener: rec.listener });
    },
  });
  // 67710 the audio listener's position: the float* 37542's distance test reads, caught inside the window
  attach('listener', { onLeave(retval) { counts.listener += 1; const rec = win[this.threadId]; if (rec === undefined || retval.isNull()) return; rec.listener = vec3(retval, 0); } });
  // 67630 BSSoundHandle::GetDuration: 39642's B2 reads it on a valid handle (our own call from snapshot bypasses this hook: the listener guard)
  attach('getDuration', {
    onEnter(args) { counts.getDuration += 1; const rec = win[this.threadId]; if (rec === undefined) return; this.rec = rec; this.soundID = hex(u32(args[0], SH_ID) >>> 0); },
    onLeave(retval) { const rec = this.rec; if (rec === undefined) return; const row = { soundID: this.soundID, ret: Number(retval.toString()) }; rec.duration.push(row); sub(rec, { event: 'duration', duration: row }); },
  });
  // 25616 TESTopicInfo's event (info, type 0 begin 1 end, speaker handle, noCallback): FORM's lines beginning and ending
  attach('infoEvent', {
    onEnter(args) {
      counts.infoEvent += 1;
      const speaker = refOfHandle(args[2].toUInt32()), row = { info: idHex(formIdOf(args[0])), type: args[1].toInt32(), speaker: speaker, noCallback: lowByte(args[3]) };
      const rec = win[this.threadId];
      if (rec !== undefined) { counts.infoEventForm += 1; rec.events.push(row); return; }
      if (speaker.resolved && speaker.formId === idHex(FORM)) { counts.infoEventForm += 1; emit({ event: 'infoEvent', form: idHex(FORM), info: row.info, type: row.type, word: row.type === 0 ? 'BEGIN' : 'END', noCallback: row.noCallback, caller: whereIs(this.returnAddress), thread: this.threadId }); }
    },
  });
  // 39334 ClearGreetTopic(process): the fork's pre-clear and inaudible clear (caller in SkyrimPlatformImpl.dll) or the engine's END paths
  attach('clearGreet', {
    onEnter(args) {
      counts.clearGreet += 1;
      if (formProcess.isNull() || !args[0].equals(formProcess)) return;
      counts.clearGreetForm += 1;
      const rec = win[this.threadId];
      if (rec !== undefined) { rec.clears += 1; return; }
      const high = ptrAt(args[0], P_HIGH), bits = u32(formActor, A_BITS);
      emit({ event: 'clearGreetTopic', form: idHex(FORM), caller: whereIs(this.returnAddress), thread: this.threadId, greetTopic: itemOf(ptrAt(high, H_GREET_TOPIC)), greetingPlayer: u8(high, H_GREETING_PLAYER), state: s8(formActor, A_STATE), timer: f32(formActor, A_VOICE_TIMER), bits: hex(bits >>> 0), doneBitsMissing: bitNames(bits, DONE_BITS), handle: handleOf(high) });
    },
  });
  // 37752 UpdateVoiceTimer(actor, force): the pair's first half, counted for FORM (DriveVoice runs it once a frame while a line is in flight)
  attach('voiceTimer', { onEnter(args) { counts.voiceTimer += 1; if (formIdOf(args[0]) === FORM) counts.voiceTimerForm += 1; } });
  // the Interceptor's pulse
  try { Interceptor.attach(Process.getModuleByName('kernel32.dll').getExportByName('Sleep'), { onEnter() { counts.pulse += 1; } }); } catch (e) { attachErrors.push('Sleep: ' + e); }

  const player0 = playerOf();
  emit({ event: 'ready', version: version, pid: Process.id, base: String(exe.base), form: idHex(FORM), ttl: TTL_S, verbose: VERBOSE, items: ITEMS, hooks: hookBytes, attachErrors: attachErrors,
    player: player0.isNull() ? null : { formId: idHex(formIdOf(player0)), position: vec3(player0, R_LOCATION) }, note: 'hookBytes were read before the first attach (N2); the fork hooks none of these, so each should equal the header\'s Ghidra bytes; e9 means another Frida instance patched the site first' });
  const t0 = Date.now();
  const liveness = setInterval(function () { emit({ event: 'liveness', counts: counts, openWindows: Object.keys(win).length, formKnown: !formActor.isNull(), uptimeS: Math.round((Date.now() - t0) / 1000) }); }, 10000);
  setTimeout(function () {
    clearInterval(liveness);
    emit({ event: 'summary', form: idHex(FORM), ttl: TTL_S, says: counts.says, verdicts: counts.verdicts, branches: counts.branches, counts: counts, openWindows: Object.keys(win).length });
    try { Interceptor.detachAll(); emit({ event: 'detached' }); } catch (e) { emit({ event: 'error', where: 'detachAll', error: String(e) }); }
  }, TTL_S * 1000);
}
