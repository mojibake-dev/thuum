<!-- Copied into thuum 2026-11-05 from a read-only design agent's report (thuum-cf). Fork citations are against m4-scripts-2b-traps
ce298e0f; CommonLib's against CommonLibSSE-NG b93280e8 in this tree; "#n" is an instruction index in lab/pex.py's disassembly of
the script's winning copy; every Ghidra read (sky-re, 1.6.1170) is HYPOTHESIS. -->

# A trap's aimed bolt: one owner, replayed (design read for the slice after playtest 47)

Read-only, 12:0x PST 2026-11-05 (20:0xZ 11-05), for Eli's direction of the same day: "we should use the same rational for other
spells following a trajectory so both people see the same projectile". The rule it serves (docs/research/
trap-slice-d-s3-2026-11-05.md's last paragraph): motion every machine computes alike plays on each seat by itself; motion that
depends on aim or physics has one owner, the seat that set it off, and the others replay it; a hit counts on the hit player's own
seat. Falling rocks already follow it (D-S3 point 4). Nothing here is built.

## 1. Which trap launches are aimed

MagicTrap (USSEP 4.3.8a's copy wins): TrapBase[Idle].onActivate keeps lastActivateRef (the trigger) and calls fireTrap, which
waits a 0.5 s spin-up (#31) and casts once per firingRate (2 s; 4.5 s for the Flames, Sparks and Frostbite streams, each ended by
interruptCast, #80) while its soul gem stays enabled (#17-26). fireByCastingType always casts from self: castingAim 0 at None
(#2-3); 1 at GetLinkedRef(TrapLink), gated by refIsValidForwardTarget (#7-29); 2 at the trigger's lastTriggerRef (#33-46),
whatever entered the box (OnTriggerEnter #2), non-actors included (acceptableTrigger #13-16). The master files place 25 at aim 2,
31 at aim 0 and 2 at aim 1 (aimed at XMarkers). The 14 trigger boxes behind Skyrim.esm's aim-2 traps leave playerOnlyTrigger
unset, so a figure can trip the other seat's copy.

| Script | How it launches | Class |
| --- | --- | --- |
| MagicTrap | as above | aimed at aim 2, fixed otherwise |
| TrapFlamethrower | the same three modes; all 104 placements aim 0 | fixed |
| DLC1TrapSpotlight | Cast(self, None) #20 | fixed |
| TrapDweBallista, DLC1TrapCrossbow, DartTrap | Weapon.Fire, which takes no target (FunctionsDump.txt:22748-22749) | fixed |
| SpearTrap | PlayAnimationAndWait #18 | fixed |
| GhostTrap | ApplyHavokImpulse at Game.GetPlayer(); never placed | aimed physics |

So the owner rule is needed for MagicTrap's aim-2 casts alone; every other trap launch stays each seat's own copy.

## 2. The engine's path (ids by `just addr`)

Spell.Cast's native 55747 is latent and queues a CastFunctor (FunctionsDump.txt:20062-20063); the functor's run 55744 takes the
source's GetMagicCaster(kInstant) (TESObjectREFR.h:288; MagicSystem.h:28), refuses a None source, and calls CastSpellImmediate
(MagicCaster.h:46). A world object's caster is a NonActorMagicCaster (NonActorMagicCaster.h:10); its slot 1
(VTABLE_NonActorMagicCaster[1], `just addr 206007`: 0x187f378) runs 34404, FindTargets, 34450 and 34452, then Projectile::Launch
44108 (Projectile.cpp:255-260). 34450 launches from the reference's "ProjectileNode" (FixedStrings.h:83), which neither caster
mesh animates; with a desiredTarget it leads the target by the projectile's speed, with none it fires along the node. 34452 puts
the trap reference itself in LaunchData.shooter (Projectile.h:85). The platform's launch hook passes only 0x14, hosted actors,
puppets and ids from 0xff000000 up (FridaHooks.cpp:1015-1022), so a trap's launch never reaches JS today.

## 3. What the existing launch relay needs

- Wire: no new field. SpellCast's caster is a bare u32 (skymp.rs:977-978) that check_spell_cast never reads (wire-validate
  lib.rs:467-478); rule 4 still rewrites that comment and WIRE.md's SpellCast row in the same commit.
- Server, R2: GetFormAt<MpActor> (ActionListener.cpp:6935) throws for a non-actor (WorldState.h:187-200). A branch before it:
  OnDestructionStage's gates (:4545-4585); a casts.rs rule, the reporter simulates the target (HostOf, as at :6939) or hosts the
  cell when nobody does; a cast with no target refused (fixed lines never travel); the origin within kMaxLaunchOffsetUnits (:1601)
  of the reference; a per-reference budget; the relay as at :4620-4628 (RelayCast, :208, takes an MpActor).
- Receiver: remoteServer.ts:1517-1520 drops a non-actor caster and MagicApi.cpp:327-331 requires an Actor (the constructor at :457
  reads its combatController, Projectile.cpp:179-184). A new native beside MagicApi.cpp:298 launches from a reference (34452 does):
  a bolt's LaunchData built by hand (the vtable as Projectile.cpp:210, the projectile as MagicApi.cpp:469-478 picks it, the carried
  origin and angles) under a guard like RelayedArrowScope (FridaHooks.h:85) so the hook never reports it back; a stream through
  GetMagicCaster(kInstant)->CastSpellImmediate, then InterruptCast (MagicCaster.h:79).
- The owner's client: the launch hook admits a trap the seam marked (TrapFamily.h:63-67's set pattern); magicSyncService.ts:220-237
  pairs that launch with the seam's batched cast (scriptCallService.ts:87-91), as hosted launches pair (:325-395).

## 4. The owner rule

A Spell.Cast row (NativeRows.inc and natives_table.rs, subject Arg0, which ScriptNatives.cpp:827-833 reads for any row) reaches
OnFamilyCall (:705-743) through the family test on akSource (:860-865) before the functor runs, so before any launch; at aim 2,
akTarget is the actor that tripped the box. OwnedHere(target) (:368-379): this seat's player or a hosted actor that is no puppet,
the cast runs, the trap is marked and the call batched; a figure or a puppet, this seat's copy is suppressed and the relayed one
plays; no target or a non-actor one, a fixed line, every seat runs its own; an actor nobody simulates, the cell's host (:377-378).
The gate cannot decide it (it reads the event's handle and name alone, FridaHooks.cpp:259-549), nor the trigger's activation (it
names the trigger, not the actor).

The suppression: the seam's skip lever takes non-latent rows only (:587-598, :872-879) and Spell.Cast is latent; dropping the
launch by nulling projectileBase (FridaHooks.cpp:1032-1040) is CONFIRMED safe for arrows (marksman.md:463-468) but likely crashes
for spells (34452 reads the new projectile with no null check, Ghidra 0x1405c00d4-0x1405c00df). So neutralize, as D-S3 point 4
does (:650-695): akSource written to None in the frame (Variable.h:71); 55744 refuses the cast, the latent call completes, the
script's loop goes on. A stream also needs an InterruptCast row (not latent, FunctionsDump.txt:17072-17073): the owner's stream
end sent, skipped where the stream is replayed.

## 5. Size, hypotheses and probes

About 5.5 agent half-days and 3 lab windows: the premise (the Dynamic section, lab/frida/trap-cast-trace.js, probes in
WarehouseTraps 0x243df: 0x7e531 aim 2 through box 0x7e532, the Sparks trap 0x7e4f7, 0x7e552 aim 0), 0.5 and a window; the
platform (the rows, the neutralize, the mark, the hook, the native, NATIVES.md, build and review), 1.75; the wire comment, the
server branch, T0 and T2, 1.25; the client, 1.0; the reads and a scenario, 1.0 and two windows. One question each:
x-trap-cast-premise (does each seat launch its own aim-2 bolt? H-TC1 the trap is the shooter, H-TC3 two launches at different
angles); x-trap-cast-fixed (is an aim-0 line identical on both seats? H-TC2); x-trap-cast-owner (only the tripping player's seat
launches, the other replays it? H-NS the neutralized copy keeps looping, H-REPLAY the replay within 1 unit and 0.5 degree of the
owner's line); x-trap-cast-hit (does the bolt hurt only the player whose screen shows the hit? H-HIT: AddTarget's refusal applies
to Actor casters alone, Hooks.cpp:225-229, and a trap's caster is a TESObjectREFR, MagicTarget.h:58); x-trap-cast-stream (does a
replayed Sparks stream end when the owner's does? H-CONC).
