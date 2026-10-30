# The layer's quests: which must stay a seat's own when quest stages go world-wide

thuum-cf, 2026-10-29, for D58 B (the quest-stage verb widening from the curated sharedQuests list to
"every quest a seat starts is the world's, minus a denylist", fork m3-quest-mode): which quest ids the
alternate-start plugin runs that must stay per seat, which other layer quests must never cross (MCM,
maintenance, trackers), whether layer-render rewrites a hand-edited block in the server settings, and
playtest 38's finding 77 (a quest at 0x30002859 starting and stopping every 0.7 s on c1). Read by
apocrypha from the records and compiled scripts in lab/.cache (the layer's 91 plugins, every one found
locally; Live Another Life's archive; Skyrim.esm, Dawnguard.esm and Dragonborn.esm for the vanilla names),
2026-10-29. Ids are written local-id:plugin, the server's own spelling.

## 1. The alternate start (Live Another Life 4.2.6a): everything it runs is a seat's own

The start is one player's (ADR-055 D8: the mod supplies the room, the menu and the table; the server
performs the landing and the kit). Every quest and scene its scripts start, stop or stage must therefore
stay on the seat that casts it, or one player's choice at the statue advances the world's main quest.
From the plugin's VMAD properties and all 159 scripts:

Its own quests (eighteen; six start-game-enabled, marked *; the other twelve, the chargen and start quests, the
five controllers and the events, are started by its scripts or the story manager):
000daf ARTHLALChargenQuest, 07a334 ARTHLALRumorsOfWarQuest, 01189b ARTHLALFarmhouseProfits,
0194b5 ARTHLALAssaultFriendlies*, 03fda5 ARTHLALCheskoPolygonQuest, 049f33 ARTHLALVersionTracking*,
068ec0 ARTHLALHelgenNPCKillerQuest, 07026c ARTHLALPatch417Special*, 1219b6 ARTHLALBanditStartController,
126ab9 ARTHLALVampireStartController, 12bbbc ARTHLALL4DStartController, 284074 ARTHLALForswornStartController,
284076 ARTHLALFactionAssaultEvent, 284079 ARTHLALFactionKillEvent, 29847f ARTHLALWhiterunGuardConfrontationQuest,
2e43a8 ARTHLALPatch402Quest*, 3f59dd ARTHLALPatch417Quest*, 409dde ARTHLALPatch418Quest*; all
`:alternate start - live another life.esp`.

The vanilla and DLC quests its fragments drive for the chosen start (SetStage, Start, Stop,
SetObjective...; call sites in parentheses), which the denylist must carry whether or not the mod is
laid, since the same ids are the world's main quest and guild starts:
- Skyrim.esm: 03372b MQ101 (22), 04e50d MQ102 (12), 02bf9c MQ102A (13), 02610a MQ102B (12), 0d0800 MQ103 (2),
  01c5d9 MQ00 (2), 019e53 CW (2), 0d517a CW01A (4), 0e2d29 CW01B (4), 04b2d9 C00 (2), 0d19b9 CompanionsMiscObjective (1),
  01f251 MG01 (1), 054d0a MG01Pointer (1), 021556 TG00 (1), 064a14 TG00MaulHandler (2), 0c99ef TG00MiscHandler (1),
  01ea50 DB01 (1), 01ea51 DB02 (2), 050f2e DBEntranceQuest (5), 0a7b33 HousePurchase (4), 05f596 PerksQuest (2),
  017f05 DialogueMarkarth (1), 03907c DialogueOrcs (2), 0649fc DialogueRiftenMaul (4), 095f4f DialogueRiftenRatway (2),
  0e66fc DialogueRiftenGateGuards (4), 0d1984 DialogueWhiterunGuardGateStop (2), 0954d9 DialogueRiverwoodIntroScene (1);
  and the scenes it stops: MQ101's Helgen scenes (020167, 026358, 04679b, 04e1e2, 05b2cd, 05b3f0, 0aa7df, 0b622c,
  0b9670, 0becd4, 0bf48c, 0cd68e, 0e6d69, 0f5b51, 0f5b52, 0f5b53, 0f5bb7) and MQ102's (0d39c2, 0d50f3).
