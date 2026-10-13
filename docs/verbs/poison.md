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
- How the player's game poisons a weapon (the re-analyst, 2026-10-12,
  scratchpad poison-re.md; read in 1.7.104's bodies under the same Address
  Library ids, since the project's 1.6.1170 program is still
  SteamStub-wrapped at rest; 1.6.1170's unwrapped sections agree on every
  function size checked). Each step HYPOTHESIS until a Frida trace on
  1.6.1170; the lab has since CONFIRMED the right hand, the one dose, the
  event with no equip event and the hook point (Measured, below), and
  PoisonObject's arguments stay HYPOTHESIS (a person's Yes under the
  watching trace, playtest fifteen):
  - Using a poison runs the per-form-type use switch (Address Library
    38001), whose ALCH case opens the box (40481) and skips its equip
    event: the engine sends no TESEquipEvent for a poison, so Skyrim
    Platform's `equip`, which OnEquip rides (sendInputsService.ts:54-76),
    never fires. That is why the server heard nothing in playtest fourteen.
  - The box's callback (40482) on Yes calls InventoryEntryData::PoisonObject
    (16024; CommonLibSSE-NG include/RE/I/InventoryEntryData.h:54,
    src/RE/I/InventoryEntryData.cpp:259-264) on the right hand's equipped
    entry only (a left-hand weapon alone gets "You must first equip a
    weapon"), adding an ExtraPoison (include/RE/E/ExtraPoison.h:18) to the
    entry's first ExtraDataList; then RemoveItem of one poison, and an empty
    PoisonedWeapon::Event (include/RE/P/PoisonedWeapon.h) through 41044 from
    the source 41069 returns.
  - Doses: 1, through the kModPoisonDoseCount perk entry point
    (include/RE/B/BGSEntryPoint.h:96), floored, never under 1; no game
    setting read.
  - Skyrim Platform's containerChanged fires when the poison is picked,
    before the box, on Yes and No alike: no signal.
- A hit's poison in the attacker's game: the engine applies it to the
  target's figure there, which lands nothing a player's game counts (a
  figure's game shows the server's numbers); the server's hit path is the
  one that counts.

## Observe (host or acting client sees the intent before the engine acts)

- Hook point (the re-analyst's recommendation, CONFIRMED by
  x-poison-probe6): a sink on
  PoisonedWeapon::Event at the source Address Library 41069 returns, in
  Skyrim Platform's native layer; on the event, the player's right-hand
  equipped entry (Actor::GetEquippedEntryData(false), include/RE/A/Actor.h:540)
  and its ExtraPoison give the weapon, the poison and the doses. No
  PlayerCharacter offset needed; skymp's own inventory apply (AddItemEx)
  never passes through PoisonObject or the event, so it cannot loop. OnHit
  for the hit (as now).
- SP filter: the player's own (the event fires only in the poisoning
  player's game; the box exists for the player alone, 40481's caller
  checks it).
- Data captured: the poison's form id (the dose count the game shows is not
  taken: the server computes it), then each hit's weapon.
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
  out. OnEquip of a poison means "put on my right-hand weapon": the engine
  has no other use of a poison for its player (it sends no equip event for
  one, the box being its only path), so the client sends OnEquip with the
  poison's form id when the game's PoisonedWeapon event fires.
- Validator rules: unchanged (OnEquip's form id, as for drinks).
- Idempotency / ordering: a charge spent once per hit the server takes.
- Contract doc updated: no change.

## Server

- Where the logic lives: the C++ core's OnEquip (a poison: refused without
  the poison in the server's inventory or a weapon in the server's right
  hand, staves and bare hands too, as the game refuses them; else one
  poison spent and the right-hand weapon's entry marked with it and one
  dose, the doses the server's, R0; perks that add doses wait for M5's
  perks) and OnWeaponHit (a poisoned weapon's hit: magic-effects'
  ApplyEffects with the poison's effects and the attacker as caster, then
  a dose spent and the mark cleared at none; the owner's inventory sent
  after each change, so the game's ExtraPoison agrees); a Rust rule only
  if the doses grow rules of their own.
- DB fields / migration: none (the inventory entry already has poisonId
  and poisonCount; restart-persistent through the inventory).
- Restart behavior: a poisoned weapon stays poisoned with its charges.
- Papyrus natives touched: none.

## Client

- SP binding: Skyrim Platform's native layer adds a sink on
  PoisonedWeapon::Event (the source Address Library 41069 returns,
  1.6.1170 only per ADR-025) and emits a `poisonApplied` event with the
  right-hand entry's poison (Actor::GetEquippedEntryData(false) and its
  ExtraPoison).
