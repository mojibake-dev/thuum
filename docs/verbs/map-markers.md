# Verb: map-markers

From the roadmap and M1's persistence gaps. Every login loads a generated
save that has discovered nothing, so a player's map, and with it fast
travel, starts empty every session and after every server restart.

## Intent

The locations a player has discovered stay discovered: across reconnects
and server restarts, a player's map shows the markers it found, with fast
travel to the ones the game allows, as in a single-player save. Each player
has its own map; nobody discovers anything for anyone else.

Roadmap reference: skymp/ROADMAP.md "Markers" ("Locations that have been
visited must be saved on the server"); docs/PLAN.md M1, persistence gaps
Milestone: M1   Class: A (a fact the server holds per player, imposed on its
own client)

## Authority

- **Discovery: R1.** The player's engine decides that a location is
  discovered, as in single player; its client reports it. The server
  decides which marker that was from its own facts (the master files and
  the player's recorded position), checks it lies within discovery range,
  and records it. The client never names a marker.
- **The record: R0.** Each player's discovered markers, and whether each
  allows fast travel, are server state in the player's record, persisted
  with it, so a restart keeps them.
- **The map at login: R0 decision, R3 effect.** After a login the server
  tells the client's engine to show each recorded marker
  (`ObjectReference.AddToMap`); the engine draws the map.
- Why not R0 for discovery: the engine's discovery rule (which marker, from
  how far) is the engine's to run, and the design law says we do not
  reimplement what a host runs for us; validating its report is enough.
- Why not R2: an unvalidated report would let a client claim the whole map,
  and fast travel is movement.
- Out of scope, next verbs: validating a fast travel itself (its
  destination must be a recorded marker that allows travel, which is why
  the record keeps that flag). SkyMP turns fast travel off on every frame
  today (skymp5-client disableFastTravelService.ts,
  `Game.enableFastTravel(false)`), so the flag shows on the map and waits
  for that verb to replace the service with a validated path; markers revealed by quest scripts on the
  server (`ObjectReference.AddToMap` as a server native: which player a
  quest reveals for is a question of its own).

## Engine surface

- **What a discovered marker is.** A map marker reference carries
  ExtraMapMarker, whose MapMarkerData holds the flags kVisible (1 << 0),
  kCanTravelTo (1 << 1) and kShowAllHidden (1 << 2), and the marker's type
  (CommonLibSSE-NG include/RE/E/ExtraMapMarker.h:84-95, :101-105, :109-123).
  Discovered means kVisible; fast travel needs kCanTravelTo.
- **The discovery event.** `LocationDiscovery::Event` carries the
  MapMarkerData and the worldspace id, and no reference
  (include/RE/L/LocationDiscovery.h:9-21). Skyrim Platform already sinks it
  as the `locationDiscovery` event with worldSpaceId, name, markerType,
  isVisible, canTravelTo and isShowAllHidden
  (skyrim-platform/src/platform_se/skyrim_platform/EventHandler.cpp:2333-2366;
  typings codegen/convert-files/skyrimPlatform.ts:507-513, :818). So the
  client knows the type and the flags, not which reference.
- **Showing a marker.** Papyrus `ObjectReference.AddToMap(abAllowFastTravel)`
  (skyrimPlatform.ts:1768), and to read back `isMapMarkerVisible()` (:1851)
  and `canFastTravelToMarker()` (:1772).
- **The master files.** Every map marker reference has the base STAT
  0x00000010 "MapMarker" (Skyrim.esm, lab/esm.py, 2026-10-05). libespm
  already parses a reference's marker fields: FULL name (an lstring), FNAM
  flags and TNAM type (skymp/libespm/include/libespm/REFR.h:32-50, :119-126;
  src/REFR.cpp:42-46). The marker nearest the lab spawn is REFR 0x00016223
  at (133093, -54772, 9103) in Tamriel (0x3c), 6,404 units from lab-spawn's
  origin (lab/esm.py near, 2026-10-05).
- UNKNOWN, for the re-analyst once sky-re can run (it needs the clients
  down): the engine's discovery rule (a distance per marker, a game
  setting, line of sight); whether AddToMap fires LocationDiscovery; whether
  AddToMap at login shows a HUD message per marker.

## Observe (host or acting client sees the intent before the engine acts)

- The client listens to `locationDiscovery` and sends MapMarkerDiscovered
  with the event's markerType and canTravelTo. Nothing else: the server
  finds the marker.
- HYPOTHESIS: the discovered marker is the nearest marker of that type in
  the player's worldspace. Two markers of one type close together could
  make it pick wrong; the lab measures how close discovery happens (Dynamic
  plan).