- Dawnguard.esm: 00352a DLC1VQ01 (16), 00d06c DLC1VQ01MiscObjective (24), 002f65 DLC1VQ02 (14),
  01a415 DLC1VQCastleGuard (2), 004e24 DLC1HunterBaseIntro (1), scene 0103a5 DLC1VQ02HarkonAndSeranaScene (2).
- Dragonborn.esm: 016e02 DLC2Init (1), 018b13 DLC2RR01 (1), 018b15 DLC2RR03 (1), 02adda DLC2RRArrivalScene (1).
- HearthFires.esm: 00305d BYOHHouseBuilding (3, the three homesteads' build quest).
thuum-cf's denylist already holds MQ101, MQ101DragonAttack, MQ102, MQ102A, MQ102B, MQ103, MQ104,
DLC1VQ01 (352a) and DLC2MQ01 (17f8e, Dragonborn's own main quest, which the alternate start does not
touch; the Raven Rock arrival it drives is 016e02 DLC2Init, 018b13 DLC2RR01, 018b15 DLC2RR03 and the
scene 02adda). The rest above is new to it. Under D62's rule (a start-game-enabled quest is each seat's own unless allowed), the twelve ARTHLAL quests
that are not start-game-enabled need the denylist; so do the four controller quests of the census that are
not (MAG_GeneralControllerQuest f4f8c0:MysticismMagic.esp, MAG_ThaumaturgyControllerQuest 000809:Thaumaturgy.esp,
GRIM_QST_TeleportManager 2725d0:LostGrimoire.esp, US_ApplyCorpseMonitorQuest 01e2c7:UndeadFX.esp). The eighteen
ARTHLAL quests and the alias and controller quests among them
(the bandit, vampire, left-for-dead and Forsworn controllers pick a random lair per seat) are the
sharpest case: a shared stage there would hand one player's random lair to everyone.

## 2. The layer's other quests: what must never cross, from the census

