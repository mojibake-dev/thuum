# Hostility in 1.7.104: what refuses a wait when enemies are near

Status: static analysis (the re-analyst, 2026-10-04), every finding a
HYPOTHESIS unless marked otherwise below. Question from the hostility-sync
verb (docs/verbs/hostility-sync.md, ADR-023): why only the attacker's game
refused a wait after a hit between players, and what the victim's game needs
to refuse it too.

Program and tools: SkyrimSE-1.7.104.0.exe in the sky-re Ghidra project, read
through pyghidra-mcp. Nothing renamed or saved. IDs are Address Library ids
resolved with lab/addr.py; every one also exists in the 1.6.1170 database.
The 1.6.1170 program in the project disassembles to junk at every id tried
(at 41402: `XCHG EAX,EDI; RET 0x5436`, about 0.7M instructions against 5.77M
and no RTTI), so its .text looks encrypted, likely by the Steam wrapper; an
unwrapped 1.6.1170 exe would have to be imported to read its bodies. Headers
are CommonLibSSE-NG's under include/RE/.

## Lab result (run 20261004-224519, exploratory)

CONFIRMED: after the server's notice made c2's game call
`Actor.StartCombat(player)` on its figure of c1, c2's Wait showed "You
cannot wait when enemies are nearby." and no rest happened; c1's was refused
too. c2's figure of c1 did not move (0.0 units over 28 s, 1664 samples) while
its combat AI ran. Everything else below is the static read.

## The refusal

