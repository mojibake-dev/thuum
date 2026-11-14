# Casting: where a hand-cast bolt flies, the engine model (the reanimation raise)

Written 12:18 PST 2026-11-13 under ADR-064 amendment C (docs/DECISIONS.md:4245-4248): the facts the x-reanimate-return runs of
2026-11-12 (20261112-103005, -123225, -142746 and -152001) and the reanimation stage of 2026-11-13 (x-reanimate-look v1.2,
20261113-075817) taught about the two-handed Dead Thrall bolt, written down before x-reanimate-claim v2.3 and x-reanimate-look v1.3
rely on them for their raise (the stage's read, lab/.cache/drafts/reanimate/read-stage-075144-075817.md, section 6 item 1). The
verb doc is docs/verbs/npc-fate.md (ADR-060, the reanimation); the probes cite these rows (M-numbers). docs/engine/ai-world-state.md
E24 and E25 hold the same stage's other premise, Sven's own walk indoors and the lab's hold.

The reading rule is non-owning-seat.md's: a code read or a decompiler read is a hypothesis with a source, a run id confirms.

- Ids, by `just addr` (lab/addr.py over addrlib/, 1.6.1170.0, 428461 entries, 2026-11-13): 44108 0x7e46c0, Projectile::Launch
  (CommonLibSSE-NG src/RE/P/Projectile.cpp:258, RELOCATION_ID(42928, 44108)); 44213 0x7ecd80 and 38668 0x6be880, the impact and
  the hit event as lab/frida/lamp-shot-trace.js:40-45 labels them (CommonLib names neither: roles HYPOTHESIS); 44222 0x7ee3e0,
  41248 0x764f10 and 44184 0x7e99a0, the projectile's first update, the player's auto-aim and InitVelocity as the arrow static read
  names them (docs/verbs/marksman.md:212-221, HYPOTHESIS).
- Records: Skyrim.esm by lab/esm.py, 2026-11-13. The seats' load order (lab/layer/load-order.tsv) overrides five of the seven
  spell records these rows use (the SPELs, MGEFs, PROJ and EQUP). Two, as lab/.cache/drafts/reanimate-fx.md:293-295 and
  :305-313 read them over the clients' order: SPEL 0x7e8df's winner is SpellAbsorptionAndTwinSoulsFix_SE.esp (ETYP 0x13f45
  BothHands, the same effects), and PROJ 0x75348's is MysticismMagic.esp's MAG_ReanimateProjectile (speed 1664; Skyrim.esm's
  flies 1066). Three keep what a row reads (lab/esm.py over the 91 served plugins and the nine client-only ones, read-only on
  sky-srv, 2026-11-13): MGEF 0x7e8e0 (Odin - Skyrim Magic Overhaul.esp's wins, the same projectile, reanimate-fx.md:308-309),
  SPEL 0x12fd0 (MysticismMagic.esp's MAG_Firebolt, EitherHand 0x13f44, the same effects) and SPEL 0x65bd7
  (SpellAbsorptionAndTwinSoulsFix_SE.esp's, EitherHand, 60 s, reanimate-fx.md:306-307). EQUP 0x13f45 and MGEF 0x8bb2a are
  Skyrim.esm's alone.
- Traces: "142746 T15:292" is line 292 of that run's frida/c1-lamp-shot-trace-20261112-142746-x-reanimate-return-15.js.jsonl
  (lab/frida/lamp-shot-trace.js v1.1, sha1 906ea1ec, refs [0x13491], attach only: Frida's Interceptor.attach leaves the original
  to run, https://frida.re/docs/javascript-api/#interceptor). Any other cite is the run's results file at
  https://thuum.gaussing.tv/results/<run>/.
- Geometry: "ahead, right, up" are in the caster's frame, from its feet along its heading (the dump-state at each rung), the body
  by its reference point (the server's at-rest line and the dump's near list).

## The rows

| Row | Claim | State | Evidence |
| --- | --- | --- | --- |
| M1 | Dead Thrall (SPEL 0x7e8df, effects 0x7e8e0 and 0x8bb2a) is a two-handed spell, and each charged release launches one bolt from the LEFT hand. Its ETYP is BothHands (EQUP 0x13f45; SpellItem::IsTwoHanded, include/RE/S/SpellItem.h:82), and both hands hold it at every rung. Each launch row names shooter 0x14, spell 0x7e8df, PROJ 0x75348, castingSource 0 (kLeftHand, include/RE/M/MagicSystem.h:25), autoAim 1, desiredTarget null, angleZ the heading and angleX the view's Pitch in radians, 0.56 to 0.62 s after the release's MLH_SpellRelease_event on the caster's clock; the server logs each as "cast 7e8df in hand 1". | CONFIRMED by trace (c1, two runs) | 142746 T15:292, :513, :712 and server.log:1209, :1226, :1302; 152001 T15:536, :913, :1465 and server.log:1466, :1540, :1555 (lab/.cache/drafts/reanimate/read-return-142746.md:45-47, :60-63; read-return-152001.md:121-124); Skyrim.esm SPEL 0x7e8df (ETYP, EFID), EQUP 0x13f45 |
| M2 | The bolt is PROJ 0x75348 ReanimateProjectile: a missile (type 1, kMissile), gravity 0, range 4000, collision radius 10, and in the lab speed 1664 (the winner, MysticismMagic.esp's MAG_ReanimateProjectile; Skyrim.esm's ReanimateProjectile flies 1066). Its path from launch to impact is a straight line from the launch origin. | the records CONFIRMED (Skyrim.esm's DATA, and the winner MysticismMagic.esp's with the same fields but speed 1664, reanimate-fx.md:313; each read in BGSProjectileData's field order, include/RE/B/BGSProjectile.h:13, :44-69, kMissile :34; that the on-disk order matches HYPOTHESIS, by UESP's "Skyrim Mod:Mod File Format/PROJ"); the straight line HYPOTHESIS, which the rows' times do not test: at the winner's 1664 a second 142746's three lines (175.6, 156.5 and 141.9 units) take 106, 94 and 85 ms against the rows' 143, 160 and 147, and 152001's (158.3, 159.5 and 143.7) take 95, 96 and 86 against 185, 197 and 174, 37 to 101 ms longer each (what lies between 44108's row and the flight is unread) | Skyrim.esm and MysticismMagic.esp PROJ 0x75348; lab/.cache/drafts/reanimate-fx.md:293-295, :313; read-return-142746.md:53-59; 152001 T15:536, :541, :913, :934, :1465, :1468 (the times) |
| M3 | The two-handed bolt does not fly the view. It starts at the left hand, 93 to 122 up, 13 to 43 ahead and 4 to 27 left of the caster's feet (in 152001 rising and moving ahead as the pitch steepened, in 142746 about fixed), flies 1.0 to 20.7 degrees shallower than the view while turning onto the crosshair's vertical plane, and comes down on the ground under the crosshair's line at a point that keeps its place in the caster's frame for a given pitch: at -54.79 and -60.88 it landed 135.4 and 114.9 ahead in 142746 and 137.1 and 115.3 ahead in 152001, from origins 6.0 and 28.6 units apart (3.9 and 20.8 of it along the heading). One one-handed spell's bolts flew their launch angles: 20261105-160444's right-hand Firebolt (0x12fd0, castingSource 1) flew within 0.5 to 1.2 degrees of its launch pitch and 0.7 to 1.1 of its heading, aimed 9.7 to 12.8 degrees above level; a one-handed bolt at a raise's downward pitch, Reanimate Corpse's among them, is unread (HYPOTHESIS: it flies the view too). | the rows CONFIRMED by trace (142746, 152001 and 160444, c1); the mechanism HYPOTHESIS: the engine's aim at the projectile's first update (44222, 41248, 44184), toward a fixed point on the crosshair's ground. 142746's fixed-turn fit failed on 152001's rungs 2 and 3; its two aim-point fits held within 3.5 units | 142746 T15:292-296, :513-519, :712-718 (read-return-142746.md:37-44, :68-72, :88-91); 152001 T15:536-542, :913, :934, :1465, :1468 (read-return-152001.md:115-119, :147-154); 160444 frida/c1-lamp-shot-trace-20261105-160444-x-trap-lamp-trigger-20.js.jsonl:7, :11, :79, :80, :84, :86 |
| M4 | A body takes the bolt beyond its reference point: in 152001, rung 1's line passed 29.0 above the reference at the body's distance and struck the body 34.8 past and 10.2 above it (the impact at 150.3 ahead, 3.0 left, 18.7 up; the reference at 115.5 ahead, 1.5 right, 8.5 up; the body lying from its reference toward its head, away and to the left). In 142746 the third bolt, a sphere of radius 10 (M2), came within 4.4 of a body's reference and touched nothing. | the impacts CONFIRMED by trace; which part of the body took the bolt HYPOTHESIS (a limb or the torso; or a contact off the bolt's centre, or a path that bent, against M2's straight line: rung 1's line extended meets the road 189.6 ahead, 30 past the aim-point fit's 159.6, read-return-152001.md:159-160) | 152001 T15:541 (impactHit on 0x13491) and server.log:1294 (the body at rest); 142746 T15 whole (6 impact rows, none on 0x13491); read-return-142746.md:52-56; read-return-152001.md:155-160 |
| M5 | The mouse ladder's counts read as Pitch at about 16.43 counts a degree: dy 650 reads -39.57, dy 800 reads -48.70, and each further 100 about 6.09 more (-45.66 and -51.75 from 650; -54.79 and -60.88 from 800). | the reads CONFIRMED (the player's Pitch graph variable at each rung); that the approach leaves the view level before the first move HYPOTHESIS (the reads fit it) | 142746 and 152001 result.json:448, :526, :604; 075817 steps 136, 142 and 148; read-return-123225.md:59 |
| M6 | From 115 units with the ladder's first rung at 800 counts (Pitch -48.70), Dead Thrall's bolt takes a corpse lying near the caster's level at that first rung: 152001's rung 1 struck Sven, 115.5 ahead and 8.5 up, and stood him. | HYPOTHESIS: one rung-1 hit (152001). The fit it came from, 142746's interpolation, named the second rung (-54.79, passing 0.7 above the reference), not the first; the first rung's line passed 29.0 over the reference and hit through M4's reach. A body lying higher or lower moves the rung (M3, M4) | 152001 T15:536, :541, server.log:1468 (OnSpellHit), :1473 (the stand-up); x-reanimate-return v1.5, lab/.cache/drafts/reanimate/x-reanimate-return-v1.yaml:211 (approach 115), :216 (dy 800); read-return-142746.md:94-99; read-return-152001.md:107-119 |
| M7 | From 80 units the same bolt mostly misses a body lying 10 to 20 units above the caster's feet: the 650-count ladder took one corpse in nine bolts (103005's third rung, a body 33.3 up) and none of the bodies 10.7 and 12.2 up (123225, 075817); the 800-count ladder sent all three bolts over a body 19.45 up to the road behind it (142746). | CONFIRMED (the server's OnSpellHit, or none, in each run; 142746 by trace); why the untraced misses missed HYPOTHESIS (M3's geometry passes them over the body) | the raises table below |

## The raises

The Dead Thrall raises of the x-reanimate probes read so far, each cast by c1 on Sven 0x13491 (a playtest's casts, such as
docs/LOG.md:2774's, carry no geometry and are not in it). "Body" is the reference in c1's frame at the rungs.

| Run | Probe | Approach | Rungs (Pitch) | Body (ahead, right, up) | Body's host | Result | Flight traced |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 20261112-103005 | x-reanimate-return v1.1 | 80 | 650, 750, 850 (-39.57, -45.66, -51.75) | 81, 6.0 degrees right, 33.3 up | c1 (the caster) | hit at rung 3 (server.log:1423, :1424) | no |
| 20261112-123225 | x-reanimate-return v1.3 | 80 | the same | 80.7, dead ahead, 10.7 up | c1 | no hit (no OnSpellHit in server.log) | no |
| 20261112-142746 | x-reanimate-return v1.4 | 80 | 800, 900, 1000 (-48.70, -54.79, -60.88) | 80.0, 0.1, 19.45 | c1 | no hit: three bolts to the road 0x1cd83, 35 to 80 past the body | yes (T15) |
| 20261112-152001 | x-reanimate-return v1.5 | 115 | the same | 115.5, 1.5, 8.5 | c1 | hit at rung 1 (T15:541; server.log:1468, :1473) | yes (T15) |
| 20261113-075817 | x-reanimate-look v1.2 | 80 | 650, 750, 850 (-39.57, -45.66, -51.75) | 80.0, 0.1 left, 12.2 up | c2 (the other seat) | no hit: three casts (server.log:1972, :1999, :2066), no OnSpellHit after :1541 | no |

Sources: read-return-123225.md:59, :134-137 and read-return-142746.md:83 (103005's and 123225's bodies); read-return-142746.md:32-41;
read-return-152001.md:109-119; read-stage-075144-075817.md:172-188 (075817's geometry, steps/137, /143, /149). 075817's is the only
body the other seat hosted.
A body the other seat hosts does take a one-handed bolt: in the same run c1's Reanimate Corpse (0x65bd7) hit Hilde, whom c2 hosted
(075817 server.log:1538-1541). That hosting does not matter to the two-handed bolt is HYPOTHESIS until a v1.3 hit reads it.

## What a probe relies on

- The raise: approach 115, the first rung at dy 800, then +100 and +100 (M6, HYPOTHESIS on one hit), as x-reanimate-return v1.5
  has it. A probe that raises with Dead Thrall states M6 as HYPOTHESIS in its header (ADR-064 amendment C).
- The flight read: lamp-shot-trace.js armed on the caster before the kill, with refs [the body] (x-reanimate-return-v2.1.yaml:138's
  form), so a miss reads as M3's launch and impact rows rather than as silence (CLAUDE.md rule 8).
- Not levers (read-return-142746.md:106-115): closer than 80 needs a steeper view (HYPOTHESIS, by the fixed-turn fit M3 says failed on 152001: about 78 degrees at 60 units, by 142746's
  lines); the body's height is where its ragdoll settles, and no step lifts a body (a hold raises a corpse on its engine,
  ai-world-state.md E25); a one-handed raise may fly the view (M3's one Firebolt; HYPOTHESIS for Reanimate Corpse) but Reanimate Corpse's thrall is timed (the record's 60 s, 075144
  server.log:1531), not the full thrall the return needs.

## Open reads

- Where 075817's three bolts went, and whether they launched (no flight trace ran on c1; read-stage-075144-075817.md:216-218,
  :361). The next raise's lamp-shot trace reads it.
- The aim rule behind M3: a row at 44184 (InitVelocity) with the projectile's position and angles at its first update (its
  arguments unread: an RE question for sky-re), or the cast's flight angles from a pcap (read-return-142746.md:155-158).
- Which part of the body takes the bolt (M4), and whether the caster's hosting of the body matters (the raises table's last row).
