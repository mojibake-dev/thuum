# Encounter zones: the level clamp for the server's roll (draft, 2026-10-24, thuum-magnus's research agent)

ADR-049 decision 1 (docs/DECISIONS.md:2678-2683) rolls a leveled placement at a
player's level and owes the encounter zone's clamp "when libespm reads CELL and REFR
XEZN and the ECZN record (it has none today)". The documented engine rule is short: a
zone carries a minimum and a maximum level; a player below the minimum is treated as
the minimum unless the zone's "Match PC Below Minimum Level" flag is set; a maximum of
0 means no cap; the level so computed is fixed for the zone when the player first
loads one of its cells and is never recalculated. CommonLibSSE-NG's BGSEncounterZone.h
gives the record's layout and the runtime's locked zoneLevel; a cell, a worldspace and
a reference each hold a zone pointer. libespm reads XEZN on WRLD alone and has no
ECZN record: CELL and REFR (and ACHR, which inherits REFR's data) carry no zone, so
the fate pass's level (PartOne::FateRollLevel) reaches the leveled-list filter
unclamped. The slice below adds the ECZN struct, two XEZN reads, one lookup and one
clamp, with a T0 on the rule and on BleakFallsBarrowZone (min 6, max 20 per the
Creation Kit wiki) and a lab read of server.fate(id).level. Everything inferred is
tagged HYPOTHESIS; the zone's form ids are owed to lab/esm.py on sky-srv.

## 1. The engine's rule as documented

The Creation Kit wiki's Encounter Zone page (https://ck.uesp.net/wiki/Encounter_Zone;
the live host answers with a Cloudflare challenge, so this read is the Wayback capture
https://web.archive.org/web/2024id_/https://ck.uesp.net/wiki/Encounter_Zone, revision
oldid 9608) defines the fields. Min Level: "The minimum level (integer, default 0) the
encounter zone can be calculated. In other words, if the player's level is less than
the minimum level, the encounter zone will ignore the player's level and use the
minimum level." Max Level: "The maximum level (integer, default 0) the encounter zone
can be calculated. If left 0 (zero), the encounter zone will not max out." Match PC
Below Minimum Level: "If checked, the encounter zone will match the player's level if
the player enters the encounter zone below the minimum level." Never Resets: "The
encounter zone will never reset, no matter how much time passes." Disable Combat
Boundary: "Actors in combat with the player only follow the player through load doors
that lead to the same encounter zone. With this box checked, actors in combat with the
player will ignore this rule and follow the player into a different encounter zone."
Where a zone attaches: "Interior Data of interior cells, World Spaces, and individual
References can be tagged with an Encounter Zone." Its worked example is ours:
"BleakFallsBarrowZone: This area has a minimum level of 6, a maximum level of 20, and
resets normally. ... if the player enters the zone below level 6, the encounter zone
will ignore the player's level and calculate using its minimum level of 6. If the
player enters the zone above level 20, the encounter zone will calculate at level 20,
and no higher."

