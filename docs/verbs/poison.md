# Verb: poison

## Intent

A poison put on a weapon is the server's: it sits on that weapon in the
server's inventory with its charges, and a hit with the weapon applies the
poison's effects to the target through the server's effect rule and spends a
charge, the attacker's game and the target's agreeing.

Roadmap reference: skymp/ROADMAP.md "Picking up items" ("Take into account
ExtraData (charm, poison, etc. ...)") and "Magic effects".
Milestone: M2 (docs/PLAN.md M2 3a, split from magic-effects on 2026-10-10)
Class: B

## Authority

Rung: R0 for the poison's charges and its effects; R2 for the moment the
player poisons a weapon.
- The player's game poisons the weapon (its own confirmation box, then the
  engine's ExtraPoison on the weapon's stack) and reports it; the server
  records the poison on the weapon the player holds, from the item in the
  server's inventory (refused without one).
- The charges and every hit's effect are the server's: a hit with a weapon
  the server holds poisoned applies the poison's effects to the target
  (magic-effects' rule, ADR-028) and spends one charge; the owner's game is
  told its inventory, so its ExtraPoison agrees.
Why not R0 for the poisoning itself: the confirmation is a menu in the
player's game; the server can only check that the poison and the weapon are
the player's.
Rate limit / bounds: OnEquip's budget (magic-effects: sixteen at once,
eight a second); one charge per hit.

## Engine surface

- The poison on a weapon in memory: ExtraPoison (CommonLibSSE-NG
  include/RE/E/ExtraPoison.h:18): the poison and its count.
- The client already copies it: skymp5-client sync/inventory.ts:173-174 and
  :443-444 read and write an entry's poison; the server's Inventory entry
  has poisonId and poisonCount (Inventory.h:44-58), wire-schema's Entry the
  same (skymp.rs:117-120); the server never reads them.
- How the player's game reports a poisoning: Skyrim Platform's `equip` on
  the player with the poison (sendInputsService.ts:54-76, OnEquip):
  HYPOTHESIS. x-poison-probe (20261010-135426) found that Papyrus EquipItem
  of a poison opens the game's own box, "Do you want to poison the Steel
  Sword?", which no lab input answers, and the open box swallowed the swing:
  nothing measured.
- Which hand and how many charges without perks: HYPOTHESIS (the right
  hand's weapon, one charge; the Concentrated Poison perk doubles them, per
  UESP's Alchemy perks, unread here).
- A hit's poison in the attacker's game: the engine applies it to the
  target's figure there, which lands nothing a player's game counts (a
  figure's game shows the server's numbers); the server's hit path is the
  one that counts.

## Observe (host or acting client sees the intent before the engine acts)

- Hook point: the `equip` event for a poison (as magic-effects' drinks);
  OnHit for the hit (as now).
- SP filter: the player's own equips.
- Data captured: the poison's form id, then each hit's weapon.
- Side effects of hooking here: none new.

## Impose (observers render the server's decision)

- Mechanism: the target's ChangeValues and MagicEffects (the poison's
  effects running, magic-effects' path); the owner's inventory after each
  charge spent (its ExtraPoison through sync/inventory.ts).
- Visual without simulation achieved by: the poison's hit shader on the
  target from MagicEffects.
- Side effects: HYPOTHESIS (the attacker's game showing its own poison on
  the figure as well).

## Suppress (engine's own behavior blocked on non-hosts)

- What is suppressed: a poison landing on the player from another's game
  already lands nothing (magic-effects: the player's AddTarget refuses an
  alchemy item's effects while skymp5-client blocks them).
- How: magic-effects' hook.
- Release condition: none.
- Side effects: none new.

## Message contract

- No new message: OnEquip in; ChangeValues, MagicEffects and the inventory
  out.
- Validator rules: unchanged.
- Idempotency / ordering: a charge spent once per hit the server takes.
- Contract doc updated: no change.

## Server

- Where the logic lives: the C++ core's OnEquip (a poison: on the weapon in
  the hand the playtest shows, its count by the record and later perks) and
  OnWeaponHit (a poisoned weapon's hit: magic-effects' ApplyEffects with
  the poison's effects and the attacker as caster, then a charge spent);
  a Rust rule only if the charges grow rules of their own.
- DB fields / migration: none (the inventory entry already has poisonId
  and poisonCount; restart-persistent through the inventory).
- Restart behavior: a poisoned weapon stays poisoned with its charges.
- Papyrus natives touched: none.

## Client

- SP binding: none new.
- TS handler: none new (inventory sync carries the poison).
- Kill switch config key: magic-effects' (magicEffects).

## Tests

- T0: the server (a poison's OnEquip puts it on the held weapon with its
  charge; refused without the poison or a weapon; a hit with the poisoned
  weapon applies the poison's effects to the target and spends the charge;
  a second hit applies nothing; the poison and its charges survive a
  reload of the change form).
- T1: none.
- T2: a difftest session: c1 equips a poison, then hits c2: the legacy
  server drank the poison and ignores the weapon's; the fixed server
  poisons the weapon and applies it on the hit. Declared.
- T3 scenario id: lab/scenarios/b-poison.yaml (once the playtest shows how
  the lab can poison a weapon without the box: the driver could set the
  stack's ExtraPoison directly, as the engine does after the box).
- Assertions that would fail if the verb silently regressed: the target's
  health over the poison's duration on both sides; the charge spent on the
  server and in the attacker's game (c.poison).

## Dynamic plan (fill when any tag above is still HYPOTHESIS)

- Playtest thirteen's poison section (docs/private/playtest-m2-13.md): Eli
  applies DB03Poison (Skyrim.esm 0x58CFB, 6 a second for 10 s) to test 2's
  Steel Sword (0x13989) by hand; `just probe-poisons c2` reads the sword's
  ExtraPoison (the hand, the count) before and after one hit on test 1; he
  reports test 1's health; the server log shows whether the client sent
  OnEquip for the poison.
- Owner: Eli (the box), then agent.

## Status

Doc written 2026-10-10, split from magic-effects (whose Dynamic plan held
the poison until then); blocked on playtest thirteen (CLAUDE.md rule 8).

- [ ] doc complete, rung declared
- [ ] engine surface cited or delegated
- [ ] server logic + T0
- [ ] message + validator (same commit)
- [ ] native hook + T1
- [ ] TS handler
- [ ] T2 green
- [ ] T3 scenario green, no HYPOTHESIS tags
- [ ] ledger and suppression registry updated