- The message is the game setting `sNoWaitHostileActorsNear` (Setting
  object id 377995, "You cannot wait when enemies are nearby."; the same in
  1.6.1170's data). Sleep uses `sNoSleepHostileActorsNear` (378019), fast
  travel `sNoFastTravelHostileActorsNear` (378151). The text on screen
  matches (CONFIRMED by the run above).
- The gate is id 40443 (0x140743ef0), `bool(PlayerCharacter*, TESObjectREFR*
  bed)`, bed null for a wait. In order it refuses for: a flying mount, the
  location, trespassing (kIsTrespassing, Actor.h:208), being asked to leave,
  guards in pursuit (41324), enemies near (`41402(ProcessLists singleton
  400315, nullptr)`), health-damage effects (34520), being knocked down,
  mounting or dismounting (Actor.h:199), and bed checks for a sleep. Each
  refusal calls the notification function (52933, Offsets.h:581) with the
  setting's text and "UIMenuCancel". The Wait request (52490) opens the
  Sleep/Wait Menu (InterfaceStrings.h:55) only when the gate returns true.

## Enemies near: id 41402

```c
r = IsInInterior(player) ? fHostileActorInteriorDistance /*375159, 2000*/
                         : fHostileActorExteriorDistance /*375162, 3000*/;
for (h : processLists->highActorHandles) {          // ProcessLists.h:69
  a = h.get(); if (!a || a == player || a->IsDead(false) || IsDisabled(a)) continue;
  if (a's process has a commandingActor) a = commander;   // MiddleHighProcessData.h:175
  d2 = DistSq(player, a);                          // FLT_MAX across worldspaces
  if ((d2 <= r*r || (flying, not perching, and d2 <= fHostileFlyingActorExteriorDistance^2 /*375165, 15000*/))
      && (38571(a, player) || 37533(a, player, -1))) { found = 1; if (out) out->push(h); }
}
```

- 38571: the actor's combat group (GetCombatGroup, vtable slot 0xD4,
  Actor.h:410; Character's 38554 returns `combatController->combatGroup`,
  CombatController.h:31) has the player among its targets (44706, under the
  group's lock; CombatGroup.h:75, 108).
- 37533 wraps 37534(a, player, Aggression, -1). Against the player, for an
  actor neither a teammate (Actor.h:185) nor commanded (Actor.h:212), it is
  hostile when: frenzied (aggression 3); a guard with the player in a crime
  state; kAngryWithPlayer set (Actor.h:207, boolFlags +0x204 bit 11) unless
  the player's endAlarmOnActor is set (AIProcess.h:228); or its aggression
  meets the faction reaction from 37667 (Aggressive with Enemy, Very
  Aggressive with Enemy or Neutral). The result passes the kGetShouldAttack
  entry point (23526; BGSEntryPoint.h:20, 115).
- Not inputs: the player's isInCombat, combatGroup and combatTimer
  (PlayerCharacter.h:301, 514, 519). No detection request.
- CommonLib's Actor::IsHostileToActor (37537, Offsets.h:13) is 38571 ||
  37534 || an aggro-radius branch; the scan is that without the aggro radius.

## What a hit does

- The melee hit frame 38603 (melee-reach-1-7-104.md) calls 38627, then
  38586(victim, HitData*), which reads the aggressor at HitData+0x18
  (HitData.h:54) and calls 38626(victim, aggressor, 0, n), the victim's
  on-hit reaction.
- 38626 tolerates friendly hits by the player up to iFriendHitNonCombatAllowed
  0, iFriendHitCombatAllowed 3, iAllyHitNonCombatAllowed 3,
  iAllyHitCombatAllowed 1000 (executable defaults; Skyrim.esm not checked),
  1000 with kIgnoreFriendlyHits (TESObjectREFR.h:194). Past them it raises
  the assault alarm (37425) and starts combat (39359) unless in a kill move.
- 37425 files an assault crime with the victim's crime faction and, when the
  victim detects the player, sets kAngryWithPlayer on it (37463), clears the
  player's endAlarmOnActor (39198) and stores the crime at player+0xB18.
- 39359, then 40079, then 38561 start combat: refused for the player, the
  dead, restrained or unconscious, and past iNumberActorsInCombatPlayer
  (370828, default 20); a CombatController from CombatManager (405246,
  CombatManager.h:28) stored at Actor+0x160.
- The compass: every frame 41240 empties the player's HUD actor array and
  adds every member of every combat group targeting the player; HUDMenu
  (51612) draws up to 16 with "CompassMarkerEnemy". In 1.7.104 the array is at
  player+0x9E8, size at +0x9F8, 8 bytes past CommonLib's
  actorsToDisplayOnTheHUDArray (PlayerCharacter.h:515), the 1.7 shift in
  playercharacter-tints-1-7-104.md. kAngryWithPlayer alone never reaches it.

## Making a figure hostile from the client

- Papyrus `Actor.StartCombat` (native 54768) refuses the player, the dead,
  no AI process, or dialogue against a non-player; otherwise it queues task
  0x2a (36959; TaskQueueInterface singleton 403759), which runs 39359 on the
  main thread. This is what hostility sync uses (lab result above).
- `Actor.StopCombatAlarm` (54771) undoes it at once:
  ProcessLists::StopCombatAndAlarmOnActor(actor, false) (41340,
  ProcessLists.cpp:111), Character::StopCombat (slot 0xE5, Actor.h:427;
  38566), then 37463(actor, false). `Actor.StopCombat` (54770) only sets
  stoppedCombat (CombatController.h:44) and clears kAngryWithPlayer.
- Rejected: 37463 directly (native code, no compass marker, and the AI may
  start combat on its own anyway); aggression 3 (hostile to all);
  Faction.SetPlayerEnemy (a whole faction); SetRelationshipRank (37667
  consults it only for unique NPCs, through 40632); SetAttackActorOnSight
  (sets bit 15 on the actor, which 37534 reads on the target);
  Actor.SendAssaultAlarm (files the local player as the criminal); a Get
  Should Attack perk (needs an ESP).

## Open

- Whether a CombatController marked inactive or ignoring combat
  (CombatController.h:46-47; AIProcess.h:227) keeps the marker and the
  refusal while the AI stays passive.
- How the engine ends a fight on its own, and whether a figure's combat
  outlives a respawn.
- What 37668 does when kAngryWithPlayer changes.
- The 1.6.1170 bodies (an unwrapped exe).
