# Verb: push

## Intent

A spell or shout whose effect pushes its target (Unrelenting Force's third
word, the werewolf's knockback and howls, the shield charge, Dawnguard's
reflecting shield, Dragonborn's spectral dragon: every effect that carries
VoicePushEffectScript) throws a player the way the game throws an NPC: a
ragdoll, away from the caster, up again after. The server decides the hit;
the target's own game plays the throw from the vanilla script. Nothing of it
is rebuilt. This is ADR-031's first verb.

Roadmap reference: skymp/ROADMAP.md "Anims triggered by enemy" ("Usually in
PvP. Stagger, random dodge animation, sprint collision reaction") and
"Shouts" ("Iteratively test and add more and more shouts")
Milestone: M2 (docs/PLAN.md M2 item 6, Unrelenting Force's ragdoll throw)
Class: B

## Inventory (ADR-031: the action's consequences, before its rung)

The records half is read (2026-10-13, scratchpad mgef-inv.py on sky-srv, by
UESP's MGEF and PROJ layouts; the script by the re-analyst on sky-re with
lab/pex.py). The trace half waits for the references (r-shout-uf3, A and B,
after playtest sixteen): its rows are named here and their dispositions
follow the trace.

Skyrim.esm VoiceUnrelentingForce3 (SPEL 0x13F3A, the third word; the first
two words' spells carry no push):

| consequence | seen in | disposition |
| --- | --- | --- |
| the throw: VoicePushEffectScript on MGEF 0x7F82F (PushForce 15), OnEffectStart: Caster.PushActorAway(Target, 15) | record (VMAD, the .pex) | native: the target's game runs the script on its own effect, ADR-029's A1 filter opening for it (2fe894e1), once the effect is no longer dispelled at the hit (4e8aa04c) |
| the stagger: VoiceUnrelentingForceEffect03 and Effect02 (MGEF 0x7F82F, 0x7F82E), archetype 33, magnitude 1.5 each | record | native in the target's game, now that the cast's effects run there (4e8aa04c); the server's PlayStagger (fork 4a4c80e1) still imposes one, to retire when the trace shows the engine's own |
| the damage: UnspecifiedDamageFFAimed (MGEF 0xEA075), Health (AV 24) 10 | record | refused in the target's game: the player's AddTarget hook refuses another actor's Health, Magicka or Stamina value effect (fork m2-push 4e8aa04c), beside be69bf68's fDiffMultHPToPC* 0; the server's number (ADR-028) |
| the cone: VoicePushProjectile03 and 02 (PROJ 0x14000, 0x13FFF; cone, speed 1536, range 10000 and 2000, impact force 85 and 65, no explosion) | record | native in the shouter's game and on its figure in other games (the shout relay) |
| the projectiles' sounds: VOCShoutProjectilePush03SD, 02SD (SNDR 0x3C86C, 0x3C86B) | record | native with the cone |
| the impact: VOCShoutPush01ImpactSet (IPDS 0x15C7B) | record | native where the cone lands |
| the screen effect: MAGShoutPush01Imod (IMAD 0x9E586) | record | native in the target's game, from its own effect |
| the release thunder: VOCShoutFXUnrelentingForceThunderC, B (SNDR 0xA0F54, 0xA0F53) | record | native in the shouter's game and on its figure |
| the shouter's graph: shoutStart, then MT_ or CombatReady_BreathExhale* (docs/verbs/shouts.md) | trace (shouts' lab runs) | native in the shouter's game, relayed to its figure |
| the target's ragdoll events (its graph): Ragdoll, then GetUpBegin | trace (r-shout-uf3-b 20261014-072653: PushActorAway(player, 15) from a placed NPC, as the script calls it, solo) | native in the target's game once the filter lets the script run (fork m2-push 2fe894e1) |
| the target's flight: 1224 units, frame steps to 75 | trace (same) | native, the target's own game (its movement reports carry it to the server, R2) |
| the landing's fall damage (about 4) | trace (same) | native in the target's game: world damage, ADR-028's victim's own |
| a thrown NPC (reference A, the player's shout at a bandit): staggerStart, then Ragdoll; flung 4000 units; 10 damage; the four effects, Dragonborn's 0x0201FF2B included | trace (r-shout-uf3-a 20261014-071846) | the engine's own throw of an NPC; under parity.py's mapping a figure's oracle is the player's record, so this row shows what the engine does, not the figure's target |
| the shouter's own graph: shoutStart, MT_BreathExhaleShort, bWantCastVoice 0 to 1 to 0 | trace (r-shout-uf3-a) | native in the shouter's game |
| the target's figure on the shouter's screen during the throw | trace, to read | later: the movement relay carries a position, not a ragdoll's pose |

## Authority

Rung: R0 for the hit (whether the shout lands on the target, the shouts
verb's), R2 for the throw (the target's own game simulates its player's
ragdoll at the server's word; its positions reach the server as any
movement does, recorded).
Why not R0 for the throw: the throw is Havok simulation in the game that
hosts the player; the server owns the decision that it happens, not the
flight.
What the server validates (R1) or records (R2): the shout and its hit as
today (docs/verbs/shouts.md); the target's movement during and after the
throw as its own movement report, under movement-speed's bounds (a throw is
an engine move, so its speed may need its own allowance: to measure).

## Engine surface (MEASURED where marked, by lab/frida/push-trace.js; the re-analyst's static reads name the functions)

- PushActorAway (ID 56213) calls AIProcess::KnockExplosion (ID 39895,
  CommonLibSSE-NG src/RE/A/AIProcess.cpp:197-201) with the pusher's position
  as the source. MEASURED (x-push-solo 20261014-143127, x-push2
  20261014-152206: the source is the shouter's position, and the call is
  made from +0xa2f570 inside 56213).
- A race flagged kNoKnockdowns (include/RE/T/TESRace.h:73) is staggered
  instead. No player meets it: no playable race in the lab's load order sets
  the flag (read 2026-10-14 with lab/esm.py's race_flags, scratchpad
  race-knock.py: the ten vanilla races, rotfern and rotfernRaceVampire).
- The script's event reaches the game through the Papyrus event dispatch
  that skymp5-client's filter blanks today (skyrim-platform
  FridaHooks.cpp:16-98; docs/apocalypse-options.md 3.1).
- MEASURED (2026-10-14, lab/frida/push-trace.js; offsets from the 1.6.1170
  image base): in a solo game (x-push-solo 20261014-143127), the engine
  asks the VM's SendEvent (104800) for OnEffectStart, then OnEffectFinish,
  from the target's actor update (+0x5ae6a6, +0x5b052b, +0x5b03c6,
  +0x9c3982). That is a thread of its own, not the projectile hit's, which
  sends OnMagicEffectApply. The effect's handle carries the target's form
  id in its low half (0x20001ff0008e6 on the bandit 0xFF0008E6).
  PushActorAway (56213) then runs on the VM thread from the shouter, and
  KnockExplosion (39895) throws the bandit from the shouter's position.
