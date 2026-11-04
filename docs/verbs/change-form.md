# change-form (ADR-065 for system 1: the save is the state)

Status: the vertical slice for system 1, begun 13:0x PST 2026-11-03 on Eli's word ("we should be implementing the real fix
every time"), re-scoped at 13:4x PST by ADR-067 (Eli's executive decisions) and by read 1's GREEN (20261103-210713, the cross-seat
actor apply: c1's dead record of Sven applied on c2's dead copy through the engine's LoadGame moved the copy 1,150 units to c1's
place in one call and laid it in c1's pose within 5 units, the one type-0 id re-encoded 10586 to 10584): the FIRST TRIGGER is the
corpse (the owner serializes the body's record when its ragdoll is at rest; the watcher applies it after its own kill, by the death
word or by the bind, which ADR-067 keeps), so the apply is always dead-on-dead and reads 2 and 4 wait for materialize-first proper.
The AddChange funnel's observe (decision 2) and the live-actor flags come after. One fork branch adr065-system1 off m3-system1-r3
df9e1009, built in three layers in parallel (native, wire and server, client) beside ADR-067's server half (the owner's post-death
samples to rest, the record's position), one stage, one gate. This doc is the contract the layers meet at; the engine facts are
docs/engine/change-forms.md and docs/research/adr065-serialize-on-demand-2026-11-03.md.

## Intent

An actor's saved state (this slice: kLifeState, kMoved, kCellChanged, with the record's whole body as the engine writes it)
travels as the engine's own change form: the owner's game marks it (AddChange), serializes it at the frame's end with its own
SaveGame, the server records it, and a watcher's game applies it through its own LoadGame before the actor's first simulated
frame there (materialize first). The load-time corrections this retires are deleted in the same branch: the bind kill, the
dead hold, the placing hold and its asks, the promote gate's move, the viewing seat's hide snippet. Playtest 42's F1 to F4 and
F6 (the duplicate Embry and Hod, the death heard at a watcher's late load, the body sliding down Bleak Falls' slope, the loot
reach measured from the record) are this verb's motivating findings; playtest 37's finding 38 and playtest 40's F2 are its
ancestors.

## Inventory (ADR-031: the action's consequences, before its rung)

| Consequence | Disposition |
| --- | --- |
| the owner's engine changes an actor's position, cell or life state | observed at the AddChange funnel; serialized; reported (R2) |
| a non-owner's engine changes the same | counted per form type at the funnel's entry, never reported (amendment F: a count, not a swallow) |
| the server keeps the record | recorded per form with its epoch, flags, body, hash and remap rows; persisted (rule 6) |
| the owner's compare | the server acks the body's hash; equal bytes send nothing (amendment A) |
| a seat loads the actor's cell or subscribes to the actor | the record is served before the actor's first frame there and applied through the engine's own path |
| the record names seat-local ids | the census rows ride with the record; the receiver re-encodes them through the engine's own 35928 (D6, the REMAP step) |
| the old load-time corrections | deleted (see Client) |

### Sequences and combinations (ADR-033)

A kill by the owner then a watcher's late load; a server restart with the record standing; a door walk under one owner into a
cell another owns; two seats loading the cell in either order. Each a leg of the acceptance scenario.

## Ownership (ADR-063: ownership, not permission)

