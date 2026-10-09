# Verb: racemenu-sync

Eli, 2026-10-06: "i want my friends to be able to make their own hyper
specific characters." SkyMP syncs the vanilla appearance (race, head parts,
tints, face sliders) and nothing RaceMenu adds, so a player's RaceMenu look
(sculpt, overlays, body morphs, node scales, its extra sliders) exists only
in its own game, and only until its next login: every login loads a
generated save, and RaceMenu keeps its data in that save's SKSE co-save.

## Intent

A player shapes its character in RaceMenu once; the server keeps the
result; every client, the player's own included, shows that look after
every login.

Roadmap reference: none (SkyMP's appearance sync stops at vanilla data)
Milestone: Stretch, chosen by Eli 2026-10-06 (docs/PLAN.md)   Class: B (a
player's own data, shown on every client)

## Authority

Rung: R2, bounded. The look is the player's choice, computed by RaceMenu
in the player's game; the server records it and hands it out. It is
client-authored, so untrusted (hard rule 5): the server bounds its size,
checks that every form it names exists in the load order, and that every
sculpt vertex index is below its host's vertex count.
Why not R1: there is no game rule to validate a face against; the bounds
above keep a hostile preset from carrying anything but a look.

## Engine surface

- RaceMenu runs on game 1.6.1170 only. CONFIRMED live 2026-10-06: skee64.dll
  0.4.20.0 (Nexus mod 19080 file 743640, its newest, uploaded 2026-04-19;
  archive SHA-256 e0f5e923... as Nexus's VirusTotal link names it) declares
  SKSEPluginVersionData compatibleVersions [1.6.1170.0] and no version
  independence, and SKSE's loader enables a plugin without independence
  only on a runtime it lists (skse64 2.2.6 src/skse64/skse64/
  PluginManager.cpp, "simple version list"). On sky-c1's Steam game, SKSE
  2.3.1 on runtime 01070680 (1.7.104) logged: `plugin skee64.dll (00000001
  skee 00000001) disabled, incompatible with current version of the game`.
  Nexus has no newer file as of that day (mod updated 2026-04-20). So the
  verb is built and proven on the lab's 1.6.1170 client set (ADR-022,
  ADR-025), and a player who wants RaceMenu plays 1.6.1170 until RaceMenu
  ships a 1.7 build. Its two plugins, RaceMenu.esp and RaceMenuPlugin.esp,
  are full slots (TES4 flags 0x0, not light), so the server's load order
  differs by game version once they are in the 1.6.1170 set.
- Saving and loading a look: RaceMenu's own Papyrus natives, the API it
  gives scripts. RaceMenu 0.4.20.0's scripts\source\chargen.psc (in
  RaceMenu.bsa; read 2026-10-06, never in a repo):
  - line 85: `Function SaveCharacterPreset(Actor akSource, string
    characterName) native global`, "Saves actor preset to
    SKSE\Plugins\CharGen\Presets\%characterName%.jslot", and "Only works on
    player currently / Actor parameter is reserved for future use".
  - line 80: `bool Function LoadCharacterPresetEx(Actor akDestination,
    string characterName, ColorForm hairColor, int flags = 0xFFFFFFFF)
    native global`; its wrapper LoadCharacterPreset (line 76) warns "Loads a
    preset onto the NPC, permanently (DO NOT USE ON NPCs)" and "Hair Color
    form that is provided is modified".
  - lines 56-66: RaceMenu's own LoadPreset for the player passes RaceMenu's
    hair color form (0x801 in RaceMenu.esp) and then sends the mod event
    RSM_RequestTintSave, "Signals to RaceMenu that some internals were
    probably modified and need to be stored into RaceMenu's script
    representation".
  - line 41: `bool Function IsExternalEnabled() native global`, a harmless
    read.
  RaceMenu's public source has the bodies (expired6978/SKSE64Plugins,
  skee64/PapyrusCharGen.cpp lines 268-316, registered at 394-398): the save
  is SaveJsonPreset into Data\SKSE\Plugins\CharGen\Presets\<name>.jslot;
  the load reads SKSE\Plugins\CharGen\Presets\<name>.jslot (then .slot),
  sets the hair color form when one is given, ApplyPresetData(actor, data,
  true, flags) and queues a node update.
- Skyrim Platform reaches any native by class and name with callNative,
  loading the class's script on first use (skyrim-platform
  CallNative.cpp:233-238, VM::ReloadType), so nothing in Skyrim Platform is
  RaceMenu's.
- CONFIRMED 2026-10-07 (run 20261007-014139-x-racemenu-probe, green, c1 on
  1.6.1170): IsExternalEnabled answered (false); SaveCharacterPreset left a
  3165-byte preset of c1's player when callNative returned; and
  LoadCharacterPresetEx loaded it back (true). A second save matched the
  first except for the order of two head parts (Skyrim.esm 05162F and
  051631 swapped), so two presets compare with head parts as a set. The
  preset's top-level keys for a default look: actor (hairColor,
  headTexture, weight), faceTextures, headParts, modNames, mods, morphs
  (custom, default with 19 morphs and 4 presets, sculpt, sculptDivisor),
  tintInfo, version.
- REFUTED 2026-10-07: the C++ Preset interface. RaceMenu's header for
  plugin authors (0.4.20.0 ModderResource/IPluginInterface.h, lines
  467-492) declares IPresetInterface, but 0.4.20.0 never registers it:
  skee's interface map gets eleven names (public source main.cpp:943-953,
  Override to FormTag), which sit together in skee64.dll's strings at
  0x1e4300 to 0x1e43f8, while "Preset" sits apart at 0x1e563c. In run
  20261007-012410 SKSE handed Skyrim Platform's exchange message to skee's
  listener (skse64.log: the targeted dispatch logs nothing when it finds
  its receiver) and the version asked through the map came back 0. The
  natives built on it (387f9f72) are reverted (35692723).
- Not relied on: a save of another actor. chargen.psc says the save works
  on the player only; the scenario reads a figure through the engine's own
  node scale instead (NetImmerse.GetNodeScale).
