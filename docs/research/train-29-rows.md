# train-29 rows: the facts per row (read-only memo, 2026-10-19 evening)

Sources: scratchpad/pt25 (log-read, probes-read, probes-read-2, bond-red, unarmed) and pt24 (log-read,
placed-objects with the REA appendix); docs/private/playtest-m2-25.md, -26.md and the -27 draft (re-read
19:10 PDT); docs/verbs/spell-cast.md:1271-1376; docs/verbs/figure-values.md; ADR-029 and ADR-037
(docs/DECISIONS.md:742-831, 1339-1443); docs/research/apocalypse/ effect-conditions.md;
docs/private/apocalypse-census-spells.tsv. Fork code is read on origin/m2-train-28 (e3806870; parity
88c43e77 is behind it) with `git show`; CommonLibSSE-NG at the pinned b93280e8. Facts carry file:line;
inferences are marked HYPOTHESIS. Nothing was edited.

Actors in every run and playtest here: ff000000 = test 1 = c1 (the caster), ff000001 = test 2 = c2. Playtest
25's build: fork m2-train-28 c0fd719e with 2314fdc2's client dist; the probe runs used server image
m2-train-28 and client c0fd719e.

## Row 1. Apocalypse's MCM missing under the essentials layer (and Survival's quest)

Observed. Playtest 26 (docs/private/playtest-m2-26.md:34-40): SkyUI's menus open, the MCM opens, "opens, no
apocalypse"; b-player-globals' item could not run. The layer carries SkyUI and MCM Helper (:12-13). Which
entries the list DID show was not written down; the -27 draft asks for it
(docs/private/playtest-m2-27.md:73-76). New since the draft's first version: the lab found (run
20261020-020321, playtest-m2-27.md:17-21 and :49-58) that the same block keeps the Survival Creation's quest
from running (its switch, prompt and needs ride Papyrus events), and files that fix under this row.

What the whitelist does (skyrim-platform/src/platform_se/skyrim_platform/FridaHooks.cpp, OnSendEventEnter
:28-151). Once skymp5-client turns the block on
(skymp5-client/src/services/services/blockPapyrusEventsService.ts:10-17), every Papyrus event sent to a handle with attached scripts is blanked: the event-name argument is replaced by "" (:147-150); OnUpdate skips the allow list at :85 and is therefore blanked for every script, admitted ones included (corrected 2026-10-19 evening from the first draft's "except OnUpdate"). Exemptions: (a) the handle is an ActiveEffect the player bears or cast (:73-83, ADR-029's A1
rule); (b) one attached script's own TYPE NAME (`script->GetTypeInfo()->GetName()`, :93-95) starts with
"SKI_" (:97-102) or "RaceMenu" (:103), or equals GRIM_ALT_TeleportationMarker (:114),
WB_DestroyAfterDelay_Script (:124; ALREADY on this branch, the stuck-bolt fix is in) or
defaultDisableHavokOnLoad (:136). The test reads the script's own name only; the parent chain
(CommonLibSSE-NG include/RE/O/ObjectTypeInfo.h:127-128 `GetParent()`, :178 parentTypeInfo) is never walked.
Apocalypse's config script is WB_MCMQuest_Script extending SKI_ConfigBase
(docs/verbs/player-globals.md:173): its name fails every test, so every event to its quest (OnInit, SkyUI's
registration mod event, the page and option events) is blanked. HYPOTHESIS (SkyUI's sources are not in this
tree): SkyUI lists a mod only after its config script answers the config manager's mod event, so a blanked
script is an absent entry. The mechanism is certain; that it is THE cause of Eli's empty list is the check
below. Survival's quest scripts are not SKI_ subclasses, so the parent-chain fix alone does not cover them:
they need their names (or "the quests of a listed plugin") admitted, and ADR-029's text says quests' events
"stay blanked" (DECISIONS.md:785), so that half is an ADR line, not a one-liner.