The lock. The GECK wiki's page for the same system in Fallout 3 and New Vegas
(https://geckwiki.com/index.php/Encounter_Zone, read through
https://web.archive.org/web/2023id_/https://geckwiki.com/index.php/Encounter_Zone):
"The Zone Level is a value calculated the first time the player loads any of the
Encounter Zone's cells. It is stored permanently on the Encounter Zone and is never
recalculated. If the player returns to the zone after gaining several levels, the
zone's level remains the same as when he first visited." UESP says the same of our
dungeon (https://en.uesp.net/wiki/Skyrim:Bleak_Falls_Barrow_(place), infobox "Level:
Range: 6-20", note): "Enemies in this location will remain at the levels determined
when you first enter, but this is one of a few locations with a level cap (at 20).
Therefore, the final boss may be a different level than the other enemies." The GECK
page adds a Fallout rule, "If the player's level is above the zone's, only a percentage
of the player's level is used. The fLevelScalingMult gamesetting controls the amount";
no header in CommonLibSSE-NG names such a setting (grep over include/RE), so Skyrim
is read as using the player's level as is between the bounds, HYPOTHESIS.

The accessible summaries. UESP's Leveled Lists page
(https://en.uesp.net/wiki/Skyrim:Leveled_Lists): "A request for a leveled list always
provides a desired quantity and a desired level, usually the player's level, possibly
modified by the level of the encounter zone"; its "Encounter Zone Level" link redirects
to https://en.uesp.net/wiki/Skyrim:Dungeons#Levels: "Normally, all enemies and loot are
generated based on your character's current level. However, if your level is lower
than the dungeon's minimum level, the enemies and loot are instead generated using that
minimum level", with the category pattern (bandit camps 6, draugr crypts 6, Falmer
hives 18, dragon priest lairs 24). The Synthesis EncounterZoneNames README
(https://github.com/Synthesis-Collective/EncounterZoneNames) puts it in one line:
"Below the min level? Enemies still meet that min. Above the max? They stop scaling and
stay capped", and names Forelhost as a min-24, no-cap zone.

The record format (https://en.uesp.net/wiki/Skyrim_Mod:Mod_File_Format/ECZN): EDID,
then DATA, "struct[12]" ("2 Records have length 8 instead of 12, but those 2 records
are all zero"): owner formID ("NPC_ or FACT"), location formID (LCTN), owner rank int8
("either 0 or -1 used if no faction provided"), min level uint8, flags uint8, max level
uint8. UESP's flags table reads "0x00 = Never Resets, 0x01 = Match PC Below Minimum
Level, 0x02 = Disable Combat Boundary", which cannot be bit values (a flag of 0x00);
xEdit's definition (https://github.com/TES5Edit/TES5Edit/blob/dev/wbDefinitionsTES5.pas
lines 9493-9507) lists the same three names as wbFlags in bit order, so bits 0, 1, 2,
and types Rank, Min Level and Max Level as itS8. CommonLibSSE-NG agrees with xEdit
(section 2). The subrecord that names a zone is XEZN, one formID, on CELL
(https://en.uesp.net/wiki/Skyrim_Mod:Mod_File_Format/CELL, "A reference to an
encounter zone", in the any-order tail), on REFR
(https://en.uesp.net/wiki/Skyrim_Mod:Mod_File_Format/REFR, "XEZN, formid, Encounter
Zone"), on ACHR (https://en.uesp.net/wiki/Skyrim_Mod:Mod_File_Format/ACHR, "XEZN
encounterzone formid ECZN") and on WRLD
(https://en.uesp.net/wiki/Skyrim_Mod:Mod_File_Format/WRLD, "XEZN Encounter Zone
formID"); xEdit carries XEZN on ACHR (:6205), CELL (:7498), REFR (:13023) and WRLD
(:13784, "ECZN or NULL"). ACHR also carries XLCM, the level modifier (UESP ACHR, line
"XLCM leveled creature data uint32, Level Modifier"), a separate input the clamp does
not touch (section 5).

## 2. The engine's data structures in CommonLibSSE-NG

/Users/eli/Code/mojibake/thuum/CommonLibSSE-NG/include/RE/B/BGSEncounterZone.h:8-28 is
ENCOUNTER_ZONE_DATA, the DATA subrecord: zoneOwner TESFaction* (:20), location
BGSLocation* (:21), ownerRank int8 (:22), minLevel int8 (:23), flags as a uint8
enumeration (:24), maxLevel int8 (:25), then padding to 0x18 (:26-28). The flags
(:11-17): kNeverResets = 1 << 0, kMatchPCBelowMinimumLevel = 1 << 1,
kDisableCombatBoundary = 1 << 2. The runtime half is ENCOUNTER_ZONE_GAME_DATA (:30-40):
detachTime, attachTime, resetTime (:34-36) and zoneLevel, a uint16 (:37), the locked
level of section 1. BGSEncounterZone (:42-81) is FormType::EncounterZone (:47; F/
FormTypes.h:243 "67 ECZN"), with ChangeFlags kZoneFlags and kGameData (:49-56) and
SaveGame/LoadGame (:72-73), so both the flags and the game data persist in a save;
data sits at 0x20 and gameData at 0x38 (:78-79).

Where a zone is read: a cell's pointer, T/TESObjectCELL.h:103 (encounterZone, +0x160);
a worldspace's, T/TESWorldSpace.h:224 (encounterZone, +0x220, commented XEZN); a
reference's, through its extra list: E/ExtraEncounterZone.h:10-28 (zone at +0x10, type
kEncounterZone, E/ExtraDataTypes.h:286, 0x70), read by ExtraDataList::GetEncounterZone
(E/ExtraDataList.h:185) and written by SetEncounterZone (:193; TESObjectREFR.h:467).
The level the roll consumes is TESObjectREFR::GetCalcLevel(bool a_adjustLevel)
(T/TESObjectREFR.h:387), handed to TESLeveledList::CalculateCurrentFormList(a_level,
...) (T/TESLeveledList.h:65), with iLevCharLevelDifferenceMax as the character list's
difference bound (T/TESLevCharacter.h:49). The order in which a reference's zone is
resolved, its own extra data, else its cell's, else its worldspace's, is
docs/research/m3/re-npc-roll.md:489-491's reading of the reset path, and the roll
path's GetCalcLevel reading (:90-96: the zone's gameData.zoneLevel when set, computed
and locked at first use, the player's level when there is no zone) is that doc's RE-6,
both HYPOTHESIS until the Frida read in docs/verbs/npc-fate.md:1103-1105.

## 3. What libespm has today

The fork worktree is /Users/eli/Code/mojibake/thuum/lab/.cache/wt/puppet. libespm's
record list, libespm/include/libespm/Records.h:1-40, has no ECZN.h; the ECZN record
type does not exist, and Browser::GetRecordsByType indexes only a few types
(libespm/src/Browser.cpp:155), though LookupById answers for any record by id
(libespm/include/libespm/Browser.h:20; CombineBrowser.h:19 across the load order).
CELL.h:25-35 reads one Data field, the DATA flags (CELL.cpp:13-16), and the XCLC grid
(CELL.cpp:29-33); no XEZN. REFR.h:105-134 reads NAME, XSCL, DATA, XTEL, XPRM, XCNT,
XAPD, XAPR, XLKR, XOWN, XESP, FULL, FNAM and TNAM (REFR.cpp:13-53); no XEZN and no
XLCM. ACHR.h:16-18 declares Data as REFR::Data, so a placed NPC inherits the gap.
WRLD.h:88-89 holds encounterZoneId and WRLD.cpp:22-23 reads it from XEZN: the one XEZN
libespm reads, and the idiom (an unmapped formId copied out of the field). The leveled
list itself is LeveledListBase.h:22-39 (Entry level, formId, count; Data chanceNone,
flags, global, entries), read at LeveledListBase.cpp:14-25 (EDID, LVLF, LVLG, LVLD,
LLCT); LVLN.h:8-12 and LVLI.h:8-12 are its two kinds.

The evaluation, skymp5-server/cpp/server_guest_lib/LeveledListUtils.cpp: EvaluateList
(:17-70) filters entries at :46-50, `if (!pcLevel || data.entries[i].level <= pcLevel)`,
so 0 admits every entry (the header's comment, LeveledListUtils.h:17-18: "pcLevel=0
makes it thinking that pcLevel=maximum possible pc level"); EvaluateListRecurse
(:72-123) carries pcLevel into nested lists; EvaluateTemplateChain (:125-153) walks an
NPC_'s template chain and, at a LVLN, UpdateCursorAndResult (:200-224) calls
EvaluateAndSelectNpcId (:227-247), the first key of the recursed map. The level's flow
into it: PartOne::FateRollLevel (PartOne.cpp:1577-1634) picks loader, party-mean,
party-min or fixed by WorldState::npcRollLevel (WorldState.h:318-320), clamped at 1;
SendFates (:1635-1712) sets worldState.fateLoaderLevel (WorldState.h:314) around
LoadChunksAround (:1662-1665); MpActor::EnsureTemplateChainEvaluated (MpActor.cpp:
1736-1844) reads it as kPcLevel = fateLevel.value_or(0) (:1747-1748), rolls with it
(:1831-1834) and records changeForm.fateLevel (:1841; MpChangeForms.h:125);
RollFateIfUnrolled (:1711-1734) and the respawn (:2112-2135) re-roll at a given or the
recorded level; the outfit's entries roll at the fate level, else 1
(MpObjectReference.cpp:2115-2118). Nowhere is a zone consulted: the clamp is absent.

## 4. A proposed slice (no code)

(a) libespm. An ECZN.h in the shape of LeveledListBase.h: kType "ECZN", Data with
ownerId, locationId, ownerRank (int8), minLevel, flags, maxLevel (int8, xEdit and the
header; UESP says uint8), read from DATA when its size is at least 12 and left zero
otherwise (UESP's two 8-byte records), flags named in the header's bit order
(NeverResets 0x01, MatchPcBelowMinimum 0x02, DisableCombatBoundary 0x04); an include in
Records.h. CELL::Data gains encounterZoneId from XEZN and REFR::Data gains
encounterZoneId from XEZN, both WRLD.cpp:22-23's idiom; ACHR inherits. The field is a
file-local id and takes the same mapping the base id takes in AttachEspmRecord
(WorldState.cpp:441, espm::utils::GetMappedId) before any lookup.

(b) The lookup. A WorldState::ZoneOf(record, mapping) returning an optional ECZN::Data:
the placement's own XEZN first; else its cell's, the interior cell by the record's
parent group (GroupUtils.h:22-37 GetCellGroup, GroupHeader.h:18 GetParentCELL), the
exterior cell by WorldState::CellOf's FindExteriorCell (WorldState.cpp:1298-1325); else
the worldspace's XEZN already in WRLD::Data (WRLD.h:89); then LookupById on the zone
id and ECZN::GetData. The order is the engine's as re-npc-roll.md:489-491 reads it,
HYPOTHESIS; the worldspace step goes beyond ADR-049's wording (CELL and REFR) and is
a question for Eli. AttachEspmRecord (WorldState.cpp:429-690) has the record, the
mapping and the cache in hand, so the zone can be resolved there, or lazily in
EnsureTemplateChainEvaluated from the actor's editor placement.

(c) The clamp, applied where kPcLevel is formed (MpActor.cpp:1747-1748) so every roll
path shares it: with L the fate pass's level and the zone (min, max, flags), if L < min
and the MatchPcBelowMinimum bit is clear then L = min; then if max > 0 and L > max then
L = max; a zone with min 0 and max 0 leaves L alone, and no zone leaves L alone. That is
the Creation Kit wiki's three sentences in order; min applied before max, and a zone
with 0 < max < min, are not specified by any source and are HYPOTHESIS (no vanilla
record is known to have the second). The record's fateLevel stores the clamped level,
so the respawn's re-roll (decision 3) and the lab read see the clamp, and a record
rolled before this rule keeps its roll (decision 1's last sentence). The server's level
stays per placement where the engine's zoneLevel is per zone (section 2): two players
of different levels fating two squares of one zone roll at two levels; matching the
engine's lock needs a persisted per-zone level, a larger slice to decide separately.

(d) T0, two cases beside unit/NpcFateTest.cpp. First, the rule alone, no esm: a table
(level, min, max, flags) to expected, at least (3, 6, 20, 0) to 6, (3, 6, 20, match) to
3, (35, 6, 20, 0) to 20, (35, 6, 0, 0) to 35, (10, 0, 0, 0) to 10, (6, 6, 20, 0) to 6.
Second, esm-backed under the [NpcFate][espm] tags (the fixture loads Skyrim.esm and the
DLC masters from GetDataDir(), unit/main.cpp:19-34, and GetPartOne() shares one world
across cases): look up BleakFallsBarrowZone's ECZN and REQUIRE minLevel 6, maxLevel 20
and the NeverResets bit clear ("resets normally"); then a leveled ACHR in
BleakFallsBarrow01 (UESP's locationcode for Bleak Falls Temple) loaded through the fate
pass with the loader's record.level at 3, 12 and 35 should record fate levels 6, 12
and 20, in NpcFateTest.cpp:56-111's shape (TickCellHosts, SentTo<ActorFateMessage>,
GetFateLevel). The form ids of the zone, the cell and a placement are not in any
cited source: lab/esm.py on sky-srv gives them (`esm.py find Skyrim.esm ECZN
BleakFallsBarrowZone`, `esm.py find Skyrim.esm CELL BleakFallsBarrow01`, then `esm.py
id` on the ACHR records of that cell's group), and the ECZN DATA bytes it prints are
the oracle for the T0's numbers. Whether the fate pass loads an interior's actors
(SendFates runs on a square change in the actor's cellOrWorld, PartOne.cpp:1635-1712)
is untested in T0 so far, HYPOTHESIS; the exterior shape of the first case is the
fallback (a leveled placement in an exterior cell whose XEZN is set).

(e) The lab read. A probe in x-npc-fate-roll.yaml's shape (lab/.cache/probes): one seat
whose record level the server sets below 6 (server-side setup, never console typing),
teleported to Bleak Falls Temple's first chamber; assertions `server.fate(<achr>).level
== 6`, and `c1.npc_state(<achr>).raceId == server.fate(<achr>).raceId` as
lab/scenarios/b-npc-respawn.yaml:82 asserts, which proves the pin took the clamped roll.
A second leg at level 35 expects 20. server.fate(id).level is already in the grammar
(lab/labapi/labapi/assertions.py:34 and :497-505; state.py:116-120), so the probe needs
no new step; the engine's own zoneLevel for comparison is RE-6's Frida read (a cell's
encounterZone at +0x160, TESObjectCELL.h:103; gameData at +0x38 and zoneLevel at +0x0C
within it, BGSEncounterZone.h:37 and :79). An interior's actors take the late path (ADR-
049's consequences: the engine loads them at the door before the server hears), so the
read must tolerate one engine re-roll before the pin. Scenario YAML in its own commit
for Eli's review (rule 13).

## 5. Risks and what stays unknown

The flag bits: UESP's table and the header disagree; the header and xEdit agree, and
the slice follows them, but a wrong bit would silently invert Match PC Below Minimum.
The CK wiki says nothing about that flag on BleakFallsBarrowZone, so the esm read of
its flags is the only check. The lock's granularity: the engine locks one zoneLevel per
zone at the first load of any of its cells (GECK text, header :37); the server records
one level per placement at its fate pass, so a party spread across levels can roll one
dungeon at several levels, and a zone shared by many cells (Tamriel's XEZN, if the WRLD
record carries one; unread) could clamp the whole wilderness through the worldspace
fallback: `esm.py id Skyrim.esm 0x3c` answers before (b) ships. The other roll inputs
the server ignores stay ignored: GetCalcLevel's a_adjustLevel counter and the
difficulty multipliers (re-npc-roll.md:93-96, HYPOTHESIS), iLevCharLevelDifferenceMax
(TESLevCharacter.h:49), ACHR's XLCM modifier (ExtraLevCreaModifier.h:8-15; UESP ACHR),
and the picked NPC_'s own PC-level multiplier and calcLevelMin/Max (TESActorBaseData.h:
29, :69-71), which each engine still computes for the actor's level: the clamp changes
which NPC_ the chain picks, not how strong that NPC_ comes out on a seat. Skyrim's
treatment of a player above the minimum (the level as is, or a scaled share as the GECK
describes for Fallout) is unverified; the CK example reads as "as is". The Creation
Kit wiki citation is a Wayback capture; re-read the live page when its host answers. A
record rolled before the clamp keeps its unclamped roll by decision 1, so dungeons
fated before the slice stay as rolled until their respawn re-roll (which keeps the
stored level: they never clamp) or a world reset.
