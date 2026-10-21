# Verb: scripted-effects

## Intent

A spell whose work is a Papyrus script (an effect of archetype Script) does
that work in the caster's game alone under ADR-029's default; the server
applies none of it by the records. The ones that change another player's
state are named in server-settings.json and the server does their work
itself, from the claimed hit, so the victim dies (or lives) in every game.
The first entry is Apocalypse's Finger of Death (playtest twenty-eight, Eli
2026-10-20: "if it kills them by effect of the spell, yes kill them. why on
earth would i want them dead in only one game???").

Roadmap reference: ADR-029 (Apocalypse's hybrid: the allowlist of scripted
effects the server owns). Milestone: M2, Train-31 (docs/PLAN.md). Class: B.

## Inventory (ADR-031: the action's consequences, before its rung)

Finger of Death's hit, as the engine alone runs it
(WB_FingerOfDeath_Script.OnEffectStart, disassembled from the mod's archive
with lab/pex.py; docs/research/train-31-reads.md section 5):

| # | consequence | where it shows | disposition |
| --- | --- | --- | --- |
| 1 | the effect applies only where its seven conditions hold: IsActor, GetDead == 0, no ActorTypeDwarven, no ActorTypeUndead, IsUndead == 0, no MagicNoDisintegrate, IsEssential == 0 | the caster's game decides whether the script runs at all | R0: the server evaluates the same conditions (ADR-039, every function known since train-29) before any arithmetic |
| 2 | TargetHealth = the target's current Health (times 100 / (100 - MagicResist) if the script's WB_IsResist is true) | the blast's size | R0 from the server's Health; HYPOTHESIS: WB_IsResist's compiled default (not in the VMAD; the pex's variable table or a resistant target measures it) |
| 3 | SelfDamage = TargetHealth x Percentage / 100, the Percentage global 125 | the caster's cost | R0: wire-rules scripted_effects::finger_of_death, the percentage from the entry (125 unless it says otherwise) |
| 4 | kill branch (SelfDamage < caster's Health - 1): the target damaged by TargetHealth, the caster by SelfDamage, akTarget.Kill(akCaster) | both bars, the victim's death | R0 for the target: its Health to nothing by the caster's hand (MpActor::SetPercentages kills with the aggressor). The caster's share is its own game's: the script runs there and reports the fall, taken as every self-inflicted script damage is (ADR-029's default); the server pays it only for an actor no game plays. The first build paid it on the server too and the caster died with its target (b-fod-kill 20261021-042635) |
| 5 | fail branch: the caster damaged to 1 point, the target by (caster's Health - 1) x 100 / Percentage, no kill | both bars | R0 for the target, the same function's other branch; the caster's point as in row 4 |
| 6 | the imagespace modifier, the explosion marker's sound, the message, the screen blood | the caster's screen | R3: the caster's own script keeps them (it still runs in the caster's game; its player damage yields to the server's numbers under ADR-028) |
| 7 | the disintegration: SetCriticalStage, the shader, AttachAshPile after 1.25 s, SetAlpha 0 after 1.65 s, unless the race is in the immunity list (11 races) | the victim's body on the caster's screen; the victim's own screen shows the server's death | R3 on the caster's screen (the script's Kill on the figure, what playtest twenty-eight saw); the victim's death reaches its own game from the server (MpActor::Kill, DeathStateContainerMessage) and the other games through the figure's values as every death does |
| 8 | Restoration advanced by SelfDamage x 0.75 x 0.75 for a player caster | the caster's skill | R2 as every skill is (the actor-values record) |

### Sequences and combinations (ADR-033)

- A second cast on a dying or dead target: nothing (the target's death flag
  is checked first; a dead target's hit applies nothing, MpActor::
  ApplyEffects).