- CONFIRMED 2026-10-07, the whole path: c1 scales its head through
  NiOverride under the key "thuum" (a shape the vanilla appearance cannot
  carry), closes the race menu, and the preset RaceMenuService saves
  carries it (the server's record: 8536 bytes, its transforms naming "NPC
  Head [Head]" at 1.6). c2's figure of c1 draws it within 2 s, and after a
  server restart, c1's relaunch (a fresh save, no co-save) and c2's
  reconnect both draw it again (runs 20261007-022013, -022929, -023505,
  -024000, -024452 and a-racemenu's four).
- CONFIRMED 2026-10-07: the load onto a figure leaves the local player's
  own look alone. skymp5-client's figures answer Papyrus GetBaseObject with
  0x7, the local player's base NPC, and RaceMenu's load writes head parts,
  morphs, tints and weight into an actor's base; yet c2's own preset, saved
  before and after c1's look reached its figure, is the same 2932 bytes
  (SHA-256 54d2809f..., run 20261007-034304), so RaceMenu's writes land on
  the figure's own base. a-racemenu asserts it on every run.
- FOUND 2026-10-07 by Eli, after playtest eight: test 2 came back as the
  clean world's orc wearing the playtest's sculpt. The sweep's first run
  restored the server's world (no look recorded for test 2) and restarted
  the server, but did not restart c2's game (the scenario used c1 only), so
  c2 reconnected inside one game. RaceMenu keeps a player's sculpt, its own
  sliders, overrides and transforms in the game's memory and puts them back
  on the head whenever it is rebuilt, so the client showed a look the
  server never had. Fixed in 8a8aa50d: at the player's own CreateActor the
  client takes RaceMenu's additions off (the look saved, the RaceMenu-only
  sections left out, loaded back: RaceMenu's load erases them first,
  PresetInterface ApplyPresetData) before anything of the server's is
  applied, and every CreateActor drops what the service knew of that actor,
  since the server sends its current look right after. a-racemenu checks
  it: c2 scales its own head without closing the race menu, and after its
  reconnect the head is back at 1.0.
- Two early runs (20261007-022013 and -022551) saw c2's figure keep its old
  look after a live preset, though the server relayed it; the cause was not
  found. Since ba000d6a the service applies a look again to a new reference
  as well as a new base and logs a load RaceMenu refuses; every live run
  since applied it (seven, the console traced in five).
- Remote players: skymp5-client builds each remote player's figure on its
  own base NPC (src/sync/appearance.ts applyAppearance:
  `TESModPlatform.createNpc()`), so the load's permanent writes to the base
  ("DO NOT USE ON NPCs") stay with that player. The figure is respawned on
  a new base when its appearance changes (src/view/formView.ts,
  respawnRequired), so the preset is applied again after every spawn.

## Observe

- After the race menu closes, the client saves its player's look
  (CharGen.SaveCharacterPreset) and sends the JSON to the server if it
  changed.
- A preset loaded through RaceMenu's own menu comes out wrong (Eli's
  playtest nine, 2026-10-07, rotfern.jslot): the menu's load goes through
  its sliders, so the skin tone lost its alpha and landed on another color
  (tint 0 88B1C6 at 1.0 against the file's A9C5D8 at 0.94; the body goes
  muddy, the face and body tones part at the neck) and the ear, a head
  part of a type the vanilla menu has no slider for, was dropped; weight
  came through at 50 (an earlier record held 75, unexplained). The sync's
  own load of the same file (CharGen.LoadCharacterPresetEx) gives the
  file's values with the ear (probe x-head-parts). Fenestrate never
  exercised the menu's load: the preset was exported from the character,
  never imported. So at the menu's close the client finds the preset file
  whose morphs equal the saved look's, the one the menu loaded, applies it
  again through CharGen and saves again; that look is sent (fork
  30b1e262). A face shaped by hand matches no file and stays as it is.
- Under that: RaceMenu's scripts never ran on the SkyMP client. The client
  blocks every Papyrus event but OnUpdate (TESModPlatform.BlockPapyrusEvents,
  Skyrim Platform's hook on the VM's SendEvent blanks the event name),
  excepting SkyUI's SKI_ scripts and one vanilla script. RaceMenu's menu
  reaches the actor through its own scripts' mod events (racemenu.psc:
  OnTintColorChange runs Game.SetTintMaskColor and UpdateTintMaskColors,
  OnHairColorChange, OnTintSave for RSM_RequestTintSave; the slider plugins
  such as RaceMenuMorphsCBBE have their own). Eli (playtest nine): "moving
  the skintone sliders does absolutely nothing". So the sliders were dead,
  the tints and hair color a menu preset load hands back to the UI were
  never applied, and RSM_RequestTintSave (13391501) did nothing. Fork
  d9c940f1: scripts whose name starts with RaceMenu pass the block as
  SkyUI's do; they run the menu, not game state (rule: the server owns
  state, the hook is R3). Measured again once staged: the ear drop on the
  UI load path, the hair color on open, the tints after a menu load.
- With the scripts running, the hair went blonde as the menu opened (Eli,
  playtest nine). racemenu.psc's LoadDefaults runs SaveHair, which marks
  a hair color as the player's own only when it sits on RaceMenu's form
  0x801; SkyMP's appearance apply puts it on a fresh form, so SaveHair
  stored it as not custom, the vanilla slider snapped to the race's hair
  color list's first entry, and LoadHair had nothing to put back. Fork
  cc2a5e94: the client moves the player's color onto 0x801 before
  RSM_RequestTintSave at menu open, fenestrate's sequence. Follow-up
  (apocrypha): SetNpcHairColor should assign the race's hair color list
  form whose RGB matches (TESRace faceRelatedData[sex]->hairColors) before
  creating one, so a plugin's color such as rotfernhair persists in any
  save with no script state.
- The menu-loaded preset is matched by its face sliders (morphs.default and
  morphs.custom as a name to value map, three places), not the whole
  morphs block: RaceMenu's save drops the sculpt vertices a preset did not
  move (448 in the file, 436 saved) and reorders the sliders (fork
  0aaac540).
