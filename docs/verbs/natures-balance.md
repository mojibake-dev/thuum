# Verb: natures-balance

## Intent

A player casts Apocalypse's Nature's Balance at another player and the two
swap Health percentages, decided by the server, which runs the mod's own
script: the first entry of ADR-029's allowlist, and the server's effect
runtime it pays for.

Roadmap reference: skymp/ROADMAP.md "Magic effects" ("The server must be
able to cast a magical effect on a person"); docs/PLAN.md M2 item 10,
ADR-029 ("Nature's Balance the first"), docs/apocalypse-options.md 5.2 (B1)
and 5.4.
Milestone: M2   Class: B

## Inventory (ADR-031: the action's consequences, before its rung)

From the records (the 10.2.3 plugin by lab/esm.py, Skyrim.esm's keywords on
sky-srv) and the script as compiled (WB_Equalize_Script, lab/pex.py disasm,
2026-10-14). The reference trace (the solo recorder, lab/references/) adds
what the engine plays besides.

| consequence | seen in | disposition |
| --- | --- | --- |
| the cast: a 2 s charge, fire-and-forget, aimed, cost 750 (SPEL 030012DC) | record | native in the caster's game; spell-cast's (R1), relayed so the figure plays it |
| the bolt (PROJ 0302F104) and its hit on the target | record | native in the caster's game; the hit is spell-cast's claim against the recorded cast (R1) |
| the effect's six conditions (CTDA 353 == 1, 46 == 0, 560 on ActorTypeDwarven, ActorTypeDaedra and ActorTypeUndead each == 0, 715 == 0; read as IsActor, GetDead, HasKeyword three times and IsUndead in docs/apocalypse-options.md 5.4) | record | evaluated by the server (R0), Eli's decision below: by whoever owns the state a condition reads |
| both actors' Health percentage and Health read (GetActorValuePercentage, GetActorValue) | script | the server's: its own records (ADR-028) |
| the swap: each moved to the other's percentage, times WB_Mult (1.0), by RestoreActorValue and DamageActorValue on Health; which one rises follows the two percentages and WB_Merge (True), so with this VMAD the percentages always swap | script | the server's (R0): the change reaches both games as ChangeValues |
| EffectShader.Play, green on the one that rises and red on the one that falls (Apoc_FXS_Green and _Red), 2 s | script | imposed: the server's EffectShader.Play, already a native it runs, played in every game that sees them |
| an image space on a player's own screen (WB_RestorationPeace_Imod_Equalize_Green or _Red, at WB_ImodStrength) for whichever of the two is the player | script | imposed: delegated to that player's game (a C call, docs/apocalypse-options.md 2.6), R3 by nature |
| the script's run in the players' games | engine | suppressed: an allowlisted script is blanked in every game, its caster's and target's included, so it runs once, on the server |

## Authority

Rung: R0 for the swap, R1 for the hit (spell-cast's).
Why this rung and not the one above it: there is none above R0. Why not
leave it to the caster's game (ADR-029's default): the script changes
another actor's Health, ADR-028's ground, and under the default the target's
figure would change in the caster's game alone while the server crops the
caster's own gain (docs/apocalypse-options.md 5.4).
What the server validates (R0): it computes both new values from its own
records; the inputs a client gives are the cast and the hit (R1, already
validated).
Rate limit / bounds: spell-cast's casts; the effect has no duration, so one
script run per hit.

## Engine surface

- The records: SPEL 030012DC WB_Res_Peace4_Spell_NaturesBalance; MGEF
  030012D6 WB_Res_Peace4_Effect_NaturesBalance (archetype 1, Script; aimed,
  fire-and-forget; projectile 0302F104), its VMAD WB_Equalize_Script with
  WB_Mult 1.0, WB_Merge True, the two shaders, the two image spaces,
  WB_ImodStrength and PlayerRef (docs/apocalypse-options.md 5.4).
- The script (WB_Equalize_Script.OnEffectStart, 68 instructions): two
  GetActorValuePercentage, two GetActorValue, two Math.Abs, the
  arithmetic, two EffectShader.Play, one RestoreActorValue and one
  DamageActorValue on Health, one ImageSpaceModifier.Apply for whichever
  actor is PlayerRef.
- The server's natives for it: GetActorValuePercentage, GetActorValue,
  DamageActorValue and RestoreActorValue on Health exist
  (MpActor.cpp, docs/apocalypse-options.md 5.4); EffectShader.Play exists;
  Math.Abs is missing (a pure native, N); ImageSpaceModifier.Apply is
  missing (C: delegated). Each gets its ledger line (rule 10).
- The runtime, by docs/apocalypse-options.md section 2: scripts load from
  the mod's BSA once the settings list it (2.1, exists); an effect object
  that holds (target, entry) and answers "ActiveMagicEffect", its instances
  bound with the MGEF's VMAD (ScriptVariablesHolder with the MGEF as the
  base, INFERRED), a per-instance PlayerRef, OnEffectStart sent when the
  server applies the effect, and the instance freed when its stack ends
  (2.2; VirtualMachine::RemoveObject is empty today); latent calls' freed
  instance trap (2.5; this script has none).

