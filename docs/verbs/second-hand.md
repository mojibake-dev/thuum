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
| both seats cloaked beside each other | x-two-cloaks 20261018-104500 (Flame Cloak 0x3AE9F) | MEASURED: both casts recorded; each cloak applied FireDamageConcAimedCloak to the other's figure every 500 ms (30 applications in c1's game) with no hit event, so nothing reached the server on train-24 (the apply path, train-25) |
| a cloak on a neighbour not in combat with the caster | x-second-hand-cloak 20261018-110916, b-cloak-apply 140353 (no fight); x-second-hand-cloak2 140554 (one Firebolt first) | MEASURED: with no fight the cloak's spell is applied to the neighbour's figure every 500 ms (4, 4, 10 and 9 applications) and the engine turns none into a hit event or a number, in either game; after one Firebolt (the server's "a fight begins; the victim's game is told") the same cloaks at the same 150 units raised a hit event per application, the figure took local damage in the caster's game, and the server claimed every tick (Blood Boil 4, Flame Cloak 11 at 0.5 s), c2 down to 0.9557 and 0.9655 on the server, its own game within 0.35 %. So the engine spares a peaceful neighbour's cloak and the server does the same by construction (no hit, no report, ADR-031); whether the gate is the engine's combat state or the server's hostility relay is not separable in these runs. The apply report must not carry a cloak's applications (fork m2-apply-start-off, train-26); b-cloak-fight is the scenario. SEPARATED on train-27 (2026-10-18 night): the gate is the damage effect's own condition, IsHostileToActor 719 on FireDamageConcAimedCloak 0x10CBDD, which the server now judges from ADR-023's fights (docs/research/apocalypse/effect-conditions.md); a proc report on a neighbour not in a fight is refused on the server too, and begins no fight (T0 SecondHandTest) |
| a bolt's proc on the target (Crackle's, a script property's spell) | x-class-bolts | MEASURED on train-24 (20261018-101733): 66 ticks claimed at a 150 ms median cadence (42 of 65 gaps in 145 to 155 ms) over 13.85 s, factor sum 10.9, with one 4005 ms pause that coincides with c1's dispelallspells console step and ended on its own; the parity run cast nothing (its 300 ms hold) |
| the server's number for a proc train | b-second-hand 20261018-110714 and 111322 | MEASURED: exactly the claim sum, the bolt's 10 plus 5 times the factors (8.218 in 110714: 51.09 of 2000, the assert read 0.9745) with no server-side regeneration inside 0.5 Health; c2's own game agreed within 0.0011, each claim's push resetting its regeneration |
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
- [x] message + validator (same commit) (none: OnHit unchanged)
- [x] native hook + T1 (none)
- [x] TS handler (none)
- [x] T2 green: train-24's T2 at fork a86238ed (2026-10-18 03:57 to 04:20
      PDT, pipeline 1883's artifact): every session identical against
      parity-legacy, second-hand's twelve declared divergences holding
      (the second proc's Health change declared by shape, since a
      concentration proc's claim counts the time since the last report)
- [ ] T3 scenario green: b-second-hand 20261018-111322 on train-24 (UNTICKED 19:02 PST 2026-11-02: 2 open engine claim lines over it, the root-cause plan's W5 and VERB.md's rule; ticked again when each claim cites a run or trace id, lab/tools/verb-lint.py)
      14d70eb1 (Crackle's bolt and its proc's 150 ms ticks claimed, c2 down
      5 % of 1000 Health, its game agreeing within 0.2 %), in the merge
      gate 20261018-112123-merge-m2-train-24 (23 of 23). HYPOTHESIS left: a
      cloak's applied spell raises a hit event in the caster's game only
      against a target in combat with it (x-second-hand-cloak2 probes it);
      a cloak's ticks count inside a fight and are rightly nothing outside
      one (x-second-hand-cloak2 140554; b-cloak-fight gates it on train-26)
- [ ] parity scenario green, or its later list reviewed with it (ADR-031)
- [ ] sequences and combinations green, every checklist item with its scenario (ADR-033)
- [ ] ledger and suppression registry updated

## b-second-hand's missing proc ticks in apocrypha's layer sweep (20:34 PST 2026-11-09 (04:34Z 11-10), thuum-fa; run set 20261109-225901)

Red at 20261110-042731 and its relaunched rerun 042924, step 25: 'server.actor(c2).healthPercentage < 0.97' read 1.0 on canon
ce0d2664 under apocrypha's layer. Its last green was 20261102-110708. The difference is in the server's log: in the green, the
bolt's hit ("OnSpellHit - Target ff000001 is hit by 1a109653 spell at 1 times its magnitudes (once). By caster: ff000000",
11:08:24.223) is followed by the proc's stream from the caster's game ("... hit by 1a0b2c83 spell at 0.5 times its magnitudes (a
stream's seconds)", then 0.133, 0.172, 0.149, 0.161 ...); in 042924 the bolt's hit (04:30:41.627) is followed by nothing, so c1's
game never reported the proc's ticks and c2 took no damage. Not the cause: c1's "getProjectile threw for spell 1a109653" trace
(magicSyncService.ts:583-593, a handled throw counted as a projectile) appears in the green too; the seam holds no Spell row
(canon NativeRows.inc) and c1 logged no census line for a spell native; the bond settings (proc 55B32, spell 31C4D) are the same.
Placed as canon's, by elimination (HYPOTHESIS): apocrypha's layer-appearance changes bodies, outfits, hair and the race menu, and
nothing in the bolt's or the proc's path reads them; every train since 11-02 and main's own mod changes (Skyrim Souls RE since
11-03) are canon's side. Cause UNREAD; the read is c1's: whether the bolt's effect script casts the proc on c2's figure at all
(its effect events through the Papyrus gate, the caster-is-the-player branch), and if it does, why magicSyncService reports no
stream for it. Pending in lab/gate.yaml, named here, until that read finds the fix and a run reads green.

The read's first hypothesis (numidium's static read, 2026-11-10; HYPOTHESIS, unconfirmed): H1, ADR-068's seam skips Crackle's
helper placement because the call's subject is c2's figure. The bolt's effect script (WB_CrackleNew_Script, Apocalypse 10.2.3's
pex) never casts the proc at the figure: its OnEffectStart places TheBox = akTarget.PlaceAtMe(FXEmptyActivator), then
TheShooter = TheBox.PlaceAtMe(...), a MoveTo, then WB_Crackle.RemoteCast(TheShooter, akCaster, TheBox). PlaceAtMe is a state
row keyed on its subject (skyrim-platform NativeRows.inc:37, non-latent); OwnedHere answers false for any figure
(ScriptNatives.cpp:567-578, used at :1706-1708), and with the lever at nonLatent its body is skipped (:903) with None returned
(:1709-1717). TheBox is then None, RemoteCast has no source, no proc is cast and c1 reports nothing, as the server's silence after
the bolt's OnSpellHit reads. The dates fit: the seam (fork 43cc22a3, 11-05 02:13Z), its lever (183566c4, 02:27Z) and the lever
set to nonLatent in thuum's skymp5-client-settings.txt (18eaf29e, 12:15Z) all fall after the 11-02 green and before ce0d2664.
The Papyrus gate itself passes the script (FridaHooks.cpp:922-932, an active effect whose caster is the player). If H1 holds,
the class is wider than this spell: the seam judges a call by the object it is called on, not by who cast the calling effect,
against ADR-068 decision 6 (the player's effects belong to the player's seat), so every effect script that places a helper on
its target fails the same way on a figure. H2, the weak alternative: OnEffectStart never ran on the figure.

