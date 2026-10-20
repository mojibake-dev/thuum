# Frida reads, train-29: the dent (c1) and the rune tier (c2)

Read-only memo, 2026-10-20. Runs 20261020-085705-x-figure-values-hit-frida and 20261020-085906-x-rune-visible-frida,
both verdict green on their weak asserts; build m2-train-29 client 18c0e603, server image m2-train-29, game 1.6.1170
(result.json build). Traces, logs, result.json, watch traces and three screenshots copied to scratchpad/frida-reads/.
Row citation: "c1 L6" is line 6 of c1-figure-dent-trace.js.jsonl. Every row is in each file twice (the `send()` payload
wrapped as {"type":"send","payload":...} on an odd line, the `console.log` copy on the next even line; lab/frida/README.md:9
says frida-inject prints both), so 34 lines are 17 rows and 126 lines are 63 rows; I cite the even line. Times are the
rows' `t` (the client's clock, UTC). RVAs named below are the scripts' own constants or the rows' frames, nothing new.

## A. The dent (c1, the hitter)

Ready (c1 L2): version 1.6.1170.0, slot 260 (0x104); characterSlot SkyrimPlatformImpl.dll+0x1a6460 and playerSlot
SkyrimPlatformImpl.dll+0x1a6700 (the fork's two thunks), actorSlot SkyrimSE.exe+0x6b9950 (the engine's); all three
replaced; player 0x14, playerHealth 100, playerAttackDamageMult 1; hooks 5. No err row anywhere in the file.

One engine hit in the whole run, 08:58:45.634Z, thread 9788, two rows:
- damageActor (c1 L6, seq 1): args ["0x15f1732fee0","0x3","0x15f1158eab0","0x0"], actors [figure 0xff0008f5, null,
  player 0x14, null], healthBefore 100, healthAfter 93.8338, ret 0x0; frames SkyrimSE.exe+0x6b806c >
  CoreImpactFramework.dll+0x8faed > SkyrimSE.exe+0x6bad1d > 0x6b98bf > 0x657873 > 0x654a70 > skse64_1_6_1170.dll+0x1893c
  > 0x647a01 > 0x6d356f > 0xcf7888 > 0xcf7e51 > 0xcf61da.
