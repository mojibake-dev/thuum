# SkyMP's hosting and NPCs, mapped for M3 (Hosting)

Read 2026-10-16 from fork parity ef44a1d8 (a `git archive` copy in this
folder's `src/`, read-only; nothing in the repo was touched; the
`corescripts/` and `tes3mp/` folders beside it are other agents') and thuum
origin/main 0875d10.

Path shorthand, all under the fork root `skymp/`:

- `S/` skymp5-server/cpp/server_guest_lib/
- `C/` skymp5-client/src/
- `W/` skymp-wire/crates/
- `SPT` skyrim-platform/src/platform_se/codegen/convert-files/skyrimPlatform.ts
- thuum paths (docs/..., lab/...) are thuum origin/main.

Anything about runtime behavior that comes from reading code alone is marked
HYPOTHESIS (code reading) until a lab run or a trace confirms it.

## 0. The short version

- SkyMP hosts per reference, not per cell. `WorldState::hosters` maps a form
  to the player actor that hosts it. A client asks for one actor at a time;
  the server grants the first ask, and any later ask once the actor's last
  accepted movement report is more than 2 s old. Nothing is server-decided
  beyond that: no distance, cell, rate or ping rule, no release on
  disconnect.
- NPCs are not the engine's own references on any client. Every client
  deletes every engine actor within 8192 units that the server did not
  create (worldCleanerService), and shows each server NPC as a `placeAtMe`
  copy of its base. The host's engine AI runs on that copy.
- Off the host, NPC AI is not disabled. The copy is held in place with
  `KeepOffsetFromActor` on itself and dragged with `translateTo`, attack
  events are blocked unless relayed, and every idle, stagger and kill move
  of every 0xff actor is blanked (that includes the host's own NPCs).
- The host streams position (every 130 ms) and graph events. Combat target
  only as a look-at point. No inventory, equipment, actor values, packages.
- The server simulates nothing. An NPC nobody hosts keeps its last accepted
  report. Death always respawns the NPC after 25 s at its editor location,
  and a record loaded dead is respawned, so deaths never persist.
- The lab server runs with `npcEnabled` unset, so no NPCs load at all; and
  even with it on, the loader drops essential, protected and unique NPCs,
  crime-faction members and every playable race, which is most of
  Riverwood and every humanoid bandit.

## 1. The server's host model

### 1.1 State

- `WorldState::hosters` (S/WorldState.h:257): form id to the hosting
  player's actor form id. Created by `operator[]` in OnHostAttempt
  (S/ActionListener.cpp:1975). Erased in exactly two places:
  ActorUpdatableBy, when the form turns out to be a player's
  (S/ActionListener.cpp:77-88), and PartOne::SetUserActor for the actor
  being given to a user (S/PartOne.cpp:283-291). Not on disconnect
  (S/PartOne.cpp:558-582), not in DestroyForm (S/WorldState.h:187-220), not
  on death, a cell change, or distance. unit/HostAttemptTest.cpp:36 erases
  by hand for that reason.
- `WorldState::lastMovUpdateByIdx` (S/WorldState.h:260-261): per form index,
  the time of the last accepted movement report, written after validation
  and the relay (S/ActionListener.cpp:270-275). Indexes come from MakeID and
  are recycled when a form is destroyed (S/WorldState.cpp:124-136,
  S/WorldState.h:214-217), so a new form can inherit a dead one's time. It
  is wall clock (`system_clock`), not steady.

### 1.2 Claiming: OnHostAttempt (S/ActionListener.cpp:1958-2051)

1. `remoteId` is the low 32 bits of the client's u64 (1961; LongToNormal at
   51-56).
2. No actor attached: throws, logged, dropped (1963-1966). Tonight's crash
   began here: a game asked to host before it had an actor, logged in, and
   the next ask wrote past the vector's end (docs/LOG.md 1742-1746).
3. `GetFormAt<MpObjectReference>(remoteId)` (1968) accepts any reference,
   not only actors, and loads it from the masters if it is not loaded.
   LoadForm then runs ForceSubscriptionsUpdate (S/WorldState.cpp:708-742),
   which loads the 3x3 chunks of references around it
   (S/WorldState.cpp:887-918). One packet can make the server load an
   arbitrary region.
4. A form that is a player's actor is refused (1970-1973).
5. Grant when `hoster == 0`, or no movement time, or the last accepted
   movement is more than 2 s old (1985-1989). No distance, cell, listener,
   rate or ping check. The wire checks shape only: `validate` has no Host
   arm and no budget for it (W/wire-validate/src/lib.rs:453-494).
6. On grant, in order: the hoster is set to the sender's actor (1992);
   UpdateHoster (1993, see 1.6); the time is set now (2001-2005, tonight's
   fix); EquipBestWeapon (2007-2010; S/MpActor.cpp:191-236); HostStart with
   the long id, formId + 0x100000000 for an ESM actor (2012-2019); a 1 s
   timer sends the record's health, magicka and stamina percentages to the
   actor's GetActorToSendTo (2021-2037); HostStop to the previous hoster
   if it is connected and is not the sender (2039-2049).
7. The current host asking again with a fresh time gets nothing back.

Fault in the same function: the 1 s timer calls `GetFormAt<MpActor>`
(2027). It throws when the claimed form is a non-actor reference or was
destroyed within the second. Promise::Resolve does not catch
(viet/include/Promise.h:58-64), so the throw leaves
Viet::Timer::TickTimers mid-loop (viet/src/Timer.cpp:41-52), skipping the
rest of that tick's timers and WorldState::TickEffects
(S/WorldState.cpp:156-162). ScampServer::Tick rethrows
(skymp5-server/cpp/addon/ScampServer.cpp:513-522) and
skymp5-server/ts/index.ts:225-230 logs it. Not an abort, but reachable
from a packet.

### 1.3 How a host is kept and lost

- Kept by sending accepted UpdateMovement at least every 2 s. The host's
  client sends every 130 ms, standing still or not
  (C/services/services/sendInputsService.ts:131-153).
- Lost when another client asks after 2 s with no accepted report (the only
  "reassign on leave", pulled by the other client, with HostStop to the old
  host), or when the form becomes a player's.
- A host that disconnects keeps its entry. GetActorToSendTo keeps routing
  the NPC's server messages to its offline actor (S/MpActor.cpp:503-526),
  where SendToUser finds no user and drops them (S/PartOne.cpp:784-796),
  until someone else asks.
- A rejected report does not refresh the time. A hosted NPC's report from
  another cell or worldspace, or 4096 units away, is dropped silently
  (S/MovementValidation.cpp:96-101; the snap-back is the player's only,
  26-37). So an NPC walking through a load door (a schedule) stays outside
  in the server's record, and 2 s later anyone may claim it.

### 1.4 Who may send what for a hosted actor

| Handler | Gate | What it does for an NPC |
| --- | --- | --- |
| OnUpdateMovement (S/ActionListener.cpp:162-277) | ActorUpdatableBy (58-106): the sender's own actor, or `hosters[form]` is the sender's actor; else HostStop and drop | Validates same cell and under 4096 units per report (MovementValidation.cpp:96-101); no ground-speed budget for NPCs (104-126 is `isMe` only; docs/verbs/movement-speed.md:29-30). Relays to every listener, the sender included (RelayToListeners 108-118). Records pos, rot, four animation flags (251-259) and the time |
| OnUpdateAnimation (279-300) | SendToNeighbours: ActorUpdatableBy, then relay to all | Records animation state only for the sender's own actor (293-299): the server keeps no NPC animation |
| OnUpdateAction (302-327) | ActorUpdatableBy | Relays to every listener but the sender (318) |
| OnHit (2654-) | aggressor 0x14, or `hosters[aggressor]` is the sender (2668-2681) | Damage R0. Reach and cone only player against player (2830-2857). No stagger for a target without a user: "a hosted actor's host game reacts to its own hits" (3333-3336, 3357-3359) |
| OnSpellCast (2905-) | caster own, or hosted (2915-2930) | |
| OnActivate (955-1027) | caster 0x14, or hosted (965-977) | Reach rule applies; EquipBestWeapon on a hosted caster after (1018-1026) |
| OnUpdateEquipment (708-860), OnUpdateAppearance (485-530) | relay by `msg.idx` through SendToNeighbours, but validate and write the sender's own actor (521, 859-860) | Latent: an NPC's equipment sent this way would overwrite the host player's record. The client never sends it (sendInputsService.ts:254-256, 279-282) |
| OnChangeValues (2078-) | always the sender's own actor (2081, 2099) | Latent: the client sends the player's own values under a hosted NPC's id (sendInputsService.ts:166) |
| OnUpdateAnimVariables (2894-2903) | own actor only (2902) | |

### 1.5 Server to a hosted NPC

- GetActorToSendTo (S/MpActor.cpp:503-526): an actor with no user sends to
  its hoster. That covers Teleport, ChangeValues, the death state
  (S/MpActor.cpp:1538-1564), OpenContainer and snippets.
- DelegateToHost (S/script_classes/PapyrusActor.cpp:183-199): a Papyrus
  native on an NPC runs as an SpSnippet in the host's game (R2, result not
  recorded).
