# ADR-043 implementation map: every stored form a FormDesc

Read-only code map, 2026-10-19 evening. Every file:line is against the fork
commit e3806870b93b994e9a09175e36a84f4e92973558 (origin/parity as pushed
19:00:04 PDT; it moved from 88c43e77 during this read, so earlier numbers were
re-derived against the pin). Paths are relative to skymp5-server/cpp/ unless
they start with unit/, libespm/, skymp-wire/, skymp5-server/ts/ or lab/.
Anything inferred rather than read is tagged HYPOTHESIS.

## 0. The shape of a record today

- One struct for every saved thing: MpChangeFormREFR (MpChangeForms.h:64-197,
  `#define MpChangeForm` :199), recType REFR or ACHR (:67-71). Players, NPCs,
  containers and placed objects all use it.
- Written by MpChangeForm::ToJson (MpChangeForms.cpp:23-234), read by the
  static MpChangeForm::JsonToChangeForm (:236-720), which takes no load order.
  Three drivers call both: file (database_drivers/FileDatabase.cpp:36-41 write
  to world/changeForms/<desc>.json, :111 read), mongodb (MongoDatabase.cpp:93,
  :267-269, collection "changeForms" :33), zip (ZipDatabase.cpp:52, :110).
  DatabaseFactory.cpp:20-57 picks one from `databaseDriver`.
- A record is keyed by formDesc (FileDatabase.cpp:36). Server-made forms
  (players, dropped items) are "<hex>" with no plugin (FormDesc.cpp:131-133),
  so the key itself is slot-independent.
- Save trigger: ChangeFormGuard::EditChangeForm with Mode::RequestSave
  (ChangeFormGuard.h:27-35) queues the form; WorldState::TickSaveStorage
  upserts (WorldState.cpp:822-830).
- Load: PartOne::AttachSaveStorage iterates every record (PartOne.cpp:460-500)
  into WorldState::LoadChangeForm (WorldState.cpp:214-300). A throw inside the
  per-record callback is caught by the driver's Iterate and logged as a parse
  failure (FileDatabase.cpp:101-124, ZipDatabase.cpp:108-123): the record is
  skipped for the session, its file untouched.
- Three structs are shared between the record and the wire: Appearance,
  Inventory, Equipment (messages/CreateActorMessage.h:92,119,132-141;
  messages/UpdateAppearanceMessage.h:25). Their Serialize templates feed both
  the record's JSON archive and the wire's. Retyping a field in them changes
  the wire, which ADR-043 decision 4 forbids; see section 6.

## 1. Player-record fields that hold a form id

Columns: field | declared | JSON key (write / read) | writes from a runtime
id | reads back to a runtime id or to a client | FormDesc today | what the
login path does when it does not resolve.

### 1a. Raw runtime ids (the ADR's work)

R1 appearance.raceId
- Appearance.h:60 (Serialize :47). Stored as text inside `appearanceDump`
  (MpChangeForms.h:96-99; written MpChangeForms.cpp:46-50 by parsing the dump,
  read :337-341; the dump is produced by Appearance::ToJson, Appearance.cpp:31).