- MEASURED: in the multiplayer target's game (x-push2 20261014-141607 and
  -143427, fork m2-push 4f13fa50), the cone hit the player by the same
  path (the same OnMagicEffectApply backtrace), and the VM was never asked
  for OnEffectStart. skymp5-client's hit handler dispelled the figure's
  whole spell from the player at its hit (ae8446a9, against a relayed Fire
  Breath that had burned the player's own game), before the effects' first
  update. Fork m2-push 4e8aa04c drops the dispel. The player's AddTarget
  hook (skyrim-platform Hooks.cpp) now refuses only the effects that
  another actor's spell, power, shout or scroll lands on the player and
  that change Health, Magicka or Stamina. Every other effect runs, its
  script included (ADR-031: cut at the number).
- The dispatch, read statically by the re-analyst (2026-10-14, Ghidra on
  the unpacked 1.6.1170; Address Library ids), each part checked against
  the traces:
  - OnEffectStart and OnEffectFinish are sent only by SkyrimVM's sink for
    TESActiveEffectApplyRemoveEvent (53960, slot 1 of VTABLE_SkyrimVM[3];
    CommonLibSSE-NG include/RE/S/SkyrimVM.h:89). It binds the effect's
    scripts to the handle and calls SendEvent (104800). The event comes
    from 34092, an effect's per-frame step in MagicTarget's loop (34527),
    after the effect's Start. MEASURED: both traces' OnEffectStart
    backtraces run +0x9c3982 (53960), +0x5b03c6, +0x5b052b, +0x5ae6a6
    (34092), +0x5c35fb (34527).
  - 34092's first gate is the dispelled flag (bit 18). An effect dispelled
    before its first update starts nothing and sends neither event, which
    is how ae8446a9's dispel stopped the throw (MEASURED: with the dispel,
    no OnEffectStart; without it, OnEffectStart and the throw). The event
    also needs an actor target and a base effect with a bound script
    (formFlags bit 22, include/RE/T/TESForm.h:90).
  - An effect's handle is 0x0002_iiii_<target form id> (53518), iiii being
    the effect's id at +0x84: 0x0002000100000014 for the player's first.
    HandleIsType(142, h) is true for it (53505), and GetObjectForHandle(142,
    h) (53512) finds the live effect by its id in the target's list. So
    2fe894e1's test holds as written. A cheaper equal test is
    (h >> 48) == 2 and the low half 0x14. MEASURED: x-push2's OnEffectStart
    on the player carried 0x2000100000014, and the event passed the
    filter (the push ran).
  - 56213 is ObjectReference.PushActorAway's body (registered by 56246).
    It calls KnockExplosion (39895) from the pusher's position when the
    pushed actor has a high process. MEASURED: the push's KnockExplosion
    returns into 56213, once directly and once from the task queue.
  - An effect the new AddTarget refusal stops also sends no
    OnMagicEffectApply and no hit event in the target's game (both come
    after AddTarget, 38786 and 34526). MEASURED for OnMagicEffectApply:
    x-push2 counted 164 calls with four effects landing (4f13fa50) and 84
    with two (4e8aa04c). The target never reports a figure's hit
    (hitService.ts), so nothing waits on its hit event.
