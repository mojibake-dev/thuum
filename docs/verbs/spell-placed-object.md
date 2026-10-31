# Verb: spell-placed-object

Status: DRAFT, 2026-10-28 PDT, thuum-magnus. From playtest 37's Raise Wall
finding, the M2-CLOSE carry (docs/M2-CLOSE.md:148-154) and ADR-029's open
question (docs/DECISIONS.md:830-831).

## Intent

A spell whose script puts an object into the world (Apocalypse's Raise Wall
first) puts it into the server's world: every seat sees the same wall at the
same place, is blocked by it, and sees it go when the caster stops.

Roadmap reference: none (docs/apocalypse-options.md 5.1 A3).
Milestone: M3 (carried from M2)   Class: B

### The finding

Playtest 37, 2026-10-29 04:25Z, Eli: "im impatient, can we try getting raise
wall working?". c1 (rotfern) cast Raise Wall, SPEL 0xcc14 of
"Apocalypse - Magic of Skyrim.esp" (docs/LOG.md:2763). c1's refs-near diff
(ACTI filter, docs/LAB.md:462-471) gained ACTI 0xff000938 (base 0x1a0735e8)
and, 48 units below, ACTI 0xff000906 (base 0xb79ff, Skyrim.esm); c2, 440 units
away, had neither within 4000. ADR-029 runs the script in the caster's
game only (docs/DECISIONS.md:742); on c2's figure the relayed stream's script
is blanked (ADR-044; FridaHooks.cpp:134; remoteServer.ts:1158-1245).

### The cause at T3 (2026-10-30; 3o's stage, runs 063053 and 063222)

With the server half live the placement line held ("placed 2 forms") and c2's
refs-near still had neither base: every seat's view aborted on its first
Papyrus call on the MSTT base, every frame ("Bad call result 4", kFailedAbort,
in both seats' console logs). Skyrim Platform packs a form argument by its
formType (skyrim_platform/CallNative.cpp, AnySafeToVariable: the id is
nativePtrRaw->formType) and the VM registers no Papyrus class for
MovableStatic (36), so CommonLib's PackHandle (RE/P/PackUnpack.h: SetNone, then
a return when GetScriptObjectType finds no class) handed every native a None
and the call aborted; the caster's own copy stood because the script's
PlaceAtMe never crosses the platform. Fix on the fork, m3-sp-pack-form 9fad9f08,
merged into m3-pass-train-3-win 997fedf1 with the client build: a form whose
type has no class is packed as Form, the class every native that takes a Form
accepts (the file's own static-VM idiom). CONFIRMED at T3 by x-raise-wall
20261030-124309 on the union 820a565c (the v2 frame): the watcher's six claims
held (both bases listed at the pose; the glow 174.09 against 173.95 from the
records, the wall 178.75 with its 48 units of depth; runtime_of 1 and 1), zero
"Bad call result 4" on either seat, two skip lines on c1 and none on c2. The
run's one red was the caster's own MSTT read 135.7 units below the pose, 104
units into the mod's 240-unit rise at 512 u/s (x-raise-wall v3 waits 2 s);
b-spell-placed-wall plays at the sweep.

The frame hid a premise red behind it: the 2026-10-29 move 300 south stood c1
at (0, -500), in the cell south of the wall's (lab-spawn's origin is 310 units
north of its cell's south edge, lab-api's guests.yaml; the wall's line at -308
lay 2 units inside the origin cell), so c1's one-cell refs-near could never
list its own copies (claim 3). The scenario's v2 (thuum 12353ab) stands c1 at
(0, -366) and reads its copies through c2's figure's cell (refs-near
{from: other}); x-raise-wall by path carries the same frame.

## Inventory (ADR-031: the action's consequences, before its rung)

From WB_FabricateWall_Script and the records (apocrypha's read, 2026-10-28;
the census row 0300CC14). A Self concentration (castType 2, delivery 0), 8
magicka a second; MGEF 0x9852e (archetype Script, condition
GetVATSFrontAreaFree >= 300) carries the script, MGEF 0x9852f the failure
message, one per cast; OnEffectStart and OnEffectFinish only.