- SendHostStop (S/PartOne.cpp:755-768), called from ActorUpdatableBy only.

### 1.6 isHostedByOther

- CreateActor, per listener at subscription: true when the emitter has a
  user, or has a hoster that is not this listener (S/PartOne.cpp:966-978).
- UpdateHoster (S/MpObjectReference.cpp:734-745) sends an UpdateProperty
  `isHostedByOther` to every actor listener's GetActorToSendTo: false to
  the new host, true to the rest. Two defects, HYPOTHESIS (code reading):
  1. For an ESM actor the property's refrId is the raw form id
     (S/MpObjectReference.cpp:65-68), and UpdateProperty's `refr_id` is u32
     on the wire (W/wire-schema/src/skymp.rs:417-431), while CreateActor
     carries the long id as u64 (skymp.rs:1097). The client sends every
     UpdateProperty with refrId below 0xff000000 down its engine-reference
     path, which applies only inventory, isOpen, isHarvested and disabled
     (C/services/services/remoteServer.ts:764-783, 947-951). So an ESM
     NPC's isHostedByOther never changes after its CreateActor.
  2. A listener that is an NPC hosted by the same player routes its copy to
     that player (GetActorToSendTo), and gets "true" (its form id is not the
     new host's). A host with two neighbouring NPCs receives both true and
     false about the newly hosted one, in actorListenerArray order
     (S/MpObjectReference.cpp:1001-1004; that order follows pointer-ordered
     set differences, 697-722). It matters for server-spawned (0xff) NPCs,
     whose property updates do reach the model.

### 1.7 The unit of hosting

Per reference, and in practice per actor: the client asks only for actors
(C/view/formView.ts:438, 475). Interest management is a grid: 4096-unit
chunks per cell or worldspace (S/MpObjectReference.cpp:152-155), every
reference subscribed to the 3x3 chunks around it (S/Grid.h:75-95), the
masters' references loaded on a chunk's first neighbour query and never
unloaded (S/WorldState.cpp:887-918). That is the classic tile scheme
(Boulanger, Kienzle and Verbrugge compare it with other interest-management
algorithms, NetGames 2006). ADR-002 means to build cells over the per-actor
mechanism: "a cell host hosts all its NPCs" (docs/DECISIONS.md:27-37).

### 1.8 Tests

- T0: unit/HostAttemptTest.cpp:11-38 (tonight's); unit/NpcExists.cpp
  (loading and npcSettings; the Whiterun cow's CreateActor with
  isHostedByOther false or absent, 18-52); unit/PartOne_ActorTest.cpp:55 (a
  player's CreateActor says true); unit/PartOne_ActivateTest.cpp:89-108 (an
  activation by a caster nobody hosts). Nothing tests a handoff, the 2 s
  lapse, HostStop to the old host, UpdateHoster's messages, a hosted NPC's
  movement rights, or a disconnect.
- T2: no difftest session sends Host, HostStart or HostStop
  (W/../difftest/sessions/), and the fakeclient has none.
- T3: no scenario mentions NPCs or hosting (lab/scenarios/), and
  lab/deploy/sky-srv/server-settings.json has no `npcEnabled`, so the lab
  server loads no NPCs (lab/tools/playtest-start.sh:10-14 says as much).

## 2. The client's side (skymp5-client)

### 2.1 How an NPC appears at all

- WorldCleanerService (C/services/services/worldCleanerService.ts:37-108):
  every frame it picks one random actor within 8192 units of the player
  and, unless it is protected, the player, disabled, deleted, in dialogue,
  or a pre-placed body (kept, activation blocked, 72-76), disables and
  deletes it. Protection is given only to FormView spawns
  (C/view/formView.ts:271-273). So the engine's own NPCs, summons and any
  script-spawned actor are removed on every client. It has no single-player
  gate (ADR-031's references are recorded without skymp5-client, so they
  are unaffected: lab/references/README.md).
- FormView (C/view/formView.ts): the server sends an ESM actor's id as
  formId + 0x100000000 (S/PartOne.cpp:923-926), which is above 0xff000000,
  so the view does not use the engine reference (130-144 is for ESM
  non-actors) but spawns a copy of the base with `placeAtMe` (145-305;
  182-200). "All skymp npcs are FF+" (C/services/services/hitService.ts:21).
  The server evaluates the template chain at player level 0 and sends it
  (S/MpActor.cpp:432-443, 1619-1726), but the client ignores it ("TODO:
  getLeveledBase crashes too often ATM", formView.ts:154-158) and spawns
  from the base id, so each client's engine rolls its own leveled variant
  (HYPOTHESIS, code reading).
- On the copy: deferred kill with health and magicka 1,000,000
  (formView.ts:313-319), attackDamageMult 0 (302), Aggression 2 for draugr,
  falmer, chaurus, spiders, dwarven machines, spriggans and wolves
  ("potential masterambushscript", 236-268). A dead NPC is never spawned
  for a client that did not already show it (73-78). A view whose movement
  names another cell than the player's is destroyed (80-91), and every view
  is reset when the player changes cell or worldspace
  (C/view/worldView.ts:71-82).

### 2.2 Who asks to host, and when

- formView.ts, per NPC view with movement, its 3D loaded:
  - no movement applied for 1.5 s (and no ask for 1 s): ask (429-443);
  - a new report, or 2 s since the last apply, while isHostedByOther is
    false and it has applied once: ask unless already hosted (473-496).
- tryHostIfNeed (724-738): at most once a second per NPC, and only if the
  NPC's worldOrCell is the player's. It queues the id
  (C/view/hostAttempts.ts:1-17).
- sendHostAttempts sends one queued Host per frame, unreliable
  (sendInputsService.ts:305-318).
- In effect: about 1.5 s after an unhosted NPC streams in, the first client
  whose game shows it asks, and wins. Two players arriving together can
  split one cell's NPCs between them.

### 2.3 HostStart and HostStop

remoteServer.ts:153-179 adds the target to, or filters it from,
`storage['hosted']` (Skyrim Platform storage, so it survives hot reloads).
Hosted-ness is read back by formView (413-427, 478-486), hitService
(C/services/services/hitService.ts:23-41) and magicSyncService
(C/services/services/magicSyncService.ts:62-64, 113-120).

### 2.4 What a host sends for a hosted NPC

sendInputsService.ts:111-129 runs every frame over `[player, ...hosted]`:

- movement every 130 ms, unreliable (131-153): position, rotation, run
  mode, direction, jump, sneak, block, drawn, isDead, health percentage,
  speed, and `lookAt`, the combat target's position (C/sync/movementGet.ts:
  34-95; 46-56);
- animation events through an AnimationSource on the NPC's local reference
  (216-252);
- not appearance or equipment (254-256, 279-282);
- actor values in principle, but from `Game.getPlayer()` (166) and behind
  the player's own change test, so in practice never for an NPC;
- hits with a hosted aggressor (hitService.ts:17-41) and casts by hosted
  casters (magicSyncService.ts:62-64). Actions (cast-action) are the
  player's only (docs/verbs/cast-action.md:229).
- Nothing for inventory, packages, combat state or the target's identity.

### 2.5 How a non-hosted NPC is shown

- Movement is applied while isHostedByOther is true, or once at spawn
  (formView.ts:445-472): `translateTo` toward the report plus a speed lead,
  `setPosition` for a jump of 1024 or more (C/sync/movementApply.ts:
  198-256); head tracking on the closest actor within 128 units of
  `lookAt`; `blockActivation`; KeepOffsetFromActor on itself with the
  report's direction (72-98), the trick that holds the AI's own movement;
  sprint, block, sneak, drawn and a 25% step toward the health percentage
  (63-67, 172-186); death through applyDeathStateEvent (69). A report from
  another cell, or across cells while unloaded, throws RespawnNeededError
  and the view respawns (258-266). `ac.stopCombat()` is commented out (58).
- Animation: every relayed event is replayed (formView.ts:501-515). For a
  view with default animations disabled (not hosted here), any event
  containing "attack" is blanked unless relayed (C/sync/animation.ts:
  383-394, 231-240).
- Death (C/services/services/deathService.ts:83-118): kill is
  endDeferredKill plus kill; a resurrect throws RespawnNeededError so the
  view respawns.

### 2.6 AI suppression

None. No EnableAI, SetDontMove (other than the player's own, deathService
and sweetTaffyPlayerCombatService), SetRestrained, StopCombat or
EvaluatePackage call on NPCs anywhere in the client. Skyrim Platform exposes
all of them: `enableAI` (SPT:2009), `evaluatePackage` (2016),
`getCombatTarget` (2033), `getCurrentPackage` (2035), `setDontMove`
(2151), `setRestrained` (2170), `startCombat` and `stopCombat`
(2179-2183). Caveat for the lazy path: the Creation Kit wiki notes that
disabling an actor's AI also disables its Havok processing, and a moved
actor with AI off can hover or leave its model behind.

### 2.7 Collateral on the host's own NPCs (HYPOTHESIS, code reading)

- Every idle of every 0xff actor is blanked unless it was relayed
  (animation.ts:400-411). The host's NPCs are 0xff copies, so their package
  idles (sandbox, chairs, work) never play, and so are never sent.
- Every `staggerStart` and `KillMove*` on a 0xff actor is blanked unless
  relayed (deathService.ts:31-61), while the server skips stagger for NPC
  targets expecting the host to stagger them (S/ActionListener.cpp:
  3333-3336). Result: NPCs never stagger.
- Echo: RelayToListeners sends a hosted NPC's movement and animation back
  to its host too (S/ActionListener.cpp:108-118; OnUpdateAction excludes
  the sender at 318, these do not). The host's view replays every relayed
  animation on its own NPC (formView.ts:501-515), and its AnimationSource
  hook then reports the replay if the graph took it: a double play, and
  possibly a loop. The movement echo is harmless only while the host's
  isHostedByOther is false (see 1.6.1 for when it is not).
- Rule 9: each AnimationSource adds an unfiltered `sendAnimationEvent` hook
  (no minSelfId, maxSelfId or pattern) and filters in JavaScript; none is
  ever removed, and a respawned copy gets a new one
  (animation.ts:242-261; sendInputsService.ts:222-229). The blocking hook
  at animation.ts:383-415 is unfiltered too.

### 2.8 Engine events the client already has but does not use

Skyrim Platform publishes, from SKSE sinks (skyrim-platform/src/
platform_se/skyrim_platform/EventHandler.h:33-53, 473-511):
`cellFullyLoaded` (SPT:626), `cellAttach` and `cellDetach` (737-740),
`combatState` with actor and target (644; RE::TESCombatEvent,
CommonLibSSE-NG include/RE/T/TESCombatEvent.h:16-24), `packageStart`,
`packageChange`, `packageEnd` (766-772), `deathStart` and `deathEnd`
(650-653), `moveAttachDetach` (617), `objectLoaded` (614),
`locationChanged` (746). skymp5-client subscribes to none of them. ADR-034
says these come first.

## 3. NPC state on the server

### 3.1 Switches

- `npcEnabled` (S/WorldState.h:269), default false, read at
  skymp5-server/cpp/addon/ScampServer.cpp:239-251. The lab's
  server-settings.json does not set it.
- `npcSettings` and `defaultSetting` (S/WorldState.h:62-67, 270-271),
  read at ScampServer.cpp:253-288; documented at
  docs/docs_server_configuration_reference.md:346-388. Two upstream bugs:
  - the documented `npcSettings.default` is looked for at the top level of
    the settings, then `spawnInInterior` and `spawnInExterior` are read at
    the top level (ScampServer.cpp:257-263); a nested "default" just becomes
    a file name;
  - IsNpcAllowed returns false as soon as it meets a listed file name that
    is not loaded (S/WorldState.cpp:1189-1206), in unordered_map order, so
    one bad name (such as "default") can disallow everything.
- `disableVanillaScriptsInExterior`, default true (S/WorldState.h:274):
  non-"Sweet" scripts are stripped from exterior references
  (S/MpObjectReference.cpp:1813-1830).

### 3.2 Loading NPCs from the masters (AttachEspmRecord, S/WorldState.cpp:415-706)

Lazily, the 3x3 chunks around a moving reference (887-918). An ACHR is
skipped when:

- it starts dead (459-468, "TODO: Load dead references");
- it is initially disabled or deleted (470-492, "TODO: Load disabled
  references"), which drops quest-enabled actors;
- `npcEnabled` is false (494-500), or npcSettings disallows its file or its
  interior or exterior placement (504-516, 600-662);
- its base is essential, protected or unique (519-525; ACBS flags 0x2,
  0x800, 0x20 at libespm/src/NPC_.cpp:27-29);
- it is in a faction of CrimeFactionsList 0x26953 (527-552);
- its template-resolved race is in `bannedEspmCharacterRaceIds`
  (554-585; S/WorldState.h:276-287): the ten playable races ("Playable
  races from ArgonianRace to WoodElfRace"), fifteen other ids and the
  mannequin.

What survives is creatures and non-unique actors of non-playable races.
Named townspeople, guards, and humanoid bandits do not load. lab/esm.py can
count exactly which Riverwood and Bleak Falls Barrow ACHRs pass.

### 3.3 Other spawns

- Papyrus `PlaceAtMe` of an NPC_ makes a server actor (0xff id) at the
  caller, with its spawn point there (S/script_classes/
  PapyrusObjectReference.cpp:380-430); any other type becomes a plain
  reference, so a leveled list (LVLN) passed to it is not an actor.
  Explosions delegate to the clients (400-412).
- `PlaceActorAtMe` is missing (docs/NATIVES.md:1095).
- The gamemode's `createActor` and `place` (ScampServer.cpp:539-553,
  1129-1168).

### 3.4 What is persisted

MpChangeFormREFR (S/MpChangeForms.h:63-188), ACHR rec type: position,
angle, worldOrCell, inventory, `baseContainerAdded`, `isDisabled`,
`isDead`, actor value percentages, equipment, template chain, `spawnDelay`,
the respawn percentages, dynamic fields, running effects. Movement reports
mark the record for saving at most once per 30 s
(S/MpObjectReference.cpp:190-206, 1355-1360), so a restart returns an NPC
to where it was up to 30 s earlier. Inventory starts from the base
container and template once (EnsureBaseContainerAdded). Nothing about AI,
combat, packages or animation is kept.

### 3.5 Death and respawn

- Kill (S/MpActor.cpp:1869-1891): death state to the hoster
  (SendAndSetDeathState 1538-1564), DeathEvent, death items.
- DeathEvent::OnFireSuccess calls RespawnWithDelay for every actor, NPCs
  included (S/gamemode_events/DeathEvent.cpp:66-69).
- RespawnWithDelay (S/MpActor.cpp:1893-1965): after `spawnDelay`, 25 s by
  default (S/MpChangeForms.h:115; GetRespawnTime 2062-2065), the base
  inventory is re-added when the death item resolves to something, then
  Respawn fires RespawnEvent (1967-1975), whose OnFireSuccess sets alive,
  full percentages, and teleports (S/gamemode_events/RespawnEvent.cpp:
  25-31).
- An ESM NPC respawns at its editor location (GetSpawnPoint,
  S/MpActor.cpp:2003-2012).
- A record loaded dead is respawned (S/MpActor.cpp:811-815).

So deaths never persist, and a corpse lasts 25 s.

### 3.6 Papyrus lifecycle events

OnInit, OnCellLoad and OnLoad fire once per reference per server life, at
the first subscription by a player (S/MpObjectReference.cpp:987-993). The
server sends no OnDeath, OnDying, OnCombatStateChanged, OnCellAttach,
OnCellDetach, OnUnload or OnPackage* event (the full list of
SendPapyrusEvent names in S/ is OnActivate, OnCellLoad, OnHit, OnInit,
OnItemAdded, OnLoad, OnObjectEquipped, OnSpellCast, OnTrigger, OnUpdate,
SkympOnActivateClose).

### 3.7 When nobody is near

Nothing simulates it. Its record is the last accepted report. The hoster
entry stays (stale) until a client asks, 2 s or more after the last
report. Its chunk stays loaded (S/WorldState.cpp:915). Respawn timers and
running effects keep ticking (S/WorldState.cpp:156-198), so a poisoned NPC
keeps taking damage while frozen. That is "frozen at last recorded state"
by default, with no replay step for the next host beyond spawning at the
recorded position.

## 4. What the roadmaps and docs already say

skymp/ROADMAP.md, all TODO:

- NPC (48): make host change work, and combat, activation and equipment
  for NPCs; render NPC templates from the server; packages; NPCs travelling
  out of sight.
- Physics (34): kicking objects and movables "to do this, implement a host
  switching mechanism".
- Horses (52): "We must always host the horse we ride."
- Dungeon support (36): traps and puzzles, state saved on the server.
- Neighbours: Loot (49), corpse physics (50), dialogs (51), dragons (54),
  linked refs (65).

thuum:

- docs/PLAN.md:320-350, M3; M2's NPC spell classes (summons, calm, fear,
  frenzy, detection) move here (250-255).
- docs/DECISIONS.md:27-37, ADR-002 (per cell over SkyMP's per-actor
  mechanism; unhosted cells freeze).
- docs/TE-MAP.md:40-50: Skyrim Together wrote AI package sync and disabled
  it ("experiment didn't work"), and compiled out its own combat target
  selection.
- docs/verbs/validation.md:21-34, 39, 55, 60: the hosted-NPC gates above;
  "a hosted NPC's rejected move is dropped without a snap-back or a log
  line".
- docs/verbs/movement-speed.md:29-30 (hosted NPCs not charged, M3);
  melee-reach.md:27-28 (hits by hosted NPCs out of scope); spell-cast.md:
  105-107, 215 (an NPC the observer hosts is the NPC milestone's);
  cast-action.md:229 (hosted actors a later slice); player-globals.md:43
  (the summon is hosted, M3); ghostwalk.md:32 (other games' NPCs hear
  nothing, M3); marksman.md:241 (the shooter's game reports the hit).
- The wire already reserves the cell-host family, defined and validated
  but with no JSON form and no sender (docs/WIRE.md:121, 172-175):
  HostedActorState with transform, health and inventory deltas
  (W/wire-schema/src/lib.rs:224-240; validated at
  W/wire-validate/src/lib.rs:521-530), HostGrant { cell } and
  HostRelease { cell } (W/wire-schema/src/lib.rs:293-301), table rows at
  425-428, channel at W/wire-transport/src/channels.rs:38.

## 5. Against M3's list

| M3 item | State | What does it now |
| --- | --- | --- |
| Election: first to load a cell hosts it | partial | per actor, first client to ask (about 1.5 s after its game shows the NPC) wins: C/view/formView.ts:429-496, 724-738; S/ActionListener.cpp:1985-2019 |
| Reassign on leave, grace window | partial | an implicit 2 s lapse after the last accepted report, pulled by another client's ask, HostStop to the old host (S/ActionListener.cpp:1985-1989, 2039-2049); no release on disconnect (S/PartOne.cpp:558-582); no lowest-ping rule |
| Handoff moves NPC state, no visible teleport | partial, likely broken | the new host already shows the copy at the record's position and lets its AI take over at HostStart (formView.ts:413-427); moved: position, AV percentages after 1 s, EquipBestWeapon (S/ActionListener.cpp:2007-2037); not moved: AI, combat, package, graph state; isHostedByOther never updates for ESM NPCs (1.6) |
| Host's engine AI runs under packages | partial | on a `placeAtMe` copy of the base, not the cell's own reference (formView.ts:145-305); idles, stagger and kill moves blanked (animation.ts:400-411, deathService.ts:31-61) |
| Stream position, animation, combat targets, inventory (R2, R1 bounds) | partial | movement every 130 ms and graph events (sendInputsService.ts:111-153, 216-252); target only as a look-at point (movementGet.ts:46-56); no inventory, equipment, values or packages; bounds: same cell and under 4096 per report, no speed budget (S/MovementValidation.cpp:96-126) |
| Engine AI suppressed off the host; observers render relays | partial | KeepOffsetFromActor on itself plus translateTo (movementApply.ts:16-98, 198-256), attack events blocked unless relayed (animation.ts:385-394); AI never disabled although SP has enableAI (SPT:2009) |
| Unhosted cells freeze at last recorded state | exists, by omission | no simulation; record saved at most every 30 s (S/MpObjectReference.cpp:1355-1360); effects and respawn timers still run |
| Next host gets the state replayed before suppression ends | partial | spawn at the record, one movement apply (formView.ts:445-472), AV percentages 1 s after HostStart; no ordering, suppression ends at HostStart |
| Spawning rules server-side | partial | lazy chunk loads with filters that drop humanoids (S/WorldState.cpp:459-585); off in the lab; Papyrus PlaceAtMe of NPC_ (PapyrusObjectReference.cpp:380-430); PlaceActorAtMe missing; clients delete every other actor (worldCleanerService.ts:37-108) |
| Respawn rules server-side | exists, wrong policy | every death respawns after 25 s at the editor location (DeathEvent.cpp:68; S/MpActor.cpp:1893-1975, 2003-2012) |
| Deaths persist | missing | a record loaded dead respawns (S/MpActor.cpp:811-815); latecomers never see a corpse (formView.ts:73-78) |
| Physics host switching for movables | missing | ROADMAP.md:34; nothing in server or client |
| Horses, host follows rider | missing | ROADMAP.md:52; no mount code |
| Reach and cone for player on NPC and hosted NPC on anyone | missing | player against player only (S/ActionListener.cpp:2830-2857) |
| Exit: c-riverwood, c-dungeon-enemies | missing | no NPC scenario; the lab loads no NPCs; the loader drops Riverwood's named residents and humanoid bandits |

### Risks, biggest first

1. The NPC model is clone-and-clean, not TES3MP's. TES3MP's authority
   player runs the cell's own actors; SkyMP deletes them and runs a copy of
   the base. A copy lacks the original reference's linked refs, quest
   aliases, editor location, reference scripts and ownership (HYPOTHESIS
   until a lab run), each client rolls its own leveled variant, and the
   cleaner deletes engine-spawned actors (summons). "NPC schedules run
   under host one" depends on driving the original references. This is an
   ADR before any code: keep clones, or let the host's engine keep its own
   references and protect them from the cleaner.
2. The loader excludes the NPCs both exit scenarios need (3.2), and the
   lab has `npcEnabled` off; the npcSettings parser has two bugs (3.1).
3. Handoff signalling is broken for ESM NPCs (1.6.1): an observer that
   streamed an NPC in before it was hosted never follows the host; the old
   host's copy keeps running its own AI after HostStop; a new host that
   streamed it in as hosted-by-other puppets its own NPC with the echo of
   its own reports (formView.ts:451-457 with RelayToListeners including the
   sender). Plus the animation echo on the host (2.7). All HYPOTHESIS from
   reading; one two-seat probe settles them.
4. Election is client-pulled and unvalidated (1.2, 1.3): any client can
   take any reference by id when its report is 2 s stale, from anywhere,
   with no rate budget, loading chunks as it goes; hosted movement has no
   speed budget; a cell change is refused, so schedules through load doors
   strand NPCs; a disconnect does not release.
5. The path is lightly tested and has a second packet-reachable fault: one
   T0 case, no T2 session, no T3 scenario (1.8); the 1 s timer in
   OnHostAttempt throws inside the tick for a non-actor or a destroyed form
   (1.2). With M3's NPC counts, the unfiltered per-NPC animation hooks
   (2.7) are a frame-time risk.

Also open, smaller: deaths never persist and corpses last 25 s (3.5); no
NPC Papyrus death or combat events (3.6); the latent equipment and
change-values writes to the host player's record (1.4); idles, stagger and
kill moves blanked on the host's own NPCs (2.7); `hosters` and the idx
times leak or recycle (1.1).

### What already exists for the lazy path

- The per-actor gate (ActorUpdatableBy), HostStart and HostStop, the
  hoster routing (GetActorToSendTo, DelegateToHost): a cell host can be "a
  player who holds every actor of a cell" on top of them, as ADR-002 says.
- The reserved wire family: HostGrant { cell }, HostRelease { cell },
  HostedActorState (section 4).
- Skyrim Platform's engine events for the cell and AI moments (2.8), and
  its AI natives for suppression (2.6).
- TES3MP's rule to copy: first visitor gets authority; an entering player
  with a sufficiently better ping takes it over; on leave it passes to the
  lowest-ping visitor (CoreScripts 0.8.1 logicHandler.lua: LoadCellForPlayer
  about 839-859, UnloadCellForPlayer about 877-898, GetLowestPingPid about
  143-153, config.pingDifferenceRequiredForAuthority).

### Probes that would settle the hypotheses (cheapest first)

1. T0, no game: two NPCs near one host, a claim of the second; read the
   UpdateProperty messages UpdateHoster sends to the host (1.6.2). And a
   Host for a non-actor reference, then Tick past 1 s (1.2).
2. T2: a fakeclient session with two users: Host, HostStart, movement for
   the hosted actor, a 2 s silence, a second user's claim, HostStop to the
   first, a disconnect.
3. lab/esm.py over the masters: how many Riverwood and Bleak Falls Barrow
   ACHRs pass AttachEspmRecord's filters.
4. One T3 probe with a probe-only settings file (`npcEnabled: true`) and a
   creature that passes the filters (a wolf near the hunters' camp): c1
   streams it in first and hosts; c2 arrives; c1 leaves; watch c2's view
   (1.6.1 and the echo), its idles, and whether it staggers.

## References

- TES3MP CoreScripts 0.8.1, scripts/logicHandler.lua (cell authority:
  first visitor, ping takeover, lowest ping on leave):
  https://github.com/TES3MP/CoreScripts/blob/0.8.1/scripts/logicHandler.lua
- Bharambe, Pang, Seshan, "Colyseus: A Distributed Architecture for Online
  Multiplayer Games", NSDI 2006: one primary per object, replicas
  elsewhere, primaries migrated between nodes; the general form of a host
  handoff:
  https://www.usenix.org/legacy/event/nsdi06/tech/full_papers/bharambe/bharambe_html/
- Boulanger, Kienzle, Verbrugge, "Comparing interest management algorithms
  for massively multiplayer games", NetGames 2006 (tile-based interest
  management, SkyMP's grid): https://dl.acm.org/doi/10.1145/1230040.1230069
- Glenn Fiedler, "Networked Physics in Virtual Reality" (authority and
  ownership per object with sequence numbers; the model for physics host
  switching):
  https://gafferongames.com/post/networked_physics_in_virtual_reality/
- Creation Kit wiki, "EnableAI - Actor" (disabling AI also disables Havok
  processing): https://ck.uesp.net/wiki/EnableAI_-_Actor
