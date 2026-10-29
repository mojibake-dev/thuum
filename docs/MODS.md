# MODS: the mods thuum has to carry

This is the start of M7's mod compatibility matrix (docs/PLAN.md). It begins
with the three mods Eli named as a stretch goal on 2026-10-03. For each mod:
what it is made of, which thuum milestone and rung it leans on, and what is
missing today.

## Provenance

The analysis is apocrypha's (a peer agent session), 2026-10-04. Fenestrate,
where the mods are installed, was off, so:

- "Installed" means the archive was in Fenestrate's Vortex downloads in a
  2026-07-30 inventory. Whether it was enabled is unverified.
- Each archive was matched to its Nexus file and its md5 checked through
  Nexus's md5 search.
- Every plugin header and every .pex was parsed (293 scripts).
- Natives were classified against SKSE 2.3.1's Papyrus sources, then joined
  to docs/NATIVES.md by Type.Function.
- The deep rotfern write-up is ~/Code/mojibake/chim/docs/modding/rotfern-custom-race.md.

Nexus files, for re-pulling (`/v1/games/skyrimspecialedition/mods/{mod}/files/{file}`):

| mod | Nexus mod | file | version | md5 |
| --- | --- | --- | --- | --- |
| Apocalypse - Magic of Skyrim | 1090 | 758998 | 10.2.3 (the page is at 10.3.0) | 26fa3eb013175c09d12b5b52d5df09ac |
| Headshot Kills - CIF | 148579 | 622326 | 1.2 | bd394ef49f6830d0d48e88c2cb0cb19c |
| Core Impact Framework | 146873 | 721776 | 1.2.8, Fenestrate's (1.6.1170 only) | 88ffc290d14e283f576bda68b0b246bd |
| Core Impact Framework | 146873 | 801478 | 2.0.7, the lab's (1.7.104) | 280692a00e60890fc8a16826cceb56f1 |
| RaceCompatibility for SSE, All-In-One | 2853 | 381971 | 2.16 | 9a8fc2437ac9339ab42647f096f61c95 |
| RaceMenu | 19080 | 743640 | 0.4.20.0 | 92f8e9de4b2a1ef8a442752dab460ada |
| Goam's Elven Ears Proper RaceMenu Integration | 122236 | 696384 | 1.1.0 | 43f58837afbc2e7cca970a76e7ce3e81 |
| Racemenu Misc Slider | 66544 | 277217 | 0.1.0 | aba9b887926b1629f51f1d0c5b0d4b45 |
| AI Pathing Freeze Fix | 190049 | 801783 | 1.1, the lab's (1.6.1170 only) | 54804a9e4e9117450921ea78332dbc5c |

Third-party mods never enter a repo or a lab image except through
rpool/sky/persist, like the master files (Nexus terms; docs/PLAN.md,
distribution track).

The lab's mod layer (2026-10-06) is built by `just persist-mods`
(lab/tools/persist-mods.sh) from two sources: RaceCompatibility 2.16, the
archive above fetched with the Keychain's Nexus key and checked against its
md5, laid out by the installer's manual path for a game without USSEP and
without vampire or werewolf overhauls ("20 Dawnguard", "20 Dawnguard
Script", "20 Dawnguard Werewolf Script"; the USSEP override ESP stays out);
and rotfern's standalone fork from ~/Code/mods/rotfern-skyrim, without its
backups. It lands in persist's mods/ (one folder per mod in Data layout,
SHA256SUMS, plugins.txt) and puts the two plugins in each version's esm
directory, where the server loads them at 07 and 08 after the full-slot
Creation Club plugins (docs/LAB.md). `just client-mods <vmid>` installs the
layer into every game folder of a clone and enables the plugins in the lab
user's plugins.txt. Both rotfern races carry the Playable flag (RACE DATA
flags 0x50a08943 and 0x54a08943; lab/esm.py), so the server's character
creation check offers them.

RaceMenu 0.4.20.0 joins the layer for 1.6.1170 only (ADR-025; it does not
load on 1.7.104, docs/verbs/racemenu-sync.md): Nexus mod 19080 file 743640,
checked against the SHA-256 that Nexus's own VirusTotal link names
(e0f5e923...), unpacked with 7zz, without the ModderResource header. Its
folder is named racemenu-0.4.20.0@1.6.1170: a mod folder named
<mod>@<version> installs only into that version's game folder on a clone
(add-mods.ps1), and its plugins go only into that version's esm directory.
RaceMenu.esp and RaceMenuPlugin.esp are full slots (TES4 flags 0x0), loaded
at 09 and 0A after rotfern, so the two versions' servers load different
lists: server-settings.json for 1.6.1170, server-settings-1.7.104.json
without them, picked per run by lab-api (SERVER_SETTINGS, like ESM_DIR).
plugins.txt is shared by both game folders and lists every plugin once; a
game skips a listed plugin its Data folder lacks.

Apocalypse 10.2.3 joins the layer for ADR-029 (its first verb
docs/verbs/ghostwalk.md): Nexus mod 1090 file 758998, checked against the
md5 above, its plugin and its two BSAs (the archive holds nothing else) in
both game versions. The plugin is full (masters Skyrim, Update,
Dragonborn) and loads after LostGrimoire.esp, at 0C on 1.6.1170 and 0A on
1.7.104 (without RaceMenu's two), before CBBE's client-only pair, so no
plugin before it moves. Its name holds spaces, which persist-mods' place
and deploy-srv's load-order check quote.

AI Pathing Freeze Fix 1.1 joins the layer for the load freeze (Eli,
2026-10-17; its section below): Nexus mod 190049 file 801783, checked
against the md5 above, which Nexus's md5 search returns for that file alone
(the file's VirusTotal link names the same archive's SHA-256, 4984aca3...).
The archive holds one file, SKSE\Plugins\TMS_AIPathingFreezeFix.dll, laid
out as it is in a folder named aipathingfreezefix-1.1@1.6.1170, so only the
1.6.1170 game folder takes it. No plugin file: no load order, no esm
directory, nothing on the server.

## Apocalypse - Magic of Skyrim

What it is:

- **Plugin.** One plain ESP (not ESL-flagged): masters Skyrim.esm,
  Update.esm and Dragonborn.esm; 3,945 records (556 MGEF, 373 SPEL, 149 PROJ,
  57 PERK, 25 QUST).
- **Archives.** Two BSAs, no DLL.
- **Scripts.** 206: 162 ActiveMagicEffect, 16 ObjectReference, 14
  ReferenceAlias, 9 Quest, 2 Perk, 2 Actor, and 1 SkyUI MCM menu (optional,
  client-side).
- **Vanilla overrides.** Nine scripts replace vanilla ones: Companions and
  Blades sparring, the trainers, DGIntimidate, MS11Calixto.
- **SKSE.** Effectively none: a single Actor.QueueNiNodeUpdate, a visual
  refresh. No po3, PapyrusUtil or JContainers.

What it needs from thuum:

- **Records.** These work through the server's load order today (definition
  of done item 6).
- **Spells.** M2: cast intent R1, resolution R0. The 162 effect scripts run
  where the server's magic effect system runs them, which does not exist yet.
- **Natives.** 165 distinct, about 2,092 call sites.

  | status in docs/NATIVES.md | distinct | call sites |
  | --- | --- | --- |
  | implemented | 33 | 550 |
  | delegated | 20 | 279 |
  | gamemode | 3 | 84 |
  | stub | 3 | 104 |
  | missing | 102 | 1,028 |
  | not in the ledger | 4 | 47 |

  - The heaviest stub is ObjectReference.PlaceAtMe: 81 calls in 43 scripts.
  - The most-called missing ones:
    - GlobalVariable.GetValue 110 and SetValue 59;
    - ReferenceAlias.GetReference 78;
    - ActiveMagicEffect.RegisterForSingleUpdate 59 and RegisterForUpdate 24;
    - Actor.GetActorValue 56;
    - ActiveMagicEffect.Dispel 46;
    - Spell.Cast 44 and RemoteCast 19;
    - ImageSpaceModifier.Apply 42.
