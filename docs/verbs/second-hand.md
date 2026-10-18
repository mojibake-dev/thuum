# Verb: second-hand

## Intent

A hit by a spell the caster's own spell made (a cloak's proc, a script's
proc, a cloak put on the target) counts on the server as the caster's hit,
bounded by the cast that made it, so Apocalypse's second-hand spells deal
their numbers between players.

Roadmap reference: "Magic effects" and "Spells" (skymp/ROADMAP.md).
Milestone: M2 (docs/PLAN.md item 10, the class pass: the census's largest
player class)   Class: B

## Inventory (ADR-031: the action's consequences, before its rung)

From the census (docs/private/apocalypse-census.md, the effect class
"Second-hand spell: a proc, cloak or hazard deals it", 30 learnable spells)
and its reach graph (apocalypse-census-spells.tsv, column reached): 24 of the
30 reach their proc through a script property on an effect (VMAD, an Object
property naming a SPEL: Creeping Cold's WB_CreepingCold_Script, Crackle's,
Undermine's), one through a Cloak effect's associated spell (Decompose), the
rest through a hazard an effect spawns (Dragon's Teeth's bonfire: M4's
placed objects). The class probes' readings fill the trace column.

| consequence | seen in | disposition |
| --- | --- | --- |
| the parent spell's own hit and number | record | native, imposed as today (spell-cast, magic-effects) |
| the proc's hit on the target, reported by the caster's game | record; trace: x-class-self 20261018-100816 (Sotha's Maelstrom 22 of 22, Blood Boil 8 of 8, Inferno's two Ember Bolts), x-class-bolts 20261018-101733 (Crackle's proc, 66 ticks), on train-24 | imposed: claimed against the parent's cast (this verb) |
| the proc's Health, Magicka or Stamina number on the target | record | imposed: the server's effect runtime, as any spell hit |
| the proc landing on the target's own player in the target's game (the figure's copy of the cloak or script) | inferred from code (Hooks.cpp's AddTarget refusal) | suppressed: H/M/S refused there, the server's number arrives instead |
| the proc's non-H/M/S effects (a slow, an absorb's gain) | record | later: the census's cross-cutting rows (absorb, the rider twice) |
| a hazard's ticks (SpawnHazard) | record | later: M4, placed objects |
| a number that lives in an explosion's enchantment (vanilla Frost Rune's SlowFrostRune 0xb72a2: HazardFrostDamageFFContact 40; Lost Grimoire's Firebomb, Shattering Crystal, Flameheart's end, Detonate and Supercharge Minion), reached hazard to explosion to EITM | record (lab/esm.py, 2026-10-18); trace pending (x-explosion-gate on train-25) | later: the reach follows MGEF to its explosion and EXPL to its enchantment; until then the server refuses the enchantment's hit as no cast and ADR-037's gate keeps the client's copy out, so the spell does nothing to another player (ADR-037, Consequences) |

### Sequences and combinations (ADR-033)

