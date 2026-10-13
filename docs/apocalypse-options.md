# Apocalypse 10.2.3 under ADR-029: option A against option B, costed

Read-only research, 2026-10-12, for Eli's call on docs/DECISIONS.md ADR-029
(proposed, :742-800). Nothing in the repo or the fork was changed.

- **Fork**: skymp checked out at ef3fb03c, the commit docs/NATIVES.md was
  generated from (NATIVES.md:3). Fork paths below are relative to skymp/.
  CommonLibSSE-NG at b93280e8.
- **Mod**: lab/.cache/mods/apocalypse-10.2.3 (the ESP and the 206 .pex,
  byte-identical to the globals survey's extraction).
- **Method**: session scripts, not kept, that rebuild in an hour from these
  steps. Resolve every call instruction to the native it lands on (lab/pex.py,
  with the fork's compiled standard scripts in
  unit/papyrus_test_files/standard_scripts for the class chain, the ledger for
  status). Add each effect script's MGEF deliveries, a small dataflow (akTarget,
  akCaster, the player) and the natives reachable from each event. Resolve
  what PlaceAtMe places and what Spell.Cast casts through the ESP's VMAD. Sort
  the effect scripts for the hybrid.
- **Marks**: INFERRED is a reading of code or data that no run confirmed.
  HYPOTHESIS is engine behavior that needs a lab run or a Frida trace (rule 2).

## Summary

- Apocalypse calls 175 distinct natives at 2,447 call sites (counting rule in
  1.1). The server does not implement 107 of them (106 missing, 1 stub):
  1,238 call sites, 1,131 of them in live scripts and 846 in live
  ActiveMagicEffect scripts. Nothing is "not in the ledger" any more: Math
  joined the ledger from the Creation Kit wiki (NATIVES.md:946-965).
- By category: **S 46** natives (663 live sites), **E 13** (217), **C 39**
  (185), **W 3** (13), **N 6** (53). 31 of the 107 are uncertain (S 24, E 3,
  C 3, W 1). Three S natives carry 396 of the 663 live S sites:
  GlobalVariable.GetValue 186, SetValue 125, ReferenceAlias.GetReference 85.
- The W row understates W: the world-object work rides natives the ledger
  already counts as delegated or implemented (PlaceAtMe 81 sites, MoveTo 56,
  Delete 93), and 14 of the mod's explosions place scripted activators that
  the server never creates (2.7).
- Of the 157 live effect scripts, 73 ride Self effects (the caster, or a
  summon's own ability) and 84 reach a target; 62 of those 84 change the
  target's state. Only 64 of the 157 could run on the server with no client
  call at all; 93 need at least one C native or a client-rendered call.
- **Option A costs 7 to 12 sessions** to b-apocalypse (5 to 8 without Raise
  Wall), and leaves 62 target scripts doing nothing to other players.
- **Option B costs 25 to 40 sessions** for the whole mod, 12 to 19 to
  b-apocalypse, before M3 (summoned actors), M5 (skills, perks) and M6
  (quests) dependencies.
- **Hybrid** (section 4): the data does not make the "server runs only the
  scripts that touch others or the world" split cheap (65 scripts, 61 of the
  85 missing natives that live effect scripts call, and all of B's fixed
  runtime). What it supports is ordering: A by default now, and the server's
  VM running effect scripts by allowlist, verb by verb, the shape ADR-008 and
  TES3MP's variable scopes already use. Total near B's (22 to 35), first
  playable Apocalypse at A's cost.

## 1. Natives the server does not implement

### 1.1 Counting

A call site is one call instruction (callmethod, callstatic, callparent, or a
property read or write on another object) resolved to the native it lands on.
A call to a non-native vanilla function counts once for each native its body
calls, unless the server registers that function itself, in which case the
server's native runs and the call counts once for it (the VM tries natives
before script bodies for a form with no script instances:
papyrus-vm/src/papyrus-vm-lib/VirtualMachine.cpp:270-329). So:

- GlobalVariable.Mod, GetValueInt, SetValueInt and .Value are script code over
  GetValue and SetValue (globals survey section 3, INFERRED: the game's
  GlobalVariable.pex is not here); Mod counts once for each.
- ReferenceAlias.GetActorRef, GetActorReference and GetRef count as
  GetReference; Location.IsSameLocation as HasCommonParent (INFERRED from the
  vanilla .psc shape, not on this machine).
- Actor.AddToFaction, Quest.GetStage and Game.FindClosestReferenceOfTypeFromRef
  are registered by the server (NATIVES.md:78, :1193, :695) and count as
  implemented.

This is why the totals differ from docs/MODS.md's (165 natives, 2,092 sites,
read on 2026-10-10 against an older ledger): the wrapper expansion, Math in
the ledger, and M2's new natives.

"Live" excludes 14 scripts: the nine vanilla overrides (BladesSparringScript,
the C00 trainers and fighters, CompanionsSingleCombatantScript, DGIntimidate's
two, MS11CalixtoScript), whose carriers are Skyrim.esm's records, unread here,
so they may well be live in the game (INFERRED); and five dead mod scripts
(WB_DispelSpam_Script, WB_InvisibleManagerInCombat_Script and ...2, carried
by nothing; WB_DispelAfterDelay_Script and WB_Withershins_Script, whose MGEFs
are in no spell, scroll or enchantment).

Categories, as the brief defines them: **S** server state the server already
models or plainly owns; **E** the effect-script runtime; **C** needs a
client's engine (on the server only a delegation, so R2 or R3); **W** world
objects the server would own; **N** math, strings, record reads. A `?` marks
an uncertain call.

### 1.2 By category

| Cat. | Natives | Live call sites | All call sites | Live sites in effect scripts |
| --- | --- | --- | --- | --- |
| S | 46 | 663 | 736 | 411 |
| E | 13 | 217 | 231 | 200 |
| C | 39 | 185 | 194 | 170 |
| W | 3 | 13 | 13 | 12 |
| N | 6 | 53 | 64 | 53 |
| total | 107 | 1,131 | 1,238 | 846 |

- S without the two globals natives and ReferenceAlias.GetReference: 43
  natives, 267 live sites.
- 99 of the 107 have a live call site; 8 are called only by the vanilla
  overrides.
- Uncertain: 24 S (mostly quests, aliases and form-list runtime state, which
  the server does not model yet), 3 E, 3 C, 1 W.

### 1.3 The table

Ledger line numbers are docs/NATIVES.md's. "Scripts (live)" counts live
scripts with at least one call.