- **Globals.** Apocalypse is the first concrete verb that needs server-owned
  globals, which ADR-021 decision 4 deferred "until a verb needs them". The
  GLOB reader and its persistence home (rule 6) come with it.
- **Ledger gap.** Skyrim Platform's FunctionsDump.txt has no Math type, so
  Math.Sin, Cos, Abs and Tan never reach docs/NATIVES.md. lab/ledger.py has to
  take Math from the Papyrus sources.

### Four spells, read for M2 (2026-10-10)

Eli asked about Mark/Recall, Blink and the wall spell. Read from the 10.2.3
archive (md5 above; the ESP is not localized) and its 206 .pex scripts, by
a subagent of the main session. 10.2.3 has no Mark/Recall and no Blink: no
spell, effect or book carries either name, nor do the Nexus changelogs from
9.16 to 10.3.0. Unused leftovers of an old Mark and Recall remain (KYWD
0300E1CD, MESG 0304F4CE and 0304F4CF, "Mark created.", "Recalled to mark.").

- **Raise Wall**, SPEL 0300CC14 (concentration, self). Its effect (MGEF
  0309852E, Script archetype) applies only when the caster's game finds
  room ahead (condition GetVATSFrontAreaFree >= 300, an engine geometry
  query); script WB_FabricateWall_Script places the wall (MSTT 03098529,
  1470 x 102 x 262 units, a real collision body on the AnimStatic layer: a
  MOPP over a compressed mesh, BSXFlags Havok and Articulated, no navmesh-cut
  data in the mesh or the record, so actors are stopped by collision, not
  re-pathed; corrected 2026-10-28 from the mesh's blocks) 192 units ahead,
  starting 288 below the ground,
  raises it with TranslateToRef at speed 512, sets off EXPL 0300C145 there
  (no damage, knock-down), and on the stream's end fades it out and deletes
  it after 5 s. Nothing persists between casts. Missing natives:
  GetAngleZ, Math.Sin, Math.Cos, TranslateTo (TranslateToRef reaches
  GetAngleX and GetAngleY too).
- **Milestones**, SPEL 030A59D5, the nearest thing to Mark/Recall: five
  anchors (ACTI 030AD577, REFR 030AE5C6 to 030AE5CA, parked in CELL
  030ABFCD) that a player moves into the world and teleports between
  (Player.MoveTo, across cells), held by QUST 030AE5CB's aliases and five
  globals (GLOB 030AE5D2 to 030AE5D6). Placing goes through an explosion
  (EXPL 030AEB3C) that drops a spawner activator whose OnLoad shows a menu;
  using is the anchor's OnActivate menu. One set for the whole world.
  Missing natives: GlobalVariable.GetValue and SetValue,
  ReferenceAlias.GetReference, GetAngleZ.
- **Ghostwalk**, SPEL 0300AAE8: 10 s of invisibility (Invisibility
  archetype), then SetPosition back to where it was cast (same cell).
  Missing: GetCurrentLocation, Location.HasCommonParent,
  ImageSpaceModifier.Apply, CreateDetectionEvent, RegisterForSingleUpdate,
  and Actor.QueueNiNodeUpdate (SKSE, a visual refresh).
- **No Blink.** The nearest: Shadowbond (SPEL 03031C4D, swaps caster and
  target through MoveTo), Cyclonic Rift (SPEL 0302D068, two persistent
  portals moved out of the same holding cell, a global choosing which) and
  Rift Bolt (SPEL 030253C2, slides the target 150 units back with
  TranslateTo). Eli (2026-10-10): the spell he means is "a projectile
  teleport", cast like a projectile. No player spell in 10.2.3 moves its
  caster to where its cast lands: every script that moves an actor was
  listed (MoveTo, SetPosition, TranslateTo), and none does that; of the
  Alteration line named Teleport only tier 5 (Milestones) is left; and the
  mod's Nexus changelogs mention teleporting once, Rift Bolt's 9.25 change
  ("now rapidly moves the target instead of teleporting them"). The aimed
  spell that teleports is Cyclonic Rift: each cast places one of its two
  portals where it lands, and anyone within 10 feet of one is moved to the
  other.

What the fork does with them today (code read, not lab-tested): PlaceAtMe
of an explosion only reaches the clients (PapyrusObjectReference.cpp:380),
so explosion-placed spawners never exist on the server; MoveTo on a
non-actor sets a new position that nearby clients may not see until it
changes grid cell (MpObjectReference.cpp:536); Message.Show takes the
client's button unvalidated (PapyrusMessage.cpp:3); and no effect script
runs on the server yet (docs/verbs/magic-effects.md leaves scripted effects
for a later slice).

## Lost Grimoire - Teleportation (found 2026-10-10)

Not one of the three stretch mods: the teleport Eli means ("a projectile
teleport ... it casts like one") turned out to be Lost Grimoire's, not
Apocalypse's. apocrypha read it, read-only (the 07-22 copy of Eli's
rotfern save on the Mac, Fenestrate's archive inventory, and the mods'
archives pulled from Nexus at Fenestrate's versions):

- **In the save.** Of 35 magic favorites, "Teleportation"
  (LostGrimoire.esp 0A86DF, GRIM_SPELL_ALT50_Teleportation) on hotkey 7.
  The other teleports there: Apocalypse's Ghostwalk (self, back to its cast
  point), Mysticism's Recall (MysticismMagic.esp 45536D, self, to a mark),
  and Tel Solanum.esp 03746F (Eli's own recall spell).
- **The mod.** Lost Grimoire SSE, Nexus 4455. Fenestrate has v1.6 (file
  746543, "Lost Grimoire-4455-1-6-1777325819.zip", md5
  9ff6e8c0ba4be4689406305ac509ee89; Nexus is at 1.8). LostGrimoire.esp is
  a full plugin (masters Skyrim, Update, Dawnguard, HearthFires,
  Dragonborn) with two BSAs.
- **The spell.** SPEL 0A86DF: Alteration, master tier, cost 135,
  fire-and-forget, delivered at a target location, SPIT range 160 (its
  unit unchecked), no projectile, no conditions. Its effect, MGEF 0A86DE,
  is archetype 43 (Spawn Scripted Ref) with explosion EXPL 0A86DD, whose
  placed object is ACTI 0A86DC (GRIM_ACT_ALT_TeleportationMarker).
- **The move.** The marker's script (GRIM_ALT_TeleportationMarker), on
  load: the player's three angles read, PlayerRef.SetGhost(true), an image
  space modifier and a vanish effect, Utility.Wait(0.12),
  PlayerRef.MoveTo(self), SetAngle back, SetGhost(false), an appear effect
  and a sound, then the marker disables and deletes itself. So the engine
  places one marker where the cast lands, and the mod's script moves the
  player onto it, all in the caster's game.
- **A gate the spell does not use.** QUST 2725D0 (GRIM_TeleportManager)
  answers GetCanTeleport() false during some quests and places (the
  brawl, Sovngarde, Cidhna Mine and others); neither the spell nor its
  effect references it.

What it needs from thuum (the shape PLAN gives a cast teleport): the
caster's own game does the teleport, engine and script, nothing
reimplemented; the server knows the spell teleports (records cannot say
so: other Spawn Scripted Ref spells place runes and anchors) and, when it
records the cast (spell-cast), allows that caster one jump within the
spell's reach, as COC's permitted jump does (wire-rules movement), so the
movement rule takes the arrival instead of sending the player back. A
recall to a mark (Mysticism's, Tel Solanum's) has no reach to bound: the
server would record where its Mark was cast and allow a jump to that point
only. Eli rolled Lost Grimoire in (2026-10-10, "i guess we're rolling in
lostgrimoire as well"): v1.6, Fenestrate's, so his own install matches the
server's load order; a full plugin on the server and every client
(docs/PLAN.md M2). Mysticism is not in.

## Headshot Kills - CIF

What it is:

- **The mod itself.** An ESL (master Skyrim.esm) with one spell and its
  effect, one script and one Core Impact Framework config. On a headshot it
  applies "hInstantDeathSpell" to the victim; the spell's effect script calls
  akTarget.Kill() with no killer. It is not a damage multiplier.
- **When it fires.** The CIF rule wants all of:
  - a bow, a crossbow, or the Ice Spike projectile;
  - no light or heavy helmet in the struck slot;
  - an unblocked regular or power attack;
  - biped slot 30 or 31 (head or hair);
  - the attacker holding Overdraw rank 4 (Skyrim.esm 0x07934D, Archery 60),
    so this file is the Archery-gated variant;
  - a victim of one of the ten playable base races or ElderRace. Custom races
    (rotfern), vampire races and creatures are not covered as written.
- **Core Impact Framework 1.2.8.** An SKSE plugin, built on CommonLibSSE-NG.
  It hooks arrow and missile collision (Xbyak trampolines) and the engine's
  hit processing. The collision side stores the struck skeleton node, and the
  hooked ProcessHit applies the matching rule. All of this runs in the client
  that simulates the projectile.

What it needs from thuum:

- **Hit location on the wire.** A hit is R1 (M2's hit registration). The
  server has to learn the struck node or biped slot from the shooter's client
  and treat it as untrusted (hard rule 5): validate it against the projectile
  and the target's head, or record it as R2 in the verb doc.
- **The kill is R0.** It is the server's decision on the server's health
  record; a client-side Kill() on an actor it does not own is suppressed.
- **Natives.** Actor.Kill, the one native involved, is missing.
- **Runtime: CIF 2.0.7 on the lab.** apocrypha read SKSE 2.3.1's
  PluginManager.cpp and both DLLs (2026-10-04, static analysis only).
  - SKSE's gate does not stop either version. Neither sets the 1.7.99+
    Address Library version 5 flag, but both were built after 2025-05-26,
    and SKSE only refuses older DLLs for missing it.
  - The real gate is CIF's own Address Library loader.
    - The lab's versionlib-1-7-104-0.bin is format 5.
    - CIF 1.2.8's vendored CommonLibSSE-NG accepts a single format and stops
      with "Unsupported address library format".
    - CIF 2.0.7 handles formats 1, 2 and 5.
  - So the lab uses CIF 2.0.7 and Fenestrate's 1.2.8 stays on 1.6.1170.
  - Headshot Kills should work on 2.0.7 unchanged: it still recognizes the
    1.x key BipedSlot, and the mod has a single Conditions entry, so the
    AND-to-OR change in 2.x does not touch it.
  - The empirical check is one lab boot: skse64.log, and CIF's own log at
    iVerboseMode=1 for JSON warnings.

## Rotfern (Eli's race)

What it is:

- **Two copies of the plugin.**
  - The live plugin (Fenestrate) is a plain ESP with 15 masters, including
    RSkyrimChildren, USSEP, ApachiiHair and RaceCompatibility, and must load
    after RSChildren.esp.
  - The standalone fork (~/Code/mods/rotfern-skyrim/rotfern.esp) has 2 masters
    (Skyrim.esm, RaceCompatibility.esm) and 64 records:
    - 2 RACE (rotfern, rotfernRaceVampire), 12 HDPT, 10 TXST and 3 NPC_;
    - its own child head and body meshes, skeletons, ears, hair, and FaceGen.

    Its README says it is valid byte for byte but not yet loaded in game.
- **The look is vanilla appearance data:** head parts of vanilla types, RACE
  tint masks and morph presets, NPC_ face and tint fields. No SKSE plugin is
  needed at the plugin level.
- **RaceMenu around it.**
  - RaceMenu's own data (sculpt, overlays, node transforms, extra sliders)
    lives in the SKSE co-save, not in vanilla fields.
  - Goam's ears add type-104 head parts but register for the vanilla races
    only.
  - The Misc Slider's body morphs are inert on rotfern's child body.
  - Whether Eli's own character carries RaceMenu co-save data is open. The
    evidence leans vanilla: hair and ears were picked as head parts.
- **RaceCompatibility 2.16**: ESM plus override ESP. Since 2026-10-28 the served
  scripts are the "21 Dawnguard USKP" set its readme prescribes with USSEP
  (apocrypha/layer-vampire-pairing, Eli's D57 A); until then the plain "20
  Dawnguard" set was laid, 537 disassembled lines apart in the progression,
  cure and feeding (PlayerVampireQuestScript sha256 4b5979cc... before,
  08c0f8b8... now; apocrypha, docs/research/vampirism-under-the-server.md).
  The override ESP stays out: the ESM loads after USSEP here and its two quest
  overrides already win. Its scripts use vanilla natives only, among them:
  - Actor.SetRace, Game.GetFormFromFile and Actor.SendVampirismStateChanged,
    all missing;
  - Actor.AddSpell and RemoveSpell, delegated.

  Vampirism maps PlayableRaceList[i] to PlayableVampireList[i]. Rotfern's
  pair does not sit at one index (rotfern.esp F483303D, the same read):
  rotfern at [14] of 15, rotfernRaceVampire at [11] of 12, so a turn sets no
  race and a cure from rotfernRaceVampire gives ImperialRaceChild. The fix is
  the ten vanilla pairs plus rotfern's at [10] in both lists (memo D57, Eli's
  call). The SKSE variant (Nexus 122592) breaks vampire
  progression with this ESM and is not to be used.
- **Overrides that reach everyone.** Rotfern overrides two vanilla records
  that carry vanilla scripts: Keening and its enchantment, and the NPC Kharjo.
  On a shared load order those overrides apply to every player.

What it needs from thuum:

- **The cheapest of the three.** The standalone plugin and RaceCompatibility
  go in the server's load order and every client's. Character creation
  already accepts a Playable race from the load order
  (docs/verbs/character-creation.md). SkyMP's appearance sync carries head
  part ids, tints, face options and presets, which is everything rotfern's
  look uses; a head part picked through RaceMenu is still a head-part form id.
- **First test.** A scenario where c1 creates a rotfern character in the race
  menu and c2 sees it. It needs:
  - the plugins and assets on the clones through rpool/sky/persist;
  - the RACE's Playable flag, read with lab/esm.py.
- **First load in a game (2026-10-06, sky-c1, 1.7.104):** the race menu
  lists Rotfern, and selecting it killed the game while the preview was
  being built: an access violation in SkyrimSE.exe at RVA 0x96b1b7, a read
  at 0x8C through a null (ProcDump mini dump, probe 20261006-052250; the
  preview still showed the previous race with a loading cursor). The likely
  cause is in the plugin: an audit of every path rotfern.esp names against
  the fork's files and the vanilla archives found three that still point at
  RS Children's `ranaline` folder, which the standalone fork dropped: the
  RACE's male and female skeletons (ANAM, `actors\character\ranaline\character
  assets\skeletonkids.nif` and `skeleton_female_kids.nif`) and one tint
  texture (`actors\character\ranaline\child\maleliner.dds`). The fork ships
  the same files under `actors\character\rotfern\`. The proper fix is to
  repoint those three paths in the plugin (Eli's mod; never edited here).
  Until then `just persist-mods` places the fork's own files at the old
  paths, a lab-only stopgap, which is also the test of this cause.
- **Rotfern is listed twice in the race menu:** rotfernRaceVampire carries
  the Playable flag too (RACE DATA flags 0x54a08943), which vanilla vampire
  races do not; RaceCompatibility maps a race to its vampire twin through its
  own lists, so the vampire race needs no flag of its own.
- **apocrypha's diff of the standalone against the composite (2026-10-06;
  the 15-master copy rotfern.esp.pre-p3.bak stands in for fenestrate, which
  is off; RaceMenu's behaviour from its public source, expired6978
  SKSE64Plugins skee64).** Broken by the derivation itself, for Eli and
  chim: (1) both races' ANAM skeletons and (2) one TINT layer point at RS
  Children's `ranaline` folder (the lab's stopgap above); (3) the vampire
  pairing: RaceCompatibility's PlayerVampireQuestScript pairs a race with
  its vampire by index in PlayableRaceList and PlayableVampireList; the
  derivation stripped RS Children's races unevenly, leaving rotfern at
  [14] and rotfernRaceVampire at [11], so turning sets no race and curing
  gives ImperialRaceChild; the fix is RaceCompatibility's 10 vanilla pairs
  plus the rotfern pair at [10], applied at build since 2026-10-28 by the
  flst-set rows of lab/layer/plugin-patches.tsv (Eli's D57 A); (4) every complexion (FTSM, FTSF, DFTM,
  DFTF) now names one face texture set where the composite had six. Dead
  weight: an orphan cm01.nif, FaceGen for Kharjo and Teldryn where the
  engine never looks, stray overrides of NPC_ Kharjo and Keening (WEAP,
  ENCH). The chargen data is otherwise identical (morph availability, race
  presets, 63 tint layers and their presets, hair colours); the "missing
  options" are other mods' parts by design (RS Children's child hairs and
  brows, Apachii, Goam's ears, the eye packs) and everything RaceMenu adds.
- **The sculpt is RaceMenu's, per character, in the SKSE co-save,** not
  FaceGen (the player's head is built at runtime; chim's "FaceGen sculpt
  merge" concerns rotfernNPC). RaceMenu's Save Preset writes it as a .jslot
  (JSON; morphs.sculpt, one block per head part, keyed by the part's
  chargen .tri path, deltas over sculptDivisor 10000). Eli's are keyed to
  RS Children's `ranaline` paths, so a fenestrate preset would not attach
  to the standalone's re-pathed head parts until the hosts (and the head
  part form identifiers) are rewritten. apocrypha's recommendation for
  rotfern: bake the sculpt into the race's head meshes (geometry and the
  FOD base morph data), which needs no RaceMenu and works on 1.7.104; every
  rotfern then starts from that face. Eli's choice for players in general
  (2026-10-06) is RaceMenu sync (docs/PLAN.md, Stretch); the two do not
  conflict.
- **RaceMenu on the lab's 1.6.1170 set needs:** SKSE 2.2.6 with its base
  Data\Scripts .pex (RaceMenu's scripts call SKSE natives), RaceMenu.esp,
  RaceMenuPlugin.esp (optional sliders), RaceMenu.bsa, skee64.dll and
  skee64.ini, launched through skse64_loader; no Address Library (skee64
  pins 1.6.1170) and no SkyUI (RaceMenu ships its own UI).
- **Later.** Vampirism (M7) needs the three missing RaceCompatibility natives.
- **Not carried.** RaceMenu co-save data (sculpt, overlays) is outside SkyMP's
  appearance model.
- **Fenestrate's own state** (core read its disk read-only from a snapshot,
  2026-10-04; the VM stayed off):
  - Steam updated the game to 1.7.104 on 2026-09-02 (auto-update on).
  - RaceMenu 0.4.20 last loaded correctly on 2026-07-22, under 1.6.1170 with
    SKSE 2.2.6.
  - The game has not been launched since the update. Its only SKSE runtime
    is 2.2.6's, for 1.6.1170, so on 1.7.104 SKSE, and RaceMenu with it,
    cannot load. That last point is inferred, not observed.
- **RaceMenu sync** is what Eli wants (2026-10-04): friends see each other's
  RaceMenu looks.
  - It would carry the sculpt, overlays, body morphs and node scales, which
    live in RaceMenu's co-save and which SkyMP never sends.
  - It is a verb of its own: capture RaceMenu's data on the owner's client,
    carry it through the server (R2, bounded), and apply it on every client
    through RaceMenu's own functions.
  - Every client must load RaceMenu, so it is built on the lab's 1.6.1170
    client set (ADR-022).
- **RaceMenu loads only on 1.6.1170.** skee64.dll 0.4.20.0 lists only
  1.6.1170 and declares no Address Library independence, so SKSE refuses it
  on 1.7.104. Nexus has no 1.7.x RaceMenu yet: the newest build is for
  1.6.1170 (Steam) and 1.6.1179 (GOG).
  - Eli chose to support both versions (ADR-022, 2026-10-04). The lab's
    clones carry a 1.6.1170 folder beside Steam's, where RaceMenu will be
    installed for its verb.
  - Rotfern's own look does not need RaceMenu.

## AI Pathing Freeze Fix (taken 2026-10-17)

- **What it is.** An SKSE plugin by cashboxs, one DLL on CommonLibSSE-NG
  and the Address Library: Nexus SSE mod 190049, main file 801783, v1.1 of
  2026-09-07. Source at github.com/cashboxs/TMS_AIPathingFreezeFix
  (ef0e76d5), GPL-3.0-or-later (its LICENSE and README). It fixes one
  engine hang: a pathing calculation returns false without writing its
  output, the caller hands the stale value to the angle normalization, and
  a NaN there spins its "add 2pi while below 0" loop forever on a job
  thread while the main thread waits. Its hook calls the original; only a
  false result with a non-finite X or Y has its output zeroed, and the
  result stays false.
- **Why thuum takes it.** It is the lab's load freeze, about one run in a
  hundred (docs/research/load-freeze.md): the dump of 20261017-132848
  names the same call, a wolf's path follower handing the angle routine a
  slot it never wrote. An existing plugin fixes it, so we write nothing.
  It adds no state and no message: it keeps the engine's own actor
  movement (R2, host computes, server records) from hanging.
- **Runtime.** 1.6.1170 only in the lab: its file notes say tested on
  1.6.1170 and not compatible with 1.7.99 or later. It declares Address
  Library independence to SKSE, so the gate is its own: it arms only when
  the angle routine's loop bytes match and exactly one call site matches,
  and otherwise logs "NOT armed" and patches nothing. SKSE reads its
  version as 1.0.0.0 (its CMake version); its own log says v1.1.
- **The lab's check.** Its log, My Games\Skyrim Special
  Edition\SKSE\TMS_AIPathingFreezeFix.log, beside skse64.log: an
  "installed runtime=1-6-1170-0 kind=AE" line on every boot, then "AI
  FREEZE FIX repair=N" for the first three repairs and a summary at most
  once a minute. A repair should show only on boots whose image base makes
  the stale slot a NaN (the research's prediction, which skse64.log's image
  base tests; lab-api keeps skse64.log from every run, and keeping this log
  beside it makes every run the check), and no seat should go silent after
  PostLoadGame again. HYPOTHESIS until a lab run shows both. Still open from
  the research (rule 2): Ghidra's read that the producer takes two
  arguments and writes a 3D vector, since the plugin writes 12 bytes.

## The essentials layer (Eli's set, staged 2026-10-19)

Eli's ticked essentials from their own Skyrim (docs/private/mods-fenestrate.md, 113 ticks
of 210 on 2026-10-18, and their decisions on the dependency gaps; the plan is
docs/research/mod-layer-plan.md). Built by apocrypha on branch
`apocrypha/layer-essentials`; `just layer-stage apocrypha/layer-essentials` stages it.

**What it is.** 97 mods copied from Fenestrate, 5 fetched from Nexus (Cloaks of Skyrim and
Winter Is Coming from decision 4, Realistic Aspen Trees after playtest 26, the Survival
collection's two non-HDT warmth patches after playtest 27, all below), on top of the layer's
existing eight (RaceCompatibility, rotfern, RaceMenu, CBBE, Lost Grimoire, Apocalypse, Headshot
Kills with CIF 2.0.7, AI Pathing Freeze Fix): 90 plugins in the clients' order (81 served, 9
client-only at the tail), 45 of them light; 28 mod folders scoped `@1.6.1170` (every SKSE DLL
mod: all of them loaded on Fenestrate's 1.6.1170 under SKSE 2.2.6, none has run on 1.7.104).
111 mod folders and the Papyrus map's, 5,754 files once the install-order rule (below) has
dropped the six replaced copies, 4.1 GB on disk (the DLL mods' .pdb files kept: Crash Logger
with PDB support is in the set and reads them). add-mods.ps1 adds and replaces files, never
removes one: a render that drops a file (FSMP's DLL and configs on 2026-10-20) relies on the
clone being laid from a base without it, which the stage's snapshot discipline gives.

**Where it lives.** One row per mod folder in `lab/layer/essentials.tsv`, read by
lab/tools/persist-mods.sh after its hand-written blocks:

- `fenestrate` rows copy the mod's Vortex staging folder, pulled read-only off VM 220's disk
  (the host-side mount, Eli's OK of 2026-10-18 via thuum-magnus; nothing written there)
  into `lab/.cache/mods/fenestrate/<folder>`. A staging folder is the mod as Vortex
  installed it, FOMOD choices already made, so the layer carries the files Eli's game ran:
  every file Fenestrate's deployment manifest lists for the mod is there and all 87
  plugins match Fenestrate's Data byte for byte over their first 64 KiB (apocrypha's check
  against the plugin heads pulled with the mod list; Playable Headparts All Races.esp has
  since gained its build-time patch, below). Each row records a tree hash of the
  folder after exclusions and persist-mods refuses a copy that differs. The manager's
  own top-level files (readmes, pictures, meta.ini, Vortex's marker) are excluded.
- `nexus` rows fetch the archive the row names with the Keychain's Nexus key, check its
  md5 (each confirmed by Nexus's md5_search on 2026-10-19) and lay out the installer folders
  the `take` column lists, read from each FOMOD ModuleConfig.xml by hand. Cloaks of Skyrim's
  RAR uses a method 7zz refuses, so persist-mods needs `unar` (brew install unar).
- `local` rows copy a folder made by hand under lab/.cache/mods and check its tree hash
  (for the Nemesis output below).
- The load order lives once, in `lab/layer/load-order.tsv` (mod folder, light flag from
  the TES4 header, game versions, served or client-only). `lab/tools/layer-render.py`
  writes it into persist-mods' `plugins=(...)` array and both server-settings files;
  `lab/tests/test_server_settings.py` fails when the three disagree. The order is Eli's
  loadorder.txt order for their plugins, with the new cloak plugins placed before the two
  cloak patches and the client-only plugins last (CBBE's pair the very last, as before).
  Every plugin's index moves against the current lab; server and clients take the new
  list together, as every layer change does.
- `PERSIST_LOCAL=1 lab/tools/persist-mods.sh` builds and checks the tree without touching
  the host (the dry run this branch was validated with).

**Decisions carried, verbatim from Eli:** 2026-10-18, "1. ditch the patch 2. untick the
integration 3. ditch the armor mod 4. add the cloaks and hdt 5. untick. 6. if it needs it
add em. if not no action." and '"No Guards", FSMP in. i feel like my spare 1050 is like,,
the oldest card we'll have to account for.'; 2026-10-19, on the hole the archives showed
(below), "id like cloaks to give survival warmth."; 2026-10-20, after playtest 27's cloaks,
"the cape physics worked but it looked jank. lets go back to using not fsmp". So: out are the
Apocalypse/Tomebound patch, Goam's Elven Ears RaceMenu Integration (the ears themselves stay),
Armor and Clothing for Kids and the NARC Dremora addon; in are Cloaks of Skyrim 1.2.1 and
Winter Is Coming SSE - Cloaks 2.4 in its Full file, with the Survival Mode Patch Collection's
non-HDT warmth patches 01 and 02 over them. Artesian Cloaks of Skyrim 1.3.0 (its Cloaks of
Skyrim and Winter Is Coming physics packages) and FSMP 4.1.1 came in with them for decision 4's
"hdt" and left again on 2026-10-20, taking the collection's HDT patch file with them. The spare
GTX 1050 seat (c1) stays the hardware floor for every layer check.

**Read from the archives, not from the plan:** "SMP_Patch" is Artesian's naming
(HDT-SMP), one plugin per base-mod variant; the Survival Mode Patch 14 esps are
same-named replacements of Artesian's Full-variant plugins with warmth keywords added, and
master the Full plugins (Cloaks.esp and Cloaks - Dawnguard.esp; 1nivWICCloaks.esp).
Winter Is Coming's No Guards file ships `1nivWICCloaksNoGuards.esp`, so the collection's
WIC esp could not load with Eli's first pick; the second ("survival warmth") picks the Full
file, and both halves load: the base plugins, Artesian's meshes and physics configs, and
the collection's two esps replacing Artesian's plugins (Artesian's plugins keep the base
mesh paths; its physics meshes replaced the base files at the same paths, 391 of Cloaks of
Skyrim's 469 meshes and 16 of Winter Is Coming's 209, by the install-order rule below).
Cloaks of Skyrim's own `Cloaks - USSEP Patch.esp` comes along (USSEP is in the set). Since
2026-10-20 none of the physics half is in the layer. The HDT patch esps could not stay without
Artesian (besides the warmth keywords they carry Artesian's body-slot and armature edits), so
the collection's non-HDT patches replace them: "Survival Mode Patch 01 - Cloaks Of Skyrim"
(file 66092, `Survival Mode Patches - Cloaks Of Skyrim.esp`) and "02 - Winter Is Coming" (file
66093, `Survival Mode Patches - Winter Is Coming.esp`), each a full esp with nothing but ARMO
overrides (122 and 183) that rename the cloaks vanilla-style and add the warmth keywords (their
MODL and TNAM fields are the same armature and template ids under their own master order).
Both are ESL-flagged at build (plugin patches, below), so they sit on the two light slots the
HDT pair held and no later plugin moves. Nothing else in the layer leaned on FSMP: no other
mod ships an SMP config, CBBE 2.0.3's vanilla shape has no body physics, and Cloaks and Capes,
whose folder name carries Fenestrate's Vortex label "FSMP - XPMSSE", is the plain 1.4 file
(Nexus 2019 file 35552, md5 0853b94a…) with no physics in it.

**Install order, learned from the clones (2026-10-19, playtest 26):** rows install in
order, as a mod manager does. A later row's file replaces an earlier row's (or a folder
laid above the rows) at the same Data path, and persist-mods drops the replaced copy from
the tree, so SHA256SUMS lists each Data path once and the build names what it replaced
(`replaced: N files of <row> by <row>`). Before this rule add-mods.ps1 applied SHA256SUMS
in its sorted order and kept the last copy it fetched, so `cloaks-of-skyrim-1.2.1` sorted
after `artesian-cloaks-of-skyrim-cos-1.3.0` and the base meshes won on the clones, with
both copies refetched on every run (407 files). A folder scoped to a game version
(`<mod>@<version>`) loses to a later row of its scope or of none; a folder of no scope keeps
its copy against a later scoped row, with a `kept both` note, since the other version still
needs it. What the rule replaced on 2026-10-19, all of it as Fenestrate ran it: the 391 and 16
base cloak meshes (until Artesian left the next day); CBBE's three female `_sk` skin textures,
replaced by Goam's "No ENB user SK fix" copies (Fenestrate's Vortex rule put CBBE before Goam
for exactly this); and byte-identical overlaps that change nothing (the two Apachii witcher
hair textures rotfern bundles, the one script Headshot Kills and Stab The Heart share, and
while Artesian was in, its two packages' `cloak.xml`). Today the rule replaces six copies.

**Plugin patches at build (`lab/layer/plugin-patches.tsv`, lab/tools/plugin-patch.py):** a
few plugins are patched at the byte level after persist-mods lays them, size kept, idempotent,
so the server's esm copies and the clients' SHA256SUMS carry the same bytes; these plugins
differ from their archive or Fenestrate bytes by design. `esl` sets the TES4 light flag on the
two Survival warmth patches, which define no record of their own (override-only, so the FE
space holds nothing of theirs), to keep the light slots the HDT pair held. `hdpt-gender-from-master`
gives every head part of Playable Headparts All Races.esp the gender bits (0x02 male, 0x04 female)
of the record it overrides in its master, 766 from Skyrim.esm and 39 from Dawnguard.esm (read from
lab/.cache/game, pulled off the host like the Survival esl), every other bit and the all-races RNAM
kept. Why: the mod clears the bits on its 805 overrides (DATA 01/05/09/11/18/19 across them), and
RaceMenu's ApplyPresetData applies a part only when its gender flag matches the actor
(docs/verbs/racemenu-sync.md, rotfern's own root cause), so under the layer every preset load
seated the race defaults for hair, hairline, beard, brows and marks (thuum-magnus, a-racemenu red
20261020-193623; c1's base held five parts against the preset's eight, the eyes surviving only
through All Eyes for All Races, later in the order). Eli's call, 2026-10-20: "patch it". The first
patch set both bits on every part: that fixed the preset load (x-layer-headparts 20261020-210719,
both seats) and broke the vanilla race menu for males, whose rebuild at open reads a part with the
female bit as female and takes the first valid alternative where one exists, so a male's hair
swapped to ApachiiHairM01 at menu open (a-racemenu 20261020-224305, step 18; magnus's read). The
master's own bits are right for both paths. HYPOTHESIS until a-racemenu is green on this render.
`flst-set <formid> <id,...>` replaces a form list's entries in the given order and keeps its
other subrecords, the record and the groups around it resizing; it carries rotfern's vampire
pairing (Eli's D57 A, 2026-10-28): RaceCompatibility's PlayerVampireQuestScript pairs
PlayableRaceList[i] with PlayableVampireList[i], and rotfern.esp's overrides of the two lists had
rotfern at [14] of 15 (four child races before it) against rotfernRaceVampire at [11] of 12, so a
turn set no race and a cure gave ImperialRaceChild (the 2026-10-06 diff below; the read in
docs/research/vampirism-under-the-server.md). The served copy now holds the ten vanilla pairs and
rotfern's at [10] in both lists; Eli's plugin is untouched, and the slot's CRC32 moves with the
render. `perk-drop-ability <formid>` removes a perk's ability entry and `spell-magnitude <formid> <value>` sets a
spell's magnitudes, injecting the record from its master first when the plugin lacks it (the multiplayer
defaults, below); every record patch must hit the last plugin overriding its record, which the tool
checks against the load order. `drop-record <formid>` removes one record, the groups around
it shrinking and the header's count following (with flst-set and perk-drop-ability the patches that change a file's size); it

**Multiplayer defaults (Eli, 2026-10-28, verbatim: "some settings i want on for everyone by default
(some settings some changes) - subtitles need to be on across the board - killcams have to be
disabled for multiplayer - the bow's slow time perks need to not slow time", then "yeah include the
slow time shout too"; apocrypha/layer-defaults, for the slot after playtest 37 with D57 A).** All
four are data, read from the files, and take the layer's two existing shapes: an ini key written on
every seat and in the friend installer, or a build-time patch on a served plugin, the server's copy
included. Nothing happens at runtime.

- **Game ini keys, `lab/layer/game-ini.tsv`.** persist-mods copies the table to the tree's root beside
  plugins.txt (not a Data file, not in SHA256SUMS); add-mods.ps1 fetches it after plugins.txt and
  writes each key into the lab user's Documents\My Games\Skyrim Special Edition\<file> under its
  section, rewriting a present key in place, appending a missing section, every other line kept
  (display.ps1's shape for iSize); the friend installer reads the same file. Rows: SkyrimPrefs.ini
  [Interface] `bGeneralSubtitles=1` and `bDialogueSubtitles=1` (the seat's file carries both at 0; the
  1.6.1170 executable names both, and no `bShowSubtitles`), rung R3, a seat's own HUD; Skyrim.ini
  [VATS] `bVATSDisable=1`, the kill camera's switch, rung R3, the seat's own camera. The read behind
  the camera key: the melee cinematic and the bow's arrow cam are the engine's VATS camera; Skyrim.esm
  holds no game setting for it beyond `fKillCamBaseOdds` (unread semantics; every other VATS GMST is
  camera geometry), and the executable knows `bVATSDisable`. The fork's client already blanks `KillMove*`
  animation events for runtime figures (deathService.hookDisableKillMoves, self ids ff000000 to
  ffffffff: other players' figures), so the ini key closes what remained, the camera on the player's
  own kills and deaths; a paired kill move on an NPC still plays in the normal camera and is the npc-fate
  verb's killMove. HYPOTHESIS until a seat kills with a bow and a sword and sees neither cinematic.
- **Two record patches on the plugins that win the records (`lab/layer/plugin-patches.tsv`).** The
  records in question are already overridden in the layer: USSEP carries Steady Hand's two perks and
  the shout's first spell, the Spell Absorb and Twin Souls Fix (slot 20) carries all three shout spells
  with its no-absorb flag, so a separate tail plugin copying Skyrim.esm's records would have reverted
  their fixes; the patch lands in the copy that wins, and plugin-patch.py now refuses a record patch
  that a later plugin overrides (the guard scans the load order after the patched plugin, by master
  name and local id). `perk-drop-ability 00103ADA` and `00103ADB` on USSEP's copy of Archery's Steady
  Hand ranks (SteadyHand40, SteadyHand60): each perk's one entry is an ability,
  `PerkSteadyHandTimeSlowdown01/02` (SPEL `00103AD8/9`, a 0.5 and 0.25 modifier of actor value 78,
  the engine's bow-zoom time scale, through MGEF `00103AD7`); the entry goes (PRKE type 1 with its
  DATA and PRKF), the perk keeps USSEP's name, description, conditions and NNAM link, so the tree
  still shows and sells it and it does nothing: time is the server's (R0), so the slow goes.
  `spell-magnitude 00048AD0/1/2 1.0` on the Twin Souls fix's copies of the Slow Time shout's three
  spells (VoiceSlowTime1/2/3, effect MGEF `00048ACD` VoiceSlowTimeEffect, archetype 37 SlowTime, which
  scales the game's time by the magnitude: 0.3 for 8 s, 0.2 for 12 s, 0.1 for 16 s); at 1.0 time
  keeps its pace and the shout keeps its words, walls, sound, recovery and the no-absorb flag (R0 for
  the time, the rest the seat's own). `spell-magnitude 000D8C31 1.0` on USSEP for Block's Quick
  Reflexes (Eli, 21:1x PDT: "yes to apocryphas ask"): the perk (PERK `000D8C33`) applies
  PerkQuickReflexes while the player blocks a power attack, the game's time at 0.05 for 1 s through the
  same SlowTime archetype (MGEF `000D8C32`, which USSEP overrides). No plugin of the layer overrides
  the spell itself, so the patch's second ability applies: a plugin without the record gets Skyrim.esm's
  copy injected into its SPEL group (read from lab/.cache/game, the host's master copy, decompressed;
  the header's count up by one) and then the magnitude; the guard confirms nothing later carries it.
  USSEP's size and CRC32 move with its three patches (slot 1's mod-lock entry: 21,106,651 B CRC32
  86A15BD3 before; 21,106,777 B CRC32 7CA7F25F after, SHA-256 01064760..., the two 25-byte ability
  blocks gone and the 176-byte spell record added), the Twin Souls fix's CRC32 with the shout rows (its
  light slot: 42,409 B either way, CRC32 F765F49C before, C5F71B81 after, SHA-256 e2756021...); dry runs
  of 2026-10-28. HYPOTHESIS until a seat zooms a bow with Steady Hand, blocks a power attack with Quick
  Reflexes and shouts Slow Time with the clock unchanged on both seats. These were the only slow-time
  records in Skyrim.esm (two perks, one shout; Dawnguard's and Dragonborn's were not read for more).

The alternatives read and not taken: a GMST override for the camera (none governs it), the client's
runtime set-gmst (not data, not in the installer), a tail plugin of vanilla copies (it would have undone
USSEP's and the Twin Souls fix's own changes to the same records), the shout kept out of reach (its
three word walls' scripts and words are learnable content; a magnitude of 1.0 keeps them honest), and
the shout turned into a per-actor slow on hostiles (new spell records with a cone projectile and an
area effect the server's magic-effects verb would carry; content work for M2 if a real replacement is
wanted).
carries the layer's rule that **no served plugin may override the player's base record NPC_
0x00000007 (nor PlayerRef 0x14)**: in SkyMP every player shares 0x7 and the server builds each
player's values and appearance from it, so a layer override changes every player's base under
the server's feet (thuum-magnus, 2026-10-20; layer-stage's 2b refuses one, numidium). Of the
layer's 93 plugins exactly one did, Supernatural Survival Tweaks - Cold Resist Werebeast and
Vampire.esp: a whole copy of the vanilla Player record plus a VMAD attaching
SST_PlayerScriptAddRemoveAbilities, the script that gives vampires and werebeasts their cold
resist, and the record on the stack of the a-rotfern CTD (SkyrimSE.exe+095A263, run
20261020-224918, the mid-game look step). The patch drops that override (7,729 to 6,962 B, 13
records left); the plugin keeps its Survival quest, effect and spell overrides, and loses the
ability script, which never ran connected anyway (outside the admitted list). Eli's call,
2026-10-20: "patch it". `lab/tests/test_plugin_patch.py` holds the patches to their contracts.

**Papyrus admission by plugin (ADR-044, accepted by Eli 2026-10-19):** persist-mods ships
`papyrus-admitted/Platform/papyrus-scripts.txt` as a layer file, so add-mods.ps1 installs it,
hash-checked and refreshed with each stage, at `Data\Platform\papyrus-scripts.txt` in every game
folder; Skyrim Platform reads it there at its load, before the first tick (train-29's row), and a
client without the layer has no file and admits nothing. One line per admitted plugin, `<plugin>:
<script class> <script class> ...` after `#` comment lines, the names skymp5-client admits through
its event block (the hook sees class names, not plugins). The admitted
plugins are the rows of `lab/layer/papyrus-admitted.tsv` (plugin, source, why). lab/tools/papyrus-map.py
reads each plugin's VMAD records (the scripts on its forms, a quest's alias scripts, the fragment
classes of quests, perks, dialogue, packages and scenes) and, for a plugin from a layer folder, the
folder's compiled scripts too (loose `scripts/*.pex` and the `scripts\` entries of its BSAs' name
tables; nothing extracted or decompiled). A `game` row is one of the game's own plugins: its file is
pulled off the host's persist esm directory into lab/.cache/game and read there. The first row is
ccQDRSSE001-SurvivalMode.esl, and the first measured case: with the block lifted and
SurvivalModeMainQuest restarted, its 5 s check ran and the Creation's own "Enable Survival Mode?" box
appeared in a connected game (numidium, x-survival-unblock3 20261020-024406), so admitting its names
from the first tick is enough. The file is regenerated at every build and listed in SHA256SUMS like every layer file.
`lab/tests/test_papyrus_map.py` checks the rows and the VMAD reader's layouts.

**RaceMenu's menu under the layer (2026-10-20, the a-rotfern CTD and a-racemenu's hair swap):**
SkyUI_SE.bsa carries `interface/racesex_menu.swf` too, the one file the two archives share, and in
the layer SkyUI_SE.esp is client-only at the tail (slot 82) after RaceMenu.esp (23), so among
archives SkyUI's copy won and every layer seat ran SkyUI's vanilla-style race menu instead of
RaceMenu's: skee64's chargen never initialised (no `RaceMap::CreateDefaultMap` in a layer seat's
skee64.log, where the no-layer run has it), a-rotfern's race-pick walked the vanilla menu's
name-sorted list onto rotfern's vampire twin, a-racemenu's menu open rebuilt the hair, and the
a-rotfern CTD (SkyrimSE.exe+095A263, run 20261020-224918) is that vanilla menu's slider rebuild
indexing the player's tint array past its end for rotfernRaceVampire's 33 male tint layers
(thuum-magnus's read). Fenestrate had SkyUI at 93 and RaceMenu at 170, as RaceMenu's own install
notes require; without the layer the lab has no SkyUI at all. The fix keeps every slot where it is:
persist-mods lays RaceMenu's copy of the file loose in RaceMenu's folder, extracted from
RaceMenu.bsa by lab/tools/bsa-extract.py (a stdlib BSA reader with its own LZ4 frame decoder;
`lab/tests/test_bsa_extract.py`), and a loose file beats every archive whatever the plugins'
order. Rule learned: when two archives carry the same path and the plugins' order cannot be the
installer's, lay the winner's copy loose. HYPOTHESIS until `RaceMap::CreateDefaultMap` appears in
a layer seat's skee64.log and a-rotfern and a-racemenu are green.

**Realistic Aspen Trees (playtest 26; Eli: "the trees looked fucked up and were missing
textures"):** Eli's ticked Simply Bigger Trees file is "Simply Bigger Trees SE (Realistic
Aspen Trees - Loose)" (Nexus 5281 file 11503), whose file description reads "REQUIRES
REALISTIC ASPEN TREES. Install this AFTER R.A.T. and overwrite - LOD is included". The mod
page lists no requirement, so the tick list said "needs: nothing beyond the game" and
Realistic Aspen Trees SE 4.0 (Nexus 4423 file 58810; enabled on Fenestrate, with a Vortex
rule placing it before SBT) went unticked. SBT's treeaspen02 to 05 meshes reference
`textures\landscape\trees\treeaspenbranchcomp01.dds` to `04.dds`, which only RAT ships
(vanilla has the one `treeaspenbranchcomp.dds`), hence the untextured aspens; the pine and
reach trees reference vanilla names. The fix is the nexus row `realistic-aspen-trees-se-4.0`:
Fenestrate's FOMOD choices were 2048x2048 and the Vanilla tree LOD (12 files), of which SBT
overwrites the six meshes and the LOD atlas, leaving the five textures Fenestrate's
deployment manifest attributes to RAT (the four variants and `treeaspenbranchcomp_n.dds`),
which is all the row takes, so it conflicts with nothing. Lesson for the tick list: a Nexus
file's own description can carry a requirement the mod page does not. The same scan of
Fenestrate's Vortex rules and Nexus requirements across the layer boundary found one more,
for Eli's call: Intuitive Dragon Ride Control 7.0.1 lists True Directional Movement - Target
Lock Extension Patch for TDM 2.2.6 (Nexus 160556 file 694401, unticked; it replaces TDM's
DLL with one extending target lock for camera height, dragon riding and camera behind the
target), which Fenestrate ran; the layer ships TDM 2.2.7's own DLL. Page-listed extras
outside the layer (Light Placer for Stealth Detection Fixes, Media Keys Fix for Alt-Tab
Stuck Key Fix, Paired Animation Improvements for Open Animation Replacer, BodySlide for
Racemenu Misc Slider) are optional on their pages.

One more for Eli's call, from the lab (2026-10-22, train-34's first gate): Intuitive
Dragon Ride Control's Papyrus start-up check showed its "SKSE is not loaded. Dragon riding
will not work. [OK]" message box on a seat whose SKSE and whose IDRC DLL had loaded
normally (c2-skse64.log and the DLL's own log identical to a green run's), twice in a row
on b-invis-recast (20261023-033739 and 034010) and never in the forty-odd runs around
them; its log shows the mod's InitializeData_SKSE running twice interleaved on the game
thread in the reds against twice in sequence in the greens, so the check's timing is the
mod's own race. The box pauses the game until OK, so a player can meet it too, and the lab
reads the paused run as measuring nothing. Options: patch the check (its scripts are
Papyrus, the box is one line), drop the mod from the set, or let the lab dismiss the box
(a stopgap that hides a real load problem if one ever comes). The server loads its esp
(lab/deploy/sky-srv/server-settings.json).

**Not placed (rows with source `out`, not dropped silently):**
- sse-engine-fixes-skse64-plugin-7: part 2 only (the game-root preloader d3dx9_42.dll); add-mods.ps1 installs under Data, and part 1, the SKSE plugin, was never on Fenestrate; Nexus 17230 file 725261
- Fenestrate's Core Impact Framework 1.2.8 is not copied: the layer keeps CIF 2.0.7, which
  the lab validated on both versions (above); rotfern stays the standalone fork, not
  Fenestrate's 15-master plugin; SKSE is the lab's own install.

**Client-only, with the reason (load-order.tsv's `why`):** SkyUI_SE.esp, RLAiO.esp,
UnreadBooksGlow.esp, NMNEB.esp, MCMHelper.esp, DisableSpellLight_Prebuilt.esp (interface and
visuals no server state names), then RaceMenuMiscSlider.esp and CBBE's pair. Two rules learned
on the first stage (2026-10-19, numidium's bisect on c1): an `.esl` can never be client-only,
because the engine loads every master-type file (ESM flag, `.esm`, `.esl`) before the rest
whatever plugins.txt says, so a client-only `.esl` shifts every later light index on the
clients against the server (TrueHUD.esl took FE004 on the clients while the server's Headshot
Kills.esp sat one index lower); TrueHUD.esl is served, third in the order among the masters.
And the lab's clones carry only the free Creation Club set (ccBGSSSE001-Fish, ccQDRSSE001-
SurvivalMode, ccBGSSSE037-Curios, ccBGSSSE025-AdvDSGS, _ResourcePack), not Fenestrate's
Anniversary Edition content, so the four plugins mastering ccBGSSSE031-AdvCyrus.esm or
ccvsvsse003-necroarts.esl (MoreCraftableEquipment_AdvCyrus.esp, LoweredHoods_CCNecromanticGrimoire.esp,
LoweredHoods_MoreCraftableEquipment_CCNecromanticGrimoire.esp, Necromantic Grimoire - Mysticism
Rebalance.esp) are out of the layer, not client-only: the engine disabled the three whose master
is missing, and the fourth, enabled with its master inactive, was the boot CTD of the first stage
(SkyrimSE.exe+01D74A0, both clones). The first three are excluded from their mods' folders in
essentials.tsv; the Necro rebalance mod is an `out` row. They return only if the clones ever
carry those two Creation Club files. The third rule came from playtest 26 the same evening and
is the install order above: rows install in order and a later row's file replaces an earlier
row's at the same Data path, the replaced copy leaving the tree (414 copies in the 2026-10-19
layer, the cloak meshes that had kept Artesian's physics off the clones among them; six since
FSMP left).

**What the layer needs from the game side (the fork and the lab), in the order it will bite:**
- SkyUI's MCM is the first use (the per-player globals check): SkyUI_SE.esp is client-only
  and its scripts run on the client; MCM Helper (1.6.1170) carries the config-file menus
  that TrueHUD, Stealth Detection Fixes and others register through.
- 44 of the 113 mod folders ship Papyrus scripts (2,421, loose or in BSAs), and in a connected
  game skymp5-client's event block drops OnUpdate for every script, admitted names included
  (HYPOTHESIS until numidium's unblock probe; the code reading is
  docs/research/papyrus-event-filter.md), and every other event for a script not named
  SKI_*, RaceMenu*, GRIM_ALT_TeleportationMarker, WB_DestroyAfterDelay_Script or
  defaultDisableHavokOnLoad, sparing only ActiveMagicEffect events on the player.
  docs/research/layer-papyrus.md is the census, one verdict per mod from each script's parent
  class: 19 mods blocked outright (Jewelry Limiter, Dynamic Activation Key, Vampire Feeding
  Tweaks, Self Filling Bookshelves, Portal, Let's Ride Durnehviir, Reading List, General
  Displays, Tel Jerdein's activators, RaceCompatibility's quests, IDRC's quests and scenes
  among them; four of the 19 only fix vanilla scripts a connected game never runs), 12 magic
  mods whose spell effects work on the player alone, 3 that lose only their MCM, 69 without a
  script. ADR-044 (thuum-magnus, PROPOSED) puts admission by plugin to Eli; if accepted,
  persist-mods serves a plugin-to-scripts list beside the load order, regenerated with the
  layer.
- Every DLL mod enters at 1.6.1170 only; the 1.7.104 set has none of them (its server
  list has 76 plugins). A seat test per DLL moves it to both.
- Nemesis: True Directional Movement is the only mod in the set with Nemesis patches (three
  folders under Nemesis_Engine\mod in its mod folder: `tdmv` "True Directional Movement -
  Headtracking" and `tdmlen` "True Directional Movement - Procedural Leaning", both marked
  auto for TrueDirectionalMovement.esp, and `tdmh` "True Directional Movement - 360 Horse
  Archery", manual). Their behaviour output is not in the layer yet; the procedure below
  generates it once and ships it. Until then TDM's movement works without its animation
  patches. Fenestrate's own Nemesis output was never under Vortex's management (the manifest
  attributes only the engine's templates and scripts to the Nemesis mod), so nothing to copy
  from there.
- Light plugins: the server now loads 40 light plugins after the three Creation Club
  ones; the light-plugins verb's index mapping is what keeps FE form ids agreeing.
- The server's esm directories receive 81 plugins (76 for 1.7.104); persist-mods
  places them from the manifest at the stage.

### The Nemesis output for True Directional Movement: the seat procedure

Nemesis Unlimited Behavior Engine is a Windows tool that rewrites the game's behaviour
graphs from the patches installed under Data\Nemesis_Engine\mod; its output must be the
same on every client that runs the same patch set, so the layer ships one generated set
rather than running the tool per client (docs/research/mod-layer-plan.md). Steps, for a
scratch clone of c1 (the GTX 1050 seat) that has the layer installed (`just client-mods`)
and nothing else:

1. The engine build: the one Eli ran, Nexus 60033 "Project New Reign - Nemesis Unlimited
   Behavior Engine" v0.84-beta, file 248867, archive
   `Nemesis Unlimited Behavior Engine-60033-v0-84-beta-1639426722.rar`, md5
   a3d069d01333a8cdd09ddf669044ce76 (Vortex's record on Fenestrate; fetch it with the
   Keychain's Nexus key as persist-mods fetches, or copy Fenestrate's archive). Unpack its
   `Nemesis_Engine\` folder into the clone's 1.6.1170 game folder under Data (by hand on the
   seat, through the guest agent: it is a tool, not a layer mod, and the clone's snapshot
   rolls it back afterwards). The patches it will see are TDM's three folders, already in
   Data\Nemesis_Engine\mod from the layer.
2. Run `Data\Nemesis_Engine\Nemesis Unlimited Behavior Engine.exe` in the seat's desktop
   session (it is a GUI). Click "Update Engine" and wait for it to finish. Tick the two TDM
   patches marked auto, "True Directional Movement - Headtracking" (tdmv) and "True
   Directional Movement - Procedural Leaning" (tdmlen); leave "360 Horse Archery" (tdmh)
   unticked unless Eli asks for it (it rewrites the mounted behaviours too). Click "Launch
   Nemesis Behavior Engine" and wait for "Behavior generation complete". Write down the
   engine version and the two patch names.
3. Collect the output from the seat's Data, in Data layout: every file Nemesis wrote or
   changed, which is `meshes\actors\character\behaviors\*.hkx`,
   `meshes\actors\character\_1stperson\behaviors\*.hkx`,
   `meshes\actors\character\characters\defaultmale.hkx` and
   `meshes\actors\character\characters female\defaultfemale.hkx` if present,
   `meshes\animationdatasinglefile.txt`, `meshes\animationsetdatasinglefile.txt`, and
   `Scripts\Nemesis*.pex` (the engine's Papyrus side; TDM's patches add no animation
   variables, so the Nemesis_AA scripts stay inert). Take only files whose modification time
   is after step 2 started, plus the two singlefile txts. Leave the engine's own folder,
   its cache and its `Nemesis_*.xml` templates out.
4. Put them on this Mac as `lab/.cache/mods/nemesis-output/<path inside Data>` (the clone's
   files come out through the lab's handover, as a run's logs do), then add one row to
   lab/layer/essentials.tsv:
   `nemesis-output-tdm-<engine version>	local	nemesis-output	tree:<hash>				Nemesis <version> output for TDM's tdmv and tdmlen patches, generated on <seat>, <date>`
   where the hash is `(cd lab/.cache/mods/nemesis-output && find . -type f | sed 's|^\./||' | LC_ALL=C sort | while IFS= read -r f; do shasum -a 256 "$f"; done | shasum -a 256 | cut -c1-64)`,
   the same tree hash persist-mods checks. The folder has no plugins, so load-order.tsv does
   not change; `PERSIST_LOCAL=1 lab/tools/persist-mods.sh` proves the row, then commit.
5. Regenerate whenever a mod with a Nemesis patch joins or leaves the set (today only TDM;
   XPMSSE, Precision and Ultimate Combat would, if Eli ever ticks them), and note the engine
   version in the row: two generations from different engine builds must not be mixed.
