# Verb: headshot

## Intent

Headshot Kills - CIF works between players: an arrow from a skilled archer
to an unhelmeted head kills, decided by the server, and every screen shows
the death.

Roadmap reference: none (Eli's stretch mod, docs/MODS.md "Headshot Kills -
CIF"; docs/PLAN.md M2, which places it with the first ranged hit verb).
Milestone: M2 (Eli, docs/private/decisions-m2.md question 6: "with marksman,
as planned"; marksman closed without it, so it follows spell-cast)
Class: B

## Authority

Rung: R1 for the head hit, R0 for the kill.
- The shooter's game decides that its arrow struck a head: Core Impact
  Framework (CIF), an SKSE plugin, hooks the arrow's collision and the
  engine's hit processing there (docs/MODS.md). The server has no skeleton,
  no collision and no projectile to check that against.
- The kill is the server's (R0): MpActor::Kill on its own health record
  (skymp5-server MpActor.cpp:1663), and the death reaches every game as any
  death does (m0-death).
Why not R0 for the hit: nothing on the server can see where an arrow
struck. What the server validates (R1): the report rides a hit it already
took from that shooter on that target (marksman's claim: a recorded shot,
within its flight); the claimed shot's weapon is a bow or a crossbow; the
target wears nothing in biped slots 30 and 31 (head, hair) by the server's
equipment record and each item's ARMO BOD2 flags (libespm ARMO.cpp:28;
BGSBipedObjectForm kHead and kHair, CommonLibSSE-NG
include/RE/B/BGSBipedObjectForm.h:13-14); the target's race is one the
mod's rule names (the ten playable base races and ElderRace, docs/MODS.md);
the shooter's Archery is at least 60 by the actor-values record. What it
records unvalidated (R2): the Overdraw rank 4 perk the mod's rule also
wants (Skyrim.esm 0x07934D, docs/MODS.md), since perks are not server state
until M5. At most one headshot per claimed shot.
Rate limit / bounds: one per claimed shot; the report's budget is OnHit's.

## Engine surface

- Where a hit struck, in the shooter's game: HitData's hitPosition and
  damageLimb (CommonLibSSE-NG include/RE/H/HitData.h:52, :78). Skyrim
  Platform's `hit` event carries neither (TESHitEvent: target, cause,
  source, projectile, flags; include/RE/T/TESHitEvent.h:26-30), so the
  client cannot read the struck part from the events it has.
- What CIF does on a headshot: applies the mod's "hInstantDeathSpell" to the
  victim, whose effect script calls akTarget.Kill() with no killer (docs/
  MODS.md, apocrypha's read of the mod's records and script). How CIF casts
  it (which caster, through which call) is UNKNOWN, so which events the
  shooter's game sends for it is UNKNOWN: TESMagicEffectApplyEvent (target,
  caster, magicEffect; include/RE/T/TESMagicEffectApplyEvent.h:13-15) is the
  likely one, and a TESHitEvent with the spell as source is possible.
  HYPOTHESIS until the lab boots CIF (Dynamic plan).
- In thuum the victim in the shooter's game is a figure, so CIF's spell
  lands on the figure there: the figure dies in the shooter's game alone,
  or not at all (a figure holds a million health and a deferred kill,
  skymp5-client formView.ts:300-303). HYPOTHESIS.
- The runtime: CIF 2.0.7 (Nexus 146873 file 801478) reads Address Library
  formats 1, 2 and 5 (docs/MODS.md), so one build would serve both of
  ADR-025's game versions; whether SKSE 2.2.6 on 1.6.1170 loads it is the
  same one-boot check MODS.md names (skse64.log). HYPOTHESIS.
- The server's kill: MpActor::Kill (MpActor.cpp:1663); Papyrus Actor.Kill is
  missing on the server (docs/NATIVES.md), so the mod's own effect script
  cannot run there today.

## Observe (host or acting client sees the intent before the engine acts)

- Hook point: whichever event the Dynamic plan shows CIF's spell raising in
  the shooter's game (the magic effect applied to a figure by the player,
  most likely), filtered to the player as caster and to the mod's effect.
- SP filter: the player's own form as caster.
- Data captured: the target, the effect, the time; the hit it rides is the
  one the client sent just before (OnHit, marksman's path).
- Side effects of hooking here: none expected (events read only).

## Impose (observers render the server's decision)

- Mechanism: the server's kill, as any death (DeathStateContainer to every
  listener; m0-death's path).
- Visual without simulation: the death animation and ragdoll the death
  path already plays.
- Side effects: none new.

## Suppress (engine's own behavior blocked on non-hosts)

- What is suppressed: CIF's own kill of the figure in the shooter's game, if
  the Dynamic plan shows one (a figure dying there before the server's
  death would show the death early, or twice).
- How: UNKNOWN until the plan shows what CIF does to a figure.
- Release condition: none (a figure is never this game's to simulate).
- Side effects: HYPOTHESIS.

## Message contract

- A new message is not decided. Two candidates, the Dynamic plan to choose:
  1. OnHit as it is, with the mod's spell as its source, if the shooter's
     game raises a hit event for CIF's spell (the client already sends
     those); the server tells it from a spell the player cast by its being
     unlearned and arriving on a claimed arrow hit.
  2. A field on OnHit, the struck part as the shooter's game saw it, if a
     native can read HitData.damageLimb in the client's hit hook; then CIF's
     own decision is not needed on the wire at all, and the server applies
     the mod's rule from its data.
- Validator rules: as OnHit's, plus the field's bounds if (2).
- Idempotency / ordering: one headshot per claimed shot; reliable, ordered
  after its hit.
- Contract doc updated: in the same commit as the validator.

## Server

- Where the logic lives: a Rust rule (wire-rules ranged, beside the shot
  claims): a headshot claim is honored once per claimed shot, within its
  hit's window, when the server's own conditions hold (weapon kind, the
  target's head slots, its race, the shooter's Archery); the C++ core reads
  the facts (equipment and ARMO BOD2, appearance, the actor-values record)
  and kills through MpActor::Kill.
- Where the mod's rule comes from: its CIF config (a data file the mod
  ships). The server reads the conditions it can check from it rather than
  from code, so a second CIF mod would need no new rule. HYPOTHESIS: the
  config's format (MODS.md read 1.x's keys; 2.x changed AND to OR).
