# c1's terrain-upgrade crash: the content side (2026-10-31)

Read by apocrypha for numidium's low-priority lead: three identical crashes on
sky-c1 in the containers gate, 30 to 45 s into the NPC runs
(20261101-001625-b-npc-stream-voice, 20261101-002723-b-npc-caster), a null read
at SkyrimSE.exe+02AD242 (`mov rax, [rcx]`) with BGSQueuedTerrainUpgrade on the
stack and these objects beside it: TESObjectLAND 0xA7B3, the terrain texture
Textures\Terrain\Tamriel\Tamriel.4.28.-20.DDS, Noise.dds, cells 0x97B3 and
0xBBB1 (last writer USSEP) and worldspace 0x3C (last writer
mihailatmoranremains.esp). docs/LOG.md (18:03 PDT) already reads it as a lab
fault: correctable PCIe errors on c1's GPU link at Gen3 since the card swap,
none on c2, the port capped to 5 GT/s, numidium replaying the window. This page
is the other half: whether anything in the layer explains that site. Nothing
does. Records and files below were read byte-level from lab/.cache (Skyrim.esm,
Dawnguard.esm, Dragonborn.esm and every deployed layer plugin); Update.esm and
HearthFires.esm are not in the cache and were not read.

## The site

- CELL 0x97B3 is RiftWatchtowerExterior02, grid (30,-17); CELL 0xBBB1 is the
  unnamed cell at (32,-15). LAND 0xA7B3 is (30,-17)'s land record.
- The level-4 LOD quad Tamriel.4.28.-20 covers cells x 28..31, y -20..-17, so
  it holds (30,-17); (32,-15) is in the next quad east, Tamriel.4.32.-16.
- "Last writer" in the Crash Logger line is the plugin whose copy of the record
  wins in the load order, nothing more.

## The records

**WRLD 0x3C (Tamriel).** USSEP (slot 1) carries the record with regenerated
max-height data; its Version History lists this as bug #27167, "World max
height data has been updated to properly reflect all changes made by the
original 3 official DLCs". Nine deployed layer plugins also carry the record,
and every one of them carries Dragonborn.esm's copy unchanged (the CK writes
the worldspace record when a plugin places anything in Tamriel):

| slot | plugin | MHDT |
| --- | --- | --- |
| 14 | MysticismMagic.esp | Dragonborn's |
| 21 | SimplyBiggerTreesSE.esp | Dragonborn's |
| 27 | mihailcrowsandravens.esp | Dragonborn's |
| 28 | rmp_telvannihearthfires.esp | Dragonborn's |
| 32 | Prometheus_BeastSkeletons.esp | none at all |
| 33 | Apocalypse - Magic of Skyrim.esp | Dragonborn's |
| 34 | mihailringneckedpheasant.esp | Dragonborn's |
| 35 | IntuitiveDragonRideControl.esp | Dragonborn's |
| 39 | mihailatmoranremains.esp | Dragonborn's (the winner) |

Against USSEP's record the winner differs in MHDT only; CNAM, NAM2, NAM3, NAM4,
DNAM, MNAM, ONAM, NAMA, DATA, NAM0, NAM9, ZNAM, TNAM and UNAM are byte-equal.
So the one effect of mihailatmoranremains.esp winning Tamriel is that USSEP's
MHDT fix is reverted. MHDT is the per-cell-quad height ceiling: UESP's WRLD
page gives it as an 8-byte min/max grid header then "4 byte structs,
containing 4x 1 Byte Integers, 1 struct per cell, listing the Max Heights per
quad in each cell", and the CELL page describes the per-cell form as "height
ceilings used by the dragon flight system"; on the STEP thread zilav calls the
worldspace form "Camera Data of the whole worldspace". Neither source puts it
in the terrain-load path.

