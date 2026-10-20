# adr043-preslice-25: a pre-slice world for ADR-043's rule 6 scenario

The world a server running thuum ADR-043 slice one (fork m2-formdesc-world,
head d0693ef4) must migrate: eight change forms written in the raw shape
(every form a runtime id of the load order they were saved under, no
`formVersion`), beside a hand-written `load-order.json` in the slice's own
format naming that order. `lab/scenarios/b-formdesc-world.yaml` restores it
through its `server: {world: adr043-preslice-25}` field (the restore is a
lab-api addition beside the scenario; a teammate adds it), logs the two
players in under the lab's deployed order, and asserts, before and after a
server restart, that each stored form still means what it meant when it was
written. Hard rule 6: a DB schema change ships with a migration and a
restart-persistence scenario; ADR-043's consequences name this one
(docs/DECISIONS.md, "the restart-persistence scenario extended with a load
order change").

## Contents

| file | what |
| --- | --- |
| `changeForms/*.json` | the eight records, byte-identical to numidium's capture (sha256 of each checked against the individually served files on 2026-10-20) |
| `load-order.json` | the order the records were written under, in the slice's format (below) |
| `served-load-order.json` | the source: `lab/deploy/sky-srv/server-settings.json`'s `loadOrder` at the time, as numidium served it; kept for the slot computation's provenance |
| `README.md` | this file |

A restore copies `changeForms/` and `load-order.json` into the server's
`world/` (the file driver's layout: `FileDatabase.cpp`, `changeForms/` beside
`load-order.json`, slice one's `FileDatabase::LoadLoadOrder`). The other two
files are harmless there (the driver iterates `changeForms/*.json` only) but
need not travel.

## Provenance

numidium's `README.txt` on the results site
(https://thuum.gaussing.tv/results/fixtures/adr043-preslice-25/), verbatim:

> ADR-043 rule-6 fixture source, numidium 2026-10-20
> changeForms/: the 8 records of /srv/lab/snapshots/playtest-m2-25-20261019T214234Z (saved 2026-10-19 14:42 PDT after playtest 25, raw slot ids, pre-slice)
> served-load-order.json: lab/deploy/sky-srv/server-settings.json loadOrder at thuum 06f53e3 (train-28 stage for playtest 25, no layer), identical to main d8e3216 (17 plugins, rotfern.esp list index 11); the server logs no load order line, so git is the source

The server that wrote these records ran fork m2-train-28 on the train-28
stage (docs/LOG.md, playtest twenty-five), before any version mark existed.

## The records

| file | recType | profile | what | raw form ids it holds |
| --- | --- | --- | --- | --- |
| `0.json` | 1 (ACHR) | 1 (the lab's c1, Eli's test 1) | "rotfern", female, race rotfern.esp AA00, weight 50 | `inv` (26 entries), `equipmentDump` (28 entries, `leftSpell`, `voiceSpell`), `learnedSpells` (23), `appearanceDump` (`raceId`, `headTextureSetId`, 8 `headpartIds`) |
| `1.json` | 1 (ACHR) | 2 (the lab's c2, test 2) | "Prisoner", male Nord (Skyrim.esm 13746), weight 75 | `inv` (26), `equipmentDump` (4 worn, `leftSpell`, `rightSpell`, `voiceSpell`), `learnedSpells` (14), `appearanceDump` (race, texture set, 8 head parts) |
| `2.json`, `3.json` | 0 (REFR) | none | deleted dropped stacks of Skyrim.esm 1397D (count 63) | none (`baseDesc` is already a FormDesc) |
| `4.json` | 0 (REFR) | none | a deleted dropped Skyrim.esm 3B562 | none |
| `b3188_Skyrim.esm.json`, `b318b_Skyrim.esm.json` | 0 (REFR) | none | two opened world containers (bases 97F70 and 845) holding Skyrim.esm 64B2F (5 and 2) | `inv` |
| `b318e_Skyrim.esm.json` | 0 (REFR) | none | an opened world container (base 54175), empty | none |

Fields already plugin-relative in these records, which the migration leaves
alone (docs/research/formdesc-world-map.md section 1b): `formDesc`,
`baseDesc`, `worldOrCellDesc`, `spawnPoint_cellOrWorldDesc`, `shoutRecord`,
`favorites`, `mapMarkers`, `ingredientEffects` (`"81e:ccBGSSSE037-Curios.esl"`
in `1.json`), and RaceMenu's preset text (`"rotfern.esp|02E110"`,
`"Skyrim.esm|03B521"`). The records hold no `playerGlobals` (that field
landed after playtest twenty-five), so no global is available to assert.

The profile ids match the lab: sky-c1 logs in as c1 / profile 1 and sky-c2
as c2 / profile 2 (`lab/deploy/sky-client/README.md`, "Clone bring-up";
`lab/labapi/labapi/guests.yaml` `clients`), so c1 plays `0.json` and c2
`1.json` with no change.

## The order the records were written under, and its slots

`served-load-order.json` lists 17 plugins. The server numbers full and light
plugins apart, each in list order: a full plugin's forms are `slot << 24 |
local`, a light plugin's `0xFE000000 | lightIndex << 12 | local`
(`skymp5-server/cpp/server_guest_lib/FormDesc.cpp`, `FormDesc::ToFormId(const
EspmFileList&)` and `FromFormId`, the loop counting `numFull` and `numLight`;
docs/verbs/light-plugins.md, CommonLibSSE-NG `TESFile.h:61` and
`TESDataHandler.cpp:40-57`). A plugin is light when its TES4 header carries
`kSmallFile` (1 << 9) or its extension is `.esl`
(`libespm/src/Combiner.cpp:16-18, 61-64`). The names alone give the
extension; the one ESL-flagged `.esp` here is Headshot Kills.esp
(docs/PLAN.md:168 "light by its header, FE003 on both ends";
docs/verbs/headshot.md:189; the essentials layer's
`lab/layer/load-order.tsv` row 62 on branch apocrypha/layer-essentials, which
records every plugin's header flag). RaceMenu.esp and RaceMenuPlugin.esp are
full (docs/MODS.md, "TES4 flags 0x0"), as are rotfern.esp, LostGrimoire.esp,
Apocalypse and RaceCompatibility.esm (the same TSV). The two Creation Club
`.esm` files are full, which the records prove (below).

| list index | plugin | kind | slot under this order | slot under main 916860e | slot under the essentials layer |
| --- | --- | --- | --- | --- | --- |
| 0 | Skyrim.esm | full | 00 | 00 | 00 |
| 1 | Update.esm | full | 01 | 01 | 01 |
| 2 | Dawnguard.esm | full | 02 | 02 | 02 |
| 3 | HearthFires.esm | full | 03 | 03 | 03 |
| 4 | Dragonborn.esm | full | 04 | 04 | 04 |
| 5 | ccBGSSSE001-Fish.esm | full | 05 | 05 | 05 |
| 6 | ccQDRSSE001-SurvivalMode.esl | light | FE000 | FE000 | FE000 |
| 7 | ccBGSSSE037-Curios.esl | light | FE001 | FE001 | FE001 |
| 8 | ccBGSSSE025-AdvDSGS.esm | full | 06 | 06 | 06 |
| 9 | _ResourcePack.esl | light | FE002 | FE002 | FE002 |
| 10 | RaceCompatibility.esm | full | 07 | 07 | 0A |
| 11 | rotfern.esp | full | 08 | 08 | 2F |
| 12 | RaceMenu.esp | full | 09 | 09 | 23 |
| 13 | RaceMenuPlugin.esp | full | 0A | 0A | 24 |
| 14 | LostGrimoire.esp | full | 0B | 0B | 28 |
| 15 | Apocalypse - Magic of Skyrim.esp | full | 0C | 0C | 1A |
| 16 | Headshot Kills.esp | light | FE003 | FE003 | FE01E |

Main's column is identical because main's `server-settings.json` (916860e,
the same `loadOrder` as d8e3216) is this order. The essentials layer's
column is computed from `lab/layer/load-order.tsv` on
apocrypha/layer-essentials (the head of 10 masters and Creation Club plugins,
then its 81 served rows with their header flags, `lab/tools/layer-render.py`)
with the same numbering; it agrees with the three slots ADR-043 and
docs/LAB.md measured (Apocalypse 0C to 1A, LostGrimoire 0B to 28, rotfern.esp
08 to 2F) and with docs/MODS.md's count on that branch (40 light plugins
after the three Creation Club ones). That layer is not merged (playtest
twenty-six found it not ready; docs/LOG.md 2026-10-20).

The records confirm the full slots of this order on their own: `0.json`'s
`headTextureSetId` 0x0802E110 is `2e110:rotfern.esp`, the very texture set
RaceMenu's preset text in the same record names by plugin
(`"rotfern.esp|02E110"`), so rotfern.esp sat at 08, which holds only if
Fish.esm and AdvDSGS.esm are full; `1.json`'s `headTextureSetId` 0x0003B521
matches its preset's `"Skyrim.esm|03B521"`; the race 0x0800AA00 is the
rotfern race docs/verbs/stagger.md:386 names on this order; LostGrimoire's
Teleportation 0x0B0A86DF is docs/verbs/cast-teleport.md:242's "full slot 0B";
Apocalypse's 0x0C00AAE8 is Ghostwalk (docs/verbs/ghostwalk.md:67, SPEL
0300AAE8, docs/LOG.md:1792 "0x0C00AAE8").

## load-order.json

The slice's format, `database_drivers/LoadOrderFile.h` and `.cpp` on
m2-formdesc-world: an object with a `files` array, one `{"name", "light"}`
per plugin in load order, `name` the file name as the server's `EspmFileList`
holds it (`libespm` `Loader::GetFileNames`, `path.filename()`, so no
directory), `light` the flag above. `FromJson` reads nothing else and
defaults `light` to false; `ToJson` writes nothing else. The file here is
written as the server writes it: nlohmann's `dump(2)` (keys sorted, so
`light` before `name`; two-space indent; no trailing newline), generated from
`served-load-order.json` by a script in the fixture's commit message, not
typed. Every field the slice reads is derivable, so there is no `TODO`.

How the slice uses it (`database_drivers/RecordReader.cpp`,
`MpChangeForms.cpp` `JsonToChangeForm`): a record without `formVersion` is
re-based from this saved order to the running one at the first load that
sees it (the migration is `ToJson` under the saved order, then a read under
the running one) and written back as version 2 with the running order in
`load-order.json`; a world without the file is read as if its raw ids were
the running order's. The file is therefore what makes a different running
order a test rather than a corruption.

## The raw ids worth asserting

Decoded under this order (the scenario names each as a FormDesc so lab-api
composes the run's id from its own order, `lab/labapi/labapi/slots.py`):

| record | field | raw id | under this order | taken raw under the essentials layer (a wrong migration) |
| --- | --- | --- | --- | --- |
| 0.json | appearance raceId | 0x0800AA00 | `aa00:rotfern.esp` | slot 08 is GeneralDisplays.esm: no race |
| 0.json | appearance headTextureSetId | 0x0802E110 | `2e110:rotfern.esp` | GeneralDisplays.esm |
| 0.json | six head parts | 0x0802E117, 0x0802E116, 0x0802E11C, 0x0802E11A, 0x0802E119, 0x08014C06 | rotfern.esp (the other two, 0xEC1B2 and 0xE4DA8, Skyrim.esm) | GeneralDisplays.esm |
| 0.json | learnedSpells, equipment leftSpell | 0x0C035452 | `35452:Apocalypse - Magic of Skyrim.esp` (Finger of Death, docs/research/train-29-rows.md:72) | slot 0C is Cloaks - Dawnguard.esp: no spell |
| 0.json, 1.json | learnedSpells | 0x0B0A86DF | `a86df:LostGrimoire.esp` (Teleportation) | slot 0B is Cloaks.esp |
| 1.json | learnedSpells, equipment leftSpell | 0x0C00AAE8 | `aae8:Apocalypse - Magic of Skyrim.esp` (Ghostwalk) | Cloaks - Dawnguard.esp |
| 1.json | inv entry | 0xFE00181E | `81e:ccBGSSSE037-Curios.esl` (Sload Soap, a-light-plugin's ingredient) | FE001 is Curios under both orders: unchanged, a control for the light numbering |
| 1.json | equipment rightSpell | 0x00012FD0 | `12fd0:Skyrim.esm` (Firebolt) | unchanged, a control |
| both | inv | 0x13989, 0xF | Skyrim.esm SteelSword (1 each), Gold001 (140 each) | unchanged, controls |

The other Apocalypse spells in `0.json` (186D, 2878, 1F1FB, 24E49, 2E634,
31C4D, 44D44, 5ECEE, 83A22, 88694, 109653, 124EC7, 124EC9) and in `1.json`
(186D, 1F1FB, 24E49, 2E634, 5ECEE, 83A22, 88694) move the same way; the
scenario asserts one per player and reads the rest in the world-diff.