| sequence or combination | probe or scenario | result |
| --- | --- | --- |
| a cloak's proc reported at the engine's rhythm (about 5 a second for a concentration spell) | b-second-hand, x-class-self | MEASURED on train-24 (x-class-self 20261018-100816): Sotha's Maelstrom's 22 procs claimed at 497 to 518 ms apart (mean 501) over 10.5 s, each at 0.497 to 0.518 of its magnitudes; Blood Boil's 8 at 498 to 504 ms; none refused or throttled (T0 a_cloaks_concentration_spell_counts_the_time_it_held_each_target) |
| the same cloak cast again while the first lingers | x-class-self (Sotha's Maelstrom twice) | pending: the newest cast claims (the stage's run cast it once; x-two-cloaks reads the two-caster case) |
| the caster walks off with its cloak | b-second-hand (c2 steps out) | pending: judged from where the caster stands now (T0 a_proc_is_judged_from_where_the_caster_stands_now) |
| a concentration cloak released (Blood Boil) | x-class-self | MEASURED on train-24: Blood Boil's 8 procs claimed 10:11:36.133 to 10:11:39.629, none after its release (T0 a_concentration_cloak_lingers_while_its_stream_is_open) |
| both seats cloaked beside each other | x-two-cloaks (train-24's stage) | pending its read |
| a bolt's proc on the target (Crackle's, a script property's spell) | x-class-bolts | MEASURED on train-24 (20261018-101733): 66 ticks claimed at a 150 ms median cadence (42 of 65 gaps in 145 to 155 ms) over 13.85 s, factor sum 10.9, with one 4005 ms pause that coincides with c1's dispelallspells console step and ended on its own; the parity run cast nothing (its 300 ms hold) |
| the caster reconnects mid-cloak | later: forget() clears its casts on leave | |

## Authority

Rung: R1 for the proc's hit, R0 for its number.
Why this rung and not the one above it: the server simulates no cloak, no
script and no projectile, so it cannot see a proc land. It can see the
cast that made it (recorded, R1 since spell-cast) and what that cast's
records can make.
What the server validates (R1): the reporter is the caster; a cast it
recorded for that caster names, through the records, the hit's spell (the
reach set, computed by the server from the records, never sent by a
client); the cast is within its linger (its longest effect's duration, at
least the bolt window, CAST_WINDOW_MS); the target is within the parent
spell's reach plus slack of the caster's current position (a cloak moves
with its bearer); at most one claim per cast and target each tick.
Rate limit / bounds: one claim per (cast, target) per REACHED_TICK_MS (a
chosen 500 ms, against the engine's cloak cadence; HYPOTHESIS until the
probe reads the cadence); OnHit's own budget.

## Engine surface

- OnHit (skymp5-server ActionListener.cpp on parity 3536ba43, 2741-2769):
  a spell hit counts only when the spell is equipped or a variation of the
  equipped shout; any other spell falls through to the weapon path and is
  dropped at debug level ("weapon is not equipped", 2884-2890), so today a
  proc's hit never shows in a server log.
- The claim (skymp-wire wire-rules casts.rs:202-262): matches a recorded
  cast by the hit's spell id alone; a fire-and-forget cast waits
  CAST_WINDOW_MS (17 s), a stream counts its time.
- The records: VMAD object properties (libespm Property::Type::Object,
  RecordHeader::GetScriptData), read today for activators and quests;
  MGEF's associated item (DATA 0x08, UESP "Skyrim Mod:Mod File
  Format/MGEF") is not read by libespm.
- What the caster's game sends for a proc: HYPOTHESIS, a TESHitEvent with
  the proc's spell as source and the caster as aggressor (a script's
  Spell.Cast on its caster, a cloak's spell applied by the cloak's bearer);
  the class probes read c1's own hits dealt.

## Observe (host or acting client sees the intent before the engine acts)

- Hook point: unchanged, skymp5-client hitService.ts sends every hit by
  the player; a proc's is one.
- SP filter: unchanged.
- Data captured: unchanged (OnHit).
- Side effects of hooking here: none new.

## Impose (observers render the server's decision)