The two copies differ in 92 of 45,600 payload bytes. Mapping them needs the
cell order, which UESP leaves open; fitting the bytes against the land maximum
of all 11,186 Tamriel LAND records in Skyrim.esm settles it: cells run x-outer,
y-inner (offset = ((x - minX) * 95 + (y - minY)) * 4 for Tamriel's 120 x 95
grid), r = 0.977; the other orders give r near 0. On that layout USSEP's
regeneration touches 28 cells: a block of 18 around Castle Volkihar (x -45..-40,
y 35..38, Dragonborn's bytes there are the void value 0x0a) and (-20,10),
(-18,-27), (-18,8), (-7,24), (-6,24), (-3,-18), (-3,-17), (7,8), (7,9),
(28,-21). Neither crash cell is among them, and neither crash quad is: (28,-21)
is in Tamriel.4.28.-24, the quad south of the crash quad. The crash cells'
bytes are identical in both copies.

mihailatmoranremains.esp itself places 20 references (11 statics) in 11
Tamriel cells: (16..19, 23..27), (25,20), (-3,24), (-3,25), (36,4). Nothing
within ten cells of the site.

**CELL 0x97B3 and 0xBBB1.** Overridden by USSEP alone. Against Skyrim.esm each
differs in one field, the third dword of XCLC: 0x0053fd00 becomes 0xaa250f00.
The four defined bits there (Force Hide Land Quad 1..4, the low nibble) are
clear in both; UESP's CELL page notes the high bits "look random". TVDT
(occlusion), MHDT, XCLW (water), XCLR (regions), LTMP and XLCN are byte-equal.
USSEP carries the cells for reference work: two placed references and a navmesh
in (30,-17), two references in (32,-15). It carries no LAND record anywhere in
the 26..35 x -21..-12 window.

**LAND 0xA7B3 and its textures.** Skyrim.esm's record only; no override in
Dawnguard.esm, Dragonborn.esm or any layer plugin. Its six landscape textures
(LTEX 057DC7, 057DCF, 057DD1, 058606, 06DE8E, 0A7619) and their five texture
sets (TXST 057DC6, 057DCE, 057DD0, 058605, 000AE1) are overridden by nothing in
the layer.

**Other layer placements near the site.** mihailcrowsandravens.esp puts two
raven objects in (27,-18) and four crow statics in (28,-14);
mihailringneckedpheasant.esp puts a pheasant actor in each of (29,-19),
(32,-14) and (35,-19). Those are the only layer edits in the window besides
USSEP's; none touch (30,-17) or (32,-15), none touch land.

## The files

- No layer mod ships the quad's terrain texture or mesh
  (textures\terrain\tamriel\tamriel.4.28.-20.dds,
  meshes\terrain\tamriel\tamriel.4.28.-20.btr). USSEP's BSA ships one Tamriel
  terrain mesh, for quad 4.-20.8, far away.
- No layer mod ships a noise.dds. Noise.dds is the terrain LOD's noise texture
  (the STEP thread "What is Noise.dds?": the grain laid over distant terrain),
  so the two texture names on the stack are the LOD block's own textures, not
  evidence of a bad file.
- Simply Bigger Trees (the Realistic Aspen Trees loose build) ships tree-LOD
  billboards for both crash quads, meshes\terrain\tamriel\trees\tamriel.4.28.-20.btt
  and tamriel.4.32.-16.btt (389 Tamriel .btt in all), and the Tamriel tree atlas
  textures\terrain\tamriel\trees\tamrieltreelod.dds. These are the only layer
  files that belong to those two quads. Whether the terrain-upgrade path reads
  .btt files the sources do not say.

## Verdict

No content lead. The worldspace "last writer" is a classic Creation Kit side
effect that nine layer plugins share, inert for terrain; USSEP's cell overrides
are reference work with a garbage-bit difference; the land and its textures are
vanilla and unopposed; the quad's terrain files are vanilla. That leaves the
LOG's read, the c1 GPU link, as the only live explanation, and a run on c1 at
5 GT/s that passes the same window is the confirmation.

If it recurs with the link capped:

1. Get the Crash Logger text. It is not on the seats: on 2026-11-01 01:48 UTC
   sky-c1 held only the 2026-10-30 21:25 pair (a different crash, a Draugr
   weapon equip on a job thread, SkyrimSE.exe+015F0D8) and sky-c2 one 1.3 KB
   log from 2026-10-30 22:04; the harness moves them. The full stack says
   whether the upgrade was reading land textures, LOD meshes or tree billboards.
2. A/B the two Simply Bigger Trees billboards: drop tamriel.4.28.-20.btt and
   tamriel.4.32.-16.btt from the served tree so vanilla's .btt in the BSA apply
   there. Reversible, one quad, no plugin change.

## Side finding: the Tamriel worldspace ITMs

Worth its own row some day, not for this crash. Nine plugins forward
Dragonborn's Tamriel record over USSEP's, and the winner reverts USSEP's MHDT
regeneration in 28 cells (flight and camera ceilings, mostly Castle Volkihar).
The record cannot be dropped from mihailatmoranremains.esp (it is the container
for the plugin's exterior cell groups), so the fix shape is a plugin-patch.py
kind that forwards one subrecord from a source plugin's copy of the same
record: `mihailatmoranremains.esp  forward-subrecord  0000003C MHDT from
unofficial skyrim special edition patch.esp`. USSEP's MHDT is 45,608 bytes like
the target's, so it is a same-size patch, no group resizing; the later-override
guard then keeps the row honest if the load order ever moves the last writer.
Low value; Eli's call.

## Sources

- Unofficial Skyrim Special Edition Patch Version History (shipped in the mod's
  Docs folder; also https://www.afkmods.com/Unofficial%20Skyrim%20Special%20Edition%20Patch%20Version%20History.html),
  bug #27167 on the world max-height data; tracker entry
  https://afktrack.afkmods.com/index.php?a=issues&i=27500.
- UESP, Skyrim Mod:Mod File Format/WRLD (MHDT, RNAM, TNAM, UNAM, OFST):
  https://en.uesp.net/wiki/Skyrim_Mod:Mod_File_Format/WRLD
- UESP, Skyrim Mod:Mod File Format/CELL (XCLC flags, MHDT, TVDT):
  https://en.uesp.net/wiki/Skyrim_Mod:Mod_File_Format/CELL
- STEP forum, "MHDT - Max Height Data" (zilav, TechAngel85, Arthmoor via GrantSP):
  https://stepmodifications.org/forum/topic/8358-mhdt-max-height-data/
- STEP forum, "What is Noise.dds?":
  https://stepmodifications.org/forum/topic/17152-what-is-noisedds/
- Crash fixes (Skyrim LE) docs, the TESObjectLAND alignment note, the only
  literature hit for TESObjectLAND in a terrain crash; LE's allocator, not SE's:
  https://www.nexusmods.com/skyrim/mods/72725?tab=docs
- Web search for the offset SkyrimSE.exe+2AD242 and for BGSQueuedTerrainUpgrade
  with TESObjectLAND on 1.6.1170 found no documented crash (2026-10-31).