- The filter's test, from CommonLibSSE-NG b93280e8:
  - IObjectHandlePolicy::HandleIsType and GetObjectForHandle take a VM type
    id (include/RE/I/IObjectHandlePolicy.h:20, :27);
  - ActiveEffect's is 142 (include/RE/A/ActiveEffect.h:31);
  - its `target` (:104) is the actor's MagicTarget base, which sits at +0xA0
    on 1.6.1170 (MEASURED 2026-10-13, lab/frida/effect-stack-trace.js).
  So the test compares `target` with the player's AsMagicTarget()
  (include/RE/A/Actor.h:720-722, which relocates to +0xA0), never with
  ActiveEffect::GetTargetActor: that function's reinterpret_cast
  (src/RE/A/ActiveEffect.cpp:30-37) skips the base's offset.

## Lab (2026-10-14, the references)

- Scripted shouts from an NPC applied nothing to the player in a solo game:
  Papyrus Spell.Cast of 0x13F3A from it (20261014-071655) and the console's
  cast (-072145). A Draugr whose spell list carries the shout
  (EncDraugr05Boss1H 0xDDD5D) only meleed in 20 s (-072419). Its hits did
  show the player's own stagger event, which is StaggerPlayer, not
  staggerStart.
- The push itself, called as the script calls it (the console's
  pushactoraway from a placed NPC at the player, force 15), threw the
  player (-072653): the oracle for target-own's throw.
- The filter's change is fork m2-push 2fe894e1 (built on push); its probe
  is scratchpad x-push (c1's three words at c2 150 units off), after the
  nightly sweep.
- m2-push's staging (2026-10-14, 4f13fa50's client): x-push 20261014-140325
  threw nothing. c2 bore all four of the third word's effects from c1's
  figure and staggered (the server's PlayStagger), and moved 0.001 units.
  The trace above found why. The probe again on 4e8aa04c, with the trace,
  is the verb's next reading.

## Lab (2026-10-14, the throw on 4e8aa04c)

- x-push2 (20261014-152206, the trace on c2): the cone hit the player; the
  engine asked for OnEffectStart on the player's effect (handle
  0x0002000100000014) from the player's own update; the filter let it
  through; PushActorAway ran from c1's figure (0xFF000837) onto the player;
  KnockExplosion ran on the player from the figure's position, once
  directly and once from the task queue. MEASURED: the whole chain the solo
  control takes, in the multiplayer target's game.
- Thrown north from lab-spawn, c2 tumbled about 3800 units down the
  mountain (still down at 8.5 s). Thrown south (x-push-south
  20261014-152858) it went 1131 units over flat ground, with StaggerPlayer,
  Ragdoll and GetUpBegin 5 s apart in its own game, as the engine alone
  throws a player (r-shout-uf3-b: 1224 units).
- In c2's game only the push effect (0x7F82F) and the second word's
  (0x7F82E) landed; the damage effects (0xEA075, Dragonborn's 0x0401FF2B,
  Health value modifiers) were refused. c2's health followed the server's
  (0.534 against its own 0.540).
