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
| Core Impact Framework | 146873 | 721776 | 1.2.8 (the page is at 2.0.7) | 88ffc290d14e283f576bda68b0b246bd |
| RaceCompatibility for SSE, All-In-One | 2853 | 381971 | 2.16 | 9a8fc2437ac9339ab42647f096f61c95 |
| RaceMenu | 19080 | 743640 | 0.4.20.0 | 92f8e9de4b2a1ef8a442752dab460ada |
| Goam's Elven Ears Proper RaceMenu Integration | 122236 | 696384 | 1.1.0 | 43f58837afbc2e7cca970a76e7ce3e81 |
| Racemenu Misc Slider | 66544 | 277217 | 0.1.0 | aba9b887926b1629f51f1d0c5b0d4b45 |

Third-party mods never enter a repo or a lab image except through
rpool/sky/persist, like the master files (Nexus terms; docs/PLAN.md,
distribution track).

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
- **Runtime mismatch.**
  - CIF 1.2.8 declares Address Library post-AE but not the 1.7.99+ version 5
    flag, so it loads on 1.6.1170 (Fenestrate) and not on the lab's 1.7.104
    (ADR-018).
  - CIF 2.0.7 may load there, but it renamed BipedSlot to BipedSlots and made
    plain Conditions an OR; Headshot Kills is written in the 1.x keys.
  - So the lab needs either a CIF 2.x port of headshot.json or a 1.6.1170
    client. That is Eli's call.

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
- **Later.** Vampirism (M7) needs the three missing RaceCompatibility natives.
- **Not carried.** RaceMenu co-save data (sculpt, overlays) is outside SkyMP's
  appearance model, and its skee64.dll targets 1.6.1170 only, the same
  runtime question as CIF.