- handleHealthDamage (c1 L4, seq 2): via character, at SkyrimPlatformImpl.dll+0x1a6460, victim figure 0xff0008f5,
  attacker player 0x14, damage -6.1662, healthBefore 93.8338, attackDamageMult 0, healthAfter 93.8338, inner 0; frames
  SkyrimSE.exe+0x6b2973 > SkyrimSE.exe+0x666e76 > SkyrimSE.exe+0x6b806c > CoreImpactFramework.dll+0x8faed > (L6's tail).

So yes: the slot-0x104 handler fired with the figure as victim and 0x14 as attacker, once. DamageActor 37335 fired before
it with the same pair: seq 1 against seq 2 (seq is taken at entry; rows emit at leave, which is why L4 precedes L6 in the
file), and the vfunc's second frame SkyrimSE.exe+0x666e76 lies 0x156 past the script's damageActor RVA 0x666d20, so the
vfunc was reached from inside 37335 through one more function (HYPOTHESIS on the function's extent; Ghidra was down).
Health across 37335: 100 at entry, 93.8338 at leave (L6). Health at the vfunc's entry: already 93.8338 = 100 - 6.1662
(L4), and unchanged by the call.

Conclusion: H-a holds, H-b is refuted. The figure test passed at the hit (victim id 0xff0008f5 >= 0xFF000000,
attackDamageMult 0, via the Character thunk: L4), the thunk dropped the engine call (inner 0: no nested entry of the
replaced SkyrimSE.exe+0x6b9950), and the bar still moved, because the number landed between 37335's entry and the vfunc
(L6, then L4). The vfunc is a notification after the write, as ADR-037's caveat allowed (DECISIONS.md:1388-1391).

Every other handleHealthDamage row says the same of the slot: 14 rows (c1 L8 to L34, seq 3 to 16, 08:58:45.815Z to
08:58:59.854Z), victim the figure, attacker null, damages -0.7459, -0.5431, -0.391, -0.2768, -0.1913, -0.1271, -0.0789,
-0.0428, -0.0157, -0.0254, -0.0027, -0.0056, -0.01, -0.0094; healthBefore == healthAfter on each, and each healthBefore
is already net of its own damage (L8 95.7857; L10 95.2426 = 95.7857 - 0.5431; L12 94.8516 = 95.2426 - 0.391; and so on).
Their frames are not an engine hit: SkyrimSE.exe+0x6b2973 > 0x6b2789 > 0x9e7dea > 0x9f8ea4 > 0x143de05 >
SkyrimPlatformImpl.dll+0x1d2809 > ... > SkyrimPlatformImpl.dll+0x1bc074, no 0x666xxx frame and no damageActor row beside
them (37335 was entered once in the window: L6 is the only row and it took the first probe slot with probe false).
HYPOTHESIS: these are the client's own writes, skymp5-client sync/movementApply.ts:172-186 applyHealthPercentage
(damageActorValue of a quarter of the gap to the server's percentage per movement report, k = 0.25; the step ratios
0.73, 0.72, 0.71, 0.69, 0.66, 0.62, 0.54, 0.37 fit a quarter of a gap whose target rises with c2's regeneration) or
sync/actorvalues.ts:32-46 setActorValuePercentage, reaching the slot through the Papyrus native with no attacker. They
are train-29-rows.md:135's "-0.078, -0.042, -0.015" (L20, L22, L24 here), and the watch carries the same series
(trace-c1.json actors[0].health: 93.8338 at 1798 ms, 95.3754 at 1815, 96.5315 at 1847, then 95.7857, 95.2426 ...
94.1189 at 3044, then a climb of about 0.5 per second to 97.08 at 10819). The rise from 93.83 to 96.53 within 50 ms of
the dent has no Frida row: a restore does not pass the damage slot; HYPOTHESIS, a restoreActorValue write from the same
two files, to read in the TS.

Beside the trace: the server took one hit for 6.4960003 (health 1 -> 0.93504 of base 100, server.log 08:58:47.296) and
read 0.9685 at the end (result.json step 25); c1's av-read of the figure afterwards: 96.9496 of base 100 (step 22). One
of three swings landed in c1's game (one damageActor row; c1's watch self.hits once, at 1810 ms on 0xff0008f5 with
0x12eb7) though c2's watch saw three attackStart events on c1's figure (1292, 4420, 7504 ms). On c2's seat the attacker
guard held: c2's health went 100 -> 93.5155 at 1802 ms (trace-c2.json self.health), the server's number, no local dent.

The hook point that blocks the local dent: damageActor, 37335, the station where Health was still whole (c1 L6,
healthBefore 100): return before the write when `this` (args[0]) is a figure by the same mark (form id >= 0xFF000000,
attackDamageMult 0), the gate Skyrim Together uses for its local hittee (TE-MAP.md:62), by Address Library id from
lab/addr.py (rule 1). Caveats:
1. 37335's parameters are unsourced (the script's own note). The row shows args[0] the victim and args[2] the attacker
   as actors; args[1] = 0x3 and args[3] = 0x0 are unknown; the float damage rides an XMM register the row could not
   read; ret was 0x0 and its meaning is unknown, so the early return's value is the re-analyst's question, not a guess.
2. Everything between 37335's entry and the vfunc is inside the gated region. The hit event was raised (c1's watch,
   1810 ms) 12 ms after the dented sample (1798 ms); whether it is dispatched by 37335's caller (safe) or inside 37335
   (lost) is not in this trace. figure-values.md's "earlier in the chain" was said of the vfunc; for 37335, HYPOTHESIS.
3. The client's own writes (the attacker-null rows) do not pass 37335, so the gate leaves the server's percentage apply
   alone.
4. CoreImpactFramework.dll sits in the chain above 37335 (frame +0x8faed in L4 and L6, a detour of the function that
   returns to SkyrimSE.exe+0x6b806c); a hook at 37335 is below it; nothing interfered here, but it is in the load order.