## Impose (observers render the server's decision)

- After a login, on the player's first movement report: one SpSnippet per
  recorded marker, `ObjectReference.AddToMap(canTravel)` with the marker as
  self. No new message for it, as with StartCombat and AddSpell
  (docs/verbs/hostility-sync.md, docs/verbs/sleep.md). Why the first
  movement: the markers must land in the world the player will play in. A
  fresh launch logs in from the main menu and loads a generated save after
  the login; a reconnect from in game keeps its world and only moves the
  player (skymp5-client remoteServer.ts, CreateActor isMe). The client runs
  a snippet on its next in-game `update` (spSnippetService.ts:22), which
  covers both today, but a client reports movement only once its own actor
  stands in the loaded world, so waiting for it does not depend on the
  client's menus. SetUserActor sets the pending flag, OnUpdateMovement takes
  it.
- Other players see nothing: a map is its owner's.

## Suppress (engine's own behavior blocked on non-hosts)

- Nothing. The engine's own discovery runs on the discovering client as in
  single player, and other clients never discover for it.

## Message contract

- MapMarkerDiscovered, client to server, wire-schema (schema version 5):
  - `markerType: u16`: the event's markerType, a MARKER_TYPE (CommonLib
    ExtraMapMarker.h:9-79);
  - `canTravel: bool`: the event's canTravelTo.
- Validator: markerType a type the master files use (1 to 59, or 64 and 65
  are not discoveries, so refused); reliable ordered; at most a few a
  second per client (discoveries are rare; a flood is refused).
- Idempotent: a marker already recorded is recorded again with the wider
  of the two travel flags.
- Reason codes: E_MARKER_TYPE (not a discoverable type), E_MARKER_NONE (no
  marker of that type within range of the player), E_MARKER_RATE.

## Server

- Rust, wire-rules `markers`: from the player's position and the markers
  of that type in its worldspace (gathered by the core from libespm),
  choose the nearest within the discovery range, or refuse. Pure and unit
  tested, like `rest` and `hostility`.
- C++ core: OnMapMarkerDiscovered gathers the facts, records the marker on
  MpActor (refr id and travel flag) in the actor's change form, so the
  database keeps it; at login, sends the AddToMap snippets.
- Range bound: HYPOTHESIS until measured (Dynamic plan), then the measured
  distance plus room for a stale position, as melee reach does.

## Client

- skymp5-client: a handler for `locationDiscovery` that sends
  MapMarkerDiscovered. Nothing at login: the snippets do it.
- skymp5-client mapMarkersService.ts: `locationDiscovery` sends
  MapMarkerDiscovered (markerType, canTravelTo).
- lab-driver: a `markers {ids: [...]}` step reports isMapMarkerVisible and
  canFastTravelToMarker per reference; lab-api reads it as
  `c.marker(<form id>).visible` and `.canTravel` (docs/LAB.md).

## Tests

- T0: wire-rules `markers` (nearest of the type, out of range, wrong
  worldspace, idempotent travel flag); ctest: the record survives a save
  and load of the change form, and a login sends one snippet per marker.
- T2: a difftest session where a fakeclient reports a discovery near
  0x00016223, the server restarts, and the login carries the snippet.
- T3 scenario: `a-map-markers`. c1 goes to REFR 0x00016223 and its engine
  discovers it; the server records it; the server restarts, and c1 quits
  the game and starts it again (lab-api's `relaunch`: a reconnect would keep
  the old world, so only a relaunch shows a fresh save); then
  `c1.marker(0x00016223).visible` holds, where before the verb a fresh save
  shows nothing.

## Dynamic plan (fill when any tag above is still HYPOTHESIS)

1. Discovery range: c1 teleports toward 0x00016223 at 5000, 3000, 2000,
   1000 and 500 units, with the driver logging each `locationDiscovery`.
   Expected: one event at some distance; that distance sets the range.
2. AddToMap at login: one recorded marker, then fifty. Screenshot after the
   login; note any HUD message per marker and how long fifty take.
3. AddToMap(true) then canFastTravelToMarker() on the same reference:
   expected true.

## Status

- [x] doc complete, rung declared
- [x] engine surface cited or delegated (three UNKNOWNs for the re-analyst)
- [x] server logic + T0 (fork m1-map-markers 151d04ec; ctest green in pipeline 770, job 3326: 272 test cases)
- [x] message + validator (same commit: fork 61ba659d, schema 5)
- [x] native hook + T1: none needed, Skyrim Platform's own event and natives
- [x] TS handler (fork 47853c52)
- [ ] T2 green
- [ ] T3 scenario green, no HYPOTHESIS tags
- [ ] ledger and suppression registry updated
