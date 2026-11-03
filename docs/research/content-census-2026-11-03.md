# Content census: behaviour keyed to named content, by ADR-063 decision 5

Read-only census, 2026-11-03 (playtest 41's root-cause plan, W3). ADR-063 decision 5: an allow-list, a named script, a
per-base lift or a special-cased quest item is a missing channel or a missing ownership rule, and the fix is the
channel or the rule, never one more name. Refs read: server `origin/m4-turbo2-union-srv-3`, client
`origin/m4-turbo2-chest`; thuum's lab/layer and lab/deploy/sky-srv as committed. Every hex id in the Rust crates sits
under `#[cfg(test)]` (fixtures, left out).

Roots: server `skymp5-server/cpp/server_guest_lib/` and `skymp-wire/crates/wire-rules/src/`; client
`skymp5-client/src/` and `skyrim-platform/src/platform_se/skyrim_platform/`; layers `lab/layer/`, settings
`lab/deploy/sky-srv/` (both server-settings files carry the same lists; they differ only in load order).

43 places in four groups: 8 server, 13 client and platform, 16 layers and settings, 6 scenario steps. Three have a
retirement planned (ADR-062 decision 1's two; ADR-045's forced aggression, still in code).

## (a) Server

| # | Where | What it gates | N | The channel or rule that replaces it | Planned |
| --- | --- | --- | --- | --- | --- |
| a1 | MpObjectReference.cpp:2319-2336, WorldState.h:469 | the server VM drops every script not prefixed "Sweet" on exterior references of the first five plugins; on by default, inert (one .pex shipped) | 1 prefix | ADR-062: the host runs world scripts; delete | none |
| a2 | MpObjectReference.cpp:2342-2348 | named scripts refused on the server VM: DA06PreRitualSceneTriggerScript, CritterSpawn | 2 | delete with a1 | none |
| a3 | PartOne.cpp:4960-4978 (ActionListener.cpp:3398) | a word is taught only through WordWallTriggerScript and its properties myWord01, myWord, wordWall01 | 1 class, 3 props | the TeachWord and UnlockWord hook (ADR-062's progression row) | none |
| a4 | scripted_effects.rs:33, 45-47, 77, 132 | Finger of Death's script arithmetic re-coded in Rust, one enum arm per scripted kill | 1 | the Kill hook as death evidence (ADR-062); player-vs-player numbers stay R0 | none (ADR-029) |
| a5 | bonds.rs, teleports.rs, headshots.rs, placements.rs | one mod mechanic each (Shadowbond, the cast-teleport permit, Headshot Kills, Raise Wall), driven by the (c) tables | 4 | owner channels: one's own movement, ScriptPlacement, the hand-off to the target's owner | placements (ADR-062) |
| a6 | ActionListener.cpp:2180, :2213, :4588; MpActor.cpp:2618; AnimationSystem.cpp:46; SweetHidePlayerNamesService.cpp:19 | upstream SweetPie's SweetCantDrop keyword and SweetPie.esp checks (dormant) | 6 sites | delete | none |
| a7 | CraftService.cpp:86-87 | tempering-bench keywords excluded from recipe matching | 2 | the bench type from the FURN record | none |
| a8 | engine-fixed ids (0x7 and 0x14; gold 0xf; lockpick 0xa; unarmed 0x1f4; MapMarker 0x10; XMarker 0x3b; Tamriel 0x3c; skill AVIFs 0x44c; ActorTypeUndead) | engine contracts | ~12 | keep | n/a |

## (b) Client and platform

| # | Where | What it gates | N | The channel or rule that replaces it | Planned |
| --- | --- | --- | --- | --- | --- |
| b1 | objectReferenceEx.ts:42-63, :89 | activationUnblockedBases: activation lifted per base form | 0 deployed, 8 in scenarios | the lift for every reference in a cell this seat hosts | ADR-062 d1 |
| b2 | FridaHooks.cpp:62, :81-130, :172-180 | script names admitted everywhere or host-only, from papyrus-scripts.txt | the TSV | the hosted-cell lift plus one hook per native | ADR-062 d1 (host rows) |
| b3 | FridaHooks.cpp:169, :344, :355, :365, :377 | the `ski_` prefix plus four named passes: RaceMenu*, GRIM_ALT_TeleportationMarker, WB_DestroyAfterDelay_Script, defaultDisableHavokOnLoad | 1 + 4 | UI scripts as R3; the caster's game owns what its cast placed; the host runs world scripts | ADR-044 d1 "until a root covers them" |
| b4 | FridaHooks.cpp:199 kNeverAdmitted | wb_invisprocteleport_script blocked on every seat | 1 | the bonded player's own game moves its player on the server's word | none |
| b5 | objectReferenceEx.ts:74, :88; modelApplyUtils.ts:44-58 | door base CaveGSecretDoor01 0x6f703 exempt from the door block; the server's open state applied by activating one reference, 0x460ca ("TODO: add more activators to support more cells") | 2 | ADR-062's SetOpen hook plus the activation relay | none |
| b6 | wordWallService.ts:67, :91 | only triggers of base 0x5095e are reported | 1 | the TeachWord hook | none |
| b7 | formView.ts:390-421 | aggression forced to 2 on server-made NPC copies of 14 races ("potential masterambushscript") | 14 | the host runs masterAmbushScript; the copy keeps its record's AI | ADR-045, still in code |
| b8 | puppetService.ts:660-664 | one hard-coded art-to-effect pair (the flame atronach's trail) | 1 | a generic ApplyArtObject native | none |
| b9 | headshotPredictionService.ts:36 | the client setting headshot-spells | 1 | sent by the server at login | none |
| b10 | spSnippetService.ts:115-117; remoteServer.ts:125-131, :1220 | the pickup sound chosen by "is it gold" (0x334ab, 0x14115); Iron Helmet 0x12e4d unequipped before RaceMenu | 3 | the item's own pickup sound; drop the helmet hack | none |
| b11 | sweetTaffy*Service.ts (index.ts:153-159, :182); formView.ts:1183 | upstream SweetPie perk and skill tables, live only if a plugin named sweetpie loads (dormant) | ~76 ids | delete | none |
| b12 | raceMenuService.ts:24, :104, :302 | RaceMenu.esp's hair-colour form 0x801 | 1 | keep (mod integration) | n/a |
| b13 | engine-fixed (PapyrusTESModPlatform.cpp:318 template NPC 0x10D13E; appearance.ts:132; timeService.ts:9-14; lockService.ts:171; hitService.ts:289) | engine contracts | | keep | n/a |

## (c) Layers and settings

| # | Where | What it gates | N | The channel or rule that replaces it | Planned |
| --- | --- | --- | --- | --- | --- |
| c1 | papyrus-admitted.tsv:8 | the Survival Mode plugin, whole | 1 plugin | the player's own effects | ADR-062 keeps it |
| c2 | papyrus-admitted.tsv:9 | word-wall scripts on every seat | 3 | the triggering player's game owns its trigger event | open |
| c3 | papyrus-admitted.tsv:10 | host-scoped world scripts | 18 | the hosted-cell lift | ADR-062 d1 |
| c4 | plugin-patches.tsv:11-16 | slow time removed record by record (Steady Hand twice, the Slow Time shout three times, Quick Reflexes) | 6 | one hook on the engine's time scale (the SlowTime effect type) | none |
| c5 | castTeleports | the permit for a cast's jump, and its look | 2 | the player owns its position (ADR-063 d1, d4) | none |
| c6 | bonds | Shadowbond | 1 | the hand-off to the target's owner | none |
| c7 | scriptedEffects | Finger of Death | 1 | the Kill hook | none |
| c8 | headshot.spells, headshot.races | the Headshot Kills rule; no vampire races, no rotfern race | 1 / 11 | the mod's own conditions (ADR-039) | none |
| c9 | playerGlobals | globals kept per player | 62 (53 Apocalypse, 8 Survival, 1 UndeadFX) | ownership by whoever writes the global | ADR-062 keeps the list |
| c10 | survivalFood | Survival's hunger-restore script re-coded on the server | 5 rows + a switch | the eater's game runs the effect; the need travels as a player global | none |
| c11 | cureSpells | Sanguinare Vampiris removed every minute | 1 | the vampirism verb | magic-effects.md only |
| c12 | restrictedRaces | rotfern's races reserved to profile 1 | 2 | keep (Eli's policy) | n/a |
| c13 | sharedQuestsMode denied and allowed; legacy sharedQuests | which quests are shared | 44 / 4 / 4 | a quest-ownership rule | none (ADR-008, ADR-056: lists by design) |
| c14 | propStatics | which movable-static bases count as props | 1 | a physics rule: a dynamic Havok body, not placed by a spell | none |
| c15 | spellPlacedObjects | Raise Wall | 1 spell, 2 objects | ScriptPlacement | ADR-062; its band is in the validator audit |
| c16 | weather.pools | Tamriel pinned to a fixed pool | 1 worldspace, 2 weathers | the game files' regions (already built) | none |

## (d) Scenario premises play lacks

| Step | Writes | N |
| --- | --- | --- |
| b-bleak-traps.yaml:30-31 (c1, c2) | activationUnblockedBases | 8 bases |
| b-puzzle-relay.yaml:26-27 | the same | 8 |
| b-object-anim.yaml:19-20 | the same | 8 |

No deploy file, installer, tool or justfile writes the key, so play never had it (F23, the spike wall). Not premises:
b-prop-push.yaml:32-33 sets propPhysics true (already the client default, propService.ts:1116); b-npc-loot.yaml:23 sets
server-port 1 only to keep c2 offline; b-quest-rumor.yaml:24-25 loads a trace-only Frida script.

## The five most likely to break content nobody listed

1. Word walls (a3, b6): the server accepts one class name and the client one base; the ADR-062 census's TeachWord row
   names other word-teaching scripts (dbsanctuarywordwalltriggerscript, defaultlearnwordonact), never reported or refused.
2. castTeleports (c5): any other teleport or blink spell is judged by the movement budget and sent back
   (cast-teleport.md:27-29).
3. sharedQuestsMode.allowed (c13): every start-game-enabled side quest outside the 4 stays one seat's (E_QUEST_OWN_START);
   D63 on growing the list is open (quest-stage.md:342).
4. CaveGSecretDoor01 (b5): any other reference of that base skips the door block and is driven through 0x460ca, a
   reference one cell has.
5. The slow-time patches (c4): only Skyrim.esm was read (MODS.md:672-673); any other slow-time effect changes one seat's
   clock.

Runner-up, b7: once ADR-062 slice 2 places scripted actors as server-made copies, the forced aggression reaches every
placed draugr, spider and wolf.

## Kept by design

The engine's fixed ids (a8, b13), restrictedRaces (c12, Eli's policy), RaceMenu's integration (b12), the load order.
Every other row is retired by its channel or carries a dated reason here.
