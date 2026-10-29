# Verb: marksman

## Intent

A player's arrow flies on every screen, from the archer toward where the
archer aimed, and the server takes an arrow's hit only from a shot it
recorded, with the bow's and the arrow's damage.

Roadmap reference: skymp ROADMAP.md "Marksman" ("The arrow must have the
correct initial speed, fly out from where it is needed... The server must
remove 1 arrow after each shot") and "Damage" ("Remove incorrect range
check for shooting").
Milestone: M2, its first verb (docs/PLAN.md, the M2 chart)   Class: B

### Sequences and combinations (ADR-033)

| sequence or combination | probe or scenario | result |
| --- | --- | --- |
| the arrow's path on both screens: the shooter's own arrow against its figure's, launch by launch, first and third person, level and angled | x-arrow-path (ten shots, five per view, the recorder's `launches` on both seats; lab/driver d734e3f) | open: on parity the figure's arrow leaves its fire node along the aim (playtest nineteen's third session: "ever so slightly to the right"); fork m2-arrow-path launches it at the shooter's own origin and angles; the bound a parity scenario asserts follows x-arrow-path's reading |
| a bow shot after a long run of spells (both hands, the perk's dual cast, Invisibility) | none yet | open: playtest nineteen's third session, the arrows were there (eight of eleven hit in both games) but the lab's b-marksman starts from a drawn bow |

## Authority

Rung: R1. The shooter's game computes the shot and the arrow's flight; the
server validates the shot and each hit.
Why not R0: the flight is the engine's (draw, gravity, the world's
collision); the server has neither a projectile model nor collision, and we
reimplement only what needs validation (CLAUDE.md).
What the server validates:
- the shot: the sender's own player; the bow its recorded equipment holds;
  an arrow it holds, one removed (as now); draw power within 0 to 1; no
  faster than its bow can be drawn again (the bound measured in the lab);
- each ranged hit: a recorded, unused shot of the same aggressor and bow
  within the arrow's flight time, one hit per shot, the target no farther
  than the arrow can have flown since the shot (the arrow's projectile
  record, PROJ, read from the masters);
- the damage: the server's, the bow's and the arrow's together (ADR-028,
  proposed).
- the launch (fork m2-arrow-path; Eli, 2026-10-15: the arrow's path
  identical on both screens): when the shot carries its launch, the origin
  within 512 units of the server's own position of the shooter (a shot
  launched from elsewhere is refused, E_SHOT_ORIGIN), the pitch within a
  quarter turn, every component finite and bounded (the validator).
What it records unvalidated (R2): the aim and the launch's angles, relayed
for drawing only (where a player looked is its own; a forged angle
misleads only the picture, the hit is still the server's to judge).
Rate limit / bounds: shots by the draw time; hits one per shot; OnHit gets
a rate budget (none today).

## Engine surface

- The shot: the engine's TESPlayerBowShotEvent (CommonLibSSE-NG
  include/RE/T/TESPlayerBowShotEvent.h:5-13: weapon, ammo, shotPower,
  isSunGazing), which Skyrim Platform sends as `playerBowShot`
  (skyrim-platform EventHandler.cpp:1074-1111), the player's own shots
  only. Crossbows are found from their animations
  (skymp5-client playerBowShotService.ts).
- The aim: Actor::GetAimAngle and GetAimHeading (include/RE/A/Actor.h:527,
  :528), which Skyrim Platform already reads for a spell cast
  (EventHandler.cpp:1403-1404).
- The launch in an observer's game: Projectile::LaunchArrow(result,
  shooter, ammo, weapon, origin, angles) (include/RE/P/Projectile.h:238;
  src/RE/P/Projectile.cpp:290-294) over Projectile::Launch
  (Projectile.cpp:255-258, its Address Library IDs as CommonLib names
  them). Its four-argument form takes the origin from the shooter's weapon
  node, or the magic node for a crossbow (Projectile.cpp:296-322). LaunchData
  carries the draw's power and noDamageOutsideCombat (Projectile.h:67-111).
  Skyrim Platform's spell launch is the pattern: LaunchData from the
  caster's aim angle and heading, then Projectile::Launch
  (skyrim-platform MagicApi.cpp). Papyrus Weapon.Fire (codegen
  skyrimPlatform.ts:3362) fires along a reference's heading with no pitch,
  so it is not used.