- A god-mode target: nothing (the engine's TGM takes no damage). A god-mode
  caster: the target's share still lands, the caster pays nothing.
- An immortal (TIM) target: its Health stops at one point and nobody dies
  (NetSetPercentages' ImmortalHealth).
- An essential target (an NPC with the ACBS flag): the conditions fail,
  nothing; the caster's own script sees the same IsEssential and takes the
  fail branch in its game.
- The hit's hostility: the effect is Hostile, so the fight begins as any
  hostile hit's does (ADR-023), before the kill.
- Shadowbond's concealment on the caster ends at the cast, as at any cast.

## Authority

Rung: R0. The server computes the two Health changes and the death from
its own numbers and the record's conditions; the caster's claimed hit is
the trigger, validated as every spell hit is (a recorded cast within
reach, ClaimCast). The caster's game keeps the visuals (R3) and its own
copy of the arithmetic, whose player damage yields to the server's numbers
(ADR-028) and whose Kill on the figure is the death the server also
decides; where the server's branch differs (an essential or resistant
target the caster's game read otherwise) the figure's local kill races the
server's verdict: HYPOTHESIS until a lab run shows the figure's values
restoring it.

## Engine surface

None hooked. The engine's part is the record and the script, read, not
run: SPEL 03035452 (local; 0x1A035452 under the lab's order), MGEF
03035450 archetype Script, flags Hostile + Detrimental + NoDuration +
NoMagnitude + NoArea + NoRecast, its seven CTDA rows, its VMAD naming the
script and its properties (docs/research/train-31-reads.md section 5). The
server's condition functions: skymp5-server condition_functions/ (IsActor
353, GetDead 46, HasKeyword 560, IsUndead 715, IsEssential 354).

## Observe (host or acting client sees the intent before the engine acts)

The caster's game reports the spell's hit on the victim's figure as every
spell hit (hitService, the OnHit message); nothing new is observed.

## Impose (observers render the server's decision)

The victim's game: the death from the server (MpActor::Kill, the respawn
after GetRespawnTime), and the Health change before it (ChangeValues).
The caster's game: its own Health change from the server. Every other
game: the figure's death through its values, as any death.

## Suppress (engine's own behavior blocked on non-hosts)

Nothing new. The caster's script still runs in the caster's game; its
DamageActorValue on the player yields to the server's numbers already
(ADR-028, the figure-values dent gate), its Kill on the figure is the
visual the server's death agrees with.

## Message contract

No new message. The hit is OnHit as it is; the entry is server-settings.json:

```
"scriptedEffects": [
  {"spell": "35452:Apocalypse - Magic of Skyrim.esp", "kill": "fingerOfDeath"}
]
```

`spell` as the change forms write a FormDesc (a load-order change keeps
it); `kill` names the script the server runs (`fingerOfDeath` is the one);
`percentage` optional, the script's global as the mod ships it (125) when
absent. A bad entry refuses to start (wire-rules scripted_effects::
ScriptedEffects::from_json, the same shape as the headshot and bond lists).

## Server

- wire-rules scripted_effects.rs: the settings and `finger_of_death(target
  health, caster health, percentage) -> DeathBlast {target damage, caster
  damage, kill}`, both branches, nonsense inputs doing nothing; T0 there.
- wire-bridge: `new_scripted_effects`, `is_kill_spell`, `kill_percentage`,
  `finger_of_death`; the shared struct DeathBlast.
- PartOne::SetScriptedEffectSettings (ScampServer reads the key),
  IsScriptedKillSpell, ClaimScriptedKill: the dead and god-mode checks, an
  effect of the spell whose conditions hold (MpActor::EffectConditionsHold),
  the two current Health values (MpActor::GetCurrentActorValue), the
  blast, the caster's DamageActorValue, the target's NetSetPercentages with
  the caster as aggressor (a Health reaching nothing kills with the
  killer named), one info line with every number.
- ActionListener::OnSpellHit calls it before the record's other effects
  apply, as the script runs at its effect's start with the target's Health
  as it stands.

## Client

Nothing new: the caster's game runs the mod's script as before (its
visuals), the victim's game takes the death as every death.

## Tests

- T0: wire-rules scripted_effects tests (settings; the kill branch; the
  fail branch and its edge; nonsense); unit/ScriptedKillTest.cpp (Firebolt
  named as the kill in a test setting, both branches on 250-Health actors:
  the fail branch leaves the target at 0.10 after Firebolt's own 25 and the
  caster at one point; the kill branch kills the target and leaves the
  caster 93.75).
- T2: no wire change; difftest sessions unchanged.
- T3: b-fod-kill (new, Eli's review): c1 casts Finger of Death at c2 at
  half Health: c2 dead on the server and in both games, c1 down 1.25 x c2's
  Health; then at full Health with c1 low: c2 alive at 0.8 of c1's Health
  less one off, c1 at one point, nobody dead. The lab's setting names the
  spell under the layer's order.
- T4: playtest twenty-nine item 2 (docs/M2-CLOSE.md section 3b).

## Dynamic plan (fill when any tag above is still HYPOTHESIS)

- WB_IsResist's default: `lab/pex.py` extended to print the script's
  variable initial values, or a probe with a 50 percent magic-resistant
  target (an Alteration ward or the Atronach stone's effect server-side):
  the blast at TargetHealth x 2 if true.
- The figure's local kill racing the server's verdict: a probe with an
  essential NPC target (the server refuses, the caster's game's script
  also takes the fail branch, so no race) and a resistant player target
  once WB_IsResist is known.

## Status

- [x] doc complete, inventory listed with a disposition per row, rung declared (2026-10-20)
- [x] engine surface cited or delegated (the record and the script, read on sky-srv 2026-10-20)
- [x] server logic + T0 (fork m2-train-31 b0e4ba38, 2026-10-20 19:05 PDT; the caster's share left to its own game at 9ad635cd after b-fod-kill 20261021-042635 killed the caster too: the server's share and the script's stacked; docs/research/train-31-reads.md section 9)
- [x] message + validator (same commit): no message; the settings list validated in Rust
- [ ] native hook + T1: none needed
- [ ] TS handler: none needed
- [ ] T2 green
- [ ] T3 scenario green, no HYPOTHESIS tags (b-fod-kill to write)
- [ ] parity scenario green, or its later list reviewed with it (ADR-031)
- [ ] sequences and combinations green, every checklist item with its scenario (ADR-033)
- [ ] ledger and suppression registry updated (no new natives)
