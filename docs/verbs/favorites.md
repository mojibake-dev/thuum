# Verb: favorites

From the roadmap and M1's persistence gaps. Every login loads a generated
save, and a player's favorites (the Q menu's items and spells, and their
hotkeys) live in the save, so they are empty every session and after every
server restart.

## Intent

The items and spells a player marked as favorites stay favorites across
reconnects and server restarts, hotkeys included, as in a single-player
save. Each player has its own.

Roadmap reference: skymp/ROADMAP.md "Favorites" ("When adding an item,
spell, etc. to your favorites, this should be saved when you reconnect");
docs/PLAN.md M1, persistence gaps
Milestone: M1   Class: A (a player's own state, recorded and imposed on its
own client)

## Authority (proposed)

- **Marking: R2.** Marking a favorite is the player's own preference with no
  game effect beyond its menus; the client reports its favorites and the
  server records them, bounded to items the player holds and spells it
  knows (the server has both).
- **The record: R0**, in the player's change form; **the menus at login:
  R0 decision, R3 effect.**

## Engine surface

- Items: `InventoryChanges::SetFavorite(InventoryEntryData*,
  ExtraDataList*)` and `RemoveFavorite(...)` (CommonLibSSE-NG
  include/RE/I/InventoryChanges.h:50, :53); `InventoryEntryData::IsFavorited()`
  (InventoryEntryData.h:47).
- Spells: `MagicFavorites` (include/RE/M/MagicFavorites.h).
- Skyrim Platform has only the read, Papyrus `Game.isObjectFavorited(Form)`
  (skyrimPlatform.ts:2677). There is no call that sets a favorite, so this
  verb needs a native: a Skyrim Platform function that sets or clears a
  favorite (items through InventoryChanges, spells through MagicFavorites),
  in the fork's skyrim-platform, with its T1 check. The first M1
  persistence verb with native code.
- UNKNOWN: where hotkeys live (an ExtraDataList entry on the item, and
  MagicFavorites' hotkeys for spells, to read in CommonLib when the verb
  starts); whether SetFavorite on an item the player just received works
  before the inventory menu has been opened once.

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
