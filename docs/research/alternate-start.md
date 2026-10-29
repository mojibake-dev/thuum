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
   191) wearing rags: that is Live Another Life's own opening scene, and it is the server's startPoints
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
