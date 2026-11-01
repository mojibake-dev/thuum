# c1's terrain-upgrade crash (2026-10-31)

Read by apocrypha for numidium. Three identical crashes on sky-c1 in the
containers gate, two in run 20261101-001625-b-npc-stream-voice and one in
20261101-002723-b-npc-caster: EXCEPTION_ACCESS_VIOLATION at
SkyrimSE.exe+02AD242, `mov rax, [rcx]` with rcx = 0, on a BSJobs::JobThread,
with BGSQueuedTerrainUpgrade, TESObjectLAND 0xA7B3, the textures
Textures\Terrain\Tamriel\Tamriel.4.28.-20.DDS and Textures\Terrain\Noise.dds,
cells 0x97B3 and 0xBBB1 (last writer USSEP) and worldspace 0x3C (last writer
mihailatmoranremains.esp) on the stack. Process uptime at the crash: 13.76,
13.88 and 13.71 s, so it is the first world load after launch each time, not
30 s into play (the run clock counts from launch).

core's first read, c1's GPU link, is withdrawn: correctable errors (RxErr,
BadTLP) show on both seats' x1 riser links at 5 and 8 GT/s, the RTX is clean,
and a 5 GT/s replay of the window (20261101-010719-c1-gen2-check) passed 5 of
5, weak evidence either way; c1's port is back at Eli's Gen3 setting since
01:30Z. This page gives the content read (nothing) and the code read (an
unchecked dereference in the engine's terrain-overlay sweep, hit when a land
quad has no geometry yet). Mechanism HYPOTHESIS, code read confirmed.

## The site

- CELL 0x97B3 is RiftWatchtowerExterior02, grid (30,-17); CELL 0xBBB1 is the
  unnamed Wilderness cell at (32,-15). LAND 0xA7B3 is (30,-17)'s land.
- Level-4 LOD quad Tamriel.4.28.-20 covers cells x 28..31, y -20..-17 and so
  holds (30,-17); (32,-15) is in the next quad east, Tamriel.4.32.-16.
- "Last writer" in a Crash Logger line is the plugin whose copy of the record
  wins the load order, nothing more.

## The code (1.6.1170, Address Library ids)

Read from the lab's Steamless-unpacked image (/rpool/sky/persist/game on core,
copied to lab/.cache/game/exe-1.6.1170/, sha256 80c1ea73...) with
docs/research/tools/disasm-chain.py. The seat's own SkyrimSE.exe is Steam-stub
packed (the .bind section is the stub; .text reads as entropy 8.0), so static
reads of it are noise; only .rdata, where the vtables and RTTI live, is plain.

The crash thread, bottom up, all on the job thread:

| frame | id | what it does |
| --- | --- | --- |
| +0CD0DBD, +0CF61DA, +0CF7E51, +0CF7888 | 68445, 69344, 69380, 69378 | BSJobs::JobThread loop running a queued job |
| +06D38E2 | 39102 | the terrain update job: takes the current worldspace (19816 on the global at +31874F8), its BGSTerrainManager (20469), and calls 31802 with a position |
| +050E7CD | 31802 | BGSTerrainManager update; near its end calls 31915 on the global task list at +315B6B0 (id 402263) |
| +051392E | 31915 | runs each queued terrain task (BGSQueuedTerrainUpgrade and kin: vtable slots 3, 1, 2, then the deleting destructor) and removes it; if any task applied, calls 13414 with the TES singleton (+31872C8, id 403450, RE::Offset::TES::Singleton) |
| +01A4E1A | 13414 | the sweep: for every loaded grid cell (the dimension is the int at +1FD6EB0, id 359676; cells via TES::gridCells at +0x78, GridCellArray::GetCell), takes the cell's land (18970, TESObjectCELL::cellLand) and, if its loadedData (+0x40) exists, calls 18789 on it |
| +02AD242 | 18789 | the crash function, below |

18789(TESObjectLAND* land), in words. Find the land's terrain node from its cell
coordinates (loadedData +0x49B8/+0x49BC through 13314, 20469, 31807 with the
position, level 0), take that node's LOD diffuse texture (31740(node, 0): the
RDI NiSourceTexture, Tamriel.4.28.-20.DDS) and the shared noise texture
(31749(): the RBP NiSourceTexture, Noise.dds). Then for each quad 0..3
(RSI, R14 = quad*8): mesh = loadedData->mesh[quad] (LoadedLandData +0, a
BSMultiBoundNode, the RAX object); skip if null or no node; then