The decisive in-game check. From docs/private/mods-fenestrate.md (ticked = carried), the layer's MCM-bearing
mods split in two (HYPOTHESIS per mod on which base class its script extends, from "needs: SkyUI" + "(MCM)"
against "needs: MCM Helper"): plain SKI_ConfigBase: Reading List SSE (:41), Unread Books Glow SSE with MCM
(:43), Jewelry Limiter (:85), Apocalypse (:71): four. MCM Helper: TrueHUD (:42), Stealth Detection Fixes
(:65), True Directional Movement (:110): three. Read the Mod Configuration list once: (i) only the three MCM
Helper entries (plus SkyUI's own: SKI_ConfigMenu passes the prefix) are listed: the block is the cause, all
four plain scripts are blanked; (ii) Reading List, Unread Books Glow and Jewelry Limiter are listed and
Apocalypse alone is missing: the cause is Apocalypse's own registration, not ours; (iii) nothing but SkyUI
is listed: the block also eats MCM Helper's registration (HYPOTHESIS that its DLL registers natively;
unread). The -27 draft's sentence "Every MCM Helper mod missing says our event block" (:73-76) has it
backwards by this read: the PLAIN SKI_ConfigBase mods are the ones the block blanks; worth one correction
before the seats.

Code site. FridaHooks.cpp:92-141. Vain shape: walk `info` through `GetParent()` and admit a script whose any
ancestor's name starts with "SKI_" (one rule, "a SkyUI config script"); lazy shape: one more `stricmp(name,
"WB_MCMQuest_Script")` arm like :124. For Survival: the Creation's quest script names, or a settings-driven
list (data, not code, ADR-029's own phrasing for its allowlist). Consequence: the MCM script's events run in
the player's game and write Apocalypse's settings globals, which ADR-029 records per player (decision bullet
4; docs/verbs/player-globals.md): the intended path.

Tests. T0: none (Skyrim Platform). T1: the Windows build. T3: lab/scenarios/b-player-globals.yaml writes a
global by the driver's `global` step, not the MCM, so it proves the record, not the menu; the menu is T4
(playtest 27 section 4); x-survival-probe (the -27 draft) is the Survival half once the block admits it.
Open: a driver read of SkyUI's config list would make the menu T3; none exists.

Build: Windows (SP dist).

## Row 2. Finger of Death on another player

Observed. Eli (docs/private/playtest-m2-25.md:74-78): "both received damage on player 1's screen, but now on
player 1's screen player 2 is reduced to a pile of ash, while still being alive on player 2's screen."
Server (pt25/log-read.md section 2; server.log:506-510): `OnSpellCast - ff000000 cast c035452 in hand 0,
delivered to its target`; `relayed at its first hit, on ff000001`; `Unknown function index: 354`;
`E_CONDITION_UNKNOWN: function ? (354) on effect c035450 of c035452 ... refused (thuum ADR-039)`;
`OnSpellHit - Target ff000001 is hit by c035452 spell at 1 times its magnitudes (once)`. No "a fight begins"
(anyEffectHeld false, ActionListener.cpp:3406-3420, :3444-3447), no damage, no Kill, EvaluateDeathItem or
Respawn line, nothing logged afterwards. c2.log: the hands replay only (lines 77-80); c1.log: nothing.

Cause, firm. 354 is kIsEssential (CommonLibSSE-NG include/RE/T/TESCondition.h:446). The factory registers no
IsEssential (skymp5-server/cpp/server_guest_lib/condition_functions/ ConditionFunctionFactory.cpp:33-93);
EffectConditionsHold refuses an effect whose function the map lacks (MpActor.cpp:2985-3008); ApplyEffects
skips it (:3052-3057). c035450 is the spell's only effect: archetype Script, magnitude 0, seven MGEF
conditions (census row 86: IsActor == 1, GetDead == 0, HasKeyword Dwarven == 0, HasKeyword Undead == 0,
IsUndead == 0, HasKeyword MagicNoDisintegrate == 0, IsEssential == 0); six have server functions (IsActor
353, GetDead 46, HasKeyword 560, IsUndead 715), the seventh does not. Even with IsEssential, the server
applies no number: the kill is the script's (census: "changes the caster's H/M/S | changes the target's
H/M/S | kills the target"; natives Actor.Kill, Actor.AttachAshPile, Actor.SetCriticalStage,
Actor.DamageActorValue, Game.TriggerScreenBlood, ImageSpaceModifier.Apply, ...).

The ash pile is ADR-029's default doing what it says (DECISIONS.md:742-831): "By default a player's game
runs the scripts of the magic effects on its own player and of those its player casts"; "until its script is
on the allowlist a script's change to another player's figure stays in that game". FridaHooks.cpp:73-83 is
that rule in code. So WB_FingerOfDeath_Script ran in c1's game on c2's figure, read the figure's now-real
Health (figure-values, formView.ts:364-389) under its threshold, and killed and ashed the figure there
(HYPOTHESIS on the script body: the census's natives; the figure has startDeferredKill, formView.ts:316-321,
and whether Papyrus Kill or SetCriticalStage ignores a deferred kill is unread).

How the server treats a client's scripted kill or a death report on a figure: it never hears one. The client
has no death report: deathService.ts only APPLIES the server's isDead (DeathStateContainer,
remoteServer.ts:809-822; CreateActor's isDead :503-507) and kills a figure only on the server's word
(deathService.ts:141-153: endDeferredKill then kill); predictFigureDeath (:105-139) is the headshot playback
and reverts. The server kills a player only through MpActor::Kill (MpActor.cpp:1901-1923), called by the
headshot claim (PartOne.cpp:1646) and the console (ConsoleCommands.cpp:266), or SetIsDead (:2105-2140);
OnHit reports damage, never deaths (ActionListener.cpp:2786 onward). So the record stayed alive, c2 lived,
and c1's game kept a dead figure (HYPOTHESIS: until the figure is re-created by a cell change or a
relaunch). In c2's game the relayed cast landed nothing: a target-actor cast at this player maps to 0x14
(remoteServer.ts:1073-1076) and castSpellImmediate's non-Self fire-and-forget branch launches a projectile
the spell lacks (spell-cast.md:1240-1250), so no script ran there.

Fix shapes (Eli's call; ADR-029 names the ground). (a) The allowlist entry: the server evaluates IsEssential
(a new condition_functions/IsEssential.{h,cpp}, false for players, registered beside GetIsID at
ConditionFunctionFactory.cpp:78-83), runs the threshold and kills with MpActor::Kill (the headshot's
primitive), and every game blanks WB_FingerOfDeath_Script: docs/verbs/natures-balance.md:92-96 and :104-105
want the allowlist delivered to the games at login and the event filter blanking before the A1 test; that
delivery is unbuilt (a wire field, rule 4) and the blank is SP. (b) Server only: IsEssential alone, so the
hit holds (a fight begins) and nothing else changes; the ash pile stays. (c) A client guard (not ADR-029's
shape): Skyrim Platform refuses Actor.Kill, AttachAshPile and SetCriticalStage on dynamic-form targets from
Papyrus; Hooks.cpp:350-397 logs VirtualMachine::Bind and alters nothing today.

Tests. T0: unit/EffectConditionsTest.cpp (the Row() helper :42-56): the seven conditions hold on a living
player once IsEssential answers false; for (a) a kill test in BondTest's shape. T2: a difftest session
declaring the kill's DeathStateContainer (t 18) to the target and the isDead property to observers
(sessions/shadowbond.yaml's shape). T3: a b-finger-of-death scenario, Eli's review (rule 13): c1 casts at c2
at low health; `server.actor(c2)` dead (lab-api's Pos view carries isDead, assertions.py:160-170), c2's own
game dead, c1's view agrees; and the negative at full health. Open: effect-conditions.md "Vampirism, filed":
a turned player reads mortal to IsUndead and HasKeyword Undead until M5.

Build: server-only for (b) and (a)'s server half; Windows for (a)'s blank or (c).

## Row 3. The local dent: a player's own sword hit on a figure's bar

Observed. x-figure-values-hit 20261019-214505 (green on its weak asserts; pt25/probes-read.md run 1): c2's
figure in c1's game fell 100 to 93.8338 at c1 1900 ms, one sample BEFORE c1's own hit record (1905 ms),
while the server's number is -6.496 (server.log:171 `OnWeaponHit - ff000000 hits ff000001 with 12eb7 for
6.4960003 damage ... health 1 -> 0.93504`); then -0.078, -0.042, -0.015 to 93.6996 (93.504 never appears)
and a climb at 0.36 per s. c2's own health fell by the server's number (93.5157 against 93.504) 222 ms
before its engine's local hit, which changed nothing (attackDamageMult 0 on the figure attacker held). Eli's
"[?]" (playtest-m2-25.md:67-70).

Cause as read. The figure-side guard did not hold. FigureHealthDamage (Hooks.cpp:222-242: on
VTABLE_Character[0] vfunc 0x104, drop the call when the victim's formID >= 0xFF000000 and its
kAttackDamageMult reads 0; installed at :414) IS in the tested dist: commit 073610b7 is an ancestor of
2314fdc2. Two hypotheses, both HYPOTHESIS: (H-a) the vfunc is a notification after the number lands,
ADR-037's own caveat (gate 2: "HYPOTHESIS until the lab: that this virtual is where the number is applied";
Skyrim Together gates Actor::DamageActor 37335 one call earlier, docs/TE-MAP.md:62); (H-b) the figure test
fails at the hit (the value not 0 as read, or the figure's class not reaching that slot). The three
shrinking steps are unexplained (HYPOTHESIS: the engine's regeneration against setActorValuePercentage
writes from the movement reports).

The hook that could block it. If H-b, the same vfunc with a tighter figure test (the registry native
figure-values.md names as the follow-up). If H-a, a Hooks.cpp hook on the damage gate TE uses (37335 by
Address Library id from lab/addr.py, rule 1; never from memory) returning without the write when the victim
is a figure. The TS alternative (restore the figure's value on its hit event) shows the dip
(figure-values.md, Suppress: "worse: a visible dip").

Frida first (rule 8). figure-values.md's Dynamic plan says "none planned"; it needs one: on c1's seat, hook
the vfunc and 37335 for the sword hit on the figure and log which fires, the victim id, the damage, and
Health before and after each. lab/frida has no damage trace yet (push-trace.js and launch-trace.js are the
nearest shapes).

Tests. T0: none (SP). T3: x-figure-values-hit with a real assertion: the figure's health series in c1's game
never below the server's percentage times its maximum, its first drop equal to the server's. lab-api's
WatchView carries no health series (assertions.py:177-235: track, events, bools, launches, flights), so a
`health` series view is a lab-api change (Python, no fork build). b-figure-values' `relaunch` middle group
now exists (lab/scenarios/b-figure-values.yaml: 36-43) after the `reconnect` no-op of 20261019-220657.

Build: Windows (SP) after the Frida read; lab-api for the assertion.

## Row 4. Lightning Strike unseen by the observer

Observed. x-lightning-strike 20261019-220431 (pt25/probes-read-2.md section 2): in c2's game the figure's
launch record is `[13929, 0, 0, 201336952, 117912.32, -81382.80, 11009.73, 0.7856, 0, 1]`: c1's exact origin
and angles, projectile 0; then nothing (no flight, hit, effect, explosion); c2's health fell 60 by the
server's number 2.68 s after the figure's release. c1's own launch `[13941, 202178048, 0, 201336952, ...]`
carries PROJ 0x0C0CFE00; c2's figure in c1's game is hit 2.52 s later with 0x0C0FADFD and 0x0C100BA6; the
server refused c100ba6 on HasPerk 448 and applied the spell once (server.log:306-309). Eli: "still
invisible" (playtest-m2-25.md:97-104). The first run (214707) died on c2's teleport to (0, 300, 0), 1245
units below the target; the probe is re-grounded on the hunters' camp flat (pt25/x-lightning-strike.yaml
header).

Cause, firm from the record and the constructor. MagicApi.cpp:296 builds `RE::Projectile::LaunchData
launchData(pActor, origin, angles, pSpell)`; CommonLib's spell constructor (CommonLibSSE-NG
src/RE/P/Projectile.cpp:213-222) sets `projectileBase = a_spell->GetAVEffect()->data.projectileBase` and
`area` from GetCostliestEffectItem. Lightning Strike's effects (pt24/placed-objects.md:119-131; census row
5): 0x0C0FADFD, DualValueModifier Health/Magicka m60, projectile 0; 0x0C100BA6, m200 d1, projectile
0x0C0CFE00 (the lobber: Grenade, Alt Trigger, timer 2.5, proximity 0, explosion 0x0C0F5058 which places the
bolt ACTI 0x0C0FADFF). The AV effect is the first (HYPOTHESIS on the engine's pick; the 0 in the launch
record is the fact), so projectileBase is null and `RE::Projectile::Launch` (:302) launches nothing; the
hook records `seen.projectile = 0` (FridaHooks.cpp:513-519). Frost Rune's one effect carries its PROJ, which
is why the rune relays and this does not.

Fix shape. After MagicApi.cpp:296: when `launchData.projectileBase` is null, take the first of
`pSpell->effects` whose `baseEffect->data.projectileBase` is set (include/RE/E/Effect.h:39,
include/RE/E/EffectSetting.h:90) and set it; keep area 0 (the REA read: the explosion pointer comes from the
PROJ when area is 0, placed-objects.md appendix Q4; 0x0C0CFE00 carries 0x0C0F5058). With the lobber flying
in c2's game, the whitelist entry already on the branch (FridaHooks.cpp:124-135) deletes the bolt there too.
If the lobber then flies and never explodes, the REA's three static candidates stand (a null parentCell on
the figure's LaunchData, a model that never arrives so the timer never starts, a dive below ground).

Tests. T0: none. T3: x-lightning-strike with `c2.watched(c1).launched(201588224) >= 1` (launched matches
spell, projectile or ammo: assertions.py:218-223), c2's self watch taking the strike's effects, screenshots
of both seats at the strike. HasPerk 448 stays refused by design (effect-conditions.md:165).

Build: Windows (SP).

## Row 5. The rune glyph undressed on the observer

Observed. x-rune-visible 20261019-215211 (pt25/probes-read-2.md section 1): the rune's reference stood at
the relayed point in c2's game through all 30 samples and sample 31 (1.6 s to 67.3 s after the key;
0xFF000AF7 at 440.625), tripped on c2's walk in c2's own game (FrostSlowFFContact from c1's figure at 86.3
s, three hits taken), the server logged the one `OnSpellHit ... 6796f` and c2's health fell to 0.518 in all
three views; no glyph in any c2 frame (ground pixels (61,69,71) unchanged across 032, 064, 114 and 129).
Eli: "invisible still. there's a light glow so SOMETHING is there, but the runic glyph is not"
(playtest-m2-25.md:90-95).

Engine read (REA on sky-re, pt24/placed-objects.md appendix; spell-cast.md:1325-1343), all HYPOTHESIS until
a Frida read: the player's rune cap (40674 AddRune behind the gate 43934, `shooter == *(401069)`) registers
only the player's runes; the manager sweep 44093 never takes grenades; fMineAgeMax is 0; FinishCast 34435
kills only a concentration aimed spell's own projectile; so nothing shooter-dependent ends a figure's landed
rune ("removed later" is dead). The one player test in the landing's look is the impact-effects pass 44213
(once per landing, bit 20): `shooter handle == *(403520)` picks the effect quality tier, 0 or 4 for the
player, 0xC for anyone else, `| 3` far from the camera; the decal and particles come from that pass. H3b,
"armed but undressed", fits every observation.

What a Frida read must observe before any hook is written (spell-cast.md:1367-1372): on c2's seat, at the
figure's rune landing: 44213 entered once for that rune, the outcome of its shooter-handle compare and the
tier chosen (0xC expected), against the player's own rune (0 or 4); whether the decal and particle path runs
at all for tier 0xC (if it runs and no glyph shows, the tier is not the cause and 44222's model path is
next); 43919 once (the settle), no 44110 while the rune stands alone; at the walk, 44217 true, the timer at
0.1, one 44110 from 44216. Only then the hook shape (a tier override for dynamic-form shooters, filtered in
native, rule 9, plus a per-figure rune cap since the engine never registers a figure's rune) as a verb-sized
change to spell-cast.md's target-location section. No offsets here; the ids are lab/addr.py's (rule 1).

Tests. T3: x-rune-visible measures presence; the glyph is a screenshot (T4) until refs-near (row 7c) adds
flags; a pixel check is not an assertion lab-api has.

Build: Windows (SP) after the read; nothing before it.

## Row 6. Scattershock's hits not reported

Observed. Playtest 25 (pt25/log-read.md section 1's table, unexplained 7): c2.log 14:34:33.714 to 36.265,
the figure's MLh_SpellAimedConcentrationStart (taken 0, castReady, taken 1), release 2.55 s later,
MLh_Equipped_Event at 39.557; the server logged no OnSpellHit of c024e49 (or 12fcd) in 21:34:34 to 21:34:40.
Eli ticked "[x] the missiles fly from test 1's hand toward test 2 on BOTH screens"
(playtest-m2-25.md:106-109). Probe x-scattershock 20261019-214948 (pt25/probes-read.md run 3; green on its
position assert): a 2500 ms hold gave the full concentration animation on both screens (c1 1299 to 3787 ms;
c2's figure 1152 to 3651 through castReady) and no cast event, no magicka change (3000 flat), no launch in
either game; c2 stood 9.5 west, 631 north and 1071 BELOW c1 (the ridge's north slope), c1 aimed level.

Cause as read. The census (row 65): Scattershock 03024E49 is Concentration, Aimed, CHARGE 2.5 s, missile
PROJ WB_DestructionShock_Projectile_Scattershock, effects 0309CB6E (DualValueModifier Health/Magicka m30 d1)
plus the PerkDisintegrateConcAimed rider. x-stream-aim 20261017-135526 measured it: "Scattershock's 2.5 s
charge left one missile in a 3 s hold" (docs/LOG.md:1845). So a 2.5 s hold ends where the charge ends:
nothing launched, no cast event, no cost (HYPOTHESIS that the charge costs nothing); the playtest's 2.55 s
hold is the same shape, with its target far below the aim. The reporting path has a green behind it:
x-class-streams 20261018-013048 counted Scattershock by the stream's time, 18 launches on each side, two
hits after its stop refused E_SPELL_NO_CAST (spell-cast.md:1007-1013); x-stream-aim2 fixed its heading to
180.00 on 13 of 16 launches (:1173-1178); hits travel hitService.ts:144-229 to OnHit's ClaimCast branch
(ActionListener.cpp:2879-2931) and OnSpellHit by time. Verdict: not yet a defect in code; a measurement gap.
The pitch half of a figure's stream stays HYPOTHESIS (spell-cast.md:1178-1181).

Row shape. Re-run x-scattershock on the hunters' camp flat (x-lightning-strike's ground, c2 300 units north
facing south), a 6 s hold, asserts: c1's self launches of the missile PROJ >= 4,
`c2.watched(c1).launched(<proj>) >= 4`, `flights_match(..., "angle")` within a few degrees, and `until
server.actor(c2).healthPercentage < 1` within the hold. Red there is the defect; green closes the row. The
PROJ's id: by edid through lab/esm.py.

Build: none (a probe YAML in lab/.cache/probes; a committed scenario is Eli's, rule 13).

## Row 7. Three small ones

OpenContainer wait loop. pt25/log-read.md unexplained 4: c1 completed at least 2000 latent Utility.wait
calls from the bond's break onward (call 1000 at 14:35:16.897, call 2000 at 14:38:35.765, about 5 per s).
The break was an activation of b318b at 21:32:24.525 (server.log:478 `ProcessActivate b318b - no occupant`:
CheckIfObjectCanStartOccupyThis, MpObjectReference.cpp:1655-1663, from the CONT branch :1523-1533 or the
FURN branch :1560-1572, each ending in SendOpenContainer and `this->occupant = actorActivator`), and the
swap moved test 1 away in the same instant (:480-481). The client handler (remoteServer.ts:204-270)
activates the refr (:217), then `while (!functionChecker()) await Utility.wait(0.1)` until ContainerMenu is
open or getFurnitureReference is set (:245), then until it is not (:248), then sends the second Activate
(:252-257). With the player gone the first loop never ends (one 0.1 s wait per update: the 5 per s
measured), and the server's `occupant` stays test 1 until its destroy or disable sink (:1535-1543).
HYPOTHESIS: the object then refuses the next player by the occupant distance check (:1672 onward). Fix
shape: a deadline on the first loop (N seconds, or the player farther than the server's kOccupationReach,
512 for containers and 256 for furniture, or the player's own Teleport), and on giving up still send the
second activation, which the server takes without the reach check (ActionListener.cpp:1059-1062,
:1077-1078), so the occupant is released; verify that the second-activation path clears `occupant`. T3: c1
activates a container and is teleported away; c1.log shows no `Utility.wait (call 1000)`; c2 then opens it.
Build: TypeScript client, which ships in the Windows dist.

EffectWasDualCast, condition 724. Refused and logged by design (Condition.cpp:86-89's comment;
effect-conditions.md:165). Playtest 24 saw it on Firebolt's and Crackle's rider 0x153d3,
PerkImpactStaggerPushFFAimed, whose record reads `EffectWasDualCast 724 == 1 on Target` AND `HasPerk 448
Impact == 1` (effect-conditions.md:65-66); 13 Apocalypse spells carry a 724 condition (census conds:
Electrosphere, Dragon's Teeth, Ice Shiv, Rift Bolt, Fracture, Hailstone, Forbidden Sun, Thundercrack, Blaze,
Incendiary Flow and three more). The plan exists (effect-conditions.md:113-115: "EffectWasDualCast 724 (the
context's flag)"). Missing on the branch: ConditionEvaluatorContext has no dual flag
(ConditionsEvaluator.h:36-44: damageSourceFormId, effectVictimFormId, effectCasterFormId), and the server
keeps no isDualCasting on its cast claims (no such field in server_guest_lib or wire-rules outside the
SpellCastMessage), so the flag must travel SpellCastMessage.isDualCasting -> the claim record -> the context
(filled at MpActor.cpp:3011-3014) -> a new condition_functions/EffectWasDualCast.{h, cpp} registered at
ConditionFunctionFactory.cpp:66-83. The stagger rider stays refused on HasPerk until M5; the gain is the
effects gated on 724 alone (which of the 13: a census read) and a shorter unknown list. T0:
EffectConditionsTest (Row helper). T2: a difftest session with a dual cast whose 724 rider holds.
Server-only.

The `refs-near` driver step. Specified in pt24/placed-objects.md section 6 ("The step to add"): args
{radius, from: self|other, formTypes, ids}; Cell.getNumRefs per form type, getNthRef for the non-projectile
types with formId, baseId, baseType, disabled, deleted, pos and distance, counts only for projectile types
(every Papyrus call on a projectile reference aborts), and the projectiles step's findClosestReferenceOfType
bisection for `ids`. Not built anywhere: lab/driver/src/index.ts has `arrows` (:1209-1217) and `projectiles`
(:1218-1265) only; lab-api's CLIENT_ACTIONS lacks it (lab/labapi/labapi/scenario.py:22); the probe that
wants it waits as lab/.cache/probes/x-rune-visible-refs-near.yaml while x-rune-visible ran on `projectiles`
(presence and a bisected distance, no count and no flags). Pieces: the driver case; scenario.py's set;
board.py keeping the last answer per observer as projectiles does (:104-105, :193); assertions.py a
`c.refs_near()` view with count(formType), has(baseId), distance(baseId); runner.py already writes long
answers to steps/<n>-<c>-<step>.json. Build: `just build-driver` (justfile:139-141) or CI's driver-build
(.gitlab-ci.yml:89-96), onto a clone with `just client-driver <vmid>` (:519-522); the lab-api image needs
green labapi-tests first. No fork build.

## Which rows need a Windows build, and the order

Windows (the client and SP dist; one push-built run can carry them all): row 1 (FridaHooks.cpp, both
halves), row 4 (MagicApi.cpp), row 7a (remoteServer.ts); rows 3 and 5 only AFTER their Frida reads (a hook
written before the read is rule 8's loop); row 2 only if Eli takes the allowlist's blank (SP) or the client
guard.

Server-only (fast oracle, T0 in seconds): row 2's IsEssential and, if taken, the allowlisted kill; row 7b's
EffectWasDualCast.

Lab only (no fork build): row 6's re-grounded probe, row 7c's refs-near (driver plus lab-api), row 3's
health-series assertion view.

Order that follows: (1) the server rows (2b, 7b): T0 green before any lab time; (2) one Windows dist with
rows 1, 4 and 7a, whose causes are static and firm (row 1's Survival half carries an ADR line); (3) on that
dist's stage, the two Frida reads (row 3's damage chain on c1, row 5's tier on c2) and the row 6 probe
during the waits; (4) a second Windows dist for rows 3 and 5 if the reads name a hook. Playtest 27's section
4 answer (the MCM list) decides row 1's shape before (2).