The actor's cell's host owns the actor and reports its record; the epoch on every report is the cell's host epoch the client
holds (ADR-066's stamp; the two-phase hand-off itself is ADR-066's build after system 1 merges). Non-owners render the record
and never simulate. The server records, relays, arbitrates and validates consistency only. The owner the server judges by is
the cells table's host of the actor's cell (GetCellHost), not WorldState::HostOf's simulator: a follow's record (npc-handoff
decision a, the actor in a cell nobody hosts under the host that moved it, a body that ragdolls across a boundary) is refused
E_CHANGEFORM_OWNER in this slice and counted; its acceptance is ADR-066's, with the follow row's origin epoch as the stamp (the
wire layer's review, finding 2).

## Authority

R2 for the report (the owner computes, the server records): the server validates the header against the body (the type byte,
the version 0x4E, the lengths), the sender's ownership at the epoch, the hash, the caps and the remap rows' decode, and
refuses with a code; it does not recompute the body. R0 for the ack and the record's keeping. Not R1: a position or a life
state has no server oracle beyond bounds, and the design law's R2 is the default rung for host-computed state. R3 for
nothing in this slice.

## Engine surface

Every id is Address Library 1.6.1170; the RVAs and the evidence are in the research note's id tables and change-forms.md.
- The mark: TESForm's slot 0x0A body 14607 tail-jumps into BGSSaveLoadGame's AddChange 35576 (the gates), which ORs the flags
  into the changes map through 35507 (A1, A2 CONFIRMED; 145 vtables share the body). The hook is ONE detour at 35576's entry
  for the count of every act and one at 35507 for the report of the marks that passed the gates (ADR-065 decision 2, clarified
  at ab448726). A forced entry 14608 reaches 35576 with force 1 (A4).
- The serialize: the on-demand recipe the Frida scripts proved (C5, C6; runs 131511, 153929, 192013, 192345): BGSSaveFormBuffer
  36035 (ctor) and 36037 (the header), the form's slot 0x0E SaveGame with kInitingForms dropped (37649 for Actor, 40266 for
  Character), 36081 (the pack), 35740 (the version constant 0x4E), 35715 (the initial data); the id census at 35928
  (SetNumericID) during the recipe gives the remap rows (D6).
- The apply on a loaded reference: 35509 (the record written into the entry), 35568 (the apply: the initial data, then LoadGame
  through slot 0x0F) and 35567 (the finish pass; the Havok block parked for a leveled actor's rebuilt 3D or fed to 19535
  directly), CONFIRMED by 164416, 174905 and 193005 for a dead record on a dead copy of the same seat, and by 210713 for another
  seat's record on this seat's dead copy with the REMAP step (the place from the initial data, the pose from the record's block).
- The apply before a cell loads: the record written into the changes map in save-file format, applied by LoadGame at the cell's
  init before the 3D loads (D1, D2 for the engine's own stash; D3 CONFIRMED for an injected REFR record; the ACHR case is
  read 4 below).
- The id kinds: type 1 portable, type 2 seat-local, type 0 a seat-and-session index (the form-id map 35554 at mgr + 0x298); the
  receiver's re-encode through 35928 (D6; apply-on-demand.js v2.3's REMAP step is the reference implementation).

## Observe (host or acting client sees the intent before the engine acts)

The owner's AddChange marks, collected per frame at 35507 for forms in the hosted set (the set the action hook already
consults), serialized at Skyrim Platform's own tick on the main thread, hashed and compared against the last acked hash.

## Impose (observers render the server's decision)

A watcher applies the served record before the actor's first frame: into the changes map when the cell is not loaded here,
through 35568 and 35567 when the reference is loaded; the REMAP step first. The record's life state lays a body without a
kill; its position and cell place the copy without a move.

## Suppress (engine's own behavior blocked on non-hosts)

Nothing new: a non-owner's marks are counted, never swallowed (amendment F). The puppet flag (AI off) stays as today.

## Message contract

