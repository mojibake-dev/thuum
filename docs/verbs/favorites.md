# Verb: favorites

From the roadmap and M1's persistence gaps. Every login loads a generated
save, and a player's favorites (the Q menu's items and magic, and their
hotkeys) live in the save, so they are empty every session and after every
server restart.

## Intent

The items and magic a player marked as favorites stay favorites across
reconnects and server restarts, hotkeys included, as in a single-player
save. Each player has its own.

Roadmap reference: skymp/ROADMAP.md "Favorites" ("When adding an item,
spell, etc. to your favorites, this should be saved when you reconnect");
docs/PLAN.md M1, persistence gaps
Milestone: M1   Class: A (a player's own state, recorded and imposed on its
own client)

## Authority

- **Marking: R2.** A favorite is the player's own preference; it changes
  only its menus and its eight hotkeys. The client reports the whole list
  after a menu where favorites change closes, and the server records it:
  - items: kept only while the player holds them in the server's inventory
    (R0 data, so this part is validated);
  - magic (SPEL, SHOU): recorded unvalidated beyond its form type. The
    server's spell list holds only spells learned through the server
    (MpActor::GetSpellList, MpActor.cpp:1023-1026, learnedSpells), not the
    starting spells, race powers or shouts a player's engine knows, so it
    cannot tell. A record grants nothing: the client's native favorites
    magic only when its engine knows it (Actor::HasSpell, HasShout);
  - any other form, and forms of the FF range (made in a session), are
    dropped.
- **The record: R0.** Each player's favorites, form and hotkey, in the
  player's change form; a kept report replaces it, so unmarking sticks.
- **The menus at login: R0 decision, R3 effect.** After a login, on the
  first movement (as in docs/verbs/map-markers.md), the server sends the
  record and the client's engine marks each entry.
- Why not R0: which items and magic a player marks is a choice in its own
  menus with nothing for the server to compute.
- Why not R2 unbounded: a record of items the player no longer holds would
  only grow; magic the player does not know must never become castable from
  a menu, which the client's check rules out.

## Engine surface

- **Items.** An item is a favorite when one of its inventory entry's extra
  lists carries ExtraHotkey (`InventoryEntryData::IsFavorited`,
  CommonLibSSE-NG src/RE/I/InventoryEntryData.cpp:208-211; extraLists at
  include/RE/I/InventoryEntryData.h:60). ExtraHotkey's `hotkey` is the slot,
  0 to 7, or -1 for a favorite with no hotkey (include/RE/E/ExtraHotkey.h:17,
  :25, :37). The engine marks and unmarks with
  `InventoryChanges::SetFavorite(entry, extraList)` and `RemoveFavorite`
  (include/RE/I/InventoryChanges.h:50, :53; src/RE/I/InventoryChanges.cpp:84-89,
  :105-110). The player's entries: `TESObjectREFR::GetInventoryChanges()`
  (include/RE/T/TESObjectREFR.h:405), entryList (InventoryChanges.h:63).
- **Magic.** `MagicFavorites`, a singleton (include/RE/M/MagicFavorites.h;
  src/RE/M/MagicFavorites.cpp; include/RE/Offsets.h:365-368) holds `spells`
  (the favorites, at 0x10) and `hotkeys` (at 0x28: the form bound to each
  slot, slot = index) (MagicFavorites.h:27-28), and marks with
  `SetFavorite(form)` and `RemoveFavorite(form)` (MagicFavorites.h:20-21).
  Whether the player knows a spell or a shout: `Actor::HasSpell`,
  `Actor::HasShout` (include/RE/A/Actor.h:574-575; src/RE/A/Actor.cpp:706-718).
- **How SKSE reads and writes them**, the reference for semantics (read as a
  map, not copied): `Game.GetHotkeyBoundObject(slot)` reads MagicFavorites'
  `hotkeys[slot]`, then the item whose ExtraHotkey holds the slot;
  `Game.IsObjectFavorited(form)` checks `spells` for magic and ExtraHotkey
  for items; `Game.UnbindObjectHotkey(slot)` clears `hotkeys[slot]` and sets
  the item's hotkey to -1; SKSE's own `MagicFavorites::SetHotkey` writes
  `hotkeys[slot] = form` directly once the form is a favorite (skse64 2.2.6
  src/skse64/skse64/PapyrusGame.cpp:655-715, GameData.cpp:128-166,
  GameData.h:566-582). Skyrim Platform exposes those three reads to scripts
  (skyrimPlatform.ts:2634, :2677, :2726) and has no setter, so this verb
  adds a native.
- **Address Library ids**, from CommonLibSSE-NG (AE ids: our runtime is AE),
  resolved on both lab versions with lab/addr.py on 2026-10-05:
  InventoryChanges::SetFavorite 16098, RemoveFavorite 16099,
  MagicFavorites::SetFavorite 52004, RemoveFavorite 52005, the
  MagicFavorites singleton 403337, Actor::HasSpell 38782, HasShout 38783.
- HYPOTHESIS: `SetFavorite(entry, nullptr)` on an entry with no extra list
  creates one carrying ExtraHotkey (the engine's own menu path; the native
  then sets its hotkey); MagicFavorites' layout on 1.7.104 matches the
  pinned CommonLib (0x10 and 0x28). The scenario reads favorites back
  through SKSE's functions, which SKSE maintains for each runtime, so a
  green run confirms both.

## Observe

- skymp5-client favoritesService.ts: on Skyrim Platform's `menuClose`
  (skyrimPlatform.ts:246, :626) for InventoryMenu, MagicMenu or
  FavoritesMenu (the three menus where a player marks favorites or binds
  hotkeys), it calls the new native `TESModPlatform.GetFavorites()` once and
  sends Favorites when the list differs from the last one it sent or
  received. One native call per menu close, filtered by menu name before
  anything else (rule 9).

## Impose

- After a login, on the first movement, the server sends Favorites with the
  record (items filtered to what the player holds now).
- The client cannot mark them at once: after the generated save loads, the
  client re-applies the player's inventory on an update timer
  (remoteServer.ts:79-92, every 5 s), and the first apply of a game session
  removes every item before adding the server's (sync/inventory.ts:322-339),
  so an item can be missing when the message arrives. favoritesService marks
  each entry with `TESModPlatform.SetFavorite(form, hotkey)`, keeps the ones
  that answer false (no such item yet) and retries them on later updates
  for 60 s, then drops them. The received list counts as sent, so it is not
  echoed back.

## Suppress

- Nothing.

## Message contract

- Favorites, MsgType 38, both directions (schema version 7): `entries`, up
  to 128 of `{form: u32, hotkey: i8}` (the form id as the sender knows it;
  hotkey -1 for none, 0 to 7 for the keys 1 to 8). Client to server: the
  player's favorites after a menu closed and they changed. Server to client:
  the record after a login. Validator, client to server: every hotkey in -1
  to 7 and no key twice, no form twice (E_VAL_RANGE); four at once, one a
  second after (E_VAL_RATE).

## Server

- Rust, wire-rules `favorites`: given the report's entries, each with what
  the C++ core knows of its form (an item held, an item not held, magic, or
  anything else), keep held items and magic, the first entry per form, the
  first claim per hotkey (a later claim keeps its entry with no hotkey), at
  most 128. Pure and unit tested.
- C++ core: OnFavorites classifies each form through the master files
  (record type) and the actor's inventory, asks the rule, and replaces the
  change form's `favorites` (form and hotkey per entry, absent in older
  records and read as none). After a login, on the first movement, the
  map-markers hook also sends Favorites with the record, through the same
  rule (an item sold since is left out).