```
+02AD22A  cmp  word ptr [rax+0x122], 0      ; mesh->children.size (NiTObjectArray at NiNode+0x110: data +8, size +0x12)
+02AD232  ja   +02AD238
+02AD234  xor  ecx, ecx                      ; no children: child = nullptr
+02AD236  jmp  +02AD242
+02AD238  mov  rax, [rax+0x118]              ; children.data
+02AD23F  mov  rcx, [rax]                    ; children[0]
+02AD242  mov  rax, [rcx]                    ; <- the crash: rcx == 0
+02AD245  call [rax+0x38]                    ; child->AsGeometry() (NiObject slot 7)
+02AD248  mov  rcx, [rax+0x128]              ; geometry->properties[1], the shader property
+02AD258  mov  rbx, [rcx+0x78]               ; BSShaderProperty::material
...       [rbx+0xF8]  <- LOD diffuse          ; BSLightingShaderMaterialLandscape::terrainOverlayTexture
          [rbx+0x100] <- noise                ; ::terrainNoiseTexture
          [rbx+0x108] <- quad offset/scale    ; ::landBlendParams, from the node's and the land's grid coords
```

So the sweep writes the terrain LOD block's diffuse and the noise texture into
every loaded land quad's landscape material (the loaded-land-to-LOD blend), and
it reads the quad node's first child without a null check, both on the
empty-array path (the compiler kept an explicit `ecx = 0` for it) and when
children[0] itself is null. The quad mesh exists, its geometry does not: the
land is mid-build. Every structure offset above is CommonLibSSE-NG's
(TESObjectLAND.h LoadedLandData, NiNode.h, NiTArray.h, NiObject.h,
BSGeometry.h, BSShaderProperty.h, BSLightingShaderMaterialLandscape.h, TES.h,
GridCellArray.h) and matches the register contents the logs resolved.

## Why a race and not content

- The failing quad differs between identical crashes: RSI = 0, 0, 2 across the
  three logs (R14 = 0, 0, 0x10). A land whose quad lacked geometry by
  construction would fail at the same quad every time.
- The land and its textures are vanilla and unopposed (below), and the cells'
  only non-vanilla bytes are USSEP's random high bits in XCLC.
- Timing: all three at 13.7 to 13.9 s of process uptime, the initial load,
  when every loaded cell's land is being built while terrain tasks complete and
  trigger the sweep on the job thread. Only c1 (the GTX 1050 seat) and only
  three runs out of the gate's set; c2 never.
- No SKSE plugin on the seats touches this path: the loaded list is
  AchievementsModsEnablerLoader, AltTabFix, AnimationMotionRevolution,
  AnimationQueueFix, BarterLimitFix, BugFixesSSE, ConsoleUtilSSE,
  CoreImpactFramework, CrashLogger, DbSkseFunctions, DeathDropOverhaul, Fuz Ro
  D'oh, ImprovedCameraSE, Inertia, IntuitiveDragonRideControl, MCMHelper,
  MpClientPlugin, NextGenDecapitations, OpenAnimationReplacer, PapyrusUtil,
  po3 BaseObjectSwapper, DualCastingFix, PapyrusExtender, SpellPerkItemDistributor, Tweaks,
  ScrambledBugs, skee64, SKSEMenuFramework, SkyrimPlatform,
  SpellChargeTimeProgression, SSEDisplayTweaks, TMS_AIPathingFreezeFix,
  TrueDirectionalMovement, TrueHUD. No Engine Fixes, so none of its null-pointer
  patches are in play either.

Open (HYPOTHESIS): which side builds the quad geometry late. The land's
loadedData and its four mesh nodes exist when the sweep arrives, the BSTriShape
children do not. Finding the attach site (writes to LoadedLandData::mesh[] and
the children array; REA or `just ghidra-query SkyrimSE-1.6.1170.0.exe xrefs`)
would turn the hypothesis into a confirmed window. Not needed to act.

## The content read (done first, kept for the record)

**WRLD 0x3C (Tamriel).** USSEP (slot 1) carries the record with regenerated
max-height data (its Version History, bug #27167: "World max height data has
been updated to properly reflect all changes made by the original 3 official
DLCs"). Nine deployed layer plugins also carry the record, every one of them
Dragonborn.esm's copy unchanged (the CK writes the worldspace record when a
plugin places anything in Tamriel):

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
MHDT is the per-cell-quad height ceiling (UESP's WRLD page: an 8-byte min/max
grid header then "4 byte structs, containing 4x 1 Byte Integers, 1 struct per
cell, listing the Max Heights per quad in each cell"; the CELL page calls the
per-cell form "height ceilings used by the dragon flight system"; on the STEP
thread zilav calls the worldspace form "Camera Data of the whole worldspace").
Neither source puts it in the terrain-load path, and the code above never
touches it.

