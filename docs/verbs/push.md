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

## Engine surface (the decompiled path, HYPOTHESIS; docs/verbs/stagger.md)

- PushActorAway (ID 56213) calls AIProcess::KnockExplosion (ID 39895,
  CommonLibSSE-NG src/RE/A/AIProcess.cpp:197-201) with the caster's position
  as the source; a race flagged kNoKnockdowns (include/RE/T/TESRace.h:73)
  is staggered instead.
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

## Next

1. x-push2 on 4e8aa04c's client: the trace should show OnEffectStart on
   the player's effect, the filter letting it through (the handle test is
   the re-analyst's read: HandleIsType(142) on a handle like the solo
   one), PushActorAway from c1's figure and KnockExplosion on the player;
   c2's watch a Ragdoll and GetUpBegin and a flight past a stagger's.
   Then b-push (its bounds from that run), committed alone.
2. The filter's first test (ADR-029 A1, test 1), its target half only: an
   event on an ActiveEffect handle whose target is the player passes
   (include/RE/A/ActiveEffect.h:93-104), beside the named exceptions in
   OnSendEventEnter (skyrim-platform FridaHooks.cpp:51-87). A1's caster
   half (an effect the player cast on another) waits for Apocalypse's verb:
   in the shouter's game it would run the script on the target's figure and
   throw the figure locally, against the movement relay.
3. The imposed hit in the target's game, if the trace shows the figure's
   own shout does not land the effect there: the server's decided spell
   cast from the shouter's figure onto the player (MagicCaster::
   CastSpellImmediate, include/RE/M/MagicCaster.h:46).
4. The parity scenario p-shout-uf3, its later list the figure's flight.
