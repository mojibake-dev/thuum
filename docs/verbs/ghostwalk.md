# Verb: ghostwalk

## Intent

A player casts Apocalypse's Ghostwalk: 10 s invisible, then back where the
cast was made. The mod's own script runs in the caster's game, and the server
takes the return jump instead of sending the player back.

Roadmap reference: none (Eli's stretch mods, docs/MODS.md "Apocalypse -
Magic of Skyrim"; docs/PLAN.md M2 item 10, ADR-029's first verb).
Milestone: M2   Class: B

## Inventory (ADR-031: the action's consequences, before its rung)

From the records (read from the 10.2.3 plugin, Engine surface) and the two
scripts as compiled (WB_Ghostwalk_Script and the ability's WB_inviseyefix,
disassembled 2026-10-14 over lab/pex.py's instruction model, and
independently by apocrypha the same day, instruction for instruction the
same).
The reference trace (the recorder in a solo client run with the layer,
lab/references/ghostwalk.json) is step 1 of the Dynamic plan and may add
rows.

| consequence | seen in | disposition |
| --- | --- | --- |
| the Self cast's hand animation, its casting art and its magicka cost | record (SPEL 0300AAE8: Illusion, fire-and-forget, Self, cost 450) | native in the caster's game; the cast is spell-cast's (R1), relayed so the figure plays it |
| the caster invisible for 10 s, with the effect's hit art (MGEF 0300AAE5, archetype 11) | record | imposed: the server runs it as a state (self-cast's archetype 11, R0); native in the caster's game; on the figure by the relayed Self cast, its name hidden (fork m2-flight f3569b95) |
| OnEffectStart: the caster's X, Y, Z (properties of akTarget, the caster of a Self spell) and GetCurrentLocation recorded in the script | script | native in the caster's game: the filter passes an effect the player bears (ADR-029 A1, test 1) |
| OnEffectFinish: Utility.Wait(WB_Wait, 0.4 s); the location check (IsSameLocation, else HasCommonParent) short-circuited by WB_CheckLocation False, so the return always runs; SetPosition(X, Y, Z) back to the cast point | script | native in the caster's game; the server takes the move as a permitted return (R1, Server) |
| the return's sound (Sound.Play of SOUN 030207BF, its descriptor SNDR 030207BE, at the caster) and visual (VisualEffect.Play of RFCT 030207C1 on the caster for WB_TriggerVFXDur, 3 s) | script | native in the caster's game; later on other screens: the figure's script is blanked there (Suppress) |
| image spaces on the caster's screen (IMAD 030207BA, the effect's; 030207BC, applied at the return) | record, script | native (R3: the caster's screen only) |
| a detection event at the return (CreateDetectionEvent from the caster, strength 75 less half the caster's Illusion, at least 5) | script | native in the caster's game; later: other games' NPCs hear nothing (NPC hosting, M3) |
| the eyes-fix ability (SPEL 030CB7E1, AddSpell, silent, after the return): its WB_inviseyefix checks each second and, once its bearer's weapon is sheathed, calls QueueNiNodeUpdate and removes itself (RemoveSpell) | script | native in the caster's game; HYPOTHESIS that the server never records it (a script's AddSpell and RemoveSpell in the player's game, unreported); a transient, so nothing to persist |
| the failure message (MESG 0300AAE6), shown only when the location check fails with WB_CheckLocation True | script | never shown with this VMAD (unreachable) |
| a caster who changed cells during the effect: SetPosition (not MoveTo) puts it at the cast's coordinates in its current cell | script | later: the server permits the return in the cast's cell or worldspace only, so there the move is judged as any other (sent back if the budget refuses it); a rare edge, named here for the parity list |
| the effect ended early by the caster's own attack or cast: the same OnEffectFinish, the 0.4 s wait included (the script has no other end handler) | engine (self-cast's HYPOTHESIS), script | native, and the server's self-cast ends its state; the script returns the caster then, the permit's window opening at the cast |

## Authority

Rung: R1 for where the caster ends up; R0 for the invisibility (self-cast).
- The caster's game computes the return: the mod's script records the cast
  point and moves the caster back. The server validates the move against
  the cast it recorded (spell-cast): the spell is one the server names as a
  return, the caster had it equipped, the landing is within a slack of the
  caster's position at the cast, in the same cell or worldspace, and it
  comes within the effect's duration plus the script's wait plus a slack,
  once per cast.
Why this rung and not the one above it: R0 would mean the server's VM runs
WB_Ghostwalk_Script, which is ADR-029's allowlist and the effect runtime it
pays for at its first entry (5 to 8 sessions, docs/apocalypse-options.md
5.2, B1), while the script touches nothing but its caster. The server knows
the cast point already, so R1 bounds the one state that matters to others.
What the server validates (R1): the above; a move that fails it is judged
as any other move (movement-speed's budget), and sent back if the budget
refuses it.
Rate limit / bounds: one return per recorded cast; spell-cast's bounds on
casts; the slack is wire-rules casts::RANGE_SLACK (256 units) for the
positions' age.

## Engine surface

- The records (Apocalypse - Magic of Skyrim.esp 10.2.3, the archive's md5
  as docs/MODS.md's; read 2026-10-14 with lab/esm.py, the fields by UESP's
  "Skyrim Mod:Mod File Format" SPEL, MGEF and VMAD layouts; ids with the
  plugin's own index 03, which the server names as a FormDesc, the local id
  and the plugin's name):
  - SPEL 0300AAE8 WB_Ill_Invis4_Spell_Ghostwalk, "Ghostwalk": cost 450,
    charge 0.5 s, fire-and-forget, Self, one effect for 10 s.
  - MGEF 0300AAE5 WB_Ill_Invis4_Effect_Ghostwalk: Illusion (actor value
    21), archetype 11, Invisibility, on actor value 54, Invisibility
    (CommonLibSSE-NG include/RE/E/EffectArchetypes.h:21,
    include/RE/A/ActorValues.h:29, :62); casting art 0311CC2D, hit art
    0311CC2F, image space 030207BA. Its description: "Caster is invisible
    for <dur> seconds or until broken, then teleports back to where the
    spell was cast."
  - Its VMAD: WB_Ghostwalk_Script (OnEffectStart, 8 instructions;
    OnEffectFinish, 34; lab/pex.py dump), with WB_Wait 0.4,
    WB_CheckLocation False, WB_TriggerVFXDur 3.0, WB_DetectionSoundBase
    75.0 and WB_DetectionSoundMult 0.5, the return's image space 030207BC,
    visual 030207C1 and marker script 030207BF, FXEmptyActivator 000B79FF,
    a failure message 0300AAE6, and the ability
    WB_S_I000_InvisFix_Spell_Ab_PC.
  - That ability: SPEL 030CB7E1 WB_Ill_Invis4_Spell_Ghostwalk_InvisFix
    (type 4, an ability), MGEF 030CB7E0 (archetype 1, Script) carrying
    WB_inviseyefix with itself as its InvisibilityEyesFixSpell property: by
    its names, the fix for an invisible actor's eyes, which removes itself
    (INFERRED; its body unread).
  - The bodies: Inventory (the compiled scripts, read 2026-10-14).
- The scripts' calls, all in the caster's game (none on the server's VM):
  WB_Ghostwalk_Script's Utility.Wait, GetCurrentLocation,
  Location.IsSameLocation and HasCommonParent, SetPosition, Sound.Play,
  VisualEffect.Play, ImageSpaceModifier.Apply, GetActorValue,
  CreateDetectionEvent, Message.Show (unreachable) and AddSpell;
  WB_inviseyefix's IsWeaponDrawn, Actor.QueueNiNodeUpdate (SKSE, a visual
  refresh), RemoveSpell and RegisterForSingleUpdate. The script has no
  OnUpdate, so a blanked OnEffectStart leaves nothing running; the
  FXEmptyActivator property is unused by its functions.
- The filter that lets the script run: skyrim-platform FridaHooks.cpp
  OnSendEventEnter, the effect test (fork m2-flight 05192845, :44-70): an
  event on an ActiveEffect (VM type id, caster and target: CommonLibSSE-NG
  include/RE/A/ActiveEffect.h:31, :100, :104) whose target is the player's
  MagicTarget or whose caster is the player passes. Ghostwalk's caster and
  target are both the caster. OnUpdate passes for every script.
- The cast the server records: ActionListener::OnSpellCast records it with
  the caster's position (PartOne::StartCast) and relays it.
- The move: MovementValidation::Validate (skymp5-server
  MovementValidation.cpp) sends a player back for a move into another cell
  or worldspace, of 4096 units or more, or beyond the ground budget
  (wire-rules movement.rs: MAX_SPEED 660 units a second, BURST 2048),
  unless a permitted jump takes it: COC's (Budgets::permit_jump) and
  cast-teleport's cast jump (docs/verbs/cast-teleport.md, Server). A
  return under the budget passes as is; one past it (a sprint for 10 s
  covers more than 2048) needs the permit.
- What a neighbour sees: the figure invisible by the relayed Self cast
  (self-cast), then the return by the movement relay, a TranslateTo over
  0.2 s in the same cell (skymp5-client sync/movementApply.ts): a dash, not
  the caster's blink.

## Observe (host or acting client sees the intent before the engine acts)

- Hook point: none new. The cast reaches the server as spell-cast's
  SpellCast; the return as the caster's next movement report.
- SP filter: spell-cast's.
- Data captured: the spell, the hand, the caster's position at the cast
  (the server's own record).
- Side effects of hooking here: none new.

## Impose (observers render the server's decision)

- Mechanism: the relayed Self cast (the figure's invisibility) and the
  movement relay of the return the server took.
- Visual without simulation achieved by: the figure's TranslateTo; the
  return's sound and visual are not shown to others (Inventory, later).
- Side effects: HYPOTHESIS that the relayed cast's effect on the figure in
  an observer's game is blanked by the filter (the figure is its caster and
  target, the observer's player neither), so no observer's game runs the
  return on the figure or on its own player. x-ghostwalk-relay reads it.

## Suppress (engine's own behavior blocked on non-hosts)

- What is suppressed: the script on the figure in every other game.
- How: the filter's blank, as today for an effect between two figures; no
  new code.
- Release condition: none.
- Side effects: as Impose's HYPOTHESIS.

## Message contract

- No new message: SpellCast in, movement in and relayed, as now.
- Validator rules: unchanged.
- Idempotency / ordering: one permit per cast, consumed by its landing; a
  later cast replaces it.
- Contract doc updated: no change.

## Server

- Where the logic lives:
  - which spells move their caster: cast-teleport's setting, castTeleports
    (wire-rules teleports.rs), one list for both, its entries gaining two
    optional fields: waitMs, how long the jump is permitted after the cast
    (CAST_JUMP_WAIT_MS, 5 s, when absent), and relay, whether the cast is
    still relayed (false when absent, cast-teleport's suppression).
    Ghostwalk's entry: reach 0 (back to the cast point, within
    CAST_JUMP_SLACK, 256 units), waitMs 15400 (the effect's 10 s, the
    script's 0.4 s and CAST_JUMP_WAIT_MS for the report), relay true (the
    figure's invisibility is self-cast's, and the script is blanked on the
    figure). The records cannot say "teleports" or "returns".
  - the permit: wire-rules movement's cast jump as it is, its wait taken
    from the entry. It opens at the cast, because the caster's own attack
    ends the effect early and the script returns the caster then; while it
    waits, a move that is not the return is judged as any other.
  - the cast: ActionListener::OnSpellCast, for a named spell the caster has
    equipped, records the cast as now, permits the jump, and relays it if
    the entry says so.
  - the check: MovementValidation's permitted-jump path, as COC's and
    cast-teleport's.
- DB fields / migration: none (a permit is runtime; a login or a restart
  starts without one).
- Restart behavior: none. HYPOTHESIS: a caster who logs out while
  invisible logs in where it stood (the script's state ends with the
  game).
- Papyrus natives touched (ledger lines added): none on the server; the
  mod's script runs in the caster's game.

## Client

- SP binding: none new; the filter's effect test (fork m2-flight).
- TS handler: none new; Apocalypse 10.2.3 in every client's mod layer and
  the server's load order (lab/tools/persist-mods.sh, Dynamic plan step 0).
- Kill switch config key: the setting itself (no castTeleports entry, no
  permit).

## Tests

- T0: wire-rules teleports (an entry's waitMs and relay read, absent ones
  defaulted, a wait that is no positive number refused); wire-rules
  movement (a jump with a reach of 0 lands once within the slack of the
  cast point in its cell or worldspace; refused away from it, in another
  cell, after its own wait, a second time); the server (OnSpellCast of an
  entry with relay true permits the jump and relays the cast; cast-teleport's
  entries unchanged).
- T1: none.
- T2: a difftest session, ghostwalk: c1 adds itself the spell (the
  console's AddSpell), equips it, casts, walks 3000 units away within the
  budget over the window, and reports the cast point: the wire stack takes
  it; the same return without a cast is sent back. Needs Apocalypse in the
  T2 server's load order.
- T3 scenario id: lab/scenarios/b-ghostwalk.yaml: c1 learns Ghostwalk,
  equips it, casts it, walks away for about 8 s; after the effect ends, c1
  is back at the cast point on the server and in its own game, and stays
  there five seconds later; during the effect c2's figure of c1 is
  invisible (the figure's Invisibility above 0) and c2 has not moved itself.
- Assertions that would fail if the verb silently regressed: c1's server
  position after the effect (at the cast point, held: fails with the
  script blanked, or with the server sending c1 back); c2's own position
  unchanged (fails if a relayed cast ran the return in c2's game).
- Parity: p-ghostwalk against the reference, its later list the
  Inventory's later rows (the return's sound, visual and detection event on
  other screens; the Eye Fix ability's record).

## Dynamic plan (fill when any tag above is still HYPOTHESIS)

- Step 0: the Apocalypse layer on the lab (a thuum branch, as Lost
  Grimoire's: persist-mods fetches 10.2.3, Nexus 1090 file 758998, md5
  26fa3eb013175c09d12b5b52d5df09ac, its ESP appended to the server's load
  order and each clone's, its two BSAs beside it; `just deploy-srv`,
  `just client-mods 711` and `712`, stacked snapshots), after a playtest
  that needs the world as it is. The archive is in lab/.cache/mods
  already (fetched 2026-10-10, md5 checked 2026-10-14): the plugin and
  "Apocalypse - Magic of Skyrim.bsa" and "... - Textures.bsa".
- Step 1, the reference: c1 alone casts Ghostwalk under the recorder,
  walks away, and is returned; the trace is lab/references/ghostwalk.json.
- Step 2, x-ghostwalk-relay on parity with the layer: c1 casts at c2's
  side and walks away; read whether the script ran in c1's game (c1
  returned), whether the server took the return or sent c1 back, whether
  c2's figure of c1 went invisible, and whether c2 moved.
- Expected: c1 returned in its own game; a short walk passes on the budget,
  a long one is sent back until the permit lands; c2 unmoved.
- Owner: agent.

## Built

- Server, fork m2-ghostwalk f43d1f91 (from parity 05192845): wire-rules
  teleports reads an entry's waitMs and relay, movement's cast jump takes
  its wait from the entry, the bridge and PartOne pass both, OnSpellCast
  relays a teleport its entry relays. T0 green 2026-10-14: wire-rules (the
  entry's fields; a return within the slack of the cast point within its
  own wait) and the bridge locally, with clippy; fork pipeline 1479's
  server build ran ctest on the master files, 13 of 13, CastTeleportTest's
  relayed return among test_unit's 357 cases.
- Settings: thuum branch ghostwalk 65cb4c8, Ghostwalk's castTeleports entry
  in both settings files, stacked on branch apocalypse (the layer). It
  deploys only with a server that has m2-ghostwalk: parity's teleports.rs
  refuses unknown fields, and a refused entry stops the server at start.
- Drafts in the session's scratchpad until their first runs: the difftest
  session ghostwalk, the reference r-ghostwalk, the probe x-ghostwalk-relay
  and b-ghostwalk.

## Status

- [ ] doc complete, inventory listed with a disposition per row, rung declared
- [x] engine surface cited or delegated
- [x] server logic + T0
- [ ] message + validator (same commit)
- [ ] native hook + T1
- [ ] TS handler
- [ ] T2 green
- [ ] T3 scenario green, no HYPOTHESIS tags
- [ ] parity scenario green, or its later list reviewed with it (ADR-031)
- [ ] ledger and suppression registry updated
