# RE read, 2026-10-20: Actor::DamageActor 37335 and the rune's landing (SkyrimSE 1.6.1170)

Tools: REA 6.7.0 on sky-re over its ssh transport (the MCP layer of this session failed; same `rea` user, same command as
.mcp.json), provider Ghidra 12.1.4 on SkyrimSE-1.6.1170.0.exe.unpacked.exe seeded with seeds-1.6.1170.tsv. Every dossier
quoted below carries REA's `confidence: observed, authority: shipped-artifact`; pseudocode is decompiler output and every
reading of it is HYPOTHESIS. Ids by lab/addr.py (addrlib, 1.6.1170); a function's extent is its Ghidra body. CommonLib
cited by file:line. TE read only for its hook signature (lead). Memo sections A, B and D read. Dossiers kept in
scratchpad/dossiers/*.c and *.json (pseudocode per function), vtables in dossiers/vtables.json.

## Hypothesis: figure-values / the hook point for the local dent (question 1)
- Candidate: Address Library 37335 (0x140666d20 to 0x140666eda, 443 bytes), unnamed in CommonLibSSE-NG (grep of include/
  and src/: nothing; Actor.h names only the virtuals HandleHealthDamage 0x104 (:458) and KillImpl 0x10E (:468)). The id
  before it, 37334 = Actor::GetLevel (Offsets.h:14, SE 36344), ends 0x20 bytes earlier. Confidence: high on the shape and
  the order below, med on the parameter meanings.
- (a) Shape (Ghidra native_api, __fastcall; TE's lead `bool (Actor* this, float aDamage, Actor* apHitter, bool aKillMove)`,
  TiltedEvolution Code/client/Games/Skyrim/Actor.cpp, matches it exactly): this in RCX, the damage in XMM1 (the only
  float), the attacker Actor* in R8, a byte flag in R9B; returns `this->IsDead(false)` through vtable slot 0x99 at +0x4C8
  (Actor.h:345), i.e. "dead after this damage" (TE's wouldKill). The trace's args[1] = 0x3 is RDX, the dead integer slot of
  the float parameter: garbage, not an enum (no CommonLib enum applies). args[3] = 0 is the byte flag: melee (38586, 38627)
  and magic (35086) pass 0, fall damage (37998, 0x14069f600) passes 1; its only effect is that the difficulty multiplier
  is applied when the flag is 0 or the multiplier is below 1.0. Trace ret 0x0 = alive, consistent with Health 93.83.
- (b) No RELOCATION_ID pair exists for it in CommonLibSSE-NG. The fork already uses bare REL::ID(ae) for AE-only ids
  (origin/parity game/Offsets.h:32 PerformAction, :38 ProjectileLaunch, :55 PlaceAreaEffect).
- (c) Order inside 37335, HYPOTHESIS from the pseudocode (dossiers/37335-damageactor.c):
  1. `MagicTarget::IsInvulnerable` (vtable slot 4 of the interface at this+0xA0, MagicTarget.h:81) true, or boolFlags
     (+0x204 = 1FC+8, Actor.h:686) & kIsInKillMove (1<<14, :210): return false without touching anything.
  2. If actorState1.lifeState (+0xC8, bits 21-24, ActorState.h:114) == kEssentialDown (7, :16) and 37229 (0x140661610:
     "killable by this attacker": not kReanimate, not kEssential (bit 18), not IsChild (slot 0x5E, Actor.h:308), not
     kProtected (bit 19) unless the attacker is the player at DAT_143137698 = 401069) then lifeState = kAlive.
  3. Difficulty: 26503 (0x14041a940) indexes PlayerCharacter+0xB00 (the difficulty) into fDiffMultHPToPC{VE..L} when the
     victim is the player, fDiffMultHPByPC{VE..L} otherwise (Setting names read from the binary, values 0.5..2.5 and
     2..0.25); applied unless the byte flag is set and the multiplier is at least 1.0.
  4. If the scaled damage is positive: combatController (+0x160, Actor.h:669) notice 33224 -> 46946; if the victim is not
     the player, has currentProcess (+0xF8, :651), is not kEssential and is killable: 39188 adds the damage to
     AIProcess::trackedDamage (+0x98, AIProcess.h:210) when the attacker is the player.
  5. THE WRITE: 38468 (0x1406b27a0; (actor, modifier 2 = kDamage (ActorValues.h:182), av 0x18 = kHealth (:32), -damage,
     attacker)): picks the Health modifier triple at +0x230, clamps the delta through slot 0x127 CheckClampDamageModifier
     (+0x938, Actor.h:493), keeps the damage modifier at or below 0 (ActorValueInfo flag bit 9), writes the float, then
     38483 (AV dirty into AIProcess), 38470 (per-AV change callbacks, low-value thresholds), and, for Health with a
     negative delta, vtable slot 0x104 HandleHealthDamage(attacker, delta) at +0x820, the one the trace saw at
     SkyrimSE.exe+0x666e76 (= 37335+0x156 is the return into 37335 of that 38468 call). So the virtual is a notification
     after the write, from inside 37335; the memo's reading stands. The engine's slot-0x104 body (38606, identical in
     VTABLE_Actor/Character/PlayerCharacter[0] slot 0x104, read from the vtables): if not dead, hp = GetActorValue(Health);
     38631 (bleedout: Actor::SetLifeState(8 = kBleedout) under the bleedout chance settings) else if hp <= 0 then 37316
     records myKiller (+0x108, Actor.h:654) and queues the kill through TaskQueueInterface (36911), which reaches KillImpl
     (slot 0x10E = 37896) on the task. The bleedout and kill checks therefore sit INSIDE the gated region.
  6. 19526 (destructible-object damage of the ref's base, a no-op for actors, HYPOTHESIS) now or as task 0x116c (36893).
  7. return IsDead(false).
  Outside, in the callers (callers of 37335: 35086, 36991, 37336, 37348, 37998, 38586, 38627):
  - 38627 (0x1406ba870, the melee hit's outer function; CoreImpactFramework detours its callee 38586): HitData::Populate
    (HitData.h:47), the BGSImpactManager impact (blood and impact decals, vfunc 1 of the manager's +8 source) at
    0x1406bacd6+, THEN 38586(victim, &hitData), THEN 37335(attacker, hitData.reflectedDamage (+0x78, HitData.h:73),
    victim, 0) for Reflect Damage. So blood and impact are before, and not inside, 37335.
  - 38586 (0x1406b7bc0, "ProcessHitVictim" in docs/research/m3/re-ai-puppet.md:210): builds the TESHitEvent (target,
    cause, source weapon formID, projectile 0, flags from HitData.flags +0x80) and sends it through 38668
    (BSTEventSource<TESHitEvent> at ScriptEventSourceHolder+0x5D8, ScriptEventSourceHolder.h:82) at lines 134-176, and the
    sneak and critical UI (lines 183-221), BEFORE its 37335 call at line 230; after the call: the on-hit enchantment cast
    (GetMagicCaster(3) slot 0x5C), the armor and perk passes through 38468, then the reaction block (lines 320-707:
    AIProcess::KnockExplosion, animation notifies 0x1408022b0, combat-controller notice) gated on a fresh IsDead(false). Its
    use of the return: only `bVar6` for the enchantment-cast condition.
  - 35086 (magic ValueModifier damage; TE-MAP's ApplyActorEffect): 37335(target, -magnitude, caster, 0), reads the return
    with myKiller; 37336 (environmental, attacker 0), 37348 (drowning, player), 37998 (fall, flag 1); 36991 (0x140656f30,
    9434 bytes, the Actor update ancestor in the trace frames, call at +0x545) exceeded REA's response budget, unread.
  Consequence for a gate at 37335's entry on a figure victim (return false = alive): skipped are items 2 to 7 (state reset,
  combat notice, trackedDamage, the write with its three notifications including bleedout and kill, the destructible task);
  kept are the TESHitEvent, blood and impact, the sneak and critical messages, the enchantment cast, the armor and perk
  passes, stagger, knockdown and animation reactions, and the reflect path. This covers melee, magic (35086), fall,
  drowning and the explosion pass (43849, ADR-037) in one place, since all of them land through 37335.
- (d) SE (1.5.97) id: UNKNOWN by these tools (no 1.5.97 program in the Ghidra project; no CommonLib pair). Lead,
  HYPOTHESIS low: AE 37334 (GetLevel, SE 36344) is adjacent in id and in address; if the SE database keeps the adjacency,
  SE 36345. Not usable until verified; REL::ID(37335) alone is the fork's existing idiom.
- Side effects (HYPOTHESIS): see (c); nothing in 37335 raises or consumes the hit event; the "second kill" and bleedout live
  in slot 0x104's body, reached through the write.
- Suggested Frida trace: replace 37335 with a NativeCallback `(pointer, float, pointer, uint8) -> uint8` so the float reads
  as the ABI passes it; log this, attacker, damage, flag, and the return; expect flag 0 for sword and spell hits, 1 for a
  fall, return 0 while alive; hook 38606's callee 37316 to see the kill queued only when Health reaches 0.
- What would falsify this: a sword hit whose damage does not appear in XMM1 at 37335's entry; a dent on a figure with no
  37335 row (another write path); a TESHitEvent missing on the hitter's seat after a gate that returns at entry.

## Hypothesis: spell-cast / the rune's look on the observer (question 2)
- Candidate for the missing glyph: 34452 (0x1405bfd60, the magic caster's target-location launch, the one
  target-location.md:18 names; callers 34410 MagicCaster::FindTargets (MagicCaster.cpp:19), 34450, 34451), lines 167-218
  of its pseudocode: after `Projectile::Launch` (44108) it tests the new projectile's vtable slot 0xAE (GrenadeProjectile
  43923, CommonLib Unk_AE; the same gate the rune registration 43934 uses) and, given the pick struct (param_9) with a
  collidable (+0x80), calls 44186 (0x1407e9be0) with (projectile, the pick's position = LaunchData.origin, the pick's
  normal scaled by 69.99, the material id from 44190 (0x1407ea500: BGSMaterialType from the hit shape, landscape via
  TES::GetLandMaterialType; BGSMaterialType.h:51 materialID at +0x30), 1, 0, slot 0x9F GetDecalGroup (the grenade's own
  decal group, allocated in the grenade constructor 43911), 1). 44186's only callers are 34452 and 44213; it ends in
  BGSDecalManager (line 314): it is the decal placement. The relay (MagicApi.cpp:302) calls 44108 directly and never
  passes through 34452, so no decal is ever requested for the figure's rune. Confidence: high that this is the only decal
  path a rune born at rest can take (both 44213 and 43919 are collision-fed, below); med that the glyph is this decal and
  not a particle (the pale haze on 067-c1.png is T4).
- (a) Paths. 43919 is GrenadeProjectile's vtable slot 0xB2 (ReportHavokDeactivation, GrenadeProjectile.h:40; read from
  VTABLE_GrenadeProjectile[0] 209962): no static caller, a Havok callback; its body parks the 3D (NiAVObject::SetMotionType)
  when the base has kExplosionAltTrigger (BGSProjectile.h:21) and explosionProximity > 0 (:52). 44213's callers: 44123
  (Projectile::ProcessImpacts, slot 0xAC, at its line 57 when the impacts list (+0xA0) is non-empty and bits 22 and 23
  are clear), 44205 (0x1407ec130, the hit handler under HandleHits 44204, slot 0xBE, line 83) and 43806; the first two are
  the collision landing, fed by AddImpact (44203, grenade override 43935). Projectiles are keyframed phantoms (44114
  InitHavok: bhkSimpleShapePhantom, SetMotionType 4): they move only by the engine's own integration of linearVelocity,
  which 44184 InitVelocity (called from 44222) sets to base speed x power mult x weapon mult x speedMult (+0x194 = 1.0
  from the base constructor 44100). Memo D shows both runes at rest: with no motion there is no impact, so neither 44213
  nor 43919 ever runs for a target-location rune in either game, exactly as D measured (no rows on c1 or c2).
  The 44216/44217 condition: 44216 (the grenade trigger tick, from GrenadeProjectile::UpdateImpl 43915, slot 0xAB) returns
  early unless parentCell and explosion are set, then for an alt-trigger base with explosionTimer (+0x1A8) still FLT_MAX
  and proximity != 0 it calls 44217; 44217 scans ProcessLists::highActorHandles (ProcessLists.h:69) for actors within
  proximity (times fMineExteriorRadiusMult outdoors, 1.0) that are not flying, not IsChild, not ghosts, calling 44163 for
  each (call at +0x1be, return +0x1c3), then, if none fired and flag bit 14 is clear, tests the local player (call at
  +0x242, return +0x247) followed by the perk roll BGSEntryPoint 3 kCalculateMineExplodeChance (BGSEntryPoint.h:16). 44163
  is the per-candidate validity test, not an arrival: it refuses the shooter unless iProjectileMineShooterCanTrigger (0),
  the dead (slot 0x99), owner-faction members (Actor::GetFactionRank), relationship >= 2 (37666) and the shooter's
  commanded actors (37658); on success 44217 sets explosionTimer = fMinesDelayMin (0.1) and the tick counts it down to the
  explosion (43829) and the kill 44110. Memo D's "+0x247 vs +0x1c3" is therefore which candidate stood within 150 units:
  on c1 the player itself (refused as shooter, ret 0), on c2 c1's figure (refused as shooter, ret 0). Not a shooter branch.
- (b) Bit 20 = kAddedVisualEffectOnGround (Projectile.h:156): cleared by Launch (44108, `& 0xffefffff`), set only in
  44213 (line 92) as its once-per-landing latch; no other writer found (a byte search for or/test on +0x1D4 with 0x100000
  found none; the compiler keeps the flags in a register). Clear on both runes in D, as predicted.
- (c) 44163 returning 0 = the candidate may not trigger (here: it is the shooter). 44222 (the deferred 3D init run from the
  manager's pending list 44094 each frame until the model is loaded; it sets kInited, calls slot 0x66 InitHavok, slot 0xC0
  Handle3DLoaded (43936, which sets bits 2 and 15: 0x20010100 -> 0x20018104 as traced), slot 0xA9, 44184) returns a bool in
  AL: 0x80000001 is true with stale upper bits, "initialized on this call"; 0 would mean "model not ready yet".
- (d) Discriminator: not velocity (both at rest; D), not kUseOrigin/kAutoAim (D's H-D2): 44163 and 44217 never read those
  bits; Launch sets bit 21 only for a player shooter (`if shooter == player: autoAim ? |= 0x200000 : &= ~0x300000`), so
  the relay's autoAim value is dead for a figure; the base constructor 44100 copies LaunchData.useOrigin into bit 29, whose
  only reader found is 44222's position snap for NON-grenades. Flipping both in MagicApi.cpp changes nothing visible for a
  rune (prediction, falsifiable by the memo's own test). The difference is 34452's post-Launch decal call. Smallest
  intervention, in order of size: (1) after the relay's Launch, when the new projectile's slot 0xAE is true, call 44186
  as 34452 does: (projectile, &origin, &normal, materialId, 1, 0, projectile->GetDecalGroup() via slot 0x9F, 1), with the
  normal from the caster's LaunchData.contactNormal (+0x14; 34452 copies the pick's normal into it, so the Launch-entry
  reader in FridaHooks.cpp:433-446 can relay it beside origin and angles) and the material id read on the caster (44186's
  fourth argument at its entry, or 44190's result) and relayed with the cast; failing a relayed material, landscape via
  TES::GetLandMaterialType at the point (what 44190 does for shape material 0x11). (2) Calling 34452 itself needs a pick
  struct (+0x30 normal, +0x50 shape keys, +0x80 collidable, +0xc0 flag) the observer does not have. Native only (rule 9),
  filtered on a dynamic-form shooter; the per-figure rune cap stays (40674 registers the player's runes alone).
- Side effects (HYPOTHESIS): 44186 also spawns the impact's particle and plays nothing itself (sounds are 44213's); the
  decal lives in the grenade's decal group and dies with the projectile (GetDecalGroup is virtual on it).
- Suggested Frida trace: on the CASTER's seat hook 44186 (log args 2 to 4 and 7, return address: expect one call at the
  cast from inside 34452 near +0x359) and 44190 (the material id); on the observer expect zero 44186 calls for the figure's
  rune; after the intervention, one 44186 call on the observer and the glyph in its screenshots. Read RuneFrostProjectile
  0x5FBBF's speed and gravity with lab/esm.py (both 0 expected, the static reason both runes rest).
- What would falsify this: a 44186 call on the caster's seat that does not come from 34452; a glyph appearing on the
  observer after flipping autoAim/useOrigin alone; a 44213 or 43919 row for the player's own rune in a later trace.