- DB fields / migration: none (a death is already state).
- Restart behavior: none.
- Papyrus natives touched: Actor.Kill on the server (R0, MpActor::Kill), a
  NATIVES.md line, if the mod's script is to run there; not needed if the
  rule kills directly.

## Client

- SP binding: none if candidate 1; a client native reading the hit's limb
  if candidate 2 (TESModPlatform, a NATIVES.md line, R1 data).
- TS handler: hitService.ts (the report), and the suppression if the plan
  shows CIF killing the figure locally.
- Kill switch config key: `headshot` under skymp5-client's settings.

## Tests

- T0: wire-rules (a claim on a claimed shot honored once; refused without a
  shot, past its window, for a melee weapon, a helmeted head, a race the
  rule leaves out, an Archery under 60); the server (the kill, by the rule's
  facts from the records).
- T1: none.
- T2: a difftest session: a shot, its hit, a headshot claim: the legacy
  server ignores it; declared.
- T3 scenario id: lab/scenarios/b-headshot.yaml (docs/PLAN.md): c1 with
  Archery 60 and Overdraw 4 shoots c2's unhelmeted head: c2 dies on the
  server and on both screens; c2 in a helmet takes the arrow's damage only;
  c1 with Archery 40 takes no kill.
- Assertions that would fail if the verb silently regressed: c2 dead on the
  server after the unhelmeted shot, alive after the helmeted one.

## Dynamic plan (fill when any tag above is still HYPOTHESIS)

- Step 0, the mods on the lab: CIF 2.0.7 and Headshot Kills (Nexus 148579
  file 622326) into rpool/sky/persist/mods by `just persist-mods` (md5s in
  docs/MODS.md), onto both clones by `just client-mods`, Headshot Kills.esp
  into the server's load order (light by its header, TES4 flags 0x200,
  master Skyrim.esm, read from the archive 2026-10-14; libespm takes the
  flag, docs/verbs/light-plugins.md). Written as thuum branch headshots
  (8396866, stacked on the Apocalypse layer): the server loads it after
  Apocalypse's plugin and the clients before CBBE.esp, so both number it
  FE003. The archive's other files: the CIF rule
  SKSE/CoreImpactFramework/headshot.json and the effect's script
  scripts/instantdeathmagiceffectscript.pex. One boot: skse64.log says whether CIF loads on
  1.6.1170, and CIF's log at iVerboseMode=1.
- x-headshot-probe: c1 at Archery 60 (the actor-values verb) and Overdraw 4
  (Papyrus Actor.AddPerk in c1's game, a driver step; client-local, which is
  what CIF reads), with a Long Bow and iron arrows, shoots level at c2's
  head from 300 units (a level shot from the crosshair meets a same-height
  head), under the watch: c1's hits dealt and the magic effects c1 applies
  to others (a watch addition: magicEffectApply with the player as caster),
  c2's figure's health in c1's game per frame, c2's own health; then c2 in
  an iron helmet, the same shot.
- Expected if the hypotheses hold: in c1's game a magic effect from
  hInstantDeathSpell applied to c2's figure, perhaps a hit event with the
  spell as source; nothing in c2's game; the server unaware.
- Owner: agent.

## Decision for Eli

The head hit can only come from the shooter's game: the server can check
everything around it (a real shot, the bow, the bare head, the race, the
archer's skill) but not that the arrow struck the head. Is a kill that rests
partly on the shooter's word acceptable for this mod, bounded to one per
real arrow hit on a bare head? The alternative is headshots off in
multiplayer.

Decided (Eli, 2026-10-12): "for headshots i think it's ok to trust the
client a little. its fine." The kill rests partly on the shooter's word,
bounded as above (a real shot, the bow, a bare head, the race, the
archer's skill, one kill per real arrow hit), and the head hit is recorded
in this doc as unvalidated client input (CLAUDE.md rule 5).

## Status

Doc written 2026-10-10, before any code.

- [ ] doc complete, rung declared
- [ ] engine surface cited or delegated
- [ ] server logic + T0
- [ ] message + validator (same commit)
- [ ] native hook + T1
- [ ] TS handler
- [ ] T2 green
- [ ] T3 scenario green, no HYPOTHESIS tags
- [ ] ledger and suppression registry updated
