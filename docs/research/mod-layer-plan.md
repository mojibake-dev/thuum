# The shared mod set from Eli's ticks: a layer plan (2026-10-18)

Working plan for lab/tools/persist-mods.sh, drawn by apocrypha from Eli's ticks in docs/private/mods-fenestrate.md (113 of 210, 2026-10-18) under thuum-magnus's working resolutions of the six dependency gaps. **Every resolution is pending Eli**; the plan says what changes if he decides otherwise. Facts come from Fenestrate's Vortex state and deployment manifest (the read-only copies of 2026-10-18), the plugin headers, skse64.log, and the Nexus file lists; nothing here was tested on a lab seat.

## Working resolutions (pending Eli)

- **Drop Apocalypse and Tomebound Duplicate Spells Patch - Lore Magic of Skyrim** (gap 1: Tomebound is not in the set and the patch plugin masters Tomebound.esp).
- **Drop Armor and Clothing for Kids SE** (gap 3: RS Children Overhaul is not in the set and the plugin masters RSkyrimChildren.esm and RSChildren.esp).
- **Drop Survival Mode Patch Collection** (gap 5: its two plugins were disabled on Fenestrate and their masters (Cloaks of Skyrim, HDT Wet and Cold) are installed nowhere).
- **Drop Animals Report No Crimes - Dremora Merchant Addon (SkyPatcher)** (gap 6: a SkyPatcher config, and SkyPatcher is not installed).
- **Add Goam's Elven Ears (Old Version)** 1.0, Nexus 99528 file 422583 (gap 2: GoamElvenEarsRMIntegration.esp masters GoamElvenEars.esp; Eli wants the Ears slider); its plugin GoamElvenEars.esp is light and sat at loadorder.txt index 176 on Fenestrate.
- **Cloaks and Capes stays as installed** (gap 4 dissolves): Fenestrate's file is Nexus 2019 file 35552, the 1.4 main archive; its 43 deployed files are 34 textures, 8 meshes and Cloaks&Capes.esp, with no SMP physics configs, so it needs neither FSMP nor XPMSSE. The page's current title ("- FSMP - XPMSSE") describes the 1.5.1 All In One; the separate 1.4 "Faster HDT-SMP (FSMP)" file 811914 is not installed.
- **Parity on Fenestrate**: a dedicated Vortex profile mirroring this layer (magnus's proposal), so the 37 plugin-carrying mods Eli runs but did not tick come off that profile; client-only extras without plugins (ENB preset, textures, meshes) can stay.

## Size of the set

- 109 ticked mods kept plus 1 added = 110 mods; 91 plugins (42 full slots, 49 light), 31 SKSE DLLs, about 3.8 GB installed on Fenestrate (Vortex's modSize sum). Six of them are already in the layer (SKSE, RaceCompatibility, RaceMenu, CBBE, Lost Grimoire, Apocalypse) plus rotfern's fork.
- Creation Club content the set's plugins master, which the lab's game folders and the server's load order must carry: _resourcepack.esl, ccbgssse001-fish.esm, ccbgssse025-advdsgs.esm, ccbgssse031-advcyrus.esm, ccbgssse037-curios.esl, ccqdrsse001-survivalmode.esl, ccvsvsse003-necroarts.esl (counts: _resourcepack.esl x2, ccbgssse001-fish.esm x3, ccbgssse025-advdsgs.esm x2, ccbgssse031-advcyrus.esm x1, ccbgssse037-curios.esl x2, ccqdrsse001-survivalmode.esl x4, ccvsvsse003-necroarts.esl x2). The server already loads the full-slot CC plugins (docs/LAB.md) and reads light ones since the light-plugins verb; the ESL ones here (curios, survivalmode, necroarts, _ResourcePack) are light.
- All 31 DLLs loaded correctly on 1.6.1170 under SKSE 2.2.6 (Fenestrate's skse64.log, 2026-07-22). None has been run on 1.7.104; RaceMenu (skee64.dll) and CIF 1.2.8 are known 1.6.1170-only (docs/MODS.md). So the DLL mods enter the 1.6.1170 folder first (`<mod>@1.6.1170` where a 1.7.104 build is not confirmed) and the 1.7.104 set takes each one after a seat test; the Address Library "all game versions" file is the first thing to test there.

## Load order

Eli's own loadorder.txt order, kept for the ticked plugins (it is the order his game ran with; relative order among them is what matters). Base masters and the CC set come first as today; `@idx` is the Fenestrate index for reference. The lab's existing eight (RaceCompatibility.esm, rotfern.esp, RaceMenu.esp, RaceMenuPlugin.esp, LostGrimoire.esp, Apocalypse, CBBE.esp, RaceMenuMorphsCBBE.esp) keep their relative order inside this list, but their absolute indices change: every player and the server must take the new list together.

Client-only proposal (docs/MODS.md's CBBE rule: a plugin stays on the clients when no server state names its forms, and such plugins go last so the server's list is a prefix of the clients'): skyui_se.esp (UI), mcmhelper.esp (UI config), truehud.esl (HUD), nmneb.esp (image space only), cbbe.esp (already client-only (MODS.md)), racemenumorphscbbe.esp (already client-only (MODS.md)), racemenumiscslider.esp (RaceMenu sliders), rlaio.esp (book-tracking UI (Reading List)), unreadbooksglow.esp (book glow, client visual), disablespelllight_prebuilt.esp (spell light removal (visual), see note). DisableSpellLight_Prebuilt.esp overrides spell and effect light fields; if the server's magic path reads those records it belongs on the server instead. magnus decides.

| order | plugin | type | from | server |
| --- | --- | --- | --- | --- |
| 1 (@080) | unofficial skyrim special edition patch.esp | ESM | Unofficial Skyrim Special Edition Patch - USSEP | yes |
| 2 (@082) | GeneralDisplays.esm | ESM | General Displays SE | yes |
| 3 (@085) | ApachiiHair.esm | ESM | Apachii Sky Hair SSE | yes |
| 4 (@086) | Conjuration Summoner Perk Applies to All Creatures.esl | ESM, light | Conjuration Summoner Perk Applies to All Creatures | yes |
| 5 (@087) | RaceCompatibility.esm | ESM | RaceCompatibility for Skyrim Special Edition | yes |
| 6 (@097) | Thaumaturgy.esp | ESP | Thaumaturgy - An Enchanting Overhaul | yes |
| 7 (@098) | MysticismMagic.esp | ESP | Mysticism - A Magic Overhaul | yes |
| 8 (@100) | ExtraDwemerHighFurniture.esp | ESP | Dwemer High Furniture | yes |
| 9 (@101) | Odin - Skyrim Magic Overhaul.esp | ESP | Odin - Skyrim Magic Overhaul | yes |
| 10 (@102) | MoreCraftableEquipment.esp | ESP | More Craftable Equipment - Unenchanted Clothing and Specialty Gear | yes |
| 11 (@104) | Playable Headparts All Races.esp | ESP | Playable Headparts All Races SE | yes |
| 12 (@105) | DigitigradeKhajiit+ArgonianRaptor.esp | ESP | Digitigrade Beast Races for Skyrim SE | yes |
| 13 (@107) | SpellAbsorptionAndTwinSoulsFix_SE.esp | ESP, light | Spell Absorb and Twin Souls Fix - SE Port | yes |
| 14 (@108) | SimplyBiggerTreesSE.esp | ESP | Simply Bigger Trees SE - Lush Vanilla Forests | yes |
| 15 (@111) | LetMeDropIt.esp | ESP, light | Let Me Drop It (Removable Quest Items) | yes |
| 16 (@112) | Vanilla Civil War Dialogue Fix.esp | ESP, light | Vanilla Civil War Dialogue Fix | yes |
| 17 (@118) | BlackBookNoQuest.esp | ESP, light | Droppable Black Books and Elder Scrolls | yes |
| 18 (@119) | ElderScrollNoQuest.esp | ESP, light | Droppable Black Books and Elder Scrolls | yes |
| 19 (@122) | _001_SelfFillingBookshelves.esp | ESP | Self Filling Bookshelves SE | yes |
| 20 (@124) | mihailcrowsandravens.esp | ESP, light | Crows and Ravens- Mihail Monsters and Animals (SE-AE version) | yes |
| 21 (@125) | Necromantic Grimoire - Mysticism Rebalance.esp | ESP, light | Necromantic Grimoire - Mysticism Rebalance | yes |
| 22 (@127) | rmp_telvannihearthfires.esp | ESP | Tel Jerdein - Telvanni Sorcerer Tower | yes |
| 23 (@129) | SummonsOfApocrypha.esp | ESP, light | Summons of Solstheim Lurkers Werebears and more - SE Conversion | yes |
| 24 (@130) | EVE - House Telvanni Banners Restored.esp | ESP, light | House Telvanni Banners Restored - Cut Content Restoration | yes |
| 25 (@131) | TrueDirectionalMovement.esp | ESP, light | True Directional Movement | yes |
| 26 (@133) | Prometheus_BeastSkeletons.esp | ESP | Beast Skeletons | yes |
| 27 (@134) | Apocalypse - Magic of Skyrim.esp | ESP | Apocalypse - Magic of Skyrim | yes |
| 28 (@135) | mihailringneckedpheasant.esp | ESP, light | Ring-necked Pheasants - Mihail Monsters and Animals (SE-AE version) | yes |
| 29 (@138) | IntuitiveDragonRideControl.esp | ESP, light | Intuitive Dragon Ride Control (SE) | yes |
| 30 (@139) | Better Stealth AI for Followers.esp | ESP | Better Stealth AI for Followers | yes |
| 31 (@140) | Jewelry limiter.esp | ESP | Jewelry Limiter - Another Multiple Rings and Amulets Mod | yes |
| 32 (@141) | Vampiric Grip.esp | ESP | Vampiric Grip as a Destruction Spell | yes |
| 33 (@145) | mihailatmoranremains.esp | ESP, light | Ancient Atmoran Remains- Mihail's Shards of Immersion (SE-AE version) | yes |
| 34 (@146) | mihailmagicladder.esp | ESP, light | Mystic Steps- Mihail Powers and Spells (SE-AE) (''alteration'') | yes |
| 35 (@148) | LRD.esp | ESP | Let's Ride Durnehviir | yes |
| 36 (@154) | StealthKillDetectionFix.esp | ESP, light | Stealth Detection Fixes | yes |
| 37 (@155) | Portal.esp | ESP | Portal - Dynamically Placed Teleportation SE | yes |
| 38 (@157) | All Eyes for All Races.esp | ESP, light | All Eyes for All Races | yes |
| 39 (@159) | SimpleFireWyrmFix.esp | ESP, light | Dragonborn DLC fixes | yes |
| 40 (@161) | Ring of Namira - Improved.esp | ESP, light | Ring of Namira - Improved | yes |
| 41 (@162) | Better Vampire Lord plus Serana Fix EN.esp | ESP | Better Vampire Lord plus Serana Fix (English) | yes |
| 42 (@163) | ChitinGoggles.esp | ESP | Chitin Goggles | yes |
| 43 (@164) | Dynamic Activation Key.esp | ESP, light | Dynamic Activation Key | yes |
| 44 (@165) | Dwemer Goggles & Scouter.esp | ESP | Dwemer Goggles and Scouter | yes |
| 45 (@168) | RaceMenu.esp | ESP | RaceMenu | yes |
| 46 (@169) | RaceMenuPlugin.esp | ESP | RaceMenu | yes |
| 47 (@171) | DualCastingCostPowerTweak.esp | ESP | Dual Casting Cost vs. Power Tweak | yes |
| 48 (@174) | ArchmageRobeLearn.esp | ESP, light | Learnable Archmage Robes Enchantment | yes |
| 49 (@175) | LoweredFurHoods.esp | ESP, light | Lowered Fur Hoods | yes |
| 50 (@176) | GoamElvenEars.esp | ESP, light | Goam's Elven Ears (Old Version) | yes |
| 51 (@177) | NARC SE for Vanilla.esp | ESP, light | NARC Remade  - No Animals Report Crimes for Skyrim SE | yes |
| 52 (@178) | Next-Gen Decapitations.esp | ESP, light | Next-Gen Decapitations | yes |
| 53 (@179) | Cloaks&Capes.esp | ESP | Cloaks and Capes - FSMP - XPMSSE | yes |
| 54 (@180) | NB-FurHoods.esp | ESP | Northborn Fur Hoods | yes |
| 55 (@181) | LostGrimoire.esp | ESP | Lost Grimoire SSE | yes |
| 56 (@182) | dremora_merchant_upgrade.esp | ESP, light | Better Dremora Merchant and merchant gold tweaks | yes |
| 57 (@183) | Headshot Kills.esp | ESP, light | Headshot Kills - CIF | yes |
| 58 (@186) | GoamElvenEarsRMIntegration.esp | ESP, light | Goam's Elven Ears - Proper RaceMenu Integration | yes |
| 59 (@187) | Silent Reanimated Corpses.esp | ESP | Silent Reanimated Corpses | yes |
| 60 (@188) | SunAffectsNPCVampires.esp | ESP, light | Sun Affects NPC Vampires | yes |
| 61 (@189) | SunAffectsNPCVampires-Hooded.esp | ESP, light | Sun Affects NPC Vampires | yes |
| 62 (@190) | Survival Mode Vampire Patch.esp | ESP | Survival Mod Vampire Patch | yes |
| 63 (@191) | Supernatural Survival Tweaks - Cold Resist Werebeast and Vampire.esp | ESP, light | Supernatural Survival Tweaks - Werewolf Werebear and Vampire Cold Survival | yes |
| 64 (@192) | UndeadFX.esp | ESP | Undead FX | yes |
| 65 (@193) | SummonsReleveled.esp | ESP | Summons Releveled | yes |
| 66 (@196) | mihailhelhest.esp | ESP, light | Draugr Horse Mount- Mihail Monsters and Animals (SE-AE version) (''undead'') | yes |
| 67 (@197) | Stab the heart.esp | ESP, light | Stab The Heart - CIF | yes |
| 68 (@198) | VampireFeedingTweaks.esp | ESP, light | Vampire Feeding Tweaks | yes |
| 69 (@200) | RaceCompatibilityUSKPOverride.esp | ESP | RaceCompatibility for Skyrim Special Edition | yes |
| 70 (@201) | MoreCraftableEquipment_AdvCyrus.esp | ESP, light | More Craftable Equipment - Unenchanted Clothing and Specialty Gear | yes |
| 71 (@202) | MoreCraftableEquipment_BYOHLooms.esp | ESP, light | More Craftable Equipment - Unenchanted Clothing and Specialty Gear | yes |
| 72 (@203) | MoreCraftableEquipment_CloaksandCapes.esp | ESP, light | More Craftable Equipment - Unenchanted Clothing and Specialty Gear | yes |
| 73 (@204) | MoreCraftableEquipment_Fish.esp | ESP, light | More Craftable Equipment - Unenchanted Clothing and Specialty Gear | yes |
| 74 (@205) | MoreCraftableEquipment_USSEP.esp | ESP, light | More Craftable Equipment - Unenchanted Clothing and Specialty Gear | yes |
| 75 (@206) | VampireLordsCanActivate.esp | ESP | Vampire Lords Can Activate | yes |
| 76 (@207) | LoweredHoods.esp | ESP, light | Lowered Hoods | yes |
| 77 (@208) | LoweredHoods_CCNecromanticGrimoire.esp | ESP, light | Lowered Hoods | yes |
| 78 (@209) | LoweredHoods_MoreCraftableEquipment.esp | ESP, light | Lowered Hoods | yes |
| 79 (@210) | LoweredHoods_MoreCraftableEquipment_CCNecromanticGrimoire.esp | ESP, light | Lowered Hoods | yes |
| 80 (@214) | vampireinverterdg.esp | ESP | Vampirism Inverter Dawnguard | yes |
| 81 (@229) | rotfern.esp | ESP | rotfern | yes |
| 82 (@083) | TrueHUD.esl | ESP, light | TrueHUD - HUD Additions | client-only (proposed) |
| 83 (@091) | SkyUI_SE.esp | ESP, light | SkyUI | client-only (proposed) |
| 84 (@120) | RLAiO.esp | ESP | Reading List SSE | client-only (proposed) |
| 85 (@121) | UnreadBooksGlow.esp | ESP | Unread Books Glow SSE with MCM | client-only (proposed) |
| 86 (@151) | NMNEB.esp | ESP | No More Night Eye Blur | client-only (proposed) |
| 87 (@152) | MCMHelper.esp | ESP, light | MCM Helper | client-only (proposed) |
| 88 (@153) | DisableSpellLight_Prebuilt.esp | ESP, light | Stealth Detection Fixes | client-only (proposed) |
| 89 (@167) | CBBE.esp | ESP, light | Caliente's Beautiful Bodies Enhancer -CBBE- | client-only (proposed) |
| 90 (@170) | RaceMenuMorphsCBBE.esp | ESP | Caliente's Beautiful Bodies Enhancer -CBBE- | client-only (proposed) |
| 91 (@184) | RaceMenuMiscSlider.esp | ESP, light | Racemenu Misc Slider - More Bodymorph Slider for Racemenu | client-only (proposed) |

## Nemesis: how True Directional Movement's behaviour output travels

TDM is the only ticked mod with a Nemesis patch (195 files under Nemesis_Engine\mod\, Fenestrate's manifest); Precision, XPMSSE and Ultimate Combat, which also carry patches, are unticked. On Fenestrate the generated output is 57 files attributed to the Nemesis mod folder: 44 behaviour .hkx under meshes\actors\character\behaviors and ...\_1stperson\behaviors, meshes\nemesis_animationdatasinglefile.txt, meshes\nemesis_animationsetdatasinglefile.txt, and the Nemesis Papyrus scripts (nemesis.pex, nemesis_aa.pex, nemesis_aa_reset.pex, nemesis_aa_skse.pex) plus the engine's own 8,581 files.

Recommendation: **generate once and ship the output**, not per client. Reasons: the behaviour files must be identical on every client for the same patch set (a mismatch is an animation desync nobody can see in a log); Nemesis is a Windows tool that would have to be installed and run on every seat and on every player's machine, with the same patch selection, after every layer change; and the output is 57 small files. Procedure: on one seat with exactly the layer's mods and nothing else, run Nemesis with only the TDM patch (tdmv) selected, take the 57 generated files into a layer mod `nemesis-output` (Data layout, like the others), record the patch list and the Nemesis version in its README, and regenerate whenever a mod with a Nemesis patch joins or leaves the set. The Nemesis engine folder itself (8,581 files) and FNIS stay out of the layer. If Eli prefers per-client generation, every client needs Nemesis installed and the layer must ship the TDM patch folder (it does, as part of TDM) and a documented run; the output must still match the server's expectations only insofar as animation events are concerned, which the server does not read today.

## Fetch table for persist-mods

Nexus mod and file ids and the archive md5 are Vortex's own records of what Fenestrate installed (state.v2 attributes modId, fileId, fileMD5), so persist-mods can fetch the identical file with the Keychain's Nexus key and check it the way it checks RaceCompatibility today. FOMOD choices are the ones Vortex recorded on Fenestrate (installerChoices); persist-mods lays them out from the FOMOD config as it does for CBBE. "in the lab" marks what the layer already carries.

### Frameworks and dependencies

| mod | version | Nexus mod / file | archive md5 | ships | FOMOD choices on Fenestrate | note |
| --- | --- | --- | --- | --- | --- | --- |
| Address Library for SKSE Plugins | 11 | 32444 / 720756 | 7dfa9fe646185b06ecddd3493c28c415 | 22 SKSE config | none recorded |  |
| Base Object Swapper | 3.4.1 | 60805 / 647525 | 868102bb3305b76df9cc42b517ec55b0 | 1 DLL, 1 SKSE config | SSE v1.6.1130+ ("Anniversary Edition") | 1.6.1170 first |
| ConsoleUtilSSE NG | 1.5.1 | 76649 / 456904 | 60fa02cba74b7313fc567721f0ac3b8e | 1 DLL, 1 pex, 1 SKSE config | none recorded | 1.6.1170 first |
| Core Impact Framework (CIF) | 1.2.8 | 146873 / 721776 | 88ffc290d14e283f576bda68b0b246bd | 1 DLL, 2 SKSE config | none recorded | 1.6.1170 first; 1.2.8 is 1.6.1170-only; CIF 2.0.7 for 1.7.104 is cached (MODS.md) |
| Dylbills Papyrus Functions | 10.2 | 65410 / 645093 | 212dff8be52235bc0fe3107a5f5d9eb8 | 1 DLL, 21 pex, 1 SKSE config, interface | none recorded | 1.6.1170 first |
| Dynamic Activation Key | 1.02 | 96273 / 421305 | e522d990218f59430c7ebcc94405610a | 1 plugin, 1 pex | none recorded |  |
| Extended Vanilla Menus | 2.4 | 67946 / 514351 | 2667c772265b324cb56c5dba78b65590 | 2 pex, interface | none recorded |  |
| Fuz Ro D-oh - Silent Voice | 2.5 | 15109 / 464222 | d037ae320e2a03f45e191e54ca4ea9bf | 1 DLL | none recorded | 1.6.1170 first |
| MCM Helper | 1.6.2 | 53000 / 746161 | 12ea9f03cb87bb27181fcdd2bdfcb3d1 | 1 plugin, 1 DLL, MCM Helper config, 1 SKSE config | Skyrim Special Edition, ESL, BSA | 1.6.1170 first |
| Open Animation Replacer | 3.1.5 | 92109 / 751400 | b28c516265dc5809154d26c7dac48947 | 1 DLL, 1 SKSE config | none recorded | 1.6.1170 first |
| PapyrusUtil SE - Modders Scripting Utility Functions | 4.6 | 13048 / 462773 | 1a6d2ae9b496879355b11433311299c8 | 1 DLL, 6 pex | none recorded | 1.6.1170 first |
| powerofthree's Papyrus Extender | 6.4.0 | 22854 / 762035 | e433327398f8c835dc25a2c6ac47ce0a | 1 DLL, 8 pex, 1 SKSE config | SSE v1.6.1170+ ("Anniversary Edition") | 1.6.1170 first |
| powerofthree's Tweaks | 1.15.1 | 51073 / 661201 | 60dbd4f401b3d790e093688778b10d11 | 1 DLL, 1 pex, 1 SKSE config | SSE v1.6.629+ ("Anniversary Edition") | 1.6.1170 first |
| RaceCompatibility for Skyrim Special Edition | 2.16 | 2853 / 381971 | 9a8fc2437ac9339ab42647f096f61c95 | 2 plugins, 5 pex | USSEP, No Vampire Overhaul | in the lab; Fenestrate's choice is the USSEP variant; the lab's layer uses the no-USSEP path today (persist-mods.sh); with USSEP in the set, switch |
| SKSE Menu Framework | 3.9 | 120352 / 757843 | 47049912fa399ace8c50a0eeb80a2463 | 1 DLL, 13 SKSE config | none recorded | 1.6.1170 first |
| Skyrim Script Extender (SKSE64) | 2.2.6 | 30379 / 462377 | b6f3d79a14b1b184ba71dc94abca861a | game-root files |  | in the lab; game-root install; the lab has 2.2.6 and 2.3.1 |
| SkyUI | 6.11 | 12604 / 749043 | cb99578726fe8dd4e30204617ffe7a52 | 1 plugin | none recorded |  |
| Spell Perk Item Distributor (SPID) | 7.3.0 | 36869 / 750362 | 20e6a8d41857b3a7f605518761ad199a | 1 DLL, 1 SKSE config | SSE v1.6.629+ ("Anniversary Edition") | 1.6.1170 first |

### Interface

| mod | version | Nexus mod / file | archive md5 | ships | FOMOD choices on Fenestrate | note |
| --- | --- | --- | --- | --- | --- | --- |
| Achievements Mods Enabler | 1.41 | 245 / 499297 | 9730404841b3731d6772deb5909827f7 | 1 DLL | none recorded | 1.6.1170 first |
| RaceMenu | 0.4.20.0 | 19080 / 743640 | 92f8e9de4b2a1ef8a442752dab460ada | 2 plugins, 1 DLL, 1 SKSE config | none recorded | in the lab; 1.6.1170 first |
| Reading List SSE | 1.0 | 17951 / 57662 | f14be2420d7c5f5012afd6b195928218 | 1 plugin, 3 pex | none recorded |  |
| TrueHUD - HUD Additions | 1.1.9 | 62775 / 454617 | 47171df127625dfed350b918b7731c77 | 1 plugin, 1 DLL, 1 pex, MCM Helper config, 1 SKSE config, interface | none recorded | 1.6.1170 first |
| Unread Books Glow SSE with MCM | 2.21 | 20679 / 91730 | edd2a7a3bf9a01a3239d9db92e932c71 | 1 plugin | ESP plugin |  |

### Fixes and engine patches

| mod | version | Nexus mod / file | archive md5 | ships | FOMOD choices on Fenestrate | note |
| --- | --- | --- | --- | --- | --- | --- |
| Alt-Tab Stuck Key Fix | 1.3.1 | 148466 / 731685 | b967506b6e37b2c40d0f141bfaa95e0e | 1 DLL, 2 SKSE config | none recorded | 1.6.1170 first |
| Animation Queue Fix | 1.0.1 | 82395 / 348271 | 9584ad553ee5cb9eba21adabadbbc829 | 1 DLL | none recorded | 1.6.1170 first |
| Barter Limit Fix | 1.0 | 77173 / 324312 | 4d6661e851e5794f3435a106277f359c | 1 DLL, 2 SKSE config | none recorded | 1.6.1170 first |
| Bug Fixes SSE | 10 | 33261 / 368384 | 17c9d6ce2563670fb0b7962efe663582 | 1 DLL, 3 SKSE config | none recorded | 1.6.1170 first |
| Crash Logger SSE AE VR - PDB support | 1.24.0 | 59818 / 769017 | a334e83a960f5aa0936cd0659a036198 | 2 DLL, 1 SKSE config | none recorded | 1.6.1170 first |
| DLC2dunSeekerInvisScript Fix | 1.1.0 | 89708 / 382257 | 588eb62fccbc176e01a518e72dd7cc38 | 1 pex | none recorded |  |
| Dragonborn DLC fixes | 1.1 | 141587 / 593925 | 7bff83f4963192e8f7b393ce1637d075 | 1 plugin | none recorded |  |
| Dual Casting Fix | 1.0 | 92454 / 393174 | 32e6fc7fc175ccfb3f18d7e5b677fb5d | 1 DLL, 1 SKSE config | SSE v1.6+ ("Anniversary Edition") | 1.6.1170 first |
| Dvs Civil War Fixes | 1.2.0 | 172831 / 723722 | c7e9602f38dc0564c595143bdbb4c258 | 10 pex | none recorded |  |
| Inertia (Floating Gear Fix) | 1.1.0 | 148746 / 634469 | 3d97f44fdc3131a00a1d0b321167c49d | 1 DLL, 2 SKSE config | none recorded | 1.6.1170 first |
| Next-Gen Decapitations | 1.4.3 | 135254 / 687286 | 075c94169e0195e3c37d62aca8b5814b | 1 plugin, 1 DLL, 2 SKSE config | none recorded | 1.6.1170 first |
| Scrambled Bugs | 21 | 43532 / 368378 | 645b40e5405220c93b6242f78524ad9c | 1 DLL, 3 SKSE config | none recorded | 1.6.1170 first |
| Spell Absorb and Twin Souls Fix - SE Port | 0.9.1 | 78411 / 330155 | 7610dcd661d8fa03c6fecdb6f40d805d | 1 plugin | none recorded |  |
| SSE Display Tweaks | 0.5.16 | 34705 / 454679 | 0390a8377cc2dd9218693d062c974b47 | 1 DLL, 1 SKSE config | none recorded | 1.6.1170 first |
| SSE Engine Fixes (skse64 plugin) | 7 | 17230 / 725261 | e8cb73861ead2bc8966b295bfeb3363b | game-root files | none recorded |  |
| Stealth Detection Fixes | 2.2 | 145336 / 626640 | 0ef692424c374785809057feb4b3599c | 2 plugins, 5 pex, MCM Helper config | Main Mod with MCM Menu, Prebuilt Synthesis Output |  |
| Unofficial Skyrim Special Edition Patch - USSEP | 4.3.8a | 266 / 733846 | e4373207924f6bf37cf0e4d2951c121d | 1 plugin | none recorded |  |
| Vanilla Civil War Dialogue Fix | 1.0 | 125363 / 525649 | 98b07ab8df4aff90475b016bc9b11314 | 1 plugin | none recorded |  |

### Gameplay and magic

| mod | version | Nexus mod / file | archive md5 | ships | FOMOD choices on Fenestrate | note |
| --- | --- | --- | --- | --- | --- | --- |
| Apocalypse - Magic of Skyrim | 10.2.3 | 1090 / 758998 | 26fa3eb013175c09d12b5b52d5df09ac | 1 plugin | none recorded | in the lab |
| Better Dremora Merchant and merchant gold tweaks | 1.2 | 66246 / 355296 | 6e0f8b06cd60f4efd5d60797b7fbdcbc | 1 plugin | none recorded |  |
| Better Stealth AI for Followers | 3.5 | 17600 / 536248 | 15f2efa46a3b3013bcd9b307fe82f658 | 1 plugin | none recorded |  |
| Better Vampire Lord plus Serana Fix (English) | 1.0 | 38723 / 152439 | 74e4a01f326a2fe391111ff6e6e62a31 | 1 plugin | none recorded |  |
| Conjuration Summoner Perk Applies to All Creatures | 1.0.0 | 168589 / 704426 | 7c2a00092e61e4205999fc3b8f9aff51 | 1 plugin | none recorded |  |
| Death Drop Overhaul | 1.2.4 | 151590 / 712866 | 209a5f2ce87f90ea01122ffa744eb468 | 1 DLL, 2 SKSE config | none recorded | 1.6.1170 first |
| Droppable Black Books and Elder Scrolls | 1.0.1 | 118982 / 545825 | 59013772c9b9f2133375e9f93758a932 | 2 plugins | Black Books, Elder Scrolls |  |
| Dual Casting Cost vs. Power Tweak | 1.0 | 1049 / 986 | 8a62fd5422b7f2f36e3810acb3c7eac1 | 1 plugin | none recorded |  |
| Headshot Kills - CIF | 1.2 | 148579 / 622326 | bd394ef49f6830d0d48e88c2cb0cb19c | 1 plugin | none recorded |  |
| Intuitive Dragon Ride Control (SE) | 7.0.1 | 64679 / 710808 | c1143d149b4654115b068e99ca6758c7 | 1 plugin, 1 DLL, 13 pex, 1 SKSE config, interface | none recorded | 1.6.1170 first |
| Jewelry Limiter - Another Multiple Rings and Amulets Mod | 3.6 | 22098 / 535767 | 27ccc50917ebfc846433d3faa4a8214c | 1 plugin, 3 pex, 1 SKSE config, assets, interface | none recorded |  |
| Learnable Archmage Robes Enchantment | 1.1 | 22115 / 228325 | 3db631b3dd9cdb6193ebcf7d8512b67c | 1 plugin | none recorded |  |
| Let Me Drop It (Removable Quest Items) | 1.5 | 55574 / 260809 | cedfeff8f349de1e4348c95dc60c0d6f | 1 plugin | none recorded |  |
| Let's Ride Durnehviir | 1.1b | 15266 / 46029 | 0feb1b338167d05826e4efda3bf84d92 | 1 plugin | none recorded |  |
| Lost Grimoire SSE | 1.6 | 4455 / 746543 | 9ff6e8c0ba4be4689406305ac509ee89 | 1 plugin | none recorded | in the lab |
| More Craftable Equipment - Unenchanted Clothing and Specialty Gear | 1.4.0 | 44666 / 363683 | 129ca334ad2164b8c5fd8ecef191dc41 | 6 plugins, 2 SKSE config, interface | Hearthfire Add-on, Fishing, Dead Man's Dread, Unofficial Skyrim Special Edition Patch, Cloaks and Capes |  |
| Mystic Steps- Mihail Powers and Spells (SE-AE) (''alteration'') | 1-BETA | 154477 / 645497 | 6f6c92c44b41bf7ea0ec2666483b697f | 1 plugin, 6 pex, assets | none recorded |  |
| Mysticism - A Magic Overhaul | 2.4.2 | 27839 / 489424 | 50a2e2d8ea566a4f7dcea999965c3367 | 1 plugin | none recorded |  |
| NARC Remade  - No Animals Report Crimes for Skyrim SE | 1.1.0 | 17946 / 324436 | 0ea420a528ac357fef845afa29ada2c4 | 1 plugin | NARC |  |
| Odin - Skyrim Magic Overhaul | 3.1.5 | 46000 / 727271 | faa86981c7867835f25e71fe78021936 | 1 plugin | none recorded |  |
| Portal - Dynamically Placed Teleportation SE | 1.4.1 | 20235 / 216538 | 02d23a687d0eadcfb4719aad73d0463b | 1 plugin, 4 pex, assets | none recorded |  |
| Ring of Namira - Improved | 1.0.0 | 87260 / 369531 | a39032cda72825c624b77b18ee2257c8 | 1 plugin | none recorded |  |
| Self Filling Bookshelves SE | 1.0 | 2050 / 8175 | b4e44778424e79d62dbf8f9cf5a2d333 | 1 plugin | none recorded |  |
| Spell Cast Time Progression | 1.0 | 163122 / 681954 | d7c53f35e543eaaca53e4d98c1912105 | 1 DLL, 1 SKSE config | none recorded | 1.6.1170 first |
| Stab The Heart - CIF | 1.1 | 148572 / 622564 | f16a5f3c436dc53f4dad2b4e69d1271e | 1 plugin, 1 pex | none recorded |  |
| Summons of Solstheim Lurkers Werebears and more - SE Conversion | 1 | 98722 / 418773 | 45b410cb697b562e7e110ab6131d84a8 | 1 plugin | none recorded |  |
| Summons Releveled | 1.1 | 13326 / 38042 | e922b00994eb2cd2884d369729a949d4 | 1 plugin | none recorded |  |
| Sun Affects NPC Vampires | 2.1.1 | 47277 / 618635 | 7d92bd89641e880303ab54afe5a9654b | 2 plugins | Player and NPCs, Wearing a Hood/Helmet Nullifies Damage |  |
| Supernatural Survival Tweaks - Werewolf Werebear and Vampire Cold Survival | 1.9omega | 140251 / 739939 | 270eaa6f3f87c473222d8c3acd5d5a0d | 1 plugin, 3 pex | none recorded |  |
| Thaumaturgy - An Enchanting Overhaul | 1.4.5 | 57138 / 447819 | e4ba5e0691bc154727b5c0bbcbd241e3 | 1 plugin | none recorded |  |
| True Directional Movement | 2.2.7 | 51614 / 768996 | dec9e439f544eccf0f914492cb54933c | 1 plugin, 2 pex, Nemesis patch, 1 SKSE config, assets, interface | none recorded |  |
| Undead FX | 4.2 | 5197 / 131048 | 8a62db99965d26b22aa9a878c1aa9fe0 | 1 plugin | none recorded |  |
| Vampire Feeding Tweaks | 1.13 | 47225 / 579960 | 4fc82ba46c508aac63391144baa5db48 | 1 plugin, 3 pex | none recorded |  |
| Vampire Lords Can Activate | 1.0 | 11978 / 33107 | 698f391e0da84ac03d616759144367bf | 1 plugin | none recorded |  |
| Vampiric Grip as a Destruction Spell | Harkon | 21538 / 116913 | 78791fcfee61e1416f4cc4904c5d683b | 1 plugin | none recorded |  |
| Vampirism Inverter Dawnguard | 1.01 | 2437 / 4237 | 491d3ddda047fb642b06485658aa70b7 | 1 plugin | none recorded |  |

### Characters

| mod | version | Nexus mod / file | archive md5 | ships | FOMOD choices on Fenestrate | note |
| --- | --- | --- | --- | --- | --- | --- |
| All Eyes for All Races | 1 | 122542 / 514253 | b37bc6db68f10802f04cafb3ee23daa9 | 1 plugin | none recorded |  |
| Apachii Sky Hair SSE | 1.6.Full | 2014 / 27721 | a5d0fbd7a5da82acd2d185204a6c8677 | 1 plugin, assets | none recorded |  |
| Caliente's Beautiful Bodies Enhancer -CBBE- | 2.0.3 | 198 / 489053 | f6d438974d0cedbd0f174e79d7390ee9 | 2 plugins, 5 pex, assets | Vanilla Shape, Vanilla Outfits, Face Pack, Bushier Brows, Pubic Hair, RaceMenu Morphs (BodyMorph), Morph Files (Body), Morph Files (Outfits) | in the lab; Fenestrate adds Bushier Brows, Pubic Hair and Morph Files (Body) over the lab's choices |
| Digitigrade Beast Races for Skyrim SE | 1.0 | 1975 / 2361 | 506b6ca91174deb332a7bce7a5b54a7b | 1 plugin | none recorded |  |
| Goam Elven Ears - Redone | 1.0 | 165502 / 698561 | 03b893df2fcf7f1ca15930a62ef06bf0 | assets | none recorded |  |
| Goam's Elven Ears (Old Version) | 1.0 | 99528 / 422583 | from Nexus at fetch | 1 plugin, assets |  | added, pending Eli |
| Goam's Elven Ears - Proper RaceMenu Integration | 1.1.0 | 122236 / 696384 | 43f58837afbc2e7cca970a76e7ce3e81 | 1 plugin, assets, interface | Main Files, BnP Skin |  |
| Playable Headparts All Races SE | 1.0.0.0 | 123464 / 518015 | 30796d4e1b9dd7884630a1ac1f34d997 | 1 plugin | none recorded |  |
| Racemenu Misc Slider - More Bodymorph Slider for Racemenu | 0.1.0 | 66544 / 277217 | aba9b887926b1629f51f1d0c5b0d4b45 | 1 plugin, 1 pex | none recorded |  |
| rotfern | (the fork, ~/Code/mods/rotfern-skyrim) | not from Nexus | n/a, folder install | 1 plugin |  | the lab ships the 2-master standalone fork, not this 15-master plugin |

### Animation

| mod | version | Nexus mod / file | archive md5 | ships | FOMOD choices on Fenestrate | note |
| --- | --- | --- | --- | --- | --- | --- |
| Animation Motion Revolution | 1.5.3 | 50258 / 320113 | f710bea869704977a6da0d15328cd966 | 1 DLL, 1 SKSE config | none recorded | 1.6.1170 first |

### Clothing and armor

| mod | version | Nexus mod / file | archive md5 | ships | FOMOD choices on Fenestrate | note |
| --- | --- | --- | --- | --- | --- | --- |
| Chitin Goggles | 1 | 3545 / 6034 | 11f0fe9cd5e8e09019ac939dd62d08b2 | 1 plugin, assets | none recorded |  |
| Cloaks and Capes - FSMP - XPMSSE | 1.4 | 2019 / 35552 | 0853b94a9deefedce06a85542423840a | 1 plugin, assets | none recorded |  |
| Dwemer Goggles and Scouter | 1.3 | 1959 / 39441 | 99ece4b686afbc7e61036f5c4613f975 | 1 plugin | none recorded |  |
| Lowered Fur Hoods | 1.0.0 | 48200 / 196485 | a5cbd3bc29c1d6ce98d864fc36e667d6 | 1 plugin, assets | none recorded |  |
| Lowered Hoods | 1.9.0 | 29661 / 437494 | 86f6aaf9db56dee669b98ef0e35b4e5a | 4 plugins, assets | Lowered Hoods, Necromantic Grimoire, More Craftable Equipment, More Craftable Equipment - CC Necromantic Grimoire |  |
| Northborn Fur Hoods | 1.4 | 1184 / 3099 | 77efec98cad0479752a142b1ca282e99 | 1 plugin, assets | none recorded |  |

### Creatures

| mod | version | Nexus mod / file | archive md5 | ships | FOMOD choices on Fenestrate | note |
| --- | --- | --- | --- | --- | --- | --- |
| Ancient Atmoran Remains- Mihail's Shards of Immersion (SE-AE version) | 1 | 106153 / 448581 | 9e2ede4b2be003275dcacd75054bd37b | 1 plugin, assets | none recorded |  |
| Beast Skeletons | 6.1 | 517 / 5915 | d8d9e3684b9c60b9a824b418e62873b7 | 1 plugin | none recorded |  |
| Crows and Ravens- Mihail Monsters and Animals (SE-AE version) | 1 | 98555 / 418076 | 1d17c02b39c36896fc74472537f6904f | 1 plugin, assets | none recorded |  |
| Draugr Horse Mount- Mihail Monsters and Animals (SE-AE version) (''undead'') | 1.1 | 62301 / 298868 | 4f6c3a260d08f233c97b8e9e012a3752 | 1 plugin, assets | none recorded |  |
| Ring-necked Pheasants - Mihail Monsters and Animals (SE-AE version) | 1 | 95121 / 404052 | 4afd0a0d2b36b268c7b68bcc77165a1b | 1 plugin, assets | none recorded |  |

### World and homes

| mod | version | Nexus mod / file | archive md5 | ships | FOMOD choices on Fenestrate | note |
| --- | --- | --- | --- | --- | --- | --- |
| Dwemer High Furniture | 1.0 | 28971 / 106647 | 04da0e86d43841f934a04f439d326e64 | 1 plugin | none recorded |  |
| General Displays SE | 2.5.se.1 | 14086 / 41632 | d603fa7468e1f0351ce8135a67b5ca5c | 1 plugin | none recorded |  |
| House Telvanni Banners Restored - Cut Content Restoration | 1.0 | 57443 / 236845 | 32da0dce10c517c896fa9146bd497de9 | 1 plugin | none recorded |  |
| Tel Jerdein - Telvanni Sorcerer Tower | 1.2-SSE | 33539 / 132608 | 5bc79cdedeb12ecfefd303a6f57e7dec | 1 plugin | none recorded |  |

### Visuals

| mod | version | Nexus mod / file | archive md5 | ships | FOMOD choices on Fenestrate | note |
| --- | --- | --- | --- | --- | --- | --- |
| Improved Camera SE | 1.1.2 | 93962 / 664197 | 6db1653346517d6b48e5a74edf296960 | 1 DLL, 8 SKSE config | none recorded | 1.6.1170 first |
| No More Night Eye Blur | 1.1 | 2394 / 3297 | 4959237b44f84cedeeacae72a48aef09 | 1 plugin | none recorded |  |
| Simply Bigger Trees SE - Lush Vanilla Forests | 1.0SE | 5281 / 11503 | e62715e495d83405c52a413ff1414f57 | 1 plugin, assets | none recorded |  |
| Vampire Lord Retexture | 1.0 | 8402 / 20806 | 173fb4c592f297f9a8cde2a6ead5f4b4 | assets | none recorded |  |

### Audio

| mod | version | Nexus mod / file | archive md5 | ships | FOMOD choices on Fenestrate | note |
| --- | --- | --- | --- | --- | --- | --- |
| Silent Reanimated Corpses | 1.1 | 136620 / 573943 | d90fedf5625df76be68d73eba9fc24c2 | 1 plugin | none recorded |  |

### Patches

| mod | version | Nexus mod / file | archive md5 | ships | FOMOD choices on Fenestrate | note |
| --- | --- | --- | --- | --- | --- | --- |
| Necromantic Grimoire - Mysticism Rebalance | 1.2.1 | 78651 / 356948 | 1689a7ffa16b09a7c5883582afeda03b | 1 plugin, 1 pex | none recorded |  |
| Survival Mod Vampire Patch | 1.0.0 | 64780 / 269285 | 18651732ac4902779a059da0074c89c6 | 1 plugin | none recorded |  |

## Dropped by the working resolutions

- Animals Report No Crimes - Dremora Merchant Addon (SkyPatcher) (1.0; Nexus 127445 file 534323): gap 6: a SkyPatcher config, and SkyPatcher is not installed.
- Apocalypse and Tomebound Duplicate Spells Patch - Lore Magic of Skyrim (1.4; Nexus 32231 file 161495): gap 1: Tomebound is not in the set and the patch plugin masters Tomebound.esp.
- Armor and Clothing for Kids SE (1.0; Nexus 50669 file 206634): gap 3: RS Children Overhaul is not in the set and the plugin masters RSkyrimChildren.esm and RSChildren.esp.
- Survival Mode Patch Collection (1.0; Nexus 19154 file 349444): gap 5: its two plugins were disabled on Fenestrate and their masters (Cloaks of Skyrim, HDT Wet and Cold) are installed nowhere.

## What changes if Eli decides otherwise

- Keeps the Tomebound patch: Tomebound 1.2.3 (Nexus 21403 file 106611, full ESP Tomebound.esp @109) joins the set and the server's order, before the patch.
- Keeps Armor and Clothing for Kids: RS Children Overhaul 1.1.3HF1 (Nexus 2650 file 128013; RSkyrimChildren.esm @081 and RSChildren.esp @106, both full) joins, with its child races and every NPC child override on the server; rotfern's fork would then load after RSChildren.esp again (its old ordering rule).
- Wants the FSMP cloaks: FSMP (Faster HDT-SMP, not on Fenestrate) and XPMSSE 5.06 (Nexus 1988 file 469854, full XPMSE.esp @195, 1.6.1170 DLL-free but needs RaceMenu and a Nemesis run) join, and the Nemesis output is regenerated with XPMSSE's patch.
- Keeps the Survival Mode patches: Cloaks of Skyrim and HDT Wet and Cold would have to be added first (neither is installed anywhere).
- Keeps the NARC Dremora addon: SkyPatcher (Nexus id to look up; a DLL) joins the 1.6.1170 set.
- Declines the dedicated Vortex profile: then the 37 unticked plugin-carrying mods either join the layer (full parity with Fenestrate, about 29 more plugins) or Eli's own game stops matching the shared order.