## Client

- Skyrim Platform, TESModPlatform (PapyrusTESModPlatform.cpp, declared in
  psc/TESModPlatform.psc):
  - `GetFavorites() -> Int[]`: pairs of (form id, hotkey) for the player's
    favorite items (ExtraHotkey on an entry's extra list) and magic
    (MagicFavorites `spells`, hotkey = its index in `hotkeys`, else -1);
  - `SetFavorite(Form, Int hotkey) -> Bool`: marks an item the player holds
    (InventoryChanges::SetFavorite on its first extra list) or magic it knows
    (HasSpell or HasShout, then MagicFavorites::SetFavorite); then binds the
    hotkey, unbinding that key from any other item or magic first; false
    when the player holds no such item or does not know the magic.
- skymp5-client favoritesService.ts, as above; calls through
  `callNative`, like TimeService's SetGameDaysPassed.
- lab-driver: `favorite {form, hotkey}` stands in for the player's own
  marking (SetFavorite, the same native the login uses), and `favorites
  {ids}` reads through SKSE's `Game.isObjectFavorited` and
  `Game.getHotkeyBoundObject(0..7)`, never through the new native; lab-api
  reads it as `c.favorite(<form id>)`: the hotkey, -1 for a favorite
  without one, -2 for no favorite.

## Tests

- T0: wire-rules `favorites` (held and not held, magic and other kinds, a
  form twice, a key twice, the cap); wire-validate both ways; ctest: a
  report keeps held items and magic and drops the rest, a later report
  replaces the record, the change form round-trips, and a login sends the
  record without an item sold since.
- T2: a report with a key twice or a hotkey out of range changes nothing a
  client receives.
- T3 scenario `a-favorites`: c1 at first has no favorites; it marks the iron
  dagger (its kit holds one) on key 3 and the Flames spell (a starting
  spell) on key 1, then opens and closes its inventory; the server restarts
  and c1 relaunches; the dagger is a favorite on key 3 and Flames on key 1
  again, both read through SKSE.

## Dynamic plan (fill when any tag above is still HYPOTHESIS)

- If a-favorites' item check fails after the relaunch: lab-driver's dump of
  `GetFavorites()` before and after the client's retry window, and the
  client log's SetFavorite answers, tell an item that never arrived from a
  mark that did not take. If the mark did not take on an entry with no
  extra list, the native creates the extra list itself before the call.
- If the magic check fails: `Game.isObjectFavorited(Flames)` true but no
  hotkey seen through SKSE, or the reverse, means MagicFavorites moved on
  that runtime; the re-analyst reads MagicFavorites::SetFavorite (id 52004)
  on that program for the two arrays' offsets.

## Status

- [x] doc complete, rung declared
- [x] engine surface cited (two HYPOTHESIS tags the scenario settles)
- [ ] server logic + T0
- [ ] message + validator (same commit)
- [ ] native hook + T1 (no T1 harness yet; the scenario is the proof)
- [ ] TS handler
- [ ] T2 green
- [ ] T3 scenario green, no HYPOTHESIS tags
- [ ] ledger and suppression registry updated
