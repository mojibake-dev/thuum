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
  that skymp5-client reports (the order decides when the client reads the
  flags); the number of effects Experimenter teaches per rank (UESP,
  Skyrim:Alchemy perks, to cite when the verb lands).

## Observe

- skymp5-client: after the player eats an ingredient (the equip it already
  reports), on the next update, read `getIsNthEffectKnown(0..3)` and send
  IngredientEffectsKnown {ingredient, mask} when the mask grew.

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

## Server, client, tests

- To fill in when the verb starts, after map-markers lands: its login
  imposition and change-form pattern are the ones this verb reuses.

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
