# Verb: alchemy-enchanting

Drafted 2026-10-31 from docs/VERB.md (pile item 14 of docs/private/turbo-2-prework.md: "alchemy and enchanting as crafting
transactions"). A design memo, not a build: the two benches make forms the inventory cannot carry, and that is the verb's whole
problem. From a code map of the fork at parity d10789f7: craftService.ts (the forge's transaction: the furniture's streak of
items leaving the player, then the product arriving, sent as CraftItem {workbench, craftInputObjects, resultObjectId}), the
server's recipe check against COBJ (unit/CraftTest.cpp: the forge, Dragonborn's and Hearthfires' recipes), and the inventory's
entry (Inventory.h: a base form id and a count, with optional extras: health, enchantmentId, chargePercent, soul, poisonId,
poisonCount; "Doesn't parse extra data currently" at :19).

## Intent

A potion brewed at an alchemy lab and an item enchanted at an arcane enchanter are the server's: made once, validated against the
ingredients or the soul gem the record holds, carried in the record's inventory, seen by every seat and kept across a restart,
as a forged sword is today.

Roadmap reference: skymp/ROADMAP.md "Alchemy" ("Ability to create potions"), "Enchantment" ("Ability to enchant and rename items.
Enchanting requires a soul stone filled by the player"), "Charge", "Picking up items" ("Take into account ExtraData ... impossible
without throwing away the corresponding items").
Milestone: M5   Class: B

## The problem (why this is a memo)

The forge's product is a game-file base (an Iron Sword 0x12eb7), so CraftItem names it and the record counts it. The two benches
make forms the engine INVENTS on the crafting seat:

- A brewed potion is a new ALCH form (a dynamic form id above 0xff000000 in that game alone) whose effects are the ingredients'
  shared effects with magnitudes from the brewer's Alchemy skill and perks. No other seat has that form; the record cannot name it
  by base id; a relaunch loses it (the save would carry it, but the server owns the inventory).
- An enchanted item is a base item plus an ExtraData enchantment: the player's custom enchantment is likewise a new ENCH form
  (one or two effects at chosen magnitudes, a charge), and the inventory's `enchantmentId` extra can only point at a form every
  seat knows. Renaming is an ExtraData text.

So "the menu's result reported, the server validates and writes the product" needs a product the server can write. Three ways:

- A) Mint on the server. The crafting seat reports the recipe (the ingredients, or the base item, the soul gem and the chosen
  effects with their magnitudes); the server validates the inputs against the record, computes the product's effects by the
  game's formulas (alchemy: UESP's potion strength from the Alchemy skill, the Alchemist and school perks, the ingredients'
  effect base costs; enchanting: the Enchanting skill and perks, the soul's size), takes the inputs from the record and writes
  a MINTED FORM into a new server table (a server-wide id in a reserved range, its effects and magnitudes, its name), relayed
  to every seat as a new S2C message (MintedForm) and created there as a dynamic form (Skyrim Platform can create a potion from
  effects? no native does; an ALCH must come from a plugin or be cloned from a template record and edited through the platform's
  form API, which exists for some types). The record's entry then names the minted id. Honest, heavy: a new form family on the
  wire, the formulas on the server, a creation path on every seat.
- B) Templates. Ship a plugin (the lab's layer, as a Creation) with a grid of pre-made potions and enchantments (each effect at
  a few magnitude steps) and map the player's brew or enchantment to the nearest template: the product is then a game-file base
  every seat knows, the inventory carries it as it does a forged sword, and the server validates the inputs as the forge's path
  does. Loses the exact magnitudes (rounded to the grid) and the custom name; gains everything else for the price of a plugin
  and a mapping table. The enchantment's charge rides the existing `chargePercent` extra.
- C) Local only. The products stay the crafting seat's own (as today), the record never learns them, and the checklist says so:
  a potion brewed is drunk on that seat in that session, an enchanted blade is a plain blade to the server (its damage formula
  reads the base). Nothing to build; the limit named.

## Recommendation

C for turbo 2 (nothing to build, the limit in the checklist), B as the verb's build after: it fits the inventory the server has
(base ids and the extras it already carries), the forge's transaction shape (CraftItem's inputs and a result base) and the lab's
layer model (one plugin, versioned, laid by persist-mods). A as the later refinement only if the grid's rounding shows in play.
Under the pass's rule the call is C now with B drafted; recorded in LOG. Not relitigated here: the inventory stays base ids plus
the extras upstream defined.

## Inventory (ADR-031), for B

| consequence | seen in | disposition |
| --- | --- | --- |
| the ingredients leave the player's inventory at the brew; the soul gem and the base item at the enchant | engine (the menu) | R1 the report (CraftItem's streak, the two benches' furniture), R0 the write: the server takes them from the record as the forge does |
| the product in the player's inventory | engine (a dynamic form) | imposed: the template base nearest the product, written to the record and set on the seat (the dynamic form removed by the client) |
| the product's effects when used (a potion drunk, an enchanted hit) | engine, from the template base | native on every seat that holds the base |
| the custom name | engine (ExtraData) | lost in B (the template's name); a later extra on the entry |
| the skill experience of the brew or the enchant | engine | leveling's SkillUse hook (Alchemy 16, Enchanting 23) carries it as any use |
| the enchantment's charge | engine (ExtraData) | the entry's chargePercent extra, as today |

## Authority

Rung (B): R1 for the report (the crafting seat's menu result), R0 for the inputs' check and the product's write.
What the server validates: the inputs held (counts), the bench's furniture within reach, the mapping's template a legal product
of those inputs (an effect the ingredients share; an enchantment the soul can carry).

## Engine surface

- The forge path: craftService.ts, CraftItemMessage.h, ActionListener's craft handler, CraftTest.cpp; Inventory.h's extras.
- Records: ALCH (the potions), ENCH (the enchantments), INGR (the ingredients' four effects), SLGM (the soul gems), the benches
  FURN with their keywords (CraftingAlchemy? the WorkbenchData's bench type); UESP "Skyrim:Alchemy" and "Skyrim:Enchanting" for
  the formulas (for A).
- Skyrim Platform: the containerChanged event the forge path uses; no native creates an ALCH or ENCH.

## Tests (B)

- T0: the mapping (a brew of two ingredients to its template; an unmappable brew refused), the inputs' check; CraftTest gains the
  two benches.
- T3 scenario id: lab/scenarios/p-craft-restart.yaml (M5's exit, the forge today) gains the two benches; probe x-bench-brew by
  path first (the menu's result reported, the template on the seat, the dynamic form gone).

## Status

- [x] doc complete, inventory listed with a disposition per row, rung declared (a memo: the call C now, B drafted)
- [x] engine surface cited or delegated (the code map of 2026-10-31)
- [ ] server logic + T0
- [ ] message + validator (same commit)
- [ ] native hook + T1
- [ ] TS handler
- [ ] T2 green
- [ ] T3 scenario green, no HYPOTHESIS tags
- [ ] parity scenario green, or its later list reviewed with it (ADR-031)
- [ ] sequences and combinations green, every checklist item with its scenario (ADR-033)
- [ ] ledger and suppression registry updated