H1's skip CONFIRMED from the sweep's own artifacts (read 2026-11-10 by a drafting agent, no new run): the same sweep's two
further reds, 20261110-043108 and 062541, kept c1.log (042731's and 042924's copies failed, "being used by another process"),
and each holds the seam's line 0.2 s after c1's cast release, "[verb:scripts] ObjectReference.PlaceAtMe on ff000923: skipped, not
hosted here (nonLatent)" (043108; 062541 on ff00082f), each self the run's "test 2" figure of c2 (its trace-c1.json), beside the
lever logged nonLatent and PlaceAtMe's row "4 parameter(s), not latent"; all four reds carry the bolt's one hit and no proc line on
the server, against 50 in the 11-02 green. H2 is refuted. The chain from that skip to the missing proc keeps two HYPOTHESIS links:
the call order inside WB_CrackleNew_Script's OnEffectStart (numidium's read of the pex; no disassembly in the tree) and the skipped
call's None return (H-F1, marked so in the code, ScriptNatives.cpp:2223-2240 at fork f6ca339d). The read probe drafted for this
(x-second-hand-read v1) is not run: it would re-read the same line. The fix is owed to a later train (platform C++, a Windows
build): a call made inside an active effect whose caster is the seat's own player counts as that seat's (ADR-068 decision 6) in
the seam's owner test (OwnedHere, ScriptNatives.cpp:585-596 at f6ca339d), with the placed helper's record (ScriptPlacement, W3's
mechanism-only row) settled in its design; b-second-hand stays pending until that fix reads green.

The fix, built in train 52 (fork m4-train-52 ea6da0a1, Fix 2, D-H1 B; in c3f9d175, its stage after playtest 51): the gate's effect
test moves into one shared function, Frida::PlayersEffect, which the seam asks too. Inside an effect this seat runs for its own
player, a PlaceAtMe of an activator, a static or a light (the census's helper kinds that simulate nothing) runs whatever its
subject's owner, and what it places is a local helper that never crosses: nothing is recorded (ScriptPlacement stays
mechanism-only, since a server copy would double the target seat's own helper), and an action row on a helper runs under the
script-action mark. No wire change. Known limit: on the target's own seat TheBox sits on that seat's own player, an owned subject,
so only TheShooter is a helper there; TheBox's latent Disable and Delete keep the owner judgment. The read: x-effect-helper
(lab/.cache/drafts/train52, sha1 6516c470), b-second-hand's frame with its helper lines claimed, and b-second-hand itself named in
train 52's gate, where it must read green; its pending line in lab/gate.yaml comes out in its own commit after that green.
