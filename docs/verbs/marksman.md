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
What it records unvalidated (R2): the aim, relayed for drawing only (where
a player looked is its own; a forged aim misleads only the picture).
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
- HYPOTHESIS until the lab: how the game scales an arrow's damage and
  speed by the draw's power.
- The arrow's projectile, read from the lab's 1.6.1170 masters with
  lab/esm.py's walker (2026-10-09; the layouts are UESP's, "Skyrim
  Mod:Mod File Format/AMMO" and ".../PROJ": AMMO DATA projectile, flags,
  damage, value, weight; PROJ DATA flags and type, then gravity, speed,
  range): IronArrow 0x1397D damage 8, SteelArrow 0x1397F 10, DaedricArrow
  0x139C0 24, each with its own projectile (ArrowIronProjectile 0x3BE11 and
  its kin) at speed 3600 units a second, gravity 0.35, range 60000;
  Dawnguard's DLC1BoltSteel damage 10, its projectile at speed 5400. All
  four projectiles carry type 0x40, UESP's Arrow, a check on the reading.
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
  (reliable); the observer's game launches the arrow from the shooter's
  figure with LaunchArrow, the origin at the figure's fire node and the
  angles the shooter's aim, through a new Skyrim Platform native beside
  MagicApi's spell launch.
- The draw and the release: the relayed animation events, as now. The
  sender keeps one animation event per update (skymp5-client animation.ts),
  so a draw and its release in one update can collapse; the lab watches for
  it.
- Side effects: HYPOTHESIS (the arrow sticking where it lands, its sound).

## Suppress (engine's own behavior blocked on non-hosts)

- What is suppressed: the damage of a figure's arrow in the observer's
  game (attackDamageMult 0 on figures, HYPOTHESIS for arrows), and its hit
  report there (skymp5-client hitService.ts drops hits by figures the game
  does not host). The shooter's game reports the hit, as for melee.
- How: as above, nothing new unless the lab shows the arrow hurting.
- Release condition: none.

## Message contract

- PlayerBowShot (MsgType 22, client to server): adds aim_angle (f32,
  radians, within plus or minus a quarter turn) and aim_heading (f32,
  finite). Sent reliable, as the contract already says
  (wire-schema skymp.rs:735); the client sends it unreliable today.
- A new message, server to client: the shot as the neighbours draw it (the
  shooter's server id, bow, arrow, power, aim angle, aim heading).
- Validator rules: finite values, power within 0 to 1, the aim's bounds, a
  shot budget per second; OnHit gets a budget too.
- Idempotency / ordering: a shot is not idempotent (one arrow each);
  reliable and ordered.
- Contract doc updated: in the same commit as the validator.

## Server

- Where the logic lives: a Rust rule (wire-rules, ADR-020), each actor's
  recent shots: a shot recorded, a hit claiming one within its flight;
  ActionListener::OnPlayerBowShot checks the equipment and the arrow, takes
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
  remoteServer.ts (the relayed shot to the native).
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
ArrowSyncService; c4553748 CI runs the server build on m2-* branches.

- [x] doc complete, rung declared
- [x] engine surface cited or delegated (two HYPOTHESIS tags for the lab:
      a figure's arrow harmless in the observer's game, the draw's power;
      Eli's rotfern quirk to settle with the shot log)
- [ ] server logic + T0 (MarksmanTest, the formula's arrow test; fork
      pipeline 1113)
- [x] message + validator (same commit, 75869a44)
- [x] native hook + T1: TESModPlatform.LaunchArrow (T1 none; the lab)
- [x] TS handler (ArrowSyncService, playerBowShotService's aim)
- [ ] T2 green
- [ ] T3 scenario green, no HYPOTHESIS tags (x-marksman-probe, then
      b-marksman)
- [ ] ledger and suppression registry updated (TESModPlatform.LaunchArrow
      is the client's, no server native: nothing for NATIVES.md)
