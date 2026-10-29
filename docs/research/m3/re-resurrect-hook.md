# RE read: where a hosted body's resurrection can be hooked (1.6.1170)

Static read for npc-fate's reanimation hook (fork m3-reanimate 9ef0d567,
skyrim-platform Hooks.cpp `HostedResurrect`, a write_vfunc on
VTABLE_Character[0] slot 0xAB). Binary: SkyrimSE-1.6.1170.0.exe.unpacked.exe
in the sky-re Ghidra project (REA was down). Ids are Address Library ids from
addrlib's versionlib-1-6-1170-0.bin, the AE column of CommonLib's VariantID.
Every behaviour below is decompiler output: HYPOTHESIS until a trace confirms it.

## Why the slot-0xAB hook logged nothing

The slot is right; the Reanimate effect never calls it.

- Character's vtable (VTABLE_Character[0], id 207886, Offsets_VTABLE.h:2215)
  holds id 37321 at slot 0xAB, the same pointer Actor's vtable (id 207511)
  holds there. PlayerCharacter (id 208040) overrides the slot with id 40491,
  which calls 37321. 37321 is Actor::Resurrect (Actor.h:369); CommonLib's own
  src/RE/A/Actor.cpp:1355 relocates the virtual to 0xAB on SE and AE, 0xAD on VR.
- Papyrus Actor.Resurrect is native id 54736. After the "is dead from the
  editor" check (id 19558: formType 0x3E ACHR, FormTypes.h:202, and formFlags
  bit 9; HYPOTHESIS: the reference's Starts Dead flag, which the header does
  not list) it queues a SkyrimScript::ResurrectFunctor (VTABLE id 217348,
  Offsets_VTABLE.h:4344) on the VM; the functor's operator() (id 54639) calls
  `vtbl+0x558`, slot 0xAB, with (true, Get3D() != nullptr). Papyrus Resurrect
  is therefore asynchronous, and it does pass through the slot.
- The console's ResurrectActor executor (id 22037, the SCRIPT_FUNCTION entry
  naming "ResurrectActor" and "resurrect") calls slot 0xAB the same way.
- ReanimateEffect::Start (id 34750, slot 0x14 of VTABLE_ReanimateEffect id
  206016) has no slot-0xAB call and no call to 37321; 37321's only direct
  caller is 40491. So possibility (1) holds; (2) and (4) are false; (3) is
  moot for this path and testable: console `resurrect` on a hosted body must
  print the thunk's line if slot 0xAB is still ours.

## What the Reanimate archetype does (HYPOTHESIS throughout)

Start (34750) resolves CommandEffect::commandedActor (CommandEffect.h:27) and
acts only when its lifeState is kDead (actorState1 at Actor+0xC8 in AE, bits
21 to 24, ActorState.h:114; the +8 over SE is TESObjectREFR.h:486):

1. Heals: GetActorValueModifier(kDamage, kHealth) (id 38469, Actor.cpp:271),
   then id 38455 with the negated value (RestoreActorValue by shape).
2. Sets boolFlags bit 8, kShouldAnimGraphUpdate (Actor.h:686 lists boolFlags at
   0x1FC on SE; the binary reads 0x204).
3. Stores the caster as commanding actor (id 39577 writes
   MiddleHighProcessData+0xE0, what AIProcess::GetCommandingActor reads,
   AIProcess.cpp:37-40).
4. Visits the animation graphs (id 32951). If none is live: the no-animation
   route, two TaskQueueInterface calls (ids 36925, 36921 on the singleton
   DAT_1431993a0) and id 38820. Otherwise: graph variable iGetUpType = 0
   (FixedStrings+0x590, FixedStrings.h:196; the singleton is DAT_1420f6370,
   id 11437 returns it) and the default-object action kActionGetUp (index 108,
   BGSDefaultObjectManager.h:121) through TESActionData. The body plays its
   get-up; at its end GetUpEndHandler (VTABLE id 208949, Offsets_VTABLE.h:2453,
   slot 1 is id 42880) reads iGetUpType and, for 0, calls id 38820.
5. CommandEffect::Start (id 34260).

Id 38820 is the reanimation proper. It needs an AIProcess with a commanding
actor; it calls id 37490, which is SetLifeState(kReanimate) (37490 shifts its
bool left by two and calls id 37612; 37612 is Actor::SetLifeState per
CommonLib Actor.cpp:1034, RELOCATION_ID(36604, 37612)); it clears
actorState2.reanimating (ActorState.h:128), runs the caster's perk entry point
kApplyReanimateSpell (53, BGSEntryPoint.h:66, via HandleEntryPoint id 23526,
casting the result with id 38766) and clears the commanding actor (id 39574).
Actor::MoveToMiddleHigh (slot 0xF4, Actor.h:442, id 37624) also calls 38820
for a dead actor that still carries a commanding actor: the post-load re-entry.