| Native | Ledger | Call sites (live / all) | Scripts (live) | Cat. | Note |
| --- | --- | --- | --- | --- | --- |
| GlobalVariable.GetValue | missing (:813) | 186 / 187 | 34 | S | a GLOB reader (libespm has none) and a value store; 110 direct, 51 through Mod, 22 GetValueInt, 4 .Value |
| GlobalVariable.SetValue | missing (:814) | 125 / 129 | 17 | S | the same store, split per player or world (globals survey 4d); 59 direct, 51 Mod, 15 SetValueInt, 4 .Value |
| ReferenceAlias.GetReference | missing (:1228) | 85 / 96 | 14 | S? | quest alias fills: the server instantiates no quest or alias script (M6, ADR-008); 18 via GetActorRef, GetActorReference, GetRef |
| ActiveMagicEffect.RegisterForSingleUpdate | missing (:46) | 53 / 59 | 33 | E | per-instance timer; Form's twin exists (PapyrusForm.cpp:19-51) |
| ActiveMagicEffect.Dispel | missing (:27) | 45 / 46 | 39 | E | ends the running effect, then OnEffectFinish |
| ImageSpaceModifier.Apply | missing (:825) | 42 / 42 | 33 | C | a screen effect; R3 in the game whose screen it is |
| SPELL.Cast | missing, latent (:1285) | 37 / 44 | 29 | E? | the effect rule applies the cast spell; a projectile spell (5 of the resolved sites) needs a client's engine (C) |
| ObjectReference.GetAngleZ | missing (:1024) | 29 / 29 | 18 | S | every server reference has an angle; 8 sites through TranslateToRef |
| Actor.GetEquippedSpell | missing (:130) | 28 / 30 | 15 | S | the hands' spells the server records for spell-cast |
| ActiveMagicEffect.RegisterForUpdate | missing (:50) | 24 / 24 | 24 | E | repeating per-instance timer |
| Math.Cos | missing (:951) | 21 / 21 | 14 | N |  |
| Math.Sin | missing (:963) | 21 / 21 | 14 | N |  |
| SPELL.RemoteCast | missing, latent (:1303) | 19 / 19 | 17 | E? | as Cast, with a blamed caster; a projectile spell (5 of the resolved sites) needs a client (C) |
| Game.AdvanceSkill | missing (:682) | 17 / 18 | 16 | S | skill experience is the actor-values record's; computed R0 only from M5 |
| Actor.DispelSpell | missing (:93) | 16 / 16 | 14 | S | the server's running effects by source |
| FormList.Revert | missing (:677) | 16 / 16 | 9 | S? | runtime edits to an FLST the server reads (GetAt, GetSize, Find exist) |
| ObjectReference.TranslateTo | missing (:1139) | 16 / 16 | 12 | C | the engine moves the reference along a path; 8 sites through TranslateToRef |
| Actor.StartCombat | missing (:266) | 14 / 15 | 11 | C | AI; between players the server already decides (ADR-023) and snippets it (ledger :266) |
| ActiveMagicEffect.GetTargetActor | missing (:32) | 13 / 13 | 11 | E |  |
| ObjectReference.GetAngleX | missing (:1022) | 13 / 13 | 11 | S | as GetAngleZ; 8 sites through TranslateToRef |
| ObjectReference.InterruptCast | missing (:1073) | 13 / 13 | 8 | C? | the engine's cast; the server could close a recorded concentration span |
| ObjectReference.GetAngleY | missing (:1023) | 12 / 12 | 10 | S | as GetAngleZ; 8 sites through TranslateToRef |
| FormList.AddForm | missing (:670) | 11 / 11 | 8 | S? | runtime additions to an FLST, kept in memory |
| Quest.Stop | missing (:1211) | 10 / 13 | 9 | S? | quest state (ADR-008, M6) |
| Actor.SetPlayerTeammate | missing (:254) | 10 / 10 | 8 | C? | follower AI; no server model |
| ObjectReference.GetCurrentLocation | missing (:1031) | 9 / 11 | 3 | S? | from the cell's and worldspace's location records; exteriors unchecked |
| Actor.Kill | missing (:201) | 9 / 9 | 7 | S | death is R0 (ADR-028; MODS.md Headshot) |
| ObjectReference.PushActorAway | missing (:1105) | 9 / 9 | 7 | C | physics |
| Actor.HasSpell | missing (:164) | 8 / 8 | 6 | S | learned spells (MpChangeForms.h:79) and the records' own |
| Actor.SetCriticalStage | missing (:236) | 8 / 8 | 4 | C | death visuals (ash, ice) |
| ObjectReference.PlaceActorAtMe | missing (:1095) | 8 / 8 | 8 | W | an actor the server would own and a host would have to run (M3) |
| Actor.StopCombat | missing (:270) | 7 / 8 | 5 | C | AI |
| Actor.DoCombatSpellApply | missing (:94) | 7 / 7 | 7 | E | a spell applied as a hit: the effect rule |
| Actor.EnableAI | missing (:96) | 7 / 7 | 4 | C | AI |
| Game.shakeCamera | missing (:797) | 7 / 7 | 7 | C | camera; 2 sites through RampRumble |
| Quest.Start | missing, latent (:1210) | 6 / 7 | 6 | S? | quest state (M6); latent |
| ActiveMagicEffect.UnregisterForUpdate | missing (:73) | 6 / 6 | 5 | E |  |
| Game.SetCameraTarget | missing (:777) | 6 / 6 | 3 | C | camera |
| LeveledItem.AddForm | missing (:868) | 6 / 6 | 2 | S? | runtime leveled-list edits (MCM and a quest only) |
| ObjectReference.HasEffectKeyword | missing (:1069) | 6 / 6 | 4 | S | running effects and the MGEF's keywords |
| ObjectReference.SetScale | stub, latent (:1134) | 6 / 6 | 6 | S | stub; decided a verb of its own (ledger :1134) |
| SPELL.IsHostile | missing (:1301) | 5 / 16 | 4 | N | a record read |
| Quest.IsRunning | missing (:1199) | 5 / 7 | 4 | S? | quest state (M6) |
| Actor.HasMagicEffect | missing (:160) | 5 / 5 | 4 | S | the server's running effects |
| FormList.HasForm | missing (:675) | 5 / 5 | 4 | S | a record read plus runtime additions |
| Location.HasCommonParent | missing (:892) | 5 / 5 | 3 | S | LCTN records; 3 sites through IsSameLocation (INFERRED wrapper) |
| ObjectReference.StopTranslation | missing (:1137) | 5 / 5 | 5 | C |  |
| Actor.AttachAshPile | missing (:81) | 4 / 4 | 4 | W? | an ash pile holds the corpse's items in the world; or C if only visual |
| Actor.GetLevel | missing (:141) | 4 / 4 | 4 | S | the actor-values record |
| Actor.IsInKillMove | missing (:187) | 4 / 4 | 4 | C | animation state |
| Actor.UnequipSpell | missing (:278) | 4 / 4 | 2 | S | equipment |
| Form.UnregisterForUpdate | missing (:668) | 4 / 4 | 3 | E | timers for reference and quest scripts |
| Game.SetPlayerAIDriven | missing (:788) | 4 / 4 | 2 | C | player control |
| Math.Abs | missing (:946) | 4 / 4 | 2 | N |  |
| Quest.IsStopping | missing (:1203) | 4 / 4 | 4 | S? | quest state (M6) |
| ActiveMagicEffect.RegisterForAnimationEvent | missing (:35) | 3 / 3 | 2 | E? | anim events reach the server only through the animation relay |
| Actor.IsHostileToActor | missing (:184) | 3 / 3 | 3 | S? | ADR-023 between players; factions and relationships for NPCs |
| Actor.SetPlayerControls | missing (:252) | 3 / 3 | 2 | C | player control |
| Actor.SetRace | missing (:255) | 3 / 3 | 1 | S? | the race in the server's appearance record |
| Game.FindRandomActor | missing (:696) | 3 / 3 | 3 | S? | the server's grid of actors; 3 sites through FindRandomActorFromRef |
| Game.ForceFirstPerson | missing (:699) | 3 / 3 | 3 | C | camera |
| Game.TriggerScreenBlood | missing (:806) | 3 / 3 | 2 | C | screen effect |
| LeveledItem.Revert | missing (:875) | 3 / 3 | 1 | S? | runtime leveled-list edits (the MCM only) |
| ObjectReference.GetLockLevel | missing (:1048) | 3 / 3 | 1 | S? | locks (M4) |
| ObjectReference.PlayImpactEffect | missing (:1100) | 3 / 3 | 2 | C | visual |
| ReferenceAlias.ForceRefTo | missing (:1227) | 3 / 3 | 3 | S? | quest aliases (M6) |
| Actor.SendAssaultAlarm | missing (:224) | 2 / 3 | 2 | C | crime AI |
| ActiveMagicEffect.GetCasterActor | missing (:29) | 2 / 2 | 2 | E |  |
| Actor.HasPerk | missing (:163) | 2 / 2 | 2 | S? | perks (M5) |
| Actor.IsInCombat | missing (:185) | 2 / 2 | 2 | C | AI combat state |
| Actor.SetGhost | missing (:245) | 2 / 2 | 1 | S? | a flag the server's hit rules would honor |
| Form.RegisterForSingleUpdateGameTime | missing (:637) | 2 / 2 | 1 | E | on the server clock (WaitGameTime's conversion, PapyrusUtility.cpp:63-74) |
| Form.RegisterForUpdate | missing (:640) | 2 / 2 | 2 | E | repeating; the single one exists (PapyrusForm.cpp:19-51) |
| FormList.RemoveAddedForm | missing (:676) | 2 / 2 | 1 | S? | runtime additions to an FLST, kept in memory |
| ImageSpaceModifier.Remove | missing (:828) | 2 / 2 | 2 | C | screen effect |
| ObjectReference.SetActorCause | missing (:1115) | 2 / 2 | 2 | S? | blame for a placed hazard's damage (ADR-028) |
| Quest.IsCompleted | missing (:1195) | 2 / 2 | 1 | S? | quest state (M6) |
| Weather.ForceActive | missing (:1473) | 2 / 2 | 1 | C | each game's weather until M4 makes it a server global |
| Actor.DispelAllSpells | missing (:92) | 1 / 2 | 1 | S | the server's running effects |
| Actor.GetCombatState | missing (:119) | 1 / 2 | 1 | C | AI combat state |
| Actor.GetCombatTarget | missing (:120) | 1 / 1 | 1 | C | AI combat state |
| Actor.GetKiller | missing (:140) | 1 / 1 | 1 | S | the death path knows it (DeathEvent.cpp:6-19) |
| Actor.IsBeingRidden | missing (:171) | 1 / 1 | 1 | C | mounts (M3) |
| Actor.IsCommandedActor | missing (:175) | 1 / 1 | 1 | C | summons (M3) |
| Actor.IsPlayerTeammate | missing (:192) | 1 / 1 | 1 | C? | follower AI |
| Actor.QueueNiNodeUpdate | missing (:211) | 1 / 1 | 1 | C | SKSE; a visual refresh |
| Actor.RemoveFromAllFactions | missing (:213) | 1 / 1 | 1 | S | factions |
| Actor.SetExpressionOverride | missing (:240) | 1 / 1 | 1 | C | face |
| ActorBase.GetRace | missing (:300) | 1 / 1 | 1 | N | a record read |
| Game.ShowTrainingMenu | missing (:803) | 1 / 1 | 1 | C | UI |
| Math.Tan | missing (:965) | 1 / 1 | 1 | N |  |
| ObjectReference.CreateDetectionEvent | missing (:1007) | 1 / 1 | 1 | C | AI detection |
| ObjectReference.GetHeight | missing (:1040) | 1 / 1 | 1 | C | the model's bounds |
| ObjectReference.Lock | missing (:1090) | 1 / 1 | 1 | S? | locks (M4) |
| ObjectReference.MoveToMyEditorLocation | missing, latent (:1093) | 1 / 1 | 1 | W | a persistent mod reference sent home (Cyclonic Rift) |
| ReferenceAlias.Clear | missing (:1226) | 1 / 1 | 1 | S? | quest aliases (M6) |
| Weather.FindWeather | missing (:1472) | 1 / 1 | 1 | C | each game's weather until M4 |
| Weather.GetCurrentWeather | missing (:1475) | 1 / 1 | 1 | C | each game's weather until M4 |
| Weather.GetSkyMode | missing (:1479) | 1 / 1 | 1 | C | each game's weather until M4 |
| Alias.GetOwningQuest | missing (:352) | 0 / 28 | 0 | S? | vanilla overrides only |
| Quest.SetCurrentStageID | missing, latent (:1206) | 0 / 15 | 0 | S? | vanilla overrides only; through SetStage |
| Scene.IsActionComplete | missing (:1233) | 0 / 2 | 0 | C | vanilla overrides only |
| Actor.EvaluatePackage | missing (:103) | 0 / 1 | 0 | C | vanilla overrides only |
| ActorBase.SetInvulnerable | missing (:320) | 0 / 1 | 0 | S | vanilla overrides only |
| Location.IsChild | missing (:894) | 0 / 1 | 0 | S | vanilla overrides only; through IsInLocation |
| Scene.IsPlaying | missing (:1234) | 0 / 1 | 0 | C | vanilla overrides only |
| Scene.Stop | missing (:1236) | 0 / 1 | 0 | C | vanilla overrides only |


### 1.4 Notes on the table

- **Uncertain S.** Quest and alias natives (Quest.Start, Stop, IsRunning,
  IsStopping, IsCompleted; ReferenceAlias.GetReference, ForceRefTo, Clear)
  are server state only once the server runs quests (ADR-008, PLAN M6): the
  server instantiates scripts on references alone
  (skymp5-server/cpp/server_guest_lib/MpObjectReference.cpp:1750-1864), and
  Quest.GetCurrentStageID is a decided stub (NATIVES.md:1187). FormList and
  LeveledItem runtime edits are new in-memory state the engine keeps per
  world (INFERRED). HasPerk waits for M5's perks; GetLockLevel and Lock for
  M4's locks.
- **SPELL.Cast and RemoteCast** are E for the server's part (the effect rule
  applies the cast spell's effects) and C for a projectile. Of their 56 live
  sites, 43 resolve to a spell record and 10 of those cast a spell with a
  projectile (5 Cast, 5 RemoteCast); 13 did not resolve (a spell from a list
  or another call).
- **Not missing, but W work all the same.** ObjectReference.PlaceAtMe
  (delegated, 81 sites in 43 scripts) keeps the server's placement except
  for explosions, which only reach the clients
  (script_classes/PapyrusObjectReference.cpp:398-413). What the live sites
  place (analysis3.txt): Skyrim.esm 000B79FF 27 times in 21 scripts (named
  FXEmptyActivator in Ghostwalk's VMAD, a bare anchor for positions and
  translations), explosions that place nothing 17, STAT 10, the mod's ACTI
  10, Skyrim.esm items 13 (Minor Creation), RFCT 3, HAZD 2, LIGH 2, an NPC_ 1,
  7 unresolved (the twin and figment spells place a copy of the target,
  INFERRED). MoveTo (56 sites; the lab runs thuum's lab gamemode, not
  skymp5-functions-lib, lab/gamemode/gamemode.js:1-21, so the C++ body at
  PapyrusObjectReference.cpp:969 is the one that runs, INFERRED), Delete (93)
  and SetPosition (20, delegated) are the rest.
- **Delegated natives Apocalypse calls** (19, 293 sites) already run in a
  client (R2): PlaceAtMe for explosions 81, Message.Show 80 (latent, the
  client's button taken unvalidated: PapyrusMessage.cpp:3-9), Sound.Play 34,
  Actor.AddSpell 25, SetPosition 20, RemoveSpell 12, EquipSpell 9, RemoveItem
  7, SetAlpha 5, EquipItem 4, UnequipItem 3, Game.ForceThirdPerson 3,
  SetDontMove 2, Game.ShakeController 2, AddItem 2, GetSitState 1,
  Debug.Notification 1, Game.DisablePlayerControls 1, EnablePlayerControls 1.
  The gamemode ones (MoveTo 56, Utility.RandomInt 16, Actor.IsDead 12) have
  C++ bodies underneath (NATIVES.md:1091, :1413, :176).

## 2. What option B needs besides the natives

Option B: the server's VM runs the magic effect scripts. This section walks
the pieces in the order a script meets them, and says for each what exists.

### 2.1 Loading the scripts: exists

- The server reads scripts from dataDir/scripts, then every archive the
  settings' `archives` list names, then its built-ins
  (script_storages/ScriptStorageFactory.cpp:5-18, :48-63), so the mod's BSA
  only needs listing. INFERRED: Apocalypse's BSA reads through
  BsaArchiveScriptStorage as any other.
- The base class exists as an empty script: skymp5-scripts/psc/
  ActiveMagicEffect.psc:1 is `ScriptName ActiveMagicEffect Hidden`, copied
  into the server's data/scripts (skymp5-scripts/CMakeLists.txt:13-16).
- No native class backs it: PapyrusClassesFactory registers 22 classes and
  neither ActiveMagicEffect, GlobalVariable, Spell, ImageSpaceModifier, Math,
  Weather nor any alias class is among them
  (script_classes/PapyrusClassesFactory.cpp:33-54).

### 2.2 Instances bound to running effects: does not exist

What exists to build on:
- **Attaching scripts to an object.** `VirtualMachine::AddObject(self,
  scripts)` makes one ActivePexInstance per script name and hands it to the
  object (papyrus-vm/src/papyrus-vm-lib/VirtualMachine.cpp:160-179).
  References do it in InitScripts with a ScriptVariablesHolder per script
  (MpObjectReference.cpp:1852-1864), lazily at their first event (:1313-1321).
- **Events to an object.** `SendEvent` runs the named function on each of the
  object's instances in its current state (VirtualMachine.cpp:181-202).
- **Native lookup.** CallMethod tries the object's script instances, then
  natives up the class chain from the object's `GetParentNativeScript()`
  (VirtualMachine.cpp:256-338). An effect object would answer
  "ActiveMagicEffect".
- **The server's running effects.** RunningEffect: the MGEF, the source, the
  caster, kind 0 to 2 (value, peak value, dual), the actor values, magnitude,
  duration and seconds run (RunningEffect.h:13-31), kept in the change form
  (MpChangeForms.h:161-164), applied by `MpActor::ApplyEffects`
  (MpActor.cpp:2723-2783), advanced on WorldState's quarter-second tick
  (WorldState.cpp:169-202, MpActor.cpp:2785-2815), cleared at death
  (MpActor.cpp:2791-2796). The rule itself is Rust: EffectKind Value,
  PeakValue, DualValue (skymp-wire/crates/wire-rules/src/magic.rs:30-40),
  EffectFacts (:55-71).

What does not exist:
- **An IGameObject for a running effect.** MpFormGameObject wraps an MpForm
  (script_objects/MpFormGameObject.h:5-25); a running effect is not a form.
  B needs an effect object holding (target actor, entry), its instance list,
  and GetParentNativeScript "ActiveMagicEffect".
- **A running entry for a scripted effect.** ApplyEffects skips any effect
  whose record carries conditions (MpActor.cpp:2740-2743), and EffectFactsOf
  returns nothing for archetypes other than the three modifiers or for no
  primary actor value (MpActor.cpp:2252-2267). Apocalypse has 252 MGEFs with
  a script, 249 used by a spell, scroll or enchantment: 156 Script archetype,
  40 value, 14 dual, 12 peak, 12 Stagger, 4 SummonCreature, 3 Absorb, 2
  Cloak, 2 Invisibility, and Paralysis, Rally, SpawnHazard and SlowTime once
  each. At most 66 would get an entry today, fewer once conditions count. B
  needs a script-carrying kind in magic.rs and the change form, which is a
  schema change (rule 6: a migration and a restart scenario).
- **Freeing an instance.** `VirtualMachine::RemoveObject` is empty
  (VirtualMachine.cpp:464-466) and AddObject keeps every object in
  gameObjectsHolder forever (:178). One instance per cast would leak.
- **Restart semantics.** The entry persists, the script's variables and
  pending timers and waits do not (the engine keeps them in its save). B
  must choose: end scripted effects at a restart, or recreate the instance
  and send OnEffectStart again (wrong for scripts that count or place).
- **Which player a script means.** Game.GetPlayer on the server returns the
  stack's "default actor" (script_classes/PapyrusGame.cpp:135-146), which
  HeuristicPolicy sets only for OnActivate, OnObjectEquipped, OnInit,
  OnUpdate, OnTrigger* and OnHit
  (script_compatibility_policies/HeuristicPolicy.cpp:49-76). 32 Game.GetPlayer
  sites (15 in effect scripts) and 36 scripts with a property bound to
  PlayerRef 0x14 (18 live effect scripts) need a per-instance answer, and
  the VMAD fill looks 0x14 up as a world form with no player mapping
  (ScriptVariablesHolder.cpp:149-167; the server maps 0x14 only in message
  handlers and console commands, e.g. ActionListener.cpp:2739, :2757).

### 2.3 Events, with counts

Live effect scripts defining each event (analysis2.txt), and the call sites
reachable from it through the scripts' own functions, all effect scripts:

| Event | Live effect scripts | Reachable sites (natives) | On the server today |
| --- | --- | --- | --- |
| OnEffectStart | 151 | 1,145 (125) | never sent |
| OnEffectFinish | 62 | 203 (60) | never sent |
| OnUpdate | 57 | 373 (81) | to forms only: MpForm::Update (MpForm.cpp:29-32), from Form.RegisterForSingleUpdate's timer (PapyrusForm.cpp:19-51) |
| OnDying | 8 | 48 (24) | never sent; death fires the gamemode's onDeath (DeathEvent.cpp:21-25, MpActor.cpp:1738-1760) |
| OnSpellCast | 8 | 43 (18) | to the caster's own scripts (ActionListener.cpp:2851-2855), not its effects |
| OnHit | 4 | 11 (6) | to the target's own scripts (ActionListener.cpp:3171-3186), not its effects |
| OnAnimationEvent | 2 | 4 (3) | never sent |
| OnDeath | 1 | 2 (2) | never sent |
| OnMagicEffectApply | 1 | 8 (6) | never sent |

- A grep of skymp5-server/cpp for the quoted names OnDying, OnDeath,
  OnEffectStart, OnEffectFinish, OnMagicEffectApply, OnAnimationEvent,
  OnUnload, OnContainerChanged and OnUpdateGameTime finds nothing.
- The events the server does send are listed at MpObjectReference.cpp:503
  (OnActivate), :596 (OnTrigger), :839 (OnItemAdded), :987-993 (OnInit,
  OnCellLoad, OnLoad, once, at the first player's subscription),
  MpActor.cpp:604 (OnObjectEquipped), MpForm.cpp:31 (OnUpdate) and
  ActionListener.cpp:2855, :3185.
- The whole mod also needs, outside effect scripts:
  - ObjectReference scripts: OnLoad 15, OnUpdate 5, OnUnload 3,
    OnContainerChanged 1, OnActivate 1.
  - The summons' two Actor scripts: OnLoad, OnActivate.
  - Quests: OnInit 3, OnUpdate 1, OnUpdateGameTime 1, and 5 stage-fragment
    scripts.
  - 2 perk fragments.
  - Live alias scripts: OnActivate 2, OnContainerChanged 2,
    OnDestructionStageChanged 1.
  - The SkyUI menu, 6 events. It can only run in a client.
- An effect script receives its actor's events in the engine (Creation Kit
  wiki, "ActiveMagicEffect Script"). B relays OnHit, OnSpellCast, OnDying,
  OnDeath, OnMagicEffectApply and OnAnimationEvent from the actor to its
  effect instances. Anim events reach the server only as the clients relay
  them (AnimationSystem.cpp), so OnAnimationEvent is INFERRED feasible for
  players only.

### 2.4 Properties from the MGEF's VMAD: exists, with gaps

- **Filling.** ScriptVariablesHolder takes a base and a reference record,
  reads the named script's properties from each record's VMAD and casts them
  (ScriptVariablesHolder.cpp:11-23, :52-77, :101-124, :126-223). The VMAD
  reader is generic over record types (libespm src/RecordHeader.cpp:43-66),
  so passing the MGEF's lookup as the base should fill an effect's
  properties (INFERRED, unrun).
- **Value types.** Live effect scripts' property values by record type:
  - SPEL 112, Skyrim.esm forms 90, MESG 89, GLOB 76, FLST 39, IMAD 36;
  - QUST 27 in 8 scripts, SOUN 21, PlayerRef 18, EXPL 13, RFCT 12, EFSH 11,
    ACTI 10, STAT 8;
  - a few each of KYWD, FACT, MGEF, WEAP, REFR, LIGH, RACE, HAZD, CONT,
    AMMO, IPDS, NPC_;
  - declared: 191 floats, 27 ints, 13 bools, 11 strings.
- **Gaps.**
  - A GLOB property becomes a record wrapper with no value
    (EspmGameObject.cpp:7-10, :31-32, per the globals survey).
  - A QUST property typed as a quest script (WB_NewManager_Quest_Script,
    WB_Entomb_Quest_Script) becomes an EspmGameObject with no script
    instances (ScriptVariablesHolder.cpp:175-181), so calls to its functions
    log "Method not found" (VirtualMachine.cpp:331-337). 8 live effect
    scripts carry QUST values (the Enslave the Weak three, Entomb, Locate
    Object, QBooks, Restoration Tracker, Start/Stop Quest).
  - PlayerRef needs the per-instance player (2.2).
- **No value at all.** Five live effect scripts declare a property no
  carrier fills (WB_CloakOfMimicry, WB_EvilTwinAtTarget, WB_FingerOfDeath,
  WB_Gate, WB_Toggle). It stays None in both engines, the same behavior.

### 2.5 Latent calls: exist, with two traps

- **The mechanism.** A native that returns a promise suspends the Papyrus
  function, and the function resumes when the promise resolves
  (ActivePexInstance.cpp:180-204). Utility.Wait sets a WorldState timer
  (script_classes/PapyrusUtility.cpp:8-12, :196-220); WaitGameTime converts
  to the server clock (:63-74).
- **Live latent call sites in effect scripts: 343.**
  - Message.Show 63 in 27 scripts, Utility.Wait 58 in 43, Delete 55,
    MoveTo 40, Spell.Cast 32, SetAngle 26, Disable 18, SetPosition 16,
    RemoteCast 15, Enable 12;
  - SetScale 3, Quest.Start 3, RemoveItem 1, AddItem 1.
- **Trap 1, a freed instance.** The resume captures the instance's raw
  `this` (ActivePexInstance.cpp:190). Once B frees effect instances (2.2), a
  dispel during a Wait resumes on freed memory, unless instances live until
  their stacks end. The engine finishes a dispelled effect's running
  functions (INFERRED).
- **Trap 2, a promise that never resolves.** A delegated latent call goes
  through SpSnippet, which returns such a promise when the executor is not
  a player (SpSnippet.cpp:27-32). A Message.Show from an effect on an NPC
  would hang its script (INFERRED, rare: the mod's menus show to the
  player).

### 2.6 What happens to C-category calls

On the server each C call can only become an SpSnippet to some client, so its
effect stays R2 (physics, AI) or R3 (screen, camera). The existing pieces:

- **Visuals on a reference** go to every listener of the target:
  EffectShader and VisualEffect Play and Stop (PapyrusEffectBase.cpp:34-60),
  Sound.Play (PapyrusSound.cpp:18-29). PlayImpactEffect, SetCriticalStage,
  QueueNiNodeUpdate and SetExpressionOverride fit this shape.
- **One player's screen or controls** go to the stack's default actor
  (IPapyrusClass.cpp:4-23 with HeuristicPolicy): ImageSpaceModifier.Apply and
  Remove (44 live sites), the Game camera and control calls, Weather until M4.
  B adds the effect's player as the default actor for effect events.
- **Physics and AI on an actor** go to the game that simulates it:
  PushActorAway, TranslateTo, StopTranslation, StartCombat, StopCombat,
  EnableAI, SetPlayerTeammate, CreateDetectionEvent, SendAssaultAlarm,
  InterruptCast. A player's own client can run them; for an NPC there is no
  host until M3, and SpSnippet refuses non-player executors
  (SpSnippet.cpp:27-32).
- **Queries with a result** (IsInKillMove, GetCombatState, GetCombatTarget,
  IsInCombat, IsBeingRidden, IsCommandedActor, IsPlayerTeammate, GetHeight,
  the Weather getters) become a round trip in the middle of a script. Float
  results are rounded down with an error (SpSnippet.cpp:72-81), and arrays
  cannot be sent (SpSnippetFunctionGen.cpp:81-86). Some have a server
  approximation instead (IsInCombat from ADR-023's hostility record).
- **How many scripts this touches.** 93 of the 157 live effect scripts have
  at least one C native or client-rendered call. 64 are server-computable
  once their S, E and N natives exist, and 14 already are, given the
  runtime alone.

### 2.7 Pieces the natives table does not show

- **Self-delivered spells have no server path.** 73 live effect scripts ride
  Self effects. The server applies a spell's effects only on a reported hit
  (OnSpellHit, ActionListener.cpp:2877-2918); the cast handler stops at
  "TODO: apply magic effects if this is not a fireball-like spell"
  (ActionListener.cpp:2868-2869). The player's own game applies its self
  spells: the client's AddTarget hook refuses only alchemy items
  (skyrim-platform Hooks.cpp:71-84). So B needs one of two paths:
  - a self-cast application on the server, plus the client's own application
    of those spells suppressed;
  - a client report that an effect started (R1: the server checks it
    against a recorded cast or hit), which also settles conditions (next
    bullet).
- **Conditions.** 247 of the mod's 556 MGEFs carry conditions (HasKeyword
  193, GetDead 86, IsActor 85, IsUndead 45, IsHostileToActor 39, GetIsID 34,
  IsCommandedActor 29, HasMagicEffectKeyword 28, HasMagicEffect 26,
  GetEquippedItemType 21, GetCurrentCastingType 18, HasPerk 16,
  GetActorValuePercent 16, ... GetVATSFrontAreaFree 5, a geometry query).
  So do 69 of 986 spell, scroll and enchantment effects (GetGlobalValue 21,
  HasPerk 16, ...). The server's evaluator has 17 functions
  (server_guest_lib/condition_functions/), overlapping in
  GetEquippedItemType, GetActorValuePercent, HasSpell, GetIsRace and
  IsInInterior. Either the server evaluates about 40 more functions (and
  trusts the caster's game for geometry), or it takes the engine's word
  that an effect started.
- **Placed objects (W).** 14 of the mod's explosions place an activator that
  carries a script: 11 MGEFs and 2 projectiles reach them.
  - The spells: Detonate Lock, Frozen Orb, Wizardfire, Volcano, Drop Zone,
    Welloc's Instant Forest, Entomb, Milestones, Cyclonic Rift, Lightning
    Strike, Fingers of the Mountain, and Thrumming Stone's two, whose users
    did not resolve.
  - Those explosions happen in the caster's game. The server never creates
    the placed object (PapyrusObjectReference.cpp:404-413 sends an
    explosion to the clients), so the 11 ObjectReference scripts on those
    activators (of the mod's 16) never run there.
  - B needs the caster's game to report where the explosion landed (R1, as
    cast-teleport takes a landing), and the server to create the reference
    and run its OnLoad.
  - Server placement has a known bug: degrees passed as radians
    (PapyrusObjectReference.cpp:417-418).
  - A non-actor moved by the server reaches clients only when its grid cell
    changes (MpObjectReference.cpp:536-547).
  - The client does draw server-created references of any base, by
    placeAtMe (skymp5-client src/view/formView.ts:152-176).
  - PlaceActorAtMe (8 sites: twins, figments, the warband) makes actors that
    need a host to act (M3).
- **Quests and aliases the effects reach.** Entomb's quest functions, the
  Milestones aliases, the Locate quests started by Quest.Start, Enslave the
  Weak's quest: no quest or alias instance exists on the server (2.4). This
  is PLAN M6's ground ("script-driven [stage transitions] resolve on the
  server's VM", PLAN.md:1016-1017).
- **T0 fixtures.** The server's fast oracle needs compiled .pex. The mod's
  own cannot enter the repo (MODS.md:35-37), and neither CI nor this machine
  has a Papyrus compiler (lab/pex.py:6-9), whose writer only adds native
  declarations (:35-39). B's T0 needs hand-assembled fixtures or an
  open-source compiler in the build image (INFERRED cost below).
- **Ledger.** Rule 10 makes every native B adds or stubs a ledger line with
  its rung: about 100 lines for Apocalypse.

## 3. What option A needs

Option A (ADR-029 as proposed): each player's game runs the effect scripts
of its own player and its own casts; the server keeps the globals those
scripts write.

### 3.1 The client's event filter

Today `OnSendEventEnter` blanks every event but OnUpdate when the handle
carries no exempt script:

- **The hook.** skyrim-platform/src/platform_se/skyrim_platform/
  FridaHooks.cpp:16-98; OnUpdate always passes at :44; the blank replaces
  the event's name with "" at :94-97.
- **The named exceptions** (:51-87): the SKI_ prefix, RaceMenu,
  GRIM_ALT_TeleportationMarker (cast-teleport's, added in d1fb786c, 10
  lines), defaultDisableHavokOnLoad.
- **Who turns it on.** The client, once:
  skymp5-client/src/services/services/blockPapyrusEventsService.ts:10-17.
- **What it resolves.** selfId only for actors and references (:26-38),
  which matters for rule 9's native filtering.

A adds four tests, all in the same C++ (rule 9):

1. **Effects of the player's own.**
   - The test: `HandleIsType(ActiveEffect::VMTYPEID, handle)`, 142 in
     CommonLib (include/RE/A/ActiveEffect.h:31;
     include/RE/I/IObjectHandlePolicy.h:20).
   - Then `GetObjectForHandle(142, handle)` gives the ActiveEffect (:27),
     which passes when its caster or target is the player
     (ActiveEffect.h:93-96; the fields at :100 and :104).
   - Summons count too: the target's commanding actor is the player
     (Actor::GetCommandingActor, include/RE/A/Actor.h:533). Of the 20
     ability-borne effect scripts, 10 ride summons' NPC_ spell lists
     (Battlemage, Kyrkrim, Craftlord, Xivilai Lord, Avenging Wraith, Dremora
     Churl, Herne, the two Totems, Weeping Daedra).
2. **References the player's own spells placed.**
   - Which: the 14 explosion-placed activators above and the scripts' own
     PlaceAtMe products.
   - The test: the reference's actor cause is the player
     (TESObjectREFR::GetActorCause, include/RE/T/TESObjectREFR.h:277;
     ActorCause::actor, include/RE/A/ActorCause.h:26). HYPOTHESIS: the
     engine sets it on an explosion's placed object.
   - Not a name list: the relayed cast launches the real spell in every
     observer's game (docs/verbs/spell-cast.md:88-107, x-spell-side), so
     names alone would also run a figure's copies there, its explosion
     placing the same activator in the observer's game (INFERRED). The
     Milestones spawner's OnLoad would open its menu on the observer's
     screen.
3. **The mod's quests and aliases, per player (ADR-008).**
   - By name, since a quest handle has no caster: WB_NewManager_Quest_Script,
     WB_Manager_Script, WB_PopulateLists_Script (OnInit), and the 5 live
     alias scripts.
   - The SkyUI menu: its quest's player alias carries SKI_PlayerLoadGameAlias,
     which passes by its prefix, but the quest's own script is
     WB_MCMQuest_Script, so events sent to the quest handle (SkyUI's mod
     events) are blanked today (INFERRED).
4. **Actor events relayed to effects** (OnHit, OnSpellCast, OnDying).
   HYPOTHESIS: the engine sends them per effect handle through the same
   hooked SendEvent; a Frida trace on the hook confirms it (rules 2 and 8).

### 3.2 Per-player globals and the login restore (rule 6)

- **Today.** No global value is stored anywhere. MpChangeFormREFR has no
  such field (MpChangeForms.h:63-192), and libespm has no GLOB reader (its
  Records.h; GMST.h:9-44 is the nearest shape). The only global-carrying
  message is SetGameTime (globals survey section 2).
- **The record.** An optional list of (FormDesc, float) in the change form,
  in shoutRecord's pattern ("absent in older records, read as none",
  MpChangeForms.h:166-169), with ToJson, JsonToChangeForm and ToTuple.
- **The migration** is the shouts verb's: absent reads as empty
  (docs/verbs/shouts.md:250-251), plus a restart-persistence scenario.
- **The report.** No engine event announces a script's write to a global
  (INFERRED). The client watches the listed globals through Skyrim
  Platform's GlobalVariable, as TimeService reads the clock's
  (skymp5-client/src/services/services/timeService.ts:92-98), and sends
  changes.
  - The message is new: a wire-schema type plus its validator in the same
    commit (rule 4). The bounds: listed ids only, finite values, a budget.
  - Recorded unvalidated (R2, rule 5).
- **The restore** at login comes from a server message the client applies
  after the load, TimeService's shape. The login save's template carries
  only GameHour's slot (skyrim-platform LoadGame.cpp:160-186), so it is no
  home for a mod's globals.
- **What is listed** (globals survey 4d): the 25 build and progress globals
  (Craftlord 13, Battlemage 5, Avenging Wraith 4, IsControlling,
  LocateValuables, BanishLiving). The 30 MCM settings read best as server
  configuration pushed to every game; 5 per-cast locks need no saving.

### 3.3 The world-shared list

- **Seven globals**: Milestones' InUse 1 to 5 (030AE5D2 to 030AE5D6),
  Cyclonic Rift's RiftID (030B5D1A), EntombStatus (030AE5B9).
- **The flow.** A game proposes a write; the server checks the id, a value
  in range and a recorded cast of the spell whose script writes it (R1),
  records it and relays it to every game, as SetGameTime is relayed.
- **The home** is new: every change form is a REFR or ACHR one
  (MpChangeForms.h:65-71) in a storage keyed by FormDesc, so world values
  need a record kind of their own (INFERRED).
- **The caveat.** The globals alone share nothing visible. The five anchors
  and the two rift portals are persistent references that a MoveTo in the
  caster's game moves, and nobody else's game sees that move. The list is
  worth having only together with M4's placed objects, as ADR-029 says.

### 3.4 What A leaves unvalidated, and what it leaves undone

- **Unvalidated (R2): what a script does to its own player.** Buffs through
  ModActorValue (a permanent modifier "not in the record", NATIVES.md:203),
  summons' stats, the per-player globals, skill experience from
  Game.AdvanceSkill (recorded unvalidated already, actor-values' R2), menu
  answers. A cheater can edit their own scripts' results.
- **Still the server's (ADR-028).** Damage and restores between actors that
  the records give: a spell hit runs the record's effects through the
  server's rule (ActionListener.cpp:2877-2918, MpActor.cpp:2723-2783). A
  figure's spell lands nothing on the player it targets (spell-cast.md:93-
  112). A teleport stays bounded by the movement rule (R1).
- **Undone for others.** A script's change to another player stays on the
  figure in the caster's game, which the server's values overwrite. 62 of
  the 84 live target-reaching effect scripts change their target:
  - 23 write its attributes or kill it: Nature's Balance (WB_Equalize_Script,
    a health swap), Finger of Death, Poisoned Chalice, Slay Living, Equalize,
    Bloodstar, Mana Void, and others;
  - 17 move it, 18 change its AI, factions, spells or gear, 19 cast at it
    (analysis4.txt).
  HYPOTHESIS: a script's Spell.Cast reaches the server as a cast of an
  unequipped spell and is refused with its hits (spell-cast's
  IsSpellEquipped check).
- **Undone for the caster.**
  - A script's restore of its own Health, Magicka or Stamina is cut back to
    regeneration's allowance (CropRegeneration.cpp:22-67, ADR-028's last
    bullet). Three player-side scripts do it: Scream of Pain, Stendarr's,
    Willpower.
  - A script's SetActorValue on its own player is the game's, not the
    record's (NATIVES.md:228 records only server-set bases).
