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

## Inventory (ADR-031: the action's consequences, before its rung)

From WB_FabricateWall_Script and the records (apocrypha's read, 2026-10-28;
the census row 0300CC14). A Self concentration (castType 2, delivery 0), 8
magicka a second; MGEF 0x9852e (archetype Script, condition
GetVATSFrontAreaFree >= 300) carries the script, MGEF 0x9852f the failure
message, one per cast; OnEffectStart and OnEffectFinish only.

| consequence | seen in | disposition |
| --- | --- | --- |
| the stream: art, loop, cost | record | native; relayed by spell-cast (R1) |
| TargetBox, FXEmptyActivator 0xb79ff, the translate target | script | suppressed: no server copy (HYPOTHESIS: no collision) |
| the wall, MSTT 0x98529: placed disabled 192 forward and 288 down at the caster's yaw, enabled, translated up 240 to the TargetBox | script | imposed: the server's object at the final pose (R0); the rise R3, later |
| the halo, ACTI 0x735e8, at the TargetBox's XY, the caster's height | script | imposed: the server's second object (R0); HYPOTHESIS: no collision |
| explosion 0xc145 at the TargetBox: knockdown 4, no damage, radius 50 | script | native in the caster's game alone |
| effect shader 0x735e7 on the wall | script | R3, later |
| OnEffectFinish: Disable(fade) both, Wait 5, Delete all three | script | imposed: deleted 5 s after the cast's end (R0); the fade HYPOTHESIS |
| the failure effect: a message, no wall | record | native; the server waits 250 ms of open stream (HYPOTHESIS: its script dispels) |
| the collision: the mesh's Havok body (SKYL_ANIMSTATIC, MOPP), no navcut | mesh read | native: blocked, not re-pathed (HYPOTHESIS) |

### Sequences and combinations (ADR-033)

| sequence or combination | probe or scenario | result |
| --- | --- | --- |
| hold again within a second: two sets for up to 5 s | x-raise-wall-rhythm | open |
| each hand; both; the perk's dual cast (one effect, HYPOTHESIS) | x-raise-wall | open |
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
  ACTI takes the same path; HYPOTHESIS: a placed MSTT keeps its collision
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
- Side effects: HYPOTHESIS: the client's disable-then-delete (formView.ts:462-500)
  fades; HYPOTHESIS: the collision.

## Suppress (engine's own behavior blocked on non-hosts)

- What is suppressed: nothing. The caster's view skips a CreateActor whose
  placed_by is itself while its cast of that spell is open or ended under 6 s
  ago; after a relaunch it places the server's.
- How: a check in formView's spawn path.
- Release condition: the window above.
- Side effects: the failure-effect divergence (Inventory).

## Message contract

- Message name / numeric type: none new. CreateActorProps (skymp.rs:213)
  gains `placed_by: Option<u32>`, the caster's server id;
  DestroyActor unchanged.
- Direction: server to client.
- Fields: placed_by: u32, nonzero, only with base_record_type MSTT or ACTI.
- Validator rules: validate_server (wire-validate lib.rs:730) refuses the rest
  (E_VAL_RANGE).
- Idempotency / ordering: CreateActor's.
- Contract doc updated: docs/WIRE.md, same commit (rule 4).

## Server

- Where the logic lives: wire-rules placements.rs (Rust, ADR-010): the table,
  the pose per anchor, the caps, the gate, each set's lifetime; PartOne wires
  StartCast and EndCast to it, creates, disables and deletes the forms, and
  sweeps placedBySpell forms at load (no cast ledger survives a
  restart).
- The table: server setting spellPlacedObjects: `{spell:
  "00cc14:Apocalypse - Magic of Skyrim.esp", anchor: caster, objects: [{base:
  "098529:<same plugin>", type: MSTT, forward: 192, dz: -48}, {base:
  "0735e8:<same plugin>", type: ACTI, forward: 192, dz: 0}], lifetime:
  {whileHeld: true, lingerS: 5, maxS: 120}, perCaster: 2}`.
- DB fields / migration: MpChangeFormREFR gains placedBySpell (FormDesc, absent
  reads none; rule 6); a-restart-persistence asserts no wall survives.
- Restart behavior: swept at load.
- Papyrus natives touched (ledger lines added): none.

## Client

- SP binding: none new.
- TS handler: formView.ts's spawn path reads placed_by and skips; optional, a
  translateTo from 288 below for the rise.
- Kill switch config key: spellPlacedObjects empty.

## Tests

- T0: placements.rs: the pose at four yaws; gate, linger, caps, sweep.
  PartOne: a start creates two 0xff forms, an end deletes them 5 s later, a
  load sweeps them; wire-validate refuses placed_by zero.
- T1: none.
- T2: a fakeclient casts; a second in the square gets two CreateActors (MSTT
  and ACTI, placed_by the caster) within 1 s and two DestroyActors within 5 s
  plus slack of the interrupt; a restart mid-stream leaves no form.
- T3 scenario id: lab/scenarios/b-spell-placed-wall.yaml. c1 faces c2 400
  units away, learns and equips the spell, hold-key 199 for 12 s. Claims: c2's refs-near (the MSTT base type, radius
  1000) has the wall within 2 s and within 16 units of c1's read; c1 walking
  into it (hold-key 17, 3 s, about 900 units unblocked)
  stays within 256 of its start; c2 walking at it stays on its side; after the
  release neither base within 7 s on either seat; c2 relaunched
  (docs/LAB.md:556) during a 20 s hold has it after login. Probe
  x-raise-wall: one seat, the cast and reads.
- Assertions that would fail if the verb silently regressed: the claims above.

## Dynamic plan (fill when any tag above is still HYPOTHESIS)

- Frida script: none. Step 1 is the recorder's solo run
  (lab/references/raise-wall.json).
- Lab reads that clear the tags: the collision (the walks), the fade (screenshots),
  the fail script's dispel (apocrypha's read, then a cast
  with a wall under 300 units ahead).
- Owner: agent.

## Status

- [ ] doc complete, inventory listed with a disposition per row, rung declared
- [x] engine surface cited or delegated
- [ ] server logic + T0
- [ ] message + validator (same commit)
- [ ] native hook + T1 (none)
- [ ] TS handler
- [ ] T2 green
- [ ] T3 scenario green, no HYPOTHESIS tags
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