5. The present guard is not free: it drops the engine's post-write notification for every figure, on the TS write path
   too (inner 0 on all 15 rows); what that notification does is unread (HYPOTHESIS: bleedout and kill checks, hit
   reactions), nothing visible broke; record it in figure-values.md's Suppress side effects. And inner 0 proves the drop
   only if Character's original slot entry was the engine's SkyrimSE.exe+0x6b9950; the write preceded the call either way.

## B. The rune (c2, the observer)

Ready (c2 L2): version 1.6.1170.0, hooks 10, offsets {shooter 296, explosion 344, spell 352, livingTime 412,
explosionTimer 424, flags 468}; player 0x14 type 62; handleAt403520 0x100000 resolves to 0x14, IsPlayer true; ref401069
0x1467a0de9e0, IsPlayer true. The compare targets are the player's, as the read says. No err row, no capped row.

The figure's rune, 0xff000af9 (type 65, PGRE), shooter 0xff00096d (figure), shooterHandle 0x10f354, base 0x5fbbf, spell
0x6796f, explosion 0x44089, parentCell 0x9812, in every row that names it:
- launch (L4, seq 1, 09:01:10.088Z): origin [117912.7, -81425.5, 11008.2], frames all in SkyrimPlatformImpl.dll
  (+0x287845 > +0x1b3fe7 > +0x1e8596 > +0x1e831e > +0x1bc074 > +0x1c03bf): the fork's relay (origin/parity
  MagicApi.cpp:270-302, LaunchData from the relayed origin and angles), 262 ms after the figure's MRh_SpellRelease_Event
  performAction (c2.log 02:01:09.826 local).
- runeGate 43934 (L6, seq 2, 09:01:10.101Z): ref401069IsPlayer true, shooterIs401069 false, ret 0x79aa407; flags
  0x20010100; frames SkyrimSE.exe+0x7d800e > 0x7ee7b2 > 0x7e38a3 > 0x646797 > 0x63ead5 > SkyrimPlatformImpl.dll+0x546f00.
  0x7ee7b2 is 0x3d2 past the script's init3D RVA 0x7ee3e0: the gate ran inside Init3D's path at the launch (HYPOTHESIS
  on the extent). addRune 40674: no row at all. The figure's rune was never registered, as the read predicts.
- init3D 44222 (L8, seq 3): flags 0x20010000 at entry, ret 0x80000001, same thread and frames as the gate.
- arrival 44163 (L10, seq 4, 09:01:10.123Z, 35 ms after the launch): livingTime 0, flags 0x20018104, ret 0x0; frames
  SkyrimSE.exe+0x7ee0b3 > 0x7ed952 > 0x7d705f > 0x7e5b74 > 0xcf7888 > 0xcf7e51. 0x7ed952 is 0xa2 past triggerTick 44216
  and 0x7ee0b3 is 0x1c3 past triggerTest 44217: the arrival was reached from the first trigger tick's test on the game's
  update thread, not from a collision (HYPOTHESIS on the extents).
- triggerTest (L12, call 1, ret 0) and triggerTick (L14, call 1, ret 0x0) in the same ms; then every sixtieth tick (L16 to
  L120, calls 60 to 3180, livingTime 1.385 to 70.497): parentCell 0x9812 and explosion 0x44089 non-null throughout,
  explosionTimer 3.4028e38 throughout, flags 0x20018104 throughout, loc never moved from the launch origin.
- impactEffects 44213: NO row. settle 43919: NO row. Bit 20 (0x100000) is clear in every flags value the rune ever
  showed (0x20010000, 0x20010100, 0x20018104, 0x22018004).
- the walk: triggerTest call 3184 ret 1 at livingTime 71.126 (L122, 09:02:22.360Z); kill 44110 (L124, 143 ms later),
  explosionTimer -0.126, lastTick explosionTimer 0.039, frames SkyrimSE.exe+0x7edd18 (0x468 past 44216) > 0x7d705f >
  0x7e5b74 > 0xcf7888: the one kill from the tick the read expected. A second kill (L126, 4 ms later, thread 10720),
  flags 0x22018004, frames SkyrimSE.exe+0x7e364f > 0x7e3166 > 0x646198 > 0x63ead5 > SkyrimPlatformImpl.dll+0x546f00:
  HYPOTHESIS, the destroy after the explosion, from the same SP-side frame as the launch path; not shooter-conditioned.
