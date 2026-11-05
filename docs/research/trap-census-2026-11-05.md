<!-- Copied into thuum 2026-11-05 from a read-only research agent's report (thuum-cf). Its scratch readers (cells.py, closure.py,
the pex disassembly under disasm/, cells.json and calls.json) lived in a session scratchpad and on sky-srv's /tmp; the paths it
names under scratchpad/ and "#n" instruction indexes refer to lab/pex.py's disassembly of each script's winning copy, which any
reader can regenerate from the lab's archives. -->

# Linked activations under rung 2: what a guest sees in Bleak Falls Temple, Bleak Falls Sanctum and Embershard Mine

Read-only research for ADR-068's rung 2 and H-D1, 22:16 PST 2026-11-04 (06:16Z 11-05). Every row comes from the lab's game files
on sky-srv (Skyrim.esm 1.6.1170 and the 99 later plugins of /srv/persist/mods/plugins.txt's order; the scripts out of
Skyrim - Misc.bsa or USSEP 4.3.8a's archive, whichever wins; the meshes and behavior graphs out of Skyrim - Meshes0/1.bsa,
Skyrim - Animations.bsa and USSEP's archive) or from the fork at m4-scripts-1-flip 536e30d4. Nothing ran on the lab. The cells by
their CELL EDIDs: 0x371de BleakFallsBarrow01 (the Temple), 0x371dd BleakFallsBarrow02 (the Sanctum, the question's "Barrow"),
0xb6be6 EmbershardMine01.

Families: (a) a rung-2 row (PlayAnimation, PlayAnimationAndWait, Debug.SendAnimationEvent, SetAnimationVariableBool/Int/Float);
(b) another action native; (c) a state native; (d) the engine's own motion. "#n" is the instruction index in lab/pex.py's
disassembly of the winning copy (scratchpad/trapread/disasm/<Script>.txt).

## Summary

**Answer: not yet.** The six rows carry the motion of most linked-activation targets in these three cells. Two kinds of target
would go fully dark on a guest, several lose a script-played sound or hit effect, and one loses a collision state that is not an
animation at all.

1. **Dark on a guest** if the server stops relaying linked activations to guests and the gate blanks their scripts:
   - The Temple's four puzzle darts 0x39fdd, 0x3720f, 0x2ad49, 0x2ad43 (DartTrap): the whole effect is `Weapon.Fire` (DartTrap.fireTrap
     #29) and a windup `Sound.Play` (#3). The script plays no animation and the mesh has no graph or controller.
   - Embershard's seven falling rocks 0xb6d45, 0xb6d48, 0xb6d49, 0xb6d4a, 0xb6d4b, 0xb6d4c, 0xb6d4d (PhysicsTrap): `SetMotionType(1,
     True)` (PhysicsTrap.fireTrap #2) and `ApplyHavokImpulse(0, 0, -1, 15)` (#8), then the host's Havok. The mesh is a bare rigid body,
     and the prop stream does not take trap bodies (docs/verbs/prop-physics.md:532).
2. **Motion covered, a sound or hit effect lost** (`Sound.Play`, or TrapHitBase's `Weapon.Fire` puff): the spike wall 0x54b15, the six
   swinging blades 0x3ac33, 0x3ac35, 0x3ac37 (Temple) and 0x236e3, 0x236e7, 0x236ea (Sanctum), the rockfall dust 0xb6d40. Their swing
   and retract sounds are annotations inside their behavior graphs (SoundPlay.TRPSwingGrateSwingLPMSD, SoundPlay.TRPBladeSwingSwing),
   so those travel with the relayed events; the windups (TRPMaceRelease, TRPBladeSwingWindup), the hit sounds and TRPRockfallRelease
   are script-played and do not.
3. **Covered whole:** the portcullises 0x3b9f1 and 0x2ad21, the motion of both Embershard bridges 0xb6c26 and 0xb6c56, the rigged
   rockfall 0xb6d47, the sarcophagus lids 0xe9988 and 0x48ded (which are dark today, see Table A row 6), and the player-pressed pieces:
   levers, pull chains, the pull bar, the pillars, the Hall of Stories keyhole and rings (Table B).
4. **Not this table:** the DOOR 0x45f3c (CaveGSecretDoor01) opens by the engine's own NiControllerSequence and reaches guests through
   the server's isOpen (ActionListener.cpp:3966 records, MpObjectReference.cpp:2055 toggles, modelApplyUtils.ts:14 and :44-58 apply),
   so it stays lit as long as the server keeps the record half of OnLinkedActivation and drops only the relay loop (:3975-3993). The
   ambush draugr and Arvel's spider are the NPC stream's already (fork ccc98a2d: never relayed to watchers). The XMarkers 0x4fcdf and
   0x4f749 and the TrapLinker 0xb6d3e have no visible consequence of their own.
5. **A regression outside family (b):** the bridge 0xb6c26 toggles CollisionMarker 0x105c99 through EnableLinkChain/DisableLinkChain
   (default2StateActivator.SetOpen #25/#27 and #49/#51; base VMAD TwoStateCollisionKeyword 0x1051e5, zInvertCollision true). Today the
   relayed activation runs the guest's own SetOpen, which disables the guest's marker too. Under rung 2 the guest's `Disable` is a
   skipped state row and nothing carries the host's (TESForm.kFlags is undeclared with no channel, docs/STATE.md:47), so the guest sees
   the bridge lower and meets an invisible wall on it until rung 4's RefState lands (HYPOTHESIS H5).

**The smallest set of extra rows from family (b):**
- `Weapon.Fire` (self a WEAP base, subject arg0 the source reference, owner its cell host, relayed as the same native): lights the
  four darts; it also carries TrapHitBase's hit puff (FXdustDropTinyWEP) and the Sanctum's bats.
- `SetMotionType` and `ApplyHavokImpulse` (subject self): light the seven rocks. The design law's alternative needs no row: give trap
  bodies to the prop stream (its deferred M4 slice), so the host's Havok is streamed and no guest simulates.
- `Sound.Play` (self a SOUN, subject arg0 the source, owner its cell host): every script-played trap sound in the three cells. Nothing
  visible depends on it.

So two rows (or one plus the prop stream) make every linked target visible, three make it audible too. Relayed as the same native,
`Weapon.Fire` and the impulse pair make a guest's engine fly a real dart and push a real body, which is simulation on a non-owner
(ADR-063 decision 3), so each needs a receiver-side rule (the dart's hit on the guest's own player). Nothing else from family (b) is
needed for a linked target here: `PlaceAtMe` and `DamageObject` sit only in pieces no linked activation fires, or on a branch the
reference's own properties skip (0xb6d40's placeAllThings, off with cannedHallwayDust), and no attached script or parent below
ObjectReference calls `PlayGamebryoAnimation`, `PlaySyncedAnimation*`, `TranslateTo`, `SplineTranslateTo*` or `PushActorAway`.
`Debug.SendAnimationEvent` has no call site either, and the one `SetAnimationVariable*` call is the cobwebs'.

**One non-(b) row before the relay stops:** `Enable`/`Disable` as a state row (kFlags bit 0, rung 4's RefState), or keep relaying to
guests for 0xb6c26 until it lands.

**H-D1:** the static read predicts at least one depth-zero hit, on something that is not a door: the FURN puzzle lever 0xaa8c3
(LeverPushAnimatingNoPlayer 0xb7db4). Its graph (furniture/clutter/leveranimating/behaviors/leverpushbehavior.hkx) names
ObjectActivated, LeverPush, LeverPushStart, LeverPushReset, Lever_PlayerPush, and neither defaultPillarPuzzleLever nor traplever plays
an animation on it, so its pull is the engine's furniture code (HYPOTHESIS H3). Everything else engine-only in these cells is Havok
(the rocks, the tripwire, the bone alarms, the oil lamps) or a destruction-stage model swap (the oil lamps and pools, Arvel's web),
which no animation hook sees: a zero on H-D1's counter would not show that a guest sees those.

**Notes the read forces:**
- Stop the relay to watchers only. Two relays are owner input and must stay: a guest's own press of a scripted object (ADR-059
  decision 2's relay to the host), and a linked activation whose caster and target have different owners (a draugr simulated by a
  claimant activating its lid: the lid's OnActivate is blanked on the simulator's seat, FridaHooks.cpp:312-323, so only the lid's
  owner can run it; the mirror of the actor-target rule).
- The trigger boxes 0x86018 and 0x4e42b set playerOnlyTrigger, and the keyhole, rings and puzzle-door pieces compare against
  `Game.GetPlayer()`: a guest's figure never trips them on the host (rung 5's acting player, research file section 8).
- Harm: TrapHit 72 carries the damage; ProcessTrapHit's push and stagger land on the host's puppet of the guest, and no row moves the
  guest's own body.

**Load order:** USSEP 4.3.8a's archive wins for 28 of the 87 scripts read (TrapSwingingWall, TrapHitBase, TrapTriggerBase,
default2StateActivator, defaultPillarPuzzleLever, PhysicsTrap, SoundTrap, Tripwire, TrapFallingOilLampColLayer, TrapExplosiveGas,
HallofStoriesKeyholeScript among them); the paths below are the winning copies, and no USSEP change alters a family on a trap path
(its PhysicsTrap and Tripwire drop one SetMotionType each, the dynamic switch stays). No plugin in the order overrides a trap or
puzzle reference's VMAD, XAPR or XLKR, the nine client-side plugins included (read from their mod folders): USSEP sets a flag on all 22
Embershard torch sconces, and USSEP and the Fish creation add references that are no traps.

## Table A: linked-activation targets

A target is a reference whose XAPR names a parent, or one a script activates (`ref.Activate(...)` on a property or a linked ref).

### Bleak Falls Temple 0x371de

| # | Target | Base (EDID, type) | Scripts: REFR / base | Fired by | Visible consequence and its natives (family, evidence) | Verdict |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | 0x54b15 | 0xc6440 TrapWallWood, ACTI | TrapSwingingWall {rotation 1} / TrapHitBase, TrapSwingingWall | plate 0x567f2 (XAPR 0 s, XAPD 1): PressurePlate[active].onBeginState #8/#12 `Activate(self)` | TrapBase[Idle].onActivate #16/#24/#37/#42 fireTrap, TrapSwingingWall.fireTrap: (a) PlayAnimationAndWait 180For/Done #31, 180Back/TransStop #47, Rearm/TransStart #55, PlayAnimation startSwungAnim #36; (b) Sound.Play TRPMaceRelease 0x2951c #13. Hit, host only (TrapHitBase[canhit].OnTrapHitStart): ProcessTrapHit #17 (harm, TrapHit 72), (b) Sound.Play TRPSwingGrateImpactFlesh 0x29877 #23/#29, (b) Weapon.Fire FXdustDropTinyWEP 0x1a141 with FXDustDropAmmoMed 0x3bdf7 #103, local ShakeController #110 and ShakeCamera #118, (c) AddSpell disease #77-97 (player only) | PARTLY: motion covered (walltrapcw graph: 180For, 180Back, Rearm, Done, TransStop, TransStart, SoundPlay.TRPSwingGrate*); Sound.Play, Weapon.Fire uncovered |
| 2 | 0x3b9f1 | 0x3e726 NorPortcullisLarge01, ACTI | none / default2StateActivator {} | lever 0x6a9e2 (XAPR 0, XAPD 1); marker 0x3e728 as caster (XAPR 0): defaultPillarPuzzleLever.doorOrDarts #3 `refActOnSuccess01.Activate(puzzleDoorActivator)`, defaultPuzzlePillarScript.RotatePillarToState #22 (a solved puzzle broken again) | default2StateActivator[waiting].onActivate #1 calls the script's own SetOpen (it shadows the native): (a) PlayAnimation open #20 or PlayAnimationAndWait open/opening #22; closing #44/#46; (c) DisableLinkChain/EnableLinkChain #25/#27, #49/#51 on an empty chain (no keyword set, no XLKR) | COVERED (portcullislarge graph: Open, Close, SoundPlay.DRSIronNordicPortcullisGateOpen/Close) |
| 3 | 0x2ad21 | 0x23a32 NorPortcullis, ACTI (mesh from USSEP) | none / default2StateActivator {} | pull chains 0xc3b27, 0xc3b29 (XAPR 1.5 s, XAPD 1) | as row 2 | COVERED (portcullis graph: the same events and sounds) |
| 4 | 0x3ac33, 0x3ac35, 0x3ac37 | 0x1cdd0 TrapBladeSwinging01, ACTI | none / BladeTrap, TrapHitBase | pull chain 0xfda45 and trigger box 0x86018 (XAPR 0, XAPD 1) | BladeTrap.fireTrap: (a) PlayAnimationAndWait Single/reset #16, looped while TrapBase is On or Hold; (b) Sound.Play TRPBladeSwingWindup 0x35e05 #4. Hit: ProcessTrapHit, (b) Sound.Play TRPBladeSwingImpact 0xebc27, local rumble and camera shake; no hitFX set | PARTLY: motion covered (swingingblade graph: Single, Reset, SoundPlay.TRPBladeSwingSwing); Sound.Play uncovered |
| 5 | 0x39fdd, 0x3720f, 0x2ad49, 0x2ad43 | 0x173fc TrapDartPortSingle02, ACTI | DartTrap {NumShots 10} / DartTrap | defaultPillarPuzzleLever.doorOrDarts #22, #29, #36, #43 `refActOnFailure0N.Activate(self)` on a failed pull | TrapBase[Idle].onActivate fireTrap, DartTrap.fireTrap: (b) Sound.Play TRPDartWindup 0x189ec #3; (b) Weapon.Fire dartWeapon (ResolveLeveledWeapon: TrapDartWeapon01 0x142e3 and up by CalculateEncounterLevel) from currentLink (GetNthLinkedRef #24 over the TrapDartPortSingle01Child chain) with TrapDart 0x236dd #29, NumShots times. Mesh TrapDartPortSinglewithHead01.nif: no graph, no controller | **DARK**: Weapon.Fire, Sound.Play |
| 6 | 0xe9988 | 0x6bdd3 NorSarcophagusVertTop001, ACTI | none / NorSarcophagusTopAnim01SCRIPT | draugr 0xe9986's masterAmbushScript[waiting].onEndState #12-#16 `GetNthLinkedRef(2).Activate(self)` (its XLKR CreatureAlcoveMarker 0xe9987, whose XLKR is the lid) after trigger 0xe9985 wakes it | NorSarcophagusTopAnim01SCRIPT[waiting].onActivate #2 (a) PlayAnimation OpenStart; onLoad #2 SnapClosed (lifecycle, every seat) | COVERED (sarcophaguslidvert graph: openStart, SnapClosed, SoundPlay.OBJVerticalSarcophagusOpen). Dark TODAY: an actor caster never reaches the linked relay (ActionListener.cpp:2201 routes only non-actor casters; :2236-2253 is the hosted-caster rule), HYPOTHESIS H4 |
| 7 | 0x380b3, 0x380b4, 0x380b5, 0x380b9 (trigger 0x38098); 0x380b7, 0x380b8, 0x380bb (0x3809c); 0x383ec, 0x383f7, 0x383f8, 0x800a9 (0x383f9); 0x800a6 (0xd232c); 0xe9986 (0xe9985); spider 0x3a1e1 (0xaa83e) | draugr NPC_ bases (LvlDraugrAmbush*, EncDraugr0*Ambush*); MS13FrostbiteSpider 0x3a1e0 | masterAmbushScript (REFR or base) | defaultActivateSelf[waiting].onTriggerEnter #36 `Activate(self)`, XAPR delays 0 to 5 s | masterAmbushScript: (c) SetAV Aggression and Variable01, EvaluatePackage, Activate of the linked furniture and lid; the waking and the alcove exit are the actor's AI (d) | NPC STREAM (fork ccc98a2d, 03714dc8, dcef5d8f: relayed only to another simulator, never to watchers) |
| 8 | 0x4fcdf | 0x3b XMarker, STAT | none / none | each pillar's activation (XAPR 0, XAPD 0) | nothing (an editor marker, no script) | NONE needed |

### Bleak Falls Sanctum 0x371dd

| # | Target | Base (EDID, type) | Scripts: REFR / base | Fired by | Visible consequence and its natives | Verdict |
| --- | --- | --- | --- | --- | --- | --- |
| 9 | 0x236e3, 0x236e7, 0x236ea | 0x1cdd0 TrapBladeSwinging01, ACTI | none / BladeTrap, TrapHitBase | trigger box 0x4e42b and pull chain 0xfda43 (XAPR 0, XAPD 1) | as row 4 | PARTLY: Sound.Play |
| 10 | 0x45f3c | 0x6f703 CaveGSecretDoor01, DOOR | none / none | pull bar 0x460ca (XAPR 1.0 s, XAPD 1) | (d) the engine's door: CaveGSecretDoor01.nif's NiControllerManager sequences Open and Close, text keys "Sound: DRSCaveSecretOpen/Close" | ENGINE, carried by isOpen: the server's Activate toggles it (MpObjectReference.cpp:1956, :2055) and every client applies it (modelApplyUtils.ts:14; this base is activated from 0x460ca at :44-58). Lit while the record half stays |
| 11 | 0x4f749 | 0x3b XMarker, STAT | none / none | the rings 0x4e2ba, 0x4e2bb, 0x4e2bc, the keyhole 0x4e2b9, the door base 0x4e2b8, the FX 0x5256c (XAPR 0, XAPD 0) | nothing | NONE needed |
| 12 | 0x48ded | 0x48dec NorSarcophagusTopAnim01, ACTI | none / NorSarcophagusTopAnim01SCRIPT | the boss 0x9bcd6's masterAmbushScript (its XLKR DragonPriestCoffinMarker 0x480b7, whose XLKR is the lid) after trigger 0x493b7 (initially disabled) | (a) PlayAnimation OpenStart, as row 6 | COVERED (UniqueBehaviors SarcophagusTopOpen graph: openStart, SnapClosed; the NIF sequence's SoundPlay.NPCDragonPriestCoffinOpen) |
| 13 | 0x9bcb9 (trigger 0x9bcbc), 0x9bcd6 (0x493b7) | LvlDraugrAmbushMelee1HHelmetMale 0x567cb, LvlDraugrAmbushBossMale 0xb7989, NPC_ | masterAmbushScript / masterambushscript | defaultActivateSelf, XAPR 0 | as row 7 | NPC STREAM |

### Embershard Mine 0xb6be6

| # | Target | Base (EDID, type) | Scripts: REFR / base | Fired by | Visible consequence and its natives | Verdict |
| --- | --- | --- | --- | --- | --- | --- |
| 14 | 0xb6c26 | 0x1051e4 NorRetractableBridge01NONAVCUT, ACTI | default2StateActivator {isOpen true} / default2StateActivator {openAnim raise, closeAnim lower, openEvent trans01, closeEvent trans02, startOpenAnim startRaised, TwoStateCollisionKeyword 0x1051e5, zInvertCollision true} | levers 0xb6c8c, 0xb6d4e (XAPR 1.0 s, XAPD 0) | SetOpen: (a) PlayAnimation(AndWait) raise #20/#22, lower #44/#46; (c) EnableLinkChain #27 on raise, DisableLinkChain #51 on lower: Enable/Disable of CollisionMarker 0x105c99 (STAT 0x21 with XPRM, linked by keyword 0x1051e5) | PARTLY: motion covered (retractablebridge graph: Raise, Lower, StartRaised, Trans01, Trans02, SoundPlay.DRSRetractableBridgeWood*); the collision marker is a state row with no channel before rung 4 |
| 15 | 0xb6c56 | 0x1051e4, as row 14, no XLKR | as row 14 | the same levers (XAPR 1.5 s) | (a) only; the link chain is empty | COVERED |
| 16 | 0xb6d3e | 0x79986 TrapLinker, ACTI | none / TrapTriggerBase {} | tripwire 0xb6d3f (XAPR 0.5 s, XAPD 0) | nothing visible (Marker_LinkMarker.nif); TrapTriggerBase.onActivate #0-#6 acts only when blockActivate is set, and it is not; the engine's default processing activates its nine children on the host | NONE needed |
| 17 | 0xb6d40 | 0x877ff TrapRiggedRockFall01FX, ACTI | none / trapRockfallEffects {cannedHallwayDust true, rockfallSound 0x54aab} | linker 0xb6d3e (XAPR 0) | trapRockfallEffects[waiting].onActivate: (b) Sound.Play TRPRockfallRelease #3; local ShakeCamera #4 and ShakeController #5; (a) PlayAnimationAndWait playAnim01/endAnim #7 (cannedHallwayDust skips placeAllThings' PlaceAtMe) | PARTLY: dust covered; Sound.Play uncovered |
| 18 | 0xb6d45, 0xb6d48, 0xb6d49, 0xb6d4a, 0xb6d4b, 0xb6d4c, 0xb6d4d | 0x79922 TrapFallingRockSm01, ACTI | none / PhysicsTrap (LvlDamage table), PhysicsTrapHit | linker 0xb6d3e (XAPR 0) | TrapBase[Idle].onActivate fireTrap, PhysicsTrap.fireTrap: (b) SetMotionType(1 Dynamic, True) #2, (b) ApplyHavokImpulse(0, 0, -1, 15) #8 (no WindupSound set), then (d) the host's Havok. Hit: PhysicsTrapHit[CanHit].OnTrapHitStart ProcessTrapHit #30, Sound.Play #33, local shakes. Mesh: bhkRigidBody only | **DARK**: SetMotionType, ApplyHavokImpulse (or the prop stream) |
| 19 | 0xb6d47 | 0x7901b TrapRiggedRockFall01, ACTI | none / TrapRiggedRockfall | linker 0xb6d3e (XAPR 0) | TrapRiggedRockfall[Idle].onActivate #2 (a) PlayAnimation break | COVERED (riggedrockfall graph: Break, Broken, Reset; no sound annotation) |

## Table B: the other scripted trap and puzzle pieces (triggers and player-pressed)

Their firing events (OnTriggerEnter, OnActivate by a player, OnHit, OnMagicEffectApply, OnDestructionStageChanged) are blanked on a
guest already (E1), so what a guest sees of them under rung 2 is exactly their natives that cross the seam.

| Piece | Base (EDID, type) | Scripts | Event and natives (family, evidence) | Under rung 2 |
| --- | --- | --- | --- | --- |
| Temple plate 0x567f2 | 0x1a4bb TrapStonePressurePlate02, ACTI | base PressurePlate {isTriggerVolume, checkForLightFootPerk, TriggerSound 0x55780} | OnTriggerEnter (TrapTriggerBase[Inactive], any reference: playerOnlyTrigger unset) then PressurePlate[active].onBeginState: (c) Activate(self) #8/#12 (row 1's firing); (b) Sound.Play TRPPressurePlateStone #14; (a) PlayAnimation Down #15, Up #20 | PARTLY: motion covered (pressureplate graph: Down, TransDown, TransUp, no sound annotation); the click uncovered |
| Temple lever 0x6a9e2; Embershard levers 0xb6c8c, 0xb6d4e | 0x21513 NorLever01; 0x4d77e MetalLever01, ACTI | base NorLever01SCRIPT, TrapLever {TriggerType 2} | player press: NorLever01SCRIPT[pulled or pushedPosition].onActivate #2 (a) PlayAnimationAndWait FullPush/FullPushedUp or FullPull/FullPulledDown; OnLoad and OnReset (a) PlayAnimation FullPull or FullPush (lifecycle); TrapLever inert (no blockActivate) | COVERED (ruinslever01 graph: SoundPlay.OBJLeverNordic01Pull/Return) |
| Pull chains 0xc3b27, 0xc3b29, 0xfda45 (Temple), 0xfda43 (Sanctum); pull bar 0x460ca (Sanctum) | 0x98665 NorPullChain01; 0x98668 NorPullBar01, ACTI | base NorPullBar01SCRIPT, TrapLever {2} | NorPullBar01SCRIPT[Waiting].onActivate: (c) BlockActivation #0/#2, (a) PlayAnimationAndWait Pull/Reset #1 | COVERED (pullchain graph SoundPlay.OBJPullChainDown/Up; pullbar graph SoundPlay.OBJPullBar) |
| Trigger boxes 0x86018 (Temple), 0x4e42b (Sanctum) | 0x7617a TrapTriggerBox, ACTI | TrapTriggerBase {TriggerType 3, playerOnlyTrigger true} | OnTriggerEnter, acceptableTrigger #0-#12 compares Game.GetPlayer, then (c) Activate(self) | nothing to render; a guest's figure never trips them (rung 5) |
| Pillars 0xaa8cb, 0xaa8cc, 0xaa8cd | 0xaa8ce NorDefaultPuzzlePillar01, ACTI | defaultPuzzlePillarScript (REFR {initialState, solveState} over the base's) | player press: [position0N].onActivate, RotatePillarToState: (a) PlayAnimationAndWait Trigger0N/Turned0N #38, (c) Activate of the portcullis #22 on a re-break; OnCellLoad (lifecycle) (a) PlayAnimation StartState02 #19, StartState03 #24 | COVERED (pillar graph: Trigger0N, Turned0N, StartState02/03, SoundPlay.OBJNordicPuzzlePillar); a guest's press must still reach the host |
| Puzzle lever 0xaa8c3 | 0xb7db4 LeverPushAnimatingNoPlayer, FURN | REFR defaultPillarPuzzleLever, traplever; base TrapLever | player press: defaultPillarPuzzleLever[Waiting].onActivate, doorOrDarts: (c) Activate of the portcullis #3 or of the four darts #22-#43 (rows 2 and 5); no animation native on the lever | ENGINE: the pull is the furniture graph's (LeverPushBehavior: ObjectActivated, LeverPush, LeverPushStart, Lever_PlayerPush, LeverPlayerPush), HYPOTHESIS H3; needs ObjectAnimation 71's engine family |
| Keyhole 0x4e2b9 (Sanctum) | 0x4e2b2 PuzzleDoorKeyHole01, ACTI | HallofStoriesKeyholeScript (USSEP; REFR doorFX 0x5256c, doorBase 0x4e2b8, the rings, myQuest MS13 0x39645, myQuestStageSuccess 50, myMiscObject MS13GoldenClaw 0x39647) | player press with the claw: (a) PlayAnimation Trigger01 #45, Wait 3, checkSuccess, openDoor: (a) PlayAnimation FXDoorOpen on 0x5256c #1, Open on 0x4e2b8 #2, on the rings #3-#5 and on self #6; SetStage MS13 50 #10 (rung 5); Message.Show without the claw #51 (local) | COVERED for the motion (keyhole, base-door and wheel graphs: Open, Trigger0N, SoundPlay.DRSRuinsPuzzleKeyTurn, DRSRuinsPuzzleOpenLPM, DRSRuinsPuzzleRingTurn); the stage is rung 5's |
| Rings 0x4e2ba, 0x4e2bb, 0x4e2bc | 0x50553, 0x50554, 0x50555 PuzzleDoorLarge/Medium/SmallWheel02, ACTI | REFR HallofStoriesDiskScript | player press: RotateRingToState (a) PlayAnimationAndWait Trigger0N/Turned0N #30; onCellLoad (lifecycle) (a) StartState02/03 #20/#25 | COVERED |
| Tripwire 0xb6d3f (Embershard) | 0x22f54 TrapTripwire01, ACTI | Tripwire (USSEP) {blockActivate, FiniteUse, TriggerCount 1, TriggerSound TRPTripwire 0x1d492} | OnTriggerEnter or OnHit, then tripwire[Active].onBeginState: (b) SetMotionType Dynamic #0, (b) Sound.Play #2, (c) Activate(self) #5 (row 16's firing), (a) PlayAnimation Trigger #7, then [DoNothing] (c) SetDestroyed True; OnLoad (b) SetMotionType Keyframed | DARK: TrapTripwire01.nif has no graph and no controller (a constraint-chain rope), so Trigger moves nothing and the snap is Havok (HYPOTHESIS H2) |
| Bone alarms 0x10481e, 0x10481f (Embershard) | 0x799b7 TrapBoneAlarmVertical, ACTI (mesh from USSEP) | SoundTrap (USSEP) {TriggerSound TRPBoneAlarm 0x27eb8, havokNudge fakeForceBallTiny 0x7ea04, soundLevel 100} | OnTriggerEnter, then SoundTrap[active].onBeginState: (b) SetMotionType Dynamic #1, (c) Activate(self) #8, (b) Sound.Play #11, (b) PlaceAtMe havokNudge #15, CreateDetectionEvent #23 (the host's AI), (b) ApplyHavokImpulse #25, (a) PlayAnimation trigger01 #26 | DARK: USSEP's TrapBoneAlarmBHavok.nif has no graph (H2); the clatter is Havok and the sound |
| Oil lamps 0x9b0e1, 0x9b0e2, 0x9b0fb (Temple); 0x9b0ec, 0x9b0ee, 0x9b0f0, 0x9b0f4 (Sanctum) | 0x90efc TrapFallingOilLamp01, ACTI, destructible (stages OilTrapDestroyed.nif, FXEmptyObject.nif; explosion TrapOilLampInitialExplosion 0x109e70) | TrapFallingOilLampColLayer (USSEP) | OnHit, OnMagicEffectApply or OnActivate [waiting], switchToFalling: (b) Sound.Play #4, (b) DamageObject 10 #5, (c) DisableLinkChain #6; [Triggered] onTriggerEnter DamageObject 90; stage 2 (b) PlaceAtMe TrapOilLampExplosion01 0x70e5c | DARK, today and under rung 2: the fall is Havok and destruction (rung 4's DestructionStage 78) |
| Oil pools 0x9b0de, 0x9b0df, 0x9b0e0, 0x9b0e3, 0x9b0e6 (Temple); 0x9b0e8, 0x9b0e9, 0x9b0ea, 0x9b0ed, 0x9b0f1, 0x9b0f2, 0x9b0f3, 0x9b0f5, 0x9b0f6, 0x9b0f7, 0xa193d, 0xa3a74, 0xa3a75 (Sanctum) | 0x862cc TrapOilPool01, ACTI, destructible (explosion TrapOilExplosionInitial 0x109e74) | TrapOilPool, extends TrapExplosiveGas (USSEP) | ignition by OnHit (fire, the torch), OnMagicEffectApply (flame keyword) or OnTriggerEnter: GasExplode, (b) DamageObject 5; OnDestructionStageChanged: (b) PlaceAtMe TrapOilExplosion01 0x889ae, (c) Enable the linked fire light (LIGH 0xb8717 for 0x9b0e0), stage 3 (a) PlayAnimationAndWait stopeffect/end #22, (c) Disable the light and self | DARK in effect: only the end fade is a row |
| Arvel's web 0x1fc43 (Temple) | 0x8b317 MS13FXspiderWebKitDestructible, ACTI, destructible (explosion FXSpiderwebStripExplosion 0x61500) | MS13WebDestructibleSCRIPT | the player's hits (engine destruction), OnDestructionStageChanged: SetStage MS13 #3/#19, Scene.Start #6/#25, SetAV and EvaluatePackage on Arvel #15/#16, (a) PlayAnimation Exit #28 | PARTLY: destruction is rung 4's, the stage and scenes rung 5's |

## Table C: the rest of the cells' scripted references (not traps or puzzles), families only

| References | Scripts | Families |
| --- | --- | --- |
| Cobwebs 0x1fc49, 0x1fc55, 0x37281, 0x3758c, 0x3758d, 0x3ba20 | FXtriggerAmbFX | OnTriggerEnter: (a) SetAnimationVariableFloat fToggleBlend #7 (the only such call in the cells); (b) PlaceAtMe FXcobwebExplosionACT 0xc0c55 #10, Sound.Play #15; (c) Disable #19 |
| Dust drops: Temple 0x1fc4d, 0x3759e, 0x375a0, 0x375a8, 0x375ac (FXdustDropTrigSCRIPT) and 0x375a1, 0x375a2, 0x375ad, 0x375ae, 0x375af; Sanctum 0x37ace to 0x37ad4 (fxDustDropRandomSCRIPT) | both USSEP | OnTriggerEnter or OnUpdate (host only: the gate blanks OnUpdate too): (a) PlayAnimation PlayAnim0N; (b) Sound.Play, PlaceAtMe FallingDustExplosion01 0x88109; (c) Delete |
| Bats 0x37b0d, 0x37b0e (Sanctum) | FXbatScaredSCRIPT | OnTriggerEnter (player only): (b) Sound.Play, Weapon.Fire FXdustDropMedWEP 0x1a138; (a) PlayAnimationAndWait MothTakeoff |
| Arvel's web triggers 0x104b79, 0x106ae2 (Temple) | SpiderWebActorFXSCRIPT, SpiderWebAnimationsSCRIPT | EffectShader.Play WebbedFXS 0x2e1cd and PlayIdle on Arvel 0x39655: actor rows (the NPC stream) |
| Camera FX 0xb9825, 0xb9826 (Sanctum), 0xe9584, 0xe9585 (Embershard) | FXCameraAttachScript | VisualEffect.Play/Stop and Sound.Play on the player's camera: local |
| Quest, comment and music triggers: 0x3ac73, 0x35b39, 0x6a4a1, 0xb7002, 0x105c9b, USSEP's new 0xa01be48 (defaultsetStageTrigSCRIPT); 0x38098's REFR script, 0xaa83e, 0x4940d (MS13); 0xef54d, 0xef54e, 0xef54f, 0x51624, 0x51637 (WICommentTriggerScript); 0x5afc5, 0x63ea9, 0x94be1, 0xa0d91 (defaultAddMusicSCRIPT) | as named | quest stages and scenes (rung 5), a story event, music (local) |
| Encounter enables: 0x17038 and 0xf4a32 (defaultEnableEncLinkedRef, USSEP) enable XMarkers 0x17037 and 0x108a5c, the enable parent of draugr 0x800a3 and 0x800a9; 0x4e421 (defaultPlayerEnableDisableLinkedRef) enables draugr 0x380ba | as named | (c) Enable/Disable (rung 4, the NPC record) |
| Word wall 0x709d2 (Sanctum) | WordWallTrigger02Script, WordWallTriggerScript, WordWallTriggerBleakFallsScript (USSEP) | (a) PlayAnimation on the wall; (c) enable and disable of the sound markers; ImageSpaceModifier (local); TeachWord (the player's): the WordWall verb's |
| Player interaction: Embershard's weapon racks 0xb6d97 to 0xb6e3b, its 22 torch sconces, the ore veins and mining markers of all three cells, forge 0xfcc67, chopping block 0xb6e46, the scroll 0x3c5a9, bandits 0xb6ff7 and 0xb6ff8 | WeaponRack*, RemovableTorchSconce01SCRIPT, MineOre*, BlacksmithForge01, ResourceFurnitureScript, HardWorkerWoodScript, DefaultAddToLinkonLoadSCRIPT, defaultDisableOnReset | inventory and furniture state on the player's own seat; the forge's OnTriggerEnter casts FlameDamage (Spell.Cast, b) on whoever stands in it, host only |

## Evidence notes

- E1, the gate (FridaHooks.cpp:153-166 and :312-323 at 536e30d4): a world object's script in a cell this seat does not host hears
  only oninit, onload, onunload, oncellload, oncellattach, oncelldetach, onattachedtocell, ondetachedfromcell and onreset. Every
  firing event above, OnUpdate included, runs on the host alone; a guest's lifecycle handlers still run (NorLever01SCRIPT.OnLoad,
  default2StateActivator.OnLoad, defaultPuzzlePillarScript.OnCellLoad, HallofStoriesDiskScript.onCellLoad, PhysicsTrap.OnLoad,
  Tripwire.OnLoad, SoundTrap.OnLoad), and rung 2 filters their natives (ADR-068 decision 2, DECISIONS.md:4539: a state row on a
  non-owner skips, an action row runs unreported).
- E2, today's render path: RelayedActivation runs `target.activate(caster, false)` on the guest (relayedActivationService.ts:45) under
  the process-wide Override, past the gate (docs/engine/scripts.md:17, S2), so the guest's own script simulates the whole trap, dart,
  rock, sound and collision included. Rung 2 swaps that for the host's natives at the seam; whatever has no row is what goes dark.
- E3, the relay and the record: OnLinkedActivation (ActionListener.cpp:3796) records through `targetPtr->Activate(..., kReportedByHost)`
  at :3966 (a door's SetOpen, MpObjectReference.cpp:1956 and :2055), then sends RelayedActivation to every listener but the reporter
  (:3975-3993). Only a non-actor caster reaches it (:2201); a self-activation is noted and nothing more (:2165); an actor caster takes
  the hosted-caster rule (:2236-2253).
- E4, graph sounds: a behavior's `SoundPlay.<editor id>` annotation plays the sound at the source when the clip fires (the Nexus
  thread below); the annotations quoted above are the behavior files' own strings (hkxstr.py). The meshes' graphs are their
  BSBehaviorGraphExtraData strings (nifstr.py).
- E5, activate parents: XAPR is the parent and the delay, XAPD 0x01 Parent Activate Only (UESP's REFR table); a parent passes its
  activation on, and scripts can always activate the child (the CK's Reference page).
- E6, GetNthLinkedRef(0) is self, (1) the linked ref, (2) the linked ref's linked ref (the CK page), so masterAmbushScript.onEndState
  #12-#16 reaches the lid through the alcove marker.
- E7, `Weapon.Fire(ObjectReference akSource, Ammo akAmmo)` fires the weapon base from akSource (the Papyrus reference below).
- E8, no channel exists today for a trap's projectile: the launch hook passes only the player's and the figures' launches into JS
  (FridaHooks.cpp:825-836).
- E9, the prop stream: kHavokMoved is its row (STATE.md:77); traps' bodies are deferred to M4's dungeon work (prop-physics.md:532).
- E10, Enable/Disable: TESForm.kFlags bit 0 is undeclared with no channel (STATE.md:47); ADR-068 decision 4 puts it on the change form
  (DECISIONS.md:4554), research file 6.3 (:312-342) lists the state rows; Sound.Play is already an action row there (:328), and
  Sound.PlayAndWait's twin is named in decision 4 (DECISIONS.md:4566).

## HYPOTHESIS tags (one observation each)

- H1: a graph-annotated sound plays on a guest when the relayed event fires the clip; the guest's ear at the spike wall on rung 2's
  stage (the swing grate sound with no windup).
- H2: PlayAnimation Trigger on the tripwire and trigger01 on the bone alarms move nothing (no graph, no controller); a guest's view of
  either while the host fires it.
- H3: the puzzle lever's pull is the engine's furniture code and reaches the engine-level animation hook at depth zero; H-D1's
  counter during one pull of 0xaa8c3 on a stage, expected nonzero.
- H4: the lids are dark on guests today (an actor caster); x-bleak-traps-npcs v2 with NPCs on, the guest's view of 0xe9988 when the
  ambush at 0xe9985 wakes.
- H5: Embershard's lowered bridge 0xb6c26 blocks a guest under rung 2 before rung 4; a guest walking the lowered bridge on rung 2's
  stage.
- H6: a `Weapon.Fire` relayed as the same native hits the guest's own player in the guest's engine; the design question for the row,
  read by the guest's health at the darts.

## Scratch outputs

scratchpad/trapread/: cells.py and cells.json (the references, bases, overrides), scripts.py, calls.json and disasm/ (87 scripts,
the USSEP and vanilla copies side by side where they differ), closure.py (each handler's natives by family), nifstr.py, hkxstr.py,
bases.py, extra_overrides.py. On sky-srv: /tmp/thuum-trapread-93f37424/ (the same readers and their outputs).

## Sources

- UESP, Skyrim Mod File Format, REFR (XAPD, XAPR, XLKR, XESP): https://en.uesp.net/wiki/Skyrim_Mod:Mod_File_Format/REFR
- UESP, Compiled Script File Format (the opcodes lab/pex.py decodes): https://en.uesp.net/wiki/Skyrim_Mod:Compiled_Script_File_Format
- Creation Kit wiki, Reference (activate parents; read through a search summary, the page answered 403):
  https://ck.uesp.net/wiki/Reference
- Creation Kit wiki, GetNthLinkedRef: https://ck.uesp.net/wiki/GetNthLinkedRef_-_ObjectReference
- Papyrus reference, Weapon.Fire: https://papyrus.bellcube.dev/skyrimse/script/weapon/function/fire/
- Nexus forums, animation sound annotations: https://forums.nexusmods.com/topic/1817090-changing-animation-sound-effects/
- On relaying a simulation versus streaming the owner's state (the Weapon.Fire and impulse caveat): Glenn Fiedler, "State
  Synchronization" (the authority scheme), https://gafferongames.com/post/state_synchronization/ ; Yahn W. Bernier, "Latency
  Compensating Methods in Client/Server In-game Protocol Design and Optimization" (GDC 2001), the server-authoritative model,
  https://www.gamedevs.org/uploads/latency-compensation-in-client-server-protocols.pdf