| consequence | seen in | disposition |
| --- | --- | --- |
| the stream: art, loop, cost | record | native; relayed by spell-cast (R1) |
| TargetBox, FXEmptyActivator 0xb79ff, the translate target | script | suppressed: no server copy (no collision lost, Known limits S1) |
| the wall, MSTT 0x98529: placed disabled 192 forward and 288 down at the caster's yaw, enabled, translated up 240 to the TargetBox | script | imposed: the server's object at the final pose (R0); the rise R3, later |
| the halo, ACTI 0x735e8, at the TargetBox's XY, the caster's height | script | imposed: the server's second object (R0); no collision added, Known limits S1 |
| explosion 0xc145 at the TargetBox: knockdown 4, no damage, radius 50 | script | native in the caster's game alone |
| effect shader 0x735e7 on the wall | script | R3, later |
| OnEffectFinish: Disable(fade) both, Wait 5, Delete all three | script | imposed: deleted 5 s after the cast's end (R0); the fade: H-SP4. Observed 2026-10-31 (x-raise-wall v5, 20261031-104852 and -105243): the two references survive the release disabled (deleted false 9 s after it) and the next cast re-uses them, re-enabled and raised again under the same ids, so no Delete shows; the server's copies still go 5 s after the cast's end |
| the failure effect: a message, no wall | record | native; the server waits 250 ms of open stream (REFUTED: WB_OcatosRecitalFail_Script shows a message and dispels nothing, apocrypha's read, LOG 2026-10-28 22:01 PDT, so the 250 ms gate narrows no failed cast; a wall where the caster's engine chose the no-room message is the declared v1 limit: Open questions, ADR-057, Known limits S2) |
| the collision: the mesh's Havok body (SKYL_ANIMSTATIC, MOPP), no navcut | mesh read | native: blocked, not re-pathed (READ 2026-10-31, x-raise-wall v5 113932: c2's 3 s walk at the wall stopped 46 units from its centre line, north of it; the body is thinner than the mesh's 104; was HYPOTHESIS until b-spell-placed-wall's claim 4, c2's walk stays north of y -250 (v3's line, derived from the server's band: the southmost north face a wall it accepts can have is -216) and c1's within 256 of its start, or x-raise-wall v2's cast-two walk holds; unrun, 204833 and 205817 died at c2's teleport before any cast and the frames since moved; the no-navcut re-pathing is the mod's own on every seat, not claimed) |

### Sequences and combinations (ADR-033)

| sequence or combination | probe or scenario | result |
| --- | --- | --- |
| hold again within a second: two sets for up to 5 s | x-raise-wall-rhythm | open |
| each hand; both; the perk's dual cast (one effect by the record, SPIT No Dual Cast Modification, apocrypha 22:03 PDT; HYPOTHESIS until x-raise-wall gains a both-hands cast step with one placement line and two forms, none today) | x-raise-wall | open |
| interrupted: a stagger or a sheathe ends the stream | x-raise-wall | open |
| both seats at each other | x-raise-wall-both | open |
| a late joiner; a relaunched caster (its skip off) | b-spell-placed-wall | open |

## Authority

Rung: R0 for the objects (created, posed and deleted by the server from the
accepted cast); the cast stays spell-cast's R1; rise, shader and fade R3.
Why this rung and not the one above it: none is above R0; the shapes say why
not R1 or the allowlist.
What the server validates: the cast (spell-cast's rules); no placement is
client-reported.
Rate limit / bounds: two sets per caster; maxS 120 against a stream that never
ends; 64 server-wide.

### Three shapes

A, client-reported placement (R1): the caster's game detects the script's
references (objectLoaded, EventHandler.cpp:945-968, or a cell scan), reports
{spell, base, pose}, the server validates and creates, and the caster's copies
are deleted or adopted. B, the
server's VM runs the script (ADR-029's allowlist): GetAngleZ
(NATIVES.md:1024), TranslateTo (:1139), Math.Sin, Math.Cos and TranslateToRef
missing, PlaceAtMe delegated (:1096) so no server object; an effect runtime
the VM lacks; a per-script blank the filter cannot express (ADR-044 admits,
never denies). C, the server places from a settings table at the accepted
cast start (the start and end are already its own); the caster's view skips
the copies it owns (an owner prop), the same pose by construction.

| | A | B | C |
| --- | --- | --- | --- |
| wire | a new C2S message, validator, caps | none | one optional prop on CreateActor |
| cost | 2 to 4 sessions (apocalypse-options.md:731) | 8 to 12 (:757) | about 2 |
| hole | trusts a client's pose; a round trip late | the engine's condition runs nowhere | the same condition: a wall where the caster's engine took the failure effect (the gate narrows it) |