Every plugin of the load order read for its own QUST records: 250 quests across 29 plugins
(unofficial skyrim special edition patch.esp 136, Apocalypse - Magic of Skyrim.esp 25, LostGrimoire.esp 19, Odin - Skyrim Magic Overhaul.esp 9, UndeadFX.esp 8, SkyUI_SE.esp 7, UnreadBooksGlow.esp 7, Dwemer Goggles & Scouter.esp 6, StealthKillDetectionFix.esp 4, IntuitiveDragonRideControl.esp 3, Better Stealth AI for Followers.esp 3, Jewelry limiter.esp 3, RaceMenuMorphsCBBE.esp 3, RLAiO.esp 2, GeneralDisplays.esm 1, TrueHUD.esl 1, RaceCompatibility.esm 1, Thaumaturgy.esp 1, MysticismMagic.esp 1, MoreCraftableEquipment.esp 1, TrueDirectionalMovement.esp 1, LRD.esp 1, Dynamic Activation Key.esp 1, RaceMenu.esp 1, RaceMenuPlugin.esp 1, SunAffectsNPCVampires.esp 1, VampireFeedingTweaks.esp 1, vampireinverterdg.esp 1, RaceMenuMiscSlider.esp 1). The server loads only the served plugins, so the quests of the client-only tail cannot be
world state at all: their form ids resolve to nothing in the server's load order, and the relay must
drop a quest whose plugin the server does not load (their client slots also differ from the server's
indices, since light plugins live in the FE space and the tail follows the served set). The candidates
that must stay per seat even though their plugins are served, by their names and scripts (MCM and
configuration menus, maintenance and version trackers, player-alias holders, controllers whose state is
one game's):

| quest | id:plugin | start game enabled | scripts | plugin served? |
| --- | --- | --- | --- | --- |
| UDGPVersionTracking | 002e7f:unofficial skyrim special edition patch.esp | yes | UDGP_VersionTrackingScript | served |
| UHFPVersionTracking | 002ea9:unofficial skyrim special edition patch.esp | yes | UHFP_VersionTrackingScript | served |
| UDBPVersionTracking | 00a317:unofficial skyrim special edition patch.esp | yes | UDBP_VersionTrackingScript | served |
| USKPVersionTracking | 00d8b9:unofficial skyrim special edition patch.esp | yes | USKP_VersionTrackingScript | served |
| USLEEPVersionTracking | 00f458:unofficial skyrim special edition patch.esp | yes | USLEEP_VersionTrackingScript | served |
| USKPWeaponRackPlayerMonitorQuest | 010800:unofficial skyrim special edition patch.esp | yes | - | served |
| USKPSoulTrapControllerQuest | 070e9f:unofficial skyrim special edition patch.esp | yes | uskpsoultrapcontroller | served |
| USSEPVersionTracking | 2c5562:unofficial skyrim special edition patch.esp | yes | USSEP_VersionTrackingScript | served |
| USSEPActorAliasHoldingQuest | 38d9b6:unofficial skyrim special edition patch.esp | yes | - | served |
| TrueHUD_MCM_Quest | 000800:TrueHUD.esl | yes | TrueHUD_MCM | served |
| MAG_ThaumaturgyControllerQuest | 000809:Thaumaturgy.esp | no | - | served |
| MAG_GeneralControllerQuest | f4f8c0:MysticismMagic.esp | no | - | served |
| ODN_QuestCompletionTracker_Quest | 1bf049:Odin - Skyrim Magic Overhaul.esp | yes | ODN_QuestCompletionTracker_Script | served |
| ODN_AbilityAdderAndRefresher_Quest | 1a09c4:Odin - Skyrim Magic Overhaul.esp | yes | ODN_Init_Script | served |
| MCEInit | 000800:MoreCraftableEquipment.esp | yes | MCEInitScript | served |
| TrueDirectionalMovement_MCM_Quest | 000800:TrueDirectionalMovement.esp | yes | TrueDirectionalMovement_MCM | served |
| WB_InvisibleManager_Quest | 003e91:Apocalypse - Magic of Skyrim.esp | yes | WB_Manager_Script | served |
| WB_SkyUI_Quest | 04013a:Apocalypse - Magic of Skyrim.esp | yes | WB_MCMQuest_Script | served |
| WB_NewManager_Quest | 08095c:Apocalypse - Magic of Skyrim.esp | yes | WB_NewManager_Quest_Script | served |
| _ts_DR_MCMQuest | 000811:IntuitiveDragonRideControl.esp | yes | _ts_DR_MCMConfig | served |
| djJewelryLimiterMCMQuest | 0012c9:Jewelry limiter.esp | yes | JewelryLimitMCM | served |
| StealthKillDetectionFix_QuestRecord | 000831:StealthKillDetectionFix.esp | yes | StealthKillDetectionFix_MCM StealthKillDetectionFix_MCMInitScript | served |
| DwemerGogglesScouter_SkyUIConfigQuest | 015bc9:Dwemer Goggles & Scouter.esp | yes | DwemerGogglesScouter_SkyUIConfigMenu | served |
| GRIM_QST__Main | 0012c5:LostGrimoire.esp | yes | GRIM_QF_GRIM_QST__Main_020012C5 GRIM__ModManagerScript | served |
| GRIM_QST_ALT_DimensionalDoor | 2632b5:LostGrimoire.esp | yes | GRIM_ALT_DimensionalDoor_manager | served |
| GRIM_QST_TeleportManager | 2725d0:LostGrimoire.esp | no | GRIM_TeleportManager | served |
| US_MCMQuest | 013be4:UndeadFX.esp | yes | us_mcmscript | served |
| US_ApplyCorpseMonitorQuest | 01e2c7:UndeadFX.esp | no | - | served |
| US_UndeadFXSetupQuest | 0012c5:UndeadFX.esp | yes | us_updatescript | served |
| SKI_ConfigManagerInstance | 000802:SkyUI_SE.esp | yes | SKI_QF_ConfigManagerInstance SKI_ConfigManager | client-only |
| SKI_SettingsManagerInstance | 00080a:SkyUI_SE.esp | yes | SKI_SettingsManager | client-only |
| SKI_MainInstance | 000814:SkyUI_SE.esp | yes | SKI_Main | client-only |
| SKI_ConfigMenuInstance | 000820:SkyUI_SE.esp | yes | SKI_ConfigMenu | client-only |
| SKI_ActiveEffectsWidgetInstance | 000822:SkyUI_SE.esp | yes | SKI_ActiveEffectsWidget | client-only |
| SKI_WidgetManagerInstance | 000824:SkyUI_SE.esp | yes | SKI_WidgetManager | client-only |
| SKI_FavoritesManagerInstance | 00082a:SkyUI_SE.esp | yes | SKI_FavoritesManager | client-only |
| RL_ManagerQuest | 000d62:RLAiO.esp | yes | RL_ManagerScript | client-only |
| RL_DetectionQuest | 002859:RLAiO.esp | yes | - | client-only |
| UBG20MaintQuest | 01156d:UnreadBooksGlow.esp | yes | - | client-only |
| UBG13UpdateQuest | 00c49e:UnreadBooksGlow.esp | yes | UBG13UpdateQuestScript UBG__QF_UBG13UpdateQuest_0100C49E | client-only |
| UBG20ConfigMenuQuest | 010546:UnreadBooksGlow.esp | yes | UBG20ConfigMenuQuestScript | client-only |
| UBG13PlayerQuest | 00df96:UnreadBooksGlow.esp | yes | - | client-only |

Of these the hard rule is the SKI_* family and every `*_MCM*`/`*Config*` quest (a menu's state is one
seat's), the version trackers (USSEP's six, Odin's and UBG's updaters: they stamp a save's version and
re-run fixes), the player-alias holders (USSEPActorAliasHoldingQuest, UBG13PlayerQuest, USKPWeaponRack
PlayerMonitorQuest: their alias is "the player", a different actor on every seat), and the magic
overhauls' controllers (MAG_GeneralControllerQuest, MAG_ThaumaturgyControllerQuest, WB_NewManager and
WB_InvisibleManager, GRIM_QST__Main and the two Lost Grimoire managers, ODN_AbilityAdderAndRefresher):
they add abilities to the player on their own game's clock. The Survival Creation's quests
(ccQDRSSE001-SurvivalMode.esl, the admitted plugin) are the same class: the needs are R3 in the player's
own game (ADR-044 decision 4), so SurvivalModeMainQuest and the Survival_* quests must not share stages
either; they are not in this table because the Creation is a game file, not a layer row, read from
lab/.cache/game.

