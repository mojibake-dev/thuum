// apply-on-demand.js v2.4 (thuum, the re-analyst 2026-11-03; v2.3 added REMAP, v2.4 the LIVE premise variant and its witnesses: this header's last two paragraphs; v2.4's review added the second kill dispatcher, Actor::KillImmediate 37735, beside KillImpl; docs/research/adr065-serialize-on-demand-2026-11-03.md, "(c)" and "The pose after
// the apply's 3D reload"): the (c) probe. On one seat, for a DEAD actor FORM, at its kDead mark (TRIGGER mark: AddChange's inner 35576 with
// FLAG, deferred into PlayerCharacter::Update's REPLACEMENT as serialize-on-demand-actor.js v2.2 does; TRIGGER now: the first Update
// return after the replace, the form by TESForm::LookupByID), on Main.threadID: MODE roundtrip (default) serializes the copy's own record with the actor
// script's recipe (36035, 36037, slot 0x0D, 35715, slot 0x0E, 36081); MODE apply takes the owner's record from RECORD (hex) with FLAGS: the
// operator hands a kDead record (this script decodes no lifeState) and the sender's writtenFlags as FLAGS. The record is written into the
// form's changes-map entry as transplant-inject.js writes one (RECORD's bytes on the engine heap by 68115; 35509 the Value {flags, mid,
// record}), then 35568 runs (the apply's wrapper: decode, initial data, LoadGame, the pending array), then, with PARK, 11977 parks the
// record's Havok block in an ExtraSavedHavokData, then 35567 (the finish pass: InitLoadGame, the flush, FinishLoadGame), with a snapshot row
// before, after the apply and after the finish, then the reload watched: a "rebuilt" snapshot when the root returns (or 20 s), a "settled"
// one 5 s later, and a result row naming the pose's source. THE ONE ENGINE-STATE WRITE is 35509 (plus 11977 under PARK): the entry's record
// pointer is then the engine's (its decode 36080 frees it); if 35568 returns 0 the record is still ours and the entry is put back and the
// record freed. What run 20261103-164416 taught, built in here: a mid-game apply of a LEVELED actor's record releases its 3D inside LoadGame
// (ExtraDataList::LoadGame's kLeveledCreature case 0x2D calls Set3D(nullptr) through 12358 whenever kLoading is clear, then rebuilds the base
// NPC from its templates), the engine reloads the model on a task thread (13355), and the new 3D's init (19742, 11979, 36014) applies
// whatever ExtraSavedHavokData the reference holds: Set3D's own store of the live pose at the release (36016 then 11977) or the flush's park
// of the record's block (36031 parks when Get3D2 is null); a non-leveled actor keeps its 3D and the flush feeds 19535 directly (the
// re-apply through 36014 after the root returns is a later option, not built here). v1's witnesses were gated on the probe's window and so
// said nothing about the 19535 that ran 14 ms later on the task thread; v2 counts every 19535 call for FORM on any thread (the body count it
// saw, the 19538 and SetPosition and SetRotation calls inside it, its caller: 36014's path is the 3D init, 36031's the flush), prints the
// 12358 and 19730 return addresses when FORM's 3D goes or comes, prints the verdict logs (35519) whenever they carry FORM or the known
// strings, reads the ExtraSavedHavokData (12329 GetByType 0x3C: the sub-buffer's version, varint length and the block's FNV-1a) and the kind-2
// queue's occupancy (the map at mgr + 0x270, 36027's layout) at every snapshot and around 35568 and 35567, and hashes the copy's live pose
// (36016) before anything, so the pose's source after the reload is decided by hashes: the record's block, the live pose, or neither. PARK
// (default false): after 35568 returns 1 and before 35567, the record's block is wrapped in the queue's own sub-buffer shape (u8 version
// 0x4E, the varint length in 36052's encoding, the 19534 block) on the engine heap and handed to 11977(ref + 0x70, &sub), which takes the
// pointer and replaces an existing extra (the "already saved havok data" log prints), so the rebuilt 3D's init consumes the record's pose;
// refused when the record carries no block. Premises (any failure refuses): the actor script's, plus kInitingForms clear, the entry present
// with a null record, the 3D present, the actor dead (lifeState 2), the pending count 0 (FORCE overrides), slot 0x0F 37650 or Character's
// 40267; for apply also: RECORD parses, type 1 (ACHR), the engine's version, lengths consistent, raw unless FORCE, SUM when given, the
// record's Havok body count equal to the live count from 19533 unless FORCE (both print). Every engine call is wrapped, but a fault inside is
// only CONVERTED to a JS exception (a lock taken inside stays held): the premises are the real safety. Every id, offset, slot and layout is
// the static read's (the sections' id tables, CommonLib, `just addr`): HYPOTHESIS until a run reads as expected (rule 2). LAB_PARAMS: FORM
// (required), MODE, TRIGGER, FLAG (0x400), RECORD, FLAGS, SUM, FORCE (false), SUPPRESS (false: 19378 around 35567), PARK (false), RUNS (1), REMAP ('', v2.3: the REMAP paragraph), LIVE (false, v2.4: the LIVE paragraph).
// Ready prints Process.id. wait: 15 after the frida step (lab-api's fixed 5 s sleep plus the attach, not the size) and read the ready t first.
// THE LISTENER GUARD (frida-gum main c73c1bbf, 2026-11-02, gum/guminterceptor.c, read 2026-11-03): _gum_function_context_begin_invocation
// sets a thread-local guard key (gum_interceptor_guard_key, :2254) before the on_enter listeners run and clears it at :2364, and
// _gum_function_context_end_invocation sets it at :2415 around the on_leave listeners and clears it at :2480; any hooked function entered
// while the key is set bypasses its listeners (:2249-2252). The key is cleared BEFORE a replacement's body runs (:2364 precedes the jump
// to replacement_function at :2371-2380), and inside a replacement only the replaced function itself bypasses (the calling_replacement
// check at :2262-2271: the peek :2262, the condition :2263-2267, the bypass :2268-2271; the documented chain-to-original). v2 ran the apply inside PlayerCharacter::Update's onLeave, so every hook on the
// apply's own thread was blind to its callees: in 174905 the 12358 release row inside 35568, the 11977 park inside 35567, the flush entry
// and the forms log on the main thread were all missing as artifacts of the guard, not "other paths". v2.2 REPLACES 40447 (Interceptor.replace
// with a NativeCallback that first calls the original through a NativeFunction at the same address, `void Update(float a_delta)`,
// Actor.h:371) and runs the trigger, the apply and the reload poll inside the replacement after the original returned; the AddChange
// listener only ARMS (no 250 ms fallback: it ran inside a listener and would be blind); if the replacement never fires, a 1 s watchdog
// refuses the armed run after 2 s with a 'no Update return' row (TRIGGER now then ends the run) and the liveness row says so. Expected now:
// the set3D release row with its caller inside 35568, the savedHavokSet row for the flush's park with ours: false inside 35567 (ours: true
// for PARK's own 11977 call), the flush and formsLog rows on the main thread inWindow: true.
// The replacement is reverted (Interceptor.revert, then flush) from the JS thread
// (setTimeout 0, outside any engine frame of ours); a revert while Update is in flight is deferred by frida-gum until the context's
// trampoline_usage_counter is 0 (:1832). The lab's injector is frida-inject 17.19.0 (lab/frida/README.md:5, lab/labapi/labapi/config.py:159):
// Interceptor.replace, revert and flush, NativeCallback and Process.getCurrentThreadId are all on frida.re/docs/javascript-api (read
// 2026-11-03); frida's docs say the replacement is kept alive until revert (gumquickinterceptor.c:1095 JS_DupValue, :1137 freed on revert); the
// reference here outlives the revert for the liveness row.
// ONE REPLACEMENT PER GAME PROCESS (guminterceptor.c:822-823, :853-856 GUM_REPLACE_ALREADY_REPLACED; gumjs throws "already replaced this
// function", gumquickinterceptor.c:1116-1117; a revert removes only the calling script's entry, :1151-1162) and lab-api eternalizes the script
// (frida-inject -e, config.py:159-166, runner.py:2354): a second instance on the seat fails to replace; the symptom is attachErrors 'already
// replaced this function', updateReplaced false and every arm refused 2 s later; relaunch the seat or wait for the earlier instance's cleanup
// row (runs spent, no poll; now trigger refused; result emitted; no Update return; ttl; TTL seconds, default 600, is the replacement's life without a result). The lab appends to the same
// <script>.log across instances (runner.py:2354-2360), so align on the new ready row's t and pid; hookBytes.playerUpdate reads e9 when an
// earlier attach already patched the prologue (attach and replace share one function context, guminterceptor.c:816-817; fine).
// REMAP (v2.3, the receiver's half of a cross-seat record's id re-encode; the note's D6, "The receiver's half of the re-encode (the REMAP step)").
// A change form names forms as 3-byte numeric ids whose top two bits are the kind (BGSNumericIDIndex::SetNumericID, 35928 at 0x620240: a
// load-index-00 form type 1 with its 22-bit id, a created 0xFF form type 2, everything else type 0 with an index from the form-id map at
// mgr + 0x298 through 35554, inserting on a miss; the note's "Evidence (the form-id map)"), and a type-0 index is the SENDER's seat's and
// session's (192013 against 192345: 0xFE014817 is index 10582 in the bandit's session and 10583 in Sven's), so on the receiving seat the same
// bytes mean another form or nothing. REMAP is a string of rows `offset:formId:index[:formType]` separated by commas (Sven's kDead record of
// 192345: `2097:0x2B005373:10586`, the spell's bytes 00 29 5a at record offset 2097, index 0x295a = 10586 in that session, the AI process
// block's one type-0 id). offset is the RECORD offset: the census's `offset` is the BGSSaveFormBuffer position at the write (a body offset),
// so add the header's 6 bytes at size code 1 (parseRecord's bodyStart, 2 + 2 * n); formId is the sender's full runtime id (both lab seats
// run one load order, the note's D6 paragraph 3); index is the sender's; formType (optional) is the form's type byte to compare on this
// seat. Parsed at the start for shape only (a malformed or empty row, a non-integer field, a formId whose top byte is 00 or FF since 35928
// encodes those as kind 1 or 2 on every seat, an index above 22 bits, a formType above a byte, two rows within 3 bytes of each other) and
// refused at the premises by the check row named `remap`, whose value names the row; REMAP given in roundtrip mode refuses there too (the
// copy's own record is never remapped). The step sits in the apply recipe after RECORD parses and the SUM over the sender's UNPATCHED bytes
// is verified, and before 35509, in two halves. 'REMAP check', right after the parse, for EVERY row before any engine-state change: (a) the
// three bytes at offset must lie in the body and decode to kind 0 with exactly the row's index (a kind 1, 2 or 3 decode is "nothing to
// remap": a wrong row or a wrong offset; a wrong offset never patches; a deflated record refuses, its offsets would name compressed bytes);
// (b) the form through the engine's own TESForm::LookupByID (14617 at 0x1e01a0; CommonLib's is the inline TESForm.h:210-220; the decompile
// takes the all-forms read lock itself, the note's D6 census paragraph, HYPOTHESIS): null refuses (the encoder would mint an index for a
// form this seat lacks and the reader would resolve it to null later), the returned form's id must be the row's, its formType byte
// (TESForm.h:356, +0x1A) is recorded and compared when the row carries one. 'REMAP encode 35928', after the body-count and PARK checks and
// right before 'write 35509', per row: (c) the engine's own encoder on an 8-byte scratch, nf.setNumericId(scratch, formId)
// (BGSNumericIDIndex.h:25-30 declares SetNumericID(FormID) on the 3-byte struct: this in rcx, the id in edx; the disassembly stores the
// three bytes big-endian through rcx, the actor script's census read them the same way), the bytes read back (a kind other than 0 refuses:
// the static read of 35928 would be wrong for that id); (d) written at offset into the record's bytes, one `remap` row per id {offset,
// formId, from, to, fromIndex, toKind, toIndex, formType, thread}; (e) after all rows the heap copy (68115's, allocated after the REMAP check) is
// rewritten whole and the apply row gains remapRows, sumSender (the sender's SUM, equal to recordFnv1a) and fnvPatched (the bytes 35509
// hands over, hashed from the heap copy; a mismatch with the patched bytes refuses). Fail-safe order: every check of the run (RECORD, REMAP
// check, body count, PARK) precedes the first engine-state change; a REMAP refusal is a `refused` row with reason `remap: ...` and the step,
// then the apply row's error names the step; nothing is patched, the entry is untouched, our heap record is freed. The encode's one
// engine-state change is 35928's insert into the receiver's form-id map on a miss (35554 at mgr + 0x298), what the engine's save path does
// for every referenced form: HYPOTHESIS, safe on the main thread outside a save (the next real save writes the grown table, as a save would
// have); an encode refusal on a later row (a fault, a non-zero kind, the heap hash) leaves the earlier rows' inserts and nothing else. Each
// engine call of the step is wrapped: a fault converted by Frida lands in the refusal row with the step's name (a lock taken inside stays
// held, the header's caveat). Reading rule: one `remap` row per patched id, from against to (from equal to to means the receiver's index
// coincides with the sender's, possible when both seats met the form in the same order); a refusal names the row; a `remap` row followed by
// an apply row whose error names 'REMAP encode 35928' was never written: the heap rewrite follows the last row (a later row's refusal leaves
// the copy unpatched and freed, nothing half-patched reaches the engine); fnvPatched differs from sumSender whenever any row changed bytes;
// with no rows the apply row carries remapRows 0 and no sumSender or fnvPatched; the ready row's
// hooks print the two callees' first bytes (35928 expected 40 53 48 83, 14617 40 57 48 83) and remap {rows, error, mode}.
// Two 35519 format strings joined VERDICTS for the cross-seat apply (the formsLog hook otherwise prints only VERDICTS' strings and lines
// whose varargs carry FORM's id; the coordinator's decompiles of 2026-11-03, HYPOTHESIS by rule 2): AIProcess::LoadGame's active-effect
// loader (34077 at 0x5ad8b0, `just addr`) drops an effect whose spell id does not resolve on this seat and logs "Could not load active effect with
// effect index %i, and archetype ID %i" (no form id among its arguments, so the FORM match never catches it): the REMAP's miss signal, a
// type-0 spell the receiver could not resolve, dropped, aligned, benign; expected zero when the remap is right. ActiveEffect::LoadGame
// logs "Unknown reference effect type: %i" for a corrupt hit-effect type: a record desync, expected zero always.
// LIVE (v2.4, default false): the premise variant for two reads that share this run shape. Read 2 of docs/verbs/change-form.md's Dynamic
// plan: a DEAD record applied onto a LIVE loaded copy (the watcher's late-load case of F3 and F4): does 35568's ActorState and Havok block lay
// the body with no kill event and no fall? F8 (playtest 43: "embry is standing in his chair", then Sven sat where Embry was sitting): a SITTING
// host's record (its ActorState's sitSleepState and the process block's occupiedFurniture) applied onto a STANDING live puppet copy: does the
// engine seat the copy by its own path? With LIVE true, MODE apply and TRIGGER now, the premise "actor dead (lifeState 2)" is waived (its check
// row stays, named waived, its value the live state); every other premise stands (the form loaded with its 3D, the entry present with a null
// record, kInitingForms clear, no save in progress, RECORD parsed, REMAP's checks). Why it is safe to try: the round trips' apply (164416,
// 174905) and the cross-seat applies never faulted through 35568 and 35567 on a dead copy, and a live copy differs only in the state the record
// overwrites (ActorState whole through 38988, the process block through 39430 after 37502 moves the level; the note's Q2): the unread case,
// HYPOTHESIS, so LIVE is opt-in and the check rows print what the copy was. Witnesses added to every snapshot (before, after apply, after,
// rebuilt, settled, and two timed ones, 'finish+1s' and 'finish+5s', emitted by the poll inside Update's replacement once 35567 returned):
// sitSleepState beside lifeState, both from ActorState's actorState1 (ActorState.h:203, +8 of the ActorState at Actor +0xC0: sitSleepState bits
// 14-17, :112; lifeState bits 21-24, :114), the names from SIT_SLEEP_STATE (:65-79: kNormal 0, kWantToSit 1, kWaitingForSitAnim 2, kIsSitting 3,
// which kRidingMount shares, kWantToStand 4, kWantToSleep 5, kWaitingForSleepAnim 6, kIsSleeping 7, kWantToWake 8); the process's
// occupiedFurniture: currentProcess (Actor.h:651, the runtime block, +0xF8 at 1.6.1170 as the repo's memory has it), middleHigh (AIProcess.h:196,
// +0x08), occupiedFurniture (MiddleHighProcessData.h:172, +0x208, an ObjectRefHandle), resolved lock-free the way the reference handle lookup
// 12331 at 0x1795f0 resolves one in its decompile (CommonLib's LookupReferenceByHandle is its twin 12332 at 0x179710, BSPointerHandle.h:220, the same math): index = handle & 0xFFFFF into the handle entries (400622 at 0x20fc600, 16 bytes each: the
// bits u32 at +0, the NiPointer<BSHandleRefObject> at +8, BSPointerHandleManager.h:23-25), valid when bit 26 of the entry's bits is set, its
// bits 20-25 equal the handle's, and the object's word at +0x28 shifted right by 11 equals the index; the stored pointer is the BSHandleRefObject
// at TESObjectREFR +0x20 (TESObjectREFR.h:110), so the reference is 0x20 below it; no refcount is touched (12331's NiPointer out-parameter
// would need the atomic release) and the raw handle prints beside the resolved id (BSPointerHandle.h:12's template defaults <21, 5> disagree
// with the engine's 20 index bits and 6 age bits here; BSPointerHandleManager.h:17-19's Entry comments agree with the engine; HYPOTHESIS);
// a KillImpl count: Actor::KillImpl 37896 (0x6972d0, VTABLE_Actor slot 0x10E, Actor.h:468: attacker, damage, sendEvent, ragdollInstant) hooked
// ungated like 19535, one `killImpl` row per call for FORM with the attacker's id, sendEvent (r9b) and ragdollInstant (the fifth argument, from
// the stack through Frida's args[4], HYPOTHESIS for the ABI read), and the count in every snapshot and the result row; the review added the second
// dispatcher, Actor::KillImmediate 37735 (0x68e640, Actor.h:610, Actor.cpp:943: the dead=1 TESDeathEvent and SetLifeState(2); KillImpl dispatches
// dead=0 and sets kDying; its callers include MovetoLow, MovetoMiddleLow, MoveToMiddleHigh gated on kDying, Disable and KillImpl), hooked the same
// way with `killImmediate` rows and counts (expected hookBytes 0x68e640:40555657); the havok rows as before;
// the position at +1 s and +5 s after the finish in the two timed snapshots beside rebuilt and settled; the two 35519 strings kept. Not added:
// the animation events the copy's graph receives (the note's id tables name no sendAnimationEvent entry, only the per-graph callbacks 32710 and
// 32956 of the Havok read's tail; the fork's hook is Skyrim Platform's), so that witness is skipped and said so here. The result row gains
// `seated`: lifeState, sitSleepState and occupiedFurniture before (the 'before' snapshot) and after (the 'settled' snapshot) with the position of
// each, the killImpl count, and a verdict: "no change", or "<before> then <after>", the after reading "kIsSitting at the furniture <id>" when
// the copy sat. Reading rules. Read 2 (a dead record on a live copy): seated.after.lifeState kDead with killImpl 0 and killImmediate 0 (no kill event: both dispatchers silent), havokRead rows applying the
// record's block (bodies equal to its count) and 'finish+1s' and 'finish+5s' positions within a unit of the record's and of each other means
// the body was laid by the state write with no kill event and no fall; a killImpl or killImmediate row with inWindow true is the apply's own
// synchronous kill through 35568 or 35567; with inWindow false, a later engine path (read its caller); a z drop across the timed snapshots means a fall. F8 (a sitting record on a standing copy): verdict "kAlive/kNormal then
// kIsSitting at the furniture <id>" with occupiedFurniture.after resolving to the chair means the engine seated the copy by its own path;
// occupiedFurniture.after set with sitSleepState still kNormal means the handle landed but no sit played (the furniture path wants its package
// or the animation event, HYPOTHESIS); kWantToSit or kWaitingForSitAnim at settled means the sit was still in progress; "no change" means the
// record's ActorState and process block did not reach the copy's state (read the 35519 rows).
const PARAMS = (typeof LAB_PARAMS === 'object' && LAB_PARAMS) ? LAB_PARAMS : {};
const FORM = Number(PARAMS.FORM);
const MODE = PARAMS.MODE === 'apply' ? 'apply' : 'roundtrip';
const TRIGGER = PARAMS.TRIGGER === 'now' ? 'now' : 'mark';
const FLAG = PARAMS.FLAG === undefined ? 0x400 : Number(PARAMS.FLAG); // Actor.h:234 kLifeState
const RECORD = typeof PARAMS.RECORD === 'string' ? PARAMS.RECORD : '';
const FLAGS = PARAMS.FLAGS === undefined ? -1 : Number(PARAMS.FLAGS);
const SUM = PARAMS.SUM === undefined ? -1 : Number(PARAMS.SUM);
const flagOf = function (v) { return v === true || v === 'true'; };
const FORCE = flagOf(PARAMS.FORCE), SUPPRESS = flagOf(PARAMS.SUPPRESS), PARK = flagOf(PARAMS.PARK);
const RUNS = PARAMS.RUNS === undefined ? 1 : Number(PARAMS.RUNS);
const TTL_S = PARAMS.TTL === undefined ? 600 : Number(PARAMS.TTL); // seconds the replacement may live without a result; an eternalized script never unloads, so the revert is ours or never
const REMAP = PARAMS.REMAP === undefined || PARAMS.REMAP === null ? '' : String(PARAMS.REMAP); // v2.3: rows offset:formId:index[:formType], comma-separated (the header's REMAP paragraph); parsed below, after the helpers
const LIVE = flagOf(PARAMS.LIVE); // v2.4: the live-copy premise variant (the header's LIVE paragraph)
const LIVE_WAIVE = LIVE && MODE === 'apply' && TRIGGER === 'now'; // the one waiver: the dead premise, only for an apply at TRIGGER now
function emit(obj) {
  obj.t = Date.now();
  send(obj);
  console.log(JSON.stringify(obj));
}
// Offsets: the sections' id tables and `just addr` (Address Library 1.6.1170 only), 2026-11-03; (c) = called, (h) = hooked
const OFFSETS = {
  '1.6.1170.0': {
    innerAdd: 0x604320, // 35576 AddChange's inner (h: the trigger)
    mapRead: 0x600930, // 35503 the changes map's read (c)
    mapWrite: 0x600e20, // 35509 the changes map's write (c: THE engine-state write)
    bufCtor: 0x626a90, // 36035 BGSSaveFormBuffer ctor (c)
    bufInit: 0x626ce0, // 36037 the header (c)
    bufDestroy: 0x626e20, // 36044 frees the buffer's data (c)
    initialData: 0x60e1c0, // 35715 the initial data (c)
    pack: 0x6283e0, // 36081 buffer to record (c)
    saveVersion: 0x610980, // 35740 returns 0x4e (c)
    heap: 0x11bba0, // 11141 MemoryManager::GetSingleton (c)
    allocate: 0xcc40c0, // 68115 MemoryManager::Allocate (c)
    deallocate: 0xcc4510, // 68117 MemoryManager::Deallocate (c, our own allocations only)
    saveLoadGame: 0x317aba8, // 403330 BGSSaveLoadGame** (BGSSaveLoadGame.h:71)
    saveLoadManager: 0x317abf0, // 403340 BGSSaveLoadManager** (Offsets.h:54)
    main: 0x31872c0, // 403449 Main** (Offsets.h:383)
    dataHandler: 0x20f6320, // 400269 TESDataHandler** (Offsets.h:504)
    player: 0x31874f8, // 403521 NiPointer<PlayerCharacter> (Offsets.h:451)
    lookupByID: 0x1e01a0, // 14617 TESForm::LookupByID (c, TRIGGER now; REMAP check: the receiver's form for each row's id) (the note's id table; CommonLib's is an inline, TESForm.h:210-220; first bytes 40 57 48 83 in the actor script's ready rows, 183149 and 192013)
    setNumericId: 0x620240, // 35928 BGSNumericIDIndex::SetNumericID (rcx the 3-byte struct, edx the form id; first bytes 40 53 48 83: push rbx, sub rsp,0x20) (c under REMAP: the receiver's own encoding of each row's form id on a scratch; BGSNumericIDIndex.h:25-30)
    refrCheckSave: 0x2da4f0, // 19527 TESObjectREFR::CheckSaveGame = slot 0x0D of Actor and Character
    actorSave: 0x686710, // 37649 Actor::SaveGame, slot 0x0E of VTABLE_Actor
    characterSave: 0x727d40, // 40266 Character::SaveGame, slot 0x0E of VTABLE_Character (every NPC)
    actorLoad: 0x686de0, // 37650 Actor::LoadGame, slot 0x0F of VTABLE_Actor
    characterLoad: 0x727d50, // 40267 Character::LoadGame, slot 0x0F of VTABLE_Character
    playerUpdate: 0x732660, // 40447 PlayerCharacter::Update, slot 0xAD of 208040 (Actor.h:371) (REPLACED: the per-frame trigger, the apply and the reload poll run inside the replacement, the original called first)
    applyWrap: 0x603700, // 35568 the apply's wrapper (mgr, form) -> uint8 (c)
    finishPass: 0x603140, // 35567 the finish pass (mgr, fromFullLoad) (c)
    suppress: 0x2cfe60, // 19378 the suppress bit (mgr, clear): 0 sets, 1 clears (c, SUPPRESS)
    formsLog: 0x601770, // 35519 the "FORMS:" log (fmt, ...) (h)
    havokRead: 0x2db450, // 19535 the Havok block reader (ref, buf) (h)
    havokBody: 0x2dbfc0, // 19538 its per-body reader (h)
    havokPrePass: 0x2db1b0, // 19533 the pre-pass (ref, state): the live body count (c, h: the count 19535 sees)
    flushEntry: 0x6264e0, // 36031 the flush's per-entry handler (kind*, form, subBuffer) (h)
    savedHavokSet: 0x16aa00, // 11977 the ExtraSavedHavokData setter (extraList, subBuffer**) (h, c under PARK)
    getByType: 0x179250, // 12329 ExtraDataList::GetByType (extraList, type) -> BSExtraData* (c)
    livePose: 0x6259a0, // 36016 the live pose into a sub-buffer (holder*, form) (c: the copy's own pose hash)
    set3DWrapper: 0x17a6e0, // 12358 the lock-wrapped slot 0x6C call (ref, node, queue3DTasks) (h: who releases the 3D)
    setData3D: 0x2e5380, // 19730 the data3D setter (ref, node) (h: when the 3D goes and comes)
    rigidBodyVtable: 0x17aeb58, // 190275 VTABLE_bhkRigidBody[0]: slots 0x35 SetPosition, 0x36 SetRotation (bhkRigidBody.h:43-44) (h)
    savedHavokVtable: 0x1770e70, // 186773 VTABLE_ExtraSavedHavokData[0] (read only: the lock-free chain match in hooks)
    killImpl: 0x6972d0, // 37896 Actor::KillImpl (this, attacker, damage, sendEvent, ragdollInstant), VTABLE_Actor slot 0x10E (Actor.h:468) (h, v2.4: ungated, the kill witness for a LIVE copy)
    killImmediate: 0x68e640, // 37735 Actor::KillImmediate (this), Actor.h:610, Actor.cpp:943 RELOCATION_ID(36723, 37735) (h, v2.4: the dead=1 TESDeathEvent dispatcher, the second kill path)
    handleEntries: 0x20fc600, // 400622 BSPointerHandleManager::GetHandleEntries::entries (BSPointerHandleManager.h:30; 16-byte entries: bits +0, NiPointer<BSHandleRefObject> +8) (read only, v2.4: occupiedFurniture's handle resolved lock-free as 12331 does)
  },
};
// TESForm.h:353-356; BGSSaveLoadGame.h:61-63 (kLoading 2, kSaving 4, kInitingForms 8), :93 (the BSTArray at +0x318: data, capacity +8, size +0x10),
// :94, :96; BGSSaveLoadManager.h:114; TESDataHandler.h:76-88 (HYPOTHESIS); Main.h:78, :87; BGSSaveGameBuffer.h:30-32, BGSSaveFormBuffer.h:23-25;
// the queued sub-buffers at mgr + 0x208: three BSTScatterTables of 0x30 (BSTHashMap.h:575-581: _capacity +0x0C, _free +0x10, _sentinel +0x18; the heap
// allocator's _entries at +0x28, :647-648; an entry is key, value, next: 0x18, next nonzero marking an occupied slot as 36027 walks them), indexed by
// kind * 0x30 (36023, 36026), so kind 2's table is at mgr + 0x268 (HYPOTHESIS for the address only). ExtraDataList on 1.6.629 and later: the virtual
// dtor at +0, data +8, presence +0x10 (ExtraDataList.h:41-45, the second column), the lock at +0x18 (:202); PresenceBitfield bits[0x18] (:28);
// BSExtraData::next +8 (BSExtraData.h:32)
const FORM_FLAGS = 0x10, FORM_ID = 0x14, IN_GAME_FLAGS = 0x18, FORM_TYPE = 0x1a;
const CHANGES_MAP = 0x330, MANAGER_FLAGS = 0x340, PENDING_COUNT = 0x328, DRY_RUN = 0x120, CLEARING_DATA = 0xda5, RESET_GAME = 0x11, MAIN_THREAD = 0x28;
const KIND2_TABLE = 0x268, HT_CAPACITY = 0x0c, HT_FREE = 0x10, HT_ENTRIES = 0x28, HT_ENTRY = 0x18;
const XL_DATA = 0x08, XL_PRESENCE = 0x10, XD_NEXT = 0x08;
const BUF = { data: 0x08, pos: 0x14, header: 0x18, flags: 0x1b, form: 0x28, size: 0x30 };
const LBUF = { data: 0x08, size: 0x20, pos: 0x24 }; // BGSLoadGameBuffer.h:24-29: buffer +0x08, size +0x20 (unk20), bufferPosition +0x24
const SLOT_CHECK = 0x0d, SLOT_SAVE = 0x0e, SLOT_LOAD = 0x0f, SLOT_SET_POS = 0x35, SLOT_SET_ROT = 0x36; // TESForm.h:136-138; bhkRigidBody.h:43-44
// Actor.h:712 (+8): currentProcess :651; ActorState at 0xC0 (:737), actorState1 +8 (ActorState.h:203), lifeState bits 21-24 (:114); AIProcess.h:197,
// :225; HighProcessData.h:357; TESObjectREFR.h:78-79 (data at +0x40: angle +0x48, location +0x54), :497 loadedData, :101 data3D, :498 extraList;
// NiAVObject.h:158 world + NiTransform.h:26 translate; NiObjectNET.h:53 name; NiNode.h:76 children; NiTArray.h:116-119 (data +8, u16 size +0x14);
// ExtraSavedHavokData.h:17 havokBuffer +0x10; ExtraDataTypes.h:234 kSavedHavokData 0x3C
const ACHR = 0x3e, PLAYER_ID = 0x14, A_PROCESS = 0xf8, A_STATE1 = 0xc8, P_HIGH = 0x10, P_LEVEL = 0x137, H_FAR = 0x468;
const R_ANGLE = 0x48, R_LOCATION = 0x54, R_LOADED = 0x68, L_DATA3D = 0x68, R_EXTRA = 0x70, N_WORLD_T = 0xa0, N_NAME = 0x10, N_CHILDREN = 0x110, TA_DATA = 0x08, TA_SIZE = 0x14;
const X_SAVED_HAVOK = 0x3c, X_BUFFER = 0x10;
const K_HAVOK = 1 << 2; // TESObjectREFR.h:142 kHavokMoved; 35708's kinds: created 5, kCellChanged or kPromoted (0x02000008) 6, kMoved or kHavokMoved (6) 4
const LIFE = ['kAlive', 'kDying', 'kDead', 'kUnconcious', 'kReanimate', 'kRecycle', 'kRestrained', 'kEssentialDown', 'kBleedout']; // ActorState.h:9-17
const SIT = ['kNormal', 'kWantToSit', 'kWaitingForSitAnim', 'kIsSitting', 'kWantToStand', 'kWantToSleep', 'kWaitingForSleepAnim', 'kIsSleeping', 'kWantToWake']; // v2.4: SIT_SLEEP_STATE, ActorState.h:65-79 (kRidingMount shares 3); sitSleepState is actorState1 bits 14-17 (:112)
const P_MIDDLE_HIGH = 0x08, MH_FURNITURE = 0x208, HANDLE_REF_BASE = 0x20, HANDLE_INDEX_MASK = 0xfffff, HANDLE_AGE_MASK = 0x3f00000, HANDLE_INUSE_BIT = 1 << 26, REF_HANDLE_WORD = 0x28; // v2.4: AIProcess.h:196, MiddleHighProcessData.h:172, TESObjectREFR.h:110, 12331's decompile (20 index bits, age bits 20-25, in-use bit 26, the object's word at +0x28 >> 11 is the index)
const HEAD = 'NPC Head [Head]';
const VERDICTS = /Havok data|ragdoll save\/load|SetSavedHavokData|queued havok|queued char controller|Load Error|FORMS:|Could not load active effect|Unknown reference effect type/; // the last two: v2.3, the header's REMAP paragraph
const CAP = 65536, REFUSED_ROWS = 8, REBUILD_WAIT_MS = 20000, SETTLE_MS = 5000;

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
const u8 = function (p, o) { try { return p.add(o).readU8(); } catch (e) { return -1; } };
const u16 = function (p, o) { try { return p.add(o).readU16(); } catch (e) { return -1; } };
const u32 = function (p, o) { try { return p.add(o).readU32(); } catch (e) { return -1; } };
const f32 = function (p, o) { try { return +p.add(o).readFloat().toFixed(3); } catch (e) { return null; } };
const ptrAt = function (p, o) { try { return p.add(o).readPointer(); } catch (e) { return NULL; } };
const bytesHex = function (a) { let s = ''; for (let i = 0; i < a.length; i++) s += ('0' + a[i].toString(16)).slice(-2); return s; };
const toHex = function (p, n) { return bytesHex(new Uint8Array(p.readByteArray(n))); };
const fnv1a = function (bytes) { let h = 0x811c9dc5; for (const b of bytes) { h ^= b; h = Math.imul(h, 0x01000193) >>> 0; } return h >>> 0; };
const vi = function (b, o) { const w = b[o] & 3; return w === 0 ? [b[o] >> 2, 1] : (w === 1 ? [((b[o + 1] << 8) | b[o]) >> 2, 2] : [((b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 2), 4]); }; // 36052: value << 2 | width
const viBytes = function (v) { return v < 0x40 ? [v << 2] : (v < 0x4000 ? [((v << 2) | 1) & 0xff, (v >> 6) & 0xff] : [((v << 2) | 2) & 0xff, (v >> 6) & 0xff, (v >> 14) & 0xff, (v >> 22) & 0xff]); }; // 35529's encoding, little-endian
// v2.3 REMAP rows, shape only (the bytes and the forms are checked in the recipe): offset the RECORD offset, formId the sender's full id, index the
// sender's 22-bit index, formType optional; a formId whose top byte is 00 or FF is refused here since 35928 encodes it as kind 1 or 2 on every seat
const parseRemap = function (text) {
  const rows = [], problems = [];
  const parts = text.split(',').map(function (s) { return s.trim(); });
  if (parts.length === 1 && parts[0] === '') return { rows: rows, error: null };
  const num = function (s) { return /^(0x[0-9a-fA-F]+|[0-9]+)$/.test(s) ? Number(s) : NaN; };
  parts.forEach(function (p, i) {
    const where = 'row ' + (i + 1) + ' "' + p + '"';
    if (p === '') { problems.push(where + ' is empty'); return; }
    const f = p.split(':').map(function (s) { return s.trim(); });
    if (f.length !== 3 && f.length !== 4) { problems.push(where + ' has ' + f.length + ' fields, offset:formId:index[:formType] expected'); return; }
    const offset = num(f[0]), formId = num(f[1]), index = num(f[2]), formType = f.length === 4 ? num(f[3]) : null;
    if (!Number.isInteger(offset) || offset < 0) problems.push(where + ': offset is not a non-negative integer');
    if (!Number.isInteger(formId) || formId <= 0 || formId > 0xffffffff) problems.push(where + ': formId is not a form id');
    else if ((formId >>> 24) === 0 || (formId >>> 24) === 0xff) problems.push(where + ': form ' + hex(formId) + ' encodes as kind ' + ((formId >>> 24) === 0 ? 1 : 2) + ' on every seat (35928): a type-0 row cannot name it');
    if (!Number.isInteger(index) || index < 0 || index > 0x3fffff) problems.push(where + ': index is not a 22-bit integer');
    if (formType !== null && (!Number.isInteger(formType) || formType < 0 || formType > 0xff)) problems.push(where + ': formType is not a byte');
    rows.push({ row: i + 1, text: p, offset: offset, formId: formId, index: index, formType: formType });
  });
  for (let a = 0; a < rows.length; a++) for (let b = a + 1; b < rows.length; b++) if (Math.abs(rows[a].offset - rows[b].offset) < 3) problems.push('rows ' + rows[a].row + ' and ' + rows[b].row + ' overlap at offset ' + rows[a].offset);
  return { rows: rows, error: problems.length === 0 ? null : problems.join('; ') };
};
const REMAP_PARSED = parseRemap(REMAP), REMAP_ROWS = REMAP_PARSED.rows, REMAP_ERROR = REMAP_PARSED.error;
// a record (the pack 36081): type index and size code, version, length1, length2 (the inflated size, 0 when raw), the data inline
const recordHeader = function (rec) {
  const b0 = rec.readU8();
  const s = b0 >> 6;
  const n = s === 0 ? 1 : (s === 1 ? 2 : 4);
  const len = function (o) { return n === 1 ? rec.add(o).readU8() : (n === 2 ? rec.add(o).readU16() : rec.add(o).readU32()); };
  const length1 = len(2);
  return { type: b0 & 0x3f, sizeCode: s, version: rec.add(1).readU8(), length1: length1, length2: len(2 + n), total: 2 + 2 * n + length1 };
};
// the initial data's Havok block ((c) Q2, HYPOTHESIS): 35708's kind from the flags, the fixed part 27/31/34, then a varint length and the block:
// u8 flags (bit 4: pitch and roll follow), varint body count, ...; the block's byte count is the framing the queue reader 36023 uses
const havokOf = function (b, flags, id) {
  const kind = id >= 0xff000000 ? 5 : ((flags & 0x02000008) !== 0 ? 6 : ((flags & 6) !== 0 ? 4 : 0));
  const fixed = kind === 4 ? 27 : (kind === 5 ? 31 : (kind === 6 ? 34 : 0));
  const r = { kind: kind, fixed: fixed, present: (flags & K_HAVOK) !== 0 && kind !== 0, initialLen: fixed };
  if (!r.present) return r;
  if (b.length < fixed + 2) { r.error = 'body too short for the block'; return r; }
  const len = vi(b, fixed), start = fixed + len[1];
  r.blockLen = len[0]; r.blockStart = start; r.initialLen = start + len[0];
  if (len[0] < 2 || r.initialLen > b.length) { r.error = 'block length ' + len[0] + ' does not fit the body'; return r; }
  r.blockFlags = hex(b[start]);
  const cnt = vi(b, start + 1);
  r.count = cnt[0];
  if ((b[start] & 0x10) !== 0) {
    if (start + 1 + cnt[1] + 8 > b.length) { r.error = 'pitch and roll run past the body'; return r; }
    const dv = new DataView(b.buffer, b.byteOffset + start + 1 + cnt[1], 8); r.pitchRoll = [+dv.getFloat32(0, true).toFixed(3), +dv.getFloat32(4, true).toFixed(3)];
  }
  r.blockHash = hex(fnv1a(b.subarray(start, start + len[0])));
  return r;
};
// a queued sub-buffer as 36023 builds and 36019 reads it (HYPOTHESIS for 36020's, Set3D's store, which 36019 also reads): u8 version, varint length, the block
const subHeader = function (p) {
  if (p.isNull()) return null;
  const head = new Uint8Array(p.readByteArray(5));
  const len = vi(head, 1);
  const r = { version: head[0], blockLen: len[0], width: len[1] };
  if (len[0] > 0 && len[0] <= CAP) { const block = new Uint8Array(p.add(1 + len[1]).readByteArray(len[0])); r.blockHash = hex(fnv1a(block)); r.blockFlags = hex(block[0]); r.count = vi(block, 1)[0]; }
  return r;
};

const exe = Process.getModuleByName('SkyrimSE.exe');
const version = fileVersion(exe.path);
const off = OFFSETS[version];
if (off === undefined || !(FORM > 0) || (MODE === 'apply' && (!/^([0-9a-fA-F]{2})+$/.test(RECORD) || !(FLAGS >= 0)))) {
  emit({ event: 'ready', error: off === undefined ? 'no offsets for this runtime' : (!(FORM > 0) ? 'FORM is required' : 'apply needs RECORD (hex) and FLAGS'), version: version, pid: Process.id });
} else {
  const at = function (name) { return exe.base.add(off[name]); };
  const rva = function (p) { return hex(p.sub(exe.base).toUInt32()); };
  const nf = {
    mapRead: new NativeFunction(at('mapRead'), 'bool', ['pointer', 'uint32', 'pointer']),
    mapWrite: new NativeFunction(at('mapWrite'), 'void', ['pointer', 'uint32', 'pointer']),
    bufCtor: new NativeFunction(at('bufCtor'), 'pointer', ['pointer']),
    bufInit: new NativeFunction(at('bufInit'), 'void', ['pointer', 'uint32', 'uint32', 'uint32', 'uint8']),
    bufDestroy: new NativeFunction(at('bufDestroy'), 'void', ['pointer']),
    initialData: new NativeFunction(at('initialData'), 'uint32', ['pointer', 'pointer', 'uint32']),
    pack: new NativeFunction(at('pack'), 'void', ['pointer', 'pointer']),
    saveVersion: new NativeFunction(at('saveVersion'), 'uint8', []),
    heapOf: new NativeFunction(at('heap'), 'pointer', []),
    allocate: new NativeFunction(at('allocate'), 'pointer', ['pointer', 'uint64', 'int32', 'bool']),
    deallocate: new NativeFunction(at('deallocate'), 'void', ['pointer', 'pointer', 'bool']),
    lookupByID: new NativeFunction(at('lookupByID'), 'pointer', ['uint32']),
    setNumericId: new NativeFunction(at('setNumericId'), 'void', ['pointer', 'uint32']), // v2.3 REMAP: SetNumericID(FormID) on the 3-byte struct (this in rcx, the id in edx)
    applyWrap: new NativeFunction(at('applyWrap'), 'uint8', ['pointer', 'pointer']),
    finishPass: new NativeFunction(at('finishPass'), 'void', ['pointer', 'uint8']),
    suppress: new NativeFunction(at('suppress'), 'uint8', ['pointer', 'uint8']),
    prePass: new NativeFunction(at('havokPrePass'), 'void', ['pointer', 'pointer']),
    getByType: new NativeFunction(at('getByType'), 'pointer', ['pointer', 'uint32']),
    savedHavokSet: new NativeFunction(at('savedHavokSet'), 'void', ['pointer', 'pointer']),
    livePose: new NativeFunction(at('livePose'), 'void', ['pointer', 'pointer']),
  };
  const slotFn = function (p, ret) { return new NativeFunction(p, ret, ['pointer', 'pointer']); };
  const singletons = function () {
    return { game: ptrAt(at('saveLoadGame'), 0), manager: ptrAt(at('saveLoadManager'), 0), main: ptrAt(at('main'), 0), handler: ptrAt(at('dataHandler'), 0), player: ptrAt(at('player'), 0) };
  };
  const value = Memory.alloc(16); // the entry's Value {flags, mid, record}
  const readEntry = function (map) {
    value.writeU32(0); value.add(4).writeU32(0); value.add(8).writePointer(NULL);
    const found = nf.mapRead(map, FORM, value);
    return { found: found, flags: value.readU32(), mid: value.add(4).readU32(), record: value.add(8).readPointer() };
  };
  const writeEntry = function (map, flags, mid, rec) { value.writeU32(flags); value.add(4).writeU32(mid); value.add(8).writePointer(rec); nf.mapWrite(map, FORM, value); return readEntry(map); };
  const state = Memory.alloc(0x30); // 19533's state: flags u8, two counts at +4 and +8, the form, the node, the root's collision object, the buffer
  const liveBodies = function (form) { for (let o = 0; o < 0x30; o += 8) state.add(o).writeU64(0); nf.prePass(form, state); return { flags: hex(u8(state, 0)), a: u32(state, 4), b: u32(state, 8), count: u32(state, 4) + u32(state, 8), node: String(ptrAt(state, 0x18)) }; };
  const rootOf = function (form) { const ld = ptrAt(form, R_LOADED); return ld.isNull() ? NULL : ptrAt(ld, L_DATA3D); };
  const refOfHandle = function (h) { // v2.4: lock-free, the way the reference handle lookup 12331 at 0x1795f0 resolves a handle in its decompile (CommonLib's LookupReferenceByHandle is its twin 12332 at 0x179710, the same math); no refcount touched (HYPOTHESIS for the layout, the header's LIVE paragraph)
    if (!(h > 0)) return { handle: hex(h >>> 0), resolved: false, why: 'null handle' };
    const idx = h & HANDLE_INDEX_MASK, e = at('handleEntries').add(idx * 16), bits = u32(e, 0), p = ptrAt(e, 8);
    const r = { handle: hex(h >>> 0), index: idx, entryBits: hex(bits >>> 0), resolved: false };
    if (p.isNull()) { r.why = 'no object in the entry'; return r; }
    if ((bits & HANDLE_INUSE_BIT) === 0 || (bits & HANDLE_AGE_MASK) !== (h & HANDLE_AGE_MASK)) { r.why = 'the entry is free or its age differs: a stale handle'; return r; }
    const ref = p.sub(HANDLE_REF_BASE), word = u32(ref, REF_HANDLE_WORD);
    if (word < 0 || (word >>> 11) !== idx) { r.why = 'the object does not carry the index'; return r; }
    r.resolved = true; r.ref = String(ref); r.formId = hex(u32(ref, FORM_ID)); r.formType = hex(u8(ref, FORM_TYPE));
    return r;
  };
  const seatOf = function (form) { // v2.4: the sit witnesses: sitSleepState from actorState1, occupiedFurniture from the middle-high process
    const st1 = u32(form, A_STATE1), sit = st1 < 0 ? -1 : (st1 >>> 14) & 0xf, proc = ptrAt(form, A_PROCESS), mh = proc.isNull() ? NULL : ptrAt(proc, P_MIDDLE_HIGH);
    let furniture;
    try { furniture = mh.isNull() ? { handle: proc.isNull() ? 'no process' : 'no middle-high process', resolved: false } : refOfHandle(u32(mh, MH_FURNITURE)); } catch (e) { furniture = { resolved: false, error: String(e) }; }
    return { sitSleepState: sit, sitSleepStateName: SIT[sit] || '?', occupiedFurniture: furniture };
  };
  const vec3 = function (p, o) { return [f32(p, o), f32(p, o + 4), f32(p, o + 8)]; };
  const nameOf = function (node) { try { const s = ptrAt(node, N_NAME); return s.isNull() ? '' : s.readUtf8String(64); } catch (e) { return ''; } };
  const findNode = function (node, name, depth, budget) { // a guarded walk of the NiNode children (HYPOTHESIS: a leaf's +0x110 reads past it, bounded by the size and depth checks)
    if (node.isNull() || depth > 24 || budget.n <= 0) return NULL;
    budget.n -= 1;
    if (nameOf(node) === name) return node;
    const arr = node.add(N_CHILDREN), data = ptrAt(arr, TA_DATA), n = u16(arr, TA_SIZE);
    if (data.isNull() || n <= 0 || n > 512) return NULL;
    for (let i = 0; i < n; i++) { const c = ptrAt(data, i * 8); if (c.isNull()) continue; const r = findNode(c, name, depth + 1, budget); if (!r.isNull()) return r; }
    return NULL;
  };
  const savedExtra = function (form) { // GetByType (12329) on the reference's extraList: main-thread snapshots only (it takes the list's lock)
    const x = nf.getByType(form.add(R_EXTRA), X_SAVED_HAVOK);
    if (x.isNull()) return { present: false };
    const sub = ptrAt(x, X_BUFFER);
    return { present: true, extra: String(x), sub: String(sub), header: sub.isNull() ? null : subHeader(sub) };
  };
  const safeExtra = function (f) { try { return savedExtra(f); } catch (e) { return { error: String(e) }; } };
  const extraNoLock = function (form) { // lock-free, for hooks on any thread: the presence bit, then the chain node whose vtable is ExtraSavedHavokData's
    const list = form.add(R_EXTRA), presence = ptrAt(list, XL_PRESENCE);
    const r = { presenceBit: presence.isNull() ? -1 : (u8(presence, X_SAVED_HAVOK >> 3) >> (X_SAVED_HAVOK & 7)) & 1, present: false };
    let node = ptrAt(list, XL_DATA);
    for (let i = 0; i < 256 && !node.isNull(); i++) {
      if (ptrAt(node, 0).equals(at('savedHavokVtable'))) { const sub = ptrAt(node, X_BUFFER); r.present = true; r.extra = String(node); r.sub = String(sub); r.header = sub.isNull() ? null : subHeader(sub); break; }
      node = ptrAt(node, XD_NEXT);
    }
    return r;
  };
  const kind2 = function (form) { // kind 2's table: occupancy and whether FORM's block is queued, the key read both as a pointer and as an id
    const s = singletons();
    if (s.game.isNull()) return null;
    const t = s.game.add(KIND2_TABLE), cap = u32(t, HT_CAPACITY), free = u32(t, HT_FREE), entries = ptrAt(t, HT_ENTRIES);
    const r = { capacity: cap, free: free, occupancy: entries.isNull() || cap < 0 || free < 0 ? 0 : cap - free, hasForm: false };
    if (!entries.isNull() && cap > 0 && cap <= 4096) {
      for (let i = 0; i < cap; i++) {
        const e = entries.add(i * HT_ENTRY);
        if (ptrAt(e, 0x10).isNull()) continue;
        if (ptrAt(e, 0).equals(form)) r.keyShape = 'form pointer'; else if (u32(e, 0) === FORM) r.keyShape = 'form id'; else continue;
        r.hasForm = true; r.sub = String(ptrAt(e, 8)); break;
      }
    }
    return r;
  };
  const safeKind2 = function (f) { try { return kind2(f); } catch (e) { return { error: String(e) }; } };
  const holder = Memory.alloc(8); // a BGSLoadGameSubBuffer* slot for 36016 (holder in rcx, form in rdx; 36020 writes the pointer through it) and 11977
  const livePoseHash = function (form) { // the copy's own pose through the engine's own serializer (36016: 36035, 36037 flags 4, 19534, 36020), then freed
    holder.writePointer(NULL);
    emit({ event: 'step', step: 'livePose 36016' });
    nf.livePose(holder, form);
    const sub = holder.readPointer();
    if (sub.isNull()) return { note: '36016 produced no sub-buffer' };
    const h = subHeader(sub);
    try { nf.deallocate(nf.heapOf(), sub, 0); } catch (e) { h.freeError = String(e); }
    return h;
  };
  const snapshot = function (form, label, withLive, more) {
    const proc = ptrAt(form, A_PROCESS), high = proc.isNull() ? NULL : ptrAt(proc, P_HIGH), root = rootOf(form), st1 = u32(form, A_STATE1);
    const s = singletons(), map = s.game.isNull() ? NULL : ptrAt(s.game, CHANGES_MAP), e = map.isNull() ? { found: false, flags: 0, record: NULL } : readEntry(map);
    const life = st1 < 0 ? -1 : (st1 >>> 21) & 0xf, seat = seatOf(form);
    const row = { event: 'snapshot', label: label, form: hex(FORM), lifeState: life, lifeStateName: LIFE[life] || '?', sitSleepState: seat.sitSleepState, sitSleepStateName: seat.sitSleepStateName, occupiedFurniture: seat.occupiedFurniture, killImplCalls: counts.killImplForm, killImmediateCalls: counts.killImmediateForm, level: proc.isNull() ? 'none' : u8(proc, P_LEVEL),
      farGeometry: high.isNull() ? 'no high process' : u8(high, H_FAR), position: vec3(form, R_LOCATION), angle: vec3(form, R_ANGLE), root: String(root),
      rootWorld: root.isNull() ? null : vec3(root, N_WORLD_T), entry: { found: e.found, flags: hex(e.flags), record: String(e.record) }, pending: s.game.isNull() ? -1 : u32(s.game, PENDING_COUNT) };
    try { row.extra = savedExtra(form); } catch (err) { row.extraError = String(err); }
    try { row.kind2 = kind2(form); } catch (err) { row.kind2Error = String(err); }
    if (!root.isNull()) {
      try { const head = findNode(root, HEAD, 0, { n: 4096 }); row.head = head.isNull() ? 'not found' : { node: String(head), worldZ: f32(head, N_WORLD_T + 8) }; } catch (err) { row.headError = String(err); }
      try { row.liveBodies = liveBodies(form); } catch (err) { row.liveBodiesError = String(err); }
      if (withLive) { try { row.livePose = livePoseHash(form); } catch (err) { row.livePoseError = String(err); } }
    }
    if (more !== undefined) Object.assign(row, more);
    emit(row);
    return row;
  };

  // the premises (the actor script's, plus (c)'s); any failure refuses
  const premises = function (form, threadId) {
    const s = singletons();
    const checks = [];
    const add = function (name, val, ok) { checks.push({ name: name, value: val, ok: ok }); };
    add('BGSSaveLoadGame', String(s.game), !s.game.isNull());
    add('BGSSaveLoadManager', String(s.manager), !s.manager.isNull());
    const mflags = s.game.isNull() ? -1 : u32(s.game, MANAGER_FLAGS);
    add('kLoading, kSaving, kInitingForms clear', hex(mflags), mflags >= 0 && (mflags & 0xe) === 0);
    const dry = s.manager.isNull() ? -1 : u8(s.manager, DRY_RUN);
    add('dry-run byte zero (+0x120)', dry, dry === 0);
    const clearing = s.handler.isNull() ? -1 : u8(s.handler, CLEARING_DATA);
    add('clearingData zero (+0xDA5, HYPOTHESIS)', clearing, clearing === 0);
    const reset = s.main.isNull() ? -1 : u8(s.main, RESET_GAME);
    add('resetGame zero (+0x11)', reset, reset === 0);
    const mainThread = s.main.isNull() ? -1 : u32(s.main, MAIN_THREAD);
    add('on Main.threadID', mainThread + ' vs ' + threadId, mainThread === threadId);
    const fflags = u32(form, FORM_FLAGS);
    add('not kTemporary (bit 14)', hex(fflags), fflags >= 0 && ((fflags >>> 14) & 1) === 0);
    const igf = u32(form, IN_GAME_FLAGS) & 0xffff;
    add('inGameFormFlags bits 0, 7 clear', hex(igf), igf >= 0 && (igf & 0x81) === 0);
    const type = u8(form, FORM_TYPE);
    add('form type ACHR 0x3E', hex(type), type === ACHR);
    add('not the player (id 0x14, the singleton)', hex(FORM) + ' vs ' + String(s.player), FORM !== PLAYER_ID && !s.player.isNull() && !s.player.equals(form));
    const high = ptrAt(ptrAt(form, A_PROCESS), P_HIGH), fg = type === ACHR ? (high.isNull() ? 'no high process' : u8(high, H_FAR)) : -1;
    add('far skin absent (a set farGeometry would make 0x0E strip it and mark kInventory)', String(fg), fg === 0 || fg === 'no high process');
    const vt = ptrAt(form, 0);
    const slot = function (i) { return vt.isNull() ? NULL : ptrAt(vt, i * 8); };
    const slotC = slot(SLOT_CHECK), slotS = slot(SLOT_SAVE), slotL = slot(SLOT_LOAD);
    add('slot 0x0D is 19527', rva(slotC), slotC.equals(at('refrCheckSave')));
    add('slot 0x0E is Actor::SaveGame 37649 or Character\'s 40266', rva(slotS), slotS.equals(at('actorSave')) || slotS.equals(at('characterSave')));
    add('slot 0x0F is Actor::LoadGame 37650 or Character\'s 40267', rva(slotL), slotL.equals(at('actorLoad')) || slotL.equals(at('characterLoad')));
    const root = rootOf(form);
    add('3D present (loadedData +0x68, data3D +0x68)', String(root), !root.isNull());
    const st1 = u32(form, A_STATE1), life = st1 < 0 ? -1 : (st1 >>> 21) & 0xf;
    add(LIVE_WAIVE ? 'actor dead (lifeState 2): waived under LIVE' : 'actor dead (lifeState 2)', life + ' ' + (LIFE[life] || '?'), LIVE_WAIVE || life === 2); // v2.4: the one waiver (the header's LIVE paragraph); the value as v2.3 printed it
    const sit = st1 < 0 ? -1 : (st1 >>> 14) & 0xf;
    add('sitSleepState (v2.4 witness)', sit + ' ' + (SIT[sit] || '?'), true);
    const pending = s.game.isNull() ? -1 : u32(s.game, PENDING_COUNT);
    add('pending array empty (+0x328; FORCE overrides)', pending, pending === 0 || (FORCE && pending >= 0));
    const map = s.game.isNull() ? NULL : ptrAt(s.game, CHANGES_MAP);
    let entry = { found: false, flags: 0, mid: 0, record: NULL };
    if (!map.isNull()) entry = readEntry(map);
    add('entry present', entry.found ? hex(entry.flags) : 'none', entry.found);
    add('entry record null (an engine record is never touched)', String(entry.record), entry.found && entry.record.isNull());
    add('remap', REMAP_ERROR !== null ? REMAP_ERROR : (REMAP_ROWS.length !== 0 && MODE !== 'apply' ? 'REMAP given in roundtrip mode: the copy\'s own record is never remapped' : REMAP_ROWS.length + ' rows'), REMAP_ERROR === null && (REMAP_ROWS.length === 0 || MODE === 'apply')); // v2.3: the rows' shape; their bytes and forms are checked in the recipe
    return { ok: checks.every(function (c) { return c.ok; }), checks: checks, entry: entry, type: type, slotC: slotC, slotS: slotS, map: map, root: root };
  };
  // apply mode: RECORD checked before any engine call (transplant-inject's review's finding 2)
  const parseRecord = function () {
    const bytes = new Uint8Array(RECORD.length / 2);
    for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(RECORD.substr(2 * i, 2), 16);
    const b0 = bytes[0], s = b0 >> 6, n = s === 0 ? 1 : (s === 1 ? 2 : 4);
    const le = function (o) { let v = 0; for (let k = n - 1; k >= 0; k--) v = v * 256 + bytes[o + k]; return v; };
    const r = { bytes: bytes, type: b0 & 0x3f, sizeCode: s, version: bytes[1], length1: le(2), length2: le(2 + n), deflated: le(2 + n) !== 0, bodyStart: 2 + 2 * n, total: bytes.length, fnv1a: hex(fnv1a(bytes)), problems: [] };
    const want = nf.saveVersion();
    if (r.type !== 1) r.problems.push('type ' + r.type + ' is not ACHR (1)');
    if (s > 2) r.problems.push('size code ' + s);
    if (r.version !== want) r.problems.push('version ' + r.version + ', the engine writes ' + want);
    if (r.bodyStart + r.length1 !== bytes.length) r.problems.push('length1 ' + r.length1 + ' disagrees with ' + bytes.length + ' bytes');
    if (r.length2 !== 0 && !FORCE) r.problems.push('deflated (length2 ' + r.length2 + '): the body count is unreadable, refused without FORCE');
    if (SUM >= 0 && fnv1a(bytes) !== SUM) r.problems.push('checksum ' + r.fnv1a + ', SUM says ' + hex(SUM));
    return r;
  };

  // the witnesses: per 19535 call on any thread (keyed by thread); the probe's window only tags rows
  const watch = { active: false, tid: -1 };
  const reads = {}; // threadId -> the 19535 call in flight: bodies, setPos, setRot, live
  const result = { applied: false, recordBlockHash: null, liveHash: null, lastRead: null, parkHash: null, lastStored: null, lastStoredCaller: null, extraAtFinish: null, finishedAt: null, before: null, settled: null, killImplRows: [] }; // v2.4: finishedAt, before, settled, killImplRows
  let parking = false; // true around our own 11977 call, so its hook row is tagged ours
  // v2.3 REMAP. A refusal: a `refused` row with the reason and the step, then the throw the recipe's catch records in the apply row's error
  const remapRefuse = function (step, reason, threadId) { emit({ event: 'refused', reason: reason, step: step, form: hex(FORM), thread: threadId }); throw new Error(reason); };
  const decode3 = function (b) { return { kind: b[0] >> 6, value: ((b[0] & 0x3f) << 16) | (b[1] << 8) | b[2] }; }; // the 24 bits big-endian: the top two the kind, the rest the index or the 22-bit id
  // (a) and (b) for EVERY row before any engine-state change: the pure decodes first, then 14617 per row (read-only; the decompile takes the
  // all-forms read lock itself, the note's D6 census paragraph, HYPOTHESIS). Returns the rows with their sender bytes and the receiver's form
  const remapCheck = function (r, q) {
    const step = 'REMAP check', out = [];
    const refuse = function (reason) { remapRefuse(step, reason, q.runThread); };
    if (REMAP_ERROR !== null) refuse('remap: ' + REMAP_ERROR);
    if (REMAP_ROWS.length === 0) return { rows: out };
    if (r.deflated) refuse('remap: the record is deflated (length2 ' + r.length2 + '): the offsets would name compressed bytes');
    for (const w of REMAP_ROWS) {
      if (w.offset < r.bodyStart || w.offset + 3 > r.total) refuse('remap: offset ' + w.offset + ' is outside the record body (' + r.bodyStart + '..' + (r.total - 3) + '); the census\'s offset is a body offset, add the header\'s ' + r.bodyStart);
      const b = r.bytes.subarray(w.offset, w.offset + 3), d = decode3(b);
      if (d.kind !== 0) refuse('remap: bytes at ' + w.offset + ' decode to kind ' + d.kind + ' index ' + d.value + ', row says ' + w.index + ': nothing to remap (' + (d.kind === 1 ? 'a load-index-00 form, portable' : (d.kind === 2 ? 'a created form' : 'kind 3 is aliasing or a wrong offset')) + ')');
      if (d.value !== w.index) refuse('remap: bytes at ' + w.offset + ' decode to kind 0 index ' + d.value + ', row says ' + w.index);
      out.push({ row: w, from: bytesHex(b), fromIndex: d.value, form: NULL, formType: -1 });
    }
    for (const e of out) {
      let f = NULL;
      try { f = nf.lookupByID(e.row.formId); } catch (err) { refuse('remap: 14617 faulted for form ' + hex(e.row.formId) + ': ' + err); }
      if (f.isNull()) refuse('remap: form ' + hex(e.row.formId) + ' is not on this seat');
      const id = u32(f, FORM_ID), type = u8(f, FORM_TYPE);
      if (id !== e.row.formId) refuse('remap: 14617 returned a form with id ' + hex(id) + ' for ' + hex(e.row.formId));
      if (e.row.formType !== null && type !== e.row.formType) refuse('remap: form ' + hex(e.row.formId) + ' is type ' + hex(type) + ' on this seat, row says ' + hex(e.row.formType));
      e.form = f; e.formType = type;
    }
    return { rows: out };
  };
  // (c), (d), (e): the engine's own encoder per row on a scratch, the three bytes read back and written into the record, the heap copy rewritten
  // whole and hashed back; 35928's map insert on a miss (35554 at mgr + 0x298) is the save path's own effect, HYPOTHESIS safe here; the last step before 35509
  const scratch = Memory.alloc(8); // the 3-byte BGSNumericIDIndex 35928 writes through rcx
  const remapEncode = function (r, remap, row, rec, q) {
    const step = 'REMAP encode 35928';
    const refuse = function (reason) { remapRefuse(step, reason, q.runThread); };
    emit({ event: 'step', step: step, rows: remap.rows.length, sumSender: r.fnv1a });
    for (const e of remap.rows) {
      scratch.writeU64(0);
      try { nf.setNumericId(scratch, e.row.formId); } catch (err) { refuse('remap: 35928 faulted for form ' + hex(e.row.formId) + ': ' + err); }
      const b = new Uint8Array(scratch.readByteArray(3)), d = decode3(b);
      if (d.kind !== 0) refuse('remap: 35928 encoded form ' + hex(e.row.formId) + ' as kind ' + d.kind + ' (' + bytesHex(b) + '), not a type-0 index: the static read of 35928 is wrong for this id');
      r.bytes.set(b, e.row.offset);
      emit({ event: 'remap', offset: e.row.offset, formId: hex(e.row.formId), from: e.from, to: bytesHex(b), fromIndex: e.fromIndex, toKind: d.kind, toIndex: d.value, formType: hex(e.formType), thread: q.runThread });
    }
    rec.writeByteArray(r.bytes.buffer); // the heap copy carries the patched bytes 35509 hands over
    row.remapRows = remap.rows.length; row.sumSender = r.fnv1a; row.fnvPatched = hex(fnv1a(r.bytes));
    const heap = hex(fnv1a(new Uint8Array(rec.readByteArray(r.bytes.length))));
    if (heap !== row.fnvPatched) refuse('remap: the heap copy hashes ' + heap + ', the patched bytes ' + row.fnvPatched);
  };
  const run = function (form, p, q) {
    const row = { event: 'apply', mode: MODE, park: PARK, live: LIVE, liveWaiver: LIVE_WAIVE, form: hex(FORM), thread: q.runThread, markThread: q.markThread, deferredMs: q.deferredMs, deferredVia: q.via, entryFlags: hex(p.entry.flags) };
    const before = snapshot(form, 'before', true);
    result.before = before; // v2.4: the seated verdict's before
    result.liveHash = before.livePose && before.livePose.blockHash ? before.livePose.blockHash : null;
    const s = singletons(), map = p.map;
    let buf = null, rec = NULL, flagsOut = 0, body = null, step = 'start', suppressSet = false, parkSub = NULL, parked = false, r = null, remap = null; // r and remap: apply mode's parsed RECORD and its checked REMAP rows (v2.3)
    watch.active = true; watch.tid = q.runThread;
    try {
      if (before.liveBodiesError !== undefined || before.livePoseError !== undefined) throw new Error('an engine read faulted in the before snapshot (' + (before.liveBodiesError || before.livePoseError) + '): refused before any write');
      if (MODE === 'roundtrip') { // the actor script's recipe, the record kept for the entry
        step = 'ctor 36035';
        const raw = Memory.alloc(BUF.size);
        for (let o = 0; o < BUF.size; o += 8) raw.add(o).writeU64(0);
        nf.bufCtor(raw);
        buf = raw;
        step = 'header 36037';
        nf.bufInit(buf, FORM, p.entry.flags, p.type, nf.saveVersion());
        buf.add(BUF.form).writePointer(form);
        step = 'slot 0x0D';
        row.checkSaveGame = slotFn(p.slotC, 'bool')(form, buf);
        if (!row.checkSaveGame) throw new Error('0x0D returned 0: nothing to save');
        flagsOut = u32(buf, BUF.flags) >>> 0;
        row.writtenFlags = hex(flagsOut); row.dropped = hex((p.entry.flags & ~flagsOut) >>> 0);
        step = 'initial data 35715';
        row.kind = nf.initialData(buf, form, flagsOut); row.initialLen = u32(buf, BUF.pos);
        step = 'slot 0x0E';
        slotFn(p.slotS, 'void')(form, buf);
        step = 'plain body';
        const n = u32(buf, BUF.pos);
        body = new Uint8Array(ptrAt(buf, BUF.data).readByteArray(n));
        row.plain = { bytes: n, fnv1a: hex(fnv1a(body)) };
        step = 'pack 36081';
        const out = Memory.alloc(16);
        out.writeU64(0); out.add(8).writeU64(0);
        nf.pack(out, buf);
        rec = out.readPointer();
        if (rec.isNull()) throw new Error('the pack gave no record');
        const h = recordHeader(rec);
        row.record = h; row.deflated = h.length2 !== 0; row.recordFnv1a = hex(fnv1a(new Uint8Array(rec.readByteArray(Math.min(h.total, CAP)))));
      } else {
        step = 'RECORD';
        r = parseRecord();
        row.record = { type: r.type, sizeCode: r.sizeCode, version: r.version, length1: r.length1, length2: r.length2, total: r.total }; row.recordFnv1a = r.fnv1a; row.deflated = r.length2 !== 0;
        if (r.problems.length !== 0) throw new Error('RECORD refused: ' + r.problems.join('; '));
        step = 'REMAP check'; // v2.3: (a) and (b) for every row, the SUM above verified over the unpatched bytes; a refusal throws with nothing patched and no engine state changed
        remap = remapCheck(r, q); row.remapRows = remap.rows.length;
        flagsOut = FLAGS >>> 0; row.writtenFlags = hex(flagsOut);
        body = r.deflated ? null : r.bytes.subarray(r.bodyStart);
        step = 'allocate 68115';
        rec = nf.allocate(nf.heapOf(), r.bytes.length, 0, 0);
        if (rec.isNull()) throw new Error('the engine heap gave no memory');
        rec.writeByteArray(r.bytes.buffer);
      }
      step = 'body count';
      row.havok = body === null ? { note: 'deflated: block unread' } : havokOf(body, flagsOut, FORM);
      if (MODE === 'roundtrip' && row.havok.initialLen !== undefined) row.framingCheck = row.havok.initialLen === row.initialLen ? 'the block framing matches 35715\'s length' : 'MISMATCH: framing ' + row.havok.initialLen + ' vs initial ' + row.initialLen;
      if (row.havok.error !== undefined) throw new Error('Havok block: ' + row.havok.error);
      if (PARK && row.havok.present !== true) throw new Error('PARK refused: the record carries no Havok block');
      result.recordBlockHash = row.havok.blockHash || null;
      row.liveBodies = before.liveBodies === undefined ? null : before.liveBodies.count;
      if (row.havok.count !== undefined && row.liveBodies !== null && row.havok.count !== row.liveBodies && !FORCE) throw new Error('body count ' + row.havok.count + ' in the record, ' + row.liveBodies + ' live: refused without FORCE');
      if (remap !== null && row.havok.present === true) for (const e of remap.rows) if (e.row.offset + 3 > r.bodyStart + row.havok.blockStart && e.row.offset < r.bodyStart + row.havok.blockStart + row.havok.blockLen) throw new Error('remap: offset ' + e.row.offset + ' lies inside the Havok block (' + (r.bodyStart + row.havok.blockStart) + '..' + (r.bodyStart + row.havok.blockStart + row.havok.blockLen - 1) + '): no form id is written there');
      if (remap !== null && remap.rows.length !== 0) { step = 'REMAP encode 35928'; remapEncode(r, remap, row, rec, q); } // v2.3: the last step before 35509, after every check of the run; the heap record then carries the patched bytes
      const preKind2 = safeKind2(form), preExtra = safeExtra(form); // read before the write: nothing but the emit sits between 35509 and 35568
      step = 'write 35509'; // THE engine-state write; the record pointer is the engine's from here unless 35568 refuses
      const w = writeEntry(map, flagsOut, p.entry.mid, rec);
      row.written = { flags: hex(w.flags), record: String(w.record) };
      if (!w.record.equals(rec)) throw new Error('the entry does not hold our record after the write');
      step = 'apply 35568';
      const ours = rec; rec = NULL; // from here the engine owns it (its decode frees it); never freed by us after the call
      emit({ event: 'step', step: 'apply 35568', record: String(ours), header: row.record, writtenFlags: row.writtenFlags, remapRows: row.remapRows, fnvPatched: row.fnvPatched, pending: u32(s.game, PENDING_COUNT), kind2: preKind2, extra: preExtra }); // the last row a death leaves
      row.applyReturn = nf.applyWrap(s.game, form);
      emit({ event: 'step', step: '35568 returned', applyReturn: row.applyReturn });
      const a = readEntry(map);
      if (row.applyReturn === 0) {
        if (a.record.equals(ours)) { writeEntry(map, p.entry.flags, p.entry.mid, NULL); nf.deallocate(nf.heapOf(), ours, 0); row.restored = 'the entry put back with its old flags and a null record, our record freed'; }
        throw new Error('35568 returned 0 (no entry, no record, a type mismatch or kLoading): read the formsLog rows');
      }
      if (a.record.equals(ours)) { writeEntry(map, a.flags, a.mid, NULL); row.dangling = 'the entry still held our record after a 1: nulled, not freed'; }
      row.afterApply = { flags: hex(a.flags), record: String(a.record), pending: u32(s.game, PENDING_COUNT), kind2: safeKind2(form), extra: safeExtra(form) };
      result.applied = true;
      snapshot(form, 'after apply', false);
      if (PARK) { // the record's block into the queue's own sub-buffer shape, handed to 11977 (it takes the pointer; an existing extra is replaced with the log)
        step = 'park 11977';
        if (!rootOf(form).isNull()) row.park = { skipped: 'the root is present: no rebuild to feed' };
        else {
          const blk = body.subarray(row.havok.blockStart, row.havok.blockStart + row.havok.blockLen);
          const lenBytes = viBytes(blk.length), total = 1 + lenBytes.length + blk.length;
          parkSub = nf.allocate(nf.heapOf(), total, 0, 0);
          if (parkSub.isNull()) throw new Error('the engine heap gave no memory for the park');
          const bytes = new Uint8Array(total); bytes[0] = nf.saveVersion(); bytes.set(lenBytes, 1); bytes.set(blk, 1 + lenBytes.length);
          parkSub.writeByteArray(bytes.buffer);
          row.park = { before: safeExtra(form), sub: String(parkSub), bytes: total, blockHash: row.havok.blockHash };
          holder.writePointer(parkSub);
          emit({ event: 'step', step: 'park 11977', sub: String(parkSub), bytes: total, blockHash: row.havok.blockHash });
          parking = true;
          try { nf.savedHavokSet(form.add(R_EXTRA), holder); parked = true; } finally { parking = false; }
          row.park.after = safeExtra(form);
          result.parkHash = row.havok.blockHash;
        }
      }
      step = 'finish 35567';
      if (SUPPRESS) { row.suppressWasClear = nf.suppress(s.game, 0); suppressSet = true; }
      emit({ event: 'step', step: 'finish 35567', suppress: SUPPRESS, pending: u32(s.game, PENDING_COUNT), kind2: safeKind2(form), extra: safeExtra(form) });
      nf.finishPass(s.game, 0);
      if (suppressSet && row.suppressWasClear === 1) { nf.suppress(s.game, 1); suppressSet = false; }
      const fe = readEntry(map);
      row.afterFinish = { flags: hex(fe.flags), record: String(fe.record), pending: u32(s.game, PENDING_COUNT), kind2: safeKind2(form), extra: safeExtra(form) };
      result.extraAtFinish = row.afterFinish.extra;
      result.finishedAt = Date.now(); // v2.4: the clock of the timed snapshots
      row.result = 'ok, the reload watched: the result row follows the settled snapshot';
    } catch (e) { row.error = 'at ' + step + ': ' + e; }
    if (suppressSet && row.suppressWasClear === 1) { try { nf.suppress(s.game, 1); } catch (e) { row.suppressRestoreError = String(e); } } // a throw inside 35567 must not leave the bit set
    watch.active = false;
    try { if (!rec.isNull()) { nf.deallocate(nf.heapOf(), rec, 0); row.recordFreed = 'refused before the write: our record freed'; } } catch (e) { row.freeError = String(e); }
    try { if (!parkSub.isNull() && !parked) { nf.deallocate(nf.heapOf(), parkSub, 0); row.parkFreed = 'the park sub-buffer freed: 11977 never ran'; } } catch (e) { row.parkFreeError = String(e); }
    try { if (buf !== null) { nf.bufDestroy(buf); row.bufferDestroyed = true; } } catch (e) { row.destroyError = String(e); }
    emit(row);
    snapshot(form, 'after', false);
    if (result.applied) poll = { form: form, started: Date.now(), rootSeenAt: 0, rootSeenAtReturn: 0, rebuiltAt: 0, done: false, timed1: false, timed5: false };
  };
  // the reload watched on PlayerCharacter::Update's returns: "rebuilt" one return after the root first appears (or when 19535 ran, or at 20 s),
  // "settled" 5 s later, then the result row
  let poll = null;
  const sourceOf = function () { // the block 19535 read first, then the extra after the finish, then the last 11977 store with its caller
    const r = result.lastRead;
    if (r === null) return { source: 'no 19535 ran for the form after the apply: the pose is the load path\'s own' };
    const cands = [];
    if (r.saved && r.saved.blockHash !== undefined) cands.push({ from: 'the block 19535 read', hash: r.saved.blockHash });
    if (result.extraAtFinish && result.extraAtFinish.header && result.extraAtFinish.header.blockHash !== undefined) cands.push({ from: 'the extra after the finish', hash: result.extraAtFinish.header.blockHash });
    if (result.lastStored && result.lastStored.blockHash !== undefined) cands.push({ from: 'the last 11977 store (caller ' + result.lastStoredCaller + ')', hash: result.lastStored.blockHash });
    if (cands.length === 0) return { source: '19535 ran but no block bytes were readable from the buffer, the extra or a store' };
    const c = cands[0];
    const name = c.hash === result.recordBlockHash ? 'the record\'s block' + (result.parkHash !== null ? ' (parked by PARK)' : '') : (c.hash === result.liveHash ? 'the copy\'s own live pose: the engine\'s store at the release, not the record' : 'a block matching neither the record nor the live pose');
    return { source: name, hash: c.hash, judgedBy: c.from, candidates: cands };
  };
  const seatedVerdict = function () { // v2.4: the sit witnesses before (the 'before' snapshot) against after (the 'settled' snapshot)
    const b = result.before, a = result.settled;
    if (b === null || a === null) return { verdict: 'no before or settled snapshot' };
    const pick = function (s) { const f = s.occupiedFurniture; return { lifeState: s.lifeState, lifeStateName: s.lifeStateName, sitSleepState: s.sitSleepState, sitSleepStateName: s.sitSleepStateName, occupiedFurniture: f && f.resolved ? f.formId : (f && /^0x/.test(String(f.handle)) && f.handle !== '0x0' ? f.handle : null), furnitureResolved: !!(f && f.resolved), position: s.position }; };
    const before = pick(b), after = pick(a);
    const same = before.lifeState === after.lifeState && before.sitSleepState === after.sitSleepState && before.occupiedFurniture === after.occupiedFurniture;
    const word = function (x) { return x.lifeStateName + '/' + x.sitSleepStateName + (x.occupiedFurniture && x.occupiedFurniture !== '0x0' ? ' at ' + x.occupiedFurniture : ''); };
    return { before: before, after: after, killImpl: counts.killImplForm, killImmediate: counts.killImmediateForm, verdict: same ? 'no change' : word(before) + ' then ' + (after.sitSleepState === 3 ? 'kIsSitting at the furniture ' + (after.occupiedFurniture || 'none') : word(after)) };
  };
  const pollStep = function () {
    if (poll === null || poll.done) return;
    const now = Date.now();
    if (result.finishedAt !== null) { // v2.4: the timed witnesses at +1 s and +5 s after 35567 returned, independent of the root's return
      if (!poll.timed1 && now - result.finishedAt >= 1000) { poll.timed1 = true; snapshot(poll.form, 'finish+1s', false, { sinceFinishMs: now - result.finishedAt }); }
      if (!poll.timed5 && now - result.finishedAt >= 5000) { poll.timed5 = true; snapshot(poll.form, 'finish+5s', false, { sinceFinishMs: now - result.finishedAt }); }
    }
    if (poll.rebuiltAt === 0) {
      const root = rootOf(poll.form);
      if (!root.isNull() && poll.rootSeenAt === 0) { poll.rootSeenAt = now; poll.rootSeenAtReturn = counts.playerUpdate; }
      const due = (poll.rootSeenAt !== 0 && (counts.playerUpdate > poll.rootSeenAtReturn || result.lastRead !== null)) || now - poll.started >= REBUILD_WAIT_MS;
      if (!due) return;
      poll.rebuiltAt = now;
      snapshot(poll.form, root.isNull() ? 'rebuilt (timeout, no root)' : 'rebuilt', true, { rebuildMs: poll.rootSeenAt === 0 ? null : poll.rootSeenAt - poll.started, waitedMs: now - poll.started, readRan: result.lastRead !== null });
      return;
    }
    if (now - poll.rebuiltAt < SETTLE_MS) return;
    poll.done = true;
    result.settled = snapshot(poll.form, 'settled', true); // v2.4: the seated verdict's after
    emit({ event: 'result', form: hex(FORM), mode: MODE, park: PARK, live: LIVE, liveWaiver: LIVE_WAIVE, seated: seatedVerdict(), killImpl: counts.killImplForm, killImmediate: counts.killImmediateForm, recordBlockHash: result.recordBlockHash, liveHash: result.liveHash, parkHash: result.parkHash, lastStored: result.lastStored, lastStoredCaller: result.lastStoredCaller, extraAtFinish: result.extraAtFinish, lastRead: result.lastRead, poseSource: sourceOf() });
    scheduleCleanup('result emitted'); // after the result row: the JS-thread timer fires once this frame's rows are out
  };

  const counts = { killImpl: 0, killImplForm: 0, killImmediate: 0, killImmediateForm: 0, innerAdd: 0, innerAddForm: 0, triggers: 0, runs: 0, refused: 0, playerUpdate: 0, formsLog: 0, havokRead: 0, havokReadForm: 0, havokBody: 0, havokPrePass: 0, flushEntry: 0, savedHavokSet: 0, set3DWrapper: 0, setData3D: 0, rigidSetPosition: 0, rigidSetRotation: 0 };
  let busy = false;
  let pending = null; // the armed trigger, run inside PlayerCharacter::Update's replacement on Main.threadID (no listener runs it: the guard)
  let updateThread = -1;
  let nowArmed = false;
  const act = function (q) { // q: { form, flags, markThread, t, runThread, deferredMs, via }
    if (counts.runs >= RUNS || busy) return;
    busy = true;
    try {
      if (q.form.isNull()) q.form = nf.lookupByID(FORM); // TRIGGER now
      if (q.form.isNull()) { counts.refused += 1; emit({ event: 'refused', reason: 'TESForm::LookupByID found no form', form: hex(FORM) }); }
      else {
        const p = premises(q.form, q.runThread);
        if (p.ok) counts.runs += 1; else counts.refused += 1;
        if (p.ok || counts.refused <= REFUSED_ROWS) {
          for (const c of p.checks) emit({ event: 'check', name: c.name, value: c.value, ok: c.ok });
          const failed = p.checks.filter(function (c) { return !c.ok; }).map(function (c) { return c.name; });
          emit({ event: p.ok ? 'premises' : 'refused', mode: MODE, trigger: hex(q.flags), markThread: q.markThread, thread: q.runThread, deferredMs: q.deferredMs, deferredVia: q.via, ok: p.ok, failed: failed,
            entryFlags: hex(p.entry.flags), entryRecordNull: p.entry.record.isNull() });
        }
        if (p.ok) run(q.form, p, q);
      }
    } catch (e) { emit({ event: 'error', where: 'act', error: String(e) }); }
    busy = false;
    const spent = counts.runs >= RUNS || (TRIGGER === 'now' && nowArmed); // TRIGGER now arms once: its refusal is also the end
    if (spent && poll === null) scheduleCleanup(counts.runs >= RUNS ? 'runs spent, no poll' : 'now trigger refused'); // an applied run keeps the replacement until its result row
  };
  const firstBytesAt = function (p) { return rva(p) + ':' + toHex(p, 4); };
  const safeBytes = function (p) { try { return p.isNull() ? 'null slot' : firstBytesAt(p); } catch (e) { return 'unreadable: ' + e; } }; // a garbage slot must not fault the load
  const rbSetPos = ptrAt(at('rigidBodyVtable'), SLOT_SET_POS * 8), rbSetRot = ptrAt(at('rigidBodyVtable'), SLOT_SET_ROT * 8);
  const hookBytes = {}; // every hook's resolved address and first bytes, read before the attach (the pitfalls rule); plus v2.3's two REMAP callees, called not hooked (35928 expected 40 53 48 83, 14617 40 57 48 83: the actor script's ready rows in 183149 and 192013)
  ['innerAdd', 'playerUpdate', 'formsLog', 'havokRead', 'havokBody', 'havokPrePass', 'flushEntry', 'savedHavokSet', 'set3DWrapper', 'setData3D', 'setNumericId', 'lookupByID', 'killImpl', 'killImmediate'].forEach(function (n) { hookBytes[n] = safeBytes(at(n)); });
  hookBytes.rigidSetPosition = safeBytes(rbSetPos); hookBytes.rigidSetRotation = safeBytes(rbSetRot);
  const mainTid = function () { const m = ptrAt(at('main'), 0); return m.isNull() ? -1 : u32(m, MAIN_THREAD); };
  const runPending = function (threadId, via) { // the deferred run, on Main.threadID only, inside Update's replacement (never inside a listener: the guard)
    if (pending === null || busy || threadId !== mainTid()) return;
    const q = pending; pending = null; q.runThread = threadId; q.deferredMs = Date.now() - q.t; q.via = via; act(q);
  };
  let reverted = false, cleanupWhy = null;
  const t0 = Date.now(); // the TTL's clock: the replacement's life without a result
  const cleanup = function (why) { // the replacement off, from the JS thread: frida-gum defers the context's destroy while Update is in flight (guminterceptor.c:1832)
    if (reverted) return;
    if (!updateReplaced) { reverted = true; cleanupWhy = why; emit({ event: 'cleanup', why: why, reverted: false, note: 'nothing replaced' }); return; }
    reverted = true; cleanupWhy = why;
    try { Interceptor.revert(at('playerUpdate')); Interceptor.flush(); emit({ event: 'cleanup', why: why, reverted: true }); } catch (e) { emit({ event: 'cleanup', why: why, error: String(e) }); }
  };
  const scheduleCleanup = function (why) { if (!reverted) setTimeout(function () { cleanup(why); }, 0); };
  const attachErrors = [];
  const attachAt = function (name, p, cb) { try { if (p.isNull()) throw new Error('null address'); Interceptor.attach(p, cb); } catch (e) { attachErrors.push(name + ': ' + e); } };
  const attach = function (name, cb) { attachAt(name, at(name), cb); };
  const isForm = function (p) { return u32(p, FORM_ID) === FORM; };
  const argId = function (a) { try { return a.toUInt32() === FORM; } catch (e) { return false; } };
  attach('innerAdd', {
    onEnter(args) { counts.innerAdd += 1; this.form = args[1]; this.flags = args[2].toUInt32(); this.id = u32(args[1], FORM_ID); },
    onLeave(retval) {
      if (this.id !== FORM || TRIGGER !== 'mark') return;
      counts.innerAddForm += 1;
      if ((retval.toUInt32() & 0xff) !== 1 || (this.flags & FLAG) === 0) return;
      counts.triggers += 1;
      const q = { form: this.form, flags: this.flags, markThread: this.threadId, t: Date.now(), runThread: this.threadId, deferredMs: 0, via: null };
      if (pending === null && counts.runs < RUNS && !busy) { q.updatesAtArm = counts.playerUpdate; pending = q; emit({ event: 'mark', form: hex(FORM), flags: hex(q.flags), thread: q.markThread, armed: true, updatesAtArm: q.updatesAtArm }); }
      else emit({ event: 'mark', form: hex(FORM), flags: hex(q.flags), thread: q.markThread, armed: false, reason: pending !== null ? 'pending armed' : (busy ? 'busy' : 'runs spent') });
    },
  });
  // PlayerCharacter::Update REPLACED, not attached: the apply and the poll must run outside every listener (the guard, header). The original
  // is called first through a NativeFunction at the same address (the calling_replacement bypass, guminterceptor.c:2262-2271); the body is
  // guarded so a JS exception never unwinds into the engine. hookBytes read playerUpdate's first bytes above, before this patch (the pitfalls rule).
  const origUpdate = new NativeFunction(at('playerUpdate'), 'void', ['pointer', 'float'], { exceptions: 'propagate' }); // void Update(float a_delta), Actor.h:371: the chain to the original through the same address; propagate: no exceptor scope around the engine's frame (gumquickcore.c:4540-4541; the default is steal, :4805), so a C++ throw inside the frame reaches its own handler and a fault is the engine's crash with its dump, never a stolen longjmp (gumexceptor.c:530-548 takes every type; gumexceptor-windows.c:135-137 maps a C++ throw to GUM_EXCEPTION_SYSTEM)
  let updateFaults = 0, updateFaultLast = null, updateReplaced = false, inUpdate = false; // the original in flight on the main thread: the watchdog waits for its return
  const updateCallback = new NativeCallback(function (self, delta) { // kept alive by Interceptor until the revert (gumquickinterceptor.c:1095 JS_DupValue, :1137 freed on revert); the liveness row's reference outlives the revert
    try {
      inUpdate = true; try { origUpdate(self, delta); } finally { inUpdate = false; } // exceptions: 'propagate' (above): an engine fault here is the engine's crash as without Frida; the catch below covers this JS body only
      counts.playerUpdate += 1;
      updateThread = Process.getCurrentThreadId();
      if (TRIGGER === 'now' && !nowArmed && pending === null) { nowArmed = true; pending = { form: NULL, flags: 0, markThread: updateThread, t: Date.now(), runThread: updateThread, deferredMs: 0, via: null, updatesAtArm: counts.playerUpdate }; emit({ event: 'mark', form: hex(FORM), trigger: 'now', armed: true }); return; }
      runPending(updateThread, 'PlayerCharacter::Update');
      if (!busy) { try { pollStep(); } catch (e) { emit({ event: 'error', where: 'poll', error: String(e) }); } }
    } catch (e) { updateFaults += 1; updateFaultLast = String(e); if (updateFaults === 1) emit({ event: 'error', where: 'playerUpdate replacement', error: String(e), updates: counts.playerUpdate }); }
  }, 'void', ['pointer', 'float']);
  try { Interceptor.replace(at('playerUpdate'), updateCallback); Interceptor.flush(); updateReplaced = true; } catch (e) { attachErrors.push('playerUpdate replace: ' + e); } // flush: the same commit rule as the census attach
  const fmtCache = {}; // 35519's format strings by address: read and matched once
  let ungatedLogs = 0;
  attach('formsLog', { // the engine's verdicts: printed in the window, or whenever the line carries FORM's id or a known verdict string, on any thread (200 at most outside the window)
    onEnter(args) {
      counts.formsLog += 1;
      const key = args[0].toString();
      let c = fmtCache[key];
      if (c === undefined) { let fmt = ''; try { fmt = args[0].readUtf8String(240); } catch (e) { fmt = 'unreadable: ' + e; } c = { fmt: fmt, verdict: VERDICTS.test(fmt) }; fmtCache[key] = c; }
      const inWindow = watch.active && this.threadId === watch.tid, carriesForm = argId(args[1]) || argId(args[2]) || argId(args[3]);
      if (!inWindow && !carriesForm && !c.verdict) return;
      if (!inWindow) { ungatedLogs += 1; if (ungatedLogs > 200) return; }
      emit({ event: 'formsLog', fmt: c.fmt, a1: String(args[1]), a2: String(args[2]), a3: String(args[3]), thread: this.threadId, inWindow: inWindow, carriesForm: carriesForm, verdict: c.verdict });
    },
  });
  attach('havokRead', { // 19535 per call, any thread: the saved count from the buffer, the live count from 19533's hook, the per-body calls, the caller
    onEnter(args) {
      counts.havokRead += 1;
      this.hit = isForm(args[0]);
      if (!this.hit) return;
      counts.havokReadForm += 1;
      let saved = null; // the block 19535 reads: the load buffer's data from its position, hashed whole (36019's scrap copy of the sub-buffer's block)
      try { const pos = u32(args[1], LBUF.pos), size = u32(args[1], LBUF.size), d = ptrAt(args[1], LBUF.data).add(pos), n = Math.min(size - pos, CAP); const b = new Uint8Array(d.readByteArray(n)); saved = { blockFlags: hex(b[0]), count: vi(b, 1)[0], bytes: n, blockHash: hex(fnv1a(b)) }; } catch (e) { saved = { error: String(e) }; }
      let extra = null; try { extra = extraNoLock(args[0]); } catch (e) { extra = { error: String(e) }; } // lock-free: 11979 holds the list's write lock across this call
      reads[this.threadId] = { bodies: 0, setPos: 0, setRot: 0, live: null };
      this.row = { event: 'havokRead', form: hex(FORM), thread: this.threadId, caller: rva(this.returnAddress), inWindow: watch.active && this.threadId === watch.tid, saved: saved, extraAtEntry: extra, afterApply: result.applied };
      emit(this.row);
    },
    onLeave() {
      if (!this.hit) return;
      const r = reads[this.threadId] || { bodies: 0, setPos: 0, setRot: 0, live: null };
      delete reads[this.threadId];
      const done = { event: 'havokReadDone', form: hex(FORM), thread: this.threadId, caller: this.row.caller, saved: this.row.saved, live: r.live, bodies: r.bodies, setPosition: r.setPos, setRotation: r.setRot, extraAtEntry: this.row.extraAtEntry, afterApply: this.row.afterApply };
      if (this.row.afterApply) result.lastRead = done;
      emit(done);
    },
  });
  attach('havokPrePass', { // 19533 inside 19535: the live count the reader compares with the saved one
    onEnter(args) { counts.havokPrePass += 1; this.r = reads[this.threadId]; this.state = args[1]; },
    onLeave() { if (this.r !== undefined) this.r.live = { flags: hex(u8(this.state, 0)), count: u32(this.state, 4) + u32(this.state, 8) }; },
  });
  attach('havokBody', { onEnter() { counts.havokBody += 1; const r = reads[this.threadId]; if (r !== undefined) r.bodies += 1; } });
  attachAt('rigidSetPosition', rbSetPos, { onEnter() { counts.rigidSetPosition += 1; const r = reads[this.threadId]; if (r !== undefined) r.setPos += 1; } });
  attachAt('rigidSetRotation', rbSetRot, { onEnter() { counts.rigidSetRotation += 1; const r = reads[this.threadId]; if (r !== undefined) r.setRot += 1; } });
  attach('flushEntry', { onEnter(args) { counts.flushEntry += 1; if (!isForm(args[1])) return; emit({ event: 'flush', form: hex(FORM), kind: u32(args[0], 0), thread: this.threadId, inWindow: watch.active && this.threadId === watch.tid }); } });
  attach('savedHavokSet', { // 11977: the park (ours or the flush's) or Set3D's store of the live pose; the sub-buffer's header prints
    onEnter(args) {
      counts.savedHavokSet += 1;
      if (!isForm(args[0].sub(R_EXTRA))) return;
      let h = null; try { h = subHeader(ptrAt(args[1], 0)); } catch (e) { h = { error: String(e) }; }
      const ours = parking && this.threadId === watch.tid, caller = ours ? 'ours (PARK)' : rva(this.returnAddress); // our NativeFunction call returns into a Frida thunk, not an exe RVA
      if (h !== null && h.error === undefined) { result.lastStored = h; result.lastStoredCaller = caller; }
      emit({ event: 'savedHavokSet', form: hex(FORM), ours: ours, caller: caller, thread: this.threadId, sub: h, matchesRecord: h !== null && h.blockHash === result.recordBlockHash, matchesLive: h !== null && h.blockHash === result.liveHash });
    },
  });
  attach('set3DWrapper', { onEnter(args) { counts.set3DWrapper += 1; if (!isForm(args[0])) return; emit({ event: 'set3D', form: hex(FORM), node: String(args[1]), caller: rva(this.returnAddress), thread: this.threadId }); } });
  attach('setData3D', { onEnter(args) { counts.setData3D += 1; if (!isForm(args[0])) return; emit({ event: 'data3D', form: hex(FORM), node: String(args[1]), caller: rva(this.returnAddress), thread: this.threadId }); } });
  attach('killImpl', { // v2.4: Actor::KillImpl 37896, ungated like 19535: the kill witness (this, attacker, damage in xmm2 unread, sendEvent in r9b, ragdollInstant the fifth argument on the stack)
    onEnter(args) {
      counts.killImpl += 1;
      if (!isForm(args[0])) return;
      counts.killImplForm += 1;
      let attacker = null, ragdoll = -1;
      try { attacker = args[1].isNull() ? null : hex(u32(args[1], FORM_ID)); } catch (e) { attacker = 'unreadable: ' + e; }
      try { ragdoll = args[4].toUInt32() & 0xff; } catch (e) { ragdoll = 'unreadable: ' + e; }
      const r = { event: 'killImpl', form: hex(FORM), attacker: attacker, sendEvent: args[3].toUInt32() & 0xff, ragdollInstant: ragdoll, caller: rva(this.returnAddress), thread: this.threadId, inWindow: watch.active && this.threadId === watch.tid, afterApply: result.applied };
      result.killImplRows.push(r);
      emit(r);
    },
  });
  attach('killImmediate', { onEnter(args) { counts.killImmediate += 1; if (!isForm(args[0])) return; counts.killImmediateForm += 1; const r = { event: 'killImmediate', form: hex(FORM), caller: rva(this.returnAddress), thread: this.threadId, inWindow: watch.active && this.threadId === watch.tid, afterApply: result.applied }; result.killImplRows.push(r); emit(r); } }); // v2.4's review: Actor::KillImmediate 37735, the dead=1 TESDeathEvent dispatcher and SetLifeState(2), the second kill path
  let noUpdateRefusals = 0;
  setInterval(function () { // the watchdog: an armed run that Update's replacement has not taken in 2 s is refused ('no Update return'); a mark may re-arm, TRIGGER now ends the run
    if (updateReplaced && !reverted && !busy && pending === null && (poll === null || poll.done) && Date.now() - t0 > TTL_S * 1000) { scheduleCleanup('ttl ' + TTL_S + ' s'); return; }
    if (pending === null || busy || inUpdate || Date.now() - pending.t < 2000) return;
    const q = pending; pending = null; counts.refused += 1; noUpdateRefusals += 1;
    emit({ event: 'refused', reason: 'no Update return', mode: MODE, trigger: TRIGGER === 'now' ? 'now' : hex(q.flags), markThread: q.markThread, armedMs: Date.now() - q.t, updatesSinceArm: counts.playerUpdate - (q.updatesAtArm || 0), updateThread: updateThread, mainThread: mainTid(), updateReplaced: updateReplaced, updateFaults: updateFaults });
    if (TRIGGER === 'now') scheduleCleanup('no Update return');
  }, 1000);
  setInterval(function () { emit({ event: 'liveness', counts: counts, updateThread: updateThread, updateReplaced: updateReplaced, replacement: String(updateCallback), updateFaults: updateFaults, updateFaultLast: updateFaultLast, inUpdate: inUpdate, noUpdateRefusals: noUpdateRefusals, pending: pending !== null, runs: counts.runs, polling: poll !== null && !poll.done, reverted: reverted, cleanupWhy: cleanupWhy }); }, 10000);

  const s0 = singletons();
  let ver0 = -1;
  try { ver0 = nf.saveVersion(); } catch (e) { attachErrors.push('saveVersion: ' + e); }
  const ready = { event: 'ready', version: version, pid: Process.id, base: String(exe.base), form: hex(FORM), mode: MODE, trigger: TRIGGER, flag: hex(FLAG), runs: RUNS, force: FORCE, suppress: SUPPRESS, park: PARK, live: LIVE, liveWaiver: LIVE_WAIVE, updateReplaced: updateReplaced, hooks: hookBytes,
    game: String(s0.game), manager: String(s0.manager), main: String(s0.main), handler: String(s0.handler), player: String(s0.player),
    managerFlags: s0.game.isNull() ? -1 : hex(u32(s0.game, MANAGER_FLAGS)), pending: s0.game.isNull() ? -1 : u32(s0.game, PENDING_COUNT), dryRun: s0.manager.isNull() ? -1 : u8(s0.manager, DRY_RUN),
    mainThread: s0.main.isNull() ? -1 : u32(s0.main, MAIN_THREAD), saveVersion: ver0, remap: { rows: REMAP_ROWS.length, error: REMAP_ERROR, mode: MODE }, attachErrors: attachErrors };
  if (MODE === 'apply') { try { const r = parseRecord(); ready.record = { type: r.type, sizeCode: r.sizeCode, version: r.version, length1: r.length1, length2: r.length2, total: r.total, fnv1a: r.fnv1a, problems: r.problems, flags: hex(FLAGS >>> 0), havok: r.length2 === 0 ? havokOf(r.bytes.subarray(r.bodyStart), FLAGS >>> 0, FORM) : 'deflated' }; } catch (e) { ready.recordError = String(e); } }
  emit(ready);
}