C is the law's shape: the server owns STATE, the wire carries one DELTA, the
caster's engine keeps its SIMULATION, the mesh does the collision; the table
is data, not code. Recommended.

### Generality (apocrypha's corpus read, 2026-10-28)

40 of Apocalypse's 206 scripts call PlaceAtMe (docs/research/apocalypse/
placed-objects.md on apocrypha/alternate-start), in three families by anchor:
(1) caster-anchored, Raise Wall's shape: Raise Wall, Fabricate Object (a base
chosen in two menus on the caster's seat), Wind Running (three statics moved
under the caster every update); (2) hit-target anchored, the victim's position at the
hit: Tharn's Prison and Enter the Dungeon (cages with bodies, gone 2.5 s
after the finish), Banish Living (a container);
(3) impact anchored: Summoning Rune's marker and the explosion spawners
(Wellocs Instant Forest's trees). The rest is bodiless FX.

Each entry carries an anchor and its pose rule: `caster` (the accepted
cast's position and yaw), `hit-target` (the accepted hit's victim,
casts.rs:131 CastHit), `impact` (the server's explosion point for a
target-location effect). v1 ships Raise Wall alone. Not in v1: Fabricate
Object's menu choice travelling with the cast (a client-reported base id
validated against the spell's allowed list, R1); Wind Running's per-update
re-positioning (out of scope).

## Engine surface

- CommonLibSSE-NG symbols and Address Library IDs: none (C hooks nothing).
- Skyrim Platform intercepts no PlaceAtMe (grep 2026-10-28: comments only,
  FateApi.h:16, Fates.h:46; its hooks are two, Definitions.txt:1628-1629).
- The server's object path, PlaceAtMe's body: `new MpObjectReference(
  locationalData, callbacks, baseId, type)`, GenerateFormId, AddForm
  (PapyrusObjectReference.cpp:433-439; its degrees-as-radians TODO at :417-418
  bypassed). A subscriber gets CreateActor (PartOne.cpp:1067-1190; skymp.rs:1176-1200,
  MsgType 33) and
  DestroyActor (PartOne.cpp:1226-1237; skymp.rs:1058-1066, MsgType 25);
  Disable, Enable, Delete: MpObjectReference.cpp:551-575, :981-993; the change
  form MpChangeForms.h:77-92.
- The client's object path: a 0xff model with no reference spawns one by
  `player.placeAtMe(base, 1, true, true)` (formView.ts:281-304, :352), poses
  and enables it (spawnProcess.ts:18, :31; formView.ts:360-363). An MSTT or
  ACTI takes the same path; a placed MSTT's collision: :45's read
  (apocalypse-options.md:820).
- The casts: SpellCast MsgType 23 (skymp.rs:942-1001); StartCast
  (PartOne.cpp:3472, from ActionListener.cpp:4834, :4882), EndCast (:3481, from
  :4798); Casts::start, end, is_open (casts.rs:245, :287, :298; CastFacts :76-96);
  the yaw is the recorded angle.z (MpChangeForms.h:78).
- The server's VM instantiates scripts on references alone
  (MpObjectReference.cpp:2033), no ActiveMagicEffect class (NATIVES.md:46).

## Observe (host or acting client sees the intent before the engine acts)

- Hook point: none new; the cast's start and end.
- SP filter: none.
- Data captured: the caster's recorded position and yaw.
- Side effects of hooking here: none.

## Impose (observers render the server's decision)

- Mechanism: 250 ms after an accepted start of a listed spell, with the stream
  open, the server creates the entry's objects at x + 192 sin yaw,
  y + 192 cos yaw, z - 48 (the wall) and z (the halo); at the end, disconnect
  or cap, Disable now and Delete 5 s later.
- Visual without simulation achieved by: the wall at its final pose.
- Side effects: the client's disable-then-delete (formView.ts:462-500), a fade or
  a cut on the watcher: H-SP4; the collision: :45's read.

## Suppress (engine's own behavior blocked on non-hosts)

- What is suppressed: nothing. The caster's view skips a CreateActor whose
  placedBy is itself when this game's own reference of that base stands
  within 96 units of the pose (the mod's script's copy; Game.findClosest
  ReferenceOfType, the cleaner's protection 0 telling the game's own
  placement from the view's copies), retrying for 2 s to cover the script's
  half-second rise; when none stands there (a relaunch mid-set, the copy
  gone) it places the server's as any seat does (fork m3-spell-placed-client
  bb7cc946, built as this rule rather than the earlier draft's "cast open or
  ended under 6 s", which a relaunched caster would have failed).
- How: a check in formView's spawn path (ownPlacedCopyStands).
- Release condition: no own copy at the pose for 2 s.
- Side effects: the failure-effect divergence (Inventory). HYPOTHESIS, two
  reads: H-SP3, the script's fresh reference is found before its 3D loads,
  until x-raise-wall v2's or b-spell-placed-wall's claim 3 holds (c1's
  runtime_of 1 for both bases, the skip line 1 to 2 a cast); H-SP4, observers
  see a cut at the removal, not the mod's fade, until two c2 screenshots
  inside the linger (the hold's end + 0.5 s and + 3 s, added to x-raise-wall)
  are read by eye for a fade or a cut; both unrun (204833 and 205817 died at
  the teleport).

Known limits: S1, the TargetBox (FXEmptyActivator 0xb79ff) has no server copy,
and the halo's copy stands at the wall's XY inside the wall's own Havok body
(1088 by 104 by 262), so neither adds a collision any seat lacks; unread, moot
by geometry. S2, a cast the caster's engine refused with the no-room message
keeps its stream open, so the server may place a wall the caster never saw
(the fail script only shows a message); the knockdown explosion and the shader
are the caster's alone (ADR-057).

## Message contract

- Message name / numeric type: PlacedRequest (MsgType 61, wire id 69) and
  PlacedReport (MsgType 62, wire id 70), fork m3-wall-pose 23e334b9
  (SCHEMA_VERSION 22, 2026-10-31; shape A, D70 and D74). CreateActorProps
  keeps `placed_by: Option<u32>` (skymp.rs, SCHEMA_VERSION 20), the caster's
  server id; DestroyActor unchanged.
- Direction: PlacedRequest server to client, to the caster alone, reliable;
  PlacedReport client to server, reliable; CreateActor as before.
- Fields: PlacedRequest { set: u64 (the set's id the reports name), bases:
  [u32] (the entry's bases as form ids in the load order both ends share, 1
  to 8, none 0), windowMs: u32 (1 to 10,000; the rule's 6,000, 3,000 until 2026-10-31) }.
  PlacedReport { set: u64, base: u32 (never 0), pos: [f32; 3] (engine units,
  inside the world), yaw: f32 (degrees) }. placed_by: u32, nonzero, only with
  base_record_type MSTT or ACTI.
- Validator rules: check_placed_request (E_VAL_RANGE: no base, a base of 0, a
  window of 0 or over 10 s); check_placed_report (E_VAL_NONFINITE, E_VAL_RANGE
  on a base of 0, E_VAL_OUT_OF_WORLD; a budget of 8 then 2 a second,
  UNMEASURED); validate_server refuses placed_by's other pairings
  (E_VAL_RANGE). The rest is the server's rule (wire-rules placements
  report_placed): the set this caster's own request and still open (the
  window from the cast, the set's linger and maxS), the base one the set
  asked for and not yet reported, the pose 150 to 260 units from where the
  caster stood at the cast on the ground plane and within 256 of its height;
  refused by name in the log (E_PLACED_SET, E_PLACED_LATE, E_PLACED_BASE,
  E_PLACED_REPEAT, E_PLACED_NAN, E_PLACED_RANGE with the distance and the
  height).
- Idempotency / ordering: one report per base per set (a repeat is
  E_PLACED_REPEAT); a request dropped by a newer cast in the hand refuses its
  late reports (E_PLACED_SET); no report within the window places nothing
  ("nothing placed, the caster's game reported no base within the window").
- Contract doc updated: docs/WIRE.md, same commit (rule 4).

## Server

- Where the logic lives: wire-rules placements.rs (Rust, ADR-010): the table,
  the caps (judged at the cast, before any request), the request at the
  accepted cast, the report's judgment (the set, the base, the band, the
  window), each set's lifetime; PartOne wires StartCast and EndCast to it,
  sends the requests (SendPlacementRequests, one message a set to the
  caster's user), judges the reports (ReportPlacedObject, from
  ActionListener::OnPlacedReport; the base read as a FormDesc), creates each
  reported object at its reported pose (PlaceSpellObject, placedSets
  appended per report), disables and deletes the sets, and sweeps
  placedBySpell forms at load (no cast ledger survives a restart).
- The table: server setting spellPlacedObjects: `{spell:
  "00cc14:Apocalypse - Magic of Skyrim.esp", anchor: caster, objects: [{base:
  "098529:<same plugin>", type: MSTT}, {base: "0735e8:<same plugin>", type:
  ACTI}], lifetime: {whileHeld: true, lingerS: 5, maxS: 120}, perCaster: 2}`.
  Shape C's `forward` and `dz` on an object are read and ignored, so the
  deploy settings (restored to this entry with them, 2026-10-31) serve a
  server of either shape until the train merges.
- DB fields / migration: MpChangeFormREFR gains placedBySpell (FormDesc, absent
  reads none; rule 6); a-restart-persistence asserts no wall survives.
- Restart behavior: swept at load.
- Papyrus natives touched (ledger lines added): none.

## Client

- SP binding: none new (Game.findClosestReferenceOfType, the skip's own
  primitive).
- TS handler: services/services/spellPlacedService.ts answers a
  PlacedRequest (fork m3-wall-pose 866ff864): per base, the engine's own
  reference nearest the point 200 units ahead of the player along its yaw
  (radius 160; the view's copies, told by the cleaner's protection, and
  references disabled or deleted are skipped, an earlier cast's objects faded at its release; v4's rule, a reference reported for an earlier set skipped, lost every second cast, x-raise-wall v5), polled every 100 ms,
  reported once two reads agree within 0.5 units (the script's wall rises at
  512 units a second from 240 below) or at the window's deadline less a 500
  ms reply margin; a base never found is traced and dropped. formView.ts's
  spawn path reads placed_by and skips the server's copy while this game's
  own stands within 96 units, as before.
- Kill switch config key: spellPlacedObjects empty.

## Tests

- T0: placements.rs (shape A): the request at the cast with the entry's bases
  and the window, each report placed where reported, the refusals by name
  (another's set, another caster, a base off the entry, a repeat, the band's
  edges and beyond, not a number, late by the window, late by the linger and
  by maxS), a cast nobody reports noted, the caps judged before any request
  (a request awaiting its first report counts), a new stream in the hand
  replacing the request, linger and max, the caster's leaving; wire-validate:
  the two shapes and the report's budget, the property test; wire-json: the
  fixtures round trip (62 types); unit/SpellPlacedTest.cpp: the request to
  the caster alone, each report a CreateActor at the reported pose named to
  every subscriber (the caster's game included), the refusals placing
  nothing, a cast nobody reports placing nothing, a cast ended inside the
  window still taking its report with the set lingering from the end, the
  perCaster cap asking nothing further, the linger's DestroyActors, the
  leaving caster, the sweep at load.
- T1: none.
- T2: the fakeclient's smoke session unchanged (no report in it; a listed
  cast asks and places nothing, "nothing placed, the caster's game reported
  no base within the window"); a difftest session with a report is owed with
  the T3 green.
- T3 scenario id: lab/scenarios/b-spell-placed-wall.yaml, amended for shape A
  in its own commit after x-raise-wall v4's read: the server's request, two
  accepted reports and two "placed 1 form" lines a cast, no refusal; c2's
  copies where c1's own engine copies stand (c2's distance to the server's
  copy within 16 of c1's distance to its own, both from c2's position: c1
  reads through c2's figure's cell); one runtime reference of each base on
  each seat; c1's skip lines; the removal after the linger; the late joiner.
  Probe x-raise-wall v4 by path (sha1 960011fb): the same claims over two
  casts, the walk at the wall recorded and not claimed (the engine's heading
  at the cast is the open read).
- Assertions that would fail if the verb silently regressed: the claims above.

## Dynamic plan (fill when any tag above is still HYPOTHESIS)

- Frida script: none. Step 1 is the recorder's solo run
  (lab/references/raise-wall.json).
- Lab reads that clear the tags: the collision (the walks), the fade (screenshots),
  the fail script's dispel (apocrypha's read, then a cast
  with a wall under 300 units ahead); the pack-form fix (The cause at T3):
  b-spell-placed-wall's claim 2 on a seat with m3-sp-pack-form, and the seat's
  console log (lab's <client>-console.log) without "Bad call result 4" during
  the cast.
- Owner: agent.

## Status

- [x] doc complete, inventory listed with a disposition per row, rung declared (ticked 17:02 PDT 2026-10-29 by the pass: the Inventory's 23 rows each carry a disposition; Rung R0 for the objects, declared at the top)
- [x] engine surface cited or delegated
- [x] server logic + T0 (fork m3-spell-placed 5b951a9c: wire-rules placements.rs, PartOne's placement, removal and sweep, unit/SpellPlacedTest.cpp); shape A: placements.rs's request and report path, the bridge, PartOne's SendPlacementRequests and ReportPlacedObject, SpellPlacedTest rewritten, m3-wall-pose 69ca1221 and 7ac26664 (the local cargo tests green; the C++ T0 is pipeline 4115's)
- [x] message + validator (same commit: CreateActorProps.placed_by, SCHEMA_VERSION 20, check_create_actor, the fixture pair, CreateActorMessage.h); shape A: PlacedRequest and PlacedReport with their validator, fixtures and C++ structs, fork m3-wall-pose 23e334b9 (SCHEMA_VERSION 22, 2026-10-31)
- [x] native hook + T1 (none needed)
- [x] TS handler (fork m3-spell-placed-client bb7cc946: createActorMessage.ts widened, formView.ts ownPlacedCopyStands); shape A: spellPlacedService.ts and the two message types, m3-wall-pose 866ff864 (tsc green)
- [ ] T2 green (shape C's T0 green on 3k d7548ccf and on 3o-win ee44f7d1 and its T2 with the union 0e23c820; shape A's T0 and T2 are m3-wall-pose's pipeline and stage, 2026-10-31)
- [ ] T3 scenario green, no HYPOTHESIS tags (b-spell-placed-wall pending since D70 and amended for shape A after x-raise-wall v4's read at m3-wall-pose's stage)
- [ ] parity scenario green, or its later list reviewed with it (ADR-031)
- [ ] sequences and combinations green, every checklist item with its scenario (ADR-033)
- [ ] ledger and suppression registry updated

## Open questions

- Answered by apocrypha's read (2026-10-28): WB_OcatosRecitalFail_Script only
  shows a message (Message.Show), so a cast into a wall keeps the stream open
  with the fail effect and the server may place a wall the caster never saw
  (fn 518 GetVATSFrontAreaFree is the engine's); a listed v1 limit.
- Answered by apocrypha (22:03 PDT): a dual cast changes nothing (SPIT flag No Dual
  Cast Modification, one effect instance, one wall, the same constants); the
  MSTT's visual is 1470 wide, 102 thick, 262 tall with the origin on the
  base's centre line, its Havok body 1088 wide, 104 thick, 262 tall (the end
  caps have no collision, so the scenario's walker meets the wall within
  about 500 units of its centre line), 214 units stand above the caster's
  floor after the rise; nothing re-positions or scales the wall after the
  rise (no OnUpdate, no second TranslateToRef, no SetScale), so one pose
  suffices: caster + 192 along the yaw (x += 192 sin, y += 192 cos, Papyrus
  angles), Z - 48, rotation (0, 0, yaw); the glow at the same XY at the
  caster's Z.
- For Eli: ADR-029's open question, answered here as C, not an allowlist entry;
  whether the rise and shader earn a client slice; the caps.

## The pose model falls (D70, 14:00 PDT 2026-10-30; b-spell-placed-wall on the union 0e23c820)

RED three times, the cold rollback included (204953, 205125 relaunched, 205303 cold), on claim 3 alone: the caster's own MSTT, read
from the observer's figure, stood 262.13, 262.13 and 248.10 from c1 where the server's copy stands at 192 along the yaw (expected
173.95 in the claim's frame), so the two walls stand 75 to 88 units apart; the caster's engine wall sat 104 to 118 ahead of the caster
and moved 14 units between runs at the same stand. What holds: the server placed once per cast (set N placed 2 forms), the observer
has one runtime copy of each form (the MSTT at 178.75, the ACTI at 174.09; the CallNative fix of the morning). HYPOTHESIS, the read
before the fix: the script places the wall at the caster's aim point (its TargetBox translate), so the offset depends on the view's
pitch and the ground ahead, and no fixed step matches it. D70 takes B for the merge: spellPlacedObjects emptied in both deploy
settings (the kill switch, Client above), the scenario pending in lab/gate.yaml with this reason, playtest 39's item 8 a declared
limit (the other seat sees no wall). The fix is shape A (Three shapes above), the next train after the physics and rumor trains:
the caster's game reads the script's placed references (objectLoaded for the two bases within the cast's window, or a refs scan at
the TargetBox), reports {spell, base, pose} once per accepted cast; the server validates (the cast accepted and open, the pose
within 512 of the caster's record, one report per set, the bases those of the spell's table) and places the copies at the
reported pose; the table keeps the forms and the lifetime and loses the step. The Dynamic read first: x-raise-wall v4 with the
caster's pitch varied (level, 15 degrees down, 15 up) and the engine wall's distance read at each, which proves or falsifies the
aim hypothesis before the message is designed.

The Dynamic read is written (14:02 PDT 2026-10-30): x-raise-wall-pitch v1 by path (lab/.cache/probes, sha1 01176511; 47 steps, loads
through lab-api's load_scenario): x-raise-wall v3's frame with the server's table empty, c1 casting three 10 s holds, level, about
15 degrees down (mouse dy 200 with the wake) and about 15 up (dy -400), its own refs-near inside each hold reading the engine
wall's distance (recorded in the step's readings, asserted only present), the server's placement line absent. The same distance
within 16 at the three pitches falsifies the aim hypothesis and sends the fix to the script's own placement rule (lab/esm.py on
the effect's VMAD, then the Papyrus source if Apocalypse ships it); a distance that follows the pitch confirms it and the message
of shape A carries the pose. Runs at the physics train's stage, beside its probes.

The Dynamic read's answer (19:36 PDT 2026-10-30; x-raise-wall-pitch v1 20261031-023141 GREEN on the physics stage, the table empty): the
caster's own MSTT 0x1A098529 at 206.25 from the caster and the ACTI 0x1A0735E8 at 196.875 at level, after 200 counts down and after 400
counts up alike; "set N placed" 0 each time; no E_ACTIVATE_REACH. The engine places Raise Wall at a fixed distance along the caster,
not at the aim: the aim hypothesis is falsified. What the sweep measured (the engine's wall 248 to 262 from a watcher 366 behind the
caster, where a wall 206 ahead along north would read 160) is the caster's heading at the cast against the record's yaw, about
42 degrees by the law of cosines (HYPOTHESIS until a heading read: the teleport's rot and the look step set the actor's yaw as the
record carries it, the first-person view may face elsewhere, the lab's walkers drift 20 degrees the same way). Shape A is the fix
regardless: the caster reports the pose the engine chose, the server validates it against the caster's record (distance 150 to 260,
the measured 206 with the caster's own motion inside the cast's window; the bases those of the spell's table; one report per accepted
cast; reach from the caster) and places the copies there, the table keeping the forms and the lifetime. Shape C with 206.25 along the
record's yaw would place along a heading the engine did not use. The train after the guest-loot train.

## Shape A built (00:15 PDT 2026-10-31; fork m3-wall-pose 23e334b9, 69ca1221, 866ff864, 7ac26664, off parity dc3ec679)

The handshake (D74): at the accepted cast of a listed spell the server asks the caster's game for the entry's bases (PlacedRequest:
the set's id, the bases as form ids, the window of 6 s: 3 s until 2026-10-31) and the caster's game answers once per base when the reference has settled
(PlacedReport: set, base, pos, yaw); the server judges each report (the set its own request to this caster and still open, the base
asked for once, the pose 150 to 260 units from where the caster stood at the cast on the ground plane and within 256 of its height:
the pitch read's 206.25 and 196.875 with the caster's own motion inside the window) and places that base where reported, so the
other seat's copy stands where the caster saw the wall. No report within the window places nothing (the engine's no-room failure,
or no reference found), logged. The caps are judged at the cast, a request awaiting its first report counting as held. The table
keeps the forms and the lifetime; its forward and dz are read and ignored so the lab's one settings file (the entry restored in
both deploy files, 2026-10-31) serves a shape C server (parity until the merge, which places D70's known-wrong wall meanwhile) and
a shape A server alike. The client's search is the skip's own primitive, Game.findClosestReferenceOfType, centred 200 units ahead
of the player along its yaw with a radius of 160, the view's copies and earlier sets' references skipped; settled means two 100 ms
reads within 0.5 units.

HYPOTHESIS, cleared by x-raise-wall v4 (960011fb) at the train's stage: (1) the request lands after the script's reference exists
(the effect starts at the cast's event, the request one round trip later), so the first poll finds it; (2) the settle test catches
the wall's rise (about 50 units a read while rising) and reports once it stops; (3) the band holds the engine's own placement at the
lab's stands (the pitch read's two numbers, level ground); (4) the caster's skip still finds its own copy within 96 of the server's
pose (trivially now, the poses agree). Limits by name: a second cast from the same stand and heading inside the first set's life
skips the first set's references and may find nothing new if the engine stacked the walls (the engine's own no-room check refuses
most of these); a wall the engine placed outside the band is refused by name (E_PLACED_RANGE with the numbers), a finding for turbo 2
rather than a silent miss. The scenario's amendment (its own commit, rule 13): the fixed-step formula leaves and the copy's distance
is claimed against the caster's own engine copy, the server's lines become the request, two accepted reports and two "placed 1 form"
lines a cast; no tolerance loosened.

x-raise-wall v5 (88877000) read at a08787b5's stage (04:05 PDT 2026-10-31; runs 20261031-104852 cold and -105243 relaunched, both
red at the second cast with three "placed 1 form" lines, not four): the first cast held every claim (the request, two accepted
reports, two forms placed where reported, c2's distances equal to c1's own copies', one runtime reference of each base on both
seats, the skip lines, the removal), so HYPOTHESIS (1) to (4) above are cleared. The second cast showed the engine's real
behaviour: the script keeps the SAME two references across casts. At the first release both stand disabled (c1's listing 9 s
after it: ff0009bf and ff00097c, disabled true, deleted false, at their poses); at the second cast they are re-enabled and the wall
raised again under the same ids, and nothing new is created (c1's listing 4 s into cast two: exactly those two ids, at 206.25 and
196.875 from the caster). a08787b5's search skipped a reported reference standing within 8 units of where it was reported, so the
halo (back at the exact pose) was never reported and the wall was found only once it had moved, mid-rise, 2.5 s after the request,
and went out unsettled at the deadline (z 14596 and 14600 against the settled 14629: 29 to 33 low). The fix (m3-wall-pose
b36d93aa, its bridge test 0e4b34e5): eligibility is disabled-or-deleted, never reported-before (a disabled reference is the earlier cast's object faded at its
release; a re-enabled one is this cast's), and REPORT_WINDOW_MS is 6,000 (the wall began its rise about 2.3 s after the request on
both runs, which a 3 s window less the 500 ms reply margin cannot settle). HYPOTHESIS until v5 reruns on the fix: the second cast
reports both bases settled inside the window, the server's copies for set 1 stand where c1's re-raised wall stands, and no
unsettled line. Noted for the checklist, not a claim: the caster's wall fades at the release while the other seat's copy lingers
the table's 5 s (lingerS, the deploy entry); the mod's Delete never runs, so the linger is the only end the other seat sees.

x-raise-wall v5 GREEN on 0e4b34e5 (04:44 PDT 2026-10-31, run 20261031-113932, 59 steps, every claim held): both casts request, report
and place the same way (the ACTI reported 0.33 s after the request, the MSTT 1.2 s, cast two exactly as cast one, so the 2.3 s of the
red runs was the old skip's artifact and the 6 s window is headroom), cast two re-using cast one's references (c1's ff0008e7 and
ff0008b6 both times) at the same settled pose (z 14677 and 14629), the server's copies ff000002/3 then ff000004/5 at that pose,
c2's distances 178.125 and 187.5 equal to c1's own copies' from c2's position, one runtime reference of each base on each seat, no
unsettled line, both sets removed at their linger. The walk: c2 (W held 3 s from y 0) stopped at y -114 in lab-spawn's frame with
the wall's centre line at -160 (c1's -366 plus the reported 206.25), 46 units from the centre line, so the collision row's HYPOTHESIS
reads blocked (the stop sits inside the 104 the mesh read gave the body, so the Havok body is thinner than the mesh's extent, about
24 units with the capsule's 35; recorded, nothing claimed on the thickness). The scenario's shape A amendment (its own commit) claims
the walk north of -250 as derived from the band. Open: nothing on the mechanism; T3 is the gate's run of the amended scenario.
