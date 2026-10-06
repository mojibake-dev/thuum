# Verb: learned-effects

From the roadmap and M1's persistence gaps. Every login loads a generated
save, and an ingredient's known effects live in the save, so a player
relearns every ingredient each session and after every server restart.

## Intent

The ingredient effects a player has learned stay learned: across reconnects
and server restarts, its inventory and alchemy menus show the effects it
found, as in a single-player save. Each player knows its own; nobody learns
anything for anyone else.

Roadmap reference: skymp/ROADMAP.md "Effects learning" ("When eating an
ingredient, the character learns its effects, this information should not
be reset"); docs/PLAN.md M1, persistence gaps
Milestone: M1   Class: A (a fact the server holds per player, imposed on its
own client)

## Authority

- **Learning: R2, bounded.** The player's engine decides what eating teaches:
  the first unknown effect, or more with the Experimenter perk, which only
  the client's engine knows until M5 moves perks to the server. Its client
  reports the ingredient's known effects after the engine changed them. The
  server records the report only when that player just ate that ingredient
  (the server sees the eat: MpActor::EatItem), and only adds effects, never
  removes them. A report without a matching eat is refused.
- **The record: R0.** Each player's known effects per ingredient, a four-bit
  mask, in the player's change form, persisted with it.
- **The menus at login: R0 decision, R3 effect.** After a login the server
  has the client's engine learn each recorded effect
  (`Ingredient.LearnEffect(index)` snippets, after the first movement as in
  docs/verbs/map-markers.md).
- Why not R0 for learning: the Experimenter perk's extra effects are the
  client's until M5; computing only the first effect would lose them.
- Why not R2 unbounded: a client could otherwise claim every effect of
  every ingredient, which is alchemy knowledge the game makes the player
  earn.
- Out of scope: learning by alchemy (SkyMP has no alchemy yet, roadmap
  "Alchemy"); the verb records it the same way once potions are made on
  the server.

## Engine surface

- **Where it lives.** `IngredientItem::GameData` holds `knownEffectFlags`
  (16 bits, one per effect, an ingredient has four) and `playerUses`; the
  save keeps them under change flag kIngredientUse (CommonLibSSE-NG
  include/RE/I/IngredientItem.h:39-44, :65-72, gamedata at :109). They are
  the ingredient form's, not the player's: one player per client game, so
  per player in multiplayer.
- **Learning.** `IngredientItem::LearnEffect(index)`, `LearnNextEffect()`
  and `LearnAllEffects()` (IngredientItem.h:102-105); Skyrim Platform exposes
  them as Papyrus `Ingredient.learnEffect(aiIndex)`,
  `learnNextEffect()`, `learnAllEffects()` and the read
  `getIsNthEffectKnown(index)` (skyrimPlatform.ts:2791-2801).
- **Eating.** The server handles an ingredient eaten from the inventory in
  MpActor's equip path (MpActor.cpp:526-528) and fires EatItemEvent
  (MpActor.cpp:1157-1163).
- UNKNOWN: whether the engine learns the effect before or after the equip
  event (the client waits two seconds for the mask to settle, so either
  works); the number of effects Experimenter teaches per rank (the client
  reports what its engine learned, so the server needs no number).

## Observe

- skymp5-client already reports every equip of the player's, ingredients
  included, as OnEquip (sendInputsService.ts:34-53), and the server eats the
  ingredient from that (MpActor's equip path). The new service listens to
  the same `equip` event (Skyrim Platform EquipEvent: actor, baseObj;
  skyrimPlatform.ts:229, :611); for an ingredient it reads
  `getIsNthEffectKnown(0..3)` on each update for two seconds (whether the
  engine learns before or after the event is UNKNOWN, so it waits for the
  mask to settle) and sends IngredientEffectsKnown {ingredient, mask} when
  the mask grew past what it last sent.

## Impose

- After a login, on the first movement: `Ingredient.LearnEffect(i)` for each
  recorded effect bit, one snippet each, with the ingredient as self.

## Suppress

- Nothing.

## Message contract

- IngredientEffectsKnown, client to server (schema version 6): `ingredient:
  u32` (the INGR form id), `mask: u8` (bits 0 to 3). Validator: mask within
  four bits; a small rate budget. Server: the form is an INGR, the player
  ate it within a few seconds, and the mask adds to what is recorded.

## Server

- Rust, wire-rules `effects`: a report is kept when the player ate that
  ingredient within EAT_WINDOW_MS (10 s, the client's two-second settle plus
  room for a slow update), and the recorded mask becomes the union of the
  two; a report that adds nothing changes nothing. Pure and unit tested.
- C++ core: MpActor remembers the last ingredient it ate and when (set in
  EatItem, never persisted). OnIngredientEffectsKnown checks the form is an
  INGR in the master files, asks the rule, and records the mask in the
  actor's change form (ingredientEffects: ingredient and mask per entry,
  absent in older records and read as none). After a login, on the first
  movement, the map-markers hook also sends `Ingredient.LearnEffect(i)` for
  each recorded bit (docs/verbs/map-markers.md, Impose).

## Client

- skymp5-client ingredientEffectsService.ts, as above.
- lab-driver: a `known {ids}` step reads getIsNthEffectKnown(0..3) per
  ingredient; lab-api reads it as `c.known(<form id>)`, the mask.

## Tests

- T0: wire-rules `effects` (inside and outside the window, union, nothing
  new); ctest: an eat then a report records the mask, a report without an eat
  or for another ingredient records nothing, the change form round-trips,
  and a login sends one LearnEffect per bit.
- T2: a report with no eat changes nothing a client receives.
- T3 scenario `a-learned-effects`: c1 is given an ingredient and eats it;
  its first effect is known; the server restarts and c1 relaunches far from
  anything; the effect is still known, taught by the server.

## Status

- [x] doc complete, rung declared
- [x] engine surface cited or delegated (two UNKNOWNs the design does not depend on)
- [x] server logic + T0 (fork b56f18bf; ctest LearnedEffectsTest green in
      pipeline 790)
- [x] message + validator (same commit, fork 604a2d30, MsgType 37)
- [x] native hook + T1: none needed, Skyrim Platform has the Papyrus calls
- [x] TS handler (fork 315861c2, c8f76a58)
- [ ] T2 green
- [ ] T3 scenario green, no HYPOTHESIS tags
- [x] ledger and suppression registry updated (Ingredient.LearnEffect's row;
      nothing suppressed)