- Writes: MpActor::SetAppearance MpActor.cpp:281-289, from
  ActionListener.cpp:531 and :537 (OnUpdateAppearance, client-fed, :502-545),
  :1669 (OnRaceMenuPreset's derived look), addon/property_bindings/
  AppearanceBinding.cpp:29,31 (gamemode `mp.set`).
- Reads: MpActor::GetAppearance parses the dump MpActor.cpp:1452; consumers
  :410 (CreateActor props), :1505 GetRaceId, PartOne.cpp:934 (CreateActor
  message.appearance to every viewer), :1623 (headshot race, to FormDesc),
  ActionListener.cpp:355 (IsAllowedRace), :448, :1628, WorldState.cpp:258-264
  (load check), ConsoleCommands.cpp:620, CropRegeneration.cpp:12,
  script_classes/PapyrusActor.cpp:886, AppearanceBinding.cpp:11.
- FormDesc: no.
- Unresolved today: LoadChangeForm looks the race up; a missing or non-RACE
  record SKIPS THE WHOLE CHANGE FORM (WorldState.cpp:258-264), so the player's
  actor never exists this session. The gamemode then finds no actor for the
  profile and creates one with the race menu open (skymp5-server/ts/systems/
  spawn.ts:20-36); OnUpdateAppearance accepts any playable race while the menu
  is open (ActionListener.cpp:510-521, 537). GenerateFormId hands out the
  lowest free 0xff id (WorldState.cpp:52, :1133-1139); when the skipped record
  held that id, the new actor takes it and the first save overwrites the old
  file (FileDatabase.cpp:36). HYPOTHESIS: that is the 17:25 overwrite of
  2026-10-19. If the old slot's plugin happens to hold a RACE at that local id,
  the record loads with the wrong race instead (silently wrong).

R2 appearance.headpartIds
- Appearance.h:64 (Serialize :51), same dump.
- Writes: the SetAppearance sites above; derived ids come from LookFormId
  (ActionListener.cpp:381-396, plugin name from the RaceMenu preset, case
  insensitive) into out.headpartIds :458.
- Reads: PartOne.cpp:934 (CreateActor), ActionListener.cpp:479-493
  (SendAppearanceToOthers), :495-499 (SameAppearanceParts compares raw ids).
- FormDesc: no. Unresolved: no check anywhere; dead ids reach every viewer
  (silently wrong). The ADR-026 re-derivation from raceMenuPreset runs only at
  a menu close or a new preset (:526-531, :1666-1674), never at login.

R3 appearance.headTextureSetId
- Appearance.h:65 (Serialize :52). Writes: SetAppearance sites; derived at
  ActionListener.cpp:466-472 (TXST check). Reads: as R2. FormDesc: no.
  Unresolved: silently wrong.
- (isFemale, weight, skinColor, hairColor, tints, options, presets, name are
  not forms: Appearance.h:59-69.)

R4 inv.entries[].baseId (player inventory, and every container's, see 2)
- Inventory.h:78 (Serialize :69), under `inv.entries` (MpChangeForms.cpp:34 /
  :316, Inventory.h:23).
- Primitive writes: MpObjectReference.cpp:809-814 SetInventory, :818-823
  AddItem, :847-853 AddItems, :874-879 RemoveItems (and :895 RemoveAllItems);
  MpActor.cpp:1977 (respawn keeps SweetCantDrop items), :646-712 ApplyPoison
  and :714-751 SpendPoisonDose (through SetInventory).
- Callers that feed them: client-fed ActionListener.cpp:1097 OnPutItem, :1127
  OnTakeItem, :1916 OnDropItem, :2083 OnCraftItem (through
  gamemode_events/PutItemEvent.cpp:36, TakeItemEvent.cpp:36,
  CraftEvent.cpp:38-39), :2007 (ammo spent); server-side
  MpObjectReference.cpp:1405, :1421 (activation yields), :2022 (base
  container), :882 (transfer target), MpActor AddDeathItem; Papyrus
  script_classes/PapyrusObjectReference.cpp:190,193,290,329,
  PapyrusActor.cpp:482; console ConsoleCommands.cpp:92,238; gamemode
  addon/property_bindings/InventoryBinding.cpp:23,25.
- Reads: to the wire MpObjectReference.cpp:389 (CreateActor props.inventory),
  :1888 (UpdateInventory); checks ActionListener.cpp:847-849 (equipment must
  be held), :1520 (favorite kind), :3103 (hit source held); MpActor.cpp:216-230
  (best weapon), :649, :1971 (HasKeyword(entry.baseId)); Papyrus
  PapyrusObjectReference.cpp:288,360,861,871, PapyrusActor.cpp:481;
  condition_functions/GetItemCount.cpp:18; formulas SweetPieDamageFormula.cpp:
  105, SweetPieSpellDamageFormula.cpp:110.
- FormDesc: no. Unresolved: nothing checks at load; stale ids go to the client
  as they are and the server's counts answer for the wrong form; the base
  container is not refilled (baseContainerAdded stays true, :812,:821,:851).
  Silently wrong (the ADR's "rotfern.esp items became dead ids").

R5 inv.entries[].enchantmentId
- Inventory.h:51 (Serialize :38). No server site assigns it (grep over
  skymp5-server/cpp/ finds only Inventory.h/.cpp); it arrives inside client
  reported entries and is copied with them. Read only for stack identity,
  Inventory.cpp:78-84. FormDesc: no. Unresolved: silently wrong.

R6 inv.entries[].poisonId (and poisonCount)
- Inventory.h:57 (Serialize :44). Writes MpActor.cpp:698 (ApplyPoison marks
  one copy), reset in :714-751 (SpendPoisonDose). Reads: :714-751 returns it as
  the poison that lands. FormDesc: no. Unresolved: silently wrong (a hit
  applies whatever form now sits at the old id).

R7 equipment.inv.entries[] (same Inventory::Entry, so R4 to R6 again)
- Equipment.h:24 (Serialize :16), under `equipmentDump.inv`
  (MpChangeForms.cpp:52 / :343-362).
- Writes: MpActor::SetEquipment MpActor.cpp:291-295, from ActionListener.cpp:
  929 (OnUpdateEquipment :777-990, client-fed, gated by HasItem :849 against
  the raw inventory), MpActor.cpp:237 (EquipBestWeapon), MpObjectReference.cpp:
  2015 (base outfit).
- Reads: wire PartOne.cpp:943 (CreateActor message.equipment), MpActor.cpp:
  239-244 (UpdateEquipment after EquipBestWeapon), addon EquipmentBinding.cpp:
  10-12 (`mp.get`); readers through GetEquipment MpActor.cpp:1500:
  ActionListener.cpp:956,1970,2474,2586,2724,2866,3221; MpActor.cpp:644-650
  and four loops near :3240-3320; condition_functions GetEquipped.cpp:18,
  GetEquippedItemType.cpp:84-91, IsWeaponOut.cpp:24, IsWeaponMagicOut.cpp:
  22-34, SkympWornHasKeywordCount.cpp:20-24, WornApparelHasKeywordCount.cpp:
  21-35, SpellHasKeyword.cpp:43-49; formulas/TES5DamageFormula.cpp:89,141-142;
  PapyrusActor.cpp:382,652.
- FormDesc: no. Unresolved: silently wrong to viewers; the next client report
  of a worn item the raw inventory no longer "has" is rejected and the client
  told to unequip (ActionListener.cpp:849-856, :952-990).

R8 equipment.leftSpell, rightSpell, voiceSpell, instantSpell
- Equipment.h:25-28 (Serialize :17-20). Writes: the SetEquipment sites.
  Reads: ActionListener.cpp:550-562 (VoiceShout), :789-843 (validated against
  learnedSpells and shoutRecord), GetEquippedItemType.cpp:84-91,
  IsWeaponMagicOut.cpp:24-28, SpellHasKeyword.cpp:43-49, Equipment.cpp:6-10.
- FormDesc: no. Unresolved: silently wrong, then rejected as "not learned".

R9 learnedSpells
- MpChangeForms.h:31-62 (std::set<uint32_t> :33, member :80), JSON
  `learnedSpells` array of ints (MpChangeForms.cpp:54 / :364-374).
- Writes: MpActor::AddSpell/RemoveSpell MpActor.cpp:247-258, from
  ConsoleCommands.cpp:545 (admin AddSpell), gamemode_events/ReadBookEvent.cpp:
  62, PapyrusActor.cpp:580,819,862, the CureDisease loop inside
  ApplyMagicEffect (MpActor.cpp:2659-2680); load :372.
- Reads: wire MpActor.cpp:447 (CreateActor props.learnedSpells); IsSpellLearned
  :1412 (plus :1418 FromBase) from ActionListener.cpp:806,814,829,837,
  ConsoleCommands.cpp:543, ReadBookEvent.cpp:55,92, PapyrusActor.cpp:579,818,
  861 (and 858,927,957 FromBase); GetSpellList :1447.
- FormDesc: no. Unresolved: a spell whose plugin moved is "not learned" under
  its new id, so the server REFUSES it in a hand and sends Actor.RemoveSpell to
  the player's own game (ActionListener.cpp:806-843, :933-950). Destructive,
  not just wrong: the ADR's "Apocalypse spells became dead ids".

R10 activeMagicEffects[].effectId (legacy, pre magic-effects verb)
- ActiveMagicEffectsMap.h:14-19 (espm::Effects::Effect data :17), JSON
  `effects[].effectId` (ActiveMagicEffectsMap.cpp:66 / :52; MpChangeForms.cpp:
  78 / :422-426).
- Writes: MpActor.cpp:2747 (ApplyMagicEffect), :2792 Remove, :2807 Clear,
  :2862 Clear after migration. ApplyMagicEffect(s) has no caller outside
  MpActor.cpp itself (grep), so the write path is dead code kept for tests.
- Reads: ReapplyMagicEffects MpActor.cpp:2814-2870 turns old entries into
  runningEffects at ApplyChangeForm (:782-830 calls it), then clears the map;
  :1545 GetActiveMagicEffects.
- FormDesc: no. Unresolved: an entry whose effect no longer resolves fails
  EffectFactsOf and is dropped by the migration (the `!facts` continue in
  :2826-2870). Candidate for deletion rather than conversion: new records are
  written with the map empty (`effects: []`).

### 1b. Already FormDesc (listed so the migration knows what to leave alone)

F1 formDesc, baseDesc: MpChangeForms.h:74-75; cpp :27-28 / :297-300; written
  MpObjectReference.cpp:1177-1178 (GetChangeForm, from runtime ids every save)
  and :1336 (Init); read WorldState.cpp:223-224, MpObjectReference.cpp:1202,
  PartOne.cpp:487. Unresolved plugin: ToFormId throws (FormDesc.cpp:171) inside
  LoadChangeForm, caught per record by the driver: record skipped, file kept.
F2 worldOrCellDesc: h:78; cpp :33 / :313; writes MpObjectReference.cpp:1281,
  :1510; reads :1272, :1297. Unresolved: throws in ApplyChangeForm, same skip.
F3 spawnPoint.cellOrWorldDesc: h:112; cpp :74 / :418; set via SpawnPointBinding
  and MpActor SetSpawnPoint; read at respawn (ToFormId). Unresolved: throws at
  respawn; HYPOTHESIS caught by the respawn timer's catch.
F4 templateChain[]: h:118; cpp :81 / :432; writes MpActor.cpp:1751 and
  WorldState.cpp:573 (from runtime ids via FromFormId); reads EvaluateTemplate.h:
  22, MpActor.cpp:454 (to client). Unresolved: throws inside ApplyChangeForm
  (EnsureTemplateChainEvaluated), record skipped.
F5 setNodeTextureSet values: h:124; cpp :90 / :454; write MpObjectReference.cpp:
  1076-1082; read :417 (to client). Unresolved: throws in VisitProperties
  (HYPOTHESIS: logged by the subscribe path).
F6 factions[].formDesc: h:133; cpp :112 / :507; writes MpActor.cpp:1764
  LoadFactions, PapyrusActor.cpp:700,786; read PapyrusActor.cpp:753.
F7 mapMarkers[].refr: h:139; cpp :122 / :526; write MpActor.cpp:1035 from
  ActionListener.cpp:1396-1397; read :1416 at login, no try: throws.
F8 ingredientEffects[].ingredient: h:143; cpp :134 / :547; write MpActor.cpp:
  1080 from ActionListener.cpp:1465-1466; read :1480 at login, no try: throws.
F9 favorites[].form: h:146; cpp :194 / :651; write MpActor.cpp:1173 from
  ActionListener.cpp:1569; read :1590 at login, no try: throws. The rule drops
  a form with no record anyway (FavoriteKindOf :1505-1522).
F10 playerGlobals[].global: h:174; cpp :146 / :566; write MpActor.cpp:1190 from
  ActionListener.cpp:1840 (FromFormId in a try: a report naming an unloaded
  plugin is refused); read :1871-1874 in a try: skipped silently, the entry
  stays in the record. The one field that already behaves as decision 1 asks.
F11 shoutRecord.shouts/wordsKnown/wordsUnlocked: h:170 (ShoutRecord.h:13-15);
  cpp :151 / :584; write MpActor.cpp:1133 from ConsoleCommands.cpp:516-517;
  read ShoutSnippets.cpp:36,48,53 at login, no try: throws; MpActor.cpp:
  1149-1159 HasShoutEntry converts the wire id with FromFormId (throws on an
  unknown plugin, which the equipment gate at ActionListener.cpp:826-835 feels).
F12 runningEffects[].effect/source/caster: h:165 (RunningEffect.h:15-17); cpp
  :183 / :629; writes MpActor.cpp:2861,3090,3113,3123,3240 (RunningEffectsOf
  from rule entries); reads EffectEntriesOf :2496-2531 everywhere the effects
  are used (:2853,:2985,:3059,:3083,:3119,:3140,:3176 region) and
  condition_functions/HasMagicEffectKeyword.cpp:31. Unresolved: an entry whose
  plugin is absent is DROPPED with a warn (:2525-2528) and the next write
  rewrites the record without it. Contrary to decision 1 ("kept, not
  dropped"): this field needs the keep-on-miss change too.
F13 raceMenuPreset: h:150; cpp :205 / :665; RaceMenu's own "plugin|id" text,
  resolved per use by LookFormId (ActionListener.cpp:381-396; 0 for an absent
  plugin, which HeadPartFacts :398-433 turns into a refusal).
- Exception containment for F7 to F11: the login sends run inside
  OnUpdateMovement (ActionListener.cpp:236-245). Where a throw from them lands
  was not read (PartOne::HandleMessagePacket PartOne.cpp:1072 has no catch in
  view); HYPOTHESIS: the packet loop's catch logs it and the remaining sends of
  that login are skipped. Decision 1's "kept, not dropped" implies a try per
  entry at :1416, :1480, :1590 and ShoutSnippets.cpp:36,48,53, as :1871 has.

## 2. World-level records beyond players

- There is no separate world record. Every non-player thing the server keeps
  is another MpChangeForm with recType REFR (placed objects, containers,
  dropped items) or ACHR (NPCs). Fields: position/angle (h:76-77),
  worldOrCellDesc (F2), inv (R4 to R6: container loot, reloot at
  MpObjectReference.cpp:886-891, :901-), isHarvested/isOpen/baseContainerAdded/
  nextRelootDatetime/isDisabled/profileId/isDeleted/count (h:82-89),
  setNodeTextureSet (F5), setNodeScale/displayName/lastAnimation (h:121-130),
  dynamicFields (h:178, DynamicFields.h:8-32: opaque JSON the gamemode writes
  through `mp.set`; the fork's spawn.ts:40-45 stores Discord ids only;
  HYPOTHESIS: thuum's gamemode stores no form ids there, not read), NPC
  templateChain and factions (F4, F6), quests (h:136, editor ids, no forms).
- Espm-placed forms are keyed "<id>:<plugin>" (FormDesc.cpp:122-144), so a
  changed order keeps them; a record naming a plugin no longer loaded throws at
  WorldState.cpp:223-224 and is skipped (section 0). Load also skips deleted
  forms and FF items, and disables every player (PartOne.cpp:471-500).
- Cells: no record; grids and loaded chunks are runtime (WorldState.h:315-324).
- Time: a pure function of the wall clock and the `time` settings, nothing
  persisted (skymp-wire/crates/wire-rules/src/clock.rs:1-5; PartOne.cpp:
  1201-1224; addon/ScampServer.cpp:314-316).
- Hosters, fights, bonds, cast teleports, teleport looks: in memory only
  (WorldState.h:257; PartOne.cpp:1398 records a bond in Rust state with a
  steady-clock stamp). Server settings that name forms (bonds, castTeleports,
  headshot, playerGlobals watch) are "<hex>:<plugin>" resolved per call
  (PartOne.cpp:1392, :1582, :1659; ActionListener.cpp:1860-1876).
- The Rust side writes nothing of the world to disk: only the client FFI's log
  and password file (skymp-wire/crates/wire-client-ffi/src/lib.rs:44,57) and
  test fixtures (wire-json/src/lib.rs:351-365, difftest/src/main.rs).
- The TS server writes settings dumps only (skymp5-server/ts/settings.ts:
  305,312, index.ts:47, manifestGen.ts:80).

## 3. The load order

- Source: server-settings.json `loadOrder` (addon/ScampServer.cpp:357-368,
  default five masters :350-356) into espm::Loader (:378); exposed to TS as
  getEspmLoadOrder (:1307-1319).
- Learned by the server: WorldState::AttachEspm sets
  `espmFiles = EspmFileList(espm->GetFileNames(), espm->GetLightFlags())`
  (WorldState.cpp:104; WorldState.h:251). EspmFileList is the names plus a
  light flag per file (FormDesc.h:14-31). Light = TES4 kSmallFile flag or the
  .esl extension (libespm/src/Combiner.cpp:64; Loader.cpp:56-64).
- Numbering: FormDesc::ToFormId/FromFormId/FilePosition with the EspmFileList
  (FormDesc.cpp:102-172; full plugins at index<<24, light at
  0xFE000000 | index<<12). The std::vector<std::string> overloads (:48-100)
  are the pre-light legacy and still used by EvaluateTemplate.h:22 and
  MovementValidation.cpp (both pass espmFiles, which converts).
- Persisted about the order: nothing. The world is one directory of change
  forms (FileDatabase.cpp:17); a playtest world save copies only
  /srv/lab/server/world and restore replaces it (lab/tools/playtest-world.sh:
  29, :40); the order lives in lab/deploy/sky-srv/server-settings.json and is
  checked against persist at deploy (justfile:262-268). HYPOTHESIS: the lab's
  `snapshot: clean` is a VM snapshot that carries its settings file, which is
  what the ADR's "the order their snapshot's settings name" relies on.
- WorldState.h:323 `loadOrderMap` exists but no site in WorldState.cpp uses it
  (grep); NPC file lookup goes through GetFileIdx (WorldState.cpp:1219-1224).

## 4. Existing migration pattern, and the rule 6 scenario

- No version mark: ToJson writes none (MpChangeForms.cpp:23-234) and
  JsonToChangeForm reads none (:236-720). Compatibility is per field, by
  presence: `element.at_pointer(key).error() == SUCCESS` guards for isDeleted
  :325-328, count :330-333, learnedSpells :364-374, respawn percentages
  :380-393, consoleCommandsAllowed :397-400, effects :422-426, templateChain
  :428-433, and every thuum field :481-717. An absent optional reads as
  nullopt; ToJson omits an empty optional (e.g. :115-123).
- Value fixups at read: equipmentDump missing numChanges gets 0 with an info
  line (:343-356); staffRank absent falls back to consoleCommandsAllowed
  (MpChangeForms.h:156-160); favorites' hotkey clamped (:646-649).
- In-memory migration with rewrite: legacy activeMagicEffects to
  runningEffects at ApplyChangeForm, map cleared, record re-saved
  (MpActor.cpp:2814-2870, called from :782-830). This is the closest model for
  "migrate on the way in, once, and mark": it has no mark, it re-runs on any
  record whose map is non-empty.
- Load-time fixes: PartOne.cpp:471-500 (players disabled, deleted and FF items
  skipped). WorldState.cpp:112 logs "db fixes installed" but installs none.
- Driver migration (data move, not shape): `databaseDriver: migration` copies
  old to new in 1000-record chunks and exits (DatabaseFactory.cpp:39-45;
  MigrationDatabase.cpp:31-124), refusing a non-empty target (:46-52).
- Tests to copy: unit/MigrationDatabaseTest.cpp:38,55,78; unit/ActorTest.cpp:
  24-70 (a change form applied to an actor, no espm), :72 (percentages survive
  a reload with game files); unit/FormDescTest.cpp:4,18; unit/LightPluginsTest.
  cpp:97-121 builds an EspmFileList from four tiny fixture plugins
  (unit/fixtures/light_plugins, made by make_fixtures.py) and round-trips
  FormDesc under it: the model for "save under order A, load under order B".
- The rule 6 scenario: lab/scenarios/a-restart-persistence.yaml:1-46 (position,
  inventory, equipped weapon, percentages across `server: restart` at :31,
  fixed `snapshot: clean` :10-12). Per-verb siblings with a restart: a-favorites,
  a-map-markers, a-learned-effects, a-racemenu, a-actor-values, a-light-plugin
  (:44, Rare Curios as light plugin 1), b-shout, b-player-globals,
  b-magic-restart, a-rotfern, m0-appearance, m0-inventory. None changes the
  load order between the save and the restart; the ADR's growth is a stacked
  snapshot whose order differs (as the rest verb's schema change ran).

## 5. Counts (for the "two server sessions" estimate)

- Raw fields to convert: 12 scalar or array fields in 5 structs: Appearance
  (3), Inventory::Entry (3, appearing twice in the JSON: inv and
  equipmentDump.inv), Equipment (4 spell slots), LearnedSpells (1),
  ActiveMagicEffectsMap::Entry (1, deletable). Already FormDesc: 19 fields
  (F1 to F13), of which 6 need the keep-on-miss change (F7, F8, F9, F11, F12,
  and F3's throw).
- Primitive write sites of raw fields (EditChangeForm bodies): 15
  (appearance 1, inventory 7, equipment 1, spells 2, legacy effects 4).
  Entry points feeding them from runtime ids: about 33 (listed per row). If
  the conversion happens at the record boundary, none of the 33 changes.
- Read sites of raw fields: about 70, of which 8 put the raw id on the wire
  (PartOne.cpp:934,943; MpObjectReference.cpp:389,1888; MpActor.cpp:239-244,
  447; ActionListener.cpp:479-493; AppearanceBinding.cpp:38-47). The rest
  compare or look up by uint32 and can keep a uint32 view.
- Serializer: 2 functions (MpChangeForms.cpp:23-234, :236-720) plus the three
  Serialize templates (Appearance.h:43-57, Inventory.h:20-24/34-48/66-72,
  Equipment.h:13-22) that the record shares with the wire.

## 6. Implementation notes the map forces (not decisions)

- The shared-struct trap: Appearance, Inventory and Equipment are both record
  and message. Converting their fields to FormDesc changes the wire (decision
  4). Two shapes avoid it: (a) stored twins (StoredAppearance, StoredInventory,
  StoredEquipment with FormDesc fields) living only in MpChangeForm, converted
  at the MpActor/MpObjectReference accessors against espmFiles, which keeps
  every runtime API uint32; or (b) keep the structs and convert inside
  ToJson/JsonToChangeForm, which then need the EspmFileList. JsonToChangeForm
  is static and order-less (MpChangeForms.h:196) and the drivers call it with
  no WorldState in reach (FileDatabase.cpp:111, MongoDatabase.cpp:267-269,
  ZipDatabase.cpp:110), so (b) means either threading the order into the
  drivers or converting after parse in WorldState::LoadChangeForm
  (WorldState.cpp:214) and before upsert in TickSaveStorage (:822-830).
- appearanceDump is JSON text inside JSON (MpChangeForms.cpp:46-50, :337-341;
  MpActor.cpp:1452 reparses it on every GetAppearance): a migration must
  rewrite the race, head parts and texture set inside that string, or retire
  the string for a struct (the "poor design" comment at MpChangeForms.h:96-98).
- Decision 3 (refuse a login appearance that does not resolve): today the
  refusal point is the load skip at WorldState.cpp:258-264 plus the open menu
  at MpActor.cpp:795-797 and spawn.ts:36; IsAllowedRace already carries an
  is_recorded_race fact (ActionListener.cpp:355) for the rule in
  skymp-wire wire-rules appearance to use.
- Decision 2's version mark: one new top-level key (e.g. `formVersion`) read
  with the same at_pointer guard; absent means raw shape, migrate once with
  the order the saved world names (needs the order saved beside the records:
  a world-level file in world/, the first non-change-form thing there).
- F12's drop (MpActor.cpp:2525-2528) and the no-try login sends (F7 to F11)
  are the "kept, not dropped" work for fields already FormDesc; F10 is the
  template (ActionListener.cpp:1864-1875).
