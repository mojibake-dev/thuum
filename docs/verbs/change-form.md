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
and never simulate. The server records, relays, arbitrates and validates consistency only.

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

- C2S ChangeForm (reliable): epoch u32; formId u32 (the shared load order's id); formType u8; flags u32; version u8; body
  bytes (cap 65536); fnv1a u32 over the body; remap: list of {offset u32, formId u32, index u32} (cap 256). The validator
  (same commit, rule 4): formId within the load order's ranges and not a player's; version 0x4E; the body's first bytes a
  change-form header whose type byte matches formType and whose lengths match the body; the fnv over the body equal to
  fnv1a; every remap row's offset inside the body with its three bytes decoding to kind 0 and the row's index; the sender the
  host of the actor's cell at `epoch` (the cells table); caps. Refusals: E_CHANGEFORM_RANGE, E_CHANGEFORM_HEADER,
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

Native (Skyrim Platform C++): the two detours (count, report), the frame-end serialize with the census and the hash, one event
to TS per changed form (formId, formType, flags, body as hex, fnv1a, remap rows), the receive natives (REMAP through 35928; the
mid-game apply 35509, 35568, 35567; the changes-map injection for an unloaded cell), every address proven in the ready line
(T1). TS: changeFormService (the per-form acked hash, the send, the ack, the apply on ChangeFormApply before the view's first
update). Deleted in the same branch: formView's bind kill ("dead record ... loaded alive on a watcher's seat ... killed
silently") and the promote gate's move (the movedInto block); hostService's dead hold, placing hold, its asks and reviveHold;
PartOne's "own copy hidden" Disable snippet. Kept: the redress wait (the outfit flags are not in this slice), the puppet flag,
the players' own R1 movement and death word.

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

## Status

- [x] doc complete, inventory listed with a disposition per row, rung declared
- [x] engine surface cited or delegated
- [ ] server logic + T0
- [ ] message + validator (same commit)
- [ ] native hook + T1
- [ ] TS handler
- [ ] T2 green
- [ ] T3 scenario green, no HYPOTHESIS tags
- [ ] parity scenario green, or its later list reviewed with it (ADR-031)
- [ ] sequences and combinations green, every checklist item with its scenario (ADR-033)
- [ ] ledger and suppression registry updated
