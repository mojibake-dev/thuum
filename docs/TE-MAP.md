# The Skyrim Together map (ADR-005)

Skyrim Together Reborn (TiltedEvolution, github.com/tiltedphoques/TiltedEvolution,
GPL-3.0-or-later) is read here as a map of which engine functions matter, never
as a source: no code from it enters this repo (ADR-005). Its model is the
opposite of ours on state ("Client-authoritative, the server mostly relays... It
never simulates Skyrim"; one owner client per actor; the party leader's game is
the world; clients trusted, its AGENTS.md) and the same as ours on simulation
(its owner client is our cell host, rung R2), which is why its hook points
carry over and its sync logic does not.

How to use a row: TE resolves every engine function by one Address Library id,
and for 1.6.1170 that id is the AE id we use (TE's AGENTS.md: 1.6.1170 and
1.7.104 have "effectively identical" engine code and ids; cross-checked against
this fork's Offsets.h, where the same numbers sit in the AE slot of
RELOCATION_ID pairs). TE is not one of rule 1's sources: an id from here is a
lead, resolved with `just addr` and read in Ghidra (the re-analyst) before any
code uses it. Where SKSE or the engine publishes the moment as an event, that
comes first (ADR-034).

Read 2026-10-16 (TE branch dev, an agent's read for thuum-magnus; the per-row
data stayed in that session's scratchpad). About 150 engine references over 25
client files; TE uses its own reversed headers, not CommonLibSSE-NG.

## Nearest to our work

| engine function (TE's name) | AE id | what TE does there | our verb | event instead? |
| --- | --- | --- | --- | --- |
| ActorMagicCaster::InterruptCast | 34140 | fires on a local actor's cast interruption, a stagger's included | stagger, cast-action (the staggered charge that lingers on a figure) | none; SKSE's ActionEvent has no interrupt |
| MagicTarget::AddTarget | 34526 | branches on local or remote caster and target, carries magnitude and a dual-cast flag, leaves summon, ward and invisibility effects out of its own sync | magic-effects, the perk's dual-cast multiplier, Apocalypse effects | TESMagicEffectApplyEvent lacks magnitude and the dual flag |
| Actor::InitializeSummonCreatureEffect, ModManager::SpawnNewREFR | 34989, 13723 | the summon effect's init (suppressed on remotes) and the generic reference spawn (call only) | Apocalypse summons | none; how TE replicates a summon is not visible in its code: an RE pass first |
| Actor::InitiateMountPackage | 37905 | fires a mount event for a local rider; no dismount hook anywhere | horses | none |
| MenuTopicManager::PlayDialogueOption, Actor::SpeakSoundFunction | 35269, 37542 | the player's dialogue choice; NPC speech | dialogue | none |
| SubtitleManager::ShowSubtitle | 52626 | stamps the running scene on a subtitle; scenes are never centrally synced in TE | scenes | none |
| TESObjectREFR::Activate, LockChange | 19796, 19512 | an actor's activation (door state, count); a lock's change | activation-reach, furniture, containers, self-cast (19796 ends concealment) | TESActivateEvent, TESFurnitureEvent, TESLockChangedEvent for the observer side |
| InvisibilityEffect::Finish | 34370 | force-zeroes a remote actor's Invisibility value early, because it "lags" (TE's words) | self-cast (the same class as playtest nineteen's recast, a different cause) | TESActiveEffectApplyRemoveEvent |
| Projectile::Launch | 44108 | builds a launch event (origin, angles, weapon, ammo, spell, source, power read after auto-aim), concentration spells excluded | marksman, spell-cast (we read the arrow at its first update instead, InitVelocity 44184) | none |
| ActorMediator::PerformAction (+ 38953, 39004, 403567) | 38949 | its one action hook, the shape of our cast-action | cast-action | SKSE's ActionEvent is narrower (11 fixed kinds) |

## Cautions: what TE tried and dropped

- AI package sync (References CheckForNewPackage 39114, InitFromPackage 38959): written,
  disabled, "experiment didn't work". Our canonical R2 example (NPC package movement):
  read it before attempting it.
- CombatController::UpdateTarget 33236: a full reimplementation of target selection,
  compiled out. Against our law (we do not reimplement what a host runs);
  TESCombatEvent is the native thing to try first.
- A patch to the Papyrus VM's object equality (CompareVariables 105220) to treat two
  players as one, dropped because it broke beast form: a dedicated native beats a VM
  patch (docs/NATIVES.md).
- Weather (Sky SetWeather 26241, ForceWeather 26243, UpdateWeather 26231): the gates
  are compiled out, so TE's weather is not actually the leader's; our clock
  (TimeManager::SimulateTime 36291) is done (docs/verbs/time.md).

## By subject, the rest

- Actions and animation: Actor::ActorProcess 37356 (per-actor tick, skipped on remotes);
  Actor::QueueUpdate 40255 (our QueueNinodeUpdate; SKSE's NiNodeUpdateEvent);
  TESObjectREFR::PlayAnimation 56205 and 56206 (compiled out in TE).
- Magic: ActorMagicCaster::SpellCast 34144; Actor::InterruptCast 38757 (the actor-level
  stop, not 34140); EquipManager equip and unequip of spells and shouts 38928 to 38935.
- Combat: Actor::DamageActor 37335 (TE's damage gate, local hittee only);
  ApplyActorEffect 35086; RegenAttributes 37448; ActorKnowledge::UpdateDetectionState
  42704 (a remote's NPCs never detect the local player); Actor::IsFleeing 37577.
- Movement: Actor::SetPosition 19790 and TESObjectREFR::RotateX/Y/Z 19787 to 19789
  (writes blocked on remotes); TESObjectREFR::InternalMoveTo 56626.
- Inventory: Actor::AddInventoryItem 37525, PickUpObject 37521, DropObject 40454;
  TESObjectREFR::AddInventoryItem 19708, RemoveInventoryItem 19689;
  PlayerCharacter::PickUpObject 40533.
- Quests: PlayerCharacter::SetWaypoint 40535, RemoveWaypoint 40536;
  BSScript::BindEverythingToScript 55739 (where TE registers its natives).
- Death: Actor::AddDeathItems 37198 (no loot for remotes); SetNoBleedoutRecovery 38533.

Open in TE's own code (not ours to resolve from it): ProcessResponse 39643 and
CheckForNewPackage 39114 have no typed this; UnEquipSpellInternal and
UnEquipShoutInternal share id 38903; two UI patches use raw addresses with no
Address Library id at all, which rule 1 forbids here.
