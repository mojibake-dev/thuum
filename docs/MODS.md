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