The two copies differ in 92 of 45,600 payload bytes. The cell order, which UESP
leaves open, was fitted against the land maximum of all 11,186 Tamriel LAND
records in Skyrim.esm: cells run x-outer, y-inner (offset =
((x - minX) * 95 + (y - minY)) * 4 for Tamriel's 120 x 95 grid), r = 0.977, the
other orders near 0. On that layout USSEP's regeneration touches 28 cells: a
block of 18 around Castle Volkihar (x -45..-40, y 35..38, Dragonborn's bytes
there are the void value 0x0a) and (-20,10), (-18,-27), (-18,8), (-7,24),
(-6,24), (-3,-18), (-3,-17), (7,8), (7,9), (28,-21). Neither crash cell and
neither crash quad is among them; the crash cells' bytes are identical in both.

mihailatmoranremains.esp itself places 20 references (11 statics) in 11
Tamriel cells: (16..19, 23..27), (25,20), (-3,24), (-3,25), (36,4). Nothing
within ten cells of the site.

**CELL 0x97B3 and 0xBBB1.** Overridden by USSEP alone. Against Skyrim.esm each
differs in one field, the third dword of XCLC: 0x0053fd00 becomes 0xaa250f00.
The four defined bits (Force Hide Land Quad 1..4, the low nibble) are clear in
both; UESP's CELL page notes the high bits "look random". TVDT, MHDT, XCLW,
XCLR, LTMP and XLCN are byte-equal. USSEP carries the cells for reference work:
two placed references and a navmesh in (30,-17), two references in (32,-15); no
LAND record anywhere in the 26..35 x -21..-12 window.

**LAND 0xA7B3 and its textures.** Skyrim.esm's record only; no override in
Dawnguard.esm, Dragonborn.esm or any layer plugin (Update.esm and
HearthFires.esm are not in lab/.cache and were not read). Its six landscape
textures (LTEX 057DC7, 057DCF, 057DD1, 058606, 06DE8E, 0A7619) and their five
texture sets (TXST 057DC6, 057DCE, 057DD0, 058605, 000AE1) are overridden by
nothing in the layer.

**Other layer placements near the site.** mihailcrowsandravens.esp puts two
raven objects in (27,-18) and four crow statics in (28,-14);
mihailringneckedpheasant.esp a pheasant actor in each of (29,-19), (32,-14) and
(35,-19). None touch (30,-17) or (32,-15), none touch land.

**Files.** No layer mod ships the quad's terrain texture or mesh
(textures\terrain\tamriel\tamriel.4.28.-20.dds, meshes\terrain\tamriel\tamriel.4.28.-20.btr);
USSEP's BSA ships one Tamriel terrain mesh, for quad 4.-20.8. No layer mod
ships a noise.dds; Noise.dds is the terrain LOD's noise texture (STEP, "What is
Noise.dds?"), so both texture names on the stack are the block's own textures,
which the code above confirms (RDI and RBP are the two the sweep writes).
Simply Bigger Trees ships tree-LOD billboards for both quads
(meshes\terrain\tamriel\trees\tamriel.4.28.-20.btt and tamriel.4.32.-16.btt) and
the Tamriel tree atlas; they were the only layer files in those quads and the
earlier A/B candidate. The code path does not read them, so that A/B is no
longer indicated.

## Verdict and options

An engine null dereference in the terrain-overlay sweep (18789 via 13414),
reached from the terrain update job when a queued terrain task completes while
a loaded land's quad geometry is not attached yet. Not content, not the GPU
link. It is a load-time flake with a stable signature: SkyrimSE.exe+02AD242
with BGSQueuedTerrainUpgrade and a TESObjectLAND on the stack, inside the
first ~20 s of process uptime. docs/LOG.md 19:08 PDT (0450a3d5) records it.

numidium's calls on the two levers (2026-11-01):

1. **Retry is already there; the name is what was owed.** lab-api reruns an
   E_RUN_GAME-class fault as a lab fault (two of the three crash runs reran
   green in-set; the third read green anyway). What it adds: on a crash fault
   it reads the newest Crash Logger file and notes "the known terrain-overlay
   race" when the signature matches, so a reader never re-diagnoses it. Single
   probe runs (lab-run) get no retry and are rerun by hand.
2. **No lab-only patch.** The seats run the players' game; a patched engine on
   the seats would stop measuring it. If the race is fixed, it is fixed for
   everyone, as a layer plugin every client loads. Eli's call; the shape is
   below.

Shape of a layer fix, if Eli wants one. No shipped mod covers this site: LOD
Refresh Bug Fix (Nexus 187070) resets the LOD quadtree after teleports and
worldspace changes, and Bug Fixes SSE, Scrambled Bugs, po3's Tweaks and Engine
Fixes do not touch 18789. Two shapes, in order of laziness:

- **A, upstream it.** Scrambled Bugs and po3's Tweaks take engine-fix
  contributions on GitHub; the lab already ships both. File the site with the
  disassembly above (the function by Address Library id, the two unchecked
  paths, the three logs). If taken, the layer gets the fix by updating a mod it
  already carries, and so does everyone else. Slow and not in our hands.
- **B, a thuum engine-fixes DLL.** One CommonLibSSE-NG SKSE plugin (the
  submodule is already in the repo; sky-build 720 is the Windows build box) that
  pins the runtime to 1.6.1170 (ADR-022) and installs one detour: at
  REL::ID(18789) + 0x14A, the `cmp word ptr [rax+0x122], 0; ja` pair (10 bytes),
  jump to a trampoline that reads children.size and children[0] itself and
  routes both the empty-array case and a null children[0] to the next-quad path
  at + 0x340 (`inc esi`), else continues at + 0x162 as before. About forty
  lines with CommonLib's trampoline and Xbyak. The hook sits before the
  compare, so the original `jmp + 0x162` from the empty-array branch is never
  reached with a patched target under it. One DLL in the layer, ESP-less, keyed
  by id with this page as its spec; later lab-found engine fixes go in the same
  DLL the same way. The fork's MpClientPlugin could host the detour instead
  (every client loads it already), but that couples an engine fix to the skymp
  client's build and upstream merges; the separate DLL is the cleaner "we do
  it this way".

Either way the layer test is the signature: a run set on c1 with no
+02AD242 fault across the containers gate.

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

- The three Crash Logger files (CrashLoggerSSE v1-24-0-0):
  https://thuum.gaussing.tv/results/20261101-001625-b-npc-stream-voice/c1-crash-2026-10-31-17-11-32.log,
  .../c1-crash-2026-10-31-17-17-11.log,
  https://thuum.gaussing.tv/results/20261101-002723-b-npc-caster/c1-crash-2026-10-31-17-28-09.log
- Address Library for SKSE Plugins (meh321), versionlib-1-6-1170-0.bin, parsed
  as CommonLibSSE-NG's REL::IDDatabase does (lab/addr.py documents the format):
  https://www.nexusmods.com/skyrimspecialedition/mods/32444
- CommonLibSSE-NG headers for every structure offset named above:
  https://github.com/CharmedBaryon/CommonLibSSE-NG (pinned submodule, b93280e8)
- Steamless (atom0s), the unpacker behind SkyrimSE-1.6.1170.0.exe.unpacked.exe:
  https://github.com/atom0s/Steamless
- Crash Logger SSE AE VR: https://www.nexusmods.com/skyrimspecialedition/mods/59818
- Unofficial Skyrim Special Edition Patch Version History (shipped in the mod's
  Docs folder; also https://www.afkmods.com/Unofficial%20Skyrim%20Special%20Edition%20Patch%20Version%20History.html),
  bug #27167; tracker https://afktrack.afkmods.com/index.php?a=issues&i=27500
- UESP, Skyrim Mod:Mod File Format/WRLD: https://en.uesp.net/wiki/Skyrim_Mod:Mod_File_Format/WRLD
- UESP, Skyrim Mod:Mod File Format/CELL: https://en.uesp.net/wiki/Skyrim_Mod:Mod_File_Format/CELL
- STEP forum, "MHDT - Max Height Data": https://stepmodifications.org/forum/topic/8358-mhdt-max-height-data/
- STEP forum, "What is Noise.dds?": https://stepmodifications.org/forum/topic/17152-what-is-noisedds/
- Web search for the offset SkyrimSE.exe+2AD242 and for BGSQueuedTerrainUpgrade
  with TESObjectLAND on 1.6.1170 found no documented crash (2026-10-31).
