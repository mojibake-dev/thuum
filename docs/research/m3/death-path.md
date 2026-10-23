# The NPC death path on the server and the clients (code map for train-42, ADR-048)

Read 2026-10-23 by an agent on the fork worktree (branch m3-train-41 at 818287c3);
lines are that tree's. Edit nothing was the brief; this is the map train-42 builds
from once Eli answers ADR-048 (A, B or C, and C-ii).

## 1. The server's death path today (R0 throughout)

One entry point, MpActor::Kill (MpActor.cpp:1938-1960): a trace line, then
SendAndSetDeathState(true, shouldTeleport), the DeathEvent with the killer and
the three percentages before, AddDeathItem. Its callers, the server's five
causes: SetPercentages (:888-897, the hit path, Kill(aggressor) when the
immortal-health clamp reads 0), SetPercentage (:853-866, the client's own
ChangeValues report, Kill(nullptr) at health 0; TIM leaves one point),
ConsoleCommands.cpp:257-267 ExecuteKill, PartOne.cpp:2301 ClaimHeadshot
(Kill(&actor)), SetIsDead(true) (:2159-2197, the gamemode's; a second call on a
dead actor does nothing).

What it sends (MpActor.cpp:1580-1606): DeathStateContainer 18 to
GetActorToSendTo() (:518-535: an offline actor's message goes to its host), the
record's isDead and healthPercentage 0. The other seats learn a death two ways:
the host's relayed movement sample (movementGet.ts:105 isDead from
ac.isDead(), applied at movementApply.ts:75 as applyDeathStateEvent) and a late
joiner's CreateActor (MpObjectReference.cpp:393-395 props.isDead). The respawn
alone is broadcast (RespawnEvent.cpp:25-32). After the kill DeathEvent::
OnFireSuccess arms RespawnWithDelay (DeathEvent.cpp:65-70), which re-rolls a
fated record (train-41) and respawns at the editor placement.

Client receipt: remoteServer.ts:811-860 onDeathStateContainerMessage, then
deathService.ts:83-97 applyDeathState (no-op when the engine already agrees),
killActor (:141-153): endDeferredKill then kill. The deferred kill is armed on
every viewed actor (formView.ts:363-369), so an engine death waits for the
server's word.

## 2. The host's own death report: none, and nothing counts

No client sink for deathStart or TESDeathEvent (Skyrim Platform sinks it,
EventHandler.h:36, :478-479; skyrimPlatform.ts:657-661), no server handler, no
message, no log line: npc-fate.md's H5 "counted, never applied" is the plan,
the code has nothing. The host sends the movement sample: health zeroed at
ac.isDead() and clamped to [0, 1] (movementGet.ts:41-51, train-35), the
validator refusing the rest (wire-validate lib.rs:615-627); the server reads
neither health nor isDead from it (ActionListener.cpp:173-373 relays the raw
bytes and stores position, angle and four animation variables, :322-342).

A trust hole, dormant: every receiving puppet applies the relayed sample's
isDead (movementApply.ts:75 into deathService.killActor) with no server record
behind it, while the sample's health is floored (:233-247, kHealthFloor 0.01).
Under the deferred kill the host's actor never reaches isDead (x-npc-death read
minus 128 percent alive), so nothing fires; any engine kill that ends the
deferred kill on a host would propagate a death as R2 silently applied, against
rule 5. Train-42 closes it whichever option Eli picks: a puppet dies by the
server's word (DeathStateContainer or CreateActor's isDead) and never by the
sample.

ChangeValues cannot carry a hosted actor's health: sendInputsService.ts:163-176
sends the player's own values whatever the id names, and OnChangeValues
(ActionListener.cpp:2323-2330) resolves the user's actor and never reads
msg.idx. The reserved HostedActorState (wire id 5, R2, health: f32) has no
handler and no sender.

## 3. Damage numbering and the cause the server holds

hitService.ts:146-160 reports a hit whose aggressor is the player or a synced
actor this game simulates (HostService.isMineLocal); ActionListener.cpp:
2906-2935 accepts a hosted aggressor only from its cell's host, then the same
cell (:2957-2968), under 4096 units unless a shot (:2971-2981), a dead
aggressor refused (:2983-2988); the player-only rules are gated on the
aggressor being the reporter (:3115-3200), so a hosted NPC's hit on an NPC
passes to OnWeaponHit (:3600-3780), whose number is the server's
(CalculateDamage, CalculateCurrentHealthPercentage, NetSetPercentages,
SetLastHitTime and SetLastHitTakenTime, :3705-3749). Spells through
OnSpellHit (:3480-3598) and ClaimScriptedKill.