The quests of the client-only plugins, per seat by construction (SkyUI, Reading List, Unread Books
Glow, RaceMenu, the CBBE sliders), listed so the relay's drop rule can be checked against them:

| quest | id:plugin | start game enabled | scripts | plugin served? |
| --- | --- | --- | --- | --- |
| UBG13DetectQuest | 00c49d:UnreadBooksGlow.esp | no | UBG13DetectQuestScript | client-only |
| UBG15DLCQuest | 00f51f:UnreadBooksGlow.esp | yes | - | client-only |
| UBGQuest | 003877:UnreadBooksGlow.esp | yes | UBGQuestScript UBG__QF_UBGQuest_01003877 | client-only |
| RaceMenuMiscSlider | 000800:RaceMenuMiscSlider.esp | yes | RaceMenuMiscSlider | client-only |
| RaceMenuMorphsCBBE | 000800:RaceMenuMorphsCBBE.esp | yes | RaceMenuMorphsCBBE | client-only |
| RaceMenuMorphsCBBEUIListMenu | 000801:RaceMenuMorphsCBBE.esp | yes | RaceMenuMorphsCBBEUIListMenu | client-only |
| RaceMenuMorphsCBBEUITextEntryMenu | 000802:RaceMenuMorphsCBBE.esp | yes | RaceMenuMorphsCBBEUITextEntryMenu | client-only |