- Mechanism: the server applies the proc spell's effects to the target
  (OnSpellHit with the claim's scale), as for a spell the caster cast.
- Visual without simulation: the proc's look in the target's game is the
  figure's copy's (unchanged).
- Side effects: none new.

## Suppress (engine's own behavior blocked on non-hosts)

- What is suppressed: nothing new. The figure's copy's H/M/S stays refused
  in the target's game (Hooks.cpp), so the server's number is the only one.
- How: unchanged.
- Release condition: none.

## Message contract

- No new message and no new field: OnHit as it is (rule 4 untouched).
- Validator rules: unchanged.
- Idempotency / ordering: a proc's hit after its parent's cast; the claim
  window covers the order (the cast is reliable and sent first).
- Contract doc updated: nothing to update.

## Server

- Where the logic lives:
  - C++ (records, until espm is strangled): ReachedSpells(spell), the spells
    a cast of it can make, transitively to depth 3: each effect's MGEF, its
    associated item when the archetype is Cloak, and every SPEL an Object
    property of a script on it names (a FLST of spells expanded). Cached per
    spell; passed with the cast in CastFacts (a bounded list, 8) with the
    linger (the cast spell's longest effect duration).
  - Rust (wire-rules casts.rs, ADR-010): claim() falls back, when no cast of
    the hit's spell covers it, to the newest cast whose reach set holds the
    spell, within its linger, the target within reach of the caster's
    current position (a new CastHit field), once per (cast, target) per
    REACHED_TICK_MS; scale 1.
  - OnHit: the player's hit by a spell it neither equipped nor shouted goes
    to the claim too; a refusal logs at warn (E_SPELL_NO_CAST, visible),
    not debug.
- DB fields / migration: none.
- Restart behavior: none (casts are not persisted).
- Papyrus natives touched: none.

## Client

- SP binding: none.
- TS handler: none (hitService.ts already sends the hit).
- Kill switch config key: none (server-side).

## Tests

- T0 (Rust casts.rs): a cloak's proc claimed within the linger and refused
  after it; refused beyond reach of the caster's current position; one claim
  per target per tick; a spell outside the reach set refused; a bolt's
  on-hit proc claimed within CAST_WINDOW_MS. (C++) ReachedSpells on records
  in the unit tests' masters.
- T2: difftest session second-hand: c1 casts a cloak, then reports its
  proc's hit on c2: the wire stack claims and damages, the legacy stack
  drops it (declared).
- T3 scenario id: b-second-hand (scratchpad draft, re-cut 2026-10-18 after
  three red first runs on train-24's stage): Blood Boil, a concentration
  Self cloak held 4 s beside c2 (its ticks on c2 reported as hits by the
  caster's game, 8 claimed at 500 ms in x-class-self 20261018-100816), then
  Crackle, an aimed bolt whose proc keeps ticking on c2 (66 claimed at
  150 ms in x-class-bolts 101733); c2's health on the server falls after
  each cast, read before regeneration hides it, and c2's game agrees within
  2 %. The first draft's vanilla Flame Cloak could not pass on train-24 and
  the runs said why in three steps: FlameCloakLeftHand 0xDE511 never casts
  from the right hand (runs 102930, 103607; the player's spell is 0x3AE9F,
  the tome's); the cast then arrived but no proc did (104248); and
  x-two-cloaks 104500 showed the reason: a cloak's contact damage applies to
  the neighbour's figure through AddTarget with no hit event (30
  applications of FireDamageConcAimedCloak on the figure in the caster's
  game, 0 hits dealt), so only the apply path reports it. That is
  b-cloak-apply (train-25, fork m2-area-report): Flame Cloak beside c2 for
  6 s, c2's health down on the server and in its game. A script proc
  (Creeping Cold) is read in x-class-streams. Sotha's Maelstrom's procs are
  claimed (22 of 22) but move no number: its proc is a script casting a
  ResistMagic debuff, so it asserts nothing about health.
- Assertions that would fail if the verb silently regressed: c2's health on
  the server after the cloak's seconds.

## Dynamic plan (fill when any tag above is still HYPOTHESIS)

- The class probes (scratchpad class-pass/, 2026-10-17): x-class-self
  (Sotha's Maelstrom, Blood Boil), x-class-target (Decompose), x-class-bolts
  (Crackle), x-class-streams (Creeping Cold). Read: c1's hits dealt (the
  proc's spell id, the aggressor, the cadence), server.log (nothing at warn
  today), c2's health on the server and in its game.
- Expected if the hypotheses hold: c1's watch lists hits by the proc spells
  on c2's figure at about one a second for a cloak; the server applies none.
- Owner: agent.

## Status

- [x] doc complete, inventory listed with a disposition per row, rung declared
- [x] engine surface cited or delegated
- [x] server logic + T0 (fork m2-second-hand 21967b08, ca641d55: wire-rules
      claim_reached with 8 tests and the bridge's; SecondHandTest on
      Skyrim.esm's Flame Cloak; GitLab pipeline 1800 green, test_unit's 369
      cases and the integration tests; in train m2-train-24 c42ba771)
- [ ] message + validator (same commit) (none: OnHit unchanged)
- [ ] native hook + T1 (none)
- [ ] TS handler (none)
- [ ] T2 green
- [ ] T3 scenario green, no HYPOTHESIS tags
- [ ] parity scenario green, or its later list reviewed with it (ADR-031)
- [ ] sequences and combinations green, every checklist item with its scenario (ADR-033)
- [ ] ledger and suppression registry updated