The cause at the moment of death is exactly the killer pointer handed to Kill:
a player (UserByActor(killer) is a user), a hosted NPC (any other MpActor), or
none (SetPercentage's Kill(nullptr), SetIsDead). It lives in DeathEvent
(DeathEvent.cpp:6-14) and the trace line; the record says nothing of why.
SetLastHitTakenTime (:3740) is the one durable "a numbered hit landed
recently" fact a death check can read.

## 4. The health relay is relay only

The record's actorValues.healthPercentage moves only through SetPercentage(s),
NetSetPercentages, SendAndSetDeathState and ApplyChangeForm (:800-808); a
hosted NPC's record holds the server's own numbers alone (regeneration, falls
and scripts on the host never reach it; a late joiner's CreateActor carries the
server's health). npc-stream.md:49 plans the record's R2 health through
HostedActorState at most twice a second, "a report of 0 does not kill".

## 5. Settings, flags

ScampServer.cpp:239-257 is the setting idiom (cellFollow, npcEnabled; the
string form is logLevel :231-236): trustLevel reads find, is_string, maps
"friends" (the default when absent, logged) and "strict" to an enum on PartOne
with its info line, refusing another value at start. The lab overlays a
scenario's server block onto server-settings.json (runner.py:398-408).

Essential, protected, unique: libespm NPC_.cpp:24-33 from ACBS (0x2, 0x800,
0x20; CommonLibSSE-NG TESActorBaseData.h:19-32 agrees, kRespawn 1 << 3 is not
parsed yet); the server's one read is the IsEssential condition function
(condition_functions/IsEssential.cpp:20-34) inside ClaimScriptedKill's
condition pass; nowhere does the server refuse damage or a kill for an
essential (the load-time ban was lifted, WorldState.cpp:567-573). A leveled
actor's flags come from the template under UseBaseData 0x80:
EvaluateTemplate<0x80>(worldState, baseId, chain, cb) (EvaluateTemplate.h:
9-50), GetBaseActorValues.cpp:30's idiom. IsPersistentReference (train-40)
reads the record header; nothing reads the ACBS Respawn bit (add isRespawn
beside isProtected; every dead actor re-arms today, DeathEvent.cpp:65-70).

## 6. Train-42's server half under option C

1. A new message, not an extension: ActorDeath, MsgType 52, wire id 60, client
   to server, reliable, once per death: {idx, cause (fall, hazard, script,
   npc_hit, unknown), killer (0 none), pos}. UpdateMovement is unreliable,
   per-sample, R2 relay; HostedActorState has no death, no cause, no handler
   and a larger scope. Template: commit a891e6a6 (ActorFate), sixteen files,
   plus PacketParser.cpp's OnHit case shape (:80-84) for an inbound message
   and the client's deathStart sink gated like hitService.ts:150-160.
2. The checks in ActionListener::OnActorDeath, each refusal a warn line with a
   code (OnHit's E_HIT_REACH shape, :3137-3141): the reporter simulates the
   actor's cell (PartOne::SimulatorOf, the host else the follower) at the
   current epoch; nobody's player; not essential, not protected (protected
   refused outright under C, a player's hit being R0); not a player's hit
   (already dead means the server's number got there first; a recent
   SetLastHitTakenTime from a player's hit refuses, E_DEATH_PLAYER_HIT; cause
   npc_hit with a killer the server numbers is R0 under C-ii (a)); the
   per-host cap (a TokenBucket, capacity 6 and no refill for a burst-only
   cap, or a sliding minute in wire-rules as hostility.rs keeps); trustLevel
   strict refuses every report before the checks.
3. The setting (5), the logs (one info per acceptance naming the cause and
   the point, one warn per refusal; Kill's trace raised to info with the
   killer's class so every death names its rung).
4. The travel after acceptance: Kill(killerOrNull, with a cause through
   DeathEvent) leaves the record at its last accepted sample (the body's
   point under cell-host's bounds), DeathStateContainer to the host, the
   host's deathService ends the deferred kill and kills, the other seats take
   isDead from the server's word (the seam in 2 closed), late joiners from
   CreateActor, RespawnWithDelay as train-41 left it (the fate schedule is
   D3's).
5. Two seams fixed or declared in the same train: the puppet's death from a
   relayed isDead (2), and a hosted actor's ChangeValues being the player's
   values (2), which C-ii (b)'s host-owned NPC health would otherwise route
   through.

T0 beside unit/RespawnTest.cpp: a fall kills (an accepted report kills on the
server and the DeathStateContainer goes to the host); an essential's death or
a player-hit death claimed by the host is refused and logged.