- Beside the trace: the server's one OnSpellHit (server.log 09:02:23.702); c2's Health 0.6244 at the until and 0.517 at
  the end (result.json steps 133, 141); FrostSlowFFContact 0xB72A0 from 0xff00096d in c2's own watch at 86833 ms
  (trace-c2.json self.effects). The projectiles series listed 0xFF000AF9 at 440.625 in c2's game for all 31 samples and
  null after the trip (steps 29 to 130, 136); c1's own 0xFF000B25 at 65.625 likewise (steps 28 to 122, 135). Screenshots
  066-c2.png, 131-c2.png: no glyph at the point; 067-c1.png (the caster's view down): a pale haze by the hand (T4).

Did the tier compare fire for the figure's rune? No. 44213 was never entered during the trace, for this rune or for
anything else: the script emits the first three non-matching calls of every hook as probe rows and there are none, so no
call reached the hooked address in two minutes. What the compare would have seen is an inference only: shooterHandle
0x10f354 (L6) against *(403520) 0x100000 (L2), unequal, tier 0xC by the read.

Conclusion: the observer's game granted the figure's rune no tier at all, because the landing's look (43919, 44213)
never ran. "Armed but undressed" is literally what the rows show, but H3b's mechanism (the tier) is not it: nothing was
dressed and then undressed, and nothing removed it (no kill before the trip; 3185 ticks with non-null cell and
explosion). The look is skipped upstream of 44213, the script header's third outcome ("if 44213 never runs for the
figure's rune, the landing's look is skipped earlier"). The relayed origin is not the discriminator: c1's own engine
launched its rune from the same point (trace-c1.json self.launches: origin 117912.68, -81425.49, 11008.23, pitch 1.0472,
against c1's feet at 117899.98, -81480, 10996.74; FridaHooks.cpp:433-446 reads LaunchData at Launch's entry), so a rune
is born at its point in both games, and the player's shows a glyph (T4). HYPOTHESIS for the branch: a shooter test, or
an arrival-path condition, before the look; the arrival's ret 0x0 and init3D's ret 0x80000001 are the raw values to set
against the caster's.

The hook shape that follows: none yet. A tier override at 44213 has nothing to override here. The next read, rule 8,
before any hook: the same script on the CASTER's seat (c1) for its own rune in the same probe. If 44213 and 43919 fire
there, their rows' frames name the caller and the branch the figure's rune misses, and "what to make the compare see"
becomes a question about that caller (the player's handle at *(403520) in place of the figure's shooter handle, or
whatever the branch tests), filtered in native on a dynamic-form shooter (rule 9). If they do not fire for the player's
rune either, the glyph does not come from 44213 and the REA model is wrong; 44222's model path (it ran here, ret
0x80000001) is next, as the script header says. Caveats: the hook's liveness at the 44213 RVA is unproven in this run
(no control landed anything); the per-figure rune cap the read asked for is still wanted (40674 never fired for the
figure, so four casts would leave four armed runes in the observer's game).

## C. Unexpected

1. Doubled rows: every row twice (send payload and console.log copy), documented (README.md:9); halve the line count.
2. c1: no explosionPass row (a sword hit; expected) and no probe rows, 37335 being called once in forty seconds; 14 of
   15 handleHealthDamage rows are client writes, not engine hits (A above), the first 181 ms after the hit, and the
   guard drops their notifications too; the 2.7-point rise within 50 ms of the dent (the watch) has no row at all.
3. c2: zero probe rows for any of ten hooks, so the `this` assumption was never tested against a non-matching call; the
   ready self-test passed and every row's type byte is 65 (PGRE), so the layout holds for this rune.
4. c2: the arrival 44163 is called from inside the trigger test on the first tick, 35 ms after a launch with the rune
   born at rest (loc constant, livingTime 0); the settle 43919 never runs; the read's "arrival then settle at the
   landing" is not this rune's sequence. Two kills 4 ms apart on two threads for one rune (L124, L126).
5. c2: explosionTimer reads FLT_MAX (3.4028e38) while armed, 0.039 at the last tick after the test's true, -0.126 at the
   kill: the read's "timer at 0.1", roughly.
6. Both: the server logs its record 1.2 to 1.7 s after the client's stamp (hit 08:58:45.634Z against 08:58:47.296; trip
   09:02:22.360Z against 09:02:23.702): HYPOTHESIS, a clock offset between the seats and sky-srv rather than latency.