- C2S ChangeForm (reliable): epoch u32; formId u32 (the shared load order's id); formType u8 (the RECORD's save-type index, 0 REFR
  and 1 ACHR, the header byte's low six bits: the native's recordType, never the engine's form type 0x3E it also answers;
  x-corpse-record v2 001821 refused every send E_CHANGEFORM_HEADER on that confusion); flags u32; version u8; body:
  the WHOLE record (its header included) as a lowercase hex string on the JSON wire, two characters per byte, cap 65536 bytes
  (131072 characters); fnv1a u32 (FNV-1a 32, basis 0x811c9dc5, prime 0x01000193) over the decoded record bytes; remap: list of
  {offset u32 (a RECORD offset, the header's width included), formId u32, index u32} (cap 256). An owner whose remap list is
  incomplete (the native's remapTruncated at its 256-row cap, or census.dropped above 0: id writes past its census cap) sends
  nothing, since a seat-local id the receiver cannot remap would land as a foreign id; a row the serialize cannot read back from
  its own record (H3: a varint placeholder patched after an id write shifts the tail a byte) refuses the serialize on the owner,
  the reason in its log. The validator (same commit, rule
  4): formId within the load order's ranges and not a player's; version 0x4E (1.6.1170's 35740; whether 1.7.104 writes 0x4E is
  HYPOTHESIS, and a seat on it would be refused E_CHANGEFORM_HEADER, ADR-025); the hex even and [0-9a-f]; the decoded record's
  header (byte 0 on) with a type byte matching formType and lengths matching the decoded size; the fnv over the decoded bytes
  equal to fnv1a; every remap row's offset inside the decoded body with its three bytes decoding to kind 0 and the row's index;
  the sender the host of the actor's cell at `epoch` (the cells table); caps. Refusals: E_CHANGEFORM_RANGE, E_CHANGEFORM_HEADER,
  E_CHANGEFORM_HASH, E_CHANGEFORM_REMAP, E_CHANGEFORM_OWNER, E_CHANGEFORM_EPOCH, E_CHANGEFORM_SIZE, each logged once a minute
  per sender and form.
- S2C ChangeFormAck: formId u32; fnv1a u32 (the owner's compare baseline).
- S2C ChangeFormApply: formId u32; formType u8; flags u32; version u8; body bytes; remap rows (the sender's, untranslated: the
  receiver re-encodes). Sent to a seat with the reference before its first frame there: with the CreateActor word for the
  actor, and at a cell's load for the cell's actors with a record.
Rule 12: the Rust wire recognizes every ChangeForm before anything else sees it; no raw bytes cross the bridge into C++.

## Server

Rust (ADR-010): the recognizer and validator in wire-validate, the store (a change_forms table: formId, epoch, flags, version,
body, fnv1a, remap rows, the sender, the time; a migration and a restart scenario, rule 6), the ack, the serve on subscribe and
on cell load. The record wins at a login and at every cell load (amendment F); a seat's own save is never an input. Decoded on
the server: nothing of the body in this slice (the sections the server validates come with the inventory flags later).

## Client

Native (Skyrim Platform C++), as built on adr065-sys1-native for the corpse trigger: two TESModPlatform Papyrus statics called
through callNative in the update context and returning JSON strings (a Papyrus native returns no object and callNative takes no
array): SerializeChangeForm(refr) runs the on-demand recipe with the 35928 census and returns {formId, formType, flags, version,
bodyHex (the whole record), fnv1a, remap [{offset, formId, index}], remapTruncated, census {rows, type0.., dropped}, thread, ...}
or "" with the reason in the platform log (a premise refused, a remap row that did not read back, or the body threw: every throw
is caught inside the native, since one past TESModPlatform::Add leaves the JS pool thread waiting forever); ApplyChangeForm(refr, bodyHex, flags, version, remapRows "offset:formId:index,...") runs the REMAP step through 35928 then
35509, 35568 and 35567 and returns {applied, reason, fnvPatched, ...}; every address proven in a startup line with its first bytes
(the slice's T1). H1, read first on the lab: the natives run on the platform's update thread, not the main thread (the scripts
deferred to Main's); the fork's own 3D drop and rebuild runs there (rerollActor), so the premise is reported, not enforced. The
AddChange funnel's two detours and the frame-end serialize come with the live-actor flags later; the changes-map injection for an
unloaded cell is read 4's. TS: changeFormService (the per-form acked hash, the send, the ack, the apply on ChangeFormApply before the view's first
update). Deleted in the same branch: formView's bind kill ("dead record ... loaded alive on a watcher's seat ... killed
silently") and the promote gate's move (the movedInto block); hostService's dead hold, placing hold, its asks and reviveHold;
PartOne's "own copy hidden" Disable snippet. Kept: the redress wait (the outfit flags are not in this slice), the puppet flag,
the players' own R1 movement and death word.

FALSIFIED, playtest 44 (2026-11-03 evening, the 7845bb22 dist): the apply's premise widened to a DYING copy (lifeState 1, fork
7845bb22, after x-corpse-record v2 002847's five refusals at lifeState 1) HANGS the watcher: c2 froze twice inside the engine's apply,
the platform log ending at "ApplyChangeForm 0x39fe2 ... -> 35568" (17:06:19 and 17:12:56; bandit 39fe2 killed by rotfern's arrows,
lifeState 1, the call on thread 8868 against main 12188; results/20261104-005702-x-corpse-record/c2-*). This is H1's thread risk made
real for a copy whose ragdoll still runs: the apply from the platform's thread does not return. The premise is dead-only again
(reverted on every future head: f2 4a900440, r2 c37f99b7, m4-scripts-flip 8896ef0c; the canon client is 0c23306e's, no hang in 002847
or 003449). The watcher's live-death case stays as before the slice until its death completes: a puppet whose own engine started the
death sits in kDying with its AI off, and 002847 read it still kDying 10 s after the puppet release (AI true in the handler's attempts),
so the completion is read 5 of the Dynamic plan (why an AI-on released copy never reaches kDead; the dying-to-dead step 0x6e3310 tests
the 3D's rest against the process clock; KillImmediate 37735 is the engine's own completion the process-level moves call, the
candidate for the fork to call on a settled dying copy), never a wider premise.

FALSIFIED further, playtest 44 (2026-11-03 night, the canon-3 dist 9869d28c, numidium's read of C:\sky-lab\pt44-c1-sp.log; the
log reaches results/playtest-44 at the recorder's stop): the dead-only premise does not prevent the hang. c1 (rotfern, the owner
and host) froze at the server restart inside the apply on a DEAD copy, its own headshot kill 0x29602 (CIF's instant death,
03:10:44Z) re-served at its reconnect: the platform log ends "ApplyChangeForm 0x29602 check actor dead (lifeState 2): 2 ok ...
check entry record null ... null ok" then "ApplyChangeForm 0x29602: 3755 bytes fnv 0x4f899034 flags 0x8a040427 remap rows 0 ->
35568" (19:14:58 local) and nothing after, the heartbeat 390 s stale, the call off the main thread (Main.threadID 8328 against the
caller's 1440 on c2's runs, c1's the same check). So H1, the apply from the platform's thread, is the cause; the life state was
never the gate. The hotfix for the rest of the playtest: fork m3-canon-3-apply-off 2136311f (off canon-3, client only), where
ChangeFormService.tryApply returns before the native under a `watcherApplyOff` constant with one lab line per record ("corpse
<hex> record held, the watcher apply is off on this build"); serialize, the send and the store are untouched; a turbo-client
bundle for both seats. The apply comes back only on the main thread under its own probe (read 6). In the same playtest (items 2b
and 2c, Eli: "the bandits are dead on prisoners screen, but they appear dead i suppose where they initially spawn? not where they
fell on rotferns screen") the late arrival's bind kill leaves its copies in kDying too, not kDead, so the dead-only premise
refused the record every time: "[19:15:37:122] ApplyChangeForm 0x29602 check actor dead (lifeState 2): 1 FAILED ... refused
0x29602 at premises: actor dead (lifeState 2) (1)", the same for 0x29600, both again after the server restart at 03:14:43Z;
against it, c2's login batch at 19:04:34 (the temple's skeevers and placed corpses, dead at creation) all applied ("lifeState 2
then 2"). "The bind kill's apply stays immediate (a body dead at its creation has no running ragdoll)" does not hold for a copy
the bind kill makes dead at load: it sits in kDying like the live death's copy, so the death's completion (read 5) is the one
fix for both, and the apply's thread (read 6) the one fix for the freezes.

BUILT for read 6 (2026-11-03 night, fork m3-canon-3-apply-main faff697c off the hotfix, the review's three fixes 1e489b6c):
ChangeForm::Apply checks the arguments, refuses at the queue (no reference, no SKSE task interface, an apply in flight for the form;
a stale unread answer, whose seat record went before the poll read it, is discarded by the new queue and logged) and otherwise queues
the engine steps to the game's main thread through SKSE::GetTaskInterface()->AddTask (the fork's TickHandler idiom; the platform's
gameThrQ is drained inside the Papyrus OnUpdate native, so it is NOT the main thread), answering {applied false, queued true,
formId, thread} at once; the task looks the reference up where it runs, runs ApplyImpl under the same catch, logs "ApplyChangeForm
<id> answered on the main thread (thread N main N, queued from M)" or "another thread", and parks the JSON answer, which the new
Papyrus native TESModPlatform.ApplyChangeFormResult(refr) hands over once ("" while pending; docs/NATIVES.md, R2). changeFormService
marks a queued record (queuedAt, queuedWhen), polls the answer each update, hands it to onApplyResult (the lab lines unchanged), gives
up after 15 s without one (a reference-less record too), and neither retries, re-attempts from the kill's call nor drops a record in
flight; the watcherApplyOff switch is false there and stays as the emergency lever. Reviewed GO by a fresh agent (ADR-064 rule A)
for the solo probe, its three findings applied as written in 1e489b6c. FALSIFIED at 20261104-043219 (x-corpse-record v3 on
1e489b6c's dist, 6 of 23 green): SKSE's task interface runs its tasks on a POOL, not the main thread: "answered on another thread
(thread 10536 main 10376, queued from 10540)" with the answering thread varying (10536, 10528, 10572, 10540), "answered on the main
thread" 0, no hang, no give-up; so TickHandler's tick never was on the main thread either, and the queue's shape stays while its
drain moves to the engine's own per-frame function on Main.threadID (read 7). The same run, unchanged by the build: every Sven apply
refused at "actor dead (lifeState 2) (1)" (read 5's dying copy, attempts 1 to 5 at each arrival), c2's "resurrect 13491 (puppet
true) queued" (the resurrect hold 025979b6 was never on the canon), the owner's abs(c1.x - record.x) < 32 failed. Until read 7 the
watcher apply stays off on the canon. Was: HYPOTHESIS until x-corpse-record v3 (by path, sha1 3430e911: "answered on the main thread" at least once on the
watcher, "another thread" never, the install line on both seats, no give-up) runs alone against canon-3 with this branch's dist and
lays the body. In the same corpse-load frame on a seat the fate's engine re-roll of a DEAD body (rerollActor on a leveled pick that
changed) left the khajiit 0x29613 naked and headless on rotfern's 19:22 relaunch (playtest 44 item 2c; numidium's read of c1's log:
"rerolled 29613 through the engine from pick 37c06 toward the fate's 9a549", 3D loaded before and after): the known naked bandit of
11-02 (x-fate-dress-bleak), ranked after read 5 since a corpse's load now gathers the apply, the dying completion and the re-roll.

## Tests

- T0: the validator's refusals (every code), the store and its migration, the restart persistence.
- T1: the detours' and natives' addresses against SkyrimSE.exe 1.6.1170 outside the game.
- T2: a fake client's ChangeForm recorded, acked and served after a restart; the differential harness unchanged.
- T3: numidium's two-seat acceptance scenario (id to be named): a host-killed bandit lies at the same spot on both screens within
  32 units; no death line or sound on the watcher at its load; a body on a slope stays put; the loot opens for the watcher at
  its body; no frozen duplicate after a server restart or a cross-cell walk; the record's ids remapped.

## Dynamic plan (fill when any tag above is still HYPOTHESIS)

Four reads on the lab, each a Frida run on the existing scripts before the receive half is built against them:
1. The cross-seat actor apply with REMAP (apply-on-demand.js v2.3; numidium's x-apply-cross-seat-sven v2).
2. A dead record applied to a LIVE loaded copy (the watcher's late-load case): a v2.4 of the apply script with a live premise
   and the kill and fall witnesses (19535's bodies, KillImpl 37896's hand-off, the animation events, the position at 1 s and
   5 s). Expected: the body laid at the record with no kill event and no fall.
3. A record whose cell differs from the copy's applied to a loaded copy (kCellChanged plus kMoved): the copy moves to the
   record's cell and place; shares read 2's run when the record is taken elsewhere.
4. An ACHR record injected into the changes map before the cell loads is applied at the cell's init (D3 CONFIRMED for a REFR;
   the actor case): transplant-inject.js admitting an ACHR with kMoved and kPromoted, REMAP, and the 35569 and 36080 hooks
   reporting the actor's life state, position and 3D after the init.
5. The watcher's dying copy (playtest 44): why a puppet whose own engine started the death stays kDying after its puppet release
   with the AI back on (the completion 0x6e3310 and its test of the 3D's rest against the process clock; the process-level moves
   that call KillImmediate 37735 on a kDying actor), read on the watcher with a Frida script on 0x6e3310, 37735 and the moves; then
   the fork's completion of the death on a settled dying copy (KillImmediate through a native, or the process level moved) before
   the dead-only apply. Until then a live death on the watcher applies no record and the body lies where the watcher's own ragdoll
   left it.
6. The apply on the main thread (H1's cure, playtest 44's two freezes): the REMAP apply queued from the native to where the
   engine runs its own rebuild (Main's thread, where the fork defers the scripts and rerollActor's drop and rebuild run) and
   answered at the next update instead of returning in the caller's thread; the candidate queue is the task interface CommonLibSSE-NG
   exposes (SKSE::GetTaskInterface()->AddTask), HYPOTHESIS until the native's startup line and the answer's `thread` field read the
   main thread's id on the lab, on a dead copy first (apply-on-demand.js's premise), then read 5's completed dying copy. Until it
   runs there the watcher apply stays off (m3-canon-3-apply-off). BUILT on m3-canon-3-apply-main faff697c plus 1e489b6c (the SKSE
   task, the result native, the poll; see the Client section); the read is x-corpse-record v3's thread claims.
7. The main loop's own hook (after read 6's FALSIFIED): the thread that owns Main (Main.threadID, where the Frida recipes ran
   the apply from the death-path hook and worked) is reached by no queue we have (SKSE's AddTask is a pool; gameThrQ is the OnUpdate
   thread), so the drain is a detour on the engine's per-frame function on that thread (Main::Update or its equivalent).
   CommonLibSSE-NG's Main.h declares no Update and this NG has no BSTaskPool header, so by rule 1 the re-analyst names it from
   Ghidra on 1.6.1170 with its Address Library id cross-checked by `just addr`, its prologue bytes and call shape, where skse64 really
   drains its queue, and the detour's hazards (reentrancy, locks, Papyrus); the result's `thread` field against Main.threadID is the
   claim, as read 6's was. The seats roll back to the canon's dist meanwhile (numidium).

## Status

- [x] doc complete, inventory listed with a disposition per row, rung declared
- [x] engine surface cited or delegated
- [x] server logic + T0 (adr065-sys1-wire, the fresh review GO; adr067-corpses-srv, GO)
- [x] message + validator (same commit) (t 72, 73, 74 and wire ids 80 to 82, positional; SCHEMA_VERSION 33; the collision with TrapHit's 72 in WIRE.md renumbers at the parity merge)
- [ ] native hook + T1 (built on adr065-sys1-native, review GO; T1 is the ready log's proof line, unread)
- [x] TS handler (adr067-corpses-client, the fresh review FIX FIRST applied)
- [ ] T2 green
- [ ] T3 scenario green, no HYPOTHESIS tags
- [ ] parity scenario green, or its later list reviewed with it (ADR-031)
- [ ] sequences and combinations green, every checklist item with its scenario (ADR-033)
- [ ] ledger and suppression registry updated