- An observer's figure deals no weapon damage in that observer's game
  (skymp5-client formView.ts:288, attackDamageMult 0). HYPOTHESIS until the lab:
  that the same holds for the figure's arrows.
- The draw's power, read by the re-analyst on 2026-10-09 (the 1.6.1170
  code is encrypted in the Ghidra project, so the bodies were read in
  1.7.104 under the same Address Library IDs, as
  ghidra/notes/coc-1-7-104.md did; the settings' defaults were read in
  1.6.1170's own data):
  - The power: the player's bow branch of Projectile::Launch (ID 44108)
    takes the release's held time (ID 40780) and computes it (ID 26435):
    fArrowMinPower (0.35) for a release before fArrowBowMinTime (0.8 s),
    then rising linearly to 1.0 at fBowDrawTime (1.6667 s), that span
    divided by the bow's speed (DNAM) times WeaponSpeedMult (ID 26417).
    CONFIRMED by the lab's shot logs: a 0.6 s hold reports 0.35, a 2 s
    hold 1.00 (x-b-marksman 20261009-233002).
  - The damage: inside that branch only, the power multiplies the damage
    the arrow carries (Projectile +0x1A0 on 1.6.1170) once: damage =
    power x ((bow + arrow) x fDamageWeaponMult + temper) x skill
    multiplier, before armor and perks (ID 26410); the hit (ID 44002)
    reads the carried damage and never the power. The server's TES5
    formula takes the bow's and the arrow's damage, and the claimed
    shot's power is its factor. CONFIRMED by the engine's own damage, read
    on the figure in the shooter's game for the frame before the server's
    number arrives (the driver's watch, thuum 24a1018): 12.06 at a full
    draw and 4.19 at 0.35, twice each (x-bow-damage 20261010-075635,
    x-bow-damage2 20261010-081840), a ratio of 0.347. The server's TES5
    formula gives 12.992 for the same full-draw hit, the game 12.06: the
    formula's fidelity (armor, skill) is its own question, not this
    verb's; the power factor matches.
  - The speed: PROJ speed x a power factor (fArrowMinVelocity, 0.2, at
    fArrowMinPower, rising linearly to 1.0) x a bow factor (at most 1) x
    speedMult (ID 44139), plus the player's own horizontal speed at
    launch (ID 44184). Launch copies LaunchData's power only for a spell:
    an arrow keeps its constructor's 1.0 (ID 44100). CONFIRMED in part
    by the lab: a half draw's arrow flew 1437 units in the shooter's game
    and 5539 from its figure in the observer's (x-b-marksman), so
    TESModPlatform.LaunchArrow now sets the projectile's power after
    Launch (the speed is set on the first update, ID 44122); b-marksman
    asserts the two landings agree.
- The arrow's projectile, read from the lab's 1.6.1170 masters with
  lab/esm.py's walker (2026-10-09; the layouts are UESP's, "Skyrim
  Mod:Mod File Format/AMMO" and ".../PROJ": AMMO DATA projectile, flags,
  damage, value, weight; PROJ DATA flags and type, then gravity, speed,
  range): IronArrow 0x1397D damage 8, SteelArrow 0x1397F 10, DaedricArrow
  0x139C0 24, each with its own projectile (ArrowIronProjectile 0x3BE11 and
  its kin) at speed 3600 units a second, gravity 0.35, range 60000;
  Dawnguard's DLC1BoltSteel damage 10, its projectile at speed 5400. All
  four projectiles carry type 0x40, UESP's Arrow, a check on the reading.
  One faster arrow exists (every AMMO record of the five masters with its
  projectile, scanned with lab/esm.py's walker on 2026-10-10):
  Skyrim.esm's MQ101SteelArrow 0x00105EE7, damage 10, flagged playable
  (DATA flags 0x4, non-bolt only), its MQ101ArrowSteelProjectile 0x00105EE6
  at 15000. The server's bound (below) takes 5400, so a hit with that arrow
  beyond about 5800 units, where 15000 outruns 8100 a second with the
  resend's 300 ms and the slack, is refused. Known gap; the fix is each
  shot's own speed from its arrow's records (AMMO DATA's projectile, then
  PROJ DATA's speed, which libespm reads since fork m2-spell 46c6558a),
  with 5400 for an arrow whose records say nothing.
  libespm reads neither record yet. Whether a bow scales its arrow's speed,
  and how the draw's power does: HYPOTHESIS until the lab, so the server's
  range bound takes the projectile's speed with a margin (straight-line
  distance never exceeds the arc's length, speed times the time flown).

- Eli's quirk (2026-10-09, playtest twelve): "players other than my
  rotfern race could shoot arrows ... but rotfern could only draw the bow,
  but never fire". x-bow-race-probe 20261009-203814, from his saved world
  on fork m1-tcl: rotfern (c1, Long Bow 0x3B562, iron arrows) and the Nord
  (c2, the same bow equipped by console) each drew for 2 s and released;
  both games spent one arrow (22 to 21, so the engine fired its bow-shot
  event for both), the Nord's arrow sits in the pillar it was aimed at
  (its screenshot), and nothing shows where rotfern aimed, a pillar a few
  steps ahead. Her race (rotfern.esp 0x0200AA00) is playable, not a
  child, with the vanilla behavior graph and a kids skeleton from
  Ranaline's (skeletonkids.nif, skeleton_female_kids.nif), which carries
  every weapon, bow and quiver node by name. HYPOTHESIS, one of: the
  draw's power reaching her game near zero (the arrow dropping at her
  feet), the arrow launched from a node inside her own collision, or
  flying off her aim. The verb's shot log (power, aim) and a look for the
  landed arrow settle it; if it is the skeleton, the fix is the mod's
  (apocrypha's).
  On fork m2-marksman (x-bow-race-probe 20261009-224055, rerun
  20261009-225305, both from his world): her shot reaches the server at
  full draw, `power 1.00, aim 0.152 heading 1.598` both times (the
  Nord's `power 1.00, aim 0.000`), so the draw's power is ruled out; her
  WeaponSpeedMult (0) and BowSpeedBonus (1) are the Nord's. After her
  shot her own game holds an iron arrow projectile somewhere within 6000
  units (the driver's projectiles step found one, ff000c13), yet none in
  the pillar a few steps ahead where she aimed, while the Nord's game
  shows two arrows side by side in that pillar (his screenshot, zoomed),
  one of them his own and the other, by its place, the one her figure
  launched there (ArrowShot). HYPOTHESIS then: her first-person arrow
  leaves from where adult first-person arms put the bow, ahead of a
  child's camera, so close geometry is already behind it and it flies
  on; her figure's third-person launch hits the pillar.
  x-bow-race-probe3 20261009-233324 measured it (the projectiles step's
  distance to the nearest iron arrow): her first-person shot lay 484
  units from her in her own game, her figure's 203 from the figure in the
  Nord's game, and after F (DirectInput 33, Toggle POV on the clones; her
  screenshot shows the third-person camera) her third-person shot lay 234
  from her: both third-person launches stop at the pillar about 200 units
  away, the first-person one flies past it. That is a finding about where
  a released arrow goes, not the quirk: Eli (2026-10-10) saw her bow stay
  drawn in first person, the release never happening, which no lab run
  reproduced (every one fired, with the attack on the clones' Home key
  through SKSE Input.HoldKey, where Eli uses the mouse through Moonlight;
  and rotfern has only played test 1's seat, the Nord test 2's). The
  quirk's cause is open: playtest thirteen's arrows section separates the
  mouse, the Home key and third person on her seat. The first-person
  launch point past the pillar stays a question of its own (the node, or
  the camera; a Frida read of Projectile::Launch's origin, the
  re-analyst's plan, 2026-10-09).

## Observe (host or acting client sees the intent before the engine acts)

- Hook point: Skyrim Platform's `playerBowShot`, and the crossbow's
  animation detection already in playerBowShotService.ts.
- SP filter: n/a (the event is the player's own shot).
- Data captured: bow, arrow, draw power, sun-gazing flag, and the aim angle
  and heading read when the shot fires (new).
- Side effects of hooking here: none expected (the event is read, nothing
  blocked).

## Impose (observers render the server's decision)

- Mechanism: the server sends each neighbour of the shooter the shot
  (reliable); the observer's game launches the figure's arrow where the
  shooter's own left: the shooter's client reads its own engine's launch
  (the fork's projectileLaunched event: a Frida hook on Projectile::Launch,
  CommonLibSSE-NG src/RE/P/Projectile.cpp:255-258, reading the LaunchData's
  origin, angleX, angleZ and power at entry, include/RE/P/Projectile.h:
  78-107) and sends it with the shot (has_launch, origin, launch angles);
  the observer launches through TESModPlatform.LaunchArrowAt with that
  origin and those angles (LaunchData's useOrigin set by its constructor),
  so the engine's own physics flies one path from one point on both
  screens. A shot without its launch (the event late or missing) falls back
  to LaunchArrow: the origin at the figure's fire node and the angles the
  shooter's aim, which is what playtest nineteen's third session saw as
  arrows leaving the figure's hand "ever so slightly to the right" of where
  the shooter's own flew (eight of eleven struck the same object in both
  games, 22 to 43 ms apart; the recording playtest-19-3). The angles come
  from the arrow's first update, not from Launch's entry (fork m2-arrow-path
  13a58aed): the re-analyst on sky-re (2026-10-16, 1.6.1170, HYPOTHESIS until
  x-arrow-path) read the player's release path as arrowRelease, the
  ArrowReleaseHandler (42859), 18102 (origin at the weapon node, angles from
  the view less f1PArrowTiltUpAngle or f3PArrowTiltUpAngle), Launch 44108
  with autoAim set; the player's arrow then takes its final angles on its
  first update (Init 44222, 44200, the player's auto-aim 41248), and
  InitVelocity 44184 sets its velocity from them. The fork hooks 44184
  (projectileFlight) for the player's and the figures' arrows, and the shot
  sends the launch's origin with the flight's angles. Launch with useOrigin
  starts an arrow where it is told (the constructor applies the origin and
  both angles; useOrigin only sets a flag, and Init's snap to the magic node
  needs a spell); what the replay does not carry: the strafing shooter's own
  velocity, which 44184 adds for the player only, and NPCs' random spread
  (fBowNPCSpreadAngle in 18102), which a direct Launch never runs. The draw's
  power changes speed and drop alike (44184, 43698), and the shot carries
  it.
- The draw and the release: the relayed animation events, as now. The
  sender keeps one animation event per update (skymp5-client animation.ts),
  so a draw and its release in one update can collapse; the lab watches for
  it.
- Side effects: HYPOTHESIS (the arrow sticking where it lands, its sound).

## Suppress (engine's own behavior blocked on non-hosts)

- What is suppressed: the damage of a figure's arrow in the observer's
  game (attackDamageMult 0 on figures, HYPOTHESIS for arrows), and its hit
  report there (skymp5-client hitService.ts drops hits by figures the game
  does not host). The shooter's game reports the hit, as for melee. And
  the figure's own arrow: a figure wears its quiver, so its bow releasing
  in the observer's game launches an arrow of its own beside the relayed
  one; Skyrim Platform's launch hook drops it (The quiver, below).
- How: as above for the damage. For the figure's own arrow, Skyrim
  Platform's Frida listener on Projectile::Launch (44108): a figure's arrow
  launched outside TESModPlatform's RelayedArrowScope enters with
  LaunchData's projectileBase cleared (CommonLibSSE-NG
  include/RE/P/Projectile.h:83) and leaves with it put back.
- Release condition: none (a figure is never this game's to simulate).

## Message contract

- PlayerBowShot (MsgType 22, client to server): adds aim_angle (f32,
  radians, within plus or minus a quarter turn) and aim_heading (f32,
  finite). Sent reliable (wire-schema skymp.rs:737-758;
  playerBowShotService.ts sends it reliable).
- A new message, server to client: the shot as the neighbours draw it (the
  shooter's server id, bow, arrow, power, aim angle, aim heading).
- Both gain the launch (fork m2-arrow-path, one commit with the validator):
  has_launch (bool), origin_x, origin_y, origin_z (f32, world units),
  launch_angle_x (f32, the pitch the shooter's engine launched with,
  radians) and launch_angle_z (f32, its heading); when has_launch is false
  the five are zero. Validator: when has_launch, the pitch within a quarter
  turn and each origin component within 1e6 in magnitude; when not, all
  five exactly zero; the server then checks the origin against its own
  position of the shooter (512 units).
- Validator rules: finite values, power within 0 to 1, the aim's bounds, a
  shot budget per second; OnHit gets a budget too.
- Idempotency / ordering: a shot is not idempotent (one arrow each);
  reliable and ordered.
- Contract doc updated: in the same commit as the validator.

## Server

- Where the logic lives: a Rust rule (wire-rules, ADR-020), each actor's
  recent shots: a shot recorded, a hit claiming one within its flight
  (the newest unused shot of that weapon within 17 s whose arrow, at 5400
  units a second and half again, can have reached the target, with 256
  units of slack and one resend's 300 ms on the time: a lost shot is
  resent while its hit waits behind it on the client's ordered channel,
  so the two arrive together; a hit within about 2700 units never waits
  on time); ActionListener::OnPlayerBowShot checks the equipment and the arrow, takes
  the arrow, records the shot and relays it; OnHit with a bow claims a shot
  or is refused (logged E_HIT_NO_SHOT, E_HIT_RANGE). The damage formula
  adds the arrow's damage (TES5DamageFormula counts the bow's only today).
- With it, as the first damage verb: the victim's health as a percentage of
  its recorded maximum, not its race's base health
  (ActionListener.cpp:1822-1843 against MpActor.cpp:1924-1939).
- DB fields / migration: none (shots are runtime state).
- Restart behavior: none.
- Papyrus natives touched: none (Weapon.Fire stays missing, its ledger line
  saying why).

## Client

- SP binding: the new arrow launch native (T1: none; the lab is its proof).
- TS handler: playerBowShotService.ts (reliable, with the aim);
  arrowSyncService.ts (the relayed shot to the native, on the next
  update).
- Kill switch config key: `arrowSync` under skymp5-client's settings.

## Tests

- T0: wire-rules (a hit with no shot refused; one hit per shot; a hit past
  the flight refused; the range bound); the server (a shot with the bow and
  arrow held relayed to a neighbour and one arrow removed; a shot without
  them refused; a bow hit with the arrow's damage; the health percentage
  against the recorded maximum).
- T1: none.
- T2: a difftest session, a shot then its hit: the legacy server relays
  nothing; declared.
- T3 scenario id: lab/scenarios/b-marksman.yaml: c1 shoots c2 at some
  hundreds of units; c2's game holds an arrow launched by c1's figure near
  where it landed; c2 takes the server's damage, bow and arrow, once; c1
  holds one arrow fewer on the server.
- Assertions that would fail if the verb silently regressed: the arrow in
  c2's game, c2's health against the server's number, c1's arrow count.

## Dynamic plan (fill when any tag above is still HYPOTHESIS)

- Probe x-marksman-probe: c1 shoots c2 on the current build, then on the
  verb's: whether c2's game shows any arrow, c2's health on both sides
  (an arrow that hurt in c2's own game would leave c2 below the server's
  number), the shot's power at a full and a half draw.
- Owner: agent.

## Status

Built on fork branch m2-marksman, stacked on m1-tcl (2026-10-09):
019ea488 the ranged rule (wire-rules ranged, bridged as RangedShots);
75869a44 the wire (PlayerBowShot's aim, ArrowShot MsgType 42, schema 11,
the validator's bounds and the shot and OnHit budgets, both ends' messages,
Skyrim Platform's shot event with the aim); 281dc18b the server (the shot
taken only from the held bow and arrow, recorded and relayed; a player's
ranged hit claiming a shot or refused; the arrow's damage in the TES5
formula, libespm's AMMO damage; a hit counted against the recorded
maximum health); e7c4a88d TESModPlatform.LaunchArrow and the client's
ArrowSyncService; c4553748 CI runs the server build on m2-* branches;
347643f3 MarksmanTest's includes (pipeline 1113 failed to compile it);
9a376816 the rule's delivery skew, and MarksmanTest counting arrows
against the shooter's own (pipeline 1115 failed three cases: its base
starts with 23 iron arrows, and its hit 300 units off in no time is the
resent shot's case); 451b2c34 the difftest session marksman; 50d4c391 the
server logs each weapon hit's damage at info; 333b2f8f a hit counts at its
shot's draw power (the ranged rule keeps it, OnWeaponHit takes it as the
damage's factor); 5bc11086 LaunchArrow gives the figure's arrow the
shooter's power; 7be31a9d a hit claims the newest shot its arrow can have
come from (b-marksman 20261010-082114: a half draw's hit claimed an older
full-draw shot that had missed, and counted full).

Lab (2026-10-09, the client from Windows run 37995524437 on 9a376816):
x-marksman-probe 20261009-224923: c1's shot reached the server at full
draw, its arrow taken (33 to 32 in c1's game), the hit 100 ms later
claimed with no refusal and a fight begun; c2's game read 0.9151 health
after it (the lab Nord's armor in the formula). The level shot east (the
teleport's pitch never reaches the aim: `aim 0.000`) left an iron arrow
projectile in each game, c1's own and, in c2's game, the one c1's figure
launched (ArrowShot, TESModPlatform.LaunchArrow). Papyrus aborts
GetPositionX on a projectile reference ("Bad call result 4"), so the
driver's projectiles step measures distance by narrowing its search
(thuum b6a8650). The probe's first run (20261009-223804) lost c2's game
after its load (no actor value report, no answer for 60 s); the rerun
was clean: a watch item.

Playtest thirteen (2026-10-11, Eli, parity f828279f): an arrow's damage
held as built (13.7 at a full draw, 4.79 at a tap, once per shot, one
arrow spent). Two findings:
- Only the target's screen shows two arrows per shot. The server took one
  shot and one hit per release, and the target's game launches one arrow
  per ArrowShot (arrowSyncService.ts; TESModPlatform.LaunchArrow launches
  one projectile, PapyrusTESModPlatform.cpp). HYPOTHESIS: the second is the
  figure's own bow, firing from the shooter's relayed animation with the
  bow and arrows the equipment relay gives it (skymp5-client gives a
  figure 1000 of its worn arrows, sync/equipment.ts). x-double-arrow
  20261012-022022: SKSE's Cell.GetNumRefs counts no projectile in either
  game (0 before and after a shot the server took), so it cannot count
  them; c2's game played only bowAttackStart on the shooter's figure (no
  release event is relayed), so a figure's own arrow would be the engine
  finishing that attack by itself. CONFIRMED by x-double-arrow2
  Read on 2026-10-20 (train-29's refs-near step): SKSE's Cell.GetNumRefs
  and GetNthRef filter on the BASE form's type (skse64 PapyrusCell.cpp:25,
  :46), and the arrows step asks for the reference class 0x40 PARW, which
  no base form has, so it always answers 0; a count of arrows in flight
  wants PROJ 50 (every projectile) filtered by base id. Train-30, thuum
  main 2026-10-20: the step asks for 0x32 PROJ, so it counts every
  projectile standing in the cell; one base's presence stays the
  projectiles step's question (Game.FindClosestReferenceOfType), since
  Papyrus reads nothing of a projectile reference.
  20261012-022726 with lab/frida/launch-trace.js on the target: for one
  shot the server took, the target's game called Projectile::Launch twice,
  once from the engine alone (the figure's bow) and once through
  SkyrimPlatformImpl.dll (LaunchArrow). Fix on fork m2-teleport 4198fe78:
  a figure holds no arrows (sync/equipment.ts), so its bow draws empty and
  only the relayed arrow, with the shooter's aim and draw, flies.
  CONFIRMED by x-double-arrow2 20261012-071438 on m2-teleport 0ef4df4d
  (the fix merged with parity): for c1's full-draw shot, c2's game called
  Projectile::Launch once, through SkyrimPlatformImpl.dll (LaunchArrow),
  and the engine launched nothing of its own. Playtest fourteen checks it
  on a person's screen.
- rotfern still never fires with the mouse on test 1's seat ("draws, no
  arrow in hand, no fire", first and third person): her game reported no
  shot all session, while the server records her iron arrows worn and her
  melee hits came through. From that saved world the lab's Home key fired
  her bow twice at full draw (x-bow-race-probe4 20261012-004212: arrows 72,
  71, 70; power 1.00), so her race and character fire; the probe's
  left-mouse step proves nothing (SKSE's HoldKey on a mouse button does
  nothing, run 20261003-115633, the reason the clones bind the attack to
  Home). Open: the mouse on her seat. Playtest fourteen: arrows equipped by
  hand first, and the Home key (fn+Left on a Mac keyboard).

- [x] doc complete, rung declared
- [x] engine surface cited or delegated (two HYPOTHESIS tags for the lab:
      a figure's arrow harmless in the observer's game, the draw's power;
      Eli's rotfern quirk narrowed to her first-person launch point)
- [x] server logic + T0 (MarksmanTest, the formula's arrow test; fork
      pipeline 1116 green, 2026-10-09)
- [x] message + validator (same commit, 75869a44)
- [x] native hook + T1: TESModPlatform.LaunchArrow (T1 none; the lab)
- [x] TS handler (ArrowSyncService, playerBowShotService's aim)
- [x] T2 green: `just test-proto m2-marksman` (2026-10-09 16:23, the
      difftest artifact of fork 451b2c34, job 4682): all 17 sessions
      identical up to their declarations, the marksman session with its
      ten (the ArrowShot relay, the hit with the arrow's damage, the second
      hit and the unheld bow's shot refused)
- [x] T3 scenario green, no HYPOTHESIS tags: b-marksman (thuum 773716b,
      awaiting Eli's review) green twice on fork 7be31a9d (runs
      20261010-084704 and -084949); the two engine HYPOTHESIS tags cleared
      (a figure's arrow deals nothing in the observer's game, x-b-marksman
      20261009-233002; the draw's power, x-bow-damage and x-bow-damage2).
      Merged 2026-10-10: the sweep on 7be31a9d went 31 of 31 green with no
      rerun (runs 20261010-090810 to -102926), fork parity fast-forwarded to
      7be31a9d and both clones' clean-m1 promoted
- [x] ledger and suppression registry updated: TESModPlatform.LaunchArrow
      in NATIVES.md, client only, R3 (the arrow is that game's picture of
      a shot the server took); no server native

## Playtest fourteen (2026-10-12, Eli, parity ef3fb03c)

- Held: one arrow per shot on the target's screen (test 2 shooting test 1),
  the figure drawing its bow empty and the arrow appearing as it looses.
- rotfern's bow fires on test 1 now, its arrows equipped by hand: five
  full-draw shots the server recorded (22:42:45 to 22:42:58, power 1.00)
  and later hits for 13.24 unblocked and 6.43 on a raised shield (blocked
  share 0.502). Thirteen's no-fire stays unexplained (the arrows not
  equipped is the likely reading); closed unless it comes back.

## The quiver (Eli, 2026-10-17)

"arrow appearance was never fixed. on player 2's screen rotfern still has
no arrows." Playtest thirteen's fix (4198fe78) gave a figure no arrows, so
its bow drew empty and only the relayed arrow flew; it also took the
figure's quiver and its nocked arrow off every other screen.

Fix on fork m2-quiver 5207d2e8 (in train m2-train-23): a figure wears its
quiver again, 1000 of the shooter's worn ammo as upstream gave it
(skymp5-client sync/equipment.ts). Its own arrow is dropped in Skyrim
Platform instead of never existing: TESModPlatform.LaunchArrow and
LaunchArrowAt open a RelayedArrowScope around their Projectile::Launch
call (FridaHooks.h), and the launch hook clears LaunchData's projectileBase
for any other arrow a figure launches, puts it back at the leave, logs "a
figure's own arrow dropped" and reports nothing (nothing flew).
- CONFIRMED by x-quiver 20261018-001041 (m2-train-23's stage): Launch builds
  nothing for a LaunchData with no projectile and its caller takes the empty
  handle. c2.log has five "a figure's own arrow dropped" lines, one per shot;
  c2's game launched five iron arrows for c1's figure against c1's five (not
  ten), every flight paired at 0.0 units and 0.0 degrees, and no game was
  lost. (The re-analyst's static read of 44108 never finished.)
- CONFIRMED by the same run's screenshots: the figure wears its quiver,
  arrows up behind its head (017, from behind), and after the five shots its
  bowstring is empty (039): the nocked arrow leaves the bow at the release
  though the launch built none.


## Playtest thirty-two's tenth arrow (2026-10-22)

rotfern (test 1; the Long Bow 0x3B562 and iron arrows 0x1397D, both picked
up in the world) shot Embershard's bandits on parity fb6f3f09: shots
accepted from 01:51:56.180 to 01:52:16.080 UTC (eight stamps in the log
read, "OnPlayerBowShot - ff000000 shot 1397d from 3b562"), the headshot
kill of 39fe4 among them at 01:52:11.449. The next, at 01:52:19.646, was
refused E_SHOT_EQUIPMENT ("shot 1397d from 3b562, which its equipment does
not hold") and its hit 0.36 s later E_HIT_NO_SHOT at 907 units: an arrow
that flew and struck in her game and did nothing (a player-visible wrong
outcome, open). No equipment or inventory line for ff000000 lies between
the last accepted shot and the refusal, and an accepted UpdateEquipment is
not logged (ActionListener::OnUpdateEquipment warns on refusals alone), so
the record of her equipment can have been replaced silently in those 3.5 s
by a snapshot with the bow or the arrows not worn. Candidates, unmeasured:
(a) a snapshot taken while the engine moved the ammo's worn mark between
stacks as the count fell (getInventory reads worn from isEquipped and the
entry's ExtraWorn); (b) the record's arrows running out ahead of the game's
(RemoveItem per accepted shot, SendInventoryUpdate after each) and the
engine's unequip of an empty quiver reaching the server as the next release
was already in flight. The read: a probe (x-quiver-dry) shooting a
twelve-arrow quiver dry at 2 s intervals with the server's equipment record
dumped after each shot and the client's UpdateEquipment sends logged, on a
train that logs accepted equipment updates at debug. A row of marksman's
until then.

## Playtest 37's refused volleys (finding 45, 2026-10-28; fork m3-hands d902d919)

Eli: "i just had a moment where headshots didnt work." The server: 32 E_SHOT_EQUIPMENT refusals in one evening,
ten in a row at 01:14:55Z to 01:15:32Z while rotfern swapped Flames and the bow, two more after a relaunch. The
cause, read in the handlers: OnUpdateEquipment refused a WHOLE report for one bad entry (an item the server
inventory lacked, 64b3f five times in two seconds; a spell slot not learned) and sent UnequipItem for every newly
worn item of that report, the bow included, so the record's hands froze at the pre-swap state; and after a relaunch
the client's onLoadGame sends the engine's hands 3 s after the load ("Currently only armor is equipped after
relogging", sendInputsService.ts), which writes the record's hands without the bow until the next equip event. The
fix on m3-hands d902d919, server-only: OnPlayerBowShot judges a bow or arrow the hands lack by the INVENTORY (a count
of at least one accepts, logged "hands stale: shot from <bow> accepted on the inventory" once per shooter per 10 s;
a bow or arrow the inventory lacks is E_SHOT_NO_BOW or E_SHOT_NO_ARROW; E_SHOT_EQUIPMENT retired, b-npc-archer's
claim renamed in its own commit); OnHit's shot gate reads the inventory the same way; OnUpdateEquipment drops each
bad entry of a PLAYER's report, logs it, corrects that entry alone (UnequipItem, RemoveSpell or RemoveShout,
SendInventoryUpdate) and keeps the rest (a hosted actor's report keeps npc-stream slice 3's whole refusal, its own
decision with scenarios on it). T0: MarksmanTest's stale-hands, no-bow and no-arrow cases;
PartOne_UpdateEquipmentTest's unknown-spell and missing-item cases. Open (Eli: "this also needs fixing"): the
client re-equips only armor after a relaunch, so the weapons in the hands wait for the player's first draw; a seat's
engine behaviour, a probe before its fix (the record's hands applied as worn at the login's first update).

## Train 53 (2026-10-26, fork m3-npc-cast 78cec009; docs/verbs/npc-stream.md slice 6)

The shot names its shooter (PlayerBowShot's idx, SCHEMA_VERSION 18) so a
hosted NPC's shot travels the same path as a player's: the host's game
reports the actor's launch under the actor's idx, OnPlayerBowShot's hosted
branch checks the bow against the record's hands and records the shot under
the actor's id (its quiver is the engine's, E_SHOT_QUIVER recorded when the
record holds no arrow), OnHit's shot claim runs for every shooter, and the
native launch rule lets the player's and a simulated actor's arrow fly while
a figure's or a puppet's own arrow is dropped outside a RelayedArrowScope.
Found and fixed in the same hunk: the relay loop through GetActorToSendTo
sent a host near a player's shot one ArrowShot per NPC it hosted among the
shooter's listeners; the loop is now every listener with a user but the
sender. The scenario b-marksman stays as it is; b-npc-archer (train 53's)
reads the hosted shot.
