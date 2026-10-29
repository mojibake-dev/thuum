# An alternate start for new players: the mods vetted against the server's ownership

Eli, 2026-10-28, relayed by numidium: "side note, for new players joining we'll need the alternate
start mod working, and dropped in wearing rags not full armor/helmet." Two halves. The rags are the
server's spawn record (thuum-cf's side). This page is the mod half: what an alternate-start mod does,
in its own records and compiled scripts, against what the lab's server owns, and the shape that fits.
No timing from Eli; it is for the friend deployment. The decision record is ADR-055 (docs/DECISIONS.md):
D8 has the alternate start in, with the sub-choice open, "the server offers the choice and the mod
supplies the places, or the mod runs as written and the lab measures what breaks", the default when
the work starts being the mod as written first, measured; D7 refined (2026-10-28) makes the rags a
`startingKit` server setting worn in place of the Player base's default items. This page is the
vetting D8's sub-choice needs: what the mod does, what the measurement of "as written" will show, and
why. Written by apocrypha from the archives pulled into lab/.cache/mods (licensed, local) and the
lab's own verb docs.

## The short answer

Every alternate-start mod works the same way under the hood: client-side Papyrus moves the player to
a start room, lets them choose a life at a menu, then moves them to the chosen place and gives them
that life's gear. The lab's server owns exactly those two outcomes. A move is validated against
movement bounds and a teleport needs a permit from a castTeleports cast
(docs/verbs/cast-teleport.md: "the permit: wire-rules movement gains a cast jump ... a landing within
reach plus slack ... consumed by its landing; while it waits, a move that is not the landing is judged
as any other"), so a script's MoveTo with no permit is refused and snapped back. Inventory is R0 on the
server (the rung the attribute, appearance and actor-value verbs give the record), so a script's
AddItem, RemoveItem or EquipItem changes nothing the server records. The start room, the statue, the
dialogue and the table of starts, on the other hand, are content and client-local quest state, which
run under ADR-044's admission. So the mod can be the content and the menu; the server must perform
the outcome, as it does for cast teleports today. The rest of this page is the evidence and the plan.

## The candidates, read from their files

| mod | file | plugin | masters | what it is |
| --- | --- | --- | --- | --- |
| Alternate Start - Live Another Life 4.2.6a (Arthmoor) | Nexus 272 file 729409, 5.4 MB, md5 80f2bd23… | `alternate start - live another life.esp`, a plain ESP (flags 0x0: not ESM, not light), HEDR 1.71, 2,366 records (1,474 its own, 441 overrides: the quests MQ101, MQ102, WERoad01, 76 cells incl. the vanilla inns and homes it uses, 1,195 placed references), two BSAs (6.7 MB and a 1 MB textures one), an ini (`sPosePlayerRaceSexMenu=`, `bShowTutorials=0`) | the five base masters, the five free Creation Club files (Fish, SurvivalMode, Curios, AdvDSGS, _ResourcePack) and USSEP, exactly the files the lab serves | the Abandoned Prison start: the player wakes in `AbandonedPrison01` at `ARTHLALNewStartMarker` in rags, the Statue of Mara's dialogue is the menu (94 topics: "I'm a patron at a local inn", "I own property in one of the holds", "I'm a soldier in the army", "I'm a new member of a guild", "I arrived on board a ship", "I am camping in the woods", "I was attacked and left for dead", "I'm an outlaw in the wilds", "I was shipwrecked off the coast!", "I am a vampire in a secluded lair", "I got caught crossing the border illegally. [Vanilla Start]", "Surprise me" and the sub-menus of inns, homes, guilds and sides), sleeping in the cell bed executes the choice |
| Alternate Perspective 4.1.0 (KrisV777) | Nexus 50307 file 696437, 4.9 MB, md5 4bcc31bb… | `AlternatePerspective.esp`, plain ESP, HEDR 1.71, 6,344 records (5,247 own: Helgen rebuilt as a living town, 67 quests; 810 overrides incl. MQ101 and WERoad01), loose assets and translations, 161 script class names | the five base masters | a start room with "preparation chests" (gear choice), then Helgen's destruction watched from outside; "load at the bottom" |
| Realm of Lorkhan 4.2 (Twin Crows) | Nexus 18223 file 501161, 17.7 MB, md5 46e8a8b3… | `Realm of Lorkhan - Custom Alternate Start - Choose your own adventure.esp`, plain ESP, HEDR 1.71, 5,429 records (4,936 own: a hub realm, 115 activators, 87 spells, 60 perks for classes and curses; 252 overrides incl. MQ101, MQ102, MQ101DragonAttack, CW00A, CW00B, PerksQuest), four loose scripts | the five base masters | a hub realm whose shrines teleport you to a place and grant a class and a curse. **It overrides the Player's base record NPC_ 0x00000007**, which layer-stage's 2b refuses (docs/MODS.md, the player-record rule); a drop-record patch would be needed before it could even be laid |
| Skyrim Unbound Reborn 3.0.18 | Nexus 27962 file 814601, 9 MB | FOMOD; requires SKSE and SkyUI and drives its start from an MCM | | not read further: its whole flow is an MCM, the heaviest dependence on Papyrus menus of the four |

Live Another Life's and Alternate Perspective's plugins override neither 0x7 nor 0x14.

### Live Another Life's flow, from its compiled scripts (disassembled, not decompiled)

- Start-game-enabled quests: `ARTHLALVersionTracking` (its player alias's `OnPlayerLoadGame` runs
  `DLCSupportCheck` and `VersionCheck`), `ARTHLALAssaultFriendlies` and the patch quests. The vanilla
  MQ101 override is not start-game-enabled: the mod's own copies of `QF_MQ101_0003372B`,
  `MQ101QuestScript` and the other intro scripts it ships replace the Helgen start.
- The menu: `ARTH_LAL_MaraStatueScript.OnActivate` (the Statue of Mara, a talking activator) resets the
  menu choices on the chargen quest and plays the greeting; the dialogue's 94 topics run their
  `ARTH_TIF_LALNewStart_*` fragments, which record the choice in the quest's script.
- The execution: `ARTH_LAL_CellBedScript` (sleeping in the cell bed): `EquipItem`, `RemoveItem` the
  rags, `SetStage` 20 then 30 on the chargen quest; `ARTH_LAL_StartQuest` then runs the chosen start:
  `Player.MoveTo(StartMarker)` and the start's `AddItem`s (gear, keys, house parts), and the quest
  fragments (`ARTH_QF_LALStartQuest_02000DAF`) set MQ101's stages 20 to 900, disable Alduin, start the
  Helgen clean-up quest, remove three items and arm a 0.25 s update. `ARTH_LAL_PrisonFailsafeScript`
  moves a player who left the cell wrongly back to `ARTHLALNewStartMarker`.
- The table of starts is data in the plugin: 54 `ARTHLAL*Start*` and `*Marker` references with a cell or
  worldspace and a position, among them `ARTHLALNewStartMarker` AbandonedPrison01 (6481, 1334, 191),
  `ARTHLALWhiterunHouseStart` WhiterunBreezehome (-424, -148, 319), `ARTHLALCompanionsStart`
  WhiterunJorrvaskr (-486, -774, 65), `ARTHLALCollegeStart` Tamriel (116158, 111850, -7744),
  `ARTHLALThievesStart` RiftenRaggedFlagon (-2219, 1575, -124), `ARTHLALDBStart`
  DarkBrotherhoodSanctuary (3205, -217, -342), `ARTHLALLegionStart` SolitudeCastleDour (-482, 912, 0),
  `ARTHLALStormcloakStart` WindhelmPalaceoftheKings (-3892, -1656, 56), `ARTHLALCampsiteStart` Tamriel
  (6567, -70661, 4745), the inns, the docks, the homes and the "left for dead" spots. A server can place
  a player at any of them by FormDesc or by the coordinates.
- Its scripts: 159 in the BSA, 212 class names on its records (its own `ARTH_LAL_*` and the vanilla
  MQ101/MQ102 scripts it replaces). Under ADR-044 they would all be admitted by the plugin's folder;
  the replaced vanilla intro scripts then run connected where the originals never did, harmlessly,
  since the lab's world never runs MQ101.
- A side effect worth knowing: its fragments drive MQ101 to its final stages, so Survival Mode's
  `ModeCanBeEnabled()` (MQ101 completed, or outdoors) would pass indoors on a seat that went through
  this start.

### The version line

The mod's page says "Skyrim Special Edition 1.7.99 or greater, Unofficial Skyrim Special Edition Patch
4.3.9 or greater". The file does not: its header is 1.71, the format every 1.6.1130-and-later game
reads, USSEP 4.3.8a (the layer's) has the same header, every master it names is served, and it
overrides no record that USSEP itself defines (checked against the layer's USSEP: zero). The line is
Arthmoor's support policy, inherited from USSEP's current release, not a plugin fact; the risk is that
no older build is offered on Nexus (the file list jumps from 4.1.3 of 2020 to 4.2.6a), so the players'
1.6.1170 runs the current file without its author's support. A reference inside a record to a form
USSEP 4.3.9 added would be the one way this could bite; the override check finds none.

## What the server owns, in the lab's own words

- Position: movement validation with a permitted jump only after a castTeleports cast
  (docs/verbs/cast-teleport.md; the setting in lab/deploy/sky-srv/server-settings.json lists Lost
  Grimoire's Teleportation and Apocalypse's Ghostwalk). A start script's MoveTo has no cast and no
  permit: refused, snapped back. The server's own placement is startPoints (today one point, Tamriel
  0x3c at (133857, -61130, 14662), "lab-spawn", a mountain top) and the teleports it sends.
- Inventory: R0 on the server; a client script's AddItem is not a server path.
- The race menu: the server opens it on a new player and validates one result per open
  (docs/verbs/character-creation.md); a mod's own `ShowRaceMenu` is a second opener the server did not
  ask for.
- Quests, dialogue, cells, markers, stages: client-local, no server state; they run as the admitted
  scripts allow (ADR-044).

## The shape that fits: content from the mod, authority from the server

1. The spawn record puts a new player in `AbandonedPrison01` at `ARTHLALNewStartMarker` (6481, 1334,
   191) wearing rags. The cell is vanilla, Skyrim.esm `00021594` (Live Another Life overrides it and
   places its marker, an XMarker, and its statue inside), so startPoints can name it with or without the
   mod; only the statue and the bed are the mod's. In rags: that is Live Another Life's own opening scene, and it is the server's startPoints
   plus ADR-055 D7's `startingKit` (the prisoner's tunic and shoes, worn, in place of the Player base's
   sixteen default items; thuum-cf). No script moves anyone.
2. The player talks to the statue and picks a life: the mod's dialogue, client-side, admitted.
3. The choice reaches the server and the server performs the outcome: a teleport to the start's marker
   (the 54-entry table above, as FormDescs of the mod's references or as coordinates) and the start's
   gear from a server table. The mechanism already exists in shape: a cast-jump permit keyed on the
   choice instead of a spell, with the destination from the table; the bed's `MoveTo` then is the
   landing the permit expects, as a Teleportation cast's landing is today. Fork work (thuum-magnus).
   Without it, the mod's own `MoveTo` is refused and its `AddItem`s go unrecorded: the negative
   control a first probe would show.
4. The alternative that needs no mod: the server's own start room (any vanilla cell), a choice through
   Skyrim Platform's UI, the server's teleport and gear. Nothing to admit, no slot, no Papyrus; it
   loses the mod's content and the scene Eli knows.

What D8's default, "the mod as written first, measured", will show, by this read: the prison, the
statue and its dialogue work (content and admitted scripts); the bed's `MoveTo` is refused and the
player snaps back to the cell (no permit); the start's gear never reaches the server's record (R0),
so the other seat sees the player still in the cell in rags. That red is predicted, not a surprise;
it is the measurement that settles the sub-choice toward the first option, and it costs one seat and
one sleep.

Recommendation: D8's first sub-choice, Live Another Life as the content with the server performing
the outcome (1 to 3). It is
the one candidate whose plugin fits the lab as-is (served masters, no player-record override, a plain
ESP appended as the last served full plugin, no earlier slot moved), its start room and rags are the
scene Eli described, and its table of starts is data the server can own. Realm of Lorkhan would need a
player-record patch before anything else; Alternate Perspective rebuilds Helgen and is the most
invasive; Unbound Reborn is an MCM. Eli's call between the recommendation and the mod-free alternative.

## How the pick is recorded, and what the server can read (thuum-cf's question, 2026-10-28)

The menu is not a message box: it is dialogue with the Statue of Mara, a talking activator, 94 topics
under the quest's dialogue. One quest carries the whole start, `ARTHLALChargenQuest`, FormID `000DAF`
in the plugin (`0B000DAF` where the lab's load order puts the mod at index 0B; the lab's slot may
differ), with two scripts: `ARTH_LAL_StartQuest` (the state) and `ARTH_QF_LALStartQuest_02000DAF`
(the stage fragments). The second quest, `ARTHLALRumorsOfWarQuest` (`07A334`), holds the starts
themselves: one stage per start, a fragment per stage, and the aliases whose forced references are
the markers. Read from the disassembled bytecode:

- Statue activation: `ARTH_LAL_MaraStatueScript.OnActivate` calls `ResetMenuChoices()`, which sets the
  chargen script's `MainMenuChoice`, `ImmigrationMenuChoice`, `PropertyMenuChoice`, `GuildMenuChoice`,
  `InnMenuChoice`, `ArmyMenuChoice` and `DeadRandom` to -1 and `StartChosen`, `EscapeOptionUsed`,
  `SolstheimStart` to false. Nothing readable happens here.
- A sub-menu line ("I'm a patron at a local inn.", "I own property...", "I arrived on board a ship.",
  "I'm a new member of a guild.", "I'm a soldier in the army.") only writes `MainMenuChoice` (4, 2, 1,
  3, 6). A leaf line's fragment (`ARTH_TIF_LALNewStart_<id>`) does two things: it calls
  `SetAddonQuestStage(N, ARTHLALRumorsOfWarQuest)` and, for a sub-menu leaf, writes the sub-choice
  (`InnMenuChoice=6` for Windpeak Inn, `PropertyMenuChoice=2` for Breezehome, and so on).
  `SetAddonQuestStage` stores the pair in two script variables, `StartupQuest` and `QuestStage`, sets
  `StartChosen`, and sets the chargen quest to **stage 15** (16 if "I want to escape this cell" was
  used). So the pick is recorded in Papyrus script variables, not in a global (the mod defines no
  globals) and not in an alias; the only form-level trace at pick time is chargen stage 15.
- The bed (`ARTH_LAL_CellBedScript.OnActivate`): with `MainMenuChoice == 0` (the vanilla start) it
  equips the cuffs and sets chargen **stage 20**, whose fragment stops the chargen quest, sets the
  MQQuickstart global to 0 and starts MQ101 at stage 10, Helgen's cart. Otherwise it removes the
  prisoner tunic and shoes and sets chargen **stage 30**: Fragment_13 drives MQ101 to 900 and cleans
  Helgen, Fragment_148 calls `ExecuteAddonQuest()`, which is `SetStage(StartupQuest, QuestStage)`, so
  **RumorsOfWar's current stage becomes N, the start**, and N's fragment runs: EquipItem/AddItem for
  the kit, the branch on the sub-choice, `Player.MoveTo(marker)`, then a 0.25 s update. Stage 35
  disables the bed and stops the chargen quest.

What a client report can read, in Skyrim Platform terms (Papyrus natives on forms; a script's own
properties are not reachable from SP): `Quest.getCurrentStageID()` and `Quest.isStageDone(n)` on the
two quests. Chargen stage 15 says "a start was chosen"; RumorsOfWar's stage says which start (N),
and it is set a few Papyrus instructions before the MoveTo in the same fragment. The sub-choice
(which inn, which house, which city) is not readable from any form: the only thing that
distinguishes Windpeak Inn from Vilemyr Inn after the bed is the landing itself. That decides the
permit's key.

Two shapes for the permit, in order of preference:

1. **A landing-table permit.** The server already validates the landing of a cast jump against a
   destination plus slack. Here the destinations are a fixed table (below): while a player's record
   is in the prison cell `00021594` (optionally also gated on the client reporting chargen stage 15),
   one movement whose landing is within slack of a table entry is permitted, and that entry names the
   kit the server lays in. No Papyrus read, no race, and the sub-choice ambiguity is gone because the
   landing is the choice. The random starts (bandit, left for dead) are sets of positions, all in
   the table; starts whose marker lives in Dawnguard.esm or Dragonborn.esm, or needs a mod the lab
   does not ship, are simply not permitted (the move snaps back; the statue still offers the line,
   see the note after the table).
2. **A stage-keyed permit.** The client polls `ARTHLALRumorsOfWarQuest.getCurrentStageID()` and
   reports N; the server permits N's marker set (one marker, or the branch set for 1, 2 and 3). The
   report and the movement both travel client to server on one ordered connection, so if the client
   detects the stage before the MoveTo lands (the fragment runs equips and AddItems between the two,
   each a Papyrus frame) the server sees the report first. That ordering is a measurement, not a
   given, which is why shape 1 comes first.

Either way the kit is the server's table, keyed by landing or by N: the fragment's own AddItems are
leveled lists (`LootCitizenPocketsCommon`, `LItemWeaponAny1HTown`) and a random gold roll, and under
R0 they never reach the record, while the bed's RemoveItem of the rags does not either, so without
the server's kit the other seat keeps seeing the player in rags.

Two lines need a decision rather than a table entry. "I got caught crossing the border illegally.
[Vanilla Start]" runs Helgen's cart (MQ101 from stage 10, the player AI-driven); the lab's world never
runs MQ101 and the cart is unpermitted movement, so this line should not be honored, or be removed
(a drop-record of INFO `00C70F`, if the patch tool's GRUP rewrite is checked for nested dialogue
groups). "I want to escape this cell." sets RumorsOfWar stage 100 and enables the prison-break
marker: no MoveTo, the player walks out of the Abandoned Prison into Eastmarch; harmless, no permit
needed, the kit is whatever the server gives at the cell.

### The landing table (RumorsOfWar stage, marker, cell or worldspace, position)

Positions are the markers' DATA in the plugin; the FormIDs are the mod's own records at load index 0B
(replace the first byte with the lab's slot). Lines marked "not in the lab's set" are offered by the
statue only when the mod they belong to is installed (the dialogue is conditioned on
`ARTHLALVersionTracking`'s DLC-support flags), so they do not appear for the lab's players.

| statue line | RumorsOfWar stage | landing | cell or worldspace | x, y, z |
| --- | --- | --- | --- | --- |
| Solitude | 1 | ARTHLALSolitudeDockStart (0b057c06) | Tamriel (exterior) | -64593, 95460, -13888 |
| Dawnstar | 1 | ARTHLALDawnstarDockStart (0b031fdf) | Tamriel (exterior) | 29048, 106238, -13874 |
| Windhelm | 1 | ARTHLALWindhelmDockStart (0b057c07) | Tamriel (exterior) | 140444, 33952, -13933 |
| Proudspire Manor [Solitude] | 2 | ARTHLALSolitudeHouseStart (0b032579) | SolitudeProudspireManor | 313, -809, 288 |
| Vlindrel Hall [Markarth] | 2 | ARTHLALMarkarthHouseStart (0b057c08) | MarkarthVlindrelHall | -2465, 1819, 192 |
| Honeyside [Riften] | 2 | ARTHLALRiftenHouseStart (0b057c0a) | RiftenHoneyside | 124, 226, 63 |
| Breezehome [Whiterun] | 2 | ARTHLALWhiterunHouseStart (0b057c09) | WhiterunBreezehome | -424, -148, 319 |
| Shoal's Rest Farm [Near Rorikstead] | 2 | alias FarmhouseStart (0b031fcc) | ARTHLALFarmhouse | 1848, 2231, 8052 |
| The Companions | 4 | ARTHLALCompanionsStart (0b057c0b) | WhiterunJorrvaskr | -486, -774, 65 |
| College of Winterhold | 5 | ARTHLALCollegeStart (0b057c0c) | Tamriel (exterior) | 116158, 111850, -7744 |
| Dark Brotherhood | 6 | ARTHLALDBStart (0b057c0d) | DarkBrotherhoodSanctuary | 3205, -217, -342 |
| Thieves Guild | 7 | ARTHLALThievesStart (0b057c0e) | RiftenRaggedFlagon | -2219, 1575, -124 |
| Windpeak Inn [Dawnstar] | 3 | alias InnDawnstar (0b031fe4) | DawnstarWindpeakInn | 1244, 582, 0 |
| Four Shields Tavern [Dragon Bridge] | 3 | alias InnDragonBridge (0b031fe5) | DragonBridgeFourShieldsTavern | 1709, -732, 0 |
| Dead Man's Drink [Falkreath] | 3 | ARTHLALFalkreathInnStartMarker (0b031fe6) | FalkreathDeadMansDrink | 140, -720, 1 |
| Vilemyr Inn [Ivarstead] | 3 | alias InnIvarstead (0b031fe7) | IvarsteadVilemyrInn | 1334, -574, 0 |
| Braidwood Inn [Kynesgrove] | 3 | alias InnKynesgrove (0b031fe8) | KynesgroveBraidwoodInn | 1519, -700, 0 |
| Moorside Inn [Morthal] | 3 | alias InnMorthal (0b031fe9) | MorthalMoorsideInn | 1090, -747, 1 |
| Nightgate Inn | 3 | alias InnNightgate (0b031fea) | NightgateInn | 1089, -758, 1 |
| Sleeping Giant Inn [Riverwood] | 3 | alias InnRiverwood (0b031feb) | RiverwoodSleepingGiantInn | -788, -615, 1 |
| Frostfruit Inn [Rorikstead] | 3 | alias InnRorikstead (0b031fec) | RoriksteadFrostfruitInn | 1081, -738, 1 |
| The Frozen Hearth [Winterhold] | 3 | alias InnWinterhold (0b031fed) | WinterholdTheFrozenHearth | 1763, -556, 1 |
| I'm an outlaw in the wilds. | 12 | random lair/spot: ARTHLALBandit1Start (Tamriel (exterior) 73912, 1189, -3776), ARTHLALBandit2Start (Tamriel (exterior) -133085, 22969, -4405), ARTHLALBanditStartMarker3 (Tamriel (exterior) 53755, 70870, -2129) |  |  |
| Imperial Legion | 10 | ARTHLALLegionStart (0b057c0f) | SolitudeCastleDour | -482, 912, 0 |
| Stormcloak Rebellion | 11 | ARTHLALStormcloakStart (0b057c10) | WindhelmPalaceoftheKings | -3892, -1656, 56 |
| I am camping in the woods. | 13 | ARTHLALCampsiteStart (0b031fde) | Tamriel (exterior) | 6567, -70661, 4745 |
| I was shipwrecked off the coast! | 14 | ARTLALShipwreckStart (0b009b71) | Tamriel (exterior) | 52052, 157092, -14066 |
| I live in an Orcish stronghold. | 101 | ARTHLALOrcStart (0b057c14) | Tamriel (exterior) | -145125, -22831, -1048 |
| I am a vampire in a secluded lair. | 15 | a random vanilla vampire lair: ARTHLALVampireStartController fills a location alias (LocTypeVampireLair) and the player is moved to its marker; the set is Skyrim.esm's lairs, not in this plugin |  |  |
| I am a Khajiit caravan guard. | 102 | ARTHLALCaravanStart (0b057c15) | Tamriel (exterior) | -160858, 5437, -5200 |
| I was attacked and left for dead. | 19 | random lair/spot: ARTHLALL4D2Start (Tamriel (exterior) 145719, -11213, -10353), ARTHLALL4D4Start (Tamriel (exterior) -167564, 56747, -5096), ARTHLALL4D5Start (Tamriel (exterior) 79228, 78724, -4688), ARTHLALL4DStart3Marker (Tamriel (exterior) -58907, -31773, -3214) |  |  |
| I am a necromancer in a secret location. | 16 | ARTHLALNecroStart (0b057c19) | BlackreachZCell10 | 511, 547, 2867 |
| I am a Forsworn native. | 103 | ARTHLALForswornStartMarker (0b031fe3) | DruadachRedoubt01 | 823, 2679, 7725 |
| I am a Vigilant of Stendarr. | 17 | ARTHLALVigilantStart (0b032567) | HallOfTheVigilant01 | -964, -710, 1 |
| I am an Argonian dock worker in Windhelm. | 104 | ARTHLALArgonianStart (0b057c1a) | WindhelmArgonianAssemblage | 2043, -960, 56 |
| I am a member of the Alik'r. | 105 | ARTHLALRedguardStart (0b031ff3) | Tamriel (exterior) | -113836, 4853, -4902 |
| Surprise me. | random | one of the sub-menu's starts, picked by PickRandom*/Randomize() |  |  |
| I am a refugee from Morrowind. [Windhelm] | 106 | ARTHLALDunmerStart (0b03ed79) | WindhelmNewGnisisCornerclub | 3114, -1933, -512 |
| I am a refugee from Morrowind. [Raven Rock] | 107 | ARTHLALDunmerRRStart (0b09df54) | DLC2RRAbandonedBuilding | 1454, 2452, 427 |
| The Dawnguard | 8 | DLC1VQ03HunterStart (Dawnguard.esm 006E62; 02006E62 in the lab's order) | DLC1DawnguardHQ01 (Fort Dawnguard) | -1376, 2009, -128 |
| Lord Harkon's Court | 9 | no MoveTo of its own: it calls `DLC1VampireTurn.HarkonBitesPlayer(True)`, the vanilla bite, which turns the player and wakes them at DLC1VQ02PlayerWakeupMarker (Dawnguard.esm 0175CC; 020175CC in the lab's order; the marker's role inferred from its name, the vanilla script is in Dawnguard's archive, not read here) | DLC1VampireCastleGuildhall (Castle Volkihar) | -87, -2436, 7417 |
| I am an agent with the Thalmor Embassy. | 108 | ARTHLALThalmorStartMarker (0b052b3e) | ThalmorEmbassy01 | -1042, -202, 288 |
| The Retching Netch [Raven Rock] | 3 | alias InnRavenRock: an unnamed XMarker, Dragonborn.esm 03BD38 (0403BD38 in the lab's order) | DLC2RRTheRetchingNetch (Dragonborn.esm cell 017EC0) | -842, -19, -382 |
| I am Erik the Slayer's childhood friend. | 109 | alias InnRorikstead (0b031fec) | RoriksteadFrostfruitInn | 1081, -738, 1 |
| I want to escape this cell. | 100 | no MoveTo: the player walks out |  |  |
| I am a warlock's thrall. | 18 | ARTHLALThrallStartMarker (0b075d0d) | BoulderfallCave01 | 2007, 522, -163 |
| The Horny Horker [Keld-Nar] | 3 | marker from DLCSupport.ARTHKeldNarInnStartMarker: an add-on mod's, not in the lab's set |  |  |
| Bee & Barb [Riften] | 3 | alias InnRiften (0b08e13a) | RiftenBeeandBarb | 536, -136, 322 |
| Silver-Blood Inn [Markarth] | 3 | alias InnMarkarth (0b08e13d) | MarkarthSilverBloodInn | -6458, -2000, -12 |
| Winking Skeever [Solitude] | 3 | alias InnSolitude (0b08e13e) | SolitudeWinkingSkeever | 796, -1667, 289 |
| Bannered Mare [Whiterun] | 3 | alias InnWhiterun (0b08e13f) | WhiterunBanneredMare | 49, 260, 321 |
| Candlehearth Hall [Windhelm] | 3 | alias InnWindhelm (0b08e140) | WindhelmCandlehearthHall | 28, -4082, 64 |
| Heljarchen Hall [The Pale] | 2 | ARTHLALHFPaleHouseMarker (0b0b2362) | BYOHHouse3Pale | 126, 416, 270 |
| Lakeview Manor [Falkreath] | 2 | ARTHLALHFFalkreathHouseMarker (0b0b2364) | BYOHHouse1Falkreath | 126, 416, 270 |
| Windstad Manor [Hjaalmarch] | 2 | ARTHLALHFHjaalmarchHouseMarker (0b0b2363) | BYOHHouse2Hjaalmarch | 126, 416, 270 |
| Raven Rock | 1 | DLC2 ship ride to Raven Rock (RRShipRide.SetSail) |  |  |
| Old Hroldan Inn | 3 | ARTHLALOldHroldanShezrieStart (0b0d5a77) | OldHroldanInn, only with Shezrie's Old Hroldan installed (not in the lab's set) | 806, 564, -256 |
| Old Hroldan Inn | 3 | ARTHLALOldHroldanStart (0b0d5a76) | OldHroldanInn | 1095, -666, 1 |
| I am a member of the Penitus Oculatus. | 110 | ARTHLALOculatusStartMarker (0b24c557) | DragonBridgePenitusOculatusOutpost | 661, -83, 272 |
| Tundra Homestead [Whiterun Hold] | 2 | ARTHTHStartMarker (0b31beb0) | Tamriel (exterior); needs the Tundra Homestead Creation (THQuest via DLCSupport), not in the lab's set | 39071, -36, -4288 |
| Worthy Meade Inn [Telengard] | 3 | marker from DLCSupport.TGStartMarker: an add-on mod's, not in the lab's set |  |  |
| Shadowfoot Sanctum [Riften Ratway] | 2 | marker from DLCSupport.SSStartMarker: an add-on mod's, not in the lab's set |  |  |
| Dead Trees Inn [Granite Hill] | 3 | marker from DLCSupport.GHStartMarker: an add-on mod's, not in the lab's set |  |  |
| Screaming Goblin Inn [Oakwood] | 3 | marker from DLCSupport.OWStartMarker: an add-on mod's, not in the lab's set |  |  |
| Outdoor Inn [Black Moor] | 3 | marker from DLCSupport.BMStartMarker: an add-on mod's, not in the lab's set |  |  |
| The Tapped Vein [Shor's Stone] | 3 | marker from DLCSupport.ShorsStoneStartMarker: an add-on mod's, not in the lab's set |  |  |

Three landings sit in masters the lab ships anyway (thuum-cf, 2026-10-28: keep them permitted; leave
out the ship-ride scene and the vanilla cart), so their positions were read from Dawnguard.esm and
Dragonborn.esm (the server's own copies, copied off CORE's esm directory into lab/.cache/game;
licensed, local). The server loads the same masters through espm, so the table can name markers as
FormDescs and let the server resolve positions at load; the coordinates here are for reading.

Two starts touch state the server owns beyond position and kit. "I am a vampire in a secluded lair"
(stage 15) calls the chargen script's `MakePlayerVampire()`: `PlayerVampireQuest.VampireChange(Player)`
(the race swap to the vampire variant), progression stage 3, and `GameHour` set to 19. "Lord Harkon's
Court" (stage 9) calls the vanilla `HarkonBitesPlayer(True)`, the turn that also grants the Vampire
Lord. Race and appearance are R0 on the server and the clock is the server's, so these two lines are
either performed by the server as part of the kit (a race change, a time the server already sets) or
not honored; a client-side race swap that the server never records is the a-rotfern class of mismatch.
The bandit, Forsworn and vampire-lair starts also add the player to a friendly faction
(`ARTHLALBanditVampireFaction` and the controllers' factions), client-local and harmless.

The source material for this section is in the plugin's records (QUST `000DAF` and `07A334` with
their VMAD fragment maps and ALFR aliases, the 102 INFO fragments) and the 159 compiled scripts of
the mod's archive, disassembled, not decompiled, plus Dawnguard.esm and Dragonborn.esm for the three master markers; the tables were generated from them and spot-checked
against the fragment bytecode (Fragment_2, _3, _4 branches; Fragment_10, _11, _18, _21, _102). The
mod's files stay local (lab/.cache/mods); only names, ids and positions are recorded here.

## If Live Another Life is chosen: the layer plan

- Row `alternate-start-live-another-life-4.2.6a`, source nexus 272/729409, md5 80f2bd23…, take `./->.`
  (the esp, both BSAs and the ini; the page asks that the BSA stay an archive, which the layer does).
  Plugin served, in both load orders, appended after the last served full plugin, before the
  client-only tail: one new full slot, nothing before it moves.
- `lab/layer/papyrus-admitted.tsv`: a `layer` row for `alternate start - live another life.esp`; the
  map then carries its 212 class names.
- layer-stage's 2b passes (no 0x7, no 0x14; every master a base entry or served).
- The spawn record and the outfit: thuum-cf; the permit keyed on the choice and the start table:
  thuum-magnus; the probe: a fresh seat spawns in the prison in rags, talks to the statue, picks an
  inn, sleeps, and arrives there on both screens with the server's gear, numidium.
