# Verb: racemenu-sync

Eli, 2026-10-06: "i want my friends to be able to make their own hyper
specific characters." SkyMP syncs the vanilla appearance (race, head parts,
tints, face sliders) and nothing RaceMenu adds, so a player's RaceMenu look
(sculpt, overlays, body morphs, node scales, its extra sliders) exists only
in its own game, and only until its next login: every login loads a
generated save, and RaceMenu keeps its data in that save's SKSE co-save.

## Intent

A player shapes its character in RaceMenu once; the server keeps the
result; every client, the player's own included, shows that look after
every login.

Roadmap reference: none (SkyMP's appearance sync stops at vanilla data)
Milestone: Stretch, chosen by Eli 2026-10-06 (docs/PLAN.md)   Class: B (a
player's own data, shown on every client)

## Authority

Rung: R2, bounded. The look is the player's choice, computed by RaceMenu
in the player's game; the server records it and hands it out. It is
client-authored, so untrusted (hard rule 5): the server bounds its size,
checks that every form it names exists in the load order, and that every
sculpt vertex index is below its host's vertex count.
Why not R1: there is no game rule to validate a face against; the bounds
above keep a hostile preset from carrying anything but a look.

## Engine surface (design input, apocrypha 2026-10-06; HYPOTHESIS until tested)

- RaceMenu 0.4.20.0 ships ModderResource/IPluginInterface.h with
  `IPresetInterface`: `SavePreset(filePath, tintPath, Actor*)` and
  `LoadPreset(filePath, tintPath, Actor*, applyTypes)`, which write and read
  the .jslot JSON (head parts, morphs, the sculpt, tintInfo, overrides and
  overlays, body morphs and transforms), optionally with the face tint .dds.
  Obtained through SKSE messaging (InterfaceExchangeMessage 0x9E3779B9) and
  `IInterfaceMap::QueryInterface("Preset")`; the "Preset" name is in the
  0.4.20.0 skee64.dll beside the other ten, not in GitHub master's main.cpp,
  so it is confirmed against the binary first.
- RaceMenu runs on game 1.6.1170 only. CONFIRMED live 2026-10-06: skee64.dll
  0.4.20.0 (Nexus mod 19080 file 743640, its newest, uploaded 2026-04-19;
  archive SHA-256 e0f5e923... as Nexus's VirusTotal link names it) declares
  SKSEPluginVersionData compatibleVersions [1.6.1170.0] and no version
  independence, and SKSE's loader enables a plugin without independence
  only on a runtime it lists (skse64 2.2.6 src/skse64/skse64/
  PluginManager.cpp, "simple version list"). On sky-c1's Steam game, SKSE
  2.3.1 on runtime 01070680 (1.7.104) logged: `plugin skee64.dll (00000001
  skee 00000001) disabled, incompatible with current version of the game`.
  Nexus has no newer file as of that day (mod updated 2026-04-20). So the
  verb is built and proven on the lab's 1.6.1170 client set (ADR-022), and
  a player who wants RaceMenu plays 1.6.1170 until RaceMenu ships a 1.7
  build. Its two plugins, RaceMenu.esp and RaceMenuPlugin.esp, are full
  slots (TES4 flags 0x0, not light), so the server's load order differs by
  game version once they are in the 1.6.1170 set.

- RaceMenu's own header for plugin authors (0.4.20.0,
  ModderResource/IPluginInterface.h; in lab/.cache/mods, never in a repo)
  declares the interface, read 2026-10-06:
  - `IPluginInterface` (lines 24-32): virtual destructor, `GetVersion()`,
    `Revert()`.
  - `IInterfaceMap` (lines 34-40): `QueryInterface(const char* name)`,
    `AddInterface`, `RemoveInterface`.
  - `InterfaceExchangeMessage` (lines 42-50): message type `0x9E3779B9`
    (kMessage_ExchangeInterface) carrying an `IInterfaceMap*`, null until
    filled.
  - `IPresetInterface : IPluginInterface` (lines 467-492): plugin version 1;
    `SavePreset(const char* filePath, const char* tintPath, Actor*)` and
    `LoadPreset(const char* filePath, const char* tintPath, Actor*,
    ApplyTypes = kPresetApplyAll)`; ApplyTypes face 0, overrides 1, body
    morphs 2, transforms 4, skin overrides 8, all 15. Paths like
    `SKSE\Plugins\CharGen\Exported\<name>.jslot` and
    `Textures\CharGen\Exported\<name>.dds` (the tint, optional "but
    recommended for correct look"). LoadPreset: "Details may be saved to
    the TESNPC, make sure this character is unique!"
  - Skyrim Platform declares its own copies of these classes for the ABI
    (the header is RaceMenu's; it is not copied into the fork).
- HYPOTHESIS: how a plugin gets the map. The header names the message, not
  who sends it. RaceMenu's public source (expired6978/SKSE64Plugins, older
  than 0.4.20.0) has skee answer an InterfaceExchangeMessage sent to it by
  name through SKSE messaging (receiver "skee"), filling `interfaceMap`
  before Dispatch returns. Confirm in skee64.dll 0.4.20.0 on sky-re
  (Ghidra): the message handler that writes the map pointer, and the
  "Preset" entry among the names it registers.
- HYPOTHESIS: SavePreset and LoadPreset run on the thread Skyrim Platform
  calls natives on (as TESModPlatform.SetFavorite does, docs/verbs/
  favorites.md); otherwise the native queues them to the game thread.
- Remote players: skymp5-client builds each remote player's figure on its
  own base NPC (src/sync/appearance.ts applyAppearance:
  `TESModPlatform.createNpc()`), so LoadPreset's writes to the TESNPC stay
  with that player. The figure is respawned on a new base when its
  appearance changes (src/view/formView.ts, respawnRequired), so the
  preset is applied again after every spawn.

## Observe

- After the race menu closes (and after any later RaceMenu edit), the
  client calls SavePreset on its player and sends the JSON (and the tint
  .dds, if the size allows) to the server.

## Impose

- After a login, the server sends each player's stored look to its own
  client and to every client that shows that player; each calls
  LoadPreset (apply all) on that actor.
- Caveats from RaceMenu's source and header:
  - LoadPreset may write details to the actor's TESNPC ("make sure this
    character is unique"): every remote player needs its own base NPC
    (skymp5-client creates one per remote player through
    TESModPlatform.CreateNpc; to confirm).
  - Head parts are keyed by "plugin|FormID" and sculpt blocks by the head
    part's chargen .tri path: every client needs the same load order and
    the same loose meshes, or entries are skipped silently.

## Suppress

- Nothing.

## Message contract

- Its own message, RaceMenuPreset, both ways, not SkyMP's property
  replication: UpdateProperty is capped at 65 KiB on the wire (wire-schema
  TABLE), and a sculpted head can carry more. Client to server: `preset`,
  the .jslot JSON, within the transport's 256 KiB from a client (wire-
  transport Limits max_from_client). Server to client: `actor` (the server
  id of the player it belongs to) and `preset`. The cap is set once a real
  sculpted preset is measured in the lab; compression (deflate) only if
  that measurement needs it.

## Server

- Rust, wire-rules: the bounds (size, well-formed JSON object, only the
  .jslot's top-level keys, head parts and forms named by "plugin|FormID"
  present in the server's load order). Sculpt vertex indices are recorded
  unvalidated (the server has no .tri files; rule 5: R2, bounded).
- C++ core: the preset in the player's change form (`raceMenuPreset`,
  absent in older records and read as none). Sent to the player's own
  client after a login (the map-markers login hook), and to every client
  that gets CreateActor for that player, right after it; a new preset goes
  to the player's listeners.

## Client

- Skyrim Platform, TESModPlatform: `SaveRaceMenuPreset(Actor) -> String`
  (SavePreset into a file under SKSE\Plugins\CharGen\Exported, read back)
  and `LoadRaceMenuPreset(Actor, String) -> Bool` (the JSON written to that
  folder, then LoadPreset, apply all); both false or empty when RaceMenu is
  not loaded, as on 1.7.104.
- skymp5-client RaceMenuService: on the race menu's close, SaveRaceMenuPreset
  on the player and send it if it changed. On RaceMenuPreset from the
  server, LoadRaceMenuPreset on the player, or on that player's figure,
  keeping it in the world model so every respawn applies it again.
- Lab-driver: a step that loads a preset file staged for the run and one
  that saves the player's and reports its size and a hash, so a scenario
  can shape a look without dragging sliders.

## Tests

- T0: the Rust bounds (sizes, keys, forms) and the change form round trip;
  the login and CreateActor sends.
- T3 on 1.6.1170 (`a-racemenu`): c1 loads a sculpted preset and closes the
  race menu; c2's figure of c1 shows it (the saved preset read back through
  c2's own SaveRaceMenuPreset on that figure matches); the server restarts
  and c1 relaunches; c1 and c2 both show it again.

## Order of work

1. RaceMenu into the lab's 1.6.1170 set (thuum 1b4b741, after the merge
   sweep): its menu shows on both clones, and m0-appearance, a-rotfern,
   a-character-creation and smoke still pass there.
2. The interface confirmed in skee64.dll on sky-re (the two HYPOTHESIS
   tags above).
3. The two natives and the lab-driver steps: load a preset, save it back,
   compare. A real preset measured, which sets the message cap.
4. Message and validator (same commit), server, client, scenario.

## Status

- [ ] doc complete, rung declared (design input recorded; messages, server
      and client still to design)
- [ ] engine surface cited or delegated (the Preset interface, confirmed
      against skee64.dll 0.4.20.0)
- [ ] server logic + T0
- [ ] message + validator (same commit)
- [ ] native hook + T1
- [ ] TS handler
- [ ] T2 green
- [ ] T3 scenario green, no HYPOTHESIS tags
- [ ] ledger and suppression registry updated