- b-duel (20261014-153159) on 4e8aa04c: green; c2's own health within 0.02
  of the server through Flames (0.707, own 0.712) and Fire Breath (0.505,
  own 0.514), so dropping the hit-time dispel let no local damage through.
- b-push: green twice by path (20261014-155052 and -155344: the server's
  record of c2 1237 and 1291 units south; c2's own Ragdoll and GetUpBegin;
  c1's figure of c2 took the relayed Ragdoll). Committed alone, thuum
  5b1e0d2. lab-api's c.watched(other) learned to find an actor the server
  moved where it ended (74532e4): a thrown player's figure no longer begins
  where the server has its player.
- The figure on the shouter's screen: it takes the relayed Ragdoll
  (skymp5-client's pushActorAway(figure, 0): it drops where it stood),
  ignores movement while down, takes the relayed GetUpBegin, and a second
  later moves to where its player landed (x-push-south: it ended at c2's
  exact spot). The flight itself is not drawn.

## Lab (2026-10-14, the flight on fork m2-flight f3569b95)

- x-push-flight (20261014-210908, lab/frida/push-trace.js on c1): in the
  shouter's game the third word's effect started on c2's figure
  (OnEffectStart on handle 0x20001ff00081f) and passed the event filter by
  its caster half; PushActorAway ran from the player (0x14) onto the
  figure, and KnockExplosion threw it from c1's position. MEASURED: c1's
  figure of c2 flew 1406 units with frame steps to 70 (c2's own game: 1405,
  71) and landed where c2 landed (x and y equal, z within 16 units); its
  relayed Ragdoll came 12 ms after the local one and was refused (already
  down). A screenshot 0.6 s after the release shows the figure gone from
  where it stood.
- b-push green on it (20261014-211219).
- Not every time: b-push with a check that the figure's largest step comes
  with the throw went green once and red once (20261014-212731: 77 units
  at 2682 ms; -213023: 1216 at 7634, the snap after the get-up). The race,
  traced on four runs of x-push-flight (lab/frida/push-trace.js on c1, ms
  after the effect's start in c1's game): the vanilla push at +20 to +22
  every time; the client's zero-force PushActorAway for c2's relayed
  Ragdoll at +12 (flew), +46 (snapped), +76 (flew), +41 (snapped). A zero
  knock landing 20 to 50 ms after the vanilla one gives the figure a fresh
  knock in place, and it never flies (MEASURED: the order of the calls;
  INFERRED: why a zero knock then kills the flight, the knock's own state
  in AIProcess not traced). Fix on m2-flight cadb5648: a relayed Ragdoll
  leaves a figure this game has knocked down itself alone, holding only its
  movement; a bystander's game, which runs no push, still knocks it.
- A second cause (m2-flight 05192845): with the zero knock gone, a figure
  still flew about 150 units and moved 1064 in one frame after its get-up
  (x-push-flight 20261014-225505): the movement relay, paused only when the
  relayed Ragdoll came, moved it toward its player's reported positions in
  the 40 to 80 ms between (INFERRED). A figure this game knocked down now
  takes no movement until its get-up (sync/knockState.ts).
- What stays (MEASURED, 05192845's staging): the two games simulate the same
  throw apart, and their landings differ run to run. c2's own flights went
  503 to 1405 units over the day's runs; x-push-flight 20261014-235126's
  figure flew about 200 units in c1's game where c2 flew 1312, and the
  movement relay moved it the 1104 between once both were up. So the
  figure flies on the shouter's screen, and lands where its player lands
  only when the two flights agree; the correction after the get-up is
  inherent to two simulations, and a jump when they disagree widely.
  The scenario check of the flight is the figure's distance by a moment
  (c.watched().movedBy, main e1006cc), not its largest step, which the
  correction can exceed.

## Playtest seventeen (2026-10-14, Eli, parity 4e8aa04c)

- Passed: in test 2's game, test 2 "flies backwards as expected" from test
  1's third word, and gets up; one and two words a stumble only; test 2's
  health where it was in sixteen for each shout.
- As expected (the inventory's later row): "in test 1's game, player 2
  ragdolls where they stand and dont fly back, however when both complete
  getting up, the effigy of player 2 in player 1's game snaps to the
  location of player 2 in player 2s game". Fork m2-flight 320cfda8 (A1's
  caster half) is the shouter's screen's fix; probe x-push-flight.

## Status

- [x] doc complete, inventory listed with a disposition per row, rung
      declared (R0 for the hit, R2 for the throw)
- [x] engine surface cited or delegated: CommonLibSSE-NG file:line, the
      re-analyst's read on sky-re, each part MEASURED by
      lab/frida/push-trace.js or read from the records
- [x] server logic + T0: none new; the shout and its hit are the shouts
      verb's (b-shout), the damage ADR-028's
- [x] message + validator (same commit): none; the wire is unchanged
- [x] native hook + T1: Skyrim Platform's event filter lets an effect the
      player bears run its script (fork 2fe894e1); the player's AddTarget
      refuses only another actor's Health, Magicka and Stamina value
      effects (4e8aa04c). T1 none: both are engine hooks in a running game,
      proven at T3
- [x] TS handler: skymp5-client's hit-time dispel of a figure's spell is
      gone (4e8aa04c)
- [x] T2 green: the full T2 at the merge (verb-merge m2-push, 2026-10-14)
- [x] T3 scenario green, no HYPOTHESIS tags: b-push (thuum 5b1e0d2) green
      twice by path (20261014-155052, -155344) and in the merge's gate
- [ ] parity scenario green, or its later list reviewed with it (ADR-031):
      p-shout-uf3 is owed. Its references are r-shout-uf3-a2 and -b2
      (b2 through the driver's combat-spell, main 14ab558); its later list
      is the figure's flight (target-figure/physics/jumped)
- [x] ledger and suppression registry updated: NATIVES.md's
      SetPotionEffectsBlocked note (the switch now also refuses another
      actor's H/M/S value effects); the suppression is the AddTarget
      refusal above, recorded in magic-effects.md, shouts.md and
      spell-cast.md
- [x] merged: the gate run set merge-m2-push (20261014-161704) went 20 of 20 green; fork parity fast-forwarded to 4e8aa04c (2026-10-14)

## Next

1. Playtest seventeen's throw, on parity 4e8aa04c (merged 2026-10-14,
   the gate 20 of 20 green).
2. The figure's flight on other screens (the inventory's last row).
   - On the shouter's screen it is ADR-029's A1 test 1, its caster half
     (docs/apocalypse-options.md 3.1: an effect passes when its caster or
     its target is the player; 2fe894e1 built the target half). In the
     shouter's game the third word lands on the target's figure with the
     player as caster, so the vanilla script throws the figure there from
     the shouter's position, the force the target's own game uses. The
     test reads the effect's caster handle (CommonLibSSE-NG
     include/RE/A/ActiveEffect.h:93-100). The movement relay already
     stands down while the figure is down (the relayed Ragdoll sets
     Variable10, movementApply.ts), and the two simulations land about
     1100 to 1300 units out, so what is left after the get-up is a short
     slide. It is PLAN's next A1 step (Apocalypse's filter), on a branch of
     its own after playtest seventeen.
   - On a third player's screen neither the caster nor the target is that
     game's player. That is the bystander case of A1, open in
     apocalypse-options.md's section 6, or the push on the wire (pusher,
     target, force), so every game pushes the figure. Decide with
     Apocalypse's own bystanders.
3. The server's PlayStagger for the third word (fork 4a4c80e1) beside the
   engine's own stagger, which now plays in the target's game: retire it
   once a trace shows the engine's alone.
4. The parity scenario p-shout-uf3, its later list the figure's flight.

## Merged: the flight (fork parity 05192845, 2026-10-14)

The gate run set merge-m2-flight went 20 of 20 green (20261015-002043, 17:20
to 18:16). The shouter's screen now shows the target's figure thrown by the
vanilla push (the two games' landings can differ, and the movement relay
corrects the figure once it is up); b-push's flight check, by the recorder's
track (movedBy), follows. The inventory's last row is merged for the
shouter's screen, DONE with that check and playtest eighteen; a bystander's
screen stays LATER (A1's bystanders, or the push on the wire).

Playtest eighteen (2026-10-14, Eli): both flight items ticked. On the
shouter's screen the target's figure flies back as the target does in its
own game and is where the target is once both are up, no snap; the
target's own game throws it as in seventeen. T4 of the flight: passed.
b-push's flight check (thuum 6f90239, its own commit): the figure has moved
more than 100 units 5 s into the watch, green twice (20261015-025520 read
150, -025801 read 1146). The inventory's last row is DONE for the shouter's
screen.

