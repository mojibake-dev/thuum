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
  1470 x 102 x 262 units, a real collision body on the AnimStatic layer,
  navmesh obstacle flag) 192 units ahead, starting 288 below the ground,
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
- **RaceCompatibility 2.16** (USSEP variant): ESM plus override ESP. Its
  scripts use vanilla natives only, among them:
  - Actor.SetRace, Game.GetFormFromFile and Actor.SendVampirismStateChanged,
    all missing;
  - Actor.AddSpell and RemoveSpell, delegated.

  Vampirism maps PlayableRaceList[i] to PlayableVampireList[i], and rotfern's
  pair sits at the same index. The SKSE variant (Nexus 122592) breaks vampire
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
  plus the rotfern pair at [10]; (4) every complexion (FTSM, FTSF, DFTM,
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