Update (34746) only watches: unk98 (ReanimateEffect.h:24) turns false once
lifeState reads kReanimate, and CommandEffect::Update (34256) runs from then
on. Finish (34751): a thrall not yet dead is killed through id 37316 (writes
the killer handle at Actor+0x108 and queues the kill on the task queue, id
36911; not the KillImpl body, which slot 0x10E shows at another address);
either way actorState2.reanimating is cleared, then CommandEffect::Finish
(34261). A reanimated body lives at lifeState kReanimate (4) for the effect's
whole life; nothing here moves it to kAlive. Dead Thrall: the engine builds a
ReanimateEffect for every MGEF of archetype Reanimate (TE numbers it 22,
MagicSystem.h:107); whether DeadThrall's record carries it is an espm read.

## Actor::Resurrect itself (37321)

Returns early on a Starts Dead reference (id 19558). Otherwise, in order:
SetDelete(false) (TESForm slot 0x23, TESForm.h:158); the ActorState reset id
38989 (`actorState1 = 0`, so lifeState is kAlive at once; actorState2 is masked
with 0xFFFF9008 and ORed with 0x1008); a MagicTarget dispel; kActionResetAnimationGraph
(index 106, BGSDefaultObjectManager.h:119) through TESActionData; boolBits
kSetOnDeath then kDead cleared (Actor.h:170, bit 11 at Actor+0xE8); health
restored to base; a TaskQueue 3D refresh; ResetInventory(false) when
a_resetInventory (slot 0x8A); SetLifeState(kAlive), a no-op by then; a new
AIProcess when none exists. The dead state is cleared inside the call.

## Where IsDead reads

Actor::IsDead (slot 0x99, Actor.h:345, id 37483) reads actorState1 only: dead
when lifeState is kDying, kDead or kRecycle, plus kEssentialDown when
a_notEssential is false. kReanimate reads alive. After 38820 returns the body
reads alive; after 37321 returns, likewise. Neither path defers the flip, so
an onLeave IsDead check is sound; the HostedResurrect thunk's deadAfter read
would have been valid had the call ever come.

## Recommended hook points

Two functions cover every revival of a hosted body:

- Id 37321, `void Actor::Resurrect(Actor* this, bool a_resetInventory, bool
  a_attach3D)` (rcx, dl, r8b): console, Papyrus (via 54639), PlayerCharacter,
  any plugin calling the virtual.
- Id 38820, `void (Actor* this)` (rcx): both Reanimate routes and the
  MoveToMiddleHigh re-entry. Same coverage with more noise: id 37612,
  `void Actor::SetLifeState(Actor*, ACTOR_LIFE_STATE)`, filtered on edx == 4.
  37612 cannot serve the Resurrect path: 37321 zeroes the state with 38989
  first, so its SetLifeState(kAlive) looks like any alive-to-alive call.

Install them the way the platform installs its Frida hooks: a HookID
(FridaHookHandler.h:12-23), then `HookHandler::GetSingleton()->Install(id,
address, std::make_shared<Frida::Hook>(onEnter, onLeave))` from
Frida::InstallHooks (FridaHooks.cpp:220-228, 387-400; FridaHookHandler.cpp:103),
the address from a REL::Relocation in game/Offsets.h:11-33 (an AE-only
REL::ID suffices under ADR-025). Filter in onEnter on `ic->cpu_context->rcx`
as the Actor: formID at +0x14 (TESForm.h:354) against Hosted::Is, lifeState
from +0xC8 before and, in onLeave, after. Both are plain function entries
(HYPOTHESIS until Attach logs OK). If the hosted-body rule still wants AI on
before the engine revives (H-54e), 38820's onEnter is the place: its
precondition is the AIProcess pointer and the commanding actor, not kProcessMe.

## Suggested Frida trace

Hook 37321, 38820, 37612 (log edx), 42880 and 34750 on the host seat; log the
actor's formID, lifeState before and after, the return address. Scenario: a
hosted necromancer casts Raise Zombie on a dead bandit (expect 34750, 42880,
38820, 37612 with 4, no 37321); console `resurrect` on the body (expect 22037,
37321, 38989, and the thunk's line if slot 0xAB is still ours); Papyrus
Actor.Resurrect through a snippet (expect 54736, then 54639 and 37321 later).

## What would falsify this

A 37321 entry during a Reanimate cast (Start reaches it through a call the
decompiler hid); lifeState kAlive on a standing thrall (something outside
these functions finishes the transition and 38820 alone is too early); no
38820 on the no-graph route (36925 or 36921 do the revival); a slot-0xAB probe
showing another module's pointer (possibility (3) held as well).
