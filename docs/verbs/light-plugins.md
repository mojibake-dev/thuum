# Verb: light-plugins

## Intent

The server loads light (ESL) plugins and gives their records the form ids
the engine gives them, so an item, a head part or any record from a light
plugin exists server-side, persists, and means the same form on every
client.

Roadmap reference: none (Eli, 2026-10-07: "we want ESL plugins for SURE";
found with rotfern's outfit, whose scarf is Lowered Fur Hoods', a light
plugin)
Milestone: M1   Class: A

## Authority

Rung: R0. The server reads the game files and decides what a form id
means; clients match its load order or are told they do not.
Why not lower: a record the server cannot resolve cannot be validated,
recorded or persisted (rule 5); today every light plugin's items vanish on
the server and its head parts would refuse a look (ADR-026).
What the server validates: a client's load order against its own, full
and light plugins alike (name, size, CRC32), as SkyMP already does for full
plugins.
Bounds: the engine's own: at most 4096 light plugins, at most 4096 records
each (local ids 0x000 to 0xFFF).

## Engine surface

- A light plugin is a TES4 with record flag `kSmallFile` (1 << 9), or a file
  the engine loads as one (`.esl`): CommonLibSSE-NG
  include/RE/T/TESFile.h:48 (`RecordFlag::kSmallFile`), :63 (`IsLight`).
- Its forms' ids: `0xFE000000 | smallFileCompileIndex << 12 | local`, where
  local is 12 bits; a full plugin's: `compileIndex << 24 | local` with 24
  bits: TESFile.h:61 (`GetPartialIndex`), src/RE/T/TESFile.cpp:33-42
  (`IsFormInMod`), src/RE/T/TESDataHandler.cpp:40-57 (`LookupFormID`).
- A record's references inside its own file are raw: the top byte indexes
  the file's master list, the file itself last; the engine maps each to the
  master's runtime numbering (TESDataHandler.cpp:58-87,
  `LookupFormIDRaw`, which counts light and full masters separately).
- Light and full plugins are numbered separately, each in load order:
  `compileIndex` counts full plugins, `smallFileCompileIndex` light ones
  (TESDataHandler.h:34, `TESFileCollection::smallFiles`). HYPOTHESIS until
  the lab reads a client's light plugin list (SKSE Game.GetLightModCount and
  GetLightModName) against its plugins.txt: that the engine assigns
  `smallFileCompileIndex` in the order plugins.txt and Skyrim.ccc load them,
  the Creation Club light plugins among them.
- No Address Library ID is needed: the server reads files, and the client
  reads its own load order through SKSE's Papyrus natives.

## Observe (host or acting client sees the intent before the engine acts)

- Hook point: none; the client's load order is read once at login
  (skymp5-client LoadOrderVerificationService).
- SP filter: none.
- Data captured: the client's light plugins, in order, with size and CRC32,
  next to its full ones (Game.GetLightModCount, Game.GetLightModName).
- Side effects of hooking here: none (no hook).

## Impose (observers render the server's decision)

- Mechanism: the server's form ids are the engine's, so every message that
  names a form (inventory, equipment, appearance, looks) already means the
  same form on the client.
- Side effects: none expected.

## Suppress (engine's own behavior blocked on non-hosts)

- Nothing.

## Message contract

- No new message. The server manifest (skymp5-server manifestGen.ts) lists
  the light plugins in the server's load order like the full ones; each
  entry gains `light: bool` so a client compares like with like.
- Validator rules: none on the wire (HTTP manifest).
- Contract doc updated: when the manifest changes.

## Server

- Where the logic lives: libespm (the C++ core's file reader): the
  per-file id mapping (`IdMapping`, `utils::GetMappedId`) learns the
  engine's light numbering, the combiner numbers full and light plugins
  separately, the loader reports which files are light; the server's
  plugin list (`WorldState::espmFiles`) carries the same flags, and
  `FormDesc` turns ids into "file:local" descriptors and back with them.
  The C++ core keeps this; nothing here is a game rule (ADR-020).
- DB fields / migration: none. A record's forms are kept as descriptors
  ("<local>:<file>"), which name the file, not its index: a light plugin's
  form keeps its descriptor when the load order changes, as a full one
  does.
- Restart behavior: unchanged; the scenario proves an item from a light
  plugin survives one.
- Papyrus natives touched: none.

## Client

- SP binding: none new (SKSE's Game.GetLightModCount and GetLightModName,
  through Skyrim Platform's Papyrus bindings).
- TS handler: LoadOrderVerificationService compares light plugins as it
  compares full ones.
- Kill switch config key: the existing `ignoreLoadOrderMismatch`.

## Tests

- T0: libespm maps a fixture light plugin's records to `0xFE000000 |
  index << 12 | local`, a full plugin's after it still to its full index,
  references from a light plugin to its full master and from a full plugin
  to a light master both ways (`GetMappedId` with the combined and the raw
  mapping), and `FormDesc` round trips for both. The fixtures are two tiny
  plugins the repo owns, written by a script in the test tree (no game
  content).
- T1: none.
- T2: a difftest session gives and equips the fixture's item.
- T3 scenario id: lab/scenarios/a-light-plugin.yaml: c1 is given an item
  from a light plugin in the lab's set, equips it, c2 sees it worn; the
  server restarts and c1 relaunches; the item is still in c1's inventory
  and worn.
- Assertions that would fail if the verb silently regressed: the item's
  base id in the server's inventory record (labState) is the client's own
  form id for it, and it is there after the restart.

## Dynamic plan (fill when any tag above is still HYPOTHESIS)

- A lab probe reads Game.GetLightModCount and each GetLightModName on a
  clone and compares the list with its plugins.txt and Skyrim.ccc order.
- Owner: agent.

## Status

- [ ] doc complete, rung declared
- [ ] engine surface cited or delegated
- [ ] server logic + T0
- [ ] message + validator (same commit)
- [ ] native hook + T1
- [ ] TS handler
- [ ] T2 green
- [ ] T3 scenario green, no HYPOTHESIS tags
- [ ] ledger and suppression registry updated
