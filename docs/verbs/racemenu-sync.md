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
- RaceMenu runs on game 1.6.1170 only (Nexus files, 2026-10-06), so the verb
  is built and proven on the lab's 1.6.1170 client set (ADR-022); 1.7.104
  follows RaceMenu.

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

- To be designed: a bounded blob (the JSON, a size cap well under the
  wire's per-message cap) client to server, and server to client per
  player.

## Server

- To be designed: the look in the player's change form (absent in older
  records, read as none), its bounds checked in Rust.

## Client

- A Skyrim Platform native (or a small SKSE plugin) that takes RaceMenu's
  Preset interface and exposes save and load to skymp5-client.

## Tests

- To be designed: T0 for the bounds; T3 on the 1.6.1170 set: c1 sets a
  sculpt through RaceMenu, c2 sees it, both after a restart and a relaunch.

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