- TS handler: on `poisonApplied`, OnEquip with the poison's form id
  (sendInputsService's path for drinks); inventory sync then carries the
  server's mark back.
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
- T3 scenario id: lab/scenarios/b-poison.yaml. The lab answers the box
  with lab/frida/poison-trace.js (ANSWER_YES true, x-poison-probe3), so
  lab-api needs a scenario step that starts a Frida script on a client at
  that point (today a script starts beside a run). c2 poisons its sword,
  hits c1: c1's health falls over the poison's duration on the server and
  in c1's game, c2's sword carries no dose after, and the server's
  inventory agrees with c2's game (no loop).
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

- Measured in playtest thirteen (2026-10-11, Eli, parity f828279f): applying
  the poison through the game's box unequipped the Steel Sword and left the
  poison in test 2's inventory; the server's log has no line for the poison
  (none of its paths logs at info). HYPOTHESIS, a reading of the code: the
  game used the poison up and marked the sword, the server's inventory
  record still held the poison and the sword without it, and the next
  inventory sync put the poison back and unequipped the sword
  (skymp5-client's inventory reset). If so, the server must take the
  application itself (the poison off the record, the sword's stack marked)
  or the game's own is undone each time; a probe reads the sword's
  ExtraPoison right after the box and again after the sync.
- x-poison-probe2 20261012-022304: the lab cannot answer the box. After
  the driver's EquipItem of the poison, neither Enter (28) nor E (18)
  through SKSE Input.TapKey put it on the sword (no poisoned stack in the
  game, the poison still held). So the verb's client side needs a person
  at the box: playtest fourteen applies a poison again with the server
  logging what arrives (an info line for a poison's OnEquip: fork
  b3682b71, on parity since ef3fb03c) and lab/frida/console-trace.js on
  the seat (docs/private/playtest-m2-14.md, section 6).

- Playtest fourteen (2026-10-12, Eli, parity ef3fb03c): the box applied
  the poison and the sword looked poisoned, then test 1's game swung the
  sword as fists, the sword still visible in hand, in an unequip and
  re-equip loop. The server's log has no line for it: the poison's OnEquip
  info line (fork b3682b71) never fired, so the client reports nothing
  when the game poisons a weapon (not an equip event). That fits the
  HYPOTHESIS above: the server's inventory keeps the poison and an
  unpoisoned sword, and each sync puts the game back. Next (static, then
  dynamic): the engine function that applies a poison to a stack
  (ExtraPoison, CommonLibSSE-NG include/RE/E/ExtraPoison.h) for the
  re-analyst, then a client hook that reports it to the server, which
  records the poison on the weapon and spends the item.
- Static read done (2026-10-12, Engine surface above). To confirm on
  1.6.1170 with a Frida trace (a lab/frida/poison-trace.js to write)
  hooking 40481, 40482, 16024, 41044 and the equip event's send (38386),
  plus the hit path (38748, 16000), while a person answers the box No, then
  Yes, then lands one hit. Expected on Yes: the callback with 2, then
  PoisonObject on the right hand's entry with DB03Poison (0x58CFB) and 1,
  then the event from the source 41069 returns, and no equip event for the
  poison; on the hit, the doses go from 1 to 0 and the ExtraPoison leaves.
  Falsified by: different bytes at PoisonObject's 1.6.1170 address than
  1.7.104's, the poison on another list than the right hand's first, no
  41044 call on Yes, or an equip event carrying the poison's form id.
- The lab answers the box (x-poison-probe3 20261013-001004, 1.6.1170):
  lab/frida/poison-trace.js on c2, uploaded with ANSWER_YES true, called
  the callback (40482) with 2 in the opener's (40481) return on the game
  thread, and c2's Steel Sword (Skyrim.esm 0x13989), worn in the right
  hand, carried DB03Poison (0x58CFB) with one dose (the driver's poisons
  step). CONFIRMED: the right hand and one dose without perks. The trace
  logged the opener and the answer but not the callback, PoisonObject or
  the event: Frida's hooks do not fire for calls made inside another hook,
  so those stay HYPOTHESIS until a person answers under the watching
  copy. No equip event during the poisoning (consistent with the read).
  Not reproduced here: playtest fourteen's equip loop (the sword stayed
  poisoned and worn 12 s later); the swing landed no hit, so no dose was
  spent. A scenario can poison a weapon once lab-api can start a Frida
  script at a scenario step (today it starts beside a run).

## Measured (2026-10-12, fork m2-poison)

- The verb end to end (x-poison-probe6 20261013-063057, fork m2-poison
  25a6a7ad's client, 1.6.1170): c2 equipped DB03Poison holding its Steel
  Sword; poison-trace.js answered Yes and kept the box shut; c2's game
  poisoned the sword (its poisons step: 0x13989, poison 0x58CFB, one dose,
  worn); Skyrim Platform's sink on the PoisonedWeapon event reached
  skymp5-client, whose OnEquip of the poison reached the server:
  "MpActor::ApplyPoison ff000001 - poison 58cfb on 13989, 1 dose(s)", the
  poison gone from the server's inventory. c2's swing hit c1 for 7.42
  ("health 1 -> 0.92576"), the fight began, and "13989 carried poison
  58cfb: its effects run on ff000000, a dose spent"; c1 stood at 0.821 two
  seconds on and 0.326 ten seconds on: 100 less the sword's 7.4 and the
  poison's 6 a second for 10 s is 32.6. c2's own sword was clean after the
  hit. CONFIRMED by it: the hook point (a sink on 41069's source, fired by
  41044's send), the right hand and one dose, the event with no equip
  event, the game's dose spent on the hit and its ExtraPoison gone (the
  attacker's game shows its own poison spent), and the server's mark
  carried by the hit. Still HYPOTHESIS, unread under a hook: the callback's
  own steps (PoisonObject's arguments), since Frida's hooks do not fire on
  calls made inside another hook.
- The box (x-poison-probe4, -probe5): close-menu posts kHide, which
  MessageBoxMenu ignores, and neither a tapped Enter nor E answered it, so
  an open box held c2 in menu mode and its swing never came. The trace now
  keeps it shut: within a second of the opener, AddMessage's kShow of
  MessageBoxMenu becomes kForceHide (thuum ad22fcc).
- T2: the first draw (78acce95, c1 poisoning its dagger and hitting c2)
  showed the verb on the wire stack (MagicEffects of 0x10AA4A, magnitude 6
  for 10 s, on c2; the fight) and two things to change: the poison's ticks
  send health as the session's clock allows, which no count can declare,
  and the spent dagger's entry moved to the end of the inventory, a
  message apart from the legacy stack's after its drink. Since then
  (56aaa27b, 40ed43a5) a lone copy takes the mark and gives it back in
  place (PoisonTest pins the dagger's index), and the session hits c1 with
  its own dagger and compares health as presence. Its next run (fork
  40ed43a5): identical but for the eight declared (the marked dagger's
  inventory, the poison's MagicEffects in both games, the legacy drink on
  c1's figure, the console line, the clock, the departure); the inventory
  after the dose equal to the legacy stack's after its drink.

## Status

Doc written 2026-10-10, split from magic-effects (whose Dynamic plan held
the poison until then); built 2026-10-12 on fork m2-poison.

- [x] doc complete, rung declared
- [x] engine surface cited or delegated (the re-analyst's read on 1.7.104,
      offsets resolved for 1.6.1170; x-poison-probe6)
- [x] server logic + T0 (PoisonTest, four cases; fork 25a6a7ad, 56aaa27b)
- [x] message + validator (same commit): no new message, a poison's OnEquip
- [x] native hook + T1 (Skyrim Platform's PoisonedWeapon sink,
      poisonApplied; T1 none)
- [x] TS handler (sendInputsService.ts onPoisonApplied)
- [x] T2 green: the poison session identical but for its eight declared
      divergences (ONLY=poison on fork m2-poison 40ed43a5, 2026-10-12
      23:46); every session at the merge (m2-visuals 11c126b9; the first
      full T2, on be69bf68, found the poison verb in magic-effects'
      session, whose poison moved to this one)
- [ ] T3 scenario green, no HYPOTHESIS tags: b-poison green by path twice
      and in the merge sweep (thuum de09fdc, awaiting Eli's review); left
      HYPOTHESIS: PoisonObject's arguments under a person's Yes and the
      attacker's look at its target (Impose), both playtest fifteen's
- [x] ledger and suppression registry updated: no native added (Skyrim
      Platform's sink is an event, not a Papyrus native); the suppression
      is magic-effects' (a poison from another's game lands nothing on the
      player)
- [x] merged on fork parity 11c126b9 (2026-10-13 05:31: the sweep of every
      scenario on m2-visuals be69bf68, 40 of 40 green, and T2 green on
      11c126b9, which adds a difftest session change alone), m2-visuals
      stacked on m2-poison