7. Raw returns and args unread: c1 37335 ret 0x0 and args[1] 0x3; c2 43934 ret 0x79aa407, 44222 ret 0x80000001, 44163
   ret 0x0.

## D. Second read, both seats (run 20261020-092130-x-rune-visible-frida2)

Same stage and clones (build m2-train-29 client 18c0e603, result.json), verdict green; artifacts under
scratchpad/frida-reads/frida2/. "c1 L4" is line 4 of frida2/c1-rune-tier-trace.js.jsonl (92 lines, 46 rows), "c2 L4" of
frida2/c2-rune-tier-trace.js.jsonl (148 lines, 74 rows); even lines cited as before. Function extents below are bounded by
the next Address Library id (lab/addr.py addrlib 1.6.1170: 43934 0x7d7c40 to 43935 0x7d7cf0; 44216 0x7ed8b0, 44217
0x7edef0, 44218 0x7ee270; 44222 0x7ee3e0 to 44223 0x7eeb90; 34452 0x5bfd60). Ready rows (c1 L2, c2 L2): hooks 10,
handleAt403520 0x100000 resolving to 0x14 and IsPlayer true, ref401069IsPlayer true on both seats; no err or capped row.

(1) The caster's own rune, c1: 0xff000d16 (PGRE), shooter 0x14, shooterHandle 0x100000, base 0x5fbbf, spell 0x6796f,
explosion 0x44089, cell 0x9812 in every row.
- launch (c1 L4, 09:23:28.849Z): origin [117912.1, -81425.5, 11008.8], frames SkyrimSE.exe+0x5c00b9 > 0x5bd0e8 > 0x5bbe29
  > 0x7b7c1e > skse64_1_6_1170.dll+0xd6a6 > 0x6b19b9: the engine's own cast path (0x5c00b9 is 0x359 past 34452 at 0x5bfd60
  and before 34453 at 0x5c02e0, so inside the target-location launch target-location.md:18 names).
- 43919 settle: NO row. 44213 impact-effects: NO row, and no probe row for either, so neither address was entered for
  anything in the trace. The tier compare never ran for the player's rune; what it would have seen, inference only:
  shooterHandle 0x100000 == *(403520) 0x100000, equal true, tierByDoc "0 or 4". The read's "once per landing" bit 20,
  kAddedVisualEffectOnGround (CommonLibSSE-NG include/RE/P/Projectile.h:156), is clear in every flags value of both runes.