- CONFIRMED (Eli, playtest nine, 16:18): with cc2a5e94 on his client, a
  preset loaded in RaceMenu's menu then Done records the preset as its
  author made it: appearance skin A6C0D2 (his fenestrate save's own body
  tint), hair 5E6077, weight 50, the ear at index 2; tints EFA9C5D8,
  FF000000 x2, C9430401, 590F0440, FF2F2013; the look 30,476 bytes with
  the ear, 22 custom morphs, one sculpt host. The other seat shows the
  same values. Open after it: his own view reads shiny where the figure of
  her on the other seat does not, same tints, and (Eli) with his seat at
  HDR key 0 and the other at 1, so the key is not what separates the two.
  Not the face maps' binding either: RaceMenu never applies a preset's
  faceTextures (apocrypha, PresetInterface.cpp: parsed and written back,
  read by nothing), so both seats get her maps through the engine's
  texture set path. Measured instead (probe x-ears, run 20261008-001656):
  on the player's seat the actor's race pointer stayed the race the actor
  loaded as (the clean world's Orc) while the base's was rotfern, at every
  reading: before the preset, after it, in a server-opened menu and after
  it. SkyMP's appearance apply changes the base's race only
  (TESModPlatform.SetNpcRace); the actor's follows at a reload. RaceMenu
  builds the menu's slider list from the actor's race (skee's LoadSliders,
  apocrypha), so the race's ear slider was missing, and the player's own
  face is composed under the actor race's facegen while a figure, a fresh
  NPC whose actor and base agree, is composed as rotfern: the account for
  "shiny on my seat, right on the other". Fork 30cf4d30 put Actor.SetRace,
  the game's own live race change, into the appearance apply on the tick
  after loadGame: the game froze at login and the actor came up as a mix
  of both races (Eli, 18:1x). Fork c40595a9 moves it to RaceMenuService,
  once the player's world is up, after the login reset and before the
  server's look is applied; that still read the loaded race afterwards
  (probe 20261008-014823), since at the reset's pass SkyMP's appearance
  apply has not set the base yet. Measured (probe 20261008-015301):
  Actor.SetRace moves the actor's pointer mid-world (Orc to rotfern within
  the driver's settle loop, no freeze), and a fresh loadGame loads the
  actor with the save's race; a reconnect inside one game is where the
  actor and the base part. Fork b6048985 aligns on every update pass once
  the world is up, never behind a loading screen. Engine surface:
  Actor::race (CommonLibSSE-NG Actor.h:684), read by Actor::GetRace before
  the base's (Actor.cpp:551); TESModPlatform.SetNpcRace writes the base.
- The vanilla menu commits its own slider state AFTER Skyrim Platform's
  menuClose event (Eli, 19:33: the look saved at the close carried the
  preset exactly and the other seat drew it, while his own seat went back
  to the menu's stale tone and shape). Fork 6ae65bd3: the save, the
  re-apply and the send run 0.25 s after the close.
- That commit also writes the Face and Mouth parts its sliders held from
  the menu's open (CONFIRMED by the records, 2026-10-07 21:1x: Eli opened a
  server menu on test 2 whose base still carried the Nord head and mouth,
  loaded the preset, imported the sculpt, moved a slider, Done; the
  appearance AND the look came out with Skyrim.esm 051623 and 05150F for
  Face and Mouth under the preset's ear, hair, eyes, tints EFA9C5D8 and
  weight 50; his seat drew the Nord head with the female head texture,
  "darker", and test 1 the same). The close-time re-apply of 97d53da0
  fired only when the saved face still equalled a preset file, which a
  moved slider defeats, so RaceMenu saved the committed parts into the
  look. Fork 77400a0d: the look is read AT the close event, while it is
  still RaceMenu's, and loaded back over the commit 0.25 s later; the
  record is RaceMenu's save after that load. The preset-file matching
  (importedPreset, sliderKey, openKey) is gone. Measurement at the next
  staging: menu on test 2, load the preset, move a slider, Done; the
  look's headParts must read rotfern.esp 02E116 and 02E117 and the own
  face node RotfernChildHead with no relaunch.
- Same evening, 21:32, still on 0513beba: Eli's next two menu sessions on
  test 2 (preset loaded again, the race slider moved off rotfern and back,
  hair colour changed, Done) left BOTH records with rotfern's head and
  mouth (02E116, 02E117), the ear, hair, eyes, brows and hair colour
  070709. The race re-select re-runs the vanilla menu's LoadSliders and
  reseats its head-part sliders on the current parts, so the commit kept
  the preset's; the 21:1x session had no re-select. The "Rotfern Ears"
  slider was present in that session (Eli), absent at 21:07: apocrypha,
  from skee's source, FaceMorphInterface::LoadSliders builds the menu's
  list from the actor's race when the engine's RaceSexMenu::LoadSliders
  runs, at the open and at every race change; whether the first open alone
  would have shown it after 0513beba's alignment at open is not yet
  separated from the re-select. Not the Headpart Whitelist plugin: the lab
  loads skee64, SkyrimPlatform and MpClientPlugin only, and the mod's
  Data\HeadpartWhitelist\rotfern.ini is dormant here as on fenestrate.
- The menu's starting state, 21:36, on clean records: the open threw the
  player back to the "almost right" model (darker tone, the race palette's
  hair, the unsculpted shape); a race re-select fixed part of it and
  reloading the preset the rest (Eli). The vanilla menu rebuilds the head
  from the base's vanilla data and loses RaceMenu's layer. STOPGAP, fork
  c4eebeeb: the player's recorded look (lastSent, else the server's) goes
  back on 0.5 s after the open event while the menu is up. Eli named it a
  band-aid and it is one. The deeper fixes, in order, none of them a patch
  to the exe: (1) ADR-026, one record, so the base always carries the
  look's vanilla-expressible face; (2) the race-default route (preset NPC
  plus the sculpt baked into childhead.nif), so the base is her by
  construction and the menu has nothing else to start from (apocrypha,
  estimate asked); (3) whether skee re-applies a player's sculpt at the
  vanilla menu's rebuild in single player (apocrypha, skee source); if it
  does not, a small change in a skee fork. Eye Depth 0.3 is Eli's number
  for the jslot (apocrypha). Builds: the dispatch of c4eebeeb cancels the
  in-progress 77400a0d build (the workflow's concurrency rule), so one
  build carries both, landing about 22:20.
- ADR-026 built (fork m1-actor-values e83b8ded, 2026-10-08 01:29; the
  server work rides the actor-values branch, as Eli decided): the look is
  the one record of a character's face. At a look, and at an appearance
  that comes after one, the server derives the appearance's head parts,
  hair colour, weight and face texture set from the look (wire-rules
  racemenu::look_facts and derived_head_parts; libespm now reads HDPT:
  DATA flags, PNAM type, HNAM extra parts, RNAM valid races). Each part the
  look names is resolved through the server's load order (full plugins;
  light plugins with their own verb) and must be a head part whose
  valid-race list, as the winning override has it, holds the appearance's
  race; each is followed by the extra parts its record lists. A look that
  names a part the server lacks or the race may not wear is refused
  (E_RACEMENU_PARTS) before the gate, so it does not use up the opening.
  Race, sex, skin and tints stay the appearance's. The derived appearance
  goes to every other player that shows the player. Measured first on the
  server's own masters (hdpt-check, 2026-10-08 01:2x): every part of both
  real looks (her rotfern look, the test Nord's) resolves and is valid for
  its race, and the rule reproduces her recorded appearance's eight parts
  in order, the hairline after the hair. Known limit until the
  light-plugins verb: a head part from a light plugin refuses the look.
- skee's side of the open, from its source (apocrypha, 21:5x): skee
  re-applies a player's sculpt and extended sliders at every engine head
  rebuild (SKEEHooks.cpp hooks UpdateMorphs and UpdateMorph, then
  FaceMorphInterface::ApplyMorphs), from two in-memory maps keyed by the
  TESNPC pointer (m_sculptStorage, m_valueMap). A preset apply fills them
  (ApplyPresetData, which LoadCharacterPresetEx reaches) and so does its
  co-save; SKEE64Serialization_Revert (main.cpp 328-339) empties them on
  every game load, and the sync's generated login save carries no skee
  co-save. Tints live on PlayerCharacter::tintMasks, the hair colour on
  RaceMenu's 0x801 script state. So a player whose look has not been
  re-applied since the login's load opens the menu with none of RaceMenu's
  layer. The sync does re-apply the look after the login's load (reset,
  then the server's look), and the 21:36 open still lost it: what empties
  or bypasses the maps between that apply and the menu's rebuild is the
  open measurement (apocrypha asked for every other caller of Revert or of
  the per-NPC erase). Also from the same read: ApplyPresetData erases the
  NPC's entry before writing, so a figure's look applied against the same
  base pointer as the player's would take the player's face; SkyMP's
  distinct bases per figure keep that from happening.
- The race-default route is more than half built in rotfern.esp
  (apocrypha, 21:5x): rotfernNPC (0200AA04) is the race's only CharGen
  preset NPC (female, race rotfern, weight 50, hair colour rotfernhair,
  presets [1,-1,22,15], June's 19 morphs, six tint layers on the right
  race layer ids), so the vanilla Preset slider already has one entry and
  picking rotfern gives this face. Missing on it and on rotfernNPCVampire
  (02019D0B): the ear (02E11C) in the head-part list and Eye Depth 0.3 (it
  had June's 0.9); DONE 22:0x in rotfern.esp f7946233 (two records
  changed, byte-level through chim; the earlier "tint strengths at 0.0"
  was a misread: NPC_ TINV is an int32 in hundredths and both preset NPCs
  already carry 93, 100, 100, 78, 34, 100, the jslot's alphas). Also from
  skee's source, the complete list of what empties its per-NPC sculpt and
  morph maps outside a game load: ApplyPresetData itself (it erases the
  NPC's entries first, so a look applied without sculpt or custom morphs
  wipes a sculpt that was there), the mapped-preset apply for NPCs, the
  Sculpt tab's Clear, a console command path; no race-change path and no
  menu reset. The client's load() will log, per apply on the player,
  whether the data carries sculpt hosts and custom morphs (next build), so
  the last apply before an open is known. skee keys a sculpt to its head
  part's chargen TRI path (SculptData::GetHostByPart), so a face node that
  carries FemaleHeadNord instead of RotfernChildHead finds no host and
  draws unsculpted with the maps intact, and brings the female head
  texture set with it (the darker tone): the 21:36 symptoms read as the
  Nord head on the node at the open, not as a wipe (apocrypha). The race
  record itself cannot be the source: rotfern's female default head parts
  are RotfernChildHead, RotfernChildMouth, RotfernChildBrows and Skyrim.esm
  01C558 (read from the esp), so a Nord head at an open comes from the
  base record or the vanilla menu's slider state. MEASURED 23:27 on a
  fresh world (both records blanked with the server stopped, both seats
  relaunched 23:14; Eli created her from nothing on test 1: the race pick
  alone gave the tone, the ear and the hair colour from the preset NPC,
  the jslot applied the face in one load, Done, relog; both records then
  carried her parts, sculpt 436, 22 custom, Eye Depth 0.3): the server
  opened her menu, and the face dump six seconds later read the node as
  her ear, hair, hairline, eyes and brows around FemaleHeadNord
  (FemaleHead.dds, FemaleHead_S.dds) and FemaleMouthHumanoidDefault. The
  vanilla menu's own open puts the Nord Face and Mouth on while the record
  and the race's defaults name hers; the Player record 00000007 (a Nord)
  or the first entry of a part list RaceCompatibility fills with every
  human head are the candidates (apocrypha reading RaceSexMenu's slider
  init). In that session RaceMenu's Presets-tab load did NOT replace the
  Face and Mouth parts (as at 21:1x; the 21:32 race re-select did), the
  sculpt bound itself to the Nord head's hosts (FemaleHeadCharGen.tri 846,
  eyes, brows, mouth) when Eli imported it, and his Done wrote the Nord
  parts and those hosts into both records. Repair recipe on this build:
  menu, race slider off rotfern and back (her parts return), load the
  preset (the sculpt finds its host), Done. c4eebeeb's re-apply at open
  never fired: Utility.wait counts game time, which the race menu stops;
  fork 482a331f waits in menu mode (Utility.waitMenuMode, real time), so
  the recorded look goes back on 0.5 s into the open; measured by the
  same dump at the next staging. If the vanilla menu re-imposes its parts
  over that, the next step is the race re-select done by the client at
  open.
- ROOT CAUSE of the Nord head, from the dump and the plugin (apocrypha,
  23:35): RotfernChildHead (02E116), RotfernChildMouth (02E117) and
  RotfernChildBrows (02E118) carried HDPT DATA 0x01, playable with
  neither gender bit, inherited from RS Children's parts (my own HDPT
  parse at 21:2x printed exactly that next to the ears' 0x05, unread).
  Every path that selects a valid part for a female of the race tests
  the bit: RaceMenu's ApplyPresetData applies a part only if it carries
  kFlagFemale for a female (so the jslot's head entry was skipped at every
  load), and the vanilla menu's rebuild at open takes the first valid
  Face and Mouth for the actor's race and sex, which with her parts out
  are FemaleHeadNord and FemaleMouthHumanoidDefault (valid on rotfern
  since the plugin adds the race to the vanilla head-part race lists).
  Race defaults never check the flag, which is why the race pick and the
  re-select always restored her head, and why the ear, hair and eyes
  (0x05) survived every open. Fix in rotfern.esp 790d3b6c (chim,
  byte-level): DATA 0x05 on the three parts, and RotfernChildHead and
  RotfernChildMouth appended to both preset NPCs' lists. Expected at the
  next dump with the menu open: her head and mouth on the node at the
  open with nothing re-applied, and the sculpt present since its host
  matches. The client's menu-mode re-apply stays as the belt for anything
  else the open does; the appearance/look double record (ADR-026) stays
  the structural item. Staged 2026-10-08 00:01 to 00:10 (client 482a331f,
  esp 790d3b6c, server restarted with the world kept, snapshots
  clean-m1-next). The chain's own dump at 00:12 is void: both games had
  frozen at 00:11:13 when a second Moonlight stream reached test 2 (the
  staging script's stream step and a hand-opened window raced; the
  scripts no longer open streams), and Eli's record still carried the
  Nord parts from his last Done. Both relaunched 00:13; a server-opened
  menu on test 1 at 00:14 opened ON HER (Eli: "opening race menu she
  looked super normal"), the first open tonight that did. A straight Done
  from that menu re-recorded the stale look (the open puts the recorded
  look back on faithfully; the record was the stale one), so one preset
  load plus Done rewrote it (00:21): both records her parts, sculpt 436 on
  childheadchargen.tri, 22 sliders, Eye Depth 0.3, skin A6C0D2, hair
  5E6077, the look 26,588 bytes. CLOSED 00:24: test 1 relogged, the server
  opened her menu, the dump three seconds in and untouched read
  RotfernChildHead (head.dds, head_s.dds), RotfernChildMouth, her ear,
  hair, hairline, eyes and brows under actor race rotfern; the record read
  at 00:24 is the 00:21 one (26,588 bytes, same parts, host, sliders), and
  Eli's straight Done from that open is read back below; the skin tone layer is
  EFA9C5D8 in the appearance (type 6), in the look's tintInfo and in the
  preset file, exact. Eli: "she's perfect right this second", "this looks
  pretty good tbh, im liking it". Open for later: arrows do not fly from a
  drawn bow (roadmap marksman).
- The straight Done, 00:26: Eli pressed Done from that open without
  loading anything and the record changed: the lips (type 1, 590F0440)
  and nose (type 10, FF2F2013) layers left both records (the look 26,588
  to 26,258 bytes; head, sculpt, sliders, hair and the skin tone layer
  unchanged); Eli: "that borked her skin". Cause: the client's re-apply of
  the recorded look at the open loads RaceMenu's OWN saved look back, and
  RaceMenu's SaveCharacterPreset writes only the layers it set itself (six
  entries against the file's thirty, Lips as FFFFFF), so the load cleared
  the two layers the engine held and the vanilla commit recorded the face
  without them. A preset load plus Done (00:29) restored the record to the
  00:21 state exactly. Fork 527e0b34: no look is loaded back at the open
  or at the close; with the plugin's flag fix neither was needed; the
  record is RaceMenu's state once the menu is fully closed. Rule until it
  is staged: load the preset before Done. The world with Eli's rotfern
  (profile 1) and the Nord (profile 2) is saved as server snapshot
  playtest-10-rotfern-20261008T073113Z. Then the mesh: base plus
  the 448-vertex sculpt (plus the 22 slider displacements, recommended so
  figures are right without RaceMenu) written into childhead.nif and its
  chargen tri's base, verified against the lab export; half a day; one
  mesh serves both races. Risks: whether the preset copy carries a
  type-104 part (else the ear becomes a race default part), the tint
  interpolation units (0-1 or 0-100; one lab read), double application
  once baked (the jslot goes thin or away), a player's own sculpt then
  sits on the baked shape. About two working days with the lab rounds.
  Tonight (Eli: we end when she is perfect and a brand-new character comes
  out exactly right) the new-character flow is two steps: pick rotfern,
  load rotfern.jslot (a9fd4bbc, Eye Depth 0.3), Done; measured on a fresh
  world at the c4eebeeb staging.
- The shine, end of 2026-10-07: with the record exact, a flip of the skin
  tint (dark opaque against the preset's pale 0.94) and a flip of the look
  (absent against applied) both left her glossy from both seats, and her
  own seat came out matte only after a RaceMenu menu session rebuilt the
  head. Measured next in numbers (below), and the login save's face block
  (SFChangeFormNPC.cpp:80 and :84, two counts written as 8 bytes where the
  game reads 4) fixed in 4bd52443 with unit/SaveFileFaceBlockTest.cpp.
- The shine, FOUND (live dump, 2026-10-07 20:03, lab/frida/face-dump.js:
  a read-only walk of each actor's loaded 3D that prints every face
  geometry's shader property and flags, material values, the textures
  bound to it with their live D3D11 size and format, and the texture set's
  paths). On test 1, rotfern's figure head (RotfernChildHead,
  BSLightingShaderMaterialFacegen, specular 1,1,1 at power 30 and scale 3,
  the file's values) has its specular slot bound to BSShader_DefNormalMap,
  the engine's 16x16 stand-in for a texture that did not load, and its
  rim/soft slot the same; every other head on either seat binds a real map
  there. The material's own texture set is the mesh's: childhead.nif bakes
  textures\actors\character\ranaline\child\{head.dds, Head_msn.dds,
  Head_sk.dds, head_s.dds}, the child mod she was derived from, and the
  lab's ranaline\child folder holds one file (maleliner.dds, the persist
  stopgap). The facegen pass puts the appearance's face texture set
  (RotfernFaceTint 02E110, all rotfern\ paths, all shipped) on the diffuse,
  normal, subsurface and detail slots only; the specular stays the mesh's,
  so a flat stand-in multiplies specular strength 3.0 over the whole face.
  Fenestrate has the ranaline textures installed, so head_s.dds loads there
  and she is matte; RaceMenu's in-menu rebuild binds the preset's
  faceTextures index 7 itself, which is why she was matte inside a menu
  session and glossy again after the engine's rebuild on Done. The earlier
  "every file is byte-identical to fenestrate's" covered the mod's own
  files; the missing one was never in the mod. Not the HDR key, the tint,
  the overlays or the weather: those flips all left the file missing. Fix
  (apocrypha, rotfern-skyrim, 20:2x): childhead.nif's texture set
  re-pathed to the mod's own head maps (sha256 05278efa...), the six ear
  meshes likewise (their rim/soft slot read the stand-in too); restaged
  with the mod layer. CONFIRMED 20:31, both seats relaunched on the
  restaged layer (14 files changed): her figure's head on test 1 and her
  own head on test 2 (RotfernChildHead under an actor of race 0x800AA00)
  bind data\TEXTURES\actors\character\rotfern\head_s.dds (1024, BC1) on
  the specular slot and head_sk.dds on the rim/soft slot, the material's
  set the four rotfern\ paths, shader values unchanged. Eli, 20:32,
  unprompted: "as of right now test 2 looks CORRECT". Left from the same
  reading: the ear's rim/soft slot still binds the stand-in, since its
  texture set has no slot-2 entry at all; the ear's specular binds EL_s.dds
  and it never read glossy.
- The own seat's head mesh (same dump): test 2's player face node wore
  FemaleHeadNord and FemaleMouthHumanoidDefault, the Nord race's defaults,
  under her ear, hair, hairline, eyes and brows (with the female head maps
  the CBBE Face Pack ships: 1024 BC7 diffuse, 2048 BC4 specular, so that
  seat's gloss had a second source), while test 1's figure of the same
  look wore RotfernChildHead and RotfernChildMouth. The server's
  appearance for profile 2 carries the two Nord parts (headpartIds
  0x51623, 0x5150F) next to the rotfern ones, recorded from a menu session
  the actor sat in as a Nord: the vanilla menu lists the actor race's
  parts and commits them on Done, and SkyMP's appearance reads the base
  after. The look names rotfern's parts; RaceMenu's load keeps a head part
  only when the actor's race allows it (HYPOTHESIS, skee's
  ApplyPresetData; the measurement is the dump after the fix: the own face
  node must carry RotfernChildHead), so the own look loaded under the
  loaded race left the Nord parts. Fork 0513beba: the own look goes on
  only once the actor's race is its base's (raceAligned), goes on again
  after every alignment, and the menu aligns the race as it opens. Staged
  20:50 to 20:58 on both seats (snapshots clean-m1-next): the dump after
  the relaunch reads RotfernChildHead with head_s.dds on test 2's own face
  node and on test 1's figure of her, no Nord part left. The 20:31 relaunch
  before 0513beba had already shown the own head right (a fresh loadGame
  loads the actor with the save's race), so the measurement that isolates
  the head-part validity rule is still owed: a reconnect inside one game,
  then the dump; HYPOTHESIS stays until then. Open, by design: head parts, race, colours and weight are recorded twice (the
  appearance and the look) and can disagree. Next: the server derives the
  appearance's from the look at OnRaceMenuPreset (R0 reconciliation, one
  authority), Eli's "take the output of race menu as overriding and
  authoritative, and then let the server fully enforce it" (2026-10-07
  20:0x); ADR candidate.
- The HDR key: bUse64bitsHDRRenderTarget is a lever, not a fix. Side by
  side on the two seats (Eli, playtest nine): at 1 her skin reads glossy
  under the lab's vanilla light, at 0 her own view matched fenestrate
  ("the skin texture looks VERY correct") while the figure on the other
  seat was off for the tint reasons above. The lab keeps 1, fenestrate's
  value (Eli's call in playtest nine; display.ps1 says so); the gloss
  itself was the missing specular map above. apocrypha, from the shader source: the detail
  map term scales only the base color by at most 1.6 percent, so CBBE's
  Face Pack did not change the gloss.
- The server takes one look per race menu it opened, before or after the
  appearance that closes it, as SkyMP takes an appearance only while the
  menu it opened is open (ActionListener::OnUpdateAppearance); any other
  is refused with E_RACEMENU_CLOSED in the log. Lab, 2026-10-07: test 2
  changed its hair color in a race menu it opened itself; SkyMP dropped the
  appearance, which carries the hair color, while the look went through,
  and test 1 showed the look on the old color. Known limit: a look that
  arrives before an appearance the race rule refuses (E_APPEARANCE_RACE)
  stays recorded; the race itself stays the validated one.
- What the sync's own load leaves on a player, measured (probe
  x-head-parts, run 20261007-133253, rotfern's preset 1957f4aa on a player
  carrying Eli's appearance record): the preset's head parts replace the
  base's by type, the race's own ear (type 104) included; the weight goes
  to the preset's (50 from 75); the skin tone tint goes to the preset's
  (A9C5D8 at 0.94 from SkyMP's FF88B1C6); all three survive a race menu
  the server opens and the driver closes (Ui close), and the other client's
  figure shows the ear and the hair color. RaceMenu's saved look keeps its
  tints under "tintInfo" (a look with "tints" absent is not a look without
  tints). HYPOTHESIS: Eli's own record (weight 75, tint 0 FF88B1C6, both
  SkyMP's appearance values, after he loaded the preset in RaceMenu's UI
  and pressed Done) comes from the vanilla menu's commit on Done writing
  its own slider state over what the preset set mid-menu; the driver
  cannot press through the name box, so the T4 check is: load the preset
  in the UI, Done, then head-parts on the base.
- A figure's base cannot be read for its parts: it answers GetBaseObject
  with 0x7, the local player's base (head-parts {other} returns the local
  player's own parts). A figure's look is judged by eye or by the look
  record. A figure takes the look's head parts but keeps SkyMP's appearance
  for skin and hair color: RaceMenu writes tints to the local player only
  (PresetInterface ApplyPresetData, the player == actor check).
- Rotfern's shine (Eli, 2026-10-07: "the texture is also way too shiny",
  not so on fenestrate, which never ran an ENB before the character was
  done; apocrypha's file dates agree). Measured: it is the specular term
  (A/B on sky-c1 with the head mesh at specular strength 0 against the
  original 3.0 at glossiness 30, same place, minutes apart: matte against
  sharp white highlights on the lit side of the face; the body did not
  read shiny). Every file of the mod is byte-identical to fenestrate's
  (apocrypha: head mesh, all four maps, the texture set record); the file
  that differed was never in the mod (the live dump entry above). Retired
  HYPOTHESIS: bUse64bitsHDRRenderTarget, 1 on fenestrate
  and 0 in the lab (the template's launcher wrote the lab's SkyrimPrefs.ini
  from its own hardware detect; display.ps1 edited only size and windowed
  keys), so bright specular clipped to white before tonemapping. The probe
  x-hdr (runs 20261007-143101 key 1 at game hour 11, 20261007-170xxx key 0
  at hour 14) showed a matte face both times, inconclusive: the figure
  stood in profile with the sun off the face, and carried the clean world's
  orc skin tone under the rotfern parts. The lab now sets the key to 1 on
  every clone (display.ps1, fenestrate's value) and Eli judges the face in
  playtest nine; next if it stays shiny: apocrypha's 32-bit head_msn.dds
  (the 24-bit R8G8B8 map has no D3D11 format), then weather and an
  interior, from the player's own view.

## Impose

- After a login, the server sends each player's stored look to its own
  client and to every client that shows that player; each loads it
  (CharGen.LoadCharacterPresetEx, every part) onto that actor. The
  player's own loads as RaceMenu's LoadPreset does: RaceMenu's hair color
  form, then RSM_RequestTintSave; a figure's hair color stays its
  appearance's.
- Caveats from RaceMenu's source and scripts:
  - The load writes to the actor's base NPC for good: every remote player
    has its own (see the engine surface).
  - Head parts are keyed by "plugin|FormID" and sculpt blocks by the head
    part's chargen .tri path: every client needs the same load order and
    the same loose meshes, or entries are skipped silently.

## Suppress

- Nothing.

## Message contract

- Its own message, RaceMenuPreset, both ways, not SkyMP's property
  replication: UpdateProperty is capped at 65 KiB on the wire (wire-schema
  TABLE), and a sculpted head can carry more. Client to server: `preset`,
  the .jslot JSON, within the transport's 256 KiB from a client (wire-
  transport Limits max_from_client). Server to client: `actor` (the server
  id of the player it belongs to) and `preset`. The cap is set once a real
  sculpted preset is measured in the lab; compression (deflate) only if
  that measurement needs it.

## Server

- Rust, wire-rules: the bounds (size, well-formed JSON object, only the
  .jslot's top-level keys, head parts and forms named by "plugin|FormID"
  present in the server's load order). Sculpt vertex indices are recorded
  unvalidated (the server has no .tri files; rule 5: R2, bounded).
- C++ core: the preset in the player's change form (`raceMenuPreset`,
  absent in older records and read as none). Sent to the player's own
  client after a login (the map-markers login hook), and to every client
  that gets CreateActor for that player, right after it; a new preset goes
  to the player's listeners.

## Client

- Skyrim Platform: nothing of its own; callNative reaches CharGen.
- skymp5-client RaceMenuService (b0219fee, ba000d6a, 8a8aa50d): on the race menu's close,
  SaveCharacterPreset on the player into RaceMenu's Presets folder, read
  back, sent if it changed. On RaceMenuPreset from the server, the JSON
  written to that folder and LoadCharacterPresetEx on the player or on
  that player's figure, again whenever the figure's reference or base
  changes, a refused load logged once. A login (the player's own
  CreateActor) takes RaceMenu's additions off the player before anything
  of the server's is applied, so a look only the server holds survives
  it. RaceMenu is there when CharGen's natives answer, asked once;
  `raceMenuSync: false` turns it off.
- Lab-driver: `racemenu` (CharGen answers), `racemenu-save {name, other?}`
  (a save, its size and SHA-256), `racemenu-load {name}` (a load onto the
  player as RaceMenu's LoadPreset does it), so a scenario can shape a look
  without dragging sliders.

## Tests

- T0: the Rust bounds (sizes, keys, forms) and the change form round trip;
  the login and CreateActor sends.
- T3 on 1.6.1170 (`a-racemenu`, d61647d): c1 scales its head as RaceMenu's
  sliders do and closes the race menu; c1's head and c2's figure of c1 draw
  at 1.6 and c2's own look is unchanged; the server restarts, c1 relaunches
  and c2 reconnects; the same three again. The figure judged is the
  enabled one with 3D where the server has c1 (c.node_scale_of).

## Order of work

1. RaceMenu into the lab's 1.6.1170 set (thuum 1b4b741, after the merge
   sweep): its menu shows on both clones, and m0-appearance, a-rotfern,
   a-character-creation and smoke still pass there.
2. Saving and loading confirmed (run 20261007-014139, CharGen through
   callNative; the C++ Preset interface refuted and reverted).
3. The two-client probes and a-racemenu green (runs above); T2 green.
4. Playtest eight on 1.6.1170 passed (2026-10-07): sculpted looks of
   24,463 and 41,332 bytes, so the 192 KiB cap stands. The merge sweep and
   the merge next.

## Status

- [x] doc complete, rung declared
- [x] engine surface cited (CharGen's natives through callNative,
      confirmed by run 20261007-014139 and the two-client runs; no
      HYPOTHESIS left)
- [x] server logic + T0 (fork m1-racemenu 0f516e0f: wire-rules
      `racemenu`, the change form's raceMenuPreset, OnRaceMenuPreset, the
      login send and the send with a figure; unit/RaceMenuPresetTest.cpp
      green in fork pipeline 864, 287 test cases; the difftest session
      racemenu, 547cf113, for T2)
- [x] message + validator (same commit, a2ff7c53: RaceMenuPreset, MsgType
      39, wire id 47, SCHEMA_VERSION 8; cap 192 KiB until a measured
      preset; validate_server split out, so a burst of presets at a login
      is not rate-limited on the client)
- [x] native hook: none of ours; RaceMenu's CharGen natives through
      callNative (387f9f72's TESModPlatform natives reverted, 35692723);
      T1: no harness, the probe
- [x] TS handler (684f933b, CharGen since b0219fee: RaceMenuService)
- [x] T2 green (2026-10-07, `just test-proto m1-racemenu`: the smoke,
      attributes across a restart, and all 14 difftest sessions, racemenu
      among them, legacy against wire identical)
- [x] T3 scenario green, no HYPOTHESIS tags (a-racemenu, d61647d, green in
      runs 20261007-033048, -033403, -033726 and -035046; approved by Eli,
      its body-morph addition 952a8e4 too on 2026-10-08; T4 playtest eight
      passed, the cap stays 192 KiB)
- [x] ledger and suppression registry updated (no NATIVES rows: CharGen
      is RaceMenu's and never runs on the server; nothing suppressed)
- [x] rotfern on two seats (2026-10-07 evening into 2026-10-08): the
      gloss measured to a missing specular map and fixed in the mod, the
      Nord head to head parts without a gender flag (rotfern.esp
      790d3b6c); the menu-open dump binds head_s.dds and RotfernChildHead
      (night staging, 01:43); Eli saw her matte and whole and made a brand
      new character exactly right (playtest ten); the merge sweep on client
      3a8e4cfd green (24 of 27, the three reds green on rerun), and fork
      parity fast-forwarded to m1-racemenu c8b26bf7 on 2026-10-08. Owed: one
      straight-Done check on this build at Eli's next session (done in
      playtest eleven: it failed, the box below).
- [x] a Done with no change keeps the look. Eli's playtest eleven
      (2026-10-08): it did not; her hair and skin went back to the race's
      colors on both seats, and the record lost her eye sockets, frown
      lines, lips and nose (scratchpad pt11 cf0-before against cf0-after).
      Measured (x-racemenu-done-probe 20261008-224646, from Eli's world
      playtest-11-rotfern-20261008T224415Z): 6 tint layers on her after
      the login, all hers; the race's 30 with the menu open, blank but a
      default skin tone; the same after the close. Cause, two parts:
      SkyMP's tint apply put back only the visible layers
      (skymp5-client appearance.ts applyTints), so her list held 6 of her
      race's 30 while RaceMenu keeps tints by their place in the list
      (racemenu.psc SaveTints, LoadTints); and the client asked RaceMenu
      for a tint save as the menu opened, after the menu had reset the
      tints and hair color, so RaceMenu put the race's defaults back.
      Fix on fork m1-console 5746fa9a: the whole recorded list in its
      order, invisible layers too, and no save at the open (RaceMenu's
      copy is the one taken when her look loads after a login). Its probe
      (20261008-234126) kept her look through a plain Done but showed lips
      and nose twice: her look's own tint list numbers its layers from the
      short list, and RaceMenu's load puts a preset's tints on the player
      by place (skee PresetInterface.cpp ApplyPresetData), so 137f3fb5
      loads the player's own look without its tint list (the tints are the
      appearance's, ADR-026). x-racemenu-done-probe 20261009-005520 on
      137f3fb5: her 30 layers in the race's order, each of hers once
      (frown lines at 5, lips at 6, nose at 7), the same with the menu open
      and after the close, the look byte for byte the same. (One staging
      had left c1 on the earlier client after a failed copy; the staging
      script now checks each clone's copy and stops.) a-racemenu's
      plain-Done check (thuum 9c24514, on Eli's form) green in runs
      20261009-005736 and -010108, then in the merge sweep on 137f3fb5 (30
      of 30); fork parity fast-forwarded to it, 2026-10-08.

Watch item (2026-10-09, the merge sweep on fork m1-console 89db8732):
a-racemenu red once (20261009-080458) at its check after the restart. c2's
figure of c1 had RaceMenu's head scale recorded (NiOverride 1.6) and the
body morph applied (0.7), but the engine's head node read 1.0; c1's own
head read 1.6, and the server sent c1's look to c2 two seconds after c1's
login (server log 08:07:54). The two reruns read 1.6 for both
(20261009-084041, -084413), and the eight runs of this check before it were
green. HYPOTHESIS: the figure's 3D was built again or loaded after
RaceMenuService applied the look, which it applies once per figure id and
base (raceMenuService.ts onUpdate, `applied`), so nothing applied the
recorded transform to the new 3D. If it shows again: read the figure's 3D
load time against the apply's trace, and harden the apply by comparing the
engine's node scale with NiOverride's record and calling its
UpdateNodeTransform when they differ.