## Observe (host or acting client sees the intent before the engine acts)

- Hook point: none new; spell-cast's SpellCast and the hit's claim.
- SP filter: spell-cast's.
- Data captured: the cast, the hit's target.
- Side effects of hooking here: none new.

## Impose (observers render the server's decision)

- Mechanism: ChangeValues for both actors' Health (as any damage),
  EffectShader.Play's snippet to the games that see them, the image space's
  snippet to the right player's game.
- Visual without simulation achieved by: the shaders on the figures.
- Side effects: HYPOTHESIS until the reference: the engine plays nothing
  else for this effect (its archetype is Script, so no value change of its
  own).

## Suppress (engine's own behavior blocked on non-hosts)

- What is suppressed: WB_Equalize_Script's events in every game.
- How: the allowlist reaches each game at login, and Skyrim Platform's
  event filter blanks an allowlisted script's events before its effect test
  (FridaHooks.cpp OnSendEventEnter) lets the player's own effects through.
- Release condition: none.
- Side effects: HYPOTHESIS: the engine still applies the effect's record
  (no value change, archetype Script), so blanking the script leaves
  nothing of it in the games.

## Message contract

- The allowlist to the games: a field of an existing login message or a new
  one (decided with the runtime; rule 4 either way).
- The rest: ChangeValues and SpSnippet, as now.

## Server

- Where the logic lives: the allowlist as data (a server setting naming
  scripts or MGEFs as FormDescs); the effect runtime in the server's VM (C++
  today, ADR-010's strangling order: the VM is papyrus-vm's); the
  conditions evaluated by the server against the state it owns (Decided,
  below; the build and the records' facts in
  docs/research/apocalypse/effect-conditions.md).
- DB fields / migration: none for a NoDuration effect. A script kind in
  magic.rs and the change form comes with the first allowlisted effect
  that lasts (rule 6).
- Restart behavior: none (nothing persists between the hit and the swap).
- Papyrus natives touched (ledger lines added): Math.Abs (N),
  ImageSpaceModifier.Apply (C, delegated).

## Client

- SP binding: the filter's allowlist (Skyrim Platform, FridaHooks.cpp).
- TS handler: the allowlist received and handed to the filter.
- Kill switch config key: an empty allowlist.

## Tests

- T0: the runtime on a fixture script (no compiler on CI: a hand-assembled
  .pex through lab/pex.py's writer, or the mod's own when present), the
  swap's arithmetic against the script's, the conditions (a vampire race
  target refused, a mortal one swapped).
- T2: a difftest session: c1 casts at c2, the hit lands; the wire stack's
  ChangeValues swap the two Health percentages.
- T3 scenario id: lab/scenarios/b-natures-balance.yaml: c1 at 30 % and c2
  at 90 % Health; c1's Nature's Balance hits c2; both games and the server
  read c1 at 90 % and c2 at 30 %, within 0.01.
- Parity: p-natures-balance against the references.

## Decision for Eli

The effect's six conditions (the target an actor, alive, not Dwarven,
Daedra or Undead) decide whether the swap happens at all. Either:

1. The server evaluates them (R0): its condition evaluator knows 17
   functions and none of these four (IsActor, GetDead, HasKeyword and 715),
   so they are added, cheap for a player target (the server knows its
   death, race and keywords from the records). Every later allowlist entry
   brings its own conditions the same way.
2. The server takes the engine's word that the effect started (R1): the
   caster's or the target's game reports it, and either has a stake in the
   answer (a target's game could report the effect refused to keep its
   health).

Recommended: 1, the server's own evaluation, so the swap rests on nothing a
client says beyond the validated hit.

## Decided (Eli, 2026-10-18)

Option 1, in the words that decide it: a condition is evaluated by whoever
owns the state it reads. The server evaluates the six for the swap (R0),
against its own death record and the target's race record; each game keeps
the engine's own evaluation for what it shows (the effect's art), which we
leave alone. The vampire races carry the keyword the undead conditions read:
NordRaceVampire's KWDA in Skyrim.esm is ActorTypeNPC 0x13794, Vampire
0xA82BB, ActorTypeUndead 0x13796 (lab/esm.py on sky-srv, 2026-10-18).
Taking a game's word (option 2) is out: the target's game has a stake in the
answer (rule 5).

Eli's caveat, recorded: a player who turns vampire changes race in their own
game alone (the vampire quest's Actor.SetRace), and the server takes an
appearance only while the race menu is open and only for a race it offers
(ActionListener::OnUpdateAppearance, E_APPEARANCE_RACE), so until vampirism
is declared state (docs/PLAN.md, M5) the server judges a turned player as
mortal and every other game's figure of them stays mortal too. No lab seat
is a vampire; nothing on the M2 path depends on it.

## Status

- [ ] doc complete, inventory listed with a disposition per row, rung declared
- [ ] engine surface cited or delegated
- [ ] server logic + T0
- [ ] message + validator (same commit)
- [ ] native hook + T1
- [ ] TS handler
- [ ] T2 green
- [ ] T3 scenario green, no HYPOTHESIS tags
- [ ] parity scenario green, or its later list reviewed with it (ADR-031)
- [ ] ledger and suppression registry updated