- addRune 40674 (c1 L6, 60 ms after the launch): args [0x151320eebb0, 0x151d2ac5360, 0x7ff7d7b77cc0, 0x11edaff988], forms
  [player 0x14, the projectile 0xff000d16, none, none]; args[0] equals ref401069 (the player's pointer), proj flags
  0x210100; frames SkyrimSE.exe+0x7d7cb3 (inside 43934, +0x73) > 0x7d800e (a caller past 43934's end) > 0x7ee7b2 (inside
  Init3D 44222) > 0x7e38a3 > 0x646797 > 0x63ead5 > SkyrimPlatformImpl.dll+0x546f00 > 0x153bb8e.
- runeGate 43934 (c1 L8): shooterIs401069 true, ref401069IsPlayer true, ret 0x405 (the figure's: 0x79a7c07 here, c2 L6;
  0x79aa407 in B), same frames from 0x7d800e on. The gate passed and registered the player's rune from Init3D's path at
  the launch, as the read predicts.
- init3D 44222 (c1 L10): flags 0x210000 at entry, ret 0x80000001, the same return as the figure's (c2 L8).

(2) The caster's arrival 44163 (c1 L12): 09:23:28.939Z, 90 ms after the launch (the figure's: 36 ms, c2 L10), livingTime
0, ret 0x0, flags 0x218104, frames SkyrimSE.exe+0x7ee137 > 0x7ed952 > 0x7d705f > 0x7e5b74 > 0xcf7888 > 0xcf7e51: from the
first trigger tick's test on the update thread, as on the observer (c2 L10: 0x7ee0b3 > 0x7ed952 > the same), not a
collision path. Both call sites lie inside 44217 (0x7edef0 to 0x7ee270): the player's rune arrives from +0x247, the
figure's from +0x1c3 (this run c2 L10 and run 1 c2 L10 alike). Neither rune moved: the caster's loc equals its launch
origin in every row (c1 L6 to L92), the relayed one's likewise (c2 L4 origin [117912.1, -81425.5, 11008.8], loc the same
in c2 L6 to L148). Both are born at rest at the same point; velocity is excluded as the discriminator.

(3) First divergence. The launch frames differ by construction (engine cast path, c1 L4; the relay's six
SkyrimPlatformImpl.dll frames, c2 L4). The first engine-side difference is the runtime flags at Init3D's ENTRY, before
the gate and the registration run: 0x210000 on the player's rune (c1 L10) against 0x20010000 on the figure's (c2 L8),
bit 21 against bit 29, with bits 8, 16, 15, 2 and 25 added identically afterwards (gate 0x210100 vs 0x20010100; arrival
and every tick 0x218104 vs 0x20018104; second kill 0x2218004 vs 0x22018004). CommonLibSSE-NG names them: kAutoAim =
1 << 21 and kUseOrigin = 1 << 29 (Projectile.h:157, :165), the flags of LaunchData's autoAim and useOrigin (:104, :106).
The two LaunchData builders set them oppositely: CommonLib's base constructor defaults autoAim true, useOrigin false
(src/RE/P/Projectile.cpp:204, :206); the spell constructor the relay calls at MagicApi.cpp:296 flips both
(Projectile.cpp:220-221, useOrigin = true, autoAim = false); the engine's own cast path keeps autoAim and not useOrigin
(c1 L10). Downstream divergences: the gate's return (0x405 vs 0x79a7c07), the registration (player only), the arrival's
call site in 44217 (+0x247 vs +0x1c3). The rows exclude velocity (both at rest), the registration as the flag's cause
(bit 21 is there at Init3D's entry, before the gate), and any shooter-conditioned station other than the gate (nothing
else that fired reads the shooter). What they suggest decides it, HYPOTHESIS: Launch 44108 copies the two booleans into
the flags and 44217 branches on one of them (or on the shooter) at the arrival; the player's branch (+0x247) is the one
that dresses the rune, the glyph being the only visible difference and these the only state differences before the tick.

(4) Stability: the observer's rune repeats B row for row. Launch from the relay (c2 L4, origin equal to the caster's),
gate shooterIs401069 false from Init3D's path (c2 L6), init3D ret 0x80000001 (c2 L8), arrival from +0x1c3 at livingTime 0
(c2 L10), no 44213, no 43919, no addRune, flags 0x20010100 / 0x20010000 / 0x20018104 / 0x22018004, 3865 ticks with
non-null cell and explosion, test true at call 3864 (c2 L144), one kill from the tick (c2 L146, explosionTimer -0.107)
and a second 4 ms later (c2 L148). Lab side: c2 listed 0xFF000D13 at 440.625 for all 31 samples and null after the trip,
c1 its own 0xFF000D16 at 65.625; server OnSpellHit 09:24:47.428; c2's Health 0.5007 at the until, 0.5183 at the end
(steps 134, 142). Screenshots 067-c2.png, 132-c2.png: bare ground at the point; 036-c1.png: a pale frost haze (T4, as B).

