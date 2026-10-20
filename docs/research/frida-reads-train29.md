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
read 0.9685 at the end (result.json step 25); c1's av-read of the figure after the swings: current 96.9496 of base 100
(step 22). Only one of three swings landed in c1's game (one damageActor row; c1's watch self.hits has one entry at
1810 ms on 0xff0008f5 with 0x12eb7), though c2's watch saw all three attackStart events on c1's figure (1292, 4420,
7504 ms). On c2's own seat the attacker-side guard held: c2's health went 100 -> 93.5155 at 1802 ms (trace-c2.json
self.health), the server's number, no local dent from the figure's sword.

The hook point that blocks the local dent: damageActor, 37335, the station where Health was still whole (c1 L6,
healthBefore 100): return before the write when `this` (args[0]) is a figure by the same mark (form id >= 0xFF000000,
attackDamageMult 0), the gate Skyrim Together uses for its local hittee (TE-MAP.md:62), by Address Library id from
lab/addr.py (rule 1). Caveats:
1. 37335's parameters are unsourced (the script's own note). The row shows args[0] the victim and args[2] the attacker
   as actors; args[1] = 0x3 and args[3] = 0x0 are unknown; the float damage rides an XMM register the row could not
   read; ret was 0x0 and its meaning is unknown, so the early return's value is the re-analyst's question, not a guess.
2. Whatever else happens between 37335's entry and the vfunc is inside the gated region. The hit event was raised (c1's
   watch, 1810 ms) 12 ms after the dented sample (1798 ms); whether its dispatch is in 37335's caller after the return
   (safe) or inside 37335 (lost) is not in this trace. figure-values.md's "the hit event, the impact, the blood and the
   stagger come earlier in the chain" was said of the vfunc; for 37335 it is HYPOTHESIS until a run with the gate.
3. The client's own writes (the attacker-null rows) do not pass 37335, so the gate leaves the server's percentage apply
   alone.
4. CoreImpactFramework.dll sits in the chain above 37335 (frame +0x8faed in L4 and L6, a detour of the function that
   returns to SkyrimSE.exe+0x6b806c); a hook at 37335 is below it; nothing interfered here, but it is in the load order.
5. The present guard is not free: it drops the engine's post-write notification for every figure, on the TS write path
   too (inner 0 on all 15 rows). What that notification does is unread (HYPOTHESIS: bleedout and kill checks, hit
   reactions); nothing visible broke. Record it in figure-values.md's Suppress side effects either way. And inner 0
   proves the drop only if Character's original slot entry was the engine's SkyrimSE.exe+0x6b9950; a Character override
   of its own would have made a pass-through invisible to the script. The write preceded the call either way.

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
  HYPOTHESIS, the destroy after the explosion, driven from the same SP-side frame as the launch path; nothing
  shooter-conditioned either way.
- Beside the trace: the server's one OnSpellHit (server.log 09:02:23.702); c2's Health 0.6244 at the until and 0.517 at
  the end (result.json steps 133, 141); FrostSlowFFContact 0xB72A0 from 0xff00096d in c2's own watch at 86833 ms
  (trace-c2.json self.effects). The projectiles series listed 0xFF000AF9 at 440.625 in c2's game for all 31 samples and
  null after the trip (steps 29 to 130, 136); c1's own 0xFF000B25 at 65.625 likewise (steps 28 to 122, 135). Screenshots
  066-c2.png and 131-c2.png: no glyph at the point; 067-c1.png (the caster's view down at the point): a pale haze on the
  ground beside the glowing hand (T4, uncertain).

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
2. c1: no explosionPass row (a sword hit; expected) and no probe rows: 37335 was called once in forty seconds; the quiet
   cell leaves the hooks unexercised beyond the one hit.
3. c1: 14 of 15 handleHealthDamage rows are client writes, not engine hits (A above), the first 181 ms after the hit;
   the guard drops their notifications too.
4. c1: the 2.7-point rise within 50 ms of the dent (the watch) has no row: outside the hooked slot.
5. c2: zero probe rows for any of ten hooks, so the `this` assumption was never tested against a non-matching call; the
   ready self-test passed and every row's type byte is 65 (PGRE), so the layout holds for this rune.
6. c2: the arrival 44163 is called from inside the trigger test on the first tick, 35 ms after a launch with the rune
   born at rest (loc constant, livingTime 0); the settle 43919 never runs; the read's "arrival then settle at the
   landing" is not this rune's sequence.
7. c2: two kills 4 ms apart on two threads for one rune (L124, L126).
8. c2: explosionTimer reads FLT_MAX (3.4028e38) while armed, 0.039 at the last tick after the test's true, -0.126 at the
   kill: the read's "timer at 0.1", roughly.
9. Both: the server logs its record 1.2 to 1.7 s after the client's stamp (hit 08:58:45.634Z against 08:58:47.296; trip
   09:02:22.360Z against 09:02:23.702): HYPOTHESIS, a clock offset between the seats and sky-srv rather than latency;
   mind it when aligning traces to server.log.
10. Raw returns and args whose meaning is unread: c1 37335 ret 0x0 and args[1] 0x3; c2 43934 ret 0x79aa407, 44222 ret
    0x80000001, 44163 ret 0x0.

## Files

Traces and logs: scratchpad/frida-reads/ (c1-figure-dent-trace.js.jsonl, c2-rune-tier-trace.js.jsonl,
x-figure-values-hit-frida/, x-rune-visible-frida/ with server.log, c1.log, c2.log, result.json, trace-c1.json,
trace-c2.json and the screenshots). Sources read: lab/frida/figure-dent-trace.js, lab/frida/rune-tier-trace.js,
lab/.cache/probes/x-figure-values-hit-frida.yaml and x-rune-visible-frida.yaml, docs/research/train-29-rows.md:130-168
and :206-238, docs/verbs/figure-values.md:124-155 and :217-236, docs/verbs/spell-cast.md:1271-1377,
docs/DECISIONS.md:1360-1395, docs/TE-MAP.md:62, fork origin/parity (602a2dd2) Hooks.cpp FigureHealthDamage,
MagicApi.cpp:270-302, FridaHooks.cpp:433-446, skymp5-client sync/movementApply.ts:172-186, sync/actorvalues.ts:32-46,
view/formView.ts:304.