Rotfern has no quests; RaceCompatibility's one (RaceDispatcher) only dispatches race-change events to the
player's own game. The full census (every plugin, every quest) is the TSV this page was built from; its
rows beyond the two tables are the mods' world content (USSEP's 136 quest fixes, Apocalypse's and Lost
Grimoire's spell quests, UndeadFX's corpse quests), the material the widening is for.

## 3. layer-render and the settings files

lab/tools/layer-render.py loads each of lab/deploy/sky-srv/server-settings.json and
server-settings-1.7.104.json, replaces only `loadOrder` from lab/layer/load-order.tsv, and writes the
whole file back as `json.dumps(indent=2)`. A hand-written block in either file survives a render (every
other key is kept), but the files are not generated from a template: edit them directly, both of them,
then run `python3 lab/tools/layer-render.py` once so the layout is the render's own, or `--check`
(which layer-stage runs) fails on the layout difference alone. The sharedQuests block today sits at line
275 of server-settings.json; the denylist belongs beside it in both files.

## 4. Finding 77: 0x30002859 is Reading List's detection quest, polling by design

Slot 0x30 on c1 is RLAiO.esp (Reading List All in One, client-only row 83). The clients' full slots
run masters 00 to 04, Fish 05, AdvDSGS 06, then the layer's full plugins in the engine's order (ESM
flags first), counted from the staged tree, where the two Survival warmth patches are light by their
build-time esl patch: 45 full layer plugins on a 1.6.1170 seat, RLAiO at 0x30 (rotfern 0x2F, Unread
Books Glow 0x31), 42 on a 1.7.104 seat (no RaceMenu.esp, RaceMenuPlugin.esp or RaceMenuMorphsCBBE.esp),
RLAiO at 0x2E. (A first version of this page put RLAiO at 0x32 on 1.6.1170: it counted the two patches
as full from their unpatched cache copies; thuum-cf's trace of run 20261030-134416, a 1.6.1170 seat with
the quest at 0x30, caught it. Slot arithmetic has to read the staged tree's flags, as layer-stage's
load-order check does.) The quest is 002859 RL_DetectionQuest, start
game enabled, one alias DetectedBook (optional, find the closest matching reference in the loaded
area, flags 0x6022) carrying RL_DetectedBookScript. The loop is the mod's design: the manager
RL_ManagerQuest (000d62, RL_ManagerScript, which extends SKI_ConfigBase) has `TriggerReset()` =
`RL_DetectionQuest.Stop()` then `RegisterForSingleUpdate(UpdateInterval)`, `OnUpdate()` =
`RL_DetectionQuest.Start()` unless uninstalling, and the alias script's `OnInit` adds the found book to
a form list and calls `TriggerReset()`; `UpdateInterval` defaults to 0.5 s in the compiled script (no
record sets it), so with the quest's own start and stop the period lands near the 0.7 s measured. It is
a per-seat book radar, costing a quest start and stop per 0.5 s per seat and a line pair in the
driver's log; the server never sees it (client-only plugin). Note for docs/verbs/papyrus-events.md:
the loop running means the alias's `OnInit` reaches the script although RLAiO is not an admitted plugin
(the manager's `OnUpdate` is, through the SKI chain); either the block does not cover OnInit, or the
quest's start and stop alone produce the pair (HYPOTHESIS, one read: the driver's lines with the form
list's growth). A layer fix is not needed for correctness; if the log or the CPU matters, the choices
are a VMAD property override of `UpdateInterval` on 000d62 (a new patch kind that adds a property value
to a record's script, size-changing) to a few seconds, or dropping Reading List from the set, Eli's
mod and Eli's call.