Conclusion for the hook shape, all HYPOTHESIS and tied to rows:
- H-D1: the glyph is not 44213's and not 43919's: neither fired for the PLAYER's rune in 77 s (c1: no rows, no probes)
  while the caster's game shows the frost at the point (T4). The REA read's "impact-effects pass once per landing" does
  not describe a rune born at rest; a tier override at 44213 is dead for runes. Caveat: 44213 and 43919 fired for nothing
  in either process, so their liveness at those RVAs is unproven; a non-rune impact in a later trace settles that.
- H-D2: the branch the figure's rune misses is 44217's arrival site (+0x247 player, +0x1c3 figure; c1 L12 vs c2 L10),
  decided before the first tick by state that differs only in kAutoAim against kUseOrigin (c1 L10 vs c2 L8), set by the
  relay's LaunchData constructor (Projectile.cpp:220-221).
- The shape that follows, lazy first, no engine hook: in MagicApi.cpp after line 296, for the relayed target-location
  launch, set launchData.autoAim = true and launchData.useOrigin = false, the engine's own values through CommonLib's
  named fields (Projectile.h:104, :106), and rerun x-rune-visible-frida2: pass if c2's rune carries bit 21, arrives from
  +0x247 and the glyph shows in c2's screenshots; one run proves or kills H-D2. Caveats: useOrigin false may make Launch
  ignore the relayed origin and fire from the figure's node (the arrow relay leans on useOrigin,
  PapyrusTESModPlatform.cpp:1077-1080); against that, the engine's own rune has useOrigin false and was still born at the
  aimed point (c1 L4 origin equals its loc), so a target-location delivery honors the origin without it (HYPOTHESIS: the
  delivery decides). Lightning Strike's relayed lobber (row 4) shares this constructor, so scope the change to runes or
  measure the lobber too. If the flags change nothing, the branch is the shooter's and the override belongs at 44217 for
  a dynamic-form shooter (rule 9), after the re-analyst reads 44217 at +0x1c3 and +0x247. The per-figure rune cap stays
  wanted (40674 fired for the player's rune alone, c1 L6).

Unexpected in D: (a) the caster's own rune was tripped in c1's game by c2's figure walking through (c1 L88, call 2142
ret 1 at 09:24:45.985Z, 87 ms after c2's own trip; kills c1 L90, L92 from the same two sites as c2's): each game trips
its own instance and the server takes the one claim from c2's game (server.log 09:24:47.428, 1.4 s after c2's kill
stamp, C.6's offset again); (b) two kills on both seats (c1 L90/L92, c2 L146/L148); (c) the gate's return differs by
shooter (0x405 player; 0x79a7c07, 0x79aa407 figure), unread; (d) 40674's args[2], args[3] are not forms, signature unread.

## Files

Traces and logs: scratchpad/frida-reads/ (c1-figure-dent-trace.js.jsonl, c2-rune-tier-trace.js.jsonl,
x-figure-values-hit-frida/, x-rune-visible-frida/, frida2/ with server.log, c1.log, c2.log, result.json, watch traces
where fetched, and the screenshots). Sources read: lab/frida/figure-dent-trace.js, lab/frida/rune-tier-trace.js,
lab/.cache/probes/x-figure-values-hit-frida.yaml and x-rune-visible-frida.yaml, docs/research/train-29-rows.md:130-168
and :206-238, docs/verbs/figure-values.md:124-155 and :217-236, docs/verbs/spell-cast.md:1271-1377,
docs/DECISIONS.md:1360-1395, docs/TE-MAP.md:62, docs/research/apocalypse/target-location.md:18, fork origin/parity
(602a2dd2) Hooks.cpp FigureHealthDamage, MagicApi.cpp:270-302, FridaHooks.cpp:433-446,
PapyrusTESModPlatform.cpp:1074-1105, skymp5-client sync/movementApply.ts:172-186, sync/actorvalues.ts:32-46,
view/formView.ts:304, CommonLibSSE-NG include/RE/P/Projectile.h:78-107 and :133-166, src/RE/P/Projectile.cpp:179-222,
lab/addr.py addrlib 1.6.1170 for ids 34452, 34453, 43934, 43935, 44216 to 44218, 44222, 44223.