- **Seen only by the caster.** The scripts' visuals (EffectShader.Play 31
  sites, VisualEffect.Play 14, Sound.Play 34, the screen effects), since the
  server relays only the three modifier kinds (RunningEffect.h:18).

## 4. A hybrid

### 4.1 What the data says

- **Split by delivery.** The 157 live effect scripts:
  - 73 ride Self effects. Spell types: Spell or Scroll, 20 abilities, and a
    power and a lesser power.
  - 84 reach a target: Aimed 51, TargetActor 12, Touch 6, TargetLocation 6,
    mixed 9.
- **The brief's example.** "The server runs only the scripts that write
  world-shared or other-player state" means 62 target-touching scripts plus
  the world mechanisms (Raise Wall, Cyclonic Rift's teleport, Entomb):
  - 65 effect scripts needing 61 of the 85 missing natives that live effect
    scripts call (369 of 846 sites);
  - all 84 target scripts would need 72 natives;
  - plus every non-effect script those mechanisms use: 16 ObjectReference,
    the Milestones and Door aliases, the Entomb quest.
- **What that split saves**: about a quarter of the natives, half the call
  sites, and the self-cast path (2.7). It saves none of B's fixed cost: the
  runtime, the event relays, conditions for target effects, PlayerRef
  binding, placed objects. And it adds A's filter and A's client-side
  globals.

### 4.2 Proposal: per player by default, the server by allowlist

One authority model for scripts and globals, the shape ADR-008 gives quests
and TES3MP gives client globals (CoreScripts scripts/clientVariableScopes.lua:
1-21, worldwide at :90; eventHandler.lua:1946-1953 saves a worldwide global
to the world and anything else per player):

- **Default (A).** An Apocalypse effect script runs in the game whose player
  casts it or bears it. Globals are per player (R2) unless a data list makes
  them world-shared (R1).
- **Allowlist (B, data, not code).** Effect scripts the server's VM runs and
  every game blanks. It starts empty, as ADR-029 already says ("The server's
  VM runs no magic effect script until a verb needs one validated"). Each
  entry is a verb that brings its own natives. The natural first entries
  are the 23 scripts that change another actor's attributes or life
  (ADR-028's ground), then Raise Wall and the world four.
- **Why the order matters.** B's fixed cost (5 to 8 sessions for the
  runtime) is paid at the first entry, not up front, and every spell
  already works in its caster's game meanwhile. The allowlist is also where
  Eli's lean to authority lands, one spell at a time, without the 93
  client-call scripts forcing the issue.
- **Alternative, not recommended.** Clients run everything, and the R0
  natives (DamageActorValue, RestoreActorValue or Kill on another actor; a
  world global's SetValue; PlaceAtMe of a lasting object) become R1
  requests the server validates against the recorded cast. It needs native
  interception in Skyrim Platform and per-native bounds the scripts' math
  makes hard to state (INFERRED), so it is less lazy than running the
  script.

## 5. Costs

A session is thuum's unit; one verb takes 2 to 4 (PLAN.md:864-865). Every
figure below is INFERRED from the pieces in sections 2 and 3, against the
size of recent verbs (cast-teleport: a 10-line filter exception, a permitted
jump and a scenario; shouts: a change-form record with a login snippet).

### 5.1 Option A

| Package | Sessions | Why |
| --- | --- | --- |
| A1. The filter, with Ghostwalk as its spell (the first verb) | 2 to 3 | four tests in FridaHooks.cpp; a Frida trace for the actor-event relay and the actor cause (HYPOTHESIS); Ghostwalk's return taken as a permitted jump (PartOne.h:160-161, as cast-teleport); T3 |
| A2. Globals: per-player record, world list, settings as config | 3 to 5 | GLOB reader; a change-form field with its migration and restart scenario (rule 6); a message each way with its validator (rule 4); the client's watch |
| A3. Raise Wall seen and blocking (b-apocalypse) | 2 to 4 | under A the wall exists only in the caster's game: a placement report (R1), a server-placed MSTT for observers (with the radians fix), the caster's own reconciled |
| To b-apocalypse | **7 to 12** | 5 to 8 if b-apocalypse drops Raise Wall |
| Later: Milestones, Cyclonic Rift, Entomb | 2 to 4 each | placed and moved world objects (M4, ADR-029) |
| Debt: script results on other players | not costed | each needs the server to run that script (B's runtime) or the request path of 4.2 |

### 5.2 Option B

| Package | Sessions | Why |
| --- | --- | --- |
| B1. Runtime and the first verb (Nature's Balance) | 5 to 8 | effect object and instances, RemoveObject and instance lifetime across waits, OnEffectStart and OnEffectFinish, the AME natives and timers, PlayerRef and default-actor binding, a script kind in magic.rs and the change form (rule 6), T0 fixtures without a compiler, T2, T3 |
| B2. Effect sources and conditions | 2 to 4 | the self-cast path and the client's application suppressed, or an "effect started" R1 report; about 40 condition functions, or the engine's word |
| B3. Actor events relayed to effects | 1 to 2 | OnHit, OnSpellCast, OnDying and OnDeath (new in the death path), OnMagicEffectApply, OnAnimationEvent |
| B4. Globals on the server | 3 to 4 | GLOB reader, a store per player and per world, GetValue and SetValue, a push to every game (the engine's own conditions read 35 globals in 197 conditions, 156 of them menu buttons) |
| B5. S natives beyond globals and aliases (43) | 4 to 6 | each with a ledger line and a T0; AdvanceSkill and HasPerk delegated or stubbed until M5 |
| B6. C natives (35 with live sites) | 3 to 5 | an executor per kind (2.6), float returns fixed in SpSnippet, ledger lines R2 or R3 |
| B7. Placed objects | 3 to 5 | the 14 explosion-placed activators by an R1 landing report, server placement fixed, TranslateTo, non-actor moves seen; PlaceActorAtMe actors wait for M3 |
| B8. Quests and aliases the effects reach | 4 to 6 | quest and alias instances, per player (ADR-008); or defer those spells to M6 |
| Whole mod | **25 to 40** | before M3, M5 and M6 dependencies |
| To b-apocalypse | **12 to 19** | B1, B2, B4, and Raise Wall's natives and placement: GetAngle X, Y, Z (S), Sin and Cos (N), TranslateTo, the server's PlaceAtMe, GetVATSFrontAreaFree taken from the caster's game |

The globals work (A2 or B4) is common to both options. The difference is
B's runtime and its long tail.

### 5.3 Hybrid

- **Now: A1 and A2**, 5 to 8 sessions.
- **Raise Wall, if b-apocalypse keeps it**: either A3's relay (2 to 4), or
  the first allowlist entry. As an entry it costs B1, a start path for a
  self-cast effect (part of B2) and its natives: about 8 to 12.
- **Otherwise the first allowlisted script** is Nature's Balance: B1 (5 to
  8) and the hit path's conditions (1 to 2).
- **Then** 1 to 3 per promoted spell with its natives.
- **Promoting the whole 65-script set** of 4.1 converges on about 22 to 35,
  near B's range. The saving is in order and in what Eli can stop at, not
  in the total.

### 5.4 The first verb under each

- **A: Ghostwalk** (SPEL 0300AAE8, Illusion, fire-and-forget, Self,
  Invisibility archetype, script WB_Ghostwalk_Script).
  - OnEffectStart records the caster's X, Y, Z and location. OnEffectFinish
    waits WB_Wait (0.4 s), then SetPositions the caster back
    (WB_CheckLocation is False in the VMAD), plays a sound, a visual and an
    image space, raises a detection event, and adds the Eye Fix ability.
  - The filter lets it run in the caster's game. The server's part is R1:
    the jump back to the cast point permitted once within the effect's 10 s
    plus slack, as cast-teleport permits its landing.
  - Observers still see the caster: invisibility is not relayed, a later
    magic-effects slice (docs/verbs/magic-effects.md:276-281).
- **B: Nature's Balance** (SPEL 030012DC, Restoration, fire-and-forget,
  Aimed, a beam; MGEF 030012D6, Script archetype, NoDuration; script
  WB_Equalize_Script).
  - "Swaps the Health percentages of the caster and a living target."
  - The bolt's hit reaches OnSpellHit as today. The server binds the script
    to the effect from the MGEF's VMAD (WB_Mult 1.0, WB_Merge True, two
    image spaces, two shaders, PlayerRef). OnEffectStart then moves both
    players' Health with natives the server already has for Health
    (GetActorValuePercentage, GetActorValue, DamageActorValue,
    RestoreActorValue: MpActor.cpp:1686-1705), plus Math.Abs (N), the image
    space delegated to the right screen (C), and EffectShader.Play
    (implemented).
  - The MGEF's six conditions (IsActor, GetDead, three HasKeyword
    exclusions, IsUndead) are none of the evaluator's 17, so B1 must settle
    evaluate-or-trust first.
  - Under A the same spell is broken between players: the target's figure
    changes in the caster's game only, and the caster's own gain is cropped
    by the server.
- **Hybrid**: Ghostwalk first, Nature's Balance as the first allowlist entry.

## 6. Open questions, and tags to carry

- For Eli:
  - **The default.** A by default with a server allowlist, or B for every
    effect script?
  - **b-apocalypse.** Does it keep Raise Wall? Under A it is a placed-object
    verb of its own; under the hybrid it is the first allowlist entry.
  - **MCM settings.** Server configuration pushed to every game, or each
    player's own?
  - **Under B or an allowlist.** Does the server evaluate conditions, or
    take the engine's report that an effect started?
- HYPOTHESIS, for a Frida trace or lab run:
  - an actor's events reach its effects' handles through the hooked
    SendEvent;
  - an explosion's placed object carries the caster as its actor cause;
  - a script's Spell.Cast reaches the server as a cast and is refused;
  - what the engine does with a dispelled effect's running functions.
- INFERRED, to check in code before a verb leans on it:
  - ScriptVariablesHolder fills an MGEF's properties;
  - BsaArchiveScriptStorage reads the mod's BSA;
  - the client draws a server-placed MSTT with collision;
  - the GlobalVariable wrappers' bodies;
  - Skyrim.esm 000B79FF is FXEmptyActivator (named so in Ghostwalk's VMAD).

## References

- Creation Kit wiki, "ActiveMagicEffect Script" and "Wait - Utility"
  (ck.uesp.net): effect scripts receive their actor's events; Wait is
  latent. Cited from knowledge; the network was off for this task, and
  magic-effects.md notes the site answers fetches with 403.
- TES3MP CoreScripts at 3e397a1, the local copy
  /Users/eli/Code/Audit/TES3MP/CoreScripts: scripts/clientVariableScopes.lua:
  1-21 and :90, scripts/eventHandler.lua:1946-1953. The prior art for
  per-player by default and worldwide by list.
- On trusting a client against an authoritative server, the trade both
  options make:
  - Glenn Fiedler, "What Every Programmer Needs To Know About Game
    Networking" (gafferongames.com, 2010), the accessible one;
  - Yahn Bernier, "Latency Compensating Methods in Client/Server In-game
    Protocol Design and Optimization" (GDC 2001), the foundational one,
    already in PLAN M2.
  Both are cited from knowledge, not fetched.
